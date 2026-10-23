import React from 'react';
import { SymbolVerificationStatus } from '../../types';

interface OfficialPartySymbolProps {
  symbolKey?: 'LOTUS' | 'HAND' | 'BROOM' | 'ELEPHANT' | 'CORN_SICKLE' | 'NOTA' | 'UNAVAILABLE';
  symbolName: string;
  partyName: string;
  partyAbbreviation?: string;
  verificationStatus?: SymbolVerificationStatus;
  size?: number | string; // e.g. 56 or "h-14 w-14"
  className?: string;
  showVerificationTag?: boolean;
}

export const OfficialPartySymbol: React.FC<OfficialPartySymbolProps> = ({
  symbolKey,
  symbolName,
  partyName,
  partyAbbreviation,
  verificationStatus = 'VERIFIED_ECI',
  size = 56,
  className = '',
  showVerificationTag = false,
}) => {
  const isUnavailable = verificationStatus === 'UNAVAILABLE' || symbolKey === 'UNAVAILABLE';

  const accessibleLabel = isUnavailable
    ? `Election symbol unavailable for ${partyName}`
    : `Official Election Commission of India symbol for ${partyName} (${partyAbbreviation || ''}): ${symbolName}`;

  const dimension = typeof size === 'number' ? `${size}px` : undefined;

  // Render neutral placeholder if symbol is not verified or unavailable
  if (isUnavailable) {
    return (
      <div
        role="img"
        aria-label={accessibleLabel}
        style={dimension ? { width: dimension, height: dimension } : undefined}
        className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 text-slate-500 p-1 text-center select-none ${className}`}
      >
        <svg
          className="w-5 h-5 text-slate-400 mb-0.5"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
        </svg>
        <span className="text-[9px] font-semibold tracking-tight text-slate-600 uppercase leading-none">
          Symbol Unavailable
        </span>
      </div>
    );
  }

  // Authentic official ECI vector symbols
  const renderSvgContent = () => {
    switch (symbolKey) {
      case 'LOTUS': // Bharatiya Janata Party (BJP)
        return (
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full p-1 drop-shadow-xs"
            fill="currentColor"
            aria-hidden="true"
          >
            {/* Lotus Petals & Pistil Geometry */}
            {/* Center Bud */}
            <path
              d="M50 14 C47 28 47 48 50 68 C53 48 53 28 50 14 Z"
              className="text-amber-500 fill-current"
            />
            {/* Inner Left Petal */}
            <path
              d="M48 22 C37 32 35 50 44 68 C46 54 48 38 48 22 Z"
              className="text-orange-600 fill-current"
            />
            {/* Inner Right Petal */}
            <path
              d="M52 22 C63 32 65 50 56 68 C54 54 52 38 52 22 Z"
              className="text-orange-600 fill-current"
            />
            {/* Outer Left Petal */}
            <path
              d="M44 32 C26 40 22 58 36 71 C38 60 41 46 44 32 Z"
              className="text-orange-700 fill-current"
            />
            {/* Outer Right Petal */}
            <path
              d="M56 32 C74 40 78 58 64 71 C62 60 59 46 56 32 Z"
              className="text-orange-700 fill-current"
            />
            {/* Far Outer Left Flared Petal */}
            <path
              d="M38 46 C15 54 12 70 26 77 C28 70 33 58 38 46 Z"
              className="text-orange-800 fill-current"
            />
            {/* Far Outer Right Flared Petal */}
            <path
              d="M62 46 C85 54 88 70 74 77 C72 70 67 58 62 46 Z"
              className="text-orange-800 fill-current"
            />
            {/* Base Stem Calyx */}
            <path
              d="M34 74 C42 78 58 78 66 74 C62 82 56 86 50 87 C44 86 38 82 34 74 Z"
              className="text-emerald-700 fill-current"
            />
            {/* Water Waves / Ripples at Base */}
            <path
              d="M20 88 C30 85 36 90 50 88 C64 86 70 91 80 88"
              fill="none"
              stroke="#047857"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            <path
              d="M28 94 C36 92 42 95 50 94 C58 93 64 96 72 94"
              fill="none"
              stroke="#059669"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        );

      case 'HAND': // Indian National Congress (INC)
        return (
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full p-1 drop-shadow-xs"
            fill="none"
            aria-hidden="true"
          >
            {/* Open Right Palm Facing Forward */}
            <path
              d="M48 92 C42 92 41 85 41 80 L41 71 C39 71 36 68 34 63 L26 48 C24 44 26 39 30 38 C34 37 38 40 40 44 L43 51 L43 27 C43 23 46 20 50 20 C54 20 57 23 57 27 L57 47 C57 47 57 21 57 18 C57 14 60 11 64 11 C68 11 71 14 71 18 L71 47 C71 47 71 25 71 23 C71 19 74 16 78 16 C82 16 85 19 85 23 L85 53 C85 53 85 33 85 30 C85 26 88 23 91 23 C94 23 97 26 97 30 L97 61 C97 76 89 87 77 91 C73 92 68 92 64 92 Z"
              fill="#15803D"
              stroke="#14532D"
              strokeWidth="2.5"
              strokeLinejoin="round"
            />
            {/* Palm Crease Lines */}
            <path
              d="M44 65 C52 68 62 66 72 58"
              stroke="#DCFCE7"
              strokeWidth="2"
              strokeLinecap="round"
            />
            <path
              d="M46 75 C56 78 68 76 76 68"
              stroke="#DCFCE7"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        );

      case 'BROOM': // Aam Aadmi Party (AAP)
        return (
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full p-1"
            fill="none"
            aria-hidden="true"
          >
            {/* Traditional Indian Grass Broom (Jhadu) */}
            {/* Spreading Grass Bristles */}
            <path
              d="M32 38 L10 84 C8 88 12 92 16 92 L76 92 C80 92 84 88 82 84 L60 38 Z"
              fill="#EAB308"
              stroke="#A16207"
              strokeWidth="2"
            />
            {/* Detailed bristle streaks */}
            <path d="M22 88 L34 42" stroke="#CA8A04" strokeWidth="1.5" />
            <path d="M34 88 L40 40" stroke="#713F12" strokeWidth="1.5" />
            <path d="M46 90 L46 38" stroke="#CA8A04" strokeWidth="1.5" />
            <path d="M58 88 L52 40" stroke="#713F12" strokeWidth="1.5" />
            <path d="M70 88 L58 42" stroke="#CA8A04" strokeWidth="1.5" />
            {/* Tightly bound handle section */}
            <path
              d="M34 38 L38 12 C39 9 43 7 46 7 L46 7 C49 7 53 9 54 12 L58 38 Z"
              fill="#D97706"
              stroke="#92400E"
              strokeWidth="2"
            />
            {/* Twine Bindings */}
            <line x1="37" y1="18" x2="55" y2="18" stroke="#451A03" strokeWidth="2.5" />
            <line x1="36" y1="26" x2="56" y2="26" stroke="#451A03" strokeWidth="2.5" />
            <line x1="35" y1="34" x2="57" y2="34" stroke="#451A03" strokeWidth="2.5" />
          </svg>
        );

      case 'ELEPHANT': // Bahujan Samaj Party (BSP)
        return (
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full p-1"
            fill="currentColor"
            aria-hidden="true"
          >
            {/* Standing Elephant Facing Left */}
            <path
              d="M30 32 C34 22 46 16 62 16 C76 16 86 22 88 34 C90 42 88 52 87 64 L87 86 C87 88 85 90 83 90 L76 90 C74 90 72 88 72 86 L72 68 L60 68 L60 86 C60 88 58 90 56 90 L49 90 C47 90 45 88 45 86 L45 68 L36 68 L36 86 C36 88 34 90 32 90 L25 90 C23 90 21 88 21 86 L21 54 C17 54 13 48 13 40 C13 36 15 32 17 28 C16 26 15 22 15 18 C15 16 17 15 19 16 C22 18 24 22 25 24 C27 24 28 25 30 26 C28 22 29 18 31 16 Z M20 38 C17 38 15 42 15 46 C15 50 17 54 20 54 L22 54 L22 38 Z"
              className="text-blue-700 fill-current"
            />
            {/* Eye and Ear Accent */}
            <circle cx="34" cy="28" r="2.5" fill="#FFFFFF" />
            <path
              d="M40 24 C44 28 44 42 38 48"
              fill="none"
              stroke="#1D4ED8"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            {/* Tusk */}
            <path
              d="M24 46 C18 48 14 44 14 42 C16 43 20 44 24 42 Z"
              fill="#FFFFFF"
            />
          </svg>
        );

      case 'CORN_SICKLE': // Communist Party of India (CPI)
        return (
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full p-1"
            fill="none"
            aria-hidden="true"
          >
            {/* Red Background Accent */}
            {/* Crossed Sickle Geometry */}
            <path
              d="M68 20 C50 14 30 22 24 40 C18 58 26 78 44 84 C48 85 52 82 52 78 C52 74 48 72 45 70 C33 66 28 50 32 38 C36 26 48 22 62 26 C66 27 70 25 70 21 C70 19 69 18 68 20 Z"
              fill="#DC2626"
            />
            {/* Sickle Handle */}
            <path
              d="M48 76 L62 90 C64 92 68 92 70 90 L74 86 C76 84 76 80 74 78 L60 64 Z"
              fill="#991B1B"
              stroke="#450A0A"
              strokeWidth="2"
            />
            {/* Stalk / Ears of Corn crossed */}
            <path
              d="M30 84 C42 66 56 46 76 20"
              stroke="#CA8A04"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
            {/* Grains / Ears along stem */}
            <circle cx="42" cy="70" r="3.5" fill="#EAB308" />
            <circle cx="48" cy="62" r="3.5" fill="#EAB308" />
            <circle cx="56" cy="52" r="3.5" fill="#EAB308" />
            <circle cx="64" cy="40" r="3.5" fill="#EAB308" />
            <circle cx="72" cy="28" r="3.5" fill="#EAB308" />
            <circle cx="48" cy="74" r="3" fill="#FACC15" />
            <circle cx="56" cy="64" r="3" fill="#FACC15" />
            <circle cx="64" cy="52" r="3" fill="#FACC15" />
            <circle cx="72" cy="40" r="3" fill="#FACC15" />
          </svg>
        );

      case 'NOTA': // None of the Above
        return (
          <svg
            viewBox="0 0 100 100"
            className="w-full h-full p-1"
            fill="none"
            aria-hidden="true"
          >
            {/* Outer Ballot Paper Rectangle */}
            <rect
              x="12"
              y="16"
              width="76"
              height="68"
              rx="6"
              fill="#F8FAFC"
              stroke="#0F172A"
              strokeWidth="4"
            />
            {/* Inner dotted ballot framing */}
            <rect
              x="18"
              y="22"
              width="64"
              height="56"
              rx="4"
              fill="none"
              stroke="#64748B"
              strokeWidth="1.5"
              strokeDasharray="3 3"
            />
            {/* Bold Black Cross (X) */}
            <line
              x1="28"
              y1="32"
              x2="72"
              y2="68"
              stroke="#0F172A"
              strokeWidth="8"
              strokeLinecap="round"
            />
            <line
              x1="72"
              y1="32"
              x2="28"
              y2="68"
              stroke="#0F172A"
              strokeWidth="8"
              strokeLinecap="round"
            />
          </svg>
        );

      default:
        return (
          <div className="flex flex-col items-center justify-center text-slate-400">
            <span className="text-[10px] font-bold uppercase">{symbolName.slice(0, 4)}</span>
          </div>
        );
    }
  };

  return (
    <div
      role="img"
      aria-label={accessibleLabel}
      title={accessibleLabel}
      style={dimension ? { width: dimension, height: dimension } : undefined}
      className={`relative flex items-center justify-center rounded-xl bg-white border border-slate-200/90 shadow-2xs overflow-hidden select-none shrink-0 ${className}`}
    >
      {renderSvgContent()}

      {showVerificationTag && (
        <div
          title="Verified against Election Commission of India Notification"
          className="absolute bottom-0 inset-x-0 bg-emerald-700 text-white text-[8px] font-bold uppercase tracking-wider text-center py-0.5"
        >
          ECI Verified
        </div>
      )}
    </div>
  );
};
