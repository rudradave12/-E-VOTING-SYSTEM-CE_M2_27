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
import { normalizePhoneNumber } from '../backend/server/utils/phoneNormalization';
import { getDataRepositories } from '../backend/server/repositories';

test('BlockBallot — Voter Registration Cancellation, Phone Normalization & Duplicate Prevention Suite', async (t) => {
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

  async function loginAsVRO() {
    const vroPass = getLocalConfigValue('OFFICER_VRO_PASSWORD') || 'VroOfficer@2024!';
    const res = await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'VRO-SIM-001',
        password: vroPass,
      }),
    });
    const data = await res.json();
    assert.equal(res.status, 200, `Login failed: ${data.message}`);
    assert.ok(data.token || data.sessionToken);
    return (data.token || data.sessionToken) as string;
  }

  // --------------------------------------------------------------------------
  // Test 1: Phone Number Normalization Engine Unit Validation
  // --------------------------------------------------------------------------
  await t.test('1. Phone number normalization resolves variations to canonical E.164 and validates syntax', async () => {
    const variations = [
      '+91 98765 43210',
      '+91-98765-43210',
      '+91 (98765) 43210',
      '09876543210',
      '919876543210',
      '9876543210',
      '98765-43210',
    ];

    for (const raw of variations) {
      const res = normalizePhoneNumber(raw);
      assert.equal(res.isValid, true, `Expected valid for ${raw}`);
      assert.equal(res.normalized, '+919876543210', `Expected canonical +919876543210 for ${raw}`);
      assert.equal(res.displayMasked, '+91 ••••• •3210');
    }

    // Different phone numbers do not collide
    const diffRes = normalizePhoneNumber('9876543211');
    assert.equal(diffRes.normalized, '+919876543211');
    assert.notEqual(diffRes.normalized, '+919876543210');

    // Invalid phone syntax rejected
    assert.equal(normalizePhoneNumber('1234567890').isValid, false); // Does not start with 6-9
    assert.equal(normalizePhoneNumber('98765').isValid, false); // Too short
    assert.equal(normalizePhoneNumber('abc9876543210').isValid, false); // Non-digit
    assert.equal(normalizePhoneNumber('').isValid, false); // Empty
  });

  // --------------------------------------------------------------------------
  // Test 2: Cancel at Fingerprint Stage & Retry with Same Phone
  // --------------------------------------------------------------------------
  await t.test('2. Start registration, cancel at fingerprint stage, and allow retry with same phone', async () => {
    clearStaffCredentialsForTesting();
    const vroToken = await loginAsVRO();
    const testPhone = '9811122334';

    // 1. Initiate draft registration
    const initRes1 = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Rohit Sharma',
        dateOfBirth: '1987-04-30',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
        maskedMobile: testPhone,
      }),
    });
    assert.equal(initRes1.status, 201);
    const { pendingId } = await initRes1.json();
    assert.ok(pendingId);

    // 2. Operator reaches fingerprint stage and clicks Cancel
    const cancelRes = await fetch(`${baseUrl}/api/admin/voters/cancel-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId,
        reason: 'Operator cancelled manual fingerprint verification',
      }),
    });
    assert.equal(cancelRes.status, 200);
    const cancelData = await cancelRes.json();
    assert.equal(cancelData.success, true);
    assert.equal(cancelData.status, 'CANCELLED');

    // 3. Retry registration immediately with the exact same phone number
    const retryRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Rohit Sharma',
        dateOfBirth: '1987-04-30',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
        maskedMobile: testPhone,
      }),
    });

    assert.equal(
      retryRes.status,
      201,
      'Retry after cancellation MUST be allowed without false DUPLICATE_REGISTRATION'
    );
    const retryData = await retryRes.json();
    assert.ok(retryData.pendingId);
    assert.notEqual(retryData.pendingId, pendingId, 'New attempt receives fresh draft ID');
  });

  // --------------------------------------------------------------------------
  // Test 3: Cancel at Photo Stage & Retry with Format Variation
  // --------------------------------------------------------------------------
  await t.test('3. Start registration, advance to photo stage, cancel, and allow retry with format variation', async () => {
    clearStaffCredentialsForTesting();
    const vroToken = await loginAsVRO();
    const phoneVariation1 = '+91 98222 33445';
    const phoneVariation2 = '98222-33445';

    // 1. Initiate draft
    const initRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Sunita Mehra',
        dateOfBirth: '1992-08-15',
        gender: 'F',
        constituencyId: 'CONST-04-ND',
        maskedMobile: phoneVariation1,
      }),
    });
    assert.equal(initRes.status, 201);
    const { pendingId } = await initRes.json();

    // 2. Complete fingerprint check
    const fpRes = await fetch(`${baseUrl}/api/admin/voters/verify-fingerprint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId,
        officerConfirmation: true,
        result: 'VERIFIED',
      }),
    });
    assert.equal(fpRes.status, 200);

    // 3. Operator cancels at Photo stage
    const cancelRes = await fetch(`${baseUrl}/api/admin/voters/cancel-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId,
        reason: 'Poor lighting, operator cancelled photo stage',
      }),
    });
    assert.equal(cancelRes.status, 200);

    // 4. Retry registration with different formatting variation of the same number
    const retryRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Sunita Mehra',
        dateOfBirth: '1992-08-15',
        gender: 'F',
        constituencyId: 'CONST-04-ND',
        maskedMobile: phoneVariation2,
      }),
    });
    assert.equal(retryRes.status, 201);
  });

  // --------------------------------------------------------------------------
  // Test 4: Idempotency of Cancellation (Cancelling Twice)
  // --------------------------------------------------------------------------
  await t.test('4. Cancellation is idempotent: calling cancel multiple times returns 200 cleanly', async () => {
    clearStaffCredentialsForTesting();
    const vroToken = await loginAsVRO();

    const initRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Idempotency Check',
        dateOfBirth: '1995-10-10',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
        maskedMobile: '9833344556',
      }),
    });
    const { pendingId } = await initRes.json();

    // Cancel 1
    const cancel1 = await fetch(`${baseUrl}/api/admin/voters/cancel-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });
    assert.equal(cancel1.status, 200);

    // Cancel 2 (duplicate/retry after timeout)
    const cancel2 = await fetch(`${baseUrl}/api/admin/voters/cancel-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });
    assert.equal(cancel2.status, 200);
    const data2 = await cancel2.json();
    assert.equal(data2.status, 'CANCELLED');
  });

  // --------------------------------------------------------------------------
  // Test 5: Cancelled Draft Cannot Advance or Issue Voter ID
  // --------------------------------------------------------------------------
  await t.test('5. Cancelled draft fails closed: cannot verify fingerprint, verify photo or finalize voter ID', async () => {
    clearStaffCredentialsForTesting();
    const vroToken = await loginAsVRO();

    const initRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Cancelled Action Guard',
        dateOfBirth: '1990-01-01',
        gender: 'O',
        constituencyId: 'CONST-04-ND',
        maskedMobile: '9844455667',
      }),
    });
    const { pendingId } = await initRes.json();

    // Cancel the draft
    await fetch(`${baseUrl}/api/admin/voters/cancel-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });

    // 1. Attempt fingerprint on cancelled draft -> must fail
    const fpRes = await fetch(`${baseUrl}/api/admin/voters/verify-fingerprint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId,
        officerConfirmation: true,
        result: 'VERIFIED',
      }),
    });
    assert.equal(fpRes.status, 400);

    // 2. Attempt photo verification on cancelled draft -> must fail
    const photoRes = await fetch(`${baseUrl}/api/admin/voters/verify-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        pendingId,
        decision: 'APPROVED',
      }),
    });
    assert.equal(photoRes.status, 400);

    // 3. Attempt finalization on cancelled draft -> must fail
    const finalRes = await fetch(`${baseUrl}/api/admin/voters/finalize-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });
    assert.equal(finalRes.status, 400);

    // 4. Cancelled draft cannot vote
    const voteRes = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: pendingId }),
    });
    assert.ok(voteRes.status === 400 || voteRes.status === 404);
  });

  // --------------------------------------------------------------------------
  // Test 6: Concurrent Duplicate Registration Protection
  // --------------------------------------------------------------------------
  await t.test('6. Concurrent active registration for same identity is rejected as DUPLICATE_REGISTRATION', async () => {
    clearStaffCredentialsForTesting();
    const vroToken = await loginAsVRO();
    const commonIdentity = {
      fullName: 'Concurrent Candidate Elector',
      dateOfBirth: '1985-06-20',
      gender: 'M',
      constituencyId: 'CONST-04-ND',
      maskedMobile: '9855566778',
    };

    // First draft in-progress
    const firstRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify(commonIdentity),
    });
    assert.equal(firstRes.status, 201);

    // Competing concurrent attempt for same identity while first is pending
    const compRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify(commonIdentity),
    });
    assert.equal(compRes.status, 409);
    const compData = await compRes.json();
    assert.equal(compData.code, 'DUPLICATE_REGISTRATION');
  });

  // --------------------------------------------------------------------------
  // Test 7: Active Verified Voter Duplicate Enforcement
  // --------------------------------------------------------------------------
  await t.test('7. Cannot register an identity that already belongs to an active registered elector', async () => {
    clearStaffCredentialsForTesting();
    const vroToken = await loginAsVRO();
    const registeredPhone = '+91 98666 77889';

    // 1. Complete a full 3-stage registration
    const initRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Vikramaditya Bose',
        dateOfBirth: '1975-12-05',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
        maskedMobile: registeredPhone,
      }),
    });
    const { pendingId } = await initRes.json();

    await fetch(`${baseUrl}/api/admin/voters/verify-fingerprint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId, officerConfirmation: true, result: 'VERIFIED' }),
    });

    await fetch(`${baseUrl}/api/admin/voters/verify-photo`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId, decision: 'APPROVED' }),
    });

    const finalRes = await fetch(`${baseUrl}/api/admin/voters/finalize-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });
    assert.equal(finalRes.status, 201);

    // 2. Cannot cancel an already finalized registration
    const cancelFinal = await fetch(`${baseUrl}/api/admin/voters/cancel-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ pendingId }),
    });
    assert.equal(cancelFinal.status, 409);

    // 3. New attempt with same identity must be rejected as DUPLICATE_REGISTRATION
    const dupRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Vikramaditya Bose',
        dateOfBirth: '1975-12-05',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
        maskedMobile: '98666-77889',
      }),
    });
    assert.equal(dupRes.status, 409);
    const dupData = await dupRes.json();
    assert.equal(dupData.code, 'DUPLICATE_REGISTRATION');
  });

  // --------------------------------------------------------------------------
  // Test 8: RESTful DELETE /api/admin/voters/pending/:pendingId Alias
  // --------------------------------------------------------------------------
  await t.test('8. DELETE /api/admin/voters/pending/:pendingId cleanly cancels draft and releases reservation', async () => {
    clearStaffCredentialsForTesting();
    const vroToken = await loginAsVRO();
    const testPhone = '9877788990';

    const initRes = await fetch(`${baseUrl}/api/admin/voters/initiate-registration`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Delete Alias Elector',
        dateOfBirth: '1999-03-21',
        gender: 'F',
        constituencyId: 'CONST-04-ND',
        maskedMobile: testPhone,
      }),
    });
    const { pendingId } = await initRes.json();

    const delRes = await fetch(`${baseUrl}/api/admin/voters/pending/${pendingId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    assert.equal(delRes.status, 200);
    const delData = await delRes.json();
    assert.equal(delData.status, 'CANCELLED');

    // Query status must show CANCELLED
    const getRes = await fetch(`${baseUrl}/api/admin/voters/pending/${pendingId}`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.pendingRegistration.status, 'CANCELLED');
  });
});
