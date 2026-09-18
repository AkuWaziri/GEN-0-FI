import { ARC_MAINNET_CHAIN_ID, ARC_MAINNET_EXPLORER_URL, ARC_MAINNET_RPC_URL } from '../../config/arc';
import { BlockchainStatus, NormalizedTransaction, WalletSummary } from '../../types/blockchain';

export interface BlockchainProvider {
  getNetworkStatus(): Promise<BlockchainStatus>;
  getBalance(address: string): Promise<{ formatted: string; raw: string }>;
  getTransactionCount(address: string): Promise<number>;
  getTransactions(address: string, limit?: number): Promise<NormalizedTransaction[]>;
  getWalletSummary(address: string): Promise<WalletSummary>;
}

export class ArcBlockchainProvider implements BlockchainProvider {
  private rpcUrl: string;

  constructor(rpcUrl = ARC_MAINNET_RPC_URL) {
    this.rpcUrl = rpcUrl;
  }

  async getNetworkStatus(): Promise<BlockchainStatus> {
    const start = performance.now();
    try {
      const response = await fetch('/api/blockchain/arc/status', { cache: 'no-store' });
      if (response.ok) {
        const data = await response.json();
        return {
          connected: Boolean(data.connected),
          chainId: data.chainId || ARC_MAINNET_CHAIN_ID,
          blockNumber: Number(data.blockNumber || 0),
          latencyMs: Number(data.latencyMs || Math.round(performance.now() - start)),
          rpcUrl: data.rpcUrl || this.rpcUrl,
          nativeCurrency: data.nativeCurrency || 'USDC',
          explorerUrl: data.explorerUrl || ARC_MAINNET_EXPLORER_URL,
        };
      }
    } catch {
      // Fall through to a direct RPC health check.
    }

    try {
      const response = await fetch(this.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] }),
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`Arc RPC returned ${response.status}`);
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || 'Arc RPC error');
      return {
        connected: true,
        chainId: ARC_MAINNET_CHAIN_ID,
        blockNumber: parseInt(data.result, 16),
        latencyMs: Math.round(performance.now() - start),
        rpcUrl: this.rpcUrl,
        nativeCurrency: 'USDC',
        explorerUrl: ARC_MAINNET_EXPLORER_URL,
      };
    } catch (error) {
      return {
        connected: false,
        chainId: ARC_MAINNET_CHAIN_ID,
        blockNumber: 0,
        latencyMs: Math.round(performance.now() - start),
        rpcUrl: this.rpcUrl,
        nativeCurrency: 'USDC',
        explorerUrl: ARC_MAINNET_EXPLORER_URL,
      };
    }
  }

  async getBalance(address: string): Promise<{ formatted: string; raw: string }> {
    const response = await fetch(`/api/blockchain/arc/balance/${address}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Arc Mainnet balance unavailable');
    const data = await response.json();
    if (!data?.isVerified || data.balanceUSDC === 'Unavailable') {
      throw new Error('Arc Mainnet balance unavailable');
    }
    return { formatted: data.balanceUSDC, raw: data.rawBalance || '0' };
  }

  async getTransactionCount(address: string): Promise<number> {
    const response = await fetch(`/api/blockchain/arc/summary/${address}`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Arc Mainnet history unavailable');
    const data = await response.json();
    if (!data?.summary || data.summary.historyStatus !== 'complete') {
      throw new Error('Arc Mainnet history unavailable');
    }
    return Number(data.summary.txCount || 0);
  }

  async getTransactions(address: string, limit = 50): Promise<NormalizedTransaction[]> {
    const response = await fetch(`/api/blockchain/arc/activity/${address}?limit=${Math.min(Math.max(limit, 1), 50)}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error('Arc Mainnet activity unavailable');
    const data = await response.json();
    if (!Array.isArray(data.transactions)) throw new Error('Arc Mainnet activity unavailable');
    return data.transactions;
  }

  async getWalletSummary(address: string): Promise<WalletSummary> {
    const response = await fetch(`/api/blockchain/arc/summary/${address}`, {
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' },
    });
    if (!response.ok) throw new Error('Arc Mainnet wallet summary unavailable');
    const data = await response.json();
    if (!data?.summary) throw new Error('Arc Mainnet wallet summary unavailable');
    return data.summary;
  }
}

export const defaultArcProvider = new ArcBlockchainProvider();
