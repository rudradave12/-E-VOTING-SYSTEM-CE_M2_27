import React, { useState } from 'react';
import { ethers } from 'ethers';
import { Candidate, Constituency, VoterRecord, VotingAuthorizationTicket, VoteReceipt } from '../../types';
import { evmSimulator } from '../../utils/evmSimulator';
import deploymentManifest from '../../contracts/deployment.json';
import {
  Wallet,
  ShieldCheck,
  Cpu,
  ArrowRight,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  ExternalLink,
  Info,
} from 'lucide-react';

interface MetaMaskScreenProps {
  voter: VoterRecord;
  constituency: Constituency;
  candidate: Candidate;
  ticket: VotingAuthorizationTicket;
  voterWalletAddress: string;
  isSimulatedEVM: boolean;
  onVoteSuccess: (receipt: VoteReceipt) => void;
  onCancel: () => void;
}

type TxProgressState = 'idle' | 'simulating' | 'awaiting_signature' | 'mining' | 'confirmed' | 'failed';

export const MetaMaskScreen: React.FC<MetaMaskScreenProps> = ({
  voter,
  constituency,
  candidate,
  ticket,
  voterWalletAddress,
  isSimulatedEVM,
  onVoteSuccess,
  onCancel,
}) => {
  const [walletMode, setWalletMode] = useState<'simulator' | 'metamask'>(
    isSimulatedEVM ? 'simulator' : 'metamask'
  );
  const [txState, setTxState] = useState<TxProgressState>('idle');
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCastVote = async () => {
    setErrorMessage(null);

    // MODE 1: In-Browser Deterministic EVM Simulator / Academic Testnet Signer
    if (walletMode === 'simulator') {
      setTxState('mining');
      try {
        const result = await evmSimulator.castVote(
          voterWalletAddress,
          ticket,
          candidate.numericId,
          candidate.name,
          candidate.partyName,
          constituency.name
        );

        if (result.success && result.receipt) {
          setTxState('confirmed');
          onVoteSuccess(result.receipt);
        } else {
          setTxState('failed');
          setErrorMessage(result.error || 'Simulated EVM transaction failed.');
        }
      } catch (err: any) {
        setTxState('failed');
        setErrorMessage(err.message || 'Unexpected simulator error occurred.');
      }
      return;
    }

    // MODE 2: Real MetaMask / EIP-1193 Web3 Execution
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setErrorMessage(
        'MetaMask extension was not detected in this browser. You can select "Academic Testnet Signer" above for instant zero-setup demonstration.'
      );
      return;
    }

    try {
      setTxState('simulating');
      const browserProvider = new ethers.BrowserProvider((window as any).ethereum);

      // Request explicit account authorization from user
      const signer = await browserProvider.getSigner();
      const connectedAccount = await signer.getAddress();

      // Check account matches authorized voting address
      if (connectedAccount.toLowerCase() !== voterWalletAddress.toLowerCase()) {
        setErrorMessage(
          `Connected MetaMask account (${connectedAccount.substring(0, 8)}...) does not match your authorized voting address (${voterWalletAddress.substring(0, 8)}...). Please switch accounts in MetaMask to your registered address.`
        );
        setTxState('failed');
        return;
      }

      // Check Chain ID
      const network = await browserProvider.getNetwork();
      const targetChainId = BigInt(ticket.chainId);
      if (network.chainId !== targetChainId) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_switchEthereumChain',
            params: [{ chainId: `0x${Number(targetChainId).toString(16)}` }],
          });
        } catch (switchErr: any) {
          console.warn('Network switch notice:', switchErr.message);
        }
      }

      const contractTargetAddress = ticket.contractAddress || deploymentManifest.contractAddress;

      // Verify contract code exists at target address on connected network
      const code = await browserProvider.getCode(contractTargetAddress);
      if (!code || code === '0x' || code === '0x0') {
        setErrorMessage(
          `No smart contract found at address ${contractTargetAddress} on chain ID ${network.chainId}. If running a local Hardhat network on your PC, please execute "npx tsx scripts/deploy.ts" to deploy and seed the election.`
        );
        setTxState('failed');
        return;
      }

      const contract = new ethers.Contract(contractTargetAddress, deploymentManifest.abi, signer);

      // Pre-flight static call simulation to verify on-chain guards before submitting
      try {
        await contract.castVote.staticCall(
          ticket.electionId,
          ticket.constituencyId,
          candidate.numericId,
          ticket.nullifier,
          ticket.expiry,
          ticket.signature
        );
      } catch (simErr: any) {
        const revertReason =
          simErr.reason ||
          simErr.info?.error?.message ||
          simErr.message ||
          'On-chain validation failed during transaction simulation.';
        setErrorMessage(`Smart Contract Revert: ${revertReason}`);
        setTxState('failed');
        return;
      }

      // Prompt MetaMask signature & broadcast transaction
      setTxState('awaiting_signature');
      const tx = await contract.castVote(
        ticket.electionId,
        ticket.constituencyId,
        candidate.numericId,
        ticket.nullifier,
        ticket.expiry,
        ticket.signature
      );

      setPendingTxHash(tx.hash);
      setTxState('mining');

      // Wait for block confirmation
      const receipt = await tx.wait(1);

      if (receipt && receipt.status === 1) {
        setTxState('confirmed');
        const realReceipt: VoteReceipt = {
          receiptId: `REC-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
          electionId: ticket.electionId,
          constituencyId: ticket.constituencyId,
          constituencyName: constituency.name,
          candidateName: candidate.name,
          partyName: candidate.partyName,
          transactionHash: tx.hash,
          blockNumber: Number(receipt.blockNumber),
          timestamp: new Date().toISOString(),
          isSimulated: false,
          watermark: `[LIVE EVM TRANSACTION — BLOCK #${receipt.blockNumber} — CHAIN ID: ${ticket.chainId}]`,
          gasUsed: Number(receipt.gasUsed),
          nullifier: ticket.nullifier,
        };

        onVoteSuccess(realReceipt);
      } else {
        setTxState('failed');
        setErrorMessage('Transaction mined but reverted by EVM on-chain state machine.');
      }
    } catch (err: any) {
      setTxState('failed');
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        setErrorMessage('Transaction signature was cancelled by user in MetaMask.');
      } else {
        setErrorMessage(err.reason || err.message || 'An unexpected error occurred during MetaMask execution.');
      }
    }
  };

  const isSubmitting = txState === 'simulating' || txState === 'awaiting_signature' || txState === 'mining';

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-8 shadow-xs">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 uppercase tracking-widest mb-1">
            <span>Step 6 of 6</span>
            <span aria-hidden="true">·</span>
            <span>Blockchain Execution</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Authorize On-Chain Ballot Transaction
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Select your authorization wallet method to broadcast your cryptographically verified vote.
          </p>
        </div>

        {/* Academic Prototype Transparency & Ballot Privacy Disclosure */}
        <div className="p-3.5 bg-amber-50/90 border border-amber-300 rounded-lg text-xs text-amber-900 mb-6 space-y-1">
          <div className="flex items-center gap-2 font-bold text-amber-950">
            <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>Academic Prototype Notice & Ballot Privacy Disclosure</span>
          </div>
          <p className="leading-relaxed text-[11px] text-amber-800">
            On public EVM blockchains, smart contract function arguments (including candidate and constituency identifiers) are stored in transaction calldata and receipt logs. While elector personal data (EPIC ID, phone number) is decoupled using pseudonymous nullifiers, this prototype does not provide cryptographic ballot secrecy (e.g., zero-knowledge proofs) and is not legally approved for official Indian elections.
          </p>
        </div>

        {/* Wallet Connection Selection Step */}
        <div className="mb-6">
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
            Select Wallet Authorization Method
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setWalletMode('simulator')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                walletMode === 'simulator'
                  ? 'border-orange-500 bg-orange-50/60 ring-2 ring-orange-400'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs text-slate-900 mb-1">
                <Cpu className="w-4 h-4 text-cyan-600" />
                <span>Academic Testnet Signer</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Instant cryptographic signing using local EVM / test node without browser extensions.
              </p>
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => setWalletMode('metamask')}
              className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                walletMode === 'metamask'
                  ? 'border-orange-500 bg-orange-50/60 ring-2 ring-orange-400'
                  : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
              }`}
            >
              <div className="flex items-center gap-2 font-bold text-xs text-slate-900 mb-1">
                <Wallet className="w-4 h-4 text-emerald-600" />
                <span>MetaMask Web3 Extension</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Connect external browser Web3 extension to submit transaction to configured EVM node.
              </p>
            </button>
          </div>
        </div>

        {/* Execution Mode Card */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 mb-6">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              {walletMode === 'simulator' ? (
                <>
                  <Cpu className="w-4 h-4 text-cyan-600" />
                  Execution Target: Academic Testnet / Local Ledger
                </>
              ) : (
                <>
                  <Wallet className="w-4 h-4 text-emerald-600" />
                  Execution Target: MetaMask Extension (EIP-1193)
                </>
              )}
            </span>
            <span className="text-[11px] font-mono text-slate-500">
              Chain ID: {ticket.chainId} · {walletMode === 'simulator' ? 'Simulated' : 'Local / Testnet'}
            </span>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-slate-500">Contract Address:</span>
              <span className="font-mono text-slate-800 truncate max-w-[220px]">
                {ticket.contractAddress || deploymentManifest.contractAddress}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Submitting Wallet:</span>
              <span className="font-mono text-slate-800 truncate max-w-[220px]">
                {voterWalletAddress}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Cryptographic Nullifier:</span>
              <span className="font-mono text-slate-800 truncate max-w-[220px]">
                {ticket.nullifier}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">EIP-712 Signature:</span>
              <span className="font-semibold text-emerald-700 flex items-center gap-1">
                <ShieldCheck className="w-3.5 h-3.5" /> Valid Server Authority Signature
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Estimated Gas:</span>
              <span className="font-mono text-slate-800">54,210 gas (~0.0008 ETH)</span>
            </div>
          </div>
        </div>

        {/* Selected Candidate Quick Reference */}
        <div className="p-3 bg-orange-50/60 border border-orange-200 rounded-lg text-xs text-orange-950 flex items-center justify-between mb-6">
          <span>
            Ballot Choice:{' '}
            <strong className="text-slate-900 font-bold">{candidate.name}</strong> ({candidate.partyAbbreviation})
          </span>
          <span className="text-slate-500">Constituency #{ticket.constituencyId}</span>
        </div>

        {/* Dynamic Transaction Progress State */}
        {isSubmitting && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-900 mb-6">
            <div className="flex items-center gap-2.5 font-semibold">
              <RotateCcw className="w-4 h-4 animate-spin text-blue-600" />
              {txState === 'simulating' && <span>Simulating on-chain invariants via staticCall...</span>}
              {txState === 'awaiting_signature' && <span>Awaiting transaction confirmation in MetaMask...</span>}
              {txState === 'mining' && (
                <span>
                  Mining ballot transaction on blockchain...
                  {pendingTxHash && <span className="font-mono block mt-1 text-[11px] text-blue-700 truncate">Hash: {pendingTxHash}</span>}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Error Notification & Failure Recovery */}
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 mb-6">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold mb-1">Transaction Execution Halted:</p>
                <p className="leading-relaxed mb-2">{errorMessage}</p>
                <p className="text-[11px] text-red-700 font-medium">
                  Failure Recovery Active: Your voter eligibility record is not finalized. You can retry submission or switch to the simulated EVM if a local node is unavailable.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Local node setup notice for real MetaMask mode */}
        {walletMode === 'metamask' && (
          <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 mb-6 flex items-start gap-2">
            <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
            <p>
              MetaMask connects to your local Hardhat EVM network at <code className="font-mono text-slate-800">http://127.0.0.1:8545</code> (Chain ID <code className="font-mono text-slate-800">31337</code>). For zero-setup test voting, select &quot;Academic Testnet Signer&quot; above.
            </p>
          </div>
        )}

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 sm:border-transparent rounded-lg transition-colors cursor-pointer text-center"
          >
            Cancel & Return
          </button>

          <button
            type="button"
            onClick={handleCastVote}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-semibold rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed text-sm"
          >
            {isSubmitting ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Broadcasting to EVM Ledger...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Confirm & Sign Vote on Blockchain</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
