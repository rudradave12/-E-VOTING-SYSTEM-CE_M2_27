import React from 'react';
import { CivicEmblem } from './CivicEmblem';
import { NavigationScreen } from '../types';
import { Shield, Vote, BarChart3, Lock, Languages } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface NavbarProps {
  currentScreen: NavigationScreen;
  onNavigate: (screen: NavigationScreen) => void;
  isAdminAuthenticated: boolean;
  onAdminLogout: () => void;
  voterName?: string;
  onResetVoterSession?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentScreen,
  onNavigate,
  isAdminAuthenticated,
  onAdminLogout,
  voterName,
  onResetVoterSession,
}) => {
  const { language, toggleLanguage, t } = useLanguage();

  const isVoterFlow = [
    'welcome',
    'identify',
    'otp',
    'constituency',
    'candidates',
    'review',
    'metamask',
    'receipt',
  ].includes(currentScreen);

  const isAdminFlow = [
    'admin-login',
    'admin-dashboard',
    'admin-elections',
    'admin-candidates',
    'admin-voters',
    'admin-audit',
  ].includes(currentScreen);

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-40">
      {/* Subtle Indian Tricolor Decorative Top Edge */}
      <div className="h-1 w-full bg-gradient-to-r from-orange-600 via-slate-100 to-emerald-600" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between gap-8 h-16">
          {/* Zone 1: Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => onNavigate('welcome')}
              className="flex items-center gap-2.5 text-left group cursor-pointer"
            >
              <CivicEmblem size={34} className="group-hover:rotate-12 transition-transform duration-300" />
              <div>
                <span className="text-xl font-bold tracking-tight text-slate-900 block leading-none">
                  BlockBallot
                </span>
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-widest block mt-0.5">
                  E-Voting System · ECI Prototype
                </span>
              </div>
            </button>
          </div>

          {/* Zone 2: Navigation Links */}
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600">
            <button
              onClick={() => onNavigate('welcome')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                currentScreen === 'welcome' ? 'text-slate-950 font-semibold underline underline-offset-4' : ''
              }`}
            >
              Election Portal
            </button>

            <button
              onClick={() => onNavigate('identify')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                isVoterFlow && currentScreen !== 'welcome'
                  ? 'text-orange-700 font-semibold underline underline-offset-4'
                  : ''
              }`}
            >
              Cast Ballot
            </button>

            <button
              onClick={() => onNavigate('results')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer flex items-center gap-1.5 ${
                currentScreen === 'results' ? 'text-slate-950 font-semibold underline underline-offset-4' : ''
              }`}
            >
              <BarChart3 className="w-4 h-4 text-slate-500" />
              Live Results
            </button>

            {isAdminAuthenticated && (
              <>
                <button
                  onClick={() => onNavigate('admin-dashboard')}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentScreen === 'admin-dashboard' ? 'text-slate-950 font-semibold underline underline-offset-4' : ''
                  }`}
                >
                  Admin Overview
                </button>
                <button
                  onClick={() => onNavigate('admin-audit')}
                  className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    currentScreen === 'admin-audit' ? 'text-slate-950 font-semibold underline underline-offset-4' : ''
                  }`}
                >
                  Audit Trail
                </button>
              </>
            )}
          </nav>

          {/* Zone 3: Primary Action / Mode Switcher */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* Bilingual Switcher (English / हिन्दी) */}
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={language === 'en' ? 'Switch to Hindi (हिन्दी)' : 'Switch to English'}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-md transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <Languages className="w-3.5 h-3.5 text-slate-600" />
              <span>{language === 'en' ? 'हिन्दी' : 'English'}</span>
            </button>

            {voterName && isVoterFlow && (
              <div className="hidden sm:flex items-center gap-2 border-r border-slate-200 pr-3 mr-1 text-xs text-slate-600">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span className="font-medium text-slate-800 truncate max-w-[120px]">{voterName}</span>
                <button
                  onClick={onResetVoterSession}
                  className="text-slate-400 hover:text-slate-700 underline ml-1 cursor-pointer"
                >
                  {t.exitSession}
                </button>
              </div>
            )}

            {isAdminAuthenticated ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onNavigate('admin-dashboard')}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-md hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  {t.commissionConsole}
                </button>
                <button
                  onClick={onAdminLogout}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                >
                  {t.logout}
                </button>
              </div>
            ) : (
              <button
                onClick={() => onNavigate('admin-login')}
                className={`px-3 py-1.5 text-xs font-medium rounded-md border transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isAdminFlow
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                {t.officerAccess}
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
};
