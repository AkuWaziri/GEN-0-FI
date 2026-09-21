export type PointAction = 'swap' | 'bridge';

export interface PointLeaderboardRow {
  walletAddress: string;
  swapCount: number;
  bridgeCount: number;
  swapPoints: number;
  bridgePoints: number;
  totalPoints: number;
}
