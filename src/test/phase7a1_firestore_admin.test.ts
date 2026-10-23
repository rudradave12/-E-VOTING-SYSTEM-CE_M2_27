import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  setAdminFirestoreForTesting,
  createInMemoryFirestoreMock,
  isFirebaseConfigured,
  getFirebaseAdminFirestore,
} from '../../server/firebaseAdmin';

import {
  serverDb,
  saveOtpChallengeToFirestore,
  getOtpChallengeFromFirestore,
  saveVoterRecordToFirestore,
  getVoterRecordByEpicFromFirestore,
  getAllVotersFromFirestore,
  saveElectionToFirestore,
  getAllElectionsFromFirestore,
  getElectionByIdFromFirestore,
  saveConstituencyToFirestore,
  getAllConstituenciesFromFirestore,
  saveCandidateToFirestore,
  getAllCandidatesFromFirestore,
  appendAuditEventToFirestore,
  getAllAuditEventsFromFirestore,
  saveHistoricalConstituencyToFirestore,
  getAllHistoricalConstituenciesFromFirestore,
  getHistoricalConstituencyByIdFromFirestore,
  savePoliticalPartyToFirestore,
  getAllPoliticalPartiesFromFirestore,
  importOfficialHistorical2024Data,
  initPreferencePollIfNotExists,
  getPreferencePollFromFirestore,
  getPollAggregateFromFirestore,
  getUserPollResponseFromFirestore,
  submitPollResponseToFirestore,
  reconcilePollAggregatesInFirestore,
  updatePreferencePollStatus,
  DEFAULT_PREFERENCE_POLL_ID,
} from '../../server/firestore';

import {
  HISTORICAL_CONSTITUENCIES_2024,
  RECOGNIZED_PARTIES,
} from '../data/historical2024';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('BlockBallot — Phase 7A.1: Secure Firestore Admin SDK Adapter Test Suite', async (t) => {
  t.after(() => {
    setAdminFirestoreForTesting(null);
    setTimeout(() => process.exit(0), 100);
  });

  // --------------------------------------------------------------------------
  // 1. Missing Credentials & Fail-Closed Safeguards
  // --------------------------------------------------------------------------
  await t.test('1. Missing Firebase credentials fail closed with clear configuration error', async () => {
    // Ensure no mock is active and no env credentials exist
    setAdminFirestoreForTesting(null);
    const origSa = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    const origAdc = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    const origEmu = process.env.FIRESTORE_EMULATOR_HOST;

    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    delete process.env.FIRESTORE_EMULATOR_HOST;

    try {
      assert.equal(isFirebaseConfigured(), false);

      await assert.rejects(
        async () => {
          await saveOtpChallengeToFirestore({
            epicId: 'IND-TEST-FAIL',
            hmacHash: 'hash123',
            attemptsRemaining: 3,
            expiresAt: Date.now() + 300000,
            isUsed: false,
            createdAt: Date.now(),
            lastRequestedAt: Date.now(),
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('Firebase Admin credentials not configured'));
          assert.ok(err.message.includes('FIREBASE_SERVICE_ACCOUNT_KEY'));
          return true;
        }
      );

      // Verify emulator recognition
      process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080';
      assert.equal(isFirebaseConfigured(), true);
    } finally {
      if (origSa) process.env.FIREBASE_SERVICE_ACCOUNT_KEY = origSa;
      else delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;

      if (origAdc) process.env.GOOGLE_APPLICATION_CREDENTIALS = origAdc;
      else delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

      if (origEmu) process.env.FIRESTORE_EMULATOR_HOST = origEmu;
      else delete process.env.FIRESTORE_EMULATOR_HOST;
    }
  });

  // --------------------------------------------------------------------------
  // Activate In-Memory Mock Firestore for Hermetic Adapter Tests
  // --------------------------------------------------------------------------
  const mockDb = createInMemoryFirestoreMock();
  setAdminFirestoreForTesting(mockDb);

  // --------------------------------------------------------------------------
  // 2. OTP Challenge Operations (/otp_challenges/{epicId})
  // --------------------------------------------------------------------------
  await t.test('2. OTP Challenge persistence via Firebase Admin SDK', async () => {
    const challenge = {
      epicId: 'ind-delhi-001', // Lowercase to test normalization
      hmacHash: 'a1b2c3d4e5f60123456789abcdef0123456789abcdef0123456789abcdef0123',
      attemptsRemaining: 3,
      expiresAt: Date.now() + 300000,
      isUsed: false,
      createdAt: Date.now(),
      lastRequestedAt: Date.now(),
    };

    await saveOtpChallengeToFirestore(challenge);

    // Retrieve by uppercase EPIC
    const retrieved = await getOtpChallengeFromFirestore('IND-DELHI-001');
    assert.ok(retrieved);
    assert.equal(retrieved.epicId, 'IND-DELHI-001');
    assert.equal(retrieved.hmacHash, challenge.hmacHash);
    assert.equal(retrieved.attemptsRemaining, 3);
    assert.equal(retrieved.isUsed, false);

    // Non-existent challenge returns null
    const nonExistent = await getOtpChallengeFromFirestore('NON-EXISTENT-EPIC');
    assert.equal(nonExistent, null);
  });

  // --------------------------------------------------------------------------
  // 3. Voter Lifecycle State (/voters/{voterId})
  // --------------------------------------------------------------------------
  await t.test('3. Voter record persistence and lookup by EPIC ID', async () => {
    const voter = {
      id: 'voter-uuid-101',
      epicId: 'IND-VOTER-101',
      name: 'Rohan Sharma',
      gender: 'M' as const,
      age: 29,
      constituencyId: 'CONST-04-ND',
      pollingStation: 'Station 401, Central Delhi',
      maskedMobile: 'XXXXXX4321',
      isEligible: true,
      status: 'ELIGIBLE' as const,
    };

    await saveVoterRecordToFirestore(voter);

    // Query by EPIC ID
    const byEpic = await getVoterRecordByEpicFromFirestore('IND-VOTER-101');
    assert.ok(byEpic);
    assert.equal(byEpic.id, 'voter-uuid-101');
    assert.equal(byEpic.name, 'Rohan Sharma');
    assert.equal(byEpic.status, 'ELIGIBLE');

    // Update with merge (authorization metadata)
    await saveVoterRecordToFirestore({
      ...voter,
      status: 'AUTHORIZED',
      authorizedWallet: '0x1234567890123456789012345678901234567890',
      activeNullifier: '0xnullifier999',
    });

    const updated = await getVoterRecordByEpicFromFirestore('IND-VOTER-101');
    assert.ok(updated);
    assert.equal(updated.status, 'AUTHORIZED');
    assert.equal(updated.authorizedWallet, '0x1234567890123456789012345678901234567890');

    // List all voters
    const all = await getAllVotersFromFirestore();
    assert.ok(all.some((v) => v.id === 'voter-uuid-101'));
  });

  // --------------------------------------------------------------------------
  // 4. Elections, Constituencies, Candidates
  // --------------------------------------------------------------------------
  await t.test('4. Parliamentary elections, constituencies, and candidate persistence', async () => {
    // A. Election
    const testElection = {
      id: 'ELEC-2026-PARL',
      numericId: 2026,
      title: '2026 Parliamentary General Election',
      description: 'National general election',
      status: 'active' as const,
      startTime: Math.floor(Date.now() / 1000) - 3600,
      endTime: Math.floor(Date.now() / 1000) + 86400,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      totalVotersRegistered: 50000,
      totalVotesCast: 120,
      constituencyIds: ['CONST-04-ND'],
    };

    await saveElectionToFirestore(testElection);
    const fetchedElection = await getElectionByIdFromFirestore('ELEC-2026-PARL');
    assert.ok(fetchedElection);
    assert.equal(fetchedElection.title, '2026 Parliamentary General Election');
    assert.equal(fetchedElection.numericId, 2026);

    const allElections = await getAllElectionsFromFirestore();
    assert.ok(allElections.some((e) => e.id === 'ELEC-2026-PARL'));

    // B. Constituency
    const testConstituency = {
      id: 'CONST-04-ND',
      code: '04',
      name: 'New Delhi',
      state: 'NCT of Delhi',
      totalElectors: 1500000,
      turnoutCount: 950000,
      candidateIds: ['CAND-04-01'],
    };

    await saveConstituencyToFirestore(testConstituency);
    const allConstituencies = await getAllConstituenciesFromFirestore();
    assert.ok(allConstituencies.some((c) => c.id === 'CONST-04-ND'));

    // C. Candidate
    const testCandidate = {
      id: 'CAND-04-01',
      numericId: 1,
      constituencyId: 'CONST-04-ND',
      name: 'Amit Patel',
      partyName: 'National Democratic Alliance',
      partyAbbreviation: 'NDA',
      symbol: 'Lotus',
      symbolDescription: 'Lotus flower symbol',
      symbolSource: 'ECI Notification No. 56/2024/PPS-III',
      symbolVerificationStatus: 'VERIFIED_ECI' as const,
      symbolColor: '#F97316',
      education: 'Post Graduate',
      age: 52,
      criminalCases: 0,
      assets: '₹5 Cr',
      voteCount: 0,
    };

    await saveCandidateToFirestore(testCandidate);
    const allCandidates = await getAllCandidatesFromFirestore();
    assert.ok(allCandidates.some((c) => c.id === 'CAND-04-01'));
  });

  // --------------------------------------------------------------------------
  // 5. Append-Only Audit Event Log
  // --------------------------------------------------------------------------
  await t.test('5. Audit events persistence preserves timestamp ordering', async () => {
    const t1 = Date.now();
    const t2 = t1 + 1000;

    await appendAuditEventToFirestore({
      id: 'AUDIT-01',
      timestamp: t1,
      type: 'ELECTION_STATE',
      description: 'Election state changed to active',
      electionId: 2026,
    });

    await appendAuditEventToFirestore({
      id: 'AUDIT-02',
      timestamp: t2,
      type: 'VOTE_CAST',
      description: 'Vote recorded on-chain',
      electionId: 2026,
      txHash: '0xabcdef',
    });

    const events = await getAllAuditEventsFromFirestore();
    assert.ok(events.length >= 2);
    // Should be sorted descending by timestamp
    assert.equal(events[0].id, 'AUDIT-02');
    assert.equal(events[1].id, 'AUDIT-01');
  });

  // --------------------------------------------------------------------------
  // 6. Official 2024 Historical Data & Parties Directory
  // --------------------------------------------------------------------------
  await t.test('6. Official historical data import pipeline persists verified records', async () => {
    const importResult = await importOfficialHistorical2024Data();
    assert.equal(importResult.success, true);
    assert.equal(importResult.constituenciesImported, HISTORICAL_CONSTITUENCIES_2024.length);
    assert.equal(importResult.partiesImported, RECOGNIZED_PARTIES.length);

    // Check individual historical constituency lookup
    const firstConst = HISTORICAL_CONSTITUENCIES_2024[0];
    const retrievedConst = await getHistoricalConstituencyByIdFromFirestore(firstConst.id);
    assert.ok(retrievedConst);
    assert.equal(retrievedConst.name, firstConst.name);
    assert.equal(retrievedConst.winnerParty, firstConst.winnerParty);

    // Check parties directory
    const parties = await getAllPoliticalPartiesFromFirestore();
    assert.ok(parties.length >= 10);
    assert.ok(parties.some((p) => p.code === 'BJP'));
    assert.ok(parties.some((p) => p.code === 'INC'));
    assert.ok(parties.some((p) => p.code === 'AAP'));
  });

  // --------------------------------------------------------------------------
  // 7. Independent Preference Poll Lifecycle & Atomic Transactions
  // --------------------------------------------------------------------------
  await t.test('7. Preference poll initialization, atomic submission, and reconciliation', async () => {
    // A. Init poll
    await initPreferencePollIfNotExists();
    const pollConfig = await getPreferencePollFromFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.ok(pollConfig);
    assert.equal(pollConfig.status, 'open');

    // B. Check initial aggregate has 0 responses
    const initialAgg = await getPollAggregateFromFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.ok(initialAgg);
    assert.equal(initialAgg.totalResponses, 0);
    assert.equal(initialAgg.partyTallies['BJP'], 0);
    assert.equal(initialAgg.partyTallies['INC'], 0);

    // C. Submit valid response
    const sub1 = await submitPollResponseToFirestore(DEFAULT_PREFERENCE_POLL_ID, 'voter-alice-uid', 'BJP');
    assert.equal(sub1.success, true);
    assert.ok(sub1.receipt);
    assert.ok(sub1.receipt.receiptId.startsWith('RCPT-POLL-'));
    assert.equal(sub1.receipt.partyCode, 'BJP');

    // Aggregate updated
    const afterSub1 = await getPollAggregateFromFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.ok(afterSub1);
    assert.equal(afterSub1.totalResponses, 1);
    assert.equal(afterSub1.partyTallies['BJP'], 1);

    // D. Duplicate response rejection
    const subDup = await submitPollResponseToFirestore(DEFAULT_PREFERENCE_POLL_ID, 'voter-alice-uid', 'INC');
    assert.equal(subDup.success, false);
    assert.ok(subDup.message.includes('already submitted'));

    // E. Second voter submits for INC
    const sub2 = await submitPollResponseToFirestore(DEFAULT_PREFERENCE_POLL_ID, 'voter-bob-uid', 'INC');
    assert.equal(sub2.success, true);

    const afterSub2 = await getPollAggregateFromFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.ok(afterSub2);
    assert.equal(afterSub2.totalResponses, 2);
    assert.equal(afterSub2.partyTallies['BJP'], 1);
    assert.equal(afterSub2.partyTallies['INC'], 1);

    // F. Reconcile aggregates from actual responses
    const reconciled = await reconcilePollAggregatesInFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.equal(reconciled.success, true);
    assert.equal(reconciled.totalResponses, 2);
    assert.equal(reconciled.partyTallies['BJP'], 1);
    assert.equal(reconciled.partyTallies['INC'], 1);

    // G. Close poll and verify submission blocked
    await updatePreferencePollStatus(DEFAULT_PREFERENCE_POLL_ID, 'closed');
    const closedConfig = await getPreferencePollFromFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.ok(closedConfig);
    assert.equal(closedConfig.status, 'closed');

    const subClosed = await submitPollResponseToFirestore(DEFAULT_PREFERENCE_POLL_ID, 'voter-charlie-uid', 'AAP');
    assert.equal(subClosed.success, false);
    assert.ok(subClosed.message.includes('closed'));
  });

  // --------------------------------------------------------------------------
  // 8. Security Rules Compatibility Audit
  // --------------------------------------------------------------------------
  await t.test('8. Strict firestore.rules compatibility with frontend reads and server-side Admin writes', () => {
    const rulesPath = path.resolve(__dirname, '../../firestore.rules');
    assert.ok(fs.existsSync(rulesPath), 'firestore.rules must exist');
    const rawRules = fs.readFileSync(rulesPath, 'utf8');
    const rules = rawRules.replace(/\r\n/g, '\n');

    // 1. Client write to /otp_challenges is locked
    assert.ok(
      rules.includes('match /otp_challenges/{epicId} {\n      allow read, write: if false;'),
      'OTP challenges must deny direct client read/write'
    );

    // 2. Client write to /historical_constituencies_2024 is locked
    assert.ok(
      rules.includes('match /historical_constituencies_2024/{constituencyId} {\n      allow read: if isValidId(constituencyId);\n      allow list: if true;\n      allow write: if false;'),
      'Historical constituencies must deny client write'
    );

    // 3. Client write to /political_parties is locked
    assert.ok(
      rules.includes('match /political_parties/{partyCode} {\n      allow read: if isValidId(partyCode);\n      allow list: if true;\n      allow write: if false;'),
      'Political parties directory must deny client write'
    );

    // 4. Client direct write to poll responses and aggregates is locked
    assert.ok(
      rules.includes('match /responses/{userId} {\n        allow read: if isValidId(userId) && isSignedIn() && (request.auth.uid == userId || isAdmin());\n        allow list: if isAdmin();\n        allow write: if false;'),
      'Poll responses must deny client direct write'
    );
    assert.ok(
      rules.includes('match /aggregates/{aggId} {\n        allow read: if isValidId(aggId);\n        allow list: if true;\n        allow write: if false;'),
      'Poll aggregates must deny client write'
    );

    // 5. Invariants: Server Admin SDK bypasses client security rules on server,
    // so every server API route enforces its own authorization.
    assert.ok(!rules.includes('allow write: if true'), 'No unauthenticated write allow rules permitted');
  });
});
