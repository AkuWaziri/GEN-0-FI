import React, { useEffect, useState } from 'react';
import { Flame, Check, Trophy, CalendarDays, RefreshCw, ExternalLink } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { useWriteContract } from 'wagmi';
import { createPublicClient, http } from 'viem';
import { GM_CONTRACT_ABI, GM_CONTRACT_ADDRESS, GM_FEE_WEI, isGMContractConfigured } from '../../config/gmContract';
import { indexConfirmedGM, getGMLeaderboard, getGMStats, GMLeaderboardRow, GMStats } from '../../services/gm/gmService';
import { isSupabaseConfigured } from '../../lib/supabase';
import { ARC_CHAIN_ID, arcChain, getArcScanTxUrl } from '../../config/arc';

const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;
const PENDING_GM_TX_KEY = 'gen0fi:pending-gm-tx';

const markConfirmedToday = (current: GMStats | null): GMStats => {
  if (!current) {
    return {
      currentStreak: 1,
      longestStreak: 1,
      totalGmDays: 1,
      points: 1,
      checkedInToday: true,
      lastCheckinDate: new Date().toISOString().slice(0, 10),
    };
  }

  return {
    ...current,
    currentStreak: current.checkedInToday ? current.currentStreak : current.currentStreak + 1,
    longestStreak: current.checkedInToday
      ? current.longestStreak
      : Math.max(current.longestStreak, current.currentStreak + 1),
    totalGmDays: current.checkedInToday ? current.totalGmDays : current.totalGmDays + 1,
    points: current.checkedInToday ? current.points : current.currentStreak + 1,
    checkedInToday: true,
    lastCheckinDate: new Date().toISOString().slice(0, 10),
  };
};

export const GMStreakView: React.FC = () => {
  const { address, isCorrectNetwork } = useWallet();
  const receiptClient = createPublicClient({
    chain: arcChain,
    transport: http('https://rpc.arc-scan.org'),
  });
  const { writeContractAsync } = useWriteContract();

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
      const [nextStats, nextLeaderboard] = await Promise.all([
        getGMStats(address),
        getGMLeaderboard(20),
      ]);
      setStats(nextStats);
      setLeaderboard(nextLeaderboard);
    } catch (err) {
      console.error('GM streak load failed:', err);
      setError('GM Streak is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  const syncOnchainGM = async () => {
    if (!address || !isGMContractConfigured) return false;

    try {
      // Arc is authoritative for today's GM. Supabase must never control
      // whether the button is enabled.
      const todayDay = BigInt(Math.floor(Date.now() / 86400000));
      const lastCheckInDay = await receiptClient.readContract({
        address: GM_CONTRACT_ADDRESS as `0x${string}`,
        abi: GM_CONTRACT_ABI,
        functionName: 'lastCheckInDay',
        args: [address as `0x${string}`],
      });

      if (lastCheckInDay !== todayDay) return false;

      // Flip the UI immediately from confirmed onchain state.
      setOnchainConfirmedToday(true);
      setStats((current) => markConfirmedToday(current));

      // Repair the Supabase index in the background. A slow/failing index
      // must not keep the button vivid or leave the UI in a syncing state.
      void (async () => {
        try {
          const latestBlock = await receiptClient.getBlockNumber();
          // Arcscan limits log-range queries. Scan in small deterministic
          // chunks instead of relying on one large eth_getLogs request.
          const scanFrom = latestBlock > 500000n ? latestBlock - 500000n : 0n;
          const chunkSize = 20000n;
          const logs = [];
          for (let fromBlock = scanFrom; fromBlock <= latestBlock; fromBlock += chunkSize + 1n) {
            const toBlock = fromBlock + chunkSize > latestBlock
              ? latestBlock
              : fromBlock + chunkSize;
            const chunkLogs = await receiptClient.getLogs({
              address: GM_CONTRACT_ADDRESS as `0x${string}`,
              event: GM_CONTRACT_ABI[2],
              args: { wallet: address as `0x${string}` },
              fromBlock,
              toBlock,
            });
            logs.push(...chunkLogs);
          }

          const latestGM = logs.at(-1);
          if (!latestGM?.transactionHash) return;

          // Rebuild the streak from confirmed Arc event days instead of
          // incrementing whatever Supabase currently happens to report.
          // This makes day 2 authoritative even when the index is stale.
          const onchainDays = new Set(
            logs
              .map((log) => log.args?.day)
              .filter((day): day is bigint => typeof day === 'bigint')
              .map((day) => day.toString()),
          );

          const todayDay = BigInt(Math.floor(Date.now() / 86400000));
          let onchainCurrentStreak = 0;
          let cursor = todayDay;
          while (onchainDays.has(cursor.toString())) {
            onchainCurrentStreak += 1;
            cursor -= 1n;
          }

          const confirmedStats = await indexConfirmedGM(address, latestGM.transactionHash);
          const repairedStats: GMStats = {
            ...confirmedStats,
            currentStreak: Math.max(confirmedStats.currentStreak, onchainCurrentStreak),
            longestStreak: Math.max(confirmedStats.longestStreak, onchainCurrentStreak),
            totalGmDays: Math.max(confirmedStats.totalGmDays, onchainDays.size),
            points: Math.max(confirmedStats.points, onchainCurrentStreak),
            checkedInToday: true,
            lastCheckinDate: new Date(Number(todayDay) * 86400000).toISOString().slice(0, 10),
          };

          setStats(repairedStats);
          setLeaderboard(await getGMLeaderboard(20));
          setTxHash(latestGM.transactionHash);
        } catch (err) {
          console.warn('GM index repair is still waiting:', err);
        }
      })();

      return true;
    } catch (err) {
      console.warn('Onchain GM sync is still waiting:', err);
      return false;
    }
  };

  const recoverPendingGM = async () => {
    if (!address || !isGMContractConfigured) return;

    const pendingHash = window.localStorage.getItem(PENDING_GM_TX_KEY);
    if (!pendingHash) return;

    try {
      const transaction = await receiptClient.getTransaction({
        hash: pendingHash as `0x${string}`,
      });

      if (
        !transaction.to ||
        transaction.to.toLowerCase() !== GM_CONTRACT_ADDRESS.toLowerCase() ||
        transaction.from.toLowerCase() !== address.toLowerCase()
      ) {
        window.localStorage.removeItem(PENDING_GM_TX_KEY);
        return;
      }

      const receipt = await receiptClient.waitForTransactionReceipt({
        hash: pendingHash as `0x${string}`,
        confirmations: 1,
        pollingInterval: 1000,
        timeout: 15000,
      });

      if (receipt.status !== 'success') {
        window.localStorage.removeItem(PENDING_GM_TX_KEY);
        return;
      }

      // Confirmed onchain: update the UI immediately.
      setTxHash(pendingHash);
      setOnchainConfirmedToday(true);
      setStats((current) => markConfirmedToday(current));
      window.localStorage.removeItem(PENDING_GM_TX_KEY);
      setCheckingIn(false);

      // Index asynchronously so Supabase latency cannot block the confirmed UI.
      void (async () => {
        try {
          const nextStats = await indexConfirmedGM(address, pendingHash);
          setStats(nextStats.checkedInToday ? nextStats : markConfirmedToday(nextStats));
          setLeaderboard(await getGMLeaderboard(20));
        } catch (err) {
          console.warn('Pending GM index repair is still waiting:', err);
        }
      })();
    } catch (err) {
      console.warn('Pending GM recovery is still waiting:', err);
    }
  };

  useEffect(() => {
    let cancelled = false;

    const initialise = async () => {
      await load();
      if (cancelled) return;
      await recoverPendingGM();
      if (cancelled) return;
      await syncOnchainGM();
    };

    initialise();
    return () => {
      cancelled = true;
    };
  }, [address]);

  const handleCheckIn = async () => {
    if (!address || checkingIn) return;

    // Check Arc directly before opening the wallet.
    if (await syncOnchainGM()) {
      setError('You already checked in today.');
      return;
    }

    if (!isCorrectNetwork) {
      setError('Switch your wallet to Arc Mainnet before checking in.');
      return;
    }

    if (!isGMContractConfigured) {
      setError('GM contract is not configured yet. Deploy the contract and add VITE_GM_CONTRACT_ADDRESS in Vercel.');
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
      });

      setTxHash(hash);
      window.localStorage.setItem(PENDING_GM_TX_KEY, hash);

      const receipt = await receiptClient.waitForTransactionReceipt({
        hash,
        confirmations: 1,
        pollingInterval: 1000,
        timeout: 60000,
      });

      if (receipt.status !== 'success') {
        throw new Error('GM transaction reverted.');
      }

      // The transaction is now confirmed on Arc. Reflect that immediately.
      // Do not wait for Supabase to finish indexing.
      setOnchainConfirmedToday(true);
      setStats((current) => markConfirmedToday(current));
      setCheckingIn(false);

      // Supabase is only an index/cache. Repair it in the background.
      void (async () => {
        try {
          const nextStats = await indexConfirmedGM(address, hash);
          setStats(nextStats.checkedInToday ? nextStats : markConfirmedToday(nextStats));
          setLeaderboard(await getGMLeaderboard(20));
          window.localStorage.removeItem(PENDING_GM_TX_KEY);
        } catch (err) {
          console.warn('GM index repair is still waiting:', err);
        }
      })();
    } catch (err: any) {
      console.error('GM check-in failed:', err);
      const message = String(err?.shortMessage || err?.message || '');
      if (/already checked in today/i.test(message)) {
        // Even a rejected duplicate confirms the contract's daily state.
        setOnchainConfirmedToday(true);
        setStats((current) => markConfirmedToday(current));
        setError('You already checked in today.');
      } else if (/user rejected|user denied|rejected the request/i.test(message)) {
        setError('GM transaction was cancelled in your wallet.');
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
          <div className="flex items-center gap-3">
            <Flame className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold text-white">GM Streak</h1>
          </div>
          <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
            {!isSupabaseConfigured
              ? 'GM indexing is not configured. Add the Supabase browser variables in Vercel.'
              : 'The Arc Mainnet GM contract is not configured yet. Add VITE_GM_CONTRACT_ADDRESS after deployment.'}
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
            <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">Daily onchain check-in</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">GM Streak</h1>
            <p className="mt-2 text-sm text-zinc-400">Each GM is an Arc Mainnet transaction.</p>
          </div>
          <button onClick={load} disabled={loading} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:border-blue-500/30 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">{error}</div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.06] p-5"><Flame className="w-5 h-5 text-blue-400 mb-4" /><div className="text-3xl font-bold text-white">{onchainConfirmedToday && !stats?.checkedInToday ? (stats?.currentStreak ?? 0) + 1 : (stats?.currentStreak ?? 0)}</div><div className="text-xs text-zinc-500 mt-1">Current streak</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5"><Trophy className="w-5 h-5 text-zinc-300 mb-4" /><div className="text-3xl font-bold text-white">{stats?.longestStreak ?? 0}</div><div className="text-xs text-zinc-500 mt-1">Longest streak</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5"><CalendarDays className="w-5 h-5 text-zinc-300 mb-4" /><div className="text-3xl font-bold text-white">{onchainConfirmedToday && !stats?.checkedInToday ? (stats?.totalGmDays ?? 0) + 1 : (stats?.totalGmDays ?? 0)}</div><div className="text-xs text-zinc-500 mt-1">Total GM days</div></div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5"><div className="text-5xl leading-none mb-2">⚡</div><div className="text-3xl font-bold text-white">{onchainConfirmedToday && !stats?.checkedInToday ? (stats?.currentStreak ?? 0) + 1 : (stats?.points ?? 0)}</div><div className="text-xs text-zinc-500 mt-1">Streak points</div></div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            <div className="text-sm font-semibold text-white">{onchainConfirmedToday || stats?.checkedInToday ? 'GM confirmed on Arc Mainnet' : 'You have not checked in today'}</div>
            <div className="text-xs text-zinc-500 mt-1">{onchainConfirmedToday || stats?.checkedInToday ? 'Come back tomorrow to extend the streak.' : 'A successful transaction is recorded on Arc Mainnet.'}</div>
          </div>
          <button onClick={handleCheckIn} disabled={checkingIn || loading || onchainConfirmedToday || Boolean(stats?.checkedInToday)} className="w-full sm:w-auto min-w-36 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
            {checkingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {checkingIn ? 'Confirming…' : (onchainConfirmedToday || stats?.checkedInToday) ? 'GM Done' : 'GM Today'}
          </button>
        </div>

        {txHash && (
          <a href={getArcScanTxUrl(txHash)} target="_blank" rel="noreferrer" className="flex items-center gap-2 text-xs text-blue-400 hover:text-blue-300">
            Transaction: {short(txHash)} <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}

        <div className="rounded-2xl border border-zinc-800 bg-[#111317] overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between"><div><h2 className="text-sm font-semibold text-white">GM Leaderboard</h2><p className="text-[11px] text-zinc-500 mt-0.5">Ranked by active streak points</p></div><Trophy className="w-4 h-4 text-zinc-500" /></div>
          <div className="divide-y divide-zinc-800/70">
            {leaderboard.map((row, index) => (
              <div key={row.walletAddress} className="px-5 py-3.5 flex items-center gap-4">
                <span className="w-6 text-xs font-mono text-zinc-500">{String(index + 1).padStart(2, '0')}</span>
                <span className="flex-1 text-xs font-mono text-zinc-300">{short(row.walletAddress)}</span>
                <span className="text-xs text-zinc-500">{row.totalGmDays} days</span>
                <span className="text-xs font-semibold text-white min-w-16 text-right">{row.points} pts</span>
              </div>
            ))}
            {!leaderboard.length && <div className="px-5 py-8 text-center text-xs text-zinc-500">No GM check-ins yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
