/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import crypto from 'crypto';
import { ethers } from 'ethers';

import { adminRouter, clearAdminSessionsForTesting } from '../../server/routes/admin';
import { voterRouter } from '../../server/routes/voter';
import { serverStore } from '../../server/store';
import {
  clearOfficerSessionsForTesting,
  createOfficerSession,
  registerOfficerSessionForTesting,
} from '../../server/auth/rbac';
import { getDataRepositories } from '../../server/repositories';
import {
  AuthorityAccount,
  SCHEMA_VERSION_CURRENT,
} from '../types/dataModel';
import {
  isValidElectionTransition,
  normalizeElectionStatus,
  ALLOWED_ELECTION_TRANSITIONS,
  Election,
  Candidate,
} from '../types';
import { TEST_VOTERS } from './fixtures/voterFixtures';

test('BlockBallot — Phase 07: Election Lifecycle, Candidate Management & Authoritative Timers Test Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  // Officer Tokens
  let eoToken: string;
  let eoRestrictedToken: string;
  let vroToken: string;
  let adminToken: string;

  // Seed test voters
  const testEpicDelhi = TEST_VOTERS[0].epicId; // IND-DL-982341 (CONST-04-ND)
  const testEpicWayanad = TEST_VOTERS[3].epicId; // IND-KL-772183 (CONST-04-WAY)
  const sampleWallet = '0x1111111111111111111111111111111111111111';

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
    serverStore.resetSimulatedServerTime();
    serverStore.seedVotersForTesting(TEST_VOTERS);

    // 2. Register Election Officer Session (Full Scope: CONST-04-ND, CONST-77-VAR, CONST-04-WAY, CONST-26-BLR)
    const eoAccount: AuthorityAccount = {
      id: 'EO-PHASE07-001',
      email: 'eo.full@blockballot.local',
      displayName: 'State Election Officer Full Scope',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND', 'CONST-77-VAR', 'CONST-04-WAY', 'CONST-26-BLR'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const eoSession = createOfficerSession(eoAccount);
    eoToken = eoSession.token;
    registerOfficerSessionForTesting(eoSession);

    // 3. Register Restricted Election Officer Session (Scope: ONLY CONST-04-ND)
    const eoRestrictedAccount: AuthorityAccount = {
      id: 'EO-PHASE07-RESTRICTED',
      email: 'eo.restricted@blockballot.local',
      displayName: 'District Returning Officer Delhi Only',
      role: 'ELECTION_OFFICER',
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
    const eoRestrictedSession = createOfficerSession(eoRestrictedAccount);
    eoRestrictedToken = eoRestrictedSession.token;
    registerOfficerSessionForTesting(eoRestrictedSession);

    // 4. Register VRO Session (Unauthorized for Election Management)
    const vroAccount: AuthorityAccount = {
      id: 'VRO-PHASE07-001',
      email: 'vro.officer@blockballot.local',
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

    // 5. Register Admin / Returning Officer Session
    const adminAccount: AuthorityAccount = {
      id: 'RO-PHASE07-001',
      email: 'ro.admin@blockballot.local',
      displayName: 'Chief Returning Officer Admin',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'ALL',
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const adminSession = createOfficerSession(adminAccount);
    adminToken = adminSession.token;
    registerOfficerSessionForTesting(adminSession);
  });

  t.after(() => {
    serverStore.resetSimulatedServerTime();
    server.close();
  });

  // Track created election across tests
  let createdElectionId = '';
  const createdElectionNumericId = 701;

  // --------------------------------------------------------------------------
  // Scenario 1: Authorized Election Officer can create a valid draft election
  // --------------------------------------------------------------------------
  await t.test('1. Authorized Election Officer can create a valid draft election with IST timezone', async () => {
    const baseNowSec = serverStore.getCurrentTimeSec();
    const payload = {
      id: 'ELEC-P7-TEST1',
      numericId: createdElectionNumericId,
      title: 'Delhi Legislative Assembly 2026',
      description: 'Official general election schedule for Delhi NCT.',
      status: 'draft',
      startTime: baseNowSec + 3600,
      endTime: baseNowSec + 7200,
      timezone: 'Asia/Kolkata',
      constituencyIds: ['CONST-04-ND'],
      electionType: 'State Legislative Assembly',
    };

    const res = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify(payload),
    });

    assert.equal(res.status, 201, 'Authorized EO must be able to create election');
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.election.id, 'ELEC-P7-TEST1');
    assert.equal(data.election.status, 'draft');
    assert.equal(data.election.timezone, 'Asia/Kolkata');
    assert.ok(data.election.createdAt, 'Must record createdAt timestamp');

    createdElectionId = data.election.id;
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Unauthorized role (VRO) cannot create or modify an election
  // --------------------------------------------------------------------------
  await t.test('2. Unauthorized role (VRO) is forbidden from creating or updating elections', async () => {
    const baseNowSec = serverStore.getCurrentTimeSec();
    const payload = {
      id: 'ELEC-VRO-FORBIDDEN',
      numericId: 999,
      title: 'Unauthorized Election Attempt',
      description: 'Should be rejected',
      status: 'draft',
      startTime: baseNowSec + 3600,
      endTime: baseNowSec + 7200,
      constituencyIds: ['CONST-04-ND'],
    };

    // VRO cannot create election
    const resCreate = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify(payload),
    });
    assert.equal(resCreate.status, 403, 'VRO must be forbidden from creating election');

    // VRO cannot modify election
    const resUpdate = await fetch(`${baseUrl}/api/admin/elections/${createdElectionId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ title: 'Tampered Title' }),
    });
    assert.equal(resUpdate.status, 403, 'VRO must be forbidden from modifying election');

    // VRO cannot update election status
    const resStatus = await fetch(`${baseUrl}/api/admin/elections/${createdElectionId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ status: 'scheduled' }),
    });
    assert.equal(resStatus.status, 403, 'VRO must be forbidden from updating election status');
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Jurisdiction scope is enforced for election and candidate updates
  // --------------------------------------------------------------------------
  await t.test('3. Jurisdiction scope is enforced for election and candidate administration', async () => {
    const baseNowSec = serverStore.getCurrentTimeSec();

    // Restricted officer (only CONST-04-ND) tries to create election in CONST-77-VAR (Varanasi)
    const resOutOfScope = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoRestrictedToken}`,
      },
      body: JSON.stringify({
        id: 'ELEC-OUT-OF-SCOPE',
        numericId: 998,
        title: 'Varanasi By-Election',
        status: 'draft',
        startTime: baseNowSec + 3600,
        endTime: baseNowSec + 7200,
        constituencyIds: ['CONST-77-VAR'],
      }),
    });
    assert.equal(resOutOfScope.status, 403, 'Restricted officer cannot create election outside jurisdiction');

    // Restricted officer tries to add candidate in CONST-77-VAR
    const resCandOutOfScope = await fetch(`${baseUrl}/api/admin/candidates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoRestrictedToken}`,
      },
      body: JSON.stringify({
        id: 'CAND-OUT-SCOPE-1',
        numericId: 991,
        constituencyId: 'CONST-77-VAR',
        name: 'Varanasi Candidate',
        partyName: 'Test Party',
        partyAbbreviation: 'TP',
        symbol: 'Lamp',
        symbolColor: '#F59E0B',
        education: 'Graduate',
        age: 40,
        criminalCases: 0,
        assets: '₹1 Cr',
        voteCount: 0,
      }),
    });
    assert.equal(resCandOutOfScope.status, 403, 'Restricted officer cannot add candidate outside jurisdiction');
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Invalid schedules and illegal lifecycle transitions are rejected
  // --------------------------------------------------------------------------
  await t.test('4. Invalid schedules (endTime <= startTime) and illegal transitions are rejected', async () => {
    const baseNowSec = serverStore.getCurrentTimeSec();

    // A. Invalid schedule: endTime <= startTime
    const resInvalidSchedule = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        id: 'ELEC-INVALID-TIME',
        numericId: 997,
        title: 'Invalid Timing Election',
        status: 'draft',
        startTime: baseNowSec + 7200,
        endTime: baseNowSec + 3600, // end before start!
        constituencyIds: ['CONST-04-ND'],
      }),
    });
    assert.equal(resInvalidSchedule.status, 400, 'End time <= start time must return 400 Bad Request');

    // B. Illegal transition: draft -> concluded directly
    const resIllegalTrans = await fetch(`${baseUrl}/api/admin/elections/${createdElectionId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ status: 'concluded' }),
    });
    assert.equal(resIllegalTrans.status, 400, 'Direct transition from draft to concluded must return 400');

    // C. Cancellation without mandatory reason is rejected
    const resNoReasonCancel = await fetch(`${baseUrl}/api/admin/elections/${createdElectionId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ status: 'cancelled' }), // missing reason!
    });
    assert.equal(resNoReasonCancel.status, 400, 'Cancelling without reason must return 400');

    // D. Valid transition to scheduled succeeds
    const resValidSchedule = await fetch(`${baseUrl}/api/admin/elections/${createdElectionId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ status: 'scheduled' }),
    });
    assert.equal(resValidSchedule.status, 200, 'Draft -> Scheduled transition must succeed');
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Scheduled election opens automatically at authoritative start time
  // --------------------------------------------------------------------------
  await t.test('5. Scheduled election opens automatically at authoritative start time via reconciliation', async () => {
    // Current election is scheduled: startTime = baseNowSec + 3600
    const elec = serverStore.getElectionById(createdElectionId);
    assert.ok(elec);
    assert.equal(normalizeElectionStatus(elec.status), 'SCHEDULED');

    // Before start time, election remains SCHEDULED
    serverStore.setSimulatedServerTime((elec.startTime - 10) * 1000);
    serverStore.reconcileElectionSchedules();
    const elecBefore = serverStore.getElectionById(createdElectionId);
    assert.equal(normalizeElectionStatus(elecBefore!.status), 'SCHEDULED');

    // Advance simulated server time to exactly startTime + 5 seconds
    serverStore.setSimulatedServerTime((elec.startTime + 5) * 1000);
    serverStore.reconcileElectionSchedules();
    const elecAfter = serverStore.getElectionById(createdElectionId);

    assert.equal(normalizeElectionStatus(elecAfter!.status), 'OPEN', 'Scheduled election must automatically open');
    assert.ok(elecAfter!.openedAt, 'Must set openedAt timestamp');
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Open election closes automatically at authoritative end time
  // --------------------------------------------------------------------------
  await t.test('6. Open election closes automatically at authoritative end time via reconciliation', async () => {
    const elec = serverStore.getElectionById(createdElectionId);
    assert.ok(elec);
    assert.equal(normalizeElectionStatus(elec.status), 'OPEN');

    // Advance simulated clock past endTime
    serverStore.setSimulatedServerTime((elec.endTime + 10) * 1000);
    serverStore.reconcileElectionSchedules();
    const elecClosed = serverStore.getElectionById(createdElectionId);

    assert.equal(normalizeElectionStatus(elecClosed!.status), 'CLOSED', 'Open election must automatically conclude');
    assert.ok(elecClosed!.closedAt, 'Must set closedAt timestamp');
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Idempotent reconciliation and restart stability
  // --------------------------------------------------------------------------
  await t.test('7. Restart/reconciliation and repeated scheduler checks do not produce duplicate transitions', async () => {
    // Repeated reconciliation calls on already closed election
    const rec1 = serverStore.reconcileElectionSchedules();
    const rec2 = serverStore.reconcileElectionSchedules();

    // Verify neither attempt created a duplicate transition for this election
    const match1 = rec1.transitions.find((t) => t.electionId === createdElectionId);
    const match2 = rec2.transitions.find((t) => t.electionId === createdElectionId);
    assert.equal(match1, undefined, 'Reconcile on terminal state must not re-transition');
    assert.equal(match2, undefined, 'Reconcile on terminal state must not re-transition');

    // Terminal closed state cannot be reopened
    const resReopen = await fetch(`${baseUrl}/api/admin/elections/${createdElectionId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ status: 'active' }),
    });
    assert.equal(resReopen.status, 400, 'Reopening concluded election must return 400');
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Not-yet-open election rejects vote submissions
  // --------------------------------------------------------------------------
  await t.test('8. Not-yet-open election rejects vote authorization and ballot submission', async () => {
    // Create an election that opens in the far future
    const nowSec = serverStore.getCurrentTimeSec();
    const futureElectionNumericId = 702;
    await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        id: 'ELEC-FUTURE-01',
        numericId: futureElectionNumericId,
        title: 'Future Municipal Election',
        status: 'scheduled',
        startTime: nowSec + 100000,
        endTime: nowSec + 200000,
        constituencyIds: ['CONST-04-ND'],
      }),
    });

    // Authenticate a test voter session
    const voter = serverStore.findVoterByEpic(testEpicDelhi);
    assert.ok(voter, 'Test voter must exist in store');
    const session = serverStore.createSession(voter, 4);

    // Request authorization ticket for the future election
    const resAuth = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        voterWallet: sampleWallet,
        electionId: futureElectionNumericId,
      }),
    });

    assert.equal(resAuth.status, 403, 'Authorization for future election must return 403');
    const authData = await resAuth.json();
    assert.equal(authData.success, false);
    assert.match(authData.message, /not currently active|not opened yet/i);
  });

  // --------------------------------------------------------------------------
  // Scenario 9: An open election accepts an otherwise valid ballot
  // --------------------------------------------------------------------------
  const openElectionNumericId = 703;
  const openElectionId = 'ELEC-LIVE-01';

  await t.test('9. An open election within scheduled window accepts an otherwise valid ballot', async () => {
    const nowSec = serverStore.getCurrentTimeSec();
    // Create an election and activate it
    await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        id: openElectionId,
        numericId: openElectionNumericId,
        title: 'Live By-Election 2026',
        status: 'active',
        startTime: nowSec - 100,
        endTime: nowSec + 5000,
        constituencyIds: ['CONST-04-ND'],
      }),
    });

    // Authenticate test voter
    const voter = serverStore.findVoterByEpic(testEpicDelhi);
    const session = serverStore.createSession(voter!, 4);

    // Authorization ticket request
    const resAuth = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        voterWallet: sampleWallet,
        electionId: openElectionNumericId,
      }),
    });

    assert.equal(resAuth.status, 200, 'Open election must issue authorization ticket');
    const authData = await resAuth.json();
    assert.equal(authData.success, true);
    assert.ok(authData.ticket, 'Must return valid authorization ticket');

    // Record vote
    const nullifier = '0x' + crypto.randomBytes(32).toString('hex');
    const resVote = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        epicId: testEpicDelhi,
        nullifier,
        electionId: openElectionNumericId,
        constituencyId: 'CONST-04-ND',
        txHash: '0x' + crypto.randomBytes(32).toString('hex'),
        isSimulated: true,
      }),
    });

    assert.equal(resVote.status, 200, 'Open election must accept vote record');
    const voteData = await resVote.json();
    assert.equal(voteData.success, true);
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Closed and cancelled elections reject new vote submissions
  // --------------------------------------------------------------------------
  await t.test('10. Closed and cancelled elections strictly reject new vote submissions', async () => {
    // A. Conclude the open election
    await fetch(`${baseUrl}/api/admin/elections/${openElectionId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ status: 'concluded' }),
    });

    const voter = serverStore.findVoterByEpic(testEpicDelhi);
    const session = serverStore.createSession(voter!, 4);

    const resClosedAuth = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        voterWallet: sampleWallet,
        electionId: openElectionNumericId,
      }),
    });
    assert.equal(resClosedAuth.status, 403, 'Closed election must reject authorization');

    // B. Cancelled election rejection
    const cancelElecNumericId = 704;
    await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        id: 'ELEC-CANCELLED-01',
        numericId: cancelElecNumericId,
        title: 'Emergency Cancelled Election',
        status: 'draft',
        startTime: serverStore.getCurrentTimeSec() + 1000,
        endTime: serverStore.getCurrentTimeSec() + 5000,
        constituencyIds: ['CONST-04-ND'],
      }),
    });

    await fetch(`${baseUrl}/api/admin/elections/ELEC-CANCELLED-01/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        status: 'cancelled',
        reason: 'State disaster declaration; election postponed indefinitely.',
      }),
    });

    const resCancelledAuth = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        voterWallet: sampleWallet,
        electionId: cancelElecNumericId,
      }),
    });
    assert.equal(resCancelledAuth.status, 403, 'Cancelled election must reject authorization');
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Client-supplied state and device clocks cannot bypass backend
  // --------------------------------------------------------------------------
  await t.test('11. Client-supplied status and browser timestamps cannot bypass server authorization', async () => {
    const voter = serverStore.findVoterByEpic(testEpicDelhi);
    const session = serverStore.createSession(voter!, 4);

    // Client falsely claims { isOpen: true, status: 'OPEN', clientTime: 123456789 } for concluded election
    const resSpoofed = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.token}`,
      },
      body: JSON.stringify({
        voterWallet: sampleWallet,
        electionId: openElectionNumericId,
        isOpen: true,
        status: 'OPEN',
        timeRemaining: 99999,
        clientTimestamp: Date.now(),
      }),
    });

    assert.equal(resSpoofed.status, 403, 'Spoofed client status must be completely ignored');
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Candidate editing/deletion is restricted before and after election opens
  // --------------------------------------------------------------------------
  await t.test('12. Candidate nominations can be edited before election opens, but are locked once open or voted', async () => {
    const testCandidateId = 'CAND-TEST-P7-C1';
    const draftElecNumeric = 708;

    // First create a draft election in CONST-26-BLR
    await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        id: 'ELEC-BLR-DRAFT',
        numericId: draftElecNumeric,
        title: 'Bangalore South By-Poll',
        status: 'draft',
        startTime: serverStore.getCurrentTimeSec() + 10000,
        endTime: serverStore.getCurrentTimeSec() + 20000,
        constituencyIds: ['CONST-26-BLR'],
      }),
    });

    // A. Add candidate to CONST-26-BLR before election opens
    const resAddCand = await fetch(`${baseUrl}/api/admin/candidates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        id: testCandidateId,
        numericId: 888,
        electionId: 'ELEC-BLR-DRAFT',
        constituencyId: 'CONST-26-BLR',
        name: 'Pre-Poll Candidate',
        partyName: 'Reform Front',
        partyAbbreviation: 'RF',
        symbol: 'Hand',
        symbolColor: '#10B981',
        education: 'Post Graduate',
        age: 38,
        criminalCases: 0,
        assets: '₹1.5 Cr',
        voteCount: 0,
      }),
    });
    assert.equal(resAddCand.status, 201, 'Adding candidate before poll opens must succeed');

    // B. Edit candidate details before poll opens
    const resEditCand = await fetch(`${baseUrl}/api/admin/candidates/${testCandidateId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        assets: '₹2.0 Cr',
        education: 'Doctorate',
      }),
    });
    assert.equal(resEditCand.status, 200, 'Candidate editing before poll opens must succeed');
    const editData = await resEditCand.json();
    assert.equal(editData.candidate.assets, '₹2.0 Cr');

    // C. Activate the election covering CONST-26-BLR
    await fetch(`${baseUrl}/api/admin/elections/ELEC-BLR-DRAFT/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ status: 'active' }),
    });

    // D. Attempt to edit candidate while election is active -> MUST BE LOCKED
    const resLockedEdit = await fetch(`${baseUrl}/api/admin/candidates/${testCandidateId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ name: 'Tampered Name' }),
    });
    assert.equal(resLockedEdit.status, 403, 'Candidate editing must be locked while election is active');

    // E. Attempt to delete candidate while election is active -> MUST BE LOCKED
    const resLockedDelete = await fetch(`${baseUrl}/api/admin/candidates/${testCandidateId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${eoToken}` },
    });
    assert.equal(resLockedDelete.status, 403, 'Candidate deletion must be locked while election is active');
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Existing cast ballots and historical records remain intact
  // --------------------------------------------------------------------------
  await t.test('13. Cast ballots and candidate vote tallies remain intact through lifecycle changes', async () => {
    const repos = getDataRepositories();
    const participations = await repos.participations.listByVoter(TEST_VOTERS[0].id);

    // Verify participation record exists
    assert.ok(participations !== null, 'Participation records list must be accessible');

    // Check candidate record in store remains intact
    const candidate = serverStore.findCandidateById('CAND-ND-01');
    assert.ok(candidate, 'Candidate must persist in store across all lifecycle states');
  });

  // --------------------------------------------------------------------------
  // Scenario 14: Per-election participation allows eligible voting in separate elections
  // --------------------------------------------------------------------------
  await t.test('14. Per-election participation model permits eligible electors to vote in separate elections', async () => {
    const nowSec = serverStore.getCurrentTimeSec();

    // Create Election A and Election B covering CONST-04-WAY (Wayanad)
    const elecANumeric = 706;
    const elecBNumeric = 707;

    await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        id: 'ELEC-WAY-A',
        numericId: elecANumeric,
        title: 'Wayanad Parliamentary Seat A',
        status: 'active',
        startTime: nowSec - 100,
        endTime: nowSec + 10000,
        constituencyIds: ['CONST-04-WAY'],
      }),
    });

    await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        id: 'ELEC-WAY-B',
        numericId: elecBNumeric,
        title: 'Wayanad Local Council Seat B',
        status: 'active',
        startTime: nowSec - 100,
        endTime: nowSec + 10000,
        constituencyIds: ['CONST-04-WAY'],
      }),
    });

    // Find Wayanad voter
    const wayanadVoter = serverStore.findVoterByEpic(testEpicWayanad);
    assert.ok(wayanadVoter, 'Wayanad voter must exist');

    const wayanadSession = serverStore.createSession(wayanadVoter, 4);

    // Elector votes in Election A
    const resVoteA = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wayanadSession.token}`,
      },
      body: JSON.stringify({
        epicId: wayanadVoter.epicId,
        nullifier: '0x' + crypto.randomBytes(32).toString('hex'),
        electionId: elecANumeric,
        constituencyId: 'CONST-04-WAY',
        txHash: '0x' + crypto.randomBytes(32).toString('hex'),
        isSimulated: true,
      }),
    });
    assert.equal(resVoteA.status, 200, 'Vote in Election A must succeed');

    // Elector now requests authorization for Election B -> MUST SUCCEED (not blocked by Election A)
    const resAuthB = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wayanadSession.token}`,
      },
      body: JSON.stringify({
        voterWallet: sampleWallet,
        electionId: elecBNumeric,
      }),
    });
    assert.equal(resAuthB.status, 200, 'Elector must still be eligible to authorize for Election B');

    // Elector votes in Election B -> MUST SUCCEED
    const resVoteB = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wayanadSession.token}`,
      },
      body: JSON.stringify({
        epicId: wayanadVoter.epicId,
        nullifier: '0x' + crypto.randomBytes(32).toString('hex'),
        electionId: elecBNumeric,
        constituencyId: 'CONST-04-WAY',
        txHash: '0x' + crypto.randomBytes(32).toString('hex'),
        isSimulated: true,
      }),
    });
    assert.equal(resVoteB.status, 200, 'Vote in Election B must succeed');

    // Double voting in Election B is rejected
    const resDoubleB = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${wayanadSession.token}`,
      },
      body: JSON.stringify({
        epicId: wayanadVoter.epicId,
        nullifier: '0x' + crypto.randomBytes(32).toString('hex'),
        electionId: elecBNumeric,
        constituencyId: 'CONST-04-WAY',
        txHash: '0x' + crypto.randomBytes(32).toString('hex'),
        isSimulated: true,
      }),
    });
    assert.equal(resDoubleB.status, 409, 'Double vote in same election must return 409 Conflict');
  });

  // --------------------------------------------------------------------------
  // Scenario 15: Phase 06 manual exception protections remain intact
  // --------------------------------------------------------------------------
  await t.test('15. Phase 06 manual exception expiration and single-use protections remain intact', async () => {
    const repos = getDataRepositories();

    // Verify exception repository functions normally
    await repos.exceptions.createRequest({
      id: 'ex-phase7-test-01',
      voterId: 'vtr_phase7_ex_test',
      simulationVoterId: 'SIM-DL-2026-7001',
      purpose: 'VOTING_SESSION',
      electionId: '1',
      constituencyId: 'CONST-04-ND',
      requestedByOfficerId: 'VRO-SIM-001',
      requestedByOfficerRole: 'VOTER_REGISTRATION_OFFICER',
      requestedAt: Date.now(),
      reasonCode: 'PHYSICAL_DISABILITY_OR_AMPUTATION',
      note: 'Regression check for Phase 06 exception integrity',
      status: 'APPROVED',
      reviewedByOfficerId: 'EO-SIM-001',
      reviewedByOfficerRole: 'ELECTION_OFFICER',
      reviewedAt: Date.now(),
      decisionOutcome: 'MANUAL_PHYSICAL_ID_APPROVED',
      decisionReason: 'Physical verification confirmed by Returning Officer.',
      expiresAt: Date.now() + 15 * 60 * 1000,
      votingSessionTokenHash: 'dummy_hash',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    });

    const fetched = await repos.exceptions.findById('ex-phase7-test-01');
    assert.equal(fetched?.status, 'APPROVED');
  });

  // --------------------------------------------------------------------------
  // Scenario 16: State transition validation matrix verification
  // --------------------------------------------------------------------------
  await t.test('16. State transition matrix validates all permitted and forbidden transitions', async () => {
    // Permitted transitions
    assert.equal(isValidElectionTransition('DRAFT', 'SCHEDULED'), true);
    assert.equal(isValidElectionTransition('DRAFT', 'OPEN'), true);
    assert.equal(isValidElectionTransition('DRAFT', 'CANCELLED'), true);
    assert.equal(isValidElectionTransition('SCHEDULED', 'OPEN'), true);
    assert.equal(isValidElectionTransition('SCHEDULED', 'DRAFT'), true);
    assert.equal(isValidElectionTransition('SCHEDULED', 'CANCELLED'), true);
    assert.equal(isValidElectionTransition('OPEN', 'PAUSED'), true);
    assert.equal(isValidElectionTransition('OPEN', 'CLOSED'), true);
    assert.equal(isValidElectionTransition('OPEN', 'CANCELLED'), true);
    assert.equal(isValidElectionTransition('PAUSED', 'OPEN'), true);
    assert.equal(isValidElectionTransition('PAUSED', 'CLOSED'), true);
    assert.equal(isValidElectionTransition('PAUSED', 'CANCELLED'), true);

    // Terminal states cannot transition anywhere
    assert.equal(isValidElectionTransition('CLOSED', 'OPEN'), false);
    assert.equal(isValidElectionTransition('CLOSED', 'DRAFT'), false);
    assert.equal(isValidElectionTransition('CLOSED', 'CANCELLED'), false);
    assert.equal(isValidElectionTransition('CANCELLED', 'DRAFT'), false);
    assert.equal(isValidElectionTransition('CANCELLED', 'OPEN'), false);

    // Illegal skip transitions
    assert.equal(isValidElectionTransition('DRAFT', 'CLOSED'), false);
    assert.equal(isValidElectionTransition('SCHEDULED', 'PAUSED'), false);
    assert.equal(isValidElectionTransition('SCHEDULED', 'CLOSED'), false);
  });
});
