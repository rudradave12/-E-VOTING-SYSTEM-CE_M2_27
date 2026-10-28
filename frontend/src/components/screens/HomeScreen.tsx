/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Vote,
  Users,
  ArrowRight,
  HelpCircle,
  Calendar,
  CheckCircle2,
  Activity,
  Database,
  Shield,
  FileText,
  Clock,
} from 'lucide-react';
import { CivicEmblem } from '../CivicEmblem';
import { NavigationScreen, Election } from '../../types';
import { useLanguage } from '../../context/LanguageContext';

interface HomeScreenProps {
  onNavigate: (screen: NavigationScreen) => void;
  elections?: Election[];
  onStartPractice?: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({
  onNavigate,
  elections = [],
}) => {
  const { language } = useLanguage();

  const activeElections = elections.filter((e) => e.status === 'active');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-10">
      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-4 pt-2">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">
          <CivicEmblem size={20} />
          <span>
            {language === 'hi'
              ? 'डिजिटल मतदान पोर्टल · सुरक्षित एवं पारदर्शी'
              : 'Digital Voting Portal · Verifiable E-Voting'}
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          {language === 'hi'
            ? 'सुरक्षित, सत्यापन योग्य एवं पारदर्शी डिजिटल मतदान'
            : 'Verifiable Digital Voting on Blockchain'}
        </h1>

        <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
          {language === 'hi'
            ? 'वोटर आईडी द्वारा प्रमाणीकरण करें, अपने निर्वाचन क्षेत्र के उम्मीदवार का चयन करें, सुरक्षित मतपत्र जमा करें और तत्काल डिजिटल पावती प्राप्त करें।'
            : 'Authenticate with your voter ID, review candidates for your parliamentary constituency, cast a verifiable ballot, and receive an instant digital receipt.'}
        </p>

        {/* Primary Action Buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3 pt-2">
          <button
            onClick={() => onNavigate('available-elections')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            <Vote className="w-4 h-4 shrink-0" />
            <span>{language === 'hi' ? 'उपलब्ध चुनाव देखें एवं मतदान करें' : 'View Available Elections'}</span>
            <ArrowRight className="w-4 h-4 shrink-0" />
          </button>

          <button
            onClick={() => onNavigate('identify')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold text-sm shadow-2xs hover:border-slate-400 transition-all cursor-pointer"
          >
            <Users className="w-4 h-4 text-orange-600 shrink-0" />
            <span>{language === 'hi' ? 'मतदाता लॉगिन' : 'Voter Login'}</span>
          </button>

          <button
            onClick={() => onNavigate('how-it-works')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium text-sm transition-all cursor-pointer"
          >
            <HelpCircle className="w-4 h-4 text-slate-500 shrink-0" />
            <span>{language === 'hi' ? 'प्रक्रिया समझें' : 'How Voting Works'}</span>
          </button>
        </div>
      </div>

      {/* Active Elections Status or Empty State Instructions */}
      <div className="max-w-4xl mx-auto">
        {activeElections.length > 0 ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-semibold">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {activeElections.length} {activeElections.length === 1 ? 'Election Currently Active' : 'Elections Currently Active'}
                </span>
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                {activeElections[0].title}
              </h3>
              <p className="text-xs text-slate-600 max-w-xl">
                Voting is open for registered electors. Sign in with your voter ID to access your ballot.
              </p>
            </div>
            <button
              onClick={() => onNavigate('available-elections')}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <span>Go to Voting Booth</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[11px] font-semibold">
                <Clock className="w-3 h-3 text-slate-500" />
                <span>No Elections Currently Open</span>
              </div>
              <h3 className="font-bold text-slate-900 text-base">
                Scheduled & Historical Election Portal
              </h3>
              <p className="text-xs text-slate-600 max-w-xl">
                No election is currently accepting ballots. You can inspect scheduled election timetables, explore the 2024 Lok Sabha historical results archive, or sign in to register as a demo voter.
              </p>
            </div>
            <button
              onClick={() => onNavigate('elections-results')}
              className="shrink-0 inline-flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-colors cursor-pointer"
            >
              <span>Explore Election Archive</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 4 Core Workflow Cards */}
      <div className="space-y-6 pt-2">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {language === 'hi' ? 'ई-वोटिंग प्रक्रिया के मुख्य चरण' : 'How Digital Voting Works'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {language === 'hi'
              ? 'प्रमाणीकरण से लेकर डिजिटल पावती तक के सरल चरण'
              : 'Four simple steps to participate in digital elections'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Step 1: Voter Authentication */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-orange-300 transition-all space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-700 font-bold text-sm">
                1
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-700">
                  {language === 'hi' ? 'चरण 1' : 'Step 1'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {language === 'hi' ? 'मतदाता पहचान एवं सत्यापन' : 'Voter Identification & Sign In'}
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'मतदाता अपना 10-अंकों का EPIC वोटर आईडी दर्ज करता है। पात्रता की पुष्टि के बाद पंजीकृत मोबाइल पर 6-अंकों का सुरक्षित ओटीपी भेजा जाता है।'
                : 'Enter your 10-character EPIC voter ID. The system verifies eligibility and sends a secure 6-digit OTP challenge to your registered mobile number.'}
            </p>

            <div className="pt-2">
              <button
                onClick={() => onNavigate('identify')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 hover:text-orange-800 cursor-pointer"
              >
                <span>{language === 'hi' ? 'लॉगिन प्रक्रिया शुरू करें' : 'Sign In as Voter'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Step 2: Available Elections & Candidates */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-emerald-300 transition-all space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-bold text-sm">
                2
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  {language === 'hi' ? 'चरण 2' : 'Step 2'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {language === 'hi' ? 'उम्मीदवार एवं मतपत्र चयन' : 'Browse Candidates & Ballot'}
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'अपने निर्वाचन क्षेत्र के आधिकारिक उम्मीदवारों, पार्टी प्रतीकों और घोषणापत्रों की समीक्षा करें और अपना पसंदीदा विकल्प चुनें।'
                : 'View nominated candidates, party symbols, and profiles for your registered parliamentary constituency and select your preferred candidate.'}
            </p>

            <div className="pt-2">
              <button
                onClick={() => onNavigate('available-elections')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                <span>{language === 'hi' ? 'चुनाव सूची देखें' : 'View Elections'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Step 3: Cast Verifiable Vote */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-cyan-300 transition-all space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-700 font-bold text-sm">
                3
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-700">
                  {language === 'hi' ? 'चरण 3' : 'Step 3'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {language === 'hi' ? 'मतपत्र सत्यापन एवं प्रविष्टि' : 'Cast Your Verifiable Ballot'}
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'अपने मतपत्र की समीक्षा करें और पुष्टि करें। आपका वोट ब्लॉकचेन लेजर पर दर्ज किया जाता है, जहां एक मतदाता केवल एक ही मत दे सकता है।'
                : 'Review your ballot choice and submit. Your vote is recorded on an immutable ledger with double-voting prevention and replay protection.'}
            </p>

            <div className="pt-2">
              <button
                onClick={() => onNavigate('how-it-works')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700 hover:text-cyan-800 cursor-pointer"
              >
                <span>{language === 'hi' ? 'सुरक्षा विवरण पढ़ें' : 'Read Voting Guide'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Step 4: Digital Receipt & Verification */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-purple-300 transition-all space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700 font-bold text-sm">
                4
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                  {language === 'hi' ? 'चरण 4' : 'Step 4'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {language === 'hi' ? 'डिजिटल पावती एवं ऑडिट' : 'Cryptographic Vote Receipt'}
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'मतदान पूरा होते ही एक डिजिटल वोट पावती प्राप्त करें, जिसमें लेनदेन हैश, ब्लॉक संख्या और ऑडिट साक्ष्य शामिल होते हैं।'
                : 'Receive a verifiable digital vote receipt containing transaction hash, block number, and audit confirmation that your vote was tallied.'}
            </p>

            <div className="pt-2">
              <span className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{language === 'hi' ? 'अपरिवर्तनीय लेजर पर दर्ज' : 'Recorded on Immutable Ledger'}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Navigation Cards */}
      <div className="border-t border-slate-200 pt-8 max-w-4xl mx-auto">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Public Resources & Portals
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <button
            onClick={() => onNavigate('election-monitor')}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-all hover:border-slate-300 cursor-pointer space-y-1"
          >
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <Activity className="w-4 h-4 text-orange-600" />
              <span>Election Monitor</span>
            </div>
            <p className="text-slate-500 text-[11px]">Real-time turnout & audit stream</p>
          </button>

          <button
            onClick={() => onNavigate('historical-archive')}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-all hover:border-slate-300 cursor-pointer space-y-1"
          >
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <Database className="w-4 h-4 text-emerald-600" />
              <span>2024 Archive</span>
            </div>
            <p className="text-slate-500 text-[11px]">Official General Election results</p>
          </button>

          <button
            onClick={() => onNavigate('candidates-parties')}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-all hover:border-slate-300 cursor-pointer space-y-1"
          >
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <FileText className="w-4 h-4 text-blue-600" />
              <span>Candidates & Parties</span>
            </div>
            <p className="text-slate-500 text-[11px]">Candidate profiles & election symbols</p>
          </button>

          <button
            onClick={() => onNavigate('admin-login')}
            className="p-4 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-all hover:border-slate-300 cursor-pointer space-y-1"
          >
            <div className="flex items-center gap-2 text-slate-900 font-bold">
              <Shield className="w-4 h-4 text-purple-600" />
              <span>Staff & Officer Portal</span>
            </div>
            <p className="text-slate-500 text-[11px]">Election Officer & VRO administration</p>
          </button>
        </div>
      </div>
    </div>
  );
};
