import React, { useState } from 'react';
import { ethers } from 'ethers';
import { Candidate, Constituency, VoterRecord, VotingAuthorizationTicket, VoteReceipt } from '../../types';
import { evmSimulator } from '../../utils/evmSimulator';
import deploymentManifest from '../../contracts/deployment.json';
import {
  ShieldCheck,
  Cpu,
  ArrowRight,
  AlertCircle,
  RotateCcw,
  CheckCircle2,
  Lock,
  Wallet,
  ChevronDown,
  ChevronUp,
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
  voter: _voter,
  constituency,
  candidate,
  ticket,
  voterWalletAddress,
  isSimulatedEVM,
  onVoteSuccess,
  onCancel,
}) => {
  // Default to built-in simulation engine for a smooth, accessible voter experience
  const [walletMode, setWalletMode] = useState<'simulator' | 'metamask'>(
    isSimulatedEVM ? 'simulator' : 'simulator'
  );
  const [showAdvancedOptions, setShowAdvancedOptions] = useState<boolean>(false);
  const [txState, setTxState] = useState<TxProgressState>('idle');
  const [pendingTxHash, setPendingTxHash] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleCastVote = async () => {
    setErrorMessage(null);

    // MODE 1: Built-in Official Secure Voting Engine (Zero Setup)
    if (walletMode === 'simulator') {
      setTxState('simulating');
      try {
        // Small organic delay so voters see status transition clearly
        await new Promise((resolve) => setTimeout(resolve, 400));
        setTxState('mining');

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
          setErrorMessage(result.error || 'The voting system encountered an issue recording your vote. Please try again.');
        }
      } catch (err: any) {
        setTxState('failed');
        setErrorMessage(err.message || 'An unexpected error occurred while casting your ballot. Please try again.');
      }
      return;
    }

    // MODE 2: External MetaMask / EIP-1193 Web3 Execution (Advanced)
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setErrorMessage(
        'MetaMask extension was not detected in this browser. Please use the default Official Voting Engine for instant zero-setup voting.'
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
          `Connected wallet account (${connectedAccount.substring(0, 8)}...) does not match your authorized voting address (${voterWalletAddress.substring(0, 8)}...). Please switch to your authorized account.`
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

      // Verify contract code exists at target address
      const code = await browserProvider.getCode(contractTargetAddress);
      if (!code || code === '0x' || code === '0x0') {
        setErrorMessage(
          `Election contract is not accessible on the connected network. Switch to the default Official Voting Engine for instant demonstration.`
        );
        setTxState('failed');
        return;
      }

      const contract = new ethers.Contract(contractTargetAddress, deploymentManifest.abi, signer);

      // Pre-flight static call simulation
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
          'Your vote could not be verified on the ledger.';
        setErrorMessage(`Ledger Verification Issue: ${revertReason}`);
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
          watermark: `[OFFICIAL BLOCKCHAIN TRANSACTION — BLOCK #${receipt.blockNumber} — CHAIN ID: ${ticket.chainId}]`,
          gasUsed: Number(receipt.gasUsed),
          nullifier: ticket.nullifier,
        };

        onVoteSuccess(realReceipt);
      } else {
        setTxState('failed');
        setErrorMessage('Transaction completed but was not accepted by the state machine. Please try again.');
      }
    } catch (err: any) {
      setTxState('failed');
      if (err.code === 4001 || err.code === 'ACTION_REJECTED') {
        setErrorMessage('Transaction was cancelled by user.');
      } else {
        setErrorMessage(err.reason || err.message || 'An unexpected error occurred while processing your vote.');
      }
    }
  };

  const isSubmitting = txState === 'simulating' || txState === 'awaiting_signature' || txState === 'mining';

  return (
    <div className="max-w-2xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-8 shadow-xs">
        {/* Step Indicator & Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 uppercase tracking-widest mb-1">
            <span>Step 6 of 7</span>
            <span aria-hidden="true">·</span>
            <span>Cast Ballot</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Submit Your Official Vote
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Confirm and record your ballot on the decentralized election ledger.
          </p>
        </div>

        {/* Selected Candidate Quick Reference */}
        <div className="p-4 bg-orange-50/70 border-2 border-orange-200 rounded-xl mb-6">
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-orange-800 block mb-0.5">
                Your Confirmed Choice
              </span>
              <h3 className="text-base sm:text-lg font-bold text-slate-900">
                {candidate.name}
              </h3>
              <p className="text-xs text-slate-600">
                {candidate.partyName} ({candidate.partyAbbreviation}) • Symbol: {candidate.symbol}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-mono font-semibold px-2 py-1 bg-white border border-orange-200 rounded text-slate-700">
                {constituency.name}
              </span>
            </div>
          </div>
        </div>

        {/* Security & Verification Status */}
        <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 mb-6 space-y-2.5">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Voter Security & Authorization</span>
            </span>
            <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-100/80 px-2 py-0.5 rounded-full">
              Eligibility Verified
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600 pt-1">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Ballot Token Status</span>
              <span className="font-semibold text-slate-800 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> Authorized by Commission
              </span>
            </div>
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-semibold">Ballot Privacy Guard</span>
              <span className="font-mono text-slate-800 text-[11px]">
                Nullifier: {ticket.nullifier.substring(0, 16)}...
              </span>
            </div>
          </div>
        </div>

        {/* Dynamic Submission Progress */}
        {isSubmitting && (
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900 mb-6">
            <div className="flex items-center gap-3">
              <RotateCcw className="w-5 h-5 animate-spin text-blue-600 shrink-0" />
              <div>
                <p className="font-bold text-sm text-blue-950">
                  {txState === 'simulating' && 'Verifying your vote authorization...'}
                  {txState === 'awaiting_signature' && 'Awaiting voter confirmation...'}
                  {txState === 'mining' && 'Connecting securely and recording your vote...'}
                </p>
                <p className="text-[11px] text-blue-700 mt-0.5">
                  Please keep this window open while the transaction is confirmed on the ledger.
                </p>
                {pendingTxHash && (
                  <p className="font-mono text-[10px] text-blue-600 mt-1 truncate">
                    Transaction ID: {pendingTxHash}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Error Notification & Failure Recovery */}
        {errorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-800 mb-6">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold mb-1">Unable to Complete Vote Submission</p>
                <p className="leading-relaxed mb-2">{errorMessage}</p>
                <p className="text-[11px] text-red-700 font-medium">
                  Your voter eligibility has not been altered. You may safely retry submission.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Advanced Options Toggle (MetaMask) */}
        <div className="mb-6 border-t border-slate-100 pt-3">
          <button
            type="button"
            disabled={isSubmitting}
            onClick={() => setShowAdvancedOptions(!showAdvancedOptions)}
            className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1 cursor-pointer transition-colors"
          >
            {showAdvancedOptions ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            <span>Advanced Connection Settings</span>
          </button>

          {showAdvancedOptions && (
            <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
              <span className="text-[11px] font-bold text-slate-700 block">
                Execution Engine Selection
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setWalletMode('simulator')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer text-xs ${
                    walletMode === 'simulator'
                      ? 'border-orange-500 bg-orange-50/70 font-semibold text-orange-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-cyan-600" />
                    <span>Official Voting Engine</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">Recommended zero-setup execution</span>
                </button>

                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => setWalletMode('metamask')}
                  className={`p-2.5 rounded-lg border text-left transition-all cursor-pointer text-xs ${
                    walletMode === 'metamask'
                      ? 'border-orange-500 bg-orange-50/70 font-semibold text-orange-950'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                    <span>MetaMask Web3 Extension</span>
                  </div>
                  <span className="text-[10px] text-slate-500 block mt-0.5">External browser wallet</span>
                </button>
              </div>

              {walletMode === 'metamask' && (
                <div className="p-2.5 bg-blue-50 border border-blue-200 rounded text-[11px] text-blue-900 flex items-start gap-1.5">
                  <Info className="w-3.5 h-3.5 text-blue-600 shrink-0 mt-0.5" />
                  <span>MetaMask connects to your local Hardhat EVM network at http://127.0.0.1:8545 (Chain ID 31337).</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Academic Prototype Transparency & Ballot Privacy Disclosure (BB-SEC-PH09-BALLOT-SECRECY) */}
        <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-lg text-xs text-amber-900 mb-6 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-950 text-[11px]">
            <AlertCircle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <span>Academic Prototype Notice & Ballot Privacy Disclosure (BB-SEC-PH09-BALLOT-SECRECY)</span>
          </div>
          <p className="leading-relaxed text-[11px] text-amber-800">
            This demonstration platform records ballots on a transparent blockchain ledger. Personal voter IDs are decoupled using cryptographic nullifiers. In accordance with benchmark requirement <code className="font-mono text-[10px]">BB-SEC-PH09-BALLOT-SECRECY</code>, this academic implementation does not include zero-knowledge ballot encryption and is not intended for official government elections.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onCancel}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 border border-slate-200 sm:border-transparent rounded-lg transition-colors cursor-pointer text-center"
          >
            Cancel & Return
          </button>

          <button
            type="button"
            onClick={handleCastVote}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-6 py-3 bg-emerald-700 hover:bg-emerald-800 disabled:bg-slate-300 text-white font-bold rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed text-sm"
          >
            {isSubmitting ? (
              <>
                <RotateCcw className="w-4 h-4 animate-spin" />
                <span>Recording Your Vote...</span>
              </>
            ) : (
              <>
                <ShieldCheck className="w-4 h-4" />
                <span>Cast Official Ballot</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
