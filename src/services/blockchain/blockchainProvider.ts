import { ARC_MAINNET_CHAIN_ID, ARC_MAINNET_EXPLORER_URL, ARC_MAINNET_RPC_URL } from '../../config/arc';
import { BlockchainStatus, NormalizedTransaction, WalletAssetSummary, WalletSummary } from '../../types/blockchain';

export interface BlockchainProvider {
  getNetworkStatus(): Promise<BlockchainStatus>;
  getBalance(address: string): Promise<{ formatted: string; raw: string }>;
  getTransactionCount(address: string): Promise<number>;
  getTransactions(address: string, limit?: number): Promise<NormalizedTransaction[]>;
  getWalletSummary(address: string): Promise<WalletSummary>;
  getWalletAssets(address: string): Promise<WalletAssetSummary>;
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

  async getWalletAssets(address: string): Promise<WalletAssetSummary> {
    let serverAssets: WalletAssetSummary | null = null;

    try {
      const response = await fetch(`/api/blockchain/arc/assets/${address}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      if (response.ok) {
        const data = await response.json();
        if (data?.assets) serverAssets = data.assets;
      }
    } catch {
      // Use the browser-accessible Arcscan endpoint below when the Vercel
      // server cannot reach Arcscan's public API.
    }

    // Arcscan exposes the same holdings through both its typed API and its
    // Etherscan-compatible account.addresstokenbalance route. The latter is
    // useful as a second browser-safe fallback because it returns a flat
    // result array with the token's exact on-chain decimal scale.
    const normalizeRows = (data: any): any[] => {
      const rows: any[] = [];
      const visit = (value: any, depth = 0) => {
        if (depth > 5 || value === null || value === undefined) return;
        if (Array.isArray(value)) {
          rows.push(...value);
          return;
        }
        if (typeof value !== 'object') return;
        const directKeys = ['tokens', 'items', 'balances', 'holdings', 'result', 'data', 'assets'];
        for (const key of directKeys) visit(value[key], depth + 1);
        if (
          value.TokenAddress || value.token_address || value.contract_address ||
          value.address || value.contractAddress
        ) rows.push(value);
      };
      visit(data);
      return rows;
    };

    const normalizeTokenRows = (rawRows: any[]): WalletAssetSummary['coins'] => {
      const normalized = rawRows
        .map((row: any) => {
          const token = row?.token && typeof row.token === 'object' ? row.token : row;
          const balanceObject = token?.balance && typeof token.balance === 'object' ? token.balance : null;
          const addressValue =
            token?.address ?? token?.token_address ?? token?.contract_address ??
            token?.contractAddress ?? token?.TokenAddress;
          const contract = typeof addressValue === 'string' ? addressValue : '';
          const symbol = String(token?.symbol ?? token?.token_symbol ?? token?.TokenSymbol ?? '—');
          const name = String(token?.name ?? token?.token_name ?? token?.TokenName ?? symbol);
          const standard = String(token?.standard ?? token?.token_standard ?? token?.type ?? 'ERC-20')
            .toUpperCase().replace(/_/g, '-');
          const rawBalance =
            balanceObject?.raw ?? token?.raw_balance ?? token?.rawBalance ??
            token?.TokenQuantity ?? token?.balance;
          const formatted =
            balanceObject?.formatted ?? balanceObject?.display ?? balanceObject?.value ??
            token?.formatted_balance ?? token?.formatted ?? token?.display ?? token?.quantity ?? token?.TokenQuantity;
          const decimalsValue =
            balanceObject?.decimals ?? token?.decimals ?? token?.token_decimal ?? token?.TokenDivisor;
          const decimals = Number(decimalsValue);
          const rawText = rawBalance === undefined || rawBalance === null ? '' : String(rawBalance);
          const positive = rawText && /^\\d+$/.test(rawText)
            ? BigInt(rawText) > 0n
            : formatted !== undefined && formatted !== null && Number(formatted) > 0;
          return {
            address: contract,
            name,
            symbol,
            balance: String(formatted ?? ''),
            standard,
            decimals: Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : undefined,
            positive,
          };
        })
        .filter((row: any) =>
          row.address &&
          row.address.toLowerCase() !== '0x3600000000000000000000000000000000000000' &&
          row.positive &&
          (row.standard === 'ERC-20' || row.standard === 'ERC20' || row.standard === 'FUNGIBLE')
        )
        .map(({ positive, ...row }: any) => row);
      const unique = new Map<string, any>();
      for (const row of normalized) unique.set(row.address.toLowerCase(), row);
      return Array.from(unique.values());
    };

    const mergeAndReturn = (rows: WalletAssetSummary['coins']): WalletAssetSummary | null => {
      if (!rows?.length) return null;
      const existingCoins = serverAssets?.coins ?? [];
      const byAddress = new Map(existingCoins.map((coin) => [coin.address.toLowerCase(), coin]));
      for (const row of rows) byAddress.set(row.address.toLowerCase(), row);
      const coins = Array.from(byAddress.values());
      const nfts = serverAssets?.nfts ?? [];
      return {
        tokenHoldings: coins.length + nfts.length,
        coinHoldings: coins.length,
        nftHoldings: nfts.length,
        fungibleHoldings: coins.length,
        historyStatus: 'complete',
        coins,
        nfts,
      };
    };

    try {
      const response = await fetch(
        `https://api.arc-scan.org/v1/address/${address}/tokens?sort=balance`,
        { cache: 'no-store', headers: { Accept: 'application/json' } }
      );
      if (response.ok) {
        const rows = normalizeTokenRows(normalizeRows(await response.json()));
        const assets = mergeAndReturn(rows);
        if (assets) return assets;
      }
    } catch (error) {
      console.warn('Direct Arcscan token holdings fallback unavailable:', error);
    }

    try {
      const response = await fetch(
        `https://api.arc-scan.org/api?module=account&action=addresstokenbalance&address=${address}`,
        { cache: 'no-store', headers: { Accept: 'application/json' } }
      );
      if (response.ok) {
        const rows = normalizeTokenRows(normalizeRows(await response.json()));
        const assets = mergeAndReturn(rows);
        if (assets) return assets;
      }
    } catch (error) {
      console.warn('Arcscan account token holdings fallback unavailable:', error);
    }

    if (serverAssets?.historyStatus === 'complete') return serverAssets;
    throw new Error('Arc Mainnet token holdings unavailable');
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
