import { createPublicClient, formatUnits, http } from 'viem';
import { applyApiSecurity } from '../../_security.js';
import {
  ARC_MAINNET_CHAIN_ID,
  ARC_MAINNET_EXPLORER_URL,
  ARC_MAINNET_RPC_URL,
  ARC_NETWORK_CONFIG,
} from '../../../src/config/arc.js';

const ARC_RPC = process.env.ARC_MAINNET_RPC_URL || ARC_MAINNET_RPC_URL;

const arcClient = createPublicClient({
  chain: {
    id: ARC_MAINNET_CHAIN_ID,
    name: 'Arc',
    nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [ARC_RPC] } },
  },
  transport: http(ARC_RPC, { timeout: 15_000, retryCount: 2 }),
});

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

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
      chainId: ARC_MAINNET_CHAIN_ID,
      blockNumber: Number(blockNumber),
      latencyMs: latency,
      gasPriceGwei,
      rpcUrl: ARC_RPC,
      nativeCurrency: 'USDC',
      explorerUrl: ARC_MAINNET_EXPLORER_URL,
    });
  } catch (error: any) {
    console.error('[Arc Status API] RPC error:', error?.message || error);

    return res.status(503).json({
      connected: false,
      error: 'Arc RPC connection error',
      message: 'Unable to query Arc Mainnet right now',
      chainId: ARC_NETWORK_CONFIG.chainId,
      rpcUrl: ARC_NETWORK_CONFIG.rpcUrl,
    });
  }
}
