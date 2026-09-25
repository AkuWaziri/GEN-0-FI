const CMC_BASE = 'https://pro-api.coinmarketcap.com';
const CMC_KEYLESS_BASE = CMC_BASE + '/public-api';
const FRANKFURTER_API = 'https://api.frankfurter.dev/v2';

const STABLE_SYMBOLS = new Set([
  'USDT', 'USDC', 'DAI', 'FDUSD', 'USDE', 'USDS', 'PYUSD', 'USDP', 'TUSD',
  'GUSD', 'FRAX', 'LUSD', 'CRVUSD', 'USD0', 'USDG', 'EURC', 'EURT', 'EURS',
  'EURI', 'USDD', 'USTC', 'RLUSD', 'USYC', 'USDY', 'BUIDL', 'USD1',
]);

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();

const cmcRequest = async (path: string, params: Record<string, string>) => {
  const apiKey = String(process.env.CMC_API_KEY || '').trim();
  const base = apiKey ? CMC_BASE : CMC_KEYLESS_BASE;
  const url = new URL(base + path);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (apiKey) headers['X-CMC_PRO_API_KEY'] = apiKey;

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(9000),
  });

  const payload = await response.json().catch(() => null);
  const statusCode = String(payload?.status?.error_code ?? '0');
  if (!response.ok || statusCode !== '0') {
    throw new Error(payload?.status?.error_message || 'CoinMarketCap market data is temporarily unavailable.');
  }

  return payload;
};

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const [cryptoPayload, currencyResponse] = await Promise.all([
      cmcRequest('/v3/cryptocurrency/listings/latest', {
        start: '1',
        limit: '250',
        convert: 'USD',
      }),
      fetch(FRANKFURTER_API + '/currencies', { signal: AbortSignal.timeout(7000) }),
    ]);

    if (!currencyResponse.ok) throw new Error('Fiat currency catalogue is unavailable.');
    const currencyJson = await currencyResponse.json();

    const cryptoAssets = (Array.isArray(cryptoPayload?.data) ? cryptoPayload.data : [])
      .map((item: any) => ({
        id: String(item?.id || ''),
        symbol: normalizeCode(item?.symbol),
        name: String(item?.name || item?.symbol || 'Crypto asset'),
        kind: 'crypto',
        stable: STABLE_SYMBOLS.has(normalizeCode(item?.symbol)),
        rank: Number(item?.cmc_rank || 999999),
      }))
      .filter((item: any) => item.id && item.symbol && item.name)
      .sort((a: any, b: any) => {
        if (a.stable !== b.stable) return a.stable ? -1 : 1;
        return a.rank - b.rank;
      });

    const currencies = Object.entries(currencyJson || {})
      .map(([code, name]) => ({
        code: normalizeCode(code),
        name: String(name),
        kind: 'fiat',
        stable: false,
      }))
      .filter((item) => item.code)
      .sort((a, b) => a.code.localeCompare(b.code));

    if (!currencies.some((item) => item.code === 'USD')) {
      currencies.unshift({ code: 'USD', name: 'United States Dollar', kind: 'fiat', stable: false });
    }
    if (!currencies.some((item) => item.code === 'NGN')) {
      currencies.push({ code: 'NGN', name: 'Nigerian Naira', kind: 'fiat', stable: false });
    }

    if (!cryptoAssets.length) throw new Error('No cryptocurrency market assets were returned.');
    if (!currencies.length) throw new Error('No fiat currencies were returned.');

    return res.status(200).json({
      ok: true,
      asOf: new Date().toISOString(),
      assets: [...cryptoAssets, ...currencies],
      currencies,
      cryptoCount: cryptoAssets.length,
      stableCount: cryptoAssets.filter((item: any) => item.stable).length,
      source: 'CoinMarketCap',
      keyless: !String(process.env.CMC_API_KEY || '').trim(),
    });
  } catch (error: any) {
    console.error('[GEN-0 FX]', error);
    return res.status(503).json({
      ok: false,
      error: error?.message || 'FX market data is temporarily unavailable.',
    });
  }
}
