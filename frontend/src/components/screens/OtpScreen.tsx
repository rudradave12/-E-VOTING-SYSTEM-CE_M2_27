import React, { useState, useEffect } from 'react';
import { VoterRecord } from '../../types';
import { voterApi } from '../../services/voterApi';

import { KeyRound, Clock, ShieldAlert, ArrowRight, RotateCw, CheckCircle2 } from 'lucide-react';

interface OtpScreenProps {
  voter: VoterRecord;
  onOtpVerified: () => void;
  onBack: () => void;
  testDeliveryCode?: string;
}

export const OtpScreen: React.FC<OtpScreenProps> = ({
  voter,
  onOtpVerified,
  onBack,
  testDeliveryCode,
}) => {
  const [currentCode, setCurrentCode] = useState<string>(testDeliveryCode || '');
  const [otp, setOtp] = useState<string>('');
  const [attemptsRemaining, setAttemptsRemaining] = useState<number>(3);
  const [timeLeft, setTimeLeft] = useState<number>(180); // 180 seconds (3 mins as per research report)
  const [resendCooldown, setResendCooldown] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  useEffect(() => {
    if (testDeliveryCode) {
      setCurrentCode(testDeliveryCode);
    }
  }, [testDeliveryCode]);

  useEffect(() => {
    if (timeLeft <= 0) return;
    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLeft]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const cooldownTimer = setInterval(() => {
      setResendCooldown((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(cooldownTimer);
  }, [resendCooldown]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (attemptsRemaining <= 0) {
      setError('Maximum verification attempts exceeded. Your session has been locked for security.');
      return;
    }

    if (timeLeft <= 0) {
      setError('OTP has expired. Please request a new 6-digit verification code.');
      return;
    }

    if (otp.trim().length !== 6) {
      setError('Please enter all 6 digits of the verification code.');
      return;
    }

    setIsVerifying(true);

    try {
      // Call server-side API endpoint POST /api/voter/verify-otp
      const res = await voterApi.verifyOtp(voter.epicId, otp.trim());

      if (res.success) {
        setIsVerifying(false);
        onOtpVerified();
        return;
      }

      if (res.attemptsRemaining !== undefined) {
        setAttemptsRemaining(res.attemptsRemaining);
      }
      setError(res.message || 'Verification failed. Please check the code and try again.');
    } catch (err: any) {
      // Fail closed: Never grant authorization or verify hashes locally
      setError(
        err.message || 'Verification service unreachable. Please ensure network connectivity and retry.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return;
    try {
      const res = await voterApi.verifyVoter(voter.epicId);
      if (res.testDeliveryCode) {
        setCurrentCode(res.testDeliveryCode);
      }
    } catch {
      // fallback
    }
    setTimeLeft(180);
    setAttemptsRemaining(3);
    setResendCooldown(60);
    setError(null);
    setOtp('');
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="max-w-xl mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-8 shadow-xs">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 uppercase tracking-widest mb-1">
            <span>Step 2 of 6</span>
            <span aria-hidden="true">·</span>
            <span>Two-Factor Authentication</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Enter 6-Digit Verification Code
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            A time-limited verification code has been dispatched to the mobile number registered with your EPIC.
          </p>
        </div>

        {/* Elector Identity Summary Card */}
        <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1.5 mb-6">
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Elector Name:</span>
            <span className="font-semibold text-slate-900">{voter.name}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">EPIC ID:</span>
            <span className="font-mono font-medium text-slate-800">{voter.epicId}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-slate-500">Registered Destination:</span>
            <span className="font-mono text-slate-800">{voter.maskedMobile}</span>
          </div>
        </div>

        {currentCode && (
        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-900 mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <KeyRound className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Demo verification code: <span className="font-mono font-bold tracking-wider text-amber-950 text-sm">{currentCode}</span>
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              setOtp(currentCode);
              setError(null);
            }}
            className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 underline cursor-pointer self-end sm:self-auto"
          >
            Auto-fill
          </button>
        </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label htmlFor="otp-input" className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                Security OTP Code <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-1.5 text-xs font-mono text-slate-600">
                <Clock className="w-3.5 h-3.5 text-slate-400" />
                <span className={timeLeft < 60 ? 'text-red-600 font-bold' : ''}>
                  {formatTime(timeLeft)}
                </span>
              </div>
            </div>

            <input
              id="otp-input"
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={otp}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, '');
                setOtp(val);
                setError(null);
              }}
              placeholder="0 0 0 0 0 0"
              disabled={attemptsRemaining <= 0 || timeLeft <= 0}
              className="w-full text-center px-3 sm:px-4 py-3 sm:py-3.5 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-xl sm:text-2xl tracking-[0.25em] sm:tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all disabled:opacity-50"
            />

            <div className="flex items-center justify-between mt-2 text-xs text-slate-500">
              <span>Attempts remaining: <span className="font-bold text-slate-700">{attemptsRemaining}/3</span></span>
              <button
                type="button"
                onClick={handleResendOtp}
                disabled={resendCooldown > 0}
                className="text-xs font-medium text-orange-700 hover:text-orange-800 disabled:text-slate-400 disabled:cursor-not-allowed flex items-center gap-1 cursor-pointer"
              >
                <RotateCw className="w-3 h-3" />
                <span>{resendCooldown > 0 ? `Resend in ${resendCooldown}s` : 'Resend OTP'}</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">{error}</p>
            </div>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onBack}
              className="w-full sm:w-auto px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 sm:border-transparent rounded-lg transition-colors cursor-pointer text-center"
            >
              Back to Identification
            </button>

            <button
              type="submit"
              disabled={isVerifying || attemptsRemaining <= 0 || timeLeft <= 0 || otp.length !== 6}
              className="w-full sm:w-auto px-6 py-3 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-300 text-white font-semibold rounded-lg shadow-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed text-sm"
            >
              <span>{isVerifying ? 'Verifying Challenge...' : 'Authorize Session'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
