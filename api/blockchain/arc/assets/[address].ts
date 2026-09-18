import { isAddress } from 'viem';
import { fetchWalletAssetSummary } from '../../../../src/services/blockchain/arcService.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const address = req.query.address || (req.url && req.url.split('/').pop()?.split('?')[0]);

  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid EVM address parameter' });
  }

  try {
    const assets = await fetchWalletAssetSummary(address);
    return res.status(200).json({ address, assets });
  } catch (error: any) {
    console.error(`[Assets API] Error for ${address}:`, error);
    return res.status(503).json({
      address,
      assets: null,
      error: 'Arc Mainnet token holdings are temporarily unavailable.',
      message: error?.message || 'Indexed token holdings query failed',
    });
  }
}
