import React, { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { ARC_NETWORK_CONFIG, ARC_TESTNET_CHAIN_ID } from '../../config/arc';
import {
  Settings as SettingsIcon,
  Shield,
  Radio,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { soundEngine } from '../../utils/sound';

export const SettingsView: React.FC = () => {
  const {
    chainId,
    isCorrectNetwork,
    networkStatus,
    switchToArc,
  } = useWallet();

  const [isMuted, setIsMuted] = useState(soundEngine.getIsMuted());

  const toggleSound = () => {
    const next = soundEngine.toggleMute();
    setIsMuted(next);
  };

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="pb-1 border-b border-zinc-900">
        <div className="flex items-center gap-2">
          <SettingsIcon className="w-4 h-4 text-white" />
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Settings & Network
          </h1>
        </div>
      </div>

      {/* Network Configuration Card */}
      <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-blue-400 drop-shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Active Blockchain Network</h2>
          </div>

          <div className="flex items-center gap-2">
            {isCorrectNetwork ? (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs font-mono font-semibold shadow-[0_0_10px_rgba(59,130,246,0.2)]">
                <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
                <span>Connected</span>
              </span>
            ) : (
              <button
                onClick={() => switchToArc()}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-900 border border-zinc-700 text-white text-xs font-mono font-medium hover:bg-zinc-800 transition-colors cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-zinc-400" />
                <span>Switch to Arc</span>
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-lg bg-[#131519] border border-zinc-800 space-y-1">
            <span className="text-zinc-500 uppercase tracking-wider font-mono text-[10px]">
              Network Name
            </span>
            <div className="font-semibold text-white text-xs sm:text-sm font-mono">{ARC_NETWORK_CONFIG.name}</div>
          </div>

          <div className="p-3 rounded-lg bg-[#131519] border border-zinc-800 space-y-1">
            <span className="text-zinc-500 uppercase tracking-wider font-mono text-[10px]">
              Chain ID
            </span>
            <div className="font-mono font-semibold text-white text-xs sm:text-sm">
              {ARC_NETWORK_CONFIG.chainId} (0x{ARC_TESTNET_CHAIN_ID.toString(16)})
            </div>
          </div>

          <div className="p-3 rounded-lg bg-[#131519] border border-zinc-800 space-y-1">
            <span className="text-zinc-500 uppercase tracking-wider font-mono text-[10px]">
              RPC Endpoint
            </span>
            <div className="font-mono text-zinc-300 truncate text-xs">
              {ARC_NETWORK_CONFIG.rpcUrl}
            </div>
            {networkStatus?.latencyMs ? (
              <div className="text-[10px] text-zinc-400 pt-0.5 font-mono">
                Latency: {networkStatus.latencyMs}ms • Block #{networkStatus.blockNumber}
              </div>
            ) : null}
          </div>

          <div className="p-3 rounded-lg bg-[#131519] border border-zinc-800 space-y-1">
            <span className="text-zinc-500 uppercase tracking-wider font-mono text-[10px]">
              Native Gas Token
            </span>
            <div className="font-semibold text-white text-xs sm:text-sm font-mono">
              USDC (USD Coin • 18 Decimals)
            </div>
          </div>
        </div>

        <div className="pt-2 flex items-center justify-between text-xs text-zinc-400 border-t border-zinc-800/80">
          <a
            href={ARC_NETWORK_CONFIG.explorerUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="text-zinc-300 hover:text-white flex items-center gap-1 font-mono text-[11px] transition-colors"
          >
            <span>Open ArcScan Block Explorer</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>

          <button
            onClick={() => switchToArc()}
            className="text-xs text-zinc-400 hover:text-white underline cursor-pointer font-mono"
          >
            Re-sync Wallet Network
          </button>
        </div>
      </div>

      {/* Audio & Tactile Feedback */}
      <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 space-y-3 shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isMuted ? (
              <VolumeX className="w-4 h-4 text-zinc-400" />
            ) : (
              <Volume2 className="w-4 h-4 text-white" />
            )}
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Audio & Tactile Feedback</h2>
          </div>

          <button
            onClick={toggleSound}
            className={`px-3 py-1 rounded-lg text-xs font-semibold font-mono transition-all cursor-pointer ${
              !isMuted
                ? 'bg-white text-black glow-blue-cta'
                : 'bg-[#131519] border border-zinc-800 text-zinc-400 hover:text-white'
            }`}
          >
            {!isMuted ? 'ENABLED' : 'MUTED'}
          </button>
        </div>

        <div className="flex items-center justify-between text-xs text-zinc-400">
          <p className="leading-relaxed">
            Plays a subtle, soft click sound on all buttons, tabs, and interactive elements.
          </p>
          <button
            onClick={() => soundEngine.playSoftClick(540, 0.05)}
            className="px-2.5 py-1 rounded bg-[#131519] border border-zinc-800 hover:border-zinc-600 text-[11px] text-zinc-300 hover:text-white whitespace-nowrap ml-4 cursor-pointer"
          >
            Test Sound
          </button>
        </div>
      </div>

      {/* Security Guarantee */}
      <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 space-y-2.5 shadow-sm">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-white" />
          <h2 className="text-xs sm:text-sm font-bold text-white tracking-tight">Security & Privacy Protocol</h2>
        </div>

        <p className="text-xs text-zinc-400 leading-relaxed">
          GEN-0 FI operates under a strict read-only model. The application never accesses, requests, or stores private keys, seed phrases, or wallet passwords. All balances and transactions are verified directly against the public Arc blockchain.
        </p>

        <div className="pt-2 flex items-center justify-between text-[11px] text-zinc-500 border-t border-zinc-900 font-mono">
          <span>App Version 1.0.0 (Arc MVP)</span>
          <span>Secure Read-Only Architecture</span>
        </div>
      </div>
    </div>
  );
};
