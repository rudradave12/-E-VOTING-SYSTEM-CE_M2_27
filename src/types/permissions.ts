/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { AuthorityRole, AuthorityAssignmentScope } from './dataModel';
export type { AuthorityRole, AuthorityAssignmentScope };

/**
 * BlockBallot — Centralized Permission Registry & RBAC Policy
 *
 * Exactly two operational officer roles are supported:
 * 1. ELECTION_OFFICER (EO-SIM-001): Manages election lifecycle, candidate lists, and reviews exceptions.
 * 2. VOTER_REGISTRATION_OFFICER (VRO-SIM-001): Enrolls voters, reviews voter records, initiates biometrics.
 *
 * In addition, the existing PLATFORM_ADMIN (demo.admin@blockballot.local) remains the local platform/system
 * administrator with full management access for academic development, not a third operational officer role.
 */

export type Permission =
  | 'ELECTION_READ'
  | 'ELECTION_CREATE'
  | 'ELECTION_UPDATE'
  | 'ELECTION_ACTIVATE'
  | 'ELECTION_PAUSE'
  | 'ELECTION_CONCLUDE'
  | 'CANDIDATE_READ'
  | 'CANDIDATE_MANAGE'
  | 'VOTER_READ'
  | 'VOTER_CREATE'
  | 'VOTER_UPDATE'
  | 'VOTER_DEACTIVATE'
  | 'BIOMETRIC_ENROLLMENT_START'
  | 'VOTER_EXCEPTION_REQUEST'
  | 'VOTER_EXCEPTION_APPROVE'
  | 'AUDIT_READ'
  | 'TURNOUT_READ'
  | 'AUTHORITY_READ'
  | 'AUTHORITY_MANAGE';

export const OPERATIONAL_OFFICER_ROLES = [
  'ELECTION_OFFICER',
  'VOTER_REGISTRATION_OFFICER',
] as const;

export type OperationalOfficerRole = (typeof OPERATIONAL_OFFICER_ROLES)[number];

export const ALL_AUTHORITY_ROLES = [
  'ELECTION_OFFICER',
  'VOTER_REGISTRATION_OFFICER',
  'PLATFORM_ADMIN',
] as const;

/**
 * Authoritative Server-Side Permission Matrix
 * Role names map strictly to permitted operations.
 */
export const ROLE_PERMISSIONS: Record<AuthorityRole, readonly Permission[]> = {
  // 1. Election Officer: Responsible for elections, nominations, turnout, and final exception approval
  ELECTION_OFFICER: [
    'ELECTION_READ',
    'ELECTION_CREATE',
    'ELECTION_UPDATE',
    'ELECTION_ACTIVATE',
    'ELECTION_PAUSE',
    'ELECTION_CONCLUDE',
    'CANDIDATE_READ',
    'CANDIDATE_MANAGE',
    'TURNOUT_READ',
    'AUDIT_READ',
    'VOTER_EXCEPTION_REQUEST', // Can request exceptions during polling (must be approved by a peer EO)
    'VOTER_EXCEPTION_APPROVE', // Designated for Phase 06 exception approval
  ],

  // 2. Voter Registration Officer: Responsible for electors, demographic updates, and exception submission
  VOTER_REGISTRATION_OFFICER: [
    'ELECTION_READ', // Must inspect available elections to verify constituency alignment
    'VOTER_READ',
    'VOTER_CREATE', // Designated for Phase 04 voter creation
    'VOTER_UPDATE', // Toggle eligibility, demographic corrections
    'VOTER_DEACTIVATE',
    'BIOMETRIC_ENROLLMENT_START', // Designated for Phase 05
    'VOTER_EXCEPTION_REQUEST', // Designated for Phase 06 exception submission
    'AUDIT_READ', // Limited audit inspection
  ],

  // 3. Platform Admin: System administration and local development management
  PLATFORM_ADMIN: [
    'ELECTION_READ',
    'ELECTION_CREATE',
    'ELECTION_UPDATE',
    'ELECTION_ACTIVATE',
    'ELECTION_PAUSE',
    'ELECTION_CONCLUDE',
    'CANDIDATE_READ',
    'CANDIDATE_MANAGE',
    'VOTER_READ',
    'VOTER_CREATE',
    'VOTER_UPDATE',
    'VOTER_DEACTIVATE',
    'BIOMETRIC_ENROLLMENT_START',
    'VOTER_EXCEPTION_REQUEST',
    'VOTER_EXCEPTION_APPROVE',
    'AUDIT_READ',
    'TURNOUT_READ',
    'AUTHORITY_READ',
    'AUTHORITY_MANAGE',
  ],
} as const;

/**
 * Checks whether a role possesses a specific permission.
 */
export function hasPermission(role: AuthorityRole, permission: Permission): boolean {
  const allowed = ROLE_PERMISSIONS[role];
  return allowed ? allowed.includes(permission) : false;
}

/**
 * Returns the list of permitted actions for a given authority role.
 */
export function getPermissionsForRole(role: AuthorityRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Type guard verifying if a string role is one of the two operational officer roles.
 */
export function isOperationalOfficerRole(role: string): role is OperationalOfficerRole {
  return OPERATIONAL_OFFICER_ROLES.includes(role as OperationalOfficerRole);
}

/**
 * Standard Demo Identifiers
 */
export const DEMO_OFFICER_IDENTIFIERS = {
  ELECTION_OFFICER: 'EO-SIM-001',
  VOTER_REGISTRATION_OFFICER: 'VRO-SIM-001',
  PLATFORM_ADMIN: 'demo-admin-uid',
} as const;

/**
 * Scope validation helper: Verifies if a constituency is within an officer's assigned jurisdiction.
 */
export function isConstituencyInScope(
  scope: AuthorityAssignmentScope | undefined,
  constituencyId: string
): boolean {
  if (!scope || !scope.constituencyIds || scope.constituencyIds.length === 0) {
    return true; // Unrestricted simulation scope (e.g. Platform Administrator)
  }
  return scope.constituencyIds.includes(constituencyId);
}

/**
 * Scope validation helper: Verifies if an election is within an officer's assigned jurisdiction.
 */
export function isElectionInScope(
  scope: AuthorityAssignmentScope | undefined,
  electionId: string
): boolean {
  if (!scope || !scope.electionIds || scope.electionIds.length === 0) {
    return true; // Unrestricted simulation scope
  }
  return scope.electionIds.includes(electionId);
}

