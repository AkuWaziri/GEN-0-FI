export const PLAYMEMES_ARC = {
  chainId: 5042,
  factory: '0xeE3E862Efde6DCd6DF5648AF0E2731B9D1dF4605' as const,
  hook: '0x20EEad6db6b3d0a4491E9073119DD0EBFF166AcC' as const,
  feeEscrow: '0x1D8c991A9019df7D72ADCd8deA6f12D600C9d02f' as const,
  launchTokenDeployer: '0xFf70918Ef17A2D74d683a8297813B177BaFaD1f4' as const,
  announcementRegistry: '0xD4942511A1587Ac3F1F0f4097e18D4BCEe73d753' as const,
  launchBuyAdapter: '0xacA9150b1ecAeddEf5cF6a24f12b060049Cec06f' as const,
  quoteToken: '0x3600000000000000000000000000000000000000' as const,
  tokenDecimals: 18,
  launchSupplyTokens: 1_000_000_000,
  tickSpacing: 200,
  baseTradeFeeBps: 100,
  creatorFeeShareBps: 5_000,
  platformFeeShareBps: 3_000,
  referrerFeeShareBps: 2_000,
  launchFeeUsdc: 2,
  antiSnipeWindowSeconds: 20,
  antiSnipeStartTotalFeeBps: 9_900,
  referrer: '0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c' as const,
  explorer: 'https://explorer.arc.io',
  verifiedAgainstO1Snapshot: '2026-09-11',
} as const;

export const PLAYMEMES_ECONOMICS = {
  tradeFeePercent: PLAYMEMES_ARC.baseTradeFeeBps / 100,
  creatorSharePercent: PLAYMEMES_ARC.creatorFeeShareBps / 100,
  platformSharePercent: PLAYMEMES_ARC.platformFeeShareBps / 100,
  referrerSharePercent: PLAYMEMES_ARC.referrerFeeShareBps / 100,
  gen0ReferralVolumePercent:
    (PLAYMEMES_ARC.baseTradeFeeBps * PLAYMEMES_ARC.referrerFeeShareBps) / 10_000,
} as const;
