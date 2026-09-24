import { applyApiSecurity } from '../../../_security.js';
import { isAddress } from 'viem';
import { arcClient, fetchCompleteWalletState } from '../../../../src/services/blockchain/arcService.js';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

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
      scannedTxCount: state.totalTransactions,
      gasSpentUSDC: state.totalGasSpent,
      contractInteractionsCount: state.contractInteractions,
      activeContractsCount: state.contractInteractions,
      isDataAvailable: state.historyStatus === 'complete' && state.currentBalance !== 'Unavailable',
      historyStatus: state.historyStatus,
      historyStatusNote: state.historyStatusNote,
      latestActivityTime: state.recentTransactions.length > 0 ? state.recentTransactions[0].timestamp : undefined,
      firstActivityTime: state.firstActivityTime,
      failedTransactionCount: state.failedTransactionCount,
      topProtocolUsed: state.topProtocolUsed,
      tokenApprovalsCount: state.tokenApprovalsCount,
    };

    return res.status(200).json({
      summary,
      transactions: state.recentTransactions,
    });
  } catch (error: any) {
    console.error(`[Summary API] Error for ${address}:`, error);
    return res.status(500).json({
      error: 'Failed to retrieve wallet summary from Arc RPC',
      message: 'Upstream query failed',
    });
  }
}
