/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  ExternalLink,
  Github,
  Globe,
  BookOpen,
  FileCode,
  ShieldCheck,
  Cpu,
  Layers,
  ArrowRight,
  Database,
  Lock,
  KeyRound,
  FileText,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import { CivicEmblem } from '../CivicEmblem';
import { NavigationScreen } from '../../types';

interface AboutProjectScreenProps {
  onNavigate?: (screen: NavigationScreen) => void;
}

export const AboutProjectScreen: React.FC<AboutProjectScreenProps> = ({ onNavigate }) => {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-2xl p-6 sm:p-10 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/15 rounded-full text-xs font-medium text-orange-200">
              <ShieldCheck className="w-4 h-4 text-orange-400" />
              <span>Academic Research Prototype · Verifiable E-Voting</span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Blockchain-Based E-Voting System for Indian Political Elections with Secure Connections (BlockBallot)
            </h1>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              An academic research and engineering prototype exploring cryptographic voter identity verification,
              role-based electoral operations, EIP-712 authorization, and auditable demonstration voting workflows on an
              EVM-compatible blockchain architecture.
            </p>
          </div>

          <div className="shrink-0 bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col items-center text-center">
            <CivicEmblem size={56} className="text-white drop-shadow-md mb-2" />
            <span className="text-xs font-semibold tracking-wider uppercase text-slate-300">BlockBallot</span>
            <span className="text-[11px] text-slate-400 font-mono">Academic Prototype</span>
          </div>
        </div>
      </div>

      {/* Project Description & Purpose */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex items-center gap-2.5 text-slate-900 border-b border-slate-100 pb-3">
          <BookOpen className="w-5 h-5 text-orange-600" />
          <h2 className="text-lg font-bold tracking-tight">Project Overview & Academic Purpose</h2>
        </div>
        <p className="text-sm sm:text-base text-slate-700 leading-relaxed">
          BlockBallot is an academic research and engineering prototype exploring blockchain-based electronic voting
          workflows. The project combines a React and Vite frontend, a Node.js and Express backend, Firebase/Firestore
          persistence, and Solidity smart-contract tooling to demonstrate voter registration, role-based officer
          operations, election lifecycle management, authorization, and auditable demonstration voting workflows.
        </p>
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-xs sm:text-sm text-amber-900 flex items-start gap-3">
          <ShieldCheck className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-semibold block mb-0.5">Academic Non-Binding Demonstration Notice</span>
            The system is designed for academic evaluation and controlled, non-binding demonstrations. It is not an
            official Election Commission of India (ECI) or UIDAI service, and it is not approved for legally binding
            public elections. All voter records and elections in this demonstration use synthetic simulation datasets.
          </div>
        </div>
      </div>

      {/* Core Architectural Pillars */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-2.5 text-slate-900 border-b border-slate-100 pb-3">
          <Cpu className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold">Key Architectural Features & Security Principles</h2>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs sm:text-sm">
          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <KeyRound className="w-4 h-4 text-orange-600" />
              <span>1. EIP-712 Typed Signature Authorization</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-xs">
              Voters receive a cryptographically signed authorization ticket after verifying their synthetic identity and
              OTP. The smart contract validates this signature on-chain to authorize exactly one ballot per eligible elector.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Lock className="w-4 h-4 text-emerald-600" />
              <span>2. On-Chain Double-Voting Prevention</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-xs">
              Ballot choices are recorded on an immutable EVM smart contract ledger (<code className="font-mono text-slate-800">BlockBallot.sol</code>). A cryptographic nullifier mapping prevents duplicate ballot submissions.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>3. Role Separation & Administrative Safeguards</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-xs">
              Strict separation between Voter Registration Officers (VRO), Election Officers (EO), and Platform
              Administrators prevents unauthorized privilege escalation and ensures clean division of authority.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-bold text-slate-900">
              <Activity className="w-4 h-4 text-purple-600" />
              <span>4. Tamper-Resistant Auditing & Gazette Archive</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-xs">
              Every identity lookup, OTP dispatch, status update, and ballot authorization generates an auditable,
              timestamped log event. Official 2024 Lok Sabha election results are preserved in an isolated archive.
            </p>
          </div>
        </div>
      </div>

      {/* Architecture & Tech Stack */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-2.5 text-slate-900 border-b border-slate-100 pb-3">
          <Layers className="w-5 h-5 text-indigo-600" />
          <h2 className="text-lg font-bold">System Architecture & Verified Stack</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Layers className="w-4 h-4 text-blue-600" />
              <span>Frontend Architecture</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              React 19 single-page application bundled with Vite 8 and styled with Tailwind CSS v4. Features code-split lazy routes and responsive layout.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <FileCode className="w-4 h-4 text-emerald-600" />
              <span>Backend & Cryptography</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Node.js & Express REST API utilizing Ethers.js v6 for EIP-712 typed signature issuance, HMAC-SHA256 OTP generation, and AES-256-GCM data encryption.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Lock className="w-4 h-4 text-purple-600" />
              <span>Blockchain Layer</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Solidity 0.8.20 smart contract (<code className="font-mono text-purple-700">BlockBallot.sol</code>) with on-chain EIP-712 signature verification and double-voting prevention.
            </p>
          </div>

          <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-2">
            <div className="flex items-center gap-2 font-semibold text-slate-800">
              <Database className="w-4 h-4 text-amber-600" />
              <span>Persistence & Archives</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              Google Cloud Firestore persistence with strict security rules, backed by official ECI 2024 General Election Gazette historical datasets.
            </p>
          </div>
        </div>
      </div>

      {/* Official Project Links */}
      <div className="bg-gradient-to-r from-orange-50 via-slate-50 to-emerald-50 rounded-xl border border-slate-200 p-6 sm:p-8 space-y-4">
        <h2 className="text-base font-bold text-slate-900">Project Links & Repository Resources</h2>
        <div className="flex flex-wrap gap-4 pt-1">
          <a
            href="https://blockballot-e-voting-system.onrender.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Globe className="w-4 h-4" />
            <span>Live Demonstration URL</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </a>

          <a
            href="https://github.com/rudradave12/-E-VOTING-SYSTEM-CE_M2_27"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
          >
            <Github className="w-4 h-4" />
            <span>GitHub Source Code Repository</span>
            <ExternalLink className="w-3.5 h-3.5 opacity-80" />
          </a>

          {onNavigate && (
            <button
              onClick={() => onNavigate('welcome')}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
            >
              <span>Back to Application Home</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
