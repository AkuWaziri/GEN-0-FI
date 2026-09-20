import { createPublicClient, http, parseAbiItem } from 'viem';
import { applyApiSecurity } from '../../_security.js';

const RPC = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
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

    const event = parseAbiItem('event GMCheckedIn(address indexed wallet, uint256 indexed day, uint256 timestamp, uint256 fee)');
    const fromBlock = latestBlock > 200000n ? latestBlock - 200000n : 0n;
    const contractLogs: any[] = [];
    for (let start = fromBlock; start <= latestBlock; start += 2000n) {
      const end = start + 1999n > latestBlock ? latestBlock : start + 1999n;
      const chunk = await client.getLogs({
        address: CONTRACT,
        event,
        args: { wallet: wallet as `0x${string}` },
        fromBlock: start,
        toBlock: end,
      });
      contractLogs.push(...chunk);
    }

    return res.status(200).json({
      wallet,
      contract: CONTRACT,
      latestBlock: latestBlock.toString(),
      todayDay: Math.floor(Date.now() / 86400000).toString(),
      lastCheckInDay: lastCheckInDay.toString(),
      rawCount: contractLogs.length,
      contractLogCount: contractLogs.length,
      logs: contractLogs.map((log: any) => ({
        transactionHash: log.transactionHash,
        blockNumber: log.blockNumber?.toString(),
        args: log.args ? {
          wallet: log.args.wallet,
          day: log.args.day?.toString(),
          timestamp: log.args.timestamp?.toString(),
          fee: log.args.fee?.toString(),
        } : null,
      })),
      rawResponseKeys: [],
    });
  } catch (error: any) {
    console.error('[Arc GM Debug] error:', error?.message || error);
    return res.status(503).json({ error: 'Arc GM debug query failed', message: error?.message || String(error) });
  }
}
