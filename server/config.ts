import dotenv from 'dotenv';
dotenv.config();

// Dedicated server-side secrets
export const SERVER_CONFIG = {
  // High-entropy HMAC secret for OTP hashing
  HMAC_SECRET:
    process.env.SERVER_HMAC_SECRET ||
    'BLOCKBALLOT_SECURE_HMAC_SECRET_K8f72h901ndk2n9d8213hd98h23d9h12d9h8129',

  // Dedicated server-side ECDSA private key for signing EIP-712 VotingAuthorization tickets
  AUTHORIZATION_SIGNER_PRIVATE_KEY:
    process.env.SERVER_AUTHORIZATION_SIGNER_KEY ||
    '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d',

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

// Validate critical configuration on server boot
export function validateServerConfig(): { isValid: boolean; warnings: string[] } {
  const warnings: string[] = [];
  if (!process.env.SERVER_HMAC_SECRET) {
    warnings.push('SERVER_HMAC_SECRET not set in environment; using secure fallback key for academic demo.');
  }
  if (!process.env.SERVER_AUTHORIZATION_SIGNER_KEY) {
    warnings.push('SERVER_AUTHORIZATION_SIGNER_KEY not set in environment; using dedicated demo signing key.');
  }
  return { isValid: true, warnings };
}
