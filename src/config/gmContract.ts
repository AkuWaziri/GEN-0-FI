import { isAddress } from 'viem';

export const GM_CONTRACT_ADDRESS = (
  import.meta.env.VITE_GM_CONTRACT_ADDRESS as string | undefined
) || '';

export const GM_FEE_WEI = 10000000000000000n; // 0.01 native USDC, 18 decimals

export const GM_CONTRACT_ABI = [
  {
    type: 'function',
    name: 'checkIn',
    stateMutability: 'payable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'lastCheckInDay',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'event',
    name: 'GMCheckedIn',
    anonymous: false,
    inputs: [
      { indexed: true, name: 'wallet', type: 'address' },
      { indexed: true, name: 'day', type: 'uint256' },
      { indexed: false, name: 'timestamp', type: 'uint256' },
      { indexed: false, name: 'fee', type: 'uint256' },
    ],
  },
] as const;

export const isGMContractConfigured = isAddress(GM_CONTRACT_ADDRESS);
