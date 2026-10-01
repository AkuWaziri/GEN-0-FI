import { supabase } from '../../lib/supabase';
import { getAddress, parseAbiItem } from 'viem';
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

export async function syncConfirmedGMEvents(publicClient: any, lookbackBlocks = 600000): Promise<number> {
  if (!supabase || !isGMContractConfigured) return 0;

  try {
    const latestBlock = await publicClient.getBlockNumber();
    const startBlock = latestBlock > BigInt(lookbackBlocks) ? latestBlock - BigInt(lookbackBlocks) : 0n;
    const chunkSize = 20000n;
    const event = parseAbiItem('event GMCheckedIn(address indexed wallet, uint256 indexed day, uint256 timestamp, uint256 fee)');
    let indexed = 0;

    for (let fromBlock = startBlock; fromBlock <= latestBlock; fromBlock += chunkSize) {
      const toBlock = fromBlock + chunkSize - 1n > latestBlock ? latestBlock : fromBlock + chunkSize - 1n;
      const logs = await publicClient.getLogs({
        address: getAddress(GM_CONTRACT_ADDRESS),
        event,
        fromBlock,
        toBlock,
      });

      if (!logs.length) continue;

      const rows = logs.map((log: any) => ({
        wallet_address: String(log.args.wallet).toLowerCase(),
        checkin_date: new Date(Number(log.args.day) * 86400000).toISOString().slice(0, 10),
        tx_hash: String(log.transactionHash).toLowerCase(),
        chain_id: 5042,
      }));

      const { error } = await supabase.from('gm_checkins').upsert(rows, {
        onConflict: 'wallet_address,checkin_date',
        ignoreDuplicates: true,
      });
      if (error) throw error;
      indexed += rows.length;
    }

    return indexed;
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
