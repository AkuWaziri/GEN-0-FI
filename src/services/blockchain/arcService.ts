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
  try {
    const exact = formatUnits(raw, NATIVE_DECIMALS);
    const [whole, fraction = ''] = exact.split('.');
    return `${whole}.${(fraction + '000000').slice(0, 6)}`;
  } catch {
    return 'Unavailable';
  }
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
  // Arcscan's typed address transaction index is the canonical mainnet source.
  // It is cursor-paginated and includes the complete address history from block 0.
  const all: any[] = [];
  let cursor = '';

  for (let page = 0; page < 500; page++) {
    const url = new URL(ARCSCAN_V1_BASE + '/address/' + address + '/txs');
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const data = await fetchJson(url.toString());
    const rows = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.transactions)
        ? data.transactions
        : Array.isArray(data?.result)
          ? data.result
          : [];

    all.push(...rows);

    const next = data?.page?.next ?? data?.next_cursor ?? data?.nextCursor;
    if (!next || rows.length === 0) break;
    cursor = String(next);
  }

  if (all.length > 0) return all;

  // Compatibility fallback. Arcscan documents the Etherscan-shaped txlist
  // endpoint as equivalent to the typed address transaction index.
  const legacy: any[] = [];
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
    legacy.push(...rows);
    if (rows.length < offset) break;
  }

  return legacy;
}
function toRawTransaction(tx: any): RawTxInput {
  const blockNumberValue = tx.blockNumber ?? tx.block_number ?? '0';
  const timestampValue = tx.timeStamp ?? tx.timestamp ?? tx.block_timestamp;
  const gasUsedValue = tx.gasUsed ?? tx.gas_used;
  const gasPriceValue = tx.gasPrice ?? tx.gas_price ?? tx.effective_gas_price_raw;
  const rawValueValue = tx.rawValue ?? tx.value_18dec ?? tx.value_raw ?? tx.value ?? '0';
  const feeValue = tx.fee_18dec ?? tx.fee_raw;
  const gasUsed = gasUsedValue !== undefined && gasUsedValue !== '' ? BigInt(gasUsedValue) : undefined;
  const gasPrice = gasPriceValue !== undefined && gasPriceValue !== '' ? BigInt(gasPriceValue) : undefined;
  const fee = feeValue !== undefined && feeValue !== ''
    ? BigInt(feeValue)
    : gasUsed !== undefined && gasPrice !== undefined
      ? gasUsed * gasPrice
      : undefined;

  const statusValue = tx.status ?? tx.tx_status ?? tx.execution_status;
  const legacyStatus = tx.isError === '1' || tx.txreceipt_status === '0'
    ? 0
    : tx.isError === '0' || tx.txreceipt_status === '1'
      ? 1
      : undefined;
  const status = typeof statusValue === 'string'
    ? (['success', '1', '0x1'].includes(statusValue.toLowerCase()) ? 1 : ['failed', 'fail', '0', '0x0'].includes(statusValue.toLowerCase()) ? 0 : undefined)
    : typeof statusValue === 'number'
      ? (statusValue === 1 ? 1 : statusValue === 0 ? 0 : undefined)
      : legacyStatus;

  return {
    hash: String(tx.hash ?? tx.tx_hash ?? ''),
    blockNumber: BigInt(blockNumberValue),
    from: String(tx.from ?? ''),
    to: tx.to ? String(tx.to) : null,
    value: BigInt(rawValueValue),
    fee,
    gas: tx.gas ? BigInt(tx.gas) : tx.gas_limit ? BigInt(tx.gas_limit) : undefined,
    gasPrice,
    gasUsed,
    input: tx.input || '0x',
    methodId: tx.methodId ?? tx.method_id ?? '',
    functionName: tx.functionName ?? tx.function_name ?? '',
    timestamp: timestampValue ? (Number(timestampValue) > 1e12 ? Number(timestampValue) : Number(timestampValue) * 1000) : 0,
    status,
    contractAddress: tx.contractAddress ?? tx.created_contract ?? null,
  };
}

async function resolveContractTargets(rawTransactions: RawTxInput[], userAddress: string): Promise<RawTxInput[]> {
  // A contract interaction must be a transaction sent by this wallet to
  // contract bytecode that existed at that exact transaction block.
  const user = userAddress.toLowerCase();
  const candidates = rawTransactions.filter(
    tx => Boolean(tx.to) && tx.from.toLowerCase() === user
  );

  // Resolve each transaction independently. A destination can change from an
  // EOA to a contract later, so a single address-level result is not enough.
  // If historical code cannot be verified, leave the result unknown rather
  // than falling back to latest state and risking a false positive.
  const contractMap = new Map<string, boolean>();
  const unknown = new Set<string>();

  for (let i = 0; i < candidates.length; i += 20) {
    const batch = candidates.slice(i, i + 20);
    const results = await Promise.all(batch.map(async tx => {
      const txHash = tx.hash.toLowerCase();

      for (const client of [arcClient, arcScanClient]) {
        try {
          const code = await client.getCode({
            address: tx.to as `0x${string}`,
            blockNumber: tx.blockNumber as bigint,
          });
          return [txHash, Boolean(code && code !== '0x')] as const;
        } catch {}
      }

      return [txHash, null] as const;
    }));

    for (const [txHash, isContract] of results) {
      if (isContract === null) unknown.add(txHash);
      else contractMap.set(txHash, isContract);
    }
  }

  return rawTransactions.map(tx => ({
    ...tx,
    isContractTarget: Boolean(
      (!tx.to && tx.contractAddress) ||
      (tx.to &&
        tx.from.toLowerCase() === user &&
        contractMap.get(tx.hash.toLowerCase()) === true)
    ),
  }));
}

async function loadNormalizedHistory(address: string): Promise<NormalizedTransaction[]> {
  const raw = await fetchAddressTransactions(address);
  const usable = raw.filter(tx => tx?.hash).map(toRawTransaction);
  const resolved = await resolveContractTargets(usable, address);

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

function addressOf(value: any): string | null {
  if (!value) return null;
  const candidate = typeof value === 'string'
    ? value
    : value.address ?? value.checksum ?? value.value ?? value.from ?? value.to;
  if (typeof candidate !== 'string') return null;
  const normalized = candidate.toLowerCase();
  return /^0x[a-f0-9]{40}$/.test(normalized) ? normalized : null;
}

function parseArcAmount(value: any, fallbackDecimals = 18): { raw: bigint; decimals: number } | null {
  if (value === undefined || value === null) return null;

  // Arcscan typed REST returns amounts as objects:
  // { raw: "…", decimals: 18, formatted: "…" }.
  if (typeof value === 'object') {
    const rawValue = value.raw ?? value.value_raw ?? value.amount_raw;
    if (rawValue !== undefined && /^-?\d+$/.test(String(rawValue))) {
      const decimals = Number(value.decimals ?? fallbackDecimals);
      return { raw: BigInt(String(rawValue)), decimals: Number.isFinite(decimals) ? decimals : fallbackDecimals };
    }
    const nested = value.amount ?? value.value ?? value.quantity;
    if (nested !== undefined && nested !== value) {
      return parseArcAmount(nested, Number(value.decimals ?? fallbackDecimals));
    }
    return null;
  }

  if (/^-?\d+$/.test(String(value))) {
    return { raw: BigInt(String(value)), decimals: fallbackDecimals };
  }

  // Some Arcscan value fields are already formatted decimal strings
  // (for example "12.345678"). Convert them exactly to the declared scale
  // without passing through JavaScript Number.
  const decimal = String(value).trim();
  if (/^-?\d+(?:\.\d+)?$/.test(decimal)) {
    const negative = decimal.startsWith('-');
    const unsigned = negative ? decimal.slice(1) : decimal;
    const [whole, fraction = ''] = unsigned.split('.');
    const scale = Math.max(0, fallbackDecimals);
    const padded = (fraction + '0'.repeat(scale)).slice(0, scale);
    const raw = BigInt(whole || '0') * 10n ** BigInt(scale) + BigInt(padded || '0');
    return { raw: negative ? -raw : raw, decimals: scale };
  }

  return null;
}

function activityTokenAddress(row: any): string | null {
  const candidates = [
    row?.token_address,
    row?.tokenAddress,
    row?.token?.address,
    row?.token?.contract_address,
    row?.asset?.address,
    row?.asset?.contract_address,
    row?.contract_address,
    row?.contractAddress,
  ];
  for (const value of candidates) {
    const address = addressOf(value);
    if (address) return address;
  }
  return null;
}

function activitySymbol(row: any): string | null {
  const candidates = [
    row?.symbol,
    row?.token?.symbol,
    row?.asset?.symbol,
    row?.token_symbol,
    row?.asset_symbol,
  ];
  for (const value of candidates) {
    if (typeof value === 'string' && value.trim()) return value.trim().toUpperCase();
  }
  return null;
}

function isSuccessfulActivityRow(row: any): boolean {
  const status = String(
    row?.status ??
    row?.tx_status ??
    row?.transaction_status ??
    row?.execution_status ??
    ''
  ).toLowerCase();

  if (!status) return true;
  return !['0', '0x0', 'false', 'failed', 'fail', 'reverted', 'error'].includes(status);
}

function isTransferLikeActivityRow(row: any): boolean {
  const kind = String(
    row?.kind ??
    row?.type ??
    row?.category ??
    row?.activity_type ??
    row?.event_type ??
    ''
  ).toLowerCase();

  if (!kind) return true;
  return /transfer|movement|value|internal|received|sent|native|usdc/.test(kind);
}

async function fetchActivityTotals(address: string, fallbackTransactions: NormalizedTransaction[] = []): Promise<{ received: bigint; sent: bigint }> {
  const target = address.toLowerCase();
  let received = 0n;
  let sent = 0n;
  let cursor = '';
  const seenMovements = new Set<string>();
  let activityRows = 0;

  // Arcscan's typed activity feed is the preferred source for merged native/ERC-20
  // value flow. It is currently public and does not require an API key.
  for (let page = 0; page < 500; page++) {
    const url = new URL(`${ARCSCAN_V1_BASE}/address/${address}/activity`);
    url.searchParams.set('limit', '100');
    if (cursor) url.searchParams.set('cursor', cursor);

    const data = await fetchJson(url.toString());
    const rows = Array.isArray(data?.items)
      ? data.items
      : Array.isArray(data?.activity)
        ? data.activity
        : Array.isArray(data?.result)
          ? data.result
          : [];

    activityRows += rows.length;

    for (const row of rows) {
      if (!isSuccessfulActivityRow(row) || !isTransferLikeActivityRow(row)) continue;

      const tokenAddress = activityTokenAddress(row);
      const symbol = activitySymbol(row);
      if (tokenAddress && tokenAddress !== ERC20_USDC) continue;
      if (symbol && symbol !== 'USDC') continue;

      const from = addressOf(row?.from);
      const to = addressOf(row?.to);
      const direction = String(row?.direction || row?.flow || '').toLowerCase();

      const explicitNativeAmount =
        parseArcAmount(row?.value_18dec, 18) ||
        parseArcAmount(row?.amount_18dec, 18);

      const amount = explicitNativeAmount ||
        parseArcAmount(row?.value, Number(row?.decimals ?? row?.token?.decimals ?? row?.asset?.decimals ?? 18)) ||
        parseArcAmount(row?.amount, Number(row?.decimals ?? row?.token?.decimals ?? row?.asset?.decimals ?? 18)) ||
        parseArcAmount(row?.quantity, Number(row?.decimals ?? row?.token?.decimals ?? row?.asset?.decimals ?? 18)) ||
        parseArcAmount(row?.value_raw, 18) ||
        parseArcAmount(row?.amount_raw, 18);

      if (!amount) continue;

      const incoming =
        to === target ||
        direction === 'in' ||
        direction === 'incoming' ||
        direction === 'received';

      const outgoing =
        from === target ||
        direction === 'out' ||
        direction === 'outgoing' ||
        direction === 'sent';

      if (incoming === outgoing) continue;

      const normalized = to18Decimals(amount.raw, amount.decimals);
      if (normalized <= 0n) continue;

      const txHash = String(
        row?.tx_hash ||
        row?.txHash ||
        row?.hash ||
        row?.transaction_hash ||
        ''
      ).toLowerCase();

      const movementId = [
        txHash,
        from || '',
        to || '',
        incoming ? 'in' : 'out',
        normalized.toString(),
      ].join(':');

      if (seenMovements.has(movementId)) continue;
      seenMovements.add(movementId);

      if (incoming) received += normalized;
      else sent += normalized;
    }

    const next = data?.page?.next ?? data?.next_cursor ?? data?.nextCursor;
    if (!next || rows.length === 0) break;
    cursor = String(next);
  }

  // If the typed activity stream returns no rows, fall back to Arcscan's
  // Etherscan-compatible USDC transfer feed plus the already-indexed native
  // transaction list. This prevents a temporary activity-feed gap from
  // turning verified wallet totals into "Unavailable".
  if (activityRows === 0) {
    received = 0n;
    sent = 0n;
    seenMovements.clear();

    for (const tx of fallbackTransactions) {
      if (tx.status !== 'success') continue;
      const value = BigInt(tx.rawValue || '0');
      if (value <= 0n) continue;

      const from = addressOf(tx.from);
      const to = addressOf(tx.to);
      const incoming = to === target && from !== target;
      const outgoing = from === target;
      if (incoming === outgoing) continue;

      const movementId = [tx.hash.toLowerCase(), from || '', to || '', incoming ? 'in' : 'out', value.toString()].join(':');
      if (seenMovements.has(movementId)) continue;
      seenMovements.add(movementId);

      if (incoming) received += value;
      else sent += value;
    }

    try {
      const url = new URL(ARCSCAN_API_BASE);
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'tokentx');
      url.searchParams.set('address', address);
      url.searchParams.set('contractaddress', ERC20_USDC);
      url.searchParams.set('startblock', '0');
      url.searchParams.set('endblock', '999999999');
      url.searchParams.set('page', '1');
      url.searchParams.set('offset', '10000');
      url.searchParams.set('sort', 'desc');
      url.searchParams.set('apikey', ARCSCAN_API_KEY);

      const data = await fetchJson(url.toString());
      const rows = Array.isArray(data?.result) ? data.result : [];

      for (const row of rows) {
        if (row?.isError === '1' || row?.txreceipt_status === '0') continue;
        const from = addressOf(row?.from);
        const to = addressOf(row?.to);
        const incoming = to === target && from !== target;
        const outgoing = from === target;
        if (incoming === outgoing) continue;

        const decimals = Number(row?.tokenDecimal ?? 6);
        const raw = parseArcAmount(row?.value, decimals);
        if (!raw) continue;
        const normalized = to18Decimals(raw.raw, raw.decimals);
        if (normalized <= 0n) continue;

        const movementId = [
          String(row?.hash || '').toLowerCase(),
          from || '',
          to || '',
          incoming ? 'in' : 'out',
          normalized.toString(),
        ].join(':');

        if (seenMovements.has(movementId)) continue;
        seenMovements.add(movementId);

        if (incoming) received += normalized;
        else sent += normalized;
      }
    } catch (error) {
      console.warn('[GEN-0FI] Arcscan USDC transfer fallback unavailable:', error);
    }
  }

  if (activityRows === 0 && received === 0n && sent === 0n && fallbackTransactions.length === 0) {
    throw new Error('Arcscan activity returned no rows');
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

export async function fetchWalletAssetSummary(address: string): Promise<{
  tokenHoldings: number;
  coinHoldings: number;
  nftHoldings: number;
  fungibleHoldings: number;
  historyStatus: 'complete' | 'unavailable';
}> {
  if (!address || !isAddress(address, { strict: false })) {
    return { tokenHoldings: 0, coinHoldings: 0, nftHoldings: 0, fungibleHoldings: 0, historyStatus: 'unavailable' };
  }

  const url = ARCSCAN_V1_BASE + '/address/' + address + '/tokens';
  const data = await fetchJson(url);
  const rows = Array.isArray(data?.items)
    ? data.items
    : Array.isArray(data?.tokens)
      ? data.tokens
      : Array.isArray(data?.result)
        ? data.result
        : [];

  if (!Array.isArray(rows)) {
    throw new Error('Arcscan token holdings unavailable');
  }

  let coinHoldings = 0;
  let nftHoldings = 0;

  for (const row of rows) {
    const standard = String(
      row?.standard ??
      row?.token_standard ??
      row?.type ??
      row?.token?.standard ??
      ''
    ).toUpperCase();

    if (standard === 'ERC-721' || standard === 'ERC721' || standard === 'ERC-1155' || standard === 'ERC1155') {
      nftHoldings++;
    } else if (standard === 'ERC-20' || standard === 'ERC20') {
      const balance = row?.balance ?? row?.amount ?? row?.quantity ?? row?.raw_balance;
      if (balance !== undefined && balance !== null && String(balance) !== '0') {
        coinHoldings++;
      } else if (balance === undefined || balance === null) {
        coinHoldings++;
      }
    }
  }

  // Arc's native USDC is the wallet's primary coin holding. It is not
  // returned by the token-holdings endpoint because the native balance and
  // ERC-20 USDC face are the same underlying asset. Count it exactly once.
  let nativeCoinCount = 0;
  try {
    const { raw } = await fetchBalanceFromArcRpc(address);
    if (BigInt(raw) > 0n) nativeCoinCount = 1;
  } catch {}

  return {
    tokenHoldings: coinHoldings + nftHoldings + nativeCoinCount,
    coinHoldings: coinHoldings + nativeCoinCount,
    nftHoldings,
    fungibleHoldings: coinHoldings + nativeCoinCount,
    historyStatus: 'complete',
  };
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
    // A contract interaction is a successful top-level transaction initiated by
    // this wallet whose destination was contract bytecode at that block.
    // Contract creation is tracked as a transaction, but is not an interaction
    // with an existing contract.
    if (tx.isContractInteraction && tx.status === 'success') contracts++;
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
      : 'Lifetime Arc Mainnet indexed transaction history was retrieved from Arcscan; received/sent totals are calculated from USDC value-flow records only.',
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

  // Prefer Arcscan's merged activity because txlist.value only contains
  // top-level native value. ERC-20 USDC transfers commonly have txlist.value=0.
  // fetchActivityTotals de-duplicates the merged movement representations.
  let transferTotals: { received: bigint; sent: bigint };
  try {
    transferTotals = await fetchActivityTotals(address, history.lifetimeTransactions);
  } catch (error) {
    console.warn('[GEN-0FI] Arc activity totals unavailable:', error);
    // Do not silently present an incomplete lifetime total as authoritative.
    // If activity cannot be read, expose the metric as unavailable instead.
    transferTotals = { received: -1n, sent: -1n };
  }

  const totalsAvailable = transferTotals.received >= 0n && transferTotals.sent >= 0n;

  const summary = computeWalletSummary(
    address,
    balance.formatted,
    history.lifetimeTransactions,
    false,
    transferTotals
  );

  return {
    walletAddress: address,
    currentBalance: summary.balanceUSDC,
    totalReceived: totalsAvailable ? summary.totalReceivedUSDC : 'Unavailable',
    totalSent: totalsAvailable ? summary.totalSentUSDC : 'Unavailable',
    totalGasSpent: summary.gasSpentUSDC,
    totalTransactions: summary.txCount,
    contractInteractions: summary.contractInteractionsCount,
    recentTransactions: history.transactions,
    historyStatus: 'complete',
    historyStatusNote: summary.historyStatusNote || '',
  };
}
