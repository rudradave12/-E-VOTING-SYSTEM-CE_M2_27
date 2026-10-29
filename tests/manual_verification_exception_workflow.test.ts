/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';

import {
  adminRouter,
  clearAdminSessionsForTesting,
  clearPendingRegistrationsForTesting,
} from '../backend/server/routes/admin';
import { voterRouter } from '../backend/server/routes/voter';
import { serverStore } from '../backend/server/store';
import {
  clearOfficerSessionsForTesting,
  createOfficerSession,
  registerOfficerSessionForTesting,
} from '../backend/server/auth/rbac';
import { clearStaffCredentialsForTesting } from '../backend/server/auth/credentials';
import { getDataRepositories } from '../backend/server/repositories';
import { AuthorityAccount, SCHEMA_VERSION_CURRENT } from '../frontend/src/types/dataModel';

test('BlockBallot — Manual Verification Button, Status Lifecycle & Backend Audit Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  let vroToken: string;
  let eoToken: string;
  let outOfScopeEoToken: string;

  const testConstituency = 'CONST-04-ND';
  const outOfScopeConstituency = 'CONST-99-OUT';

  t.before(async () => {
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
    clearPendingRegistrationsForTesting();
    clearStaffCredentialsForTesting();

    // 1. VRO Session (in-scope for CONST-04-ND)
    const vroAccount: AuthorityAccount = {
      id: 'VRO-SIM-001',
      email: 'vro.sim001@blockballot.local',
      displayName: 'Simulated Registration Officer',
      role: 'VOTER_REGISTRATION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: [testConstituency],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const vroSession = createOfficerSession(vroAccount);
    vroToken = vroSession.token;
    registerOfficerSessionForTesting(vroSession);

    // 2. Election Officer Session (in-scope for CONST-04-ND)
    const eoAccount: AuthorityAccount = {
      id: 'EO-SIM-001',
      email: 'eo.sim001@blockballot.local',
      displayName: 'Primary Election Officer',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: [testConstituency],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const eoSession = createOfficerSession(eoAccount);
    eoToken = eoSession.token;
    registerOfficerSessionForTesting(eoSession);

    // 3. Out-of-Scope Election Officer Session
    const outOfScopeEoAccount: AuthorityAccount = {
      id: 'EO-SIM-999',
      email: 'eo.sim999@blockballot.local',
      displayName: 'Out of Scope Officer',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'Uttar Pradesh',
        district: 'Varanasi',
        constituencyIds: [outOfScopeConstituency],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const outOfScopeSession = createOfficerSession(outOfScopeEoAccount);
    outOfScopeEoToken = outOfScopeSession.token;
    registerOfficerSessionForTesting(outOfScopeSession);
  });

  t.after(async () => {
    clearAdminSessionsForTesting();
    clearOfficerSessionsForTesting();
    clearPendingRegistrationsForTesting();
    clearStaffCredentialsForTesting();
    serverStore.resetDefaults();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  let draftPendingId: string;
  let exceptionId1: string;
  let exceptionId2: string;
  let faceExceptionId: string;

  // Scenario 1: VRO initiates voter registration draft (Step 1)
  await t.test('Scenario 1: VRO initiates voter registration draft', async () => {
    const res = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Aarav Manual Sharma',
        dateOfBirth: '1995-05-15',
        gender: 'M',
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyId: testConstituency,
        pollingStation: 'Station 14 - Connaught Place',
        mobileNumber: '9876543210',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201, `Failed to initiate draft: ${data.message}`);
    assert.ok(data.pendingId, 'Pending draft ID must be generated');
    assert.equal(data.registrationStep, 2, 'Should advance to step 2');
    draftPendingId = data.pendingId;
  });

  // Scenario 2: VRO requests manual physical-ID verification exception for draft (Fingerprint)
  await t.test('Scenario 2: VRO requests manual exception for draft registration', async () => {
    const res = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        voterId: draftPendingId,
        purpose: 'ENROLLMENT',
        modality: 'FINGERPRINT',
        reasonCode: 'FINGERPRINT_SCANNER_NOT_DETECTED',
        note: 'USB biometric sensor platen not responding; physical ID presented',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201, `Failed to request exception: ${data.message}`);
    assert.ok(data.exception, 'Exception record must be returned');
    assert.equal(data.exception.status, 'PENDING');
    assert.equal(data.exception.voterId, draftPendingId);
    assert.equal(data.exception.modality, 'FINGERPRINT');
    exceptionId1 = data.exception.id;
  });

  // Scenario 3: Verify draft status updates to PENDING_MANUAL_REVIEW
  await t.test('Scenario 3: Draft record reflects PENDING_MANUAL_REVIEW status', async () => {
    const res = await fetch(`${baseUrl}/api/admin/voters/pending/${draftPendingId}`, {
      headers: {
        Authorization: `Bearer ${vroToken}`,
      },
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.pendingRegistration);
    assert.equal(data.pendingRegistration.status, 'VERIFICATION_IN_PROGRESS');
    assert.equal(data.pendingRegistration.fingerprintVerification.status, 'PENDING_MANUAL_REVIEW');
  });

  // Scenario 4: Requesting verification does NOT auto-approve biometrics; finalization blocked
  await t.test('Scenario 4: Requesting exception does NOT auto-approve biometrics or permit finalization', async () => {
    const res = await fetch(`${baseUrl}/api/admin/voters/finalize-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId: draftPendingId,
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 400, 'Finalization must be blocked while manual review is pending');
    assert.match(data.message, /Mandatory fingerprint verification/i);
  });

  // Scenario 5: Duplicate request returns 409 Conflict
  await t.test('Scenario 5: Duplicate manual verification request returns 409 Conflict', async () => {
    const res = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        voterId: draftPendingId,
        purpose: 'ENROLLMENT',
        modality: 'FINGERPRINT',
        reasonCode: 'FINGERPRINT_SCANNER_NOT_DETECTED',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 409, 'Duplicate pending request must return 409 Conflict');
    assert.match(data.message, /pending enrollment exception request already exists/i);
  });

  // Scenario 6: Separation of duties — Requester cannot approve their own exception
  await t.test('Scenario 6: Separation of duties prevents requester from approving own exception', async () => {
    // 6a: VRO cannot approve because they lack VOTER_EXCEPTION_APPROVE
    const vroApprRes = await fetch(`${baseUrl}/api/admin/exceptions/${exceptionId1}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Self-approval attempt by requesting officer',
      }),
    });
    const vroApprData = await vroApprRes.json();
    assert.equal(vroApprRes.status, 403, 'VRO must lack approval permission');
    assert.match(vroApprData.message, /lacks required permission 'VOTER_EXCEPTION_APPROVE'/i);

    // 6b: Create an exception requested by EO-SIM-001 (who has VOTER_EXCEPTION_APPROVE)
    const repos = getDataRepositories();
    const eoRequestedExId = 'EX-REQ-EO-SELF-TEST';
    await repos.exceptions.createRequest({
      id: eoRequestedExId,
      schemaVersion: SCHEMA_VERSION_CURRENT,
      voterId: 'voter_self_appr_test_id',
      simulationVoterId: 'voter_self_appr_test_id',
      constituencyId: testConstituency,
      purpose: 'ENROLLMENT',
      modality: 'FACE',
      requestedByOfficerId: 'EO-SIM-001',
      requestedByOfficerRole: 'ELECTION_OFFICER',
      requestedAt: Date.now(),
      reasonCode: 'CAMERA_UNAVAILABLE',
      status: 'PENDING',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    // EO-SIM-001 attempts to approve their own request
    const eoSelfRes = await fetch(`${baseUrl}/api/admin/exceptions/${eoRequestedExId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'EO attempting to self-approve own exception request',
      }),
    });
    const eoSelfData = await eoSelfRes.json();
    assert.equal(eoSelfRes.status, 403, 'Requester must not be allowed to approve own exception');
    assert.match(eoSelfData.message, /Separation of duties violation/i);
  });

  // Scenario 7: Out-of-scope Election Officer cannot approve exception
  await t.test('Scenario 7: Out-of-scope Election Officer receives 403 Forbidden', async () => {
    const res = await fetch(`${baseUrl}/api/admin/exceptions/${exceptionId1}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${outOfScopeEoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Out of scope approval attempt',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 403, 'Out-of-scope approval must be forbidden');
    assert.match(data.message, /Scope violation/i);
  });

  // Scenario 8: Election Officer declines exception
  await t.test('Scenario 8: In-scope Election Officer declines exception with audited reason', async () => {
    const res = await fetch(`${baseUrl}/api/admin/exceptions/${exceptionId1}/decline`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Physical document laminated poorly; requested fresh original government ID card',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 200, `Failed to decline exception: ${data.message}`);
    assert.equal(data.exception.status, 'DECLINED');
    assert.equal(data.exception.decisionOutcome, 'MANUAL_PHYSICAL_ID_DECLINED');

    // Check draft reflects unsuccessful status
    const pendingRes = await fetch(`${baseUrl}/api/admin/voters/pending/${draftPendingId}`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    const pendingData = await pendingRes.json();
    assert.equal(pendingData.pendingRegistration.fingerprintVerification.status, 'UNSUCCESSFUL');
  });

  // Scenario 9: VRO submits new manual verification request after previous decline
  await t.test('Scenario 9: VRO submits second manual exception request with corrected documents', async () => {
    const res = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        voterId: draftPendingId,
        purpose: 'ENROLLMENT',
        modality: 'FINGERPRINT',
        reasonCode: 'WORN_FRICTION_RIDGES',
        note: 'Fresh original voter physical card and passport presented for in-person review',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201, `Failed to re-submit exception: ${data.message}`);
    assert.ok(data.exception);
    assert.equal(data.exception.status, 'PENDING');
    exceptionId2 = data.exception.id;
  });

  // Scenario 10: In-scope Election Officer approves exception
  await t.test('Scenario 10: In-scope Election Officer approves exception; draft marked VERIFIED', async () => {
    const res = await fetch(`${baseUrl}/api/admin/exceptions/${exceptionId2}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Inspected original government passport and election identity card in person. Approved.',
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 200, `Failed to approve exception: ${data.message}`);
    assert.equal(data.exception.status, 'APPROVED');
    assert.equal(data.exception.decisionOutcome, 'MANUAL_PHYSICAL_ID_APPROVED');

    // Verify draft status in pendingRegistrations
    const pendingRes = await fetch(`${baseUrl}/api/admin/voters/pending/${draftPendingId}`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    const pendingData = await pendingRes.json();
    assert.equal(pendingData.pendingRegistration.fingerprintVerification.status, 'VERIFIED');
    assert.equal(pendingData.pendingRegistration.fingerprintVerification.verifiedByOfficerId, 'EO-SIM-001');
    assert.match(pendingData.pendingRegistration.fingerprintVerification.notes, /Manual physical-ID exception approved/);
  });

  // Scenario 11: Photo verification check requires prior fingerprint verification (now satisfied)
  await t.test('Scenario 11: Photo verification allowed to proceed after fingerprint approval', async () => {
    // Stage 3 cannot finalize without photo verification
    const preFinalizeRes = await fetch(`${baseUrl}/api/admin/voters/finalize-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId: draftPendingId }),
    });
    const preData = await preFinalizeRes.json();
    assert.equal(preFinalizeRes.status, 400);
    assert.match(preData.message, /Mandatory photo verification/i);
  });

  // Scenario 12: VRO requests manual exception for Face modality; EO approves
  await t.test('Scenario 12: VRO requests manual exception for Face; EO approves', async () => {
    const reqRes = await fetch(`${baseUrl}/api/admin/exceptions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        voterId: draftPendingId,
        purpose: 'ENROLLMENT',
        modality: 'FACE',
        reasonCode: 'CAMERA_UNAVAILABLE',
        note: 'Camera media device unavailable in field station; verified original physical photo ID card',
      }),
    });
    const reqData = await reqRes.json();
    assert.equal(reqRes.status, 201);
    faceExceptionId = reqData.exception.id;

    const apprRes = await fetch(`${baseUrl}/api/admin/exceptions/${faceExceptionId}/approve`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        decisionReason: 'Physically inspected government passport photo match in person',
      }),
    });
    const apprData = await apprRes.json();
    assert.equal(apprRes.status, 200);
    assert.equal(apprData.exception.status, 'APPROVED');

    // Verify draft photo status
    const pendingRes = await fetch(`${baseUrl}/api/admin/voters/pending/${draftPendingId}`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    const pendingData = await pendingRes.json();
    assert.equal(pendingData.pendingRegistration.photoVerification.status, 'APPROVED');
  });

  // Scenario 13: Finalize registration succeeds with manual exceptions preserved in biometric metadata
  let createdVoterId: string;
  let simulationVoterId: string;

  await t.test('Scenario 13: Finalize registration succeeds and records MANUALLY_APPROVED biometric metadata', async () => {
    const res = await fetch(`${baseUrl}/api/admin/voters/finalize-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId: draftPendingId,
      }),
    });

    const data = await res.json();
    assert.equal(res.status, 201, `Failed to finalize registration: ${data.message}`);
    assert.ok(data.voter);
    assert.ok(data.voter.simulationVoterId);
    assert.equal(data.voter.registrationStatus, 'REGISTERED');
    assert.equal(data.voter.eligibilityStatus, 'ELIGIBLE');

    createdVoterId = data.voter.id;
    simulationVoterId = data.voter.simulationVoterId;

    // Check biometric metadata records: must be MANUALLY_APPROVED, never ENROLLED
    const repos = getDataRepositories();
    const fpBio = await repos.biometrics.getMetadata(createdVoterId, 'FINGERPRINT');
    assert.ok(fpBio, 'Fingerprint biometric metadata must be saved');
    assert.equal(fpBio.status, 'MANUALLY_APPROVED');
    assert.equal(fpBio.isManualException, true);
    assert.equal(fpBio.qualityCheckStatus, 'EXEMPTED');

    const faceBio = await repos.biometrics.getMetadata(createdVoterId, 'FACE');
    assert.ok(faceBio, 'Face biometric metadata must be saved');
    assert.equal(faceBio.status, 'MANUALLY_APPROVED');
    assert.equal(faceBio.isManualException, true);
    assert.equal(faceBio.qualityCheckStatus, 'EXEMPTED');
  });

  // Scenario 14: Exception records remain queryable and auditable in exception queue
  await t.test('Scenario 14: Exception records visible and auditable via GET /api/admin/exceptions', async () => {
    const res = await fetch(`${baseUrl}/api/admin/exceptions?voterId=${draftPendingId}`, {
      headers: {
        Authorization: `Bearer ${eoToken}`,
      },
    });

    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.exceptions);
    assert.ok(data.exceptions.length >= 2, 'Should list both fingerprint and face exception requests');

    const fpRecord = data.exceptions.find((e: any) => e.id === exceptionId2);
    assert.ok(fpRecord);
    assert.equal(fpRecord.status, 'APPROVED');
    assert.equal(fpRecord.reviewedByOfficerId, 'EO-SIM-001');

    const faceRecord = data.exceptions.find((e: any) => e.id === faceExceptionId);
    assert.ok(faceRecord);
    assert.equal(faceRecord.status, 'APPROVED');
  });
});
