import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { SERVER_CONFIG } from './config';
import { Election, Constituency, Candidate, VoterRecord, AuditEvent } from '../src/types';
import {
  INITIAL_ELECTIONS,
  INITIAL_CONSTITUENCIES,
  INITIAL_CANDIDATES,
  SYNTHETIC_VOTERS,
} from '../src/data/mockData';
import { OtpChallengeRecord } from './store';

// Initialize Firebase App for server-side persistence
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Explicitly connect to dedicated Firestore database ID
export const serverDb: Firestore = getFirestore(app, SERVER_CONFIG.FIRESTORE_DATABASE_ID);

/**
 * 1. OTP Challenge Persistence in Firestore (/otp_challenges/{epicId})
 */
export async function saveOtpChallengeToFirestore(challenge: OtpChallengeRecord): Promise<void> {
  const epicKey = challenge.epicId.trim().toUpperCase();
  const docRef = doc(serverDb, 'otp_challenges', epicKey);
  await setDoc(docRef, {
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
  const epicKey = epicId.trim().toUpperCase();
  const docRef = doc(serverDb, 'otp_challenges', epicKey);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  const data = snap.data();
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
 */
export async function saveVoterRecordToFirestore(voter: VoterRecord): Promise<void> {
  const docRef = doc(serverDb, 'voters', voter.id);
  const payload: any = {
    id: voter.id,
    epicId: voter.epicId.trim().toUpperCase(),
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

  await setDoc(docRef, payload, { merge: true });
}

export async function getVoterRecordByEpicFromFirestore(epicId: string): Promise<VoterRecord | null> {
  const epicKey = epicId.trim().toUpperCase();
  const colRef = collection(serverDb, 'voters');
  const q = query(colRef, where('epicId', '==', epicKey), limit(1));
  const snap = await getDocs(q);
  if (snap.empty) return null;
  return snap.docs[0].data() as VoterRecord;
}

export async function getAllVotersFromFirestore(): Promise<VoterRecord[]> {
  const colRef = collection(serverDb, 'voters');
  const snap = await getDocs(colRef);
  return snap.docs.map((d) => d.data() as VoterRecord);
}

/**
 * 3. Elections Persistence in Firestore (/elections/{electionId})
 */
export async function saveElectionToFirestore(election: Election): Promise<void> {
  const docRef = doc(serverDb, 'elections', election.id);
  await setDoc(docRef, {
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
  });
}

export async function getAllElectionsFromFirestore(): Promise<Election[]> {
  const colRef = collection(serverDb, 'elections');
  const snap = await getDocs(colRef);
  return snap.docs.map((d) => d.data() as Election);
}

export async function getElectionByIdFromFirestore(id: string): Promise<Election | null> {
  const docRef = doc(serverDb, 'elections', id);
  const snap = await getDoc(docRef);
  if (!snap.exists()) return null;
  return snap.data() as Election;
}

/**
 * 4. Constituencies Persistence in Firestore (/constituencies/{constituencyId})
 */
export async function saveConstituencyToFirestore(constituency: Constituency): Promise<void> {
  const docRef = doc(serverDb, 'constituencies', constituency.id);
  await setDoc(docRef, {
    id: constituency.id,
    code: constituency.code,
    name: constituency.name,
    state: constituency.state,
    totalElectors: constituency.totalElectors,
    turnoutCount: constituency.turnoutCount || 0,
  });
}

export async function getAllConstituenciesFromFirestore(): Promise<Constituency[]> {
  const colRef = collection(serverDb, 'constituencies');
  const snap = await getDocs(colRef);
  return snap.docs.map((d) => d.data() as Constituency);
}

/**
 * 5. Candidates Persistence in Firestore (/candidates/{candidateId})
 */
export async function saveCandidateToFirestore(candidate: Candidate): Promise<void> {
  const docRef = doc(serverDb, 'candidates', candidate.id);
  await setDoc(docRef, {
    id: candidate.id,
    numericId: candidate.numericId,
    constituencyId: candidate.constituencyId,
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
  });
}

export async function getAllCandidatesFromFirestore(): Promise<Candidate[]> {
  const colRef = collection(serverDb, 'candidates');
  const snap = await getDocs(colRef);
  return snap.docs.map((d) => d.data() as Candidate);
}

/**
 * 6. Audit Events (Append-Only) in Firestore (/audit_events/{eventId})
 */
export async function appendAuditEventToFirestore(event: AuditEvent): Promise<void> {
  const docRef = doc(serverDb, 'audit_events', event.id);
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

  await setDoc(docRef, payload);
}

export async function getAllAuditEventsFromFirestore(): Promise<AuditEvent[]> {
  const colRef = collection(serverDb, 'audit_events');
  const snap = await getDocs(colRef);
  const events = snap.docs.map((d) => d.data() as AuditEvent);
  return events.sort((a, b) => b.timestamp - a.timestamp);
}

/**
 * Seed Initial Synthetic Data into Firestore if collections are uninitialized
 */
export async function seedInitialFirestoreData(): Promise<void> {
  try {
    // Check elections
    const elections = await getAllElectionsFromFirestore();
    if (elections.length === 0) {
      console.log('[Firestore] Seeding initial parliamentary elections...');
      for (const e of INITIAL_ELECTIONS) {
        await saveElectionToFirestore(e);
      }
    }

    // Check constituencies
    const constituencies = await getAllConstituenciesFromFirestore();
    if (constituencies.length === 0) {
      console.log('[Firestore] Seeding initial constituencies...');
      for (const c of INITIAL_CONSTITUENCIES) {
        await saveConstituencyToFirestore(c);
      }
    }

    // Check candidates
    const candidates = await getAllCandidatesFromFirestore();
    if (candidates.length === 0) {
      console.log('[Firestore] Seeding initial candidates...');
      for (const cand of INITIAL_CANDIDATES) {
        await saveCandidateToFirestore(cand);
      }
    }

    // Check synthetic voters
    const voters = await getAllVotersFromFirestore();
    if (voters.length === 0) {
      console.log('[Firestore] Seeding synthetic electoral rolls...');
      for (const v of SYNTHETIC_VOTERS) {
        await saveVoterRecordToFirestore(v);
      }
    }
  } catch (err: any) {
    console.warn('[Firestore] Notice during initial data seeding check:', err.message);
  }
}
