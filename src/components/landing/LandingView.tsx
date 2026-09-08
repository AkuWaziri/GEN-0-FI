import React from 'react';
import { Logo } from '../common/Logo';
import { Footer } from '../common/Footer';
import { Wallet } from 'lucide-react';

interface LandingViewProps {
  onOpenConnect: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onOpenConnect }) => {
  return (
    <div className="min-h-screen bg-[#000000] text-zinc-100 flex flex-col justify-between selection:bg-white selection:text-black">
      {/* Top Navbar with Connect Wallet on the right side */}
      <header className="flex items-center justify-between px-4 sm:px-8 lg:px-12 py-3.5 sm:py-4 border-b border-zinc-900 w-full bg-[#000000]/90 backdrop-blur-md sticky top-0 z-30">
        <Logo size="md" />
        <div className="flex items-center gap-2.5 sm:gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#111317] border border-blue-500/25 text-xs font-mono text-zinc-300 shadow-[0_0_12px_rgba(59,130,246,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
            <span>Arc. Testnet</span>
          </div>

          <button
            id="btn-navbar-connect-wallet"
            onClick={onOpenConnect}
            className="flex items-center gap-2 py-2 px-3.5 sm:px-4 rounded-xl bg-white hover:bg-zinc-200 text-xs font-bold text-black glow-blue-cta cursor-pointer transition-all duration-150 shadow-md"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Connect Wallet</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="w-full px-4 sm:px-6 lg:px-8 py-16 sm:py-24 max-w-4xl mx-auto flex-1 flex flex-col items-center justify-center text-center">
        {/* Eyebrow */}
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-[11px] sm:text-xs font-mono font-semibold text-blue-400 tracking-wider uppercase shadow-[0_0_16px_rgba(59,130,246,0.15)]">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.9)] animate-pulse" />
          <span>ONCHAIN FINANCIAL INTELLIGENCE</span>
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
          <p className="text-lg sm:text-xl md:text-2xl text-zinc-200 font-medium tracking-tight leading-snug">
            Connect your wallet. Decode every transaction/activities.
          </p>
          <p className="text-sm sm:text-base md:text-lg text-zinc-400 font-normal tracking-tight leading-relaxed">
            GEN-0 turns your onchain life into financial intelligent insight. no interpretation required.
          </p>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};
