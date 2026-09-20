import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownUp, ChevronDown, Loader2, RefreshCw, Wallet } from 'lucide-react';
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
const NATIVE = '0x0000000000000000000000000000000000000000';

function formatBalance(amount: string | undefined, decimals: number) {
  if (!amount) return '0';
  try {
    const value = Number(amount) / 10 ** decimals;
    if (!Number.isFinite(value)) return '0';
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
  if (!balances || !token) return null;
  const items = balances[String(chainId)] || [];
  const address = token.address.toLowerCase();
  return items.find((item) => item.address?.toLowerCase() === address) || null;
}

export const SwapView: React.FC = () => {
  const { address, isConnected, connectWallet } = useWallet();
  const connectedChainId = useChainId();
  const { isConnected: wagmiConnected } = useAccount();

  const [chains, setChains] = useState<LiFiChain[]>([]);
  const [fromChainId, setFromChainId] = useState(5042);
  const [toChainId, setToChainId] = useState(8453);
  const [fromTokens, setFromTokens] = useState<LiFiToken[]>([]);
  const [toTokens, setToTokens] = useState<LiFiToken[]>([]);
  const [fromToken, setFromToken] = useState<LiFiToken | null>(null);
  const [toToken, setToToken] = useState<LiFiToken | null>(null);
  const [balances, setBalances] = useState<Record<string, BalanceToken[]> | null>(null);
  const [amount, setAmount] = useState('');
  const [loadingChains, setLoadingChains] = useState(true);
  const [loadingFromTokens, setLoadingFromTokens] = useState(false);
  const [loadingToTokens, setLoadingToTokens] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<any>(null);
  const [quoting, setQuoting] = useState(false);

  const fromBalance = tokenBalanceFor(balances, fromChainId, fromToken);

  const fetchJson = async (url: string) => {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`LI.FI request failed (${response.status})`);
    return response.json();
  };

  useEffect(() => {
    let cancelled = false;
    setLoadingChains(true);
    fetchJson(`${API}/chains?chainTypes=EVM`)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data.chains || [];
        const supported = list
          .filter((chain: LiFiChain) => chain.id && chain.name)
          .sort((a: LiFiChain, b: LiFiChain) => a.name.localeCompare(b.name));
        setChains(supported);
        if (!supported.some((c: LiFiChain) => c.id === fromChainId)) {
          setFromChainId(supported[0]?.id || 5042);
        }
        if (!supported.some((c: LiFiChain) => c.id === toChainId)) {
          setToChainId(supported.find((c: LiFiChain) => c.id !== fromChainId)?.id || 8453);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load LI.FI chains.');
      })
      .finally(() => {
        if (!cancelled) setLoadingChains(false);
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoadingFromTokens(true);
    setFromToken(null);
    fetchJson(`${API}/tokens?chains=${fromChainId}&chainTypes=EVM`)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data[String(fromChainId)] || [];
        const filtered = list.filter((t: LiFiToken) => t.address && t.symbol);
        setFromTokens(filtered);
        setFromToken(filtered.find((t: LiFiToken) => t.coinKey === 'USDC') || filtered[0] || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load source tokens.');
      })
      .finally(() => {
        if (!cancelled) setLoadingFromTokens(false);
      });
    return () => { cancelled = true; };
  }, [fromChainId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingToTokens(true);
    setToToken(null);
    fetchJson(`${API}/tokens?chains=${toChainId}&chainTypes=EVM`)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data[String(toChainId)] || [];
        const filtered = list.filter((t: LiFiToken) => t.address && t.symbol);
        setToTokens(filtered);
        setToToken(filtered.find((t: LiFiToken) => t.coinKey === 'USDC') || filtered[0] || null);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load destination tokens.');
      })
      .finally(() => {
        if (!cancelled) setLoadingToTokens(false);
      });
    return () => { cancelled = true; };
  }, [toChainId]);

  useEffect(() => {
    if (!address) {
      setBalances(null);
      return;
    }
    let cancelled = false;
    setLoadingBalances(true);
    fetchJson(`${API}/wallets/${address}/balances`)
      .then((data) => {
        if (cancelled) return;
        setBalances(data?.balances || data || {});
      })
      .catch(() => {
        if (!cancelled) setBalances(null);
      })
      .finally(() => {
        if (!cancelled) setLoadingBalances(false);
      });
    return () => { cancelled = true; };
  }, [address]);

  const fromChain = useMemo(
    () => chains.find((chain) => chain.id === fromChainId),
    [chains, fromChainId],
  );
  const toChain = useMemo(
    () => chains.find((chain) => chain.id === toChainId),
    [chains, toChainId],
  );

  const requestQuote = async () => {
    if (!address || !fromToken || !toToken || !amount || Number(amount) <= 0) return;
    setQuoting(true);
    setQuote(null);
    setError(null);
    try {
      const rawAmount = BigInt(Math.floor(Number(amount) * 10 ** fromToken.decimals)).toString();
      const params = new URLSearchParams({
        fromChain: String(fromChainId),
        toChain: String(toChainId),
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAddress: address,
        toAddress: address,
        fromAmount: rawAmount,
        integrator: 'GEN-0FI',
      });
      const data = await fetchJson(`${API}/quote?${params.toString()}`);
      setQuote(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No LI.FI route is available for this selection.');
    } finally {
      setQuoting(false);
    }
  };

  const switchFromChain = async () => {
    try {
      await switchChain(wagmiConfig, { chainId: fromChainId });
    } catch {
      setError('Your wallet could not switch to the selected source chain.');
    }
  };

  const swapSides = () => {
    setFromChainId(toChainId);
    setToChainId(fromChainId);
    setFromToken(toToken);
    setToToken(fromToken);
    setAmount('');
    setQuote(null);
  };

  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 animate-in fade-in duration-200">
      <div className="max-w-5xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Swap & Bridge</h1>
          <p className="text-sm text-zinc-400 mt-1">
            Move supported assets across chains through LI.FI routing.
          </p>
        </div>

        {!isConnected || !wagmiConnected ? (
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-8 text-center">
            <Wallet className="w-8 h-8 text-blue-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-white">Connect your wallet</h2>
            <p className="text-sm text-zinc-400 mt-1 mb-5">
              Your real wallet balance will appear after connection.
            </p>
            <button
              onClick={connectWallet}
              className="px-5 py-3 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-semibold transition"
            >
              Connect Wallet
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-zinc-800 bg-[#0d0f12] p-4 sm:p-6">
            <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-3 items-end">
              <TokenPanel
                label="You send"
                chain={fromChain}
                chains={chains}
                chainId={fromChainId}
                setChainId={setFromChainId}
                tokens={fromTokens}
                token={fromToken}
                setToken={setFromToken}
                loading={loadingChains || loadingFromTokens}
                amount={amount}
                setAmount={setAmount}
                balance={fromBalance}
                loadingBalance={loadingBalances}
                onSwitchChain={switchFromChain}
              />

              <button
                onClick={swapSides}
                className="w-10 h-10 mb-1 mx-auto rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-blue-500 transition flex items-center justify-center"
                aria-label="Swap source and destination"
              >
                <ArrowDownUp className="w-4 h-4" />
              </button>

              <TokenPanel
                label="You receive"
                chain={toChain}
                chains={chains}
                chainId={toChainId}
                setChainId={setToChainId}
                tokens={toTokens}
                token={toToken}
                setToken={setToToken}
                loading={loadingChains || loadingToTokens}
                amount=""
                setAmount={() => {}}
                balance={null}
                loadingBalance={false}
                onSwitchChain={() => {}}
              />
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <button
                onClick={requestQuote}
                disabled={!fromToken || !toToken || !amount || quoting}
                className="flex-1 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 transition flex items-center justify-center gap-2"
              >
                {quoting && <Loader2 className="w-4 h-4 animate-spin" />}
                {quoting ? 'Finding route...' : 'Get quote'}
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 rounded-xl border border-zinc-700 text-zinc-300 hover:text-white hover:border-zinc-500 transition"
                title="Refresh LI.FI data"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>

            {connectedChainId !== fromChainId && (
              <button
                onClick={switchFromChain}
                className="w-full mt-3 rounded-xl border border-amber-500/30 bg-amber-500/5 text-amber-300 py-2.5 text-sm"
              >
                Switch wallet to {fromChain?.name || 'the selected source chain'}
              </button>
            )}

            {error && (
              <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {quote && (
              <div className="mt-4 rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-zinc-400">Estimated receive</span>
                  <span className="text-lg font-semibold text-white">
                    {formatBalance(quote.estimate?.toAmount, toToken?.decimals || 18)} {toToken?.symbol}
                  </span>
                </div>
                <div className="mt-2 text-xs text-zinc-500">
                  Route: {quote.toolDetails?.name || quote.tool || 'LI.FI'}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

function TokenPanel(props: {
  label: string;
  chain?: LiFiChain;
  chains: LiFiChain[];
  chainId: number;
  setChainId: (id: number) => void;
  tokens: LiFiToken[];
  token: LiFiToken | null;
  setToken: (token: LiFiToken | null) => void;
  loading: boolean;
  amount: string;
  setAmount: (value: string) => void;
  balance: BalanceToken | null;
  loadingBalance: boolean;
  onSwitchChain: () => void;
}) {
  const [openMenu, setOpenMenu] = useState<'chain' | 'token' | null>(null);
  const [menuRect, setMenuRect] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
  const chainTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tokenTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [search, setSearch] = useState('');

  const openDropdown = (type: 'chain' | 'token') => {
    if (openMenu === type) {
      setOpenMenu(null);
      return;
    }
    const rect = (type === 'chain' ? chainTriggerRef.current : tokenTriggerRef.current)?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - 12;
    const spaceAbove = rect.top - 12;
    const maxHeight = Math.max(180, Math.min(type === 'chain' ? 320 : 360, Math.max(spaceBelow, spaceAbove)));
    const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
    setMenuRect({
      top: placeAbove ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 8,
      left: rect.left,
      width: rect.width,
      maxHeight,
    });
    setOpenMenu(type);
  };

  useEffect(() => {
    if (!openMenu) return;
    const reposition = () => {
      const rect = (openMenu === 'chain' ? chainTriggerRef.current : tokenTriggerRef.current)?.getBoundingClientRect();
      if (!rect) return;
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const maxHeight = Math.max(180, Math.min(openMenu === 'chain' ? 320 : 360, Math.max(spaceBelow, spaceAbove)));
      const placeAbove = spaceBelow < 220 && spaceAbove > spaceBelow;
      setMenuRect({
        top: placeAbove ? Math.max(8, rect.top - maxHeight - 8) : rect.bottom + 8,
        left: rect.left,
        width: rect.width,
        maxHeight,
      });
    };
    window.addEventListener('resize', reposition);
    window.addEventListener('scroll', reposition, true);
    return () => {
      window.removeEventListener('resize', reposition);
      window.removeEventListener('scroll', reposition, true);
    };
  }, [openMenu]);

  const warmWhite = typeof document !== 'undefined' && document.documentElement.classList.contains('white');
  const menuClass = warmWhite
    ? 'border-[#bfae93] bg-[#ded1bc] text-[#2b2925]'
    : 'border-zinc-600 bg-[#181a1f] text-white';

  const visibleChains = props.chains.filter((chain) => chain.name.toLowerCase().includes(search.toLowerCase()));
  const visibleTokens = props.tokens.filter((token) =>
    `${token.symbol} ${token.name || ''}`.toLowerCase().includes(search.toLowerCase()),
  );

  const dropdown = openMenu
    ? createPortal(
        <div
          className={`fixed rounded-xl border shadow-2xl overflow-y-auto ${menuClass}`}
          style={{
            top: menuRect.top,
            left: menuRect.left,
            width: menuRect.width,
            maxHeight: menuRect.maxHeight,
            zIndex: 2147483647,
          }}
          role="listbox"
        >
          <div className={warmWhite ? 'sticky top-0 p-2 bg-[#ded1bc]' : 'sticky top-0 p-2 bg-[#181a1f]'}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={openMenu === 'chain' ? 'Search chains...' : 'Search coins...'}
              className={warmWhite
                ? 'w-full rounded-lg border border-[#bfae93] bg-[#eee5d7] px-3 py-2 text-sm text-[#2b2925] outline-none placeholder:text-[#8b8173]'
                : 'w-full rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white outline-none placeholder:text-zinc-500'}
            />
          </div>
          {openMenu === 'chain' ? (
            visibleChains.map((chain) => (
              <button
                key={chain.id}
                type="button"
                onClick={() => {
                  props.setChainId(chain.id);
                  setSearch('');
                  setOpenMenu(null);
                }}
                className={warmWhite
                  ? 'w-full text-left px-3 py-3 text-sm text-[#2b2925] hover:bg-[#cbb99d] transition'
                  : 'w-full text-left px-3 py-3 text-sm text-white hover:bg-zinc-800 transition'}
              >
                <span className="block truncate">{chain.name}</span>
                <span className={warmWhite ? 'text-xs text-[#71695d]' : 'text-xs text-zinc-500'}>Chain ID {chain.id}</span>
              </button>
            ))
          ) : (
            visibleTokens.map((token) => (
              <button
                key={token.address}
                type="button"
                onClick={() => {
                  props.setToken(token);
                  setSearch('');
                  setOpenMenu(null);
                }}
                className={warmWhite
                  ? 'w-full flex items-center justify-between px-3 py-3 text-sm text-[#2b2925] hover:bg-[#cbb99d] transition'
                  : 'w-full flex items-center justify-between px-3 py-3 text-sm text-white hover:bg-zinc-800 transition'}
              >
                <span className="flex items-center gap-2 min-w-0">
                  {token.logoURI && <img src={token.logoURI} alt="" className="w-6 h-6 rounded-full shrink-0" />}
                  <span className="truncate">{token.symbol}</span>
                </span>
                {token.priceUSD && (
                  <span className={warmWhite ? 'text-xs text-[#71695d] ml-3' : 'text-xs text-zinc-500 ml-3'}>
                    ${Number(token.priceUSD).toLocaleString()}
                  </span>
                )}
              </button>
            ))
          )}
          {((openMenu === 'chain' && visibleChains.length === 0) || (openMenu === 'token' && visibleTokens.length === 0)) && (
            <div className={warmWhite ? 'px-4 py-5 text-sm text-[#71695d]' : 'px-4 py-5 text-sm text-zinc-400'}>
              {props.loading ? 'Loading...' : search ? 'No matches found' : 'Nothing available'}
            </div>
          )}
        </div>,
        document.body,
      )
    : null;

  return (
    <div className="relative rounded-2xl border border-zinc-800 bg-[#111317] p-4">
      <div className="text-xs font-medium text-zinc-500 mb-2">{props.label}</div>

      <button
        ref={chainTriggerRef}
        type="button"
        onClick={() => openDropdown('chain')}
        className="w-full flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white"
      >
        <span className="truncate">{props.chain?.name || 'Select chain'}</span>
        <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
      </button>

      <button
        ref={tokenTriggerRef}
        type="button"
        onClick={() => openDropdown('token')}
        className="w-full mt-3 flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5"
      >
        <span className="flex items-center gap-2 min-w-0">
          {props.token?.logoURI && <img src={props.token.logoURI} alt="" className="w-6 h-6 rounded-full shrink-0" />}
          <span className="text-white font-medium truncate">{props.token?.symbol || 'Select token'}</span>
        </span>
        <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
      </button>

      {dropdown}

      <div className="mt-4">
        <input
          value={props.amount}
          onChange={(e) => props.setAmount(e.target.value.replace(/[^0-9.]/g, ''))}
          placeholder="0.00"
          inputMode="decimal"
          className="w-full bg-transparent text-3xl font-semibold text-white outline-none placeholder:text-zinc-700"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
          <span>
            Balance:{' '}
            {props.loadingBalance
              ? 'Loading...'
              : props.balance
                ? formatBalance(props.balance.amount, props.token?.decimals || 18)
                : '0'}
            {props.token?.symbol ? ` ${props.token.symbol}` : ''}
          </span>
          {props.balance && props.token && (
            <button
              onClick={() => props.setAmount(formatBalance(props.balance?.amount, props.token?.decimals || 18))}
              className="text-blue-400 hover:text-blue-300"
            >
              MAX
            </button>
          )}
        </div>
        {props.chainId === 5042 && props.onSwitchChain && (
          <button onClick={props.onSwitchChain} className="mt-2 text-xs text-zinc-500 hover:text-zinc-300">
            Use {props.chain?.name || 'selected chain'} in wallet
          </button>
        )}
      </div>
    </div>
  );
}
