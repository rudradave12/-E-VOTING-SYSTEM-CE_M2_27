/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * BlockBallot — Phase 10: Dedicated Historical Election Data Archive Screen
 * 
 * Features:
 * - Public read-only browsing of verified historical election archives.
 * - Multi-criteria search across election title, year, state, constituency, candidates, and parties.
 * - Granular filters: election year, election type, state, and verification status.
 * - Deep constituency result inspection with published vote counts, vote shares, winning margins, and affidavit links.
 * - Explicit source provenance metadata display with outbound external links to original gazettes.
 * - Prominent, unmissable disclaimers: "Historical data — not live election results".
 * - Honest empty, loading, error, and no-match states (zero fabricated statistics).
 */

import React, { useState, useEffect, useMemo } from 'react';
import { voterApi } from '../../services/voterApi';
import {
  HistoricalElectionRecord,
  HistoricalConstituencyResult,
  HistoricalCandidateResult,
  HistoricalSourceProvenance,
  MANDATORY_NON_ENDORSEMENT_DISCLAIMER,
} from '../../types/archive';
import { useLanguage } from '../../context/LanguageContext';
import { OfficialPartySymbol } from '../common/OfficialPartySymbol';
import {
  Search,
  Filter,
  CheckCircle2,
  ExternalLink,
  ChevronRight,
  Database,
  Info,
  Award,
  ArrowUpDown,
  BookOpen,
  Lock,
  ShieldCheck,
  Vote,
  Calendar,
  AlertTriangle,
  MapPin,
  RefreshCw,
  FileText,
  User,
  X,
  Building,
} from 'lucide-react';

interface HistoricalArchiveScreenProps {
  onBackToLive?: () => void;
}

export const HistoricalArchiveScreen: React.FC<HistoricalArchiveScreenProps> = ({
  onBackToLive,
}) => {
  const { language } = useLanguage();

  // Archive elections list state
  const [elections, setElections] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedYear, setSelectedYear] = useState<string>('ALL');
  const [selectedType, setSelectedType] = useState<string>('ALL');
  const [selectedState, setSelectedState] = useState<string>('ALL');
  const [selectedStatus, setSelectedStatus] = useState<string>('ALL');

  // Active election & drilldown state
  const [selectedElectionId, setSelectedElectionId] = useState<string | null>(null);
  const [electionDetail, setElectionDetail] = useState<HistoricalElectionRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Constituency drilldown inside detail
  const [selectedConstituency, setSelectedConstituency] = useState<HistoricalConstituencyResult | null>(null);
  const [constituencySearch, setConstituencySearch] = useState<string>('');

  // Fetch elections on initial mount
  useEffect(() => {
    loadElections();
  }, []);

  const loadElections = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await voterApi.getArchivedElections({ limit: 50 });
      if (res.success && res.elections) {
        setElections(res.elections);
        if (res.elections.length > 0 && !selectedElectionId) {
          setSelectedElectionId(res.elections[0].id);
        }
      } else {
        setError(res.message || 'Failed to load historical election archive.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching archive.');
    } finally {
      setLoading(false);
    }
  };

  // Load detailed record when selected election changes
  useEffect(() => {
    if (!selectedElectionId) return;

    let isCancelled = false;
    setDetailLoading(true);
    setDetailError(null);
    setSelectedConstituency(null);

    voterApi
      .getArchivedElectionById(selectedElectionId)
      .then((res) => {
        if (isCancelled) return;
        if (res.success && res.election) {
          setElectionDetail(res.election);
          if (res.election.constituencyResults.length > 0) {
            setSelectedConstituency(res.election.constituencyResults[0]);
          }
        } else {
          setDetailError(res.message || 'Unable to retrieve election details.');
        }
      })
      .catch((err) => {
        if (isCancelled) return;
        setDetailError(err.message || 'Failed to fetch election details.');
      })
      .finally(() => {
        if (!isCancelled) setDetailLoading(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedElectionId]);

  // Extract available filter values
  const availableYears = useMemo(() => {
    const years = Array.from(new Set(elections.map((e) => String(e.year))));
    return ['ALL', ...years.sort((a, b) => Number(b) - Number(a))];
  }, [elections]);

  const availableTypes = useMemo(() => {
    const types = Array.from(new Set(elections.map((e) => e.electionType)));
    return ['ALL', ...types];
  }, [elections]);

  const availableStates = useMemo(() => {
    if (!electionDetail) return ['ALL'];
    const states = Array.from(new Set(electionDetail.constituencyResults.map((c) => c.state)));
    return ['ALL', ...states.sort()];
  }, [electionDetail]);

  // Filtered elections list
  const filteredElections = useMemo(() => {
    return elections.filter((e) => {
      if (selectedYear !== 'ALL' && String(e.year) !== selectedYear) return false;
      if (selectedType !== 'ALL' && e.electionType !== selectedType) return false;
      if (selectedStatus !== 'ALL' && e.verificationStatus !== selectedStatus) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = e.electionName.toLowerCase().includes(q);
        const matchesYear = String(e.year).includes(q);
        const matchesState = e.state && e.state.toLowerCase().includes(q);
        const matchesAuthority =
          e.provenance?.sourceAuthority && e.provenance.sourceAuthority.toLowerCase().includes(q);
        if (!matchesName && !matchesYear && !matchesState && !matchesAuthority) return false;
      }
      return true;
    });
  }, [elections, selectedYear, selectedType, selectedStatus, searchQuery]);

  // Filtered constituencies within active election
  const filteredConstituencies = useMemo(() => {
    if (!electionDetail) return [];
    return electionDetail.constituencyResults.filter((c) => {
      if (selectedState !== 'ALL' && c.state !== selectedState) return false;

      if (constituencySearch.trim()) {
        const q = constituencySearch.toLowerCase().trim();
        const matchesName = c.constituencyName.toLowerCase().includes(q);
        const matchesCode = c.constituencyCode.toLowerCase().includes(q);
        const matchesState = c.state.toLowerCase().includes(q);
        const matchesWinner = c.winnerName && c.winnerName.toLowerCase().includes(q);
        const matchesParty = c.winnerParty && c.winnerParty.toLowerCase().includes(q);
        const matchesCand = c.candidates.some(
          (cand) =>
            cand.candidateName.toLowerCase().includes(q) ||
            cand.partyName.toLowerCase().includes(q) ||
            cand.partyAbbreviation.toLowerCase().includes(q)
        );
        return matchesName || matchesCode || matchesState || matchesWinner || matchesParty || matchesCand;
      }
      return true;
    });
  }, [electionDetail, selectedState, constituencySearch]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* 1. Header Banner & Mandatory Disclaimers */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold uppercase tracking-wider">
              <Database className="w-3.5 h-3.5 text-slate-500" />
              Public Archive · Read-Only Verification Portal
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {language === 'hi' ? 'ऐतिहासिक चुनाव डेटा संग्रह' : 'Historical Election Data Archive'}
            </h1>
            <p className="text-sm text-slate-600 max-w-3xl">
              {language === 'hi'
                ? 'सरकारी चुनाव राजपत्रों (ECI Form 20) से प्राप्त सत्यापित ऐतिहासिक चुनाव परिणाम। यह सार्वजनिक संग्रह केवल शोध एवं संदर्भ हेतु है और सक्रिय मतदान सत्रों से पूर्णतः अलग है।'
                : 'Browse verified official election records sourced from public gazettes and Election Commission of India (ECI) Form 20 publications. All data is read-only, audited for provenance, and completely decoupled from simulation elections.'}
            </p>
          </div>

          <div className="flex items-center gap-2 self-start md:self-auto">
            {onBackToLive && (
              <button
                onClick={onBackToLive}
                className="px-4 py-2 text-sm font-semibold text-slate-700 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Vote className="w-4 h-4 text-orange-600" />
                {language === 'hi' ? 'सक्रिय चुनाव' : 'Live Simulation'}
              </button>
            )}
            <button
              onClick={loadElections}
              disabled={loading}
              className="p-2 text-slate-500 hover:text-slate-700 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              title="Refresh archive data"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Conspicuous Disclaimer Badge */}
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 text-xs text-amber-900 space-y-2">
          <div className="flex items-center gap-2 font-bold text-amber-950 uppercase tracking-wide">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            Historical Archive Disclaimer · Not Live Election Results
          </div>
          <p className="leading-relaxed">
            {MANDATORY_NON_ENDORSEMENT_DISCLAIMER}
          </p>
        </div>
      </div>

      {/* 2. Search & Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Text Search */}
          <div className="lg:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={language === 'hi' ? 'चुनाव, वर्ष, या प्राधिकरण खोजें...' : 'Search elections, year, or authority...'}
              className="w-full pl-9.5 pr-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            />
          </div>

          {/* Year Filter */}
          <div>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            >
              <option value="ALL">All Election Years</option>
              {availableYears.filter((y) => y !== 'ALL').map((year) => (
                <option key={year} value={year}>
                  Year {year}
                </option>
              ))}
            </select>
          </div>

          {/* Election Type Filter */}
          <div>
            <select
              value={selectedType}
              onChange={(e) => setSelectedType(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            >
              <option value="ALL">All Election Types</option>
              <option value="LOK_SABHA">Lok Sabha (Parliamentary)</option>
              <option value="VIDHAN_SABHA">Vidhan Sabha (Assembly)</option>
              <option value="MUNICIPAL">Municipal</option>
              <option value="BYE_ELECTION">Bye-Election</option>
            </select>
          </div>

          {/* Verification Status Filter */}
          <div>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="w-full px-3 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition-all"
            >
              <option value="ALL">All Verification Statuses</option>
              <option value="VERIFIED_OFFICIAL_GAZETTE">Official Gazette Verified</option>
              <option value="PROVISIONAL_OFFICIAL_IMPORT">Provisional Official</option>
              <option value="UNVERIFIED">Unverified Records</option>
            </select>
          </div>
        </div>
      </div>

      {/* 3. Main Content: Election Records & Detail Pane */}
      {loading ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-sm">
          <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-700">Loading historical archives...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 rounded-2xl border border-red-200 p-8 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-red-600 mx-auto" />
          <h3 className="text-base font-bold text-red-900">Archive Retrieval Notice</h3>
          <p className="text-sm text-red-700 max-w-md mx-auto">{error}</p>
          <button
            onClick={loadElections}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      ) : filteredElections.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4 shadow-sm">
          <Database className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="text-lg font-bold text-slate-900">No Historical Records Matching Criteria</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">
            No archived elections matched your active filter or search query. In accordance with Section 2, BlockBallot never manufactures false historical results.
          </p>
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedYear('ALL');
              setSelectedType('ALL');
              setSelectedStatus('ALL');
            }}
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-sm font-semibold cursor-pointer"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Election Selector Ribbon */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredElections.map((elec) => {
              const isSelected = elec.id === selectedElectionId;
              const isVerified = elec.verificationStatus === 'VERIFIED_OFFICIAL_GAZETTE';

              return (
                <div
                  key={elec.id}
                  onClick={() => setSelectedElectionId(elec.id)}
                  className={`p-5 rounded-2xl border transition-all cursor-pointer text-left space-y-3 ${
                    isSelected
                      ? 'bg-orange-50/50 border-orange-500 shadow-sm ring-1 ring-orange-500/20'
                      : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 uppercase tracking-wider">
                      {elec.year} · {elec.electionType}
                    </span>
                    {isVerified ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                        Verified Gazette
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600">
                        Unverified
                      </span>
                    )}
                  </div>

                  <div>
                    <h3 className="text-base font-bold text-slate-900 line-clamp-1">{elec.electionName}</h3>
                    <p className="text-xs text-slate-500">{elec.state || 'National (All India)'}</p>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
                    <div>
                      <span className="text-slate-400 block">Covered PCs</span>
                      <span className="font-semibold text-slate-700">{elec.constituenciesCount} PCs Verified</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Official Turnout</span>
                      <span className="font-semibold text-slate-700">
                        {elec.turnoutPercentage ? `${elec.turnoutPercentage}%` : 'Not documented'}
                      </span>
                    </div>
                  </div>

                  <div className="pt-1 flex items-center justify-between text-xs text-orange-600 font-semibold">
                    <span>Inspect Results & Provenance</span>
                    <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active Election Detail Pane */}
          {detailLoading ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <RefreshCw className="w-8 h-8 text-orange-600 animate-spin mx-auto" />
              <p className="text-sm font-semibold text-slate-700">Loading election record details...</p>
            </div>
          ) : detailError ? (
            <div className="bg-red-50 rounded-2xl border border-red-200 p-6 text-sm text-red-800">
              {detailError}
            </div>
          ) : electionDetail ? (
            <div className="space-y-8 animate-in fade-in duration-200">
              {/* Election Overview & Provenance Header */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-slate-100 pb-5">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        {electionDetail.id}
                      </span>
                      <span className="text-xs font-bold text-emerald-800 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200 flex items-center gap-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                        {electionDetail.verificationStatus}
                      </span>
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900">{electionDetail.electionName}</h2>
                    <p className="text-sm text-slate-600">
                      Scope: {electionDetail.geographicScope} · State: {electionDetail.state} · Year: {electionDetail.year}
                    </p>
                  </div>

                  {/* Provenance Quick Card */}
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 text-xs space-y-1.5 md:max-w-md w-full">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <BookOpen className="w-3.5 h-3.5 text-orange-600" />
                      Authoritative Source Provenance
                    </div>
                    <div>
                      <span className="text-slate-500">Authority: </span>
                      <span className="font-semibold text-slate-800">{electionDetail.provenance.sourceAuthority}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Dataset Identifier: </span>
                      <span className="font-mono text-slate-800">{electionDetail.provenance.datasetIdentifier}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Verified By: </span>
                      <span className="text-slate-800">{electionDetail.provenance.verifiedBy || 'ECI Gazette Review'}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Retrieval Date: </span>
                      <span className="text-slate-800">{electionDetail.provenance.retrievalDate}</span>
                    </div>
                    {electionDetail.provenance.sourceUrl && (
                      <div className="pt-1">
                        <a
                          href={electionDetail.provenance.sourceUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-orange-600 hover:text-orange-700 font-semibold inline-flex items-center gap-1 transition-colors"
                        >
                          View Official ECI Publication Source
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>
                </div>

                {/* Aggregate Summary Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                    <span className="text-xs text-slate-500 block">Total Electors</span>
                    <span className="text-base font-bold text-slate-900">
                      {electionDetail.totalElectors ? electionDetail.totalElectors.toLocaleString() : 'Not published'}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                    <span className="text-xs text-slate-500 block">Total Votes Cast</span>
                    <span className="text-base font-bold text-slate-900">
                      {electionDetail.totalVotesCast ? electionDetail.totalVotesCast.toLocaleString() : 'Not published'}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                    <span className="text-xs text-slate-500 block">Official Turnout</span>
                    <span className="text-base font-bold text-slate-900">
                      {electionDetail.turnoutPercentage ? `${electionDetail.turnoutPercentage}%` : 'Not documented'}
                    </span>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-100">
                    <span className="text-xs text-slate-500 block">Verified Constituencies</span>
                    <span className="text-base font-bold text-slate-900">
                      {electionDetail.constituencyResults.length} Available
                    </span>
                  </div>
                </div>
              </div>

              {/* Constituency Selector & Candidate Results Explorer */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">
                      Constituency Results Breakdown
                    </h3>
                    <p className="text-xs text-slate-500">
                      Select a constituency to inspect certified candidate votes and gazette figures.
                    </p>
                  </div>

                  {/* Filter and Search within Constituencies */}
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <select
                      value={selectedState}
                      onChange={(e) => setSelectedState(e.target.value)}
                      className="px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500"
                    >
                      <option value="ALL">All States</option>
                      {availableStates.filter((s) => s !== 'ALL').map((state) => (
                        <option key={state} value={state}>
                          {state}
                        </option>
                      ))}
                    </select>

                    <div className="relative w-full sm:w-56">
                      <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={constituencySearch}
                        onChange={(e) => setConstituencySearch(e.target.value)}
                        placeholder="Search candidate / PC..."
                        className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-orange-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Constituency Chips */}
                <div className="flex flex-wrap gap-2 max-h-44 overflow-y-auto p-1 border border-slate-100 rounded-xl bg-slate-50/50">
                  {filteredConstituencies.map((c) => {
                    const isSelected = selectedConstituency?.constituencyId === c.constituencyId;
                    return (
                      <button
                        key={c.constituencyId}
                        onClick={() => setSelectedConstituency(c)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? 'bg-orange-600 text-white shadow-xs'
                            : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <span className="font-mono text-[10px] opacity-75">{c.constituencyCode}</span>
                        <span>{c.constituencyName}</span>
                        <span className="text-[10px] opacity-60">({c.state})</span>
                      </button>
                    );
                  })}
                </div>

                {/* Selected Constituency Candidate Table */}
                {selectedConstituency ? (
                  <div className="space-y-6 pt-2">
                    {/* PC Header Card */}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                            PC {selectedConstituency.constituencyCode}
                          </span>
                          <span className="text-xs text-slate-500">{selectedConstituency.state}</span>
                        </div>
                        <h4 className="text-xl font-bold text-slate-900 mt-1">
                          {selectedConstituency.constituencyName}
                        </h4>
                        <div className="text-xs text-slate-600 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                          <span>
                            Total Registered: <strong>{selectedConstituency.totalElectors?.toLocaleString() || 'N/A'}</strong>
                          </span>
                          <span>
                            Turnout: <strong>{selectedConstituency.turnoutPercentage ? `${selectedConstituency.turnoutPercentage}%` : 'N/A'}</strong>
                          </span>
                          <span>
                            Votes Counted: <strong>{selectedConstituency.votesCounted?.toLocaleString() || 'N/A'}</strong>
                          </span>
                          <span>
                            NOTA: <strong>{selectedConstituency.notaVotes?.toLocaleString() || '0'} ({selectedConstituency.notaPercentage || 0}%)</strong>
                          </span>
                        </div>
                      </div>

                      {selectedConstituency.eciResultPdfUrl && (
                        <a
                          href={selectedConstituency.eciResultPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-3 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 inline-flex items-center gap-1.5 shadow-2xs transition-colors self-start md:self-auto"
                        >
                          Official Form 20 Gazette
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </a>
                      )}
                    </div>

                    {/* Candidate Results Table */}
                    <div className="overflow-x-auto bb-table-container rounded-xl border border-slate-200">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 font-semibold">
                            <th className="py-3 px-4 w-12 text-center">Rank</th>
                            <th className="py-3 px-4">Candidate & Affiliation</th>
                            <th className="py-3 px-4">Reserved Symbol</th>
                            <th className="py-3 px-4 text-right">Votes Received</th>
                            <th className="py-3 px-4 text-right">Vote Share</th>
                            <th className="py-3 px-4 text-center">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {selectedConstituency.candidates.map((cand) => (
                            <tr
                              key={cand.candidateId}
                              className={cand.isWinner ? 'bg-emerald-50/40 hover:bg-emerald-50/60' : 'hover:bg-slate-50/80'}
                            >
                              <td className="py-3.5 px-4 text-center font-bold text-slate-700">
                                {cand.rank || '-'}
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                                  {cand.candidateName}
                                  {cand.candidateNameHi && (
                                    <span className="text-xs text-slate-500 font-normal">
                                      ({cand.candidateNameHi})
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-slate-600">
                                  {cand.partyName} ({cand.partyAbbreviation})
                                </div>
                                {cand.affidavitUrl && (
                                  <a
                                    href={cand.affidavitUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-[11px] text-orange-600 hover:text-orange-700 inline-flex items-center gap-1 mt-0.5"
                                  >
                                    ECI Candidate Affidavit
                                    <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                )}
                              </td>
                              <td className="py-3.5 px-4">
                                <div className="flex items-center gap-2">
                                  <OfficialPartySymbol
                                    symbolKey={cand.symbolKey as any}
                                    symbolName={cand.symbol || 'Independent'}
                                    partyName={cand.partyName}
                                    partyAbbreviation={cand.partyAbbreviation}
                                    verificationStatus={cand.isOfficialSymbolVerified ? 'VERIFIED_ECI' : 'UNAVAILABLE'}
                                    size={24}
                                  />
                                  <div>
                                    <span className="font-semibold text-slate-800">{cand.symbol || 'Independent'}</span>
                                    {cand.isOfficialSymbolVerified && (
                                      <span className="block text-[10px] text-emerald-700">ECI Reserved</span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono font-bold text-slate-900">
                                {cand.votesReceived !== undefined ? cand.votesReceived.toLocaleString() : 'Not published'}
                              </td>
                              <td className="py-3.5 px-4 text-right font-mono text-slate-700">
                                {cand.voteSharePercentage !== undefined
                                  ? `${cand.voteSharePercentage}%`
                                  : 'Not published'}
                              </td>
                              <td className="py-3.5 px-4 text-center">
                                {cand.isWinner ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                                    <Award className="w-3 h-3 text-emerald-700" />
                                    Winner
                                  </span>
                                ) : (
                                  <span className="text-slate-400 text-xs">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="p-8 text-center text-sm text-slate-500">
                    Select a constituency to inspect candidate results.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
};
