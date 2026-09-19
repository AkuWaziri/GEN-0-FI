import { applyApiSecurity } from '../_security.js';
import { getGmLeaderboard } from '../../src/services/gm/gmService.js';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

  try {
    const leaderboard = await getGmLeaderboard();
    return res.status(200).json({
      leaderboard,
      source: 'Arc Mainnet',
      feeAddress: '0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c',
    });
  } catch (error) {
    console.error('[GM Leaderboard] Arcscan query failed:', error);
    return res.status(503).json({ error: 'GM leaderboard is temporarily unavailable.' });
  }
}
