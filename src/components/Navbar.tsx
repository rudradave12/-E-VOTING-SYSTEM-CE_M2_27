/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { CivicEmblem } from './CivicEmblem';
import { NavigationScreen } from '../types';
import {
  Vote,
  BarChart3,
  Lock,
  Languages,
  Users,
  MapPin,
  HelpCircle,
  Home,
  Menu,
  X,
  Shield,
  RotateCcw,
} from 'lucide-react';
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
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);

  const isVoterFlow = [
    'practice-voting',
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

  const navItems = [
    { id: 'welcome', label: t.navHome, icon: Home },
    { id: 'elections-results', label: t.navElectionsResults, icon: BarChart3 },
    { id: 'candidates-parties', label: t.navCandidatesParties, icon: Users },
    { id: 'constituencies-info', label: t.navConstituencyInfo, icon: MapPin },
    { id: 'how-it-works', label: t.navHowItWorks, icon: HelpCircle },
    { id: 'practice-voting', label: t.navPracticeVoting, icon: Vote, isHighlight: true },
  ];

  const handleNavClick = (screenId: string) => {
    onNavigate(screenId as NavigationScreen);
    setMobileMenuOpen(false);
  };

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-40 shadow-2xs">
      {/* Subtle Indian Tricolor Decorative Top Edge */}
      <div className="h-1 w-full bg-gradient-to-r from-orange-600 via-slate-100 to-emerald-600" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Brand Wordmark */}
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={() => handleNavClick('welcome')}
              className="flex items-center gap-2.5 text-left group cursor-pointer"
            >
              <CivicEmblem size={32} className="group-hover:rotate-12 transition-transform duration-300" />
              <div>
                <span className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 block leading-none">
                  BlockBallot
                </span>
                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-500 uppercase tracking-widest block mt-0.5">
                  E-Voting Civic Portal
                </span>
              </div>
            </button>
          </div>

          {/* 7 Primary Civic Navigation Sections (Desktop) */}
          <nav className="hidden xl:flex items-center gap-1 text-xs font-semibold text-slate-600">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                currentScreen === item.id ||
                (item.id === 'welcome' && currentScreen === 'home') ||
                (item.id === 'practice-voting' && isVoterFlow && currentScreen !== 'welcome');

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                    isActive
                      ? item.isHighlight
                        ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200'
                        : 'bg-slate-100 text-slate-900 font-bold'
                      : item.isHighlight
                      ? 'text-orange-700 hover:bg-orange-50/60'
                      : 'hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 ${item.isHighlight ? 'text-orange-600' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {isAdminAuthenticated && (
              <button
                onClick={() => handleNavClick('admin-dashboard')}
                className={`px-3 py-2 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
                  currentScreen === 'admin-dashboard'
                    ? 'bg-slate-900 text-white font-bold'
                    : 'hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-amber-500" />
                <span>Admin</span>
              </button>
            )}
          </nav>

          {/* Right Utility: Language Switcher, Active Voter Session & Staff Login */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Active practice session indicator */}
            {voterName && isVoterFlow && (
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-xs text-emerald-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                <span className="font-semibold truncate max-w-[100px]">{voterName}</span>
                <button
                  onClick={onResetVoterSession}
                  title="Reset practice voter session"
                  className="text-slate-400 hover:text-slate-700 ml-1 cursor-pointer"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Bilingual Switcher (English / हिन्दी) */}
            <button
              type="button"
              onClick={toggleLanguage}
              aria-label={language === 'en' ? 'Switch to Hindi (हिन्दी)' : 'Switch to English'}
              className="px-2.5 py-1.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <Languages className="w-3.5 h-3.5 text-slate-600" />
              <span>{language === 'en' ? 'हिन्दी' : 'English'}</span>
            </button>

            {/* Section 7: Staff Login / Admin Access */}
            {isAdminAuthenticated ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => handleNavClick('admin-dashboard')}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Admin Console</span>
                </button>
                <button
                  onClick={onAdminLogout}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  {t.logout}
                </button>
              </div>
            ) : (
              <button
                onClick={() => handleNavClick('admin-login')}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                  isAdminFlow
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>{t.navStaffLogin}</span>
              </button>
            )}

            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen((prev) => !prev)}
              aria-label="Toggle navigation menu"
              className="xl:hidden p-2 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="xl:hidden py-3 border-t border-slate-200 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                currentScreen === item.id ||
                (item.id === 'welcome' && currentScreen === 'home') ||
                (item.id === 'practice-voting' && isVoterFlow && currentScreen !== 'welcome');

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full px-3 py-2.5 rounded-lg flex items-center gap-2 text-xs font-semibold transition-colors cursor-pointer ${
                    isActive
                      ? item.isHighlight
                        ? 'bg-orange-50 text-orange-700 font-bold'
                        : 'bg-slate-100 text-slate-900 font-bold'
                      : item.isHighlight
                      ? 'text-orange-700'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {isAdminAuthenticated && (
              <button
                onClick={() => handleNavClick('admin-dashboard')}
                className="w-full px-3 py-2.5 rounded-lg flex items-center gap-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
              >
                <Shield className="w-4 h-4 text-amber-500" />
                <span>Admin Console</span>
              </button>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
