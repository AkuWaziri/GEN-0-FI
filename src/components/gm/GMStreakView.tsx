import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
  getGMStats,
  indexConfirmedGMDays,
  syncConfirmedGMEvents,
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

const getChainDay = (timestamp: bigint) => timestamp / 86400n;

export const GMStreakView: React.FC = () => {
  const { address, isCorrectNetwork } = useWallet();
  const { writeContractAsync } = useWriteContract();

  const publicClient = useMemo(
    () => createPublicClient({ chain: arcChain, transport: http(ARC_MAINNET_RPC_URL) }),
    []
  );

  const [stats, setStats] = useState<GMStats>(emptyStats());
  const [leaderboard, setLeaderboard] = useState<GMLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmedToday, setConfirmedToday] = useState(false);

  const refreshLeaderboard = useCallback(async () => {
    setLeaderboard(await getGMLeaderboard(20));
  }, []);

  const reconcileOnchainState = useCallback(async (wallet: string, confirmedHash?: string) => {
    const block = await publicClient.getBlock();
    const todayDay = getChainDay(block.timestamp);

    const lastDay = await publicClient.readContract({
      address: GM_CONTRACT_ADDRESS as `0x${string}`,
      abi: GM_CONTRACT_ABI,
      functionName: 'lastCheckInDay',
      args: [wallet as `0x${string}`],
    });

    if (String(lastDay) !== String(todayDay)) {
      return false;
    }

    setConfirmedToday(true);
    if (confirmedHash) {
      setTxHash(confirmedHash);
      window.localStorage.removeItem(PENDING_GM_TX_KEY);
    }

    // Arc is authoritative. Mark the UI done immediately from confirmed
    // contract state. Database indexing/leaderboard work must never be able
    // to turn a confirmed onchain GM back into an active button.
    setConfirmedToday(true);

    if (confirmedHash) {
      setTxHash(confirmedHash);
      window.localStorage.removeItem(PENDING_GM_TX_KEY);
    }

    try {
      const repairedStats = await indexConfirmedGMDays(wallet, [lastDay]);
      setStats(repairedStats);
      await refreshLeaderboard();
    } catch (indexError) {
      console.warn('GM points index deferred after confirmed onchain GM:', indexError);
    }

    return true;
  }, [publicClient, refreshLeaderboard]);

  const load = useCallback(async () => {
    if (!address) return;

    setLoading(true);
    setError(null);

    try {
      // Arc Mainnet is the authority for today's GM. Check it first so a
      // confirmed check-in can immediately put the button into the done state.
      // Supabase is only an index for points and leaderboard data.
      if (isGMContractConfigured) {
        try {
          await reconcileOnchainState(address);
        } catch (chainError) {
          console.warn('GM onchain reconciliation deferred:', chainError);
        }
      }

      // Backfill historical confirmed events after the current-day state has
      // been reconciled. A sync/indexing problem must never keep the button active.
      if (isGMContractConfigured) {
        await syncConfirmedGMEvents(publicClient, 600000);
      }

      const nextStats = await getGMStats(address);
      setStats((current) => ({
        ...nextStats,
        checkedInToday: current.checkedInToday || confirmedToday,
      }));

      await refreshLeaderboard();
    } catch (err) {
      console.error('GM streak load failed:', err);
      setError('GM Streak is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [address, reconcileOnchainState, refreshLeaderboard]);

  const recoverPending = useCallback(async () => {
    if (!address || !isGMContractConfigured) return;

    const pendingHash = window.localStorage.getItem(PENDING_GM_TX_KEY);
    if (!pendingHash) return;

    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: pendingHash as `0x${string}`,
      });

      if (receipt.status === 'success') {
        await reconcileOnchainState(address, pendingHash);
      } else {
        window.localStorage.removeItem(PENDING_GM_TX_KEY);
      }
    } catch {
      // The transaction may still be pending. Do not manufacture a GM result.
    }
  }, [address, publicClient, reconcileOnchainState]);

  useEffect(() => {
    setConfirmedToday(false);
    setTxHash(null);

    let cancelled = false;

    const initialise = async () => {
      if (!address) {
        setStats(emptyStats());
        setLeaderboard([]);
        setLoading(false);
        return;
      }

      await recoverPending();
      if (cancelled) return;

      await load();
    };

    void initialise();

    return () => {
      cancelled = true;
    };
  }, [address, load, recoverPending]);

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

    try {
      // Preflight against the actual Arc contract. This prevents the wallet
      // from being asked to simulate a transaction that the contract will reject.
      if (await reconcileOnchainState(address)) {
        return;
      }

      const hash = await writeContractAsync({
        address: GM_CONTRACT_ADDRESS as `0x${string}`,
        abi: GM_CONTRACT_ABI,
        functionName: 'checkIn',
        value: GM_FEE_WEI,
        chainId: ARC_CHAIN_ID,
      } as any);

      setTxHash(hash);
      window.localStorage.setItem(PENDING_GM_TX_KEY, hash);

      // This is the only point at which the UI is allowed to call the GM
      // confirmed: the Arc Mainnet transaction receipt is successful.
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      if (receipt.status !== 'success') {
        throw new Error('GM transaction reverted on Arc.');
      }

      // Verify the transaction emitted the GM contract event before awarding
      // the daily index. This ties points to a confirmed onchain GM.
      const event = GM_CONTRACT_ABI.find(
        (item) => item.type === 'event' && item.name === 'GMCheckedIn'
      ) as any;

      let eventDay: bigint | null = null;

      if (event) {
        const logs = await publicClient.getLogs({
          address: GM_CONTRACT_ADDRESS as `0x${string}`,
          event,
          fromBlock: receipt.blockNumber,
          toBlock: receipt.blockNumber,
        });

        const matchingLog = logs.find(
          (log: any) =>
            String(log.transactionHash).toLowerCase() === hash.toLowerCase() &&
            String(log.args?.wallet || '').toLowerCase() === address.toLowerCase()
        );

        if (matchingLog?.args?.day != null) {
          eventDay = BigInt(matchingLog.args.day);
        }
      }

      if (eventDay == null) {
        const block = await publicClient.getBlock({ blockNumber: receipt.blockNumber });
        const todayDay = getChainDay(block.timestamp);
        const lastDay = await publicClient.readContract({
          address: GM_CONTRACT_ADDRESS as `0x${string}`,
          abi: GM_CONTRACT_ABI,
          functionName: 'lastCheckInDay',
          args: [address as `0x${string}`],
        });

        if (String(lastDay) !== String(todayDay)) {
          throw new Error('Confirmed receipt did not produce the expected GM state.');
        }

        eventDay = BigInt(lastDay);
      }

      const nextStats = await indexConfirmedGMDays(address, [eventDay]);

      setStats(nextStats);
      setConfirmedToday(true);
      setTxHash(hash);
      window.localStorage.removeItem(PENDING_GM_TX_KEY);

      // Refresh from Supabase only after the confirmed Arc event has been indexed.
      await refreshLeaderboard();
    } catch (err: any) {
      console.error('GM check-in failed:', err);
      const message = String(err?.shortMessage || err?.message || '');

      if (/user rejected|user denied|rejected the request/i.test(message)) {
        setError('GM transaction was cancelled in your wallet.');
      } else if (/already checked in today/i.test(message)) {
        setError('You already checked in today.');
        try {
          await reconcileOnchainState(address);
        } catch {}
      } else {
        setError('GM transaction failed. No GM was recorded.');
      }
    } finally {
      setCheckingIn(false);
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
            disabled={loading}
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
              {isDone ? 'GM Done' : checkingIn ? 'Confirm transaction in your wallet' : 'GM Today'}
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
            {checkingIn ? 'Confirming…' : isDone ? 'GM Done' : 'GM Today'}
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
              <div
                key={row.walletAddress}
                className="px-5 py-3.5 flex items-center gap-4"
              >
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
