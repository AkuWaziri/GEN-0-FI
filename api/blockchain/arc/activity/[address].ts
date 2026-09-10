import { isAddress } from 'viem';
import { arcClient, fetchTransactionsForAddress } from '../../../../src/services/blockchain/arcService';

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
  const limit = Math.min(parseInt((req.query.limit as string) || '50', 10), 50);

  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid EVM address parameter' });
  }

  try {
    const txCount = await arcClient.getTransactionCount({
      address: address as `0x${string}`,
    }).catch(() => 0n);

    const { transactions } = await fetchTransactionsForAddress(address, limit);

    return res.status(200).json({
      address,
      txCount: Math.max(Number(txCount), transactions.length),
      transactions,
    });
  } catch (error: any) {
    console.error(`[Activity API] Error for ${address}:`, error);
    return res.status(500).json({
      error: 'Failed to retrieve transaction activity from Arc RPC',
      message: error?.message || 'RPC query failed',
    });
  }
}
