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
  registerOfficerSessionForTesting,
} from '../backend/server/auth/rbac';
import { getDataRepositories } from '../backend/server/repositories';
import {
  AuthorityAccount,
  VoterProfile,
  SCHEMA_VERSION_CURRENT,
} from '../frontend/src/types/dataModel';
import { getPermissionsForRole } from '../frontend/src/types/permissions';
import {
  CameraDeviceService,
  PhysicalScannerSdkAdapter,
  SimulatedPreviewScannerAdapter,
  getFingerprintScannerAdapter,
} from '../frontend/src/services/biometricService';
import { NavigationScreen } from '../frontend/src/types';

test('BlockBallot — Phase 05: Separate Biometric Enrollment UI Test Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  // Officer Sessions
  let vroToken: string;
  let eoToken: string;
  let adminToken: string;

  const testVoterId = 'vpr_test_phase05_001';
  const testVoterOutOfScopeId = 'vpr_test_phase05_out_of_scope';

  t.before(async () => {
    // 1. Setup Express testing server
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

    clearAdminSessionsForTesting();
    clearOfficerSessionsForTesting();

    // 2. Register VRO Session (Assigned to CONST-04-ND)
    const vroAccount: AuthorityAccount = {
      id: 'VRO-SIM-001',
      email: 'vro.sim001@blockballot.local',
      displayName: 'Simulated Voter Registration Officer',
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
    registerOfficerSessionForTesting(vroSession);

    // 3. Register EO Session (Lacks BIOMETRIC_ENROLLMENT_START permission)
    const eoAccount: AuthorityAccount = {
      id: 'EO-SIM-001',
      email: 'eo.sim001@blockballot.local',
      displayName: 'Simulated Election Officer',
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
    registerOfficerSessionForTesting(eoSession);

    // 4. Register Platform Admin Session
    const adminAccount: AuthorityAccount = {
      id: 'demo-admin-uid',
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
    registerOfficerSessionForTesting(adminSession);

    // 5. Seed in-scope test voter in CONST-04-ND
    const repos = getDataRepositories();
    const inScopeProfile: VoterProfile = {
      id: testVoterId,
      simulationVoterId: 'IND-ND-2024-9001',
      fullName: 'Aarav Sharma',
      dateOfBirth: '1996-03-20',
      gender: 'M',
      state: 'NCT of Delhi',
      district: 'New Delhi',
      constituencyId: 'CONST-04-ND',
      pollingStation: 'Polyclinic Centre, Booth 1',
      maskedMobile: '+91 ••••• •1234',
      registrationStatus: 'REGISTERED',
      eligibilityStatus: 'ELIGIBLE',
      lifecycleStatus: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.voterProfiles.save(inScopeProfile);

    // Seed out-of-scope test voter in CONST-77-VAR (Varanasi)
    const outOfScopeProfile: VoterProfile = {
      id: testVoterOutOfScopeId,
      simulationVoterId: 'IND-UP-2024-9002',
      fullName: 'Deepika Patel',
      dateOfBirth: '1998-07-14',
      gender: 'F',
      state: 'Uttar Pradesh',
      district: 'Varanasi',
      constituencyId: 'CONST-77-VAR',
      pollingStation: 'Ghat Civic School, Booth 3',
      maskedMobile: '+91 ••••• •5678',
      registrationStatus: 'REGISTERED',
      eligibilityStatus: 'ELIGIBLE',
      lifecycleStatus: 'ACTIVE',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    await repos.voterProfiles.save(outOfScopeProfile);

    // Initialize biometric metadata stubs (both NOT_STARTED)
    await repos.biometrics.saveMetadata({
      id: `bio_${inScopeProfile.id}_face`,
      voterId: inScopeProfile.id,
      modality: 'FACE',
      status: 'NOT_STARTED',
      biometricReferenceId: 'unassigned',
      qualityCheckStatus: 'PENDING',
      isManualException: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    });
    await repos.biometrics.saveMetadata({
      id: `bio_${inScopeProfile.id}_fingerprint`,
      voterId: inScopeProfile.id,
      modality: 'FINGERPRINT',
      status: 'NOT_STARTED',
      biometricReferenceId: 'unassigned',
      qualityCheckStatus: 'PENDING',
      isManualException: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    });
  });

  t.after(() => {
    if (server) {
      server.close();
    }
  });

  // --------------------------------------------------------------------------
  // Test 1: Navigation and Screen Route Separation
  // --------------------------------------------------------------------------
  await t.test('1. Face and Fingerprint enrollment are distinct screen routes in navigation system', () => {
    const faceScreen: NavigationScreen = 'face-enrollment';
    const fpScreen: NavigationScreen = 'fingerprint-enrollment';

    assert.notEqual(faceScreen, fpScreen, 'Face and fingerprint routes must be distinct');
    assert.equal(faceScreen, 'face-enrollment');
    assert.equal(fpScreen, 'fingerprint-enrollment');
  });

  // --------------------------------------------------------------------------
  // Test 2: Selected Voter Loading and Biometric Metadata Retrieval
  // --------------------------------------------------------------------------
  await t.test('2. Biometric metadata endpoint retrieves current status for selected voter', async () => {
    const res = await fetch(`${baseUrl}/api/admin/voters/${testVoterId}/biometrics`, {
      headers: {
        Authorization: `Bearer ${vroToken}`,
      },
    });

    assert.equal(res.status, 200, 'Authorized VRO must successfully fetch voter biometrics');
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.simulationVoterId, 'IND-ND-2024-9001');
    assert.ok(data.face, 'Face metadata record must be present');
    assert.ok(data.fingerprint, 'Fingerprint metadata record must be present');
    assert.equal(data.face.status, 'NOT_STARTED', 'Initial face status must be NOT_STARTED');
    assert.equal(data.fingerprint.status, 'NOT_STARTED', 'Initial fingerprint status must be NOT_STARTED');
  });

  // --------------------------------------------------------------------------
  // Test 3: Camera Device Service Teardown & Memory Cleanup
  // --------------------------------------------------------------------------
  await t.test('3. Camera device service properly stops media tracks and revokes object URLs', () => {
    const cameraService = CameraDeviceService.getInstance();
    let trackStopped = false;

    // Mock MediaStream and MediaStreamTrack
    const mockTrack = {
      kind: 'video',
      stop: () => {
        trackStopped = true;
      },
    } as any;

    const mockStream = {
      getTracks: () => [mockTrack],
    } as any;

    cameraService.stopCameraStream(mockStream);
    assert.equal(trackStopped, true, 'Calling stopCameraStream must stop all active video tracks');

    // Revoke URL safety check (must not throw on null/undefined or invalid string)
    assert.doesNotThrow(() => {
      cameraService.revokeBlobUrl(null);
      cameraService.revokeBlobUrl(undefined);
      cameraService.revokeBlobUrl('blob:http://localhost/test-uuid');
    });
  });

  // --------------------------------------------------------------------------
  // Test 4: Camera Error Classification for Permission Denied and Not Found
  // --------------------------------------------------------------------------
  await t.test('4. Camera device service handles environments without camera gracefully', async () => {
    const cameraService = CameraDeviceService.getInstance();
    // In Node.js testing environment, navigator.mediaDevices is absent or non-browser
    const res = await cameraService.requestCameraStream();
    assert.equal(res.success, false);
    assert.ok(res.error, 'An explicit error message must be returned');
    assert.equal(res.errorType, 'NOT_SUPPORTED', 'Should indicate NOT_SUPPORTED when mediaDevices is absent');
  });

  // --------------------------------------------------------------------------
  // Test 5: Fingerprint Hardware Adapter Honest Boundary
  // --------------------------------------------------------------------------
  await t.test('5. Physical scanner adapter honestly reports NOT_DETECTED when daemon is absent', async () => {
    const physicalAdapter = new PhysicalScannerSdkAdapter();
    assert.equal(physicalAdapter.isSimulation, false);

    const isConnected = await physicalAdapter.isHardwareConnected();
    assert.equal(isConnected, false, 'Hardware should not report connected when no local daemon is active');

    const status = await physicalAdapter.getStatus();
    assert.equal(status, 'NOT_DETECTED', 'Status must be NOT_DETECTED');

    // Scanning should fail cleanly with informative message
    const scanResult = await physicalAdapter.captureImpression(1, 'THUMB');
    assert.equal(scanResult.success, false);
    assert.equal(scanResult.status, 'NOT_DETECTED');
    assert.equal(scanResult.isSimulated, false);
    assert.ok(scanResult.message.includes('No physical fingerprint scanner SDK'));
  });

  // --------------------------------------------------------------------------
  // Test 6: Simulated Scanner Adapter Distinct Marking
  // --------------------------------------------------------------------------
  await t.test('6. Simulated preview adapter marks all captures explicitly as demonstration previews', async () => {
    const simAdapter = new SimulatedPreviewScannerAdapter();
    assert.equal(simAdapter.isSimulation, true, 'Simulated adapter must have isSimulation=true');

    const status = await simAdapter.getStatus();
    assert.equal(status, 'CONNECTED');

    const result = await simAdapter.captureImpression(1, 'THUMB');
    assert.equal(result.success, true);
    assert.equal(result.isSimulated, true, 'Scan result must be flagged as isSimulated=true');
    assert.ok(result.qualityScore > 80);
    assert.equal(result.impressionIndex, 1);
  });

  // --------------------------------------------------------------------------
  // Test 7: Strict Prohibition of Raw Biometric Payloads
  // --------------------------------------------------------------------------
  await t.test('7. Raw biometric payloads are strictly rejected with 400 Bad Request', async () => {
    const forbiddenPayloads = [
      { rawImage: 'base64_encoded_face_photo' },
      { fingerprintTemplate: 'raw_iso_minutiae_bytes' },
      { rawBytes: '0x1234567890abcdef' },
      { minutiae: [12, 45, 78] },
      { embedding: [0.123, 0.456, 0.789] },
    ];

    for (const badPayload of forbiddenPayloads) {
      // Test PATCH /api/admin/voters/:id/biometrics
      const bioRes = await fetch(`${baseUrl}/api/admin/voters/${testVoterId}/biometrics`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vroToken}`,
        },
        body: JSON.stringify({
          modality: 'FACE',
          status: 'PENDING',
          ...badPayload,
        }),
      });
      assert.equal(bioRes.status, 400, `Raw biometric payload ${Object.keys(badPayload)[0]} must be rejected with 400`);
      const bioData = await bioRes.json();
      assert.equal(bioData.success, false);
      assert.ok(bioData.message.includes('strictly prohibited'));

      // Test general voter registration endpoint POST /api/admin/voters
      const voterRes = await fetch(`${baseUrl}/api/admin/voters`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${vroToken}`,
        },
        body: JSON.stringify({
          fullName: 'Test Elector',
          dateOfBirth: '1995-05-15',
          gender: 'M',
          constituencyId: 'CONST-04-ND',
          ...badPayload,
        }),
      });
      assert.equal(voterRes.status, 400, `Voter registration with ${Object.keys(badPayload)[0]} must be rejected with 400`);
    }
  });

  // --------------------------------------------------------------------------
  // Test 8: No UI Interaction Alone Marks Biometric Status as ENROLLED
  // --------------------------------------------------------------------------
  await t.test('8. Submitting ENROLLED status is rejected with 400; only PENDING metadata can be saved', async () => {
    // 1. Attempt to falsely claim ENROLLED
    const fakeEnrollRes = await fetch(`${baseUrl}/api/admin/voters/${testVoterId}/biometrics`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        modality: 'FACE',
        status: 'ENROLLED',
      }),
    });
    assert.equal(fakeEnrollRes.status, 400, 'Direct transition to ENROLLED must be rejected with 400');
    const fakeData = await fakeEnrollRes.json();
    assert.equal(fakeData.success, false);
    assert.ok(fakeData.message.includes('Status cannot be set to ENROLLED in Phase 05'));

    // 2. Attempt to claim MANUALLY_APPROVED (reserved for Phase 06)
    const fakeApproveRes = await fetch(`${baseUrl}/api/admin/voters/${testVoterId}/biometrics`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        modality: 'FINGERPRINT',
        status: 'MANUALLY_APPROVED',
      }),
    });
    assert.equal(fakeApproveRes.status, 400, 'Direct transition to MANUALLY_APPROVED must be rejected with 400');
    const approveData = await fakeApproveRes.json();
    assert.ok(approveData.message.includes('Phase 06'));

    // 3. Legitimate Phase 05 update: Transition metadata to PENDING
    const validPendingRes = await fetch(`${baseUrl}/api/admin/voters/${testVoterId}/biometrics`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        modality: 'FACE',
        status: 'PENDING',
        qualityCheckStatus: 'PASSED',
        deviceType: 'BROWSER_WEBCAM',
        deviceProvider: 'HTML5_MEDIA_DEVICES',
      }),
    });
    assert.equal(validPendingRes.status, 200, 'Legitimate transition to PENDING must succeed');
    const pendingData = await validPendingRes.json();
    assert.equal(pendingData.success, true);
    assert.equal(pendingData.biometrics.status, 'PENDING');
    assert.equal(pendingData.biometrics.qualityCheckStatus, 'PASSED');
  });

  // --------------------------------------------------------------------------
  // Test 9: RBAC and Constituency Scope Enforcement
  // --------------------------------------------------------------------------
  await t.test('9. Unauthorized officers and out-of-scope voters are rejected with 403 Forbidden', async () => {
    // 1. Election Officer lacks BIOMETRIC_ENROLLMENT_START permission
    const eoDeniedRes = await fetch(`${baseUrl}/api/admin/voters/${testVoterId}/biometrics`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        modality: 'FACE',
        status: 'PENDING',
      }),
    });
    assert.equal(eoDeniedRes.status, 403, 'Election Officer must be denied access to biometric updates (403)');
    const eoData = await eoDeniedRes.json();
    assert.equal(eoData.success, false);

    // 2. VRO attempting to access out-of-scope voter (CONST-77-VAR vs assigned CONST-04-ND)
    const scopeDeniedRes = await fetch(`${baseUrl}/api/admin/voters/${testVoterOutOfScopeId}/biometrics`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        modality: 'FINGERPRINT',
        status: 'PENDING',
      }),
    });
    assert.equal(scopeDeniedRes.status, 403, 'VRO must be denied access to out-of-scope voter biometrics (403)');
    const scopeData = await scopeDeniedRes.json();
    assert.equal(scopeData.success, false);
    assert.ok(scopeData.message.includes('outside officer\'s authorized assignment scope'));

    // 3. Platform Admin possesses system-wide access
    const adminAllowedRes = await fetch(`${baseUrl}/api/admin/voters/${testVoterOutOfScopeId}/biometrics`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        modality: 'FINGERPRINT',
        status: 'PENDING',
        deviceType: 'SIMULATED_TESTBED',
      }),
    });
    assert.equal(adminAllowedRes.status, 200, 'Platform Administrator must have system-wide permission');
  });

  // --------------------------------------------------------------------------
  // Test 10: Face and Fingerprint States Remain Strictly Independent
  // --------------------------------------------------------------------------
  await t.test('10. Face and Fingerprint enrollment metadata states remain independent', async () => {
    // Update Fingerprint to DEVICE_UNAVAILABLE
    const fpUpdateRes = await fetch(`${baseUrl}/api/admin/voters/${testVoterId}/biometrics`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        modality: 'FINGERPRINT',
        status: 'DEVICE_UNAVAILABLE',
      }),
    });
    assert.equal(fpUpdateRes.status, 200);

    // Verify Face status is STILL 'PENDING' while Fingerprint is 'DEVICE_UNAVAILABLE'
    const bioRes = await fetch(`${baseUrl}/api/admin/voters/${testVoterId}/biometrics`, {
      headers: {
        Authorization: `Bearer ${vroToken}`,
      },
    });
    assert.equal(bioRes.status, 200);
    const data = await bioRes.json();
    assert.equal(data.face.status, 'PENDING', 'Face status must remain PENDING');
    assert.equal(data.fingerprint.status, 'DEVICE_UNAVAILABLE', 'Fingerprint status must be DEVICE_UNAVAILABLE');
  });
});
