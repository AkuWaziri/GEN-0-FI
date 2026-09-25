import React, { useMemo, useState } from 'react';
import { Check, Copy, Send, ArrowDownToLine, WalletCards, ExternalLink, Loader2 } from 'lucide-react';
import { encodeFunctionData, formatUnits, parseUnits, isAddress } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ARC_CHAIN_ID, ARC_MAINNET_EXPLORER_URL } from '../../config/arc';
import { useWallet } from '../../context/WalletContext';
import { recordConfirmedAction } from '../../services/points/pointsService';

const GEN0FI_FEE_RATE = 0.005;
const GEN0FI_FEE_WALLET = '0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c';
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`;
const EURC_ADDRESS = '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1' as `0x${string}`;
const ERC20_ABI = [{ type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] }, { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] }] as const;

type Mode = 'send' | 'receive';
type Token = 'USDC' | 'EURC';

interface WalletViewProps {
  initialMode?: Mode;
}

export const WalletView: React.FC<WalletViewProps> = ({ initialMode = 'send' }) => {
  const { address, balanceUSDC, refreshData } = useWallet();
  const { chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });

  const [mode, setMode] = useState<Mode>(initialMode);

  React.useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);
  const [token, setToken] = useState<Token>('USDC');
  const [tokenBalance, setTokenBalance] = useState('0.00');
  const [feeUsdc, setFeeUsdc] = useState(0);
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [estimatedNetworkFee, setEstimatedNetworkFee] = useState('0.000000');

  const numericAmount = Number(amount);
  const tokenFee = Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount * GEN0FI_FEE_RATE : 0;
  const fee = token === 'USDC' ? tokenFee : feeUsdc;
  const netAmount = token === 'USDC' && Number.isFinite(numericAmount) && numericAmount > fee ? numericAmount - fee : numericAmount;

  const formattedFee = useMemo(() => fee > 0 ? fee.toFixed(6) : '0.000000', [fee, token]);
  const formattedNet = useMemo(() => netAmount > 0 ? netAmount.toFixed(6) : '0.000000', [netAmount]);


  React.useEffect(() => {
    let cancelled = false;
    if (!address) return;
    if (token === 'USDC') {
      if (balanceUSDC && balanceUSDC !== 'Unavailable' && !cancelled) setTokenBalance(balanceUSDC.replace(/,/g, ''));
      setFeeUsdc(tokenFee);
      return () => { cancelled = true; };
    }
    if (!publicClient) return;
    publicClient.readContract({ address: EURC_ADDRESS, abi: ERC20_ABI, functionName: 'balanceOf', args: [address as `0x${string}`] })
      .then((raw) => { if (!cancelled) setTokenBalance(formatUnits(raw as bigint, 6)); })
      .catch(() => { if (!cancelled) setTokenBalance('0.00'); });
    fetch(`/api/lifi/eurc-usdc-rate?amount=1&address=${address}`, { cache: 'no-store' })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error('EURC/USDC rate unavailable')))
      .then((quote) => {
        const oneEurcInUsdc = Number(formatUnits(BigInt(quote.toAmount), 6));
        if (!Number.isFinite(oneEurcInUsdc) || oneEurcInUsdc <= 0) throw new Error('Invalid EURC/USDC rate');
        if (!cancelled) setFeeUsdc(tokenFee * oneEurcInUsdc);
      })
      .catch(() => { if (!cancelled) setFeeUsdc(0); });
    return () => { cancelled = true; };
  }, [address, publicClient, token, tokenFee, balanceUSDC]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const send = async () => {
    setStatus(null);
    setTxHash(null);
    if (!address || !walletClient) return setStatus('Connect your wallet first.');
    if (chainId !== ARC_CHAIN_ID) return setStatus('Switch to Arc Mainnet before sending.');
    if (!isAddress(recipient)) return setStatus('Enter a valid recipient address.');
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) return setStatus('Enter an amount greater than zero.');
    if (numericAmount < 0.001) return setStatus(`Asset Too Low. Minimum send amount is 0.001 ${token}.`);
    if (token === 'EURC' && feeUsdc <= 0) return setStatus('EURC/USDC fee rate is temporarily unavailable. Please try again.');
    if (Number(tokenBalance) < numericAmount) return setStatus(`Insufficient ${token} balance. You have ${Number(tokenBalance).toFixed(6)} ${token} available.`);

    setSending(true);
    try {
      const recipientAddress = recipient as `0x${string}`;
      const feeAddress = GEN0FI_FEE_WALLET as `0x${string}`;
      const recipientRaw = token === 'USDC'
        ? parseUnits(amount, 18) - parseUnits(fee.toFixed(18), 18)
        : parseUnits(amount, 6);
      const feeUsdcRaw = parseUnits(fee.toFixed(18), 18);
      if (recipientRaw <= 0n) return setStatus('Asset Too Low. Increase the amount.');

      const erc20RecipientData = encodeFunctionData({
        abi: ERC20_ABI,
        functionName: 'transfer',
        args: [recipientAddress, recipientRaw],
      });
      const calls = token === 'USDC'
        ? [
            { to: recipientAddress, data: '0x' as `0x${string}`, value: `0x${recipientRaw.toString(16)}` },
            { to: feeAddress, data: '0x' as `0x${string}`, value: `0x${feeUsdcRaw.toString(16)}` },
          ]
        : [
            { to: EURC_ADDRESS, data: erc20RecipientData, value: '0x0' },
            { to: feeAddress, data: '0x' as `0x${string}`, value: `0x${feeUsdcRaw.toString(16)}` },
          ];

      const ethereum = (window as any).ethereum;
      if (!ethereum?.request) throw new Error('Connected wallet provider is unavailable.');

      try {
        setStatus('Confirm the Send + GEN-0FI fee transaction in your wallet...');
        const batch = await ethereum.request({
          method: 'wallet_sendCalls',
          params: [{ version: '2.0.0', from: address, chainId: `0x${ARC_CHAIN_ID.toString(16)}`, atomicRequired: true, calls }],
        });
        const batchId = batch?.id;
        if (!batchId) throw new Error('Wallet did not return a batch identifier.');
        let result: any = null;
        for (let i = 0; i < 45; i++) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
          result = await ethereum.request({ method: 'wallet_getCallsStatus', params: [batchId] });
          if (result?.status === 200) break;
        }
        if (!result?.receipts?.length) throw new Error('Send batch did not return a confirmed receipt.');
        const receipt = result.receipts[0];
        if (receipt.status !== '0x1') throw new Error('Send and fee transaction failed onchain.');
        setTxHash(receipt.transactionHash);
      } catch (batchError: any) {
        const batchMessage = String(batchError?.shortMessage || batchError?.message || '');
        if (/user rejected|user denied|rejected the request|4001/i.test(batchMessage) || batchError?.code === 4001) throw batchError;

        setStatus('Batch mode unavailable. Sending directly through your wallet...');
        if (token === 'USDC') {
          const recipientTx = await walletClient.sendTransaction({ account: address as `0x${string}`, to: recipientAddress, value: recipientRaw, chain: walletClient.chain });
          setTxHash(recipientTx);
          setStatus('USDC sent. Confirming the GEN-0FI fee transaction...');
          const feeTx = await walletClient.sendTransaction({ account: address as `0x${string}`, to: feeAddress, value: feeUsdcRaw, chain: walletClient.chain });
          setTxHash(feeTx);
        } else {
          const recipientTx = await walletClient.sendTransaction({ account: address as `0x${string}`, to: EURC_ADDRESS, data: erc20RecipientData, value: 0n, chain: walletClient.chain });
          setTxHash(recipientTx);
          setStatus('EURC sent. Confirming the GEN-0FI fee transaction...');
          const feeTx = await walletClient.sendTransaction({ account: address as `0x${string}`, to: feeAddress, value: feeUsdcRaw, chain: walletClient.chain });
          setTxHash(feeTx);
        }
      }

      setStatus(`Sent ${formattedNet} ${token}. GEN-0FI fee: ${formattedFee} USDC.`);
      if (txHash) {
        recordConfirmedAction(address, txHash, 'send').catch(() => {
          // Points sync is secondary to the confirmed wallet transaction.
        });
      }
      setAmount('');
      setRecipient('');
      await refreshData();
    } catch (error: any) {
      const message = String(error?.shortMessage || error?.message || 'Send failed. Please try again.');
      if (/user rejected|user denied|rejected the request|4001/i.test(message) || error?.code === 4001) setStatus('Rejected');
      else setStatus(message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">Wallet</p>
          <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">Send & Receive</h1>
          <p className="mt-2 text-sm text-zinc-400">Move USDC, EURC directly from your connected wallet on Arc. Network.</p>
        </div>

        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-zinc-900 border border-zinc-800 max-w-sm">
          <button onClick={() => setMode('send')} className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-colors ${mode === 'send' ? 'bg-blue-500/15 text-blue-300 border border-blue-400/20' : 'text-zinc-500 hover:text-zinc-200'}`}>
            <Send className="w-3.5 h-3.5" /> Send
          </button>
          <button onClick={() => setMode('receive')} className={`flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold transition-colors ${mode === 'receive' ? 'bg-blue-500/15 text-blue-300 border border-blue-400/20' : 'text-zinc-500 hover:text-zinc-200'}`}>
            <ArrowDownToLine className="w-3.5 h-3.5" /> Receive
          </button>
        </div>

        {mode === 'send' ? (
          <div className="max-w-xl rounded-2xl border border-blue-500/20 bg-[#0d0f12] p-5 sm:p-7 space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs font-semibold text-white">Send {token}</div>
                <div className="text-[11px] text-zinc-500 mt-1">Available: {tokenBalance || '0.00'} {token}</div>
              </div>
              <WalletCards className="w-5 h-5 text-blue-400" />
            </div>

            <label className="block">
              <span className="text-[11px] text-zinc-500">Asset</span>
              <select value={token} onChange={(e) => setToken(e.target.value as Token)} className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-white outline-none focus:border-blue-500/50">
                <option value="USDC">USDC</option>
                <option value="EURC">EURC</option>
              </select>
            </label>

            <label className="block">
              <span className="text-[11px] text-zinc-500">Recipient</span>
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-white outline-none focus:border-blue-500/50" />
            </label>

            <label className="block">
              <span className="text-[11px] text-zinc-500">Amount</span>
              <div className="mt-2 flex items-center rounded-xl border border-zinc-800 bg-zinc-950 px-3.5">
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal" className="w-full bg-transparent py-3 text-lg font-mono text-white outline-none" />
                <span className="text-xs font-semibold text-zinc-400">{token}</span>
              </div>
            </label>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-400"><span>Send amount</span><span>{amount || '0'} {token}</span></div>
              <div className="flex justify-between text-zinc-300 font-semibold"><span>Recipient receives</span><span>{formattedNet} {token}</span></div>
            </div>

            {status && <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-3 text-xs text-zinc-300">{status}</div>}

            <button onClick={send} disabled={sending} className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-xs font-bold text-black hover:bg-zinc-200 disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending...' : `Send ${token}`}
            </button>

            {txHash && <a href={`${ARC_MAINNET_EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300"><ExternalLink className="w-3 h-3" /> View confirmed transfer</a>}
          </div>
        ) : (
          <div className="max-w-xl rounded-2xl border border-cyan-400/20 bg-[#0d0f12] p-5 sm:p-7 space-y-5">
            <div>
              <div className="text-xs font-semibold text-white">Send and Receive USDC, EURC directly on Arc.</div>
              <div className="text-[11px] text-zinc-500 mt-1">Send supported Arc Mainnet USDC or EURC to this connected wallet.</div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950 p-5 text-center">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600 font-mono mb-3">Your Arc address</div>
              <div className="break-all font-mono text-sm text-white">{address || 'Connect wallet'}</div>
              <button onClick={copyAddress} disabled={!address} className="mt-4 inline-flex items-center gap-2 rounded-xl border border-zinc-700 px-3.5 py-2 text-xs font-semibold text-zinc-300 hover:text-white hover:border-blue-500/40">
                {copied ? <Check className="w-3.5 h-3.5 text-lime-300" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy address'}
              </button>
            </div>
            <div className="rounded-xl border border-cyan-400/10 bg-cyan-400/[0.03] px-4 py-3 text-[11px] text-zinc-500">
              Only send assets supported by Arc Mainnet to this address. GEN-0FI does not take a fee for receiving.
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
