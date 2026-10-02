import { createPublicClient, formatUnits, http, isAddress } from 'viem';
import { arcChain, ARC_MAINNET_RPC_URL } from '../../config/arc.js';
import { normalizeTransaction, RawTxInput } from './normalizer.js';
import { NormalizedTransaction, WalletSummary } from '../../types/blockchain.js';

const ARCSCAN_API_BASE = 'https://api.arc-scan.org/api';
const ARCSCAN_V1_BASE = 'https://api.arc-scan.org/v1';
const ARCSCAN_API_KEY = process.env.ARCSCAN_API_KEY || 'YourApiKeyToken';
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || process.env.ARCSCAN_API_KEY || '';
const ETHERSCAN_V2_BASE = 'https://api.etherscan.io/v2/api';
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

const ARCSCAN_INTERNAL_BASE = 'https://arc-scan.org/_api';

async function fetchJson(url: string, timeoutMs = 15_000): Promise<any> {
  const candidates = [url];

  // Arcscan's public API hostname can fail independently of the explorer
  // itself. Keep the dashboard on real Arcscan indexed data by falling back
  // to the explorer's server-side API rewrite. This does not change chain,
  // data semantics, or introduce mock values.
  if (url.startsWith(ARCSCAN_V1_BASE)) {
    candidates.push(ARCSCAN_INTERNAL_BASE + url.slice(ARCSCAN_V1_BASE.length));
  } else if (url.startsWith(ARCSCAN_API_BASE)) {
    candidates.push(ARCSCAN_INTERNAL_BASE + url.slice(ARCSCAN_API_BASE.length));
  }

  let lastError: unknown = null;
  for (const candidate of candidates) {
    try {
      const response = await fetch(candidate, {
        headers: requestHeaders(),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`Arcscan HTTP ${response.status}`);
      }
      return response.json();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Arcscan request failed');
}

function scalarString(value: any, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return String(value);
  if (typeof value === 'object') {
    for (const key of ['value', 'raw', 'amount', 'blockNumber', 'block_number', 'timestamp', 'timeStamp']) {
      if (value[key] !== undefined) {
        const nested = scalarString(value[key], '');
        if (nested !== '') return nested;
      }
    }
  }
  return fallback;
}

function bigintFromValue(value: any, fallback = 0n): bigint {
  const scalar = scalarString(value, '').trim();
  if (!scalar) return fallback;
  try {
    return BigInt(scalar);
  } catch {
    return fallback;
  }
}

function timestampMs(value: any): number {
  const scalar = scalarString(value, '').trim();
  if (!scalar) return 0;
  const numeric = Number(scalar);
  if (!Number.isFinite(numeric)) return 0;
  return numeric > 1e12 ? numeric : numeric * 1000;
}

async function fetchEtherscanTransactions(address: string): Promise<any[]> {
  if (!ETHERSCAN_API_KEY || ETHERSCAN_API_KEY === 'YourApiKeyToken') throw new Error('Etherscan API key not configured');
  const all: any[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const url = new URL(ETHERSCAN_V2_BASE);
    url.searchParams.set('chainid', '5042');
    url.searchParams.set('module', 'account');
    url.searchParams.set('action', 'txlist');
    url.searchParams.set('address', address);
    url.searchParams.set('startblock', '0');
    url.searchParams.set('endblock', '999999999');
    url.searchParams.set('page', String(page));
    url.searchParams.set('offset', '10000');
    url.searchParams.set('sort', 'desc');
    url.searchParams.set('apikey', ETHERSCAN_API_KEY);
    const data = await fetchJson(url.toString(), 12_000);
    if (String(data?.status) !== '1') {
      if (/no transactions/i.test(String(data?.message || data?.result || ''))) return all;
      throw new Error(String(data?.result || data?.message || 'Etherscan transaction query failed'));
    }
    const rows = Array.isArray(data.result) ? data.result : [];
    all.push(...rows);
    if (rows.length < 10000) break;
  }
  return all;
}

async function fetchEtherscanUSDCTransfers(address: string): Promise<any[]> {
  if (!ETHERSCAN_API_KEY || ETHERSCAN_API_KEY === 'YourApiKeyToken') throw new Error('Etherscan API key not configured');
  const url = new URL(ETHERSCAN_V2_BASE);
  url.searchParams.set('chainid', '5042');
  url.searchParams.set('module', 'account');
  url.searchParams.set('action', 'tokentx');
  url.searchParams.set('address', address);
  url.searchParams.set('contractaddress', ERC20_USDC);
  url.searchParams.set('startblock', '0');
  url.searchParams.set('endblock', '999999999');
  url.searchParams.set('page', '1');
  url.searchParams.set('offset', '10000');
  url.searchParams.set('sort', 'desc');
  url.searchParams.set('apikey', ETHERSCAN_API_KEY);
  const data = await fetchJson(url.toString(), 12_000);
  if (String(data?.status) !== '1') {
    if (/no transactions/i.test(String(data?.message || data?.result || ''))) return [];
    throw new Error(String(data?.result || data?.message || 'Etherscan token transfer query failed'));
  }
  return Array.isArray(data.result) ? data.result : [];
}

async function fetchAddressTransactions(address: string): Promise<any[]> {
  if (ETHERSCAN_API_KEY && ETHERSCAN_API_KEY !== 'YourApiKeyToken') {
    try {
      const rows = await fetchEtherscanTransactions(address);
      if (rows.length > 0) return rows;
    } catch (error) {
      console.warn('[GEN-0FI] Etherscan transaction index unavailable:', error);
    }
  }

  const all: any[] = [];
  let cursor = '';
  try {
    for (let page = 0; page < 500; page++) {
      const url = new URL(ARCSCAN_V1_BASE + '/filter/transactions');
      url.searchParams.set('address', address);
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('cursor', cursor);
      const data = await fetchJson(url.toString());
      const rows = Array.isArray(data?.items) ? data.items : Array.isArray(data?.transactions) ? data.transactions : Array.isArray(data?.result) ? data.result : [];
      all.push(...rows);
      const next = data?.page?.next ?? data?.next_cursor ?? data?.nextCursor;
      if (!next || rows.length === 0) break;
      cursor = String(next);
    }
  } catch (error) {
    console.warn('[GEN-0FI] Arcscan transaction index unavailable:', error);
  }
  if (all.length > 0) return all;

  try {
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
      url.searchParams.set('page', '1');
      url.searchParams.set('offset', '100');
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
  } catch (error) {
    console.warn('[GEN-0FI] Arcscan legacy transaction index unavailable:', error);
    return [];
  }
}
function toRawTransaction(tx: any): RawTxInput {
  const blockNumberValue = tx.blockNumber ?? tx.block_number ?? 0;
  const timestampValue = tx.timeStamp ?? tx.timestamp ?? tx.block_timestamp;
  const gasUsedParsed = parseArcAmount(tx.gasUsed ?? tx.gas_used, 0);
  const gasPriceParsed = parseArcAmount(tx.gasPrice ?? tx.gas_price ?? tx.effective_gas_price_raw, 0);
  const rawValueParsed = parseArcAmount(
    tx.rawValue ?? tx.value_18dec ?? tx.value_raw ?? tx.value,
    18
  );
  const feeParsed = parseArcAmount(tx.fee_18dec ?? tx.fee_raw, 18);

  const gasUsed = gasUsedParsed?.raw;
  const gasPrice = gasPriceParsed?.raw;
  const fee = feeParsed?.raw ??
    (gasUsed !== undefined && gasPrice !== undefined ? gasUsed * gasPrice : undefined);

  const statusValue = tx.status ?? tx.tx_status ?? tx.execution_status;
  const legacyStatus = tx.isError === '1' || tx.txreceipt_status === '0'
    ? 0
    : tx.isError === '0' || tx.txreceipt_status === '1'
      ? 1
      : undefined;

  const status = typeof statusValue === 'string'
    ? (
        ['success', '1', '0x1'].includes(statusValue.toLowerCase())
          ? 1
          : ['failed', 'fail', '0', '0x0'].includes(statusValue.toLowerCase())
            ? 0
            : undefined
      )
    : typeof statusValue === 'number'
      ? (statusValue === 1 ? 1 : statusValue === 0 ? 0 : undefined)
      : legacyStatus;

  return {
    hash: String(tx.hash ?? tx.tx_hash ?? ''),
    blockNumber: bigintFromValue(blockNumberValue),
    from: addressOf(tx.from) || '',
    to: addressOf(tx.to),
    value: rawValueParsed?.raw ?? 0n,
    fee,
    gas: tx.gas !== undefined && tx.gas !== null
      ? bigintFromValue(tx.gas)
      : tx.gas_limit !== undefined && tx.gas_limit !== null
        ? bigintFromValue(tx.gas_limit)
        : undefined,
    gasPrice,
    gasUsed,
    input: tx.input || '0x',
    methodId: tx.methodId ?? tx.method_id ?? '',
    functionName: tx.functionName ?? tx.function_name ?? '',
    contractName: tx.contractName ?? tx.contract_name ?? tx.toName ?? tx.to_name ?? tx.contract?.name ?? '',
    timestamp: timestampMs(timestampValue),
    status,
    contractAddress: addressOf(tx.contractAddress) || addressOf(tx.created_contract),
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

      // Prefer exact historical bytecode when the RPC supports archive reads.
      // Arc mainnet does not currently expose a trace index, so some historical
      // eth_getCode calls can be unavailable. In that case use Arcscan's decoded
      // calldata markers already present on the transaction record. A non-empty
      // method selector/function name is strong evidence that the wallet called
      // a contract, while a plain 0x transfer remains a normal send.
      for (const client of [arcClient, arcScanClient]) {
        try {
          const code = await client.getCode({
            address: tx.to as `0x${string}`,
            blockNumber: tx.blockNumber as bigint,
          });
          return [txHash, Boolean(code && code !== '0x')] as const;
        } catch {}
      }

      const input = String(tx.input || '0x').toLowerCase();
      const hasCalldata = input !== '0x' && input.length > 2;
      const hasDecodedMethod = Boolean(
        String(tx.methodId || '').trim() ||
        String(tx.functionName || '').trim()
      );

      if (hasCalldata || hasDecodedMethod) {
        return [txHash, true] as const;
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
    : value.address ?? value.checksum ?? value.hash ?? value.value ?? value.from ?? value.to;
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
  if (ETHERSCAN_API_KEY && ETHERSCAN_API_KEY !== 'YourApiKeyToken') {
    try {
      let received = 0n, sent = 0n;
      const nativeRows = await fetchEtherscanTransactions(address);
      for (const row of nativeRows) {
        if (row?.isError === '1' || row?.txreceipt_status === '0') continue;
        const from = addressOf(row?.from), to = addressOf(row?.to);
        const value = parseArcAmount(row?.value, 18);
        if (!value || value.raw <= 0n) continue;
        const incoming = to === target && from !== target, outgoing = from === target;
        if (incoming === outgoing) continue;
        if (incoming) received += value.raw; else sent += value.raw;
      }
      const tokenRows = await fetchEtherscanUSDCTransfers(address);
      for (const row of tokenRows) {
        if (row?.isError === '1' || row?.txreceipt_status === '0') continue;
        const from = addressOf(row?.from), to = addressOf(row?.to);
        const incoming = to === target && from !== target, outgoing = from === target;
        if (incoming === outgoing) continue;
        const raw = parseArcAmount(row?.value, Number(row?.tokenDecimal ?? 6));
        if (!raw || raw.raw <= 0n) continue;
        const normalized = to18Decimals(raw.raw, raw.decimals);
        if (incoming) received += normalized; else sent += normalized;
      }
      if (nativeRows.length > 0 || tokenRows.length > 0) return { received, sent };
    } catch (error) {
      console.warn('[GEN-0FI] Etherscan activity index unavailable:', error);
    }
  }

  let received = 0n, sent = 0n, cursor = '', activityRows = 0;
  const seenMovements = new Set<string>();
  try {
    for (let page = 0; page < 500; page++) {
      const url = new URL('${ARCSCAN_V1_BASE}/address/' + address + '/activity');
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('cursor', cursor);
      const data = await fetchJson(url.toString());
      const rows = Array.isArray(data?.items) ? data.items : Array.isArray(data?.activity) ? data.activity : Array.isArray(data?.result) ? data.result : [];
      activityRows += rows.length;
      for (const row of rows) {
        if (!isSuccessfulActivityRow(row) || !isTransferLikeActivityRow(row)) continue;
        const tokenAddress = activityTokenAddress(row), symbol = activitySymbol(row);
        if (tokenAddress && tokenAddress !== ERC20_USDC) continue;
        if (symbol && symbol !== 'USDC') continue;
        const from = addressOf(row?.from), to = addressOf(row?.to);
        const direction = String(row?.direction || row?.flow || '').toLowerCase();
        const amount = parseArcAmount(row?.value_18dec, 18) || parseArcAmount(row?.amount_18dec, 18) ||
          parseArcAmount(row?.value, Number(row?.decimals ?? row?.token?.decimals ?? row?.asset?.decimals ?? 18)) ||
          parseArcAmount(row?.amount, Number(row?.decimals ?? row?.token?.decimals ?? row?.asset?.decimals ?? 18)) ||
          parseArcAmount(row?.quantity, Number(row?.decimals ?? row?.token?.decimals ?? row?.asset?.decimals ?? 18)) ||
          parseArcAmount(row?.value_raw, 18) || parseArcAmount(row?.amount_raw, 18);
        if (!amount) continue;
        const incoming = to === target || ['in','incoming','received'].includes(direction);
        const outgoing = from === target || ['out','outgoing','sent'].includes(direction);
        if (incoming === outgoing) continue;
        const normalized = to18Decimals(amount.raw, amount.decimals);
        if (normalized <= 0n) continue;
        const movementId = [String(row?.tx_hash || row?.txHash || row?.hash || row?.transaction_hash || '').toLowerCase(), from || '', to || '', incoming ? 'in' : 'out', normalized.toString()].join(':');
        if (seenMovements.has(movementId)) continue;
        seenMovements.add(movementId);
        if (incoming) received += normalized; else sent += normalized;
      }
      const next = data?.page?.next ?? data?.next_cursor ?? data?.nextCursor;
      if (!next || rows.length === 0) break;
      cursor = String(next);
    }
  } catch (error) {
    console.warn('[GEN-0FI] Arcscan activity index unavailable:', error);
  }
  if (activityRows > 0) return { received, sent };

  for (const tx of fallbackTransactions) {
    if (tx.status !== 'success') continue;
    const value = BigInt(tx.rawValue || '0');
    if (value <= 0n) continue;
    const from = addressOf(tx.from), to = addressOf(tx.to);
    const incoming = to === target && from !== target, outgoing = from === target;
    if (incoming === outgoing) continue;
    if (incoming) received += value; else sent += value;
  }
  if (received === 0n && sent === 0n && activityRows === 0 && fallbackTransactions.length === 0) throw new Error('Arc Mainnet activity unavailable');
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

function collectTokenRows(value: any, depth = 0): any[] {
  if (depth > 5 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value !== 'object') return [];

  const rows: any[] = [];
  const preferredKeys = ['items', 'tokens', 'balances', 'holdings', 'result', 'data', 'assets'];
  for (const key of preferredKeys) {
    if (value[key] !== undefined) {
      const nested = collectTokenRows(value[key], depth + 1);
      if (nested.length) rows.push(...nested);
    }
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    if (isAddress(key, { strict: false }) && nestedValue !== null && typeof nestedValue !== 'object') {
      rows.push({ address: key, balance: nestedValue });
    }
  }

  return rows;
}

async function fetchAddressTokenBalances(address: string): Promise<any[]> {
  const urls = [
    `${ARCSCAN_V1_BASE}/address/${address}/tokens?sort=balance`,
    (() => {
      const url = new URL(ARCSCAN_API_BASE);
      url.searchParams.set('module', 'account');
      url.searchParams.set('action', 'addresstokenbalance');
      url.searchParams.set('address', address);
      url.searchParams.set('apikey', ARCSCAN_API_KEY);
      return url.toString();
    })(),
  ];

  for (const url of urls) {
    try {
      const data = await fetchJson(url);
      const rows = collectTokenRows(data);
      if (rows.length) return rows;
    } catch (error) {
      console.warn('[GEN-0FI] Arc token balance index unavailable:', error);
    }
  }

  return [];
}
async function fetchTokenTransferCandidates(address: string): Promise<any[]> {
  let cursor = '';
  const all: any[] = [];

  for (let page = 0; page < 50; page += 1) {
    try {
      const url = new URL(`${ARCSCAN_V1_BASE}/filter/token-transfers`);
      url.searchParams.set('address', address);
      url.searchParams.set('standard', 'ERC-20');
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('cursor', cursor);

      const data = await fetchJson(url.toString());
      const rows = [
        data?.items,
        data?.transfers,
        data?.result,
        data?.data?.items,
        data?.data?.transfers,
      ].find(Array.isArray) || [];

      all.push(...rows);

      const next = data?.page?.next ?? data?.next_cursor ?? data?.nextCursor ?? data?.data?.page?.next;
      if (!next || rows.length === 0) break;
      cursor = String(next);
    } catch (error) {
      console.warn('[GEN-0FI] Arc token transfer index unavailable:', error);
      break;
    }
  }

  return all;
}

const ERC20_TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

async function fetchTokenLogCandidates(address: string): Promise<any[]> {
  let cursor = '';
  const all: any[] = [];

  for (let page = 0; page < 50; page += 1) {
    try {
      const url = new URL(`${ARCSCAN_V1_BASE}/address/${address}/logs`);
      url.searchParams.set('topic0', ERC20_TRANSFER_TOPIC);
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('cursor', cursor);

      const data = await fetchJson(url.toString());
      const rows = [
        data?.items,
        data?.logs,
        data?.result,
        data?.data?.items,
        data?.data?.logs,
      ].find(Array.isArray) || [];

      for (const row of rows) {
        const topic0 = String(row?.topic0 ?? row?.topics?.[0] ?? '').toLowerCase();
        const tokenContract = addressOf(
          row?.address ??
          row?.contract_address ??
          row?.contractAddress ??
          row?.token_address ??
          row?.token?.address
        );
        if (topic0 === ERC20_TRANSFER_TOPIC && tokenContract) {
          all.push({
            ...row,
            address: tokenContract,
            standard: row?.standard ?? row?.token_standard ?? row?.token?.standard ?? 'ERC-20',
          });
        }
      }

      const next = data?.page?.next ?? data?.next_cursor ?? data?.nextCursor ?? data?.data?.page?.next;
      if (!next || rows.length === 0) break;
      cursor = String(next);
    } catch (error) {
      console.warn('[GEN-0FI] Arc token log index unavailable:', error);
      break;
    }
  }

  return all;
}

function tokenStandard(row: any): string {
  return String(
    row?.standard ??
    row?.token_standard ??
    row?.token?.standard ??
    row?.type ??
    ''
  ).toUpperCase().replace(/_/g, '-');
}

function tokenAddress(row: any): string {
  const direct = typeof row === 'string' ? row : (
    row?.address ??
    row?.token_address ??
    row?.tokenAddress ??
    row?.TokenAddress ??
    row?.contract_address ??
    row?.contractAddress ??
    row?.token?.address ??
    row?.token ??
    (typeof row?.token === 'string' ? row.token : undefined)
  );
  return addressOf(direct) || '';
}

function tokenName(row: any): string {
  return String(row?.name ?? row?.token_name ?? row?.TokenName ?? row?.token?.name ?? 'Unknown asset');
}

function tokenSymbol(row: any): string {
  return String(row?.symbol ?? row?.token_symbol ?? row?.TokenSymbol ?? row?.token?.symbol ?? '—');
}

function tokenDecimals(row: any): number | undefined {
  const value = row?.decimals ?? row?.token_decimal ?? row?.TokenDivisor ?? row?.token?.decimals;
  const decimals = Number(value);
  return Number.isInteger(decimals) && decimals >= 0 && decimals <= 255 ? decimals : undefined;
}

function tokenRawBalance(row: any): { raw: bigint; decimals?: number } | null {
  const decimals = tokenDecimals(row);
  const value = row?.balance ?? row?.tokenBalance ?? row?.token_balance ?? row?.TokenQuantity ?? row?.amount ?? row?.quantity ?? row?.raw_balance;
  if (value === undefined || value === null) return null;

  if (typeof value === 'object') {
    const raw = value.raw ?? value.value_raw ?? value.amount_raw;
    const nestedDecimals = Number(value.decimals ?? decimals);
    if (raw !== undefined && /^-?\\d+$/.test(String(raw))) {
      return { raw: BigInt(String(raw)), decimals: Number.isInteger(nestedDecimals) ? nestedDecimals : decimals };
    }
    const formatted = value.formatted ?? value.display ?? value.value;
    if (formatted !== undefined && decimals !== undefined && /^-?\\d+(?:\\.\\d+)?$/.test(String(formatted))) {
      const negative = String(formatted).startsWith('-');
      const unsigned = negative ? String(formatted).slice(1) : String(formatted);
      const [whole, fraction = ''] = unsigned.split('.');
      const padded = (fraction + '0'.repeat(decimals)).slice(0, decimals);
      const rawValue = BigInt(whole || '0') * 10n ** BigInt(decimals) + BigInt(padded || '0');
      return { raw: negative ? -rawValue : rawValue, decimals };
    }
    return null;
  }

  if (/^-?\\d+$/.test(String(value))) {
    return { raw: BigInt(String(value)), decimals };
  }

  return null;
}

async function readErc20Balance(contract: string, owner: string): Promise<{ raw: bigint; decimals?: number }> {
  const balanceAbi = [{
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  }] as const;
  const decimalsAbi = [{
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: 'decimals', type: 'uint8' }],
  }] as const;

  for (const client of [arcClient, arcScanClient]) {
    try {
      const raw = await client.readContract({
        address: contract as `0x${string}`,
        abi: balanceAbi,
        functionName: 'balanceOf',
        args: [owner as `0x${string}`],
      });

      let decimals: number | undefined;
      try {
        const value = await client.readContract({
          address: contract as `0x${string}`,
          abi: decimalsAbi,
          functionName: 'decimals',
        });
        decimals = Number(value);
      } catch {}

      return { raw, decimals };
    } catch {}
  }

  return { raw: 0n };
}

async function readErc721Balance(contract: string, owner: string): Promise<bigint> {
  const ABI = [{
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  }] as const;

  for (const client of [arcClient, arcScanClient]) {
    try {
      return await client.readContract({
        address: contract as `0x${string}`,
        abi: ABI,
        functionName: 'balanceOf',
        args: [owner as `0x${string}`],
      });
    } catch {}
  }

  return 0n;
}

async function readErc1155Balance(contract: string, owner: string, tokenId: bigint): Promise<bigint> {
  const ABI = [{
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [
      { name: 'account', type: 'address' },
      { name: 'id', type: 'uint256' },
    ],
    outputs: [{ name: 'value', type: 'uint256' }],
  }] as const;

  for (const client of [arcClient, arcScanClient]) {
    try {
      return await client.readContract({
        address: contract as `0x${string}`,
        abi: ABI,
        functionName: 'balanceOf',
        args: [owner as `0x${string}`, tokenId],
      });
    } catch {}
  }

  return 0n;
}

function nftTokenId(row: any): bigint | null {
  const value = row?.token_id ?? row?.tokenId ?? row?.tokenID ?? row?.id;
  if (value === undefined || value === null) return null;
  try {
    const text = String(value);
    return /^\\d+$/.test(text) ? BigInt(text) : BigInt(text.startsWith('0x') ? text : '');
  } catch {
    return null;
  }
}

async function fetchNftTransfers(address: string): Promise<any[]> {
  const all: any[] = [];
  let cursor = '';

  for (let page = 0; page < 50; page += 1) {
    try {
      const url = new URL(`${ARCSCAN_V1_BASE}/address/${address}/logs`);
      url.searchParams.set('limit', '100');
      if (cursor) url.searchParams.set('cursor', cursor);

      const data = await fetchJson(url.toString());
      const rows = [
        data?.items,
        data?.logs,
        data?.result,
        data?.data?.items,
        data?.data?.logs,
      ].find(Array.isArray) || [];

      for (const row of rows) {
        const topic0 = String(row?.topic0 ?? row?.topics?.[0] ?? '').toLowerCase();
        const topics = Array.isArray(row?.topics) ? row.topics : [];
        const contract = addressOf(
          row?.address ??
          row?.contract_address ??
          row?.contractAddress ??
          row?.token_address ??
          row?.token?.address
        );
        if (!contract) continue;

        // ERC-721 Transfer(address,address,uint256) has four topics.
        if (topic0 === ERC20_TRANSFER_TOPIC && topics.length >= 4) {
          all.push({
            ...row,
            address: contract,
            standard: 'ERC-721',
            token_id: row?.token_id ?? row?.tokenId ?? row?.topics?.[3],
          });
        }
      }

      const next = data?.page?.next ?? data?.next_cursor ?? data?.nextCursor ?? data?.data?.page?.next;
      if (!next || rows.length === 0) break;
      cursor = String(next);
    } catch (error) {
      console.warn('[GEN-0FI] Arc NFT transfer index unavailable:', error);
      break;
    }
  }

  return all;
}
async function fetchTokenMetadata(address: string, row: any): Promise<{ name: string; symbol: string; decimals?: number }> {
  const existing = {
    name: tokenName(row),
    symbol: tokenSymbol(row),
    decimals: tokenDecimals(row),
  };
  if (existing.name !== 'Unknown asset' && existing.symbol !== '—' && existing.decimals !== undefined) return existing;

  try {
    const data = await fetchJson(`${ARCSCAN_V1_BASE}/tokens/${address}`, 10_000);
    const token = data?.token ?? data?.result ?? data;
    return {
      name: String(token?.name ?? token?.token_name ?? existing.name),
      symbol: String(token?.symbol ?? token?.token_symbol ?? existing.symbol),
      decimals: token?.decimals !== undefined ? Number(token.decimals) : existing.decimals,
    };
  } catch {
    return existing;
  }
}

export async function fetchWalletAssetSummary(address: string): Promise<{
  tokenHoldings: number;
  coinHoldings: number;
  nftHoldings: number;
  fungibleHoldings: number;
  historyStatus: 'complete' | 'unavailable';
  coins: Array<{ address: string; name: string; symbol: string; balance: string; standard: string; decimals?: number }>;
  nfts: Array<{ address: string; name: string; symbol: string; balance: string; standard: string }>;
}> {
  if (!address || !isAddress(address, { strict: false })) {
    return { tokenHoldings: 0, coinHoldings: 0, nftHoldings: 0, fungibleHoldings: 0, historyStatus: 'unavailable', coins: [], nfts: [] };
  }

  const [indexedRows, transferRows, logRows] = await Promise.all([
    fetchAddressTokenBalances(address),
    fetchTokenTransferCandidates(address),
    fetchTokenLogCandidates(address),
  ]);
  const candidates = [...indexedRows, ...transferRows, ...logRows];

  const coinContracts = new Set<string>();
  for (const row of candidates) {
    const standard = tokenStandard(row);
    const contract = tokenAddress(row);
    if (contract && (standard === 'ERC-20' || standard === 'ERC20' || !standard)) {
      coinContracts.add(contract.toLowerCase());
    }
  }

  const coins: Array<{ address: string; name: string; symbol: string; balance: string; standard: string; decimals?: number }> = [];
  const nfts: Array<{ address: string; name: string; symbol: string; balance: string; standard: string }> = [];
  const seenCoins = new Set<string>();

  for (const contract of coinContracts) {
    if (contract === ERC20_USDC) continue;

    const row = candidates.find((item) => tokenAddress(item).toLowerCase() === contract) || {};
    const metadata = await fetchTokenMetadata(contract, row);

    // Arcscan's address token endpoint is the authoritative indexed inventory
    // for this wallet. Prefer its reported live balance when present. This is
    // necessary for Arc ERC-20s whose contracts do not expose a standard
    // balanceOf/decimals read through the public RPC. For candidates discovered
    // only from transfers/logs, verify ownership with the contract directly.
    const indexed = tokenRawBalance(row);
    if (indexed && indexed.raw > 0n) {
      const decimals = indexed.decimals ?? metadata.decimals ?? 18;
      coins.push({
        address: contract,
        name: metadata.name,
        symbol: metadata.symbol,
        balance: formatUnits(indexed.raw, decimals),
        standard: 'ERC-20',
        decimals,
      });
      seenCoins.add(contract);
      continue;
    }

    const live = await readErc20Balance(contract, address);
    if (live.raw <= 0n) continue;

    const decimals = live.decimals ?? metadata.decimals ?? 18;
    coins.push({
      address: contract,
      name: metadata.name,
      symbol: metadata.symbol,
      balance: formatUnits(live.raw, decimals),
      standard: 'ERC-20',
      decimals,
    });
    seenCoins.add(contract);
  }

  // Native Arc USDC is separate from the ERC-20 token index but is a real
  // fungible holding and must always be represented when its balance is non-zero.
  try {
    const native = await fetchBalanceFromArcRpc(address);
    if (BigInt(native.raw) > 0n) {
      coins.unshift({
        address: ERC20_USDC,
        name: 'USD Coin',
        symbol: 'USDC',
        balance: native.formatted,
        standard: 'NATIVE',
        decimals: NATIVE_DECIMALS,
      });
    }
  } catch {}

  // Arcscan exposes NFT transfers but not a direct address NFT inventory.
  // Reconstruct current ownership from indexed transfer candidates, then verify
  // each contract's live balanceOf on Arc Mainnet. No guessed or fabricated NFTs.
  const nftRows = await fetchNftTransfers(address).catch(() => []);
  const nftContracts = new Map<string, any[]>();
  for (const row of nftRows) {
    const contract = tokenAddress(row);
    if (!contract) continue;
    const standard = tokenStandard(row);
    if (standard === 'ERC-721' || standard === 'ERC721' || standard === 'ERC-1155' || standard === 'ERC1155') {
      const list = nftContracts.get(contract) || [];
      list.push(row);
      nftContracts.set(contract, list);
    }
  }

  for (const [contract, contractRows] of nftContracts) {
    const standard = tokenStandard(contractRows[0]);
    const metadata = await fetchTokenMetadata(contract, contractRows[0]);

    if (standard === 'ERC-721' || standard === 'ERC721') {
      const balance = await readErc721Balance(contract, address);
      if (balance > 0n) {
        nfts.push({
          address: contract,
          name: metadata.name,
          symbol: metadata.symbol,
          balance: balance.toString(),
          standard: 'ERC-721',
        });
      }
    } else {
      const tokenIds = new Set<string>();
      for (const row of contractRows) {
        const id = nftTokenId(row);
        if (id !== null) tokenIds.add(id.toString());
      }
      let total = 0n;
      for (const id of tokenIds) {
        total += await readErc1155Balance(contract, address, BigInt(id));
      }
      if (total > 0n) {
        nfts.push({
          address: contract,
          name: metadata.name,
          symbol: metadata.symbol,
          balance: total.toString(),
          standard: 'ERC-1155',
        });
      }
    }
  }

  const coinHoldings = coins.length;
  const nftHoldings = nfts.length;

  return {
    tokenHoldings: coinHoldings + nftHoldings,
    coinHoldings,
    nftHoldings,
    fungibleHoldings: coinHoldings,
    historyStatus: 'complete',
    coins,
    nfts,
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

function shortContractLabel(address: string): string {
  const value = String(address || '').toLowerCase();
  if (/^0x[a-f0-9]{40}$/.test(value)) return `Contract ${value.slice(0, 6)}…${value.slice(-4)}`;
  return 'Unknown protocol';
}

function protocolLabelForTransaction(tx: NormalizedTransaction): string {
  const decoded = String(tx.contractName || '').trim();
  if (decoded) return decoded;

  const to = tx.contractAddress || tx.to || '';
  return shortContractLabel(to);
}

function isApprovalTransaction(tx: NormalizedTransaction): boolean {
  const method = String(tx.methodName || '').toLowerCase().replace(/[\s_-]+/g, '');
  return method === 'approve'
    || method === 'increaseallowance'
    || method === 'decreaseallowance'
    || method === 'setapprovalforall'
    || method.includes('permit');
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
  let failedTransactionCount = 0;
  let tokenApprovalsCount = 0;
  let firstActivityTime: number | undefined;
  const protocolCounts = new Map<string, number>();

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
    if (tx.timestamp > 0 && (firstActivityTime === undefined || tx.timestamp < firstActivityTime)) {
      firstActivityTime = tx.timestamp;
    }
    if (tx.status === 'reverted') failedTransactionCount++;
    if (isApprovalTransaction(tx)) tokenApprovalsCount++;

    try {
      if (tx.gasCostUSDC !== 'Unavailable') gas += BigInt(Math.round(Number(tx.gasCostUSDC) * 1e18));
    } catch {}
    // A contract interaction is a successful top-level transaction initiated by
    // this wallet whose destination was contract bytecode at that block.
    // Contract creation is tracked as a transaction, but is not an interaction
    // with an existing contract.
    if (tx.isContractInteraction && tx.status === 'success') {
      contracts++;
      const label = protocolLabelForTransaction(tx);
      protocolCounts.set(label, (protocolCounts.get(label) || 0) + 1);
    }
    if (tx.from) counterparties.add(tx.from.toLowerCase());
    if (tx.to) counterparties.add(tx.to.toLowerCase());
  }

  const historyStatus = isHistoryUnavailable ? 'unavailable' : 'complete';
  const topProtocolUsed = [...protocolCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0] || 'None';

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
    firstActivityTime,
    failedTransactionCount,
    topProtocolUsed,
    tokenApprovalsCount,
    incomingTransfersCount: incomingCount,
    outgoingTransfersCount: outgoingCount,
  };
}

async function fetchAddressFacts(address: string): Promise<any> {
  return fetchJson(`${ARCSCAN_V1_BASE}/address/${address}/facts`, 10_000);
}

async function fetchApprovalsCount(address: string): Promise<number> {
  const data = await fetchJson(`${ARCSCAN_V1_BASE}/approvals/${address}?limit=100`, 10_000);
  const rows = Array.isArray(data?.items) ? data.items : Array.isArray(data?.approvals) ? data.approvals : Array.isArray(data?.result) ? data.result : [];
  return rows.length;
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
  firstActivityTime?: number;
  failedTransactionCount: number;
  topProtocolUsed: string;
  tokenApprovalsCount: number;
  historyStatus: 'complete' | 'unavailable';
  historyStatusNote: string;
}

export async function fetchCompleteWalletState(address: string): Promise<CompleteWalletState> {
  const [balance, history] = await Promise.all([
    fetchBalanceFromArcRpc(address),
    fetchTransactionsForAddress(address, 50),
  ]);

  let received = 'Unavailable';
  let sent = 'Unavailable';
  let gas = 'Unavailable';
  let firstActivityTime: number | undefined;
  let tokenApprovalsCount: number | undefined;

  try {
    const totals = await fetchActivityTotals(address, history.lifetimeTransactions);
    received = formatUSDC(totals.received);
    sent = formatUSDC(totals.sent);
  } catch (error) {
    console.warn('[GEN-0FI] Arc activity totals unavailable:', error);
  }

  try {
    const facts = await fetchAddressFacts(address);
    const first = facts?.first_transaction ?? facts?.firstTransaction ?? facts?.first_activity ?? facts?.firstActivity;
    const timestamp = timestampMs(first?.timestamp ?? first?.timeStamp ?? first?.block_timestamp ?? first);
    if (timestamp > 0) firstActivityTime = timestamp;
  } catch (error) {
    console.warn('[GEN-0FI] Arc address facts unavailable:', error);
  }

  try {
    tokenApprovalsCount = await fetchApprovalsCount(address);
  } catch (error) {
    console.warn('[GEN-0FI] Arc approvals unavailable:', error);
  }

  let summary: WalletSummary | null = null;
  if (!history.isUnavailable) {
    summary = computeWalletSummary(address, balance.formatted, history.lifetimeTransactions, false);
    gas = summary.gasSpentUSDC;
    if (firstActivityTime === undefined) firstActivityTime = summary.firstActivityTime;
    if (tokenApprovalsCount === undefined) tokenApprovalsCount = summary.tokenApprovalsCount;
  }

  return {
    walletAddress: address,
    currentBalance: balance.formatted,
    totalReceived: received,
    totalSent: sent,
    totalGasSpent: gas,
    totalTransactions: history.isUnavailable ? 0 : history.lifetimeTransactions.length,
    contractInteractions: history.isUnavailable ? 0 : history.lifetimeTransactions.filter(tx => tx.isContractInteraction && tx.status === 'success').length,
    recentTransactions: history.transactions,
    firstActivityTime,
    failedTransactionCount: history.isUnavailable ? 0 : history.lifetimeTransactions.filter(tx => tx.status === 'reverted').length,
    topProtocolUsed: summary?.topProtocolUsed ?? 'None',
    tokenApprovalsCount: tokenApprovalsCount ?? 0,
    historyStatus: history.historyStatus,
    historyStatusNote: history.isUnavailable
      ? 'Arc Mainnet transaction history is unavailable. Individual metrics are shown only when independently verified.'
      : 'Arc Mainnet transaction history was retrieved and normalized.',
  };
}
