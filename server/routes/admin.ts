import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { serverStore } from '../store';
import { ElectionStatus } from '../../src/types';
import { SERVER_CONFIG } from '../config';
import { verifyAdminIdToken } from '../firebaseAdmin';
import {
  OfficerSession,
  verifyOfficerCredentials,
  createOfficerSession,
  getOfficerSession,
  revokeOfficerSession,
  clearOfficerSessionsForTesting,
  registerOfficerSessionForTesting,
  extractSessionToken,
  authenticateOfficer,
  requirePermission,
  isConstituencyInScope,
  isElectionInScope,
} from '../auth/rbac';
import {
  Permission,
  AuthorityRole,
  ROLE_PERMISSIONS,
  hasPermission,
  getPermissionsForRole,
} from '../../src/types/permissions';
import { AuthorityAccount, SCHEMA_VERSION_CURRENT } from '../../src/types/dataModel';

export const adminRouter = Router();

// In-memory admin session store for backward compatibility
const adminSessions: Map<string, { email: string; uid?: string; role?: string; expiresAt: number }> = new Map();

export function clearAdminSessionsForTesting(): void {
  adminSessions.clear();
  clearOfficerSessionsForTesting();
}

export function createAdminSessionForTesting(
  email = 'officer@blockballot.gov.in',
  role: string = 'PLATFORM_ADMIN'
): { token: string; expiresAt: number } {
  const token = `adm_${crypto.randomBytes(32).toString('hex')}`;
  const expiresAt = Date.now() + 4 * 60 * 60 * 1000;
  adminSessions.set(token, {
    email,
    role,
    expiresAt,
  });

  // Map to AuthorityRole
  let mappedRole: AuthorityRole = 'PLATFORM_ADMIN';
  const upper = role.toUpperCase().replace(/\s+/g, '_');
  if (upper === 'ELECTION_OFFICER' || upper === 'EO') mappedRole = 'ELECTION_OFFICER';
  else if (upper === 'VOTER_REGISTRATION_OFFICER' || upper === 'VRO') mappedRole = 'VOTER_REGISTRATION_OFFICER';

  const officerSession: OfficerSession = {
    token,
    accountId: email.startsWith('EO') ? 'EO-SIM-001' : email.startsWith('VRO') ? 'VRO-SIM-001' : 'demo-admin-uid',
    email,
    displayName: email,
    role: mappedRole,
    status: 'ACTIVE',
    assignmentScope: mappedRole === 'PLATFORM_ADMIN' ? undefined : {
      state: 'Delhi',
      district: 'New Delhi',
      constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
      electionIds: ['GE-2024'],
    },
    permissions: getPermissionsForRole(mappedRole),
    createdAt: Date.now(),
    expiresAt,
    isRevoked: false,
  };
  registerOfficerSessionForTesting(officerSession);

  return { token, expiresAt };
}

/**
 * Validates whether the incoming HTTP request holds a valid, active admin or officer session token.
 */
export function verifyAdminAuth(req: Request): boolean {
  const token = extractSessionToken(req);
  if (!token) return false;

  const officerSession = getOfficerSession(token);
  if (officerSession) return true;

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
 * Validates Election Commission officer authentication via verified Firebase ID tokens
 * or local demo officer/administrator credentials in non-production environments.
 * Fails closed in production.
 */
adminRouter.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { idToken, googleToken, email, password } = req.body;
  const tokenToVerify = idToken || googleToken;

  // Flow A: ID Token verification (standard production & emulator flow)
  if (tokenToVerify && typeof tokenToVerify === 'string') {
    const verification = await verifyAdminIdToken(tokenToVerify);

    if (!verification.isValid) {
      serverStore.recordAuditEvent({
        id: `audit-login-fail-${Date.now()}`,
        timestamp: Date.now(),
        type: 'ADMIN_ACTION',
        description: `Firebase ID token verification failed: ${verification.error || 'Invalid credentials'}`,
        electionId: 1,
      });

      res.status(401).json({
        success: false,
        message: verification.error || 'Administrator authentication failed. Unauthorized credentials.',
      });
      return;
    }

    const officerEmail = verification.email || 'officer@blockballot.gov.in';
    const rawRole = (verification.role || '').toUpperCase();
    let officerRole: AuthorityRole = 'PLATFORM_ADMIN';
    if (rawRole.includes('ELECTION_OFFICER') || rawRole.includes('RETURNING')) {
      officerRole = 'ELECTION_OFFICER';
    } else if (rawRole.includes('VOTER_REGISTRATION')) {
      officerRole = 'VOTER_REGISTRATION_OFFICER';
    }

    const token = `adm_${crypto.randomBytes(32).toString('hex')}`;
    const expiresAt = Date.now() + 4 * 60 * 60 * 1000; // 4 hours

    adminSessions.set(token, {
      email: officerEmail,
      uid: verification.uid,
      role: officerRole,
      expiresAt,
    });

    const sessionAccount: AuthorityAccount = {
      id: verification.uid || `auth-${Date.now()}`,
      email: officerEmail,
      displayName: verification.email || 'Authorized Officer',
      role: officerRole,
      status: 'ACTIVE',
      assignmentScope: officerRole === 'PLATFORM_ADMIN' ? undefined : {
        state: 'Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    const session: OfficerSession = {
      token,
      accountId: sessionAccount.id,
      email: sessionAccount.email,
      displayName: sessionAccount.displayName,
      role: sessionAccount.role,
      status: 'ACTIVE',
      assignmentScope: sessionAccount.assignmentScope,
      permissions: getPermissionsForRole(officerRole),
      createdAt: Date.now(),
      expiresAt,
      isRevoked: false,
    };
    registerOfficerSessionForTesting(session);

    serverStore.recordAuditEvent({
      id: `audit-admin-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Administrative officer authenticated via token: ${officerEmail} (Role: ${officerRole})`,
      electionId: 1,
    });

    res.status(200).json({
      success: true,
      message: 'Election Commission administrative officer authenticated successfully.',
      token,
      expiresAt,
      user: {
        id: session.accountId,
        email: officerEmail,
        displayName: session.displayName,
        role: officerRole,
        scope: session.assignmentScope,
        permissions: session.permissions,
      },
    });
    return;
  }

  // Flow B: Local Operational Officer & Demo Administrator login (strictly disabled in production)
  if (email && typeof email === 'string' && password && typeof password === 'string') {
    if (SERVER_CONFIG.NODE_ENV === 'production' || process.env.NODE_ENV === 'production') {
      res.status(403).json({
        success: false,
        message: 'Access denied: Password authentication is disabled in production. Verified Commission hardware/ID tokens required.',
      });
      return;
    }

    const verification = await verifyOfficerCredentials(email, password);
    if (!verification.success || !verification.account) {
      serverStore.recordAuditEvent({
        id: `audit-login-fail-${Date.now()}`,
        timestamp: Date.now(),
        type: 'ADMIN_ACTION',
        description: `Failed officer login attempt for identifier '${email.trim()}'`,
        electionId: 1,
      });

      res.status(401).json({
        success: false,
        message: verification.message || 'Invalid administrative credentials.',
      });
      return;
    }

    const account = verification.account;
    const session = createOfficerSession(account);

    // Also populate legacy adminSessions map for backward compatibility
    adminSessions.set(session.token, {
      email: account.email,
      uid: account.id,
      role: account.role,
      expiresAt: session.expiresAt,
    });

    serverStore.recordAuditEvent({
      id: `audit-admin-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Operational officer authenticated: ${account.id} (${account.displayName}, Role: ${account.role})`,
      electionId: 1,
    });

    const userPermissions: string[] = [...session.permissions];
    if (account.role === 'PLATFORM_ADMIN') {
      userPermissions.push('MANAGE_ELECTIONS', 'MANAGE_CANDIDATES', 'MANAGE_VOTERS', 'VIEW_AUDIT');
    }

    res.status(200).json({
      success: true,
      message: `BlockBallot ${account.displayName} authenticated successfully.`,
      token: session.token,
      expiresAt: session.expiresAt,
      user: {
        id: account.id,
        email: account.email,
        displayName: account.displayName,
        role: account.role,
        scope: account.assignmentScope,
        permissions: userPermissions,
        isDemoAccount: true,
      },
    });
    return;
  }

  res.status(401).json({
    success: false,
    message: 'Access denied: Valid Firebase officer authentication token or demo credentials required.',
  });
});

/**
 * POST /api/admin/logout
 * Revokes current officer session.
 */
adminRouter.post('/logout', (req: Request, res: Response): void => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: 'No active session token provided.' });
    return;
  }

  const session = getOfficerSession(token);
  revokeOfficerSession(token);
  adminSessions.delete(token);

  if (session) {
    serverStore.recordAuditEvent({
      id: `audit-logout-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Officer logged out and session revoked: ${session.accountId} (${session.displayName})`,
      electionId: 1,
    });
  }

  res.status(200).json({ success: true, message: 'Administrative officer session terminated and revoked.' });
});

/**
 * GET /api/admin/session
 * Validates current session and returns verified account profile.
 */
adminRouter.get('/session', authenticateOfficer, (req: Request, res: Response): void => {
  const session = (req as any).officer as OfficerSession;
  res.status(200).json({
    success: true,
    user: {
      id: session.accountId,
      email: session.email,
      displayName: session.displayName,
      role: session.role,
      scope: session.assignmentScope,
      permissions: session.permissions,
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
 * Requires ELECTION_CREATE permission.
 */
adminRouter.post('/elections', requirePermission('ELECTION_CREATE'), async (req: Request, res: Response): Promise<void> => {
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

  const created = await serverStore.createElectionAsync({
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
 * Enforces action-specific permissions based on target status.
 */
adminRouter.patch('/elections/:id/status', async (req: Request, res: Response): Promise<void> => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: 'Unauthorized. Officer authentication required.' });
    return;
  }

  const session = getOfficerSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: 'Unauthorized. Session invalid, expired, or revoked.' });
    return;
  }

  if (session.status !== 'ACTIVE') {
    res.status(403).json({ success: false, message: `Forbidden. Account is ${session.status}.` });
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

  // Resolve target permission
  let requiredPermission: Permission = 'ELECTION_UPDATE';
  if (status === 'active') {
    requiredPermission = 'ELECTION_ACTIVATE';
  } else if (status === 'paused') {
    requiredPermission = 'ELECTION_PAUSE';
  } else if (status === 'concluded') {
    requiredPermission = 'ELECTION_CONCLUDE';
  }

  if (!hasPermission(session.role, requiredPermission)) {
    serverStore.recordAuditEvent({
      id: `audit-denied-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Access denied: Account '${session.accountId}' (${session.role}) lacks permission '${requiredPermission}' to transition election to '${status}'`,
      electionId: 1,
    });

    res.status(403).json({
      success: false,
      message: `Forbidden: Account role '${session.role}' lacks permission '${requiredPermission}' required to transition election to '${status}'.`,
      requiredPermission,
      role: session.role,
    });
    return;
  }

  const result = await serverStore.updateElectionStatusAsync(id, status as ElectionStatus);
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
 * Requires CANDIDATE_MANAGE permission and enforces jurisdiction scope.
 */
adminRouter.post('/candidates', requirePermission('CANDIDATE_MANAGE'), async (req: Request, res: Response): Promise<void> => {
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

  // Scope enforcement: verify candidate constituency is within officer's assignment scope
  const session = (req as any).officer as OfficerSession;
  if (session && !isConstituencyInScope(session.assignmentScope, constituencyId)) {
    serverStore.recordAuditEvent({
      id: `audit-scope-denied-${Date.now()}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Scope violation: Account '${session.accountId}' attempted adding candidate to out-of-scope constituency '${constituencyId}'`,
      electionId: 1,
    });

    res.status(403).json({
      success: false,
      message: `Access denied: Constituency '${constituencyId}' is outside officer's authorized assignment scope.`,
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

  const result = await serverStore.addCandidateAsync(cand);
  if (!result.success) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }

  res.status(201).json({ success: true, message: result.message, candidate: cand });
});

/**
 * GET /api/admin/voters
 * Requires VOTER_READ permission.
 */
adminRouter.get('/voters', requirePermission('VOTER_READ'), (req: Request, res: Response): void => {
  const voters = serverStore.getAllVoters();
  res.status(200).json({ success: true, voters });
});

/**
 * PATCH /api/admin/voters/:id/eligibility
 * Requires VOTER_UPDATE permission.
 */
adminRouter.patch('/voters/:id/eligibility', requirePermission('VOTER_UPDATE'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const { isEligible } = req.body;

  const success = await serverStore.setVoterEligibilityAsync(id, !!isEligible);
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
 * Requires VOTER_UPDATE permission.
 */
adminRouter.post('/voters/:id/reset', requirePermission('VOTER_UPDATE'), async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const success = await serverStore.resetVoterAuthorizationAsync(id);
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
 * Public summary or administrative audit stream.
 */
adminRouter.get('/audit-events', (req: Request, res: Response): void => {
  const auditEvents = serverStore.getAllAuditEvents();
  res.status(200).json({ success: true, auditEvents });
});

/**
 * GET /api/admin/audit or /api/admin/audit-events
 * Requires AUDIT_READ permission.
 */
adminRouter.get(
  ['/audit', '/admin/audit', '/audit-events-protected'],
  requirePermission('AUDIT_READ'),
  (req: Request, res: Response): void => {
    const auditEvents = serverStore.getAllAuditEvents();
    res.status(200).json({ success: true, auditEvents });
  }
);
