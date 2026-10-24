/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { VoterRecord } from '../../types';
import { voterApi } from '../../services/voterApi';
import { Search, AlertCircle, ArrowRight, ShieldAlert, Loader2 } from 'lucide-react';

interface IdentifyScreenProps {
  onVoterIdentified: (voter: VoterRecord, testDeliveryCode?: string) => void;
  onCancel: () => void;
  activeEpicId?: string;
  voters?: VoterRecord[];
}

export const IdentifyScreen: React.FC<IdentifyScreenProps> = ({
  onVoterIdentified,
  onCancel,
  activeEpicId,
}) => {
  const [epicInput, setEpicInput] = useState<string>(activeEpicId || '');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState<boolean>(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const formatted = epicInput.trim().toUpperCase();
    if (!formatted) {
      setError('Please enter a valid Elector Photo Identity Card (EPIC) number.');
      return;
    }

    setIsVerifying(true);
    try {
      // Voter identification operates strictly fail-closed via the backend API.
      // Client-side array lookups and fallback lists have been removed in Phase 01.
      const res = await voterApi.verifyVoter(formatted);

      if (!res.success) {
        setError(res.message || `EPIC record "${formatted}" could not be verified by the electoral authority.`);
        setIsVerifying(false);
        return;
      }

      if (!res.voter) {
        setError('Voter verification failed: Server response did not provide a validated elector record.');
        setIsVerifying(false);
        return;
      }

      if (!res.voter.isEligible) {
        setError(
          `Electoral Ineligibility Notice: Elector ${res.voter.name} is marked as ineligible to cast a ballot in this election.`
        );
        setIsVerifying(false);
        return;
      }

      if (res.voter.status === 'VOTED') {
        setError(
          `Double-Voting Safeguard: Elector ${res.voter.name} (${res.voter.epicId}) has already cast an authorized on-chain ballot in this election. Second submissions are strictly prohibited.`
        );
        setIsVerifying(false);
        return;
      }

      // Verification succeeded; transition to OTP challenge step
      onVoterIdentified(res.voter, res.testDeliveryCode);
    } catch {
      // Fail closed on network failure or unexpected exceptions
      setError(
        'Unable to connect to the voter verification service. Voter identification requires an active, authenticated server connection.'
      );
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 uppercase tracking-widest mb-1">
            <span>Step 1 of 6</span>
            <span aria-hidden="true">·</span>
            <span>Voter Authentication</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Elector Photo Identity Card (EPIC) Verification
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Please enter your EPIC ID to verify your enrollment in the registered parliamentary electoral roll.
          </p>
        </div>

        {/* Informational Guidance */}
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 mb-6 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <span className="font-semibold">Fail-Closed Verification:</span> Identification requires real-time verification against the backend voter registry. Preloaded demo voter accounts have been retired in Phase 01.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="epic-id" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              EPIC ID Number <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                id="epic-id"
                type="text"
                value={epicInput}
                onChange={(e) => {
                  setEpicInput(e.target.value);
                  setError(null);
                }}
                placeholder="e.g. ABC1234567"
                disabled={isVerifying}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-base uppercase focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all tracking-wider disabled:opacity-50"
              />
              <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Standard ECI format: 10 alphanumeric characters (e.g. <span className="font-mono">ABC1234567</span>).
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">{error}</p>
            </div>
          )}

          <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onCancel}
              disabled={isVerifying}
              className="px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer disabled:opacity-50"
            >
              Return to Portal
            </button>

            <button
              type="submit"
              disabled={isVerifying}
              className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer text-sm disabled:opacity-50"
            >
              {isVerifying ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Verifying Elector...</span>
                </>
              ) : (
                <>
                  <span>Verify & Request OTP</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
