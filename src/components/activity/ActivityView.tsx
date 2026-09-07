import React, { useState } from 'react';
import { useWallet } from '../../context/WalletContext';
import { Skeleton } from '../common/Skeleton';
import { getArcScanTxUrl, formatShortAddress, formatShortHash } from '../../config/arc';
import { formatTimeAgo } from '../../services/blockchain/normalizer';
import {
  History,
  ArrowDownLeft,
  ArrowUpRight,
  Code2,
  ExternalLink,
  Search,
  RefreshCw,
  Copy,
  Check,
} from 'lucide-react';

export const ActivityView: React.FC = () => {
  const { transactions, isLoadingData, isRefreshing, refreshData } = useWallet();
  const [filter, setFilter] = useState<'all' | 'received' | 'sent' | 'contracts'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedHash, setCopiedHash] = useState<string | null>(null);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  // Filter logic
  const filteredTransactions = transactions.filter((tx) => {
    // Tab filter
    if (filter === 'received' && tx.direction !== 'received') return false;
    if (filter === 'sent' && tx.direction !== 'sent') return false;
    if (filter === 'contracts' && !tx.isContractInteraction && tx.classification !== 'contract_interaction') return false;

    // Search query
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchHash = tx.hash.toLowerCase().includes(q);
      const matchFrom = tx.from?.toLowerCase().includes(q);
      const matchTo = tx.to?.toLowerCase().includes(q);
      const matchSummary = tx.summary.toLowerCase().includes(q);
      return matchHash || matchFrom || matchTo || matchSummary;
    }

    return true;
  });

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-5 sm:space-y-6 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-1 border-b border-zinc-900">
        <div>
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-white" />
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Activity
            </h1>
          </div>
          <p className="text-xs text-zinc-400 mt-0.5">
            Verified onchain transaction history on Arc.
          </p>
        </div>

        <button
          onClick={() => refreshData()}
          disabled={isRefreshing}
          className="self-start sm:self-auto flex items-center gap-1.5 py-1.5 px-3 rounded-lg bg-[#111317] hover:bg-zinc-800 border border-zinc-800 hover:border-blue-500/35 hover:shadow-[0_0_12px_rgba(59,130,246,0.18)] text-xs font-semibold text-zinc-300 hover:text-white transition-all cursor-pointer font-mono"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-white' : ''}`} />
          <span>Sync</span>
        </button>
      </div>

      {/* Filter Bar & Search */}
      <div className="p-3 sm:p-4 rounded-xl bg-[#0d0f12] border border-zinc-800 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-sm">
        {/* Filter Pills */}
        <div
          role="tablist"
          aria-label="Activity filter tabs"
          className="flex items-center gap-1.5 p-1 bg-[#131519] rounded-xl border border-zinc-800 self-start md:self-auto overflow-x-auto max-w-full"
        >
          {[
            { id: 'all', label: 'All' },
            { id: 'received', label: 'Received' },
            { id: 'sent', label: 'Sent' },
            { id: 'contracts', label: 'Contracts' },
          ].map((tab) => {
            const isTabActive = filter === tab.id;

            return (
              <button
                key={tab.id}
                id={`activity-filter-${tab.id}`}
                role="tab"
                aria-selected={isTabActive}
                onClick={() => setFilter(tab.id as any)}
                className={`relative px-3.5 py-1.5 rounded-lg text-xs transition-all duration-200 ease-out cursor-pointer whitespace-nowrap select-none ${
                  isTabActive
                    ? 'text-white font-semibold bg-blue-500/[0.08] border border-blue-500/25 shadow-[0_0_14px_rgba(59,130,246,0.12)]'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50 border border-transparent font-medium'
                }`}
              >
                <span>{tab.label}</span>

                {/* Thin blue indicator beneath active tab */}
                {isTabActive && (
                  <span
                    className="absolute bottom-0 left-2.5 right-2.5 h-[2px] bg-blue-500 rounded-full shadow-[0_0_6px_rgba(59,130,246,0.6)]"
                    aria-hidden="true"
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-80 lg:w-96">
          <Search className="w-3.5 h-3.5 text-zinc-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search hash, address, memo..."
            className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-[#131519] border border-zinc-800 focus:border-blue-500/50 glow-blue-focus focus:outline-none text-xs text-white placeholder:text-zinc-500 font-mono transition-all"
          />
        </div>
      </div>

      {/* Timeline List */}
      {isLoadingData ? (
        <div className="space-y-2">
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : filteredTransactions.length === 0 ? (
        <div className="p-8 sm:p-12 rounded-xl bg-[#0d0f12] border border-zinc-800 text-center space-y-2">
          <History className="w-8 h-8 text-zinc-600 mx-auto" />
          <h3 className="text-sm font-semibold text-white">No transactions found</h3>
          <p className="text-xs text-zinc-400 max-w-md mx-auto">
            {searchQuery
              ? `No transactions match "${searchQuery}". Try adjusting your search or filters.`
              : `No activity recorded for this filter category on Arc.`}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filteredTransactions.map((tx) => {
            const isReceived = tx.direction === 'received';
            const isSent = tx.direction === 'sent';

            return (
              <div
                key={tx.hash}
                id={`tx-row-${tx.hash.slice(0, 10)}`}
                className="p-3.5 sm:p-4 rounded-xl bg-[#0d0f12] hover:bg-[#131519] border border-zinc-800/80 hover:border-blue-500/30 hover:shadow-[0_0_18px_-4px_rgba(59,130,246,0.16)] transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm group"
              >
                {/* Left side: Type, Status, Counterparty, Summary */}
                <div className="flex items-start sm:items-center gap-3 min-w-0">
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 ${
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

                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs sm:text-sm font-semibold text-white tracking-tight">
                        {tx.classificationLabel}
                      </span>
                      <span className="text-[11px] text-zinc-500 font-mono">
                        {formatTimeAgo(tx.timestamp)}
                      </span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded bg-zinc-900 border border-zinc-800 text-zinc-400 font-mono">
                        Block #{tx.blockNumber}
                      </span>
                    </div>

                    <div className="text-xs text-zinc-400 flex items-center gap-2 flex-wrap font-mono">
                      <span>Hash: {formatShortHash(tx.hash)}</span>
                      <button
                        onClick={() => handleCopyHash(tx.hash)}
                        className="text-zinc-500 hover:text-white transition-colors cursor-pointer"
                        title="Copy transaction hash"
                        aria-label="Copy transaction hash"
                      >
                        {copiedHash === tx.hash ? (
                          <Check className="w-3 h-3 text-white" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </button>

                      {tx.from && (
                        <span>• From: {formatShortAddress(tx.from)}</span>
                      )}
                      {tx.to && (
                        <span>• To: {formatShortAddress(tx.to)}</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right side: Value, Gas, Status, Explorer link */}
                <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-800/80">
                  <div className="text-left sm:text-right">
                    <div
                      className={`text-xs sm:text-sm font-bold font-mono ${
                        isReceived
                          ? 'text-white'
                          : isSent
                          ? 'text-zinc-300'
                          : 'text-white'
                      }`}
                    >
                      {isReceived ? `+${tx.value}` : isSent ? `-${tx.value}` : `${tx.value}`} USDC
                    </div>
                    <div className="text-[10px] text-zinc-500 font-mono">
                      Gas: {tx.gasCostUSDC} USDC
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <a
                      href={getArcScanTxUrl(tx.hash)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 py-1 px-2.5 rounded-lg bg-[#131519] hover:bg-zinc-800 border border-zinc-800 text-xs font-mono text-zinc-400 hover:text-white transition-colors"
                      title="View on ArcScan Explorer"
                    >
                      <span>ArcScan</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
