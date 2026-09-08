import React from 'react';
import { Logo } from '../common/Logo';
import { Footer } from '../common/Footer';
import { LandingDashboardPreview } from './LandingDashboardPreview';
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

      {/* Hero Section: Left-side bold messaging + Right-side dashboard preview */}
      <main className="w-full px-4 sm:px-8 lg:px-12 py-8 sm:py-12 lg:py-16 max-w-7xl mx-auto flex-1 flex flex-col justify-center">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Bold Messaging */}
          <div className="lg:col-span-5 text-left space-y-4 sm:space-y-5">
            {/* Eyebrow */}
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/25 text-[11px] font-mono font-semibold text-blue-400 tracking-wider uppercase shadow-[0_0_12px_rgba(59,130,246,0.12)]">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.9)] animate-pulse" />
              <span>ONCHAIN FINANCIAL INTELLIGENCE</span>
            </div>

            {/* Headline */}
            <div className="relative">
              <div
                className="absolute -left-4 -top-6 w-48 h-20 bg-blue-500/15 blur-3xl pointer-events-none rounded-full"
                aria-hidden="true"
              />
              <h1 className="relative text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-white leading-[1.05]">
                MADE SIMPLE<span className="text-blue-500">.</span>
              </h1>
            </div>

            {/* Supporting Text */}
            <p className="text-base sm:text-lg text-zinc-200 font-medium tracking-tight leading-snug">
              Connect your wallet. See what happened. Understand your money.
            </p>

            {/* Description */}
            <p className="text-xs sm:text-sm text-zinc-400 font-normal leading-relaxed max-w-md">
              GEN-0 FI turns your onchain activity into clear, useful financial intelligence.
            </p>

            {/* Status Indicator */}
            <div className="pt-2 flex items-center gap-3">
              <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d0f12] border border-zinc-800 text-xs font-mono text-zinc-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span>Live RPC Sync • Chain 5042002</span>
              </div>
            </div>
          </div>

          {/* Right Column: Polished Product Dashboard Preview */}
          <div className="lg:col-span-7 w-full">
            <LandingDashboardPreview />
          </div>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};
