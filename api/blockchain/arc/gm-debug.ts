import { createPublicClient, http, parseAbiItem } from 'viem';
import { applyApiSecurity } from '../../_security.js';
import { createClient } from '@supabase/supabase-js';

const RPC = process.env.ARC_MAINNET_RPC_URL || 'https://rpc.mainnet.arc.io';
const CONTRACT = '0xCb98496A4BbF6969bF6c8EfF2694992e819047AC' as `0x${string}`;
const ARC_SCAN = 'https://api.arc-scan.org/v1';

const client = createPublicClient({
  chain: { id: 5042, name: 'Arc', nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC] } } },
  transport: http(RPC, { timeout: 15000, retryCount: 1 }),
});

const LAST_CHECK_IN_DAY_ABI = [parseAbiItem('function lastCheckInDay(address) view returns (uint256)')] as const;
const EVENT_TOPIC = '0xdd6c7651c83f9ddcbf3c5ad46a9ab5b9a38a5fffd89a224f364c803b69e1bb25';
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(200).end();
  const wallet = String(req.query?.address || '').toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(wallet)) return res.status(400).json({ error: 'valid address is required' });

  try {
    const latestBlock = await client.getBlockNumber();
    const lastCheckInDay = await client.readContract({
      address: CONTRACT,
      abi: LAST_CHECK_IN_DAY_ABI,
      functionName: 'lastCheckInDay',
      args: [wallet as `0x${string}`] as const,
    } as any) as bigint;

    const responseItems: any[] = [];
    const pagesChecked: number[] = [];

    for (let page = 1; page <= 10; page++) {
      const url = `${ARC_SCAN}/address/${CONTRACT}/logs?limit=100&page=${page}`;
      const response = await fetch(url, { headers: { accept: 'application/json' } });
      if (!response.ok) throw new Error(`ArcScan HTTP ${response.status}`);
      const body = await response.json();
      const items = Array.isArray(body?.items) ? body.items : [];
      pagesChecked.push(page);
      responseItems.push(...items);
      if (items.length < 100) break;
      await sleep(100);
    }

    const decodeUint256 = (value: unknown) => {
      const hex = String(value || '');
      if (!/^0x[0-9a-fA-F]{64}$/.test(hex)) return null;
      return BigInt(hex).toString();
    };

    const contractLogs = responseItems
      .filter((item: any) => {
        const topics = Array.isArray(item?.topics) ? item.topics : [];
        const topic0 = String(topics[0] || '').toLowerCase();
        const topic1 = String(topics[1] || '').toLowerCase();
        return topic0 === EVENT_TOPIC && topic1 === `0x${wallet.slice(2).padStart(64, '0')}`;
      })
      .map((item: any) => {
        const topics = Array.isArray(item?.topics) ? item.topics : [];
        const data = String(item?.data || '');
        const words = data.startsWith('0x') ? data.slice(2).match(/.{64}/g) || [] : [];
        return {
          transactionHash: item.transactionHash || item.transaction_hash || item.txHash || null,
          blockNumber: String(item.blockNumber ?? item.block_number ?? ''),
          args: {
            wallet,
            day: decodeUint256(topics[2]),
            timestamp: decodeUint256(`0x${words[0] || ''}`),
            fee: decodeUint256(`0x${words[1] || ''}`),
            topics,
          },
          raw: item,
        };
      });

    const syncDays = [...new Set(
      contractLogs
        .map((log: any) => log?.args?.day)
        .filter((day: unknown): day is string => typeof day === 'string')
    )];

    let syncedDays: string[] = [];
    let syncError: string | null = null;

    if (supabase && syncDays.length) {
      const rows = syncDays
        .map((day) => Number(day))
        .filter((day) => Number.isSafeInteger(day) && day >= 0)
        .map((day) => ({
          wallet_address: wallet,
          checkin_date: new Date(day * 86400000).toISOString().slice(0, 10),
          chain_id: 5042,
        }));

      if (rows.length) {
        const { error } = await supabase
          .from('gm_checkins')
          .upsert(rows, {
            onConflict: 'wallet_address,checkin_date',
            ignoreDuplicates: true,
          });

        if (error) {
          syncError = error.message;
        } else {
          syncedDays = rows.map((row) => row.checkin_date);
        }
      }
    } else if (!supabase) {
      syncError = 'Supabase server variables are not configured.';
    }

    return res.status(200).json({
      wallet,
      contract: CONTRACT,
      latestBlock: latestBlock.toString(),
      todayDay: Math.floor(Date.now() / 86400000).toString(),
      lastCheckInDay: lastCheckInDay.toString(),
      rawCount: responseItems.length,
      contractLogCount: contractLogs.length,
      pagesChecked,
      logs: contractLogs,
      rawResponseKeys: ['items', 'page'],
      syncedDays,
      syncError,
    });
  } catch (error: any) {
    console.error('[Arc GM Debug] error:', error?.message || error);
    return res.status(503).json({ error: 'Arc GM debug query failed', message: error?.message || String(error) });
  }
}
