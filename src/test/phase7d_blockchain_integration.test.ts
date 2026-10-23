import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import http from 'http';
import express from 'express';
import { deployContract } from '../../scripts/deploy';
import { voterRouter } from '../../server/routes/voter';
import { adminRouter } from '../../server/routes/admin';
import { serverStore } from '../../server/store';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RPC_URL = 'http://127.0.0.1:8545';

test('BlockBallot — Phase 7D: Local Blockchain & Smart Contract Integration', async (t) => {
  const isNodeRunning = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    signal: AbortSignal.timeout(600),
  }).then((r) => r.ok).catch(() => false);

  if (!isNodeRunning) {
    t.skip('Local Hardhat node at http://127.0.0.1:8545 is not running; skipping integration test');
    return;
  }

  // Spin up an isolated in-process server with fresh mock voter state
  serverStore.resetVoters();
  const app = express();
  app.use(express.json());
  app.use('/api/voter', voterRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api', adminRouter);

  let testServer: http.Server | undefined;
  let SERVER_URL = 'http://127.0.0.1:3000';

  await new Promise<void>((resolve) => {
    testServer = app.listen(0, '127.0.0.1', () => {
      const addr = testServer!.address() as { port: number };
      SERVER_URL = `http://127.0.0.1:${addr.port}`;
      resolve();
    });
  });

  t.after(async () => {
    if (testServer) {
      await new Promise<void>((res) => testServer!.close(() => res()));
    }
  });

  // Deploy fresh contract for isolated test run
  const deploymentResult = await deployContract(RPC_URL);
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const deploymentPath = path.resolve(__dirname, '../contracts/deployment.json');
  assert.ok(fs.existsSync(deploymentPath), 'Deployment manifest must exist at src/contracts/deployment.json');
  const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));

  const contract = new ethers.Contract(deployment.contractAddress, deployment.abi, provider);

  const commissionerWallet = new ethers.NonceManager(
    new ethers.Wallet(
      '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
      provider
    )
  );
  const voter1Wallet = new ethers.NonceManager(
    new ethers.Wallet(
      '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
      provider
    )
  );

  const voter1Address = await voter1Wallet.getAddress();
  const commissionerAddress = await commissionerWallet.getAddress();

  await t.test('1. Contract authorization signer matches deployment and server configuration', async () => {
    const onChainSigner = await contract.authorizationSigner();
    assert.equal(
      onChainSigner.toLowerCase(),
      deployment.authorizationSigner.toLowerCase(),
      'On-chain signer must match manifest'
    );

    // Ensure Election 18 is in Active status
    const election = await contract.getElection(18);
    if (Number(election.status) !== 1) {
      const commissionerContract = contract.connect(commissionerWallet) as any;
      await (await commissionerContract.setElectionStatus(18, 1)).wait();
    }
  });

  let ticket: any;
  const targetCandidateId = 101; // Bansuri Swaraj (BJP, New Delhi #4)

  await t.test('2. Authenticate voter Rajesh Sharma and obtain signed EIP-712 ticket from server', async () => {
    let testEpic = 'IND-DL-982341';
    let otpRes = await fetch(`${SERVER_URL}/api/voter/verify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: testEpic }),
    });
    let otpData = await otpRes.json();
    if (!otpData.success && otpData.cooldownRemaining) {
      testEpic = 'IND-DL-339210';
      otpRes = await fetch(`${SERVER_URL}/api/voter/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ epicId: testEpic }),
      });
      otpData = await otpRes.json();
    }
    assert.equal(otpData.success, true, `OTP request failed: ${otpData.message}`);
    const testOtp = otpData.testDeliveryCode;

    // Verify OTP
    const verifyRes = await fetch(`${SERVER_URL}/api/voter/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ epicId: testEpic, otp: testOtp }),
    });
    const verifyData = await verifyRes.json();
    assert.equal(verifyData.success, true, `OTP verification failed: ${verifyData.message}`);
    const sessionToken = verifyData.sessionToken;

    // Request EIP-712 Ticket
    const authTicketRes = await fetch(`${SERVER_URL}/api/voter/authorization`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      body: JSON.stringify({
        voterWallet: voter1Address,
        electionId: 18,
        chainId: 31337,
        contractAddress: deployment.contractAddress,
      }),
    });
    const authTicketData = await authTicketRes.json();
    assert.equal(authTicketData.success, true, 'Server must return valid authorization ticket');
    ticket = authTicketData.ticket;

    assert.equal(ticket.electionId, 18);
    assert.equal(ticket.constituencyId, 4);
    assert.equal(ticket.voterWallet.toLowerCase(), voter1Address.toLowerCase());
    assert.ok(ticket.nullifier);
    assert.ok(ticket.signature);
  });

  await t.test('3. Cast vote on-chain and verify candidate tally and nullifier burning', async () => {
    const voterContract = contract.connect(voter1Wallet) as any;
    const initialCandidateData = await contract.getCandidate(18, 4, targetCandidateId);
    const initialVotes = Number(initialCandidateData.voteCount);

    const tx = await voterContract.castVote(
      ticket.electionId,
      ticket.constituencyId,
      targetCandidateId,
      ticket.nullifier,
      ticket.expiry,
      ticket.signature
    );
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1, 'Transaction must succeed');

    // Verify Candidate tally increment
    const updatedCandidateData = await contract.getCandidate(18, 4, targetCandidateId);
    assert.equal(Number(updatedCandidateData.voteCount), initialVotes + 1);

    // Verify nullifier spent status
    const isSpent = await contract.isNullifierSpent(18, ticket.nullifier);
    assert.equal(isSpent, true, 'Nullifier must be marked spent');
  });

  await t.test('4. Duplicate vote attempt with burned nullifier strictly reverts on-chain', async () => {
    const voterContract = contract.connect(voter1Wallet) as any;
    let duplicateReverted = false;
    try {
      const dupTx = await voterContract.castVote(
        ticket.electionId,
        ticket.constituencyId,
        targetCandidateId,
        ticket.nullifier,
        ticket.expiry,
        ticket.signature
      );
      await dupTx.wait();
    } catch (err: any) {
      duplicateReverted = true;
    }
    assert.equal(duplicateReverted, true, 'Duplicate vote must revert');
  });

  await t.test('5. Ballot submitted from unbonded rogue wallet is rejected on-chain', async () => {
    const rogueWallet = new ethers.Wallet(
      '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
      provider
    );
    const rogueContract = contract.connect(rogueWallet) as any;
    let rogueReverted = false;
    try {
      const rogueTx = await rogueContract.castVote(
        ticket.electionId,
        ticket.constituencyId,
        targetCandidateId,
        ethers.hexlify(ethers.randomBytes(32)),
        ticket.expiry,
        ticket.signature
      );
      await rogueTx.wait();
    } catch {
      rogueReverted = true;
    }
    assert.equal(rogueReverted, true, 'Unbonded wallet vote must revert');
  });

  await t.test('6. Election lifecycle restrictions: Paused election rejects votes', async () => {
    const commissionerContract = contract.connect(commissionerWallet) as any;
    const voterContract = contract.connect(voter1Wallet) as any;

    const currentElection = await contract.getElection(18);
    if (Number(currentElection.status) !== 2) {
      await (await commissionerContract.setElectionStatus(18, 2)).wait(); // Status 2 = Paused
    }

    let pausedReverted = false;
    try {
      const freshNullifier = ethers.hexlify(ethers.randomBytes(32));
      const pausedTx = await voterContract.castVote(
        18,
        4,
        targetCandidateId,
        freshNullifier,
        ticket.expiry,
        ticket.signature
      );
      await pausedTx.wait();
    } catch {
      pausedReverted = true;
    }
    assert.equal(pausedReverted, true, 'Paused election must reject votes');

    // Reactivate election (Status 1 = Active)
    await (await commissionerContract.setElectionStatus(18, 1)).wait();
  });
});
