import { Router, Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { serverStore } from '../store';
import { ElectionStatus, normalizeElectionStatus } from '../../../frontend/src/types';
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
} from '../../../frontend/src/types/permissions';
import {
  AuthorityAccount,
  AuthorityAssignmentScope,
  VoterProfile,
  BiometricEnrollmentMetadata,
  BiometricModality,
  ManualIdExceptionRecord,
  ExceptionPurpose,
  ExceptionStatus,
  ExceptionReasonCode,
  VALID_EXCEPTION_REASON_CODES,
  FORBIDDEN_EXCEPTION_KEYS,
  validateManualIdException,
  SCHEMA_VERSION_CURRENT,
  computeAuthoritativeEligibility,
} from '../../../frontend/src/types/dataModel';
import { getDataRepositories } from '../repositories';
import { saveStaffCredential, getStaffCredential, clearStaffCredentialsForTesting } from '../auth/credentials';
import {
  generateUniqueSimulationVoterId,
  calculateAgeFromDob,
  isValidSimulationVoterId,
} from '../utils/voterId';
import { validateNoProhibitedFields, sanitizeLogData, maskMobile } from '../security';
import { normalizePhoneNumber } from '../utils/phoneNormalization';


export interface PendingVoterRegistration {
  pendingId: string;
  details: {
    fullName: string;
    dateOfBirth: string;
    gender: 'M' | 'F' | 'O';
    state: string;
    district: string;
    constituencyId: string;
    pollingStation: string;
    maskedMobile: string;
    normalizedMobile?: string;
    age: number;
  };
  fingerprintVerification: {
    status: 'NOT_VERIFIED' | 'VERIFIED' | 'UNSUCCESSFUL' | 'CANCELLED';
    verifiedByOfficerId?: string;
    verifiedAt?: number;
    notes?: string;
    attempts: number;
  };
  photoVerification: {
    status: 'NOT_VERIFIED' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
    verifiedByOfficerId?: string;
    verifiedAt?: number;
    photoUrl?: string;
    notes?: string;
  };
  createdByOfficerId: string;
  createdAt: number;
  updatedAt: number;
  isFinalized: boolean;
  status: 'PENDING' | 'VERIFICATION_IN_PROGRESS' | 'CANCELLED' | 'FINALIZED' | 'EXPIRED';
  cancelledAt?: number;
  cancelledByOfficerId?: string;
  cancellationReason?: string;
}

export const pendingRegistrations = new Map<string, PendingVoterRegistration>();

export function clearPendingRegistrationsForTesting(): void {
  pendingRegistrations.clear();
}

// Rate-limiting map for staff password changes
const passwordChangeAttempts = new Map<string, { count: number; resetAt: number }>();

function checkPasswordChangeRateLimit(accountId: string): { allowed: boolean; remainingSec: number } {
  const now = Date.now();
  const entry = passwordChangeAttempts.get(accountId);
  if (!entry || now > entry.resetAt) {
    passwordChangeAttempts.set(accountId, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return { allowed: true, remainingSec: 0 };
  }
  if (entry.count >= 5) {
    const remainingSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    return { allowed: false, remainingSec };
  }
  entry.count++;
  return { allowed: true, remainingSec: 0 };
}

export const adminRouter = Router();

// In-memory admin session store for backward compatibility
export const adminSessions: Map<string, { email: string; uid?: string; role?: string; expiresAt: number }> = new Map();

export function clearAdminSessionsForTesting(): void {
  adminSessions.clear();
  clearOfficerSessionsForTesting();
}

export function createAdminSessionForTesting(
  email = 'officer@blockballot.gov.in',
  role: string = 'PLATFORM_ADMIN',
  scopeOverride?: AuthorityAssignmentScope
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

  const defaultScope: AuthorityAssignmentScope = {
    state: 'Delhi',
    district: 'New Delhi',
    constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
  };

  const officerSession: OfficerSession = {
    token,
    accountId: email.startsWith('EO') ? 'EO-SIM-001' : email.startsWith('VRO') ? 'VRO-SIM-001' : 'demo-admin-uid',
    email,
    displayName: email,
    role: mappedRole,
    status: 'ACTIVE',
    assignmentScope: mappedRole === 'PLATFORM_ADMIN' ? undefined : (scopeOverride || defaultScope),
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

  // Flow B: Local Operational Officer & Demo Administrator login (strictly disabled in production unless HOSTED_DEMO_ENABLED)
  if (email && typeof email === 'string' && password && typeof password === 'string') {
    const isProd = SERVER_CONFIG.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
    const isHostedDemo = process.env.HOSTED_DEMO_ENABLED === 'true';

    if (isProd && !isHostedDemo) {
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
 * Publicly lists active, draft, paused, concluded, and cancelled elections.
 * Automatically triggers server-authoritative schedule reconciliation.
 */
adminRouter.get('/elections', (req: Request, res: Response): void => {
  const elections = serverStore.getAllElections();
  res.status(200).json({ success: true, elections });
});

/**
 * GET /api/elections/:id/status
 * Authoritative election status endpoint with server-authoritative time,
 * countdown metrics, and current lifecycle state.
 */
adminRouter.get('/elections/:id/status', (req: Request, res: Response): void => {
  const { id } = req.params;
  const statusInfo = serverStore.getAuthoritativeElectionStatus(id);

  if (!statusInfo) {
    res.status(404).json({ success: false, message: 'Election record not found.' });
    return;
  }

  res.status(200).json({ success: true, electionStatus: statusInfo });
});

/**
 * POST /api/admin/elections/reconcile
 * Idempotently reconciles election schedules against the authoritative server clock.
 */
adminRouter.post('/elections/reconcile', (req: Request, res: Response): void => {
  const result = serverStore.reconcileElectionSchedules();
  res.status(200).json({
    success: true,
    serverTimeSec: serverStore.getCurrentTimeSec(),
    serverTimeIso: new Date(serverStore.getCurrentTimeMs()).toISOString(),
    transitions: result.transitions,
  });
});

/**
 * POST /api/admin/elections
 * Creates a new election with timeframe and numericId validation.
 * Requires ELECTION_CREATE permission and scope verification.
 */
adminRouter.post('/elections', requirePermission('ELECTION_CREATE'), async (req: Request, res: Response): Promise<void> => {
  const { description, electionType, numericId, contractAddress, constituencyIds, status, timezone } = req.body;
  const rawTitle = req.body.title || req.body.name;

  if (!rawTitle || typeof rawTitle !== 'string' || rawTitle.trim().length === 0) {
    res.status(400).json({ success: false, message: 'Election title is required.' });
    return;
  }
  const title = rawTitle.trim();

  // Scope enforcement: verify all constituencyIds are within officer's assignment scope
  const session = (req as any).officer as OfficerSession;
  if (session && session.assignmentScope && constituencyIds && Array.isArray(constituencyIds)) {
    for (const cId of constituencyIds) {
      if (!isConstituencyInScope(session.assignmentScope, cId)) {
        serverStore.recordAuditEvent({
          id: `audit-scope-denied-${Date.now()}`,
          timestamp: Date.now(),
          type: 'ADMIN_ACTION',
          description: `Scope violation: Account '${session.accountId}' attempted creating election with out-of-scope constituency '${cId}'`,
          electionId: 1,
        });

        res.status(403).json({
          success: false,
          message: `Access denied: Constituency '${cId}' is outside officer's authorized assignment scope.`,
        });
        return;
      }
    }
  }

  const parseTime = (val: any): number | null => {
    if (!val) return null;
    if (typeof val === 'number') return val > 1e11 ? Math.floor(val / 1000) : val;
    if (typeof val === 'string') {
      const num = Number(val);
      if (!isNaN(num) && num > 0) return num > 1e11 ? Math.floor(num / 1000) : num;
      const parsed = Date.parse(val);
      if (!isNaN(parsed)) return Math.floor(parsed / 1000);
    }
    return null;
  };

  const start = parseTime(req.body.startTime || req.body.startDate) || Math.floor(Date.now() / 1000);
  const end = parseTime(req.body.endTime || req.body.endDate) || (start + 86400 * 7);

  if (end <= start) {
    res.status(400).json({ success: false, message: 'Election closing deadline must be strictly after start time.' });
    return;
  }

  const id = (req.body.id && typeof req.body.id === 'string') ? req.body.id.trim() : `ELEC-${Date.now().toString(36).toUpperCase()}`;
  const numId = Number(numericId) || Math.floor(Math.random() * 900) + 100;
  
  let initialStatus: ElectionStatus = 'draft';
  if (status === 'scheduled' || status === 'SCHEDULED') {
    initialStatus = 'scheduled';
  } else if (status === 'active' || status === 'OPEN') {
    initialStatus = 'active';
  }

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
    timezone: timezone || 'Asia/Kolkata',
  });

  serverStore.recordAuditEvent({
    id: `audit-create-elec-${Date.now()}`,
    timestamp: Date.now(),
    type: 'ADMIN_ACTION',
    description: `Created election: ${created.title} (Type: ${created.electionType}, ID #${created.numericId}, Status: ${created.status})`,
    electionId: created.numericId,
  });

  if (session && session.assignmentScope && session.assignmentScope.electionIds) {
    if (!session.assignmentScope.electionIds.includes(created.id)) {
      session.assignmentScope.electionIds.push(created.id);
    }
  }

  res.status(201).json({ success: true, message: `Election created in ${created.status} state.`, election: created });
});

/**
 * PATCH /api/admin/elections/:id
 * Updates draft or scheduled election configuration before voting opens.
 * Requires ELECTION_UPDATE permission and scope checking.
 */
adminRouter.patch('/elections/:id', requirePermission('ELECTION_UPDATE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const { id } = req.params;

  const targetElectionEarly = serverStore.getElectionById(id) || serverStore.findElectionByNumericId(Number(id));
  const hasScopeAccessPatch =
    !session?.assignmentScope ||
    isElectionInScope(session.assignmentScope, id) ||
    Boolean(
      targetElectionEarly &&
      targetElectionEarly.constituencyIds &&
      targetElectionEarly.constituencyIds.some((cId: string) => isConstituencyInScope(session.assignmentScope, cId))
    );

  if (!hasScopeAccessPatch) {
    serverStore.recordAuditEvent({
      id: `audit-scope-denied-${Date.now()}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Scope violation: Account '${session?.accountId}' attempted config edit on out-of-scope election '${id}'`,
      electionId: 1,
    });

    res.status(403).json({
      success: false,
      message: `Access denied: Election '${id}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  const result = await serverStore.updateElectionAsync(id, req.body, session?.accountId);
  if (!result.success) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({ success: true, message: result.message, election: result.election });
});

/**
 * PATCH / PUT /api/admin/elections/:id/status
 * Manages election lifecycle transitions (draft -> scheduled -> active -> paused -> concluded / cancelled).
 * Enforces action-specific permissions and officer assignment scope.
 */
const handleElectionStatusUpdate = async (req: Request, res: Response): Promise<void> => {
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
  const { status, reason } = req.body;

  // Scope enforcement: verify election is in officer's scope or its constituencies are in jurisdiction
  const targetElection = serverStore.getElectionById(id) || serverStore.findElectionByNumericId(Number(id));
  const hasScopeAccess =
    !session.assignmentScope ||
    isElectionInScope(session.assignmentScope, id) ||
    Boolean(
      targetElection &&
      targetElection.constituencyIds &&
      targetElection.constituencyIds.some((cId: string) => isConstituencyInScope(session.assignmentScope, cId))
    );

  if (!hasScopeAccess) {
    serverStore.recordAuditEvent({
      id: `audit-scope-denied-${Date.now()}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Scope violation: Account '${session.accountId}' attempted status change on out-of-scope election '${id}'`,
      electionId: 1,
    });

    res.status(403).json({
      success: false,
      message: `Access denied: Election '${id}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  const validStatuses = [
    'draft',
    'scheduled',
    'active',
    'paused',
    'concluded',
    'cancelled',
    'DRAFT',
    'SCHEDULED',
    'OPEN',
    'PAUSED',
    'CLOSED',
    'CANCELLED',
  ];
  if (!status || !validStatuses.includes(status)) {
    res.status(400).json({
      success: false,
      message: 'Invalid status. Must be one of draft, scheduled, active/OPEN, paused, concluded/CLOSED, or cancelled.',
    });
    return;
  }

  // Resolve target permission
  const normStatus = normalizeElectionStatus(status);
  let requiredPermission: Permission = 'ELECTION_UPDATE';
  if (normStatus === 'OPEN') {
    requiredPermission = 'ELECTION_ACTIVATE';
  } else if (normStatus === 'PAUSED') {
    requiredPermission = 'ELECTION_PAUSE';
  } else if (normStatus === 'CLOSED' || normStatus === 'CANCELLED') {
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

  if (normStatus === 'CANCELLED') {
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({
        success: false,
        message: 'A valid justification reason (minimum 5 characters) is required to cancel an election.',
      });
      return;
    }
  }

  const result = await serverStore.updateElectionStatusAsync(id, status as ElectionStatus, {
    reason,
    officerId: session.accountId,
  });
  if (!result.success) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({
    success: true,
    message: result.message,
    status: result.election?.status || status,
  });
};

adminRouter.patch('/elections/:id/status', handleElectionStatusUpdate);
adminRouter.put('/elections/:id/status', handleElectionStatusUpdate);

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
    electionId,
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

  const numericId = Number(req.body.numericId) || Math.floor(Math.random() * 800) + 100;
  const id = (req.body.id && typeof req.body.id === 'string')
    ? req.body.id.trim()
    : `CAND-${constituencyId.split('-')[1] || 'GEN'}-${Date.now().toString(36).substring(3, 6)}`;

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
    electionId: electionId ? String(electionId) : undefined,
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
 * PATCH /api/admin/candidates/:id
 * Edits candidate fields before the election opens.
 * Requires CANDIDATE_MANAGE permission and scope checking.
 */
adminRouter.patch('/candidates/:id', requirePermission('CANDIDATE_MANAGE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const { id } = req.params;
  const candidate = serverStore.getAllCandidates().find((c) => c.id === id);

  if (!candidate) {
    res.status(404).json({ success: false, message: 'Candidate record not found.' });
    return;
  }

  if (session && !isConstituencyInScope(session.assignmentScope, candidate.constituencyId)) {
    serverStore.recordAuditEvent({
      id: `audit-scope-denied-${Date.now()}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Scope violation: Account '${session.accountId}' attempted editing candidate in out-of-scope constituency '${candidate.constituencyId}'`,
      electionId: 1,
    });

    res.status(403).json({
      success: false,
      message: `Access denied: Candidate constituency '${candidate.constituencyId}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  const result = await serverStore.updateCandidateAsync(id, req.body, session?.accountId);
  if (!result.success) {
    const isLocked = result.message.toLowerCase().includes('lock') || result.message.toLowerCase().includes('vote');
    res.status(isLocked ? 403 : 400).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({ success: true, message: result.message, candidate: result.candidate });
});

/**
 * DELETE /api/admin/candidates/:id
 * Removes candidate nomination before voting opens.
 * Requires CANDIDATE_MANAGE permission and scope checking.
 */
adminRouter.delete('/candidates/:id', requirePermission('CANDIDATE_MANAGE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const { id } = req.params;
  const candidate = serverStore.getAllCandidates().find((c) => c.id === id);

  if (!candidate) {
    res.status(404).json({ success: false, message: 'Candidate record not found.' });
    return;
  }

  if (session && !isConstituencyInScope(session.assignmentScope, candidate.constituencyId)) {
    serverStore.recordAuditEvent({
      id: `audit-scope-denied-${Date.now()}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Scope violation: Account '${session.accountId}' attempted deleting candidate in out-of-scope constituency '${candidate.constituencyId}'`,
      electionId: 1,
    });

    res.status(403).json({
      success: false,
      message: `Access denied: Candidate constituency '${candidate.constituencyId}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  const result = await serverStore.deleteCandidateAsync(id, session?.accountId);
  if (!result.success) {
    const isLocked =
      result.message.toLowerCase().includes('lock') ||
      result.message.toLowerCase().includes('active') ||
      result.message.toLowerCase().includes('conclude') ||
      result.message.toLowerCase().includes('vote');
    res.status(isLocked ? 403 : 400).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({ success: true, message: result.message });
});

/**
 * PATCH /api/admin/candidates/:id/deactivate
 * Formally withdraws/deactivates a candidate with an audited reason.
 * Requires CANDIDATE_MANAGE permission and scope checking.
 */
adminRouter.patch('/candidates/:id/deactivate', requirePermission('CANDIDATE_MANAGE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const { id } = req.params;
  const { reason } = req.body;
  const candidate = serverStore.getAllCandidates().find((c) => c.id === id);

  if (!candidate) {
    res.status(404).json({ success: false, message: 'Candidate record not found.' });
    return;
  }

  if (session && !isConstituencyInScope(session.assignmentScope, candidate.constituencyId)) {
    serverStore.recordAuditEvent({
      id: `audit-scope-denied-${Date.now()}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Scope violation: Account '${session.accountId}' attempted deactivating candidate in out-of-scope constituency '${candidate.constituencyId}'`,
      electionId: 1,
    });

    res.status(403).json({
      success: false,
      message: `Access denied: Candidate constituency '${candidate.constituencyId}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
    res.status(400).json({
      success: false,
      message: 'A valid justification reason (minimum 5 characters) is required to deactivate or withdraw a candidate.',
    });
    return;
  }

  const result = await serverStore.deactivateCandidateAsync(id, reason.trim(), session?.accountId);
  if (!result.success) {
    res.status(400).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({ success: true, message: result.message, candidate: result.candidate });
});

const FORBIDDEN_BIOMETRIC_REGISTRATION_KEYS = [
  'rawBytes',
  'rawImage',
  'faceImage',
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
  'biometrics',
  'biometricPayload',
  'rawBiometric',
];

/**
 * POST /api/admin/voters
 * Enrolls a new synthetic voter profile with backend-generated unique simulation voter ID.
 * Requires VOTER_CREATE permission and scope check.
 */
adminRouter.post('/voters', requirePermission('VOTER_CREATE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const repos = getDataRepositories();

  // 1. Invariant: Strict biometric prohibition in registration endpoints
  for (const forbiddenKey of FORBIDDEN_BIOMETRIC_REGISTRATION_KEYS) {
    if (forbiddenKey in req.body && req.body[forbiddenKey] !== undefined) {
      serverStore.recordAuditEvent({
        id: `audit-voter-reject-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        type: 'ADMIN_ACTION',
        description: `Rejected voter registration attempt: Prohibited biometric field '${forbiddenKey}' submitted by '${session?.accountId}'`,
        electionId: 1,
      });

      res.status(400).json({
        success: false,
        message: 'Biometric data payloads are not accepted in Phase 04 voter registry endpoints.',
      });
      return;
    }
  }

  if (req.body.bypassFingerprint || req.body.skipFingerprint || req.body.bypassPhoto || req.body.skipPhoto) {
    res.status(400).json({
      success: false,
      code: 'BIOMETRIC_VERIFICATION_REQUIRED',
      message: 'Compulsory biometric verification cannot be bypassed. Complete the 3-stage registration flow.',
    });
    return;
  }

  const prohibitedCheck = validateNoProhibitedFields(req.body);
  if (!prohibitedCheck.isValid) {
    res.status(400).json({
      success: false,
      message: `Prohibited sensitive field(s) rejected: ${prohibitedCheck.forbiddenFound.join(', ')}`,
    });
    return;
  }

  const {
    fullName,
    dateOfBirth,
    gender,
    state,
    district,
    constituencyId,
    pollingStation,
    maskedMobile,
  } = req.body;

  // 2. Validate required registration fields
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    res.status(400).json({
      success: false,
      message: 'Invalid fullName: Elector full name must be at least 2 characters long.',
    });
    return;
  }

  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    res.status(400).json({
      success: false,
      message: 'Invalid dateOfBirth: Must be in canonical ISO 8601 format (YYYY-MM-DD).',
    });
    return;
  }

  // 3. Voting-age eligibility validation (age >= 18 on registration date)
  const age = calculateAgeFromDob(dateOfBirth);
  if (age < 18) {
    serverStore.recordAuditEvent({
      id: `audit-age-fail-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Voter registration rejected: Age ${age} is under statutory minimum (18) for registration by '${session?.accountId}'`,
      electionId: 1,
    });

    res.status(400).json({
      success: false,
      message: 'Voting-age eligibility violation: Elector must be at least 18 years of age on registration date.',
    });
    return;
  }

  if (!gender || !['M', 'F', 'O'].includes(gender)) {
    res.status(400).json({
      success: false,
      message: "Invalid gender: Must be 'M', 'F', or 'O'.",
    });
    return;
  }

  if (!constituencyId || typeof constituencyId !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Missing constituencyId: Elector must be assigned to an active constituency.',
    });
    return;
  }

  // 4. Validate geographic assignment against reference registry
  const validConstituency = serverStore.getAllConstituencies().some((c) => c.id === constituencyId);
  if (!validConstituency) {
    res.status(400).json({
      success: false,
      message: `Invalid geographic assignment: Constituency '${constituencyId}' does not exist in the electoral registry.`,
    });
    return;
  }

  // 5. Scope enforcement: verify constituency is within officer's authorized assignment scope
  if (session && !isConstituencyInScope(session.assignmentScope, constituencyId)) {
    serverStore.recordAuditEvent({
      id: `audit-voter-scope-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Scope violation: Account '${session.accountId}' attempted creating voter in out-of-scope constituency '${constituencyId}'`,
      electionId: 1,
    });

    res.status(403).json({
      success: false,
      message: `Scope violation: Constituency '${constituencyId}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  // 6. Generate server-owned unique simulation voter ID (ignoring any client-supplied ID)
  let simulationVoterId = '';
  try {
    simulationVoterId = await generateUniqueSimulationVoterId(repos.voterProfiles);
  } catch (err: any) {
    serverStore.recordAuditEvent({
      id: `audit-id-col-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Failed to generate unique simulation ID: ${err.message}`,
      electionId: 1,
    });
    res.status(500).json({ success: false, message: 'Internal error generating unique simulation ID.' });
    return;
  }

  const internalId = `vpr_${crypto.randomUUID()}`;
  const now = Date.now();

  const profile: VoterProfile = {
    id: internalId,
    simulationVoterId,
    fullName: fullName.trim(),
    dateOfBirth,
    gender,
    state: state?.trim() || 'NCT of Delhi',
    district: district?.trim() || 'New Delhi',
    constituencyId,
    pollingStation: pollingStation?.trim() || 'Civic Community Centre, Polling Booth 1',
    maskedMobile: maskedMobile?.trim() || '+91 ••••• •1122',
    registrationStatus: 'REGISTERED',
    eligibilityStatus: req.body.biometricsPending || req.body.eligibilityStatus === 'INELIGIBLE_BIOMETRIC_PENDING'
      ? 'INELIGIBLE_BIOMETRIC_PENDING'
      : 'ELIGIBLE',
    lifecycleStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    createdByOfficerId: session?.accountId || 'VRO-SIM-001',
    schemaVersion: SCHEMA_VERSION_CURRENT,
  };

  // 7. Persist to repository
  try {
    await repos.voterProfiles.save(profile);
  } catch (err: any) {
    serverStore.recordAuditEvent({
      id: `audit-persist-fail-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Failed to persist voter profile '${simulationVoterId}': ${err.message}`,
      electionId: 1,
    });
    res.status(500).json({ success: false, message: `Persistence failure: ${err.message}` });
    return;
  }

  // 8. Initialize biometric enrollment metadata stubs (both NOT_STARTED)
  try {
    const faceMeta: BiometricEnrollmentMetadata = {
      id: `bio_${profile.id}_face`,
      voterId: profile.id,
      modality: 'FACE',
      status: 'NOT_STARTED',
      biometricReferenceId: 'unassigned',
      qualityCheckStatus: 'PENDING',
      isManualException: false,
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const fpMeta: BiometricEnrollmentMetadata = {
      id: `bio_${profile.id}_fingerprint`,
      voterId: profile.id,
      modality: 'FINGERPRINT',
      status: 'NOT_STARTED',
      biometricReferenceId: 'unassigned',
      qualityCheckStatus: 'PENDING',
      isManualException: false,
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.biometrics.saveMetadata(faceMeta);
    await repos.biometrics.saveMetadata(fpMeta);
  } catch (err: any) {
    console.warn('[VoterRegistry] Notice initializing biometric metadata stubs:', err.message);
  }

  // 9. Synchronize with runtime serverStore cache for seamless voter journey lookup
  serverStore.setVoterRecord({
    id: profile.id,
    epicId: profile.simulationVoterId,
    name: profile.fullName,
    gender: profile.gender,
    age,
    constituencyId: profile.constituencyId,
    pollingStation: profile.pollingStation,
    maskedMobile: profile.maskedMobile,
    isEligible: !(req.body.biometricsPending || req.body.eligibilityStatus === 'INELIGIBLE_BIOMETRIC_PENDING'),
    status: 'ELIGIBLE',
  });

  // 10. Record structured audit event
  serverStore.recordAuditEvent({
    id: `audit-voter-create-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    type: 'ADMIN_ACTION',
    description: `Voter profile created: '${profile.simulationVoterId}' in constituency '${profile.constituencyId}' by officer '${session?.accountId}'`,
    electionId: 1,
  });

  res.status(201).json({
    success: true,
    message: 'Voter profile registered successfully with backend-generated simulation ID.',
    voter: {
      id: profile.id,
      simulationVoterId: profile.simulationVoterId,
      fullName: profile.fullName,
      gender: profile.gender,
      dateOfBirth: profile.dateOfBirth,
      state: profile.state,
      district: profile.district,
      constituencyId: profile.constituencyId,
      pollingStation: profile.pollingStation,
      maskedMobile: profile.maskedMobile,
      registrationStatus: profile.registrationStatus,
      eligibilityStatus: profile.eligibilityStatus,
      lifecycleStatus: profile.lifecycleStatus,
      createdAt: profile.createdAt,
    },
  });
});

/**
 * GET /api/admin/voters
 * Lists voter records within the officer's authorized assignment scope.
 * Supports query parameters: constituencyId, search, registrationStatus, eligibilityStatus, limit.
 * Requires VOTER_READ permission.
 */
adminRouter.get('/voters', requirePermission('VOTER_READ'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const repos = getDataRepositories();

  const { constituencyId, search, registrationStatus, eligibilityStatus, limit } = req.query;

  // Scope check on explicit constituency query
  if (constituencyId && typeof constituencyId === 'string') {
    if (session && !isConstituencyInScope(session.assignmentScope, constituencyId)) {
      res.status(403).json({
        success: false,
        message: `Scope violation: Access to constituency '${constituencyId}' is outside officer's authorized assignment scope.`,
      });
      return;
    }
  }

  // Query repository
  let profiles = await repos.voterProfiles.list({
    constituencyId: constituencyId ? String(constituencyId) : undefined,
    registrationStatus: registrationStatus ? (String(registrationStatus) as any) : undefined,
    eligibilityStatus: eligibilityStatus ? (String(eligibilityStatus) as any) : undefined,
    limit: limit ? Number(limit) : undefined,
  });

  // Apply officer scope filtering
  if (session && session.assignmentScope?.constituencyIds && session.assignmentScope.constituencyIds.length > 0) {
    const allowed = new Set(session.assignmentScope.constituencyIds);
    profiles = profiles.filter((p) => allowed.has(p.constituencyId));
  }

  // Include in-memory serverStore voters for backwards compatibility
  const serverVoters = serverStore.getAllVoters();
  const knownSimulationIds = new Set(profiles.map((p) => p.simulationVoterId.toUpperCase()));

  for (const sv of serverVoters) {
    if (knownSimulationIds.has(sv.epicId.toUpperCase())) continue;
    if (constituencyId && sv.constituencyId !== String(constituencyId)) continue;
    if (session && !isConstituencyInScope(session.assignmentScope, sv.constituencyId)) continue;

    profiles.push({
      id: sv.id,
      simulationVoterId: sv.epicId,
      fullName: sv.name,
      dateOfBirth: '1995-01-01',
      gender: sv.gender,
      state: 'NCT of Delhi',
      district: 'New Delhi',
      constituencyId: sv.constituencyId,
      pollingStation: sv.pollingStation,
      maskedMobile: maskMobile(sv.maskedMobile),
      registrationStatus: 'REGISTERED',
      eligibilityStatus: sv.isEligible ? 'ELIGIBLE' : 'INELIGIBLE_DISQUALIFIED',
      lifecycleStatus: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    });
  }

  // Apply search query filter if supplied
  if (search && typeof search === 'string' && search.trim()) {
    const q = search.trim().toLowerCase();
    profiles = profiles.filter(
      (p) =>
        p.simulationVoterId.toLowerCase().includes(q) ||
        p.fullName.toLowerCase().includes(q) ||
        p.constituencyId.toLowerCase().includes(q)
    );
  }

  const resolvedProfiles = await Promise.all(
    profiles.map(async (p) => {
      const bioList = await repos.biometrics.listByVoter(p.id);
      const face = bioList.find((b) => b.modality === 'FACE');
      const fp = bioList.find((b) => b.modality === 'FINGERPRINT');
      const auth = computeAuthoritativeEligibility(p, {
        faceStatus: face?.status,
        fingerprintStatus: fp?.status,
      });
      return {
        ...p,
        eligibilityStatus: auth.eligibilityStatus,
      };
    })
  );

  res.status(200).json({ success: true, voters: resolvedProfiles, count: resolvedProfiles.length });
});

/**
 * GET /api/admin/voters/:id
 * Retrieves a permitted voter profile by internal ID or simulation ID.
 * Returns safe registration details and biometric status metadata.
 * Requires VOTER_READ permission.
 */
adminRouter.get('/voters/:id', requirePermission('VOTER_READ'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const repos = getDataRepositories();
  const { id } = req.params;

  let profile =
    (await repos.voterProfiles.findById(id)) ||
    (await repos.voterProfiles.findBySimulationId(id)) ||
    (await repos.voterProfiles.findByLegacyEpic(id));

  // Fallback to serverStore if not yet in profile repository
  if (!profile) {
    const sv = serverStore.findVoterByEpic(id) || serverStore.findVoterById(id);
    if (sv) {
      profile = {
        id: sv.id,
        simulationVoterId: sv.epicId,
        fullName: sv.name,
        dateOfBirth: '1995-01-01',
        gender: sv.gender,
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyId: sv.constituencyId,
        pollingStation: sv.pollingStation,
        maskedMobile: sv.maskedMobile,
        registrationStatus: 'REGISTERED',
        eligibilityStatus: sv.isEligible ? 'ELIGIBLE' : 'INELIGIBLE_DISQUALIFIED',
        lifecycleStatus: 'ACTIVE',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        schemaVersion: SCHEMA_VERSION_CURRENT,
      };
    }
  }

  if (!profile) {
    res.status(404).json({ success: false, message: `Voter record '${id}' not found.` });
    return;
  }

  // Scope check
  if (session && !isConstituencyInScope(session.assignmentScope, profile.constituencyId)) {
    res.status(403).json({
      success: false,
      message: `Scope violation: Access to voter in constituency '${profile.constituencyId}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  // Fetch biometric status summary
  const bioList = await repos.biometrics.listByVoter(profile.id);
  const face = bioList.find((b) => b.modality === 'FACE');
  const fp = bioList.find((b) => b.modality === 'FINGERPRINT');
  const auth = computeAuthoritativeEligibility(profile, {
    faceStatus: face?.status,
    fingerprintStatus: fp?.status,
  });
  profile.eligibilityStatus = auth.eligibilityStatus;

  res.status(200).json({
    success: true,
    voter: profile,
    biometrics: {
      faceStatus: face?.status || 'NOT_STARTED',
      fingerprintStatus: fp?.status || 'NOT_STARTED',
    },
  });
});

/**
 * GET /api/admin/voters/:id/biometrics
 * Retrieves detailed biometric enrollment metadata records for a voter.
 * Requires VOTER_READ or BIOMETRIC_ENROLLMENT_START permission and scope check.
 */
adminRouter.get('/voters/:id/biometrics', requirePermission('VOTER_READ'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const repos = getDataRepositories();
  const { id } = req.params;

  const profile =
    (await repos.voterProfiles.findById(id)) ||
    (await repos.voterProfiles.findBySimulationId(id)) ||
    (await repos.voterProfiles.findByLegacyEpic(id));

  if (!profile) {
    res.status(404).json({ success: false, message: `Voter record '${id}' not found.` });
    return;
  }

  // Scope check
  if (session && !isConstituencyInScope(session.assignmentScope, profile.constituencyId)) {
    res.status(403).json({
      success: false,
      message: `Scope violation: Access to voter in constituency '${profile.constituencyId}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  const bioList = await repos.biometrics.listByVoter(profile.id);
  const face = bioList.find((b) => b.modality === 'FACE') || null;
  const fingerprint = bioList.find((b) => b.modality === 'FINGERPRINT') || null;

  res.status(200).json({
    success: true,
    voterId: profile.id,
    simulationVoterId: profile.simulationVoterId,
    biometrics: bioList,
    face,
    fingerprint,
  });
});

/**
 * PATCH /api/admin/voters/:id/biometrics
 * Updates biometric enrollment metadata (e.g. transition to PENDING, DEVICE_UNAVAILABLE).
 * Strictly prohibits raw biometric payloads (images, minutiae, templates).
 * Prohibits falsely claiming ENROLLED without verified hardware/template engine.
 * Requires BIOMETRIC_ENROLLMENT_START permission and scope check.
 */
adminRouter.patch('/voters/:id/biometrics', requirePermission('BIOMETRIC_ENROLLMENT_START'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const repos = getDataRepositories();
  const { id } = req.params;

  // 1. Invariant: Strict raw biometric data rejection
  for (const forbiddenKey of FORBIDDEN_BIOMETRIC_REGISTRATION_KEYS) {
    if (forbiddenKey in req.body && req.body[forbiddenKey] !== undefined) {
      serverStore.recordAuditEvent({
        id: `audit-bio-reject-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        type: 'ADMIN_ACTION',
        description: `Rejected biometric update: Prohibited raw biometric field '${forbiddenKey}' submitted by '${session?.accountId}'`,
        electionId: 1,
      });

      res.status(400).json({
        success: false,
        message: `Security violation: Raw biometric field '${forbiddenKey}' is strictly prohibited.`,
      });
      return;
    }
  }

  const { modality, status, qualityCheckStatus, deviceType, deviceProvider, qualityScore } = req.body;

  if (!modality || !['FACE', 'FINGERPRINT'].includes(modality)) {
    res.status(400).json({
      success: false,
      message: "Invalid modality: Must be 'FACE' or 'FINGERPRINT'.",
    });
    return;
  }

  // 2. Resolve voter profile
  const profile =
    (await repos.voterProfiles.findById(id)) ||
    (await repos.voterProfiles.findBySimulationId(id)) ||
    (await repos.voterProfiles.findByLegacyEpic(id));

  if (!profile) {
    res.status(404).json({ success: false, message: `Voter record '${id}' not found.` });
    return;
  }

  // 3. Scope check
  if (session && !isConstituencyInScope(session.assignmentScope, profile.constituencyId)) {
    serverStore.recordAuditEvent({
      id: `audit-bio-scope-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Scope violation: Account '${session.accountId}' attempted biometric update for out-of-scope voter in '${profile.constituencyId}'`,
      electionId: 1,
    });

    res.status(403).json({
      success: false,
      message: `Scope violation: Access to voter in constituency '${profile.constituencyId}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  // 4. Strict integrity check: ENROLLED and MANUALLY_APPROVED cannot be set via simple UI click
  if (status === 'ENROLLED') {
    res.status(400).json({
      success: false,
      message: 'Integrity rule: Status cannot be set to ENROLLED in Phase 05. A verified biometric matching engine and compatible hardware SDK are required.',
    });
    return;
  }

  if (status === 'MANUALLY_APPROVED') {
    res.status(400).json({
      success: false,
      message: 'Integrity rule: MANUALLY_APPROVED status requires the Phase 06 physical ID exception approval workflow.',
    });
    return;
  }

  const allowedStatuses = ['NOT_STARTED', 'PENDING', 'DEVICE_UNAVAILABLE', 'REQUIRES_REENROLLMENT'];
  if (status && !allowedStatuses.includes(status)) {
    res.status(400).json({
      success: false,
      message: `Invalid status: '${status}'. Allowed values in Phase 05 are: ${allowedStatuses.join(', ')}`,
    });
    return;
  }

  // 5. Retrieve existing or create new stub metadata
  let existingMeta = await repos.biometrics.getMetadata(profile.id, modality as any);
  const now = Date.now();

  if (!existingMeta) {
    existingMeta = {
      id: `bio_${profile.id}_${modality.toLowerCase()}`,
      voterId: profile.id,
      modality: modality as any,
      status: 'NOT_STARTED',
      biometricReferenceId: 'unassigned',
      qualityCheckStatus: 'PENDING',
      isManualException: false,
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
  }

  const updatedMeta: BiometricEnrollmentMetadata = {
    ...existingMeta,
    status: status || existingMeta.status,
    qualityCheckStatus: qualityCheckStatus || existingMeta.qualityCheckStatus,
    deviceType: deviceType !== undefined ? String(deviceType) : existingMeta.deviceType,
    deviceProvider: deviceProvider !== undefined ? String(deviceProvider) : existingMeta.deviceProvider,
    qualityScore: typeof qualityScore === 'number' ? qualityScore : existingMeta.qualityScore,
    enrollingOfficerId: session?.accountId || 'VRO-SIM-001',
    updatedAt: now,
  };

  await repos.biometrics.saveMetadata(updatedMeta);

  // Automatically re-evaluate voter eligibility based on updated biometrics
  const allBio = await repos.biometrics.listByVoter(profile.id);
  const currentFace = allBio.find((b) => b.modality === 'FACE');
  const currentFp = allBio.find((b) => b.modality === 'FINGERPRINT');
  const updatedAuth = computeAuthoritativeEligibility(profile, {
    faceStatus: currentFace?.status,
    fingerprintStatus: currentFp?.status,
  });
  profile.eligibilityStatus = updatedAuth.eligibilityStatus;
  profile.updatedAt = now;
  await repos.voterProfiles.save(profile);
  await serverStore.setVoterEligibilityAsync(profile.id, updatedAuth.isEligible);

  // 6. Record structured audit event
  serverStore.recordAuditEvent({
    id: `audit-bio-update-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    type: 'ADMIN_ACTION',
    description: `Biometric metadata updated for voter '${profile.simulationVoterId}' (${modality} -> ${updatedMeta.status}) by officer '${session?.accountId}'`,
    electionId: 1,
  });

  res.status(200).json({
    success: true,
    message: `Biometric ${modality.toLowerCase()} enrollment metadata updated successfully.`,
    biometrics: updatedMeta,
  });
});

/**
 * PATCH /api/admin/voters/:id
 * Edits permitted registration fields (fullName, dateOfBirth, gender, state, district, constituencyId, pollingStation, maskedMobile, isEligible).
 * Rejects immutable/server-owned identifiers.
 * Requires VOTER_UPDATE permission.
 */
adminRouter.patch('/voters/:id', requirePermission('VOTER_UPDATE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const repos = getDataRepositories();
  const { id } = req.params;

  // 1. Prohibit biometric payloads
  for (const forbiddenKey of FORBIDDEN_BIOMETRIC_REGISTRATION_KEYS) {
    if (forbiddenKey in req.body && req.body[forbiddenKey] !== undefined) {
      res.status(400).json({
        success: false,
        message: 'Biometric data payloads are not accepted in Phase 04 voter registry endpoints.',
      });
      return;
    }
  }

  // 2. Find voter profile
  let profile =
    (await repos.voterProfiles.findById(id)) ||
    (await repos.voterProfiles.findBySimulationId(id)) ||
    (await repos.voterProfiles.findByLegacyEpic(id));

  if (!profile) {
    // Check if in serverStore
    const sv = serverStore.findVoterByEpic(id) || serverStore.findVoterById(id);
    if (sv) {
      profile = {
        id: sv.id,
        simulationVoterId: sv.epicId,
        fullName: sv.name,
        dateOfBirth: '1995-01-01',
        gender: sv.gender,
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyId: sv.constituencyId,
        pollingStation: sv.pollingStation,
        maskedMobile: sv.maskedMobile,
        registrationStatus: 'REGISTERED',
        eligibilityStatus: sv.isEligible ? 'ELIGIBLE' : 'INELIGIBLE_DISQUALIFIED',
        lifecycleStatus: 'ACTIVE',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        schemaVersion: SCHEMA_VERSION_CURRENT,
      };
    }
  }

  if (!profile) {
    res.status(404).json({ success: false, message: `Voter record '${id}' not found.` });
    return;
  }

  // 3. Scope check on existing voter constituency
  if (session && !isConstituencyInScope(session.assignmentScope, profile.constituencyId)) {
    res.status(403).json({
      success: false,
      message: `Scope violation: Access to voter in constituency '${profile.constituencyId}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  // 4. Reject attempts to alter immutable / server-owned identifiers
  if ('id' in req.body && req.body.id !== profile.id) {
    res.status(400).json({ success: false, message: 'Modification of internal record ID is strictly prohibited.' });
    return;
  }
  if ('simulationVoterId' in req.body && req.body.simulationVoterId !== profile.simulationVoterId) {
    res.status(400).json({ success: false, message: 'Modification of simulation voter ID is strictly prohibited.' });
    return;
  }
  if ('legacyEpicId' in req.body && req.body.legacyEpicId !== profile.legacyEpicId) {
    res.status(400).json({ success: false, message: 'Modification of legacy EPIC ID is strictly prohibited.' });
    return;
  }
  if ('createdAt' in req.body || 'createdByOfficerId' in req.body) {
    res.status(400).json({ success: false, message: 'Modification of creation audit metadata is strictly prohibited.' });
    return;
  }

  // 5. Scope check on new constituencyId if being updated
  if (req.body.constituencyId && req.body.constituencyId !== profile.constituencyId) {
    const newConst = String(req.body.constituencyId);
    if (!serverStore.getAllConstituencies().some((c) => c.id === newConst)) {
      res.status(400).json({ success: false, message: `Invalid target constituency '${newConst}'.` });
      return;
    }
    if (session && !isConstituencyInScope(session.assignmentScope, newConst)) {
      res.status(403).json({
        success: false,
        message: `Scope violation: Target constituency '${newConst}' is outside officer's authorized assignment scope.`,
      });
      return;
    }
  }

  // 6. Age validation if dateOfBirth is being updated
  if (req.body.dateOfBirth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(req.body.dateOfBirth)) {
      res.status(400).json({ success: false, message: 'Invalid dateOfBirth: Must be in YYYY-MM-DD format.' });
      return;
    }
    const newAge = calculateAgeFromDob(req.body.dateOfBirth);
    if (newAge < 18) {
      res.status(400).json({ success: false, message: 'Voting-age eligibility violation: Elector must be at least 18 years of age.' });
      return;
    }
    profile.dateOfBirth = req.body.dateOfBirth;
  }

  // 7. Apply permitted field updates
  const changedFields: string[] = [];
  if (req.body.fullName && typeof req.body.fullName === 'string' && req.body.fullName.trim()) {
    profile.fullName = req.body.fullName.trim();
    changedFields.push('fullName');
  }
  if (req.body.gender && ['M', 'F', 'O'].includes(req.body.gender)) {
    profile.gender = req.body.gender;
    changedFields.push('gender');
  }
  if (req.body.state && typeof req.body.state === 'string') {
    profile.state = req.body.state.trim();
    changedFields.push('state');
  }
  if (req.body.district && typeof req.body.district === 'string') {
    profile.district = req.body.district.trim();
    changedFields.push('district');
  }
  if (req.body.constituencyId && typeof req.body.constituencyId === 'string') {
    profile.constituencyId = req.body.constituencyId.trim();
    changedFields.push('constituencyId');
  }
  if (req.body.pollingStation && typeof req.body.pollingStation === 'string') {
    profile.pollingStation = req.body.pollingStation.trim();
    changedFields.push('pollingStation');
  }
  if (req.body.maskedMobile && typeof req.body.maskedMobile === 'string') {
    profile.maskedMobile = req.body.maskedMobile.trim();
    changedFields.push('maskedMobile');
  }
  if (req.body.isEligible !== undefined) {
    profile.eligibilityStatus = req.body.isEligible ? 'ELIGIBLE' : 'INELIGIBLE_DISQUALIFIED';
    changedFields.push('eligibilityStatus');
  }

  profile.updatedAt = Date.now();
  profile.lastUpdatedByOfficerId = session?.accountId || 'VRO-SIM-001';

  // 8. Persist updated profile
  await repos.voterProfiles.save(profile);

  // Sync serverStore
  const sv = serverStore.findVoterByEpic(profile.simulationVoterId);
  if (sv) {
    sv.name = profile.fullName;
    sv.gender = profile.gender;
    sv.constituencyId = profile.constituencyId;
    sv.pollingStation = profile.pollingStation;
    sv.maskedMobile = profile.maskedMobile;
    sv.isEligible = profile.eligibilityStatus === 'ELIGIBLE' && profile.registrationStatus === 'REGISTERED';
  }

  // 9. Record audit event
  serverStore.recordAuditEvent({
    id: `audit-voter-update-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    type: 'ADMIN_ACTION',
    description: `Voter profile updated: '${profile.simulationVoterId}' (fields: ${changedFields.join(', ')}) by officer '${session?.accountId}'`,
    electionId: 1,
  });

  res.status(200).json({
    success: true,
    message: 'Voter profile updated successfully.',
    voter: profile,
  });
});

/**
 * DELETE /api/admin/voters/:id
 * Deactivates an elector record safely via lifecycle status transition (soft delete).
 * Preserves past election participation history and accepted ballots.
 * Prevents future voting authorizations.
 * Requires VOTER_DEACTIVATE permission.
 */
adminRouter.delete('/voters/:id', requirePermission('VOTER_DEACTIVATE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const repos = getDataRepositories();
  const { id } = req.params;

  let profile =
    (await repos.voterProfiles.findById(id)) ||
    (await repos.voterProfiles.findBySimulationId(id)) ||
    (await repos.voterProfiles.findByLegacyEpic(id));

  if (!profile) {
    const sv = serverStore.findVoterByEpic(id) || serverStore.findVoterById(id);
    if (sv) {
      profile = {
        id: sv.id,
        simulationVoterId: sv.epicId,
        fullName: sv.name,
        dateOfBirth: '1995-01-01',
        gender: sv.gender,
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyId: sv.constituencyId,
        pollingStation: sv.pollingStation,
        maskedMobile: sv.maskedMobile,
        registrationStatus: 'REGISTERED',
        eligibilityStatus: 'ELIGIBLE',
        lifecycleStatus: 'ACTIVE',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        schemaVersion: SCHEMA_VERSION_CURRENT,
      };
    }
  }

  if (!profile) {
    res.status(404).json({ success: false, message: `Voter record '${id}' not found.` });
    return;
  }

  // Scope check
  if (session && !isConstituencyInScope(session.assignmentScope, profile.constituencyId)) {
    res.status(403).json({
      success: false,
      message: `Scope violation: Deactivation of voter in constituency '${profile.constituencyId}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  // Transition to deactivated state
  profile.registrationStatus = 'DE_REGISTERED';
  profile.eligibilityStatus = 'INELIGIBLE_DISQUALIFIED';
  profile.lifecycleStatus = 'ARCHIVED';
  profile.updatedAt = Date.now();
  profile.lastUpdatedByOfficerId = session?.accountId || 'VRO-SIM-001';

  await repos.voterProfiles.save(profile);

  // Sync serverStore
  const sv = serverStore.findVoterByEpic(profile.simulationVoterId);
  if (sv) {
    sv.isEligible = false;
    sv.status = 'ELIGIBLE'; // reset authorization tokens
    sv.authorizedWallet = undefined;
    sv.activeNullifier = undefined;
    sv.ticketExpiry = undefined;
  }

  // Record audit event
  serverStore.recordAuditEvent({
    id: `audit-voter-deactivate-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    type: 'ADMIN_ACTION',
    description: `Voter record deactivated: '${profile.simulationVoterId}' in constituency '${profile.constituencyId}' by officer '${session?.accountId}'`,
    electionId: 1,
  });

  res.status(200).json({
    success: true,
    message: 'Voter record deactivated successfully. Past ballots and audit trail remain intact.',
    voter: profile,
  });
});

/**
 * PATCH /api/admin/voters/:id/eligibility
 * Legacy compatibility endpoint: modifies eligibility flag.
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

  // Also sync repos.voterProfiles if present
  try {
    const repos = getDataRepositories();
    const profile =
      (await repos.voterProfiles.findById(id)) ||
      (await repos.voterProfiles.findBySimulationId(id)) ||
      (await repos.voterProfiles.findByLegacyEpic(id));
    if (profile) {
      profile.eligibilityStatus = isEligible ? 'ELIGIBLE' : 'INELIGIBLE_DISQUALIFIED';
      profile.updatedAt = Date.now();
      await repos.voterProfiles.save(profile);
    }
  } catch (err: any) {
    console.warn('[VoterRegistry] Notice updating eligibility in repository:', err.message);
  }

  res.status(200).json({ success: true, message: 'Voter eligibility updated successfully.' });
});

/**
 * POST /api/admin/voters/:id/reset
 * Legacy compatibility endpoint: resets active authorization.
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
  const auditEvents = serverStore.getAllAuditEvents().map((e) => sanitizeLogData(e));
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
    const auditEvents = serverStore.getAllAuditEvents().map((e) => sanitizeLogData(e));
    res.status(200).json({ success: true, auditEvents });
  }
);

// ============================================================================
// MANUAL PHYSICAL-ID EXCEPTION APPROVAL WORKFLOW (PHASE 06)
// ============================================================================

/**
 * Helper: Detects forbidden physical ID document images, scans, or sensitive numbers.
 */
function containsForbiddenExceptionData(body: any): { forbidden: boolean; key?: string } {
  if (!body || typeof body !== 'object') return { forbidden: false };
  for (const key of Object.keys(body)) {
    const lowerKey = key.toLowerCase();
    for (const forbidden of FORBIDDEN_EXCEPTION_KEYS) {
      if (lowerKey.includes(forbidden.toLowerCase())) {
        return { forbidden: true, key };
      }
    }
    const val = body[key];
    if (typeof val === 'string') {
      const lowerVal = val.toLowerCase();
      if (
        lowerVal.includes('data:image') ||
        lowerVal.includes('base64,') ||
        /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/.test(val) // 12-digit Aadhaar / National ID pattern
      ) {
        return { forbidden: true, key };
      }
    }
  }
  return { forbidden: false };
}

/**
 * POST /api/admin/exceptions & /api/exceptions
 * Creates a manual physical-ID verification exception request.
 * Authorized for: VOTER_REGISTRATION_OFFICER (or PLATFORM_ADMIN) within scope.
 */
adminRouter.post(
  ['/exceptions', '/admin/exceptions'],
  requirePermission('VOTER_EXCEPTION_REQUEST'),
  async (req: Request, res: Response): Promise<void> => {
    const session = (req as any).officer as OfficerSession;
    const repos = getDataRepositories();

    // 1. Strict physical-ID document privacy: No scans, photos, videos, or document numbers
    const privacyCheck = containsForbiddenExceptionData(req.body);
    if (privacyCheck.forbidden) {
      serverStore.recordAuditEvent({
        id: `audit-ex-leak-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        type: 'ADMIN_ACTION',
        description: `Security violation: Physical document image or personal identifier in field '${privacyCheck.key}' rejected for officer '${session?.accountId}'`,
        electionId: 1,
      });

      res.status(400).json({
        success: false,
        message: `Privacy violation: Physical ID photographs, scans, or document numbers are strictly prohibited. Inspect documents physically and record the outcome only.`,
      });
      return;
    }

    const {
      voterId,
      purpose,
      modality,
      electionId,
      votingSessionToken,
      votingSessionTokenHash: rawVotingSessionTokenHash,
      reasonCode,
      note,
    } = req.body;

    // 2. Validate purpose
    if (!purpose || !['ENROLLMENT', 'VOTING_SESSION'].includes(purpose)) {
      res.status(400).json({
        success: false,
        message: "Invalid purpose: Must be 'ENROLLMENT' or 'VOTING_SESSION'.",
      });
      return;
    }

    // 3. Validate reason code
    if (!reasonCode || !VALID_EXCEPTION_REASON_CODES.includes(reasonCode)) {
      res.status(400).json({
        success: false,
        message: `Invalid reasonCode '${reasonCode}'. Valid codes: ${VALID_EXCEPTION_REASON_CODES.join(', ')}`,
      });
      return;
    }

    // 4. Resolve voter
    if (!voterId || typeof voterId !== 'string') {
      res.status(400).json({ success: false, message: 'Missing voterId.' });
      return;
    }

    const voter =
      (await repos.voterProfiles.findById(voterId)) ||
      (await repos.voterProfiles.findBySimulationId(voterId)) ||
      (await repos.voterProfiles.findByLegacyEpic(voterId));

    if (!voter) {
      res.status(404).json({ success: false, message: `Voter record '${voterId}' not found.` });
      return;
    }

    // 5. Check voter status
    if (
      voter.lifecycleStatus === 'LOCKED' ||
      voter.registrationStatus === 'SUSPENDED' ||
      voter.registrationStatus === 'DE_REGISTERED'
    ) {
      res.status(403).json({
        success: false,
        message: `Cannot request exception for inactive or suspended voter record (Current lifecycle: ${voter.lifecycleStatus}, registration: ${voter.registrationStatus}).`,
      });
      return;
    }

    // 6. Constituency scope enforcement
    if (session && !isConstituencyInScope(session.assignmentScope, voter.constituencyId)) {
      serverStore.recordAuditEvent({
        id: `audit-ex-scope-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        type: 'ADMIN_ACTION',
        description: `Scope violation: Officer '${session.accountId}' attempted exception for out-of-scope voter in constituency '${voter.constituencyId}'`,
        electionId: 1,
      });

      res.status(403).json({
        success: false,
        message: `Scope violation: Access to voter in constituency '${voter.constituencyId}' is outside officer's authorized assignment scope.`,
      });
      return;
    }

    // 7. Purpose-specific validation
    if (purpose === 'ENROLLMENT') {
      if (!modality || !['FACE', 'FINGERPRINT'].includes(modality)) {
        res.status(400).json({
          success: false,
          message: "Enrollment-time exception requires modality ('FACE' or 'FINGERPRINT').",
        });
        return;
      }

      // Check for duplicate pending enrollment exception
      const existingPending = await repos.exceptions.findPending(voter.id, 'ENROLLMENT', modality);
      if (existingPending) {
        res.status(409).json({
          success: false,
          message: `A pending enrollment exception request already exists for this voter and modality (Request ID: ${existingPending.id}).`,
          existingRequestId: existingPending.id,
        });
        return;
      }
    } else if (purpose === 'VOTING_SESSION') {
      if (!electionId) {
        res.status(400).json({
          success: false,
          message: 'Voting-time exception requires electionId.',
        });
        return;
      }

      // Check election validity
      const targetElection =
        serverStore.findElectionByNumericId(Number(electionId)) ||
        serverStore.getElectionById(String(electionId));

      if (!targetElection) {
        res.status(404).json({ success: false, message: `Election record '${electionId}' not found.` });
        return;
      }

      if (targetElection.status !== 'active') {
        res.status(403).json({
          success: false,
          message: `Cannot request voting exception: Election is not active (Current status: ${targetElection.status.toUpperCase()}).`,
        });
        return;
      }

      if (targetElection.constituencyIds && targetElection.constituencyIds.length > 0) {
        if (!targetElection.constituencyIds.includes(voter.constituencyId)) {
          res.status(403).json({
            success: false,
            message: `Cannot request voting exception: Voter's constituency '${voter.constituencyId}' is not participating in election '${electionId}'.`,
          });
          return;
        }
      }

      const part = await repos.participations.getParticipation(voter.id, String(electionId));
      if (part && (part.status === 'VOTE_ACCEPTED' || Boolean(part.votedAt))) {
        res.status(403).json({
          success: false,
          message: 'Cannot request voting exception: Voter has already finalized a ballot.',
        });
        return;
      }

      const existingPending = await repos.exceptions.findPending(voter.id, 'VOTING_SESSION', String(electionId));
      if (existingPending) {
        res.status(409).json({
          success: false,
          message: `A pending voting exception request already exists for this voter and election (Request ID: ${existingPending.id}).`,
          existingRequestId: existingPending.id,
        });
        return;
      }
    }

    // 8. Generate exception request record
    const now = Date.now();
    const exceptionId = `EX-REQ-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const votingSessionTokenHash = rawVotingSessionTokenHash
      ? String(rawVotingSessionTokenHash)
      : votingSessionToken
      ? crypto.createHash('sha256').update(String(votingSessionToken)).digest('hex')
      : undefined;

    const requestRecord: ManualIdExceptionRecord = {
      id: exceptionId,
      schemaVersion: SCHEMA_VERSION_CURRENT,
      voterId: voter.id,
      simulationVoterId: voter.simulationVoterId,
      constituencyId: voter.constituencyId,
      purpose,
      modality: purpose === 'ENROLLMENT' ? modality : undefined,
      electionId: purpose === 'VOTING_SESSION' ? String(electionId) : undefined,
      votingSessionTokenHash,
      requestedByOfficerId: session?.accountId || 'VRO-SIM-001',
      requestedByOfficerRole: (session?.role as any) || 'VOTER_REGISTRATION_OFFICER',
      requestedAt: now,
      reasonCode: reasonCode as ExceptionReasonCode,
      note: note ? String(note).trim().slice(0, 300) : undefined,
      status: 'PENDING',
      createdAt: now,
      updatedAt: now,
    };

    try {
      await repos.exceptions.createRequest(requestRecord);
    } catch (err: any) {
      res.status(400).json({ success: false, message: err.message });
      return;
    }

    // 9. If enrollment-time exception, update biometric metadata to PENDING_MANUAL_REVIEW
    if (purpose === 'ENROLLMENT' && modality) {
      const existingBio = await repos.biometrics.getMetadata(voter.id, modality);
      const bioMeta: BiometricEnrollmentMetadata = existingBio
        ? {
            ...existingBio,
            status: 'PENDING_MANUAL_REVIEW',
            isManualException: true,
            qualityCheckStatus: 'PENDING',
            exceptionDecisionReference: exceptionId,
            manualExceptionId: exceptionId,
            updatedAt: now,
          }
        : {
            id: `bio_${voter.id}_${modality.toLowerCase()}`,
            voterId: voter.id,
            modality,
            status: 'PENDING_MANUAL_REVIEW',
            biometricReferenceId: `pending_exception_${exceptionId}`,
            qualityCheckStatus: 'PENDING',
            isManualException: true,
            exceptionDecisionReference: exceptionId,
            manualExceptionId: exceptionId,
            createdAt: now,
            updatedAt: now,
            schemaVersion: SCHEMA_VERSION_CURRENT,
          };
      await repos.biometrics.saveMetadata(bioMeta);
    }

    // 10. Audit event
    serverStore.recordAuditEvent({
      id: `audit-ex-req-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      type: 'ADMIN_ACTION',
      description: `Manual physical-ID exception requested for voter '${voter.simulationVoterId}' (${purpose}) by '${session?.accountId}' [Reason: ${reasonCode}]`,
      electionId: electionId ? Number(electionId) : 1,
    });

    try {
      await repos.auditEvents.appendEvent({
        id: `audit-evt-${now}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now,
        type: 'MANUAL_ID_EXCEPTION_REQUESTED',
        actor: {
          actorId: session?.accountId || 'VRO-SIM-001',
          actorRole: (session?.role as any) || 'VOTER_REGISTRATION_OFFICER',
        },
        action: 'REQUEST_MANUAL_ID_EXCEPTION',
        target: {
          category: 'EXCEPTION_REQUEST',
          targetReference: exceptionId,
        },
        outcome: 'SUCCESS',
        reasonCode,
        electionId: electionId ? String(electionId) : undefined,
        constituencyId: voter.constituencyId,
        metadata: {
          voterId: voter.id,
          simulationVoterId: voter.simulationVoterId,
          purpose,
          reasonCode,
        },
        schemaVersion: SCHEMA_VERSION_CURRENT,
      });
    } catch (auditErr: any) {
      console.warn('[Audit] Notice recording structured audit event:', auditErr.message);
    }

    res.status(201).json({
      success: true,
      message: 'Manual physical-ID exception request created successfully. Awaiting Election Officer review.',
      exception: requestRecord,
    });
  }
);

/**
 * GET /api/admin/exceptions & /api/exceptions
 * Lists exception requests visible to the authenticated officer within scope.
 */
adminRouter.get(
  ['/exceptions', '/admin/exceptions'],
  authenticateOfficer,
  async (req: Request, res: Response): Promise<void> => {
    const session = (req as any).officer as OfficerSession;
    const repos = getDataRepositories();

    // Verify officer has exception viewing rights
    const canView =
      hasPermission(session.role, 'VOTER_EXCEPTION_APPROVE') ||
      hasPermission(session.role, 'VOTER_EXCEPTION_REQUEST') ||
      hasPermission(session.role, 'VOTER_READ');

    if (!canView) {
      res.status(403).json({
        success: false,
        message: 'Permission denied: Officer lacks permissions to view exception queue.',
      });
      return;
    }

    const { voterId, purpose, status, electionId, constituencyId } = req.query;

    const filter: any = {};
    if (voterId && typeof voterId === 'string') filter.voterId = voterId;
    if (purpose && typeof purpose === 'string') filter.purpose = purpose;
    if (status && typeof status === 'string') filter.status = status;
    if (electionId && typeof electionId === 'string') filter.electionId = electionId;
    if (constituencyId && typeof constituencyId === 'string') filter.constituencyId = constituencyId;

    let exceptions = await repos.exceptions.list(filter);

    // Apply officer assignment scope filtering
    if (session.assignmentScope?.constituencyIds && session.assignmentScope.constituencyIds.length > 0) {
      exceptions = exceptions.filter((e) =>
        isConstituencyInScope(session.assignmentScope, e.constituencyId)
      );
    }
    if (session.assignmentScope?.electionIds && session.assignmentScope.electionIds.length > 0) {
      exceptions = exceptions.filter(
        (e) => !e.electionId || isElectionInScope(session.assignmentScope, e.electionId)
      );
    }

    res.status(200).json({
      success: true,
      count: exceptions.length,
      exceptions,
    });
  }
);

/**
 * GET /api/admin/exceptions/:id & /api/exceptions/:id
 * Retrieves an individual exception request with scope validation.
 */
adminRouter.get(
  ['/exceptions/:id', '/admin/exceptions/:id'],
  authenticateOfficer,
  async (req: Request, res: Response): Promise<void> => {
    const session = (req as any).officer as OfficerSession;
    const repos = getDataRepositories();
    const { id } = req.params;

    const exception = await repos.exceptions.findById(id);
    if (!exception) {
      res.status(404).json({ success: false, message: `Exception request '${id}' not found.` });
      return;
    }

    // Scope check
    if (session && !isConstituencyInScope(session.assignmentScope, exception.constituencyId)) {
      res.status(403).json({
        success: false,
        message: `Scope violation: Access to exception request in constituency '${exception.constituencyId}' is outside officer's authorized assignment scope.`,
      });
      return;
    }

    res.status(200).json({
      success: true,
      exception,
    });
  }
);

/**
 * POST /api/admin/exceptions/:id/approve & /api/exceptions/:id/approve
 * Approves a pending manual physical-ID exception.
 * Authorized strictly for: ELECTION_OFFICER (or PLATFORM_ADMIN) within scope.
 * Invariants enforced:
 * - Requester cannot approve their own request (separation of duties).
 * - Only PENDING requests can be decided.
 * - Explicit decisionReason required (>= 5 chars).
 * - Outcome is strictly MANUAL_PHYSICAL_ID_APPROVED (never biometric match).
 * - Biometric modalities remain independent; never marked ENROLLED.
 * - Voting session exceptions receive a 15-minute server-managed expiry.
 */
adminRouter.post(
  ['/exceptions/:id/approve', '/admin/exceptions/:id/approve'],
  requirePermission('VOTER_EXCEPTION_APPROVE'),
  async (req: Request, res: Response): Promise<void> => {
    const session = (req as any).officer as OfficerSession;
    const repos = getDataRepositories();
    const { id } = req.params;

    // 1. Fetch exception
    const exception = await repos.exceptions.findById(id);
    if (!exception) {
      res.status(404).json({ success: false, message: `Exception request '${id}' not found.` });
      return;
    }

    // 2. Scope checks
    if (session && !isConstituencyInScope(session.assignmentScope, exception.constituencyId)) {
      serverStore.recordAuditEvent({
        id: `audit-ex-appr-scope-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        type: 'ADMIN_ACTION',
        description: `Scope violation: Officer '${session.accountId}' attempted approval of exception in out-of-scope constituency '${exception.constituencyId}'`,
        electionId: 1,
      });

      res.status(403).json({
        success: false,
        message: `Scope violation: Exception in constituency '${exception.constituencyId}' is outside officer's authorized assignment scope.`,
      });
      return;
    }

    if (
      exception.electionId &&
      session &&
      !isElectionInScope(session.assignmentScope, exception.electionId)
    ) {
      res.status(403).json({
        success: false,
        message: `Scope violation: Election '${exception.electionId}' is outside officer's authorized jurisdiction.`,
      });
      return;
    }

    // 3. Separation of duties: Requester cannot approve own request
    if (session && session.accountId && session.accountId === exception.requestedByOfficerId) {
      serverStore.recordAuditEvent({
        id: `audit-ex-self-appr-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        type: 'ADMIN_ACTION',
        description: `Separation of duties violation: Officer '${session.accountId}' attempted to approve their own exception request '${id}'`,
        electionId: 1,
      });

      res.status(403).json({
        success: false,
        message: 'Separation of duties violation: An officer cannot approve or decline an exception request they submitted.',
      });
      return;
    }

    // 4. State machine: Only PENDING requests can be decided
    if (exception.status !== 'PENDING') {
      res.status(409).json({
        success: false,
        message: `Conflict: Exception request is in '${exception.status}' status and cannot be approved. Only PENDING requests can receive a decision.`,
      });
      return;
    }

    // 5. Decision reason required
    const { decisionReason } = req.body;
    if (!decisionReason || typeof decisionReason !== 'string' || decisionReason.trim().length < 5) {
      res.status(400).json({
        success: false,
        message: 'Approval requires an explicit, audited decisionReason of at least 5 characters.',
      });
      return;
    }

    const now = Date.now();

    // 6. Handle purpose-specific updates
    if (exception.purpose === 'ENROLLMENT') {
      exception.status = 'APPROVED';
      exception.decisionOutcome = 'MANUAL_PHYSICAL_ID_APPROVED';
      exception.reviewedByOfficerId = session?.accountId || 'EO-SIM-001';
      exception.reviewedByOfficerRole = (session?.role as any) || 'ELECTION_OFFICER';
      exception.reviewedAt = now;
      exception.decisionReason = decisionReason.trim();
      exception.updatedAt = now;

      await repos.exceptions.update(exception);

      // Update biometric metadata record: Set status to MANUALLY_APPROVED with isManualException=true
      // NEVER set to ENROLLED or claim a biometric match!
      if (exception.modality) {
        const existingBio = await repos.biometrics.getMetadata(exception.voterId, exception.modality);
        const bioRecord: BiometricEnrollmentMetadata = existingBio
          ? {
              ...existingBio,
              status: 'MANUALLY_APPROVED',
              isManualException: true, // Invariant: must be true, represents manual physical-ID review
              qualityCheckStatus: 'EXEMPTED',
              exceptionDecisionReference: exception.id,
              manualExceptionId: exception.id,
              updatedAt: now,
            }
          : {
              id: `bio_${exception.voterId}_${exception.modality.toLowerCase()}`,
              voterId: exception.voterId,
              modality: exception.modality,
              status: 'MANUALLY_APPROVED',
              biometricReferenceId: `manually_exempted_${exception.id}`,
              qualityCheckStatus: 'EXEMPTED',
              isManualException: true,
              exceptionDecisionReference: exception.id,
              manualExceptionId: exception.id,
              createdAt: now,
              updatedAt: now,
              schemaVersion: SCHEMA_VERSION_CURRENT,
            };
        await repos.biometrics.saveMetadata(bioRecord);

        // Recompute voter eligibility when manual physical ID exception is approved
        const allBio = await repos.biometrics.listByVoter(exception.voterId);
        const currentFace = allBio.find((b) => b.modality === 'FACE');
        const currentFp = allBio.find((b) => b.modality === 'FINGERPRINT');
        const vProfile = await repos.voterProfiles.findById(exception.voterId);
        if (vProfile) {
          const auth = computeAuthoritativeEligibility(vProfile, {
            faceStatus: currentFace?.status,
            fingerprintStatus: currentFp?.status,
          });
          vProfile.eligibilityStatus = auth.eligibilityStatus;
          vProfile.updatedAt = now;
          await repos.voterProfiles.save(vProfile);
          await serverStore.setVoterEligibilityAsync(vProfile.id, auth.isEligible);
        }
      }
    } else if (exception.purpose === 'VOTING_SESSION') {
      // Re-verify voter is still active and eligible
      const voter = await repos.voterProfiles.findById(exception.voterId);
      if (
        !voter ||
        voter.lifecycleStatus === 'LOCKED' ||
        voter.registrationStatus !== 'REGISTERED' ||
        voter.eligibilityStatus !== 'ELIGIBLE'
      ) {
        res.status(403).json({
          success: false,
          message: 'Cannot approve voting exception: Elector record is inactive or ineligible.',
        });
        return;
      }

      const election =
        serverStore.findElectionByNumericId(Number(exception.electionId)) ||
        serverStore.getElectionById(String(exception.electionId));

      if (!election || election.status !== 'active') {
        res.status(403).json({
          success: false,
          message: 'Cannot approve voting exception: Election is not active.',
        });
        return;
      }

      const part = await repos.participations.getParticipation(voter.id, String(exception.electionId));
      if (part && (part.status === 'VOTE_ACCEPTED' || Boolean(part.votedAt))) {
        res.status(403).json({
          success: false,
          message: 'Cannot approve voting exception: Elector has already cast a ballot in this election.',
        });
        return;
      }

      // 15-minute server-managed expiry for voting attempt
      const expiresAt = now + 15 * 60 * 1000;

      exception.status = 'APPROVED';
      exception.decisionOutcome = 'MANUAL_PHYSICAL_ID_APPROVED';
      exception.reviewedByOfficerId = session?.accountId || 'EO-SIM-001';
      exception.reviewedByOfficerRole = (session?.role as any) || 'ELECTION_OFFICER';
      exception.reviewedAt = now;
      exception.decisionReason = decisionReason.trim();
      exception.expiresAt = expiresAt;
      exception.updatedAt = now;

      await repos.exceptions.update(exception);
    }

    // 7. Audit log
    serverStore.recordAuditEvent({
      id: `audit-ex-appr-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      type: 'ADMIN_ACTION',
      description: `Manual physical-ID exception '${id}' approved by '${session?.accountId}' (Reason: ${decisionReason.trim()})`,
      electionId: exception.electionId ? Number(exception.electionId) : 1,
    });

    try {
      await repos.auditEvents.appendEvent({
        id: `audit-evt-${now}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now,
        type: 'MANUAL_ID_EXCEPTION_APPROVED',
        actor: {
          actorId: session?.accountId || 'EO-SIM-001',
          actorRole: (session?.role as any) || 'ELECTION_OFFICER',
        },
        action: 'APPROVE_MANUAL_ID_EXCEPTION',
        target: {
          category: 'EXCEPTION_REQUEST',
          targetReference: exception.id,
        },
        outcome: 'SUCCESS',
        reasonCode: exception.reasonCode,
        electionId: exception.electionId,
        constituencyId: exception.constituencyId,
        metadata: {
          voterId: exception.voterId,
          simulationVoterId: exception.simulationVoterId,
          purpose: exception.purpose,
          decisionOutcome: 'MANUAL_PHYSICAL_ID_APPROVED',
        },
        schemaVersion: SCHEMA_VERSION_CURRENT,
      });
    } catch (auditErr: any) {
      console.warn('[Audit] Notice recording structured audit event:', auditErr.message);
    }

    res.status(200).json({
      success: true,
      message:
        'Exception request approved successfully. Authoritative decision recorded as MANUAL_PHYSICAL_ID_APPROVED.',
      exception,
    });
  }
);

/**
 * POST /api/admin/exceptions/:id/decline & /api/exceptions/:id/decline
 * Declines a pending manual physical-ID exception.
 * Authorized strictly for: ELECTION_OFFICER (or PLATFORM_ADMIN) within scope.
 */
adminRouter.post(
  ['/exceptions/:id/decline', '/admin/exceptions/:id/decline'],
  requirePermission('VOTER_EXCEPTION_APPROVE'),
  async (req: Request, res: Response): Promise<void> => {
    const session = (req as any).officer as OfficerSession;
    const repos = getDataRepositories();
    const { id } = req.params;

    const exception = await repos.exceptions.findById(id);
    if (!exception) {
      res.status(404).json({ success: false, message: `Exception request '${id}' not found.` });
      return;
    }

    if (session && !isConstituencyInScope(session.assignmentScope, exception.constituencyId)) {
      res.status(403).json({
        success: false,
        message: `Scope violation: Exception in constituency '${exception.constituencyId}' is outside officer's authorized assignment scope.`,
      });
      return;
    }

    if (session && session.accountId && session.accountId === exception.requestedByOfficerId) {
      res.status(403).json({
        success: false,
        message: 'Separation of duties violation: An officer cannot approve or decline an exception request they submitted.',
      });
      return;
    }

    if (exception.status !== 'PENDING') {
      res.status(409).json({
        success: false,
        message: `Conflict: Exception request is in '${exception.status}' status and cannot be declined. Only PENDING requests can receive a decision.`,
      });
      return;
    }

    const { decisionReason } = req.body;
    if (!decisionReason || typeof decisionReason !== 'string' || decisionReason.trim().length < 5) {
      res.status(400).json({
        success: false,
        message: 'Declining requires an explicit, audited decisionReason of at least 5 characters.',
      });
      return;
    }

    const now = Date.now();
    exception.status = 'DECLINED';
    exception.decisionOutcome = 'MANUAL_PHYSICAL_ID_DECLINED';
    exception.reviewedByOfficerId = session?.accountId || 'EO-SIM-001';
    exception.reviewedByOfficerRole = (session?.role as any) || 'ELECTION_OFFICER';
    exception.reviewedAt = now;
    exception.decisionReason = decisionReason.trim();
    exception.updatedAt = now;

    await repos.exceptions.update(exception);

    if (exception.purpose === 'ENROLLMENT' && exception.modality) {
      const existingBio = await repos.biometrics.getMetadata(exception.voterId, exception.modality);
      if (existingBio) {
        existingBio.status = 'DECLINED';
        existingBio.exceptionDecisionReference = exception.id;
        existingBio.updatedAt = now;
        await repos.biometrics.saveMetadata(existingBio);
      }
    }

    serverStore.recordAuditEvent({
      id: `audit-ex-dec-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      type: 'ADMIN_ACTION',
      description: `Manual physical-ID exception '${id}' declined by '${session?.accountId}' (Reason: ${decisionReason.trim()})`,
      electionId: exception.electionId ? Number(exception.electionId) : 1,
    });

    try {
      await repos.auditEvents.appendEvent({
        id: `audit-evt-${now}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: now,
        type: 'MANUAL_ID_EXCEPTION_DECLINED',
        actor: {
          actorId: session?.accountId || 'EO-SIM-001',
          actorRole: (session?.role as any) || 'ELECTION_OFFICER',
        },
        action: 'DECLINE_MANUAL_ID_EXCEPTION',
        target: {
          category: 'EXCEPTION_REQUEST',
          targetReference: exception.id,
        },
        outcome: 'SUCCESS',
        reasonCode: exception.reasonCode,
        electionId: exception.electionId,
        constituencyId: exception.constituencyId,
        metadata: {
          voterId: exception.voterId,
          simulationVoterId: exception.simulationVoterId,
          purpose: exception.purpose,
          decisionOutcome: 'MANUAL_PHYSICAL_ID_DECLINED',
        },
        schemaVersion: SCHEMA_VERSION_CURRENT,
      });
    } catch (auditErr: any) {
      console.warn('[Audit] Notice recording structured audit event:', auditErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Exception request declined. Outcome recorded as MANUAL_PHYSICAL_ID_DECLINED.',
      exception,
    });
  }
);

/**
 * POST /api/admin/sessions/unlock
 * Supervised recovery endpoint: Unlocks a locked voting session (LOCKED_SUPERVISED_RECOVERY).
 * Restricted to an authorized Election Officer or Platform Admin with ELECTION_ACTIVATE permission.
 * Validates officer role, assignment scope, session existence, current status, duplicate voting, and election status.
 */
adminRouter.post(
  '/sessions/unlock',
  authenticateOfficer,
  requirePermission('ELECTION_ACTIVATE'),
  async (req: Request, res: Response): Promise<void> => {
    const session = (req as any).officer as OfficerSession | undefined;
    const { sessionId, sessionToken, reason } = req.body;
    const tokenOrId = sessionId || sessionToken;

    if (!tokenOrId || typeof tokenOrId !== 'string') {
      res.status(400).json({
        success: false,
        message: 'Supervised recovery requires a valid sessionId or sessionToken.',
      });
      return;
    }

    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      res.status(400).json({
        success: false,
        message: 'Supervised recovery requires an explicit, audited reason of at least 5 characters.',
      });
      return;
    }

    // Role check: Only ELECTION_OFFICER or PLATFORM_ADMIN can recover sessions
    if (session?.role !== 'ELECTION_OFFICER' && session?.role !== 'PLATFORM_ADMIN') {
      res.status(403).json({
        success: false,
        message: `Forbidden: Officer role '${session?.role}' is not authorized to supervise session recovery. Only ELECTION_OFFICER or PLATFORM_ADMIN may recover locked sessions.`,
      });
      return;
    }

    const sessionRecord = serverStore.getSessionRecord(tokenOrId);
    if (!sessionRecord) {
      res.status(404).json({
        success: false,
        message: 'Target voting session not found.',
      });
      return;
    }

    // Status check
    if (sessionRecord.status !== 'LOCKED_SUPERVISED_RECOVERY') {
      res.status(400).json({
        success: false,
        message: `Session is in '${sessionRecord.status}' status (must be LOCKED_SUPERVISED_RECOVERY to recover).`,
        currentStatus: sessionRecord.status,
      });
      return;
    }

    // Scope check: If officer has scope, verify constituency and election
    if (session?.assignmentScope) {
      if (sessionRecord.constituencyId && !isConstituencyInScope(session.assignmentScope, sessionRecord.constituencyId)) {
        res.status(403).json({
          success: false,
          message: `Forbidden: Session constituency '${sessionRecord.constituencyId}' is outside your authorized assignment scope.`,
        });
        return;
      }
      if (sessionRecord.electionId && !isElectionInScope(session.assignmentScope, sessionRecord.electionId)) {
        res.status(403).json({
          success: false,
          message: `Forbidden: Session election '${sessionRecord.electionId}' is outside your authorized assignment scope.`,
        });
        return;
      }
    }

    // Duplicate vote check: Ensure elector hasn't already voted in this election
    if (sessionRecord.electionId) {
      try {
        const repos = getDataRepositories();
        const vId = sessionRecord.voterId;
        const participation =
          (vId ? await repos.participations.getParticipation(vId, sessionRecord.electionId) : null) ||
          (sessionRecord.epicId ? await repos.participations.getParticipation(sessionRecord.epicId, sessionRecord.electionId) : null);
        if (participation && participation.status === 'VOTE_ACCEPTED') {
          res.status(409).json({
            success: false,
            message: 'Cannot recover session: Elector has already cast an accepted ballot in this election.',
          });
          return;
        }
      } catch (err: any) {
        console.warn('[Recovery] Notice checking participation:', err.message);
      }
    }

    if ((!sessionRecord.electionId || sessionRecord.electionId === 'GE-2024' || sessionRecord.electionId === '18') && sessionRecord.epicId) {
      const storeVoter = serverStore.findVoterByEpic(sessionRecord.epicId);
      if (storeVoter && storeVoter.status === 'VOTED') {
        res.status(409).json({
          success: false,
          message: 'Cannot recover session: Elector has already cast an accepted ballot in this election.',
        });
        return;
      }
    }

    // Election status check: Ensure election is still active/open
    const nowSec = serverStore.getCurrentTimeSec();
    let electionOpen = true;
    if (sessionRecord.electionId) {
      const election =
        serverStore.getElectionById(sessionRecord.electionId) ||
        serverStore.findElectionByNumericId(Number(sessionRecord.electionId));
      if (election) {
        const norm = normalizeElectionStatus(election.status);
        if (norm !== 'OPEN') {
          electionOpen = false;
        }
        if (election.endTime && election.endTime <= nowSec) {
          electionOpen = false;
        }
      }
    }

    if (!electionOpen) {
      res.status(409).json({
        success: false,
        message: 'Cannot recover session: Target election is closed, paused, or concluded.',
      });
      return;
    }

    const unlockResult = await serverStore.unlockSession(
      tokenOrId,
      session?.accountId || 'EO-SIM-001',
      session?.role || 'ELECTION_OFFICER',
      reason.trim()
    );

    if (!unlockResult.success) {
      res.status(400).json(unlockResult);
      return;
    }

    try {
      const repos = getDataRepositories();
      await repos.auditEvents.appendEvent({
        id: `audit-recovery-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        type: 'SUPERVISED_SESSION_RECOVERY' as any,
        actor: {
          actorId: session?.accountId || 'EO-SIM-001',
          actorRole: session?.role || 'ELECTION_OFFICER',
        },
        action: 'SUPERVISED_SESSION_RECOVERY' as any,
        target: {
          category: 'PARTICIPATION',
          targetReference: sessionRecord.id,
        },
        outcome: 'SUCCESS',
        electionId: sessionRecord.electionId,
        constituencyId: sessionRecord.constituencyId,
        metadata: {
          sessionId: sessionRecord.id,
          voterId: sessionRecord.voterId,
          epicId: sessionRecord.epicId,
          reason: reason.trim(),
        },
        schemaVersion: SCHEMA_VERSION_CURRENT,
      });
    } catch (auditErr: any) {
      console.warn('[Audit] Notice recording structured audit event:', auditErr.message);
    }

    res.status(200).json({
      success: true,
      message: 'Voting session successfully unlocked through supervised recovery.',
      session: {
        id: sessionRecord.id,
        status: sessionRecord.status,
        recoveredAt: sessionRecord.recoveredAt,
        recoveredByOfficerId: sessionRecord.recoveredByOfficerId,
      },
    });
  }
);

/**
 * POST /api/admin/profile/change-password
 * Allows an authenticated staff officer or administrator to change their own password.
 * Hashes passwords with scrypt, persists hash to credential store, rotates session,
 * and records audit events.
 */
adminRouter.post('/profile/change-password', async (req: Request, res: Response): Promise<void> => {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({ success: false, message: 'Authentication required: missing Bearer token.' });
    return;
  }
  const session = getOfficerSession(token);
  if (!session) {
    res.status(401).json({ success: false, message: 'Invalid or expired officer session.' });
    return;
  }

  const rateCheck = checkPasswordChangeRateLimit(session.accountId);
  if (!rateCheck.allowed) {
    res.status(429).json({
      success: false,
      message: `Rate limit exceeded: Please wait ${rateCheck.remainingSec} seconds before attempting another password change.`,
    });
    return;
  }

  const { currentPassword, newPassword, confirmPassword } = req.body;

  if (!currentPassword || typeof currentPassword !== 'string') {
    res.status(400).json({ success: false, message: 'Current password is required.' });
    return;
  }
  if (!newPassword || typeof newPassword !== 'string') {
    res.status(400).json({ success: false, message: 'New password is required.' });
    return;
  }
  if (newPassword.length < 8) {
    res.status(400).json({
      success: false,
      message: 'Password strength requirement: New password must be at least 8 characters long.',
    });
    return;
  }
  if (newPassword !== confirmPassword) {
    res.status(400).json({
      success: false,
      message: 'Password confirmation mismatch: New password and confirmation password do not match.',
    });
    return;
  }
  if (newPassword === currentPassword) {
    res.status(400).json({
      success: false,
      message: 'New password must be different from current password.',
    });
    return;
  }

  // 1. Verify current password
  const verifyRes = await verifyOfficerCredentials(session.accountId, currentPassword);
  if (!verifyRes.success || !verifyRes.account) {
    res.status(401).json({ success: false, message: 'Current password verification failed. Please check your credentials.' });
    return;
  }

  // 2. Persist new scrypt password hash
  try {
    const saveRes = await saveStaffCredential(session.accountId, newPassword);

    // 3. Rotate session
    const newSession = createOfficerSession(verifyRes.account);
    revokeOfficerSession(token);

    // 4. Audit logging
    serverStore.recordAuditEvent({
      id: `audit-pass-change-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: Date.now(),
      type: 'ADMIN_ACTION',
      description: `Staff password changed successfully for account '${session.accountId}' (${session.role})`,
      electionId: 1,
    });

    res.status(200).json({
      success: true,
      message: 'Password updated successfully. Please use your new password for all subsequent logins.',
      token: newSession.token,
      isPersistent: saveRes.isPersistent,
    });
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Password update error: ${err.message}` });
  }
});

/**
 * POST /api/admin/voters/initiate-registration
 * Stage 1 of the 3-Page Registration Flow:
 * Validates personal details, age requirement (>= 18), constituency scope,
 * and checks for duplicate registrations. Does NOT issue final voter ID.
 * Returns pending registration reference token.
 */
adminRouter.post('/voters/initiate-registration', requirePermission('VOTER_CREATE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const repos = getDataRepositories();

  const {
    fullName,
    dateOfBirth,
    gender,
    constituencyId,
    state,
    district,
    pollingStation,
    maskedMobile,
  } = req.body;

  // Validation
  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2) {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid fullName: Elector full name must be at least 2 characters.',
    });
    return;
  }

  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    res.status(400).json({
      success: false,
      message: 'Missing or invalid dateOfBirth: Format must be YYYY-MM-DD.',
    });
    return;
  }

  const age = calculateAgeFromDob(dateOfBirth);
  if (age < 18) {
    res.status(400).json({
      success: false,
      code: 'UNDERAGE',
      message: `Underage violation: Elector is ${age} years old. Minimum statutory voting age in India is 18.`,
    });
    return;
  }

  if (!gender || !['M', 'F', 'O'].includes(gender)) {
    res.status(400).json({
      success: false,
      message: "Invalid gender: Must be 'M', 'F', or 'O'.",
    });
    return;
  }

  if (!constituencyId || typeof constituencyId !== 'string') {
    res.status(400).json({
      success: false,
      message: 'Missing constituencyId: Elector must be assigned to an active constituency.',
    });
    return;
  }

  const validConstituency = serverStore.getAllConstituencies().some((c) => c.id === constituencyId);
  if (!validConstituency) {
    res.status(400).json({
      success: false,
      message: `Invalid geographic assignment: Constituency '${constituencyId}' does not exist in the electoral registry.`,
    });
    return;
  }

  if (session && !isConstituencyInScope(session.assignmentScope, constituencyId)) {
    res.status(403).json({
      success: false,
      message: `Scope violation: Constituency '${constituencyId}' is outside officer's authorized assignment scope.`,
    });
    return;
  }

  // Phone number normalization
  const rawMobile = maskedMobile || (req.body as any).mobile || (req.body as any).phone;
  let normalizedPhone = '';
  let displayMaskedPhone = maskedMobile?.trim() || '+91 ••••• •1122';

  if (rawMobile) {
    const phoneNorm = normalizePhoneNumber(rawMobile);
    if (!phoneNorm.isValid) {
      res.status(400).json({
        success: false,
        message: phoneNorm.error || 'Invalid mobile phone number provided for registration.',
      });
      return;
    }
    normalizedPhone = phoneNorm.normalized;
    displayMaskedPhone = phoneNorm.displayMasked;
  }

  // 1. Authoritative Duplicate Check against Registered Electors
  const allVoters = await repos.voterProfiles.list({ constituencyId });
  const isDuplicate = allVoters.some(
    (v) =>
      (v.fullName.trim().toLowerCase() === fullName.trim().toLowerCase() &&
       v.dateOfBirth === dateOfBirth &&
       v.registrationStatus !== 'DE_REGISTERED' &&
       v.lifecycleStatus === 'ACTIVE') ||
      (normalizedPhone && (v as any).normalizedMobile && (v as any).normalizedMobile === normalizedPhone &&
       v.registrationStatus !== 'DE_REGISTERED' && v.lifecycleStatus === 'ACTIVE')
  );

  const storeVoters = serverStore.getAllVoters();
  const isDuplicateStore = storeVoters.some(
    (v) =>
      v.name.trim().toLowerCase() === fullName.trim().toLowerCase() &&
      v.constituencyId === constituencyId &&
      v.isEligible
  );

  if (isDuplicate || isDuplicateStore) {
    res.status(409).json({
      success: false,
      code: 'DUPLICATE_REGISTRATION',
      message: `Duplicate voter detected: An active elector named '${fullName.trim()}' with date of birth ${dateOfBirth} is already registered in constituency '${constituencyId}'.`,
    });
    return;
  }

  // 2. Check active in-progress drafts (safely ignoring CANCELLED, EXPIRED, and FINALIZED drafts)
  for (const pending of pendingRegistrations.values()) {
    if (
      pending.status === 'CANCELLED' ||
      pending.status === 'EXPIRED' ||
      pending.isFinalized ||
      pending.status === 'FINALIZED'
    ) {
      continue;
    }

    // Auto-expire abandoned drafts older than 2 hours
    if (Date.now() - pending.createdAt > 2 * 60 * 60 * 1000) {
      pending.status = 'EXPIRED';
      continue;
    }

    const sameConstituency = pending.details.constituencyId === constituencyId;
    const sameNameAndDob =
      pending.details.fullName.trim().toLowerCase() === fullName.trim().toLowerCase() &&
      pending.details.dateOfBirth === dateOfBirth;
    const samePhone =
      (normalizedPhone && pending.details.normalizedMobile && pending.details.normalizedMobile === normalizedPhone) ||
      (displayMaskedPhone && pending.details.maskedMobile && pending.details.maskedMobile === displayMaskedPhone.trim());

    if (sameConstituency && (sameNameAndDob || samePhone)) {
      res.status(409).json({
        success: false,
        code: 'DUPLICATE_REGISTRATION',
        message: `Duplicate voter registration draft already in progress for '${fullName.trim()}' in constituency '${constituencyId}'.`,
      });
      return;
    }
  }

  const pendingId = `preg_${crypto.randomBytes(16).toString('hex')}`;
  const now = Date.now();

  const pendingRegistration: PendingVoterRegistration = {
    pendingId,
    details: {
      fullName: fullName.trim(),
      dateOfBirth,
      gender,
      state: state?.trim() || 'NCT of Delhi',
      district: district?.trim() || 'New Delhi',
      constituencyId,
      pollingStation: pollingStation?.trim() || 'Civic Community Centre, Polling Booth 1',
      maskedMobile: displayMaskedPhone,
      normalizedMobile: normalizedPhone,
      age,
    },
    fingerprintVerification: {
      status: 'NOT_VERIFIED',
      attempts: 0,
    },
    photoVerification: {
      status: 'NOT_VERIFIED',
    },
    createdByOfficerId: session?.accountId || 'VRO-SIM-001',
    createdAt: now,
    updatedAt: now,
    isFinalized: false,
    status: 'PENDING',
  };

  pendingRegistrations.set(pendingId, pendingRegistration);

  serverStore.recordAuditEvent({
    id: `audit-preg-init-${now}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: now,
    type: 'ADMIN_ACTION',
    description: `Initiated voter registration draft '${pendingId}' for '${fullName.trim()}' by officer '${session?.accountId}'`,
    electionId: 1,
  });

  res.status(201).json({
    success: true,
    message: 'Elector details reviewed and saved. Proceed to mandatory fingerprint verification.',
    pendingId,
    registrationStep: 2,
    voterDraft: pendingRegistration.details,
  });
});

/**
 * POST /api/admin/voters/verify-fingerprint
 * Stage 2 of the 3-Page Registration Flow:
 * Confirms mandatory fingerprint verification by authorized officer.
 * Cannot proceed to photo approval or voter ID issuance without successful check.
 */
adminRouter.post('/voters/verify-fingerprint', requirePermission('BIOMETRIC_ENROLLMENT_START'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const { pendingId, officerConfirmation, result, notes } = req.body;

  if (!pendingId || typeof pendingId !== 'string') {
    res.status(400).json({ success: false, message: 'Missing pendingId parameter.' });
    return;
  }

  const reg = pendingRegistrations.get(pendingId.trim());
  if (!reg) {
    res.status(404).json({ success: false, message: 'Pending registration record not found or expired.' });
    return;
  }

  if (reg.status === 'CANCELLED' || reg.status === 'EXPIRED') {
    res.status(400).json({ success: false, message: 'Cannot verify fingerprint: Registration draft has been cancelled or expired.' });
    return;
  }

  if (reg.isFinalized || reg.status === 'FINALIZED') {
    res.status(409).json({ success: false, message: 'Registration record is already finalized.' });
    return;
  }

  reg.status = 'VERIFICATION_IN_PROGRESS';

  if (session && !isConstituencyInScope(session.assignmentScope, reg.details.constituencyId)) {
    res.status(403).json({ success: false, message: 'Scope violation: Elector constituency is outside authorized scope.' });
    return;
  }

  const now = Date.now();

  if (result === 'VERIFIED') {
    if (officerConfirmation !== true) {
      res.status(400).json({
        success: false,
        message: 'Explicit officer confirmation is mandatory to confirm physical fingerprint verification.',
      });
      return;
    }

    reg.fingerprintVerification = {
      status: 'VERIFIED',
      verifiedByOfficerId: session?.accountId || 'VRO-SIM-001',
      verifiedAt: now,
      notes: notes?.trim() || 'Verified by authorized registration officer inspection',
      attempts: reg.fingerprintVerification.attempts + 1,
    };
    reg.updatedAt = now;

    serverStore.recordAuditEvent({
      id: `audit-bio-fp-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      type: 'ADMIN_ACTION',
      description: `Fingerprint verification confirmed for draft '${pendingId}' by officer '${session?.accountId}'`,
      electionId: 1,
    });

    res.status(200).json({
      success: true,
      message: 'Fingerprint verification successfully confirmed by registration officer.',
      fingerprintStatus: 'VERIFIED',
      verifiedBy: session?.accountId || 'VRO-SIM-001',
      verifiedAt: now,
      nextStep: 'photo',
    });
  } else {
    // Unsuccessful attempt
    reg.fingerprintVerification.status = 'UNSUCCESSFUL';
    reg.fingerprintVerification.attempts += 1;
    reg.fingerprintVerification.notes = notes?.trim() || 'Unsuccessful fingerprint check attempt';
    reg.updatedAt = now;

    serverStore.recordAuditEvent({
      id: `audit-bio-fp-fail-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      type: 'ADMIN_ACTION',
      description: `Fingerprint verification unsuccessful for draft '${pendingId}' (attempt #${reg.fingerprintVerification.attempts})`,
      electionId: 1,
    });

    res.status(200).json({
      success: true,
      message: 'Fingerprint verification marked unsuccessful. Officer may retry or correct the check.',
      fingerprintStatus: 'UNSUCCESSFUL',
      attempts: reg.fingerprintVerification.attempts,
    });
  }
});

/**
 * POST /api/admin/voters/verify-photo
 * Stage 3 of the 3-Page Registration Flow:
 * Requires prior successful fingerprint verification.
 * Confirms or rejects elector photograph inspection.
 */
adminRouter.post('/voters/verify-photo', requirePermission('BIOMETRIC_ENROLLMENT_START'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const { pendingId, decision, photoUrl, notes } = req.body;

  if (!pendingId || typeof pendingId !== 'string') {
    res.status(400).json({ success: false, message: 'Missing pendingId parameter.' });
    return;
  }

  const reg = pendingRegistrations.get(pendingId.trim());
  if (!reg) {
    res.status(404).json({ success: false, message: 'Pending registration record not found or expired.' });
    return;
  }

  if (reg.status === 'CANCELLED' || reg.status === 'EXPIRED') {
    res.status(400).json({ success: false, message: 'Cannot verify photo: Registration draft has been cancelled or expired.' });
    return;
  }

  if (reg.isFinalized || reg.status === 'FINALIZED') {
    res.status(409).json({ success: false, message: 'Registration record is already finalized.' });
    return;
  }

  // Pre-requisite check: Fingerprint MUST be verified first
  if (reg.fingerprintVerification.status !== 'VERIFIED') {
    res.status(400).json({
      success: false,
      message: 'Prerequisite violation: Mandatory fingerprint verification must be completed and verified before photo verification can proceed.',
    });
    return;
  }

  if (session && !isConstituencyInScope(session.assignmentScope, reg.details.constituencyId)) {
    res.status(403).json({ success: false, message: 'Scope violation: Elector constituency is outside authorized scope.' });
    return;
  }

  const now = Date.now();

  if (decision === 'APPROVED') {
    reg.photoVerification = {
      status: 'APPROVED',
      verifiedByOfficerId: session?.accountId || 'VRO-SIM-001',
      verifiedAt: now,
      photoUrl: photoUrl?.trim() || 'elector_portrait_verified',
      notes: notes?.trim() || 'Elector photograph inspected and approved by registration officer',
    };
    reg.updatedAt = now;

    serverStore.recordAuditEvent({
      id: `audit-photo-app-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      type: 'ADMIN_ACTION',
      description: `Photo verification approved for draft '${pendingId}' by officer '${session?.accountId}'`,
      electionId: 1,
    });

    res.status(200).json({
      success: true,
      message: 'Elector photograph successfully verified and approved by registration officer.',
      photoStatus: 'APPROVED',
      verifiedBy: session?.accountId || 'VRO-SIM-001',
      verifiedAt: now,
      readyForFinalization: true,
    });
  } else {
    // Rejection
    reg.photoVerification = {
      status: 'REJECTED',
      verifiedByOfficerId: session?.accountId || 'VRO-SIM-001',
      verifiedAt: now,
      notes: notes?.trim() || 'Elector photograph rejected by registration officer',
    };
    reg.updatedAt = now;

    serverStore.recordAuditEvent({
      id: `audit-photo-rej-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      type: 'ADMIN_ACTION',
      description: `Photo verification rejected for draft '${pendingId}' by officer '${session?.accountId}'`,
      electionId: 1,
    });

    res.status(200).json({
      success: true,
      message: 'Elector photograph rejected by officer. Officer may retake photo and repeat verification.',
      photoStatus: 'REJECTED',
    });
  }
});

/**
 * POST /api/admin/voters/finalize-registration
 * Final Step of Voter Registration Flow:
 * Server validates that all 3 registration stages are successfully completed:
 * 1. Personal details validated & pending draft exists.
 * 2. Fingerprint verification is VERIFIED.
 * 3. Photo verification is APPROVED.
 * Only then generates collision-resistant unique simulation voter ID, saves
 * authoritative record, persists biometrics, and synchronizes electoral roll.
 */
adminRouter.post('/voters/finalize-registration', requirePermission('VOTER_CREATE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const repos = getDataRepositories();
  const { pendingId } = req.body;

  if (!pendingId || typeof pendingId !== 'string') {
    res.status(400).json({ success: false, message: 'Missing pendingId parameter.' });
    return;
  }

  const reg = pendingRegistrations.get(pendingId.trim());
  if (!reg) {
    res.status(404).json({ success: false, message: 'Pending registration record not found or expired.' });
    return;
  }

  if (reg.status === 'CANCELLED' || reg.status === 'EXPIRED') {
    res.status(400).json({ success: false, message: 'Cannot finalize or issue voter ID for a cancelled or expired registration draft.' });
    return;
  }

  if (reg.isFinalized || reg.status === 'FINALIZED') {
    res.status(409).json({ success: false, message: 'Registration has already been finalized.' });
    return;
  }

  // 1. Mandatory Fingerprint Check Guard
  if (reg.fingerprintVerification.status !== 'VERIFIED') {
    res.status(400).json({
      success: false,
      code: 'BIOMETRIC_CHECK_INCOMPLETE',
      message: 'Cannot issue voter ID: Mandatory fingerprint verification is incomplete or unverified.',
    });
    return;
  }

  // 2. Mandatory Photo Verification Guard
  if (reg.photoVerification.status !== 'APPROVED') {
    res.status(400).json({
      success: false,
      message: 'Cannot issue voter ID: Mandatory photo verification has not been approved.',
    });
    return;
  }

  // 3. Scope Guard
  if (session && !isConstituencyInScope(session.assignmentScope, reg.details.constituencyId)) {
    res.status(403).json({ success: false, message: 'Scope violation: Constituency is outside officer scope.' });
    return;
  }

  // 4. Generate Unique Collision-Resistant Simulation Voter ID
  let simulationVoterId = '';
  try {
    simulationVoterId = await generateUniqueSimulationVoterId(repos.voterProfiles);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Failed generating unique voter ID: ${err.message}` });
    return;
  }

  const internalId = `vpr_${crypto.randomUUID()}`;
  const now = Date.now();

  const profile: VoterProfile = {
    id: internalId,
    simulationVoterId,
    fullName: reg.details.fullName,
    dateOfBirth: reg.details.dateOfBirth,
    gender: reg.details.gender,
    state: reg.details.state,
    district: reg.details.district,
    constituencyId: reg.details.constituencyId,
    pollingStation: reg.details.pollingStation,
    maskedMobile: reg.details.maskedMobile,
    registrationStatus: 'REGISTERED',
    eligibilityStatus: 'ELIGIBLE',
    lifecycleStatus: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    createdByOfficerId: session?.accountId || 'VRO-SIM-001',
    schemaVersion: SCHEMA_VERSION_CURRENT,
  };

  // 5. Persist Voter Profile
  try {
    await repos.voterProfiles.save(profile);
  } catch (err: any) {
    res.status(500).json({ success: false, message: `Persistence failure: ${err.message}` });
    return;
  }

  // 6. Persist Biometric Metadata
  try {
    const faceMeta: BiometricEnrollmentMetadata = {
      id: `bio_${profile.id}_face`,
      voterId: profile.id,
      modality: 'FACE',
      status: 'ENROLLED',
      biometricReferenceId: `photo_verified_${Date.now()}`,
      qualityCheckStatus: 'PASSED',
      isManualException: false,
      enrollingOfficerId: reg.photoVerification.verifiedByOfficerId || session?.accountId,
      enrolledAt: reg.photoVerification.verifiedAt || now,
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const fpMeta: BiometricEnrollmentMetadata = {
      id: `bio_${profile.id}_fingerprint`,
      voterId: profile.id,
      modality: 'FINGERPRINT',
      status: 'ENROLLED',
      biometricReferenceId: `fp_verified_${Date.now()}`,
      qualityCheckStatus: 'PASSED',
      isManualException: false,
      enrollingOfficerId: reg.fingerprintVerification.verifiedByOfficerId || session?.accountId,
      enrolledAt: reg.fingerprintVerification.verifiedAt || now,
      createdAt: now,
      updatedAt: now,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.biometrics.saveMetadata(faceMeta);
    await repos.biometrics.saveMetadata(fpMeta);
  } catch (err: any) {
    console.warn('[VoterRegistry] Notice saving verified biometric metadata:', err.message);
  }

  // 7. Synchronize with runtime store
  serverStore.setVoterRecord({
    id: profile.id,
    epicId: profile.simulationVoterId,
    name: profile.fullName,
    gender: profile.gender,
    age: reg.details.age,
    constituencyId: profile.constituencyId,
    pollingStation: profile.pollingStation,
    maskedMobile: profile.maskedMobile,
    isEligible: true,
    status: 'ELIGIBLE',
  });

  // Mark finalized
  reg.status = 'FINALIZED';
  reg.isFinalized = true;
  if (reg.details.normalizedMobile) {
    (profile as any).normalizedMobile = reg.details.normalizedMobile;
  }

  // 8. Audit event
  serverStore.recordAuditEvent({
    id: `audit-reg-final-${now}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: now,
    type: 'ADMIN_ACTION',
    description: `Voter successfully registered: '${simulationVoterId}' (Fingerprint & Photo Verified) by officer '${session?.accountId}'`,
    electionId: 1,
  });

  res.status(201).json({
    success: true,
    message: 'Voter registration successfully completed. Unique simulation voter ID assigned.',
    simulationVoterId,
    voter: profile,
  });
});

/**
 * GET /api/admin/voters/pending/:pendingId
 * Retrieves current pending registration status and verification checkpoints.
 */

/**
 * POST /api/admin/voters/cancel-registration
 * Cancels an in-progress voter registration draft safely.
 * Releases temporary identity reservations so the operator can retry with the same phone number.
 * Cannot cancel already-finalized registrations (completed voters).
 * Idempotent: Repeated cancellations return 200 without side effects.
 */
adminRouter.post('/voters/cancel-registration', requirePermission('VOTER_CREATE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const { pendingId, reason } = req.body;

  if (!pendingId || typeof pendingId !== 'string') {
    res.status(400).json({ success: false, message: 'Missing pendingId parameter.' });
    return;
  }

  const reg = pendingRegistrations.get(pendingId.trim());
  if (!reg) {
    res.status(404).json({ success: false, message: 'Pending registration draft not found.' });
    return;
  }

  // Guard: Completed registrations cannot be cancelled via draft cancellation
  if (reg.isFinalized || reg.status === 'FINALIZED') {
    res.status(409).json({
      success: false,
      code: 'CANNOT_CANCEL_FINALIZED',
      message: 'Cannot cancel a finalized voter registration. Completed voter profiles must be managed via authorized voter deactivation.',
    });
    return;
  }

  // Idempotent: If already cancelled, return success cleanly
  if (reg.status === 'CANCELLED') {
    res.status(200).json({
      success: true,
      message: 'Registration draft is already cancelled. Identity reservation is released.',
      pendingId: reg.pendingId,
      status: 'CANCELLED',
    });
    return;
  }

  const now = Date.now();
  reg.status = 'CANCELLED';
  reg.isFinalized = false;
  reg.cancelledAt = now;
  reg.cancelledByOfficerId = session?.accountId || 'VRO-SIM-001';
  reg.cancellationReason = typeof reason === 'string' && reason.trim() ? reason.trim() : 'Operator cancelled registration wizard';
  reg.fingerprintVerification.status = 'CANCELLED';
  reg.photoVerification.status = 'CANCELLED';
  reg.updatedAt = now;

  serverStore.recordAuditEvent({
    id: `audit-preg-cancel-${now}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: now,
    type: 'ADMIN_ACTION',
    description: `Voter registration draft '${pendingId}' safely cancelled by officer '${session?.accountId}' (Reason: ${reg.cancellationReason})`,
    electionId: 1,
  });

  res.status(200).json({
    success: true,
    message: 'Registration draft cancelled successfully. Identity reservation has been released.',
    pendingId: reg.pendingId,
    status: 'CANCELLED',
  });
});

/**
 * DELETE /api/admin/voters/pending/:pendingId
 * RESTful alias for cancelling a pending registration draft.
 */
adminRouter.delete('/voters/pending/:pendingId', requirePermission('VOTER_CREATE'), async (req: Request, res: Response): Promise<void> => {
  const session = (req as any).officer as OfficerSession;
  const { pendingId } = req.params;
  const reason = (req.query?.reason as string) || (req.body?.reason as string) || 'DELETE requested by officer';

  if (!pendingId || typeof pendingId !== 'string') {
    res.status(400).json({ success: false, message: 'Missing pendingId parameter.' });
    return;
  }

  const reg = pendingRegistrations.get(pendingId.trim());
  if (!reg) {
    res.status(404).json({ success: false, message: 'Pending registration draft not found.' });
    return;
  }

  if (reg.isFinalized || reg.status === 'FINALIZED') {
    res.status(409).json({
      success: false,
      code: 'CANNOT_CANCEL_FINALIZED',
      message: 'Cannot cancel a finalized voter registration. Completed voter profiles must be managed via authorized voter deactivation.',
    });
    return;
  }

  if (reg.status === 'CANCELLED') {
    res.status(200).json({
      success: true,
      message: 'Registration draft is already cancelled. Identity reservation is released.',
      pendingId: reg.pendingId,
      status: 'CANCELLED',
    });
    return;
  }

  const now = Date.now();
  reg.status = 'CANCELLED';
  reg.isFinalized = false;
  reg.cancelledAt = now;
  reg.cancelledByOfficerId = session?.accountId || 'VRO-SIM-001';
  reg.cancellationReason = reason;
  reg.fingerprintVerification.status = 'CANCELLED';
  reg.photoVerification.status = 'CANCELLED';
  reg.updatedAt = now;

  serverStore.recordAuditEvent({
    id: `audit-preg-del-${now}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: now,
    type: 'ADMIN_ACTION',
    description: `Voter registration draft '${pendingId}' deleted/cancelled by officer '${session?.accountId}'`,
    electionId: 1,
  });

  res.status(200).json({
    success: true,
    message: 'Registration draft cancelled successfully. Identity reservation has been released.',
    pendingId: reg.pendingId,
    status: 'CANCELLED',
  });
});

adminRouter.get('/voters/pending/:pendingId', requirePermission('VOTER_READ'), async (req: Request, res: Response): Promise<void> => {
  const { pendingId } = req.params;
  const reg = pendingRegistrations.get(pendingId.trim());
  if (!reg) {
    res.status(404).json({ success: false, message: 'Pending registration not found.' });
    return;
  }
  res.status(200).json({ success: true, pendingRegistration: reg, pending: reg });
});

