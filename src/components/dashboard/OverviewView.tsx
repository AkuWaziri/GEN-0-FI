import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { Skeleton } from '../common/Skeleton';
import { TabType } from '../common/Sidebar';
import { AskGen0View } from '../ask/AskGen0View';
import {
  Sparkles,
  Code2,
  Flame,
  Activity,
  AlertCircle,
  RefreshCw,
  Coins,
  Gem,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react';
import { getGMStats, GMStats } from '../../services/gm/gmService';

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
    aiSummary,
    isAiLoading,
    switchToArc,
    isDemoMode,
  } = useWallet();

  const [gmStats, setGmStats] = useState<GMStats | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setGmStats(null);
      return;
    }

    getGMStats(address)
      .then((nextStats) => {
        if (!cancelled) setGmStats(nextStats);
      })
      .catch(() => {
        if (!cancelled) setGmStats(null);
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

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
        <div className="p-6 sm:p-7 rounded-2xl bg-[#0d0f12] bg-[radial-gradient(ellipse_at_top_left,rgba(59,130,246,0.08),transparent_65%)] border border-blue-500/20 glow-blue-card relative overflow-hidden">
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
                  <div className="text-xs text-zinc-400 mt-2 flex items-center gap-2 font-mono"><span className="w-2 h-2 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse" /><span>Arc • 18 Decimals Verified Onchain</span></div>
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

        <div id="section-ai-wallet-summary" className="p-5 rounded-2xl bg-[#0d0f12] bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.07),transparent_72%)] border border-blue-500/20 glow-blue-card relative overflow-hidden flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-lg bg-blue-500/15 border border-blue-500/35 flex items-center justify-center text-blue-400"><Sparkles className="w-3.5 h-3.5" /></div>
              <div><h2 className="text-sm font-bold text-white">AI Intelligence</h2><p className="text-[10px] text-zinc-500 font-mono">Live wallet context</p></div>
            </div>
            {isAiLoading ? (
              <div className="space-y-2 py-2"><Skeleton className="h-3.5 w-full" /><Skeleton className="h-3.5 w-5/6" /><Skeleton className="h-3.5 w-4/6" /></div>
            ) : (
              <p className="text-xs text-zinc-300 leading-relaxed">
                {(aiSummary?.summary ||
                  (walletSummary?.historyStatus === 'incomplete' && verifiedReceivedDisplay === 'Incomplete scan'
                    ? `Wallet verifiably holds ${activeBalanceUSDC} USDC on Arc across ${totalTransactions} transaction(s). Historical inbound funding is outside the recent indexed dataset.`
                    : `Connected to Arc with ${activeBalanceUSDC} USDC across ${totalTransactions} transaction(s). Received ${verifiedReceivedDisplay} USDC, sent ${verifiedSentDisplay} USDC, gas ${verifiedGasSpentDisplay} USDC.`)).replace(/\*/g, '')}
              </p>
            )}
          </div>
          <div className="pt-4 mt-4 border-t border-zinc-800/80 flex items-center justify-between gap-2"><span className="text-[10px] text-zinc-500 font-mono">Grounded on live Arc state</span><span className="text-[10px] text-zinc-400 font-semibold">Gemini AI</span></div>
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

      <div>
        <div className="flex items-center justify-between mb-3 px-1">
          <div>
            <h2 className="text-sm font-bold text-white uppercase tracking-wider">Your Wallet</h2>
            <p className="text-[11px] text-zinc-500 mt-0.5">Holdings and daily activity</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5 sm:gap-4">
          <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover flex flex-col justify-between shadow-sm group">
            <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium group-hover:text-zinc-300 transition-colors">Coins</span><div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-blue-500/40 group-hover:text-blue-300 flex items-center justify-center text-zinc-400 transition-colors"><Coins className="w-4 h-4" /></div></div>
            <div className="mt-2">{isLoadingData ? <Skeleton className="h-7 w-16" /> : <div className="text-lg sm:text-xl font-bold text-white font-mono">{walletAssets?.coinHoldings ?? '—'}</div>}<div className="text-[11px] text-zinc-500 font-mono mt-1">Fungible token holdings</div></div>
          </div>

          <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover flex flex-col justify-between shadow-sm group">
            <div className="flex items-center justify-between mb-2"><span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium group-hover:text-zinc-300 transition-colors">NFTs</span><div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-blue-500/40 group-hover:text-blue-300 flex items-center justify-center text-zinc-400 transition-colors"><Gem className="w-4 h-4" /></div></div>
            <div className="mt-2">{isLoadingData ? <Skeleton className="h-7 w-16" /> : <div className="text-lg sm:text-xl font-bold text-white font-mono">{walletAssets?.nftHoldings ?? '—'}</div>}<div className="text-[11px] text-zinc-500 font-mono mt-1">Indexed NFT holdings</div></div>
          </div>

          <button type="button" id="dashboard-gm-streak" onClick={() => onSelectTab('gm')} className="text-left p-4 sm:p-5 rounded-xl bg-blue-500/[0.06] bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.13),transparent_72%)] border border-blue-500/25 glow-blue-card-hover transition-all group cursor-pointer">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-400/25 flex items-center justify-center shrink-0"><Flame className="w-4 h-4 text-blue-300" /></div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><h3 className="text-sm font-bold text-white">GM Streak</h3><span className="text-[9px] font-mono uppercase tracking-wider text-blue-300/80">Daily</span></div>
                  <p className="text-[10px] text-zinc-500 mt-0.5 truncate">{gmStats?.checkedInToday ? 'Checked in today' : 'Check in today'}</p>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-blue-300 shrink-0">Open →</span>
            </div>
            <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-blue-500/10">
              <div><div className="text-base font-bold text-white font-mono">{gmStats?.currentStreak ?? 0}</div><div className="text-[9px] text-zinc-500">Streak</div></div>
              <div><div className="text-base font-bold text-white font-mono">{gmStats?.totalGmDays ?? 0}</div><div className="text-[9px] text-zinc-500">Days</div></div>
              <div><div className="text-base font-bold text-white font-mono">{gmStats?.points ?? 0}</div><div className="text-[9px] text-zinc-500">Points</div></div>
            </div>
          </button>
        </div>
      </div>

      <section id="section-ask-gen0" className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <div><h2 className="text-base sm:text-lg font-bold text-white tracking-tight">Ask GEN-0</h2><p className="text-xs text-zinc-500">Ask about your live wallet and onchain activity.</p></div>
        </div>
        <AskGen0View />
      </section>
    </div>
  );
};
