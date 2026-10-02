import React, { useEffect, useState } from 'react';
import { Activity, Blocks, Gauge, Network, RefreshCw, Zap } from 'lucide-react';

type ArcStats = {
  connected: boolean;
  chainId: number;
  blockNumber: number;
  latencyMs: number;
  gasPriceGwei: string | null;
  nativeCurrency: string;
  explorerUrl: string;
};

export const ArcMainnetStatsView: React.FC = () => {
  const [stats, setStats] = useState<ArcStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/blockchain/arc/status', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data.connected) throw new Error(data.message || 'Unable to query Arc Mainnet');
      setStats(data);
      setUpdatedAt(new Date());
    } catch (err: any) {
      setError(err?.message || 'Unable to query Arc Mainnet');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const timer = window.setInterval(load, 20000);
    return () => window.clearInterval(timer);
  }, []);

  const cards = [
    { label: 'Network', value: stats?.connected ? 'Online' : 'Unavailable', icon: Network },
    { label: 'Latest Block', value: stats ? stats.blockNumber.toLocaleString() : '—', icon: Blocks },
    { label: 'Gas Price', value: stats?.gasPriceGwei ? stats.gasPriceGwei + ' gwei' : '—', icon: Gauge },
    { label: 'RPC Latency', value: stats ? stats.latencyMs + ' ms' : '—', icon: Activity },
  ];

  return (
    <section className="w-full px-4 sm:px-6 lg:px-8 py-6 sm:py-8 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-7">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400">Arc Mainnet</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-semibold tracking-tight text-white">Network Stats</h1>
          <p className="mt-2 text-sm text-zinc-400">Live network information queried directly from Arc Mainnet.</p>
        </div>
        <button onClick={load} disabled={loading} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2.5 text-xs font-semibold text-zinc-200 hover:border-zinc-700 disabled:opacity-60">
          <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /> Refresh
        </button>
      </div>

      {error && <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <div key={label} className="rounded-2xl border border-zinc-800 bg-[#0b0d10] p-5">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</span>
              <Icon className="h-4 w-4 text-cyan-400" />
            </div>
            <div className="mt-4 text-xl font-semibold text-white break-words">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-2xl border border-zinc-800 bg-[#0b0d10] p-5">
          <div className="flex items-center gap-2 text-sm font-semibold text-white"><Zap className="h-4 w-4 text-cyan-400" /> Chain Details</div>
          <dl className="mt-4 space-y-3 text-xs">
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Chain ID</dt><dd className="font-mono text-zinc-200">{stats?.chainId ?? '—'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Native gas asset</dt><dd className="font-mono text-zinc-200">{stats?.nativeCurrency ?? 'USDC'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-zinc-500">Data source</dt><dd className="font-mono text-zinc-200">Arc Mainnet RPC</dd></div>
          </dl>
        </div>
        <div className="rounded-2xl border border-zinc-800 bg-[#0b0d10] p-5">
          <div className="text-sm font-semibold text-white">Live status</div>
          <div className="mt-4 flex items-center gap-2 text-xs text-zinc-400">
            <span className={stats?.connected ? 'h-2 w-2 rounded-full bg-emerald-400' : 'h-2 w-2 rounded-full bg-amber-400'} />
            {stats?.connected ? 'Connected to Arc Mainnet' : 'Arc Mainnet unavailable'}
          </div>
          {updatedAt && <div className="mt-2 text-[11px] text-zinc-600">Updated {updatedAt.toLocaleTimeString()}</div>}
          {stats?.explorerUrl && <a href={stats.explorerUrl} target="_blank" rel="noreferrer" className="mt-4 inline-block text-xs text-cyan-400 hover:text-cyan-300">Open Arc Explorer ↗</a>}
        </div>
      </div>
    </section>
  );
};
