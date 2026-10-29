/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { maskMobile } from '../security';

export interface PhoneNormalizationResult {
  isValid: boolean;
  normalized: string;
  displayMasked: string;
  isDemoFormat: boolean;
  error?: string;
}

/**
 * Normalizes phone numbers for the Indian electoral system context.
 *
 * Supported formats:
 * - Standard E.164: +919876543210
 * - Country code with spaces/hyphens: +91 98765 43210, +91-98765-43210, +91 (98765) 43210
 * - Trunk prefix 0: 09876543210
 * - Implicit country prefix 91: 919876543210
 * - Standard 10-digit mobile: 9876543210, 98765-43210
 * - Academic / Demo simulated masked format: +91 ••••• •1122, +91 98*** **345
 *
 * Rules:
 * - Resolves all formatting variations of the same 10-digit number to canonical '+91' + 10 digits.
 * - Enforces valid Indian mobile numbering plan (10 digits starting with 6, 7, 8, or 9).
 * - Distinguishes between genuinely different phone numbers.
 * - Masks sensitive digits for logging and public display.
 */
export function normalizePhoneNumber(rawPhone?: string): PhoneNormalizationResult {
  if (!rawPhone || typeof rawPhone !== 'string') {
    return {
      isValid: false,
      normalized: '',
      displayMasked: '',
      isDemoFormat: false,
      error: 'Mobile phone number is required.',
    };
  }

  const trimmed = rawPhone.trim();
  if (trimmed.length === 0) {
    return {
      isValid: false,
      normalized: '',
      displayMasked: '',
      isDemoFormat: false,
      error: 'Mobile phone number cannot be empty.',
    };
  }

  // 1. Check for Academic / Demo simulated masked format (contains •, *, or X)
  if (trimmed.includes('•') || trimmed.includes('*') || trimmed.includes('X') || trimmed.includes('x')) {
    // Extract trailing visible digits (e.g., 1122)
    const trailingMatch = trimmed.match(/(\d{2,4})$/);
    const trailingDigits = trailingMatch ? trailingMatch[1] : '1122';
    const canonicalDemoMasked = `+91 ••••• •${trailingDigits}`;
    return {
      isValid: true,
      normalized: `DEMO_PHONE_${trailingDigits}`,
      displayMasked: canonicalDemoMasked,
      isDemoFormat: true,
    };
  }

  // 2. Remove whitespace, hyphens, parentheses, and dots
  const cleaned = trimmed.replace(/[\s\-\(\)\.]/g, '');

  let digits = '';
  if (cleaned.startsWith('+91')) {
    digits = cleaned.slice(3);
  } else if (cleaned.startsWith('0091')) {
    digits = cleaned.slice(4);
  } else if (cleaned.startsWith('91') && cleaned.length === 12) {
    digits = cleaned.slice(2);
  } else if (cleaned.startsWith('0') && cleaned.length === 11) {
    digits = cleaned.slice(1);
  } else {
    digits = cleaned;
  }

  // 3. Indian mobile numbering plan validation:
  // Must be exactly 10 digits, starting with 6, 7, 8, or 9.
  if (!/^[6-9]\d{9}$/.test(digits)) {
    if (digits.length !== 10) {
      return {
        isValid: false,
        normalized: '',
        displayMasked: '',
        isDemoFormat: false,
        error: `Invalid mobile number length: Expected 10 digits, got ${digits.length}.`,
      };
    }
    return {
      isValid: false,
      normalized: '',
      displayMasked: '',
      isDemoFormat: false,
      error: 'Invalid Indian mobile number: Must start with 6, 7, 8, or 9.',
    };
  }

  const normalized = `+91${digits}`;
  const displayMasked = `+91 ••••• •${digits.slice(-4)}`;

  return {
    isValid: true,
    normalized,
    displayMasked,
    isDemoFormat: false,
  };
}
