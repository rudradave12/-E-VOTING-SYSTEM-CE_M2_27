/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { VoterProfile } from '../../src/types/dataModel';

/**
 * Masks a mobile number so only the country prefix and last 3 or 4 digits are visible.
 * E.g. '+91 9823412345' -> '+91 98*** **345'
 */
export function maskMobile(mobile?: string): string {
  if (!mobile || typeof mobile !== 'string') return '';
  const trimmed = mobile.trim();
  if (trimmed.includes('XXX') || trimmed.includes('***')) {
    return trimmed; // Already masked
  }

  // Format: +91 9876543210
  if (trimmed.length <= 4) {
    return '***';
  }

  const prefix = trimmed.startsWith('+91') ? '+91 ' : trimmed.slice(0, 3);
  const core = trimmed.startsWith('+91') ? trimmed.slice(3).trim() : trimmed.slice(3);
  const visibleLast = core.slice(-3);

  return `${prefix}${core.slice(0, 2)}*** **${visibleLast}`;
}

/**
 * Masks an email address so user prefix is obscured.
 * E.g. 'voter.delhi@example.gov.in' -> 'v***i@example.gov.in'
 */
export function maskEmail(email?: string): string {
  if (!email || typeof email !== 'string') return '';
  const trimmed = email.trim();
  const atIdx = trimmed.indexOf('@');
  if (atIdx <= 1) return trimmed;

  const user = trimmed.slice(0, atIdx);
  const domain = trimmed.slice(atIdx);

  if (user.length <= 2) {
    return `${user[0]}*${domain}`;
  }

  return `${user[0]}***${user[user.length - 1]}${domain}`;
}

/**
 * Masks an EPIC ID for non-privileged displays.
 * E.g. 'IND-DL-982341' -> 'IND-**-***341'
 */
export function maskEpic(epicId?: string): string {
  if (!epicId || typeof epicId !== 'string') return '';
  const trimmed = epicId.trim().toUpperCase();
  if (trimmed.includes('***') || trimmed.includes('**')) return trimmed;

  if (trimmed.length <= 4) return '****';
  const prefix = trimmed.slice(0, 3);
  const last = trimmed.slice(-3);
  return `${prefix}-**-***${last}`;
}

/**
 * Prohibited keys across any incoming client payload to prevent payload injection attacks
 * or accidental submission of raw biometrics, plaintext passwords, or bearer tokens.
 */
export const SENSITIVE_PROHIBITED_CLIENT_KEYS = [
  'rawBiometric',
  'faceImage',
  'fingerprintImage',
  'fingerprintTemplate',
  'minutiae',
  'documentImage',
  'documentScan',
  'aadhaarNumber',
  'ssn',
  'serverPrivateKey',
  'signingKey',
  'encryptionKey',
  'appEncryptionKey',
];

/**
 * Validates that an incoming request body contains no prohibited biometric payloads,
 * unencrypted raw credentials, or unexpected sensitive fields.
 */
export function validateNoProhibitedFields(
  body: unknown,
  customProhibited: string[] = SENSITIVE_PROHIBITED_CLIENT_KEYS
): { isValid: boolean; forbiddenFound: string[] } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { isValid: true, forbiddenFound: [] };
  }

  const forbiddenFound: string[] = [];
  const keys = Object.keys(body as Record<string, unknown>);

  for (const k of keys) {
    const lowerK = k.toLowerCase();
    if (
      customProhibited.some((p) => {
        const lowerP = p.toLowerCase();
        return lowerK === lowerP || lowerK.includes(lowerP);
      })
    ) {
      forbiddenFound.push(k);
    }
  }

  return {
    isValid: forbiddenFound.length === 0,
    forbiddenFound,
  };
}

/**
 * Sanitizes a VoterProfile for public or restricted displays:
 * - Omits internal server database IDs (e.g. `vpr_...`).
 * - Preserves simulationVoterId (e.g. `SIM-DL-...`).
 * - Masks contact information.
 */
export function sanitizeVoterProfileForPublicView(profile: VoterProfile): Partial<VoterProfile> {
  const { id: _internalId, createdByOfficerId: _cby, lastUpdatedByOfficerId: _lby, ...rest } = profile;
  return {
    ...rest,
    maskedMobile: maskMobile(profile.maskedMobile),
  };
}

/**
 * Sanitizes error responses and logs so no secrets, private keys, or raw tokens are printed.
 */
export function sanitizeLogData(data: any): any {
  if (!data) return data;
  if (typeof data !== 'object') return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeLogData(item));
  }

  const sanitized: Record<string, any> = {};
  const sensitiveFieldNames = [
    'password',
    'secret',
    'token',
    'sessionToken',
    'exceptionToken',
    'authorizationSignerKey',
    'privateKey',
    'rawKey',
    'encryptionKey',
    'hmacSecret',
    'signature',
    'otp',
    'code',
  ];

  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveFieldNames.some((s) => lowerKey.includes(s.toLowerCase()))) {
      sanitized[key] = '[REDACTED_SECRET]';
    } else if (typeof value === 'object' && value !== null) {
      sanitized[key] = sanitizeLogData(value);
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized;
}
