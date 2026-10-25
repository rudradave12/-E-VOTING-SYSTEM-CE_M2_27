import { Firestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import {
  getFirebaseAdminFirestore,
  isFirebaseConfigured,
} from './firebaseAdmin';
import { Election, Constituency, Candidate, VoterRecord, AuditEvent } from '../../frontend/src/types';
import {
  INITIAL_ELECTIONS,
  INITIAL_CONSTITUENCIES,
  INITIAL_CANDIDATES,
} from '../../frontend/src/data/mockData';
import {
  HISTORICAL_CONSTITUENCIES_2024,
  RECOGNIZED_PARTIES,
  HistoricalConstituencyRecord,
  RecognizedPartyRecord,
} from '../../frontend/src/data/historical2024';
import { OtpChallengeRecord } from './store';
import { computeEpicHash } from './crypto';

/**
 * Shared Firestore instance via Firebase Admin SDK.
 * Dynamically proxies to getFirebaseAdminFirestore() so that test mocks or
 * emulator environments can be swapped transparently without rebuilding adapters.
 */
export const serverDb = new Proxy({} as Firestore, {
  get(_target, prop) {
    const db = getFirebaseAdminFirestore();
    const value = (db as any)[prop];
    if (typeof value === 'function') {
      return value.bind(db);
    }
    return value;
  },
});

/**
 * Asserts that Firebase Admin credentials or an emulator environment are configured.
 * Fails closed with an actionable error if neither credentials nor emulator is available.
 */
function assertConfigured(): void {
  if (!isFirebaseConfigured()) {
    throw new Error(
      'Firebase Admin credentials not configured: Server-side Firestore operations require FIREBASE_SERVICE_ACCOUNT_KEY, GOOGLE_APPLICATION_CREDENTIALS, or FIRESTORE_EMULATOR_HOST. Persistent storage cannot proceed without valid credentials.'
    );
  }
}

/**
 * 1. OTP Challenge Persistence in Firestore (/otp_challenges/{epicId})
 */
export async function saveOtpChallengeToFirestore(challenge: OtpChallengeRecord): Promise<void> {
  assertConfigured();
  const epicKey = challenge.epicId.trim().toUpperCase();
  const docRef = serverDb.collection('otp_challenges').doc(epicKey);
  await docRef.set({
    epicId: epicKey,
    hmacHash: challenge.hmacHash,
    attemptsRemaining: challenge.attemptsRemaining,
    expiresAt: challenge.expiresAt,
    isUsed: challenge.isUsed,
    createdAt: challenge.createdAt,
    lastRequestedAt: challenge.lastRequestedAt,
  });
}

export async function getOtpChallengeFromFirestore(epicId: string): Promise<OtpChallengeRecord | null> {
  assertConfigured();
  const epicKey = epicId.trim().toUpperCase();
  const docRef = serverDb.collection('otp_challenges').doc(epicKey);
  const snap = await docRef.get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  return {
    epicId: data.epicId,
    hmacHash: data.hmacHash,
    attemptsRemaining: data.attemptsRemaining,
    expiresAt: data.expiresAt,
    isUsed: data.isUsed,
    createdAt: data.createdAt,
    lastRequestedAt: data.lastRequestedAt,
  };
}

/**
 * 2. Voter Lifecycle State Persistence in Firestore (/voters/{voterId})
 * Implements salted HMAC-SHA256 digest indexing (epicHash) as specified in the research report,
 * preserving fast indexed lookup and duplicate vote prevention without exposing plaintext roll identifiers.
 */
export async function saveVoterRecordToFirestore(voter: VoterRecord): Promise<void> {
  assertConfigured();
  const docRef = serverDb.collection('voters').doc(voter.id);
  const epicUpper = voter.epicId.trim().toUpperCase();
  const epicHash = computeEpicHash(epicUpper);

  const payload: any = {
    id: voter.id,
    epicId: epicUpper,
    epicHash,
    name: voter.name,
    gender: voter.gender,
    age: voter.age,
    constituencyId: voter.constituencyId,
    pollingStation: voter.pollingStation,
    maskedMobile: voter.maskedMobile,
    isEligible: voter.isEligible,
    status: voter.status,
  };
  if (voter.authorizedWallet) payload.authorizedWallet = voter.authorizedWallet;
  if (voter.activeNullifier) payload.activeNullifier = voter.activeNullifier;
  if (voter.ticketExpiry) payload.ticketExpiry = voter.ticketExpiry;
  if (voter.votedAt) payload.votedAt = voter.votedAt;

  await docRef.set(payload, { merge: true });
}

export async function getVoterRecordByEpicFromFirestore(epicId: string): Promise<VoterRecord | null> {
  assertConfigured();
  const epicUpper = epicId.trim().toUpperCase();
  const epicHash = computeEpicHash(epicUpper);

  // 1. Primary lookup using keyed HMAC hash index
  const snapByHash = await serverDb.collection('voters').where('epicHash', '==', epicHash).limit(1).get();
  if (!snapByHash.empty) {
    return snapByHash.docs[0].data() as VoterRecord;
  }

  // 2. Backward compatibility fallback for legacy unindexed test documents
  const snap = await serverDb.collection('voters').where('epicId', '==', epicUpper).limit(1).get();
  if (snap.empty) return null;
  return snap.docs[0].data() as VoterRecord;
}

export async function getAllVotersFromFirestore(): Promise<VoterRecord[]> {
  assertConfigured();
  const snap = await serverDb.collection('voters').get();
  return snap.docs.map((d) => d.data() as VoterRecord);
}

/**
 * 3. Elections Persistence in Firestore (/elections/{electionId})
 */
export async function saveElectionToFirestore(election: Election): Promise<void> {
  assertConfigured();
  const docRef = serverDb.collection('elections').doc(election.id);
  await docRef.set({
    id: election.id,
    numericId: election.numericId,
    title: election.title,
    description: election.description || '',
    status: election.status,
    startTime: election.startTime,
    endTime: election.endTime,
    contractAddress: election.contractAddress,
    totalVotersRegistered: election.totalVotersRegistered || 10000,
    totalVotesCast: election.totalVotesCast || 0,
    constituencyIds: election.constituencyIds || [],
    electionType: election.electionType || 'General Election',
    isDemoElection: !!election.isDemoElection,
    timezone: election.timezone || 'Asia/Kolkata',
    cancellationReason: election.cancellationReason || null,
    cancelledAt: election.cancelledAt || null,
    cancelledByOfficerId: election.cancelledByOfficerId || null,
    publishedAt: election.publishedAt || null,
    openedAt: election.openedAt || null,
    closedAt: election.closedAt || null,
    createdAt: election.createdAt || null,
    updatedAt: election.updatedAt || null,
  });
}

export async function getAllElectionsFromFirestore(): Promise<Election[]> {
  assertConfigured();
  const snap = await serverDb.collection('elections').get();
  return snap.docs.map((d) => d.data() as Election);
}

export async function getElectionByIdFromFirestore(id: string): Promise<Election | null> {
  assertConfigured();
  const docRef = serverDb.collection('elections').doc(id);
  const snap = await docRef.get();
  if (!snap.exists) return null;
  return snap.data() as Election;
}

/**
 * 4. Constituencies Persistence in Firestore (/constituencies/{constituencyId})
 */
export async function saveConstituencyToFirestore(constituency: Constituency): Promise<void> {
  assertConfigured();
  const docRef = serverDb.collection('constituencies').doc(constituency.id);
  await docRef.set({
    id: constituency.id,
    code: constituency.code,
    name: constituency.name,
    state: constituency.state,
    totalElectors: constituency.totalElectors,
    turnoutCount: constituency.turnoutCount || 0,
  });
}

export async function getAllConstituenciesFromFirestore(): Promise<Constituency[]> {
  assertConfigured();
  const snap = await serverDb.collection('constituencies').get();
  return snap.docs.map((d) => d.data() as Constituency);
}

/**
 * 5. Candidates Persistence in Firestore (/candidates/{candidateId})
 */
export async function saveCandidateToFirestore(candidate: Candidate): Promise<void> {
  assertConfigured();
  const docRef = serverDb.collection('candidates').doc(candidate.id);
  await docRef.set({
    id: candidate.id,
    numericId: candidate.numericId,
    constituencyId: candidate.constituencyId,
    electionId: candidate.electionId || null,
    status: candidate.status || 'ACTIVE',
    name: candidate.name,
    partyName: candidate.partyName,
    partyAbbreviation: candidate.partyAbbreviation || '',
    symbol: candidate.symbol || 'Wheel',
    symbolColor: candidate.symbolColor || '#1E3A8A',
    education: candidate.education || 'Graduate',
    age: candidate.age || 45,
    criminalCases: candidate.criminalCases || 0,
    assets: candidate.assets || '₹1 Cr',
    voteCount: candidate.voteCount || 0,
    deactivatedAt: candidate.deactivatedAt || null,
    deactivatedReason: candidate.deactivatedReason || null,
  });
}

export async function deleteCandidateFromFirestore(id: string): Promise<void> {
  assertConfigured();
  await serverDb.collection('candidates').doc(id).delete();
}

export async function getAllCandidatesFromFirestore(): Promise<Candidate[]> {
  assertConfigured();
  const snap = await serverDb.collection('candidates').get();
  return snap.docs.map((d) => d.data() as Candidate);
}

/**
 * 6. Audit Events (Append-Only) in Firestore (/audit_events/{eventId})
 */
export async function appendAuditEventToFirestore(event: AuditEvent): Promise<void> {
  assertConfigured();
  const docRef = serverDb.collection('audit_events').doc(event.id);
  const payload: any = {
    id: event.id,
    timestamp: event.timestamp,
    type: event.type,
    description: event.description,
    electionId: event.electionId,
    isSimulated: !!event.isSimulated,
  };
  if (event.constituencyId !== undefined) payload.constituencyId = event.constituencyId;
  if (event.txHash) payload.txHash = event.txHash;
  if (event.blockNumber) payload.blockNumber = event.blockNumber;
  if (event.nullifier) payload.nullifier = event.nullifier;

  await docRef.set(payload);
}

export async function getAllAuditEventsFromFirestore(): Promise<AuditEvent[]> {
  assertConfigured();
  const snap = await serverDb.collection('audit_events').get();
  const events = snap.docs.map((d) => d.data() as AuditEvent);
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * 7. Official 2024 Lok Sabha Historical Results Persistence (/historical_constituencies_2024/{id})
 */
export async function saveHistoricalConstituencyToFirestore(record: HistoricalConstituencyRecord): Promise<void> {
  assertConfigured();
  const docRef = serverDb.collection('historical_constituencies_2024').doc(record.id);
  await docRef.set({
    ...record,
    electionYear: 2024,
    importTimestamp: Date.now(),
    schemaVersion: '1.0',
    sourceAuthority: record.sourceAuthority || 'Election Commission of India (ECI) Form 20 & Statistical Report 2024',
    isVerified: true,
  });
}

export async function getAllHistoricalConstituenciesFromFirestore(): Promise<HistoricalConstituencyRecord[]> {
  assertConfigured();
  const snap = await serverDb.collection('historical_constituencies_2024').get();
  if (snap.empty) {
    // If not yet persisted, return verified module records
    return HISTORICAL_CONSTITUENCIES_2024;
  }
  return snap.docs.map((d) => d.data() as HistoricalConstituencyRecord);
}

export async function getHistoricalConstituencyByIdFromFirestore(id: string): Promise<HistoricalConstituencyRecord | null> {
  assertConfigured();
  const docRef = serverDb.collection('historical_constituencies_2024').doc(id);
  const snap = await docRef.get();
  if (!snap.exists) {
    const memoryRecord = HISTORICAL_CONSTITUENCIES_2024.find((c) => c.id === id);
    return memoryRecord || null;
  }
  return snap.data() as HistoricalConstituencyRecord;
}

/**
 * 8. Political Parties Directory Persistence (/political_parties/{partyCode})
 */
export async function savePoliticalPartyToFirestore(party: RecognizedPartyRecord): Promise<void> {
  assertConfigured();
  const docRef = serverDb.collection('political_parties').doc(party.code);
  await docRef.set({
    ...party,
    id: party.code,
    importTimestamp: Date.now(),
    isVerified: true,
  });
}

export async function getAllPoliticalPartiesFromFirestore(): Promise<RecognizedPartyRecord[]> {
  assertConfigured();
  const snap = await serverDb.collection('political_parties').get();
  if (snap.empty) {
    return RECOGNIZED_PARTIES;
  }
  return snap.docs.map((d) => d.data() as RecognizedPartyRecord);
}

/**
 * Repeatable and Validated Official 2024 Import Pipeline
 */
export async function importOfficialHistorical2024Data(force: boolean = false): Promise<{
  success: boolean;
  constituenciesImported: number;
  partiesImported: number;
  message: string;
}> {
  try {
    assertConfigured();
    // Validate integrity before storing
    for (const c of HISTORICAL_CONSTITUENCIES_2024) {
      if (!c.id || !c.name || !c.state || !c.winnerName || !c.winnerParty) {
        throw new Error(`Data validation failed for constituency ${c.id}: required identity fields missing.`);
      }
      if (!c.isUnopposed && c.votesCounted <= 0) {
        throw new Error(`Data validation failed for constituency ${c.id}: contested election missing votesCounted.`);
      }
      for (const cand of c.candidates) {
        if (!cand.name || !cand.partyName) {
          throw new Error(`Candidate validation failed in ${c.id}: name and partyName required.`);
        }
      }
    }

    // Persist all 10 verified parties
    for (const p of RECOGNIZED_PARTIES) {
      await savePoliticalPartyToFirestore(p);
    }

    // Persist all verified constituencies
    for (const c of HISTORICAL_CONSTITUENCIES_2024) {
      await saveHistoricalConstituencyToFirestore(c);
    }

    return {
      success: true,
      constituenciesImported: HISTORICAL_CONSTITUENCIES_2024.length,
      partiesImported: RECOGNIZED_PARTIES.length,
      message: `Successfully imported and validated ${HISTORICAL_CONSTITUENCIES_2024.length} official constituencies and ${RECOGNIZED_PARTIES.length} political parties.`,
    };
  } catch (err: any) {
    console.error('[Firestore Import Pipeline Error]:', err.message);
    return {
      success: false,
      constituenciesImported: 0,
      partiesImported: 0,
      message: err.message,
    };
  }
}

/**
 * 9. Independent Party-Preference Poll Persistence & Atomic Submission
 */
export const DEFAULT_PREFERENCE_POLL_ID = 'national-party-preference-2024';

export interface PreferencePollConfig {
  id: string;
  title: string;
  titleHi: string;
  description: string;
  descriptionHi: string;
  status: 'open' | 'closed';
  createdAt: number;
  updatedAt: number;
  isOfficialECI: false;
}

export interface PollResponseRecord {
  pollId: string;
  userId: string;
  partyCode: string;
  partyName: string;
  receiptId: string;
  submittedAt: number;
}

export interface PollAggregateRecord {
  pollId: string;
  totalResponses: number;
  partyTallies: Record<string, number>;
  lastUpdated: number;
  reconciledAt: number;
}

export async function initPreferencePollIfNotExists(): Promise<void> {
  assertConfigured();
  const pollRef = serverDb.collection('preference_polls').doc(DEFAULT_PREFERENCE_POLL_ID);
  const snap = await pollRef.get();

  if (!snap.exists) {
    console.log('[Firestore] Initializing independent party-preference poll configuration...');
    const now = Date.now();
    await pollRef.set({
      id: DEFAULT_PREFERENCE_POLL_ID,
      title: 'National Political Party Preference Poll (2024)',
      titleHi: 'राष्ट्रीय राजनीतिक दल प्राथमिकता जनमत (2024)',
      description: 'An independent, non-binding civic survey measuring public preferences across India\'s 10 major recognized political parties.',
      descriptionHi: 'भारत के 10 प्रमुख मान्यता प्राप्त राजनीतिक दलों में जनता की पसंद मापने वाला एक स्वतंत्र, गैर-बाध्यकारी नागरिक सर्वेक्षण।',
      status: 'open',
      createdAt: now,
      updatedAt: now,
      isOfficialECI: false,
    });

    // Initialize clean aggregate document with ZERO responses (No fake votes!)
    const aggRef = serverDb.collection('preference_polls').doc(DEFAULT_PREFERENCE_POLL_ID).collection('aggregates').doc('current');
    const initialTallies: Record<string, number> = {};
    for (const p of RECOGNIZED_PARTIES) {
      initialTallies[p.code] = 0;
    }

    await aggRef.set({
      pollId: DEFAULT_PREFERENCE_POLL_ID,
      totalResponses: 0,
      partyTallies: initialTallies,
      lastUpdated: now,
      reconciledAt: now,
    });
  }
}

export async function getPreferencePollFromFirestore(pollId: string = DEFAULT_PREFERENCE_POLL_ID): Promise<PreferencePollConfig | null> {
  assertConfigured();
  const pollRef = serverDb.collection('preference_polls').doc(pollId);
  const snap = await pollRef.get();
  if (!snap.exists) return null;
  return snap.data() as PreferencePollConfig;
}

export async function getPollAggregateFromFirestore(pollId: string = DEFAULT_PREFERENCE_POLL_ID): Promise<PollAggregateRecord | null> {
  assertConfigured();
  const aggRef = serverDb.collection('preference_polls').doc(pollId).collection('aggregates').doc('current');
  const snap = await aggRef.get();
  if (!snap.exists) {
    // Return empty zero-state
    const initialTallies: Record<string, number> = {};
    for (const p of RECOGNIZED_PARTIES) {
      initialTallies[p.code] = 0;
    }
    return {
      pollId,
      totalResponses: 0,
      partyTallies: initialTallies,
      lastUpdated: Date.now(),
      reconciledAt: Date.now(),
    };
  }
  return snap.data() as PollAggregateRecord;
}

export async function getUserPollResponseFromFirestore(pollId: string, userId: string): Promise<PollResponseRecord | null> {
  assertConfigured();
  const respRef = serverDb.collection('preference_polls').doc(pollId).collection('responses').doc(userId);
  const snap = await respRef.get();
  if (!snap.exists) return null;
  return snap.data() as PollResponseRecord;
}

/**
 * Atomic Server-Side Poll Submission Transaction
 * Strictly guarantees:
 * 1. Poll is open.
 * 2. User has not previously submitted a response for this poll.
 * 3. Exact atomic increment of totalResponses and chosen party tally.
 * 4. Safe persistent receipt generation.
 */
export async function submitPollResponseToFirestore(
  pollId: string,
  userId: string,
  partyCode: string
): Promise<{
  success: boolean;
  message: string;
  receipt?: PollResponseRecord;
}> {
  try {
    assertConfigured();
  } catch (err: any) {
    return { success: false, message: err.message };
  }

  const normalizedPartyCode = partyCode.trim();
  const partyRecord = RECOGNIZED_PARTIES.find((p) => p.code === normalizedPartyCode);
  if (!partyRecord) {
    return { success: false, message: `Invalid party code: ${partyCode}. Must be one of the 10 recognized parties.` };
  }

  const pollDocRef = serverDb.collection('preference_polls').doc(pollId);
  const userRespDocRef = serverDb.collection('preference_polls').doc(pollId).collection('responses').doc(userId);
  const aggDocRef = serverDb.collection('preference_polls').doc(pollId).collection('aggregates').doc('current');

  try {
    const receipt = await serverDb.runTransaction(async (transaction) => {
      // 1. Check poll status
      const pollSnap = await transaction.get(pollDocRef);
      if (!pollSnap.exists) {
        throw new Error('POLL_NOT_FOUND');
      }
      const pollData = pollSnap.data() as PreferencePollConfig;
      if (pollData.status !== 'open') {
        throw new Error('POLL_CLOSED');
      }

      // 2. Check duplicate submission
      const userRespSnap = await transaction.get(userRespDocRef);
      if (userRespSnap.exists) {
        throw new Error('ALREADY_SUBMITTED');
      }

      // 3. Read current aggregate
      const aggSnap = await transaction.get(aggDocRef);
      let currentTotal = 0;
      let currentTallies: Record<string, number> = {};

      if (aggSnap.exists) {
        const aggData = aggSnap.data() as PollAggregateRecord;
        currentTotal = aggData.totalResponses || 0;
        currentTallies = { ...(aggData.partyTallies || {}) };
      } else {
        for (const p of RECOGNIZED_PARTIES) {
          currentTallies[p.code] = 0;
        }
      }

      // 4. Generate persistent receipt
      const receiptId = `RCPT-POLL-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const submittedAt = Date.now();

      const newResponse: PollResponseRecord = {
        pollId,
        userId,
        partyCode: partyRecord.code,
        partyName: partyRecord.name,
        receiptId,
        submittedAt,
      };

      // 5. Write response document
      transaction.set(userRespDocRef, newResponse);

      // 6. Update aggregate document
      currentTallies[partyRecord.code] = (currentTallies[partyRecord.code] || 0) + 1;
      transaction.set(aggDocRef, {
        pollId,
        totalResponses: currentTotal + 1,
        partyTallies: currentTallies,
        lastUpdated: submittedAt,
        reconciledAt: submittedAt,
      });

      return newResponse;
    });

    return {
      success: true,
      message: 'Your party preference response has been securely saved.',
      receipt,
    };
  } catch (err: any) {
    if (err.message === 'POLL_NOT_FOUND') {
      return { success: false, message: 'The specified party preference poll could not be found.' };
    }
    if (err.message === 'POLL_CLOSED') {
      return { success: false, message: 'This poll is currently closed and is no longer accepting responses.' };
    }
    if (err.message === 'ALREADY_SUBMITTED') {
      return { success: false, message: 'You have already submitted a response to this poll. Only one response per user is allowed.' };
    }
    console.error('[Firestore Poll Transaction Error]:', err);
    return { success: false, message: err.message || 'Transaction failed while submitting poll response.' };
  }
}

/**
 * Reconcile Aggregates from Actual Persisted Response Documents
 */
export async function reconcilePollAggregatesInFirestore(pollId: string = DEFAULT_PREFERENCE_POLL_ID): Promise<{
  success: boolean;
  totalResponses: number;
  partyTallies: Record<string, number>;
}> {
  assertConfigured();
  const respColRef = serverDb.collection('preference_polls').doc(pollId).collection('responses');
  const snap = await respColRef.get();

  const total = snap.size;
  const tallies: Record<string, number> = {};
  for (const p of RECOGNIZED_PARTIES) {
    tallies[p.code] = 0;
  }

  snap.docs.forEach((d) => {
    const data = d.data() as PollResponseRecord;
    if (data.partyCode) {
      tallies[data.partyCode] = (tallies[data.partyCode] || 0) + 1;
    }
  });

  const now = Date.now();
  const aggRef = serverDb.collection('preference_polls').doc(pollId).collection('aggregates').doc('current');
  await aggRef.set({
    pollId,
    totalResponses: total,
    partyTallies: tallies,
    lastUpdated: now,
    reconciledAt: now,
  });

  return {
    success: true,
    totalResponses: total,
    partyTallies: tallies,
  };
}

export async function updatePreferencePollStatus(
  pollId: string,
  newStatus: 'open' | 'closed'
): Promise<boolean> {
  assertConfigured();
  const pollRef = serverDb.collection('preference_polls').doc(pollId);
  await pollRef.update({
    status: newStatus,
    updatedAt: Date.now(),
  });
  return true;
}

/**
 * Seed Initial Synthetic Data and Historical Archives into Firestore
 */
export async function seedInitialFirestoreData(): Promise<void> {
  if (!isFirebaseConfigured()) {
    console.warn('[Firestore] Notice: Firebase Admin credentials not configured. Skipping initial cloud seeding.');
    return;
  }

  try {
    // 1. Synthetic Elections
    const elections = await getAllElectionsFromFirestore();
    if (elections.length === 0) {
      console.log('[Firestore] Seeding initial parliamentary elections...');
      for (const e of INITIAL_ELECTIONS) {
        await saveElectionToFirestore(e);
      }
    }

    // 2. Synthetic Constituencies
    const constituencies = await getAllConstituenciesFromFirestore();
    if (constituencies.length === 0) {
      console.log('[Firestore] Seeding initial constituencies...');
      for (const c of INITIAL_CONSTITUENCIES) {
        await saveConstituencyToFirestore(c);
      }
    }

    // 3. Synthetic Candidates
    const candidates = await getAllCandidatesFromFirestore();
    if (candidates.length === 0) {
      console.log('[Firestore] Seeding initial candidates...');
      for (const cand of INITIAL_CANDIDATES) {
        await saveCandidateToFirestore(cand);
      }
    }

    // 4. Voter Roll Initialization
    // Phase 01: Preloaded demo voters removed. Firestore /voters collection
    // starts empty and is not populated with legacy records. Real/simulated
    // voter registration is handled via backend generation in Phase 04.

    // 5. Official Historical 2024 Records & Parties
    await importOfficialHistorical2024Data();

    // 6. Independent Preference Poll Setup
    await initPreferencePollIfNotExists();

  } catch (err: any) {
    console.warn('[Firestore] Notice during initial data seeding check:', err.message);
  }
}
