import { createPublicClient, formatUnits, http } from 'viem';

const ARC_MAINNET_CHAIN_ID = 5042;
const ARC_MAINNET_RPC_URL = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const ARC_MAINNET_EXPLORER_URL = 'https://explorer.arc.io';
const arcClient = createPublicClient({
  chain: {
    id: ARC_MAINNET_CHAIN_ID,
    name: 'Arc',
    nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
    rpcUrls: { default: { http: [ARC_MAINNET_RPC_URL] } },
  },
  transport: http(ARC_MAINNET_RPC_URL, { timeout: 15_000, retryCount: 2 }),
});

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
      chainId: ARC_MAINNET_CHAIN_ID,
      blockNumber: Number(blockNumber),
      latencyMs: latency,
      gasPriceGwei,
      rpcUrl: ARC_MAINNET_RPC_URL,
      nativeCurrency: 'USDC',
      explorerUrl: ARC_MAINNET_EXPLORER_URL,
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
