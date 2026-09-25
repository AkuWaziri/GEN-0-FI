import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const SOURCE = fs.readFileSync(path.join(process.cwd(),'contracts','Gen0BoundNFT.sol'),'utf8');

function findImport(importPath:string) {
  try {
    const absolute = path.join(process.cwd(),'node_modules',importPath);
    return { contents: fs.readFileSync(absolute,'utf8') };
  } catch {
    return { error: 'Import not found: ' + importPath };
  }
}

export default async function handler(req:any,res:any) {
  res.setHeader('Cache-Control','no-store');
  if (req.method !== 'POST') return res.status(405).json({ok:false,error:'Method not allowed.'});

  try {
    const body=req.body||{};
    const usdc=String(body.usdc||'').trim();
    const feeRecipient=String(body.feeRecipient||'').trim();
    const metadataURI=String(body.metadataURI||'').trim();
    if (!/^0x[a-fA-F0-9]{40}$/.test(usdc)) return res.status(400).json({ok:false,error:'Invalid USDC address.'});
    if (!/^0x[a-fA-F0-9]{40}$/.test(feeRecipient)) return res.status(400).json({ok:false,error:'Invalid fee wallet address.'});
    if (!metadataURI || metadataURI.length>12000) return res.status(400).json({ok:false,error:'A valid NFT metadata URI is required.'});

    const input={
      language:'Solidity',
      sources:{'Gen0BoundNFT.sol':{content:SOURCE}},
      settings:{optimizer:{enabled:true,runs:200},metadata:{bytecodeHash:'none'},outputSelection:{'*':{'Gen0BoundNFT':['abi','evm.bytecode.object']}}}
    };
    const output=JSON.parse(solc.compile(JSON.stringify(input),{import:findImport}));
    const errors=(output.errors||[]).filter((x:any)=>x.severity==='error');
    if(errors.length) throw new Error(errors.map((x:any)=>x.formattedMessage||x.message).join('\n'));
    const artifact=output.contracts?.['Gen0BoundNFT.sol']?.Gen0BoundNFT;
    const bytecode=artifact?.evm?.bytecode?.object;
    if(!bytecode) throw new Error('Solidity compiler returned no NFT deployment bytecode.');

    return res.status(200).json({ok:true,abi:artifact.abi,bytecode:'0x'+bytecode,compiler:solc.version(),chainId:5042});
  }catch(error:any){
    console.error('[GEN-0 NFT compile]',error);
    return res.status(500).json({ok:false,error:error?.message||'NFT compilation failed.'});
  }
}
