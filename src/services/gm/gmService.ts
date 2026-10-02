import { createPublicClient, fallback, http, isAddress, keccak256, toHex } from 'viem';
import { ARC_MAINNET_RPC_URL, arcChain } from '../../config/arc';
import { GM_CONTRACT_ADDRESS } from '../../config/gmContract';

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

// Arcscan's public RPC is a mainnet-only failover gateway. Put it first so a
// transient failure from the primary Arc RPC cannot surface as a generic
// "HTTP request failed" in the GM flow. Neither endpoint can sign transactions.
const GM_READ_TRANSPORT = fallback([
  http('https://rpc.arc-scan.org', { timeout: 10_000 }),
  http(ARC_MAINNET_RPC_URL, { timeout: 10_000 }),
], { rank: { interval: 3_000, sampleCount: 2 } });

const publicClient = createPublicClient({
  chain: arcChain,
  transport: GM_READ_TRANSPORT,
});

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

async function fetchExplorerTransaction(txHash: string): Promise<{ status: string; timestamp?: string | null } | null> {
  try {
    const response = await fetch(
      `https://explorer.arc.io/api/v2/transactions/${txHash}`,
      { headers: { Accept: 'application/json' }, cache: 'no-store' },
    );
    if (!response.ok) return null;
    const data = await response.json() as { status?: string; timestamp?: string | null };
    return data;
  } catch {
    return null;
  }
}

export async function waitForConfirmedGM(
  txHash: string,
  timeoutMs = 90_000,
): Promise<{ receipt: any; checkinDate: string | null }> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    // Primary: canonical Arc JSON-RPC receipt.
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const receipt = await publicClient.getTransactionReceipt({
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
            if (topics.length < 3 || String(topics[0]).toLowerCase() !== GM_EVENT_TOPIC0.toLowerCase()) continue;
            const data = String(log.data || '');
            if (!/^0x[a-fA-F0-9]{64,}$/.test(data)) continue;
            const timestamp = BigInt(`0x${data.slice(2, 66)}`);
            checkinDate = getUtcDate(timestamp);
            break;
          } catch {}
        }

        if (!checkinDate) {
          const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
          checkinDate = getUtcDate(block.timestamp);
        }
        return { receipt, checkinDate };
      } catch (error: any) {
        const message = String(error?.message || '');
        if (/revert|execution reverted/i.test(message)) throw error;
      }
    }

    // Secondary: Arc's canonical explorer (Blockscout) can know the
    // transaction before an RPC provider's receipt endpoint catches up.
    const explorerTx = await fetchExplorerTransaction(txHash);
    if (explorerTx?.status) {
      const normalized = explorerTx.status.toLowerCase();
      if (normalized === 'ok' || normalized === 'success' || normalized === 'confirmed') {
        return {
          receipt: { status: 'success', hash: txHash },
          checkinDate: explorerTx.timestamp ? explorerTx.timestamp.slice(0, 10) : todayKey(),
        };
      }
      if (/error|fail|revert/.test(normalized)) {
        throw new Error('GM transaction reverted on Arc Mainnet.');
      }
    }

    await sleep(1_000);
  }

  throw new Error('Arc Mainnet did not return a confirmed GM receipt within 90 seconds.');
}

export function statsWithOptimisticDay(
  confirmedDays: string[],
  confirmedDate: string,
): GMStats {
  return calculateGMStats([...new Set([...confirmedDays, confirmedDate])]);
}
