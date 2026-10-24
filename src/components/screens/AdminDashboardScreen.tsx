import React, { useState } from 'react';
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
  LogOut,
  AlertTriangle,
  Fingerprint,
  CheckCircle,
} from 'lucide-react';

interface AdminDashboardScreenProps {
  election: Election;
  constituencies: Constituency[];
  candidates: Candidate[];
  voters: VoterRecord[];
  adminUser?: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    scope?: any;
    permissions?: string[];
  } | null;
  onUpdateElectionStatus: (newStatus: 'draft' | 'active' | 'paused' | 'concluded') => void;
  onNavigate: (screen: NavigationScreen) => void;
  onLogout?: () => void;
}

export const AdminDashboardScreen: React.FC<AdminDashboardScreenProps> = ({
  election,
  constituencies,
  candidates,
  voters,
  adminUser,
  onUpdateElectionStatus,
  onNavigate,
  onLogout,
}) => {
  const [denialNotice, setDenialNotice] = useState<string | null>(null);

  const totalVotes = candidates.reduce((acc, c) => acc + c.voteCount, 0);
  const totalElectors = constituencies.reduce((acc, c) => acc + c.totalElectors, 0);
  const aggregateTurnout = totalElectors > 0 ? (totalVotes / totalElectors) * 100 : 0;

  const role = (adminUser?.role || 'PLATFORM_ADMIN').toUpperCase();
  const isElectionOfficer = role.includes('ELECTION_OFFICER');
  const isVoterOfficer = role.includes('VOTER_REGISTRATION');
  const isPlatformAdmin = !isElectionOfficer && !isVoterOfficer;

  const permissions = adminUser?.permissions || [];
  const canManageElections = isPlatformAdmin || permissions.includes('ELECTION_CREATE') || isElectionOfficer;
  const canManageCandidates = isPlatformAdmin || permissions.includes('CANDIDATE_MANAGE') || isElectionOfficer;
  const canManageVoters = isPlatformAdmin || permissions.includes('VOTER_READ') || isVoterOfficer;

  const handleRestrictedClick = (featureName: string, requiredRole: string) => {
    setDenialNotice(
      `Access Denied: ${featureName} is restricted to ${requiredRole}. Your current account role is ${adminUser?.displayName || role}.`
    );
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Officer Identity & Role Banner */}
      <div className="bg-slate-900 text-white rounded-xl p-5 mb-8 shadow-sm border border-slate-800">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 text-orange-400 border border-orange-500/30 flex items-center justify-center shrink-0 mt-0.5">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold px-2 py-0.5 bg-orange-500/20 text-orange-300 rounded border border-orange-500/30">
                  {isElectionOfficer
                    ? 'Election Officer'
                    : isVoterOfficer
                    ? 'Voter Registration Officer'
                    : 'Platform Administrator'}
                </span>
                <span className="text-xs font-mono text-slate-400">
                  ID: {adminUser?.id || 'SYS-ADMIN-001'}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">
                {adminUser?.displayName || 'Election Commission Administrative Gateway'}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {adminUser?.email || 'officer@blockballot.gov.in'} • Assigned Simulation Scope:{' '}
                <span className="text-slate-200 font-semibold">
                  {adminUser?.scope?.constituencyIds
                    ? `Constituencies (${adminUser.scope.constituencyIds.join(', ')})`
                    : 'Nationwide (Full Demonstration System)'}
                </span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onLogout && (
              <button
                onClick={onLogout}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors border border-slate-700 cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            )}
          </div>
        </div>

        {denialNotice && (
          <div className="mt-4 p-3 bg-red-950/80 border border-red-800 rounded-lg text-xs text-red-200 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p>{denialNotice}</p>
            </div>
            <button
              onClick={() => setDenialNotice(null)}
              className="text-red-300 hover:text-white font-bold ml-2 text-xs"
            >
              Dismiss
            </button>
          </div>
        )}
      </div>

      {/* Top Header & Commission Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 pb-6 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
            <span>Commission Portal</span>
            <span aria-hidden="true">/</span>
            <span className="text-slate-900 font-bold">Control Center</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Election Commission Administration Console
          </h1>
        </div>

        {/* Status Actions */}
        <div className="flex items-center gap-2">
          {canManageElections && election.status === 'active' ? (
            <button
              onClick={() => onUpdateElectionStatus('paused')}
              className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <PauseCircle className="w-4 h-4" />
              <span>Emergency Pause Poll</span>
            </button>
          ) : canManageElections && election.status === 'paused' ? (
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
      <h2 className="text-base font-bold text-slate-900 mb-4">Commission Administrative Modules</h2>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        {/* Module 1: Election Lifecycle */}
        <button
          onClick={() => {
            if (canManageElections) {
              onNavigate('admin-elections');
            } else {
              handleRestrictedClick('Election Lifecycle Management', 'Election Officers (EO-SIM-001)');
            }
          }}
          className={`p-5 border rounded-xl text-left transition-all shadow-xs relative ${
            canManageElections
              ? 'bg-white border-slate-200 hover:border-orange-500 hover:bg-orange-50/20 cursor-pointer group'
              : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
          }`}
        >
          <div className="w-10 h-10 rounded-lg bg-orange-100 text-orange-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Vote className="w-5 h-5" />
          </div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-slate-900 text-sm">Election Lifecycle</h3>
            {!canManageElections && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">
                EO Restricted
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {canManageElections
              ? 'Configure election dates, voting window schedules, and status state transitions.'
              : 'Restricted: Voter Registration Officers are prohibited from altering election lifecycles.'}
          </p>
        </button>

        {/* Module 2: Seats & Candidates */}
        <button
          onClick={() => {
            if (canManageCandidates) {
              onNavigate('admin-candidates');
            } else {
              handleRestrictedClick('Candidate & Constituency Management', 'Election Officers (EO-SIM-001)');
            }
          }}
          className={`p-5 border rounded-xl text-left transition-all shadow-xs relative ${
            canManageCandidates
              ? 'bg-white border-slate-200 hover:border-orange-500 hover:bg-orange-50/20 cursor-pointer group'
              : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
          }`}
        >
          <div className="w-10 h-10 rounded-lg bg-blue-100 text-blue-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Building className="w-5 h-5" />
          </div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-slate-900 text-sm">Seats & Candidates</h3>
            {!canManageCandidates && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">
                EO Restricted
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {canManageCandidates
              ? 'Manage constituency quotas, candidate affidavits, party symbols, and EVM index alignment.'
              : 'Restricted: Voter Registration Officers are prohibited from managing candidates.'}
          </p>
        </button>

        {/* Module 3: Voter Roll Registry */}
        <button
          onClick={() => {
            if (canManageVoters) {
              onNavigate('admin-voters');
            } else {
              handleRestrictedClick('Voter Roll Registry', 'Voter Registration Officers (VRO-SIM-001)');
            }
          }}
          className={`p-5 border rounded-xl text-left transition-all shadow-xs relative ${
            canManageVoters
              ? 'bg-white border-slate-200 hover:border-orange-500 hover:bg-orange-50/20 cursor-pointer group'
              : 'bg-slate-100 border-slate-200 opacity-60 cursor-not-allowed'
          }`}
        >
          <div className="w-10 h-10 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Users className="w-5 h-5" />
          </div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-slate-900 text-sm">Voter Roll Registry</h3>
            {!canManageVoters && (
              <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-200 text-slate-600 rounded">
                VRO Restricted
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            {canManageVoters
              ? 'Inspect synthetic EPIC records, toggle eligibility flags, and verify registration status.'
              : 'Restricted: Election Officers are prohibited from accessing or modifying voter rolls.'}
          </p>
        </button>

        {/* Module 4: Audit Explorer */}
        <button
          onClick={() => onNavigate('admin-audit')}
          className="p-5 bg-white border border-slate-200 hover:border-orange-500 hover:bg-orange-50/20 rounded-xl text-left transition-all cursor-pointer group shadow-xs"
        >
          <div className="w-10 h-10 rounded-lg bg-slate-100 text-slate-800 flex items-center justify-center mb-3 group-hover:scale-105 transition-transform">
            <Cpu className="w-5 h-5" />
          </div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-slate-900 text-sm">Audit Trail</h3>
            <span className="text-[10px] font-bold px-1.5 py-0.5 bg-cyan-100 text-cyan-800 rounded">
              Read Only
            </span>
          </div>
          <p className="text-xs text-slate-500 leading-relaxed">
            Verify spent nullifiers, administrative audits, gas metrics, and smart contract event logs.
          </p>
        </button>
      </div>

      {/* Voter Registration Officer: Future Workflows Preview (Explicitly Unavailable in Phase 03) */}
      {isVoterOfficer && (
        <div className="bg-amber-50/60 border border-amber-200/80 rounded-xl p-5 mb-8">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
              <Fingerprint className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-amber-950">
                  Biometric Enrollment & Identity Hardware Integration
                </h4>
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 bg-amber-200/80 text-amber-900 rounded">
                  Scheduled for Phase 05
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Hardware biometric capture (fingerprint and face template processing) and physical ID exception workflows are not available in Phase 03. Backend permission identifiers (<code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">BIOMETRIC_ENROLLMENT_START</code> and <code className="bg-amber-100 px-1 py-0.5 rounded font-mono text-[10px]">VOTER_EXCEPTION_REQUEST</code>) are catalogued for future activation.
              </p>
            </div>
          </div>
        </div>
      )}

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
