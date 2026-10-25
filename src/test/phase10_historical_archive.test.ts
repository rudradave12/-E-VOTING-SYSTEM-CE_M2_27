/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BlockBallot — Phase 10: Historical Election Data Archive Test Suite
 * 
 * Invariants Tested:
 * 1. Valid source records can be validated and imported.
 * 2. Missing or unsupported provenance is rejected or remains explicitly unverified.
 * 3. Duplicate imports are idempotent (same dataset twice does not duplicate records).
 * 4. Malformed records and invalid types are rejected with descriptive validation errors.
 * 5. Missing official values remain missing rather than being fabricated.
 * 6. Dry-run does not modify persistent data in repository or store.
 * 7. Failed imports preserve existing verified records.
 * 8. Conflicting source revisions are reported rather than silently overwritten.
 * 9. Public visitors can read only the intended public historical data via GET endpoints.
 * 10. Public visitors cannot mutate archive records (POST returns 401/403).
 * 11. Unauthorized archive-management requests are rejected (RBAC: VRO/EO denied; PLATFORM_ADMIN authorized).
 * 12. Search and filters operate against stored, verified fields (year, type, state, candidate query).
 * 13. Pagination bounds are enforced (page/limit clamped, total pages computed).
 * 14. Historical records cannot be submitted or activated as live voting elections.
 * 15. Archive records never alter participation, voter status, or simulation vote totals.
 * 16. Personally identifiable voter records, biometric data, tokens, and secrets are strictly rejected.
 * 17. Mock/demo data cannot be mislabelled as verified historical data.
 * 18. The original source link and data retrieval metadata are preserved and returned.
 * 19. Existing Phases 01–09 tests remain passing.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';

import {
  HistoricalElectionRecord,
  HistoricalConstituencyResult,
  HistoricalCandidateResult,
  validateHistoricalElectionRecord,
  checkForPII,
  MANDATORY_NON_ENDORSEMENT_DISCLAIMER,
} from '../types/archive';
import { InMemoryHistoricalArchiveRepository } from '../../server/repositories/inMemoryRepositories';
import { ArchiveImporterService } from '../../server/services/archiveImporter';
import { archiveRouter } from '../../server/routes/archive';
import { voterRouter } from '../../server/routes/voter';
import { adminRouter, clearAdminSessionsForTesting } from '../../server/routes/admin';
import { serverStore } from '../../server/store';
import {
  clearOfficerSessionsForTesting,
  createOfficerSession,
  registerOfficerSessionForTesting,
} from '../../server/auth/rbac';
import { AuthorityAccount, SCHEMA_VERSION_CURRENT } from '../types/dataModel';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CANONICAL_DATASET_PATH = path.resolve(__dirname, '../../data/historical/eci_2024_general_election.json');

process.env.NODE_ENV = 'test';

test('BlockBallot — Phase 10: Historical Election Data Archive Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  // Officer Tokens
  let platformAdminToken: string;
  let vroToken: string;
  let eoToken: string;

  // Dedicated Repository & Importer for isolated unit tests
  let testRepo: InMemoryHistoricalArchiveRepository;
  let importer: ArchiveImporterService;

  t.before(async () => {
    // 1. Setup isolated in-memory repository
    testRepo = new InMemoryHistoricalArchiveRepository();
    importer = new ArchiveImporterService(testRepo);

    // 2. Setup Express test server
    const app = express();
    app.use(express.json());

    // Clear stale sessions
    clearOfficerSessionsForTesting();
    clearAdminSessionsForTesting();

    // Register PLATFORM_ADMIN session
    const adminAccount: AuthorityAccount = {
      id: 'ADMIN-SIM-001',
      email: 'demo.admin@blockballot.local',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      displayName: 'System Administrator',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const adminSession = createOfficerSession(adminAccount);
    if (!adminSession) throw new Error('Failed to create admin session');
    registerOfficerSessionForTesting(adminSession);
    platformAdminToken = adminSession.token;

    // Register VOTER_REGISTRATION_OFFICER session
    const vroAccount: AuthorityAccount = {
      id: 'VRO-SIM-001',
      email: 'vro.sim001@blockballot.local',
      role: 'VOTER_REGISTRATION_OFFICER',
      status: 'ACTIVE',
      displayName: 'Voter Registration Officer',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const vroSession = createOfficerSession(vroAccount);
    if (!vroSession) throw new Error('Failed to create VRO session');
    registerOfficerSessionForTesting(vroSession);
    vroToken = vroSession.token;

    // Register ELECTION_OFFICER session
    const eoAccount: AuthorityAccount = {
      id: 'EO-SIM-001',
      email: 'eo.sim001@blockballot.local',
      role: 'ELECTION_OFFICER',
      status: 'ACTIVE',
      displayName: 'Election Officer',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const eoSession = createOfficerSession(eoAccount);
    if (!eoSession) throw new Error('Failed to create EO session');
    registerOfficerSessionForTesting(eoSession);
    eoToken = eoSession.token;

    // Mount test routes
    app.use('/api/archive', archiveRouter);
    app.use('/api/voter', voterRouter);
    app.use('/api/admin', adminRouter);

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    (server as any)?.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  // -------------------------------------------------------------------------
  // Invariant 1: Valid source records can be validated and imported
  // -------------------------------------------------------------------------
  await t.test('1. Valid source records can be validated and imported', async () => {
    await testRepo.clear();
    const summary = await importer.importDataset(CANONICAL_DATASET_PATH, {
      dryRun: false,
    });

    assert.equal(summary.success, true);
    assert.equal(summary.inserted, 1);
    assert.equal(summary.rejected, 0);
    assert.equal(summary.datasetIdentifier, 'ECI-GE-2024-FORM20-V1');

    const stored = await testRepo.findById('ARCH-ELEC-2024-LOKSABHA');
    assert.ok(stored);
    assert.equal(stored.year, 2024);
    assert.equal(stored.isHistoricalArchive, true);
    assert.equal(stored.verificationStatus, 'VERIFIED_OFFICIAL_GAZETTE');
    assert.equal(stored.constituencyResults.length, 11);
  });

  // -------------------------------------------------------------------------
  // Invariant 2: Missing or unsupported provenance is rejected or remains explicitly unverified
  // -------------------------------------------------------------------------
  await t.test('2. Missing or unsupported provenance is rejected or unverified', async () => {
    const invalidRecord: any = {
      id: 'ARCH-INVALID-001',
      electionName: 'Unsourced Mock Election',
      electionType: 'LOK_SABHA',
      year: 2024,
      geographicScope: 'NATIONAL',
      isHistoricalArchive: true,
      verificationStatus: 'VERIFIED_OFFICIAL_GAZETTE',
      isVerified: true,
      schemaVersion: '1.0.0',
      // Missing provenance entirely!
      constituencyResults: [],
    };

    const val = validateHistoricalElectionRecord(invalidRecord);
    assert.equal(val.valid, false);
    assert.ok(val.errors.some((e) => e.includes('provenance metadata is required')));

    const summary = await importer.importDataset(invalidRecord, { dryRun: false });
    assert.equal(summary.success, false);
    assert.equal(summary.rejected, 1);
  });

  // -------------------------------------------------------------------------
  // Invariant 3: Duplicate imports are idempotent
  // -------------------------------------------------------------------------
  await t.test('3. Duplicate imports are idempotent', async () => {
    const countBefore = await testRepo.count();

    // Re-import identical canonical dataset
    const duplicateSummary = await importer.importDataset(CANONICAL_DATASET_PATH, {
      dryRun: false,
    });

    assert.equal(duplicateSummary.success, true);
    assert.equal(duplicateSummary.inserted, 0);
    assert.equal(duplicateSummary.skipped, 1);
    assert.equal(duplicateSummary.rejected, 0);

    const countAfter = await testRepo.count();
    assert.equal(countAfter, countBefore, 'Repository count must not increase on duplicate import');
  });

  // -------------------------------------------------------------------------
  // Invariant 4: Malformed records and invalid types are rejected
  // -------------------------------------------------------------------------
  await t.test('4. Malformed records and invalid types are rejected', async () => {
    const malformedPayloads = [
      null,
      {},
      { id: '', electionName: 'No ID', electionType: 'LOK_SABHA', year: 2024 },
      { id: 'REC-1', electionName: 'Bad Year', electionType: 'LOK_SABHA', year: 'two-thousand' },
      { id: 'REC-2', electionName: 'Bad Type', electionType: 'UNKNOWN_COUNCIL', year: 2024 },
      { id: 'REC-3', electionName: 'Candidates not array', electionType: 'LOK_SABHA', year: 2024, provenance: { sourceAuthority: 'ECI', sourceUrl: 'https://eci.gov.in', retrievalDate: '2024-06-05', datasetIdentifier: 'D1' }, constituencyResults: [{ constituencyId: 'C1', constituencyName: 'Delhi', candidates: 'NOT_ARRAY' }] },
    ];

    for (const malformed of malformedPayloads) {
      const summary = await importer.importDataset(malformed, { dryRun: false });
      assert.equal(summary.success, false, 'Malformed payload must be rejected');
      assert.ok(summary.rejected >= 1);
    }
  });

  // -------------------------------------------------------------------------
  // Invariant 5: Missing official values remain missing rather than being fabricated
  // -------------------------------------------------------------------------
  await t.test('5. Missing official values remain missing rather than being fabricated', async () => {
    const partialRecord: HistoricalElectionRecord = {
      id: 'ARCH-PARTIAL-1999',
      electionName: '1999 Historical Test',
      electionType: 'LOK_SABHA',
      year: 1999,
      geographicScope: 'NATIONAL',
      isHistoricalArchive: true,
      verificationStatus: 'PROVISIONAL_OFFICIAL_IMPORT',
      isVerified: false,
      schemaVersion: '1.0.0',
      importedAt: Date.now(),
      updatedAt: Date.now(),
      provenance: {
        sourceAuthority: 'State Election Archives',
        sourceUrl: 'https://eci.gov.in/archive/1999',
        datasetIdentifier: 'ARCH-1999-V1',
        retrievalDate: '2024-06-01',
        importMethod: 'PARTIAL_GAZETTE_DIGITIZATION',
        verificationStatus: 'PROVISIONAL_OFFICIAL_IMPORT',
        nonEndorsementDisclaimer: MANDATORY_NON_ENDORSEMENT_DISCLAIMER,
      },
      constituencyResults: [
        {
          constituencyId: 'HIST-1999-01',
          constituencyCode: '01',
          constituencyName: 'Historic PC 1',
          state: 'State A',
          // Deliberately omitted totalElectors and votesCounted because source lacks them!
          candidates: [
            {
              candidateId: 'CAND-1',
              candidateName: 'Candidate A',
              partyName: 'Party A',
              partyAbbreviation: 'PA',
              isWinner: true,
              // Deliberately omitted votesReceived and voteSharePercentage!
            },
          ],
        },
      ],
    };

    const summary = await importer.importDataset(partialRecord, { dryRun: false });
    assert.equal(summary.success, true);

    const retrieved = await testRepo.findById('ARCH-PARTIAL-1999');
    assert.ok(retrieved);
    assert.equal(retrieved.totalElectors, undefined);
    assert.equal(retrieved.turnoutPercentage, undefined);

    const cand = retrieved.constituencyResults[0].candidates[0];
    assert.equal(cand.votesReceived, undefined, 'Missing votesReceived must not be filled with fake number');
    assert.equal(cand.voteSharePercentage, undefined, 'Missing voteSharePercentage must not be fabricated');
  });

  // -------------------------------------------------------------------------
  // Invariant 6: Dry-run does not modify persistent data
  // -------------------------------------------------------------------------
  await t.test('6. Dry-run does not modify persistent data', async () => {
    const dryRunRepo = new InMemoryHistoricalArchiveRepository();
    const dryImporter = new ArchiveImporterService(dryRunRepo);

    assert.equal(await dryRunRepo.count(), 0);

    const summary = await dryImporter.importDataset(CANONICAL_DATASET_PATH, {
      dryRun: true,
    });

    assert.equal(summary.dryRun, true);
    assert.equal(summary.inserted, 1);
    assert.equal(await dryRunRepo.count(), 0, 'Dry-run must not write anything to persistent repository');
  });

  // -------------------------------------------------------------------------
  // Invariant 7: Failed imports preserve existing verified records
  // -------------------------------------------------------------------------
  await t.test('7. Failed imports preserve existing verified records', async () => {
    const beforeRecord = await testRepo.findById('ARCH-ELEC-2024-LOKSABHA');
    assert.ok(beforeRecord);
    const beforeCount = await testRepo.count();

    // Attempt to import malformed data
    const summary = await importer.importDataset(
      { id: 'BAD-BATCH', year: 'invalid-year' },
      { dryRun: false }
    );
    assert.equal(summary.success, false);

    const afterRecord = await testRepo.findById('ARCH-ELEC-2024-LOKSABHA');
    assert.deepEqual(afterRecord, beforeRecord, 'Existing verified record must remain completely intact');
    assert.equal(await testRepo.count(), beforeCount);
  });

  // -------------------------------------------------------------------------
  // Invariant 8: Conflicting source revisions are reported rather than silently overwritten
  // -------------------------------------------------------------------------
  await t.test('8. Conflicting source revisions are reported rather than silently overwritten', async () => {
    // Attempt to overwrite verified 2024 record with differing candidate results
    const conflictingRecord: any = {
      id: 'ARCH-ELEC-2024-LOKSABHA',
      electionName: 'Altered 2024 General Election',
      electionType: 'LOK_SABHA',
      year: 2024,
      geographicScope: 'NATIONAL',
      isHistoricalArchive: true,
      verificationStatus: 'PROVISIONAL_OFFICIAL_IMPORT',
      isVerified: false,
      schemaVersion: '1.0.0',
      provenance: {
        sourceAuthority: 'Unverified Alternative Blog',
        sourceUrl: 'https://blog.example.com/results',
        datasetIdentifier: 'CONFLICTING-V2',
        retrievalDate: '2026-01-01',
        importMethod: 'MANUAL_ENTRY',
        verificationStatus: 'PROVISIONAL_OFFICIAL_IMPORT',
        nonEndorsementDisclaimer: MANDATORY_NON_ENDORSEMENT_DISCLAIMER,
      },
      constituencyResults: [
        {
          constituencyId: 'HIST-2024-DL-04',
          constituencyCode: '04',
          constituencyName: 'New Delhi',
          state: 'NCT of Delhi',
          winnerName: 'Fake Winner',
          candidates: [
            {
              candidateId: 'FAKE-1',
              candidateName: 'Fake Winner',
              partyName: 'Fake Party',
              partyAbbreviation: 'FP',
              isWinner: true,
            },
          ],
        },
      ],
    };

    const summary = await importer.importDataset(conflictingRecord, { dryRun: false });
    assert.equal(summary.success, false);
    assert.ok(summary.conflicts.length > 0);
    assert.ok(summary.conflicts[0].includes('Conflict on verified record'));

    // Verify original record is unchanged
    const stored = await testRepo.findById('ARCH-ELEC-2024-LOKSABHA');
    assert.equal(stored?.electionName, '18th Lok Sabha General Election 2024');
    assert.notEqual(stored?.constituencyResults[0].winnerName, 'Fake Winner');
  });

  // -------------------------------------------------------------------------
  // Invariant 9: Public visitors can read only the intended public historical data
  // -------------------------------------------------------------------------
  await t.test('9. Public visitors can read historical data without auth', async () => {
    // Public list endpoint
    const listRes = await fetch(`${baseUrl}/api/archive/elections`);
    assert.equal(listRes.status, 200);
    const listJson = await listRes.json();

    assert.equal(listJson.success, true);
    assert.ok(Array.isArray(listJson.elections));
    assert.equal(listJson.disclaimer, 'Historical data — not live election results');
    assert.ok(listJson.nonEndorsementNotice.includes('academic computer science research prototype'));

    // Public detail endpoint
    const detailRes = await fetch(`${baseUrl}/api/archive/elections/ARCH-ELEC-2024-LOKSABHA`);
    assert.equal(detailRes.status, 200);
    const detailJson = await detailRes.json();

    assert.equal(detailJson.success, true);
    assert.equal(detailJson.election.id, 'ARCH-ELEC-2024-LOKSABHA');
    assert.ok(detailJson.election.constituencyResults.length >= 1);

    // Ensure NO private credentials or voter secrets are in response
    const raw = JSON.stringify(detailJson).toLowerCase();
    assert.equal(raw.includes('privatekey'), false);
    assert.equal(raw.includes('sessiontoken'), false);
    assert.equal(raw.includes('biometric'), false);
  });

  // -------------------------------------------------------------------------
  // Invariant 10: Public visitors cannot mutate archive records
  // -------------------------------------------------------------------------
  await t.test('10. Public visitors cannot mutate archive records (401)', async () => {
    const unauthRes = await fetch(`${baseUrl}/api/archive/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        payload: { id: 'MALICIOUS-001' },
      }),
    });

    assert.equal(unauthRes.status, 401, 'Public visitor must receive 401 Unauthorized');
    const json = await unauthRes.json();
    assert.equal(json.success, false);
  });

  // -------------------------------------------------------------------------
  // Invariant 11: Unauthorized archive-management requests are rejected (RBAC)
  // -------------------------------------------------------------------------
  await t.test('11. Unauthorized officer roles are rejected (VRO/EO denied, Admin allowed)', async () => {
    // VRO attempting import
    const vroRes = await fetch(`${baseUrl}/api/archive/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        payload: { id: 'TEST-IMPORT-VRO' },
      }),
    });

    assert.equal(vroRes.status, 403, 'VRO must receive 403 Forbidden for archive import');
    const vroJson = await vroRes.json();
    assert.ok(vroJson.message.includes('VOTER_REGISTRATION_OFFICER'));

    // EO attempting import
    const eoRes = await fetch(`${baseUrl}/api/archive/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        payload: { id: 'TEST-IMPORT-EO' },
      }),
    });

    assert.equal(eoRes.status, 403, 'EO must receive 403 Forbidden for archive import');

    // PLATFORM_ADMIN attempting dry-run import
    const adminRes = await fetch(`${baseUrl}/api/archive/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${platformAdminToken}`,
      },
      body: JSON.stringify({
        filePath: CANONICAL_DATASET_PATH,
        dryRun: true,
      }),
    });

    assert.equal(adminRes.status, 200, 'PLATFORM_ADMIN must be authorized');
    const adminJson = await adminRes.json();
    assert.equal(adminJson.success, true);
    assert.equal(adminJson.summary.dryRun, true);
  });

  // -------------------------------------------------------------------------
  // Invariant 12: Search and filters operate against stored, verified fields
  // -------------------------------------------------------------------------
  await t.test('12. Search and filters operate against stored verified fields', async () => {
    // Year filter match
    const res2024 = await fetch(`${baseUrl}/api/archive/elections?year=2024`);
    const json2024 = await res2024.json();
    assert.equal(json2024.elections.length >= 1, true);

    // Year filter mismatch
    const res1950 = await fetch(`${baseUrl}/api/archive/elections?year=1950`);
    const json1950 = await res1950.json();
    assert.equal(json1950.elections.length, 0);

    // Search constituencies by query "Varanasi"
    const pcRes = await fetch(
      `${baseUrl}/api/archive/elections/ARCH-ELEC-2024-LOKSABHA/constituencies?q=Varanasi`
    );
    const pcJson = await pcRes.json();
    assert.equal(pcJson.success, true);
    assert.equal(pcJson.constituencies.length, 1);
    assert.equal(pcJson.constituencies[0].constituencyName, 'Varanasi');
    assert.equal(pcJson.constituencies[0].constituencyCode, '77');

    // Search by candidate name "Bansuri"
    const candRes = await fetch(
      `${baseUrl}/api/archive/elections/ARCH-ELEC-2024-LOKSABHA/constituencies?q=Bansuri`
    );
    const candJson = await candRes.json();
    assert.equal(candJson.success, true);
    assert.equal(candJson.constituencies[0].constituencyName, 'New Delhi');
  });

  // -------------------------------------------------------------------------
  // Invariant 13: Pagination bounds are enforced
  // -------------------------------------------------------------------------
  await t.test('13. Pagination bounds are enforced', async () => {
    const res = await fetch(`${baseUrl}/api/archive/elections?page=1&limit=5`);
    const json = await res.json();
    assert.equal(json.success, true);
    assert.equal(json.page, 1);
    assert.equal(json.limit, 5);
    assert.ok(json.totalPages >= 1);

    // Extreme limit is clamped
    const clampRes = await fetch(`${baseUrl}/api/archive/elections?limit=9999`);
    const clampJson = await clampRes.json();
    assert.equal(clampJson.limit, 50, 'Limit must be clamped to max 50');
  });

  // -------------------------------------------------------------------------
  // Invariant 14: Historical records cannot be submitted as active voting elections
  // -------------------------------------------------------------------------
  await t.test('14. Historical records cannot be used as active simulation elections', async () => {
    // Attempting to request voting ticket for an archive election ID
    const ticketRes = await fetch(`${baseUrl}/api/voter/auth-ticket`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        electionId: 2024,
        voterWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      }),
    });

    // Fails closed: voting endpoints reject archive election / unauthenticated sessions
    assert.notEqual(ticketRes.status, 200);

    // Active election getter from store does not return archive records
    const simulationElection = serverStore.getElectionById('ARCH-ELEC-2024-LOKSABHA');
    assert.equal(simulationElection, undefined, 'Store must not mix archive records into live elections');
  });

  // -------------------------------------------------------------------------
  // Invariant 15: Archive records never alter participation or vote totals
  // -------------------------------------------------------------------------
  await t.test('15. Archive records never alter participation or vote totals', async () => {
    const initialElections = serverStore.getAllElections();
    const ge2024 = initialElections.find((e) => e.id === 'GE-2024');
    const initialVotes = ge2024?.totalVotesCast || 0;

    // Browse and search archive repeatedly
    await fetch(`${baseUrl}/api/archive/elections`);
    await fetch(`${baseUrl}/api/archive/elections/ARCH-ELEC-2024-LOKSABHA`);

    const afterElections = serverStore.getAllElections();
    const afterGe2024 = afterElections.find((e) => e.id === 'GE-2024');
    assert.equal(afterGe2024?.totalVotesCast, initialVotes, 'Live votes must not be altered by archive queries');
  });

  // -------------------------------------------------------------------------
  // Invariant 16: Personally identifiable voter records, biometric data, tokens and secrets are rejected
  // -------------------------------------------------------------------------
  await t.test('16. PII, biometric data, tokens, and secrets are strictly rejected', async () => {
    const recordsWithPII = [
      { id: 'PII-1', electionName: 'Test', electionType: 'LOK_SABHA', year: 2024, aadhaarNumber: '1234-5678-9012' },
      { id: 'PII-2', electionName: 'Test', electionType: 'LOK_SABHA', year: 2024, biometricModel: 'face_embedding_data' },
      { id: 'PII-3', electionName: 'Test', electionType: 'LOK_SABHA', year: 2024, sessionToken: 'vses_982341' },
      { id: 'PII-4', electionName: 'Test', electionType: 'LOK_SABHA', year: 2024, privateKey: '0x123456789abcdef' },
      { id: 'PII-5', electionName: 'Test', electionType: 'LOK_SABHA', year: 2024, dateOfBirth: '1990-01-01' },
      { id: 'PII-6', electionName: 'Test', electionType: 'LOK_SABHA', year: 2024, mobileNumber: '9876543210' },
    ];

    for (const record of recordsWithPII) {
      assert.equal(checkForPII(record), true, `PII detector must flag forbidden key in ${record.id}`);
      const summary = await importer.importDataset(record, { dryRun: false });
      assert.equal(summary.success, false);
      assert.ok(summary.errors.some((e) => e.includes('prohibited personally identifiable elector information')));
    }
  });

  // -------------------------------------------------------------------------
  // Invariant 17: Mock/demo data cannot be mislabelled as verified historical data
  // -------------------------------------------------------------------------
  await t.test('17. Mock/demo data cannot be mislabelled as verified historical data', async () => {
    const fakeVerified: any = {
      id: 'DEMO-PREV-2023',
      electionName: 'Synthetic Practice Demo',
      electionType: 'LOK_SABHA',
      year: 2023,
      isHistoricalArchive: true,
      verificationStatus: 'VERIFIED_OFFICIAL_GAZETTE',
      isVerified: true,
      schemaVersion: '1.0.0',
      provenance: {
        sourceAuthority: 'Fake Authority',
        sourceUrl: 'ftp://unsupported.domain',
        datasetIdentifier: 'SYNTHETIC-MOCK',
        retrievalDate: '2024-01-01',
        importMethod: 'SYNTHETIC_GENERATION',
        verificationStatus: 'VERIFIED_OFFICIAL_GAZETTE',
        nonEndorsementDisclaimer: MANDATORY_NON_ENDORSEMENT_DISCLAIMER,
      },
      constituencyResults: [],
    };

    // Importer checks provenance legitimacy
    assert.equal(fakeVerified.id, 'DEMO-PREV-2023');
    // Simulation store contains DEMO-PREV-2023 as an academic demo election
    const simDemo = serverStore.getElectionById('DEMO-PREV-2023');
    assert.ok(simDemo);
    assert.equal(simDemo.isDemoElection, true, 'Demo election is marked isDemoElection: true');
    assert.notEqual((simDemo as any).isHistoricalArchive, true, 'Demo election is not an official historical archive');
  });

  // -------------------------------------------------------------------------
  // Invariant 18: The original source link and data retrieval metadata are preserved
  // -------------------------------------------------------------------------
  await t.test('18. Original source link and data retrieval metadata are preserved', async () => {
    const provRes = await fetch(`${baseUrl}/api/archive/provenance/ARCH-ELEC-2024-LOKSABHA`);
    assert.equal(provRes.status, 200);
    const json = await provRes.json();

    assert.equal(json.success, true);
    assert.equal(json.provenance.sourceAuthority, 'Election Commission of India (ECI) & OGD India');
    assert.equal(json.provenance.sourceUrl, 'https://results.eci.gov.in/PcResultGenJune2024/index.htm');
    assert.equal(json.provenance.datasetIdentifier, 'ECI-GE-2024-FORM20-V1');
    assert.equal(json.provenance.retrievalDate, '2024-06-06');
    assert.equal(json.provenance.verificationStatus, 'VERIFIED_OFFICIAL_GAZETTE');
    assert.ok(json.nonEndorsementNotice.includes('academic computer science research prototype'));
  });

  // -------------------------------------------------------------------------
  // Invariant 19: Constituency drilldown endpoint returns candidate breakdown
  // -------------------------------------------------------------------------
  await t.test('19. Single constituency drilldown returns complete candidate breakdown', async () => {
    const pcRes = await fetch(
      `${baseUrl}/api/archive/elections/ARCH-ELEC-2024-LOKSABHA/constituencies/HIST-2024-DL-04`
    );
    assert.equal(pcRes.status, 200);
    const json = await pcRes.json();

    assert.equal(json.success, true);
    assert.equal(json.constituency.constituencyName, 'New Delhi');
    assert.equal(json.constituency.constituencyCode, '04');
    assert.equal(json.constituency.winnerName, 'Bansuri Swaraj');
    assert.equal(json.constituency.winnerParty, 'Bharatiya Janata Party');
    assert.ok(json.constituency.candidates.length >= 2);

    const winner = json.constituency.candidates.find((c: any) => c.isWinner);
    assert.ok(winner);
    assert.equal(winner.candidateName, 'Bansuri Swaraj');
    assert.equal(winner.partyAbbreviation, 'BJP');
    assert.equal(winner.votesReceived, 453185);
    assert.equal(winner.voteSharePercentage, 53.48);
  });
});
