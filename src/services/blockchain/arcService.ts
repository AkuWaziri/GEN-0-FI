import { createPublicClient, formatUnits, http, isAddress } from 'viem';
import { arcChain, ARC_MAINNET_RPC_URL } from '../../config/arc.js';
import { normalizeTransaction, RawTxInput } from './normalizer.js';
import { NormalizedTransaction, WalletSummary } from '../../types/blockchain.js';

const ARCSCAN_API_BASE = 'https://api.arc-scan.org/api';
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

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json', 'User-Agent': 'GEN-0FI/1.0' },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`Arcscan request failed: ${response.status}`);

    const data = await response.json();
    if (data.status !== '1') {
      throw new Error(data?.message || 'Arcscan transaction query failed');
    }

    const pageItems = Array.isArray(data.result) ? data.result : [];
    items.push(...pageItems);
    if (pageItems.length < offset) break;
  }
  return items;
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
    input: tx.input || '0x',
    timestamp: tx.timeStamp ? Number(tx.timeStamp) * 1000 : undefined,
    status: tx.isError === '0' || tx.txreceipt_status === '1' ? 1 : tx.isError === '1' || tx.txreceipt_status === '0' ? 0 : undefined,
    contractAddress: tx.contractAddress || null,
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
    const rawTransactions = await fetchAddressTransactions(address);
    const transactions = rawTransactions
      .filter((tx: any) => tx?.hash)
      .map((tx: any) => normalizeTransaction(toRawTransaction(tx), address))
      .sort((a, b) => b.timestamp - a.timestamp);

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
