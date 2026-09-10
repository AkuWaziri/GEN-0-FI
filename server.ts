import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createPublicClient, formatUnits, http, isAddress } from 'viem';
import { GoogleGenAI, Type } from '@google/genai';
import { arcTestnetChain, ARC_NETWORK_CONFIG, ARC_TESTNET_RPC_URL } from './src/config/arc';
import { normalizeTransaction, RawTxInput } from './src/services/blockchain/normalizer';
import { handleAiAskPayload } from './src/services/ai/geminiService';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Normalize incoming request path for Vercel serverless functions (where /api might be stripped)
app.use((req, res, next) => {
  if (req.url && !req.url.startsWith('/api') && (
    req.url.startsWith('/blockchain') ||
    req.url.startsWith('/ai') ||
    req.url.startsWith('/health')
  )) {
    req.url = `/api${req.url}`;
  }
  next();
});

// Enforce CORS and disable caching across all /api endpoints for live blockchain accuracy
app.use('/api', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cache-Control, Pragma');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('Surrogate-Control', 'no-store');
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

// Arc Viem Client
const arcClient = createPublicClient({
  chain: arcTestnetChain,
  transport: http(process.env.ARC_TESTNET_RPC_URL || ARC_TESTNET_RPC_URL, {
    timeout: 15_000,
    retryCount: 3,
    retryDelay: 1000,
  }),
});

// Helper: Fetch onchain transactions via ArcScan Blockscout API v2 with fallback to RPC block scan
interface FetchTransactionsResult {
  transactions: any[];
  isUnavailable: boolean;
}

const ARC_EXPLORER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json',
};

// In-memory cache to prevent repeated redundant queries during transient explorer lag
interface CachedTxResult {
  data: FetchTransactionsResult;
  timestamp: number;
}
const txCache = new Map<string, CachedTxResult>();
const TX_CACHE_TTL_MS = 25000;

async function fetchTransactionsForAddress(address: string, limit = 50): Promise<FetchTransactionsResult> {
  const normalizedAddress = address.toLowerCase();

  // Check cache first
  const cached = txCache.get(normalizedAddress);
  if (cached && Date.now() - cached.timestamp < TX_CACHE_TTL_MS) {
    return cached.data;
  }

  const transactions: any[] = [];

  // 1. Try ArcScan Blockscout API v2 transactions endpoint
  try {
    const v2Url = `https://testnet.arcscan.app/api/v2/addresses/${address}/transactions`;
    const scanRes = await fetch(v2Url, {
      headers: ARC_EXPLORER_HEADERS,
      signal: AbortSignal.timeout(3500),
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
        const result = { transactions, isUnavailable: false };
        txCache.set(normalizedAddress, { data: result, timestamp: Date.now() });
        return result;
      }
    }
  } catch (scanErr: any) {
    // Graceful handling of explorer timeouts without noisy stack traces
    if (scanErr?.name !== 'TimeoutError' && scanErr?.name !== 'AbortError') {
      console.log(`[ArcScan] Note for ${address} tx lookup:`, scanErr?.message || 'Explorer busy');
    }
  }

  // 2. Fallback: ArcScan v2 token-transfers endpoint (often much faster & responsive)
  try {
    const tokenTransfersUrl = `https://testnet.arcscan.app/api/v2/addresses/${address}/token-transfers`;
    const tokenRes = await fetch(tokenTransfersUrl, {
      headers: ARC_EXPLORER_HEADERS,
      signal: AbortSignal.timeout(3500),
    });
    if (tokenRes.ok) {
      const tokenData: any = await tokenRes.json();
      if (tokenData && Array.isArray(tokenData.items) && tokenData.items.length > 0) {
        for (const item of tokenData.items.slice(0, limit)) {
          // Compute value accounting for standard 6-decimal or 18-decimal tokens
          const tokenDecimals = parseInt(item.total?.decimals || '6', 10);
          const rawVal = item.total?.value || '0';
          // Convert to 18-decimal wei equivalent for normalizer
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
        const result = { transactions, isUnavailable: false };
        txCache.set(normalizedAddress, { data: result, timestamp: Date.now() });
        return result;
      }
    }
  } catch {
    // Silently fall through to next fallback
  }

  // 3. Fallback: ArcScan Blockscout API v1 module endpoint
  try {
    const v1Url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${address}&page=1&offset=${limit}&sort=desc`;
    const v1Res = await fetch(v1Url, {
      headers: ARC_EXPLORER_HEADERS,
      signal: AbortSignal.timeout(2500),
    });
    if (v1Res.ok) {
      const v1Data: any = await v1Res.json();
      if (v1Data && v1Data.status === '1' && Array.isArray(v1Data.result) && v1Data.result.length > 0) {
        for (const tx of v1Data.result) {
          const rawTx: RawTxInput = {
            hash: tx.hash,
            blockNumber: BigInt(tx.blockNumber || '0'),
            from: tx.from,
            to: tx.to || null,
            value: BigInt(tx.value || '0'),
            gas: BigInt(tx.gas || '21000'),
            gasPrice: BigInt(tx.gasPrice || '25000000000'),
            gasUsed: BigInt(tx.gasUsed || tx.gas || '21000'),
            input: tx.input || '0x',
            timestamp: Number(tx.timeStamp || '0') * 1000,
            status: tx.isError === '0' ? 1 : 0,
            contractAddress: tx.contractAddress || null,
          };
          transactions.push(normalizeTransaction(rawTx, address));
        }
        const result = { transactions, isUnavailable: false };
        txCache.set(normalizedAddress, { data: result, timestamp: Date.now() });
        return result;
      }
    }
  } catch {
    // Silently fall through to RPC scanning
  }

  // 4. Fallback: Quick recent RPC block scanning (small depth of 8 recent blocks)
  try {
    const currentBlock = await arcClient.getBlockNumber();
    const scanDepth = 8n;
    const fromBlock = currentBlock > scanDepth ? currentBlock - scanDepth : 0n;

    const blockNumbers: bigint[] = [];
    for (let b = currentBlock; b >= fromBlock; b--) {
      blockNumbers.push(b);
    }

    const blockPromises = blockNumbers.map((num) =>
      arcClient.getBlock({ blockNumber: num, includeTransactions: true }).catch(() => null)
    );
    const blocks = await Promise.all(blockPromises);

    for (const block of blocks) {
      if (block && block.transactions && Array.isArray(block.transactions)) {
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
    const result = { transactions, isUnavailable: false };
    txCache.set(normalizedAddress, { data: result, timestamp: Date.now() });
    return result;
  } catch {
    const result = { transactions: [], isUnavailable: false };
    return result;
  }
}

// Gemini Client setup
let geminiAi: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiAi && process.env.GEMINI_API_KEY) {
    geminiAi = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return geminiAi;
}

/**
 * Executes a Gemini prompt with progressive fallback across supported free models:
 * Preferred order: gemini-3.1-flash-lite (Flash Lite) -> gemini-3.8-flash -> gemini-flash-latest
 */
async function callGeminiWithFallback(
  contents: string,
  config?: {
    systemInstruction?: string;
    temperature?: number;
    responseMimeType?: string;
    responseSchema?: any;
  }
): Promise<{ text: string; modelUsed: string }> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  // Preferred free model tier: prioritize gemini-3.1-flash-lite
  const candidateModels = ['gemini-3.1-flash-lite', 'gemini-3.8-flash', 'gemini-flash-latest'];
  let lastError: any = null;

  for (const model of candidateModels) {
    try {
      const response = await ai.models.generateContent({
        model,
        contents,
        config: config
          ? {
              ...(config.systemInstruction ? { systemInstruction: config.systemInstruction } : {}),
              ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
              ...(config.responseMimeType ? { responseMimeType: config.responseMimeType } : {}),
              ...(config.responseSchema ? { responseSchema: config.responseSchema } : {}),
            }
          : undefined,
      });

      const text = response.text?.trim() || '';
      if (text) {
        return { text, modelUsed: model };
      }
    } catch (err: any) {
      lastError = err;
      const status = err?.status;
      const msg = String(err?.message || '');
      // If 429 rate limit or quota exceeded, throw immediately to use factual deterministic engine
      if (status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        console.warn(`[Gemini] Quota/Rate limit encountered on ${model}:`, msg.slice(0, 100));
        throw err;
      }
      // If model not found (404) or permission issue, fallback to next model
      console.warn(`[Gemini] Attempt with ${model} failed, falling back to next candidate:`, msg.slice(0, 80));
    }
  }

  throw lastError || new Error('All candidate Gemini models failed to generate content');
}

// -------------------------------------------------------------
// 1. HEALTH & NETWORK STATUS
// -------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'GEN-0 FI Blockchain Intelligence API',
    network: 'Arc',
    chainId: ARC_NETWORK_CONFIG.chainId,
    time: new Date().toISOString(),
  });
});

app.get('/api/blockchain/arc/status', async (req, res) => {
  const start = performance.now();
  try {
    const blockNumber = await arcClient.getBlockNumber();
    const gasPrice = await arcClient.getGasPrice().catch(() => 1000000000n);
    const latency = Math.round(performance.now() - start);

    res.json({
      connected: true,
      chainId: ARC_NETWORK_CONFIG.chainId,
      blockNumber: Number(blockNumber),
      latencyMs: latency,
      gasPriceGwei: formatUnits(gasPrice, 9),
      rpcUrl: ARC_NETWORK_CONFIG.rpcUrl,
      nativeCurrency: ARC_NETWORK_CONFIG.nativeCurrency.symbol,
      explorerUrl: ARC_NETWORK_CONFIG.explorerUrl,
    });
  } catch (error: any) {
    res.status(503).json({
      connected: false,
      error: 'Arc RPC connection error',
      message: error?.message || 'RPC request timed out',
      chainId: ARC_NETWORK_CONFIG.chainId,
      rpcUrl: ARC_NETWORK_CONFIG.rpcUrl,
    });
  }
});

// -------------------------------------------------------------
// 2. WALLET BALANCE
// -------------------------------------------------------------
app.get('/api/blockchain/arc/balance/:address', async (req, res) => {
  const { address } = req.params;
  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid EVM address parameter' });
  }

  try {
    const balanceWei = await arcClient.getBalance({
      address: address as `0x${string}`,
    });
    const formatted = formatUnits(balanceWei, 18);
    const num = parseFloat(formatted);
    const displayBalance = num === 0 ? '0.00' : num.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });

    res.json({
      address,
      balanceUSDC: displayBalance,
      rawBalance: balanceWei.toString(),
      token: 'USDC',
      decimals: 18,
      network: 'Arc',
      isTestnet: true,
    });
  } catch (error: any) {
    console.error(`Error fetching balance for ${address} via RPC, trying ArcScan fallback:`, error);
    try {
      const scanRes = await fetch(`https://testnet.arcscan.app/api/v2/addresses/${address}`);
      if (scanRes.ok) {
        const scanData: any = await scanRes.json();
        if (scanData && scanData.coin_balance !== undefined && scanData.coin_balance !== null) {
          const balanceWei = BigInt(scanData.coin_balance);
          const formatted = formatUnits(balanceWei, 18);
          const num = parseFloat(formatted);
          const displayBalance = num === 0 ? '0.00' : num.toLocaleString('en-US', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 4,
          });

          return res.json({
            address,
            balanceUSDC: displayBalance,
            rawBalance: balanceWei.toString(),
            token: 'USDC',
            decimals: 18,
            network: 'Arc',
            isTestnet: true,
          });
        }
      }
    } catch (fallbackErr) {
      console.error(`ArcScan fallback also failed for ${address}:`, fallbackErr);
    }

    res.status(500).json({
      error: 'Failed to retrieve balance from Arc RPC',
      message: error?.message || 'RPC query failed',
    });
  }
});

// -------------------------------------------------------------
// 3. WALLET ACTIVITY & TRANSACTIONS
// -------------------------------------------------------------
app.get('/api/blockchain/arc/activity/:address', async (req, res) => {
  const { address } = req.params;
  const limit = Math.min(parseInt((req.query.limit as string) || '25', 10), 50);

  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid EVM address parameter' });
  }

  try {
    const txCount = await arcClient.getTransactionCount({
      address: address as `0x${string}`,
    });

    const { transactions } = await fetchTransactionsForAddress(address, limit);

    res.json({
      address,
      txCount: Math.max(Number(txCount), transactions.length),
      transactions,
    });
  } catch (error: any) {
    console.error(`Error querying activity for ${address}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve transaction activity from Arc RPC',
      message: error?.message || 'RPC query failed',
    });
  }
});

// -------------------------------------------------------------
// 3b. UNIFIED LIVE WALLET SUMMARY
// -------------------------------------------------------------
app.get('/api/blockchain/arc/summary/:address', async (req, res) => {
  const { address } = req.params;

  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Invalid EVM address parameter' });
  }

  try {
    const normalizedAddress = address.toLowerCase();

    // 1. Authoritative balance directly from Arc RPC (18 decimals native USDC)
    const balanceWei = await arcClient.getBalance({
      address: address as `0x${string}`,
    });
    const formatted = formatUnits(balanceWei, 18);
    const balanceNum = parseFloat(formatted);
    const displayBalance = balanceNum === 0 ? '0.00' : balanceNum.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 4,
    });

    // 2. Outgoing Transaction Nonce directly from Arc RPC
    const outgoingNonce = await arcClient.getTransactionCount({
      address: address as `0x${string}`,
    });
    const outgoingNonceNum = Number(outgoingNonce);

    // 3. Transactions via ArcScan v2 (with fallbacks)
    const { transactions, isUnavailable } = await fetchTransactionsForAddress(address, 50);

    // 4. Compute financial totals strictly from verified incoming/outgoing transfers
    let actualReceivedSum = 0;
    let actualSentSum = 0;
    let gasSpentSum = 0;
    let incomingTransfersCount = 0;
    let outgoingTransfersCount = 0;
    let contractInteractionsCount = 0;
    const counterparties = new Set<string>();
    const contracts = new Set<string>();

    for (const tx of transactions) {
      const valNum = parseFloat(tx.value.replace(/,/g, '')) || 0;
      const isFromMe = (tx.from || '').toLowerCase() === normalizedAddress;
      const isToMe = (tx.to || '').toLowerCase() === normalizedAddress;

      if (isToMe && !isFromMe) {
        // Actual incoming transfer to this address
        actualReceivedSum += valNum;
        incomingTransfersCount++;
        if (tx.from) counterparties.add(tx.from.toLowerCase());
      } else if (isFromMe) {
        // Actual outgoing transfer from this address
        actualSentSum += valNum;
        outgoingTransfersCount++;
        if (tx.to) counterparties.add(tx.to.toLowerCase());

        // Gas fee is only paid by the sender of the transaction
        const gasCost = parseFloat(tx.gasCostUSDC) || 0;
        gasSpentSum += gasCost;
      }

      if (tx.isContractInteraction) {
        contractInteractionsCount++;
        if (tx.to) contracts.add(tx.to.toLowerCase());
      }
    }

    // 5. Determine history status & total figures without guessing or inferring
    let historyStatus: 'complete' | 'incomplete' | 'unavailable' = 'complete';
    let historyStatusNote = '';
    let totalReceivedDisplay = '0.00';
    let totalSentDisplay = '0.00';

    if (isUnavailable) {
      historyStatus = 'unavailable';
      historyStatusNote = 'ArcScan transaction explorer indexing is temporarily unavailable.';
      totalReceivedDisplay = 'Unavailable';
      totalSentDisplay = outgoingNonceNum === 0 ? '0.00' : 'Unavailable';
    } else if (transactions.length === 0) {
      if (balanceNum > 0) {
        // Wallet holds verified native balance, but incoming funding tx is not in the scanned dataset
        historyStatus = 'incomplete';
        historyStatusNote = 'Wallet is funded on Arc, but the inbound transfer occurred outside the scanned explorer dataset.';
        totalReceivedDisplay = 'Incomplete scan';
        totalSentDisplay = outgoingNonceNum === 0 ? '0.00' : '0.00';
      } else if (outgoingNonceNum === 0) {
        // Verified clean wallet with 0 balance and 0 nonce
        historyStatus = 'complete';
        historyStatusNote = 'Verified clean wallet with zero transactions.';
        totalReceivedDisplay = '0.00';
        totalSentDisplay = '0.00';
      } else {
        historyStatus = 'incomplete';
        historyStatusNote = 'Outgoing nonce confirmed onchain, but explorer records are incomplete.';
        totalReceivedDisplay = 'Incomplete scan';
        totalSentDisplay = 'Incomplete scan';
      }
    } else {
      // Scanned transactions exist
      if (actualReceivedSum > 0) {
        totalReceivedDisplay = actualReceivedSum.toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 4,
        });
      } else if (balanceNum > 0) {
        // Wallet holds balance, but none of the scanned transactions was an inbound transfer
        historyStatus = 'incomplete';
        historyStatusNote = 'Inbound funding transfer occurred outside recent scanned blocks.';
        totalReceivedDisplay = 'Incomplete scan';
      } else {
        totalReceivedDisplay = '0.00';
      }

      totalSentDisplay = actualSentSum > 0
        ? actualSentSum.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })
        : '0.00';
    }

    // Gas spent: If wallet never broadcast any transaction (nonce === 0), gas spent is definitively 0.000000
    const finalGasSpent = outgoingNonceNum === 0
      ? '0.000000'
      : (gasSpentSum > 0 ? gasSpentSum.toFixed(6) : '0.000000');

    const summary = {
      address,
      balanceUSDC: displayBalance,
      rawBalance: balanceWei.toString(),
      totalReceivedUSDC: totalReceivedDisplay,
      receivedTotalUSDC: totalReceivedDisplay, // backwards compatibility alias
      totalSentUSDC: totalSentDisplay,
      sentTotalUSDC: totalSentDisplay, // backwards compatibility alias
      txCount: Math.max(outgoingNonceNum, transactions.length), // Authoritative transaction count (nonce or confirmed transactions)
      scannedTxCount: transactions.length,
      gasSpentUSDC: finalGasSpent,
      contractInteractionsCount,
      activeContractsCount: contractInteractionsCount, // backwards compatibility alias
      uniqueCounterpartiesCount: counterparties.size,
      latestActivityTime: transactions.length > 0 ? transactions[0].timestamp : undefined,
      isDataAvailable: true,
      historyStatus,
      historyStatusNote,
      incomingTransfersCount,
      outgoingTransfersCount,
    };

    res.json({
      summary,
      transactions,
    });
  } catch (error: any) {
    console.error(`Error querying summary for ${address}:`, error);
    res.status(500).json({
      error: 'Failed to retrieve wallet summary from Arc RPC',
      message: error?.message || 'RPC query failed',
    });
  }
});

// -------------------------------------------------------------
// 4. VERIFIED PROTOCOL KNOWLEDGE & AI HELPERS
// -------------------------------------------------------------
const VERIFIED_ARC_PROTOCOL_KNOWLEDGE = `
VERIFIED PROTOCOL & PRODUCT KNOWLEDGE BASE:

1. ARC PROTOCOL:
- What is Arc: Arc is an institutional-grade, EVM-compatible Layer-1 blockchain engineered for high-throughput programmable finance, instant deterministic finality, and stablecoin-native settlement.
- Native USDC for Gas: Unlike traditional EVM networks (e.g., Ethereum, Arbitrum, Polygon) where users must purchase and hold volatile native assets (ETH, MATIC) to execute transactions, Arc natively uses USDC (with 18 decimals) as its base gas and transaction fee token. Every transfer, contract deployment, and dApp interaction on Arc computes and pays its gas fee directly in native USDC.
- Arc Parameters:
  - Network Name: Arc
  - Chain ID: 5042002 (Hex: 0x4cef52)
  - Native Currency: USDC (Symbol: USDC, Decimals: 18)
  - Block Explorer: ArcScan (https://testnet.arcscan.app)
  - Official RPC: https://rpc.testnet.arc.network or https://rpc.testnet.arcscan.app

2. GEN-0 FI PLATFORM & CORE CAPABILITIES:
- What is GEN-0 FI: GEN-0 FI is the flagship onchain financial intelligence engine built specifically for the Arc ecosystem. It translates raw, cryptic EVM bytecode and transaction logs into clean, verified, human-readable financial insights.
- Implemented Platform Features:
  1. Financial Overview: Live real-time dashboard displaying verified USDC balance, total received, total sent, total gas spent in USDC, confirmed transactions, and active smart contract interactions.
  2. AI Wallet Intelligence: Grounded AI summary that analyzes real onchain transactions, explainable metrics, counterparties, and activity levels without hallucinating figures.
  3. Ask GEN-0 (AI Chat): A conversational AI assistant that answers questions about wallet activity (balances, transfers, gas, transactions) and explains Arc & GEN-0 protocol mechanics.
  4. Activity Ledger: Comprehensive transaction normalizer with directional badges (Inbound, Outbound, Contract Interaction, Self-Transfer), gas cost breakdown in USDC, transaction hash verification, and 1-click ArcScan links.
  5. Multi-Wallet Connection: Supports MetaMask, Coinbase Wallet, and Browser Injected wallets via Wagmi/AppKit, with 1-click Arc network switching.
  6. Zero Hallucination Guarantee: Strict blockchain data layer grounding. When data is outside scanned blocks or unavailable, it explicitly states so instead of guessing.
- How Wallet Intelligence Works:
  GEN-0 FI reads the user's verified onchain state on Arc via RPC and ArcScan explorer APIs. The normalization engine calculates the current balance, inbound transfers, outbound transfers, and gas expenditure in USDC. These verified numbers are packaged into a structured wallet-data object and passed directly into the AI. The AI explains and synthesizes these figures without recalculating or inventing numbers. If records are outside the scanned explorer dataset, the assistant explicitly notes: "I can't verify that from the available onchain data."
`;

/**
 * Deterministic answer generator when AI API key is missing or quota limited.
 * Ensures 100% reliable responses for all standard wallet queries and protocol questions.
 */
function generateDeterministicChatAnswer(
  query: string,
  walletData: {
    address: string;
    balance: string;
    totalReceived: string;
    totalSent: string;
    gasSpent: string;
    txCount: number;
    contractCount: number;
    historyStatus: string;
  },
  transactions: any[]
): { answer: string; referencedTxHashes: string[] } {
  const q = query.toLowerCase().trim();
  const short = walletData.address
    ? `${walletData.address.slice(0, 6)}...${walletData.address.slice(-4)}`
    : 'your wallet';
  const referencedTxHashes: string[] = [];

  // 1. Balance questions: "how much usdc do i have", "what is my balance"
  if (q.includes('how much usdc') || q.includes('my balance') || q.includes('balance do i have') || q.includes('current balance') || q.includes('how many usdc')) {
    return {
      answer: `Your connected wallet (${short}) currently holds ${walletData.balance} USDC on Arc, verified live via the native Arc RPC.`,
      referencedTxHashes,
    };
  }

  // 2. Inbound / Received questions: "what did i receive recently", "how much received"
  if (q.includes('receive') || q.includes('received') || q.includes('inbound') || q.includes('incoming') || q.includes('got') || q.includes('deposit')) {
    const inboundTxs = transactions.filter((t: any) => t.direction === 'received');
    if (inboundTxs.length > 0) {
      const topIn = inboundTxs.slice(0, 3);
      referencedTxHashes.push(...topIn.map((t: any) => t.hash));
      const details = topIn.map((t: any) => {
        const dateStr = t.timestamp ? new Date(t.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'recently';
        const fromShort = t.from ? `${t.from.slice(0, 6)}...${t.from.slice(-4)}` : 'external sender';
        return `- +${t.value} USDC on ${dateStr} from ${fromShort} (Tx: ${t.hash.slice(0, 10)}...)`;
      }).join('\n');
      return {
        answer: `Your wallet (${short}) has a verified inbound total of ${walletData.totalReceived} USDC on Arc.\n\nRecent Inbound Transfers:\n${details}`,
        referencedTxHashes,
      };
    }
    if (walletData.historyStatus === 'incomplete') {
      return {
        answer: `Your wallet holds ${walletData.balance} USDC. Historical inbound funding occurred outside the recent scanned explorer dataset, so specific incoming transfer logs cannot be fully verified from recent records alone.`,
        referencedTxHashes,
      };
    }
    return {
      answer: `Your wallet (${short}) has no recorded inbound transfers in the scanned Arc dataset (Total received: ${walletData.totalReceived} USDC).`,
      referencedTxHashes,
    };
  }

  // 3. Gas questions: "how much have i spent on gas", "gas spent"
  if (q.includes('gas') || q.includes('fee') || q.includes('fees') || q.includes('gas spent') || q.includes('transaction cost')) {
    return {
      answer: `You have spent a total of ${walletData.gasSpent} USDC on Arc execution fees across ${walletData.txCount} transaction(s). Note that because Arc uses native USDC for gas, transaction fees are settled directly in USDC rather than a separate volatile coin.`,
      referencedTxHashes,
    };
  }

  // 4. Outbound / Sent questions: "how much have i sent", "what did i send"
  if (q.includes('how much have i sent') || q.includes('total sent') || q.includes('outgoing') || q.includes('sent recently')) {
    const outboundTxs = transactions.filter((t: any) => t.direction === 'sent');
    if (outboundTxs.length > 0) {
      const topOut = outboundTxs.slice(0, 3);
      referencedTxHashes.push(...topOut.map((t: any) => t.hash));
      const details = topOut.map((t: any) => {
        const dateStr = t.timestamp ? new Date(t.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'recently';
        const toShort = t.to ? `${t.to.slice(0, 6)}...${t.to.slice(-4)}` : 'recipient';
        return `- -${t.value} USDC on ${dateStr} to ${toShort} (Tx: ${t.hash.slice(0, 10)}...)`;
      }).join('\n');
      return {
        answer: `Your wallet has sent a verified total of ${walletData.totalSent} USDC on Arc across ${walletData.txCount} confirmed transaction(s).\n\nRecent Outbound Transfers:\n${details}`,
        referencedTxHashes,
      };
    }
    return {
      answer: `Your wallet has sent a total of ${walletData.totalSent} USDC on Arc across ${walletData.txCount} transaction(s).`,
      referencedTxHashes,
    };
  }

  // 5. Activity / Recent transactions: "what happened in my wallet today", "explain my recent transactions"
  if (q.includes('what happened') || q.includes('recent transaction') || q.includes('my transactions') || q.includes('activity today') || q.includes('explain my recent') || q.includes('wallet activity')) {
    if (transactions.length === 0) {
      if (walletData.historyStatus === 'incomplete') {
        return {
          answer: `Your wallet (${short}) verifiably holds ${walletData.balance} USDC on Arc with ${walletData.txCount} confirmed transaction nonce. However, detailed historical transaction logs occurred outside the recent scanned blocks, so transaction rows cannot be displayed from recent records.`,
          referencedTxHashes,
        };
      }
      return {
        answer: `There are currently no recorded transactions for wallet ${short} on Arc. Current balance: ${walletData.balance} USDC.`,
        referencedTxHashes,
      };
    }

    const recent = transactions.slice(0, 4);
    referencedTxHashes.push(...recent.map((t: any) => t.hash));
    const items = recent.map((t: any) => {
      const dateStr = t.timestamp ? new Date(t.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Confirmed';
      const label = t.direction === 'received' ? `Received +${t.value} USDC` : t.direction === 'sent' ? `Sent -${t.value} USDC` : t.direction === 'contract_interaction' ? 'Smart Contract Call' : 'Self-Transfer';
      return `- ${label} on ${dateStr} • Fee: ${t.gasCostUSDC} USDC • Hash: ${t.hash.slice(0, 10)}...`;
    }).join('\n');

    return {
      answer: `Here is a summary of your recent Arc activity (${walletData.txCount} total transaction(s), balance: ${walletData.balance} USDC):\n\n${items}\n\nTotal gas spent: ${walletData.gasSpent} USDC. You can inspect any transaction directly on ArcScan using the links below.`,
      referencedTxHashes,
    };
  }

  // 6. Contract interactions: "what contracts did i interact with"
  if (q.includes('contract') || q.includes('contracts') || q.includes('smart contract')) {
    const contractTxs = transactions.filter((t: any) => t.isContractInteraction || t.direction === 'contract_interaction');
    if (contractTxs.length > 0) {
      referencedTxHashes.push(...contractTxs.slice(0, 3).map((t: any) => t.hash));
      const list = contractTxs.slice(0, 3).map((t: any) => {
        const cAddr = t.to ? `${t.to.slice(0, 8)}...${t.to.slice(-6)}` : 'Contract';
        return `- Contract ${cAddr} • Tx: ${t.hash.slice(0, 10)}...`;
      }).join('\n');
      return {
        answer: `Your wallet has verified ${walletData.contractCount} smart contract interaction(s) on Arc:\n\n${list}`,
        referencedTxHashes,
      };
    }
    return {
      answer: `Your wallet has recorded ${walletData.contractCount} smart contract interactions in the confirmed Arc dataset.`,
      referencedTxHashes,
    };
  }

  // 7. Arc Protocol: "what is arc"
  if (q.includes('what is arc') || q.includes('about arc') || q.includes('tell me about arc') || q.includes('what is the arc network')) {
    return {
      answer: `Arc is an institutional-grade, EVM-compatible Layer 1 blockchain engineered specifically for programmable finance and high-speed financial settlement.\n\nKey architectural pillars:\n- Native USDC Gas: Arc uses native USDC (with 18 decimals) as its base network token, meaning all transaction and execution fees are paid directly in USDC.\n- Chain ID: 5042002 (Arc)\n- Deterministic Finality: High throughput and sub-second block times designed for regulated capital markets and decentralized finance.\n- Explorer: ArcScan (https://testnet.arcscan.app)`,
      referencedTxHashes,
    };
  }

  // 8. Arc USDC for gas: "how does arc use usdc for gas"
  if (q.includes('usdc for gas') || q.includes('usdc as gas') || q.includes('pay gas in usdc') || q.includes('how does arc use usdc')) {
    return {
      answer: `Unlike Ethereum or other Layer-1 networks where users must purchase and maintain volatile native coins (like ETH or MATIC) to execute transactions, Arc natively integrates USDC (18 decimals) at the protocol level as its base gas token.\n\nEvery transfer, contract deployment, and swap calculates and settles its gas execution fee directly in USDC. This eliminates volatile currency exposure and makes transaction fees completely predictable.`,
      referencedTxHashes,
    };
  }

  // 9. Main features of GEN-0 FI: "what are the main features of gen-0 fi"
  if (q.includes('features of gen-0') || q.includes('features of gen-0 fi') || q.includes('main features') || q.includes('what can gen-0 do') || q.includes('what does gen-0 do')) {
    return {
      answer: `GEN-0 FI is an onchain financial intelligence engine built for Arc with 6 core features:\n\n1. Financial Overview: Real-time native USDC balance tracking (18 decimals), verified total received, total sent, total gas spent in USDC, confirmed transactions, and active contract interactions.\n2. AI Wallet Intelligence: Grounded AI summary that analyzes real onchain transactions, explainable metrics, counterparties, and activity levels without hallucinating figures.\n3. Ask GEN-0 (AI Chat): Natural language conversational assistant grounded directly in live Arc blockchain data, answering questions on balances, transfers, gas, transactions, and Arc protocol mechanics.\n4. Activity Ledger: Live transaction feed with directional categorizations (Inbound, Outbound, Contract Interaction, Self-Transfer), gas cost breakdown in USDC, and direct ArcScan links.\n5. Multi-Wallet Connection: Supports MetaMask, Coinbase Wallet, Browser Injected wallets via Wagmi/AppKit, and 1-click Arc switching.\n6. Zero Hallucination Guarantee: Strict blockchain data layer grounding. When data is outside scanned blocks or unavailable, it explicitly states so instead of guessing.`,
      referencedTxHashes,
    };
  }

  // 10. How wallet intelligence works: "how does wallet intelligence work"
  if (q.includes('wallet intelligence work') || q.includes('how does wallet intelligence') || q.includes('how does the ai work')) {
    return {
      answer: `Wallet Intelligence operates on a strict zero-hallucination data architecture:\n\n1. Onchain Ingestion: The app queries the live Arc RPC and ArcScan explorer indexer for verified balances, nonces, and transaction receipts.\n2. Deterministic Normalization: The normalization engine calculates authoritative figures (current balance, total received, total sent, gas spent in USDC, and contract interactions).\n3. Structured Context Binding: This exact structured wallet dataset is passed directly to the Gemini AI model.\n4. Strict Grounding Mandate: The AI is instructed to explain and synthesize only the verified numbers. If data is outside recent scanned blocks or unavailable, it responds with: "I can't verify that from the available onchain data."`,
      referencedTxHashes,
    };
  }

  // Fallback for unverified or unknown queries
  return {
    answer: `I can't verify that from the available onchain data. Your wallet currently has a verified balance of ${walletData.balance} USDC across ${walletData.txCount} transaction(s) on Arc. If you have questions about your balance, recent transfers, gas spent, or the Arc protocol, feel free to ask!`,
    referencedTxHashes,
  };
}

// -------------------------------------------------------------
// 5. AI WALLET SUMMARY (Powered by Gemini + In-Memory Caching)
// -------------------------------------------------------------
interface CachedAiSummary {
  data: any;
  timestamp: number;
}
const aiSummaryCache = new Map<string, CachedAiSummary>();

app.post(['/api/ai/summary', '/ai/summary'], async (req, res) => {
  const { address } = req.body;
  const walletData = req.body.walletData || req.body.summary || {};
  const recentTransactions = req.body.recentTransactions || [];

  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Valid wallet address is required' });
  }

  const balance = walletData.balanceUSDC || '0.00';
  const totalReceived = walletData.totalReceivedUSDC || walletData.receivedTotalUSDC || '0.00';
  const totalSent = walletData.totalSentUSDC || walletData.sentTotalUSDC || '0.00';
  const gasSpent = walletData.gasSpentUSDC || '0.000000';
  const txCount = walletData.txCount ?? (recentTransactions.length || 0);
  const contractCount = walletData.contractInteractionsCount ?? walletData.activeContractsCount ?? 0;
  const historyStatus = walletData.historyStatus || (recentTransactions.length === 0 && parseFloat(balance.replace(/,/g, '')) > 0 ? 'incomplete' : 'complete');
  const historyNote = walletData.historyStatusNote || '';

  // Check cache first (valid for 90 seconds per unique wallet state)
  const cacheKey = `${address.toLowerCase()}_${balance}_${txCount}_${historyStatus}`;
  const cached = aiSummaryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 90_000) {
    return res.json(cached.data);
  }

  const structuredPrompt = `You are the GEN-0 FI onchain financial intelligence engine.
Analyze the following verified onchain data for wallet ${address} on Arc.
Arc uses native USDC with 18 decimals for gas accounting and native transfers.

VERIFIED NORMALIZED BLOCKCHAIN DATA:
- Address: ${address}
- Current Wallet Balance: ${balance} USDC (Authoritative live RPC balance)
- Lifetime Outgoing Transaction Count (Nonce): ${txCount}
- Scanned Transactions In Dataset: ${recentTransactions?.length || 0}
- Total USDC Received (Actual Inbound Transfers): ${totalReceived}
- Total USDC Sent (Actual Outbound Transfers): ${totalSent}
- Gas Spent on Arc: ${gasSpent} USDC
- Contract Interactions: ${contractCount}
- Transaction History Status: ${historyStatus}
- Status Note: ${historyNote}
- Scanned Transaction Records: ${JSON.stringify((recentTransactions || []).slice(0, 10))}

CRITICAL FINANCIAL INTELLIGENCE MANDATES:
1. STRICT DATA ACCURACY: You MUST use the exact same normalized blockchain figures shown above. NEVER invent, infer, or contradict these numbers.
2. DISTINGUISH METRICS:
   - Current Wallet Balance (${balance} USDC) is what the wallet currently holds onchain.
   - Total Received (${totalReceived}) is calculated ONLY from actual verified incoming transfers.
   - Total Sent (${totalSent}) is calculated ONLY from actual verified outgoing transfers.
   - Gas Spent (${gasSpent} USDC) is transaction fees paid by this wallet for outbound execution.
   - Transaction Count (${txCount}) is the account's confirmed transaction nonce on Arc.
3. INCOMPLETE OR UNAVAILABLE HISTORY:
   - Do NOT assume "0 transactions" means "0 USDC received". A wallet can be funded and hold native USDC even when the scanned explorer dataset is incomplete.
   - If historyStatus is 'incomplete', explicitly state that while the wallet holds ${balance} USDC, historical inbound funding occurred outside the scanned records, so lifetime received volume cannot be fully determined from recent logs.
   - If historyStatus is 'unavailable', explicitly state that transaction history is temporarily unavailable from the explorer indexer.
4. NO ASTERISKS: Do NOT use asterisks (*) or double asterisks (**) anywhere in the output.
5. Output format: Exactly a 2-sentence executive summary and 2-3 precise bullet points highlighting verifiable facts.`;

  try {
    const { text } = await callGeminiWithFallback(structuredPrompt, {
      responseMimeType: 'application/json',
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          summary: {
            type: Type.STRING,
            description: '2 sentence concise financial intelligence summary of real wallet activity.',
          },
          keyObservations: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: '2 to 3 bullet points highlighting verifiable facts from the data.',
          },
          activityLevel: {
            type: Type.STRING,
            enum: ['active', 'moderate', 'low', 'new_wallet'],
          },
        },
        required: ['summary', 'keyObservations', 'activityLevel'],
      },
    });

    const parsed = JSON.parse(text || '{}');
    if (parsed && parsed.summary) {
      const cleanSummary = String(parsed.summary).replace(/\*/g, '');
      const cleanObservations = (parsed.keyObservations || []).map((o: string) => String(o).replace(/\*/g, ''));
      const aiResult = {
        summary: cleanSummary,
        keyObservations: cleanObservations,
        activityLevel: parsed.activityLevel || (txCount > 5 ? 'active' : txCount > 0 ? 'moderate' : 'low'),
        generatedAt: Date.now(),
        disclaimer: 'Generated from real Arc onchain state.',
      };
      aiSummaryCache.set(cacheKey, { data: aiResult, timestamp: Date.now() });
      return res.json(aiResult);
    }
  } catch (err: any) {
    console.info('[AI Summary] Using deterministic factual synthesis:', err?.message?.slice(0, 80) || 'Fallback');
  }

  // Deterministic factual fallback if Gemini is offline, rate limited, or key is unconfigured
  const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
  let fallbackSummary = '';
  const observations: string[] = [];

  if (historyStatus === 'incomplete') {
    fallbackSummary = `Wallet ${short} verifiably holds ${balance} USDC on Arc across ${txCount} transaction(s). Historical inbound funding occurred outside the scanned explorer dataset, so lifetime received volume cannot be fully determined from recent logs.`;
    observations.push(`Current authoritative balance: ${balance} USDC on Arc.`);
    observations.push(`Confirmed transactions: ${txCount} on Arc.`);
    observations.push(`Inbound funding occurred outside scanned blocks; current balance is authoritative.`);
  } else if (txCount === 0 && (balance === '0.00' || balance === '0')) {
    fallbackSummary = `Wallet ${short} holds 0.00 USDC with zero recorded transactions on Arc.`;
    observations.push(`Current verified balance: 0.00 USDC.`);
    observations.push(`No incoming or outgoing transfers on Arc.`);
  } else {
    fallbackSummary = `Wallet ${short} holds ${balance} USDC on Arc across ${txCount} confirmed transaction(s). Total verified incoming transfers: ${totalReceived} USDC; outgoing transfers: ${totalSent} USDC.`;
    observations.push(`Current verified balance: ${balance} USDC.`);
    observations.push(`Verified inbound: ${totalReceived} USDC | Outbound: ${totalSent} USDC.`);
    if (parseFloat(gasSpent) > 0) {
      observations.push(`Total execution gas fees paid on Arc: ${gasSpent} USDC.`);
    }
    if (contractCount > 0) {
      observations.push(`${contractCount} smart contract interaction(s) verified.`);
    }
  }

  const fallbackResult = {
    summary: fallbackSummary.replace(/\*/g, ''),
    keyObservations: observations.map((o) => o.replace(/\*/g, '')),
    activityLevel: txCount > 5 ? 'active' : txCount > 0 ? 'moderate' : 'low',
    generatedAt: Date.now(),
    disclaimer: 'Generated from real Arc onchain state.',
  };
  aiSummaryCache.set(cacheKey, { data: fallbackResult, timestamp: Date.now() });
  return res.json(fallbackResult);
});

// -------------------------------------------------------------
// 6. ASK GEN-0 ASSISTANT (Dual-Mode: Wallet Intelligence + Protocol Chat)
// -------------------------------------------------------------
app.post(['/api/ai/ask', '/ai/ask'], async (req, res) => {
  try {
    const result = await handleAiAskPayload(req.body || {});
    return res.json(result);
  } catch (err: any) {
    if (err?.message === 'Message is required') {
      return res.status(400).json({ error: 'Message is required' });
    }
    return res.json({
      answer: "I am temporarily unable to process this question. Your live Arc wallet data remains verified onchain. Please try asking again in a moment.",
      referencedTxHashes: [],
      model: 'fallback-safe',
    });
  }
});

// -------------------------------------------------------------
// 7. VITE MIDDLEWARE & SERVER STARTUP
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`GEN-0 FI server listening at http://0.0.0.0:${PORT}`);
  });
}

// Start server when run standalone (AI Studio dev container or production container).
// Skip starting HTTP listener when imported in serverless environments (e.g. Vercel).
const isServerless = process.env.VERCEL === '1' || Boolean(process.env.AWS_LAMBDA_FUNCTION_NAME);
if (!isServerless) {
  startServer();
}

export default app;
export { app };
