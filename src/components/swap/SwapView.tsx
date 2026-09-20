import React, { useMemo } from 'react';
import { LiFiWidget, WidgetConfig } from '@lifi/widget';
import { EthereumProvider } from '@lifi/widget-provider-ethereum';
import { getWalletClient, switchChain } from '@wagmi/core';
import { wagmiConfig } from '../../config/wagmi';
import { ArrowLeftRight } from 'lucide-react';

export const SwapView: React.FC = () => {
  const widgetConfig = useMemo<WidgetConfig>(() => ({
    appearance: 'dark',
    variant: 'wide',
    providers: [
      EthereumProvider({
        getWalletClient: () => getWalletClient(wagmiConfig),
        switchChain: async (chainId) => {
          const chain = await switchChain(wagmiConfig, { chainId });
          return getWalletClient(wagmiConfig, { chainId: chain.id });
        },
      }),
    ],
    defaultUI: {
      layout: 'cards',
    },
    theme: {
      palette: {
        primary: { main: '#3b82f6' },
        secondary: { main: '#60a5fa' },
        background: {
          default: '#0d0f12',
          paper: '#111317',
        },
        text: {
          primary: '#ffffff',
          secondary: '#a1a1aa',
        },
      },
      shape: {
        borderRadius: 16,
        borderRadiusSecondary: 12,
      },
      typography: {
        fontFamily: 'Manrope, sans-serif',
      },
      container: {
        border: '1px solid rgba(63, 63, 70, 0.8)',
        borderRadius: '18px',
        height: 760,
      },
    },
  }), []);

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 animate-in fade-in duration-200">
      <div className="max-w-5xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-400">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Swap & Bridge
            </h1>
            <p className="text-sm text-zinc-400">
              Swap assets or move them across supported chains through LI.FI.
            </p>
          </div>
        </div>

        <div className="w-full overflow-hidden rounded-2xl bg-[#0d0f12]">
          <LiFiWidget
            integrator="GEN-0FI"
            config={widgetConfig}
          />
        </div>
      </div>
    </div>
  );
};
