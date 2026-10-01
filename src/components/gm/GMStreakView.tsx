import React, { useEffect, useState } from 'react';
import { Flame, Check, Trophy, CalendarDays, RefreshCw, ExternalLink } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { useWriteContract } from 'wagmi';
import { createPublicClient, http } from 'viem';
import { GM_CONTRACT_ABI, GM_CONTRACT_ADDRESS, GM_FEE_WEI, isGMContractConfigured } from '../../config/gmContract';
import { getGMStreakPoints, indexConfirmedGMDays, getGMLeaderboard, getGMStats, syncConfirmedGMEvents, GMLeaderboardRow, GMStats } from '../../services/gm/gmService';
import { isSupabaseConfigured } from '../../lib/supabase';
import { ARC_CHAIN_ID, ARC_MAINNET_RPC_URL, arcChain, getArcScanTxUrl } from '../../config/arc';

const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;
const PENDING_GM_TX_KEY = 'gen0fi:pending-gm-tx';

const markConfirmedToday = (current: GMStats | null): GMStats => {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (!current) {
    return {
      currentStreak: 1,
      longestStreak: 1,
      totalGmDays: 1,
      points: getGMStreakPoints(1),
      checkedInToday: true,
      lastCheckinDate: today,
    };
  }

  if (current.checkedInToday) {
    return { ...current, checkedInToday: true, lastCheckinDate: today };
  }

  const continuesStreak = current.lastCheckinDate === yesterday;
  const nextStreak = continuesStreak ? current.currentStreak + 1 : 1;

  return {
    ...current,
    currentStreak: nextStreak,
    longestStreak: Math.max(current.longestStreak, nextStreak),
    totalGmDays: current.totalGmDays + 1,
    points: current.points + getGMStreakPoints(nextStreak),
    checkedInToday: true,
    lastCheckinDate: today,
  };
};

export const GMStreakView: React.FC = () => {
  const { address, isCorrectNetwork } = useWallet();
  const { writeContractAsync } = useWriteContract();
  // Never use the broken explorer RPC as a confirmation fallback.
  const publicClient = createPublicClient({ chain: arcChain, transport: http(ARC_MAINNET_RPC_URL) });
  const [stats, setStats] = useState<GMStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<GMLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onchainConfirmedToday, setOnchainConfirmedToday] = useState(false);

  const load = async () => {
    if (!address) return;
    setLoading(true);
    setError(null);
    try {
      const [nextStats, nextLeaderboard] = await Promise.all([getGMStats(address), getGMLeaderboard(20)]);
      setStats(nextStats);
      setLeaderboard(nextLeaderboard);
      if (nextStats.checkedInToday) {
        setOnchainConfirmedToday(true);
      }
    } catch (err) {
      console.error('GM streak load failed:', err);
      setError('GM Streak is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const reconcileConfirmedToday = async (confirmedHash?: string) => {
    if (!address || !isGMContractConfigured) return false;

    try {
      const latestBlock = await publicClient.getBlock();
      const todayDay = latestBlock.timestamp / 86400n;

      // The contract state is authoritative for the once-per-day rule.
      // Read it before Supabase or event indexing so the button cannot remain
      // enabled when the wallet has already checked in on Arc.
      const onchainDay = await publicClient.readContract({
        address: GM_CONTRACT_ADDRESS as `0x\${string}`,
        abi: GM_CONTRACT_ABI,
        functionName: 'lastCheckInDay',
        args: [address as `0x\${string}`],
      });

      if (String(onchainDay) === String(todayDay)) {
        setOnchainConfirmedToday(true);
        if (confirmedHash) {
          setTxHash(confirmedHash);
          window.localStorage.removeItem(PENDING_GM_TX_KEY);
        }

        try {
          const repairedStats = await indexConfirmedGMDays(address, [onchainDay]);
          setStats(repairedStats);
          setLeaderboard(await getGMLeaderboard(20));
        } catch (indexError) {
          setStats((current) => markConfirmedToday(current));
          console.warn('GM index sync deferred:', indexError);
        }
        return true;
      }

      // Event lookup is only for historical/index repair.
      const lookbackStart = latestBlock.number > 200000n ? latestBlock.number - 200000n : 0n;
      const event = GM_CONTRACT_ABI.find(
        (item) => item.type === 'event' && item.name === 'GMCheckedIn'
      ) as any;

      if (event) {
        const logs = await publicClient.getLogs({
          address: GM_CONTRACT_ADDRESS as `0x\${string}`,
          event,
          args: { wallet: address as `0x\${string}` },
          fromBlock: lookbackStart,
          toBlock: latestBlock.number,
        });

        const latest = logs
          .filter((log: any) => log.args?.day != null)
          .sort((a: any, b: any) => Number(a.blockNumber - b.blockNumber))
          .at(-1);

        if (latest?.args?.day != null) {
          try {
            const repairedStats = await indexConfirmedGMDays(address, [latest.args.day]);
            setStats(repairedStats);
            setLeaderboard(await getGMLeaderboard(20));
          } catch (indexError) {
            console.warn('GM historical index sync deferred:', indexError);
          }
        }
      }

      return false;
    } catch (err) {
      console.warn('GM reconciliation failed:', err);
      return false;
    }
  };

  const recoverPendingGM = async () => {
    if (!address || !isGMContractConfigured) return;
    const pendingHash = window.localStorage.getItem(PENDING_GM_TX_KEY);
    if (!pendingHash) return;
    if (await reconcileConfirmedToday(pendingHash)) {
      setCheckingIn(false);
      return;
    }
    setCheckingIn(false);
  };

  useEffect(() => {
    let cancelled = false;
    const initialise = async () => {
      setOnchainConfirmedToday(false);
      setTxHash(null);
      await recoverPendingGM();
      if (cancelled) return;
      await reconcileConfirmedToday();
      if (cancelled) return;
      await load();
      if (cancelled) return;

      // Backfill confirmed Arc events without blocking the GM button or initial render.
      void syncConfirmedGMEvents(publicClient).then(async (indexed) => {
        if (!cancelled && indexed > 0) {
          const [freshStats, freshLeaderboard] = await Promise.all([
            getGMStats(address),
            getGMLeaderboard(20),
          ]);
          if (!cancelled) {
            setStats(freshStats);
            setLeaderboard(freshLeaderboard);
          }
        }
      }).catch((syncError) => {
        console.warn('GM event backfill deferred:', syncError);
      });
    };
    initialise();
    return () => { cancelled = true; };
  }, [address]);

  const handleCheckIn = async () => {
    if (!address || checkingIn) return;

    if (await reconcileConfirmedToday()) {
      setError('You already checked in today.');
      return;
    }

    if (!isCorrectNetwork) {
      setError('Switch your wallet to Arc Mainnet before checking in.');
      return;
    }

    if (!isGMContractConfigured) {
      setError('GM contract is not configured yet. Deploy the contract and add VITE_GM_CONTRACT_ADDRESS after deployment.');
      return;
    }

    setCheckingIn(true);
    setError(null);
    setTxHash(null);

    try {
      const hash = await writeContractAsync({
        address: GM_CONTRACT_ADDRESS as `0x${string}`,
        abi: GM_CONTRACT_ABI,
        functionName: 'checkIn',
        value: GM_FEE_WEI,
        chainId: ARC_CHAIN_ID,
      } as any);

      setTxHash(hash);
      window.localStorage.setItem(PENDING_GM_TX_KEY, hash);

      // Confirm the actual Arc transaction receipt first. Explorer indexing and
      // Supabase bookkeeping must never turn a confirmed transaction into a UI failure.
      if (!publicClient) throw new Error('Arc public client is unavailable.');
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error('GM transaction reverted on Arc.');
      }

      setOnchainConfirmedToday(true);

      let confirmed = await reconcileConfirmedToday(hash);
      if (!confirmed) {
        // The receipt is authoritative even if the contract-read/indexer path
        // is temporarily delayed. Keep the confirmed state visible and continue
        // backfilling in the background.
        setStats((current) => markConfirmedToday(current));
        confirmed = true;
        void reconcileConfirmedToday(hash);
      }
      if (!confirmed) {
        for (let attempt = 0; attempt < 4; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1500));
          confirmed = await reconcileConfirmedToday(hash);
          if (confirmed) break;
        }
      }

      if (!confirmed) {
        throw new Error('GM receipt confirmed, but daily contract state is temporarily delayed.'); 
      }
      window.localStorage.removeItem(PENDING_GM_TX_KEY);
    } catch (err: any) {
      console.error('GM check-in failed:', err);
      const message = String(err?.shortMessage || err?.message || '');

      if (await reconcileConfirmedToday(txHash || undefined)) {
        setError(null);
        return;
      }

      if (/user rejected|user denied|rejected the request/i.test(message)) {
        setError('GM transaction was cancelled in your wallet.');
      } else if (/already checked in today/i.test(message)) {
        setError('You already checked in today.');
      } else {
        setError('GM transaction failed. No GM was recorded.');
      }
    } finally {
      setCheckingIn(false);
    }
  };

  if (!isSupabaseConfigured || !isGMContractConfigured) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
        <div className="max-w-3xl mx-auto rounded-2xl border border-blue-500/20 bg-[#111317] p-6 sm:p-8">
          <div className="flex items-center gap-3"><Flame className="w-6 h-6 text-blue-400" /><h1 className="text-xl font-bold text-white">GM Streak</h1></div>
          <p className="mt-3 text-sm text-zinc-400 leading-relaxed">{!isSupabaseConfigured ? 'GM indexing is not configured. Add the Supabase browser variables in Vercel.' : 'The Arc Mainnet GM contract is not configured yet. Add VITE_GM_CONTRACT_ADDRESS after deployment.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div><p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">Daily onchain check-in</p><h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">GM Streak</h1><p className="mt-2 text-sm text-zinc-400">Each GM is an Arc Mainnet transaction.</p></div>
          <button onClick={load} disabled={loading} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:border-blue-500/30 transition-colors"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
        </div>

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">{error}</div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.06] p-5"><Flame className="w-5 h-5 text-blue-400 mb-4" /><div className="text-3xl font-bold text-white">{stats?.currentStreak ?? 0}</div><div className="text-xs text-zinc-500 mt-1">Current streak</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5"><Trophy className="w-5 h-5 text-zinc-300 mb-4" /><div className="text-3xl font-bold text-white">{stats?.longestStreak ?? 0}</div><div className="text-xs text-zinc-500 mt-1">Longest streak</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5"><CalendarDays className="w-5 h-5 text-zinc-300 mb-4" /><div className="text-3xl font-bold text-white">{stats?.totalGmDays ?? 0}</div><div className="text-xs text-zinc-500 mt-1">Total GM days</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5"><div className="text-5xl leading-none mb-2">⚡</div><div className="text-3xl font-bold text-white">{stats?.points ?? 0}</div><div className="text-xs text-zinc-500 mt-1">Streak points</div></div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div><div className="text-sm font-semibold text-white">{onchainConfirmedToday || stats?.checkedInToday ? 'GM confirmed on Arc Mainnet' : 'You have not checked in today'}</div><div className="text-xs text-zinc-500 mt-1">{onchainConfirmedToday || stats?.checkedInToday ? 'Come back tomorrow to extend the streak.' : 'A successful transaction is recorded on Arc Mainnet.'}</div></div>
          <button onClick={handleCheckIn} disabled={checkingIn || loading || onchainConfirmedToday || Boolean(stats?.checkedInToday)} className="w-full sm:w-auto min-w-36 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">{checkingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{checkingIn ? 'Confirming…' : (onchainConfirmedToday || stats?.checkedInToday) ? 'GM Done' : 'GM Today'}</button>
        </div>

        {txHash && <a href={getArcScanTxUrl(txHash)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300">Transaction: {short(txHash)} <ExternalLink className="w-3.5 h-3.5" /></a>}

        <div className="rounded-2xl border border-zinc-800 bg-[#111317] overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">GM Leaderboard</h2><p className="text-[11px] text-zinc-500 mt-0.5">Ranked by active streak points</p></div><Trophy className="w-4 h-4 text-zinc-500" /></div>
          <div className="divide-y divide-zinc-800/70">{leaderboard.map((row, index) => <div key={row.walletAddress} className="px-5 py-3.5 flex items-center gap-4"><span className="w-6 text-xs font-mono text-zinc-500">{String(index + 1).padStart(2, '0')}</span><span className="flex-1 text-xs font-mono text-zinc-300">{short(row.walletAddress)}</span><span className="text-xs text-zinc-500">{row.totalGmDays} days</span><span className="text-xs font-semibold text-white min-w-16 text-right">{row.points} pts</span></div>)}{!leaderboard.length && <div className="px-5 py-8 text-center text-xs text-zinc-500">No GM check-ins yet.</div>}</div>
        </div>
      </div>
    </div>
  );
};
