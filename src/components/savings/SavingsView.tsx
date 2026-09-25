import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Landmark, ShieldCheck, WalletCards, CircleDollarSign, Euro, Info, ExternalLink } from 'lucide-react';

type Asset = 'all' | 'USDC' | 'EURC';
type Opportunity = { id: string; protocol: string; title: string; asset: 'USDC' | 'EURC' | 'BOTH'; type: string; description: string; destination: string; tone: 'blue' | 'green' | 'violet' | 'amber'; badge?: string; };

const OPPORTUNITIES: Opportunity[] = [
  { id: 'aave-usdc', protocol: 'Aave V4', title: 'Supply USDC on Arc', asset: 'USDC', type: 'Lending market', description: 'Supply idle USDC into the live Aave V4 Arc lending market and earn the variable supply rate.', destination: 'https://pro.aave.com/explore/deposit', tone: 'blue', badge: 'Live' },
  { id: 'aave-eurc', protocol: 'Aave V4', title: 'Supply EURC on Arc', asset: 'EURC', type: 'Lending market', description: 'Supply idle EURC into the live Aave V4 Arc lending market and earn the variable supply rate.', destination: 'https://pro.aave.com/', tone: 'green', badge: 'Live' },
  { id: 'morpho-usdc', protocol: 'Morpho', title: 'Steakhouse Prime USDC', asset: 'USDC', type: 'Curated vault', description: 'A Morpho Arc vault using USDC across lending markets selected by Steakhouse Financial.', destination: 'https://app.morpho.org/arc/vault/0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298/steakhouse-prime-usdc', tone: 'violet', badge: 'Arc' },
  { id: 'morpho-usdc-rwa', protocol: 'Morpho', title: 'Bitwise Premium RWA USDC', asset: 'USDC', type: 'RWA lending vault', description: 'A live Arc USDC vault that allocates against overcollateralized real-world asset markets.', destination: 'https://app.morpho.org/arc/vault/0x7610094B846657dCF166D59e42973db52c7015F9/bitwise-premium-rwa-usdc', tone: 'blue', badge: 'RWA' },
  { id: 'morpho-eurc', protocol: 'Morpho', title: 'Gauntlet EURC Prime', asset: 'EURC', type: 'Curated vault', description: 'A Morpho Arc vault for EURC, curated by Gauntlet with a risk-managed lending strategy.', destination: 'https://app.morpho.org/arc/vault/0x05863F54B05e96092069eF30c9Ca6060336e50B9/gauntlet-eurc-prime', tone: 'green', badge: 'Arc' },
];

const USYC = {
  title: 'USYC',
  description: 'Institutional-grade tokenized money market fund available on Arc. Subscription is in USDC and the current published minimum is $100,000.',
  destination: 'https://www.circle.com/usyc',
};

const filterMatches = (item: Opportunity, filter: Asset) => filter === 'all' || item.asset === filter || item.asset === 'BOTH';

const toneClasses = {
  blue: { icon: 'text-blue-300 bg-blue-500/10 border-blue-500/20', glow: 'group-hover:border-blue-400/30', button: 'bg-blue-500/10 text-blue-300 border-blue-400/20 hover:bg-blue-500/15' },
  green: { icon: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', glow: 'group-hover:border-emerald-400/30', button: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20 hover:bg-emerald-500/15' },
  violet: { icon: 'text-violet-300 bg-violet-500/10 border-violet-500/20', glow: 'group-hover:border-violet-400/30', button: 'bg-violet-500/10 text-violet-300 border-violet-400/20 hover:bg-violet-500/15' },
  amber: { icon: 'text-amber-300 bg-amber-500/10 border-amber-500/20', glow: 'group-hover:border-amber-400/30', button: 'bg-amber-500/10 text-amber-300 border-amber-400/20 hover:bg-amber-500/15' },
};

export const SavingsView: React.FC = () => {
  const [assetFilter, setAssetFilter] = useState<Asset>('all');
  const visible = useMemo(() => OPPORTUNITIES.filter((item) => filterMatches(item, assetFilter)), [assetFilter]);

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-6">
        <header className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-blue-400 font-mono">Arc-native yield</p>
            <h1 className="mt-1 text-2xl sm:text-3xl font-bold text-white tracking-tight">Lend</h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400">Put idle USDC or EURC to work through yield opportunities on Arc. Routed through AAVE and Morpho</p>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-1">
            {(['all', 'USDC', 'EURC'] as Asset[]).map((filter) => (
              <button key={filter} type="button" onClick={() => setAssetFilter(filter)} className={assetFilter === filter ? 'rounded-xl bg-blue-500/15 border border-blue-500/20 px-3.5 py-2 text-xs font-semibold text-blue-300' : 'rounded-xl border border-transparent px-3.5 py-2 text-xs font-medium text-zinc-500 hover:text-zinc-200'}>{filter === 'all' ? 'All' : filter}</button>
            ))}
          </div>
        </header>

        <section className="rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/[0.08] via-[#0d1015] to-transparent p-5 sm:p-7">
          <div className="grid md:grid-cols-[1.5fr_1fr] gap-5 items-stretch">
            <div>
              <div className="flex items-center gap-2"><WalletCards className="w-5 h-5 text-blue-300" /><span className="text-[10px] uppercase tracking-[0.22em] text-blue-300/80">Aave on Arc</span></div>
              <h2 className="mt-3 text-xl sm:text-2xl font-semibold text-white">Lend idle capital on Arc.</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">GEN-0FI surfaces live Arc lending opportunities for USDC and EURC. Open Aave to connect your wallet, review the current supply and borrow rates, then decide there.</p>
              <div className="mt-5 grid sm:grid-cols-3 gap-2.5">
                <Signal icon={CircleDollarSign} label="USDC" value="Native gas asset" />
                <Signal icon={Euro} label="EURC" value="Arc stablecoin" />
                <Signal icon={ShieldCheck} label="Custody" value="You stay in control" />
              </div>
            </div>
            <div className="rounded-2xl border border-zinc-800 bg-black/20 p-5">
              <div className="text-[10px] uppercase tracking-widest text-zinc-600">How this works</div>
              <div className="mt-4 space-y-3">
                <Step number="01" title="Choose an asset" text="USDC or EURC." />
                <Step number="02" title="Open the live Aave live pools" text="Review the live Aave lending market, supply rate, and borrow options." />
                <Step number="03" title="Decide there" text="GEN-0FI never moves your funds for this feature. Only routes you to Aave." />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="flex items-end justify-between gap-4 mb-4">
            <div><h2 className="text-sm font-semibold text-white">Available on Arc</h2><p className="text-[11px] text-zinc-500 mt-1">Live lending and borrowing destinations available through Aave on Arc.</p></div>
            <span className="text-[10px] text-zinc-600 font-mono">{visible.length} opportunities</span>
          </div>
          <div className="grid lg:grid-cols-2 gap-4">
            {visible.map((item) => {
              const tone = toneClasses[item.tone];
              return (
                <article key={item.id} className={'group rounded-2xl border border-zinc-800 bg-[#111317] p-5 transition-all duration-200 ' + tone.glow}>
                  <div className="flex items-start justify-between gap-4">
                    <div className={'w-11 h-11 rounded-xl border flex items-center justify-center ' + tone.icon}><Landmark className="w-5 h-5" /></div>
                    <div className="flex items-center gap-2">
                      {item.badge && <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[9px] uppercase tracking-widest text-zinc-500">{item.badge}</span>}
                      <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[9px] font-mono text-zinc-500">{item.asset}</span>
                    </div>
                  </div>
                  <div className="mt-5">
                    <div className="text-[10px] uppercase tracking-widest text-zinc-600">{item.protocol}</div>
                    <h3 className="mt-1 text-lg font-semibold text-white">{item.title}</h3>
                    <div className="mt-2 text-xs text-zinc-500">{item.type}</div>
                    <p className="mt-3 text-sm leading-6 text-zinc-400">{item.description}</p>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600"><Info className="w-3.5 h-3.5" />Rates are variable</span>
                    <a href={item.destination} target="_blank" rel="noopener noreferrer" className={'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors ' + tone.button}>Open Aave <ArrowUpRight className="w-3.5 h-3.5" /></a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-[#111317] p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex gap-3">
              <div className="w-10 h-10 rounded-xl border border-amber-500/20 bg-amber-500/10 flex items-center justify-center"><CircleDollarSign className="w-5 h-5 text-amber-300" /></div>
              <div><div className="text-[10px] uppercase tracking-widest text-zinc-600">Tokenized RWA</div><h2 className="mt-1 text-sm font-semibold text-white">{USYC.title}</h2><p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">{USYC.description}</p></div>
            </div>
            <a href={USYC.destination} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/15 transition-colors shrink-0">Details <ExternalLink className="w-3.5 h-3.5" /></a>
          </div>
        </section>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 flex items-start gap-2.5 text-[11px] leading-5 text-zinc-500"><Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" /><span>GEN-0FI is discovery-only here. No deposit, approval, swap, or withdrawal happens inside this tab. External protocol rates, liquidity, eligibility, and risks can change at any time.</span></div>
      </div>
    </div>
  );
};

function Signal({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return <div className="rounded-xl border border-zinc-800 bg-black/20 px-3.5 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-white"><Icon className="w-3.5 h-3.5 text-blue-300" />{label}</div><div className="mt-1 text-[10px] text-zinc-600">{value}</div></div>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3"><div className="w-8 h-8 shrink-0 rounded-lg border border-zinc-800 bg-zinc-950 flex items-center justify-center text-[9px] font-mono text-blue-300">{number}</div><div><div className="text-xs font-semibold text-zinc-200">{title}</div><div className="mt-0.5 text-[10px] text-zinc-600">{text}</div></div></div>;
}