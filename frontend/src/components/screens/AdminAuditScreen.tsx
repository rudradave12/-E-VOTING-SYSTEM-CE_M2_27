import React, { useState } from 'react';
import { AuditEvent } from '../../types';
import { evmSimulator } from '../../utils/evmSimulator';
import { Shield, ArrowLeft, Cpu, Database, CheckCircle2, Search, ExternalLink, AlertTriangle } from 'lucide-react';

interface AdminAuditScreenProps {
  auditEvents: AuditEvent[];
  contractAddress: string;
  onBack: () => void;
}

export const AdminAuditScreen: React.FC<AdminAuditScreenProps> = ({
  auditEvents,
  contractAddress,
  onBack,
}) => {
  const [filterType, setFilterType] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const currentBlock = evmSimulator.getBlockNumber();
  const allEvents = auditEvents.length > 0 ? auditEvents : evmSimulator.getAuditEvents();

  const filtered = allEvents.filter((evt) => {
    const matchesType = filterType === 'ALL' || evt.type === filterType;
    const matchesSearch =
      !searchTerm ||
      evt.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.txHash?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      evt.nullifier?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesType && matchesSearch;
  });

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div>
          <button
            onClick={onBack}
            className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1.5 mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Return to Administration Console</span>
          </button>
          <div className="flex items-center gap-2 text-xs font-semibold text-orange-700 uppercase tracking-widest mb-1">
            <span>Cryptographic Verification</span>
            <span aria-hidden="true">·</span>
            <span>EVM State Machine</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
            Immutable Audit Trail & Blockchain Ledger
          </h1>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto bg-slate-900 text-slate-200 px-3 py-1.5 rounded-lg text-xs font-mono">
          <Cpu className="w-3.5 h-3.5 text-cyan-400" />
          <span>Block Height: #{currentBlock}</span>
        </div>
      </div>

      {/* Ledger Security Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block mb-1">Verifying Smart Contract</span>
          <span className="font-mono text-xs font-bold text-slate-900 break-all block">
            {contractAddress}
          </span>
          <span className="text-[11px] text-emerald-700 font-semibold mt-1 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> EIP-712 Verified
          </span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block mb-1">Spent Nullifiers Recorded</span>
          <span className="font-mono text-xl font-bold text-slate-900 tabular-nums">
            {allEvents.filter((e) => e.type === 'VOTE_CAST').length} Ballots
          </span>
          <span className="text-[11px] text-slate-500 mt-1 block">100% duplicate protection</span>
        </div>

        <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs">
          <span className="text-xs text-slate-500 block mb-1">Privacy Decoupling Audit</span>
          <span className="font-semibold text-slate-900 text-xs block">
            Zero Identity Leakage on Chain
          </span>
          <span className="text-[11px] text-slate-500 mt-1 block">
            No names, EPIC IDs, or phones written to blocks
          </span>
        </div>
      </div>

      {/* Operator Correlation Transparency Notice */}
      <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-950 mb-6 flex items-start gap-2.5">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold">Operator Privacy Boundary:</span> Backend authorization records link synthetic EPIC IDs to authorization tickets. Authorized database administrators could correlate nullifiers with voter identities. Public on-chain viewers only see pseudonymous nullifiers.
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search hash, nullifier, event..."
            className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
          {['ALL', 'VOTE_CAST', 'ELECTION_STATE', 'AUTHORIZATION_SIGNED'].map((type) => (
            <button
              key={type}
              onClick={() => setFilterType(type)}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-colors whitespace-nowrap cursor-pointer ${
                filterType === type
                  ? 'bg-slate-900 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              {type.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-xs">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider text-[10px]">
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Event Type</th>
              <th className="py-3 px-4">Event Description</th>
              <th className="py-3 px-4">Transaction / Block</th>
              <th className="py-3 px-4">Cryptographic Nullifier</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-8 text-center text-slate-400">
                  No blockchain audit events recorded matching current filters.
                </td>
              </tr>
            ) : (
              filtered.map((evt) => (
                <tr key={evt.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                    {new Date(evt.timestamp).toLocaleTimeString()}
                  </td>
                  <td className="py-3 px-4 whitespace-nowrap">
                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        evt.type === 'VOTE_CAST'
                          ? 'bg-emerald-100 text-emerald-800'
                          : evt.type === 'ELECTION_STATE'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-purple-100 text-purple-800'
                      }`}
                    >
                      {evt.type.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-800 max-w-xs">{evt.description}</td>
                  <td className="py-3 px-4 font-mono text-slate-600">
                    {evt.txHash ? (
                      <span className="truncate max-w-[120px] block" title={evt.txHash}>
                        {evt.txHash.slice(0, 10)}... (Block #{evt.blockNumber})
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-700">
                    {evt.nullifier ? (
                      <span className="truncate max-w-[140px] block" title={evt.nullifier}>
                        {evt.nullifier.slice(0, 14)}...
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
