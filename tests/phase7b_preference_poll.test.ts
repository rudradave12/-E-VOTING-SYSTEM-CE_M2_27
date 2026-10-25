/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';

import { pollRouter } from '../backend/server/routes/poll';
import { historicalRouter } from '../backend/server/routes/historical';
import { adminRouter, clearAdminSessionsForTesting } from '../backend/server/routes/admin';
import { serverStore } from '../backend/server/store';
import {
  setAdminFirestoreForTesting,
  createInMemoryFirestoreMock,
  setAdminTokenVerifierForTesting,
} from '../backend/server/firebaseAdmin';
import {
  initPreferencePollIfNotExists,
  DEFAULT_PREFERENCE_POLL_ID,
  importOfficialHistorical2024Data,
  getAllHistoricalConstituenciesFromFirestore,
  getHistoricalConstituencyByIdFromFirestore,
  getPollAggregateFromFirestore,
} from '../backend/server/firestore';
import {
  RECOGNIZED_PARTIES,
  HISTORICAL_CONSTITUENCIES_2024,
} from '../frontend/src/data/historical2024';

test('BlockBallot — Phase 7B: Party-Preference Poll UI & API Integration Test Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;
  let inMemoryDb: any;
  let adminSessionToken: string;

  t.before(async () => {
    // 1. Initialize Hermetic in-memory Firestore mock
    inMemoryDb = createInMemoryFirestoreMock();
    setAdminFirestoreForTesting(inMemoryDb);

    // Mock admin token verifier for testing admin operations
    setAdminTokenVerifierForTesting(async (token: string) => {
      if (token === 'valid-admin-id-token') {
        return {
          isValid: true,
          uid: 'admin-officer-01',
          email: 'officer@eci-demo.gov.in',
          role: 'officer',
        };
      }
      return { isValid: false, error: 'Token invalid' };
    });

    // Seed official historical data and default preference poll
    await importOfficialHistorical2024Data();
    await initPreferencePollIfNotExists();

    // 2. Mount Express App with Poll & Historical Routers
    const app = express();
    app.use(express.json());
    app.use('/api/poll', pollRouter);
    app.use('/api/historical', historicalRouter);
    app.use('/api/admin', adminRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // Login admin to obtain a verified server session token
    const adminLoginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'valid-admin-id-token' }),
    });
    const adminLoginData = await adminLoginRes.json();
    assert.equal(adminLoginData.success, true);
    adminSessionToken = adminLoginData.token;
  });

  t.after(async () => {
    setAdminFirestoreForTesting(null);
    setAdminTokenVerifierForTesting(null);
    clearAdminSessionsForTesting();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    setTimeout(() => process.exit(0), 100);
  });

  // --------------------------------------------------------------------------
  // 1. Rendering Poll Configuration & All 10 Recognized Party Choices
  // --------------------------------------------------------------------------
  await t.test('1. Poll configuration, non-ECI disclaimer, and all 10 recognized parties retrieved', async () => {
    const res = await fetch(`${baseUrl}/api/poll`);
    assert.equal(res.status, 200);
    const data = await res.json();

    assert.equal(data.success, true);
    assert.ok(data.poll);
    assert.equal(data.poll.id, DEFAULT_PREFERENCE_POLL_ID);
    assert.equal(data.poll.status, 'open');
    assert.equal(data.poll.isOfficialECI, false);

    // Check prominent civic disclaimer
    assert.ok(data.disclaimer.includes('Unofficial, non-binding'));
    assert.ok(data.disclaimer.includes('Not run, operated, or approved by the Election Commission of India'));

    // Check all 10 recognized parties are returned
    assert.ok(Array.isArray(data.parties));
    assert.equal(data.parties.length, RECOGNIZED_PARTIES.length);

    const partyCodes = data.parties.map((p: any) => p.code);
    assert.ok(partyCodes.includes('BJP'));
    assert.ok(partyCodes.includes('INC'));
    assert.ok(partyCodes.includes('AAP'));
    assert.ok(partyCodes.includes('BSP'));
    assert.ok(partyCodes.includes('CPIM'));
    assert.ok(partyCodes.includes('NPP'));
    assert.ok(partyCodes.includes('SP'));
    assert.ok(partyCodes.includes('DMK'));
    assert.ok(partyCodes.includes('AITC'));
    assert.ok(partyCodes.includes('SS(UBT)'));

    // Verify symbols and gazette references exist for each party
    data.parties.forEach((p: any) => {
      assert.ok(p.name && p.name.length > 0);
      assert.ok(p.reservedSymbol && p.reservedSymbol.length > 0);
      assert.ok(p.symbolKey && p.symbolKey.length > 0);
      assert.ok(p.symbolNotificationRef && p.symbolNotificationRef.includes('56/2024/PPS-III'));
    });
  });

  // --------------------------------------------------------------------------
  // 2. English / Hindi Bilingual Data Availability
  // --------------------------------------------------------------------------
  await t.test('2. English and Hindi localized titles, descriptions, and party names are complete', async () => {
    const res = await fetch(`${baseUrl}/api/poll`);
    const data = await res.json();

    // Poll title and description bilingual coverage
    assert.ok(data.poll.title && data.poll.title.length > 0);
    assert.ok(data.poll.titleHi && data.poll.titleHi.includes('राष्ट्रीय राजनीतिक दल'));
    assert.ok(data.poll.description && data.poll.description.length > 0);
    assert.ok(data.poll.descriptionHi && data.poll.descriptionHi.includes('नागरिक सर्वेक्षण'));

    // All parties contain valid Hindi translation
    data.parties.forEach((p: any) => {
      assert.ok(p.nameHi && p.nameHi.length > 0, `Party ${p.code} missing Hindi name`);
      assert.ok(p.historicalSummaryHi && p.historicalSummaryHi.length > 0, `Party ${p.code} missing Hindi summary`);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Authentication-Required Behavior
  // --------------------------------------------------------------------------
  await t.test('3. Unauthenticated requests to vote or query personal response are rejected (401)', async () => {
    // A. Query receipt without auth header
    const myRespNoAuth = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/my-response`);
    assert.equal(myRespNoAuth.status, 401);
    const myRespNoAuthData = await myRespNoAuth.json();
    assert.equal(myRespNoAuthData.success, false);
    assert.ok(myRespNoAuthData.message.includes('Authentication required'));

    // B. Vote without auth header
    const voteNoAuth = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ partyCode: 'BJP' }),
    });
    assert.equal(voteNoAuth.status, 401);
    const voteNoAuthData = await voteNoAuth.json();
    assert.equal(voteNoAuthData.success, false);
    assert.ok(voteNoAuthData.message.includes('Authentication required'));

    // C. Vote with forged or invalid bearer token
    const voteFakeAuth = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer fake-invalid-token-12345',
      },
      body: JSON.stringify({ partyCode: 'BJP' }),
    });
    assert.equal(voteFakeAuth.status, 401);
  });

  // --------------------------------------------------------------------------
  // 4. Successful Preference Submission & Receipt Generation
  // --------------------------------------------------------------------------
  await t.test('4. Authenticated voter successfully submits preference and receives valid receipt', async () => {
    // Create an authenticated session for Voter 1
    const voter1Session = serverStore.createSession(
      {
        id: 'voter-test-01',
        epicId: 'IND-TEST-001',
        name: 'Priya Sharma',
        gender: 'F',
        age: 29,
        constituencyId: 'CONST-04-ND',
        pollingStation: 'Station 10',
        maskedMobile: 'XXXXXX1234',
        isEligible: true,
        status: 'AUTHORIZED',
      },
      4
    );

    // Check my-response initially returns hasVoted: false
    const initialCheck = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/my-response`, {
      headers: { Authorization: `Bearer ${voter1Session.token}` },
    });
    assert.equal(initialCheck.status, 200);
    const initialCheckData = await initialCheck.json();
    assert.equal(initialCheckData.success, true);
    assert.equal(initialCheckData.hasVoted, false);
    assert.equal(initialCheckData.response, null);

    // Submit choice: BJP
    const voteRes = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voter1Session.token}`,
      },
      body: JSON.stringify({ partyCode: 'BJP' }),
    });

    assert.equal(voteRes.status, 201);
    const voteData = await voteRes.json();
    assert.equal(voteData.success, true);
    assert.ok(voteData.receipt);
    assert.ok(voteData.receipt.receiptId.startsWith('RCPT-POLL-'));
    assert.equal(voteData.receipt.partyCode, 'BJP');
    assert.equal(voteData.receipt.partyName, 'Bharatiya Janata Party');
    assert.ok(voteData.receipt.submittedAt > 0);

    // Verify aggregate returned in response updated
    assert.ok(voteData.aggregate);
    assert.equal(voteData.aggregate.totalResponses, 1);
    assert.equal(voteData.aggregate.partyTallies['BJP'], 1);

    // Check my-response now returns hasVoted: true with the exact receipt
    const afterCheck = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/my-response`, {
      headers: { Authorization: `Bearer ${voter1Session.token}` },
    });
    const afterCheckData = await afterCheck.json();
    assert.equal(afterCheckData.success, true);
    assert.equal(afterCheckData.hasVoted, true);
    assert.equal(afterCheckData.response.receiptId, voteData.receipt.receiptId);
    assert.equal(afterCheckData.response.partyCode, 'BJP');
  });

  // --------------------------------------------------------------------------
  // 5. Duplicate Submission Prevention (1 Response / Voter)
  // --------------------------------------------------------------------------
  await t.test('5. Duplicate submission by same authenticated voter is rejected with 409 Conflict', async () => {
    // Look up the active session for Voter 1
    const session1 = Array.from((serverStore as any).sessions.values()).find(
      (s: any) => s.voterId === 'voter-test-01'
    ) as any;
    assert.ok(session1, 'Voter 1 session should exist');

    // Attempt second submission for INC
    const dupRes = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session1.token}`,
      },
      body: JSON.stringify({ partyCode: 'INC' }),
    });

    assert.equal(dupRes.status, 409);
    const dupData = await dupRes.json();
    assert.equal(dupData.success, false);
    assert.ok(dupData.message.includes('already submitted a response'));

    // Check aggregate tallies remain strictly at 1 response (BJP: 1, INC: 0)
    const agg = await getPollAggregateFromFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.ok(agg);
    assert.equal(agg.totalResponses, 1);
    assert.equal(agg.partyTallies['BJP'], 1);
    assert.equal(agg.partyTallies['INC'], 0);
  });

  // --------------------------------------------------------------------------
  // 6. Multiple Voters & Real Aggregate Calculation Without Mock Fallbacks
  // --------------------------------------------------------------------------
  await t.test('6. Multiple distinct voters update tallies accurately; zero fake votes', async () => {
    // Elector 2 votes for INC
    const session2 = serverStore.createSession(
      {
        id: 'voter-test-02',
        epicId: 'IND-TEST-002',
        name: 'Rahul Varma',
        gender: 'M',
        age: 38,
        constituencyId: 'CONST-04-ND',
        pollingStation: 'Station 11',
        maskedMobile: 'XXXXXX5678',
        isEligible: true,
        status: 'AUTHORIZED',
      },
      4
    );

    const vote2 = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session2.token}`,
      },
      body: JSON.stringify({ partyCode: 'INC' }),
    });
    assert.equal(vote2.status, 201);

    // Elector 3 votes for AAP
    const session3 = serverStore.createSession(
      {
        id: 'voter-test-03',
        epicId: 'IND-TEST-003',
        name: 'Sunita Mehra',
        gender: 'F',
        age: 34,
        constituencyId: 'CONST-04-ND',
        pollingStation: 'Station 12',
        maskedMobile: 'XXXXXX9012',
        isEligible: true,
        status: 'AUTHORIZED',
      },
      4
    );

    const vote3 = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session3.token}`,
      },
      body: JSON.stringify({ partyCode: 'AAP' }),
    });
    assert.equal(vote3.status, 201);

    // Check aggregates derived from Firestore
    const agg = await getPollAggregateFromFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.ok(agg);
    assert.equal(agg.totalResponses, 3);
    assert.equal(agg.partyTallies['BJP'], 1);
    assert.equal(agg.partyTallies['INC'], 1);
    assert.equal(agg.partyTallies['AAP'], 1);
    assert.equal(agg.partyTallies['BSP'], 0);
    assert.equal(agg.partyTallies['CPIM'], 0);

    // Admin reconciliation confirms 100% agreement against stored individual docs
    const reconcileRes = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/reconcile`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminSessionToken}`,
      },
    });
    assert.equal(reconcileRes.status, 200);
    const recData = await reconcileRes.json();
    assert.equal(recData.success, true);
    assert.equal(recData.totalResponses, 3);
    assert.equal(recData.partyTallies['BJP'], 1);
    assert.equal(recData.partyTallies['INC'], 1);
    assert.equal(recData.partyTallies['AAP'], 1);
  });

  // --------------------------------------------------------------------------
  // 7. Closed Poll & Empty / Non-Existent Poll States
  // --------------------------------------------------------------------------
  await t.test('7. Closed poll and non-existent poll states handled cleanly', async () => {
    // A. Non-existent poll returns 404
    const notFoundRes = await fetch(`${baseUrl}/api/poll/non-existent-poll-999`);
    assert.equal(notFoundRes.status, 404);
    const notFoundData = await notFoundRes.json();
    assert.equal(notFoundData.success, false);

    // B. Close poll via admin endpoint
    const closeRes = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSessionToken}`,
      },
      body: JSON.stringify({ status: 'closed' }),
    });
    assert.equal(closeRes.status, 200);

    // C. Elector 4 attempts to vote in closed poll -> rejected with 400
    const session4 = serverStore.createSession(
      {
        id: 'voter-test-04',
        epicId: 'IND-TEST-004',
        name: 'Aarav Patel',
        gender: 'M',
        age: 42,
        constituencyId: 'CONST-04-ND',
        pollingStation: 'Station 13',
        maskedMobile: 'XXXXXX3456',
        isEligible: true,
        status: 'AUTHORIZED',
      },
      4
    );

    const voteClosed = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session4.token}`,
      },
      body: JSON.stringify({ partyCode: 'BJP' }),
    });
    assert.equal(voteClosed.status, 400);
    const voteClosedData = await voteClosed.json();
    assert.equal(voteClosedData.success, false);
    assert.ok(voteClosedData.message.includes('closed'));

    // Re-open poll
    await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminSessionToken}`,
      },
      body: JSON.stringify({ status: 'open' }),
    });
  });

  // --------------------------------------------------------------------------
  // 8. API Validation & Bad Input Rejection
  // --------------------------------------------------------------------------
  await t.test('8. Malformed party options are rejected with 400 Bad Request', async () => {
    const session8 = serverStore.createSession(
      {
        id: 'voter-test-08',
        epicId: 'IND-TEST-008',
        name: 'Kavita Rao',
        gender: 'F',
        age: 31,
        constituencyId: 'CONST-04-ND',
        pollingStation: 'Station 15',
        maskedMobile: 'XXXXXX7890',
        isEligible: true,
        status: 'AUTHORIZED',
      },
      4
    );

    // A. Empty partyCode
    const emptyParty = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session8.token}`,
      },
      body: JSON.stringify({ partyCode: '   ' }),
    });
    assert.equal(emptyParty.status, 400);

    // B. Invalid partyCode not in recognized parties list
    const fakeParty = await fetch(`${baseUrl}/api/poll/${DEFAULT_PREFERENCE_POLL_ID}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session8.token}`,
      },
      body: JSON.stringify({ partyCode: 'FAKE_PIRATE_PARTY' }),
    });
    assert.equal(fakeParty.status, 400);
  });

  // --------------------------------------------------------------------------
  // 9. Historical Data Isolation: Poll Cannot Modify 2024 Election Records
  // --------------------------------------------------------------------------
  await t.test('9. Preference poll submissions and administration do NOT modify historical results', async () => {
    // 1. Check historical constituencies count before
    const historicalBefore = await getAllHistoricalConstituenciesFromFirestore();
    assert.equal(historicalBefore.length, HISTORICAL_CONSTITUENCIES_2024.length);

    const newDelhiBefore = await getHistoricalConstituencyByIdFromFirestore('HIST-2024-DL-04');
    assert.ok(newDelhiBefore);
    assert.equal(newDelhiBefore.winnerName, 'Bansuri Swaraj');
    assert.equal(newDelhiBefore.winnerParty, 'Bharatiya Janata Party');
    assert.equal(newDelhiBefore.votesCounted, 847426);

    // 2. Query historical API endpoint
    const histRes = await fetch(`${baseUrl}/api/historical/constituencies/HIST-2024-DL-04`);
    assert.equal(histRes.status, 200);
    const histData = await histRes.json();
    assert.equal(histData.success, true);
    assert.equal(histData.constituency.name, 'New Delhi');
    assert.equal(histData.constituency.winnerName, 'Bansuri Swaraj');

    // 3. Confirm historical candidates remain unmodified
    const cand = histData.constituency.candidates.find((c: any) => c.name === 'Bansuri Swaraj');
    assert.ok(cand);
    assert.equal(cand.votesCounted, 453185);
  });
});
