import { defineChain } from 'viem';
import { NetworkConfig } from '../types/blockchain';

export const ARC_TESTNET_CHAIN_ID = 5042002;
export const ARC_TESTNET_RPC_URL = 'https://rpc.testnet.arc.io';
export const ARC_TESTNET_EXPLORER_URL = 'https://testnet.arcscan.app';

export const arcTestnetChain = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: [ARC_TESTNET_RPC_URL],
    },
    public: {
      http: [ARC_TESTNET_RPC_URL],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: ARC_TESTNET_EXPLORER_URL,
    },
  },
  testnet: true,
});

export const ARC_NETWORK_CONFIG: NetworkConfig = {
  chainId: ARC_TESTNET_CHAIN_ID,
  name: 'Arc. Testnet',
  networkId: 'arc-testnet',
  rpcUrl: ARC_TESTNET_RPC_URL,
  explorerUrl: ARC_TESTNET_EXPLORER_URL,
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  isTestnet: true,
};

export function getArcScanTxUrl(txHash: string): string {
  if (!txHash) return ARC_TESTNET_EXPLORER_URL;
  const cleanHash = txHash.startsWith('0x') ? txHash : `0x${txHash}`;
  return `${ARC_TESTNET_EXPLORER_URL}/tx/${cleanHash}`;
}

export function getArcScanAddressUrl(address: string): string {
  if (!address) return ARC_TESTNET_EXPLORER_URL;
  return `${ARC_TESTNET_EXPLORER_URL}/address/${address}`;
}

export function getArcScanBlockUrl(blockNumber: number | string): string {
  return `${ARC_TESTNET_EXPLORER_URL}/block/${blockNumber}`;
}

export function formatShortAddress(address: string, chars = 4): string {
  if (!address || address.length < 10) return address || '';
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function formatShortHash(hash: string, chars = 6): string {
  if (!hash || hash.length < 14) return hash || '';
  return `${hash.slice(0, chars + 2)}...${hash.slice(-chars)}`;
}
