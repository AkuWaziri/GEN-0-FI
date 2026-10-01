import {
  fetchAllConfirmedGMEvents,
  leaderboardFromRows,
  persistGMRows,
} from './_service.js';
import { applyApiSecurity } from '../_security.js';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

  try {
    const rows = await fetchAllConfirmedGMEvents();
    await persistGMRows(rows);

    const requested = Number(req.query?.limit || 20);
    const limit = Number.isFinite(requested) ? Math.min(Math.max(Math.floor(requested), 1), 100) : 20;

    return res.status(200).json({
      leaderboard: leaderboardFromRows(rows, limit),
      source: 'Arc Mainnet GMCheckedIn events',
    });
  } catch (error: any) {
    console.error('[GM leaderboard] failed:', error);
    return res.status(502).json({ error: 'Unable to read confirmed GM events from Arc Mainnet.' });
  }
}
