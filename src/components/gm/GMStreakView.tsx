import React, { useEffect, useState } from 'react';
import { Flame, Check, Trophy, CalendarDays, RefreshCw } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { checkInGM, getGMLeaderboard, getGMStats, GMLeaderboardRow, GMStats } from '../../services/gm/gmService';
import { isSupabaseConfigured } from '../../lib/supabase';

const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

export const GMStreakView: React.FC = () => {
  const { address } = useWallet();
  const [stats, setStats] = useState<GMStats | null>(null);
  const [leaderboard, setLeaderboard] = useState<GMLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    load();
  }, [address]);

  const handleCheckIn = async () => {
    if (!address || checkingIn) return;
    setCheckingIn(true);
    setError(null);
    try {
      const nextStats = await checkInGM(address);
      setStats(nextStats);
      setLeaderboard(await getGMLeaderboard(20));
    } catch (err) {
      console.error('GM check-in failed:', err);
      setError('Could not record your GM. Please try again.');
    } finally {
      setCheckingIn(false);
    }
  };

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
        <div className="max-w-3xl mx-auto rounded-2xl border border-blue-500/20 bg-[#111317] p-6 sm:p-8">
          <div className="flex items-center gap-3">
            <Flame className="w-6 h-6 text-blue-400" />
            <h1 className="text-xl font-bold text-white">GM Streak</h1>
          </div>
          <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
            GM Streak is installed, but its Supabase connection has not been configured yet.
            Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in Vercel, then redeploy.
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
            <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">Daily check-in</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">GM Streak</h1>
            <p className="mt-2 text-sm text-zinc-400">Show up every day. Keep the streak alive.</p>
          </div>
          <button onClick={load} disabled={loading} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:border-blue-500/30 transition-colors">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">{error}</div>}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.06] p-5">
            <Flame className="w-5 h-5 text-blue-400 mb-4" />
            <div className="text-3xl font-bold text-white">{stats?.currentStreak ?? 0}</div>
            <div className="text-xs text-zinc-500 mt-1">Current streak</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <Trophy className="w-5 h-5 text-zinc-300 mb-4" />
            <div className="text-3xl font-bold text-white">{stats?.longestStreak ?? 0}</div>
            <div className="text-xs text-zinc-500 mt-1">Longest streak</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <CalendarDays className="w-5 h-5 text-zinc-300 mb-4" />
            <div className="text-3xl font-bold text-white">{stats?.totalGmDays ?? 0}</div>
            <div className="text-xs text-zinc-500 mt-1">Total GM days</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="text-5xl leading-none mb-2">⚡</div>
            <div className="text-3xl font-bold text-white">{stats?.points ?? 0}</div>
            <div className="text-xs text-zinc-500 mt-1">Streak points</div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
          <div>
            <div className="text-sm font-semibold text-white">
              {stats?.checkedInToday ? 'GM checked in today' : 'You have not checked in today'}
            </div>
            <div className="text-xs text-zinc-500 mt-1">
              {stats?.checkedInToday
                ? 'Come back tomorrow to extend the streak.'
                : 'Missing a calendar day breaks the streak and resets your points.'}
            </div>
          </div>
          <button
            onClick={handleCheckIn}
            disabled={checkingIn || loading || Boolean(stats?.checkedInToday)}
            className="w-full sm:w-auto min-w-36 flex items-center justify-center gap-2 px-5 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {checkingIn ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {stats?.checkedInToday ? 'GM Done' : 'GM Today'}
          </button>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#111317] overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">GM Leaderboard</h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">Ranked by active streak points</p>
            </div>
            <Trophy className="w-4 h-4 text-zinc-500" />
          </div>
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
