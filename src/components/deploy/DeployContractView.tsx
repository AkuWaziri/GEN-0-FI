import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Code2, Copy, ExternalLink, Loader2, Rocket, ShieldCheck, Wallet, XCircle } from 'lucide-react';
import { ARC_MAINNET_CHAIN_ID, ARC_MAINNET_EXPLORER_URL } from '../../config/arc';

const USDC_ADDRESS = '0x3600000000000000000000000000000000000000';
const GEN0_FEE_WALLET = '0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c';
const DEPLOYMENT_FEE = 100_000n; // 0.10 USDC, ERC-20 representation uses 6 decimals.

// Runtime bytecode for a tiny real storage contract.
// calldata = empty: returns slot 0.
// calldata = 32 bytes: stores that word in slot 0.
// The creation prefix returns the runtime bytecode from memory.
const SIMPLE_STORAGE_BYTECODE =
  '0x601c600c600039601c6000f33660106014576000356000556000005b60005460005260206000f3';

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<any>;
};

declare global {
  interface Window {
    ethereum?: EthereumProvider;
  }
}

const shorten = (value: string, chars = 5) =>
  value ? `${value.slice(0, chars + 2)}…${value.slice(-chars)}` : '';

const txUrl = (hash: string) => `${ARC_MAINNET_EXPLORER_URL}/tx/${hash}`;
const addressUrl = (address: string) => `${ARC_MAINNET_EXPLORER_URL}/address/${address}`;

function encodeUsdcTransfer(to: string, amount: bigint): string {
  const selector = 'a9059cbb';
  const addressWord = to.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const amountWord = amount.toString(16).padStart(64, '0');
  return `0x${selector}${addressWord}${amountWord}`;
}

async function ensureArc(provider: EthereumProvider): Promise<void> {
  const chainId = await provider.request({ method: 'eth_chainId' });
  if (Number.parseInt(String(chainId), 16) === ARC_MAINNET_CHAIN_ID) return;

  try {
    await provider.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: '0x13b2' }],
    });
  } catch (error: any) {
    if (error?.code === 4902) {
      await provider.request({
        method: 'wallet_addEthereumChain',
        params: [{
          chainId: '0x13b2',
          chainName: 'Arc',
          nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
          rpcUrls: ['https://rpc.mainnet.arc.io'],
          blockExplorerUrls: [ARC_MAINNET_EXPLORER_URL],
        }],
      });
    } else {
      throw error;
    }
  }
}

export const DeployContractView: React.FC = () => {
  const [wallet, setWallet] = useState('');
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState<'idle' | 'fee' | 'deploy' | 'success' | 'error'>('idle');
  const [feeHash, setFeeHash] = useState('');
  const [deployHash, setDeployHash] = useState('');
  const [contractAddress, setContractAddress] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const detectWallet = useCallback(async () => {
    if (!window.ethereum) {
      setWallet('');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_accounts' });
      setWallet(accounts?.[0] || '');
    } catch {
      setWallet('');
    }
  }, []);

  useEffect(() => {
    void detectWallet();
    const ethereum = window.ethereum;
    if (!ethereum) return;
    const handleAccounts = () => void detectWallet();
    ethereum.request({ method: 'eth_chainId' }).catch(() => undefined);
    window.addEventListener('focus', handleAccounts);
    return () => window.removeEventListener('focus', handleAccounts);
  }, [detectWallet]);

  const connectWallet = async () => {
    if (!window.ethereum) {
      setError('No compatible wallet was detected. Install or unlock your EVM wallet.');
      setStage('error');
      return;
    }
    try {
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      setWallet(accounts?.[0] || '');
      setError('');
      setStage('idle');
    } catch (e: any) {
      setError(e?.message || 'Wallet connection was rejected.');
      setStage('error');
    }
  };

  const deploy = async () => {
    const provider = window.ethereum;
    if (!provider) {
      setError('No compatible wallet was detected.');
      setStage('error');
      return;
    }

    setBusy(true);
    setError('');
    setFeeHash('');
    setDeployHash('');
    setContractAddress('');
    setCopied(false);

    try {
      const accounts = await provider.request({ method: 'eth_requestAccounts' });
      const account = accounts?.[0];
      if (!account) throw new Error('Connect your wallet before deploying.');

      await ensureArc(provider);
      setWallet(account);

      // Step 1: charge the published GEN-0 deployment fee onchain.
      setStage('fee');
      const feeTx = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: account,
          to: USDC_ADDRESS,
          data: encodeUsdcTransfer(GEN0_FEE_WALLET, DEPLOYMENT_FEE),
          value: '0x0',
        }],
      });
      setFeeHash(feeTx);

      await provider.request({
        method: 'eth_getTransactionReceipt',
        params: [feeTx],
      }).then(async (receipt: any) => {
        for (let i = 0; !receipt && i < 120; i++) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          receipt = await provider.request({
            method: 'eth_getTransactionReceipt',
            params: [feeTx],
          });
        }
        if (!receipt) throw new Error('The fee transaction did not confirm.');
        if (receipt.status === '0x0') throw new Error('The GEN-0 deployment fee transaction reverted.');
      });

      // Step 2: deploy the real contract from the user's wallet.
      setStage('deploy');
      const gas = await provider.request({
        method: 'eth_estimateGas',
        params: [{
          from: account,
          data: SIMPLE_STORAGE_BYTECODE,
        }],
      });

      const deployTx = await provider.request({
        method: 'eth_sendTransaction',
        params: [{
          from: account,
          data: SIMPLE_STORAGE_BYTECODE,
          value: '0x0',
          gas,
        }],
      });
      setDeployHash(deployTx);

      let receipt: any = null;
      for (let i = 0; i < 120 && !receipt; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        receipt = await provider.request({
          method: 'eth_getTransactionReceipt',
          params: [deployTx],
        });
      }

      if (!receipt) throw new Error('The contract deployment did not confirm.');
      if (receipt.status === '0x0') throw new Error('The contract deployment reverted.');
      if (!receipt.contractAddress) throw new Error('Arc confirmed the deployment but returned no contract address.');

      setContractAddress(receipt.contractAddress);
      setStage('success');
    } catch (e: any) {
      setError(e?.shortMessage || e?.message || 'Deployment failed.');
      setStage('error');
    } finally {
      setBusy(false);
    }
  };

  const copyAddress = async () => {
    if (!contractAddress) return;
    await navigator.clipboard.writeText(contractAddress);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  const buttonLabel = !wallet
    ? 'CONNECT WALLET'
    : busy && stage === 'fee'
      ? 'CONFIRMING 0.10 USDC FEE…'
      : busy && stage === 'deploy'
        ? 'DEPLOYING ON ARC…'
        : 'DEPLOY SIMPLE CONTRACT';

  return (
    <div className="w-full">
      <div className="mb-5">
        <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400">GEN-0 Deploy</p>
        <h2 className="mt-1 text-xl font-extrabold text-white tracking-tight">Deploy Contract</h2>
        <p className="mt-2 text-xs text-zinc-500">
          Deploy a real, minimal storage contract directly from your wallet on Arc Mainnet.
        </p>
      </div>

      <section className="rounded-3xl border border-cyan-400/15 bg-[#0d0f12] p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-300/20 flex items-center justify-center text-cyan-300">
              <Code2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white">GEN-0 Simple Storage</h3>
              <p className="text-[10px] text-zinc-500 font-mono">LIVE CONTRACT DEPLOYMENT · ARC 5042</p>
            </div>
          </div>
          <span className="px-2 py-1 rounded-full bg-cyan-400/10 border border-cyan-300/15 text-[9px] font-mono text-cyan-300">
            ONCHAIN
          </span>
        </div>

        <div className="grid sm:grid-cols-3 gap-3 mt-5">
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <Rocket className="w-4 h-4 text-cyan-400 mb-2" />
            <p className="text-xs font-semibold text-white">0.10 USDC</p>
            <p className="text-[10px] text-zinc-600 mt-1">GEN-0 fee</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <ShieldCheck className="w-4 h-4 text-blue-400 mb-2" />
            <p className="text-xs font-semibold text-white">Wallet signed</p>
            <p className="text-[10px] text-zinc-600 mt-1">Fee + deployment</p>
          </div>
          <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <Code2 className="w-4 h-4 text-violet-400 mb-2" />
            <p className="text-xs font-semibold text-white">Simple storage</p>
            <p className="text-[10px] text-zinc-600 mt-1">Read/write slot 0</p>
          </div>
        </div>

        {!wallet && (
          <div className="mt-5 p-3 rounded-xl border border-zinc-800 bg-zinc-950 flex items-center gap-3">
            <Wallet className="w-4 h-4 text-zinc-500" />
            <p className="text-xs text-zinc-400 flex-1">Connect a wallet to deploy on Arc Mainnet.</p>
          </div>
        )}

        {wallet && stage === 'idle' && (
          <div className="mt-5 p-3 rounded-xl border border-zinc-800 bg-zinc-950">
            <p className="text-[10px] uppercase tracking-wider text-zinc-600">Connected wallet</p>
            <p className="mt-1 text-xs font-mono text-zinc-300">{shorten(wallet, 7)}</p>
          </div>
        )}

        {busy && (
          <div className="mt-5 p-4 rounded-xl border border-cyan-400/15 bg-cyan-400/[0.04]">
            <div className="flex items-center gap-3">
              <Loader2 className="w-4 h-4 text-cyan-300 animate-spin" />
              <div>
                <p className="text-xs font-semibold text-white">
                  {stage === 'fee' ? 'Confirming GEN-0 fee' : 'Deploying contract'}
                </p>
                <p className="text-[10px] text-zinc-500">
                  {stage === 'fee' ? 'The 0.10 USDC fee is being sent onchain.' : 'Your deployment transaction is being confirmed on Arc.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {error && (
          <div className="mt-5 p-4 rounded-xl border border-red-400/15 bg-red-400/[0.04]">
            <div className="flex gap-3">
              <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-semibold text-red-300">Transaction not completed</p>
                <p className="mt-1 text-[11px] text-red-200/70 break-words">{error}</p>
              </div>
            </div>
          </div>
        )}

        {stage === 'success' && contractAddress && (
          <div className="mt-5 p-4 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.04]">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <div>
                <p className="text-sm font-bold text-white">Contract deployed</p>
                <p className="text-[10px] text-zinc-500">Confirmed on Arc Mainnet</p>
              </div>
            </div>
            <div className="mt-4 p-3 rounded-xl bg-zinc-950 border border-zinc-800">
              <p className="text-[10px] uppercase tracking-wider text-zinc-600">Contract address</p>
              <p className="mt-1 text-xs font-mono text-zinc-300 break-all">{contractAddress}</p>
            </div>
            <div className="grid sm:grid-cols-3 gap-2 mt-3">
              <a href={addressUrl(contractAddress)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-zinc-800 text-xs font-semibold text-zinc-200 hover:bg-white/10">
                <ExternalLink className="w-3.5 h-3.5" /> Explorer
              </a>
              <a href={txUrl(deployHash)} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-zinc-800 text-xs font-semibold text-zinc-200 hover:bg-white/10">
                <ExternalLink className="w-3.5 h-3.5" /> Deployment TX
              </a>
              <button type="button" onClick={copyAddress} className="inline-flex items-center justify-center gap-2 py-2.5 rounded-xl bg-white/5 border border-zinc-800 text-xs font-semibold text-zinc-200 hover:bg-white/10">
                <Copy className="w-3.5 h-3.5" /> {copied ? 'Copied' : 'Copy address'}
              </button>
            </div>
            {feeHash && (
              <a href={txUrl(feeHash)} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-cyan-300 hover:text-cyan-200">
                View GEN-0 fee transaction <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => void (wallet ? deploy() : connectWallet())}
          disabled={busy}
          className="mt-5 w-full py-3 rounded-xl bg-cyan-400 text-zinc-950 text-sm font-extrabold hover:bg-cyan-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {busy && <Loader2 className="inline-block w-4 h-4 mr-2 animate-spin" />}
          {buttonLabel}
        </button>

        <p className="mt-3 text-center text-[10px] text-zinc-600">
          Two wallet confirmations are required: the 0.10 USDC fee, then the contract deployment.
        </p>
      </section>
    </div>
  );
};
