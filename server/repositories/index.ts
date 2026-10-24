/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { isFirebaseConfigured } from '../firebaseAdmin';
import { IDataRepositories } from './types';
import { createInMemoryRepositories } from './inMemoryRepositories';
import { createFirestoreRepositories } from './firestoreRepositories';

export * from './types';
export * from './inMemoryRepositories';
export * from './firestoreRepositories';

let cachedRepositories: IDataRepositories | null = null;

/**
 * Returns the appropriate data repository suite:
 * - If Firebase Admin is configured (real credentials or Firestore emulator or test mock), returns Firestore-backed repositories.
 * - Otherwise, returns isolated in-memory repositories.
 */
export function getDataRepositories(forceInMemory = false): IDataRepositories {
  if (forceInMemory) {
    return createInMemoryRepositories();
  }
  if (!cachedRepositories) {
    if (isFirebaseConfigured()) {
      cachedRepositories = createFirestoreRepositories();
    } else {
      cachedRepositories = createInMemoryRepositories();
    }
  }
  return cachedRepositories;
}

export function resetDataRepositoriesForTesting(): void {
  cachedRepositories = null;
}
