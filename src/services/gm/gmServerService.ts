import { createClient } from '@supabase/supabase-js';
import { isAddress, keccak256, toHex } from 'viem';

export const GM_CONTRACT_ADDRESS = '0xCb98496A4BbF6969bF6c8EfF2694992e819047AC' as const;
export const ARC_CHAIN_ID = 5042;
export const ARC_SCAN_API = 'https://api.arc-scan.org/v1';

export const GM_EVENT_TOPIC0 = keccak256(
  toHex('GMCheckedIn(address,uint256,uint256,uint256)')
);

export interface GMOnchainRow {
  wallet_address: string;
  checkin_date: string;
  tx_hash: string | null;
  chain_id: number;
}

export interface GMStats {
  currentStreak: number;
  longestStreak: number;
  totalGmDays: number;
  points: number;
  checkedInToday: boolean;
  lastCheckinDate: string | null;
}

export interface GMLeaderboardRow extends GMStats {
  walletAddress: string;
}

const dateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const previousDateKey = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return dateKey(value);
};

export const getGMStreakPoints = (streak: number) =>
  streak <= 0 ? 0 : streak >= 14 ? 300 : streak * 10;

const calculateStats = (dates: string[], today = dateKey()): GMStats => {
  const unique = [...new Set(dates)].sort();
  const dateSet = new Set(unique);
  const checkedInToday = dateSet.has(today);

  let currentStreak = 0;
  let cursor = checkedInToday ? today : previousDateKey(today);
  while (dateSet.has(cursor)) {
    currentStreak += 1;
    cursor = previousDateKey(cursor);
  }

  let longestStreak = 0;
  let run = 0;
  let points = 0;

  for (let index = 0; index < unique.length; index += 1) {
    run = index > 0 && previousDateKey(unique[index]) === unique[index - 1] ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    points += getGMStreakPoints(run);
  }

  return {
    currentStreak,
    longestStreak,
    totalGmDays: unique.length,
    points,
    checkedInToday,
    lastCheckinDate: unique.at(-1) ?? null,
  };
};

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

function extractRows(payload: any): any[] {
  const root = payload?.data ?? payload?.result ?? payload;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root?.logs)) return root.logs;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root?.result)) return root.result;
  return [];
}

function extractCursor(payload: any): string | null {
  const root = payload?.data ?? payload?.result ?? payload;
  return root?.page?.next ?? root?.next_cursor ?? root?.nextCursor ?? root?.pagination?.next_cursor ?? null;
}

function decodeRow(log: any): GMOnchainRow | null {
  try {
    const decodedArgs = log.args || log.decoded?.args || log.decoded || {};
    let wallet = String(log.wallet || decodedArgs.wallet || '').toLowerCase();
    let dayValue = log.day ?? decodedArgs.day;

    if ((!isAddress(wallet, { strict: false }) || dayValue == null) && log.topics?.length) {
      const topics = Array.isArray(log.topics) ? log.topics : [];
      if (topics.length < 3) return null;

      // GMCheckedIn(address indexed wallet, uint256 indexed day, ...)
      // topic[1] is the padded wallet address and topic[2] is the day.
      const walletTopic = String(topics[1]);
      const dayTopic = String(topics[2]);
      if (!/^0x[a-fA-F0-9]{64}$/.test(walletTopic) || !/^0x[a-fA-F0-9]{64}$/.test(dayTopic)) {
        return null;
      }

      wallet = `0x${walletTopic.slice(-40)}`.toLowerCase();
      dayValue = BigInt(dayTopic);
    }

    if (!isAddress(wallet, { strict: false }) || dayValue == null) return null;

    const day = BigInt(dayValue);
    if (day < 0n) return null;

    const txHash = String(
      log.transaction_hash ||
      log.transactionHash ||
      log.tx_hash ||
      log.hash ||
      ''
    ).toLowerCase();

    return {
      wallet_address: wallet,
      checkin_date: new Date(Number(day) * 86400000).toISOString().slice(0, 10),
      tx_hash: /^0x[a-f0-9]{64}$/.test(txHash) ? txHash : null,
      chain_id: ARC_CHAIN_ID,
    };
  } catch {
    return null;
  }
}

export async function fetchAllConfirmedGMEvents(): Promise<GMOnchainRow[]> {
  const rpcUrl = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
  const request = async (method: string, params: unknown[]) => {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Arc RPC HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.error) throw new Error(String(payload.error.message || 'Arc RPC error'));
    return payload?.result;
  };

  const decodeRpcLog = (log: any): GMOnchainRow | null => {
    try {
      const topics = Array.isArray(log?.topics) ? log.topics : [];
      if (topics.length < 3 || String(topics[0]).toLowerCase() !== GM_EVENT_TOPIC0.toLowerCase()) return null;

      const walletTopic = String(topics[1]);
      const dayTopic = String(topics[2]);
      if (!/^0x[a-fA-F0-9]{64}$/.test(walletTopic) || !/^0x[a-fA-F0-9]{64}$/.test(dayTopic)) return null;

      const wallet = `0x${walletTopic.slice(-40)}`.toLowerCase();
      if (!isAddress(wallet, { strict: false })) return null;

      const day = BigInt(dayTopic);
      const txHash = String(log?.transactionHash || '').toLowerCase();

      return {
        wallet_address: wallet,
        checkin_date: new Date(Number(day) * 86400000).toISOString().slice(0, 10),
        tx_hash: /^0x[a-f0-9]{64}$/.test(txHash) ? txHash : null,
        chain_id: ARC_CHAIN_ID,
      };
    } catch {
      return null;
    }
  };

  // Keep GM reads cheap and resilient. Supabase stores only previously verified
  // Arc Mainnet GMCheckedIn events. Refresh only the recent RPC window; never
  // perform a full-chain scan on every dashboard load.
  const supabase = getSupabase();
  let cachedRows: GMOnchainRow[] = [];

  if (supabase) {
    const { data, error } = await supabase
      .from('gm_checkins')
      .select('wallet_address,checkin_date,tx_hash,chain_id')
      .eq('chain_id', ARC_CHAIN_ID)
      .limit(10000);

    if (!error && Array.isArray(data)) {
      cachedRows = data.map((row: any) => ({
        wallet_address: String(row.wallet_address).toLowerCase(),
        checkin_date: String(row.checkin_date),
        tx_hash: row.tx_hash ? String(row.tx_hash).toLowerCase() : null,
        chain_id: ARC_CHAIN_ID,
      }));
    }
  }

  try {
    const latestHex = await request('eth_blockNumber', []);
    const latestBlock = BigInt(latestHex);
    const recentWindow = 9_000n;
    const fromBlock = latestBlock > recentWindow ? latestBlock - recentWindow : 0n;

    const logs = await request('eth_getLogs', [{
      address: GM_CONTRACT_ADDRESS,
      topics: [GM_EVENT_TOPIC0],
      fromBlock: `0x${fromBlock.toString(16)}`,
      toBlock: `0x${latestBlock.toString(16)}`,
    }]);

    const recentRows = Array.isArray(logs)
      ? logs.map(decodeRpcLog).filter(Boolean) as GMOnchainRow[]
      : [];

    const merged = [...new Map(
      [...cachedRows, ...recentRows]
        .map((row) => [`${row.wallet_address}:${row.checkin_date}`, row])
    ).values()];

    if (recentRows.length) await persistGMRows(recentRows);
    return merged;
  } catch (error) {
    console.warn('[GM] Recent Arc RPC refresh unavailable; using verified cache:', error);

    if (cachedRows.length) return cachedRows;
  }

  // Explorer data is only a recovery path. It is still real Arc Mainnet event
  // data and is never used to manufacture a successful GM.
  try {
    const rows = await fetchArcscanGMEvents();
    if (rows.length) return rows;
  } catch (error) {
    console.warn('[GM] Arcscan GM history unavailable:', error);
  }

  throw new Error('No verified Arc Mainnet GM history source is currently available.');
}

async function fetchArcscanGMEvents(): Promise<GMOnchainRow[]> {
  const rows: GMOnchainRow[] = [];
  let cursor: string | null = null;
  const seen = new Set<string>();

  for (let page = 0; page < 100; page += 1) {
    const params = new URLSearchParams({ limit: '100', topic0: GM_EVENT_TOPIC0 });
    if (cursor) params.set('cursor', cursor);

    const response = await fetch(
      `${ARC_SCAN_API}/address/${GM_CONTRACT_ADDRESS}/logs?${params.toString()}`,
      { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8_000) },
    );

    if (!response.ok) throw new Error(`Arcscan GM logs request failed: ${response.status}`);

    const payload = await response.json();
    const pageRows = extractRows(payload).map(decodeRow).filter(Boolean) as GMOnchainRow[];
    rows.push(...pageRows);

    const next = extractCursor(payload);
    if (!next || seen.has(next) || pageRows.length === 0) break;
    seen.add(next);
    cursor = next;
  }

  return [...new Map(
    rows.map((row) => [`${row.wallet_address}:${row.checkin_date}`, row])
  ).values()];
}

export async function persistGMRows(rows: GMOnchainRow[]) {
  const supabase = getSupabase();
  if (!supabase || !rows.length) return;

  const { error } = await supabase
    .from('gm_checkins')
    .upsert(rows, {
      onConflict: 'wallet_address,checkin_date',
      ignoreDuplicates: true,
    });

  if (error) {
    console.warn('[GM] Supabase cache sync failed:', error.message);
  }
}

export function statsForWallet(rows: GMOnchainRow[], walletAddress: string): GMStats {
  const wallet = walletAddress.toLowerCase();
  return calculateStats(
    rows
      .filter((row) => row.wallet_address === wallet)
      .map((row) => row.checkin_date)
  );
}

export function leaderboardFromRows(rows: GMOnchainRow[], limit = 20): GMLeaderboardRow[] {
  const grouped = new Map<string, string[]>();

  for (const row of rows) {
    const dates = grouped.get(row.wallet_address) || [];
    dates.push(row.checkin_date);
    grouped.set(row.wallet_address, dates);
  }

  return [...grouped.entries()]
    .map(([walletAddress, dates]) => ({
      walletAddress,
      ...calculateStats(dates),
    }))
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.currentStreak - a.currentStreak ||
        b.longestStreak - a.longestStreak ||
        b.totalGmDays - a.totalGmDays
    )
    .slice(0, limit);
}
