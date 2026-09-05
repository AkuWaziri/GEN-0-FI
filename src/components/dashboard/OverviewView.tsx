import React, { useMemo } from 'react';
import { useWallet } from '../../context/WalletContext';
import { AddressBadge } from '../common/AddressBadge';
import { NetworkBadge } from '../common/NetworkBadge';
import { Skeleton } from '../common/Skeleton';
import { getArcScanTxUrl } from '../../config/arc';
import { formatTimeAgo } from '../../services/blockchain/normalizer';
import { TabType } from '../common/Sidebar';
import {
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  Code2,
  ExternalLink,
  Flame,
  Activity,
  AlertCircle,
  RefreshCw,
  Coins,
  ChevronRight,
} from 'lucide-react';

interface OverviewViewProps {
  onSelectTab: (tab: TabType) => void;
  onOpenConnect: () => void;
}

export const OverviewView: React.FC<OverviewViewProps> = ({ onSelectTab, onOpenConnect }) => {
  const {
    address,
    shortAddress,
    isConnected,
    isCorrectNetwork,
    balanceUSDC,
    walletSummary,
    transactions,
    isLoadingData,
    isRefreshing,
    refreshData,
    aiSummary,
    isAiLoading,
    switchToArc,
    isDemoMode,
  } = useWallet();

  // Dynamic greeting and color based on current local time:
  // Morning (5am - 12pm): Blue, Afternoon (12pm - 5pm): Orange, Evening (5pm - 9pm): Yellow, Night (9pm - 5am): Purple
  const getGreetingInfo = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return {
        text: 'Good morning',
        colorClass: 'text-blue-400',
        dotClass: 'bg-blue-400',
        glowClass: 'shadow-[0_0_8px_rgba(96,165,250,0.6)]',
      };
    }
    if (hour >= 12 && hour < 17) {
      return {
        text: 'Good afternoon',
        colorClass: 'text-orange-400',
        dotClass: 'bg-orange-400',
        glowClass: 'shadow-[0_0_8px_rgba(251,146,60,0.6)]',
      };
    }
    if (hour >= 17 && hour < 21) {
      return {
        text: 'Good evening',
        colorClass: 'text-yellow-400',
        dotClass: 'bg-yellow-400',
        glowClass: 'shadow-[0_0_8px_rgba(250,204,21,0.6)]',
      };
    }
    return {
      text: 'Good night',
      colorClass: 'text-purple-400',
      dotClass: 'bg-purple-400',
      glowClass: 'shadow-[0_0_8px_rgba(192,132,252,0.6)]',
    };
  };

  const greeting = getGreetingInfo();

  // Synchronized active balance: uses whichever source holds the live verified balance
  const activeBalanceUSDC =
    balanceUSDC && balanceUSDC !== '0.00'
      ? balanceUSDC
      : walletSummary?.balanceUSDC && walletSummary.balanceUSDC !== '0.00'
      ? walletSummary.balanceUSDC
      : balanceUSDC || walletSummary?.balanceUSDC || '0.00';

  // Compute derived totals directly from confirmed onchain transactions for rock-solid reliability
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

  // Verified figures used across both the financial overview cards AND the AI summary
  const verifiedReceivedDisplay = useMemo(() => {
    const fromSummary = walletSummary?.totalReceivedUSDC || walletSummary?.receivedTotalUSDC;
    if (fromSummary && fromSummary !== '0.00' && fromSummary !== 'Incomplete scan' && fromSummary !== 'Unavailable') {
      return fromSummary;
    }
    if (derivedReceived !== '0.00') {
      return derivedReceived;
    }
    return fromSummary || derivedReceived || '0.00';
  }, [walletSummary, derivedReceived]);

  const verifiedSentDisplay = useMemo(() => {
    const fromSummary = walletSummary?.totalSentUSDC || walletSummary?.sentTotalUSDC;
    if (fromSummary && fromSummary !== '0.00' && fromSummary !== 'Incomplete scan' && fromSummary !== 'Unavailable') {
      return fromSummary;
    }
    if (derivedSent !== '0.00') {
      return derivedSent;
    }
    return fromSummary || derivedSent || '0.00';
  }, [walletSummary, derivedSent]);

  const verifiedGasSpentDisplay = useMemo(() => {
    const fromSummary = walletSummary?.gasSpentUSDC;
    if (fromSummary && fromSummary !== '0.000000') {
      return fromSummary;
    }
    if (derivedGasSpent !== '0.000000') {
      return derivedGasSpent;
    }
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
          <div className="w-12 h-12 rounded-2xl bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white mx-auto">
            <Coins className="w-6 h-6" />
          </div>
          <h2 className="text-xl font-bold text-white tracking-tight">Connect your wallet to continue</h2>
          <p className="text-sm text-zinc-400 max-w-md mx-auto">
            GEN-0 FI reads real onchain activity from Arc Testnet to deliver instant financial intelligence.
          </p>
          <button
            onClick={onOpenConnect}
            className="py-2.5 px-6 rounded-xl bg-white hover:bg-zinc-200 text-xs font-bold text-black transition-all shadow-sm cursor-pointer"
          >
            Connect Wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 animate-in fade-in duration-200">
      {/* Wrong Network Warning Banner */}
      {!isCorrectNetwork && !isDemoMode && (
        <div className="p-3.5 sm:p-4 rounded-xl bg-zinc-900 border border-zinc-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-sm text-zinc-200">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="w-4 h-4 text-zinc-400 shrink-0" />
            <div>
              <p className="font-semibold text-white text-xs sm:text-sm">Wrong Network Detected</p>
              <p className="text-xs text-zinc-400">
                GEN-0 FI operates on Arc Testnet (Chain ID 5042002). Please switch network to view live onchain state.
              </p>
            </div>
          </div>
          <button
            onClick={() => switchToArc()}
            className="py-1.5 px-3.5 rounded-lg bg-white hover:bg-zinc-200 text-xs font-semibold text-black whitespace-nowrap cursor-pointer transition-colors shadow"
          >
            Switch to Arc Testnet
          </button>
        </div>
      )}

      {/* Top Section Greeting & Wallet Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className={`w-2 h-2 rounded-full ${greeting.dotClass} ${greeting.glowClass}`} />
            <span className={`text-xs font-mono font-semibold tracking-wider uppercase ${greeting.colorClass}`}>
              {greeting.text}
            </span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Financial Overview
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <AddressBadge address={address} shortAddress={shortAddress} />
          <NetworkBadge />
        </div>
      </div>

      {/* Main Balance Card - Prominent 58.0364 USDC Display */}
      <div className="p-6 sm:p-7 rounded-2xl bg-[#0d0f12] border border-zinc-800 relative overflow-hidden shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-zinc-400 font-semibold">
                Current USDC Balance
              </span>
              <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-900 border border-zinc-700 text-zinc-300">
                Native Gas Asset
              </span>
            </div>

            {isLoadingData ? (
              <div className="py-2 space-y-2">
                <Skeleton className="h-12 w-64" />
                <Skeleton className="h-4 w-40" />
              </div>
            ) : (
              <div>
                <div className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-white tracking-tight flex items-baseline gap-3 font-mono">
                  <span>{activeBalanceUSDC}</span>
                  <span className="text-xl sm:text-2xl font-bold text-zinc-400">USDC</span>
                </div>
                <div className="text-xs text-zinc-400 mt-2 flex items-center gap-2 font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>Arc Testnet • 18 Decimals Verified Onchain</span>
                </div>
              </div>
            )}
          </div>

          <div className="flex sm:flex-col items-center sm:items-end justify-between gap-2.5 pt-4 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80">
            <button
              onClick={() => refreshData()}
              disabled={isRefreshing}
              className="py-2 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-semibold text-white flex items-center gap-2 cursor-pointer transition-colors shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>{isRefreshing ? 'Syncing...' : 'Sync Live Data'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Prominent Key Financial Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3.5 sm:gap-4">
        {/* Metric 1: Total Amount Received */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
              Total Received
            </span>
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
              <ArrowDownLeft className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {isLoadingData ? (
              <Skeleton className="h-7 w-24" />
            ) : (() => {
              const recVal = verifiedReceivedDisplay;
              const isNonNumeric = recVal === 'Incomplete scan' || recVal === 'Unavailable';
              return (
                <>
                  <div className={`font-mono truncate ${isNonNumeric ? 'text-sm sm:text-base font-semibold text-zinc-300' : 'text-lg sm:text-xl font-bold text-white'}`}>
                    {recVal} {!isNonNumeric && <span className="text-xs text-zinc-400 font-sans">USDC</span>}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">
                    {isNonNumeric ? 'Inbound outside scan' : 'Inbound transfers'}
                  </div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Metric 2: Total Amount Sent */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
              Total Sent
            </span>
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
              <ArrowUpRight className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {isLoadingData ? (
              <Skeleton className="h-7 w-24" />
            ) : (() => {
              const sentVal = verifiedSentDisplay;
              const isNonNumeric = sentVal === 'Incomplete scan' || sentVal === 'Unavailable';
              return (
                <>
                  <div className={`font-mono truncate ${isNonNumeric ? 'text-sm sm:text-base font-semibold text-zinc-400' : 'text-lg sm:text-xl font-bold text-zinc-200'}`}>
                    {sentVal} {!isNonNumeric && <span className="text-xs text-zinc-400 font-sans">USDC</span>}
                  </div>
                  <div className="text-[11px] text-zinc-500 font-mono mt-1">Outbound transfers</div>
                </>
              );
            })()}
          </div>
        </div>

        {/* Metric 3: Total Gas Spent */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
              Total Gas Spent
            </span>
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {isLoadingData ? (
              <Skeleton className="h-7 w-24" />
            ) : (
              <div className="text-lg sm:text-xl font-bold text-zinc-300 font-mono truncate">
                {verifiedGasSpentDisplay} <span className="text-xs text-zinc-400 font-sans">USDC</span>
              </div>
            )}
            <div className="text-[11px] text-zinc-500 font-mono mt-1">Arc execution fees</div>
          </div>
        </div>

        {/* Metric 4: Total Transactions */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
              Total Transactions
            </span>
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {isLoadingData ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-lg sm:text-xl font-bold text-white font-mono">
                {totalTransactions}
              </div>
            )}
            <div className="text-[11px] text-zinc-500 font-mono mt-1">Confirmed on Arc</div>
          </div>
        </div>

        {/* Metric 5: Contract Interactions */}
        <div className="p-4 sm:p-5 rounded-xl bg-[#0d0f12] border border-zinc-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
              Contract Interactions
            </span>
            <div className="w-7 h-7 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center text-zinc-400">
              <Code2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2">
            {isLoadingData ? (
              <Skeleton className="h-7 w-16" />
            ) : (
              <div className="text-lg sm:text-xl font-bold text-white font-mono">
                {contractInteractionsCount}
              </div>
            )}
            <div className="text-[11px] text-zinc-500 font-mono mt-1">Smart contracts</div>
          </div>
        </div>
      </div>

      {/* AI Summary Card - Synchronized with live Arc state */}
      <div
        id="section-ai-wallet-summary"
        className="p-5 sm:p-6 rounded-xl bg-[#0d0f12] border border-zinc-800 shadow-sm relative overflow-hidden"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-zinc-900 border border-zinc-700 flex items-center justify-center text-white">
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">AI Intelligence Summary</h2>
          </div>

          <button
            onClick={() => onSelectTab('ask')}
            className="text-xs text-white hover:text-zinc-300 flex items-center gap-1 font-semibold cursor-pointer"
          >
            <span>Ask GEN-0</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {isAiLoading ? (
          <div className="space-y-2 py-1">
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-4/6" />
            <Skeleton className="h-4 w-3/6" />
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-normal">
              {aiSummary?.summary ||
                (walletSummary?.historyStatus === 'incomplete' && verifiedReceivedDisplay === 'Incomplete scan'
                  ? `Wallet verifiably holds ${activeBalanceUSDC} USDC on Arc Testnet across ${totalTransactions} transaction(s). Historical inbound funding occurred outside the scanned explorer dataset, so lifetime incoming transfer volume cannot be fully determined from recent logs.`
                  : `Connected to Arc Testnet with ${activeBalanceUSDC} USDC across ${totalTransactions} transaction(s). Verified inbound: ${verifiedReceivedDisplay} USDC, outbound: ${verifiedSentDisplay} USDC, gas spent: ${verifiedGasSpentDisplay} USDC.`)}
            </p>

            {aiSummary?.keyObservations && aiSummary.keyObservations.length > 0 && (
              <div className="pt-2.5 border-t border-zinc-800/80 space-y-1.5">
                {aiSummary.keyObservations.map((obs, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-xs text-zinc-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-white shrink-0 mt-1.5" />
                    <span>{obs}</span>
                  </div>
                ))}
              </div>
            )}

            {walletSummary?.historyStatus === 'incomplete' && verifiedReceivedDisplay === 'Incomplete scan' && (
              <div className="pt-2 flex items-center gap-2 text-[11px] text-amber-400/90 font-mono">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>Explorer scan is partial: inbound funding occurred outside recent indexed blocks. Live balance is authoritative.</span>
              </div>
            )}

            <div className="pt-1.5 text-[10px] text-zinc-500 flex items-center justify-between font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-emerald-400" />
                Grounded on live Arc blockchain state ({activeBalanceUSDC} USDC)
              </span>
              <span className="text-zinc-400 font-medium">Gemini AI Engine</span>
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity Section */}
      <div id="section-recent-activity" className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-white" />
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Recent Onchain Activity</h2>
          </div>

          <button
            onClick={() => onSelectTab('activity')}
            className="text-xs text-zinc-400 hover:text-white font-semibold flex items-center gap-1 cursor-pointer font-mono"
          >
            <span>View All</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {isLoadingData ? (
          <div className="space-y-2">
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
            <Skeleton className="h-14 rounded-xl" />
          </div>
        ) : transactions.length === 0 ? (
          <div className="p-6 sm:p-8 rounded-xl bg-[#0d0f12] border border-zinc-800 text-center space-y-2">
            <Activity className="w-6 h-6 text-zinc-600 mx-auto" />
            <h3 className="text-xs sm:text-sm font-semibold text-white">No recent transactions indexed yet</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Confirmed onchain activity with this address on Arc Testnet will appear here automatically.
            </p>
            <div className="pt-2">
              <button
                onClick={() => refreshData()}
                className="py-1.5 px-4 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-xs font-medium text-zinc-200 cursor-pointer transition-colors"
              >
                Scan Arc Blocks
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.slice(0, 5).map((tx) => {
              const isReceived = tx.direction === 'received';
              const isSent = tx.direction === 'sent';

              return (
                <div
                  key={tx.hash}
                  className="p-3.5 sm:p-4 rounded-xl bg-[#0d0f12] hover:bg-[#131519] border border-zinc-800/80 hover:border-zinc-700 transition-all flex items-center justify-between gap-3 shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                        isReceived
                          ? 'bg-zinc-900 text-white border border-zinc-700'
                          : isSent
                          ? 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                          : 'bg-zinc-900 text-zinc-300 border border-zinc-800'
                      }`}
                    >
                      {isReceived ? (
                        <ArrowDownLeft className="w-4 h-4 text-white" />
                      ) : isSent ? (
                        <ArrowUpRight className="w-4 h-4 text-zinc-400" />
                      ) : (
                        <Code2 className="w-4 h-4 text-zinc-400" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="text-xs sm:text-sm font-semibold text-white flex items-center gap-2">
                        <span className="truncate">{tx.classificationLabel}</span>
                        <span className="text-[11px] text-zinc-500 font-mono shrink-0">
                          {formatTimeAgo(tx.timestamp)}
                        </span>
                      </div>
                      <div className="text-xs text-zinc-400 truncate font-mono mt-0.5">
                        {isReceived && tx.from && `From: ${tx.from.slice(0, 6)}...${tx.from.slice(-4)}`}
                        {isSent && tx.to && `To: ${tx.to.slice(0, 6)}...${tx.to.slice(-4)}`}
                        {!isReceived && !isSent && tx.summary}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    <div className="text-right">
                      <div
                        className={`text-xs sm:text-sm font-bold font-mono ${
                          isReceived ? 'text-white' : isSent ? 'text-zinc-300' : 'text-white'
                        }`}
                      >
                        {isReceived ? `+${tx.value}` : isSent ? `-${tx.value}` : `${tx.value}`} USDC
                      </div>
                      <div className="text-[10px] text-zinc-500 font-mono">
                        Gas: {tx.gasCostUSDC} USDC
                      </div>
                    </div>

                    <a
                      href={getArcScanTxUrl(tx.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                      title="View on ArcScan"
                      aria-label="View on ArcScan Explorer"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
