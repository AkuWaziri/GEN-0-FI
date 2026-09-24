import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, CheckCircle2, Coins, ExternalLink, Globe2, Info, Loader2, RefreshCw, Search, TrendingUp, WalletCards } from 'lucide-react';
import { encodeFunctionData, formatUnits, isAddress, parseUnits } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ARC_CHAIN_ID, ARC_MAINNET_EXPLORER_URL } from '../../config/arc';
import { useWallet } from '../../context/WalletContext';

type Kind = 'stable' | 'fiat';
type Stablecoin = { id: string; name: string; symbol: string; price: number; address: string; decimals: number };
type Fiat = { code: string; name: string };

const STABLES_URL = 'https://api.llama.fi/stablecoins?includePrices=true';
const FIATS_URL = 'https://api.frankfurter.dev/v2/currencies';
const RATES_URL = 'https://api.frankfurter.dev/v2/rates';
const LI_FI_API = 'https://li.quest/v1';
const ARC_USDC_PREDEPLOY = '0x3600000000000000000000000000000000000000';
const FX_FEE_RATE = 0.01;
const ERC20_APPROVE_ABI = [{ type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }, { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' } , { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const;

const formatValue = (value: number) => {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  if (Math.abs(value) >= 1) return value.toLocaleString('en-US', { maximumFractionDigits: 6 });
  return value.toLocaleString('en-US', { maximumFractionDigits: 8 });
};

export const FXView: React.FC = () => {
  const [stables, setStables] = useState<Stablecoin[]>([]);
  const [fiats, setFiats] = useState<Fiat[]>([]);
  const [fromKind, setFromKind] = useState<Kind>('stable');
  const [toKind, setToKind] = useState<Kind>('fiat');
  const [from, setFrom] = useState('USDC');
  const [to, setTo] = useState('NGN');
  const [amount, setAmount] = useState('1');
  const [fromSearch, setFromSearch] = useState('');
  const [toSearch, setToSearch] = useState('');
  const [indicativeQuote, setIndicativeQuote] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(null);
  const [fiatDate, setFiatDate] = useState<string | null>(null);
  const [stableUpdated, setStableUpdated] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const { address, isConnected, connectWallet, refreshData } = useWallet();
  const { chainId: connectedChainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });
  const [receiveAddress, setReceiveAddress] = useState('');
  const [showRecipient, setShowRecipient] = useState(false);
  const [quote, setQuote] = useState<any>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [executionHash, setExecutionHash] = useState<string | null>(null);
  const [executionConfirmed, setExecutionConfirmed] = useState(false);
  const [executionStage, setExecutionStage] = useState<'wallet' | 'confirming' | null>(null);
  const [sourceBalance, setSourceBalance] = useState<string | null>(null);
  const [quoteUpdatedAt, setQuoteUpdatedAt] = useState<number | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stableMap = useMemo(() => new Map(stables.map((x) => [x.symbol, x])), [stables]);
  const fromToken = fromKind === 'stable' ? stableMap.get(from) || null : null;
  const toToken = toKind === 'stable' ? stableMap.get(to) || null : null;
  const stableExecution = fromKind === 'stable' && toKind === 'stable';
  const feeAmount = Number(amount) > 0 ? Number(amount) * FX_FEE_RATE : 0;

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [stableRes, fiatRes, tokenRes] = await Promise.all([
        fetch(STABLES_URL, { cache: 'no-store' }),
        fetch(FIATS_URL, { cache: 'no-store' }),
        fetch(LI_FI_API + '/tokens?chains=' + ARC_CHAIN_ID + '&chainTypes=EVM', { cache: 'no-store' }),
      ]);
      if (!stableRes.ok || !fiatRes.ok || !tokenRes.ok) throw new Error('FX data source is temporarily unavailable.');
      const stableJson = await stableRes.json();
      const fiatJson = await fiatRes.json();
      const tokenJson = await tokenRes.json();

      const marketStables = (Array.isArray(stableJson?.peggedAssets) ? stableJson.peggedAssets : [])
        .map((x: any) => ({ id: String(x.id), name: String(x.name || x.symbol || 'Stablecoin'), symbol: String(x.symbol || '').toUpperCase(), price: Number(x.price) }))
        .filter((x: any) => x.symbol && Number.isFinite(x.price) && x.price > 0);
      const tokenRows = Array.isArray(tokenJson) ? tokenJson : tokenJson?.tokens?.[String(ARC_CHAIN_ID)] || [];
      const stableSymbols = new Set(marketStables.map((x: any) => x.symbol));
      const nextStables = tokenRows
        .filter((x: any) => x.address && x.symbol && stableSymbols.has(String(x.symbol).toUpperCase()))
        .map((x: any) => { const symbol = String(x.symbol).toUpperCase(); const market = marketStables.find((m: any) => m.symbol === symbol); return { id: String(x.address).toLowerCase(), name: String(x.name || market?.name || symbol), symbol, price: Number(market?.price ?? x.priceUSD), address: String(x.address), decimals: Number(x.decimals ?? 6) }; })
        .filter((x: Stablecoin) => isAddress(x.address) && Number.isFinite(x.price) && x.price > 0)
        .sort((a: Stablecoin, b: Stablecoin) => a.symbol.localeCompare(b.symbol));

      const nextFiats = Object.entries(fiatJson || {})
        .map(([code, name]) => ({ code: code.toUpperCase(), name: String(name) }))
        .sort((a, b) => a.code.localeCompare(b.code));

      if (!nextStables.length) throw new Error('No live stablecoin prices were returned.');
      setStables(nextStables);
      setFiats(nextFiats);

      if (!nextStables.some((x: Stablecoin) => x.symbol === from)) {
        setFrom(nextStables.some((x: Stablecoin) => x.symbol === 'USDC') ? 'USDC' : nextStables[0].symbol);
      }
      if (!nextFiats.some((x: Fiat) => x.code === to)) {
        setTo(nextFiats.some((x: Fiat) => x.code === 'USD') ? 'USD' : nextFiats[0]?.code || 'USD');
      }
      setStableUpdated(Date.now());
    } catch (e: any) {
      setError(String(e?.message || 'Could not load FX data.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (address && !receiveAddress) setReceiveAddress(address);
  }, [address, receiveAddress]);

  const getUsdRates = async (codes: string[]) => {
    const unique = [...new Set(codes.filter((x) => x && x !== 'USD'))];
    if (!unique.length) return { date: '', rates: {} as Record<string, number> };
    const response = await fetch(
      RATES_URL + '?base=USD&quotes=' + encodeURIComponent(unique.join(',')),
      { cache: 'no-store' },
    );
    if (!response.ok) throw new Error('Fiat reference rate is unavailable.');
    const data = await response.json();
    return { date: String(data.date || ''), rates: data.rates || {} as Record<string, number> };
  };

  const convert = async () => {
    const numericAmount = Number(amount);
    if (!Number.isFinite(numericAmount) || numericAmount < 0) return;
    setQuoting(true);
    setError(null);

    try {
      let fromUsd = 1;
      let toUsd = 1;
      const fiatCodes: string[] = [];

      if (fromKind === 'stable') {
        const asset = stableMap.get(from);
        if (!asset) throw new Error('Selected stablecoin rate is unavailable.');
        fromUsd = asset.price;
      } else if (from !== 'USD') {
        fiatCodes.push(from);
      }

      if (toKind === 'stable') {
        const asset = stableMap.get(to);
        if (!asset) throw new Error('Selected stablecoin rate is unavailable.');
        toUsd = asset.price;
      } else if (to !== 'USD') {
        fiatCodes.push(to);
      }

      if (fiatCodes.length) {
        const data = await getUsdRates(fiatCodes);
        setFiatDate(data.date || null);

        if (fromKind === 'fiat' && from !== 'USD') {
          const value = Number(data.rates[from]);
          if (!value) throw new Error('Selected source fiat rate is unavailable.');
          fromUsd = 1 / value;
        }
        if (toKind === 'fiat' && to !== 'USD') {
          const value = Number(data.rates[to]);
          if (!value) throw new Error('Selected destination fiat rate is unavailable.');
          toUsd = 1 / value;
        }
      } else {
        setFiatDate(null);
      }

      const nextRate = fromUsd / toUsd;
      setRate(nextRate);
      setIndicativeQuote(numericAmount * nextRate);
    } catch (e: any) {
      setRate(null);
      setIndicativeQuote(null);
      setError(String(e?.message || 'Conversion rate is temporarily unavailable.'));
    } finally {
      setQuoting(false);
    }
  };

  useEffect(() => {
    if (!loading) convert();
  }, [amount, fromKind, toKind, from, to, loading, stables.length, fiats.length]);

  useEffect(() => {
    let cancelled = false;
    const loadBalance = async () => {
      if (!address || !fromToken || !publicClient) { setSourceBalance(null); return; }
      try {
        if (fromToken.symbol === 'USDC' && fromToken.address.toLowerCase() === ARC_USDC_PREDEPLOY) {
          const response = await fetch('/api/blockchain/arc/balance/' + address, { cache: 'no-store' });
          if (!response.ok) throw new Error('balance unavailable');
          const data = await response.json();
          if (!cancelled) setSourceBalance(formatUnits(BigInt(data.rawBalance || '0'), 18));
        } else {
          const raw = await publicClient.readContract({ address: fromToken.address as any, abi: [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }] as const, functionName: 'balanceOf', args: [address as any] });
          if (!cancelled) setSourceBalance(formatUnits(raw as bigint, fromToken.decimals));
        }
      } catch { if (!cancelled) setSourceBalance(null); }
    };
    loadBalance();
    return () => { cancelled = true; };
  }, [address, fromToken?.address, fromToken?.decimals, publicClient]);

  const cleanFxError = (e: unknown) => {
    const message = e instanceof Error ? e.message : String(e || '');
    const lower = message.toLowerCase();
    if (/user rejected|user denied|rejected the request|4001/.test(lower)) return 'Rejected';
    if (/insufficient|not enough funds|exceeds balance|too small|minimum/.test(lower)) return 'Asset Too Low. Increase the amount.';
    if (/failed to fetch|http request failed|network request|rpc/.test(lower)) return 'Network check failed. Please try again.';
    return message || 'FX transaction failed. Please try again.';
  };

  const switchToArc = async () => {
    const ethereum = (window as any).ethereum;
    if (!ethereum?.request) throw new Error('Connected wallet provider is unavailable.');
    try {
      await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x13b2' }] });
    } catch (switchError: any) {
      if (switchError?.code !== 4902 && switchError?.code !== -32603) throw switchError;
      await ethereum.request({ method: 'wallet_addEthereumChain', params: [{ chainId: '0x13b2', chainName: 'Arc Mainnet', nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 }, rpcUrls: ['https://rpc.mainnet.arc.io'], blockExplorerUrls: ['https://arcscan.app'] }] });
      await ethereum.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: '0x13b2' }] });
    }
  };

  const requestQuote = async () => {
    if (!address || !fromToken || !toToken || !amount || Number(amount) <= 0) return;
    if (!receiveAddress || !isAddress(receiveAddress)) { setError('Enter a valid receive wallet address.'); return; }
    setQuoteLoading(true);
    setQuote(null);
    setExecutionConfirmed(false);
    setExecutionHash(null);
    setError(null);
    try {
      const rawAmount = parseUnits(amount, fromToken.decimals).toString();
      const params = new URLSearchParams({
        fromChain: String(ARC_CHAIN_ID),
        toChain: String(ARC_CHAIN_ID),
        fromToken: fromToken.address,
        toToken: toToken.address,
        fromAddress: address,
        toAddress: receiveAddress,
        fromAmount: rawAmount,
        order: 'CHEAPEST',
        fx: '1',
      });
      const response = await fetch('/api/lifi/quote?' + params.toString(), { cache: 'no-store', headers: { Accept: 'application/json' } });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.details?.message || data?.error || 'Unable to get executable FX quote.');
      setQuote(data);
      setQuoteUpdatedAt(Date.now());
    } catch (e) {
      setQuote(null);
      setError(cleanFxError(e));
    } finally {
      setQuoteLoading(false);
    }
  };

  const executeQuote = async () => {
    if (!quote?.transactionRequest || !walletClient || !publicClient || !address) return;
    setExecuting(true);
    setExecutionStage('wallet');
    setError(null);
    try {
      if (connectedChainId !== ARC_CHAIN_ID) await switchToArc();
      if (quote?.estimate?.approvalAddress && fromToken && publicClient && fromToken.address.toLowerCase() !== ARC_USDC_PREDEPLOY.toLowerCase()) {
        const required = BigInt(quote.estimate.fromAmount || '0');
        const allowance = BigInt(await publicClient.readContract({ address: fromToken.address as any, abi: ERC20_APPROVE_ABI, functionName: 'allowance', args: [address as any, quote.estimate.approvalAddress as any] }) as any);
        if (allowance < required) {
          const approvalData = encodeFunctionData({ abi: ERC20_APPROVE_ABI, functionName: 'approve', args: [quote.estimate.approvalAddress, required] });
          const approvalHash = await walletClient.sendTransaction({ account: address, to: fromToken.address, data: approvalData, value: 0n, chainId: ARC_CHAIN_ID } as any);
          setExecutionStage('confirming');
          const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approvalHash });
          if (approvalReceipt.status !== 'success') throw new Error('Token approval failed.');
          setExecutionStage('wallet');
        }
      }

      const tx = quote.transactionRequest;
      if (!tx?.to || !tx?.data) throw new Error('FX route is incomplete. Request a fresh quote.');
      const txRequest: any = { account: address as any, to: tx.to, data: tx.data, value: tx.value ? BigInt(tx.value) : 0n, chainId: ARC_CHAIN_ID };
      if (tx.gasLimit) txRequest.gas = BigInt(tx.gasLimit); else if (tx.gas) txRequest.gas = BigInt(tx.gas);
      if (tx.maxFeePerGas) txRequest.maxFeePerGas = BigInt(tx.maxFeePerGas);
      if (tx.maxPriorityFeePerGas) txRequest.maxPriorityFeePerGas = BigInt(tx.maxPriorityFeePerGas);
      if (tx.gasPrice) txRequest.gasPrice = BigInt(tx.gasPrice);
      const hash = await walletClient.sendTransaction(txRequest);
      setExecutionHash(hash);
      setExecutionStage('confirming');
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('FX transaction reverted onchain.');
      setExecutionConfirmed(true);
      setExecutionStage(null);
      setQuote(null);
      setAmount('');
      await refreshData();
    } catch (e) {
      setError(cleanFxError(e));
      setExecutionStage(null);
    } finally {
      setExecuting(false);
    }
  };

  const swap = () => {
    const oldFrom = from;
    const oldFromKind = fromKind;
    setFrom(to);
    setFromKind(toKind);
    setTo(oldFrom);
    setToKind(oldFromKind);
  };

  const changeKind = (side: 'from' | 'to', kind: Kind) => {
    const defaultValue = kind === 'stable'
      ? (stables.some((x) => x.symbol === 'USDC') ? 'USDC' : stables[0]?.symbol || '')
      : (fiats.some((x) => x.code === 'USD') ? 'USD' : fiats[0]?.code || '');
    if (side === 'from') {
      setFromKind(kind);
      if (kind !== fromKind) setFrom(defaultValue);
    } else {
      setToKind(kind);
      if (kind !== toKind) setTo(defaultValue);
    }
  };

  const renderAssetName = (kind: Kind, value: string) => {
    if (kind === 'stable') return stables.find((x) => x.symbol === value)?.name || 'Stablecoin';
    return fiats.find((x) => x.code === value)?.name || 'Fiat currency';
  };

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">Live conversion</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">FX</h1>
            <p className="mt-2 text-sm text-zinc-400">Convert stablecoins and fiat currencies with source-aware rates.</p>
          </div>
          <button onClick={load} disabled={loading} className="p-2.5 rounded-xl border border-zinc-800 text-zinc-400 hover:text-white hover:border-blue-500/30">
            <RefreshCw className={loading ? 'w-4 h-4 animate-spin' : 'w-4 h-4'} />
          </button>
        </div>

        {!isConnected || !address ? (
          <div className="rounded-2xl border border-blue-500/20 bg-[#0d0f12] p-8 text-center">
            <WalletCards className="w-8 h-8 text-blue-400 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-white">Connect your wallet</h2>
            <p className="text-sm text-zinc-400 mt-1 mb-5">Connect the wallet that holds the stablecoin you want to convert.</p>
            <button onClick={connectWallet} className="px-5 py-3 rounded-xl bg-white text-black text-sm font-bold hover:bg-zinc-200">Connect Wallet</button>
          </div>
        ) : (
          <div className="rounded-2xl border border-blue-500/20 bg-[#0d0f12] p-5 sm:p-7">
          <div className="grid lg:grid-cols-[1fr_auto_1fr] gap-3 items-end">
            <Picker
              label="From"
              kind={fromKind}
              value={from}
              amount={amount}
              setAmount={setAmount}
              onKindChange={(k) => changeKind('from', k)}
              onValueChange={setFrom}
              stables={stables}
              fiats={fiats}
              search={fromSearch}
              setSearch={setFromSearch}
            />

            <button onClick={swap} className="w-10 h-10 mb-1 mx-auto rounded-full border border-zinc-700 bg-zinc-900 text-zinc-300 hover:text-white hover:border-blue-500 transition flex items-center justify-center" aria-label="Swap currencies">
              <ArrowDownUp className="w-4 h-4" />
            </button>

            <Picker
              label="To"
              kind={toKind}
              value={to}
              amount=""
              setAmount={() => {}}
              onKindChange={(k) => changeKind('to', k)}
              onValueChange={setTo}
              stables={stables}
              fiats={fiats}
              search={toSearch}
              setSearch={setToSearch}
            />
          </div>

          <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-950/70 p-5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">You convert</span>
              <span className="text-xl font-semibold text-white">{formatValue(Number(amount) || 0)} {from}</span>
            </div>
            <div className="my-4 h-px bg-zinc-800" />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-zinc-500">You receive</span>
              <span className="text-2xl font-bold text-blue-400">
                {quoting ? <Loader2 className="w-5 h-5 animate-spin" /> : stableExecution ? (quote?.estimate?.toAmount && toToken ? formatValue(Number(formatUnits(BigInt(quote.estimate.toAmount), toToken.decimals))) + ' ' + to : '—') : indicativeQuote === null ? '—' : formatValue(indicativeQuote) + ' ' + to}
              </span>
            </div>
          </div>

          {stableExecution && (
            <div className="mt-4 rounded-2xl border border-blue-500/15 bg-blue-500/[0.035] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div><div className="text-xs font-semibold text-white">Receive wallet</div><div className="text-[10px] text-zinc-500 mt-0.5">Defaults to the connected wallet.</div></div>
                <button onClick={() => setShowRecipient((v) => !v)} className="text-[11px] text-blue-400 hover:text-blue-300">{showRecipient ? 'Hide alternate wallet' : 'Use another wallet'}</button>
              </div>
              {showRecipient && <input value={receiveAddress} onChange={(e) => { setReceiveAddress(e.target.value); setQuote(null); }} placeholder="0x... receive address" className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm font-mono text-white outline-none focus:border-blue-500/50" />}
              <div className="grid sm:grid-cols-3 gap-3 text-xs">
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"><div className="text-[10px] text-zinc-600 uppercase tracking-widest">GEN-0FI fee</div><div className="mt-1 font-semibold text-white">{formatValue(feeAmount)} {from}</div></div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"><div className="text-[10px] text-zinc-600 uppercase tracking-widest">Rate</div><div className="mt-1 font-semibold text-white">{rate === null ? '—' : '1 ' + from + ' ≈ ' + formatValue(rate) + ' ' + to}</div></div>
                <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3"><div className="text-[10px] text-zinc-600 uppercase tracking-widest">Source balance</div><div className="mt-1 font-semibold text-white">{sourceBalance === null ? '—' : formatValue(Number(sourceBalance)) + ' ' + from}</div></div>
              </div>
            </div>
          )}

          <div className="mt-4 grid sm:grid-cols-3 gap-3">
            <Stat label="Rate" value={rate === null ? 'Unavailable' : '1 ' + from + ' = ' + formatValue(rate) + ' ' + to} />
            <Stat label="Coverage" value={loading ? 'Loading…' : stables.length + ' stablecoins · ' + fiats.length + ' fiat currencies'} />
            <Stat label="Updated" value={fiatDate || (stableUpdated ? new Date(stableUpdated).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—')} />
          </div>

          <div className="mt-4">
            {stableExecution ? (
              <button onClick={quote ? executeQuote : requestQuote} disabled={quoteLoading || executing || !amount || Number(amount) <= 0} className="w-full rounded-xl bg-blue-500 hover:bg-blue-400 disabled:opacity-40 text-white font-semibold py-3 transition flex items-center justify-center gap-2">
                {(quoteLoading || executing) && <Loader2 className="w-4 h-4 animate-spin" />}
                {executing ? (executionStage === 'confirming' ? 'Confirming onchain...' : 'Confirm in wallet...') : quote ? 'Execute FX Swap' : 'Get live FX quote'}
              </button>
            ) : (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 px-4 py-3 text-xs text-zinc-400">Fiat conversion is valuation-only here. Actual fiat settlement requires a regulated on/off-ramp or banking integration.</div>
            )}
          </div>

          {quote?.estimate?.toAmount && toToken && (
            <div className="mt-4 rounded-xl border border-green-500/20 bg-green-500/[0.04] p-4 space-y-2 text-xs">
              <div className="flex justify-between gap-3"><span className="text-zinc-500">Executable receive</span><span className="font-semibold text-white">{formatValue(Number(formatUnits(BigInt(quote.estimate.toAmount), toToken.decimals)))} {to}</span></div>
              <div className="flex justify-between gap-3"><span className="text-zinc-500">Route</span><span className="text-zinc-300">{quote.toolDetails?.name || quote.tool || 'LI.FI'}</span></div>
              <div className="flex justify-between gap-3"><span className="text-zinc-500">Quote</span><span className="text-zinc-300">{quoteUpdatedAt ? new Date(quoteUpdatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}</span></div>
            </div>
          )}

          {executionConfirmed && executionHash && (
            <div className="mt-4 rounded-xl border border-green-500/25 bg-green-500/[0.05] px-4 py-3 text-xs text-green-300 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> FX swap confirmed on Arc Mainnet.</span>
              <a href={ARC_MAINNET_EXPLORER_URL + '/tx/' + executionHash} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-blue-400 hover:text-blue-300"><ExternalLink className="w-3.5 h-3.5" /> View</a>
            </div>
          )}

          {error && <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/5 px-4 py-3 text-xs text-red-300">{error}</div>}

          <div className="mt-4 rounded-xl border border-blue-500/10 bg-blue-500/[0.03] px-4 py-3 flex items-start gap-2.5 text-[11px] text-zinc-500">
            <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
            <span>Stablecoin prices use live DeFiLlama market data. Fiat rates use Frankfurter daily reference data from central-bank and official sources. These are valuation rates, not execution quotes.</span>
          </div>

        <div className="grid lg:grid-cols-[1.35fr_.65fr] gap-4">
          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="flex items-center gap-3">
              <Coins className="w-5 h-5 text-blue-400" />
              <div><h2 className="text-sm font-semibold text-white">Stablecoin market</h2><p className="text-[11px] text-zinc-500 mt-0.5">Live stablecoins available for conversion.</p></div>
            </div>
            <div className="mt-4 grid sm:grid-cols-2 xl:grid-cols-3 gap-2">
              {stables.slice(0, 24).map((x) => (
                <button key={x.id} onClick={() => { setFromKind('stable'); setFrom(x.symbol); }} className="text-left rounded-xl border border-zinc-800 bg-zinc-950/60 px-3.5 py-3 hover:border-blue-500/30">
                  <div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold text-white">{x.symbol}</span><span className="text-[10px] text-zinc-500">{formatValue(x.price)} USD</span></div>
                  <div className="mt-1 text-[10px] text-zinc-600 truncate">{x.name}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
            <div className="flex items-center gap-3">
              <Globe2 className="w-5 h-5 text-blue-400" />
              <div><h2 className="text-sm font-semibold text-white">Fiat coverage</h2><p className="text-[11px] text-zinc-500 mt-0.5">Searchable currency universe.</p></div>
            </div>
            <div className="mt-4 rounded-xl border border-zinc-800 bg-zinc-950/60 px-4 py-3"><div className="text-2xl font-bold text-white">{fiats.length || '—'}</div><div className="text-[11px] text-zinc-500 mt-1">available fiat currencies</div></div>
            <div className="mt-4 space-y-2 text-[11px] text-zinc-500">
              <div className="flex items-center gap-2"><Clock3 className="w-3.5 h-3.5" /> Fiat rates use published reference data.</div>
              <div className="flex items-center gap-2"><TrendingUp className="w-3.5 h-3.5" /> Stablecoin prices can move throughout the day.</div>
              <div className="flex items-center gap-2"><Info className="w-3.5 h-3.5" /> No hard-coded exchange rate is used.</div>
            </div>
          </div>
          <div className="mt-4 rounded-xl border border-blue-500/10 bg-blue-500/[0.03] px-4 py-3 text-[11px] text-zinc-500">
            <Info className="w-3.5 h-3.5 inline mr-2 text-blue-400" />
            Stablecoin execution uses LI.FI routing on Arc Mainnet. GEN-0FI charges 1.00% on executed FX swaps. Fiat amounts are valuation references and do not create a fiat wallet balance.
          </div>

        </div>
        )}
      </div>
    </div>
  );
};

function Picker(props: {
  label: string;
  kind: Kind;
  value: string;
  amount: string;
  setAmount: (value: string) => void;
  onKindChange: (kind: Kind) => void;
  onValueChange: (value: string) => void;
  stables: Stablecoin[];
  fiats: Fiat[];
  search: string;
  setSearch: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const list = props.kind === 'stable'
    ? props.stables.filter((x) => {
        const q = props.search.toLowerCase().trim();
        return !q || x.symbol.toLowerCase().includes(q) || x.name.toLowerCase().includes(q);
      }).slice(0, 100)
    : props.fiats.filter((x) => {
        const q = props.search.toLowerCase().trim();
        return !q || x.code.toLowerCase().includes(q) || x.name.toLowerCase().includes(q);
      }).slice(0, 100);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-zinc-500">{props.label}</span>
        {props.label === 'From' && <input value={props.amount} onChange={(e) => props.setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal" className="w-32 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2 text-right text-sm font-mono text-white outline-none focus:border-blue-500/50" />}
      </div>

      <div className="flex gap-2">
        <div className="flex rounded-xl border border-zinc-800 bg-zinc-950 p-1 shrink-0">
          <button onClick={() => props.onKindChange('stable')} className={props.kind === 'stable' ? 'rounded-lg px-2.5 py-2 text-[10px] font-semibold bg-blue-500/15 text-blue-300' : 'rounded-lg px-2.5 py-2 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200'}>Stable</button>
          <button onClick={() => props.onKindChange('fiat')} className={props.kind === 'fiat' ? 'rounded-lg px-2.5 py-2 text-[10px] font-semibold bg-blue-500/15 text-blue-300' : 'rounded-lg px-2.5 py-2 text-[10px] font-semibold text-zinc-500 hover:text-zinc-200'}>Fiat</button>
        </div>

        <div className="relative flex-1">
          <button onClick={() => setOpen((x) => !x)} className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-left hover:border-blue-500/30">
            <span className="block text-sm font-semibold text-white">{props.value || 'Select'}</span>
            <span className="block mt-0.5 text-[10px] text-zinc-600 truncate">
              {props.kind === 'stable'
                ? props.stables.find((x) => x.symbol === props.value)?.name || 'Stablecoin'
                : props.fiats.find((x) => x.code === props.value)?.name || 'Fiat currency'}
            </span>
          </button>

          {open && (
            <div className="absolute z-30 top-[calc(100%+8px)] left-0 right-0 rounded-xl border border-zinc-700 bg-[#111317] shadow-2xl overflow-hidden">
              <div className="p-2 border-b border-zinc-800">
                <div className="flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2">
                  <Search className="w-3.5 h-3.5 text-zinc-500" />
                  <input autoFocus value={props.search} onChange={(e) => props.setSearch(e.target.value)} placeholder={props.kind === 'stable' ? 'Search stablecoins' : 'Search fiat currencies'} className="w-full bg-transparent text-xs text-white outline-none" />
                </div>
              </div>
              <div className="max-h-64 overflow-y-auto p-1.5">
                {list.map((x: any) => (
                  <button
                    key={props.kind === 'stable' ? x.id : x.code}
                    onClick={() => { props.onValueChange(props.kind === 'stable' ? x.symbol : x.code); setOpen(false); }}
                    className="w-full rounded-lg px-3 py-2.5 text-left hover:bg-zinc-900"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-white">{props.kind === 'stable' ? x.symbol : x.code}</span>
                      {props.kind === 'stable' && <span className="text-[10px] text-zinc-500">{formatValue(x.price)} USD</span>}
                    </div>
                    <div className="text-[10px] text-zinc-600 mt-0.5 truncate">{x.name}</div>
                  </button>
                ))}
                {!list.length && <div className="px-3 py-6 text-center text-xs text-zinc-500">No matching assets.</div>}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3.5"><div className="text-[10px] uppercase tracking-widest text-zinc-600">{label}</div><div className="mt-1 text-sm font-semibold text-white">{value}</div></div>;
}
