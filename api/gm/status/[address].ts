import { isAddress } from 'viem';
import { applyApiSecurity } from '../../../_security.js';
import { getGmStatus } from '../../../../src/services/gm/gmService.js';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

  const address = String(req.query?.address || '');
  if (!isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    const status = await getGmStatus(address);
    return res.status(200).json({ address, ...status });
  } catch (error) {
    console.error('[GM Status] Arcscan query failed:', error);
    return res.status(503).json({ error: 'GM history is temporarily unavailable.' });
  }
}
