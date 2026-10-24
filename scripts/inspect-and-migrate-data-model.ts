/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import dotenv from 'dotenv';
import { getFirebaseAdminFirestore, isFirebaseConfigured } from '../server/firebaseAdmin';
import {
  VoterProfile,
  VoterElectionParticipation,
  SCHEMA_VERSION_CURRENT,
  SCHEMA_VERSION_LEGACY,
  validateVoterProfile,
  validateElectionParticipation,
} from '../src/types/dataModel';

dotenv.config();

export interface MigrationOptions {
  execute?: boolean;
  confirm?: boolean;
  firestoreOverride?: any;
}

export interface SchemaInspectionReport {
  mode: 'DRY_RUN' | 'EXECUTE';
  targetEnvironment: string;
  scannedCount: number;
  legacyCount: number;
  currentV2Count: number;
  anomalies: string[];
  migratedCount: number;
  skippedCount: number;
  failedCount: number;
  abortedReason?: string;
  plan: Array<{
    sourceDocId: string;
    legacyEpic: string;
    targetProfileId: string;
    targetSimulationId: string;
    action: 'MIGRATE' | 'SKIP_ALREADY_MIGRATED' | 'FAIL_INVALID';
    reason?: string;
  }>;
}

/**
 * Transforms a legacy 1.0 voter record into a validated 2.0 VoterProfile.
 */
export function transformLegacyVoterToV2Profile(legacy: any): {
  profile: VoterProfile | null;
  errors: string[];
} {
  const errors: string[] = [];

  if (!legacy || typeof legacy !== 'object') {
    return { profile: null, errors: ['Legacy record must be an object'] };
  }

  const epicId = (legacy.epicId || '').trim().toUpperCase();
  if (!epicId) {
    errors.push('Missing epicId in legacy record');
  }

  const fullName = (legacy.name || '').trim();
  if (!fullName) {
    errors.push('Missing name in legacy record');
  }

  // Derive stable simulation voter ID (e.g. SIM-LEGACY-...)
  const simulationVoterId = `SIM-${epicId.replace(/[^A-Z0-9]/g, '-')}`;

  // Estimate a valid birth date from age if present, else fallback to standard eligible age (18+)
  const age = typeof legacy.age === 'number' && legacy.age > 0 ? legacy.age : 30;
  const birthYear = new Date().getFullYear() - age;
  const dateOfBirth = `${birthYear}-01-01`;

  const profileId = legacy.id ? `vpr_${legacy.id}` : `vpr_${epicId.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;

  const profile: VoterProfile = {
    id: profileId,
    simulationVoterId,
    legacyEpicId: epicId,
    fullName,
    dateOfBirth,
    gender: ['M', 'F', 'O'].includes(legacy.gender) ? legacy.gender : 'O',
    state: legacy.state || 'Delhi',
    district: legacy.district || 'New Delhi',
    constituencyId: legacy.constituencyId || 'CONST-04-ND',
    pollingStation: legacy.pollingStation || 'Polling Station 101, New Delhi',
    maskedMobile: legacy.maskedMobile || '+91 98XXX-XX000',
    registrationStatus: 'REGISTERED',
    eligibilityStatus: legacy.isEligible === false ? 'INELIGIBLE_DISQUALIFIED' : 'ELIGIBLE',
    lifecycleStatus: 'ACTIVE',
    createdAt: legacy.createdAt || Date.now(),
    updatedAt: Date.now(),
    schemaVersion: SCHEMA_VERSION_CURRENT,
  };

  const validation = validateVoterProfile(profile);
  if (!validation.isValid) {
    return { profile: null, errors: validation.errors };
  }

  return { profile, errors: [] };
}

/**
 * Inspects existing voter records and produces a dry-run inspection report
 * or executes a safe, non-destructive migration to Phase 02 collections.
 */
export async function inspectAndMigrateDataModel(options: MigrationOptions = {}): Promise<SchemaInspectionReport> {
  const isExecute = Boolean(options.execute);
  const isConfirmed = Boolean(options.confirm);

  const env = process.env.NODE_ENV || 'development';
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
  const targetEnv = emulatorHost
    ? `Firestore Emulator (${emulatorHost})`
    : `Cloud Firestore (NODE_ENV=${env})`;

  const report: SchemaInspectionReport = {
    mode: isExecute ? 'EXECUTE' : 'DRY_RUN',
    targetEnvironment: targetEnv,
    scannedCount: 0,
    legacyCount: 0,
    currentV2Count: 0,
    anomalies: [],
    migratedCount: 0,
    skippedCount: 0,
    failedCount: 0,
    plan: [],
  };

  // Safeguard: refuse destructive execution in production
  if (isExecute && (env === 'production' || process.env.APP_ENV === 'production')) {
    report.abortedReason = 'Data migration execution is strictly prohibited in production mode without manual approval.';
    console.error(`[MIGRATION ERROR] ${report.abortedReason}`);
    return report;
  }

  // Safeguard: require confirmation for execution
  if (isExecute && !isConfirmed) {
    report.abortedReason = 'Execution mode requested without confirmation flag. Please specify --confirm alongside --execute.';
    console.warn(`[MIGRATION WARNING] ${report.abortedReason}`);
    return report;
  }

  let db: any;
  if (options.firestoreOverride) {
    db = options.firestoreOverride;
  } else if (isFirebaseConfigured()) {
    db = getFirebaseAdminFirestore();
  } else {
    report.abortedReason = 'Firebase Admin credentials or emulator host not configured. Migration halted.';
    console.log(`[MIGRATION NOTICE] ${report.abortedReason}`);
    return report;
  }

  try {
    // 1. Scan legacy voters collection
    const votersSnap = await db.collection('voters').get();
    report.scannedCount = votersSnap.size;

    const seenEpics = new Set<string>();

    for (const doc of votersSnap.docs) {
      const data = doc.data();
      const docId = doc.id;

      // Check schema version
      if (data.schemaVersion === SCHEMA_VERSION_CURRENT) {
        report.currentV2Count++;
        report.skippedCount++;
        report.plan.push({
          sourceDocId: docId,
          legacyEpic: data.epicId || docId,
          targetProfileId: data.id || docId,
          targetSimulationId: data.simulationVoterId || '',
          action: 'SKIP_ALREADY_MIGRATED',
          reason: 'Record already on schema version 2.0',
        });
        continue;
      }

      report.legacyCount++;

      // Anomaly detection: duplicate EPIC ID
      const epic = (data.epicId || '').trim().toUpperCase();
      if (seenEpics.has(epic)) {
        report.anomalies.push(`Duplicate legacy EPIC ID detected in document '${docId}': ${epic}`);
      } else if (epic) {
        seenEpics.add(epic);
      } else {
        report.anomalies.push(`Document '${docId}' is missing required field 'epicId'`);
      }

      // Check transformation feasibility
      const { profile, errors } = transformLegacyVoterToV2Profile(data);
      if (!profile) {
        report.failedCount++;
        report.anomalies.push(`Validation failure on legacy document '${docId}': ${errors.join(', ')}`);
        report.plan.push({
          sourceDocId: docId,
          legacyEpic: epic,
          targetProfileId: '',
          targetSimulationId: '',
          action: 'FAIL_INVALID',
          reason: errors.join('; '),
        });
        continue;
      }

      // Record is valid for migration
      report.plan.push({
        sourceDocId: docId,
        legacyEpic: epic,
        targetProfileId: profile.id,
        targetSimulationId: profile.simulationVoterId,
        action: 'MIGRATE',
      });

      // 2. If execution mode is confirmed, perform safe non-destructive save into new collections
      if (isExecute) {
        // Write to voter_profiles without deleting from voters
        await db.collection('voter_profiles').doc(profile.id).set(profile, { merge: true });

        // Create default election participation record if legacy record had a status
        const defaultElectionId = 'GE-2024';
        const partId = `${profile.id}_${defaultElectionId}`;
        const participation: VoterElectionParticipation = {
          id: partId,
          voterId: profile.id,
          electionId: defaultElectionId,
          status: data.status === 'VOTED' ? 'VOTE_ACCEPTED' : 'ELIGIBLE',
          votedAt: data.votedAt || (data.status === 'VOTED' ? Date.now() : undefined),
          createdAt: profile.createdAt,
          updatedAt: Date.now(),
          schemaVersion: SCHEMA_VERSION_CURRENT,
        };
        await db.collection('voter_election_participation').doc(partId).set(participation, { merge: true });

        report.migratedCount++;
      }
    }
  } catch (err: any) {
    report.abortedReason = `Migration inspection failed due to database error: ${err.message}`;
    console.error(`[MIGRATION ERROR] ${report.abortedReason}`);
  }

  return report;
}

// CLI Execution entrypoint
if (process.argv[1] && process.argv[1].endsWith('inspect-and-migrate-data-model.ts')) {
  const args = process.argv.slice(2);
  const isExecute = args.includes('--execute');
  const isConfirm = args.includes('--confirm');

  console.log(`\n======================================================`);
  console.log(`  BlockBallot — Phase 02 Data Model Inspection & Migration`);
  console.log(`======================================================`);
  console.log(`Mode:    ${isExecute ? 'EXECUTE (Destructive changes to new collections)' : 'DRY RUN (Read-Only Inspection)'}`);
  console.log(`Confirm: ${isConfirm ? 'YES' : 'NO'}\n`);

  inspectAndMigrateDataModel({ execute: isExecute, confirm: isConfirm }).then((report) => {
    console.log(`Target Environment: ${report.targetEnvironment}`);
    console.log(`Total Scanned:      ${report.scannedCount}`);
    console.log(`Legacy 1.0 Records: ${report.legacyCount}`);
    console.log(`Current 2.0 Records:${report.currentV2Count}`);
    console.log(`Anomalies Found:    ${report.anomalies.length}`);
    if (report.anomalies.length > 0) {
      report.anomalies.forEach((a) => console.log(`  - ${a}`));
    }
    console.log(`Migrated:           ${report.migratedCount}`);
    console.log(`Skipped:            ${report.skippedCount}`);
    console.log(`Failed:             ${report.failedCount}`);
    if (report.abortedReason) {
      console.log(`Notice / Aborted:   ${report.abortedReason}`);
    }
    console.log(`\nDry Run Plan Summary (first 10 items):`);
    report.plan.slice(0, 10).forEach((p, idx) => {
      console.log(`  [${idx + 1}] Doc: ${p.sourceDocId} (${p.legacyEpic}) -> ${p.action} [Target: ${p.targetProfileId || 'N/A'}]`);
    });
    console.log(`======================================================\n`);
  });
}
