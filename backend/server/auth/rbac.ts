/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { SERVER_CONFIG } from '../config';
import {
  AuthorityAccount,
  AuthorityRole,
  AuthorityAssignmentScope,
  SCHEMA_VERSION_CURRENT,
} from '../../../frontend/src/types/dataModel';
import {
  Permission,
  ROLE_PERMISSIONS,
  hasPermission,
  DEMO_OFFICER_IDENTIFIERS,
} from '../../../frontend/src/types/permissions';
import { getDataRepositories } from '../repositories';
import { serverStore } from '../store';

export interface OfficerSession {
  token: string;
  accountId: string; // 'EO-SIM-001' | 'VRO-SIM-001' | 'demo-admin-uid'
  email: string;
  displayName: string;
  role: AuthorityRole;
  status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED';
  assignmentScope?: AuthorityAssignmentScope;
  permissions: readonly Permission[];
  createdAt: number;
  expiresAt: number;
  isRevoked?: boolean;
}

// In-memory officer session store: token -> OfficerSession
const officerSessions = new Map<string, OfficerSession>();

// Set of explicitly revoked session tokens
const revokedTokens = new Set<string>();

const ENV_LOCAL_PATH = path.resolve(process.cwd(), '.env.local');

/**
 * Reads a key from process.env or .env.local file if present (in development only)
 */
export function getLocalConfigValue(key: string): string {
  if (process.env[key]) {
    const val = process.env[key]!.trim().replace(/^["']|["']$/g, '');
    if (val.length > 0) return val;
  }
  const isProd = SERVER_CONFIG.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
  if (!isProd && fs.existsSync(ENV_LOCAL_PATH)) {
    try {
      const content = fs.readFileSync(ENV_LOCAL_PATH, 'utf8');
      const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
      if (match && match[1]) {
        let val = match[1].trim();
        val = val.replace(/^["']|["']$/g, '');
        if (val.length > 0) return val;
      }
    } catch {
      // Ignore read errors
    }
  }
  return '';
}

/**
 * Returns default officer account definitions for the two operational roles
 */
export function getDefaultOfficerDefinitions(): Record<string, AuthorityAccount> {
  return {
    [DEMO_OFFICER_IDENTIFIERS.ELECTION_OFFICER]: {
      id: DEMO_OFFICER_IDENTIFIERS.ELECTION_OFFICER,
      email: 'election.officer@blockballot.local',
      displayName: 'Election Officer (EO-SIM-001)',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
        electionIds: ['GE-2024'],
      },
      createdAt: 1700000000000,
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    },
    [DEMO_OFFICER_IDENTIFIERS.VOTER_REGISTRATION_OFFICER]: {
      id: DEMO_OFFICER_IDENTIFIERS.VOTER_REGISTRATION_OFFICER,
      email: 'voter.registration@blockballot.local',
      displayName: 'Voter Registration Officer (VRO-SIM-001)',
      role: 'VOTER_REGISTRATION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND'],
      },
      createdAt: 1700000000000,
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    },
    [DEMO_OFFICER_IDENTIFIERS.PLATFORM_ADMIN]: {
      id: DEMO_OFFICER_IDENTIFIERS.PLATFORM_ADMIN,
      email: 'demo.admin@blockballot.local',
      displayName: 'BlockBallot Demo Administrator',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      assignmentScope: {},
      createdAt: 1700000000000,
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    },
  };
}

/**
 * Creates a secure, expiring officer session from an authenticated AuthorityAccount
 */
export function createOfficerSession(account: AuthorityAccount, ttlMs = 4 * 60 * 60 * 1000): OfficerSession {
  const token = `adm_sec_${crypto.randomBytes(32).toString('hex')}`;
  const now = Date.now();
  const expiresAt = now + ttlMs;

  const session: OfficerSession = {
    token,
    accountId: account.id,
    email: account.email,
    displayName: account.displayName,
    role: account.role,
    status: account.status,
    assignmentScope: account.assignmentScope ? JSON.parse(JSON.stringify(account.assignmentScope)) : undefined,
    permissions: ROLE_PERMISSIONS[account.role] || [],
    createdAt: now,
    expiresAt,
    isRevoked: false,
  };

  officerSessions.set(token, session);
  return session;
}

/**
 * Retrieves a valid, unexpired, unrevoked officer session
 */
export function getOfficerSession(token: string): OfficerSession | null {
  if (!token) return null;
  if (revokedTokens.has(token)) return null;

  const session = officerSessions.get(token);
  if (!session) return null;
  if (session.isRevoked) return null;

  if (Date.now() > session.expiresAt) {
    officerSessions.delete(token);
    return null;
  }

  return session;
}

/**
 * Explicitly revokes a session on logout
 */
export function revokeOfficerSession(token: string): boolean {
  if (!token) return false;
  revokedTokens.add(token);
  const session = officerSessions.get(token);
  if (session) {
    session.isRevoked = true;
    officerSessions.delete(token);
    return true;
  }
  return false;
}

export function clearOfficerSessionsForTesting(): void {
  officerSessions.clear();
  revokedTokens.clear();
}

export function registerOfficerSessionForTesting(session: OfficerSession): void {
  officerSessions.set(session.token, session);
}

/**
 * Verifies credentials for local development accounts.
 * Fails closed in production.
 */
export async function verifyOfficerCredentials(
  loginIdOrEmail: string,
  providedPassword: string
): Promise<{ success: boolean; account?: AuthorityAccount; message?: string }> {
  const isProd = SERVER_CONFIG.NODE_ENV === 'production' || process.env.NODE_ENV === 'production';
  const isHostedDemo = process.env.HOSTED_DEMO_ENABLED === 'true';

  if (isProd && !isHostedDemo) {
    return {
      success: false,
      message: 'Access denied: Password authentication is disabled in production. Verified hardware/ID tokens required.',
    };
  }

  if (!loginIdOrEmail || !providedPassword) {
    return { success: false, message: 'Missing credentials.' };
  }

  const cleanId = loginIdOrEmail.trim().toLowerCase().replace(/_/g, '-');
  const trimmedPassword = providedPassword.trim();
  const defaults = getDefaultOfficerDefinitions();

  let targetAccount: AuthorityAccount | null = null;
  let expectedPassword = '';

  // 1. Election Officer check (EO-SIM-001 or election.officer@blockballot.local)
  if (
    cleanId === 'eo-sim-001' ||
    cleanId === 'election.officer@blockballot.local' ||
    cleanId === 'eo.sim001@blockballot.local' ||
    cleanId === 'election.officer'
  ) {
    targetAccount = defaults[DEMO_OFFICER_IDENTIFIERS.ELECTION_OFFICER];
    expectedPassword = getLocalConfigValue('OFFICER_EO_PASSWORD');
    if (!expectedPassword && !isProd) {
      expectedPassword = 'Officer@2024!';
    }
  }
  // 2. Voter Registration Officer check (VRO-SIM-001 or voter.registration@blockballot.local)
  else if (
    cleanId === 'vro-sim-001' ||
    cleanId === 'voter.registration@blockballot.local' ||
    cleanId === 'vro.sim001@blockballot.local' ||
    cleanId === 'voter.registration'
  ) {
    targetAccount = defaults[DEMO_OFFICER_IDENTIFIERS.VOTER_REGISTRATION_OFFICER];
    expectedPassword = getLocalConfigValue('OFFICER_VRO_PASSWORD');
    if (!expectedPassword && !isProd) {
      expectedPassword = 'VroOfficer@2024!';
    }
  }
  // 3. Platform Administrator check (demo.admin@blockballot.local or demo-admin-uid)
  else if (
    cleanId === 'demo.admin@blockballot.local' ||
    cleanId === 'demo-admin-uid' ||
    cleanId === 'demo.admin' ||
    cleanId === 'admin'
  ) {
    targetAccount = defaults[DEMO_OFFICER_IDENTIFIERS.PLATFORM_ADMIN];
    expectedPassword = getLocalConfigValue('DEMO_ADMIN_PASSWORD');
    if (!expectedPassword && !isProd) {
      expectedPassword = SERVER_CONFIG.DEMO_ADMIN_PASSWORD || 'DemoAdminSecret2026!';
    }
  }

  if (!targetAccount) {
    // Check repository for any provisioned account
    const repos = getDataRepositories();
    targetAccount = await repos.authorities.getAccount(loginIdOrEmail);
    if (!targetAccount) {
      targetAccount = await repos.authorities.findByEmail(loginIdOrEmail);
    }
    if (targetAccount) {
      if (targetAccount.role === 'ELECTION_OFFICER') {
        expectedPassword = getLocalConfigValue('OFFICER_EO_PASSWORD') || (!isProd ? 'Officer@2024!' : '');
      } else if (targetAccount.role === 'VOTER_REGISTRATION_OFFICER') {
        expectedPassword = getLocalConfigValue('OFFICER_VRO_PASSWORD') || (!isProd ? 'VroOfficer@2024!' : '');
      } else if (targetAccount.role === 'PLATFORM_ADMIN') {
        expectedPassword = getLocalConfigValue('DEMO_ADMIN_PASSWORD') || (!isProd ? (SERVER_CONFIG.DEMO_ADMIN_PASSWORD || 'DemoAdminSecret2026!') : '');
      }
    }
  }

  if (!targetAccount) {
    return { success: false, message: 'Invalid administrative credentials.' };
  }

  if (targetAccount.status !== 'ACTIVE') {
    return { success: false, message: `Access denied: Account '${targetAccount.id}' is ${targetAccount.status}.` };
  }

  if (isProd && (!expectedPassword || expectedPassword.length < 8)) {
    return {
      success: false,
      message: 'Administrative credentials for this profile have not been configured in server environment variables.',
    };
  }

  if (!expectedPassword || expectedPassword.length < 8 || trimmedPassword !== expectedPassword) {
    return { success: false, message: 'Invalid administrative credentials.' };
  }

  return { success: true, account: targetAccount };
}

/**
 * Extracts and validates the session token from the Authorization header
 */
export function extractSessionToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.substring(7).trim();
  }
  return null;
}

/**
 * Middleware: Authenticates the officer and attaches session to req.officer.
 * Returns 401 on missing, expired, or revoked tokens.
 */
export function authenticateOfficer(req: Request, res: Response, next: NextFunction): void {
  const token = extractSessionToken(req);
  if (!token) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Authentication required. Bearer token missing.',
    });
    return;
  }

  const session = getOfficerSession(token);
  if (!session) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Session invalid, expired, or revoked. Please log in again.',
    });
    return;
  }

  if (session.status !== 'ACTIVE') {
    res.status(403).json({
      success: false,
      message: `Forbidden: Account is ${session.status}.`,
    });
    return;
  }

  (req as any).officer = session;
  next();
}

/**
 * Middleware factory: Enforces that the authenticated officer possesses a specific permission.
 * Returns 401 if unauthenticated, 403 if unauthorized.
 */
export function requirePermission(permission: Permission) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const session: OfficerSession | undefined = (req as any).officer;

    if (!session) {
      // Run authentication first
      const token = extractSessionToken(req);
      if (!token) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized: Authentication required. Bearer token missing.',
        });
        return;
      }
      const activeSession = getOfficerSession(token);
      if (!activeSession) {
        res.status(401).json({
          success: false,
          message: 'Unauthorized: Session invalid, expired, or revoked.',
        });
        return;
      }
      if (activeSession.status !== 'ACTIVE') {
        res.status(403).json({
          success: false,
          message: `Forbidden: Account is ${activeSession.status}.`,
        });
        return;
      }
      (req as any).officer = activeSession;
      return checkPermission(activeSession, req, res, next);
    }

    checkPermission(session, req, res, next);
  };

  function checkPermission(
    session: OfficerSession,
    req: Request,
    res: Response,
    next: NextFunction
  ): void {
    if (!hasPermission(session.role, permission)) {
      // Audit denial
      serverStore.recordAuditEvent({
        id: `audit-denied-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        timestamp: Date.now(),
        type: 'ADMIN_ACTION',
        description: `Access denied: Account '${session.accountId}' (${session.role}) attempted action requiring '${permission}'`,
        electionId: 1,
      });

      res.status(403).json({
        success: false,
        message: `Forbidden: Account '${session.accountId}' with role '${session.role}' lacks required permission '${permission}'.`,
        requiredPermission: permission,
        role: session.role,
      });
      return;
    }

    next();
  }
}

export { isConstituencyInScope, isElectionInScope, DEMO_OFFICER_IDENTIFIERS } from '../../../frontend/src/types/permissions';
