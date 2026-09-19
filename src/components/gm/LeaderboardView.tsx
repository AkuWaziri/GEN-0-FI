import React, { useEffect, useState } from 'react';
import { Trophy, Loader2 } from 'lucide-react';
import { formatShortAddress } from '../../config/arc';

interface LeaderboardEntry {
  rank: number;
  address: string;
  gmCount: number;
  streak: number;
  points: number;
  lastGmAt: number | null;
}

export const LeaderboardView: React.FC = () => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch('/api/gm/leaderboard', { cache: 'no-store' });
        if (!response.ok) throw new Error('Leaderboard unavailable');
        const data = await response.json();
        if (!cancelled) setEntries(Array.isArray(data.leaderboard) ? data.leaderboard : []);
      } catch {
        if (!cancelled) setError('Could not load the onchain GM leaderboard.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <section className="w-full max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-10">
      <div className="rounded-3xl border border-zinc-800 bg-[#0e1014] overflow-hidden shadow-xl">
        <div className="p-5 sm:p-8 border-b border-zinc-800">
          <div className="inline-flex items-center gap-2 rounded-full border border-yellow-400/20 bg-yellow-400/10 px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-yellow-300">
            <Trophy className="w-3.5 h-3.5" />
            Leaderboard
          </div>
          <h1 className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight text-white">GM Leaderboard</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            Ranked by verified streak points from Arc Mainnet GM transactions.
          </p>
        </div>

        {loading ? (
          <div className="p-10 flex items-center justify-center text-zinc-500">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : error ? (
          <div className="p-8 text-sm text-red-400">{error}</div>
        ) : entries.length === 0 ? (
          <div className="p-10 text-center text-sm text-zinc-500">No verified GMs yet.</div>
        ) : (
          <div className="divide-y divide-zinc-800">
            {entries.map((entry) => (
              <div key={entry.address} className="grid grid-cols-[44px_1fr_auto_auto] items-center gap-3 px-5 sm:px-8 py-4">
                <div className="text-sm font-mono text-zinc-500">#{entry.rank}</div>
                <div className="min-w-0">
                  <div className="font-mono text-sm text-white truncate">{formatShortAddress(entry.address, 6)}</div>
                  <div className="mt-1 text-[11px] text-zinc-500">{entry.gmCount} GMs · {entry.streak} current streak</div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold text-white">{entry.points}</div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500">points</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
};
