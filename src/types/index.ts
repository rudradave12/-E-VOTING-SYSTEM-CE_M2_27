export type ElectionStatus =
  | 'draft'
  | 'scheduled'
  | 'active'
  | 'paused'
  | 'concluded'
  | 'cancelled'
  | 'DRAFT'
  | 'SCHEDULED'
  | 'OPEN'
  | 'PAUSED'
  | 'CLOSED'
  | 'CANCELLED';

export type NormalizedElectionStatus =
  | 'DRAFT'
  | 'SCHEDULED'
  | 'OPEN'
  | 'PAUSED'
  | 'CLOSED'
  | 'CANCELLED';

export function normalizeElectionStatus(status: ElectionStatus | string): NormalizedElectionStatus {
  const upper = String(status || '').toUpperCase().trim();
  if (upper === 'ACTIVE' || upper === 'OPEN') return 'OPEN';
  if (upper === 'CONCLUDED' || upper === 'CLOSED') return 'CLOSED';
  if (upper === 'SCHEDULED') return 'SCHEDULED';
  if (upper === 'DRAFT') return 'DRAFT';
  if (upper === 'PAUSED') return 'PAUSED';
  if (upper === 'CANCELLED' || upper === 'CANCELED') return 'CANCELLED';
  return 'DRAFT';
}

export function toLegacyElectionStatus(
  status: ElectionStatus | string
): 'draft' | 'scheduled' | 'active' | 'paused' | 'concluded' | 'cancelled' {
  const norm = normalizeElectionStatus(status as any);
  if (norm === 'OPEN') return 'active';
  if (norm === 'CLOSED') return 'concluded';
  return norm.toLowerCase() as any;
}

export const ALLOWED_ELECTION_TRANSITIONS: Record<
  NormalizedElectionStatus,
  readonly NormalizedElectionStatus[]
> = {
  DRAFT: ['SCHEDULED', 'OPEN', 'CANCELLED'],
  SCHEDULED: ['OPEN', 'DRAFT', 'CANCELLED'],
  OPEN: ['PAUSED', 'CLOSED', 'CANCELLED'],
  PAUSED: ['OPEN', 'CLOSED', 'CANCELLED'],
  CLOSED: [], // Terminal: voting ended, records sealed
  CANCELLED: [], // Terminal: election aborted
} as const;

export function isValidElectionTransition(
  from: ElectionStatus | string,
  to: ElectionStatus | string
): boolean {
  const normFrom = normalizeElectionStatus(from as any);
  const normTo = normalizeElectionStatus(to as any);
  if (normFrom === normTo) return true; // Idempotent same-state
  const allowed = ALLOWED_ELECTION_TRANSITIONS[normFrom];
  return allowed ? allowed.includes(normTo) : false;
}

export interface AuthoritativeElectionStatus {
  electionId: string;
  numericId: number;
  title: string;
  status: ElectionStatus;
  normalizedStatus: NormalizedElectionStatus;
  serverTimeSec: number;
  serverTimeIso: string;
  startTimeSec: number;
  endTimeSec: number;
  timezone: string;
  isVotingOpen: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
  timeUntilStartSec: number;
  timeUntilEndSec: number;
  cancellationReason?: string;
}

export interface Election {
  id: string; // e.g. "GE-2024"
  numericId: number; // EVM uint256
  title: string;
  description: string;
  status: ElectionStatus;
  startTime: number; // Unix timestamp (seconds)
  endTime: number; // Unix timestamp (seconds)
  contractAddress: string;
  totalVotersRegistered: number;
  totalVotesCast: number;
  constituencyIds: string[];
  electionType?: string; // e.g., 'Lok Sabha General Election (Academic Demo)' | 'State Assembly'
  isDemoElection?: boolean;
  timezone?: string; // e.g. 'Asia/Kolkata' or IANA identifier
  cancellationReason?: string; // Required when status is CANCELLED / cancelled
  cancelledAt?: number;
  cancelledByOfficerId?: string;
  publishedAt?: number;
  openedAt?: number;
  closedAt?: number;
  createdAt?: number;
  updatedAt?: number;
}

export interface Constituency {
  id: string;
  code: string;
  name: string;
  state: string;
  totalElectors: number;
  turnoutCount: number;
  candidateIds: string[];
}

export type SymbolVerificationStatus = 'VERIFIED_ECI' | 'UNAVAILABLE';
export type CandidateStatus = 'ACTIVE' | 'WITHDRAWN' | 'DISQUALIFIED';

export interface Candidate {
  id: string;
  numericId: number; // EVM candidate ID
  constituencyId: string;
  electionId?: string;
  status?: CandidateStatus;
  name: string;
  nameHi?: string;
  partyName: string;
  partyNameHi?: string;
  partyAbbreviation: string;
  symbol: string; // Symbol name or icon identifier
  symbolDescription: string;
  symbolSource: string;
  symbolVerificationStatus: SymbolVerificationStatus;
  symbolKey?:
    | 'LOTUS'
    | 'HAND'
    | 'BROOM'
    | 'ELEPHANT'
    | 'CORN_SICKLE'
    | 'HAMMER_SICKLE_STAR'
    | 'BOOK'
    | 'BICYCLE'
    | 'RISING_SUN'
    | 'FLOWERS_GRASS'
    | 'FLAMING_TORCH'
    | 'BOW_ARROW'
    | 'NOTA'
    | 'UNAVAILABLE';
  symbolColor: string;
  education: string;
  age: number;
  criminalCases: number;
  assets: string;
  voteCount: number;
  deactivatedAt?: number;
  deactivatedReason?: string;
  createdAt?: number;
  updatedAt?: number;
}

export type VoterLifecycleStatus = 'ELIGIBLE' | 'AUTHORIZED' | 'VOTED';

export interface VoterRecord {
  id: string;
  epicId: string;
  name: string;
  gender: 'M' | 'F' | 'O';
  age: number;
  constituencyId: string;
  pollingStation: string;
  maskedMobile: string;
  isEligible: boolean;
  status: VoterLifecycleStatus;
  authorizedWallet?: string;
  activeNullifier?: string;
  ticketExpiry?: number;
  votedAt?: number;
}

export interface VotingAuthorizationTicket {
  electionId: number;
  constituencyId: number;
  voterWallet: string;
  nullifier: string;
  expiry: number;
  chainId: number;
  contractAddress: string;
  signature: string;
}

export interface VoteReceipt {
  receiptId: string;
  electionId: number;
  constituencyId: number;
  constituencyName: string;
  candidateName: string;
  partyName: string;
  transactionHash: string;
  blockNumber: number;
  timestamp: string;
  isSimulated: boolean;
  watermark: string;
  gasUsed: number;
  nullifier: string;
}

export interface AuditEvent {
  id: string;
  timestamp: number;
  type:
    | 'ELECTION_STATE'
    | 'CANDIDATE_REGISTERED'
    | 'OTP_ISSUED'
    | 'AUTHORIZATION_SIGNED'
    | 'VOTE_CAST'
    | 'NULLIFIER_SPENT'
    | 'ADMIN_ACTION'
    | 'TRANSACTION_RECOVERY';
  description: string;
  electionId: number;
  constituencyId?: number;
  txHash?: string;
  blockNumber?: number;
  nullifier?: string;
  isSimulated?: boolean;
}

export type NavigationScreen =
  | 'home'
  | 'welcome'
  | 'available-elections'
  | 'election-results'
  | 'elections-results'
  | 'vote'
  | 'political-parties'
  | 'candidates-parties'
  | 'constituency-info'
  | 'constituencies-info'
  | 'how-it-works'
  | 'administration'
  | 'practice-voting'
  | 'identify'
  | 'otp'
  | 'constituency'
  | 'candidates'
  | 'review'
  | 'metamask'
  | 'receipt'
  | 'results'
  | 'preference-poll'
  | 'admin-login'
  | 'admin-dashboard'
  | 'admin-elections'
  | 'admin-candidates'
  | 'admin-voters'
  | 'admin-audit'
  | 'admin-exceptions'
  | 'face-enrollment'
  | 'fingerprint-enrollment';

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

// Phase 02 Data Model exports
export * from './dataModel';

// Phase 03 Permissions & RBAC exports
export * from './permissions';

