import { createPublicClient, formatUnits, http, isAddress } from 'viem';
import { arcChain, ARC_MAINNET_RPC_URL } from '../../config/arc.js';
import { normalizeTransaction, RawTxInput } from './normalizer.js';
import { NormalizedTransaction, WalletSummary } from '../../types/blockchain.js';

const ARCSCAN_API_BASE = 'https://api.arc-scan.org/api';
const ARCSCAN_API_KEY = process.env.ARCSCAN_API_KEY || 'YourApiKeyToken';
const ARCSCAN_RPC_URL = 'https://rpc.arc-scan.org';
const NATIVE_USDC_DECIMALS = 18;
const ERC20_USDC_ADDRESS = '0x3600000000000000000000000000000000000000'.toLowerCase();
const TX_CACHE_TTL_MS = 30_000;
const txCache = new Map<string, {
  transactions: NormalizedTransaction[];
  isUnavailable: boolean;
  historyStatus: 'complete' | 'incomplete' | 'unavailable';
  timestamp: number;
}>();

async function markContractTargets(transactions: NormalizedTransaction[]): Promise<void> {
  const cache = new Map<string, boolean>();
  for (const tx of transactions) {
    if (!tx.to || tx.to.toLowerCase() === tx.from?.toLowerCase()) continue;
    const target = tx.to.toLowerCase();
    if (!cache.has(target)) {
      try {
        const code = await arcClient.getCode({ address: target as `0x${string}` });
        cache.set(target, !!code && code !== '0x');
      } catch {
        cache.set(target, false);
      }
    }
    const isContract = cache.get(target) === true;
    tx.isContractInteraction = isContract;
    if (isContract) tx.contractAddress = tx.to;
  }
}

function extractActivityRows(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  for (const key of ['items', 'activity', 'events', 'transfers', 'rows', 'result']) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function extractAmountRaw(row: any): { raw: bigint; decimals: number } | null {
  const candidates = [
    row?.amount, row?.value, row?.quantity, row?.asset_amount,
    row?.token_amount, row?.money, row?.value_raw, row?.amount_raw
  ];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    try {
      if (typeof candidate === 'object') {
        const raw = candidate.raw ?? candidate.value_raw ?? candidate.value;
        if (raw !== undefined && raw !== null && /^-?\\d+$/.test(String(raw))) {
          return { raw: BigInt(String(raw)), decimals: Number(candidate.decimals ?? row?.decimals ?? 18) };
        }
      } else if (/^-?\\d+$/.test(String(candidate))) {
        return { raw: BigInt(String(candidate)), decimals: Number(row?.decimals ?? 18) };
      }
    } catch {}
  }
  return null;
}

async function fetchUsdcActivityTotals(address: string): Promise<{ received: bigint; sent: bigint } | null> {
  let received = 0n;
  let sent = 0n;
  let cursor: string | undefined;

  try {
    for (let page = 0; page < 500; page++) {
      const url = new URL(`${ARCSCAN_API_BASE}/v1/address/${address}/activity`);
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('cursor', cursor);

      const response = await fetch(url.toString(), {
        headers: { Accept: 'application/json', 'User-Agent': 'GEN-0FI/1.0' },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`Arcscan activity request failed: ${response.status}`);
      const data = await response.json();
      const rows = extractActivityRows(data);

      for (const row of rows) {
        const tokenAddress = String(row?.token?.address || row?.token_address || row?.asset?.address || '').toLowerCase();
        const symbol = String(row?.token?.symbol || row?.asset?.symbol || row?.symbol || '').toUpperCase();
        if (tokenAddress && tokenAddress !== ERC20_USDC_ADDRESS && symbol && symbol !== 'USDC') continue;
        const amount = extractAmountRaw(row);
        if (!amount) continue;

        const from = String(row?.from?.address || row?.from || '').toLowerCase();
        const to = String(row?.to?.address || row?.to || '').toLowerCase();
        const direction = String(row?.direction || row?.kind || row?.flow || '').toLowerCase();
        const isIncoming = direction.includes('in') || direction === 'received' || to === address.toLowerCase();
        const isOutgoing = direction.includes('out') || direction === 'sent' || from === address.toLowerCase();

        let value = amount.raw;
        const decimals = Number.isFinite(amount.decimals) ? amount.decimals : 18;
        if (decimals < 18) value *= 10n ** BigInt(18 - decimals);
        else if (decimals > 18) value /= 10n ** BigInt(decimals - 18);

        if (isIncoming && !isOutgoing) received += value;
        else if (isOutgoing && !isIncoming) sent += value;
      }

      const next = data?.page?.next;
      if (!next || rows.length === 0) return { received, sent };
      cursor = String(next);
    }
    throw new Error('Arcscan activity pagination limit reached');
  } catch (error) {
    console.warn('[ArcService] Arcscan activity totals unavailable:', error);
    return null;
  }
}

function formatUSDC(value: bigint | string): string {
  const formatted = formatUnits(typeof value === 'bigint' ? value : BigInt(value), NATIVE_USDC_DECIMALS);
  const [whole, fraction = ''] = formatted.split('.');
  return fraction ? `${whole}.${fraction.slice(0, 6).padEnd(6, '0')}` : `${whole}.000000`;
}


export const arcClient = createPublicClient({
  chain: arcChain,
  transport: http(process.env.ARC_MAINNET_RPC_URL || ARC_MAINNET_RPC_URL, {
    timeout: 15_000,
    retryCount: 3,
    retryDelay: 1000,
  }),
});

const arcScanClient = createPublicClient({
  chain: arcChain,
  transport: http(ARCSCAN_RPC_URL, {
    timeout: 15_000,
    retryCount: 2,
    retryDelay: 750,
  }),
});

async function fetchAddressTransactions(address: string): Promise<any[]> {
  const items: any[] = [];
  const offset = 100;
  const maxPages = 500;

  for (let page = 1; page <= maxPages; page++) {
    const url = new URL(ARCSCAN_API_BASE);
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'txlist');
    url.searchParams.set('address', address);
    url.searchParams.set('startblock', '0');
    url.searchParams.set('endblock', '999999999');
    url.searchParams.set('page', String(page));
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('apikey', ARCSCAN_API_KEY);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'GEN-0FI/1.0' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Arcscan request failed: ${response.status}`);

    const data = await response.json();
    if (data.status !== '1') {
      const result = typeof data?.result === 'string' ? data.result : '';
      throw new Error(data?.message || result || 'Arcscan transaction query failed');
    }

    const pageItems = Array.isArray(data.result) ? data.result : [];
    items.push(...pageItems);
    if (pageItems.length < offset) return items;
  }

  throw new Error('Arcscan transaction history exceeded the pagination safety limit');
}

function toRawTransaction(tx: any): RawTxInput {
  const gasUsed = tx.gasUsed !== undefined && tx.gasUsed !== '' ? BigInt(tx.gasUsed) : undefined;
  const gasPrice = tx.gasPrice !== undefined && tx.gasPrice !== '' ? BigInt(tx.gasPrice) : undefined;
  const fee = gasUsed !== undefined && gasPrice !== undefined ? gasUsed * gasPrice : undefined;

  return {
    hash: tx.hash,
    blockNumber: BigInt(tx.blockNumber || '0'),
    from: tx.from || '',
    to: tx.to || null,
    value: BigInt(tx.value || '0'),
    fee,
    gas: tx.gas !== undefined && tx.gas !== '' ? BigInt(tx.gas) : undefined,
    gasPrice,
    gasUsed,
    input: tx.input || (tx.methodId && tx.methodId !== '0x00000000' ? tx.methodId : '0x'),
    methodId: tx.methodId || '',
    functionName: tx.functionName || '',
    timestamp: tx.timeStamp ? Number(tx.timeStamp) * 1000 : undefined,
    status: tx.isError === '0' || tx.txreceipt_status === '1' ? 1 : tx.isError === '1' || tx.txreceipt_status === '0' ? 0 : undefined,
    contractAddress: tx.contractAddress || null,
  };
}

/**
 * Live Arc Mainnet native USDC balance.
 * Primary source is the configured Arc Mainnet RPC. Arcscan's public RPC is the
 * independent read-only fallback so a single RPC outage does not turn a verified
 * onchain balance into "Unavailable".
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
    console.warn('[ArcService] Primary Arc Mainnet RPC balance failed:', error);
  }

  try {
    const balanceWei = await arcScanClient.getBalance({ address: address as `0x${string}` });
    return {
      formatted: formatUSDC(balanceWei),
      raw: balanceWei.toString(),
      isVerified: true,
    };
  } catch (error) {
    console.warn('[ArcService] Arcscan RPC balance fallback failed:', error);
  }

  try {
    const url = new URL(ARCSCAN_API_BASE);
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'balance');
    url.searchParams.set('address', address);
    url.searchParams.set('apikey', ARCSCAN_API_KEY);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'GEN-0FI/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    const data = await response.json();
    if (response.ok && data?.status === '1' && typeof data.result === 'string') {
      const raw = BigInt(data.result);
      return {
        formatted: formatUSDC(raw),
        raw: raw.toString(),
        isVerified: true,
      };
    }
    throw new Error(typeof data?.result === 'string' ? data.result : 'Arcscan balance query failed');
  } catch (error) {
    console.warn('[ArcService] Arcscan indexed balance fallback failed:', error);
    return { formatted: 'Unavailable', raw: '0', isVerified: false };
  }
}

/**
 * Complete indexed Arc Mainnet history. Arcscan indexes mainnet from block 0.
 * Recent activity is returned to the UI, while lifetime totals are computed
 * from all indexed address transactions.
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
    const rawTransactions = await fetchAddressTransactions(address);
    const transactions = rawTransactions
      .filter((tx: any) => tx?.hash)
      .map((tx: any) => normalizeTransaction(toRawTransaction(tx), address))
      .sort((a, b) => b.timestamp - a.timestamp);

    await markContractTargets(transactions);
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

  const activityTotals = txResult.isUnavailable ? null : await fetchUsdcActivityTotals(address);
  const summary = computeWalletSummary(
    address,
    balanceResult.formatted,
    txResult.lifetimeTransactions,
    txResult.isUnavailable
  );

  return {
    walletAddress: address,
    currentBalance: summary.balanceUSDC,
    totalReceived: txResult.isUnavailable ? 'Unavailable' : activityTotals ? formatUSDC(activityTotals.received) : summary.totalReceivedUSDC,
    totalSent: txResult.isUnavailable ? 'Unavailable' : activityTotals ? formatUSDC(activityTotals.sent) : summary.totalSentUSDC,
    totalGasSpent: summary.gasSpentUSDC,
    totalTransactions: summary.txCount,
    contractInteractions: summary.contractInteractionsCount,
    recentTransactions: txResult.transactions,
    historyStatus: txResult.historyStatus,
    historyStatusNote: txResult.historyStatusNote,
  };
}
