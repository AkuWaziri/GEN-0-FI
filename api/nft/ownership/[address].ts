import { applyApiSecurity } from '../_security.js';
import { isAddress } from 'viem';
import { arcClient } from '../../src/services/blockchain/arcService.js';

const CONTRACT = '0x8bb24be3e446302a4902e763908d439325e0003a' as const;
const ABI = [
  { type: 'function', name: 'hasMinted', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
] as const;

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;
  const address = req.query.address || (req.url && req.url.split('/').pop()?.split('?')[0]);
  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid EVM address parameter' });
  }
  try {
    const hasMinted = await arcClient.readContract({ address: CONTRACT, abi: ABI, functionName: 'hasMinted', args: [address as `0x${string}`] });
    const balance = await arcClient.readContract({ address: CONTRACT, abi: ABI, functionName: 'balanceOf', args: [address as `0x${string}`] });
    return res.status(200).json({ address, contract: CONTRACT, owned: Boolean(hasMinted) || balance > 0n, hasMinted: Boolean(hasMinted), balance: balance.toString() });
  } catch (error: any) {
    console.error('[GEN-0 Bound ownership] Error:', error);
    return res.status(502).json({ error: 'Arc Mainnet ownership lookup failed' });
  }
}
