import { applyApiSecurity } from '../../_security.js';

const LIFI_API = 'https://li.quest/v1';
const DEFAULT_INTEGRATOR = 'GEN-0FI';
const DEFAULT_FEE = '0.005';

function getFee(): number {
  const raw = process.env.GEN0FI_LIFI_FEE || DEFAULT_FEE;
  const fee = Number(raw);
  if (!Number.isFinite(fee) || fee < 0 || fee >= 1) throw new Error('GEN0FI_LIFI_FEE must be a decimal between 0 and 1.');
  return fee;
}

function isValidEvmAddress(value: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(value);
}

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  try {
    const fee = getFee();
    const feeWallet = process.env.GEN0FI_FEE_WALLET || '';
    if (!isValidEvmAddress(feeWallet)) {
      return res.status(503).json({
        error: 'GEN-0FI fee collection is not configured.',
        message: 'Set GEN0FI_FEE_WALLET to the treasury wallet configured for the GEN-0FI LI.FI integration.',
      });
    }
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(req.query)) {
      if (typeof value === 'string') query.set(key, value);
      else if (Array.isArray(value) && value.length > 0) query.set(key, value[0]);
    }
    const required = ['fromChain','toChain','fromToken','toToken','fromAddress','toAddress','fromAmount'];
    const missing = required.filter((key) => !query.get(key));
    if (missing.length) return res.status(400).json({ error: 'Missing quote parameters', missing });
    query.set('integrator', process.env.GEN0FI_LIFI_INTEGRATOR || DEFAULT_INTEGRATOR);
    query.set('fee', String(fee));
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY;
    const response = await fetch(LIFI_API + '/quote?' + query.toString(), { headers, cache: 'no-store' });
    const body = await response.text();
    let data: unknown;
    try { data = JSON.parse(body); } catch { data = { message: body }; }
    if (!response.ok) return res.status(response.status).json({ error: 'LI.FI quote request failed', details: data });
    return res.status(200).json({
      ...(data as Record<string, unknown>),
      gen0fiFee: { percent: Number((fee * 100).toFixed(4)), wallet: feeWallet },
    });
  } catch (error) {
    return res.status(500).json({ error: 'GEN-0FI fee quote failed', message: error instanceof Error ? error.message : 'Unknown error' });
  }
}