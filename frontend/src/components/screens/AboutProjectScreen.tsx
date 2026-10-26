/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  GraduationCap,
  Users,
  Award,
  ExternalLink,
  Github,
  Globe,
  BookOpen,
  Building2,
  FileCode,
  ShieldCheck,
  Cpu,
  Layers,
  ArrowRight,
  Database,
  Lock,
} from 'lucide-react';
import { CivicEmblem } from '../CivicEmblem';
import { NavigationScreen } from '../../types';

interface AboutProjectScreenProps {
  onNavigate?: (screen: NavigationScreen) => void;
}

export const AboutProjectScreen: React.FC<AboutProjectScreenProps> = ({ onNavigate }) => {
  const teamMembers = [
    {
      name: 'Rudra Patel',
      enrollment: '2301030400100',
      role: 'Project Contributor',
      branch: 'Computer Engineering',
    },
    {
      name: 'Rudra Dave',
      enrollment: '2301030400084',
      role: 'Project Contributor',
      branch: 'Computer Engineering',
    },
    {
      name: 'Ayush Jagtap',
      enrollment: '2301030400085',
      role: 'Project Contributor',
      branch: 'Computer Engineering',
    },
  ];

  return (
    <div className="w-full max-w-6xl mx-auto px-4 py-8 space-y-8 animate-fadeIn">
      {/* Header Banner */}
      <div className="bg-gradient-to-br from-slate-900 via-slate-850 to-slate-900 text-white rounded-2xl p-6 sm:p-10 border border-slate-800 shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-orange-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 border border-white/15 rounded-full text-xs font-medium text-orange-200">
              <GraduationCap className="w-4 h-4 text-orange-400" />
              <span>Academic Engineering Capstone · Project ID: CE_M2_27</span>
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
            <span className="text-[11px] text-slate-400 font-mono">B.Tech CE · 7th Sem</span>
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

      {/* Academic Credentials & Department Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Project Meta Information */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center gap-2.5 text-slate-900 border-b border-slate-100 pb-3">
            <Building2 className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold">Institutional Information</h2>
          </div>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs sm:text-sm">
            <div>
              <dt className="text-slate-400 text-xs">Project ID</dt>
              <dd className="font-semibold text-slate-800 font-mono">CE_M2_27</dd>
            </div>
            <div>
              <dt className="text-slate-400 text-xs">Programme</dt>
              <dd className="font-semibold text-slate-800">Bachelor of Technology (B.Tech)</dd>
            </div>
            <div>
              <dt className="text-slate-400 text-xs">Branch</dt>
              <dd className="font-semibold text-slate-800">Computer Engineering</dd>
            </div>
            <div>
              <dt className="text-slate-400 text-xs">Academic Semester</dt>
              <dd className="font-semibold text-slate-800">Semester 7</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-400 text-xs">Course Name & Code</dt>
              <dd className="font-semibold text-slate-800">
                Advanced Programming with Project-I (Course Code: 1010103494) / Minor Project
              </dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-slate-400 text-xs">Institution</dt>
              <dd className="font-semibold text-slate-800">
                College of Technology, Silver Oak University, Ahmedabad, Gujarat
              </dd>
            </div>
          </dl>
        </div>

        {/* Faculty Guide Card */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-xs space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="flex items-center gap-2.5 text-slate-900 border-b border-slate-100 pb-3">
              <Award className="w-5 h-5 text-emerald-600" />
              <h2 className="text-base font-bold">Project Faculty Guide</h2>
            </div>
            <div className="flex items-start gap-4 pt-1">
              <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-bold text-lg shrink-0">
                JK
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900">Ms. Jhankhana Koshti</h3>
                <span className="inline-block px-2.5 py-0.5 bg-emerald-100/70 text-emerald-800 rounded-md text-xs font-medium">
                  Internal Guide
                </span>
                <p className="text-xs text-slate-600 pt-1">
                  Department of Computer Engineering<br />
                  College of Technology, Silver Oak University
                </p>
              </div>
            </div>
          </div>
          <div className="pt-4 border-t border-slate-100 text-[11px] text-slate-400 italic">
            Faculty guidance and supervision under the Department of Computer Engineering for the B.Tech 7th Semester
            Capstone Evaluation.
          </div>
        </div>
      </div>

      {/* Project Team Members */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5 text-slate-900">
            <Users className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-bold">Project Team Members</h2>
          </div>
          <span className="text-xs text-slate-500 font-medium">Group ID: CE_M2_27</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {teamMembers.map((member, idx) => (
            <div
              key={member.enrollment}
              className="bg-slate-50 hover:bg-slate-100/80 transition-colors border border-slate-200 rounded-xl p-5 space-y-3 relative group"
            >
              <div className="flex items-center justify-between">
                <span className="w-8 h-8 rounded-lg bg-orange-100 text-orange-700 font-bold text-xs flex items-center justify-center">
                  0{idx + 1}
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-600">
                  {member.role}
                </span>
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">{member.name}</h3>
                <p className="text-xs text-slate-500">{member.branch}</p>
              </div>
              <div className="pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                <span className="text-slate-400">Enrollment No.</span>
                <span className="font-mono font-semibold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {member.enrollment}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Architecture & Tech Stack */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 sm:p-8 shadow-xs space-y-6">
        <div className="flex items-center gap-2.5 text-slate-900 border-b border-slate-100 pb-3">
          <Cpu className="w-5 h-5 text-indigo-600" />
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
