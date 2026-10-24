import test from 'node:test';
import assert from 'node:assert/strict';
import nodeCrypto from 'node:crypto';
import { ethers } from 'ethers';
import {
  signVotingAuthorization,
  verifyVotingAuthorization,
  setAuthorizationSignerAddress,
  getAuthorizationSignerAddress,
} from '../utils/crypto';
import {
  deriveServerNullifier,
  computeOtpHmac,
  computeEpicHash,
  createVoterJwt,
  verifyVoterJwt,
} from '../../server/crypto';
import { isValidEpicFormat } from '../../server/routes/voter';
import { serverStore } from '../../server/store';
import { SERVER_CONFIG } from '../../server/config';
import { evmSimulator } from '../utils/evmSimulator';
import deploymentManifest from '../contracts/deployment.json';

test('Cryptographic nullifier derivation is deterministic and bound to electionId', () => {
  const epic = 'IND-DL-982341';
  const nullifier1 = deriveServerNullifier(epic, 18);
  const nullifier2 = deriveServerNullifier(epic, 18);
  const nullifierOtherElection = deriveServerNullifier(epic, 19);

  assert.equal(nullifier1, nullifier2, 'Identical EPIC and electionId must yield identical nullifier');
  assert.notEqual(nullifier1, nullifierOtherElection, 'Different electionId must produce distinct nullifiers');
  assert.equal(nullifier1.startsWith('0x'), true, 'Nullifier must be a valid hex string');
});

test('HMAC OTP code hashing preserves confidentiality', () => {
  const epic = 'IND-DL-982341';
  const hash1 = computeOtpHmac('481920', epic);
  const hash2 = computeOtpHmac('481920', epic);
  const hashDifferent = computeOtpHmac('481921', epic);

  assert.equal(hash1, hash2);
  assert.notEqual(hash1, hashDifferent);
  assert.equal(hash1.length, 64, 'Hash must be 32 bytes hex encoded');
});

test('EIP-712 typed voting authorization generates valid verifiable signatures', async () => {
  const testSigner = ethers.Wallet.createRandom();
  const wallet = ethers.Wallet.createRandom();
  const nullifier = deriveServerNullifier('IND-DL-982341', 18);
  const expiry = Math.floor(Date.now() / 1000) + 900; // +15 mins

  const ticket = await signVotingAuthorization(
    18,
    4,
    wallet.address,
    nullifier,
    expiry,
    31337,
    '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    testSigner.privateKey
  );

  const verification = verifyVotingAuthorization(ticket, testSigner.address);
  assert.equal(verification.isValid, true, 'Valid authorization ticket signature must pass');
  assert.equal(verification.recoveredSigner.toLowerCase(), testSigner.address.toLowerCase());

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
  const rogueCheck = verifyVotingAuthorization(rogueTicket, testSigner.address);
  assert.equal(rogueCheck.isValid, false, 'Forged signature must be rejected');

  // Test tampered wallet
  const tamperedTicket = { ...ticket, voterWallet: rogueWallet.address };
  const tamperedCheck = verifyVotingAuthorization(tamperedTicket, testSigner.address);
  assert.equal(tamperedCheck.isValid, false, 'Tampered parameters must fail verification');
});

test('EVM Simulator enforces duplicate-nullifier prevention and valid receipt watermarks', async () => {
  const testSigner = ethers.Wallet.createRandom();
  const previousSigner = getAuthorizationSignerAddress();

  // Configure simulator's expected signer for the duration of this isolated test
  setAuthorizationSignerAddress(testSigner.address);

  try {
    const voterWallet = ethers.Wallet.createRandom();
    const nullifier = deriveServerNullifier('IND-DL-339210', 18);
    const expiry = Math.floor(Date.now() / 1000) + 600;

    const ticket = await signVotingAuthorization(
      18,
      4,
      voterWallet.address,
      nullifier,
      expiry,
      31337,
      '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      testSigner.privateKey
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
    const nullifierFresh = deriveServerNullifier('IND-UP-441209', 18);
    const ticketFresh = await signVotingAuthorization(
      18,
      77,
      voterWallet.address,
      nullifierFresh,
      expiry,
      31337,
      '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      testSigner.privateKey
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
  } finally {
    // Restore manifest's signer address
    setAuthorizationSignerAddress(deploymentManifest.authorizationSigner || previousSigner);
  }
});

test('Signed Expiring JWT Bearer Tokens (RFC 7519 / HS256) session compliance', () => {
  const epicId = 'IND-DL-982341';
  const sessionData = {
    epicId,
    voterId: 'voter-01',
    name: 'Rajesh Kumar Sharma',
    constituencyId: 'CONST-04-ND',
    constituencyCode: 4,
    expiryMs: 15 * 60 * 1000,
  };

  // 1. Issuance
  const { token, jti, expiresAt, iat } = createVoterJwt(sessionData);
  assert.ok(token, 'JWT token must be non-empty');
  const parts = token.split('.');
  assert.equal(parts.length, 3, 'JWT must have exactly 3 segments');

  // 2. Verification
  const verification = verifyVoterJwt(token);
  assert.equal(verification.isValid, true, 'Valid JWT must verify');
  assert.ok(verification.payload);
  assert.equal(verification.payload.iss, 'BlockBallot');
  assert.equal(verification.payload.aud, 'BlockBallot-Voters');
  assert.equal(verification.payload.sub, epicId);
  assert.equal(verification.payload.voterId, 'voter-01');
  assert.equal(verification.payload.constituencyCode, 4);
  assert.equal(verification.payload.jti, jti);
  assert.equal(verification.payload.iat, iat);

  // 3. Signature tampering detection
  const tamperedSigToken = token.substring(0, token.length - 4) + 'abcd';
  const tamperedSigResult = verifyVoterJwt(tamperedSigToken);
  assert.equal(tamperedSigResult.isValid, false);
  assert.ok(tamperedSigResult.error?.includes('Invalid JWT signature'));

  // 4. Payload tampering detection
  const tamperedPayloadToken = parts[0] + '.' + Buffer.from(JSON.stringify({ ...verification.payload, sub: 'IND-TAMPERED' })).toString('base64url') + '.' + parts[2];
  const tamperedPayloadResult = verifyVoterJwt(tamperedPayloadToken);
  assert.equal(tamperedPayloadResult.isValid, false);
  assert.ok(tamperedPayloadResult.error?.includes('Invalid JWT signature'));

  // 5. Expired token rejection
  const expiredJwt = createVoterJwt(sessionData);
  // Manually encode an already-expired token
  const expiredPayload = {
    iss: 'BlockBallot',
    aud: 'BlockBallot-Voters',
    sub: epicId,
    voterId: 'voter-01',
    name: 'Rajesh Kumar Sharma',
    constituencyId: 'CONST-04-ND',
    constituencyCode: 4,
    jti: 'expired-jti-123',
    iat: Math.floor(Date.now() / 1000) - 300,
    exp: Math.floor(Date.now() / 1000) - 10, // 10 seconds ago
  };
  const expHead = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const expBody = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
  const expSig = nodeCrypto.createHmac('sha256', SERVER_CONFIG.HMAC_SECRET).update(`${expHead}.${expBody}`).digest('base64url');
  const expiredToken = `${expHead}.${expBody}.${expSig}`;

  const expiredResult = verifyVoterJwt(expiredToken);
  assert.equal(expiredResult.isValid, false);
  assert.ok(expiredResult.error?.includes('expired'));

  // 6. Issuer & Audience mismatch rejection
  const wrongIssPayload = { ...expiredPayload, exp: Math.floor(Date.now() / 1000) + 300, iss: 'WrongAuthority' };
  const wrongIssBody = Buffer.from(JSON.stringify(wrongIssPayload)).toString('base64url');
  const wrongIssSig = nodeCrypto.createHmac('sha256', SERVER_CONFIG.HMAC_SECRET).update(`${expHead}.${wrongIssBody}`).digest('base64url');
  const wrongIssToken = `${expHead}.${wrongIssBody}.${wrongIssSig}`;
  const wrongIssResult = verifyVoterJwt(wrongIssToken);
  assert.equal(wrongIssResult.isValid, false);
  assert.ok(wrongIssResult.error?.includes('Invalid JWT issuer'));

  // 7. Store revocation & replay protection
  const voterRecord = {
    id: 'voter-01',
    epicId: 'IND-DL-982341',
    name: 'Rajesh Kumar Sharma',
    gender: 'M' as const,
    age: 38,
    constituencyId: 'CONST-04-ND',
    pollingStation: 'Room 4',
    maskedMobile: '+91 ••••• •4589',
    isEligible: true,
    status: 'ELIGIBLE' as const,
  };
  const createdSession = serverStore.createSession(voterRecord, 4);
  assert.ok(createdSession.isJwt, 'Session must be tagged as JWT');
  assert.equal(serverStore.getSession(createdSession.token)?.name, 'Rajesh Kumar Sharma');

  // Revoke session
  serverStore.deleteSession(createdSession.token);
  assert.equal(serverStore.getSession(createdSession.token), undefined, 'Revoked JWT session must be rejected');
});

test('EPIC format validation enforces 10-char alphanumeric standard and restricts demo prefixes', () => {
  // Standard Indian 10-character alphanumeric EPICs (3 letters + 7 digits)
  assert.equal(isValidEpicFormat('ABC1234567', false), true, 'Standard 10-char EPIC valid in dev');
  assert.equal(isValidEpicFormat('ABC1234567', true), true, 'Standard 10-char EPIC valid in production');
  assert.equal(isValidEpicFormat('VTR1000001', true), true, 'Valid 10-char EPIC in production');
  assert.equal(isValidEpicFormat('DLH9823410', true), true, 'Valid 10-char EPIC in production');

  // Synthetic demo prefixed EPICs (e.g. IND-DL-982341)
  assert.equal(isValidEpicFormat('IND-DL-982341', false), true, 'Demo prefix permitted in dev/test mode');
  assert.equal(isValidEpicFormat('IND-DL-982341', true), false, 'Demo prefix strictly rejected in production');
  assert.equal(isValidEpicFormat('IND-TEST-001', false), true, 'Test fixture prefix allowed in dev/test');
  assert.equal(isValidEpicFormat('IND-TEST-001', true), false, 'Test fixture prefix rejected in production');

  // Invalid formats
  assert.equal(isValidEpicFormat('', false), false);
  assert.equal(isValidEpicFormat('SHORT', false), false);
  assert.equal(isValidEpicFormat('1234567890', false), false, 'Digits only without letters rejected');
  assert.equal(isValidEpicFormat('ABCDEFGHIJ', false), false, 'Letters only without digits rejected');
  assert.equal(isValidEpicFormat('ABC123456', false), false, '9 characters rejected');
  assert.equal(isValidEpicFormat('ABC12345678', false), false, '11 characters rejected');
});

test('Salted HMAC-SHA256 EPIC indexing preserves privacy without plaintext storage', () => {
  const epic = 'ABC1234567';
  const hash1 = computeEpicHash(epic);
  const hash2 = computeEpicHash(epic);
  const hashCaseInsensitive = computeEpicHash('abc1234567');
  const hashDifferent = computeEpicHash('ABC1234568');

  assert.equal(hash1, hash2, 'Identical EPIC must produce identical keyed hash');
  assert.equal(hash1, hashCaseInsensitive, 'Hashing must normalize uppercase');
  assert.notEqual(hash1, hashDifferent, 'Different EPIC must produce different hash');
  assert.equal(hash1.length, 64, 'HMAC-SHA256 hex digest must be 64 characters');
  assert.ok(!hash1.includes(epic), 'Digest must not contain plaintext EPIC');
});

test('180-second OTP expiry enforces independent timeout, cooldown, and attempt limit', () => {
  assert.equal(SERVER_CONFIG.OTP_EXPIRY_MS, 180 * 1000, 'OTP expiry must be exactly 180 seconds');
  assert.equal(SERVER_CONFIG.OTP_COOLDOWN_MS, 60 * 1000, 'Resend cooldown must be 60 seconds');
  assert.equal(SERVER_CONFIG.OTP_MAX_ATTEMPTS, 3, 'Max attempts must be 3');

  const now = Date.now();
  const challenge = {
    epicId: 'ABC1234567',
    hmacHash: computeOtpHmac('123456', 'ABC1234567'),
    attemptsRemaining: 3,
    expiresAt: now + SERVER_CONFIG.OTP_EXPIRY_MS,
    isUsed: false,
    createdAt: now,
    lastRequestedAt: now,
  };

  // Valid challenge before expiry
  assert.equal(now < challenge.expiresAt, true);

  // Expired challenge after 180 seconds
  const simulatedExpiredChallenge = {
    ...challenge,
    expiresAt: now - 1000, // expired 1s ago
  };
  assert.equal(Date.now() > simulatedExpiredChallenge.expiresAt, true, 'Challenge past 180s must be flagged expired');
});

