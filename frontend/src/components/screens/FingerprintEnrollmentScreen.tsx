/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Fingerprint,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Save,
  X,
  Play,
  Shield,
  ShieldAlert,
  Info,
  Check,
  Usb,
  Cpu,
  Layers,
  FileCheck,
  Loader2,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { VoterProfile, BiometricEnrollmentStatus, ExceptionReasonCode } from '../../types/dataModel';
import { isConstituencyInScope } from '../../types/permissions';
import {
  getFingerprintScannerAdapter,
  ScannerDeviceStatus,
  SupportedFingerType,
} from '../../services/biometricService';
import { voterApi } from '../../services/voterApi';


export interface FingerprintEnrollmentScreenProps {
  voter: VoterProfile | null;
  adminUser?: any;
  onBack: () => void;
  onCancel?: () => void;
  isRegistrationFlow?: boolean;
  pendingRegistration?: any;
  onEnrollmentComplete?: (result: {
    mode: 'HARDWARE_USB' | 'SIMULATED' | 'MANUAL_OFFICER_OVERRIDE';
    verifiedAt: number;
    officerId: string;
  }) => void;
}

export const FingerprintEnrollmentScreen: React.FC<FingerprintEnrollmentScreenProps> = ({
  voter,
  adminUser,
  onBack,
  onCancel,
  isRegistrationFlow,
  pendingRegistration,
  onEnrollmentComplete,
}) => {
  // Session & authorization checks
  const officerRole = adminUser?.role || 'VOTER_REGISTRATION_OFFICER';
  const officerScope = adminUser?.scope;
  const isAuthorizedRole =
    officerRole === 'VOTER_REGISTRATION_OFFICER' ||
    officerRole === 'PLATFORM_ADMIN' ||
    adminUser?.permissions?.includes('BIOMETRIC_ENROLLMENT_START');

  const effectiveVoter = voter || (pendingRegistration ? {
    id: pendingRegistration.pendingId,
    simulationVoterId: pendingRegistration.pendingId,
    fullName: pendingRegistration.fullName,
    constituencyId: pendingRegistration.constituencyId,
    dateOfBirth: pendingRegistration.dateOfBirth,
    gender: pendingRegistration.gender,
    state: pendingRegistration.state,
    district: pendingRegistration.district,
    pollingStation: pendingRegistration.pollingStation,
    maskedMobile: pendingRegistration.maskedMobile,
    registrationStatus: 'PENDING_VERIFICATION' as const,
    eligibilityStatus: 'INELIGIBLE_BIOMETRIC_PENDING' as const,
    lifecycleStatus: 'ACTIVE' as const,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    schemaVersion: '2.0' as const,
  } : null);

  const isScopePermitted = effectiveVoter
    ? !officerScope || isConstituencyInScope(officerScope, effectiveVoter.constituencyId)
    : true;

  // Adapter mode: 'hardware' vs 'simulation'
  const [adapterMode, setAdapterMode] = useState<'hardware' | 'simulation'>('simulation');
  const [deviceStatus, setDeviceStatus] = useState<ScannerDeviceStatus>('NOT_DETECTED');
  const [selectedFinger, setSelectedFinger] = useState<SupportedFingerType>('THUMB');

  // Multi-impression scan state (1 to 4 impressions)
  const [impressions, setImpressions] = useState<number[]>([1, 2, 3]); // default preview state
  const [currentScanning, setCurrentScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<number>(100);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Backend metadata state
  const [currentStatus, setCurrentStatus] = useState<BiometricEnrollmentStatus>('NOT_STARTED');
  const [loadingMetadata, setLoadingMetadata] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Manual Exception State (Phase 06)
  const [showExceptionModal, setShowExceptionModal] = useState<boolean>(false);
  const [exceptionReason, setExceptionReason] = useState<ExceptionReasonCode>('FINGERPRINT_SCANNER_NOT_DETECTED');
  const [exceptionNote, setExceptionNote] = useState<string>('');
  const [isSubmittingException, setIsSubmittingException] = useState<boolean>(false);
  const [exceptionFeedback, setExceptionFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [activeExceptionRecord, setActiveExceptionRecord] = useState<any>(null);

  // Load authoritative biometric and exception verification status
  const fetchStatus = async () => {
    if (!effectiveVoter) {
      setLoadingMetadata(false);
      return;
    }
    setLoadingMetadata(true);
    try {
      if (voter) {
        const res = await voterApi.adminGetVoterBiometrics(voter.id);
        if (res.success && res.fingerprint) {
          setCurrentStatus(res.fingerprint.status);
        }
      }

      // Check if there is an active exception request for this voter or registration draft
      const excRes = await voterApi.adminListExceptions({ voterId: effectiveVoter.id });
      if (excRes.success && excRes.exceptions && excRes.exceptions.length > 0) {
        const fpExc = excRes.exceptions.find((e: any) => e.modality === 'FINGERPRINT');
        if (fpExc) {
          setActiveExceptionRecord(fpExc);
          if (fpExc.status === 'PENDING') {
            setCurrentStatus('PENDING_MANUAL_REVIEW');
          } else if (fpExc.status === 'APPROVED') {
            setCurrentStatus('MANUALLY_APPROVED');
          } else if (fpExc.status === 'DECLINED') {
            setCurrentStatus('DECLINED');
          }
        }
      } else if (pendingRegistration?.fingerprintVerification?.status === 'VERIFIED') {
        setCurrentStatus('ENROLLED');
      }
    } catch {
      // Fallback
    } finally {
      setLoadingMetadata(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [voter, pendingRegistration]);

  // Check scanner hardware status when adapter mode changes
  useEffect(() => {
    let isMounted = true;
    async function checkDevice() {
      const adapter = getFingerprintScannerAdapter(adapterMode);
      const status = await adapter.getStatus();
      if (isMounted) {
        setDeviceStatus(status);
      }
    }
    checkDevice();
    return () => {
      isMounted = false;
    };
  }, [adapterMode]);

  // Handle Scanning an Impression
  const handleScanImpression = async () => {
    setStatusMessage(null);
    setSaveMessage(null);
    setCurrentScanning(true);
    setScanProgress(20);

    const adapter = getFingerprintScannerAdapter(adapterMode);
    const nextIndex = impressions.length < 4 ? impressions.length + 1 : 1;

    // Simulate progressive acquisition visual feedback
    const interval = setInterval(() => {
      setScanProgress((prev) => (prev < 90 ? prev + 25 : prev));
    }, 200);

    const result = await adapter.captureImpression(nextIndex, selectedFinger);
    clearInterval(interval);
    setScanProgress(100);
    setCurrentScanning(false);

    if (result.success) {
      setImpressions((prev) => {
        if (prev.length >= 4) return [1];
        return [...prev, nextIndex];
      });
      setStatusMessage(result.message);
    } else {
      setDeviceStatus(result.status);
      setStatusMessage(result.message);
    }
  };

  // Reset / Retake Impressions
  const handleResetScans = () => {
    setImpressions([]);
    setScanProgress(0);
    setStatusMessage('All impressions reset. Ready to capture first sample.');
    setSaveMessage(null);
  };

  // Save Progress handler (Updates metadata to PENDING, never ENROLLED)
  const handleSaveProgress = async () => {
    if (!voter) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      const res = await voterApi.adminUpdateBiometricMetadata(voter.id, {
        modality: 'FINGERPRINT',
        status: 'PENDING',
        qualityCheckStatus: 'PASSED',
        deviceType: adapterMode === 'hardware' ? 'USB_OPTICAL_SCANNER' : 'SIMULATED_SCANNER_ADAPTER',
        deviceProvider: adapterMode === 'hardware' ? 'MANTRA_RD_SERVICE' : 'DEMO_ADAPTER',
        qualityScore: 92,
      });

      if (res.success && res.biometrics) {
        setCurrentStatus(res.biometrics.status);
        setSaveMessage({
          type: 'success',
          text: 'Fingerprint enrollment progress recorded as PENDING. Raw biometric templates are never stored; physical hardware integration is required for final verification.',
        });
      } else {
        setSaveMessage({
          type: 'error',
          text: res.message || 'Failed to update biometric metadata.',
        });
      }
    } catch {
      setSaveMessage({
        type: 'error',
        text: 'Network error updating biometric enrollment status.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Request Manual Exception (Phase 06)
  const handleRequestException = async () => {
    if (!effectiveVoter || isSubmittingException) return;
    setIsSubmittingException(true);
    setExceptionFeedback(null);
    try {
      const res = await voterApi.adminCreateExceptionRequest({
        voterId: effectiveVoter.id,
        purpose: 'ENROLLMENT',
        modality: 'FINGERPRINT',
        reasonCode: exceptionReason,
        note: exceptionNote ? exceptionNote.trim() : undefined,
      });
      if (res.success) {
        setCurrentStatus('PENDING_MANUAL_REVIEW');
        if (res.exception) {
          setActiveExceptionRecord(res.exception);
        }
        setExceptionFeedback({
          type: 'success',
          text: `Manual physical-ID exception requested (${res.exception?.id || 'Submitted'}). Awaiting Election Officer review.`,
        });
        setShowExceptionModal(false);
      } else {
        setExceptionFeedback({
          type: 'error',
          text: res.message || 'Failed to submit exception request.',
        });
      }
    } catch (err: any) {
      setExceptionFeedback({
        type: 'error',
        text: err.message || 'Network error submitting exception request.',
      });
    } finally {
      setIsSubmittingException(false);
    }
  };

  // Unauthorized or out-of-scope guard
  if (!isAuthorizedRole || !isScopePermitted) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4">
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-red-900">Access Denied: Biometric Enrollment Prohibited</h2>
            <p className="text-xs text-red-700 mt-1 max-w-lg mx-auto">
              {!isAuthorizedRole
                ? `Account role '${officerRole}' lacks the 'BIOMETRIC_ENROLLMENT_START' permission. Only authorized Voter Registration Officers may access fingerprint enrollment.`
                : `Voter is assigned to constituency '${voter?.constituencyId}', which falls outside your authorized administrative jurisdiction.`}
            </p>
          </div>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Voter Registry</span>
          </button>
        </div>
      </div>
    );
  }

  // Voter not selected fallback
  if (!effectiveVoter) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto mb-2" />
          <h2 className="text-base font-bold text-amber-900">No Elector Selected</h2>
          <p className="text-xs text-amber-700 mt-1 mb-4">
            Please select an elector from the voter registry before launching the fingerprint enrollment workflow.
          </p>
          <button
            onClick={onBack}
            className="px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Registry</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* Academic Simulation Notice */}
      {/* Top Header & Breadcrumb */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={onBack}
              title="Return to Voter Registry"
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                  Phase 05 · Separate Biometric UI
                </span>
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  Modality: FINGERPRINT
                </span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 mt-1">Fingerprint Enrollment</h1>
              <p className="text-xs text-slate-500">
                Biometric scanner interface, multi-impression acquisition, and device status management.
              </p>
            </div>
          </div>

          {/* Voter Profile Safe Info Header */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-lg text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Simulation ID</span>
              <span className="font-mono font-bold text-slate-900">{effectiveVoter.simulationVoterId}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Elector Name</span>
              <span className="font-semibold text-slate-800">{effectiveVoter.fullName}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Constituency</span>
              <span className="font-medium text-slate-700">{effectiveVoter.constituencyId}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Fingerprint Status</span>
              <span
                className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
                  loadingMetadata
                    ? 'bg-slate-200 text-slate-700'
                    : currentStatus === 'ENROLLED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : currentStatus === 'MANUALLY_APPROVED'
                    ? 'bg-purple-100 text-purple-800'
                    : currentStatus === 'PENDING_MANUAL_REVIEW'
                    ? 'bg-amber-100 text-amber-800'
                    : currentStatus === 'DECLINED'
                    ? 'bg-red-100 text-red-800'
                    : currentStatus === 'PENDING'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {loadingMetadata
                  ? '...'
                  : currentStatus === 'MANUALLY_APPROVED'
                  ? 'MANUAL_PHYSICAL_ID_APPROVED'
                  : currentStatus === 'PENDING_MANUAL_REVIEW'
                  ? 'PENDING_MANUAL_REVIEW'
                  : currentStatus === 'DECLINED'
                  ? 'DECLINED'
                  : currentStatus === 'ENROLLED'
                  ? 'VERIFIED'
                  : currentStatus}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Process Flow Banner (Steps 1 to 6) */}
      <div className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 text-white rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Fingerprint className="w-5 h-5 text-emerald-400" />
            <span className="font-bold text-sm tracking-wide">
              Fingerprint Scanning Instructions · For Voter Registration & Enrollment
            </span>
          </div>
          <span className="text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 px-2.5 py-0.5 rounded-full">
            Officer Standard Procedure
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-200 flex items-center justify-center text-[10px]">
                1
              </span>
              <span>Prepare Device</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Connect fingerprint scanner and verify connection status.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-200 flex items-center justify-center text-[10px]">
                2
              </span>
              <span>Capture Fingerprint</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Ask elector to place center of finger on scanner optical window.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-200 flex items-center justify-center text-[10px]">
                3
              </span>
              <span>Scan Multiple</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Capture 3–4 impressions to create reliable multi-sample template.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-200 flex items-center justify-center text-[10px]">
                4
              </span>
              <span>Check Quality</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Ensure fingerprint ridge clarity, good pressure, and complete print.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-200 flex items-center justify-center text-[10px]">
                5
              </span>
              <span>Save Progress</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Record metadata status in backend. No raw template bytes stored.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-emerald-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-emerald-500/30 text-emerald-200 flex items-center justify-center text-[10px]">
                6
              </span>
              <span>Supervisor Fallback</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              If scanner fails repeatedly, escalate to Phase 06 physical ID review.
            </p>
          </div>
        </div>
      </div>

      {/* Main 3-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 Cols): Scanner Panel & Visualization */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Fingerprint Enrollment</h2>
                <p className="text-xs text-slate-500">Scan the fingerprint using the connected device</p>
              </div>

              {/* Status Pill */}
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                {adapterMode === 'simulation' ? (
                  <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-blue-500" />
                    <span>Academic Simulation Active</span>
                  </span>
                ) : deviceStatus === 'CONNECTED' ? (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" />
                    <span>Hardware Scanner Connected</span>
                  </span>
                ) : deviceStatus === 'SCANNING' ? (
                  <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                    <span>Scanning...</span>
                  </span>
                ) : deviceStatus === 'NOT_DETECTED' ? (
                  <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    <span>No Supported Scanner Detected</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span>Device Error</span>
                  </span>
                )}
              </div>
            </div>

            {/* Adapter Mode Toggle (Hardware SDK vs Simulated Demonstration Preview) */}
            <div className="mb-4 p-1 bg-slate-100 rounded-lg flex items-center text-xs font-semibold">
              <button
                onClick={() => setAdapterMode('hardware')}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  adapterMode === 'hardware'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Usb className="w-3.5 h-3.5 text-slate-500" />
                <span>Physical USB SDK</span>
              </button>
              <button
                onClick={() => setAdapterMode('simulation')}
                className={`flex-1 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                  adapterMode === 'simulation'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Cpu className="w-3.5 h-3.5 text-emerald-600" />
                <span>Simulated Preview Mode</span>
              </button>
            </div>

            {/* Simulation Disclosure Banner */}
            {adapterMode === 'simulation' && (
              <div className="mb-4 p-3 bg-blue-50/80 border border-blue-200 rounded-lg text-xs text-blue-900 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <Info className="w-4 h-4 text-blue-600" />
                  <span>Academic Simulation — No Physical Fingerprint Captured</span>
                </div>
                <p className="text-[11px] text-blue-700 leading-relaxed">
                  Virtual device testbed active for demonstration. No physical fingerprint hardware attached or minutiae recorded.
                </p>
              </div>
            )}

            {/* Hardware Not Found Notice if Physical Mode */}
            {adapterMode === 'hardware' && deviceStatus === 'NOT_DETECTED' && (
              <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 space-y-1">
                <div className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>No Supported Scanner Detected</span>
                </div>
                <p className="text-[11px] text-amber-700 leading-relaxed">
                  Checked USB RD Service daemon on port 11100. No certified scanner driver responded. Connect a supported device (Mantra / SecuGen) or switch to <strong>Simulated Preview Mode</strong>.
                </p>
              </div>
            )}

            {/* Two-Subcolumn Scanner Viewport Box */}
            <div className="bg-slate-950 rounded-xl border border-slate-800 p-4 text-white">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                {/* Left Subcolumn: Capture Step Checklist */}
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      1
                    </span>
                    <div>
                      <span className="font-bold text-slate-200 block">Place Finger</span>
                      <span className="text-[11px] text-slate-400">Place the same finger on the scanner.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      2
                    </span>
                    <div>
                      <span className="font-bold text-slate-200 block">Scanning</span>
                      <span className="text-[11px] text-slate-400">Hold still until scan is complete.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      3
                    </span>
                    <div>
                      <span className="font-bold text-slate-200 block">Quality Check</span>
                      <span className="text-[11px] text-slate-400">System checks ridge clarity.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      4
                    </span>
                    <div>
                      <span className="font-bold text-slate-200 block">Repeat (3–4x)</span>
                      <span className="text-[11px] text-slate-400">Multi-sample consolidation.</span>
                    </div>
                  </div>

                  <div className="flex items-start gap-2">
                    <span className="w-4 h-4 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                      5
                    </span>
                    <div>
                      <span className="font-bold text-emerald-400 block">Consolidation</span>
                      <span className="text-[11px] text-slate-400">Impression sequence complete.</span>
                    </div>
                  </div>
                </div>

                {/* Right Subcolumn: Biometric Ridge Visualization & Multi-impression Slots */}
                <div className="bg-slate-900/90 rounded-lg border border-slate-800 p-3 flex flex-col items-center justify-center text-center relative overflow-hidden">
                  {/* Fingerprint Ridge Graphic with Grid */}
                  <div className="relative w-28 h-36 flex items-center justify-center my-1">
                    {/* Dark grid background */}
                    <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:10px_10px] opacity-40 rounded-lg" />

                    {/* Glowing Fingerprint Icon */}
                    <Fingerprint
                      className={`w-24 h-24 transition-all duration-300 ${
                        currentScanning
                          ? 'text-emerald-400 filter drop-shadow-[0_0_12px_rgba(52,211,153,0.8)] animate-pulse'
                          : impressions.length > 0
                          ? 'text-emerald-500 filter drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]'
                          : 'text-slate-700'
                      }`}
                    />

                    {/* Scanning Line Animation */}
                    {currentScanning && (
                      <div className="absolute left-2 right-2 h-0.5 bg-emerald-400 shadow-[0_0_8px_#34d399] animate-bounce" />
                    )}
                  </div>

                  {/* Progress Indicator */}
                  <div className="w-full mt-2 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-mono text-slate-400">
                      <span>{currentScanning ? 'Scanning...' : 'Status: Ready'}</span>
                      <span className="text-emerald-400 font-bold">{scanProgress}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${scanProgress}%` }}
                      />
                    </div>
                  </div>

                  {/* 4 Multi-Scan Impression Slots */}
                  <div className="flex items-center justify-center gap-2 mt-3">
                    {[1, 2, 3, 4].map((slot) => {
                      const isComplete = impressions.includes(slot);
                      const isCurrent = currentScanning && slot === impressions.length + 1;
                      return (
                        <div
                          key={slot}
                          title={`Impression #${slot}`}
                          className={`w-6 h-8 rounded border flex flex-col items-center justify-center text-[10px] font-mono transition-colors ${
                            isComplete
                              ? 'bg-emerald-950 border-emerald-500 text-emerald-400'
                              : isCurrent
                              ? 'bg-blue-950 border-blue-400 text-blue-300 animate-pulse'
                              : 'bg-slate-800 border-slate-700 text-slate-500'
                          }`}
                        >
                          <span className="text-[9px]">{slot}</span>
                          {isComplete && <Check className="w-2.5 h-2.5 text-emerald-400" />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Status Message from Scan Result */}
            {statusMessage && (
              <div className="mt-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 flex items-center gap-2">
                <Info className="w-4 h-4 text-blue-500 shrink-0" />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Save Message */}
            {saveMessage && (
              <div
                className={`mt-3 p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                  saveMessage.type === 'success'
                    ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
                    : 'bg-red-50 border border-red-200 text-red-800'
                }`}
              >
                {saveMessage.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0" />
                )}
                <span>{saveMessage.text}</span>
              </div>
            )}
          </div>

          {/* Action Control Buttons */}
          <div className="pt-4 border-t border-slate-100 mt-4 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={handleScanImpression}
                disabled={currentScanning || (adapterMode === 'hardware' && deviceStatus === 'NOT_DETECTED')}
                className="flex-1 py-2.5 px-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
              >
                <Fingerprint className="w-4 h-4" />
                <span>{currentScanning ? 'Scanning...' : 'Scan Impression'}</span>
              </button>

              <button
                onClick={handleResetScans}
                className="py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              {isRegistrationFlow ? (
                <button
                  type="button"
                  onClick={() => {
                    if (onEnrollmentComplete) {
                      onEnrollmentComplete({
                        mode: adapterMode === 'hardware' ? 'HARDWARE_USB' : 'SIMULATED',
                        verifiedAt: Date.now(),
                        officerId: adminUser?.id || 'VRO-SIM-001',
                      });
                    }
                  }}
                  disabled={impressions.length === 0}
                  className="py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-sm"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirm Biometrics & Continue</span>
                </button>
              ) : (
                <button
                  onClick={handleSaveProgress}
                  disabled={isSaving || impressions.length === 0}
                  className="py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{isSaving ? 'Recording...' : 'Save Fingerprint'}</span>
                </button>
              )}

              <button
                onClick={onCancel || onBack}
                className="py-2.5 px-3 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>{isRegistrationFlow ? 'Cancel Registration' : 'Cancel'}</span>
              </button>
              {isRegistrationFlow && (
                <button
                  type="button"
                  onClick={onBack}
                  className="py-2.5 px-3 border border-slate-200 hover:bg-slate-50 text-slate-600 font-medium rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Back to Details</span>
                </button>
              )}
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Simulation Notice: No raw fingerprint images or templates are generated or stored.
            </p>
          </div>
        </div>

        {/* Middle Column (4 Cols): Instructions for the User */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-emerald-600" />
              <h2 className="text-base font-bold text-slate-900">Instructions for the User</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Step-by-step guidance for the elector during fingerprint capture.
            </p>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Clean Finger</span>
                  <span className="text-[11px] text-slate-500">Ensure the finger is clean and completely dry.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Use Same Finger</span>
                  <span className="text-[11px] text-slate-500">
                    Place the exact same finger for all 3–4 scan impressions.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Place Properly</span>
                  <span className="text-[11px] text-slate-500">
                    Put the center of the finger pad flat on the scanner platen.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  4
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Hold Still</span>
                  <span className="text-[11px] text-slate-500">Do not roll or slide the finger during exposure.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  5
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Repeat 3–4 Times</span>
                  <span className="text-[11px] text-slate-500">
                    Capture multiple sequential scans for accurate template fusion.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  6
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Check Confirmation</span>
                  <span className="text-[11px] text-slate-500">Wait for the green confirmation before lifting finger.</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-emerald-50/60 border border-emerald-200/60 rounded-lg text-[11px] text-emerald-900 flex items-start gap-2">
            <FileCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <span>
              Specimen capture guidelines align with ECI biometric voter registration and Aadhaar enrollment best practices.
            </span>
          </div>
        </div>

        {/* Right Column (3 Cols): Good vs Bad Examples */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">Good vs Bad Examples</h2>
            <p className="text-xs text-slate-500 mb-3">Specimen ridge clarity standards</p>

            {/* Good Specimen Card */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Good (Acceptable)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 rounded bg-emerald-50/70 border border-emerald-200 text-center">
                  <Fingerprint className="w-6 h-6 text-emerald-700 mx-auto mb-1" />
                  <span className="font-semibold text-emerald-900 block">Clear Ridges</span>
                  <span className="text-slate-500">Distinct whorls</span>
                </div>
                <div className="p-2 rounded bg-emerald-50/70 border border-emerald-200 text-center">
                  <Fingerprint className="w-6 h-6 text-emerald-700 mx-auto mb-1" />
                  <span className="font-semibold text-emerald-900 block">Centered</span>
                  <span className="text-slate-500">Core positioned</span>
                </div>
                <div className="p-2 rounded bg-emerald-50/70 border border-emerald-200 text-center">
                  <Fingerprint className="w-6 h-6 text-emerald-700 mx-auto mb-1" />
                  <span className="font-semibold text-emerald-900 block">Good Pressure</span>
                  <span className="text-slate-500">Uniform contact</span>
                </div>
                <div className="p-2 rounded bg-emerald-50/70 border border-emerald-200 text-center">
                  <Fingerprint className="w-6 h-6 text-emerald-700 mx-auto mb-1" />
                  <span className="font-semibold text-emerald-900 block">Complete</span>
                  <span className="text-slate-500">Full pad area</span>
                </div>
              </div>
            </div>

            {/* Bad Specimen Card */}
            <div className="space-y-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-red-700">
                <XCircle className="w-4 h-4 text-red-600" />
                <span>Bad (Not Acceptable)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 rounded bg-red-50/70 border border-red-200 text-center">
                  <span className="font-semibold text-red-900 block">Too Light</span>
                  <span className="text-slate-500">Insufficient contact</span>
                </div>
                <div className="p-2 rounded bg-red-50/70 border border-red-200 text-center">
                  <span className="font-semibold text-red-900 block">Partial</span>
                  <span className="text-slate-500">Edge clipped</span>
                </div>
                <div className="p-2 rounded bg-red-50/70 border border-red-200 text-center">
                  <span className="font-semibold text-red-900 block">Too Blurry</span>
                  <span className="text-slate-500">Motion blur</span>
                </div>
                <div className="p-2 rounded bg-red-50/70 border border-red-200 text-center">
                  <span className="font-semibold text-red-900 block">Smudged</span>
                  <span className="text-slate-500">Excess oil/moisture</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
            NFIQ 2.0 quality metrics require score ≥ 60 for automated enrollment.
          </div>
        </div>
      </div>

      {/* Bottom Grid: Device Indicators + Supported Fingers + Supervisor Fallback */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Device Status Indicators Reference (4 Cols) */}
        <div className="md:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Device Status Indicators</h3>
          <p className="text-xs text-slate-500 mb-3">Diagnostic meanings for hardware LEDs</p>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center gap-2.5 p-2 rounded bg-slate-50 border border-slate-100">
              <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <span className="font-bold text-slate-800">Connected:</span>
                <span className="text-slate-600 ml-1">Scanner is ready to use.</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2 rounded bg-slate-50 border border-slate-100">
              <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
              <div>
                <span className="font-bold text-slate-800">Not Detected:</span>
                <span className="text-slate-600 ml-1">Device not found. Check USB connection.</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2 rounded bg-slate-50 border border-slate-100">
              <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
              <div>
                <span className="font-bold text-slate-800">Error:</span>
                <span className="text-slate-600 ml-1">Device error. Restart driver service.</span>
              </div>
            </div>

            <div className="flex items-center gap-2.5 p-2 rounded bg-slate-50 border border-slate-100">
              <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
              <div>
                <span className="font-bold text-slate-800">Scanning:</span>
                <span className="text-slate-600 ml-1">Optical sensor is acquiring image.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Supported Finger Types (4 Cols) */}
        <div className="md:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
          <h3 className="text-sm font-bold text-slate-900 mb-1">Supported Finger Types</h3>
          <p className="text-xs text-slate-500 mb-3">Select the finger specimen currently being enrolled</p>

          <div className="grid grid-cols-5 gap-1.5 text-center text-xs">
            {[
              { type: 'THUMB', label: 'Thumb', rec: true },
              { type: 'INDEX', label: 'Index', rec: false },
              { type: 'MIDDLE', label: 'Middle', rec: false },
              { type: 'RING', label: 'Ring', rec: false },
              { type: 'LITTLE', label: 'Little', rec: false },
            ].map((f) => (
              <button
                key={f.type}
                onClick={() => setSelectedFinger(f.type as SupportedFingerType)}
                className={`p-2 rounded-lg border transition-all cursor-pointer flex flex-col items-center justify-between ${
                  selectedFinger === f.type
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold ring-2 ring-emerald-500/20'
                    : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <div className="w-6 h-10 rounded-full border border-slate-300 bg-white mb-1.5 flex items-center justify-center">
                  <Fingerprint className="w-4 h-4 text-slate-400" />
                </div>
                <span className="text-[11px] block">{f.label}</span>
                {f.rec && (
                  <span className="text-[9px] text-emerald-700 bg-emerald-100/80 px-1 rounded mt-0.5 font-semibold">
                    Rec.
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-3 text-[11px] text-slate-500">
            Selected for enrollment: <strong className="text-slate-800 font-mono">{selectedFinger}</strong>
          </div>
        </div>

        {/* Manual Physical-ID Verification / Phase 06 Active Section (4 Cols) */}
        <div className="md:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-2 text-purple-700">
              <FileCheck className="w-5 h-5 shrink-0" />
              <h3 className="text-sm font-bold text-slate-900">Physical-ID Exception Workflow</h3>
            </div>
            <p className="text-xs text-slate-600 mb-3 leading-relaxed">
              If the biometric scanner fails, an elector has worn ridges, or has a physical disability, request audited manual physical-ID verification.
            </p>

            {exceptionFeedback && (
              <div
                className={`p-2.5 rounded-lg text-xs mb-3 flex items-start gap-2 ${
                  exceptionFeedback.type === 'success'
                    ? 'bg-purple-50 border border-purple-200 text-purple-900'
                    : 'bg-red-50 border border-red-200 text-red-900'
                }`}
              >
                {exceptionFeedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                )}
                <span>{exceptionFeedback.text}</span>
              </div>
            )}

            {currentStatus === 'MANUALLY_APPROVED' ? (
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg text-xs space-y-1.5">
                <div className="font-bold flex items-center justify-between text-purple-900">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-purple-600 shrink-0" />
                    <span>MANUAL_PHYSICAL_ID_APPROVED</span>
                  </div>
                  <span className="text-[10px] bg-purple-200/80 text-purple-900 font-semibold px-2 py-0.5 rounded-full">
                    Approved
                  </span>
                </div>
                <p className="text-[11px] text-purple-800 leading-relaxed">
                  Election Officer physically inspected voter credential and granted manual exception approval.
                  <br />
                  <strong className="text-purple-950 font-semibold">Important:</strong> This elector is not recorded as a biometric match or enrolled specimen.
                </p>
                {activeExceptionRecord && (
                  <div className="pt-1.5 border-t border-purple-200/60 text-[11px] text-purple-900 space-y-0.5">
                    <div><strong>Approved By:</strong> {activeExceptionRecord.reviewedByOfficerId || 'Election Officer'}</div>
                    {activeExceptionRecord.decisionReason && (
                      <div><strong>Decision Note:</strong> {activeExceptionRecord.decisionReason}</div>
                    )}
                  </div>
                )}
                {isRegistrationFlow && onEnrollmentComplete && (
                  <button
                    type="button"
                    onClick={() =>
                      onEnrollmentComplete({
                        mode: 'MANUAL_OFFICER_OVERRIDE',
                        verifiedAt: activeExceptionRecord?.reviewedAt || Date.now(),
                        officerId: activeExceptionRecord?.reviewedByOfficerId || adminUser?.id || 'EO-SIM-001',
                      })
                    }
                    className="mt-2 w-full py-2 px-3 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Proceed to Step 3: Photo Inspection</span>
                  </button>
                )}
              </div>
            ) : currentStatus === 'PENDING_MANUAL_REVIEW' ? (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-1.5">
                <div className="font-bold flex items-center justify-between text-amber-900">
                  <div className="flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>PENDING_MANUAL_REVIEW</span>
                  </div>
                  <span className="text-[10px] bg-amber-200/80 text-amber-900 font-semibold px-2 py-0.5 rounded-full">
                    Under Review
                  </span>
                </div>
                <p className="text-[11px] text-amber-800 leading-relaxed">
                  Manual physical-ID exception request has been submitted. An authorized Election Officer will inspect physical credentials and render a decision in the review queue.
                </p>
                {activeExceptionRecord && (
                  <div className="pt-1.5 border-t border-amber-200/60 text-[11px] text-amber-900 space-y-0.5">
                    <div><strong>Request ID:</strong> <span className="font-mono">{activeExceptionRecord.id}</span></div>
                    <div><strong>Reason:</strong> {activeExceptionRecord.reasonCode}</div>
                    <div><strong>Requested By:</strong> {activeExceptionRecord.requestedByOfficerId}</div>
                    {activeExceptionRecord.requestedAt && (
                      <div><strong>Submitted At:</strong> {new Date(activeExceptionRecord.requestedAt).toLocaleTimeString()}</div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={fetchStatus}
                  className="mt-2 w-full py-1.5 px-2 bg-amber-100 hover:bg-amber-200 text-amber-900 font-semibold rounded text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Refresh Verification Status</span>
                </button>
              </div>
            ) : currentStatus === 'DECLINED' ? (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs space-y-1.5">
                <div className="font-bold flex items-center justify-between text-red-900">
                  <div className="flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-red-600 shrink-0" />
                    <span>MANUAL_PHYSICAL_ID_DECLINED</span>
                  </div>
                  <span className="text-[10px] bg-red-200/80 text-red-900 font-semibold px-2 py-0.5 rounded-full">
                    Declined
                  </span>
                </div>
                <p className="text-[11px] text-red-800 leading-relaxed">
                  Election Officer declined the manual physical-ID exception request following physical credential inspection.
                </p>
                {activeExceptionRecord?.decisionReason && (
                  <div className="pt-1.5 border-t border-red-200/60 text-[11px] text-red-900">
                    <strong>Officer Reason:</strong> {activeExceptionRecord.decisionReason}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowExceptionModal(true)}
                  className="mt-2 w-full py-1.5 px-2 bg-red-100 hover:bg-red-200 text-red-900 font-semibold rounded text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <FileCheck className="w-3.5 h-3.5" />
                  <span>Submit New Exception Request</span>
                </button>
              </div>
            ) : (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 space-y-1">
                <div className="font-semibold text-slate-800">Physical-ID Exception Protocol:</div>
                <p>
                  Election Officers will physically inspect the government ID card. No photos or document numbers are uploaded or stored.
                </p>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-slate-100 mt-3">
            {currentStatus !== 'MANUALLY_APPROVED' && currentStatus !== 'PENDING_MANUAL_REVIEW' && (
              <button
                onClick={() => setShowExceptionModal(true)}
                disabled={isSubmittingException}
                className="w-full py-2 px-3 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer shadow-xs"
              >
                {isSubmittingException ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-4 h-4" />
                    <span>Request Manual Verification</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Manual Exception Request Modal */}
      {showExceptionModal && effectiveVoter && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <FileCheck className="w-5 h-5 text-purple-600" />
                <h3 className="text-base font-bold text-slate-900">
                  Request Manual Physical-ID Verification
                </h3>
              </div>
              <button
                onClick={() => setShowExceptionModal(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Voter Details */}
            <div className="bg-slate-50 p-3 rounded-lg text-xs space-y-1 border border-slate-200">
              <div className="flex justify-between">
                <span className="text-slate-500">Elector Name:</span>
                <span className="font-bold text-slate-900">{effectiveVoter.fullName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Simulation Voter ID:</span>
                <span className="font-mono font-bold text-slate-800">{effectiveVoter.simulationVoterId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Modality:</span>
                <span className="font-semibold text-emerald-700">Fingerprint</span>
              </div>
            </div>

            {/* Reason Code Dropdown */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Reason Code <span className="text-red-500">*</span>
              </label>
              <select
                value={exceptionReason}
                onChange={(e) => setExceptionReason(e.target.value as ExceptionReasonCode)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:bg-white"
              >
                <option value="FINGERPRINT_SCANNER_NOT_DETECTED">
                  FINGERPRINT_SCANNER_NOT_DETECTED — Hardware sensor offline or not detected
                </option>
                <option value="SUPPORTED_DEVICE_ERROR">
                  SUPPORTED_DEVICE_ERROR — Device optical acquisition error
                </option>
                <option value="WORN_FRICTION_RIDGES">
                  WORN_FRICTION_RIDGES — Elector has worn, damaged, or faint ridge patterns
                </option>
                <option value="PHYSICAL_DISABILITY_OR_AMPUTATION">
                  PHYSICAL_DISABILITY_OR_AMPUTATION — Permanent or temporary physical disability
                </option>
                <option value="OTHER_OFFICIAL_REASON">
                  OTHER_OFFICIAL_REASON — Other documented election official reason
                </option>
              </select>
            </div>

            {/* Non-sensitive Note Input */}
            <div>
              <label className="block text-xs font-bold text-slate-800 mb-1">
                Explanatory Note <span className="text-slate-400 font-normal">(Optional, max 300 chars)</span>
              </label>
              <textarea
                rows={2}
                maxLength={300}
                placeholder="Brief justification (e.g. 'USB optical sensor daemon failed to report platen ready'). Do NOT enter document numbers or sensitive info."
                value={exceptionNote}
                onChange={(e) => setExceptionNote(e.target.value)}
                className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-purple-500 focus:bg-white"
              />
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Privacy Notice: Never enter ID card numbers (Aadhaar, Passport, etc.) or upload photos.
              </span>
            </div>

            <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-900">
              <strong>Procedural Standard:</strong> Approval will be decided by an Election Officer upon direct physical document review. The approved outcome is recorded as <code className="font-mono bg-amber-100 px-1 rounded">MANUAL_PHYSICAL_ID_APPROVED</code>, never as a biometric match.
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                onClick={() => setShowExceptionModal(false)}
                disabled={isSubmittingException}
                className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleRequestException}
                disabled={isSubmittingException}
                className="px-4 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5"
              >
                {isSubmittingException ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Submitting Request...</span>
                  </>
                ) : (
                  <>
                    <FileCheck className="w-3.5 h-3.5" />
                    <span>Submit Exception Request</span>
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
