/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ElectionStatus, NormalizedElectionStatus } from './index';

/**
 * Statutory Non-Endorsement & Academic Simulation Disclaimer
 */
export const MONITOR_NON_ENDORSEMENT_DISCLAIMER =
  'ACADEMIC PROTOTYPE NOTICE: BlockBallot is an academic research prototype developed strictly for demonstrating secure decentralized e-voting concepts. It is not affiliated with, authorized by, or endorsed by the Election Commission of India (ECI) or any state election commission. Simulation elections reflect synthetic test data and local EVM testnet executions.';

/**
 * Critical Ballot Secrecy & Calldata Leakage Limitation Notice (Phase 09 Release Blocker)
 */
export const BALLOT_SECRECY_LIMITATION_NOTICE =
  'CRITICAL PRIVACY NOTICE: In the current EVM smart contract implementation (IndianElection.sol), candidate selection is transmitted in plaintext transaction calldata and emitted in public VoteCast events. Public blockchain transparency does not equate to cryptographic ballot secrecy. This public monitor strictly seals candidate-level counts while voting is in progress, but cannot resolve the underlying on-chain privacy limitation. Production deployments require zero-knowledge proofs (ZKP) or homomorphic tally encryption.';

/**
 * Public summary projection of an election record.
 * Strictly excludes draft status, internal officer notes, and private identifiers.
 */
export interface PublicElectionSummary {
  id: string; // e.g. "GE-2024"
  numericId: number; // EVM uint256
  title: string;
  description: string;
  status: ElectionStatus;
  normalizedStatus: NormalizedElectionStatus;
  startTime: number; // Unix timestamp in seconds
  endTime: number; // Unix timestamp in seconds
  timezone: string; // e.g. "Asia/Kolkata"
  electionType: string;
  isDemoElection: boolean;
  constituencyCount: number;
  constituencyIds: string[];
  cancellationReason?: string;
  updatedAt?: number;
}

/**
 * Public detail projection for an election, including constituency geographic breakdown
 * and authoritative server-computed time windows.
 */
export interface PublicElectionDetail extends PublicElectionSummary {
  constituencies: Array<{
    id: string;
    code: string;
    name: string;
    state: string;
    totalElectors: number;
  }>;
  contractAddress?: string;
  serverTimeSec: number;
  serverTimeIso: string;
  timeUntilStartSec: number;
  timeUntilEndSec: number;
  isVotingOpen: boolean;
  hasStarted: boolean;
  hasEnded: boolean;
  publishedAt?: number;
  closedAt?: number;
}

/**
 * Privacy-safe aggregate participation statistics for an election.
 * Strictly excludes individual voter references, nullifiers, or candidate selections.
 */
export interface PublicParticipationMetrics {
  electionId: string;
  numericId: number;
  normalizedStatus: NormalizedElectionStatus;
  isVotingOpen: boolean;
  confirmedParticipationCount: number;
  eligibleVoterDenominator: number | null;
  turnoutPercentage: number | null;
  turnoutStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'ZERO_DENOMINATOR';
  constituencies: Array<{
    constituencyId: string;
    code: string;
    name: string;
    state: string;
    totalElectors: number;
    confirmedCount: number;
    turnoutPercentage: number | null;
    privacyMasked: boolean;
  }>;
  lastCalculatedAt: number;
  disclaimer: string;
}

/**
 * Public candidate results projection.
 * Accessible ONLY after election closure and official publication.
 */
export interface PublicPublishedResults {
  electionId: string;
  numericId: number;
  isPublished: boolean;
  publishedAt?: number;
  normalizedStatus: NormalizedElectionStatus;
  resultsAvailable: boolean;
  reason?: string;
  certification?: {
    certifiedBy?: string;
    certifiedAt?: number;
    status: 'UNVERIFIED_SIMULATION' | 'OFFICIALLY_PUBLISHED_SIMULATION';
  };
  totalVotesCast?: number;
  totalElectors?: number;
  overallTurnoutPercentage?: number;
  constituencies?: Array<{
    constituencyId: string;
    name: string;
    code: string;
    state: string;
    totalElectors: number;
    votesCast: number;
    turnoutPercentage: number;
    winningCandidate?: {
      name: string;
      partyName: string;
      voteCount: number;
    };
    candidates: Array<{
      candidateId: string;
      numericId: number;
      name: string;
      partyName: string;
      partyAbbreviation: string;
      voteCount: number;
      voteSharePct: number;
      symbolKey?: string;
    }>;
  }>;
  ballotSecrecyLimitationNotice: string;
  disclaimer: string;
}

/**
 * Public monitor overview containing overall election counts by state and server time.
 */
export interface PublicMonitorOverview {
  totalPublicElections: number;
  openElectionsCount: number;
  scheduledElectionsCount: number;
  closedElectionsCount: number;
  pausedElectionsCount: number;
  cancelledElectionsCount: number;
  serverTimeSec: number;
  serverTimeIso: string;
  disclaimer: string;
  ballotSecrecyLimitationNotice: string;
}

/**
 * Query filter parameters for the public monitor election listing.
 */
export interface PublicMonitorFilter {
  status?: string;
  state?: string;
  type?: string;
  q?: string;
  page?: number;
  limit?: number;
}
