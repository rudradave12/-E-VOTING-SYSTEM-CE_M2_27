import React, { useState } from 'react';
import { Candidate, Constituency, Election, normalizeElectionStatus } from '../../types';
import {
  Building,
  Plus,
  ArrowLeft,
  Trash2,
  ShieldCheck,
  AlertCircle,
  Edit2,
  Lock,
  UserX,
  CheckCircle2,
  AlertTriangle,
  Info,
} from 'lucide-react';

interface AdminCandidatesScreenProps {
  constituencies: Constituency[];
  candidates: Candidate[];
  elections?: Election[];
  onAddCandidate: (candidate: Candidate) => void;
  onUpdateCandidate?: (candidateId: string, updates: Partial<Candidate>) => Promise<boolean | void> | void;
  onDeleteCandidate?: (candidateId: string) => Promise<boolean | void> | void;
  onDeactivateCandidate?: (candidateId: string, reason: string) => Promise<boolean | void> | void;
  onBack: () => void;
}

export const AdminCandidatesScreen: React.FC<AdminCandidatesScreenProps> = ({
  constituencies,
  candidates,
  elections = [],
  onAddCandidate,
  onUpdateCandidate,
  onDeleteCandidate,
  onDeactivateCandidate,
  onBack,
}) => {
  const [selectedConstituencyId, setSelectedConstituencyId] = useState<string>(
    constituencies[0]?.id || 'CONST-04-ND'
  );
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingCandidate, setEditingCandidate] = useState<Candidate | null>(null);
  const [deactivatingCandidate, setDeactivatingCandidate] = useState<Candidate | null>(null);
  const [deactivationReason, setDeactivationReason] = useState<string>('');
  const [deletingCandidate, setDeletingCandidate] = useState<Candidate | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form states for Add/Edit
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

  // Check if constituency is locked by any active/open or concluded election
  const activeOrClosedElection = elections.find((e) => {
    const norm = normalizeElectionStatus(e.status);
    const coversConst = !e.constituencyIds || e.constituencyIds.length === 0 || e.constituencyIds.includes(selectedConstituencyId);
    return coversConst && (norm === 'OPEN' || norm === 'PAUSED' || norm === 'CLOSED');
  });

  const isConstituencyLocked = Boolean(activeOrClosedElection);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setFeedback(null);

    if (isConstituencyLocked) {
      setError(
        `Cannot add candidates: Election "${activeOrClosedElection?.title}" is currently ${activeOrClosedElection?.status}. Candidate nominations are permanently locked.`
      );
      return;
    }

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
      status: 'ACTIVE',
    });

    setShowAddModal(false);
    setName('');
    setPartyName('');
    setPartyAbbreviation('');
    setFeedback({ type: 'success', message: `Candidate ${name.trim()} nominated successfully.` });
  };

  const openEdit = (c: Candidate) => {
    if (isConstituencyLocked || c.voteCount > 0) {
      setFeedback({
        type: 'error',
        message: 'Candidate details cannot be edited once voting opens or votes are recorded.',
      });
      return;
    }
    setEditingCandidate(c);
    setName(c.name);
    setPartyName(c.partyName);
    setPartyAbbreviation(c.partyAbbreviation);
    setSymbol(c.symbol);
    setSymbolColor(c.symbolColor);
    setEducation(c.education);
    setAge(c.age);
    setCriminalCases(c.criminalCases);
    setAssets(c.assets);
    setError(null);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCandidate) return;

    if (onUpdateCandidate) {
      await onUpdateCandidate(editingCandidate.id, {
        name: name.trim(),
        partyName: partyName.trim(),
        partyAbbreviation: partyAbbreviation.trim().toUpperCase() || 'IND',
        symbol: symbol.trim(),
        symbolColor,
        education: education.trim(),
        age: Number(age),
        criminalCases: Number(criminalCases),
        assets: assets.trim(),
      });
    }

    setEditingCandidate(null);
    setFeedback({ type: 'success', message: 'Candidate details updated successfully.' });
  };

  const handleDelete = async () => {
    if (!deletingCandidate) return;

    if (onDeleteCandidate) {
      await onDeleteCandidate(deletingCandidate.id);
    }

    setDeletingCandidate(null);
    setFeedback({ type: 'success', message: 'Candidate nomination removed.' });
  };

  const handleDeactivate = async () => {
    if (!deactivatingCandidate || !deactivationReason.trim()) {
      setError('Please provide a formal withdrawal reason.');
      return;
    }

    if (onDeactivateCandidate) {
      await onDeactivateCandidate(deactivatingCandidate.id, deactivationReason.trim());
    }

    setDeactivatingCandidate(null);
    setDeactivationReason('');
    setFeedback({ type: 'success', message: 'Candidate status updated to WITHDRAWN.' });
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
          <p className="text-xs text-slate-500 mt-1">
            Authoritative candidate roster. Modifications and deletions are strictly locked once an election opens or votes are recorded.
          </p>
        </div>

        <button
          onClick={() => {
            if (isConstituencyLocked) {
              setFeedback({
                type: 'error',
                message: `Nominations are locked: Election "${activeOrClosedElection?.title}" is ${activeOrClosedElection?.status}.`,
              });
              return;
            }
            setShowAddModal(true);
          }}
          disabled={isConstituencyLocked}
          className={`px-4 py-2.5 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors self-start sm:self-auto shadow-xs ${
            isConstituencyLocked
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-orange-600 hover:bg-orange-700 text-white cursor-pointer'
          }`}
        >
          <Plus className="w-4 h-4" />
          <span>Nominate New Candidate</span>
        </button>
      </div>

      {/* Feedback Alert */}
      {feedback && (
        <div
          className={`mb-6 p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : 'bg-emerald-50 border-emerald-200 text-emerald-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            ) : (
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-700 text-xs font-bold cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Locked Notice Banner */}
      {isConstituencyLocked && (
        <div className="mb-6 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs flex items-center gap-2.5 text-amber-900">
          <Lock className="w-4 h-4 text-amber-700 shrink-0" />
          <span>
            <strong>Candidate Modifications Locked:</strong> An active or concluded election (
            <em>{activeOrClosedElection?.title}</em>, status: <code>{activeOrClosedElection?.status}</code>) covers this
            constituency. Candidate nominations cannot be added, edited, or removed to preserve ballot integrity.
          </span>
        </div>
      )}

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
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse min-w-[720px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">#</th>
              <th className="py-3 px-4">Candidate & Affiliation</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Symbol</th>
              <th className="py-3 px-4">Affidavit Stats</th>
              <th className="py-3 px-4">EVM ID</th>
              <th className="py-3 px-4 text-right">Votes</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCandidates.map((candidate, idx) => {
              const isLocked = isConstituencyLocked || candidate.voteCount > 0;
              const candStatus = candidate.status || 'ACTIVE';

              return (
                <tr key={candidate.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3.5 px-4 font-mono text-slate-400">
                    {(idx + 1).toString().padStart(2, '0')}
                  </td>
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-900 block text-sm">{candidate.name}</span>
                    <span className="text-slate-500 font-medium">
                      {candidate.partyName} ({candidate.partyAbbreviation})
                    </span>
                    {candidate.deactivatedReason && (
                      <span className="text-[10px] text-red-600 block mt-0.5 italic">
                        Reason: {candidate.deactivatedReason}
                      </span>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        candStatus === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : candStatus === 'WITHDRAWN'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : 'bg-red-100 text-red-800 border border-red-200'
                      }`}
                    >
                      {candStatus}
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
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {isLocked ? (
                        <span
                          className="text-[11px] text-slate-400 flex items-center gap-1 cursor-not-allowed"
                          title="Locked by active/closed election or recorded votes"
                        >
                          <Lock className="w-3 h-3" />
                          <span>Locked</span>
                        </span>
                      ) : (
                        <>
                          <button
                            onClick={() => openEdit(candidate)}
                            className="p-1 text-slate-500 hover:text-slate-800 rounded hover:bg-slate-100 transition-colors cursor-pointer"
                            title="Edit Candidate Details"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeactivatingCandidate(candidate)}
                            className="p-1 text-amber-600 hover:text-amber-800 rounded hover:bg-amber-50 transition-colors cursor-pointer"
                            title="Withdraw Candidate"
                          >
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingCandidate(candidate)}
                            className="p-1 text-red-500 hover:text-red-700 rounded hover:bg-red-50 transition-colors cursor-pointer"
                            title="Delete Candidate"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
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

      {/* Edit Candidate Modal */}
      {editingCandidate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg w-full shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Edit Candidate Nomination Details</h2>
            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Candidate Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
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
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setEditingCandidate(null)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs cursor-pointer"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCandidate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-sm w-full shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="w-5 h-5 text-red-600 shrink-0" />
              <h2 className="text-base font-bold text-slate-900">Remove Candidate Nomination</h2>
            </div>
            <p className="text-xs text-slate-600 mb-4">
              Are you sure you want to permanently delete candidate <strong>{deletingCandidate.name}</strong> (
              {deletingCandidate.partyName}) from constituency nominations?
            </p>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletingCandidate(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="px-4 py-1.5 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Deactivate/Withdraw Candidate Modal */}
      {deactivatingCandidate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-sm w-full shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              <UserX className="w-5 h-5 text-amber-600 shrink-0" />
              <h2 className="text-base font-bold text-slate-900">Withdraw Candidate Nomination</h2>
            </div>
            <p className="text-xs text-slate-600 mb-3">
              Formally mark <strong>{deactivatingCandidate.name}</strong> as WITHDRAWN. Please record the official withdrawal justification.
            </p>
            <div className="mb-4">
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                Withdrawal Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                value={deactivationReason}
                onChange={(e) => setDeactivationReason(e.target.value)}
                placeholder="e.g. Candidate submitted formal Form 8 notice of withdrawal..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                rows={3}
                required
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setDeactivatingCandidate(null);
                  setDeactivationReason('');
                }}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeactivate}
                disabled={!deactivationReason.trim()}
                className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs"
              >
                Confirm Withdrawal
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
