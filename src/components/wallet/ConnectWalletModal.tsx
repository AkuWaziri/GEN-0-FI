import React from 'react';
import { useWallet } from '../../context/WalletContext';
import { X, Shield, Wallet, RefreshCw, AlertCircle, CheckCircle2, RotateCcw } from 'lucide-react';

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectWalletModal: React.FC<ConnectWalletModalProps> = ({ isOpen, onClose }) => {
  const {
    connectWallet,
    connectInjected,
    hasInjectedWallet,
    isConnecting,
    connectionState,
    error,
    retryConnection,
    clearError,
    isConnected,
  } = useWallet();

  if (!isOpen) return null;

  const handleConnectAppKit = async () => {
    try {
      await connectWallet();
    } catch (err) {
      console.warn('Connect modal trigger error:', err);
    }
  };

  const handleConnectInjected = async () => {
    try {
      await connectInjected();
      onClose();
    } catch (err) {
      console.warn('Injected connect error:', err);
    }
  };

  const handleRetry = async () => {
    await retryConnection();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      <div
        id="connect-wallet-modal"
        className="w-full max-w-md rounded-2xl bg-[#0d0f14] border border-blue-500/25 shadow-[0_0_35px_-8px_rgba(59,130,246,0.22),0_20px_50px_rgba(0,0,0,0.8)] overflow-hidden p-6 sm:p-7 relative space-y-5"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-2 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] font-mono tracking-wide uppercase font-semibold shadow-[0_0_10px_rgba(59,130,246,0.2)]">
              Arc Testnet
            </span>
          </div>
          <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
            Connect to GEN-0 FI
          </h2>
          <p className="text-xs sm:text-sm text-zinc-400 mt-1 leading-relaxed">
            Onchain financial intelligence, made simple.
          </p>
        </div>

        {/* Connection State Communication */}
        {connectionState === 'rejected' && (
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-700 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">Connection Cancelled</p>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  The wallet connection was dismissed. You can try again whenever you are ready.
                </p>
              </div>
            </div>

            <button
              id="btn-retry-rejected-connection"
              onClick={handleRetry}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black glow-blue-cta cursor-pointer min-h-[44px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          </div>
        )}

        {connectionState === 'failed' && (
          <div className="p-4 rounded-xl bg-zinc-900 border border-zinc-700 space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-white">Couldn't Connect Your Wallet</p>
                <p className="text-xs text-zinc-300 leading-relaxed">
                  {error || 'Ensure your wallet extension or mobile app is unlocked, then try again.'}
                </p>
              </div>
            </div>

            <button
              id="btn-retry-failed-connection"
              onClick={handleRetry}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black glow-blue-cta cursor-pointer min-h-[44px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          </div>
        )}

        {/* Connection Action Buttons */}
        {connectionState !== 'rejected' && connectionState !== 'failed' && (
          <div className="space-y-3">
            {hasInjectedWallet && (
              <button
                id="btn-modal-connect-injected"
                onClick={handleConnectInjected}
                disabled={isConnecting}
                className="w-full flex items-center justify-between p-4 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 border border-blue-500/35 hover:border-blue-500/60 transition-all text-left cursor-pointer group shadow-[0_0_20px_-3px_rgba(59,130,246,0.25)] min-h-[56px]"
              >
                <div className="flex items-center gap-3.5">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center text-blue-400 group-hover:scale-105 transition-transform shadow-[0_0_12px_rgba(59,130,246,0.3)]">
                    {isConnecting ? (
                      <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                    ) : (
                      <Wallet className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-white flex items-center gap-2">
                      <span>Browser Wallet</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-300 font-medium border border-blue-500/30">
                        Direct
                      </span>
                    </div>
                    <div className="text-xs text-zinc-400 mt-0.5">
                      MetaMask, Rabby, Brave, or Injected Extension
                    </div>
                  </div>
                </div>

                {isConnecting && (
                  <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-ping mr-2" />
                )}
              </button>
            )}

            <button
              id="btn-modal-connect-wallet"
              onClick={handleConnectAppKit}
              disabled={isConnecting}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-[#14161d] hover:bg-zinc-800/90 border border-zinc-800 hover:border-blue-500/35 hover:shadow-[0_0_18px_-4px_rgba(59,130,246,0.18)] transition-all text-left cursor-pointer group shadow-sm min-h-[56px]"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#090b0e] border border-zinc-800 group-hover:border-zinc-700 flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                  {isConnecting && !hasInjectedWallet ? (
                    <RefreshCw className="w-5 h-5 animate-spin text-white" />
                  ) : (
                    <Wallet className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {hasInjectedWallet ? 'Other Wallets (AppKit)' : 'Connect Wallet'}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    WalletConnect, Mobile QR, Coinbase, and 300+ wallets
                  </div>
                </div>
              </div>

              {isConnecting && !hasInjectedWallet && (
                <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.8)] animate-ping mr-2" />
              )}
            </button>
          </div>
        )}

        {/* Security / Non-custodial Reassurance */}
        <div className="pt-2 border-t border-zinc-900/80 flex items-center justify-center gap-1.5 text-xs text-zinc-400">
          <Shield className="w-3.5 h-3.5 text-blue-400 drop-shadow-[0_0_6px_rgba(59,130,246,0.5)]" />
          <span>Non-custodial</span>
        </div>
      </div>
    </div>
  );
};
