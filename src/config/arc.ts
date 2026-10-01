import { defineChain } from 'viem';
import { NetworkConfig } from '../types/blockchain.js';

export const ARC_MAINNET_CHAIN_ID = 5042;
export const ARC_CHAIN_ID = ARC_MAINNET_CHAIN_ID;
export const ARC_MAINNET_RPC_URL = 'https://rpc.mainnet.arc.io';
export const ARC_RPC_URL = ARC_MAINNET_RPC_URL;
export const ARC_FALLBACK_RPC_URL = 'https://rpc.arc-scan.org';
export const ARC_MAINNET_EXPLORER_URL = 'https://explorer.arc.io';
export const ARC_EXPLORER_URL = ARC_MAINNET_EXPLORER_URL;
export const ARC_SECONDARY_EXPLORER_URL = ARC_MAINNET_EXPLORER_URL;

export const arcChain = defineChain({
  id: ARC_MAINNET_CHAIN_ID,
  name: 'Arc',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [ARC_MAINNET_RPC_URL, ARC_FALLBACK_RPC_URL] },
    public: { http: [ARC_MAINNET_RPC_URL, ARC_FALLBACK_RPC_URL] },
  },
  blockExplorers: {
    default: { name: 'Arc Explorer', url: ARC_MAINNET_EXPLORER_URL },
  },
  testnet: false,
});

export const arcMainnetChain = arcChain;

export const ARC_NETWORK_CONFIG: NetworkConfig = {
  chainId: ARC_MAINNET_CHAIN_ID,
  name: 'Arc',
  networkId: 'arc-mainnet',
  rpcUrl: ARC_MAINNET_RPC_URL,
  explorerUrl: ARC_MAINNET_EXPLORER_URL,
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  isTestnet: false,
};

export function getArcScanTxUrl(txHash: string): string {
  if (!txHash) return ARC_MAINNET_EXPLORER_URL;
  return `${ARC_MAINNET_EXPLORER_URL}/tx/${txHash.startsWith('0x') ? txHash : `0x${txHash}`}`;
}
export function getArcScanAddressUrl(address: string): string {
  return address ? `${ARC_MAINNET_EXPLORER_URL}/address/${address}` : ARC_MAINNET_EXPLORER_URL;
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
