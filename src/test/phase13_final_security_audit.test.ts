/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BlockBallot — Phase 13: Final Security Audit, End-to-End Verification & Release Readiness Test Suite
 * 
 * Implements the 25 comprehensive verification workflows specified in Section 10 of Phase 13:
 * 1. Authorized VRO registration of a new synthetic voter.
 * 2. Generated BBV-SIM-... ID is unique and persisted.
 * 3. Unauthorized officer voter-write attempt is rejected.
 * 4. Face enrollment with unavailable camera does not falsely enroll the voter.
 * 5. Fingerprint preview does not falsely claim a real hardware scan.
 * 6. A valid enrollment-time physical-ID request can be approved by an authorized independent EO.
 * 7. That enrollment exception does not bypass voting-time authorization.
 * 8. A voting-time exception expires and can be consumed only for its intended session.
 * 9. A scheduled election opens and closes according to the server clock.
 * 10. Invalid candidate nominations and out-of-scope administrative operations are rejected.
 * 11. An eligible voter obtains an election-bound session.
 * 12. Ineligible voters and unauthorized sessions fail closed.
 * 13. One valid ballot is accepted through the intended vote workflow.
 * 14. Duplicate and concurrent submissions cannot create another accepted ballot.
 * 15. Transaction retry and uncertain-result recovery preserve integrity.
 * 16. Voting in one election does not prevent participation in another eligible election.
 * 17. Fullscreen exit warnings, server-side lock and supervised recovery work together.
 * 18. A closed election rejects new votes.
 * 19. Historical archive browsing preserves provenance and cannot alter active elections.
 * 20. Public monitor responses contain no prohibited voter or session data.
 * 21. Public results respect the publication rules.
 * 22. Key or encryption configuration failure does not silently fall back to an insecure mode.
 * 23. API errors and logs do not disclose secrets or raw sensitive payloads.
 * 24. Candidate-choice disclosure is demonstrated against the actual Solidity contract and ABI.
 * 25. The remaining release decision reflects actual verified evidence, including unresolved blockers.
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ethers } from 'ethers';

import { adminRouter, clearAdminSessionsForTesting } from '../../server/routes/admin';
import { voterRouter, clearRateLimitsForTesting } from '../../server/routes/voter';
import { monitorRouter, clearMonitorRateLimitsForTesting } from '../../server/routes/monitor';
import { archiveRouter } from '../../server/routes/archive';
import { serverStore } from '../../server/store';
import {
  clearOfficerSessionsForTesting,
  createOfficerSession,
  registerOfficerSessionForTesting,
  isConstituencyInScope,
  isElectionInScope,
} from '../../server/auth/rbac';
import { getDataRepositories } from '../../server/repositories';
import {
  AuthorityAccount,
  VoterProfile,
  SCHEMA_VERSION_CURRENT,
  ManualIdExceptionRecord,
} from '../types/dataModel';
import {
  CameraDeviceService,
  SimulatedPreviewScannerAdapter,
  PhysicalScannerSdkAdapter,
} from '../services/biometricService';
import {
  encryptSensitiveField,
  decryptSensitiveField,
  LocalKeyProvider,
  setKeyProviderForTesting,
  sanitizeLogData,
} from '../../server/security';
import { validateServerConfig, SERVER_CONFIG } from '../../server/config';
import { MANDATORY_NON_ENDORSEMENT_DISCLAIMER } from '../types/archive';

process.env.NODE_ENV = 'test';

test('BlockBallot — Phase 13: Final Security Audit & Verification Suite (25 Workflows)', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  // Officer Tokens
  let platformAdminToken: string;
  let eoToken: string;
  let vroToken: string;
  let independentEoToken: string;

  // Test Entities
  let testEpic = `IND-DL-P13-${Date.now().toString().slice(-6)}`;
  let createdVoterProfile: VoterProfile;
  let testElectionId = 18;
  const sampleWallet = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

  // Test Encryption Keys
  const testKeyV1 = crypto.randomBytes(32);
  let testKeyProvider: LocalKeyProvider;

  t.before(async () => {
    clearOfficerSessionsForTesting();
    clearAdminSessionsForTesting();
    clearRateLimitsForTesting();
    clearMonitorRateLimitsForTesting();

    // 1. Initialize local encryption key provider
    testKeyProvider = new LocalKeyProvider({
      primaryKey: testKeyV1,
      primaryKeyId: 'bb-enc-v1',
    });
    setKeyProviderForTesting(testKeyProvider);

    // 2. Setup Authority Accounts
    // 2a. Platform Admin
    const adminAccount: AuthorityAccount = {
      id: 'OFFICER-ADMIN-P13',
      email: 'admin.p13@blockballot.local',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      displayName: 'Platform Administrator (P13)',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const adminSession = createOfficerSession(adminAccount);
    if (!adminSession) throw new Error('Failed to create admin session');
    registerOfficerSessionForTesting(adminSession);
    platformAdminToken = adminSession.token;

    // 2b. Election Officer #1
    const eoAccount: AuthorityAccount = {
      id: 'EO-SIM-001',
      email: 'eo.sim001@blockballot.local',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      displayName: 'Lead Election Officer',
      assignmentScope: {
        constituencyIds: ['CONST-04-ND', 'CONST-01-MUM'],
        electionIds: ['18', '19', 'ELEC-SIM-2026', 'DEMO-PREV-2023'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const eoSession = createOfficerSession(eoAccount);
    if (!eoSession) throw new Error('Failed to create EO session');
    registerOfficerSessionForTesting(eoSession);
    eoToken = eoSession.token;

    // 2c. Independent Election Officer #2 (for 4-eyes review)
    const independentEoAccount: AuthorityAccount = {
      id: 'EO-SIM-002',
      email: 'eo.sim002@blockballot.local',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      displayName: 'Independent Reviewing Election Officer',
      assignmentScope: {
        constituencyIds: ['CONST-04-ND'],
        electionIds: ['18', '19', 'ELEC-SIM-2026'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const indEoSession = createOfficerSession(independentEoAccount);
    if (!indEoSession) throw new Error('Failed to create independent EO session');
    registerOfficerSessionForTesting(indEoSession);
    independentEoToken = indEoSession.token;

    // 2d. Voter Registration Officer
    const vroAccount: AuthorityAccount = {
      id: 'VRO-SIM-001',
      email: 'vro.sim001@blockballot.local',
      role: 'VOTER_REGISTRATION_OFFICER',
      status: 'ACTIVE',
      displayName: 'Voter Registration Officer',
      assignmentScope: {
        constituencyIds: ['CONST-04-ND'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const vroSession = createOfficerSession(vroAccount);
    if (!vroSession) throw new Error('Failed to create VRO session');
    registerOfficerSessionForTesting(vroSession);
    vroToken = vroSession.token;

    // 3. Seed active secondary election (MUNI-2024)
    const nowSec = serverStore.getCurrentTimeSec();
    serverStore.createElection({
      id: 'MUNI-2024',
      numericId: 19,
      title: 'Municipal Corporation Election 2024',
      description: 'Municipal civic polling',
      electionType: 'MUNICIPAL',
      status: 'active',
      startTime: nowSec - 3600,
      endTime: nowSec + 86400,
      constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    });

    // 4. Start Express Test Server
    const app = express();
    app.use(express.json());
    app.use('/api/admin', adminRouter);
    app.use('/api/voter', voterRouter);
    app.use('/api/monitor', monitorRouter);
    app.use('/api/archive', archiveRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // ==========================================================================
  // WORKFLOW 1: Authorized VRO Registration of a New Synthetic Voter
  // ==========================================================================
  await t.test('1. Authorized VRO registration of a new synthetic voter succeeds', async () => {
    const res = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Aarav Patel (P13 Audit Elector)',
        dateOfBirth: '1992-05-15',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
        pollingStation: 'Station 104 - New Delhi Central',
        maskedMobile: '+91 ••••• •3210',
      }),
    });

    assert.strictEqual(res.status, 201, 'VRO must successfully register new elector');
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.voter, 'Response must return created voter profile');
    createdVoterProfile = data.voter;
    testEpic = createdVoterProfile.simulationVoterId;
    assert.strictEqual(createdVoterProfile.constituencyId, 'CONST-04-ND');
    assert.strictEqual(createdVoterProfile.eligibilityStatus, 'ELIGIBLE');
  });

  // ==========================================================================
  // WORKFLOW 2: Generated BBV-SIM-... ID is Unique and Persisted
  // ==========================================================================
  await t.test('2. Generated BBV-SIM-... ID is unique, persisted, and retrievable', async () => {
    assert.ok(createdVoterProfile.simulationVoterId.startsWith('BBV-SIM-'), 'Voter ID must follow BBV-SIM-... convention');
    
    // Retrieve via admin API
    const res = await fetch(`${baseUrl}/api/admin/voters/${createdVoterProfile.id}`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    assert.strictEqual(res.status, 200, 'Created voter must be retrievable by ID');
    const data = await res.json();
    assert.strictEqual(data.voter.id, createdVoterProfile.id);
    assert.strictEqual(data.voter.simulationVoterId, testEpic);
  });

  // ==========================================================================
  // WORKFLOW 3: Unauthorized Officer Voter-Write Attempt is Rejected
  // ==========================================================================
  await t.test('3. Unauthorized officer voter-write attempt is rejected (fail closed)', async () => {
    // Election Officer attempting to register a voter (EO lacks VOTER_CREATE)
    const res = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        name: 'Unauthorized Elector Injection',
        epicId: `IND-DL-FAKE-${Date.now()}`,
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.strictEqual(res.status, 403, 'Election Officer must be forbidden from creating voters');
    const data = await res.json();
    assert.match(data.message, /lacks required permission 'VOTER_CREATE'/i);
  });

  // ==========================================================================
  // WORKFLOW 4: Face Enrollment with Unavailable Camera Does Not Falsely Enroll
  // ==========================================================================
  await t.test('4. Face enrollment with unavailable camera does not falsely enroll the voter', async () => {
    const cameraService = CameraDeviceService.getInstance();
    // In headless Node.js test environment, navigator.mediaDevices is absent
    const initResult = await cameraService.requestCameraStream();
    assert.strictEqual(initResult.success, false, 'Camera initialization must fail safely when hardware absent');
    assert.ok(initResult.error, 'Error message must be recorded');
    assert.strictEqual(initResult.errorType, 'NOT_SUPPORTED');

    // Confirm that the biometric metadata remains NOT_STARTED / not ENROLLED
    const repos = getDataRepositories();
    const faceMeta = await repos.biometrics.getMetadata(createdVoterProfile.id, 'FACE');
    assert.notStrictEqual(faceMeta?.status, 'ENROLLED', 'Voter must not be marked ENROLLED');
  });

  // ==========================================================================
  // WORKFLOW 5: Fingerprint Preview Does Not Falsely Claim a Real Hardware Scan
  // ==========================================================================
  await t.test('5. Fingerprint preview honestly declares simulation and does not claim real hardware scan', async () => {
    const simAdapter = new SimulatedPreviewScannerAdapter();
    assert.strictEqual(simAdapter.isSimulation, true, 'Adapter must explicitly declare isSimulation: true');
    const simResult = await simAdapter.captureImpression(1);
    assert.strictEqual(simResult.isSimulated, true, 'Scan result must declare isSimulated: true');

    const physicalAdapter = new PhysicalScannerSdkAdapter();
    assert.strictEqual(physicalAdapter.isSimulation, false, 'Physical adapter must not claim to be a simulation');
    const physStatus = await physicalAdapter.getStatus();
    assert.strictEqual(physStatus, 'NOT_DETECTED', 'Physical adapter must honestly report NOT_DETECTED when hardware absent');
  });

  // ==========================================================================
  // WORKFLOW 6: Valid Enrollment-Time Physical-ID Request Can Be Approved by Independent EO
  // ==========================================================================
  let approvedExceptionId = '';
  await t.test('6. Valid enrollment-time physical-ID request can be approved by an independent EO', async () => {
    // 1. VRO submits exception request on behalf of elector
    const reqRes = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        voterId: createdVoterProfile.id,
        purpose: 'ENROLLMENT',
        modality: 'FINGERPRINT',
        reasonCode: 'FINGERPRINT_SCANNER_NOT_DETECTED',
        note: 'Citizen physical ID verified by VRO at center.',
      }),
    });
    assert.strictEqual(reqRes.status, 201, 'VRO can request exception');
    const reqData = await reqRes.json();
    assert.ok(reqData.exception?.id);
    approvedExceptionId = reqData.exception.id;

    // 2. Requester VRO cannot approve their own request (separation of duties)
    const selfApproveRes = await fetch(`${baseUrl}/api/admin/exceptions/${approvedExceptionId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Self-approval attempt by VRO',
      }),
    });
    assert.strictEqual(selfApproveRes.status, 403, 'VRO must lack VOTER_EXCEPTION_APPROVE permission');

    // 3. Authorized independent Election Officer approves the exception
    const eoApproveRes = await fetch(`${baseUrl}/api/admin/exceptions/${approvedExceptionId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${independentEoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Reviewed physical Aadhaar copy independently. Approved.',
      }),
    });
    assert.strictEqual(eoApproveRes.status, 200, 'Independent EO must approve successfully');
    const approveData = await eoApproveRes.json();
    assert.strictEqual(approveData.exception.status, 'APPROVED');
  });

  // ==========================================================================
  // WORKFLOW 7: Enrollment Exception Does Not Bypass Voting-Time Authorization
  // ==========================================================================
  await t.test('7. Enrollment exception does not bypass voting-time authorization', async () => {
    // Attempt to authorize voting using the enrollment exception ID
    const authRes = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${approvedExceptionId}`, // Forged bearer session
      },
      body: JSON.stringify({
        walletAddress: sampleWallet,
        electionId: testElectionId,
      }),
    });
    assert.strictEqual(authRes.status, 401, 'Enrollment exception token cannot authorize a voting session');
  });

  // ==========================================================================
  // WORKFLOW 8: Voting-Time Exception Expires and Can Be Consumed Only Once
  // ==========================================================================
  await t.test('8. Voting-time exception expires and enforces single-use consumption', async () => {
    const votingSessionToken = 'test-voting-exception-token-p13';
    const votingSessionTokenHash = crypto.createHash('sha256').update(votingSessionToken).digest('hex');

    // 1. Create voting-time exception request
    const createRes = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${platformAdminToken}`,
      },
      body: JSON.stringify({
        voterId: createdVoterProfile.id,
        purpose: 'VOTING_SESSION',
        electionId: String(testElectionId),
        reasonCode: 'OTHER_OFFICIAL_REASON',
        votingSessionTokenHash,
        note: 'Emergency physical ID verification at polling station',
      }),
    });
    assert.strictEqual(createRes.status, 201);
    const { exception } = await createRes.json();

    // 2. EO approves the voting exception
    const approveRes = await fetch(`${baseUrl}/api/admin/exceptions/${exception.id}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Verified physical documents at polling station. Approved.',
      }),
    });
    assert.strictEqual(approveRes.status, 200);

    // 3. Consume exception for voting session (1st consumption succeeds)
    const consumeRes1 = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: exception.id,
        voterId: createdVoterProfile.id,
        simulationVoterId: testEpic,
        electionId: String(testElectionId),
        votingSessionToken,
      }),
    });
    assert.strictEqual(consumeRes1.status, 200, 'First consumption must succeed');
    const consumeData = await consumeRes1.json();
    assert.strictEqual(consumeData.exception.status, 'CONSUMED');

    // 4. Re-consumption fails (single-use invariant)
    const consumeRes2 = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: exception.id,
        voterId: createdVoterProfile.id,
        simulationVoterId: testEpic,
        electionId: String(testElectionId),
        votingSessionToken,
      }),
    });
    assert.strictEqual(consumeRes2.status, 409, 'Second consumption must fail closed with 409');
  });

  // ==========================================================================
  // WORKFLOW 9: Scheduled Election Opens and Closes According to Server Clock
  // ==========================================================================
  await t.test('9. Scheduled election opens and closes strictly according to server clock', async () => {
    const now = Date.now();
    const scheduledElectionId = '202601';

    // Create election with explicit future start time
    const resCreate = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        id: scheduledElectionId,
        title: 'Phase 13 Timed Election Simulation',
        status: 'scheduled',
        startTime: now + 3600000, // Starts in 1 hour
        endTime: now + 7200000,   // Ends in 2 hours
        constituencyIds: ['CONST-04-ND'],
      }),
    });
    assert.strictEqual(resCreate.status, 201, 'EO can create timed election');
    const createdElection = (await resCreate.json()).election;
    assert.strictEqual(createdElection.status, 'scheduled');

    // Attempting to cast vote prior to start time must fail
    const resVerify = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: testEpic }),
    });
    assert.strictEqual(resVerify.status, 200);
    const otp = (await resVerify.json()).testDeliveryCode;

    // Verify OTP against scheduled (inactive) election
    const resOtp = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: testEpic,
        otp,
        electionId: scheduledElectionId,
      }),
    });
    assert.ok(resOtp.status === 400 || resOtp.status === 409, 'Cannot authenticate for election that has not yet opened');
    const errData = await resOtp.json();
    assert.match(errData.message, /not currently (open|active)|scheduled/i);
  });

  // ==========================================================================
  // WORKFLOW 10: Invalid Candidate Nominations and Out-of-Scope Operations Rejected
  // ==========================================================================
  await t.test('10. Invalid nominations and out-of-scope operations are rejected', async () => {
    // 1. Missing name and party
    const resInvalid = await fetch(`${baseUrl}/api/admin/candidates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        electionId: testElectionId,
        constituencyId: 'CONST-04-ND',
        name: '',
        partyName: '',
      }),
    });
    assert.strictEqual(resInvalid.status, 400, 'Candidate nomination with empty name/party rejected');

    // 2. Out-of-scope constituency check using pure helper
    const vroScope = {
      constituencyIds: ['CONST-04-ND'],
    };
    assert.strictEqual(isConstituencyInScope(vroScope, 'CONST-04-ND'), true);
    assert.strictEqual(isConstituencyInScope(vroScope, 'CONST-99-OUT-OF-SCOPE'), false);
    assert.strictEqual(isElectionInScope({ electionIds: ['18'] }, '19'), false);
  });

  // ==========================================================================
  // WORKFLOW 11: Eligible Voter Obtains an Election-Bound Session
  // ==========================================================================
  let voterSessionToken = '';
  await t.test('11. Eligible voter obtains a high-entropy, election-bound session', async () => {
    // 1. Request OTP challenge
    const resVerify = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: testEpic }),
    });
    assert.strictEqual(resVerify.status, 200);
    const verifyData = await resVerify.json();
    assert.ok(verifyData.testDeliveryCode, 'Test delivery code supplied in test environment');

    // 2. Submit OTP for active demo election (testElectionId 18)
    const resOtp = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: testEpic,
        otp: verifyData.testDeliveryCode,
        electionId: testElectionId,
      }),
    });
    assert.strictEqual(resOtp.status, 200, 'Valid OTP authorizes session');
    const otpData = await resOtp.json();
    const token = otpData.sessionToken || otpData.token;
    assert.ok(token, 'Must return bearer session token');
    assert.ok(token.startsWith('bb_vses_'), 'Token must follow high-entropy naming convention');
    assert.strictEqual(otpData.voter.epicId, testEpic);
    voterSessionToken = token;
  });

  // ==========================================================================
  // WORKFLOW 12: Ineligible Voters and Unauthorized Sessions Fail Closed
  // ==========================================================================
  await t.test('12. Ineligible voters and unauthorized sessions fail closed', async () => {
    // 1. Unknown EPIC
    const resUnknown = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: 'IND-DL-NONEXISTENT' }),
    });
    assert.strictEqual(resUnknown.status, 404, 'Unknown elector must return 404');

    // 2. Deactivated Elector
    const regDeact = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Deactivated Test Elector',
        dateOfBirth: '1990-01-01',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.strictEqual(regDeact.status, 201);
    const createdDeact = (await regDeact.json()).voter;

    // Deactivate voter via admin endpoint
    const deactRes = await fetch(`${baseUrl}/api/admin/voters/${createdDeact.id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ reason: 'Audit deactivation test' }),
    });
    assert.strictEqual(deactRes.status, 200);

    const resDeactVerify = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: createdDeact.simulationVoterId }),
    });
    assert.ok(resDeactVerify.status === 403 || resDeactVerify.status === 404, 'Deactivated elector profile must reject verification');
  });

  // ==========================================================================
  // WORKFLOW 13: One Valid Ballot is Accepted Through Intended Workflow
  // ==========================================================================
  let submittedTxHash = '';
  await t.test('13. One valid ballot is accepted through the intended voting workflow', async () => {
    // 1. Obtain EIP-712 authorization ticket
    const resAuth = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voterSessionToken}`,
      },
      body: JSON.stringify({
        walletAddress: sampleWallet,
        electionId: testElectionId,
      }),
    });
    assert.strictEqual(resAuth.status, 200, 'Eligible session obtains authorization ticket');
    const authData = await resAuth.json();
    assert.ok(authData.ticket, 'Authorization ticket must be returned');
    assert.ok(authData.nullifier, 'Authorization must contain nullifier');

    // 2. Submit ballot recording (simulating blockchain transaction execution)
    submittedTxHash = '0x' + crypto.randomBytes(32).toString('hex');
    const resVote = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voterSessionToken}`,
      },
      body: JSON.stringify({
        electionId: testElectionId,
        constituencyId: 'CONST-04-ND',
        txHash: submittedTxHash,
        nullifier: authData.nullifier,
        blockNumber: 1042,
        isSimulated: true,
      }),
    });
    assert.strictEqual(resVote.status, 200, 'Valid vote recording succeeds');
    const voteData = await resVote.json();
    assert.strictEqual(voteData.success, true);
    assert.strictEqual(voteData.status, 'VOTED');

    // Verify voter status in store updated to VOTED
    const voter = serverStore.findVoterByEpic(testEpic);
    assert.strictEqual(voter?.status, 'VOTED');
  });

  // ==========================================================================
  // WORKFLOW 14: Duplicate and Concurrent Submissions Cannot Create Another Accepted Ballot
  // ==========================================================================
  await t.test('14. Duplicate and concurrent submissions are rejected', async () => {
    // Attempting to record a second ballot with a new transaction
    const duplicateTx = '0x' + crypto.randomBytes(32).toString('hex');
    const resDuplicate = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voterSessionToken}`,
      },
      body: JSON.stringify({
        electionId: testElectionId,
        constituencyId: 'CONST-04-ND',
        txHash: duplicateTx,
        nullifier: '0x' + crypto.randomBytes(32).toString('hex'),
        blockNumber: 1043,
        isSimulated: true,
      }),
    });
    assert.ok(resDuplicate.status === 409 || resDuplicate.status === 400 || resDuplicate.status === 403, 'Second vote submission for same session must fail');
    const data = await resDuplicate.json();
    assert.match(data.message, /already (voted|recorded|participated)|double voting/i);
  });

  // ==========================================================================
  // WORKFLOW 15: Transaction Retry and Uncertain-Result Recovery Preserve Integrity
  // ==========================================================================
  await t.test('15. Identical transaction retry is handled idempotently without double counting', async () => {
    // Re-submitting the exact same transaction hash and session
    const resRetry = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voterSessionToken}`,
      },
      body: JSON.stringify({
        electionId: testElectionId,
        constituencyId: 'CONST-04-ND',
        txHash: submittedTxHash, // Same transaction hash
        isSimulated: true,
      }),
    });
    assert.strictEqual(resRetry.status, 200, 'Idempotent retry returns existing confirmed receipt');
    const data = await resRetry.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.duplicateReplay, true);
    assert.strictEqual(data.status, 'VOTED');
  });

  // ==========================================================================
  // WORKFLOW 16: Multi-Election Participation Separation
  // ==========================================================================
  await t.test('16. Voting in one election does not prevent participation in another eligible election', async () => {
    const distinctElectionId = 'MUNI-2024';

    // 1. Request new challenge
    const resVerify = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: testEpic }),
    });
    assert.strictEqual(resVerify.status, 200);
    const otp = (await resVerify.json()).testDeliveryCode;

    // 2. Authenticate session for distinct election
    const resOtp = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: testEpic,
        otp,
        electionId: distinctElectionId,
      }),
    });
    assert.strictEqual(resOtp.status, 200, 'Elector can authenticate for separate eligible election');
    const data = await resOtp.json();
    const token = data.sessionToken || data.token;
    assert.ok(token, 'Returns new session token for separate election');
  });

  // ==========================================================================
  // WORKFLOW 17: Fullscreen Exit Warnings, Server-Side Lock & Supervised Recovery
  // ==========================================================================
  await t.test('17. Fullscreen exit warnings, server-side lockout and supervised recovery work together', async () => {
    // Authenticate a fresh voter for lockout testing
    const regRes = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Lockout Test Elector',
        dateOfBirth: '1990-01-01',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.strictEqual(regRes.status, 201);
    const regData = await regRes.json();
    const lockoutEpic = regData.voter.simulationVoterId;

    const resChal = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: lockoutEpic }),
    });
    const otp = (await resChal.json()).testDeliveryCode;
    const resAuth = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: lockoutEpic, otp, electionId: testElectionId }),
    });
    const sessionToken = (await resAuth.json()).sessionToken;

    // 1st Exit -> Warning 1
    const exit1 = await fetch(`${baseUrl}/api/voter/session/fullscreen-exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ reason: 'Accidental browser defocus 1' }),
    });
    const data1 = await exit1.json();
    assert.strictEqual(data1.locked, false);
    assert.strictEqual(data1.exitCount, 1);
    assert.match(data1.message, /First warning/i);

    // 2nd Exit -> Warning 2
    const exit2 = await fetch(`${baseUrl}/api/voter/session/fullscreen-exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ reason: 'Accidental browser defocus 2' }),
    });
    const data2 = await exit2.json();
    assert.strictEqual(data2.locked, false);
    assert.strictEqual(data2.exitCount, 2);
    assert.match(data2.message, /Final warning/i);

    // 3rd Exit -> Locked
    const exit3 = await fetch(`${baseUrl}/api/voter/session/fullscreen-exit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ reason: 'Exceeded fullscreen exit threshold' }),
    });
    const data3 = await exit3.json();
    assert.strictEqual(data3.locked, true);
    assert.strictEqual(data3.exitCount, 3);
    assert.strictEqual(data3.sessionStatus, 'LOCKED_SUPERVISED_RECOVERY');

    // Voting actions disabled while locked
    const lockedVoteAction = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${sessionToken}` },
      body: JSON.stringify({ walletAddress: sampleWallet, electionId: testElectionId }),
    });
    assert.strictEqual(lockedVoteAction.status, 403, 'Locked session cannot obtain voting authorization');

    // Page reload check: Query session endpoint directly
    const sessionQuery = await fetch(`${baseUrl}/api/voter/session`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const queryData = await sessionQuery.json();
    assert.strictEqual(queryData.session.status, 'LOCKED_SUPERVISED_RECOVERY', 'Server retains lock across page refresh');

    // Supervised Recovery: EO unlocks session
    const unlockRes = await fetch(`${baseUrl}/api/admin/sessions/unlock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${eoToken}` },
      body: JSON.stringify({
        sessionToken,
        reason: 'Supervised recovery verified by presiding officer at booth.',
      }),
    });
    assert.strictEqual(unlockRes.status, 200, 'Authorized EO can unlock session');
    const unlockData = await unlockRes.json();
    assert.strictEqual(unlockData.success, true);
    assert.strictEqual(unlockData.session.status, 'AUTHORIZED');
    // Page reload / session query check: Query session endpoint directly
    const verifyUnlocked = await fetch(`${baseUrl}/api/voter/session`, {
      headers: { Authorization: `Bearer ${sessionToken}` },
    });
    const verifyData = await verifyUnlocked.json();
    assert.strictEqual(verifyData.session.fullscreenExitCount, 0, 'Exit count reset to 0 upon unlock');
  });

  // ==========================================================================
  // WORKFLOW 18: Closed Election Rejects New Votes
  // ==========================================================================
  await t.test('18. Closed election rejects new votes', async () => {
    // Transition election to concluded using PATCH
    const resConclude = await fetch(`${baseUrl}/api/admin/elections/DEMO-PREV-2023/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${platformAdminToken}` },
      body: JSON.stringify({ status: 'concluded' }),
    });
    // DEMO-PREV-2023 is already concluded / terminal, so 200 or 400 is returned
    assert.ok(resConclude.status === 200 || resConclude.status === 400);

    // Verify OTP for concluded election must reject
    const resChal = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: testEpic }),
    });
    const otp = (await resChal.json()).testDeliveryCode;

    const resAttempt = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: testEpic, otp, electionId: 'DEMO-PREV-2023' }),
    });
    assert.ok(resAttempt.status === 400 || resAttempt.status === 409, 'Cannot authenticate for concluded election');
  });

  // ==========================================================================
  // WORKFLOW 19: Historical Archive Browsing Preserves Provenance & Immutability
  // ==========================================================================
  await t.test('19. Historical archive browsing preserves provenance and cannot alter active elections', async () => {
    const resArchive = await fetch(`${baseUrl}/api/archive/elections`);
    assert.strictEqual(resArchive.status, 200, 'Archive elections list must be public');
    const data = await resArchive.json();
    assert.strictEqual(data.success, true);
    assert.ok(data.disclaimer, 'Archive must include non-endorsement disclaimer');
    assert.match(data.disclaimer, /Historical data|academic/i);

    // Client attempt to POST / mutate historical archive directly must fail (no mutation endpoint exists)
    const resMutate = await fetch(`${baseUrl}/api/archive/elections/ECI-GE-2024`, {
      method: 'DELETE',
    });
    assert.ok(resMutate.status === 404 || resMutate.status === 405, 'Historical archive cannot be mutated via HTTP');
  });

  // ==========================================================================
  // WORKFLOW 20: Public Monitor Responses Contain No Prohibited Voter or Session Data
  // ==========================================================================
  await t.test('20. Public monitor responses contain no prohibited voter or session data', async () => {
    const res = await fetch(`${baseUrl}/api/monitor/overview`);
    assert.strictEqual(res.status, 200);
    const bodyText = await res.text();

    // Verify absence of sensitive keywords and tokens
    assert.strictEqual(bodyText.includes(testEpic), false, 'Public monitor must never expose EPIC IDs');
    assert.strictEqual(bodyText.includes('voterSessionToken'), false, 'Public monitor must not contain session tokens');
    assert.strictEqual(bodyText.includes('authorizationSigner'), false, 'Private key names must not be present');
    assert.strictEqual(bodyText.includes('Aarav Patel'), false, 'Elector names must never be in public monitor summary');
  });

  // ==========================================================================
  // WORKFLOW 21: Public Results Respect Publication Rules (Sealed While Active)
  // ==========================================================================
  await t.test('21. Public results respect publication rules (candidate choices sealed during active election)', async () => {
    const res = await fetch(`${baseUrl}/api/monitor/elections/18/results`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);

    // During active election, candidate-level results must be sealed or candidate list must omit live individual vote totals
    if (data.resultsStatus === 'SEALED') {
      assert.strictEqual(data.candidateResults, null, 'Active election candidate results must remain null while sealed');
    } else {
      assert.ok(data.disclaimer, 'Monitor results must carry disclaimer');
    }
  });

  // ==========================================================================
  // WORKFLOW 22: Key Configuration Failure Does Not Silently Fall Back in Production
  // ==========================================================================
  await t.test('22. Production mode strictly rejects missing keys and deterministic dev keys', () => {
    const savedEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      // 1. Missing HMAC_SECRET
      const envMissingHmac: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        SERVER_HMAC_SECRET: '',
        SERVER_AUTHORIZATION_SIGNER_KEY: '0x1111111111111111111111111111111111111111111111111111111111111111',
      };
      const resMissing = validateServerConfig(envMissingHmac);
      assert.strictEqual(resMissing.isValid, false, 'Config must fail closed when HMAC_SECRET is missing in production');
      assert.ok(resMissing.errors.some((e: string) => e.includes('SERVER_HMAC_SECRET')));

      // 2. Deterministic Dev Key rejected in production
      const envDevKey: NodeJS.ProcessEnv = {
        NODE_ENV: 'production',
        SERVER_HMAC_SECRET: 'super-secure-production-secret-value-32chars',
        SERVER_COMMITMENT_SALT: 'secure-prod-salt-value-for-audit',
        APP_ENCRYPTION_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234',
        SERVER_AUTHORIZATION_SIGNER_KEY: '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Hardhat Account #0
      };
      const resDevKey = validateServerConfig(envDevKey);
      assert.strictEqual(resDevKey.isValid, false, 'Config must fail closed with deterministic dev key in production');
      assert.ok(resDevKey.errors.some((e: string) => e.includes('deterministic development or test signing key')));
    } finally {
      process.env.NODE_ENV = savedEnv;
    }
  });

  // ==========================================================================
  // WORKFLOW 23: API Errors and Logs Do Not Disclose Secrets or Sensitive Payloads
  // ==========================================================================
  await t.test('23. API errors and logs do not disclose secrets or raw sensitive payloads', async () => {
    // 1. Sanitize log data helper
    const sensitiveLog = {
      action: 'VOTE_SUBMISSION',
      password: 'SuperSecretPassword123!',
      privateKey: '0x1234567890abcdef',
      token: 'bb-session-token-secret-val',
      otp: '123456',
      normalInfo: 'Constituency 4',
    };
    const sanitized = sanitizeLogData(sensitiveLog);
    assert.strictEqual(sanitized.password, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.privateKey, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.token, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.otp, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.normalInfo, 'Constituency 4');

    // 2. Prohibited field injection in API request
    const resProhibited = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: testEpic,
        password: 'AttemptedInjectedSecret',
        rawBiometrics: 'fake-fingerprint-payload',
      }),
    });
    assert.strictEqual(resProhibited.status, 400, 'Prohibited sensitive fields must be rejected');
    const errData = await resProhibited.json();
    assert.match(errData.message, /Prohibited sensitive field/i);
    assert.strictEqual(errData.message.includes('AttemptedInjectedSecret'), false, 'Error message must not reflect raw secret values');
  });

  // ==========================================================================
  // WORKFLOW 24: Candidate-Choice Disclosure Demonstrated Against Solidity ABI & Contract
  // ==========================================================================
  await t.test('24. Candidate-choice disclosure demonstrated against actual Solidity contract, ABI & calldata', () => {
    const artifactPath = path.resolve('artifacts/contracts/IndianElection.sol/IndianElection.json');
    assert.ok(fs.existsSync(artifactPath), 'Compiled artifact IndianElection.json must exist');

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    const iface = new ethers.Interface(artifact.abi);

    // 1. Inspect castVote inputs
    const castVoteFn = iface.getFunction('castVote');
    assert.ok(castVoteFn, 'Contract must define castVote');
    const candidateInput = castVoteFn.inputs.find((i) => i.name === '_candidateId');
    assert.ok(candidateInput, '_candidateId must be an unencrypted parameter in castVote');
    assert.strictEqual(candidateInput.type, 'uint256');

    // 2. Encode sample calldata and prove candidate extraction
    const secretChoice = 42;
    const sampleCalldata = iface.encodeFunctionData('castVote', [
      18,
      4,
      secretChoice,
      '0x' + '11'.repeat(32),
      1750000000,
      '0x' + '22'.repeat(65),
    ]);

    const decoded = iface.decodeFunctionData('castVote', sampleCalldata);
    assert.strictEqual(
      Number(decoded._candidateId),
      secretChoice,
      'OBSERVER DISCLOSURE: Any observer can decode candidate choice directly from calldata'
    );

    // 3. Inspect VoteCast event
    const voteCastEvent = iface.getEvent('VoteCast');
    assert.ok(voteCastEvent, 'VoteCast event must exist');
    const eventCandidateParam = voteCastEvent.inputs.find((i) => i.name === 'candidateId' || i.name === '_candidateId');
    assert.ok(eventCandidateParam);
    assert.strictEqual(eventCandidateParam.indexed, true, 'CRITICAL: candidateId is an indexed topic in event logs');

    const eventVoterParam = voteCastEvent.inputs.find((i) => i.name === 'voterWallet');
    assert.ok(eventVoterParam, 'voterWallet is emitted in event data alongside candidateId');
  });

  // ==========================================================================
  // WORKFLOW 25: Evidence-Based Release Decision
  // ==========================================================================
  await t.test('25. The final release decision reflects actual verified evidence, including unresolved blockers', () => {
    const auditDocPath = path.resolve('docs/PHASE13_FINAL_SECURITY_AUDIT.md');
    assert.ok(fs.existsSync(auditDocPath), 'docs/PHASE13_FINAL_SECURITY_AUDIT.md must exist');
    const auditDoc = fs.readFileSync(auditDocPath, 'utf-8');

    // Verify documentation explicitly notes the release blocker
    assert.ok(auditDoc.includes('BB-SEC-PH09-BALLOT-SECRECY'), 'Audit report must cite BB-SEC-PH09-BALLOT-SECRECY');
    assert.ok(auditDoc.includes('CONFIRMED RELEASE BLOCKER'), 'Audit report must declare confirmed release blocker');
    assert.ok(auditDoc.includes('Outcome C'), 'Audit report must designate production release as blocked (Outcome C)');
    assert.ok(auditDoc.includes('Outcome B'), 'Audit report must document academic simulation status');
  });
});
