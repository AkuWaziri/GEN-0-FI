import React, { useState } from 'react';
import { useWallet, DEMO_ARC_ADDRESS } from '../../context/WalletContext';
import { X, ShieldCheck, Wallet, ArrowRight, CheckCircle2, Search, AlertCircle } from 'lucide-react';
import { isAddress } from 'viem';

interface ConnectWalletModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ConnectWalletModal: React.FC<ConnectWalletModalProps> = ({ isOpen, onClose }) => {
  const { connectWallet, inspectAddress, isConnecting, error } = useWallet();
  const [customAddress, setCustomAddress] = useState('');
  const [customAddrError, setCustomAddrError] = useState('');
  const [mode, setMode] = useState<'options' | 'manual'>('options');

  if (!isOpen) return null;

  const handleInjectedConnect = async () => {
    const success = await connectWallet();
    if (success) {
      onClose();
    }
  };

  const handleDemoConnect = async () => {
    await inspectAddress(DEMO_ARC_ADDRESS, true);
    onClose();
  };

  const handleManualInspect = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customAddress.trim()) {
      setCustomAddrError('Please enter an EVM address');
      return;
    }
    if (!isAddress(customAddress.trim())) {
      setCustomAddrError('Invalid address format (must start with 0x and be 42 characters)');
      return;
    }
    setCustomAddrError('');
    await inspectAddress(customAddress.trim(), false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        id="connect-wallet-modal"
        className="w-full max-w-md rounded-2xl bg-[#0d0f12] border border-zinc-800 shadow-2xl overflow-hidden p-6 relative"
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
          aria-label="Close modal"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2.5 py-0.5 rounded-full bg-zinc-900 border border-zinc-700 text-zinc-300 text-[10px] font-mono tracking-wide uppercase font-semibold">
              Non-Custodial
            </span>
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Connect to GEN-0 FI</h2>
          <p className="text-xs text-zinc-400 mt-1">
            Access onchain financial intelligence on <span className="text-white font-medium">Arc Testnet</span>.
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-zinc-900 border border-zinc-700 flex items-start gap-2.5 text-xs text-zinc-300">
            <AlertCircle className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-white">Connection Error</p>
              <p>{error}</p>
            </div>
          </div>
        )}

        {mode === 'options' ? (
          <div className="space-y-3">
            {/* Primary Browser / Injected Wallet */}
            <button
              id="btn-connect-injected-wallet"
              onClick={handleInjectedConnect}
              disabled={isConnecting}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-[#131519] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 transition-all text-left cursor-pointer group shadow-sm"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#08090b] border border-zinc-800 flex items-center justify-center text-white group-hover:scale-105 transition-transform">
                  <Wallet className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white flex items-center gap-1.5">
                    Browser Wallet
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-700 text-zinc-300 font-mono">
                      MetaMask / Rabby
                    </span>
                  </div>
                  <div className="text-xs text-zinc-400">
                    Connect via injected EVM extension
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white group-hover:translate-x-0.5 transition-all" />
            </button>

            {/* Inspect Any Address Mode */}
            <button
              id="btn-open-manual-inspect"
              onClick={() => setMode('manual')}
              className="w-full flex items-center justify-between p-4 rounded-xl bg-[#131519]/70 hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-600 transition-all text-left cursor-pointer group shadow-sm"
            >
              <div className="flex items-center gap-3.5">
                <div className="w-10 h-10 rounded-xl bg-[#08090b] border border-zinc-800 flex items-center justify-center text-zinc-400 group-hover:text-white transition-colors">
                  <Search className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold text-white">Inspect Any Arc Address</div>
                  <div className="text-xs text-zinc-400">
                    Read-only onchain intelligence for any 0x wallet
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-zinc-500 group-hover:text-white transition-all" />
            </button>

            {/* Explore Demo Wallet */}
            <button
              id="btn-connect-demo-wallet"
              onClick={handleDemoConnect}
              className="w-full flex items-center justify-between p-3.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-500 transition-all text-left cursor-pointer group shadow-sm"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-600 flex items-center justify-center text-white">
                  <CheckCircle2 className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-white flex items-center gap-1.5">
                    Explore Demo Wallet
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-white text-black font-mono font-bold">
                      TESTNET DATA
                    </span>
                  </div>
                  <div className="text-[11px] text-zinc-400">
                    Instantly inspect real Arc Testnet activity
                  </div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-white group-hover:translate-x-0.5 transition-transform" />
            </button>
          </div>
        ) : (
          <form onSubmit={handleManualInspect} className="space-y-4">
            <div>
              <label htmlFor="custom-address-input" className="block text-xs font-mono text-zinc-400 mb-1.5">
                EVM Wallet Address
              </label>
              <input
                id="custom-address-input"
                type="text"
                value={customAddress}
                onChange={(e) => {
                  setCustomAddress(e.target.value);
                  setCustomAddrError('');
                }}
                placeholder="0x..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#131519] border border-zinc-800 focus:border-zinc-500 focus:outline-none text-sm text-white font-mono placeholder:text-zinc-500"
                autoFocus
              />
              {customAddrError && (
                <p className="text-xs text-zinc-300 mt-1.5 font-mono">{customAddrError}</p>
              )}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setMode('options')}
                className="flex-1 py-2.5 px-4 rounded-xl bg-[#131519] hover:bg-zinc-800 border border-zinc-800 text-xs font-semibold text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                Back
              </button>
              <button
                type="submit"
                className="flex-1 py-2.5 px-4 rounded-xl bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-colors cursor-pointer shadow-sm"
              >
                Analyze Wallet
              </button>
            </div>
          </form>
        )}

        {/* Security & Non-Custodial Footer */}
        <div className="mt-6 pt-4 border-t border-zinc-900 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-zinc-400" />
            <span>Read-only & Non-custodial</span>
          </div>
          <span className="text-zinc-400 font-medium">Arc Chain ID: 5042002</span>
        </div>
      </div>
    </div>
  );
};
