import { applyApiSecurity } from '../../../_security.js';
import { isAddress } from 'viem';
import { fetchWalletAssetSummary } from '../../../../src/services/blockchain/arcService.js';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

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
      message: 'Upstream query failed',
    });
  }
}
