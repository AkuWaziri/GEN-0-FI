import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { WagmiProvider, useAccount, useBalance } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isAddress, formatUnits } from 'viem';
import { wagmiConfig } from '../config/wagmi';
import { ARC_CHAIN_ID, ARC_MAINNET_CHAIN_ID, formatShortAddress } from '../config/arc';
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

function buildFallbackAiAnalysis(targetAddr: string, summary: WalletSummary | null, balance: string): AiWalletAnalysis {
  const short = `${targetAddr.slice(0, 6)}...${targetAddr.slice(-4)}`;
  const txCount = summary?.txCount ?? 0;
  if (summary?.historyStatus === 'unavailable' || !summary) {
    return {
      summary: `Wallet ${short} has a live Arc Mainnet balance of ${balance} USDC, but lifetime activity data is currently unavailable.`,
      keyObservations: [`Live balance: ${balance} USDC.`, 'Lifetime transaction history is unavailable.'],
      activityLevel: 'low',
      generatedAt: Date.now(),
      disclaimer: 'Generated from verified Arc Mainnet state. Missing data is not inferred.',
    };
  }
  const received = summary.totalReceivedUSDC || 'Unavailable';
  const sent = summary.totalSentUSDC || 'Unavailable';
  const gas = summary.gasSpentUSDC || 'Unavailable';
  const contracts = summary.contractInteractionsCount ?? 0;
  const observations = [
    `Current verified balance: ${balance} USDC.`,
    `Verified inbound: ${received} USDC | Outbound: ${sent} USDC.`,
  ];
  if (gas !== 'Unavailable') observations.push(`Execution fees paid on Arc: ${gas} USDC.`);
  if (contracts > 0) observations.push(`${contracts} smart contract interaction(s) verified.`);
  return {
    summary: `Wallet ${short} holds ${balance} USDC on Arc across ${txCount} indexed transaction(s). Verified lifetime inbound: ${received} USDC; outbound: ${sent} USDC.`,
    keyObservations: observations,
    activityLevel: txCount > 5 ? 'active' : txCount > 0 ? 'moderate' : 'low',
    generatedAt: Date.now(),
    disclaimer: 'Generated from verified Arc Mainnet state. Missing data is not inferred.',
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
  const isCorrectNetwork = Boolean(isConnected && network.isArcMainnet);

  // Real Arc native USDC balance directly from Arc Mainnet RPC
  const arcBalance = useArcBalance(activeAddress || undefined);

  // Wagmi native balance hook targeting Arc Mainnet (chain id 5042)
  const {
    data: wagmiBalanceData,
    refetch: refetchWagmiBalance,
  } = useBalance({
    address: (activeAddress && activeAddress.startsWith('0x') && activeAddress.length >= 42)
      ? (activeAddress as `0x${string}`)
      : undefined,
    chainId: ARC_CHAIN_ID,
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
    // 2. Wagmi native useBalance on Arc Mainnet (chain 5042)
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

    // If user wasn't connected and just successfully connected on Arc Mainnet, show brief welcome state
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

    // Use the authoritative lifetime summary. Never derive lifetime totals from recent UI rows.
    const txCount = activeSummary?.txCount ?? activeTxs.length;
    const recDisplay = activeSummary?.totalReceivedUSDC || 'Unavailable';
    const sentDisplay = activeSummary?.totalSentUSDC || 'Unavailable';
    const gasDisplay = activeSummary?.gasSpentUSDC || 'Unavailable';

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
        setAiSummary(buildFallbackAiAnalysis(targetAddr, activeSummary, balance));
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
      console.warn('Failed to load Arc onchain activity:', err);
      setDataError("Couldn't retrieve latest Arc activity. Live balance remains verified.");
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
