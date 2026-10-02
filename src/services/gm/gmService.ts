import { createPublicClient, http, isAddress, keccak256, toHex } from 'viem';
import { ARC_MAINNET_RPC_URL, arcChain } from '../../config/arc';
import { GM_CONTRACT_ABI, GM_CONTRACT_ADDRESS } from '../../config/gmContract';

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

export interface GMStatusResponse {
  wallet: string;
  stats: GMStats;
  confirmedDays: string[];
  latestTxHash: string | null;
  source: string;
}

export const GM_STREAK_DAILY_CAP = 300;

const GM_EVENT_TOPIC0 = keccak256(
  toHex('GMCheckedIn(address,uint256,uint256,uint256)')
);

export const getGMStreakPoints = (streak: number): number => {
  if (streak <= 0) return 0;
  return streak >= 14 ? GM_STREAK_DAILY_CAP : streak * 10;
};

const publicClients = [
  createPublicClient({
    chain: arcChain,
    transport: http(ARC_MAINNET_RPC_URL, { timeout: 8_000 }),
  }),
  createPublicClient({
    chain: arcChain,
    transport: http('https://rpc.arc-scan.org', { timeout: 8_000 }),
  }),
];

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getUtcDate = (timestampSeconds: bigint) =>
  new Date(Number(timestampSeconds) * 1000).toISOString().slice(0, 10);

const previousDateKey = (date: string) => {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
};

const todayKey = () => new Date().toISOString().slice(0, 10);

export function calculateGMStats(dates: string[], today = todayKey()): GMStats {
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

  for (let i = 0; i < unique.length; i += 1) {
    run = i > 0 && previousDateKey(unique[i]) === unique[i - 1] ? run + 1 : 1;
    longestStreak = Math.max(longestStreak, run);
    points += getGMStreakPoints(run);
  }

  return {
    currentStreak,
    longestStreak,
    totalGmDays: unique.length,
    points,
    checkedInToday,
    lastCheckinDate: unique.at(-1) || null,
  };
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!response.ok) throw new Error(`GM API request failed: ${response.status}`);
  return response.json() as Promise<T>;
}

export async function getGMStats(walletAddress: string): Promise<GMStats> {
  if (!isAddress(walletAddress, { strict: false })) return calculateGMStats([]);

  const data = await fetchJson<GMStatusResponse>(
    `/api/gm/status?address=${encodeURIComponent(walletAddress)}`
  );
  return data.stats;
}

export async function getGMStatus(walletAddress: string): Promise<GMStatusResponse> {
  return fetchJson<GMStatusResponse>(
    `/api/gm/status?address=${encodeURIComponent(walletAddress)}`
  );
}

export async function getGMLeaderboard(limit = 20): Promise<GMLeaderboardRow[]> {
  const data = await fetchJson<{ leaderboard: GMLeaderboardRow[] }>(
    `/api/gm/leaderboard?limit=${Math.min(Math.max(limit, 1), 100)}`
  );
  return data.leaderboard || [];
}

export async function waitForConfirmedGM(
  txHash: string,
  timeoutMs = 45_000,
): Promise<{ receipt: any; checkinDate: string | null }> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    for (const client of publicClients) {
      try {
        const receipt = await client.getTransactionReceipt({
          hash: txHash as `0x${string}`,
        });

        if (receipt.status !== 'success') {
          throw new Error('GM transaction reverted on Arc Mainnet.');
        }

        let checkinDate: string | null = null;

        for (const log of receipt.logs) {
          if (String(log.address).toLowerCase() !== GM_CONTRACT_ADDRESS.toLowerCase()) continue;

          try {
            const topics = Array.isArray(log.topics) ? log.topics : [];
            if (topics.length < 3) continue;
            if (String(topics[0]).toLowerCase() !== GM_EVENT_TOPIC0.toLowerCase()) continue;

            // GMCheckedIn has wallet/day indexed. The timestamp is the first
            // 32-byte word in the non-indexed event data.
            const data = String(log.data || '');
            if (!/^0x[a-fA-F0-9]{64,}$/.test(data)) continue;
            const timestamp = BigInt(`0x${data.slice(2, 66)}`);
            checkinDate = getUtcDate(timestamp);
            break;
          } catch {
            // Ignore unrelated logs from the same receipt.
          }
        }

        if (!checkinDate) {
          const block = await client.getBlock({ blockNumber: receipt.blockNumber });
          checkinDate = getUtcDate(block.timestamp);
        }

        return { receipt, checkinDate };
      } catch (error: any) {
        const message = String(error?.message || '');
        if (/revert|execution reverted/i.test(message)) throw error;
      }
    }

    await sleep(1_000);
  }

  throw new Error('Arc Mainnet did not return a confirmed GM receipt within 45 seconds.');
}

export function statsWithOptimisticDay(
  confirmedDays: string[],
  confirmedDate: string,
): GMStats {
  return calculateGMStats([...new Set([...confirmedDays, confirmedDate])]);
}
