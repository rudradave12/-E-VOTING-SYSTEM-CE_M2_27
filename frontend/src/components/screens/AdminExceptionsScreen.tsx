/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  FileCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Clock,
  Search,
  Filter,
  ArrowLeft,
  RefreshCw,
  Shield,
  Eye,
  Info,
  Calendar,
  MapPin,
  Vote,
  Fingerprint,
  Camera,
  Check,
  X,
} from 'lucide-react';
import { voterApi } from '../../services/voterApi';
import {
  ManualIdExceptionRecord,
  ExceptionPurpose,
  ExceptionStatus,
  ExceptionReasonCode,
} from '../../types/dataModel';

interface AdminExceptionsScreenProps {
  onBack: () => void;
  adminUser?: {
    id: string;
    email: string;
    displayName: string;
    role: string;
    permissions: string[];
    scope?: {
      constituencyIds?: string[];
      electionIds?: string[];
      state?: string;
      district?: string;
    };
  } | null;
}

export const AdminExceptionsScreen: React.FC<AdminExceptionsScreenProps> = ({
  onBack,
  adminUser,
}) => {
  const [exceptions, setExceptions] = useState<ManualIdExceptionRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [purposeFilter, setPurposeFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Selected for decision modal
  const [activeException, setActiveException] = useState<ManualIdExceptionRecord | null>(null);
  const [decisionReason, setDecisionReason] = useState<string>('');
  const [pendingAction, setPendingAction] = useState<'APPROVE' | 'DECLINE' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const role = adminUser?.role || 'VOTER_REGISTRATION_OFFICER';
  const permissions = adminUser?.permissions || [];
  const canApprove =
    role === 'PLATFORM_ADMIN' ||
    role === 'ELECTION_OFFICER' ||
    permissions.includes('VOTER_EXCEPTION_APPROVE');

  const loadExceptions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filter: any = {};
      if (statusFilter !== 'ALL') filter.status = statusFilter;
      if (purposeFilter !== 'ALL') filter.purpose = purposeFilter;

      const res = await voterApi.adminListExceptions(filter);
      if (res.success && res.exceptions) {
        setExceptions(res.exceptions);
      } else {
        setError(res.message || 'Failed to fetch exception requests.');
      }
    } catch (err: any) {
      setError(err.message || 'Network error fetching exception records.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, purposeFilter]);

  useEffect(() => {
    loadExceptions();
  }, [loadExceptions]);

  const handleOpenDecision = (exc: ManualIdExceptionRecord, action: 'APPROVE' | 'DECLINE') => {
    setActiveException(exc);
    setPendingAction(action);
    setDecisionReason('');
    setShowConfirmModal(true);
  };

  const handleConfirmDecision = async () => {
    if (!activeException || !pendingAction) return;

    if (!decisionReason || decisionReason.trim().length < 5) {
      setFeedback({
        type: 'error',
        message: 'Decision reason must be at least 5 characters long for audited accountability.',
      });
      return;
    }

    setIsSubmitting(true);
    setFeedback(null);

    try {
      let res;
      if (pendingAction === 'APPROVE') {
        res = await voterApi.adminApproveException(activeException.id, decisionReason.trim());
      } else {
        res = await voterApi.adminDeclineException(activeException.id, decisionReason.trim());
      }

      if (res.success) {
        setFeedback({
          type: 'success',
          message:
            pendingAction === 'APPROVE'
              ? `Exception ${activeException.id} successfully approved. Outcome recorded as MANUAL_PHYSICAL_ID_APPROVED.`
              : `Exception ${activeException.id} declined. Outcome recorded as MANUAL_PHYSICAL_ID_DECLINED.`,
        });
        setShowConfirmModal(false);
        setActiveException(null);
        setPendingAction(null);
        setDecisionReason('');
        await loadExceptions();
      } else {
        setFeedback({
          type: 'error',
          message: res.message || 'Failed to submit decision.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message: err.message || 'Network error processing decision.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered in-memory list for search
  const filteredExceptions = exceptions.filter((exc) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      exc.id.toLowerCase().includes(q) ||
      exc.simulationVoterId.toLowerCase().includes(q) ||
      exc.voterId.toLowerCase().includes(q) ||
      exc.constituencyId.toLowerCase().includes(q) ||
      exc.reasonCode.toLowerCase().includes(q)
    );
  });

  const pendingCount = exceptions.filter((e) => e.status === 'PENDING').length;
  const approvedCount = exceptions.filter((e) => e.status === 'APPROVED').length;
  const declinedCount = exceptions.filter((e) => e.status === 'DECLINED').length;

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Top Breadcrumb & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 mb-1">
            <button
              onClick={onBack}
              className="hover:text-slate-800 flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Control Center</span>
            </button>
            <span aria-hidden="true">/</span>
            <span className="text-slate-900 font-bold">Manual ID Verification</span>
          </div>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight flex items-center gap-2.5">
            <FileCheck className="w-7 h-7 text-purple-600" />
            <span>Manual Physical-ID Exceptions</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Audited exception approval workflow for electors when biometric hardware or verification is unavailable.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadExceptions}
            disabled={loading}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* Officer Role & Regulatory Invariant Alert */}
      <div className="bg-purple-950 text-white rounded-xl p-4 mb-6 border border-purple-900 shadow-xs">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-800/80 text-purple-200 flex items-center justify-center shrink-0 mt-0.5">
            <Shield className="w-4 h-4" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold px-2 py-0.5 bg-purple-800 text-purple-200 rounded">
                Physical Inspection Protocol
              </span>
              <span className="text-xs text-purple-300">
                Logged Officer:{' '}
                <strong className="text-white font-mono">{adminUser?.id || 'EO-SIM-001'}</strong> ({role})
              </span>
            </div>
            <p className="text-xs text-purple-200/90 leading-relaxed">
              Election Officers must directly inspect the physical government document (e.g. EPIC, Passport).
              <strong> No photographs, scans, or document numbers are uploaded or stored.</strong> An approved exception
              is authoritative and recorded as <code className="bg-purple-900/80 px-1 py-0.5 rounded text-purple-100 font-mono">MANUAL_PHYSICAL_ID_APPROVED</code>.
              It is strictly distinct from biometric matching and never marks a modality as enrolled.
            </p>
          </div>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block mb-1">Total Exceptions</span>
          <span className="font-mono text-xl font-bold text-slate-900 tabular-nums">
            {exceptions.length}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">In scope records</span>
        </div>

        <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-amber-700 block mb-1">Pending Review</span>
          <span className="font-mono text-xl font-bold text-amber-900 tabular-nums">
            {pendingCount}
          </span>
          <span className="text-[11px] text-amber-700 mt-1 block">Awaiting EO decision</span>
        </div>

        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-emerald-700 block mb-1">Manually Approved</span>
          <span className="font-mono text-xl font-bold text-emerald-900 tabular-nums">
            {approvedCount}
          </span>
          <span className="text-[11px] text-emerald-700 mt-1 block">MANUAL_PHYSICAL_ID_APPROVED</span>
        </div>

        <div className="bg-slate-50 border border-slate-200 p-4 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block mb-1">Declined</span>
          <span className="font-mono text-xl font-bold text-slate-700 tabular-nums">
            {declinedCount}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Rejected upon inspection</span>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3.5 rounded-xl mb-6 text-xs flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 mb-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Tabs */}
          {(['ALL', 'PENDING', 'APPROVED', 'DECLINED'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === st
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st === 'ALL' ? 'All Status' : st}
            </button>
          ))}

          <span className="text-slate-300">|</span>

          {/* Purpose Tabs */}
          {(['ALL', 'ENROLLMENT', 'VOTING_SESSION'] as const).map((pt) => (
            <button
              key={pt}
              onClick={() => setPurposeFilter(pt)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                purposeFilter === pt
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {pt === 'ALL' ? 'All Purposes' : pt === 'ENROLLMENT' ? 'Enrollment' : 'Voting Session'}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative min-w-[240px]">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Search by ID, voter, reason..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:ring-2 focus:ring-purple-500 focus:bg-white"
          />
        </div>
      </div>

      {/* Exception Queue Table / Card List */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-500 space-y-2">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-600" />
            <p className="text-xs">Loading manual exception queue...</p>
          </div>
        ) : error ? (
          <div className="p-12 text-center text-red-600 space-y-2">
            <AlertTriangle className="w-6 h-6 mx-auto text-red-500" />
            <p className="text-xs">{error}</p>
          </div>
        ) : filteredExceptions.length === 0 ? (
          <div className="p-12 text-center text-slate-400 space-y-2">
            <FileCheck className="w-8 h-8 mx-auto text-slate-300" />
            <p className="text-sm font-semibold text-slate-600">No exception requests found</p>
            <p className="text-xs text-slate-400">
              {statusFilter !== 'ALL' || purposeFilter !== 'ALL' || searchQuery
                ? 'Try clearing filters or search terms.'
                : 'No manual physical-ID exceptions have been requested in this jurisdiction.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredExceptions.map((exc) => {
              const isPending = exc.status === 'PENDING';
              const isOwnRequest = adminUser?.id === exc.requestedByOfficerId;

              return (
                <div key={exc.id} className="p-5 hover:bg-slate-50/60 transition-colors">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Left: Request Metadata & Details */}
                    <div className="space-y-2 flex-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                          {exc.id}
                        </span>

                        {/* Status Badge */}
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            exc.status === 'PENDING'
                              ? 'bg-amber-100 text-amber-800'
                              : exc.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : exc.status === 'DECLINED'
                              ? 'bg-red-100 text-red-800'
                              : exc.status === 'CONSUMED'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {exc.status === 'PENDING' && <Clock className="w-3 h-3" />}
                          {exc.status === 'APPROVED' && <CheckCircle2 className="w-3 h-3" />}
                          {exc.status === 'DECLINED' && <XCircle className="w-3 h-3" />}
                          <span>
                            {exc.status === 'APPROVED' ? 'MANUAL_PHYSICAL_ID_APPROVED' : exc.status}
                          </span>
                        </span>

                        {/* Purpose Badge */}
                        <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                          {exc.purpose === 'ENROLLMENT' ? (
                            <>
                              {exc.modality === 'FACE' ? (
                                <Camera className="w-3 h-3 text-blue-600" />
                              ) : (
                                <Fingerprint className="w-3 h-3 text-emerald-600" />
                              )}
                              <span>Enrollment ({exc.modality})</span>
                            </>
                          ) : (
                            <>
                              <Vote className="w-3 h-3 text-purple-600" />
                              <span>Voting Session ({exc.electionId})</span>
                            </>
                          )}
                        </span>

                        <span className="text-xs text-slate-400">
                          {new Date(exc.requestedAt).toLocaleString('en-IN')}
                        </span>
                      </div>

                      {/* Elector & Scope Info */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600">
                        <div>
                          <span className="text-slate-400 block text-[10px]">Simulation Voter ID:</span>
                          <span className="font-mono font-bold text-slate-800">{exc.simulationVoterId}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Constituency:</span>
                          <span className="font-semibold text-slate-700">{exc.constituencyId}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block text-[10px]">Requested By:</span>
                          <span className="font-mono text-slate-700">{exc.requestedByOfficerId} ({exc.requestedByOfficerRole})</span>
                        </div>
                      </div>

                      {/* Reason & Note */}
                      <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-lg text-xs space-y-1">
                        <div>
                          <span className="font-bold text-slate-700">Reason Code: </span>
                          <span className="font-mono text-purple-700 bg-purple-50 px-1 py-0.5 rounded border border-purple-200">
                            {exc.reasonCode}
                          </span>
                        </div>
                        {exc.note && (
                          <div className="text-slate-600">
                            <span className="font-semibold text-slate-700">Officer Note: </span>
                            <span>{exc.note}</span>
                          </div>
                        )}
                        {exc.decisionReason && (
                          <div className="pt-1.5 border-t border-slate-200/60 text-slate-800">
                            <span className="font-bold text-slate-900">Decision Reason: </span>
                            <span className="italic">{exc.decisionReason}</span>
                            <span className="text-[11px] text-slate-400 ml-2">
                              (By: {exc.reviewedByOfficerId} on {exc.reviewedAt ? new Date(exc.reviewedAt).toLocaleTimeString('en-IN') : ''})
                            </span>
                          </div>
                        )}
                        {exc.expiresAt && exc.status === 'APPROVED' && (
                          <div className="text-[11px] text-amber-700">
                            <span>Session Expiry: </span>
                            <strong className="font-mono">
                              {new Date(exc.expiresAt).toLocaleTimeString('en-IN')} (Single-use only)
                            </strong>
                          </div>
                        )}
                        {exc.consumedAt && (
                          <div className="text-[11px] text-blue-700">
                            <span>Consumed at: </span>
                            <strong className="font-mono">{new Date(exc.consumedAt).toLocaleTimeString('en-IN')}</strong>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center gap-2 shrink-0 w-full lg:w-auto">
                      {isPending ? (
                        canApprove ? (
                          isOwnRequest ? (
                            <div className="text-right">
                              <span className="text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1.5 rounded-lg block">
                                Requester cannot approve
                              </span>
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                Separation of duties enforced
                              </span>
                            </div>
                          ) : (
                            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 w-full sm:w-auto">
                              <button
                                onClick={() => handleOpenDecision(exc, 'APPROVE')}
                                className="py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                              >
                                <Check className="w-3.5 h-3.5" />
                                <span>Approve Physical ID</span>
                              </button>
                              <button
                                onClick={() => handleOpenDecision(exc, 'DECLINE')}
                                className="py-2 px-3 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                              >
                                <X className="w-3.5 h-3.5" />
                                <span>Decline</span>
                              </button>
                            </div>
                          )
                        ) : (
                          <div className="text-right">
                            <span className="text-[11px] text-slate-500 bg-slate-100 px-2.5 py-1.5 rounded-lg block font-semibold">
                              Awaiting EO Decision
                            </span>
                            <span className="text-[10px] text-slate-400 block mt-0.5">
                              VRO cannot decide requests
                            </span>
                          </div>
                        )
                      ) : (
                        <div className="text-right">
                          <span className="text-[11px] font-mono text-slate-500 block">
                            Decision Finalized
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Decision Review & Confirmation Modal */}
      {showConfirmModal && activeException && pendingAction && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
          role="dialog"
          aria-modal="true"
          aria-labelledby="exception-modal-title"
        >
          <div className="bg-white rounded-xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-purple-600" aria-hidden="true" />
                <h3 id="exception-modal-title" className="text-base font-bold text-slate-900">
                  {pendingAction === 'APPROVE' ? 'Approve Manual Physical ID' : 'Decline Exception Request'}
                </h3>
              </div>
              <button
                onClick={() => setShowConfirmModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Request Summary */}
            <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1.5 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Request ID:</span>
                <span className="font-mono font-bold text-slate-800">{activeException.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Simulation Elector ID:</span>
                <span className="font-mono font-bold text-slate-800">{activeException.simulationVoterId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Constituency:</span>
                <span className="font-semibold text-slate-800">{activeException.constituencyId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Purpose:</span>
                <span className="font-semibold text-purple-700">{activeException.purpose}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Reason Code:</span>
                <span className="font-mono text-slate-800">{activeException.reasonCode}</span>
              </div>
            </div>

            {/* Inspection Checklist */}
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1.5 text-amber-900">
              <div className="font-bold text-amber-950 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <span>Election Officer Verification Attestation:</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-amber-800">
                <li>I have physically inspected the elector&apos;s physical identity card in person.</li>
                <li>I confirmed the photograph and demographic match without storing card images.</li>
                <li>
                  {pendingAction === 'APPROVE'
                    ? 'Approval will be recorded strictly as MANUAL_PHYSICAL_ID_APPROVED (not biometric match).'
                    : 'Decline decision will be recorded in the audit trail.'}
                </li>
              </ul>
            </div>

            {/* Mandatory Reason Input */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Audited Decision Reason <span className="text-red-500">*</span>
              </label>
              <textarea
                rows={3}
                placeholder="Enter mandatory rationale (e.g. 'EPIC card verified physically; scanner optical distortion documented'). Minimum 5 characters."
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
                className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:bg-white"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">
                {decisionReason.trim().length} / 5 minimum characters required.
              </span>
            </div>

            {/* Modal Buttons */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isSubmitting}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDecision}
                disabled={isSubmitting || decisionReason.trim().length < 5}
                className={`px-4 py-2 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
                  pendingAction === 'APPROVE'
                    ? 'bg-emerald-600 hover:bg-emerald-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Recording...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>{pendingAction === 'APPROVE' ? 'Confirm Approval' : 'Confirm Decline'}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
