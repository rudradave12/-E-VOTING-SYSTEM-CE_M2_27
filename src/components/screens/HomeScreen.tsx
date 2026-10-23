/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Shield, Vote, BarChart3, HelpCircle, Users, MapPin, ArrowRight, Lock, CheckCircle2, AlertTriangle, BookOpen } from 'lucide-react';
import { CivicEmblem } from '../CivicEmblem';
import { NavigationScreen } from '../../types';
import { HISTORICAL_PROVENANCE } from '../../data/historical2024';
import { useLanguage } from '../../context/LanguageContext';

interface HomeScreenProps {
  onNavigate: (screen: NavigationScreen) => void;
  onStartPractice: () => void;
}

export const HomeScreen: React.FC<HomeScreenProps> = ({ onNavigate, onStartPractice }) => {
  const { t, language } = useLanguage();

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-12">
      {/* Official Non-Endorsement Notice Banner */}
      <div className="rounded-xl border border-amber-300 bg-amber-50/90 p-4 sm:p-5 text-amber-900 shadow-2xs">
        <div className="flex items-start gap-3.5">
          <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
          <div className="text-xs sm:text-sm space-y-1 leading-relaxed">
            <p className="font-semibold text-amber-950">
              {language === 'hi' ? 'महत्वपूर्ण शैक्षणिक सूचना एवं अस्वीकरण' : 'Academic Research Notice & Civic Disclaimer'}
            </p>
            <p className="text-amber-800">
              {HISTORICAL_PROVENANCE.nonEndorsementNotice}
            </p>
            <p className="text-amber-800 text-[11px] sm:text-xs pt-1">
              {language === 'hi'
                ? 'सभी 2024 लोकसभा चुनाव के आंकड़े, परिणाम, राजनीतिक दल और प्रतीक भारत निर्वाचन आयोग (ECI) की आधिकारिक सार्वजनिक अधिसूचनाओं (जैसे अधिसूचना संख्या 56/2024/PPS-III) और data.gov.in से केवल शैक्षणिक संदर्भ हेतु लिए गए हैं।'
                : 'All 2024 Lok Sabha election figures, candidate lists, and election symbols are referenced directly from public gazettes published by the Election Commission of India (ECI Notification No. 56/2024/PPS-III) and Open Government Data (data.gov.in) for research purposes.'}
            </p>
          </div>
        </div>
      </div>

      {/* Hero Civic Header */}
      <div className="text-center max-w-3xl mx-auto space-y-4">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold">
          <CivicEmblem size={20} />
          <span>{t.portalTitle} · {language === 'hi' ? 'सत्यापन योग्य इलेक्ट्रॉनिक मतदान अनुसंधान' : 'Verifiable Civic E-Voting Prototype'}</span>
        </div>
        <h1 className="text-3xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          {language === 'hi'
            ? 'पारदर्शी, गुप्त एवं सत्यापन योग्य डिजिटल मतदान'
            : 'Transparent, Secret & Verifiable Digital Voting'}
        </h1>
        <p className="text-base sm:text-lg text-slate-600 leading-relaxed">
          {language === 'hi'
            ? 'भारतीय लोकतांत्रिक प्रक्रिया के लिए अभिकल्पित एक शैक्षणिक अनुसंधान मंच। 2024 के आम चुनाव के आधिकारिक ऐतिहासिक आंकड़े देखें या सिंथेटिक पहचान के साथ अभ्यास मतदान करें।'
            : 'An academic research prototype designed for Indian civic elections. Explore verified historical records of the 2024 Lok Sabha General Election or try our cryptographic practice voting sandbox.'}
        </p>

        {/* Primary Call to Actions */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <button
            onClick={onStartPractice}
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm shadow-md hover:shadow-lg transition-all cursor-pointer"
          >
            <Vote className="w-4 h-4" />
            <span>{t.tryPracticeMode}</span>
            <ArrowRight className="w-4 h-4 ml-1" />
          </button>

          <button
            onClick={() => onNavigate('elections-results')}
            className="flex items-center gap-2 px-6 py-3.5 rounded-xl bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold text-sm shadow-2xs hover:border-slate-400 transition-all cursor-pointer"
          >
            <BarChart3 className="w-4 h-4 text-emerald-600" />
            <span>{language === 'hi' ? '2024 चुनाव परिणाम देखें' : 'Explore 2024 Election Archive'}</span>
          </button>
        </div>
      </div>

      {/* 3 Core Service Context Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
        {/* Context 1: Historical Archive */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-emerald-300 hover:shadow-sm transition-all flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-700">
              <BarChart3 className="w-6 h-6" />
            </div>
            <div className="inline-block px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-bold uppercase tracking-wider">
              {language === 'hi' ? 'ऐतिहासिक अभिलेखागार' : 'Official Historical Archive'}
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              {language === 'hi' ? '18वीं लोकसभा चुनाव 2024' : '18th Lok Sabha 2024'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'आधिकारिक ईसीआई परिणामों, निर्वाचन क्षेत्रों, उम्मीदवारों के मतों, जीत के अंतर और शपथ-पत्रों की पूर्ण साक्ष्य-युक्त समीक्षा करें।'
                : 'Browse verified official election results, candidate vote counts, victory margins, declared assets, and gazette party symbols.'}
            </p>
          </div>
          <div className="pt-6">
            <button
              onClick={() => onNavigate('elections-results')}
              className="w-full flex items-center justify-between text-xs font-semibold text-emerald-700 hover:text-emerald-800 group cursor-pointer"
            >
              <span>{language === 'hi' ? 'परिणाम एवं आंकड़े देखें' : 'View Constituencies & Results'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Context 2: Practice Voting Sandbox */}
        <div className="rounded-2xl border border-orange-200 bg-linear-to-b from-orange-50/50 to-white p-6 shadow-xs hover:border-orange-300 hover:shadow-sm transition-all flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-orange-100/80 border border-orange-200 flex items-center justify-center text-orange-700">
              <Vote className="w-6 h-6" />
            </div>
            <div className="inline-block px-2.5 py-0.5 rounded-md bg-orange-100 text-orange-800 text-[11px] font-bold uppercase tracking-wider">
              {language === 'hi' ? 'अभ्यास सैंडबॉक्स' : 'Interactive Sandbox'}
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              {language === 'hi' ? 'नागरिक अभ्यास मतदान' : 'Practice Voting Sandbox'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'सिंथेटिक डेमो पहचान के साथ इलेक्ट्रॉनिक मतपत्र प्रक्रिया, गोपनीयता सुरक्षा एवं डिजिटल पावती का सुरक्षित परीक्षण करें।'
                : 'Experience the voter journey using synthetic test personas. Practice candidate selection, verification, and receipt retrieval safely.'}
            </p>
          </div>
          <div className="pt-6">
            <button
              onClick={onStartPractice}
              className="w-full flex items-center justify-between text-xs font-semibold text-orange-700 hover:text-orange-800 group cursor-pointer"
            >
              <span>{language === 'hi' ? 'अभ्यास मतदान शुरू करें' : 'Start Practice Session'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>

        {/* Context 3: How It Works & Architecture */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs hover:border-blue-300 hover:shadow-sm transition-all flex flex-col justify-between">
          <div className="space-y-3">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-700">
              <Shield className="w-6 h-6" />
            </div>
            <div className="inline-block px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-700 text-[11px] font-bold uppercase tracking-wider">
              {language === 'hi' ? 'पारदर्शिता एवं तकनीक' : 'Civic Integrity & Tech'}
            </div>
            <h3 className="text-lg font-bold text-slate-900">
              {language === 'hi' ? 'प्रणाली कैसे कार्य करती है?' : 'How Verifiable Voting Works'}
            </h3>
            <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
              {language === 'hi'
                ? 'जानें कि कैसे पहचान सत्यापन और गुप्त मतपत्र को अलग रखा जाता है, और एकल-उपयोग टोकन दोहरे मतदान को रोकते हैं।'
                : 'Understand how voter identity is separated from vote content, and how cryptographic tokens guarantee 1 person = 1 vote.'}
            </p>
          </div>
          <div className="pt-6">
            <button
              onClick={() => onNavigate('how-it-works')}
              className="w-full flex items-center justify-between text-xs font-semibold text-blue-700 hover:text-blue-800 group cursor-pointer"
            >
              <span>{language === 'hi' ? 'सिद्धांत एवं विनिर्देश पढ़ें' : 'Read Civic Architecture'}</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        </div>
      </div>

      {/* 2024 Election Key Indicators Banner */}
      <div className="rounded-2xl bg-slate-900 text-white p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <span className="text-orange-400 text-xs font-bold uppercase tracking-wider">
              {language === 'hi' ? 'आधिकारिक आंकड़े' : 'Official Election Statistics'}
            </span>
            <h2 className="text-xl sm:text-2xl font-bold text-white mt-1">
              {HISTORICAL_PROVENANCE.electionName}
            </h2>
          </div>
          <div className="text-xs text-slate-400 flex items-center gap-2">
            <span>ECI Counting Date: 04 June 2024</span>
            <span>·</span>
            <span className="text-emerald-400 font-semibold">ECI Verified</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 text-center sm:text-left">
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">543</div>
            <div className="text-xs text-slate-400 mt-1">
              {language === 'hi' ? 'संसदीय निर्वाचन क्षेत्र' : 'Parliamentary Seats'}
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-orange-400">~968M</div>
            <div className="text-xs text-slate-400 mt-1">
              {language === 'hi' ? 'कुल पंजीकृत मतदाता' : 'Registered Electors'}
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-emerald-400">65.79%</div>
            <div className="text-xs text-slate-400 mt-1">
              {language === 'hi' ? 'राष्ट्रीय मतदान प्रतिशत' : 'National Voter Turnout'}
            </div>
          </div>
          <div>
            <div className="text-2xl sm:text-3xl font-extrabold text-white">100%</div>
            <div className="text-xs text-slate-400 mt-1">
              {language === 'hi' ? 'ईसीआई राजपत्र मिलान' : 'ECI Gazette Aligned'}
            </div>
          </div>
        </div>
      </div>

      {/* Quick Navigation Links */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button
          onClick={() => onNavigate('candidates-parties')}
          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs text-left transition-all cursor-pointer space-y-1"
        >
          <Users className="w-5 h-5 text-indigo-600" />
          <div className="font-bold text-sm text-slate-900">{t.navCandidatesParties}</div>
          <p className="text-xs text-slate-500">ECI Recognized Parties & Reserved Symbols</p>
        </button>

        <button
          onClick={() => onNavigate('constituencies-info')}
          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs text-left transition-all cursor-pointer space-y-1"
        >
          <MapPin className="w-5 h-5 text-emerald-600" />
          <div className="font-bold text-sm text-slate-900">{t.navConstituencyInfo}</div>
          <p className="text-xs text-slate-500">State & Parliamentary Constituencies</p>
        </button>

        <button
          onClick={() => onNavigate('how-it-works')}
          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs text-left transition-all cursor-pointer space-y-1"
        >
          <BookOpen className="w-5 h-5 text-blue-600" />
          <div className="font-bold text-sm text-slate-900">{t.navHowItWorks}</div>
          <p className="text-xs text-slate-500">Civic Guide & Cryptography Details</p>
        </button>

        <button
          onClick={() => onNavigate('admin-login')}
          className="p-4 rounded-xl border border-slate-200 bg-white hover:border-slate-300 hover:shadow-xs text-left transition-all cursor-pointer space-y-1"
        >
          <Lock className="w-5 h-5 text-slate-600" />
          <div className="font-bold text-sm text-slate-900">{t.navStaffLogin}</div>
          <p className="text-xs text-slate-500">Election Officer Console Access</p>
        </button>
      </div>
    </div>
  );
};
