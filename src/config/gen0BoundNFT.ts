import { Address } from 'viem';
import { ARC_MAINNET_CHAIN_ID } from './arc';

export const GEN0_BOUND_NFT_ADDRESS = (
  (import.meta.env.VITE_GEN0_BOUND_NFT_ADDRESS || '').trim()
) as Address;

export const GEN0_BOUND_ARTWORK_URL = (
  (import.meta.env.VITE_GEN0_BOUND_ARTWORK_URL || '').trim()
);

export const GEN0_BOUND_METADATA_URI = (
  (import.meta.env.VITE_GEN0_BOUND_METADATA_URI || '').trim()
);

export const GEN0_BOUND_USDC_ADDRESS =
  '0x3600000000000000000000000000000000000000' as Address;

export const GEN0_BOUND_CHAIN_ID = ARC_MAINNET_CHAIN_ID;
export const GEN0_BOUND_MINT_PRICE = 1_000_000n;
