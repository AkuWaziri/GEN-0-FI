const ARC_SCAN_API = 'https://api.arc-scan.org/api';
export const GM_FEE_ADDRESS = '0x5Bce25397eEfbc76f6479e6838c00a5115dbEA4c';
export const GM_FEE_RAW = '20000000000000000'; // 0.02 USDC, Arc native USDC uses 18 decimals.
export const GM_DATA = '0x47454e2d3046492d474d'; // "GEN-0FI-GM"

export interface GmRecord {
  hash: string;
  address: string;
  timestamp: number;
}

interface ArcTx {
  hash?: string;
  timeStamp?: string;
  from?: string;
  to?: string;
  value?: string;
  input?: string;
  isError?: string;
  txreceipt_status?: string;
  status?: string;
}

function isSuccessful(tx: ArcTx): boolean {
  return tx.isError === undefined
    ? tx.txreceipt_status !== '0' && tx.status !== 'reverted'
    : tx.isError === '0';
}

function isGmTransaction(tx: ArcTx): boolean {
  return Boolean(
    tx.hash &&
    tx.from &&
    tx.to?.toLowerCase() === GM_FEE_ADDRESS.toLowerCase() &&
    tx.value === GM_FEE_RAW &&
    tx.input?.toLowerCase() === GM_DATA.toLowerCase() &&
    isSuccessful(tx)
  );
}

async function fetchFeeAddressTransactions(): Promise<ArcTx[]> {
  const response = await fetch(
    `${ARC_SCAN_API}?module=account&action=txlist&address=${GM_FEE_ADDRESS}&startblock=0&endblock=latest&page=1&offset=1000&sort=desc`,
    { headers: { Accept: 'application/json', 'User-Agent': 'GEN-0FI/1.0' }, cache: 'no-store' }
  );
  if (!response.ok) throw new Error('Arcscan GM history unavailable');
  const data = await response.json();
  if (!Array.isArray(data?.result)) return [];
  return data.result as ArcTx[];
}

export function buildGmRecords(txs: ArcTx[]): GmRecord[] {
  return txs
    .filter(isGmTransaction)
    .map((tx) => ({
      hash: tx.hash as string,
      address: tx.from as string,
      timestamp: Number(tx.timeStamp || 0) * 1000,
    }))
    .filter((record) => Number.isFinite(record.timestamp) && record.timestamp > 0)
    .sort((a, b) => b.timestamp - a.timestamp);
}

export function calculateStreak(records: GmRecord[], address: string) {
  const mine = records
    .filter((record) => record.address.toLowerCase() === address.toLowerCase())
    .sort((a, b) => b.timestamp - a.timestamp);

  if (mine.length === 0) {
    return { gmCount: 0, streak: 0, points: 0, lastGmAt: null as number | null };
  }

  const now = Date.now();
  const latest = mine[0];
  const elapsed = now - latest.timestamp;

  // A GM is valid once every 24 hours. A streak remains alive for the next
  // 24-hour window after the previous GM, giving the user until 48h after
  // the previous GM to continue the consecutive-day sequence.
  if (elapsed >= 48 * 60 * 60 * 1000) {
    return { gmCount: mine.length, streak: 0, points: 0, lastGmAt: latest.timestamp };
  }

  let streak = 1;
  for (let i = 1; i < mine.length; i += 1) {
    const gap = mine[i - 1].timestamp - mine[i].timestamp;
    if (gap < 24 * 60 * 60 * 1000 || gap > 48 * 60 * 60 * 1000) break;
    streak += 1;
  }

  return {
    gmCount: mine.length,
    streak,
    points: (streak * (streak + 1)) / 2,
    lastGmAt: latest.timestamp,
  };
}

export function getNextGmAt(lastGmAt: number | null): number | null {
  return lastGmAt ? lastGmAt + 24 * 60 * 60 * 1000 : null;
}

export async function getGmStatus(address: string) {
  const records = buildGmRecords(await fetchFeeAddressTransactions());
  const status = calculateStreak(records, address);
  const nextGmAt = getNextGmAt(status.lastGmAt);
  return {
    ...status,
    nextGmAt,
    canGm: !nextGmAt || Date.now() >= nextGmAt,
  };
}

export async function getGmLeaderboard() {
  const records = buildGmRecords(await fetchFeeAddressTransactions());
  const byAddress = new Map<string, GmRecord[]>();

  for (const record of records) {
    const key = record.address.toLowerCase();
    const list = byAddress.get(key) || [];
    list.push(record);
    byAddress.set(key, list);
  }

  const leaderboard = Array.from(byAddress.entries()).map(([address, walletRecords]) => {
    const status = calculateStreak(walletRecords, address);
    return {
      address: walletRecords[0].address,
      gmCount: status.gmCount,
      streak: status.streak,
      points: status.points,
      lastGmAt: status.lastGmAt,
    };
  });

  leaderboard.sort((a, b) =>
    b.points - a.points ||
    b.gmCount - a.gmCount ||
    b.streak - a.streak ||
    (b.lastGmAt || 0) - (a.lastGmAt || 0)
  );

  return leaderboard.map((entry, index) => ({ rank: index + 1, ...entry }));
}
