/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CivicEmblem } from '../CivicEmblem';
import {
  Lock,
  Shield,
  ArrowRight,
  AlertCircle,
  Loader2,
  KeyRound,
  UserCheck,
  Vote,
  ArrowLeft,
  RefreshCw,
} from 'lucide-react';
import { voterApi } from '../../services/voterApi';
import { auth, firebaseConfig } from '../../lib/firebase';

interface AdminLoginScreenProps {
  onLoginSuccess: (user?: any) => void;
  onCancel: () => void;
}

type RoleType = 'EO' | 'VRO' | 'ADMIN' | 'CUSTOM';

interface DemoAccountInfo {
  id: RoleType;
  title: string;
  staffId: string;
  scopeBadge: string;
  description: string;
  icon: React.FC<{ className?: string }>;
  accentColor: string;
  buttonColor: string;
}

const DEMO_ACCOUNTS: DemoAccountInfo[] = [
  {
    id: 'EO',
    title: 'Election Officer',
    staffId: 'EO-SIM-001',
    scopeBadge: 'Elections & Polls',
    description:
      'Supervise active elections, manage candidate nominations, polling stations, and gazette results tallying.',
    icon: Vote,
    accentColor: 'border-orange-200 bg-orange-50/60 text-orange-900',
    buttonColor: 'bg-orange-600 hover:bg-orange-700 text-white',
  },
  {
    id: 'VRO',
    title: 'Voter Registration Officer',
    staffId: 'VRO-SIM-001',
    scopeBadge: 'Voter Registry & Biometrics',
    description:
      'Manage electoral rolls, enroll new electors with compulsory fingerprint verification and photo validation.',
    icon: UserCheck,
    accentColor: 'border-emerald-200 bg-emerald-50/60 text-emerald-900',
    buttonColor: 'bg-emerald-600 hover:bg-emerald-700 text-white',
  },
  {
    id: 'ADMIN',
    title: 'Platform Administrator',
    staffId: 'demo.admin@blockballot.local',
    scopeBadge: 'System Governance',
    description:
      'Configure system parameters, audit security event logs, manage credentials, and inspect blockchain state.',
    icon: Shield,
    accentColor: 'border-blue-200 bg-blue-50/60 text-blue-900',
    buttonColor: 'bg-blue-600 hover:bg-blue-700 text-white',
  },
];

export const AdminLoginScreen: React.FC<AdminLoginScreenProps> = ({
  onLoginSuccess,
  onCancel,
}) => {
  const [selectedRole, setSelectedRole] = useState<RoleType | null>(null);
  const [staffId, setStaffId] = useState<string>('');
  const [password, setPassword] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSelectRole = (role: RoleType) => {
    setSelectedRole(role);
    setError(null);
    setPassword('');
    if (role === 'EO') {
      setStaffId('EO-SIM-001');
    } else if (role === 'VRO') {
      setStaffId('VRO-SIM-001');
    } else if (role === 'ADMIN') {
      setStaffId('demo.admin@blockballot.local');
    } else {
      setStaffId('');
    }
  };

  const handleResetSelection = () => {
    setSelectedRole(null);
    setStaffId('');
    setPassword('');
    setError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedId = staffId.trim();
    const trimmedPassword = password.trim();

    if (!trimmedId || !trimmedPassword) {
      setError('Please provide both your Staff ID/Email and password.');
      return;
    }

    setIsLoading(true);

    try {
      // 1. Direct server-side authentication for operational officers and administrators
      const loginPayload = trimmedPassword.startsWith('eyJ')
        ? trimmedPassword
        : { email: trimmedId, password: trimmedPassword };

      const res = await voterApi.adminLogin(loginPayload);

      if (res.success && res.user) {
        onLoginSuccess(res.user);
        return;
      }

      // 2. If server rejected and Firebase Auth is configured with an active web API key, try Firebase Auth
      if (auth && firebaseConfig.apiKey && trimmedId.includes('@') && !trimmedPassword.startsWith('eyJ')) {
        try {
          const { signInWithEmailAndPassword } = await import('firebase/auth');
          const credential = await signInWithEmailAndPassword(auth, trimmedId, trimmedPassword);
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
      setError(res.message || 'Invalid officer credentials. Please verify your Staff ID and password.');
    } catch (err: any) {
      setError(
        err.message || 'Authentication service is temporarily unavailable. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

  const selectedAccountInfo = DEMO_ACCOUNTS.find((a) => a.id === selectedRole);

  return (
    <div className="max-w-xl mx-auto px-4 py-8 sm:py-12">
      <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-sm">
        {/* Portal Header */}
        <div className="text-center mb-6">
          <CivicEmblem size={48} className="mx-auto mb-3" />
          <span className="text-[11px] font-bold text-orange-700 uppercase tracking-widest block">
            Election Commission Portal
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight mt-1">
            Staff & Officer Login
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Authorized gateway for Election Officers, Voter Registration Officers, and System Administrators.
          </p>
        </div>

        {/* STAGE 1: Role Selection Cards */}
        {selectedRole === null ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between pb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <KeyRound className="w-4 h-4 text-orange-600" />
                Select Staff Account Role
              </span>
              <span className="text-[11px] text-slate-500">Demo Profiles</span>
            </div>

            <div className="grid grid-cols-1 gap-3">
              {DEMO_ACCOUNTS.map((account) => {
                const IconComponent = account.icon;
                return (
                  <div
                    key={account.id}
                    className="p-4 rounded-xl border border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/50 transition-all shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-700 shrink-0 mt-0.5">
                        <IconComponent className="w-5 h-5 text-slate-800" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h2 className="font-bold text-slate-900 text-sm">{account.title}</h2>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                            {account.scopeBadge}
                          </span>
                        </div>
                        <p className="font-mono text-xs text-orange-700 font-semibold mt-0.5">
                          {account.staffId}
                        </p>
                        <p className="text-xs text-slate-500 mt-1 leading-snug">
                          {account.description}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleSelectRole(account.id)}
                      className={`px-4 py-2.5 rounded-lg text-xs font-semibold cursor-pointer shrink-0 transition-colors flex items-center justify-center gap-1.5 ${account.buttonColor}`}
                    >
                      <span>Continue as {account.title.split(' ')[0]}</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => handleSelectRole('CUSTOM')}
                className="text-xs font-medium text-slate-500 hover:text-slate-800 underline transition-colors cursor-pointer"
              >
                Or enter custom / enterprise officer credentials manually
              </button>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={onCancel}
                className="w-full py-2.5 text-xs font-semibold text-slate-600 hover:text-slate-900 text-center transition-colors cursor-pointer block"
              >
                Return to Public Portal
              </button>
            </div>
          </div>
        ) : (
          /* STAGE 2: Role-Locked Login Form */
          <div>
            {/* Selected Account Header with Switch Button */}
            <div className="mb-5 p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                {selectedAccountInfo ? (
                  <selectedAccountInfo.icon className="w-5 h-5 text-orange-600 shrink-0" />
                ) : (
                  <Shield className="w-5 h-5 text-slate-600 shrink-0" />
                )}
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                    Signing in as
                  </span>
                  <span className="text-xs font-bold text-slate-900">
                    {selectedAccountInfo ? selectedAccountInfo.title : 'Custom Officer Account'}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handleResetSelection}
                disabled={isLoading}
                className="text-xs font-semibold text-orange-700 hover:text-orange-900 flex items-center gap-1 cursor-pointer transition-colors px-2.5 py-1 rounded-md bg-orange-50 hover:bg-orange-100 border border-orange-200"
              >
                <RefreshCw className="w-3 h-3" />
                <span>Switch Role</span>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label
                  htmlFor="staff-id"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                >
                  Staff ID / Officer Account
                </label>
                <input
                  id="staff-id"
                  type="text"
                  value={staffId}
                  onChange={(e) => setStaffId(e.target.value)}
                  readOnly={selectedRole !== 'CUSTOM'}
                  className={`w-full px-3.5 py-2.5 rounded-lg text-sm font-mono border transition-colors ${
                    selectedRole !== 'CUSTOM'
                      ? 'bg-slate-100 border-slate-200 text-slate-700 font-semibold cursor-not-allowed'
                      : 'bg-slate-50 border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500'
                  }`}
                  required
                  disabled={isLoading}
                />
              </div>

              <div>
                <label
                  htmlFor="staff-password"
                  className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1"
                >
                  Password
                </label>
                <input
                  id="staff-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter staff password"
                  autoFocus
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white transition-colors"
                  required
                  disabled={isLoading}
                />
                <p className="text-[10px] text-slate-500 mt-1">
                  Configured locally in <code className="font-mono text-slate-600">.env.local</code> or updated from your officer profile.
                </p>
              </div>

              {error && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-800 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || !staffId.trim() || !password.trim()}
                className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 disabled:text-slate-500 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer mt-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-orange-400" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <Lock className="w-4 h-4 text-orange-400" />
                    <span>Sign In to Staff Portal</span>
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>

              <div className="flex items-center justify-between pt-2">
                <button
                  type="button"
                  onClick={handleResetSelection}
                  disabled={isLoading}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Choose Different Account</span>
                </button>

                <button
                  type="button"
                  onClick={onCancel}
                  disabled={isLoading}
                  className="text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer transition-colors"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    </div>
  );
};
