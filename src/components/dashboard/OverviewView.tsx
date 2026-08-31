import React from 'react';
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

  // Dynamic greeting based on current local time
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  };

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
          <span className="text-[10px] font-mono font-medium text-zinc-500 tracking-wider uppercase">
            {getGreeting()}
          </span>
          <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
            Financial Overview
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <AddressBadge address={address} shortAddress={shortAddress} />
          <NetworkBadge />
        </div>
      </div>

      {/* Main Balance & Key Metrics Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5">
        {/* Main Balance Card (5 cols on lg, 4 cols on xl) */}
        <div className="lg:col-span-5 xl:col-span-4 p-5 sm:p-6 rounded-xl bg-[#0d0f12] border border-zinc-800 flex flex-col justify-between relative overflow-hidden shadow-sm glow-arc-subtle">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
              USDC Balance
            </span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-zinc-900 border border-zinc-700 text-zinc-300">
              Native Gas
            </span>
          </div>

          <div className="my-4">
            {isLoadingData ? (
              <div className="space-y-2">
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
              </div>
            ) : (
              <div>
                <div className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight flex items-baseline gap-2 font-mono">
                  <span>${balanceUSDC}</span>
                  <span className="text-sm font-semibold text-zinc-400">USDC</span>
                </div>
                <div className="text-xs text-zinc-400 mt-1.5 flex items-center gap-1.5 font-mono">
                  <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  <span>Arc Testnet • 18 Decimals</span>
                </div>
              </div>
            )}
          </div>

          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <span className="text-[11px] text-zinc-400">Total Transactions</span>
            <span className="font-mono font-semibold text-white">
              {isLoadingData ? '...' : walletSummary?.txCount || transactions.length}
            </span>
          </div>
        </div>

        {/* Compact Intelligence Summary Metrics (7 cols on lg, 8 cols on xl) */}
        <div className="lg:col-span-7 xl:col-span-8 p-5 sm:p-6 rounded-xl bg-[#0d0f12] border border-zinc-800 flex flex-col justify-between shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 font-medium">
              Onchain Activity Summary
            </span>
            <button
              onClick={() => refreshData()}
              className="text-xs text-zinc-400 hover:text-white flex items-center gap-1 cursor-pointer font-mono"
            >
              <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin text-white' : ''}`} />
              <span>Sync</span>
            </button>
          </div>

          {isLoadingData ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-3">
              {/* Received */}
              <div className="p-3 sm:p-3.5 rounded-lg bg-[#131519] border border-zinc-800/80 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
                  <ArrowDownLeft className="w-3.5 h-3.5 text-white" />
                  <span className="font-medium text-[11px]">Received</span>
                </div>
                <div className="text-sm sm:text-base font-bold text-white font-mono truncate">
                  ${walletSummary?.receivedTotalUSDC || '0.00'}
                </div>
                <div className="text-[10px] text-zinc-500 font-mono mt-0.5">USDC In</div>
              </div>

              {/* Sent */}
              <div className="p-3 sm:p-3.5 rounded-lg bg-[#131519] border border-zinc-800/80 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="font-medium text-[11px]">Sent</span>
                </div>
                <div className="text-sm sm:text-base font-bold text-zinc-200 font-mono truncate">
                  ${walletSummary?.sentTotalUSDC || '0.00'}
                </div>
                <div className="text-[10px] text-zinc-500 font-mono mt-0.5">USDC Out</div>
              </div>

              {/* Gas Spent */}
              <div className="p-3 sm:p-3.5 rounded-lg bg-[#131519] border border-zinc-800/80 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
                  <Flame className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="font-medium text-[11px]">Gas Spent</span>
                </div>
                <div className="text-sm sm:text-base font-bold text-zinc-300 font-mono truncate">
                  ${walletSummary?.gasSpentUSDC || '0.000000'}
                </div>
                <div className="text-[10px] text-zinc-500 font-mono mt-0.5">USDC Gas</div>
              </div>

              {/* Active Contracts */}
              <div className="p-3 sm:p-3.5 rounded-lg bg-[#131519] border border-zinc-800/80 flex flex-col justify-between">
                <div className="flex items-center gap-1.5 text-xs text-zinc-400 mb-1">
                  <Code2 className="w-3.5 h-3.5 text-zinc-400" />
                  <span className="font-medium text-[11px]">Contracts</span>
                </div>
                <div className="text-sm sm:text-base font-bold text-white font-mono truncate">
                  {walletSummary?.activeContractsCount || 0}
                </div>
                <div className="text-[10px] text-zinc-500 font-mono mt-0.5">Interactions</div>
              </div>
            </div>
          )}

          <div className="mt-3 pt-2.5 border-t border-zinc-800/80 flex items-center justify-between text-[11px] text-zinc-500 font-mono">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-white" />
              Verified on Arc RPC
            </span>
            <span className="text-zinc-400">https://rpc.testnet.arc.io</span>
          </div>
        </div>
      </div>

      {/* AI Summary Card */}
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
                `Connected to Arc Testnet with ${balanceUSDC} USDC. ${
                  transactions.length > 0
                    ? `Found ${transactions.length} recent transaction(s).`
                    : 'No outgoing or incoming transactions detected in recent blocks.'
                }`}
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

            <div className="pt-1.5 text-[10px] text-zinc-500 flex items-center justify-between font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-1 h-1 rounded-full bg-white" />
                Grounded on Arc blockchain state
              </span>
              <span className="text-zinc-400 font-medium">Gemini 3.7 Flash</span>
            </div>
          </div>
        )}
      </div>

      {/* Recent Activity Section */}
      <div id="section-recent-activity" className="space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-white" />
            <h2 className="text-sm sm:text-base font-bold text-white tracking-tight">Recent Activity</h2>
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
          <div className="p-6 sm:p-8 rounded-xl bg-[#0d0f12] border border-zinc-800 text-center space-y-1.5">
            <Activity className="w-6 h-6 text-zinc-600 mx-auto" />
            <h3 className="text-xs sm:text-sm font-semibold text-white">No activity yet</h3>
            <p className="text-xs text-zinc-400 max-w-sm mx-auto">
              Transactions performed with this address on Arc Testnet will appear here automatically.
            </p>
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
                        Gas: ${tx.gasCostUSDC}
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
