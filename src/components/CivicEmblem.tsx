import React from 'react';

interface CivicEmblemProps {
  className?: string;
  size?: number;
}

export const CivicEmblem: React.FC<CivicEmblemProps> = ({ className = 'w-10 h-10', size = 40 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Ashoka Chakra Civic Emblem"
    >
      {/* Outer Ring */}
      <circle cx="50" cy="50" r="46" stroke="#0B2545" strokeWidth="4" />
      <circle cx="50" cy="50" r="41" stroke="#EA580C" strokeWidth="1.5" strokeDasharray="3 3" />
      <circle cx="50" cy="50" r="14" stroke="#0B2545" strokeWidth="3" fill="#F8FAFC" />
      <circle cx="50" cy="50" r="5" fill="#0B2545" />

      {/* 24 Spoke Elements */}
      {Array.from({ length: 24 }).map((_, i) => {
        const angle = (i * 360) / 24;
        return (
          <line
            key={i}
            x1="50"
            y1="50"
            x2="50"
            y2="9"
            stroke="#134074"
            strokeWidth="2"
            strokeLinecap="round"
            transform={`rotate(${angle} 50 50)`}
          />
        );
      })}
    </svg>
  );
};
