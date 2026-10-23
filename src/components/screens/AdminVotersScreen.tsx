import React, { useState } from 'react';
import { VoterRecord, Constituency } from '../../types';
import { Users, ArrowLeft, ShieldAlert, ShieldCheck, RotateCcw, Plus, Check } from 'lucide-react';

interface AdminVotersScreenProps {
  voters: VoterRecord[];
  constituencies: Constituency[];
  onToggleEligibility: (voterId: string) => void;
  onResetVoterStatus: (voterId: string) => void;
  onAddVoter: (voter: VoterRecord) => void;
  onBack: () => void;
}

export const AdminVotersScreen: React.FC<AdminVotersScreenProps> = ({
  voters,
  constituencies,
  onToggleEligibility,
  onResetVoterStatus,
  onAddVoter,
  onBack,
}) => {
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [name, setName] = useState<string>('');
  const [epicId, setEpicId] = useState<string>('');
  const [constituencyId, setConstituencyId] = useState<string>(constituencies[0]?.id || 'CONST-04-ND');
  const [age, setAge] = useState<number>(30);
  const [gender, setGender] = useState<'M' | 'F' | 'O'>('M');
  const [error, setError] = useState<string | null>(null);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const formattedEpic = epicId.trim().toUpperCase();
    if (!name.trim() || !formattedEpic) {
      setError('Please provide elector name and EPIC ID.');
      return;
    }

    if (voters.some((v) => v.epicId.toUpperCase() === formattedEpic)) {
      setError('This EPIC ID already exists in the electoral roll.');
      return;
    }

    onAddVoter({
      id: `voter-${Date.now().toString(36)}`,
      epicId: formattedEpic,
      name: name.trim(),
      gender,
      age: Number(age),
      constituencyId,
      pollingStation: 'Civic Community Centre, Polling Booth 1',
      maskedMobile: '+91 ••••• •1122',
      isEligible: true,
      status: 'ELIGIBLE',
    });

    setShowAddModal(false);
    setName('');
    setEpicId('');
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
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
            <span>Electoral Roll</span>
            <span aria-hidden="true">·</span>
            <span>Synthetic Voter Registry</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Voter Registry & Participation Status
          </h1>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Add Synthetic Elector</span>
        </button>
      </div>

      {/* Voters Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">EPIC ID</th>
              <th className="py-3 px-4">Elector Name</th>
              <th className="py-3 px-4">Constituency</th>
              <th className="py-3 px-4">Eligibility</th>
              <th className="py-3 px-4">Voting State</th>
              <th className="py-3 px-4 text-right">Officer Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {voters.map((voter) => {
              const constObj = constituencies.find((c) => c.id === voter.constituencyId);
              return (
                <tr key={voter.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono font-bold text-slate-900">
                    {voter.epicId}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-semibold text-slate-900 block">{voter.name}</span>
                    <span className="text-slate-400 text-[11px]">
                      {voter.gender}, {voter.age} yrs · {voter.maskedMobile}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-700">
                    {constObj?.name} ({constObj?.code})
                  </td>
                  <td className="py-3 px-4">
                    <button
                      onClick={() => onToggleEligibility(voter.id)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase transition-colors cursor-pointer flex items-center gap-1 ${
                        voter.isEligible
                          ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                      }`}
                    >
                      {voter.isEligible ? (
                        <>
                          <ShieldCheck className="w-3 h-3 text-emerald-600" />
                          <span>Eligible</span>
                        </>
                      ) : (
                        <>
                          <ShieldAlert className="w-3 h-3 text-red-600" />
                          <span>Disqualified</span>
                        </>
                      )}
                    </button>
                  </td>
                  <td className="py-3 px-4">
                    <span
                      className={`font-semibold text-[11px] px-2 py-0.5 rounded ${
                        voter.status === 'VOTED'
                          ? 'bg-purple-100 text-purple-900 font-mono'
                          : voter.status === 'AUTHORIZED'
                          ? 'bg-amber-100 text-amber-900 font-mono'
                          : 'bg-slate-100 text-slate-700 font-mono'
                      }`}
                    >
                      {voter.status}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <button
                      onClick={() => onResetVoterStatus(voter.id)}
                      title="Reset voting status to ELIGIBLE for repeat testing"
                      className="px-2.5 py-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded text-xs font-medium inline-flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <RotateCcw className="w-3 h-3 text-slate-400" />
                      <span>Reset State</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Add Voter Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md w-full shadow-lg">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Enroll Synthetic Elector</h2>
            <form onSubmit={handleAdd} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Elector Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Meenakshi Sundaram"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Synthetic EPIC ID <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={epicId}
                  onChange={(e) => setEpicId(e.target.value)}
                  placeholder="e.g. IND-KA-889900"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 font-mono uppercase focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Constituency
                </label>
                <select
                  value={constituencyId}
                  onChange={(e) => setConstituencyId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  {constituencies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({c.code}) - {c.state}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Age
                  </label>
                  <input
                    type="number"
                    value={age}
                    onChange={(e) => setAge(Number(e.target.value))}
                    min={18}
                    max={120}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Gender
                  </label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="M">Male</option>
                    <option value="F">Female</option>
                    <option value="O">Other</option>
                  </select>
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
                  Enroll Elector
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
