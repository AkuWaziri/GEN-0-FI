import { supabase } from '../../lib/supabase';
import type { PointAction, PointLeaderboardRow } from '../../types/points';

export const SWAP_POINTS = 5;
export const BRIDGE_POINTS = 10;

export async function recordConfirmedAction(
  walletAddress: string,
  txHash: string,
  action: PointAction,
): Promise<void> {
  if (!supabase) throw new Error('Points indexing is not configured.');

  const normalizedWallet = walletAddress.toLowerCase();
  const normalizedHash = txHash.toLowerCase();

  const { error } = await supabase.from('point_actions').upsert({
    wallet_address: normalizedWallet,
    tx_hash: normalizedHash,
    action_type: action,
    points: action === 'swap' ? SWAP_POINTS : BRIDGE_POINTS,
    chain_id: 5042,
  }, {
    onConflict: 'tx_hash',
    ignoreDuplicates: true,
  });

  if (error) throw error;
}

export async function getPointLeaderboard(limit = 20): Promise<PointLeaderboardRow[]> {
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('point_actions')
    .select('wallet_address, action_type, points');

  if (error) throw error;

  const grouped = new Map<string, PointLeaderboardRow>();
  for (const row of data || []) {
    const walletAddress = String(row.wallet_address).toLowerCase();
    const current = grouped.get(walletAddress) || {
      walletAddress,
      swapCount: 0,
      bridgeCount: 0,
      swapPoints: 0,
      bridgePoints: 0,
      totalPoints: 0,
    };

    const action = row.action_type as PointAction;
    const points = Number(row.points) || 0;
    if (action === 'swap') {
      current.swapCount += 1;
      current.swapPoints += points;
    } else if (action === 'bridge') {
      current.bridgeCount += 1;
      current.bridgePoints += points;
    }
    current.totalPoints += points;
    grouped.set(walletAddress, current);
  }

  return [...grouped.values()]
    .sort((a, b) => b.totalPoints - a.totalPoints || b.bridgePoints - a.bridgePoints || b.swapPoints - a.swapPoints)
    .slice(0, limit);
}
