import React from 'react';
import { Logo } from '../common/Logo';
import { Footer } from '../common/Footer';
import { Wallet, Flame } from 'lucide-react';
import { useTheme } from '../../context/ThemeContext';

interface LandingViewProps {
  onOpenConnect: () => void;
  onOpenGmStreak: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onOpenConnect, onOpenGmStreak }) => {
  const { theme } = useTheme();
  const isWhite = theme === 'white';

  return (
    <div className="min-h-screen bg-[#000000] text-zinc-100 flex flex-col justify-between selection:bg-white selection:text-black">
      {/* Top Navbar with Connect Wallet on the right side */}
      <header className={`flex items-center justify-between px-4 sm:px-8 lg:px-12 py-3.5 sm:py-4 border-b w-full backdrop-blur-md sticky top-0 z-30 transition-colors duration-200 ${isWhite ? 'border-zinc-200 bg-white/90' : 'border-zinc-900 bg-[#000000]/90'}`}>
        <Logo size="md" />
        <div className={`flex items-center gap-1 p-1 rounded-2xl border ${isWhite ? 'border-zinc-200 bg-white/80' : 'border-zinc-800 bg-zinc-950/70'}`}>
          <button
            type="button"
            onClick={onOpenGmStreak}
            className={`flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-semibold whitespace-nowrap transition-colors ${isWhite ? 'text-zinc-700 hover:text-black hover:bg-zinc-100' : 'text-zinc-300 hover:text-white hover:bg-white/5'}`}
          >
            <Flame className="w-3.5 h-3.5 text-blue-400" />
            <span>GM Streak</span>
          </button>
          <button
            id="btn-navbar-connect-wallet"
            onClick={onOpenConnect}
            className="flex items-center gap-1.5 h-9 px-2.5 sm:px-3 rounded-xl bg-white hover:bg-zinc-200 text-[11px] sm:text-xs font-bold text-black glow-blue-cta cursor-pointer transition-all duration-150 shadow-md whitespace-nowrap"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span className="hidden xs:inline sm:inline">Connect Wallet</span>
            <span className="xs:hidden sm:hidden">Connect</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-24 max-w-4xl mx-auto flex-1 flex flex-col items-center justify-center text-center">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-blue-500/10 border border-blue-400/35 text-sm sm:text-base font-semibold tracking-[0.12em] uppercase shadow-[0_0_24px_rgba(59,130,246,0.2)]">
          <span className="w-2 h-2 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,0.95)] animate-pulse" />
          <span className="bg-gradient-to-r from-blue-300 via-cyan-200 to-blue-400 bg-clip-text text-transparent drop-shadow-[0_0_12px_rgba(96,165,250,0.45)]">
            ONCHAIN FINANCE
          </span>
        </div>

        {/* Headline */}
        <div className="relative mt-6 sm:mt-8">
          <div
            className="absolute left-1/2 -top-10 -translate-x-1/2 w-80 sm:w-96 h-28 sm:h-32 bg-blue-500/15 blur-3xl pointer-events-none rounded-full"
            aria-hidden="true"
          />
          <h1 className="relative text-5xl sm:text-6xl md:text-7xl lg:text-8xl font-black tracking-tight text-white leading-none">
            MADE SIMPLE<span className="text-blue-500">.</span>
          </h1>
        </div>

        {/* Supporting Text */}
        <div className="mt-5 sm:mt-6 space-y-2.5 max-w-2xl">
          <p className="text-sm sm:text-base md:text-lg text-zinc-400 font-normal tracking-tight leading-relaxed">
            
          </p>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};
