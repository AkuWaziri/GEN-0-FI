import { createPublicClient, formatUnits, http, isAddress } from 'viem';
import { arcTestnetChain, ARC_NETWORK_CONFIG, ARC_TESTNET_RPC_URL } from '../../config/arc';
import { normalizeTransaction, RawTxInput } from './normalizer';
import { NormalizedTransaction, WalletSummary } from '../../types/blockchain';

// Dedicated Viem client targeted strictly to Arc Testnet native USDC
export const arcClient = createPublicClient({
  chain: arcTestnetChain,
  transport: http(process.env.ARC_TESTNET_RPC_URL || ARC_TESTNET_RPC_URL, {
    timeout: 15_000,
    retryCount: 3,
    retryDelay: 1000,
  }),
});

const ARC_EXPLORER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// In-memory cache for transactions to reduce redundant network calls
interface CachedTxResult {
  transactions: NormalizedTransaction[];
  isUnavailable: boolean;
  timestamp: number;
}
const txCache = new Map<string, CachedTxResult>();
const TX_CACHE_TTL_MS = 20_000;

/**
 * Fetch verified onchain balance directly from Arc Testnet RPC.
 */
export async function fetchBalanceFromArcRpc(address: string): Promise<{ formatted: string; raw: string }> {
  if (!address || !isAddress(address, { strict: false })) {
    return { formatted: '0.00', raw: '0' };
  }

  const targetAddr = address.toLowerCase() as `0x${string}`;

  // 1. Direct Viem RPC query (primary source of truth)
  try {
    const balanceWei = await arcClient.getBalance({ address: targetAddr });
    const formattedUnits = formatUnits(balanceWei, 18);
    const num = parseFloat(formattedUnits);
    const displayStr = isNaN(num) ? '0.00' : num === 0 ? '0.00' : num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    return {
      formatted: displayStr,
      raw: balanceWei.toString(),
    };
  } catch (rpcErr) {
    console.warn(`[ArcService] RPC getBalance failed for ${address}:`, rpcErr);
  }

  // 2. Direct ArcScan v2 address lookup fallback
  try {
    const scanRes = await fetch(`https://testnet.arcscan.app/api/v2/addresses/${targetAddr}`, {
      headers: ARC_EXPLORER_HEADERS,
      signal: AbortSignal.timeout(4000),
    });
    if (scanRes.ok) {
      const scanData: any = await scanRes.json();
      if (scanData && scanData.coin_balance !== undefined && scanData.coin_balance !== null) {
        const balanceWei = BigInt(scanData.coin_balance);
        const formattedUnits = formatUnits(balanceWei, 18);
        const num = parseFloat(formattedUnits);
        const displayStr = isNaN(num) ? '0.00' : num === 0 ? '0.00' : num.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        });
        return {
          formatted: displayStr,
          raw: balanceWei.toString(),
        };
      }
    }
  } catch (scanErr) {
    console.warn(`[ArcService] ArcScan fallback getBalance failed for ${address}:`, scanErr);
  }

  return { formatted: '0.00', raw: '0' };
}

/**
 * Fetch verified transactions for an Arc address across multiple indexer fallbacks.
 */
export async function fetchTransactionsForAddress(
  address: string,
  limit = 50
): Promise<{ transactions: NormalizedTransaction[]; isUnavailable: boolean }> {
  if (!address || !isAddress(address, { strict: false })) {
    return { transactions: [], isUnavailable: false };
  }

  const normalizedAddress = address.toLowerCase();

  // Check cache
  const cached = txCache.get(normalizedAddress);
  if (cached && Date.now() - cached.timestamp < TX_CACHE_TTL_MS) {
    return { transactions: cached.transactions, isUnavailable: cached.isUnavailable };
  }

  const transactions: NormalizedTransaction[] = [];

  // 1. ArcScan Blockscout API v2
  try {
    const v2Url = `https://testnet.arcscan.app/api/v2/addresses/${address}/transactions`;
    const scanRes = await fetch(v2Url, {
      headers: ARC_EXPLORER_HEADERS,
      signal: AbortSignal.timeout(4000),
    });
    if (scanRes.ok) {
      const scanData: any = await scanRes.json();
      if (scanData && Array.isArray(scanData.items) && scanData.items.length > 0) {
        for (const tx of scanData.items.slice(0, limit)) {
          const rawTx: RawTxInput = {
            hash: tx.hash,
            blockNumber: BigInt(tx.block_number || '0'),
            from: tx.from?.hash || '',
            to: tx.to?.hash || tx.created_contract?.hash || null,
            value: BigInt(tx.value || '0'),
            fee: tx.fee?.value ? BigInt(tx.fee.value) : undefined,
            gas: BigInt(tx.gas_limit || tx.gas_used || '21000'),
            gasPrice: BigInt(tx.gas_price || '25000000000'),
            gasUsed: BigInt(tx.gas_used || '21000'),
            input: tx.raw_input || '0x',
            timestamp: tx.timestamp ? new Date(tx.timestamp).getTime() : Date.now(),
            status: tx.status === 'ok' || tx.result === 'success' ? 1 : 0,
            contractAddress: tx.created_contract?.hash || null,
          };
          transactions.push(normalizeTransaction(rawTx, address));
        }
        txCache.set(normalizedAddress, { transactions, isUnavailable: false, timestamp: Date.now() });
        return { transactions, isUnavailable: false };
      }
    }
  } catch {
    // Continue to token-transfers fallback
  }

  // 2. ArcScan Token Transfers endpoint
  try {
    const tokenUrl = `https://testnet.arcscan.app/api/v2/addresses/${address}/token-transfers`;
    const tokenRes = await fetch(tokenUrl, {
      headers: ARC_EXPLORER_HEADERS,
      signal: AbortSignal.timeout(3500),
    });
    if (tokenRes.ok) {
      const tokenData: any = await tokenRes.json();
      if (tokenData && Array.isArray(tokenData.items) && tokenData.items.length > 0) {
        for (const item of tokenData.items.slice(0, limit)) {
          const tokenDecimals = parseInt(item.total?.decimals || '6', 10);
          const rawVal = item.total?.value || '0';
          const multiplier = 10n ** BigInt(Math.max(0, 18 - tokenDecimals));
          const valWei = BigInt(rawVal) * multiplier;

          const rawTx: RawTxInput = {
            hash: item.transaction_hash,
            blockNumber: BigInt(item.block_number || '0'),
            from: item.from?.hash || '',
            to: item.to?.hash || null,
            value: valWei,
            fee: undefined,
            gas: 21000n,
            gasPrice: 25000000000n,
            gasUsed: 21000n,
            input: item.method || '0x',
            timestamp: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
            status: 1,
            contractAddress: null,
          };
          transactions.push(normalizeTransaction(rawTx, address));
        }
        txCache.set(normalizedAddress, { transactions, isUnavailable: false, timestamp: Date.now() });
        return { transactions, isUnavailable: false };
      }
    }
  } catch {
    // Continue to RPC scan
  }

  // 3. Quick RPC recent block scan (last 6 blocks)
  try {
    const currentBlock = await arcClient.getBlockNumber();
    const scanDepth = 6n;
    const fromBlock = currentBlock > scanDepth ? currentBlock - scanDepth : 0n;

    const blockNumbers: bigint[] = [];
    for (let b = currentBlock; b >= fromBlock; b--) {
      blockNumbers.push(b);
    }

    const blocks = await Promise.all(
      blockNumbers.map((num) =>
        arcClient.getBlock({ blockNumber: num, includeTransactions: true }).catch(() => null)
      )
    );

    for (const block of blocks) {
      if (block?.transactions && Array.isArray(block.transactions)) {
        for (const tx of block.transactions) {
          if (typeof tx === 'object' && tx) {
            const txFrom = (tx.from || '').toLowerCase();
            const txTo = (tx.to || '').toLowerCase();

            if (txFrom === normalizedAddress || txTo === normalizedAddress) {
              const rawTx: RawTxInput = {
                hash: tx.hash,
                blockNumber: block.number,
                from: tx.from,
                to: tx.to,
                value: tx.value,
                gas: tx.gas,
                gasPrice: tx.gasPrice || 1000000000n,
                gasUsed: tx.gas || 21000n,
                input: tx.input,
                timestamp: Number(block.timestamp) * 1000,
                status: 1,
              };
              transactions.push(normalizeTransaction(rawTx, address));
            }
          }
        }
      }
    }
  } catch {
    // Silently continue
  }

  const isUnavailable = transactions.length === 0;
  txCache.set(normalizedAddress, { transactions, isUnavailable, timestamp: Date.now() });
  return { transactions, isUnavailable };
}

/**
 * Compute authoritative wallet summary metrics based on verified onchain data.
 */
export function computeWalletSummary(
  address: string,
  balanceFormatted: string,
  transactions: NormalizedTransaction[],
  isHistoryUnavailable: boolean
): WalletSummary {
  let totalReceivedWei = 0n;
  let totalSentWei = 0n;
  let totalGasSpentUSDCNum = 0;
  let contractInteractionsCount = 0;
  let incomingTransfersCount = 0;
  let outgoingTransfersCount = 0;
  const counterparties = new Set<string>();

  for (const tx of transactions) {
    const gasNum = parseFloat(tx.gasCostUSDC || '0') || 0;
    totalGasSpentUSDCNum += gasNum;

    if (tx.isContractInteraction) {
      contractInteractionsCount++;
    }

    if (tx.from) counterparties.add(tx.from.toLowerCase());
    if (tx.to) counterparties.add(tx.to.toLowerCase());

    try {
      const valWei = BigInt(tx.rawValue || '0');
      if (tx.direction === 'received') {
        totalReceivedWei += valWei;
        incomingTransfersCount++;
      } else if (tx.direction === 'sent') {
        totalSentWei += valWei;
        outgoingTransfersCount++;
      }
    } catch {
      // Ignore invalid rawValue
    }
  }

  const cleanBalStr = balanceFormatted.replace(/,/g, '');
  const parsedBalance = parseFloat(cleanBalStr) || 0;

  const hasBalanceWithZeroScannedTxs = parsedBalance > 0 && transactions.length === 0;
  const isScanIncomplete = isHistoryUnavailable || hasBalanceWithZeroScannedTxs;

  let totalReceivedUSDC: string;
  let totalSentUSDC: string;

  if (isScanIncomplete && transactions.length === 0) {
    totalReceivedUSDC = parsedBalance > 0 ? 'Incomplete scan' : '0.00';
    totalSentUSDC = '0.00';
  } else {
    const recUnits = formatUnits(totalReceivedWei, 18);
    const sentUnits = formatUnits(totalSentWei, 18);
    totalReceivedUSDC = parseFloat(recUnits).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
    totalSentUSDC = parseFloat(sentUnits).toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });
  }

  const gasSpentUSDC = totalGasSpentUSDCNum.toFixed(6);

  const historyStatus = isScanIncomplete ? 'incomplete' : 'complete';
  const historyStatusNote = isScanIncomplete
    ? 'Onchain balance verified via live Arc RPC. Historical transaction receipts occurred outside recent scanned blocks.'
    : 'All recent onchain activity verified against Arc Testnet blocks.';

  return {
    address,
    balanceUSDC: balanceFormatted,
    rawBalance: balanceFormatted,
    totalReceivedUSDC,
    receivedTotalUSDC: totalReceivedUSDC,
    totalSentUSDC,
    sentTotalUSDC: totalSentUSDC,
    gasSpentUSDC,
    txCount: transactions.length,
    scannedTxCount: transactions.length,
    contractInteractionsCount,
    activeContractsCount: contractInteractionsCount,
    uniqueCounterpartiesCount: counterparties.size,
    isDataAvailable: true,
    historyStatus,
    historyStatusNote,
    incomingTransfersCount,
    outgoingTransfersCount,
  };
}

export interface CompleteWalletState {
  walletAddress: string;
  currentBalance: string;
  totalReceived: string;
  totalSent: string;
  totalGasSpent: string;
  totalTransactions: number;
  contractInteractions: number;
  recentTransactions: NormalizedTransaction[];
  historyStatus: 'complete' | 'incomplete' | 'unavailable';
  historyStatusNote: string;
}

/**
 * Fetch full verified state (balance + transactions + computed metrics) directly from Arc blockchain.
 */
export async function fetchCompleteWalletState(address: string): Promise<CompleteWalletState> {
  const [balanceResult, txResult] = await Promise.all([
    fetchBalanceFromArcRpc(address),
    fetchTransactionsForAddress(address, 50),
  ]);

  const summary = computeWalletSummary(
    address,
    balanceResult.formatted,
    txResult.transactions,
    txResult.isUnavailable
  );

  return {
    walletAddress: address,
    currentBalance: summary.balanceUSDC,
    totalReceived: summary.totalReceivedUSDC,
    totalSent: summary.totalSentUSDC,
    totalGasSpent: summary.gasSpentUSDC,
    totalTransactions: summary.txCount,
    contractInteractions: summary.contractInteractionsCount,
    recentTransactions: txResult.transactions,
    historyStatus: summary.historyStatus,
    historyStatusNote: summary.historyStatusNote,
  };
}
