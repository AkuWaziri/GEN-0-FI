import React from 'react';
import { Gem, ShieldCheck, Sparkles } from 'lucide-react';

export const Gen0BoundNFTView: React.FC = () => {
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

      <div className="grid grid-cols-1 md:grid-cols-[minmax(180px,0.7fr)_minmax(0,1.3fr)] gap-4">
        <div className="relative min-h-[220px] md:min-h-0 md:aspect-square rounded-2xl border border-blue-400/15 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,.22),transparent_38%),radial-gradient(circle_at_75%_75%,rgba(168,85,247,.15),transparent_42%),#0d1016] flex items-center justify-center overflow-hidden">
          <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.035),transparent_45%,rgba(34,211,238,.04))] pointer-events-none" />
          <div className="w-32 h-32 sm:w-36 sm:h-36 rounded-[40%] bg-gradient-to-br from-cyan-300 via-blue-500 to-violet-500 border-[8px] border-zinc-950 shadow-[0_0_48px_rgba(59,130,246,.28)] relative">
            <span className="absolute left-9 top-11 w-5 h-5 rounded-full bg-white border-[3px] border-zinc-950" />
            <span className="absolute right-9 top-11 w-5 h-5 rounded-full bg-white border-[3px] border-zinc-950" />
            <span className="absolute left-[52px] top-[51px] w-2 h-2 rounded-full bg-zinc-950" />
            <span className="absolute right-[52px] top-[51px] w-2 h-2 rounded-full bg-zinc-950" />
            <div className="absolute left-1/2 bottom-9 -translate-x-1/2 w-10 h-4 border-b-4 border-zinc-950 rounded-full" />
          </div>
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
              <span className="text-[10px] leading-relaxed text-zinc-500">Ownership is recorded on Arc Mainnet.</span>
            </div>
          </div>

          <button type="button" disabled className="mt-4 w-full py-2.5 rounded-xl bg-white/[0.06] border border-zinc-700 text-[11px] font-bold text-zinc-500 cursor-not-allowed">
            MINT · CONTRACT PENDING
          </button>
        </div>
      </div>
    </div>
  );
};
