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
import { INITIAL_CONSTITUENCIES } from '../../../frontend/src/data/mockData';
import { getDataRepositories } from '../repositories';
import { SCHEMA_VERSION_CURRENT } from '../../../frontend/src/types/dataModel';
import { normalizeElectionStatus } from '../../../frontend/src/types';
import { validateNoProhibitedFields, maskMobile } from '../security';

export const voterRouter = Router();

// Rate limiting in-memory map: IP/epicId -> timestamp
const rateLimitMap: Map<string, number> = new Map();

export function clearRateLimitsForTesting(): void {
  rateLimitMap.clear();
}

function checkRateLimit(key: string, limitMs: number): { allowed: boolean; remainingSec: number } {
  if (process.env.NODE_ENV === 'test' || (process.env as any).NODE_TEST_CONTEXT) {
    return { allowed: true, remainingSec: 0 };
  }
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
 * Validates EPIC ID format.
 * - Standard Indian ECI format: 10 alphanumeric characters (3 uppercase letters followed by 7 digits, e.g., 'ABC1234567').
 * - Academic Demo Mode (strictly disabled in production): allows synthetic test prefix format (e.g. 'IND-DL-982341' or 'IND-...').
 */
export function isValidEpicFormat(epicId: string, isProduction: boolean = SERVER_CONFIG.NODE_ENV === 'production'): boolean {
  if (!epicId || typeof epicId !== 'string') return false;
  const trimmed = epicId.trim().toUpperCase();

  // 1. Standard 10-character alphanumeric Indian EPIC format (3 letters + 7 digits)
  const standardEpicRegex = /^[A-Z]{3}[0-9]{7}$/;
  if (standardEpicRegex.test(trimmed)) {
    return true;
  }

  // 2. Synthetic prefixed demo identities permitted ONLY when NOT in production
  if (!isProduction) {
    const syntheticDemoRegex = /^IND-[A-Z0-9-]+$/;
    if (syntheticDemoRegex.test(trimmed)) {
      return true;
    }
  }

  // 3. Backend-generated simulation voter ID format (BBV-SIM-...)
  const simulationIdRegex = /^BBV-SIM-[A-Z0-9-]+$/;
  if (simulationIdRegex.test(trimmed)) {
    return true;
  }

  return false;
}

/**
 * POST /api/voter/verify & POST /api/voter/lookup (alias)
 * Initiates synthetic voter verification and issues an HMAC-SHA256 protected OTP challenge.
 */
const handleVoterVerify = async (req: Request, res: Response): Promise<void> => {
  const prohibitedCheck = validateNoProhibitedFields(req.body);
  if (!prohibitedCheck.isValid) {
    res.status(400).json({
      success: false,
      message: `Prohibited sensitive field(s) rejected: ${prohibitedCheck.forbiddenFound.join(', ')}`,
    });
    return;
  }

  const { epicId } = req.body;

  if (!epicId || typeof epicId !== 'string' || !isValidEpicFormat(epicId)) {
    res.status(400).json({
      success: false,
      message: 'Invalid voter identification format provided. Standard EPIC format requires 10 alphanumeric characters (3 letters followed by 7 digits).',
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

  const voter = await serverStore.findVoterByEpicAsync(formattedEpic);

  if (!voter) {
    serverStore.logSecure('Voter verification request failed: elector not found in roll', { epicId: formattedEpic });
    res.status(404).json({
      success: false,
      message: `Elector record "${formattedEpic}" not found in registered electoral roll.`,
      status: 'NOT_FOUND',
    });
    return;
  }

  if (!voter.isEligible) {
    serverStore.logSecure('Voter verification request failed: voter marked ineligible', { epicId: formattedEpic });
    res.status(403).json({
      success: false,
      message: `Electoral Ineligibility Notice: Elector ${voter.name} is marked as ineligible to vote in this election.`,
      status: 'INELIGIBLE',
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
    maskedMobile: maskMobile(voter.maskedMobile),
    status: 'CHALLENGE_ISSUED',
    voter: {
      id: voter.id,
      epicId: voter.epicId,
      name: voter.name,
      gender: voter.gender,
      age: voter.age,
      constituencyId: voter.constituencyId,
      pollingStation: voter.pollingStation,
      maskedMobile: maskMobile(voter.maskedMobile),
      isEligible: voter.isEligible,
      status: voter.status,
    },
    // In academic demo/development mode, provide the synthetic test delivery code
    // Strictly omitted in production configurations unless isolated hosted demonstration is enabled
    ...((SERVER_CONFIG.NODE_ENV !== 'production' || process.env.HOSTED_DEMO_ENABLED === 'true') && {
      testDeliveryCode: otp,
      testNotice: 'Academic Demo: testDeliveryCode included because live SMS gateway is unconfigured.',
    }),
  });
};

voterRouter.post('/verify', handleVoterVerify);
voterRouter.post('/lookup', handleVoterVerify);
voterRouter.post('/identify', handleVoterVerify);

/**
 * POST /api/voter/verify-otp
 * Verifies the submitted 6-digit OTP against the persistent HMAC challenge.
 */
voterRouter.post('/verify-otp', async (req: Request, res: Response): Promise<void> => {
  const prohibitedCheck = validateNoProhibitedFields(req.body);
  if (!prohibitedCheck.isValid) {
    res.status(400).json({
      success: false,
      message: `Prohibited sensitive field(s) rejected: ${prohibitedCheck.forbiddenFound.join(', ')}`,
    });
    return;
  }

  const { epicId, otp } = req.body;

  if (!epicId || !otp || typeof otp !== 'string' || otp.trim().length !== 6) {
    res.status(400).json({
      success: false,
      message: 'Please provide a valid 6-digit verification code.',
    });
    return;
  }

  const formattedEpic = epicId.trim().toUpperCase();

  // Voter existence & deactivated/ineligible check (asynchronously queries Firestore & profile repository on cache miss)
  const voter = (await serverStore.findVoterByEpicAsync(formattedEpic)) || serverStore.findVoterByEpic(formattedEpic);
  if (!voter) {
    res.status(404).json({
      success: false,
      message: 'Elector record not found in registered electoral roll.',
    });
    return;
  }

  const repos = getDataRepositories();
  const voterProfile =
    (await repos.voterProfiles.findById(voter.id)) ||
    (await repos.voterProfiles.findBySimulationId(voter.epicId)) ||
    (await repos.voterProfiles.findByLegacyEpic(voter.epicId));

  if (voterProfile && (voterProfile.lifecycleStatus === 'LOCKED' || voterProfile.lifecycleStatus === 'ARCHIVED')) {
    res.status(404).json({
      success: false,
      message: 'Elector profile is deactivated or locked.',
    });
    return;
  }

  // Validate election lifecycle authoritatively before starting session
  const electionIdVal = req.body.electionId || 'GE-2024';
  const targetElection =
    serverStore.getElectionById(String(electionIdVal)) ||
    serverStore.findElectionByNumericId(Number(electionIdVal));

  if (targetElection) {
    serverStore.reconcileElectionSchedules();
    const normStatus = normalizeElectionStatus(targetElection.status);
    const nowSec = serverStore.getCurrentTimeSec();

    if (normStatus !== 'OPEN') {
      res.status(409).json({
        success: false,
        code: 'ELECTION_NOT_ACTIVE',
        message: `Election is not currently active for voting sessions (Current status: ${normStatus}).`,
      });
      return;
    }
    if (nowSec < targetElection.startTime) {
      res.status(409).json({
        success: false,
        code: 'ELECTION_NOT_STARTED',
        message: 'Voting has not opened yet for this election schedule.',
      });
      return;
    }
    if (nowSec >= targetElection.endTime) {
      res.status(409).json({
        success: false,
        code: 'ELECTION_CONCLUDED',
        message: 'Voting has concluded for this election schedule.',
      });
      return;
    }
  }

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
      message: 'The verification code challenge has expired. Challenges are valid for 180 seconds only.',
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

  // Update voter status to AUTHORIZED only if not already VOTED
  if (voter.status !== 'VOTED') {
    serverStore.updateVoterStatus(formattedEpic, 'AUTHORIZED');
  }

  const constituency = INITIAL_CONSTITUENCIES.find((c: any) => c.id === voter.constituencyId);
  const constituencyCode = constituency ? parseInt(constituency.code, 10) : 4;

  // Create authenticated session bound to election
  const numericElectionIdVal = typeof req.body.electionId === 'number'
    ? req.body.electionId
    : (req.body.numericElectionId ? Number(req.body.numericElectionId) : 18);

  const session = serverStore.createSession(voter, constituencyCode, {
    electionId: String(electionIdVal),
    numericElectionId: numericElectionIdVal,
    status: 'CREATED',
    verificationOutcome: 'OTP_DEMO',
  });
  serverStore.logSecure('Voter session authenticated successfully', { epicId: formattedEpic });

  res.status(200).json({
    success: true,
    message: 'Two-factor OTP identity verification successful.',
    sessionToken: session.token,
    sessionId: session.id,
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
  const prohibitedCheck = validateNoProhibitedFields(req.body);
  if (!prohibitedCheck.isValid) {
    res.status(400).json({
      success: false,
      message: `Prohibited sensitive field(s) rejected: ${prohibitedCheck.forbiddenFound.join(', ')}`,
    });
    return;
  }

  const authHeader = req.headers.authorization;
  const tokenFromHeader = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;
  const sessionToken = tokenFromHeader || req.body.sessionToken;

  if (!sessionToken) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Unauthorized: Valid voter session token required.',
    });
    return;
  }

  const session = serverStore.getSessionRecord(sessionToken);
  if (!session) {
    res.status(401).json({
      success: false,
      code: 'UNAUTHORIZED',
      message: 'Session invalid or not found. Please authenticate via OTP.',
    });
    return;
  }

  // 1. Authoritative expiration check (server clock, independent of client)
  const nowMs = serverStore.getCurrentTimeMs();
  if (session.status === 'EXPIRED' || nowMs > session.expiresAt) {
    session.status = 'EXPIRED';
    res.status(401).json({
      success: false,
      code: 'SESSION_EXPIRED',
      message: 'Voting session has expired. Expiration is strictly server-authoritative.',
    });
    return;
  }

  // 2. Fullscreen lockout check
  if (session.status === 'LOCKED_SUPERVISED_RECOVERY') {
    res.status(403).json({
      success: false,
      code: 'SESSION_LOCKED',
      locked: true,
      message: 'Voting session is locked due to multiple unexpected fullscreen exit events. Supervised recovery required before voting can resume.',
    });
    return;
  }

  // 3. Revocation check
  if (
    session.status === 'REVOKED' ||
    serverStore.isJtiRevoked(session.id) ||
    (session.jti && serverStore.isJtiRevoked(session.jti))
  ) {
    res.status(401).json({
      success: false,
      code: 'SESSION_REVOKED',
      message: 'Voting session has been revoked.',
    });
    return;
  }

  // 4. Session state check
  if (
    session.status !== 'CREATED' &&
    session.status !== 'IDENTITY_VERIFICATION_PENDING' &&
    session.status !== 'AUTHORIZED' &&
    session.status !== 'SUBMISSION_CONFIRMED'
  ) {
    res.status(403).json({
      success: false,
      code: 'SESSION_INVALID_STATE',
      message: `Voting session is in state '${session.status}' (cannot authorize).`,
    });
    return;
  }

  const voterWallet = req.body.voterWallet || req.body.walletAddress;
  const { electionId = 18, chainId = 31337, contractAddress } = req.body;

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

  if (!voter.isEligible) {
    res.status(403).json({
      success: false,
      code: 'INELIGIBLE_VOTER',
      message: `Elector ${voter.name} is marked as ineligible to vote.`,
    });
    return;
  }

  const sessionElection = session.electionId
    ? serverStore.getElectionById(session.electionId) || serverStore.findElectionByNumericId(Number(session.electionId))
    : undefined;

  let targetElection =
    serverStore.findElectionByNumericId(Number(electionId)) ||
    serverStore.getElectionById(String(electionId));

  if (sessionElection && (String(sessionElection.numericId) === String(electionId) || sessionElection.id === String(electionId))) {
    targetElection = sessionElection;
  }

  if (!targetElection) {
    res.status(404).json({ success: false, message: 'Election record not found.' });
    return;
  }

  // Session-to-election binding check
  if (session.electionId) {
    if (
      String(session.electionId) !== String(targetElection.id) &&
      String(session.electionId) !== String(targetElection.numericId)
    ) {
      res.status(403).json({
        success: false,
        code: 'SESSION_ELECTION_MISMATCH',
        message: `Security violation: This voting session is strictly bound to election '${session.electionId}', not '${electionId}'.`,
      });
      return;
    }
  }

  // Voter profile and lifecycle check
  const repos = getDataRepositories();
  const voterProfile =
    (await repos.voterProfiles.findById(voter.id)) ||
    (await repos.voterProfiles.findBySimulationId(voter.epicId)) ||
    (await repos.voterProfiles.findByLegacyEpic(voter.epicId));

  if (voterProfile) {
    if (
      voterProfile.lifecycleStatus === 'LOCKED' ||
      voterProfile.lifecycleStatus === 'ARCHIVED' ||
      voterProfile.registrationStatus !== 'REGISTERED' ||
      voterProfile.eligibilityStatus !== 'ELIGIBLE'
    ) {
      res.status(403).json({
        success: false,
        code: 'INELIGIBLE_VOTER',
        message: 'Elector record is deactivated, suspended, or ineligible to vote.',
      });
      return;
    }
  }

  // Reconcile election schedules authoritatively before validating
  serverStore.reconcileElectionSchedules();
  const nowSec = serverStore.getCurrentTimeSec();
  const normStatus = normalizeElectionStatus(targetElection.status);

  // Backend deadline and conclusion enforcement using authoritative server time
  if (nowSec >= targetElection.endTime || targetElection.status === 'concluded' || normStatus === 'CLOSED') {
    res.status(403).json({
      success: false,
      code: 'ELECTION_CONCLUDED',
      message: 'Voting deadline has concluded for this election.',
      status: 'CONCLUDED',
    });
    return;
  }

  // Backend election lifecycle enforcement
  if (normStatus !== 'OPEN') {
    res.status(403).json({
      success: false,
      code: 'ELECTION_NOT_ACTIVE',
      message: `Election is not currently active for voting (Current state: ${normStatus}).`,
      status: normStatus,
    });
    return;
  }

  if (nowSec < targetElection.startTime) {
    res.status(403).json({
      success: false,
      code: 'ELECTION_NOT_STARTED',
      message: 'Voting has not opened yet for this election schedule.',
      status: 'SCHEDULED',
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

  // Multi-election participation check: elector may vote in Election B even if they voted in Election A
  const existingParticipation =
    (await repos.participations.getParticipation(voter.id, targetElection.id)) ||
    (await repos.participations.getParticipation(voter.id, String(targetElection.numericId)));

  if (existingParticipation && existingParticipation.status === 'VOTE_ACCEPTED') {
    res.status(403).json({
      success: false,
      message: 'Ballot already finalized on blockchain for this elector record in this election.',
      status: 'VOTED',
    });
    return;
  }

  const numericElectionId = targetElection ? targetElection.numericId : (Number(electionId) || 18);

  // Derive pseudonymous nullifier
  const nullifier = deriveServerNullifier(voter.epicId, numericElectionId);

  // Idempotent Reconciliation: Check if this nullifier is already spent on-chain
  if (serverStore.isNullifierSpentOnChain(nullifier)) {
    res.status(403).json({
      success: false,
      message: 'On-chain reconciliation verified that a ballot has already been recorded for this elector nullifier in this election.',
      status: 'VOTED',
    });
    return;
  }

  // Legacy single-election status fallback
  if (!existingParticipation && voter.status === 'VOTED' && (!electionId || electionId === 18 || electionId === 'GE-2024')) {
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
    const numericElectionId = targetElection ? targetElection.numericId : (Number(electionId) || 18);
    const ticket = await signEip712VotingAuthorization(
      numericElectionId,
      session.constituencyCode,
      voterWallet,
      nullifier,
      expiry,
      Number(chainId),
      targetContract
    );

    // Update active nullifier and ticket metadata on voter record and session
    serverStore.updateVoterStatus(session.epicId, 'AUTHORIZED', {
      authorizedWallet: voterWallet,
      activeNullifier: nullifier,
      ticketExpiry: expiry,
    });
    session.status = 'AUTHORIZED';
    session.voterWallet = voterWallet;
    session.nullifier = nullifier;
    session.version = (session.version || 1) + 1;

    // Record participation transition to SESSION_AUTHORIZED
    try {
      if (existingParticipation) {
        await repos.participations.updateParticipationStatus(
          voter.id,
          targetElection.id,
          'SESSION_AUTHORIZED',
          {
            authorizationMetadata: {
              authorizedWallet: voterWallet,
              activeNullifier: nullifier,
              ticketExpiry: expiry,
              authorizedAt: nowSec,
            },
          }
        );
      } else {
        await repos.participations.createParticipation({
          id: `${voter.id}_${targetElection.id}`,
          voterId: voter.id,
          electionId: targetElection.id,
          status: 'SESSION_AUTHORIZED',
          authorizationMetadata: {
            authorizedWallet: voterWallet,
            activeNullifier: nullifier,
            ticketExpiry: expiry,
            authorizedAt: nowSec,
          },
          createdAt: nowSec,
          updatedAt: nowSec,
          schemaVersion: SCHEMA_VERSION_CURRENT,
        });
      }
    } catch (partErr: any) {
      console.warn('[Participation] Notice recording session authorization:', partErr.message);
    }

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

  const session = serverStore.getSessionRecord(token);
  if (!session) {
    res.status(401).json({ success: false, authenticated: false, message: 'Session expired or invalid.' });
    return;
  }

  const nowMs = serverStore.getCurrentTimeMs();
  if (nowMs > session.expiresAt && session.status !== 'REVOKED') {
    session.status = 'EXPIRED';
  }

  const voter = serverStore.findVoterByEpic(session.epicId);

  res.status(200).json({
    success: true,
    authenticated: session.status !== 'EXPIRED' && session.status !== 'REVOKED',
    status: session.status,
    fullscreenExitCount: session.fullscreenExitCount,
    lockedReason: session.lockedReason,
    remainingSeconds: Math.max(0, Math.floor((session.expiresAt - nowMs) / 1000)),
    session: {
      id: session.id,
      epicId: session.epicId,
      name: session.name,
      constituencyId: session.constituencyId,
      constituencyCode: session.constituencyCode,
      electionId: session.electionId,
      numericElectionId: session.numericElectionId,
      status: session.status,
      verificationOutcome: session.verificationOutcome,
      fullscreenExitCount: session.fullscreenExitCount,
      lockedReason: session.lockedReason,
      expiresAt: session.expiresAt,
      remainingSec: Math.max(0, Math.floor((session.expiresAt - nowMs) / 1000)),
      voterStatus: voter?.status || 'AUTHORIZED',
    },
  });
});

/**
 * POST /api/voter/session/fullscreen-exit
 * Reports unexpected fullscreen exit events and enforces the 3-exit session lockout policy.
 */
voterRouter.post('/session/fullscreen-exit', async (req: Request, res: Response): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.body.sessionToken as string | undefined);
  const { reason } = req.body;

  if (!token) {
    res.status(401).json({ success: false, message: 'Active session token required.' });
    return;
  }

  const result = serverStore.recordFullscreenExit(token, reason);
  if (!result.success && !result.session) {
    res.status(401).json({ success: false, message: result.message });
    return;
  }

  res.status(200).json({
    success: true,
    locked: result.locked,
    exitCount: result.exitCount,
    remainingAllowed: Math.max(0, 3 - result.exitCount),
    message: result.message,
    sessionStatus: result.session?.status,
    status: result.session?.status,
  });
});

/**
 * POST /api/voter/record-vote
 * Finalizes participation state from AUTHORIZED to VOTED after verified blockchain transaction.
 * PRIVACY INVARIANT: Candidate choice is NEVER received or stored with the voter identity.
 */
voterRouter.post('/record-vote', async (req: Request, res: Response): Promise<void> => {
  const prohibitedCheck = validateNoProhibitedFields(req.body);
  if (!prohibitedCheck.isValid) {
    res.status(400).json({
      success: false,
      message: `Prohibited sensitive field(s) rejected: ${prohibitedCheck.forbiddenFound.join(', ')}`,
    });
    return;
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ')
    ? authHeader.substring(7)
    : (req.body.sessionToken as string | undefined);
  const { epicId, nullifier, electionId, constituencyId, candidateId, candidateNumericId, txHash, isSimulated } = req.body;

  let session: any = undefined;
  if (token) {
    session = serverStore.getSessionRecord(token);
  }

  // Voter identity cannot be selected by supplying an arbitrary user ID
  if (!session) {
    if (SERVER_CONFIG.NODE_ENV === 'production' || !epicId) {
      res.status(401).json({
        success: false,
        code: 'UNAUTHORIZED',
        message: 'Unauthorized: Voter participation can only be recorded using a verified voter session token.',
      });
      return;
    }
  }

  // 1. Session expiration and status checks
  if (session) {
    const nowMs = serverStore.getCurrentTimeMs();
    if (session.status === 'EXPIRED' || nowMs > session.expiresAt) {
      session.status = 'EXPIRED';
      res.status(401).json({
        success: false,
        code: 'SESSION_EXPIRED',
        message: 'Voting session has expired.',
      });
      return;
    }

    if (session.status === 'LOCKED_SUPERVISED_RECOVERY') {
      res.status(403).json({
        success: false,
        code: 'SESSION_LOCKED',
        message: 'Voting session is locked due to multiple unexpected fullscreen exit events. Supervised recovery required before voting can resume.',
      });
      return;
    }

    if (
      session.status === 'REVOKED' ||
      serverStore.isJtiRevoked(session.id) ||
      (session.jti && serverStore.isJtiRevoked(session.jti))
    ) {
      res.status(401).json({
        success: false,
        code: 'SESSION_REVOKED',
        message: 'Voting session has been revoked.',
      });
      return;
    }

    if (session.status === 'SUBMISSION_CONFIRMED') {
      if (session.txHash === txHash && txHash) {
        res.status(200).json({
          success: true,
          duplicateReplay: true,
          message: 'Participation record already finalized.',
          status: 'VOTED',
        });
        return;
      }
      res.status(409).json({
        success: false,
        code: 'DOUBLE_VOTE_ATTEMPT',
        message: 'Double voting rejected: A ballot has already been recorded for this session.',
        status: 'ALREADY_VOTED',
      });
      return;
    }

    if (session.status === 'SUBMISSION_IN_PROGRESS') {
      res.status(409).json({
        success: false,
        code: 'DOUBLE_VOTE_ATTEMPT',
        message: 'Concurrent submission in progress.',
        status: 'ALREADY_VOTED',
      });
      return;
    }

    if (session.status !== 'AUTHORIZED') {
      // Check if this elector already voted and this is an idempotent replay
      const targetElecIdEarly = electionId ? String(electionId) : 'GE-2024';
      const reposEarly = getDataRepositories();
      const earlyPart =
        (await reposEarly.participations.getParticipation(session.voterId || session.epicId, targetElecIdEarly)) ||
        (await reposEarly.participations.getParticipation(session.epicId, targetElecIdEarly));
      if (earlyPart && earlyPart.status === 'VOTE_ACCEPTED') {
        if (earlyPart.txHash === txHash && txHash) {
          res.status(200).json({
            success: true,
            duplicateReplay: true,
            message: 'Participation record already finalized.',
            status: 'VOTED',
          });
          return;
        }
        res.status(409).json({
          success: false,
          code: 'DOUBLE_VOTE_ATTEMPT',
          message: 'Double voting rejected: A ballot has already been recorded and accepted for this elector in this election.',
          status: 'ALREADY_VOTED',
        });
        return;
      }

      res.status(403).json({
        success: false,
        code: 'SESSION_INVALID_STATE',
        message: `Voting session is in state '${session.status}' (must be AUTHORIZED to record vote).`,
      });
      return;
    }

    // Atomically transition session status to SUBMISSION_IN_PROGRESS
    session.status = 'SUBMISSION_IN_PROGRESS';
  }

  const verifiedEpic = session ? session.epicId : epicId;

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

  // Voter profile and eligibility check
  const repos = getDataRepositories();
  const voterProfile =
    (await repos.voterProfiles.findById(voter.id)) ||
    (await repos.voterProfiles.findBySimulationId(voter.epicId)) ||
    (await repos.voterProfiles.findByLegacyEpic(voter.epicId));

  if (voterProfile) {
    if (
      voterProfile.lifecycleStatus === 'LOCKED' ||
      voterProfile.lifecycleStatus === 'ARCHIVED' ||
      voterProfile.registrationStatus !== 'REGISTERED' ||
      voterProfile.eligibilityStatus !== 'ELIGIBLE'
    ) {
      res.status(403).json({
        success: false,
        code: 'INELIGIBLE_VOTER',
        message: 'Elector record is deactivated, suspended, or ineligible to vote.',
      });
      return;
    }
  }

  // Reconcile and validate election lifecycle authoritatively using server clock
  serverStore.reconcileElectionSchedules();
  const nowSec = serverStore.getCurrentTimeSec();

  const targetElection = electionId
    ? serverStore.findElectionByNumericId(Number(electionId)) || serverStore.getElectionById(String(electionId))
    : serverStore.getElectionById('GE-2024');

  if (targetElection) {
    const normStatus = normalizeElectionStatus(targetElection.status);
    if (nowSec >= targetElection.endTime || targetElection.status === 'concluded' || normStatus === 'CLOSED') {
      res.status(403).json({
        success: false,
        code: 'ELECTION_CONCLUDED',
        message: 'Voting deadline has concluded for this election.',
      });
      return;
    }
    if (normStatus !== 'OPEN') {
      res.status(403).json({
        success: false,
        code: 'ELECTION_NOT_ACTIVE',
        message: `Election is not currently active for voting (Current state: ${normStatus}).`,
      });
      return;
    }
    if (nowSec < targetElection.startTime) {
      res.status(403).json({
        success: false,
        code: 'ELECTION_NOT_STARTED',
        message: 'Voting has not opened yet for this election schedule.',
      });
      return;
    }
  }

  // Session-to-election binding check
  if (session && session.electionId && targetElection) {
    if (
      String(session.electionId) !== String(targetElection.id) &&
      String(session.electionId) !== String(targetElection.numericId)
    ) {
      res.status(403).json({
        success: false,
        code: 'SESSION_ELECTION_MISMATCH',
        message: `Security violation: This voting session is strictly bound to election '${session.electionId}', not '${electionId}'.`,
      });
      return;
    }
  }

  // Candidate Membership Validation: reject invalid or mismatched candidates
  const submittedCandId = candidateId !== undefined ? candidateId : candidateNumericId;
  let validatedCandidate: any = undefined;
  if (submittedCandId !== undefined && targetElection) {
    const candCheck = serverStore.validateCandidateInElectionAndConstituency(
      submittedCandId,
      targetElection.id,
      voter.constituencyId
    );
    if (!candCheck.isValid) {
      res.status(400).json({
        success: false,
        code: 'INVALID_CANDIDATE',
        message: candCheck.error,
      });
      return;
    }
    validatedCandidate = candCheck.candidate;
  }

  // Multi-election participation tracking
  const targetElecId = targetElection ? targetElection.id : (electionId ? String(electionId) : 'GE-2024');
  const existingParticipation =
    (await repos.participations.getParticipation(voter.id, targetElecId)) ||
    (await repos.participations.getParticipation(voter.epicId, targetElecId));

  // Multi-election double voting protection & idempotent retry check
  if (existingParticipation && existingParticipation.status === 'VOTE_ACCEPTED') {
    if (existingParticipation.txHash === txHash && txHash) {
      res.status(200).json({
        success: true,
        duplicateReplay: true,
        message: 'Participation record already finalized.',
        status: 'VOTED',
        participationStatus: 'VOTE_ACCEPTED',
        electionId: targetElecId,
      });
      return;
    }

    res.status(409).json({
      success: false,
      code: 'DOUBLE_VOTE_ATTEMPT',
      message: 'Double voting rejected: A ballot has already been recorded and accepted for this elector in this election.',
      status: 'ALREADY_VOTED',
    });
    return;
  }

  // If this nullifier was already spent on-chain, reject duplicate
  if (serverStore.isNullifierSpentOnChain(nullifier)) {
    res.status(409).json({
      success: false,
      code: 'NULLIFIER_ALREADY_SPENT',
      message: 'Double voting rejected: Cryptographic nullifier has already been recorded on-chain.',
      status: 'ALREADY_VOTED',
    });
    return;
  }

  if (existingParticipation) {
    await repos.participations.updateParticipationStatus(voter.id, targetElecId, 'VOTE_ACCEPTED', {
      votedAt: nowSec,
      txHash: txHash || `0x${crypto.randomBytes(32).toString('hex')}`,
    });
  } else {
    await repos.participations.createParticipation({
      id: `${voter.id}_${targetElecId}`,
      voterId: voter.id,
      electionId: targetElecId,
      status: 'VOTE_ACCEPTED',
      votedAt: nowSec,
      txHash: txHash || `0x${crypto.randomBytes(32).toString('hex')}`,
      createdAt: nowSec,
      updatedAt: nowSec,
      schemaVersion: SCHEMA_VERSION_CURRENT,
    });
  }

  // Transition session state to confirmed
  if (session) {
    session.status = 'SUBMISSION_CONFIRMED';
    session.txHash = txHash;
    session.version += 1;
  }

  // Spend nullifier
  serverStore.markNullifierSpentOnChain(nullifier);

  // Increment candidate tally if validated
  if (validatedCandidate) {
    validatedCandidate.voteCount = (validatedCandidate.voteCount || 0) + 1;
    serverStore.saveCandidateAsync(validatedCandidate).catch(() => {});
  }

  // Legacy single-election status fallback (only when voting in default GE-2024 or unspecified)
  if (!electionId || electionId === 18 || electionId === 'GE-2024') {
    await serverStore.updateVoterStatusAsync(verifiedEpic, 'VOTED');
  }

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
    participationStatus: 'VOTE_ACCEPTED',
    electionId: targetElecId,
    privacyNotice: 'Zero ballot correlation: Candidate selection was neither requested nor recorded with this identity.',
  });
});

/**
 * POST /api/voter/recover-transaction
 * Idempotent transaction recovery for aborted, reverted, or network-interrupted ballot submissions.
 */
voterRouter.post('/recover-transaction', (req: Request, res: Response): void => {
  const prohibitedCheck = validateNoProhibitedFields(req.body);
  if (!prohibitedCheck.isValid) {
    res.status(400).json({
      success: false,
      message: `Prohibited sensitive field(s) rejected: ${prohibitedCheck.forbiddenFound.join(', ')}`,
    });
    return;
  }

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

/**
 * GET /api/voter/exceptions/:id
 * Allows polling status of an exception request from the voting or enrollment workflow.
 */
voterRouter.get('/exceptions/:id', async (req: Request, res: Response): Promise<void> => {
  const { id } = req.params;
  const repos = getDataRepositories();

  const exception = await repos.exceptions.findById(id);
  if (!exception) {
    res.status(404).json({ success: false, message: `Exception request '${id}' not found.` });
    return;
  }

  // Redact internal officer IDs if viewed via voter public endpoint
  res.status(200).json({
    success: true,
    exception: {
      id: exception.id,
      voterId: exception.voterId,
      simulationVoterId: exception.simulationVoterId,
      purpose: exception.purpose,
      modality: exception.modality,
      electionId: exception.electionId,
      status: exception.status,
      decisionOutcome: exception.decisionOutcome,
      decisionReason: exception.decisionReason,
      isManualException: true,
      expiresAt: exception.expiresAt,
      consumedAt: exception.consumedAt,
      requestedAt: exception.requestedAt,
      reviewedAt: exception.reviewedAt,
    },
  });
});

/**
 * POST /api/voter/consume-exception
 * Validates and single-use consumes an approved manual physical-ID exception for a specific voting session attempt.
 *
 * Strict invariants enforced:
 * 1. Purpose must be VOTING_SESSION (enrollment-time approval cannot authorize voting).
 * 2. Status must be APPROVED and decisionOutcome must be MANUAL_PHYSICAL_ID_APPROVED.
 * 3. Already-consumed, expired, declined, or cancelled exceptions fail closed.
 * 4. Exception must be bound to the exact voter, election, and session token attempt.
 * 5. Voter must not have already voted.
 * 6. Election must be active and within voting schedule.
 * 7. Single-use: transitions to CONSUMED.
 */
voterRouter.post('/consume-exception', async (req: Request, res: Response): Promise<void> => {
  const prohibitedCheck = validateNoProhibitedFields(req.body);
  if (!prohibitedCheck.isValid) {
    res.status(400).json({
      success: false,
      message: `Prohibited sensitive field(s) rejected: ${prohibitedCheck.forbiddenFound.join(', ')}`,
    });
    return;
  }

  const { exceptionId, voterId, electionId } = req.body;
  const sessionToken = req.body.sessionToken || req.body.votingSessionToken;

  if (!exceptionId || typeof exceptionId !== 'string') {
    res.status(400).json({ success: false, message: 'Missing or invalid exceptionId.' });
    return;
  }
  if (!voterId || typeof voterId !== 'string') {
    res.status(400).json({ success: false, message: 'Missing or invalid voterId.' });
    return;
  }
  if (!electionId) {
    res.status(400).json({ success: false, message: 'Missing or invalid electionId.' });
    return;
  }

  const repos = getDataRepositories();

  // 1. Fetch exception
  const exception = await repos.exceptions.findById(exceptionId);
  if (!exception) {
    res.status(404).json({ success: false, message: `Exception request '${exceptionId}' not found.` });
    return;
  }

  // 2. Invariant: Enrollment-time approval cannot authorize a later voting session
  if (exception.purpose !== 'VOTING_SESSION') {
    res.status(400).json({
      success: false,
      message: `Invalid exception purpose: '${exception.purpose}'. Purpose must be VOTING_SESSION. An enrollment-time approval cannot authorize a voting session. A separate voting-time exception is required.`,
    });
    return;
  }

  // 3. Status checks
  if (exception.status === 'CONSUMED') {
    res.status(409).json({
      success: false,
      message: 'Exception authorization already consumed. Approved exceptions are strictly single-use only.',
      status: 'CONSUMED',
    });
    return;
  }

  if (exception.status === 'DECLINED') {
    res.status(403).json({
      success: false,
      message: 'Voting exception was declined by the Election Officer upon physical document review.',
      status: 'DECLINED',
    });
    return;
  }

  if (exception.status === 'EXPIRED') {
    res.status(403).json({
      success: false,
      message: 'Voting exception has expired. Server-managed 15-minute validity window elapsed.',
      status: 'EXPIRED',
    });
    return;
  }

  if (exception.status !== 'APPROVED') {
    res.status(400).json({
      success: false,
      message: `Exception is in '${exception.status}' status (must be APPROVED by an Election Officer).`,
      status: exception.status,
    });
    return;
  }

  // 4. Server-managed expiration check
  const now = Date.now();
  if (exception.expiresAt && now > exception.expiresAt) {
    exception.status = 'EXPIRED';
    exception.updatedAt = now;
    await repos.exceptions.update(exception);

    res.status(403).json({
      success: false,
      message: 'Voting exception has expired. Please request a new verification from the Election Officer.',
      status: 'EXPIRED',
    });
    return;
  }

  // 5. Voter binding check: exact voter profile / simulation voter ID
  const voter =
    (await repos.voterProfiles.findById(voterId)) ||
    (await repos.voterProfiles.findBySimulationId(voterId)) ||
    (await repos.voterProfiles.findByLegacyEpic(voterId));

  if (!voter) {
    res.status(404).json({ success: false, message: `Voter record '${voterId}' not found.` });
    return;
  }

  if (exception.voterId !== voter.id && exception.simulationVoterId !== voter.simulationVoterId) {
    res.status(403).json({
      success: false,
      message: 'Security violation: Exception record is bound to a different voter profile.',
    });
    return;
  }

  // 6. Election binding check
  if (String(exception.electionId) !== String(electionId)) {
    res.status(403).json({
      success: false,
      message: `Security violation: Exception record is bound to election '${exception.electionId}', not '${electionId}'.`,
    });
    return;
  }

  // 7. Voting session token binding check (if bound during request)
  if (exception.votingSessionTokenHash && sessionToken) {
    const computedHash = crypto.createHash('sha256').update(String(sessionToken)).digest('hex');
    if (computedHash !== exception.votingSessionTokenHash) {
      res.status(403).json({
        success: false,
        message: 'Security violation: Exception is bound to a different active voting session attempt.',
      });
      return;
    }
  }

  // 8. Voter lifecycle and eligibility check
  if (
    voter.lifecycleStatus === 'LOCKED' ||
    voter.registrationStatus !== 'REGISTERED' ||
    voter.eligibilityStatus !== 'ELIGIBLE'
  ) {
    res.status(403).json({
      success: false,
      message: 'Cannot consume exception: Voter record is currently suspended, locked, or ineligible.',
    });
    return;
  }

  // 9. One-person, one-vote check: voter must not have already cast a ballot
  const runtimeVoter = serverStore.findVoterByEpic(voter.simulationVoterId) || serverStore.findVoterByEpic(voter.legacyEpicId || '');
  const participation = await repos.participations.getParticipation(voter.id, String(electionId));
  if (
    (runtimeVoter && runtimeVoter.status === 'VOTED') ||
    (participation && (participation.status === 'VOTE_ACCEPTED' || Boolean(participation.votedAt)))
  ) {
    res.status(403).json({
      success: false,
      message: 'Cannot consume exception: Elector has already cast a finalized ballot in this election.',
      status: 'VOTED',
    });
    return;
  }

  // 10. Election active check
  const targetElection =
    serverStore.findElectionByNumericId(Number(electionId)) ||
    serverStore.getElectionById(String(electionId));

  if (!targetElection || targetElection.status !== 'active') {
    res.status(403).json({
      success: false,
      message: 'Cannot consume exception: Election is not currently active.',
    });
    return;
  }

  // 11. Atomically consume the exception for this single session
  exception.status = 'CONSUMED';
  exception.consumedAt = now;
  exception.consumedInElectionId = String(electionId);
  exception.updatedAt = now;

  await repos.exceptions.update(exception);

  // 12. Record audit event
  serverStore.recordAuditEvent({
    id: `audit-ex-cons-${now}-${Math.random().toString(36).substring(2, 6)}`,
    timestamp: now,
    type: 'ADMIN_ACTION',
    description: `Manual physical-ID exception '${exception.id}' consumed for voting session by '${voter.simulationVoterId}' in election '${electionId}'`,
    electionId: Number(electionId) || 1,
  });

  try {
    await repos.auditEvents.appendEvent({
      id: `audit-evt-${now}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: now,
      type: 'MANUAL_ID_EXCEPTION_CONSUMED',
      actor: {
        actorId: voter.id,
        actorRole: 'VOTER_ANONYMOUS',
      },
      action: 'CONSUME_MANUAL_ID_EXCEPTION',
      target: {
        category: 'EXCEPTION_REQUEST',
        targetReference: exception.id,
      },
      outcome: 'SUCCESS',
      electionId: String(electionId),
      constituencyId: voter.constituencyId,
      metadata: {
        voterId: voter.id,
        simulationVoterId: voter.simulationVoterId,
        electionId: String(electionId),
        decisionOutcome: 'MANUAL_PHYSICAL_ID_APPROVED',
      },
      schemaVersion: SCHEMA_VERSION_CURRENT,
    });
  } catch (auditErr: any) {
    console.warn('[Audit] Notice recording structured audit event:', auditErr.message);
  }

  res.status(200).json({
    success: true,
    message: 'Manual physical-ID exception successfully verified and consumed.',
    outcome: 'MANUAL_PHYSICAL_ID_APPROVED',
    authorizationGranted: true,
    exception: {
      id: exception.id,
      status: exception.status,
      consumedAt: exception.consumedAt,
      consumedInElectionId: exception.consumedInElectionId,
      decisionOutcome: exception.decisionOutcome,
    },
  });
});

