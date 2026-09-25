import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeftRight, Coins, ExternalLink, Gem, RefreshCw, Send, Trophy, WalletCards } from 'lucide-react';
import { useWallet } from '../../context/WalletContext';
import { getPointLeaderboard, POINT_VALUES } from '../../services/points/pointsService';
import type { PointLeaderboardRow } from '../../types/points';
import { isSupabaseConfigured } from '../../lib/supabase';

const short = (address: string) => `${address.slice(0, 6)}...${address.slice(-4)}`;

const activityMeta = [
  { key: 'swapPoints', count: 'swapCount', label: 'Swaps', points: POINT_VALUES.swap, icon: ArrowLeftRight },
  { key: 'bridgePoints', count: 'bridgeCount', label: 'Bridges', points: POINT_VALUES.bridge, icon: WalletCards },
  { key: 'sendPoints', count: 'sendCount', label: 'Sends', points: POINT_VALUES.send, icon: Send },
  { key: 'nftMintPoints', count: 'nftMintCount', label: 'NFT mints', points: POINT_VALUES.nft_mint, icon: Gem },
  { key: 'coinLaunchPoints', count: 'coinLaunchCount', label: 'Coin launches', points: POINT_VALUES.coin_launch, icon: Coins },
] as const;

export const PointsLeaderboardView: React.FC = () => {
  const { address } = useWallet();
  const [rows, setRows] = useState<PointLeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await getPointLeaderboard(100));
    } catch (err) {
      console.error('Points leaderboard load failed:', err);
      setError('Points leaderboard is temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, [address]);

  const me = address?.toLowerCase();
  const myRank = rows.findIndex((row) => row.walletAddress === me);
  const myRow = myRank >= 0 ? rows[myRank] : null;

  const myBreakdown = useMemo(
    () => activityMeta.map((item) => ({
      ...item,
      points: myRow?.[item.key] ?? 0,
      count: myRow?.[item.count] ?? 0,
    })),
    [myRow],
  );

  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
        <div className="max-w-4xl mx-auto rounded-2xl border border-blue-500/20 bg-[#111317] p-6 sm:p-8">
          <div className="flex items-center gap-3"><Trophy className="w-6 h-6 text-blue-400" /><h1 className="text-xl font-bold text-white">Leaderboard</h1></div>
          <p className="mt-3 text-sm text-zinc-400">Activity points indexing is not configured. Add the Supabase browser variables in Vercel.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">GEN-0FI activity points</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">Leaderboard</h1>
            <p className="mt-2 text-sm text-zinc-400">One cumulative ranking for wallet activity across GEN-0FI.</p>
          </div>
          <button onClick={() => void load()} disabled={loading} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:border-blue-500/30 transition-colors" aria-label="Refresh leaderboard">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </header>

        {error && <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">{error}</div>}

        <section className="grid grid-cols-1 lg:grid-cols-[1.2fr_2fr] gap-4">
          <div className="rounded-2xl border border-blue-500/25 bg-gradient-to-br from-blue-500/[0.08] via-[#111317] to-transparent p-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-blue-300">Your position</div>
                <div className="mt-2 text-4xl font-bold text-white">{myRow ? `#${myRank + 1}` : '—'}</div>
              </div>
              <Trophy className="w-6 h-6 text-blue-300" />
            </div>
            <div className="mt-5 text-2xl font-semibold text-white">{myRow?.totalPoints ?? 0} <span className="text-xs font-medium text-zinc-500">points</span></div>
            <div className="mt-1 text-[11px] text-zinc-600">{address ? short(address) : 'Connect wallet to see your rank'}</div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="text-[10px] uppercase tracking-widest text-zinc-600">Point rules</div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
              {activityMeta.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                    <Icon className="w-4 h-4 text-blue-300" />
                    <div className="mt-3 text-xs font-semibold text-white">{item.points}</div>
                    <div className="text-[10px] text-zinc-600">{item.label}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-[#111317] overflow-hidden">
          <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-white">Wallet rankings</h2>
              <p className="text-[11px] text-zinc-500 mt-0.5">Lifetime accumulated activity points, ranked highest first.</p>
            </div>
            <span className="text-[10px] font-mono text-zinc-600">{rows.length} wallets</span>
          </div>

          <div className="divide-y divide-zinc-800/70">
            {rows.map((row, index) => (
              <div key={row.walletAddress} className={`px-5 py-3.5 grid grid-cols-[28px_1fr_auto] items-center gap-3 ${row.walletAddress === me ? 'bg-blue-500/[0.05]' : ''}`}>
                <span className={`text-xs font-mono ${index < 3 ? 'text-blue-300' : 'text-zinc-600'}`}>{index + 1}</span>
                <div className="min-w-0">
                  <div className="text-xs font-mono text-zinc-300">{short(row.walletAddress)}{row.walletAddress === me && <span className="ml-2 text-[10px] text-blue-400">YOU</span>}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-600">
                    <span>{row.swapCount} swaps</span>
                    <span>{row.bridgeCount} bridges</span>
                    <span>{row.sendCount} sends</span>
                    <span>{row.nftMintCount} NFT mints</span>
                    <span>{row.coinLaunchCount} launches</span>
                  </div>
                </div>
                <span className="text-sm font-semibold text-white whitespace-nowrap">{row.totalPoints} pts</span>
              </div>
            ))}

            {!rows.length && !loading && (
              <div className="px-5 py-12 text-center">
                <Trophy className="w-6 h-6 text-zinc-700 mx-auto" />
                <div className="mt-3 text-sm text-zinc-400">No activity points recorded yet.</div>
                <div className="mt-1 text-[11px] text-zinc-600">Confirmed GEN-0FI activity will appear here.</div>
              </div>
            )}
          </div>
        </section>

        {myRow && (
          <section className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-white">Your point breakdown</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Every category contributing to your cumulative score.</p>
              </div>
              <span className="text-sm font-semibold text-blue-300">{myRow.totalPoints} pts</span>
            </div>
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-5 gap-2">
              {myBreakdown.map((item) => {
                const Icon = item.icon;
                return (
                  <div key={item.label} className="rounded-xl border border-zinc-800 bg-black/20 p-3">
                    <Icon className="w-4 h-4 text-zinc-400" />
                    <div className="mt-3 text-sm font-semibold text-white">{item.points}</div>
                    <div className="text-[10px] text-zinc-600">{item.count} × {item.points === 0 ? item.points : item.points / item.count || 0} pts</div>
                    <div className="mt-1 text-[10px] text-zinc-500">{item.label}</div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-[11px] leading-5 text-zinc-500">
          GM Streak is separate and does not contribute to this leaderboard.
        </div>
      </div>
    </div>
  );
};
