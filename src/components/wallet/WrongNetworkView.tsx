import React, { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { ARC_NETWORK_CONFIG, ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL, ARC_TESTNET_EXPLORER_URL } from '../../config/arc';
import { AlertTriangle, RefreshCw, LogOut, ExternalLink, HelpCircle, Check, Copy } from 'lucide-react';

export const WrongNetworkView: React.FC = () => {
  const {
    detectedNetworkName,
    chainId,
    switchToArc,
    disconnectWallet,
    error,
  } = useWallet();

  const [isSwitching, setIsSwitching] = useState(false);
  const [showManualGuide, setShowManualGuide] = useState(false);
  const [copiedRpc, setCopiedRpc] = useState(false);

  const handleSwitch = async () => {
    setIsSwitching(true);
    try {
      await switchToArc();
    } finally {
      setIsSwitching(false);
    }
  };

  const copyRpcUrl = () => {
    navigator.clipboard.writeText(ARC_TESTNET_RPC_URL);
    setCopiedRpc(true);
    setTimeout(() => setCopiedRpc(false), 2000);
  };

  return (
    <div className="min-h-screen bg-[#050608] text-zinc-100 flex flex-col justify-center items-center p-4 sm:p-6 lg:p-8 select-none">
      <div className="w-full max-w-lg rounded-2xl bg-[#0c0e12] border border-zinc-800 p-6 sm:p-8 shadow-2xl space-y-6">
        {/* Warning Icon & Status */}
        <div className="text-center space-y-3">
          <div className="w-14 h-14 rounded-2xl bg-zinc-900 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto shadow-sm">
            <AlertTriangle className="w-7 h-7" />
          </div>

          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-xs font-mono text-amber-300">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
            <span>Unsupported Network</span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
            Switch to Arc
          </h1>

          <p className="text-sm text-zinc-300 max-w-md mx-auto leading-relaxed">
            GEN-0 FI currently runs on <strong className="text-white font-semibold">Arc</strong>.
          </p>
        </div>

        {/* Current vs Target Network Card */}
        <div className="rounded-xl bg-[#12151b] border border-zinc-800 p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between py-1 border-b border-zinc-800/80">
            <span className="text-zinc-400">Current Network:</span>
            <span className="font-mono text-amber-300 font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              {detectedNetworkName} {chainId ? `(${chainId})` : ''}
            </span>
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-zinc-400">Required Network:</span>
            <span className="font-mono text-white font-semibold flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {ARC_NETWORK_CONFIG.name} ({ARC_TESTNET_CHAIN_ID})
            </span>
          </div>
        </div>

        {/* Error Feedback if programmatic switch failed */}
        {error && (
          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-800/40 text-xs text-amber-200/90 leading-relaxed">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        <div className="space-y-3">
          <button
            id="btn-switch-network"
            onClick={handleSwitch}
            disabled={isSwitching}
            className="w-full flex items-center justify-center gap-2.5 py-3 px-6 rounded-xl bg-white hover:bg-zinc-200 text-sm font-bold text-black glow-blue-cta cursor-pointer disabled:opacity-60 min-h-[44px]"
          >
            {isSwitching ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin text-black" />
                <span>Requesting Switch in Wallet...</span>
              </>
            ) : (
              <span>Switch Network</span>
            )}
          </button>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setShowManualGuide(!showManualGuide)}
              className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1 cursor-pointer py-1"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              <span>{showManualGuide ? 'Hide manual parameters' : 'Need help adding Arc manually?'}</span>
            </button>

            <button
              id="btn-wrong-network-disconnect"
              type="button"
              onClick={disconnectWallet}
              className="text-xs text-zinc-400 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer py-1"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Disconnect</span>
            </button>
          </div>
        </div>

        {/* Manual Network Parameters Guide */}
        {showManualGuide && (
          <div className="rounded-xl bg-[#08090c] border border-zinc-800/90 p-4 space-y-2.5 text-xs text-zinc-300 font-mono animate-in fade-in duration-200">
            <div className="text-zinc-400 font-sans text-[11px] mb-2 font-medium">
              If your mobile wallet or extension doesn't accept automatic switching, enter these details in your wallet:
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
              <span className="text-zinc-500">Network Name:</span>
              <span className="text-white font-semibold">Arc</span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
              <span className="text-zinc-500">Chain ID:</span>
              <span className="text-white font-semibold">5042002</span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
              <span className="text-zinc-500">Currency Symbol:</span>
              <span className="text-white font-semibold">USDC</span>
            </div>

            <div className="flex items-center justify-between border-b border-zinc-800/60 pb-1.5">
              <span className="text-zinc-500">RPC URL:</span>
              <div className="flex items-center gap-1.5">
                <span className="text-zinc-200 truncate max-w-[170px]">{ARC_TESTNET_RPC_URL}</span>
                <button
                  type="button"
                  onClick={copyRpcUrl}
                  className="p-1 text-zinc-400 hover:text-white cursor-pointer"
                  title="Copy RPC URL"
                >
                  {copiedRpc ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between pt-0.5">
              <span className="text-zinc-500">Block Explorer:</span>
              <a
                href={ARC_TESTNET_EXPLORER_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-300 hover:text-white flex items-center gap-1"
              >
                <span>arcscan.app</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
