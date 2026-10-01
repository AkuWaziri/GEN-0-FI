import { supabase } from '../../lib/supabase';
import { getAddress, parseAbiItem, keccak256, toHex } from 'viem';
import { GM_CONTRACT_ADDRESS, isGMContractConfigured } from '../../config/gmContract';

export interface GMStats {
  currentStreak: number;
  longestStreak: number;
  totalGmDays: number;
  points: number;
  checkedInToday: boolean;
  lastCheckinDate: string | null;
}

export interface GMLeaderboardRow {
  walletAddress: string;
  currentStreak: number;
  longestStreak: number;
  totalGmDays: number;
  points: number;
  lastCheckinDate?: string | null;
}

const dateKey = (date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const previousDateKey = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return dateKey(d);
};

export const GM_STREAK_DAILY_CAP = 300;

export const getGMStreakPoints = (streak: number): number => {
  if (streak <= 0) return 0;
  return streak >= 14 ? GM_STREAK_DAILY_CAP : streak * 10;
};

const calculateStats = (dates: string[], today: string): GMStats => {
  const unique = [...new Set(dates)].sort();
  const checkedInToday = unique.includes(today);
  const yesterday = previousDateKey(today);
  let currentStreak = 0;
  let cursor = checkedInToday ? today : yesterday;
  const dateSet = new Set(unique);

  if (dateSet.has(cursor)) {
    while (dateSet.has(cursor)) {
      currentStreak += 1;
      cursor = previousDateKey(cursor);
    }
  }

  let longestStreak = 0;
  let run = 0;
  let points = 0;
  for (let i = 0; i < unique.length; i += 1) {
    if (i === 0 || previousDateKey(unique[i]) === unique[i - 1]) run += 1;
    else run = 1;
    longestStreak = Math.max(longestStreak, run);
    points += getGMStreakPoints(run);
  }

  return { currentStreak, longestStreak, totalGmDays: unique.length, points, checkedInToday, lastCheckinDate: unique.at(-1) || null };
};

export async function getGMStats(walletAddress: string): Promise<GMStats> {
  const normalized = walletAddress.toLowerCase();
  const today = dateKey();
  if (!supabase) return { currentStreak: 0, longestStreak: 0, totalGmDays: 0, points: 0, checkedInToday: false, lastCheckinDate: null };

  const { data, error } = await supabase.from('gm_checkins').select('checkin_date').eq('wallet_address', normalized).order('checkin_date', { ascending: true });
  if (error) throw error;
  return calculateStats((data || []).map((row) => row.checkin_date), today);
}

export async function indexConfirmedGM(walletAddress: string, txHash: string): Promise<GMStats> {
  if (!supabase) throw new Error('GM indexing is not configured.');
  const normalized = walletAddress.toLowerCase();
  const today = dateKey();
  const { error } = await supabase.from('gm_checkins').insert({ wallet_address: normalized, checkin_date: today, tx_hash: txHash.toLowerCase(), chain_id: 5042 });
  if (error && error.code !== '23505') throw error;
  return getGMStats(normalized);
}

export async function indexConfirmedGMDays(walletAddress: string, onchainDays: Array<string | bigint>): Promise<GMStats> {
  if (!supabase) throw new Error('GM indexing is not configured.');
  const normalized = walletAddress.toLowerCase();
  const rows = [...new Set(onchainDays.map((day) => day.toString()))]
    .map((day) => Number(day))
    .filter((day) => Number.isSafeInteger(day) && day >= 0)
    .map((day) => ({
      wallet_address: normalized,
      checkin_date: new Date(day * 86400000).toISOString().slice(0, 10),
      chain_id: 5042,
    }));

  if (rows.length) {
    // Do not depend on a database UNIQUE constraint for reconciliation.
    // Some existing deployments only have the base gm_checkins columns.
    const dates = rows.map((row) => row.checkin_date);
    const { data: existing, error: lookupError } = await supabase
      .from('gm_checkins')
      .select('checkin_date')
      .eq('wallet_address', normalized)
      .in('checkin_date', dates);

    if (lookupError) throw lookupError;

    const existingDates = new Set((existing || []).map((row) => row.checkin_date));
    const missingRows = rows.filter((row) => !existingDates.has(row.checkin_date));

    if (missingRows.length) {
      const { error: insertError } = await supabase.from('gm_checkins').insert(missingRows);
      if (insertError && insertError.code !== '23505') throw insertError;
    }
  }
  return getGMStats(normalized);
}

const GM_EVENT_TOPIC0 = keccak256(toHex('GMCheckedIn(address,uint256,uint256,uint256)'));
const ARC_SCAN_API = 'https://api.arc-scan.org/v1';

type ArcscanLog = {
  transaction_hash?: string;
  tx_hash?: string;
  args?: { wallet?: string; day?: string | number };
  wallet?: string;
  day?: string | number;
};

const extractArcscanRows = (payload: any): ArcscanLog[] => {
  const root = payload?.data ?? payload?.result ?? payload;
  if (Array.isArray(root)) return root;
  if (Array.isArray(root?.items)) return root.items;
  if (Array.isArray(root?.logs)) return root.logs;
  if (Array.isArray(root?.data)) return root.data;
  if (Array.isArray(root?.result)) return root.result;
  return [];
};

const extractArcscanCursor = (payload: any): string | null => {
  const root = payload?.data ?? payload?.result ?? payload;
  return root?.next_cursor ?? root?.nextCursor ?? root?.pagination?.next_cursor ?? null;
};

const decodeGMLog = (log: ArcscanLog) => {
  const args = log.args || {};
  const wallet = String(args.wallet || log.wallet || '').toLowerCase();
  const dayValue = args.day ?? log.day;
  if (!/^0x[a-f0-9]{40}$/.test(wallet) || dayValue == null) return null;
  const day = Number(dayValue);
  if (!Number.isSafeInteger(day) || day < 0) return null;
  return {
    wallet_address: wallet,
    checkin_date: new Date(day * 86400000).toISOString().slice(0, 10),
    tx_hash: String(log.transaction_hash || log.tx_hash || '').toLowerCase() || null,
    chain_id: 5042,
  };
};

async function fetchConfirmedGMRows() {
  const rows: Array<{ wallet_address: string; checkin_date: string; tx_hash: string | null; chain_id: number }> = [];
  let cursor: string | null = null;
  const seenCursors = new Set<string>();
  for (let page = 0; page < 1000; page += 1) {
    const params = new URLSearchParams({ limit: '100', topic0: GM_EVENT_TOPIC0 });
    if (cursor) params.set('cursor', cursor);
    const response = await fetch(ARC_SCAN_API + '/address/' + GM_CONTRACT_ADDRESS + '/logs?' + params.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Arcscan GM logs request failed: ' + response.status);
    const payload = await response.json();
    const pageRows = extractArcscanRows(payload).map(decodeGMLog).filter(Boolean) as typeof rows;
    rows.push(...pageRows);
    const next = extractArcscanCursor(payload);
    if (!next || seenCursors.has(next) || pageRows.length === 0) break;
    seenCursors.add(next);
    cursor = next;
  }
  return rows;
}

export async function syncConfirmedGMEvents(_publicClient?: any, _lookbackBlocks = 0): Promise<number> {
  if (!supabase || !isGMContractConfigured) return 0;
  try {
    const rows = await fetchConfirmedGMRows();
    if (!rows.length) return 0;
    const deduped = [...new Map(rows.map((row) => [row.wallet_address + ':' + row.checkin_date, row])).values()];
    const { error } = await supabase.from('gm_checkins').upsert(deduped, { onConflict: 'wallet_address,checkin_date', ignoreDuplicates: true });
    if (error) throw error;
    return deduped.length;
  } catch (error) {
    console.warn('GM event sync failed:', error);
    return 0;
  }
}
export async function getGMLeaderboard(limit = 20): Promise<GMLeaderboardRow[]> {
  if (!supabase) return [];
  const { data, error } = await supabase.from('gm_checkins').select('wallet_address, checkin_date').order('wallet_address', { ascending: true }).order('checkin_date', { ascending: true });
  if (error) throw error;
  const grouped = new Map<string, string[]>();
  for (const row of data || []) {
    const list = grouped.get(row.wallet_address) || [];
    list.push(row.checkin_date);
    grouped.set(row.wallet_address, list);
  }
  const today = dateKey();
  return [...grouped.entries()].map(([walletAddress, dates]) => ({ walletAddress, ...calculateStats(dates, today) })).sort((a, b) => b.points - a.points || b.longestStreak - a.longestStreak || b.totalGmDays - a.totalGmDays).slice(0, limit);
}
