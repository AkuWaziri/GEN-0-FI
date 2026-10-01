import React, { useEffect, useState } from 'react';
import { Flame, Check, Trophy, CalendarDays, RefreshCw, ExternalLink } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { usePublicClient, useWalletClient, useWriteContract } from 'wagmi';
import { GM_CONTRACT_ABI, GM_CONTRACT_ADDRESS, GM_FEE_WEI, isGMContractConfigured } from '../../config/gmContract';
import { getGMStreakPoints, indexConfirmedGM, indexConfirmedGMDays, getGMLeaderboard, getGMStats, syncConfirmedGMEvents, GMLeaderboardRow, GMStats } from '../../services/gm/gmService';
import { isSupabaseConfigured } from '../../lib/supabase';
import { ARC_CHAIN_ID, getArcScanTxUrl } from '../../config/arc';

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
  const { data: walletClient } = useWalletClient({ chainId: ARC_CHAIN_ID });
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
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
      // Reconcile the contract's confirmed GM events before rendering the leaderboard.
      // This backfills historical GMs and incrementally imports new confirmed days.
      const [nextStats, nextLeaderboard] = await Promise.all([getGMStats(address), getGMLeaderboard(20)]);
      setStats(nextStats);
      setLeaderboard(nextLeaderboard);
    } catch (err) {
      console.error('GM streak load failed:', err);
      setError('GM Streak is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const reconcileConfirmedToday = async (confirmedHash?: string) => {
    if (!address || !isGMContractConfigured) return false;

    const todayDay = String(Math.floor(Date.now() / 86400000));

    try {
      // The GM contract is the source of truth. Do not wait for the explorer
      // indexer to prove a transaction that is already confirmed on Arc.
      if (publicClient) {
        const onchainDay = await publicClient.readContract({
          address: GM_CONTRACT_ADDRESS as `0x${string}`,
          abi: GM_CONTRACT_ABI,
          functionName: 'lastCheckInDay',
          args: [address as `0x${string}`],
        });
        const lastCheckInDay = String(onchainDay);
        if (lastCheckInDay === todayDay) {
          setOnchainConfirmedToday(true);
          if (confirmedHash) {
            setTxHash(confirmedHash);
          }

          try {
            const repairedStats = confirmedHash
              ? await indexConfirmedGM(address, confirmedHash)
              : await indexConfirmedGMDays(address, [lastCheckInDay]);
            setStats(repairedStats);
            setLeaderboard(await getGMLeaderboard(20));
          } catch (indexError) {
            // Keep the confirmed onchain state visible even if browser-side
            // Supabase indexing is temporarily blocked or unavailable.
            setStats((current) => markConfirmedToday(current));
            void fetch(`/api/blockchain/arc/gm-debug?address=${encodeURIComponent(address)}`, {
              headers: { accept: 'application/json' },
              cache: 'no-store',
            }).catch(() => undefined);
            console.warn('GM index sync deferred:', indexError);
          }

          return true;
        }
      }

      // Explorer reconciliation remains a backfill path, not the success gate.
      const response = await fetch(`/api/blockchain/arc/gm-debug?address=${encodeURIComponent(address)}`, {
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`GM reconciliation HTTP ${response.status}`);

      const body = await response.json();
      const lastCheckInDay = String(body?.lastCheckInDay ?? '');
      if (lastCheckInDay !== todayDay) return false;

      setOnchainConfirmedToday(true);

      const logs = Array.isArray(body?.logs) ? body.logs : [];
      const latestLog = [...logs].reverse().find((log: any) => log?.transactionHash);
      const resolvedHash = confirmedHash || latestLog?.transactionHash || null;
      if (resolvedHash) {
        setTxHash(resolvedHash);
        window.localStorage.removeItem(PENDING_GM_TX_KEY);
      }

      const repairedStats = await indexConfirmedGMDays(address, [lastCheckInDay]);
      setStats(repairedStats);
      setLeaderboard(await getGMLeaderboard(20));
      return true;
    } catch (err) {
      console.warn('GM reconciliation is still waiting:', err);
      return false;
    }
  };

  const recoverPendingGM = async () => {
    if (!address || !isGMContractConfigured || !publicClient) return;
    const pendingHash = window.localStorage.getItem(PENDING_GM_TX_KEY);
    if (!pendingHash) return;

    try {
      const receipt = await publicClient.getTransactionReceipt({
        hash: pendingHash as `0x${string}`,
      });

      if (receipt.status === 'success') {
        setTxHash(pendingHash);
        setOnchainConfirmedToday(true);
        setCheckingIn(false);
        try {
          const repairedStats = await indexConfirmedGM(address, pendingHash);
          setStats(repairedStats);
          setLeaderboard(await getGMLeaderboard(20));
          window.localStorage.removeItem(PENDING_GM_TX_KEY);
        } catch (indexError) {
          console.warn('Pending GM points indexing deferred:', indexError);
          // Keep the button completed immediately; retry persistence on the
          // next reconciliation/load rather than returning to "Confirming".
          setStats((current) => markConfirmedToday(current));
        }
      }
    } catch (err) {
      console.warn('Pending GM recovery is still waiting:', err);
    } finally {
      setCheckingIn(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const initialise = async () => {
      await reconcileConfirmedToday();
      if (cancelled) return;
      await recoverPendingGM();
      if (cancelled) return;
      await load();
      void syncConfirmedGMEvents().catch((e) => console.warn('GM event backfill deferred:', e));
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

      // Use the connected wallet provider as the primary confirmation source.
      // Arc public RPCs can lag even when the transaction is already finalized.
      if (!walletClient && !publicClient) {
        throw new Error('Arc wallet provider is unavailable.');
      }

      let receiptConfirmed = false;

      // Use viem's receipt waiter as the primary confirmation path. This waits
      // for the actual Arc receipt instead of polling the wallet transport,
      // which can remain undefined after the transaction is already finalized.
      if (publicClient) {
        try {
          const receipt = await publicClient.waitForTransactionReceipt({
            hash: hash as `0x${string}`,
            confirmations: 1,
            timeout: 90_000,
            pollingInterval: 1_500,
          });

          if (receipt.status !== 'success') {
            throw new Error('GM transaction reverted on Arc.');
          }

          receiptConfirmed = true;
        } catch (receiptError: any) {
          if (/revert|reverted/i.test(String(receiptError?.message || ''))) {
            throw receiptError;
          }
        }
      }

      // Contract state is the definitive fallback. A successful lastCheckInDay
      // proves the check-in was accepted even if the RPC receipt waiter lagged.
      if (!receiptConfirmed && await reconcileConfirmedToday(hash)) {
        receiptConfirmed = true;
      }

      if (!receiptConfirmed) {
        // One final provider receipt check before reporting a pending state.
        try {
          if (walletClient) {
            const receipt = await walletClient.request({
              method: 'eth_getTransactionReceipt',
              params: [hash],
            });
            if (receipt?.status === '0x1' || receipt?.status === '0x01') {
              receiptConfirmed = true;
            }
          }
        } catch {
          // Keep the pending hash for recovery on the next load.
        }
      }

      if (!receiptConfirmed) {
        throw new Error('GM transaction is not yet confirmed on Arc.');
      }

      // Receipt success is the confirmation gate. From this point onward
      // the GM is done even if Supabase or an Arc RPC is temporarily behind.
      setOnchainConfirmedToday(true);
      setCheckingIn(false);
      setStats((current) => markConfirmedToday(current));

      // Persist the confirmed GM directly from the confirmed tx hash. This
      // path no longer depends on lastCheckInDay or the explorer indexer.
      try {
        const repairedStats = await indexConfirmedGM(address, hash);
        setStats(repairedStats);
        setLeaderboard(await getGMLeaderboard(20));
        window.localStorage.removeItem(PENDING_GM_TX_KEY);
      } catch (indexError) {
        console.warn('GM points indexing deferred:', indexError);
        // Leave the completed state visible. The pending hash is retained so
        // the next load can reconcile the points without another GM tx.
      }

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
          <button onClick={handleCheckIn} disabled={checkingIn || loading || onchainConfirmedToday || Boolean(stats?.checkedInToday)} className="w-full sm:w-auto min-w-36 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 disabled:opacity-25 disabled:cursor-not-allowed transition-all duration-500">{checkingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}{checkingIn ? 'Confirming…' : (onchainConfirmedToday || stats?.checkedInToday) ? 'GM Done' : 'GM Today'}</button>
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
