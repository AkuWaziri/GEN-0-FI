import { useState, useCallback } from 'react';
import { useChainId, useSwitchChain, useAccount } from 'wagmi';
import { ARC_TESTNET_CHAIN_ID, ARC_TESTNET_RPC_URL, ARC_TESTNET_EXPLORER_URL } from '../config/arc';

export interface WalletNetworkHook {
  chainId: number | undefined;
  isArcTestnet: boolean;
  detectedNetworkName: string;
  isSwitching: boolean;
  error: string | null;
  switchToArc: () => Promise<boolean>;
  clearError: () => void;
}

const KNOWN_NETWORKS: Record<number, string> = {
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

  const isArcTestnet = currentChainId === ARC_TESTNET_CHAIN_ID;
  const detectedNetworkName =
    (currentChainId ? KNOWN_NETWORKS[currentChainId] : null) ||
    (currentChainId ? `Network (ID: ${currentChainId})` : 'Unknown Network');

  const clearError = useCallback(() => setError(null), []);

  const switchToArc = useCallback(async (): Promise<boolean> => {
    if (!isConnected) {
      setError('Please connect your wallet first.');
      return false;
    }

    if (isArcTestnet) {
      return true;
    }

    setIsSwitching(true);
    setError(null);

    try {
      if (switchChainAsync) {
        await switchChainAsync({ chainId: ARC_TESTNET_CHAIN_ID });
        setIsSwitching(false);
        return true;
      }
      throw new Error('No switch chain provider available.');
    } catch (err: unknown) {
      console.warn('Standard switchChainAsync failed, attempting direct wallet RPC addition:', err);
      // Attempt standard EIP-3085 wallet_addEthereumChain if supported
      if (typeof window !== 'undefined' && (window as any).ethereum?.request) {
        try {
          await (window as any).ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: `0x${ARC_TESTNET_CHAIN_ID.toString(16)}`,
                chainName: 'Arc Testnet',
                nativeCurrency: {
                  name: 'USD Coin',
                  symbol: 'USDC',
                  decimals: 18,
                },
                rpcUrls: [ARC_TESTNET_RPC_URL],
                blockExplorerUrls: [ARC_TESTNET_EXPLORER_URL],
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
        setError('Network switch request was rejected. Arc Testnet is required to use GEN-0 FI.');
      } else {
        setError(
          'Could not switch networks automatically. Please open your wallet and select Arc Testnet manually.'
        );
      }
      setIsSwitching(false);
      return false;
    }
  }, [isConnected, isArcTestnet, switchChainAsync]);

  return {
    chainId: currentChainId,
    isArcTestnet,
    detectedNetworkName,
    isSwitching,
    error,
    switchToArc,
    clearError,
  };
}
