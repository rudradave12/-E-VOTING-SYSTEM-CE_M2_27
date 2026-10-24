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
  validateVoterProfile,
  validateElectionParticipation,
  validateBiometricMetadata,
  validateAnonymousBallot,
  validateAuthorityAccount,
  validateStructuredAuditEvent,
  isValidParticipationTransition,
} from '../../src/types/dataModel';
import {
  IVoterProfileRepository,
  IVoterParticipationRepository,
  IBiometricMetadataRepository,
  IBallotMetadataRepository,
  IAuthorityAccountRepository,
  IAuditEventRepository,
  IDataRepositories,
  VoterProfileFilter,
  AuditEventFilter,
} from './types';

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

export function createInMemoryRepositories(): IDataRepositories {
  return {
    voterProfiles: new InMemoryVoterProfileRepository(),
    participations: new InMemoryVoterParticipationRepository(),
    biometrics: new InMemoryBiometricMetadataRepository(),
    ballots: new InMemoryBallotMetadataRepository(),
    authorities: new InMemoryAuthorityAccountRepository(),
    auditEvents: new InMemoryAuditEventRepository(),
  };
}
