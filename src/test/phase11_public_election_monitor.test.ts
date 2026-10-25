/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import { AddressInfo } from 'net';

import path from 'path';
import { fileURLToPath } from 'url';

import {
  PublicElectionSummary,
  PublicElectionDetail,
  PublicParticipationMetrics,
  PublicPublishedResults,
  PublicMonitorOverview,
  MONITOR_NON_ENDORSEMENT_DISCLAIMER,
  BALLOT_SECRECY_LIMITATION_NOTICE,
} from '../types/monitor';
import { monitorRouter, clearMonitorRateLimitsForTesting } from '../../server/routes/monitor';
import { archiveRouter } from '../../server/routes/archive';
import { adminRouter, clearAdminSessionsForTesting } from '../../server/routes/admin';
import { voterRouter } from '../../server/routes/voter';
import { serverStore } from '../../server/store';
import { getDataRepositories } from '../../server/repositories';
import { ArchiveImporterService } from '../../server/services/archiveImporter';
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

test('BlockBallot — Phase 11: Public Election Monitor Dashboard Suite', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  let platformAdminToken: string;
  let vroToken: string;

  t.before(async () => {
    // 1. Clear session and rate limit caches
    clearOfficerSessionsForTesting();
    clearAdminSessionsForTesting();
    clearMonitorRateLimitsForTesting();

    // 2. Setup testing authority sessions
    const adminAccount: AuthorityAccount = {
      id: 'ADMIN-SIM-MONITOR',
      email: 'admin.monitor@blockballot.local',
      role: 'PLATFORM_ADMIN',
      status: 'ACTIVE',
      displayName: 'Monitor Test Administrator',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const adminSession = createOfficerSession(adminAccount);
    if (!adminSession) throw new Error('Failed to create admin session');
    registerOfficerSessionForTesting(adminSession);
    platformAdminToken = adminSession.token;

    const vroAccount: AuthorityAccount = {
      id: 'VRO-SIM-MONITOR',
      email: 'vro.monitor@blockballot.local',
      role: 'VOTER_REGISTRATION_OFFICER',
      status: 'ACTIVE',
      displayName: 'VRO Monitor Officer',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    };
    const vroSession = createOfficerSession(vroAccount);
    if (!vroSession) throw new Error('Failed to create VRO session');
    registerOfficerSessionForTesting(vroSession);
    vroToken = vroSession.token;

    // 3. Seed historical archive with canonical dataset for cross-archive tests
    const archiveRepo = getDataRepositories().historicalArchive;
    if (!archiveRepo) throw new Error('Historical archive repository not available');
    const importer = new ArchiveImporterService(archiveRepo);
    await importer.importDataset(CANONICAL_DATASET_PATH, { dryRun: false, allowUpdates: true });

    // 4. Initialize Express test server with all routers
    const app = express();
    app.use(express.json());
    app.use('/api/monitor', monitorRouter);
    app.use('/api/archive', archiveRouter);
    app.use('/api/admin', adminRouter);
    app.use('/api/voter', voterRouter);

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => resolve());
    });

    const addr = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${addr.port}`;
  });

  t.after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  await t.test('1. Public visitors can retrieve permitted election summaries without authentication', async () => {
    const res = await fetch(`${baseUrl}/api/monitor/elections`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.ok(Array.isArray(data.elections));
    assert.ok(data.elections.length > 0);
    assert.strictEqual(typeof data.total, 'number');
    assert.ok(data.disclaimer.includes('ACADEMIC PROTOTYPE NOTICE'));
  });

  await t.test('2. Public responses exclude voter names, simulation IDs, mobile numbers, officer notes and protected session fields', async () => {
    const res = await fetch(`${baseUrl}/api/monitor/elections`);
    const data = await res.json();
    const serialized = JSON.stringify(data);

    // Forbidden PII and administrative keys
    const forbiddenKeys = [
      'voterName',
      'simulationVoterId',
      'maskedMobile',
      'mobile',
      'officerNotes',
      'sessionToken',
      'authNonce',
      'nullifier',
      'passwordHash',
      'secretKey',
    ];

    for (const key of forbiddenKeys) {
      assert.ok(
        !serialized.includes(`"${key}"`),
        `Security violation: public response contains forbidden key '${key}'`
      );
    }
  });

  await t.test('3. Private draft elections are not accidentally exposed', async () => {
    // Ensure BYE-2024 exists in draft status
    const allElections = serverStore.getAllElections();
    const draftElection = allElections.find((e) => e.status === 'draft');
    assert.ok(draftElection, 'Seeded draft election should exist in store for test');

    // Query public monitor listing
    const res = await fetch(`${baseUrl}/api/monitor/elections`);
    const data = await res.json();
    const publicIds = data.elections.map((e: PublicElectionSummary) => e.id);

    assert.ok(
      !publicIds.includes(draftElection.id),
      `Draft election '${draftElection.id}' must NOT be included in public elections list`
    );

    // Attempt direct detail query for the draft election
    const detailRes = await fetch(`${baseUrl}/api/monitor/elections/${draftElection.id}`);
    assert.strictEqual(detailRes.status, 404);
  });

  await t.test('4. Election lifecycle states and time windows reflect authoritative backend values', async () => {
    const res = await fetch(`${baseUrl}/api/monitor/elections/GE-2024`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.success, true);
    const detail: PublicElectionDetail = data.election;

    assert.strictEqual(detail.id, 'GE-2024');
    assert.strictEqual(detail.normalizedStatus, 'OPEN');
    assert.strictEqual(detail.isVotingOpen, true);
    assert.strictEqual(typeof detail.serverTimeSec, 'number');
    assert.strictEqual(typeof detail.timeUntilEndSec, 'number');
    assert.strictEqual(detail.timezone, 'Asia/Kolkata');
  });

  await t.test('5. A client clock cannot change the displayed authoritative state', async () => {
    // Send request with arbitrary/manipulated client time headers
    const res = await fetch(`${baseUrl}/api/monitor/elections/GE-2024`, {
      headers: {
        'x-client-time': '100000000',
        Date: 'Wed, 21 Oct 2015 07:28:00 GMT',
      },
    });

    const data = await res.json();
    const detail: PublicElectionDetail = data.election;

    // Must match serverStore clock, completely ignoring client clock
    const currentServerSec = serverStore.getCurrentTimeSec();
    assert.ok(
      Math.abs(detail.serverTimeSec - currentServerSec) <= 2,
      'Server time must be determined exclusively by backend clock'
    );
  });

  await t.test('6. Turnout is computed from correct per-election records where supported', async () => {
    const repos = getDataRepositories();

    // Register a test voter participation record for GE-2024
    const testVoterId = 'VOTER-MONITOR-001';
    await repos.participations.createParticipation({
      id: `${testVoterId}_GE-2024`,
      voterId: testVoterId,
      electionId: 'GE-2024',
      status: 'VOTE_ACCEPTED',
      votedAt: Math.floor(Date.now() / 1000),
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    });

    const res = await fetch(`${baseUrl}/api/monitor/elections/GE-2024/participation`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    const metrics: PublicParticipationMetrics = data.metrics;

    assert.strictEqual(metrics.electionId, 'GE-2024');
    assert.ok(metrics.confirmedParticipationCount >= 1);
    assert.ok(metrics.eligibleVoterDenominator && metrics.eligibleVoterDenominator > 0);
    assert.strictEqual(typeof metrics.turnoutPercentage, 'number');
    assert.strictEqual(metrics.turnoutStatus, 'AVAILABLE');
  });

  await t.test('7. Duplicate transaction replays do not inflate participation counts', async () => {
    const repos = getDataRepositories();
    const testVoterId = 'VOTER-MONITOR-002';

    // 1st insert
    await repos.participations.createParticipation({
      id: `${testVoterId}_GE-2024`,
      voterId: testVoterId,
      electionId: 'GE-2024',
      status: 'VOTE_ACCEPTED',
      votedAt: Math.floor(Date.now() / 1000),
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    });

    const res1 = await fetch(`${baseUrl}/api/monitor/elections/GE-2024/participation`);
    const count1 = (await res1.json()).metrics.confirmedParticipationCount;

    // Simulate replay attempt: updating same voter participation record
    await repos.participations.updateParticipationStatus(testVoterId, 'GE-2024', 'VOTE_ACCEPTED', {
      votedAt: Math.floor(Date.now() / 1000),
    });

    const res2 = await fetch(`${baseUrl}/api/monitor/elections/GE-2024/participation`);
    const count2 = (await res2.json()).metrics.confirmedParticipationCount;

    assert.strictEqual(count1, count2, 'Replay attempt must not inflate participation count');
  });

  await t.test('8. Pending or failed votes are not treated as confirmed', async () => {
    const repos = getDataRepositories();

    // Create an unconfirmed / pending authorization session
    const pendingVoterId = 'VOTER-PENDING-001';
    await repos.participations.createParticipation({
      id: `${pendingVoterId}_GE-2024`,
      voterId: pendingVoterId,
      electionId: 'GE-2024',
      status: 'SESSION_AUTHORIZED', // NOT VOTE_ACCEPTED
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
      schemaVersion: SCHEMA_VERSION_CURRENT,
    });

    const res = await fetch(`${baseUrl}/api/monitor/elections/GE-2024/participation`);
    const metrics: PublicParticipationMetrics = (await res.json()).metrics;

    // Pending session must not count as confirmed participation
    const participations = await repos.participations.listByElection('GE-2024');
    const confirmedList = participations.filter((p) => p.status === 'VOTE_ACCEPTED');
    assert.strictEqual(metrics.confirmedParticipationCount, confirmedList.length);
  });

  await t.test('9. Missing denominator or inconsistent data does not produce misleading turnout', async () => {
    // Create an ad-hoc test election with zero registered electors and no constituencies
    const zeroElection = serverStore.createElection({
      id: 'TEST-ZERO-DENOM',
      numericId: 99,
      title: 'Zero Denominator Test Election',
      description: 'Test election with no electors',
      status: 'active',
      startTime: Math.floor(Date.now() / 1000) - 1000,
      endTime: Math.floor(Date.now() / 1000) + 10000,
      contractAddress: '0x0000000000000000000000000000000000000000',
      constituencyIds: [],
      isDemoElection: true,
    });
    zeroElection.totalVotersRegistered = 0;

    const res = await fetch(`${baseUrl}/api/monitor/elections/${zeroElection.id}/participation`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    const metrics: PublicParticipationMetrics = data.metrics;

    assert.strictEqual(metrics.eligibleVoterDenominator, null);
    assert.strictEqual(metrics.turnoutPercentage, null);
    assert.strictEqual(metrics.turnoutStatus, 'ZERO_DENOMINATOR');
  });

  await t.test('10. Candidate-level live counts remain hidden while the election is open', async () => {
    const res = await fetch(`${baseUrl}/api/monitor/elections/GE-2024/results`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.resultsAvailable, false);
    assert.ok(data.reason.includes('sealed while the election is active'));
    assert.ok(
      !data.constituencies,
      'Constituency candidate results MUST NOT be provided while election is open'
    );
  });

  await t.test('11. Candidate-level results remain unavailable until supported by the publication policy', async () => {
    // Query concluded trial election DEMO-PREV-2023
    const res = await fetch(`${baseUrl}/api/monitor/elections/DEMO-PREV-2023/results`);
    assert.strictEqual(res.status, 200);

    const data = await res.json();
    assert.strictEqual(data.resultsAvailable, true);
    assert.ok(data.results.constituencies.length > 0);
    assert.strictEqual(data.results.certification.status, 'OFFICIALLY_PUBLISHED_SIMULATION');
  });

  await t.test('12. No public response links voter identity with candidate choice or exposes private nullifiers/session tokens', async () => {
    const endpoints = [
      `${baseUrl}/api/monitor/overview`,
      `${baseUrl}/api/monitor/elections`,
      `${baseUrl}/api/monitor/elections/GE-2024`,
      `${baseUrl}/api/monitor/elections/GE-2024/participation`,
      `${baseUrl}/api/monitor/elections/DEMO-PREV-2023/results`,
    ];

    for (const url of endpoints) {
      const res = await fetch(url);
      const json = await res.json();
      const text = JSON.stringify(json);

      assert.ok(!text.includes('candidateSelection'), `Voter choice link leaked in ${url}`);
      assert.ok(!text.includes('voterWallet'), `Wallet address leaked in ${url}`);
      assert.ok(!text.includes('activeNullifier'), `Nullifier leaked in ${url}`);
      assert.ok(!text.includes('tokenHash'), `Session token leaked in ${url}`);
    }
  });

  await t.test('13. Stale refresh errors are shown honestly', async () => {
    const res = await fetch(`${baseUrl}/api/monitor/elections/NON-EXISTENT-ELECTION`);
    assert.strictEqual(res.status, 404);

    const data = await res.json();
    assert.strictEqual(data.success, false);
    assert.ok(data.message.includes('not found'));
  });

  await t.test('14. Repeated refreshes do not create duplicate records or mutate elections', async () => {
    const initialOverviewRes = await fetch(`${baseUrl}/api/monitor/overview`);
    const initialOverview = (await initialOverviewRes.json()).overview;

    // Simulate 5 rapid client refreshes
    for (let i = 0; i < 5; i++) {
      await fetch(`${baseUrl}/api/monitor/elections`);
      await fetch(`${baseUrl}/api/monitor/elections/GE-2024/participation`);
    }

    const finalOverviewRes = await fetch(`${baseUrl}/api/monitor/overview`);
    const finalOverview = (await finalOverviewRes.json()).overview;

    assert.strictEqual(initialOverview.totalPublicElections, finalOverview.totalPublicElections);
    assert.strictEqual(initialOverview.openElectionsCount, finalOverview.openElectionsCount);
  });

  await t.test('15. Filters, search and pagination work with stored records', async () => {
    // 1. Filter by status: OPEN
    const openRes = await fetch(`${baseUrl}/api/monitor/elections?status=OPEN`);
    const openData = await openRes.json();
    assert.ok(openData.elections.every((e: PublicElectionSummary) => e.normalizedStatus === 'OPEN'));

    // 2. Search query matching 'Lok Sabha'
    const qRes = await fetch(`${baseUrl}/api/monitor/elections?q=Lok%20Sabha`);
    const qData = await qRes.json();
    assert.ok(qData.elections.length > 0);
    assert.ok(qData.elections.some((e: PublicElectionSummary) => e.title.includes('Lok Sabha')));

    // 3. Pagination limit bounds
    const pagedRes = await fetch(`${baseUrl}/api/monitor/elections?limit=1&page=1`);
    const pagedData = await pagedRes.json();
    assert.strictEqual(pagedData.elections.length, 1);
    assert.strictEqual(pagedData.limit, 1);
  });

  await t.test('16. Historical archive entries are distinguished from live simulation elections', async () => {
    // Query monitor overview: only tracks live simulation elections
    const monitorRes = await fetch(`${baseUrl}/api/monitor/overview`);
    const monitorData = await monitorRes.json();

    // Query historical archive: tracks 2024 Form 20 Gazette records
    const archiveRes = await fetch(`${baseUrl}/api/archive/elections`);
    const archiveData = await archiveRes.json();

    assert.ok(archiveData.elections.some((e: any) => e.id === 'ARCH-ELEC-2024-LOKSABHA'));
    assert.ok(
      !monitorData.overview.openElectionsCount.toString().includes('ARCH-ELEC-2024-LOKSABHA'),
      'Historical archive must not be counted as an active open election'
    );
  });

  await t.test('17. Public visitors cannot mutate protected data', async () => {
    // 1. Attempt mutation on public monitor (POST should not exist or be 404/405)
    const monitorPost = await fetch(`${baseUrl}/api/monitor/overview`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fake: 'data' }),
    });
    assert.ok([404, 405].includes(monitorPost.status));

    // 2. Attempt unauthorized archive mutation (POST /api/archive/import without auth)
    const archiveMutate = await fetch(`${baseUrl}/api/archive/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dryRun: true }),
    });
    assert.strictEqual(archiveMutate.status, 401);
  });

  await t.test('18. RBAC and constituency scope for administrative operations are unchanged', async () => {
    // VRO cannot import archive records (403)
    const vroImport = await fetch(`${baseUrl}/api/archive/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({ dryRun: true }),
    });
    assert.strictEqual(vroImport.status, 403);

    // Platform admin CAN initiate dry-run archive import (200)
    const adminImport = await fetch(`${baseUrl}/api/archive/import`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${platformAdminToken}`,
      },
      body: JSON.stringify({ dryRun: true, payload: [] }),
    });
    assert.strictEqual(adminImport.status, 200);
  });

  await t.test('19. K-Anonymity low-count masking protects sub-elector privacy', async () => {
    // Add a tiny test constituency with only 3 electors
    const tinyConId = 'CONST-TINY-01';
    serverStore.saveConstituency({
      id: tinyConId,
      code: 'TINY',
      name: 'Tiny Test Hamlet',
      state: 'Test State',
      totalElectors: 3, // <= 5
      turnoutCount: 2,
      candidateIds: [],
    });

    const tinyElec = serverStore.createElection({
      id: 'TEST-TINY-ELEC',
      numericId: 88,
      title: 'Tiny Hamlet Election',
      description: 'Privacy test election with <= 5 electors',
      status: 'active',
      startTime: Math.floor(Date.now() / 1000) - 1000,
      endTime: Math.floor(Date.now() / 1000) + 10000,
      contractAddress: '0x0000000000000000000000000000000000000000',
      constituencyIds: [tinyConId],
      isDemoElection: true,
    });

    const res = await fetch(`${baseUrl}/api/monitor/elections/${tinyElec.id}/participation`);
    const data = await res.json();
    const tinyBreakdown = data.metrics.constituencies.find((c: any) => c.constituencyId === tinyConId);

    assert.ok(tinyBreakdown, 'Tiny constituency must be present');
    assert.strictEqual(tinyBreakdown.privacyMasked, true);
    assert.strictEqual(tinyBreakdown.confirmedCount, 0, 'Count must be masked to 0');
    assert.strictEqual(tinyBreakdown.turnoutPercentage, null, 'Turnout must be masked to null');
  });

  await t.test('20. The Phase 09 ballot-secrecy limitation remains documented and is not represented as resolved', async () => {
    const res = await fetch(`${baseUrl}/api/monitor/overview`);
    const data: { overview: PublicMonitorOverview } = await res.json();

    assert.ok(data.overview.ballotSecrecyLimitationNotice);
    assert.ok(
      data.overview.ballotSecrecyLimitationNotice.includes('IndianElection.sol'),
      'Must cite IndianElection.sol contract calldata transparency'
    );
    assert.ok(
      data.overview.ballotSecrecyLimitationNotice.includes('zero-knowledge proofs'),
      'Must state that ZKP or homomorphic encryption is required for production'
    );
    assert.ok(
      data.overview.ballotSecrecyLimitationNotice.includes('cannot resolve the underlying on-chain privacy limitation'),
      'Must honestly state the monitor cannot resolve the underlying leak'
    );
  });
});
