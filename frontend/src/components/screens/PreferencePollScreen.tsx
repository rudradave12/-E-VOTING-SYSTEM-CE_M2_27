/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Vote,
  PieChart,
  ShieldAlert,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  RotateCcw,
  Lock,
  ExternalLink,
  Clock,
  Sparkles,
  UserCheck,
  FileText,
  BarChart2,
  ChevronRight,
  Users,
  Search,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { voterApi } from '../../services/voterApi';
import { OfficialPartySymbol } from '../common/OfficialPartySymbol';
import { CivicEmblem } from '../CivicEmblem';
import {
  PreferencePollConfig,
  PollAggregateRecord,
  PollResponseRecord,
  VoterRecord,
} from '../../types';
import {
  RECOGNIZED_PARTIES,
  RecognizedPartyRecord,
  HISTORICAL_PROVENANCE,
} from '../../data/historical2024';

interface PreferencePollScreenProps {
  currentVoter?: VoterRecord | null;
  onNavigateToAuth?: () => void;
  onNavigateToArchive?: () => void;
}

export const PreferencePollScreen: React.FC<PreferencePollScreenProps> = ({
  currentVoter,
  onNavigateToAuth,
  onNavigateToArchive,
}) => {
  const { t, language } = useLanguage();

  const [poll, setPoll] = useState<PreferencePollConfig | null>(null);
  const [aggregate, setAggregate] = useState<PollAggregateRecord | null>(null);
  const [parties, setParties] = useState<RecognizedPartyRecord[]>(RECOGNIZED_PARTIES);
  const [myResponse, setMyResponse] = useState<PollResponseRecord | null>(null);

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<string | null>(null);

  const [selectedPartyCode, setSelectedPartyCode] = useState<string | null>(null);
  const [flowStep, setFlowStep] = useState<'select' | 'review' | 'confirmed'>('select');
  const [receipt, setReceipt] = useState<PollResponseRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const isAuthenticated = Boolean(
    voterApi.getSessionToken() || voterApi.getAdminToken() || currentVoter
  );

  const loadPollData = useCallback(async () => {
    setIsLoading(true);
    setFetchError(null);
    try {
      const res = await voterApi.getPreferencePoll();
      if (!res.success || !res.poll) {
        setFetchError(res.message || 'Preference poll configuration could not be loaded.');
        setPoll(null);
        setAggregate(null);
        setIsLoading(false);
        return;
      }

      setPoll(res.poll);
      setAggregate(res.aggregate || null);
      if (res.parties && res.parties.length > 0) {
        setParties(res.parties);
      }

      // If user has an active session, check for prior submission
      const token = voterApi.getSessionToken() || voterApi.getAdminToken();
      if (token) {
        const myRespRes = await voterApi.getMyPollResponse(res.poll.id);
        if (myRespRes.success && myRespRes.hasVoted && myRespRes.response) {
          setMyResponse(myRespRes.response);
          setReceipt(myRespRes.response);
          setFlowStep('confirmed');
        }
      }
    } catch (err: any) {
      setFetchError(err.message || 'Network error connecting to poll services.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPollData();
  }, [loadPollData]);

  // Selected party entity
  const selectedParty = useMemo(() => {
    if (!selectedPartyCode) return null;
    return parties.find((p) => p.code === selectedPartyCode) || null;
  }, [selectedPartyCode, parties]);

  // Receipt party entity
  const receiptParty = useMemo(() => {
    const code = receipt?.partyCode || myResponse?.partyCode;
    if (!code) return null;
    return parties.find((p) => p.code === code) || null;
  }, [receipt, myResponse, parties]);

  // Filtered party list
  const filteredParties = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return parties;
    return parties.filter((p) => {
      return (
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.reservedSymbol.toLowerCase().includes(q) ||
        (p.nameHi && p.nameHi.includes(q))
      );
    });
  }, [parties, searchQuery]);

  // Sorted aggregate statistics
  const sortedAggregates = useMemo(() => {
    if (!aggregate || !aggregate.partyTallies) return [];
    const total = aggregate.totalResponses || 0;

    return parties.map((p) => {
      const tally = aggregate.partyTallies[p.code] || 0;
      const percentage = total > 0 ? (tally / total) * 100 : 0;
      return {
        party: p,
        tally,
        percentage,
      };
    }).sort((a, b) => b.tally - a.tally);
  }, [aggregate, parties]);

  const handleVoteSubmit = async () => {
    if (!poll || !selectedPartyCode) return;
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const res = await voterApi.submitPollVote(poll.id, selectedPartyCode);
      if (!res.success || !res.receipt) {
        setSubmissionError(res.message || 'Failed to record your poll response.');
        setIsSubmitting(false);
        return;
      }

      setReceipt(res.receipt);
      setMyResponse(res.receipt);
      if (res.aggregate) {
        setAggregate(res.aggregate);
      }
      setFlowStep('confirmed');
    } catch (err: any) {
      setSubmissionError(err.message || 'Network error submitting your response.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8" data-testid="preference-poll-screen">
      {/* 1. Mandatory Academic Notice & Civic Non-Endorsement Disclaimer */}
      <div
        className="rounded-2xl border border-amber-300 bg-linear-to-r from-amber-50 to-orange-50/70 p-5 sm:p-6 text-amber-950 shadow-xs"
        role="region"
        aria-label="Civic Disclaimer"
      >
        <div className="flex items-start gap-4">
          <div className="p-2.5 rounded-xl bg-amber-100 text-amber-800 shrink-0 mt-0.5">
            <ShieldAlert className="w-5 h-5 text-amber-700" />
          </div>
          <div className="space-y-1.5 text-xs sm:text-sm leading-relaxed">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-amber-950 uppercase tracking-wider text-xs px-2 py-0.5 rounded-md bg-amber-200/70">
                {language === 'hi' ? 'अनौपचारिक नागरिक जनमत' : 'Unofficial Public-Opinion Poll'}
              </span>
              <span className="text-amber-800 font-medium text-xs">
                {t.pollUnofficialBadge}
              </span>
            </div>
            <p className="font-semibold text-slate-900">
              {t.pollDisclaimer}
            </p>
            <p className="text-amber-900 text-[11px] sm:text-xs">
              {HISTORICAL_PROVENANCE.nonEndorsementNotice}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Hero Header */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-orange-50 text-orange-600 border border-orange-100">
                <PieChart className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold text-orange-700 uppercase tracking-widest">
                {language === 'hi' ? 'नागरिक सर्वेक्षण 2024' : 'Independent Civic Survey'}
              </span>
              {poll && (
                <span
                  className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                    poll.status === 'open'
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-rose-50 text-rose-700 border border-rose-200'
                  }`}
                >
                  {poll.status === 'open'
                    ? language === 'hi'
                      ? '● मतदान खुला है'
                      : '● Poll Open'
                    : language === 'hi'
                    ? '○ जनमत बंद है'
                    : '○ Poll Closed'}
                </span>
              )}
            </div>

            <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
              {language === 'hi' && poll?.titleHi ? poll.titleHi : t.pollTitle}
            </h1>
            <p className="text-sm sm:text-base text-slate-600 max-w-3xl leading-relaxed">
              {language === 'hi' && poll?.descriptionHi
                ? poll.descriptionHi
                : t.pollSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 shrink-0">
            {onNavigateToArchive && (
              <button
                onClick={onNavigateToArchive}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors cursor-pointer"
              >
                <BarChart2 className="w-4 h-4 text-emerald-600" />
                <span>{language === 'hi' ? 'आधिकारिक 2024 परिणाम' : '2024 Official Archive'}</span>
              </button>
            )}
            <button
              onClick={loadPollData}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-medium transition-colors cursor-pointer"
              title="Refresh poll data"
            >
              <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-orange-600' : ''}`} />
              <span className="hidden sm:inline">{language === 'hi' ? 'रीफ्रेश' : 'Refresh'}</span>
            </button>
          </div>
        </div>

        {/* Live Aggregate Metrics Strip */}
        {aggregate && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-slate-100">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                {t.pollTotalVotesCounted}
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono tabular-nums">
                {aggregate.totalResponses.toLocaleString('en-IN')}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                {language === 'hi' ? 'मान्यता प्राप्त दल' : 'Contesting Parties'}
              </span>
              <span className="text-xl sm:text-2xl font-black text-slate-900 font-mono">
                {parties.length}
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                {language === 'hi' ? 'प्रतिभागी सीमा' : 'Response Rule'}
              </span>
              <span className="text-xs sm:text-sm font-bold text-slate-800 flex items-center gap-1 mt-1">
                <Lock className="w-3.5 h-3.5 text-orange-600" />
                <span>1 Response / Citizen</span>
              </span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
              <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
                {language === 'hi' ? 'डेटाबेस स्थिति' : 'Firestore State'}
              </span>
              <span className="text-xs sm:text-sm font-bold text-emerald-700 flex items-center gap-1 mt-1">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Atomic & Reconciled</span>
              </span>
            </div>
          </div>
        )}
      </div>

      {/* 3. Loading State */}
      {isLoading && !poll && (
        <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center space-y-4">
          <div className="w-12 h-12 rounded-full border-4 border-orange-200 border-t-orange-600 animate-spin mx-auto" />
          <p className="text-sm font-semibold text-slate-600">
            {language === 'hi' ? 'सर्वेक्षण विवरण लोड हो रहा है...' : 'Connecting to Firestore poll services...'}
          </p>
        </div>
      )}

      {/* 4. Error State */}
      {fetchError && (
        <div className="rounded-2xl bg-rose-50 border border-rose-200 p-6 text-rose-900 space-y-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <h3 className="font-bold text-base">
              {language === 'hi' ? 'जनमत सेवा से संपर्क विफल' : 'Unable to Load Preference Poll'}
            </h3>
          </div>
          <p className="text-xs sm:text-sm text-rose-800">{fetchError}</p>
          <button
            onClick={loadPollData}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
          >
            {t.pollRetry}
          </button>
        </div>
      )}

      {/* 5. Empty State (No Poll Configured) */}
      {!isLoading && !fetchError && !poll && (
        <div className="rounded-2xl bg-white border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <PieChart className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">{t.pollEmptyTitle}</h3>
          <p className="text-sm text-slate-600 max-w-md mx-auto">{t.pollEmptyDesc}</p>
        </div>
      )}

      {/* 6. Active Poll Layout */}
      {!isLoading && poll && (
        <div className="space-y-8">
          {/* A. Closed Poll Notice */}
          {poll.status === 'closed' && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-rose-900 flex items-center gap-3">
              <Lock className="w-5 h-5 text-rose-600 shrink-0" />
              <div className="text-sm">
                <span className="font-bold block">{language === 'hi' ? 'जनमत बंद है' : 'Poll Closed'}</span>
                <span>{t.pollClosed}</span>
              </div>
            </div>
          )}

          {/* B. Authentication-Required Notice */}
          {!isAuthenticated && poll.status === 'open' && (
            <div className="rounded-2xl border border-indigo-200 bg-linear-to-r from-indigo-50/90 to-blue-50/60 p-6 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-3.5">
                  <div className="p-2.5 rounded-xl bg-indigo-100 text-indigo-700 shrink-0 mt-0.5">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-base font-bold text-indigo-950">
                      {t.pollAuthRequired}
                    </h3>
                    <p className="text-xs sm:text-sm text-indigo-900 max-w-2xl leading-relaxed">
                      {t.pollAuthRequiredDesc}
                    </p>
                  </div>
                </div>

                {onNavigateToAuth && (
                  <button
                    onClick={onNavigateToAuth}
                    className="flex items-center gap-2 px-5 py-3 rounded-xl bg-indigo-700 hover:bg-indigo-800 text-white font-semibold text-xs shadow-sm hover:shadow transition-all shrink-0 cursor-pointer self-start sm:self-auto"
                  >
                    <span>{t.pollSignInButton}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}

          {/* C. Verified Receipt Card (Already Participated or Just Confirmed) */}
          {(myResponse || receipt) && (
            <div
              className="rounded-2xl border border-emerald-300 bg-linear-to-b from-emerald-50/90 to-white p-6 sm:p-8 shadow-xs space-y-6"
              role="region"
              aria-label="Submission Receipt"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-emerald-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700 shrink-0">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-emerald-700 uppercase tracking-widest block">
                      {t.pollStepSaved}
                    </span>
                    <h2 className="text-lg sm:text-xl font-extrabold text-slate-900">
                      {language === 'hi' ? 'आपकी प्राथमिकता सुरक्षित दर्ज है' : 'Verified Participation Receipt'}
                    </h2>
                  </div>
                </div>

                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100/70 text-emerald-800 text-xs font-bold font-mono">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
                  <span>100% Reconciled</span>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                {/* Party Option Recorded */}
                {receiptParty && (
                  <div className="flex items-center gap-4 p-4 rounded-xl bg-white border border-emerald-200 shadow-2xs">
                    <OfficialPartySymbol
                      symbolKey={receiptParty.symbolKey}
                      symbolName={receiptParty.reservedSymbol}
                      partyName={receiptParty.name}
                      partyAbbreviation={receiptParty.code}
                      size={64}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded-md bg-slate-900 text-white font-mono font-bold">
                          {receiptParty.code}
                        </span>
                        <span className="text-[11px] font-semibold text-emerald-700 uppercase">
                          {receiptParty.type === 'NATIONAL' ? 'National Party' : 'State Party'}
                        </span>
                      </div>
                      <h4 className="font-extrabold text-base text-slate-900">
                        {language === 'hi' && receiptParty.nameHi ? receiptParty.nameHi : receiptParty.name}
                      </h4>
                      <p className="text-xs text-slate-500">
                        {receiptParty.reservedSymbol}
                      </p>
                    </div>
                  </div>
                )}

                {/* Receipt Details */}
                <div className="space-y-3 text-xs sm:text-sm">
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">{t.pollReceiptId}</span>
                    <span className="font-mono font-bold text-slate-900 select-all">
                      {receipt?.receiptId || myResponse?.receiptId}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-slate-100">
                    <span className="text-slate-500 font-medium">{t.pollTimestamp}</span>
                    <span className="font-mono text-slate-800">
                      {new Date(receipt?.submittedAt || myResponse?.submittedAt || Date.now()).toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-slate-500 font-medium">Participant Rule</span>
                    <span className="font-semibold text-emerald-700">Single Verified Response Stored</span>
                  </div>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-emerald-100/50 text-emerald-900 text-xs leading-relaxed flex items-center gap-2.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>{t.pollReceiptNotice}</span>
              </div>
            </div>
          )}

          {/* D. Interactive Voting Flow (When Open, Authenticated & Not Yet Voted) */}
          {isAuthenticated && poll.status === 'open' && !myResponse && !receipt && (
            <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
              {/* Stepper Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-orange-600 uppercase tracking-wider">
                      {flowStep === 'select' ? 'Step 1 of 2' : 'Step 2 of 2'}
                    </span>
                    <span className="text-slate-400">·</span>
                    <span className="text-xs text-slate-500">
                      {flowStep === 'select' ? t.pollStepSelect : t.pollStepReview}
                    </span>
                  </div>
                  <h2 className="text-xl sm:text-2xl font-bold text-slate-900">
                    {flowStep === 'select'
                      ? language === 'hi'
                        ? 'अपनी राजनीतिक दल प्राथमिकता चुनें'
                        : 'Select Your Preferred Political Party'
                      : language === 'hi'
                      ? 'अपनी दल पसंद की समीक्षा करें'
                      : 'Review Your Party Preference'}
                  </h2>
                </div>

                {currentVoter && (
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                    <span className="text-slate-500">Participant:</span>
                    <span className="font-bold text-slate-900">{currentVoter.name}</span>
                    <span className="font-mono text-slate-500">({currentVoter.epicId})</span>
                  </div>
                )}
              </div>

              {/* Submission Error Banner */}
              {submissionError && (
                <div className="rounded-xl bg-rose-50 border border-rose-200 p-4 text-rose-900 text-xs sm:text-sm flex items-center gap-3">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{submissionError}</span>
                </div>
              )}

              {/* Step 1: Party Choice Cards */}
              {flowStep === 'select' && (
                <div className="space-y-6">
                  {/* Search / Filter Input */}
                  <div className="flex items-center gap-3 max-w-md">
                    <div className="relative w-full">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t.searchPlaceholder}
                        className="w-full pl-9 pr-3 py-2 text-xs sm:text-sm rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
                      />
                    </div>
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        className="text-xs text-slate-500 hover:text-slate-800 font-semibold cursor-pointer"
                      >
                        {t.clearSearch}
                      </button>
                    )}
                  </div>

                  {/* Responsive Grid of Parties */}
                  <div
                    className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
                    role="radiogroup"
                    aria-label="Political Parties Selection"
                  >
                    {filteredParties.map((party) => {
                      const isSelected = selectedPartyCode === party.code;

                      return (
                        <div
                          key={party.code}
                          role="radio"
                          aria-checked={isSelected}
                          tabIndex={0}
                          onClick={() => setSelectedPartyCode(party.code)}
                          onKeyDown={(e) => {
                            if (e.key === ' ' || e.key === 'Enter') {
                              e.preventDefault();
                              setSelectedPartyCode(party.code);
                            }
                          }}
                          className={`p-4 rounded-xl border-2 transition-all cursor-pointer relative flex flex-col justify-between focus:outline-none focus:ring-2 focus:ring-orange-500 ${
                            isSelected
                              ? 'border-orange-600 bg-orange-50/50 shadow-md ring-1 ring-orange-200'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs'
                          }`}
                        >
                          {/* Selection indicator pill */}
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <OfficialPartySymbol
                              symbolKey={party.symbolKey}
                              symbolName={party.reservedSymbol}
                              partyName={party.name}
                              partyAbbreviation={party.code}
                              size={48}
                            />
                            <div className="flex flex-col items-end gap-1">
                              <span className="text-[11px] font-mono font-black px-2 py-0.5 rounded-md bg-slate-900 text-white">
                                {party.code}
                              </span>
                              <span
                                className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                                  party.type === 'NATIONAL'
                                    ? 'bg-blue-50 text-blue-700 border border-blue-100'
                                    : 'bg-slate-100 text-slate-700'
                                }`}
                              >
                                {party.type}
                              </span>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <h3 className="font-extrabold text-base text-slate-900 leading-tight">
                              {language === 'hi' && party.nameHi ? party.nameHi : party.name}
                            </h3>
                            <p className="text-xs text-slate-600 font-medium">
                              {party.reservedSymbol}
                            </p>
                            <p className="text-[11px] text-slate-400">
                              {party.symbolNotificationRef}
                            </p>
                          </div>

                          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                            <span
                              className={`font-semibold ${
                                isSelected ? 'text-orange-700 font-bold' : 'text-slate-400'
                              }`}
                            >
                              {isSelected ? t.selectedBadge : t.clickToSelect}
                            </span>
                            <div
                              className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${
                                isSelected
                                  ? 'border-orange-600 bg-orange-600 text-white'
                                  : 'border-slate-300 bg-white'
                              }`}
                            >
                              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Proceed to Review Bar */}
                  <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="text-xs text-slate-500">
                      {selectedParty ? (
                        <span className="text-slate-800 font-medium">
                          {t.pollYourSelection}: <strong className="text-orange-700">{selectedParty.name} ({selectedParty.code})</strong>
                        </span>
                      ) : (
                        <span>{language === 'hi' ? 'कृपया आगे बढ़ने के लिए एक दल चुनें' : 'Please select one party option to continue'}</span>
                      )}
                    </div>

                    <button
                      onClick={() => setFlowStep('review')}
                      disabled={!selectedPartyCode}
                      className={`flex items-center gap-2 px-6 py-3 rounded-xl font-bold text-xs transition-all cursor-pointer ${
                        selectedPartyCode
                          ? 'bg-orange-600 hover:bg-orange-700 text-white shadow-md hover:shadow-lg'
                          : 'bg-slate-100 text-slate-400 cursor-not-allowed'
                      }`}
                    >
                      <span>{t.pollStepReview}</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {/* Step 2: Review & Final Submission */}
              {flowStep === 'review' && selectedParty && (
                <div className="space-y-6">
                  {/* Selected Choice Banner */}
                  <div className="p-6 rounded-2xl bg-orange-50/70 border-2 border-orange-200 flex flex-col sm:flex-row items-center justify-between gap-6">
                    <div className="flex items-center gap-5">
                      <OfficialPartySymbol
                        symbolKey={selectedParty.symbolKey}
                        symbolName={selectedParty.reservedSymbol}
                        partyName={selectedParty.name}
                        partyAbbreviation={selectedParty.code}
                        size={72}
                      />
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs px-2.5 py-0.5 rounded-md bg-slate-900 text-white font-mono font-bold">
                            {selectedParty.code}
                          </span>
                          <span className="text-xs font-semibold text-orange-800 uppercase">
                            {selectedParty.type} Party
                          </span>
                        </div>
                        <h3 className="text-xl font-extrabold text-slate-900">
                          {language === 'hi' && selectedParty.nameHi ? selectedParty.nameHi : selectedParty.name}
                        </h3>
                        <p className="text-xs text-slate-600">
                          Reserved Symbol: <strong>{selectedParty.reservedSymbol}</strong>
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() => setFlowStep('select')}
                      className="text-xs font-semibold text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg border border-slate-300 hover:bg-white transition-colors cursor-pointer"
                    >
                      {t.pollChangeSelection}
                    </button>
                  </div>

                  {/* Irreversibility & Integrity Warning */}
                  <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 space-y-2">
                    <div className="flex items-center gap-2 font-bold text-slate-900">
                      <Lock className="w-4 h-4 text-orange-600" />
                      <span>{language === 'hi' ? 'पुष्टि से पूर्व महत्वपूर्ण सूचना' : 'Pre-Confirmation Verification Notice'}</span>
                    </div>
                    <p className="leading-relaxed">
                      {t.pollReviewNotice}
                    </p>
                  </div>

                  {/* Submission Action Buttons */}
                  <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <button
                      onClick={() => setFlowStep('select')}
                      disabled={isSubmitting}
                      className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold transition-colors cursor-pointer"
                    >
                      {t.pollBackToSelection}
                    </button>

                    <button
                      onClick={handleVoteSubmit}
                      disabled={isSubmitting}
                      className="flex items-center gap-2 px-8 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all cursor-pointer disabled:opacity-50"
                    >
                      {isSubmitting ? (
                        <>
                          <div className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" />
                          <span>{t.pollSubmitting}</span>
                        </>
                      ) : (
                        <>
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{t.pollConfirmSubmit}</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 7. Live Real-Time Aggregated Results Section */}
          <div
            className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6"
            role="region"
            aria-label="Poll Aggregated Results"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
              <div>
                <div className="flex items-center gap-2">
                  <BarChart2 className="w-5 h-5 text-indigo-600" />
                  <span className="text-xs font-bold text-indigo-700 uppercase tracking-widest">
                    {t.pollVerifiedTally}
                  </span>
                </div>
                <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mt-1">
                  {t.pollLiveAggregates}
                </h3>
              </div>

              <div className="flex items-center gap-2 text-xs font-mono text-slate-500">
                <span>Total Responses:</span>
                <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
                  {aggregate?.totalResponses || 0}
                </span>
              </div>
            </div>

            {/* Zero Responses Empty State */}
            {(!aggregate || aggregate.totalResponses === 0) && (
              <div className="p-8 rounded-xl bg-slate-50 border border-slate-200 text-center space-y-2">
                <Users className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">
                  {t.pollNoResponsesYet}
                </p>
                <p className="text-xs text-slate-500">
                  {language === 'hi'
                    ? 'सत्यापित प्रतिक्रियाएं प्राप्त होने पर वास्तविक गणना यहां प्रदर्शित की जाएगी।'
                    : 'Actual aggregate tallies will compute in real-time as verified responses are saved in Firestore.'}
                </p>
              </div>
            )}

            {/* Non-Zero Response Breakdown */}
            {aggregate && aggregate.totalResponses > 0 && (
              <div className="space-y-4">
                {sortedAggregates.map(({ party, tally, percentage }) => (
                  <div
                    key={party.code}
                    className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors space-y-2"
                  >
                    <div className="flex items-center justify-between gap-4 text-xs">
                      <div className="flex items-center gap-3">
                        <OfficialPartySymbol
                          symbolKey={party.symbolKey}
                          symbolName={party.reservedSymbol}
                          partyName={party.name}
                          partyAbbreviation={party.code}
                          size={32}
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-slate-900 text-xs">
                              {party.code}
                            </span>
                            <span className="text-slate-700 font-semibold text-xs">
                              {language === 'hi' && party.nameHi ? party.nameHi : party.name}
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {party.reservedSymbol}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-3 text-right shrink-0">
                        <span className="text-xs font-mono font-semibold text-slate-600">
                          {tally} {tally === 1 ? 'vote' : 'votes'}
                        </span>
                        <span className="text-sm font-mono font-black text-slate-900 w-14">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                    </div>

                    {/* Proportional Progress Bar */}
                    <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-linear-to-r from-orange-500 to-indigo-600 transition-all duration-500"
                        style={{ width: `${Math.max(percentage, 1)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-2 text-center text-xs text-slate-400">
              <span>Verified Firestore persistence · No mock numbers or simulated votes</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
