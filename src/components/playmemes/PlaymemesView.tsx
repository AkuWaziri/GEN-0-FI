import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Check, Coins, ExternalLink, Rocket, ShieldCheck, Sparkles, WalletCards } from 'lucide-react';
import { PLAYMEMES_ARC, PLAYMEMES_ECONOMICS } from '../../config/playmemes';

export const PlaymemesView: React.FC = () => {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);

  const isReady = Boolean(name.trim() && symbol.trim());

  const feeSplit = useMemo(() => ({
    creator: PLAYMEMES_ECONOMICS.tradeFeePercent * (PLAYMEMES_ECONOMICS.creatorSharePercent / 100),
    platform: PLAYMEMES_ECONOMICS.tradeFeePercent * (PLAYMEMES_ECONOMICS.platformSharePercent / 100),
    referrer: PLAYMEMES_ECONOMICS.tradeFeePercent * (PLAYMEMES_ECONOMICS.referrerSharePercent / 100),
  }), []);

  const review = () => {
    if (!isReady) return;
    setReviewOpen(true);
  };

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-fuchsia-400 font-mono">Arc meme launchpad</p>
            <div className="mt-1 flex items-center gap-3">
              <h1 className="text-2xl sm:text-3xl font-bold text-white tracking-tight">Playmemes</h1>
              <span className="rounded-full border border-fuchsia-500/20 bg-fuchsia-500/10 px-2.5 py-1 text-[9px] uppercase tracking-widest text-fuchsia-300">Arc only</span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">
              Launch fixed-supply community tokens on Arc through the o1 Launchpad route.
              Arc launches use USDC and open directly into Uniswap v4 liquidity.
            </p>
          </div>

          <a href="https://o1.exchange" target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-fuchsia-500/30 transition-colors">
            o1 Launchpad <ExternalLink className="w-3.5 h-3.5" />
          </a>
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
                <Field label="Symbol" value={symbol.toUpperCase()}
                  onChange={(value) => setSymbol(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
                  placeholder="PLAY" />
              </div>

              <div className="mt-3">
                <label className="text-[10px] uppercase tracking-widest text-zinc-500">Description</label>
                <textarea value={description} onChange={(event) => setDescription(event.target.value.slice(0, 280))}
                  placeholder="What is the meme?" rows={4}
                  className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/40 resize-none" />
              </div>

              <div className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] p-3.5 flex items-start gap-3">
                <ShieldCheck className="w-4 h-4 text-blue-300 mt-0.5 shrink-0" />
                <div className="text-[11px] leading-5 text-zinc-500">
                  Arc uses the registered o1 launch configuration. Supply, quote asset, fee schedule, hook and launch fee are enforced by the deployed protocol.
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-zinc-800 bg-black/20 p-3.5 flex items-start gap-3">
                <Coins className="w-4 h-4 text-fuchsia-300 mt-0.5 shrink-0" />
                <div className="text-[11px] leading-5 text-zinc-500">
                  GEN-0FI referral recipient:
                  <span className="ml-1 font-mono text-zinc-300 break-all">{PLAYMEMES_ARC.referrer}</span>
                  <span className="block mt-1">The address is intended to receive the referral share when the trade route carries valid o1 referral hook data.</span>
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-zinc-800 bg-black/25 p-5">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">Onchain launch economics</div>

              <div className="mt-4 space-y-3">
                <EconomyRow label="Arc launch fee" value="$2 USDC" />
                <EconomyRow label="Fixed supply" value="1,000,000,000" />
                <EconomyRow label="Quote asset" value="USDC" />
                <EconomyRow label="Trading fee" value="1.00%" />
                <EconomyRow label="Creator share" value="50% of fee" accent="text-fuchsia-300" />
                <EconomyRow label="Platform share" value="30% of fee" accent="text-zinc-200" />
                <EconomyRow label="GEN-0FI referral" value="20% of fee" accent="text-blue-300" />
              </div>

              <div className="mt-4 rounded-xl border border-blue-500/15 bg-blue-500/[0.05] p-4">
                <div className="flex items-center gap-2">
                  <Coins className="w-4 h-4 text-blue-300" />
                  <span className="text-xs font-semibold text-white">GEN-0FI trade share</span>
                </div>
                <div className="mt-3 h-2 rounded-full overflow-hidden bg-zinc-900 flex">
                  <div className="w-1/2 bg-fuchsia-400" />
                  <div className="w-[30%] bg-zinc-500" />
                  <div className="w-[20%] bg-blue-400" />
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-[10px] font-mono">
                  <span className="text-fuchsia-300">50% creator</span>
                  <span className="text-zinc-400 text-center">30% platform</span>
                  <span className="text-blue-300 text-right">20% referrer</span>
                </div>
                <div className="mt-3 rounded-lg border border-blue-500/10 bg-blue-500/[0.04] p-3 text-[11px] leading-5 text-zinc-500">
                  GEN-0FI receives <span className="text-blue-300 font-semibold">{feeSplit.referrer.toFixed(2)}%</span> of routed trade volume from its referral share while the base fee remains 1.00%.
                </div>
              </div>

              <button type="button" disabled={!isReady} onClick={review}
                className="mt-5 w-full rounded-xl bg-white py-3 text-xs font-bold text-black transition-all hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-35">
                {isReady ? 'Review Onchain Launch' : 'Enter token details'}
              </button>

              <div className="mt-3 flex items-center justify-center gap-2 text-[10px] text-zinc-600">
                <WalletCards className="w-3.5 h-3.5" /> Arc mainnet · chain {PLAYMEMES_ARC.chainId}
              </div>
            </div>
          </div>
        </section>

        {reviewOpen && isReady && (
          <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.04] p-5 sm:p-6">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center shrink-0">
                <Check className="w-4 h-4 text-emerald-300" />
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-emerald-300">Launch review</div>
                <h2 className="mt-1 text-base font-semibold text-white">
                  {name} · $<span>{symbol.toUpperCase()}</span>
                </h2>
                <p className="mt-1 text-xs leading-5 text-zinc-500">
                  The review reflects the registered Arc route. The signed creation transaction still needs live factory configuration reads, metadata preparation and launch-salt calculation before submission.
                </p>
              </div>
            </div>

            <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <ReviewCard label="Launch fee" value="$2 USDC" />
              <ReviewCard label="Supply" value="1B tokens" />
              <ReviewCard label="Trade fee" value="1.00%" />
              <ReviewCard label="GEN-0FI referral" value="0.20% volume" />
            </div>

            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <a href="https://explorer.arc.io" target="_blank" rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-xs font-semibold text-zinc-300 hover:text-white hover:border-blue-500/30 transition-colors">
                Verify on Arc <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
              <button type="button" onClick={() => setReviewOpen(false)}
                className="rounded-xl border border-zinc-800 px-4 py-3 text-xs font-semibold text-zinc-500 hover:text-zinc-200 transition-colors">
                Edit details
              </button>
            </div>
          </section>
        )}

        <section className="grid md:grid-cols-3 gap-4">
          <Feature icon={Rocket} title="Fixed supply" text="Each launch uses the registered Arc supply configuration instead of creator-defined tokenomics." />
          <Feature icon={Sparkles} title="Open-market liquidity" text="The o1 Arc route opens the token against USDC in Uniswap v4 rather than using a separate bonding-curve UI." />
          <Feature icon={ShieldCheck} title="Referral economics" text="GEN-0FI is the hard-coded referral recipient for routed trades using the o1 referral hook." />
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">Arc route</div>
              <h2 className="mt-1 text-sm font-semibold text-white">Create → open liquidity → trade → collect fee share</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">
                Playmemes does not invent a second fee schedule. It surfaces the registered Arc o1 launch configuration and keeps the GEN-0FI referral recipient fixed.
              </p>
            </div>
            <a href={PLAYMEMES_ARC.explorer} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-blue-500/30 transition-colors shrink-0">
              Arc Explorer <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </section>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 text-[11px] leading-5 text-zinc-500">
          Live launch submission is gated until the app reads the active factory configuration at execution time, prepares metadata, computes a valid launch salt, simulates the factory call, then asks the wallet to sign.
        </div>
      </div>
    </div>
  );
};

function Field({ label, value, onChange, placeholder }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-widest text-zinc-500">{label}</label>
      <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder}
        className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-fuchsia-500/40" />
    </div>
  );
}

function EconomyRow({ label, value, accent = 'text-white' }: {
  label: string;
  value: string;
  accent?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-zinc-800/70 last:border-b-0">
      <span className="text-[11px] text-zinc-500">{label}</span>
      <span className={'text-xs font-semibold font-mono text-right ' + accent}>{value}</span>
    </div>
  );
}

function ReviewCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-4">
      <div className="text-[9px] uppercase tracking-widest text-zinc-600">{label}</div>
      <div className="mt-1 text-sm font-semibold text-white">{value}</div>
    </div>
  );
}

function Feature({ icon: Icon, title, text }: {
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
