import test from 'node:test';
import assert from 'node:assert/strict';
import { ethers } from 'ethers';
import {
  deriveNullifier,
  hashOtpCode,
  signVotingAuthorization,
  verifyVotingAuthorization,
  DEMO_AUTHORIZATION_SIGNER_ADDRESS,
  DEMO_AUTHORIZATION_SIGNER_PRIVATE_KEY,
} from '../utils/crypto';
import { evmSimulator } from '../utils/evmSimulator';

test('Cryptographic nullifier derivation is deterministic and bound to electionId', () => {
  const epic = 'IND-DL-982341';
  const nullifier1 = deriveNullifier(epic, 18);
  const nullifier2 = deriveNullifier(epic, 18);
  const nullifierOtherElection = deriveNullifier(epic, 19);

  assert.equal(nullifier1, nullifier2, 'Identical EPIC and electionId must yield identical nullifier');
  assert.notEqual(nullifier1, nullifierOtherElection, 'Different electionId must produce distinct nullifiers');
  assert.equal(nullifier1.startsWith('0x'), true, 'Nullifier must be a valid hex string');
});

test('HMAC OTP code hashing preserves confidentiality', () => {
  const epic = 'IND-DL-982341';
  const hash1 = hashOtpCode('481920', epic);
  const hash2 = hashOtpCode('481920', epic);
  const hashDifferent = hashOtpCode('481921', epic);

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hashDifferent);
  assert.equal(hash1.length, 66, 'Hash must be 32 bytes hex encoded with 0x prefix');
});

test('EIP-712 typed voting authorization generates valid verifiable signatures', async () => {
  const wallet = ethers.Wallet.createRandom();
  const nullifier = deriveNullifier('IND-DL-982341', 18);
  const expiry = Math.floor(Date.now() / 1000) + 900; // +15 mins

  const ticket = await signVotingAuthorization(
    18,
    4,
    wallet.address,
    nullifier,
    expiry,
    31337,
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    DEMO_AUTHORIZATION_SIGNER_PRIVATE_KEY
  );

  const verification = verifyVotingAuthorization(ticket, DEMO_AUTHORIZATION_SIGNER_ADDRESS);
  assert.equal(verification.isValid, true, 'Valid authorization ticket signature must pass');
  assert.equal(verification.recoveredSigner.toLowerCase(), DEMO_AUTHORIZATION_SIGNER_ADDRESS.toLowerCase());

  // Test forgery with different private key
  const rogueWallet = ethers.Wallet.createRandom();
  const rogueTicket = await signVotingAuthorization(
    18,
    4,
    wallet.address,
    nullifier,
    expiry,
    31337,
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    rogueWallet.privateKey
  );
  const rogueCheck = verifyVotingAuthorization(rogueTicket, DEMO_AUTHORIZATION_SIGNER_ADDRESS);
  assert.equal(rogueCheck.isValid, false, 'Forged signature must be rejected');

  // Test tampered wallet
  const tamperedTicket = { ...ticket, voterWallet: rogueWallet.address };
  const tamperedCheck = verifyVotingAuthorization(tamperedTicket, DEMO_AUTHORIZATION_SIGNER_ADDRESS);
  assert.equal(tamperedCheck.isValid, false, 'Tampered parameters must fail verification');
});

test('EVM Simulator enforces duplicate-nullifier prevention and valid receipt watermarks', async () => {
  const voterWallet = ethers.Wallet.createRandom();
  const nullifier = deriveNullifier('IND-DL-339210', 18);
  const expiry = Math.floor(Date.now() / 1000) + 600;

  const ticket = await signVotingAuthorization(
    18,
    4,
    voterWallet.address,
    nullifier,
    expiry,
    31337,
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    DEMO_AUTHORIZATION_SIGNER_PRIVATE_KEY
  );

  // First vote attempt
  const res1 = await evmSimulator.castVote(
    voterWallet.address,
    ticket,
    101,
    'Bansuri Swaraj',
    'BJP',
    'New Delhi'
  );

  assert.equal(res1.success, true, 'First legitimate vote must succeed');
  assert.ok(res1.receipt, 'Receipt must be generated');
  assert.equal(res1.receipt.isSimulated, true);
  assert.ok(res1.receipt.watermark.includes('SIMULATED ACADEMIC DEMO RECEIPT'));

  // Duplicate vote attempt with same nullifier
  const resDuplicate = await evmSimulator.castVote(
    voterWallet.address,
    ticket,
    101,
    'Bansuri Swaraj',
    'BJP',
    'New Delhi'
  );

  assert.equal(resDuplicate.success, false, 'Duplicate nullifier must be strictly rejected');
  assert.ok(resDuplicate.error?.includes('Double-voting violation'));

  // Test wrong sender wallet
  const differentWallet = ethers.Wallet.createRandom();
  const nullifierFresh = deriveNullifier('IND-UP-441209', 18);
  const ticketFresh = await signVotingAuthorization(
    18,
    77,
    voterWallet.address,
    nullifierFresh,
    expiry,
    31337,
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    DEMO_AUTHORIZATION_SIGNER_PRIVATE_KEY
  );

  const resWrongSender = await evmSimulator.castVote(
    differentWallet.address,
    ticketFresh,
    201,
    'Narendra Modi',
    'BJP',
    'Varanasi'
  );
  assert.equal(resWrongSender.success, false, 'Submission from unbonded wallet must fail');
  assert.ok(resWrongSender.error?.includes('does not match authorized wallet'));
});
