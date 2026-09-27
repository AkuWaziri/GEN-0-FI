// @ts-nocheck
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowUpRight, Landmark, ShieldCheck, WalletCards, CircleDollarSign, Euro, Info, RefreshCw, Activity, Database, TrendingUp, ExternalLink } from 'lucide-react';

type Asset = 'all' | 'USDC' | 'EURC';
type Market = {
  id: string;
  protocol: 'Aave V4' | 'Morpho';
  asset: 'USDC' | 'EURC';
  name: string;
  market: string;
  supplyApy: number;
  borrowApy: number;
  supplied: number | null;
  borrowed: number | null;
  available: number | null;
  utilization: number;
  collateralFactor?: number;
  lltv?: number;
  canSupply: boolean;
  canBorrow: boolean;
  active: boolean;
  frozen: boolean;
  url: string;
};

type MarketResponse = {
  updatedAt: string;
  aave: Market[];
  morpho: Market[];
  errors?: Record<string, string>;
};

const formatPct = (value: number) => Number.isFinite(value) ? \`\${value.toFixed(2)}%\` : '—';

const formatAmount = (value: number | null) => {
  if (value === null || !Number.isFinite(value)) return '—';
  if (value >= 1_000_000_000) return \`\${(value / 1_000_000_000).toFixed(2)}B\`;
  if (value >= 1_000_000) return \`\${(value / 1_000_000).toFixed(2)}M\`;
  if (value >= 1_000) return \`\${(value / 1_000).toFixed(1)}K\`;
  return value.toFixed(2);
};

const tone = (protocol: Market['protocol']) => protocol === 'Aave V4'
  ? {
      border: 'border-blue-500/20',
      glow: 'group-hover:border-blue-400/40',
      icon: 'text-blue-300 bg-blue-500/10 border-blue-500/20',
      chip: 'text-blue-300 bg-blue-500/10 border-blue-400/20',
    }
  : {
      border: 'border-violet-500/20',
      glow: 'group-hover:border-violet-400/40',
      icon: 'text-violet-300 bg-violet-500/10 border-violet-500/20',
      chip: 'text-violet-300 bg-violet-500/10 border-violet-400/20',
    };

export const SavingsView: React.FC = () => {
  const [assetFilter, setAssetFilter] = useState<Asset>('all');
  const [markets, setMarkets] = useState<Market[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadMarkets = useCallback(async (manual = false) => {
    manual ? setRefreshing(true) : setLoading(true);
    try {
      const response = await fetch('/api/lend/markets', { cache: 'no-store' });
      const data: MarketResponse = await response.json();
      if (!response.ok) throw new Error(data?.errors?.aave || data?.errors?.morpho || 'Live lending data unavailable');
      setMarkets([...(data.aave || []), ...(data.morpho || [])]);
      setUpdatedAt(data.updatedAt || new Date().toISOString());
      setErrors(data.errors || {});
    } catch (error) {
      setErrors({ general: error instanceof Error ? error.message : 'Live lending data unavailable' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadMarkets();
    const interval = window.setInterval(() => loadMarkets(), 60_000);
    return () => window.clearInterval(interval);
  }, [loadMarkets]);

  const visible = useMemo(
    () => markets.filter((market) => assetFilter === 'all' || market.asset === assetFilter),
    [markets, assetFilter],
  );

  const bestSupply = visible.reduce<Market | null>((best, market) => !best || market.supplyApy > best.supplyApy ? market : best, null);
  const totalLiquidity = visible.reduce((sum, market) => sum + (market.available || 0), 0);

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,.8)]" />
              <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">Live Arc lending</p>
            </div>
            <h1 className="mt-2 text-3xl sm:text-4xl font-bold text-white tracking-tight">Lend</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Live USDC and EURC supply and borrow markets across Aave V4 and Morpho on Arc.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center rounded-2xl border border-zinc-800 bg-zinc-950/70 p-1">
              {(['all', 'USDC', 'EURC'] as Asset[]).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setAssetFilter(filter)}
                  className={assetFilter === filter
                    ? 'rounded-xl bg-blue-500/15 border border-blue-500/20 px-4 py-2 text-xs font-semibold text-blue-300'
                    : 'rounded-xl border border-transparent px-4 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-200'}
                >
                  {filter === 'all' ? 'All pools' : filter}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => loadMarkets(true)}
              disabled={refreshing}
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3.5 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white disabled:opacity-50"
            >
              <RefreshCw className={\`w-3.5 h-3.5 \${refreshing ? 'animate-spin' : ''}\`} />
              Refresh
            </button>
          </div>
        </header>

        <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Metric icon={TrendingUp} label="Best live supply" value={bestSupply ? formatPct(bestSupply.supplyApy) : '—'} sub={bestSupply ? \`\${bestSupply.protocol} • \${bestSupply.asset}\` : 'Waiting for data'} />
          <Metric icon={Activity} label="Markets found" value={String(visible.length)} sub="Arc USDC + EURC" />
          <Metric icon={CircleDollarSign} label="Available liquidity" value={totalLiquidity ? \`$\${formatAmount(totalLiquidity)}\` : '—'} sub="Across displayed pools" />
          <Metric icon={Database} label="Data refresh" value={updatedAt ? new Date(updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'} sub="Auto-refreshes every 60s" />
        </section>

        <section className="relative overflow-hidden rounded-3xl border border-blue-500/20 bg-[radial-gradient(circle_at_10%_0%,rgba(37,99,235,.18),transparent_36%),radial-gradient(circle_at_90%_20%,rgba(124,58,237,.12),transparent_30%),#0b0d11] p-5 sm:p-7">
          <div className="absolute -right-24 -top-24 h-56 w-56 rounded-full bg-blue-500/10 blur-3xl" />
          <div className="relative grid lg:grid-cols-[1.5fr_1fr] gap-6 items-stretch">
            <div>
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-blue-300">
                <Landmark className="w-4 h-4" />
                Arc liquidity
              </div>
              <h2 className="mt-3 text-2xl sm:text-3xl font-semibold text-white">See the market before you lend.</h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-400">
                GEN-0FI reads current protocol data and surfaces active USDC and EURC pools. New markets appear automatically when the protocol APIs index them.
              </p>
              <div className="mt-6 grid sm:grid-cols-3 gap-2.5">
                <Signal icon={CircleDollarSign} label="USDC" value="Supply + borrow" />
                <Signal icon={Euro} label="EURC" value="Supply + borrow" />
                <Signal icon={ShieldCheck} label="Non-custodial" value="You approve externally" />
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.06] bg-black/30 p-5 backdrop-blur">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">Live data policy</div>
              <div className="mt-4 space-y-4">
                <Step number="01" title="Read" text="Aave V4 and Morpho APIs are queried directly." />
                <Step number="02" title="Normalize" text="APY, liquidity, borrow, and utilization are formatted consistently." />
                <Step number="03" title="Refresh" text="The UI refreshes automatically every 60 seconds." />
              </div>
            </div>
          </div>
        </section>

        {errors.general && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
            {errors.general}
          </div>
        )}

        {(errors.aave || errors.morpho) && (
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 text-xs text-amber-300">
            {errors.aave ? \`Aave: \${errors.aave}. \` : ''}{errors.morpho ? \`Morpho: \${errors.morpho}.\` : ''}
          </div>
        )}

        <section>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Live markets</h2>
              <p className="text-[11px] text-zinc-500 mt-1">Supply and borrow conditions reported by the protocols.</p>
            </div>
            <span className="text-[10px] text-zinc-600 font-mono">{visible.length} pools</span>
          </div>

          {loading ? (
            <div className="grid lg:grid-cols-2 gap-4">
              {[1, 2, 3, 4].map((item) => <div key={item} className="h-64 rounded-2xl border border-zinc-800 bg-[#111317] animate-pulse" />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-8 text-center text-sm text-zinc-500">
              No indexed USDC/EURC Arc lending markets are currently available from the live sources.
            </div>
          ) : (
            <div className="grid lg:grid-cols-2 gap-4">
              {visible.map((market) => {
                const colors = tone(market.protocol);
                return (
                  <article key={\`\${market.protocol}-\${market.id}\`} className={\`group rounded-2xl border \${colors.border} bg-[#101216] p-5 transition-all duration-200 \${colors.glow}\`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className={\`w-11 h-11 rounded-xl border flex items-center justify-center \${colors.icon}\`}>
                        {market.protocol === 'Aave V4' ? <Landmark className="w-5 h-5" /> : <Activity className="w-5 h-5" />}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={\`rounded-full border px-2.5 py-1 text-[9px] uppercase tracking-widest \${colors.chip}\`}>{market.protocol}</span>
                        <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[9px] font-mono text-zinc-500">{market.asset}</span>
                      </div>
                    </div>

                    <div className="mt-5">
                      <div className="text-[10px] uppercase tracking-widest text-zinc-600">{market.market}</div>
                      <h3 className="mt-1 text-lg font-semibold text-white">{market.name}</h3>
                    </div>

                    <div className="mt-5 grid grid-cols-2 gap-2">
                      <Rate label="Supply APY" value={formatPct(market.supplyApy)} positive />
                      <Rate label="Borrow APY" value={formatPct(market.borrowApy)} />
                      <Rate label="Available" value={formatAmount(market.available)} />
                      <Rate label="Utilization" value={formatPct(market.utilization)} />
                    </div>

                    <div className="mt-3 grid grid-cols-2 gap-2 text-[10px]">
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
                        <div className="text-zinc-600">Supplied</div>
                        <div className="mt-1 text-zinc-300">{formatAmount(market.supplied)} {market.asset}</div>
                      </div>
                      <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3 py-2.5">
                        <div className="text-zinc-600">Borrowed</div>
                        <div className="mt-1 text-zinc-300">{formatAmount(market.borrowed)} {market.asset}</div>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                        <span className={\`h-1.5 w-1.5 rounded-full \${market.active && !market.frozen ? 'bg-emerald-400' : 'bg-amber-400'}\`} />
                        {market.active && !market.frozen ? 'Active' : 'Restricted'}
                        {market.canBorrow && <span>• Borrow</span>}
                        {market.canSupply && <span>• Supply</span>}
                      </div>
                      <a href={market.url} target="_blank" rel="noopener noreferrer" className={\`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors \${colors.chip}\`}>
                        Open market <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl border border-zinc-800 bg-zinc-950 flex items-center justify-center">
              <WalletCards className="w-5 h-5 text-blue-300" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-white">GEN-0FI stays discovery-only</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
                This tab reads live protocol information and links you to the external protocol interface. GEN-0FI does not approve, supply, borrow, repay, or withdraw funds from this screen.
              </p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <a href="https://pro.aave.com/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-blue-400/20 bg-blue-500/10 px-3 py-2 text-xs font-semibold text-blue-300">Aave V4 <ExternalLink className="w-3.5 h-3.5" /></a>
            <a href="https://app.morpho.org/arc" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-violet-400/20 bg-violet-500/10 px-3 py-2 text-xs font-semibold text-violet-300">Morpho Arc <ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
        </section>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 flex items-start gap-2.5 text-[11px] leading-5 text-zinc-500">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
          <span>APYs, liquidity, utilization, market availability, and protocol listings can change. GEN-0FI displays source data as returned by Aave and Morpho and does not estimate missing values.</span>
        </div>
      </div>
    </div>
  );
};

function Metric({ icon: Icon, label, value, sub }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-4">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-zinc-600"><Icon className="w-3.5 h-3.5 text-blue-300" />{label}</div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
      <div className="mt-1 text-[10px] text-zinc-600">{sub}</div>
    </div>
  );
}

function Rate({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3">
      <div className="text-[10px] text-zinc-600">{label}</div>
      <div className={\`mt-1 text-base font-semibold \${positive ? 'text-emerald-300' : 'text-zinc-200'}\`}>{value}</div>
    </div>
  );
}

function Signal({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3.5 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-white"><Icon className="w-3.5 h-3.5 text-blue-300" />{label}</div><div className="mt-1 text-[10px] text-zinc-600">{value}</div></div>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3"><div className="w-8 h-8 shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 flex items-center justify-center text-[9px] font-mono text-blue-300">{number}</div><div><div className="text-xs font-semibold text-zinc-200">{title}</div><div className="mt-0.5 text-[10px] leading-5 text-zinc-600">{text}</div></div></div>;
}
