/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Activity,
  AlertTriangle,
  Archive,
  ArrowRight,
  CheckCircle2,
  Clock,
  Database,
  ExternalLink,
  Eye,
  Filter,
  Info,
  Lock,
  PauseCircle,
  RefreshCw,
  Search,
  Shield,
  ShieldAlert,
  Vote,
  XCircle,
} from 'lucide-react';
import {
  PublicElectionSummary,
  PublicElectionDetail,
  PublicParticipationMetrics,
  PublicPublishedResults,
  PublicMonitorOverview,
  MONITOR_NON_ENDORSEMENT_DISCLAIMER,
  BALLOT_SECRECY_LIMITATION_NOTICE,
  NormalizedElectionStatus,
} from '../../types';
import { voterApi } from '../../services/voterApi';
import { useLanguage } from '../../context/LanguageContext';

interface ElectionMonitorScreenProps {
  onNavigateToArchive?: () => void;
  onNavigateToVote?: () => void;
}

export const ElectionMonitorScreen: React.FC<ElectionMonitorScreenProps> = ({
  onNavigateToArchive,
  onNavigateToVote,
}) => {
  const { language } = useLanguage();

  // Overview state
  const [overview, setOverview] = useState<PublicMonitorOverview | null>(null);
  const [elections, setElections] = useState<PublicElectionSummary[]>([]);
  const [selectedElectionId, setSelectedElectionId] = useState<string | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<PublicElectionDetail | null>(null);
  const [participationMetrics, setParticipationMetrics] = useState<PublicParticipationMetrics | null>(null);
  const [publishedResults, setPublishedResults] = useState<PublicPublishedResults | null>(null);

  // Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');

  // Loading & Freshness state
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<number>(Date.now());
  const [isStale, setIsStale] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tab visibility polling ref
  const pollingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch elections and overview
  const loadData = useCallback(async (isBackground = false) => {
    if (!isBackground) setRefreshing(true);
    setErrorMessage(null);

    try {
      const [overviewRes, electionsRes] = await Promise.all([
        voterApi.getMonitorOverview(),
        voterApi.getPublicElections({
          status: statusFilter === 'ALL' ? undefined : statusFilter,
          type: typeFilter === 'ALL' ? undefined : typeFilter,
          q: searchQuery.trim() || undefined,
          limit: 30,
        }),
      ]);

      if (overviewRes.success && overviewRes.overview) {
        setOverview(overviewRes.overview);
      }

      if (electionsRes.success && electionsRes.elections) {
        setElections(electionsRes.elections);
        // Default select first election if none selected
        if (!selectedElectionId && electionsRes.elections.length > 0) {
          setSelectedElectionId(electionsRes.elections[0].id);
        }
      }

      setLastRefreshedAt(Date.now());
      setIsStale(false);
    } catch (err: any) {
      console.warn('[ElectionMonitor] Error refreshing data:', err.message);
      setIsStale(true);
      if (!isBackground) {
        setErrorMessage('Unable to connect to Election Monitor server. Showing cached data.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, typeFilter, searchQuery, selectedElectionId]);

  // Load detail for selected election
  const loadSelectedDetail = useCallback(async (electionId: string) => {
    setDetailLoading(true);
    try {
      const [detailRes, partRes, resultsRes] = await Promise.all([
        voterApi.getPublicElectionDetail(electionId),
        voterApi.getPublicParticipationMetrics(electionId),
        voterApi.getPublicElectionResults(electionId),
      ]);

      if (detailRes.success && detailRes.election) {
        setSelectedDetail(detailRes.election);
      }
      if (partRes.success && partRes.metrics) {
        setParticipationMetrics(partRes.metrics);
      }
      if (resultsRes.success && resultsRes.results) {
        setPublishedResults(resultsRes.results);
      } else {
        setPublishedResults(null);
      }
    } catch (err: any) {
      console.warn('[ElectionMonitor] Error loading election detail:', err.message);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    loadData(false);
  }, [loadData]);

  // Load detail when selected election changes
  useEffect(() => {
    if (selectedElectionId) {
      loadSelectedDetail(selectedElectionId);
    }
  }, [selectedElectionId, loadSelectedDetail]);

  // Visibility-aware periodic polling
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        // Tab restored: trigger immediate background refresh and resume polling
        loadData(true);
        if (selectedElectionId) {
          loadSelectedDetail(selectedElectionId);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    // 20-second background polling when tab is active
    pollingTimerRef.current = setInterval(() => {
      if (document.visibilityState === 'visible') {
        loadData(true);
        if (selectedElectionId) {
          loadSelectedDetail(selectedElectionId);
        }
      }
    }, 20000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      if (pollingTimerRef.current) clearInterval(pollingTimerRef.current);
    };
  }, [loadData, selectedElectionId, loadSelectedDetail]);

  // Format date helper with explicit timezone
  const formatDate = (timestampSec: number) => {
    if (!timestampSec) return 'Unavailable';
    const date = new Date(timestampSec * 1000);
    return date.toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    }) + ' IST';
  };

  // Format countdown string
  const formatCountdown = (seconds: number) => {
    if (seconds <= 0) return '00:00:00';
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (days > 0) {
      return `${days}d ${hours}h ${mins}m`;
    }
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Status Badge Helper
  const renderStatusBadge = (norm: NormalizedElectionStatus) => {
    switch (norm) {
      case 'OPEN':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active / Voting Open
          </span>
        );
      case 'SCHEDULED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Clock className="w-3.5 h-3.5 text-blue-500" />
            Scheduled
          </span>
        );
      case 'PAUSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            <PauseCircle className="w-3.5 h-3.5 text-amber-500" />
            Temporarily Paused
          </span>
        );
      case 'CLOSED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            Closed / Concluded
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3.5 h-3.5 text-rose-500" />
            Cancelled
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-50 text-slate-600 border border-slate-200">
            {norm}
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Tricolor Accent Header */}
      <div className="h-1.5 w-full bg-gradient-to-r from-orange-600 via-white to-emerald-600" />

      {/* Hero / Header Section */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-6 sm:py-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold tracking-wider text-orange-600 uppercase mb-2">
                <Activity className="w-4 h-4 text-orange-600 animate-pulse" />
                <span>Public Oversight & Verification</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight flex flex-wrap items-center gap-3">
                <span>Election Monitor Dashboard</span>
                <span className="text-xs px-2.5 py-1 bg-slate-100 text-slate-600 font-mono font-normal rounded-md border border-slate-200">
                  v1.0 Public Projection
                </span>
              </h1>
              <p className="mt-2 text-sm text-slate-600 max-w-2xl">
                Real-time status tracking, authoritative schedule synchronization, and privacy-safe
                aggregate participation statistics for BlockBallot demonstration elections.
              </p>
            </div>

            {/* Quick Action & Refresh Status */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200 text-xs text-slate-600 font-mono">
                <span className={`w-2 h-2 rounded-full ${isStale ? 'bg-amber-500' : 'bg-emerald-500 animate-pulse'}`} />
                <span>
                  {isStale
                    ? 'Stale / Offline'
                    : `Updated ${new Date(lastRefreshedAt).toLocaleTimeString()}`}
                </span>
              </div>

              <button
                onClick={() => loadData(false)}
                disabled={refreshing}
                className="px-3.5 py-2 rounded-lg text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 shadow-2xs transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-orange-600' : ''}`} />
                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>

              {onNavigateToArchive && (
                <button
                  onClick={onNavigateToArchive}
                  className="px-3.5 py-2 rounded-lg text-xs font-semibold text-orange-700 bg-orange-50 hover:bg-orange-100 border border-orange-200 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5 text-orange-600" />
                  <span>Historical Archive</span>
                </button>
              )}
            </div>
          </div>

          {/* Stale Warning Banner */}
          {isStale && (
            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-3 text-xs text-amber-800">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Warning: Data may be stale.</strong> Unable to reach the authoritative backend server.
                The displayed statuses reflect the most recent local cache.
              </span>
            </div>
          )}

          {/* Error Message */}
          {errorMessage && (
            <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-lg flex items-center gap-3 text-xs text-rose-800">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Statutory & Privacy Notice Badges */}
          <div className="mt-6 pt-4 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 flex items-start gap-2.5">
              <Info className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <strong className="text-slate-800 block mb-0.5">Academic Prototype Notice</strong>
                {MONITOR_NON_ENDORSEMENT_DISCLAIMER}
              </div>
            </div>

            <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs text-amber-900 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <strong className="text-amber-800 block mb-0.5">Ballot Secrecy Architecture Warning</strong>
                {BALLOT_SECRECY_LIMITATION_NOTICE}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
        {/* Metric Counter Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-500 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Tracked Public</span>
              <Activity className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-900">
              {overview ? overview.totalPublicElections : elections.length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Non-draft public elections</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-emerald-600 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Voting Open</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-2xl font-bold text-emerald-700">
              {overview ? overview.openElectionsCount : elections.filter((e) => e.normalizedStatus === 'OPEN').length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Currently accepting votes</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-blue-600 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Scheduled</span>
              <Clock className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-blue-700">
              {overview ? overview.scheduledElectionsCount : elections.filter((e) => e.normalizedStatus === 'SCHEDULED').length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Awaiting start window</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="flex items-center justify-between text-slate-600 mb-1">
              <span className="text-xs font-semibold uppercase tracking-wider">Concluded</span>
              <Lock className="w-4 h-4 text-slate-400" />
            </div>
            <div className="text-2xl font-bold text-slate-700">
              {overview ? overview.closedElectionsCount : elections.filter((e) => e.normalizedStatus === 'CLOSED').length}
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Sealed & finalized</p>
          </div>
        </div>

        {/* Two-Column Layout: Election Selection & Detailed Monitor */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column: Filterable List (5 cols) */}
          <div className="lg:col-span-5 space-y-4">
            {/* Filter Card */}
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by title, constituency, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                />
              </div>

              {/* Status Tabs */}
              <div className="flex flex-wrap gap-1.5">
                {['ALL', 'OPEN', 'SCHEDULED', 'CLOSED', 'PAUSED'].map((st) => (
                  <button
                    key={st}
                    onClick={() => setStatusFilter(st)}
                    className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                      statusFilter === st
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {st === 'ALL' ? 'All Public' : st}
                  </button>
                ))}
              </div>
            </div>

            {/* Elections Listing */}
            <div className="space-y-3">
              {loading ? (
                <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
                  <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-orange-600" />
                  Loading public election records...
                </div>
              ) : elections.length === 0 ? (
                <div className="bg-white p-8 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
                  <Filter className="w-6 h-6 mx-auto mb-2 text-slate-400" />
                  <p className="font-semibold text-slate-700">No public elections match filter</p>
                  <p className="text-[11px] mt-1">Try resetting search filters or status parameters.</p>
                </div>
              ) : (
                elections.map((elec) => {
                  const isSelected = elec.id === selectedElectionId;
                  return (
                    <div
                      key={elec.id}
                      onClick={() => setSelectedElectionId(elec.id)}
                      className={`p-4 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-white border-orange-500 ring-2 ring-orange-500/20 shadow-md'
                          : 'bg-white border-slate-200 hover:border-slate-300 shadow-2xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-[11px] font-mono text-slate-500 font-medium">
                              #{elec.id}
                            </span>
                            {elec.isDemoElection && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-orange-100 text-orange-800 font-semibold">
                                Demo
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-bold text-slate-900 leading-snug">
                            {elec.title}
                          </h3>
                        </div>
                        {renderStatusBadge(elec.normalizedStatus)}
                      </div>

                      <p className="text-xs text-slate-600 line-clamp-2 mb-3">
                        {elec.description}
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100">
                        <span className="flex items-center gap-1 font-mono">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formatDate(elec.startTime)}
                        </span>
                        <span className="font-semibold text-orange-600 flex items-center gap-1">
                          Inspect <ArrowRight className="w-3 h-3" />
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Right Column: Detailed Monitor for Selected Election (7 cols) */}
          <div className="lg:col-span-7">
            {detailLoading ? (
              <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
                <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-orange-600" />
                Synchronizing authoritative state for selected election...
              </div>
            ) : !selectedDetail ? (
              <div className="bg-white p-12 rounded-xl border border-slate-200 text-center text-slate-500 text-xs">
                <Activity className="w-8 h-8 mx-auto mb-2 text-slate-400" />
                <p className="font-semibold text-slate-700">Select an election to monitor</p>
                <p className="text-[11px] mt-1">Choose any public election from the left list to inspect verified schedules and participation.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Election Overview Card */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-semibold">
                        {selectedDetail.id}
                      </span>
                      <span className="text-xs px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 font-medium">
                        EVM Chain ID #{selectedDetail.numericId}
                      </span>
                    </div>
                    {renderStatusBadge(selectedDetail.normalizedStatus)}
                  </div>

                  <h2 className="text-xl font-extrabold text-slate-900 mb-2">
                    {selectedDetail.title}
                  </h2>
                  <p className="text-xs text-slate-600 mb-6 leading-relaxed">
                    {selectedDetail.description}
                  </p>

                  {/* Authoritative Time Windows */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200 mb-6 text-xs">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block mb-1">
                        Authoritative Start Time
                      </span>
                      <span className="font-mono text-slate-800 font-semibold">
                        {formatDate(selectedDetail.startTime)}
                      </span>
                    </div>
                    <div>
                      <span className="text-[11px] uppercase tracking-wider font-semibold text-slate-500 block mb-1">
                        Authoritative End Time
                      </span>
                      <span className="font-mono text-slate-800 font-semibold">
                        {formatDate(selectedDetail.endTime)}
                      </span>
                    </div>
                  </div>

                  {/* Informational Countdown Banner */}
                  <div className="p-4 rounded-xl bg-gradient-to-r from-slate-900 to-slate-800 text-white flex items-center justify-between gap-4">
                    <div>
                      <span className="text-[11px] uppercase tracking-wider text-slate-400 font-semibold block">
                        {selectedDetail.normalizedStatus === 'OPEN'
                          ? 'Voting Closes In'
                          : selectedDetail.normalizedStatus === 'SCHEDULED'
                          ? 'Voting Begins In'
                          : 'Election Lifecycle'}
                      </span>
                      <span className="text-2xl font-mono font-bold tracking-tight text-white">
                        {selectedDetail.normalizedStatus === 'OPEN'
                          ? formatCountdown(selectedDetail.timeUntilEndSec)
                          : selectedDetail.normalizedStatus === 'SCHEDULED'
                          ? formatCountdown(selectedDetail.timeUntilStartSec)
                          : selectedDetail.normalizedStatus}
                      </span>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">
                        *Countdown is informational.
                      </span>
                      <span className="text-[10px] text-slate-300">
                        Server authoritative clock dictates transitions.
                      </span>
                    </div>
                  </div>
                </div>

                {/* Aggregate Participation & Turnout Module */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Vote className="w-5 h-5 text-orange-600" />
                      <h3 className="text-sm font-bold text-slate-900">
                        Aggregate Voter Participation (Turnout)
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      Authoritative Ledger Records
                    </span>
                  </div>

                  {participationMetrics ? (
                    <div className="space-y-4">
                      {/* Metric Summary */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 rounded-xl bg-slate-50 border border-slate-200">
                        <div>
                          <span className="text-[11px] uppercase font-semibold text-slate-500 block mb-1">
                            Confirmed Voters
                          </span>
                          <span className="text-xl font-extrabold text-slate-900">
                            {participationMetrics.confirmedParticipationCount.toLocaleString()}
                          </span>
                        </div>

                        <div>
                          <span className="text-[11px] uppercase font-semibold text-slate-500 block mb-1">
                            Registered Electors
                          </span>
                          <span className="text-xl font-extrabold text-slate-900">
                            {participationMetrics.eligibleVoterDenominator
                              ? participationMetrics.eligibleVoterDenominator.toLocaleString()
                              : 'Unavailable'}
                          </span>
                        </div>

                        <div>
                          <span className="text-[11px] uppercase font-semibold text-slate-500 block mb-1">
                            Simulated Turnout %
                          </span>
                          <span className="text-xl font-extrabold text-orange-600">
                            {participationMetrics.turnoutPercentage !== null
                              ? `${participationMetrics.turnoutPercentage}%`
                              : 'Unavailable'}
                          </span>
                        </div>
                      </div>

                      {/* Turnout Progress Bar */}
                      {participationMetrics.turnoutPercentage !== null && (
                        <div>
                          <div className="flex justify-between text-xs text-slate-600 mb-1 font-semibold">
                            <span>Turnout Progress</span>
                            <span>{participationMetrics.turnoutPercentage}%</span>
                          </div>
                          <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
                            <div
                              className="h-full bg-gradient-to-r from-orange-500 to-emerald-500 transition-all duration-500"
                              style={{ width: `${Math.min(100, participationMetrics.turnoutPercentage)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Constituency Breakdown Table */}
                      <div className="mt-4 pt-4 border-t border-slate-100">
                        <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                          Constituency Breakdown
                        </h4>
                        <div className="overflow-x-auto bb-table-container">
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
                              <tr>
                                <th className="py-2 px-3 font-semibold">Constituency</th>
                                <th className="py-2 px-3 font-semibold">State</th>
                                <th className="py-2 px-3 font-semibold text-right">Electors</th>
                                <th className="py-2 px-3 font-semibold text-right">Votes</th>
                                <th className="py-2 px-3 font-semibold text-right">Turnout</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {participationMetrics.constituencies.map((c) => (
                                <tr key={c.constituencyId} className="hover:bg-slate-50/50">
                                  <td className="py-2.5 px-3 font-medium text-slate-900">
                                    {c.name} ({c.code})
                                  </td>
                                  <td className="py-2.5 px-3 text-slate-600">{c.state}</td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                                    {c.totalElectors.toLocaleString()}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono text-slate-700">
                                    {c.privacyMasked ? (
                                      <span className="text-[10px] text-slate-400 italic">Masked (&le;5)</span>
                                    ) : (
                                      c.confirmedCount.toLocaleString()
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-right font-mono font-semibold text-orange-600">
                                    {c.privacyMasked ? (
                                      <span className="text-[10px] text-slate-400 italic">&mdash;</span>
                                    ) : c.turnoutPercentage !== null ? (
                                      `${c.turnoutPercentage}%`
                                    ) : (
                                      'Unavailable'
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Participation records not yet available for this election.
                    </div>
                  )}
                </div>

                {/* Candidate Results & Ballot Secrecy Module */}
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-2xs">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Lock className="w-5 h-5 text-slate-700" />
                      <h3 className="text-sm font-bold text-slate-900">
                        Candidate Tallies & Certification
                      </h3>
                    </div>
                    <span className="text-[11px] font-mono text-slate-500">
                      Privacy-Preserving Sealed Tallies
                    </span>
                  </div>

                  {selectedDetail.normalizedStatus !== 'CLOSED' ? (
                    /* Sealed Tallies Notice while Voting is in Progress */
                    <div className="p-5 rounded-xl bg-slate-50 border border-slate-200 text-center">
                      <Lock className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                      <h4 className="text-sm font-bold text-slate-800">
                        Candidate Tallies Are Strictly Sealed
                      </h4>
                      <p className="text-xs text-slate-600 max-w-md mx-auto mt-1 leading-relaxed">
                        To protect voter independence and prevent premature influence, candidate-level
                        counts are never released while an election is open, scheduled, or paused.
                        Final results will be published only after the election officially concludes and
                        certification is completed.
                      </p>
                      {onNavigateToVote && selectedDetail.normalizedStatus === 'OPEN' && (
                        <button
                          onClick={onNavigateToVote}
                          className="mt-4 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold shadow-2xs transition-all cursor-pointer inline-flex items-center gap-1.5"
                        >
                          <Vote className="w-3.5 h-3.5" />
                          <span>Cast Simulated Ballot</span>
                        </button>
                      )}
                    </div>
                  ) : publishedResults && publishedResults.resultsAvailable ? (
                    /* Published Results for Concluded Election */
                    <div className="space-y-4">
                      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-between text-xs text-emerald-800">
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Certified Simulation Results Published</span>
                        </div>
                        <span className="font-mono text-[11px] text-emerald-700">
                          {publishedResults.certification?.status}
                        </span>
                      </div>

                      {/* Constituency Results Tables */}
                      {publishedResults.constituencies?.map((c) => (
                        <div key={c.constituencyId} className="border border-slate-200 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <h5 className="text-xs font-bold text-slate-900">
                              {c.name} ({c.code}) — {c.state}
                            </h5>
                            <span className="text-[11px] text-slate-500 font-mono">
                              Turnout: {c.turnoutPercentage}% ({c.votesCast.toLocaleString()} votes)
                            </span>
                          </div>

                          {c.winningCandidate && (
                            <div className="p-2 bg-orange-50 border border-orange-200 rounded-md text-xs text-orange-900 mb-3 flex items-center justify-between">
                              <span><strong>Leading Candidate:</strong> {c.winningCandidate.name} ({c.winningCandidate.partyName})</span>
                              <span className="font-mono font-semibold">{c.winningCandidate.voteCount.toLocaleString()} votes</span>
                            </div>
                          )}

                          <div className="space-y-1.5">
                            {c.candidates.map((cand) => (
                              <div key={cand.candidateId} className="flex items-center justify-between text-xs py-1 border-b border-slate-100 last:border-0">
                                <span className="font-medium text-slate-800">
                                  {cand.name} <span className="text-slate-400">({cand.partyAbbreviation})</span>
                                </span>
                                <div className="flex items-center gap-3 font-mono">
                                  <span className="text-slate-600">{cand.voteCount.toLocaleString()} votes</span>
                                  <span className="text-orange-600 font-semibold w-12 text-right">{cand.voteSharePct}%</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-4 text-center text-xs text-slate-500">
                      Results for this concluded election have not yet been certified.
                    </div>
                  )}
                </div>

                {/* Cross-Link to Historical Archive Card */}
                {onNavigateToArchive && (
                  <div className="p-5 rounded-xl bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div>
                      <h4 className="text-sm font-bold text-orange-900 flex items-center gap-2">
                        <Database className="w-4 h-4 text-orange-600" />
                        Explore Form 20 Historical Gazette Data
                      </h4>
                      <p className="text-xs text-orange-800/80 mt-1 max-w-lg">
                        Want to view official published election returns from past Indian elections?
                        Browse verified 2024 Lok Sabha Parliamentary Constituency records in the
                        Historical Archive.
                      </p>
                    </div>

                    <button
                      onClick={onNavigateToArchive}
                      className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer shadow-2xs shrink-0 flex items-center gap-1.5"
                    >
                      <span>Open Historical Archive</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
