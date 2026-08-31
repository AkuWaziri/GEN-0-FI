import React from 'react';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export const ProjectLogoMark: React.FC<{ className?: string }> = ({ className = 'w-full h-full' }) => (
  <svg
    viewBox="0 0 100 100"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path
      d="M 12 18 H 54 A 32 32 0 0 1 86 50 A 32 32 0 0 1 54 82 H 12 A 6 6 0 0 1 6 76 V 24 A 6 6 0 0 1 12 18 Z"
      fill="#FFFFFF"
    />
  </svg>
);

export const Logo: React.FC<LogoProps> = ({ size = 'md', showText = true, className = '' }) => {
  const iconSizeClass = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
  }[size];

  const textSizeClass = {
    sm: 'text-sm font-bold',
    md: 'text-base font-bold',
    lg: 'text-xl font-extrabold',
  }[size];

  return (
    <div className={`flex items-center gap-2.5 select-none ${className}`} id="gen0-brand-logo">
      <div className={`relative flex items-center justify-center shrink-0 ${iconSizeClass}`}>
        <ProjectLogoMark className="w-full h-full" />
      </div>

      {showText && (
        <div className="flex flex-col leading-none">
          <div className={`tracking-tight text-white flex items-center gap-1.5 ${textSizeClass}`}>
            <span className="font-extrabold tracking-tight text-white">GEN-0</span>
            <span className="text-blue-400 font-bold font-mono text-[12px] px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/30">
              FI
            </span>
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[9px] text-zinc-400 font-mono tracking-widest uppercase font-medium">
              Arc Testnet
            </span>
            <span className="w-1 h-1 rounded-full bg-white/70" />
          </div>
        </div>
      )}
    </div>
  );
};

