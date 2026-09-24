import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Clock3, Coins, Globe2, Info, Loader2, RefreshCw, Search } from 'lucide-react';

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

const STABLES_URL = 'https://api.llama.fi/stablecoins?includePrices=true';
const FIATS_URL = 'https://api.frankfurter.dev/v2/currencies';
const RATES_URL = 'https://api.frankfurter.dev/v2/rates';

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
  const [toKind, setToKind] = useState<Kind>('stable');
  const [from, setFrom] = useState('USDC');
  const [to, setTo] = useState('EURC');
  const [amount, setAmount] = useState('1');

  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');

  const [rate, setRate] = useState<number | null>(null);
  const [converted, setConverted] = useState<number | null>(null);

  const [stableUpdatedAt, setStableUpdatedAt] = useState<number | null>(null);
  const [fiatDate, setFiatDate] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableMap = useMemo(
    () => new Map(stables.map((item) => [item.symbol, item])),
    [stables],
  );

  const selectedFrom = fromKind === 'stable' ? stableMap.get(from) : null;
  const selectedTo = toKind === 'stable' ? stableMap.get(to) : null;

  const loadAssets = async () => {
    setLoading(true);
    setError(null);

    try {
      const [stableResponse, fiatResponse] = await Promise.all([
        fetch(STABLES_URL, { cache: 'no-store' }),
        fetch(FIATS_URL, { cache: 'no-store' }),
      ]);

      if (!stableResponse.ok || !fiatResponse.ok) {
        throw new Error('FX market data is temporarily unavailable.');
      }

      const [stableJson, fiatJson] = await Promise.all([
        stableResponse.json(),
        fiatResponse.json(),
      ]);

      const nextStables = (Array.isArray(stableJson?.peggedAssets) ? stableJson.peggedAssets : [])
        .map((item: any) => ({
          id: String(item.id),
          name: String(item.name || item.symbol || 'Stablecoin'),
          symbol: String(item.symbol || '').toUpperCase(),
          priceUSD: Number(item.price),
        }))
        .filter((item: Stablecoin) => (
          item.symbol &&
          Number.isFinite(item.priceUSD) &&
          item.priceUSD > 0
        ))
        .sort((a: Stablecoin, b: Stablecoin) => a.symbol.localeCompare(b.symbol));

      const nextFiats = Object.entries(fiatJson || {})
        .map(([code, name]) => ({
          code: code.toUpperCase(),
          name: String(name),
        }))
        .sort((a, b) => a.code.localeCompare(b.code));

      if (!nextStables.length) {
        throw new Error('No live stablecoin prices were returned.');
      }

      setStables(nextStables);
      setFiats(nextFiats);
      setStableUpdatedAt(Date.now());

      if (!nextStables.some((item: Stablecoin) => item.symbol === from)) {
        setFrom(nextStables.some((item: Stablecoin) => item.symbol === 'USDC')
          ? 'USDC'
          : nextStables[0].symbol);
      }

      if (!nextStables.some((item: Stablecoin) => item.symbol === to)) {
        setTo(nextStables.some((item: Stablecoin) => item.symbol === 'EURC')
          ? 'EURC'
          : nextStables[0].symbol);
      }

      if (!nextFiats.some((item: Fiat) => item.code === 'USD')) {
        setFiats([{ code: 'USD', name: 'United States Dollar' }, ...nextFiats]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load FX market data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAssets();
  }, []);

  const getUsdRates = async (codes: string[]) => {
    const unique = [...new Set(codes.filter(Boolean))];

    if (!unique.length) {
      return { rates: {} as Record<string, number>, date: null as string | null };
    }

    const response = await fetch(
      RATES_URL + '?base=USD&quotes=' + encodeURIComponent(unique.join(',')),
      { cache: 'no-store' },
    );

    if (!response.ok) {
      throw new Error('Fiat reference rate is temporarily unavailable.');
    }

    const data = await response.json();
    const rates: Record<string, number> = {};

    for (const row of Array.isArray(data) ? data : []) {
      if (row?.quote && Number.isFinite(Number(row.rate))) {
        rates[String(row.quote).toUpperCase()] = Number(row.rate);
      }
    }

    return {
      rates,
      date: data?.date ? String(data.date) : null,
    };
  };

  const calculateConversion = async () => {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      setRate(null);
      setConverted(null);
      return;
    }

    if (fromKind === 'stable' && !selectedFrom) {
      setRate(null);
      setConverted(null);
      return;
    }

    if (toKind === 'stable' && !selectedTo) {
      setRate(null);
      setConverted(null);
      return;
    }

    setQuoting(true);
    setError(null);

    try {
      const fiatCodes: string[] = [];

      if (fromKind === 'fiat' && from !== 'USD') fiatCodes.push(from);
      if (toKind === 'fiat' && to !== 'USD') fiatCodes.push(to);

      const fiatData = await getUsdRates(fiatCodes);
      setFiatDate(fiatData.date);

      const getUsdValue = (kind: Kind, value: string, stable: Stablecoin | null) => {
        if (kind === 'stable') {
          if (!stable || !Number.isFinite(stable.priceUSD) || stable.priceUSD <= 0) {
            throw new Error('Selected stablecoin rate is unavailable.');
          }
          return stable.priceUSD;
        }

        if (value === 'USD') return 1;

        const usdRate = fiatData.rates[value];
        if (!Number.isFinite(usdRate) || usdRate <= 0) {
          throw new Error('Selected fiat rate is unavailable.');
        }

        return 1 / usdRate;
      };

      const fromUSD = getUsdValue(fromKind, from, selectedFrom);
      const toUSD = getUsdValue(toKind, to, selectedTo);
      const nextRate = fromUSD / toUSD;

      setRate(nextRate);
      setConverted(numericAmount * nextRate);
    } catch (err) {
      setRate(null);
      setConverted(null);
      setError(err instanceof Error ? err.message : 'Conversion rate is temporarily unavailable.');
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    if (!loading) {
      void calculateConversion();
    }
  }, [amount, from, to, fromKind, toKind, loading, stables.length, fiats.length]);

  useEffect(() => {
    const refresh = window.setInterval(() => {
      void loadAssets();
    }, 60_000);

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
    const defaultStable = stables.some((item) => item.symbol === 'USDC')
      ? 'USDC'
      : stables[0]?.symbol || '';

    const defaultFiat = fiats.some((item) => item.code === 'USD')
      ? 'USD'
      : fiats[0]?.code || 'USD';

    const nextValue = kind === 'stable' ? defaultStable : defaultFiat;

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

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <header className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">
              Live rate calculator
            </p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">
              FX
            </h1>
            <p className="mt-2 text-sm text-zinc-400">
              Check current stablecoin and fiat conversion rates.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void loadAssets()}
            disabled={loading}
            className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:border-blue-500/30 transition-colors"
            aria-label="Refresh FX rates"
          >
            <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          </button>
        </header>

        <section className="rounded-2xl border border-blue-500/20 bg-[#0d0f12] p-5 sm:p-7">
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

          <div className="mt-5 grid sm:grid-cols-2 gap-3">
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">
                Current rate
              </div>
              <div className="mt-2 text-lg sm:text-xl font-semibold text-white">
                {quoting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : rate === null ? (
                  'Unavailable'
                ) : (
                  <>1 {from} = {formatRate(rate)} {to}</>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.045] p-5">
              <div className="text-[10px] uppercase tracking-widest text-blue-300/70">
                Conversion
              </div>
              <div className="mt-2 text-2xl sm:text-3xl font-bold text-blue-300">
                {quoting ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : converted === null ? (
                  '—'
                ) : (
                  <>{formatNumber(converted)} {to}</>
                )}
              </div>
              <div className="mt-1 text-xs text-zinc-500">
                {formatNumber(Number(amount) || 0)} {from}
              </div>
            </div>
          </div>

          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            <Stat
              label="Stablecoin data"
              value={loading
                ? 'Loading…'
                : stableUpdatedAt
                  ? new Date(stableUpdatedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })
                  : 'Unavailable'}
            />
            <Stat
              label="Fiat data"
              value={fiatDate || 'Latest reference'}
            />
            <Stat
              label="Mode"
              value="Rate display only"
            />
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">
              {error}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-blue-500/10 bg-blue-500/[0.03] px-4 py-3 flex items-start gap-2.5 text-[11px] text-zinc-500">
            <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
            <span>
              FX is informational for now. It does not connect to a wallet, execute swaps,
              request approvals, move funds, or charge an FX fee.
            </span>
          </div>
        </section>

        <div className="grid lg:grid-cols-[1.35fr_.65fr] gap-4">
          <section className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="flex items-center gap-3">
              <Coins className="w-5 h-5 text-blue-400" />
              <div>
                <h2 className="text-sm font-semibold text-white">Stablecoin rates</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Current market prices used to calculate stablecoin conversions.
                </p>
              </div>
            </div>

            <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {stables.slice(0, 24).map((item) => (
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
                    <span className="text-[10px] text-zinc-500">
                      {formatNumber(item.priceUSD, 6)} USD
                    </span>
                  </div>
                  <div className="mt-1 text-[10px] text-zinc-600 truncate">
                    {item.name}
                  </div>
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="flex items-center gap-3">
              <Globe2 className="w-5 h-5 text-blue-400" />
              <div>
                <h2 className="text-sm font-semibold text-white">Fiat reference</h2>
                <p className="text-[11px] text-zinc-500 mt-0.5">
                  Published reference rates for supported fiat currencies.
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3">
              <div className="text-2xl font-bold text-white">
                {fiats.length || '—'}
              </div>
              <div className="text-[11px] text-zinc-500 mt-1">
                supported fiat currencies
              </div>
            </div>

            <div className="mt-4 space-y-2 text-[11px] text-zinc-500">
              <div className="flex items-center gap-2">
                <Clock3 className="w-3.5 h-3.5" />
                Latest published reference data
              </div>
              <div className="flex items-center gap-2">
                <Globe2 className="w-3.5 h-3.5" />
                Searchable by currency code or name
              </div>
              <div className="flex items-center gap-2">
                <Info className="w-3.5 h-3.5" />
                No wallet transaction is created
              </div>
            </div>
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
        return !query ||
          item.symbol.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query);
      }).slice(0, 100)
    : props.fiats.filter((item) => {
        const query = props.search.toLowerCase().trim();
        return !query ||
          item.code.toLowerCase().includes(query) ||
          item.name.toLowerCase().includes(query);
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
          <button
            type="button"
            onClick={() => props.onKindChange('stable')}
            className={props.kind === 'stable'
              ? 'rounded-lg px-2.5 py-2 text-[10px] font-semibold bg-blue-500/15 text-blue-300'
              : 'rounded-lg px-2.5 py-2 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200'}
          >
            Stable
          </button>
          <button
            type="button"
            onClick={() => props.onKindChange('fiat')}
            className={props.kind === 'fiat'
              ? 'rounded-lg px-2.5 py-2 text-[10px] font-semibold bg-blue-500/15 text-blue-300'
              : 'rounded-lg px-2.5 py-2 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200'}
          >
            Fiat
          </button>
        </div>

        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-left hover:border-blue-500/30 transition-colors"
          >
            <span className="block text-sm font-semibold text-white">
              {props.value || 'Select'}
            </span>
            <span className="block mt-0.5 text-[10px] text-zinc-600 truncate">
              {props.kind === 'stable'
                ? props.stables.find((item) => item.symbol === props.value)?.name || 'Stablecoin'
                : props.fiats.find((item) => item.code === props.value)?.name || 'Fiat currency'}
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
                      <span className="text-xs font-semibold text-white">
                        {props.kind === 'stable' ? item.symbol : item.code}
                      </span>
                      {props.kind === 'stable' && (
                        <span className="text-[10px] text-zinc-500">
                          {formatNumber(item.priceUSD, 6)} USD
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5 truncate">
                      {item.name}
                    </div>
                  </button>
                ))}

                {!list.length && (
                  <div className="px-3 py-6 text-center text-xs text-zinc-500">
                    No matching currencies.
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
