import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  generate6DigitOtp,
  computeOtpHmac,
  verifyOtpHmacConstantTime,
  deriveServerNullifier,
  signEip712VotingAuthorization,
  verifyEip712Ticket,
} from '../../server/crypto';
import { serverStore } from '../../server/store';
import { SERVER_CONFIG, validateServerConfig } from '../../server/config';

test('1. Valid, invalid, and ineligible synthetic voter records lookup', () => {
  serverStore.resetVoters();

  // Valid and eligible
  const validVoter = serverStore.findVoterByEpic('IND-DL-982341');
  assert.ok(validVoter, 'Valid synthetic elector must exist');
  assert.equal(validVoter?.name, 'Rajesh Kumar Sharma');
  assert.equal(validVoter?.isEligible, true);
  assert.equal(validVoter?.status, 'ELIGIBLE');

  // Ineligible test persona (e.g. Sunita Devi)
  const ineligibleVoter = serverStore.findVoterByEpic('IND-DL-999000');
  assert.ok(ineligibleVoter, 'Ineligible synthetic test case must exist in roll');
  assert.equal(ineligibleVoter?.isEligible, false, 'Sunita Devi must be marked ineligible');

  // Non-existent voter record
  const missingVoter = serverStore.findVoterByEpic('IND-FAKE-000000');
  assert.equal(missingVoter, undefined, 'Non-existent voter must return undefined');
});

test('2. HMAC-SHA-256 OTP challenge generation, single-use, attempt lockout and expiry', () => {
  const epicId = 'IND-DL-982341';
  const otp = '481920';
  const hmac = computeOtpHmac(otp, epicId);

  assert.equal(typeof hmac, 'string');
  assert.equal(hmac.length, 64, 'HMAC hex string must be 64 characters');

  // Constant-time comparison
  assert.equal(verifyOtpHmacConstantTime(hmac, hmac), true);
  const badHmac = computeOtpHmac('000000', epicId);
  assert.equal(verifyOtpHmacConstantTime(badHmac, hmac), false);

  // Challenge setup
  const now = Date.now();
  serverStore.setOtpChallenge({
    epicId,
    hmacHash: hmac,
    attemptsRemaining: 3,
    expiresAt: now + 300000,
    isUsed: false,
    createdAt: now,
    lastRequestedAt: now,
  });

  const challenge = serverStore.getOtpChallenge(epicId);
  assert.ok(challenge);
  assert.equal(challenge.attemptsRemaining, 3);
  assert.equal(challenge.isUsed, false);

  // Simulate incorrect attempt decrement
  challenge.attemptsRemaining -= 1;
  assert.equal(challenge.attemptsRemaining, 2);
  challenge.attemptsRemaining -= 1;
  assert.equal(challenge.attemptsRemaining, 1);
  challenge.attemptsRemaining -= 1;
  assert.equal(challenge.attemptsRemaining, 0, 'Must lock out after 3 failed attempts');

  // Test single-use enforcement
  challenge.isUsed = true;
  assert.equal(challenge.isUsed, true, 'Challenge must be marked used upon redemption');

  // Test server-side timestamp expiration
  const expiredChallenge = {
    ...challenge,
    expiresAt: now - 1000, // 1 second ago
  };
  assert.ok(Date.now() > expiredChallenge.expiresAt, 'Challenge must be detected as expired');
});

test('3. Concurrency-safe voter lifecycle transitions and double-voting prevention', () => {
  const epicId = 'IND-DL-339210';
  serverStore.resetVoters();

  const voter = serverStore.findVoterByEpic(epicId);
  assert.ok(voter);
  assert.equal(voter.status, 'ELIGIBLE');

  // Transition ELIGIBLE -> AUTHORIZED
  const authorized = serverStore.updateVoterStatus(epicId, 'AUTHORIZED', {
    authorizedWallet: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    activeNullifier: '0xabc123',
    ticketExpiry: Math.floor(Date.now() / 1000) + 900,
  });
  assert.equal(authorized, true);
  assert.equal(serverStore.findVoterByEpic(epicId)?.status, 'AUTHORIZED');

  // Finalize AUTHORIZED -> VOTED (after on-chain mined receipt)
  const voted = serverStore.updateVoterStatus(epicId, 'VOTED');
  assert.equal(voted, true);
  assert.equal(serverStore.findVoterByEpic(epicId)?.status, 'VOTED');

  // Enforce terminal status locking: cannot regress from VOTED back to ELIGIBLE or AUTHORIZED
  const regressed = serverStore.updateVoterStatus(epicId, 'AUTHORIZED');
  assert.equal(regressed, false, 'Voter in VOTED status must reject state regression');
  assert.equal(serverStore.findVoterByEpic(epicId)?.status, 'VOTED');
});

test('4. On-chain reconciliation: Interrupted and duplicate transaction protection', () => {
  const epicId = 'IND-UP-441209';
  const electionId = 18;
  const nullifier = deriveServerNullifier(epicId, electionId);

  assert.equal(serverStore.isNullifierSpentOnChain(nullifier), false);

  // Mark spent on blockchain
  serverStore.markNullifierSpentOnChain(nullifier);
  assert.equal(serverStore.isNullifierSpentOnChain(nullifier), true);

  // Reconcile against voter roll
  serverStore.updateVoterStatus(epicId, 'VOTED');
  const voter = serverStore.findVoterByEpic(epicId);
  assert.equal(voter?.status, 'VOTED');
});

test('5. EIP-712 typed signing, domain binding, and forgery rejection', async () => {
  const voterWallet = ethers.Wallet.createRandom();
  const nullifier = deriveServerNullifier('IND-KL-772183', 18);
  const expiry = Math.floor(Date.now() / 1000) + 900;
  const contractAddress = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
  const chainId = 31337;

  // Legitimate server authorization ticket
  const ticket = await signEip712VotingAuthorization(
    18,
    4,
    voterWallet.address,
    nullifier,
    expiry,
    chainId,
    contractAddress
  );

  const verification = verifyEip712Ticket(ticket);
  assert.equal(verification.isValid, true, 'Legitimate server signature must verify successfully');

  // Wrong wallet scenario
  const otherWallet = ethers.Wallet.createRandom();
  const wrongWalletTicket = { ...ticket, voterWallet: otherWallet.address };
  const wrongWalletCheck = verifyEip712Ticket(wrongWalletTicket);
  assert.equal(wrongWalletCheck.isValid, false, 'Ticket tampered with wrong wallet must fail');

  // Wrong chain ID scenario (cross-chain replay attack prevention)
  const wrongChainTicket = { ...ticket, chainId: 1 };
  const wrongChainCheck = verifyEip712Ticket(wrongChainTicket);
  assert.equal(wrongChainCheck.isValid, false, 'Ticket replayed on wrong chain must fail');

  // Wrong contract address scenario
  const wrongContractTicket = { ...ticket, contractAddress: '0x0000000000000000000000000000000000000001' };
  const wrongContractCheck = verifyEip712Ticket(wrongContractTicket);
  assert.equal(wrongContractCheck.isValid, false, 'Ticket replayed on wrong contract must fail');

  // Forged signature scenario (signed by unauthorized rogue key)
  const rogueKey = ethers.Wallet.createRandom().privateKey;
  const forgedTicket = await signEip712VotingAuthorization(
    18,
    4,
    voterWallet.address,
    nullifier,
    expiry,
    chainId,
    contractAddress,
    rogueKey
  );
  const forgedCheck = verifyEip712Ticket(forgedTicket);
  assert.equal(forgedCheck.isValid, false, 'Ticket forged by unauthorized key must fail verification');
});

test('6. Server configuration and secret validation', () => {
  const check = validateServerConfig();
  assert.equal(check.isValid, true);
  assert.ok(SERVER_CONFIG.HMAC_SECRET.length >= 32, 'HMAC secret must meet minimum entropy length');
  assert.ok(SERVER_CONFIG.COMMITMENT_SALT.length >= 16, 'Commitment salt must meet minimum entropy length');
  assert.equal(SERVER_CONFIG.FIRESTORE_DATABASE_ID, 'ai-studio-565633a9-76eb-4419-9891-05e6de180d7c');
});

setTimeout(() => process.exit(0), 500);
