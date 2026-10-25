import React, { useState } from 'react';
import { CivicEmblem } from '../CivicEmblem';
import { Lock, Shield, ArrowRight, AlertCircle, Loader2 } from 'lucide-react';
import { voterApi } from '../../services/voterApi';
import { auth } from '../../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      let idToken: string | undefined;

      // 1. Authenticate against Firebase Auth to receive a signed ID token
      try {
        const credential = await signInWithEmailAndPassword(auth, email.trim(), password.trim());
        idToken = await credential.user.getIdToken();
      } catch (fbAuthErr: any) {
        // If an administrative officer ID token was supplied directly in the key field
        if (password.trim().startsWith('eyJ')) {
          idToken = password.trim();
        } else {
          // Fall back to server-side demo officer authentication (academic/local demonstration mode)
          const fallbackRes = await voterApi.adminLogin({
            email: email.trim(),
            password: password.trim(),
          });

          if (fallbackRes.success) {
            onLoginSuccess(fallbackRes.user);
            return;
          }

          setError(
            fallbackRes.message ||
              (fbAuthErr.message
                ? `Authentication failed: ${fbAuthErr.message}`
                : 'Invalid administrative credentials. Access denied.')
          );
          setIsLoading(false);
          return;
        }
      }

      // 2. Transmit verified Firebase ID token to the hardened server-side authorization gateway
      const res = await voterApi.adminLogin(idToken);
      if (res.success) {
        onLoginSuccess(res.user);
      } else {
        // Fail closed
        setError(res.message || 'Access denied: Valid Commission officer authorization required.');
      }
    } catch (err: any) {
      // Fail closed: Never grant access on network, server, or unverified states
      setError(
        err.message || 'Authentication gateway unreachable. Administrative access denied.'
      );
    } finally {
      setIsLoading(false);
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
            Restricted access portal for authorized election returning officers, registration officers, and system auditors.
          </p>
        </div>

        {/* Security Policy Notice */}
        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 mb-4 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-slate-900">
            <Lock className="w-3.5 h-3.5 text-slate-700" />
            <span>Strict Administrative Authorization:</span>
          </div>
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Officers must authenticate using Commission-issued credentials. Authentication is cryptographically verified against the server-side role registry and audited.
          </p>
        </div>

        {/* Local Demo Account Notice */}
        <div className="p-3 bg-amber-50/70 border border-amber-200/80 rounded-lg text-xs text-amber-900 mb-6 space-y-2">
          <div className="flex items-center gap-1.5 font-bold text-amber-950">
            <Shield className="w-3.5 h-3.5 text-amber-700" />
            <span>Local Operational Officer Accounts:</span>
          </div>
          <div className="text-[11px] text-amber-800 leading-relaxed space-y-1">
            <div>
              <span className="font-semibold">Election Officer:</span>{' '}
              <code className="bg-amber-100/80 px-1 py-0.5 rounded text-[10px] font-mono">EO-SIM-001</code>
              <span className="text-amber-700 text-[10px] block">Elections, candidates, turnout, lifecycle management</span>
            </div>
            <div>
              <span className="font-semibold">Voter Registration Officer:</span>{' '}
              <code className="bg-amber-100/80 px-1 py-0.5 rounded text-[10px] font-mono">VRO-SIM-001</code>
              <span className="text-amber-700 text-[10px] block">Voter records, registration scope, enrollment access</span>
            </div>
            <div>
              <span className="font-semibold">Platform Admin:</span>{' '}
              <code className="bg-amber-100/80 px-1 py-0.5 rounded text-[10px] font-mono">demo.admin@blockballot.local</code>
            </div>
            <div className="pt-1 text-[10px] text-amber-700 italic border-t border-amber-200/60">
              Run <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">npm run officers:seed</code> to generate secure credentials in <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono">.env.local</code>. Disabled in production.
            </div>
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
              placeholder="EO-SIM-001 or VRO-SIM-001 or email"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white"
              required
              disabled={isLoading}
            />
          </div>

          <div>
            <label htmlFor="admin-password" className="block text-xs font-semibold uppercase tracking-wider text-slate-700 mb-1">
              Officer Password / ID Token
            </label>
            <input
              id="admin-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:bg-white"
              required
              disabled={isLoading}
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
            disabled={isLoading}
            className="w-full py-3 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-700 text-white font-semibold rounded-lg text-sm flex items-center justify-center gap-2 transition-colors cursor-pointer mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Verifying Officer Credentials...</span>
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 text-amber-400" />
                <span>Authenticate Commission Access</span>
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
