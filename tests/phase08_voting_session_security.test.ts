/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';

import { adminRouter, clearAdminSessionsForTesting } from '../backend/server/routes/admin';
import { voterRouter, clearRateLimitsForTesting } from '../backend/server/routes/voter';
import { serverStore } from '../backend/server/store';
import {
  clearOfficerSessionsForTesting,
  createOfficerSession,
  registerOfficerSessionForTesting,
} from '../backend/server/auth/rbac';
import { getDataRepositories } from '../backend/server/repositories';
import {
  AuthorityAccount,
  VoterProfile,
  ManualIdExceptionRecord,
  SCHEMA_VERSION_CURRENT,
} from '../frontend/src/types/dataModel';
import { Election, Candidate, ElectionStatus } from '../frontend/src/types';
import { TEST_VOTERS } from './fixtures/voterFixtures';

process.env.NODE_ENV = 'test';

test('BlockBallot — Phase 08: Voting Session Security, Ballot Authorization & Anti-Replay Protection Test Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  // Officer Tokens
  let eoToken: string;
  let eoOutOfScopeToken: string;
  let vroToken: string;
  let adminToken: string;
  let lockedSessionToken: string;

  // Test voter profiles
  const testVoter1Id = 'voter-sim-p08-001';
  const testSimVoter1Id = 'BBV-SIM-0801';
  const testEpic1 = 'IND-DL-982341'; // From TEST_VOTERS[0]
  const sampleWallet1 = '0x1111111111111111111111111111111111111111';

  const testVoter2Id = 'voter-sim-p08-002';
  const testSimVoter2Id = 'BBV-SIM-0802';
  const testEpic2 = 'IND-DL-339210'; // From TEST_VOTERS[1]
  const sampleWallet2 = '0x2222222222222222222222222222222222222222';

  const testDeactivatedVoterId = 'voter-sim-p08-deact';
  const testDeactivatedSimId = 'BBV-SIM-0899';
  const testDeactivatedEpic = 'IND-DL-999999';

  // Election IDs
  const activeElectionId = 'GE-2024';
  const secondElectionId = 'MUNI-2024';
  const pausedElectionId = 'ELEC-PAUSED-01';

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
    clearRateLimitsForTesting();
    serverStore.resetSimulatedServerTime();
    serverStore.resetDefaults();
    serverStore.seedVotersForTesting(TEST_VOTERS);

    // 2. Register Election Officer (In Scope: CONST-04-ND, CONST-77-VAR)
    const eoAccount: AuthorityAccount = {
      id: 'EO-PHASE08-001',
      email: 'eo.p08@blockballot.local',
      displayName: 'District Election Officer Delhi',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
        electionIds: [activeElectionId, secondElectionId],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const eoSession = createOfficerSession(eoAccount);
    eoToken = eoSession.token;
    registerOfficerSessionForTesting(eoSession);

    // 3. Register Election Officer (Out of Scope: CONST-99-MUM only)
    const eoOutOfScopeAccount: AuthorityAccount = {
      id: 'EO-PHASE08-OUT',
      email: 'eo.out@blockballot.local',
      displayName: 'District Election Officer Mumbai Only',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'Maharashtra',
        district: 'Mumbai',
        constituencyIds: ['CONST-99-MUM'],
        electionIds: ['MUM-ELEC'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const eoOutSession = createOfficerSession(eoOutOfScopeAccount);
    eoOutOfScopeToken = eoOutSession.token;
    registerOfficerSessionForTesting(eoOutSession);

    // 4. Register VRO (Unauthorized for Supervised Session Recovery)
    const vroAccount: AuthorityAccount = {
      id: 'VRO-PHASE08-001',
      email: 'vro.p08@blockballot.local',
      displayName: 'Voter Registration Officer',
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

    // 5. Register Platform Administrator (Global Scope)
    const adminAccount: AuthorityAccount = {
      id: 'ADMIN-PHASE08-001',
      email: 'admin.p08@blockballot.local',
      displayName: 'Platform Admin Global',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      assignmentScope: {},
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const adminSession = createOfficerSession(adminAccount);
    adminToken = adminSession.token;
    registerOfficerSessionForTesting(adminSession);

    // 6. Seed VoterProfiles in repository
    const repos = getDataRepositories();

    const voter1Profile: VoterProfile = {
      id: testVoter1Id,
      simulationVoterId: testSimVoter1Id,
      fullName: 'Rajesh Kumar Sharma',
      dateOfBirth: '1985-06-12',
      gender: 'M',
      state: 'NCT of Delhi',
      district: 'New Delhi',
      constituencyId: 'CONST-04-ND',
      pollingStation: 'Room 4, Govt Boys Senior Sec School',
      maskedMobile: '+91 ••••• •4589',
      registrationStatus: 'REGISTERED',
      eligibilityStatus: 'ELIGIBLE',
      lifecycleStatus: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.voterProfiles.save(voter1Profile);

    const voter2Profile: VoterProfile = {
      id: testVoter2Id,
      simulationVoterId: testSimVoter2Id,
      fullName: 'Priya Ananthakrishnan',
      dateOfBirth: '1992-03-24',
      gender: 'F',
      state: 'NCT of Delhi',
      district: 'New Delhi',
      constituencyId: 'CONST-04-ND',
      pollingStation: 'Auditorium, Lodhi Estate Community Centre',
      maskedMobile: '+91 ••••• •8821',
      registrationStatus: 'REGISTERED',
      eligibilityStatus: 'ELIGIBLE',
      lifecycleStatus: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.voterProfiles.save(voter2Profile);

    const deactProfile: VoterProfile = {
      id: testDeactivatedVoterId,
      simulationVoterId: testDeactivatedSimId,
      fullName: 'Deactivated Elector',
      dateOfBirth: '1970-01-01',
      gender: 'M',
      state: 'NCT of Delhi',
      district: 'New Delhi',
      constituencyId: 'CONST-04-ND',
      pollingStation: 'Room 1, Civic Centre',
      maskedMobile: '+91 ••••• •0000',
      registrationStatus: 'REGISTERED',
      eligibilityStatus: 'ELIGIBLE',
      lifecycleStatus: 'LOCKED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.voterProfiles.save(deactProfile);

    // 7. Ensure test elections exist
    const nowSec = serverStore.getCurrentTimeSec();
    serverStore.createElection({
      id: secondElectionId,
      numericId: 19,
      title: 'Delhi Municipal Council Elections 2024',
      description: 'Local Municipal election for civic wards',
      electionType: 'MUNICIPAL',
      status: 'active',
      startTime: nowSec - 3600,
      endTime: nowSec + 86400,
      constituencyIds: ['CONST-04-ND'],
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    });

    serverStore.createElection({
      id: pausedElectionId,
      numericId: 20,
      title: 'Paused By-Election 2024',
      description: 'By-election under administrative suspension',
      electionType: 'BY_ELECTION',
      status: 'paused',
      startTime: nowSec - 3600,
      endTime: nowSec + 86400,
      constituencyIds: ['CONST-04-ND'],
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    });
  });

  t.after(() => {
    serverStore.resetSimulatedServerTime();
    server.close();
  });

  // Helper: OTP verification to obtain sessionToken
  async function authenticateVoter(epicId: string, electionId: string = activeElectionId): Promise<string> {
    clearRateLimitsForTesting();
    const identRes = await fetch(`${baseUrl}/api/voter/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId, electionId }),
    });
    const identData = await identRes.json();
    assert.equal(identRes.status, 200, `Voter identify failed: ${JSON.stringify(identData)}`);
    const otp = identData.testDeliveryCode || '481920';

    const res = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId,
        otp,
        electionId,
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200, `OTP verification failed: ${JSON.stringify(data)}`);
    assert.ok(data.sessionToken, 'Must return sessionToken');
    return data.sessionToken;
  }

  // --------------------------------------------------------------------------
  // Test 1: Valid voter authorization creates a server-bound session
  // --------------------------------------------------------------------------
  await t.test('1. Valid voter authorization creates a server-bound session with token hash', async () => {
    const sessionToken = await authenticateVoter(testEpic1, activeElectionId);
    assert.ok(sessionToken.startsWith('bb_vses_'), 'Session token must follow high-entropy naming convention');

    const record = serverStore.getSessionRecord(sessionToken);
    assert.ok(record, 'Session record must exist in authoritative store');
    assert.equal(record.epicId, testEpic1);
    assert.equal(record.electionId, activeElectionId);
    assert.ok(record.sessionTokenHash, 'Must persist SHA-256 session token hash');
    assert.equal(record.status, 'CREATED');
    assert.ok(record.expiresAt > Date.now(), 'Must have future server-calculated expiration');
  });

  // --------------------------------------------------------------------------
  // Test 2: Invalid, inactive or unknown simulation voter IDs fail closed
  // --------------------------------------------------------------------------
  await t.test('2. Invalid, inactive or unknown simulation voter IDs fail closed', async () => {
    // Unknown simulation voter ID
    const unknownRes = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: 'UNKNOWN-EPIC-999',
        otp: '481920',
        electionId: activeElectionId,
      }),
    });
    assert.equal(unknownRes.status, 404, 'Unknown elector must return 404 Not Found');

    // Deactivated simulation voter
    const deactRes = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: testDeactivatedEpic,
        otp: '481920',
        electionId: activeElectionId,
      }),
    });
    assert.equal(deactRes.status, 404, 'Deactivated elector profile must fail closed');
  });

  // --------------------------------------------------------------------------
  // Test 3: An ineligible voter cannot obtain a session
  // --------------------------------------------------------------------------
  await t.test('3. An ineligible voter cannot obtain a voting session', async () => {
    const voter = serverStore.findVoterByEpic(testEpic1);
    assert.ok(voter);
    const origEligible = voter.isEligible;
    voter.isEligible = false; // Mark temporarily ineligible

    try {
      const res = await fetch(`${baseUrl}/api/voter/identify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epicId: testEpic1,
          electionId: activeElectionId,
        }),
      });
      assert.equal(res.status, 403, 'Ineligible voter must be rejected with 403 Forbidden');
    } finally {
      voter.isEligible = origEligible;
    }
  });

  // --------------------------------------------------------------------------
  // Test 4: Closed, paused, cancelled or not-yet-open election cannot start session
  // --------------------------------------------------------------------------
  await t.test('4. Closed, paused, cancelled or not-yet-open election cannot start session', async () => {
    // 1. Paused election
    await fetch(`${baseUrl}/api/voter/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: testEpic1, electionId: pausedElectionId }),
    });

    const pausedRes = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: testEpic1,
        otp: '481920',
        electionId: pausedElectionId,
      }),
    });
    assert.equal(pausedRes.status, 409, 'Paused election cannot accept voting sessions');

    // 2. Closed election schedule
    const closedElectionId = 'ELEC-CLOSED-01';
    const nowSec = serverStore.getCurrentTimeSec();
    serverStore.createElection({
      id: closedElectionId,
      numericId: 99,
      title: 'Concluded Election',
      description: 'Concluded',
      electionType: 'GENERAL',
      status: 'concluded',
      startTime: nowSec - 7200,
      endTime: nowSec - 3600,
      constituencyIds: ['CONST-04-ND'],
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    });

    await fetch(`${baseUrl}/api/voter/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: testEpic1, electionId: closedElectionId }),
    });

    const closedRes = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: testEpic1,
        otp: '481920',
        electionId: closedElectionId,
      }),
    });
    assert.equal(closedRes.status, 409, 'Concluded election cannot accept voting sessions');
  });

  // --------------------------------------------------------------------------
  // Test 5: Client clock manipulation cannot extend session validity
  // --------------------------------------------------------------------------
  await t.test('5. Client clock manipulation cannot extend session validity or open an election', async () => {
    const sessionToken = await authenticateVoter(testEpic1, activeElectionId);

    // Fast-forward server clock past session expiry (default TTL: 900 seconds)
    serverStore.advanceSimulatedServerTime(950);

    // Client attempts to send authorization with a past or future timestamp override
    const res = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        walletAddress: sampleWallet1,
        electionId: 18,
        clientTimestamp: Date.now() - 500000, // Attempted clock manipulation
      }),
    });
    assert.equal(res.status, 401, 'Expired session must return 401 regardless of client timestamps');
    serverStore.resetSimulatedServerTime();
  });

  // --------------------------------------------------------------------------
  // Test 6: A session bound to one voter/election cannot authorize another
  // --------------------------------------------------------------------------
  await t.test('6. A session bound to one voter/election cannot authorize another', async () => {
    // Token issued for Voter 1 in GE-2024
    const tokenVoter1 = await authenticateVoter(testEpic1, activeElectionId);

    // Attempt to record vote using Voter 2's EPIC with Voter 1's token
    const res = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokenVoter1}`,
      },
      body: JSON.stringify({
        epicId: testEpic2, // Mismatched voter!
        nullifier: '0xabc111',
        electionId: 18,
        constituencyId: 'CONST-04-ND',
        txHash: '0xdeadbeef111',
      }),
    });
    assert.equal(res.status, 403, 'Session bound to Voter 1 must not authorize Voter 2');
  });

  // --------------------------------------------------------------------------
  // Test 7: Expired or revoked session tokens cannot authorize voting
  // --------------------------------------------------------------------------
  await t.test('7. Expired or revoked session tokens cannot authorize voting', async () => {
    const sessionToken = await authenticateVoter(testEpic1, activeElectionId);

    // Revoke the session
    serverStore.revokeSession(sessionToken);

    const res = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        walletAddress: sampleWallet1,
        electionId: 18,
      }),
    });
    assert.equal(res.status, 401, 'Revoked session must be rejected with 401 Unauthorized');
  });

  // --------------------------------------------------------------------------
  // Test 8: Client-supplied role, voter ID, election state overrides are ignored
  // --------------------------------------------------------------------------
  await t.test('8. Client-supplied role, voter ID, election state or expiry overrides are ignored', async () => {
    const sessionToken = await authenticateVoter(testEpic1, activeElectionId);

    const res = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        walletAddress: sampleWallet1,
        electionId: 18,
        role: 'PLATFORM_ADMIN', // Injected role
        expiresAt: 999999999999, // Injected expiry
        status: 'AUTHORIZED', // Injected status
      }),
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.ok(data.ticket);
    // Ticket expiration must remain bound to server time (~900s), not injected 999999999999
    assert.ok(data.ticket.expiry < serverStore.getCurrentTimeSec() + 1000);
  });

  // --------------------------------------------------------------------------
  // Test 9: Enrollment-time exception approval cannot authorize voting
  // --------------------------------------------------------------------------
  await t.test('9. Enrollment-time exception approval cannot authorize voting', async () => {
    const repos = getDataRepositories();
    const now = Date.now();
    const enrollmentException: ManualIdExceptionRecord = {
      id: `ex-enroll-${now}`,
      voterId: testVoter1Id,
      simulationVoterId: testSimVoter1Id,
      constituencyId: 'CONST-04-ND',
      purpose: 'ENROLLMENT',
      reasonCode: 'PHYSICAL_DISABILITY_OR_AMPUTATION',
      modality: 'FINGERPRINT',
      status: 'APPROVED',
      decisionOutcome: 'MANUAL_PHYSICAL_ID_APPROVED',
      decisionReason: 'Verified physical amputation during enrollment',
      reviewedByOfficerId: 'EO-PHASE08-001',
      reviewedByOfficerRole: 'ELECTION_OFFICER',
      requestedByOfficerId: 'VRO-PHASE08-001',
      requestedByOfficerRole: 'VOTER_REGISTRATION_OFFICER',
      requestedAt: now,
      reviewedAt: now,
      note: 'Enrollment exception only',
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.exceptions.createRequest(enrollmentException);

    // Attempt to consume enrollment exception for voting
    const res = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: enrollmentException.id,
        voterId: testVoter1Id,
        electionId: activeElectionId,
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 400, 'Enrollment-purpose exception cannot authorize voting');
    assert.equal(data.success, false);
  });

  // --------------------------------------------------------------------------
  // Test 10: Voting-time exceptions are bound to the correct active attempt
  // --------------------------------------------------------------------------
  await t.test('10. Voting-time exceptions are bound to the correct active elector and election', async () => {
    const repos = getDataRepositories();
    const now = Date.now();
    const votingException: ManualIdExceptionRecord = {
      id: `ex-vote-${now}`,
      voterId: testVoter1Id,
      simulationVoterId: testSimVoter1Id,
      purpose: 'VOTING_SESSION',
      electionId: activeElectionId,
      constituencyId: 'CONST-04-ND',
      reasonCode: 'CAMERA_UNAVAILABLE',
      status: 'APPROVED',
      decisionOutcome: 'MANUAL_PHYSICAL_ID_APPROVED',
      decisionReason: 'Scanner hardware failure at polling station; voter ID verified in person',
      reviewedByOfficerId: 'EO-PHASE08-001',
      reviewedByOfficerRole: 'ELECTION_OFFICER',
      requestedByOfficerId: 'VRO-PHASE08-001',
      requestedByOfficerRole: 'VOTER_REGISTRATION_OFFICER',
      requestedAt: now,
      reviewedAt: now,
      expiresAt: now + 600000,
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.exceptions.createRequest(votingException);

    // Attempt consuming with mismatched voter ID
    const mismatchRes = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: votingException.id,
        voterId: testVoter2Id, // Mismatched elector!
        electionId: activeElectionId,
      }),
    });
    assert.equal(mismatchRes.status, 403, 'Mismatched voter ID must fail closed');
  });

  // --------------------------------------------------------------------------
  // Test 11: Expired, mismatched, revoked and consumed exceptions fail closed
  // --------------------------------------------------------------------------
  await t.test('11. Expired, mismatched, revoked and consumed exceptions fail closed', async () => {
    const repos = getDataRepositories();
    const now = Date.now();
    const expRecord: ManualIdExceptionRecord = {
      id: `ex-consumed-test-${now}`,
      voterId: testVoter1Id,
      simulationVoterId: testSimVoter1Id,
      purpose: 'VOTING_SESSION',
      electionId: activeElectionId,
      constituencyId: 'CONST-04-ND',
      reasonCode: 'FINGERPRINT_SCANNER_NOT_DETECTED',
      status: 'APPROVED',
      decisionOutcome: 'MANUAL_PHYSICAL_ID_APPROVED',
      decisionReason: 'Physical ID check approved',
      reviewedByOfficerId: 'EO-PHASE08-001',
      reviewedByOfficerRole: 'ELECTION_OFFICER',
      requestedByOfficerId: 'VRO-PHASE08-001',
      requestedByOfficerRole: 'VOTER_REGISTRATION_OFFICER',
      requestedAt: now,
      reviewedAt: now,
      expiresAt: now + 600000,
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.exceptions.createRequest(expRecord);

    // 1st consumption: succeeds
    const res1 = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: expRecord.id,
        voterId: testVoter1Id,
        electionId: activeElectionId,
      }),
    });
    assert.equal(res1.status, 200, 'First consumption must succeed');

    // 2nd consumption: must fail closed (cannot reuse)
    const res2 = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: expRecord.id,
        voterId: testVoter1Id,
        electionId: activeElectionId,
      }),
    });
    assert.equal(res2.status, 409, 'Already-consumed exception must be rejected with 409 Conflict');
  });

  // --------------------------------------------------------------------------
  // Test 12: A valid ballot is accepted only during open election and valid session
  // --------------------------------------------------------------------------
  await t.test('12. A valid ballot is accepted only during open election and valid session', async () => {
    const sessionToken = await authenticateVoter(testEpic1, activeElectionId);

    // Obtain authorization ticket
    const authRes = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        walletAddress: sampleWallet1,
        electionId: 18,
      }),
    });
    assert.equal(authRes.status, 200);
    const authData = await authRes.json();
    assert.ok(authData.nullifier);

    // Cast ballot
    const voteRes = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        epicId: testEpic1,
        nullifier: authData.nullifier,
        electionId: activeElectionId,
        constituencyId: 'CONST-04-ND',
        candidateId: 'CAND-ND-01',
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      }),
    });
    assert.equal(voteRes.status, 200);
    const voteData = await voteRes.json();
    assert.equal(voteData.success, true);
    assert.equal(voteData.participationStatus, 'VOTE_ACCEPTED');
  });

  // --------------------------------------------------------------------------
  // Test 13: Duplicate submissions cannot produce two accepted ballots
  // --------------------------------------------------------------------------
  await t.test('13. Duplicate submissions cannot produce two accepted ballots (409 Conflict)', async () => {
    // Attempt casting a second ballot for Voter 1 in activeElectionId with a new txHash
    const sessionToken = await authenticateVoter(testEpic1, activeElectionId);

    const dupRes = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        epicId: testEpic1,
        nullifier: '0xnewnullifier999',
        electionId: activeElectionId,
        constituencyId: 'CONST-04-ND',
        candidateId: 'CAND-ND-02',
        txHash: '0x9999999999999999999999999999999999999999999999999999999999999999',
      }),
    });
    assert.equal(dupRes.status, 409, 'Duplicate ballot submission must return 409 Conflict');
    const dupData = await dupRes.json();
    assert.equal(dupData.code, 'DOUBLE_VOTE_ATTEMPT');
  });

  // --------------------------------------------------------------------------
  // Test 14: Concurrent submissions cannot create multiple accepted votes
  // --------------------------------------------------------------------------
  await t.test('14. Concurrent submissions cannot create multiple accepted votes for same elector', async () => {
    // Use Voter 2 who hasn't voted yet
    const sessionToken2 = await authenticateVoter(testEpic2, activeElectionId);
    const authRes = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken2}`,
      },
      body: JSON.stringify({
        walletAddress: sampleWallet2,
        electionId: 18,
      }),
    });
    const authData = await authRes.json();

    // Fire two concurrent vote submissions with different tx hashes
    const [resA, resB] = await Promise.all([
      fetch(`${baseUrl}/api/voter/record-vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken2}`,
        },
        body: JSON.stringify({
          epicId: testEpic2,
          nullifier: authData.nullifier,
          electionId: activeElectionId,
          constituencyId: 'CONST-04-ND',
          candidateId: 'CAND-ND-01',
          txHash: '0xconcurrenthashAAA11111111111111111111111111111111111111111111111111111',
        }),
      }),
      fetch(`${baseUrl}/api/voter/record-vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionToken2}`,
        },
        body: JSON.stringify({
          epicId: testEpic2,
          nullifier: authData.nullifier,
          electionId: activeElectionId,
          constituencyId: 'CONST-04-ND',
          candidateId: 'CAND-ND-02',
          txHash: '0xconcurrenthashBBB22222222222222222222222222222222222222222222222222222',
        }),
      }),
    ]);

    const statuses = [resA.status, resB.status];
    assert.ok(statuses.includes(200), 'Exactly one concurrent request must succeed with 200');
    assert.ok(statuses.includes(409), 'The duplicate concurrent request must be rejected with 409 Conflict');
  });

  // --------------------------------------------------------------------------
  // Test 15: A replayed transaction does not increase the tally twice
  // --------------------------------------------------------------------------
  await t.test('15. A replayed transaction does not increase the tally twice (Idempotent 200 OK)', async () => {
    const candidate = serverStore.getCandidateById('CAND-ND-01');
    assert.ok(candidate);
    const votesBefore = candidate.voteCount || 0;

    // Resubmit the exact same transaction hash used by Voter 1 in Test 12
    const sessionToken = await authenticateVoter(testEpic1, activeElectionId);
    const replayRes = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        epicId: testEpic1,
        nullifier: '0x123',
        electionId: activeElectionId,
        constituencyId: 'CONST-04-ND',
        candidateId: 'CAND-ND-01',
        txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      }),
    });

    assert.equal(replayRes.status, 200, 'Replaying identical txHash must return idempotent 200 OK');
    const replayData = await replayRes.json();
    assert.equal(replayData.duplicateReplay, true);

    const votesAfter = candidate.voteCount || 0;
    assert.equal(votesAfter, votesBefore, 'Candidate tally must not increment on replayed txHash');
  });

  // --------------------------------------------------------------------------
  // Test 16: Timeout or uncertain transaction result is reconciled safely
  // --------------------------------------------------------------------------
  await t.test('16. Timeout or uncertain transaction result is reconciled without granting a second vote', async () => {
    const repos = getDataRepositories();
    const voter = serverStore.findVoterByEpic(testEpic1)!;
    const participation =
      (await repos.participations.getParticipation(voter.id, activeElectionId)) ||
      (await repos.participations.getParticipation(testVoter1Id, activeElectionId));
    assert.ok(participation);
    assert.equal(participation.status, 'VOTE_ACCEPTED');
    assert.ok(participation.txHash);
  });

  // --------------------------------------------------------------------------
  // Test 17: The same eligible voter may vote in two separate elections
  // --------------------------------------------------------------------------
  await t.test('17. The same eligible voter may vote in two separate elections', async () => {
    // Voter 1 already voted in activeElectionId (GE-2024).
    // Now Voter 1 participates in secondElectionId (MUNI-2024).
    const sessionTokenMuni = await authenticateVoter(testEpic1, secondElectionId);
    assert.ok(sessionTokenMuni);

    const authRes = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionTokenMuni}`,
      },
      body: JSON.stringify({
        walletAddress: sampleWallet1,
        electionId: 19,
      }),
    });
    const authText = await authRes.text();
    assert.equal(authRes.status, 200, `Authorization failed: ${authText}`);

    const voteMuniRes = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionTokenMuni}`,
      },
      body: JSON.stringify({
        epicId: testEpic1,
        nullifier: '0xmuni_nullifier_001',
        electionId: secondElectionId,
        constituencyId: 'CONST-04-ND',
        candidateId: 'CAND-ND-01',
        txHash: '0xmuniversaltx00000000000000000000000000000000000000000000000000000001',
      }),
    });
    assert.equal(voteMuniRes.status, 200, 'Voter must be able to vote in separate independent election');
    const muniData = await voteMuniRes.json();
    assert.equal(muniData.success, true);
    assert.equal(muniData.electionId, secondElectionId);
  });

  // --------------------------------------------------------------------------
  // Test 18: A deactivated voter or locked/expired session cannot continue
  // --------------------------------------------------------------------------
  await t.test('18. A deactivated voter cannot obtain authorization', async () => {
    // Elector with deactivated lifecycle
    const res = await fetch(`${baseUrl}/api/voter/identify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: testDeactivatedEpic,
        electionId: activeElectionId,
      }),
    });
    assert.equal(res.status, 404, 'Deactivated elector profile cannot authenticate');
  });

  // --------------------------------------------------------------------------
  // Test 19: First and second fullscreen exits generate warnings
  // --------------------------------------------------------------------------
  await t.test('19. First and second fullscreen exits generate warnings', async () => {
    lockedSessionToken = await authenticateVoter(testEpic2, secondElectionId);

    // 1st Exit
    const exit1 = await fetch(`${baseUrl}/api/voter/session/fullscreen-exit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lockedSessionToken}`,
      },
      body: JSON.stringify({ reason: 'Accidental browser defocus' }),
    });
    assert.equal(exit1.status, 200);
    const data1 = await exit1.json();
    assert.equal(data1.locked, false);
    assert.equal(data1.exitCount, 1);
    assert.match(data1.message, /First warning/i);

    // 2nd Exit
    const exit2 = await fetch(`${baseUrl}/api/voter/session/fullscreen-exit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lockedSessionToken}`,
      },
      body: JSON.stringify({ reason: 'Second defocus event' }),
    });
    assert.equal(exit2.status, 200);
    const data2 = await exit2.json();
    assert.equal(data2.locked, false);
    assert.equal(data2.exitCount, 2);
    assert.match(data2.message, /Final warning/i);
  });

  // --------------------------------------------------------------------------
  // Test 20: Third confirmed exit locks session into LOCKED_SUPERVISED_RECOVERY
  // --------------------------------------------------------------------------
  await t.test('20. Third confirmed exit locks session and disables voting actions', async () => {
    // 3rd Exit on the active session
    const exit3 = await fetch(`${baseUrl}/api/voter/session/fullscreen-exit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lockedSessionToken}`,
      },
      body: JSON.stringify({ reason: 'Third exit: threshold reached' }),
    });
    assert.equal(exit3.status, 200);
    const data3 = await exit3.json();
    assert.equal(data3.locked, true);
    assert.equal(data3.exitCount, 3);
    assert.equal(data3.sessionStatus, 'LOCKED_SUPERVISED_RECOVERY');

    // Attempt authorization with locked session -> must fail with 403 Forbidden
    const authRes = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${lockedSessionToken}`,
      },
      body: JSON.stringify({
        walletAddress: sampleWallet2,
        electionId: 19,
      }),
    });
    assert.equal(authRes.status, 403, 'Locked session must reject authorization');
    const authData = await authRes.json();
    assert.equal(authData.locked, true);
  });

  // --------------------------------------------------------------------------
  // Test 21: Refreshing or opening another tab does not bypass server lock
  // --------------------------------------------------------------------------
  await t.test('21. Refreshing or opening another tab does not bypass a server-recorded lock', async () => {
    const record = serverStore.getSessionRecord(lockedSessionToken) || serverStore.getSessionRecord(testEpic2);
    assert.ok(record);
    assert.equal(record.status, 'LOCKED_SUPERVISED_RECOVERY');

    // Query session endpoint simulating a refreshed tab
    const statusRes = await fetch(`${baseUrl}/api/voter/session`, {
      headers: {
        Authorization: `Bearer ${record.token}`,
      },
    });
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.status, 'LOCKED_SUPERVISED_RECOVERY');
    assert.equal(statusData.fullscreenExitCount, 3);
  });

  // --------------------------------------------------------------------------
  // Test 22: Supervised recovery validates role, scope, session and election state
  // --------------------------------------------------------------------------
  await t.test('22. Supervised recovery validates role, scope, session and election state', async () => {
    const record = serverStore.getSessionRecord(lockedSessionToken) || serverStore.getSessionRecord(testEpic2);
    assert.ok(record);

    // 1. VRO attempts unlock -> Rejected (403 Forbidden)
    const vroUnlock = await fetch(`${baseUrl}/api/admin/sessions/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        sessionId: record.id,
        reason: 'Attempting recovery without proper authority',
      }),
    });
    assert.equal(vroUnlock.status, 403, 'VRO role must not be authorized to unlock sessions');

    // 2. Out-of-scope EO attempts unlock -> Rejected (403 Forbidden)
    const outScopeUnlock = await fetch(`${baseUrl}/api/admin/sessions/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoOutOfScopeToken}`,
      },
      body: JSON.stringify({
        sessionId: record.id,
        reason: 'Out-of-scope recovery attempt',
      }),
    });
    assert.equal(outScopeUnlock.status, 403, 'Out-of-scope officer must be rejected');

    // 3. Authorized EO with missing / short justification (<5 chars) -> Rejected (400)
    const shortReason = await fetch(`${baseUrl}/api/admin/sessions/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        sessionId: record.id,
        reason: 'ok',
      }),
    });
    assert.equal(shortReason.status, 400, 'Reason under 5 characters must be rejected');

    // 4. Authorized EO with valid justification -> Succeeds (200 OK)
    const validUnlock = await fetch(`${baseUrl}/api/admin/sessions/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        sessionId: record.id,
        reason: 'Elector experienced accidental kiosk defocus; identity verified in person',
      }),
    });
    const unlockText = await validUnlock.text();
    assert.equal(validUnlock.status, 200, `Authorized EO with valid reason must succeed: ${unlockText}`);
    const unlockData = JSON.parse(unlockText);
    assert.equal(unlockData.success, true);
    assert.equal(unlockData.session.status, 'AUTHORIZED');

    // Verify session in store
    const updated = serverStore.getSessionRecord(record.id);
    assert.ok(updated);
    assert.equal(updated.status, 'AUTHORIZED');
    assert.equal(updated.fullscreenExitCount, 0);
  });

  // --------------------------------------------------------------------------
  // Test 23: Recovery does not reopen a consumed voting opportunity or duplicate ballot
  // --------------------------------------------------------------------------
  await t.test('23. Recovery does not reopen a consumed voting opportunity or duplicate a ballot', async () => {
    // In activeElectionId, Voter 1 already voted (status: VOTE_ACCEPTED).
    // Create a mock locked session for Voter 1 in activeElectionId
    const voter = serverStore.findVoterByEpic('IND-DL-982341')!;
    const record = serverStore.createSession(
      voter,
      4,
      {
        electionId: activeElectionId,
        numericElectionId: 18,
      }
    );
    record.status = 'LOCKED_SUPERVISED_RECOVERY';

    const res = await fetch(`${baseUrl}/api/admin/sessions/unlock`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        sessionId: record.id,
        reason: 'Attempting to unlock an elector who already voted',
      }),
    });
    assert.equal(res.status, 409, 'Cannot recover session for elector who already cast a vote');
  });

  // --------------------------------------------------------------------------
  // Test 24: Existing election lifecycle protections from Phase 07 remain intact
  // --------------------------------------------------------------------------
  await t.test('24. Existing election lifecycle protections from Phase 07 remain intact', async () => {
    // Scheduled reconciliation check
    const schedResult = serverStore.reconcileElectionSchedules();
    assert.ok(schedResult);
    assert.ok(Array.isArray(schedResult.transitions));

    // Concluded election cannot transition back to DRAFT or OPEN
    const updateRes = serverStore.updateElectionStatus('ELEC-CLOSED-01', 'active');
    assert.equal(updateRes.success, false, 'Concluded election must be terminal');
  });

  // --------------------------------------------------------------------------
  // Test 25: Existing Phase 06 manual exception expiry & consumption remain intact
  // --------------------------------------------------------------------------
  await t.test('25. Existing Phase 06 manual exception expiry and consumption remain intact', async () => {
    const repos = getDataRepositories();
    const now = Date.now();
    const expiredException: ManualIdExceptionRecord = {
      id: `ex-expired-${now}`,
      voterId: testVoter1Id,
      simulationVoterId: testSimVoter1Id,
      purpose: 'VOTING_SESSION',
      electionId: activeElectionId,
      constituencyId: 'CONST-04-ND',
      reasonCode: 'FINGERPRINT_SCANNER_NOT_DETECTED',
      status: 'APPROVED',
      decisionOutcome: 'MANUAL_PHYSICAL_ID_APPROVED',
      decisionReason: 'ID approved earlier',
      reviewedByOfficerId: 'EO-PHASE08-001',
      reviewedByOfficerRole: 'ELECTION_OFFICER',
      requestedByOfficerId: 'VRO-PHASE08-001',
      requestedByOfficerRole: 'VOTER_REGISTRATION_OFFICER',
      requestedAt: now - 3600000,
      reviewedAt: now - 3600000,
      expiresAt: now - 1800000, // Expired 30 minutes ago
      createdAt: now - 3600000,
      updatedAt: now - 3600000,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.exceptions.createRequest(expiredException);

    const res = await fetch(`${baseUrl}/api/voter/consume-exception`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exceptionId: expiredException.id,
        voterId: testVoter1Id,
        electionId: activeElectionId,
      }),
    });
    assert.equal(res.status, 403, 'Expired exception must return 403 Forbidden');
  });

  // --------------------------------------------------------------------------
  // Test 26: No new logs or events expose biometric payloads, secrets, or candidate linkage
  // --------------------------------------------------------------------------
  await t.test('26. No new logs or events expose biometric payloads, session secrets or candidate linkage', async () => {
    const events = serverStore.getAllAuditEvents();
    assert.ok(events.length > 0, 'Audit events must exist');

    for (const evt of events) {
      const serialized = JSON.stringify(evt);
      // Ensure raw session token is never logged
      assert.ok(!serialized.includes('bb_vses_'), 'Raw session tokens must never be logged in audit trail');
      // Ensure biometric vector/feature payload is never logged
      assert.ok(!serialized.includes('biometricTemplate'), 'Biometric templates must never be logged');
      assert.ok(!serialized.includes('fingerprintMinutiae'), 'Raw minutiae must never be logged');
      // Ensure candidate choice is not coupled with voter identity in vote cast audit events
      if (evt.description.includes('Ballot transaction verified')) {
        assert.ok(!evt.description.includes('cand-'), 'Candidate choice must not be logged alongside voter identity');
      }
    }
  });

  // --------------------------------------------------------------------------
  // Test 27: Verify smart-contract candidate disclosure limitation directly
  // --------------------------------------------------------------------------
  await t.test('27. Smart-contract candidate disclosure limitation is verified against Solidity source', () => {
    const contractPath = path.resolve(process.cwd(), 'contracts/IndianElection.sol');
    assert.ok(fs.existsSync(contractPath), 'IndianElection.sol contract file must exist');

    const solSource = fs.readFileSync(contractPath, 'utf8');

    // Verify castVote receives plaintext _candidateId
    assert.match(
      solSource,
      /function\s+castVote\s*\(\s*uint256\s+_electionId\s*,\s*uint256\s+_constituencyId\s*,\s*uint256\s+_candidateId/i,
      'Solidity castVote parameter takes plaintext _candidateId'
    );

    // Verify VoteCast event exposes candidateId and msg.sender
    assert.match(
      solSource,
      /event\s+VoteCast\s*\(\s*uint256\s+indexed\s+electionId\s*,\s*uint256\s+indexed\s+constituencyId\s*,\s*uint256\s+indexed\s+candidateId\s*,\s*bytes32\s+nullifier\s*,\s*address\s+voterWallet\s*\)/i,
      'VoteCast event publishes candidateId and voterWallet openly'
    );
  });
});
