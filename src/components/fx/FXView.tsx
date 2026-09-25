import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Loader2, RefreshCw, Search } from 'lucide-react';

type Kind = 'crypto' | 'fiat';

type Asset = {
  id?: string;
  symbol?: string;
  code?: string;
  name: string;
  kind: Kind;
  stable?: boolean;
  rank?: number;
};

const FX_DATA_URL = '/api/fx/rates';
const FX_CONVERT_URL = '/api/fx/convert';

const formatNumber = (value: number, maxFraction = 8) => {
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
  return formatNumber(value, 10);
};

const assetCode = (asset: Asset) => asset.kind === 'fiat' ? asset.code || '' : asset.symbol || '';

export const FXView: React.FC = () => {
  const [assets, setAssets] = useState<Asset[]>([]);
  const [fromKind, setFromKind] = useState<Kind>('crypto');
  const [toKind, setToKind] = useState<Kind>('fiat');
  const [from, setFrom] = useState('USDC');
  const [to, setTo] = useState('USD');
  const [amount, setAmount] = useState('1');
  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const [rate, setRate] = useState<number | null>(null);
  const [converted, setConverted] = useState<number | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState('CoinMarketCap');

  const assetMap = useMemo(
    () => new Map(assets.map((asset) => [assetCode(asset), asset])),
    [assets],
  );

  const loadAssets = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(FX_DATA_URL, { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'FX market data is temporarily unavailable.');
      }

      const nextAssets = Array.isArray(payload.assets) ? payload.assets : [];
      if (!nextAssets.length) throw new Error('No live FX assets were returned.');

      setAssets(nextAssets);

      const hasFrom = nextAssets.some((asset: Asset) => assetCode(asset) === from && asset.kind === fromKind);
      const hasTo = nextAssets.some((asset: Asset) => assetCode(asset) === to && asset.kind === toKind);

      if (!hasFrom) {
        const usdc = nextAssets.find((asset: Asset) => assetCode(asset) === 'USDC' && asset.kind === 'crypto');
        setFrom(usdc ? 'USDC' : assetCode(nextAssets.find((asset: Asset) => asset.kind === 'crypto') || nextAssets[0]));
        setFromKind(usdc ? 'crypto' : (nextAssets.find((asset: Asset) => asset.kind === 'crypto') ? 'crypto' : 'fiat'));
      }

      if (!hasTo) {
        const usd = nextAssets.find((asset: Asset) => assetCode(asset) === 'USD' && asset.kind === 'fiat');
        setTo(usd ? 'USD' : assetCode(nextAssets.find((asset: Asset) => asset.kind === 'fiat') || nextAssets[0]));
        setToKind(usd ? 'fiat' : (nextAssets.find((asset: Asset) => asset.kind === 'fiat') ? 'fiat' : 'crypto'));
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

  const calculateConversion = async () => {
    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount < 0) {
      setRate(null);
      setConverted(null);
      return;
    }

    if (!assetMap.has(from) || !assetMap.has(to)) return;

    setQuoting(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        from,
        to,
        amount: String(numericAmount),
      });
      const response = await fetch(FX_CONVERT_URL + '?' + params.toString(), { cache: 'no-store' });
      const payload = await response.json();

      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'Live conversion is temporarily unavailable.');
      }

      setRate(Number.isFinite(Number(payload.rate)) ? Number(payload.rate) : null);
      setConverted(Number(payload.converted));
      setLastUpdated(payload.lastUpdated || payload.asOf || null);
      setSource(payload.source || 'CoinMarketCap');
    } catch (err) {
      setRate(null);
      setConverted(null);
      setLastUpdated(null);
      setError(err instanceof Error ? err.message : 'Live conversion is temporarily unavailable.');
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    if (!loading && assets.length) void calculateConversion();
  }, [amount, from, to, fromKind, toKind, loading, assets.length]);

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
            <p className="mt-1.5 text-sm text-zinc-500">Live market conversion across crypto, stablecoins and fiat.</p>
          </div>
          <button
            type="button"
            onClick={() => void loadAssets()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-blue-500/30 transition-colors"
            aria-label="Refresh FX assets"
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
              kind={fromKind}
              amount={amount}
              onAmountChange={(value) => setAmount(value)}
              onValueChange={(value, kind) => { setFrom(value); setFromKind(kind); }}
              assets={assets}
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
              kind={toKind}
              amount=""
              onAmountChange={() => {}}
              onValueChange={(value, kind) => { setTo(value); setToKind(kind); }}
              assets={assets}
              search={toSearch}
              onSearchChange={setToSearch}
            />
          </div>

          <div className="mt-5 rounded-2xl border border-blue-500/15 bg-blue-500/[0.045] p-5">
            <div className="text-[10px] uppercase tracking-[0.18em] text-blue-300/70 font-mono">Live conversion route</div>
            <div className="mt-2 text-xl sm:text-2xl font-semibold text-white">
              {quoting ? <Loader2 className="w-5 h-5 animate-spin" /> : rate === null ? 'Unavailable' : <>1 {from} = {formatRate(rate)} {to}</>}
            </div>
            <div className="mt-2 text-[10px] text-zinc-600">
              {source} market conversion
              {lastUpdated && <> · {new Date(lastUpdated).toLocaleString()}</>}
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
            <span>Display only · live reference conversion · no wallet transaction</span>
            <span>{assets.length ? assets.filter((asset) => asset.kind === 'crypto').length + ' crypto assets' : 'Loading assets…'}</span>
          </div>
        </section>

        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[10px] text-zinc-600">
          <span>Source: CoinMarketCap</span>
          <span>Stablecoins are included in Crypto</span>
          <span>Fiat currencies use the same selector</span>
        </div>
      </div>
    </div>
  );
};

function AssetPicker(props: {
  label: string;
  value: string;
  kind: Kind;
  amount: string;
  onAmountChange: (value: string) => void;
  onValueChange: (value: string, kind: Kind) => void;
  assets: Asset[];
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);

  const cryptoAssets = useMemo(
    () => props.assets.filter((asset) => asset.kind === 'crypto'),
    [props.assets],
  );

  const stableAssets = useMemo(
    () => cryptoAssets.filter((asset) => asset.stable),
    [cryptoAssets],
  );

  const regularCryptoAssets = useMemo(
    () => cryptoAssets.filter((asset) => !asset.stable),
    [cryptoAssets],
  );

  const fiatAssets = useMemo(
    () => props.assets.filter((asset) => asset.kind === 'fiat'),
    [props.assets],
  );

  const query = props.search.toLowerCase().trim();
  const matches = (asset: Asset) => {
    const code = assetCode(asset).toLowerCase();
    return !query || code.includes(query) || asset.name.toLowerCase().includes(query);
  };

  const filteredStable = stableAssets.filter(matches).slice(0, 80);
  const filteredCrypto = regularCryptoAssets.filter(matches).slice(0, 150);
  const filteredFiat = fiatAssets.filter(matches).slice(0, 100);
  const selected = props.assets.find(
    (asset) => assetCode(asset) === props.value && asset.kind === props.kind,
  );

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
            <span className="text-sm font-semibold text-white">{selected ? assetCode(selected) : 'Select asset'}</span>
            <span className={selected?.stable ? 'text-[9px] uppercase tracking-wider text-blue-300' : selected?.kind === 'crypto' ? 'text-[9px] uppercase tracking-wider text-violet-300' : 'text-[9px] uppercase tracking-wider text-zinc-500'}>
              {selected?.stable ? 'Stablecoin' : selected?.kind === 'crypto' ? 'Crypto' : selected?.kind === 'fiat' ? 'Fiat' : 'Choose'}
            </span>
          </div>
          <span className="block mt-0.5 text-[10px] text-zinc-600 truncate">
            {selected?.name || 'Choose crypto, stablecoin or fiat'}
          </span>
        </button>

        {open && (
          <div className="absolute z-[100] top-[calc(100%+8px)] left-0 right-0 min-w-[300px] rounded-xl border border-zinc-700 bg-[#111317] shadow-[0_24px_70px_rgba(0,0,0,.55)] overflow-hidden">
            <div className="p-2 border-b border-zinc-800 bg-[#111317]">
              <div className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5">
                <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <input
                  autoFocus
                  value={props.search}
                  onChange={(event) => props.onSearchChange(event.target.value)}
                  placeholder="Search crypto, stablecoin or fiat"
                  className="w-full bg-transparent text-xs text-white outline-none placeholder:text-zinc-600"
                />
              </div>
            </div>

            <div className="max-h-96 overflow-y-auto p-1.5">
              {filteredStable.length > 0 && (
                <div className="px-2 pt-1.5 pb-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-blue-300/80">
                  Stablecoins
                </div>
              )}

              {filteredStable.map((asset) => (
                <AssetOption
                  key={'stable-' + assetCode(asset)}
                  asset={asset}
                  badge="Stablecoin"
                  onSelect={() => {
                    props.onValueChange(assetCode(asset), 'crypto');
                    props.onSearchChange('');
                    setOpen(false);
                  }}
                />
              ))}

              {filteredCrypto.length > 0 && (
                <div className="px-2 pt-3 pb-1 border-t border-zinc-800 mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-violet-300/80">
                  Crypto
                </div>
              )}

              {filteredCrypto.map((asset) => (
                <AssetOption
                  key={'crypto-' + assetCode(asset)}
                  asset={asset}
                  badge="Crypto"
                  onSelect={() => {
                    props.onValueChange(assetCode(asset), 'crypto');
                    props.onSearchChange('');
                    setOpen(false);
                  }}
                />
              ))}

              {filteredFiat.length > 0 && (
                <div className="px-2 pt-3 pb-1 border-t border-zinc-800 mt-1 text-[9px] font-semibold uppercase tracking-[0.16em] text-zinc-500">
                  Fiat currencies
                </div>
              )}

              {filteredFiat.map((asset) => (
                <AssetOption
                  key={'fiat-' + assetCode(asset)}
                  asset={asset}
                  badge="Fiat"
                  onSelect={() => {
                    props.onValueChange(assetCode(asset), 'fiat');
                    props.onSearchChange('');
                    setOpen(false);
                  }}
                />
              ))}

              {!filteredStable.length && !filteredCrypto.length && !filteredFiat.length && (
                <div className="px-3 py-8 text-center text-xs text-zinc-500">
                  {props.assets.length ? 'No matching assets.' : 'Loading live assets…'}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AssetOption({
  asset,
  badge,
  onSelect,
}: {
  asset: Asset;
  badge: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-blue-500/10 transition-colors"
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-white">{assetCode(asset)}</span>
        <span className="text-[9px] uppercase tracking-wider text-zinc-500">{badge}</span>
      </div>
      <div className="text-[10px] text-zinc-500 mt-0.5 truncate">{asset.name}</div>
    </button>
  );
}
