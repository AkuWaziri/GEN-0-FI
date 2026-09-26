import { createClient } from '@supabase/supabase-js';
import { isAddress } from 'viem';
import { applyApiSecurity } from '../_security.js';

const LI_FI_ANALYTICS = 'https://li.quest/v1/analytics/transfers';
const INTEGRATOR = 'gen-0fi';
const POINTS = { swap: 50, bridge: 100 } as const;

function getSupabase() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
  return url && key ? createClient(url, key) : null;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'GEN-0FI/1.0' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error('LI.FI analytics request failed');
  return response.json();
}

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

  const rawAddress = req.query?.address;
  const address = typeof rawAddress === 'string'
    ? rawAddress
    : Array.isArray(rawAddress) ? rawAddress[0] : '';

  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid wallet address' });
  }

  const supabase = getSupabase();
  if (!supabase) return res.status(503).json({ error: 'Points indexing is not configured.' });

  try {
    const params = new URLSearchParams({
      integrator: INTEGRATOR,
      wallet: address,
      status: 'DONE',
      fromTimestamp: '0',
    });
    const data = await fetchJson(LI_FI_ANALYTICS + '?' + params.toString());
    const transfers = Array.isArray(data?.transfers) ? data.transfers : [];

    const actions: Array<Record<string, unknown>> = [];
    const seen = new Set<string>();

    for (const transfer of transfers) {
      if (String(transfer?.status || '').toUpperCase() !== 'DONE') continue;
      if (String(transfer?.substatus || '').toUpperCase() !== 'COMPLETED') continue;

      const txHash = String(transfer?.sending?.txHash || '').toLowerCase();
      if (!/^0x[a-f0-9]{64}$/.test(txHash) || seen.has(txHash)) continue;
      seen.add(txHash);

      const fromChain = Number(transfer?.sending?.chainId);
      const toChain = Number(transfer?.receiving?.chainId);
      if (!Number.isFinite(fromChain) || !Number.isFinite(toChain)) continue;

      const action = fromChain === toChain ? 'swap' : 'bridge';
      actions.push({
        wallet_address: address.toLowerCase(),
        tx_hash: txHash,
        action_type: action,
        points: POINTS[action],
        chain_id: fromChain,
      });
    }

    if (actions.length > 0) {
      const { error } = await supabase.from('point_actions').upsert(actions, {
        onConflict: 'tx_hash',
        ignoreDuplicates: true,
      });
      if (error) throw error;
    }

    return res.status(200).json({
      wallet: address,
      recovered: actions.length,
      swaps: actions.filter((row) => row.action_type === 'swap').length,
      bridges: actions.filter((row) => row.action_type === 'bridge').length,
    });
  } catch (error: any) {
    console.error('[Points recovery] Error:', error);
    return res.status(502).json({ error: 'Historical LI.FI points recovery failed.' });
  }
}
