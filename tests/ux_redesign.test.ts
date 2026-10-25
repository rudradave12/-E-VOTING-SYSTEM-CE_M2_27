/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import express from 'express';
import { voterRouter } from '../backend/server/routes/voter';
import { adminRouter, createAdminSessionForTesting } from '../backend/server/routes/admin';
import { serverStore } from '../backend/server/store';
import { INITIAL_ELECTIONS, INITIAL_CONSTITUENCIES, INITIAL_CANDIDATES } from '../frontend/src/data/mockData';
import { TEST_VOTERS } from './fixtures/voterFixtures';
import { HISTORICAL_CONSTITUENCIES_2024 } from '../frontend/src/data/historical2024';
import { ElectionStatus } from '../frontend/src/types';

describe('BlockBallot — Core E-Voting UX Redesign & Architecture Verification', () => {
  let app: express.Express;
  let server: http.Server;
  let baseUrl: string;

  before(async () => {
    serverStore.resetVoters();
    serverStore.seedVotersForTesting(TEST_VOTERS);
    app = express();
    app.use(express.json());
    app.use('/api/voter', voterRouter);
    app.use('/api/admin', adminRouter);
    app.use('/api', adminRouter); // for /api/elections, /api/constituencies, etc.

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('1. Seeded demo election starts at zero test votes and isolates historical data', () => {
    const demoElection = INITIAL_ELECTIONS.find((e) => e.id === 'GE-2024');
    assert.ok(demoElection, 'Seeded demo election GE-2024 must exist');
    assert.equal(demoElection.totalVotesCast, 0, 'Demo election ballots counter must start at zero for fresh environment');
    assert.equal(demoElection.isDemoElection, true, 'Demo election must be marked as academic demo');
    assert.ok(demoElection.title.includes('Demo'), 'Title must clearly state academic demo');

    // All initial candidate vote counts must be 0
    for (const c of INITIAL_CANDIDATES) {
      assert.equal(c.voteCount, 0, `Candidate ${c.name} voteCount must start at zero`);
    }

    // All initial constituency turnout counts must be 0
    for (const constRec of INITIAL_CONSTITUENCIES) {
      assert.equal(constRec.turnoutCount, 0, `Constituency ${constRec.name} turnoutCount must start at zero`);
    }

    // Historical records must have positive real votes and remain separate
    assert.ok(HISTORICAL_CONSTITUENCIES_2024.length >= 10);
    const newDelhiHistorical = HISTORICAL_CONSTITUENCIES_2024.find((c) => c.name === 'New Delhi');
    assert.ok(newDelhiHistorical, 'Historical New Delhi record must exist');
    assert.ok(newDelhiHistorical.votesCounted > 800000, 'Official 2024 historical votes counted must remain intact');
  });

  it('2. Voter journey: EPIC lookup -> OTP challenge -> Authenticated session', async () => {
    // Step 1: EPIC identify / verify
    const identifyRes = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: 'IND-DL-982341' }), // Rajesh Kumar Sharma
    });
    assert.equal(identifyRes.status, 200);
    const identifyData = await identifyRes.json();
    assert.equal(identifyData.success, true);
    assert.ok(identifyData.testDeliveryCode, 'Test delivery code provided in academic dev mode');

    // Step 2: OTP verification
    const otpRes = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: 'IND-DL-982341',
        otp: identifyData.testDeliveryCode,
      }),
    });
    assert.equal(otpRes.status, 200);
    const otpData = await otpRes.json();
    assert.equal(otpData.success, true);
    assert.ok(otpData.sessionToken, 'Valid session token must be issued');
    assert.equal(otpData.voter.name, 'Rajesh Kumar Sharma');
    assert.equal(otpData.voter.constituencyId, 'CONST-04-ND');

    // Step 3: Session verification
    const sessionRes = await fetch(`${baseUrl}/api/voter/session`, {
      headers: { Authorization: `Bearer ${otpData.sessionToken}` },
    });
    assert.equal(sessionRes.status, 200);
    const sessionData = await sessionRes.json();
    assert.equal(sessionData.authenticated, true);
    assert.equal(sessionData.session.epicId, 'IND-DL-982341');
  });

  it('3. Constituency-specific candidate resolution', async () => {
    // New Delhi candidates
    const ndRes = await fetch(`${baseUrl}/api/candidates?constituencyId=CONST-04-ND`);
    const ndData = await ndRes.json();
    assert.ok(ndData.candidates.length >= 3);
    for (const c of ndData.candidates) {
      assert.equal(c.constituencyId, 'CONST-04-ND');
    }

    // Varanasi candidates
    const varRes = await fetch(`${baseUrl}/api/candidates?constituencyId=CONST-77-VAR`);
    const varData = await varRes.json();
    assert.ok(varData.candidates.length >= 3);
    for (const c of varData.candidates) {
      assert.equal(c.constituencyId, 'CONST-77-VAR');
    }
  });

  it('4. Administrator creation of a second election with deadlines and type', async () => {
    // Generate valid officer session
    const adminSession = createAdminSessionForTesting('officer@eci.gov.in', 'ELECTION_OFFICER');

    const nowSec = Math.floor(Date.now() / 1000);
    const startTime = nowSec + 3600; // starts in 1 hour
    const endTime = nowSec + 86400 * 5; // ends in 5 days

    const createRes = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        title: '2026 State Legislative Assembly Election',
        description: 'Administrator-scheduled legislative assembly e-voting election.',
        electionType: 'State Legislative Assembly',
        numericId: 99,
        startTime,
        endTime,
        constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
        status: 'scheduled',
      }),
    });

    assert.equal(createRes.status, 201);
    const createData = await createRes.json();
    assert.equal(createData.success, true);
    assert.equal(createData.election.title, '2026 State Legislative Assembly Election');
    assert.equal(createData.election.electionType, 'State Legislative Assembly');
    assert.equal(createData.election.status, 'scheduled');
    assert.equal(createData.election.startTime, startTime);
    assert.equal(createData.election.endTime, endTime);
    assert.equal(createData.election.totalVotesCast, 0);

    // Verify it is queryable in GET /api/elections
    const listRes = await fetch(`${baseUrl}/api/elections`);
    const listData = await listRes.json();
    const createdInList = listData.elections.find((e: any) => e.id === createData.election.id);
    assert.ok(createdInList);
    assert.equal(createdInList.status, 'scheduled');
  });

  it('5. Deadline validation on election creation (end time must be strictly after start time)', async () => {
    const adminSession = createAdminSessionForTesting('officer@eci.gov.in', 'ELECTION_OFFICER');
    const nowSec = Math.floor(Date.now() / 1000);

    const invalidRes = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSession.token}`,
      },
      body: JSON.stringify({
        title: 'Invalid Schedule Election',
        startTime: nowSec + 10000,
        endTime: nowSec + 5000, // Invalid: before start
      }),
    });

    assert.equal(invalidRes.status, 400);
    const invalidData = await invalidRes.json();
    assert.equal(invalidData.success, false);
    assert.ok(invalidData.message.includes('closing deadline'));
  });

  it('6. Backend lifecycle and deadline enforcement on voting authorization', async () => {
    // 1. Create a voter session
    serverStore.resetVoters();
    serverStore.seedVotersForTesting(TEST_VOTERS);
    const voter = serverStore.findVoterByEpic('IND-DL-982341')!;
    const voterSession = serverStore.createSession(voter, 4);

    // 2. Create a SCHEDULED election (voting not open yet)
    const nowSec = Math.floor(Date.now() / 1000);
    const scheduledElec = serverStore.createElection({
      id: 'ELEC-FUTURE',
      numericId: 888,
      title: 'Future Scheduled Election',
      description: 'Scheduled election not yet open for voting.',
      status: 'scheduled',
      startTime: nowSec + 3600,
      endTime: nowSec + 86400,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: ['CONST-04-ND'],
    });

    // 3. Attempt to get authorization ticket for scheduled election -> MUST FAIL with 403
    const authRes1 = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voterSession.token}`,
      },
      body: JSON.stringify({
        voterWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        electionId: scheduledElec.numericId,
      }),
    });
    assert.equal(authRes1.status, 403);
    const authData1 = await authRes1.json();
    assert.equal(authData1.success, false);
    assert.ok(authData1.message.includes('not currently active'));

    // 4. Create an EXPIRED/CONCLUDED election
    const expiredElec = serverStore.createElection({
      id: 'ELEC-EXPIRED',
      numericId: 777,
      title: 'Expired Past Election',
      description: 'Election whose deadline has passed.',
      status: 'active',
      startTime: nowSec - 7200,
      endTime: nowSec - 3600, // ended 1 hour ago
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: ['CONST-04-ND'],
    });

    const authRes2 = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voterSession.token}`,
      },
      body: JSON.stringify({
        voterWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        electionId: expiredElec.numericId,
      }),
    });
    assert.equal(authRes2.status, 403);
    const authData2 = await authRes2.json();
    assert.equal(authData2.success, false);
    assert.ok(authData2.message.includes('concluded'));

    // 5. Constituency mismatch check
    const otherConstElec = serverStore.createElection({
      id: 'ELEC-OTHER',
      numericId: 666,
      title: 'Wayanad Only Election',
      description: 'Election restricted to Wayanad.',
      status: 'active',
      startTime: nowSec - 3600,
      endTime: nowSec + 3600,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: ['CONST-04-WAY'], // voter is in CONST-04-ND
    });

    const authRes3 = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voterSession.token}`,
      },
      body: JSON.stringify({
        voterWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
        electionId: otherConstElec.numericId,
      }),
    });
    assert.equal(authRes3.status, 403);
    const authData3 = await authRes3.json();
    assert.equal(authData3.success, false);
    assert.ok(authData3.message.includes('not enrolled'));
  });

  it('7. Unauthenticated administrative requests are strictly rejected (403)', async () => {
    // Unauthenticated create election
    const res1 = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Rogue Election' }),
    });
    assert.ok([401, 403].includes(res1.status));

    // Unauthenticated status update
    const res2 = await fetch(`${baseUrl}/api/admin/elections/GE-2024/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'paused' }),
    });
    assert.ok([401, 403].includes(res2.status));
  });

  it('8. Lifecycle state transitions: Draft -> Scheduled -> Active -> Paused -> Concluded', async () => {
    const adminSession = createAdminSessionForTesting('officer@eci.gov.in', 'ELECTION_OFFICER');

    const testElec = serverStore.createElection({
      id: 'ELEC-LIFECYCLE',
      numericId: 555,
      title: 'Lifecycle State Machine Test Election',
      description: 'Testing transitions.',
      status: 'draft',
      startTime: Math.floor(Date.now() / 1000) - 3600,
      endTime: Math.floor(Date.now() / 1000) + 86400,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: ['CONST-04-ND'],
    });

    const updateStatus = async (status: ElectionStatus) => {
      const res = await fetch(`${baseUrl}/api/admin/elections/${testElec.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSession.token}`,
        },
        body: JSON.stringify({ status }),
      });
      return res;
    };

    // draft -> scheduled
    let res = await updateStatus('scheduled');
    assert.equal(res.status, 200);

    // scheduled -> active
    res = await updateStatus('active');
    assert.equal(res.status, 200);

    // active -> paused
    res = await updateStatus('paused');
    assert.equal(res.status, 200);

    // paused -> active
    res = await updateStatus('active');
    assert.equal(res.status, 200);

    // active -> concluded
    res = await updateStatus('concluded');
    assert.equal(res.status, 200);

    // concluded is terminal -> cannot transition back to active
    res = await updateStatus('active');
    assert.equal(res.status, 400);
    const errData = await res.json();
    assert.ok(errData.message.includes('terminal'));
  });
});
