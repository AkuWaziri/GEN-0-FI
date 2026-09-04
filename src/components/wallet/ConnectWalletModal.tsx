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
    isConnecting,
    connectionState,
    error,
    retryConnection,
    clearError,
    isConnected,
  } = useWallet();

  if (!isOpen) return null;

  const handleConnect = async () => {
    try {
      await connectWallet();
      // AppKit modal will open in front
    } catch (err) {
      console.warn('Connect modal trigger error:', err);
    }
  };

  const handleRetry = async () => {
    await retryConnection();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      <div
        id="connect-wallet-modal"
        className="w-full max-w-md rounded-2xl bg-[#0d0f14] border border-zinc-800 shadow-2xl overflow-hidden p-6 sm:p-7 relative space-y-5"
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
            <span className="px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] font-mono tracking-wide uppercase font-semibold">
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
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all cursor-pointer min-h-[44px]"
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
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all cursor-pointer min-h-[44px]"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Try Again</span>
            </button>
          </div>
        )}

        {/* Primary Action Button (Connect or Connecting) */}
        {connectionState !== 'rejected' && connectionState !== 'failed' && (
          <div className="space-y-3">
            <button
              id="btn-modal-connect-wallet"
              onClick={handleConnect}
              disabled={isConnecting}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-[#14161d] hover:bg-zinc-800/90 border border-zinc-800 hover:border-zinc-600 transition-all text-left cursor-pointer group shadow-sm min-h-[56px]"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#090b0e] border border-zinc-800 flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                  {isConnecting ? (
                    <RefreshCw className="w-5 h-5 animate-spin text-white" />
                  ) : (
                    <Wallet className="w-5 h-5 text-white" />
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">
                    {isConnecting ? 'Connecting...' : 'Connect Wallet'}
                  </div>
                  <div className="text-xs text-zinc-400 mt-0.5">
                    MetaMask, Rabby, Coinbase Wallet, WalletConnect
                  </div>
                </div>
              </div>

              {isConnecting && (
                <div className="w-2 h-2 rounded-full bg-blue-500 animate-ping mr-2" />
              )}
            </button>
          </div>
        )}

        {/* Security / Non-custodial Reassurance */}
        <div className="pt-2 border-t border-zinc-900/80 flex items-center justify-center gap-1.5 text-xs text-zinc-400">
          <Shield className="w-3.5 h-3.5 text-blue-400" />
          <span>Non-custodial</span>
        </div>
      </div>
    </div>
  );
};
