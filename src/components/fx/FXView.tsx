import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Coins, Globe2, Info, Loader2, RefreshCw, Search, TrendingUp } from 'lucide-react';

type Kind = 'stable' | 'fiat';
type Stablecoin = { id: number; name: string; symbol: string; price: number };
type Fiat = { code: string; name: string };

const STABLES_URL = 'https://api.llama.fi/stablecoins?includePrices=true';
const FIATS_URL = 'https://api.frankfurter.dev/v2/currencies';
const RATES_URL = 'https://api.frankfurter.dev/v2/rates';

const formatValue = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return value.toLocaleString('en-US', { maximumFractionDigits: 8 });
};

export const FXView: React.FC = () => {
  const [stables, setStables] = useState<Stablecoin[]>([]);
  const [fiats, setFiats] = useState<Fiat[]>([]);
  const [fromKind, setFromKind] = useState<Kind>('stable');
  const [toKind, setToKind] = useState<Kind>('fiat');
  const [from, setFrom] = useState('USDC');
  const [to, setTo] = useState('NGN');
  const [amount, setAmount] = useState('1');
  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const [quote, setQuote] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [fiatDate, setFiatDate] = useState<string | null>(null);
  const [stableUpdated, setStableUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableMap = useMemo(() => new Map(stables.map((x) => [x.symbol, x])), [stables]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [stableRes, fiatRes] = await Promise.all([
        fetch(STABLES_URL, { cache: 'no-store' }),
        fetch(FIATS_URL, { cache: 'no-store' }),
      ]);
      if (!stableRes.ok || !fiatRes.ok) throw new Error('FX data source is temporarily unavailable.');
      const stableJson = await stableRes.json();
      const fiatJson = await fiatRes.json();

      const nextStables = (Array.isArray(stableJson?.peggedAssets) ? stableJson.peggedAssets : [])
        .map((x: any) => ({
          id: Number(x.id),
          name: String(x.name || x.symbol || 'Stablecoin'),
          symbol: String(x.symbol || '').toUpperCase(),
          price: Number(x.price),
        }))
        .filter((x: Stablecoin) => x.symbol && Number.isFinite(x.price) && x.price > 0)
        .sort((a: Stablecoin, b: Stablecoin) => a.symbol.localeCompare(b.symbol));

      const nextFiats = Object.entries(fiatJson || {})
        .map(([code, name]) => ({ code: code.toUpperCase(), name: String(name) }))
        .sort((a, b) => a.code.localeCompare(b.code));

      if (!nextStables.length) throw new Error('No live stablecoin prices were returned.');
      setStables(nextStables);
      setFiats(nextFiats);

      if (!nextStables.some((x: Stablecoin) => x.symbol === from)) {
        setFrom(nextStables.some((x: Stablecoin) => x.symbol === 'USDC') ? 'USDC' : nextStables[0].symbol);
      }
      if (!nextFiats.some((x: Fiat) => x.code === to)) {
        setTo(nextFiats.some((x: Fiat) => x.code === 'USD') ? 'USD' : nextFiats[0]?.code || 'USD');
      }
      setStableUpdated(Date.now());
    } catch (e: any) {
      setError(String(e?.message || 'Could not load FX data.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const getUsdRates = async (codes: string[]) => {
    const unique = [...new Set(codes.filter((x) => x && x !== 'USD'))];
    if (!unique.length) return { date: '', rates: {} as Record<string, number> };
    const response = await fetch(
      RATES_URL + '?base=USD&quotes=' + encodeURIComponent(unique.join(',')),
      { cache: 'no-store' },
    );
    if (!response.ok) throw new Error('Fiat reference rate is unavailable.');
    const data = await response.json();
    return { date: String(data.date || ''), rates: data.rates || {} as Record<string, number> };
  };

  const convert = async () => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) return;
    setQuoting(true);
    setError(null);

    try {
      let fromUsd = 1;
      let toUsd = 1;
      const fiatCodes: string[] = [];

      if (fromKind === 'stable') {
        const asset = stableMap.get(from);
        if (!asset) throw new Error('Selected stablecoin rate is unavailable.');
        fromUsd = asset.price;
      } else if (from !== 'USD') {
        fiatCodes.push(from);
      }

      if (toKind === 'stable') {
        const asset = stableMap.get(to);
        if (!asset) throw new Error('Selected stablecoin rate is unavailable.');
        toUsd = asset.price;
      } else if (to !== 'USD') {
        fiatCodes.push(to);
      }

      if (fiatCodes.length) {
        const data = await getUsdRates(fiatCodes);
        setFiatDate(data.date || null);

        if (fromKind === 'fiat' && from !== 'USD') {
          const value = Number(data.rates[from]);
          if (!value) throw new Error('Selected source fiat rate is unavailable.');
          fromUsd = 1 / value;
        }
        if (toKind === 'fiat' && to !== 'USD') {
          const value = Number(data.rates[to]);
          if (!value) throw new Error('Selected destination fiat rate is unavailable.');
          toUsd = 1 / value;
        }
      } else {
        setFiatDate(null);
      }

      const nextRate = fromUsd / toUsd;
      setRate(nextRate);
      setQuote(numericAmount * nextRate);
    } catch (e: any) {
      setRate(null);
      setQuote(null);
      setError(String(e?.message || 'Conversion rate is temporarily unavailable.'));
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    if (!loading) convert();
  }, [amount, fromKind, toKind, from, to, loading, stables.length, fiats.length]);

  const swap = () => {
    const oldFrom = from;
    const oldFromKind = fromKind;
    setFrom(to);
    setFromKind(toKind);
    setTo(oldFrom);
    setToKind(oldFromKind);
  };

  const changeKind = (side: 'from' | 'to', kind: Kind) => {
    const defaultValue = kind === 'stable'
      ? (stables.some((x) => x.symbol === 'USDC') ? 'USDC' : stables[0]?.symbol || '')
      : (fiats.some((x) => x.code === 'USD') ? 'USD' : fiats[0]?.code || '');
    if (side === 'from') {
      setFromKind(kind);
      if (kind !== fromKind) setFrom(defaultValue);
    } else {
      setToKind(kind);
      if (kind !== toKind) setTo(defaultValue);
    }
  };

  const renderAssetName = (kind: Kind, value: string) => {
    if (kind === 'stable') return stables.find((x) => x.symbol === value)?.name || 'Stablecoin';
    return fiats.find((x) => x.code === value)?.name || 'Fiat currency';
  };

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">Live conversion</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">FX</h1>
            <p className="mt-2 text-sm text-zinc-400">Convert stablecoins and fiat currencies with source-aware rates.</p>
          </div>
          <button onClick={load} disabled={loading} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:border-blue-500/30">
            <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          </button>
        </div>

        <div className="rounded-2xl border border-blue-500/20 bg-[#0d0f12] p-5 sm:p-7">
          <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <Picker
              label="From"
              kind={fromKind}
              value={from}
              amount={amount}
              setAmount={setAmount}
              onKindChange={(k) => changeKind('from', k)}
              onValueChange={setFrom}
              stables={stables}
              fiats={fiats}
              search={fromSearch}
              setSearch={setFromSearch}
            />

            <button onClick={swap} className="w-10 h-10 mb-1 mx-auto rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-blue-500 transition flex items-center justify-center" aria-label="Swap currencies">
              <ArrowDownUp className="w-4 h-4" />
            </button>

            <Picker
              label="To"
              kind={toKind}
              value={to}
              amount=""
              setAmount={() => {}}
              onKindChange={(k) => changeKind('to', k)}
              onValueChange={setTo}
              stables={stables}
              fiats={fiats}
              search={toSearch}
              setSearch={setToSearch}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">You convert</span>
              <span className="text-xl font-semibold text-white">{formatValue(Number(amount) || 0)} {from}</span>
            </div>
            <div className="my-4 h-px bg-zinc-800" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">You receive</span>
              <span className="text-2xl font-bold text-blue-400">
                {quoting ? <Loader2 className="w-5 h-5 animate-spin" /> : quote === null ? '—' : formatValue(quote) + ' ' + to}
              </span>
            </div>
          </div>

          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            <Stat label="Rate" value={rate === null ? 'Unavailable' : '1 ' + from + ' = ' + formatValue(rate) + ' ' + to} />
            <Stat label="Coverage" value={loading ? 'Loading…' : stables.length + ' stablecoins · ' + fiats.length + ' fiat currencies'} />
            <Stat label="Updated" value={fiatDate || (stableUpdated ? new Date(stableUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—')} />
          </div>

          {error && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">{error}</div>}

          <div className="mt-4 rounded-xl border border-blue-500/10 bg-blue-500/[0.03] px-4 py-3 flex items-start gap-2.5 text-[11px] text-zinc-500">
            <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
            <span>Stablecoin prices use live DeFiLlama market data. Fiat rates use Frankfurter daily reference data from central-bank and official sources. These are valuation rates, not execution quotes.</span>
          </div>
        </div>

        <div className="grid lg:grid-cols-[1.35fr_.65fr] gap-4">
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="flex items-center gap-3">
              <Coins className="w-5 h-5 text-blue-400" />
              <div><h2 className="text-sm font-semibold text-white">Stablecoin market</h2><p className="text-[11px] text-zinc-500 mt-0.5">Live stablecoins available for conversion.</p></div>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {stables.slice(0, 24).map((x) => (
                <button key={x.id} onClick={() => { setFromKind('stable'); setFrom(x.symbol); }} className="text-left rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3 hover:border-blue-500/30">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-white">{x.symbol}</span><span className="text-[10px] text-zinc-500">{formatValue(x.price)} USD</span></div>
                  <div className="mt-1 text-[10px] text-zinc-600 truncate">{x.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="flex items-center gap-3">
              <Globe2 className="w-5 h-5 text-blue-400" />
              <div><h2 className="text-sm font-semibold text-white">Fiat coverage</h2><p className="text-[11px] text-zinc-500 mt-0.5">Searchable currency universe.</p></div>
            </div>
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"><div className="text-2xl font-bold text-white">{fiats.length || '—'}</div><div className="text-[11px] text-zinc-500 mt-1">available fiat currencies</div></div>
            <div className="mt-4 space-y-2 text-[11px] text-zinc-500">
              <div className="flex items-center gap-2"><Clock3 className="w-3.5 h-3.5" /> Fiat rates use published reference data.</div>
              <div className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Stablecoin prices can move throughout the day.</div>
              <div className="flex items-center gap-2"><Info className="w-3.5 h-3.5" /> No hard-coded exchange rate is used.</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function Picker(props: {
  label: string;
  kind: Kind;
  value: string;
  amount: string;
  setAmount: (value: string) => void;
  onKindChange: (kind: Kind) => void;
  onValueChange: (value: string) => void;
  stables: Stablecoin[];
  fiats: Fiat[];
  search: string;
  setSearch: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = props.kind === 'stable'
    ? props.stables.filter((x) => {
        const q = props.search.toLowerCase().trim();
        return !q || x.symbol.toLowerCase().includes(q) || x.name.toLowerCase().includes(q);
      }).slice(0, 100)
    : props.fiats.filter((x) => {
        const q = props.search.toLowerCase().trim();
        return !q || x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q);
      }).slice(0, 100);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">{props.label}</span>
        {props.label === 'From' && <input value={props.amount} onChange={(e) => props.setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal" className="w-32 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-right text-sm font-mono text-white outline-none focus:border-blue-500/50" />}
      </div>

      <div className="flex gap-2">
        <div className="flex rounded-xl border border-zinc-800 bg-zinc-950 p-1 shrink-0">
          <button onClick={() => props.onKindChange('stable')} className={props.kind === 'stable' ? 'rounded-lg px-2.5 py-2 text-[10px] font-semibold bg-blue-500/15 text-blue-300' : 'rounded-lg px-2.5 py-2 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200'}>Stable</button>
          <button onClick={() => props.onKindChange('fiat')} className={props.kind === 'fiat' ? 'rounded-lg px-2.5 py-2 text-[10px] font-semibold bg-blue-500/15 text-blue-300' : 'rounded-lg px-2.5 py-2 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200'}>Fiat</button>
        </div>

        <div className="relative flex-1">
          <button onClick={() => setOpen((x) => !x)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-left hover:border-blue-500/30">
            <span className="block text-sm font-semibold text-white">{props.value || 'Select'}</span>
            <span className="block mt-0.5 text-[10px] text-zinc-600 truncate">
              {props.kind === 'stable'
                ? props.stables.find((x) => x.symbol === props.value)?.name || 'Stablecoin'
                : props.fiats.find((x) => x.code === props.value)?.name || 'Fiat currency'}
            </span>
          </button>

          {open && (
            <div className="absolute z-30 top-[calc(100%+8px)] left-0 right-0 rounded-xl border border-zinc-700 bg-[#111317] shadow-2xl overflow-hidden">
              <div className="p-2 border-b border-zinc-800">
                <div className="flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2">
                  <Search className="w-3.5 h-3.5 text-zinc-500" />
                  <input autoFocus value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder={props.kind === 'stable' ? 'Search stablecoins' : 'Search fiat currencies'} className="w-full bg-transparent text-xs text-white outline-none" />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                {list.map((x: any) => (
                  <button
                    key={props.kind === 'stable' ? x.id : x.code}
                    onClick={() => { props.onValueChange(props.kind === 'stable' ? x.symbol : x.code); setOpen(false); }}
                    className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white">{props.kind === 'stable' ? x.symbol : x.code}</span>
                      {props.kind === 'stable' && <span className="text-[10px] text-zinc-500">{formatValue(x.price)} USD</span>}
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{x.name}</div>
                  </button>
                ))}
                {!list.length && <div className="px-3 py-6 text-center text-xs text-zinc-500">No matching assets.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5"><div className="text-[10px] uppercase tracking-widest text-zinc-600">{label}</div><div className="mt-1 text-sm font-semibold text-white">{value}</div></div>;
}
