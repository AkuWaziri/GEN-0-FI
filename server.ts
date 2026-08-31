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
  if (!address || !isAddress(address)) {
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

  if (!address || !isAddress(address)) {
    return res.status(400).json({ error: 'Invalid EVM address parameter' });
  }

  try {
    const txCount = await arcClient.getTransactionCount({
      address: address as `0x${string}`,
    });

    // Query latest blocks to inspect onchain activity
    const currentBlock = await arcClient.getBlockNumber();
    const transactions: any[] = [];
    const normalizedAddress = address.toLowerCase();

    // Scan recent blocks for transaction occurrences
    // For Arc Testnet RPC, we check up to last 35 blocks or until limit reached
    const scanDepth = 35n;
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
                const norm = normalizeTransaction(rawTx, address);
                transactions.push(norm);
              }
            }
          }
        }
      } catch (blockErr) {
        // Continue block scanning even if one block lookup encounters network jitter
        continue;
      }
    }

    res.json({
      address,
      txCount: Number(txCount),
      scannedBlocksRange: {
        from: Number(fromBlock),
        to: Number(currentBlock),
      },
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
// 4. AI WALLET SUMMARY (Powered by Gemini)
// -------------------------------------------------------------
app.post('/api/ai/summary', async (req, res) => {
  const { address, summary, recentTransactions } = req.body;

  if (!address || !isAddress(address)) {
    return res.status(400).json({ error: 'Valid wallet address is required' });
  }

  const ai = getGeminiClient();
  if (!ai) {
    // Fallback deterministic summary when Gemini API key is not configured
    const txCount = recentTransactions?.length || summary?.txCount || 0;
    const balance = summary?.balanceUSDC || '0.00';
    return res.json({
      summary: txCount === 0
        ? `Wallet holds ${balance} USDC on Arc Testnet. No recent outgoing or incoming transactions detected in the scanned block range.`
        : `Connected on Arc Testnet with ${balance} USDC. Found ${txCount} transaction(s), with ${summary?.receivedTotalUSDC || '0.00'} USDC received and ${summary?.sentTotalUSDC || '0.00'} USDC sent.`,
      keyObservations: [
        `Native gas asset is USDC with 18 decimals on Arc Testnet`,
        `Current available balance: ${balance} USDC`,
        `Total lifetime transactions: ${summary?.txCount || txCount}`,
      ],
      activityLevel: txCount > 10 ? 'active' : txCount > 0 ? 'moderate' : 'new_wallet',
      generatedAt: Date.now(),
      disclaimer: 'Generated from real Arc Testnet blockchain data.',
    });
  }

  try {
    const prompt = `You are the GEN-0 FI onchain financial intelligence engine.
Analyze the following real onchain data for wallet ${address} on Arc Testnet.
Arc Testnet uses native USDC with 18 decimals for gas accounting.

WALLET DATA:
- Address: ${address}
- Real USDC Balance: ${summary?.balanceUSDC || '0.00'} USDC
- Lifetime Transactions: ${summary?.txCount || 0}
- Scanned Transactions: ${JSON.stringify(recentTransactions || [])}
- Total Received (Scanned): ${summary?.receivedTotalUSDC || '0.00'} USDC
- Total Sent (Scanned): ${summary?.sentTotalUSDC || '0.00'} USDC
- Gas Spent (Scanned): ${summary?.gasSpentUSDC || '0.00'} USDC

CRITICAL RULES:
1. Speak objectively, concisely, and with precision like a senior fintech intelligence dashboard.
2. NEVER invent transactions, balances, counterparties, or fake amounts.
3. If no activity is recorded, say clearly that the wallet is inactive or new.
4. Clearly designate assets as Arc Testnet USDC.
5. Provide a 2-sentence summary and 3 bullet key observations.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
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

    const parsed = JSON.parse(response.text?.trim() || '{}');
    res.json({
      summary: parsed.summary || 'Summary unavailable.',
      keyObservations: parsed.keyObservations || [],
      activityLevel: parsed.activityLevel || 'low',
      generatedAt: Date.now(),
      disclaimer: 'Generated from real Arc Testnet onchain state.',
    });
  } catch (err: any) {
    console.error('Error generating AI wallet summary:', err);
    res.status(500).json({
      error: 'AI analysis generation failed',
      message: err.message,
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

  const ai = getGeminiClient();
  if (!ai) {
    // Helpful grounded response when Gemini key is not configured
    return res.json({
      answer: `I am reading your real onchain data on Arc Testnet for ${address || 'your wallet'}. Current balance: ${walletSummary?.balanceUSDC || '0.00'} USDC with ${recentTransactions?.length || 0} recent transactions. To enable full generative analysis, ensure GEMINI_API_KEY is active.`,
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

VERIFIED WALLET DATA:
- Target Wallet Address: ${address || 'Not connected'}
- Current Balance: ${walletSummary?.balanceUSDC || '0.00'} USDC (Arc Testnet)
- Lifetime Tx Nonce: ${walletSummary?.txCount || 0}
- Scanned Transactions: ${JSON.stringify(recentTransactions || [])}
- Total Received in scan: ${walletSummary?.receivedTotalUSDC || '0.00'} USDC
- Total Sent in scan: ${walletSummary?.sentTotalUSDC || '0.00'} USDC
- Total Gas Spent in scan: ${walletSummary?.gasSpentUSDC || '0.00'} USDC

SAFETY & ACCURACY MANDATES:
1. ONLY answer based on the real verified data provided above.
2. If the user asks about an event not in the data, reply: "I can't determine that from the available onchain data."
3. Never fabricate USD fiat values; identify testnet assets clearly as Arc Testnet USDC.
4. Keep answers concise, direct, helpful, and professional (avoid crypto slang or marketing hype).
5. If referring to a specific transaction, cite its exact hash so the user can verify it on ArcScan.`;

    const fullPrompt = `${systemPrompt}\n\nCONVERSATION HISTORY:\n${formattedHistory}\n\nUSER QUESTION: ${message}`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: fullPrompt,
    });

    const answer = response.text || "I couldn't process this request with the available onchain data.";

    // Extract any mentioned tx hashes
    const txHashes = (recentTransactions || [])
      .filter((t: any) => answer.includes(t.hash) || answer.includes(t.hash.slice(0, 8)))
      .map((t: any) => t.hash);

    res.json({
      answer,
      referencedTxHashes: txHashes,
    });
  } catch (err: any) {
    console.error('Error answering question in Ask GEN-0:', err);
    res.status(500).json({
      error: 'GEN-0 Assistant is temporarily unavailable. Your wallet data is still available.',
      message: err.message,
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
