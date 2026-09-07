import React from 'react';
import { useWallet } from '../../context/WalletContext';
import { ARC_NETWORK_CONFIG } from '../../config/arc';
import { AlertCircle } from 'lucide-react';

export const NetworkBadge: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { isConnected, isCorrectNetwork, networkStatus, switchToArc } = useWallet();

  if (!isConnected) {
    return (
      <div
        id="network-badge-offline"
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#111317] border border-zinc-800 text-[11px] font-mono text-zinc-400 whitespace-nowrap"
      >
        <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
        <span>Arc</span>
      </div>
    );
  }

  if (!isCorrectNetwork) {
    return (
      <button
        id="network-badge-wrong-chain"
        onClick={() => switchToArc()}
        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-700 text-[11px] font-mono font-medium text-white hover:bg-zinc-800 transition-colors whitespace-nowrap cursor-pointer"
        title="Click to switch to Arc"
      >
        <AlertCircle className="w-3 h-3 text-zinc-400" />
        <span>Switch to Arc</span>
      </button>
    );
  }

  return (
    <div
      id="network-badge-active"
      className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#111317] border border-blue-500/25 text-[11px] font-mono text-zinc-300 whitespace-nowrap shadow-[0_0_14px_-2px_rgba(59,130,246,0.18)]"
    >
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-60"></span>
        <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)]"></span>
      </span>
      <span className="font-semibold text-white">{ARC_NETWORK_CONFIG.name}</span>
      {!compact && networkStatus?.latencyMs ? (
        <span className="text-[10px] text-zinc-400 font-mono border-l border-zinc-800 pl-1.5 font-medium">
          {networkStatus.latencyMs}ms
        </span>
      ) : null}
    </div>
  );
};
