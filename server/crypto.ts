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
