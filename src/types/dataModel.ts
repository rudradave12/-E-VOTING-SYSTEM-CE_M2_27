/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * BlockBallot — Phase 02 Data Model Definitions & Validators
 *
 * Establishes a versioned backend data model separating:
 * 1. Voter Identity (VoterProfile)
 * 2. Biometric Enrollment Metadata (BiometricEnrollmentMetadata)
 * 3. Election-Specific Participation (VoterElectionParticipation)
 * 4. Anonymous Ballot & Receipt Metadata (AnonymousBallotRecord)
 * 5. Authority Account Metadata (AuthorityAccount)
 * 6. Structured Security Audit Events (StructuredAuditEvent)
 *
 * CRITICAL PRIVACY & SECURITY INVARIANTS:
 * - NO raw biometric bytes, templates, minutiae, or continuous video streams.
 * - Voter identity records NEVER embed candidate selections or transaction calldata.
 * - Anonymous ballot records NEVER embed voter demographic or biometric references.
 * - Elector participation is tracked INDEPENDENTLY per election.
 * - Manual exception approval is strictly distinguished from successful biometric verification.
 */

export const SCHEMA_VERSION_LEGACY = '1.0';
export const SCHEMA_VERSION_CURRENT = '2.0';

// ============================================================================
// 1. VOTER PROFILE (REUSABLE SIMULATION IDENTITY)
// ============================================================================

export type VoterRegistrationStatus =
  | 'PENDING_VERIFICATION'
  | 'REGISTERED'
  | 'SUSPENDED'
  | 'DE_REGISTERED';

export type VoterEligibilityStatus =
  | 'ELIGIBLE'
  | 'INELIGIBLE_AGE'
  | 'INELIGIBLE_DISQUALIFIED'
  | 'INELIGIBLE_DECEASED';

export type VoterLifecycleStatusV2 = 'ACTIVE' | 'ARCHIVED' | 'LOCKED';

export interface VoterProfile {
  id: string; // Server-generated internal record identifier (e.g. vpr_...)
  simulationVoterId: string; // Public simulation voter ID (e.g. SIM-DL-2026-0001, generated server-side in Phase 04)
  legacyEpicId?: string; // Optional legacy EPIC identifier for migration traceability
  fullName: string;
  dateOfBirth: string; // Canonical ISO 8601 representation (YYYY-MM-DD)
  gender: 'M' | 'F' | 'O';
  state: string;
  district: string;
  constituencyId: string;
  pollingStation: string;
  maskedMobile: string; // Masked mobile (e.g. +91 98XXX-XX341)
  registrationStatus: VoterRegistrationStatus;
  eligibilityStatus: VoterEligibilityStatus;
  lifecycleStatus: VoterLifecycleStatusV2;
  createdAt: number;
  updatedAt: number;
  createdByOfficerId?: string;
  lastUpdatedByOfficerId?: string;
  schemaVersion: typeof SCHEMA_VERSION_CURRENT;
}

// Prohibited keys for voter profile to prevent data pollution
const FORBIDDEN_VOTER_PROFILE_KEYS = [
  'candidateId',
  'selectedCandidate',
  'ballot',
  'voteChoice',
  'rawBiometric',
  'faceImage',
  'fingerprintTemplate',
  'fingerprintImage',
  'minutiae',
  'calldata',
  'txHash',
];

export function validateVoterProfile(record: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!record || typeof record !== 'object') {
    return { isValid: false, errors: ['Record must be a non-null object'] };
  }

  // Schema version check
  if (record.schemaVersion !== SCHEMA_VERSION_CURRENT) {
    errors.push(`Invalid schemaVersion: expected '${SCHEMA_VERSION_CURRENT}', got '${record.schemaVersion}'`);
  }

  // Required string identifiers
  if (!record.id || typeof record.id !== 'string' || record.id.trim().length === 0) {
    errors.push('Missing or invalid id');
  }
  if (!record.simulationVoterId || typeof record.simulationVoterId !== 'string' || record.simulationVoterId.trim().length === 0) {
    errors.push('Missing or invalid simulationVoterId');
  } else if (/^[A-Z]{3}[0-9]{7}$/.test(record.simulationVoterId.trim())) {
    // Invariant: Do not use real Indian ECI EPIC format for simulation IDs
    errors.push('Simulation voter ID must not mirror standard Indian ECI EPIC format (3 letters + 7 digits)');
  }

  // Demographic fields
  if (!record.fullName || typeof record.fullName !== 'string' || record.fullName.trim().length === 0) {
    errors.push('Missing or invalid fullName');
  }
  if (!record.dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(record.dateOfBirth)) {
    errors.push('Missing or invalid dateOfBirth: expected ISO 8601 format (YYYY-MM-DD)');
  }
  if (!['M', 'F', 'O'].includes(record.gender)) {
    errors.push(`Invalid gender: expected 'M', 'F', or 'O', got '${record.gender}'`);
  }
  if (!record.state || typeof record.state !== 'string') {
    errors.push('Missing state');
  }
  if (!record.district || typeof record.district !== 'string') {
    errors.push('Missing district');
  }
  if (!record.constituencyId || typeof record.constituencyId !== 'string') {
    errors.push('Missing constituencyId');
  }
  if (!record.pollingStation || typeof record.pollingStation !== 'string') {
    errors.push('Missing pollingStation');
  }

  // Status enums
  const validRegStatuses: VoterRegistrationStatus[] = ['PENDING_VERIFICATION', 'REGISTERED', 'SUSPENDED', 'DE_REGISTERED'];
  if (!validRegStatuses.includes(record.registrationStatus)) {
    errors.push(`Invalid registrationStatus: '${record.registrationStatus}'`);
  }

  const validEligibilityStatuses: VoterEligibilityStatus[] = ['ELIGIBLE', 'INELIGIBLE_AGE', 'INELIGIBLE_DISQUALIFIED', 'INELIGIBLE_DECEASED'];
  if (!validEligibilityStatuses.includes(record.eligibilityStatus)) {
    errors.push(`Invalid eligibilityStatus: '${record.eligibilityStatus}'`);
  }

  const validLifecycleStatuses: VoterLifecycleStatusV2[] = ['ACTIVE', 'ARCHIVED', 'LOCKED'];
  if (!validLifecycleStatuses.includes(record.lifecycleStatus)) {
    errors.push(`Invalid lifecycleStatus: '${record.lifecycleStatus}'`);
  }

  // Timestamps
  if (typeof record.createdAt !== 'number' || record.createdAt <= 0) {
    errors.push('Invalid createdAt timestamp');
  }
  if (typeof record.updatedAt !== 'number' || record.updatedAt < record.createdAt) {
    errors.push('Invalid updatedAt timestamp: must be >= createdAt');
  }

  // Check forbidden keys (secrecy / privacy invariants)
  for (const forbidden of FORBIDDEN_VOTER_PROFILE_KEYS) {
    if (forbidden in record && record[forbidden] !== undefined) {
      errors.push(`Security violation: voter profile must never contain '${forbidden}'`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================================================
// 2. ELECTION-SPECIFIC PARTICIPATION RECORD
// ============================================================================

export type ParticipationStatus =
  | 'NOT_ENROLLED'
  | 'ELIGIBLE'
  | 'SESSION_AUTHORIZED'
  | 'SESSION_LOCKED'
  | 'VOTE_ACCEPTED'
  | 'INELIGIBLE';

export interface ParticipationAuthorizationMetadata {
  authorizedWallet?: string;
  activeNullifier?: string;
  ticketExpiry?: number;
  authorizedAt?: number;
}

export interface VoterElectionParticipation {
  id: string; // Stable unique compound key: `${voterId}_${electionId}`
  voterId: string; // Foreign key referencing VoterProfile.id
  electionId: string; // Foreign key referencing Election.id
  status: ParticipationStatus;
  authorizationMetadata?: ParticipationAuthorizationMetadata;
  votedAt?: number;
  createdAt: number;
  updatedAt: number;
  schemaVersion: typeof SCHEMA_VERSION_CURRENT;
}

/**
 * State machine of legal transitions for election participation.
 */
export const LEGAL_PARTICIPATION_TRANSITIONS: Record<ParticipationStatus, readonly ParticipationStatus[]> = {
  NOT_ENROLLED: ['ELIGIBLE', 'INELIGIBLE'],
  ELIGIBLE: ['SESSION_AUTHORIZED', 'SESSION_LOCKED', 'INELIGIBLE'],
  SESSION_AUTHORIZED: ['VOTE_ACCEPTED', 'SESSION_LOCKED', 'ELIGIBLE'],
  SESSION_LOCKED: ['ELIGIBLE', 'INELIGIBLE'],
  VOTE_ACCEPTED: [], // Terminal state: vote cannot be undone or re-cast
  INELIGIBLE: ['ELIGIBLE'], // Restorable upon official review
} as const;

export function isValidParticipationTransition(from: ParticipationStatus, to: ParticipationStatus): boolean {
  if (from === to) return true; // Idempotent same-state update
  const legalNext = LEGAL_PARTICIPATION_TRANSITIONS[from];
  return legalNext ? legalNext.includes(to) : false;
}

export function validateElectionParticipation(record: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!record || typeof record !== 'object') {
    return { isValid: false, errors: ['Participation record must be a non-null object'] };
  }

  if (record.schemaVersion !== SCHEMA_VERSION_CURRENT) {
    errors.push(`Invalid schemaVersion: expected '${SCHEMA_VERSION_CURRENT}', got '${record.schemaVersion}'`);
  }

  if (!record.id || typeof record.id !== 'string') {
    errors.push('Missing or invalid id');
  }
  if (!record.voterId || typeof record.voterId !== 'string') {
    errors.push('Missing or invalid voterId');
  }
  if (!record.electionId || typeof record.electionId !== 'string') {
    errors.push('Missing or invalid electionId');
  }

  // Id compound key convention check
  if (record.id && record.voterId && record.electionId) {
    const expectedKey = `${record.voterId}_${record.electionId}`;
    if (record.id !== expectedKey) {
      errors.push(`Participation id mismatch: expected '${expectedKey}', got '${record.id}'`);
    }
  }

  const validStatuses: ParticipationStatus[] = [
    'NOT_ENROLLED',
    'ELIGIBLE',
    'SESSION_AUTHORIZED',
    'SESSION_LOCKED',
    'VOTE_ACCEPTED',
    'INELIGIBLE',
  ];
  if (!validStatuses.includes(record.status)) {
    errors.push(`Invalid participation status: '${record.status}'`);
  }

  if (record.status === 'VOTE_ACCEPTED' && (!record.votedAt || typeof record.votedAt !== 'number')) {
    errors.push('votedAt timestamp required when status is VOTE_ACCEPTED');
  }

  // Secrecy guard: participation must NEVER contain selected candidate
  if ('candidateId' in record || 'selectedCandidate' in record || 'ballot' in record) {
    errors.push('Security violation: election participation must not contain candidate or ballot content');
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================================================
// 3. BIOMETRIC ENROLLMENT METADATA
// ============================================================================

export type BiometricModality = 'FACE' | 'FINGERPRINT';

export type BiometricEnrollmentStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'ENROLLED'
  | 'DEVICE_UNAVAILABLE'
  | 'PENDING_MANUAL_REVIEW'
  | 'MANUALLY_APPROVED'
  | 'DECLINED'
  | 'REQUIRES_REENROLLMENT';

export type BiometricQualityCheckStatus = 'PASSED' | 'FAILED' | 'EXEMPTED' | 'PENDING';

export interface BiometricEnrollmentMetadata {
  id: string; // Unique metadata record ID: bio_${voterId}_${modality.toLowerCase()}
  voterId: string; // Reference to VoterProfile.id
  modality: BiometricModality;
  status: BiometricEnrollmentStatus;
  biometricReferenceId: string; // Opaque reference ID (e.g. SHA-256 digest or UUID), NEVER raw biometric bytes
  deviceType?: string;
  deviceProvider?: string;
  enrolledAt?: number;
  qualityScore?: number; // Normalized 0-100 score
  qualityCheckStatus: BiometricQualityCheckStatus;
  consentRecordReference?: string;
  enrollingOfficerId?: string;
  exceptionDecisionReference?: string;
  isManualException: boolean; // Explicit flag: true ONLY if approved via manual administrative review
  createdAt: number;
  updatedAt: number;
  schemaVersion: typeof SCHEMA_VERSION_CURRENT;
}

const FORBIDDEN_BIOMETRIC_KEYS = [
  'rawBytes',
  'rawImage',
  'fingerprintImage',
  'fingerprintScan',
  'fingerprintTemplate',
  'template',
  'minutiae',
  'embedding',
  'vector',
  'imageData',
  'imageBytes',
  'videoStream',
  'photo',
];

export function validateBiometricMetadata(record: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!record || typeof record !== 'object') {
    return { isValid: false, errors: ['Biometric metadata must be a non-null object'] };
  }

  if (record.schemaVersion !== SCHEMA_VERSION_CURRENT) {
    errors.push(`Invalid schemaVersion: expected '${SCHEMA_VERSION_CURRENT}', got '${record.schemaVersion}'`);
  }

  if (!record.id || typeof record.id !== 'string') {
    errors.push('Missing or invalid id');
  }
  if (!record.voterId || typeof record.voterId !== 'string') {
    errors.push('Missing or invalid voterId');
  }
  if (!['FACE', 'FINGERPRINT'].includes(record.modality)) {
    errors.push(`Invalid modality: '${record.modality}'`);
  }

  const validStatuses: BiometricEnrollmentStatus[] = [
    'NOT_STARTED',
    'PENDING',
    'ENROLLED',
    'DEVICE_UNAVAILABLE',
    'PENDING_MANUAL_REVIEW',
    'MANUALLY_APPROVED',
    'DECLINED',
    'REQUIRES_REENROLLMENT',
  ];
  if (!validStatuses.includes(record.status)) {
    errors.push(`Invalid biometric enrollment status: '${record.status}'`);
  }

  if (!record.biometricReferenceId || typeof record.biometricReferenceId !== 'string') {
    errors.push('Missing or invalid opaque biometricReferenceId');
  }

  // Explicit distinction: Manual approval is an administrative decision, not a biometric match
  if (record.status === 'MANUALLY_APPROVED' && !record.isManualException) {
    errors.push('MANUALLY_APPROVED status must have isManualException set to true');
  }
  if (record.status === 'ENROLLED' && record.isManualException) {
    errors.push('ENROLLED status must have isManualException set to false (represents hardware/algorithm enrollment)');
  }

  // Strict check: No raw biometric data allowed in metadata
  for (const forbidden of FORBIDDEN_BIOMETRIC_KEYS) {
    if (forbidden in record && record[forbidden] !== undefined) {
      errors.push(`Security violation: raw biometric content '${forbidden}' must NEVER be stored in metadata`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================================================
// 4. ANONYMOUS BALLOT & RECEIPT METADATA (IDENTITY-SEPARATED)
// ============================================================================

export type BallotIntegrityStatus = 'VALID_CONFIRMED' | 'RECONCILED' | 'CHALLENGED';

export interface BlockchainReconciliationInfo {
  txHash?: string;
  blockNumber?: number;
  gasUsed?: number;
  watermark?: string;
}

export interface AnonymousBallotRecord {
  id: string; // Generated ballot reference or receiptId (e.g. rcpt_...)
  electionId: string;
  constituencyId: string;
  ballotNullifierHash: string; // Salted cryptographic nullifier hash (preventing double vote without linking voter)
  acceptedAt: number;
  integrityStatus: BallotIntegrityStatus;
  blockchainReconciliation?: BlockchainReconciliationInfo;
  schemaVersion: typeof SCHEMA_VERSION_CURRENT;
}

const FORBIDDEN_BALLOT_KEYS = [
  'voterId',
  'simulationVoterId',
  'epicId',
  'voterName',
  'fullName',
  'mobile',
  'maskedMobile',
  'biometricReferenceId',
  'fingerprint',
  'face',
  'ipAddress',
];

export function validateAnonymousBallot(record: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!record || typeof record !== 'object') {
    return { isValid: false, errors: ['Ballot record must be a non-null object'] };
  }

  if (record.schemaVersion !== SCHEMA_VERSION_CURRENT) {
    errors.push(`Invalid schemaVersion: expected '${SCHEMA_VERSION_CURRENT}', got '${record.schemaVersion}'`);
  }

  if (!record.id || typeof record.id !== 'string') {
    errors.push('Missing or invalid id');
  }
  if (!record.electionId || typeof record.electionId !== 'string') {
    errors.push('Missing or invalid electionId');
  }
  if (!record.constituencyId || typeof record.constituencyId !== 'string') {
    errors.push('Missing or invalid constituencyId');
  }
  if (!record.ballotNullifierHash || typeof record.ballotNullifierHash !== 'string') {
    errors.push('Missing or invalid ballotNullifierHash');
  }

  const validStatuses: BallotIntegrityStatus[] = ['VALID_CONFIRMED', 'RECONCILED', 'CHALLENGED'];
  if (!validStatuses.includes(record.integrityStatus)) {
    errors.push(`Invalid integrityStatus: '${record.integrityStatus}'`);
  }

  // Strict ballot privacy invariant: No voter identity or biometric fields
  for (const forbidden of FORBIDDEN_BALLOT_KEYS) {
    if (forbidden in record && record[forbidden] !== undefined) {
      errors.push(`Secrecy violation: ballot record must NEVER link to voter identity field '${forbidden}'`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================================================
// 5. AUTHORITY ACCOUNT METADATA (RBAC FOUNDATION)
// ============================================================================

export type AuthorityRole =
  | 'ELECTION_OFFICER'
  | 'VOTER_REGISTRATION_OFFICER'
  | 'PLATFORM_ADMIN';

export type AuthorityAccountStatus = 'ACTIVE' | 'SUSPENDED' | 'REVOKED';

export interface AuthorityAssignmentScope {
  state?: string;
  district?: string;
  constituencyIds?: string[];
  electionIds?: string[];
}

export interface AuthorityAccount {
  id: string; // Account identifier or auth UID
  email: string;
  displayName: string;
  role: AuthorityRole;
  status: AuthorityAccountStatus;
  assignmentScope?: AuthorityAssignmentScope;
  createdAt: number;
  updatedAt: number;
  schemaVersion: typeof SCHEMA_VERSION_CURRENT;
}

const FORBIDDEN_AUTHORITY_KEYS = ['password', 'passwordHash', 'token', 'refreshToken', 'secret'];

export function validateAuthorityAccount(record: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!record || typeof record !== 'object') {
    return { isValid: false, errors: ['Authority account must be a non-null object'] };
  }

  if (record.schemaVersion !== SCHEMA_VERSION_CURRENT) {
    errors.push(`Invalid schemaVersion: expected '${SCHEMA_VERSION_CURRENT}', got '${record.schemaVersion}'`);
  }

  if (!record.id || typeof record.id !== 'string') {
    errors.push('Missing or invalid id');
  }
  if (!record.email || typeof record.email !== 'string' || !record.email.includes('@')) {
    errors.push('Missing or invalid email');
  }
  if (!record.displayName || typeof record.displayName !== 'string') {
    errors.push('Missing or invalid displayName');
  }

  const validRoles: AuthorityRole[] = ['ELECTION_OFFICER', 'VOTER_REGISTRATION_OFFICER', 'PLATFORM_ADMIN'];
  if (!validRoles.includes(record.role)) {
    errors.push(`Invalid role: '${record.role}'. Allowed roles are strictly ELECTION_OFFICER, VOTER_REGISTRATION_OFFICER, PLATFORM_ADMIN`);
  }

  const validStatuses: AuthorityAccountStatus[] = ['ACTIVE', 'SUSPENDED', 'REVOKED'];
  if (!validStatuses.includes(record.status)) {
    errors.push(`Invalid status: '${record.status}'`);
  }

  for (const forbidden of FORBIDDEN_AUTHORITY_KEYS) {
    if (forbidden in record && record[forbidden] !== undefined) {
      errors.push(`Security violation: authority account must never store '${forbidden}'`);
    }
  }

  return { isValid: errors.length === 0, errors };
}

// ============================================================================
// 6. STRUCTURED AUDIT EVENT (SECURITY & ACCOUNTABILITY)
// ============================================================================

export type AuditActorRole =
  | 'SYSTEM'
  | 'PLATFORM_ADMIN'
  | 'ELECTION_OFFICER'
  | 'VOTER_REGISTRATION_OFFICER'
  | 'VOTER_ANONYMOUS';

export type AuditTargetCategory =
  | 'VOTER_PROFILE'
  | 'ELECTION'
  | 'PARTICIPATION'
  | 'BIOMETRIC_METADATA'
  | 'BALLOT'
  | 'AUTHORITY'
  | 'SYSTEM';

export type AuditOutcome = 'SUCCESS' | 'DENIED' | 'FAILED' | 'CHALLENGED';

export interface AuditActorInfo {
  actorId: string;
  actorRole: AuditActorRole;
  ipAddressHash?: string;
}

export interface AuditTargetInfo {
  category: AuditTargetCategory;
  targetReference: string;
}

export interface StructuredAuditEvent {
  id: string; // Unique event UUID
  timestamp: number;
  type: string; // e.g. 'VOTER_REGISTERED' | 'ELECTION_STATE_CHANGE' | 'AUTHORIZATION_ISSUED' | 'BALLOT_CAST'
  actor: AuditActorInfo;
  action: string;
  target: AuditTargetInfo;
  outcome: AuditOutcome;
  reasonCode?: string;
  correlationId?: string;
  electionId?: string;
  constituencyId?: string;
  metadata?: Record<string, string | number | boolean>; // Redacted, minimal
  schemaVersion: typeof SCHEMA_VERSION_CURRENT;
}

const FORBIDDEN_AUDIT_METADATA_KEYS = [
  'password',
  'otp',
  'token',
  'jwt',
  'secret',
  'bearer',
  'privateKey',
  'rawBiometric',
  'fingerprint',
  'face',
  'template',
];

export function validateStructuredAuditEvent(record: any): { isValid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!record || typeof record !== 'object') {
    return { isValid: false, errors: ['Audit event must be a non-null object'] };
  }

  if (record.schemaVersion !== SCHEMA_VERSION_CURRENT) {
    errors.push(`Invalid schemaVersion: expected '${SCHEMA_VERSION_CURRENT}', got '${record.schemaVersion}'`);
  }

  if (!record.id || typeof record.id !== 'string') {
    errors.push('Missing or invalid id');
  }
  if (typeof record.timestamp !== 'number' || record.timestamp <= 0) {
    errors.push('Missing or invalid timestamp');
  }
  if (!record.type || typeof record.type !== 'string') {
    errors.push('Missing or invalid type');
  }
  if (!record.action || typeof record.action !== 'string') {
    errors.push('Missing or invalid action');
  }

  // Actor validation
  if (!record.actor || typeof record.actor !== 'object') {
    errors.push('Missing actor object');
  } else {
    const validActorRoles: AuditActorRole[] = [
      'SYSTEM',
      'PLATFORM_ADMIN',
      'ELECTION_OFFICER',
      'VOTER_REGISTRATION_OFFICER',
      'VOTER_ANONYMOUS',
    ];
    if (!validActorRoles.includes(record.actor.actorRole)) {
      errors.push(`Invalid actorRole: '${record.actor?.actorRole}'`);
    }
    if (!record.actor.actorId) {
      errors.push('Missing actor.actorId');
    }
  }

  // Target validation
  if (!record.target || typeof record.target !== 'object') {
    errors.push('Missing target object');
  } else {
    const validCategories: AuditTargetCategory[] = [
      'VOTER_PROFILE',
      'ELECTION',
      'PARTICIPATION',
      'BIOMETRIC_METADATA',
      'BALLOT',
      'AUTHORITY',
      'SYSTEM',
    ];
    if (!validCategories.includes(record.target.category)) {
      errors.push(`Invalid target.category: '${record.target?.category}'`);
    }
    if (!record.target.targetReference) {
      errors.push('Missing target.targetReference');
    }
  }

  // Outcome validation
  const validOutcomes: AuditOutcome[] = ['SUCCESS', 'DENIED', 'FAILED', 'CHALLENGED'];
  if (!validOutcomes.includes(record.outcome)) {
    errors.push(`Invalid outcome: '${record.outcome}'`);
  }

  // Strict sensitive data leak prevention in metadata
  if (record.metadata && typeof record.metadata === 'object') {
    const metaKeys = Object.keys(record.metadata);
    for (const mk of metaKeys) {
      const lower = mk.toLowerCase();
      for (const forbidden of FORBIDDEN_AUDIT_METADATA_KEYS) {
        if (lower.includes(forbidden.toLowerCase())) {
          errors.push(`Security violation: audit metadata must never include sensitive key '${mk}'`);
        }
      }
    }
  }

  return { isValid: errors.length === 0, errors };
}
