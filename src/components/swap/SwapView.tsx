import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useAccount, useChainId, useSwitchChain } from 'wagmi';

import { useWallet } from '../../context/WalletContext';

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

type LiFiChain = {
  id: number;
  key?: string;
  name: string;
  chainType?: string;
  nativeToken?: LiFiToken;
  logoURI?: string;
};

type MenuRect = {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
};

const API = 'https://li.quest/v1';

const ARC_MAINNET_ID = 5042;
const BASE_ID = 8453;

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

  const address =
    token.address ||
    token.coinKey ||
    NATIVE;

  return {
    address: String(address),
    symbol: String(token.symbol || '').toUpperCase(),
    decimals: Number.isFinite(Number(token.decimals))
      ? Number(token.decimals)
      : 18,
    chainId: Number(token.chainId || chainId),
    name: token.name
      ? String(token.name)
      : undefined,
    coinKey: token.coinKey
      ? String(token.coinKey)
      : undefined,
    priceUSD: token.priceUSD
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

  if (Array.isArray(data)) {
    candidates.push(...data);
  }

  if (Array.isArray(data?.tokens)) {
    candidates.push(...data.tokens);
  }

  if (data?.tokens && typeof data.tokens === 'object') {
    const chainEntry =
      data.tokens[String(chainId)] ??
      data.tokens[chainId];

    if (Array.isArray(chainEntry)) {
      candidates.push(...chainEntry);
    }
  }

  if (Array.isArray(data?.data)) {
    candidates.push(...data.data);
  }

  const seen = new Set<string>();
  const result: LiFiToken[] = [];

  for (const candidate of candidates) {
    const token = normalizeToken(candidate, chainId);

    if (!token) {
      continue;
    }

    const key =
      `${token.chainId}:${normalizeAddress(token.address)}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(token);
  }

  return result;
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
    const divisor = 10 ** decimals;
    const value = Number(raw) / divisor;

    if (!Number.isFinite(value)) {
      return '0';
    }

    if (value === 0) {
      return '0';
    }

    if (value < 0.000001) {
      return '<0.000001';
    }

    return value.toLocaleString(undefined, {
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

  const chainBalances =
    balances[String(chainId)] || [];

  const tokenAddress =
    normalizeAddress(token.address);

  return (
    chainBalances.find(
      item =>
        normalizeAddress(item.address) ===
        tokenAddress,
    ) || null
  );
}

function findPreferredToken(
  tokens: LiFiToken[],
  preferredSymbol = 'USDC',
) {
  if (tokens.length === 0) {
    return null;
  }

  return (
    tokens.find(
      token =>
        token.symbol.toUpperCase() ===
        preferredSymbol.toUpperCase(),
    ) ||
    tokens.find(
      token =>
        token.symbol.toUpperCase() === 'USDT',
    ) ||
    tokens[0]
  );
}

function formatQuoteAmount(
  amount: string | undefined,
  decimals = 18,
) {
  if (!amount) {
    return '';
  }

  try {
    const raw = BigInt(amount);
    const divisor = 10 ** decimals;
    const value = Number(raw) / divisor;

    if (!Number.isFinite(value)) {
      return '';
    }

    return value.toLocaleString(undefined, {
      maximumFractionDigits: 6,
    });
  } catch {
    return '';
  }
}

export const SwapView: React.FC = () => {
  const {
    address,
    isConnected,
    connectWallet,
  } = useWallet();

  const connectedChainId = useChainId();
  const { isConnected: wagmiConnected } =
    useAccount();

  const { switchChainAsync } =
    useSwitchChain();

  const [chains, setChains] =
    useState<LiFiChain[]>([]);

  const [fromChainId, setFromChainId] =
    useState<number>(ARC_MAINNET_ID);

  const [toChainId, setToChainId] =
    useState<number>(BASE_ID);

  const [fromTokens, setFromTokens] =
    useState<LiFiToken[]>([]);

  const [toTokens, setToTokens] =
    useState<LiFiToken[]>([]);

  const [fromToken, setFromToken] =
    useState<LiFiToken | null>(null);

  const [toToken, setToToken] =
    useState<LiFiToken | null>(null);

  const [balances, setBalances] =
    useState<Record<string, BalanceToken[]> | null>(
      null,
    );

  const [amount, setAmount] =
    useState('');

  const [loadingChains, setLoadingChains] =
    useState(true);

  const [loadingFromTokens, setLoadingFromTokens] =
    useState(false);

  const [loadingToTokens, setLoadingToTokens] =
    useState(false);

  const [loadingBalances, setLoadingBalances] =
    useState(false);

  const [fromTokenError, setFromTokenError] =
    useState<string | null>(null);

  const [toTokenError, setToTokenError] =
    useState<string | null>(null);

  const [error, setError] =
    useState<string | null>(null);

  const [quote, setQuote] =
    useState<any>(null);

  const [quoting, setQuoting] =
    useState(false);

  const [refreshKey, setRefreshKey] =
    useState(0);

  const warmWhite =
    document.documentElement.classList.contains(
      'white',
    );

  const fetchJson = async (url: string) => {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      let message =
        `Request failed with ${response.status}`;

      try {
        const body = await response.json();

        if (body?.message) {
          message = String(body.message);
        } else if (body?.error) {
          message = String(body.error);
        }
      } catch {
        // Keep the HTTP status message.
      }

      throw new Error(message);
    }

    return response.json();
  };

  useEffect(() => {
    let cancelled = false;

    setLoadingChains(true);
    setError(null);

    fetchJson(
      `${API}/chains?chainTypes=EVM`,
    )
      .then(data => {
        if (cancelled) {
          return;
        }

        const rawList = Array.isArray(data)
          ? data
          : Array.isArray(data?.chains)
            ? data.chains
            : [];

        const supported: LiFiChain[] =
          rawList
            .filter(
              (chain: any) =>
                chain &&
                Number.isFinite(
                  Number(chain.id),
                ) &&
                chain.name,
            )
            .map((chain: any) => {
              const nativeToken =
                normalizeToken(
                  chain.nativeToken,
                  Number(chain.id),
                ) || undefined;

              return {
                id: Number(chain.id),
                key: chain.key
                  ? String(chain.key)
                  : undefined,
                name: String(chain.name),
                chainType: chain.chainType
                  ? String(chain.chainType)
                  : undefined,
                nativeToken,
                logoURI: chain.logoURI
                  ? String(chain.logoURI)
                  : undefined,
              };
            })
            .sort((a, b) =>
              a.name.localeCompare(b.name),
            );

        setChains(supported);

        if (
          supported.length > 0 &&
          !supported.some(
            chain =>
              chain.id === fromChainId,
          )
        ) {
          const arc =
            supported.find(
              chain =>
                chain.id === ARC_MAINNET_ID,
            );

          setFromChainId(
            arc?.id ?? supported[0].id,
          );
        }

        if (
          supported.length > 0 &&
          !supported.some(
            chain =>
              chain.id === toChainId,
          )
        ) {
          const base =
            supported.find(
              chain =>
                chain.id === BASE_ID &&
                chain.id !== fromChainId,
            );

          const destination =
            base ||
            supported.find(
              chain =>
                chain.id !== fromChainId,
            ) ||
            supported[0];

          setToChainId(destination.id);
        }
      })
      .catch(err => {
        if (cancelled) {
          return;
        }

        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load supported chains.',
        );
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
              chain =>
                chain.id === fromChainId,
            );

          if (
            selectedChain?.nativeToken
          ) {
            const native =
              selectedChain.nativeToken;

            const exists =
              tokens.some(
                token =>
                  normalizeAddress(
                    token.address,
                  ) ===
                  normalizeAddress(
                    native.address,
                  ),
              );

            if (!exists) {
              tokens.unshift(native);
            }
          }

          if (tokens.length === 0) {
            setFromTokenError(
              'No tokens are available for this chain.',
            );
          }

          setFromTokens(tokens);
          setFromToken(
            findPreferredToken(tokens),
          );
        } catch (err) {
          if (cancelled) {
            return;
          }

          setFromTokenError(
            err instanceof Error
              ? err.message
              : 'Unable to load tokens.',
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
  }, [fromChainId, chains, refreshKey]);

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
              chain =>
                chain.id === toChainId,
            );

          if (
            selectedChain?.nativeToken
          ) {
            const native =
              selectedChain.nativeToken;

            const exists =
              tokens.some(
                token =>
                  normalizeAddress(
                    token.address,
                  ) ===
                  normalizeAddress(
                    native.address,
                  ),
              );

            if (!exists) {
              tokens.unshift(native);
            }
          }

          if (tokens.length === 0) {
            setToTokenError(
              'No tokens are available for this chain.',
            );
          }

          setToTokens(tokens);
          setToToken(
            findPreferredToken(tokens),
          );
        } catch (err) {
          if (cancelled) {
            return;
          }

          setToTokenError(
            err instanceof Error
              ? err.message
              : 'Unable to load tokens.',
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
  }, [toChainId, chains, refreshKey]);

  useEffect(() => {
    let cancelled = false;

    if (!address) {
      setBalances(null);
      return;
    }

    setLoadingBalances(true);

    fetchJson(
      `${API}/wallets/${encodeURIComponent(
        address,
      )}/balances`,
    )
      .then(data => {
        if (cancelled) {
          return;
        }

        const nextBalances: Record<
          string,
          BalanceToken[]
        > = {};

        if (
          data &&
          typeof data.balances === 'object' &&
          !Array.isArray(data.balances)
        ) {
          for (const [
            chainKey,
            value,
          ] of Object.entries(
            data.balances,
          )) {
            if (!Array.isArray(value)) {
              continue;
            }

            nextBalances[
              String(chainKey)
            ] = value
              .map(item =>
                normalizeToken(
                  item,
                  Number(chainKey),
                )
                  ? {
                      ...(normalizeToken(
                        item,
                        Number(chainKey),
                      ) as LiFiToken),
                      amount:
                        item.amount != null
                          ? String(
                              item.amount,
                            )
                          : undefined,
                      amountUSD:
                        item.amountUSD !=
                        null
                          ? String(
                              item.amountUSD,
                            )
                          : undefined,
                    }
                  : null,
              )
              .filter(
                Boolean,
              ) as BalanceToken[];
          }
        }

        if (
          Array.isArray(data?.balances)
        ) {
          for (const item of data.balances) {
            const chainId =
              Number(
                item?.chainId,
              );

            if (!Number.isFinite(chainId)) {
              continue;
            }

            const token =
              normalizeToken(
                item,
                chainId,
              );

            if (!token) {
              continue;
            }

            if (
              !nextBalances[
                String(chainId)
              ]
            ) {
              nextBalances[
                String(chainId)
              ] = [];
            }

            nextBalances[
              String(chainId)
            ].push({
              ...token,
              amount:
                item.amount != null
                  ? String(item.amount)
                  : undefined,
              amountUSD:
                item.amountUSD != null
                  ? String(
                      item.amountUSD,
                    )
                  : undefined,
            });
          }
        }

        setBalances(nextBalances);
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
  }, [address, refreshKey]);

  const fromChain = useMemo(
    () =>
      chains.find(
        chain =>
          chain.id === fromChainId,
      ) || null,
    [chains, fromChainId],
  );

  const toChain = useMemo(
    () =>
      chains.find(
        chain =>
          chain.id === toChainId,
      ) || null,
    [chains, toChainId],
  );

  const fromBalance = useMemo(
    () =>
      tokenBalanceFor(
        balances,
        fromChainId,
        fromToken,
      ),
    [
      balances,
      fromChainId,
      fromToken,
    ],
  );

  const toBalance = useMemo(
    () =>
      tokenBalanceFor(
        balances,
        toChainId,
        toToken,
      ),
    [
      balances,
      toChainId,
      toToken,
    ],
  );

  const requestQuote =
    async () => {
      setError(null);
      setQuote(null);

      if (!isConnected || !address) {
        setError(
          'Connect your wallet before requesting a quote.',
        );
        return;
      }

      if (!fromToken || !toToken) {
        setError(
          'Select both tokens before requesting a quote.',
        );
        return;
      }

      if (
        !amount ||
        Number(amount) <= 0
      ) {
        setError(
          'Enter an amount greater than zero.',
        );
        return;
      }

      if (
        fromChainId === toChainId &&
        normalizeAddress(
          fromToken.address,
        ) ===
          normalizeAddress(
            toToken.address,
          )
      ) {
        setError(
          'Choose different assets for the swap.',
        );
        return;
      }

      try {
        setQuoting(true);

        const numericAmount =
          Number(amount);

        if (
          !Number.isFinite(
            numericAmount,
          )
        ) {
          throw new Error(
            'Enter a valid amount.',
          );
        }

        const amountInBaseUnits =
          BigInt(
            Math.floor(
              numericAmount *
                10 ** fromToken.decimals,
            ),
          ).toString();

        const params =
          new URLSearchParams({
            fromChain: String(
              fromChainId,
            ),
            toChain: String(
              toChainId,
            ),
            fromToken:
              fromToken.address,
            toToken:
              toToken.address,
            fromAmount:
              amountInBaseUnits,
            fromAddress: address,
            toAddress: address,
            order: 'RECOMMENDED',
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
            : 'Unable to get a LI.FI quote.',
        );
      } finally {
        setQuoting(false);
      }
    };

  const switchFromChain =
    async () => {
      try {
        setError(null);

        await switchChainAsync({
          chainId: fromChainId,
        });
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to switch wallet network.',
        );
      }
    };

  const swapSides = () => {
    setFromChainId(toChainId);
    setToChainId(fromChainId);

    setFromToken(toToken);
    setToToken(fromToken);

    setAmount('');
    setQuote(null);
    setError(null);
  };

  const refreshData = () => {
    setError(null);
    setQuote(null);
    setBalances(null);
    setRefreshKey(
      value => value + 1,
    );
  };

  const connectedToSource =
    connectedChainId === fromChainId;

  const canQuote =
    Boolean(
      isConnected &&
        address &&
        fromToken &&
        toToken &&
        amount &&
        Number(amount) > 0,
    );

  return (
    <div
      className={
        warmWhite
          ? 'min-h-full bg-[#f1e8da] text-[#2b2925]'
          : 'min-h-full bg-[#090a0d] text-white'
      }
    >
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Swap &amp; Bridge
            </h1>

            <p
              className={
                warmWhite
                  ? 'mt-1 text-sm text-[#756b5d]'
                  : 'mt-1 text-sm text-zinc-400'
              }
            >
              Swap assets or move them across supported
              chains through LI.FI.
            </p>
          </div>

          <button
            type="button"
            onClick={refreshData}
            className={
              warmWhite
                ? 'rounded-lg border border-[#c8b99f] bg-[#e5d8c4] px-3 py-2 text-xs font-medium text-[#39352f] transition hover:bg-[#ddd0bb]'
                : 'rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-xs font-medium text-zinc-200 transition hover:bg-zinc-800'
            }
          >
            Refresh
          </button>
        </div>

        {!isConnected ? (
          <div
            className={
              warmWhite
                ? 'rounded-2xl border border-[#cdbda5] bg-[#e6dac8] p-8 text-center'
                : 'rounded-2xl border border-zinc-800 bg-[#111318] p-8 text-center'
            }
          >
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-500/10 text-xl">
              ⇄
            </div>

            <h2 className="text-lg font-semibold">
              Connect your wallet
            </h2>

            <p
              className={
                warmWhite
                  ? 'mx-auto mt-2 max-w-md text-sm text-[#756b5d]'
                  : 'mx-auto mt-2 max-w-md text-sm text-zinc-400'
              }
            >
              Connect your wallet to view balances,
              request routes, swap assets, and bridge
              across supported chains.
            </p>

            <button
              type="button"
              onClick={connectWallet}
              className="mt-5 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-500"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div
              className={
                warmWhite
                  ? 'rounded-2xl border border-[#cdbda5] bg-[#e6dac8] p-4'
                  : 'rounded-2xl border border-zinc-800 bg-[#111318] p-4'
              }
            >
              <div className="mb-3 flex items-center justify-between">
                <span
                  className={
                    warmWhite
                      ? 'text-xs font-medium text-[#756b5d]'
                      : 'text-xs font-medium text-zinc-500'
                  }
                >
                  FROM
                </span>

                <span
                  className={
                    warmWhite
                      ? 'max-w-[180px] truncate text-xs text-[#756b5d]'
                      : 'max-w-[180px] truncate text-xs text-zinc-500'
                  }
                >
                  {address}
                </span>
              </div>

              <TokenPanel
                side="from"
                chain={fromChain}
                chainId={fromChainId}
                token={fromToken}
                tokens={fromTokens}
                chains={chains}
                amount={amount}
                setAmount={setAmount}
                setChainId={setFromChainId}
                setToken={setFromToken}
                balance={fromBalance}
                loadingTokens={loadingFromTokens}
                loadingChains={loadingChains}
                error={fromTokenError}
                balancesLoading={loadingBalances}
              />
            </div>

            <div className="relative flex justify-center">
              <button
                type="button"
                onClick={swapSides}
                aria-label="Swap source and destination"
                className={
                  warmWhite
                    ? 'relative z-10 -my-1 flex h-10 w-10 items-center justify-center rounded-full border border-[#c7b79d] bg-[#f1e8da] text-[#403a32] shadow-sm transition hover:bg-[#e6dac8]'
                    : 'relative z-10 -my-1 flex h-10 w-10 items-center justify-center rounded-full border border-zinc-700 bg-[#15171c] text-zinc-200 shadow-lg transition hover:bg-zinc-800'
                }
              >
                ⇅
              </button>
            </div>

            <div
              className={
                warmWhite
                  ? 'rounded-2xl border border-[#cdbda5] bg-[#e6dac8] p-4'
                  : 'rounded-2xl border border-zinc-800 bg-[#111318] p-4'
              }
            >
              <div className="mb-3 flex items-center justify-between">
                <span
                  className={
                    warmWhite
                      ? 'text-xs font-medium text-[#756b5d]'
                      : 'text-xs font-medium text-zinc-500'
                  }
                >
                  TO
                </span>

                <span
                  className={
                    warmWhite
                      ? 'text-xs text-[#756b5d]'
                      : 'text-xs text-zinc-500'
                  }
                >
                  {toChain?.name ||
                    'Destination chain'}
                </span>
              </div>

              <TokenPanel
                side="to"
                chain={toChain}
                chainId={toChainId}
                token={toToken}
                tokens={toTokens}
                chains={chains}
                amount=""
                setAmount={() => undefined}
                setChainId={setToChainId}
                setToken={setToToken}
                balance={toBalance}
                loadingTokens={loadingToTokens}
                loadingChains={loadingChains}
                error={toTokenError}
                balancesLoading={loadingBalances}
                readOnlyAmount
              />
            </div>

            {!connectedToSource && (
              <div
                className={
                  warmWhite
                    ? 'rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900'
                    : 'rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200'
                }
              >
                Your wallet is currently connected to{' '}
                <strong>
                  chain {connectedChainId}
                </strong>
                . Switch to{' '}
                <strong>
                  {fromChain?.name ||
                    `chain ${fromChainId}`}
                </strong>{' '}
                before requesting a route.
                <button
                  type="button"
                  onClick={switchFromChain}
                  className="ml-2 font-semibold underline underline-offset-2"
                >
                  Switch network
                </button>
              </div>
            )}

            {error && (
              <div
                className={
                  warmWhite
                    ? 'rounded-xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-800'
                    : 'rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300'
                }
              >
                {error}
              </div>
            )}

            <button
              type="button"
              disabled={!canQuote || quoting}
              onClick={requestQuote}
              className="w-full rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {quoting
                ? 'Finding best route...'
                : 'Get Quote'}
            </button>

            {quote && (
              <QuoteCard
                quote={quote}
                fromToken={fromToken}
                toToken={toToken}
                warmWhite={warmWhite}
              />
            )}

            {!wagmiConnected && (
              <div
                className={
                  warmWhite
                    ? 'text-center text-xs text-[#756b5d]'
                    : 'text-center text-xs text-zinc-500'
                }
              >
                Wallet connection is required to
                execute a route.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

type TokenPanelProps = {
  side: 'from' | 'to';
  chain: LiFiChain | null;
  chainId: number;
  token: LiFiToken | null;
  tokens: LiFiToken[];
  chains: LiFiChain[];
  amount: string;
  setAmount: (value: string) => void;
  setChainId: (value: number) => void;
  setToken: (value: LiFiToken) => void;
  balance: BalanceToken | null;
  loadingTokens: boolean;
  loadingChains: boolean;
  error: string | null;
  balancesLoading: boolean;
  readOnlyAmount?: boolean;
};

function TokenPanel({
  side,
  chain,
  chainId,
  token,
  tokens,
  chains,
  amount,
  setAmount,
  setChainId,
  setToken,
  balance,
  loadingTokens,
  loadingChains,
  error,
  balancesLoading,
  readOnlyAmount = false,
}: TokenPanelProps) {
  const [openMenu, setOpenMenu] =
    useState<'chain' | 'token' | null>(
      null,
    );

  const [menuRect, setMenuRect] =
    useState<MenuRect>({
      top: 0,
      left: 0,
      width: 280,
      maxHeight: 320,
    });

  const [search, setSearch] =
    useState('');

  const chainTriggerRef =
    useRef<HTMLButtonElement | null>(
      null,
    );

  const tokenTriggerRef =
    useRef<HTMLButtonElement | null>(
      null,
    );

  const warmWhite =
    document.documentElement.classList.contains(
      'white',
    );

  const calculateMenuPosition =
    (
      type: 'chain' | 'token',
    ) => {
      const trigger =
        type === 'chain'
          ? chainTriggerRef.current
          : tokenTriggerRef.current;

      const rect =
        trigger?.getBoundingClientRect();

      if (!rect) {
        return;
      }

      const viewportPadding = 8;

      const spaceBelow =
        window.innerHeight -
        rect.bottom -
        12;

      const spaceAbove =
        rect.top -
        12;

      const preferredHeight =
        type === 'chain'
          ? 360
          : 420;

      const availableSpace =
        Math.max(
          180,
          Math.max(
            spaceBelow,
            spaceAbove,
          ),
        );

      const maxHeight =
        Math.min(
          preferredHeight,
          availableSpace,
        );

      const placeAbove =
        spaceBelow < 260 &&
        spaceAbove > spaceBelow;

      const left = Math.max(
        viewportPadding,
        Math.min(
          rect.left,
          window.innerWidth -
            rect.width -
            viewportPadding,
        ),
      );

      const top = placeAbove
        ? Math.max(
            viewportPadding,
            rect.top -
              maxHeight -
              8,
          )
        : rect.bottom + 8;

      setMenuRect({
        top,
        left,
        width: rect.width,
        maxHeight,
      });
    };

  const openDropdown = (
    type: 'chain' | 'token',
  ) => {
    if (openMenu === type) {
      setOpenMenu(null);
      return;
    }

    setSearch('');
    calculateMenuPosition(type);
    setOpenMenu(type);
  };

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    const reposition = () => {
      calculateMenuPosition(
        openMenu,
      );
    };

    const closeOnOutside =
      (event: MouseEvent) => {
        const target =
          event.target as Node;

        const chainTrigger =
          chainTriggerRef.current;

        const tokenTrigger =
          tokenTriggerRef.current;

        if (
          chainTrigger?.contains(
            target,
          ) ||
          tokenTrigger?.contains(
            target,
          )
        ) {
          return;
        }
      };

    window.addEventListener(
      'resize',
      reposition,
    );

    window.addEventListener(
      'scroll',
      reposition,
      true,
    );

    document.addEventListener(
      'mousedown',
      closeOnOutside,
    );

    return () => {
      window.removeEventListener(
        'resize',
        reposition,
      );

      window.removeEventListener(
        'scroll',
        reposition,
        true,
      );

      document.removeEventListener(
        'mousedown',
        closeOnOutside,
      );
    };
  }, [openMenu]);

  const searchValue =
    search.trim().toLowerCase();

  const visibleChains =
    chains.filter(chain => {
      if (!searchValue) {
        return true;
      }

      return (
        chain.name
          .toLowerCase()
          .includes(searchValue) ||
        String(chain.id).includes(
          searchValue,
        ) ||
        String(chain.key || '')
          .toLowerCase()
          .includes(searchValue)
      );
    });

  const visibleTokens =
    tokens.filter(token => {
      if (!searchValue) {
        return true;
      }

      return (
        token.symbol
          .toLowerCase()
          .includes(searchValue) ||
        String(token.name || '')
          .toLowerCase()
          .includes(searchValue) ||
        String(token.coinKey || '')
          .toLowerCase()
          .includes(searchValue) ||
        token.address
          .toLowerCase()
          .includes(searchValue)
      );
    });

  const resultsMaxHeight =
    Math.max(
      120,
      menuRect.maxHeight - 66,
    );

  const menuClass =
    warmWhite
      ? 'border-[#bfae93] bg-[#ded1bc] text-[#2b2925]'
      : 'border-zinc-600 bg-[#181a1f] text-white';

  const inputClass =
    warmWhite
      ? 'border-[#b9a98f] bg-[#eee3d2] text-[#2b2925] placeholder:text-[#817565] focus:border-blue-500'
      : 'border-zinc-700 bg-[#101216] text-white placeholder:text-zinc-500 focus:border-blue-500';

  const selectedChain =
    chains.find(
      item =>
        item.id === chainId,
    ) || chain;

  const dropdown =
    openMenu
      ? createPortal(
          <div
            className={`fixed rounded-xl border shadow-2xl ${menuClass}`}
            style={{
              top: menuRect.top,
              left: menuRect.left,
              width: menuRect.width,
              maxHeight:
                menuRect.maxHeight,
              zIndex: 2147483647,
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
            }}
            role="listbox"
          >
            <div
              className={
                warmWhite
                  ? 'shrink-0 bg-[#ded1bc] p-2'
                  : 'shrink-0 bg-[#181a1f] p-2'
              }
            >
              <input
                autoFocus
                value={search}
                onChange={event =>
                  setSearch(
                    event.target.value,
                  )
                }
                placeholder={
                  openMenu === 'chain'
                    ? 'Search chains...'
                    : 'Search tokens...'
                }
                className={`w-full rounded-lg border px-3 py-2 text-sm outline-none ${inputClass}`}
              />
            </div>

            <div
              className="min-h-0 overflow-y-auto overscroll-contain"
              style={{
                maxHeight:
                  resultsMaxHeight,
                WebkitOverflowScrolling:
                  'touch',
              }}
            >
              {openMenu ===
                'chain' &&
                visibleChains.map(
                  item => {
                    const selected =
                      item.id ===
                      chainId;

                    return (
                      <button
                        key={item.id}
                        type="button"
                        role="option"
                        aria-selected={
                          selected
                        }
                        onClick={() => {
                          setChainId(
                            item.id,
                          );
                          setOpenMenu(
                            null,
                          );
                          setSearch(
                            '',
                          );
                        }}
                        className={
                          warmWhite
                            ? `flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-[#d2c4ae] ${
                                selected
                                  ? 'bg-[#d5c6af] font-semibold'
                                  : ''
                              }`
                            : `flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-zinc-800 ${
                                selected
                                  ? 'bg-zinc-800 font-semibold'
                                  : ''
                              }`
                        }
                      >
                        {item.logoURI ? (
                          <img
                            src={
                              item.logoURI
                            }
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full"
                          />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[10px] font-bold text-blue-500">
                            {item.name
                              .slice(
                                0,
                                2,
                              )
                              .toUpperCase()}
                          </div>
                        )}

                        <span className="min-w-0 flex-1 truncate">
                          {item.name}
                        </span>

                        {selected && (
                          <span className="text-blue-500">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  },
                )}

              {openMenu ===
                'token' &&
                visibleTokens.map(
                  item => {
                    const selected =
                      normalizeAddress(
                        item.address,
                      ) ===
                      normalizeAddress(
                        token?.address,
                      );

                    return (
                      <button
                        key={`${item.chainId}:${item.address}`}
                        type="button"
                        role="option"
                        aria-selected={
                          selected
                        }
                        onClick={() => {
                          setToken(
                            item,
                          );
                          setOpenMenu(
                            null,
                          );
                          setSearch(
                            '',
                          );
                        }}
                        className={
                          warmWhite
                            ? `flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-[#d2c4ae] ${
                                selected
                                  ? 'bg-[#d5c6af] font-semibold'
                                  : ''
                              }`
                            : `flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition hover:bg-zinc-800 ${
                                selected
                                  ? 'bg-zinc-800 font-semibold'
                                  : ''
                              }`
                        }
                      >
                        {item.logoURI ? (
                          <img
                            src={
                              item.logoURI
                            }
                            alt=""
                            className="h-7 w-7 shrink-0 rounded-full"
                          />
                        ) : (
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[10px] font-bold text-blue-500">
                            {item.symbol
                              .slice(
                                0,
                                3,
                              )
                              .toUpperCase()}
                          </div>
                        )}

                        <div className="min-w-0 flex-1">
                          <div className="truncate font-medium">
                            {item.symbol}
                          </div>

                          <div
                            className={
                              warmWhite
                                ? 'truncate text-xs text-[#756b5d]'
                                : 'truncate text-xs text-zinc-500'
                            }
                          >
                            {item.name ||
                              item.coinKey ||
                              item.address}
                          </div>
                        </div>

                        {selected && (
                          <span className="text-blue-500">
                            ✓
                          </span>
                        )}
                      </button>
                    );
                  },
                )}

              {openMenu ===
                'chain' &&
                visibleChains.length ===
                  0 && (
                  <div
                    className={
                      warmWhite
                        ? 'px-4 py-6 text-center text-sm text-[#756b5d]'
                        : 'px-4 py-6 text-center text-sm text-zinc-500'
                    }
                  >
                    No chains found.
                  </div>
                )}

              {openMenu ===
                'token' &&
                visibleTokens.length ===
                  0 && (
                  <div
                    className={
                      warmWhite
                        ? 'px-4 py-6 text-center text-sm text-[#756b5d]'
                        : 'px-4 py-6 text-center text-sm text-zinc-500'
                    }
                  >
                    {loadingTokens
                      ? 'Loading tokens...'
                      : 'No tokens found.'}
                  </div>
                )}
            </div>
          </div>,
          document.body,
        )
      : null;

  const displayBalance =
    balance?.amount
      ? formatBalance(
          balance.amount,
          token?.decimals || 18,
        )
      : '0';

  return (
    <>
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label
              className={
                warmWhite
                  ? 'mb-1.5 block text-xs font-medium text-[#756b5d]'
                  : 'mb-1.5 block text-xs font-medium text-zinc-500'
              }
            >
              Chain
            </label>

            <button
              ref={chainTriggerRef}
              type="button"
              disabled={
                loadingChains ||
                chains.length === 0
              }
              onClick={() =>
                openDropdown(
                  'chain',
                )
              }
              className={
                warmWhite
                  ? 'flex w-full items-center justify-between rounded-xl border border-[#c4b49b] bg-[#efe3d1] px-3 py-3 text-left transition hover:bg-[#e7dac7] disabled:opacity-50'
                  : 'flex w-full items-center justify-between rounded-xl border border-zinc-700 bg-[#0d0f13] px-3 py-3 text-left transition hover:bg-zinc-900 disabled:opacity-50'
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                {selectedChain?.logoURI ? (
                  <img
                    src={
                      selectedChain.logoURI
                    }
                    alt=""
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10 text-[9px] font-bold text-blue-500">
                    {selectedChain?.name
                      ?.slice(
                        0,
                        2,
                      )
                      .toUpperCase() ||
                      '?'}
                  </span>
                )}

                <span className="truncate text-sm font-medium">
                  {selectedChain?.name ||
                    (loadingChains
                      ? 'Loading chains...'
                      : 'Select chain')}
                </span>
              </span>

              <span className="ml-2 shrink-0 text-xs opacity-60">
                ▾
              </span>
            </button>
          </div>

          <div>
            <label
              className={
                warmWhite
                  ? 'mb-1.5 block text-xs font-medium text-[#756b5d]'
                  : 'mb-1.5 block text-xs font-medium text-zinc-500'
              }
            >
              Token
            </label>

            <button
              ref={tokenTriggerRef}
              type="button"
              disabled={
                loadingTokens ||
                tokens.length === 0
              }
              onClick={() =>
                openDropdown(
                  'token',
                )
              }
              className={
                warmWhite
                  ? 'flex w-full items-center justify-between rounded-xl border border-[#c4b49b] bg-[#efe3d1] px-3 py-3 text-left transition hover:bg-[#e7dac7] disabled:opacity-50'
                  : 'flex w-full items-center justify-between rounded-xl border border-zinc-700 bg-[#0d0f13] px-3 py-3 text-left transition hover:bg-zinc-900 disabled:opacity-50'
              }
            >
              <span className="flex min-w-0 items-center gap-2">
                {token?.logoURI ? (
                  <img
                    src={
                      token.logoURI
                    }
                    alt=""
                    className="h-6 w-6 rounded-full"
                  />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-500/10 text-[9px] font-bold text-blue-500">
                    {token?.symbol
                      ?.slice(
                        0,
                        3,
                      )
                      .toUpperCase() ||
                      '?'}
                  </span>
                )}

                <span className="truncate text-sm font-semibold">
                  {token?.symbol ||
                    (loadingTokens
                      ? 'Loading...'
                      : 'Select token')}
                </span>
              </span>

              <span className="ml-2 shrink-0 text-xs opacity-60">
                ▾
              </span>
            </button>
          </div>
        </div>

        <div
          className={
            warmWhite
              ? 'rounded-xl border border-[#c4b49b] bg-[#efe3d1] p-4'
              : 'rounded-xl border border-zinc-800 bg-[#0d0f13] p-4'
          }
        >
          <div className="flex items-center justify-between gap-3">
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={amount}
              readOnly={readOnlyAmount}
              onChange={event =>
                setAmount(
                  event.target.value,
                )
              }
              placeholder={
                readOnlyAmount
                  ? 'Receive amount'
                  : '0.00'
              }
              className={
                warmWhite
                  ? 'w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-[#a99c89]'
                  : 'w-full bg-transparent text-2xl font-semibold outline-none placeholder:text-zinc-700'
              }
            />

            <span className="shrink-0 text-sm font-semibold">
              {token?.symbol ||
                'TOKEN'}
            </span>
          </div>

          <div className="mt-2 flex items-center justify-between">
            <span
              className={
                warmWhite
                  ? 'text-xs text-[#756b5d]'
                  : 'text-xs text-zinc-500'
              }
            >
              Balance
            </span>

            <span
              className={
                warmWhite
                  ? 'text-xs font-medium text-[#4d463d]'
                  : 'text-xs font-medium text-zinc-300'
              }
            >
              {balancesLoading
                ? 'Loading...'
                : `${displayBalance} ${
                    token?.symbol ||
                    ''
                  }`}
            </span>
          </div>
        </div>

        {error && (
          <div
            className={
              warmWhite
                ? 'text-xs text-red-700'
                : 'text-xs text-red-400'
            }
          >
            {error}
          </div>
        )}
      </div>

      {dropdown}
    </>
  );
}

type QuoteCardProps = {
  quote: any;
  fromToken: LiFiToken | null;
  toToken: LiFiToken | null;
  warmWhite: boolean;
};

function QuoteCard({
  quote,
  fromToken,
  toToken,
  warmWhite,
}: QuoteCardProps) {
  const estimate =
    quote?.estimate || {};

  const outputAmount =
    formatQuoteAmount(
      estimate.toAmount,
      toToken?.decimals || 18,
    );

  const inputAmount =
    formatQuoteAmount(
      estimate.fromAmount,
      fromToken?.decimals || 18,
    );

  const tool =
    quote?.toolDetails?.name ||
    quote?.tool ||
    'LI.FI route';

  const executionDuration =
    estimate.executionDuration
      ? Math.ceil(
          Number(
            estimate.executionDuration,
          ) / 60,
        )
      : null;

  return (
    <div
      className={
        warmWhite
          ? 'rounded-2xl border border-[#cdbda5] bg-[#e6dac8] p-5'
          : 'rounded-2xl border border-zinc-800 bg-[#111318] p-5'
      }
    >
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">
            Route found
          </h3>

          <p
            className={
              warmWhite
                ? 'mt-1 text-xs text-[#756b5d]'
                : 'mt-1 text-xs text-zinc-500'
            }
          >
            Routed through {tool}
          </p>
        </div>

        <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-xs font-medium text-blue-500">
          LI.FI
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div
          className={
            warmWhite
              ? 'rounded-xl bg-[#efe3d1] p-3'
              : 'rounded-xl bg-[#0d0f13] p-3'
          }
        >
          <div
            className={
              warmWhite
                ? 'text-[11px] text-[#756b5d]'
                : 'text-[11px] text-zinc-500'
            }
          >
            You send
          </div>

          <div className="mt-1 text-sm font-semibold">
            {inputAmount ||
              '—'}{' '}
            {fromToken?.symbol ||
              ''}
          </div>
        </div>

        <div
          className={
            warmWhite
              ? 'rounded-xl bg-[#efe3d1] p-3'
              : 'rounded-xl bg-[#0d0f13] p-3'
          }
        >
          <div
            className={
              warmWhite
                ? 'text-[11px] text-[#756b5d]'
                : 'text-[11px] text-zinc-500'
            }
          >
            You receive
          </div>

          <div className="mt-1 text-sm font-semibold">
            {outputAmount ||
              '—'}{' '}
            {toToken?.symbol ||
              ''}
          </div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <div
            className={
              warmWhite
                ? 'text-[11px] text-[#756b5d]'
                : 'text-[11px] text-zinc-500'
            }
          >
            Estimated fee
          </div>

          <div className="mt-1 text-xs font-medium">
            {estimate.gasCosts?.length
              ? 'Included in route'
              : 'Route dependent'}
          </div>
        </div>

        <div>
          <div
            className={
              warmWhite
                ? 'text-[11px] text-[#756b5d]'
                : 'text-[11px] text-zinc-500'
            }
          >
            Estimated time
          </div>

          <div className="mt-1 text-xs font-medium">
            {executionDuration
              ? `~${executionDuration} min`
              : 'Route dependent'}
          </div>
        </div>
      </div>

      <div
        className={
          warmWhite
            ? 'mt-4 rounded-lg border border-[#d1c1a8] bg-[#eee3d2] px-3 py-2 text-xs text-[#665d51]'
            : 'mt-4 rounded-lg border border-zinc-800 bg-[#0d0f13] px-3 py-2 text-xs text-zinc-400'
        }
      >
        Quote only. No transaction has been
        submitted.
      </div>
    </div>
  );
}
