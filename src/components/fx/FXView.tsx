import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownUp, Check, ChevronDown, Loader2, RefreshCw, Search } from 'lucide-react';

type Asset = { id?: string; symbol?: string; code?: string; name: string; kind: 'crypto'|'fiat'; stable?: boolean; rank?: number };
const codeOf = (a:Asset) => a.kind === 'fiat' ? a.code || '' : a.symbol || '';
const assetKey = (a:Asset) => a.kind + ':' + codeOf(a);
const fmt = (n:number) => Number.isFinite(n) ? n.toLocaleString('en-US',{maximumFractionDigits:8}) : '—';

export const FXView:React.FC = () => {
  const [assets,setAssets]=useState<Asset[]>([]);
  const [from,setFrom]=useState<Asset|null>(null);
  const [to,setTo]=useState<Asset|null>(null);
  const [amount,setAmount]=useState('1');
  const [quote,setQuote]=useState<number|null>(null);
  const [rate,setRate]=useState<number|null>(null);
  const [updated,setUpdated]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const [quoting,setQuoting]=useState(false);
  const [error,setError]=useState('');
  const [picker,setPicker]=useState<'from'|'to'|null>(null);
  const [search,setSearch]=useState('');

  const loadAssets=async()=>{
    setLoading(true); setError('');
    try{
      const r=await fetch('/api/fx?action=assets',{cache:'no-store'});
      const d=await r.json();
      if(!r.ok || !d.ok) throw new Error(d.error || 'FX market data is unavailable.');
      const list=d.assets as Asset[];
      setAssets(list);
      setFrom(cur=>cur && list.some(x=>assetKey(x)===assetKey(cur)) ? cur : list.find(x=>x.kind==='crypto'&&codeOf(x)==='USDC') || list.find(x=>x.kind==='crypto') || null);
      setTo(cur=>cur && list.some(x=>assetKey(x)===assetKey(cur)) ? cur : list.find(x=>x.kind==='fiat'&&codeOf(x)==='NGN') || list.find(x=>x.kind==='fiat'&&codeOf(x)==='USD') || null);
    }catch(e:any){setError(e?.message || 'Could not load live FX assets.');}
    finally{setLoading(false);}
  };

  useEffect(()=>{void loadAssets();},[]);

  useEffect(()=>{
    if(!from||!to||!amount.trim()) return;
    const n=Number(amount);
    if(!Number.isFinite(n)||n<0){setQuote(null);setRate(null);setError('Enter a valid amount.');return;}
    let live=true;
    const run=async()=>{
      setQuoting(true);setError('');
      try{
        const qs=new URLSearchParams({action:'quote',from:codeOf(from),to:codeOf(to),amount:String(n)});
        const r=await fetch('/api/fx?'+qs.toString(),{cache:'no-store'});
        const d=await r.json();
        if(!r.ok||!d.ok) throw new Error(d.error || 'Live quote unavailable.');
        if(!live)return;
        setQuote(Number(d.converted));setRate(d.rate==null?null:Number(d.rate));setUpdated(d.lastUpdated||d.asOf||null);
      }catch(e:any){if(live){setQuote(null);setRate(null);setError(e?.message||'Live quote failed.');}}
      finally{if(live)setQuoting(false);}
    };
    void run();
    return()=>{live=false;};
  },[from,to,amount]);

  const filtered=useMemo(()=>{
    const q=search.toLowerCase().trim();
    const m=assets.filter(a=>!q||codeOf(a).toLowerCase().includes(q)||a.name.toLowerCase().includes(q));
    return {stable:m.filter(a=>a.kind==='crypto'&&a.stable),crypto:m.filter(a=>a.kind==='crypto'&&!a.stable),fiat:m.filter(a=>a.kind==='fiat')};
  },[assets,search]);

  const choose=(a:Asset)=>{if(picker==='from')setFrom(a);else setTo(a);setPicker(null);setSearch('');};
  const open=(side:'from'|'to')=>{setPicker(side);setSearch('');};

  const field=(side:'from'|'to',a:Asset|null)=>(
    <div className="rounded-2xl border border-white/[.08] bg-[#101722] p-4 transition focus-within:border-cyan-300/40">
      <div className="mb-3 flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[.18em] text-slate-500">{side==='from'?'From':'To'}</span><span className="text-[10px] text-slate-600">{side==='from'?'Amount':'Live quote'}</span></div>
      <div className="flex items-center gap-3">
        {side==='from'?<input value={amount} onChange={e=>setAmount(e.target.value.replace(/[^0-9.]/g,''))} inputMode="decimal" className="min-w-0 flex-1 bg-transparent text-3xl font-semibold tracking-tight text-white outline-none placeholder:text-slate-700" placeholder="0.00" />:<div className="min-w-0 flex-1 truncate text-3xl font-semibold tracking-tight text-white">{quoting?<Loader2 className="h-6 w-6 animate-spin text-cyan-300"/>:quote===null?'—':fmt(quote)}</div>}
        <button onClick={()=>open(side)} className="flex shrink-0 items-center gap-2 rounded-xl border border-white/10 bg-white/[.04] px-3 py-2 hover:border-cyan-300/35">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-300/[.08] text-[9px] font-bold text-cyan-200">{a?codeOf(a).slice(0,4):'?'}</span>
          <span className="text-left"><span className="block text-sm font-bold text-white">{a?codeOf(a):'Choose'}</span><span className="block max-w-[100px] truncate text-[9px] text-slate-500">{a?.name||'Asset'}</span></span><ChevronDown className="h-4 w-4 text-slate-500"/>
        </button>
      </div>
    </div>
  );

  return <main className="min-h-full px-4 py-7 sm:px-8 sm:py-10">
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-start justify-between gap-4">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.24em] text-cyan-300">GEN-0FI / FX</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">FX</h1><p className="mt-2 text-sm leading-6 text-slate-400">Convert crypto, stablecoins and fiat using live market reference rates.</p></div>
        <button onClick={()=>void loadAssets()} disabled={loading} className="rounded-xl border border-white/10 bg-white/[.04] p-2.5 text-slate-400 hover:text-white disabled:opacity-50" aria-label="Refresh"><RefreshCw className={loading?'h-4 w-4 animate-spin':'h-4 w-4'}/></button>
      </div>
      <section className="rounded-[28px] border border-white/[.09] bg-[#0a1019] p-4 shadow-[0_25px_90px_rgba(0,0,0,.35)] sm:p-5">
        {field('from',from)}
        <div className="relative z-10 -my-2 flex justify-center"><button onClick={()=>{const x=from;setFrom(to);setTo(x);}} className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-[#172231] text-cyan-200 shadow-lg hover:rotate-180 transition-transform" aria-label="Swap"><ArrowDownUp className="h-4 w-4"/></button></div>
        {field('to',to)}
        <div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-4">
          <div className="flex items-center justify-between gap-3"><span className="text-[10px] uppercase tracking-[.18em] text-slate-500">Reference rate</span><span className="rounded-full border border-cyan-300/15 px-2 py-1 text-[9px] text-cyan-200">LIVE</span></div>
          <p className="mt-2 text-base font-semibold text-white">{rate===null||!from||!to?'Waiting for quote':<>1 {codeOf(from)} <span className="mx-1 text-slate-500">≈</span> {fmt(rate)} {codeOf(to)}</>}</p>
          <p className="mt-2 text-[9px] text-slate-600">{updated?'Updated '+new Date(updated).toLocaleString():'Quote refreshes when inputs change'} · CoinMarketCap</p>
        </div>
        {error&&<div className="mt-3 rounded-xl border border-rose-400/20 bg-rose-400/[.05] px-3 py-2.5 text-xs text-rose-200">{error}</div>}
        <div className="mt-4 flex justify-between text-[9px] text-slate-600"><span>{loading?'Loading assets…':assets.length+' assets'}</span><span>Reference conversion only</span></div>
      </section>
    </div>
    {picker&&<div className="fixed inset-0 z-[200] flex items-end justify-center bg-black/75 backdrop-blur-sm sm:items-center sm:p-4" onMouseDown={e=>{if(e.target===e.currentTarget)setPicker(null)}}>
      <div className="flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl border border-white/10 bg-[#0d1520] sm:rounded-3xl">
        <div className="border-b border-white/[.08] p-4"><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-white">Select asset</h2><p className="mt-1 text-[9px] text-slate-500">Crypto · stablecoin · fiat</p></div><button onClick={()=>setPicker(null)} className="text-xs text-slate-500 hover:text-white">Close</button></div><div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2.5"><Search className="h-4 w-4 text-slate-500"/><input autoFocus value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search ticker or name" className="w-full bg-transparent text-sm text-white outline-none"/></div></div>
        <div className="overflow-y-auto p-2">{([['Stablecoins',filtered.stable],['Crypto',filtered.crypto],['Fiat',filtered.fiat]] as [string,Asset[]][]).map(([title,list])=>list.length?<div key={title}><p className="px-3 pb-1 pt-3 text-[9px] uppercase tracking-[.18em] text-slate-600">{title}</p>{list.map(a=><button key={assetKey(a)} onClick={()=>choose(a)} className="flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left hover:bg-cyan-300/[.06]"><span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[.07] bg-white/[.04] text-[9px] font-bold text-cyan-200">{codeOf(a).slice(0,4)}</span><span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-white">{codeOf(a)}</span><span className="block truncate text-[10px] text-slate-500">{a.name}</span></span>{((picker==='from'?from:to)&&assetKey(picker==='from'?from!:to!)===assetKey(a))&&<Check className="h-4 w-4 text-cyan-300"/>}</button>)}</div>:null)}{!filtered.stable.length&&!filtered.crypto.length&&!filtered.fiat.length&&<p className="p-8 text-center text-sm text-slate-500">No matching asset.</p>}</div>
      </div>
    </div>}
  </main>;
};
