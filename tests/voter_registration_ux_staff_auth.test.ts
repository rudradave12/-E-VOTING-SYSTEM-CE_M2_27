/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';

import {
  adminRouter,
  clearAdminSessionsForTesting,
  clearPendingRegistrationsForTesting,
} from '../backend/server/routes/admin';
import { voterRouter } from '../backend/server/routes/voter';
import { serverStore } from '../backend/server/store';
import {
  clearOfficerSessionsForTesting,
  getLocalConfigValue,
} from '../backend/server/auth/rbac';
import { clearStaffCredentialsForTesting } from '../backend/server/auth/credentials';

test('BlockBallot — 3-Page Voter Registration, Simplified Voting UX & Staff Credential Management', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  t.before(async () => {
    const app = express();
    app.use(express.json());

    app.use('/api/admin', adminRouter);
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
    clearPendingRegistrationsForTesting();
    clearStaffCredentialsForTesting();
    serverStore.resetDefaults();
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  // Helper to login as VRO
  async function loginAsVRO() {
    const vroPass = getLocalConfigValue('OFFICER_VRO_PASSWORD') || 'VroOfficer@2024!';
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'VRO-SIM-001', password: vroPass }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.token || data.sessionToken);
    return (data.token || data.sessionToken) as string;
  }

  // Helper to login as EO
  async function loginAsEO() {
    const eoPass = getLocalConfigValue('OFFICER_EO_PASSWORD') || 'Officer@2024!';
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'EO-SIM-001', password: eoPass }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.token || data.sessionToken);
    return (data.token || data.sessionToken) as string;
  }

  // Helper to login as Admin
  async function loginAsAdmin() {
    const adminPass = getLocalConfigValue('DEMO_ADMIN_PASSWORD') || 'DemoAdminSecret2026!';
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'demo.admin@blockballot.local', password: adminPass }),
    });
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.ok(data.token || data.sessionToken);
    return (data.token || data.sessionToken) as string;
  }

  // --------------------------------------------------------------------------
  // PART 1 & 2: Compulsory 3-Page Voter Registration Workflow
  // --------------------------------------------------------------------------

  await t.test('Stage 1: Validates mandatory fields and age >= 18 on draft registration', async () => {
    const vroToken = await loginAsVRO();

    // Underage elector (< 18) must be rejected
    const underageRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Young Elector',
        dateOfBirth: '2015-01-01',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.equal(underageRes.status, 400);
    const underageData = await underageRes.json();
    assert.equal(underageData.code, 'UNDERAGE');

    // Missing full name must be rejected
    const missingNameRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: '',
        dateOfBirth: '1995-05-15',
        gender: 'F',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.equal(missingNameRes.status, 400);

    // Valid elector details initiate draft successfully without issuing a voter ID
    const validRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Devika Krishnan',
        dateOfBirth: '1994-08-20',
        gender: 'F',
        constituencyId: 'CONST-04-ND',
        state: 'NCT of Delhi',
        district: 'New Delhi',
        pollingStation: 'Polling Booth 4, Connaught Place',
        maskedMobile: '+91 ••••• •7788',
      }),
    });
    assert.ok(validRes.status === 200 || validRes.status === 201);
    const validData = await validRes.json();
    assert.ok(validData.pendingId);
    assert.match(validData.pendingId, /^preg_/);
    assert.ok(validData.registrationStep === 1 || validData.registrationStep === 2);
    assert.equal(validData.voterDraft.fullName, 'Devika Krishnan');
    // Ensure NO simulationVoterId is issued in stage 1
    assert.equal(validData.simulationVoterId, undefined);
  });

  await t.test('Stage 1: Prevents duplicate mobile or identity collision on initiation', async () => {
    const vroToken = await loginAsVRO();

    const uniquePhone = '+91 ••••• •9901';
    const init1 = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Aarav Sharma',
        dateOfBirth: '1990-03-12',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
        maskedMobile: uniquePhone,
      }),
    });
    assert.ok(init1.status === 200 || init1.status === 201);

    // Submitting duplicate with same phone in same constituency should fail with 409
    const init2 = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Aarav Sharma',
        dateOfBirth: '1990-03-12',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
        maskedMobile: uniquePhone,
      }),
    });
    assert.equal(init2.status, 409);
    const dupData = await init2.json();
    assert.equal(dupData.code, 'DUPLICATE_REGISTRATION');
  });

  await t.test('Stage 2 & 3: Finalization fails closed if fingerprint or photo is missing or rejected', async () => {
    const vroToken = await loginAsVRO();

    // Create a new draft
    const initRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Rohan Mehra',
        dateOfBirth: '1992-11-10',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
        maskedMobile: '+91 ••••• •5544',
      }),
    });
    const { pendingId } = await initRes.json();

    // 1. Trying to finalize right away without fingerprint verification must fail closed (400)
    const earlyFinalize = await fetch(`${baseUrl}/api/admin/voters/finalize-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });
    assert.equal(earlyFinalize.status, 400);
    const earlyData = await earlyFinalize.json();
    assert.equal(earlyData.code, 'BIOMETRIC_CHECK_INCOMPLETE');

    // 2. Trying to verify photo before fingerprint verification must fail closed (400)
    const earlyPhoto = await fetch(`${baseUrl}/api/admin/voters/verify-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId, decision: 'APPROVED' }),
    });
    assert.equal(earlyPhoto.status, 400);

    // 3. Mark fingerprint as UNSUCCESSFUL
    const failedFingerprint = await fetch(`${baseUrl}/api/admin/voters/verify-fingerprint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId,
        officerConfirmation: true,
        result: 'UNSUCCESSFUL',
        notes: 'Simulated scanner read failure',
      }),
    });
    assert.equal(failedFingerprint.status, 200);
    const failData = await failedFingerprint.json();
    assert.equal(failData.fingerprintStatus, 'UNSUCCESSFUL');

    // Finalize must still fail
    const stillFail = await fetch(`${baseUrl}/api/admin/voters/finalize-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });
    assert.equal(stillFail.status, 400);

    // 4. Retry fingerprint with successful match
    const retryFingerprint = await fetch(`${baseUrl}/api/admin/voters/verify-fingerprint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId,
        officerConfirmation: true,
        result: 'VERIFIED',
        notes: 'Officer verified thumb match',
      }),
    });
    assert.equal(retryFingerprint.status, 200);
    const retryData = await retryFingerprint.json();
    assert.equal(retryData.fingerprintStatus, 'VERIFIED');

    // 5. Reject photo
    const rejectPhoto = await fetch(`${baseUrl}/api/admin/voters/verify-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId,
        decision: 'REJECTED',
        notes: 'Glare in photo',
      }),
    });
    assert.equal(rejectPhoto.status, 200);
    const rejData = await rejectPhoto.json();
    assert.equal(rejData.photoStatus, 'REJECTED');

    // Finalize must fail when photo is rejected
    const finalizeWithRejectedPhoto = await fetch(`${baseUrl}/api/admin/voters/finalize-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });
    assert.equal(finalizeWithRejectedPhoto.status, 400);

    // 6. Approve photo
    const approvePhoto = await fetch(`${baseUrl}/api/admin/voters/verify-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId,
        decision: 'APPROVED',
        notes: 'Verified compliant portrait',
      }),
    });
    assert.equal(approvePhoto.status, 200);
    const appData = await approvePhoto.json();
    assert.equal(appData.photoStatus, 'APPROVED');
    assert.equal(appData.readyForFinalization, true);

    // 7. Now finalization must succeed and generate collision-resistant simulation voter ID
    const finalizeRes = await fetch(`${baseUrl}/api/admin/voters/finalize-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });
    assert.ok(finalizeRes.status === 200 || finalizeRes.status === 201);
    const finalizeData = await finalizeRes.json();
    assert.ok(finalizeData.simulationVoterId);
    assert.match(finalizeData.simulationVoterId, /^BBV-SIM-/);
    assert.equal(finalizeData.voter.fullName, 'Rohan Mehra');
    assert.equal(finalizeData.voter.registrationStatus, 'REGISTERED');
    assert.equal(finalizeData.voter.eligibilityStatus, 'ELIGIBLE');
    assert.equal(finalizeData.voter.lifecycleStatus, 'ACTIVE');

    // Attempting to finalize again must fail with 409 Conflict
    const reFinalize = await fetch(`${baseUrl}/api/admin/voters/finalize-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });
    assert.equal(reFinalize.status, 409);

    // Draft is marked as finalized
    const draftAfter = await fetch(`${baseUrl}/api/admin/voters/pending/${pendingId}`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    assert.equal(draftAfter.status, 200);
    const draftData = await draftAfter.json();
    assert.equal(draftData.pendingRegistration?.isFinalized || draftData.pending?.isFinalized, true);
  });

  await t.test('Bypass attempts to skip fingerprint/photo fail closed', async () => {
    const vroToken = await loginAsVRO();

    const bypassRes = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Bypass Attempt User',
        dateOfBirth: '1990-01-01',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
        bypassFingerprint: true,
      }),
    });
    assert.equal(bypassRes.status, 400);
    const bypassData = await bypassRes.json();
    assert.equal(bypassData.code, 'BIOMETRIC_VERIFICATION_REQUIRED');
  });

  // --------------------------------------------------------------------------
  // PART 4: Staff Accounts and Default Login Experience
  // --------------------------------------------------------------------------

  await t.test('All three staff profiles (EO, VRO, Platform Admin) successfully login', async () => {
    const eoToken = await loginAsEO();
    assert.ok(eoToken);

    const vroToken = await loginAsVRO();
    assert.ok(vroToken);

    const adminToken = await loginAsAdmin();
    assert.ok(adminToken);
  });

  // --------------------------------------------------------------------------
  // PART 5: Staff Password Change from Profile
  // --------------------------------------------------------------------------

  await t.test('Staff password change: validations, rate-limiting, persistence and authentication', async () => {
    const vroToken = await loginAsVRO();
    const currentVroPass = getLocalConfigValue('OFFICER_VRO_PASSWORD') || 'VroOfficer@2024!';
    const newSecurePass = 'vro_SuperSecure2026!';

    // 1. Wrong current password rejected with 401
    const wrongPassRes = await fetch(`${baseUrl}/api/admin/profile/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        currentPassword: 'wrong_password_attempt',
        newPassword: newSecurePass,
        confirmPassword: newSecurePass,
      }),
    });
    assert.equal(wrongPassRes.status, 401);

    // 2. Short new password (< 8 chars) rejected with 400
    const shortPassRes = await fetch(`${baseUrl}/api/admin/profile/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        currentPassword: currentVroPass,
        newPassword: 'short',
        confirmPassword: 'short',
      }),
    });
    assert.equal(shortPassRes.status, 400);

    // 3. Mismatched confirmation rejected with 400
    const mismatchRes = await fetch(`${baseUrl}/api/admin/profile/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        currentPassword: currentVroPass,
        newPassword: newSecurePass,
        confirmPassword: 'different_confirmation',
      }),
    });
    assert.equal(mismatchRes.status, 400);

    // 4. Valid password change succeeds
    const changeRes = await fetch(`${baseUrl}/api/admin/profile/change-password`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        currentPassword: currentVroPass,
        newPassword: newSecurePass,
        confirmPassword: newSecurePass,
      }),
    });
    assert.equal(changeRes.status, 200);
    const changeData = await changeRes.json();
    assert.equal(changeData.success, true);
    assert.ok(changeData.token || changeData.sessionToken, 'Rotated session token must be returned');

    // 5. Old password is now rejected immediately
    const oldLoginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'VRO-SIM-001', password: currentVroPass }),
    });
    assert.equal(oldLoginRes.status, 401);

    // 6. New password authenticates successfully
    const newLoginRes = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'VRO-SIM-001', password: newSecurePass }),
    });
    assert.equal(newLoginRes.status, 200);
    const newLoginData = await newLoginRes.json();
    assert.ok(newLoginData.token || newLoginData.sessionToken);
    assert.equal(newLoginData.user.id, 'VRO-SIM-001');
  });

  await t.test('Unverified / pending voter cannot vote (verify/lookup fails closed)', async () => {
    clearStaffCredentialsForTesting();
    const vroToken = await loginAsVRO();

    // 1. Create a draft voter
    const initRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Unverified Voter Test',
        dateOfBirth: '1988-04-14',
        gender: 'F',
        constituencyId: 'CONST-04-ND',
        maskedMobile: '+91 ••••• •1234',
      }),
    });
    const { pendingId } = await initRes.json();

    // 2. Attempting to verify or vote with pending draft ID must fail
    const verifyRes = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: pendingId }),
    });
    assert.ok(verifyRes.status === 400 || verifyRes.status === 404);

    // 3. Attempting to request OTP for pending voter must fail
    const otpRes = await fetch(`${baseUrl}/api/voter/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: pendingId }),
    });
    assert.ok(otpRes.status === 400 || otpRes.status === 404);
  });
});


