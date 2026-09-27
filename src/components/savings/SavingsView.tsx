import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Landmark, ShieldCheck, WalletCards, CircleDollarSign, Euro, Info, ExternalLink, Sparkles } from 'lucide-react';

type Asset = 'all' | 'USDC' | 'EURC';
type Protocol = 'all' | 'Aave V4' | 'Morpho';

type Opportunity = {
  id: string;
  protocol: 'Aave V4' | 'Morpho';
  title: string;
  asset: 'USDC' | 'EURC';
  type: string;
  description: string;
  destination: string;
  tone: 'blue' | 'green' | 'violet';
  badge?: string;
};

const OPPORTUNITIES: Opportunity[] = [
  { id: 'aave-usdc', protocol: 'Aave V4', title: 'USDC lending market', asset: 'USDC', type: 'Lending market', description: 'Supply USDC on Arc through Aave and review the current variable supply and borrow rates before acting.', destination: 'https://pro.aave.com/explore/deposit', tone: 'blue', badge: 'Arc' },
  { id: 'aave-eurc', protocol: 'Aave V4', title: 'EURC lending market', asset: 'EURC', type: 'Lending market', description: 'Supply EURC on Arc through Aave and review the current market conditions directly in the protocol.', destination: 'https://pro.aave.com/', tone: 'green', badge: 'Arc' },
  { id: 'morpho-usdc', protocol: 'Morpho', title: 'Steakhouse Prime USDC', asset: 'USDC', type: 'Curated vault', description: 'A Morpho Arc vault using USDC across lending markets selected by Steakhouse Financial.', destination: 'https://app.morpho.org/arc/vault/0xbeef0016cb2Fd5C352ea7CA08a9f54739DFa7298/steakhouse-prime-usdc', tone: 'violet', badge: 'Curated' },
  { id: 'morpho-usdc-rwa', protocol: 'Morpho', title: 'Bitwise Premium RWA USDC', asset: 'USDC', type: 'RWA lending vault', description: 'A Morpho Arc USDC vault focused on overcollateralized real-world asset lending markets.', destination: 'https://app.morpho.org/arc/vault/0x7610094B846657dCF166D59e42973db52c7015F9/bitwise-premium-rwa-usdc', tone: 'blue', badge: 'RWA' },
  { id: 'morpho-eurc', protocol: 'Morpho', title: 'Gauntlet EURC Prime', asset: 'EURC', type: 'Curated vault', description: 'A Morpho Arc EURC vault curated by Gauntlet with a risk-managed lending strategy.', destination: 'https://app.morpho.org/arc/vault/0x05863F54B05e96092069eF30c9Ca6060336e50B9/gauntlet-eurc-prime', tone: 'green', badge: 'Curated' },
];

const USYC = {
  title: 'USYC',
  description: 'Tokenized money market fund access on Arc. Subscription is in USDC and the published minimum is $100,000.',
  destination: 'https://www.circle.com/usyc',
};

const toneClasses = {
  blue: { icon: 'text-blue-300 bg-blue-500/10 border-blue-500/20', glow: 'hover:border-blue-400/30', button: 'bg-blue-500/10 text-blue-300 border-blue-400/20 hover:bg-blue-500/15' },
  green: { icon: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20', glow: 'hover:border-emerald-400/30', button: 'bg-emerald-500/10 text-emerald-300 border-emerald-400/20 hover:bg-emerald-500/15' },
  violet: { icon: 'text-violet-300 bg-violet-500/10 border-violet-500/20', glow: 'hover:border-violet-400/30', button: 'bg-violet-500/10 text-violet-300 border-violet-400/20 hover:bg-violet-500/15' },
};

export const SavingsView: React.FC = () => {
  const [assetFilter, setAssetFilter] = useState<Asset>('all');
  const [protocolFilter, setProtocolFilter] = useState<Protocol>('all');

  const visible = useMemo(
    () => OPPORTUNITIES.filter((item) =>
      (assetFilter === 'all' || item.asset === assetFilter) &&
      (protocolFilter === 'all' || item.protocol === protocolFilter)
    ),
    [assetFilter, protocolFilter],
  );

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] p-5 sm:p-8 lg:p-10">
      <div className="max-w-6xl mx-auto space-y-7">
        <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/15 bg-blue-500/[0.06] px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] text-blue-300">
              <Sparkles className="w-3 h-3" /> Arc lending
            </div>
            <h1 className="mt-3 text-3xl sm:text-4xl font-semibold text-white tracking-tight">Lend</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Explore USDC and EURC lending opportunities on Arc through Aave and Morpho. Review the live terms on the protocol before you supply.
            </p>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/70 p-1.5 shadow-xl shadow-black/10">
            <div className="flex flex-wrap gap-1">
              {(['all', 'USDC', 'EURC'] as Asset[]).map((filter) => (
                <button key={filter} type="button" onClick={() => setAssetFilter(filter)} className={assetFilter === filter ? 'rounded-xl bg-white/[0.07] border border-white/10 px-3.5 py-2 text-[11px] font-semibold text-white' : 'rounded-xl border border-transparent px-3.5 py-2 text-[11px] font-medium text-zinc-500 hover:text-zinc-200'}>
                  {filter === 'all' ? 'All assets' : filter}
                </button>
              ))}
            </div>
          </div>
        </header>

        <section className="grid md:grid-cols-2 gap-3">
          <ProtocolCard protocol="Aave V4" tone="blue" description="Open Arc lending markets for USDC and EURC." onClick={() => setProtocolFilter(protocolFilter === 'Aave V4' ? 'all' : 'Aave V4')} active={protocolFilter === 'Aave V4'} />
          <ProtocolCard protocol="Morpho" tone="violet" description="Curated Arc vaults for USDC and EURC." onClick={() => setProtocolFilter(protocolFilter === 'Morpho' ? 'all' : 'Morpho')} active={protocolFilter === 'Morpho'} />
        </section>

        <section className="rounded-3xl border border-blue-500/15 bg-gradient-to-br from-blue-500/[0.09] via-[#0d1015] to-[#0a0c0f] p-5 sm:p-7 overflow-hidden relative">
          <div className="absolute -right-20 -top-24 w-64 h-64 rounded-full bg-blue-500/[0.08] blur-3xl pointer-events-none" />
          <div className="relative grid lg:grid-cols-[1.35fr_1fr] gap-7 items-center">
            <div>
              <div className="flex items-center gap-2 text-blue-300"><WalletCards className="w-5 h-5" /><span className="text-[10px] uppercase tracking-[0.22em]">Arc stablecoin lending</span></div>
              <h2 className="mt-3 text-xl sm:text-2xl font-semibold text-white">Put idle stablecoins to work.</h2>
              <p className="mt-2 max-w-xl text-sm leading-6 text-zinc-400">
                Compare the available Arc destinations, then open Aave or Morpho to see the current APY, liquidity, risk parameters, and transaction details.
              </p>
              <div className="mt-5 grid sm:grid-cols-3 gap-2.5">
                <Signal icon={CircleDollarSign} label="USDC" value="Arc native stablecoin" />
                <Signal icon={Euro} label="EURC" value="Euro stablecoin" />
                <Signal icon={ShieldCheck} label="Control" value="You approve externally" />
              </div>
            </div>
            <div className="rounded-2xl border border-white/[0.07] bg-black/20 p-5">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600">Before you supply</div>
              <div className="mt-4 space-y-3">
                <Step number="01" title="Choose USDC or EURC" text="Filter the markets below." />
                <Step number="02" title="Review the protocol" text="Check current APY, liquidity, caps, and risk." />
                <Step number="03" title="Supply on Aave or Morpho" text="The transaction happens on the external protocol." />
              </div>
            </div>
          </div>
        </section>

        <section>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-semibold text-white">Lending destinations</h2>
              <p className="mt-1 text-[11px] text-zinc-500">Clean entry points to the Arc markets and vaults.</p>
            </div>
            <div className="flex items-center gap-2">
              {(['all', 'Aave V4', 'Morpho'] as Protocol[]).map((filter) => (
                <button key={filter} type="button" onClick={() => setProtocolFilter(filter)} className={protocolFilter === filter ? 'rounded-lg border border-blue-500/20 bg-blue-500/10 px-2.5 py-1.5 text-[10px] font-semibold text-blue-300' : 'rounded-lg border border-transparent px-2.5 py-1.5 text-[10px] text-zinc-600 hover:text-zinc-300'}>
                  {filter === 'all' ? 'All' : filter}
                </button>
              ))}
              <span className="ml-1 text-[10px] font-mono text-zinc-600">{visible.length} markets</span>
            </div>
          </div>

          <div className="grid lg:grid-cols-2 gap-4">
            {visible.map((item) => {
              const tone = toneClasses[item.tone];
              const destinationName = item.protocol === 'Morpho' ? 'Open Morpho' : 'Open Aave';
              return (
                <article key={item.id} className={'group rounded-2xl border border-zinc-800 bg-[#101216] p-5 transition-all duration-200 ' + tone.glow}>
                  <div className="flex items-start justify-between gap-4">
                    <div className={'w-11 h-11 rounded-xl border flex items-center justify-center ' + tone.icon}><Landmark className="w-5 h-5" /></div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[9px] uppercase tracking-widest text-zinc-500">{item.protocol}</span>
                      <span className="rounded-full border border-zinc-800 bg-zinc-950 px-2.5 py-1 text-[9px] font-mono text-zinc-500">{item.asset}</span>
                    </div>
                  </div>
                  <div className="mt-5">
                    <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">{item.type} · {item.badge}</div>
                    <h3 className="mt-1.5 text-lg font-semibold text-white">{item.title}</h3>
                    <p className="mt-2.5 text-sm leading-6 text-zinc-400">{item.description}</p>
                  </div>
                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-zinc-800/80 pt-4">
                    <span className="inline-flex items-center gap-1.5 text-[10px] text-zinc-600"><Info className="w-3.5 h-3.5" />Terms can change</span>
                    <a href={item.destination} target="_blank" rel="noopener noreferrer" className={'inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-xs font-semibold transition-colors ' + tone.button}>
                      {destinationName}<ArrowUpRight className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-zinc-800 bg-[#101216] p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl border border-amber-500/20 bg-amber-500/10 flex items-center justify-center shrink-0"><CircleDollarSign className="w-5 h-5 text-amber-300" /></div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.18em] text-zinc-600">Tokenized RWA</div>
                <h2 className="mt-1 text-sm font-semibold text-white">{USYC.title}</h2>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-zinc-500">{USYC.description}</p>
              </div>
            </div>
            <a href={USYC.destination} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/15 transition-colors shrink-0">
              Details <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        </section>

        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/60 px-4 py-3 flex items-start gap-2.5 text-[11px] leading-5 text-zinc-500">
          <Info className="w-3.5 h-3.5 text-blue-400 mt-0.5 shrink-0" />
          <span>GEN-0FI is discovery-only in Lend. It does not approve, deposit, borrow, repay, or withdraw funds here. Always verify the current protocol terms before signing a transaction.</span>
        </div>
      </div>
    </div>
  );
};

function ProtocolCard({ protocol, tone, description, onClick, active }: { protocol: string; tone: 'blue' | 'violet'; description: string; onClick: () => void; active: boolean }) {
  const isAave = tone === 'blue';
  return (
    <button type="button" onClick={onClick} className={'text-left rounded-2xl border p-4 transition-all ' + (active ? (isAave ? 'border-blue-400/30 bg-blue-500/[0.08]' : 'border-violet-400/30 bg-violet-500/[0.08]') : 'border-zinc-800 bg-[#101216] hover:border-zinc-700')}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className={'w-9 h-9 rounded-xl border flex items-center justify-center ' + (isAave ? 'border-blue-500/20 bg-blue-500/10 text-blue-300' : 'border-violet-500/20 bg-violet-500/10 text-violet-300')}><Landmark className="w-4 h-4" /></div>
          <div><div className="text-xs font-semibold text-white">{protocol}</div><div className="mt-0.5 text-[10px] text-zinc-500">{description}</div></div>
        </div>
        <ArrowUpRight className="w-4 h-4 text-zinc-600" />
      </div>
    </button>
  );
}

function Signal({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: string }) {
  return <div className="rounded-xl border border-white/[0.06] bg-black/20 px-3.5 py-3"><div className="flex items-center gap-2 text-xs font-semibold text-white"><Icon className="w-3.5 h-3.5 text-blue-300" />{label}</div><div className="mt-1 text-[10px] text-zinc-600">{value}</div></div>;
}

function Step({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="flex gap-3"><div className="w-8 h-8 shrink-0 rounded-lg border border-white/[0.06] bg-zinc-950 flex items-center justify-center text-[9px] font-mono text-blue-300">{number}</div><div><div className="text-xs font-semibold text-zinc-200">{title}</div><div className="mt-0.5 text-[10px] text-zinc-600">{text}</div></div></div>;
}
