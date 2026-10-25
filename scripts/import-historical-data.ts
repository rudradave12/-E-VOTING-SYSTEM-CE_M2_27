#!/usr/bin/env tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BlockBallot — Historical Election Data Importer CLI
 * 
 * Usage:
 *   # Safe dry-run preview (default):
 *   tsx scripts/import-historical-data.ts --file data/historical/eci_2024_general_election.json
 * 
 *   # Explicit persistent execution:
 *   tsx scripts/import-historical-data.ts --file data/historical/eci_2024_general_election.json --persist
 * 
 * Flags:
 *   --file <path>       Path to historical dataset JSON file (required)
 *   --persist           Execute persistent writes (default is dry-run mode)
 *   --allow-updates     Permit updating existing unverified records
 *   --help              Show usage information
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { getDataRepositories } from '../server/repositories';
import { ArchiveImporterService } from '../server/services/archiveImporter';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.length === 0) {
    console.log(`
BlockBallot — Historical Election Data Archive Importer

Usage:
  tsx scripts/import-historical-data.ts --file <path> [options]

Options:
  --file <path>        Path to valid JSON dataset (required)
  --persist            Persist changes to archive store (default: dry-run only)
  --allow-updates      Permit updating non-verified existing records
  --help               Display this help text

Examples:
  # Safe Dry-Run (preview only, no modifications):
  tsx scripts/import-historical-data.ts --file data/historical/eci_2024_general_election.json

  # Persistent Import:
  tsx scripts/import-historical-data.ts --file data/historical/eci_2024_general_election.json --persist
`);
    process.exit(0);
  }

  const fileIdx = args.indexOf('--file');
  if (fileIdx === -1 || !args[fileIdx + 1]) {
    console.error('Error: --file <path> is required.');
    process.exit(1);
  }

  const rawFilePath = args[fileIdx + 1];
  const filePath = path.isAbsolute(rawFilePath)
    ? rawFilePath
    : path.resolve(process.cwd(), rawFilePath);

  const persist = args.includes('--persist');
  const allowUpdates = args.includes('--allow-updates');
  const dryRun = !persist;

  console.log('='.repeat(70));
  console.log(' BlockBallot Historical Election Archive Importer');
  console.log('='.repeat(70));
  console.log(` Target File:   ${filePath}`);
  console.log(` Mode:          ${dryRun ? 'DRY-RUN (Preview Only — No changes will be written)' : 'PERSISTENT (Writing to store)'}`);
  console.log(` Allow Updates: ${allowUpdates ? 'YES' : 'NO'}`);
  console.log('-'.repeat(70));

  const repositories = getDataRepositories();
  const archiveRepo = repositories.historicalArchive;

  if (!archiveRepo) {
    console.error('Error: Historical archive repository not initialized.');
    process.exit(1);
  }

  const importer = new ArchiveImporterService(archiveRepo);

  try {
    const summary = await importer.importDataset(filePath, {
      dryRun,
      allowUpdates,
      operatorId: 'CLI_ADMINISTRATOR',
    });

    console.log('\nImport Execution Summary:');
    console.log(`  Dataset Identifier:  ${summary.datasetIdentifier}`);
    console.log(`  Dry Run:             ${summary.dryRun ? 'YES' : 'NO'}`);
    console.log(`  Inserted:            ${summary.inserted}`);
    console.log(`  Updated:             ${summary.updated}`);
    console.log(`  Skipped (Duplicate): ${summary.skipped}`);
    console.log(`  Rejected (Errors):   ${summary.rejected}`);
    console.log(`  Overall Status:      ${summary.success ? 'SUCCESS' : 'FAILED / WARNINGS'}`);

    if (summary.conflicts.length > 0) {
      console.log('\nDetected Conflicts:');
      summary.conflicts.forEach((c) => console.log(`  [CONFLICT] ${c}`));
    }

    if (summary.errors.length > 0) {
      console.log('\nValidation & Processing Errors:');
      summary.errors.forEach((e) => console.log(`  [ERROR] ${e}`));
    }

    console.log('='.repeat(70));

    if (!summary.success) {
      process.exit(1);
    }
  } catch (err: any) {
    console.error(`\nFatal error during import: ${err.message}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled fatal error:', err);
  process.exit(1);
});
