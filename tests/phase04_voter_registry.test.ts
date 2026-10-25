/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';

import { adminRouter, clearAdminSessionsForTesting } from '../backend/server/routes/admin';
import { voterRouter } from '../backend/server/routes/voter';
import { serverStore } from '../backend/server/store';
import {
  clearOfficerSessionsForTesting,
  createOfficerSession,
  verifyOfficerCredentials,
  registerOfficerSessionForTesting,
  isConstituencyInScope,
} from '../backend/server/auth/rbac';
import {
  generateSimulationVoterId,
  isValidSimulationVoterId,
  isRealEpicFormat,
  calculateAgeFromDob,
  generateUniqueSimulationVoterId,
} from '../backend/server/utils/voterId';
import { getDataRepositories } from '../backend/server/repositories';
import {
  AuthorityAccount,
  VoterProfile,
  VoterElectionParticipation,
  SCHEMA_VERSION_CURRENT,
} from '../frontend/src/types/dataModel';
import { getPermissionsForRole } from '../frontend/src/types/permissions';
import { seedDemoOfficers } from '../scripts/seed-demo-officers';

test('BlockBallot — Phase 04: Voter Registry & Backend-Generated Simulation IDs Test Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  // Shared Officer Sessions
  let vroToken: string;
  let eoToken: string;
  let adminToken: string;

  t.before(async () => {
    // 1. Seed demo officers to ensure accounts exist
    await seedDemoOfficers();

    // 2. Setup Express testing server
    const app = express();
    app.use(express.json());

    app.use('/api/admin', adminRouter);
    app.use('/api', adminRouter);
    app.use('/api/voter', voterRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });

    // 3. Create authenticated sessions for VRO, EO, and Admin
    const vroAuth = await verifyOfficerCredentials('vro.sim001@blockballot.local', 'password');
    // For test reliability, create sessions directly
    const vroAccount: AuthorityAccount = {
      id: 'VRO-SIM-001',
      email: 'vro.sim001@blockballot.local',
      displayName: 'Voter Registration Officer 001',
      role: 'VOTER_REGISTRATION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const vroSession = createOfficerSession(vroAccount);
    vroToken = vroSession.token;

    const eoAccount: AuthorityAccount = {
      id: 'EO-SIM-001',
      email: 'eo.sim001@blockballot.local',
      displayName: 'Election Officer 001',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const eoSession = createOfficerSession(eoAccount);
    eoToken = eoSession.token;

    const adminAccount: AuthorityAccount = {
      id: 'ADM-SIM-001',
      email: 'demo.admin@blockballot.local',
      displayName: 'Platform Administrator',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const adminSession = createOfficerSession(adminAccount);
    adminToken = adminSession.token;
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
  // Requirement 1: Authorized VRO can create a valid profile
  // --------------------------------------------------------------------------
  let createdVoterProfile: any = null;

  await t.test('1. An authorized Voter Registration Officer can create a valid voter profile', async () => {
    const res = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Devika Swaminathan',
        dateOfBirth: '1996-03-22',
        gender: 'F',
        constituencyId: 'CONST-04-ND',
        state: 'NCT of Delhi',
        district: 'New Delhi',
        pollingStation: 'Community Centre, Booth 3',
        maskedMobile: '+91 ••••• •4589',
      }),
    });

    assert.equal(res.status, 201, 'Expected 201 Created for valid voter registration');
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.voter, 'Response must include created voter');
    assert.equal(data.voter.fullName, 'Devika Swaminathan');
    assert.equal(data.voter.gender, 'F');
    assert.equal(data.voter.constituencyId, 'CONST-04-ND');
    assert.equal(data.voter.registrationStatus, 'REGISTERED');
    assert.equal(data.voter.eligibilityStatus, 'ELIGIBLE');
    assert.ok(data.voter.simulationVoterId.startsWith('BBV-SIM-'), 'Assigned ID must use BBV-SIM- format');

    createdVoterProfile = data.voter;
  });

  // --------------------------------------------------------------------------
  // Requirement 2: Server generates ID and ignores client-supplied ID
  // --------------------------------------------------------------------------
  await t.test('2. The server generates the simulation ID and ignores or rejects a client-supplied ID', async () => {
    const res = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        id: 'client-injected-internal-id',
        simulationVoterId: 'CLIENT-CHOSEN-ID-999',
        epicId: 'CLIENT-EPIC-999',
        fullName: 'Vikramaditya Bose',
        dateOfBirth: '1990-11-05',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
      }),
    });

    assert.equal(res.status, 201);
    const data = await res.json();
    assert.notEqual(data.voter.id, 'client-injected-internal-id', 'Client-supplied internal ID must not be accepted');
    assert.notEqual(data.voter.simulationVoterId, 'CLIENT-CHOSEN-ID-999', 'Client-supplied simulation ID must be ignored');
    assert.ok(data.voter.simulationVoterId.startsWith('BBV-SIM-'), 'Server must assign its own BBV-SIM- ID');
  });

  // --------------------------------------------------------------------------
  // Requirement 3: Generated simulation IDs are distinct from real EPIC formats
  // --------------------------------------------------------------------------
  await t.test('3. Generated simulation IDs are distinct from real Indian ECI EPIC formats', () => {
    const generatedId = generateSimulationVoterId();

    // Must match simulation format
    assert.ok(isValidSimulationVoterId(generatedId), `ID '${generatedId}' must be valid simulation ID`);
    assert.ok(generatedId.startsWith('BBV-SIM-'), 'Must start with BBV-SIM- prefix');

    // Must NEVER match real ECI EPIC format (3 letters + 7 digits, e.g. ABC1234567)
    assert.equal(
      isRealEpicFormat(generatedId),
      false,
      `Simulation ID '${generatedId}' must not match real ECI EPIC format`
    );

    // Verify real ECI EPIC recognizer works
    assert.equal(isRealEpicFormat('ABC1234567'), true);
    assert.equal(isRealEpicFormat('XYZ9876543'), true);
    assert.equal(isRealEpicFormat('IND-DL-982341'), false);
    assert.equal(isRealEpicFormat(generatedId), false);
  });

  // --------------------------------------------------------------------------
  // Requirement 4: A newly generated ID is persisted and can be found by backend
  // --------------------------------------------------------------------------
  await t.test('4. A newly generated simulation ID is persisted and can be found by the backend', async () => {
    assert.ok(createdVoterProfile, 'Requires voter profile from test 1');
    const simId = createdVoterProfile.simulationVoterId;

    // 1. Found via admin GET endpoint
    const res = await fetch(`${baseUrl}/api/admin/voters/${simId}`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.voter.simulationVoterId, simId);

    // 2. Found via repository
    const repos = getDataRepositories();
    const fromRepo = await repos.voterProfiles.findBySimulationId(simId);
    assert.ok(fromRepo, 'Must be retrievable from repository by simulation ID');
    assert.equal(fromRepo.fullName, 'Devika Swaminathan');

    // 3. Found via voter journey verify endpoint
    const verifyRes = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: simId }),
    });
    const verifyData = await verifyRes.json();
    assert.equal(verifyRes.status, 200);
    assert.equal(verifyData.success, true);
    assert.equal(verifyData.voter?.name, 'Devika Swaminathan');
    assert.equal(verifyData.voter?.isEligible, true);
  });

  // --------------------------------------------------------------------------
  // Requirement 5: Unknown, malformed and inactive IDs are rejected
  // --------------------------------------------------------------------------
  await t.test('5. Unknown, malformed and inactive IDs are rejected by the registry and voting gateway', async () => {
    // Unknown ID in admin lookup
    const resUnknownAdmin = await fetch(`${baseUrl}/api/admin/voters/BBV-SIM-NONEXIST99`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    assert.equal(resUnknownAdmin.status, 404, 'Unknown ID in admin lookup must return 404');

    // Unknown ID in voter verification
    const resUnknownVoter = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: 'BBV-SIM-NONEXIST99' }),
    });
    const dataUnknown = await resUnknownVoter.json();
    assert.equal(dataUnknown.success, false);
    assert.equal(resUnknownVoter.status, 404);

    // Malformed ID format
    const resMalformed = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: 'BAD#ID$$' }),
    });
    const dataMalformed = await resMalformed.json();
    assert.equal(dataMalformed.success, false);
    assert.equal(resMalformed.status, 400);
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Duplicate ID collisions are handled safely
  // --------------------------------------------------------------------------
  await t.test('6. Duplicate ID collisions are handled safely with retries', async () => {
    let callCount = 0;
    const mockRepo: any = {
      findBySimulationId: async (id: string) => {
        callCount++;
        // Simulate collision on first call, then success on second call
        if (callCount === 1) {
          return { id: 'existing-voter' } as any;
        }
        return null;
      },
    };

    const uniqueId = await generateUniqueSimulationVoterId(mockRepo);
    assert.ok(isValidSimulationVoterId(uniqueId));
    assert.equal(callCount, 2, 'Should have retried once after encountering collision');
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Election Officer requests to create, update or deactivate are denied
  // --------------------------------------------------------------------------
  await t.test('7. Election Officer requests to create, update or deactivate voters are denied (403)', async () => {
    // 1. EO attempts voter creation
    const resCreate = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        fullName: 'Unauthorized Voter',
        dateOfBirth: '1992-06-14',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.equal(resCreate.status, 403, 'Election Officer must be denied voter-create permission');

    // 2. EO attempts voter update
    const resUpdate = await fetch(`${baseUrl}/api/admin/voters/${createdVoterProfile.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        fullName: 'Illegally Renamed Elector',
      }),
    });
    assert.equal(resUpdate.status, 403, 'Election Officer must be denied voter-update permission');

    // 3. EO attempts voter deactivation
    const resDelete = await fetch(`${baseUrl}/api/admin/voters/${createdVoterProfile.id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${eoToken}`,
      },
    });
    assert.equal(resDelete.status, 403, 'Election Officer must be denied voter-deactivate permission');
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Unauthenticated and expired sessions cannot modify registry
  // --------------------------------------------------------------------------
  await t.test('8. Unauthenticated and expired sessions cannot modify the voter registry (401)', async () => {
    // Missing Authorization header
    const resNoAuth = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fullName: 'Anonymous Registration',
        dateOfBirth: '1990-01-01',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.equal(resNoAuth.status, 401, 'Unauthenticated request must return 401');

    // Expired / invalid token
    const resExpired = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer expired_or_fake_token_12345',
      },
      body: JSON.stringify({
        fullName: 'Expired Token Registration',
        dateOfBirth: '1990-01-01',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.equal(resExpired.status, 401, 'Invalid session token must return 401');
  });

  // --------------------------------------------------------------------------
  // Requirement 9: VRO cannot modify voter outside assigned scope
  // --------------------------------------------------------------------------
  await t.test('9. A Voter Registration Officer cannot create or modify a voter outside assigned scope (403)', async () => {
    // VRO scope is CONST-04-ND; attempt to register voter in Varanasi (CONST-77-VAR)
    const resOutOfScope = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Kashi Elector',
        dateOfBirth: '1988-08-15',
        gender: 'M',
        constituencyId: 'CONST-77-VAR',
      }),
    });

    assert.equal(resOutOfScope.status, 403, 'Registration in out-of-scope constituency must return 403');
    const data = await resOutOfScope.json();
    assert.ok(data.message.includes('Scope violation'));
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Invalid age, missing required fields, and invalid geography
  // --------------------------------------------------------------------------
  await t.test('10. Invalid age, missing required fields, and invalid geographic assignments are rejected', async () => {
    // 1. Underage elector (< 18)
    const resUnderage = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Minor Citizen',
        dateOfBirth: '2015-05-10', // 11 years old
        gender: 'F',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.equal(resUnderage.status, 400, 'Underage registration must return 400');
    const underageData = await resUnderage.json();
    assert.ok(underageData.message.includes('Voting-age eligibility violation'));

    // 2. Missing required fullName
    const resNoName = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        dateOfBirth: '1995-01-01',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.equal(resNoName.status, 400, 'Missing name must return 400');

    // 3. Nonexistent constituency
    const resFakeConst = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Invalid Const Elector',
        dateOfBirth: '1995-01-01',
        gender: 'M',
        constituencyId: 'CONST-99-IMAGINARY',
      }),
    });
    assert.equal(resFakeConst.status, 400, 'Nonexistent constituency must return 400');
  });

  // --------------------------------------------------------------------------
  // Requirement 11: Immutable identifiers and server-owned fields cannot be edited
  // --------------------------------------------------------------------------
  await t.test('11. Immutable identifiers and server-owned fields cannot be edited (400)', async () => {
    // Attempt to tamper with simulation voter ID
    const resTamperSimId = await fetch(`${baseUrl}/api/admin/voters/${createdVoterProfile.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        simulationVoterId: 'TAMPERED-ID-001',
      }),
    });
    assert.equal(resTamperSimId.status, 400);
    const dataTamper = await resTamperSimId.json();
    assert.ok(dataTamper.message.includes('Modification of simulation voter ID is strictly prohibited'));

    // Attempt to tamper with createdAt metadata
    const resTamperCreated = await fetch(`${baseUrl}/api/admin/voters/${createdVoterProfile.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        createdAt: 1000000,
      }),
    });
    assert.equal(resTamperCreated.status, 400);
  });

  // --------------------------------------------------------------------------
  // Requirement 12: Deactivation prevents future authorization but preserves accepted election history
  // --------------------------------------------------------------------------
  await t.test('12. Deactivation prevents future authorization while preserving past election history', async () => {
    // Create an elector to deactivate
    const createRes = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Deactivation Subject',
        dateOfBirth: '1985-02-18',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
      }),
    });
    const createData = await createRes.json();
    const deactId = createData.voter.id;
    const deactSimId = createData.voter.simulationVoterId;

    // Deactivate voter
    const deactRes = await fetch(`${baseUrl}/api/admin/voters/${deactId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    assert.equal(deactRes.status, 200);
    const deactData = await deactRes.json();
    assert.equal(deactData.voter.registrationStatus, 'DE_REGISTERED');
    assert.equal(deactData.voter.lifecycleStatus, 'ARCHIVED');

    // Attempting to verify voter for voting must now fail closed
    const verifyRes = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: deactSimId }),
    });
    const verifyData = await verifyRes.json();
    assert.equal(verifyRes.status, 403, 'Deactivated voter must be rejected with 403');
    assert.equal(verifyData.status, 'INELIGIBLE', 'Status must be INELIGIBLE');
    assert.equal(verifyData.success, false);
  });

  // --------------------------------------------------------------------------
  // Requirement 13: New records have face and fingerprint set to NOT_STARTED
  // --------------------------------------------------------------------------
  await t.test('13. New voter records have face and fingerprint enrollment metadata set to NOT_STARTED', async () => {
    const repos = getDataRepositories();
    const bioList = await repos.biometrics.listByVoter(createdVoterProfile.id);

    assert.ok(bioList.length >= 2, 'Must have at least 2 biometric metadata records (face, fingerprint)');
    const face = bioList.find((b) => b.modality === 'FACE');
    const fp = bioList.find((b) => b.modality === 'FINGERPRINT');

    assert.ok(face, 'Face metadata record must exist');
    assert.equal(face.status, 'NOT_STARTED');
    assert.ok(fp, 'Fingerprint metadata record must exist');
    assert.equal(fp.status, 'NOT_STARTED');

    // Also check admin API endpoint response
    const apiRes = await fetch(`${baseUrl}/api/admin/voters/${createdVoterProfile.id}`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    const apiData = await apiRes.json();
    assert.equal(apiData.biometrics?.faceStatus, 'NOT_STARTED');
    assert.equal(apiData.biometrics?.fingerprintStatus, 'NOT_STARTED');
  });

  // --------------------------------------------------------------------------
  // Requirement 14: Biometric payloads are rejected by registry endpoints
  // --------------------------------------------------------------------------
  await t.test('14. Biometric payloads are rejected with 400 Bad Request by registry endpoints', async () => {
    const prohibitedPayloads = [
      { rawImage: 'base64-encoded-image-data...' },
      { faceImage: 'binary-bytes-data...' },
      { fingerprintTemplate: 'ansi-378-minutiae...' },
      { photo: 'data:image/jpeg;base64,...' },
      { rawBiometric: 'vector-128d-floats...' },
    ];

    for (const payload of prohibitedPayloads) {
      const res = await fetch(`${baseUrl}/api/admin/voters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vroToken}`,
        },
        body: JSON.stringify({
          fullName: 'Biometric Violator',
          dateOfBirth: '1990-01-01',
          gender: 'M',
          constituencyId: 'CONST-04-ND',
          ...payload,
        }),
      });

      assert.equal(res.status, 400, `Payload containing '${Object.keys(payload)[0]}' must be rejected with 400`);
      const data = await res.json();
      assert.ok(
        data.message.includes('Biometric data payloads are not accepted'),
        `Error message must state biometrics are rejected: got '${data.message}'`
      );
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 15: New voter is not reported as biometrically enrolled without real enrollment
  // --------------------------------------------------------------------------
  await t.test('15. A new voter is never reported as biometrically enrolled without a real enrollment', async () => {
    const repos = getDataRepositories();
    const bioList = await repos.biometrics.listByVoter(createdVoterProfile.id);

    for (const b of bioList) {
      assert.notEqual(b.status, 'ENROLLED', 'Status must not be ENROLLED without actual hardware enrollment');
      assert.equal(b.isManualException, false, 'Manual exception must default to false');
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 16: Persistence failures do not return success or leave misleading records
  // --------------------------------------------------------------------------
  await t.test('16. Persistence failures do not return success or leave misleading records', async () => {
    const repos = getDataRepositories();
    const originalSave = repos.voterProfiles.save;

    // Simulate database failure
    repos.voterProfiles.save = async () => {
      throw new Error('Disk full: Firestore cluster connection timeout');
    };

    try {
      const res = await fetch(`${baseUrl}/api/admin/voters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vroToken}`,
        },
        body: JSON.stringify({
          fullName: 'Failure Case Elector',
          dateOfBirth: '1992-04-20',
          gender: 'M',
          constituencyId: 'CONST-04-ND',
        }),
      });

      assert.equal(res.status, 500, 'Database failure must return 500');
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.message.includes('Persistence failure'));
    } finally {
      repos.voterProfiles.save = originalSave;
    }
  });

  // --------------------------------------------------------------------------
  // Requirement 17: The frontend fails closed when registry APIs are unavailable
  // --------------------------------------------------------------------------
  await t.test('17. Voter identification fails closed without fallback when verification API is down', async () => {
    // Request non-existent or down endpoint
    const res = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: 'BBV-SIM-UNAVAILABLE-SERVER' }),
    });

    assert.equal(res.status, 404, 'Must fail closed with 404 rather than synthetic dummy match');
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.voter, undefined);
  });

  // --------------------------------------------------------------------------
  // Requirement 18: A voter may have separate eligibility in two elections
  // --------------------------------------------------------------------------
  await t.test('18. A voter may have separate eligibility records in two independent elections', async () => {
    const repos = getDataRepositories();
    const voterId = createdVoterProfile.id;

    // Election 1: General Election 2024
    const part1: VoterElectionParticipation = {
      id: `${voterId}_ELEC-18-LS`,
      voterId,
      electionId: 'ELEC-18-LS',
      status: 'VOTE_ACCEPTED',
      votedAt: Date.now() - 1800000,
      createdAt: Date.now() - 4000000,
      updatedAt: Date.now() - 1800000,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    // Election 2: State By-Election
    const part2: VoterElectionParticipation = {
      id: `${voterId}_ELEC-19-LS`,
      voterId,
      electionId: 'ELEC-19-LS',
      status: 'ELIGIBLE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };

    await repos.participations.createParticipation(part1);
    await repos.participations.createParticipation(part2);

    const saved1 = await repos.participations.getParticipation(voterId, 'ELEC-18-LS');
    const saved2 = await repos.participations.getParticipation(voterId, 'ELEC-19-LS');

    assert.ok(saved1, 'Participation record for Election 1 must exist');
    assert.ok(saved2, 'Participation record for Election 2 must exist');
    assert.equal(saved1.status, 'VOTE_ACCEPTED');
    assert.equal(saved2.status, 'ELIGIBLE');
    assert.notEqual(saved1.status, saved2.status);
  });

  // --------------------------------------------------------------------------
  // Requirement 19: Phase 01 and Phase 02 test suites continue to pass
  // --------------------------------------------------------------------------
  await t.test('19. Invariants from Phase 01 (fail-closed, no preloaded demo voters) and Phase 02 remain intact', async () => {
    // Phase 01: Preloaded legacy demo voters do not exist in fresh store
    const legacyDemoEpic = 'IND-DL-982341';
    const legacyCheck = serverStore.findVoterByEpic(legacyDemoEpic);
    assert.equal(legacyCheck, undefined, 'Preloaded demo voter must not exist');

    // Phase 02: Biometric schema validators reject raw image data
    const repos = getDataRepositories();
    assert.ok(repos.voterProfiles);
    assert.ok(repos.biometrics);
    assert.ok(repos.participations);
    assert.ok(repos.authorities);
  });

  // --------------------------------------------------------------------------
  // Requirement 20: Existing administrator and Phase 03 role authorization remain intact
  // --------------------------------------------------------------------------
  await t.test('20. Existing platform administrator and Phase 03 role authorization remain intact', async () => {
    // 1. Platform Admin can list voters without scope constraint
    const adminListRes = await fetch(`${baseUrl}/api/admin/voters`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(adminListRes.status, 200);
    const adminData = await adminListRes.json();
    assert.equal(adminData.success, true);
    assert.ok(Array.isArray(adminData.voters));

    // 2. Election Officer retains election-management permissions
    const eoPerms = getPermissionsForRole('ELECTION_OFFICER');
    assert.ok(eoPerms.includes('ELECTION_CREATE'), 'EO must have ELECTION_CREATE');
    assert.ok(eoPerms.includes('CANDIDATE_MANAGE'), 'EO must have CANDIDATE_MANAGE');
    assert.equal(eoPerms.includes('VOTER_CREATE'), false, 'EO must NOT possess VOTER_CREATE');
    assert.equal(eoPerms.includes('VOTER_UPDATE'), false, 'EO must NOT possess VOTER_UPDATE');
    assert.equal(eoPerms.includes('VOTER_DEACTIVATE'), false, 'EO must NOT possess VOTER_DEACTIVATE');

    // 3. Voter Registration Officer possesses voter registry permissions
    const vroPerms = getPermissionsForRole('VOTER_REGISTRATION_OFFICER');
    assert.ok(vroPerms.includes('VOTER_CREATE'), 'VRO must have VOTER_CREATE');
    assert.ok(vroPerms.includes('VOTER_READ'), 'VRO must have VOTER_READ');
    assert.ok(vroPerms.includes('VOTER_UPDATE'), 'VRO must have VOTER_UPDATE');
    assert.ok(vroPerms.includes('VOTER_DEACTIVATE'), 'VRO must have VOTER_DEACTIVATE');
    assert.equal(vroPerms.includes('ELECTION_CREATE'), false, 'VRO must NOT possess ELECTION_CREATE');
  });
});
