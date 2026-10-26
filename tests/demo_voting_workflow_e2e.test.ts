/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import http from 'http';

import { adminRouter, clearAdminSessionsForTesting } from '../backend/server/routes/admin';
import { voterRouter } from '../backend/server/routes/voter';
import { monitorRouter } from '../backend/server/routes/monitor';
import { serverStore } from '../backend/server/store';
import {
  clearOfficerSessionsForTesting,
  verifyOfficerCredentials,
  createOfficerSession,
  getDefaultOfficerDefinitions,
  DEMO_OFFICER_IDENTIFIERS,
} from '../backend/server/auth/rbac';
import { isValidSimulationVoterId } from '../backend/server/utils/voterId';
import { getDataRepositories } from '../backend/server/repositories';
import { seedDemoOfficers } from '../scripts/seed-demo-officers';
import { seedDemoAdmin } from '../scripts/seed-demo-admin';
import { ACADEMIC_SIMULATION_NOTICE } from '../frontend/src/components/common/AcademicSimulationNotice';
import { MONITOR_NON_ENDORSEMENT_DISCLAIMER } from '../frontend/src/types/monitor';

test('BlockBallot — End-to-End Synthetic Voter ID, Complete Demo Voting Workflow & Hosted Portal Controls', async (t) => {
  let server: http.Server;
  let baseUrl: string;

  let eoToken: string = '';
  let vroToken: string = '';
  let adminToken: string = '';

  let registeredSimulationVoterId: string = '';
  let createdElectionId: string = '';

  t.before(async () => {
    // 1. Seed demo officer and admin accounts into local config
    await seedDemoOfficers();
    await seedDemoAdmin();

    // 2. Setup Express test server
    const app = express();
    app.use(express.json());

    app.use('/api/admin', adminRouter);
    app.use('/api', adminRouter);
    app.use('/api/voter', voterRouter);
    app.use('/api/monitor', monitorRouter);

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  t.after(async () => {
    clearAdminSessionsForTesting();
    clearOfficerSessionsForTesting();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  await t.test('1. Demo Officer Authentication & Distinct Role Permissions', async () => {
    // Retrieve credentials from .env.local via verifyOfficerCredentials
    const eoAuth = await verifyOfficerCredentials('EO-SIM-001', process.env.OFFICER_EO_PASSWORD || 'Officer@2024!');
    assert.equal(eoAuth.success, true, 'Election Officer credentials must verify successfully');
    assert.equal(eoAuth.account?.role, 'ELECTION_OFFICER');

    const vroAuth = await verifyOfficerCredentials('VRO-SIM-001', process.env.OFFICER_VRO_PASSWORD || 'VroOfficer@2024!');
    assert.equal(vroAuth.success, true, 'VRO credentials must verify successfully');
    assert.equal(vroAuth.account?.role, 'VOTER_REGISTRATION_OFFICER');

    const adminAuth = await verifyOfficerCredentials('demo.admin@blockballot.local', process.env.DEMO_ADMIN_PASSWORD || 'DemoAdminSecret2026!');
    assert.equal(adminAuth.success, true, 'Platform Admin credentials must verify successfully');
    assert.equal(adminAuth.account?.role, 'PLATFORM_ADMIN');

    // Create active officer sessions
    const eoSession = createOfficerSession(eoAuth.account!);
    eoToken = eoSession.token;

    const vroSession = createOfficerSession(vroAuth.account!);
    vroToken = vroSession.token;

    const adminSession = createOfficerSession(adminAuth.account!);
    adminToken = adminSession.token;

    assert.ok(eoToken.startsWith('adm_sec_'));
    assert.ok(vroToken.startsWith('adm_sec_'));
    assert.ok(adminToken.startsWith('adm_sec_'));
  });

  await t.test('2. Strict RBAC Role Separation Enforced by Backend', async () => {
    // A: Election Officer attempts to enroll a synthetic voter -> must be rejected (403 Forbidden)
    const eoVoterRes = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({
        fullName: 'Unauthorized Elector',
        dateOfBirth: '1995-01-01',
        gender: 'M',
        constituencyId: 'CONST-04-ND',
      }),
    });
    assert.equal(eoVoterRes.status, 403, 'Election Officer must NOT have voter creation permission');

    // B: Voter Registration Officer attempts to create an election -> must be rejected (403 Forbidden)
    const vroElecRes = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify({
        id: `TEST-ELEC-${Date.now()}`,
        name: 'Unauthorized Election',
        description: 'Should fail',
        type: 'Lok Sabha',
        state: 'NCT of Delhi',
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 86400000).toISOString(),
        status: 'draft',
        constituencyIds: ['CONST-04-ND'],
      }),
    });
    assert.equal(vroElecRes.status, 403, 'VRO must NOT have election management permission');
  });

  await t.test('3. VRO Enrolls Synthetic Voter with Backend-Generated ID (BBV-SIM-...)', async () => {
    const voterPayload = {
      fullName: 'Aarav Sharma',
      dateOfBirth: '1996-08-20',
      gender: 'M',
      state: 'NCT of Delhi',
      district: 'New Delhi',
      constituencyId: 'CONST-04-ND',
      pollingStation: 'Civic Community Centre, Polling Booth 1',
      maskedMobile: '+91 ••••• •3344',
    };

    const res = await fetch(`${baseUrl}/api/admin/voters`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${vroToken}`,
      },
      body: JSON.stringify(voterPayload),
    });

    assert.equal(res.status, 201, 'VRO should successfully register synthetic voter');
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.voter, 'Voter record must be returned');

    registeredSimulationVoterId = data.voter.simulationVoterId;
    assert.ok(registeredSimulationVoterId, 'Simulation voter ID must be generated');
    assert.equal(isValidSimulationVoterId(registeredSimulationVoterId), true, 'ID must match BBV-SIM format');
    assert.ok(registeredSimulationVoterId.startsWith('BBV-SIM-'), 'ID must start with BBV-SIM-');

    // Verify voter appears in registry search
    const listRes = await fetch(`${baseUrl}/api/admin/voters?search=${encodeURIComponent(registeredSimulationVoterId)}`, {
      headers: { Authorization: `Bearer ${vroToken}` },
    });
    assert.equal(listRes.status, 200);
    const listData = await listRes.json();
    assert.equal(listData.success, true);
    const found = listData.voters.find((v: any) => v.simulationVoterId === registeredSimulationVoterId);
    assert.ok(found, 'Newly registered voter must be found via authorized registry search');
  });

  await t.test('4. Synthetic Voter Can Authenticate on Real Voter Login Interface (Verify & OTP)', async () => {
    // Step 1: Elector enters Simulation Voter ID -> POST /api/voter/verify
    const verifyRes = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: registeredSimulationVoterId }),
    });

    assert.equal(verifyRes.status, 200, 'Voter verify should succeed for newly enrolled synthetic ID');
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.success, true);
    assert.equal(verifyData.status, 'CHALLENGE_ISSUED');
    assert.ok(verifyData.testDeliveryCode, 'In demo mode, testDeliveryCode must be provided');

    const otpCode = verifyData.testDeliveryCode;

    // Step 2: Voter submits OTP -> POST /api/voter/verify-otp
    const otpRes = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: registeredSimulationVoterId,
        otp: otpCode,
      }),
    });

    assert.equal(otpRes.status, 200, 'Voter verify-otp should succeed with issued OTP code');
    const otpData = await otpRes.json();
    assert.equal(otpData.success, true);
    assert.ok(otpData.sessionToken, 'Session token must be issued upon successful authentication');
    assert.equal(otpData.voter.epicId, registeredSimulationVoterId);
  });

  let electionNumericId: number = 0;
  let candidateCreatedId: string = '';

  await t.test('5. Election Officer Creates, Configures Candidates and Opens Demonstration Election', async () => {
    createdElectionId = `DEMO-ELEC-${Date.now()}`;
    const electionPayload = {
      id: createdElectionId,
      name: 'Lok Sabha Simulation Election 2026',
      description: 'Non-binding academic demonstration election.',
      type: 'Parliamentary',
      state: 'NCT of Delhi',
      startDate: new Date(Date.now() - 3600000).toISOString(), // Started 1 hr ago
      endDate: new Date(Date.now() + 86400000).toISOString(),  // Ends in 24 hr
      status: 'draft',
      constituencyIds: ['CONST-04-ND'],
      isDemoElection: true,
    };

    const createRes = await fetch(`${baseUrl}/api/admin/elections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify(electionPayload),
    });

    assert.equal(createRes.status, 201, 'EO should successfully create election');
    const createData = await createRes.json();
    assert.equal(createData.success, true);
    electionNumericId = createData.election.numericId;

    // Add candidate to draft election
    candidateCreatedId = `CAND-${Date.now()}`;
    const candPayload = {
      id: candidateCreatedId,
      electionId: createdElectionId,
      name: 'Priya Narayanan',
      partyName: 'National Civic Coalition',
      partyAbbreviation: 'NCC',
      symbol: 'Lotus',
      symbolKey: 'lotus',
      constituencyId: 'CONST-04-ND',
      state: 'NCT of Delhi',
      status: 'APPROVED',
      isApproved: true,
    };

    const candRes = await fetch(`${baseUrl}/api/admin/candidates`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify(candPayload),
    });
    assert.equal(candRes.status, 201, 'EO should successfully add candidate to draft election');

    // EO opens/activates the election lifecycle
    const activateRes = await fetch(`${baseUrl}/api/admin/elections/${createdElectionId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${eoToken}`,
      },
      body: JSON.stringify({ status: 'active' }),
    });
    assert.equal(activateRes.status, 200, 'EO should successfully activate demonstration election');
  });

  await t.test('6. Complete Voting Workflow: Selection, Authorization Ticket, Ballot Cast & Receipt', async () => {
    // Step 1: Re-authenticate voter to ensure fresh session
    const verifyRes = await fetch(`${baseUrl}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: registeredSimulationVoterId }),
    });
    const { testDeliveryCode } = await verifyRes.json();

    const otpRes = await fetch(`${baseUrl}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        epicId: registeredSimulationVoterId,
        otp: testDeliveryCode,
        electionId: electionNumericId,
      }),
    });
    const { sessionToken } = await otpRes.json();

    // Step 2: Request EIP-712 Voting Authorization Ticket
    const dummyVoterWallet = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
    const ticketRes = await fetch(`${baseUrl}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        electionId: electionNumericId,
        voterWallet: dummyVoterWallet,
      }),
    });

    assert.equal(ticketRes.status, 200, 'Authorization ticket should be issued for eligible voter in active election');
    const ticketData = await ticketRes.json();
    assert.equal(ticketData.success, true);
    assert.ok(ticketData.ticket?.signature, 'Cryptographic signature must be present on ticket');
    const nullifier = ticketData.ticket?.nullifier || ticketData.nullifier;
    assert.ok(nullifier, 'Nullifier must be present on ticket');

    // Step 3: Record Vote on authoritative backend (zero ballot correlation preserved)
    const dummyTxHash = `0x${'a'.repeat(64)}`;
    const voteRes = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        epicId: registeredSimulationVoterId,
        nullifier,
        electionId: electionNumericId,
        constituencyId: 'CONST-04-ND',
        candidateId: candidateCreatedId,
        txHash: dummyTxHash,
        isSimulated: true,
      }),
    });

    assert.equal(voteRes.status, 200, 'Vote submission should succeed');
    const voteData = await voteRes.json();
    assert.equal(voteData.success, true);
    assert.equal(voteData.status, 'VOTED');
    assert.equal(voteData.participationStatus, 'VOTE_ACCEPTED');

    // Step 4: Duplicate Submission Protection
    const dupRes = await fetch(`${baseUrl}/api/voter/record-vote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        epicId: registeredSimulationVoterId,
        nullifier,
        electionId: electionNumericId,
        constituencyId: 'CONST-04-ND',
        candidateId: candidateCreatedId,
        txHash: `0x${'b'.repeat(64)}`,
        isSimulated: true,
      }),
    });

    assert.equal(dupRes.status, 409, 'Duplicate ballot submission must be rejected with 409 conflict');
    const dupData = await dupRes.json();
    assert.equal(dupData.success, false);
    assert.equal(dupData.code, 'DOUBLE_VOTE_ATTEMPT');
  });

  await t.test('7. Exact Statutory Academic Demonstration Disclaimer is Standardized', async () => {
    const requiredNotice =
      'BlockBallot — Academic Voting Simulation. Non-binding demonstration only. Not affiliated with or endorsed by the Election Commission of India or UIDAI.';

    assert.equal(
      ACADEMIC_SIMULATION_NOTICE,
      requiredNotice,
      'Shared UI disclaimer must strictly match mandated statutory text'
    );
    assert.ok(
      MONITOR_NON_ENDORSEMENT_DISCLAIMER.includes(requiredNotice),
      'Monitor disclaimer must contain mandated statutory text'
    );
  });

  await t.test('8. Hosted Demo Mode & Production Safeguards', async () => {
    const originalNodeEnv = process.env.NODE_ENV;
    const originalDemoMode = process.env.HOSTED_DEMO_ENABLED;

    try {
      // Test A: In standard production (HOSTED_DEMO_ENABLED undefined), password auth must be rejected (fail closed)
      process.env.NODE_ENV = 'production';
      delete process.env.HOSTED_DEMO_ENABLED;

      const prodFailRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'election.officer@blockballot.local',
          password: process.env.OFFICER_EO_PASSWORD || 'Officer@2024!',
        }),
      });
      assert.equal(prodFailRes.status, 403, 'Password auth in strict production must return 403');

      // Test B: In production with explicit HOSTED_DEMO_ENABLED=true, authorized demo officers can authenticate
      process.env.HOSTED_DEMO_ENABLED = 'true';

      const prodDemoRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'election.officer@blockballot.local',
          password: process.env.OFFICER_EO_PASSWORD || 'Officer@2024!',
        }),
      });
      assert.equal(prodDemoRes.status, 200, 'In HOSTED_DEMO_ENABLED mode, demo officer with secret password can log in');
      const prodDemoData = await prodDemoRes.json();
      assert.equal(prodDemoData.success, true);
      assert.equal(prodDemoData.user.role, 'ELECTION_OFFICER');

      // Test C: Incorrect password must still be rejected
      const prodBadRes = await fetch(`${baseUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'election.officer@blockballot.local',
          password: 'WrongPassword123!',
        }),
      });
      assert.equal(prodBadRes.status, 401, 'Incorrect demo password must be rejected');
    } finally {
      process.env.NODE_ENV = originalNodeEnv;
      if (originalDemoMode !== undefined) {
        process.env.HOSTED_DEMO_ENABLED = originalDemoMode;
      } else {
        delete process.env.HOSTED_DEMO_ENABLED;
      }
    }
  });
});
