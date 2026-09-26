import { supabase } from '../../lib/supabase';

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
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'UTC',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${values.year}-${values.month}-${values.day}`;
};

const previousDateKey = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return dateKey(d);
};

export const GM_STREAK_MAX_DAILY_POINTS = 100;
export const GM_STREAK_CYCLE_DAYS = 30;

/** Daily reward rises by 10 points per consecutive day, capped at 100. */
export const getGMStreakPoints = (streak: number): number => {
  if (streak <= 0) return 0;
  const cycleDay = ((streak - 1) % GM_STREAK_CYCLE_DAYS) + 1;
  return Math.min(cycleDay * 10, GM_STREAK_MAX_DAILY_POINTS);
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
    currentStreak = ((currentStreak - 1) % GM_STREAK_CYCLE_DAYS) + 1;
  }

  let longestStreak = 0;
  let run = 0;
  let points = 0;
  for (let i = 0; i < unique.length; i += 1) {
    if (i === 0 || previousDateKey(unique[i]) === unique[i - 1]) run += 1;
    else run = 1;
    // The displayed streak and daily reward cycle after day 30; points remain lifetime cumulative.
    const cycleDay = ((run - 1) % GM_STREAK_CYCLE_DAYS) + 1;
    longestStreak = Math.max(longestStreak, Math.min(run, GM_STREAK_CYCLE_DAYS));
    points += getGMStreakPoints(cycleDay);
  }

  return {
    currentStreak,
    longestStreak,
    totalGmDays: unique.length,
    points,
    checkedInToday,
    lastCheckinDate: unique.at(-1) || null,
  };
};

export async function getGMStats(walletAddress: string): Promise<GMStats> {
  const normalized = walletAddress.toLowerCase();
  const today = dateKey();

  if (!supabase) {
    return {
      currentStreak: 0,
      longestStreak: 0,
      totalGmDays: 0,
      points: 0,
      checkedInToday: false,
      lastCheckinDate: null,
    };
  }

  const { data, error } = await supabase
    .from('gm_checkins')
    .select('checkin_date')
    .eq('wallet_address', normalized)
    .order('checkin_date', { ascending: true });

  if (error) throw error;
  return calculateStats((data || []).map((row) => row.checkin_date), today);
}

/**
 * Index a GM only after the Arc mainnet transaction has been confirmed.
 * The blockchain transaction is the source of truth. Supabase is only the index.
 */
export async function indexConfirmedGM(
  walletAddress: string,
  txHash: string,
): Promise<GMStats> {
  if (!supabase) throw new Error('GM indexing is not configured.');

  const normalized = walletAddress.toLowerCase();
  const today = dateKey();

  const { error } = await supabase
    .from('gm_checkins')
    .insert({
      wallet_address: normalized,
      checkin_date: today,
      tx_hash: txHash.toLowerCase(),
      chain_id: 5042,
    });

  if (error && error.code !== '23505') throw error;
  return getGMStats(normalized);
}

export async function indexConfirmedGMDays(
  walletAddress: string,
  onchainDays: Array<string | bigint>,
): Promise<GMStats> {
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
    const { error } = await supabase
      .from('gm_checkins')
      .upsert(rows, {
        onConflict: 'wallet_address,checkin_date',
        ignoreDuplicates: true,
      });

    if (error) throw error;
  }

  return getGMStats(normalized);
}

export async function getGMLeaderboard(limit = 20): Promise<GMLeaderboardRow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('gm_checkins')
    .select('wallet_address, checkin_date')
    .order('wallet_address', { ascending: true })
    .order('checkin_date', { ascending: true });

  if (error) throw error;

  const grouped = new Map<string, string[]>();
  for (const row of data || []) {
    const list = grouped.get(row.wallet_address) || [];
    list.push(row.checkin_date);
    grouped.set(row.wallet_address, list);
  }

  const today = dateKey();
  return [...grouped.entries()]
    .map(([walletAddress, dates]) => {
      const stats = calculateStats(dates, today);
      return { walletAddress, ...stats };
    })
    .sort((a, b) => b.points - a.points || b.longestStreak - a.longestStreak || b.totalGmDays - a.totalGmDays)
    .slice(0, limit);
}
