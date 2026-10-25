import React, { useState, useEffect } from 'react';
import { Election, ElectionStatus, normalizeElectionStatus, NormalizedElectionStatus } from '../../types';
import { voterApi } from '../../services/voterApi';
import {
  Vote,
  Plus,
  ArrowLeft,
  Check,
  AlertCircle,
  Calendar,
  ShieldCheck,
  Clock,
  Layers,
  Edit2,
  XCircle,
  RefreshCw,
  Globe,
  Lock,
  Pause,
  Play,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';

interface AdminElectionsScreenProps {
  elections: Election[];
  activeElectionId: string;
  onSelectElection: (id: string) => void;
  onUpdateStatus: (id: string, status: ElectionStatus, reason?: string) => Promise<boolean | void> | void;
  onUpdateElection?: (id: string, updates: Partial<Election>) => Promise<boolean | void> | void;
  onCreateElection: (newElection: Omit<Election, 'totalVotesCast' | 'totalVotersRegistered'>) => void;
  onBack: () => void;
}

const AVAILABLE_CONSTITUENCIES = [
  { id: 'CONST-04-ND', name: 'New Delhi (NCT of Delhi)' },
  { id: 'CONST-77-VAR', name: 'Varanasi (Uttar Pradesh)' },
  { id: 'CONST-04-WAY', name: 'Wayanad (Kerala)' },
  { id: 'CONST-26-BLR', name: 'Bangalore South (Karnataka)' },
];

const SUPPORTED_TIMEZONES = [
  { value: 'Asia/Kolkata', label: 'Asia/Kolkata (IST, UTC+05:30) — Official Default' },
  { value: 'UTC', label: 'UTC (Coordinated Universal Time)' },
  { value: 'Asia/Dubai', label: 'Asia/Dubai (GST, UTC+04:00)' },
  { value: 'Europe/London', label: 'Europe/London (GMT/BST)' },
  { value: 'America/New_York', label: 'America/New_York (EST/EDT)' },
];

export const AdminElectionsScreen: React.FC<AdminElectionsScreenProps> = ({
  elections,
  activeElectionId,
  onSelectElection,
  onUpdateStatus,
  onUpdateElection,
  onCreateElection,
  onBack,
}) => {
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [editingElection, setEditingElection] = useState<Election | null>(null);

  // Status Action Modal State
  const [actionConfirmModal, setActionConfirmModal] = useState<{
    election: Election;
    targetStatus: ElectionStatus;
    title: string;
    description: string;
    isDangerous?: boolean;
    requiresReason?: boolean;
  } | null>(null);
  const [actionReason, setActionReason] = useState<string>('');

  // Create form states
  const [newTitle, setNewTitle] = useState<string>('');
  const [newElectionType, setNewElectionType] = useState<string>('State Legislative Assembly');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newTimezone, setNewTimezone] = useState<string>('Asia/Kolkata');

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

  // Edit form states
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editStartTimeStr, setEditStartTimeStr] = useState<string>('');
  const [editEndTimeStr, setEditEndTimeStr] = useState<string>('');
  const [editTimezone, setEditTimezone] = useState<string>('Asia/Kolkata');
  const [editConsts, setEditConsts] = useState<string[]>([]);

  // Feedback states
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);
  const [reconciling, setReconciling] = useState<boolean>(false);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(Math.floor(Date.now() / 1000));

  // Informational countdown timer tick
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTimeSec(Math.floor(Date.now() / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const handleToggleConst = (cId: string) => {
    setSelectedConsts((prev) =>
      prev.includes(cId) ? prev.filter((id) => id !== cId) : [...prev, cId]
    );
  };

  const handleToggleEditConst = (cId: string) => {
    setEditConsts((prev) =>
      prev.includes(cId) ? prev.filter((id) => id !== cId) : [...prev, cId]
    );
  };

  const handleManualReconcile = async () => {
    setReconciling(true);
    setFeedback(null);
    try {
      const res = await voterApi.adminReconcileElections();
      if (res.success) {
        const transCount = res.transitions?.length || 0;
        setFeedback({
          type: 'success',
          message: `Reconciliation complete. Server time: ${res.serverTimeIso || new Date().toISOString()} (${transCount} election transitions processed).`,
        });
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'Failed to reconcile election schedules.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error reconciling schedules.',
      });
    } finally {
      setReconciling(false);
    }
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (!newTitle.trim()) {
      setFeedback({ type: 'error', message: 'Please provide an election title.' });
      return;
    }

    if (selectedConsts.length === 0) {
      setFeedback({ type: 'error', message: 'Please select at least one participating constituency.' });
      return;
    }

    const startTimestamp = Math.floor(new Date(startTimeStr).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(endTimeStr).getTime() / 1000);

    if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
      setFeedback({ type: 'error', message: 'Please provide valid start and closing date/time values.' });
      return;
    }

    if (endTimestamp <= startTimestamp) {
      setFeedback({ type: 'error', message: 'Voting closing deadline must be strictly after the start date and time.' });
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
      timezone: newTimezone,
      contractAddress: '0x5FbDB2315678afecb367f032d93F642f64180aa3',
      constituencyIds: selectedConsts,
      electionType: newElectionType,
      isDemoElection: false,
    });

    setShowCreateModal(false);
    setNewTitle('');
    setNewDescription('');
    setFeedback({ type: 'success', message: `Election ${newTitle.trim()} created successfully.` });
  };

  const openEditModal = (elec: Election) => {
    const norm = normalizeElectionStatus(elec.status);
    if (norm !== 'DRAFT' && norm !== 'SCHEDULED') {
      setFeedback({
        type: 'error',
        message: `Election configuration cannot be modified once election has reached ${norm} state.`,
      });
      return;
    }

    setEditingElection(elec);
    setEditTitle(elec.title);
    setEditDescription(elec.description || '');
    setEditStartTimeStr(formatForInput(new Date(elec.startTime * 1000)));
    setEditEndTimeStr(formatForInput(new Date(elec.endTime * 1000)));
    setEditTimezone(elec.timezone || 'Asia/Kolkata');
    setEditConsts(elec.constituencyIds || []);
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingElection) return;

    const startTimestamp = Math.floor(new Date(editStartTimeStr).getTime() / 1000);
    const endTimestamp = Math.floor(new Date(editEndTimeStr).getTime() / 1000);

    if (isNaN(startTimestamp) || isNaN(endTimestamp)) {
      setFeedback({ type: 'error', message: 'Invalid start or closing date/time values.' });
      return;
    }

    if (endTimestamp <= startTimestamp) {
      setFeedback({ type: 'error', message: 'End time must be strictly after start time.' });
      return;
    }

    if (onUpdateElection) {
      await onUpdateElection(editingElection.id, {
        title: editTitle.trim(),
        description: editDescription.trim(),
        startTime: startTimestamp,
        endTime: endTimestamp,
        timezone: editTimezone,
        constituencyIds: editConsts,
      });
    }

    setEditingElection(null);
    setFeedback({ type: 'success', message: 'Election schedule updated successfully.' });
  };

  const openStatusAction = (
    elec: Election,
    targetStatus: ElectionStatus,
    title: string,
    description: string,
    isDangerous = false,
    requiresReason = false
  ) => {
    setActionConfirmModal({
      election: elec,
      targetStatus,
      title,
      description,
      isDangerous,
      requiresReason,
    });
    setActionReason('');
  };

  const handleConfirmStatusAction = async () => {
    if (!actionConfirmModal) return;

    if (actionConfirmModal.requiresReason && !actionReason.trim()) {
      setFeedback({
        type: 'error',
        message: 'A formal cancellation justification is required.',
      });
      return;
    }

    const { election, targetStatus } = actionConfirmModal;
    const reason = actionConfirmModal.requiresReason ? actionReason.trim() : undefined;

    try {
      await onUpdateStatus(election.id, targetStatus, reason);
      setFeedback({
        type: 'success',
        message: `Election status updated to ${targetStatus}.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Error updating election status.',
      });
    } finally {
      setActionConfirmModal(null);
      setActionReason('');
    }
  };

  const renderCountdown = (elec: Election) => {
    const norm = normalizeElectionStatus(elec.status);
    const now = currentTimeSec;

    if (norm === 'CANCELLED') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-red-700 bg-red-50 px-2.5 py-1 rounded-md border border-red-200">
          <XCircle className="w-3.5 h-3.5 shrink-0" />
          <span className="font-semibold">Cancelled: {elec.cancellationReason || 'No reason provided'}</span>
        </div>
      );
    }

    if (norm === 'CLOSED') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
          <CheckCircle2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
          <span className="font-semibold">Poll Concluded (Voting Window Closed)</span>
        </div>
      );
    }

    if (norm === 'PAUSED') {
      return (
        <div className="flex items-center gap-1.5 text-xs text-orange-700 bg-orange-50 px-2.5 py-1 rounded-md border border-orange-200">
          <Pause className="w-3.5 h-3.5 shrink-0" />
          <span className="font-semibold">Voting Temporarily Paused by Returning Officer</span>
        </div>
      );
    }

    if (norm === 'SCHEDULED') {
      const diff = elec.startTime - now;
      if (diff > 0) {
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;

        return (
          <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
            <Clock className="w-3.5 h-3.5 shrink-0 animate-pulse text-amber-600" />
            <span>
              Opens in <strong className="font-mono">{days > 0 ? `${days}d ` : ''}{hours}h {minutes}m {seconds}s</strong>
            </span>
            <span className="text-[10px] text-amber-700 ml-1 hidden sm:inline">(Informational Client Estimate — Server Clock Authoritative)</span>
          </div>
        );
      } else {
        return (
          <div className="flex items-center gap-1.5 text-xs text-amber-800 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
            <Clock className="w-3.5 h-3.5 shrink-0 text-amber-600" />
            <span className="font-semibold">Scheduled Start Passed — Ready for Auto-Reconciliation</span>
          </div>
        );
      }
    }

    if (norm === 'OPEN') {
      const diff = elec.endTime - now;
      if (diff > 0) {
        const days = Math.floor(diff / 86400);
        const hours = Math.floor((diff % 86400) / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;

        return (
          <div className="flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 px-2.5 py-1 rounded-md border border-emerald-200">
            <Play className="w-3.5 h-3.5 shrink-0 text-emerald-600 fill-emerald-600" />
            <span>
              Closes in <strong className="font-mono">{days > 0 ? `${days}d ` : ''}{hours}h {minutes}m {seconds}s</strong>
            </span>
            <span className="text-[10px] text-emerald-700 ml-1 hidden sm:inline">(Informational Client Estimate — Server Clock Authoritative)</span>
          </div>
        );
      } else {
        return (
          <div className="flex items-center gap-1.5 text-xs text-slate-800 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
            <Clock className="w-3.5 h-3.5 shrink-0 text-slate-600" />
            <span className="font-semibold">Closing Deadline Reached — Awaiting Reconcile to Close</span>
          </div>
        );
      }
    }

    return (
      <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
        <Clock className="w-3.5 h-3.5 shrink-0" />
        <span>Draft Stage (Not Scheduled)</span>
      </div>
    );
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
            <span>Lifecycle State Machine & Timers</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Elections & Authoritative Voting Schedules
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Server-authoritative scheduling, Indian Standard Time (IST) support, and tamper-resistant state transitions.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={handleManualReconcile}
            disabled={reconciling}
            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer border border-slate-200 shadow-2xs"
            title="Trigger server timer reconciliation check across all elections"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${reconciling ? 'animate-spin text-orange-600' : ''}`} />
            <span>Reconcile Timers</span>
          </button>

          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Election</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`mb-6 p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
            feedback.type === 'error'
              ? 'bg-red-50 border-red-200 text-red-800'
              : feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'error' ? (
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
            ) : feedback.type === 'success' ? (
              <Check className="w-4 h-4 shrink-0 text-emerald-600" />
            ) : (
              <Globe className="w-4 h-4 shrink-0 text-blue-600" />
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

      {/* Timezone & Authoritative Clock Notice */}
      <div className="mb-6 p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs flex flex-wrap items-center justify-between gap-3 text-slate-600">
        <div className="flex items-center gap-2">
          <Globe className="w-4 h-4 text-orange-600 shrink-0" />
          <span>
            Default Authority Timezone: <strong>Asia/Kolkata (IST, UTC+05:30)</strong> · Server Clock is strictly authoritative.
          </span>
        </div>
        <div className="text-[11px] font-mono text-slate-500">
          Current Device Time: {new Date().toLocaleTimeString()} ({Intl.DateTimeFormat().resolvedOptions().timeZone})
        </div>
      </div>

      {/* Elections List */}
      <div className="space-y-4 mb-8">
        {elections.map((elec) => {
          const isActive = elec.id === activeElectionId;
          const isDemo = Boolean(elec.isDemoElection || elec.id === 'GE-2024');
          const norm = normalizeElectionStatus(elec.status);
          const isConfigLocked = norm === 'OPEN' || norm === 'PAUSED' || norm === 'CLOSED' || norm === 'CANCELLED';

          return (
            <div
              key={elec.id}
              className={`p-6 rounded-xl border transition-all ${
                isActive ? 'border-orange-500 bg-white shadow-sm ring-1 ring-orange-500' : 'border-slate-200 bg-white'
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-4 mb-4 border-b border-slate-100">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <span className="font-mono text-xs font-bold text-slate-500">
                      ID: {elec.id} (EVM #{elec.numericId})
                    </span>
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

                    {/* Standardized Status Badge */}
                    <span
                      className={`text-[10px] font-bold uppercase px-2.5 py-0.5 rounded-full ${
                        norm === 'OPEN'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : norm === 'SCHEDULED'
                          ? 'bg-amber-100 text-amber-800 border border-amber-300'
                          : norm === 'PAUSED'
                          ? 'bg-orange-100 text-orange-800 border border-orange-300'
                          : norm === 'CLOSED'
                          ? 'bg-slate-200 text-slate-800 border border-slate-300'
                          : norm === 'CANCELLED'
                          ? 'bg-red-100 text-red-800 border border-red-300'
                          : 'bg-blue-100 text-blue-800 border border-blue-200'
                      }`}
                    >
                      Status: {norm}
                    </span>

                    {isConfigLocked && (
                      <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        <Lock className="w-2.5 h-2.5 text-slate-400" />
                        <span>Config Locked</span>
                      </span>
                    )}
                  </div>

                  <h3 className="text-lg font-bold text-slate-900">{elec.title}</h3>

                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-slate-400" />
                      <span>{elec.electionType || 'General Parliamentary Election'}</span>
                    </div>
                    <span aria-hidden="true">·</span>
                    <div className="flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-400" />
                      <span>Timezone: {elec.timezone || 'Asia/Kolkata'}</span>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 mt-1 max-w-2xl">{elec.description}</p>

                  {/* Informational Live Countdown */}
                  <div className="pt-2">{renderCountdown(elec)}</div>
                </div>

                {/* State Machine Status Transition & Action Buttons */}
                <div className="flex flex-col sm:flex-row flex-wrap items-center gap-2 shrink-0">
                  {/* Select Election Button */}
                  {!isActive && (
                    <button
                      onClick={() => onSelectElection(elec.id)}
                      className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded transition-colors cursor-pointer border border-slate-200"
                    >
                      Make Active
                    </button>
                  )}

                  {/* Edit Config Button (Only when DRAFT or SCHEDULED) */}
                  {!isConfigLocked && onUpdateElection && (
                    <button
                      onClick={() => openEditModal(elec)}
                      className="px-2.5 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded transition-colors cursor-pointer border border-slate-300 flex items-center gap-1"
                      title="Edit election title, dates, or constituencies"
                    >
                      <Edit2 className="w-3 h-3 text-slate-500" />
                      <span>Edit</span>
                    </button>
                  )}

                  {/* DRAFT Transitions */}
                  {norm === 'DRAFT' && (
                    <>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'scheduled',
                            'Schedule Election',
                            'Confirm election schedule. The server scheduler will automatically activate this election when authoritative start time is reached.'
                          )
                        }
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Schedule
                      </button>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'active',
                            'Open Election Early',
                            'Are you sure you want to activate this election immediately? Candidate configurations will be permanently locked against modification.',
                            true
                          )
                        }
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Activate Now
                      </button>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'cancelled',
                            'Cancel Election',
                            'Please provide a mandatory cancellation justification. Once cancelled, this election cannot be reopened.',
                            true,
                            true
                          )
                        }
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded transition-colors cursor-pointer border border-red-200"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {/* SCHEDULED Transitions */}
                  {norm === 'SCHEDULED' && (
                    <>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'active',
                            'Open Election Early',
                            'Activate voting immediately before scheduled start time? Candidate configurations will be permanently locked.',
                            true
                          )
                        }
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Activate Voting
                      </button>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'draft',
                            'Return to Draft',
                            'Return election to draft status to revise configuration or delay voting schedule.'
                          )
                        }
                        className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Back to Draft
                      </button>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'cancelled',
                            'Cancel Election',
                            'Provide a mandatory justification for cancelling this scheduled election.',
                            true,
                            true
                          )
                        }
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded transition-colors cursor-pointer border border-red-200"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {/* OPEN Transitions */}
                  {norm === 'OPEN' && (
                    <>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'paused',
                            'Pause Election',
                            'Temporarily pause voting? Electors will be blocked from generating tickets or submitting votes until resumed.',
                            true
                          )
                        }
                        className="px-3 py-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Pause Voting
                      </button>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'concluded',
                            'Conclude Poll Early',
                            'Are you sure you want to conclude the poll early? This is a terminal state. No further ballots can ever be accepted.',
                            true
                          )
                        }
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Conclude Poll
                      </button>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'cancelled',
                            'Emergency Cancellation',
                            'Emergency cancellation requires a mandatory documented justification.',
                            true,
                            true
                          )
                        }
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded transition-colors cursor-pointer border border-red-200"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {/* PAUSED Transitions */}
                  {norm === 'PAUSED' && (
                    <>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'active',
                            'Resume Voting',
                            'Resume voting for eligible electors across all participating constituencies.'
                          )
                        }
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Resume Voting
                      </button>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'concluded',
                            'Conclude Poll',
                            'Conclude this election permanently from paused state.',
                            true
                          )
                        }
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded transition-colors cursor-pointer"
                      >
                        Conclude Poll
                      </button>
                      <button
                        onClick={() =>
                          openStatusAction(
                            elec,
                            'cancelled',
                            'Cancel Election',
                            'Cancel this election with mandatory documented reason.',
                            true,
                            true
                          )
                        }
                        className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-semibold rounded transition-colors cursor-pointer border border-red-200"
                      >
                        Cancel
                      </button>
                    </>
                  )}

                  {/* CLOSED (Terminal) */}
                  {norm === 'CLOSED' && (
                    <span className="text-xs font-semibold text-slate-500 italic bg-slate-50 px-2 py-1 rounded border border-slate-200">
                      Poll Officially Concluded (Terminal)
                    </span>
                  )}

                  {/* CANCELLED (Terminal) */}
                  {norm === 'CANCELLED' && (
                    <span className="text-xs font-semibold text-red-600 italic bg-red-50 px-2 py-1 rounded border border-red-200">
                      Election Cancelled (Terminal)
                    </span>
                  )}
                </div>
              </div>

              {/* Voting window stats */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Poll Start Deadline</span>
                  <span className="font-mono text-slate-800 font-medium">
                    {new Date(elec.startTime * 1000).toLocaleString('en-IN', {
                      timeZone: elec.timezone || 'Asia/Kolkata',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    ({elec.timezone || 'Asia/Kolkata'})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Poll Closing Deadline</span>
                  <span className="font-mono text-slate-800 font-medium">
                    {new Date(elec.endTime * 1000).toLocaleString('en-IN', {
                      timeZone: elec.timezone || 'Asia/Kolkata',
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    })}
                  </span>
                  <span className="text-[10px] text-slate-400 block font-mono">
                    ({elec.timezone || 'Asia/Kolkata'})
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Ballots Cast</span>
                  <span className="font-mono font-bold text-slate-900">
                    {elec.totalVotesCast.toLocaleString('en-IN')}
                  </span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Participating Seats</span>
                  <span className="font-mono text-slate-800 font-medium">
                    {elec.constituencyIds.length} Constituencies
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Confirmation Modal */}
      {actionConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-md w-full shadow-lg">
            <div className="flex items-center gap-2 mb-3">
              {actionConfirmModal.isDangerous ? (
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-orange-600 shrink-0" />
              )}
              <h2 className="text-base font-bold text-slate-900">{actionConfirmModal.title}</h2>
            </div>

            <p className="text-xs text-slate-600 mb-4">{actionConfirmModal.description}</p>

            {actionConfirmModal.requiresReason && (
              <div className="mb-4">
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Cancellation Reason <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Official administrative justification for cancellation..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={3}
                  required
                />
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setActionConfirmModal(null)}
                className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmStatusAction}
                disabled={actionConfirmModal.requiresReason && !actionReason.trim()}
                className={`px-4 py-1.5 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs ${
                  actionConfirmModal.isDangerous
                    ? 'bg-red-600 hover:bg-red-700 disabled:opacity-50'
                    : 'bg-orange-600 hover:bg-orange-700'
                }`}
              >
                Confirm Action
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Election Modal */}
      {editingElection && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg w-full shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-1">Edit Election Configuration</h2>
            <p className="text-xs text-slate-500 mb-4">
              Modify election metadata and schedule before voting opens. ID: {editingElection.id}
            </p>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Election Title <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Authority Timezone
                </label>
                <select
                  value={editTimezone}
                  onChange={(e) => setEditTimezone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                >
                  {SUPPORTED_TIMEZONES.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Voting Start Date & Time <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="datetime-local"
                    value={editStartTimeStr}
                    onChange={(e) => setEditStartTimeStr(e.target.value)}
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
                    value={editEndTimeStr}
                    onChange={(e) => setEditEndTimeStr(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                  Participating Constituencies
                </label>
                <div className="space-y-1.5 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                  {AVAILABLE_CONSTITUENCIES.map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-xs text-slate-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={editConsts.includes(c.id)}
                        onChange={() => handleToggleEditConst(c.id)}
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
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  rows={2}
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingElection(null)}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg text-xs cursor-pointer shadow-xs"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-lg w-full shadow-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-bold text-slate-900 mb-2">Create New Administrator Election</h2>
            <p className="text-xs text-slate-500 mb-4">
              Configure election title, type, authority timezone, and voting window deadlines.
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

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Election Type <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newElectionType}
                    onChange={(e) => setNewElectionType(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="State Legislative Assembly">State Legislative Assembly</option>
                    <option value="Lok Sabha Parliamentary Election">Lok Sabha Parliamentary Election</option>
                    <option value="Municipal Corporation Election">Municipal Corporation Election</option>
                    <option value="Bye-Election">Constituency Bye-Election</option>
                    <option value="Academic Demonstration">Academic Demonstration Sandbox</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
                    Authority Timezone <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={newTimezone}
                    onChange={(e) => setNewTimezone(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 font-mono"
                  >
                    {SUPPORTED_TIMEZONES.map((tz) => (
                      <option key={tz.value} value={tz.value}>
                        {tz.label}
                      </option>
                    ))}
                  </select>
                </div>
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
