import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDownUp, ArrowUpRight, ChevronDown, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { createPublicClient, encodeFunctionData, fallback, formatUnits, http, parseUnits } from 'viem';
import { useAccount, useChainId, useWalletClient } from 'wagmi';
import { useWallet } from '../../context/WalletContext';
import { recordConfirmedAction } from '../../services/points/pointsService';

type LiFiChain = {
  id: number;
  key?: string;
  name: string;
  chainType?: string;
  nativeToken?: LiFiToken;
  logoURI?: string;
  metamask?: { rpcUrls?: string[]; blockExplorerUrls?: string[] };
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
const CHAINS_API = '/api/lifi/chains';
const QUOTE_API = '/api/lifi/quote';
const NATIVE = '0x0000000000000000000000000000000000000000';
const ARC_USDC_PREDEPLOY = '0x3600000000000000000000000000000000000000';
const ERC20_APPROVE_ABI = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }, { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const;

function getTransactionExplorerUrl(chainId: number, chain?: LiFiChain, hash?: string | null) {
  if (!hash) return null;
  if (chainId === 5042) return 'https://arcscan.app/tx/' + hash;
  const explorer = chain?.metamask?.blockExplorerUrls?.find(Boolean);
  return explorer ? explorer.replace(/\/$/, '') + '/tx/' + hash : null;
}

function quoteIsExecutable(quote: any) {
  return Boolean(quote?.transactionRequest?.to && quote?.transactionRequest?.data && quote?.estimate?.toAmount && quote?.estimate?.toAmountMin);
}

function formatBalance(amount: string | undefined, decimals: number) {
  if (!amount) return '0';
  try {
    const formatted = formatUnits(BigInt(amount), decimals);
    const [whole, fraction = ''] = formatted.split('.');
    const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, '');
    return Number(whole).toLocaleString('en-US') + (trimmedFraction ? '.' + trimmedFraction : '');
  } catch {
    return '0';
  }
}

function getDirectRpcUrls(chainId: number, chain?: LiFiChain) {
  if (chainId === 5042) return ['https://rpc.mainnet.arc.io'];

  const configured = (chain?.metamask?.rpcUrls || []).filter((url) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return !host.includes('walletconnect') && !host.includes('reown');
    } catch {
      return false;
    }
  });

  // Arbitrum's arb1 endpoint can intermittently reject eth_call requests.
  // Keep it as a candidate only if LI.FI provides it, then fail over to
  // independent public endpoints instead of surfacing a raw RPC error.
  if (chainId === 42161) {
    return Array.from(new Set([
      ...configured,
      'https://arbitrum-one-rpc.publicnode.com',
      'https://arbitrum.llamarpc.com',
    ]));
  }

  if (configured.length === 0) {
    throw new Error('No direct public RPC is configured for the selected source chain.');
  }
  return configured;
}

function getDirectPublicClient(chainId: number, chain?: LiFiChain) {
  const urls = getDirectRpcUrls(chainId, chain);
  return createPublicClient({
    transport: fallback(urls.map((url) => http(url, { timeout: 10_000 }))),
  });
}

async function switchWalletChain(chainId: number, chain?: LiFiChain) {
  const ethereum = typeof window !== 'undefined' ? (window as any).ethereum : null;
  if (!ethereum?.request) throw new Error('No compatible wallet provider is available.');

  const hexChainId = '0x' + chainId.toString(16);
  try {
    await ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: hexChainId }],
    });
    return;
  } catch (error: any) {
    const code = error?.code;
    if (code !== 4902 && code !== -32603) throw error;
  }

  const rpcUrl = chain?.metamask?.rpcUrls?.find((url) => {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return !host.includes('walletconnect') && !host.includes('reown');
    } catch {
      return false;
    }
  }) || (chainId === 5042 ? 'https://rpc.mainnet.arc.io' : undefined);

  if (!rpcUrl) {
    throw new Error('Your wallet does not have this network configured. Add the network to your wallet and try again.');
  }

  const native = chain?.nativeToken;
  await ethereum.request({
    method: 'wallet_addEthereumChain',
    params: [{
      chainId: hexChainId,
      chainName: chain?.name || 'Network ' + chainId,
      nativeCurrency: {
        name: native?.name || chain?.name || 'Native Token',
        symbol: native?.symbol || 'NATIVE',
        decimals: native?.decimals ?? 18,
      },
      rpcUrls: [rpcUrl],
      blockExplorerUrls: chain?.metamask?.blockExplorerUrls?.filter(Boolean),
    }],
  });

  await ethereum.request({
    method: 'wallet_switchEthereumChain',
    params: [{ chainId: hexChainId }],
  });
}

function cleanSwapError(error: unknown, context: 'balance' | 'allowance' | 'gas' | 'transaction' = 'transaction') {
  const message = error instanceof Error ? error.message : String(error || '');
  const lower = message.toLowerCase();

  if (/user rejected|user denied|rejected the request|request rejected|4001|userrejectedrequesterror/.test(lower) || (error as any)?.code === 4001) {
    return 'Rejected';
  }

  if (context === 'balance') {
    return 'Unable to verify your token balance right now. Please try again.';
  }

  if (context === 'allowance') {
    return 'Unable to verify token approval right now. Please try again.';
  }

  if (context === 'gas') {
    return 'Unable to verify network gas balance right now. Please try again.';
  }

  if (/insufficient funds|insufficient balance|exceeds balance|not enough funds|gas required exceeds allowance|intrinsic gas too low|insufficient liquidity|amount too low|below minimum|minimum amount|too small/.test(lower)) {
    return 'Asset Too Low. Increase the amount to cover the required network cost.';
  }

  if (/failed to fetch|http request failed|rpc|network request/.test(lower)) {
    return 'Network check failed. Please try again.';
  }

  return message || 'The swap or bridge could not be completed.';
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
  const { data: walletClient } = useWalletClient();

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
  const [executing, setExecuting] = useState(false);
  const [executionStage, setExecutionStage] = useState<'wallet' | 'confirming' | null>(null);
  const [executionHash, setExecutionHash] = useState<string | null>(null);
  const [executionConfirmed, setExecutionConfirmed] = useState(false);
  const [executionExplorerUrl, setExecutionExplorerUrl] = useState<string | null>(null);
  const [arcNativeBalance, setArcNativeBalance] = useState<string | null>(null);

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
    fetchJson(CHAINS_API)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data.chains || [];
        const supported = list
          .filter((chain: LiFiChain) => Number.isInteger(Number(chain.id)) && chain.name)
          .filter((chain: LiFiChain) => !chain.chainType || chain.chainType.toUpperCase() === 'EVM')
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
        const tokenMap = data?.tokens || data || {};
        const list = Array.isArray(data)
          ? data
          : tokenMap[String(fromChainId)] || [];
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
        const tokenMap = data?.tokens || data || {};
        const list = Array.isArray(data)
          ? data
          : tokenMap[String(toChainId)] || [];
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
      setArcNativeBalance(null);
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

  useEffect(() => {
    if (!address || (fromChainId !== 5042 && toChainId !== 5042)) {
      setArcNativeBalance(null);
      return;
    }
    let cancelled = false;
    fetchJson('/api/blockchain/arc/balance/' + address)
      .then((data) => { if (!cancelled) setArcNativeBalance(data?.rawBalance ?? null); })
      .catch(() => { if (!cancelled) setArcNativeBalance(null); });
    return () => { cancelled = true; };
  }, [address, fromChainId, toChainId]);

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
    setExecutionConfirmed(false);
    setExecutionHash(null);
    setExecutionExplorerUrl(null);
    setError(null);
    try {
      const rawAmount = parseUnits(amount, fromToken.decimals).toString();
      const params = new URLSearchParams({
        fromChain: String(fromChainId),
        toChain: String(toChainId),
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAddress: address,
        toAddress: address,
        fromAmount: rawAmount,
        order: 'CHEAPEST',
        integrator: 'gen-0fi',
      });
      const data = await fetchJson(`${QUOTE_API}?${params.toString()}`);
      setQuote(data);
    } catch (err) {
      setError(cleanSwapError(err));
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    if (!address || !fromToken || !toToken || !amount || Number(amount) <= 0) {
      setQuote(null);
      return;
    }
    const timer = window.setTimeout(() => { requestQuote(); }, 450);
    return () => window.clearTimeout(timer);
  }, [address, fromToken, toToken, amount, fromChainId, toChainId]);

  const executeQuote = async () => {
    if (!quote?.transactionRequest || !walletClient || !address) return;
    setExecuting(true);
    setExecutionStage('wallet');
    setExecutionConfirmed(false);
    setError(null);
    setExecutionHash(null);
    try {
      if (connectedChainId !== fromChainId) {
        await switchWalletChain(fromChainId, fromChain);
      }
      if (!quoteIsExecutable(quote)) {
        throw new Error('LI.FI returned an incomplete route. Refresh the quote before submitting.');
      }

      const publicClient: any = getDirectPublicClient(fromChainId, fromChain);
      const required = BigInt(quote.estimate.fromAmount || '0');

      // LI.FI already provides the wallet balance dataset used by this screen.
      // Do not run a separate balanceOf/getBalance preflight here. Different public
      // RPCs can reject eth_call even when the LI.FI route is executable, which was
      // causing the false "Unable to verify your token balance" error.
      // Arc native USDC remains backed by the authoritative Arc balance endpoint
      // for display, but it is never blocked by a second RPC balance check.
      if (fromToken && required > 0n) {
        const isArcNativeUsdc = fromChainId === 5042 && fromToken.address.toLowerCase() === ARC_USDC_PREDEPLOY.toLowerCase();
        const balanceItem = tokenBalanceFor(balances, fromChainId, fromToken);
        const availableRaw = isArcNativeUsdc
          ? (arcNativeBalance !== null ? BigInt(arcNativeBalance) : null)
          : (balanceItem?.amount ? BigInt(balanceItem.amount) : null);
        if (availableRaw !== null && availableRaw < required) {
          throw new Error(`Insufficient ${fromToken.symbol} balance for this ${fromChainId === toChainId ? 'swap' : 'bridge'}.`);
        }
      }

      // LI.FI is the source of truth for route execution.
      // Do not preflight gas with a separate eth_getBalance call. That can fail on
      // RPCs that LI.FI itself can execute through and was causing false gas errors.
      // Arc native USDC is also intentionally left to the LI.FI transaction request.
      
      const approvalAddress = quote?.estimate?.approvalAddress;
      // Arc mainnet USDC is the native gas/settlement asset, not an ERC-20 allowance flow.
      // Never call allowance() or approve() against the Arc USDC predeploy.
      if (fromToken && fromToken.address.toLowerCase() !== NATIVE && fromToken.address.toLowerCase() !== ARC_USDC_PREDEPLOY && approvalAddress && quote?.estimate?.fromAmount) {
        let allowance: bigint;
        try {
          allowance = await publicClient.readContract({
            address: fromToken.address as `0x${string}`,
            abi: ERC20_APPROVE_ABI,
            functionName: 'allowance',
            args: [address as `0x${string}`, approvalAddress as `0x${string}`],
          });
        } catch (allowanceError) {
          throw new Error(cleanSwapError(allowanceError, 'allowance'));
        }
        if (allowance < required) {
          const approvalData = encodeFunctionData({
            abi: ERC20_APPROVE_ABI,
            functionName: 'approve',
            args: [approvalAddress as `0x${string}`, required],
          });
          const approvalHash = await walletClient.sendTransaction({
            account: address as `0x${string}`,
            to: fromToken.address as `0x${string}`,
            data: approvalData,
            value: 0n,
            chainId: fromChainId,
          });
          setExecutionStage('confirming');
          const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
          if (approvalReceipt.status !== 'success') throw new Error('Token approval failed. No swap or bridge transaction was submitted.');
        }
      }

      const tx = quote.transactionRequest as any;

      // Execute the transaction exactly as returned by LI.FI. Preserve route-provided
      // gas/fee fields when present so the wallet does not perform a different
      // estimation path that can reject an otherwise executable LI.FI route.
      const txRequest: any = {
        account: address as `0x${string}`,
        to: tx.to,
        data: tx.data,
        value: tx.value ? BigInt(tx.value) : 0n,
        chainId: fromChainId,
      };
      if (tx.gasLimit) txRequest.gas = BigInt(tx.gasLimit);
      else if (tx.gas) txRequest.gas = BigInt(tx.gas);
      if (tx.maxFeePerGas) txRequest.maxFeePerGas = BigInt(tx.maxFeePerGas);
      if (tx.maxPriorityFeePerGas) txRequest.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
      if (tx.gasPrice) txRequest.gasPrice = BigInt(tx.gasPrice);

      const hash = await walletClient.sendTransaction(txRequest);
      setExecutionHash(hash);
      setExecutionExplorerUrl(getTransactionExplorerUrl(fromChainId, fromChain, hash));
      setExecutionStage('confirming');

      // Wait for the actual source-chain receipt before declaring success.
      // Wait for the source-chain receipt before declaring the transaction confirmed.
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') {
        throw new Error('The transaction reverted. No points were awarded.');
      }

      // The onchain transaction is now confirmed. Do not keep the UI in
      // "Confirm in wallet" while the separate points sync is running.
      setExecutionConfirmed(true);
      setExecutionStage(null);
      setExecuting(false);

      // Points are secondary bookkeeping. A slow Supabase request must never
      // make an already-confirmed blockchain transaction look pending.
      const action = fromChainId === toChainId ? 'swap' : 'bridge';
      try {
        await recordConfirmedAction(address, hash, action, fromChainId);
      } catch {
        // The transaction is already confirmed. Keep the UI confirmed even if
        // points indexing is temporarily unavailable after the retry window.
      }
    } catch (err) {
      setError(cleanSwapError(err));
      setExecutionStage(null);
      setExecuting(false);
    }
  };

  const switchFromChain = async () => {
    setError(null);
    try {
      await switchWalletChain(fromChainId, fromChain);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error || '');
      const lower = message.toLowerCase();
      if (/user rejected|user denied|4001/.test(lower)) {
        setError('Network switch was cancelled in your wallet.');
      } else {
        setError(message || 'Your wallet could not switch to the selected source chain.');
      }
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
            Move supported assets across chains through LI.FI cheapest routing.
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
                arcNativeBalance={arcNativeBalance}
                balances={balances}
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
                amount={quote?.estimate?.toAmount ? formatBalance(quote.estimate.toAmount, toToken?.decimals || 18) : ''}
                setAmount={() => {}}
                balance={null}
                loadingBalance={false}
                arcNativeBalance={arcNativeBalance}
                balances={balances}
                onSwitchChain={() => {}}
              />
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              {quoteIsExecutable(quote) ? (
                <button
                  onClick={connectedChainId !== fromChainId ? switchFromChain : executeQuote}
                  disabled={executing}
                  className="flex-1 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold py-3 transition flex items-center justify-center gap-2"
                >
                  {executing && !executionConfirmed && <Loader2 className="w-4 h-4 animate-spin" />}
                  {executing
                    ? executionStage === 'confirming'
                      ? 'Confirming onchain...'
                      : 'Confirm in wallet...'
                    : executionConfirmed
                      ? 'Confirmed'
                      : connectedChainId !== fromChainId
                      ? 'Switch wallet to ' + (fromChain?.name || 'source chain')
                      : (fromChainId === toChainId ? 'Swap ' : 'Bridge ') + (fromToken?.symbol || '')}
                </button>
              ) : (
                <button
                  onClick={requestQuote}
                  disabled={!fromToken || !toToken || !amount || quoting}
                  className="flex-1 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 transition flex items-center justify-center gap-2"
                >
                  {quoting && <Loader2 className="w-4 h-4 animate-spin" />}
                  {quoting ? 'Finding route...' : 'Get quote'}
                </button>
              )}
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

            {executionHash && (
              <div className={`mt-4 rounded-xl border px-4 py-3 text-sm ${executionConfirmed ? 'border-green-500/30 bg-green-500/5 text-green-300' : 'border-blue-500/20 bg-blue-500/5 text-blue-300'}`}>
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium">{executionConfirmed ? 'Confirmed' : executionStage === 'confirming' ? 'Confirming onchain...' : 'Submitted'}</div>
                    <div className="mt-1 font-mono text-[10px] text-zinc-500 truncate">{executionHash}</div>
                  </div>
                  {executionExplorerUrl && (
                    <a
                      href={executionExplorerUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label="View transaction on explorer"
                      title="View transaction on Arcscan"
                      className="shrink-0 inline-flex items-center justify-center w-7 h-7 rounded-lg border border-zinc-700/80 bg-zinc-900/70 text-zinc-400 hover:text-white hover:border-blue-500/50 transition"
                    >
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  )}
                </div>
              </div>
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
                <div className="mt-2 space-y-1 text-xs text-zinc-500">
                  <div>Route: {quote.toolDetails?.name || quote.tool || 'LI.FI'}</div>
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
  arcNativeBalance: string | null;
  balances: Record<string, BalanceToken[]> | null;
  onSwitchChain: () => void;
}) {
  const [openMenu, setOpenMenu] = useState<'chain' | 'token' | null>(null);
  const [menuRect, setMenuRect] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });
  const chainTriggerRef = useRef<HTMLButtonElement | null>(null);
  const tokenTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [search, setSearch] = useState('');
  const [customTokens, setCustomTokens] = useState<LiFiToken[]>([]);
  const [lookupToken, setLookupToken] = useState<LiFiToken | null>(null);
  const [lookingUpToken, setLookingUpToken] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);

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

  const warmWhite = typeof document !== 'undefined' && document.documentElement.classList.contains('brown');
  const lightMode = typeof document !== 'undefined' && document.documentElement.classList.contains('white');
  const menuClass = warmWhite
    ? 'border-[#b58a63] bg-[#2f2118] text-[#fff7ef]'
    : lightMode
      ? 'border-[#cbd5e1] bg-[#eef1f4] text-[#111111]'
      : 'border-blue-400/30 bg-[#0f1724] text-white';

  const tokenWalletBalance = (token: LiFiToken) => {
    if (props.chainId === 5042 && token.address.toLowerCase() === ARC_USDC_PREDEPLOY.toLowerCase() && props.arcNativeBalance !== null) {
      return formatBalance(props.arcNativeBalance, 18);
    }
    const item = tokenBalanceFor(props.balances, props.chainId, token);
    return item?.amount ? formatBalance(item.amount, token.decimals || 18) : '0';
  };

  const allTokens = useMemo(() => {
    const seen = new Set<string>();
    return [...customTokens, ...props.tokens].filter((token) => {
      const key = token.address.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [customTokens, props.tokens]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem('gen0fi:lifi:customTokens:' + props.chainId);
      const saved = raw ? JSON.parse(raw) : [];
      setCustomTokens(Array.isArray(saved) ? saved : []);
    } catch {
      setCustomTokens([]);
    }
    setLookupToken(null);
    setLookupError(null);
  }, [props.chainId]);

  useEffect(() => {
    const value = search.trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(value) || openMenu !== 'token') {
      setLookupToken(null);
      setLookupError(null);
      setLookingUpToken(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLookingUpToken(true);
      setLookupError(null);
      try {
        const token = await fetchJson(API + '/token?chain=' + props.chainId + '&token=' + encodeURIComponent(value));
        if (!cancelled) setLookupToken(token);
      } catch (err) {
        if (!cancelled) {
          setLookupToken(null);
          setLookupError(err instanceof Error ? 'Token not found by LI.FI on this chain.' : 'Token lookup failed.');
        }
      } finally {
        if (!cancelled) setLookingUpToken(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search, openMenu, props.chainId]);

  const addTokenToList = (token: LiFiToken) => {
    const next = [...customTokens.filter((item) => item.address.toLowerCase() !== token.address.toLowerCase()), token];
    setCustomTokens(next);
    try {
      localStorage.setItem('gen0fi:lifi:customTokens:' + props.chainId, JSON.stringify(next));
    } catch {}
  };

  const visibleChains = props.chains.filter((chain) => chain.name.toLowerCase().includes(search.toLowerCase()));
  const visibleTokens = allTokens.filter((token) =>
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
          <div className={warmWhite ? 'sticky top-0 p-2 bg-[#2f2118]' : lightMode ? 'sticky top-0 p-2 bg-[#e5e7eb]' : 'sticky top-0 p-2 bg-[#0f1724]'}>
            <input
              autoFocus
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={openMenu === 'chain' ? 'Search chains...' : 'Search token, symbol or contract address...'}
              className={warmWhite
                ? 'w-full rounded-lg border border-[#b58a63] bg-[#6a4730] px-3 py-2 text-sm text-[#f6eadf] outline-none placeholder:text-[#d0b59e]'
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
                  ? 'w-full text-left px-3 py-3 text-sm text-[#f6eadf] hover:bg-[#6a4730] transition'
                  : 'w-full text-left px-3 py-3 text-sm text-white hover:bg-zinc-800 transition'}
              >
                <span className="block truncate">{chain.name}</span>
                <span className={warmWhite ? 'text-xs text-[#d0b59e]' : 'text-xs text-zinc-500'}>Chain ID {chain.id}</span>
              </button>
            ))
          ) : (
            <>
              {lookupToken && (
                <div className={warmWhite ? 'mx-2 my-2 rounded-xl border border-[#b58a63] bg-[#6a4730] p-3' : 'mx-2 my-2 rounded-xl border border-blue-500/30 bg-blue-500/10 p-3'}>
                  <div className="flex items-center gap-2 min-w-0">
                    {lookupToken.logoURI && <img src={lookupToken.logoURI} alt="" className="w-8 h-8 rounded-full shrink-0" />}
                    <div className="min-w-0"><div className={warmWhite ? 'text-sm font-semibold text-[#f6eadf]' : 'text-sm font-semibold text-white'}>{lookupToken.symbol}</div><div className={warmWhite ? 'text-xs text-[#d0b59e] truncate' : 'text-xs text-zinc-400 truncate'}>{lookupToken.name}</div></div>
                  </div>
                  <div className={warmWhite ? 'mt-2 text-[10px] text-[#d0b59e] break-all' : 'mt-2 text-[10px] text-zinc-500 break-all'}>{lookupToken.address}</div>
                  <div className="mt-3 flex gap-2"><button type="button" onClick={() => { props.setToken(lookupToken); setSearch(''); setOpenMenu(null); }} className="flex-1 rounded-lg bg-blue-500 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-400">Use token</button><button type="button" onClick={() => addTokenToList(lookupToken)} className={warmWhite ? 'rounded-lg border border-[#b58a63] px-3 py-2 text-xs font-semibold text-[#f6eadf]' : 'rounded-lg border border-zinc-600 px-3 py-2 text-xs font-semibold text-white'}>Add to list</button></div>
                </div>
              )}
              {lookingUpToken && <div className={warmWhite ? 'px-4 py-2 text-xs text-[#d0b59e]' : 'px-4 py-2 text-xs text-zinc-400'}>Looking up contract on LI.FI...</div>}
              {lookupError && <div className="px-4 py-2 text-xs text-red-300">{lookupError}</div>}
              {visibleTokens.map((token) => (
                <button key={token.address} type="button" onClick={() => { props.setToken(token); setSearch(''); setOpenMenu(null); }} className={warmWhite ? 'w-full flex items-center justify-between px-3 py-3 text-sm text-[#fff7ef] hover:bg-[#4a3224] transition' : lightMode ? 'w-full flex items-center justify-between px-3 py-3 text-sm text-[#111111] hover:bg-[#dbe3ea] transition' : 'w-full flex items-center justify-between px-3 py-3 text-sm text-white hover:bg-[#18283d] transition'}>
                  <span className="flex items-center gap-2 min-w-0">{token.logoURI && <img src={token.logoURI} alt="" className="w-6 h-6 rounded-full shrink-0" />}<span className="truncate">{token.symbol}</span></span>
                  {token.priceUSD && <span className={warmWhite ? 'text-xs text-[#71695d] ml-3' : 'text-xs text-zinc-500 ml-3'}>${Number(token.priceUSD).toLocaleString()}</span>}
                </button>
              ))}
            </>
          )}
          {((openMenu === 'chain' && visibleChains.length === 0) || (openMenu === 'token' && visibleTokens.length === 0)) && (
            <div className={warmWhite ? 'px-4 py-5 text-sm text-[#dbc6b4]' : 'px-4 py-5 text-sm text-zinc-400'}>
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
        className={lightMode ? 'w-full flex items-center justify-between rounded-xl border border-[#cbd5e1] bg-[#eef1f4] px-3 py-2.5 text-sm text-[#111111]' : 'w-full flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5 text-sm text-white'}
      >
        <span className="truncate">{props.chain?.name || 'Select chain'}</span>
        <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
      </button>

      <button
        ref={tokenTriggerRef}
        type="button"
        onClick={() => openDropdown('token')}
        className={lightMode ? 'w-full mt-3 flex items-center justify-between rounded-xl border border-[#cbd5e1] bg-[#eef1f4] px-3 py-2.5' : 'w-full mt-3 flex items-center justify-between rounded-xl border border-zinc-700 bg-zinc-900 px-3 py-2.5'}
      >
        <span className="flex items-center gap-2 min-w-0">
          {props.token?.logoURI && <img src={props.token.logoURI} alt="" className="w-6 h-6 rounded-full shrink-0" />}
          <span className={lightMode ? 'text-[#111111] font-medium truncate' : 'text-white font-medium truncate'}>{props.token?.symbol || 'Select token'}</span>
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
          readOnly={props.label === 'You receive'}
          className="w-full bg-transparent text-3xl font-semibold text-white outline-none placeholder:text-zinc-700"
        />
        <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
          <span>
            Balance:{' '}
            {props.loadingBalance
              ? 'Loading...'
              : props.token
                ? tokenWalletBalance(props.token)
                : '0'}
            {props.token?.symbol ? ` ${props.token.symbol}` : ''}
          </span>
          {props.token && (
            <button
              onClick={() => props.setAmount(tokenWalletBalance(props.token!))}
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
