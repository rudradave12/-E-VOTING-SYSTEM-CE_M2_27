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
  AuditTargetCategory,
  VoterRegistrationStatus,
  VoterEligibilityStatus,
} from '../../src/types/dataModel';

export interface VoterProfileFilter {
  constituencyId?: string;
  registrationStatus?: VoterRegistrationStatus;
  eligibilityStatus?: VoterEligibilityStatus;
  limit?: number;
}

export interface IVoterProfileRepository {
  findById(id: string): Promise<VoterProfile | null>;
  findBySimulationId(simulationVoterId: string): Promise<VoterProfile | null>;
  findByLegacyEpic(epicId: string): Promise<VoterProfile | null>;
  save(profile: VoterProfile): Promise<void>;
  list(filter?: VoterProfileFilter): Promise<VoterProfile[]>;
  count(): Promise<number>;
  clear(): Promise<void>;
}

export interface IVoterParticipationRepository {
  getParticipation(voterId: string, electionId: string): Promise<VoterElectionParticipation | null>;
  createParticipation(participation: VoterElectionParticipation): Promise<void>;
  updateParticipationStatus(
    voterId: string,
    electionId: string,
    nextStatus: ParticipationStatus,
    metadata?: Partial<VoterElectionParticipation>
  ): Promise<VoterElectionParticipation>;
  listByVoter(voterId: string): Promise<VoterElectionParticipation[]>;
  listByElection(electionId: string): Promise<VoterElectionParticipation[]>;
  clear(): Promise<void>;
}

export interface IBiometricMetadataRepository {
  getMetadata(voterId: string, modality: BiometricModality): Promise<BiometricEnrollmentMetadata | null>;
  saveMetadata(metadata: BiometricEnrollmentMetadata): Promise<void>;
  listByVoter(voterId: string): Promise<BiometricEnrollmentMetadata[]>;
  clear(): Promise<void>;
}

export interface IBallotMetadataRepository {
  saveBallot(ballot: AnonymousBallotRecord): Promise<void>;
  getBallotById(id: string): Promise<AnonymousBallotRecord | null>;
  listByElection(electionId: string): Promise<AnonymousBallotRecord[]>;
  countByElection(electionId: string): Promise<number>;
  clear(): Promise<void>;
}

export interface IAuthorityAccountRepository {
  getAccount(id: string): Promise<AuthorityAccount | null>;
  findByEmail(email: string): Promise<AuthorityAccount | null>;
  saveAccount(account: AuthorityAccount): Promise<void>;
  listAccounts(role?: AuthorityRole): Promise<AuthorityAccount[]>;
  clear(): Promise<void>;
}

export interface AuditEventFilter {
  electionId?: string;
  category?: AuditTargetCategory;
  limit?: number;
}

export interface IAuditEventRepository {
  appendEvent(event: StructuredAuditEvent): Promise<void>;
  getEvents(filter?: AuditEventFilter): Promise<StructuredAuditEvent[]>;
  clear(): Promise<void>;
}

export interface IDataRepositories {
  voterProfiles: IVoterProfileRepository;
  participations: IVoterParticipationRepository;
  biometrics: IBiometricMetadataRepository;
  ballots: IBallotMetadataRepository;
  authorities: IAuthorityAccountRepository;
  auditEvents: IAuditEventRepository;
}
