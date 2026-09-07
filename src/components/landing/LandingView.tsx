import React from 'react';
import { Logo } from '../common/Logo';
import { Footer } from '../common/Footer';
import { Wallet, Sparkles, Shield, Cpu, CheckCircle2 } from 'lucide-react';

interface LandingViewProps {
  onOpenConnect: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onOpenConnect }) => {
  const pillars = [
    {
      icon: Cpu,
      title: 'Understand your wallet',
      description:
        'Instant clarity on your Arc assets, native USDC balances, and complete transaction flow.',
    },
    {
      icon: Sparkles,
      title: 'AI-powered explanations',
      description:
        'Ask questions about transactions, counterparties, and spending in plain conversational English.',
    },
    {
      icon: CheckCircle2,
      title: 'Real onchain activity',
      description:
        'Direct connection to official Arc RPC and ArcScan explorer. Zero simulated data, 100% verified facts.',
    },
    {
      icon: Shield,
      title: 'Secure by design',
      description:
        'We never ask for private keys or seed phrases. Purely public onchain intelligence.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-zinc-100 flex flex-col justify-between selection:bg-white selection:text-black">
      {/* Top Navbar */}
      <header className="flex items-center justify-between px-4 sm:px-8 lg:px-12 py-4 border-b border-zinc-900 w-full bg-[#000000]/90 backdrop-blur-md sticky top-0 z-30">
        <Logo size="md" />
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-[#111317] border border-blue-500/25 text-xs font-mono text-zinc-300 shadow-[0_0_12px_rgba(59,130,246,0.15)]">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
            <span>Arc. Testnet</span>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="w-full px-4 sm:px-8 lg:px-12 py-10 sm:py-16 text-center max-w-6xl mx-auto flex-1 flex flex-col justify-center">
        {/* Hero Title with Blue Glow */}
        <div className="relative max-w-4xl mx-auto">
          {/* Blue glow effect beneath the title */}
          <div
            className="absolute left-1/2 -translate-x-1/2 -bottom-4 sm:-bottom-6 w-4/5 max-w-2xl h-16 sm:h-24 bg-blue-500/25 blur-2xl sm:blur-3xl rounded-full pointer-events-none -z-10"
            aria-hidden="true"
          />
          <h1 className="relative text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-[1.15]">
            Onchain Financial Intelligence,{' '}
            <span className="text-zinc-400">
              Made Simple.
            </span>
          </h1>
        </div>

        {/* Supporting Copy */}
        <div className="mt-5 sm:mt-6 space-y-2.5 max-w-2xl mx-auto">
          <p className="text-base sm:text-xl text-zinc-200 font-medium tracking-tight">
            Connect your wallet. See what happened. Understand your money.
          </p>
          <p className="text-sm sm:text-base text-zinc-400 font-normal leading-relaxed">
            GEN-0 FI turns your onchain activity into clear, useful financial intelligence.
          </p>
        </div>

        {/* Primary CTA Button */}
        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            id="btn-landing-hero-connect"
            onClick={onOpenConnect}
            className="w-full sm:w-auto flex items-center justify-center gap-2.5 py-3.5 px-8 rounded-xl bg-white hover:bg-zinc-200 text-sm font-bold text-black glow-blue-cta cursor-pointer min-h-[48px]"
          >
            <Wallet className="w-4 h-4" />
            <span>Connect Wallet</span>
          </button>
        </div>

        {/* 4 Pillars Section */}
        <div className="mt-14 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-left w-full">
          {pillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            const isShield = pillar.icon === Shield;
            return (
              <div
                key={idx}
                className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800/80 glow-blue-card-hover group shadow-sm"
              >
                <div
                  className={`w-8 h-8 rounded-lg bg-zinc-900 border flex items-center justify-center mb-3 group-hover:scale-105 transition-transform ${
                    isShield
                      ? 'border-blue-500/40 text-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.3)]'
                      : 'border-zinc-700/80 text-white group-hover:border-blue-500/30 group-hover:text-blue-300'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-semibold text-white mb-1 tracking-tight">{pillar.title}</h2>
                <p className="text-xs text-zinc-400 leading-relaxed">{pillar.description}</p>
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
};
