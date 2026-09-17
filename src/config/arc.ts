import { defineChain } from 'viem';
import { NetworkConfig } from '../types/blockchain';

// Official Arc Mainnet Network Parameters (Launched September 16, 2026)
export const ARC_MAINNET_CHAIN_ID = 5042;
export const ARC_CHAIN_ID = ARC_MAINNET_CHAIN_ID;
export const ARC_TESTNET_CHAIN_ID = ARC_MAINNET_CHAIN_ID; // Backward-compatible alias for existing consumers

export const ARC_MAINNET_RPC_URL = 'https://rpc.mainnet.arc.io';
export const ARC_RPC_URL = ARC_MAINNET_RPC_URL;
export const ARC_TESTNET_RPC_URL = ARC_MAINNET_RPC_URL; // Backward-compatible alias

export const ARC_MAINNET_EXPLORER_URL = 'https://arc.etherscan.io';
export const ARC_EXPLORER_URL = ARC_MAINNET_EXPLORER_URL;
export const ARC_TESTNET_EXPLORER_URL = ARC_MAINNET_EXPLORER_URL; // Backward-compatible alias
export const ARC_SECONDARY_EXPLORER_URL = 'https://explorer.arc.io';

// Official Arc Mainnet Viem chain definition
export const arcChain = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: 'Arc',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [ARC_MAINNET_RPC_URL, 'https://rpc.arc.io'],
    },
    public: {
      http: [ARC_MAINNET_RPC_URL, 'https://rpc.arc.io'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: ARC_MAINNET_EXPLORER_URL,
    },
    arcScan: {
      name: 'ArcScan (Etherscan)',
      url: ARC_MAINNET_EXPLORER_URL,
    },
    explorer: {
      name: 'Arc Explorer',
      url: ARC_SECONDARY_EXPLORER_URL,
    },
  },
  testnet: false,
});

// Backward-compatible alias
export const arcMainnetChain = arcChain;
export const arcTestnetChain = arcChain;

export const ARC_NETWORK_CONFIG: NetworkConfig = {
  chainId: ARC_MAINNET_CHAIN_ID,
  name: 'Arc',
  networkId: 'arc-mainnet',
  rpcUrl: ARC_MAINNET_RPC_URL,
  explorerUrl: ARC_MAINNET_EXPLORER_URL,
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  isTestnet: false,
};

export function getArcScanTxUrl(txHash: string): string {
  if (!txHash) return ARC_MAINNET_EXPLORER_URL;
  const cleanHash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  return `${ARC_MAINNET_EXPLORER_URL}/tx/${cleanHash}`;
}

export function getArcScanAddressUrl(address: string): string {
  if (!address) return ARC_MAINNET_EXPLORER_URL;
  return `${ARC_MAINNET_EXPLORER_URL}/address/${address}`;
}

export function getArcScanBlockUrl(blockNumber: number | string): string {
  return `${ARC_MAINNET_EXPLORER_URL}/block/${blockNumber}`;
}

export function formatShortAddress(address: string, chars = 4): string {
  if (!address || address.length < 10) return address || '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatShortHash(hash: string, chars = 6): string {
  if (!hash || hash.length < 14) return hash || '';
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}
