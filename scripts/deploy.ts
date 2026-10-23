import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ethers } from 'ethers';
import dotenv from 'dotenv';
import { SERVER_AUTHORIZATION_SIGNER_ADDRESS } from '../server/config';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function deployContract(
  rpcUrl: string = 'http://127.0.0.1:8545',
  deployerPrivateKey?: string
) {
  const artifactPath = path.resolve(__dirname, '../artifacts/contracts/IndianElection.sol/IndianElection.json');
  if (!fs.existsSync(artifactPath)) {
    throw new Error('Contract artifact not found. Please run: npx hardhat --config hardhat.config.cjs compile');
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));

  // Connect to local network provider
  const provider = new ethers.JsonRpcProvider(rpcUrl);

  // Use specified deployer or first default Hardhat account
  const deployerKey =
    deployerPrivateKey ||
    process.env.DEPLOYER_PRIVATE_KEY ||
    '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80'; // Hardhat Account #0

  const wallet = new ethers.Wallet(deployerKey, provider);

  // Verify network and prevent accidental public chain deployment
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const isLocalChain = chainId === 31337 || chainId === 1337;

  if (!isLocalChain && process.env.ALLOW_PUBLIC_DEPLOYMENT !== 'true') {
    throw new Error(
      `Accidental public deployment blocked: Connected to non-local chainId ${chainId}. To deploy to a remote/public network, explicit ALLOW_PUBLIC_DEPLOYMENT=true is required.`
    );
  }

  if (!isLocalChain && deployerKey.toLowerCase() === '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80') {
    throw new Error('SECURITY VIOLATION: Cannot deploy to a non-local network with default Hardhat test account #0.');
  }

  // Import verified runtime authorization signer address from server config
  const authorizationSignerAddress = SERVER_AUTHORIZATION_SIGNER_ADDRESS;
  if (!authorizationSignerAddress) {
    throw new Error(
      'Cannot deploy: SERVER_AUTHORIZATION_SIGNER_KEY is missing or invalid in server environment. Please configure it in .env or environment variables.'
    );
  }

  console.log(`[Deploy] Deployer Address: ${wallet.address}`);
  console.log(`[Deploy] Target Authorization Signer Address: ${authorizationSignerAddress}`);
  console.log(`[Deploy] Target Network: Chain ID ${chainId} (${isLocalChain ? 'local test' : 'remote/public'})`);

  let nonce = await wallet.getNonce('latest');

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const contract = await factory.deploy(authorizationSignerAddress, { nonce: nonce++ });
  await contract.waitForDeployment();

  const deployedAddress = await contract.getAddress();
  console.log(`[Deploy] IndianElection successfully deployed to: ${deployedAddress}`);

  // Seed deterministic test election
  console.log('[Deploy] Seeding 18th Lok Sabha General Election 2024...');
  const now = Math.floor(Date.now() / 1000);
  const txCreate = await (contract as any).createElection(
    18,
    '18th Lok Sabha General Election 2024',
    now - 86400,
    now + 86400 * 7,
    { nonce: nonce++ }
  );
  await txCreate.wait();

  // Register Candidates for New Delhi (Constituency #4)
  console.log('[Deploy] Seeding constituency candidates...');
  await (await (contract as any).registerCandidate(18, 4, 101, 'Bansuri Swaraj', 'BJP', { nonce: nonce++ })).wait();
  await (await (contract as any).registerCandidate(18, 4, 102, 'Somnath Bharti', 'AAP', { nonce: nonce++ })).wait();
  await (await (contract as any).registerCandidate(18, 4, 103, 'Devender Yadav', 'INC', { nonce: nonce++ })).wait();
  await (await (contract as any).registerCandidate(18, 4, 104, 'None of the Above (NOTA)', 'NOTA', { nonce: nonce++ })).wait();

  // Activate Election
  console.log('[Deploy] Activating election status...');
  await (await (contract as any).setElectionStatus(18, 1, { nonce: nonce++ })).wait(); // Status 1 = Active

  // Write deployment manifest with explicit test-only and security metadata
  const manifest = {
    contractName: 'IndianElection',
    chainId,
    networkName: isLocalChain ? 'hardhat-local' : (network.name || `chain-${chainId}`),
    contractAddress: deployedAddress,
    authorizationSigner: authorizationSignerAddress,
    deployedAt: new Date().toISOString(),
    isTestDeployment: isLocalChain,
    environment: isLocalChain ? 'test-only' : 'staging',
    disclaimer:
      'Academic prototype only. Ballot choices are submitted as plaintext candidate IDs on-chain and are publicly visible in transaction input data and emitted events. Does not provide ballot secrecy or real-election suitability.',
    abi: artifact.abi,
  };

  const manifestPath = path.resolve(__dirname, '../src/contracts/deployment.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`[Deploy] Saved deployment manifest to: ${manifestPath}`);

  return { contract, deployedAddress, authorizationSignerAddress };
}

// Execute if run directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  deployContract()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[Deploy] Deployment failed:', err.message);
      process.exit(1);
    });
}
