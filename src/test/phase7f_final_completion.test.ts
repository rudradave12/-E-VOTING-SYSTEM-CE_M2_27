/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { ethers } from 'ethers';
import { SERVER_CONFIG } from '../../server/config';
import { adminRouter, clearAdminSessionsForTesting, createAdminSessionForTesting } from '../../server/routes/admin';
import { voterRouter } from '../../server/routes/voter';
import { pollRouter } from '../../server/routes/poll';
import { serverStore } from '../../server/store';
import { verifyAdminIdToken, setAdminFirestoreForTesting, createInMemoryFirestoreMock } from '../../server/firebaseAdmin';
import { HISTORICAL_CONSTITUENCIES_2024 } from '../../src/data/historical2024';

// Setup hermetic express app for testing router endpoints
function createTestApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin', adminRouter);
  app.use('/api/voter', voterRouter);
  app.use('/api/poll', pollRouter);
  return app;
}

test('BlockBallot — Phase 7F: Final Verification & Acceptance Test Suite', async (t) => {
  const app = createTestApp();

  // Hermetic test private key for authorization tickets
  if (!SERVER_CONFIG.AUTHORIZATION_SIGNER_PRIVATE_KEY) {
    SERVER_CONFIG.AUTHORIZATION_SIGNER_PRIVATE_KEY = ethers.Wallet.createRandom().privateKey;
  }

  // --------------------------------------------------------------------------
  // PART 1: DEMO ADMIN LOGIN & PRODUCTION FAIL-CLOSED
  // --------------------------------------------------------------------------
  await t.test('1. Demo admin login succeeds in development with valid credentials and receives admin session', async () => {
    clearAdminSessionsForTesting();
    const originalEnv = process.env.NODE_ENV;
    const originalPass = process.env.DEMO_ADMIN_PASSWORD;
    const originalEnabled = process.env.DEMO_ADMIN_ENABLED;

    process.env.NODE_ENV = 'development';
    process.env.DEMO_ADMIN_ENABLED = 'true';
    process.env.DEMO_ADMIN_PASSWORD = 'TestDemoAdminPassword#2026!';

    // Mock HTTP request using fetch against local server
    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Successful login
      const res = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'demo.admin@blockballot.local',
          password: 'TestDemoAdminPassword#2026!',
        }),
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.success, true);
      assert.ok(data.token && data.token.startsWith('adm_'), 'Session token must have adm_ prefix');
      assert.equal(data.user.email, 'demo.admin@blockballot.local');
      assert.ok(data.user.permissions.includes('MANAGE_ELECTIONS'));

      // Incorrect password -> 401
      const badPwRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'demo.admin@blockballot.local',
          password: 'WrongPassword!',
        }),
      });
      assert.equal(badPwRes.status, 401);

      // Incorrect email -> 401
      const badEmailRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'hacker@malicious.local',
          password: 'TestDemoAdminPassword#2026!',
        }),
      });
      assert.equal(badEmailRes.status, 401);
    } finally {
      server.close();
      process.env.NODE_ENV = originalEnv;
      if (originalPass !== undefined) process.env.DEMO_ADMIN_PASSWORD = originalPass;
      else delete process.env.DEMO_ADMIN_PASSWORD;
      if (originalEnabled !== undefined) process.env.DEMO_ADMIN_ENABLED = originalEnabled;
      else delete process.env.DEMO_ADMIN_ENABLED;
    }
  });

  await t.test('2. Demo admin login strictly fails closed in production mode', async () => {
    const originalProcEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const res = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'demo.admin@blockballot.local',
          password: 'TestDemoAdminPassword#2026!',
        }),
      });

      assert.equal(res.status, 403, 'Must return 403 Forbidden in production');
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.message.includes('disabled in production'));

      // verifyAdminIdToken also fails closed for demo account in production
      const tokenVerification = await verifyAdminIdToken('fake-or-demo-token');
      assert.equal(tokenVerification.isValid, false);
    } finally {
      server.close();
      process.env.NODE_ENV = originalProcEnv;
    }
  });

  // --------------------------------------------------------------------------
  // PART 2: LIVE VOTING RULES & DEADLINE BOUNDARY ENFORCEMENT
  // --------------------------------------------------------------------------
  await t.test('3. Voting deadline boundaries: exact start, before start, before closing, at closing, after closing, paused, and concluded', async () => {
    serverStore.resetDefaults();

    const voter = serverStore.findVoterByEpic('IND-DL-982341')!;
    assert.ok(voter, 'Synthetic voter must exist');
    voter.status = 'AUTHORIZED';
    const session = serverStore.createSession(voter, 4);

    const nowSec = Math.floor(Date.now() / 1000);
    const testWallet = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Case A: Active election open right now (startTime <= now < endTime)
      const openElec = serverStore.createElection({
        id: 'TEST-OPEN-ELEC',
        numericId: 901,
        title: 'Open Election Test',
        description: 'Currently active',
        status: 'active',
        startTime: nowSec - 3600, // opened 1 hour ago
        endTime: nowSec + 3600, // closes in 1 hour
        contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        constituencyIds: ['CONST-04-ND'],
        electionType: 'General Election',
        isDemoElection: false,
      });

      const resOpen = await fetch(`${baseUrl}/api/voter/authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          electionId: openElec.numericId,
          voterWallet: testWallet,
          chainId: 31337,
        }),
      });

      assert.equal(resOpen.status, 200, 'Must allow authorization when election is open');
      const dataOpen = await resOpen.json();
      assert.equal(dataOpen.success, true);
      assert.ok(dataOpen.ticket, 'Must return signed authorization ticket');

      // Case B: Scheduled election not yet open (now < startTime)
      const futureElec = serverStore.createElection({
        id: 'TEST-FUTURE-ELEC',
        numericId: 902,
        title: 'Future Election Test',
        description: 'Scheduled for tomorrow',
        status: 'active',
        startTime: nowSec + 3600, // opens in 1 hour
        endTime: nowSec + 86400,
        contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        constituencyIds: ['CONST-04-ND'],
        electionType: 'General Election',
        isDemoElection: false,
      });

      const resFuture = await fetch(`${baseUrl}/api/voter/authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          electionId: futureElec.numericId,
          voterWallet: testWallet,
          chainId: 31337,
        }),
      });

      assert.equal(resFuture.status, 403, 'Must reject voting before election start time');
      const dataFuture = await resFuture.json();
      assert.equal(dataFuture.success, false);
      assert.equal(dataFuture.status, 'SCHEDULED');

      // Case C: Election at exact closing time (now == endTime) -> Must be rejected (strictly < endTime)
      const closingElec = serverStore.createElection({
        id: 'TEST-CLOSING-ELEC',
        numericId: 903,
        title: 'Closing Election Test',
        description: 'Ends at this exact second',
        status: 'active',
        startTime: nowSec - 7200,
        endTime: nowSec, // At closing time
        contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        constituencyIds: ['CONST-04-ND'],
        electionType: 'General Election',
        isDemoElection: false,
      });

      const resClosing = await fetch(`${baseUrl}/api/voter/authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          electionId: closingElec.numericId,
          voterWallet: testWallet,
          chainId: 31337,
        }),
      });

      assert.equal(resClosing.status, 403, 'Must reject voting at exact closing time');
      const dataClosing = await resClosing.json();
      assert.equal(dataClosing.success, false);
      assert.equal(dataClosing.status, 'CONCLUDED');

      // Case D: Election after closing time (now > endTime) -> Must be rejected
      const pastElec = serverStore.createElection({
        id: 'TEST-PAST-ELEC',
        numericId: 904,
        title: 'Past Election Test',
        description: 'Concluded yesterday',
        status: 'active',
        startTime: nowSec - 86400 * 2,
        endTime: nowSec - 3600, // ended 1 hour ago
        contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        constituencyIds: ['CONST-04-ND'],
        electionType: 'General Election',
        isDemoElection: false,
      });

      const resPast = await fetch(`${baseUrl}/api/voter/authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          electionId: pastElec.numericId,
          voterWallet: testWallet,
          chainId: 31337,
        }),
      });

      assert.equal(resPast.status, 403, 'Must reject voting after closing time');

      // Case E: Paused election -> Must be rejected
      const pausedElec = serverStore.createElection({
        id: 'TEST-PAUSED-ELEC',
        numericId: 905,
        title: 'Paused Election Test',
        description: 'Temporarily suspended',
        status: 'paused',
        startTime: nowSec - 3600,
        endTime: nowSec + 3600,
        contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        constituencyIds: ['CONST-04-ND'],
        electionType: 'General Election',
        isDemoElection: false,
      });

      const resPaused = await fetch(`${baseUrl}/api/voter/authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          electionId: pausedElec.numericId,
          voterWallet: testWallet,
          chainId: 31337,
        }),
      });

      assert.equal(resPaused.status, 403, 'Must reject voting in paused election');
      const dataPaused = await resPaused.json();
      assert.equal(dataPaused.status, 'PAUSED');

      // Case F: Concluded election -> Must be rejected
      const concludedElec = serverStore.createElection({
        id: 'TEST-CONCLUDED-ELEC',
        numericId: 906,
        title: 'Concluded Election Test',
        description: 'Permanently closed',
        status: 'concluded',
        startTime: nowSec - 86400 * 5,
        endTime: nowSec - 86400 * 4,
        contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        constituencyIds: ['CONST-04-ND'],
        electionType: 'General Election',
        isDemoElection: false,
      });

      const resConcluded = await fetch(`${baseUrl}/api/voter/authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          electionId: concludedElec.numericId,
          voterWallet: testWallet,
          chainId: 31337,
        }),
      });

      assert.equal(resConcluded.status, 403, 'Must reject voting in concluded election');
      const dataConcluded = await resConcluded.json();
      assert.equal(dataConcluded.status, 'CONCLUDED');
    } finally {
      server.close();
    }
  });

  // --------------------------------------------------------------------------
  // PART 3: CONSTITUENCY ENROLLMENT & DUPLICATE VOTE REJECTION
  // --------------------------------------------------------------------------
  await t.test('4. Constituency eligibility and duplicate-vote prevention are strictly enforced', async () => {
    serverStore.resetDefaults();

    const voterND = serverStore.findVoterByEpic('IND-DL-982341')!; // New Delhi (CONST-04-ND)
    assert.equal(voterND.constituencyId, 'CONST-04-ND');
    voterND.status = 'AUTHORIZED';
    const sessionND = serverStore.createSession(voterND, 4);

    const nowSec = Math.floor(Date.now() / 1000);
    const testWallet = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';

    // Election only enrolled for Varanasi (CONST-77-VAR)
    const varanasiOnlyElec = serverStore.createElection({
      id: 'TEST-VARANASI-ONLY',
      numericId: 910,
      title: 'Varanasi Local Election',
      description: 'Restricted constituency',
      status: 'active',
      startTime: nowSec - 3600,
      endTime: nowSec + 3600,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: ['CONST-77-VAR'],
      electionType: 'Constituency By-Election',
      isDemoElection: false,
    });

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // 1. Ineligible constituency rejection
      const resIneligible = await fetch(`${baseUrl}/api/voter/authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionND.token}`,
        },
        body: JSON.stringify({
          electionId: varanasiOnlyElec.numericId,
          voterWallet: testWallet,
          chainId: 31337,
        }),
      });

      assert.equal(resIneligible.status, 403);
      const dataIneligible = await resIneligible.json();
      assert.ok(dataIneligible.message.includes('not enrolled in this election'));

      // 2. Duplicate voting prevention: Cast a valid vote in open demo election GE-2024
      const openElec = serverStore.getElectionById('GE-2024')!;
      assert.ok(openElec);

      const authRes = await fetch(`${baseUrl}/api/voter/authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionND.token}`,
        },
        body: JSON.stringify({
          electionId: openElec.numericId,
          voterWallet: testWallet,
          chainId: 31337,
        }),
      });
      assert.equal(authRes.status, 200);
      const authData = await authRes.json();
      const nullifier = authData.ticket.nullifier;

      // Finalize vote
      const voteRecordRes = await fetch(`${baseUrl}/api/voter/record-vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionND.token}`,
        },
        body: JSON.stringify({
          nullifier,
          electionId: openElec.numericId,
          constituencyId: 'CONST-04-ND',
          txHash: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
          isSimulated: true,
        }),
      });
      assert.equal(voteRecordRes.status, 200);
      assert.equal(serverStore.findVoterByEpic('IND-DL-982341')?.status, 'VOTED');

      // Attempt second authorization with same elector/nullifier
      const secondAuthRes = await fetch(`${baseUrl}/api/voter/authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionND.token}`,
        },
        body: JSON.stringify({
          electionId: openElec.numericId,
          voterWallet: testWallet,
          chainId: 31337,
        }),
      });

      assert.equal(secondAuthRes.status, 403);
      const secondData = await secondAuthRes.json();
      assert.equal(secondData.status, 'VOTED');
      assert.ok(secondData.message.includes('already'));
    } finally {
      server.close();
    }
  });

  // --------------------------------------------------------------------------
  // PART 4: READ-ONLY PREVIOUS ELECTIONS IMMUTABILITY
  // --------------------------------------------------------------------------
  await t.test('5. Previous election DEMO-PREV-2023 is strictly read-only and terminal', async () => {
    serverStore.resetDefaults();

    const prevElec = serverStore.getElectionById('DEMO-PREV-2023');
    assert.ok(prevElec, 'Concluded demo trial election must exist in store');
    assert.equal(prevElec.status, 'concluded');
    assert.equal(prevElec.totalVotesCast, 0, 'Must start at 0 without fabricated votes');

    // Admin session
    const adminSession = createAdminSessionForTesting();

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      // Attempt to reopen concluded election via admin status PATCH
      const patchRes = await fetch(`${baseUrl}/api/admin/elections/DEMO-PREV-2023/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminSession.token}`,
        },
        body: JSON.stringify({ status: 'active' }),
      });

      assert.equal(patchRes.status, 400, 'Must reject reopening terminal concluded election');
      const patchData = await patchRes.json();
      assert.equal(patchData.success, false);
      assert.ok(patchData.message.includes('terminal'));

      // Voter attempting to vote on DEMO-PREV-2023
      const voter = serverStore.findVoterByEpic('IND-DL-982341')!;
      voter.status = 'AUTHORIZED';
      const session = serverStore.createSession(voter, 4);

      const voteAttemptRes = await fetch(`${baseUrl}/api/voter/authorization`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          electionId: prevElec.numericId,
          voterWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
          chainId: 31337,
        }),
      });

      assert.equal(voteAttemptRes.status, 403);
      const voteAttemptData = await voteAttemptRes.json();
      assert.equal(voteAttemptData.status, 'CONCLUDED');
    } finally {
      server.close();
    }
  });

  // --------------------------------------------------------------------------
  // PART 5: DATA SEGREGATION: HISTORICAL 2024 ARCHIVE VS DEMO BALLOTS & POLLS
  // --------------------------------------------------------------------------
  await t.test('6. Official 2024 Gazette results and preference polls remain strictly isolated from demo ballots', async () => {
    // Check initial historical record
    const ndRecord = HISTORICAL_CONSTITUENCIES_2024.find((c) => c.code === '04')!;
    assert.ok(ndRecord);
    const originalVotesCounted = ndRecord.votesCounted;
    const originalWinnerVotes = ndRecord.candidates[0].votesCounted;

    // Create session for poll submission
    const voter = serverStore.findVoterByEpic('IND-DL-982341')!;
    voter.status = 'ELIGIBLE';
    const session = serverStore.createSession(voter, 4);

    const server = app.listen(0);
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const pollRes = await fetch(`${baseUrl}/api/poll/poll-2026-general/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.token}`,
        },
        body: JSON.stringify({
          partyCode: 'AAP',
        }),
      });

      // Poll response should be processed or handled
      assert.ok(pollRes.status === 200 || pollRes.status === 400 || pollRes.status === 409);

      // Verify that official 2024 historical Gazette counts are completely unaffected
      const afterPollRecord = HISTORICAL_CONSTITUENCIES_2024.find((c) => c.code === '04')!;
      assert.equal(afterPollRecord.votesCounted, originalVotesCounted);
      assert.equal(afterPollRecord.candidates[0].votesCounted, originalWinnerVotes);

      // Verify that demo election totalVotesCast is not affected by poll
      const prevElec = serverStore.getElectionById('DEMO-PREV-2023')!;
      assert.equal(prevElec.totalVotesCast, 0, 'Previous election votes must remain unchanged');
    } finally {
      server.close();
    }
  });

  // --------------------------------------------------------------------------
  // PART 6: PERSISTENCE SURVIVES SERVER RESTART
  // --------------------------------------------------------------------------
  await t.test('7. Firestore persistence survives application server restart and re-synchronizes electoral state', async () => {
    const mockDb = createInMemoryFirestoreMock();
    setAdminFirestoreForTesting(mockDb);

    try {
      const geElection = serverStore.getElectionById('GE-2024');
      if (geElection) geElection.status = 'draft';

      // 1. Create an admin election via serverStore.createElectionAsync
      await serverStore.createElectionAsync({
        id: 'ELEC-PERSIST-RESTART',
        numericId: 999,
        title: 'Server Restart Persistence Verification Election',
        description: 'Verifies that election data survives server restart and restores into fresh memory.',
        status: 'draft',
        startTime: Math.floor(Date.now() / 1000) + 3600,
        endTime: Math.floor(Date.now() / 1000) + 86400 * 7,
        contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
        constituencyIds: ['CONST-04-ND'],
        electionType: 'State Legislative Assembly',
        isDemoElection: false,
      });

      // 2. Add candidate via serverStore.addCandidateAsync
      const candRes = await serverStore.addCandidateAsync({
        id: 'CAND-ND-RESTART',
        numericId: 991,
        constituencyId: 'CONST-04-ND',
        name: 'Persistent Test Candidate',
        partyName: 'Persistent Integrity Party',
        partyAbbreviation: 'PIP',
        symbol: 'Lotus',
        symbolKey: 'LOTUS',
        symbolDescription: 'Lotus flower',
        symbolSource: 'ECI Notification',
        symbolVerificationStatus: 'VERIFIED_ECI',
        symbolColor: '#16A34A',
        education: 'Postgraduate',
        age: 48,
        criminalCases: 0,
        assets: '₹5 Cr',
        voteCount: 0,
      });
      assert.equal(candRes.success, true, 'Candidate registration must succeed');

      // 3. Mark a voter as VOTED in persistence
      await serverStore.updateVoterStatusAsync('IND-DL-982341', 'VOTED');

      // 4. SIMULATE APPLICATION SERVER RESTART
      // Reset in-memory defaults to simulate fresh process startup
      serverStore.resetDefaults();

      // Before sync, the newly created election does not exist in fresh default memory
      assert.equal(serverStore.getElectionById('ELEC-PERSIST-RESTART'), undefined);

      // 5. Call syncFromFirestore (which runs on server boot)
      await serverStore.syncFromFirestore();

      // 6. Verify election is restored from database
      const restoredElec = serverStore.getElectionById('ELEC-PERSIST-RESTART');
      assert.ok(restoredElec, 'Persisted election must be restored after server restart sync');
      assert.equal(restoredElec.title, 'Server Restart Persistence Verification Election');
      assert.equal(restoredElec.numericId, 999);

      // 7. Verify candidate is restored
      const candidates = serverStore.getCandidatesByConstituency('CONST-04-ND');
      const restoredCand = candidates.find((c) => c.id === 'CAND-ND-RESTART');
      assert.ok(restoredCand, 'Candidate must be restored after server restart sync');
      assert.equal(restoredCand.name, 'Persistent Test Candidate');

      // 8. Verify voter status survives restart
      const restoredVoter = serverStore.findVoterByEpic('IND-DL-982341')!;
      assert.equal(restoredVoter.status, 'VOTED', 'Voter status must survive server restart');
    } finally {
      setAdminFirestoreForTesting(null);
    }
  });
});
