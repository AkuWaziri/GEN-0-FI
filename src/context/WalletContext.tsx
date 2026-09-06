import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { WagmiProvider, useAccount, useBalance } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isAddress, formatUnits } from 'viem';
import { wagmiConfig } from '../config/wagmi';
import { ARC_TESTNET_CHAIN_ID, formatShortAddress } from '../config/arc';
import { useWalletConnection, ConnectionState } from '../hooks/useWalletConnection';
import { useWalletNetwork } from '../hooks/useWalletNetwork';
import { useArcBalance } from '../hooks/useArcBalance';
import { defaultArcProvider } from '../services/blockchain/blockchainProvider';
import { AiWalletAnalysis, BlockchainStatus, NormalizedTransaction, WalletSummary } from '../types/blockchain';

// Single shared QueryClient instance for TanStack Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export interface WalletContextType {
  address: string | null;
  shortAddress: string;
  isConnected: boolean;
  isConnecting: boolean;
  connectionState: ConnectionState;
  connectorName: string | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  detectedNetworkName: string;
  walletName: string | null;
  balanceUSDC: string;
  walletSummary: WalletSummary | null;
  transactions: NormalizedTransaction[];
  networkStatus: BlockchainStatus | null;
  isLoadingData: boolean;
  isRefreshing: boolean;
  error: string | null;
  isDemoMode: boolean;
  aiSummary: AiWalletAnalysis | null;
  isAiLoading: boolean;
  showWelcomeOverlay: boolean;
  dismissWelcomeOverlay: () => void;
  hasInjectedWallet: boolean;
  connectInjected: () => Promise<void>;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => void;
  switchToArc: () => Promise<boolean>;
  refreshData: () => Promise<void>;
  retryConnection: () => Promise<void>;
  clearError: () => void;
  inspectAddress: (address: string, isDemo?: boolean) => Promise<void>;
  exitDemoMode: () => void;
  fetchAiSummary: () => Promise<void>;
}

function buildFallbackAiAnalysis(
  targetAddr: string,
  summary: WalletSummary | null,
  balance: string,
  txs?: NormalizedTransaction[]
): AiWalletAnalysis {
  const short = `${targetAddr.slice(0, 6)}...${targetAddr.slice(-4)}`;
  const norm = targetAddr.toLowerCase();
  
  let derivedRec = 0;
  let derivedSent = 0;
  let derivedGas = 0;
  if (txs && txs.length > 0) {
    for (const t of txs) {
      const val = parseFloat(t.value.replace(/,/g, '')) || 0;
      const from = (t.from || '').toLowerCase();
      const to = (t.to || '').toLowerCase();
      if (to === norm && from !== norm) {
        derivedRec += val;
      } else if (from === norm) {
        derivedSent += val;
        derivedGas += parseFloat(t.gasCostUSDC) || 0;
      }
    }
  }

  const txCount = Math.max(summary?.txCount ?? 0, txs?.length ?? 0);
  const numBal = parseFloat(balance.replace(/,/g, '')) || 0;
  const historyStatus = summary?.historyStatus || (numBal > 0 && txCount === 0 ? 'incomplete' : 'complete');
  const observations: string[] = [];

  const recDisplay =
    summary?.totalReceivedUSDC && summary.totalReceivedUSDC !== '0.00' && summary.totalReceivedUSDC !== 'Incomplete scan'
      ? summary.totalReceivedUSDC
      : derivedRec > 0
      ? derivedRec.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
      : summary?.totalReceivedUSDC || '0.00';

  const sentDisplay =
    summary?.totalSentUSDC && summary.totalSentUSDC !== '0.00' && summary.totalSentUSDC !== 'Incomplete scan'
      ? summary.totalSentUSDC
      : derivedSent > 0
      ? derivedSent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
      : summary?.totalSentUSDC || '0.00';

  const gasDisplay =
    summary?.gasSpentUSDC && summary.gasSpentUSDC !== '0.000000'
      ? summary.gasSpentUSDC
      : derivedGas > 0
      ? derivedGas.toFixed(6)
      : summary?.gasSpentUSDC || '0.000000';

  let summaryText = '';
  if (historyStatus === 'incomplete' && recDisplay === 'Incomplete scan') {
    summaryText = `Wallet ${short} verifiably holds ${balance} USDC on Arc Testnet across ${txCount} transaction(s). Historical inbound funding occurred outside the scanned explorer dataset, so lifetime received volume cannot be fully determined from recent logs.`;
    observations.push(`Current authoritative balance: ${balance} USDC on Arc Testnet.`);
    observations.push(`Confirmed transactions: ${txCount} on Arc.`);
    observations.push(`Inbound funding happened outside scanned blocks; current balance is authoritative.`);
  } else if (txCount === 0 && numBal === 0) {
    summaryText = `Wallet ${short} holds 0.00 USDC with zero recorded transactions on Arc Testnet.`;
    observations.push(`Current verified balance: 0.00 USDC.`);
    observations.push(`No incoming or outgoing transfers on Arc Testnet.`);
  } else {
    summaryText = `Wallet ${short} holds ${balance} USDC on Arc Testnet across ${txCount} confirmed transaction(s). Total verified incoming transfers: ${recDisplay} USDC; outgoing transfers: ${sentDisplay} USDC; gas spent: ${gasDisplay} USDC.`;
    observations.push(`Current verified balance: ${balance} USDC.`);
    observations.push(`Verified inbound: ${recDisplay} USDC | Outbound: ${sentDisplay} USDC.`);
    if (parseFloat(gasDisplay) > 0) {
      observations.push(`Gas execution fees paid on Arc: ${gasDisplay} USDC.`);
    }
    const contracts = summary?.contractInteractionsCount || txs?.filter(t => t.isContractInteraction).length || 0;
    if (contracts > 0) {
      observations.push(`${contracts} smart contract interaction(s) verified.`);
    }
  }

  return {
    summary: summaryText,
    keyObservations: observations,
    activityLevel: txCount > 5 ? 'active' : txCount > 0 ? 'moderate' : 'low',
    generatedAt: Date.now(),
    disclaimer: 'Generated from real Arc Testnet onchain state.',
  };
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const WalletContextCore: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { address: wagmiAddress, isConnected: isWagmiConnected } = useAccount();
  const connection = useWalletConnection();
  const network = useWalletNetwork();

  // Active address is lowercase string
  const activeAddress = wagmiAddress || null;
  const isConnected = Boolean(isWagmiConnected && activeAddress);
  const isCorrectNetwork = Boolean(isConnected && network.isArcTestnet);

  // Real Arc native USDC balance directly from Arc Testnet RPC
  const arcBalance = useArcBalance(activeAddress || undefined);

  // Wagmi native balance hook targeting Arc Testnet (chain id 5042002)
  const {
    data: wagmiBalanceData,
    refetch: refetchWagmiBalance,
  } = useBalance({
    address: (activeAddress && activeAddress.startsWith('0x') && activeAddress.length >= 42)
      ? (activeAddress as `0x${string}`)
      : undefined,
    chainId: ARC_TESTNET_CHAIN_ID,
  });

  const wagmiFormattedBalance = useMemo(() => {
    if (!wagmiBalanceData) return null;
    try {
      const rawVal = wagmiBalanceData.value;
      const units = formatUnits(rawVal, wagmiBalanceData.decimals ?? 18);
      const num = parseFloat(units);
      if (isNaN(num)) return '0.00';
      if (num === 0) return '0.00';
      return num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });
    } catch {
      return null;
    }
  }, [wagmiBalanceData]);

  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<NormalizedTransaction[]>([]);
  const [networkStatus, setNetworkStatus] = useState<BlockchainStatus | null>(null);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<AiWalletAnalysis | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Single synchronized balance source of truth: whichever has the verified non-zero live balance
  const synchronizedBalanceUSDC = useMemo(() => {
    // 1. Direct verified onchain balance from Arc RPC hook
    if (arcBalance.formatted && arcBalance.formatted !== '0.00') {
      return arcBalance.formatted;
    }
    // 2. Wagmi native useBalance on Arc Testnet (chain 5042002)
    if (wagmiFormattedBalance && wagmiFormattedBalance !== '0.00') {
      return wagmiFormattedBalance;
    }
    // 3. Wallet summary balance from provider
    if (walletSummary?.balanceUSDC && walletSummary.balanceUSDC !== '0.00') {
      return walletSummary.balanceUSDC;
    }
    // 4. Default to valid 0.00 if connected and verified zero
    return arcBalance.formatted || wagmiFormattedBalance || walletSummary?.balanceUSDC || '0.00';
  }, [arcBalance.formatted, wagmiFormattedBalance, walletSummary?.balanceUSDC]);

  // References to prevent infinite re-render loops and rapid duplicate requests
  const walletSummaryRef = useRef<WalletSummary | null>(null);
  walletSummaryRef.current = walletSummary;

  const transactionsRef = useRef<NormalizedTransaction[]>([]);
  transactionsRef.current = transactions;

  const synchronizedBalanceRef = useRef<string>(synchronizedBalanceUSDC);
  synchronizedBalanceRef.current = synchronizedBalanceUSDC;

  const lastAiFetchedKeyRef = useRef<string>('');
  const isAiFetchingRef = useRef<boolean>(false);

  // First-time onboarding welcome state
  const [showWelcomeOverlay, setShowWelcomeOverlay] = useState<boolean>(false);
  const hasEverConnectedRef = useRef<boolean>(false);
  const initialMountRef = useRef<boolean>(true);

  // Address ref to guard against out-of-order responses on account switch
  const currentAddressRef = useRef<string | null>(activeAddress);
  currentAddressRef.current = activeAddress;

  // Track first-time connection vs returning session
  useEffect(() => {
    if (initialMountRef.current) {
      initialMountRef.current = false;
      // If already connected upon initial app load (returning user), do NOT show welcome overlay
      if (isConnected) {
        hasEverConnectedRef.current = true;
      }
      return;
    }

    // If user wasn't connected and just successfully connected on Arc Testnet, show brief welcome state
    if (isConnected && isCorrectNetwork && !hasEverConnectedRef.current) {
      hasEverConnectedRef.current = true;
      setShowWelcomeOverlay(true);

      // Auto-continue to dashboard after 2 seconds
      const timer = setTimeout(() => {
        setShowWelcomeOverlay(false);
      }, 2400);

      return () => clearTimeout(timer);
    }
  }, [isConnected, isCorrectNetwork]);

  const dismissWelcomeOverlay = useCallback(() => {
    setShowWelcomeOverlay(false);
  }, []);

  // Poll Network Status periodically for latency and block number
  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      try {
        const res = await defaultArcProvider.getNetworkStatus();
        if (mounted) {
          setNetworkStatus(res);
        }
      } catch (err) {
        console.warn('Arc Network status query failed:', err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Stable AI Summary Generator for real onchain transactions
  const fetchAiSummary = useCallback(async (
    overrideSummary?: WalletSummary | null,
    overrideTxs?: NormalizedTransaction[],
    force = false
  ) => {
    const targetAddr = currentAddressRef.current;
    if (!targetAddr) return;

    const activeSummary = overrideSummary !== undefined ? overrideSummary : walletSummaryRef.current;
    const activeTxs = overrideTxs !== undefined ? overrideTxs : transactionsRef.current;
    const balance = synchronizedBalanceRef.current;
    const requestKey = `${targetAddr.toLowerCase()}_${balance}_${activeSummary?.txCount ?? 0}`;

    if (!force && (lastAiFetchedKeyRef.current === requestKey || isAiFetchingRef.current)) {
      return;
    }

    lastAiFetchedKeyRef.current = requestKey;
    isAiFetchingRef.current = true;
    setIsAiLoading(true);

    // Compute consistent verified figures to pass to AI summary so it can never contradict overview
    const norm = targetAddr.toLowerCase();
    let derivedRec = 0;
    let derivedSent = 0;
    let derivedGas = 0;
    if (activeTxs && activeTxs.length > 0) {
      for (const t of activeTxs) {
        const val = parseFloat(t.value.replace(/,/g, '')) || 0;
        const from = (t.from || '').toLowerCase();
        const to = (t.to || '').toLowerCase();
        if (to === norm && from !== norm) {
          derivedRec += val;
        } else if (from === norm) {
          derivedSent += val;
          derivedGas += parseFloat(t.gasCostUSDC) || 0;
        }
      }
    }

    const txCount = Math.max(activeSummary?.txCount ?? 0, activeTxs?.length ?? 0);
    const recDisplay =
      activeSummary?.totalReceivedUSDC && activeSummary.totalReceivedUSDC !== '0.00' && activeSummary.totalReceivedUSDC !== 'Incomplete scan'
        ? activeSummary.totalReceivedUSDC
        : derivedRec > 0
        ? derivedRec.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
        : activeSummary?.totalReceivedUSDC || '0.00';

    const sentDisplay =
      activeSummary?.totalSentUSDC && activeSummary.totalSentUSDC !== '0.00' && activeSummary.totalSentUSDC !== 'Incomplete scan'
        ? activeSummary.totalSentUSDC
        : derivedSent > 0
        ? derivedSent.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
        : activeSummary?.totalSentUSDC || '0.00';

    const gasDisplay =
      activeSummary?.gasSpentUSDC && activeSummary.gasSpentUSDC !== '0.000000'
        ? activeSummary.gasSpentUSDC
        : derivedGas > 0
        ? derivedGas.toFixed(6)
        : activeSummary?.gasSpentUSDC || '0.000000';

    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
        cache: 'no-store',
        body: JSON.stringify({
          address: targetAddr,
          summary: {
            ...(activeSummary || {}),
            address: targetAddr,
            balanceUSDC: balance,
            totalReceivedUSDC: recDisplay,
            receivedTotalUSDC: recDisplay,
            totalSentUSDC: sentDisplay,
            sentTotalUSDC: sentDisplay,
            gasSpentUSDC: gasDisplay,
            txCount,
            contractInteractionsCount:
              activeSummary?.contractInteractionsCount ??
              activeTxs?.filter((t) => t.isContractInteraction).length ??
              0,
          },
          recentTransactions: activeTxs,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data);
      } else {
        setAiSummary(buildFallbackAiAnalysis(targetAddr, activeSummary, balance, activeTxs));
      }
    } catch (err) {
      console.warn('AI Summary fetch error, serving verified onchain summary fallback:', err);
      setAiSummary(buildFallbackAiAnalysis(targetAddr, activeSummary, balance, activeTxs));
    } finally {
      isAiFetchingRef.current = false;
      setIsAiLoading(false);
    }
  }, []);

  // Fetch real onchain activity and summary for the connected address on Arc Testnet
  const loadRealBlockchainData = useCallback(async (targetAddr: string, isInitial = false) => {
    if (!targetAddr || !isAddress(targetAddr)) return;

    if (isInitial) setIsLoadingData(true);
    else setIsRefreshing(true);
    setDataError(null);

    try {
      // 1. Fetch real transaction count & activity
      const [txs, summary] = await Promise.all([
        defaultArcProvider.getTransactions(targetAddr, 25).catch(() => []),
        defaultArcProvider.getWalletSummary(targetAddr).catch(() => null),
      ]);

      // Guard against race condition if user switched accounts while request was pending
      if (currentAddressRef.current?.toLowerCase() !== targetAddr.toLowerCase()) {
        return;
      }

      setTransactions(txs || []);
      setWalletSummary(summary);

      // Trigger AI summary with the fresh authoritative data
      if (summary || targetAddr) {
        fetchAiSummary(summary, txs || [], false);
      }
    } catch (err: unknown) {
      if (currentAddressRef.current?.toLowerCase() !== targetAddr.toLowerCase()) {
        return;
      }
      console.warn('Failed to load Arc Testnet onchain activity:', err);
      setDataError("Couldn't retrieve latest Arc Testnet activity. Live balance remains verified.");
    } finally {
      if (currentAddressRef.current?.toLowerCase() === targetAddr.toLowerCase()) {
        setIsLoadingData(false);
        setIsRefreshing(false);
      }
    }
  }, [fetchAiSummary]);

  // When active account changes, refresh real Arc Testnet data or reset
  useEffect(() => {
    if (activeAddress) {
      loadRealBlockchainData(activeAddress, true);
    } else {
      lastAiFetchedKeyRef.current = '';
      setTransactions([]);
      setWalletSummary(null);
      setAiSummary(null);
      setIsLoadingData(false);
      setIsRefreshing(false);
    }
  }, [activeAddress, loadRealBlockchainData]);

  const refreshData = async () => {
    if (activeAddress) {
      await Promise.all([
        arcBalance.refetch(),
        refetchWagmiBalance().catch(() => null),
        loadRealBlockchainData(activeAddress, false),
      ]);
    }
  };

  const disconnectWallet = () => {
    connection.disconnect();
    setTransactions([]);
    setWalletSummary(null);
    setAiSummary(null);
    setDataError(null);
    setShowWelcomeOverlay(false);
  };

  const clearError = () => {
    connection.clearError();
    network.clearError();
    setDataError(null);
  };

  const retryConnection = async () => {
    clearError();
    await connection.retry();
  };

  // Compatibility stubs for existing UI components
  const inspectAddress = async (addr: string) => {
    if (isAddress(addr)) {
      await loadRealBlockchainData(addr, true);
    }
  };
  const exitDemoMode = () => {};

  const error = connection.errorMessage || network.error || dataError || arcBalance.errorMessage;

  return (
    <WalletContext.Provider
      value={{
        address: activeAddress,
        shortAddress: activeAddress ? formatShortAddress(activeAddress) : '',
        isConnected,
        isConnecting: connection.isConnecting,
        connectionState: connection.state,
        connectorName: connection.connectorName || null,
        chainId: network.chainId || null,
        isCorrectNetwork,
        detectedNetworkName: network.detectedNetworkName,
        walletName: connection.connectorName || 'Connected Web3 Wallet',
        balanceUSDC: synchronizedBalanceUSDC,
        walletSummary,
        transactions,
        networkStatus,
        isLoadingData: isLoadingData || (arcBalance.isLoading && synchronizedBalanceUSDC === '0.00'),
        isRefreshing,
        error,
        isDemoMode: false,
        aiSummary,
        isAiLoading,
        showWelcomeOverlay,
        dismissWelcomeOverlay,
        hasInjectedWallet: connection.hasInjectedWallet,
        connectInjected: connection.connectInjected,
        connectWallet: connection.openConnectModal,
        disconnectWallet,
        switchToArc: network.switchToArc,
        refreshData,
        retryConnection,
        clearError,
        inspectAddress,
        exitDemoMode,
        fetchAiSummary,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <WalletContextCore>{children}</WalletContextCore>
      </QueryClientProvider>
    </WagmiProvider>
  );
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
