import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownUp,
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

const FX_DATA_URL = '/api/fx/rates';



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
      const response = await fetch(FX_DATA_URL, { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'FX reference data is temporarily unavailable.');
      }

      const nextStables = Array.isArray(payload.stables) ? payload.stables : [];
      const nextFiats = Array.isArray(payload.currencies) ? payload.currencies : [];

      if (!nextStables.length) throw new Error('No stablecoin market prices were returned.');
      if (!nextFiats.length) throw new Error('No fiat currencies were returned.');

      setStables(nextStables);
      setFiats(nextFiats);
      setStableUpdatedAt(payload.stableUpdatedAt ? new Date(payload.stableUpdatedAt).getTime() : Date.now());
      setCbnNgnRate(Number.isFinite(Number(payload.cbnNgnRate)) ? Number(payload.cbnNgnRate) : null);
      setCbnDate(payload.cbnDate ? String(payload.cbnDate) : null);
      setFiatDate(payload.fiatDate ? String(payload.fiatDate) : null);

      if (!nextStables.some((item: Stablecoin) => item.symbol === from) && fromKind === 'stable') {
        setFrom(nextStables.some((item: Stablecoin) => item.symbol === 'USDC') ? 'USDC' : nextStables[0].symbol);
      }

      if (!nextStables.some((item: Stablecoin) => item.symbol === to) && toKind === 'stable') {
        setTo(nextStables.some((item: Stablecoin) => item.symbol === 'EURC') ? 'EURC' : nextStables[0].symbol);
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
    const normalized = code.toUpperCase();

    if (normalized === 'USD') {
      return { rate: 1, date: fiatDate, source: 'Frankfurter' };
    }

    const response = await fetch(FX_DATA_URL, { cache: 'no-store' });
    const payload = await response.json();

    if (!response.ok || !payload?.ok) {
      throw new Error(payload?.error || `Reference rate for ${normalized} is unavailable.`);
    }

    const usdPerCurrency = Number(payload?.fiatRatesUsd?.[normalized]);
    if (!Number.isFinite(usdPerCurrency) || usdPerCurrency <= 0) {
      throw new Error(`Reference rate for ${normalized} is unavailable.`);
    }

    const cbn = normalized === 'NGN' && Number.isFinite(Number(payload?.cbnNgnRate))
      ? Number(payload.cbnNgnRate)
      : null;

    return {
      rate: 1 / (cbn || usdPerCurrency),
      date: normalized === 'NGN' && payload?.cbnDate ? String(payload.cbnDate) : (payload?.fiatDate ? String(payload.fiatDate) : null),
      source: cbn ? 'CBN' : 'Frankfurter',
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



  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-3xl mx-auto">
        <header className="flex items-center justify-between gap-4 mb-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-blue-300 font-mono">GEN-0FI · FX</div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">Convert</h1>
            <p className="mt-1.5 text-sm text-zinc-500">Live reference rates for fiat currencies and stablecoins.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadAssets()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-blue-500/30 transition-colors"
            aria-label="Refresh rates"
          >
            <RefreshCw className={loading ? 'w-3.5 h-3.5 animate-spin' : 'w-3.5 h-3.5'} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </header>

        <section className="rounded-3xl border border-zinc-800 bg-[#0b0e12] p-4 sm:p-6 shadow-[0_18px_70px_rgba(0,0,0,.28)]">
          <div className="grid sm:grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <AssetPicker
              label="From"
              value={from}
              amount={amount}
              onAmountChange={(value) => setAmount(value)}
              onValueChange={(value, kind) => {
                setFrom(value);
                setFromKind(kind);
              }}
              stables={stables}
              fiats={fiats}
              search={fromSearch}
              onSearchChange={setFromSearch}
            />

            <button
              type="button"
              onClick={swapCurrencies}
              className="w-10 h-10 mx-auto mb-1 rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-blue-500 transition flex items-center justify-center"
              aria-label="Reverse currencies"
            >
              <ArrowDownUp className="w-4 h-4" />
            </button>

            <AssetPicker
              label="To"
              value={to}
              amount=""
              onAmountChange={() => {}}
              onValueChange={(value, kind) => {
                setTo(value);
                setToKind(kind);
              }}
              stables={stables}
              fiats={fiats}
              search={toSearch}
              onSearchChange={setToSearch}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-blue-500/15 bg-blue-500/[0.045] p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-blue-300/70 font-mono">Reference rate</div>
            <div className="mt-2 text-xl sm:text-2xl font-semibold text-white">
              {quoting ? <Loader2 className="w-5 h-5 animate-spin" /> : rate === null ? 'Unavailable' : <>1 {from} = {formatRate(rate)} {to}</>}
            </div>
            <div className="mt-2 text-[10px] text-zinc-600">
              {rateSource && (rateSource === 'DeFiLlama' ? 'DeFiLlama market price' : rateSource + ' reference rate')}
              {rateDate && <> · {rateDate}</>}
            </div>
          </div>

          <div className="mt-3 flex items-end justify-between gap-4 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-5">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">Converted</div>
              <div className="mt-1 text-2xl sm:text-3xl font-bold text-blue-300">
                {quoting ? <Loader2 className="w-5 h-5 animate-spin" /> : converted === null ? '—' : <>{formatNumber(converted)} {to}</>}
              </div>
            </div>
            <div className="text-right text-xs text-zinc-600">{formatNumber(Number(amount) || 0)} {from}</div>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[10px] text-zinc-600">
            <span>Display only · no wallet connection · no swap · no fund movement</span>
            <span>{stableUpdatedAt ? 'Stablecoins updated ' + new Date(stableUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Stablecoin data unavailable'}</span>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-zinc-600">
          <span>Fiat: Frankfurter</span>
          <span>NGN: {cbnNgnRate ? 'CBN via Frankfurter' : 'Frankfurter'}</span>
          <span>Stablecoins: DeFiLlama</span>
          {fiatDate && <span>Fiat updated {fiatDate}</span>}
        </div>
      </div>
    </div>
  );
};

function AssetPicker(props: {
  label: string;
  value: string;
  amount: string;
  onAmountChange: (value: string) => void;
  onValueChange: (value: string, kind: Kind) => void;
  stables: Stablecoin[];
  fiats: Fiat[];
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const assets = useMemo(() => [
    ...props.stables.map((item) => ({
      key: 'stable:' + item.symbol,
      value: item.symbol,
      name: item.name,
      kind: 'stable' as Kind,
      meta: formatNumber(item.priceUSD, 6) + ' USD',
    })),
    ...props.fiats.map((item) => ({
      key: 'fiat:' + item.code,
      value: item.code,
      name: item.name,
      kind: 'fiat' as Kind,
      meta: 'Fiat',
    })),
  ], [props.stables, props.fiats]);

  const query = props.search.toLowerCase().trim();

  const matches = (item: typeof assets[number]) =>
    !query ||
    item.value.toLowerCase().includes(query) ||
    item.name.toLowerCase().includes(query);

  const stableList = assets
    .filter((item) => item.kind === 'stable' && matches(item))
    .slice(0, 100);

  const fiatList = assets
    .filter((item) => item.kind === 'fiat' && matches(item))
    .slice(0, 100);

  const selected = assets.find((item) => item.value === props.value);

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

      <div className="relative z-20">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-left hover:border-blue-500/30 transition-colors"
          aria-haspopup="listbox"
          aria-expanded={open}
        >
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-white">
              {selected?.value || (loading ? 'Loading assets…' : 'Select asset')}
            </span>
            <span className={selected?.kind === 'stable' ? 'text-[9px] uppercase tracking-wider text-blue-300' : 'text-[9px] uppercase tracking-wider text-zinc-500'}>
              {selected?.kind === 'stable' ? 'Stablecoin' : selected?.kind === 'fiat' ? 'Fiat' : 'Choose'}
            </span>
          </div>
          <span className="block mt-0.5 text-[10px] text-zinc-600 truncate">
            {selected?.name || 'Choose a stablecoin or fiat currency'}
          </span>
        </button>

        {open && (
          <div className="absolute z-[100] top-[calc(100%+8px)] left-0 right-0 min-w-[280px] rounded-xl border border-zinc-700 bg-[#111317] shadow-[0_24px_70px_rgba(0,0,0,.55)] overflow-hidden">
            <div className="p-2 border-b border-zinc-800 bg-[#111317]">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <input
                  autoFocus
                  value={props.search}
                  onChange={(event) => props.onSearchChange(event.target.value)}
                  placeholder="Search stablecoins or fiat"
                  className="w-full bg-transparent text-xs text-white outline-none placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div className="max-h-80 overflow-y-auto p-1.5">
              {stableList.length > 0 && (
                <div className="px-2 pt-1.5 pb-1">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.16em] text-blue-300/80">
                    Stablecoins
                  </div>
                </div>
              )}

              {stableList.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => {
                    props.onValueChange(item.value, 'stable');
                    props.onSearchChange('');
                    setOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-blue-500/10 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-white">{item.value}</span>
                    <span className="text-[9px] uppercase tracking-wider text-blue-300/70">Stablecoin</span>
                  </div>
                  <div className="text-[10px] text-zinc-500 mt-0.5 truncate">{item.name} · {item.meta}</div>
                </button>
              ))}

              {fiatList.length > 0 && (
                <div className="px-2 pt-3 pb-1">
                  <div className="border-t border-zinc-800 pt-3 text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                    Fiat currencies
                  </div>
                </div>
              )}

              {fiatList.map((item) => (
                <button
                  type="button"
                  key={item.key}
                  onClick={() => {
                    props.onValueChange(item.value, 'fiat');
                    props.onSearchChange('');
                    setOpen(false);
                  }}
                  className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-zinc-900 transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-semibold text-white">{item.value}</span>
                    <span className="text-[9px] uppercase tracking-wider text-zinc-600">Fiat</span>
                  </div>
                  <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{item.name}</div>
                </button>
              ))}

              {!stableList.length && !fiatList.length && (
                <div className="px-3 py-8 text-center text-xs text-zinc-500">
                  {props.stables.length || props.fiats.length
                    ? 'No matching stablecoins or fiat currencies.'
                    : 'Loading stablecoins and fiat currencies…'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
