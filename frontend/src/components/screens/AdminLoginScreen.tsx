/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CivicEmblem } from '../CivicEmblem';
import { Lock, Shield, ArrowRight, AlertCircle, Loader2, KeyRound, UserCheck, Vote } from 'lucide-react';
import { voterApi } from '../../services/voterApi';
import { auth, firebaseConfig } from '../../lib/firebase';

interface AdminLoginScreenProps {
  onLoginSuccess: (user?: any) => void;
  onCancel: () => void;
}

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({
  onLoginSuccess,
  onCancel,
}) => {
  const [email, setEmail] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSelectDemoAccount = (roleId: 'EO' | 'VRO' | 'ADMIN') => {
    setError(null);
    if (roleId === 'EO') {
      setEmail('EO-SIM-001');
      setPassword('Officer@2024!');
    } else if (roleId === 'VRO') {
      setEmail('VRO-SIM-001');
      setPassword('VroOfficer@2024!');
    } else {
      setEmail('demo.admin@blockballot.local');
      setPassword('DemoAdminSecret2026!');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    const trimmedEmail = email.trim();
    const trimmedPassword = password.trim();

    try {
      // 1. Direct server-side authentication for operational officers and administrators
      const loginPayload = trimmedPassword.startsWith('eyJ')
        ? trimmedPassword
        : { email: trimmedEmail, password: trimmedPassword };

      const res = await voterApi.adminLogin(loginPayload);

      if (res.success && res.user) {
        onLoginSuccess(res.user);
        return;
      }

      // 2. If server rejected and Firebase Auth is configured with an active web API key, try Firebase Auth
      if (auth && firebaseConfig.apiKey && trimmedEmail.includes('@') && !trimmedPassword.startsWith('eyJ')) {
        try {
          const { signInWithEmailAndPassword } = await import('firebase/auth');
          const credential = await signInWithEmailAndPassword(auth, trimmedEmail, trimmedPassword);
          const idToken = await credential.user.getIdToken();
          const fbRes = await voterApi.adminLogin(idToken);
          if (fbRes.success && fbRes.user) {
            onLoginSuccess(fbRes.user);
            return;
          }
        } catch {
          // Fall through to display the server's rejection reason
        }
      }

      // 3. User-friendly error message
      setError(res.message || 'Invalid officer credentials. Please verify your ID and password.');
    } catch (err: any) {
      setError(
        err.message || 'Authentication service is temporarily unavailable. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto px-4 py-8 sm:py-12">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        <div className="text-center mb-6">
          <CivicEmblem size={48} className="mx-auto mb-3" />
          <span className="text-[11px] font-bold text-orange-700 uppercase tracking-widest block">
            Election Commission Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Staff & Officer Login
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Authorized portal for Election Officers, Voter Registration Officers, and Administrators.
          </p>
        </div>

        {/* Demo Account Quick-Selection Pills */}
        <div className="mb-6 p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-orange-600" />
              Demo Staff Accounts
            </span>
            <span className="text-[10px] text-slate-600 font-medium">Click to fill</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            <button
              type="button"
              onClick={() => handleSelectDemoAccount('EO')}
              className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between text-xs ${
                email === 'EO-SIM-001'
                  ? 'bg-orange-50/80 border-orange-300 text-orange-950 font-semibold'
                  : 'bg-white hover:bg-slate-100/70 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Vote className="w-3.5 h-3.5 text-orange-600 shrink-0" />
                <div>
                  <div className="font-semibold text-slate-900 text-xs">Election Officer (EO)</div>
                  <div className="text-[10px] text-slate-600 font-mono">EO-SIM-001</div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">Elections & Polls</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectDemoAccount('VRO')}
              className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between text-xs ${
                email === 'VRO-SIM-001'
                  ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950 font-semibold'
                  : 'bg-white hover:bg-slate-100/70 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <div>
                  <div className="font-semibold text-slate-900 text-xs">Voter Registration Officer (VRO)</div>
                  <div className="text-[10px] text-slate-600 font-mono">VRO-SIM-001</div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">Voter Registry</span>
            </button>

            <button
              type="button"
              onClick={() => handleSelectDemoAccount('ADMIN')}
              className={`p-2 rounded-lg border text-left transition-all cursor-pointer flex items-center justify-between text-xs ${
                email === 'demo.admin@blockballot.local'
                  ? 'bg-blue-50/80 border-blue-300 text-blue-950 font-semibold'
                  : 'bg-white hover:bg-slate-100/70 border-slate-200 text-slate-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Shield className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <div>
                  <div className="font-semibold text-slate-900 text-xs">Platform Administrator</div>
                  <div className="text-[10px] text-slate-600 font-mono">demo.admin@blockballot.local</div>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-600">Full Access</span>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Officer Login ID or Email
            </label>
            <input
              id="admin-email"
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. EO-SIM-001 or VRO-SIM-001"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-colors"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Password
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-colors"
              required
              disabled={isLoading}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="leading-relaxed">{error}</p>
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !email.trim() || !password.trim()}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                <span>Verifying Officer Credentials...</span>
              </>
            ) : (
              <>
                <Lock className="w-4 h-4 text-orange-400" />
                <span>Sign In to Staff Portal</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="w-full py-2 text-xs font-medium text-slate-500 hover:text-slate-800 text-center transition-colors cursor-pointer block"
          >
            Return to Public Portal
          </button>
        </form>
      </div>
    </div>
  );
};
