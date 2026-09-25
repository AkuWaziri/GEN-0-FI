import { isAddress } from 'viem';
import { compileGen0Token } from '../../src/services/blockchain/gen0TokenCompiler';

const NAME_MAX = 64;
const SYMBOL_MAX = 16;

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = req.body || {};
    const name = String(body.name || '').trim();
    const symbol = String(body.symbol || '').trim().toUpperCase();
    const decimals = Number(body.decimals);
    const initialSupply = String(body.initialSupply || '').trim();
    const receiver = String(body.receiver || '').trim();

    if (!name || name.length > NAME_MAX) {
      return res.status(400).json({ error: `Token name must be 1-${NAME_MAX} characters.` });
    }
    if (!/^[A-Z0-9._-]+$/.test(symbol) || symbol.length > SYMBOL_MAX) {
      return res.status(400).json({ error: `Ticker must be 1-${SYMBOL_MAX} characters using letters, numbers, ., _, or -.` });
    }
    if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
      return res.status(400).json({ error: 'Decimals must be an integer from 0 to 18.' });
    }
    if (!/^\d+$/.test(initialSupply) || initialSupply === '0') {
      return res.status(400).json({ error: 'Initial supply must be a positive whole number.' });
    }
    if (!isAddress(receiver)) {
      return res.status(400).json({ error: 'A valid receiving wallet address is required.' });
    }

    const compiled = compileGen0Token({ name, symbol, decimals, initialSupply, receiver });

    return res.status(200).json({
      ok: true,
      bytecode: compiled.bytecode,
      abi: compiled.abi,
      compiler: compiled.compiler,
      network: 'Arc Mainnet',
      chainId: 5042,
    });
  } catch (error: any) {
    console.error('[GEN-0 deploy compile]', error);
    return res.status(500).json({
      error: error?.message || 'Token compilation failed.',
    });
  }
}
