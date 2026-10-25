/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { OfficialPartySymbol } from './OfficialPartySymbol';
import {
  X,
  FileText,
  ShieldCheck,
  Award,
  GraduationCap,
  Calendar,
  AlertCircle,
  Coins,
  ExternalLink,
  BookOpen,
} from 'lucide-react';

export interface CandidateAffidavitData {
  name: string;
  nameHi?: string;
  partyName: string;
  partyAbbreviation: string;
  symbol?: string;
  symbolKey?: any;
  education?: string;
  age?: number;
  criminalCases?: number;
  assets?: string;
  affidavitUrl?: string;
  votesCounted?: number;
  votePercentage?: number;
  isWinner?: boolean;
  rank?: number;
}

export interface CandidateAffidavitModalProps {
  isOpen: boolean;
  onClose: () => void;
  candidate: CandidateAffidavitData | null;
}

export const CandidateAffidavitModal: React.FC<CandidateAffidavitModalProps> = ({
  isOpen,
  onClose,
  candidate,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !candidate) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="affidavit-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-orange-600/20 text-orange-400 rounded-xl border border-orange-500/30">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-orange-400 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Verified ECI Candidate Affidavit</span>
              </div>
              <h2 id="affidavit-modal-title" className="text-lg font-bold text-white mt-0.5">
                {candidate.name}
              </h2>
              {candidate.nameHi && (
                <p className="text-xs text-slate-400">{candidate.nameHi}</p>
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-5 text-sm">
          {/* Party and Reserved Symbol Strip */}
          <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-50 border border-slate-200">
            <div>
              <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">
                Political Affiliation
              </span>
              <span className="font-bold text-slate-900 text-sm">
                {candidate.partyName} ({candidate.partyAbbreviation})
              </span>
            </div>
            <div className="flex items-center gap-2 pl-3 border-l border-slate-200">
              <OfficialPartySymbol
                symbolKey={candidate.symbolKey}
                symbolName={candidate.symbol || candidate.partyName}
                partyName={candidate.partyName}
                partyAbbreviation={candidate.partyAbbreviation}
                size="md"
              />
            </div>
          </div>

          {/* Demographic & Declared Metrics Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                <span>Declared Age</span>
              </div>
              <div className="font-bold text-slate-900 text-base">
                {candidate.age && candidate.age > 0 ? `${candidate.age} Years` : 'Not specified'}
              </div>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <Coins className="w-3.5 h-3.5 text-emerald-600" />
                <span>Declared Assets</span>
              </div>
              <div className="font-bold text-slate-900 text-base">
                {candidate.assets || '₹0'}
              </div>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs col-span-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <GraduationCap className="w-3.5 h-3.5 text-indigo-600" />
                <span>Educational Qualifications</span>
              </div>
              <div className="font-semibold text-slate-900 text-xs sm:text-sm">
                {candidate.education || 'Declared in Form 26 Affidavit'}
              </div>
            </div>

            <div className="p-3 bg-white border border-slate-200 rounded-xl shadow-2xs col-span-2">
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
                <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                <span>Declared Criminal Antecedents</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900 text-xs sm:text-sm">
                  {candidate.criminalCases && candidate.criminalCases > 0
                    ? `${candidate.criminalCases} Pending Court Proceeding(s)`
                    : 'Nil (Zero Pending Criminal Cases Declared)'}
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    candidate.criminalCases && candidate.criminalCases > 0
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-emerald-100 text-emerald-900'
                  }`}
                >
                  {candidate.criminalCases && candidate.criminalCases > 0 ? 'Declared' : 'Clean Record'}
                </span>
              </div>
            </div>
          </div>

          {/* Electoral Performance Strip if applicable */}
          {(candidate.votesCounted !== undefined || candidate.votePercentage !== undefined) && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1">
              <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-orange-600" />
                <span>Archived Election Result</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Votes Counted:</span>
                <span className="font-mono font-bold text-slate-900">
                  {candidate.votesCounted?.toLocaleString('en-IN') || 0}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Vote Percentage:</span>
                <span className="font-mono font-bold text-slate-900">
                  {candidate.votePercentage || 0}%
                </span>
              </div>
              {candidate.isWinner && (
                <div className="text-emerald-700 font-bold pt-1 border-t border-slate-200 flex items-center gap-1">
                  <span>Declared Elected Representative</span>
                </div>
              )}
            </div>
          )}

          {/* Source Provenance Citation */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-700" />
              <span>Official Provenance & Statutory Citation</span>
            </div>
            <p className="text-blue-800 leading-relaxed text-[11px]">
              Extracted from candidate Form 26 sworn affidavit submitted under Section 33A of the Representation of the People Act, 1951, to the Returning Officer.
            </p>
            {candidate.affidavitUrl && (
              <div className="font-mono text-[10px] text-blue-900/80 break-all bg-white/60 p-2 rounded border border-blue-200">
                <strong>Official Source Reference:</strong> {candidate.affidavitUrl}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close Affidavit View
          </button>
        </div>
      </div>
    </div>
  );
};
