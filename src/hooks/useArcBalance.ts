import { useState, useEffect, useCallback, useRef } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { arcTestnetChain, ARC_TESTNET_RPC_URL } from '../config/arc';

export interface ArcBalanceState {
  raw: bigint;
  formatted: string;
  symbol: string;
  decimals: number;
  isLoading: boolean;
  isError: boolean;
  errorMessage: string | null;
  refetch: () => Promise<void>;
}

// Direct public client targeted strictly to Arc Testnet
const arcPublicClient = createPublicClient({
  chain: arcTestnetChain,
  transport: http(ARC_TESTNET_RPC_URL, {
    retryCount: 3,
    retryDelay: 1000,
    timeout: 10000,
  }),
});

export function useArcBalance(address: `0x${string}` | string | undefined, isArcNetwork?: boolean): ArcBalanceState {
  const [raw, setRaw] = useState<bigint>(0n);
  const [formatted, setFormatted] = useState<string>('0.00');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isError, setIsError] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Address ref to prevent race conditions during account changes
  const activeAddressRef = useRef<string | undefined>(address);
  activeAddressRef.current = address;

  const fetchBalance = useCallback(async () => {
    if (!address || !address.startsWith('0x')) {
      setRaw(0n);
      setFormatted('0.00');
      setIsLoading(false);
      setIsError(false);
      setErrorMessage(null);
      return;
    }

    const targetAddr = address as `0x${string}`;
    setIsLoading(true);
    setIsError(false);
    setErrorMessage(null);

    // 1. Try server endpoint first (server-side viem connection to Arc RPC)
    try {
      const res = await fetch(`/api/blockchain/arc/balance/${targetAddr}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (res.ok) {
        const data = await res.json();
        if (activeAddressRef.current === targetAddr && data && data.balanceUSDC) {
          setRaw(BigInt(data.rawBalance || '0'));
          setFormatted(data.balanceUSDC);
          setIsLoading(false);
          return;
        }
      }
    } catch {
      // Continue to direct public client query
    }

    // 2. Direct Viem RPC query on Arc Testnet
    try {
      const balanceWei = await arcPublicClient.getBalance({ address: targetAddr });

      // Guard against stale response if address changed mid-request
      if (activeAddressRef.current !== targetAddr) return;

      setRaw(balanceWei);
      // Native Arc gas token is USDC with 18 decimals
      const rawUnits = formatUnits(balanceWei, 18);
      const num = parseFloat(rawUnits);
      // Human-readable formatted string with 4 decimals max for clean financial display
      const displayStr = isNaN(num) ? '0.00' : num === 0 ? '0.00' : num.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 4,
      });

      setFormatted(displayStr);
      setIsLoading(false);
      return;
    } catch (rpcErr: unknown) {
      console.warn(`Viem RPC balance query failed for ${targetAddr}, trying ArcScan explorer balance:`, rpcErr);
    }

    // 3. Fallback: Direct ArcScan Blockscout API v2 address lookup
    try {
      const scanRes = await fetch(`https://testnet.arcscan.app/api/v2/addresses/${targetAddr}`, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache', Pragma: 'no-cache' },
      });
      if (scanRes.ok) {
        const scanData = await scanRes.json();
        if (activeAddressRef.current === targetAddr && scanData && scanData.coin_balance !== undefined && scanData.coin_balance !== null) {
          const balanceWei = BigInt(scanData.coin_balance);
          setRaw(balanceWei);
          const rawUnits = formatUnits(balanceWei, 18);
          const num = parseFloat(rawUnits);
          const displayStr = isNaN(num) ? '0.00' : num === 0 ? '0.00' : num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          });
          setFormatted(displayStr);
          setIsLoading(false);
          return;
        }
      }
    } catch (scanErr: unknown) {
      console.warn(`ArcScan explorer balance lookup failed for ${targetAddr}:`, scanErr);
    }

    if (activeAddressRef.current !== targetAddr) return;
    setIsError(true);
    setErrorMessage('Could not retrieve real-time Arc Testnet balance.');
    setIsLoading(false);
  }, [address]);

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  return {
    raw,
    formatted,
    symbol: 'USDC',
    decimals: 18,
    isLoading,
    isError,
    errorMessage,
    refetch: fetchBalance,
  };
}
