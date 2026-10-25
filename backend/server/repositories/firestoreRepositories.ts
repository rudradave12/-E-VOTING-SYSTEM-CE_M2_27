/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { serverDb } from '../firestore';
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

export class FirestoreVoterProfileRepository implements IVoterProfileRepository {
  private col() {
    return serverDb.collection('voter_profiles');
  }

  public async findById(id: string): Promise<VoterProfile | null> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return null;
    return snap.data() as VoterProfile;
  }

  public async findBySimulationId(simulationVoterId: string): Promise<VoterProfile | null> {
    const target = simulationVoterId.trim().toUpperCase();
    const snap = await this.col().where('simulationVoterId', '==', target).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as VoterProfile;
  }

  public async findByLegacyEpic(epicId: string): Promise<VoterProfile | null> {
    const target = epicId.trim().toUpperCase();
    const snap = await this.col().where('legacyEpicId', '==', target).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as VoterProfile;
  }

  public async save(profile: VoterProfile): Promise<void> {
    const validation = validateVoterProfile(profile);
    if (!validation.isValid) {
      throw new Error(`Cannot save invalid voter profile: ${validation.errors.join('; ')}`);
    }
    await this.col().doc(profile.id).set(profile, { merge: true });
  }

  public async list(filter?: VoterProfileFilter): Promise<VoterProfile[]> {
    let query: any = this.col();
    if (filter?.constituencyId) {
      query = query.where('constituencyId', '==', filter.constituencyId);
    }
    if (filter?.registrationStatus) {
      query = query.where('registrationStatus', '==', filter.registrationStatus);
    }
    if (filter?.eligibilityStatus) {
      query = query.where('eligibilityStatus', '==', filter.eligibilityStatus);
    }
    if (filter?.limit && filter.limit > 0) {
      query = query.limit(filter.limit);
    }
    const snap = await query.get();
    return snap.docs.map((d: any) => d.data() as VoterProfile);
  }

  public async count(): Promise<number> {
    const snap = await this.col().get();
    return snap.size;
  }

  public async clear(): Promise<void> {
    const snap = await this.col().get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
}

export class FirestoreVoterParticipationRepository implements IVoterParticipationRepository {
  private col() {
    return serverDb.collection('voter_election_participation');
  }

  public async getParticipation(voterId: string, electionId: string): Promise<VoterElectionParticipation | null> {
    const docId = `${voterId}_${electionId}`;
    const snap = await this.col().doc(docId).get();
    if (!snap.exists) return null;
    return snap.data() as VoterElectionParticipation;
  }

  public async createParticipation(participation: VoterElectionParticipation): Promise<void> {
    const validation = validateElectionParticipation(participation);
    if (!validation.isValid) {
      throw new Error(`Cannot create invalid participation record: ${validation.errors.join('; ')}`);
    }

    const docId = `${participation.voterId}_${participation.electionId}`;
    const existing = await this.col().doc(docId).get();
    if (existing.exists) {
      throw new Error(
        `DUPLICATE_PARTICIPATION: Participation record already exists for voter '${participation.voterId}' in election '${participation.electionId}'.`
      );
    }

    await this.col().doc(docId).set(participation);
  }

  public async updateParticipationStatus(
    voterId: string,
    electionId: string,
    nextStatus: ParticipationStatus,
    metadata?: Partial<VoterElectionParticipation>
  ): Promise<VoterElectionParticipation> {
    const docId = `${voterId}_${electionId}`;
    const snap = await this.col().doc(docId).get();

    if (!snap.exists) {
      throw new Error(
        `PARTICIPATION_NOT_FOUND: No existing participation found for voter '${voterId}' in election '${electionId}'.`
      );
    }

    const current = snap.data() as VoterElectionParticipation;
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

    await this.col().doc(docId).set(updated, { merge: true });
    return updated;
  }

  public async listByVoter(voterId: string): Promise<VoterElectionParticipation[]> {
    const snap = await this.col().where('voterId', '==', voterId).get();
    return snap.docs.map((d: any) => d.data() as VoterElectionParticipation);
  }

  public async listByElection(electionId: string): Promise<VoterElectionParticipation[]> {
    const snap = await this.col().where('electionId', '==', electionId).get();
    return snap.docs.map((d: any) => d.data() as VoterElectionParticipation);
  }

  public async clear(): Promise<void> {
    const snap = await this.col().get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
}

export class FirestoreBiometricMetadataRepository implements IBiometricMetadataRepository {
  private col() {
    return serverDb.collection('biometric_enrollments');
  }

  public async getMetadata(voterId: string, modality: BiometricModality): Promise<BiometricEnrollmentMetadata | null> {
    const docId = `bio_${voterId}_${modality.toLowerCase()}`;
    const snap = await this.col().doc(docId).get();
    if (!snap.exists) return null;
    return snap.data() as BiometricEnrollmentMetadata;
  }

  public async saveMetadata(metadata: BiometricEnrollmentMetadata): Promise<void> {
    const validation = validateBiometricMetadata(metadata);
    if (!validation.isValid) {
      throw new Error(`Cannot save invalid biometric metadata: ${validation.errors.join('; ')}`);
    }
    const docId = `bio_${metadata.voterId}_${metadata.modality.toLowerCase()}`;
    await this.col().doc(docId).set(metadata, { merge: true });
  }

  public async listByVoter(voterId: string): Promise<BiometricEnrollmentMetadata[]> {
    const snap = await this.col().where('voterId', '==', voterId).get();
    return snap.docs.map((d: any) => d.data() as BiometricEnrollmentMetadata);
  }

  public async clear(): Promise<void> {
    const snap = await this.col().get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
}

export class FirestoreBallotMetadataRepository implements IBallotMetadataRepository {
  private col() {
    return serverDb.collection('ballots');
  }

  public async saveBallot(ballot: AnonymousBallotRecord): Promise<void> {
    const validation = validateAnonymousBallot(ballot);
    if (!validation.isValid) {
      throw new Error(`Cannot save invalid anonymous ballot: ${validation.errors.join('; ')}`);
    }
    await this.col().doc(ballot.id).set(ballot);
  }

  public async getBallotById(id: string): Promise<AnonymousBallotRecord | null> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return null;
    return snap.data() as AnonymousBallotRecord;
  }

  public async listByElection(electionId: string): Promise<AnonymousBallotRecord[]> {
    const snap = await this.col().where('electionId', '==', electionId).get();
    return snap.docs.map((d: any) => d.data() as AnonymousBallotRecord);
  }

  public async countByElection(electionId: string): Promise<number> {
    const snap = await this.col().where('electionId', '==', electionId).get();
    return snap.size;
  }

  public async clear(): Promise<void> {
    const snap = await this.col().get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
}

export class FirestoreAuthorityAccountRepository implements IAuthorityAccountRepository {
  private col() {
    return serverDb.collection('authority_accounts');
  }

  public async getAccount(id: string): Promise<AuthorityAccount | null> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return null;
    return snap.data() as AuthorityAccount;
  }

  public async findByEmail(email: string): Promise<AuthorityAccount | null> {
    const target = email.trim().toLowerCase();
    const snap = await this.col().where('email', '==', target).limit(1).get();
    if (snap.empty) return null;
    return snap.docs[0].data() as AuthorityAccount;
  }

  public async saveAccount(account: AuthorityAccount): Promise<void> {
    const validation = validateAuthorityAccount(account);
    if (!validation.isValid) {
      throw new Error(`Cannot save invalid authority account: ${validation.errors.join('; ')}`);
    }
    await this.col().doc(account.id).set(account, { merge: true });
  }

  public async listAccounts(role?: AuthorityRole): Promise<AuthorityAccount[]> {
    let query: any = this.col();
    if (role) {
      query = query.where('role', '==', role);
    }
    const snap = await query.get();
    return snap.docs.map((d: any) => d.data() as AuthorityAccount);
  }

  public async clear(): Promise<void> {
    const snap = await this.col().get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
}

export class FirestoreAuditEventRepository implements IAuditEventRepository {
  private col() {
    return serverDb.collection('audit_events');
  }

  public async appendEvent(event: StructuredAuditEvent): Promise<void> {
    const validation = validateStructuredAuditEvent(event);
    if (!validation.isValid) {
      throw new Error(`Cannot append invalid audit event: ${validation.errors.join('; ')}`);
    }
    await this.col().doc(event.id).set(event);
  }

  public async getEvents(filter?: AuditEventFilter): Promise<StructuredAuditEvent[]> {
    let query: any = this.col();
    if (filter?.electionId) {
      query = query.where('electionId', '==', filter.electionId);
    }
    const snap = await query.get();
    let events = snap.docs.map((d: any) => d.data() as StructuredAuditEvent);
    if (filter?.category) {
      events = events.filter((e: StructuredAuditEvent) => e.target?.category === filter.category);
    }
    events.sort((a: StructuredAuditEvent, b: StructuredAuditEvent) => b.timestamp - a.timestamp);
    if (filter?.limit && filter.limit > 0) {
      events = events.slice(0, filter.limit);
    }
    return events;
  }

  public async clear(): Promise<void> {
    const snap = await this.col().get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
}

export class FirestoreManualIdExceptionRepository implements IManualIdExceptionRepository {
  private col() {
    return serverDb.collection('manual_id_exceptions');
  }

  public async createRequest(request: ManualIdExceptionRecord): Promise<void> {
    const validation = validateManualIdException(request);
    if (!validation.isValid) {
      throw new Error(`Cannot create invalid exception request: ${validation.errors.join('; ')}`);
    }
    const existingPending = await this.findPending(
      request.voterId,
      request.purpose,
      request.purpose === 'ENROLLMENT' ? request.modality : request.electionId
    );
    if (existingPending) {
      throw new Error(`A pending exception request already exists for this voter and scope: ${existingPending.id}`);
    }
    await this.col().doc(request.id).set(request);
  }

  public async findById(id: string): Promise<ManualIdExceptionRecord | null> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return null;
    return snap.data() as ManualIdExceptionRecord;
  }

  public async findPending(
    voterId: string,
    purpose: ExceptionPurpose,
    modalityOrElectionId?: string
  ): Promise<ManualIdExceptionRecord | null> {
    const snap = await this.col()
      .where('voterId', '==', voterId)
      .where('status', '==', 'PENDING')
      .where('purpose', '==', purpose)
      .get();
    for (const doc of snap.docs) {
      const data = doc.data() as ManualIdExceptionRecord;
      if (purpose === 'ENROLLMENT') {
        if (!modalityOrElectionId || data.modality === modalityOrElectionId) {
          return data;
        }
      } else if (purpose === 'VOTING_SESSION') {
        if (!modalityOrElectionId || data.electionId === modalityOrElectionId) {
          return data;
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
    const docRef = this.col().doc(request.id);
    const snap = await docRef.get();
    if (!snap.exists) {
      throw new Error(`Exception request not found: ${request.id}`);
    }
    await docRef.set(request, { merge: true });
  }

  public async list(filter?: ExceptionFilter): Promise<ManualIdExceptionRecord[]> {
    let query: any = this.col();
    if (filter?.voterId) {
      query = query.where('voterId', '==', filter.voterId);
    }
    if (filter?.constituencyId) {
      query = query.where('constituencyId', '==', filter.constituencyId);
    }
    if (filter?.purpose) {
      query = query.where('purpose', '==', filter.purpose);
    }
    if (filter?.status) {
      query = query.where('status', '==', filter.status);
    }
    if (filter?.electionId) {
      query = query.where('electionId', '==', filter.electionId);
    }
    const snap = await query.get();
    let result = snap.docs.map((d: any) => d.data() as ManualIdExceptionRecord);
    result.sort((a: ManualIdExceptionRecord, b: ManualIdExceptionRecord) => b.requestedAt - a.requestedAt);
    if (filter?.limit && filter.limit > 0) {
      result = result.slice(0, filter.limit);
    }
    return result;
  }

  public async clear(): Promise<void> {
    const snap = await this.col().get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
}

export class FirestoreHistoricalArchiveRepository implements IHistoricalArchiveRepository {
  private col() {
    return serverDb.collection('historical_archive');
  }

  public async findById(id: string): Promise<HistoricalElectionRecord | null> {
    const snap = await this.col().doc(id).get();
    if (!snap.exists) return null;
    return snap.data() as HistoricalElectionRecord;
  }

  public async save(record: HistoricalElectionRecord): Promise<void> {
    const validation = validateHistoricalElectionRecord(record);
    if (!validation.valid) {
      throw new Error(`Invalid historical election record: ${validation.errors.join('; ')}`);
    }
    await this.col().doc(record.id).set(record);
  }

  public async list(query?: HistoricalArchiveQuery): Promise<{ records: HistoricalElectionRecord[]; total: number }> {
    let q: any = this.col();

    if (query?.year) {
      q = q.where('year', '==', Number(query.year));
    }
    if (query?.electionType) {
      q = q.where('electionType', '==', String(query.electionType).toUpperCase());
    }
    if (query?.verificationStatus) {
      q = q.where('verificationStatus', '==', query.verificationStatus);
    }

    const snap = await q.get();
    let result: HistoricalElectionRecord[] = snap.docs.map((d: any): HistoricalElectionRecord => d.data() as HistoricalElectionRecord);

    if (query?.state && query.state !== 'ALL') {
      const targetState = query.state.toLowerCase();
      result = result.filter(
        (r: HistoricalElectionRecord) =>
          Boolean(r.state && r.state.toLowerCase().includes(targetState)) ||
          r.constituencyResults.some((c: any) => c.state.toLowerCase().includes(targetState))
      );
    }

    if (query?.query) {
      const term = query.query.toLowerCase().trim();
      result = result.filter((r: HistoricalElectionRecord) => {
        if (r.electionName.toLowerCase().includes(term)) return true;
        if (r.state && r.state.toLowerCase().includes(term)) return true;
        if (String(r.year).includes(term)) return true;
        return r.constituencyResults.some(
          (c: any) =>
            c.constituencyName.toLowerCase().includes(term) ||
            c.constituencyCode.toLowerCase().includes(term) ||
            (c.winnerName && c.winnerName.toLowerCase().includes(term)) ||
            (c.winnerParty && c.winnerParty.toLowerCase().includes(term)) ||
            c.candidates.some(
              (cand: any) =>
                cand.candidateName.toLowerCase().includes(term) ||
                cand.partyName.toLowerCase().includes(term) ||
                cand.partyAbbreviation.toLowerCase().includes(term)
            )
        );
      });
    }

    result.sort((a: HistoricalElectionRecord, b: HistoricalElectionRecord) => b.year - a.year);
    const total = result.length;

    const page = Math.max(1, Number(query?.page) || 1);
    const limit = Math.max(1, Math.min(100, Number(query?.limit) || 10));
    const offset = (page - 1) * limit;

    const paginated = result.slice(offset, offset + limit);
    return { records: paginated, total };
  }

  public async findConstituency(
    electionId: string,
    constituencyCodeOrId: string
  ): Promise<HistoricalConstituencyResult | null> {
    const election = await this.findById(electionId);
    if (!election) return null;
    const match = election.constituencyResults.find(
      (c) =>
        c.constituencyId === constituencyCodeOrId ||
        c.constituencyCode === constituencyCodeOrId ||
        c.constituencyName.toLowerCase() === constituencyCodeOrId.toLowerCase()
    );
    return match || null;
  }

  public async count(): Promise<number> {
    const snap = await this.col().get();
    return snap.size;
  }

  public async clear(): Promise<void> {
    const snap = await this.col().get();
    for (const doc of snap.docs) {
      await doc.ref.delete();
    }
  }
}

export function createFirestoreRepositories(): IDataRepositories {
  return {
    voterProfiles: new FirestoreVoterProfileRepository(),
    participations: new FirestoreVoterParticipationRepository(),
    biometrics: new FirestoreBiometricMetadataRepository(),
    ballots: new FirestoreBallotMetadataRepository(),
    authorities: new FirestoreAuthorityAccountRepository(),
    auditEvents: new FirestoreAuditEventRepository(),
    exceptions: new FirestoreManualIdExceptionRepository(),
    historicalArchive: new FirestoreHistoricalArchiveRepository(),
  };
}
