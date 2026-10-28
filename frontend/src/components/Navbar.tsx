/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { CivicEmblem } from './CivicEmblem';
import { NavigationScreen } from '../types';
import {
  Vote,
  BarChart3,
  Lock,
  Languages,
  Users,
  HelpCircle,
  Home,
  Menu,
  X,
  Shield,
  RotateCcw,
  Database,
  Activity,
  ChevronDown,
} from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

interface NavbarProps {
  currentScreen: NavigationScreen;
  onNavigate: (screen: NavigationScreen) => void;
  isAdminAuthenticated: boolean;
  onAdminLogout: () => void;
  adminUser?: any;
  voterName?: string;
  onResetVoterSession?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentScreen,
  onNavigate,
  isAdminAuthenticated,
  onAdminLogout,
  adminUser,
  voterName,
  onResetVoterSession,
}) => {
  const { language, toggleLanguage } = useLanguage();
  const [mobileMenuOpen, setMobileMenuOpen] = useState<boolean>(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState<boolean>(false);
  const moreMenuRef = useRef<HTMLDivElement>(null);

  // Close "More" dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (moreMenuRef.current && !moreMenuRef.current.contains(event.target as Node)) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    'face-enrollment',
    'fingerprint-enrollment',
    'admin-exceptions',
  ].includes(currentScreen);

  interface NavItem {
    id: string;
    label: string;
    fullTitle: string;
    icon: React.ComponentType<{ className?: string }>;
    isHighlight?: boolean;
  }

  // Primary navigation items (always visible on desktop 1024px+)
  const primaryNavItems: NavItem[] = [
    {
      id: 'welcome',
      label: language === 'hi' ? 'मुख्य' : 'Home',
      fullTitle: language === 'hi' ? 'मुख्य पृष्ठ' : 'Home',
      icon: Home,
    },
    {
      id: 'available-elections',
      label: language === 'hi' ? 'मतदान' : 'Vote',
      fullTitle: language === 'hi' ? 'मतदान / उपलब्ध चुनाव' : 'Vote / Elections',
      icon: Vote,
      isHighlight: true,
    },
    {
      id: 'elections-results',
      label: language === 'hi' ? 'परिणाम' : 'Results',
      fullTitle: language === 'hi' ? 'चुनाव परिणाम' : 'Election Results',
      icon: BarChart3,
    },
    {
      id: 'identify',
      label: language === 'hi' ? 'मतदाता' : 'Voter Login',
      fullTitle: language === 'hi' ? 'मतदाता लॉगिन' : 'Voter Identification & Login',
      icon: Users,
    },
  ];

  // Secondary navigation items (visible inline at xl 1280px+, accessible via "More ▾" at lg 1024px)
  const secondaryNavItems: NavItem[] = [
    {
      id: 'election-monitor',
      label: language === 'hi' ? 'मॉनिटर' : 'Monitor',
      fullTitle: language === 'hi' ? 'चुनाव मॉनिटर' : 'Election Monitor',
      icon: Activity,
    },
    {
      id: 'historical-archive',
      label: language === 'hi' ? 'संग्रह' : 'Archive',
      fullTitle: language === 'hi' ? 'ऐतिहासिक संग्रह' : 'Historical Archive',
      icon: Database,
    },
    {
      id: 'how-it-works',
      label: language === 'hi' ? 'मार्गदर्शन' : 'How It Works',
      fullTitle: language === 'hi' ? 'मतदान कैसे काम करता है' : 'How Voting Works Guide',
      icon: HelpCircle,
    },
  ];

  // All navigation items combined for mobile drawer and lookup
  const allNavItems = [...primaryNavItems, ...secondaryNavItems];

  const isSecondaryActive = secondaryNavItems.some(
    (item) => currentScreen === item.id
  );

  const handleNavClick = (screenId: string) => {
    onNavigate(screenId as NavigationScreen);
    setMobileMenuOpen(false);
    setMoreMenuOpen(false);
  };

  return (
    <header className="border-b border-slate-200 bg-white sticky top-0 z-40 shadow-xs w-full max-w-full">
      {/* Decorative Indian Tricolor Top Edge */}
      <div className="h-[2px] w-full bg-gradient-to-r from-orange-600 via-slate-200 to-emerald-600" />

      <div className="w-full max-w-7xl mx-auto px-3 sm:px-4 lg:px-6">
        <div className="flex items-center justify-between h-[58px] gap-2 lg:gap-3 xl:gap-4">
          {/* Brand Wordmark & Logo */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => handleNavClick('welcome')}
              className="flex items-center gap-2 text-left group cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-lg p-1"
            >
              <CivicEmblem size={26} className="group-hover:rotate-12 transition-transform duration-300 shrink-0" />
              <div>
                <span className="text-base lg:text-lg font-bold tracking-tight text-slate-900 block leading-tight">
                  BlockBallot
                </span>
                <span className="hidden sm:block text-[9px] font-semibold text-slate-500 uppercase tracking-wider leading-none">
                  Digital Voting Portal
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Navigation (>= 1024px) */}
          <nav className="hidden lg:flex items-center gap-1 xl:gap-1.5 text-xs font-semibold text-slate-700 shrink-0">
            {/* 1. Core Primary Nav Items (Always in bar on 1024px+) */}
            {primaryNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                currentScreen === item.id ||
                (item.id === 'welcome' && currentScreen === 'home') ||
                (item.id === 'available-elections' &&
                  (currentScreen === 'available-elections' || (isVoterFlow && currentScreen !== 'welcome'))) ||
                (item.id === 'identify' && currentScreen === 'identify');

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  title={item.fullTitle}
                  className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 text-xs ${
                    isActive
                      ? item.isHighlight
                        ? 'bg-orange-50 text-orange-700 ring-1 ring-orange-200 font-bold'
                        : 'bg-slate-100 text-slate-900 font-bold'
                      : item.isHighlight
                      ? 'text-orange-700 hover:bg-orange-50/70 font-semibold'
                      : 'hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <Icon className={`w-3.5 h-3.5 shrink-0 ${item.isHighlight ? 'text-orange-600' : 'text-slate-500'}`} />
                  <span>{item.label}</span>
                </button>
              );
            })}

            {/* 2. Secondary Items: Inline on xl (>= 1280px) */}
            <div className="hidden xl:flex items-center gap-1 xl:gap-1.5">
              {secondaryNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentScreen === item.id;

                return (
                  <button
                    key={item.id}
                    onClick={() => handleNavClick(item.id)}
                    title={item.fullTitle}
                    className={`h-8 px-2.5 rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 text-xs ${
                      isActive
                        ? 'bg-slate-100 text-slate-900 font-bold'
                        : 'hover:text-slate-900 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0 text-slate-500" />
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* 3. Secondary Items: Dropdown on compact desktop (1024px to 1279px) */}
            <div className="relative xl:hidden" ref={moreMenuRef}>
              <button
                type="button"
                onClick={() => setMoreMenuOpen(!moreMenuOpen)}
                className={`h-8 px-2.5 rounded-lg flex items-center gap-1 transition-colors cursor-pointer whitespace-nowrap text-xs ${
                  isSecondaryActive || moreMenuOpen
                    ? 'bg-slate-100 text-slate-900 font-bold'
                    : 'text-slate-700 hover:text-slate-900 hover:bg-slate-50'
                }`}
                aria-expanded={moreMenuOpen}
                aria-haspopup="true"
              >
                <span>{language === 'hi' ? 'अधिक' : 'More'}</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${moreMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {moreMenuOpen && (
                <div className="absolute right-0 mt-1.5 w-48 bg-white border border-slate-200 rounded-xl shadow-lg py-1.5 z-50 animate-in fade-in slide-in-from-top-1 duration-150">
                  {secondaryNavItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = currentScreen === item.id;

                    return (
                      <button
                        key={item.id}
                        onClick={() => handleNavClick(item.id)}
                        className={`w-full px-3 py-2 text-left text-xs font-semibold flex items-center gap-2 transition-colors cursor-pointer ${
                          isActive
                            ? 'bg-orange-50 text-orange-700'
                            : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                      >
                        <Icon className={`w-3.5 h-3.5 ${isActive ? 'text-orange-600' : 'text-slate-500'}`} />
                        <span>{item.fullTitle}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </nav>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Active Voter Indicator */}
            {voterName && (
              <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                <span className="font-medium truncate max-w-[110px]">{voterName}</span>
                {onResetVoterSession && (
                  <button
                    onClick={onResetVoterSession}
                    title="Exit Voter Session"
                    className="ml-1 text-emerald-600 hover:text-emerald-900 cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}

            {/* Language Toggle */}
            <button
              onClick={toggleLanguage}
              className="h-8 px-2 sm:px-2.5 text-xs font-semibold text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1 sm:gap-1.5 shrink-0 focus:outline-none focus:ring-2 focus:ring-orange-500"
              title={language === 'en' ? 'हिन्दी में बदलें' : 'Switch to English'}
              aria-label={language === 'en' ? 'Switch to Hindi (हिन्दी)' : 'Switch to English'}
            >
              <Languages className="w-3.5 h-3.5 text-slate-500" />
              <span className="font-sans font-bold">{language === 'en' ? 'हिन्दी' : 'EN'}</span>
            </button>

            {/* Staff / Admin Login or Dashboard Button */}
            {isAdminAuthenticated ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => onNavigate('admin-dashboard')}
                  className={`h-8 px-2.5 sm:px-3 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    isAdminFlow
                      ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-2xs font-bold'
                      : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5 text-orange-600" />
                  <span className="hidden sm:inline">
                    {adminUser?.displayName ? adminUser.displayName.split(' ')[0] : 'Officer'}
                  </span>
                  <span className="sm:hidden">Officer</span>
                </button>
                <button
                  onClick={onAdminLogout}
                  title="Sign out of staff session"
                  className="h-8 px-2 text-xs font-medium text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => onNavigate('admin-login')}
                className={`hidden sm:flex h-8 px-2.5 sm:px-3 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-orange-500 shrink-0 ${
                  currentScreen === 'admin-login'
                    ? 'bg-orange-50 text-orange-700 border-orange-200 font-bold'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Lock className="w-3.5 h-3.5 text-slate-500" />
                <span>Staff Login</span>
              </button>
            )}

            {/* Mobile Hamburger Menu Toggle */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden h-8 w-8 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-slate-200 flex items-center justify-center cursor-pointer focus-visible:ring-2 focus-visible:ring-orange-500 shrink-0 bb-touch-target"
              aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-navigation-menu"
            >
              {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu Drawer */}
      {mobileMenuOpen && (
        <div id="mobile-navigation-menu" className="lg:hidden border-t border-slate-200 bg-white shadow-lg animate-in slide-in-from-top-2 duration-150">
          <div className="max-w-7xl mx-auto px-4 py-3 space-y-1">
            {voterName && (
              <div className="flex items-center justify-between p-2.5 mb-2 bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-600 animate-pulse" />
                  <span className="font-semibold">{voterName}</span>
                </div>
                {onResetVoterSession && (
                  <button
                    onClick={() => {
                      onResetVoterSession();
                      setMobileMenuOpen(false);
                    }}
                    className="text-xs text-emerald-700 font-semibold underline cursor-pointer"
                  >
                    Logout
                  </button>
                )}
              </div>
            )}

            {allNavItems.map((item) => {
              const Icon = item.icon;
              const isActive =
                currentScreen === item.id ||
                (item.id === 'welcome' && currentScreen === 'home') ||
                (item.id === 'available-elections' &&
                  (currentScreen === 'available-elections' || (isVoterFlow && currentScreen !== 'welcome'))) ||
                (item.id === 'identify' && currentScreen === 'identify');

              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full min-h-[44px] px-3 py-2 rounded-lg text-left text-xs font-semibold flex items-center gap-3 transition-colors cursor-pointer bb-touch-target ${
                    isActive
                      ? item.isHighlight
                        ? 'bg-orange-50 text-orange-700 font-bold'
                        : 'bg-slate-100 text-slate-900 font-bold'
                      : item.isHighlight
                      ? 'text-orange-700 hover:bg-orange-50/70 font-semibold'
                      : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${item.isHighlight ? 'text-orange-600' : 'text-slate-500'}`} />
                  <span>{item.fullTitle}</span>
                </button>
              );
            })}

            {/* Mobile Staff Login / Officer Portal */}
            <div className="pt-2 border-t border-slate-100">
              {isAdminAuthenticated ? (
                <div className="space-y-1">
                  <button
                    onClick={() => handleNavClick('admin-dashboard')}
                    className="w-full min-h-[44px] px-3 py-2 rounded-lg text-left text-xs font-semibold flex items-center gap-3 text-orange-700 bg-orange-50 cursor-pointer bb-touch-target"
                  >
                    <Shield className="w-4 h-4 text-orange-600" />
                    <span>Officer Dashboard ({adminUser?.displayName || 'Officer'})</span>
                  </button>
                  <button
                    onClick={() => {
                      onAdminLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="w-full min-h-[44px] px-3 py-2 rounded-lg text-left text-xs font-medium text-slate-500 hover:text-slate-800 cursor-pointer bb-touch-target"
                  >
                    Sign Out of Officer Session
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleNavClick('admin-login')}
                  className={`w-full min-h-[44px] px-3 py-2 rounded-lg text-left text-xs font-semibold flex items-center gap-3 cursor-pointer bb-touch-target ${
                    currentScreen === 'admin-login'
                      ? 'bg-orange-50 text-orange-700 font-bold'
                      : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Lock className="w-4 h-4 text-slate-500" />
                  <span>Staff Login</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
};
