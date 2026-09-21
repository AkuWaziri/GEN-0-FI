import React, { useEffect, useState } from 'react';
import { ArrowLeftRight, RefreshCw, Trophy, WalletCards } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { getPointLeaderboard } from '../../services/points/pointsService';
import type { PointLeaderboardRow } from '../../types/points';
import { isSupabaseConfigured } from '../../lib/supabase';

const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

export const PointsLeaderboardView: React.FC = () => {
  const { address } = useWallet();
  const [rows, setRows] = useState<PointLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getPointLeaderboard(50));
    } catch (err) {
      console.error('Points leaderboard load failed:', err);
      setError('Points leaderboard is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [address]);

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
        <div className="max-w-4xl mx-auto rounded-2xl border border-blue-500/20 bg-[#111317] p-6 sm:p-8">
          <div className="flex items-center gap-3"><Trophy className="w-6 h-6 text-blue-400" /><h1 className="text-xl font-bold text-white">Points Leaderboard</h1></div>
          <p className="mt-3 text-sm text-zinc-400">Points indexing is not configured. Add the Supabase browser variables in Vercel.</p>
        </div>
      </div>
    );
  }

  const me = address?.toLowerCase();
  const myRow = rows.find((row) => row.walletAddress === me);
  const totalSwapPoints = myRow?.swapPoints ?? 0;
  const totalBridgePoints = myRow?.bridgePoints ?? 0;

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">Onchain activity rewards</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">Points Leaderboard</h1>
            <p className="mt-2 text-sm text-zinc-400">Confirmed swaps earn 5 points. Confirmed bridges earn 10 points.</p>
          </div>
          <button onClick={load} disabled={loading} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:border-blue-500/30 transition-colors" aria-label="Refresh leaderboard">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">{error}</div>}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-2xl border border-blue-500/25 bg-blue-500/[0.06] p-5">
            <ArrowLeftRight className="w-5 h-5 text-blue-400 mb-4" />
            <div className="text-3xl font-bold text-white">{totalSwapPoints}</div>
            <div className="text-xs text-zinc-500 mt-1">Your swap points</div>
            <div className="text-[11px] text-zinc-600 mt-2">{myRow?.swapCount ?? 0} confirmed swaps × 5</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <WalletCards className="w-5 h-5 text-zinc-300 mb-4" />
            <div className="text-3xl font-bold text-white">{totalBridgePoints}</div>
            <div className="text-xs text-zinc-500 mt-1">Your bridge points</div>
            <div className="text-[11px] text-zinc-600 mt-2">{myRow?.bridgeCount ?? 0} confirmed bridges × 10</div>
          </div>
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <Trophy className="w-5 h-5 text-zinc-300 mb-4" />
            <div className="text-3xl font-bold text-white">{myRow?.totalPoints ?? 0}</div>
            <div className="text-xs text-zinc-500 mt-1">Your total points</div>
            <div className="text-[11px] text-zinc-600 mt-2">Swaps + bridges</div>
          </div>
        </div>

        <div className="rounded-2xl border border-zinc-800 bg-[#111317] overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <div><h2 className="text-sm font-semibold text-white">Swap & Bridge Leaderboard</h2><p className="text-[11px] text-zinc-500 mt-0.5">Ranked by total confirmed activity points</p></div>
            <Trophy className="w-4 h-4 text-zinc-500" />
          </div>
          <div className="divide-y divide-zinc-800/70">
            {rows.map((row, index) => (
              <div key={row.walletAddress} className={`px-5 py-3.5 grid grid-cols-[24px_1fr_auto_auto_auto] items-center gap-3 ${row.walletAddress === me ? 'bg-blue-500/[0.05]' : ''}`}>
                <span className="text-xs font-mono text-zinc-500">{String(index + 1).padStart(2, '0')}</span>
                <span className="text-xs font-mono text-zinc-300">{short(row.walletAddress)}{row.walletAddress === me && <span className="ml-2 text-[10px] text-blue-400">YOU</span>}</span>
                <span className="text-[11px] text-zinc-500">{row.swapCount} swaps</span>
                <span className="text-[11px] text-zinc-500">{row.bridgeCount} bridges</span>
                <span className="text-xs font-semibold text-white min-w-16 text-right">{row.totalPoints} pts</span>
              </div>
            ))}
            {!rows.length && <div className="px-5 py-10 text-center text-xs text-zinc-500">No confirmed swap or bridge activity has earned points yet.</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
