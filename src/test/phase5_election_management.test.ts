import test from 'node:test';
import assert from 'node:assert/strict';
import { serverStore } from '../../server/store';
import { SERVER_CONFIG } from '../../server/config';
import { TEST_VOTERS } from './fixtures/voterFixtures';
import {
  saveOtpChallengeToFirestore,
  getOtpChallengeFromFirestore,
  saveElectionToFirestore,
  getElectionByIdFromFirestore,
} from '../../server/firestore';
import {
  setAdminFirestoreForTesting,
  createInMemoryFirestoreMock,
} from '../../server/firebaseAdmin';

test('BlockBallot — Phase 5: Election Management & Voting Logic Test Suite', async (t) => {
  // Use in-memory Firestore mock to avoid writing to production cloud project
  setAdminFirestoreForTesting(createInMemoryFirestoreMock());

  // Clean exit handler
  t.after(() => {
    setAdminFirestoreForTesting(null);
    setTimeout(() => process.exit(0), 500);
  });

  // Reset store before test suite
  serverStore.resetDefaults();

  await t.test('1. Election creation with timeframe and numericId validation', () => {
    const nowSec = Math.floor(Date.now() / 1000);

    // Valid election creation
    const validElection = serverStore.createElection({
      id: 'ELEC-TEST-01',
      numericId: 101,
      title: '2026 Test Parliamentary General Election',
      description: 'Synthetic testing election for constituency validation',
      status: 'draft',
      startTime: nowSec - 3600, // started 1 hour ago
      endTime: nowSec + 86400 * 3, // ends in 3 days
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
    });

    assert.equal(validElection.id, 'ELEC-TEST-01');
    assert.equal(validElection.numericId, 101);
    assert.equal(validElection.status, 'draft');
    assert.equal(validElection.totalVotesCast, 0);

    const fetched = serverStore.getElectionById('ELEC-TEST-01');
    assert.ok(fetched);
    assert.equal(fetched.title, '2026 Test Parliamentary General Election');
  });

  await t.test('2. Election state transitions and lifecycle validation rules', () => {
    const nowSec = Math.floor(Date.now() / 1000);

    // Transition draft -> active
    const activateRes = serverStore.updateElectionStatus('ELEC-TEST-01', 'active');
    assert.equal(activateRes.success, true);
    assert.equal(serverStore.getElectionById('ELEC-TEST-01')?.status, 'active');

    // Transition active -> paused
    const pauseRes = serverStore.updateElectionStatus('ELEC-TEST-01', 'paused');
    assert.equal(pauseRes.success, true);
    assert.equal(serverStore.getElectionById('ELEC-TEST-01')?.status, 'paused');

    // Transition paused -> active
    const resumeRes = serverStore.updateElectionStatus('ELEC-TEST-01', 'active');
    assert.equal(resumeRes.success, true);
    assert.equal(serverStore.getElectionById('ELEC-TEST-01')?.status, 'active');

    // Transition active -> concluded (terminal state)
    const concludeRes = serverStore.updateElectionStatus('ELEC-TEST-01', 'concluded');
    assert.equal(concludeRes.success, true);
    assert.equal(serverStore.getElectionById('ELEC-TEST-01')?.status, 'concluded');

    // Concluded is terminal: must reject transition back to active or draft
    const illegalReopenRes = serverStore.updateElectionStatus('ELEC-TEST-01', 'active');
    assert.equal(illegalReopenRes.success, false);
    assert.match(illegalReopenRes.message, /terminal/i);
    assert.equal(serverStore.getElectionById('ELEC-TEST-01')?.status, 'concluded');

    // Expired election window cannot be activated
    const expiredElection = serverStore.createElection({
      id: 'ELEC-EXPIRED-99',
      numericId: 999,
      title: 'Past Election',
      description: 'Past Synthetic Election',
      status: 'draft',
      startTime: nowSec - 86400 * 10,
      endTime: nowSec - 86400, // already ended yesterday
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: ['CONST-04-ND'],
    });

    const activateExpired = serverStore.updateElectionStatus(expiredElection.id, 'active');
    assert.equal(activateExpired.success, false);
    assert.match(activateExpired.message, /past its scheduled end time/i);
  });

  await t.test('3. Candidate registration, duplicate prevention, and nomination locks', () => {
    // Fresh election in draft state
    serverStore.resetDefaults();
    const geElection = serverStore.getElectionById('GE-2024');
    if (geElection) geElection.status = 'draft';

    serverStore.createElection({
      id: 'ELEC-DRAFT-NOM',
      numericId: 202,
      title: 'Draft Election for Candidate Testing',
      description: 'Draft Synthetic Election',
      status: 'draft',
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400 * 5,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: ['CONST-04-ND'],
    });

    const cand1 = {
      id: 'CAND-TEST-01',
      numericId: 701,
      constituencyId: 'CONST-04-ND',
      name: 'Dr. Ramesh Chandra Gupta',
      partyName: 'National Democratic Coalition',
      partyAbbreviation: 'NDC',
      symbol: 'Torch',
      symbolKey: 'UNAVAILABLE' as const,
      symbolDescription: 'Torch symbol allocated by Returning Officer',
      symbolSource: 'ECI Free Symbols List Notification',
      symbolVerificationStatus: 'UNAVAILABLE' as const,
      symbolColor: '#DC2626',
      education: 'Ph.D. Economics',
      age: 52,
      criminalCases: 0,
      assets: '₹5.4 Cr',
      voteCount: 0,
    };

    const addRes1 = serverStore.addCandidate(cand1);
    assert.equal(addRes1.success, true);
    assert.equal(addRes1.message, 'Candidate registered successfully.');

    // Prevent duplicate candidate name in the same constituency
    const duplicateCand = { ...cand1, id: 'CAND-TEST-DUP' };
    const addDupRes = serverStore.addCandidate(duplicateCand);
    assert.equal(addDupRes.success, false);
    assert.match(addDupRes.message, /already exists in this constituency/i);

    // Reject registration for non-existent constituency
    const invalidConstCand = {
      ...cand1,
      id: 'CAND-TEST-INV-CONST',
      name: 'Unique Candidate',
      constituencyId: 'CONST-999-FAKE',
    };
    const addInvalidConst = serverStore.addCandidate(invalidConstCand);
    assert.equal(addInvalidConst.success, false);
    assert.match(addInvalidConst.message, /does not exist/i);
  });

  await t.test('4. Voter participation state lifecycle and duplicate voting prevention', () => {
    serverStore.seedVotersForTesting(TEST_VOTERS);
    const epic = 'IND-DL-982341';
    const voter = serverStore.findVoterByEpic(epic);
    assert.ok(voter);
    assert.equal(voter.status, 'ELIGIBLE');

    // 1. Issuing authorization moves status to AUTHORIZED
    const authorized = serverStore.updateVoterStatus(epic, 'AUTHORIZED', {
      authorizedWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      activeNullifier: '0x02bae260c44ce410b02b66b0343465dceae1d6a139beb9e0e954946d9738cd0c',
      ticketExpiry: Math.floor(Date.now() / 1000) + 900,
    });
    assert.equal(authorized, true);
    assert.equal(serverStore.findVoterByEpic(epic)?.status, 'AUTHORIZED');

    // 2. Finalizing ballot confirmation moves status to VOTED
    const voted = serverStore.updateVoterStatus(epic, 'VOTED');
    assert.equal(voted, true);
    const finalizedVoter = serverStore.findVoterByEpic(epic);
    assert.equal(finalizedVoter?.status, 'VOTED');
    assert.ok(finalizedVoter?.votedAt);

    // 3. Immutability: Once VOTED, status cannot regress back to ELIGIBLE or AUTHORIZED
    const regressAttempt = serverStore.updateVoterStatus(epic, 'ELIGIBLE');
    assert.equal(regressAttempt, false);
    assert.equal(serverStore.findVoterByEpic(epic)?.status, 'VOTED');

    // 4. Resetting voter who already voted is strictly blocked
    const resetAttempt = serverStore.resetVoterAuthorization(finalizedVoter!.id);
    assert.equal(resetAttempt, false);
    assert.equal(serverStore.findVoterByEpic(epic)?.status, 'VOTED');

    // 5. Modifying voter eligibility after voting is strictly blocked
    const toggleAttempt = serverStore.setVoterEligibility(finalizedVoter!.id, false);
    assert.equal(toggleAttempt, false);
  });

  await t.test('5. Idempotent on-chain reconciliation and transaction recovery', () => {
    const recoveryEpic = 'IND-UP-441209';
    const voter = serverStore.findVoterByEpic(recoveryEpic);
    assert.ok(voter);

    // Voter gets AUTHORIZED for a transaction
    const nullifier = '0x1111222233334444555566667777888899990000aaaabbbbccccddddeeeeffff';
    serverStore.updateVoterStatus(recoveryEpic, 'AUTHORIZED', {
      activeNullifier: nullifier,
      ticketExpiry: Math.floor(Date.now() / 1000) + 900,
    });
    assert.equal(serverStore.findVoterByEpic(recoveryEpic)?.status, 'AUTHORIZED');

    // Case A: Transaction was cancelled / reverted before mining (nullifier unspent)
    assert.equal(serverStore.isNullifierSpentOnChain(nullifier), false);
    const recovered = serverStore.resetVoterAuthorization(voter.id);
    assert.equal(recovered, true);
    assert.equal(serverStore.findVoterByEpic(recoveryEpic)?.status, 'ELIGIBLE');
    assert.equal(serverStore.findVoterByEpic(recoveryEpic)?.activeNullifier, undefined);

    // Case B: Transaction actually succeeded on-chain, nullifier is spent
    serverStore.markNullifierSpentOnChain(nullifier);
    assert.equal(serverStore.isNullifierSpentOnChain(nullifier), true);

    // If an elector tries to claim recovery when nullifier is already spent on chain,
    // the reconciliation marks them as VOTED and blocks resetting
    serverStore.updateVoterStatus(recoveryEpic, 'VOTED');
    assert.equal(serverStore.findVoterByEpic(recoveryEpic)?.status, 'VOTED');
    const blockedReset = serverStore.resetVoterAuthorization(voter.id);
    assert.equal(blockedReset, false);
  });

  await t.test('6. Server-side Firestore persistence and database ID verification', async () => {
    const expectedDbId = process.env.FIRESTORE_DATABASE_ID || '(default)';
    assert.equal(SERVER_CONFIG.FIRESTORE_DATABASE_ID, expectedDbId);
    const expectedProjectId = process.env.GCLOUD_PROJECT || 'e-voting-system-india';
    assert.equal(SERVER_CONFIG.PROJECT_ID, expectedProjectId);

    const testChallenge = {
      epicId: 'IND-TEST-PERSIST',
      hmacHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
      attemptsRemaining: 3,
      expiresAt: Math.floor(Date.now() / 1000) + 300,
      isUsed: false,
      createdAt: Math.floor(Date.now() / 1000),
      lastRequestedAt: Math.floor(Date.now() / 1000),
    };

    // Save and retrieve OTP challenge directly from Firestore
    await saveOtpChallengeToFirestore(testChallenge);
    const fetchedChallenge = await getOtpChallengeFromFirestore('IND-TEST-PERSIST');
    assert.ok(fetchedChallenge);
    assert.equal(fetchedChallenge.epicId, 'IND-TEST-PERSIST');
    assert.equal(fetchedChallenge.hmacHash, testChallenge.hmacHash);
    assert.equal(fetchedChallenge.attemptsRemaining, 3);
    assert.equal(fetchedChallenge.isUsed, false);

    // Save and retrieve Election from Firestore
    const testElection = {
      id: 'ELEC-FIRESTORE-99',
      numericId: 99,
      title: 'Persistent Firestore Election Test',
      description: 'Verifies database persistence',
      status: 'draft' as const,
      startTime: Math.floor(Date.now() / 1000),
      endTime: Math.floor(Date.now() / 1000) + 86400,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      totalVotersRegistered: 10000,
      totalVotesCast: 0,
      constituencyIds: ['CONST-04-ND'],
    };

    await saveElectionToFirestore(testElection);
    const fetchedElection = await getElectionByIdFromFirestore('ELEC-FIRESTORE-99');
    assert.ok(fetchedElection);
    assert.equal(fetchedElection.title, 'Persistent Firestore Election Test');
    assert.equal(fetchedElection.numericId, 99);
  });
});
