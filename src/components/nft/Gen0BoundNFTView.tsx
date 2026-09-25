import React, { useEffect, useState } from 'react';
import { Gem, ShieldCheck, Sparkles, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';
import { useAccount, usePublicClient, useWalletClient, useReadContract } from 'wagmi';
import { Address, formatUnits } from 'viem';
import { getArcScanTxUrl } from '../../config/arc';
import {
  GEN0_BOUND_ARTWORK_URL,
  GEN0_BOUND_CHAIN_ID,
  GEN0_BOUND_MINT_PRICE,
  GEN0_BOUND_NFT_ADDRESS,
  GEN0_BOUND_USDC_ADDRESS,
} from '../../config/gen0BoundNFT';

const NFT_ABI = [
  {
    type: 'function',
    name: 'hasMinted',
    stateMutability: 'view',
    inputs: [{ name: '', type: 'address' }],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'mint',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
] as const;

const USDC_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'value', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
] as const;

export const Gen0BoundNFTView: React.FC = () => {
  const { address, chainId } = useAccount();
  const { data: walletClient } = useWalletClient({ chainId: GEN0_BOUND_CHAIN_ID });
  const publicClient = usePublicClient({ chainId: GEN0_BOUND_CHAIN_ID });

  const contractConfigured = Boolean(GEN0_BOUND_NFT_ADDRESS);
  const artworkConfigured = Boolean(GEN0_BOUND_ARTWORK_URL);

  const {
    data: hasMinted,
    isLoading: checkingOwnership,
    refetch: refetchMinted,
  } = useReadContract({
    address: contractConfigured ? GEN0_BOUND_NFT_ADDRESS : undefined,
    abi: NFT_ABI,
    functionName: 'hasMinted',
    args: address ? [address as Address] : undefined,
    chainId: GEN0_BOUND_CHAIN_ID,
    query: {
      enabled: Boolean(contractConfigured && address),
    },
  });

  const [isMinting, setIsMinting] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [ownedModal, setOwnedModal] = useState(false);

  useEffect(() => {
    if (hasMinted) setOwnedModal(true);
  }, [hasMinted]);

  const handleMint = async () => {
    if (!address || !walletClient || !publicClient) {
      setStatus('Connect a wallet on Arc Mainnet first.');
      return;
    }

    if (chainId !== GEN0_BOUND_CHAIN_ID) {
      setStatus('Switch your wallet to Arc Mainnet.');
      return;
    }

    if (!contractConfigured) {
      setStatus('GEN-0 Bound contract address is not configured yet.');
      return;
    }

    if (hasMinted) {
      setOwnedModal(true);
      return;
    }

    setIsMinting(true);
    setStatus(null);
    setTxHash(null);

    try {
      const allowance = await publicClient.readContract({
        address: GEN0_BOUND_USDC_ADDRESS,
        abi: USDC_ABI,
        functionName: 'allowance',
        args: [address, GEN0_BOUND_NFT_ADDRESS],
      });

      if (allowance < GEN0_BOUND_MINT_PRICE) {
        setStatus('Approve 1 USDC, then the mint transaction will follow.');

        const approvalHash = await walletClient.writeContract({
          address: GEN0_BOUND_USDC_ADDRESS,
          abi: USDC_ABI,
          functionName: 'approve',
          args: [GEN0_BOUND_NFT_ADDRESS, GEN0_BOUND_MINT_PRICE],
          chainId: GEN0_BOUND_CHAIN_ID,
        });

        await publicClient.waitForTransactionReceipt({ hash: approvalHash });
      }

      setStatus('Confirm the GEN-0 Bound mint in your wallet.');

      const mintHash = await walletClient.writeContract({
        address: GEN0_BOUND_NFT_ADDRESS,
        abi: NFT_ABI,
        functionName: 'mint',
        chainId: GEN0_BOUND_CHAIN_ID,
      });

      setTxHash(mintHash);
      setStatus('Waiting for the mint to confirm on Arc Mainnet...');

      await publicClient.waitForTransactionReceipt({ hash: mintHash });
      await refetchMinted();

      setStatus('Mint confirmed on Arc Mainnet.');
      setOwnedModal(true);
    } catch (error: any) {
      const message = error?.shortMessage || error?.message || 'Mint transaction failed.';
      setStatus(message.slice(0, 180));
    } finally {
      setIsMinting(false);
    }
  };

  const buttonLabel = !contractConfigured
    ? 'MINT · CONTRACT NOT DEPLOYED'
    : hasMinted
      ? 'YOU OWN GEN-0 BOUND'
      : isMinting
        ? 'MINTING…'
        : 'MINT · 1 USDC';

  return (
    <div className="p-4 sm:p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-400/20 flex items-center justify-center text-blue-300 shrink-0">
              <Gem className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-blue-400">GEN-0 Bound</p>
              <h2 className="text-sm sm:text-base font-bold text-white truncate">Your onchain collectible</h2>
            </div>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-zinc-500 max-w-xl">
            One soulbound GEN-0 character per wallet, permanently linked to your Arc identity.
          </p>
        </div>

        <div className="inline-flex items-center gap-1.5 self-start sm:self-auto rounded-full border border-blue-400/15 bg-blue-400/[0.05] px-2.5 py-1 text-[9px] font-mono uppercase tracking-wider text-blue-300">
          <Sparkles className="w-3 h-3" />
          Arc Mainnet
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[minmax(220px,0.72fr)_minmax(0,1.28fr)] gap-4">
        <div className="relative aspect-square rounded-2xl border border-blue-400/15 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,.22),transparent_38%),radial-gradient(circle_at_75%_75%,rgba(168,85,247,.15),transparent_42%),#0d1016] flex items-center justify-center overflow-hidden">
          {artworkConfigured ? (
            <img
              src={GEN0_BOUND_ARTWORK_URL}
              alt="GEN-0 Bound"
              className="w-full h-full object-cover"
              draggable={false}
            />
          ) : (
            <div className="px-6 text-center">
              <Gem className="mx-auto w-8 h-8 text-blue-400/60" />
              <p className="mt-3 text-xs text-zinc-400">Final artwork URI not configured.</p>
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-zinc-800/90 bg-zinc-950/50 p-4 sm:p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">GEN-0 Bound</h3>
                <p className="mt-0.5 text-[9px] font-mono uppercase tracking-widest text-zinc-500">Soulbound NFT</p>
              </div>
              <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-zinc-800 bg-[#0d0f12] px-3 py-2.5">
                <span className="block text-[9px] uppercase tracking-wider text-zinc-600">Mint price</span>
                <span className="mt-1 block text-sm font-bold text-white">1.00 USDC</span>
              </div>
              <div className="rounded-xl border border-zinc-800 bg-[#0d0f12] px-3 py-2.5">
                <span className="block text-[9px] uppercase tracking-wider text-zinc-600">Limit</span>
                <span className="mt-1 block text-sm font-bold text-white">1 / wallet</span>
              </div>
            </div>

            <div className="mt-2.5 flex items-start gap-2 rounded-xl border border-blue-400/10 bg-blue-500/[0.035] px-3 py-2.5">
              <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0 mt-0.5" />
              <span className="text-[10px] leading-relaxed text-zinc-500">
                The 1 USDC payment goes directly to the GEN-0 fee wallet. Ownership is enforced onchain.
              </span>
            </div>

            {checkingOwnership && contractConfigured && (
              <div className="mt-3 flex items-center gap-2 text-[10px] text-zinc-500">
                <Loader2 className="w-3 h-3 animate-spin" /> Checking onchain ownership…
              </div>
            )}

            {status && (
              <div className="mt-3 rounded-xl border border-zinc-800 bg-black/20 px-3 py-2.5 text-[10px] leading-relaxed text-zinc-400">
                {status}
              </div>
            )}

            {txHash && (
              <a
                href={getArcScanTxUrl(txHash)}
                target="_blank"
                rel="noreferrer"
                className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-blue-400 hover:text-blue-300"
              >
                View mint transaction <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <button
            type="button"
            onClick={handleMint}
            disabled={isMinting || Boolean(hasMinted) || !contractConfigured}
            className="mt-4 w-full py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 disabled:bg-white/[0.06] border border-blue-400/30 disabled:border-zinc-700 text-[11px] font-bold text-white disabled:text-zinc-500 transition-colors"
          >
            {isMinting && <Loader2 className="inline-block w-3.5 h-3.5 mr-1.5 animate-spin" />}
            {buttonLabel}
          </button>
        </div>
      </div>

      {ownedModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-md p-5">
          <div className="w-full max-w-md rounded-3xl border border-blue-400/25 bg-[#0b0e14] p-5 sm:p-6 shadow-[0_0_80px_rgba(59,130,246,.22)]">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-[10px] font-mono uppercase tracking-wider text-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" /> Confirmed on Arc
              </div>
              <h3 className="mt-4 text-2xl font-black tracking-tight text-white">YOU OWN</h3>
              <p className="mt-1 text-xs text-zinc-500">GEN-0 Bound · soulbound to this wallet</p>

              {artworkConfigured && (
                <img
                  src={GEN0_BOUND_ARTWORK_URL}
                  alt="GEN-0 Bound NFT you own"
                  className="mt-5 w-full aspect-square object-cover rounded-2xl border border-blue-400/20"
                  draggable={false}
                />
              )}

              <button
                type="button"
                onClick={() => setOwnedModal(false)}
                className="mt-5 w-full rounded-xl border border-zinc-700 bg-white/[0.05] py-2.5 text-[11px] font-bold text-white hover:bg-white/[0.08]"
              >
                CLOSE
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
