import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadArtifact() {
  const artifactPath = path.resolve(__dirname, '../../artifacts/contracts/IndianElection.sol/IndianElection.json');
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

const TEST_ACCOUNTS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d',
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a',
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec346fe86710470d776456e4125520fdd4f050b98362335acaced5153e',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
];

test('BlockBallot — On-Chain Contract Guards & Lifecycle Test Suite', async (t) => {
  const isNodeRunning = await fetch('http://127.0.0.1:8545', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
    signal: AbortSignal.timeout(600),
  }).then((r) => r.ok).catch(() => false);

  if (!isNodeRunning) {
    t.skip('Local Hardhat node at http://127.0.0.1:8545 is not running; skipping on-chain live tests');
    return;
  }

  const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');
  const artifact = loadArtifact();

  function getSigner(index: number) {
    return new ethers.NonceManager(new ethers.Wallet(TEST_ACCOUNTS[index], provider));
  }

  // 1. Contract deployment with valid and invalid signer
  await t.test('1. Contract compilation and deployment authorization checks', async () => {
    // Rejection on zero-address signer
    const badCommissioner = new ethers.Wallet(TEST_ACCOUNTS[0], provider);
    const badFactory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, badCommissioner);
    let deployRejected = false;
    try {
      await badFactory.deploy(ethers.ZeroAddress);
    } catch {
      deployRejected = true;
    }
    assert.equal(deployRejected, true, 'Deployment with zero-address signer must revert');

    // Successful deployment with synchronized NonceManager
    const commissioner = getSigner(0);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, commissioner);
    const signerWallet = ethers.Wallet.createRandom();

    const contract = await factory.deploy(signerWallet.address);
    await contract.waitForDeployment();

    const deployedSigner = await (contract as any).authorizationSigner();
    assert.equal(deployedSigner.toLowerCase(), signerWallet.address.toLowerCase());

    const deployedCommissioner = await (contract as any).electionCommissioner();
    assert.equal(deployedCommissioner.toLowerCase(), (await commissioner.getAddress()).toLowerCase());
  });

  // 2. Election creation guards
  await t.test('2. Election creation and invalid ID enforcement', async () => {
    const commissioner = getSigner(1);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, commissioner);
    const contract = (await factory.deploy(await commissioner.getAddress())) as any;
    await contract.waitForDeployment();

    const now = Math.floor(Date.now() / 1000);

    // Reject electionId = 0 via staticCall
    await assert.rejects(
      async () => {
        await contract.createElection.staticCall(0, 'Zero ID Election', now, now + 3600);
      },
      /BlockBallot: Election ID cannot be 0/
    );

    // Reject invalid time range (endTime <= startTime)
    await assert.rejects(
      async () => {
        await contract.createElection.staticCall(1, 'Inverted Time', now + 3600, now);
      },
      /BlockBallot: End time must be after start time/
    );

    // Successful election creation
    const txOk = await contract.createElection(10, 'General Election 2026', now, now + 86400);
    await txOk.wait();

    const election = await contract.getElection(10);
    assert.equal(election.id, 10n);
    assert.equal(election.title, 'General Election 2026');
    assert.equal(election.status, 0n); // Draft

    // Reject duplicate election ID
    await assert.rejects(
      async () => {
        await contract.createElection.staticCall(10, 'Duplicate Election', now, now + 86400);
      },
      /BlockBallot: Election already exists/
    );
  });

  // 3. Candidate registration guards
  await t.test('3. Candidate registration, non-zero IDs, and duplicate prevention', async () => {
    const commissioner = getSigner(2);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, commissioner);
    const contract = (await factory.deploy(await commissioner.getAddress())) as any;
    await contract.waitForDeployment();

    const now = Math.floor(Date.now() / 1000);
    await (await contract.createElection(20, 'Nomination Test Election', now, now + 86400)).wait();

    // Reject constituencyId = 0 or candidateId = 0
    await assert.rejects(
      async () => {
        await contract.registerCandidate.staticCall(20, 0, 101, 'Invalid Const', 'Party');
      },
      /BlockBallot: Constituency ID cannot be 0/
    );

    await assert.rejects(
      async () => {
        await contract.registerCandidate.staticCall(20, 4, 0, 'Invalid Cand', 'Party');
      },
      /BlockBallot: Candidate ID cannot be 0/
    );

    // Successfully register candidates
    await (await contract.registerCandidate(20, 4, 101, 'Candidate A', 'Party X')).wait();
    await (await contract.registerCandidate(20, 4, 102, 'Candidate B', 'Party Y')).wait();

    const cand1 = await contract.getCandidate(20, 4, 101);
    assert.equal(cand1.name, 'Candidate A');
    assert.equal(cand1.party, 'Party X');
    assert.equal(cand1.voteCount, 0n);

    // Reject duplicate candidate in same constituency
    await assert.rejects(
      async () => {
        await contract.registerCandidate.staticCall(20, 4, 101, 'Duplicate ID', 'Party Z');
      },
      /BlockBallot: Candidate ID already registered in constituency/
    );

    // Verify constituency candidate list
    const candidateList = await contract.getConstituencyCandidates(20, 4);
    assert.equal(candidateList.length, 2);
    assert.equal(candidateList[0], 101n);
    assert.equal(candidateList[1], 102n);
  });

  // 4. Commissioner-only authorization
  await t.test('4. Commissioner-only authorization on administrative functions', async () => {
    const commissioner = getSigner(3);
    const nonCommissioner = getSigner(4);

    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, commissioner);
    const contract = (await factory.deploy(await commissioner.getAddress())) as any;
    await contract.waitForDeployment();

    const rogueContract = contract.connect(nonCommissioner) as any;
    const now = Math.floor(Date.now() / 1000);

    // Non-commissioner cannot create elections
    await assert.rejects(
      async () => {
        await rogueContract.createElection.staticCall(30, 'Rogue Election', now, now + 3600);
      },
      /BlockBallot: Only Commissioner authorized/
    );

    // Non-commissioner cannot change signer
    await assert.rejects(
      async () => {
        await rogueContract.setAuthorizationSigner.staticCall(await nonCommissioner.getAddress());
      },
      /BlockBallot: Only Commissioner authorized/
    );
  });

  // 5. State transitions and terminal concluded state
  await t.test('5. Election state transitions and terminal Concluded behavior', async () => {
    const commissioner = getSigner(5);
    const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, commissioner);
    const contract = (await factory.deploy(await commissioner.getAddress())) as any;
    await contract.waitForDeployment();

    const now = Math.floor(Date.now() / 1000);
    await (await contract.createElection(40, 'Lifecycle Test', now, now + 86400)).wait();

    // Draft -> Active
    await (await contract.setElectionStatus(40, 1)).wait(); // 1 = Active
    assert.equal((await contract.getElection(40)).status, 1n);

    // Cannot register candidate when Active
    await assert.rejects(
      async () => {
        await contract.registerCandidate.staticCall(40, 1, 999, 'Late Candidate', 'Party');
      },
      /BlockBallot: Candidate registration only allowed in Draft/
    );

    // Active -> Paused
    await (await contract.setElectionStatus(40, 2)).wait(); // 2 = Paused
    assert.equal((await contract.getElection(40)).status, 2n);

    // Paused -> Active
    await (await contract.setElectionStatus(40, 1)).wait(); // 1 = Active
    assert.equal((await contract.getElection(40)).status, 1n);

    // Active -> Concluded (Terminal)
    await (await contract.setElectionStatus(40, 3)).wait(); // 3 = Concluded
    assert.equal((await contract.getElection(40)).status, 3n);

    // Cannot modify Concluded election
    await assert.rejects(
      async () => {
        await contract.setElectionStatus.staticCall(40, 1);
      },
      /BlockBallot: Concluded election is terminal/
    );

    await assert.rejects(
      async () => {
        await contract.setElectionStatus.staticCall(40, 2);
      },
      /BlockBallot: Concluded election is terminal/
    );
  });
});
