/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';

import {
  Permission,
  OPERATIONAL_OFFICER_ROLES,
  ALL_AUTHORITY_ROLES,
  DEMO_OFFICER_IDENTIFIERS,
  ROLE_PERMISSIONS,
  hasPermission,
  getPermissionsForRole,
} from '../frontend/src/types/permissions';
import {
  AuthorityAccount,
  validateAuthorityAccount,
  validateVoterProfile,
  SCHEMA_VERSION_CURRENT,
} from '../frontend/src/types/dataModel';
import { adminRouter, clearAdminSessionsForTesting } from '../backend/server/routes/admin';
import { historicalRouter } from '../backend/server/routes/historical';
import { voterRouter } from '../backend/server/routes/voter';
import { serverStore } from '../backend/server/store';
import {
  clearOfficerSessionsForTesting,
  createOfficerSession,
  getOfficerSession,
  revokeOfficerSession,
  getLocalConfigValue,
  verifyOfficerCredentials,
  getDefaultOfficerDefinitions,
  isConstituencyInScope,
} from '../backend/server/auth/rbac';
import { seedDemoOfficers } from '../scripts/seed-demo-officers';
import { seedDemoAdmin } from '../scripts/seed-demo-admin';
import { getDataRepositories } from '../backend/server/repositories';
import { SERVER_CONFIG } from '../backend/server/config';

test('BlockBallot — Phase 03: Two Officer Roles & Backend RBAC Test Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  t.before(async () => {
    // Setup Express testing server
    const app = express();
    app.use(express.json());

    app.use('/api/admin', adminRouter);
    app.use('/api', adminRouter);
    app.use('/api/historical', historicalRouter);
    app.use('/api/voter', voterRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    clearAdminSessionsForTesting();
    clearOfficerSessionsForTesting();
    serverStore.resetDefaults();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 1: Only two operational officer roles defined
  // --------------------------------------------------------------------------
  await t.test('1. Only the two intended operational officer roles are defined for this release', () => {
    // Exactly two operational roles
    assert.equal(OPERATIONAL_OFFICER_ROLES.length, 2, 'Must have exactly 2 operational officer roles');
    assert.deepEqual(
      [...OPERATIONAL_OFFICER_ROLES].sort(),
      ['ELECTION_OFFICER', 'VOTER_REGISTRATION_OFFICER'].sort(),
      'Operational roles must be ELECTION_OFFICER and VOTER_REGISTRATION_OFFICER'
    );

    // Identifiers match specification
    assert.equal(DEMO_OFFICER_IDENTIFIERS.ELECTION_OFFICER, 'EO-SIM-001');
    assert.equal(DEMO_OFFICER_IDENTIFIERS.VOTER_REGISTRATION_OFFICER, 'VRO-SIM-001');

    // Platform administrator is system admin, not an operational role
    assert.equal(
      OPERATIONAL_OFFICER_ROLES.includes('PLATFORM_ADMIN' as any),
      false,
      'PLATFORM_ADMIN is a system administration role, not an operational officer role'
    );

    // Total authority roles catalogue has exactly 3: two operational + platform admin
    assert.equal(ALL_AUTHORITY_ROLES.length, 3);
    assert.ok(ALL_AUTHORITY_ROLES.includes('ELECTION_OFFICER'));
    assert.ok(ALL_AUTHORITY_ROLES.includes('VOTER_REGISTRATION_OFFICER'));
    assert.ok(ALL_AUTHORITY_ROLES.includes('PLATFORM_ADMIN'));
  });

  // --------------------------------------------------------------------------
  // Requirement 2: Seed script provisions exactly EO-SIM-001 and VRO-SIM-001
  // --------------------------------------------------------------------------
  await t.test('2. The seed script provisions exactly EO-SIM-001 and VRO-SIM-001', async () => {
    const result = await seedDemoOfficers();
    assert.equal(result.success, true, 'Seeding must succeed');
    assert.equal(result.officers.length, 2, 'Seeding must provision exactly 2 officers');

    const eo = result.officers.find((o) => o.id === 'EO-SIM-001');
    assert.ok(eo, 'EO-SIM-001 must be provisioned');
    assert.equal(eo.role, 'ELECTION_OFFICER');
    assert.deepEqual(eo.assignmentScope.constituencyIds, ['CONST-04-ND', 'CONST-77-VAR']);

    const vro = result.officers.find((o) => o.id === 'VRO-SIM-001');
    assert.ok(vro, 'VRO-SIM-001 must be provisioned');
    assert.equal(vro.role, 'VOTER_REGISTRATION_OFFICER');
    assert.deepEqual(vro.assignmentScope.constituencyIds, ['CONST-04-ND']);

    // Check repository contains valid AuthorityAccount models
    const repos = getDataRepositories();
    const eoAccount = await repos.authorities.getAccount('EO-SIM-001');
    assert.ok(eoAccount);
    const eoValidation = validateAuthorityAccount(eoAccount!);
    assert.equal(eoValidation.isValid, true);
    assert.equal(eoAccount?.status, 'ACTIVE');

    const vroAccount = await repos.authorities.getAccount('VRO-SIM-001');
    assert.ok(vroAccount);
    const vroValidation = validateAuthorityAccount(vroAccount!);
    assert.equal(vroValidation.isValid, true);
    assert.equal(vroAccount?.status, 'ACTIVE');
  });

  // --------------------------------------------------------------------------
  // Requirement 3: Repeated seeding does not duplicate accounts or alter roles
  // --------------------------------------------------------------------------
  await t.test('3. Repeated seeding does not create duplicate accounts or silently change an account role', async () => {
    const repos = getDataRepositories();
    const countBefore = (await repos.authorities.listAccounts()).length;

    // Run seed again
    const repeatResult = await seedDemoOfficers();
    assert.equal(repeatResult.success, true);

    const accountsAfter = await repos.authorities.listAccounts();
    assert.equal(accountsAfter.length, countBefore, 'Account count must remain unchanged after re-seeding');

    const eoAccount = await repos.authorities.getAccount('EO-SIM-001');
    assert.equal(eoAccount?.role, 'ELECTION_OFFICER');

    const vroAccount = await repos.authorities.getAccount('VRO-SIM-001');
    assert.equal(vroAccount?.role, 'VOTER_REGISTRATION_OFFICER');
  });

  // --------------------------------------------------------------------------
  // Requirement 4: Invalid credentials cannot authenticate
  // --------------------------------------------------------------------------
  await t.test('4. Invalid credentials cannot authenticate', async () => {
    // A. Wrong password for EO-SIM-001
    const badEo = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'EO-SIM-001', password: 'WrongPassword123!' }),
    });
    assert.equal(badEo.status, 401);
    const badEoData = await badEo.json();
    assert.equal(badEoData.success, false);

    // B. Wrong password for VRO-SIM-001
    const badVro = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'VRO-SIM-001', password: 'WrongPassword123!' }),
    });
    assert.equal(badVro.status, 401);

    // C. Non-existent identifier
    const badUser = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'NON-EXISTENT-OFFICER', password: 'SomePassword!' }),
    });
    assert.equal(badUser.status, 401);

    // D. Missing fields
    const emptyCreds = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: '' }),
    });
    assert.equal(emptyCreds.status, 401);
  });

  // --------------------------------------------------------------------------
  // Requirement 4b: Both operational accounts authenticate with Simulation ID and Demo Email
  // --------------------------------------------------------------------------
  await t.test('4b. Both operational demo accounts authenticate with Simulation ID and Demo Email', async () => {
    const eoPassword = getLocalConfigValue('OFFICER_EO_PASSWORD') || 'Officer@2024!';
    const vroPassword = getLocalConfigValue('OFFICER_VRO_PASSWORD') || 'VroOfficer@2024!';
    const adminPassword = getLocalConfigValue('DEMO_ADMIN_PASSWORD') || SERVER_CONFIG.DEMO_ADMIN_PASSWORD;

    // 1. Election Officer by Simulation ID
    const eoIdRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'EO-SIM-001', password: eoPassword }),
    });
    assert.equal(eoIdRes.status, 200, 'EO-SIM-001 login should succeed');
    const eoIdData = await eoIdRes.json();
    assert.equal(eoIdData.user.role, 'ELECTION_OFFICER');

    // 2. Election Officer by Demo Email
    const eoEmailRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'election.officer@blockballot.local', password: eoPassword }),
    });
    assert.equal(eoEmailRes.status, 200, 'election.officer@blockballot.local login should succeed');
    const eoEmailData = await eoEmailRes.json();
    assert.equal(eoEmailData.user.role, 'ELECTION_OFFICER');

    // 3. Voter Registration Officer by Simulation ID
    const vroIdRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'VRO-SIM-001', password: vroPassword }),
    });
    assert.equal(vroIdRes.status, 200, 'VRO-SIM-001 login should succeed');
    const vroIdData = await vroIdRes.json();
    assert.equal(vroIdData.user.role, 'VOTER_REGISTRATION_OFFICER');

    // 4. Voter Registration Officer by Demo Email
    const vroEmailRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'voter.registration@blockballot.local', password: vroPassword }),
    });
    assert.equal(vroEmailRes.status, 200, 'voter.registration@blockballot.local login should succeed');
    const vroEmailData = await vroEmailRes.json();
    assert.equal(vroEmailData.user.role, 'VOTER_REGISTRATION_OFFICER');

    // 5. Platform Administrator by UID
    const adminUidRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo-admin-uid', password: adminPassword }),
    });
    assert.equal(adminUidRes.status, 200, 'demo-admin-uid login should succeed');
    const adminUidData = await adminUidRes.json();
    assert.equal(adminUidData.user.role, 'PLATFORM_ADMIN');

    // 6. Platform Administrator by Email
    const adminEmailRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo.admin@blockballot.local', password: adminPassword }),
    });
    assert.equal(adminEmailRes.status, 200, 'demo.admin@blockballot.local login should succeed');
    const adminEmailData = await adminEmailRes.json();
    assert.equal(adminEmailData.user.role, 'PLATFORM_ADMIN');
  });

  // --------------------------------------------------------------------------
  // Requirement 4c: Repeated seeding preserves all credentials without clobbering
  // --------------------------------------------------------------------------
  await t.test('4c. Repeated seeding preserves officer and admin credentials without clobbering', async () => {
    await seedDemoAdmin();
    const eoBefore = getLocalConfigValue('OFFICER_EO_PASSWORD');
    const vroBefore = getLocalConfigValue('OFFICER_VRO_PASSWORD');
    const adminBefore = getLocalConfigValue('DEMO_ADMIN_PASSWORD');

    await seedDemoOfficers();
    await seedDemoAdmin();

    const eoAfter = getLocalConfigValue('OFFICER_EO_PASSWORD');
    const vroAfter = getLocalConfigValue('OFFICER_VRO_PASSWORD');
    const adminAfter = getLocalConfigValue('DEMO_ADMIN_PASSWORD');

    if (eoBefore) assert.equal(eoAfter, eoBefore, 'EO password must not be overwritten');
    if (vroBefore) assert.equal(vroAfter, vroBefore, 'VRO password must not be overwritten');
    if (adminBefore) assert.equal(adminAfter, adminBefore, 'Admin password must not be overwritten');
  });

  // --------------------------------------------------------------------------
  // Requirement 5: Expired, revoked, and forged tokens are denied
  // --------------------------------------------------------------------------
  await t.test('5. Expired, revoked and forged tokens are denied', async () => {
    // A. Forged token
    const forgedRes = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer forged-random-officer-token-00000',
      },
      body: JSON.stringify({ title: 'Tampered Election' }),
    });
    assert.equal(forgedRes.status, 401);

    // B. Expired session
    const defaults = getDefaultOfficerDefinitions();
    const eoAccount = defaults['EO-SIM-001'];
    const expiredSession = createOfficerSession(eoAccount, -5000); // Expired 5 seconds ago
    const expiredRes = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${expiredSession.token}`,
      },
      body: JSON.stringify({ title: 'Expired Session Election' }),
    });
    assert.equal(expiredRes.status, 401);

    // C. Revoked session via logout
    const validSession = createOfficerSession(eoAccount, 60000);
    // Verify it works first
    const activeRes = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { Authorization: `Bearer ${validSession.token}` },
    });
    assert.equal(activeRes.status, 200);

    // Revoke via logout
    const logoutRes = await fetch(`${baseUrl}/api/admin/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${validSession.token}` },
    });
    assert.equal(logoutRes.status, 200);

    // Subsequent access must be rejected with 401
    const postLogoutRes = await fetch(`${baseUrl}/api/admin/session`, {
      headers: { Authorization: `Bearer ${validSession.token}` },
    });
    assert.equal(postLogoutRes.status, 401);
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Election Officer can access permitted election operations
  // --------------------------------------------------------------------------
  await t.test('6. An Election Officer can access permitted election operations', async () => {
    const defaults = getDefaultOfficerDefinitions();
    const eoSession = createOfficerSession(defaults['EO-SIM-001']);

    // A. Create election (ELECTION_CREATE)
    const newElectionId = `ELEC-EO-TEST-${Date.now()}`;
    const createRes = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoSession.token}`,
      },
      body: JSON.stringify({
        id: newElectionId,
        title: 'Phase 03 Test By Election',
        type: 'General',
        startDate: new Date(Date.now() + 3600000).toISOString(),
        endDate: new Date(Date.now() + 7200000).toISOString(),
        constituencyIds: ['CONST-04-ND'],
      }),
    });
    assert.equal(createRes.status, 201, 'Election Officer should create election');

    // B. Transition election status of an existing active election to paused (ELECTION_PAUSE)
    const pauseRes = await fetch(`${baseUrl}/api/admin/elections/GE-2024/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoSession.token}`,
      },
      body: JSON.stringify({ status: 'paused' }),
    });
    assert.equal(pauseRes.status, 200, 'Election Officer should pause election');

    // C. Transition back to active (ELECTION_ACTIVATE)
    const activateRes = await fetch(`${baseUrl}/api/admin/elections/GE-2024/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoSession.token}`,
      },
      body: JSON.stringify({ status: 'active' }),
    });
    assert.equal(activateRes.status, 200, 'Election Officer should reactivate election');

    // D. Add candidate within assignment scope (CANDIDATE_MANAGE)
    // Unlock nominations temporarily by setting GE-2024 to paused
    const ge = serverStore.getElectionById('GE-2024');
    if (ge) ge.status = 'paused';
    try {
      const candidateRes = await fetch(`${baseUrl}/api/admin/candidates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${eoSession.token}`,
        },
        body: JSON.stringify({
          name: `Candidate ${Date.now()}`,
          constituencyId: 'CONST-04-ND',
          partyName: 'National Democratic Vanguard',
        }),
      });
      assert.equal(candidateRes.status, 201, 'Election Officer should add candidate in assigned constituency');
    } finally {
      if (ge) ge.status = 'active';
    }

    // E. View audit logs (AUDIT_READ)
    const auditRes = await fetch(`${baseUrl}/api/admin/audit`, {
      headers: { Authorization: `Bearer ${eoSession.token}` },
    });
    assert.equal(auditRes.status, 200, 'Election Officer should read audit logs');
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Election Officer is denied voter operations
  // --------------------------------------------------------------------------
  await t.test('7. An Election Officer is denied unpermitted voter-creation or voter-edit operations', async () => {
    const defaults = getDefaultOfficerDefinitions();
    const eoSession = createOfficerSession(defaults['EO-SIM-001']);

    // A. Attempt to view full voter roll (requires VOTER_READ)
    const getVotersRes = await fetch(`${baseUrl}/api/admin/voters`, {
      headers: { Authorization: `Bearer ${eoSession.token}` },
    });
    assert.equal(getVotersRes.status, 403, 'Election Officer must be denied voter roll read');
    const getVotersData = await getVotersRes.json();
    assert.equal(getVotersData.requiredPermission, 'VOTER_READ');

    // B. Attempt to modify voter eligibility (requires VOTER_UPDATE)
    const patchVoterRes = await fetch(`${baseUrl}/api/admin/voters/VOTER-ND-01/eligibility`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoSession.token}`,
      },
      body: JSON.stringify({ isEligible: false }),
    });
    assert.equal(patchVoterRes.status, 403, 'Election Officer must be denied voter eligibility modification');

    // C. Attempt to reset voter authorization (requires VOTER_UPDATE)
    const resetVoterRes = await fetch(`${baseUrl}/api/admin/voters/VOTER-ND-01/reset`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${eoSession.token}` },
    });
    assert.equal(resetVoterRes.status, 403, 'Election Officer must be denied voter reset');

    // D. Verify permission matrix asserts lack of voter permissions
    assert.equal(hasPermission('ELECTION_OFFICER', 'VOTER_READ'), false);
    assert.equal(hasPermission('ELECTION_OFFICER', 'VOTER_CREATE'), false);
    assert.equal(hasPermission('ELECTION_OFFICER', 'VOTER_UPDATE'), false);
    assert.equal(hasPermission('ELECTION_OFFICER', 'VOTER_DEACTIVATE'), false);
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Voter Registration Officer is denied election/candidate operations
  // --------------------------------------------------------------------------
  await t.test('8. A Voter Registration Officer is denied election creation, activation and candidate-management operations', async () => {
    const defaults = getDefaultOfficerDefinitions();
    const vroSession = createOfficerSession(defaults['VRO-SIM-001']);

    // A. Attempt to create election (requires ELECTION_CREATE)
    const createElecRes = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroSession.token}`,
      },
      body: JSON.stringify({ title: 'Unauthorized VRO Election' }),
    });
    assert.equal(createElecRes.status, 403, 'VRO must be denied election creation');
    const createElecData = await createElecRes.json();
    assert.equal(createElecData.requiredPermission, 'ELECTION_CREATE');

    // B. Attempt to transition election status (requires ELECTION_ACTIVATE/PAUSE/CONCLUDE)
    const patchStatusRes = await fetch(`${baseUrl}/api/admin/elections/GE-2024/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroSession.token}`,
      },
      body: JSON.stringify({ status: 'paused' }),
    });
    assert.equal(patchStatusRes.status, 403, 'VRO must be denied election status transitions');

    // C. Attempt to add candidate (requires CANDIDATE_MANAGE)
    const addCandRes = await fetch(`${baseUrl}/api/admin/candidates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroSession.token}`,
      },
      body: JSON.stringify({
        name: 'Unauthorized Candidate',
        constituencyId: 'CONST-04-ND',
        partyName: 'Independent',
      }),
    });
    assert.equal(addCandRes.status, 403, 'VRO must be denied candidate management');

    // D. VRO CAN view voter records (has VOTER_READ)
    const getVotersRes = await fetch(`${baseUrl}/api/admin/voters`, {
      headers: { Authorization: `Bearer ${vroSession.token}` },
    });
    assert.equal(getVotersRes.status, 200, 'VRO should be allowed to view voter roll');
  });

  // --------------------------------------------------------------------------
  // Requirement 9: Unauthenticated users are denied protected API calls
  // --------------------------------------------------------------------------
  await t.test('9. Unauthenticated users are denied protected API calls (401)', async () => {
    const protectedEndpoints = [
      { path: '/api/admin/elections', method: 'POST', body: { title: 'No Auth Election' } },
      { path: '/api/admin/candidates', method: 'POST', body: { name: 'No Auth Candidate' } },
      { path: '/api/admin/voters', method: 'GET' },
      { path: '/api/admin/audit', method: 'GET' },
      { path: '/api/admin/session', method: 'GET' },
    ];

    for (const ep of protectedEndpoints) {
      const res = await fetch(`${baseUrl}${ep.path}`, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : {},
        body: ep.body ? JSON.stringify(ep.body) : undefined,
      });
      assert.equal(res.status, 401, `Unauthenticated request to ${ep.path} must return 401`);
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Permissions cannot be elevated via body/header tampering
  // --------------------------------------------------------------------------
  await t.test('10. Permissions cannot be elevated by editing browser requests or submitted role fields', async () => {
    const defaults = getDefaultOfficerDefinitions();
    // VRO attempts to escalate role to PLATFORM_ADMIN via body
    const vroSession = createOfficerSession(defaults['VRO-SIM-001']);

    const tamperedRes = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroSession.token}`,
        'X-Requested-Role': 'PLATFORM_ADMIN',
        'X-Role': 'PLATFORM_ADMIN',
      },
      body: JSON.stringify({
        title: 'Tampered Escalate Election',
        role: 'PLATFORM_ADMIN',
        permissions: ['ELECTION_CREATE', 'MANAGE_ELECTIONS'],
      }),
    });

    assert.equal(tamperedRes.status, 403, 'Server must enforce session-stored role, ignoring client body/header claims');
  });

  // --------------------------------------------------------------------------
  // Requirement 11: Demo administrator behavior in development and production
  // --------------------------------------------------------------------------
  await t.test('11. The local demo administrator works in development and is disabled in production', async () => {
    const demoPassword = SERVER_CONFIG.DEMO_ADMIN_PASSWORD;

    // A. Development login works
    const devLogin = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo.admin@blockballot.local', password: demoPassword }),
    });
    assert.equal(devLogin.status, 200, 'Demo admin login should succeed in dev');
    const devData = await devLogin.json();
    assert.equal(devData.user.role, 'PLATFORM_ADMIN');
    assert.ok(devData.user.permissions.includes('ELECTION_CREATE'));
    assert.ok(devData.user.permissions.includes('VOTER_READ'));

    // B. Production simulation rejects password authentication
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      const prodVerification = await verifyOfficerCredentials('demo.admin@blockballot.local', demoPassword);
      assert.equal(prodVerification.success, false);
      assert.ok(prodVerification.message?.includes('disabled in production'));
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 12: Role-specific scope restrictions work at API layer
  // --------------------------------------------------------------------------
  await t.test('12. Role-specific scope restrictions work at the API layer', async () => {
    const defaults = getDefaultOfficerDefinitions();
    // EO has scope: ['CONST-04-ND', 'CONST-77-VAR']
    const eoSession = createOfficerSession(defaults['EO-SIM-001']);

    // Unlock nominations temporarily
    const ge = serverStore.getElectionById('GE-2024');
    if (ge) ge.status = 'paused';

    try {
      // A. In-scope candidate creation succeeds (CONST-77-VAR is in scope)
      const inScopeRes = await fetch(`${baseUrl}/api/admin/candidates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${eoSession.token}`,
        },
        body: JSON.stringify({
          name: `Candidate Varanasi ${Date.now()}`,
          constituencyId: 'CONST-77-VAR',
          partyName: 'Democratic Alliance',
        }),
      });
      assert.equal(inScopeRes.status, 201, 'Candidate creation within assigned scope must succeed');

      // B. Out-of-scope candidate creation is denied with 403 (CONST-99-MUMBAI-SOUTH is outside scope)
      const outOfScopeRes = await fetch(`${baseUrl}/api/admin/candidates`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${eoSession.token}`,
        },
        body: JSON.stringify({
          name: 'Out-Of-Scope Candidate',
          constituencyId: 'CONST-99-MUMBAI-SOUTH',
          partyName: 'Independent',
        }),
      });
      assert.equal(outOfScopeRes.status, 403, 'Candidate creation in out-of-scope constituency must return 403');
      const outData = await outOfScopeRes.json();
      assert.ok(outData.message.includes('outside officer\'s authorized assignment scope'));
    } finally {
      if (ge) ge.status = 'active';
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 13: Audit events are recorded without logging secrets
  // --------------------------------------------------------------------------
  await t.test('13. Audit events are recorded for privileged actions and denials without logging secrets', async () => {
    const events = serverStore.getAllAuditEvents();
    assert.ok(events.length > 0, 'Audit events must be recorded');

    // Check that denial audit events exist
    const deniedEvents = events.filter((e) => e.description.includes('Access denied') || e.description.includes('Scope violation'));
    assert.ok(deniedEvents.length > 0, 'Denial events must be logged in audit trail');

    // Verify secrets hygiene: No password, secret, OTP or token in plain text
    const eoPassword = getLocalConfigValue('OFFICER_EO_PASSWORD');
    const vroPassword = getLocalConfigValue('OFFICER_VRO_PASSWORD');
    const sensitiveStrings = [eoPassword, vroPassword].filter((p) => p && p.length > 6);

    for (const ev of events) {
      for (const secret of sensitiveStrings) {
        assert.equal(
          ev.description.includes(secret),
          false,
          `Audit log event ${ev.id} must NOT contain officer password`
        );
      }
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 14: Phase 01 and Phase 02 models and repositories still pass
  // --------------------------------------------------------------------------
  await t.test('14. Existing Phase 01 and Phase 02 model/repository tests still pass', async () => {
    // Phase 01 check: Zero mock preloaded voters in runtime server store
    serverStore.resetVoters();
    assert.equal(serverStore.getAllVoters().length, 0, 'Phase 01: Preloaded demo voters remain strictly removed');

    // Phase 02 check: AuthorityAccount repository operations
    const repos = getDataRepositories();
    const testOfficer: AuthorityAccount = {
      id: 'EO-TEST-UNIT-999',
      email: 'eo.test999@blockballot.local',
      displayName: 'Test Officer Account',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      schemaVersion: SCHEMA_VERSION_CURRENT,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await repos.authorities.saveAccount(testOfficer);
    const fetched = await repos.authorities.getAccount('EO-TEST-UNIT-999');
    assert.equal(fetched?.id, 'EO-TEST-UNIT-999');
    assert.equal(fetched?.displayName, 'Test Officer Account');
    assert.equal(fetched?.role, 'ELECTION_OFFICER');
  });

  // --------------------------------------------------------------------------
  // Requirement 15: Public and historical routes work without gaining private access
  // --------------------------------------------------------------------------
  await t.test('15. Public and historical routes continue to work without gaining access to private voter or authority data', async () => {
    // A. Public elections endpoint
    const electionsRes = await fetch(`${baseUrl}/api/elections`);
    assert.equal(electionsRes.status, 200);
    const electionsData = await electionsRes.json();
    assert.ok(electionsData.success);
    assert.ok(Array.isArray(electionsData.elections));

    // B. Public candidates endpoint
    const candidatesRes = await fetch(`${baseUrl}/api/candidates?constituencyId=CONST-04-ND`);
    assert.equal(candidatesRes.status, 200);
    const candidatesData = await candidatesRes.json();
    assert.ok(candidatesData.success);
    assert.ok(Array.isArray(candidatesData.candidates));

    // C. Public constituencies endpoint
    const constituenciesRes = await fetch(`${baseUrl}/api/constituencies`);
    assert.equal(constituenciesRes.status, 200);
    const constituenciesData = await constituenciesRes.json();
    assert.ok(constituenciesData.success);
    assert.ok(Array.isArray(constituenciesData.constituencies));

    // D. Public historical provenance endpoint
    const historicalRes = await fetch(`${baseUrl}/api/historical/provenance`);
    assert.equal(historicalRes.status, 200);
    const historicalData = await historicalRes.json();
    assert.ok(historicalData.success);
    assert.ok(historicalData.provenance);

    // E. None of these public responses leak authority accounts or private credentials
    const combinedStr = JSON.stringify({ electionsData, candidatesData, constituenciesData, historicalData });
    assert.equal(combinedStr.includes('OFFICER_EO_PASSWORD'), false);
    assert.equal(combinedStr.includes('OFFICER_VRO_PASSWORD'), false);
    assert.equal(combinedStr.includes('demo.admin@blockballot.local'), false);
  });

  // --------------------------------------------------------------------------
  // Requirement 16: Hosted Demo & Production Credential Security Safeguards
  // --------------------------------------------------------------------------
  await t.test('16. Production officer authentication fails closed without hardcoded fallbacks', async () => {
    const origNodeEnv = process.env.NODE_ENV;
    const origHostedDemo = process.env.HOSTED_DEMO_ENABLED;
    const origEoPass = process.env.OFFICER_EO_PASSWORD;
    const origVroPass = process.env.OFFICER_VRO_PASSWORD;
    const origAdminPass = process.env.DEMO_ADMIN_PASSWORD;

    try {
      process.env.NODE_ENV = 'production';
      delete process.env.HOSTED_DEMO_ENABLED;
      delete process.env.OFFICER_EO_PASSWORD;
      delete process.env.OFFICER_VRO_PASSWORD;
      delete process.env.DEMO_ADMIN_PASSWORD;

      // 1. In production without HOSTED_DEMO_ENABLED, password login is strictly blocked
      const blockedRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'EO-SIM-001', password: 'AnyPassword123!' }),
      });
      assert.equal(blockedRes.status, 403, 'Must return 403 when password auth is disabled in production');

      // 2. In production with HOSTED_DEMO_ENABLED but no configured environment variable, fails closed
      process.env.HOSTED_DEMO_ENABLED = 'true';
      const noEnvPassRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'EO-SIM-001', password: 'Officer@2024!' }),
      });
      assert.equal(noEnvPassRes.status, 401, 'Must reject hardcoded default passwords in production');

      // 3. In production with explicitly configured password secret, succeeds for all three profiles
      const testSecretEO = 'SecureElectionOfficerSecret2026!';
      const testSecretVRO = 'SecureVoterRegOfficerSecret2026!';
      const testSecretAdmin = 'SecurePlatformAdminSecret2026!';

      process.env.OFFICER_EO_PASSWORD = testSecretEO;
      process.env.OFFICER_VRO_PASSWORD = testSecretVRO;
      process.env.DEMO_ADMIN_PASSWORD = testSecretAdmin;

      // Test Election Officer login
      const eoLogin = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'EO-SIM-001', password: testSecretEO }),
      });
      assert.equal(eoLogin.status, 200);
      const eoData = await eoLogin.json();
      assert.equal(eoData.success, true);
      assert.equal(eoData.user.role, 'ELECTION_OFFICER');

      // Test Voter Registration Officer login
      const vroLogin = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'VRO-SIM-001', password: testSecretVRO }),
      });
      assert.equal(vroLogin.status, 200);
      const vroData = await vroLogin.json();
      assert.equal(vroData.success, true);
      assert.equal(vroData.user.role, 'VOTER_REGISTRATION_OFFICER');

      // Test Platform Administrator login
      const adminLogin = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo.admin@blockballot.local', password: testSecretAdmin }),
      });
      assert.equal(adminLogin.status, 200);
      const adminData = await adminLogin.json();
      assert.equal(adminData.success, true);
      assert.equal(adminData.user.role, 'PLATFORM_ADMIN');

      // Test wrong password rejected
      const wrongPassRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'EO-SIM-001', password: 'WrongPassword999!' }),
      });
      assert.equal(wrongPassRes.status, 401);
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      if (origHostedDemo !== undefined) process.env.HOSTED_DEMO_ENABLED = origHostedDemo;
      else delete process.env.HOSTED_DEMO_ENABLED;
      if (origEoPass !== undefined) process.env.OFFICER_EO_PASSWORD = origEoPass;
      else delete process.env.OFFICER_EO_PASSWORD;
      if (origVroPass !== undefined) process.env.OFFICER_VRO_PASSWORD = origVroPass;
      else delete process.env.OFFICER_VRO_PASSWORD;
      if (origAdminPass !== undefined) process.env.DEMO_ADMIN_PASSWORD = origAdminPass;
      else delete process.env.DEMO_ADMIN_PASSWORD;
    }
  });
});
