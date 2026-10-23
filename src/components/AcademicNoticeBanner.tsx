import React from 'react';
import { AlertCircle, ShieldCheck, Database, Radio } from 'lucide-react';

interface AcademicNoticeBannerProps {
  isSimulatedEVM: boolean;
  onToggleSimulatedEVM: () => void;
}

export const AcademicNoticeBanner: React.FC<AcademicNoticeBannerProps> = ({
  isSimulatedEVM,
  onToggleSimulatedEVM,
}) => {
  return (
    <aside aria-label="Academic notice and demo controls" className="border-b border-slate-200 bg-slate-900 text-slate-200 text-xs py-2 px-4">
      <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 font-semibold text-amber-400 uppercase tracking-wider text-[11px]">
            <AlertCircle className="w-3.5 h-3.5" />
            Academic Prototype
          </span>
          <span className="text-slate-500 hidden sm:inline">|</span>
          <span className="text-slate-300">
            Synthetic test records only · EIP-712 duplicate-vote protection · Not affiliated with live UIDAI/ECI systems
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 bg-slate-800/80 px-2.5 py-1 rounded text-slate-300 border border-slate-700">
            {isSimulatedEVM ? (
              <>
                <Database className="w-3 h-3 text-cyan-400" />
                <span>Simulated EVM Ledger</span>
              </>
            ) : (
              <>
                <Radio className="w-3 h-3 text-emerald-400" />
                <span>External Web3 / MetaMask</span>
              </>
            )}
          </div>

          <button
            onClick={onToggleSimulatedEVM}
            className="text-[11px] font-medium text-amber-300 hover:text-amber-200 underline underline-offset-2 transition-colors cursor-pointer"
          >
            Switch to {isSimulatedEVM ? 'MetaMask' : 'Simulator'}
          </button>
        </div>
      </div>
    </aside>
  );
};
