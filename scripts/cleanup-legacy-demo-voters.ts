/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import { getFirebaseAdminFirestore, isFirebaseConfigured } from '../server/firebaseAdmin';

dotenv.config();

export interface LegacyDemoVoterRecord {
  id: string;
  epicId: string;
  name: string;
}

/**
 * Exact legacy demo voter records seeded in prior releases.
 * Only documents matching both the exact epicId and known legacy name
 * are ever targeted for migration cleanup.
 */
export const LEGACY_DEMO_VOTERS: readonly LegacyDemoVoterRecord[] = [
  { id: 'voter-01', epicId: 'IND-DL-982341', name: 'Rajesh Kumar Sharma' },
  { id: 'voter-02', epicId: 'IND-DL-339210', name: 'Priya Ananthakrishnan' },
  { id: 'voter-03', epicId: 'IND-UP-441209', name: 'Amit Vikram Singh' },
  { id: 'voter-04', epicId: 'IND-KL-772183', name: 'Anjali Mary Thomas' },
  { id: 'voter-05', epicId: 'IND-KA-550912', name: 'Karthik S. Murthy' },
  { id: 'voter-06', epicId: 'IND-DL-999000', name: 'Sunita Devi (Ineligible Test Case)' },
] as const;

export interface CleanupResult {
  mode: 'DRY_RUN' | 'EXECUTE';
  targetEnvironment: string;
  matchedCount: number;
  matchedRecords: Array<{ docId: string; epicId: string; name: string }>;
  deletedCount: number;
  skippedCount: number;
  failedCount: number;
  abortedReason?: string;
}

export async function cleanupLegacyDemoVoters(options: {
  execute?: boolean;
  confirm?: boolean;
  firestoreOverride?: any;
}): Promise<CleanupResult> {
  const isExecute = Boolean(options.execute);
  const isConfirmed = Boolean(options.confirm);

  const env = process.env.NODE_ENV || 'development';
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const targetEnv = emulatorHost
    ? `Firestore Emulator (${emulatorHost})`
    : `Cloud Firestore (NODE_ENV=${env})`;

  const result: CleanupResult = {
    mode: isExecute ? 'EXECUTE' : 'DRY_RUN',
    targetEnvironment: targetEnv,
    matchedCount: 0,
    matchedRecords: [],
    deletedCount: 0,
    skippedCount: 0,
    failedCount: 0,
  };

  // 1. Refuse destructive execution in production
  if (isExecute && (env === 'production' || process.env.APP_ENV === 'production')) {
    result.abortedReason = 'Destructive voter cleanup is strictly prohibited in production environments.';
    console.error(`[CLEANUP ERROR] ${result.abortedReason}`);
    return result;
  }

  // 2. Require explicit confirmation if execute is requested
  if (isExecute && !isConfirmed) {
    result.abortedReason =
      'Destructive execution requested without confirmation. Please supply --confirm alongside --execute.';
    console.warn(`[CLEANUP WARNING] ${result.abortedReason}`);
    return result;
  }

  // 3. Connect to Firestore
  let db: any;
  if (options.firestoreOverride) {
    db = options.firestoreOverride;
  } else {
    if (!isFirebaseConfigured() && !emulatorHost) {
      result.abortedReason =
        'Firestore is not configured. (Neither Firebase credentials nor FIRESTORE_EMULATOR_HOST are present).';
      return result;
    }
    db = getFirebaseAdminFirestore();
  }

  const legacyEpicMap = new Map(LEGACY_DEMO_VOTERS.map((v) => [v.epicId.toUpperCase(), v]));
  const legacyIdSet = new Set(LEGACY_DEMO_VOTERS.map((v) => v.id));

  try {
    const votersSnapshot = await db.collection('voters').get();

    if (votersSnapshot.empty) {
      return result;
    }

    const docsToDelete: Array<{ docId: string; epicId: string; name: string; ref: any }> = [];

    for (const doc of votersSnapshot.docs) {
      const data = doc.data();
      const epicId = (data.epicId || '').trim().toUpperCase();
      const name = (data.name || '').trim();
      const docId = doc.id;

      // Strictly match known legacy records by doc ID or (epicId AND legacy name)
      const matchedLegacy = legacyEpicMap.get(epicId);
      const isLegacyId = legacyIdSet.has(docId);

      if (matchedLegacy && (isLegacyId || name === matchedLegacy.name)) {
        docsToDelete.push({
          docId,
          epicId,
          name: name || matchedLegacy.name,
          ref: doc.ref || db.collection('voters').doc(docId),
        });
      }
    }

    result.matchedCount = docsToDelete.length;
    result.matchedRecords = docsToDelete.map((d) => ({
      docId: d.docId,
      epicId: d.epicId,
      name: d.name,
    }));

    if (!isExecute) {
      // Dry-run mode: do not delete any documents
      return result;
    }

    // Execute deletion of matched documents
    for (const item of docsToDelete) {
      try {
        await item.ref.delete();
        result.deletedCount++;
      } catch (delErr: any) {
        console.error(`[CLEANUP] Failed to delete document ${item.docId}:`, delErr.message);
        result.failedCount++;
      }
    }

    return result;
  } catch (err: any) {
    result.abortedReason = `Firestore query or delete operation failed: ${err.message}`;
    return result;
  }
}

// CLI Execution entrypoint
if (import.meta.url.endsWith(process.argv[1]) || process.argv[1]?.includes('cleanup-legacy-demo-voters')) {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');
  const confirm = args.includes('--confirm');

  console.log('==============================================================================');
  console.log(' [BlockBallot] Phase 01: Legacy Demo Voter Cleanup Migration Script');
  console.log('==============================================================================');
  console.log(` Mode:        ${execute ? (confirm ? 'EXECUTE' : 'EXECUTE (UNCONFIRMED)') : 'DRY-RUN (Default)'}`);
  console.log(` Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(` Emulator:    ${process.env.FIRESTORE_EMULATOR_HOST || 'Not active'}`);
  console.log(' Target:      Collection /voters (Exact 6 legacy demo records only)');
  console.log(' Protected:   /admins, /elections, /candidates, /constituencies, /audit_events');
  console.log('==============================================================================\n');

  cleanupLegacyDemoVoters({ execute, confirm })
    .then((res) => {
      console.log('--- Cleanup Summary ---');
      console.log(` Target Environment:  ${res.targetEnvironment}`);
      console.log(` Execution Mode:      ${res.mode}`);
      console.log(` Matched Legacy Docs: ${res.matchedCount}`);
      if (res.matchedRecords.length > 0) {
        console.log(' Matched Document Records:');
        for (const r of res.matchedRecords) {
          console.log(`   - ID: ${r.docId} | EPIC: ${r.epicId} | Name: ${r.name}`);
        }
      }
      console.log(` Deleted Records:     ${res.deletedCount}`);
      console.log(` Skipped Records:     ${res.skippedCount}`);
      console.log(` Failed Records:      ${res.failedCount}`);

      if (res.abortedReason) {
        console.log(` Notice / Status:     ${res.abortedReason}`);
      } else if (res.mode === 'DRY_RUN') {
        console.log('\n>> DRY-RUN COMPLETED: No records were deleted.');
        console.log('>> To execute deletion on Firestore emulator or dev target, run:');
        console.log('>> npm run voters:cleanup -- --execute --confirm');
      } else {
        console.log('\n>> EXECUTION COMPLETED: Legacy demo voter records safely removed.');
      }
      console.log('==============================================================================\n');
    })
    .catch((err) => {
      console.error('[CLEANUP FATAL ERROR]:', err);
      process.exit(1);
    });
}
