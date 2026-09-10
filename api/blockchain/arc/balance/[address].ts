import { isAddress } from 'viem';
import { fetchBalanceFromArcRpc } from '../../../../src/services/blockchain/arcService';

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
    const { formatted, raw } = await fetchBalanceFromArcRpc(address);
    return res.status(200).json({
      address,
      balanceUSDC: formatted,
      rawBalance: raw,
      token: 'USDC',
      decimals: 18,
      network: 'Arc',
      isTestnet: true,
    });
  } catch (error: any) {
    console.error(`[Balance API] Error for ${address}:`, error);
    return res.status(500).json({
      error: 'Failed to retrieve balance from Arc RPC',
      message: error?.message || 'RPC query failed',
    });
  }
}
