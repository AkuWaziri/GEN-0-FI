import React, { useMemo } from 'react';
import { LiFiWidget, WidgetConfig } from '@lifi/widget';
import { EthereumProvider } from '@lifi/widget-provider-ethereum';
import { ArrowLeftRight, ShieldCheck, Zap, Route } from 'lucide-react';

export const SwapView: React.FC = () => {
  const widgetConfig = useMemo<WidgetConfig>(() => ({
    providers: [EthereumProvider()],
    appearance: 'dark',
    variant: 'compact',
    hiddenUI: ['appearance', 'language', 'walletMenu', 'toAddress'],
    theme: {
      palette: {
        primary: { main: '#3b82f6' },
        secondary: { main: '#60a5fa' },
        background: { default: '#0d0f12', paper: '#111317' },
        text: { primary: '#ffffff', secondary: '#a1a1aa' },
      },
      shape: { borderRadius: 16, borderRadiusSecondary: 12 },
      typography: { fontFamily: 'Manrope, sans-serif' },
      container: {
        border: '1px solid rgba(63, 63, 70, 0.8)',
        borderRadius: '18px',
        boxShadow: '0 0 30px -10px rgba(59, 130, 246, 0.18)',
        maxHeight: 760,
      },
    },
  }), []);

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-5 animate-in fade-in duration-200">
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-400">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Swap & Bridge</h1>
          <p className="text-sm text-zinc-400 max-w-xl mx-auto">
            Move tokens between chains or swap into the asset you need, without leaving GEN-0.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2.5 max-w-xl mx-auto">
          <div className="rounded-xl border border-zinc-800 bg-[#0d0f12] p-3 text-center">
            <Route className="w-4 h-4 text-blue-400 mx-auto mb-1.5" />
            <span className="text-[10px] sm:text-xs text-zinc-400">Smart routing</span>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#0d0f12] p-3 text-center">
            <Zap className="w-4 h-4 text-blue-400 mx-auto mb-1.5" />
            <span className="text-[10px] sm:text-xs text-zinc-400">Multi-chain</span>
          </div>
          <div className="rounded-xl border border-zinc-800 bg-[#0d0f12] p-3 text-center">
            <ShieldCheck className="w-4 h-4 text-blue-400 mx-auto mb-1.5" />
            <span className="text-[10px] sm:text-xs text-zinc-400">Route simulation</span>
          </div>
        </div>

        <div className="rounded-2xl overflow-hidden">
          <LiFiWidget integrator="GEN-0FI" config={widgetConfig} />
        </div>

        <p className="text-[10px] text-zinc-500 text-center font-mono">
          Routes are provided by LI.FI and may use different bridges, DEXs, or solvers depending on availability.
          Review the route, amount, fees, and destination before confirming in your wallet.
        </p>
      </div>
    </div>
  );
};
