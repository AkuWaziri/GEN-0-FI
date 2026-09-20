import { createPublicClient, http, parseAbiItem } from 'viem';
import { applyApiSecurity } from '../../_security.js';

const RPC = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const CONTRACT = '0xCb98496A4BbF6969bF6c8EfF2694992e819047AC' as `0x${string}`;
const EVENT = parseAbiItem('event GMCheckedIn(address indexed wallet, uint256 indexed day, uint256 timestamp, uint256 fee)');

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
    const scanFrom = latestBlock > 200000n ? latestBlock - 200000n : 0n;
    const chunkSize = 10000n;
    const events: any[] = [];
    for (let fromBlock = scanFrom; fromBlock <= latestBlock; fromBlock += chunkSize + 1n) {
      const toBlock = fromBlock + chunkSize > latestBlock ? latestBlock : fromBlock + chunkSize;
      const logs = await client.getLogs({ address: CONTRACT, event: EVENT, args: { wallet: wallet as `0x${string}` }, fromBlock, toBlock });
      for (const log of logs) events.push({ blockNumber: log.blockNumber?.toString(), transactionHash: log.transactionHash, day: log.args.day?.toString(), timestamp: log.args.timestamp?.toString(), fee: log.args.fee?.toString() });
    }
    return res.status(200).json({ wallet, contract: CONTRACT, latestBlock: latestBlock.toString(), todayDay: Math.floor(Date.now() / 86400000).toString(), lastCheckInDay: lastCheckInDay.toString(), eventCount: events.length, events });
  } catch (error: any) {
    console.error('[Arc GM Debug] error:', error?.message || error);
    return res.status(503).json({ error: 'Arc GM debug query failed', message: error?.message || String(error) });
  }
}
