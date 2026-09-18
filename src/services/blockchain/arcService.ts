import { createPublicClient, formatUnits, http, isAddress } from 'viem';
import { arcChain, ARC_MAINNET_RPC_URL } from '../../config/arc.js';
import { normalizeTransaction, RawTxInput } from './normalizer.js';
import { NormalizedTransaction, WalletSummary } from '../../types/blockchain.js';

const ARCSCAN_API_BASE = 'https://api.arc-scan.org/api';
const ARCSCAN_V1_BASE = 'https://api.arc-scan.org/v1';
const ARCSCAN_API_KEY = process.env.ARCSCAN_API_KEY || 'YourApiKeyToken';
const ARCSCAN_RPC_URL = 'https://rpc.arc-scan.org';
const NATIVE_DECIMALS = 18;
const ERC20_USDC = '0x3600000000000000000000000000000000000000'.toLowerCase();
const CACHE_TTL = 30_000;

const txCache = new Map<string, {
  transactions: NormalizedTransaction[];
  historyStatus: 'complete' | 'unavailable';
  timestamp: number;
}>();

export const arcClient = createPublicClient({
  chain: arcChain,
  transport: http(process.env.ARC_MAINNET_RPC_URL || ARC_MAINNET_RPC_URL, {
    timeout: 15_000,
    retryCount: 2,
    retryDelay: 500,
  }),
});

const arcScanClient = createPublicClient({
  chain: arcChain,
  transport: http(ARCSCAN_RPC_URL, {
    timeout: 15_000,
    retryCount: 1,
    retryDelay: 500,
  }),
});

function formatUSDC(raw: bigint): string {
  const value = Number(formatUnits(raw, NATIVE_DECIMALS));
  if (!Number.isFinite(value)) return 'Unavailable';
  return value.toFixed(6);
}

function requestHeaders(): HeadersInit {
  return {
    Accept: 'application/json',
    'User-Agent': 'GEN-0FI/1.0',
  };
}

async function fetchJson(url: string, timeoutMs = 15_000): Promise<any> {
  const response = await fetch(url, {
    headers: requestHeaders(),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`Arcscan HTTP ${response.status}`);
  return response.json();
}

async function fetchAddressTransactions(address: string): Promise<any[]> {
  const all: any[] = [];
  const offset = 100;

  for (let page = 1; page <= 500; page++) {
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

    const data = await fetchJson(url.toString());
    if (data?.status !== '1') {
      const message = typeof data?.result === 'string' ? data.result : data?.message;
      if (page === 1 && /no transactions/i.test(String(message || ''))) return [];
      throw new Error(String(message || 'Arcscan transaction query failed'));
    }

    const rows = Array.isArray(data.result) ? data.result : [];
    all.push(...rows);
    if (rows.length < offset) break;
  }

  return all;
}

function toRawTransaction(tx: any): RawTxInput {
  const gasUsed = tx.gasUsed !== undefined && tx.gasUsed !== '' ? BigInt(tx.gasUsed) : undefined;
  const gasPrice = tx.gasPrice !== undefined && tx.gasPrice !== '' ? BigInt(tx.gasPrice) : undefined;
  const fee = gasUsed !== undefined && gasPrice !== undefined ? gasUsed * gasPrice : undefined;

  return {
    hash: String(tx.hash || ''),
    blockNumber: BigInt(tx.blockNumber || '0'),
    from: String(tx.from || ''),
    to: tx.to ? String(tx.to) : null,
    value: BigInt(tx.value || '0'),
    fee,
    gas: tx.gas ? BigInt(tx.gas) : undefined,
    gasPrice,
    gasUsed,
    input: tx.input || '0x',
    methodId: tx.methodId || '',
    functionName: tx.functionName || '',
    timestamp: tx.timeStamp ? Number(tx.timeStamp) * 1000 : 0,
    status: tx.isError === '1' || tx.txreceipt_status === '0' ? 0 : tx.isError === '0' || tx.txreceipt_status === '1' ? 1 : undefined,
    contractAddress: tx.contractAddress || null,
  };
}

async function resolveContractTargets(rawTransactions: RawTxInput[]): Promise<RawTxInput[]> {
  const uniqueTargets = [...new Set(
    rawTransactions
      .map(tx => tx.to?.toLowerCase())
      .filter((x): x is string => Boolean(x))
  )];

  const contractMap = new Map<string, boolean>();

  // Keep RPC pressure predictable while still resolving targets quickly.
  for (let i = 0; i < uniqueTargets.length; i += 20) {
    const batch = uniqueTargets.slice(i, i + 20);
    const results = await Promise.all(batch.map(async target => {
      try {
        const code = await arcClient.getCode({ address: target as `0x${string}` });
        return [target, Boolean(code && code !== '0x')] as const;
      } catch {
        try {
          const code = await arcScanClient.getCode({ address: target as `0x${string}` });
          return [target, Boolean(code && code !== '0x')] as const;
        } catch {
          return [target, false] as const;
        }
      }
    }));
    for (const [target, isContract] of results) contractMap.set(target, isContract);
  }

  return rawTransactions.map(tx => ({
    ...tx,
    isContractTarget: Boolean(
      (!tx.to && tx.contractAddress) ||
      (tx.to && contractMap.get(tx.to.toLowerCase()))
    ),
  }));
}

async function loadNormalizedHistory(address: string): Promise<NormalizedTransaction[]> {
  const raw = await fetchAddressTransactions(address);
  const usable = raw.filter(tx => tx?.hash).map(toRawTransaction);
  const resolved = await resolveContractTargets(usable);

  return resolved
    .map(tx => normalizeTransaction(tx, address))
    .sort((a, b) => b.timestamp - a.timestamp);
}

function to18Decimals(raw: string | number | bigint, decimals = 18): bigint {
  const value = BigInt(raw);
  if (decimals === 18) return value;
  if (decimals < 18) return value * 10n ** BigInt(18 - decimals);
  return value / 10n ** BigInt(decimals - 18);
}

async function fetchActivityTotals(address: string): Promise<{ received: bigint; sent: bigint }> {
  const target = address.toLowerCase();
  let received = 0n;
  let sent = 0n;
  let cursor = '';

  for (let page = 0; page < 500; page++) {
    const url = new URL(`${ARCSCAN_V1_BASE}/address/${address}/activity`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const data = await fetchJson(url.toString());
    const rows = Array.isArray(data?.items) ? data.items : Array.isArray(data?.activity) ? data.activity : Array.isArray(data?.result) ? data.result : [];
    for (const row of rows) {
      const from = addressOf(row?.from);
      const to = addressOf(row?.to);
      const direction = String(row?.direction || row?.flow || '').toLowerCase();

      let raw: bigint | null = null;
      let decimals = 18;

      const raw18 = row?.value_18dec ?? row?.amount_18dec;
      if (raw18 !== undefined && /^-?\\d+$/.test(String(raw18))) {
        raw = BigInt(String(raw18));
        decimals = 18;
      } else {
        const candidate = row?.value_raw ?? row?.amount_raw ?? row?.value ?? row?.amount ?? row?.quantity;
        if (candidate !== undefined && candidate !== null && /^-?\\d+$/.test(String(candidate))) {
          raw = BigInt(String(candidate));
          decimals = Number(row?.decimals ?? row?.token?.decimals ?? row?.asset?.decimals ?? 18);
        }
      }

      if (raw === null) continue;

      const incoming = to === target || direction === 'in' || direction === 'incoming' || direction === 'received';
      const outgoing = from === target || direction === 'out' || direction === 'outgoing' || direction === 'sent';
      if (incoming === outgoing) continue;

      const normalized = to18Decimals(raw, decimals);
      if (incoming) received += normalized;
      else if (outgoing) sent += normalized;
    }

    const next = data?.page?.next;
    if (!next || rows.length === 0) break;
    cursor = String(next);
  }

  return { received, sent };
}

async function fetchGasAndValueFallback(address: string, transactions: NormalizedTransaction[]): Promise<{ received: bigint; sent: bigint; gas: bigint }> {
  let received = 0n;
  let sent = 0n;
  let gas = 0n;

  for (const tx of transactions) {
    try {
      gas += BigInt(Math.round(Number(tx.gasCostUSDC || '0') * 1e18));
      const value = BigInt(tx.rawValue || '0');
      if (tx.direction === 'received') received += value;
      if (tx.direction === 'sent') sent += value;
    } catch {}
  }

  return { received, sent, gas };
}

export async function fetchBalanceFromArcRpc(address: string): Promise<{ formatted: string; raw: string; isVerified: boolean }> {
  if (!address || !isAddress(address, { strict: false })) {
    return { formatted: 'Unavailable', raw: '0', isVerified: false };
  }

  for (const client of [arcClient, arcScanClient]) {
    try {
      const raw = await client.getBalance({ address: address as `0x${string}` });
      return { formatted: formatUSDC(raw), raw: raw.toString(), isVerified: true };
    } catch (error) {
      console.warn('[GEN-0FI] balance source failed:', error);
    }
  }

  try {
    const url = new URL(ARCSCAN_API_BASE);
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'balance');
    url.searchParams.set('address', address);
    url.searchParams.set('apikey', ARCSCAN_API_KEY);
    const data = await fetchJson(url.toString(), 10_000);
    if (data?.status === '1' && typeof data.result === 'string') {
      const raw = BigInt(data.result);
      return { formatted: formatUSDC(raw), raw: raw.toString(), isVerified: true };
    }
  } catch (error) {
    console.warn('[GEN-0FI] indexed balance source failed:', error);
  }

  return { formatted: 'Unavailable', raw: '0', isVerified: false };
}

export async function fetchTransactionsForAddress(
  address: string,
  limit = 50
): Promise<{
  transactions: NormalizedTransaction[];
  lifetimeTransactions: NormalizedTransaction[];
  isUnavailable: boolean;
  historyStatus: 'complete' | 'unavailable';
}> {
  if (!address || !isAddress(address, { strict: false })) {
    return { transactions: [], lifetimeTransactions: [], isUnavailable: true, historyStatus: 'unavailable' };
  }

  const key = address.toLowerCase();
  const cached = txCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return {
      transactions: cached.transactions.slice(0, limit),
      lifetimeTransactions: cached.transactions,
      isUnavailable: cached.historyStatus === 'unavailable',
      historyStatus: cached.historyStatus,
    };
  }

  try {
    const transactions = await loadNormalizedHistory(address);
    txCache.set(key, { transactions, historyStatus: 'complete', timestamp: Date.now() });
    return {
      transactions: transactions.slice(0, limit),
      lifetimeTransactions: transactions,
      isUnavailable: false,
      historyStatus: 'complete',
    };
  } catch (error) {
    console.error('[GEN-0FI] Arc history failed:', error);
    txCache.set(key, { transactions: [], historyStatus: 'unavailable', timestamp: Date.now() });
    return { transactions: [], lifetimeTransactions: [], isUnavailable: true, historyStatus: 'unavailable' };
  }
}

export function computeWalletSummary(
  address: string,
  balanceFormatted: string,
  transactions: NormalizedTransaction[],
  isHistoryUnavailable: boolean,
  transferTotals?: { received: bigint; sent: bigint }
): WalletSummary {
  let received = transferTotals?.received ?? 0n;
  let sent = transferTotals?.sent ?? 0n;
  let gas = 0n;
  let contracts = 0;
  const counterparties = new Set<string>();
  let incomingCount = 0;
  let outgoingCount = 0;

  if (!transferTotals) {
    for (const tx of transactions) {
      try {
        const value = BigInt(tx.rawValue || '0');
        if (tx.direction === 'received') {
          received += value;
          incomingCount++;
        } else if (tx.direction === 'sent') {
          sent += value;
          outgoingCount++;
        }
      } catch {}
    }
  }

  for (const tx of transactions) {
    try {
      if (tx.gasCostUSDC !== 'Unavailable') gas += BigInt(Math.round(Number(tx.gasCostUSDC) * 1e18));
    } catch {}
    if (tx.isContractInteraction) contracts++;
    if (tx.from) counterparties.add(tx.from.toLowerCase());
    if (tx.to) counterparties.add(tx.to.toLowerCase());
  }

  const historyStatus = isHistoryUnavailable ? 'unavailable' : 'complete';

  return {
    address,
    balanceUSDC: balanceFormatted,
    rawBalance: balanceFormatted,
    totalReceivedUSDC: isHistoryUnavailable ? 'Unavailable' : formatUSDC(received),
    receivedTotalUSDC: isHistoryUnavailable ? 'Unavailable' : formatUSDC(received),
    totalSentUSDC: isHistoryUnavailable ? 'Unavailable' : formatUSDC(sent),
    sentTotalUSDC: isHistoryUnavailable ? 'Unavailable' : formatUSDC(sent),
    txCount: transactions.length,
    scannedTxCount: transactions.length,
    gasSpentUSDC: isHistoryUnavailable ? 'Unavailable' : formatUSDC(gas),
    contractInteractionsCount: contracts,
    activeContractsCount: contracts,
    uniqueCounterpartiesCount: counterparties.size,
    isDataAvailable: !isHistoryUnavailable,
    historyStatus,
    historyStatusNote: isHistoryUnavailable
      ? 'Arc Mainnet indexed history is unavailable. No lifetime activity values are inferred.'
      : 'Lifetime Arc Mainnet transaction history was retrieved from Arcscan.',
    incomingTransfersCount: incomingCount,
    outgoingTransfersCount: outgoingCount,
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
  historyStatus: 'complete' | 'unavailable';
  historyStatusNote: string;
}

export async function fetchCompleteWalletState(address: string): Promise<CompleteWalletState> {
  const [balance, history] = await Promise.all([
    fetchBalanceFromArcRpc(address),
    fetchTransactionsForAddress(address, 50),
  ]);

  if (history.isUnavailable) {
    return {
      walletAddress: address,
      currentBalance: balance.formatted,
      totalReceived: 'Unavailable',
      totalSent: 'Unavailable',
      totalGasSpent: 'Unavailable',
      totalTransactions: 0,
      contractInteractions: 0,
      recentTransactions: [],
      historyStatus: 'unavailable',
      historyStatusNote: 'Arc Mainnet indexed history is unavailable. Live balance remains independently verified when available.',
    };
  }

  let transferTotals: { received: bigint; sent: bigint } | null = null;
  try {
    transferTotals = await fetchActivityTotals(address);
  } catch (error) {
    console.warn('[GEN-0FI] Arc activity totals unavailable:', error);
  }

  const summary = computeWalletSummary(
    address,
    balance.formatted,
    history.lifetimeTransactions,
    false,
    transferTotals ?? undefined
  );

  return {
    walletAddress: address,
    currentBalance: summary.balanceUSDC,
    totalReceived: transferTotals ? summary.totalReceivedUSDC : 'Unavailable',
    totalSent: transferTotals ? summary.totalSentUSDC : 'Unavailable',
    totalGasSpent: summary.gasSpentUSDC,
    totalTransactions: summary.txCount,
    contractInteractions: summary.contractInteractionsCount,
    recentTransactions: history.transactions,
    historyStatus: 'complete',
    historyStatusNote: summary.historyStatusNote || '',
  };
}
