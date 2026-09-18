import { isAddress } from 'viem';
import { fetchTransactionsForAddress } from '../../../../src/services/blockchain/arcService.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const address = req.query.address || (req.url && req.url.split('/').pop()?.split('?')[0]);
  const limit = Math.min(Math.max(parseInt((req.query.limit as string) || '50', 10), 1), 50);

  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid EVM address parameter' });
  }

  try {
    const result = await fetchTransactionsForAddress(address, limit);
    if (result.historyStatus === 'unavailable') {
      return res.status(503).json({
        address,
        txCount: 0,
        transactions: [],
        historyStatus: 'unavailable',
        error: 'Arc Mainnet indexed activity is temporarily unavailable.',
      });
    }

    return res.status(200).json({
      address,
      txCount: result.lifetimeTransactions.length,
      transactions: result.transactions,
      historyStatus: result.historyStatus,
    });
  } catch (error: any) {
    console.error(`[Activity API] Error for ${address}:`, error);
    return res.status(500).json({
      error: 'Failed to retrieve Arc Mainnet transaction activity',
      message: error?.message || 'Indexed activity query failed',
    });
  }
}
