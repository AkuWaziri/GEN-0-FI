import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { WagmiProvider, useAccount } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { isAddress } from 'viem';
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

  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<NormalizedTransaction[]>([]);
  const [networkStatus, setNetworkStatus] = useState<BlockchainStatus | null>(null);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [dataError, setDataError] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<AiWalletAnalysis | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Single synchronized balance source of truth: whichever has the verified non-zero live balance
  const synchronizedBalanceUSDC = 
    (arcBalance.formatted && arcBalance.formatted !== '0.00')
      ? arcBalance.formatted
      : (walletSummary?.balanceUSDC && walletSummary.balanceUSDC !== '0.00')
        ? walletSummary.balanceUSDC
        : (arcBalance.formatted || walletSummary?.balanceUSDC || '0.00');

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
  }, []);

  // When active account changes, refresh real Arc Testnet data or reset
  useEffect(() => {
    if (activeAddress) {
      loadRealBlockchainData(activeAddress, true);
    } else {
      setTransactions([]);
      setWalletSummary(null);
      setAiSummary(null);
      setIsLoadingData(false);
      setIsRefreshing(false);
    }
  }, [activeAddress, loadRealBlockchainData]);

  // AI Summary Generator for real onchain transactions
  const fetchAiSummary = useCallback(async () => {
    if (!activeAddress) return;
    setIsAiLoading(true);
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: activeAddress,
          summary: {
            ...(walletSummary || {}),
            balanceUSDC: synchronizedBalanceUSDC,
          },
          recentTransactions: transactions,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setAiSummary(data);
      }
    } catch (err) {
      console.warn('AI Summary fetch error:', err);
    } finally {
      setIsAiLoading(false);
    }
  }, [activeAddress, walletSummary, synchronizedBalanceUSDC, transactions]);

  // Auto trigger AI summary after data load if walletSummary or transactions update
  useEffect(() => {
    if (activeAddress && (walletSummary || synchronizedBalanceUSDC !== '0.00') && !isAiLoading && !aiSummary) {
      fetchAiSummary();
    }
  }, [activeAddress, walletSummary?.address, walletSummary?.txCount, synchronizedBalanceUSDC]);

  const refreshData = async () => {
    if (activeAddress) {
      await Promise.all([
        arcBalance.refetch(),
        loadRealBlockchainData(activeAddress, false),
      ]);
      await fetchAiSummary();
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
        isLoadingData: isLoadingData || arcBalance.isLoading,
        isRefreshing,
        error,
        isDemoMode: false,
        aiSummary,
        isAiLoading,
        showWelcomeOverlay,
        dismissWelcomeOverlay,
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
