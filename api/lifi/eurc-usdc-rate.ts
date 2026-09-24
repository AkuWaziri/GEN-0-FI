import { applyApiSecurity } from '../_security.js';

const LIFI_API = 'https://li.quest/v1';
const EURC = '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1';
const USDC = '0x3600000000000000000000000000000000000000';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const amount = typeof req.query?.amount === 'string' ? req.query.amount : '1';
  const address = typeof req.query?.address === 'string' ? req.query.address : '';
  if (!address) return res.status(400).json({ error: 'Missing address' });

  const params = new URLSearchParams({
    fromChain: '5042',
    toChain: '5042',
    fromToken: EURC,
    toToken: USDC,
    fromAddress: address,
    toAddress: address,
    fromAmount: amount,
    order: 'CHEAPEST',
  });

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (process.env.LIFI_API_KEY) headers['x-lifi-api-key'] = process.env.LIFI_API_KEY;

  try {
    const response = await fetch(`${LIFI_API}/quote?${params.toString()}`, {
      headers,
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json({ error: 'EURC/USDC fee quote failed', details: data });
    }
    return res.status(200).json({
      fromToken: EURC,
      toToken: USDC,
      fromAmount: data?.action?.fromAmount ?? amount,
      toAmount: data?.estimate?.toAmount ?? null,
      toAmountMin: data?.estimate?.toAmountMin ?? null,
      validUntil: Date.now() + 30_000,
    });
  } catch (error) {
    return res.status(502).json({
      error: 'EURC/USDC fee quote unavailable',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
