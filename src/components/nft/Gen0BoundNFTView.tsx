import React, { useEffect, useState } from 'react';
import { CheckCircle2, ExternalLink, Gem, Loader2, ShieldCheck, Sparkles } from 'lucide-react';
import { createPublicClient, decodeEventLog, fallback, http } from 'viem';
import { useAccount, useWalletClient } from 'wagmi';
import { arcMainnetChain, getArcScanTxUrl } from '../../config/arc';
import { recordConfirmedAction } from '../../services/points/pointsService';
import { GEN0_BOUND_ARTWORK_GATEWAYS, GEN0_BOUND_CHAIN_ID, GEN0_BOUND_FEE_WALLET, GEN0_BOUND_MINT_PRICE, GEN0_BOUND_NFT_ADDRESS, GEN0_BOUND_USDC_ADDRESS } from '../../config/gen0BoundNFT';

const NFT_ABI = [
  { type: 'function', name: 'hasMinted', stateMutability: 'view', inputs: [{ name: '', type: 'address' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'usdc', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'feeRecipient', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'address' }] },
  { type: 'function', name: 'MINT_PRICE', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'error', name: 'AlreadyMinted', inputs: [] },
  { type: 'error', name: 'NonTransferable', inputs: [] },
  { type: 'error', name: 'ZeroAddress', inputs: [] },
  { type: 'error', name: 'EmptyMetadataURI', inputs: [] },
] as const;

const USDC_ABI = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
] as const;

const RPC_RETRY_DELAYS = [0, 500, 1200, 2500];

const arcRpcClient = createPublicClient({
  chain: arcMainnetChain,
  transport: fallback([
    http('https://rpc.arc-scan.org'),
    http('https://rpc.mainnet.arc.io'),
  ]),
});

async function readArcWithRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < RPC_RETRY_DELAYS.length; attempt += 1) {
    if (RPC_RETRY_DELAYS[attempt] > 0) {
      await new Promise((resolve) => setTimeout(resolve, RPC_RETRY_DELAYS[attempt]));
    }

    try {
      return await operation();
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Arc Mainnet RPC request failed.');
}

export const Gen0BoundNFTView: React.FC = () => {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: GEN0_BOUND_CHAIN_ID });
  const contractAddress = GEN0_BOUND_NFT_ADDRESS;
  const [minting, setMinting] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [txHash, setTxHash] = useState('');
  const [owned, setOwned] = useState(false);
  const [showOwned, setShowOwned] = useState(false);
  const [checkingOwnership, setCheckingOwnership] = useState(true);
  const [ownershipUnavailable, setOwnershipUnavailable] = useState(false);
  const [imageGatewayIndex, setImageGatewayIndex] = useState(0);
  const [imageFailed, setImageFailed] = useState(false);
  const imageSrc = GEN0_BOUND_ARTWORK_GATEWAYS[imageGatewayIndex] || GEN0_BOUND_ARTWORK_GATEWAYS[0];

  useEffect(() => {
    if (!address) {
      setCheckingOwnership(false);
      setOwned(false);
      setOwnershipUnavailable(false);
      return;
    }
    let active = true;
    setCheckingOwnership(true);
    fetch(`/api/nft/ownership/${address}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } })
      .then(async (response) => {
        if (!response.ok) throw new Error('Ownership API unavailable');
        return response.json();
      })
      .then((data) => {
        if (!active) return;
        setOwned(Boolean(data.owned));
        setOwnershipUnavailable(false);
        setError('');
      })
      .catch((ownershipError: any) => {
        // Never turn an RPC outage into a false "not minted" state.
        if (active) {
          setOwned(false);
          setOwnershipUnavailable(true);
          // Do not surface an RPC failure on initial render or turn it into a
          // false ownership state. The user can explicitly retry verification.
          setError('');
        }
      })
      .finally(() => { if (active) setCheckingOwnership(false); });
    return () => { active = false; };
  }, [address, contractAddress]);

  const retryOwnership = async () => {
    if (!address) return;
    setCheckingOwnership(true);
    setOwnershipUnavailable(false);
    setError('');
    try {
      const response = await fetch(`/api/nft/ownership/${address}`, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
      if (!response.ok) throw new Error('Ownership API unavailable');
      const data = await response.json();
      const isOwned = Boolean(data.owned);
      setOwned(isOwned);
      if (isOwned) setShowOwned(true);
    } catch {
      setOwned(false);
      setOwnershipUnavailable(true);
      setError('Unable to verify ownership on Arc Mainnet. Please retry.');
    } finally {
      setCheckingOwnership(false);
    }
  };

  const mint = async () => {
    if (!walletClient || !address) { setError('Connect your wallet first.'); return; }
    if (chainId !== GEN0_BOUND_CHAIN_ID) { setError('Switch your wallet to Arc Mainnet.'); return; }
    if (checkingOwnership) { setError('Checking your GEN-0 Bound ownership on Arc…'); return; }
    if (ownershipUnavailable) { setError('Unable to verify ownership. Click retry to check the live Arc contract before minting.'); return; }
    if (owned) { setShowOwned(true); return; }

    setMinting(true);
    setError('');
    setStatus('Preparing your GEN-0 Bound mint…');
    setTxHash('');

    try {
      // Do not run a long RPC preflight before opening the wallet.
      // A transient Arc RPC failure here used to prevent the wallet popup
      // from ever appearing. Ownership is already verified separately above.
      //
      // We only need allowance to decide whether the wallet needs an approval
      // first. If this read is unavailable, treat the allowance as zero and
      // let the wallet handle the approval request instead of blocking mint.
      let currentAllowance = 0n;
      try {
        currentAllowance = await readArcWithRetry(() =>
          arcRpcClient.readContract({
            address: GEN0_BOUND_USDC_ADDRESS,
            abi: USDC_ABI,
            functionName: 'allowance',
            args: [address, contractAddress],
          })
        );
      } catch {
        currentAllowance = 0n;
      }

      if (currentAllowance < GEN0_BOUND_MINT_PRICE) {
        setStatus('Confirm the 1 USDC approval in your wallet…');
        const approval = await walletClient.writeContract({
          account: address,
          address: GEN0_BOUND_USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [contractAddress, GEN0_BOUND_MINT_PRICE],
          chainId: GEN0_BOUND_CHAIN_ID,
        });

        setTxHash(approval);
        setStatus('Approval submitted. Waiting for Arc to confirm it…');

        try {
          await readArcWithRetry(() =>
            arcRpcClient.waitForTransactionReceipt({ hash: approval })
          );
        } catch {
          // If the dedicated Arc read RPC is temporarily unavailable, do not
          // surface "HTTP request failed" and do not prevent the next wallet
          // action. The wallet/provider has already accepted the approval tx.
          setStatus('Approval submitted. Confirm the GEN-0 Bound mint in your wallet…');
        }

        try {
          currentAllowance = await readArcWithRetry(() =>
            arcRpcClient.readContract({
              address: GEN0_BOUND_USDC_ADDRESS,
              abi: USDC_ABI,
              functionName: 'allowance',
              args: [address, contractAddress],
            })
          );
        } catch {
          // The mint contract will enforce allowance onchain if the read RPC
          // is still unavailable.
        }
      }

      setStatus('Confirm the GEN-0 Bound mint in your wallet…');
      const hash = await walletClient.writeContract({
        account: address,
        address: contractAddress,
        abi: NFT_ABI,
        functionName: 'mint',
        chainId: GEN0_BOUND_CHAIN_ID,
      });
      setTxHash(hash);
      setStatus('Waiting for your GEN-0 Bound NFT to confirm on Arc…');

      const receipt = await arcRpcClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== 'success') throw new Error('The mint transaction reverted.');

      const transferAbi = [{
        type: 'event',
        name: 'Transfer',
        inputs: [
          { name: 'from', type: 'address', indexed: true },
          { name: 'to', type: 'address', indexed: true },
          { name: 'value', type: 'uint256', indexed: false },
        ],
      }] as const;

      const paidExactly = receipt.logs.some((log) => {
        if (log.address.toLowerCase() !== GEN0_BOUND_USDC_ADDRESS.toLowerCase()) return false;
        try {
          const decoded = decodeEventLog({ abi: transferAbi, data: log.data, topics: log.topics });
          return decoded.eventName === 'Transfer'
            && decoded.args.from.toLowerCase() === address.toLowerCase()
            && decoded.args.to.toLowerCase() === GEN0_BOUND_FEE_WALLET.toLowerCase()
            && decoded.args.value === GEN0_BOUND_MINT_PRICE;
        } catch {
          return false;
        }
      });

      if (!paidExactly) {
        throw new Error('Mint confirmed, but the expected 1 USDC payment to the GEN-0 fee wallet was not found in the receipt.');
      }

      const confirmedOwnership = await readArcWithRetry(() =>
        arcRpcClient.readContract({
          address: contractAddress,
          abi: NFT_ABI,
          functionName: 'hasMinted',
          args: [address],
        })
      );

      if (!confirmedOwnership) {
        throw new Error('Mint transaction confirmed, but the contract did not report this wallet as minted.');
      }

      setOwned(true);
      setStatus('Mint confirmed on Arc Mainnet. Recording +1,000 points…');

      try {
        await recordConfirmedAction(address, hash, 'nft_mint');
        setStatus('Mint confirmed on Arc Mainnet. +1,000 points recorded.');
      } catch {
        setStatus('Mint confirmed on Arc Mainnet. +1,000 points will sync when points indexing is available.');
      }

      setShowOwned(true);
    } catch (e: any) {
      const message = e?.shortMessage
        || e?.details
        || e?.cause?.shortMessage
        || e?.cause?.message
        || e?.message
        || 'Mint failed.';
      setError(String(message).replace(/^HTTP request failed$/i, 'Arc Mainnet RPC request failed. Check your network or wallet extension and try again.'));
    } finally {
      setMinting(false);
    }
  };

  return <div className="p-4 sm:p-6"><div className="mx-auto max-w-5xl">
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.24em] text-cyan-300">GEN-0 Bound</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Your onchain collectible</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">One soulbound collectible per wallet, settled directly on Arc Mainnet.</p></div>
      <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-cyan-300/15 bg-cyan-300/[.05] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-200"><Sparkles className="h-3 w-3"/> Arc Mainnet</span>
    </div>
    <div className="grid gap-5 lg:grid-cols-[minmax(280px,.9fr)_minmax(0,1.1fr)]">
      <div className="overflow-hidden rounded-3xl border border-white/[.08] bg-[#0a1019]"><div className="relative aspect-square bg-[#0d1420]">
        {!imageFailed ? <img src={imageSrc} alt="GEN-0 Bound artwork" className="h-full w-full object-cover" draggable={false} onError={() => {
          if (imageGatewayIndex < GEN0_BOUND_ARTWORK_GATEWAYS.length - 1) {
            setImageGatewayIndex((index) => index + 1);
          } else {
            setImageFailed(true);
          }
        }} /> : <div className="flex h-full items-center justify-center p-8 text-center text-xs text-slate-500">GEN-0 Bound artwork could not be loaded from the IPFS gateway.</div>}
      </div></div>
      <section className="rounded-3xl border border-white/[.08] bg-[#0a1019] p-5 sm:p-6">
        <div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-white">GEN-0 Bound</h2><p className="mt-1 text-[9px] uppercase tracking-[.18em] text-slate-600">Soulbound · GEN0B</p></div><ShieldCheck className="h-5 w-5 text-cyan-300"/></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3"><p className="text-[9px] uppercase tracking-wider text-slate-600">Mint</p><p className="mt-1 text-sm font-bold text-white">1 USDC</p></div><div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3"><p className="text-[9px] uppercase tracking-wider text-slate-600">Limit</p><p className="mt-1 text-sm font-bold text-white">1 / wallet</p></div></div>
        <div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-4"><p className="text-[9px] uppercase tracking-wider text-cyan-200">Live contract</p><p className="mt-1 break-all font-mono text-[10px] text-slate-400">{contractAddress}</p><a href={'https://explorer.arc.io/address/'+contractAddress} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-cyan-300">View contract <ExternalLink className="h-3 w-3"/></a></div>
        {status&&<div className="mt-4 rounded-xl border border-white/[.07] bg-black/20 px-3 py-2.5 text-[10px] leading-5 text-slate-400">{status}</div>}
        {error&&<div className="mt-3 rounded-xl border border-rose-400/15 bg-rose-400/[.04] px-3 py-2.5 text-[10px] leading-5 text-rose-200">{error}</div>}
        {txHash&&<a href={getArcScanTxUrl(txHash)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-cyan-300">View transaction <ExternalLink className="h-3 w-3"/> </a>}
        <button disabled={minting||owned||checkingOwnership} onClick={()=>void (ownershipUnavailable ? retryOwnership() : mint())} className="mt-5 flex w-full items-center justify-center rounded-xl bg-cyan-400 py-3 text-xs font-extrabold text-slate-950 hover:bg-cyan-300 disabled:bg-white/[.06] disabled:text-slate-500">{minting||checkingOwnership?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Gem className="mr-2 h-4 w-4"/>}{owned?'YOU OWN GEN0 BOUND NFT':checkingOwnership?'CHECKING OWNERSHIP…':ownershipUnavailable?'RETRY OWNERSHIP CHECK':minting?'MINTING…':'MINT · 1 USDC'}</button>
        <p className="mt-3 text-center text-[9px] leading-5 text-slate-600">Mint requires at least 1 USDC on Arc Mainnet. The 1 USDC mint payment is transferred directly onchain to the GEN-0 fee wallet. NFT transfers are disabled.</p>
      </section>
    </div>
  </div>
  {showOwned&&<div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-5 backdrop-blur-md"><div className="w-full max-w-md rounded-3xl border border-cyan-300/20 bg-[#0b111a] p-5 shadow-[0_0_90px_rgba(34,211,238,.16)]"><div className="text-center"><span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[.06] px-3 py-1 text-[9px] uppercase tracking-wider text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5"/> Confirmed on Arc</span><h2 className="mt-4 text-2xl font-black text-white">YOU OWN GEN0 BOUND NFT</h2><img src={imageSrc} alt="GEN-0 Bound you own" className="mt-5 aspect-square w-full rounded-2xl object-cover border border-white/10"/><button onClick={()=>setShowOwned(false)} className="mt-5 w-full rounded-xl border border-white/10 bg-white/[.05] py-2.5 text-xs font-bold text-white">CLOSE</button></div></div></div>}
  </div>;
};
