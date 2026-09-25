const FRANKFURTER_API = 'https://api.frankfurter.dev/v2';
const STABLECOINS_API = 'https://api.llama.fi/stablecoins?includePrices=true';

const normalizeCode = (value: unknown) => String(value || '').trim().toUpperCase();

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'public, max-age=30, stale-while-revalidate=60');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  try {
    const [fiatResponse, currencyResponse, stableResponse] = await Promise.all([
      fetch(FRANKFURTER_API + '/rates?base=USD', { signal: AbortSignal.timeout(8000) }),
      fetch(FRANKFURTER_API + '/currencies', { signal: AbortSignal.timeout(8000) }),
      fetch(STABLECOINS_API, { signal: AbortSignal.timeout(8000) }),
    ]);

    if (!fiatResponse.ok) throw new Error('Fiat reference service is unavailable.');
    if (!currencyResponse.ok) throw new Error('Currency catalogue is unavailable.');
    if (!stableResponse.ok) throw new Error('Stablecoin market service is unavailable.');

    const [fiatRows, currencyJson, stableJson] = await Promise.all([
      fiatResponse.json(),
      currencyResponse.json(),
      stableResponse.json(),
    ]);

    const fiatRatesUsd: Record<string, number> = { USD: 1 };
    let fiatDate: string | null = null;

    if (Array.isArray(fiatRows)) {
      for (const row of fiatRows) {
        const quote = normalizeCode(row?.quote);
        const value = Number(row?.rate);
        if (quote && Number.isFinite(value) && value > 0) {
          fiatRatesUsd[quote] = value;
          if (!fiatDate && row?.date) fiatDate = String(row.date);
        }
      }
    }

    const currencies = Object.entries(currencyJson || {})
      .map(([code, name]) => ({ code: normalizeCode(code), name: String(name) }))
      .filter((item) => item.code)
      .sort((a, b) => a.code.localeCompare(b.code));

    if (!currencies.some((item) => item.code === 'USD')) {
      currencies.unshift({ code: 'USD', name: 'United States Dollar' });
    }
    if (!currencies.some((item) => item.code === 'NGN')) {
      currencies.push({ code: 'NGN', name: 'Nigerian Naira' });
    }

    const peggedAssets = Array.isArray(stableJson?.peggedAssets) ? stableJson.peggedAssets : [];
    const stables = peggedAssets
      .map((item: any) => ({
        id: String(item?.id || ''),
        name: String(item?.name || item?.symbol || 'Stablecoin'),
        symbol: normalizeCode(item?.symbol),
        priceUSD: Number(item?.price),
      }))
      .filter((item: any) => item.symbol && Number.isFinite(item.priceUSD) && item.priceUSD > 0)
      .sort((a: any, b: any) => a.symbol.localeCompare(b.symbol));

    if (!stables.length) throw new Error('No stablecoin market prices were returned.');

    let cbnNgnRate: number | null = null;
    let cbnDate: string | null = null;

    try {
      const cbnResponse = await fetch(FRANKFURTER_API + '/providers/cbn/rate/usd/ngn', {
        signal: AbortSignal.timeout(5000),
      });
      if (cbnResponse.ok) {
        const cbn = await cbnResponse.json();
        const value = Number(cbn?.rate);
        if (Number.isFinite(value) && value > 0) {
          cbnNgnRate = value;
          cbnDate = cbn?.date ? String(cbn.date) : null;
        }
      }
    } catch {
      // The blended Frankfurter USD/NGN rate remains the fallback.
    }

    if (cbnNgnRate) fiatRatesUsd.NGN = cbnNgnRate;

    return res.status(200).json({
      ok: true,
      asOf: new Date().toISOString(),
      fiatRatesUsd,
      currencies,
      fiatDate,
      cbnNgnRate,
      cbnDate,
      stables,
      stableUpdatedAt: new Date().toISOString(),
      sources: {
        fiat: 'Frankfurter',
        stablecoins: 'DeFiLlama',
        ngn: cbnNgnRate ? 'CBN via Frankfurter' : 'Frankfurter',
      },
    });
  } catch (error: any) {
    console.error('[GEN-0 FX]', error);
    return res.status(503).json({
      ok: false,
      error: error?.message || 'FX reference data is temporarily unavailable.',
    });
  }
}
