import { applyApiSecurity } from '../../../_security.js';
import { isAddress } from 'viem';
import { fetchBalanceFromArcRpc } from '../../../../src/services/blockchain/arcService.js';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

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
      isTestnet: false,
      isVerified: true,
    });
  } catch (error: any) {
    console.error(`[Balance API] Error for ${address}:`, error);
    return res.status(500).json({
      error: 'Failed to retrieve balance from Arc RPC',
      message: 'Upstream query failed',
    });
  }
}
