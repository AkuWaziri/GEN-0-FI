import { isAddress } from 'viem';
import {
  fetchAllConfirmedGMEvents,
  persistGMRows,
  statsForWallet,
} from '../../src/services/gm/gmServerService.js';
import { applyApiSecurity } from '../_security.js';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

  const raw = req.query?.address;
  const address = typeof raw === 'string' ? raw : Array.isArray(raw) ? raw[0] : '';

  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  try {
    const rows = await fetchAllConfirmedGMEvents();
    await persistGMRows(rows);

    const stats = statsForWallet(rows, address);
    const walletRows = rows
      .filter((row) => row.wallet_address === address.toLowerCase())
      .sort((a, b) => a.checkin_date.localeCompare(b.checkin_date));

    return res.status(200).json({
      wallet: address.toLowerCase(),
      stats,
      confirmedDays: walletRows.map((row) => row.checkin_date),
      latestTxHash: walletRows.at(-1)?.tx_hash ?? null,
      source: 'Arc Mainnet GMCheckedIn events',
    });
  } catch (error: any) {
    console.error('[GM status] failed:', error);
    return res.status(502).json({ error: 'Unable to read confirmed GM events from Arc Mainnet.' });
  }
}
