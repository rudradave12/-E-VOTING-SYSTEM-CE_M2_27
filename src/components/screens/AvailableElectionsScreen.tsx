/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Election, Constituency } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import {
  Vote,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Layers,
  Sparkles,
  Lock,
} from 'lucide-react';

interface AvailableElectionsScreenProps {
  elections: Election[];
  constituencies: Constituency[];
  onSelectElectionAndVote: (electionId: string) => void;
  onViewResults?: (electionId: string) => void;
}

export const AvailableElectionsScreen: React.FC<AvailableElectionsScreenProps> = ({
  elections,
  constituencies,
  onSelectElectionAndVote,
  onViewResults,
}) => {
  const { language } = useLanguage();
  const [filter, setFilter] = useState<'all' | 'active' | 'scheduled' | 'concluded'>('all');

  const nowSec = Math.floor(Date.now() / 1000);

  const filteredElections = elections.filter((elec) => {
    if (filter === 'all') return true;
    if (filter === 'active') return elec.status === 'active';
    if (filter === 'scheduled') return elec.status === 'scheduled' || elec.status === 'draft';
    if (filter === 'concluded') return elec.status === 'concluded';
    return true;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-orange-50 border border-orange-200 text-orange-800 text-xs font-semibold mb-2">
            <Vote className="w-3.5 h-3.5 text-orange-600" />
            <span>{language === 'hi' ? 'सत्यापन योग्य इलेक्ट्रॉनिक मतपत्र' : 'Cryptographic E-Voting Portal'}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {language === 'hi' ? 'मतदान हेतु उपलब्ध चुनाव' : 'Available Elections'}
          </h1>
          <p className="text-sm text-slate-600 mt-1 max-w-2xl">
            {language === 'hi'
              ? 'वर्तमान में उपलब्ध शैक्षणिक डेमो चुनाव अथवा निर्वाचन अधिकारी द्वारा बनाए गए चुनावों में भाग लें।'
              : 'Access eligible elections, review official voting schedules, and proceed to the cryptographic voting booth.'}
          </p>
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl self-start md:self-auto border border-slate-200 text-xs font-medium">
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              filter === 'all' ? 'bg-white text-slate-900 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {language === 'hi' ? 'सभी चुनाव' : 'All Elections'}
          </button>
          <button
            onClick={() => setFilter('active')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              filter === 'active' ? 'bg-white text-emerald-700 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {language === 'hi' ? 'सक्रिय' : 'Active'}
          </button>
          <button
            onClick={() => setFilter('scheduled')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              filter === 'scheduled' ? 'bg-white text-amber-700 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {language === 'hi' ? 'प्रस्तावित / आगामी' : 'Scheduled / Draft'}
          </button>
          <button
            onClick={() => setFilter('concluded')}
            className={`px-3 py-1.5 rounded-lg transition-colors cursor-pointer ${
              filter === 'concluded' ? 'bg-white text-slate-800 font-bold shadow-2xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            {language === 'hi' ? 'समाप्त' : 'Concluded'}
          </button>
        </div>
      </div>

      {/* Elections Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {filteredElections.map((election) => {
          const isDemo = Boolean(election.isDemoElection || election.id === 'GE-2024');
          const isEligibleForVoting =
            election.status === 'active' && nowSec >= election.startTime && nowSec <= election.endTime;

          const matchedConstNames = election.constituencyIds
            ?.map((id) => constituencies.find((c) => c.id === id)?.name)
            .filter(Boolean)
            .join(', ');

          return (
            <div
              key={election.id}
              className={`rounded-2xl border bg-white p-6 shadow-xs flex flex-col justify-between transition-all hover:shadow-md ${
                isEligibleForVoting ? 'border-orange-300 ring-1 ring-orange-200' : 'border-slate-200'
              }`}
            >
              <div className="space-y-4">
                {/* Header Strip with Badges */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {isDemo ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
                        <Sparkles className="w-3 h-3 text-purple-600" />
                        Historical Demo Election
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-800 border border-cyan-200">
                        <Layers className="w-3 h-3 text-cyan-700" />
                        Administrator-Created Election
                      </span>
                    )}
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      election.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : election.status === 'scheduled'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : election.status === 'paused'
                        ? 'bg-orange-50 text-orange-800 border border-orange-200'
                        : election.status === 'concluded'
                        ? 'bg-slate-100 text-slate-700 border border-slate-200'
                        : 'bg-blue-50 text-blue-800 border border-blue-200'
                    }`}
                  >
                    {election.status === 'active' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />}
                    {election.status}
                  </span>
                </div>

                {/* Title & Description */}
                <div>
                  <h2 className="text-xl font-bold text-slate-900 tracking-tight leading-snug">
                    {election.title}
                  </h2>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mt-1">
                    <span className="font-mono">ID: {election.id}</span>
                    <span>·</span>
                    <span>Type: {election.electionType || 'General Parliamentary'}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-2.5 leading-relaxed">
                    {election.description}
                  </p>
                </div>

                {/* Constituency Scope */}
                <div className="p-3 bg-slate-50 border border-slate-100 rounded-xl space-y-1 text-xs">
                  <span className="text-slate-500 font-medium block">
                    {language === 'hi' ? 'संबद्ध निर्वाचन क्षेत्र:' : 'Participating Constituencies:'}
                  </span>
                  <span className="font-semibold text-slate-800">
                    {matchedConstNames || `${election.constituencyIds.length} Constituencies Configured`}
                  </span>
                </div>

                {/* Schedule & Voting Window Details */}
                <div className="grid grid-cols-2 gap-3 text-xs pt-1">
                  <div className="space-y-0.5">
                    <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                      <Clock className="w-3 h-3 text-slate-400" />
                      Voting Opens
                    </span>
                    <span className="font-mono text-slate-700 text-[11px] block">
                      {new Date(election.startTime * 1000).toLocaleString([], {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>

                  <div className="space-y-0.5">
                    <span className="text-slate-400 text-[10px] uppercase font-bold flex items-center gap-1">
                      <Calendar className="w-3 h-3 text-slate-400" />
                      Voting Closes
                    </span>
                    <span className="font-mono text-slate-700 text-[11px] block">
                      {new Date(election.endTime * 1000).toLocaleString([], {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                </div>

                {/* Live Test Vote Tally (Starts at 0 for fresh demo) */}
                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100 text-slate-500">
                  <span>Current Test Ballots Cast:</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {election.totalVotesCast.toLocaleString('en-IN')} votes
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="pt-6 mt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                {isEligibleForVoting ? (
                  <button
                    onClick={() => onSelectElectionAndVote(election.id)}
                    className="w-full py-3 px-4 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-xs sm:text-sm shadow-xs hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Vote className="w-4 h-4" />
                    <span>{language === 'hi' ? 'मतदान केंद्र में प्रवेश करें' : 'Enter Voting Booth & Cast Ballot'}</span>
                    <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <div className="w-full flex items-center justify-between gap-2 p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
                    <span className="flex items-center gap-1.5 font-medium">
                      <Lock className="w-3.5 h-3.5 text-slate-400" />
                      {election.status === 'scheduled'
                        ? 'Voting opens at scheduled start time'
                        : election.status === 'paused'
                        ? 'Voting temporarily suspended by administration'
                        : election.status === 'concluded'
                        ? 'Election concluded'
                        : 'Draft state (Pending publication)'}
                    </span>
                    {onViewResults && (
                      <button
                        onClick={() => onViewResults(election.id)}
                        className="text-xs font-semibold text-orange-600 hover:underline cursor-pointer"
                      >
                        Tallies
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Honest Prototype Footer Note */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600 leading-relaxed">
        <p>
          <strong>Academic Research Notice:</strong> The Seeded Historical Demo Election utilizes researched candidate, party, and symbol records from the 2024 Lok Sabha General Election for demonstration purposes only. Its test vote counter starts at zero, and cast votes are stored strictly in local test records. Administrator-created elections are scheduled and controlled independently. BlockBallot is an academic prototype and is not affiliated with the live Election Commission of India.
        </p>
      </div>
    </div>
  );
};
