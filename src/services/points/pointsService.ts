import { supabase } from '../../lib/supabase';
import type { PointAction, PointLeaderboardRow } from '../../types/points';

export const POINT_VALUES: Record<PointAction, number> = {
  swap: 50,
  bridge: 100,
  send: 50,
  nft_mint: 1000,
  coin_launch: 500,
};

export const SWAP_POINTS = POINT_VALUES.swap;
export const BRIDGE_POINTS = POINT_VALUES.bridge;
export const SEND_POINTS = POINT_VALUES.send;
export const NFT_MINT_POINTS = POINT_VALUES.nft_mint;
export const COIN_LAUNCH_POINTS = POINT_VALUES.coin_launch;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function recordConfirmedAction(
  walletAddress: string,
  txHash: string,
  action: PointAction,
  chainId = 5042,
): Promise<void> {
  if (!supabase) throw new Error('Points indexing is not configured.');

  const normalizedWallet = walletAddress.toLowerCase();
  const normalizedHash = txHash.toLowerCase();
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { error } = await supabase.from('point_actions').upsert({
      wallet_address: normalizedWallet,
      tx_hash: normalizedHash,
      action_type: action,
      points: POINT_VALUES[action],
      chain_id: chainId,
    }, {
      onConflict: 'tx_hash',
      ignoreDuplicates: true,
    });

    if (!error) return;
    lastError = error;
    if (attempt < 3) await sleep(500 * 2 ** attempt);
  }

  throw lastError instanceof Error ? lastError : new Error('Points indexing failed after retries.');
}

export async function getPointLeaderboard(limit = 50): Promise<PointLeaderboardRow[]> {
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
      sendCount: 0,
      nftMintCount: 0,
      coinLaunchCount: 0,
      swapPoints: 0,
      bridgePoints: 0,
      sendPoints: 0,
      nftMintPoints: 0,
      coinLaunchPoints: 0,
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
    } else if (action === 'send') {
      current.sendCount += 1;
      current.sendPoints += points;
    } else if (action === 'nft_mint') {
      current.nftMintCount += 1;
      current.nftMintPoints += points;
    } else if (action === 'coin_launch') {
      current.coinLaunchCount += 1;
      current.coinLaunchPoints += points;
    }

    current.totalPoints += points;
    grouped.set(walletAddress, current);
  }

  return [...grouped.values()]
    .sort((a, b) => b.totalPoints - a.totalPoints || b.nftMintPoints - a.nftMintPoints || b.bridgePoints - a.bridgePoints || b.swapPoints - a.swapPoints)
    .slice(0, limit);
}
