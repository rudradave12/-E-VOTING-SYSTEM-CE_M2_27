/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import {
  validateServerConfig,
  derivePublicSignerAddress,
  DETERMINISTIC_DEV_SIGNING_KEY,
  HARDHAT_ACCOUNT_0_KEY,
  SERVER_CONFIG,
} from '../backend/server/config';
import {
  signEip712VotingAuthorization,
  verifyEip712Ticket,
} from '../backend/server/crypto';
import {
  verifyOfficerCredentials,
  createOfficerSession,
  getOfficerSession,
  revokeOfficerSession,
  clearOfficerSessionsForTesting,
} from '../backend/server/auth/rbac';
import { DEMO_OFFICER_IDENTIFIERS } from '../frontend/src/types/permissions';

test('BlockBallot — Production Signing Key Security, Hosted Demo Mode & RBAC Verification Suite', async (t) => {
  const manifestPath = path.resolve(process.cwd(), 'frontend/src/contracts/deployment.json');
  assert.ok(fs.existsSync(manifestPath), 'Deployment manifest must exist at frontend/src/contracts/deployment.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const expectedContractSigner = manifest.authorizationSigner.toLowerCase();

  // ==========================================================================
  // SUITE 1: Strict Production Fail-Closed Rules
  // ==========================================================================
  await t.test('1. Strict Production: Missing or test signing keys fail closed with critical errors', () => {
    // A. Missing signing key in strict production
    const resMissing = validateServerConfig({
      NODE_ENV: 'production',
      HOSTED_DEMO_ENABLED: 'false',
      SERVER_HMAC_SECRET: 'production-high-entropy-hmac-secret-at-least-32-chars',
      SERVER_COMMITMENT_SALT: 'production-high-entropy-commitment-salt-32chars',
      APP_ENCRYPTION_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234',
    });
    assert.strictEqual(resMissing.isValid, false, 'Missing signing key must fail closed in strict production');
    assert.ok(
      resMissing.errors.some((e) => e.includes('SERVER_AUTHORIZATION_SIGNER_KEY is missing')),
      'Must cite missing SERVER_AUTHORIZATION_SIGNER_KEY error'
    );

    // B. Known deterministic development key in strict production
    const resDevKey = validateServerConfig({
      NODE_ENV: 'production',
      HOSTED_DEMO_ENABLED: 'false',
      SERVER_AUTHORIZATION_SIGNER_KEY: DETERMINISTIC_DEV_SIGNING_KEY,
      SERVER_HMAC_SECRET: 'production-high-entropy-hmac-secret-at-least-32-chars',
      SERVER_COMMITMENT_SALT: 'production-high-entropy-commitment-salt-32chars',
      APP_ENCRYPTION_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234',
    });
    assert.strictEqual(resDevKey.isValid, false, 'Deterministic dev key must fail closed in strict production');
    assert.ok(
      resDevKey.errors.some((e) => e.includes('deterministic development or test signing key')),
      'Must cite deterministic test key error'
    );

    // C. Hardhat Account #0 in strict production
    const resHardhatKey = validateServerConfig({
      NODE_ENV: 'production',
      HOSTED_DEMO_ENABLED: 'false',
      SERVER_AUTHORIZATION_SIGNER_KEY: HARDHAT_ACCOUNT_0_KEY,
      SERVER_HMAC_SECRET: 'production-high-entropy-hmac-secret-at-least-32-chars',
      SERVER_COMMITMENT_SALT: 'production-high-entropy-commitment-salt-32chars',
      APP_ENCRYPTION_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234',
    });
    assert.strictEqual(resHardhatKey.isValid, false, 'Hardhat account #0 must fail closed in strict production');
    assert.ok(
      resHardhatKey.errors.some((e) => e.includes('deterministic development or test signing key')),
      'Must cite Hardhat test key error'
    );

    // D. Malformed key format (not 66-character 0x hex) in strict production
    const resMalformed = validateServerConfig({
      NODE_ENV: 'production',
      HOSTED_DEMO_ENABLED: 'false',
      SERVER_AUTHORIZATION_SIGNER_KEY: '0x12345invalidkey',
      SERVER_HMAC_SECRET: 'production-high-entropy-hmac-secret-at-least-32-chars',
      SERVER_COMMITMENT_SALT: 'production-high-entropy-commitment-salt-32chars',
      APP_ENCRYPTION_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234',
    });
    assert.strictEqual(resMalformed.isValid, false, 'Malformed key must fail closed in strict production');
    assert.ok(
      resMalformed.errors.some((e) => e.includes('SERVER_AUTHORIZATION_SIGNER_KEY is invalid')),
      'Must cite invalid key format'
    );

    // E. Legitimate key with signer address mismatch against contract deployment manifest
    const randomWallet = ethers.Wallet.createRandom();
    const resMismatch = validateServerConfig({
      NODE_ENV: 'production',
      HOSTED_DEMO_ENABLED: 'false',
      SERVER_AUTHORIZATION_SIGNER_KEY: randomWallet.privateKey,
      SERVER_HMAC_SECRET: 'production-high-entropy-hmac-secret-at-least-32-chars',
      SERVER_COMMITMENT_SALT: 'production-high-entropy-commitment-salt-32chars',
      APP_ENCRYPTION_KEY: '0x1234567890123456789012345678901234567890123456789012345678901234',
    });
    assert.strictEqual(resMismatch.isValid, false, 'Signer mismatch must fail closed in strict production');
    assert.strictEqual(resMismatch.contractSignerMatch, false);
    assert.ok(
      resMismatch.errors.some((e) => e.includes('Signer address mismatch')),
      'Must cite signer address mismatch'
    );
  });

  // ==========================================================================
  // SUITE 2: Hosted Demo Mode (Render Evaluation Deployment)
  // ==========================================================================
  await t.test('2. Hosted Demo Mode: Gracefully falls back to contract manifest signer with diagnostic warnings', () => {
    // A. Unconfigured environment on Render: HOSTED_DEMO_ENABLED=true without explicit keys
    const resHostedDemoDefault = validateServerConfig({
      NODE_ENV: 'production',
      HOSTED_DEMO_ENABLED: 'true',
    });

    assert.strictEqual(resHostedDemoDefault.isValid, true, 'Hosted demo must validate successfully with manifest signer fallback');
    assert.strictEqual(resHostedDemoDefault.errors.length, 0, 'Hosted demo must have zero critical errors');
    assert.ok(resHostedDemoDefault.signerAddress, 'Signer address must be derived');
    assert.strictEqual(
      resHostedDemoDefault.signerAddress?.toLowerCase(),
      expectedContractSigner,
      'Derived signer address must exactly match contract deployment manifest'
    );
    assert.strictEqual(resHostedDemoDefault.contractSignerMatch, true, 'contractSignerMatch must be true');
    assert.ok(
      resHostedDemoDefault.warnings.some((w) => w.includes('academic demo authorization key')),
      'Must issue advisory warning that academic demo authorization key is active'
    );

    // B. Hosted demo with malformed key still fails closed
    const resHostedMalformed = validateServerConfig({
      NODE_ENV: 'production',
      HOSTED_DEMO_ENABLED: 'true',
      SERVER_AUTHORIZATION_SIGNER_KEY: '0xinvalidkeynothex',
    });
    assert.strictEqual(resHostedMalformed.isValid, false, 'Malformed key in hosted demo must fail closed');
    assert.ok(
      resHostedMalformed.errors.some((e) => e.includes('SERVER_AUTHORIZATION_SIGNER_KEY is invalid')),
      'Must cite invalid key format even in hosted demo'
    );

    // C. Hosted demo with mismatched signer key fails closed (prevents deploying invalid key to Render)
    const randomWallet = ethers.Wallet.createRandom();
    const resHostedMismatch = validateServerConfig({
      NODE_ENV: 'production',
      HOSTED_DEMO_ENABLED: 'true',
      SERVER_AUTHORIZATION_SIGNER_KEY: randomWallet.privateKey,
    });
    assert.strictEqual(resHostedMismatch.isValid, false, 'Mismatched key in hosted demo must fail closed');
    assert.strictEqual(resHostedMismatch.contractSignerMatch, false);
    assert.ok(
      resHostedMismatch.errors.some((e) => e.includes('Signer address mismatch')),
      'Must cite signer address mismatch in hosted demo'
    );
  });

  // ==========================================================================
  // SUITE 3: EIP-712 Cryptographic Signature Verification
  // ==========================================================================
  await t.test('3. EIP-712 Cryptographic Signatures: Valid ticket passes; tampered/forged tickets fail', async () => {
    const chainId = manifest.chainId;
    const contractAddress = manifest.contractAddress;
    const voterAddress = '0x1111111111111111111111111111111111111111';
    const serverNullifier = '0x2222222222222222222222222222222222222222222222222222222222222222';
    const expiryTimestamp = Math.floor(Date.now() / 1000) + 3600; // 1 hour in the future

    // A. Generate valid ticket signed with DETERMINISTIC_DEV_SIGNING_KEY
    const validTicket = await signEip712VotingAuthorization(
      18, // age >= 18
      4,  // constituencyId
      voterAddress,
      serverNullifier,
      expiryTimestamp,
      chainId,
      contractAddress,
      DETERMINISTIC_DEV_SIGNING_KEY
    );

    assert.ok(validTicket.signature.startsWith('0x'), 'Signature must be 0x-prefixed hex');
    assert.strictEqual(validTicket.signature.length, 132, 'EIP-712 signature must be 65 bytes (130 hex chars + 0x)');

    // B. Verify valid ticket against expected signer
    const validResult = verifyEip712Ticket(validTicket, expectedContractSigner);
    assert.strictEqual(validResult.isValid, true, 'Valid EIP-712 ticket must verify successfully');
    assert.strictEqual(validResult.recoveredAddress?.toLowerCase(), expectedContractSigner);

    // C. Tampered voter address fails verification
    const tamperedAddressTicket = {
      ...validTicket,
      voterWallet: '0x9999999999999999999999999999999999999999',
    };
    const tamperedResult = verifyEip712Ticket(tamperedAddressTicket, expectedContractSigner);
    assert.strictEqual(tamperedResult.isValid, false, 'Tampered voter address must fail verification');

    // D. Tampered constituency ID fails verification
    const tamperedConstTicket = {
      ...validTicket,
      constituencyId: 99,
    };
    const tamperedConstResult = verifyEip712Ticket(tamperedConstTicket, expectedContractSigner);
    assert.strictEqual(tamperedConstResult.isValid, false, 'Tampered constituency must fail verification');

    // E. Forged signature signed with unauthorized random key fails verification
    const forgedWallet = ethers.Wallet.createRandom();
    const forgedTicket = await signEip712VotingAuthorization(
      18,
      4,
      voterAddress,
      serverNullifier,
      expiryTimestamp,
      chainId,
      contractAddress,
      forgedWallet.privateKey
    );
    const forgedResult = verifyEip712Ticket(forgedTicket, expectedContractSigner);
    assert.strictEqual(forgedResult.isValid, false, 'Ticket forged by unauthorized key must fail verification against contract signer');
    assert.notStrictEqual(forgedResult.recoveredAddress?.toLowerCase(), expectedContractSigner);

    // F. Chain ID mismatch fails verification
    const mismatchedChainTicket = {
      ...validTicket,
      chainId: 1, // Mainnet chain ID instead of testnet/local
    };
    const chainMismatchResult = verifyEip712Ticket(mismatchedChainTicket, expectedContractSigner);
    assert.strictEqual(chainMismatchResult.isValid, false, 'Chain ID mismatch must fail verification');
  });

  // ==========================================================================
  // SUITE 4: Staff Authentication & Session Isolation
  // ==========================================================================
  await t.test('4. Staff Authentication: Strict production fails closed; hosted demo authorizes intended profiles', async () => {
    clearOfficerSessionsForTesting();
    const savedNodeEnv = process.env.NODE_ENV;
    const savedHostedDemo = process.env.HOSTED_DEMO_ENABLED;
    const savedEoPass = process.env.OFFICER_EO_PASSWORD;
    const savedVroPass = process.env.OFFICER_VRO_PASSWORD;
    const savedAdminPass = process.env.DEMO_ADMIN_PASSWORD;

    try {
      // Clean environment variables for test isolation
      delete process.env.OFFICER_EO_PASSWORD;
      delete process.env.OFFICER_VRO_PASSWORD;
      delete process.env.DEMO_ADMIN_PASSWORD;

      // Part A: Strict production mode (NODE_ENV=production, HOSTED_DEMO_ENABLED=false)
      process.env.NODE_ENV = 'production';
      process.env.HOSTED_DEMO_ENABLED = 'false';

      const strictEoAttempt = await verifyOfficerCredentials('EO-SIM-001', 'Officer@2024!');
      assert.strictEqual(strictEoAttempt.success, false, 'Strict production must deny unconfigured password logins');
      assert.ok(
        strictEoAttempt.message?.includes('disabled in production') ||
          strictEoAttempt.message?.includes('not been configured'),
        'Must give clear fail-closed production message'
      );

      // Part B: Hosted demo mode without configured env passwords fails closed
      process.env.NODE_ENV = 'production';
      process.env.HOSTED_DEMO_ENABLED = 'true';

      const unconfiguredEoAttempt = await verifyOfficerCredentials('EO-SIM-001', 'Officer@2024!');
      assert.strictEqual(unconfiguredEoAttempt.success, false, 'Unconfigured password in production hosted demo must fail closed');
      assert.ok(
        unconfiguredEoAttempt.message?.includes('not been configured in server environment variables'),
        'Must inform administrator to set environment variable'
      );

      // Part C: Hosted demo mode with configured environment variables succeeds for all three profiles
      const testSecretEO = 'SecureElectionOfficerSecret2026!';
      const testSecretVRO = 'SecureVroSecret2026!';
      const testSecretAdmin = 'SecurePlatformAdminSecret2026!';

      process.env.OFFICER_EO_PASSWORD = testSecretEO;
      process.env.OFFICER_VRO_PASSWORD = testSecretVRO;
      process.env.DEMO_ADMIN_PASSWORD = testSecretAdmin;

      // 1. Election Officer (EO-SIM-001)
      const eoLogin = await verifyOfficerCredentials('EO-SIM-001', testSecretEO);
      assert.strictEqual(eoLogin.success, true, 'EO login must succeed with configured secret');
      assert.strictEqual(eoLogin.account?.role, 'ELECTION_OFFICER');
      assert.strictEqual(eoLogin.account?.id, DEMO_OFFICER_IDENTIFIERS.ELECTION_OFFICER);

      // 2. Voter Registration Officer (VRO-SIM-001)
      const vroLogin = await verifyOfficerCredentials('VRO-SIM-001', testSecretVRO);
      assert.strictEqual(vroLogin.success, true, 'VRO login must succeed with configured secret');
      assert.strictEqual(vroLogin.account?.role, 'VOTER_REGISTRATION_OFFICER');
      assert.strictEqual(vroLogin.account?.id, DEMO_OFFICER_IDENTIFIERS.VOTER_REGISTRATION_OFFICER);

      // 3. Platform Admin (demo.admin@blockballot.local)
      const adminLogin = await verifyOfficerCredentials('demo.admin@blockballot.local', testSecretAdmin);
      assert.strictEqual(adminLogin.success, true, 'Demo Admin login must succeed with configured secret');
      assert.strictEqual(adminLogin.account?.role, 'PLATFORM_ADMIN');
      assert.strictEqual(adminLogin.account?.id, DEMO_OFFICER_IDENTIFIERS.PLATFORM_ADMIN);

      // 4. Invalid credentials rejected
      const invalidLogin = await verifyOfficerCredentials('EO-SIM-001', 'WrongPassword123!');
      assert.strictEqual(invalidLogin.success, false, 'Invalid password must be rejected');
      assert.strictEqual(invalidLogin.message, 'Invalid administrative credentials.');

      // 5. Session creation, retrieval, and revocation lifecycle
      const session = createOfficerSession(eoLogin.account!);
      assert.ok(session.token.startsWith('adm_sec_'), 'Session token must have adm_sec_ prefix');
      assert.strictEqual(session.role, 'ELECTION_OFFICER');

      const retrieved = getOfficerSession(session.token);
      assert.ok(retrieved, 'Session must be retrievable before revocation');
      assert.strictEqual(retrieved?.accountId, 'EO-SIM-001');

      const revoked = revokeOfficerSession(session.token);
      assert.strictEqual(revoked, true, 'Revocation must return true');

      const afterRevocation = getOfficerSession(session.token);
      assert.strictEqual(afterRevocation, null, 'Revoked session must return null');
    } finally {
      process.env.NODE_ENV = savedNodeEnv;
      if (savedHostedDemo !== undefined) process.env.HOSTED_DEMO_ENABLED = savedHostedDemo;
      else delete process.env.HOSTED_DEMO_ENABLED;
      if (savedEoPass !== undefined) process.env.OFFICER_EO_PASSWORD = savedEoPass;
      if (savedVroPass !== undefined) process.env.OFFICER_VRO_PASSWORD = savedVroPass;
      if (savedAdminPass !== undefined) process.env.DEMO_ADMIN_PASSWORD = savedAdminPass;
      clearOfficerSessionsForTesting();
    }
  });
});
