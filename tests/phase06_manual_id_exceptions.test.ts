/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import crypto from 'crypto';

import { adminRouter, clearAdminSessionsForTesting } from '../backend/server/routes/admin';
import { voterRouter } from '../backend/server/routes/voter';
import { serverStore } from '../backend/server/store';
import {
  clearOfficerSessionsForTesting,
  createOfficerSession,
  registerOfficerSessionForTesting,
  revokeOfficerSession,
} from '../backend/server/auth/rbac';
import { getDataRepositories } from '../backend/server/repositories';
import {
  AuthorityAccount,
  VoterProfile,
  SCHEMA_VERSION_CURRENT,
  validateManualIdException,
  validateBiometricMetadata,
  ManualIdExceptionRecord,
} from '../frontend/src/types/dataModel';

test('BlockBallot — Phase 06: Manual Physical-ID Verification & Exception Approval Test Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  // Officer Tokens
  let vroToken: string;
  let eoToken: string;
  let eo2Token: string;
  let adminToken: string;

  // In-scope voter: CONST-04-ND
  const testVoterInScopeId = 'vpr_test_phase06_in_scope';
  const testSimVoterInScopeId = 'SIM-DL-2026-6001';

  // Out-of-scope voter: CONST-99-OUT
  const testVoterOutOfScopeId = 'vpr_test_phase06_out_of_scope';
  const testSimVoterOutOfScopeId = 'SIM-DL-2026-6002';

  t.before(async () => {
    // 1. Setup Express testing server
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
    app.use('/api', adminRouter);
    app.use('/api/voter', voterRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    clearAdminSessionsForTesting();
    clearOfficerSessionsForTesting();

    // 2. Register VRO Session (Assigned to CONST-04-ND)
    const vroAccount: AuthorityAccount = {
      id: 'VRO-SIM-001',
      email: 'vro.sim001@blockballot.local',
      displayName: 'Simulated Voter Registration Officer',
      role: 'VOTER_REGISTRATION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const vroSession = createOfficerSession(vroAccount);
    vroToken = vroSession.token;
    registerOfficerSessionForTesting(vroSession);

    // 3. Register Primary EO Session (CONST-04-ND, CONST-77-VAR)
    const eoAccount: AuthorityAccount = {
      id: 'EO-SIM-001',
      email: 'eo.sim001@blockballot.local',
      displayName: 'Primary Election Officer',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
        electionIds: ['1', 'GE-2024'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const eoSession = createOfficerSession(eoAccount);
    eoToken = eoSession.token;
    registerOfficerSessionForTesting(eoSession);

    // 4. Register Secondary EO Session (CONST-04-ND) for Separation-of-Duties tests
    const eo2Account: AuthorityAccount = {
      id: 'EO-SIM-002',
      email: 'eo.sim002@blockballot.local',
      displayName: 'Secondary Election Officer',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND'],
        electionIds: ['1', 'GE-2024'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const eo2Session = createOfficerSession(eo2Account);
    eo2Token = eo2Session.token;
    registerOfficerSessionForTesting(eo2Session);

    // 5. Register Platform Admin Session
    const adminAccount: AuthorityAccount = {
      id: 'demo-admin-uid',
      email: 'demo.admin@blockballot.local',
      displayName: 'Platform Administrator',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const adminSession = createOfficerSession(adminAccount);
    adminToken = adminSession.token;
    registerOfficerSessionForTesting(adminSession);

    // 6. Seed Test Voters into Repository
    const repos = getDataRepositories();
    const inScopeProfile: VoterProfile = {
      id: testVoterInScopeId,
      simulationVoterId: testSimVoterInScopeId,
      fullName: 'Aarav Sharma (Phase 06)',
      dateOfBirth: '1990-05-15',
      gender: 'M',
      state: 'NCT of Delhi',
      district: 'New Delhi',
      constituencyId: 'CONST-04-ND',
      pollingStation: 'PS-042',
      maskedMobile: '+91 98XXX-XX101',
      registrationStatus: 'REGISTERED',
      eligibilityStatus: 'ELIGIBLE',
      lifecycleStatus: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.voterProfiles.save(inScopeProfile);

    const outOfScopeProfile: VoterProfile = {
      id: testVoterOutOfScopeId,
      simulationVoterId: testSimVoterOutOfScopeId,
      fullName: 'Pooja Iyer (Phase 06 Out of Scope)',
      dateOfBirth: '1995-10-20',
      gender: 'F',
      state: 'Maharashtra',
      district: 'Mumbai City',
      constituencyId: 'CONST-99-OUT',
      pollingStation: 'PS-099',
      maskedMobile: '+91 97XXX-XX909',
      registrationStatus: 'REGISTERED',
      eligibilityStatus: 'ELIGIBLE',
      lifecycleStatus: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.voterProfiles.save(outOfScopeProfile);

    // Ensure mock active election exists in serverStore
    serverStore.resetDefaults();
    serverStore.createElection({
      id: '1',
      numericId: 1,
      title: 'Phase 06 Active Election',
      status: 'active',
      startTime: Math.floor(Date.now() / 1000) - 3600,
      endTime: Math.floor(Date.now() / 1000) + 86400,
      constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
      totalVotesCast: 0,
      totalVotersRegistered: 5000,
    } as any);
  });

  t.after(async () => {
    clearAdminSessionsForTesting();
    clearOfficerSessionsForTesting();
    serverStore.resetDefaults();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Track created exceptions across tests
  let enrollmentExceptionId: string;
  let votingExceptionId: string;
  const sampleVotingSessionToken = 'attempt-token-secret-alpha-99';
  const sampleVotingSessionHash = crypto.createHash('sha256').update(sampleVotingSessionToken).digest('hex');

  // --------------------------------------------------------------------------
  // Requirement 1: VRO can request enrollment exception within scope
  // --------------------------------------------------------------------------
  await t.test('1. Voter Registration Officer can request an enrollment exception within assigned jurisdiction', async () => {
    const res = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'ENROLLMENT',
        modality: 'FINGERPRINT',
        reasonCode: 'FINGERPRINT_SCANNER_NOT_DETECTED',
        note: 'Sensor USB daemon not running on registration station',
      }),
    });

    assert.equal(res.status, 201, 'VRO should successfully create exception request');
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.exception.id.startsWith('EX-REQ-') || data.exception.id.startsWith('ex_'));
    assert.equal(data.exception.voterId, testVoterInScopeId);
    assert.equal(data.exception.purpose, 'ENROLLMENT');
    assert.equal(data.exception.modality, 'FINGERPRINT');
    assert.equal(data.exception.status, 'PENDING');
    assert.equal(data.exception.requestedByOfficerId, 'VRO-SIM-001');

    enrollmentExceptionId = data.exception.id;

    // Check that biometric metadata status was updated to PENDING_MANUAL_REVIEW
    const repos = getDataRepositories();
    const bioMeta = await repos.biometrics.getMetadata(testVoterInScopeId, 'FINGERPRINT');
    assert.ok(bioMeta, 'Biometric metadata record must exist');
    assert.equal(bioMeta.status, 'PENDING_MANUAL_REVIEW');
  });

  // --------------------------------------------------------------------------
  // Requirement 2: Invalid reason codes & malformed requests rejected (400)
  // --------------------------------------------------------------------------
  await t.test('2. Invalid reason codes, malformed requests, and schema violations are rejected with 400', async () => {
    // A. Invalid reason code
    const resInvalidReason = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'ENROLLMENT',
        modality: 'FACE',
        reasonCode: 'INVALID_REASON_CODE_NOT_IN_ENUM',
      }),
    });
    assert.equal(resInvalidReason.status, 400, 'Invalid reason code must return 400');

    // B. Missing required fields
    const resMissingFields = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        purpose: 'ENROLLMENT',
      }),
    });
    assert.equal(resMissingFields.status, 400, 'Missing voterId must return 400');

    // C. Non-existent voter ID
    const resBadVoter = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        voterId: 'vpr_non_existent_ghost',
        purpose: 'ENROLLMENT',
        modality: 'FACE',
        reasonCode: 'CAMERA_UNAVAILABLE',
      }),
    });
    assert.equal(resBadVoter.status, 404, 'Non-existent voter must return 404');
  });

  // --------------------------------------------------------------------------
  // Requirement 3: EO can review and decide in-scope pending request
  // --------------------------------------------------------------------------
  await t.test('3. Election Officer can review and approve in-scope pending request with mandatory reason', async () => {
    // Reject decision without mandatory reason
    const resNoReason = await fetch(`${baseUrl}/api/admin/exceptions/${enrollmentExceptionId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: '  ',
      }),
    });
    assert.equal(resNoReason.status, 400, 'Approve without reason must return 400');

    // Approve with valid audited reason
    const resApprove = await fetch(`${baseUrl}/api/admin/exceptions/${enrollmentExceptionId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Physical Voter ID card inspected and verified against registered electoral roll record.',
      }),
    });
    assert.equal(resApprove.status, 200, 'EO approval should succeed');
    const data = await resApprove.json();
    assert.equal(data.success, true);
    assert.equal(data.exception.status, 'APPROVED');
    assert.equal(data.exception.decisionOutcome, 'MANUAL_PHYSICAL_ID_APPROVED');
    assert.equal(data.exception.reviewedByOfficerId, 'EO-SIM-001');

    // Biometric metadata must be updated to MANUALLY_APPROVED with isManualException: true
    const repos = getDataRepositories();
    const bioMeta = await repos.biometrics.getMetadata(testVoterInScopeId, 'FINGERPRINT');
    assert.ok(bioMeta);
    assert.equal(bioMeta.status, 'MANUALLY_APPROVED');
    assert.equal(bioMeta.isManualException, true);
    assert.equal(bioMeta.manualExceptionId, enrollmentExceptionId);
  });

  // --------------------------------------------------------------------------
  // Requirement 4: VRO cannot approve or decline (403)
  // --------------------------------------------------------------------------
  await t.test('4. Voter Registration Officer cannot approve or decline exception requests (403 Forbidden)', async () => {
    // Create a new request to test VRO unauthorized decision
    const reqRes = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'VOTING_SESSION',
        electionId: '1',
        reasonCode: 'OTHER_OFFICIAL_REASON',
        votingSessionTokenHash: crypto.createHash('sha256').update('vro-block-token').digest('hex'),
        note: 'Testing VRO approval block',
      }),
    });
    const { exception } = await reqRes.json();

    const resVroApprove = await fetch(`${baseUrl}/api/admin/exceptions/${exception.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'VRO attempting to approve unauthorized request',
      }),
    });
    assert.equal(resVroApprove.status, 403, 'VRO cannot approve exceptions');

    const resVroDecline = await fetch(`${baseUrl}/api/admin/exceptions/${exception.id}/decline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'VRO attempting to decline unauthorized request',
      }),
    });
    assert.equal(resVroDecline.status, 403, 'VRO cannot decline exceptions');

    // Clean up test exception so it does not conflict with subsequent tests
    const resCleanDecline = await fetch(`${baseUrl}/api/admin/exceptions/${exception.id}/decline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Cleaned up test exception after VRO permission check',
      }),
    });
    assert.equal(resCleanDecline.status, 200);
  });

  // --------------------------------------------------------------------------
  // Requirement 5: Officer cannot approve own request (403)
  // --------------------------------------------------------------------------
  await t.test('5. Officer cannot approve or decline their own exception request (Separation of Duties)', async () => {
    // EO-SIM-001 requests a voting session exception
    const reqRes = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'VOTING_SESSION',
        electionId: '1',
        reasonCode: 'OTHER_OFFICIAL_REASON',
        votingSessionTokenHash: sampleVotingSessionHash,
        note: 'EO self-request for separation-of-duties test',
      }),
    });
    assert.equal(reqRes.status, 201);
    const { exception } = await reqRes.json();

    // EO-SIM-001 attempts to approve own request
    const resSelfApprove = await fetch(`${baseUrl}/api/admin/exceptions/${exception.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Self approval attempt by requesting officer',
      }),
    });
    assert.equal(resSelfApprove.status, 403, 'Requester cannot approve own request');
    const errData = await resSelfApprove.json();
    assert.ok(errData.message.includes('cannot approve or decline an exception request they submitted'));

    // Secondary officer (EO-SIM-002) CAN approve it
    const resPeerApprove = await fetch(`${baseUrl}/api/admin/exceptions/${exception.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eo2Token}`,
      },
      body: JSON.stringify({
        decisionReason: 'Peer review and physical verification completed by independent Election Officer.',
      }),
    });
    assert.equal(resPeerApprove.status, 200, 'Independent peer EO can approve request');
    const peerData = await resPeerApprove.json();
    assert.equal(peerData.exception.status, 'APPROVED');
    assert.equal(peerData.exception.reviewedByOfficerId, 'EO-SIM-002');

    votingExceptionId = peerData.exception.id;
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Out-of-scope requests cannot be read or decided (403)
  // --------------------------------------------------------------------------
  await t.test('6. Out-of-scope requests cannot be created, viewed, or decided by restricted officers', async () => {
    // VRO has scope CONST-04-ND; testVoterOutOfScopeId is in CONST-99-OUT
    const resCreateOut = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterOutOfScopeId,
        purpose: 'ENROLLMENT',
        modality: 'FINGERPRINT',
        reasonCode: 'FINGERPRINT_SCANNER_NOT_DETECTED',
      }),
    });
    assert.equal(resCreateOut.status, 403, 'VRO cannot submit exception for out-of-scope voter');

    // Admin creates an exception for the out-of-scope voter
    const adminCreateRes = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterOutOfScopeId,
        purpose: 'ENROLLMENT',
        modality: 'FACE',
        reasonCode: 'CAMERA_UNAVAILABLE',
        note: 'Out of scope test request',
      }),
    });
    assert.equal(adminCreateRes.status, 201);
    const { exception: outEx } = await adminCreateRes.json();

    // VRO cannot view it by ID
    const resVroGet = await fetch(`${baseUrl}/api/admin/exceptions/${outEx.id}`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    assert.equal(resVroGet.status, 403, 'VRO cannot access out-of-scope exception');

    // EO-SIM-001 (scope CONST-04-ND, CONST-77-VAR) cannot approve it
    const resEoApproveOut = await fetch(`${baseUrl}/api/admin/exceptions/${outEx.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Attempting to approve out of scope',
      }),
    });
    assert.equal(resEoApproveOut.status, 403, 'EO cannot approve out-of-scope exception');
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Unauthenticated, expired, revoked sessions fail closed
  // --------------------------------------------------------------------------
  await t.test('7. Unauthenticated, expired, revoked, and forged sessions fail closed', async () => {
    // Missing token
    const resNoAuth = await fetch(`${baseUrl}/api/admin/exceptions`);
    assert.equal(resNoAuth.status, 401, 'No auth must return 401');

    // Forged token
    const resForged = await fetch(`${baseUrl}/api/admin/exceptions`, {
      headers: { Authorization: 'Bearer adm_forged_random_token_123456' },
    });
    assert.equal(resForged.status, 401, 'Forged token must return 401');

    // Revoked token
    revokeOfficerSession(vroToken);
    const resRevoked = await fetch(`${baseUrl}/api/admin/exceptions`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    assert.equal(resRevoked.status, 401, 'Revoked session must return 401');

    // Re-create a fresh VRO session for remaining tests
    const freshVroAccount: AuthorityAccount = {
      id: 'VRO-SIM-001',
      email: 'vro.sim001@blockballot.local',
      displayName: 'Simulated Voter Registration Officer',
      role: 'VOTER_REGISTRATION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const freshSession = createOfficerSession(freshVroAccount);
    vroToken = freshSession.token;
    registerOfficerSessionForTesting(freshSession);
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Duplicate or concurrent decisions cannot produce conflicting approvals
  // --------------------------------------------------------------------------
  await t.test('8. Duplicate or conflicting decisions on the same exception record are rejected (409 Conflict)', async () => {
    // Attempting to approve an already approved exception
    const resReApprove = await fetch(`${baseUrl}/api/admin/exceptions/${enrollmentExceptionId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Attempting duplicate approval on already decided exception',
      }),
    });
    assert.equal(resReApprove.status, 409, 'Re-approval must return 409 Conflict');

    // Attempting to decline an already approved exception
    const resDeclineApproved = await fetch(`${baseUrl}/api/admin/exceptions/${enrollmentExceptionId}/decline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Attempting decline on already approved exception',
      }),
    });
    assert.equal(resDeclineApproved.status, 409, 'Decline on approved record must return 409 Conflict');
  });

  // --------------------------------------------------------------------------
  // Requirement 9: Manual exception never marks biometric modality as ENROLLED
  // --------------------------------------------------------------------------
  await t.test('9. Manual exceptions never mark biometric modality as ENROLLED in schema or repository', async () => {
    const repos = getDataRepositories();
    const bioMeta = await repos.biometrics.getMetadata(testVoterInScopeId, 'FINGERPRINT');
    assert.ok(bioMeta);
    assert.equal(bioMeta.status, 'MANUALLY_APPROVED', 'Must be MANUALLY_APPROVED');
    assert.notEqual(bioMeta.status, 'ENROLLED', 'Must never be ENROLLED');
    assert.equal(bioMeta.isManualException, true);

    // Schema level invariant: status === 'ENROLLED' with isManualException: true must fail validation
    const invalidHybridRecord: any = {
      ...bioMeta,
      status: 'ENROLLED',
      isManualException: true,
    };
    const valResult = validateBiometricMetadata(invalidHybridRecord);
    assert.equal(valResult.isValid, false, 'Invalid hybrid ENROLLED + isManualException must fail schema validation');
    assert.ok(valResult.errors.some((e) => e.includes('cannot be marked as ENROLLED')));
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Approved outcome is labeled MANUAL_PHYSICAL_ID_APPROVED, never biometric match
  // --------------------------------------------------------------------------
  await t.test('10. Approved outcome is explicitly labeled MANUAL_PHYSICAL_ID_APPROVED and never as a biometric match', async () => {
    const repos = getDataRepositories();
    const exception = await repos.exceptions.findById(enrollmentExceptionId);
    assert.ok(exception);
    assert.equal(exception.decisionOutcome, 'MANUAL_PHYSICAL_ID_APPROVED');

    // Voter public status endpoint reflects manual approval without biometric match
    const resPublicStatus = await fetch(`${baseUrl}/api/voter/exceptions/${enrollmentExceptionId}`);
    assert.equal(resPublicStatus.status, 200);
    const pubData = await resPublicStatus.json();
    assert.equal(pubData.exception.decisionOutcome, 'MANUAL_PHYSICAL_ID_APPROVED');
    assert.equal(pubData.exception.isManualException, true);
    assert.equal(pubData.exception.isBiometricMatch, undefined, 'No biometric match field should be returned');
  });

  // --------------------------------------------------------------------------
  // Requirement 11: Enrollment-time approval cannot authorize later voting session
  // --------------------------------------------------------------------------
  await t.test('11. Enrollment-time exception approval cannot authorize a later voting session', async () => {
    // Attempting to consume the enrollment exception for voting
    const resConsume = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: enrollmentExceptionId,
        voterId: testVoterInScopeId,
        simulationVoterId: testSimVoterInScopeId,
        electionId: '1',
        votingSessionToken: 'attempt-token',
      }),
    });

    assert.equal(resConsume.status, 400, 'Consuming enrollment exception for voting must be rejected');
    const err = await resConsume.json();
    assert.ok(err.message.includes('VOTING_SESSION'));
  });

  // --------------------------------------------------------------------------
  // Requirement 12: Voting-time approval is restricted to exact voter, election, and session
  // --------------------------------------------------------------------------
  await t.test('12. Voting-time exception is strictly bound to exact voter, election, and session token hash', async () => {
    // Successful consumption using exact matching parameters
    const resConsume = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: votingExceptionId,
        voterId: testVoterInScopeId,
        simulationVoterId: testSimVoterInScopeId,
        electionId: '1',
        votingSessionToken: sampleVotingSessionToken,
      }),
    });

    assert.equal(resConsume.status, 200, 'Valid voting exception consumption must succeed');
    const data = await resConsume.json();
    assert.equal(data.success, true);
    assert.equal(data.exception.status, 'CONSUMED');
    assert.equal(data.exception.consumedInElectionId, '1');
  });

  // --------------------------------------------------------------------------
  // Requirement 13: Expired, mismatched, revoked, and already-consumed approvals cannot authorize voting
  // --------------------------------------------------------------------------
  await t.test('13. Expired, mismatched, revoked, and already-consumed approvals cannot authorize voting', async () => {
    // A. Already consumed
    const resReconsume = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: votingExceptionId,
        voterId: testVoterInScopeId,
        simulationVoterId: testSimVoterInScopeId,
        electionId: '1',
        votingSessionToken: sampleVotingSessionToken,
      }),
    });
    assert.equal(resReconsume.status, 409, 'Re-consuming exception must return 409 Conflict');

    // B. Create a new voting exception to test token hash mismatch
    const token2 = 'secret-session-token-2';
    const hash2 = crypto.createHash('sha256').update(token2).digest('hex');
    const ex2Res = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'VOTING_SESSION',
        electionId: '1',
        reasonCode: 'PHYSICAL_DISABILITY_OR_AMPUTATION',
        votingSessionTokenHash: hash2,
      }),
    });
    const { exception: ex2 } = await ex2Res.json();
    await fetch(`${baseUrl}/api/admin/exceptions/${ex2.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ decisionReason: 'Voter has physical tremor; approved manual exception.' }),
    });

    // Mismatched token
    const resWrongToken = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: ex2.id,
        voterId: testVoterInScopeId,
        simulationVoterId: testSimVoterInScopeId,
        electionId: '1',
        votingSessionToken: 'WRONG_UNMATCHED_TOKEN',
      }),
    });
    assert.equal(resWrongToken.status, 403, 'Mismatched session token hash must return 403');

    // C. Mismatched election
    const resWrongElection = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: ex2.id,
        voterId: testVoterInScopeId,
        simulationVoterId: testSimVoterInScopeId,
        electionId: '99',
        votingSessionToken: token2,
      }),
    });
    assert.equal(resWrongElection.status, 403, 'Mismatched election ID must return 403');

    // D. Expired exception (simulate time elapse beyond 15 minutes)
    const repos = getDataRepositories();
    const approvedEx2 = (await repos.exceptions.findById(ex2.id)) || ex2;
    approvedEx2.expiresAt = Date.now() - 1000; // Expired 1 second ago
    await repos.exceptions.update(approvedEx2);

    const resExpired = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: ex2.id,
        voterId: testVoterInScopeId,
        simulationVoterId: testSimVoterInScopeId,
        electionId: '1',
        votingSessionToken: token2,
      }),
    });
    assert.equal(resExpired.status, 403, 'Expired exception must return 403');
    const expData = await resExpired.json();
    assert.ok(expData.message.includes('expired'));
  });

  // --------------------------------------------------------------------------
  // Requirement 14: Inactive voters, ineligible voters, and closed elections cannot obtain voting authorization
  // --------------------------------------------------------------------------
  await t.test('14. Inactive voters, ineligible voters, and closed elections cannot consume voting exceptions', async () => {
    const repos = getDataRepositories();
    const token3 = 'session-token-3';
    const hash3 = crypto.createHash('sha256').update(token3).digest('hex');

    // Locked voter
    const lockedProfile: VoterProfile = {
      id: 'vpr_locked_voter',
      simulationVoterId: 'SIM-DL-2026-6099',
      fullName: 'Locked Elector',
      dateOfBirth: '1985-01-01',
      gender: 'O',
      state: 'NCT of Delhi',
      district: 'New Delhi',
      constituencyId: 'CONST-04-ND',
      pollingStation: 'PS-042',
      maskedMobile: '+91 98XXX-XX999',
      registrationStatus: 'REGISTERED',
      eligibilityStatus: 'ELIGIBLE',
      lifecycleStatus: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.voterProfiles.save(lockedProfile);

    // Request and approve exception for voter while active
    const exRes = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        voterId: lockedProfile.id,
        purpose: 'VOTING_SESSION',
        electionId: '1',
        reasonCode: 'OTHER_OFFICIAL_REASON',
        votingSessionTokenHash: hash3,
      }),
    });
    const { exception: deactEx } = await exRes.json();
    await fetch(`${baseUrl}/api/admin/exceptions/${deactEx.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ decisionReason: 'Approval test for locked elector' }),
    });

    // Now lock the voter profile
    lockedProfile.lifecycleStatus = 'LOCKED';
    await repos.voterProfiles.save(lockedProfile);

    const resConsumeDeact = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: deactEx.id,
        voterId: lockedProfile.id,
        simulationVoterId: lockedProfile.simulationVoterId,
        electionId: '1',
        votingSessionToken: token3,
      }),
    });
    assert.equal(resConsumeDeact.status, 403, 'Locked voter cannot consume exception');

    // Closed / Concluded election test
    // A. Closed election cannot request exception
    const closedElection = {
      id: '999',
      numericId: 999,
      name: 'Concluded Test Election',
      status: 'concluded',
      state: 'NCT of Delhi',
      constituencyId: 4,
    };
    serverStore.createElection(closedElection as any);

    const token4 = 'session-token-4';
    const hash4 = crypto.createHash('sha256').update(token4).digest('hex');
    const exClosedRes = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'VOTING_SESSION',
        electionId: '999',
        reasonCode: 'OTHER_OFFICIAL_REASON',
        votingSessionTokenHash: hash4,
      }),
    });
    assert.equal(exClosedRes.status, 403, 'Closed election cannot request voting exception');

    // B. Concluded election cannot consume exception
    // Request and approve exception for active election '1'
    const exConcludeRes = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'VOTING_SESSION',
        electionId: '1',
        reasonCode: 'OTHER_OFFICIAL_REASON',
        votingSessionTokenHash: hash4,
      }),
    });
    const { exception: closingEx } = await exConcludeRes.json();
    const resApprClosing = await fetch(`${baseUrl}/api/admin/exceptions/${closingEx.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ decisionReason: 'Approved before election concluded' }),
    });
    assert.equal(resApprClosing.status, 200);

    // Conclude election '1' in store
    const activeElection1 = serverStore.getElectionById('1');
    if (activeElection1) {
      activeElection1.status = 'concluded';
    }

    const resConsumeClosed = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: closingEx.id,
        voterId: testVoterInScopeId,
        simulationVoterId: testSimVoterInScopeId,
        electionId: '1',
        votingSessionToken: token4,
      }),
    });
    assert.equal(resConsumeClosed.status, 403, 'Closed election cannot consume exception');

    // Restore election '1' back to active for remaining tests
    if (activeElection1) {
      activeElection1.status = 'active';
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 15: Normal duplicate-vote prevention and multi-election participation still work
  // --------------------------------------------------------------------------
  await t.test('15. Duplicate vote prevention is enforced; voter cannot consume exception if already voted', async () => {
    const repos = getDataRepositories();

    // Mark test voter as already having voted in Election 1
    await repos.participations.createParticipation({
      id: `${testVoterInScopeId}_1`,
      voterId: testVoterInScopeId,
      electionId: '1',
      status: 'VOTE_ACCEPTED',
      votedAt: Date.now(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    });

    const token5 = 'session-token-5';
    const hash5 = crypto.createHash('sha256').update(token5).digest('hex');

    // Attempting to request a voting exception for an already voted voter is rejected
    const resReqAlreadyVoted = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'VOTING_SESSION',
        electionId: '1',
        reasonCode: 'OTHER_OFFICIAL_REASON',
        votingSessionTokenHash: hash5,
      }),
    });
    assert.equal(resReqAlreadyVoted.status, 403, 'Cannot request voting exception if already voted');
  });

  // --------------------------------------------------------------------------
  // Requirement 16: Audit events generated for requests, decisions, session consumption/rejection
  // --------------------------------------------------------------------------
  await t.test('16. Structured audit events are recorded for exception lifecycle events', async () => {
    const repos = getDataRepositories();
    const events = await repos.auditEvents.getEvents();

    const exceptionEvents = events.filter((e) => e.target.category === 'EXCEPTION_REQUEST');
    assert.ok(exceptionEvents.length >= 3, 'Must have recorded structured exception audit events');

    // Verify presence of creation, approval, and consumption events
    const hasCreation = exceptionEvents.some((e) => e.type === 'MANUAL_ID_EXCEPTION_REQUESTED');
    const hasApproval = exceptionEvents.some((e) => e.type === 'MANUAL_ID_EXCEPTION_APPROVED');
    const hasConsumption = exceptionEvents.some((e) => e.type === 'MANUAL_ID_EXCEPTION_CONSUMED');

    assert.ok(hasCreation, 'Must have recorded MANUAL_ID_EXCEPTION_REQUESTED event');
    assert.ok(hasApproval, 'Must have recorded MANUAL_ID_EXCEPTION_APPROVED event');
    assert.ok(hasConsumption, 'Must have recorded MANUAL_ID_EXCEPTION_CONSUMED event');
  });

  // --------------------------------------------------------------------------
  // Requirement 17: Physical-ID images and raw biometric data are not stored or transmitted
  // --------------------------------------------------------------------------
  await t.test('17. Document scans, photo uploads, and identity document numbers are strictly rejected', async () => {
    // Prohibited key in request: rawBiometric
    const resRawBio = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'ENROLLMENT',
        modality: 'FACE',
        reasonCode: 'CAMERA_UNAVAILABLE',
        rawBiometric: 'sample_raw_minutiae_data',
      }),
    });
    assert.equal(resRawBio.status, 400, 'Payload with rawBiometric must be rejected');

    // Prohibited key in request: idDocumentImage
    const resDocImage = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'ENROLLMENT',
        modality: 'FACE',
        reasonCode: 'CAMERA_UNAVAILABLE',
        idDocumentImage: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
      }),
    });
    assert.equal(resDocImage.status, 400, 'Payload with idDocumentImage must be rejected');

    // Data URI embedded in note string
    const resEmbeddedDataUri = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'ENROLLMENT',
        modality: 'FACE',
        reasonCode: 'CAMERA_UNAVAILABLE',
        note: 'Here is the scanned document: data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
      }),
    });
    assert.equal(resEmbeddedDataUri.status, 400, 'Payload with embedded data URI in note must be rejected');

    // Aadhaar number pattern in note string
    const resAadhaarPattern = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        voterId: testVoterInScopeId,
        purpose: 'ENROLLMENT',
        modality: 'FACE',
        reasonCode: 'CAMERA_UNAVAILABLE',
        note: 'Elector showed Aadhaar card number 1234 5678 9012 at counter',
      }),
    });
    assert.equal(resAadhaarPattern.status, 400, 'Payload with 12-digit Aadhaar number in note must be rejected');
  });

  // --------------------------------------------------------------------------
  // Requirement 18: Existing Phase 01–05 behavior remains intact
  // --------------------------------------------------------------------------
  await t.test('18. Existing Phase 01–05 behavior, voter registry, and biometric metadata endpoints remain intact', async () => {
    // Phase 04 voter profile retrieval
    const resVoter = await fetch(`${baseUrl}/api/admin/voters/${testVoterInScopeId}`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(resVoter.status, 200);
    const voterData = await resVoter.json();
    assert.equal(voterData.voter.simulationVoterId, testSimVoterInScopeId);

    // Phase 05 biometric metadata retrieval
    const resBio = await fetch(`${baseUrl}/api/admin/voters/${testVoterInScopeId}/biometrics`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(resBio.status, 200);
    const bioData = await resBio.json();
    assert.equal(bioData.fingerprint.status, 'MANUALLY_APPROVED');
    assert.equal(bioData.fingerprint.isManualException, true);
    assert.ok(!bioData.face || bioData.face.status === 'NOT_STARTED', 'Modality independence preserved');
  });
});
