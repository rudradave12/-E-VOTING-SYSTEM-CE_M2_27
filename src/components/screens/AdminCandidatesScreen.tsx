import React, { useState } from 'react';
import { Candidate, Constituency } from '../../types';
import { Building, Plus, ArrowLeft, Trash2, ShieldCheck, AlertCircle } from 'lucide-react';

interface AdminCandidatesScreenProps {
  constituencies: Constituency[];
  candidates: Candidate[];
  onAddCandidate: (candidate: Candidate) => void;
  onBack: () => void;
}

export const AdminCandidatesScreen: React.FC<AdminCandidatesScreenProps> = ({
  constituencies,
  candidates,
  onAddCandidate,
  onBack,
}) => {
  const [selectedConstituencyId, setSelectedConstituencyId] = useState<string>(
    constituencies[0]?.id || 'CONST-04-ND'
  );
  const [showAddModal, setShowAddModal] = useState<boolean>(false);

  // Form states
  const [name, setName] = useState<string>('');
  const [partyName, setPartyName] = useState<string>('');
  const [partyAbbreviation, setPartyAbbreviation] = useState<string>('');
  const [symbol, setSymbol] = useState<string>('Hand');
  const [symbolColor, setSymbolColor] = useState<string>('#16A34A');
  const [education, setEducation] = useState<string>('Graduate');
  const [age, setAge] = useState<number>(45);
  const [criminalCases, setCriminalCases] = useState<number>(0);
  const [assets, setAssets] = useState<string>('₹2.5 Cr');
  const [error, setError] = useState<string | null>(null);

  const filteredCandidates = candidates.filter(
    (c) => c.constituencyId === selectedConstituencyId
  );
  const currentConstituency = constituencies.find((c) => c.id === selectedConstituencyId);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!name.trim() || !partyName.trim()) {
      setError('Please provide candidate name and political party.');
      return;
    }

    const newNumericId = Math.floor(Math.random() * 800) + 100;
    const newId = `CAND-${selectedConstituencyId.split('-')[1]}-${Date.now().toString(36).substring(3, 6)}`;

    // Check duplicate
    const exists = candidates.some(
      (c) => c.constituencyId === selectedConstituencyId && c.name.toLowerCase() === name.trim().toLowerCase()
    );
    if (exists) {
      setError('A candidate with this name is already nominated in this constituency.');
      return;
    }

    onAddCandidate({
      id: newId,
      numericId: newNumericId,
      constituencyId: selectedConstituencyId,
      name: name.trim(),
      partyName: partyName.trim(),
      partyAbbreviation: partyAbbreviation.trim().toUpperCase() || 'IND',
      symbol: symbol.trim(),
      symbolDescription: `${symbol.trim()} symbol registered with Returning Officer`,
      symbolSource: 'ECI Form 7A List of Contesting Candidates',
      symbolVerificationStatus: 'UNAVAILABLE',
      symbolKey: 'UNAVAILABLE',
      symbolColor,
      education: education.trim(),
      age: Number(age),
      criminalCases: Number(criminalCases),
      assets: assets.trim(),
      voteCount: 0,
    });

    setShowAddModal(false);
    setName('');
    setPartyName('');
    setPartyAbbreviation('');
  };

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
            <span>Return to Administration Console</span>
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 uppercase tracking-widest mb-1">
            <span>Nomination Registry</span>
            <span aria-hidden="true">·</span>
            <span>Parliamentary Constituencies</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Constituency & Candidate Nominations
          </h1>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Nominate New Candidate</span>
        </button>
      </div>

      {/* Constituency Filter Bar */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
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
            {c.name} ({c.code}) · {c.state}
          </button>
        ))}
      </div>

      {/* Constituency Details */}
      {currentConstituency && (
        <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl mb-6 text-xs flex flex-wrap items-center justify-between gap-4">
          <div>
            <span className="font-bold text-slate-900 block text-sm">
              Constituency #{currentConstituency.code} — {currentConstituency.name}
            </span>
            <span className="text-slate-500">
              State: {currentConstituency.state} · Registered Electors: {currentConstituency.totalElectors.toLocaleString('en-IN')}
            </span>
          </div>

          <div className="text-right">
            <span className="text-slate-500 block">Nominated Candidates</span>
            <span className="font-mono font-bold text-slate-900">{filteredCandidates.length} Contenders</span>
          </div>
        </div>
      )}

      {/* Candidates List Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">#</th>
              <th className="py-3 px-4">Candidate & Affiliation</th>
              <th className="py-3 px-4">Symbol</th>
              <th className="py-3 px-4">Affidavit Stats</th>
              <th className="py-3 px-4">EVM ID</th>
              <th className="py-3 px-4 text-right">Votes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCandidates.map((candidate, idx) => (
              <tr key={candidate.id} className="hover:bg-slate-50/70 transition-colors">
                <td className="py-3.5 px-4 font-mono text-slate-400">
                  {(idx + 1).toString().padStart(2, '0')}
                </td>
                <td className="py-3.5 px-4">
                  <span className="font-bold text-slate-900 block text-sm">{candidate.name}</span>
                  <span className="text-slate-500 font-medium">
                    {candidate.partyName} ({candidate.partyAbbreviation})
                  </span>
                </td>
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full shrink-0"
                      style={{ backgroundColor: candidate.symbolColor }}
                    />
                    <span className="font-semibold text-slate-800">{candidate.symbol}</span>
                  </div>
                </td>
                <td className="py-3.5 px-4 text-slate-600">
                  <div>Edu: {candidate.education}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
                    Age: {candidate.age} · Cases: {candidate.criminalCases} · Assets: {candidate.assets}
                  </div>
                </td>
                <td className="py-3.5 px-4 font-mono text-slate-700">
                  uint256({candidate.numericId})
                </td>
                <td className="py-3.5 px-4 font-mono font-bold text-slate-900 text-right tabular-nums">
                  {candidate.voteCount.toLocaleString('en-IN')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add Candidate Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg w-full shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-4">
              Nominate Candidate in {currentConstituency?.name}
            </h2>
            <form onSubmit={handleAdd} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Candidate Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Ramesh Chandra"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Political Party <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={partyName}
                    onChange={(e) => setPartyName(e.target.value)}
                    placeholder="e.g. Independent Democratic Front"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Party Abbreviation
                  </label>
                  <input
                    type="text"
                    value={partyAbbreviation}
                    onChange={(e) => setPartyAbbreviation(e.target.value)}
                    placeholder="e.g. IDF"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Electoral Symbol
                  </label>
                  <input
                    type="text"
                    value={symbol}
                    onChange={(e) => setSymbol(e.target.value)}
                    placeholder="e.g. Bicycle, Bow, Torch"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Education
                  </label>
                  <input
                    type="text"
                    value={education}
                    onChange={(e) => setEducation(e.target.value)}
                    placeholder="e.g. M.A., LL.B"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Age
                  </label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    min={25}
                    max={100}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Criminal Cases
                  </label>
                  <input
                    type="number"
                    value={criminalCases}
                    onChange={(e) => setCriminalCases(Number(e.target.value))}
                    min={0}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Declared Assets
                  </label>
                  <input
                    type="text"
                    value={assets}
                    onChange={(e) => setAssets(e.target.value)}
                    placeholder="₹1.2 Cr"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              {error && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs cursor-pointer"
                >
                  Register Nomination
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
