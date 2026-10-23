import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';
import { ethers } from 'ethers';
import {
  validateServerConfig,
  SERVER_CONFIG,
  DETERMINISTIC_DEV_SIGNING_KEY,
  HARDHAT_ACCOUNT_0_KEY,
  DEFAULT_FALLBACK_HMAC_SECRET,
  DEFAULT_FALLBACK_COMMITMENT_SALT,
} from '../../server/config';
import {
  signEip712VotingAuthorization,
  verifyEip712Ticket,
} from '../../server/crypto';
import {
  setAdminTokenVerifierForTesting,
  setAdminFirestoreForTesting,
  verifyAdminIdToken,
} from '../../server/firebaseAdmin';
import { voterRouter } from '../../server/routes/voter';
import { serverStore } from '../../server/store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

test('BlockBallot — Phase 7E: Production-Readiness Security Review Test Suite', async (t) => {
  // --------------------------------------------------------------------------
  // 1. Production Mode Fail-Closed Validation on Missing Secrets
  // --------------------------------------------------------------------------
  await t.test('1. Production mode fails closed when required secrets are missing', () => {
    // A. Missing all secrets in production
    const missingAll = validateServerConfig({
      NODE_ENV: 'production',
    });
    assert.equal(missingAll.isValid, false, 'Production must fail validation when secrets are missing');
    assert.equal(missingAll.isProduction, true);
    assert.ok(
      missingAll.errors.some((e) => e.includes('SERVER_AUTHORIZATION_SIGNER_KEY is missing')),
      'Must flag missing authorization signer key'
    );
    assert.ok(
      missingAll.errors.some((e) => e.includes('SERVER_HMAC_SECRET must be explicitly configured')),
      'Must flag missing HMAC secret'
    );
    assert.ok(
      missingAll.errors.some((e) => e.includes('SERVER_COMMITMENT_SALT must be explicitly configured')),
      'Must flag missing commitment salt'
    );

    // B. Attempting to use default academic HMAC secret or short HMAC secret in production
    const defaultHmacCheck = validateServerConfig({
      NODE_ENV: 'production',
      SERVER_AUTHORIZATION_SIGNER_KEY: '0x1111111111111111111111111111111111111111111111111111111111111111',
      SERVER_HMAC_SECRET: DEFAULT_FALLBACK_HMAC_SECRET,
      SERVER_COMMITMENT_SALT: 'custom-high-entropy-production-salt-india-2026',
    });
    assert.equal(defaultHmacCheck.isValid, false, 'Must reject default prototype HMAC secret in production');
    assert.ok(
      defaultHmacCheck.errors.some((e) => e.includes('SERVER_HMAC_SECRET in production must be a high-entropy secret')),
      'Must enforce high-entropy HMAC secret'
    );

    // C. Attempting to use default academic salt in production
    const defaultSaltCheck = validateServerConfig({
      NODE_ENV: 'production',
      SERVER_AUTHORIZATION_SIGNER_KEY: '0x1111111111111111111111111111111111111111111111111111111111111111',
      SERVER_HMAC_SECRET: 'production-hmac-secret-at-least-32-chars-long-entropy',
      SERVER_COMMITMENT_SALT: DEFAULT_FALLBACK_COMMITMENT_SALT,
    });
    assert.equal(defaultSaltCheck.isValid, false, 'Must reject default prototype salt in production');
    assert.ok(
      defaultSaltCheck.errors.some((e) => e.includes('SERVER_COMMITMENT_SALT cannot use the default prototype salt')),
      'Must reject prototype salt in production'
    );
  });

  // --------------------------------------------------------------------------
  // 2. Test-Only Key Isolation in Production
  // --------------------------------------------------------------------------
  await t.test('2. Production mode strictly rejects deterministic dev and Hardhat keys', () => {
    // A. Deterministic development key rejected in production
    const devKeyCheck = validateServerConfig({
      NODE_ENV: 'production',
      SERVER_AUTHORIZATION_SIGNER_KEY: DETERMINISTIC_DEV_SIGNING_KEY,
      SERVER_HMAC_SECRET: 'super-secret-hmac-key-for-test-validation-32chars',
      SERVER_COMMITMENT_SALT: 'super-secret-salt-for-test-validation-32chars',
    });
    assert.equal(devKeyCheck.isValid, false, 'Must reject deterministic dev key in production');
    assert.ok(
      devKeyCheck.errors.some((e) => e.includes('Production cannot start with a deterministic development')),
      'Must identify deterministic key error'
    );

    // B. Hardhat Account #0 key rejected in production
    const hardhatKeyCheck = validateServerConfig({
      NODE_ENV: 'production',
      SERVER_AUTHORIZATION_SIGNER_KEY: HARDHAT_ACCOUNT_0_KEY,
      SERVER_HMAC_SECRET: 'super-secret-hmac-key-for-test-validation-32chars',
      SERVER_COMMITMENT_SALT: 'super-secret-salt-for-test-validation-32chars',
    });
    assert.equal(hardhatKeyCheck.isValid, false, 'Must reject Hardhat account #0 in production');
    assert.ok(
      hardhatKeyCheck.errors.some((e) => e.includes('Production cannot start with a deterministic development')),
      'Must identify Hardhat test key error'
    );

    // C. Legitimate, non-test key is accepted
    const legitWallet = ethers.Wallet.createRandom();
    const validProdCheck = validateServerConfig({
      NODE_ENV: 'production',
      SERVER_AUTHORIZATION_SIGNER_KEY: legitWallet.privateKey,
      SERVER_HMAC_SECRET: 'legitimate-high-entropy-hmac-secret-for-production-use',
      SERVER_COMMITMENT_SALT: 'legitimate-high-entropy-commitment-salt-for-nullifiers',
    });
    assert.ok(
      !validProdCheck.errors.some((e) => e.includes('SERVER_AUTHORIZATION_SIGNER_KEY')),
      'Legitimate private key must pass key format validation'
    );
  });

  // --------------------------------------------------------------------------
  // 3. Test Hooks and Authentication Bypasses Prohibited in Production
  // --------------------------------------------------------------------------
  await t.test('3. Test verifier and mock injections fail immediately in production', () => {
    const origEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';

      // Attempting to set admin token verifier for testing in production throws
      assert.throws(
        () => {
          setAdminTokenVerifierForTesting(async () => ({ isValid: true }));
        },
        /SECURITY VIOLATION: Cannot register test token verifier in production mode/,
        'Must throw security violation when registering test verifier in production'
      );

      // Attempting to set admin firestore mock in production throws
      assert.throws(
        () => {
          setAdminFirestoreForTesting({});
        },
        /SECURITY VIOLATION: Cannot register test Firestore mock in production mode/,
        'Must throw security violation when registering test firestore mock in production'
      );
    } finally {
      process.env.NODE_ENV = origEnv;
    }
  });

  // --------------------------------------------------------------------------
  // 4. Contract Signer and EIP-712 Cryptographic Alignment
  // --------------------------------------------------------------------------
  await t.test('4. Server validates authorization signer against contract deployment manifest', async () => {
    const legitWallet = ethers.Wallet.createRandom();
    const manifestPath = path.resolve(__dirname, '../../src/contracts/deployment.json');
    assert.ok(fs.existsSync(manifestPath), 'Deployment manifest must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Config with mismatched signer in production
    const mismatchConfig = validateServerConfig({
      NODE_ENV: 'production',
      SERVER_AUTHORIZATION_SIGNER_KEY: legitWallet.privateKey,
      SERVER_HMAC_SECRET: 'production-hmac-secret-high-entropy-32-chars-long',
      SERVER_COMMITMENT_SALT: 'production-commitment-salt-high-entropy-32-chars',
    });

    assert.equal(mismatchConfig.contractSignerMatch, false, 'Should detect mismatch with contract signer');
    assert.ok(
      mismatchConfig.errors.some((e) => e.includes('Signer address mismatch')),
      'Must produce critical error in production when server key does not match deployed contract'
    );

    // EIP-712 signing fails safely if key is empty/unconfigured
    await assert.rejects(
      async () => {
        await signEip712VotingAuthorization(
          18,
          4,
          '0x1111111111111111111111111111111111111111',
          '0x2222222222222222222222222222222222222222222222222222222222222222',
          Math.floor(Date.now() / 1000) + 900,
          31337,
          manifest.contractAddress,
          '' // Empty key
        );
      },
      /EIP-712 signing failed: SERVER_AUTHORIZATION_SIGNER_KEY is not configured or invalid/
    );
  });

  // --------------------------------------------------------------------------
  // 5. Voter Identity Cannot Be Spoofed by Arbitrary User ID in Production
  // --------------------------------------------------------------------------
  await t.test('5. Record-vote route strictly rejects arbitrary unauthenticated epicId in production', async () => {
    const app = express();
    app.use(express.json());
    app.use('/api/voter', voterRouter);

    const server = app.listen(0);
    const address = server.address() as any;
    const baseUrl = `http://127.0.0.1:${address.port}`;

    const origEnv = process.env.NODE_ENV;
    try {
      // Simulate production
      process.env.NODE_ENV = 'production';

      // Call record-vote with spoofed epicId and no session token
      const res = await fetch(`${baseUrl}/api/voter/record-vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epicId: 'VTR1000001',
          nullifier: '0x1234567890123456789012345678901234567890123456789012345678901234',
          electionId: 18,
        }),
      });

      assert.equal(res.status, 401, 'Unauthenticated participation submission must be rejected with 401');
      const data = await res.json();
      assert.equal(data.success, false);
      assert.ok(data.message.includes('verified voter session token'));

      // Call recover-transaction with spoofed epicId and no session token
      const recoverRes = await fetch(`${baseUrl}/api/voter/recover-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          epicId: 'VTR1000001',
        }),
      });

      assert.equal(recoverRes.status, 401, 'Unauthenticated transaction recovery must be rejected with 401');
    } finally {
      process.env.NODE_ENV = origEnv;
      server.close();
    }
  });

  // --------------------------------------------------------------------------
  // 6. Blockchain Deployment Safeguards & Plaintext Candidate Visibility
  // --------------------------------------------------------------------------
  await t.test('6. Deployment manifest is marked test-only and documents public transaction visibility', () => {
    const manifestPath = path.resolve(__dirname, '../../src/contracts/deployment.json');
    assert.ok(fs.existsSync(manifestPath), 'Deployment manifest must exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    // Verify test-only isolation
    assert.equal(manifest.isTestDeployment, true, 'Deployment manifest must declare isTestDeployment: true');
    assert.equal(manifest.environment, 'test-only', 'Deployment environment must be marked test-only');
    assert.equal(manifest.chainId, 31337, 'Default development deployment must be restricted to local Hardhat chain (31337)');

    // Verify lack of ballot secrecy disclosure
    assert.ok(manifest.disclaimer, 'Deployment manifest must include security disclaimer');
    assert.ok(
      manifest.disclaimer.includes('plaintext candidate IDs on-chain'),
      'Must disclose that candidate choices are submitted as plaintext candidate IDs'
    );
    assert.ok(
      manifest.disclaimer.includes('Does not provide ballot secrecy or real-election suitability'),
      'Must explicitly state that contract does not provide ballot secrecy'
    );
  });
});
