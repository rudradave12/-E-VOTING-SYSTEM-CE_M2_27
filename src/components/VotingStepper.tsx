import React from 'react';
import { Check } from 'lucide-react';
import { NavigationScreen } from '../types';

interface VotingStepperProps {
  currentScreen: NavigationScreen;
}

const STEPS = [
  { id: 'identify', label: '1. Identification' },
  { id: 'otp', label: '2. OTP Verification' },
  { id: 'constituency', label: '3. Constituency' },
  { id: 'candidates', label: '4. Candidate Choice' },
  { id: 'review', label: '5. Ballot Review' },
  { id: 'metamask', label: '6. Web3 Sign-off' },
  { id: 'receipt', label: '7. Receipt' },
];

export const VotingStepper: React.FC<VotingStepperProps> = ({ currentScreen }) => {
  const currentIndex = STEPS.findIndex((s) => s.id === currentScreen);
  if (currentIndex === -1) return null;

  return (
    <div className="bg-white border-b border-slate-200 py-3 px-4 shadow-xs">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {STEPS.map((step, idx) => {
            const isCompleted = idx < currentIndex;
            const isCurrent = idx === currentIndex;

            return (
              <div key={step.id} className="flex items-center shrink-0">
                <div className="flex items-center gap-2">
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                      isCompleted
                        ? 'bg-emerald-600 text-white'
                        : isCurrent
                        ? 'bg-orange-600 text-white ring-2 ring-orange-200'
                        : 'bg-slate-100 text-slate-400 border border-slate-200'
                    }`}
                  >
                    {isCompleted ? <Check className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <span
                    className={`text-xs whitespace-nowrap ${
                      isCurrent
                        ? 'font-bold text-slate-900'
                        : isCompleted
                        ? 'font-medium text-slate-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {step.label.split('. ')[1]}
                  </span>
                </div>

                {idx < STEPS.length - 1 && (
                  <div
                    className={`w-6 sm:w-10 h-0.5 mx-2 ${
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
