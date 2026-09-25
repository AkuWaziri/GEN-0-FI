import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, ExternalLink, Gem, Loader2, Rocket, ShieldCheck, Sparkles } from 'lucide-react';
import { encodeDeployData, type Address } from 'viem';
import { useAccount, usePublicClient, useWalletClient } from 'wagmi';
import { getArcScanTxUrl } from '../../config/arc';
import { GEN0_BOUND_ARTWORK_URL, GEN0_BOUND_CHAIN_ID, GEN0_BOUND_FEE_WALLET, GEN0_BOUND_MINT_PRICE, GEN0_BOUND_NFT_ADDRESS, GEN0_BOUND_USDC_ADDRESS } from '../../config/gen0BoundNFT';

const NFT_ABI = [
  {type:'function',name:'hasMinted',stateMutability:'view',inputs:[{name:'',type:'address'}],outputs:[{name:'',type:'bool'}]},
  {type:'function',name:'mint',stateMutability:'nonpayable',inputs:[],outputs:[]},
] as const;

const USDC_ABI = [
  {type:'function',name:'allowance',stateMutability:'view',inputs:[{name:'owner',type:'address'},{name:'spender',type:'address'}],outputs:[{name:'',type:'uint256'}]},
  {type:'function',name:'approve',stateMutability:'nonpayable',inputs:[{name:'spender',type:'address'},{name:'value',type:'uint256'}],outputs:[{name:'',type:'bool'}]},
] as const;

const DEPLOY_ABI=[{
  type:'constructor',
  inputs:[
    {name:'usdc_',type:'address'},
    {name:'feeRecipient_',type:'address'},
    {name:'metadataURI_',type:'string'}
  ],
  stateMutability:'nonpayable'
}] as const;

const localAddress=()=>typeof window==='undefined'?'':(window.localStorage.getItem('gen0_bound_nft_address')||'');
const validAddress=(x:string)=>/^0x[a-fA-F0-9]{40}$/.test(x);

export const Gen0BoundNFTView:React.FC=()=>{
  const {address,chainId}=useAccount();
  const {data:walletClient}=useWalletClient({chainId:GEN0_BOUND_CHAIN_ID});
  const publicClient=usePublicClient({chainId:GEN0_BOUND_CHAIN_ID});

  const [contractAddress,setContractAddress]=useState<string>(()=>GEN0_BOUND_NFT_ADDRESS||localAddress());
  const [artwork,setArtwork]=useState(GEN0_BOUND_ARTWORK_URL);
  const [deploying,setDeploying]=useState(false);
  const [minting,setMinting]=useState(false);
  const [status,setStatus]=useState('');
  const [error,setError]=useState('');
  const [txHash,setTxHash]=useState('');
  const [owned,setOwned]=useState(false);
  const [showOwned,setShowOwned]=useState(false);

  useEffect(()=>{ if(GEN0_BOUND_ARTWORK_URL)setArtwork(GEN0_BOUND_ARTWORK_URL); },[]);
  useEffect(()=>{
    if(!address||!contractAddress||!validAddress(contractAddress)||!publicClient)return;
    let active=true;
    publicClient.readContract({address:contractAddress as Address,abi:NFT_ABI,functionName:'hasMinted',args:[address]})
      .then(v=>{if(active){setOwned(Boolean(v));if(v)setShowOwned(true);}})
      .catch(()=>{if(active)setOwned(false);});
    return()=>{active=false;};
  },[address,contractAddress,publicClient]);

  const metadataURI=useMemo(()=>{
    const image=artwork.trim();
    if(!image)return '';
    return 'data:application/json,'+encodeURIComponent(JSON.stringify({
      name:'GEN-0 Bound',
      description:'The GEN-0 Bound soulbound collectible on Arc Mainnet.',
      image
    }));
  },[artwork]);

  const deployNFT=async()=>{
    if(!walletClient||!publicClient||!address){setError('Connect your wallet first.');return;}
    if(chainId!==GEN0_BOUND_CHAIN_ID){setError('Switch your wallet to Arc Mainnet.');return;}
    if(!metadataURI){setError('Add the final artwork URL before deploying.');return;}
    setDeploying(true);setError('');setStatus('Compiling the real GEN-0 Bound contract…');
    try{
      const response=await fetch('/api/nft/compile',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
        usdc:GEN0_BOUND_USDC_ADDRESS,feeRecipient:GEN0_BOUND_FEE_WALLET,metadataURI
      })});
      const compiled=await response.json();
      if(!response.ok||!compiled.ok)throw new Error(compiled.error||'NFT compilation failed.');
      const data=encodeDeployData({abi:compiled.abi,bytecode:compiled.bytecode,args:[GEN0_BOUND_USDC_ADDRESS,GEN0_BOUND_FEE_WALLET,metadataURI]});
      setStatus('Confirm the GEN-0 Bound deployment in your wallet…');
      const hash=await walletClient.sendTransaction({account,address:undefined,data,chainId:GEN0_BOUND_CHAIN_ID});
      setTxHash(hash);
      setStatus('Waiting for the NFT contract to confirm on Arc Mainnet…');
      const receipt=await publicClient.waitForTransactionReceipt({hash});
      if(receipt.status!=='success'||!receipt.contractAddress)throw new Error('Arc confirmed the transaction but returned no contract address.');
      const deployed=receipt.contractAddress;
      setContractAddress(deployed);
      window.localStorage.setItem('gen0_bound_nft_address',deployed);
      setStatus('GEN-0 Bound contract deployed and confirmed.');
    }catch(e:any){
      setError(e?.shortMessage||e?.message||'NFT deployment failed.');
    }finally{setDeploying(false);}
  };

  const mint=async()=>{
    if(!walletClient||!publicClient||!address){setError('Connect your wallet first.');return;}
    if(chainId!==GEN0_BOUND_CHAIN_ID){setError('Switch your wallet to Arc Mainnet.');return;}
    if(!validAddress(contractAddress)){setError('Deploy or configure the GEN-0 Bound contract first.');return;}
    if(owned){setShowOwned(true);return;}
    setMinting(true);setError('');setStatus('Checking your USDC allowance…');setTxHash('');
    try{
      const allowance=await publicClient.readContract({address:GEN0_BOUND_USDC_ADDRESS,abi:USDC_ABI,functionName:'allowance',args:[address,contractAddress as Address]});
      if(allowance<GEN0_BOUND_MINT_PRICE){
        setStatus('Confirm the 1 USDC approval in your wallet…');
        const approval=await walletClient.writeContract({account,address:GEN0_BOUND_USDC_ADDRESS,abi:USDC_ABI,functionName:'approve',args:[contractAddress as Address,GEN0_BOUND_MINT_PRICE],chainId:GEN0_BOUND_CHAIN_ID});
        await publicClient.waitForTransactionReceipt({hash:approval});
      }
      setStatus('Confirm the GEN-0 Bound mint in your wallet…');
      const hash=await walletClient.writeContract({account,address:contractAddress as Address,abi:NFT_ABI,functionName:'mint',chainId:GEN0_BOUND_CHAIN_ID});
      setTxHash(hash);setStatus('Waiting for your GEN-0 Bound NFT to confirm on Arc…');
      const receipt=await publicClient.waitForTransactionReceipt({hash});
      if(receipt.status!=='success')throw new Error('The mint transaction reverted.');
      setOwned(true);setStatus('Mint confirmed on Arc Mainnet.');setShowOwned(true);
    }catch(e:any){setError(e?.shortMessage||e?.message||'Mint failed.');}
    finally{setMinting(false);}
  };

  const configured=validAddress(contractAddress);
  return <div className="p-4 sm:p-6">
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.24em] text-cyan-300">GEN-0 Bound</p><h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">Your onchain collectible</h1><p className="mt-2 max-w-xl text-sm leading-6 text-slate-400">One soulbound collectible per wallet. Deployed and settled directly on Arc Mainnet.</p></div>
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-cyan-300/15 bg-cyan-300/[.05] px-3 py-1.5 text-[9px] font-semibold uppercase tracking-wider text-cyan-200"><Sparkles className="h-3 w-3"/> Arc Mainnet</span>
      </div>
      <div className="grid gap-5 lg:grid-cols-[minmax(280px,.9fr)_minmax(0,1.1fr)]">
        <div className="overflow-hidden rounded-3xl border border-white/[.08] bg-[#0a1019]">
          <div className="aspect-square bg-[#0d1420]">{artwork?<img src={artwork} alt="GEN-0 Bound" className="h-full w-full object-cover" draggable={false}/>:<div className="flex h-full items-center justify-center p-8 text-center text-sm text-slate-500">Add the artwork URL to deploy the NFT.</div>}</div>
        </div>
        <section className="rounded-3xl border border-white/[.08] bg-[#0a1019] p-5 sm:p-6">
          <div className="flex items-center justify-between"><div><h2 className="text-sm font-bold text-white">GEN-0 Bound</h2><p className="mt-1 text-[9px] uppercase tracking-[.18em] text-slate-600">Soulbound · GEN0B</p></div><ShieldCheck className="h-5 w-5 text-cyan-300"/></div>
          <div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3"><p className="text-[9px] uppercase tracking-wider text-slate-600">Mint</p><p className="mt-1 text-sm font-bold text-white">1 USDC</p></div><div className="rounded-2xl border border-white/[.07] bg-white/[.025] p-3"><p className="text-[9px] uppercase tracking-wider text-slate-600">Limit</p><p className="mt-1 text-sm font-bold text-white">1 / wallet</p></div></div>
          {!configured&&<div className="mt-4 rounded-2xl border border-cyan-300/10 bg-cyan-300/[.035] p-4"><div className="flex items-center gap-2 text-xs font-semibold text-white"><Rocket className="h-4 w-4 text-cyan-300"/> Deploy once, then mint</div><p className="mt-1 text-[10px] leading-5 text-slate-500">The contract uses the fixed Arc USDC address and GEN-0 fee wallet. The metadata is embedded as a data URI and points to your artwork.</p><input value={artwork} onChange={e=>setArtwork(e.target.value)} placeholder="https://.../gen0-bound.png" className="mt-3 w-full rounded-xl border border-white/10 bg-black/20 px-3 py-2.5 text-xs text-white outline-none focus:border-cyan-300/35"/></div>}
          {configured&&<div className="mt-4 rounded-2xl border border-emerald-300/10 bg-emerald-300/[.03] p-4"><p className="text-[9px] uppercase tracking-wider text-emerald-300">Contract ready</p><p className="mt-1 break-all font-mono text-[10px] text-slate-400">{contractAddress}</p><a href={'https://explorer.arc.io/address/'+contractAddress} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-cyan-300">View contract <ExternalLink className="h-3 w-3"/></a></div>}
          {status&&<div className="mt-4 rounded-xl border border-white/[.07] bg-black/20 px-3 py-2.5 text-[10px] leading-5 text-slate-400">{status}</div>}
          {error&&<div className="mt-3 rounded-xl border border-rose-400/15 bg-rose-400/[.04] px-3 py-2.5 text-[10px] leading-5 text-rose-200">{error}</div>}
          {txHash&&<a href={getArcScanTxUrl(txHash)} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-cyan-300">View transaction <ExternalLink className="h-3 w-3"/></a>}
          {!configured?<button disabled={deploying||!artwork.trim()} onClick={()=>void deployNFT()} className="mt-5 flex w-full items-center justify-center rounded-xl bg-cyan-400 py-3 text-xs font-extrabold text-slate-950 hover:bg-cyan-300 disabled:opacity-40">{deploying?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Rocket className="mr-2 h-4 w-4"/>}{deploying?'DEPLOYING ON ARC…':'DEPLOY GEN-0 BOUND'}</button>:<button disabled={minting||owned} onClick={()=>void mint()} className="mt-5 flex w-full items-center justify-center rounded-xl bg-cyan-400 py-3 text-xs font-extrabold text-slate-950 hover:bg-cyan-300 disabled:bg-white/[.06] disabled:text-slate-500">{minting?<Loader2 className="mr-2 h-4 w-4 animate-spin"/>:<Gem className="mr-2 h-4 w-4"/>}{owned?'YOU OWN GEN-0 BOUND':minting?'MINTING…':'MINT · 1 USDC'}</button>}
          <p className="mt-3 text-center text-[9px] leading-5 text-slate-600">1 USDC is transferred directly onchain to the GEN-0 fee wallet. Transfers of the NFT are disabled.</p>
        </section>
      </div>
    </div>
    {showOwned&&<div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/80 p-5 backdrop-blur-md"><div className="w-full max-w-md rounded-3xl border border-cyan-300/20 bg-[#0b111a] p-5 shadow-[0_0_90px_rgba(34,211,238,.16)]"><div className="text-center"><span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/15 bg-emerald-300/[.06] px-3 py-1 text-[9px] uppercase tracking-wider text-emerald-300"><CheckCircle2 className="h-3.5 w-3.5"/> Confirmed on Arc</span><h2 className="mt-4 text-3xl font-black text-white">YOU OWN</h2>{artwork&&<img src={artwork} alt="GEN-0 Bound you own" className="mt-5 aspect-square w-full rounded-2xl object-cover border border-white/10"/>}<button onClick={()=>setShowOwned(false)} className="mt-5 w-full rounded-xl border border-white/10 bg-white/[.05] py-2.5 text-xs font-bold text-white">CLOSE</button></div></div></div>}
  </div>;
};
