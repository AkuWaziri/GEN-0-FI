import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowDownUp,
  ChevronDown,
  Loader2,
  RefreshCw,
  Wallet,
} from 'lucide-react';
import { switchChain } from '@wagmi/core';
import { useAccount, useChainId } from 'wagmi';
import { wagmiConfig } from '../../config/wagmi';
import { useWallet } from '../../context/WalletContext';

type LiFiChain = {
  id: number;
  key?: string;
  name: string;
  chainType?: string;
  nativeToken?: LiFiToken;
  logoURI?: string;
};

type LiFiToken = {
  address: string;
  symbol: string;
  decimals: number;
  chainId: number;
  name?: string;
  coinKey?: string;
  priceUSD?: string;
  logoURI?: string;
};

type BalanceToken = LiFiToken & {
  amount?: string;
  amountUSD?: string;
};

const API = 'https://li.quest/v1';

const NATIVE =
  '0x0000000000000000000000000000000000000000';

function normalizeAddress(address?: string) {
  return String(address || '').toLowerCase();
}

function isTokenLike(token: any) {
  return Boolean(
    token &&
      typeof token === 'object' &&
      token.symbol &&
      (token.address || token.coinKey),
  );
}

function normalizeToken(
  token: any,
  chainId: number,
): LiFiToken | null {
  if (!isTokenLike(token)) {
    return null;
  }

  const tokenChainId = Number(token.chainId);

  if (
    Number.isFinite(tokenChainId) &&
    tokenChainId > 0 &&
    tokenChainId !== chainId
  ) {
    return null;
  }

  const decimals = Number(token.decimals);

  if (!Number.isFinite(decimals)) {
    return null;
  }

  let address = token.address
    ? String(token.address)
    : '';

  if (!address) {
    address = NATIVE;
  }

  return {
    address,
    symbol: String(token.symbol),
    decimals,
    chainId,
    name: token.name
      ? String(token.name)
      : undefined,
    coinKey: token.coinKey
      ? String(token.coinKey)
      : undefined,
    priceUSD:
      token.priceUSD !== undefined &&
      token.priceUSD !== null
        ? String(token.priceUSD)
        : undefined,
    logoURI: token.logoURI
      ? String(token.logoURI)
      : undefined,
  };
}

function extractTokens(
  data: any,
  chainId: number,
): LiFiToken[] {
  const candidates: any[] = [];

  const addArray = (value: any) => {
    if (Array.isArray(value)) {
      candidates.push(...value);
    }
  };

  const addChainObject = (value: any) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value)
    ) {
      addArray(value[String(chainId)]);
    }
  };

  if (Array.isArray(data)) {
    addArray(data);
  }

  if (data && typeof data === 'object') {
    addArray(data.tokens);

    addChainObject(data.tokens);

    addArray(data[String(chainId)]);

    addChainObject(data.chains);

    if (
      data.data &&
      typeof data.data === 'object'
    ) {
      addArray(data.data.tokens);

      addChainObject(data.data.tokens);

      addArray(
        data.data[String(chainId)],
      );
    }
  }

  const normalized = candidates
    .map((token) =>
      normalizeToken(token, chainId),
    )
    .filter(
      (token): token is LiFiToken =>
        Boolean(token),
    );

  const seen = new Set<string>();

  return normalized.filter((token) => {
    const key = [
      normalizeAddress(token.address),
      token.symbol.toUpperCase(),
      String(chainId),
    ].join(':');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function formatBalance(
  amount: string | undefined,
  decimals: number,
) {
  if (!amount) {
    return '0';
  }

  try {
    const raw = BigInt(amount);

    if (raw === 0n) {
      return '0';
    }

    const divisor = 10 ** decimals;

    if (!Number.isFinite(divisor)) {
      return '0';
    }

    const value = Number(raw) / divisor;

    if (!Number.isFinite(value)) {
      return '0';
    }

    return value.toLocaleString('en-US', {
      maximumFractionDigits: 6,
    });
  } catch {
    return '0';
  }
}

function tokenBalanceFor(
  balances: Record<string, BalanceToken[]> | null,
  chainId: number,
  token: LiFiToken | null,
) {
  if (!balances || !token) {
    return null;
  }

  const items =
    balances[String(chainId)] || [];

  const address = normalizeAddress(
    token.address,
  );

  const found = items.find(
    (item) =>
      normalizeAddress(item.address) ===
      address,
  );

  if (found) {
    return found;
  }

  if (address === NATIVE) {
    return (
      items.find(
        (item) =>
          normalizeAddress(item.address) ===
            NATIVE ||
          item.coinKey === token.coinKey,
      ) || null
    );
  }

  return null;
}

function findPreferredToken(
  tokens: LiFiToken[],
  preferredSymbol = 'USDC',
) {
  return (
    tokens.find(
      (token) =>
        token.symbol?.toUpperCase() ===
          preferredSymbol &&
        token.chainId,
    ) ||
    tokens.find(
      (token) =>
        token.coinKey?.toUpperCase() ===
          preferredSymbol &&
        token.chainId,
    ) ||
    tokens[0] ||
    null
  );
}

export const SwapView: React.FC = () => {
  const {
    address,
    isConnected,
    connectWallet,
  } = useWallet();

  const connectedChainId = useChainId();

  const {
    isConnected: wagmiConnected,
  } = useAccount();

  const [chains, setChains] =
    useState<LiFiChain[]>([]);

  const [fromChainId, setFromChainId] =
    useState(5042);

  const [toChainId, setToChainId] =
    useState(8453);

  const [fromTokens, setFromTokens] =
    useState<LiFiToken[]>([]);

  const [toTokens, setToTokens] =
    useState<LiFiToken[]>([]);

  const [fromToken, setFromToken] =
    useState<LiFiToken | null>(null);

  const [toToken, setToToken] =
    useState<LiFiToken | null>(null);

  const [balances, setBalances] =
    useState<
      Record<string, BalanceToken[]> | null
    >(null);

  const [amount, setAmount] =
    useState('');

  const [
    loadingChains,
    setLoadingChains,
  ] = useState(true);

  const [
    loadingFromTokens,
    setLoadingFromTokens,
  ] = useState(false);

  const [
    loadingToTokens,
    setLoadingToTokens,
  ] = useState(false);

  const [
    loadingBalances,
    setLoadingBalances,
  ] = useState(false);

  const [
    fromTokenError,
    setFromTokenError,
  ] = useState<string | null>(null);

  const [
    toTokenError,
    setToTokenError,
  ] = useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [quote, setQuote] =
    useState<any>(null);

  const [quoting, setQuoting] =
    useState(false);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const fromBalance =
    tokenBalanceFor(
      balances,
      fromChainId,
      fromToken,
    );

  const fetchJson = async (
    url: string,
  ) => {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    });

    if (!response.ok) {
      let message = `LI.FI request failed (${response.status})`;

      try {
        const body =
          await response.json();

        if (body?.message) {
          message = body.message;
        } else if (body?.error) {
          message =
            typeof body.error === 'string'
              ? body.error
              : message;
        }
      } catch {
        // Keep HTTP status message.
      }

      throw new Error(message);
    }

    return response.json();
  };

  /*
   * CHAIN LOADER
   */
  useEffect(() => {
    let cancelled = false;

    setLoadingChains(true);
    setError(null);

    fetchJson(
      `${API}/chains?chainTypes=EVM`,
    )
      .then((data) => {
        if (cancelled) {
          return;
        }

        const rawList =
          Array.isArray(data)
            ? data
            : Array.isArray(data?.chains)
              ? data.chains
              : [];

        const supported =
          rawList
            .filter(
              (chain: any) =>
                Number(chain?.id) &&
                chain?.name,
            )
            .map(
              (
                chain: any,
              ): LiFiChain => ({
                id: Number(chain.id),
                key: chain.key,
                name: String(
                  chain.name,
                ),
                chainType:
                  chain.chainType,
                nativeToken:
                  chain.nativeToken,
                logoURI:
                  chain.logoURI,
              }),
            )
            .sort(
              (
                a: LiFiChain,
                b: LiFiChain,
              ) =>
                a.name.localeCompare(
                  b.name,
                ),
            );

        setChains(supported);

        if (
          supported.length > 0 &&
          !supported.some(
            (chain) =>
              chain.id ===
              fromChainId,
          )
        ) {
          setFromChainId(
            supported[0].id,
          );
        }

        if (
          supported.length > 0 &&
          !supported.some(
            (chain) =>
              chain.id ===
              toChainId,
          )
        ) {
          const destination =
            supported.find(
              (chain) =>
                chain.id !==
                fromChainId,
            ) ||
            supported[0];

          setToChainId(
            destination.id,
          );
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(
            err instanceof Error
              ? err.message
              : 'Unable to load LI.FI chains.',
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingChains(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  /*
   * SOURCE TOKEN LOADER
   */
  useEffect(() => {
    let cancelled = false;

    setLoadingFromTokens(true);
    setFromTokenError(null);
    setFromTokens([]);
    setFromToken(null);

    const loadSourceTokens =
      async () => {
        try {
          const data =
            await fetchJson(
              `${API}/tokens?chains=${encodeURIComponent(
                String(fromChainId),
              )}&chainTypes=EVM`,
            );

          if (cancelled) {
            return;
          }

          const tokens =
            extractTokens(
              data,
              fromChainId,
            );

          const selectedChain =
            chains.find(
              (chain) =>
                chain.id ===
                fromChainId,
            );

          if (
            selectedChain?.nativeToken
          ) {
            const nativeToken =
              normalizeToken(
                {
                  ...selectedChain.nativeToken,
                  address:
                    selectedChain
                      .nativeToken
                      .address ||
                    NATIVE,
                  chainId:
                    fromChainId,
                },
                fromChainId,
              );

            if (nativeToken) {
              const exists =
                tokens.some(
                  (token) =>
                    normalizeAddress(
                      token.address,
                    ) ===
                    normalizeAddress(
                      nativeToken.address,
                    ),
                );

              if (!exists) {
                tokens.unshift(
                  nativeToken,
                );
              }
            }
          }

          if (cancelled) {
            return;
          }

          if (tokens.length === 0) {
            setFromTokenError(
              `LI.FI returned no supported tokens for ${
                selectedChain?.name ||
                `chain ${fromChainId}`
              }.`,
            );
          }

          setFromTokens(tokens);
          setFromToken(
            findPreferredToken(
              tokens,
            ),
          );
        } catch (err) {
          if (cancelled) {
            return;
          }

          setFromTokens([]);
          setFromToken(null);

          setFromTokenError(
            err instanceof Error
              ? err.message
              : 'Unable to load source tokens from LI.FI.',
          );
        } finally {
          if (!cancelled) {
            setLoadingFromTokens(false);
          }
        }
      };

    void loadSourceTokens();

    return () => {
      cancelled = true;
    };
  }, [
    fromChainId,
    chains,
    refreshKey,
  ]);

  /*
   * DESTINATION TOKEN LOADER
   */
  useEffect(() => {
    let cancelled = false;

    setLoadingToTokens(true);
    setToTokenError(null);
    setToTokens([]);
    setToToken(null);

    const loadDestinationTokens =
      async () => {
        try {
          const data =
            await fetchJson(
              `${API}/tokens?chains=${encodeURIComponent(
                String(toChainId),
              )}&chainTypes=EVM`,
            );

          if (cancelled) {
            return;
          }

          const tokens =
            extractTokens(
              data,
              toChainId,
            );

          const selectedChain =
            chains.find(
              (chain) =>
                chain.id ===
                toChainId,
            );

          if (
            selectedChain?.nativeToken
          ) {
            const nativeToken =
              normalizeToken(
                {
                  ...selectedChain.nativeToken,
                  address:
                    selectedChain
                      .nativeToken
                      .address ||
                    NATIVE,
                  chainId:
                    toChainId,
                },
                toChainId,
              );

            if (nativeToken) {
              const exists =
                tokens.some(
                  (token) =>
                    normalizeAddress(
                      token.address,
                    ) ===
                    normalizeAddress(
                      nativeToken.address,
                    ),
                );

              if (!exists) {
                tokens.unshift(
                  nativeToken,
                );
              }
            }
          }

          if (cancelled) {
            return;
          }

          if (tokens.length === 0) {
            setToTokenError(
              `LI.FI returned no supported tokens for ${
                selectedChain?.name ||
                `chain ${toChainId}`
              }.`,
            );
          }

          setToTokens(tokens);
          setToToken(
            findPreferredToken(
              tokens,
            ),
          );
        } catch (err) {
          if (cancelled) {
            return;
          }

          setToTokens([]);
          setToToken(null);

          setToTokenError(
            err instanceof Error
              ? err.message
              : 'Unable to load destination tokens from LI.FI.',
          );
        } finally {
          if (!cancelled) {
            setLoadingToTokens(false);
          }
        }
      };

    void loadDestinationTokens();

    return () => {
      cancelled = true;
    };
  }, [
    toChainId,
    chains,
    refreshKey,
  ]);

  /*
   * REAL LI.FI WALLET BALANCES
   */
  useEffect(() => {
    if (!address) {
      setBalances(null);
      return;
    }

    let cancelled = false;

    setLoadingBalances(true);

    fetchJson(
      `${API}/wallets/${encodeURIComponent(
        address,
      )}/balances`,
    )
      .then((data) => {
        if (cancelled) {
          return;
        }

        const balanceData =
          data?.balances &&
          typeof data.balances ===
            'object'
            ? data.balances
            : data;

        setBalances(
          balanceData &&
            typeof balanceData ===
              'object'
            ? balanceData
            : {},
        );
      })
      .catch(() => {
        if (!cancelled) {
          setBalances(null);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoadingBalances(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [address]);

  const fromChain = useMemo(
    () =>
      chains.find(
        (chain) =>
          chain.id ===
          fromChainId,
      ),
    [chains, fromChainId],
  );

  const toChain = useMemo(
    () =>
      chains.find(
        (chain) =>
          chain.id ===
          toChainId,
      ),
    [chains, toChainId],
  );

  const requestQuote =
    async () => {
      if (
        !address ||
        !fromToken ||
        !toToken ||
        !amount ||
        Number(amount) <= 0
      ) {
        return;
      }

      setQuoting(true);
      setQuote(null);
      setError(null);

      try {
        const [
          whole,
          fraction = '',
        ] = amount
          .trim()
          .split('.');

        const paddedFraction =
          fraction
            .slice(
              0,
              fromToken.decimals,
            )
            .padEnd(
              fromToken.decimals,
              '0',
            );

        const rawAmount =
          BigInt(
            `${whole || '0'}${paddedFraction}`,
          ).toString();

        const params =
          new URLSearchParams({
            fromChain:
              String(fromChainId),
            toChain:
              String(toChainId),
            fromToken:
              fromToken.address,
            toToken:
              toToken.address,
            fromAddress:
              address,
            toAddress:
              address,
            fromAmount:
              rawAmount,
            integrator:
              'GEN-0FI',
          });

        const data =
          await fetchJson(
            `${API}/quote?${params.toString()}`,
          );

        setQuote(data);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'No LI.FI route is available for this selection.',
        );
      } finally {
        setQuoting(false);
      }
    };

  const switchFromChain =
    async () => {
      try {
        await switchChain(
          wagmiConfig,
          {
            chainId:
              fromChainId,
          },
        );
      } catch {
        setError(
          'Your wallet could not switch to the selected source chain.',
        );
      }
    };

  const swapSides = () => {
    const previousFromChain =
      fromChainId
