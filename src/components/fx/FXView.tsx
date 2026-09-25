import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Check, ChevronDown, Loader2, RefreshCw, Search } from 'lucide-react';

type Kind = 'crypto' | 'fiat';
type Asset = { id?: string; symbol?: string; code?: string; name: string; kind: Kind; stable?: boolean; rank?: number };
const codeOf = (a: Asset) => a.kind === 'fiat' ? a.code || '' : a.symbol || '';
const keyOf = (a: Asset) => a.kind + ':' + codeOf(a);
const numberText = (n: number, digits = 8) => Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits }) : '—';

export const FXView: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [from, setFrom] = useState<Asset | null>(null);
  const [to, setTo] = useState<Asset | null>(null);
  const [amount, setAmount] = useState('1');
  const [converted, setConverted] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [updated, setUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState('');
  const [picker, setPicker] = useState<'from' | 'to' | null>(null);
  const [search, setSearch] = useState('');

  const loadAssets = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/fx/rates', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok || !data?.ok || !Array.isArray(data.assets)) throw new Error(data?.error || 'Market assets are unavailable.');
      const next = data.assets as Asset[];
      setAssets(next);
      setFrom(current => current && next.some(a => keyOf(a) === keyOf(current)) ? current : next.find(a => a.kind === 'crypto' && codeOf(a) === 'USDC') || next.find(a => a.kind === 'crypto') || next[0] || null);
      setTo(current => current && next.some(a => keyOf(a) === keyOf(current)) ? current : next.find(a => a.kind === 'fiat' && codeOf(a) === 'NGN') || next.find(a => a.kind === 'fiat' && codeOf(a) === 'USD') || next[0] || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load live market assets.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAssets(); }, []);

  useEffect(() => {
    if (!from || !to || !assets.length || !amount.trim()) return;
    const value = Number(amount);
    if (!Number.isFinite(value) || value < 0) {
      setConverted(null); setRate(null); setError('Enter a valid amount.'); return;
    }
    let active = true;
    const run = async () => {
      setQuoting(true);
      setError('');
      try {
        const params = new URLSearchParams({ from: codeOf(from), to: codeOf(to), amount: String(value) });
        const response = await fetch('/api/fx/convert?' + params.toString(), { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok || !data?.ok) throw new Error(data?.error || 'Conversion is unavailable right now.');
        if (!active) return;
        setConverted(Number(data.converted));
        setRate(data.rate == null ? null : Number(data.rate));
        setUpdated(data.lastUpdated || data.asOf || null);
      } catch (e) {
        if (!active) return;
        setConverted(null); setRate(null);
        setError(e instanceof Error ? e.message : 'Live conversion failed.');
      } finally { if (active) setQuoting(false); }
    };
    void run();
    return () => { active = false; };
  }, [from, to, amount, assets.length]);

  const grouped = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matches = assets.filter(a => !query || codeOf(a).toLowerCase().includes(query) || a.name.toLowerCase().includes(query));
    return {
      stable: matches.filter(a => a.kind === 'crypto' && a.stable),
      crypto: matches.filter(a => a.kind === 'crypto' && !a.stable),
      fiat: matches.filter(a => a.kind === 'fiat'),
    };
  }, [assets, search]);

  const selectAsset = (asset: Asset) => {
    if (picker === 'from') setFrom(asset);
    if (picker === 'to') setTo(asset);
    setPicker(null); setSearch('');
  };
  const openPicker = (side: 'from' | 'to') => { setPicker(side); setSearch(''); };
  const swap = () => { setFrom(to); setTo(from); };

  const assetCard = (side: 'from' | 'to', asset: Asset | null) => (
    <div className="rounded-2xl border border-white/[0.08] bg-[#101722] p-4 sm:p-5 transition-colors focus-within:border-cyan-400/40">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">{side === 'from' ? 'You pay' : 'You receive'}</span>
        {side === 'from' && <span className="text-[10px] text-slate-500">Amount</span>}
      </div>
      <div className="flex items-center gap-3">
        {side === 'from' ? (
          <input aria-label="Amount to convert" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" className="min-w-0 flex-1 bg-transparent text-3xl sm:text-4xl font-semibold tracking-tight text-white outline-none placeholder:text-slate-700" />
        ) : (
          <div className="min-w-0 flex-1 truncate text-3xl sm:text-4xl font-semibold tracking-tight text-white">
            {quoting ? <Loader2 className="inline h-6 w-6 animate-spin text-cyan-300" /> : converted === null ? '—' : numberText(converted, 6)}
          </div>
        )}
        <button type="button" onClick={() => openPicker(side)} className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-2.5 text-left hover:border-cyan-300/40 hover:bg-cyan-300/[0.06]">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-300/20 to-blue-500/20 text-[10px] font-bold text-cyan-100">{asset ? codeOf(asset).slice(0, 3) : '—'}</span>
          <span className="min-w-0">
            <span className="block text-sm font-bold text-white">{asset ? codeOf(asset) : 'Choose'}</span>
            <span className="block max-w-[100px] truncate text-[10px] text-slate-400">{asset?.name || 'Select asset'}</span>
          </span>
          <ChevronDown className="h-4 w-4 text-slate-400" />
        </button>
      </div>
    </div>
  );

  return (
    <main className="min-h-[calc(100vh-3.5rem)] w-full px-4 py-7 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-2xl">
        <header className="mb-7 flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-cyan-300"><span className="h-1.5 w-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_rgba(103,232,249,.8)]" /> GEN-0FI / FX</div>
            <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">Currency converter</h1>
            <p className="mt-2 max-w-lg text-sm leading-6 text-slate-400">Reference rates across digital assets, stablecoins and fiat currencies.</p>
          </div>
          <button type="button" onClick={() => void loadAssets()} disabled={loading} aria-label="Refresh market data" className="mt-1 inline-flex h-10 items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-slate-300 hover:border-cyan-300/30 hover:text-white disabled:opacity-50">
            <RefreshCw className={loading ? 'h-3.5 w-3.5 animate-spin' : 'h-3.5 w-3.5'} /><span className="hidden sm:inline">Refresh</span>
          </button>
        </header>

        <section className="overflow-hidden rounded-[28px] border border-white/[0.09] bg-[#0b111b] shadow-[0_24px_90px_rgba(0,0,0,.35)]">
          <div className="border-b border-white/[0.07] bg-gradient-to-br from-cyan-400/[0.07] via-transparent to-blue-500/[0.07] p-4 sm:p-6">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500">Convert assets</span>
              <span className="rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-cyan-200">Live reference</span>
            </div>
            {assetCard('from', from)}
            <div className="relative z-10 -my-2 flex justify-center">
              <button type="button" onClick={swap} aria-label="Swap currencies" className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#151e2c] text-cyan-200 shadow-lg transition hover:rotate-180 hover:border-cyan-300/40"><ArrowDownUp className="h-4 w-4" /></button>
            </div>
            {assetCard('to', to)}
          </div>
          <div className="p-4 sm:p-6">
            <div className="rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.035] p-4 sm:p-5">
              <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">Indicative exchange rate</div>
              <div className="mt-2 text-lg font-semibold text-white sm:text-xl">
                {quoting ? 'Updating rate…' : rate === null || !from || !to ? 'Rate unavailable' : <>1 {codeOf(from)} <span className="mx-1 text-slate-500">≈</span> {numberText(rate, Math.abs(rate) >= 1000 ? 2 : 8)} {codeOf(to)}</>}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
                <span>CoinMarketCap market data</span>
                <span>{updated ? 'Updated ' + new Date(updated).toLocaleString() : 'Waiting for quote'}</span>
              </div>
            </div>
            {error && <div role="alert" className="mt-4 rounded-xl border border-rose-400/20 bg-rose-400/[0.06] px-4 py-3 text-xs text-rose-200">{error}</div>}
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
              <span>{loading ? 'Loading asset catalogue…' : assets.length + ' assets available'}</span>
              <span>Quote only · no wallet transaction or trade execution</span>
            </div>
          </div>
        </section>
        <p className="mt-4 text-center text-[10px] leading-5 text-slate-600">Rates are indicative and may differ from executable market prices, spreads or onchain liquidity.</p>
      </div>

      {picker && (
        <div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={e => { if (e.target === e.currentTarget) { setPicker(null); setSearch(''); } }}>
          <div role="dialog" aria-modal="true" aria-label="Select currency" className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0e1520] shadow-2xl sm:rounded-3xl">
            <div className="border-b border-white/[0.08] p-4">
              <div className="mb-3 flex items-center justify-between">
                <div><div className="text-sm font-semibold text-white">Select asset</div><div className="mt-1 text-[10px] text-slate-500">Choose crypto, stablecoin or fiat</div></div>
                <button type="button" onClick={() => { setPicker(null); setSearch(''); }} className="rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-white/5 hover:text-white">Close</button>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-3">
                <Search className="h-4 w-4 text-slate-500" /><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or ticker" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-slate-600" />
              </div>
            </div>
            <div className="overflow-y-auto p-2">
              {([['Stablecoins', grouped.stable], ['Crypto', grouped.crypto], ['Fiat currencies', grouped.fiat]] as [string, Asset[]][]).map(([heading, list]) => list.length > 0 && (
                <div key={heading}>
                  <div className="px-3 pb-1 pt-3 text-[9px] font-semibold uppercase tracking-[0.18em] text-slate-500">{heading}</div>
                  {list.map(asset => (
                    <button key={keyOf(asset)} type="button" onClick={() => selectAsset(asset)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-cyan-300/[0.07]">
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.04] text-[10px] font-bold text-cyan-100">{codeOf(asset).slice(0, 3)}</span>
                      <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{codeOf(asset)}</span><span className="block truncate text-[11px] text-slate-500">{asset.name}</span></span>
                      {(picker === 'from' ? from : to) && keyOf(picker === 'from' ? from! : to!) === keyOf(asset) && <Check className="h-4 w-4 text-cyan-300" />}
                    </button>
                  ))}
                </div>
              ))}
              {!grouped.stable.length && !grouped.crypto.length && !grouped.fiat.length && <div className="p-8 text-center text-sm text-slate-500">{loading ? 'Loading assets…' : 'No matching assets found.'}</div>}
            </div>
          </div>
        </div>
      )}
    </main>
  );
};


