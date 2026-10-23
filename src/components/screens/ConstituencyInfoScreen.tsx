/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import { HISTORICAL_CONSTITUENCIES_2024 } from '../../data/historical2024';
import { useLanguage } from '../../context/LanguageContext';
import { Search, MapPin, Users, Vote, ExternalLink, ChevronRight, Award } from 'lucide-react';

export const ConstituencyInfoScreen: React.FC = () => {
  const { t, language } = useLanguage();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedState, setSelectedState] = useState<string>('ALL');

  const states = useMemo(() => {
    return ['ALL', ...Array.from(new Set(HISTORICAL_CONSTITUENCIES_2024.map((c) => c.state)))];
  }, []);

  const filtered = useMemo(() => {
    return HISTORICAL_CONSTITUENCIES_2024.filter((c) => {
      const matchesState = selectedState === 'ALL' || c.state === selectedState;
      const q = searchQuery.toLowerCase().trim();
      if (!q) return matchesState;
      return (
        matchesState &&
        (c.name.toLowerCase().includes(q) ||
          c.code.includes(q) ||
          c.state.toLowerCase().includes(q) ||
          c.winnerName.toLowerCase().includes(q))
      );
    });
  }, [selectedState, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="rounded-2xl bg-white border border-slate-200 p-6 sm:p-8 shadow-xs space-y-2">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-xs font-bold uppercase tracking-wider">
          <MapPin className="w-3.5 h-3.5 text-emerald-600" />
          <span>Parliamentary Constituency Profiles</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
          {language === 'hi' ? 'निर्वाचन क्षेत्र विवरण एवं सांख्यिकी' : 'Constituency Information & Statistics'}
        </h1>
        <p className="text-sm text-slate-600">
          {language === 'hi'
            ? 'पंजीकृत मतदाता संख्या, मतदान प्रतिशत, मतदान केंद्र एवं आधिकारिक निर्वाचन परिणाम।'
            : 'Detailed electoral demographics, registered voters, turnout percentages, and official ECI Form 20 records.'}
        </p>
      </div>

      {/* Filter and Search */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row gap-4 items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by constituency name, code, or state..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-slate-300 text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-1">
          {states.map((st) => (
            <button
              key={st}
              onClick={() => setSelectedState(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer ${
                selectedState === st
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
              }`}
            >
              {st === 'ALL' ? 'All States' : st}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Constituencies */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((c) => {
          return (
            <div
              key={c.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs hover:shadow-xs transition-all space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-xs font-extrabold text-slate-700">
                      PC #{c.code}
                    </span>
                    <h3 className="font-bold text-lg text-slate-900 mt-1">{c.name}</h3>
                    <div className="text-xs text-slate-500">{c.state}</div>
                  </div>
                  <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-extrabold">
                    {c.turnoutPercentage}% Turnout
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs bg-slate-50 rounded-xl p-3 border border-slate-100">
                  <div>
                    <span className="text-slate-400 block text-[11px]">Registered Electors</span>
                    <span className="font-bold text-slate-900">
                      {c.totalElectors.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Votes Counted</span>
                    <span className="font-bold text-slate-900">
                      {c.votesCounted.toLocaleString('en-IN')}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Polling Stations</span>
                    <span className="font-semibold text-slate-800">{c.pollingStationsCount} stations</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">Winning Margin</span>
                    <span className="font-semibold text-emerald-700">
                      +{c.winningMargin.toLocaleString('en-IN')}
                    </span>
                  </div>
                </div>

                <div className="pt-1 text-xs">
                  <div className="text-slate-500">Declared Winner (June 4, 2024):</div>
                  <div className="font-bold text-slate-900 flex items-center gap-1.5 mt-0.5">
                    <Award className="w-3.5 h-3.5 text-emerald-600" />
                    <span>{c.winnerName}</span>
                    <span className="font-normal text-slate-500">({c.winnerParty})</span>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">{c.candidates.length} Contesting Candidates</span>
                <a
                  href={c.eciResultPdfUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-blue-600 hover:underline font-semibold"
                >
                  <span>ECI Gazette PDF</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
