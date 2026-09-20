import { createPublicClient, http, parseAbiItem } from 'viem';
import { applyApiSecurity } from '../../_security.js';

const RPC = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const ARCSCAN_API = 'https://api.arc-scan.org/v1';
const CONTRACT = '0xCb98496A4BbF6969bF6c8EfF2694992e819047AC' as `0x${string}`;

const client = createPublicClient({
  chain: { id: 5042, name: 'Arc', nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC, { timeout: 15000, retryCount: 2 }),
});

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  const wallet = String(req.query?.address || '').toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return res.status(400).json({ error: 'valid address is required' });

  try {
    const latestBlock = await client.getBlockNumber();
    const lastCheckInDay = await client.readContract({
      address: CONTRACT,
      abi: [parseAbiItem('function lastCheckInDay(address) view returns (uint256)')],
      functionName: 'lastCheckInDay',
      args: [wallet as `0x${string}`],
    });

    const response = await fetch(
      `${ARCSCAN_API}/address/${wallet}/logs?limit=100`,
      { headers: { 'User-Agent': 'GEN-0FI/1.0' } },
    );

    const body = await response.json();
    if (!response.ok) {
      return res.status(503).json({ error: 'ArcScan log query failed', status: response.status, body });
    }

    const logs = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    const contractLogs = logs.filter((log: any) =>
      String(log?.address || log?.contract_address || '').toLowerCase() === CONTRACT.toLowerCase()
    );

    return res.status(200).json({
      wallet,
      contract: CONTRACT,
      latestBlock: latestBlock.toString(),
      todayDay: Math.floor(Date.now() / 86400000).toString(),
      lastCheckInDay: lastCheckInDay.toString(),
      rawCount: logs.length,
      contractLogCount: contractLogs.length,
      logs: contractLogs,
      rawResponseKeys: body && typeof body === 'object' ? Object.keys(body) : [],
    });
  } catch (error: any) {
    console.error('[Arc GM Debug] error:', error?.message || error);
    return res.status(503).json({ error: 'Arc GM debug query failed', message: error?.message || String(error) });
  }
}
