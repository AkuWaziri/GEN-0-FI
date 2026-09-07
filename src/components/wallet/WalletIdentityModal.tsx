import React, { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { getArcScanAddressUrl } from '../../config/arc';
import { X, Copy, Check, ExternalLink, LogOut, Shield, RefreshCw } from 'lucide-react';

interface WalletIdentityModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const WalletIdentityModal: React.FC<WalletIdentityModalProps> = ({ isOpen, onClose }) => {
  const {
    address,
    shortAddress,
    balanceUSDC,
    walletName,
    disconnectWallet,
    refreshData,
    isRefreshing,
  } = useWallet();

  const [copied, setCopied] = useState(false);

  if (!isOpen || !address) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDisconnect = () => {
    disconnectWallet();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200 select-none">
      <div
        id="wallet-identity-modal"
        className="w-full max-w-md rounded-2xl bg-[#0d0f14] border border-blue-500/25 shadow-[0_0_35px_-8px_rgba(59,130,246,0.22),0_20px_50px_rgba(0,0,0,0.8)] p-6 sm:p-7 space-y-6 relative"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.8)]" />
            <span className="text-[11px] font-mono uppercase tracking-wider text-blue-300 font-semibold">
              Arc (5042002)
            </span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Connected Wallet</h2>
          <p className="text-xs text-zinc-400 mt-0.5">{walletName || 'Web3 EVM Wallet'}</p>
        </div>

        {/* Address Display Card */}
        <div className="rounded-xl bg-[#12141a] border border-zinc-800 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-400 font-medium">Account Address:</span>
            <span className="text-xs font-mono font-bold text-white">{shortAddress}</span>
          </div>

          {/* Full address box */}
          <div className="p-2.5 rounded-lg bg-[#08090c] border border-zinc-800/80 font-mono text-[11px] text-zinc-300 break-all select-all flex items-center justify-between gap-2">
            <span>{address}</span>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500/35 hover:shadow-[0_0_12px_rgba(59,130,246,0.18)] text-xs font-medium text-white transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-blue-400" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-zinc-400" />
                  <span>Copy Address</span>
                </>
              )}
            </button>

            <a
              href={getArcScanAddressUrl(address)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500/35 hover:shadow-[0_0_12px_rgba(59,130,246,0.18)] text-xs font-medium text-white transition-all cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
              <span>View on ArcScan</span>
            </a>
          </div>
        </div>

        {/* Real Balance Section */}
        <div className="rounded-xl bg-[#12141a] border border-blue-500/20 glow-blue-wallet p-4 flex items-center justify-between">
          <div>
            <span className="text-xs text-zinc-400 font-medium block">Arc Balance</span>
            <span className="text-2xl font-extrabold text-white tracking-tight font-mono">
              {balanceUSDC} <span className="text-sm font-sans font-semibold text-zinc-400">USDC</span>
            </span>
          </div>

          <button
            type="button"
            onClick={() => refreshData()}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-zinc-900 border border-zinc-700 hover:border-blue-500/40 hover:shadow-[0_0_12px_rgba(59,130,246,0.2)] text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Refresh balance"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-white' : ''}`} />
          </button>
        </div>

        {/* Non-custodial Note & Disconnect Action */}
        <div className="space-y-3 pt-2">
          <button
            id="btn-modal-disconnect-wallet"
            type="button"
            onClick={handleDisconnect}
            className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-red-950/40 border border-zinc-800 hover:border-red-800/60 text-xs font-semibold text-zinc-300 hover:text-red-300 transition-colors cursor-pointer min-h-[44px]"
          >
            <LogOut className="w-4 h-4 text-zinc-400 group-hover:text-red-400" />
            <span>Disconnect Wallet</span>
          </button>

          <div className="flex items-center justify-center gap-1.5 text-[11px] text-zinc-500 font-medium">
            <Shield className="w-3 h-3 text-zinc-500" />
            <span>Non-custodial · You stay in control</span>
          </div>
        </div>
      </div>
    </div>
  );
};
