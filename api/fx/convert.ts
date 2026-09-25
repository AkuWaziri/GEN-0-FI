const CMC_BASE = 'https://pro-api.coinmarketcap.com';
const CMC_KEYLESS_BASE = CMC_BASE + '/public-api';

const normalize = (value: unknown) => String(value || '').trim().toUpperCase();

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
    throw new Error(payload?.status?.error_message || 'CoinMarketCap conversion is temporarily unavailable.');
  }

  return payload;
};

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed.' });

  const from = normalize(req.query?.from);
  const to = normalize(req.query?.to);
  const amount = Number(req.query?.amount);

  if (!from || !to) return res.status(400).json({ error: 'Both from and to assets are required.' });
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000_000_000) {
    return res.status(400).json({ error: 'Amount must be a valid non-negative number.' });
  }

  try {
    if (from === to) {
      return res.status(200).json({
        ok: true,
        from,
        to,
        amount,
        converted: amount,
        rate: 1,
        source: 'CoinMarketCap',
        asOf: new Date().toISOString(),
      });
    }

    const payload = await cmcRequest('/v2/tools/price-conversion', {
      amount: String(amount),
      symbol: from,
      convert: to,
    });

    const data = Array.isArray(payload?.data) ? payload.data[0] : payload?.data;
    const quoteContainer = Array.isArray(data?.quote) ? data.quote[0] : data?.quote;
    const quote = quoteContainer?.[to] || quoteContainer?.[normalize(to)];
    const converted = Number(quote?.price);

    if (!Number.isFinite(converted)) {
      throw new Error('No live conversion was returned for ' + from + ' → ' + to + '.');
    }

    return res.status(200).json({
      ok: true,
      from,
      to,
      amount,
      converted,
      rate: amount === 0 ? null : converted / amount,
      source: 'CoinMarketCap',
      lastUpdated: quote?.last_updated || data?.last_updated || null,
      asOf: payload?.status?.timestamp || new Date().toISOString(),
    });
  } catch (error: any) {
    console.error('[GEN-0 FX CONVERT]', error);
    return res.status(503).json({
      ok: false,
      error: error?.message || 'Live conversion is temporarily unavailable.',
    });
  }
}
