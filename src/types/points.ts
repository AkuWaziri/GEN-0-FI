export type PointAction = 'swap' | 'bridge' | 'send' | 'nft_mint' | 'coin_launch';

export interface PointLeaderboardRow {
  walletAddress: string;
  swapCount: number;
  bridgeCount: number;
  sendCount: number;
  nftMintCount: number;
  coinLaunchCount: number;
  swapPoints: number;
  bridgePoints: number;
  sendPoints: number;
  nftMintPoints: number;
  coinLaunchPoints: number;
  totalPoints: number;
}
