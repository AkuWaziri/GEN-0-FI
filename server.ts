import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { createPublicClient, formatUnits, http, isAddress } from 'viem';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';
import { arcTestnetChain, ARC_NETWORK_CONFIG, ARC_TESTNET_RPC_URL } from './src/config/arc';
import { normalizeTransaction, RawTxInput } from './src/services/blockchain/normalizer';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

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

async function fetchTransactionsForAddress(address: string, limit = 50): Promise<FetchTransactionsResult> {
  const transactions: any[] = [];
  const normalizedAddress = address.toLowerCase();

  // 1. Try ArcScan Blockscout API v2 first (non-rate-limited, official JSON format)
  try {
    const v2Url = `https://testnet.arcscan.app/api/v2/addresses/${address}/transactions`;
    const scanRes = await fetch(v2Url, { signal: AbortSignal.timeout(6000) });
    if (scanRes.ok) {
      const scanData: any = await scanRes.json();
      if (scanData && Array.isArray(scanData.items)) {
        for (const tx of scanData.items.slice(0, limit)) {
          const rawTx: RawTxInput = {
            hash: tx.hash,
            blockNumber: BigInt(tx.block_number || '0'),
            from: tx.from?.hash || '',
            to: tx.to?.hash || tx.created_contract?.hash || null,
            value: BigInt(tx.value || '0'),
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
        return { transactions, isUnavailable: false };
      }
    }
  } catch (scanErr) {
    console.warn(`ArcScan v2 transactions lookup failed for ${address}:`, scanErr);
  }

  // 2. Fallback: ArcScan Blockscout API v1 module endpoint
  try {
    const v1Url = `https://testnet.arcscan.app/api?module=account&action=txlist&address=${address}&page=1&offset=${limit}&sort=desc`;
    const v1Res = await fetch(v1Url, { signal: AbortSignal.timeout(4000) });
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
        return { transactions, isUnavailable: false };
      }
    }
  } catch (v1Err) {
    console.warn(`ArcScan v1 txlist fallback error for ${address}:`, v1Err);
  }

  // 3. Fallback: Recent RPC block scanning
  try {
    const currentBlock = await arcClient.getBlockNumber();
    const scanDepth = 40n;
    const fromBlock = currentBlock > scanDepth ? currentBlock - scanDepth : 0n;

    for (let b = currentBlock; b >= fromBlock && transactions.length < limit; b--) {
      try {
        const block = await arcClient.getBlock({
          blockNumber: b,
          includeTransactions: true,
        });

        if (block && block.transactions) {
          for (const tx of block.transactions) {
            if (typeof tx === 'object') {
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
      } catch {
        continue;
      }
    }
    return { transactions, isUnavailable: false };
  } catch (rpcErr) {
    console.warn(`RPC block scan error for ${address}:`, rpcErr);
    return { transactions: [], isUnavailable: true };
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

// -------------------------------------------------------------
// 1. HEALTH & NETWORK STATUS
// -------------------------------------------------------------
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'GEN-0 FI Blockchain Intelligence API',
    network: 'Arc Testnet',
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
      error: 'Arc Testnet RPC connection error',
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
      network: 'Arc Testnet',
      isTestnet: true,
    });
  } catch (error: any) {
    console.error(`Error fetching balance for ${address}:`, error);
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
        historyStatusNote = 'Wallet is funded on Arc Testnet, but the inbound transfer occurred outside the scanned explorer dataset.';
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
      txCount: outgoingNonceNum, // Outgoing nonce from Arc RPC
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
// 4. AI WALLET SUMMARY (Powered by Gemini + In-Memory Caching)
// -------------------------------------------------------------
interface CachedAiSummary {
  data: any;
  timestamp: number;
}
const aiSummaryCache = new Map<string, CachedAiSummary>();

app.post('/api/ai/summary', async (req, res) => {
  const { address, summary, recentTransactions } = req.body;

  if (!address || !isAddress(address, { strict: false })) {
    return res.status(400).json({ error: 'Valid wallet address is required' });
  }

  const balance = summary?.balanceUSDC || '0.00';
  const totalReceived = summary?.totalReceivedUSDC || summary?.receivedTotalUSDC || '0.00';
  const totalSent = summary?.totalSentUSDC || summary?.sentTotalUSDC || '0.00';
  const gasSpent = summary?.gasSpentUSDC || '0.000000';
  const txCount = summary?.txCount ?? 0;
  const contractCount = summary?.contractInteractionsCount ?? summary?.activeContractsCount ?? 0;
  const historyStatus = summary?.historyStatus || (recentTransactions?.length === 0 && parseFloat(balance.replace(/,/g, '')) > 0 ? 'incomplete' : 'complete');
  const historyNote = summary?.historyStatusNote || '';

  // Check cache first (valid for 90 seconds per unique wallet state)
  const cacheKey = `${address.toLowerCase()}_${balance}_${txCount}_${historyStatus}`;
  const cached = aiSummaryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < 90_000) {
    return res.json(cached.data);
  }

  const ai = getGeminiClient();
  if (!ai) {
    // Fallback deterministic summary when Gemini API key is not configured
    let summaryText = '';
    if (historyStatus === 'incomplete') {
      summaryText = `Wallet verifiably holds ${balance} USDC on Arc Testnet with ${txCount} outgoing transaction(s). Inbound funding occurred outside the scanned explorer dataset, so historical received transfers cannot be fully determined.`;
    } else if (historyStatus === 'unavailable') {
      summaryText = `Wallet verifiably holds ${balance} USDC on Arc Testnet. Transaction history is temporarily unavailable from the explorer indexer.`;
    } else if (txCount === 0 && parseFloat(balance.replace(/,/g, '')) === 0) {
      summaryText = `Unfunded wallet on Arc Testnet with 0.00 USDC balance and no confirmed transactions.`;
    } else {
      summaryText = `Connected on Arc Testnet with ${balance} USDC balance across ${txCount} transaction(s). Verified transfers: ${totalReceived} USDC received and ${totalSent} USDC sent.`;
    }

    const observations = [
      `Authoritative live balance: ${balance} USDC (native gas token on Arc)`,
      `Lifetime outgoing transaction count (nonce): ${txCount}`,
    ];

    if (historyStatus === 'incomplete') {
      observations.push(`Transaction scan is incomplete: inbound funding transfer was received outside the recent scanned blocks.`);
    } else if (totalReceived !== '0.00' && totalReceived !== 'Incomplete scan' && totalReceived !== 'Unavailable') {
      observations.push(`Verified incoming native USDC transfers: ${totalReceived} USDC`);
    }

    if (parseFloat(gasSpent) > 0) {
      observations.push(`Total execution gas fees paid on Arc: ${gasSpent} USDC`);
    }
    if (contractCount > 0) {
      observations.push(`Smart contract interactions: ${contractCount}`);
    }

    const fallbackResult = {
      summary: summaryText,
      keyObservations: observations,
      activityLevel: txCount > 10 ? 'active' : txCount > 0 ? 'moderate' : 'low',
      generatedAt: Date.now(),
      disclaimer: 'Generated from real Arc Testnet onchain state.',
    };
    aiSummaryCache.set(cacheKey, { data: fallbackResult, timestamp: Date.now() });
    return res.json(fallbackResult);
  }

  try {
    const prompt = `You are the GEN-0 FI onchain financial intelligence engine.
Analyze the following verified onchain data for wallet ${address} on Arc Testnet.
Arc Testnet uses native USDC with 18 decimals for gas accounting and native transfers.

VERIFIED NORMALIZED BLOCKCHAIN DATA:
- Address: ${address}
- Current Wallet Balance: ${balance} USDC (Authoritative live RPC balance)
- Lifetime Outgoing Transaction Count (Nonce): ${txCount}
- Scanned Transactions In Dataset: ${recentTransactions?.length || 0}
- Total USDC Received (Actual Inbound Transfers): ${totalReceived} ${totalReceived === 'Incomplete scan' || totalReceived === 'Unavailable' ? '' : 'USDC'}
- Total USDC Sent (Actual Outbound Transfers): ${totalSent} ${totalSent === 'Incomplete scan' || totalSent === 'Unavailable' ? '' : 'USDC'}
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
   - If historyStatus is 'incomplete', explicitly state that while the wallet holds ${balance} USDC, historical inbound funding occurred outside the scanned records, so lifetime received/sent volume cannot be fully determined.
   - If historyStatus is 'unavailable', explicitly state that transaction history is temporarily unavailable from the explorer indexer.
4. Output format: Exactly a 2-sentence executive summary and 2-3 precise bullet points highlighting verifiable facts.`;

    let parsed: any = null;
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: prompt,
        config: {
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
        },
      });

      parsed = JSON.parse(response.text?.trim() || '{}');
    } catch (modelErr: any) {
      const isRateLimit = modelErr?.status === 429 ||
        String(modelErr?.message || '').includes('429') ||
        String(modelErr?.message || '').includes('quota');
      if (isRateLimit) {
        console.info(`[AI Summary] Rate limit active; serving verified deterministic financial intelligence.`);
      } else {
        console.info(`[AI Summary] Model fallback engaged: ${modelErr?.message?.slice(0, 80) || 'Unavailable'}`);
      }
    }

    if (parsed && parsed.summary) {
      const aiResult = {
        summary: parsed.summary,
        keyObservations: parsed.keyObservations || [],
        activityLevel: parsed.activityLevel || 'low',
        generatedAt: Date.now(),
        disclaimer: 'Generated from real Arc Testnet onchain state.',
      };
      aiSummaryCache.set(cacheKey, { data: aiResult, timestamp: Date.now() });
      return res.json(aiResult);
    }

    // Deterministic factual fallback if upstream AI spike or quota limit occurs
    const short = `${address.slice(0, 6)}...${address.slice(-4)}`;
    let fallbackSummary = '';
    const observations: string[] = [];

    if (historyStatus === 'incomplete') {
      fallbackSummary = `Wallet ${short} verifiably holds ${balance} USDC on Arc Testnet across ${txCount} transaction(s). Historical inbound funding occurred outside the scanned explorer dataset, so lifetime received volume cannot be fully determined from recent logs.`;
      observations.push(`Current authoritative balance: ${balance} USDC on Arc Testnet.`);
      observations.push(`Confirmed outbound nonce: ${txCount} transaction(s).`);
      observations.push(`Inbound funding happened outside scanned blocks; current balance is authoritative.`);
    } else if (txCount === 0 && (balance === '0.00' || balance === '0')) {
      fallbackSummary = `Wallet ${short} holds 0.00 USDC with zero recorded transactions on Arc Testnet.`;
      observations.push(`Current verified balance: 0.00 USDC.`);
      observations.push(`No incoming or outgoing transfers on Arc Testnet.`);
    } else {
      fallbackSummary = `Wallet ${short} holds ${balance} USDC on Arc Testnet across ${txCount} confirmed transaction(s). Total verified incoming transfers: ${totalReceived} USDC; outgoing transfers: ${totalSent} USDC.`;
      observations.push(`Current verified balance: ${balance} USDC.`);
      observations.push(`Verified inbound: ${totalReceived} USDC | Outbound: ${totalSent} USDC.`);
      if (contractCount > 0) observations.push(`${contractCount} smart contract interaction(s) verified.`);
    }

    const fallbackResult = {
      summary: fallbackSummary,
      keyObservations: observations,
      activityLevel: txCount > 5 ? 'active' : txCount > 0 ? 'moderate' : 'low',
      generatedAt: Date.now(),
      disclaimer: 'Generated from real Arc Testnet onchain state.',
    };
    aiSummaryCache.set(cacheKey, { data: fallbackResult, timestamp: Date.now() });

    res.json(fallbackResult);
  } catch (err: any) {
    console.error('Error generating AI wallet summary:', err?.message || err);
    res.status(500).json({
      error: 'AI analysis generation failed',
      message: err?.message || 'Unexpected failure',
    });
  }
});

// -------------------------------------------------------------
// 5. ASK GEN-0 ASSISTANT (Conversational onchain intelligence)
// -------------------------------------------------------------
app.post('/api/ai/ask', async (req, res) => {
  const { address, message, history, walletSummary, recentTransactions } = req.body;

  if (!message || typeof message !== 'string') {
    return res.status(400).json({ error: 'Message is required' });
  }

  const balance = walletSummary?.balanceUSDC || '0.00';
  const totalReceived = walletSummary?.totalReceivedUSDC || walletSummary?.receivedTotalUSDC || '0.00';
  const totalSent = walletSummary?.totalSentUSDC || walletSummary?.sentTotalUSDC || '0.00';
  const gasSpent = walletSummary?.gasSpentUSDC || '0.000000';
  const txCount = walletSummary?.txCount ?? (recentTransactions?.length || 0);
  const contractCount = walletSummary?.contractInteractionsCount ?? walletSummary?.activeContractsCount ?? 0;
  const historyStatus = walletSummary?.historyStatus || (recentTransactions?.length === 0 && parseFloat(balance.replace(/,/g, '')) > 0 ? 'incomplete' : 'complete');

  const ai = getGeminiClient();
  if (!ai) {
    let fallbackText = `I am reading your real onchain data on Arc Testnet for ${address || 'your wallet'}. Current balance is ${balance} USDC with ${txCount} transaction(s).`;
    if (historyStatus === 'incomplete') {
      fallbackText += ` Note: Inbound funding occurred outside the scanned explorer dataset, so historical received amounts cannot be fully computed from recent logs alone.`;
    }
    return res.json({
      answer: fallbackText,
      referencedTxHashes: recentTransactions?.slice(0, 2).map((t: any) => t.hash) || [],
    });
  }

  try {
    const formattedHistory = Array.isArray(history)
      ? history.slice(-6).map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`).join('\n')
      : '';

    const systemPrompt = `You are GEN-0 FI, the onchain financial intelligence assistant.
You have direct read access to verified blockchain data for the connected wallet on Arc Testnet.
Arc Testnet uses native USDC (18 decimals) for transactions and gas.

VERIFIED NORMALIZED WALLET DATA:
- Target Wallet Address: ${address || 'Not connected'}
- Current Balance: ${balance} USDC (Verified onchain via Arc RPC)
- Lifetime Outgoing Nonce: ${txCount}
- Scanned Transactions: ${JSON.stringify((recentTransactions || []).slice(0, 15))}
- Total USDC Received (Actual Inbound Transfers): ${totalReceived}
- Total USDC Sent (Actual Outbound Transfers): ${totalSent}
- Total Gas Spent on Arc: ${gasSpent} USDC
- Smart Contract Interactions: ${contractCount}
- History Status: ${historyStatus}

SAFETY & ACCURACY MANDATES:
1. STRICT DATA ACCURACY: Use the exact same normalized numbers provided above. Never invent transactions, balances, or fake figures.
2. DISTINGUISH METRICS:
   - Current balance is what the wallet holds right now (${balance} USDC).
   - Total received is from actual verified incoming transfers (${totalReceived}).
   - Total sent is from actual verified outgoing transfers (${totalSent}).
   - Gas spent is fees paid by this address (${gasSpent} USDC).
   - Transaction count is ${txCount}.
3. INCOMPLETE HISTORY: Do NOT assume "0 transactions" means "0 USDC received". A wallet can be funded and hold native USDC even when the scanned dataset is incomplete. If historyStatus is 'incomplete', explain that inbound funding occurred outside the recent scanned blocks.
4. If referring to a specific transaction, cite its exact hash so the user can verify it on ArcScan.`;

    const fullPrompt = `${systemPrompt}\n\nCONVERSATION HISTORY:\n${formattedHistory}\n\nUSER QUESTION: ${message}`;

    let answer = '';
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: fullPrompt,
      });
      answer = response.text || '';
    } catch (askModelErr: any) {
      const isRateLimit = askModelErr?.status === 429 ||
        String(askModelErr?.message || '').includes('429') ||
        String(askModelErr?.message || '').includes('quota');
      if (isRateLimit) {
        console.info(`[AI Ask] Rate limit active; generating onchain answer for ${address}`);
      } else {
        console.info(`[AI Ask] Model fallback engaged: ${askModelErr?.message?.slice(0, 80) || 'Unavailable'}`);
      }
    }

    if (!answer) {
      if (historyStatus === 'incomplete') {
        answer = `Your wallet (${address}) currently holds **${balance} USDC** on Arc Testnet with ${txCount} outbound transaction(s). Note that inbound funding occurred outside the scanned explorer dataset, so lifetime received/sent volume cannot be fully determined from recent logs alone.`;
      } else {
        answer = `Your wallet (${address}) holds **${balance} USDC** on Arc Testnet across ${txCount} transaction(s). Total verified inbound transfers: ${totalReceived} USDC; outbound transfers: ${totalSent} USDC. Total gas spent on Arc: ${gasSpent} USDC.`;
      }
    }

    // Extract any mentioned tx hashes
    const txHashes = (recentTransactions || [])
      .filter((t: any) => answer.includes(t.hash) || answer.includes(t.hash.slice(0, 8)))
      .map((t: any) => t.hash);

    res.json({
      answer,
      referencedTxHashes: txHashes,
    });
  } catch (err: any) {
    console.error('Error answering question in Ask GEN-0:', err?.message || err);
    res.status(500).json({
      error: 'GEN-0 Assistant is temporarily unavailable. Your wallet data is still available.',
      message: err?.message || 'Server error',
    });
  }
});

// -------------------------------------------------------------
// 6. VITE MIDDLEWARE & SERVER STARTUP
// -------------------------------------------------------------
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
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

startServer();
