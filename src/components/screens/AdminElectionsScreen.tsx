import React, { useState } from 'react';
import { Election, ElectionStatus } from '../../types';
import { Vote, Plus, ArrowLeft, Check, AlertCircle, Calendar, ShieldCheck } from 'lucide-react';

interface AdminElectionsScreenProps {
  elections: Election[];
  activeElectionId: string;
  onSelectElection: (id: string) => void;
  onUpdateStatus: (id: string, status: ElectionStatus) => void;
  onCreateElection: (newElection: Omit<Election, 'totalVotesCast' | 'totalVotersRegistered'>) => void;
  onBack: () => void;
}

export const AdminElectionsScreen: React.FC<AdminElectionsScreenProps> = ({
  elections,
  activeElectionId,
  onSelectElection,
  onUpdateStatus,
  onCreateElection,
  onBack,
}) => {
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newTitle.trim()) {
      setError('Please provide an election title.');
      return;
    }

    const newId = `ELEC-${Date.now().toString(36).toUpperCase()}`;
    const newNumericId = Math.floor(Math.random() * 900) + 100;

    onCreateElection({
      id: newId,
      numericId: newNumericId,
      title: newTitle.trim(),
      description: newDescription.trim() || 'Synthetic Parliamentary General Election.',
      status: 'draft',
      startTime: Math.floor(Date.now() / 1000) + 86400,
      endTime: Math.floor(Date.now() / 1000) + 86400 * 7,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: ['CONST-04-ND', 'CONST-77-VAR'],
    });

    setShowCreateModal(false);
    setNewTitle('');
    setNewDescription('');
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
            <span>Election Management</span>
            <span aria-hidden="true">·</span>
            <span>Lifecycle State Machine</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Elections & Voting Window Schedules
          </h1>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Election</span>
        </button>
      </div>

      {/* Elections List */}
      <div className="space-y-4 mb-8">
        {elections.map((elec) => {
          const isActive = elec.id === activeElectionId;
          return (
            <div
              key={elec.id}
              className={`p-6 rounded-xl border transition-all ${
                isActive ? 'border-orange-500 bg-white shadow-sm ring-1 ring-orange-500' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-slate-500">ID: {elec.id} (EVM #{elec.numericId})</span>
                    <span aria-hidden="true">·</span>
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        elec.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800'
                          : elec.status === 'paused'
                          ? 'bg-amber-100 text-amber-800'
                          : elec.status === 'concluded'
                          ? 'bg-slate-100 text-slate-700'
                          : 'bg-blue-100 text-blue-800'
                      }`}
                    >
                      {elec.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{elec.title}</h3>
                  <p className="text-xs text-slate-600 mt-1 max-w-xl">{elec.description}</p>
                </div>

                {/* State Machine Status Transition Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {elec.status === 'draft' && (
                    <button
                      onClick={() => onUpdateStatus(elec.id, 'active')}
                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                    >
                      Activate Poll
                    </button>
                  )}

                  {elec.status === 'active' && (
                    <>
                      <button
                        onClick={() => onUpdateStatus(elec.id, 'paused')}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Pause Voting
                      </button>
                      <button
                        onClick={() => onUpdateStatus(elec.id, 'concluded')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Conclude Poll
                      </button>
                    </>
                  )}

                  {elec.status === 'paused' && (
                    <>
                      <button
                        onClick={() => onUpdateStatus(elec.id, 'active')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Resume Voting
                      </button>
                      <button
                        onClick={() => onUpdateStatus(elec.id, 'concluded')}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Conclude Poll
                      </button>
                    </>
                  )}

                  {elec.status === 'concluded' && (
                    <span className="text-xs font-semibold text-slate-500 italic">
                      Poll Officially Concluded
                    </span>
                  )}
                </div>
              </div>

              {/* Voting window stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px]">POLL START</span>
                  <span className="font-mono text-slate-700">{new Date(elec.startTime * 1000).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">POLL END</span>
                  <span className="font-mono text-slate-700">{new Date(elec.endTime * 1000).toLocaleDateString()}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">TOTAL BALLOTS</span>
                  <span className="font-mono font-bold text-slate-900">{elec.totalVotesCast.toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">SEATS IN POLL</span>
                  <span className="font-mono text-slate-700">{elec.constituencyIds.length} Constituencies</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md w-full shadow-lg">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Create Parliamentary Election</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Election Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. 19th Lok Sabha General Election 2029"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Constitutional parliamentary election details..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={3}
                />
              </div>

              {error && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                  {error}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs cursor-pointer"
                >
                  Create Election
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
