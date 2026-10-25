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
  NormalizedElectionStatus,
  normalizeElectionStatus,
  isValidElectionTransition,
  toLegacyElectionStatus,
  AuthoritativeElectionStatus,
} from '../../frontend/src/types';
import {
  VotingSessionStatus,
  IdentityVerificationOutcome,
  validateVotingSessionRecord,
  isValidVotingSessionTransition,
} from '../../frontend/src/types/dataModel';
import {
  INITIAL_ELECTIONS,
  INITIAL_CONSTITUENCIES,
  INITIAL_CANDIDATES,
} from '../../frontend/src/data/mockData';
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
  deleteCandidateFromFirestore,
  getAllCandidatesFromFirestore,
  saveConstituencyToFirestore,
  getAllConstituenciesFromFirestore,
  appendAuditEventToFirestore,
  getAllAuditEventsFromFirestore,
} from './firestore';
import { isFirebaseConfigured } from './firebaseAdmin';
import { createVoterJwt, verifyVoterJwt } from './crypto';
import { getDataRepositories } from './repositories';

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
  id: string; // High-entropy identifier (e.g. vses_...)
  token: string;
  sessionTokenHash: string; // SHA-256 hash
  epicId: string;
  voterId: string;
  simulationVoterId?: string;
  name: string;
  constituencyId: string;
  constituencyCode: number;
  electionId?: string;
  numericElectionId?: number;
  status: VotingSessionStatus;
  verificationOutcome: IdentityVerificationOutcome;
  manualExceptionId?: string;
  authNonce: string;
  voterWallet?: string;
  nullifier?: string;
  txHash?: string;
  fullscreenExitCount: number;
  lockedReason?: string;
  lockedAt?: number;
  recoveredAt?: number;
  recoveredByOfficerId?: string;
  createdAt: number;
  expiresAt: number;
  version: number;
  jti?: string;
  isJwt?: boolean;
}

class ServerStore {
  // Synchronized stores
  private voters: Map<string, VoterRecord> = new Map();
  private otpChallenges: Map<string, OtpChallengeRecord> = new Map();
  private sessions: Map<string, VoterSession> = new Map();
  private sessionsById: Map<string, VoterSession> = new Map();
  private sessionsByHash: Map<string, VoterSession> = new Map();
  private revokedJtis: Set<string> = new Set();
  private elections: Map<string, Election> = new Map();
  private constituencies: Map<string, Constituency> = new Map();
  private candidates: Map<string, Candidate> = new Map();
  private auditEvents: AuditEvent[] = [];

  // On-chain spent nullifiers registry (for idempotency and reconciliation)
  private spentNullifiersOnChain: Set<string> = new Set();

  // Test Delivery Adapter: holds dispatched synthetic test notifications
  private testDeliveryQueue: Map<string, { code: string; timestamp: number }> = new Map();

  // Authoritative Server Clock & Simulation Offset (Injectable for Deterministic Testing)
  private simulatedCurrentTimeMs: number | null = null;

  public getCurrentTimeMs(): number {
    if (this.simulatedCurrentTimeMs !== null) {
      return this.simulatedCurrentTimeMs;
    }
    return Date.now();
  }

  public getCurrentTimeSec(): number {
    return Math.floor(this.getCurrentTimeMs() / 1000);
  }

  public setSimulatedServerTime(timeMsOrSec: number): void {
    const ms = timeMsOrSec < 10000000000 ? timeMsOrSec * 1000 : timeMsOrSec;
    this.simulatedCurrentTimeMs = ms;
  }

  public advanceSimulatedServerTime(seconds: number): void {
    const current = this.getCurrentTimeMs();
    this.simulatedCurrentTimeMs = current + seconds * 1000;
  }

  public resetSimulatedServerTime(): void {
    this.simulatedCurrentTimeMs = null;
  }

  constructor() {
    this.resetDefaults();
  }

  public resetDefaults(): void {
    this.resetVoters();
  }

  public resetVoters(): void {
    // Reset simulated clock
    this.resetSimulatedServerTime();

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

    // Query Phase 04 persistent VoterProfile repository (by simulation ID or legacy EPIC)
    try {
      const repos = getDataRepositories();
      const profile =
        (await repos.voterProfiles.findBySimulationId(epicId)) ||
        (await repos.voterProfiles.findByLegacyEpic(epicId));

      if (profile) {
        const isEligible =
          profile.registrationStatus === 'REGISTERED' &&
          profile.eligibilityStatus === 'ELIGIBLE' &&
          profile.lifecycleStatus === 'ACTIVE';

        const dob = new Date(profile.dateOfBirth);
        const age = isNaN(dob.getTime()) ? 25 : Math.max(18, new Date().getFullYear() - dob.getFullYear());

        const record: VoterRecord = {
          id: profile.id,
          epicId: profile.simulationVoterId,
          name: profile.fullName,
          gender: profile.gender,
          age,
          constituencyId: profile.constituencyId,
          pollingStation: profile.pollingStation,
          maskedMobile: profile.maskedMobile || '+91 ••••• •1122',
          isEligible,
          status: profile.lifecycleStatus === 'LOCKED' ? 'AUTHORIZED' : 'ELIGIBLE',
        };

        this.voters.set(record.epicId.toUpperCase(), record);
        return record;
      }
    } catch (err: any) {
      console.warn('[ServerStore] Notice querying VoterProfile repository:', err.message);
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

  public setVoterRecord(voter: VoterRecord): void {
    this.voters.set(voter.epicId.toUpperCase(), voter);
  }

  public findVoterById(id: string): VoterRecord | undefined {
    return Array.from(this.voters.values()).find((v) => v.id === id);
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

  // --- Session Management (Signed Expiring JWT Bearer Tokens & High-Entropy Sessions) ---
  public createSession(
    voter: VoterRecord,
    constituencyCode: number,
    opts?: {
      electionId?: string | number;
      numericElectionId?: number;
      verificationOutcome?: IdentityVerificationOutcome;
      manualExceptionId?: string;
      status?: VotingSessionStatus;
    }
  ): VoterSession {
    const { token: jwtToken, jti } = createVoterJwt({
      epicId: voter.epicId,
      voterId: voter.id,
      name: voter.name,
      constituencyId: voter.constituencyId,
      constituencyCode,
    });

    const highEntropyToken = `bb_vses_${crypto.randomBytes(32).toString('base64url')}`;
    const sessionId = `vses_${crypto.randomBytes(16).toString('hex')}`;
    const sessionTokenHash = crypto.createHash('sha256').update(highEntropyToken).digest('hex');
    const authNonce = crypto.randomBytes(16).toString('hex');
    const nowMs = this.getCurrentTimeMs();
    const effectiveExpiresAt = nowMs + SERVER_CONFIG.SESSION_EXPIRY_MS;

    const electionIdStr = opts?.electionId !== undefined ? String(opts.electionId) : undefined;
    let numElecId: number | undefined = undefined;
    if (opts?.numericElectionId !== undefined) {
      numElecId = Number(opts.numericElectionId);
    } else if (typeof opts?.electionId === 'number') {
      numElecId = opts.electionId;
    } else if (opts?.electionId) {
      const elec = this.getElectionById(String(opts.electionId));
      if (elec?.numericId !== undefined) {
        numElecId = elec.numericId;
      }
    }

    const session: VoterSession = {
      id: sessionId,
      token: highEntropyToken,
      sessionTokenHash,
      epicId: voter.epicId,
      voterId: voter.id,
      simulationVoterId: (voter as any).simulationVoterId || voter.epicId,
      name: voter.name,
      constituencyId: voter.constituencyId,
      constituencyCode,
      electionId: electionIdStr,
      numericElectionId: numElecId,
      status: opts?.status || (opts ? 'CREATED' : 'AUTHORIZED'),
      verificationOutcome: opts?.verificationOutcome || 'OTP_DEMO',
      manualExceptionId: opts?.manualExceptionId,
      authNonce,
      fullscreenExitCount: 0,
      createdAt: nowMs,
      expiresAt: effectiveExpiresAt,
      version: 1,
      jti,
      isJwt: true,
    };

    this.sessions.set(highEntropyToken, session);
    this.sessions.set(jwtToken, session);
    this.sessionsById.set(sessionId, session);
    this.sessionsByHash.set(sessionTokenHash, session);
    return session;
  }

  public getSession(token: string): VoterSession | undefined {
    if (!token || typeof token !== 'string') return undefined;

    // Check if token is explicitly revoked
    if (this.revokedJtis.has(token)) return undefined;

    // 1. Check in-memory store by exact token
    let session = this.sessions.get(token);

    // 2. Fallback check by session ID or token hash
    if (!session) {
      session = this.sessionsById.get(token) || this.sessionsByHash.get(token);
    }

    // 3. Fallback check for JWT signature reconstruction
    if (!session && token.split('.').length === 3) {
      const jwtResult = verifyVoterJwt(token);
      if (!jwtResult.isValid || !jwtResult.payload) {
        return undefined;
      }
      if (this.revokedJtis.has(jwtResult.payload.jti)) {
        return undefined;
      }

      const nowMs = this.getCurrentTimeMs();
      const expMs = jwtResult.payload.exp * 1000;
      if (nowMs > expMs) {
        return undefined;
      }

      const sessionId = `vses_${crypto.createHash('sha256').update(jwtResult.payload.jti).digest('hex').substring(0, 16)}`;
      const sessionTokenHash = crypto.createHash('sha256').update(token).digest('hex');

      session = {
        id: sessionId,
        token,
        sessionTokenHash,
        epicId: jwtResult.payload.sub,
        voterId: jwtResult.payload.voterId,
        simulationVoterId: jwtResult.payload.voterId,
        name: jwtResult.payload.name,
        constituencyId: jwtResult.payload.constituencyId,
        constituencyCode: jwtResult.payload.constituencyCode,
        electionId: 'GE-2024',
        numericElectionId: 18,
        status: 'AUTHORIZED',
        verificationOutcome: 'OTP_DEMO',
        authNonce: crypto.randomBytes(16).toString('hex'),
        fullscreenExitCount: 0,
        createdAt: jwtResult.payload.iat * 1000,
        expiresAt: expMs,
        version: 1,
        jti: jwtResult.payload.jti,
        isJwt: true,
      };

      this.sessions.set(token, session);
      this.sessionsById.set(session.id, session);
      this.sessionsByHash.set(sessionTokenHash, session);
    }

    if (!session) return undefined;

    // Check revocation
    if (session.jti && this.revokedJtis.has(session.jti)) {
      return undefined;
    }
    if (this.revokedJtis.has(session.id) || this.revokedJtis.has(session.token)) {
      return undefined;
    }

    // Authoritative server-clock expiration check
    if (this.getCurrentTimeMs() > session.expiresAt) {
      session.status = 'EXPIRED';
      this.sessions.delete(session.token);
      return undefined;
    }

    return session;
  }

  public getSessionRecord(tokenOrIdOrHash: string): VoterSession | undefined {
    if (!tokenOrIdOrHash || typeof tokenOrIdOrHash !== 'string') return undefined;

    let session =
      this.sessions.get(tokenOrIdOrHash) ||
      this.sessionsById.get(tokenOrIdOrHash) ||
      this.sessionsByHash.get(tokenOrIdOrHash);

    if (!session && tokenOrIdOrHash.split('.').length === 3) {
      session = this.getSession(tokenOrIdOrHash);
    }

    if (!session) {
      for (const s of this.sessions.values()) {
        if (s.epicId.toUpperCase() === tokenOrIdOrHash.toUpperCase()) {
          session = s;
          break;
        }
      }
    }

    if (!session) return undefined;

    if (this.getCurrentTimeMs() > session.expiresAt && session.status !== 'EXPIRED' && session.status !== 'REVOKED') {
      session.status = 'EXPIRED';
    }

    return session;
  }

  public deleteSession(token: string): void {
    const session = this.sessions.get(token) || this.sessionsById.get(token) || this.sessionsByHash.get(token);
    if (session) {
      if (session.jti) this.revokedJtis.add(session.jti);
      this.revokedJtis.add(session.id);
      this.revokedJtis.add(session.token);
      this.sessions.delete(session.token);
      this.sessionsById.delete(session.id);
      this.sessionsByHash.delete(session.sessionTokenHash);
    } else if (token.split('.').length === 3) {
      const parsed = verifyVoterJwt(token);
      if (parsed.payload?.jti) {
        this.revokedJtis.add(parsed.payload.jti);
      }
      this.revokedJtis.add(token);
      this.sessions.delete(token);
    }
  }

  public revokeSession(tokenOrJti: string): void {
    this.revokedJtis.add(tokenOrJti);
    const session = this.sessions.get(tokenOrJti) || this.sessionsById.get(tokenOrJti) || this.sessionsByHash.get(tokenOrJti);
    if (session) {
      session.status = 'REVOKED';
      this.sessions.delete(session.token);
      this.sessionsById.delete(session.id);
      this.sessionsByHash.delete(session.sessionTokenHash);
    } else {
      this.sessions.delete(tokenOrJti);
    }
  }

  public isJtiRevoked(jti: string): boolean {
    return this.revokedJtis.has(jti);
  }

  public recordFullscreenExit(
    tokenOrId: string,
    reason?: string
  ): { success: boolean; locked: boolean; exitCount: number; session?: VoterSession; message: string } {
    const session = this.getSessionRecord(tokenOrId);
    if (!session) {
      return { success: false, locked: false, exitCount: 0, message: 'Voting session not found or invalid.' };
    }

    if (session.status === 'EXPIRED' || this.getCurrentTimeMs() > session.expiresAt) {
      session.status = 'EXPIRED';
      return { success: false, locked: false, exitCount: session.fullscreenExitCount, session, message: 'Voting session has expired.' };
    }

    if (session.status === 'LOCKED_SUPERVISED_RECOVERY') {
      return {
        success: true,
        locked: true,
        exitCount: session.fullscreenExitCount,
        session,
        message: 'Voting session is already locked. Supervised recovery required before voting can resume.',
      };
    }

    session.fullscreenExitCount += 1;
    session.version += 1;

    if (session.fullscreenExitCount >= 3) {
      session.status = 'LOCKED_SUPERVISED_RECOVERY';
      session.lockedReason = reason || 'EXCESSIVE_FULLSCREEN_EXITS';
      session.lockedAt = this.getCurrentTimeSec();

      if (session.voterId && session.electionId) {
        try {
          const repos = getDataRepositories();
          repos.participations.updateParticipationStatus(
            session.voterId,
            session.electionId,
            'SESSION_LOCKED'
          ).catch((e: any) => console.warn('[Participation] Notice locking participation:', e.message));
        } catch (e: any) {
          console.warn('[Participation] Notice getting repos:', e.message);
        }
      }

      this.recordAuditEvent({
        id: `audit-lock-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: this.getCurrentTimeMs(),
        type: 'ADMIN_ACTION',
        description: `Voting session for elector '${session.epicId}' locked after ${session.fullscreenExitCount} fullscreen exit events. Supervised recovery required.`,
        electionId: session.numericElectionId || 1,
      });

      return {
        success: true,
        locked: true,
        exitCount: session.fullscreenExitCount,
        session,
        message: 'Voting session locked due to multiple unexpected fullscreen exits. Supervised recovery required before voting can resume.',
      };
    }

    const warning = session.fullscreenExitCount === 1
      ? 'First warning: Unexpected exit from fullscreen mode.'
      : 'Final warning: Further exit from fullscreen mode will immediately lock your voting session.';

    this.recordAuditEvent({
      id: `audit-fs-warn-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ADMIN_ACTION',
      description: `Fullscreen exit warning #${session.fullscreenExitCount} recorded for elector '${session.epicId}'.`,
      electionId: session.numericElectionId || 1,
    });

    return {
      success: true,
      locked: false,
      exitCount: session.fullscreenExitCount,
      session,
      message: warning,
    };
  }

  public async unlockSession(
    sessionIdOrToken: string,
    officerId: string,
    officerRole: string,
    reason: string
  ): Promise<{ success: boolean; message: string; session?: VoterSession }> {
    if (officerRole !== 'PLATFORM_ADMIN' && officerRole !== 'ELECTION_OFFICER') {
      return { success: false, message: 'Unauthorized: Only an authorized Election Officer or Platform Admin can recover locked voting sessions.' };
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return { success: false, message: 'Supervised recovery requires a non-empty administrative justification reason (min 5 characters).' };
    }

    const session = this.getSessionRecord(sessionIdOrToken);
    if (!session) {
      return { success: false, message: 'Voting session not found or invalid.' };
    }

    if (session.status !== 'LOCKED_SUPERVISED_RECOVERY') {
      return { success: false, message: `Session is in '${session.status}' status (must be LOCKED_SUPERVISED_RECOVERY to recover).` };
    }

    // Safety check: ensure elector hasn't already voted
    if (session.voterId && session.electionId) {
      try {
        const repos = getDataRepositories();
        const existing = await repos.participations.getParticipation(session.voterId, session.electionId);
        if (existing && existing.status === 'VOTE_ACCEPTED') {
          return { success: false, message: 'Cannot recover session: Elector has already cast a confirmed ballot in this election.' };
        }
      } catch (e: any) {
        console.warn('[Recovery] Notice checking participation:', e.message);
      }
    }

    const nowSec = this.getCurrentTimeSec();
    session.status = 'AUTHORIZED';
    session.fullscreenExitCount = 0;
    session.lockedReason = undefined;
    session.lockedAt = undefined;
    session.recoveredAt = nowSec;
    session.recoveredByOfficerId = officerId;
    session.version += 1;

    // Restore participation state
    if (session.voterId && session.electionId) {
      try {
        const repos = getDataRepositories();
        await repos.participations.updateParticipationStatus(
          session.voterId,
          session.electionId,
          'SESSION_AUTHORIZED'
        );
      } catch (e: any) {
        console.warn('[Participation] Notice restoring participation:', e.message);
      }
    }

    this.recordAuditEvent({
      id: `audit-unlock-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ADMIN_ACTION',
      description: `Voting session for elector '${session.epicId}' unlocked by officer '${officerId}' (${officerRole}). Reason: ${reason.trim()}`,
      electionId: session.numericElectionId || 1,
    });

    return {
      success: true,
      message: 'Voting session successfully unlocked. Elector may resume ballot submission.',
      session,
    };
  }

  public validateCandidateInElectionAndConstituency(
    candidateId: number | string,
    electionId?: string | number,
    constituencyId?: string
  ): { isValid: boolean; candidate?: Candidate; error?: string } {
    let candidate: Candidate | undefined;
    const candIdStr = String(candidateId);
    const candNum = Number(candidateId);

    for (const c of this.candidates.values()) {
      if (c.id === candIdStr || (!isNaN(candNum) && c.numericId === candNum)) {
        candidate = c;
        break;
      }
    }

    if (!candidate) {
      return { isValid: false, error: `Candidate '${candidateId}' not found in registered nominations.` };
    }

    if (constituencyId && candidate.constituencyId !== constituencyId) {
      return {
        isValid: false,
        candidate,
        error: `Candidate '${candidate.name}' is registered in constituency '${candidate.constituencyId}', not in elector constituency '${constituencyId}'.`,
      };
    }

    if (candidate.status && candidate.status !== 'ACTIVE') {
      return {
        isValid: false,
        candidate,
        error: `Candidate nomination is inactive (Status: ${candidate.status}). Ballots cannot be cast for withdrawn or disqualified candidates.`,
      };
    }

    return { isValid: true, candidate };
  }


  // --- Election Management Operations ---

  /**
   * Idempotently reconciles election schedules against the authoritative server clock.
   * - Transitions SCHEDULED elections to ACTIVE/OPEN once nowSec >= startTime (with nominated candidates)
   * - Transitions ACTIVE/OPEN elections to CONCLUDED/CLOSED once nowSec >= endTime
   * Repeated executions with unchanged criteria produce 0 transitions and NO duplicate audit logs.
   */
  public reconcileElectionSchedules(nowSec?: number): {
    transitions: Array<{ electionId: string; oldStatus: string; newStatus: string }>;
  } {
    const currentSec = nowSec ?? this.getCurrentTimeSec();
    const transitions: Array<{ electionId: string; oldStatus: string; newStatus: string }> = [];

    for (const election of this.elections.values()) {
      const normStatus = normalizeElectionStatus(election.status);

      // 1. Scheduled -> Active (or Concluded if end time is also reached)
      if (normStatus === 'SCHEDULED' && currentSec >= election.startTime) {
        if (currentSec >= election.endTime) {
          const oldStatus = election.status;
          election.status = 'concluded';
          election.closedAt = election.closedAt || currentSec;
          election.updatedAt = currentSec;

          saveElectionToFirestore(election).catch((err) =>
            console.warn('[ServerStore] Notice updating election status in Firestore:', err.message)
          );

          this.recordAuditEvent({
            id: `audit-sched-close-${currentSec}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: this.getCurrentTimeMs(),
            type: 'ELECTION_STATE',
            description: `Scheduled election ${election.title} reached closing deadline (${election.endTime}) and transitioned directly to CONCLUDED (CLOSED)`,
            electionId: election.numericId,
          });

          transitions.push({ electionId: election.id, oldStatus, newStatus: 'concluded' });
        } else {
          // Check that candidates exist before auto-activating
          const electionCandidates = this.getAllCandidates().filter((c) =>
            election.constituencyIds ? election.constituencyIds.includes(c.constituencyId) : true
          );

          if (electionCandidates.length > 0) {
            const oldStatus = election.status;
            election.status = 'active';
            election.openedAt = election.openedAt || currentSec;
            election.updatedAt = currentSec;

            saveElectionToFirestore(election).catch((err) =>
              console.warn('[ServerStore] Notice updating election status in Firestore:', err.message)
            );

            this.recordAuditEvent({
              id: `audit-sched-open-${currentSec}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: this.getCurrentTimeMs(),
              type: 'ELECTION_STATE',
              description: `Authoritative schedule timer: election ${election.title} reached scheduled start time (${election.startTime}) and transitioned to ACTIVE (OPEN)`,
              electionId: election.numericId,
            });

            transitions.push({ electionId: election.id, oldStatus, newStatus: 'active' });
          }
        }
      } else if (normStatus === 'OPEN' && currentSec >= election.endTime) {
        // 2. Open / Active -> Concluded
        const oldStatus = election.status;
        election.status = 'concluded';
        election.closedAt = election.closedAt || currentSec;
        election.updatedAt = currentSec;

        saveElectionToFirestore(election).catch((err) =>
          console.warn('[ServerStore] Notice updating election status in Firestore:', err.message)
        );

        this.recordAuditEvent({
          id: `audit-sched-close-${currentSec}-${Math.random().toString(36).substring(2, 6)}`,
          timestamp: this.getCurrentTimeMs(),
          type: 'ELECTION_STATE',
          description: `Authoritative schedule timer: election ${election.title} reached scheduled closing deadline (${election.endTime}) and transitioned to CONCLUDED (CLOSED)`,
          electionId: election.numericId,
        });

        transitions.push({ electionId: election.id, oldStatus, newStatus: 'concluded' });
      }
    }

    return { transitions };
  }

  public getAuthoritativeElectionStatus(electionId: string): AuthoritativeElectionStatus | null {
    this.reconcileElectionSchedules();

    const election =
      this.getElectionById(electionId) ||
      this.findElectionByNumericId(Number(electionId));

    if (!election) return null;

    const nowSec = this.getCurrentTimeSec();
    const norm = normalizeElectionStatus(election.status);
    const isVotingOpen = norm === 'OPEN' && nowSec >= election.startTime && nowSec < election.endTime;
    const hasStarted = nowSec >= election.startTime;
    const hasEnded = nowSec >= election.endTime;

    return {
      electionId: election.id,
      numericId: election.numericId,
      title: election.title,
      status: election.status,
      normalizedStatus: norm,
      serverTimeSec: nowSec,
      serverTimeIso: new Date(nowSec * 1000).toISOString(),
      startTimeSec: election.startTime,
      endTimeSec: election.endTime,
      timezone: election.timezone || 'Asia/Kolkata',
      isVotingOpen,
      hasStarted,
      hasEnded,
      timeUntilStartSec: Math.max(0, election.startTime - nowSec),
      timeUntilEndSec: Math.max(0, election.endTime - nowSec),
      cancellationReason: election.cancellationReason,
    };
  }

  public getAllElections(): Election[] {
    this.reconcileElectionSchedules();
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
    const nowSec = this.getCurrentTimeSec();
    const newElection: Election = {
      ...data,
      totalVotesCast: 0,
      totalVotersRegistered: 10000,
      timezone: data.timezone || 'Asia/Kolkata',
      createdAt: data.createdAt || nowSec,
      updatedAt: data.updatedAt || nowSec,
    };
    this.elections.set(newElection.id, newElection);
    saveElectionToFirestore(newElection).catch((err) =>
      console.warn('[ServerStore] Notice saving election to Firestore:', err.message)
    );
    return newElection;
  }

  public async createElectionAsync(data: Omit<Election, 'totalVotesCast' | 'totalVotersRegistered'>): Promise<Election> {
    const nowSec = this.getCurrentTimeSec();
    const newElection: Election = {
      ...data,
      totalVotesCast: 0,
      totalVotersRegistered: 10000,
      timezone: data.timezone || 'Asia/Kolkata',
      createdAt: data.createdAt || nowSec,
      updatedAt: data.updatedAt || nowSec,
    };
    if (isFirebaseConfigured()) {
      await saveElectionToFirestore(newElection);
    }
    this.elections.set(newElection.id, newElection);
    return newElection;
  }

  public updateElection(
    electionId: string,
    updates: Partial<Election>,
    officerId?: string
  ): { success: boolean; message: string; election?: Election } {
    const election = this.elections.get(electionId);
    if (!election) {
      return { success: false, message: 'Election record not found.' };
    }

    const norm = normalizeElectionStatus(election.status);
    if (norm !== 'DRAFT' && norm !== 'SCHEDULED') {
      return {
        success: false,
        message: 'Cannot modify election configuration after voting has commenced or concluded.',
      };
    }

    const nowSec = this.getCurrentTimeSec();
    const newStart = updates.startTime !== undefined ? Number(updates.startTime) : election.startTime;
    const newEnd = updates.endTime !== undefined ? Number(updates.endTime) : election.endTime;

    if (newEnd <= newStart) {
      return { success: false, message: 'Election closing deadline must be strictly after start time.' };
    }

    if (updates.title !== undefined) election.title = updates.title.trim();
    if (updates.description !== undefined) election.description = updates.description.trim();
    if (updates.startTime !== undefined) election.startTime = newStart;
    if (updates.endTime !== undefined) election.endTime = newEnd;
    if (updates.timezone !== undefined) election.timezone = updates.timezone;
    if (updates.constituencyIds !== undefined) election.constituencyIds = updates.constituencyIds;
    if (updates.electionType !== undefined) election.electionType = updates.electionType;
    election.updatedAt = nowSec;

    saveElectionToFirestore(election).catch((err) =>
      console.warn('[ServerStore] Notice updating election in Firestore:', err.message)
    );

    this.recordAuditEvent({
      id: `audit-update-elec-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ADMIN_ACTION',
      description: `Election configuration updated for ${election.title} (${election.id})${officerId ? ` by ${officerId}` : ''}`,
      electionId: election.numericId,
    });

    return { success: true, message: 'Election configuration updated successfully.', election };
  }

  public async updateElectionAsync(
    electionId: string,
    updates: Partial<Election>,
    officerId?: string
  ): Promise<{ success: boolean; message: string; election?: Election }> {
    const election = this.elections.get(electionId);
    if (!election) {
      return { success: false, message: 'Election record not found.' };
    }

    const norm = normalizeElectionStatus(election.status);
    if (norm !== 'DRAFT' && norm !== 'SCHEDULED') {
      return {
        success: false,
        message: 'Cannot modify election configuration after voting has commenced or concluded.',
      };
    }

    const nowSec = this.getCurrentTimeSec();
    const newStart = updates.startTime !== undefined ? Number(updates.startTime) : election.startTime;
    const newEnd = updates.endTime !== undefined ? Number(updates.endTime) : election.endTime;

    if (newEnd <= newStart) {
      return { success: false, message: 'Election closing deadline must be strictly after start time.' };
    }

    if (updates.title !== undefined) election.title = updates.title.trim();
    if (updates.description !== undefined) election.description = updates.description.trim();
    if (updates.startTime !== undefined) election.startTime = newStart;
    if (updates.endTime !== undefined) election.endTime = newEnd;
    if (updates.timezone !== undefined) election.timezone = updates.timezone;
    if (updates.constituencyIds !== undefined) election.constituencyIds = updates.constituencyIds;
    if (updates.electionType !== undefined) election.electionType = updates.electionType;
    election.updatedAt = nowSec;

    if (isFirebaseConfigured()) {
      await saveElectionToFirestore(election);
    }

    this.recordAuditEvent({
      id: `audit-update-elec-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ADMIN_ACTION',
      description: `Election configuration updated for ${election.title} (${election.id})${officerId ? ` by ${officerId}` : ''}`,
      electionId: election.numericId,
    });

    return { success: true, message: 'Election configuration updated successfully.', election };
  }

  public updateElectionStatus(
    electionId: string,
    newStatus: ElectionStatus,
    options?: { reason?: string; officerId?: string }
  ): { success: boolean; message: string; election?: Election } {
    const election = this.elections.get(electionId);
    if (!election) {
      return { success: false, message: 'Election record not found.' };
    }

    const current = election.status;
    const nowSec = this.getCurrentTimeSec();
    const normCurrent = normalizeElectionStatus(current);
    const normTarget = normalizeElectionStatus(newStatus);

    // Terminal states cannot transition
    if (normCurrent === 'CLOSED') {
      return { success: false, message: 'Concluded election is terminal and cannot transition.' };
    }
    if (normCurrent === 'CANCELLED') {
      return { success: false, message: 'Cancelled election is terminal and cannot transition.' };
    }

    // Validate lifecycle transitions
    if (!isValidElectionTransition(current, newStatus)) {
      return {
        success: false,
        message: `Illegal lifecycle transition: cannot transition election from '${String(current).toUpperCase()}' to '${String(newStatus).toUpperCase()}'.`,
      };
    }

    // Cancellation requires valid justification
    if (normTarget === 'CANCELLED') {
      const reason = options?.reason?.trim();
      if (!reason || reason.length < 5) {
        return {
          success: false,
          message: 'A valid justification reason (minimum 5 characters) is required to cancel an election.',
        };
      }
      election.cancellationReason = reason;
      election.cancelledAt = nowSec;
      if (options?.officerId) election.cancelledByOfficerId = options.officerId;
    }

    if (normTarget === 'SCHEDULED') {
      if (election.endTime <= election.startTime) {
        return { success: false, message: 'Election closing deadline must be strictly after the start time.' };
      }
      election.publishedAt = election.publishedAt || nowSec;
    }

    if (normTarget === 'OPEN') {
      if (nowSec > election.endTime) {
        return { success: false, message: 'Cannot activate election past its scheduled end time.' };
      }
      const electionCandidates = this.getAllCandidates().filter((c) =>
        election.constituencyIds ? election.constituencyIds.includes(c.constituencyId) : true
      );
      if (electionCandidates.length === 0) {
        return { success: false, message: 'Cannot activate election without nominated candidates.' };
      }
      election.openedAt = election.openedAt || nowSec;
    }

    if (normTarget === 'CLOSED') {
      election.closedAt = election.closedAt || nowSec;
    }

    // Store compatible status representation
    election.status = toLegacyElectionStatus(newStatus);
    election.updatedAt = nowSec;

    saveElectionToFirestore(election).catch((err) =>
      console.warn('[ServerStore] Notice updating election status in Firestore:', err.message)
    );

    this.recordAuditEvent({
      id: `audit-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ELECTION_STATE',
      description: `Election ${election.title} status updated from ${String(current).toUpperCase()} to ${String(newStatus).toUpperCase()}${
        options?.reason ? ` [Reason: ${options.reason}]` : ''
      }${options?.officerId ? ` by ${options.officerId}` : ''}`,
      electionId: election.numericId,
    });

    return { success: true, message: `Election state transitioned to ${newStatus}.`, election };
  }

  public async updateElectionStatusAsync(
    electionId: string,
    newStatus: ElectionStatus,
    options?: { reason?: string; officerId?: string }
  ): Promise<{ success: boolean; message: string; election?: Election }> {
    const election = this.elections.get(electionId);
    if (!election) {
      return { success: false, message: 'Election record not found.' };
    }

    const current = election.status;
    const nowSec = this.getCurrentTimeSec();
    const normCurrent = normalizeElectionStatus(current);
    const normTarget = normalizeElectionStatus(newStatus);

    if (normCurrent === 'CLOSED') {
      return { success: false, message: 'Concluded election is terminal and cannot transition.' };
    }
    if (normCurrent === 'CANCELLED') {
      return { success: false, message: 'Cancelled election is terminal and cannot transition.' };
    }

    if (!isValidElectionTransition(current, newStatus)) {
      return {
        success: false,
        message: `Illegal lifecycle transition: cannot transition election from '${String(current).toUpperCase()}' to '${String(newStatus).toUpperCase()}'.`,
      };
    }

    if (normTarget === 'CANCELLED') {
      const reason = options?.reason?.trim();
      if (!reason || reason.length < 5) {
        return {
          success: false,
          message: 'A valid justification reason (minimum 5 characters) is required to cancel an election.',
        };
      }
      election.cancellationReason = reason;
      election.cancelledAt = nowSec;
      if (options?.officerId) election.cancelledByOfficerId = options.officerId;
    }

    if (normTarget === 'SCHEDULED') {
      if (election.endTime <= election.startTime) {
        return { success: false, message: 'Election closing deadline must be strictly after the start time.' };
      }
      election.publishedAt = election.publishedAt || nowSec;
    }

    if (normTarget === 'OPEN') {
      if (nowSec > election.endTime) {
        return { success: false, message: 'Cannot activate election past its scheduled end time.' };
      }
      const electionCandidates = this.getAllCandidates().filter((c) =>
        election.constituencyIds ? election.constituencyIds.includes(c.constituencyId) : true
      );
      if (electionCandidates.length === 0) {
        return { success: false, message: 'Cannot activate election without nominated candidates.' };
      }
      election.openedAt = election.openedAt || nowSec;
    }

    if (normTarget === 'CLOSED') {
      election.closedAt = election.closedAt || nowSec;
    }

    election.status = toLegacyElectionStatus(newStatus);
    election.updatedAt = nowSec;

    if (isFirebaseConfigured()) {
      await saveElectionToFirestore(election);
    }

    this.recordAuditEvent({
      id: `audit-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ELECTION_STATE',
      description: `Election ${election.title} status updated from ${String(current).toUpperCase()} to ${String(newStatus).toUpperCase()}${
        options?.reason ? ` [Reason: ${options.reason}]` : ''
      }${options?.officerId ? ` by ${options.officerId}` : ''}`,
      electionId: election.numericId,
    });

    return { success: true, message: `Election state transitioned to ${newStatus}.`, election };
  }

  // --- Constituency Operations ---
  public getAllConstituencies(): Constituency[] {
    return Array.from(this.constituencies.values());
  }

  public getConstituencyById(id: string): Constituency | undefined {
    return this.constituencies.get(id);
  }

  public saveConstituency(c: Constituency): void {
    this.constituencies.set(c.id, c);
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

  public getCandidateById(id: string): Candidate | undefined {
    return this.candidates.get(id);
  }

  public findCandidateById(id: string): Candidate | undefined {
    return this.candidates.get(id);
  }

  public getCandidatesByConstituency(constituencyId: string): Candidate[] {
    return Array.from(this.candidates.values()).filter((c) => c.constituencyId === constituencyId);
  }

  public isCandidateLocked(candidate: { constituencyId: string; electionId?: string; voteCount?: number }): boolean {
    if ((candidate.voteCount || 0) > 0) return true;

    if (candidate.electionId) {
      const targetElec = this.getElectionById(candidate.electionId) || this.findElectionByNumericId(Number(candidate.electionId));
      if (targetElec) {
        const norm = normalizeElectionStatus(targetElec.status);
        return norm === 'OPEN' || norm === 'PAUSED' || norm === 'CLOSED' || norm === 'CANCELLED';
      }
    }

    const lockedElections = Array.from(this.elections.values()).filter((e) => {
      if (e.id === 'GE-2024' || e.isDemoElection) return false;
      const norm = normalizeElectionStatus(e.status);
      const isAssociated = e.constituencyIds ? e.constituencyIds.includes(candidate.constituencyId) : true;
      return isAssociated && (norm === 'OPEN' || norm === 'PAUSED' || norm === 'CLOSED' || norm === 'CANCELLED');
    });

    return lockedElections.length > 0;
  }

  public addCandidate(candidate: Candidate): { success: boolean; message: string; candidate?: Candidate } {
    if (this.isCandidateLocked(candidate)) {
      return {
        success: false,
        message: 'Nominations are locked: cannot add candidates while an associated election is active, concluded, or cancelled.',
      };
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

    const nowSec = this.getCurrentTimeSec();
    const candidateToSave: Candidate = {
      ...candidate,
      status: candidate.status || 'ACTIVE',
      createdAt: candidate.createdAt || nowSec,
      updatedAt: candidate.updatedAt || nowSec,
    };

    this.candidates.set(candidateToSave.id, candidateToSave);
    saveCandidateToFirestore(candidateToSave).catch((err) =>
      console.warn('[ServerStore] Notice saving candidate to Firestore:', err.message)
    );

    this.recordAuditEvent({
      id: `audit-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'CANDIDATE_REGISTERED',
      description: `Candidate nomination registered: ${candidateToSave.name} (${candidateToSave.partyName}) for ${candidateToSave.constituencyId}`,
      electionId: 1,
    });

    return { success: true, message: 'Candidate registered successfully.', candidate: candidateToSave };
  }

  public async addCandidateAsync(candidate: Candidate): Promise<{ success: boolean; message: string; candidate?: Candidate }> {
    if (this.isCandidateLocked(candidate)) {
      return {
        success: false,
        message: 'Nominations are locked: cannot add candidates while an associated election is active, concluded, or cancelled.',
      };
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

    const nowSec = this.getCurrentTimeSec();
    const candidateToSave: Candidate = {
      ...candidate,
      status: candidate.status || 'ACTIVE',
      createdAt: candidate.createdAt || nowSec,
      updatedAt: candidate.updatedAt || nowSec,
    };

    if (isFirebaseConfigured()) {
      await saveCandidateToFirestore(candidateToSave);
    }
    this.candidates.set(candidateToSave.id, candidateToSave);

    this.recordAuditEvent({
      id: `audit-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'CANDIDATE_REGISTERED',
      description: `Candidate nomination registered: ${candidateToSave.name} (${candidateToSave.partyName}) for ${candidateToSave.constituencyId}`,
      electionId: 1,
    });

    return { success: true, message: 'Candidate registered successfully.', candidate: candidateToSave };
  }

  public async saveCandidateAsync(candidate: Candidate): Promise<void> {
    this.candidates.set(candidate.id, candidate);
    if (isFirebaseConfigured()) {
      await saveCandidateToFirestore(candidate);
    }
  }


  public updateCandidate(
    candidateId: string,
    updates: Partial<Candidate>,
    officerId?: string
  ): { success: boolean; message: string; candidate?: Candidate } {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return { success: false, message: 'Candidate not found.' };
    }

    if (this.isCandidateLocked(candidate)) {
      return {
        success: false,
        message: 'Candidate nominations are locked once voting opens or concludes in an associated election, or votes have been cast.',
      };
    }

    // Validate duplicate name if changing name
    if (updates.name && updates.name.trim().toLowerCase() !== candidate.name.trim().toLowerCase()) {
      const duplicate = Array.from(this.candidates.values()).some(
        (c) =>
          c.id !== candidateId &&
          c.constituencyId === candidate.constituencyId &&
          c.name.trim().toLowerCase() === updates.name!.trim().toLowerCase()
      );
      if (duplicate) {
        return { success: false, message: 'Another candidate with this name already exists in this constituency.' };
      }
      candidate.name = updates.name.trim();
    }

    if (updates.partyName !== undefined) candidate.partyName = updates.partyName.trim();
    if (updates.partyAbbreviation !== undefined) candidate.partyAbbreviation = updates.partyAbbreviation.trim().toUpperCase();
    if (updates.symbol !== undefined) candidate.symbol = updates.symbol.trim();
    if (updates.symbolColor !== undefined) candidate.symbolColor = updates.symbolColor;
    if (updates.education !== undefined) candidate.education = updates.education.trim();
    if (updates.age !== undefined) candidate.age = Number(updates.age);
    if (updates.criminalCases !== undefined) candidate.criminalCases = Number(updates.criminalCases);
    if (updates.assets !== undefined) candidate.assets = updates.assets.trim();

    const nowSec = this.getCurrentTimeSec();
    candidate.updatedAt = nowSec;

    saveCandidateToFirestore(candidate).catch((err) =>
      console.warn('[ServerStore] Notice updating candidate in Firestore:', err.message)
    );

    this.recordAuditEvent({
      id: `audit-cand-update-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ADMIN_ACTION',
      description: `Candidate nomination updated: ${candidate.name} (${candidate.id})${officerId ? ` by ${officerId}` : ''}`,
      electionId: 1,
    });

    return { success: true, message: 'Candidate details updated successfully.', candidate };
  }

  public async updateCandidateAsync(
    candidateId: string,
    updates: Partial<Candidate>,
    officerId?: string
  ): Promise<{ success: boolean; message: string; candidate?: Candidate }> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return { success: false, message: 'Candidate not found.' };
    }

    if (this.isCandidateLocked(candidate)) {
      return {
        success: false,
        message: 'Candidate nominations are locked once voting opens or concludes in an associated election, or votes have been cast.',
      };
    }

    if (updates.name && updates.name.trim().toLowerCase() !== candidate.name.trim().toLowerCase()) {
      const duplicate = Array.from(this.candidates.values()).some(
        (c) =>
          c.id !== candidateId &&
          c.constituencyId === candidate.constituencyId &&
          c.name.trim().toLowerCase() === updates.name!.trim().toLowerCase()
      );
      if (duplicate) {
        return { success: false, message: 'Another candidate with this name already exists in this constituency.' };
      }
      candidate.name = updates.name.trim();
    }

    if (updates.partyName !== undefined) candidate.partyName = updates.partyName.trim();
    if (updates.partyAbbreviation !== undefined) candidate.partyAbbreviation = updates.partyAbbreviation.trim().toUpperCase();
    if (updates.symbol !== undefined) candidate.symbol = updates.symbol.trim();
    if (updates.symbolColor !== undefined) candidate.symbolColor = updates.symbolColor;
    if (updates.education !== undefined) candidate.education = updates.education.trim();
    if (updates.age !== undefined) candidate.age = Number(updates.age);
    if (updates.criminalCases !== undefined) candidate.criminalCases = Number(updates.criminalCases);
    if (updates.assets !== undefined) candidate.assets = updates.assets.trim();

    const nowSec = this.getCurrentTimeSec();
    candidate.updatedAt = nowSec;

    if (isFirebaseConfigured()) {
      await saveCandidateToFirestore(candidate);
    }

    this.recordAuditEvent({
      id: `audit-cand-update-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ADMIN_ACTION',
      description: `Candidate nomination updated: ${candidate.name} (${candidate.id})${officerId ? ` by ${officerId}` : ''}`,
      electionId: 1,
    });

    return { success: true, message: 'Candidate details updated successfully.', candidate };
  }

  public deleteCandidate(candidateId: string, officerId?: string): { success: boolean; message: string } {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return { success: false, message: 'Candidate not found.' };
    }

    if (this.isCandidateLocked(candidate)) {
      return {
        success: false,
        message: 'Cannot delete candidate while an associated election is active or concluded, or votes have been cast.',
      };
    }

    this.candidates.delete(candidateId);
    deleteCandidateFromFirestore(candidateId).catch((err) =>
      console.warn('[ServerStore] Notice deleting candidate from Firestore:', err.message)
    );

    const nowSec = this.getCurrentTimeSec();
    this.recordAuditEvent({
      id: `audit-cand-delete-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ADMIN_ACTION',
      description: `Candidate nomination removed: ${candidate.name} (${candidate.id}) for ${candidate.constituencyId}${officerId ? ` by ${officerId}` : ''}`,
      electionId: 1,
    });

    return { success: true, message: 'Candidate nomination removed successfully.' };
  }

  public async deleteCandidateAsync(candidateId: string, officerId?: string): Promise<{ success: boolean; message: string }> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return { success: false, message: 'Candidate not found.' };
    }

    if (this.isCandidateLocked(candidate)) {
      return {
        success: false,
        message: 'Cannot delete candidate while an associated election is active or concluded, or votes have been cast.',
      };
    }

    if (isFirebaseConfigured()) {
      await deleteCandidateFromFirestore(candidateId);
    }
    this.candidates.delete(candidateId);

    const nowSec = this.getCurrentTimeSec();
    this.recordAuditEvent({
      id: `audit-cand-delete-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ADMIN_ACTION',
      description: `Candidate nomination removed: ${candidate.name} (${candidate.id}) for ${candidate.constituencyId}${officerId ? ` by ${officerId}` : ''}`,
      electionId: 1,
    });

    return { success: true, message: 'Candidate nomination removed successfully.' };
  }

  public deactivateCandidate(
    candidateId: string,
    reason: string,
    officerId?: string
  ): { success: boolean; message: string; candidate?: Candidate } {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return { success: false, message: 'Candidate not found.' };
    }

    const trimmedReason = reason?.trim();
    if (!trimmedReason || trimmedReason.length < 5) {
      return {
        success: false,
        message: 'A valid justification reason (minimum 5 characters) is required to withdraw or deactivate a candidate.',
      };
    }

    const nowSec = this.getCurrentTimeSec();
    candidate.status = 'WITHDRAWN';
    candidate.deactivatedAt = nowSec;
    candidate.deactivatedReason = trimmedReason;
    candidate.updatedAt = nowSec;

    saveCandidateToFirestore(candidate).catch((err) =>
      console.warn('[ServerStore] Notice updating candidate status in Firestore:', err.message)
    );

    this.recordAuditEvent({
      id: `audit-cand-withdraw-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ADMIN_ACTION',
      description: `Candidate ${candidate.name} (${candidate.id}) marked WITHDRAWN. Reason: ${trimmedReason}${officerId ? ` by ${officerId}` : ''}`,
      electionId: 1,
    });

    return { success: true, message: 'Candidate nomination status updated to WITHDRAWN.', candidate };
  }

  public async deactivateCandidateAsync(
    candidateId: string,
    reason: string,
    officerId?: string
  ): Promise<{ success: boolean; message: string; candidate?: Candidate }> {
    const candidate = this.candidates.get(candidateId);
    if (!candidate) {
      return { success: false, message: 'Candidate not found.' };
    }

    const trimmedReason = reason?.trim();
    if (!trimmedReason || trimmedReason.length < 5) {
      return {
        success: false,
        message: 'A valid justification reason (minimum 5 characters) is required to withdraw or deactivate a candidate.',
      };
    }

    const nowSec = this.getCurrentTimeSec();
    candidate.status = 'WITHDRAWN';
    candidate.deactivatedAt = nowSec;
    candidate.deactivatedReason = trimmedReason;
    candidate.updatedAt = nowSec;

    if (isFirebaseConfigured()) {
      await saveCandidateToFirestore(candidate);
    }

    this.recordAuditEvent({
      id: `audit-cand-withdraw-${nowSec}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: this.getCurrentTimeMs(),
      type: 'ADMIN_ACTION',
      description: `Candidate ${candidate.name} (${candidate.id}) marked WITHDRAWN. Reason: ${trimmedReason}${officerId ? ` by ${officerId}` : ''}`,
      electionId: 1,
    });

    return { success: true, message: 'Candidate nomination status updated to WITHDRAWN.', candidate };
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
