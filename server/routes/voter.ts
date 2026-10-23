import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { ethers } from 'ethers';
import { SERVER_CONFIG } from '../config';
import {
  generate6DigitOtp,
  computeOtpHmac,
  verifyOtpHmacConstantTime,
  deriveServerNullifier,
  signEip712VotingAuthorization,
} from '../crypto';
import { serverStore } from '../store';
import { INITIAL_CONSTITUENCIES } from '../../src/data/mockData';

export const voterRouter = Router();

// Rate limiting in-memory map: IP/epicId -> timestamp
const rateLimitMap: Map<string, number> = new Map();

function checkRateLimit(key: string, limitMs: number): { allowed: boolean; remainingSec: number } {
  const now = Date.now();
  const lastTime = rateLimitMap.get(key) || 0;
  if (now - lastTime < limitMs) {
    const remainingSec = Math.ceil((limitMs - (now - lastTime)) / 1000);
    return { allowed: false, remainingSec };
  }
  rateLimitMap.set(key, now);
  return { allowed: true, remainingSec: 0 };
}

/**
 * GET /api/voter/config
 * Exposes non-sensitive public cryptographic configuration (derived signer address, domain, chainId).
 */
voterRouter.get('/config', (_req: Request, res: Response): void => {
  res.status(200).json({
    success: true,
    authorizationSignerAddress: SERVER_CONFIG.AUTHORIZATION_SIGNER_PRIVATE_KEY
      ? new ethers.Wallet(SERVER_CONFIG.AUTHORIZATION_SIGNER_PRIVATE_KEY).address
      : null,
    chainId: 31337,
    domainName: 'BlockBallot',
    domainVersion: '1',
  });
});

/**
 * POST /api/voter/verify
 * Initiates synthetic voter verification and issues an HMAC-SHA256 protected OTP challenge.
 */
voterRouter.post('/verify', async (req: Request, res: Response): Promise<void> => {
  const { epicId } = req.body;

  if (!epicId || typeof epicId !== 'string' || epicId.trim().length < 5) {
    res.status(400).json({
      success: false,
      message: 'Invalid voter identification format provided.',
    });
    return;
  }

  const formattedEpic = epicId.trim().toUpperCase();

  // Enforce 60-second cooldown per EPIC ID
  const cooldownCheck = checkRateLimit(`otp_${formattedEpic}`, SERVER_CONFIG.OTP_COOLDOWN_MS);
  if (!cooldownCheck.allowed) {
    res.status(429).json({
      success: false,
      message: `Please wait ${cooldownCheck.remainingSec} seconds before requesting another verification challenge.`,
      cooldownRemaining: cooldownCheck.remainingSec,
    });
    return;
  }

  const voter = serverStore.findVoterByEpic(formattedEpic);

  // Generic response pattern to prevent elector roll enumeration attacks
  if (!voter || !voter.isEligible) {
    serverStore.logSecure('Voter verification request failed eligibility check or not found', { epicId: formattedEpic });
    res.status(200).json({
      success: true,
      message: 'If the provided synthetic identity is enrolled and eligible, a verification challenge has been initiated.',
      maskedMobile: '+91 ••••• •••••',
      status: 'CHALLENGE_ISSUED',
    });
    return;
  }

  // Double voting protection: reject if already voted
  if (voter.status === 'VOTED') {
    res.status(403).json({
      success: false,
      message: 'This elector record has already completed an authorized vote in this election. Further challenges are prohibited.',
      status: 'ALREADY_VOTED',
    });
    return;
  }

  // Generate 6-digit OTP and compute server-side HMAC
  const otp = generate6DigitOtp();
  const hmacHash = computeOtpHmac(otp, formattedEpic);
  const now = Date.now();

  serverStore.setOtpChallenge({
    epicId: formattedEpic,
    hmacHash,
    attemptsRemaining: SERVER_CONFIG.OTP_MAX_ATTEMPTS,
    expiresAt: now + SERVER_CONFIG.OTP_EXPIRY_MS,
    isUsed: false,
    createdAt: now,
    lastRequestedAt: now,
  });

  // Record into test delivery adapter for dev inspection
  serverStore.recordTestOtpDelivery(formattedEpic, otp);
  serverStore.logSecure('Dispatched OTP challenge for synthetic voter', { epicId: formattedEpic });

  res.status(200).json({
    success: true,
    message: 'Verification challenge initiated. Check registered destination for your 6-digit OTP.',
    epicId: formattedEpic,
    name: voter.name,
    maskedMobile: voter.maskedMobile,
    status: 'CHALLENGE_ISSUED',
    // In academic demo/development mode, provide the synthetic test delivery code
    // Strictly omitted in production configurations
    ...(SERVER_CONFIG.NODE_ENV !== 'production' && {
      testDeliveryCode: otp,
      testNotice: 'Academic Demo: testDeliveryCode included because live SMS gateway is unconfigured.',
    }),
  });
});

/**
 * POST /api/voter/verify-otp
 * Verifies the submitted 6-digit OTP against the persistent HMAC challenge.
 */
voterRouter.post('/verify-otp', async (req: Request, res: Response): Promise<void> => {
  const { epicId, otp } = req.body;

  if (!epicId || !otp || typeof otp !== 'string' || otp.trim().length !== 6) {
    res.status(400).json({
      success: false,
      message: 'Please provide a valid 6-digit verification code.',
    });
    return;
  }

  const formattedEpic = epicId.trim().toUpperCase();
  const challenge = serverStore.getOtpChallenge(formattedEpic);

  if (!challenge) {
    res.status(400).json({
      success: false,
      message: 'No active verification challenge found for this elector. Please request an OTP first.',
    });
    return;
  }

  // 1. Single-use guard
  if (challenge.isUsed) {
    res.status(400).json({
      success: false,
      message: 'This verification code challenge has already been consumed. Please request a fresh challenge.',
    });
    return;
  }

  // 2. Server-side timestamp expiration check (independent of Firestore TTL)
  const now = Date.now();
  if (now > challenge.expiresAt) {
    res.status(400).json({
      success: false,
      message: 'The verification code challenge has expired. Challenges are valid for 5 minutes only.',
    });
    return;
  }

  // 3. Attempt count lockout check
  if (challenge.attemptsRemaining <= 0) {
    res.status(403).json({
      success: false,
      message: 'Maximum verification attempts exceeded. For security, this challenge is locked. Please request a new OTP.',
    });
    return;
  }

  // 4. Constant-time HMAC comparison
  const submittedHmac = computeOtpHmac(otp.trim(), formattedEpic);
  const isMatch = verifyOtpHmacConstantTime(submittedHmac, challenge.hmacHash);

  if (!isMatch) {
    challenge.attemptsRemaining -= 1;
    serverStore.logSecure('Incorrect OTP attempt', {
      epicId: formattedEpic,
      remaining: challenge.attemptsRemaining,
    });

    if (challenge.attemptsRemaining <= 0) {
      res.status(403).json({
        success: false,
        message: 'Incorrect verification code. Maximum attempts exceeded. Challenge locked.',
        attemptsRemaining: 0,
      });
      return;
    }

    res.status(400).json({
      success: false,
      message: `Incorrect verification code. ${challenge.attemptsRemaining} attempt(s) remaining.`,
      attemptsRemaining: challenge.attemptsRemaining,
    });
    return;
  }

  // 5. Successful verification: Consume challenge atomically
  challenge.isUsed = true;

  const voter = serverStore.findVoterByEpic(formattedEpic);
  if (!voter) {
    res.status(404).json({ success: false, message: 'Elector record not found.' });
    return;
  }

  // Update voter status to AUTHORIZED (not yet VOTED, preserves failure recovery)
  serverStore.updateVoterStatus(formattedEpic, 'AUTHORIZED');

  const constituency = INITIAL_CONSTITUENCIES.find((c: any) => c.id === voter.constituencyId);
  const constituencyCode = constituency ? parseInt(constituency.code, 10) : 4;

  // Create authenticated session
  const session = serverStore.createSession(voter, constituencyCode);
  serverStore.logSecure('Voter session authenticated successfully', { epicId: formattedEpic });

  res.status(200).json({
    success: true,
    message: 'Two-factor OTP identity verification successful.',
    sessionToken: session.token,
    expiresAt: session.expiresAt,
    voter: {
      id: voter.id,
      epicId: voter.epicId,
      name: voter.name,
      constituencyId: voter.constituencyId,
      constituencyCode,
      pollingStation: voter.pollingStation,
      status: 'AUTHORIZED',
    },
  });
});

/**
 * POST /api/voter/authorization
 * Issues a cryptographically signed EIP-712 VotingAuthorization ticket.
 * Requires authenticated session token.
 */
voterRouter.post('/authorization', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const sessionToken = tokenFromHeader || req.body.sessionToken;

  if (!sessionToken) {
    res.status(401).json({
      success: false,
      message: 'Unauthorized: Valid voter session token required.',
    });
    return;
  }

  const session = serverStore.getSession(sessionToken);
  if (!session) {
    res.status(401).json({
      success: false,
      message: 'Session invalid or expired. Please re-authenticate via OTP.',
    });
    return;
  }

  const { voterWallet, electionId = 18, chainId = 31337, contractAddress } = req.body;

  if (!voterWallet || !ethers.isAddress(voterWallet)) {
    res.status(400).json({
      success: false,
      message: 'Invalid Ethereum voter wallet address provided.',
    });
    return;
  }

  const voter = serverStore.findVoterByEpic(session.epicId);
  if (!voter) {
    res.status(404).json({ success: false, message: 'Elector record not found.' });
    return;
  }

  const targetElection =
    serverStore.findElectionByNumericId(Number(electionId)) ||
    serverStore.getElectionById(String(electionId));

  if (!targetElection) {
    res.status(404).json({ success: false, message: 'Election record not found.' });
    return;
  }

  // Backend election lifecycle enforcement
  if (targetElection.status !== 'active') {
    res.status(403).json({
      success: false,
      message: `Election is not currently active for voting (Current state: ${targetElection.status.toUpperCase()}).`,
      status: targetElection.status.toUpperCase(),
    });
    return;
  }

  // Backend deadline enforcement
  const nowSec = Math.floor(Date.now() / 1000);
  if (nowSec < targetElection.startTime) {
    res.status(403).json({
      success: false,
      message: 'Voting has not opened yet for this election schedule.',
      status: 'SCHEDULED',
    });
    return;
  }

  if (nowSec > targetElection.endTime) {
    res.status(403).json({
      success: false,
      message: 'Voting deadline has concluded for this election.',
      status: 'CONCLUDED',
    });
    return;
  }

  // Constituency eligibility check
  if (targetElection.constituencyIds && targetElection.constituencyIds.length > 0) {
    if (!targetElection.constituencyIds.includes(session.constituencyId)) {
      res.status(403).json({
        success: false,
        message: 'Your registered constituency is not enrolled in this election.',
      });
      return;
    }
  }

  // Derive pseudonymous nullifier
  const nullifier = deriveServerNullifier(voter.epicId, Number(electionId));

  // Idempotent Reconciliation: Check if this nullifier is already spent on-chain
  if (serverStore.isNullifierSpentOnChain(nullifier)) {
    serverStore.updateVoterStatus(session.epicId, 'VOTED');
    res.status(403).json({
      success: false,
      message: 'On-chain reconciliation verified that a ballot has already been recorded for this elector nullifier.',
      status: 'VOTED',
    });
    return;
  }

  if (voter.status === 'VOTED') {
    res.status(403).json({
      success: false,
      message: 'Ballot already finalized on blockchain for this elector record.',
      status: 'VOTED',
    });
    return;
  }

  const expiry = Math.floor(Date.now() / 1000) + 900; // 15-minute ticket TTL
  const targetContract = contractAddress || '0x5FbDB2315678afecb367f032d93F642f64180aa3';

  // Sign EIP-712 ticket
  try {
    const ticket = await signEip712VotingAuthorization(
      Number(electionId),
      session.constituencyCode,
      voterWallet,
      nullifier,
      expiry,
      Number(chainId),
      targetContract
    );

    // Update active nullifier and ticket metadata on voter record
    serverStore.updateVoterStatus(session.epicId, 'AUTHORIZED', {
      authorizedWallet: voterWallet,
      activeNullifier: nullifier,
      ticketExpiry: expiry,
    });

    serverStore.logSecure('Issued EIP-712 voting authorization ticket', {
      constituencyCode: session.constituencyCode,
      electionId,
      chainId,
    });

    res.status(200).json({
      success: true,
      ticket,
      nullifier,
      expiresAt: expiry,
      voterWallet,
      notice: 'Candidate choice was NOT received by the authorization API. Vote secrecy is preserved off-chain.',
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: 'Failed to generate cryptographic EIP-712 voting authorization ticket.',
      error: err.message,
    });
  }
});

/**
 * GET /api/voter/session
 * Inspects the current authenticated session state.
 */
voterRouter.get('/session', (req: Request, res: Response): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.query.token as string);

  if (!token) {
    res.status(401).json({ success: false, authenticated: false, message: 'No session token provided.' });
    return;
  }

  const session = serverStore.getSession(token);
  if (!session) {
    res.status(401).json({ success: false, authenticated: false, message: 'Session expired or invalid.' });
    return;
  }

  const voter = serverStore.findVoterByEpic(session.epicId);

  res.status(200).json({
    success: true,
    authenticated: true,
    session: {
      epicId: session.epicId,
      name: session.name,
      constituencyId: session.constituencyId,
      constituencyCode: session.constituencyCode,
      expiresAt: session.expiresAt,
      remainingSec: Math.max(0, Math.floor((session.expiresAt - Date.now()) / 1000)),
      voterStatus: voter?.status || 'AUTHORIZED',
    },
  });
});

/**
 * POST /api/voter/record-vote
 * Finalizes participation state from AUTHORIZED to VOTED after verified blockchain transaction.
 * PRIVACY INVARIANT: Candidate choice is NEVER received or stored with the voter identity.
 */
voterRouter.post('/record-vote', (req: Request, res: Response): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.body.sessionToken as string | undefined);
  const { epicId, nullifier, electionId, constituencyId, txHash, isSimulated } = req.body;

  let verifiedEpic: string | undefined = undefined;
  if (token) {
    const session = serverStore.getSession(token);
    if (session) verifiedEpic = session.epicId;
  }

  // Voter identity cannot be selected by supplying an arbitrary user ID
  if (!verifiedEpic) {
    if (SERVER_CONFIG.NODE_ENV === 'production') {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: Voter participation can only be recorded using a verified voter session token.',
      });
      return;
    }
    verifiedEpic = epicId;
  }

  if (!verifiedEpic || !nullifier) {
    res.status(400).json({
      success: false,
      message: 'Missing required parameters (valid sessionToken and nullifier).',
    });
    return;
  }

  const voter = serverStore.findVoterByEpic(verifiedEpic);
  if (!voter) {
    res.status(404).json({ success: false, message: 'Elector record not found.' });
    return;
  }

  // Idempotency: If already VOTED, acknowledge safely
  if (voter.status === 'VOTED') {
    res.status(200).json({
      success: true,
      message: 'Participation record already finalized.',
      status: 'VOTED',
    });
    return;
  }

  // Finalize voter status to VOTED
  serverStore.updateVoterStatus(verifiedEpic, 'VOTED');
  serverStore.markNullifierSpentOnChain(nullifier);

  // Increment constituency turnout
  const targetConstituency = constituencyId || voter.constituencyId;
  serverStore.incrementTurnout(targetConstituency);

  // Append audit event (strictly without candidate selection)
  serverStore.recordAuditEvent({
    id: `audit-vote-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    type: 'VOTE_CAST',
    description: `Ballot cast and nullifier burned on ${isSimulated ? 'Simulated EVM' : 'EVM Testnet'} for constituency ${targetConstituency}`,
    electionId: Number(electionId || 1),
    constituencyId: Number(voter.constituencyId.split('-')[1] || 4),
    txHash: txHash || `0x${crypto.randomBytes(32).toString('hex')}`,
    nullifier,
    isSimulated: !!isSimulated,
  });

  serverStore.logSecure('Voter participation finalized to VOTED', {
    epicId: verifiedEpic,
    constituency: targetConstituency,
    isSimulated,
  });

  res.status(200).json({
    success: true,
    message: 'Elector participation finalized to VOTED state. Vote transaction successfully recorded.',
    status: 'VOTED',
    privacyNotice: 'Zero ballot correlation: Candidate selection was neither requested nor recorded with this identity.',
  });
});

/**
 * POST /api/voter/recover-transaction
 * Idempotent transaction recovery for aborted, reverted, or network-interrupted ballot submissions.
 */
voterRouter.post('/recover-transaction', (req: Request, res: Response): void => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.body.sessionToken as string | undefined);
  const { epicId, nullifier } = req.body;

  let verifiedEpic: string | undefined = undefined;
  if (token) {
    const session = serverStore.getSession(token);
    if (session) verifiedEpic = session.epicId;
  }

  if (!verifiedEpic) {
    if (SERVER_CONFIG.NODE_ENV === 'production') {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: Transaction recovery requires a verified voter session token.',
      });
      return;
    }
    verifiedEpic = epicId;
  }

  if (!verifiedEpic) {
    res.status(400).json({ success: false, message: 'Elector EPIC ID or active session token required for transaction recovery.' });
    return;
  }

  const voter = serverStore.findVoterByEpic(verifiedEpic);
  if (!voter) {
    res.status(404).json({ success: false, message: 'Elector record not found.' });
    return;
  }

  // Reconcile against on-chain nullifier status
  if (nullifier && serverStore.isNullifierSpentOnChain(nullifier)) {
    serverStore.updateVoterStatus(verifiedEpic, 'VOTED');
    res.status(200).json({
      success: true,
      recovered: false,
      status: 'VOTED',
      message: 'Reconciliation verified that the transaction succeeded on-chain. Ballot is already recorded.',
    });
    return;
  }

  if (voter.status === 'VOTED') {
    res.status(200).json({
      success: true,
      recovered: false,
      status: 'VOTED',
      message: 'Voter is already marked as VOTED. Duplicate votes are strictly prohibited.',
    });
    return;
  }

  // Recover state: Reset from AUTHORIZED back to ELIGIBLE
  serverStore.resetVoterAuthorization(voter.id);

  serverStore.recordAuditEvent({
    id: `audit-recovery-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: Date.now(),
    type: 'TRANSACTION_RECOVERY',
    description: `Transaction recovery invoked for elector ${verifiedEpic}. Reverted unmined authorization to ELIGIBLE.`,
    electionId: 1,
  });

  serverStore.logSecure('Recovered elector transaction state to ELIGIBLE', { epicId: verifiedEpic });

  res.status(200).json({
    success: true,
    recovered: true,
    status: 'ELIGIBLE',
    message: 'Transaction recovery successful. Authorization state cleared; elector may retry voting challenge.',
  });
});
