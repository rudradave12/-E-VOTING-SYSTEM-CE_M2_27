/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import crypto from 'crypto';
import { isFirebaseConfigured, getFirebaseAdminFirestore } from '../firebaseAdmin';

export interface StaffCredentialRecord {
  accountId: string;
  passwordHash: string; // scrypt$<saltHex>$<hashHex>
  salt: string;
  updatedAt: number;
  version: number;
  isPersistent: boolean;
}

// In-memory store for staff credential hashes
const inMemoryStaffCredentials = new Map<string, StaffCredentialRecord>();

const SCRYPT_KEYLEN = 64;
const SCRYPT_OPTIONS: crypto.ScryptOptions = {
  N: 16384,
  r: 8,
  p: 1,
  maxmem: 32 * 1024 * 1024,
};

/**
 * Derives a secure password hash using scrypt and a cryptographic salt.
 */
export async function hashStaffPassword(password: string): Promise<{ passwordHash: string; salt: string }> {
  const salt = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS, (err, derivedKey) => {
      if (err) return reject(err);
      const hashHex = derivedKey.toString('hex');
      const passwordHash = `scrypt$${salt}$${hashHex}`;
      resolve({ passwordHash, salt });
    });
  });
}

/**
 * Verifies a plaintext password against a stored scrypt password hash.
 */
export async function verifyStaffPasswordHash(password: string, storedHash: string): Promise<boolean> {
  try {
    const parts = storedHash.split('$');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      return false;
    }
    const salt = parts[1];
    const expectedHashHex = parts[2];
    const expectedBuf = Buffer.from(expectedHashHex, 'hex');

    return new Promise((resolve) => {
      crypto.scrypt(password, salt, SCRYPT_KEYLEN, SCRYPT_OPTIONS, (err, derivedKey) => {
        if (err) return resolve(false);
        if (derivedKey.length !== expectedBuf.length) return resolve(false);
        resolve(crypto.timingSafeEqual(derivedKey, expectedBuf));
      });
    });
  } catch {
    return false;
  }
}

/**
 * Retrieves a stored credential record for an account ID from Firestore or memory.
 */
export async function getStaffCredential(accountId: string): Promise<StaffCredentialRecord | null> {
  const cleanId = accountId.trim();

  // 1. Check in-memory cache first
  const cached = inMemoryStaffCredentials.get(cleanId);
  if (cached) return cached;

  // 2. Query Firestore if configured
  if (isFirebaseConfigured()) {
    try {
      const db = getFirebaseAdminFirestore();
      if (db) {
        const docRef = db.collection('staff_credentials').doc(cleanId);
        const snapshot = await docRef.get();
        if (snapshot.exists) {
          const data = snapshot.data() as any;
          const record: StaffCredentialRecord = {
            accountId: cleanId,
            passwordHash: data.passwordHash,
            salt: data.salt,
            updatedAt: data.updatedAt || Date.now(),
            version: data.version || 1,
            isPersistent: true,
          };
          inMemoryStaffCredentials.set(cleanId, record);
          return record;
        }
      }
    } catch (err: any) {
      console.warn(`[StaffCredentials] Notice querying Firestore for credential '${cleanId}':`, err.message);
    }
  }

  return null;
}

/**
 * Persists an updated password hash for an account ID.
 * Returns whether persistent Firestore storage was successfully updated.
 */
export async function saveStaffCredential(
  accountId: string,
  newPassword: string
): Promise<{ success: boolean; isPersistent: boolean }> {
  const cleanId = accountId.trim();
  const { passwordHash, salt } = await hashStaffPassword(newPassword);
  const now = Date.now();

  const existing = await getStaffCredential(cleanId);
  const version = (existing?.version || 0) + 1;

  let isPersistent = false;

  // Persist to Firestore if available
  if (isFirebaseConfigured()) {
    try {
      const db = getFirebaseAdminFirestore();
      if (db) {
        const docRef = db.collection('staff_credentials').doc(cleanId);
        await docRef.set({
          accountId: cleanId,
          passwordHash,
          salt,
          updatedAt: now,
          version,
        });
        isPersistent = true;
      }
    } catch (err: any) {
      console.warn(`[StaffCredentials] Failed to persist credential to Firestore for '${cleanId}':`, err.message);
    }
  }

  // Update in-memory record
  const record: StaffCredentialRecord = {
    accountId: cleanId,
    passwordHash,
    salt,
    updatedAt: now,
    version,
    isPersistent,
  };
  inMemoryStaffCredentials.set(cleanId, record);

  return { success: true, isPersistent };
}

/**
 * Clears in-memory staff credentials for test isolation.
 */
export function clearStaffCredentialsForTesting(): void {
  inMemoryStaffCredentials.clear();
}
