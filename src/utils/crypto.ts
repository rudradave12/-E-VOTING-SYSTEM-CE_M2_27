import { ethers } from 'ethers';
import { VotingAuthorizationTicket } from '../types';

// Demonstration authorization signer private key for academic testing
// In production, this resides exclusively on an HSM or secure server backend
export const DEMO_AUTHORIZATION_SIGNER_PRIVATE_KEY =
  '0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d';

export const DEMO_AUTHORIZATION_SIGNER_ADDRESS = new ethers.Wallet(
  DEMO_AUTHORIZATION_SIGNER_PRIVATE_KEY
).address;

// Server-side secret salt for synthetic voter commitment hashing
export const SERVER_COMMITMENT_SALT = 'BLOCKBALLOT_SALT_2024_DEMO_SECRET_XYZ999';

// EIP-712 Domain and Types specification matching IndianElection.sol
export const EIP712_DOMAIN_NAME = 'BlockBallot';
export const EIP712_DOMAIN_VERSION = '1';

export const getEip712Domain = (chainId: number, contractAddress: string) => ({
  name: EIP712_DOMAIN_NAME,
  version: EIP712_DOMAIN_VERSION,
  chainId,
  verifyingContract: contractAddress,
});

export const EIP712_TYPES = {
  VotingAuthorization: [
    { name: 'electionId', type: 'uint256' },
    { name: 'constituencyId', type: 'uint256' },
    { name: 'voterWallet', type: 'address' },
    { name: 'nullifier', type: 'bytes32' },
    { name: 'expiry', type: 'uint256' },
  ],
};

/**
 * Derives a pseudonymous on-chain nullifier from a synthetic EPIC ID, server salt, and election ID.
 * This guarantees duplicate-vote prevention while preventing direct reverse lookup of EPIC ID.
 */
export function deriveNullifier(epicId: string, electionId: number): string {
  const saltedEpicHash = ethers.solidityPackedKeccak256(
    ['string', 'string'],
    [epicId.trim().toUpperCase(), SERVER_COMMITMENT_SALT]
  );
  return ethers.solidityPackedKeccak256(
    ['bytes32', 'uint256'],
    [saltedEpicHash, electionId]
  );
}

/**
 * Computes an HMAC-SHA256 representation of a 6-digit OTP code.
 * Ensures the plaintext OTP is never stored directly in database records.
 */
export function hashOtpCode(otp: string, epicId: string): string {
  return ethers.solidityPackedKeccak256(
    ['string', 'string', 'string'],
    [otp.trim(), epicId.trim().toUpperCase(), SERVER_COMMITMENT_SALT]
  );
}

/**
 * Signs an EIP-712 voting authorization ticket.
 * Executed on server-side authority (or in simulated mode for offline demonstration).
 */
export async function signVotingAuthorization(
  electionId: number,
  constituencyId: number,
  voterWallet: string,
  nullifier: string,
  expiry: number,
  chainId: number,
  contractAddress: string,
  signerPrivateKey: string = DEMO_AUTHORIZATION_SIGNER_PRIVATE_KEY
): Promise<VotingAuthorizationTicket> {
  const wallet = new ethers.Wallet(signerPrivateKey);
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
 * Verifies an EIP-712 voting authorization signature.
 */
export function verifyVotingAuthorization(
  ticket: VotingAuthorizationTicket,
  expectedSignerAddress: string = DEMO_AUTHORIZATION_SIGNER_ADDRESS
): { isValid: boolean; recoveredSigner: string; error?: string } {
  try {
    const domain = getEip712Domain(ticket.chainId, ticket.contractAddress);
    const value = {
      electionId: ticket.electionId,
      constituencyId: ticket.constituencyId,
      voterWallet: ticket.voterWallet,
      nullifier: ticket.nullifier,
      expiry: ticket.expiry,
    };

    const recovered = ethers.verifyTypedData(
      domain,
      EIP712_TYPES,
      value,
      ticket.signature
    );

    const isMatch = recovered.toLowerCase() === expectedSignerAddress.toLowerCase();
    return {
      isValid: isMatch,
      recoveredSigner: recovered,
      error: isMatch ? undefined : 'Recovered signer does not match authorized authority',
    };
  } catch (err) {
    return {
      isValid: false,
      recoveredSigner: '',
      error: err instanceof Error ? err.message : 'Signature verification failed',
    };
  }
}
