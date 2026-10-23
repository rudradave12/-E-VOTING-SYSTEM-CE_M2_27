import React, { useState } from 'react';
import { Election, Constituency, Candidate } from '../../types';
import { BarChart3, RotateCw, Trophy, Users, CheckCircle2, ArrowLeft } from 'lucide-react';

interface ResultsScreenProps {
  election: Election;
  constituencies: Constituency[];
  candidates: Candidate[];
  onBack: () => void;
}

export const ResultsScreen: React.FC<ResultsScreenProps> = ({
  election,
  constituencies,
  candidates,
  onBack,
}) => {
  const [selectedConstituencyId, setSelectedConstituencyId] = useState<string>('ALL');

  const filteredConstituencies =
    selectedConstituencyId === 'ALL'
      ? constituencies
      : constituencies.filter((c) => c.id === selectedConstituencyId);

  const totalRegistered = constituencies.reduce((acc, c) => acc + c.totalElectors, 0);
  const totalCast = candidates.reduce((acc, c) => acc + c.voteCount, 0);
  const turnoutPercentage = totalRegistered > 0 ? (totalCast / totalRegistered) * 100 : 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Election Portal</span>
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 uppercase tracking-widest mb-1">
            <span>Election Commission of India</span>
            <span aria-hidden="true">·</span>
            <span>Official Tally Dashboard</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Live Election Results & Constituency Breakdown
          </h1>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-2 self-start sm:self-auto bg-emerald-50 text-emerald-800 border border-emerald-200 px-3 py-1.5 rounded-lg text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span>EVM State Machine Synchronized</span>
        </div>
      </div>

      {/* Global Metrics Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block">Total Electors</span>
          <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
            {totalRegistered.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block">Total Verified Votes Cast</span>
          <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
            {totalCast.toLocaleString('en-IN')}
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block">Aggregate Turnout</span>
          <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
            {turnoutPercentage.toFixed(1)}%
          </span>
        </div>

        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block">Active Constituencies</span>
          <span className="font-mono text-lg font-bold text-slate-900 tabular-nums">
            {constituencies.length} Seats
          </span>
        </div>
      </div>

      {/* Constituency Segmented Filter Control */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
        <button
          onClick={() => setSelectedConstituencyId('ALL')}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
            selectedConstituencyId === 'ALL'
              ? 'bg-slate-900 text-white shadow-xs'
              : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
          }`}
        >
          All Constituencies ({constituencies.length})
        </button>

        {constituencies.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelectedConstituencyId(c.id)}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap cursor-pointer ${
              selectedConstituencyId === c.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            {c.name} ({c.code})
          </button>
        ))}
      </div>

      {/* Constituency Results Cards */}
      <div className="space-y-6">
        {filteredConstituencies.map((constituency) => {
          const constCandidates = candidates.filter((c) => c.constituencyId === constituency.id);
          const constTotalVotes = constCandidates.reduce((acc, c) => acc + c.voteCount, 0);

          // Find leader
          const sortedCandidates = [...constCandidates].sort((a, b) => b.voteCount - a.voteCount);
          const leader = sortedCandidates[0];

          return (
            <div key={constituency.id} className="bg-white border border-slate-200 rounded-xl p-6 shadow-xs">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-4 mb-6 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 text-xs text-slate-500 mb-0.5">
                    <span>Constituency Code: {constituency.code}</span>
                    <span aria-hidden="true">·</span>
                    <span>State: {constituency.state}</span>
                  </div>
                  <h2 className="text-xl font-bold text-slate-900">
                    {constituency.name} Parliamentary Constituency
                  </h2>
                </div>

                <div className="flex items-center gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">TOTAL VOTES</span>
                    <span className="font-mono font-bold text-slate-900">
                      {constTotalVotes.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div className="border-l border-slate-200 pl-3">
                    <span className="text-slate-400 block text-[10px]">TURNOUT</span>
                    <span className="font-mono font-bold text-slate-900">
                      {((constTotalVotes / constituency.totalElectors) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Leading Candidate Callout */}
              {leader && leader.voteCount > 0 && (
                <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-950 mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Trophy className="w-4 h-4 text-amber-600" />
                    <span>
                      Leading Candidate: <strong className="font-bold text-slate-900">{leader.name}</strong> ({leader.partyAbbreviation})
                    </span>
                  </div>
                  <span className="font-mono font-bold text-amber-900">
                    {leader.voteCount.toLocaleString('en-IN')} votes ({((leader.voteCount / constTotalVotes) * 100).toFixed(1)}%)
                  </span>
                </div>
              )}

              {/* Candidate Tallies Progress Breakdown */}
              <div className="space-y-4">
                {sortedCandidates.map((candidate, rank) => {
                  const percentage = constTotalVotes > 0 ? (candidate.voteCount / constTotalVotes) * 100 : 0;
                  const isWinner = rank === 0 && candidate.voteCount > 0;

                  return (
                    <div key={candidate.id} className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-slate-400 w-4 text-right">{rank + 1}.</span>
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: candidate.symbolColor }}
                          />
                          <span className={`font-semibold ${isWinner ? 'text-slate-950 font-bold' : 'text-slate-800'}`}>
                            {candidate.name}
                          </span>
                          <span className="text-slate-500 font-medium">({candidate.partyAbbreviation})</span>
                          {isWinner && (
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.2 rounded">
                              LEAD
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="font-mono font-bold text-slate-900 tabular-nums">
                            {candidate.voteCount.toLocaleString('en-IN')}
                          </span>
                          <span className="font-mono text-slate-500 tabular-nums w-12 text-right">
                            {percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>

                      {/* Visual Horizontal Progress Bar */}
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${percentage}%`,
                            backgroundColor: candidate.symbolColor || '#0B2545',
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Verification & Transparency Notice */}
      <div className="mt-8 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-2">
        <div className="flex items-center gap-2 font-semibold text-slate-800">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>Election Results & Privacy Architecture Clarification</span>
        </div>
        <p>
          <strong className="text-slate-700">Tally Provenance:</strong> The tallies displayed above incorporate verified ballots cast across both local simulated EVM executions and local Hardhat/Sepolia testnet smart contract instances. Simulated transactions are tagged in the audit trail as <code className="bg-slate-200/70 px-1 py-0.5 rounded text-[11px]">isSimulated: true</code> and are not represented as mainnet transactions.
        </p>
        <p>
          <strong className="text-slate-700">Pseudonymous Voting Disclosure:</strong> BlockBallot implements pseudonymous commitment-based duplicate-vote protection. The system does not claim mathematical zero-knowledge unlinkability. Elector eligibility and ballot authorization are verified server-side without transmitting the voter's candidate choice to the identity service.
        </p>
      </div>
    </div>
  );
};
