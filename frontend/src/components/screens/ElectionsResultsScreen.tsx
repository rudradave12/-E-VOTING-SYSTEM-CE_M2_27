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
import { Election, Candidate, Constituency } from '../../types';
import { INITIAL_ELECTIONS, INITIAL_CANDIDATES, INITIAL_CONSTITUENCIES } from '../../data/mockData';
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
  Lock,
  ShieldCheck,
  Vote,
  Calendar,
  Clock,
  AlertCircle,
  Sparkles,
  FileText,
} from 'lucide-react';
import {
  CandidateAffidavitModal,
  CandidateAffidavitData,
} from '../common/CandidateAffidavitModal';
import { AcademicSimulationNotice } from '../common/AcademicSimulationNotice';

interface ElectionsResultsScreenProps {
  elections?: Election[];
  candidates?: Candidate[];
  constituencies?: Constituency[];
  initialTab?: 'previous-elections' | 'official-2024';
  onNavigateToArchive?: () => void;
}

export const ElectionsResultsScreen: React.FC<ElectionsResultsScreenProps> = ({
  elections = INITIAL_ELECTIONS,
  candidates = INITIAL_CANDIDATES,
  constituencies = INITIAL_CONSTITUENCIES,
  initialTab = 'previous-elections',
  onNavigateToArchive,
}) => {
  const { t, language } = useLanguage();

  const [mainTab, setMainTab] = useState<'previous-elections' | 'official-2024'>(initialTab);
  const [affidavitCandidate, setAffidavitCandidate] = useState<CandidateAffidavitData | null>(null);

  // Previous Elections Tab State
  const defaultSelectedElecId =
    elections.find((e) => e.status === 'concluded')?.id || elections[0]?.id || 'DEMO-PREV-2023';
  const [selectedElectionId, setSelectedElectionId] = useState<string>(defaultSelectedElecId);

  const selectedElection = useMemo(() => {
    return elections.find((e) => e.id === selectedElectionId) || elections[0];
  }, [elections, selectedElectionId]);

  // Candidates for selected election
  const electionCandidates = useMemo(() => {
    if (!selectedElection) return [];
    if (!selectedElection.constituencyIds || selectedElection.constituencyIds.length === 0) {
      return candidates;
    }
    return candidates.filter((c) => selectedElection.constituencyIds.includes(c.constituencyId));
  }, [selectedElection, candidates]);

  // Historical Official 2024 Tab State
  const [selectedState, setSelectedState] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [activeConstituencyId, setActiveConstituencyId] = useState<string>(
    HISTORICAL_CONSTITUENCIES_2024[0].id
  );
  const [showImportSpec, setShowImportSpec] = useState<boolean>(false);

  // Unique states for 2024 archive
  const states = useMemo(() => {
    const list = Array.from(new Set(HISTORICAL_CONSTITUENCIES_2024.map((c) => c.state)));
    return ['ALL', ...list];
  }, []);

  // Filtered constituencies for 2024 archive
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
    <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8 space-y-6 sm:space-y-8">
      {/* Prominent Academic Simulation Notice */}
      <AcademicSimulationNotice variant="card" />

      {/* Top Navigation Tabs */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <span className="text-[11px] font-bold text-orange-700 uppercase tracking-wider block">
            Election Archive & Verified Records
          </span>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
            {mainTab === 'previous-elections'
              ? 'Previous Elections Archive (Read-Only)'
              : 'Official 2024 Lok Sabha Reference Archive'}
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            {mainTab === 'previous-elections'
              ? 'Concluded and historical BlockBallot elections. Voting is permanently closed and records cannot be altered.'
              : 'Comprehensive Form 20 Gazette records from the 2024 General Election (ECI Notification 56/2024/PPS-III).'}
          </p>
        </div>

        <div className="flex flex-wrap sm:flex-nowrap items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold w-full sm:w-auto">
          <button
            onClick={() => setMainTab('previous-elections')}
            className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              mainTab === 'previous-elections'
                ? 'bg-white text-slate-900 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span>Previous Demo Elections</span>
          </button>
          <button
            onClick={() => setMainTab('official-2024')}
            className={`flex-1 sm:flex-none px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              mainTab === 'official-2024'
                ? 'bg-white text-emerald-800 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5 text-emerald-600" />
            <span>Official 2024 ECI Gazette</span>
          </button>
          {onNavigateToArchive && (
            <button
              onClick={onNavigateToArchive}
              className="w-full sm:w-auto px-3.5 py-2 rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100 font-semibold border border-orange-200"
            >
              <Database className="w-3.5 h-3.5 text-orange-600" />
              <span>Full Historical Archive</span>
            </button>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: PREVIOUS ELECTIONS ARCHIVE (READ-ONLY) */}
      {/* ========================================================================= */}
      {mainTab === 'previous-elections' && (
        <div className="space-y-6">
          {/* Read-Only Security Policy Notice */}
          <div className="p-4 rounded-xl border border-slate-300 bg-slate-100/80 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-slate-800 shadow-2xs">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-slate-700 shrink-0" />
              <div>
                <p className="font-bold text-sm">Read-Only Enforced — Ballot Submission Disabled</p>
                <p className="text-xs text-slate-600">
                  Archived election results and ballot tallies are strictly immutable. No voting actions are exposed, and past records cannot be reopened or overwritten through ordinary voter APIs.
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-slate-200 text-slate-800 font-mono text-xs font-bold whitespace-nowrap">
              STATUS: IMMUTABLE
            </span>
          </div>

          {/* Election Selector List */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {elections.map((elec) => {
              const isSelected = elec.id === selectedElectionId;
              const isConcluded = elec.status === 'concluded';
              return (
                <button
                  key={elec.id}
                  onClick={() => setSelectedElectionId(elec.id)}
                  className={`p-4 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'border-orange-500 bg-white ring-2 ring-orange-200 shadow-xs'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1 mb-1">
                    <span className="text-[11px] font-mono text-slate-500">ID: {elec.id}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${
                        isConcluded
                          ? 'bg-slate-100 text-slate-700 border border-slate-200'
                          : elec.status === 'active'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border border-amber-200'
                      }`}
                    >
                      {elec.status}
                    </span>
                  </div>
                  <h3 className="font-bold text-slate-900 text-sm line-clamp-1">{elec.title}</h3>
                  <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                    <span>{elec.electionType || 'Parliamentary'}</span>
                    <span className="font-semibold text-slate-700">{elec.totalVotesCast} votes</span>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Detailed View for Selected Archived Election */}
          {selectedElection && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
              {/* Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="px-2.5 py-0.5 rounded-md bg-purple-50 text-purple-700 border border-purple-200 font-bold text-xs uppercase tracking-wider">
                      {selectedElection.isDemoElection ? 'Academic Demo Archive' : 'Administrator Configured'}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-200 font-mono text-xs">
                      EVM ID: #{selectedElection.numericId}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                    {selectedElection.title}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-3xl">
                    {selectedElection.description}
                  </p>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-right shrink-0">
                  <span className="text-[11px] text-slate-500 font-semibold uppercase block">Verified Ballots Cast</span>
                  <span className="text-2xl font-black text-slate-900 tabular-nums">
                    {selectedElection.totalVotesCast.toLocaleString('en-IN')}
                  </span>
                  <span className="text-[11px] text-slate-400 block mt-0.5">
                    Registered: {selectedElection.totalVotersRegistered.toLocaleString('en-IN')} electors
                  </span>
                </div>
              </div>

              {/* Schedule and Scope Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    Voting Window Opened
                  </span>
                  <span className="font-mono text-slate-700 block font-semibold">
                    {new Date(selectedElection.startTime * 1000).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-slate-400" />
                    Voting Window Closed
                  </span>
                  <span className="font-mono text-slate-700 block font-semibold">
                    {new Date(selectedElection.endTime * 1000).toLocaleString([], {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 space-y-1">
                  <span className="text-slate-400 font-bold uppercase tracking-wider text-[10px] flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-slate-400" />
                    Smart Contract & Network
                  </span>
                  <span className="font-mono text-slate-700 block text-[11px] truncate" title={selectedElection.contractAddress}>
                    {selectedElection.contractAddress || '0x5FbDB2315678afecb367f032d93F642f64180aa3'}
                  </span>
                </div>
              </div>

              {/* Nominated Candidates and Verified Vote Totals */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Award className="w-4 h-4 text-orange-600" />
                    <span>Candidates & Published Tallies</span>
                  </h3>
                  <span className="text-xs text-slate-500 font-medium">
                    {electionCandidates.length} candidate(s) registered
                  </span>
                </div>

                {electionCandidates.length === 0 ? (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center text-xs text-slate-500">
                    No candidate nominations are registered for this election scope.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 border border-slate-200 rounded-xl overflow-hidden">
                    {electionCandidates.map((cand) => {
                      const votes = cand.voteCount || 0;
                      const pct = selectedElection.totalVotesCast > 0
                        ? ((votes / selectedElection.totalVotesCast) * 100).toFixed(1)
                        : '0.0';

                      return (
                        <div key={cand.id} className="p-4 bg-white flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3">
                            <OfficialPartySymbol
                              symbolKey={cand.symbolKey}
                              symbolName={cand.symbol || cand.symbolDescription || 'Symbol'}
                              partyName={cand.partyName}
                              partyAbbreviation={cand.partyAbbreviation}
                              size={40}
                              className="shrink-0"
                            />
                            <div>
                              <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                                <span>{cand.name}</span>
                                {cand.nameHi && (
                                  <span className="text-xs text-slate-500 font-normal">({cand.nameHi})</span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500 mt-0.5">
                                {cand.partyName} ({cand.partyAbbreviation}) · Constituency: {cand.constituencyId}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-mono font-bold text-slate-900 text-sm block tabular-nums">
                              {votes.toLocaleString('en-IN')} votes
                            </span>
                            <span className="text-xs font-semibold text-slate-500 block">
                              {pct}% of recorded ballots
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Explicit Zero State if no test votes exist */}
                {selectedElection.totalVotesCast === 0 && (
                  <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                    <p>
                      <strong>Zero Test Ballots Recorded:</strong> This election currently has zero recorded demonstration votes. In adherence to system integrity rules, vote counters start strictly at zero and are never fabricated.
                    </p>
                  </div>
                )}
              </div>

              {/* Isolation & Provenance Banner */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 leading-relaxed space-y-1">
                <div className="flex items-center gap-1.5 font-bold text-slate-900">
                  <Database className="w-3.5 h-3.5 text-slate-600" />
                  <span>Strict Data Segregation Invariant:</span>
                </div>
                <p>
                  BlockBallot academic prototype elections (such as {selectedElection.title}) operate on a dedicated local EVM state and server database. Demonstration votes are stored independently and are completely isolated from the official 2024 Election Commission of India Gazette archive and independent public opinion polls.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: OFFICIAL 2024 LOK SABHA REFERENCE ARCHIVE */}
      {/* ========================================================================= */}
      {mainTab === 'official-2024' && (
        <div className="space-y-6">
          {/* Provenance Header Banner */}
          <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span>{t.archiveBadge}</span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {t.historicalArchiveTitle}
                </h2>
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

                <button
                  type="button"
                  onClick={() => onNavigateToArchive?.()}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold transition-colors cursor-pointer"
                  title="Open internal Historical Election Archive"
                >
                  <Database className="w-3.5 h-3.5" />
                  <span>View in Historical Archive</span>
                </button>
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
                      <div className="text-blue-900 font-mono text-xs break-all">
                        {BATCH_IMPORT_SPECIFICATION.officialDataCatalogueUrl}
                      </div>
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

              {/* State Filter pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-1 text-xs">
                <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0 mr-1" />
                {states.map((st) => (
                  <button
                    key={st}
                    onClick={() => setSelectedState(st)}
                    className={`px-3 py-1.5 rounded-lg whitespace-nowrap cursor-pointer transition-colors ${
                      selectedState === st
                        ? 'bg-emerald-700 text-white font-semibold shadow-2xs'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    {st === 'ALL' ? (language === 'hi' ? 'सभी राज्य' : 'All States') : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Split layout: Constituency List (left) + Detail Breakdown (right) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 pt-2">
              {/* Left Column: Constituency List */}
              <div className="lg:col-span-5 space-y-2 max-h-[640px] overflow-y-auto pr-1">
                {filteredConstituencies.length === 0 ? (
                  <div className="text-center py-12 text-slate-400 text-sm">
                    No parliamentary constituencies matched your search criteria.
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
                            ? 'bg-emerald-50/70 border-emerald-300 shadow-2xs'
                            : 'bg-white hover:bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div>
                            <span className="text-[11px] font-semibold text-slate-500 uppercase">
                              #{c.code} · {c.state}
                            </span>
                            <h3 className="font-bold text-slate-900 text-sm sm:text-base">{c.name}</h3>
                          </div>
                          <ChevronRight
                            className={`w-4 h-4 ${
                              isSelected ? 'text-emerald-700' : 'text-slate-400'
                            }`}
                          />
                        </div>

                        <div className="mt-2 flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                          <span className="text-slate-600">
                            Winner: <strong className="text-slate-900">{c.winnerName}</strong> ({c.winnerParty})
                          </span>
                          <span className="font-semibold text-emerald-700">{c.turnoutPercentage}% Turnout</span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              {/* Right Column: Active Constituency Detail */}
              <div className="lg:col-span-7">
                {activeConstituency ? (
                  <div className="space-y-6">
                    {/* Constituency Header Card */}
                    <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs space-y-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                            Parliamentary Constituency #{activeConstituency.code}
                          </div>
                          <h3 className="text-2xl font-extrabold text-slate-900 mt-0.5">
                            {activeConstituency.name}
                          </h3>
                          <p className="text-xs text-slate-600">{activeConstituency.state}</p>
                        </div>
                        <div className="text-left sm:text-right">
                          <span className="text-xs text-slate-500 font-semibold uppercase block">
                            {language === 'hi' ? 'मतदान प्रतिशत' : 'Voter Turnout'}
                          </span>
                          <span className="text-2xl font-bold text-emerald-600">
                            {activeConstituency.turnoutPercentage}%
                          </span>
                          <span className="text-[11px] text-slate-400 block">
                            {activeConstituency.votesCounted.toLocaleString('en-IN')} votes counted
                          </span>
                        </div>
                      </div>

                      {/* Winner highlight strip */}
                      <div className="p-3.5 rounded-xl bg-emerald-50/80 border border-emerald-200 flex items-center justify-between gap-3 text-xs sm:text-sm">
                        <div className="flex items-center gap-2">
                          <Award className="w-5 h-5 text-emerald-700 shrink-0" />
                          <div>
                            <span className="text-emerald-900 font-bold block">
                              Winner: {activeConstituency.winnerName} ({activeConstituency.winnerParty})
                            </span>
                            <span className="text-emerald-700 text-xs">
                              Winning Margin: {activeConstituency.winningMargin.toLocaleString('en-IN')} votes ({activeConstituency.winningMarginPercentage}%)
                            </span>
                          </div>
                        </div>
                        <span className="text-[11px] font-mono px-2 py-0.5 bg-emerald-200/60 text-emerald-900 rounded font-semibold whitespace-nowrap">
                          ELECTED
                        </span>
                      </div>
                    </div>

                    {/* Candidates breakdown */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
                        <span>{language === 'hi' ? 'उम्मीदवार सूची' : 'Candidate List'}</span>
                        <span>{language === 'hi' ? 'गिने गए मत' : 'Votes Counted'}</span>
                      </div>

                      <div className="space-y-2">
                        {activeConstituency.candidates.map((cand) => {
                          const isWinner = cand.isWinner;
                          return (
                            <div
                              key={cand.candidateId}
                              className={`p-4 rounded-xl border transition-all ${
                                isWinner
                                  ? 'bg-emerald-50/40 border-emerald-300'
                                  : 'bg-white border-slate-200 hover:border-slate-300'
                              }`}
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div className="flex items-center gap-3">
                                  {/* Party Symbol with fallback */}
                                  <OfficialPartySymbol
                                    symbolKey={cand.symbolKey}
                                    symbolName={cand.symbol || cand.symbolDescription || 'Symbol'}
                                    partyName={cand.partyName}
                                    partyAbbreviation={cand.partyAbbreviation}
                                    size={42}
                                    className="shrink-0"
                                  />
                                  <div>
                                    <div className="flex items-center gap-2">
                                      <span className="font-bold text-slate-900 text-sm">
                                        {cand.name}
                                      </span>
                                      {isWinner && (
                                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                          WINNER
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-1.5">
                                      <span>{cand.partyName} ({cand.partyAbbreviation})</span>
                                      <span>·</span>
                                      <span className="text-slate-400">Symbol: {cand.symbol}</span>
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
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setAffidavitCandidate({
                                          name: cand.name,
                                          nameHi: cand.nameHi,
                                          partyName: cand.partyName,
                                          partyAbbreviation: cand.partyAbbreviation,
                                          symbol: cand.symbol,
                                          symbolKey: cand.symbolKey,
                                          education: cand.education,
                                          age: cand.age,
                                          criminalCases: cand.criminalCases,
                                          assets: cand.assets,
                                          affidavitUrl: cand.affidavitUrl,
                                          votesCounted: cand.votesCounted,
                                          votePercentage: cand.votePercentage,
                                          isWinner: cand.isWinner,
                                          rank: cand.rank,
                                        })
                                      }
                                      className="inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline mt-1 font-medium cursor-pointer"
                                      title="Inspect candidate affidavit locally"
                                    >
                                      <FileText className="w-3 h-3" />
                                      <span>{t.candidateAffidavit}</span>
                                    </button>
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
      )}

      {/* Internal Candidate Affidavit Modal */}
      <CandidateAffidavitModal
        isOpen={!!affidavitCandidate}
        onClose={() => setAffidavitCandidate(null)}
        candidate={affidavitCandidate}
      />
    </div>
  );
};
