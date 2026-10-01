import React, { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, ExternalLink, Flame, RefreshCw, Trophy } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { useWriteContract } from 'wagmi';
import { createPublicClient, http } from 'viem';
import {
  GM_CONTRACT_ABI,
  GM_CONTRACT_ADDRESS,
  GM_FEE_WEI,
  isGMContractConfigured,
} from '../../config/gmContract';
import {
  getGMLeaderboard,
  getGMStatus,
  getGMStats,
  statsWithOptimisticDay,
  waitForConfirmedGM,
  GMLeaderboardRow,
  GMStats,
} from '../../services/gm/gmService';
import { isSupabaseConfigured } from '../../lib/supabase';
import {
  ARC_CHAIN_ID,
  ARC_MAINNET_RPC_URL,
  arcChain,
  getArcScanTxUrl,
} from '../../config/arc';

const short = (value: string) => `${value.slice(0, 6)}...${value.slice(-4)}`;
const PENDING_GM_TX_KEY = 'gen0fi:pending-gm-tx';

const emptyStats = (): GMStats => ({
  currentStreak: 0,
  longestStreak: 0,
  totalGmDays: 0,
  points: 0,
  checkedInToday: false,
  lastCheckinDate: null,
});

export const GMStreakView: React.FC = () => {
  const { address, isCorrectNetwork } = useWallet();
  const { writeContractAsync } = useWriteContract();

  const publicClient = createPublicClient({
    chain: arcChain,
    transport: http(ARC_MAINNET_RPC_URL, { timeout: 8_000 }),
  });

  const [stats, setStats] = useState<GMStats>(emptyStats());
  const [leaderboard, setLeaderboard] = useState<GMLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'wallet' | 'onchain'>('idle');
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmedToday, setConfirmedToday] = useState(false);

  const refreshLeaderboard = useCallback(async () => {
    try {
      setLeaderboard(await getGMLeaderboard(20));
    } catch (err) {
      console.warn('GM leaderboard refresh failed:', err);
    }
  }, []);

  const load = useCallback(async () => {
    if (!address) {
      setStats(emptyStats());
      setLeaderboard([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const status = await getGMStatus(address);
      setStats(status.stats);
      setConfirmedToday(status.stats.checkedInToday);
      if (status.latestTxHash) setTxHash(status.latestTxHash);
      await refreshLeaderboard();
    } catch (err) {
      console.error('GM streak load failed:', err);
      setError('GM Streak is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [address, refreshLeaderboard]);

  const recoverPending = useCallback(async () => {
    if (!address) return;

    const pendingHash = window.localStorage.getItem(PENDING_GM_TX_KEY);
    if (!pendingHash) return;

    try {
      setCheckingIn(true);
      setPhase('onchain');

      const confirmed = await waitForConfirmedGM(pendingHash, 20_000);
      const status = await getGMStatus(address).catch(() => null);

      if (status?.stats.checkedInToday) {
        setStats(status.stats);
        setConfirmedToday(true);
      } else if (confirmed.checkinDate) {
        const optimistic = status
          ? statsWithOptimisticDay(status.confirmedDays, confirmed.checkinDate)
          : statsWithOptimisticDay([], confirmed.checkinDate);
        setStats(optimistic);
        setConfirmedToday(true);
      }

      setTxHash(pendingHash);
      window.localStorage.removeItem(PENDING_GM_TX_KEY);
      await refreshLeaderboard();
    } catch (err) {
      console.warn('Pending GM recovery deferred:', err);
    } finally {
      setCheckingIn(false);
      setPhase('idle');
    }
  }, [address, refreshLeaderboard]);

  useEffect(() => {
    setConfirmedToday(false);
    setTxHash(null);
    void recoverPending().then(() => load());
  }, [address, recoverPending, load]);

  const handleCheckIn = async () => {
    if (!address || checkingIn || confirmedToday || stats.checkedInToday) return;

    if (!isCorrectNetwork) {
      setError('Switch your wallet to Arc Mainnet before checking in.');
      return;
    }

    if (!isGMContractConfigured) {
      setError('The Arc Mainnet GM contract is not configured.');
      return;
    }

    setCheckingIn(true);
    setError(null);
    setTxHash(null);
    setPhase('wallet');

    try {
      // The current Arc state is checked before opening the wallet.
      // This prevents a duplicate daily transaction from being submitted.
      const current = await getGMStatus(address);
      if (current.stats.checkedInToday) {
        setStats(current.stats);
        setConfirmedToday(true);
        setTxHash(current.latestTxHash);
        return;
      }

      await publicClient.simulateContract({
        address: GM_CONTRACT_ADDRESS as `0x${string}`,
        abi: GM_CONTRACT_ABI,
        functionName: 'checkIn',
        value: GM_FEE_WEI,
        account: address as `0x${string}`,
      });

      const hash = await writeContractAsync({
        address: GM_CONTRACT_ADDRESS as `0x${string}`,
        abi: GM_CONTRACT_ABI,
        functionName: 'checkIn',
        value: GM_FEE_WEI,
        chainId: ARC_CHAIN_ID,
      } as any);

      setTxHash(hash);
      window.localStorage.setItem(PENDING_GM_TX_KEY, hash);
      setPhase('onchain');

      // Never wait on the old single-RPC receipt path.
      // We check both Arc Mainnet RPC and Arcscan's public RPC.
      const confirmed = await waitForConfirmedGM(hash);

      // A successful receipt is enough to lock the button immediately.
      setConfirmedToday(true);

      // Pull the complete verified event history for this wallet. If Arcscan's
      // index is a few blocks behind, temporarily include the confirmed day so
      // points/streak are still correct in this session.
      let status = null as Awaited<ReturnType<typeof getGMStatus>> | null;

      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          status = await getGMStatus(address);
          if (status.stats.checkedInToday) break;
        } catch {
          // The receipt is already authoritative; retry the index independently.
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000));
      }

      if (status?.stats.checkedInToday) {
        setStats(status.stats);
      } else if (confirmed.checkinDate) {
        setStats(
          status
            ? statsWithOptimisticDay(status.confirmedDays, confirmed.checkinDate)
            : statsWithOptimisticDay([], confirmed.checkinDate)
        );
      }

      window.localStorage.removeItem(PENDING_GM_TX_KEY);
      await refreshLeaderboard();
    } catch (err: any) {
      console.error('GM check-in failed:', err);
      const message = String(err?.shortMessage || err?.message || '');

      if (/user rejected|user denied|rejected the request/i.test(message)) {
        setError('Rejected');
      } else if (/already checked in today|already checked in|execution reverted|reverted/i.test(message)) {
        try {
          const status = await getGMStatus(address);
          if (status.stats.checkedInToday) {
            setStats(status.stats);
            setConfirmedToday(true);
            setTxHash(status.latestTxHash);
            setError('You already checked in today.');
          } else {
            setError('GM transaction failed. No GM was recorded.');
          }
        } catch {
          setError('GM transaction failed. No GM was recorded.');
        }
      } else {
        setError('GM transaction failed. No GM was recorded.');
      }
    } finally {
      setCheckingIn(false);
      setPhase('idle');
    }
  };

  const isDone = confirmedToday || stats.checkedInToday;

  if (!isSupabaseConfigured || !isGMContractConfigured) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
        <div className="max-w-3xl mx-auto rounded-2xl border border-blue-500/20 bg-[#111317] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Flame className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold text-white">GM Streak</h1>
          </div>
          <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
            {!isSupabaseConfigured
              ? 'GM indexing is not configured. Add the Supabase browser variables in Vercel.'
              : 'The Arc Mainnet GM contract is not configured.'}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">
              Daily onchain check-in
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              GM Streak
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              One confirmed GM per Arc Mainnet day · 0.01 USDC fee
            </p>
          </div>
          <button
            onClick={() => void load()}
            disabled={loading || checkingIn}
            aria-label="Refresh GM Streak"
            className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:border-blue-500/30 transition-colors disabled:opacity-40"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">
            {error}
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.06] p-5">
            <Flame className="w-5 h-5 text-blue-400 mb-4" />
            <div className="text-3xl font-bold text-white">{stats.currentStreak}</div>
            <div className="text-xs text-zinc-500 mt-1">Current streak</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <Trophy className="w-5 h-5 text-zinc-300 mb-4" />
            <div className="text-3xl font-bold text-white">{stats.longestStreak}</div>
            <div className="text-xs text-zinc-500 mt-1">Longest streak</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <CalendarDays className="w-5 h-5 text-zinc-300 mb-4" />
            <div className="text-3xl font-bold text-white">{stats.totalGmDays}</div>
            <div className="text-xs text-zinc-500 mt-1">Total GM days</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="text-5xl leading-none mb-2">⚡</div>
            <div className="text-3xl font-bold text-white">{stats.points}</div>
            <div className="text-xs text-zinc-500 mt-1">GM points</div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            <div className="text-sm font-semibold text-white">
              {isDone ? 'GM Done' : phase === 'wallet' ? 'Confirm in your wallet' : phase === 'onchain' ? 'Verifying on Arc Mainnet' : 'GM Today'}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {isDone
                ? 'Confirmed on Arc Mainnet. Come back tomorrow to extend your streak.'
                : 'Pay 0.01 USDC on Arc Mainnet to check in today.'}
            </div>
          </div>

          <button
            onClick={() => void handleCheckIn()}
            disabled={checkingIn || loading || isDone}
            className={`w-full sm:w-auto min-w-40 flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-bold transition-colors disabled:cursor-not-allowed ${
              isDone
                ? 'bg-zinc-700 text-zinc-400 opacity-80'
                : 'bg-white text-black hover:bg-zinc-200 disabled:opacity-50'
            }`}
          >
            {checkingIn ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Check className="w-4 h-4" />
            )}
            {checkingIn ? (phase === 'wallet' ? 'Waiting for wallet…' : 'Verifying…') : isDone ? 'GM Done' : 'GM Today'}
          </button>
        </div>

        {txHash && (
          <a
            href={getArcScanTxUrl(txHash)}
            target="_blank"
            rel="noreferrer"
            className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300"
          >
            Confirmed transaction: {short(txHash)}
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        <div className="rounded-2xl border border-zinc-800 bg-[#111317] overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">GM Streak Leaderboard</h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">
                Points from confirmed Arc GM check-ins
              </p>
            </div>
            <Trophy className="w-4 h-4 text-zinc-500" />
          </div>

          <div className="divide-y divide-zinc-800/70">
            {leaderboard.map((row, index) => (
              <div key={row.walletAddress} className="px-5 py-3.5 flex items-center gap-4">
                <span className="w-6 text-xs font-mono text-zinc-500">
                  {String(index + 1).padStart(2, '0')}
                </span>
                <span className="flex-1 text-xs font-mono text-zinc-300">
                  {short(row.walletAddress)}
                </span>
                <span className="text-xs text-zinc-500">{row.totalGmDays} days</span>
                <span className="text-xs font-semibold text-white min-w-16 text-right">
                  {row.points} pts
                </span>
              </div>
            ))}

            {!leaderboard.length && (
              <div className="px-5 py-8 text-center text-xs text-zinc-500">
                No confirmed GM check-ins yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
