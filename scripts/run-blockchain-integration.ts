/**
 * BlockBallot — Dedicated Blockchain Integration Test Runner
 *
 * Checks connectivity to the local Hardhat JSON-RPC node on http://127.0.0.1:8545.
 * Fails IMMEDIATELY and CLEARLY with non-zero exit code if the node is offline,
 * preventing silent test skips.
 */
import { spawn } from 'node:child_process';

const RPC_URL = 'http://127.0.0.1:8545';

async function checkHardhatNodeHealth(): Promise<{ running: boolean; blockNumber?: number; error?: string }> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);

    const res = await fetch(RPC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_blockNumber', params: [], id: 1 }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      return { running: false, error: `HTTP ${res.status}: ${res.statusText}` };
    }

    const data: any = await res.json();
    if (data.result !== undefined) {
      return { running: true, blockNumber: parseInt(data.result, 16) };
    }
    return { running: false, error: 'Malformed JSON-RPC response' };
  } catch (err: any) {
    return { running: false, error: err.message || 'Connection refused' };
  }
}

async function main() {
  console.log('================================================================================');
  console.log('BlockBallot — Dedicated Blockchain Integration Test Runner');
  console.log(`Checking local Hardhat JSON-RPC node status at: ${RPC_URL}`);
  console.log('================================================================================');

  const health = await checkHardhatNodeHealth();

  if (!health.running) {
    console.error('\n❌ INTEGRATION TEST FAILED: REQUIRED SERVICE UNAVAILABLE');
    console.error('--------------------------------------------------------------------------------');
    console.error(`Local Hardhat node at ${RPC_URL} is NOT running or unreachable.`);
    console.error(`Detail: ${health.error}`);
    console.error('');
    console.error('To run live smart-contract and EIP-712 integration tests:');
    console.error('  1. Start the local node in a separate terminal:');
    console.error('       npm run node:start');
    console.error('     or:');
    console.error('       npx hardhat --config hardhat.config.cjs node --chain-id 31337 --port 8545');
    console.error('  2. Re-run this command:');
    console.error('       npm run test:integration');
    console.error('--------------------------------------------------------------------------------');
    console.error('Exiting with code 1 (fails closed, no silent skips).\n');
    process.exit(1);
  }

  console.log(`✓ Local Hardhat JSON-RPC node is active! Current block number: ${health.blockNumber}`);
  console.log('Executing live smart-contract, EIP-712, and receipt integration test suites...\n');

  const testFiles = [
    'tests/contract_guards.test.ts',
    'tests/eip712.test.ts',
    'tests/phase7d_blockchain_integration.test.ts',
  ];

  const child = spawn(
    'npx',
    ['tsx', '--test', '--test-concurrency=1', ...testFiles],
    { shell: true, stdio: 'inherit' }
  );

  child.on('close', (code) => {
    if (code === 0) {
      console.log('\n================================================================================');
      console.log('✓ ALL LIVE BLOCKCHAIN INTEGRATION TESTS PASSED (0 SKIPPED)');
      console.log('================================================================================\n');
    } else {
      console.error(`\n❌ Blockchain integration tests failed with exit code: ${code}\n`);
    }
    process.exit(code ?? 1);
  });
}

main().catch((err) => {
  console.error('Fatal error running integration runner:', err);
  process.exit(1);
});
