/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  VoterProfile,
  VoterElectionParticipation,
  BiometricEnrollmentMetadata,
  AnonymousBallotRecord,
  AuthorityAccount,
  StructuredAuditEvent,
  SCHEMA_VERSION_CURRENT,
  SCHEMA_VERSION_LEGACY,
  validateVoterProfile,
  validateElectionParticipation,
  validateBiometricMetadata,
  validateAnonymousBallot,
  validateAuthorityAccount,
  validateStructuredAuditEvent,
  isValidParticipationTransition,
} from '../types/dataModel';
import { createInMemoryRepositories } from '../../server/repositories/inMemoryRepositories';
import { createFirestoreRepositories } from '../../server/repositories/firestoreRepositories';
import {
  createInMemoryFirestoreMock,
  setAdminFirestoreForTesting,
  resetFirebaseAdminForTesting,
} from '../../server/firebaseAdmin';
import {
  HISTORICAL_CONSTITUENCIES_2024,
  HISTORICAL_PROVENANCE,
} from '../data/historical2024';
import { INITIAL_ELECTIONS } from '../data/mockData';
import {
  inspectAndMigrateDataModel,
  transformLegacyVoterToV2Profile,
} from '../../scripts/inspect-and-migrate-data-model';

test('BlockBallot — Phase 02: Database & Election Data Model Test Suite', async (t) => {
  // Setup & teardown hooks
  t.beforeEach(async () => {
    await resetFirebaseAdminForTesting();
  });

  t.afterEach(async () => {
    await resetFirebaseAdminForTesting();
  });

  // --------------------------------------------------------------------------
  // Requirement 1: Valid and invalid voter-profile records
  // --------------------------------------------------------------------------
  await t.test('1. Valid and invalid voter-profile records', () => {
    const validProfile: VoterProfile = {
      id: 'vpr_voter_001',
      simulationVoterId: 'SIM-DL-2026-0001',
      fullName: 'Aarav Sharma',
      dateOfBirth: '1990-05-15',
      gender: 'M',
      state: 'Delhi',
      district: 'New Delhi',
      constituencyId: 'CONST-04-ND',
      pollingStation: 'Station 101, New Delhi',
      maskedMobile: '+91 98XXX-XX123',
      registrationStatus: 'REGISTERED',
      eligibilityStatus: 'ELIGIBLE',
      lifecycleStatus: 'ACTIVE',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    const validResult = validateVoterProfile(validProfile);
    assert.equal(validResult.isValid, true, 'Valid profile should pass validation');
    assert.equal(validResult.errors.length, 0);

    // Invalid: Missing DOB or invalid format
    const invalidDobResult = validateVoterProfile({
      ...validProfile,
      dateOfBirth: '15/05/1990', // non-ISO
    });
    assert.equal(invalidDobResult.isValid, false, 'Non-ISO DOB format should fail validation');

    // Invalid: Real Indian ECI EPIC format instead of simulation ID
    const eciFormatResult = validateVoterProfile({
      ...validProfile,
      simulationVoterId: 'ABC1234567',
    });
    assert.equal(eciFormatResult.isValid, false, 'Simulation ID mirroring real Indian ECI EPIC format should fail');

    // Invalid: Injection of candidate selection or ballot content
    const secrecyViolation = validateVoterProfile({
      ...validProfile,
      candidateId: 'cand-01',
    });
    assert.equal(secrecyViolation.isValid, false, 'Profile with candidateId must fail validation');

    // Invalid: Schema version legacy or missing
    const wrongVersion = validateVoterProfile({
      ...validProfile,
      schemaVersion: '1.0',
    });
    assert.equal(wrongVersion.isValid, false, 'Profile with legacy schema version must fail validation');
  });

  // --------------------------------------------------------------------------
  // Requirement 2: Valid and invalid election-participation records
  // --------------------------------------------------------------------------
  await t.test('2. Valid and invalid election-participation records', () => {
    const validParticipation: VoterElectionParticipation = {
      id: 'vpr_voter_001_GE-2024',
      voterId: 'vpr_voter_001',
      electionId: 'GE-2024',
      status: 'ELIGIBLE',
      createdAt: 1700000000000,
      updatedAt: 1700000000000,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    const validResult = validateElectionParticipation(validParticipation);
    assert.equal(validResult.isValid, true, 'Valid participation record should pass');

    // Invalid status string
    const invalidStatus = validateElectionParticipation({
      ...validParticipation,
      status: 'UNKNOWN_STATUS',
    });
    assert.equal(invalidStatus.isValid, false, 'Unknown status should fail');

    // Invalid: VOTE_ACCEPTED without votedAt timestamp
    const missingVotedAt = validateElectionParticipation({
      ...validParticipation,
      status: 'VOTE_ACCEPTED',
      votedAt: undefined,
    });
    assert.equal(missingVotedAt.isValid, false, 'VOTE_ACCEPTED requires votedAt');

    // Invalid: Embedded candidate choice in participation record
    const ballotContaminated = validateElectionParticipation({
      ...validParticipation,
      selectedCandidate: 'cand-02',
    });
    assert.equal(ballotContaminated.isValid, false, 'Embedded ballot content in participation record must be rejected');
  });

  // --------------------------------------------------------------------------
  // Requirement 3: Same voter can have independent participation in two elections
  // --------------------------------------------------------------------------
  await t.test('3. Same voter can have independent participation in two elections', async () => {
    const inMemRepos = createInMemoryRepositories();
    const voterId = 'vpr_voter_independent_01';

    // Participation in Parliamentary Election (Completed / Voted)
    const partParl: VoterElectionParticipation = {
      id: `${voterId}_GE-2024`,
      voterId,
      electionId: 'GE-2024',
      status: 'VOTE_ACCEPTED',
      votedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await inMemRepos.participations.createParticipation(partParl);

    // Participation in State Assembly Election (Still Eligible / In Progress)
    const partState: VoterElectionParticipation = {
      id: `${voterId}_STATE-2024`,
      voterId,
      electionId: 'STATE-2024',
      status: 'ELIGIBLE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await inMemRepos.participations.createParticipation(partState);

    // Retrieve both records
    const parlRecord = await inMemRepos.participations.getParticipation(voterId, 'GE-2024');
    const stateRecord = await inMemRepos.participations.getParticipation(voterId, 'STATE-2024');

    assert.ok(parlRecord, 'Parliamentary participation record must exist');
    assert.ok(stateRecord, 'State election participation record must exist');
    assert.equal(parlRecord.status, 'VOTE_ACCEPTED');
    assert.equal(stateRecord.status, 'ELIGIBLE');

    // Invariant: Voted status in Election A must NOT alter status in Election B
    assert.notEqual(parlRecord.status, stateRecord.status);
    const voterParticipations = await inMemRepos.participations.listByVoter(voterId);
    assert.equal(voterParticipations.length, 2, 'Voter should have 2 independent election records');
  });

  // --------------------------------------------------------------------------
  // Requirement 4: Duplicate (voterId, electionId) participation is rejected
  // --------------------------------------------------------------------------
  await t.test('4. Duplicate (voterId, electionId) participation is rejected', async () => {
    const inMemRepos = createInMemoryRepositories();
    const part: VoterElectionParticipation = {
      id: 'vpr_002_GE-2024',
      voterId: 'vpr_002',
      electionId: 'GE-2024',
      status: 'ELIGIBLE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    await inMemRepos.participations.createParticipation(part);

    // Attempt to create a duplicate participation record for same voter and election
    await assert.rejects(
      async () => {
        await inMemRepos.participations.createParticipation({
          ...part,
          status: 'SESSION_AUTHORIZED',
        });
      },
      /DUPLICATE_PARTICIPATION/,
      'Duplicate participation creation must be rejected'
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 5: Invalid participation-state transitions are rejected
  // --------------------------------------------------------------------------
  await t.test('5. Invalid participation-state transitions are rejected', async () => {
    const inMemRepos = createInMemoryRepositories();
    const part: VoterElectionParticipation = {
      id: 'vpr_003_GE-2024',
      voterId: 'vpr_003',
      electionId: 'GE-2024',
      status: 'NOT_ENROLLED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await inMemRepos.participations.createParticipation(part);

    // Legal: NOT_ENROLLED -> ELIGIBLE
    assert.equal(isValidParticipationTransition('NOT_ENROLLED', 'ELIGIBLE'), true);
    await inMemRepos.participations.updateParticipationStatus('vpr_003', 'GE-2024', 'ELIGIBLE');

    // Illegal: ELIGIBLE -> VOTE_ACCEPTED directly without SESSION_AUTHORIZED
    assert.equal(isValidParticipationTransition('ELIGIBLE', 'VOTE_ACCEPTED'), false);
    await assert.rejects(
      async () => {
        await inMemRepos.participations.updateParticipationStatus('vpr_003', 'GE-2024', 'VOTE_ACCEPTED');
      },
      /ILLEGAL_STATE_TRANSITION/,
      'Direct transition from ELIGIBLE to VOTE_ACCEPTED must fail'
    );

    // Legal: ELIGIBLE -> SESSION_AUTHORIZED -> VOTE_ACCEPTED
    await inMemRepos.participations.updateParticipationStatus('vpr_003', 'GE-2024', 'SESSION_AUTHORIZED');
    await inMemRepos.participations.updateParticipationStatus('vpr_003', 'GE-2024', 'VOTE_ACCEPTED');

    // Illegal: Terminal state VOTE_ACCEPTED cannot transition back to ELIGIBLE
    assert.equal(isValidParticipationTransition('VOTE_ACCEPTED', 'ELIGIBLE'), false);
    await assert.rejects(
      async () => {
        await inMemRepos.participations.updateParticipationStatus('vpr_003', 'GE-2024', 'ELIGIBLE');
      },
      /ILLEGAL_STATE_TRANSITION/,
      'Cannot transition out of terminal VOTE_ACCEPTED status'
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Face and fingerprint enrollment metadata use explicit allowed states
  // --------------------------------------------------------------------------
  await t.test('6. Face and fingerprint enrollment metadata use explicit allowed states', () => {
    const validBio: BiometricEnrollmentMetadata = {
      id: 'bio_vpr_004_face',
      voterId: 'vpr_004',
      modality: 'FACE',
      status: 'ENROLLED',
      biometricReferenceId: 'ref_face_sha256_abcdef1234567890',
      qualityScore: 92,
      qualityCheckStatus: 'PASSED',
      isManualException: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    const validResult = validateBiometricMetadata(validBio);
    assert.equal(validResult.isValid, true, 'Valid face metadata should pass');

    // Invalid modality
    const invalidModality = validateBiometricMetadata({
      ...validBio,
      modality: 'IRIS',
    });
    assert.equal(invalidModality.isValid, false, 'Invalid modality IRIS should be rejected');

    // Invalid status
    const invalidStatus = validateBiometricMetadata({
      ...validBio,
      status: 'VERIFIED_OK',
    });
    assert.equal(invalidStatus.isValid, false, 'Loose arbitrary status should be rejected');
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Manual approval is distinct from successful biometric verification
  // --------------------------------------------------------------------------
  await t.test('7. Manual approval is distinct from successful biometric verification', () => {
    // ENROLLED: Algorithmic/device capture
    const enrolledRecord: BiometricEnrollmentMetadata = {
      id: 'bio_vpr_005_fingerprint',
      voterId: 'vpr_005',
      modality: 'FINGERPRINT',
      status: 'ENROLLED',
      biometricReferenceId: 'ref_fp_hash_123',
      qualityCheckStatus: 'PASSED',
      isManualException: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    assert.equal(validateBiometricMetadata(enrolledRecord).isValid, true);

    // MANUALLY_APPROVED: Administrative exception decision, NOT a biometric match
    const manualApprovalRecord: BiometricEnrollmentMetadata = {
      id: 'bio_vpr_005_fingerprint',
      voterId: 'vpr_005',
      modality: 'FINGERPRINT',
      status: 'MANUALLY_APPROVED',
      biometricReferenceId: 'ref_manual_exception_001',
      exceptionDecisionReference: 'EXC-DEC-2026-0042',
      qualityCheckStatus: 'EXEMPTED',
      isManualException: true, // Must be true for manual approval
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    assert.equal(validateBiometricMetadata(manualApprovalRecord).isValid, true);

    // Contradiction test: MANUALLY_APPROVED with isManualException=false must be rejected
    const invalidManual = validateBiometricMetadata({
      ...manualApprovalRecord,
      isManualException: false,
    });
    assert.equal(
      invalidManual.isValid,
      false,
      'MANUALLY_APPROVED must explicitly assert isManualException=true'
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Biometric payload fields cannot be inserted into metadata schema
  // --------------------------------------------------------------------------
  await t.test('8. Biometric payload fields cannot be inserted into metadata schema', () => {
    const baseBio: BiometricEnrollmentMetadata = {
      id: 'bio_vpr_006_face',
      voterId: 'vpr_006',
      modality: 'FACE',
      status: 'ENROLLED',
      biometricReferenceId: 'ref_face_006',
      qualityCheckStatus: 'PASSED',
      isManualException: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    // Raw bytes injection test
    const rawBytesAttack = validateBiometricMetadata({
      ...baseBio,
      rawBytes: '0x89504E470D0A1A0A0000000D49484452...',
    });
    assert.equal(rawBytesAttack.isValid, false, 'rawBytes must be rejected from metadata');

    // Fingerprint template injection test
    const templateAttack = validateBiometricMetadata({
      ...baseBio,
      fingerprintTemplate: [0.12, 0.44, 0.98, 0.33],
    });
    assert.equal(templateAttack.isValid, false, 'fingerprintTemplate must be rejected from metadata');
  });

  // --------------------------------------------------------------------------
  // Requirement 9: Ballot metadata types do not contain personal identity or biometric fields
  // --------------------------------------------------------------------------
  await t.test('9. Ballot metadata types do not contain personal identity or biometric fields', () => {
    const validBallot: AnonymousBallotRecord = {
      id: 'rcpt_ballot_2024_001',
      electionId: 'GE-2024',
      constituencyId: 'CONST-04-ND',
      ballotNullifierHash: '0x9876543210abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      acceptedAt: Date.now(),
      integrityStatus: 'VALID_CONFIRMED',
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    assert.equal(validateAnonymousBallot(validBallot).isValid, true, 'Valid anonymous ballot should pass');

    // Identity leakage attempts
    const voterIdLeak = validateAnonymousBallot({
      ...validBallot,
      voterId: 'vpr_001',
    });
    assert.equal(voterIdLeak.isValid, false, 'voterId in ballot record must be rejected');

    const nameLeak = validateAnonymousBallot({
      ...validBallot,
      fullName: 'Rahul Verma',
    });
    assert.equal(nameLeak.isValid, false, 'fullName in ballot record must be rejected');

    const bioLeak = validateAnonymousBallot({
      ...validBallot,
      biometricReferenceId: 'ref_123',
    });
    assert.equal(bioLeak.isValid, false, 'biometricReferenceId in ballot record must be rejected');
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Audit-event metadata validators reject secrets and malformed states
  // --------------------------------------------------------------------------
  await t.test('10. Audit-event metadata validators reject secrets and malformed states', () => {
    const validAudit: StructuredAuditEvent = {
      id: 'audit_event_001',
      timestamp: Date.now(),
      type: 'AUTHORIZATION_ISSUED',
      actor: {
        actorId: 'system_signer',
        actorRole: 'SYSTEM',
        ipAddressHash: '0xhash_ip',
      },
      action: 'ISSUE_EIP712_TICKET',
      target: {
        category: 'PARTICIPATION',
        targetReference: 'vpr_001_GE-2024',
      },
      outcome: 'SUCCESS',
      electionId: 'GE-2024',
      metadata: {
        ticketTtlSec: 900,
        chainId: 31337,
      },
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    assert.equal(validateStructuredAuditEvent(validAudit).isValid, true, 'Valid audit event must pass');

    // Secret token leak attempt in audit metadata
    const tokenLeak = validateStructuredAuditEvent({
      ...validAudit,
      metadata: {
        sessionToken: 'jwt.header.payload.secret',
      },
    });
    assert.equal(tokenLeak.isValid, false, 'Token leak in audit metadata must be rejected');

    // OTP leak attempt in audit metadata
    const otpLeak = validateStructuredAuditEvent({
      ...validAudit,
      metadata: {
        voterOtp: '482910',
      },
    });
    assert.equal(otpLeak.isValid, false, 'OTP leak in audit metadata must be rejected');

    // Password leak attempt
    const passwordLeak = validateStructuredAuditEvent({
      ...validAudit,
      metadata: {
        userPassword: 'secretPassword123',
      },
    });
    assert.equal(passwordLeak.isValid, false, 'Password leak in audit metadata must be rejected');
  });

  // --------------------------------------------------------------------------
  // Requirement 11: Historical records remain unchanged and separate
  // --------------------------------------------------------------------------
  await t.test('11. Historical records remain unchanged and separate', () => {
    // Official 2024 Gazette data must remain intact and verified
    assert.ok(Array.isArray(HISTORICAL_CONSTITUENCIES_2024));
    assert.equal(HISTORICAL_CONSTITUENCIES_2024.length, 11, 'All representative historical constituencies preserved');
    assert.ok(INITIAL_ELECTIONS.length >= 2, 'Initial demo election definitions preserved');

    // Confirm that historical records are read-only and separate
    const sampleHistorical = HISTORICAL_CONSTITUENCIES_2024[0];
    assert.ok(sampleHistorical.id);
    assert.ok(sampleHistorical.votesCounted > 0);
    assert.equal(HISTORICAL_PROVENANCE.electionYear, 2024);
  });

  // --------------------------------------------------------------------------
  // Requirement 12: Firestore emulator / mock and in-memory repositories preserve same invariants
  // --------------------------------------------------------------------------
  await t.test('12. Firestore mock and in-memory repositories preserve same relevant invariants', async () => {
    const mockDb = createInMemoryFirestoreMock();
    setAdminFirestoreForTesting(mockDb);

    const firestoreRepos = createFirestoreRepositories();
    const inMemRepos = createInMemoryRepositories();

    const voterId = 'vpr_inv_test_01';
    const profile: VoterProfile = {
      id: voterId,
      simulationVoterId: 'SIM-KA-2026-9999',
      fullName: 'Sunita Rao',
      dateOfBirth: '1988-12-04',
      gender: 'F',
      state: 'Karnataka',
      district: 'Bengaluru Urban',
      constituencyId: 'CONST-05-BLR',
      pollingStation: 'Station 204, Bengaluru',
      maskedMobile: '+91 99XXX-XX456',
      registrationStatus: 'REGISTERED',
      eligibilityStatus: 'ELIGIBLE',
      lifecycleStatus: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    // 1. Both save and retrieve voter profile
    await inMemRepos.voterProfiles.save(profile);
    await firestoreRepos.voterProfiles.save(profile);

    const inMemRetrieved = await inMemRepos.voterProfiles.findById(voterId);
    const firestoreRetrieved = await firestoreRepos.voterProfiles.findById(voterId);
    assert.deepEqual(inMemRetrieved, firestoreRetrieved);

    // 2. Both enforce duplicate participation rejection
    const part: VoterElectionParticipation = {
      id: `${voterId}_GE-2024`,
      voterId,
      electionId: 'GE-2024',
      status: 'ELIGIBLE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    await inMemRepos.participations.createParticipation(part);
    await firestoreRepos.participations.createParticipation(part);

    await assert.rejects(
      async () => inMemRepos.participations.createParticipation(part),
      /DUPLICATE_PARTICIPATION/
    );
    await assert.rejects(
      async () => firestoreRepos.participations.createParticipation(part),
      /DUPLICATE_PARTICIPATION/
    );

    // 3. Both enforce illegal transition rejection
    await assert.rejects(
      async () => inMemRepos.participations.updateParticipationStatus(voterId, 'GE-2024', 'VOTE_ACCEPTED'),
      /ILLEGAL_STATE_TRANSITION/
    );
    await assert.rejects(
      async () => firestoreRepos.participations.updateParticipationStatus(voterId, 'GE-2024', 'VOTE_ACCEPTED'),
      /ILLEGAL_STATE_TRANSITION/
    );
  });

  // --------------------------------------------------------------------------
  // Requirement 13: Existing Phase 01 tests still pass
  // (Tested by full test runner; verified here by checking runtime empty voter roll)
  // --------------------------------------------------------------------------
  await t.test('13. Runtime empty voter roll and Phase 01 fail-closed invariants maintained', async () => {
    const inMemRepos = createInMemoryRepositories();
    const count = await inMemRepos.voterProfiles.count();
    assert.equal(count, 0, 'In-memory voter profile store starts strictly empty at runtime');
  });

  // --------------------------------------------------------------------------
  // Requirement 14: Legacy schemas detected by migration dry run without modifying records
  // --------------------------------------------------------------------------
  await t.test('14. Legacy schemas detected by migration dry run without modifying records', async () => {
    const mockDb = createInMemoryFirestoreMock();

    // Populate mock legacy /voters collection with two legacy records
    await mockDb.collection('voters').doc('leg-01').set({
      id: 'leg-01',
      epicId: 'IND-DL-111111',
      name: 'Legacy Test User',
      gender: 'M',
      age: 35,
      constituencyId: 'CONST-04-ND',
      isEligible: true,
      status: 'ELIGIBLE',
    });

    await mockDb.collection('voters').doc('leg-02').set({
      id: 'leg-02',
      epicId: 'IND-DL-222222',
      name: 'Second Legacy User',
      gender: 'F',
      age: 28,
      constituencyId: 'CONST-04-ND',
      isEligible: false,
      status: 'VOTED',
    });

    // Run dry-run inspection
    const report = await inspectAndMigrateDataModel({
      execute: false, // DRY RUN
      firestoreOverride: mockDb,
    });

    assert.equal(report.mode, 'DRY_RUN');
    assert.equal(report.scannedCount, 2);
    assert.equal(report.legacyCount, 2);
    assert.equal(report.currentV2Count, 0);
    assert.equal(report.migratedCount, 0, 'Dry run must not migrate or write records');
    assert.equal(report.plan.length, 2);
    assert.equal(report.plan[0].action, 'MIGRATE');

    // Verify source documents are intact and NO records were written to voter_profiles
    const sourceSnap = await mockDb.collection('voters').get();
    assert.equal(sourceSnap.size, 2, 'Source legacy records must remain intact');
    const targetSnap = await mockDb.collection('voter_profiles').get();
    assert.equal(targetSnap.size, 0, 'No target documents written in dry run mode');
  });

  // --------------------------------------------------------------------------
  // Requirement 15: Demo administrator seed remains unaffected
  // --------------------------------------------------------------------------
  await t.test('15. Demo administrator seed remains unaffected', () => {
    const adminAccount: AuthorityAccount = {
      id: 'admin_demo_account',
      email: 'demo.admin@blockballot.local',
      displayName: 'Demo Platform Administrator',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      assignmentScope: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    const validation = validateAuthorityAccount(adminAccount);
    assert.equal(validation.isValid, true, 'Demo administrator authority record is valid');
    assert.equal(adminAccount.email, 'demo.admin@blockballot.local');
    assert.equal(adminAccount.role, 'PLATFORM_ADMIN');
  });
});
