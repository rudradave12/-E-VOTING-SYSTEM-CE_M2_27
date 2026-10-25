/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { VoteReceipt } from '../../types';
import { CivicEmblem } from '../CivicEmblem';
import { useLanguage } from '../../context/LanguageContext';
import {
  CheckCircle2,
  Printer,
  ArrowRight,
  ShieldCheck,
  ExternalLink,
  BarChart2,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Cpu,
  Copy,
  Check,
} from 'lucide-react';

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
  const { language, t } = useLanguage();
  const [showTechnical, setShowTechnical] = useState<boolean>(false);
  const [copiedHash, setCopiedHash] = useState<boolean>(false);

  const handleCopyHash = () => {
    navigator.clipboard.writeText(receipt.transactionHash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Prominent Sandbox Notice Banner */}
      <div className="rounded-xl border-2 border-dashed border-orange-400 bg-orange-50 p-4 text-center text-orange-950 shadow-2xs">
        <span className="font-mono text-xs sm:text-sm font-extrabold uppercase tracking-widest block text-orange-900">
          PRACTICE BALLOT RECEIPT — NOT A REAL ELECTION VOTE
        </span>
        <span className="text-xs text-orange-800 block mt-0.5">
          {language === 'hi'
            ? 'यह एक शैक्षणिक अभ्यास पावती है। कोई वास्तविक मत दर्ज नहीं किया गया है।'
            : 'Academic research prototype demonstration receipt. No real ballot was recorded.'}
        </span>
      </div>

      {/* Success Badge */}
      <div className="text-center space-y-2">
        <div className="w-16 h-16 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center mx-auto shadow-xs">
          <CheckCircle2 className="w-9 h-9" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {language === 'hi' ? 'मतदान सफलतापूर्वक संपन्न' : 'Ballot Cast Successfully'}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600 max-w-md mx-auto">
          {language === 'hi'
            ? 'आपका मत सुरक्षित डिजिटल बहीखाते (EVM) में दर्ज हो गया है और इसकी सत्यता प्रमाणित है।'
            : 'Your practice ballot has been cryptographically confirmed and committed with single-use verification.'}
        </p>
      </div>

      {/* Official Civic Voting Receipt Card */}
      <div className="bg-white border-2 border-slate-300 rounded-2xl p-6 sm:p-8 shadow-xs relative overflow-hidden space-y-6">
        {/* Receipt Header */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <CivicEmblem size={44} />
            <div>
              <span className="text-[10px] sm:text-[11px] font-bold text-orange-700 uppercase tracking-widest block">
                BlockBallot · Civic Prototype
              </span>
              <h2 className="text-base sm:text-lg font-extrabold text-slate-900">
                {language === 'hi' ? 'अभ्यास मतदान डिजिटल पावती' : 'Practice Voting Digital Receipt'}
              </h2>
            </div>
          </div>
          <div className="text-right">
            <span className="text-[10px] text-slate-400 block font-mono">RECEIPT NO.</span>
            <span className="font-mono text-xs sm:text-sm font-bold text-slate-800">{receipt.receiptId}</span>
          </div>
        </div>

        {/* Core Civic Receipt Details */}
        <div className="space-y-3 text-xs sm:text-sm border-b border-slate-200 pb-6">
          <div className="flex justify-between">
            <span className="text-slate-500">Parliamentary Constituency:</span>
            <span className="font-bold text-slate-900">{receipt.constituencyName} (#{receipt.constituencyId})</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">Timestamp:</span>
            <span className="font-mono text-slate-800">{new Date(receipt.timestamp).toLocaleString()}</span>
          </div>

          <div className="flex justify-between">
            <span className="text-slate-500">Confirmation Status:</span>
            <span className="font-semibold text-emerald-700 flex items-center gap-1">
              <ShieldCheck className="w-4 h-4 text-emerald-600" />
              <span>Cryptographically Confirmed</span>
            </span>
          </div>

          <div className="flex justify-between items-center pt-1">
            <span className="text-slate-500">Reference Hash:</span>
            <div className="flex items-center gap-1.5">
              <span className="font-mono text-xs font-semibold text-slate-800 truncate max-w-[180px] sm:max-w-xs" title={receipt.transactionHash}>
                {receipt.transactionHash}
              </span>
              <button
                type="button"
                onClick={handleCopyHash}
                title="Copy Transaction Hash"
                aria-label="Copy transaction hash to clipboard"
                className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors cursor-pointer bb-touch-target"
              >
                {copiedHash ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Expandable Cryptographic Details */}
        <div className="space-y-2">
          <button
            onClick={() => setShowTechnical((prev) => !prev)}
            className="w-full flex items-center justify-between text-xs text-slate-600 hover:text-slate-900 font-semibold cursor-pointer"
          >
            <span className="flex items-center gap-1.5">
              <Cpu className="w-3.5 h-3.5 text-slate-500" />
              <span>{showTechnical ? 'Hide Technical Verification Data' : 'View On-Chain Cryptographic Proof'}</span>
            </span>
            {showTechnical ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showTechnical && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs font-mono space-y-1.5 text-slate-700">
              <div><strong>Block Number:</strong> #{receipt.blockNumber}</div>
              <div><strong>Single-Use Nullifier:</strong> {receipt.nullifier}</div>
              <div><strong>Execution Gas Used:</strong> {receipt.gasUsed.toLocaleString()} units</div>
              <div><strong>Execution Mode:</strong> {receipt.isSimulated ? 'Deterministic In-Browser EVM Engine' : 'Live Hardhat Node'}</div>
            </div>
          )}
        </div>

        {/* Privacy Decoupling Assurance */}
        <div className="pt-2 text-[11px] text-slate-500 leading-relaxed">
          <p>
            <strong className="text-slate-700">Civic Privacy Guarantee:</strong> Your ballot selection is confidential and never stored with your identity. This receipt enables you to verify that your ballot was included in the election tally without proving how you voted to any third party.
          </p>
        </div>
      </div>

      {/* Actions */}
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
            <span>2024 Election Archive</span>
          </button>

          <button
            onClick={onDone}
            className="w-full sm:w-auto px-6 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <span>Finish Practice Session</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
