import { Address } from 'viem';
import { ARC_MAINNET_CHAIN_ID } from './arc';

export const GEN0_BOUND_NFT_ADDRESS = (
  (import.meta.env.VITE_GEN0_BOUND_NFT_ADDRESS || '0x02Acc0f0e5bdC1757710dF93F3fabD3Ad88C9b9C').trim()
) as Address;

export const GEN0_BOUND_ARTWORK_URL = (
  (import.meta.env.VITE_GEN0_BOUND_ARTWORK_URL || 'https://kommodo.ai/i/A3GKVydqmhZ9K5RbRKvh').trim()
);

export const GEN0_BOUND_METADATA_URI = (
  (import.meta.env.VITE_GEN0_BOUND_METADATA_URI || 'ipfs://bafkreibcmwuncoiw2fjfraxj7kyp6s56sqbnyiqx72i55jmwmmzpenuudm').trim()
);

export const GEN0_BOUND_USDC_ADDRESS =
  '0x3600000000000000000000000000000000000000' as Address;

export const GEN0_BOUND_FEE_WALLET =
  '0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c' as Address;

export const GEN0_BOUND_CHAIN_ID = ARC_MAINNET_CHAIN_ID;
export const GEN0_BOUND_MINT_PRICE = 1_000_000n;
