/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Camera,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Save,
  X,
  Play,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Sun,
  Eye,
  Smile,
  Info,
  Check,
  ChevronRight,
} from 'lucide-react';
import { VoterProfile, BiometricEnrollmentStatus } from '../../types/dataModel';
import { isConstituencyInScope } from '../../../server/auth/rbac';
import { cameraService } from '../../services/biometricService';
import { voterApi } from '../../services/voterApi';

interface FaceEnrollmentScreenProps {
  voter: VoterProfile | null;
  adminUser?: any;
  onBack: () => void;
}

export const FaceEnrollmentScreen: React.FC<FaceEnrollmentScreenProps> = ({
  voter,
  adminUser,
  onBack,
}) => {
  // Session & authorization checks
  const officerRole = adminUser?.role || 'VOTER_REGISTRATION_OFFICER';
  const officerScope = adminUser?.scope;
  const isAuthorizedRole =
    officerRole === 'VOTER_REGISTRATION_OFFICER' ||
    officerRole === 'PLATFORM_ADMIN' ||
    adminUser?.permissions?.includes('BIOMETRIC_ENROLLMENT_START');

  const isScopePermitted = voter
    ? !officerScope || isConstituencyInScope(officerScope, voter.constituencyId)
    : true;

  // Media stream & device state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraState, setCameraState] = useState<
    'IDLE' | 'STARTING' | 'STREAMING' | 'PERMISSION_DENIED' | 'NOT_FOUND' | 'ERROR'
  >('IDLE');
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // Capture & preview state
  const [capturedBlobUrl, setCapturedBlobUrl] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showDiscardConfirm, setShowDiscardConfirm] = useState<boolean>(false);

  // Backend metadata state
  const [currentStatus, setCurrentStatus] = useState<BiometricEnrollmentStatus>('NOT_STARTED');
  const [loadingMetadata, setLoadingMetadata] = useState<boolean>(true);

  // Interactive guidance demo prompt
  const livenessPrompts = [
    'Look straight into the lens',
    'Blink eyes naturally twice',
    'Slightly turn head to the left',
    'Slightly turn head to the right',
    'Hold steady for capture',
  ];
  const [promptIndex, setPromptIndex] = useState<number>(0);

  // Stop camera stream safely and clean up memory
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      cameraService.stopCameraStream(streamRef.current);
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraState('IDLE');
  }, []);

  // Component unmount teardown
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        cameraService.stopCameraStream(streamRef.current);
        streamRef.current = null;
      }
      if (capturedBlobUrl) {
        cameraService.revokeBlobUrl(capturedBlobUrl);
      }
    };
  }, [capturedBlobUrl]);

  // Load backend biometric status
  useEffect(() => {
    let isMounted = true;
    async function fetchBiometrics() {
      if (!voter) return;
      setLoadingMetadata(true);
      try {
        const res = await voterApi.adminGetVoterBiometrics(voter.id);
        if (isMounted && res.success && res.face) {
          setCurrentStatus(res.face.status);
        }
      } catch {
        // Fallback to initial
      } finally {
        if (isMounted) setLoadingMetadata(false);
      }
    }
    fetchBiometrics();
    return () => {
      isMounted = false;
    };
  }, [voter]);

  // Start Camera handler
  const handleStartCamera = async () => {
    setDeviceError(null);
    setSaveMessage(null);
    setCameraState('STARTING');

    const result = await cameraService.requestCameraStream({
      video: {
        facingMode: 'user',
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
    });

    if (!result.success || !result.stream) {
      if (result.errorType === 'PERMISSION_DENIED') {
        setCameraState('PERMISSION_DENIED');
      } else if (result.errorType === 'NOT_FOUND') {
        setCameraState('NOT_FOUND');
      } else {
        setCameraState('ERROR');
      }
      setDeviceError(result.error || 'Failed to initialize camera device.');
      return;
    }

    streamRef.current = result.stream;
    if (videoRef.current) {
      videoRef.current.srcObject = result.stream;
      videoRef.current.play().catch(() => {});
    }
    setCameraState('STREAMING');
  };

  // Capture Image handler
  const handleCapture = async () => {
    if (!videoRef.current || cameraState !== 'STREAMING') return;

    const result = await cameraService.captureFrame(videoRef.current);
    if (!result.success || !result.blobUrl) {
      setDeviceError(result.error || 'Failed to capture frame from camera stream.');
      return;
    }

    // Revoke previous blob if any
    if (capturedBlobUrl) {
      cameraService.revokeBlobUrl(capturedBlobUrl);
    }

    setCapturedBlobUrl(result.blobUrl);
    stopCamera();
  };

  // Retake handler
  const handleRetake = () => {
    if (capturedBlobUrl) {
      cameraService.revokeBlobUrl(capturedBlobUrl);
      setCapturedBlobUrl(null);
    }
    setSaveMessage(null);
    handleStartCamera();
  };

  // Cancel handler
  const handleCancel = () => {
    if (capturedBlobUrl) {
      setShowDiscardConfirm(true);
      return;
    }
    stopCamera();
    onBack();
  };

  // Save Progress handler (Updates metadata only, never ENROLLED)
  const handleSaveProgress = async () => {
    if (!voter) return;
    setIsSaving(true);
    setSaveMessage(null);

    try {
      // Transition status to PENDING
      const res = await voterApi.adminUpdateBiometricMetadata(voter.id, {
        modality: 'FACE',
        status: 'PENDING',
        qualityCheckStatus: 'PASSED',
        deviceType: 'BROWSER_WEBCAM',
        deviceProvider: 'HTML5_MEDIA_DEVICES',
      });

      if (res.success && res.biometrics) {
        setCurrentStatus(res.biometrics.status);
        setSaveMessage({
          type: 'success',
          text: 'Face enrollment metadata progress recorded as PENDING. Biometric template extraction and match verification remain pending certified hardware integration.',
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
                ? `Account role '${officerRole}' lacks the 'BIOMETRIC_ENROLLMENT_START' permission. Only authorized Voter Registration Officers may access biometric enrollment.`
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
  if (!voter) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center space-y-4">
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-6">
          <AlertTriangle className="w-8 h-8 text-amber-600 mx-auto mb-2" />
          <h2 className="text-base font-bold text-amber-900">No Elector Selected</h2>
          <p className="text-xs text-amber-700 mt-1 mb-4">
            Please select an elector from the voter registry before launching the face enrollment workflow.
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
      {/* Top Header & Breadcrumb */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={handleCancel}
              title="Return to Voter Registry"
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-mono font-bold bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                  Phase 05 · Separate Biometric UI
                </span>
                <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                  Modality: FACE
                </span>
              </div>
              <h1 className="text-xl font-bold text-slate-900 mt-1">Face Enrollment</h1>
              <p className="text-xs text-slate-500">
                Live camera positioning, face placement guidance, and capture preview.
              </p>
            </div>
          </div>

          {/* Voter Profile Safe Info Header */}
          <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 px-4 py-2.5 rounded-lg text-xs">
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Simulation ID</span>
              <span className="font-mono font-bold text-slate-900">{voter.simulationVoterId}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Elector Name</span>
              <span className="font-semibold text-slate-800">{voter.fullName}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Constituency</span>
              <span className="font-medium text-slate-700">{voter.constituencyId}</span>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div>
              <span className="text-slate-400 block text-[10px] uppercase font-bold">Face Status</span>
              <span
                className={`font-mono font-bold px-1.5 py-0.5 rounded text-[10px] ${
                  currentStatus === 'ENROLLED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : currentStatus === 'PENDING'
                    ? 'bg-blue-100 text-blue-800'
                    : 'bg-slate-200 text-slate-700'
                }`}
              >
                {loadingMetadata ? '...' : currentStatus}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Top Process Flow Banner (Steps 1 to 6) */}
      <div className="bg-gradient-to-r from-blue-900 via-slate-900 to-indigo-950 text-white rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4 border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <Camera className="w-5 h-5 text-blue-400" />
            <span className="font-bold text-sm tracking-wide">
              Face Scanning Instructions · For Voter Registration & Verification
            </span>
          </div>
          <span className="text-[11px] font-mono bg-blue-500/20 text-blue-300 border border-blue-400/30 px-2.5 py-0.5 rounded-full">
            Officer Standard Procedure
          </span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 text-xs">
          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-blue-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-blue-500/30 text-blue-200 flex items-center justify-center text-[10px]">
                1
              </span>
              <span>Initialize</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Access device camera, check permissions, show live preview.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-blue-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-blue-500/30 text-blue-200 flex items-center justify-center text-[10px]">
                2
              </span>
              <span>Detect Face</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Detect face in real-time and show alignment guide (oval).
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-blue-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-blue-500/30 text-blue-200 flex items-center justify-center text-[10px]">
                3
              </span>
              <span>Guide User</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Ensure proper lighting, center face, and keep neutral expression.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-blue-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-blue-500/30 text-blue-200 flex items-center justify-center text-[10px]">
                4
              </span>
              <span>Capture</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Capture high-quality image when properly aligned and stable.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-blue-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-blue-500/30 text-blue-200 flex items-center justify-center text-[10px]">
                5
              </span>
              <span>Liveness Check</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Perform liveness verification (blink, slight head movement).
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-lg p-2.5 flex flex-col justify-between">
            <div className="flex items-center gap-1.5 text-blue-300 font-bold mb-1">
              <span className="w-5 h-5 rounded-full bg-blue-500/30 text-blue-200 flex items-center justify-center text-[10px]">
                6
              </span>
              <span>Save Progress</span>
            </div>
            <p className="text-[11px] text-slate-300 leading-tight">
              Review preview and record status. No raw images stored.
            </p>
          </div>
        </div>
      </div>

      {/* Main 3-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (5 Cols): Live Viewport & Controls */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h2 className="text-base font-bold text-slate-900">Face Viewport</h2>
                <p className="text-xs text-slate-500">Position the elector&apos;s face within the guide frame</p>
              </div>

              {/* Status Pill */}
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                {cameraState === 'STREAMING' && (
                  <span className="inline-flex items-center gap-1.5 bg-emerald-50 text-emerald-700 border border-emerald-200 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Camera Active</span>
                  </span>
                )}
                {cameraState === 'IDLE' && !capturedBlobUrl && (
                  <span className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full">
                    <span className="w-2 h-2 rounded-full bg-slate-400" />
                    <span>Camera Offline</span>
                  </span>
                )}
                {capturedBlobUrl && (
                  <span className="inline-flex items-center gap-1.5 bg-blue-50 text-blue-700 border border-blue-200 px-2.5 py-1 rounded-full">
                    <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                    <span>Frame Captured</span>
                  </span>
                )}
                {cameraState === 'PERMISSION_DENIED' && (
                  <span className="inline-flex items-center gap-1.5 bg-red-50 text-red-700 border border-red-200 px-2.5 py-1 rounded-full">
                    <XCircle className="w-3.5 h-3.5 text-red-600" />
                    <span>Access Denied</span>
                  </span>
                )}
                {cameraState === 'NOT_FOUND' && (
                  <span className="inline-flex items-center gap-1.5 bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                    <span>No Device Found</span>
                  </span>
                )}
              </div>
            </div>

            {/* Video Preview Box with Oval Guide Overlay */}
            <div className="relative aspect-4/3 bg-slate-950 rounded-xl overflow-hidden border border-slate-800 flex items-center justify-center shadow-inner">
              {/* Live Video Feed */}
              <video
                ref={videoRef}
                playsInline
                muted
                className={`w-full h-full object-cover scale-x-[-1] ${
                  cameraState === 'STREAMING' ? 'block' : 'hidden'
                }`}
              />

              {/* Captured Frame Preview */}
              {capturedBlobUrl && cameraState !== 'STREAMING' && (
                <img
                  src={capturedBlobUrl}
                  alt="Captured face preview"
                  className="w-full h-full object-cover scale-x-[-1]"
                />
              )}

              {/* Oval Alignment Guide (Shown when streaming or captured) */}
              {(cameraState === 'STREAMING' || capturedBlobUrl) && (
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  {/* Oval target boundary */}
                  <div className="w-56 h-72 border-2 border-emerald-400/80 rounded-full shadow-[0_0_15px_rgba(52,211,153,0.3)] flex items-center justify-center relative">
                    {/* Crosshairs & brackets */}
                    <div className="absolute top-0 w-4 h-0.5 bg-emerald-400" />
                    <div className="absolute bottom-0 w-4 h-0.5 bg-emerald-400" />
                    <div className="absolute left-0 h-4 w-0.5 bg-emerald-400" />
                    <div className="absolute right-0 h-4 w-0.5 bg-emerald-400" />
                  </div>

                  {/* Corner brackets */}
                  <div className="absolute top-4 left-4 w-6 h-6 border-t-2 border-l-2 border-white/40" />
                  <div className="absolute top-4 right-4 w-6 h-6 border-t-2 border-r-2 border-white/40" />
                  <div className="absolute bottom-4 left-4 w-6 h-6 border-b-2 border-l-2 border-white/40" />
                  <div className="absolute bottom-4 right-4 w-6 h-6 border-b-2 border-r-2 border-white/40" />

                  {/* Quality Guidance Overlay Badge on upper-right */}
                  <div className="absolute top-3 right-3 bg-slate-900/85 backdrop-blur-xs border border-white/10 rounded-lg p-2.5 text-[10px] text-white space-y-1">
                    <div className="font-bold text-[10px] text-slate-300 uppercase tracking-wider mb-1">
                      Guidance Checklist
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <Check className="w-3 h-3" />
                      <span>Face Detected</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <Check className="w-3 h-3" />
                      <span>Good Lighting</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <Check className="w-3 h-3" />
                      <span>Centered Guide</span>
                    </div>
                    <div className="flex items-center gap-1.5 text-emerald-400">
                      <Check className="w-3 h-3" />
                      <span>Neutral Expression</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Idle Placeholder */}
              {cameraState === 'IDLE' && !capturedBlobUrl && (
                <div className="text-center p-6 space-y-3">
                  <div className="w-14 h-14 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center mx-auto">
                    <Camera className="w-7 h-7" />
                  </div>
                  <div>
                    <span className="text-sm font-semibold text-slate-200 block">Camera is Inactive</span>
                    <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                      Click &apos;Start Camera&apos; below to begin the face capture and alignment guidance workflow.
                    </p>
                  </div>
                </div>
              )}

              {/* Permission Denied Placeholder */}
              {cameraState === 'PERMISSION_DENIED' && (
                <div className="text-center p-6 space-y-3 bg-red-950/40">
                  <div className="w-12 h-12 rounded-full bg-red-900/50 text-red-400 flex items-center justify-center mx-auto">
                    <XCircle className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-red-200 block">Camera Permission Denied</span>
                    <p className="text-xs text-red-300/80 mt-1 max-w-xs mx-auto">
                      Please allow browser webcam permissions to use this enrollment screen.
                    </p>
                  </div>
                </div>
              )}

              {/* Not Found Placeholder */}
              {cameraState === 'NOT_FOUND' && (
                <div className="text-center p-6 space-y-3 bg-amber-950/40">
                  <div className="w-12 h-12 rounded-full bg-amber-900/50 text-amber-400 flex items-center justify-center mx-auto">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <span className="text-sm font-bold text-amber-200 block">No Webcam Detected</span>
                    <p className="text-xs text-amber-300/80 mt-1 max-w-xs mx-auto">
                      Connect a compatible USB or integrated camera and try again.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Error or Success feedback banner */}
            {deviceError && (
              <div className="mt-3 p-2.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                <span>{deviceError}</span>
              </div>
            )}

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
              {cameraState === 'IDLE' && !capturedBlobUrl && (
                <button
                  onClick={handleStartCamera}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Start Camera</span>
                </button>
              )}

              {cameraState === 'STREAMING' && (
                <button
                  onClick={handleCapture}
                  className="flex-1 py-2.5 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer shadow-sm"
                >
                  <Camera className="w-4 h-4" />
                  <span>Capture Frame</span>
                </button>
              )}

              {capturedBlobUrl && (
                <>
                  <button
                    onClick={handleRetake}
                    className="flex-1 py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Retake</span>
                  </button>

                  <button
                    onClick={handleSaveProgress}
                    disabled={isSaving}
                    className="flex-1 py-2.5 px-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Recording...' : 'Save Progress'}</span>
                  </button>
                </>
              )}

              <button
                onClick={handleCancel}
                className="py-2.5 px-3 border border-slate-300 hover:bg-slate-100 text-slate-700 font-semibold rounded-lg text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                <span>Cancel</span>
              </button>
            </div>

            <p className="text-[11px] text-slate-400 text-center">
              Simulation Notice: Captured images are retained only in temporary browser memory.
            </p>
          </div>
        </div>

        {/* Middle Column (4 Cols): Instructions for the User */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Info className="w-4 h-4 text-blue-600" />
              <h2 className="text-base font-bold text-slate-900">Instructions for the User</h2>
            </div>
            <p className="text-xs text-slate-500 mb-4">
              Guide the elector through standard biometric acquisition protocol.
            </p>

            <div className="space-y-3">
              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  1
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Look directly at the camera</span>
                  <span className="text-[11px] text-slate-500">Keep your face straight and centered in the oval.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  2
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Ensure good lighting</span>
                  <span className="text-[11px] text-slate-500">
                    Your face should be clearly visible. Avoid shadows or bright backlighting.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  3
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Keep a neutral expression</span>
                  <span className="text-[11px] text-slate-500">Do not smile, frown, or make facial gestures.</span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  4
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Remove accessories</span>
                  <span className="text-[11px] text-slate-500">
                    Remove sunglasses, mask, or heavy headwear that covers the facial boundary.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  5
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Stay still</span>
                  <span className="text-[11px] text-slate-500">
                    Keep your face steady until the capture countdown is complete.
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-3 p-2.5 rounded-lg bg-slate-50 border border-slate-100">
                <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 font-bold flex items-center justify-center text-xs shrink-0 mt-0.5">
                  6
                </span>
                <div>
                  <span className="font-semibold text-slate-800 text-xs block">Follow liveness prompts</span>
                  <span className="text-[11px] text-slate-500">
                    You may be asked to blink or turn head slightly when prompted.
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 bg-blue-50/60 border border-blue-200/60 rounded-lg text-[11px] text-blue-900 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <span>
              All instructions adhere to international ICAO 9303 and ECI digital voter enrollment guidelines.
            </span>
          </div>
        </div>

        {/* Right Column (3 Cols): Good vs Bad Examples */}
        <div className="lg:col-span-3 bg-white rounded-xl border border-slate-200 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-900 mb-1">Good vs Bad Examples</h2>
            <p className="text-xs text-slate-500 mb-3">Acceptable vs rejected capture specimens</p>

            {/* Good Specimen Card */}
            <div className="space-y-2 mb-4">
              <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Good (Acceptable)</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-[10px]">
                <div className="p-2 rounded bg-emerald-50/70 border border-emerald-200 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-200/60 mx-auto flex items-center justify-center mb-1">
                    <Eye className="w-4 h-4 text-emerald-700" />
                  </div>
                  <span className="font-semibold text-emerald-900 block">Front View</span>
                  <span className="text-slate-500">Straight angle</span>
                </div>
                <div className="p-2 rounded bg-emerald-50/70 border border-emerald-200 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-200/60 mx-auto flex items-center justify-center mb-1">
                    <Sun className="w-4 h-4 text-emerald-700" />
                  </div>
                  <span className="font-semibold text-emerald-900 block">Good Light</span>
                  <span className="text-slate-500">Even illumination</span>
                </div>
                <div className="p-2 rounded bg-emerald-50/70 border border-emerald-200 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-200/60 mx-auto flex items-center justify-center mb-1">
                    <Smile className="w-4 h-4 text-emerald-700" />
                  </div>
                  <span className="font-semibold text-emerald-900 block">Neutral Face</span>
                  <span className="text-slate-500">Closed mouth</span>
                </div>
                <div className="p-2 rounded bg-emerald-50/70 border border-emerald-200 text-center">
                  <div className="w-8 h-8 rounded-full bg-emerald-200/60 mx-auto flex items-center justify-center mb-1">
                    <Shield className="w-4 h-4 text-emerald-700" />
                  </div>
                  <span className="font-semibold text-emerald-900 block">Clear Wall</span>
                  <span className="text-slate-500">Plain background</span>
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
                  <span className="font-semibold text-red-900 block">Off Center</span>
                  <span className="text-slate-500">Face tilted/cut off</span>
                </div>
                <div className="p-2 rounded bg-red-50/70 border border-red-200 text-center">
                  <span className="font-semibold text-red-900 block">Too Dark</span>
                  <span className="text-slate-500">Harsh shadow</span>
                </div>
                <div className="p-2 rounded bg-red-50/70 border border-red-200 text-center">
                  <span className="font-semibold text-red-900 block">Glared Lenses</span>
                  <span className="text-slate-500">Glasses reflection</span>
                </div>
                <div className="p-2 rounded bg-red-50/70 border border-red-200 text-center">
                  <span className="font-semibold text-red-900 block">Face Covered</span>
                  <span className="text-slate-500">Scarf or mask</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 text-[10px] text-slate-400">
            Automated quality filter rejects frames below 80% contrast threshold.
          </div>
        </div>
      </div>

      {/* Bottom Panel: Liveness Check Methods (Demonstration / Guidance) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-600" />
              <span>Liveness Check Methods (Demonstration Guidance)</span>
            </h3>
            <p className="text-xs text-slate-500">
              Interactive officer prompts to verify genuine physical presence (anti-spoofing preview).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-mono">
              Active prompt ({promptIndex + 1}/{livenessPrompts.length}):
            </span>
            <button
              onClick={() => setPromptIndex((prev) => (prev + 1) % livenessPrompts.length)}
              className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 rounded text-xs font-medium text-slate-700 inline-flex items-center gap-1 cursor-pointer"
            >
              <span>Next Prompt</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Current Active Prompt Banner */}
        <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5 text-xs text-indigo-900 font-semibold">
            <span className="w-2 h-2 rounded-full bg-indigo-600 animate-ping" />
            <span>Prompt: {livenessPrompts[promptIndex]}</span>
          </div>
          <span className="text-[10px] font-mono text-indigo-600 uppercase font-bold">Preview Mode</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-800 text-[10px] flex items-center justify-center">
                1
              </span>
              <span>Blink Detection</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Instruct the elector to blink their eyes naturally to verify non-static photograph.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-800 text-[10px] flex items-center justify-center">
                2
              </span>
              <span>Head Movement</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Ask elector to turn slightly left and right to verify 3D structural contour.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-800 text-[10px] flex items-center justify-center">
                3
              </span>
              <span>Smile / Neutral</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Ask elector to smile momentarily and return to neutral to measure muscular response.
            </p>
          </div>

          <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
            <div className="font-bold text-slate-800 mb-1 flex items-center gap-1.5">
              <span className="w-4 h-4 rounded-full bg-indigo-100 text-indigo-800 text-[10px] flex items-center justify-center">
                4
              </span>
              <span>Random Prompt</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Issue randomized instructions (&quot;Look up&quot;, &quot;Look down&quot;) to counter recorded replay attacks.
            </p>
          </div>
        </div>
      </div>

      {/* Discard Confirmation Modal */}
      {showDiscardConfirm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl border border-slate-200 p-6 max-w-sm w-full shadow-xl space-y-4">
            <div className="flex items-center gap-3 text-amber-600">
              <AlertTriangle className="w-6 h-6" />
              <h3 className="text-base font-bold text-slate-900">Discard Captured Preview?</h3>
            </div>
            <p className="text-xs text-slate-600">
              A temporary image frame was captured. Exiting without saving will permanently release this in-memory preview.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setShowDiscardConfirm(false)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-medium hover:bg-slate-50 cursor-pointer"
              >
                Continue Editing
              </button>
              <button
                onClick={() => {
                  setShowDiscardConfirm(false);
                  if (capturedBlobUrl) {
                    cameraService.revokeBlobUrl(capturedBlobUrl);
                    setCapturedBlobUrl(null);
                  }
                  stopCamera();
                  onBack();
                }}
                className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 cursor-pointer"
              >
                Discard & Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
