import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import { signVotingAuthorization } from '../utils/crypto';
import { deriveServerNullifier } from '../../server/crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function loadArtifact() {
  const artifactPath = path.resolve(__dirname, '../../artifacts/contracts/IndianElection.sol/IndianElection.json');
  return JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
}

const TEST_ACCOUNTS = [
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Commissioner
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Voter 1
  '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a', // Voter 2
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6', // Rogue voter
];

test('BlockBallot — On-Chain EIP-712 Typed Signing & Ballot Execution Test Suite', async (t) => {
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

  // Create dedicated authorization signer wallet
  const authSignerWallet = ethers.Wallet.createRandom();

  const commissioner = new ethers.NonceManager(new ethers.Wallet(TEST_ACCOUNTS[0], provider));
  const voter1 = new ethers.NonceManager(new ethers.Wallet(TEST_ACCOUNTS[1], provider));
  const voter2 = new ethers.NonceManager(new ethers.Wallet(TEST_ACCOUNTS[2], provider));
  const rogueVoter = new ethers.NonceManager(new ethers.Wallet(TEST_ACCOUNTS[3], provider));

  const voter1Address = await voter1.getAddress();
  const voter2Address = await voter2.getAddress();
  const rogueAddress = await rogueVoter.getAddress();

  // Deploy contract
  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, commissioner);
  const contract = (await factory.deploy(authSignerWallet.address)) as any;
  await contract.waitForDeployment();
  const contractAddress = await contract.getAddress();

  const now = Math.floor(Date.now() / 1000);
  const chainId = 31337;
  const electionId = 18;
  const constituencyId = 4;

  // Setup: Create Election 18, Register Candidates, Activate
  await (await contract.createElection(electionId, '18th Lok Sabha 2024', now - 3600, now + 86400 * 7)).wait();
  await (await contract.registerCandidate(electionId, constituencyId, 101, 'Bansuri Swaraj', 'BJP')).wait();
  await (await contract.registerCandidate(electionId, constituencyId, 102, 'Somnath Bharti', 'AAP')).wait();
  await (await contract.setElectionStatus(electionId, 1)).wait(); // 1 = Active

  // 1. Valid EIP-712 voting authorization and on-chain vote cast
  await t.test('1. Valid EIP-712 authorization ticket executes successfully and updates tallies', async () => {
    const nullifier1 = deriveServerNullifier('IND-DL-982341', electionId);
    const expiry = now + 1800; // +30 minutes

    const ticket1 = await signVotingAuthorization(
      electionId,
      constituencyId,
      voter1Address,
      nullifier1,
      expiry,
      chainId,
      contractAddress,
      authSignerWallet.privateKey
    );

    // Initial tally check
    const candBefore = await contract.getCandidate(electionId, constituencyId, 101);
    assert.equal(candBefore.voteCount, 0n);

    // Cast vote from voter1
    const voterContract = contract.connect(voter1) as any;
    const tx = await voterContract.castVote(
      electionId,
      constituencyId,
      101,
      nullifier1,
      expiry,
      ticket1.signature
    );
    const receipt = await tx.wait();
    assert.equal(receipt.status, 1, 'Transaction must succeed');

    // Verify candidate voteCount incremented
    const candAfter = await contract.getCandidate(electionId, constituencyId, 101);
    assert.equal(candAfter.voteCount, 1n, 'Candidate vote count must be 1');

    // Verify total election votes incremented
    const electionData = await contract.getElection(electionId);
    assert.equal(electionData.totalVotes, 1n, 'Total votes must be 1');

    // Verify nullifier marked as spent
    const isSpent = await contract.isNullifierSpent(electionId, nullifier1);
    assert.equal(isSpent, true, 'Nullifier must be marked spent on-chain');
  });

  // 2. Single-use nullifier duplicate vote prevention
  await t.test('2. Duplicate vote attempt with identical nullifier strictly reverts', async () => {
    const nullifier1 = deriveServerNullifier('IND-DL-982341', electionId);
    const expiry = now + 1800;

    const ticket1 = await signVotingAuthorization(
      electionId,
      constituencyId,
      voter1Address,
      nullifier1,
      expiry,
      chainId,
      contractAddress,
      authSignerWallet.privateKey
    );

    const voterContract = contract.connect(voter1) as any;
    await assert.rejects(
      async () => {
        await voterContract.castVote.staticCall(
          electionId,
          constituencyId,
          101,
          nullifier1,
          expiry,
          ticket1.signature
        );
      },
      /BlockBallot: Nullifier already spent/
    );
  });

  // 3. Forged signature rejection
  await t.test('3. Forged EIP-712 signature from unauthorized key is rejected', async () => {
    const rogueSigner = ethers.Wallet.createRandom();
    const nullifier2 = deriveServerNullifier('IND-DL-112233', electionId);
    const expiry = now + 1800;

    const forgedTicket = await signVotingAuthorization(
      electionId,
      constituencyId,
      voter2Address,
      nullifier2,
      expiry,
      chainId,
      contractAddress,
      rogueSigner.privateKey
    );

    const voter2Contract = contract.connect(voter2) as any;
    await assert.rejects(
      async () => {
        await voter2Contract.castVote.staticCall(
          electionId,
          constituencyId,
          102,
          nullifier2,
          expiry,
          forgedTicket.signature
        );
      },
      /BlockBallot: Invalid or forged EIP-712 voting authorization/
    );
  });

  // 4. Sender binding check (wrong wallet)
  await t.test('4. Ballot submitted from unbonded wallet is rejected', async () => {
    const nullifier3 = deriveServerNullifier('IND-DL-445566', electionId);
    const expiry = now + 1800;

    // Ticket authorized specifically for voter2
    const ticketVoter2 = await signVotingAuthorization(
      electionId,
      constituencyId,
      voter2Address,
      nullifier3,
      expiry,
      chainId,
      contractAddress,
      authSignerWallet.privateKey
    );

    // Attempt to submit from rogueVoter
    const rogueContract = contract.connect(rogueVoter) as any;
    await assert.rejects(
      async () => {
        await rogueContract.castVote.staticCall(
          electionId,
          constituencyId,
          101,
          nullifier3,
          expiry,
          ticketVoter2.signature
        );
      },
      /BlockBallot: Invalid or forged EIP-712 voting authorization/
    );
  });

  // 5. Expired authorization ticket rejection
  await t.test('5. Expired authorization ticket is rejected on-chain', async () => {
    const nullifierExpired = deriveServerNullifier('IND-DL-778899', electionId);
    const expiredTimestamp = now - 60; // Expired 1 minute ago

    const expiredTicket = await signVotingAuthorization(
      electionId,
      constituencyId,
      voter2Address,
      nullifierExpired,
      expiredTimestamp,
      chainId,
      contractAddress,
      authSignerWallet.privateKey
    );

    const voter2Contract = contract.connect(voter2) as any;
    await assert.rejects(
      async () => {
        await voter2Contract.castVote.staticCall(
          electionId,
          constituencyId,
          101,
          nullifierExpired,
          expiredTimestamp,
          expiredTicket.signature
        );
      },
      /BlockBallot: Authorization ticket expired/
    );
  });

  // 6. Invalid candidate / constituency combinations
  await t.test('6. Unregistered candidate ID in constituency reverts', async () => {
    const nullifierUnreg = deriveServerNullifier('IND-DL-990011', electionId);
    const expiry = now + 1800;

    const ticket = await signVotingAuthorization(
      electionId,
      constituencyId,
      voter2Address,
      nullifierUnreg,
      expiry,
      chainId,
      contractAddress,
      authSignerWallet.privateKey
    );

    const voter2Contract = contract.connect(voter2) as any;
    // Candidate 999 does not exist in Constituency 4
    await assert.rejects(
      async () => {
        await voter2Contract.castVote.staticCall(
          electionId,
          constituencyId,
          999,
          nullifierUnreg,
          expiry,
          ticket.signature
        );
      },
      /BlockBallot: Candidate not registered in this constituency/
    );
  });

  // 7. ChainId and VerifyingContract domain binding
  await t.test('7. Signature created for wrong chainId or contract address is rejected', async () => {
    const nullifierCross = deriveServerNullifier('IND-DL-334455', electionId);
    const expiry = now + 1800;

    // Wrong chainId (e.g. 1 instead of 31337)
    const ticketWrongChain = await signVotingAuthorization(
      electionId,
      constituencyId,
      voter2Address,
      nullifierCross,
      expiry,
      1, // Mainnet chain ID
      contractAddress,
      authSignerWallet.privateKey
    );

    const voter2Contract = contract.connect(voter2) as any;
    await assert.rejects(
      async () => {
        await voter2Contract.castVote.staticCall(
          electionId,
          constituencyId,
          102,
          nullifierCross,
          expiry,
          ticketWrongChain.signature
        );
      },
      /BlockBallot: Invalid or forged EIP-712 voting authorization/
    );

    // Wrong contract address
    const ticketWrongContract = await signVotingAuthorization(
      electionId,
      constituencyId,
      voter2Address,
      nullifierCross,
      expiry,
      chainId,
      ethers.ZeroAddress,
      authSignerWallet.privateKey
    );

    await assert.rejects(
      async () => {
        await voter2Contract.castVote.staticCall(
          electionId,
          constituencyId,
          102,
          nullifierCross,
          expiry,
          ticketWrongContract.signature
        );
      },
      /BlockBallot: Invalid or forged EIP-712 voting authorization/
    );
  });
});
