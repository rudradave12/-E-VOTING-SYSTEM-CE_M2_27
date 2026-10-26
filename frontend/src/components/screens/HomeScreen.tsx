/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  Shield,
  Vote,
  Users,
  KeyRound,
  FileCheck2,
  ArrowRight,
  Sparkles,
  Lock,
  Layers,
  HelpCircle,
  AlertTriangle,
  Info,
  Calendar,
  CheckCircle2,
} from 'lucide-react';
import { CivicEmblem } from '../CivicEmblem';
import { AcademicSimulationNotice } from '../common/AcademicSimulationNotice';
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
  onStartPractice,
}) => {
  const { language } = useLanguage();

  const activeElections = elections.filter((e) => e.status === 'active');
  const demoElection = elections.find((e) => e.isDemoElection || e.id === 'GE-2024');

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Non-Affiliation Academic Disclaimer */}
      <AcademicSimulationNotice variant="card" />

      {/* Hero Section */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">
          <CivicEmblem size={20} />
          <span>
            {language === 'hi'
              ? 'सत्यापन योग्य इलेक्ट्रॉनिक मतदान अनुसंधान प्रोटोटाइप'
              : 'Verifiable Blockchain E-Voting Academic Prototype'}
          </span>
        </div>

        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          {language === 'hi'
            ? 'सुरक्षित, सत्यापन योग्य एवं पारदर्शी डिजिटल मतदान'
            : 'Verifiable Digital Voting on Blockchain'}
        </h1>

        <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto">
          {language === 'hi'
            ? 'पात्र मतदाता प्रमाणीकरण, निर्वाचन चयन, ब्लॉकचेन मतपत्र प्रविष्टि एवं तत्काल क्रिप्टोग्राफिक पावती के लिए तैयार किया गया ई-वोटिंग पोर्टल।'
            : 'An e-voting portal enabling test voters to authenticate with synthetic EPIC credentials, cast one verifiable vote on an EVM ledger, and receive a cryptographic receipt.'}
        </p>

        {/* Primary Action Buttons */}
        <div className="flex flex-col sm:flex-row flex-wrap items-center justify-center gap-3.5 pt-3">
          <button
            onClick={() => onNavigate('available-elections')}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            <Vote className="w-4 h-4 shrink-0" />
            <span>{language === 'hi' ? 'उपलब्ध चुनाव देखें एवं मतदान करें' : 'Vote / Available Elections'}</span>
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

      {/* The 4 Core Workflow Answers */}
      <div className="space-y-6 pt-4">
        <div className="text-center max-w-xl mx-auto">
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            {language === 'hi' ? 'ई-वोटिंग प्रणाली की मुख्य कार्यप्रणाली' : 'How the BlockBallot Portal Works'}
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {language === 'hi'
              ? 'प्रमाणीकरण से लेकर ब्लॉकचेन पावती तक के चार मुख्य चरण'
              : 'Answers to the essential voter and administrator workflows'}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Question 1: How does a voter log in? */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-orange-300 transition-all space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-700 font-bold">
                1
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-orange-700">
                  {language === 'hi' ? 'प्रश्न 1' : 'Question 1'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {language === 'hi' ? 'मतदाता लॉगिन कैसे करता है?' : 'How does a voter log in?'}
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'मतदाता अपना 10-अंकों का EPIC वोटर आईडी दर्ज करता है। सर्वर सिंथेटिक मतदाता सूची से पात्रता की पुष्टि करता है और पंजीकृत मोबाइल पर 6-अंकों का ओटीपी भेजता है। ओटीपी सत्यापन के बाद सुरक्षित सत्र सक्रिय होता है।'
                : 'The voter enters their 10-character EPIC ID. The server verifies eligibility against synthetic test elector records and issues a 6-digit OTP challenge to the registered mobile. Upon OTP verification, an authenticated voter session is established.'}
            </p>

            <div className="pt-2">
              <button
                onClick={() => onNavigate('identify')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-orange-700 hover:text-orange-800 cursor-pointer"
              >
                <span>{language === 'hi' ? 'लॉगिन प्रक्रिया शुरू करें' : 'Start Voter Authentication'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Question 2: Which elections are available? */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-emerald-300 transition-all space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700 font-bold">
                2
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700">
                  {language === 'hi' ? 'प्रश्न 2' : 'Question 2'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {language === 'hi' ? 'कौन से चुनाव उपलब्ध हैं?' : 'Which elections are available?'}
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'दो अलग-अलग चुनाव परिदृश्य उपलब्ध हैं: (A) 2024 लोकसभा के शोधित उम्मीदवारों पर आधारित ऐतिहासिक डेमो चुनाव (शून्य से प्रारंभ), और (B) प्रशासनिक अधिकारियों द्वारा समय-सीमा एवं निर्वाचन क्षेत्रों के साथ बनाए गए चुनाव।'
                : 'Two separate election scenarios exist: (A) A Seeded 2024 Lok Sabha Demo Election with researched candidates and symbols starting at zero test votes, and (B) Administrator-Created Elections configured with independent schedules and constituency lists.'}
            </p>

            <div className="pt-2">
              <button
                onClick={() => onNavigate('available-elections')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-800 cursor-pointer"
              >
                <span>{language === 'hi' ? 'उपलब्ध चुनाव सूची देखें' : 'Browse Available Elections'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Question 3: How does the voter cast a ballot? */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-cyan-300 transition-all space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-100 flex items-center justify-center text-cyan-700 font-bold">
                3
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-cyan-700">
                  {language === 'hi' ? 'प्रश्न 3' : 'Question 3'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {language === 'hi' ? 'मतदाता मतपत्र कैसे डालता है?' : 'How does a voter cast a ballot?'}
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'मतदाता अपने निर्वाचन क्षेत्र के उम्मीदवारों में से एक का चयन करता है। चयन की समीक्षा के बाद, शैक्षणिक टेस्टनेट हस्ताक्षरकर्ता अथवा मेटामास्क वॉलेट द्वारा EIP-712 प्राधिकृत लेनदेन स्मार्ट अनुबंध में दर्ज किया जाता है।'
                : 'The voter views nominated candidates for their registered constituency, reviews their selection, completes wallet authorization (via Academic Testnet Signer or MetaMask), and submits the EIP-712 signed transaction to the smart contract.'}
            </p>

            <div className="pt-2">
              <button
                onClick={() => onNavigate('how-it-works')}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-cyan-700 hover:text-cyan-800 cursor-pointer"
              >
                <span>{language === 'hi' ? 'विस्तृत चरण देखें' : 'View Voting Steps'}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Question 4: How does the voter receive confirmation? */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-purple-300 transition-all space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center text-purple-700 font-bold">
                4
              </div>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-purple-700">
                  {language === 'hi' ? 'प्रश्न 4' : 'Question 4'}
                </span>
                <h3 className="text-base sm:text-lg font-bold text-slate-900">
                  {language === 'hi' ? 'मतदाता को पुष्टि कैसे प्राप्त होती है?' : 'How does a voter receive confirmation?'}
                </h3>
              </div>
            </div>

            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'ब्लॉकचेन लेनदेन पूरा होते ही सिस्टम एक डिजिटल वोट पावती (Receipt) प्रदान करता है, जिसमें लेनदेन हैश, ब्लॉक संख्या, छद्म नलीफायर और अपरिवर्तनीय ऑडिट साक्ष्य शामिल होते हैं।'
                : 'Upon successful block confirmation, the voter receives an immutable Cryptographic Vote Receipt containing the transaction hash, block number, pseudonymous nullifier, and verifiable audit log confirmation.'}
            </p>

            <div className="pt-2">
              <span className="text-xs font-semibold text-purple-700 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{language === 'hi' ? 'पुनरावृत्ति रोकथाम सुरक्षित' : 'Cryptographic Nonce & Replay Protected'}</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Honest Privacy & Calldata Transparency Notice */}
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-2">
        <h4 className="font-bold text-sm text-slate-900 flex items-center gap-2">
          <Info className="w-4 h-4 text-slate-600" />
          <span>Academic Security Architecture & Privacy Disclosure</span>
        </h4>
        <p className="text-xs text-slate-600 leading-relaxed">
          In this academic prototype, voter personal identity (EPIC ID, phone number, name) is kept strictly off-chain using cryptographically derived nullifiers to prevent duplicate voting. However, on public EVM blockchains, smart contract function arguments (candidate choice and constituency ID) are contained in transaction calldata and receipt logs. Therefore, this prototype does not guarantee cryptographic ballot secrecy (such as through zero-knowledge proofs) and is not legally approved for official Indian elections.
        </p>
      </div>

      {/* Secondary Research & Administrative Links */}
      <div className="border-t border-slate-200 pt-8">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Secondary Research & Academic Reference Resources
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <button
            onClick={() => onNavigate('elections-results')}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors cursor-pointer"
          >
            <span className="font-bold text-slate-900 block mb-0.5">2024 Historical Archive</span>
            <span className="text-slate-500 text-[11px]">Official immutable election figures</span>
          </button>

          <button
            onClick={() => onNavigate('candidates-parties')}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors cursor-pointer"
          >
            <span className="font-bold text-slate-900 block mb-0.5">Candidate Directory</span>
            <span className="text-slate-500 text-[11px]">Researched symbols & profiles</span>
          </button>

          <button
            onClick={() => onNavigate('preference-poll')}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors cursor-pointer"
          >
            <span className="font-bold text-slate-900 block mb-0.5">Preference Opinion Poll</span>
            <span className="text-slate-500 text-[11px]">Independent, non-binding survey</span>
          </button>

          <button
            onClick={() => onNavigate('admin-login')}
            className="p-3 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-left transition-colors cursor-pointer"
          >
            <span className="font-bold text-slate-900 block mb-0.5">Officer Console</span>
            <span className="text-slate-500 text-[11px]">Election lifecycle & deadlines</span>
          </button>
        </div>
      </div>
    </div>
  );
};
