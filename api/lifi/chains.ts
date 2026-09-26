const LI_FI_CHAINS = 'https://li.quest/v1/chains';

export default async function handler(req: any, res: any) {
  if (req.method && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const response = await fetch(LI_FI_CHAINS + '?chainTypes=EVM', {
      headers: { Accept: 'application/json', 'User-Agent': 'GEN-0FI/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return res.status(502).json({ error: 'LI.FI chain list unavailable.' });
    }

    const data = await response.json();
    const chains = (Array.isArray(data) ? data : data?.chains || [])
      .filter((chain: any) => Number.isInteger(Number(chain?.id)) && chain?.name)
      .filter((chain: any) => String(chain?.chainType || 'EVM').toUpperCase() === 'EVM');

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return res.status(200).json({ chains });
  } catch (error) {
    console.error('[LI.FI chains] Error:', error);
    return res.status(502).json({ error: 'Unable to load LI.FI supported chains.' });
  }
}
