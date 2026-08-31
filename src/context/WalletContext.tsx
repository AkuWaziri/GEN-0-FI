import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { isAddress } from 'viem';
import { ARC_TESTNET_CHAIN_ID, formatShortAddress } from '../config/arc';
import { defaultArcProvider } from '../services/blockchain/blockchainProvider';
import { injectedWallet, WalletState } from '../services/wallet/injectedWallet';
import { AiWalletAnalysis, BlockchainStatus, NormalizedTransaction, WalletSummary } from '../types/blockchain';
import { DEMO_WALLET_ADDRESS, DEMO_TRANSACTIONS, DEMO_WALLET_SUMMARY, DEMO_AI_ANALYSIS } from '../services/blockchain/demoData';

export const DEMO_ARC_ADDRESS = DEMO_WALLET_ADDRESS;

interface WalletContextType {
  address: string | null;
  shortAddress: string;
  isConnected: boolean;
  isConnecting: boolean;
  chainId: number | null;
  isCorrectNetwork: boolean;
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
  connectWallet: () => Promise<boolean>;
  disconnectWallet: () => void;
  switchToArc: () => Promise<boolean>;
  refreshData: () => Promise<void>;
  inspectAddress: (address: string, isDemo?: boolean) => Promise<void>;
  exitDemoMode: () => void;
  fetchAiSummary: () => Promise<void>;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [walletState, setWalletState] = useState<WalletState>(injectedWallet.getState());
  const [demoAddress, setDemoAddress] = useState<string | null>(null);
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);

  const [balanceUSDC, setBalanceUSDC] = useState<string>('0.00');
  const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<NormalizedTransaction[]>([]);
  const [networkStatus, setNetworkStatus] = useState<BlockchainStatus | null>(null);
  
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const [aiSummary, setAiSummary] = useState<AiWalletAnalysis | null>(null);
  const [isAiLoading, setIsAiLoading] = useState<boolean>(false);

  // Active address is either connected wallet or inspected address
  const activeAddress = demoAddress || walletState.address;
  const isConnected = Boolean(isDemoMode || demoAddress || walletState.isConnected);
  const isCorrectNetwork = Boolean(isDemoMode || demoAddress || walletState.isCorrectNetwork);
  const chainId = (isDemoMode || demoAddress) ? ARC_TESTNET_CHAIN_ID : walletState.chainId;
  const walletName = isDemoMode
    ? 'Demo Inspector (Arc Testnet)'
    : demoAddress
    ? 'Manual Inspector (Arc Testnet)'
    : walletState.walletName;


  // Listen to injected wallet
  useEffect(() => {
    const unsub = injectedWallet.subscribe((state) => {
      setWalletState(state);
    });
    return unsub;
  }, []);

  // Poll Network Status periodically
  useEffect(() => {
    let mounted = true;
    const checkStatus = async () => {
      try {
        const res = await defaultArcProvider.getNetworkStatus();
        if (mounted) {
          setNetworkStatus(res);
        }
      } catch (err) {
        console.warn('Network status query failed:', err);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 30_000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // AI Summary Generator
  const fetchAiSummary = useCallback(async () => {
    if (!activeAddress) return;
    setIsAiLoading(true);
    try {
      const res = await fetch('/api/ai/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: activeAddress,
          summary: walletSummary,
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
  }, [activeAddress, walletSummary, transactions]);

  // Load Real Blockchain Data
  const loadBlockchainData = useCallback(async (targetAddr: string, isInitial = false) => {
    if (!targetAddr || !isAddress(targetAddr)) return;

    const isDemo = isDemoMode || targetAddr.toLowerCase() === DEMO_WALLET_ADDRESS.toLowerCase();

    if (isDemo && isInitial) {
      setBalanceUSDC(DEMO_WALLET_SUMMARY.balanceUSDC);
      setWalletSummary(DEMO_WALLET_SUMMARY);
      setTransactions(DEMO_TRANSACTIONS);
      setAiSummary(DEMO_AI_ANALYSIS);
      setIsLoadingData(false);
      setIsRefreshing(false);
      return;
    }

    if (isInitial) setIsLoadingData(true);
    else setIsRefreshing(true);
    setError(null);

    try {
      // 1. Fetch Real Balance from Arc Testnet
      const balanceData = await defaultArcProvider.getBalance(targetAddr);
      setBalanceUSDC(balanceData.formatted);

      // 2. Fetch Real Transactions & Activity
      const txs = await defaultArcProvider.getTransactions(targetAddr, 30);
      if (txs.length > 0 || !isDemo) {
        setTransactions(txs);
      }

      // 3. Compute Summary
      const summary = await defaultArcProvider.getWalletSummary(targetAddr);
      setWalletSummary(summary);

    } catch (err: any) {
      console.error('Failed to load onchain data:', err);
      if (isDemo) {
        setBalanceUSDC(DEMO_WALLET_SUMMARY.balanceUSDC);
        setWalletSummary(DEMO_WALLET_SUMMARY);
        setTransactions(DEMO_TRANSACTIONS);
        setAiSummary(DEMO_AI_ANALYSIS);
      } else {
        setError(err.message || 'Unable to load real Arc Testnet data. Please check connection.');
      }
    } finally {
      setIsLoadingData(false);
      setIsRefreshing(false);
    }
  }, [isDemoMode]);

  // Trigger data load when address or network changes
  useEffect(() => {
    if (activeAddress && (isCorrectNetwork || isDemoMode)) {
      loadBlockchainData(activeAddress, true);
    } else {
      setBalanceUSDC('0.00');
      setWalletSummary(null);
      setTransactions([]);
      setAiSummary(null);
    }
  }, [activeAddress, isCorrectNetwork, isDemoMode, loadBlockchainData]);

  // Auto trigger AI summary after data load
  useEffect(() => {
    if (activeAddress && walletSummary && !isAiLoading) {
      fetchAiSummary();
    }
  }, [activeAddress, walletSummary?.address, walletSummary?.txCount]);

  const connectWallet = async (): Promise<boolean> => {
    setIsDemoMode(false);
    setDemoAddress(null);
    const success = await injectedWallet.connect();
    return success;
  };

  const disconnectWallet = () => {
    injectedWallet.disconnect();
    setIsDemoMode(false);
    setDemoAddress(null);
    setBalanceUSDC('0.00');
    setWalletSummary(null);
    setTransactions([]);
    setAiSummary(null);
  };

  const switchToArc = async (): Promise<boolean> => {
    return await injectedWallet.switchToArcTestnet();
  };

  const refreshData = async () => {
    if (activeAddress) {
      await loadBlockchainData(activeAddress, false);
      await fetchAiSummary();
    }
  };

  const inspectAddress = async (addr: string, isDemo = false) => {
    if (!isAddress(addr)) {
      setError('Please provide a valid 0x EVM address');
      return;
    }
    setError(null);
    if (isDemo || addr.toLowerCase() === DEMO_WALLET_ADDRESS.toLowerCase()) {
      setIsDemoMode(true);
      setDemoAddress(addr);
      setBalanceUSDC(DEMO_WALLET_SUMMARY.balanceUSDC);
      setWalletSummary(DEMO_WALLET_SUMMARY);
      setTransactions(DEMO_TRANSACTIONS);
      setAiSummary(DEMO_AI_ANALYSIS);
    } else {
      setIsDemoMode(false);
      setDemoAddress(addr);
    }
  };

  const exitDemoMode = () => {
    setIsDemoMode(false);
    setDemoAddress(null);
    setBalanceUSDC('0.00');
    setWalletSummary(null);
    setTransactions([]);
    setAiSummary(null);
  };

  return (
    <WalletContext.Provider
      value={{
        address: activeAddress,
        shortAddress: activeAddress ? formatShortAddress(activeAddress) : '',
        isConnected,
        isConnecting: walletState.isConnecting,
        chainId,
        isCorrectNetwork,
        walletName,
        balanceUSDC,
        walletSummary,
        transactions,
        networkStatus,
        isLoadingData,
        isRefreshing,
        error: error || walletState.error,
        isDemoMode,
        aiSummary,
        isAiLoading,
        connectWallet,
        disconnectWallet,
        switchToArc,
        refreshData,
        inspectAddress,
        exitDemoMode,
        fetchAiSummary,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
