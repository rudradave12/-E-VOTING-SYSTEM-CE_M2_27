import React, { useState } from 'react';
import { VoterRecord } from '../../types';
import { SYNTHETIC_VOTERS } from '../../data/mockData';
import { voterApi } from '../../services/voterApi';
import { Search, AlertCircle, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';

interface IdentifyScreenProps {
  onVoterIdentified: (voter: VoterRecord, testDeliveryCode?: string) => void;
  onCancel: () => void;
  activeEpicId?: string;
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
      setError('Please enter a valid synthetic EPIC ID number.');
      return;
    }

    const voter = SYNTHETIC_VOTERS.find((v) => v.epicId.toUpperCase() === formatted);

    if (!voter) {
      setError(
        `EPIC record "${formatted}" not found in electoral roll. Please choose one of the sample synthetic test personas above.`
      );
      return;
    }

    if (!voter.isEligible) {
      setError(
        `Electoral Ineligibility Notice: Voter ${voter.name} is marked as ineligible (under age or disqualified by electoral registration officer).`
      );
      return;
    }

    if (voter.status === 'VOTED') {
      setError(
        `Double-Voting Safeguard: Voter ${voter.name} (${voter.epicId}) has already cast an authorized on-chain ballot in this election. Second submissions are strictly prohibited.`
      );
      return;
    }

    let testCode: string | undefined;
    setIsVerifying(true);
    try {
      // Call server-side API endpoint POST /api/voter/verify
      const res = await voterApi.verifyVoter(formatted);
      if (!res.success && res.message) {
        setError(res.message);
        setIsVerifying(false);
        return;
      }
      testCode = res.testDeliveryCode;
    } catch {
      // Graceful fallback for offline demo testing
    } finally {
      setIsVerifying(false);
    }

    onVoterIdentified(voter, testCode);
  };

  const handleSelectSample = (sample: VoterRecord) => {
    setEpicInput(sample.epicId);
    setError(null);
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
            Please enter your synthetic EPIC ID to verify your enrollment in the current parliamentary electoral roll.
          </p>
        </div>

        {/* Informational Guidance */}
        <div className="p-3.5 bg-blue-50/70 border border-blue-200 rounded-lg text-xs text-blue-900 mb-6 flex items-start gap-2.5">
          <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <span className="font-semibold">Academic Prototype:</span> Use synthetic test credentials. In a production system, this queries the secure state electoral roll via encrypted server gateway.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="epic-id" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1.5">
              Synthetic EPIC ID Number <span className="text-red-500">*</span>
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
                placeholder="e.g. IND-DL-982341"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg text-slate-900 font-mono text-base uppercase focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-all tracking-wider"
              />
              <Search className="w-5 h-5 text-slate-400 absolute right-3.5 top-3.5 pointer-events-none" />
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              Standard format: 3-letter Country, 2-letter State, 6 digits (e.g. <span className="font-mono">IND-DL-982341</span>)
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed font-medium">{error}</p>
            </div>
          )}

          {/* Quick Click Sample Synthetic Credentials */}
          <div className="pt-2 border-t border-slate-100">
            <span className="text-xs font-semibold text-slate-600 block mb-2">
              Select a pre-configured synthetic elector record:
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {SYNTHETIC_VOTERS.map((v) => (
                <button
                  type="button"
                  key={v.id}
                  onClick={() => handleSelectSample(v)}
                  className={`text-left p-2.5 rounded-lg border text-xs transition-colors cursor-pointer flex items-center justify-between ${
                    epicInput === v.epicId
                      ? 'border-orange-500 bg-orange-50/60 font-medium'
                      : 'border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <span className="font-semibold text-slate-800 block">{v.name}</span>
                    <span className="font-mono text-[11px] text-slate-500">{v.epicId}</span>
                  </div>
                  {!v.isEligible ? (
                    <span className="text-[10px] text-red-600 font-semibold uppercase">Ineligible</span>
                  ) : v.status === 'VOTED' ? (
                    <span className="text-[10px] text-slate-500 font-semibold uppercase">Already Voted</span>
                  ) : (
                    <span className="text-[10px] text-emerald-600 font-semibold uppercase">Eligible</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
            >
              Return to Portal
            </button>

            <button
              type="submit"
              className="px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-2 cursor-pointer text-sm"
            >
              <span>Verify & Request OTP</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
