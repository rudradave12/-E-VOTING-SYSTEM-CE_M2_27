/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  HISTORICAL_CONSTITUENCIES_2024,
  HISTORICAL_PROVENANCE,
  BATCH_IMPORT_SPECIFICATION,
  HistoricalConstituencyRecord,
  HistoricalCandidateResult,
} from '../../data/historical2024';
import { OfficialPartySymbol } from '../common/OfficialPartySymbol';
import { useLanguage } from '../../context/LanguageContext';
import {
  Search,
  Filter,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Database,
  Info,
  Award,
  Layers,
  ArrowUpDown,
  BookOpen,
} from 'lucide-react';

export const ElectionsResultsScreen: React.FC = () => {
  const { t, language } = useLanguage();

  const [selectedState, setSelectedState] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeConstituencyId, setActiveConstituencyId] = useState<string>(
    HISTORICAL_CONSTITUENCIES_2024[0].id
  );
  const [showImportSpec, setShowImportSpec] = useState<boolean>(false);

  // Unique states
  const states = useMemo(() => {
    const list = Array.from(new Set(HISTORICAL_CONSTITUENCIES_2024.map((c) => c.state)));
    return ['ALL', ...list];
  }, []);

  // Filtered constituencies
  const filteredConstituencies = useMemo(() => {
    return HISTORICAL_CONSTITUENCIES_2024.filter((c) => {
      const matchesState = selectedState === 'ALL' || c.state === selectedState;
      const query = searchQuery.toLowerCase().trim();
      if (!query) return matchesState;

      const matchesName = c.name.toLowerCase().includes(query);
      const matchesCode = c.code.includes(query);
      const matchesStateText = c.state.toLowerCase().includes(query);
      const matchesWinner = c.winnerName.toLowerCase().includes(query);
      const matchesCandidate = c.candidates.some(
        (cand) =>
          cand.name.toLowerCase().includes(query) ||
          cand.partyName.toLowerCase().includes(query) ||
          cand.partyAbbreviation.toLowerCase().includes(query)
      );

      return matchesState && (matchesName || matchesCode || matchesStateText || matchesWinner || matchesCandidate);
    });
  }, [selectedState, searchQuery]);

  const activeConstituency = useMemo(() => {
    return (
      HISTORICAL_CONSTITUENCIES_2024.find((c) => c.id === activeConstituencyId) ||
      filteredConstituencies[0] ||
      HISTORICAL_CONSTITUENCIES_2024[0]
    );
  }, [activeConstituencyId, filteredConstituencies]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Historical Archive Header & Provenance Banner */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>{t.archiveBadge}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {t.historicalArchiveTitle}
            </h1>
            <p className="text-sm text-slate-600">{t.historicalArchiveSubtitle}</p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImportSpec((prev) => !prev)}
              className="flex items-center gap-2 px-3.5 py-2 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
            >
              <Database className="w-4 h-4 text-slate-500" />
              <span>{showImportSpec ? 'Hide Import Specs' : 'ECI Data Import Guide'}</span>
            </button>

            <a
              href={HISTORICAL_PROVENANCE.generalElectionUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors"
            >
              <span>ECI Official Portal</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </div>

        {/* Coverage Gap & Batch Import Specs Drawer */}
        {showImportSpec && (
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 text-blue-950 text-xs sm:text-sm space-y-3">
            <div className="flex items-start gap-2.5">
              <Info className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
              <div className="space-y-2">
                <h4 className="font-bold text-blue-900">
                  Data Provenance & Ingestion Specifications for 543 Parliamentary Constituencies
                </h4>
                <p className="text-blue-800">
                  Currently loaded: <strong>{BATCH_IMPORT_SPECIFICATION.currentlyLoadedSampleConstituencies} fully verified representative constituencies</strong> across 8 major States/UTs. Complete candidate breakdowns, officially gazetted party symbols, votes counted, and affidavit links are audited against ECI official records.
                </p>
                <div className="bg-white/80 rounded-lg p-3 border border-blue-200 font-mono text-xs space-y-1">
                  <div className="font-bold text-slate-800">Official Data Catalogue Source:</div>
                  <a
                    href={BATCH_IMPORT_SPECIFICATION.officialDataCatalogueUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline break-all"
                  >
                    {BATCH_IMPORT_SPECIFICATION.officialDataCatalogueUrl}
                  </a>
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-blue-900">How to import remaining 533 constituencies:</div>
                  <ul className="list-disc pl-5 space-y-0.5 text-blue-800 text-xs">
                    {BATCH_IMPORT_SPECIFICATION.importInstructions.map((inst, i) => (
                      <li key={i}>{inst}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drill-down Hierarchy: Level 1 (All India Summary) */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Total Seats
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">543</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Lok Sabha Constituencies</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            National Turnout
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">65.79%</div>
          <div className="text-[11px] text-slate-400 mt-0.5">~642M Votes Counted</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Declaration Date
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">04 June 2024</div>
          <div className="text-[11px] text-slate-400 mt-0.5">ECI Form 20 Declarations</div>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
            Provenance Audit
          </div>
          <div className="text-2xl font-bold text-blue-600 mt-1">Verified ECI</div>
          <div className="text-[11px] text-slate-400 mt-0.5">Notification 56/2024/PPS-III</div>
        </div>
      </div>

      {/* Level 2 & 3: State Filter & Constituency Search */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
          {/* Search box */}
          <div className="relative w-full md:w-96">
            <Search className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.searchConstOrCand}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-300 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-3 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                Clear
              </button>
            )}
          </div>

          {/* State selector pills */}
          <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1">
            <span className="text-xs font-bold text-slate-500 whitespace-nowrap mr-1 flex items-center gap-1">
              <Filter className="w-3.5 h-3.5" /> State/UT:
            </span>
            {states.map((st) => (
              <button
                key={st}
                onClick={() => setSelectedState(st)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                  selectedState === st
                    ? 'bg-slate-900 text-white shadow-2xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {st === 'ALL' ? 'All States' : st}
              </button>
            ))}
          </div>
        </div>

        {/* Master-Detail Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
          {/* Left Column: Constituency List */}
          <div className="lg:col-span-5 space-y-2.5 max-h-[640px] overflow-y-auto pr-1">
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
              Constituencies ({filteredConstituencies.length})
            </div>

            {filteredConstituencies.length === 0 ? (
              <div className="p-8 text-center text-slate-500 text-xs rounded-xl bg-slate-50 border border-slate-200">
                No matching parliamentary constituency found for &quot;{searchQuery}&quot;.
              </div>
            ) : (
              filteredConstituencies.map((c) => {
                const isSelected = c.id === activeConstituency.id;
                return (
                  <button
                    key={c.id}
                    onClick={() => setActiveConstituencyId(c.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                      isSelected
                        ? 'border-emerald-600 bg-emerald-50/40 ring-1 ring-emerald-600 shadow-2xs'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-xs font-bold text-slate-700">
                          PC #{c.code}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900">{c.name}</h3>
                      </div>
                      <span className="text-xs font-bold text-emerald-700">
                        {c.turnoutPercentage}% Turnout
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-600 mt-2">
                      <span>{c.state}</span>
                      <span className="font-medium text-slate-800">
                        Winner: <strong className="text-slate-900">{c.winnerName}</strong> ({c.winnerParty})
                      </span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right Column: Detailed Candidate Breakdown & Official ECI Result */}
          <div className="lg:col-span-7 space-y-6">
            {activeConstituency ? (
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-6 space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
                  <div>
                    <div className="text-xs text-slate-500 font-semibold">
                      {activeConstituency.state} · Parliamentary Constituency #{activeConstituency.code}
                    </div>
                    <h2 className="text-2xl font-extrabold text-slate-900 mt-0.5">
                      {activeConstituency.name}
                    </h2>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
                      {activeConstituency.turnoutPercentage}% Turnout
                    </span>
                    <a
                      href={activeConstituency.eciResultPdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-blue-700 hover:underline font-semibold"
                    >
                      <span>ECI Certificate</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>

                {/* Stat cards */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-semibold">{t.electorLabel}</div>
                    <div className="text-base font-bold text-slate-900 mt-0.5">
                      {activeConstituency.totalElectors.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-semibold">Votes Counted</div>
                    <div className="text-base font-bold text-slate-900 mt-0.5">
                      {activeConstituency.votesCounted.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-semibold">{t.marginLabel}</div>
                    <div className="text-base font-bold text-emerald-700 mt-0.5">
                      +{activeConstituency.winningMargin.toLocaleString('en-IN')}
                    </div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <div className="text-[11px] text-slate-500 font-semibold">NOTA Votes</div>
                    <div className="text-base font-bold text-slate-700 mt-0.5">
                      {activeConstituency.notaVotes.toLocaleString('en-IN')} ({activeConstituency.notaPercentage}%)
                    </div>
                  </div>
                </div>

                {/* Candidate list table */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs font-bold text-slate-600 uppercase tracking-wider">
                    <span>Contesting Candidates & Official Results</span>
                    <span>Votes (% Share)</span>
                  </div>

                  <div className="space-y-3">
                    {activeConstituency.candidates.map((cand) => {
                      return (
                        <div
                          key={cand.candidateId}
                          className={`rounded-xl border p-4 bg-white transition-all ${
                            cand.isWinner
                              ? 'border-emerald-300 ring-1 ring-emerald-300 shadow-2xs'
                              : 'border-slate-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-4">
                            {/* Candidate Info with Verified Symbol */}
                            <div className="flex items-start gap-3.5">
                              <OfficialPartySymbol
                                symbolKey={cand.symbolKey}
                                symbolName={cand.symbol}
                                partyName={cand.partyName}
                                partyAbbreviation={cand.partyAbbreviation}
                                verificationStatus={cand.isOfficialSymbolVerified ? 'VERIFIED_ECI' : 'UNAVAILABLE'}
                                size={52}
                                showVerificationTag={cand.isOfficialSymbolVerified}
                              />
                              <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-sm text-slate-900">
                                    {language === 'hi' && cand.nameHi ? cand.nameHi : cand.name}
                                  </h4>
                                  {cand.isWinner && (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase tracking-wider">
                                      <Award className="w-3 h-3 text-emerald-700" /> Declared Winner
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-600">
                                  {language === 'hi' && cand.partyNameHi ? cand.partyNameHi : cand.partyName}{' '}
                                  <span className="font-mono text-slate-500">({cand.partyAbbreviation})</span>
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  Reserved Symbol: <strong>{cand.symbol}</strong> · {cand.symbolSource}
                                </div>
                              </div>
                            </div>

                            {/* Votes Breakdown */}
                            <div className="text-right shrink-0">
                              <div className="text-sm font-extrabold text-slate-900">
                                {cand.votesCounted.toLocaleString('en-IN')}
                              </div>
                              <div className="text-xs font-semibold text-emerald-700">
                                {cand.votePercentage}% of votes
                              </div>
                              {cand.affidavitUrl && cand.partyAbbreviation !== 'NOTA' && (
                                <a
                                  href={cand.affidavitUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-1 font-medium"
                                >
                                  <span>{t.candidateAffidavit}</span>
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                          </div>

                          {/* Candidate Demographic / Affidavit Summary */}
                          {cand.partyAbbreviation !== 'NOTA' && (
                            <div className="mt-3 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                              <span><strong>Age:</strong> {cand.age} yrs</span>
                              <span><strong>Education:</strong> {cand.education}</span>
                              <span><strong>Criminal Cases:</strong> {cand.criminalCases === 0 ? 'None reported' : `${cand.criminalCases} active`}</span>
                              <span><strong>Declared Assets:</strong> {cand.assets}</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Provenance footer */}
                <div className="p-3.5 rounded-xl bg-white border border-slate-200 text-xs text-slate-500 space-y-1">
                  <div className="font-semibold text-slate-700 flex items-center gap-1">
                    <BookOpen className="w-3.5 h-3.5 text-slate-500" />
                    <span>Official Provenance & Verification Audit</span>
                  </div>
                  <p>
                    Data retrieved on {HISTORICAL_PROVENANCE.retrievalDate} directly from the Election Commission of India Results Portal ({HISTORICAL_PROVENANCE.generalElectionUrl}) and Open Government Data ({HISTORICAL_PROVENANCE.dataGovCatalogUrl}).
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
};
