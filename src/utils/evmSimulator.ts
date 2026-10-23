import { ethers } from 'ethers';
import { VotingAuthorizationTicket, VoteReceipt, AuditEvent } from '../types';
import {
  verifyVotingAuthorization,
  DEMO_AUTHORIZATION_SIGNER_ADDRESS,
} from './crypto';

export interface SimulatedElectionState {
  electionId: number;
  status: 'draft' | 'active' | 'paused' | 'concluded';
  spentNullifiers: Set<string>;
  candidateVotes: Map<number, number>; // candidateId -> vote count
  totalVotes: number;
}

class EvmSimulator {
  private currentBlockNumber: number = 19827400;
  private spentNullifiers: Map<number, Set<string>> = new Map(); // electionId -> Set<nullifier>
  private candidateTallies: Map<number, number> = new Map(); // candidateId -> count
  private auditEvents: AuditEvent[] = [];
  private electionStatus: 'draft' | 'active' | 'paused' | 'concluded' = 'active';

  constructor() {
    this.spentNullifiers.set(18, new Set<string>());
  }

  public getBlockNumber(): number {
    return this.currentBlockNumber;
  }

  public isNullifierSpent(electionId: number, nullifier: string): boolean {
    const electionNullifiers = this.spentNullifiers.get(electionId);
    return electionNullifiers ? electionNullifiers.has(nullifier.toLowerCase()) : false;
  }

  public getAuditEvents(): AuditEvent[] {
    return [...this.auditEvents];
  }

  public addAuditEvent(event: Omit<AuditEvent, 'id' | 'timestamp'>): void {
    const newEvent: AuditEvent = {
      ...event,
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      timestamp: Date.now(),
    };
    this.auditEvents.unshift(newEvent);
  }

  public setElectionStatus(status: 'draft' | 'active' | 'paused' | 'concluded'): void {
    this.electionStatus = status;
    this.addAuditEvent({
      type: 'ELECTION_STATE',
      description: `Election status updated to ${status.toUpperCase()}`,
      electionId: 18,
      isSimulated: true,
    });
  }

  public getElectionStatus(): 'draft' | 'active' | 'paused' | 'concluded' {
    return this.electionStatus;
  }

  /**
   * Simulates the execution of `castVote()` in `IndianElection.sol`.
   * Enforces all on-chain invariants:
   * 1. Active election
   * 2. Unexpired authorization ticket
   * 3. Valid EIP-712 signature matching authorizationSigner
   * 4. msgSender matches ticket.voterWallet
   * 5. Unspent nullifier
   */
  public async castVote(
    msgSender: string,
    ticket: VotingAuthorizationTicket,
    candidateId: number,
    candidateName: string,
    partyName: string,
    constituencyName: string
  ): Promise<{ success: boolean; receipt?: VoteReceipt; error?: string }> {
    // 1. Status check
    if (this.electionStatus !== 'active') {
      return { success: false, error: 'Election is currently paused or concluded on-chain.' };
    }

    // 2. Expiry check
    const currentUnix = Math.floor(Date.now() / 1000);
    if (currentUnix > ticket.expiry) {
      return { success: false, error: 'Voting authorization ticket has expired on-chain.' };
    }

    // 3. Sender binding check
    if (msgSender.toLowerCase() !== ticket.voterWallet.toLowerCase()) {
      return {
        success: false,
        error: `Transaction sender (${msgSender.substring(0, 8)}...) does not match authorized wallet (${ticket.voterWallet.substring(0, 8)}...).`,
      };
    }

    // 4. EIP-712 Signature check
    const sigCheck = verifyVotingAuthorization(ticket, DEMO_AUTHORIZATION_SIGNER_ADDRESS);
    if (!sigCheck.isValid) {
      return { success: false, error: `On-chain signature check failed: ${sigCheck.error}` };
    }

    // 5. Nullifier duplicate prevention
    const nullifierKey = ticket.nullifier.toLowerCase();
    let electionNullifiers = this.spentNullifiers.get(ticket.electionId);
    if (!electionNullifiers) {
      electionNullifiers = new Set<string>();
      this.spentNullifiers.set(ticket.electionId, electionNullifiers);
    }

    if (electionNullifiers.has(nullifierKey)) {
      return {
        success: false,
        error: 'Double-voting violation: This cryptographic nullifier has already been recorded on-chain.',
      };
    }

    // Burn nullifier & increment tally
    electionNullifiers.add(nullifierKey);
    const currentVotes = this.candidateTallies.get(candidateId) || 0;
    this.candidateTallies.set(candidateId, currentVotes + 1);

    this.currentBlockNumber += Math.floor(Math.random() * 3) + 1;
    const txHash = ethers.hexlify(ethers.randomBytes(32));

    const receipt: VoteReceipt = {
      receiptId: `REC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
      electionId: ticket.electionId,
      constituencyId: ticket.constituencyId,
      constituencyName,
      candidateName,
      partyName,
      transactionHash: txHash,
      blockNumber: this.currentBlockNumber,
      timestamp: new Date().toISOString(),
      isSimulated: true,
      watermark: '[SIMULATED ACADEMIC DEMO RECEIPT — NOT ON PUBLIC TESTNET]',
      gasUsed: 54210 + Math.floor(Math.random() * 400),
      nullifier: ticket.nullifier,
    };

    this.addAuditEvent({
      type: 'VOTE_CAST',
      description: `Ballot cast in Constituency #${ticket.constituencyId}. Nullifier spent on-chain.`,
      electionId: ticket.electionId,
      constituencyId: ticket.constituencyId,
      txHash,
      blockNumber: this.currentBlockNumber,
      nullifier: ticket.nullifier,
      isSimulated: true,
    });

    return { success: true, receipt };
  }
}

export const evmSimulator = new EvmSimulator();
