import React from 'react';
import { Gem, ShieldCheck, Sparkles } from 'lucide-react';

export const Gen0BoundNFTView: React.FC = () => {
  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 space-y-6 animate-in fade-in duration-200">
      <div className="max-w-5xl mx-auto">
        <div className="mb-6">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-blue-400">GEN-0 Bound</p>
          <h1 className="mt-1 text-2xl font-extrabold text-white tracking-tight">Your onchain comic collectible</h1>
          <p className="mt-2 text-sm text-zinc-500 max-w-2xl">One soulbound GEN-0 character per wallet. The final mint artwork will be generated from your wallet identity.</p>
        </div>

        <section className="grid lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] gap-5">
          <div className="aspect-square rounded-3xl border border-blue-400/20 bg-[radial-gradient(circle_at_30%_20%,rgba(59,130,246,.24),transparent_35%),radial-gradient(circle_at_75%_75%,rgba(168,85,247,.18),transparent_40%),#0d1016] flex items-center justify-center overflow-hidden">
            <div className="w-44 h-44 rounded-[42%] bg-gradient-to-br from-cyan-300 via-blue-500 to-violet-500 border-[10px] border-zinc-950 shadow-[0_0_60px_rgba(59,130,246,.28)] relative">
              <span className="absolute left-12 top-16 w-6 h-6 rounded-full bg-white border-4 border-zinc-950" />
              <span className="absolute right-12 top-16 w-6 h-6 rounded-full bg-white border-4 border-zinc-950" />
              <span className="absolute left-[67px] top-[74px] w-2.5 h-2.5 rounded-full bg-zinc-950" />
              <span className="absolute right-[67px] top-[74px] w-2.5 h-2.5 rounded-full bg-zinc-950" />
              <div className="absolute left-1/2 bottom-12 -translate-x-1/2 w-12 h-5 border-b-4 border-zinc-950 rounded-full" />
            </div>
          </div>

          <div className="rounded-3xl border border-zinc-800 bg-[#0d0f12] p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-400/20 flex items-center justify-center text-blue-300"><Gem className="w-4 h-4" /></div>
                <div><h2 className="text-base font-bold text-white">GEN-0 Bound</h2><p className="text-[10px] text-zinc-500 font-mono">SOULBOUND · ARC MAINNET</p></div>
              </div>
              <div className="mt-6 space-y-3">
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800"><span className="text-xs text-zinc-500">Mint price</span><span className="text-sm font-bold text-white">1.00 USDC</span></div>
                <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800"><span className="text-xs text-zinc-500">Mints</span><span className="text-sm font-bold text-white">1 per wallet</span></div>
                <div className="flex items-center gap-2 p-3 rounded-xl bg-blue-500/[0.04] border border-blue-400/10"><ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" /><span className="text-xs text-zinc-400">Artwork and ownership will be verified onchain.</span></div>
              </div>
            </div>
            <button type="button" disabled className="mt-6 w-full py-3 rounded-xl bg-white/10 border border-zinc-700 text-sm font-bold text-zinc-500 cursor-not-allowed">
              MINT · CONTRACT PENDING
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
