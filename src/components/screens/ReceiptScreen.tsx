import React from 'react';
import { VoteReceipt } from '../../types';
import { CivicEmblem } from '../CivicEmblem';
import { CheckCircle2, Printer, ArrowRight, ShieldCheck, ExternalLink, BarChart2 } from 'lucide-react';

interface ReceiptScreenProps {
  receipt: VoteReceipt;
  onViewResults: () => void;
  onDone: () => void;
}

export const ReceiptScreen: React.FC<ReceiptScreenProps> = ({
  receipt,
  onViewResults,
  onDone,
}) => {
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {/* Success Badge */}
      <div className="text-center mb-6">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto mb-3 shadow-xs">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          Ballot Cast Successfully
        </h1>
        <p className="text-sm text-slate-600 mt-1 max-w-md mx-auto">
          Your vote has been mined into the EVM blockchain state machine with an immutable cryptographic commitment.
        </p>
      </div>

      {/* Official Civic Voting Receipt */}
      <div className="bg-white border-2 border-slate-300 rounded-xl p-6 sm:p-8 shadow-xs relative overflow-hidden mb-6">
        {/* Academic Watermark Strip */}
        <div className="bg-slate-900 text-amber-300 font-mono text-[11px] font-bold py-1.5 px-4 -mx-6 sm:-mx-8 -mt-6 sm:-mt-8 mb-6 text-center tracking-wider border-b border-slate-800">
          {receipt.watermark}
        </div>

        {/* Receipt Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <CivicEmblem size={44} />
            <div>
              <span className="text-[11px] font-bold text-orange-700 uppercase tracking-widest block">
                Election Commission of India · Academic Prototype
              </span>
              <h2 className="text-base font-extrabold text-slate-900">
                Official E-Voting Transaction Receipt
              </h2>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-mono">RECEIPT ID</span>
            <span className="font-mono text-xs font-bold text-slate-800">{receipt.receiptId}</span>
          </div>
        </div>

        {/* Receipt Fields */}
        <div className="py-6 space-y-3 text-xs border-b border-slate-200">
          <div className="flex justify-between">
            <span className="text-slate-500">Parliamentary Constituency:</span>
            <span className="font-bold text-slate-900">{receipt.constituencyName} (#{receipt.constituencyId})</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">EVM Transaction Hash:</span>
            <span className="font-mono font-medium text-slate-800 truncate max-w-[220px]" title={receipt.transactionHash}>
              {receipt.transactionHash}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">Mined Block Number:</span>
            <span className="font-mono font-bold text-slate-900">#{receipt.blockNumber}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">Timestamp:</span>
            <span className="font-mono text-slate-800">{new Date(receipt.timestamp).toUTCString()}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">Burned Nullifier:</span>
            <span className="font-mono text-slate-800 truncate max-w-[220px]" title={receipt.nullifier}>
              {receipt.nullifier}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">Gas Consumed:</span>
            <span className="font-mono text-slate-800">{receipt.gasUsed.toLocaleString()} gas units</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">Consensus Status:</span>
            <span className="font-semibold text-emerald-700 flex items-center gap-1">
              <ShieldCheck className="w-3.5 h-3.5" /> Confirmed on EVM State Machine
            </span>
          </div>
        </div>

        {/* Privacy Decoupling Assurance */}
        <div className="pt-4 text-[11px] text-slate-500 leading-relaxed">
          <p>
            <strong className="text-slate-700">Verification Guarantee:</strong> This receipt proves your participation without revealing your vote choice on the off-chain voter roll. Store this receipt ID for independent audit checks.
          </p>
        </div>
      </div>

      {/* Action Navigation */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
        <button
          onClick={handlePrint}
          className="w-full sm:w-auto px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
        >
          <Printer className="w-4 h-4 text-slate-500" />
          <span>Print / Save Receipt</span>
        </button>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={onViewResults}
            className="w-full sm:w-auto px-5 py-2.5 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 font-medium rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <BarChart2 className="w-4 h-4 text-slate-500" />
            <span>View Live Results</span>
          </button>

          <button
            onClick={onDone}
            className="w-full sm:w-auto px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Finish Session</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
