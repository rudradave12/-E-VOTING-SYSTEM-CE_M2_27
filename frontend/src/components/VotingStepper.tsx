import React from 'react';
import { Check } from 'lucide-react';
import { NavigationScreen } from '../types';

interface VotingStepperProps {
  currentScreen: NavigationScreen;
}

const STEPS = [
  { id: 'identify', label: '1. Identification', title: 'Identification' },
  { id: 'otp', label: '2. OTP Verification', title: 'OTP Verification' },
  { id: 'constituency', label: '3. Constituency', title: 'Constituency Roll' },
  { id: 'candidates', label: '4. Candidate Choice', title: 'Candidate Choice' },
  { id: 'review', label: '5. Ballot Review', title: 'Ballot Review' },
  { id: 'metamask', label: '6. Web3 Sign-off', title: 'Web3 Sign-off' },
  { id: 'receipt', label: '7. Receipt', title: 'Ballot Receipt' },
];

export const VotingStepper: React.FC<VotingStepperProps> = ({ currentScreen }) => {
  const currentIndex = STEPS.findIndex((s) => s.id === currentScreen);
  if (currentIndex === -1) return null;

  const currentStep = STEPS[currentIndex];
  const nextStep = currentIndex < STEPS.length - 1 ? STEPS[currentIndex + 1] : null;
  const progressPercent = Math.round(((currentIndex + 1) / STEPS.length) * 100);

  return (
    <div className="bg-white border-b border-slate-200 shadow-2xs">
      <div className="max-w-5xl mx-auto px-4 py-2.5 sm:py-3">
        {/* Mobile Compact Progress Bar (< 640px) */}
        <div className="sm:hidden space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-100 text-orange-800 font-mono">
                Step {currentIndex + 1} of {STEPS.length}
              </span>
              <span className="text-xs font-bold text-slate-900 truncate">
                {currentStep.title}
              </span>
            </div>
            {nextStep && (
              <span className="text-[11px] text-slate-500 truncate max-w-[120px]">
                Next: {nextStep.title}
              </span>
            )}
          </div>

          {/* Smooth Linear Progress Bar */}
          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-emerald-600 transition-all duration-300 rounded-full"
              style={{ width: `${progressPercent}%` }}
              role="progressbar"
              aria-valuenow={progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>

          {/* 7 Micro Step Indicators */}
          <div className="flex items-center justify-between gap-1 pt-0.5">
            {STEPS.map((s, idx) => {
              const isCompleted = idx < currentIndex;
              const isCurrent = idx === currentIndex;
              return (
                <div
                  key={s.id}
                  className={`flex-1 h-1 rounded-full transition-colors ${
                    isCompleted
                      ? 'bg-emerald-600'
                      : isCurrent
                      ? 'bg-orange-600'
                      : 'bg-slate-200'
                  }`}
                  title={s.label}
                />
              );
            })}
          </div>
        </div>

        {/* Tablet & Desktop Connected Breadcrumb Stepper (>= 640px) */}
        <div className="hidden sm:flex items-center justify-between overflow-x-auto scrollbar-none">
          {STEPS.map((step, idx) => {
            const isCompleted = idx < currentIndex;
            const isCurrent = idx === currentIndex;

            return (
              <div key={step.id} className="flex items-center shrink-0">
                <div className="flex items-center gap-1.5 md:gap-2">
                  <div
                    className={`w-5 h-5 md:w-6 md:h-6 rounded-full flex items-center justify-center text-[10px] md:text-xs font-semibold shrink-0 transition-colors ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-orange-600 text-white ring-2 ring-orange-200'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    {isCompleted ? <Check className="w-3 h-3 md:w-3.5 md:h-3.5 stroke-[2.5]" /> : idx + 1}
                  </div>
                  <span
                    className={`text-[11px] md:text-xs whitespace-nowrap ${
                      isCurrent
                        ? 'font-bold text-slate-900'
                        : isCompleted
                        ? 'font-medium text-slate-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.title}
                  </span>
                </div>

                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-4 md:w-8 lg:w-12 h-0.5 mx-1.5 md:mx-2 transition-colors ${
                      idx < currentIndex ? 'bg-emerald-600' : 'bg-slate-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
