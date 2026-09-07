import { ARC_NETWORK_CONFIG } from '../src/config/arc';

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  res.status(200).json({
    status: 'ok',
    service: 'GEN-0 FI Blockchain Intelligence API',
    network: ARC_NETWORK_CONFIG.name,
    chainId: ARC_NETWORK_CONFIG.chainId,
    time: new Date().toISOString(),
  });
}
