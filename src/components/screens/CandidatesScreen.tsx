import React, { useState, useMemo } from 'react';
import { Candidate, Constituency } from '../../types';
import { OfficialPartySymbol } from '../common/OfficialPartySymbol';
import { useLanguage } from '../../context/LanguageContext';
import {
  Check,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Search,
  X,
  BadgeCheck,
  CheckCircle2,
  Info,
} from 'lucide-react';

interface CandidatesScreenProps {
  constituency: Constituency;
  candidates: Candidate[];
  selectedCandidateId?: string;
  onSelectCandidate: (candidate: Candidate) => void;
  onProceed: () => void;
  onBack: () => void;
}

export const CandidatesScreen: React.FC<CandidatesScreenProps> = ({
  constituency,
  candidates,
  selectedCandidateId,
  onSelectCandidate,
  onProceed,
  onBack,
}) => {
  const { language, t } = useLanguage();
  const [selectedId, setSelectedId] = useState<string | undefined>(selectedCandidateId);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Enforce strictly alphabetical ordering by candidate name (Equal treatment principle)
  const sortedCandidates = useMemo(() => {
    return [...candidates].sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }, [candidates]);

  // Filter candidates if search is active
  const filteredCandidates = useMemo(() => {
    if (!searchQuery.trim()) return sortedCandidates;
    const q = searchQuery.toLowerCase().trim();
    return sortedCandidates.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        (c.nameHi && c.nameHi.includes(q)) ||
        c.partyName.toLowerCase().includes(q) ||
        c.partyAbbreviation.toLowerCase().includes(q) ||
        c.symbol.toLowerCase().includes(q)
    );
  }, [sortedCandidates, searchQuery]);

  const handleSelect = (candidate: Candidate) => {
    setSelectedId(candidate.id);
    onSelectCandidate(candidate);
  };

  const handleKeyDown = (e: React.KeyboardEvent, candidate: Candidate) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleSelect(candidate);
    }
  };

  const selectedCandidate = candidates.find((c) => c.id === selectedId);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      {/* Main Ballot Paper Container */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        {/* Step Indicator & Official Constituency Header */}
        <div className="mb-6 border-b border-slate-200 pb-5">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-orange-700 uppercase tracking-widest">
              <span>{t.step4Of6}</span>
              <span aria-hidden="true">·</span>
              <span>{t.officialBallotPaper}</span>
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-100 text-slate-700 text-xs font-semibold">
              <span className="font-mono">PC #{constituency.code}</span>
              <span aria-hidden="true">·</span>
              <span>{constituency.state}</span>
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t.selectYourCandidate} — {constituency.name}
          </h1>
          <p className="mt-1 text-sm text-slate-600 leading-relaxed">
            {t.candidateSelectSubtext}
          </p>
        </div>

        {/* Browser Secret Ballot Civic Notice */}
        <div className="p-3.5 bg-emerald-50/90 border border-emerald-200 rounded-xl text-xs text-emerald-950 mb-6 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-emerald-900">{t.privacyGuaranteeTitle}: </span>
            <span className="text-emerald-800">{t.privacyGuaranteeText}</span>
          </div>
        </div>

        {/* Candidate Search & Alphabetical Notice Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-2 text-xs text-slate-500 font-medium">
            <Info className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{t.sortAlphabeticalNotice}</span>
          </div>

          {/* Search box for usability when multiple candidates are registered */}
          {sortedCandidates.length > 2 && (
            <div className="relative min-w-[260px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t.searchPlaceholder}
                aria-label={t.searchPlaceholder}
                className="w-full pl-9 pr-8 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 bg-slate-50/50"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  aria-label={t.clearSearch}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Empty Search State */}
        {filteredCandidates.length === 0 && (
          <div className="p-8 text-center border-2 border-dashed border-slate-200 rounded-xl mb-6">
            <p className="text-sm font-semibold text-slate-700">No candidates match your search</p>
            <p className="text-xs text-slate-500 mt-1">Try clearing the search box to view all candidates</p>
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="mt-3 px-3 py-1.5 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-md cursor-pointer transition-colors"
            >
              {t.clearSearch}
            </button>
          </div>
        )}

        {/* Official Candidate Ballot Paper (Radio Group for Accessibility) */}
        <div
          role="radiogroup"
          aria-label={`${t.officialBallotPaper} for ${constituency.name}`}
          className="space-y-3.5 mb-6"
        >
          {filteredCandidates.map((candidate, idx) => {
            const isSelected = selectedId === candidate.id;
            const displayName =
              language === 'hi' && candidate.nameHi ? candidate.nameHi : candidate.name;
            const displayParty =
              language === 'hi' && candidate.partyNameHi ? candidate.partyNameHi : candidate.partyName;

            return (
              <div
                key={candidate.id}
                role="radio"
                tabIndex={0}
                aria-checked={isSelected}
                onClick={() => handleSelect(candidate)}
                onKeyDown={(e) => handleKeyDown(e, candidate)}
                className={`group relative p-4 sm:p-5 rounded-2xl border-2 transition-all cursor-pointer select-none focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-400 ${
                  isSelected
                    ? 'border-orange-600 bg-orange-50/50 shadow-md ring-1 ring-orange-500'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80 shadow-2xs'
                }`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  {/* Left Side: Serial Number, Official Symbol, and Candidate Metadata */}
                  <div className="flex items-start sm:items-center gap-4 min-w-0">
                    {/* Ballot Serial Number */}
                    <span className="font-mono text-sm sm:text-base font-extrabold text-slate-500 w-7 text-center shrink-0 pt-1 sm:pt-0">
                      {(idx + 1).toString().padStart(2, '0')}
                    </span>

                    {/* Official Party Symbol with authentic proportions and source */}
                    <div className="shrink-0">
                      <OfficialPartySymbol
                        symbolKey={candidate.symbolKey}
                        symbolName={candidate.symbol}
                        partyName={candidate.partyName}
                        partyAbbreviation={candidate.partyAbbreviation}
                        verificationStatus={candidate.symbolVerificationStatus}
                        size={64}
                        showVerificationTag={false}
                      />
                    </div>

                    {/* Candidate Details */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <h2 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                          {displayName}
                        </h2>
                        {candidate.age > 0 && (
                          <span className="text-xs text-slate-500 font-medium">
                            ({candidate.age} {t.yearsOld})
                          </span>
                        )}
                      </div>

                      {/* Party Name & Abbreviation */}
                      <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-700 font-semibold mt-0.5">
                        <span>{displayParty}</span>
                        <span className="font-mono text-slate-500">[{candidate.partyAbbreviation}]</span>
                      </div>

                      {/* ECI Gazette Verification Citation */}
                      <div className="flex items-center gap-1.5 text-[11px] text-emerald-800 mt-1 font-medium">
                        <BadgeCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span className="truncate max-w-[280px] sm:max-w-md">
                          {candidate.symbolSource}
                        </span>
                      </div>

                      {/* Demographic Details (Strictly equal font styling, no partisan coloring) */}
                      <div className="flex flex-wrap items-center gap-2.5 text-[11px] text-slate-600 mt-1.5 pt-1 border-t border-slate-100">
                        <span>
                          {t.candidateEducation}:{' '}
                          <strong className="text-slate-800 font-semibold">{candidate.education}</strong>
                        </span>
                        {candidate.criminalCases > 0 ? (
                          <>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span>
                              {t.candidateCriminalCases}:{' '}
                              <strong className="text-slate-900 font-semibold">{candidate.criminalCases}</strong>
                            </span>
                          </>
                        ) : (
                          <>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span className="text-slate-500">
                              {t.candidateCriminalCases}: {t.noCases}
                            </span>
                          </>
                        )}
                        {candidate.assets !== 'N/A' && (
                          <>
                            <span aria-hidden="true" className="text-slate-300">·</span>
                            <span>
                              {t.candidateAssets}:{' '}
                              <strong className="text-slate-800 font-semibold">{candidate.assets}</strong>
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right Side: Dual Indicator (Text Label + Visual State Indicator) */}
                  <div className="self-end sm:self-center shrink-0 flex items-center gap-3">
                    {/* Textual State Label */}
                    <span
                      className={`text-xs font-bold px-3 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
                        isSelected
                          ? 'bg-orange-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 group-hover:bg-slate-200'
                      }`}
                    >
                      {isSelected ? (
                        <>
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>{t.selectedBadge}</span>
                        </>
                      ) : (
                        <span>{t.clickToSelect}</span>
                      )}
                    </span>

                    {/* Accessible Radio Button Visual Indicator */}
                    <div
                      aria-hidden="true"
                      className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${
                        isSelected
                          ? 'border-2 border-orange-600 bg-orange-600 text-white'
                          : 'border-2 border-slate-300 bg-white group-hover:border-slate-400'
                      }`}
                    >
                      {isSelected ? (
                        <Check className="w-4 h-4 stroke-[3]" />
                      ) : (
                        <span className="w-2.5 h-2.5 rounded-full bg-transparent" />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected Candidate Active Banner */}
        {selectedCandidate && (
          <div className="p-4 bg-orange-50/80 border border-orange-200 rounded-xl text-xs sm:text-sm text-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
              <OfficialPartySymbol
                symbolKey={selectedCandidate.symbolKey}
                symbolName={selectedCandidate.symbol}
                partyName={selectedCandidate.partyName}
                partyAbbreviation={selectedCandidate.partyAbbreviation}
                verificationStatus={selectedCandidate.symbolVerificationStatus}
                size={36}
              />
              <div>
                <span className="text-slate-600 text-xs block">{t.chosenChoice}</span>
                <span className="text-slate-900 font-extrabold text-sm sm:text-base">
                  {language === 'hi' && selectedCandidate.nameHi
                    ? selectedCandidate.nameHi
                    : selectedCandidate.name}{' '}
                  <span className="text-slate-600 font-normal">
                    ({selectedCandidate.partyAbbreviation})
                  </span>
                </span>
              </div>
            </div>

            <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold text-xs bg-emerald-100/70 px-2.5 py-1 rounded-full">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span>{t.readyForReview}</span>
            </span>
          </div>
        )}

        {/* Navigation Action Footer */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-5 border-t border-slate-200">
          <button
            type="button"
            onClick={onBack}
            className="px-5 py-3 text-xs sm:text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer flex items-center justify-center gap-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.backToConstituency}</span>
          </button>

          <button
            type="button"
            onClick={onProceed}
            disabled={!selectedId}
            className="px-7 py-3.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed text-sm sm:text-base focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300"
          >
            <span>{t.reviewBallotSelection}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
