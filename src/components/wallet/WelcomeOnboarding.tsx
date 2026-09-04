import React from 'react';
import { useWallet } from '../../context/WalletContext';
import { CheckCircle2, ArrowRight } from 'lucide-react';

interface WelcomeOnboardingProps {
  onDismiss: () => void;
}

export const WelcomeOnboarding: React.FC<WelcomeOnboardingProps> = ({ onDismiss }) => {
  const { shortAddress, balanceUSDC } = useWallet();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-in fade-in duration-300 select-none">
      <div className="w-full max-w-md rounded-2xl bg-[#0d0f14] border border-zinc-800 p-8 text-center space-y-6 shadow-2xl relative overflow-hidden">
        {/* Subtle accent glow */}
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 w-40 h-40 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

        {/* Success Icon */}
        <div className="w-16 h-16 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white mx-auto shadow-inner">
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>

        {/* Copy Per Requirements */}
        <div className="space-y-2">
          <h2 className="text-2xl font-extrabold text-white tracking-tight">
            your wallet is connected
          </h2>
          <p className="text-base text-zinc-400 font-medium">
            let's see what's happening inside it.
          </p>
        </div>

        {/* Connected Details summary pill */}
        <div className="rounded-xl bg-[#13161c] border border-zinc-800/80 p-3.5 flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white font-semibold">{shortAddress}</span>
          </div>

          <div className="text-zinc-400">
            <span className="text-white font-semibold">{balanceUSDC}</span> USDC
          </div>
        </div>

        {/* Subtle animated loading line indicating auto-advance */}
        <div className="w-full bg-zinc-900 rounded-full h-1 overflow-hidden">
          <div className="bg-white h-full w-full animate-[shimmer_2s_infinite] origin-left transition-all" />
        </div>

        {/* Manual Continue Button */}
        <button
          id="btn-welcome-continue"
          onClick={onDismiss}
          className="w-full flex items-center justify-center gap-2 py-3 px-6 rounded-xl bg-white hover:bg-zinc-200 text-sm font-bold text-black transition-all shadow-sm cursor-pointer min-h-[44px]"
        >
          <span>Continue to Dashboard</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
