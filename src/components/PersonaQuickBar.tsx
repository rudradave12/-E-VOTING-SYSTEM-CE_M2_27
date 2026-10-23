import React from 'react';
import { SYNTHETIC_VOTERS } from '../data/mockData';
import { VoterRecord } from '../types';
import { UserCheck, ShieldAlert } from 'lucide-react';

interface PersonaQuickBarProps {
  onSelectPersona: (persona: VoterRecord) => void;
  activeEpicId?: string;
}

export const PersonaQuickBar: React.FC<PersonaQuickBarProps> = ({
  onSelectPersona,
  activeEpicId,
}) => {
  return (
    <div className="bg-slate-100 border-b border-slate-200 py-2 px-4">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-slate-700 whitespace-nowrap flex items-center gap-1.5 mr-1">
          <UserCheck className="w-3.5 h-3.5 text-slate-500" />
          Test Voter Personas:
        </span>

        {SYNTHETIC_VOTERS.map((voter) => {
          const isSelected = activeEpicId === voter.epicId;
          return (
            <button
              key={voter.id}
              onClick={() => onSelectPersona(voter)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors cursor-pointer flex items-center gap-1 ${
                isSelected
                  ? 'bg-slate-900 text-white border-slate-900 font-medium shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:border-slate-300'
              }`}
            >
              {!voter.isEligible && <ShieldAlert className="w-3 h-3 text-red-500" />}
              <span>{voter.name.split(' ')[0]}</span>
              <span className="text-[10px] text-slate-400 font-mono">({voter.epicId.slice(-4)})</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
