import React, { useState } from 'react';
import { CivicEmblem } from '../CivicEmblem';
import { Lock, Shield, ArrowRight, ArrowLeft, KeyRound, AlertCircle } from 'lucide-react';
import { voterApi } from '../../services/voterApi';

interface AdminLoginScreenProps {
  onLoginSuccess: () => void;
  onCancel: () => void;
}

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({
  onLoginSuccess,
  onCancel,
}) => {
  const [email, setEmail] = useState<string>('officer@eci.gov.in');
  const [password, setPassword] = useState<string>('eci-officer-2024');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    try {
      const res = await voterApi.adminLogin(email.trim(), password.trim());
      if (res.success) {
        onLoginSuccess();
      } else {
        setError(res.message || 'Invalid administrative credentials.');
      }
    } catch {
      // Fallback check
      if (email.trim() === 'officer@eci.gov.in' && password.trim() === 'eci-officer-2024') {
        onLoginSuccess();
      } else {
        setError('Invalid administrative credentials. Please use the test officer credentials provided.');
      }
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-xl p-6 sm:p-8 shadow-xs">
        <div className="text-center mb-6">
          <CivicEmblem size={52} className="mx-auto mb-3" />
          <span className="text-[11px] font-bold text-orange-700 uppercase tracking-widest block">
            Election Commission of India
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Officer Administrative Gateway
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Restricted access portal for authorized election returning officers and system auditors.
          </p>
        </div>

        {/* Demo Credentials Box */}
        <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-lg text-xs text-amber-950 mb-6 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-amber-900">
            <KeyRound className="w-3.5 h-3.5" />
            <span>Academic Demonstration Credentials:</span>
          </div>
          <div className="flex justify-between font-mono text-[11px]">
            <span className="text-slate-600">Officer Email:</span>
            <span className="font-semibold text-slate-900">officer@eci.gov.in</span>
          </div>
          <div className="flex justify-between font-mono text-[11px]">
            <span className="text-slate-600">Password:</span>
            <span className="font-semibold text-slate-900">eci-officer-2024</span>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Officer Email
            </label>
            <input
              id="admin-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white"
              required
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Access Key / Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white"
              required
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p>{error}</p>
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer mt-2"
          >
            <Shield className="w-4 h-4 text-amber-400" />
            <span>Authenticate Commission Access</span>
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onCancel}
            className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 text-center transition-colors cursor-pointer block"
          >
            Return to Public Portal
          </button>
        </form>
      </div>
    </div>
  );
};
