import { applyApiSecurity } from '../_security.js';

const AAVE_API = 'https://api.v4.aave.com/graphql';
const MORPHO_API = 'https://api.morpho.org';
const ARC_CHAIN_ID = 5042;
const USDC = '0x3600000000000000000000000000000000000000'.toLowerCase();
const EURC = '0xbEf5f6d51CB62b58e6A8f77868681825C6fe21c1'.toLowerCase();

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { accept: 'application/json' },
    cache: 'no-store',
  });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body?.message === 'string' ? body.message : \`HTTP \${response.status}\`);
  return body?.data ?? body;
}

async function fetchAave() {
  const query = \`query ArcReserves {
    reserves(request: { query: { chainIds: [\${ARC_CHAIN_ID}] } }) {
      id
      chain { chainId name }
      spoke { name }
      asset {
        underlying {
          address
          info { symbol name decimals }
        }
      }
      summary {
        supplyApy { normalized }
        borrowApy { normalized }
        supplied { value }
        borrowed { value }
        available { value }
        utilization { normalized }
      }
      settings {
        supplyCap { value }
        borrowCap { value }
        collateralFactor { normalized }
      }
      status { isActive isFrozen isPaused }
      canSupply
      canBorrow
      canUseAsCollateral
    }
  }\`;

  const response = await fetch(AAVE_API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ query }),
    cache: 'no-store',
  });
  const json = await response.json();
  if (!response.ok || json?.errors?.length) {
    throw new Error(json?.errors?.[0]?.message || \`Aave HTTP \${response.status}\`);
  }

  const reserves = Array.isArray(json?.data?.reserves) ? json.data.reserves : [];
  return reserves
    .filter((r: any) => {
      const address = String(r?.asset?.underlying?.address || '').toLowerCase();
      const symbol = String(r?.asset?.underlying?.info?.symbol || '').toUpperCase();
      return address === USDC || address === EURC || symbol === 'USDC' || symbol === 'EURC';
    })
    .map((r: any) => ({
      id: String(r.id),
      protocol: 'Aave V4',
      asset: String(r?.asset?.underlying?.info?.symbol || '').toUpperCase(),
      name: String(r?.asset?.underlying?.info?.name || ''),
      market: String(r?.spoke?.name || 'Arc'),
      supplyApy: Number(r?.summary?.supplyApy?.normalized ?? 0),
      borrowApy: Number(r?.summary?.borrowApy?.normalized ?? 0),
      supplied: r?.summary?.supplied?.value ?? null,
      borrowed: r?.summary?.borrowed?.value ?? null,
      available: r?.summary?.available?.value ?? null,
      utilization: Number(r?.summary?.utilization?.normalized ?? 0),
      supplyCap: r?.settings?.supplyCap?.value ?? null,
      borrowCap: r?.settings?.borrowCap?.value ?? null,
      collateralFactor: Number(r?.settings?.collateralFactor?.normalized ?? 0),
      canSupply: Boolean(r?.canSupply),
      canBorrow: Boolean(r?.canBorrow),
      active: Boolean(r?.status?.isActive) && !Boolean(r?.status?.isPaused),
      frozen: Boolean(r?.status?.isFrozen),
      url: 'https://pro.aave.com/',
    }));
}

async function fetchMorpho() {
  const listed = await fetchJson(
    \`\${MORPHO_API}/v1/blue/markets?chain_id=\${ARC_CHAIN_ID}&listed=true&limit=1000\`,
  );

  const markets = Array.isArray(listed) ? listed : [];
  const relevant = markets.filter((m: any) => {
    const loan = String(m?.loan_token || '').toLowerCase();
    return loan === USDC || loan === EURC;
  });

  const rows = await Promise.all(relevant.slice(0, 40).map(async (m: any) => {
    const selector = \`\${ARC_CHAIN_ID}:\${m.market_id}\`;
    const [state, apy] = await Promise.all([
      fetchJson(\`\${MORPHO_API}/v0/blue/markets/\${selector}/state\`),
      fetchJson(\`\${MORPHO_API}/v0/blue/markets/\${selector}/apy-averages\`),
    ]);

    const loan = String(m.loan_token || '').toLowerCase();
    const asset = loan === EURC ? 'EURC' : 'USDC';
    const supply = Number(state?.total_supply_assets ?? 0);
    const borrow = Number(state?.total_borrow_assets ?? 0);
    const supplyApy = Number(apy?.supply_apy_averages?.['24h'] ?? 0) * 100;
    const borrowApy = Number(apy?.borrow_apy_averages?.['24h'] ?? 0) * 100;

    return {
      id: String(m.market_id),
      protocol: 'Morpho',
      asset,
      name: \`\${asset} lending market\`,
      market: \`Blue • \${String(m?.collateral_token || '').slice(0, 10)}…\`,
      collateral: String(m?.collateral_token || ''),
      supplyApy,
      borrowApy,
      supplied: supply,
      borrowed: borrow,
      available: Math.max(supply - borrow, 0),
      utilization: supply > 0 ? (borrow / supply) * 100 : 0,
      lltv: Number(m?.lltv_wad || 0) / 1e16,
      canSupply: true,
      canBorrow: true,
      active: true,
      frozen: false,
      url: \`https://app.morpho.org/arc/market/\${m.market_id}\`,
    };
  }));

  return rows;
}

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [aaveResult, morphoResult] = await Promise.allSettled([fetchAave(), fetchMorpho()]);
    const errors: Record<string, string> = {};
    const aave = aaveResult.status === 'fulfilled' ? aaveResult.value : [];
    const morpho = morphoResult.status === 'fulfilled' ? morphoResult.value : [];

    if (aaveResult.status === 'rejected') errors.aave = aaveResult.reason instanceof Error ? aaveResult.reason.message : 'Aave data unavailable';
    if (morphoResult.status === 'rejected') errors.morpho = morphoResult.reason instanceof Error ? morphoResult.reason.message : 'Morpho data unavailable';

    if (!aave.length && !morpho.length) {
      return res.status(502).json({ error: 'Lending market data unavailable', sources: errors });
    }

    return res.status(200).json({
      chainId: ARC_CHAIN_ID,
      updatedAt: new Date().toISOString(),
      sources: {
        aave: AAVE_API,
        morpho: MORPHO_API,
      },
      aave,
      morpho,
      errors,
    });
  } catch (error) {
    return res.status(502).json({
      error: 'Lending market data unavailable',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
