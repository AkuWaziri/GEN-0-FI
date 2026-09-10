import { isAddress } from 'viem';
import { arcClient, fetchCompleteWalletState } from '../../../../src/services/blockchain/arcService';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const address = req.query.address || (req.url && req.url.split('/').pop()?.split('?')[0]);

  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid EVM address parameter' });
  }

  try {
    const state = await fetchCompleteWalletState(address);

    const summary = {
      address,
      balanceUSDC: state.currentBalance,
      totalReceivedUSDC: state.totalReceived,
      receivedTotalUSDC: state.totalReceived,
      totalSentUSDC: state.totalSent,
      sentTotalUSDC: state.totalSent,
      txCount: state.totalTransactions,
      scannedTxCount: state.recentTransactions.length,
      gasSpentUSDC: state.totalGasSpent,
      contractInteractionsCount: state.contractInteractions,
      activeContractsCount: state.contractInteractions,
      isDataAvailable: true,
      historyStatus: state.historyStatus,
      historyStatusNote: state.historyStatusNote,
      latestActivityTime: state.recentTransactions.length > 0 ? state.recentTransactions[0].timestamp : undefined,
    };

    return res.status(200).json({
      summary,
      transactions: state.recentTransactions,
    });
  } catch (error: any) {
    console.error(`[Summary API] Error for ${address}:`, error);
    return res.status(500).json({
      error: 'Failed to retrieve wallet summary from Arc RPC',
      message: error?.message || 'RPC query failed',
    });
  }
}
