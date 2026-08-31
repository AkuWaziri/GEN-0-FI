import React from 'react';
import { Logo } from '../common/Logo';
import { useWallet, DEMO_ARC_ADDRESS } from '../../context/WalletContext';
import { ARC_NETWORK_CONFIG } from '../../config/arc';
import { Wallet, Sparkles, Shield, Cpu, ArrowRight, CheckCircle2, ExternalLink } from 'lucide-react';

interface LandingViewProps {
  onOpenConnect: () => void;
}

export const LandingView: React.FC<LandingViewProps> = ({ onOpenConnect }) => {
  const { inspectAddress } = useWallet();

  const handleExploreDemo = async () => {
    await inspectAddress(DEMO_ARC_ADDRESS, true);
  };

  const pillars = [
    {
      icon: Cpu,
      title: 'Understand your wallet',
      description:
        'Instant clarity on your Arc Testnet assets, native USDC balances, and complete transaction flow.',
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
      title: 'Non-custodial by design',
      description:
        'We never ask for private keys, seed phrases, or custody. Purely public onchain intelligence.',
    },
  ];

  return (
    <div className="min-h-screen bg-[#000000] text-zinc-100 flex flex-col justify-between selection:bg-white selection:text-black">
      {/* Top Navbar */}
      <header className="flex items-center justify-between px-4 sm:px-8 lg:px-12 py-4 border-b border-zinc-900 w-full bg-[#000000]/90 backdrop-blur-md sticky top-0 z-30">
        <Logo size="md" />
        <div className="flex items-center gap-3">
          <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-[#111317] border border-zinc-800 text-xs font-mono text-zinc-400">
            <span className="w-1.5 h-1.5 rounded-full bg-white" />
            <span>Arc Testnet</span>
          </div>
          <button
            id="btn-landing-top-connect"
            onClick={onOpenConnect}
            className="flex items-center gap-2 py-2 px-4 rounded-xl bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all shadow-sm cursor-pointer"
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Connect Wallet</span>
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="w-full px-4 sm:px-8 lg:px-12 py-10 sm:py-16 text-center max-w-6xl mx-auto flex-1 flex flex-col justify-center">
        {/* Hero Title */}
        <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white max-w-4xl mx-auto leading-[1.15]">
          Onchain financial intelligence,{' '}
          <span className="text-zinc-400">
            made simple.
          </span>
        </h1>

        {/* Supporting Copy */}
        <p className="mt-5 text-base sm:text-lg text-zinc-400 max-w-2xl mx-auto font-normal leading-relaxed">
          Connect your wallet. See what happened. Understand why it matters.
        </p>

        {/* CTAs */}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            id="btn-hero-primary-connect"
            onClick={onOpenConnect}
            className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-7 rounded-xl bg-white hover:bg-zinc-200 text-sm font-bold text-black transition-all shadow-md cursor-pointer"
          >
            <Wallet className="w-4 h-4" />
            <span>Connect Wallet</span>
          </button>

          <button
            id="btn-hero-explore-demo"
            onClick={handleExploreDemo}
            className="w-full sm:w-auto flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-[#111317] hover:bg-zinc-900 border border-zinc-800 hover:border-zinc-600 text-sm font-semibold text-zinc-200 transition-all cursor-pointer group"
          >
            <span>Explore Demo</span>
            <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
          </button>
        </div>

        {/* 4 Pillars Section */}
        <div className="mt-14 sm:mt-16 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-left w-full">
          {pillars.map((pillar, idx) => {
            const Icon = pillar.icon;
            return (
              <div
                key={idx}
                className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800/80 hover:border-zinc-600 transition-all group shadow-sm"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-700/80 flex items-center justify-center text-white mb-3 group-hover:scale-105 transition-transform">
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
      <footer className="border-t border-zinc-900 py-6 px-4 sm:px-8 lg:px-12 text-center text-xs text-zinc-500 w-full flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2 font-mono">
          <span className="font-semibold text-zinc-300">GEN-0 FI</span>
          <span>•</span>
          <span>Official Arc Testnet (Chain ID 5042002)</span>
        </div>

        <div className="flex items-center gap-4">
          <a
            href={ARC_NETWORK_CONFIG.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-white transition-colors flex items-center gap-1 font-mono"
          >
            <span>ArcScan Explorer</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </footer>
    </div>
  );
};
