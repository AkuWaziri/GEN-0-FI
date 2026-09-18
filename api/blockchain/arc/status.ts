import { arcClient } from '../../../src/services/blockchain/arcService.js';
import { ARC_NETWORK_CONFIG } from '../../../src/config/arc.js';
import { formatUnits } from 'viem';

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

  const start = performance.now();
  try {
    const blockNumber = await arcClient.getBlockNumber();

    let gasPriceGwei: string | null = null;
    try {
      const gasPrice = await arcClient.getGasPrice();
      gasPriceGwei = formatUnits(gasPrice, 9);
    } catch {
      // RPC connectivity is already verified by getBlockNumber().
      // Never substitute a fabricated gas price.
    }

    const latency = Math.round(performance.now() - start);

    return res.status(200).json({
      connected: true,
      chainId: ARC_NETWORK_CONFIG.chainId,
      blockNumber: Number(blockNumber),
      latencyMs: latency,
      gasPriceGwei,
      rpcUrl: ARC_NETWORK_CONFIG.rpcUrl,
      nativeCurrency: ARC_NETWORK_CONFIG.nativeCurrency.symbol,
      explorerUrl: ARC_NETWORK_CONFIG.explorerUrl,
    });
  } catch (error: any) {
    return res.status(503).json({
      connected: false,
      error: 'Arc RPC connection error',
      message: error?.message || 'RPC request timed out',
      chainId: ARC_NETWORK_CONFIG.chainId,
      rpcUrl: ARC_NETWORK_CONFIG.rpcUrl,
    });
  }
}
