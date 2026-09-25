import React, { useEffect, useMemo, useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { Skeleton } from '../common/Skeleton';
import { TabType } from '../common/Sidebar';
import { Gen0BoundNFTView } from '../nft/Gen0BoundNFTView';
import { DeployContractView } from '../deploy/DeployContractView';
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
  CalendarClock,
  CircleX,
  ShieldCheck,
  Droplets,
  ExternalLink,
} from 'lucide-react';

interface OverviewViewProps {
  onSelectTab: (tab: TabType) => void;
  onOpenConnect: () => void;
  onOpenWallet: (mode: 'send' | 'receive') => void;
}

type HoldingsTab = 'coins' | 'nfts';

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  compact = false,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string }>;
  compact?: boolean;
}) {
  return (
    <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 glow-blue-card-hover flex flex-col justify-between shadow-sm group">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium group-hover:text-zinc-300 transition-colors">
          {label}
        </span>
        <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 group-hover:border-blue-500/40 group-hover:text-blue-300 flex items-center justify-center text-zinc-400 transition-colors">
          <Icon className="w-4 h-4" />
        </div>
      </div>
      <div className={compact ? 'mt-2 text-base sm:text-lg font-bold text-white truncate' : 'mt-2 text-lg sm:text-xl font-bold text-white font-mono truncate'}>
        {value}
      </div>
      <div className="text-[11px] text-zinc-500 font-mono mt-1 truncate">
        {detail}
      </div>
    </div>
  );
}

export const OverviewView: React.FC<OverviewViewProps> = ({ onSelectTab, onOpenConnect, onOpenWallet }) => {
  const [holdingsTab, setHoldingsTab] = useState<HoldingsTab>('coins');
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

  const walletAgeDisplay = useMemo(() => {
    const firstActivity = walletSummary?.firstActivityTime;
    if (!firstActivity || walletSummary?.historyStatus !== 'complete') return 'Unavailable';

    const ageMs = Math.max(0, Date.now() - firstActivity);
    const ageDays = Math.floor(ageMs / 86_400_000);
    if (ageDays < 1) return 'Less than 1d';
    if (ageDays < 30) return `${ageDays}d`;

    const ageMonths = Math.floor(ageDays / 30.44);
    if (ageMonths < 12) return `${ageMonths}mo`;

    const years = Math.floor(ageMonths / 12);
    const months = ageMonths % 12;
    return months > 0 ? `${years}y ${months}mo` : `${years}y`;
  }, [walletSummary?.firstActivityTime, walletSummary?.historyStatus]);

  const failedTransactionCount = walletSummary?.failedTransactionCount ?? 0;
  const tokenApprovalsCount = walletSummary?.tokenApprovalsCount ?? 0;

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
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">Your Wallet</h1>
            <span className="px-2 py-0.5 rounded-full border border-blue-500/20 bg-blue-500/5 text-[9px] font-mono uppercase tracking-wider text-blue-300/80">Arc Mainnet</span>
          </div>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <a
            href="https://faucet.circle.com/"
            target="_blank"
            rel="noopener noreferrer"
            title="Circle testnet faucet for Arc Testnet"
            className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-400/20 bg-cyan-400/[0.04] px-2.5 py-1.5 text-[10px] font-semibold text-cyan-300 hover:border-cyan-300/40 hover:bg-cyan-400/[0.08] transition-colors"
          >
            <Droplets className="w-3.5 h-3.5" />
            <span>Arc Faucet</span>
            <ExternalLink className="w-3 h-3 opacity-70" />
          </a>
          <button
            type="button"
            onClick={() => onSelectTab('activity')}
            className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/70 px-2.5 py-1.5 text-[10px] font-semibold text-zinc-300 hover:border-blue-500/30 hover:text-white transition-colors"
          >
            <Activity className="w-3.5 h-3.5" />
            Activity
          </button>
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
            <p className="text-xs text-zinc-500 leading-relaxed">Send USDC/EURC directly on Arc or open to receive.</p>
          </div>
          <div className="pt-4 mt-4 border-t border-blue-500/10 flex items-center gap-2">
            <button type="button" onClick={() => onOpenWallet('send')} className="flex-1 py-2 rounded-lg bg-white text-[10px] font-bold text-black hover:bg-zinc-200 transition-colors">Send</button>
            <button type="button" onClick={() => onOpenWallet('receive')} className="flex-1 py-2 rounded-lg border border-blue-400/20 bg-blue-500/10 text-[10px] font-semibold text-blue-300 hover:bg-blue-500/15 transition-colors">Receive</button>
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

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4">
        <MetricCard
          label="Wallet Age"
          value={isLoadingData ? '…' : walletAgeDisplay}
          detail={walletAgeDisplay === 'Unavailable' ? 'Lifetime index unavailable' : 'Since first indexed activity'}
          icon={CalendarClock}
        />
        <MetricCard
          label="Failed Transactions"
          value={isLoadingData ? '…' : String(failedTransactionCount)}
          detail="Reverted lifetime transactions"
          icon={CircleX}
        />
        <MetricCard
          label="Token Approvals"
          value={isLoadingData ? '…' : String(tokenApprovalsCount)}
          detail="Indexed approve / permit calls"
          icon={ShieldCheck}
        />
      </div>


      <section className="rounded-2xl bg-[#0d0f12] border border-zinc-800 overflow-hidden shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 sm:px-5 py-4 border-b border-zinc-900">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-blue-400">Holdings</p>
            <h2 className="mt-1 text-sm font-bold text-white">Assets indexed from Arc Mainnet</h2>
          </div>
          <div className="flex items-center gap-1 rounded-xl bg-zinc-950 border border-zinc-800 p-1">
            <button type="button" onClick={() => setHoldingsTab('coins')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ${holdingsTab === 'coins' ? 'bg-blue-500/15 text-blue-300 border border-blue-400/20' : 'text-zinc-500 hover:text-zinc-200'}`}>
              <Coins className="w-3.5 h-3.5" /> Coins <span className="font-mono">{walletAssets?.coinHoldings ?? '—'}</span>
            </button>
            <button type="button" onClick={() => setHoldingsTab('nfts')} className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[10px] font-semibold transition-colors ${holdingsTab === 'nfts' ? 'bg-violet-500/15 text-violet-300 border border-violet-400/20' : 'text-zinc-500 hover:text-zinc-200'}`}>
              <Gem className="w-3.5 h-3.5" /> NFTs <span className="font-mono">{walletAssets?.nftHoldings ?? '—'}</span>
            </button>
          </div>
        </div>

        {isLoadingData ? (
          <div className="p-5 space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : holdingsTab === 'coins' ? (
          walletAssets?.coins?.length ? (
            <div className="divide-y divide-zinc-900/80">
              {walletAssets.coins.map((coin, index) => (
                <div key={`${coin.address || 'coin'}-${coin.symbol}-${index}`} className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5 hover:bg-blue-500/[0.025] transition-colors">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="w-9 h-9 shrink-0 rounded-xl bg-blue-500/10 border border-blue-400/15 flex items-center justify-center text-blue-300 text-xs font-bold">{coin.symbol.slice(0, 2)}</div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{coin.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">{coin.symbol} · {coin.standard}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-mono font-semibold text-white">{coin.balance}</div>
                    <div className="text-[10px] text-zinc-500">{coin.symbol}</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <Coins className="w-7 h-7 mx-auto text-zinc-700" />
              <p className="mt-3 text-xs font-semibold text-zinc-300">No fungible assets found</p>
              <p className="mt-1 text-[10px] text-zinc-600 font-mono">Arc's indexed token balance is empty for this wallet.</p>
            </div>
          )
        ) : (
          walletAssets?.nfts?.length ? (
            <div className="divide-y divide-zinc-900/80">
              {walletAssets.nfts.map((nft, index) => (
                <div key={`${nft.address || 'nft'}-${nft.symbol}-${index}`} className="flex items-center justify-between gap-4 px-4 sm:px-5 py-3.5 hover:bg-violet-500/[0.025] transition-colors">
                  <div className="min-w-0 flex items-center gap-3">
                    <div className="w-9 h-9 shrink-0 rounded-xl bg-violet-500/10 border border-violet-400/15 flex items-center justify-center text-violet-300"><Gem className="w-4 h-4" /></div>
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-white truncate">{nft.name}</div>
                      <div className="text-[10px] text-zinc-500 font-mono truncate">{nft.symbol} · {nft.standard}</div>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-xs font-mono font-semibold text-white">{nft.balance}</div>
                    <div className="text-[10px] text-zinc-500">items</div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-5 py-10 text-center">
              <Gem className="w-7 h-7 mx-auto text-zinc-700" />
              <p className="mt-3 text-xs font-semibold text-zinc-300">No NFTs found</p>
              <p className="mt-1 text-[10px] text-zinc-600 font-mono">No indexed ERC-721 or ERC-1155 holdings are currently detected.</p>
            </div>
          )
        )}
      </section>

      <section className="space-y-3">
        <div className="flex items-end justify-between gap-3 px-1">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-blue-400">GEN-0 Services</p>
            <h2 className="mt-1 text-sm font-bold text-white">Onchain utilities</h2>
          </div>
          <span className="text-[10px] text-zinc-600 font-mono">Arc Mainnet</span>
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] overflow-hidden glow-blue-card-hover">
            <Gen0BoundNFTView />
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] overflow-hidden glow-blue-card-hover">
            <DeployContractView />
          </div>
        </div>
      </section>

    </div>
  );
};
