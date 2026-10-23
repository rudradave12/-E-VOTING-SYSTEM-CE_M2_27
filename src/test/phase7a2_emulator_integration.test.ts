import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initializeApp as initClientApp,
  deleteApp as deleteClientApp,
  getApps as getClientApps,
} from 'firebase/app';
import {
  getFirestore as getClientFirestore,
  doc as clientDoc,
  setDoc as clientSetDoc,
  getDoc as clientGetDoc,
  collection as clientCollection,
  getDocs as clientGetDocs,
  connectFirestoreEmulator,
  Firestore as ClientFirestore,
} from 'firebase/firestore';

import {
  getFirebaseAdminFirestore,
  isFirebaseConfigured,
  resetFirebaseAdminForTesting,
} from '../../server/firebaseAdmin';

import {
  serverDb,
  saveOtpChallengeToFirestore,
  getOtpChallengeFromFirestore,
  saveVoterRecordToFirestore,
  getVoterRecordByEpicFromFirestore,
  getAllVotersFromFirestore,
  saveElectionToFirestore,
  getElectionByIdFromFirestore,
  getAllElectionsFromFirestore,
  saveConstituencyToFirestore,
  getAllConstituenciesFromFirestore,
  saveCandidateToFirestore,
  getAllCandidatesFromFirestore,
  appendAuditEventToFirestore,
  getAllAuditEventsFromFirestore,
  saveHistoricalConstituencyToFirestore,
  getHistoricalConstituencyByIdFromFirestore,
  getAllHistoricalConstituenciesFromFirestore,
  savePoliticalPartyToFirestore,
  getAllPoliticalPartiesFromFirestore,
  importOfficialHistorical2024Data,
  initPreferencePollIfNotExists,
  getPreferencePollFromFirestore,
  getPollAggregateFromFirestore,
  submitPollResponseToFirestore,
  reconcilePollAggregatesInFirestore,
  updatePreferencePollStatus,
  DEFAULT_PREFERENCE_POLL_ID,
} from '../../server/firestore';

import {
  HISTORICAL_CONSTITUENCIES_2024,
  RECOGNIZED_PARTIES,
} from '../data/historical2024';

import net from 'net';

const EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8088';
const EMULATOR_PROJECT_ID = process.env.GCLOUD_PROJECT || 'demo-blockballot';

function checkEmulatorHealth(host: string): Promise<boolean> {
  return new Promise((resolve) => {
    const [ip, portStr] = host.split(':');
    const port = parseInt(portStr || '8088', 10);
    const sock = net.createConnection({ host: ip, port }, () => {
      sock.destroy();
      resolve(true);
    });
    sock.setTimeout(300);
    sock.on('timeout', () => {
      sock.destroy();
      resolve(false);
    });
    sock.on('error', () => {
      resolve(false);
    });
  });
}

async function clearEmulatorData(host: string, projectId: string): Promise<void> {
  try {
    await fetch(`http://${host}/emulator/v1/projects/${projectId}/databases/(default)/documents`, {
      method: 'DELETE',
    });
  } catch (err: any) {
    // Non-fatal if reset endpoint unavailable
  }
}

test('BlockBallot — Phase 7A.2: Live Local Firestore Emulator Integration', async (t) => {
  const isAvailable = await checkEmulatorHealth(EMULATOR_HOST);

  if (!isAvailable) {
    t.skip(
      `Firestore Emulator at http://${EMULATOR_HOST} is not running. Start with: npx firebase-tools emulators:start --only firestore or npm run emulator:start`
    );
    return;
  }

  // Configure environment for real local emulator
  const origHost = process.env.FIRESTORE_EMULATOR_HOST;
  const origProj = process.env.GCLOUD_PROJECT;
  const origDbId = process.env.FIRESTORE_DATABASE_ID;

  process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
  process.env.GCLOUD_PROJECT = EMULATOR_PROJECT_ID;
  process.env.FIREBASE_PROJECT_ID = EMULATOR_PROJECT_ID;
  process.env.FIRESTORE_DATABASE_ID = '(default)';

  await resetFirebaseAdminForTesting();

  // Initialize Client SDK connected to Emulator
  const clientApp = initClientApp(
    { projectId: EMULATOR_PROJECT_ID, apiKey: 'fake-emulator-key' },
    `emulator-client-${Date.now()}`
  );
  const [hostIp, hostPortStr] = EMULATOR_HOST.split(':');
  const clientDb = getClientFirestore(clientApp);
  connectFirestoreEmulator(clientDb, hostIp, parseInt(hostPortStr || '8088', 10));

  t.after(async () => {
    try {
      await clearEmulatorData(EMULATOR_HOST, EMULATOR_PROJECT_ID);
      await deleteClientApp(clientApp);
    } catch {
      // Ignore cleanup error
    }
    await resetFirebaseAdminForTesting();

    if (origHost) process.env.FIRESTORE_EMULATOR_HOST = origHost;
    else delete process.env.FIRESTORE_EMULATOR_HOST;

    if (origProj) process.env.GCLOUD_PROJECT = origProj;
    else delete process.env.GCLOUD_PROJECT;

    if (origDbId) process.env.FIRESTORE_DATABASE_ID = origDbId;
    else delete process.env.FIRESTORE_DATABASE_ID;

    setTimeout(() => process.exit(0), 100);
  });

  // Clean emulator data before tests
  await clearEmulatorData(EMULATOR_HOST, EMULATOR_PROJECT_ID);

  // --------------------------------------------------------------------------
  // 1. Missing Credentials Fail-Closed Behavior
  // --------------------------------------------------------------------------
  await t.test('1. Missing credentials fail closed with clear error when emulator unconfigured', async () => {
    delete process.env.FIRESTORE_EMULATOR_HOST;
    delete process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
    delete process.env.GOOGLE_APPLICATION_CREDENTIALS;

    try {
      assert.equal(isFirebaseConfigured(), false);
      await assert.rejects(
        async () => {
          await saveOtpChallengeToFirestore({
            epicId: 'IND-FAIL-CLOSED',
            hmacHash: 'hash-test',
            attemptsRemaining: 3,
            expiresAt: Date.now() + 60000,
            isUsed: false,
            createdAt: Date.now(),
            lastRequestedAt: Date.now(),
          });
        },
        (err: Error) => {
          assert.ok(err.message.includes('Firebase Admin credentials not configured'));
          return true;
        }
      );
    } finally {
      process.env.FIRESTORE_EMULATOR_HOST = EMULATOR_HOST;
      process.env.FIRESTORE_DATABASE_ID = '(default)';
      await resetFirebaseAdminForTesting();
      assert.equal(isFirebaseConfigured(), true);
    }
  });

  // --------------------------------------------------------------------------
  // 2. OTP Challenges (/otp_challenges/{epicId}) via Admin SDK
  // --------------------------------------------------------------------------
  await t.test('2. OTP Challenge saved and retrieved from live local emulator', async () => {
    const challenge = {
      epicId: 'IND-EMU-TEST-01',
      hmacHash: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      attemptsRemaining: 3,
      expiresAt: Date.now() + 300000,
      isUsed: false,
      createdAt: Date.now(),
      lastRequestedAt: Date.now(),
    };

    await saveOtpChallengeToFirestore(challenge);

    const retrieved = await getOtpChallengeFromFirestore('IND-EMU-TEST-01');
    assert.ok(retrieved);
    assert.equal(retrieved.epicId, 'IND-EMU-TEST-01');
    assert.equal(retrieved.hmacHash, challenge.hmacHash);
    assert.equal(retrieved.attemptsRemaining, 3);
    assert.equal(retrieved.isUsed, false);

    // Non-existent key returns null
    const notFound = await getOtpChallengeFromFirestore('IND-NON-EXISTENT');
    assert.equal(notFound, null);
  });

  // --------------------------------------------------------------------------
  // 3. Elections, Candidates, Constituencies via Admin SDK
  // --------------------------------------------------------------------------
  await t.test('3. Elections, constituencies, and candidates persistence in live emulator', async () => {
    // A. Election
    const election = {
      id: 'ELEC-EMU-2026',
      numericId: 2026,
      title: '2026 Parliamentary Election Emulator Test',
      description: 'Integration test on local emulator',
      status: 'active' as const,
      startTime: Math.floor(Date.now() / 1000) - 3600,
      endTime: Math.floor(Date.now() / 1000) + 86400,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      totalVotersRegistered: 25000,
      totalVotesCast: 0,
      constituencyIds: ['CONST-EMU-01'],
    };

    await saveElectionToFirestore(election);
    const fetchedElection = await getElectionByIdFromFirestore('ELEC-EMU-2026');
    assert.ok(fetchedElection);
    assert.equal(fetchedElection.numericId, 2026);
    assert.equal(fetchedElection.title, election.title);

    const allElections = await getAllElectionsFromFirestore();
    assert.ok(allElections.some((e) => e.id === 'ELEC-EMU-2026'));

    // B. Constituency
    const constituency = {
      id: 'CONST-EMU-01',
      code: '01',
      name: 'Central Delhi Test',
      state: 'NCT of Delhi',
      totalElectors: 100000,
      turnoutCount: 65000,
      candidateIds: ['CAND-EMU-01'],
    };

    await saveConstituencyToFirestore(constituency);
    const allConsts = await getAllConstituenciesFromFirestore();
    assert.ok(allConsts.some((c) => c.id === 'CONST-EMU-01'));

    // C. Candidate
    const candidate = {
      id: 'CAND-EMU-01',
      numericId: 1,
      constituencyId: 'CONST-EMU-01',
      name: 'Devika Nair',
      partyName: 'Democratic Alliance',
      partyAbbreviation: 'DA',
      symbol: 'Wheel',
      symbolDescription: 'Ashoka Chakra Symbol',
      symbolSource: 'ECI Notification No. 56/2024/PPS-III',
      symbolVerificationStatus: 'VERIFIED_ECI' as const,
      symbolColor: '#1E3A8A',
      education: 'Doctorate',
      age: 46,
      criminalCases: 0,
      assets: '₹3 Cr',
      voteCount: 0,
    };

    await saveCandidateToFirestore(candidate);
    const allCandidates = await getAllCandidatesFromFirestore();
    assert.ok(allCandidates.some((c) => c.id === 'CAND-EMU-01'));
  });

  // --------------------------------------------------------------------------
  // 4. Voter State Persistence & Metadata Merging (/voters)
  // --------------------------------------------------------------------------
  await t.test('4. Voter state lifecycle and query by EPIC in live emulator', async () => {
    const voter = {
      id: 'voter-emu-999',
      epicId: 'IND-EMU-VOTER-999',
      name: 'Sunita Mehra',
      gender: 'F' as const,
      age: 34,
      constituencyId: 'CONST-EMU-01',
      pollingStation: 'Station 12, Connaught Place',
      maskedMobile: 'XXXXXX5544',
      isEligible: true,
      status: 'ELIGIBLE' as const,
    };

    await saveVoterRecordToFirestore(voter);

    const fromDb = await getVoterRecordByEpicFromFirestore('IND-EMU-VOTER-999');
    assert.ok(fromDb);
    assert.equal(fromDb.name, 'Sunita Mehra');
    assert.equal(fromDb.status, 'ELIGIBLE');

    // Update status to AUTHORIZED with merge
    await saveVoterRecordToFirestore({
      ...voter,
      status: 'AUTHORIZED',
      authorizedWallet: '0x9999999999999999999999999999999999999999',
      activeNullifier: '0xnullifier-emu-test',
    });

    const updated = await getVoterRecordByEpicFromFirestore('IND-EMU-VOTER-999');
    assert.ok(updated);
    assert.equal(updated.status, 'AUTHORIZED');
    assert.equal(updated.authorizedWallet, '0x9999999999999999999999999999999999999999');
    assert.equal(updated.activeNullifier, '0xnullifier-emu-test');

    const allVoters = await getAllVotersFromFirestore();
    assert.ok(allVoters.some((v) => v.id === 'voter-emu-999'));
  });

  // --------------------------------------------------------------------------
  // 5. Historical Results & Recognized Parties Directory Ingestion
  // --------------------------------------------------------------------------
  await t.test('5. Historical data and parties directory import into live emulator', async () => {
    const importRes = await importOfficialHistorical2024Data();
    assert.equal(importRes.success, true);
    assert.equal(importRes.constituenciesImported, HISTORICAL_CONSTITUENCIES_2024.length);
    assert.equal(importRes.partiesImported, RECOGNIZED_PARTIES.length);

    // Verify first constituency was persisted
    const firstConst = HISTORICAL_CONSTITUENCIES_2024[0];
    const retrieved = await getHistoricalConstituencyByIdFromFirestore(firstConst.id);
    assert.ok(retrieved);
    assert.equal(retrieved.id, firstConst.id);
    assert.equal(retrieved.name, firstConst.name);

    // Verify parties directory
    const parties = await getAllPoliticalPartiesFromFirestore();
    assert.ok(parties.length >= 10);
    assert.ok(parties.some((p) => p.code === 'BJP'));
    assert.ok(parties.some((p) => p.code === 'INC'));
  });

  // --------------------------------------------------------------------------
  // 6. Preference Poll Atomic Transactions & Aggregates
  // --------------------------------------------------------------------------
  await t.test('6. Atomic preference-poll transactions, duplicate prevention, and reconciliation', async () => {
    // Init poll
    await initPreferencePollIfNotExists();
    const poll = await getPreferencePollFromFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.ok(poll);
    assert.equal(poll.status, 'open');

    // Initial aggregate has 0 responses
    const initialAgg = await getPollAggregateFromFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.ok(initialAgg);
    assert.equal(initialAgg.totalResponses, 0);

    // Elector 1 votes for BJP
    const res1 = await submitPollResponseToFirestore(DEFAULT_PREFERENCE_POLL_ID, 'emu-voter-01', 'BJP');
    assert.equal(res1.success, true);
    assert.ok(res1.receipt);
    assert.equal(res1.receipt.partyCode, 'BJP');

    // Duplicate vote by Elector 1 rejected
    const resDup = await submitPollResponseToFirestore(DEFAULT_PREFERENCE_POLL_ID, 'emu-voter-01', 'INC');
    assert.equal(resDup.success, false);
    assert.ok(resDup.message.includes('already submitted'));

    // Elector 2 votes for INC
    const res2 = await submitPollResponseToFirestore(DEFAULT_PREFERENCE_POLL_ID, 'emu-voter-02', 'INC');
    assert.equal(res2.success, true);

    // Check aggregate tallies in live emulator
    const midAgg = await getPollAggregateFromFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.ok(midAgg);
    assert.equal(midAgg.totalResponses, 2);
    assert.equal(midAgg.partyTallies['BJP'], 1);
    assert.equal(midAgg.partyTallies['INC'], 1);

    // Reconcile aggregates from actual response documents
    const reconciled = await reconcilePollAggregatesInFirestore(DEFAULT_PREFERENCE_POLL_ID);
    assert.equal(reconciled.success, true);
    assert.equal(reconciled.totalResponses, 2);
    assert.equal(reconciled.partyTallies['BJP'], 1);
    assert.equal(reconciled.partyTallies['INC'], 1);

    // Close poll and verify submission blocked
    await updatePreferencePollStatus(DEFAULT_PREFERENCE_POLL_ID, 'closed');
    const closedRes = await submitPollResponseToFirestore(DEFAULT_PREFERENCE_POLL_ID, 'emu-voter-03', 'AAP');
    assert.equal(closedRes.success, false);
    assert.ok(closedRes.message.includes('closed'));
  });

  // --------------------------------------------------------------------------
  // 7. Security Rules Enforcement (Client SDK vs Server Admin SDK)
  // --------------------------------------------------------------------------
  await t.test('7. Firestore Security Rules deny unauthenticated Client SDK writes to protected collections', async () => {
    // A. Client write to /otp_challenges denied
    await assert.rejects(
      async () => {
        await clientSetDoc(clientDoc(clientDb, 'otp_challenges', 'IND-CLIENT-ATTACK'), {
          epicId: 'IND-CLIENT-ATTACK',
          hmacHash: 'fake-hash',
          attemptsRemaining: 3,
          expiresAt: Date.now() + 60000,
          isUsed: false,
        });
      },
      (err: any) => {
        const msg = String(err.code || err.message || '');
        assert.ok(msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED'));
        return true;
      }
    );

    // B. Client write to /historical_constituencies_2024 denied
    await assert.rejects(
      async () => {
        await clientSetDoc(clientDoc(clientDb, 'historical_constituencies_2024', 'HIST-FAKE'), {
          id: 'HIST-FAKE',
          name: 'Tampered Result',
        });
      },
      (err: any) => {
        const msg = String(err.code || err.message || '');
        assert.ok(msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED'));
        return true;
      }
    );

    // C. Client write to /political_parties denied
    await assert.rejects(
      async () => {
        await clientSetDoc(clientDoc(clientDb, 'political_parties', 'FAKE'), {
          code: 'FAKE',
          name: 'Fake Party',
        });
      },
      (err: any) => {
        const msg = String(err.code || err.message || '');
        assert.ok(msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED'));
        return true;
      }
    );

    // D. Client direct write to poll responses subcollection denied
    await assert.rejects(
      async () => {
        await clientSetDoc(
          clientDoc(clientDb, 'preference_polls', DEFAULT_PREFERENCE_POLL_ID, 'responses', 'direct-hacker'),
          {
            pollId: DEFAULT_PREFERENCE_POLL_ID,
            userId: 'direct-hacker',
            partyCode: 'BJP',
          }
        );
      },
      (err: any) => {
        const msg = String(err.code || err.message || '');
        assert.ok(msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED'));
        return true;
      }
    );

    // E. Client direct write to poll aggregates denied
    await assert.rejects(
      async () => {
        await clientSetDoc(
          clientDoc(clientDb, 'preference_polls', DEFAULT_PREFERENCE_POLL_ID, 'aggregates', 'current'),
          {
            totalResponses: 999999,
          }
        );
      },
      (err: any) => {
        const msg = String(err.code || err.message || '');
        assert.ok(msg.includes('permission-denied') || msg.includes('PERMISSION_DENIED'));
        return true;
      }
    );

    // F. Public Client read of historical records allowed
    const firstConst = HISTORICAL_CONSTITUENCIES_2024[0];
    const clientSnap = await clientGetDoc(
      clientDoc(clientDb, 'historical_constituencies_2024', firstConst.id)
    );
    assert.ok(clientSnap.exists());
    assert.equal(clientSnap.data()?.name, firstConst.name);
  });
});
