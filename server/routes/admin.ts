import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { serverStore } from '../store';
import { ElectionStatus } from '../../src/types';

import { verifyAdminIdToken } from '../firebaseAdmin';

export const adminRouter = Router();

// In-memory admin session store: token -> { email: string; uid?: string; role?: string; expiresAt: number }
const adminSessions: Map<string, { email: string; uid?: string; role?: string; expiresAt: number }> = new Map();

export function clearAdminSessionsForTesting(): void {
  adminSessions.clear();
}

export function createAdminSessionForTesting(email = 'officer@blockballot.gov.in', role = 'Returning Officer'): { token: string; expiresAt: number } {
  const token = `adm_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
  adminSessions.set(token, {
    email,
    role,
    expiresAt,
  });
  return { token, expiresAt };
}


/**
 * Validates whether the incoming HTTP request holds a valid, active admin session token.
 */
export function verifyAdminAuth(req: Request): boolean {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7).trim() : undefined;
  if (!token) return false;

  const session = adminSessions.get(token);
  if (!session) return false;
  if (Date.now() > session.expiresAt) {
    adminSessions.delete(token);
    return false;
  }
  return true;
}

/**
 * POST /api/admin/login
 * Strictly validates Election Commission officer authentication via verified Firebase ID tokens.
 * Fails closed if the token is missing, expired, forged, or lacks verified administrator role.
 */
adminRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { idToken, googleToken } = req.body;
  const tokenToVerify = idToken || googleToken;

  if (!tokenToVerify || typeof tokenToVerify !== 'string') {
    res.status(401).json({
      success: false,
      message: 'Access denied: Valid Firebase officer authentication token required.',
    });
    return;
  }

  // Cryptographically verify ID token against Firebase Admin Auth and role registry
  const verification = await verifyAdminIdToken(tokenToVerify);

  if (!verification.isValid) {
    res.status(401).json({
      success: false,
      message: verification.error || 'Administrator authentication failed. Unauthorized credentials.',
    });
    return;
  }

  const officerEmail = verification.email || 'officer@blockballot.gov.in';
  const officerRole = verification.role || 'Returning Officer';
  const token = `adm_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = Date.now() + 4 * 60 * 60 * 1000; // 4 hours

  adminSessions.set(token, {
    email: officerEmail,
    uid: verification.uid,
    role: officerRole,
    expiresAt,
  });

  serverStore.recordAuditEvent({
    id: `audit-admin-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    type: 'ADMIN_ACTION',
    description: `Administrative officer authenticated: ${officerEmail} (Role: ${officerRole})`,
    electionId: 1,
  });

  res.status(200).json({
    success: true,
    message: 'Election Commission administrative officer authenticated successfully.',
    token,
    expiresAt,
    user: {
      email: officerEmail,
      role: officerRole,
      permissions: ['MANAGE_ELECTIONS', 'MANAGE_CANDIDATES', 'MANAGE_VOTERS', 'VIEW_AUDIT'],
    },
  });
});

/**
 * GET /api/elections
 * Publicly lists active, draft, paused, and concluded elections.
 */
adminRouter.get('/elections', (req: Request, res: Response): void => {
  const elections = serverStore.getAllElections();
  res.status(200).json({ success: true, elections });
});

/**
 * POST /api/admin/elections
 * Creates a new election with timeframe and numericId validation.
 */
adminRouter.post('/elections', (req: Request, res: Response): void => {
  if (!verifyAdminAuth(req)) {
    res.status(403).json({ success: false, message: 'Unauthorized. Officer authentication required.' });
    return;
  }

  const { title, description, electionType, numericId, startTime, endTime, contractAddress, constituencyIds, status } = req.body;

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    res.status(400).json({ success: false, message: 'Election title is required.' });
    return;
  }

  const start = Number(startTime) || Math.floor(Date.now() / 1000);
  const end = Number(endTime) || start + 86400 * 7;

  if (end <= start) {
    res.status(400).json({ success: false, message: 'Election closing deadline must be strictly after start time.' });
    return;
  }

  const id = `ELEC-${Date.now().toString(36).toUpperCase()}`;
  const numId = Number(numericId) || Math.floor(Math.random() * 900) + 100;
  const initialStatus: ElectionStatus = status === 'scheduled' ? 'scheduled' : 'draft';

  const created = serverStore.createElection({
    id,
    numericId: numId,
    title: title.trim(),
    description: description?.trim() || 'Administrator-configured parliamentary e-voting election.',
    status: initialStatus,
    startTime: start,
    endTime: end,
    contractAddress: contractAddress || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    constituencyIds: constituencyIds || ['CONST-04-ND', 'CONST-77-VAR'],
    electionType: electionType?.trim() || 'General Election',
    isDemoElection: false,
  });

  serverStore.recordAuditEvent({
    id: `audit-create-elec-${Date.now()}`,
    timestamp: Date.now(),
    type: 'ADMIN_ACTION',
    description: `Created election: ${created.title} (Type: ${created.electionType}, ID #${created.numericId}, Status: ${created.status})`,
    electionId: created.numericId,
  });

  res.status(201).json({ success: true, message: `Election created in ${created.status} state.`, election: created });
});

/**
 * PATCH /api/admin/elections/:id/status
 * Manages election lifecycle transitions (draft -> scheduled -> active -> paused -> concluded).
 */
adminRouter.patch('/elections/:id/status', (req: Request, res: Response): void => {
  if (!verifyAdminAuth(req)) {
    res.status(403).json({ success: false, message: 'Unauthorized. Officer authentication required.' });
    return;
  }

  const { id } = req.params;
  const { status } = req.body;

  if (!status || !['draft', 'scheduled', 'active', 'paused', 'concluded'].includes(status)) {
    res.status(400).json({
      success: false,
      message: 'Invalid status. Must be one of draft, scheduled, active, paused, or concluded.',
    });
    return;
  }

  const result = serverStore.updateElectionStatus(id, status as ElectionStatus);
  if (!result.success) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({ success: true, message: result.message, status });
});

/**
 * GET /api/constituencies
 */
adminRouter.get('/constituencies', (req: Request, res: Response): void => {
  const constituencies = serverStore.getAllConstituencies();
  res.status(200).json({ success: true, constituencies });
});

/**
 * GET /api/candidates
 */
adminRouter.get('/candidates', (req: Request, res: Response): void => {
  const { constituencyId } = req.query;
  const candidates = constituencyId
    ? serverStore.getCandidatesByConstituency(String(constituencyId))
    : serverStore.getAllCandidates();
  res.status(200).json({ success: true, candidates });
});

/**
 * POST /api/admin/candidates
 * Registers a nominated candidate before an election becomes active.
 */
adminRouter.post('/candidates', (req: Request, res: Response): void => {
  if (!verifyAdminAuth(req)) {
    res.status(403).json({ success: false, message: 'Unauthorized. Officer authentication required.' });
    return;
  }

  const {
    constituencyId,
    name,
    partyName,
    partyAbbreviation,
    symbol,
    symbolColor,
    education,
    age,
    criminalCases,
    assets,
  } = req.body;

  if (!constituencyId || !name || !partyName) {
    res.status(400).json({
      success: false,
      message: 'Missing candidate parameters (constituencyId, name, partyName).',
    });
    return;
  }

  const numericId = Math.floor(Math.random() * 800) + 100;
  const id = `CAND-${constituencyId.split('-')[1] || 'GEN'}-${Date.now().toString(36).substring(3, 6)}`;

  let symbolKey: any = 'UNAVAILABLE';
  let symbolDesc = 'Free symbol allotted by Returning Officer';
  let symbolSrc = 'ECI Form 7A List of Contesting Candidates';
  let symbolStatus: 'VERIFIED_ECI' | 'UNAVAILABLE' = 'UNAVAILABLE';

  const symLower = (symbol || '').toLowerCase();
  if (symLower.includes('lotus')) {
    symbolKey = 'LOTUS';
    symbolDesc = 'Lotus flower (Reserved National Party Symbol)';
    symbolSrc = 'ECI Notification No. 56/2024/PPS-III, Table I (National Parties)';
    symbolStatus = 'VERIFIED_ECI';
  } else if (symLower.includes('hand')) {
    symbolKey = 'HAND';
    symbolDesc = 'Open right palm facing forward (Reserved National Party Symbol)';
    symbolSrc = 'ECI Notification No. 56/2024/PPS-III, Table I (National Parties)';
    symbolStatus = 'VERIFIED_ECI';
  } else if (symLower.includes('broom')) {
    symbolKey = 'BROOM';
    symbolDesc = 'Traditional grass broom (Reserved National Party Symbol)';
    symbolSrc = 'ECI Notification No. 56/2024/PPS-III, Table I (National Parties)';
    symbolStatus = 'VERIFIED_ECI';
  } else if (symLower.includes('elephant')) {
    symbolKey = 'ELEPHANT';
    symbolDesc = 'Standing elephant (Reserved National Party Symbol)';
    symbolSrc = 'ECI Notification No. 56/2024/PPS-III, Table I (National Parties)';
    symbolStatus = 'VERIFIED_ECI';
  } else if (symLower.includes('corn') || symLower.includes('sickle')) {
    symbolKey = 'CORN_SICKLE';
    symbolDesc = 'Ears of corn and sickle';
    symbolSrc = 'ECI Notification No. 56/2024/PPS-III, Table II (Recognized State Parties)';
    symbolStatus = 'VERIFIED_ECI';
  } else if (symLower.includes('nota') || symLower.includes('cross')) {
    symbolKey = 'NOTA';
    symbolDesc = 'Rectangular ballot paper with black cross (X)';
    symbolSrc = 'ECI Direction No. 576/3/2015/SDR';
    symbolStatus = 'VERIFIED_ECI';
  }

  const cand = {
    id,
    numericId,
    constituencyId,
    name: name.trim(),
    partyName: partyName.trim(),
    partyAbbreviation: partyAbbreviation?.trim() || partyName.substring(0, 3).toUpperCase(),
    symbol: symbol || 'Hand',
    symbolKey,
    symbolDescription: symbolDesc,
    symbolSource: symbolSrc,
    symbolVerificationStatus: symbolStatus,
    symbolColor: symbolColor || '#16A34A',
    education: education || 'Graduate',
    age: Number(age) || 45,
    criminalCases: Number(criminalCases) || 0,
    assets: assets || '₹2.5 Cr',
    voteCount: 0,
  };

  const result = serverStore.addCandidate(cand);
  if (!result.success) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }

  res.status(201).json({ success: true, message: result.message, candidate: cand });
});

/**
 * GET /api/admin/voters
 */
adminRouter.get('/voters', (req: Request, res: Response): void => {
  if (!verifyAdminAuth(req)) {
    res.status(403).json({ success: false, message: 'Unauthorized. Officer authentication required.' });
    return;
  }
  const voters = serverStore.getAllVoters();
  res.status(200).json({ success: true, voters });
});

/**
 * PATCH /api/admin/voters/:id/eligibility
 */
adminRouter.patch('/voters/:id/eligibility', (req: Request, res: Response): void => {
  if (!verifyAdminAuth(req)) {
    res.status(403).json({ success: false, message: 'Unauthorized. Officer authentication required.' });
    return;
  }

  const { id } = req.params;
  const { isEligible } = req.body;

  const success = serverStore.setVoterEligibility(id, !!isEligible);
  if (!success) {
    res.status(400).json({
      success: false,
      message: 'Cannot alter eligibility for voters who have already cast ballots.',
    });
    return;
  }

  res.status(200).json({ success: true, message: 'Voter eligibility updated successfully.' });
});

/**
 * POST /api/admin/voters/:id/reset
 */
adminRouter.post('/voters/:id/reset', (req: Request, res: Response): void => {
  if (!verifyAdminAuth(req)) {
    res.status(403).json({ success: false, message: 'Unauthorized. Officer authentication required.' });
    return;
  }

  const { id } = req.params;
  const success = serverStore.resetVoterAuthorization(id);
  if (!success) {
    res.status(400).json({
      success: false,
      message: 'Reset prohibited: cannot reset an elector who has already cast a ballot.',
    });
    return;
  }

  res.status(200).json({ success: true, message: 'Voter authorization reset to ELIGIBLE state.' });
});

/**
 * GET /api/results
 * Aggregated election results with clear distinction between simulated EVM and on-chain verified votes.
 */
adminRouter.get('/results', (req: Request, res: Response): void => {
  const constituencies = serverStore.getAllConstituencies();
  const candidates = serverStore.getAllCandidates();
  const elections = serverStore.getAllElections();

  const totalRegisteredElectors = constituencies.reduce((acc, c) => acc + c.totalElectors, 0);
  const totalVotesCast = candidates.reduce((acc, c) => acc + c.voteCount, 0);
  const aggregateTurnoutPct =
    totalRegisteredElectors > 0
      ? Number(((totalVotesCast / totalRegisteredElectors) * 100).toFixed(2))
      : 0;

  // Group candidate tallies by constituency
  const constituencyBreakdown = constituencies.map((c) => {
    const cCandidates = candidates.filter((cand) => cand.constituencyId === c.id);
    const cVotes = cCandidates.reduce((acc, cand) => acc + cand.voteCount, 0);
    const sorted = [...cCandidates].sort((a, b) => b.voteCount - a.voteCount);
    const leadingCandidate = sorted[0];

    return {
      constituencyId: c.id,
      code: c.code,
      name: c.name,
      state: c.state,
      totalElectors: c.totalElectors,
      turnoutCount: c.turnoutCount || cVotes,
      votesCast: cVotes,
      leadingCandidate: leadingCandidate
        ? {
            name: leadingCandidate.name,
            partyName: leadingCandidate.partyName,
            voteCount: leadingCandidate.voteCount,
          }
        : null,
      candidates: cCandidates,
    };
  });

  res.status(200).json({
    success: true,
    disclaimer:
      'ACADEMIC PROTOTYPE NOTICE: Results reflect simulated EVM and local testnet executions. Do not correlate with real Indian general elections.',
    summary: {
      totalRegisteredElectors,
      totalVotesCast,
      turnoutPercentage: aggregateTurnoutPct,
      activeElectionsCount: elections.filter((e) => e.status === 'active').length,
    },
    constituencies: constituencyBreakdown,
  });
});

/**
 * GET /api/audit-events
 */
adminRouter.get('/audit-events', (req: Request, res: Response): void => {
  const auditEvents = serverStore.getAllAuditEvents();
  res.status(200).json({ success: true, auditEvents });
});
