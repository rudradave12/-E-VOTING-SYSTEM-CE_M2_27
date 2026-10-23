import {
  VotingAuthorizationTicket,
  Election,
  Constituency,
  Candidate,
  VoterRecord,
  AuditEvent,
  ElectionStatus,
} from '../types';

export interface VerifyVoterResponse {
  success: boolean;
  message: string;
  epicId?: string;
  name?: string;
  maskedMobile?: string;
  status?: string;
  testDeliveryCode?: string;
  cooldownRemaining?: number;
}

export interface VerifyOtpResponse {
  success: boolean;
  message: string;
  sessionToken?: string;
  expiresAt?: number;
  voter?: {
    id: string;
    epicId: string;
    name: string;
    constituencyId: string;
    constituencyCode: number;
    pollingStation: string;
    status: 'AUTHORIZED';
  };
  attemptsRemaining?: number;
}

export interface AuthorizationResponse {
  success: boolean;
  message?: string;
  ticket?: VotingAuthorizationTicket;
  nullifier?: string;
  expiresAt?: number;
  voterWallet?: string;
  notice?: string;
}

export class VoterApiClient {
  private static instance: VoterApiClient;
  private currentSessionToken: string | null = null;
  private currentAdminToken: string | null = null;

  private constructor() {}

  public static getInstance(): VoterApiClient {
    if (!VoterApiClient.instance) {
      VoterApiClient.instance = new VoterApiClient();
    }
    return VoterApiClient.instance;
  }

  public getSessionToken(): string | null {
    return this.currentSessionToken;
  }

  public setSessionToken(token: string | null): void {
    this.currentSessionToken = token;
  }

  public getAdminToken(): string | null {
    return this.currentAdminToken;
  }

  public setAdminToken(token: string | null): void {
    this.currentAdminToken = token;
  }

  /**
   * GET /api/voter/config
   */
  public async getPublicConfig(): Promise<{ success: boolean; authorizationSignerAddress?: string; chainId?: number; domainName?: string }> {
    try {
      const res = await fetch('/api/voter/config');
      return await res.json();
    } catch {
      return { success: false };
    }
  }

  /**
   * POST /api/voter/verify
   */
  public async verifyVoter(epicId: string): Promise<VerifyVoterResponse> {
    try {
      const res = await fetch('/api/voter/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId }),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Network error communicating with server identity gateway.',
      };
    }
  }

  /**
   * POST /api/voter/verify-otp
   */
  public async verifyOtp(epicId: string, otp: string): Promise<VerifyOtpResponse> {
    try {
      const res = await fetch('/api/voter/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId, otp }),
      });
      const data = await res.json();
      if (data.success && data.sessionToken) {
        this.currentSessionToken = data.sessionToken;
      }
      return data;
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Network error verifying challenge with server.',
      };
    }
  }

  /**
   * POST /api/voter/authorization
   */
  public async requestAuthorization(
    voterWallet: string,
    electionId: number,
    chainId: number,
    contractAddress: string
  ): Promise<AuthorizationResponse> {
    try {
      const res = await fetch('/api/voter/authorization', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.currentSessionToken && {
            Authorization: `Bearer ${this.currentSessionToken}`,
          }),
        },
        body: JSON.stringify({
          sessionToken: this.currentSessionToken,
          voterWallet,
          electionId,
          chainId,
          contractAddress,
        }),
      });
      const data = await res.json();
      return data;
    } catch (err: any) {
      return {
        success: false,
        message: err.message || 'Network error requesting on-chain voting authorization.',
      };
    }
  }

  /**
   * POST /api/voter/record-vote
   * Finalizes voter status to VOTED. Strictly preserves vote secrecy: does NOT send candidate choice.
   */
  public async recordVote(payload: {
    epicId?: string;
    nullifier: string;
    electionId: number;
    constituencyId?: string;
    txHash: string;
    isSimulated: boolean;
  }): Promise<{ success: boolean; message?: string; status?: string }> {
    try {
      const res = await fetch('/api/voter/record-vote', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.currentSessionToken && {
            Authorization: `Bearer ${this.currentSessionToken}`,
          }),
        },
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message || 'Network error recording vote transaction.' };
    }
  }

  /**
   * POST /api/voter/recover-transaction
   */
  public async recoverTransaction(payload: {
    epicId: string;
    nullifier?: string;
  }): Promise<{ success: boolean; recovered: boolean; status?: string; message?: string }> {
    try {
      const res = await fetch('/api/voter/recover-transaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, recovered: false, message: err.message || 'Network error recovering transaction.' };
    }
  }

  /**
   * GET /api/voter/session
   */
  public async checkSession(): Promise<{ authenticated: boolean; session?: any }> {
    if (!this.currentSessionToken) {
      return { authenticated: false };
    }
    try {
      const res = await fetch('/api/voter/session', {
        headers: {
          Authorization: `Bearer ${this.currentSessionToken}`,
        },
      });
      const data = await res.json();
      return data;
    } catch {
      return { authenticated: false };
    }
  }

  /**
   * Public data endpoints
   */
  public async getElections(): Promise<Election[]> {
    try {
      const res = await fetch('/api/elections');
      const data = await res.json();
      return data.elections || [];
    } catch {
      return [];
    }
  }

  public async getConstituencies(): Promise<Constituency[]> {
    try {
      const res = await fetch('/api/constituencies');
      const data = await res.json();
      return data.constituencies || [];
    } catch {
      return [];
    }
  }

  public async getCandidates(constituencyId?: string): Promise<Candidate[]> {
    try {
      const url = constituencyId ? `/api/candidates?constituencyId=${encodeURIComponent(constituencyId)}` : '/api/candidates';
      const res = await fetch(url);
      const data = await res.json();
      return data.candidates || [];
    } catch {
      return [];
    }
  }

  public async getResults(): Promise<any> {
    try {
      const res = await fetch('/api/results');
      return await res.json();
    } catch {
      return null;
    }
  }

  public async getAuditEvents(): Promise<AuditEvent[]> {
    try {
      const res = await fetch('/api/audit-events');
      const data = await res.json();
      return data.auditEvents || [];
    } catch {
      return [];
    }
  }

  /**
   * Admin operations
   */
  public async adminLogin(email: string, password?: string): Promise<{ success: boolean; token?: string; message?: string }> {
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (data.success && data.token) {
        this.currentAdminToken = data.token;
      }
      return data;
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  public async adminCreateElection(
    election: Omit<Election, 'totalVotesCast' | 'totalVotersRegistered'>
  ): Promise<{ success: boolean; message?: string; election?: Election }> {
    try {
      const res = await fetch('/api/admin/elections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.currentAdminToken && { Authorization: `Bearer ${this.currentAdminToken}` }),
        },
        body: JSON.stringify(election),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  public async adminUpdateElectionStatus(
    electionId: string,
    status: ElectionStatus
  ): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch(`/api/admin/elections/${encodeURIComponent(electionId)}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(this.currentAdminToken && { Authorization: `Bearer ${this.currentAdminToken}` }),
        },
        body: JSON.stringify({ status }),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  public async adminAddCandidate(candidate: Candidate): Promise<{ success: boolean; message?: string }> {
    try {
      const res = await fetch('/api/admin/candidates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.currentAdminToken && { Authorization: `Bearer ${this.currentAdminToken}` }),
        },
        body: JSON.stringify(candidate),
      });
      return await res.json();
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  public async adminGetVoters(): Promise<VoterRecord[]> {
    try {
      const res = await fetch('/api/admin/voters', {
        headers: {
          ...(this.currentAdminToken && { Authorization: `Bearer ${this.currentAdminToken}` }),
        },
      });
      const data = await res.json();
      return data.voters || [];
    } catch {
      return [];
    }
  }

  public async adminToggleVoterEligibility(voterId: string, isEligible: boolean): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/voters/${encodeURIComponent(voterId)}/eligibility`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(this.currentAdminToken && { Authorization: `Bearer ${this.currentAdminToken}` }),
        },
        body: JSON.stringify({ isEligible }),
      });
      const data = await res.json();
      return !!data.success;
    } catch {
      return false;
    }
  }

  public async adminResetVoter(voterId: string): Promise<boolean> {
    try {
      const res = await fetch(`/api/admin/voters/${encodeURIComponent(voterId)}/reset`, {
        method: 'POST',
        headers: {
          ...(this.currentAdminToken && { Authorization: `Bearer ${this.currentAdminToken}` }),
        },
      });
      const data = await res.json();
      return !!data.success;
    } catch {
      return false;
    }
  }
}

export const voterApi = VoterApiClient.getInstance();
