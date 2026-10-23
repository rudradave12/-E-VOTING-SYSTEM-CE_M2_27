import React from 'react';
import { Election, Constituency, Candidate, VoterRecord, NavigationScreen } from '../../types';
import {
  Shield,
  Vote,
  Users,
  Building,
  Activity,
  PauseCircle,
  PlayCircle,
  FileCheck2,
  Cpu,
  BarChart3,
  ExternalLink,
} from 'lucide-react';

interface AdminDashboardScreenProps {
  election: Election;
  constituencies: Constituency[];
  candidates: Candidate[];
  voters: VoterRecord[];
  onUpdateElectionStatus: (newStatus: 'draft' | 'active' | 'paused' | 'concluded') => void;
  onNavigate: (screen: NavigationScreen) => void;
}

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({
  election,
  constituencies,
  candidates,
  voters,
  onUpdateElectionStatus,
  onNavigate,
}) => {
  const totalVotes = candidates.reduce((acc, c) => acc + c.voteCount, 0);
  const totalElectors = constituencies.reduce((acc, c) => acc + c.totalElectors, 0);
  const aggregateTurnout = totalElectors > 0 ? (totalVotes / totalElectors) * 100 : 0;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Top Header & Commission Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
            <span>Commission Portal</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-900 font-bold">Election Control Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Election Commission Administration Console
          </h1>
        </div>

        {/* Status Actions */}
        <div className="flex items-center gap-2">
          {election.status === 'active' ? (
            <button
              onClick={() => onUpdateElectionStatus('paused')}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <PauseCircle className="w-4 h-4" />
              <span>Emergency Pause Poll</span>
            </button>
          ) : election.status === 'paused' ? (
            <button
              onClick={() => onUpdateElectionStatus('active')}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <PlayCircle className="w-4 h-4" />
              <span>Resume Poll</span>
            </button>
          ) : null}

          <button
            onClick={() => onNavigate('admin-audit')}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>Audit Explorer</span>
          </button>
        </div>
      </div>

      {/* KPI Overview Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block mb-1">Election Status</span>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                election.status === 'active'
                  ? 'bg-emerald-500 animate-pulse'
                  : election.status === 'paused'
                  ? 'bg-amber-500'
                  : 'bg-slate-400'
              }`}
            />
            <span className="font-bold text-slate-900 uppercase text-sm tracking-wide">
              {election.status}
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">EVM State Machine Active</span>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block mb-1">Total Verified Turnout</span>
          <span className="font-mono text-xl font-bold text-slate-900 tabular-nums">
            {totalVotes.toLocaleString('en-IN')}
          </span>
          <span className="text-[11px] text-emerald-700 font-semibold mt-1 block">
            {aggregateTurnout.toFixed(1)}% of registered electorate
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block mb-1">Contesting Candidates</span>
          <span className="font-mono text-xl font-bold text-slate-900 tabular-nums">
            {candidates.length}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Across {constituencies.length} seats</span>
        </div>

        <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block mb-1">Verified Electors</span>
          <span className="font-mono text-xl font-bold text-slate-900 tabular-nums">
            {voters.length} Sample Profiles
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">100% Synthetic records</span>
        </div>
      </div>

      {/* Primary Administration Modules Grid */}
      <h2 className="text-base font-bold text-slate-900 mb-4">Election Management Modules</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <button
          onClick={() => onNavigate('admin-elections')}
          className="p-5 bg-white border border-slate-200 hover:border-orange-500 hover:bg-orange-50/20 rounded-xl text-left transition-all cursor-pointer group shadow-xs"
        >
          <div className="w-10 h-10 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Vote className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mb-1">Election Lifecycle</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Configure election dates, voting window schedules, and status state transitions.
          </p>
        </button>

        <button
          onClick={() => onNavigate('admin-candidates')}
          className="p-5 bg-white border border-slate-200 hover:border-orange-500 hover:bg-orange-50/20 rounded-xl text-left transition-all cursor-pointer group shadow-xs"
        >
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Building className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mb-1">Seats & Candidates</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Manage constituency quotas, candidate affidavits, party symbols, and EVM index alignment.
          </p>
        </button>

        <button
          onClick={() => onNavigate('admin-voters')}
          className="p-5 bg-white border border-slate-200 hover:border-orange-500 hover:bg-orange-50/20 rounded-xl text-left transition-all cursor-pointer group shadow-xs"
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mb-1">Voter Roll Registry</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Inspect synthetic EPIC records, toggle eligibility flags, and verify 3-stage lifecycle states.
          </p>
        </button>

        <button
          onClick={() => onNavigate('admin-audit')}
          className="p-5 bg-white border border-slate-200 hover:border-orange-500 hover:bg-orange-50/20 rounded-xl text-left transition-all cursor-pointer group shadow-xs"
        >
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="font-bold text-slate-900 text-sm mb-1">Blockchain Audit Trail</h3>
          <p className="text-xs text-slate-500 leading-relaxed">
            Verify spent nullifiers, block numbers, gas metrics, and smart contract event logs.
          </p>
        </button>
      </div>

      {/* Contract & Cryptographic Details */}
      <div className="bg-slate-900 text-slate-200 rounded-xl p-6">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
          <FileCheck2 className="w-4 h-4 text-emerald-400" />
          Active Smart Contract Invariants (Solidity 0.8.20)
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs font-mono">
          <div className="bg-slate-800/80 p-3 rounded border border-slate-700">
            <span className="text-slate-400 block text-[10px]">CONTRACT ADDRESS</span>
            <span className="text-slate-200 break-all">{election.contractAddress}</span>
          </div>

          <div className="bg-slate-800/80 p-3 rounded border border-slate-700">
            <span className="text-slate-400 block text-[10px]">EIP-712 DOMAIN</span>
            <span className="text-slate-200">BlockBallot v1 (Chain ID 31337/11155111)</span>
          </div>

          <div className="bg-slate-800/80 p-3 rounded border border-slate-700">
            <span className="text-slate-400 block text-[10px]">OPERATOR PRIVACY BOUNDARY</span>
            <span className="text-amber-400 font-sans text-xs">Pseudonymous nullifiers; no ZK unlinkability</span>
          </div>
        </div>
      </div>
    </div>
  );
};
