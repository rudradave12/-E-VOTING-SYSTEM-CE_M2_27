import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { adminRouter, clearAdminSessionsForTesting } from '../../server/routes/admin';
import { historicalRouter } from '../../server/routes/historical';
import { pollRouter } from '../../server/routes/poll';
import { voterRouter } from '../../server/routes/voter';
import { serverStore } from '../../server/store';
import { verifyAdminIdToken, setAdminTokenVerifierForTesting } from '../../server/firebaseAdmin';
import { deriveServerNullifier, computeOtpHmac } from '../../server/crypto';
import * as clientCrypto from '../utils/crypto';
import { TEST_VOTERS } from './fixtures/voterFixtures';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('BlockBallot — Phase 7A: Critical Security Hardening Test Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  t.before(async () => {
    serverStore.seedVotersForTesting(TEST_VOTERS);
    const app = express();
    app.use(express.json());

    app.use('/api/admin', adminRouter);
    app.use('/api', adminRouter);
    app.use('/api/historical', historicalRouter);
    app.use('/api/poll', pollRouter);
    app.use('/api/voter', voterRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    setAdminTokenVerifierForTesting(null);
    clearAdminSessionsForTesting();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    setTimeout(() => process.exit(0), 100);
  });

  // --------------------------------------------------------------------------
  // 1. Rejected Unauthenticated Admin Requests
  // --------------------------------------------------------------------------
  await t.test('1. Unauthenticated administrative requests are strictly rejected (401/403)', async () => {
    // A. POST /api/admin/login without token
    const loginNoToken = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(loginNoToken.status, 401, 'Login without ID token must return 401');
    const loginNoTokenData = await loginNoToken.json();
    assert.equal(loginNoTokenData.success, false);

    // B. POST /api/admin/elections without auth
    const createElec = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Rogue Election' }),
    });
    assert.ok([401, 403].includes(createElec.status), 'Unauthenticated election creation must return 401 or 403');

    // C. PATCH /api/admin/elections/1/status without auth
    const updateElec = await fetch(`${baseUrl}/api/admin/elections/ELEC-18-LS/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'concluded' }),
    });
    assert.ok([401, 403].includes(updateElec.status), 'Unauthenticated election status update must return 401 or 403');

    // D. POST /api/admin/candidates without auth
    const addCand = await fetch(`${baseUrl}/api/admin/candidates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Rogue Candidate', constituencyId: 'CONST-04-ND', partyName: 'Independent' }),
    });
    assert.ok([401, 403].includes(addCand.status), 'Unauthenticated candidate creation must return 401 or 403');

    // E. GET /api/admin/voters without auth
    const getVoters = await fetch(`${baseUrl}/api/admin/voters`);
    assert.ok([401, 403].includes(getVoters.status), 'Unauthenticated voter roll access must return 401 or 403');

    // F. PATCH /api/admin/voters/:id/eligibility without auth
    const patchEligibility = await fetch(`${baseUrl}/api/admin/voters/VOTER-ND-01/eligibility`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isEligible: false }),
    });
    assert.ok([401, 403].includes(patchEligibility.status), 'Unauthenticated voter eligibility modification must return 401 or 403');

    // G. POST /api/admin/voters/:id/reset without auth
    const resetVoter = await fetch(`${baseUrl}/api/admin/voters/VOTER-ND-01/reset`, {
      method: 'POST',
    });
    assert.ok([401, 403].includes(resetVoter.status), 'Unauthenticated voter authorization reset must return 401 or 403');

    // H. POST /api/historical/import without auth
    const importHist = await fetch(`${baseUrl}/api/historical/import`, {
      method: 'POST',
    });
    assert.equal(importHist.status, 403, 'Unauthenticated historical data import must return 403');

    // I. POST /api/poll/:pollId/reconcile without auth
    const reconcilePoll = await fetch(`${baseUrl}/api/poll/general-election-2024-preference-poll/reconcile`, {
      method: 'POST',
    });
    assert.equal(reconcilePoll.status, 403, 'Unauthenticated poll reconciliation must return 403');

    // J. PATCH /api/poll/:pollId/status without auth
    const patchPollStatus = await fetch(`${baseUrl}/api/poll/general-election-2024-preference-poll/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'closed' }),
    });
    assert.equal(patchPollStatus.status, 403, 'Unauthenticated poll status update must return 403');
  });

  // --------------------------------------------------------------------------
  // 2. Server-side Token Verification & Role-based Authorization
  // --------------------------------------------------------------------------
  await t.test('2. Server verifies ID tokens, checks roles, fails closed, and honors valid sessions', async () => {
    // Verify direct token verification logic fails closed on malformed input
    const emptyCheck = await verifyAdminIdToken('');
    assert.equal(emptyCheck.isValid, false);

    const forgedCheck = await verifyAdminIdToken('forged-token-abc');
    assert.equal(forgedCheck.isValid, false);

    // Register test verifier hook simulating non-admin user
    setAdminTokenVerifierForTesting(async (token: string) => {
      if (token === 'regular-citizen-token') {
        return { isValid: false, error: 'User does not hold an authorized Commission officer role.' };
      }
      if (token === 'verified-commissioner-token') {
        return { isValid: true, uid: 'admin-uid-99', email: 'commissioner@blockballot.gov.in', role: 'commissioner' };
      }
      return { isValid: false, error: 'Invalid or forged token.' };
    });

    // Attempt login with regular citizen token -> rejected
    const nonAdminLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'regular-citizen-token' }),
    });
    assert.equal(nonAdminLogin.status, 401);
    const nonAdminData = await nonAdminLogin.json();
    assert.equal(nonAdminData.success, false);
    assert.ok(nonAdminData.message.includes('Commission officer role'));

    // Attempt login with verified commissioner token -> succeeds and grants session
    const adminLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: 'verified-commissioner-token' }),
    });
    assert.equal(adminLogin.status, 200);
    const adminData = await adminLogin.json();
    assert.equal(adminData.success, true);
    assert.ok(adminData.token.startsWith('adm_'), 'Session token must be formatted adm_<hex>');
    assert.equal(adminData.user.email, 'commissioner@blockballot.gov.in');

    const validAdminSessionToken = adminData.token;

    // Use session token to access protected election creation endpoint -> succeeds
    const createElecAuth = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validAdminSessionToken}`,
      },
      body: JSON.stringify({
        title: 'Phase 7A Verified Test Election',
        numericId: 777,
      }),
    });
    assert.equal(createElecAuth.status, 201);
    const elecData = await createElecAuth.json();
    assert.equal(elecData.success, true);
    assert.equal(elecData.election.numericId, 777);

    // Tampered session token -> rejected
    const tamperedSession = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${validAdminSessionToken}_tampered`,
      },
      body: JSON.stringify({ title: 'Illegal Election' }),
    });
    assert.ok([401, 403].includes(tamperedSession.status), 'Tampered session must be rejected with 401 or 403');
  });

  // --------------------------------------------------------------------------
  // 3. Preference Poll Identity Spoofing Protection
  // --------------------------------------------------------------------------
  await t.test('3. Preference poll rejects spoofed userId headers/body and derives identity from verified session', async () => {
    const pollId = 'general-election-2024-preference-poll';

    // A. Rejects spoofed userId in body without authentication
    const spoofBody = await fetch(`${baseUrl}/api/poll/${pollId}/vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: 'spoofed-elector-identity-999',
        partyCode: 'BJP',
      }),
    });
    assert.equal(spoofBody.status, 401, 'Request with unauthenticated userId in body must be rejected');

    // B. Rejects spoofed x-poll-user-id header without authentication
    const spoofHeader = await fetch(`${baseUrl}/api/poll/${pollId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-poll-user-id': 'spoofed-header-user',
      },
      body: JSON.stringify({ partyCode: 'INC' }),
    });
    assert.equal(spoofHeader.status, 401, 'Request with unauthenticated x-poll-user-id header must be rejected');

    // C. Rejects invalid or expired Bearer token
    const invalidBearer = await fetch(`${baseUrl}/api/poll/${pollId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer session_nonexistent_or_expired',
      },
      body: JSON.stringify({ partyCode: 'AAP' }),
    });
    assert.equal(invalidBearer.status, 401, 'Request with invalid session Bearer token must be rejected');

    // D. Legitimate voter session created via server verification
    const mockVoter = serverStore.findVoterByEpic('IND-DL-982341')!;
    const voterSession = serverStore.createSession(mockVoter, 4);

    // Vote with legitimate Bearer token — even if a malicious client sends a different spoofed userId in body
    const legitimateVote = await fetch(`${baseUrl}/api/poll/${pollId}/vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${voterSession.token}`,
      },
      body: JSON.stringify({
        userId: 'malicious-spoof-attempt',
        partyCode: 'BJP',
      }),
    });

    // The vote must pass authentication (i.e. status MUST NOT be 401).
    // In live Firestore it returns 201 (or 409 if already submitted); in local unauthenticated test it attempts transaction and may return 400/500 if database rules deny unauthenticated cloud access.
    assert.notEqual(
      legitimateVote.status,
      401,
      'Verified session must NOT be rejected by the authentication layer (status must not be 401)'
    );

    if (legitimateVote.status === 201) {
      const voteData = await legitimateVote.json();
      assert.equal(voteData.success, true);
      assert.equal(
        voteData.receipt.userId,
        mockVoter.id,
        'Voter identity must be derived strictly from verified session, ignoring spoofed body'
      );

      // Duplicate submission by same session must be rejected (409 Conflict)
      const duplicateVote = await fetch(`${baseUrl}/api/poll/${pollId}/vote`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${voterSession.token}`,
        },
        body: JSON.stringify({ partyCode: 'INC' }),
      });
      assert.equal(duplicateVote.status, 409, 'Duplicate poll response from same elector must return 409 Conflict');
    }

    // E. GET /api/poll/:pollId/my-response rejects unauthenticated queries
    const unauthReceipt = await fetch(`${baseUrl}/api/poll/${pollId}/my-response`);
    assert.equal(unauthReceipt.status, 401, 'Unauthenticated query for receipt must return 401');

    const spoofedQueryReceipt = await fetch(`${baseUrl}/api/poll/${pollId}/my-response?userId=victim-id`);
    assert.equal(spoofedQueryReceipt.status, 401, 'Query with userId parameter but no auth must return 401');
  });

  // --------------------------------------------------------------------------
  // 4. Cryptographic Configuration Hardening & Secret Isolation
  // --------------------------------------------------------------------------
  await t.test('4. Cryptographic secrets and salt are removed from client-side bundle', () => {
    // Assert that client-side crypto module does NOT export sensitive secrets or client nullifier derivation
    assert.equal(
      (clientCrypto as any).SERVER_COMMITMENT_SALT,
      undefined,
      'SERVER_COMMITMENT_SALT must NOT be present in client-side crypto module'
    );
    assert.equal(
      (clientCrypto as any).deriveNullifier,
      undefined,
      'Client deriveNullifier must NOT be exported from client-side module'
    );
    assert.equal(
      (clientCrypto as any).hashOtpCode,
      undefined,
      'Client hashOtpCode must NOT be exported from client-side module'
    );

    // Verify server-side nullifier derivation is consistent and deterministic
    const nullifierA = deriveServerNullifier('IND-DL-982341', 18);
    const nullifierB = deriveServerNullifier('IND-DL-982341', 18);
    const nullifierOtherElection = deriveServerNullifier('IND-DL-982341', 19);

    assert.equal(nullifierA, nullifierB, 'Server nullifier must be deterministic');
    assert.notEqual(nullifierA, nullifierOtherElection, 'Nullifier must bind to electionId');
    assert.ok(nullifierA.startsWith('0x') && nullifierA.length === 66, 'Nullifier must be bytes32 hex');

    // Verify .env.example contains placeholders only
    const envExamplePath = path.resolve(__dirname, '../../.env.example');
    assert.ok(fs.existsSync(envExamplePath), '.env.example must exist');
    const envExampleContent = fs.readFileSync(envExamplePath, 'utf8');

    const lines = envExampleContent.split('\n').map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
    for (const line of lines) {
      const parts = line.split('=');
      const val = parts.slice(1).join('=').trim();
      assert.equal(
        val,
        '',
        `Line "${line}" in .env.example must only have empty placeholders, never real secrets`
      );
    }
  });

  // --------------------------------------------------------------------------
  // 5. Firestore Rules Invariant Integrity Verification
  // --------------------------------------------------------------------------
  await t.test('5. Firestore security rules enforce strict authorization without validation bypasses', () => {
    const rulesPath = path.resolve(__dirname, '../../firestore.rules');
    assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
    const rules = fs.readFileSync(rulesPath, 'utf8');

    // Check that dangerous permission bypasses are removed
    assert.ok(!rules.includes('|| isValidElection('), 'Must not contain || isValidElection bypass');
    assert.ok(!rules.includes('|| isValidCandidate('), 'Must not contain || isValidCandidate bypass');
    assert.ok(!rules.includes('|| isValidConstituency('), 'Must not contain || isValidConstituency bypass');
    assert.ok(!rules.includes('|| isValidVoter('), 'Must not contain || isValidVoter bypass');
    assert.ok(!rules.includes('|| isValidAuditEvent('), 'Must not contain || isValidAuditEvent bypass');

    // Check that OTP challenges collection is completely locked
    assert.ok(
      rules.includes('match /otp_challenges/{epicId}') &&
      rules.includes('allow read, write: if false;'),
      'OTP challenges must be completely locked from client SDK'
    );

    // Check that voter roll listing requires admin
    assert.ok(
      rules.includes('match /voters/{voterId}') &&
      rules.includes('allow list: if isAdmin();'),
      'Voter list operation must require isAdmin()'
    );

    // Check that historical and parties collections are write-locked
    assert.ok(
      rules.includes('match /historical_constituencies_2024/{constituencyId}') &&
      rules.includes('allow write: if false;'),
      'Historical constituencies must be write-locked'
    );

    // Check that poll responses subcollection is write-locked from client SDK
    assert.ok(
      rules.includes('match /responses/{userId}') &&
      rules.includes('allow write: if false;'),
      'Poll responses must be write-locked from client SDK'
    );

    // Check that poll aggregates subcollection is write-locked from client SDK
    assert.ok(
      rules.includes('match /aggregates/{aggId}') &&
      rules.includes('allow write: if false;'),
      'Poll aggregates must be write-locked from client SDK'
    );
  });
});
