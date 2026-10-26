/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertTriangle, ShieldCheck } from 'lucide-react';

export const ACADEMIC_SIMULATION_NOTICE =
  'BlockBallot — Academic Voting Simulation. Non-binding demonstration only. Not affiliated with or endorsed by the Election Commission of India or UIDAI.';

export const ACADEMIC_SIMULATION_NOTICE_HI =
  'ब्लॉकबैलेट — शैक्षणिक मतदान सिमुलेशन। केवल गैर-बाध्यकारी प्रदर्शन। भारत निर्वाचन आयोग या यूआईडीएआई द्वारा संबद्ध या समर्थित नहीं है।';

interface AcademicSimulationNoticeProps {
  variant?: 'banner' | 'card' | 'inline' | 'compact';
  className?: string;
  showIcon?: boolean;
}

export const AcademicSimulationNotice: React.FC<AcademicSimulationNoticeProps> = ({
  variant = 'card',
  className = '',
  showIcon = true,
}) => {
  if (variant === 'inline') {
    return (
      <span className={`inline-flex items-center gap-1.5 text-xs text-amber-800 ${className}`}>
        {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />}
        <span>{ACADEMIC_SIMULATION_NOTICE}</span>
      </span>
    );
  }

  if (variant === 'compact') {
    return (
      <div className={`p-2.5 bg-amber-50/90 border border-amber-300 rounded-lg text-xs text-amber-900 flex items-start gap-2 shadow-2xs ${className}`}>
        {showIcon && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
        <p className="leading-relaxed font-medium">
          {ACADEMIC_SIMULATION_NOTICE}
        </p>
      </div>
    );
  }

  if (variant === 'banner') {
    return (
      <div className={`w-full bg-amber-500/10 border-b border-amber-300/60 text-amber-950 py-2 px-4 text-xs font-medium text-center ${className}`}>
        <div className="max-w-7xl mx-auto flex items-center justify-center gap-2 flex-wrap">
          {showIcon && <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />}
          <span>{ACADEMIC_SIMULATION_NOTICE}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-xl border border-amber-300 bg-amber-50/95 p-4 text-amber-950 shadow-2xs ${className}`}>
      <div className="flex items-start gap-3">
        {showIcon && <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />}
        <div className="text-xs sm:text-sm space-y-1 leading-relaxed">
          <p className="font-bold text-amber-950 flex items-center gap-2">
            <span>Academic Demonstration Notice</span>
            <span className="font-mono text-[10px] bg-amber-200 text-amber-900 px-1.5 py-0.5 rounded">
              NON-BINDING
            </span>
          </p>
          <p className="text-amber-900 font-medium">
            {ACADEMIC_SIMULATION_NOTICE}
          </p>
        </div>
      </div>
    </div>
  );
};
