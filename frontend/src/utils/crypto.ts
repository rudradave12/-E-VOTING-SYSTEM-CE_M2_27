import { ethers } from 'ethers';
import { VotingAuthorizationTicket } from '../types';
import deploymentManifest from '../contracts/deployment.json';

// Dynamic authorization signer address loaded from deployment manifest and updated at runtime via /api/voter/config
let dynamicAuthorizationSignerAddress: string =
  deploymentManifest?.authorizationSigner && ethers.isAddress(deploymentManifest.authorizationSigner)
    ? deploymentManifest.authorizationSigner
    : '0x95538118D9Bdd4EE0c2404075b7E1116baDAc709';

export function setAuthorizationSignerAddress(address: string): void {
  if (ethers.isAddress(address)) {
    dynamicAuthorizationSignerAddress = address;
  }
}

export function getAuthorizationSignerAddress(): string {
  return dynamicAuthorizationSignerAddress;
}

export const DEMO_AUTHORIZATION_SIGNER_ADDRESS = dynamicAuthorizationSignerAddress;

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
 * Signs an EIP-712 voting authorization ticket with a provided signer key.
 */
export async function signVotingAuthorization(
  electionId: number,
  constituencyId: number,
  voterWallet: string,
  nullifier: string,
  expiry: number,
  chainId: number,
  contractAddress: string,
  signerPrivateKey: string
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
  expectedSignerAddress: string = getAuthorizationSignerAddress()
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
