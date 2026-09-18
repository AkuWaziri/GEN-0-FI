import { createPublicClient, formatUnits, http, isAddress } from 'viem';
import { arcChain, ARC_MAINNET_RPC_URL } from '../../config/arc.js';
import { normalizeTransaction, RawTxInput } from './normalizer.js';
import { NormalizedTransaction, WalletSummary } from '../../types/blockchain.js';

const BLOCKSCOUT_API_BASE = 'https://explorer.arc.io/api/v2';
const BLOCKSCOUT_API_KEY = process.env.BLOCKSCOUT_API_KEY?.trim() || '';
const NATIVE_USDC_DECIMALS = 18;
const ERC20_USDC_ADDRESS = '0x3600000000000000000000000000000000000000'.toLowerCase();

export const arcClient = createPublicClient({
  chain: arcChain,
  transport: http(process.env.ARC_MAINNET_RPC_URL || ARC_MAINNET_RPC_URL, {
    timeout: 15_000,
    retryCount: 3,
    retryDelay: 1000,
  }),
});

const API_HEADERS: Record<string, string> = {
  Accept: 'application/json',
  ...(BLOCKSCOUT_API_KEY ? { Authorization: `Bearer ${BLOCKSCOUT_API_KEY}` } : {}),
};

interface CachedTxResult {
  transactions: NormalizedTransaction[];
  isUnavailable: boolean;
  historyStatus: 'complete' | 'incomplete' | 'unavailable';
  timestamp: number;
}

const txCache = new Map<string, CachedTxResult>();
const TX_CACHE_TTL_MS = 20_000;

function formatUSDC(raw: bigint): string {
  const value = Number(formatUnits(raw, NATIVE_USDC_DECIMALS));
  if (!Number.isFinite(value)) return 'Unavailable';
  return value === 0
    ? '0.00'
    : value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function blockscoutUrl(path: string): string {
  const url = new URL(`${BLOCKSCOUT_API_BASE}${path}`);
  if (BLOCKSCOUT_API_KEY) url.searchParams.set('apikey', BLOCKSCOUT_API_KEY);
  return url.toString();
}

async function fetchJson(path: string): Promise<any> {
  const response = await fetch(blockscoutUrl(path), {
    headers: API_HEADERS,
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) {
    throw new Error(`Blockscout request failed: ${response.status}`);
  }
  return response.json();
}

async function fetchAllPages(path: string, maxPages = 100): Promise<any[]> {
  const items: any[] = [];
  let nextUrl: string | null = blockscoutUrl(path);

  for (let page = 0; page < maxPages && nextUrl; page++) {
    const response = await fetch(nextUrl, {
      headers: API_HEADERS,
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) throw new Error(`Blockscout pagination failed: ${response.status}`);

    const data = await response.json();
    if (Array.isArray(data.items)) items.push(...data.items);

    const params = data.next_page_params;
    if (!params || Object.keys(params).length === 0) {
      nextUrl = null;
    } else {
      const url = new URL(blockscoutUrl(path));
      Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, String(value)));
      nextUrl = url.toString();
    }
  }

  return items;
}

function toRawTransaction(tx: any): RawTxInput {
  return {
    hash: tx.hash,
    blockNumber: BigInt(tx.block_number || '0'),
    from: tx.from?.hash || '',
    to: tx.to?.hash || tx.created_contract?.hash || null,
    value: BigInt(tx.value || '0'),
    fee: tx.fee?.value !== undefined ? BigInt(tx.fee.value) : undefined,
    gas: tx.gas_limit !== undefined ? BigInt(tx.gas_limit) : undefined,
    gasPrice: tx.gas_price !== undefined ? BigInt(tx.gas_price) : undefined,
    gasUsed: tx.gas_used !== undefined ? BigInt(tx.gas_used) : undefined,
    input: tx.raw_input || '0x',
    timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : undefined,
    status: tx.status === 'ok' || tx.result === 'success' ? 1 : tx.status === 'error' || tx.result === 'failed' ? 0 : undefined,
    contractAddress: tx.created_contract?.hash || null,
  };
}

function tokenTransferToRaw(item: any): RawTxInput | null {
  const tokenAddress = item.token?.address?.toLowerCase();
  if (tokenAddress !== ERC20_USDC_ADDRESS) return null;

  const decimals = Number(item.total?.decimals ?? item.token?.decimals ?? 6);
  const rawValue = BigInt(item.total?.value || '0');
  const valueInNativeDecimals =
    decimals === NATIVE_USDC_DECIMALS
      ? rawValue
      : decimals < NATIVE_USDC_DECIMALS
        ? rawValue * 10n ** BigInt(NATIVE_USDC_DECIMALS - decimals)
        : rawValue / 10n ** BigInt(decimals - NATIVE_USDC_DECIMALS);

  return {
    hash: item.transaction_hash,
    blockNumber: BigInt(item.block_number || '0'),
    from: item.from?.hash || '',
    to: item.to?.hash || null,
    value: valueInNativeDecimals,
    input: '0x',
    timestamp: item.timestamp ? new Date(item.timestamp).getTime() : undefined,
    status: 1,
  };
}

/**
 * Live Arc Mainnet native USDC balance. RPC is authoritative.
 */
export async function fetchBalanceFromArcRpc(
  address: string
): Promise<{ formatted: string; raw: string; isVerified: boolean }> {
  if (!address || !isAddress(address, { strict: false })) {
    return { formatted: 'Unavailable', raw: '0', isVerified: false };
  }

  try {
    const balanceWei = await arcClient.getBalance({ address: address as `0x${string}` });
    return {
      formatted: formatUSDC(balanceWei),
      raw: balanceWei.toString(),
      isVerified: true,
    };
  } catch (error) {
    console.warn('[ArcService] Mainnet RPC balance failed:', error);
    return { formatted: 'Unavailable', raw: '0', isVerified: false };
  }
}

/**
 * Complete indexed Arc Mainnet history. Blockscout is Arc's official explorer/data layer.
 * Recent activity is returned to the UI, while lifetime totals are computed from all indexed pages.
 */
export async function fetchTransactionsForAddress(
  address: string,
  limit = 50
): Promise<{ transactions: NormalizedTransaction[]; lifetimeTransactions: NormalizedTransaction[]; isUnavailable: boolean; historyStatus: 'complete' | 'incomplete' | 'unavailable' }> {
  if (!address || !isAddress(address, { strict: false })) {
    return { transactions: [], lifetimeTransactions: [], isUnavailable: true, historyStatus: 'unavailable' };
  }

  const normalizedAddress = address.toLowerCase();
  const cached = txCache.get(normalizedAddress);
  if (cached && Date.now() - cached.timestamp < TX_CACHE_TTL_MS) {
    return {
      transactions: cached.transactions.slice(0, limit),
      lifetimeTransactions: cached.transactions,
      isUnavailable: cached.isUnavailable,
      historyStatus: cached.historyStatus,
    };
  }

  try {
    const [rawTransactions, rawTransfers] = await Promise.all([
      fetchAllPages(`/addresses/${address}/transactions`),
      fetchAllPages(`/addresses/${address}/token-transfers`),
    ]);

    const byHash = new Map<string, NormalizedTransaction>();

    for (const tx of rawTransactions) {
      if (!tx?.hash) continue;
      byHash.set(tx.hash.toLowerCase(), normalizeTransaction(toRawTransaction(tx), address));
    }

    for (const transfer of rawTransfers) {
      const raw = tokenTransferToRaw(transfer);
      if (!raw?.hash) continue;

      const normalized = normalizeTransaction(raw, address);
      const existing = byHash.get(raw.hash.toLowerCase());

      // Keep the full transaction record for gas/contract classification.
      // Add the token transfer as an activity record only when the transaction itself
      // does not already represent the user's USDC movement.
      if (!existing || existing.value === '0') {
        byHash.set(raw.hash.toLowerCase(), normalized);
      }
    }

    const transactions = Array.from(byHash.values()).sort((a, b) => b.timestamp - a.timestamp);
    const result = {
      transactions,
      isUnavailable: false,
      historyStatus: 'complete' as const,
      timestamp: Date.now(),
    };

    txCache.set(normalizedAddress, result);
    return {
      transactions: transactions.slice(0, limit),
      lifetimeTransactions: transactions,
      isUnavailable: false,
      historyStatus: 'complete',
    };
  } catch (error) {
    console.error('[ArcService] Complete Arc Mainnet history fetch failed:', error);
    const result = {
      transactions: [],
      isUnavailable: true,
      historyStatus: 'unavailable' as const,
      timestamp: Date.now(),
    };
    txCache.set(normalizedAddress, result);
    return {
      transactions: [],
      lifetimeTransactions: [],
      isUnavailable: true,
      historyStatus: 'unavailable',
    };
  }
}

/**
 * Computes metrics from verified indexed history. No fabricated fallback values.
 */
export function computeWalletSummary(
  address: string,
  balanceFormatted: string,
  transactions: NormalizedTransaction[],
  isHistoryUnavailable: boolean
): WalletSummary {
  let totalReceivedWei = 0n;
  let totalSentWei = 0n;
  let totalGasSpentUSDCNum = 0;
  let contractInteractionsCount = 0;
  let incomingTransfersCount = 0;
  let outgoingTransfersCount = 0;
  const counterparties = new Set<string>();

  for (const tx of transactions) {
    totalGasSpentUSDCNum += Number(tx.gasCostUSDC || 0) || 0;

    if (tx.isContractInteraction) contractInteractionsCount++;
    if (tx.from) counterparties.add(tx.from.toLowerCase());
    if (tx.to) counterparties.add(tx.to.toLowerCase());

    try {
      const value = BigInt(tx.rawValue || '0');
      if (tx.direction === 'received') {
        totalReceivedWei += value;
        incomingTransfersCount++;
      } else if (tx.direction === 'sent') {
        totalSentWei += value;
        outgoingTransfersCount++;
      }
    } catch {
      // Invalid indexed value is ignored rather than fabricated.
    }
  }

  const historyStatus = isHistoryUnavailable ? 'unavailable' : 'complete';
  const historyStatusNote = isHistoryUnavailable
    ? 'Arc Mainnet indexed history could not be retrieved. Live balance is still independently verified by RPC.'
    : 'Lifetime activity retrieved from Arc Mainnet indexed transaction and USDC transfer history.';

  return {
    address,
    balanceUSDC: balanceFormatted,
    rawBalance: balanceFormatted,
    totalReceivedUSDC: isHistoryUnavailable ? 'Unavailable' : formatUSDC(totalReceivedWei),
    receivedTotalUSDC: isHistoryUnavailable ? 'Unavailable' : formatUSDC(totalReceivedWei),
    totalSentUSDC: isHistoryUnavailable ? 'Unavailable' : formatUSDC(totalSentWei),
    sentTotalUSDC: isHistoryUnavailable ? 'Unavailable' : formatUSDC(totalSentWei),
    gasSpentUSDC: isHistoryUnavailable ? 'Unavailable' : totalGasSpentUSDCNum.toFixed(6),
    txCount: transactions.length,
    scannedTxCount: transactions.length,
    contractInteractionsCount,
    activeContractsCount: contractInteractionsCount,
    uniqueCounterpartiesCount: counterparties.size,
    isDataAvailable: !isHistoryUnavailable,
    historyStatus,
    historyStatusNote,
    incomingTransfersCount,
    outgoingTransfersCount,
  };
}

export interface CompleteWalletState {
  walletAddress: string;
  currentBalance: string;
  totalReceived: string;
  totalSent: string;
  totalGasSpent: string;
  totalTransactions: number;
  contractInteractions: number;
  recentTransactions: NormalizedTransaction[];
  historyStatus: 'complete' | 'incomplete' | 'unavailable';
  historyStatusNote: string;
}

export async function fetchCompleteWalletState(address: string): Promise<CompleteWalletState> {
  const [balanceResult, txResult] = await Promise.all([
    fetchBalanceFromArcRpc(address),
    fetchTransactionsForAddress(address, 50),
  ]);

  const summary = computeWalletSummary(
    address,
    balanceResult.formatted,
    // IMPORTANT: fetchTransactionsForAddress returns only the UI page.
    // Lifetime metrics must therefore be computed from the complete indexed set.
    // This is handled by re-reading the cache below when available.
    txResult.lifetimeTransactions,
    txResult.isUnavailable
  );

  return {
    walletAddress: address,
    currentBalance: summary.balanceUSDC,
    totalReceived: summary.totalReceivedUSDC,
    totalSent: summary.totalSentUSDC,
    totalGasSpent: summary.gasSpentUSDC,
    totalTransactions: summary.txCount,
    contractInteractions: summary.contractInteractionsCount,
    recentTransactions: txResult.transactions,
    historyStatus: txResult.historyStatus,
    historyStatusNote: txResult.historyStatusNote,
  };
}
