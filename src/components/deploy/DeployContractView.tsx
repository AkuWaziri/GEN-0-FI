import React from 'react';
import { Code2, Rocket, ShieldCheck } from 'lucide-react';

export const DeployContractView: React.FC = () => {
  return (
    <div className="w-full p-4 sm:p-6 lg:p-8 animate-in fade-in duration-200">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-400">GEN-0 Deploy</p>
          <h1 className="mt-1 text-2xl font-extrabold text-white tracking-tight">Deploy Contract</h1>
          <p className="mt-2 text-sm text-zinc-500">Deploy a supported contract directly from your connected wallet on Arc Mainnet.</p>
        </div>
        <section className="rounded-3xl border border-cyan-400/15 bg-[#0d0f12] p-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-400/10 border border-cyan-300/20 flex items-center justify-center text-cyan-300"><Code2 className="w-5 h-5" /></div>
            <div><h2 className="text-base font-bold text-white">Contract deployment</h2><p className="text-xs text-zinc-500">Every transaction requires your wallet signature.</p></div>
          </div>
          <div className="grid sm:grid-cols-3 gap-3 mt-6">
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800"><Rocket className="w-4 h-4 text-cyan-400 mb-2" /><p className="text-xs font-semibold text-white">0.10 USDC</p><p className="text-[10px] text-zinc-600 mt-1">GEN-0 deployment fee</p></div>
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800"><ShieldCheck className="w-4 h-4 text-blue-400 mb-2" /><p className="text-xs font-semibold text-white">Wallet approval</p><p className="text-[10px] text-zinc-600 mt-1">No silent transactions</p></div>
            <div className="p-4 rounded-xl bg-zinc-950 border border-zinc-800"><Code2 className="w-4 h-4 text-violet-400 mb-2" /><p className="text-xs font-semibold text-white">Arc Mainnet</p><p className="text-[10px] text-zinc-600 mt-1">Chain ID 5042</p></div>
          </div>
          <button type="button" disabled className="mt-6 w-full py-3 rounded-xl bg-white/10 border border-zinc-700 text-sm font-bold text-zinc-500 cursor-not-allowed">
            DEPLOY CONTRACT · COMING ONLINE
          </button>
        </section>
      </div>
    </div>
  );
};
