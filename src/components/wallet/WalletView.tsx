import React, { useMemo, useState } from 'react';
import { Check, Copy, Send, ArrowDownToLine, WalletCards, ExternalLink, Loader2 } from 'lucide-react';
import { parseUnits, isAddress } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { ARC_CHAIN_ID, ARC_MAINNET_EXPLORER_URL } from '../../config/arc';
import { useWallet } from '../../context/WalletContext';

const GEN0FI_FEE_RATE = 0.005;
const GEN0FI_FEE_WALLET = '0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c';

type Mode = 'send' | 'receive';

export const WalletView: React.FC = () => {
  const { address, balanceUSDC, refreshData } = useWallet();
  const { chainId } = useAccount();
  const { data: walletClient } = useWalletClient();
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID });

  const [mode, setMode] = useState<Mode>('send');
  const [recipient, setRecipient] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [estimatedNetworkFee, setEstimatedNetworkFee] = useState('0.000000');

  const numericAmount = Number(amount);
  const fee = Number.isFinite(numericAmount) && numericAmount > 0 ? numericAmount * GEN0FI_FEE_RATE : 0;
  const netAmount = Number.isFinite(numericAmount) && numericAmount > fee ? numericAmount - fee : 0;

  const formattedFee = useMemo(() => fee > 0 ? fee.toFixed(6) : '0.000000', [fee]);
  const formattedNet = useMemo(() => netAmount > 0 ? netAmount.toFixed(6) : '0.000000', [netAmount]);

  const copyAddress = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const send = async () => {
    setStatus(null);
    setTxHash(null);

    if (!address || !walletClient) {
      setStatus('Connect your wallet first.');
      return;
    }
    if (chainId !== ARC_CHAIN_ID) {
      setStatus('Switch to Arc Mainnet before sending.');
      return;
    }
    if (!isAddress(recipient)) {
      setStatus('Enter a valid recipient address.');
      return;
    }
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setStatus('Enter an amount greater than zero.');
      return;
    }
    if (netAmount <= 0) {
      setStatus('Amount is too low to cover the 0.5% GEN-0FI fee.');
      return;
    }

    const available = Number(String(balanceUSDC || '0').replace(/,/g, ''));
    if (Number.isFinite(available) && numericAmount > available) {
      setStatus('Asset Too Low. Increase your available USDC balance.');
      return;
    }

    if (!publicClient) {
      setStatus('Arc network client is unavailable. Please try again.');
      return;
    }

    setSending(true);
    try {
      const grossRaw = parseUnits(amount, 18);
      const feeRaw = (grossRaw * 5n) / 1000n;
      const netRaw = grossRaw - feeRaw;

      // Reserve both Arc native transfers before collecting the GEN-0FI fee.
      // This prevents a successful fee transfer from being followed by a
      // recipient transfer that fails because the wallet cannot cover gas.
      const [feeGas, recipientGas, gasPrice] = await Promise.all([
        publicClient.estimateGas({
          account: address as `0x${string}`,
          to: GEN0FI_FEE_WALLET as `0x${string}`,
          value: feeRaw,
        }),
        publicClient.estimateGas({
          account: address as `0x${string}`,
          to: recipient as `0x${string}`,
          value: netRaw,
        }),
        publicClient.getGasPrice(),
      ]);
      const estimatedGasRaw = ((feeGas + recipientGas) * gasPrice * 11n) / 10n;
      const estimatedGas = Number(estimatedGasRaw) / 1e18;
      setEstimatedNetworkFee(estimatedGas.toFixed(6));
      if (Number.isFinite(available) && numericAmount + estimatedGas > available) {
        setStatus(`Asset Too Low. You need about ${estimatedGas.toFixed(6)} USDC extra for Arc network fees.`);
        return;
      }

      // Arc native USDC can only have one EOA recipient per native transfer.
      // GEN-0FI therefore executes the fee and recipient transfer sequentially
      // within one Send action rather than pretending they are one atomic tx.
      setStatus('Collecting GEN-0FI fee...');
      const feeHash = await walletClient.sendTransaction({
        account: address as `0x${string}`,
        to: GEN0FI_FEE_WALLET as `0x${string}`,
        value: feeRaw,
        chain: walletClient.chain,
      });

      await publicClient.waitForTransactionReceipt({ hash: feeHash });

      setStatus('Sending USDC to recipient...');
      const recipientHash = await walletClient.sendTransaction({
        account: address as `0x${string}`,
        to: recipient as `0x${string}`,
        value: netRaw,
        chain: walletClient.chain,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: recipientHash });
      if (receipt.status !== 'success') throw new Error('Recipient transfer failed onchain.');

      setTxHash(recipientHash);
      setStatus(`Sent ${formattedNet} USDC. GEN-0FI fee: ${formattedFee} USDC.`);
      setAmount('');
      setRecipient('');
      await refreshData();
    } catch (error: any) {
      const message = String(error?.shortMessage || error?.message || '');
      if (/user rejected|user denied|rejected the request|4001/i.test(message) || error?.code === 4001) {
        setStatus('Rejected');
      } else {
        setStatus(message || 'Send failed. Please try again.');
      }
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
          <p className="mt-2 text-sm text-zinc-400">Move USDC directly from your connected Arc wallet.</p>
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
                <div className="text-xs font-semibold text-white">Send USDC</div>
                <div className="text-[11px] text-zinc-500 mt-1">Available: {balanceUSDC || '0.00'} USDC</div>
              </div>
              <WalletCards className="w-5 h-5 text-blue-400" />
            </div>

            <label className="block">
              <span className="text-[11px] text-zinc-500">Recipient</span>
              <input value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="0x..." className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-white outline-none focus:border-blue-500/50" />
            </label>

            <label className="block">
              <span className="text-[11px] text-zinc-500">Amount</span>
              <div className="mt-2 flex items-center rounded-xl border border-zinc-800 bg-zinc-950 px-3.5">
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" inputMode="decimal" className="w-full bg-transparent py-3 text-lg font-mono text-white outline-none" />
                <span className="text-xs font-semibold text-zinc-400">USDC</span>
              </div>
            </label>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-3.5 space-y-2 text-xs">
              <div className="flex justify-between text-zinc-400"><span>Send amount</span><span>{amount || '0'} USDC</span></div>
              <div className="flex justify-between text-lime-300"><span>GEN-0FI fee · 0.5%</span><span>{formattedFee} USDC</span></div>
              <div className="flex justify-between text-zinc-300 font-semibold"><span>Recipient receives</span><span>{formattedNet} USDC</span></div>
              <div className="flex justify-between text-cyan-300"><span>Estimated Arc network fee</span><span>{estimatedNetworkFee} USDC</span></div>
              <div className="pt-1 text-[10px] text-zinc-600">Arc network gas is charged separately by the network in USDC.</div>
            </div>

            {status && <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 px-3.5 py-3 text-xs text-zinc-300">{status}</div>}

            <button onClick={send} disabled={sending} className="w-full flex items-center justify-center gap-2 rounded-xl bg-white py-3 text-xs font-bold text-black hover:bg-zinc-200 disabled:opacity-50">
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {sending ? 'Sending...' : 'Send USDC'}
            </button>

            {txHash && <a href={`${ARC_MAINNET_EXPLORER_URL}/tx/${txHash}`} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 text-[11px] text-blue-400 hover:text-blue-300"><ExternalLink className="w-3 h-3" /> View confirmed transfer</a>}
          </div>
        ) : (
          <div className="max-w-xl rounded-2xl border border-cyan-400/20 bg-[#0d0f12] p-5 sm:p-7 space-y-5">
            <div>
              <div className="text-xs font-semibold text-white">Receive USDC</div>
              <div className="text-[11px] text-zinc-500 mt-1">Send USDC to this connected wallet on Arc Mainnet.</div>
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
