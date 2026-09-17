import { useState, useCallback } from 'react';
import { useChainId, useSwitchChain, useAccount } from 'wagmi';
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_RPC_URL,
  ARC_MAINNET_EXPLORER_URL,
  ARC_CHAIN_ID,
} from '../config/arc';

export interface WalletNetworkHook {
  chainId: number | undefined;
  isArcTestnet: boolean;
  isArcMainnet: boolean;
  isArc: boolean;
  detectedNetworkName: string;
  isSwitching: boolean;
  error: string | null;
  switchToArc: () => Promise<boolean>;
  clearError: () => void;
}

const KNOWN_NETWORKS: Record<number, string> = {
  5042: 'Arc',
  5042002: 'Arc Testnet',
  1: 'Ethereum Mainnet',
  8453: 'Base',
  42161: 'Arbitrum One',
  137: 'Polygon',
  10: 'Optimism',
  11155111: 'Sepolia Testnet',
};

export function useWalletNetwork(): WalletNetworkHook {
  const currentChainId = useChainId();
  const { isConnected } = useAccount();
  const { switchChainAsync } = useSwitchChain();

  const [isSwitching, setIsSwitching] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const isArcMainnet = currentChainId === ARC_MAINNET_CHAIN_ID;
  const isArc = currentChainId === ARC_CHAIN_ID;
  // Retain isArcTestnet as true if connected to Arc Mainnet or legacy Testnet for compatibility
  const isArcTestnet = isArcMainnet || currentChainId === 5042002;
  const detectedNetworkName =
    (currentChainId ? KNOWN_NETWORKS[currentChainId] : null) ||
    (currentChainId ? `Network (ID: ${currentChainId})` : 'Unknown Network');

  const clearError = useCallback(() => setError(null), []);

  const switchToArc = useCallback(async (): Promise<boolean> => {
    if (!isConnected) {
      setError('Please connect your wallet first.');
      return false;
    }

    if (isArcMainnet) {
      return true;
    }

    setIsSwitching(true);
    setError(null);

    try {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: ARC_MAINNET_CHAIN_ID });
        setIsSwitching(false);
        return true;
      }
      throw new Error('No switch chain provider available.');
    } catch (err: unknown) {
      console.warn('Standard switchChainAsync failed, attempting direct wallet RPC addition:', err);
      // Attempt standard EIP-3085 wallet_addEthereumChain for Arc Mainnet
      if (typeof window !== 'undefined' && (window as any).ethereum?.request) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${ARC_MAINNET_CHAIN_ID.toString(16)}`,
                chainName: 'Arc',
                nativeCurrency: {
                  name: 'USD Coin',
                  symbol: 'USDC',
                  decimals: 18,
                },
                rpcUrls: [ARC_MAINNET_RPC_URL, 'https://rpc.arc.io'],
                blockExplorerUrls: [ARC_MAINNET_EXPLORER_URL],
              },
            ],
          });
          setIsSwitching(false);
          return true;
        } catch (addErr: unknown) {
          console.error('wallet_addEthereumChain failed:', addErr);
        }
      }

      const errMsg =
        err instanceof Error ? err.message : 'Switch network request was rejected or unsupported.';
      if (errMsg.toLowerCase().includes('reject') || errMsg.toLowerCase().includes('user denied')) {
        setError('Network switch request was rejected. Arc Mainnet is required to use GEN-0 FI.');
      } else {
        setError(
          'Could not switch networks automatically. Please open your wallet and select Arc manually.'
        );
      }
      setIsSwitching(false);
      return false;
    }
  }, [isConnected, isArcMainnet, switchChainAsync]);

  return {
    chainId: currentChainId,
    isArcTestnet,
    isArcMainnet,
    isArc,
    detectedNetworkName,
    isSwitching,
    error,
    switchToArc,
    clearError,
  };
}
