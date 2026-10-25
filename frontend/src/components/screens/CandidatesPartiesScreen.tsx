/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  RECOGNIZED_PARTIES,
  HISTORICAL_CONSTITUENCIES_2024,
  HISTORICAL_PROVENANCE,
  RecognizedPartyRecord,
  HistoricalCandidateResult,
} from '../../data/historical2024';
import { OfficialPartySymbol } from '../common/OfficialPartySymbol';
import { useLanguage } from '../../context/LanguageContext';
import {
  Search,
  Filter,
  Users,
  Award,
  ExternalLink,
  ShieldCheck,
  Building,
  CheckCircle2,
  FileText,
  Layers,
} from 'lucide-react';
import {
  CandidateAffidavitModal,
  CandidateAffidavitData,
} from '../common/CandidateAffidavitModal';

export const CandidatesPartiesScreen: React.FC = () => {
  const { t, language } = useLanguage();

  const [activeTab, setActiveTab] = useState<'PARTIES' | 'CANDIDATES'>('PARTIES');
  const [partyTypeFilter, setPartyTypeFilter] = useState<'ALL' | 'NATIONAL' | 'STATE'>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [affidavitCandidate, setAffidavitCandidate] = useState<CandidateAffidavitData | null>(null);

  // Collect all unique candidates from historical constituencies
  const allCandidates = useMemo(() => {
    const list: Array<HistoricalCandidateResult & { constituencyName: string; state: string; pcCode: string }> = [];
    HISTORICAL_CONSTITUENCIES_2024.forEach((c) => {
      c.candidates.forEach((cand) => {
        list.push({
          ...cand,
          constituencyName: c.name,
          state: c.state,
          pcCode: c.code,
        });
      });
    });
    return list;
  }, []);

  // Filtered parties
  const filteredParties = useMemo(() => {
    return RECOGNIZED_PARTIES.filter((p) => {
      const matchesType = partyTypeFilter === 'ALL' || p.type === partyTypeFilter;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesType;
      const matchesText =
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.reservedSymbol.toLowerCase().includes(q);
      return matchesType && matchesText;
    });
  }, [partyTypeFilter, searchQuery]);

  // Filtered candidates
  const filteredCandidates = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return allCandidates;
    return allCandidates.filter((c) => {
      return (
        c.name.toLowerCase().includes(q) ||
        c.partyName.toLowerCase().includes(q) ||
        c.partyAbbreviation.toLowerCase().includes(q) ||
        c.constituencyName.toLowerCase().includes(q) ||
        c.state.toLowerCase().includes(q)
      );
    });
  }, [allCandidates, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Page Header */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-xs font-bold uppercase tracking-wider">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              <span>ECI Notification No. 56/2024/PPS-III</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {language === 'hi' ? 'मान्यता प्राप्त दल एवं उम्मीदवार' : 'Political Parties & Contesting Candidates'}
            </h1>
            <p className="text-sm text-slate-600">
              {language === 'hi'
                ? 'भारत निर्वाचन आयोग द्वारा मान्यता प्राप्त राष्ट्रीय एवं राज्य स्तरीय दल, आरक्षित प्रतीक एवं उम्मीदवारों के सत्यापित विवरण।'
                : 'Browse recognized National and State parties, officially gazetted reserved election symbols, and verified candidate affidavits.'}
            </p>
          </div>

          <button
            type="button"
            onClick={() => {
              setActiveTab('PARTIES');
              setSearchQuery('');
            }}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-700 hover:bg-indigo-800 text-white text-xs font-semibold transition-colors self-start sm:self-auto cursor-pointer"
            title="Inspect recognized political parties directory locally"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Recognized Parties Directory</span>
          </button>
        </div>

        {/* Tab switcher */}
        <div className="flex items-center gap-2 border-b border-slate-200 pt-4 overflow-x-auto scrollbar-none whitespace-nowrap">
          <button
            onClick={() => {
              setActiveTab('PARTIES');
              setSearchQuery('');
            }}
            className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'PARTIES'
                ? 'border-indigo-600 text-indigo-950'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {language === 'hi' ? 'मान्यता प्राप्त राजनीतिक दल' : 'Recognized Parties & Reserved Symbols'} ({filteredParties.length})
          </button>
          <button
            onClick={() => {
              setActiveTab('CANDIDATES');
              setSearchQuery('');
            }}
            className={`pb-3 text-sm font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'CANDIDATES'
                ? 'border-indigo-600 text-indigo-950'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            {language === 'hi' ? 'उम्मीदवार प्रोफाइल एवं शपथ पत्र' : 'Candidate Profiles & Affidavits'} ({filteredCandidates.length})
          </button>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={
              activeTab === 'PARTIES'
                ? 'Search party by name, code or symbol...'
                : 'Search candidate by name, party, or constituency...'
            }
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        {activeTab === 'PARTIES' && (
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Party Type:</span>
            {(['ALL', 'NATIONAL', 'STATE'] as const).map((tFilter) => (
              <button
                key={tFilter}
                onClick={() => setPartyTypeFilter(tFilter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  partyTypeFilter === tFilter
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                }`}
              >
                {tFilter === 'ALL' ? 'All' : tFilter === 'NATIONAL' ? 'National Parties' : 'State Parties'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab Content: Parties */}
      {activeTab === 'PARTIES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {filteredParties.map((party) => {
            return (
              <div
                key={party.code}
                className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs hover:shadow-xs transition-shadow space-y-4"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4">
                    <OfficialPartySymbol
                      symbolKey={party.symbolKey}
                      symbolName={party.reservedSymbol}
                      partyName={party.name}
                      partyAbbreviation={party.code}
                      verificationStatus="VERIFIED_ECI"
                      size={60}
                      showVerificationTag={true}
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-xs font-extrabold text-slate-800">
                          {party.code}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                            party.type === 'NATIONAL'
                              ? 'bg-indigo-100 text-indigo-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {party.type === 'NATIONAL' ? 'National Party' : 'State Party'}
                        </span>
                      </div>
                      <h3 className="font-bold text-base text-slate-900">
                        {language === 'hi' && party.nameHi ? party.nameHi : party.name}
                      </h3>
                      <div className="text-xs text-slate-600">
                        Reserved Symbol: <strong className="text-slate-800">{party.reservedSymbol}</strong>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
                  <div>
                    <span className="font-semibold text-slate-700">Notification Ref:</span>{' '}
                    <span className="font-mono text-[11px] text-slate-500">{party.symbolNotificationRef}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Applicable States:</span>{' '}
                    <span>{party.statesApplicable}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-slate-700">Central Office:</span>{' '}
                    <span className="text-slate-500">{party.headquarters}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Tab Content: Candidates */}
      {activeTab === 'CANDIDATES' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredCandidates.map((cand) => {
            return (
              <div
                key={cand.candidateId}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs hover:shadow-xs transition-shadow flex flex-col justify-between space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <OfficialPartySymbol
                        symbolKey={cand.symbolKey}
                        symbolName={cand.symbol}
                        partyName={cand.partyName}
                        partyAbbreviation={cand.partyAbbreviation}
                        verificationStatus={cand.isOfficialSymbolVerified ? 'VERIFIED_ECI' : 'UNAVAILABLE'}
                        size={48}
                      />
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">
                          {language === 'hi' && cand.nameHi ? cand.nameHi : cand.name}
                        </h4>
                        <div className="text-xs text-slate-600">
                          {cand.partyName} ({cand.partyAbbreviation})
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5">
                          {cand.constituencyName} (PC #{cand.pcCode}), {cand.state}
                        </div>
                      </div>
                    </div>

                    {cand.isWinner && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold uppercase shrink-0">
                        <Award className="w-3 h-3" /> Winner
                      </span>
                    )}
                  </div>

                  {cand.partyAbbreviation !== 'NOTA' && (
                    <div className="grid grid-cols-2 gap-2 text-[11px] bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <div>
                        <span className="text-slate-400 block">Education</span>
                        <span className="font-semibold text-slate-800 truncate block">{cand.education}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Declared Assets</span>
                        <span className="font-semibold text-slate-800 block">{cand.assets}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Age</span>
                        <span className="font-semibold text-slate-800 block">{cand.age} years</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block">Criminal Cases</span>
                        <span className={`font-semibold block ${cand.criminalCases > 0 ? 'text-amber-600' : 'text-slate-800'}`}>
                          {cand.criminalCases === 0 ? '0 (None)' : `${cand.criminalCases} active`}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <span className="font-extrabold text-slate-900">
                    {cand.votesCounted.toLocaleString('en-IN')} votes ({cand.votePercentage}%)
                  </span>

                  {cand.affidavitUrl && cand.partyAbbreviation !== 'NOTA' && (
                    <button
                      type="button"
                      onClick={() =>
                        setAffidavitCandidate({
                          name: cand.name,
                          nameHi: cand.nameHi,
                          partyName: cand.partyName,
                          partyAbbreviation: cand.partyAbbreviation,
                          symbol: cand.symbol,
                          symbolKey: cand.symbolKey,
                          education: cand.education,
                          age: cand.age,
                          criminalCases: cand.criminalCases,
                          assets: cand.assets,
                          affidavitUrl: cand.affidavitUrl,
                          votesCounted: cand.votesCounted,
                          votePercentage: cand.votePercentage,
                          isWinner: cand.isWinner,
                          rank: cand.rank,
                        })
                      }
                      className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold cursor-pointer text-xs"
                      title="Inspect candidate affidavit locally"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span>ECI Affidavit</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Internal Candidate Affidavit Modal */}
      <CandidateAffidavitModal
        isOpen={!!affidavitCandidate}
        onClose={() => setAffidavitCandidate(null)}
        candidate={affidavitCandidate}
      />
    </div>
  );
};
