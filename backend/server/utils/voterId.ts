/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { IVoterProfileRepository } from '../repositories/types';

/**
 * BlockBallot Simulation Voter ID Utilities
 *
 * Format: BBV-SIM-<8-character uppercase alphanumeric token>
 * Example: BBV-SIM-7K9M2X4W
 *
 * Requirements:
 * - Cryptographically random (using Node.js crypto)
 * - Exclusively generated on the server
 * - Clearly distinguished from real Indian ECI EPIC format (3 letters + 7 digits)
 * - Collisions handled with retry
 */

// Crockford-style uppercase alphanumeric character set without ambiguous characters (no 0, O, 1, I)
const SIM_ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Generates a cryptographically random simulation voter ID string.
 */
export function generateSimulationVoterId(): string {
  const bytes = crypto.randomBytes(8);
  let token = '';
  for (let i = 0; i < 8; i++) {
    token += SIM_ID_ALPHABET[bytes[i] % SIM_ID_ALPHABET.length];
  }
  return `BBV-SIM-${token}`;
}

/**
 * Validates whether an identifier conforms to the simulation voter ID pattern.
 */
export function isValidSimulationVoterId(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^BBV-SIM-[A-Z0-9]{6,16}$/.test(id.trim().toUpperCase());
}

/**
 * Checks whether an identifier matches real Indian ECI EPIC format.
 * (3 uppercase letters followed by 7 digits, e.g. ABC1234567)
 */
export function isRealEpicFormat(id: string): boolean {
  if (!id || typeof id !== 'string') return false;
  return /^[A-Z]{3}[0-9]{7}$/.test(id.trim().toUpperCase());
}

/**
 * Calculates canonical age in full years from an ISO 8601 date string (YYYY-MM-DD).
 */
export function calculateAgeFromDob(dateOfBirth: string): number {
  if (!dateOfBirth || !/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
    return -1;
  }
  const dob = new Date(dateOfBirth);
  if (isNaN(dob.getTime())) return -1;

  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) {
    age--;
  }
  return age;
}

/**
 * Generates a unique simulation voter ID, querying the repository to guarantee
 * non-collision with persistent records. Retries up to `maxAttempts` times.
 */
export async function generateUniqueSimulationVoterId(
  repo: IVoterProfileRepository,
  maxAttempts = 5
): Promise<string> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const candidate = generateSimulationVoterId();

    // Verify it does not collide with real EPIC format
    if (isRealEpicFormat(candidate)) {
      continue;
    }

    // Check persistence repository
    const existing = await repo.findBySimulationId(candidate);
    if (!existing) {
      return candidate;
    }
  }

  throw new Error('Collision exhaustion: unable to generate unique simulation voter ID after multiple attempts');
}
