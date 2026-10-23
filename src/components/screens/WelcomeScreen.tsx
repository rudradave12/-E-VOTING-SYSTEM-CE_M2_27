import React from 'react';
import { CivicEmblem } from '../CivicEmblem';
import { Election } from '../../types';
import { Vote, ArrowRight, ShieldCheck, CheckCircle2, BarChart2, BookOpen, Clock } from 'lucide-react';

interface WelcomeScreenProps {
  election: Election;
  onStartVoting: () => void;
  onViewResults: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  election,
  onStartVoting,
  onViewResults,
}) => {
  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
      {/* Hero Civic Presentation */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-10 shadow-xs mb-8">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6 pb-8 border-b border-slate-100">
          <div className="flex items-start gap-4">
            <CivicEmblem size={56} className="shrink-0 mt-1" />
            <div>
              <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 uppercase tracking-widest mb-1.5">
                <span>Election Commission of India</span>
                <span aria-hidden="true">·</span>
                <span>Academic Demo</span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
                {election.title}
              </h1>
              <p className="mt-2 text-sm sm:text-base text-slate-600 max-w-2xl leading-relaxed">
                National electronic voting portal powered by cryptographic EIP-712 typed authorizations and tamper-evident smart contract state machines.
              </p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row md:flex-col gap-3 w-full md:w-auto shrink-0">
            <button
              onClick={onStartVoting}
              className="px-6 py-3.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              <Vote className="w-4 h-4" />
              <span>Proceed to Cast Ballot</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              onClick={onViewResults}
              className="px-6 py-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer text-sm"
            >
              <BarChart2 className="w-4 h-4 text-slate-500" />
              <span>View Election Tallies</span>
            </button>
          </div>
        </div>

        {/* Civic Metrics Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-6 text-sm">
          <div>
            <span className="text-xs text-slate-500 block">Election Status</span>
            <span className="font-bold text-emerald-700 uppercase text-xs flex items-center gap-1.5 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
              Voting Active
            </span>
          </div>

          <div>
            <span className="text-xs text-slate-500 block">Registered Electors</span>
            <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
              {election.totalVotersRegistered.toLocaleString('en-IN')}
            </span>
          </div>

          <div>
            <span className="text-xs text-slate-500 block">Total Ballots Cast</span>
            <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
              {election.totalVotesCast.toLocaleString('en-IN')}
            </span>
          </div>

          <div>
            <span className="text-xs text-slate-500 block">Voter Turnout</span>
            <span className="font-mono text-base font-bold text-slate-900 tabular-nums">
              {((election.totalVotesCast / election.totalVotersRegistered) * 100).toFixed(1)}%
            </span>
          </div>
        </div>
      </div>

      {/* 5-Step Voting Walkthrough Guide */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs mb-8">
        <h2 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
          <BookOpen className="w-5 h-5 text-slate-700" />
          <span>Voter Verification & Balloting Process</span>
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-xs font-bold text-orange-600 block mb-1">Step 01</span>
            <h3 className="font-semibold text-slate-900 text-sm mb-1">EPIC Identification</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Enter your synthetic Elector Photo Identity Card (EPIC) number.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-xs font-bold text-orange-600 block mb-1">Step 02</span>
            <h3 className="font-semibold text-slate-900 text-sm mb-1">OTP Verification</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Verify identity using a 6-digit one-time code sent to your registered mobile.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-xs font-bold text-orange-600 block mb-1">Step 03</span>
            <h3 className="font-semibold text-slate-900 text-sm mb-1">Constituency Check</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Inspect your assigned constituency, polling station, and candidate list.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-xs font-bold text-orange-600 block mb-1">Step 04</span>
            <h3 className="font-semibold text-slate-900 text-sm mb-1">Secret Selection</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Choose your candidate. Your choice is kept secret from the identity server.
            </p>
          </div>

          <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
            <span className="text-xs font-bold text-orange-600 block mb-1">Step 05</span>
            <h3 className="font-semibold text-slate-900 text-sm mb-1">Web3 Sign & Receipt</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Authorize on-chain ballot via MetaMask or the built-in EVM simulator.
            </p>
          </div>
        </div>
      </div>

      {/* Security Architecture Box */}
      <div className="bg-slate-900 text-slate-100 rounded-xl p-6 sm:p-8">
        <div className="flex items-start gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-base font-bold text-white mb-2">
              Cryptographic Safeguards & Academic Disclosures
            </h3>
            <p className="text-xs sm:text-sm text-slate-300 leading-relaxed mb-4">
              BlockBallot implements server-issued EIP-712 voting authorizations and pseudonymous single-use nullifiers to strictly enforce one-vote-per-elector on an EVM smart contract without publishing your identity on-chain.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-xs text-slate-400 font-medium">
              <span>· Solidity 0.8.20 Smart Contract</span>
              <span>· EIP-712 Typed Signing</span>
              <span>· HMAC-SHA-256 Protected OTP</span>
              <span>· Dual-Mode MetaMask / EVM Simulator</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
