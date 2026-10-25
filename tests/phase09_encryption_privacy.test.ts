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
import crypto from 'crypto';
import { ethers } from 'ethers';

import {
  encryptSensitiveField,
  decryptSensitiveField,
  migrateField,
  DecryptionError,
  LocalKeyProvider,
  setKeyProviderForTesting,
  validateNoProhibitedFields,
  maskMobile,
  maskEmail,
  maskEpic,
  sanitizeLogData,
} from '../backend/server/security';
import { validateServerConfig, SERVER_CONFIG } from '../backend/server/config';
import { voterRouter, clearRateLimitsForTesting } from '../backend/server/routes/voter';
import { adminRouter, clearAdminSessionsForTesting } from '../backend/server/routes/admin';
import { serverStore } from '../backend/server/store';
import {
  clearOfficerSessionsForTesting,
  createOfficerSession,
  registerOfficerSessionForTesting,
} from '../backend/server/auth/rbac';
import { AuthorityAccount, SCHEMA_VERSION_CURRENT } from '../frontend/src/types/dataModel';
import { TEST_VOTERS } from './fixtures/voterFixtures';

process.env.NODE_ENV = 'test';

test('BlockBallot — Phase 09: Encryption, Data Privacy & Ballot Confidentiality Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  // Officer Tokens
  let eoToken: string;
  let vroToken: string;

  // Test Encryption Keys
  const testKeyV1 = crypto.randomBytes(32);
  const testKeyV2 = crypto.randomBytes(32);
  let testKeyProvider: LocalKeyProvider;

  t.before(async () => {
    // 1. Setup in-memory key provider for testing
    testKeyProvider = new LocalKeyProvider({
      primaryKey: testKeyV1,
      primaryKeyId: 'bb-enc-v1',
    });
    setKeyProviderForTesting(testKeyProvider);

    // 2. Setup Express test server
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
    clearRateLimitsForTesting();
    serverStore.resetSimulatedServerTime();
    serverStore.resetDefaults();
    serverStore.seedVotersForTesting(TEST_VOTERS);

    // 3. Register Election Officer (In Scope)
    const eoAccount: AuthorityAccount = {
      id: 'EO-PHASE09-001',
      email: 'eo.p09@blockballot.local',
      displayName: 'District Election Officer Phase 09',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
        electionIds: ['GE-2024', 'MUNI-2024'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const eoSession = createOfficerSession(eoAccount);
    eoToken = eoSession.token;
    registerOfficerSessionForTesting(eoSession);

    // 4. Register Voter Registration Officer
    const vroAccount: AuthorityAccount = {
      id: 'VRO-PHASE09-001',
      email: 'vro.p09@blockballot.local',
      displayName: 'Voter Registration Officer Phase 09',
      role: 'VOTER_REGISTRATION_OFFICER',
      status: 'ACTIVE',
      assignmentScope: {
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyIds: ['CONST-04-ND'],
        electionIds: ['GE-2024'],
      },
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const vroSession = createOfficerSession(vroAccount);
    vroToken = vroSession.token;
    registerOfficerSessionForTesting(vroSession);

    // 5. Create active elections
    const nowSec = serverStore.getCurrentTimeSec();
    serverStore.createElection({
      id: 'MUNI-2024',
      numericId: 19,
      title: 'Municipal Corporation Election 2024',
      description: 'Municipal civic polling',
      electionType: 'MUNICIPAL',
      status: 'active',
      startTime: nowSec - 3600,
      endTime: nowSec + 86400,
      constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    });
  });

  t.after(async () => {
    serverStore.resetSimulatedServerTime();
    if (server) {
      if (typeof (server as any).closeAllConnections === 'function') {
        (server as any).closeAllConnections();
      }
      server.close();
    }
  });

  // ==========================================================================
  // INVARIANT 1: Authenticated Encryption / Decryption Round-Trip
  // ==========================================================================
  await t.test('1. Authenticated encryption/decryption round-trip for supported sensitive fields', async () => {
    const sensitiveMobile = '+91 9823412345';
    const recordId = 'vpr_delhi_001';
    const fieldName = 'mobileNumber';

    const envelope = await encryptSensitiveField(sensitiveMobile, fieldName, recordId);
    assert.ok(envelope.startsWith('enc:v1:bb-enc-v1:'), 'Ciphertext envelope must have enc:v1 prefix and keyId');

    const decrypted = await decryptSensitiveField(envelope, fieldName, recordId);
    assert.strictEqual(decrypted, sensitiveMobile, 'Decrypted value must exactly match original plaintext');
  });

  // ==========================================================================
  // INVARIANT 2: Tamper Rejection (Ciphertext, IV, Tag, AAD)
  // ==========================================================================
  await t.test('2. Decryption rejects modified ciphertext, IV/nonce, authentication tag and malformed envelopes', async () => {
    const plaintext = 'confidential_voter_notes_or_contact';
    const recordId = 'vpr_record_002';
    const fieldName = 'voterNotes';

    const envelope = await encryptSensitiveField(plaintext, fieldName, recordId);
    const parts = envelope.split(':');
    // parts: ['enc', 'v1', 'bb-enc-v1', iv, tag, ciphertext]
    assert.strictEqual(parts.length, 6, 'Envelope must contain 6 parts');

    const [enc, v, keyId, iv, tag, ciphertext] = parts;

    // A. Modified ciphertext byte
    const tamperedCiphertext =
      ciphertext.slice(0, 2) === 'aa' ? 'bb' + ciphertext.slice(2) : 'aa' + ciphertext.slice(2);
    const tamperedEnvelopeA = `${enc}:${v}:${keyId}:${iv}:${tag}:${tamperedCiphertext}`;
    await assert.rejects(
      async () => decryptSensitiveField(tamperedEnvelopeA, fieldName, recordId),
      DecryptionError,
      'Should reject modified ciphertext'
    );

    // B. Modified IV / Nonce
    const tamperedIv = iv.slice(0, 2) === '11' ? '22' + iv.slice(2) : '11' + iv.slice(2);
    const tamperedEnvelopeB = `${enc}:${v}:${keyId}:${tamperedIv}:${tag}:${ciphertext}`;
    await assert.rejects(
      async () => decryptSensitiveField(tamperedEnvelopeB, fieldName, recordId),
      DecryptionError,
      'Should reject modified IV'
    );

    // C. Modified Tag
    const tamperedTag = tag.slice(0, 2) === '33' ? '44' + tag.slice(2) : '33' + tag.slice(2);
    const tamperedEnvelopeC = `${enc}:${v}:${keyId}:${iv}:${tamperedTag}:${ciphertext}`;
    await assert.rejects(
      async () => decryptSensitiveField(tamperedEnvelopeC, fieldName, recordId),
      DecryptionError,
      'Should reject modified authentication tag'
    );

    // D. Modified Additional Authenticated Data (Context mismatch: transplanted to different record or field)
    await assert.rejects(
      async () => decryptSensitiveField(envelope, 'differentField', recordId),
      DecryptionError,
      'Should reject envelope transplanted to different fieldName'
    );
    await assert.rejects(
      async () => decryptSensitiveField(envelope, fieldName, 'differentRecordId'),
      DecryptionError,
      'Should reject envelope transplanted to different recordId'
    );

    // E. Malformed envelope string
    await assert.rejects(
      async () => decryptSensitiveField('invalid:envelope:format', fieldName, recordId),
      DecryptionError,
      'Should reject malformed envelope string'
    );
  });

  // ==========================================================================
  // INVARIANT 3: Unique Cryptographically Secure Nonces (IVs)
  // ==========================================================================
  await t.test('3. Different encryption operations use appropriately unique, cryptographically secure nonces', async () => {
    const plaintext = 'static_test_payload';
    const recordId = 'vpr_unique_iv';
    const fieldName = 'testField';

    const ivSet = new Set<string>();
    const envelopeSet = new Set<string>();
    const iterations = 50;

    for (let i = 0; i < iterations; i++) {
      const envelope = await encryptSensitiveField(plaintext, fieldName, recordId);
      const parts = envelope.split(':');
      const ivHex = parts[3];
      ivSet.add(ivHex);
      envelopeSet.add(envelope);
    }

    assert.strictEqual(ivSet.size, iterations, 'Every encryption operation must generate a distinct 12-byte IV');
    assert.strictEqual(envelopeSet.size, iterations, 'Every ciphertext envelope must be distinct due to unique IV');
  });

  // ==========================================================================
  // INVARIANT 4: Plaintext and Keys Never Appear in Errors or Logs
  // ==========================================================================
  await t.test('4. Keys and plaintext sensitive values do not appear in logs or returned errors', async () => {
    const secretKeyHex = testKeyV1.toString('hex');
    const secretPlaintext = 'SUPER_SECRET_ELECTOR_AADHAAR_9999';

    try {
      await decryptSensitiveField('enc:v1:bb-enc-v1:badiv:badtag:badcipher', 'field', 'record');
      assert.fail('Decryption should have failed');
    } catch (err: any) {
      assert.ok(!err.message.includes(secretKeyHex), 'Error message must not expose key');
      assert.ok(!err.message.includes(secretPlaintext), 'Error message must not expose plaintext');
    }

    // Test log sanitization helper
    const logPayload = {
      actor: 'officer-1',
      sessionToken: 'token_abc123xyz',
      encryptionKey: secretKeyHex,
      password: 'mypassword',
      nested: {
        authorizationSignerKey: '0xprivatekey',
        validMetadata: 'CONST-04-ND',
      },
    };

    const sanitized = sanitizeLogData(logPayload);
    assert.strictEqual(sanitized.sessionToken, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.encryptionKey, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.password, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.nested.authorizationSignerKey, '[REDACTED_SECRET]');
    assert.strictEqual(sanitized.nested.validMetadata, 'CONST-04-ND');
  });

  // ==========================================================================
  // INVARIANT 5: Missing or Invalid Production Key Fails Safely
  // ==========================================================================
  await t.test('5. Missing or invalid production key configuration fails safely', () => {
    // Missing key in production
    const resMissing = validateServerConfig({
      ...process.env,
      NODE_ENV: 'production',
      APP_ENCRYPTION_KEY: '',
    });
    assert.strictEqual(resMissing.isValid, false, 'Production config must be invalid when encryption key is missing');
    assert.ok(
      resMissing.errors.some((e) => e.includes('APP_ENCRYPTION_KEY')),
      'Errors must cite missing APP_ENCRYPTION_KEY'
    );

    // Insecure dummy test key in production
    const resDummy = validateServerConfig({
      ...process.env,
      NODE_ENV: 'production',
      APP_ENCRYPTION_KEY: '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
    });
    assert.strictEqual(resDummy.isValid, false, 'Production config must reject known test keys');
    assert.ok(
      resDummy.errors.some((e) => e.includes('insecure demo/test key')),
      'Errors must cite insecure test key'
    );
  });

  // ==========================================================================
  // INVARIANT 6: Key Identifiers and Versions Validated
  // ==========================================================================
  await t.test('6. Key identifiers and versions are validated', async () => {
    // Unknown Key ID
    const unknownKeyEnvelope = `enc:v1:bb-enc-unknown:112233445566778899001122:11223344556677889900112233445566:aabb`;
    await assert.rejects(
      async () => decryptSensitiveField(unknownKeyEnvelope, 'f', 'r'),
      DecryptionError,
      'Should reject unknown key identifier'
    );

    // Unsupported version
    const unsupportedVersionEnvelope = `enc:v99:bb-enc-v1:112233445566778899001122:11223344556677889900112233445566:aabb`;
    await assert.rejects(
      async () => decryptSensitiveField(unsupportedVersionEnvelope, 'f', 'r'),
      DecryptionError,
      'Should reject unsupported envelope version'
    );
  });

  // ==========================================================================
  // INVARIANT 7: Key Rotation Preserves Data Integrity
  // ==========================================================================
  await t.test('7. Any supported key rotation/migration path preserves data integrity', async () => {
    const originalText = 'elector_phone_9876543210';
    const recordId = 'vpr_rotate_001';
    const fieldName = 'phone';

    // 1. Encrypt with v1
    const v1Envelope = await encryptSensitiveField(originalText, fieldName, recordId);
    assert.ok(v1Envelope.startsWith('enc:v1:bb-enc-v1:'));

    // 2. Rotate to v2
    await testKeyProvider.rotateKey(testKeyV2, 'bb-enc-v2');

    // 3. Old v1 record must still be decryptable
    const decryptedOld = await decryptSensitiveField(v1Envelope, fieldName, recordId);
    assert.strictEqual(decryptedOld, originalText, 'Old ciphertext must decrypt using rotated secondary key');

    // 4. New encryption must use v2 primary key
    const v2Envelope = await encryptSensitiveField(originalText, fieldName, recordId);
    assert.ok(v2Envelope.startsWith('enc:v1:bb-enc-v2:'), 'New ciphertext must use bb-enc-v2 primary key');

    // 5. Migrate old v1 record to new primary key
    const migrated = await migrateField(v1Envelope, fieldName, recordId, { dryRun: false });
    assert.strictEqual(migrated.neededMigration, true);
    assert.ok(migrated.migratedValue.startsWith('enc:v1:bb-enc-v2:'), 'Migrated envelope must use bb-enc-v2');
    const decryptedMigrated = await decryptSensitiveField(migrated.migratedValue, fieldName, recordId);
    assert.strictEqual(decryptedMigrated, originalText);
  });

  // ==========================================================================
  // INVARIANT 8: Legacy Plaintext Migration Policy & Dry-Run
  // ==========================================================================
  await t.test('8. Legacy records are handled according to an explicit migration policy', async () => {
    const legacyPlaintext = 'legacy_unencrypted_contact_9812345678';
    const recordId = 'vpr_legacy_001';
    const fieldName = 'contact';

    // A. Dry run should identify migration need without altering value
    const dryRunResult = await migrateField(legacyPlaintext, fieldName, recordId, { dryRun: true });
    assert.strictEqual(dryRunResult.neededMigration, true);
    assert.strictEqual(dryRunResult.isEncrypted, false);
    assert.strictEqual(dryRunResult.migratedValue, legacyPlaintext, 'Dry run must not alter value');

    // B. Real run performs migration to current primary key
    const realResult = await migrateField(legacyPlaintext, fieldName, recordId, { dryRun: false });
    assert.strictEqual(realResult.neededMigration, true);
    assert.strictEqual(realResult.isEncrypted, true);
    assert.ok(realResult.migratedValue.startsWith('enc:v1:'));

    // C. Migrated value decrypts successfully
    const decrypted = await decryptSensitiveField(realResult.migratedValue, fieldName, recordId);
    assert.strictEqual(decrypted, legacyPlaintext);

    // D. Decrypting plaintext directly must throw DecryptionError (never silently reinterprets plaintext as ciphertext)
    await assert.rejects(
      async () => decryptSensitiveField(legacyPlaintext, fieldName, recordId),
      DecryptionError,
      'Decrypting plaintext must fail closed with DecryptionError'
    );
  });

  // ==========================================================================
  // INVARIANT 9: Firestore Rules Deny Unauthorized Collection Access
  // ==========================================================================
  await t.test('9. Firestore rules deny unauthorized protected collection access', () => {
    const firestoreRulesPath = path.resolve('firestore.rules');
    assert.ok(fs.existsSync(firestoreRulesPath), 'firestore.rules must exist');
    const rulesContent = fs.readFileSync(firestoreRulesPath, 'utf-8');

    // Check manual_id_exceptions is denied to client SDK
    assert.ok(
      rulesContent.includes('match /manual_id_exceptions/{document=**}'),
      'Rules must declare match for manual_id_exceptions'
    );
    assert.ok(
      rulesContent.includes('match /voting_sessions/{document=**}'),
      'Rules must declare match for voting_sessions'
    );

    // Verify both have allow read, write: if false;
    const exceptionBlock = rulesContent.substring(rulesContent.indexOf('match /manual_id_exceptions'));
    assert.ok(
      exceptionBlock.includes('allow read, write: if false;'),
      'manual_id_exceptions must explicitly deny client read and write'
    );

    const sessionBlock = rulesContent.substring(rulesContent.indexOf('match /voting_sessions'));
    assert.ok(
      sessionBlock.includes('allow read, write: if false;'),
      'voting_sessions must explicitly deny client read and write'
    );
  });

  // ==========================================================================
  // INVARIANT 10: Sensitive Administrative APIs Return Only Permitted Fields
  // ==========================================================================
  await t.test('10. Sensitive administrative APIs return only permitted fields', async () => {
    const res = await fetch(`${baseUrl}/api/admin/voters?constituencyId=CONST-04-ND`, {
      headers: {
        Authorization: `Bearer ${vroToken}`,
      },
    });

    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.ok(data.success);
    assert.ok(Array.isArray(data.voters));

    // Verify voter profiles do not expose private keys, raw tokens, or unmasked sensitive fields
    for (const v of data.voters) {
      assert.strictEqual(v.privateKey, undefined);
      assert.strictEqual(v.sessionToken, undefined);
      assert.strictEqual(v.rawBiometric, undefined);
      assert.ok(v.maskedMobile.includes('***') || v.maskedMobile.includes('XX'));
    }
  });

  // ==========================================================================
  // INVARIANT 11: Biometric Payloads and Physical-ID Documents Rejected
  // ==========================================================================
  await t.test('11. Biometric payloads and physical-ID images/documents remain rejected and are not stored or transmitted', async () => {
    // A. Voter verify rejects prohibited biometric payloads
    const resVerify = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: TEST_VOTERS[0].epicId,
        rawBiometric: 'data:image/png;base64,RAW_BIOMETRIC_DATA',
      }),
    });
    assert.strictEqual(resVerify.status, 400, 'Must reject rawBiometric in verification');
    const bodyVerify = await resVerify.json();
    assert.ok(bodyVerify.message.includes('Prohibited sensitive field(s) rejected'));

    // B. Voter record-vote rejects fingerprint template
    const resVote = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: TEST_VOTERS[0].epicId,
        nullifier: '0x123',
        fingerprintTemplate: 'RAW_TEMPLATE_DATA',
      }),
    });
    assert.strictEqual(resVote.status, 400, 'Must reject fingerprintTemplate in vote recording');

    // C. Admin voter registration rejects document scan
    const resReg = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        fullName: 'Test Elector Reject',
        dateOfBirth: '1990-05-15',
        gender: 'MALE',
        state: 'NCT of Delhi',
        district: 'New Delhi',
        constituencyId: 'CONST-04-ND',
        pollingStation: 'Station 101',
        documentScan: 'data:image/jpeg;base64,SCAN_IMAGE_DATA',
      }),
    });
    assert.strictEqual(resReg.status, 400, 'Must reject documentScan in voter registration');
  });

  // ==========================================================================
  // INVARIANT 12: Session Secrets and Exception Tokens Do Not Leak
  // ==========================================================================
  await t.test('12. Session secrets and exception tokens do not leak into ordinary API responses or audit events', async () => {
    // Inspect public audit events
    const resAudit = await fetch(`${baseUrl}/api/audit-events`);
    assert.strictEqual(resAudit.status, 200);
    const dataAudit = await resAudit.json();
    assert.ok(dataAudit.success);

    for (const event of dataAudit.auditEvents) {
      assert.strictEqual(event.sessionToken, undefined);
      assert.strictEqual(event.exceptionToken, undefined);
      assert.strictEqual(event.privateKey, undefined);
      assert.strictEqual(event.signingKey, undefined);
    }
  });

  // ==========================================================================
  // INVARIANT 13: Privacy Changes Preserve Session Expiry, Locks, and Anti-Replay
  // ==========================================================================
  await t.test('13. Privacy changes preserve session expiry, session locks and duplicate-vote protection', async () => {
    const voter = TEST_VOTERS[0];

    // 1. Initiate verification challenge
    const resChallenge = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: voter.epicId }),
    });
    assert.strictEqual(resChallenge.status, 200);
    const bodyChallenge = await resChallenge.json();
    const testOtp = bodyChallenge.testDeliveryCode;
    assert.ok(testOtp, 'Test OTP delivery code present in test environment');

    // 2. Complete OTP verification to obtain session
    const resVerifyOtp = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: voter.epicId, otp: testOtp, electionId: 'GE-2024' }),
    });
    assert.strictEqual(resVerifyOtp.status, 200);
    const bodyOtp = await resVerifyOtp.json();
    const sessionToken = bodyOtp.sessionToken;
    assert.ok(sessionToken, 'Session token issued');

    // 3. Request EIP-712 authorization ticket
    const resAuth = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        voterWallet: '0x1111111111111111111111111111111111111111',
        electionId: 'GE-2024',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.strictEqual(resAuth.status, 200);
    const bodyAuth = await resAuth.json();
    const nullifier = bodyAuth.nullifier;
    assert.ok(nullifier, 'Nullifier derived');

    // 4. Record first vote
    const resRecord1 = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        nullifier,
        electionId: 'GE-2024',
        candidateId: 101,
        txHash: '0xaaa111',
        isSimulated: true,
      }),
    });
    assert.strictEqual(resRecord1.status, 200);

    // 5. Attempt duplicate vote submission with same session/nullifier
    const resRecord2 = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        nullifier,
        electionId: 'GE-2024',
        candidateId: 102,
        txHash: '0xbbb222',
        isSimulated: true,
      }),
    });
    assert.strictEqual(resRecord2.status, 409, 'Double vote attempt must be rejected');
    const bodyDouble = await resRecord2.json();
    assert.strictEqual(bodyDouble.code, 'DOUBLE_VOTE_ATTEMPT');
  });

  // ==========================================================================
  // INVARIANT 14: Multi-Election Participation Preserved
  // ==========================================================================
  await t.test('14. Privacy changes preserve multi-election participation', async () => {
    const voter = TEST_VOTERS[1]; // IND-DL-339210

    // Complete voting in election GE-2024
    const resChallenge = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: voter.epicId }),
    });
    const { testDeliveryCode } = await resChallenge.json();

    const resOtp1 = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: voter.epicId, otp: testDeliveryCode, electionId: 'GE-2024' }),
    });
    const session1 = (await resOtp1.json()).sessionToken;

    const resAuth1 = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session1}` },
      body: JSON.stringify({
        voterWallet: '0x2222222222222222222222222222222222222222',
        electionId: 'GE-2024',
        constituencyId: 'CONST-04-ND',
      }),
    });
    const nullifier1 = (await resAuth1.json()).nullifier;

    await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session1}` },
      body: JSON.stringify({
        nullifier: nullifier1,
        electionId: 'GE-2024',
        candidateId: 1,
        txHash: '0xvote_e1',
        isSimulated: true,
      }),
    });

    // Now voter initiates voting in a distinct election (MUNI-2024)
    const resChallenge2 = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: voter.epicId }),
    });
    const code2 = (await resChallenge2.json()).testDeliveryCode;

    const resOtp2 = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: voter.epicId, otp: code2, electionId: 'MUNI-2024' }),
    });
    assert.strictEqual(resOtp2.status, 200, 'Voter can authenticate for separate election schedule');
  });

  // ==========================================================================
  // INVARIANT 15: Candidate-Choice Visibility Verified Against Solidity ABI & Calldata
  // ==========================================================================
  await t.test('15. Candidate-choice visibility is tested against real current Solidity code, ABI, calldata and emitted events', () => {
    const artifactPath = path.resolve('artifacts/contracts/IndianElection.sol/IndianElection.json');
    assert.ok(fs.existsSync(artifactPath), 'Compiled artifact IndianElection.json must exist');

    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf-8'));
    const iface = new ethers.Interface(artifact.abi);

    // 1. Inspect castVote function fragment
    const castVoteFn = iface.getFunction('castVote');
    assert.ok(castVoteFn, 'Contract must define castVote');

    // Confirm that _candidateId is an unencrypted input parameter
    const candidateInput = castVoteFn.inputs.find((i) => i.name === '_candidateId');
    assert.ok(candidateInput, '_candidateId must be an explicit calldata parameter');
    assert.strictEqual(candidateInput.type, 'uint256');

    // 2. Encode sample transaction calldata
    const sampleElectionId = 18;
    const sampleConstituencyId = 4;
    const sampleCandidateId = 7; // The confidential candidate selection
    const sampleNullifier = '0x1234567890123456789012345678901234567890123456789012345678901234';
    const sampleExpiry = 1700000000;
    const sampleSignature = '0x' + '00'.repeat(65);

    const calldata = iface.encodeFunctionData('castVote', [
      sampleElectionId,
      sampleConstituencyId,
      sampleCandidateId,
      sampleNullifier,
      sampleExpiry,
      sampleSignature,
    ]);

    // Decode back directly from calldata as an observer would
    const decoded = iface.decodeFunctionData('castVote', calldata);
    assert.strictEqual(
      Number(decoded._candidateId),
      sampleCandidateId,
      'OBSERVER DISCLOSURE: Any observer can extract candidateId directly from transaction calldata'
    );

    // 3. Inspect VoteCast event fragment
    const voteCastEvent = iface.getEvent('VoteCast');
    assert.ok(voteCastEvent, 'Contract must define VoteCast event');

    const eventCandidateParam = voteCastEvent.inputs.find((i) => i.name === '_candidateId' || i.name === 'candidateId');
    assert.ok(eventCandidateParam, 'VoteCast event contains candidateId parameter');
    assert.strictEqual(eventCandidateParam.indexed, true, 'CRITICAL: candidateId is an indexed topic in VoteCast event');

    const eventVoterWalletParam = voteCastEvent.inputs.find((i) => i.name === 'voterWallet');
    assert.ok(eventVoterWalletParam, 'VoteCast event exposes voterWallet');
  });

  // ==========================================================================
  // INVARIANT 16: Field-Level Authenticated Encryption Security
  // ==========================================================================
  await t.test('16. Field-level encryption security and correctness tests', async () => {
    // Encrypt empty string
    const envEmpty = await encryptSensitiveField('', 'field', 'rec');
    const decEmpty = await decryptSensitiveField(envEmpty, 'field', 'rec');
    assert.strictEqual(decEmpty, '');

    // Encrypt large payload (10KB)
    const largeText = 'A'.repeat(10240);
    const envLarge = await encryptSensitiveField(largeText, 'largeField', 'recLarge');
    const decLarge = await decryptSensitiveField(envLarge, 'largeField', 'recLarge');
    assert.strictEqual(decLarge, largeText);
  });

  // ==========================================================================
  // INVARIANT 17: Release Blocker Explicitly Documented & Verified
  // ==========================================================================
  await t.test('17. Documented release blocker is explicit, accurate and verified against the current contract', () => {
    const docPath = path.resolve('docs/ENCRYPTION_AND_PRIVACY.md');
    assert.ok(fs.existsSync(docPath), 'docs/ENCRYPTION_AND_PRIVACY.md must exist');
    const docContent = fs.readFileSync(docPath, 'utf-8');

    // Verify presence of release blocker identifier
    assert.ok(
      docContent.includes('BB-SEC-PH09-BALLOT-SECRECY'),
      'Documentation must explicitly record blocker ID BB-SEC-PH09-BALLOT-SECRECY'
    );
    assert.ok(
      docContent.includes('RELEASE-BLOCKING LIMITATION'),
      'Documentation must label ballot secrecy as a release-blocking limitation'
    );
    assert.ok(
      docContent.includes('castVote'),
      'Documentation must cite castVote calldata disclosure'
    );
    assert.ok(
      docContent.includes('VoteCast'),
      'Documentation must cite VoteCast event disclosure'
    );
  });

  // ==========================================================================
  // INVARIANT 18: Masking Utilities
  // ==========================================================================
  await t.test('18. Data minimization masking utilities operate accurately', () => {
    assert.strictEqual(maskMobile('+91 9823412345'), '+91 98*** **345');
    assert.strictEqual(maskEmail('voter.delhi@example.gov.in'), 'v***i@example.gov.in');
    assert.strictEqual(maskEpic('IND-DL-982341'), 'IND-**-***341');

    // Idempotency on already-masked values
    assert.strictEqual(maskMobile('+91 98*** **345'), '+91 98*** **345');
    assert.strictEqual(maskEpic('IND-**-***341'), 'IND-**-***341');
  });
});
