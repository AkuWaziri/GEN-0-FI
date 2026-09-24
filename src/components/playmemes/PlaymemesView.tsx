import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Coins,
  Rocket,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';

const LAUNCH_FEE_USDC = 1;
const PROTOCOL_ALLOCATION_PERCENT = 0.1;
const TRADE_FEE_PERCENT = 1;
const CREATOR_FEE_SHARE_PERCENT = 50;
const LAUNCHPAD_FEE_SHARE_PERCENT = 50;

export const PlaymemesView: React.FC = () => {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');

  const isReady = Boolean(name.trim() && symbol.trim());

  const feeSplit = useMemo(() => ({
    creator: TRADE_FEE_PERCENT * (CREATOR_FEE_SHARE_PERCENT / 100),
    launchpad: TRADE_FEE_PERCENT * (LAUNCHPAD_FEE_SHARE_PERCENT / 100),
  }), []);

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-fuchsia-400 font-mono">
              Arc meme launchpad
            </p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Playmemes</h1>
              <span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1 text-[9px] uppercase tracking-widest text-fuchsia-300">
                Simple launches
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Launch Arc-native community tokens with a fixed supply, transparent fees, and a simple bonding-curve market.
            </p>
          </div>
        </header>

        <section className="rounded-2xl border border-fuchsia-500/20 bg-gradient-to-br from-fuchsia-500/[0.08] via-[#111018] to-blue-500/[0.04] p-5 sm:p-7">
          <div className="grid lg:grid-cols-[1.2fr_.8fr] gap-6 items-start">
            <div>
              <div className="flex items-center gap-2 text-fuchsia-300">
                <Rocket className="w-5 h-5" />
                <span className="text-[10px] uppercase tracking-[0.22em]">Create a token</span>
              </div>

              <div className="mt-5 grid sm:grid-cols-2 gap-3">
                <Field label="Token name" value={name} onChange={setName} placeholder="Play Meme" />
                <Field label="Symbol" value={symbol.toUpperCase()} onChange={(value) => setSymbol(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))} placeholder="PLAY" />
              </div>

              <div className="mt-3">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500">Description</label>
                <textarea
                  value={description}
                  onChange={(event) => setDescription(event.target.value.slice(0, 280))}
                  placeholder="What is the meme?"
                  rows={4}
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/40 resize-none"
                />
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-3.5 flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-emerald-300 mt-0.5 shrink-0" />
                <div className="text-[11px] leading-5 text-zinc-500">
                  The launch contract should enforce the economics below. The creator should not be able to change supply, fees, or the protocol allocation after deployment.
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/25 p-5">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">Launch economics</div>

              <div className="mt-4 space-y-3">
                <EconomyRow label="Launch fee" value="$1 USDC" />
                <EconomyRow label="GEN-0FI allocation" value="0.10%" />
                <EconomyRow label="Trading fee" value="1.00%" />
                <EconomyRow label="Creator share" value="50%" accent="text-fuchsia-300" />
                <EconomyRow label="GEN-0FI share" value="50%" accent="text-blue-300" />
              </div>

              <div className="mt-4 rounded-xl border border-fuchsia-500/15 bg-fuchsia-500/[0.05] p-4">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-fuchsia-300" />
                  <span className="text-xs font-semibold text-white">Fee split</span>
                </div>
                <div className="mt-3 h-2 rounded-full overflow-hidden bg-zinc-900 flex">
                  <div className="w-1/2 bg-fuchsia-400" />
                  <div className="w-1/2 bg-blue-400" />
                </div>
                <div className="mt-2 flex justify-between text-[10px] font-mono">
                  <span className="text-fuchsia-300">50% creator</span>
                  <span className="text-blue-300">50% GEN-0FI</span>
                </div>
              </div>

              <button
                type="button"
                disabled={!isReady}
                className="mt-5 w-full rounded-xl bg-white py-3 text-xs font-bold text-black transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isReady ? 'Review Launch' : 'Enter token details'}
              </button>

              <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-zinc-600">
                <WalletCards className="w-3.5 h-3.5" />
                Launches settle in USDC on Arc
              </div>
            </div>
          </div>
        </section>

        <section className="grid md:grid-cols-3 gap-4">
          <Feature
            icon={Rocket}
            title="One-click launch"
            text="$1 USDC launch fee, fixed token rules, minimal setup."
          />
          <Feature
            icon={Sparkles}
            title="Bonding curve"
            text="Simple price discovery before graduation into open-market liquidity."
          />
          <Feature
            icon={ShieldCheck}
            title="Transparent economics"
            text="1% trade fee with an equal 50/50 creator and GEN-0FI split."
          />
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">V1 launch flow</div>
              <h2 className="mt-1 text-sm font-semibold text-white">Create → trade → graduate → open market</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
                The first version is intentionally narrow. No presales, hidden allocations, custom taxes, or creator-controlled trading rules.
              </p>
            </div>
            <a
              href="https://explorer.arc.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-blue-500/30 transition-colors shrink-0"
            >
              Arc Explorer
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </section>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-[11px] leading-5 text-zinc-500">
          Playmemes is currently the launchpad interface and fee specification. The actual factory, bonding curve, fee vault, and graduation contracts must enforce these rules onchain before launches are enabled.
        </div>
      </div>
    </div>
  );
};

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</label>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/40"
      />
    </div>
  );
}

function EconomyRow({
  label,
  value,
  accent = 'text-white',
}: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-zinc-800/70 last:border-b-0">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={'text-xs font-semibold font-mono ' + accent}>{value}</span>
    </div>
  );
}

function Feature({
  icon: Icon,
  title,
  text,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  text: string;
}) {
  return (
    <div className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
      <div className="w-9 h-9 rounded-xl border border-zinc-800 bg-zinc-950 flex items-center justify-center">
        <Icon className="w-4 h-4 text-fuchsia-300" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-white">{title}</h3>
      <p className="mt-1.5 text-xs leading-5 text-zinc-500">{text}</p>
    </div>
  );
}
