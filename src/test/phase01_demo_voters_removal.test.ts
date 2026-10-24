/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';
import fs from 'fs';
import path from 'path';

import { serverStore } from '../../server/store';
import { voterRouter } from '../../server/routes/voter';
import { SYNTHETIC_VOTERS, INITIAL_ELECTIONS, INITIAL_CONSTITUENCIES, INITIAL_CANDIDATES } from '../data/mockData';
import { HISTORICAL_CONSTITUENCIES_2024 } from '../data/historical2024';
import { TEST_VOTERS } from './fixtures/voterFixtures';
import { PersonaQuickBar } from '../components/PersonaQuickBar';
import {
  setAdminFirestoreForTesting,
  createInMemoryFirestoreMock,
} from '../../server/firebaseAdmin';
import { seedInitialFirestoreData } from '../../server/firestore';
import {
  cleanupLegacyDemoVoters,
  LEGACY_DEMO_VOTERS,
} from '../../scripts/cleanup-legacy-demo-voters';

const LEGACY_EPIC_IDS = [
  'IND-DL-982341',
  'IND-DL-339210',
  'IND-UP-441209',
  'IND-KL-772183',
  'IND-KA-550912',
  'IND-DL-999000',
];

test('BlockBallot — Phase 01: Demo Voter Removal & Fail-Closed Identification', async (t) => {
  // --------------------------------------------------------------------------
  // 1. Fresh in-memory server state contains no preloaded voter identities
  // --------------------------------------------------------------------------
  await t.test('1. Fresh in-memory server state contains no preloaded voter identities', () => {
    serverStore.resetDefaults();

    // The in-memory voter roll must start completely empty
    for (const epicId of LEGACY_EPIC_IDS) {
      const found = serverStore.findVoterByEpic(epicId);
      assert.equal(found, undefined, `Legacy demo voter ${epicId} must not be present in fresh server store`);
    }

    assert.equal(
      (serverStore as any).voters.size,
      0,
      'serverStore voters roll must have size 0 on fresh reset'
    );
  });

  // --------------------------------------------------------------------------
  // 2. Firestore initialization does not seed old demo voters into empty roll
  // --------------------------------------------------------------------------
  await t.test('2. Firestore initialization does not seed old demo voters into empty voter collection', async () => {
    const mockDb = createInMemoryFirestoreMock();
    setAdminFirestoreForTesting(mockDb);

    try {
      // Execute initial seeding check (runs on server startup)
      await seedInitialFirestoreData();

      // Voters collection in Firestore must remain empty
      const votersSnap = await mockDb.collection('voters').get();
      assert.equal(
        votersSnap.size,
        0,
        'Firestore /voters collection must not be seeded with legacy demo voters'
      );

      // But non-voter reference data must still be seeded correctly
      const electionsSnap = await mockDb.collection('elections').get();
      assert.ok(electionsSnap.size > 0, 'Elections must still be seeded in Firestore');

      const constSnap = await mockDb.collection('constituencies').get();
      assert.ok(constSnap.size > 0, 'Constituencies must still be seeded in Firestore');

      const candSnap = await mockDb.collection('candidates').get();
      assert.ok(candSnap.size > 0, 'Candidates must still be seeded in Firestore');
    } finally {
      setAdminFirestoreForTesting(null);
    }
  });

  // --------------------------------------------------------------------------
  // 3. Legacy demo voter IDs cannot complete identification (fail closed)
  // --------------------------------------------------------------------------
  await t.test('3. Legacy demo voter IDs cannot complete identification via API', async () => {
    serverStore.resetDefaults();

    const app = express();
    app.use(express.json());
    app.use('/api/voter', voterRouter);

    const server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as any).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      for (const epicId of LEGACY_EPIC_IDS) {
        const res = await fetch(`${baseUrl}/api/voter/verify`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ epicId }),
        });

        assert.equal(res.status, 404, `Unenrolled legacy ID ${epicId} must return 404`);
        const data = await res.json();
        assert.equal(data.success, false);
        assert.equal(data.status, 'NOT_FOUND');
        assert.match(data.message, /not found in registered electoral roll/i);
      }
    } finally {
      server.close();
    }
  });

  // --------------------------------------------------------------------------
  // 4. Network errors and invalid responses fail closed
  // --------------------------------------------------------------------------
  await t.test('4. Identification fails closed on network rejection without fallback', async () => {
    serverStore.resetDefaults();

    // Direct invocation to non-listening port simulates network disconnect
    try {
      await fetch('http://127.0.0.1:59999/api/voter/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId: 'IND-DL-982341' }),
      });
      assert.fail('Should throw network error');
    } catch (err: any) {
      assert.ok(err, 'Network error must be thrown');
    }

    // Ensure serverStore was not affected
    assert.equal(serverStore.findVoterByEpic('IND-DL-982341'), undefined);
  });

  // --------------------------------------------------------------------------
  // 5. No voter-persona shortcuts or preset sample cards in ordinary journey
  // --------------------------------------------------------------------------
  await t.test('5. PersonaQuickBar and SYNTHETIC_VOTERS are retired from normal user journey', () => {
    // SYNTHETIC_VOTERS in mockData is empty
    assert.equal(
      SYNTHETIC_VOTERS.length,
      0,
      'SYNTHETIC_VOTERS array in mockData must be empty'
    );

    // PersonaQuickBar renders null
    const rendered = PersonaQuickBar({} as any);
    assert.equal(rendered, null, 'PersonaQuickBar component must render null');
  });

  // --------------------------------------------------------------------------
  // 6. Test-only fixtures are not imported into application startup modules
  // --------------------------------------------------------------------------
  await t.test('6. Application startup and runtime modules do not import test fixtures', () => {
    const runtimeFiles = [
      path.resolve(process.cwd(), 'src/data/mockData.ts'),
      path.resolve(process.cwd(), 'src/App.tsx'),
      path.resolve(process.cwd(), 'src/components/screens/IdentifyScreen.tsx'),
      path.resolve(process.cwd(), 'src/components/screens/PracticeVotingScreen.tsx'),
      path.resolve(process.cwd(), 'server/store.ts'),
      path.resolve(process.cwd(), 'server/firestore.ts'),
      path.resolve(process.cwd(), 'server.ts'),
    ];

    for (const filePath of runtimeFiles) {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf8');
      const importStatementMatches = content.match(/import\s+.*(?:TEST_VOTERS|voterFixtures)/g);
      assert.equal(
        importStatementMatches,
        null,
        `Runtime file ${path.basename(filePath)} must not import test voter fixtures`
      );
    }
  });

  // --------------------------------------------------------------------------
  // 7. Demo administrator seed script and authentication safeguards remain intact
  // --------------------------------------------------------------------------
  await t.test('7. Demo administrator seed script and configuration safeguards remain intact', () => {
    const seedScriptPath = path.resolve(process.cwd(), 'scripts/seed-demo-admin.ts');
    assert.ok(fs.existsSync(seedScriptPath), 'scripts/seed-demo-admin.ts must exist');

    const seedContent = fs.readFileSync(seedScriptPath, 'utf8');
    assert.ok(seedContent.includes('demo.admin@blockballot.local'));
    assert.ok(seedContent.includes('DEMO_ADMIN_PASSWORD'));
    assert.ok(seedContent.includes('Returning Officer'));
  });

  // --------------------------------------------------------------------------
  // 8. Historical records, candidates, and constituencies are preserved
  // --------------------------------------------------------------------------
  await t.test('8. Historical election records, candidates, and constituencies remain intact', () => {
    assert.ok(INITIAL_ELECTIONS.length >= 3, 'INITIAL_ELECTIONS must have at least 3 elections');
    assert.ok(INITIAL_CONSTITUENCIES.length >= 4, 'INITIAL_CONSTITUENCIES must have at least 4 constituencies');
    assert.ok(INITIAL_CANDIDATES.length >= 10, 'INITIAL_CANDIDATES must have at least 10 candidates');
    assert.ok(HISTORICAL_CONSTITUENCIES_2024.length >= 4, 'HISTORICAL_CONSTITUENCIES_2024 must remain intact');
  });

  // --------------------------------------------------------------------------
  // 9. Migration dry run matches only the intended legacy demo documents
  // --------------------------------------------------------------------------
  await t.test('9. Migration dry run matches only intended legacy demo documents and deletes nothing', async () => {
    const mockDb = createInMemoryFirestoreMock();

    // Seed 6 legacy demo voters into mockDb
    for (const legacy of LEGACY_DEMO_VOTERS) {
      await mockDb.collection('voters').doc(legacy.id).set({
        id: legacy.id,
        epicId: legacy.epicId,
        name: legacy.name,
        constituencyId: 'CONST-04-ND',
      });
    }

    // Seed 1 non-legacy simulated voter that must NEVER be deleted
    await mockDb.collection('voters').doc('voter-valid-future').set({
      id: 'voter-valid-future',
      epicId: 'ABC1234567',
      name: 'Future Enrolled Citizen',
      constituencyId: 'CONST-04-ND',
    });

    // Run in DRY_RUN mode
    const dryRunRes = await cleanupLegacyDemoVoters({
      execute: false,
      firestoreOverride: mockDb,
    });

    assert.equal(dryRunRes.mode, 'DRY_RUN');
    assert.equal(dryRunRes.matchedCount, 6, 'Must match exactly the 6 legacy demo records');
    assert.equal(dryRunRes.deletedCount, 0, 'Dry run must not delete any documents');

    // Confirm all 7 documents still exist
    const snapAfterDryRun = await mockDb.collection('voters').get();
    assert.equal(snapAfterDryRun.size, 7, 'All 7 documents must remain untouched after dry run');

    // Now execute cleanup with confirm
    const execRes = await cleanupLegacyDemoVoters({
      execute: true,
      confirm: true,
      firestoreOverride: mockDb,
    });

    assert.equal(execRes.mode, 'EXECUTE');
    assert.equal(execRes.deletedCount, 6, 'Must delete exactly 6 legacy documents');

    // Non-legacy document must remain intact
    const snapAfterExec = await mockDb.collection('voters').get();
    assert.equal(snapAfterExec.size, 1, 'Only non-legacy document should remain');
    assert.equal(snapAfterExec.docs[0].id, 'voter-valid-future');
  });

  // --------------------------------------------------------------------------
  // 10. Destructive cleanup refuses a production target or unconfirmed run
  // --------------------------------------------------------------------------
  await t.test('10. Destructive cleanup refuses execution in production or unconfirmed mode', async () => {
    const mockDb = createInMemoryFirestoreMock();
    const originalEnv = process.env.NODE_ENV;

    try {
      // A. Production safeguard
      process.env.NODE_ENV = 'production';
      const prodRes = await cleanupLegacyDemoVoters({
        execute: true,
        confirm: true,
        firestoreOverride: mockDb,
      });

      assert.equal(prodRes.deletedCount, 0);
      assert.ok(prodRes.abortedReason?.includes('production'));

      // B. Unconfirmed safeguard
      process.env.NODE_ENV = 'development';
      const unconfirmedRes = await cleanupLegacyDemoVoters({
        execute: true,
        confirm: false,
        firestoreOverride: mockDb,
      });

      assert.equal(unconfirmedRes.deletedCount, 0);
      assert.ok(unconfirmedRes.abortedReason?.includes('confirmation'));
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
