import React, { useState } from 'react';
import { Candidate, Constituency, VoterRecord } from '../../types';
import { OfficialPartySymbol } from '../common/OfficialPartySymbol';
import { useLanguage } from '../../context/LanguageContext';
import {
  Shield,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  BadgeCheck,
  Lock,
  Loader2,
  FileText,
} from 'lucide-react';

interface ReviewScreenProps {
  voter: VoterRecord;
  constituency: Constituency;
  candidate: Candidate;
  voterWalletAddress: string;
  onConfirm: () => void;
  onEdit: () => void;
}

export const ReviewScreen: React.FC<ReviewScreenProps> = ({
  voter,
  constituency,
  candidate,
  voterWalletAddress,
  onConfirm,
  onEdit,
}) => {
  const { language, t } = useLanguage();
  const [hasConfirmedCheckbox, setHasConfirmedCheckbox] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const displayName = language === 'hi' && candidate.nameHi ? candidate.nameHi : candidate.name;
  const displayParty =
    language === 'hi' && candidate.partyNameHi ? candidate.partyNameHi : candidate.partyName;

  const handleProceed = () => {
    if (!hasConfirmedCheckbox || isSubmitting) return;
    setIsSubmitting(true);
    // Trigger onConfirm after brief feedback to guarantee double-submission lock
    setTimeout(() => {
      onConfirm();
    }, 250);
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-xs">
        {/* Step Indicator & Header */}
        <div className="mb-6 border-b border-slate-200 pb-5">
          <div className="flex items-center gap-2 text-xs font-bold text-orange-700 uppercase tracking-widest mb-1.5">
            <span>{t.step5Of6}</span>
            <span aria-hidden="true">·</span>
            <span>{t.preConfirmationReview}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            {t.reviewBallotTitle}
          </h1>
          <p className="mt-1 text-sm text-slate-600 leading-relaxed">
            {t.reviewBallotSubtext}
          </p>
        </div>

        {/* Selected Candidate Focus Presentation Card */}
        <div className="p-5 sm:p-6 rounded-2xl border-2 border-orange-300 bg-orange-50/50 mb-6 shadow-2xs">
          <div className="flex items-center justify-between gap-2 mb-3">
            <span className="text-xs font-extrabold text-orange-900 uppercase tracking-wider flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-orange-600" />
              <span>{t.selectedChoiceHeader}</span>
            </span>
            <span className="text-[11px] font-semibold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md flex items-center gap-1">
              <BadgeCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>{t.symbolVerifiedBadge}</span>
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-5">
            {/* Authentic ECI Symbol */}
            <div className="shrink-0 bg-white p-1 rounded-xl border border-orange-200 shadow-2xs">
              <OfficialPartySymbol
                symbolKey={candidate.symbolKey}
                symbolName={candidate.symbol}
                partyName={candidate.partyName}
                partyAbbreviation={candidate.partyAbbreviation}
                verificationStatus={candidate.symbolVerificationStatus}
                size={80}
              />
            </div>

            <div className="min-w-0">
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {displayName}
              </h2>
              <div className="text-sm font-bold text-slate-800 mt-0.5">
                {displayParty} <span className="font-mono text-slate-600">({candidate.partyAbbreviation})</span>
              </div>
              <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-2">
                <span>
                  Symbol:{' '}
                  <strong className="text-slate-800 font-semibold">{candidate.symbol}</strong>
                </span>
                <span aria-hidden="true" className="text-slate-300">·</span>
                <span className="text-[11px] text-emerald-800 truncate max-w-xs">
                  {candidate.symbolSource}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Confirmed Electoral & Commitment Parameters */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 sm:p-5 space-y-2.5 text-xs mb-6">
          <h3 className="font-bold text-slate-700 uppercase tracking-wider text-[11px] pb-2 border-b border-slate-200 flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-slate-500" />
            <span>Cryptographic Commitment & Constituency Parameters</span>
          </h3>

          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500">{t.constituencyLabel}:</span>
            <span className="font-bold text-slate-900">
              {constituency.name} (PC #{constituency.code})
            </span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500">{t.stateLabel}:</span>
            <span className="font-semibold text-slate-800">{constituency.state}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500">{t.electorNameLabel}:</span>
            <span className="font-semibold text-slate-900">{voter.name}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500">{t.syntheticEpicLabel}:</span>
            <span className="font-mono font-semibold text-slate-800">{voter.epicId}</span>
          </div>

          <div className="flex justify-between items-center py-1 border-b border-slate-100">
            <span className="text-slate-500">{t.authorizedSignerLabel}:</span>
            <span className="font-mono text-slate-800 text-[11px] truncate max-w-[210px] sm:max-w-xs">
              {voterWalletAddress}
            </span>
          </div>

          <div className="flex justify-between items-center pt-1">
            <span className="text-slate-500">{t.duplicateVoteGuardLabel}:</span>
            <span className="font-semibold text-emerald-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>{t.guardDescription}</span>
            </span>
          </div>
        </div>

        {/* Academic Privacy Notice */}
        <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-xl text-xs text-amber-950 mb-6 flex items-start gap-2.5">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <p className="font-bold text-amber-900 mb-0.5">{t.academicPrivacyNoticeTitle}:</p>
            <p className="text-slate-700 text-[11px]">{t.academicPrivacyNoticeText}</p>
          </div>
        </div>

        {/* Explicit Confirmation Checkbox (Requirement 3: Never submit without explicit voter confirmation) */}
        <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-xl mb-6 hover:bg-slate-100/60 transition-colors">
          <label className="flex items-start gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={hasConfirmedCheckbox}
              onChange={(e) => setHasConfirmedCheckbox(e.target.checked)}
              className="w-5 h-5 mt-0.5 rounded border-slate-300 text-orange-600 focus:ring-orange-500 cursor-pointer shrink-0"
            />
            <span className="text-xs sm:text-sm text-slate-800 font-semibold leading-snug">
              {t.confirmCheckboxText}
            </span>
          </label>
        </div>

        {/* Equally Prominent Action Actions (Requirement 3: Equal prominence between Change and Confirm) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
          <button
            type="button"
            onClick={onEdit}
            disabled={isSubmitting}
            className="w-full px-5 py-3.5 border-2 border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50 text-slate-800 font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer text-sm sm:text-base focus:outline-none focus-visible:ring-4 focus-visible:ring-slate-300 disabled:opacity-50"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t.changeCandidateChoice}</span>
          </button>

          <button
            type="button"
            onClick={handleProceed}
            disabled={!hasConfirmedCheckbox || isSubmitting}
            className="w-full px-5 py-3.5 bg-orange-600 hover:bg-orange-700 disabled:bg-slate-200 disabled:text-slate-400 text-white font-bold rounded-xl shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed text-sm sm:text-base focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-300"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>{t.processingBallot}</span>
              </>
            ) : (
              <>
                <span>{t.proceedToSign}</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
