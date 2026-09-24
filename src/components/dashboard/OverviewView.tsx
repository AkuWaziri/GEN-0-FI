import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { Skeleton } from '../common/Skeleton';
import { TabType } from '../common/Sidebar';
import { AskGen0View } from '../ask/AskGen0View';
import {
  Code2,
  Flame,
  Activity,
  AlertCircle,
  RefreshCw,
  Coins,
  Gem,
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';

interface OverviewViewProps {
  onSelectTab: (tab: TabType) => void;
  onOpenConnect: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ onSelectTab, onOpenConnect }) => {
  const {
    address,
    isConnected,
    isCorrectNetwork,
    balanceUSDC,
    walletSummary,
    walletAssets,
    transactions,
    isLoadingData,
    isRefreshing,
    refreshData,
    switchToArc,
    isDemoMode,
  } = useWallet();

  // Dynamic greeting and color based on current local time
  const getGreetingInfo = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return { text: 'Good morning', colorClass: 'text-blue-400', dotClass: 'bg-blue-400', glowClass: 'shadow-[0_0_8px_rgba(96,165,250,0.6)]' };
    }
    if (hour >= 12 && hour < 17) {
      return { text: 'Good afternoon', colorClass: 'text-orange-400', dotClass: 'bg-orange-400', glowClass: 'shadow-[0_0_8px_rgba(251,146,60,0.6)]' };
    }
    if (hour >= 17 && hour < 21) {
      return { text: 'Good evening', colorClass: 'text-yellow-400', dotClass: 'bg-yellow-400', glowClass: 'shadow-[0_0_8px_rgba(250,204,21,0.6)]' };
    }
    return { text: 'Good night', colorClass: 'text-purple-400', dotClass: 'bg-purple-400', glowClass: 'shadow-[0_0_8px_rgba(192,132,252,0.6)]' };
  };

  const greeting = getGreetingInfo();

  const activeBalanceUSDC =
    balanceUSDC && balanceUSDC !== '0.00'
      ? balanceUSDC
      : walletSummary?.balanceUSDC && walletSummary.balanceUSDC !== '0.00'
      ? walletSummary.balanceUSDC
      : balanceUSDC || walletSummary?.balanceUSDC || '0.00';

  const { derivedReceived, derivedSent, derivedGasSpent } = useMemo(() => {
    if (!address || !transactions.length) {
      return { derivedReceived: '0.00', derivedSent: '0.00', derivedGasSpent: '0.000000' };
    }
    const norm = address.toLowerCase();
    let rec = 0;
    let sent = 0;
    let gas = 0;
    for (const t of transactions) {
      const val = parseFloat(t.value.replace(/,/g, '')) || 0;
      const from = (t.from || '').toLowerCase();
      const to = (t.to || '').toLowerCase();
      if (to === norm && from !== norm) {
        rec += val;
      } else if (from === norm) {
        sent += val;
        gas += parseFloat(t.gasCostUSDC) || 0;
      }
    }
    return {
      derivedReceived: rec > 0 ? rec.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0.00',
      derivedSent: sent > 0 ? sent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 }) : '0.00',
      derivedGasSpent: gas > 0 ? gas.toFixed(6) : '0.000000',
    };
  }, [address, transactions]);

  const verifiedReceivedDisplay = useMemo(() => {
    const fromSummary = walletSummary?.totalReceivedUSDC || walletSummary?.receivedTotalUSDC;
    if (fromSummary && fromSummary !== '0.00' && fromSummary !== 'Incomplete scan' && fromSummary !== 'Unavailable') return fromSummary;
    if (derivedReceived !== '0.00') return derivedReceived;
    return fromSummary || derivedReceived || '0.00';
  }, [walletSummary, derivedReceived]);

  const verifiedSentDisplay = useMemo(() => {
    const fromSummary = walletSummary?.totalSentUSDC || walletSummary?.sentTotalUSDC;
    if (fromSummary && fromSummary !== '0.00' && fromSummary !== 'Incomplete scan' && fromSummary !== 'Unavailable') return fromSummary;
    if (derivedSent !== '0.00') return derivedSent;
    return fromSummary || derivedSent || '0.00';
  }, [walletSummary, derivedSent]);

  const verifiedGasSpentDisplay = useMemo(() => {
    const fromSummary = walletSummary?.gasSpentUSDC;
    if (fromSummary && fromSummary !== '0.000000') return fromSummary;
    if (derivedGasSpent !== '0.000000') return derivedGasSpent;
    return fromSummary || derivedGasSpent || '0.000000';
  }, [walletSummary, derivedGasSpent]);

  const totalTransactions = Math.max(walletSummary?.txCount ?? 0, transactions.length);
  const contractInteractionsCount =
    walletSummary?.activeContractsCount ??
    transactions.filter((t) => t.isContractInteraction || t.direction === 'contract_interaction').length;

  if (!isConnected || !address) {
    return (
      <div className="p-6 sm:p-10 max-w-4xl mx-auto space-y-6">
        <div className="p-8 rounded-2xl bg-[#0d0f12] border border-zinc-800 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white mx-auto shadow-sm">
            <Coins className="w-6 h-6 text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Connect your wallet to continue</h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">GEN-0 FI reads real onchain activity from Arc to deliver instant financial intelligence.</p>
          <button onClick={onOpenConnect} className="py-2.5 px-6 rounded-xl bg-white hover:bg-zinc-200 text-xs font-bold text-black glow-blue-cta cursor-pointer">Connect Wallet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 animate-in fade-in duration-200">
      {!isCorrectNetwork && !isDemoMode && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-zinc-900 border border-zinc-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-zinc-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-zinc-400 shrink-0" />
            <div>
              <p className="font-semibold text-white text-xs sm:text-sm">Wrong Network Detected</p>
              <p className="text-xs text-zinc-400">GEN-0 FI operates on Arc Mainnet (Chain ID 5042). Please switch network to view live onchain state.</p>
            </div>
          </div>
          <button onClick={() => switchToArc()} className="py-1.5 px-3.5 rounded-lg bg-white hover:bg-zinc-200 text-xs font-semibold text-black whitespace-nowrap cursor-pointer transition-colors shadow">Switch to Arc</button>
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${greeting.dotClass} ${greeting.glowClass}`} />
            <span className={`text-xs font-mono font-semibold tracking-wider uppercase ${greeting.colorClass}`}>{greeting.text}</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Your Wallet</h1>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.55fr)_minmax(280px,0.75fr)] gap-4 sm:gap-5">
        <div className="p-6 sm:p-7 rounded-2xl bg-[#0d0f12] bg-[radial-gradient(ellipse_at_top_left,rgba(34,211,238,0.10),transparent_58%),radial-gradient(ellipse_at_bottom_right,rgba(139,92,246,0.08),transparent_62%)] border border-cyan-400/20 glow-blue-card relative overflow-hidden">
          <div className="absolute -right-12 -top-12 w-72 h-72 bg-blue-500/[0.07] rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 relative z-10">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">Current USDC Balance</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-blue-500/10 border border-blue-500/30 text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.18)]">Native Gas Asset</span>
              </div>
              {isLoadingData ? (
                <div className="py-2 space-y-2"><Skeleton className="h-12 w-64" /><Skeleton className="h-4 w-40" /></div>
              ) : (
                <div>
                  <div className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight flex items-baseline gap-3 font-mono">
                    <span>{activeBalanceUSDC}</span><span className="text-xl sm:text-2xl font-bold text-zinc-400">USDC</span>
                  </div>
                    </div>
              )}
            </div>
            <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2.5 pt-4 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80">
              <button onClick={() => refreshData()} disabled={isRefreshing} className="py-2 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 hover:border-blue-500/40 hover:shadow-[0_0_16px_-3px_rgba(59,130,246,0.22)] text-xs font-semibold text-white flex items-center gap-2 cursor-pointer transition-all shadow-sm disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                <span>{isRefreshing ? 'Syncing...' : 'Sync Live Data'}</span>
              </button>
            </div>
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-blue-500/[0.035] bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.12),transparent_62%),radial-gradient(ellipse_at_bottom_left,rgba(34,211,238,0.07),transparent_68%)] border border-blue-400/20 glow-blue-card-hover relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-blue-400/10 border border-blue-300/25 flex items-center justify-center text-blue-300"><Wallet className="w-3.5 h-3.5" /></div>
              <div><h2 className="text-sm font-bold text-white">Wallet</h2><p className="text-[10px] text-blue-300/75 font-mono">Move funds from your connected wallet</p></div>
            </div>
            <p className="text-xs text-zinc-500 leading-relaxed">Send USDC directly on Arc or open your receive address.</p>
          </div>
          <div className="pt-4 mt-4 border-t border-blue-500/10 flex items-center gap-2">
            <button type="button" onClick={() => onSelectTab('wallet')} className="flex-1 py-2 rounded-lg bg-white text-[10px] font-bold text-black hover:bg-zinc-200 transition-colors">Send</button>
            <button type="button" onClick={() => onSelectTab('wallet')} className="flex-1 py-2 rounded-lg border border-blue-400/20 bg-blue-500/10 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/15 transition-colors">Receive</button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 sm:gap-4">
        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover flex flex-col justify-between shadow-sm group">
          <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium group-hover:text-zinc-300 transition-colors">Total Received</span><div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-700 group-hover:border-blue-500/40 group-hover:text-blue-300 flex items-center justify-center text-white transition-colors"><ArrowDownLeft className="w-4 h-4" /></div></div>
          <div className="mt-2">{isLoadingData ? <Skeleton className="h-7 w-24" /> : (() => { const recVal = verifiedReceivedDisplay; const isNonNumeric = recVal === 'Incomplete scan' || recVal === 'Unavailable'; return <><div className={`font-mono truncate ${isNonNumeric ? 'text-sm sm:text-base font-semibold text-zinc-300' : 'text-lg sm:text-xl font-bold text-white'}`}>{recVal} {!isNonNumeric && <span className="text-xs text-zinc-400 font-sans">USDC</span>}</div><div className="text-[11px] text-zinc-500 font-mono mt-1">{isNonNumeric ? 'Inbound outside scan' : 'Inbound transfers'}</div></>; })()}</div>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover flex flex-col justify-between shadow-sm group">
          <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium group-hover:text-zinc-300 transition-colors">Total Sent</span><div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-blue-500/40 group-hover:text-blue-300 flex items-center justify-center text-zinc-400 transition-colors"><ArrowUpRight className="w-4 h-4" /></div></div>
          <div className="mt-2">{isLoadingData ? <Skeleton className="h-7 w-24" /> : (() => { const sentVal = verifiedSentDisplay; const isNonNumeric = sentVal === 'Incomplete scan' || sentVal === 'Unavailable'; return <><div className={`font-mono truncate ${isNonNumeric ? 'text-sm sm:text-base font-semibold text-zinc-400' : 'text-lg sm:text-xl font-bold text-zinc-200'}`}>{sentVal} {!isNonNumeric && <span className="text-xs text-zinc-400 font-sans">USDC</span>}</div><div className="text-[11px] text-zinc-500 font-mono mt-1">Outbound transfers</div></>; })()}</div>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover flex flex-col justify-between shadow-sm group">
          <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium group-hover:text-zinc-300 transition-colors">Total Gas Spent</span><div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-blue-500/40 group-hover:text-blue-300 flex items-center justify-center text-zinc-400 transition-colors"><Flame className="w-4 h-4" /></div></div>
          <div className="mt-2">{isLoadingData ? <Skeleton className="h-7 w-24" /> : <div className="text-lg sm:text-xl font-bold text-zinc-300 font-mono truncate">{verifiedGasSpentDisplay} <span className="text-xs text-zinc-400 font-sans">USDC</span></div>}<div className="text-[11px] text-zinc-500 font-mono mt-1">Arc execution fees</div></div>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover flex flex-col justify-between shadow-sm group">
          <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium group-hover:text-zinc-300 transition-colors">Total Transactions</span><div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-blue-500/40 group-hover:text-blue-300 flex items-center justify-center text-zinc-400 transition-colors"><Activity className="w-4 h-4" /></div></div>
          <div className="mt-2">{isLoadingData ? <Skeleton className="h-7 w-16" /> : <div className="text-lg sm:text-xl font-bold text-white font-mono">{totalTransactions}</div>}<div className="text-[11px] text-zinc-500 font-mono mt-1">Confirmed on Arc</div></div>
        </div>

        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover flex flex-col justify-between shadow-sm group">
          <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium group-hover:text-zinc-300 transition-colors">Contract Interactions</span><div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-blue-500/40 group-hover:text-blue-300 flex items-center justify-center text-zinc-400 transition-colors"><Code2 className="w-4 h-4" /></div></div>
          <div className="mt-2">{isLoadingData ? <Skeleton className="h-7 w-16" /> : <div className="text-lg sm:text-xl font-bold text-white font-mono">{contractInteractionsCount}</div>}<div className="text-[11px] text-zinc-500 font-mono mt-1">Smart contracts</div></div>
        </div>
      </div>


      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">Coins</span>
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400"><Coins className="w-4 h-4" /></div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-mono">
            {isLoadingData ? <Skeleton className="h-7 w-16" /> : walletAssets?.coinHoldings ?? '—'}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono mt-1">Fungible token holdings</div>
        </div>
        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400">NFTs</span>
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400"><Gem className="w-4 h-4" /></div>
          </div>
          <div className="text-lg sm:text-xl font-bold text-white font-mono">
            {isLoadingData ? <Skeleton className="h-7 w-16" /> : walletAssets?.nftHoldings ?? '—'}
          </div>
          <div className="text-[11px] text-zinc-500 font-mono mt-1">Indexed NFT holdings</div>
        </div>
      </div>

      <div className="rounded-2xl border border-violet-400/15 bg-[radial-gradient(ellipse_at_top_right,rgba(139,92,246,0.08),transparent_58%),radial-gradient(ellipse_at_bottom_left,rgba(34,211,238,0.05),transparent_65%)] p-4 sm:p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wider text-violet-300/80">Onchain Intelligence</div>
            <h2 className="text-base sm:text-lg font-bold text-white tracking-tight mt-0.5">GEN-0 AI</h2>
            <p className="text-xs text-zinc-500 mt-1">Ask about your wallet, Arc, transactions, fees, holdings, or GEN-0FI.</p>
          </div>
          <div className="hidden sm:flex w-9 h-9 rounded-xl bg-violet-400/10 border border-violet-300/20 items-center justify-center text-violet-300 shadow-[0_0_18px_rgba(139,92,246,0.16)]">
            <span className="text-sm font-bold">✦</span>
          </div>
        </div>
        <AskGen0View embedded />
      </div>\n\n






    </div>
  );
};
