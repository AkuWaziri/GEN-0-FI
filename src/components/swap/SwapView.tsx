import React from 'react';
import { LiFiWidget, WidgetConfig } from '@lifi/widget';
import { EthereumProvider } from '@lifi/widget-provider-ethereum';
import { ArrowLeftRight } from 'lucide-react';

const widgetConfig: WidgetConfig = {
  providers: [EthereumProvider()],
};

class WidgetErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-[620px] flex items-center justify-center p-6">
          <div className="max-w-lg text-center space-y-3">
            <div className="text-red-400 text-sm font-semibold">
              LI.FI widget failed to initialize
            </div>
            <div className="text-xs text-zinc-500 font-mono break-words">
              {this.state.error.message}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export const SwapView: React.FC = () => {
  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 animate-in fade-in duration-200">
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-400">
            <ArrowLeftRight className="w-5 h-5" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Swap & Bridge
          </h1>
          <p className="text-sm text-zinc-400 max-w-xl mx-auto">
            Swap tokens or move supported assets across chains without leaving GEN-0FI.
          </p>
        </div>

        <div className="rounded-2xl overflow-hidden min-h-[620px] bg-[#0d0f12] border border-zinc-800">
          <WidgetErrorBoundary>
            <LiFiWidget integrator="GEN-0FI" config={widgetConfig} />
          </WidgetErrorBoundary>
        </div>

        <p className="text-[10px] text-zinc-500 text-center font-mono">
          Routes are provided by LI.FI. Review the route, destination, fees, and final amount before confirming.
        </p>
      </div>
    </div>
  );
};
