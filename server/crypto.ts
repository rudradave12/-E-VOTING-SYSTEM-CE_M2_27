import crypto from 'crypto';
import { ethers } from 'ethers';
import { SERVER_CONFIG, derivePublicSignerAddress } from './config';
import { VotingAuthorizationTicket } from '../src/types';

export const EIP712_DOMAIN_NAME = 'BlockBallot';
export const EIP712_DOMAIN_VERSION = '1';

export const EIP712_TYPES = {
  VotingAuthorization: [
    { name: 'electionId', type: 'uint256' },
    { name: 'constituencyId', type: 'uint256' },
    { name: 'voterWallet', type: 'address' },
    { name: 'nullifier', type: 'bytes32' },
    { name: 'expiry', type: 'uint256' },
  ],
};

export function getEip712Domain(chainId: number, contractAddress: string) {
  return {
    name: EIP712_DOMAIN_NAME,
    version: EIP712_DOMAIN_VERSION,
    chainId,
    verifyingContract: contractAddress,
  };
}

/**
 * Generates a cryptographically secure 6-digit numeric OTP code.
 */
export function generate6DigitOtp(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

/**
 * Computes an HMAC-SHA256 representation of the OTP code salted with the epicId.
 * Plaintext OTP is NEVER stored in database records or server persistence.
 */
export function computeOtpHmac(otp: string, epicId: string, customSecret?: string): string {
  const secret = customSecret || SERVER_CONFIG.HMAC_SECRET;
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(`${otp.trim()}:${epicId.trim().toUpperCase()}:${SERVER_CONFIG.COMMITMENT_SALT}`);
  return hmac.digest('hex');
}

/**
 * Constant-time comparison to prevent timing side-channel attacks on OTP verification.
 */
export function verifyOtpHmacConstantTime(providedHmac: string, expectedHmac: string): boolean {
  try {
    const a = Buffer.from(providedHmac, 'hex');
    const b = Buffer.from(expectedHmac, 'hex');
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

/**
 * Derives a pseudonymous on-chain nullifier from synthetic EPIC ID, server salt, and election ID.
 */
export function deriveServerNullifier(epicId: string, electionId: number): string {
  const saltedEpicHash = ethers.solidityPackedKeccak256(
    ['string', 'string'],
    [epicId.trim().toUpperCase(), SERVER_CONFIG.COMMITMENT_SALT]
  );
  return ethers.solidityPackedKeccak256(
    ['bytes32', 'uint256'],
    [saltedEpicHash, electionId]
  );
}

/**
 * Signs an EIP-712 VotingAuthorization ticket on the server using the dedicated signing key.
 */
export async function signEip712VotingAuthorization(
  electionId: number,
  constituencyId: number,
  voterWallet: string,
  nullifier: string,
  expiry: number,
  chainId: number,
  contractAddress: string,
  privateKey?: string
): Promise<VotingAuthorizationTicket> {
  const key = privateKey !== undefined ? privateKey : SERVER_CONFIG.AUTHORIZATION_SIGNER_PRIVATE_KEY;
  if (!key || typeof key !== 'string' || !key.startsWith('0x') || key.length !== 66) {
    throw new Error('EIP-712 signing failed: SERVER_AUTHORIZATION_SIGNER_KEY is not configured or invalid.');
  }

  const wallet = new ethers.Wallet(key);
  const domain = getEip712Domain(chainId, contractAddress);
  const value = {
    electionId,
    constituencyId,
    voterWallet,
    nullifier,
    expiry,
  };

  const signature = await wallet.signTypedData(domain, EIP712_TYPES, value);

  return {
    electionId,
    constituencyId,
    voterWallet,
    nullifier,
    expiry,
    chainId,
    contractAddress,
    signature,
  };
}

/**
 * Recovers and verifies the signer of an EIP-712 VotingAuthorization ticket.
 */
export function verifyEip712Ticket(
  ticket: VotingAuthorizationTicket,
  expectedSignerAddress?: string
): { isValid: boolean; recoveredAddress: string; error?: string } {
  try {
    const domain = getEip712Domain(ticket.chainId, ticket.contractAddress);
    const value = {
      electionId: ticket.electionId,
      constituencyId: ticket.constituencyId,
      voterWallet: ticket.voterWallet,
      nullifier: ticket.nullifier,
      expiry: ticket.expiry,
    };

    const recovered = ethers.verifyTypedData(domain, EIP712_TYPES, value, ticket.signature);
    const expected = expectedSignerAddress || derivePublicSignerAddress();

    if (!expected) {
      return {
        isValid: false,
        recoveredAddress: recovered,
        error: 'Cannot verify ticket: authorization signer address is unconfigured.',
      };
    }

    const isMatch = recovered.toLowerCase() === expected.toLowerCase();

    return {
      isValid: isMatch,
      recoveredAddress: recovered,
      error: isMatch ? undefined : 'Recovered signer does not match authorized election authority.',
    };
  } catch (err) {
    return {
      isValid: false,
      recoveredAddress: '',
      error: err instanceof Error ? err.message : 'EIP-712 signature verification failed.',
    };
  }
}

/**
 * Computes a salted HMAC-SHA256 digest of an EPIC ID for indexed database lookup.
 * Plaintext EPIC IDs can be kept transient in memory without persisting plaintext
 * identifiers to persistent records.
 */
export function computeEpicHash(epicId: string, customSecret?: string): string {
  const secret = customSecret || SERVER_CONFIG.HMAC_SECRET;
  return crypto
    .createHmac('sha256', secret)
    .update(`${epicId.trim().toUpperCase()}:${SERVER_CONFIG.COMMITMENT_SALT}`)
    .digest('hex');
}

/**
 * Payload interface for RFC 7519 / RFC 7515 compliant HS256 Voter JWTs.
 */
export interface VoterJwtPayload {
  iss: string; // Issuer ('BlockBallot')
  aud: string; // Audience ('BlockBallot-Voters')
  sub: string; // Subject (e.g. EPIC ID)
  voterId: string;
  name: string;
  constituencyId: string;
  constituencyCode: number;
  jti: string; // Unique JWT Token ID for replay prevention and revocation
  iat: number; // Issued At (seconds)
  exp: number; // Expiration (seconds)
}

function base64UrlEncode(data: string | Buffer): string {
  const buf = typeof data === 'string' ? Buffer.from(data, 'utf8') : data;
  return buf.toString('base64url');
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, 'base64url').toString('utf8');
}

/**
 * Issues a cryptographically signed, expiring JWT bearer token (HS256) for authenticated voter sessions.
 * Conforms strictly to the original project report specification.
 */
export function createVoterJwt(
  params: {
    epicId: string;
    voterId: string;
    name: string;
    constituencyId: string;
    constituencyCode: number;
    expiryMs?: number;
  },
  customSecret?: string
): { token: string; jti: string; expiresAt: number; iat: number } {
  const nowMs = Date.now();
  const expiryMs = params.expiryMs || SERVER_CONFIG.SESSION_EXPIRY_MS;
  const expiresAt = nowMs + expiryMs;
  const iat = Math.floor(nowMs / 1000);
  const exp = Math.floor(expiresAt / 1000);
  const jti = crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: VoterJwtPayload = {
    iss: 'BlockBallot',
    aud: 'BlockBallot-Voters',
    sub: params.epicId.trim().toUpperCase(),
    voterId: params.voterId,
    name: params.name,
    constituencyId: params.constituencyId,
    constituencyCode: params.constituencyCode,
    jti,
    iat,
    exp,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const secret = customSecret || SERVER_CONFIG.HMAC_SECRET;
  const signature = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');

  const token = `${signingInput}.${signature}`;

  return { token, jti, expiresAt, iat };
}

/**
 * Validates a signed Voter JWT bearer token with constant-time signature comparison,
 * issuer/audience enforcement, and expiration checks.
 */
export function verifyVoterJwt(
  token: string,
  customSecret?: string
): {
  isValid: boolean;
  payload?: VoterJwtPayload;
  error?: string;
} {
  try {
    if (!token || typeof token !== 'string') {
      return { isValid: false, error: 'Token string missing or invalid.' };
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return { isValid: false, error: 'Malformed JWT: must contain exactly 3 dot-separated segments.' };
    }

    const [encodedHeader, encodedPayload, signature] = parts;

    // Validate header
    let header: any;
    try {
      header = JSON.parse(base64UrlDecode(encodedHeader));
    } catch {
      return { isValid: false, error: 'Invalid JWT header: not valid JSON.' };
    }

    if (header.alg !== 'HS256' || header.typ !== 'JWT') {
      return { isValid: false, error: `Unsupported JWT header: expected HS256/JWT, received ${header.alg}/${header.typ}` };
    }

    // Verify HMAC-SHA256 signature in constant-time
    const signingInput = `${encodedHeader}.${encodedPayload}`;
    const secret = customSecret || SERVER_CONFIG.HMAC_SECRET;
    const expectedSig = crypto.createHmac('sha256', secret).update(signingInput).digest('base64url');

    const sigBuf = Buffer.from(signature, 'utf8');
    const expBuf = Buffer.from(expectedSig, 'utf8');

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { isValid: false, error: 'Invalid JWT signature: token has been tampered with or signing key mismatch.' };
    }

    // Validate payload
    let payload: VoterJwtPayload;
    try {
      payload = JSON.parse(base64UrlDecode(encodedPayload));
    } catch {
      return { isValid: false, error: 'Invalid JWT payload: not valid JSON.' };
    }

    // Audience & Issuer validation
    if (payload.iss !== 'BlockBallot') {
      return { isValid: false, error: `Invalid JWT issuer: expected 'BlockBallot', received '${payload.iss}'.` };
    }
    if (payload.aud !== 'BlockBallot-Voters') {
      return { isValid: false, error: `Invalid JWT audience: expected 'BlockBallot-Voters', received '${payload.aud}'.` };
    }

    // Expiry check
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < nowSec) {
      return { isValid: false, error: 'Voter session JWT has expired. Please re-authenticate via OTP.' };
    }

    return { isValid: true, payload };
  } catch (err: any) {
    return { isValid: false, error: err?.message || 'JWT verification failed.' };
  }
}

