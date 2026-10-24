export type ElectionStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'concluded';

export interface Election {
  id: string; // e.g. "GE-2024"
  numericId: number; // EVM uint256
  title: string;
  description: string;
  status: ElectionStatus;
  startTime: number; // Unix timestamp
  endTime: number; // Unix timestamp
  contractAddress: string;
  totalVotersRegistered: number;
  totalVotesCast: number;
  constituencyIds: string[];
  electionType?: string; // e.g., 'Lok Sabha General Election (Academic Demo)' | 'State Assembly'
  isDemoElection?: boolean;
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

export interface Candidate {
  id: string;
  numericId: number; // EVM candidate ID
  constituencyId: string;
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

