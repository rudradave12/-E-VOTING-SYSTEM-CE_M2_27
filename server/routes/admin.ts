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
import {
  AuthorityAccount,
  VoterProfile,
  BiometricEnrollmentMetadata,
  SCHEMA_VERSION_CURRENT,
} from '../../src/types/dataModel';
import { getDataRepositories } from '../repositories';
import {
  generateUniqueSimulationVoterId,
  calculateAgeFromDob,
  isValidSimulationVoterId,
} from '../utils/voterId';

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
    eligibilityStatus: 'ELIGIBLE',
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
    isEligible: true,
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
      maskedMobile: sv.maskedMobile,
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

  res.status(200).json({ success: true, voters: profiles, count: profiles.length });
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
