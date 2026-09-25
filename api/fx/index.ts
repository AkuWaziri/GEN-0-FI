const CMC_URL = 'https://pro-api.coinmarketcap.com';
const CG_URL = 'https://api.coingecko.com/api/v3';
const STABLES = new Set(['USDT','USDC','DAI','FDUSD','USDE','USDS','PYUSD','USDP','TUSD','GUSD','FRAX','LUSD','CRVUSD','USD0','USDG','USD1','EURC']);
const FIAT: Record<string,string> = {
  USD:'United States Dollar', EUR:'Euro', GBP:'British Pound', NGN:'Nigerian Naira', JPY:'Japanese Yen',
  CNY:'Chinese Yuan', CAD:'Canadian Dollar', AUD:'Australian Dollar', CHF:'Swiss Franc',
  INR:'Indian Rupee', AED:'UAE Dirham', SAR:'Saudi Riyal', ZAR:'South African Rand',
  KES:'Kenyan Shilling', GHS:'Ghanaian Cedi', BRL:'Brazilian Real', MXN:'Mexican Peso',
  SGD:'Singapore Dollar', HKD:'Hong Kong Dollar', NZD:'New Zealand Dollar'
};
const clean=(v:unknown)=>String(v??'').trim().toUpperCase();
const key=()=>String(process.env.CMC_API_KEY||'').trim();

async function cmc(path:string,params:Record<string,string>){
  const apiKey=key(); if(!apiKey) throw new Error('CMC_API_KEY is not configured in Vercel.');
  const url=new URL(CMC_URL+path); for(const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const r=await fetch(url,{headers:{Accept:'application/json','X-CMC_PRO_API_KEY':apiKey},signal:AbortSignal.timeout(10000)});
  const body=await r.json().catch(()=>null);
  if(!r.ok||Number(body?.status?.error_code||0)!==0) throw new Error(body?.status?.error_message||'CoinMarketCap request failed.');
  return body;
}
async function cg(path:string,params:Record<string,string>={}){
  const url=new URL(CG_URL+path); for(const [k,v] of Object.entries(params)) url.searchParams.set(k,v);
  const r=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(10000)});
  const body=await r.json().catch(()=>null);
  if(!r.ok) throw new Error(body?.error||'CoinGecko request failed.');
  return body;
}
async function coinMap(){
  const data=await cg('/coins/markets',{vs_currency:'usd',order:'market_cap_desc',per_page:'250',page:'1',sparkline:'false'});
  return (Array.isArray(data)?data:[]).map((x:any)=>({id:String(x.id),symbol:clean(x.symbol),name:String(x.name||x.symbol),kind:'crypto',stable:STABLES.has(clean(x.symbol)),rank:Number(x.market_cap_rank||999999)})).filter((x:any)=>x.symbol);
}
async function cgQuote(from:string,to:string,amount:number,assets:any[]){
  const crypto=assets.filter((x:any)=>x.kind==='crypto');
  const fromCoin=crypto.find((x:any)=>x.symbol===from);
  const toCoin=crypto.find((x:any)=>x.symbol===to);
  const fromIsFiat=Object.prototype.hasOwnProperty.call(FIAT,from);
  const toIsFiat=Object.prototype.hasOwnProperty.call(FIAT,to);
  if(from===to) return {converted:amount,rate:1};
  const vs=toIsFiat?to.toLowerCase():'usd';
  if(fromCoin){
    const p=await cg('/simple/price',{ids:fromCoin.id,vs_currencies:vs});
    const fromValue=Number(p?.[fromCoin.id]?.[vs]);
    if(!Number.isFinite(fromValue)) throw new Error('No live quote is available for this pair.');
    if(toIsFiat) return {converted:amount*fromValue,rate:fromValue};
    const tp=await cg('/simple/price',{ids:toCoin?.id||'',vs_currencies:'usd'});
    const toValue=Number(toCoin&&tp?.[toCoin.id]?.usd);
    if(!Number.isFinite(toValue)||toValue===0) throw new Error('No live quote is available for this pair.');
    return {converted:amount*fromValue/toValue,rate:fromValue/toValue};
  }
  if(fromIsFiat && toCoin){
    const p=await cg('/simple/price',{ids:toCoin.id,vs_currencies:from.toLowerCase()});
    const target=Number(p?.[toCoin.id]?.[from.toLowerCase()]);
    if(!Number.isFinite(target)||target===0) throw new Error('No live quote is available for this pair.');
    return {converted:amount/target,rate:1/target};
  }
  throw new Error('This live conversion pair is not available.');
}

export default async function handler(req:any,res:any){
  res.setHeader('Cache-Control','no-store'); res.setHeader('X-Content-Type-Options','nosniff');
  if(req.method==='OPTIONS') return res.status(204).end();
  if(req.method!=='GET') return res.status(405).json({ok:false,error:'Method not allowed.'});
  try{
    const action=clean(req.query?.action||'assets');
    const assets=await coinMap();
    if(action==='assets'){
      const fiat=Object.entries(FIAT).map(([code,name])=>({code,name,kind:'fiat',stable:false}));
      return res.status(200).json({ok:true,source:key()?'CoinMarketCap + CoinGecko':'CoinGecko',asOf:new Date().toISOString(),assets:[...assets,...fiat]});
    }
    if(action==='quote'){
      const from=clean(req.query?.from),to=clean(req.query?.to),amount=Number(req.query?.amount);
      if(!from||!to) return res.status(400).json({ok:false,error:'Choose both assets.'});
      if(!Number.isFinite(amount)||amount<0||amount>1e12) return res.status(400).json({ok:false,error:'Enter a valid amount.'});
      if(key()){
        try{
          const body=await cmc('/v2/tools/price-conversion',{amount:String(amount),symbol:from,convert:to});
          const item=Array.isArray(body?.data)?body.data[0]:body?.data;
          const quote=Array.isArray(item?.quote)?item.quote[0]:item?.quote;
          const target=quote?.[to]; const converted=Number(target?.price);
          if(Number.isFinite(converted)) return res.status(200).json({ok:true,from,to,amount,converted,rate:amount===0?null:converted/amount,source:'CoinMarketCap',lastUpdated:target?.last_updated||null,asOf:body?.status?.timestamp||new Date().toISOString()});
        }catch{}
      }
      const q=await cgQuote(from,to,amount,assets);
      return res.status(200).json({ok:true,from,to,amount,converted:q.converted,rate:amount===0?null:q.rate,source:'CoinGecko',asOf:new Date().toISOString()});
    }
    return res.status(400).json({ok:false,error:'Unknown FX action.'});
  }catch(error:any){
    console.error('[GEN-0 FX]',error);
    return res.status(503).json({ok:false,error:error?.message||'Live FX data is unavailable.'});
  }
}
