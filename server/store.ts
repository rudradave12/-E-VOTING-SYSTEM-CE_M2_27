import crypto from 'crypto';
import { SERVER_CONFIG } from './config';
import {
  Election,
  Constituency,
  Candidate,
  VoterRecord,
  VoterLifecycleStatus,
  AuditEvent,
  ElectionStatus,
} from '../src/types';
import {
  INITIAL_ELECTIONS,
  INITIAL_CONSTITUENCIES,
  INITIAL_CANDIDATES,
} from '../src/data/mockData';
import {
  saveOtpChallengeToFirestore,
  getOtpChallengeFromFirestore,
  saveVoterRecordToFirestore,
  getVoterRecordByEpicFromFirestore,
  getAllVotersFromFirestore,
  saveElectionToFirestore,
  getAllElectionsFromFirestore,
  getElectionByIdFromFirestore,
  saveCandidateToFirestore,
  getAllCandidatesFromFirestore,
  saveConstituencyToFirestore,
  getAllConstituenciesFromFirestore,
  appendAuditEventToFirestore,
  getAllAuditEventsFromFirestore,
} from './firestore';
import { isFirebaseConfigured } from './firebaseAdmin';
import { createVoterJwt, verifyVoterJwt } from './crypto';

export interface OtpChallengeRecord {
  epicId: string;
  hmacHash: string; // HMAC-SHA256(otp, server_secret)
  attemptsRemaining: number;
  expiresAt: number;
  isUsed: boolean;
  createdAt: number;
  lastRequestedAt: number;
}

export interface VoterSession {
  token: string;
  epicId: string;
  voterId: string;
  name: string;
  constituencyId: string;
  constituencyCode: number;
  createdAt: number;
  expiresAt: number;
  jti?: string;
  isJwt?: boolean;
}

class ServerStore {
  // Synchronized stores
  private voters: Map<string, VoterRecord> = new Map();
  private otpChallenges: Map<string, OtpChallengeRecord> = new Map();
  private sessions: Map<string, VoterSession> = new Map();
  private revokedJtis: Set<string> = new Set();
  private elections: Map<string, Election> = new Map();
  private constituencies: Map<string, Constituency> = new Map();
  private candidates: Map<string, Candidate> = new Map();
  private auditEvents: AuditEvent[] = [];

  // On-chain spent nullifiers registry (for idempotency and reconciliation)
  private spentNullifiersOnChain: Set<string> = new Set();

  // Test Delivery Adapter: holds dispatched synthetic test notifications
  private testDeliveryQueue: Map<string, { code: string; timestamp: number }> = new Map();

  constructor() {
    this.resetDefaults();
  }

  public resetDefaults(): void {
    this.resetVoters();
  }

  public resetVoters(): void {
    // Phase 01: Preloaded demo voter identities removed from runtime operation.
    // In-memory voter roll starts empty. Voter enrollment is handled via backend
    // voter registry in Phase 04.
    this.voters.clear();

    this.elections.clear();
    for (const e of INITIAL_ELECTIONS) {
      this.elections.set(e.id, { ...e });
    }

    this.constituencies.clear();
    for (const c of INITIAL_CONSTITUENCIES) {
      this.constituencies.set(c.id, { ...c });
    }

    this.candidates.clear();
    for (const cand of INITIAL_CANDIDATES) {
      this.candidates.set(cand.id, { ...cand });
    }

    this.auditEvents = [];
    this.spentNullifiersOnChain.clear();
  }

  /**
   * Explicit test fixture seeding helper.
   * Only to be invoked by isolated automated tests or test runners.
   * Normal application startup and resetVoters() never populate preloaded voters.
   */
  public seedVotersForTesting(fixtures: VoterRecord[] = []): void {
    for (const v of fixtures) {
      this.voters.set(v.epicId.toUpperCase(), { ...v });
    }
  }

  public async syncFromFirestore(): Promise<void> {
    if (!isFirebaseConfigured()) return;

    try {
      // 1. Synchronize Elections
      const elections = await getAllElectionsFromFirestore();
      if (elections && elections.length > 0) {
        for (const e of elections) {
          this.elections.set(e.id, { ...e });
        }
      }

      // 2. Synchronize Constituencies
      const constituencies = await getAllConstituenciesFromFirestore();
      if (constituencies && constituencies.length > 0) {
        for (const c of constituencies) {
          this.constituencies.set(c.id, { ...c });
        }
      }

      // 3. Synchronize Candidates
      const candidates = await getAllCandidatesFromFirestore();
      if (candidates && candidates.length > 0) {
        for (const cand of candidates) {
          this.candidates.set(cand.id, { ...cand });
        }
      }

      // 4. Synchronize Voters
      const voters = await getAllVotersFromFirestore();
      if (voters && voters.length > 0) {
        for (const v of voters) {
          this.voters.set(v.epicId.toUpperCase(), { ...v });
        }
      }

      // 5. Synchronize Audit Events
      const audit = await getAllAuditEventsFromFirestore();
      if (audit && audit.length > 0) {
        this.auditEvents = [...audit];
      }
    } catch (err: any) {
      console.warn('[ServerStore] Notice syncing from Firestore:', err.message);
    }
  }

  // --- Voter Lifecycle & Roll Operations ---
  public findVoterByEpic(epicId: string): VoterRecord | undefined {
    return this.voters.get(epicId.trim().toUpperCase());
  }

  public async findVoterByEpicAsync(epicId: string): Promise<VoterRecord | undefined> {
    const cached = this.findVoterByEpic(epicId);
    if (cached) return cached;

    try {
      const fromDb = await getVoterRecordByEpicFromFirestore(epicId);
      if (fromDb) {
        this.voters.set(fromDb.epicId.toUpperCase(), fromDb);
        return fromDb;
      }
    } catch (err: any) {
      console.warn('[ServerStore] Notice querying Firestore for voter:', err.message);
    }
    return undefined;
  }

  public updateVoterStatus(
    epicId: string,
    status: VoterLifecycleStatus,
    metadata?: { authorizedWallet?: string; activeNullifier?: string; ticketExpiry?: number }
  ): boolean {
    const voter = this.findVoterByEpic(epicId);
    if (!voter) return false;

    // Invariant: Once VOTED, status cannot regress back to ELIGIBLE or AUTHORIZED without explicit admin override
    if (voter.status === 'VOTED' && status !== 'VOTED') {
      return false;
    }

    voter.status = status;
    if (metadata?.authorizedWallet) voter.authorizedWallet = metadata.authorizedWallet;
    if (metadata?.activeNullifier) voter.activeNullifier = metadata.activeNullifier;
    if (metadata?.ticketExpiry) voter.ticketExpiry = metadata.ticketExpiry;
    if (status === 'VOTED') voter.votedAt = Date.now();

    // Asynchronously persist to Firestore without blocking response
    saveVoterRecordToFirestore(voter).catch((err) =>
      console.warn('[ServerStore] Notice updating voter in Firestore:', err.message)
    );

    return true;
  }

  public async updateVoterStatusAsync(
    epicId: string,
    status: VoterLifecycleStatus,
    metadata?: { authorizedWallet?: string; activeNullifier?: string; ticketExpiry?: number }
  ): Promise<boolean> {
    const voter = this.findVoterByEpic(epicId);
    if (!voter) return false;

    if (voter.status === 'VOTED' && status !== 'VOTED') {
      return false;
    }

    voter.status = status;
    if (metadata?.authorizedWallet) voter.authorizedWallet = metadata.authorizedWallet;
    if (metadata?.activeNullifier) voter.activeNullifier = metadata.activeNullifier;
    if (metadata?.ticketExpiry) voter.ticketExpiry = metadata.ticketExpiry;
    if (status === 'VOTED') voter.votedAt = Date.now();

    if (isFirebaseConfigured()) {
      await saveVoterRecordToFirestore(voter);
    }

    return true;
  }

  public getAllVoters(): VoterRecord[] {
    return Array.from(this.voters.values());
  }

  public setVoterEligibility(voterId: string, isEligible: boolean): boolean {
    for (const v of this.voters.values()) {
      if (v.id === voterId) {
        // Cannot alter eligibility if voter has already completed ballot submission
        if (v.status === 'VOTED') return false;
        v.isEligible = isEligible;
        saveVoterRecordToFirestore(v).catch((err) =>
          console.warn('[ServerStore] Notice updating voter eligibility in Firestore:', err.message)
        );
        return true;
      }
    }
    return false;
  }

  public async setVoterEligibilityAsync(voterId: string, isEligible: boolean): Promise<boolean> {
    for (const v of this.voters.values()) {
      if (v.id === voterId) {
        if (v.status === 'VOTED') return false;
        v.isEligible = isEligible;
        if (isFirebaseConfigured()) {
          await saveVoterRecordToFirestore(v);
        }
        return true;
      }
    }
    return false;
  }

  public resetVoterAuthorization(voterId: string): boolean {
    for (const v of this.voters.values()) {
      if (v.id === voterId) {
        // Recovery allowed only if status is AUTHORIZED (transaction aborted/reverted)
        if (v.status === 'VOTED') return false;
        v.status = 'ELIGIBLE';
        v.activeNullifier = undefined;
        v.authorizedWallet = undefined;
        v.ticketExpiry = undefined;
        saveVoterRecordToFirestore(v).catch((err) =>
          console.warn('[ServerStore] Notice resetting voter authorization in Firestore:', err.message)
        );
        return true;
      }
    }
    return false;
  }

  public async resetVoterAuthorizationAsync(voterId: string): Promise<boolean> {
    for (const v of this.voters.values()) {
      if (v.id === voterId) {
        if (v.status === 'VOTED') return false;
        v.status = 'ELIGIBLE';
        v.activeNullifier = undefined;
        v.authorizedWallet = undefined;
        v.ticketExpiry = undefined;
        if (isFirebaseConfigured()) {
          await saveVoterRecordToFirestore(v);
        }
        return true;
      }
    }
    return false;
  }

  // --- OTP Challenge Operations ---
  public getOtpChallenge(epicId: string): OtpChallengeRecord | undefined {
    return this.otpChallenges.get(epicId.trim().toUpperCase());
  }

  public async getOtpChallengeAsync(epicId: string): Promise<OtpChallengeRecord | undefined> {
    const cached = this.getOtpChallenge(epicId);
    if (cached) return cached;

    try {
      const fromDb = await getOtpChallengeFromFirestore(epicId);
      if (fromDb) {
        this.otpChallenges.set(fromDb.epicId.toUpperCase(), fromDb);
        return fromDb;
      }
    } catch (err: any) {
      console.warn('[ServerStore] Notice querying Firestore for OTP challenge:', err.message);
    }
    return undefined;
  }

  public setOtpChallenge(record: OtpChallengeRecord): void {
    this.otpChallenges.set(record.epicId.trim().toUpperCase(), record);
    saveOtpChallengeToFirestore(record).catch((err) =>
      console.warn('[ServerStore] Notice saving OTP challenge to Firestore:', err.message)
    );
  }

  public recordTestOtpDelivery(epicId: string, code: string): void {
    if (SERVER_CONFIG.NODE_ENV !== 'production') {
      this.testDeliveryQueue.set(epicId.trim().toUpperCase(), {
        code,
        timestamp: Date.now(),
      });
    }
  }

  public getTestDeliveredOtp(epicId: string): string | undefined {
    if (SERVER_CONFIG.NODE_ENV !== 'production') {
      return this.testDeliveryQueue.get(epicId.trim().toUpperCase())?.code;
    }
    return undefined;
  }

  // --- Session Management (Signed Expiring JWT Bearer Tokens) ---
  public createSession(voter: VoterRecord, constituencyCode: number): VoterSession {
    const { token, jti, expiresAt } = createVoterJwt({
      epicId: voter.epicId,
      voterId: voter.id,
      name: voter.name,
      constituencyId: voter.constituencyId,
      constituencyCode,
    });

    const session: VoterSession = {
      token,
      epicId: voter.epicId,
      voterId: voter.id,
      name: voter.name,
      constituencyId: voter.constituencyId,
      constituencyCode,
      createdAt: Date.now(),
      expiresAt,
      jti,
      isJwt: true,
    };

    this.sessions.set(token, session);
    return session;
  }

  public getSession(token: string): VoterSession | undefined {
    if (!token || typeof token !== 'string') return undefined;

    // 1. If it has 3 dot-separated parts, it is a signed JWT bearer token
    if (token.split('.').length === 3) {
      const jwtResult = verifyVoterJwt(token);
      if (!jwtResult.isValid || !jwtResult.payload) {
        return undefined;
      }

      // Check if jti has been explicitly revoked / logged out
      if (this.revokedJtis.has(jwtResult.payload.jti)) {
        return undefined;
      }

      // If present in active in-memory sessions cache, check memory expiry
      const inMemory = this.sessions.get(token);
      if (inMemory) {
        if (Date.now() > inMemory.expiresAt) {
          this.sessions.delete(token);
          return undefined;
        }
        return inMemory;
      }

      // Reconstruct verified session from validated cryptographic claims
      return {
        token,
        epicId: jwtResult.payload.sub,
        voterId: jwtResult.payload.voterId,
        name: jwtResult.payload.name,
        constituencyId: jwtResult.payload.constituencyId,
        constituencyCode: jwtResult.payload.constituencyCode,
        createdAt: jwtResult.payload.iat * 1000,
        expiresAt: jwtResult.payload.exp * 1000,
        jti: jwtResult.payload.jti,
        isJwt: true,
      };
    }

    // 2. Fallback for legacy opaque tokens (if present in tests)
    const session = this.sessions.get(token);
    if (!session) return undefined;
    if (Date.now() > session.expiresAt) {
      this.sessions.delete(token);
      return undefined;
    }
    return session;
  }

  public deleteSession(token: string): void {
    const session = this.sessions.get(token);
    if (session?.jti) {
      this.revokedJtis.add(session.jti);
    } else if (token.split('.').length === 3) {
      const parsed = verifyVoterJwt(token);
      if (parsed.payload?.jti) {
        this.revokedJtis.add(parsed.payload.jti);
      }
    }
    this.sessions.delete(token);
  }

  public revokeSession(tokenOrJti: string): void {
    this.revokedJtis.add(tokenOrJti);
    this.sessions.delete(tokenOrJti);
  }

  public isJtiRevoked(jti: string): boolean {
    return this.revokedJtis.has(jti);
  }

  // --- Election Management Operations ---
  public getAllElections(): Election[] {
    return Array.from(this.elections.values());
  }

  public getElectionById(id: string): Election | undefined {
    return this.elections.get(id);
  }

  public findElectionByNumericId(numericId: number): Election | undefined {
    for (const election of this.elections.values()) {
      if (Number(election.numericId) === Number(numericId)) {
        return election;
      }
    }
    return undefined;
  }

  public createElection(data: Omit<Election, 'totalVotesCast' | 'totalVotersRegistered'>): Election {
    const newElection: Election = {
      ...data,
      totalVotesCast: 0,
      totalVotersRegistered: 10000,
    };
    this.elections.set(newElection.id, newElection);
    saveElectionToFirestore(newElection).catch((err) =>
      console.warn('[ServerStore] Notice saving election to Firestore:', err.message)
    );
    return newElection;
  }

  public async createElectionAsync(data: Omit<Election, 'totalVotesCast' | 'totalVotersRegistered'>): Promise<Election> {
    const newElection: Election = {
      ...data,
      totalVotesCast: 0,
      totalVotersRegistered: 10000,
    };
    if (isFirebaseConfigured()) {
      await saveElectionToFirestore(newElection);
    }
    this.elections.set(newElection.id, newElection);
    return newElection;
  }

  public updateElectionStatus(electionId: string, newStatus: ElectionStatus): { success: boolean; message: string } {
    const election = this.elections.get(electionId);
    if (!election) {
      return { success: false, message: 'Election record not found.' };
    }

    const current = election.status;
    const nowSec = Math.floor(Date.now() / 1000);

    // Enforce valid lifecycle transitions
    // draft -> scheduled, active
    // scheduled -> active, draft
    // active -> paused, concluded
    // paused -> active, concluded
    // concluded -> terminal (immutable)
    if (current === 'concluded') {
      return { success: false, message: 'Concluded election is terminal and cannot transition.' };
    }

    if (newStatus === 'scheduled') {
      if (election.endTime <= election.startTime) {
        return { success: false, message: 'Election closing deadline must be strictly after the start time.' };
      }
    }

    if (newStatus === 'active') {
      // Validate election voting window
      if (nowSec > election.endTime) {
        return { success: false, message: 'Cannot activate election past its scheduled end time.' };
      }
      // Validate that at least one candidate is registered in associated constituencies
      const electionCandidates = this.getAllCandidates().filter((c) =>
        election.constituencyIds ? election.constituencyIds.includes(c.constituencyId) : true
      );
      if (electionCandidates.length === 0) {
        return { success: false, message: 'Cannot activate election without nominated candidates.' };
      }
    }

    election.status = newStatus;
    saveElectionToFirestore(election).catch((err) =>
      console.warn('[ServerStore] Notice updating election status in Firestore:', err.message)
    );

    this.recordAuditEvent({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ELECTION_STATE',
      description: `Election ${election.title} status updated from ${current.toUpperCase()} to ${newStatus.toUpperCase()}`,
      electionId: election.numericId,
    });

    return { success: true, message: `Election state transitioned to ${newStatus}.` };
  }

  public async updateElectionStatusAsync(electionId: string, newStatus: ElectionStatus): Promise<{ success: boolean; message: string }> {
    const election = this.elections.get(electionId);
    if (!election) {
      return { success: false, message: 'Election record not found.' };
    }

    const current = election.status;
    const nowSec = Math.floor(Date.now() / 1000);

    if (current === 'concluded') {
      return { success: false, message: 'Concluded election is terminal and cannot transition.' };
    }

    if (newStatus === 'scheduled') {
      if (election.endTime <= election.startTime) {
        return { success: false, message: 'Election closing deadline must be strictly after the start time.' };
      }
    }

    if (newStatus === 'active') {
      if (nowSec > election.endTime) {
        return { success: false, message: 'Cannot activate election past its scheduled end time.' };
      }
      const electionCandidates = this.getAllCandidates().filter((c) =>
        election.constituencyIds ? election.constituencyIds.includes(c.constituencyId) : true
      );
      if (electionCandidates.length === 0) {
        return { success: false, message: 'Cannot activate election without nominated candidates.' };
      }
    }

    const updated = { ...election, status: newStatus };
    if (isFirebaseConfigured()) {
      await saveElectionToFirestore(updated);
    }
    election.status = newStatus;

    this.recordAuditEvent({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ELECTION_STATE',
      description: `Election ${election.title} status updated from ${current.toUpperCase()} to ${newStatus.toUpperCase()}`,
      electionId: election.numericId,
    });

    return { success: true, message: `Election state transitioned to ${newStatus}.` };
  }

  // --- Constituency Operations ---
  public getAllConstituencies(): Constituency[] {
    return Array.from(this.constituencies.values());
  }

  public getConstituencyById(id: string): Constituency | undefined {
    return this.constituencies.get(id);
  }

  public incrementTurnout(constituencyId: string): void {
    const c = this.constituencies.get(constituencyId);
    if (c) {
      c.turnoutCount = (c.turnoutCount || 0) + 1;
      saveConstituencyToFirestore(c).catch((err) =>
        console.warn('[ServerStore] Notice updating constituency turnout in Firestore:', err.message)
      );
    }
  }

  // --- Candidate Operations ---
  public getAllCandidates(): Candidate[] {
    return Array.from(this.candidates.values());
  }

  public getCandidatesByConstituency(constituencyId: string): Candidate[] {
    return Array.from(this.candidates.values()).filter((c) => c.constituencyId === constituencyId);
  }

  public addCandidate(candidate: Candidate): { success: boolean; message: string } {
    // Validate election state: cannot add candidates while an associated election is active
    const activeElections = Array.from(this.elections.values()).filter(
      (e) => e.status === 'active'
    );
    for (const e of activeElections) {
      if (e.constituencyIds && e.constituencyIds.includes(candidate.constituencyId)) {
        return {
          success: false,
          message: 'Nominations are locked: cannot add candidates while an associated election is active.',
        };
      }
    }

    // Check duplicate name in constituency
    const exists = Array.from(this.candidates.values()).some(
      (c) =>
        c.constituencyId === candidate.constituencyId &&
        c.name.trim().toLowerCase() === candidate.name.trim().toLowerCase()
    );
    if (exists) {
      return { success: false, message: 'A candidate with this name already exists in this constituency.' };
    }

    // Validate constituency exists
    if (!this.constituencies.has(candidate.constituencyId)) {
      return { success: false, message: 'Target constituency does not exist in the electoral registry.' };
    }

    this.candidates.set(candidate.id, candidate);
    saveCandidateToFirestore(candidate).catch((err) =>
      console.warn('[ServerStore] Notice saving candidate to Firestore:', err.message)
    );

    this.recordAuditEvent({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'CANDIDATE_REGISTERED',
      description: `Candidate nomination registered: ${candidate.name} (${candidate.partyName}) for ${candidate.constituencyId}`,
      electionId: 1,
    });

    return { success: true, message: 'Candidate registered successfully.' };
  }

  public async addCandidateAsync(candidate: Candidate): Promise<{ success: boolean; message: string }> {
    const activeElections = Array.from(this.elections.values()).filter(
      (e) => e.status === 'active'
    );
    for (const e of activeElections) {
      if (e.constituencyIds && e.constituencyIds.includes(candidate.constituencyId)) {
        return {
          success: false,
          message: 'Nominations are locked: cannot add candidates while an associated election is active.',
        };
      }
    }

    const exists = Array.from(this.candidates.values()).some(
      (c) =>
        c.constituencyId === candidate.constituencyId &&
        c.name.trim().toLowerCase() === candidate.name.trim().toLowerCase()
    );
    if (exists) {
      return { success: false, message: 'A candidate with this name already exists in this constituency.' };
    }

    if (!this.constituencies.has(candidate.constituencyId)) {
      return { success: false, message: 'Target constituency does not exist in the electoral registry.' };
    }

    if (isFirebaseConfigured()) {
      await saveCandidateToFirestore(candidate);
    }
    this.candidates.set(candidate.id, candidate);

    this.recordAuditEvent({
      id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'CANDIDATE_REGISTERED',
      description: `Candidate nomination registered: ${candidate.name} (${candidate.partyName}) for ${candidate.constituencyId}`,
      electionId: 1,
    });

    return { success: true, message: 'Candidate registered successfully.' };
  }

  public recordVoteForCandidate(candidateId: string, electionId: string): void {
    const cand = this.candidates.get(candidateId);
    if (cand) {
      cand.voteCount = (cand.voteCount || 0) + 1;
      saveCandidateToFirestore(cand).catch((err) =>
        console.warn('[ServerStore] Notice recording candidate vote count in Firestore:', err.message)
      );
    }

    const ele = this.elections.get(electionId);
    if (ele) {
      ele.totalVotesCast = (ele.totalVotesCast || 0) + 1;
      saveElectionToFirestore(ele).catch((err) =>
        console.warn('[ServerStore] Notice recording election vote tally in Firestore:', err.message)
      );
    }
  }

  // --- Audit Logs (Append-Only) ---
  public recordAuditEvent(event: AuditEvent): void {
    this.auditEvents.unshift(event);
    appendAuditEventToFirestore(event).catch((err) =>
      console.warn('[ServerStore] Notice appending audit event to Firestore:', err.message)
    );
  }

  public getAllAuditEvents(): AuditEvent[] {
    return [...this.auditEvents];
  }

  // --- Blockchain Nullifier Reconciliation ---
  public markNullifierSpentOnChain(nullifier: string): void {
    this.spentNullifiersOnChain.add(nullifier.toLowerCase());
  }

  public isNullifierSpentOnChain(nullifier: string): boolean {
    return this.spentNullifiersOnChain.has(nullifier.toLowerCase());
  }

  // --- Redacted Logging Helper ---
  public logSecure(message: string, context?: Record<string, any>): void {
    const sanitized = { ...(context || {}) };
    const sensitiveKeys = ['otp', 'hmacHash', 'secret', 'privateKey', 'signature', 'name', 'maskedMobile'];
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some((s) => key.toLowerCase().includes(s.toLowerCase()))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    console.log(`[BlockBallot Server] ${message}`, Object.keys(sanitized).length > 0 ? sanitized : '');
  }
}

export const serverStore = new ServerStore();
