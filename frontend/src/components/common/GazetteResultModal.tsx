/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { OfficialPartySymbol } from './OfficialPartySymbol';
import {
  X,
  FileCheck,
  ShieldCheck,
  Award,
  Users,
  CheckCircle2,
  BookOpen,
  Vote,
  Building,
} from 'lucide-react';

export interface GazetteCandidateItem {
  name?: string;
  candidateName?: string;
  candidateNameHi?: string;
  partyName: string;
  partyAbbreviation: string;
  symbolKey?: any;
  votesReceived?: number;
  votesCounted?: number;
  votePercentage?: number;
  isWinner?: boolean;
  rank?: number;
}

export interface GazetteConstituencyData {
  constituencyName: string;
  constituencyCode: string;
  state: string;
  totalElectors?: number;
  votesCounted?: number;
  turnoutPercentage?: number;
  winnerName: string;
  winnerParty: string;
  winningMargin?: number;
  winningMarginPercentage?: number;
  notaVotes?: number;
  notaPercentage?: number;
  pollingStationsCount?: number;
  eciResultPdfUrl?: string;
  candidates?: GazetteCandidateItem[];
}

export interface GazetteResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  constituency: GazetteConstituencyData | null;
}

export const GazetteResultModal: React.FC<GazetteResultModalProps> = ({
  isOpen,
  onClose,
  constituency,
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

  if (!isOpen || !constituency) return null;

  const candidateList = constituency.candidates || [];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="gazette-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="bg-slate-900 text-white p-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-emerald-600/20 text-emerald-400 rounded-xl border border-emerald-500/30">
              <FileCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-widest flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Certified ECI Form 20 Gazette Declaration</span>
              </div>
              <h2 id="gazette-modal-title" className="text-lg font-bold text-white mt-0.5">
                {constituency.constituencyName} (PC #{constituency.constituencyCode})
              </h2>
              <p className="text-xs text-slate-400">{constituency.state}</p>
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
          {/* Winner Banner */}
          <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-600 text-white rounded-lg">
                <Award className="w-5 h-5" />
              </div>
              <div>
                <span className="text-[11px] font-semibold text-emerald-800 uppercase tracking-wider block">
                  Declared Elected Member of Parliament
                </span>
                <span className="font-extrabold text-slate-900 text-base">
                  {constituency.winnerName}
                </span>
                <span className="text-xs text-slate-600 ml-2">
                  ({constituency.winnerParty})
                </span>
              </div>
            </div>

            {constituency.winningMargin !== undefined && (
              <div className="text-left sm:text-right text-xs">
                <span className="text-slate-500 block">Winning Margin</span>
                <span className="font-bold text-emerald-800 text-sm">
                  +{constituency.winningMargin.toLocaleString('en-IN')} votes
                </span>
                {constituency.winningMarginPercentage && (
                  <span className="text-slate-500 block text-[11px]">
                    ({constituency.winningMarginPercentage}% lead)
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Turnout & Electoral Statistics */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-500 block">Total Electors</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {constituency.totalElectors?.toLocaleString('en-IN') ?? '—'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-500 block">Votes Counted</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {constituency.votesCounted?.toLocaleString('en-IN') || '—'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-500 block">Official Turnout</span>
              <span className="font-mono font-bold text-emerald-700 text-sm">
                {constituency.turnoutPercentage ? `${constituency.turnoutPercentage}%` : '—'}
              </span>
            </div>

            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl">
              <span className="text-[11px] text-slate-500 block">Polling Stations</span>
              <span className="font-mono font-bold text-slate-900 text-sm">
                {constituency.pollingStationsCount?.toLocaleString('en-IN') || '—'}
              </span>
            </div>
          </div>

          {/* Candidates Breakdown Table */}
          {candidateList.length > 0 && (
            <div className="space-y-2">
              <h3 className="font-bold text-slate-900 text-xs sm:text-sm flex items-center justify-between">
                <span>Certified Candidate Vote Tallies (Form 20 Summary)</span>
                <span className="text-xs text-slate-500 font-normal">
                  {candidateList.length} Contesting Candidates
                </span>
              </h3>

              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full min-w-[480px] text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                      <th className="py-2.5 px-3 w-10 text-center">#</th>
                      <th className="py-2.5 px-3">Candidate</th>
                      <th className="py-2.5 px-3">Party</th>
                      <th className="py-2.5 px-3 text-right">Votes</th>
                      <th className="py-2.5 px-3 text-right">Vote Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {candidateList.map((cand, idx) => {
                      const name = cand.name || cand.candidateName || 'Candidate';
                      const votes = cand.votesCounted ?? cand.votesReceived ?? 0;
                      const isWinner = cand.isWinner;
                      return (
                        <tr
                          key={idx}
                          className={isWinner ? 'bg-emerald-50/50 font-semibold' : 'hover:bg-slate-50/60'}
                        >
                          <td className="py-2 px-3 text-center text-slate-500 font-mono text-[11px]">
                            {cand.rank || idx + 1}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex items-center gap-1.5 font-bold text-slate-900">
                              <span>{name}</span>
                              {cand.candidateNameHi && (
                                <span className="text-[11px] font-normal text-slate-500">
                                  ({cand.candidateNameHi})
                                </span>
                              )}
                              {isWinner && (
                                <span className="bg-emerald-100 text-emerald-800 text-[10px] px-1.5 py-0.2 rounded font-bold">
                                  Elected
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-3 text-slate-700">
                            <div className="flex items-center gap-1.5">
                              {cand.symbolKey && (
                                <OfficialPartySymbol
                                  symbolKey={cand.symbolKey}
                                  symbolName={cand.partyName}
                                  partyName={cand.partyName}
                                  partyAbbreviation={cand.partyAbbreviation}
                                  size="sm"
                                />
                              )}
                              <span>{cand.partyAbbreviation}</span>
                            </div>
                          </td>
                          <td className="py-2 px-3 text-right font-mono font-bold text-slate-900">
                            {votes.toLocaleString('en-IN')}
                          </td>
                          <td className="py-2 px-3 text-right font-mono text-slate-700">
                            {cand.votePercentage ? `${cand.votePercentage}%` : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* NOTA Record if available */}
          {constituency.notaVotes !== undefined && (
            <div className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700">
              <span className="font-semibold">None of the Above (NOTA):</span>
              <span className="font-mono font-bold">
                {constituency.notaVotes.toLocaleString('en-IN')} votes ({constituency.notaPercentage}%)
              </span>
            </div>
          )}

          {/* Provenance Citation */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 space-y-1.5">
            <div className="font-bold flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5 text-blue-700" />
              <span>Statutory Gazette Provenance Reference</span>
            </div>
            <p className="text-blue-800 leading-relaxed text-[11px]">
              Certified under Rule 64 of the Conduct of Elections Rules, 1961, by the Returning Officer and officially gazetted by the Election Commission of India.
            </p>
            {constituency.eciResultPdfUrl && (
              <div className="font-mono text-[10px] text-blue-900/80 break-all bg-white/60 p-2 rounded border border-blue-200">
                <strong>Official Source Reference:</strong> {constituency.eciResultPdfUrl}
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
            Close Gazette Declaration
          </button>
        </div>
      </div>
    </div>
  );
};
