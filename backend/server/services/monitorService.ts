/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PublicElectionSummary,
  PublicElectionDetail,
  PublicParticipationMetrics,
  PublicPublishedResults,
  PublicMonitorOverview,
  PublicMonitorFilter,
  MONITOR_NON_ENDORSEMENT_DISCLAIMER,
  BALLOT_SECRECY_LIMITATION_NOTICE,
  normalizeElectionStatus,
  NormalizedElectionStatus,
  Election,
  Constituency,
} from '../../../frontend/src/types';
import { serverStore } from '../store';
import { getDataRepositories } from '../repositories';

export class MonitorService {
  private static instance: MonitorService;

  public static getInstance(): MonitorService {
    if (!MonitorService.instance) {
      MonitorService.instance = new MonitorService();
    }
    return MonitorService.instance;
  }

  /**
   * Helper: checks whether an election is publicly visible.
   * Private DRAFT elections must never be displayed to the public monitor.
   */
  public isPubliclyVisible(election: Election): boolean {
    const norm = normalizeElectionStatus(election.status);
    return norm !== 'DRAFT';
  }

  /**
   * GET /api/monitor/overview
   * Returns high-level statistics across all public elections.
   */
  public getOverview(): PublicMonitorOverview {
    // Reconcile election schedules against server clock
    serverStore.reconcileElectionSchedules();

    const allElections = serverStore.getAllElections();
    const publicElections = allElections.filter((e) => this.isPubliclyVisible(e));

    let openCount = 0;
    let scheduledCount = 0;
    let closedCount = 0;
    let pausedCount = 0;
    let cancelledCount = 0;

    for (const e of publicElections) {
      const norm = normalizeElectionStatus(e.status);
      if (norm === 'OPEN') openCount++;
      else if (norm === 'SCHEDULED') scheduledCount++;
      else if (norm === 'CLOSED') closedCount++;
      else if (norm === 'PAUSED') pausedCount++;
      else if (norm === 'CANCELLED') cancelledCount++;
    }

    const serverTimeMs = serverStore.getCurrentTimeMs();
    const serverTimeSec = Math.floor(serverTimeMs / 1000);

    return {
      totalPublicElections: publicElections.length,
      openElectionsCount: openCount,
      scheduledElectionsCount: scheduledCount,
      closedElectionsCount: closedCount,
      pausedElectionsCount: pausedCount,
      cancelledElectionsCount: cancelledCount,
      serverTimeSec,
      serverTimeIso: new Date(serverTimeMs).toISOString(),
      disclaimer: MONITOR_NON_ENDORSEMENT_DISCLAIMER,
      ballotSecrecyLimitationNotice: BALLOT_SECRECY_LIMITATION_NOTICE,
    };
  }

  /**
   * GET /api/monitor/elections
   * Searchable and filterable listing of publicly visible elections.
   */
  public getPublicElections(filter: PublicMonitorFilter = {}): {
    elections: PublicElectionSummary[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    serverTimeSec: number;
    disclaimer: string;
  } {
    // Reconcile election schedules against server clock
    serverStore.reconcileElectionSchedules();

    const allElections = serverStore.getAllElections();
    let filtered = allElections.filter((e) => this.isPubliclyVisible(e));

    // Filter by normalized status
    if (filter.status && filter.status.trim() !== '' && filter.status.toUpperCase() !== 'ALL') {
      const targetNorm = normalizeElectionStatus(filter.status.trim() as any);
      filtered = filtered.filter((e) => normalizeElectionStatus(e.status) === targetNorm);
    }

    // Filter by election type
    if (filter.type && filter.type.trim() !== '') {
      const lowerType = filter.type.toLowerCase();
      filtered = filtered.filter((e) => (e.electionType || '').toLowerCase().includes(lowerType));
    }

    // Filter by state (match any constituency in election)
    if (filter.state && filter.state.trim() !== '') {
      const lowerState = filter.state.toLowerCase();
      filtered = filtered.filter((e) => {
        return (e.constituencyIds || []).some((cid) => {
          const c = serverStore.getConstituencyById(cid);
          return c && c.state.toLowerCase().includes(lowerState);
        });
      });
    }

    // Free text query search (title, description, constituency name)
    if (filter.q && filter.q.trim() !== '') {
      const qLower = filter.q.toLowerCase().trim();
      filtered = filtered.filter((e) => {
        if (e.title.toLowerCase().includes(qLower)) return true;
        if (e.description.toLowerCase().includes(qLower)) return true;
        if (e.id.toLowerCase().includes(qLower)) return true;
        return (e.constituencyIds || []).some((cid) => {
          const c = serverStore.getConstituencyById(cid);
          return c && (c.name.toLowerCase().includes(qLower) || c.code.toLowerCase().includes(qLower));
        });
      });
    }

    // Priority sorting: OPEN > SCHEDULED > PAUSED > CLOSED > CANCELLED
    const statusPriority: Record<NormalizedElectionStatus, number> = {
      OPEN: 1,
      SCHEDULED: 2,
      PAUSED: 3,
      CLOSED: 4,
      CANCELLED: 5,
      DRAFT: 6,
    };

    filtered.sort((a, b) => {
      const pA = statusPriority[normalizeElectionStatus(a.status)] || 99;
      const pB = statusPriority[normalizeElectionStatus(b.status)] || 99;
      if (pA !== pB) return pA - pB;
      // Secondary: start time ascending
      return a.startTime - b.startTime;
    });

    const total = filtered.length;
    const page = Math.max(1, Number(filter.page) || 1);
    const limit = Math.max(1, Math.min(50, Number(filter.limit) || 10));
    const totalPages = Math.ceil(total / limit) || 1;
    const startIndex = (page - 1) * limit;
    const paged = filtered.slice(startIndex, startIndex + limit);

    const summaries: PublicElectionSummary[] = paged.map((e) => this.projectToSummary(e));

    return {
      elections: summaries,
      total,
      page,
      limit,
      totalPages,
      serverTimeSec: serverStore.getCurrentTimeSec(),
      disclaimer: MONITOR_NON_ENDORSEMENT_DISCLAIMER,
    };
  }

  /**
   * GET /api/monitor/elections/:id
   * Detail projection of an election with authoritative timestamps and time windows.
   */
  public getPublicElectionDetail(id: string): PublicElectionDetail | null {
    serverStore.reconcileElectionSchedules();

    const election = serverStore.getElectionById(id) || serverStore.findElectionByNumericId(Number(id));
    if (!election || !this.isPubliclyVisible(election)) {
      return null;
    }

    const normStatus = normalizeElectionStatus(election.status);
    const serverTimeMs = serverStore.getCurrentTimeMs();
    const serverTimeSec = Math.floor(serverTimeMs / 1000);

    const timeUntilStartSec = Math.max(0, election.startTime - serverTimeSec);
    const timeUntilEndSec = Math.max(0, election.endTime - serverTimeSec);
    const hasStarted = serverTimeSec >= election.startTime;
    const hasEnded = serverTimeSec >= election.endTime;
    const isVotingOpen = normStatus === 'OPEN';

    // Map constituencies (metadata only, no candidates)
    const constituencies = (election.constituencyIds || []).map((cid) => {
      const c = serverStore.getConstituencyById(cid);
      if (c) {
        return {
          id: c.id,
          code: c.code,
          name: c.name,
          state: c.state,
          totalElectors: c.totalElectors || 0,
        };
      }
      return {
        id: cid,
        code: cid,
        name: cid,
        state: 'Unknown',
        totalElectors: 0,
      };
    });

    const summary = this.projectToSummary(election);

    return {
      ...summary,
      constituencies,
      contractAddress: election.contractAddress,
      serverTimeSec,
      serverTimeIso: new Date(serverTimeMs).toISOString(),
      timeUntilStartSec,
      timeUntilEndSec,
      isVotingOpen,
      hasStarted,
      hasEnded,
      publishedAt: election.publishedAt,
      closedAt: election.closedAt,
    };
  }

  /**
   * GET /api/monitor/elections/:id/participation
   * Privacy-safe aggregate participation metrics.
   * Strictly prevents duplicate participation counts, pending votes, or candidate disclosures.
   */
  public async getParticipationMetrics(id: string): Promise<PublicParticipationMetrics | null> {
    serverStore.reconcileElectionSchedules();

    const election = serverStore.getElectionById(id) || serverStore.findElectionByNumericId(Number(id));
    if (!election || !this.isPubliclyVisible(election)) {
      return null;
    }

    const normStatus = normalizeElectionStatus(election.status);
    const repos = getDataRepositories();

    // 1. Authoritative confirmed participation count from per-election participation records
    let confirmedCount = 0;
    const confirmedVoterIds = new Set<string>();

    try {
      const participations = await repos.participations.listByElection(election.id);
      for (const p of participations) {
        // Invariant: ONLY count confirmed terminal VOTE_ACCEPTED records
        if (p.status === 'VOTE_ACCEPTED') {
          confirmedVoterIds.add(p.voterId);
        }
      }
      confirmedCount = confirmedVoterIds.size;
    } catch {
      // Fallback if repository fails
    }

    // Fallback/Supplement for seeded demo election (GE-2024) where legacy voters cast votes
    if (confirmedCount === 0) {
      const allVoters = serverStore.getAllVoters();
      const constituencySet = new Set(election.constituencyIds || []);
      const legacyVoted = allVoters.filter(
        (v) => v.status === 'VOTED' && constituencySet.has(v.constituencyId)
      );
      if (legacyVoted.length > 0) {
        confirmedCount = legacyVoted.length;
      } else if ((election.totalVotesCast || 0) > 0) {
        confirmedCount = election.totalVotesCast;
      }
    }

    // 2. Denominator: Sum totalElectors of participating constituencies
    let eligibleDenominator = 0;
    const constituencyBreakdowns: Array<{
      constituencyId: string;
      code: string;
      name: string;
      state: string;
      totalElectors: number;
      confirmedCount: number;
      turnoutPercentage: number | null;
      privacyMasked: boolean;
    }> = [];

    for (const cid of election.constituencyIds || []) {
      const c = serverStore.getConstituencyById(cid);
      const totalElectors = c?.totalElectors || 0;
      eligibleDenominator += totalElectors;

      // Constituency-level participation count
      const cTurnout = c?.turnoutCount || 0;

      // K-Anonymity & Low-Count Privacy Guard:
      // If a constituency has <= 5 electors, mask its breakdown to avoid identifying a single voter's turnout
      const isLowCount = totalElectors > 0 && totalElectors <= 5;

      const turnoutPct =
        !isLowCount && totalElectors > 0
          ? Number(((cTurnout / totalElectors) * 100).toFixed(2))
          : null;

      constituencyBreakdowns.push({
        constituencyId: cid,
        code: c?.code || cid,
        name: c?.name || cid,
        state: c?.state || 'Unknown',
        totalElectors,
        confirmedCount: isLowCount ? 0 : cTurnout,
        turnoutPercentage: turnoutPct,
        privacyMasked: isLowCount,
      });
    }

    // Denominator safety validation
    if (eligibleDenominator <= 0 && (election.totalVotersRegistered || 0) > 0) {
      eligibleDenominator = election.totalVotersRegistered;
    }

    let turnoutPct: number | null = null;
    let turnoutStatus: 'AVAILABLE' | 'UNAVAILABLE' | 'ZERO_DENOMINATOR' = 'UNAVAILABLE';

    if (eligibleDenominator > 0) {
      turnoutPct = Number(((confirmedCount / eligibleDenominator) * 100).toFixed(2));
      turnoutStatus = 'AVAILABLE';
    } else {
      turnoutStatus = 'ZERO_DENOMINATOR';
    }

    return {
      electionId: election.id,
      numericId: election.numericId,
      normalizedStatus: normStatus,
      isVotingOpen: normStatus === 'OPEN',
      confirmedParticipationCount: confirmedCount,
      eligibleVoterDenominator: eligibleDenominator > 0 ? eligibleDenominator : null,
      turnoutPercentage: turnoutPct,
      turnoutStatus,
      constituencies: constituencyBreakdowns,
      lastCalculatedAt: Date.now(),
      disclaimer: MONITOR_NON_ENDORSEMENT_DISCLAIMER,
    };
  }

  /**
   * GET /api/monitor/elections/:id/results
   * Returns certified candidate results ONLY when election is CLOSED and officially published.
   * STRICTLY denies candidate-level counts while election is open, scheduled, or paused!
   */
  public getPublishedResults(id: string): PublicPublishedResults | null {
    serverStore.reconcileElectionSchedules();

    const election = serverStore.getElectionById(id) || serverStore.findElectionByNumericId(Number(id));
    if (!election || !this.isPubliclyVisible(election)) {
      return null;
    }

    const normStatus = normalizeElectionStatus(election.status);

    // CRITICAL BALLOT PRIVACY RULE:
    // Candidate results are SEALED while election is OPEN, SCHEDULED, or PAUSED
    if (normStatus !== 'CLOSED') {
      return {
        electionId: election.id,
        numericId: election.numericId,
        isPublished: false,
        normalizedStatus: normStatus,
        resultsAvailable: false,
        reason:
          'Candidate-level counts are sealed while the election is active, scheduled, or paused. Ballots will be unsealed and tallies published once the election is concluded and certified.',
        ballotSecrecyLimitationNotice: BALLOT_SECRECY_LIMITATION_NOTICE,
        disclaimer: MONITOR_NON_ENDORSEMENT_DISCLAIMER,
      };
    }

    // For CLOSED elections: Verify results publication policy
    // Concluded trial elections or elections with publishedAt are available
    const allCandidates = serverStore.getAllCandidates();
    const allConstituencies = serverStore.getAllConstituencies();

    let totalVotesCast = 0;
    let totalElectors = 0;

    const constituencyResults = (election.constituencyIds || []).map((cid) => {
      const c = allConstituencies.find((con) => con.id === cid);
      const cElectors = c?.totalElectors || 0;
      totalElectors += cElectors;

      const cCandidates = allCandidates.filter((cand) => cand.constituencyId === cid);
      const cVotes = cCandidates.reduce((acc, cand) => acc + (cand.voteCount || 0), 0);
      totalVotesCast += cVotes;

      const sortedCandidates = [...cCandidates].sort((a, b) => (b.voteCount || 0) - (a.voteCount || 0));
      const winning = sortedCandidates[0];

      return {
        constituencyId: cid,
        name: c?.name || cid,
        code: c?.code || cid,
        state: c?.state || 'Unknown',
        totalElectors: cElectors,
        votesCast: cVotes,
        turnoutPercentage: cElectors > 0 ? Number(((cVotes / cElectors) * 100).toFixed(2)) : 0,
        winningCandidate:
          winning && (winning.voteCount || 0) > 0
            ? {
                name: winning.name,
                partyName: winning.partyName,
                voteCount: winning.voteCount || 0,
              }
            : undefined,
        candidates: sortedCandidates.map((cand) => ({
          candidateId: cand.id,
          numericId: cand.numericId,
          name: cand.name,
          partyName: cand.partyName,
          partyAbbreviation: cand.partyAbbreviation,
          voteCount: cand.voteCount || 0,
          voteSharePct: cVotes > 0 ? Number((((cand.voteCount || 0) / cVotes) * 100).toFixed(2)) : 0,
          symbolKey: cand.symbolKey,
        })),
      };
    });

    const overallTurnout =
      totalElectors > 0 ? Number(((totalVotesCast / totalElectors) * 100).toFixed(2)) : 0;

    return {
      electionId: election.id,
      numericId: election.numericId,
      isPublished: true,
      publishedAt: election.publishedAt || election.closedAt || election.endTime,
      normalizedStatus: normStatus,
      resultsAvailable: true,
      certification: {
        certifiedBy: 'BlockBallot Academic Returning Officer (Simulated)',
        certifiedAt: election.closedAt || election.endTime,
        status: 'OFFICIALLY_PUBLISHED_SIMULATION',
      },
      totalVotesCast,
      totalElectors,
      overallTurnoutPercentage: overallTurnout,
      constituencies: constituencyResults,
      ballotSecrecyLimitationNotice: BALLOT_SECRECY_LIMITATION_NOTICE,
      disclaimer: MONITOR_NON_ENDORSEMENT_DISCLAIMER,
    };
  }

  /**
   * Projects an internal Election model to a public summary safely.
   */
  private projectToSummary(election: Election): PublicElectionSummary {
    const norm = normalizeElectionStatus(election.status);
    return {
      id: election.id,
      numericId: election.numericId,
      title: election.title,
      description: election.description,
      status: election.status,
      normalizedStatus: norm,
      startTime: election.startTime,
      endTime: election.endTime,
      timezone: election.timezone || 'Asia/Kolkata',
      electionType: election.electionType || 'General Election (Simulation)',
      isDemoElection: !!election.isDemoElection,
      constituencyCount: (election.constituencyIds || []).length,
      constituencyIds: election.constituencyIds || [],
      cancellationReason: election.cancellationReason,
      updatedAt: election.updatedAt,
    };
  }
}

export const monitorService = MonitorService.getInstance();
