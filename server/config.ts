import dotenv from 'dotenv';
import { ethers } from 'ethers';
dotenv.config();

// Dedicated server-side secrets
export const SERVER_CONFIG = {
  // High-entropy HMAC secret for OTP hashing
  HMAC_SECRET:
    process.env.SERVER_HMAC_SECRET ||
    'BLOCKBALLOT_SECURE_HMAC_SECRET_K8f72h901ndk2n9d8213hd98h23d9h12d9h8129',

  // Dedicated server-side ECDSA private key for signing EIP-712 VotingAuthorization tickets
  // Strictly loaded from environment secrets — never hard-code or expose in code
  AUTHORIZATION_SIGNER_PRIVATE_KEY:
    process.env.SERVER_AUTHORIZATION_SIGNER_KEY || '',

  // Server salt for pseudonymous voter nullifier derivation
  COMMITMENT_SALT:
    process.env.SERVER_COMMITMENT_SALT ||
    'BLOCKBALLOT_SERVER_COMMITMENT_SALT_PROTOTYPE_2024_INDIA',

  // Target Firestore Database ID
  FIRESTORE_DATABASE_ID:
    process.env.FIRESTORE_DATABASE_ID || 'ai-studio-565633a9-76eb-4419-9891-05e6de180d7c',

  PROJECT_ID: 'e-voting-system-india',
  PORT: parseInt(process.env.PORT || '3000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',

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
    const key = privateKey || SERVER_CONFIG.AUTHORIZATION_SIGNER_PRIVATE_KEY;
    if (!key || typeof key !== 'string' || !key.startsWith('0x') || key.length !== 66) {
      return null;
    }
    return new ethers.Wallet(key).address;
  } catch {
    return null;
  }
}

export const SERVER_AUTHORIZATION_SIGNER_ADDRESS: string | null = derivePublicSignerAddress();

// Validate critical configuration on server boot
export function validateServerConfig(): { isValid: boolean; warnings: string[]; signerAddress: string | null } {
  const warnings: string[] = [];
  if (!process.env.SERVER_HMAC_SECRET) {
    warnings.push('SERVER_HMAC_SECRET not set in environment; using secure fallback key for academic demo.');
  }
  if (!process.env.SERVER_AUTHORIZATION_SIGNER_KEY) {
    warnings.push('SERVER_AUTHORIZATION_SIGNER_KEY not set in environment; using dedicated demo signing key.');
  }
  if (!SERVER_AUTHORIZATION_SIGNER_ADDRESS) {
    warnings.push('SERVER_AUTHORIZATION_SIGNER_KEY is invalid or missing; cannot derive public signer address.');
  }
  return {
    isValid: SERVER_AUTHORIZATION_SIGNER_ADDRESS !== null,
    warnings,
    signerAddress: SERVER_AUTHORIZATION_SIGNER_ADDRESS,
  };
}
