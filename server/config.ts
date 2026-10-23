import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const DEFAULT_FALLBACK_HMAC_SECRET =
  'BLOCKBALLOT_SECURE_HMAC_SECRET_K8f72h901ndk2n9d8213hd98h23d9h12d9h8129';
export const DEFAULT_FALLBACK_COMMITMENT_SALT =
  'BLOCKBALLOT_SERVER_COMMITMENT_SALT_PROTOTYPE_2024_INDIA';
export const DETERMINISTIC_DEV_SIGNING_KEY =
  '0x2a871487aac2363f339b9704835d8160f77824cb873f004a5a49615375ff82a5';
export const HARDHAT_ACCOUNT_0_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

// Known development and test-only private keys that must NEVER be accepted in production
export const KNOWN_TEST_SIGNING_KEYS = new Set([
  DETERMINISTIC_DEV_SIGNING_KEY.toLowerCase(),
  HARDHAT_ACCOUNT_0_KEY.toLowerCase(),
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Hardhat #1
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Hardhat #2
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // Hardhat #3
]);

// Dedicated server-side secrets with production safeguards
export const SERVER_CONFIG = {
  // High-entropy HMAC secret for OTP hashing
  get HMAC_SECRET(): string {
    if (process.env.NODE_ENV === 'production') {
      return process.env.SERVER_HMAC_SECRET || '';
    }
    return process.env.SERVER_HMAC_SECRET || DEFAULT_FALLBACK_HMAC_SECRET;
  },

  // Dedicated server-side ECDSA private key for signing EIP-712 VotingAuthorization tickets
  // Strictly loaded from environment secrets in production; test keys are rejected in production
  get AUTHORIZATION_SIGNER_PRIVATE_KEY(): string {
    const rawKey = process.env.SERVER_AUTHORIZATION_SIGNER_KEY;
    if (process.env.NODE_ENV === 'production') {
      if (!rawKey) return '';
      if (KNOWN_TEST_SIGNING_KEYS.has(rawKey.trim().toLowerCase())) {
        return '';
      }
      return rawKey.trim();
    }
    return rawKey?.trim() || DETERMINISTIC_DEV_SIGNING_KEY;
  },
  set AUTHORIZATION_SIGNER_PRIVATE_KEY(val: string) {
    process.env.SERVER_AUTHORIZATION_SIGNER_KEY = val;
  },

  // Server salt for pseudonymous voter nullifier derivation
  get COMMITMENT_SALT(): string {
    if (process.env.NODE_ENV === 'production') {
      return process.env.SERVER_COMMITMENT_SALT || '';
    }
    return process.env.SERVER_COMMITMENT_SALT || DEFAULT_FALLBACK_COMMITMENT_SALT;
  },

  // Target Firestore Database ID
  get FIRESTORE_DATABASE_ID(): string {
    return process.env.FIRESTORE_DATABASE_ID || '(default)';
  },

  get PROJECT_ID(): string {
    return (
      process.env.GCLOUD_PROJECT ||
      process.env.FIREBASE_PROJECT_ID ||
      'e-voting-system-india'
    );
  },
  PORT: parseInt(process.env.PORT || '3000', 10),
  get NODE_ENV(): string {
    return process.env.NODE_ENV || 'development';
  },

  // Limits
  OTP_EXPIRY_MS: 5 * 60 * 1000, // 5 minutes
  OTP_COOLDOWN_MS: 60 * 1000, // 60 seconds
  OTP_MAX_ATTEMPTS: 3,
  SESSION_EXPIRY_MS: 15 * 60 * 1000, // 15 minutes
};

/**
 * Safely derives the public Ethereum address of the server's authorization signer.
 * Never exposes or logs the private key.
 */
export function derivePublicSignerAddress(privateKey?: string): string | null {
  try {
    const key = privateKey !== undefined ? privateKey : SERVER_CONFIG.AUTHORIZATION_SIGNER_PRIVATE_KEY;
    if (!key || typeof key !== 'string' || !key.startsWith('0x') || key.length !== 66) {
      return null;
    }
    return new ethers.Wallet(key).address;
  } catch {
    return null;
  }
}

export function getPublicSignerAddress(): string | null {
  return derivePublicSignerAddress();
}

export const SERVER_AUTHORIZATION_SIGNER_ADDRESS: string | null = derivePublicSignerAddress();

export interface ServerConfigValidationResult {
  isValid: boolean;
  isProduction: boolean;
  errors: string[];
  warnings: string[];
  signerAddress: string | null;
  contractSignerMatch?: boolean;
}

/**
 * Validates critical server configuration with fail-closed rules in production.
 * Checks for missing secrets, test-key leakage, and contract authorization signer alignment.
 */
export function validateServerConfig(customEnv?: NodeJS.ProcessEnv): ServerConfigValidationResult {
  const env = customEnv || process.env;
  const isProduction = (env.NODE_ENV || SERVER_CONFIG.NODE_ENV) === 'production';
  const errors: string[] = [];
  const warnings: string[] = [];

  const rawSignerKey = env.SERVER_AUTHORIZATION_SIGNER_KEY;

  if (isProduction) {
    // 1. Production Signing Key Validation
    if (!rawSignerKey) {
      errors.push('CRITICAL: SERVER_AUTHORIZATION_SIGNER_KEY is missing in production environment.');
    } else {
      const trimmedKey = rawSignerKey.trim().toLowerCase();
      if (KNOWN_TEST_SIGNING_KEYS.has(trimmedKey)) {
        errors.push(
          'CRITICAL: Production cannot start with a deterministic development or test signing key.'
        );
      } else if (!derivePublicSignerAddress(rawSignerKey.trim())) {
        errors.push(
          'CRITICAL: SERVER_AUTHORIZATION_SIGNER_KEY is invalid (expected 66-character 0x-prefixed hex string).'
        );
      }
    }

    // 2. Production HMAC Secret Validation
    if (!env.SERVER_HMAC_SECRET) {
      errors.push('CRITICAL: SERVER_HMAC_SECRET must be explicitly configured in production.');
    } else if (
      env.SERVER_HMAC_SECRET === DEFAULT_FALLBACK_HMAC_SECRET ||
      env.SERVER_HMAC_SECRET.length < 32
    ) {
      errors.push(
        'CRITICAL: SERVER_HMAC_SECRET in production must be a high-entropy secret (>= 32 chars) and not the default prototype key.'
      );
    }

    // 3. Production Nullifier Commitment Salt Validation
    if (!env.SERVER_COMMITMENT_SALT) {
      errors.push('CRITICAL: SERVER_COMMITMENT_SALT must be explicitly configured in production.');
    } else if (env.SERVER_COMMITMENT_SALT === DEFAULT_FALLBACK_COMMITMENT_SALT) {
      errors.push(
        'CRITICAL: SERVER_COMMITMENT_SALT cannot use the default prototype salt in production.'
      );
    }

    // 4. Production Cloud Credentials Advisory
    if (!env.FIREBASE_SERVICE_ACCOUNT_KEY && !env.GOOGLE_APPLICATION_CREDENTIALS && !env.FIRESTORE_EMULATOR_HOST) {
      warnings.push(
        'Neither FIREBASE_SERVICE_ACCOUNT_KEY nor GOOGLE_APPLICATION_CREDENTIALS is set. Firestore writes will fail unless using GCP Application Default Credentials.'
      );
    }
  } else {
    // Non-production advisories
    if (!env.SERVER_HMAC_SECRET) {
      warnings.push('SERVER_HMAC_SECRET not set in environment; using secure fallback key for academic demo.');
    }
    if (!rawSignerKey) {
      warnings.push('SERVER_AUTHORIZATION_SIGNER_KEY not set in environment; using dedicated demo signing key.');
    }
  }

  // Derive signer address
  const activeKey = isProduction
    ? (rawSignerKey && !KNOWN_TEST_SIGNING_KEYS.has(rawSignerKey.trim().toLowerCase()) ? rawSignerKey.trim() : undefined)
    : (rawSignerKey?.trim() || DETERMINISTIC_DEV_SIGNING_KEY);

  const currentSigner = derivePublicSignerAddress(activeKey);
  if (!currentSigner && !isProduction) {
    warnings.push('SERVER_AUTHORIZATION_SIGNER_KEY is invalid; cannot derive public signer address.');
  }

  // 5. Contract Authorization Signer Alignment
  let contractSignerMatch: boolean | undefined = undefined;
  try {
    const manifestPath = path.resolve(__dirname, '../src/contracts/deployment.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      if (manifest.authorizationSigner) {
        if (currentSigner && currentSigner.toLowerCase() !== manifest.authorizationSigner.toLowerCase()) {
          const mismatchMsg = `Signer address mismatch: Server is configured to sign with ${currentSigner}, but deployed contract expects ${manifest.authorizationSigner}.`;
          if (isProduction) {
            errors.push(`CRITICAL: ${mismatchMsg}`);
          } else {
            warnings.push(mismatchMsg);
          }
          contractSignerMatch = false;
        } else {
          contractSignerMatch = true;
        }
      }
    }
  } catch (err: any) {
    warnings.push(`Notice inspecting deployment manifest: ${err.message}`);
  }

  return {
    isValid: errors.length === 0 && currentSigner !== null,
    isProduction,
    errors,
    warnings,
    signerAddress: currentSigner,
    contractSignerMatch,
  };
}
