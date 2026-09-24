import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  CircleHelp,
  Coins,
  Copy,
  ExternalLink,
  Globe,
  ImagePlus,
  Info,
  Link2,
  LockKeyhole,
  Rocket,
  ShieldCheck,
  Sparkles,
  WalletCards,
  X,
} from 'lucide-react';
import { PLAYMEMES_ARC, PLAYMEMES_ECONOMICS } from '../../config/playmemes';

const GEN0_BLUE = '#3b82f6';
const GEN0_FUCHSIA = '#e879f9';

export const PlaymemesView: React.FC = () => {
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [website, setWebsite] = useState('');
  const [xUrl, setXUrl] = useState('');
  const [telegramUrl, setTelegramUrl] = useState('');
  const [reviewOpen, setReviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [imageError, setImageError] = useState(false);
  const [activeSection, setActiveSection] = useState<'create' | 'preview'>('create');

  const isReady = Boolean(name.trim() && symbol.trim() && description.trim());
  const completedFields = [name.trim(), symbol.trim(), description.trim(), imageUrl.trim()].filter(Boolean).length;

  const feeSplit = useMemo(() => ({
    creator: PLAYMEMES_ECONOMICS.tradeFeePercent * (PLAYMEMES_ECONOMICS.creatorSharePercent / 100),
    platform: PLAYMEMES_ECONOMICS.tradeFeePercent * (PLAYMEMES_ECONOMICS.platformSharePercent / 100),
    referrer: PLAYMEMES_ECONOMICS.tradeFeePercent * (PLAYMEMES_ECONOMICS.referrerSharePercent / 100),
  }), []);

  const review = () => {
    if (!isReady) return;
    setReviewOpen(true);
    setActiveSection('preview');
  };

  const copyReferral = async () => {
    try {
      await navigator.clipboard.writeText(PLAYMEMES_ARC.referrer);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  };

  const displaySymbol = symbol.trim().toUpperCase() || 'MEME';
  const displayName = name.trim() || 'Your Meme';
  const displayDescription = description.trim() || 'Your community token description will appear here.';
  const hasImage = Boolean(imageUrl.trim()) && !imageError;

  return (
    <div className="w-full min-h-[calc(100vh-3.5rem)] px-4 py-5 sm:px-6 lg:px-10 lg:py-8">
      <div className="max-w-7xl mx-auto space-y-5">
        <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] font-mono">
              <span style={{ color: GEN0_FUCHSIA }}>Arc meme launchpad</span>
              <span className="text-zinc-700">•</span>
              <span className="text-blue-300">mainnet</span>
            </div>

            <div className="mt-1 flex flex-wrap items-center gap-3">
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white">Playmemes</h1>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/25 bg-blue-500/10 px-2.5 py-1 text-[10px] uppercase tracking-widest text-blue-300">
                <span className="h-1.5 w-1.5 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,.9)]" />
                Arc only
              </span>
            </div>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-400">
              Create a fixed-supply community token, preview the launch profile, then review the exact Arc launch configuration before signing.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <a
              href="https://launch.o1.exchange/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3.5 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-blue-500/30 transition-colors"
            >
              Live launchpad
              
            </a>
            <a
              href="https://explorer.arc.io"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-zinc-800 bg-zinc-950/70 px-3.5 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-blue-500/30 transition-colors"
            >
              Arc Explorer
              <ArrowUpRight className="w-3.5 h-3.5" />
            </a>
          </div>
        </header>

        <section className="rounded-2xl border border-zinc-800/90 bg-[#0c0e12] overflow-hidden shadow-[0_18px_60px_rgba(0,0,0,.35)]">
          <div className="relative px-5 py-4 sm:px-6 border-b border-zinc-800/80 bg-[radial-gradient(circle_at_15%_0%,rgba(232,121,249,.10),transparent_36%),radial-gradient(circle_at_80%_0%,rgba(59,130,246,.13),transparent_36%)]">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
              <div className="flex items-center gap-4">
                <Step active={activeSection === 'create'} number="01" label="Create" />
                <span className="text-zinc-700">→</span>
                <Step active={activeSection === 'preview'} number="02" label="Preview" />
                <span className="text-zinc-700">→</span>
                <Step active={reviewOpen} number="03" label="Review" />
              </div>

              <div className="flex items-center gap-2 text-[10px] font-mono text-zinc-600">
                <span>{completedFields}/4 profile fields</span>
                <span className="h-1.5 w-1.5 rounded-full bg-zinc-700" />
                <span>Arc · {PLAYMEMES_ARC.chainId}</span>
              </div>
            </div>
          </div>

          <div className="grid xl:grid-cols-[1fr_420px]">
            <div className="p-5 sm:p-7 lg:p-8">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-blue-300 font-mono">01 · Token profile</div>
                  <h2 className="mt-1 text-lg sm:text-xl font-semibold text-white">Build the launch identity</h2>
                </div>

                <button
                  type="button"
                  onClick={() => setActiveSection(activeSection === 'create' ? 'preview' : 'create')}
                  className="xl:hidden inline-flex items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-[11px] font-semibold text-zinc-400 hover:text-white"
                >
                  {activeSection === 'create' ? 'Preview' : 'Edit'} 
                </button>
              </div>

              <div className="mt-6 grid sm:grid-cols-[96px_1fr] gap-5">
                <ImagePicker value={imageUrl} hasImage={hasImage} onChange={(value) => { setImageUrl(value); setImageError(false); }} />
                <div className="space-y-4">
                  <Field label="Token name" required value={name} onChange={setName} placeholder="e.g. Internet Dog" maxLength={32} />
                  <Field
                    label="Symbol"
                    required
                    value={symbol}
                    onChange={(value) => setSymbol(value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12))}
                    placeholder="e.g. DOGE"
                    maxLength={12}
                    suffix="Ticker"
                  />
                </div>
              </div>

              <div className="mt-5">
                <Field label="Description" required multiline value={description} onChange={setDescription} placeholder="What makes this meme worth knowing?" maxLength={280} />
              </div>

              <div className="mt-5 rounded-2xl border border-zinc-800 bg-zinc-950/60 p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-blue-500/10 border border-blue-500/20">
                    
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-zinc-200">Profile metadata</div>
                    <p className="mt-1 text-[11px] leading-5 text-zinc-500">
                      Image and social links are presentation metadata for the launch profile. They do not change the fixed onchain token economics.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5">
                <div className="flex items-center gap-2">
                  
                  <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">Optional links</span>
                </div>

                <div className="mt-3 grid md:grid-cols-3 gap-3">
                  <Field value={website} onChange={setWebsite} placeholder="Website" />
                  <Field icon={<span className="text-[11px] font-bold">X</span>} value={xUrl} onChange={setXUrl} placeholder="X profile" />
                  <Field icon={<span className="text-[11px] font-bold">TG</span>} value={telegramUrl} onChange={setTelegramUrl} placeholder="Telegram" />
                </div>
              </div>

              <div className="mt-6 grid sm:grid-cols-2 gap-3">
                <LockedRule icon={LockKeyhole} title="1B fixed supply" text="Launch token supply is protocol-defined." />
                <LockedRule icon={ShieldCheck} title="No custom taxes" text="Creator-side tax overrides are not exposed." />
              </div>
            </div>

            <div className="border-t xl:border-t-0 xl:border-l border-zinc-800/80 bg-[#090b0f] p-5 sm:p-7">
              <div className="text-[10px] uppercase tracking-[0.22em] text-fuchsia-300 font-mono">02 · Live preview</div>
              <div className="mt-1 text-lg font-semibold text-white">Launch card</div>

              <div className="mt-5 rounded-2xl border border-zinc-800 bg-[#101217] overflow-hidden">
                <div className="h-24 bg-[radial-gradient(circle_at_22%_20%,rgba(232,121,249,.30),transparent_34%),radial-gradient(circle_at_82%_18%,rgba(59,130,246,.30),transparent_36%),linear-gradient(135deg,#0c0d12,#121724)]" />
                <div className="px-5 pb-5">
                  <div className="-mt-8">
                    <div className="h-16 w-16 rounded-2xl border-4 border-[#101217] bg-zinc-950 overflow-hidden flex items-center justify-center shadow-xl">
                      {hasImage ? (
                        <img src={imageUrl} alt="" className="h-full w-full object-cover" onError={() => setImageError(true)} />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-fuchsia-500/30 to-blue-500/30">
                          <Sparkles className="w-6 h-6 text-white/80" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-base font-bold text-white truncate">{displayName}</div>
                      <div className="mt-0.5 text-xs font-mono text-blue-300">${displaySymbol}</div>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-[9px] uppercase tracking-widest text-emerald-300">Arc</span>
                  </div>

                  <p className="mt-3 text-[11px] leading-5 text-zinc-500 line-clamp-4">{displayDescription}</p>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <PreviewMetric label="Supply" value="1B" />
                    <PreviewMetric label="Quote" value="USDC" />
                    <PreviewMetric label="Trade fee" value="1.00%" />
                    <PreviewMetric label="Launch fee" value="$2" />
                  </div>

                  {(website || xUrl || telegramUrl) && (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {website && <PreviewLink  label="Web" />}
                      {xUrl && <PreviewLink label="X" />}
                      {telegramUrl && <span className="rounded-lg border border-zinc-800 px-2.5 py-1.5">TG</span>}
                    </div>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-blue-500/15 bg-blue-500/[0.04] p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-zinc-500">Ready state</div>
                    <div className="mt-1 text-sm font-semibold text-white">{isReady ? 'Profile ready for review' : 'Complete required fields'}</div>
                  </div>
                  <div className={'h-8 w-8 rounded-full flex items-center justify-center border ' + (isReady ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-zinc-800 bg-zinc-950')}>
                    <span className={'text-sm ' + (isReady ? 'text-emerald-300' : 'text-zinc-700')}>{isReady ? '✓' : '○'}</span>
                  </div>
                </div>

                <div className="mt-3 h-1.5 rounded-full bg-zinc-900 overflow-hidden">
                  <div className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-blue-400 transition-all" style={{ width: (completedFields / 4) * 100 + '%' }} />
                </div>
              </div>

              <button
                type="button"
                disabled={!isReady}
                onClick={review}
                className="mt-4 w-full rounded-xl bg-gradient-to-r from-fuchsia-500 to-blue-500 py-3.5 text-xs font-extrabold text-white shadow-[0_0_30px_rgba(59,130,246,.18)] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isReady ? 'Review launch' : 'Complete required fields'}
                
              </button>
            </div>
          </div>
        </section>

        <section className="grid xl:grid-cols-[1.05fr_.95fr] gap-5">
          <div className="rounded-2xl border border-zinc-800 bg-[#0c0e12] p-5 sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-blue-300 font-mono">Launch mechanics</div>
                <h2 className="mt-1 text-lg font-semibold text-white">What happens after review</h2>
              </div>
              <Rocket className="w-5 h-5 text-fuchsia-300" />
            </div>

            <div className="mt-5 grid sm:grid-cols-2 gap-3">
              <Mechanic number="01" title="Create" text="Prepare token metadata and the live Arc factory configuration." />
              <Mechanic number="02" title="Open liquidity" text="The launch route opens the token into the configured Uniswap v4 market." />
              <Mechanic number="03" title="Trade" text="Trading begins under the configured 1% protocol fee schedule." />
              <Mechanic number="04" title="Route fees" text="Creator, platform and valid referral shares follow the deployed hook rules." />
            </div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-[#0c0e12] p-5 sm:p-6">
            <div className="text-[10px] uppercase tracking-[0.22em] text-fuchsia-300 font-mono">Economics</div>
            <h2 className="mt-1 text-lg font-semibold text-white">Locked launch configuration</h2>

            <div className="mt-5 grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Stat value="1B" label="Fixed supply" />
              <Stat value="$2" label="Launch fee" />
              <Stat value="1%" label="Trade fee" />
              <Stat value="50%" label="Creator fee share" />
              <Stat value="30%" label="Platform fee share" />
              <Stat value="20%" label="Referral fee share" />
            </div>

            <div className="mt-4 h-2 rounded-full overflow-hidden bg-zinc-900 flex">
              <div className="w-1/2" style={{ background: GEN0_FUCHSIA }} />
              <div className="w-[30%] bg-zinc-600" />
              <div className="w-[20%]" style={{ background: GEN0_BLUE }} />
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-mono">
              <span className="text-fuchsia-300">50% creator</span>
              <span className="text-zinc-500 text-center">30% platform</span>
              <span className="text-blue-300 text-right">20% referrer</span>
            </div>

            <button
              type="button"
              onClick={copyReferral}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl border border-blue-500/15 bg-blue-500/[0.04] px-3.5 py-3 text-[11px] font-mono text-zinc-400 hover:text-white hover:border-blue-500/30 transition-colors"
            >
              <span className="truncate">ref: {PLAYMEMES_ARC.referrer}</span>
              {copied ? <span className="text-emerald-300">copied</span> : <span className="text-blue-300">copy</span>}
            </button>
          </div>
        </section>

        {reviewOpen && isReady && (
          <section className="rounded-2xl border border-emerald-500/20 bg-[radial-gradient(circle_at_0%_0%,rgba(16,185,129,.10),transparent_36%),#0b1010] p-5 sm:p-6">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 shrink-0 rounded-xl border border-emerald-500/20 bg-emerald-500/10 flex items-center justify-center">
                  <span className="text-emerald-300 text-lg">✓</span>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300 font-mono">03 · Launch review</div>
                  <h2 className="mt-1 text-lg font-semibold text-white">Ready for final onchain verification</h2>
                  <p className="mt-1 max-w-2xl text-xs leading-5 text-zinc-500">
                    This review mirrors the configured Arc route. The live signing step remains gated until the app reads the active factory configuration, prepares metadata, computes launch data, and simulates the exact transaction.
                  </p>
                </div>
              </div>

              <button type="button" onClick={() => setReviewOpen(false)} className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-800 px-3.5 py-2.5 text-xs font-semibold text-zinc-500 hover:text-zinc-200">
                
                Close review
              </button>
            </div>

            <div className="mt-5 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <ReviewCard label="Token" value={'$' + displaySymbol} />
              <ReviewCard label="Supply" value="1,000,000,000" />
              <ReviewCard label="Launch fee" value="$2 USDC" />
              <ReviewCard label="GEN-0FI share" value="0.20% of volume" />
            </div>

            <div className="mt-4 grid lg:grid-cols-[1fr_auto] gap-4 items-center rounded-xl border border-zinc-800 bg-zinc-950/50 p-4">
              <div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-600">Final route</div>
                <div className="mt-1 text-xs text-zinc-400">Arc Mainnet → launch factory → Uniswap v4 → fixed referral hook</div>
              </div>
              <a href={PLAYMEMES_ARC.explorer} target="_blank" rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-zinc-800 px-4 py-2.5 text-xs font-semibold text-zinc-300 hover:text-white hover:border-blue-500/30">
                Verify contracts <ArrowUpRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </section>
        )}

        <section className="grid md:grid-cols-3 gap-3">
          <Feature icon={ShieldCheck} title="Protocol-defined" text="The token launch cannot rewrite the configured supply or fee schedule from this interface." />
          <Feature icon={WalletCards} title="USDC on Arc" text="Launch economics are denominated in the Arc USDC quote asset." />
          <Feature icon={CircleHelp} title="No hidden UI rules" text="Optional profile metadata stays separate from the onchain launch parameters." />
        </section>

        <div className="rounded-2xl border border-zinc-800/80 bg-zinc-950/50 px-4 py-3 text-[11px] leading-5 text-zinc-600">
          Playmemes currently provides the complete launch interface and review layer. The transaction signer remains intentionally gated until the exact live factory ABI and metadata flow are verified against Arc Mainnet at execution time.
        </div>
      </div>
    </div>
  );
};

function Step({ active, number, label }: { active: boolean; number: string; label: string }) {
  return (
    <div className={'flex items-center gap-2 ' + (active ? 'text-white' : 'text-zinc-600')}>
      <span className={'flex h-7 w-7 items-center justify-center rounded-lg border text-[9px] font-mono ' + (active ? 'border-blue-500/35 bg-blue-500/10 text-blue-300' : 'border-zinc-800 bg-zinc-950 text-zinc-600')}>
        {number}
      </span>
      <span className="text-xs font-semibold">{label}</span>
    </div>
  );
}

function ImagePicker({ value, hasImage, onChange }: { value: string; hasImage: boolean; onChange: (value: string) => void }) {
  const inputId = 'playmemes-image-url';
  return (
    <div>
      <label htmlFor={inputId} className="text-[10px] uppercase tracking-widest text-zinc-500">Token art</label>
      <div className="mt-2 h-24 w-24 rounded-2xl border border-dashed border-zinc-700 bg-zinc-950 flex items-center justify-center overflow-hidden">
        {hasImage ? (
          <img src={value} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="text-center px-2">
            <Sparkles className="w-5 h-5 text-fuchsia-300 mx-auto" />
            <div className="mt-1 text-[9px] text-zinc-600">paste image URL</div>
          </div>
        )}
      </div>
      <input id={inputId} value={value} onChange={(event) => onChange(event.target.value)} placeholder="https://..."
        className="mt-2 w-24 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-2 text-[9px] text-white placeholder:text-zinc-700 outline-none focus:border-blue-500/40" />
    </div>
  );
}

function Field({
  label, required = false, icon, multiline = false, value, onChange, placeholder, maxLength, suffix,
}: {
  label?: string; required?: boolean; icon?: React.ReactNode; multiline?: boolean; value: string; onChange: (value: string) => void; placeholder: string; maxLength?: number; suffix?: string;
}) {
  return (
    <div>
      {label && <label className="flex items-center gap-1 text-[10px] uppercase tracking-widest text-zinc-500">{label}{required && <span className="text-fuchsia-300">*</span>}</label>}
      <div className="relative mt-2">
        {multiline ? (
          <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength} rows={4}
            className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm leading-5 text-white placeholder:text-zinc-700 outline-none resize-none focus:border-blue-500/45 focus:ring-2 focus:ring-blue-500/10" />
        ) : (
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} maxLength={maxLength}
            className={'w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3.5 py-3 text-sm text-white placeholder:text-zinc-700 outline-none focus:border-blue-500/45 focus:ring-2 focus:ring-blue-500/10 ' + (icon || suffix ? 'pr-12' : '')} />
        )}
        {icon && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-zinc-600">{icon}</span>}
        {suffix && <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[9px] uppercase tracking-widest text-zinc-600">{suffix}</span>}
      </div>
      {maxLength && <div className="mt-1 text-right text-[9px] font-mono text-zinc-700">{value.length}/{maxLength}</div>}
    </div>
  );
}

function LockedRule({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/60 p-3.5 flex items-start gap-3">
      <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/15 flex items-center justify-center shrink-0"><Icon className="w-3.5 h-3.5 text-blue-300" /></div>
      <div><div className="text-xs font-semibold text-zinc-200">{title}</div><div className="mt-0.5 text-[10px] leading-4 text-zinc-600">{text}</div></div>
    </div>
  );
}

function Mechanic({ number, title, text }: { number: string; title: string; text: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-4">
      <div className="text-[9px] font-mono text-blue-300">{number}</div>
      <div className="mt-2 text-xs font-semibold text-white">{title}</div>
      <div className="mt-1 text-[10px] leading-4 text-zinc-600">{text}</div>
    </div>
  );
}

function PreviewMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5"><div className="text-[8px] uppercase tracking-widest text-zinc-600">{label}</div><div className="mt-1 text-xs font-semibold font-mono text-zinc-200">{value}</div></div>;
}

function PreviewLink({ icon: Icon, label }: { icon?: React.ComponentType<{ className?: string }>; label: string }) {
  return <span className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-[10px] text-zinc-500">{Icon ? <Icon className="w-3 h-3" /> : <span className="text-[9px] font-bold">TG</span>}{label}</span>;
}

function Stat({ value, label }: { value: string; label: string }) {
  return <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-3"><div className="text-sm font-bold font-mono text-white">{value}</div><div className="mt-1 text-[9px] uppercase tracking-widest text-zinc-600">{label}</div></div>;
}

function ReviewCard({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-zinc-800 bg-zinc-950/55 p-4"><div className="text-[9px] uppercase tracking-widest text-zinc-600">{label}</div><div className="mt-1.5 text-sm font-semibold text-white truncate">{value}</div></div>;
}

function Feature({ icon: Icon, title, text }: { icon: React.ComponentType<{ className?: string }>; title: string; text: string }) {
  return <div className="rounded-2xl border border-zinc-800 bg-[#0c0e12] p-5"><div className="w-9 h-9 rounded-xl border border-blue-500/15 bg-blue-500/10 flex items-center justify-center"><Icon className="w-4 h-4 text-blue-300" /></div><h3 className="mt-4 text-sm font-semibold text-white">{title}</h3><p className="mt-1.5 text-xs leading-5 text-zinc-600">{text}</p></div>;
}
