/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { SYNTHETIC_VOTERS } from '../../data/mockData';
import { VoterRecord } from '../../types';
import { useLanguage } from '../../context/LanguageContext';
import {
  Vote,
  UserCheck,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Sparkles,
  Lock,
  RotateCcw,
} from 'lucide-react';

interface PracticeVotingScreenProps {
  currentVoter: VoterRecord | null;
  onSelectPersonaAndStart: (persona: VoterRecord) => void;
  onResetPractice: () => void;
  onResumePractice?: () => void;
  isVotingInProgress?: boolean;
}

export const PracticeVotingScreen: React.FC<PracticeVotingScreenProps> = ({
  currentVoter,
  onSelectPersonaAndStart,
  onResetPractice,
  onResumePractice,
  isVotingInProgress,
}) => {
  const { t, language } = useLanguage();

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Sandbox Watermark Banner */}
      <div className="rounded-2xl border-2 border-dashed border-orange-300 bg-orange-50/80 p-5 sm:p-6 text-orange-950 shadow-2xs space-y-2">
        <div className="flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-orange-600 shrink-0" />
          <h2 className="text-base sm:text-lg font-extrabold tracking-tight">
            {t.practiceDisclaimer}
          </h2>
        </div>
        <p className="text-xs sm:text-sm text-orange-800 leading-relaxed">
          {language === 'hi'
            ? 'यह अभ्यास सैंडबॉक्स नागरिकों, छात्रों एवं शोधकर्ताओं को वास्तविक मत डाले बिना डिजिटल मतपत्र, गोपनीय सत्यापन और डिजिटल पावती की प्रक्रिया का सुरक्षित अनुभव प्रदान करता है। केवल सिंथेटिक परीक्षण पहचान का उपयोग किया जाता है।'
            : 'This practice sandbox enables citizens, students, and researchers to safely test secret digital voting, identity verification, and receipt generation. No real ballots are cast and no personal voter records are modified.'}
        </p>
      </div>

      {/* Main Header */}
      <div className="text-center max-w-2xl mx-auto space-y-2">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 text-slate-800 text-xs font-bold uppercase tracking-wider">
          <Vote className="w-3.5 h-3.5 text-orange-600" />
          <span>Interactive Voter Journey</span>
        </div>
        <h1 className="text-2xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
          {t.practiceVotingTitle}
        </h1>
        <p className="text-xs sm:text-sm text-slate-600">
          {t.practiceVotingSubtitle}
        </p>
      </div>

      {/* If in progress, show resume or restart */}
      {isVotingInProgress && currentVoter && (
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="text-xs sm:text-sm text-blue-900">
            <strong>Practice session in progress:</strong> Voting as <strong>{currentVoter.name}</strong> ({currentVoter.epicId})
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onResetPractice}
              className="px-3.5 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
              <span>Restart Session</span>
            </button>
            {onResumePractice && (
              <button
                onClick={onResumePractice}
                className="px-4 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold flex items-center gap-1 cursor-pointer"
              >
                <span>Continue Voting</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* Select Practice Voter Persona */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-orange-600" />
            <span>{t.selectSyntheticPersona}</span>
          </h3>
          <span className="text-xs text-slate-500 font-medium">
            Isolated synthetic test profiles
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {SYNTHETIC_VOTERS.map((voter) => {
            const isCurrent = currentVoter?.id === voter.id;
            return (
              <div
                key={voter.id}
                className={`rounded-2xl border p-5 bg-white transition-all flex flex-col justify-between space-y-4 ${
                  isCurrent
                    ? 'border-orange-500 ring-2 ring-orange-500/20 shadow-xs'
                    : 'border-slate-200 hover:border-slate-300 hover:shadow-2xs'
                }`}
              >
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-slate-700 px-2 py-0.5 rounded bg-slate-100">
                      {voter.epicId}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                        voter.status === 'VOTED'
                          ? 'bg-purple-100 text-purple-800'
                          : voter.isEligible
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {voter.status === 'VOTED' ? 'Voted' : voter.isEligible ? 'Eligible' : 'Ineligible'}
                    </span>
                  </div>

                  <h4 className="font-bold text-sm text-slate-900">{voter.name}</h4>
                  <p className="text-xs text-slate-500 line-clamp-1">{voter.pollingStation}</p>
                </div>

                <button
                  onClick={() => onSelectPersonaAndStart(voter)}
                  className={`w-full py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    isCurrent
                      ? 'bg-orange-600 text-white'
                      : 'bg-slate-900 hover:bg-slate-800 text-white'
                  }`}
                >
                  <span>Practice as {voter.name.split(' ')[0]}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Voter Privacy and Integrity Guarantee */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 text-xs text-slate-600 space-y-2">
        <div className="font-bold text-slate-900 flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          <span>Privacy & Simulation Integrity Standards</span>
        </div>
        <p>
          In practice mode, transactions are simulated through our local cryptographic execution engine and verified against the smart contract rules. No real funds, gas fees, or third-party web3 extensions are strictly required for ordinary civic testing.
        </p>
      </div>
    </div>
  );
};
