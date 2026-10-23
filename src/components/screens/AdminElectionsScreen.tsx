import React, { useState } from 'react';
import { Election, ElectionStatus } from '../../types';
import { Vote, Plus, ArrowLeft, Check, AlertCircle, Calendar, ShieldCheck, Clock, Layers } from 'lucide-react';

interface AdminElectionsScreenProps {
  elections: Election[];
  activeElectionId: string;
  onSelectElection: (id: string) => void;
  onUpdateStatus: (id: string, status: ElectionStatus) => void;
  onCreateElection: (newElection: Omit<Election, 'totalVotesCast' | 'totalVotersRegistered'>) => void;
  onBack: () => void;
}

const AVAILABLE_CONSTITUENCIES = [
  { id: 'CONST-04-ND', name: 'New Delhi (NCT of Delhi)' },
  { id: 'CONST-77-VAR', name: 'Varanasi (Uttar Pradesh)' },
  { id: 'CONST-04-WAY', name: 'Wayanad (Kerala)' },
  { id: 'CONST-26-BLR', name: 'Bangalore South (Karnataka)' },
];

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
  const [newElectionType, setNewElectionType] = useState<string>('State Legislative Assembly');
  const [newDescription, setNewDescription] = useState<string>('');

  // Default start: tomorrow morning, end: 7 days later
  const tomorrow = new Date(Date.now() + 86400 * 1000);
  tomorrow.setHours(8, 0, 0, 0);
  const nextWeek = new Date(Date.now() + 7 * 86400 * 1000);
  nextWeek.setHours(18, 0, 0, 0);

  const formatForInput = (d: Date) => d.toISOString().slice(0, 16);

  const [startTimeStr, setStartTimeStr] = useState<string>(formatForInput(tomorrow));
  const [endTimeStr, setEndTimeStr] = useState<string>(formatForInput(nextWeek));
  const [initialStatus, setInitialStatus] = useState<ElectionStatus>('draft');
  const [selectedConsts, setSelectedConsts] = useState<string[]>(['CONST-04-ND', 'CONST-77-VAR']);
  const [error, setError] = useState<string | null>(null);

  const handleToggleConst = (cId: string) => {
    setSelectedConsts((prev) =>
      prev.includes(cId) ? prev.filter((id) => id !== cId) : [...prev, cId]
    );
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!newTitle.trim()) {
      setError('Please provide an election title.');
      return;
    }

    if (selectedConsts.length === 0) {
      setError('Please select at least one participating constituency.');
      return;
    }

    const startTimestamp = Math.floor(new Date(startTimeStr).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endTimeStr).getTime() / 1000);

    if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
      setError('Please provide valid start and closing date/time values.');
      return;
    }

    if (endTimestamp <= startTimestamp) {
      setError('Voting closing deadline must be strictly after the start date and time.');
      return;
    }

    const newId = `ELEC-${Date.now().toString(36).toUpperCase()}`;
    const newNumericId = Math.floor(Math.random() * 900) + 100;

    onCreateElection({
      id: newId,
      numericId: newNumericId,
      title: newTitle.trim(),
      description: newDescription.trim() || 'Administrator-created e-voting election schedule.',
      status: initialStatus,
      startTime: startTimestamp,
      endTime: endTimestamp,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: selectedConsts,
      electionType: newElectionType,
      isDemoElection: false,
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
          <p className="text-xs text-slate-500 mt-1">
            Manage both the historical-data seeded demo election and administrator-created elections.
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer self-start sm:self-auto shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Create New Election</span>
        </button>
      </div>

      {/* Elections List */}
      <div className="space-y-4 mb-8">
        {elections.map((elec) => {
          const isActive = elec.id === activeElectionId;
          const isDemo = Boolean(elec.isDemoElection || elec.id === 'GE-2024');

          return (
            <div
              key={elec.id}
              className={`p-6 rounded-xl border transition-all ${
                isActive ? 'border-orange-500 bg-white shadow-sm ring-1 ring-orange-500' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-slate-500">ID: {elec.id} (EVM #{elec.numericId})</span>
                    <span aria-hidden="true">·</span>
                    {isDemo ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 border border-purple-200">
                        Historical Demo Election
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-cyan-100 text-cyan-800 border border-cyan-200">
                        Admin-Created Election
                      </span>
                    )}
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        elec.status === 'active'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : elec.status === 'scheduled'
                          ? 'bg-amber-100 text-amber-800 border border-amber-200'
                          : elec.status === 'paused'
                          ? 'bg-orange-100 text-orange-800 border border-orange-200'
                          : elec.status === 'concluded'
                          ? 'bg-slate-100 text-slate-700 border border-slate-200'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      Status: {elec.status}
                    </span>
                  </div>
                  <h3 className="text-lg font-bold text-slate-900">{elec.title}</h3>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <Layers className="w-3.5 h-3.5 text-slate-400" />
                    <span>Type: {elec.electionType || 'General Parliamentary Election'}</span>
                  </div>
                  <p className="text-xs text-slate-600 mt-1 max-w-xl">{elec.description}</p>
                </div>

                {/* State Machine Status Transition Buttons */}
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {elec.status === 'draft' && (
                    <>
                      <button
                        onClick={() => onUpdateStatus(elec.id, 'scheduled')}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Schedule
                      </button>
                      <button
                        onClick={() => onUpdateStatus(elec.id, 'active')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Activate Now
                      </button>
                    </>
                  )}

                  {elec.status === 'scheduled' && (
                    <>
                      <button
                        onClick={() => onUpdateStatus(elec.id, 'active')}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Activate Voting
                      </button>
                      <button
                        onClick={() => onUpdateStatus(elec.id, 'draft')}
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Back to Draft
                      </button>
                    </>
                  )}

                  {elec.status === 'active' && (
                    <>
                      <button
                        onClick={() => onUpdateStatus(elec.id, 'paused')}
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
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
                  <span className="text-slate-400 block text-[10px]">POLL START DEADLINE</span>
                  <span className="font-mono text-slate-700">
                    {new Date(elec.startTime * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">POLL CLOSING DEADLINE</span>
                  <span className="font-mono text-slate-700">
                    {new Date(elec.endTime * 1000).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">TEST BALLOTS RECORDED</span>
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
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg w-full shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Create New Administrator Election</h2>
            <p className="text-xs text-slate-500 mb-4">
              Configure election title, type, participating constituencies, and exact voting deadlines.
            </p>

            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Election Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="e.g. State Legislative Assembly General Election 2026"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Election Type <span className="text-red-500">*</span>
                </label>
                <select
                  value={newElectionType}
                  onChange={(e) => setNewElectionType(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="State Legislative Assembly">State Legislative Assembly</option>
                  <option value="Lok Sabha Parliamentary Election">Lok Sabha Parliamentary Election</option>
                  <option value="Municipal Corporation Election">Municipal Corporation Election</option>
                  <option value="Bye-Election">Constituency Bye-Election</option>
                  <option value="Academic Demonstration">Academic Demonstration Sandbox</option>
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Voting Start Date & Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={startTimeStr}
                    onChange={(e) => setStartTimeStr(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Voting Closing Deadline <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={endTimeStr}
                    onChange={(e) => setEndTimeStr(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Initial Lifecycle State
                </label>
                <select
                  value={initialStatus}
                  onChange={(e) => setInitialStatus(e.target.value as ElectionStatus)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                >
                  <option value="draft">Draft (Under Review / Not Published)</option>
                  <option value="scheduled">Scheduled (Deadlines Confirmed / Waiting for Start Window)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Participating Constituencies <span className="text-red-500">*</span>
                </label>
                <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {AVAILABLE_CONSTITUENCIES.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedConsts.includes(c.id)}
                        onChange={() => handleToggleConst(c.id)}
                        className="rounded text-orange-600 focus:ring-orange-500"
                      />
                      <span>{c.name}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Official notification details, polling booths, and rules..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={2}
                />
              </div>

              {error && (
                <div className="p-2.5 bg-red-50 border border-red-200 rounded text-xs text-red-700 flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs"
                >
                  Confirm & Create Election
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
