import React from 'react';
import {
  Sparkles,
  ArrowDownLeft,
  ArrowUpRight,
  Flame,
  ExternalLink,
  Coins,
  Activity,
  Code2,
} from 'lucide-react';

export const LandingDashboardPreview: React.FC = () => {
  return (
    <div
      id="landing-hero-dashboard-preview"
      className="relative w-full rounded-2xl bg-[#0b0d10]/95 border border-zinc-800/90 shadow-2xl backdrop-blur-xl overflow-hidden text-left font-sans select-none"
    >
      {/* Subtle blue top glow aura */}
      <div
        className="absolute -top-12 left-1/2 -translate-x-1/2 w-3/4 h-24 bg-blue-500/15 blur-3xl pointer-events-none rounded-full"
        aria-hidden="true"
      />

      {/* Mini Window Header */}
      <div className="flex items-center justify-between px-3.5 sm:px-4 py-2.5 bg-[#101216] border-b border-zinc-800/80">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-zinc-700/80" />
          </div>
          <span className="text-[11px] font-mono text-zinc-400 font-medium pl-1">
            gen0-fi.arc / 0x8f2...41a9
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/25 text-[10px] font-mono text-blue-300">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400 shadow-[0_0_6px_rgba(96,165,250,0.9)]" />
            Arc 5042002
          </span>
        </div>
      </div>

      {/* Preview Content Area */}
      <div className="p-3.5 sm:p-4 lg:p-5 space-y-3 sm:space-y-3.5">
        {/* Top Metric Cards: Balance + Flow Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3">
          {/* Main Balance Card */}
          <div className="sm:col-span-6 p-3 sm:p-3.5 rounded-xl bg-[#111418] border border-blue-500/30 shadow-[0_0_16px_rgba(59,130,246,0.1)] relative overflow-hidden">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400 flex items-center gap-1">
                <Coins className="w-3 h-3 text-blue-400" />
                Current USDC Balance
              </span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-blue-500/15 text-blue-300 border border-blue-500/20">
                18 Decimals
              </span>
            </div>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-xl sm:text-2xl font-extrabold text-white tracking-tight font-mono">
                78.0357
              </span>
              <span className="text-xs font-bold text-zinc-400">USDC</span>
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-zinc-400 font-mono pt-1.5 border-t border-zinc-800/80">
              <span>Total Transactions:</span>
              <span className="text-white font-semibold">69</span>
            </div>
          </div>

          {/* Transfers & Gas Summary */}
          <div className="sm:col-span-6 grid grid-cols-2 gap-2">
            {/* Inbound Received */}
            <div className="p-2.5 rounded-xl bg-[#111418] border border-zinc-800/90 flex flex-col justify-between">
              <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                <ArrowDownLeft className="w-3 h-3" />
                <span>Received</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-bold text-white font-mono">50 USDC</div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                  21 Inbound
                </div>
              </div>
            </div>

            {/* Outbound Sent */}
            <div className="p-2.5 rounded-xl bg-[#111418] border border-zinc-800/90 flex flex-col justify-between">
              <div className="flex items-center gap-1 text-[10px] font-mono text-blue-400">
                <ArrowUpRight className="w-3 h-3" />
                <span>Sent</span>
              </div>
              <div className="mt-1">
                <div className="text-sm font-bold text-white font-mono">24.00 USDC</div>
                <div className="text-[10px] text-zinc-400 font-mono mt-0.5">
                  52 Outbound
                </div>
              </div>
            </div>

            {/* Gas Spent */}
            <div className="col-span-2 p-2 sm:p-2.5 rounded-xl bg-[#111418] border border-zinc-800/90 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-400">
                <Flame className="w-3 h-3 text-blue-400" />
                <span>Gas Spent:</span>
                <span className="text-white font-bold font-mono">0.014276 USDC</span>
              </div>
              <div className="text-[10px] font-mono text-zinc-400">
                Fees: <span className="text-blue-300 font-semibold">0.00043 USDC</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ask GEN-0 AI Conversation Preview with Capybara Avatar */}
        <div className="p-3 sm:p-3.5 rounded-xl bg-[#111418] border border-zinc-800/90 space-y-2.5">
          <div className="flex items-center justify-between pb-1.5 border-b border-zinc-800/80 text-[10px] font-mono">
            <div className="flex items-center gap-1.5 text-zinc-300 font-semibold">
              <Sparkles className="w-3 h-3 text-blue-400" />
              <span>ASK GEN-0 INTELLIGENCE</span>
            </div>
            <span className="text-blue-400">Gemini 3.8 Verified</span>
          </div>

          <div className="space-y-2 text-[11px]">
            {/* User Question */}
            <div className="flex justify-end">
              <div className="px-3 py-1.5 rounded-lg bg-[#1a1d24] border border-zinc-700/60 text-zinc-200 font-medium max-w-[85%]">
                Did I execute any contract calls today and what was my gas cost?
              </div>
            </div>

            {/* AI Answer with Capybara Avatar */}
            <div className="flex gap-2 items-start">
              <img
                src="/capybara.jpg"
                alt="Capybara AI Avatar"
                className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg object-cover border border-blue-500/40 shadow-[0_0_8px_rgba(59,130,246,0.35)] shrink-0 mt-0.5"
              />
              <div className="p-2.5 rounded-lg bg-[#0d0f13] border border-blue-500/25 text-zinc-300 leading-relaxed space-y-1">
                <p>
                  Yes. You executed a contract interaction on Arc Testnet. Gas consumed was{' '}
                  <strong className="text-white font-mono font-semibold">0.00043 USDC</strong>. Across all{' '}
                  <strong className="text-white font-mono font-semibold">69 transactions</strong>, your lifetime gas is{' '}
                  <strong className="text-white font-mono font-semibold">0.014276 USDC</strong> with{' '}
                  <strong className="text-white font-mono font-semibold">78.0357 USDC</strong> remaining.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Wallet Activity / Contract Interactions */}
        <div className="rounded-xl bg-[#111418] border border-zinc-800/90 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[#0e1014] border-b border-zinc-800/80 text-[10px] font-mono text-zinc-400">
            <span className="flex items-center gap-1">
              <Activity className="w-3 h-3 text-blue-400" />
              Recent Onchain Activity
            </span>
            <span className="flex items-center gap-1 text-blue-400">
              ArcScan <ExternalLink className="w-2.5 h-2.5" />
            </span>
          </div>

          <div className="divide-y divide-zinc-900 text-[11px] font-mono">
            {/* Item 1: Contract Interaction */}
            <div className="flex items-center justify-between px-3 py-2 hover:bg-zinc-800/30 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
                  <Code2 className="w-3 h-3" />
                </div>
                <div>
                  <div className="text-white font-medium text-[11px] flex items-center gap-1.5">
                    <span>Contract Call</span>
                    <span className="px-1 py-0.2 rounded bg-zinc-800 text-[9px] text-zinc-400">
                      0x71a2...c841
                    </span>
                  </div>
                  <div className="text-[10px] text-zinc-500">Execution Fee: 0.00043 USDC</div>
                </div>
              </div>
              <span className="text-[10px] text-zinc-500">1m ago</span>
            </div>

            {/* Item 2: Inbound Transfer */}
            <div className="flex items-center justify-between px-3 py-2 hover:bg-zinc-800/30 transition-colors">
              <div className="flex items-center gap-2">
                <div className="w-5 h-5 rounded bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
                  <ArrowDownLeft className="w-3 h-3" />
                </div>
                <div>
                  <div className="text-white font-medium text-[11px]">Received USDC</div>
                  <div className="text-[10px] text-zinc-500">From 0x42f8...93b1</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-emerald-400 font-bold text-[11px]">+50.00 USDC</div>
                <div className="text-[9px] text-zinc-500">Confirmed</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
