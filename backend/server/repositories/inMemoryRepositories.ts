/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  VoterProfile,
  VoterElectionParticipation,
  ParticipationStatus,
  BiometricEnrollmentMetadata,
  BiometricModality,
  AnonymousBallotRecord,
  AuthorityAccount,
  AuthorityRole,
  StructuredAuditEvent,
  ManualIdExceptionRecord,
  ExceptionPurpose,
  ExceptionStatus,
  validateVoterProfile,
  validateElectionParticipation,
  validateBiometricMetadata,
  validateAnonymousBallot,
  validateAuthorityAccount,
  validateStructuredAuditEvent,
  validateManualIdException,
  isValidParticipationTransition,
} from '../../../frontend/src/types/dataModel';
import {
  IVoterProfileRepository,
  IVoterParticipationRepository,
  IBiometricMetadataRepository,
  IBallotMetadataRepository,
  IAuthorityAccountRepository,
  IAuditEventRepository,
  IManualIdExceptionRepository,
  IDataRepositories,
  VoterProfileFilter,
  AuditEventFilter,
  ExceptionFilter,
  IHistoricalArchiveRepository,
} from './types';
import {
  HistoricalElectionRecord,
  HistoricalConstituencyResult,
  HistoricalArchiveQuery,
  validateHistoricalElectionRecord,
} from '../../../frontend/src/types/archive';

export class InMemoryVoterProfileRepository implements IVoterProfileRepository {
  private profiles = new Map<string, VoterProfile>();

  public async findById(id: string): Promise<VoterProfile | null> {
    const found = this.profiles.get(id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async findBySimulationId(simulationVoterId: string): Promise<VoterProfile | null> {
    const target = simulationVoterId.trim().toUpperCase();
    for (const p of this.profiles.values()) {
      if (p.simulationVoterId.toUpperCase() === target) {
        return JSON.parse(JSON.stringify(p));
      }
    }
    return null;
  }

  public async findByLegacyEpic(epicId: string): Promise<VoterProfile | null> {
    const target = epicId.trim().toUpperCase();
    for (const p of this.profiles.values()) {
      if (p.legacyEpicId && p.legacyEpicId.toUpperCase() === target) {
        return JSON.parse(JSON.stringify(p));
      }
    }
    return null;
  }

  public async save(profile: VoterProfile): Promise<void> {
    const validation = validateVoterProfile(profile);
    if (!validation.isValid) {
      throw new Error(`Cannot save invalid voter profile: ${validation.errors.join('; ')}`);
    }
    this.profiles.set(profile.id, JSON.parse(JSON.stringify(profile)));
  }

  public async list(filter?: VoterProfileFilter): Promise<VoterProfile[]> {
    let result = Array.from(this.profiles.values());
    if (filter?.constituencyId) {
      result = result.filter((p) => p.constituencyId === filter.constituencyId);
    }
    if (filter?.registrationStatus) {
      result = result.filter((p) => p.registrationStatus === filter.registrationStatus);
    }
    if (filter?.eligibilityStatus) {
      result = result.filter((p) => p.eligibilityStatus === filter.eligibilityStatus);
    }
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }
    return result.map((p) => JSON.parse(JSON.stringify(p)));
  }

  public async count(): Promise<number> {
    return this.profiles.size;
  }

  public async clear(): Promise<void> {
    this.profiles.clear();
  }
}

export class InMemoryVoterParticipationRepository implements IVoterParticipationRepository {
  // Keyed by `${voterId}_${electionId}`
  private participations = new Map<string, VoterElectionParticipation>();

  public async getParticipation(voterId: string, electionId: string): Promise<VoterElectionParticipation | null> {
    const key = `${voterId}_${electionId}`;
    const found = this.participations.get(key);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async createParticipation(participation: VoterElectionParticipation): Promise<void> {
    const validation = validateElectionParticipation(participation);
    if (!validation.isValid) {
      throw new Error(`Cannot create invalid participation record: ${validation.errors.join('; ')}`);
    }

    const key = `${participation.voterId}_${participation.electionId}`;
    if (this.participations.has(key)) {
      throw new Error(
        `DUPLICATE_PARTICIPATION: Participation record already exists for voter '${participation.voterId}' in election '${participation.electionId}'.`
      );
    }

    this.participations.set(key, JSON.parse(JSON.stringify(participation)));
  }

  public async updateParticipationStatus(
    voterId: string,
    electionId: string,
    nextStatus: ParticipationStatus,
    metadata?: Partial<VoterElectionParticipation>
  ): Promise<VoterElectionParticipation> {
    const key = `${voterId}_${electionId}`;
    const current = this.participations.get(key);

    if (!current) {
      throw new Error(
        `PARTICIPATION_NOT_FOUND: No existing participation found for voter '${voterId}' in election '${electionId}'.`
      );
    }

    if (!isValidParticipationTransition(current.status, nextStatus)) {
      throw new Error(
        `ILLEGAL_STATE_TRANSITION: Cannot transition participation for voter '${voterId}' in election '${electionId}' from '${current.status}' to '${nextStatus}'.`
      );
    }

    const updated: VoterElectionParticipation = {
      ...current,
      ...metadata,
      status: nextStatus,
      updatedAt: Date.now(),
    };

    if (nextStatus === 'VOTE_ACCEPTED' && !updated.votedAt) {
      updated.votedAt = Date.now();
    }

    const validation = validateElectionParticipation(updated);
    if (!validation.isValid) {
      throw new Error(`Updated participation record is invalid: ${validation.errors.join('; ')}`);
    }

    this.participations.set(key, JSON.parse(JSON.stringify(updated)));
    return JSON.parse(JSON.stringify(updated));
  }

  public async listByVoter(voterId: string): Promise<VoterElectionParticipation[]> {
    const matched: VoterElectionParticipation[] = [];
    for (const p of this.participations.values()) {
      if (p.voterId === voterId) {
        matched.push(JSON.parse(JSON.stringify(p)));
      }
    }
    return matched;
  }

  public async listByElection(electionId: string): Promise<VoterElectionParticipation[]> {
    const matched: VoterElectionParticipation[] = [];
    for (const p of this.participations.values()) {
      if (p.electionId === electionId) {
        matched.push(JSON.parse(JSON.stringify(p)));
      }
    }
    return matched;
  }

  public async clear(): Promise<void> {
    this.participations.clear();
  }
}

export class InMemoryBiometricMetadataRepository implements IBiometricMetadataRepository {
  // Keyed by `bio_${voterId}_${modality.toLowerCase()}`
  private metadataMap = new Map<string, BiometricEnrollmentMetadata>();

  public async getMetadata(voterId: string, modality: BiometricModality): Promise<BiometricEnrollmentMetadata | null> {
    const key = `bio_${voterId}_${modality.toLowerCase()}`;
    const found = this.metadataMap.get(key);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async saveMetadata(metadata: BiometricEnrollmentMetadata): Promise<void> {
    const validation = validateBiometricMetadata(metadata);
    if (!validation.isValid) {
      throw new Error(`Cannot save invalid biometric metadata: ${validation.errors.join('; ')}`);
    }
    const key = `bio_${metadata.voterId}_${metadata.modality.toLowerCase()}`;
    this.metadataMap.set(key, JSON.parse(JSON.stringify(metadata)));
  }

  public async listByVoter(voterId: string): Promise<BiometricEnrollmentMetadata[]> {
    const results: BiometricEnrollmentMetadata[] = [];
    for (const m of this.metadataMap.values()) {
      if (m.voterId === voterId) {
        results.push(JSON.parse(JSON.stringify(m)));
      }
    }
    return results;
  }

  public async clear(): Promise<void> {
    this.metadataMap.clear();
  }
}

export class InMemoryBallotMetadataRepository implements IBallotMetadataRepository {
  private ballots = new Map<string, AnonymousBallotRecord>();

  public async saveBallot(ballot: AnonymousBallotRecord): Promise<void> {
    const validation = validateAnonymousBallot(ballot);
    if (!validation.isValid) {
      throw new Error(`Cannot save invalid anonymous ballot: ${validation.errors.join('; ')}`);
    }
    this.ballots.set(ballot.id, JSON.parse(JSON.stringify(ballot)));
  }

  public async getBallotById(id: string): Promise<AnonymousBallotRecord | null> {
    const found = this.ballots.get(id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async listByElection(electionId: string): Promise<AnonymousBallotRecord[]> {
    const results: AnonymousBallotRecord[] = [];
    for (const b of this.ballots.values()) {
      if (b.electionId === electionId) {
        results.push(JSON.parse(JSON.stringify(b)));
      }
    }
    return results;
  }

  public async countByElection(electionId: string): Promise<number> {
    let count = 0;
    for (const b of this.ballots.values()) {
      if (b.electionId === electionId) count++;
    }
    return count;
  }

  public async clear(): Promise<void> {
    this.ballots.clear();
  }
}

export class InMemoryAuthorityAccountRepository implements IAuthorityAccountRepository {
  private accounts = new Map<string, AuthorityAccount>();

  public async getAccount(id: string): Promise<AuthorityAccount | null> {
    const found = this.accounts.get(id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async findByEmail(email: string): Promise<AuthorityAccount | null> {
    const target = email.trim().toLowerCase();
    for (const a of this.accounts.values()) {
      if (a.email.toLowerCase() === target) {
        return JSON.parse(JSON.stringify(a));
      }
    }
    return null;
  }

  public async saveAccount(account: AuthorityAccount): Promise<void> {
    const validation = validateAuthorityAccount(account);
    if (!validation.isValid) {
      throw new Error(`Cannot save invalid authority account: ${validation.errors.join('; ')}`);
    }
    this.accounts.set(account.id, JSON.parse(JSON.stringify(account)));
  }

  public async listAccounts(role?: AuthorityRole): Promise<AuthorityAccount[]> {
    let results = Array.from(this.accounts.values());
    if (role) {
      results = results.filter((a) => a.role === role);
    }
    return results.map((a) => JSON.parse(JSON.stringify(a)));
  }

  public async clear(): Promise<void> {
    this.accounts.clear();
  }
}

export class InMemoryAuditEventRepository implements IAuditEventRepository {
  private events: StructuredAuditEvent[] = [];

  public async appendEvent(event: StructuredAuditEvent): Promise<void> {
    const validation = validateStructuredAuditEvent(event);
    if (!validation.isValid) {
      throw new Error(`Cannot append invalid audit event: ${validation.errors.join('; ')}`);
    }
    this.events.push(JSON.parse(JSON.stringify(event)));
  }

  public async getEvents(filter?: AuditEventFilter): Promise<StructuredAuditEvent[]> {
    let results = [...this.events];
    if (filter?.electionId) {
      results = results.filter((e) => e.electionId === filter.electionId);
    }
    if (filter?.category) {
      results = results.filter((e) => e.target.category === filter.category);
    }
    // Return newest first
    results.sort((a, b) => b.timestamp - a.timestamp);
    if (filter?.limit && filter.limit > 0) {
      results = results.slice(0, filter.limit);
    }
    return results.map((e) => JSON.parse(JSON.stringify(e)));
  }

  public async clear(): Promise<void> {
    this.events = [];
  }
}

export class InMemoryManualIdExceptionRepository implements IManualIdExceptionRepository {
  private requests = new Map<string, ManualIdExceptionRecord>();

  public async createRequest(request: ManualIdExceptionRecord): Promise<void> {
    const validation = validateManualIdException(request);
    if (!validation.isValid) {
      throw new Error(`Cannot create invalid exception request: ${validation.errors.join('; ')}`);
    }
    // Check for duplicate pending request for same voter and purpose
    const existingPending = await this.findPending(
      request.voterId,
      request.purpose,
      request.purpose === 'ENROLLMENT' ? request.modality : request.electionId
    );
    if (existingPending) {
      throw new Error(`A pending exception request already exists for this voter and scope: ${existingPending.id}`);
    }
    this.requests.set(request.id, JSON.parse(JSON.stringify(request)));
  }

  public async findById(id: string): Promise<ManualIdExceptionRecord | null> {
    const found = this.requests.get(id);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  public async findPending(
    voterId: string,
    purpose: ExceptionPurpose,
    modalityOrElectionId?: string
  ): Promise<ManualIdExceptionRecord | null> {
    for (const req of this.requests.values()) {
      if (req.voterId === voterId && req.status === 'PENDING' && req.purpose === purpose) {
        if (purpose === 'ENROLLMENT') {
          if (!modalityOrElectionId || req.modality === modalityOrElectionId) {
            return JSON.parse(JSON.stringify(req));
          }
        } else if (purpose === 'VOTING_SESSION') {
          if (!modalityOrElectionId || req.electionId === modalityOrElectionId) {
            return JSON.parse(JSON.stringify(req));
          }
        }
      }
    }
    return null;
  }

  public async update(request: ManualIdExceptionRecord): Promise<void> {
    const validation = validateManualIdException(request);
    if (!validation.isValid) {
      throw new Error(`Cannot update invalid exception request: ${validation.errors.join('; ')}`);
    }
    if (!this.requests.has(request.id)) {
      throw new Error(`Exception request not found: ${request.id}`);
    }
    this.requests.set(request.id, JSON.parse(JSON.stringify(request)));
  }

  public async list(filter?: ExceptionFilter): Promise<ManualIdExceptionRecord[]> {
    let result = Array.from(this.requests.values());
    if (filter?.voterId) {
      result = result.filter((r) => r.voterId === filter.voterId);
    }
    if (filter?.constituencyId) {
      result = result.filter((r) => r.constituencyId === filter.constituencyId);
    }
    if (filter?.purpose) {
      result = result.filter((r) => r.purpose === filter.purpose);
    }
    if (filter?.status) {
      result = result.filter((r) => r.status === filter.status);
    }
    if (filter?.electionId) {
      result = result.filter((r) => r.electionId === filter.electionId);
    }
    result.sort((a, b) => b.requestedAt - a.requestedAt);
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }
    return result.map((r) => JSON.parse(JSON.stringify(r)));
  }

  public async clear(): Promise<void> {
    this.requests.clear();
  }
}

export class InMemoryHistoricalArchiveRepository implements IHistoricalArchiveRepository {
  private records = new Map<string, HistoricalElectionRecord>();

  public async findById(id: string): Promise<HistoricalElectionRecord | null> {
    const record = this.records.get(id);
    if (!record) return null;
    return JSON.parse(JSON.stringify(record));
  }

  public async save(record: HistoricalElectionRecord): Promise<void> {
    const validation = validateHistoricalElectionRecord(record);
    if (!validation.valid) {
      throw new Error(`Invalid historical election record: ${validation.errors.join('; ')}`);
    }
    this.records.set(record.id, JSON.parse(JSON.stringify(record)));
  }

  public async list(query?: HistoricalArchiveQuery): Promise<{ records: HistoricalElectionRecord[]; total: number }> {
    let result = Array.from(this.records.values());

    if (query?.year) {
      result = result.filter((r) => r.year === Number(query.year));
    }
    if (query?.electionType) {
      const targetType = String(query.electionType).toUpperCase();
      result = result.filter((r) => r.electionType.toUpperCase() === targetType);
    }
    if (query?.state && query.state !== 'ALL') {
      const targetState = query.state.toLowerCase();
      result = result.filter(
        (r) =>
          (r.state && r.state.toLowerCase().includes(targetState)) ||
          r.constituencyResults.some((c) => c.state.toLowerCase().includes(targetState))
      );
    }
    if (query?.verificationStatus) {
      result = result.filter((r) => r.verificationStatus === query.verificationStatus);
    }
    if (query?.query) {
      const q = query.query.toLowerCase().trim();
      result = result.filter((r) => {
        if (r.electionName.toLowerCase().includes(q)) return true;
        if (r.state && r.state.toLowerCase().includes(q)) return true;
        if (String(r.year).includes(q)) return true;
        return r.constituencyResults.some(
          (c) =>
            c.constituencyName.toLowerCase().includes(q) ||
            c.constituencyCode.toLowerCase().includes(q) ||
            (c.winnerName && c.winnerName.toLowerCase().includes(q)) ||
            (c.winnerParty && c.winnerParty.toLowerCase().includes(q)) ||
            c.candidates.some(
              (cand) =>
                cand.candidateName.toLowerCase().includes(q) ||
                cand.partyName.toLowerCase().includes(q) ||
                cand.partyAbbreviation.toLowerCase().includes(q)
            )
        );
      });
    }

    result.sort((a, b) => b.year - a.year);
    const total = result.length;

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 10));
    const offset = (page - 1) * limit;

    const paginated = result.slice(offset, offset + limit);
    return {
      records: paginated.map((r) => JSON.parse(JSON.stringify(r))),
      total,
    };
  }

  public async findConstituency(
    electionId: string,
    constituencyCodeOrId: string
  ): Promise<HistoricalConstituencyResult | null> {
    const election = this.records.get(electionId);
    if (!election) return null;
    const match = election.constituencyResults.find(
      (c) =>
        c.constituencyId === constituencyCodeOrId ||
        c.constituencyCode === constituencyCodeOrId ||
        c.constituencyName.toLowerCase() === constituencyCodeOrId.toLowerCase()
    );
    return match ? JSON.parse(JSON.stringify(match)) : null;
  }

  public async count(): Promise<number> {
    return this.records.size;
  }

  public async clear(): Promise<void> {
    this.records.clear();
  }
}

export function createInMemoryRepositories(): IDataRepositories {
  return {
    voterProfiles: new InMemoryVoterProfileRepository(),
    participations: new InMemoryVoterParticipationRepository(),
    biometrics: new InMemoryBiometricMetadataRepository(),
    ballots: new InMemoryBallotMetadataRepository(),
    authorities: new InMemoryAuthorityAccountRepository(),
    auditEvents: new InMemoryAuditEventRepository(),
    exceptions: new InMemoryManualIdExceptionRepository(),
    historicalArchive: new InMemoryHistoricalArchiveRepository(),
  };
}
