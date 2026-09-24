import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
  Clock3,
  Coins,
  ExternalLink,
  Globe2,
  Info,
  Loader2,
  RefreshCw,
  Search,
} from 'lucide-react';

type Kind = 'stable' | 'fiat';

type Stablecoin = {
  id: string;
  name: string;
  symbol: string;
  priceUSD: number;
};

type Fiat = {
  code: string;
  name: string;
};

type RateResult = {
  rate: number;
  date: string | null;
  source: 'Frankfurter' | 'CBN';
};

const STABLES_URL = 'https://api.llama.fi/stablecoins?includePrices=true';
const FIATS_URL = 'https://api.frankfurter.dev/v2/currencies';
const FRANKFURTER_URL = 'https://api.frankfurter.dev/v2';
const CBN_RATES_URL = 'https://api.frankfurter.dev/v2/providers/cbn/rates';

const POPULAR_PAIRS = [
  { from: 'USDC', fromKind: 'stable' as Kind, to: 'USD', toKind: 'fiat' as Kind },
  { from: 'EURC', fromKind: 'stable' as Kind, to: 'USD', toKind: 'fiat' as Kind },
  { from: 'USD', fromKind: 'fiat' as Kind, to: 'NGN', toKind: 'fiat' as Kind },
  { from: 'EUR', fromKind: 'fiat' as Kind, to: 'NGN', toKind: 'fiat' as Kind },
  { from: 'GBP', fromKind: 'fiat' as Kind, to: 'USD', toKind: 'fiat' as Kind },
];

const formatNumber = (value: number, maxFraction = 6) => {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: maxFraction,
  });
};

const formatRate = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return formatNumber(value, 2);
  if (Math.abs(value) >= 1) return formatNumber(value, 6);
  return formatNumber(value, 8);
};

const stableLabel = (symbol: string, stables: Stablecoin[]) =>
  stables.find((item) => item.symbol === symbol)?.name || 'Stablecoin';

export const FXView: React.FC = () => {
  const [stables, setStables] = useState<Stablecoin[]>([]);
  const [fiats, setFiats] = useState<Fiat[]>([]);
  const [fromKind, setFromKind] = useState<Kind>('stable');
  const [toKind, setToKind] = useState<Kind>('fiat');
  const [from, setFrom] = useState('USDC');
  const [to, setTo] = useState('USD');
  const [amount, setAmount] = useState('1');
  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const [rate, setRate] = useState<number | null>(null);
  const [converted, setConverted] = useState<number | null>(null);
  const [rateSource, setRateSource] = useState<'Frankfurter' | 'CBN' | 'DeFiLlama' | null>(null);
  const [rateDate, setRateDate] = useState<string | null>(null);
  const [stableUpdatedAt, setStableUpdatedAt] = useState<number | null>(null);
  const [fiatDate, setFiatDate] = useState<string | null>(null);
  const [cbnNgnRate, setCbnNgnRate] = useState<number | null>(null);
  const [cbnDate, setCbnDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableMap = useMemo(
    () => new Map(stables.map((item) => [item.symbol, item])),
    [stables],
  );

  const selectedFrom = fromKind === 'stable' ? stableMap.get(from) || null : null;
  const selectedTo = toKind === 'stable' ? stableMap.get(to) || null : null;

  const loadAssets = async () => {
    setLoading(true);
    setError(null);

    try {
      const [stableResponse, fiatResponse, cbnResponse] = await Promise.all([
        fetch(STABLES_URL, { cache: 'no-store' }),
        fetch(FIATS_URL, { cache: 'no-store' }),
        fetch(CBN_RATES_URL + '?base=USD&quotes=NGN', { cache: 'no-store' }),
      ]);

      if (!stableResponse.ok || !fiatResponse.ok) {
        throw new Error('FX reference data is temporarily unavailable.');
      }

      const [stableJson, fiatJson, cbnJson] = await Promise.all([
        stableResponse.json(),
        fiatResponse.json(),
        cbnResponse.ok ? cbnResponse.json() : Promise.resolve([]),
      ]);

      const nextStables = (Array.isArray(stableJson?.peggedAssets) ? stableJson.peggedAssets : [])
        .map((item: any) => ({
          id: String(item.id),
          name: String(item.name || item.symbol || 'Stablecoin'),
          symbol: String(item.symbol || '').toUpperCase(),
          priceUSD: Number(item.price),
        }))
        .filter((item: Stablecoin) => item.symbol && Number.isFinite(item.priceUSD) && item.priceUSD > 0)
        .sort((a: Stablecoin, b: Stablecoin) => a.symbol.localeCompare(b.symbol));

      const nextFiats = Object.entries(fiatJson || {})
        .map(([code, name]) => ({ code: code.toUpperCase(), name: String(name) }))
        .sort((a, b) => a.code.localeCompare(b.code));

      if (!nextFiats.some((item: Fiat) => item.code === 'USD')) {
        nextFiats.unshift({ code: 'USD', name: 'United States Dollar' });
      }

      if (!nextFiats.some((item: Fiat) => item.code === 'NGN')) {
        nextFiats.push({ code: 'NGN', name: 'Nigerian Naira' });
      }

      if (!nextStables.length) throw new Error('No stablecoin market prices were returned.');

      setStables(nextStables);
      setFiats(nextFiats);
      setStableUpdatedAt(Date.now());

      const latestCbn = Array.isArray(cbnJson)
        ? cbnJson.find((row: any) => String(row?.quote || '').toUpperCase() === 'NGN')
        : null;

      if (latestCbn && Number.isFinite(Number(latestCbn.rate))) {
        setCbnNgnRate(Number(latestCbn.rate));
        setCbnDate(latestCbn.date ? String(latestCbn.date) : null);
      } else {
        setCbnNgnRate(null);
        setCbnDate(null);
      }

      if (!nextStables.some((item) => item.symbol === from) && fromKind === 'stable') {
        setFrom(nextStables.some((item) => item.symbol === 'USDC') ? 'USDC' : nextStables[0].symbol);
      }

      if (!nextStables.some((item) => item.symbol === to) && toKind === 'stable') {
        setTo(nextStables.some((item) => item.symbol === 'EURC') ? 'EURC' : nextStables[0].symbol);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load FX reference data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssets();
  }, []);

  const getFiatToUsd = async (code: string): Promise<RateResult> => {
    if (code === 'USD') return { rate: 1, date: null, source: 'Frankfurter' };

    if (code === 'NGN' && cbnNgnRate) {
      return {
        rate: 1 / cbnNgnRate,
        date: cbnDate,
        source: 'CBN',
      };
    }

    const response = await fetch(
      `${FRANKFURTER_URL}/rate/${encodeURIComponent(code.toLowerCase())}/usd`,
      { cache: 'no-store' },
    );

    if (!response.ok) throw new Error(`Reference rate for ${code} is unavailable.`);

    const data = await response.json();

    if (!Number.isFinite(Number(data?.rate)) || Number(data.rate) <= 0) {
      throw new Error(`Reference rate for ${code} is unavailable.`);
    }

    return {
      rate: Number(data.rate),
      date: data?.date ? String(data.date) : null,
      source: 'Frankfurter',
    };
  };

  const getPairRate = async (): Promise<{ result: number; source: RateResult['source'] | 'DeFiLlama'; date: string | null }> => {
    if (fromKind === 'stable' && !selectedFrom) throw new Error('Selected stablecoin price is unavailable.');
    if (toKind === 'stable' && !selectedTo) throw new Error('Selected stablecoin price is unavailable.');

    const fiatResults = await Promise.all([
      fromKind === 'fiat' ? getFiatToUsd(from) : Promise.resolve(null),
      toKind === 'fiat' ? getFiatToUsd(to) : Promise.resolve(null),
    ]);

    const fromFiat = fiatResults[0];
    const toFiat = fiatResults[1];

    const fromUsd = fromKind === 'stable'
      ? Number(selectedFrom!.priceUSD)
      : fromFiat?.rate
        ? 1 / fromFiat.rate
        : 0;

    const toUsd = toKind === 'stable'
      ? Number(selectedTo!.priceUSD)
      : toFiat?.rate
        ? 1 / toFiat.rate
        : 0;

    if (!fromUsd || !toUsd) throw new Error('Selected rate is unavailable.');

    const source: RateResult['source'] | 'DeFiLlama' =
      fromFiat?.source || toFiat?.source || 'DeFiLlama';
    const date = fromFiat?.date || toFiat?.date || null;

    return {
      result: fromUsd / toUsd,
      source,
      date,
    };
  };

  const calculateConversion = async () => {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      setRate(null);
      setConverted(null);
      return;
    }

    setQuoting(true);
    setError(null);

    try {
      const pair = await getPairRate();
      setRate(pair.result);
      setConverted(numericAmount * pair.result);
      setRateSource(pair.source);
      setRateDate(pair.date);
    } catch (err) {
      setRate(null);
      setConverted(null);
      setRateSource(null);
      setRateDate(null);
      setError(err instanceof Error ? err.message : 'Reference rate is temporarily unavailable.');
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    if (!loading && stables.length && fiats.length) void calculateConversion();
  }, [amount, from, to, fromKind, toKind, loading, stables.length, fiats.length, cbnNgnRate]);

  useEffect(() => {
    const refresh = window.setInterval(() => void loadAssets(), 60_000);
    return () => window.clearInterval(refresh);
  }, []);

  const swapCurrencies = () => {
    const previousFrom = from;
    const previousFromKind = fromKind;
    setFrom(to);
    setFromKind(toKind);
    setTo(previousFrom);
    setToKind(previousFromKind);
  };

  const changeKind = (side: 'from' | 'to', kind: Kind) => {
    const stableDefault = stables.some((item) => item.symbol === 'USDC') ? 'USDC' : stables[0]?.symbol || '';
    const fiatDefault = fiats.some((item) => item.code === 'USD') ? 'USD' : 'USD';
    const nextValue = kind === 'stable' ? stableDefault : fiatDefault;

    if (side === 'from') {
      setFromKind(kind);
      setFrom(nextValue);
      setFromSearch('');
    } else {
      setToKind(kind);
      setTo(nextValue);
      setToSearch('');
    }
  };

  const selectPopularPair = (pair: typeof POPULAR_PAIRS[number]) => {
    setFrom(pair.from);
    setFromKind(pair.fromKind);
    setTo(pair.to);
    setToKind(pair.toKind);
    setError(null);
  };

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-5">
        <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono"><span className="text-fuchsia-300">FX router</span><span className="text-zinc-700">•</span><span className="text-blue-300">reference mode</span></div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">FX</h1>
            <p className="mt-2 text-sm leading-6 text-zinc-400">Route an indicative conversion across fiat reference rates and stablecoin market prices.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadAssets()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-blue-500/30 transition-colors"
          >
            <RefreshCw className={loading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
            Refresh
          </button>
        </header>

        <section className="rounded-3xl border border-blue-500/20 bg-[radial-gradient(circle_at_15%_0%,rgba(232,121,249,.10),transparent_35%),radial-gradient(circle_at_85%_0%,rgba(59,130,246,.14),transparent_38%),#0b0e12] p-3 sm:p-5 shadow-[0_18px_70px_rgba(0,0,0,.35)]">
          <div className="flex flex-wrap items-center justify-between gap-3 px-2 pb-4"><div><div className="text-[10px] uppercase tracking-[0.22em] text-blue-300 font-mono">Indicative route</div><div className="mt-1 text-sm font-semibold text-white">Find the current reference path</div></div><div className="text-[10px] font-mono text-zinc-600">display-only · no execution</div></div><div className="flex flex-wrap gap-2 mb-4">
            {POPULAR_PAIRS.map((pair) => (
              <button
                key={`${pair.from}-${pair.to}`}
                type="button"
                onClick={() => selectPopularPair(pair)}
                className="rounded-full border border-zinc-800 bg-zinc-950 px-3 py-1.5 text-[10px] font-mono text-zinc-400 hover:text-white hover:border-blue-500/30 transition-colors"
              >
                {pair.from}/{pair.to}
              </button>
            ))}
          </div>

          <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <AssetPicker
              label="From"
              kind={fromKind}
              value={from}
              amount={amount}
              onAmountChange={(value) => setAmount(value)}
              onKindChange={(kind) => changeKind('from', kind)}
              onValueChange={setFrom}
              stables={stables}
              fiats={fiats}
              search={fromSearch}
              onSearchChange={setFromSearch}
            />

            <button
              type="button"
              onClick={swapCurrencies}
              className="w-10 h-10 mb-1 mx-auto rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-blue-500 transition flex items-center justify-center"
              aria-label="Reverse currencies"
            >
              <ArrowDownUp className="w-4 h-4" />
            </button>

            <AssetPicker
              label="To"
              kind={toKind}
              value={to}
              amount=""
              onAmountChange={() => {}}
              onKindChange={(kind) => changeKind('to', kind)}
              onValueChange={setTo}
              stables={stables}
              fiats={fiats}
              search={toSearch}
              onSearchChange={setToSearch}
            />
          </div>

          <div className="mt-4 grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">Rate</div>
              <div className="mt-2 text-lg sm:text-xl font-semibold text-white">
                {quoting ? <Loader2 className="w-5 h-5 animate-spin" /> : rate === null ? 'Unavailable' : <>1 {from} = {formatRate(rate)} {to}</>}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-zinc-600">
                {rateSource && <span>{rateSource}{rateSource === 'DeFiLlama' ? ' market price' : ' reference rate'}</span>}
                {rateDate && <span>· {rateDate}</span>}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.045] p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-blue-300/70 font-mono">Router output</div>
              <div className="mt-2 text-2xl sm:text-3xl font-bold text-blue-300">
                {quoting ? <Loader2 className="w-5 h-5 animate-spin" /> : converted === null ? '—' : <>{formatNumber(converted)} {to}</>}
              </div>
              <div className="mt-1 text-xs text-zinc-500">{formatNumber(Number(amount) || 0)} {from}</div>
            </div>
          </div>

          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            <Stat label="Stablecoin market" value={stableUpdatedAt ? new Date(stableUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Unavailable'} />
            <Stat label="Fiat reference" value={fiatDate || 'Latest published'} />
            <Stat label="Mode" value="Display only" />
          </div>

          {error && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">{error}</div>}

          <div className="mt-4 rounded-xl border border-blue-500/10 bg-blue-500/[0.03] px-4 py-3 flex items-start gap-2.5 text-[11px] leading-5 text-zinc-500">
            <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
            <span>No wallet connection, swap, approval, fee, or fund movement happens here. Fiat numbers are published reference rates; stablecoin numbers are market prices.</span>
          </div>
        </section>

        <section className="grid lg:grid-cols-[1.05fr_.95fr] gap-4 mb-4">
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-fuchsia-300 font-mono">Route breakdown</div>
                <h2 className="mt-1 text-lg font-semibold text-white">How GEN-0FI builds the quote</h2>
              </div>
              <div className="text-[10px] text-zinc-600 font-mono">LIVE REFERENCE</div>
            </div>
            <div className="mt-5 space-y-2">
              <RouteStep number="01" title={fromKind === 'stable' ? from + ' market price' : from + ' reference rate'} detail={fromKind === 'stable' ? 'DeFiLlama market price' : from === 'NGN' ? 'CBN provider via Frankfurter' : 'Frankfurter reference data'} />
              <div className="ml-5 h-4 border-l border-dashed border-blue-500/25" />
              <RouteStep number="02" title="USD normalization" detail="Normalize both sides to a common USD basis." />
              <div className="ml-5 h-4 border-l border-dashed border-blue-500/25" />
              <RouteStep number="03" title={toKind === 'stable' ? to + ' market price' : to + ' reference rate'} detail={toKind === 'stable' ? 'DeFiLlama market price' : to === 'NGN' ? 'CBN provider via Frankfurter' : 'Frankfurter reference data'} />
              <div className="ml-5 h-4 border-l border-dashed border-blue-500/25" />
              <RouteStep number="04" title="Indicative output" detail={converted === null ? 'Waiting for a valid quote.' : formatNumber(converted) + ' ' + to} accent />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5 sm:p-6">
            <div className="text-[10px] uppercase tracking-[0.22em] text-blue-300 font-mono">Router status</div>
            <h2 className="mt-1 text-lg font-semibold text-white">Execution state</h2>
            <div className="mt-5 grid grid-cols-2 gap-2">
              <RouterStat label="Execution" value="Disabled" />
              <RouterStat label="Wallet" value="Not required" />
              <RouterStat label="Approvals" value="None" />
              <RouterStat label="Fund movement" value="None" />
            </div>
            <div className="mt-4 rounded-xl border border-blue-500/10 bg-blue-500/[0.03] p-3.5 text-[11px] leading-5 text-zinc-500">
              FX is currently a reference router. It prices the route, but it does not submit trades or move assets.
            </div>
          </div>
        </section>

        <div className="grid lg:grid-cols-[1.25fr_.75fr] gap-4">
          <section className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="flex items-center gap-3">
              <Coins className="w-5 h-5 text-blue-400" />
              <div>
                <h2 className="text-sm font-semibold text-white">Stablecoin liquidity universe</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Choose a market asset and feed it into the router.</p>
              </div>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {stables.slice(0, 18).map((item) => (
                <button
                  type="button"
                  key={item.id}
                  onClick={() => {
                    setFromKind('stable');
                    setFrom(item.symbol);
                  }}
                  className="text-left rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3 hover:border-blue-500/30 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-white">{item.symbol}</span>
                    <span className="text-[10px] text-zinc-500">{formatNumber(item.priceUSD, 6)} USD</span>
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-600 truncate">{item.name}</div>
                </button>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-2 text-[10px] text-zinc-600">
              <ExternalLink className="w-3.5 h-3.5" />
              Source: DeFiLlama stablecoin market data
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-[#111317] p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Globe2 className="w-5 h-5 text-blue-400" />
              <div>
                <h2 className="text-sm font-semibold text-white">Reference sources</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">Published fiat data used to build indicative routes.</p>
              </div>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">CBN · USD / NGN</div>
              <div className="mt-2 text-xl font-bold text-white">
                {cbnNgnRate ? `₦${formatNumber(cbnNgnRate, 2)}` : 'Unavailable'}
              </div>
              <div className="mt-1 text-[10px] text-zinc-600">{cbnDate ? `Published ${cbnDate}` : 'Latest official reference'}</div>
            </div>

            <div className="space-y-2 text-[11px] text-zinc-500">
              <div className="flex items-center gap-2"><Clock3 className="w-3.5 h-3.5" />Frankfurter aggregates official sources</div>
              <div className="flex items-center gap-2"><Globe2 className="w-3.5 h-3.5" />206 supported currencies</div>
              <div className="flex items-center gap-2"><Info className="w-3.5 h-3.5" />Rates are for reference, not execution</div>
            </div>

            <a href="https://frankfurter.dev/providers/cbn/" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-[10px] font-semibold text-blue-300 hover:text-blue-200">
              View CBN source
              <ExternalLink className="w-3 h-3" />
            </a>
          </section>
        </div>
      </div>
    </div>
  );
};

function AssetPicker(props: {
  label: string;
  kind: Kind;
  value: string;
  amount: string;
  onAmountChange: (value: string) => void;
  onKindChange: (kind: Kind) => void;
  onValueChange: (value: string) => void;
  stables: Stablecoin[];
  fiats: Fiat[];
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const list = props.kind === 'stable'
    ? props.stables.filter((item) => {
        const query = props.search.toLowerCase().trim();
        return !query || item.symbol.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
      }).slice(0, 100)
    : props.fiats.filter((item) => {
        const query = props.search.toLowerCase().trim();
        return !query || item.code.toLowerCase().includes(query) || item.name.toLowerCase().includes(query);
      }).slice(0, 100);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">{props.label}</span>
        {props.label === 'From' && (
          <input
            value={props.amount}
            onChange={(event) => props.onAmountChange(event.target.value.replace(/[^0-9.]/g, ''))}
            placeholder="0.00"
            inputMode="decimal"
            className="w-36 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-right text-sm font-mono text-white outline-none focus:border-blue-500/50"
            aria-label="Amount to convert"
          />
        )}
      </div>

      <div className="flex gap-2">
        <div className="flex rounded-xl border border-zinc-800 bg-zinc-950 p-1 shrink-0">
          <button type="button" onClick={() => props.onKindChange('stable')} className={props.kind === 'stable' ? 'rounded-lg px-2.5 py-2 text-[10px] font-semibold bg-blue-500/15 text-blue-300' : 'rounded-lg px-2.5 py-2 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200'}>Stable</button>
          <button type="button" onClick={() => props.onKindChange('fiat')} className={props.kind === 'fiat' ? 'rounded-lg px-2.5 py-2 text-[10px] font-semibold bg-blue-500/15 text-blue-300' : 'rounded-lg px-2.5 py-2 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200'}>Fiat</button>
        </div>

        <div className="relative flex-1">
          <button type="button" onClick={() => setOpen((value) => !value)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-left hover:border-blue-500/30 transition-colors">
            <span className="block text-sm font-semibold text-white">{props.value || 'Select'}</span>
            <span className="block mt-0.5 text-[10px] text-zinc-600 truncate">
              {props.kind === 'stable' ? stableLabel(props.value, props.stables) : props.fiats.find((item) => item.code === props.value)?.name || 'Fiat currency'}
            </span>
          </button>

          {open && (
            <div className="absolute z-30 top-[calc(100%+8px)] left-0 right-0 rounded-xl border border-zinc-700 bg-[#111317] shadow-2xl overflow-hidden">
              <div className="p-2 border-b border-zinc-800">
                <div className="flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2">
                  <Search className="w-3.5 h-3.5 text-zinc-500" />
                  <input
                    autoFocus
                    value={props.search}
                    onChange={(event) => props.onSearchChange(event.target.value)}
                    placeholder={props.kind === 'stable' ? 'Search stablecoins' : 'Search fiat currencies'}
                    className="w-full bg-transparent text-xs text-white outline-none"
                  />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                {list.map((item: any) => (
                  <button
                    type="button"
                    key={props.kind === 'stable' ? item.id : item.code}
                    onClick={() => {
                      props.onValueChange(props.kind === 'stable' ? item.symbol : item.code);
                      setOpen(false);
                    }}
                    className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-zinc-900 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white">{props.kind === 'stable' ? item.symbol : item.code}</span>
                      {props.kind === 'stable' && <span className="text-[10px] text-zinc-500">{formatNumber(item.priceUSD, 6)} USD</span>}
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{item.name}</div>
                  </button>
                ))}
                {!list.length && <div className="px-3 py-6 text-center text-xs text-zinc-500">No matching currencies.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RouterStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 px-3.5 py-3">
      <div className="text-[9px] uppercase tracking-widest text-zinc-600">{label}</div>
      <div className="mt-1 text-[11px] font-semibold text-white truncate">{value}</div>
    </div>
  );
}

function RouteStep({ number, title, detail, accent = false }: { number: string; title: string; detail: string; accent?: boolean }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-zinc-800 bg-zinc-950/45 p-3.5">
      <div className={'h-8 w-8 shrink-0 rounded-lg border flex items-center justify-center text-[9px] font-mono ' + (accent ? 'border-fuchsia-500/25 bg-fuchsia-500/10 text-fuchsia-300' : 'border-blue-500/25 bg-blue-500/10 text-blue-300')}>
        {number}
      </div>
      <div className="min-w-0">
        <div className="text-xs font-semibold text-white">{title}</div>
        <div className="mt-1 text-[10px] leading-4 text-zinc-600">{detail}</div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5">
      <div className="text-[10px] uppercase tracking-widest text-zinc-600">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}
