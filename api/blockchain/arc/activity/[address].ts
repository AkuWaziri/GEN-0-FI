import { applyApiSecurity } from '../../../_security.js';
import { isAddress } from 'viem';
import { fetchTransactionsForAddress } from '../../../../src/services/blockchain/arcService.js';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

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
      message: 'Upstream query failed',
    });
  }
}
