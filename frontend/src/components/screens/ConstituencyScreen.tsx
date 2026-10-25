import React from 'react';
import { VoterRecord, Constituency } from '../../types';
import { MapPin, UserCheck, Wallet, ArrowRight, ShieldCheck, Building2 } from 'lucide-react';

interface ConstituencyScreenProps {
  voter: VoterRecord;
  constituency: Constituency;
  voterWalletAddress: string;
  isSimulatedEVM: boolean;
  onProceed: () => void;
  onBack: () => void;
}

export const ConstituencyScreen: React.FC<ConstituencyScreenProps> = ({
  voter,
  constituency,
  voterWalletAddress,
  isSimulatedEVM,
  onProceed,
  onBack,
}) => {
  return (
    <div className="max-w-3xl mx-auto px-3 sm:px-4 py-4 sm:py-8">
      <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-8 shadow-xs">
        <div className="mb-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 uppercase tracking-widest mb-1">
            <span>Step 3 of 6</span>
            <span aria-hidden="true">·</span>
            <span>Electoral Roll Verification</span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
            Verified Constituency & Voter Roll Record
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-slate-600">
            Your elector identity and assigned parliamentary constituency have been verified.
          </p>
        </div>

        {/* Elector Verified Information Card */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          {/* Voter Profile */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-emerald-600" />
              Verified Elector Profile
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Full Name:</span>
                <span className="font-semibold text-slate-900">{voter.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Synthetic EPIC:</span>
                <span className="font-mono font-medium text-slate-800">{voter.epicId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Demographics:</span>
                <span className="text-slate-800">
                  {voter.gender === 'M' ? 'Male' : voter.gender === 'F' ? 'Female' : 'Other'}, {voter.age} yrs
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Electoral Status:</span>
                <span className="font-semibold text-emerald-700 flex items-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Eligible to Vote
                </span>
              </div>
            </div>
          </div>

          {/* Constituency Profile */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-1.5">
              <MapPin className="w-4 h-4 text-orange-600" />
              Assigned Constituency
            </h3>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Constituency:</span>
                <span className="font-bold text-slate-900">
                  {constituency.code} - {constituency.name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">State / Territory:</span>
                <span className="text-slate-800">{constituency.state}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Total Electors:</span>
                <span className="font-mono text-slate-800">{constituency.totalElectors.toLocaleString('en-IN')}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Turnout:</span>
                <span className="font-mono text-slate-800">
                  {((constituency.turnoutCount / constituency.totalElectors) * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Polling Booth Location */}
        <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-lg mb-6">
          <div className="flex items-start gap-3">
            <Building2 className="w-5 h-5 text-blue-700 shrink-0 mt-0.5" />
            <div>
              <span className="text-xs font-bold text-blue-900 uppercase tracking-wider block">
                Assigned Polling Station
              </span>
              <p className="text-xs text-blue-950 font-medium mt-0.5">
                {voter.pollingStation}
              </p>
            </div>
          </div>
        </div>

        {/* On-Chain Wallet Binding Notice */}
        <div className="p-4 bg-slate-900 text-slate-200 rounded-lg mb-6">
          <div className="flex items-start gap-3">
            <Wallet className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
            <div className="w-full">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-white uppercase tracking-wider">
                  Bound Web3 Voter Wallet
                </span>
                <span className="text-[10px] text-amber-400 font-mono">
                  {isSimulatedEVM ? 'Simulated Key' : 'MetaMask Active'}
                </span>
              </div>
              <p className="text-xs font-mono text-slate-300 mt-1 break-all bg-slate-800/80 p-2 rounded border border-slate-700">
                {voterWalletAddress}
              </p>
              <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                Your EIP-712 voting authorization ticket will be cryptographically bound to this address. Only transactions submitted from this wallet will be accepted by the smart contract.
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-4 border-t border-slate-100">
          <button
            type="button"
            onClick={onBack}
            className="w-full sm:w-auto px-4 py-2.5 text-xs font-medium text-slate-600 hover:text-slate-900 border border-slate-200 sm:border-transparent rounded-lg transition-colors cursor-pointer text-center"
          >
            Back
          </button>

          <button
            type="button"
            onClick={onProceed}
            className="w-full sm:w-auto px-6 py-3 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-lg shadow-sm hover:shadow transition-all flex items-center justify-center gap-2 cursor-pointer text-sm"
          >
            <span>Proceed to Candidate Ballot</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
