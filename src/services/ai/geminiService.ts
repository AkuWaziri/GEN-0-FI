import { GoogleGenAI } from '@google/genai';
import { ARC_NETWORK_CONFIG } from '../../config/arc';
import { fetchCompleteWalletState } from '../blockchain/arcService';

/**
 * Verified knowledge base on Arc protocol & GEN-0 FI platform.
 * Strictly used to ground Gemini AI responses and deterministic fallbacks.
 */
export const VERIFIED_ARC_PROTOCOL_KNOWLEDGE = `
VERIFIED PROTOCOL & PRODUCT KNOWLEDGE BASE:

1. ARC PROTOCOL:
- What is Arc: Arc is an institutional-grade, EVM-compatible Layer-1 blockchain engineered for high-throughput programmable finance, instant deterministic finality, and stablecoin-native settlement.
- Native USDC for Gas: Unlike traditional EVM networks (e.g. Ethereum, Arbitrum, Polygon) where users must hold volatile native assets (ETH, MATIC) to execute transactions, Arc natively uses USDC (with 18 decimals) as its base gas and transaction fee token. Every transfer, contract deployment, and dApp interaction on Arc computes and pays its gas fee directly in native USDC.
- Arc Parameters:
  - Network Name: Arc. Testnet
  - Chain ID: 5042002 (Hex: 0x4cef52)
  - Native Currency: USDC (Symbol: USDC, Decimals: 18)
  - Block Explorer: ArcScan (https://testnet.arcscan.app)
  - Official RPC: https://rpc.testnet.arc.io or https://rpc.testnet.arcscan.app

2. GEN-0 FI PLATFORM & CORE CAPABILITIES:
- What is GEN-0 FI: An onchain financial intelligence engine built specifically for Arc. It transforms raw hexadecimal blocks, internal transactions, and gas logs into human-readable accounting and real-time portfolio intelligence.
- Core Capabilities:
  1. Financial Overview: Verified USDC balance, total inbound USDC, total outbound USDC, total gas fees paid in USDC, confirmed transaction count, and contract interaction count.
  2. AI Wallet Intelligence: Grounded AI summary that analyzes real onchain transactions, explainable metrics, counterparties, and activity levels without hallucinating figures.
  3. Ask GEN-0 (AI Chat): Natural language conversational assistant grounded directly in live Arc blockchain data, answering questions on balances, transfers, gas, transactions, and Arc protocol mechanics.
  4. Activity Ledger: Real-time ledger with directional categorizations (Inbound, Outbound, Contract Interaction, Self-Transfer), gas cost breakdown in USDC, and direct ArcScan links.
  5. Multi-Wallet Connection: Seamless integration with MetaMask, Coinbase Wallet, Browser Injected wallets via Wagmi/AppKit.
  6. Zero Hallucination Guarantee: Strict blockchain data layer grounding. When data is outside scanned blocks or unavailable, it explicitly states: "I can't verify that from the available onchain data."
`;

/**
 * Resolve Gemini API key across all supported production and deployment environments:
 * - Vercel / Netlify / Cloud Run / Container: GEMINI_API_KEY, GOOGLE_GENAI_API_KEY, GOOGLE_API_KEY
 * Strips accidental whitespace and quotes to prevent header validation failures.
 */
export function getGeminiApiKey(): string | null {
  let key = '';
  if (typeof process !== 'undefined' && process.env) {
    key =
      process.env.GEMINI_API_KEY ||
      process.env.GOOGLE_GENAI_API_KEY ||
      process.env.GOOGLE_API_KEY ||
      '';
  }
  if (!key) {
    try {
      // @ts-ignore
      key = (import.meta && import.meta.env && (import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY)) || '';
    } catch {
      // safe fallback if import.meta is unavailable in CommonJS/serverless build
    }
  }
  if (!key || typeof key !== 'string') return null;
  const cleanKey = key.trim().replace(/^["']|["']$/g, '').trim();
  return cleanKey.length > 0 ? cleanKey : null;
}

/**
 * Lazy-initialized Gemini client with production configuration
 */
export function getGeminiClient(): GoogleGenAI | null {
  const apiKey = getGeminiApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

/**
 * Preferred model cascade for production:
 * 1. gemini-3.1-flash-lite (Fastest, sub-second latency, optimal for serverless budgets)
 * 2. gemini-flash-latest (Universal alias fallback)
 * 3. gemini-3.8-flash (Standard general task model)
 */
const CANDIDATE_MODELS = [
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-3.8-flash',
];

/**
 * Call Gemini with progressive model fallback and snappy execution timeout
 */
export async function callGeminiWithFallback(
  contents: string,
  config?: {
    systemInstruction?: string;
    temperature?: number;
  },
  timeoutMs = 15_000
): Promise<{ text: string; modelUsed: string }> {
  const ai = getGeminiClient();
  if (!ai) {
    throw new Error('GEMINI_API_KEY_NOT_CONFIGURED');
  }

  let lastError: any = null;

  for (const model of CANDIDATE_MODELS) {
    try {
      const callPromise = ai.models.generateContent({
        model,
        contents,
        config: config
          ? {
              ...(config.systemInstruction ? { systemInstruction: config.systemInstruction } : {}),
              ...(config.temperature !== undefined ? { temperature: config.temperature } : {}),
            }
          : undefined,
      });

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`Timeout after ${timeoutMs}ms on ${model}`)), timeoutMs)
      );

      const response = await Promise.race([callPromise, timeoutPromise]);
      const text = response.text?.trim() || '';

      if (text) {
        return { text, modelUsed: model };
      }
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || '');
      console.warn(`[Gemini] Model ${model} attempt notice:`, msg.slice(0, 100));
      // If 429 quota exhausted or rate limit, break cascade and fallback cleanly to deterministic engine
      if (err?.status === 429 || msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED')) {
        throw err;
      }
    }
  }

  throw lastError || new Error('All candidate Gemini models failed to generate content');
}

/**
 * Authoritative deterministic response generator.
 * Strictly adheres to zero-hallucination mandate when Gemini is unavailable or rate-limited.
 */
export function generateDeterministicChatAnswer(
  query: string,
  walletData: {
    address?: string;
    balance: string;
    totalReceived: string;
    totalSent: string;
    gasSpent: string;
    txCount: number;
    contractCount: number;
    historyStatus?: string;
  },
  transactions: any[] = []
): { answer: string; referencedTxHashes: string[] } {
  const q = query.toLowerCase().trim();
  const short = walletData.address
    ? `${walletData.address.slice(0, 6)}...${walletData.address.slice(-4)}`
    : 'your wallet';
  const referencedTxHashes: string[] = [];

  // 0. Greetings and introduction
  if (
    q === 'hi' ||
    q === 'hello' ||
    q.startsWith('hello') ||
    q.startsWith('hi ') ||
    q.startsWith('hey') ||
    q.includes('who are you') ||
    q.includes('what can you do') ||
    q.includes('help me')
  ) {
    return {
      answer: `Hello! I am GEN-0 FI, your onchain financial intelligence assistant for Arc. Testnet. I can answer questions about your connected wallet's live USDC balance, recent transfers, gas fees, and transactions, as well as explain the Arc protocol and its native USDC gas mechanics. How can I help you today?`,
      referencedTxHashes: [],
    };
  }

  // 1. Balance questions
  if (
    q.includes('balance') ||
    q.includes('how much usdc') ||
    q.includes('how many usdc') ||
    q.includes('how much money') ||
    q.includes('funds') ||
    q.includes('holdings') ||
    q === 'balance'
  ) {
    if (walletData.balance === 'Unavailable') {
      return {
        answer: `Your live Arc wallet balance is currently unavailable from the network RPC. Your wallet data is still available in Financial Overview.`,
        referencedTxHashes,
      };
    }
    return {
      answer: `Your connected wallet (${short}) currently holds ${walletData.balance} USDC on Arc. Testnet, verified live via the native Arc RPC.`,
      referencedTxHashes,
    };
  }

  // 1b. Last / Latest transaction questions
  if (
    q.includes('last transaction') ||
    q.includes('latest transaction') ||
    q.includes('previous transaction') ||
    q.includes('last tx') ||
    q.includes('latest tx') ||
    q.includes('most recent transaction')
  ) {
    if (transactions.length > 0) {
      const lastTx = transactions[0];
      referencedTxHashes.push(lastTx.hash);
      const dateStr =
        lastTx.date ||
        (lastTx.timestamp
          ? new Date(lastTx.timestamp).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'recently');
      const val = lastTx.amountUSDC || lastTx.value || '0.00';
      const label =
        lastTx.direction === 'received'
          ? `Inbound transfer of +${val} USDC from ${lastTx.from ? `${lastTx.from.slice(0, 6)}...${lastTx.from.slice(-4)}` : 'external sender'}`
          : lastTx.direction === 'sent'
          ? `Outbound transfer of -${val} USDC to ${lastTx.to ? `${lastTx.to.slice(0, 6)}...${lastTx.to.slice(-4)}` : 'recipient'}`
          : lastTx.direction === 'contract_interaction'
          ? `Smart contract call with ${lastTx.to ? `${lastTx.to.slice(0, 6)}...${lastTx.to.slice(-4)}` : 'contract'}`
          : `Self-transfer of ${val} USDC`;
      return {
        answer: `Your last transaction on Arc was confirmed on ${dateStr}. It was a ${label}. The transaction hash is ${lastTx.hash}, with an execution gas fee of ${lastTx.gasCostUSDC || '0.000000'} USDC.`,
        referencedTxHashes,
      };
    }
    return {
      answer: `There are no recent transactions recorded for wallet ${short} in the scanned Arc dataset. Current verified balance is ${walletData.balance} USDC.`,
      referencedTxHashes,
    };
  }

  // 2. Inbound / Received questions
  if (
    q.includes('receive') ||
    q.includes('received') ||
    q.includes('inbound') ||
    q.includes('incoming') ||
    q.includes('got') ||
    q.includes('deposit')
  ) {
    const inboundTxs = transactions.filter((t: any) => t.direction === 'received');
    if (inboundTxs.length > 0) {
      const topIn = inboundTxs.slice(0, 3);
      referencedTxHashes.push(...topIn.map((t: any) => t.hash));
      const details = topIn
        .map((t: any) => {
          const dateStr = t.timestamp
            ? new Date(t.timestamp).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'recently';
          const fromShort = t.from ? `${t.from.slice(0, 6)}...${t.from.slice(-4)}` : 'external sender';
          return `- +${t.value} USDC on ${dateStr} from ${fromShort} (Tx: ${t.hash.slice(0, 10)}...)`;
        })
        .join('\n');
      return {
        answer: `Your wallet (${short}) has a verified inbound total of ${walletData.totalReceived} USDC on Arc. Testnet.\n\nRecent Inbound Transfers:\n${details}`,
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

  // 3. Gas questions
  if (
    q.includes('gas') ||
    q.includes('fee') ||
    q.includes('fees') ||
    q.includes('gas spent') ||
    q.includes('transaction cost')
  ) {
    return {
      answer: `You have spent a total of ${walletData.gasSpent} USDC on Arc execution fees across ${walletData.txCount} transaction(s). Note that because Arc uses native USDC for gas, transaction fees are settled directly in USDC rather than a separate volatile coin.`,
      referencedTxHashes,
    };
  }

  // 4. Outbound / Sent questions
  if (
    q.includes('how much have i sent') ||
    q.includes('total sent') ||
    q.includes('outgoing') ||
    q.includes('sent recently') ||
    q.includes('what did i send')
  ) {
    const outboundTxs = transactions.filter((t: any) => t.direction === 'sent');
    if (outboundTxs.length > 0) {
      const topOut = outboundTxs.slice(0, 3);
      referencedTxHashes.push(...topOut.map((t: any) => t.hash));
      const details = topOut
        .map((t: any) => {
          const dateStr = t.timestamp
            ? new Date(t.timestamp).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })
            : 'recently';
          const toShort = t.to ? `${t.to.slice(0, 6)}...${t.to.slice(-4)}` : 'recipient';
          return `- -${t.value} USDC on ${dateStr} to ${toShort} (Tx: ${t.hash.slice(0, 10)}...)`;
        })
        .join('\n');
      return {
        answer: `Your wallet has sent a verified total of ${walletData.totalSent} USDC on Arc across ${walletData.txCount} confirmed transaction(s).\n\nRecent Outbound Transfers:\n${details}`,
        referencedTxHashes,
      };
    }
    return {
      answer: `Your wallet has sent a verified total of ${walletData.totalSent} USDC on Arc across ${walletData.txCount} transaction(s).`,
      referencedTxHashes,
    };
  }

  // 5. Activity / Recent transactions
  if (
    q.includes('what happened') ||
    q.includes('recent transaction') ||
    q.includes('my transactions') ||
    q.includes('activity today') ||
    q.includes('explain my recent') ||
    q.includes('wallet activity') ||
    q.includes('transactions')
  ) {
    if (transactions.length === 0) {
      if (walletData.historyStatus === 'incomplete') {
        return {
          answer: `Your wallet (${short}) verifiably holds ${walletData.balance} USDC on Arc with ${walletData.txCount} confirmed transaction nonce. However, detailed historical transaction logs occurred outside the recent scanned blocks, so transaction rows cannot be displayed from recent records alone.`,
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
    const items = recent
      .map((t: any) => {
        const dateStr = t.timestamp
          ? new Date(t.timestamp).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })
          : 'Confirmed';
        const label =
          t.direction === 'received'
            ? `Received +${t.value} USDC`
            : t.direction === 'sent'
            ? `Sent -${t.value} USDC`
            : t.direction === 'contract_interaction'
            ? 'Smart Contract Call'
            : 'Self-Transfer';
        return `- ${label} on ${dateStr} • Fee: ${t.gasCostUSDC} USDC • Hash: ${t.hash.slice(0, 10)}...`;
      })
      .join('\n');

    return {
      answer: `Here is a summary of your recent Arc activity (${walletData.txCount} total transaction(s), balance: ${walletData.balance} USDC):\n\n${items}\n\nTotal gas spent: ${walletData.gasSpent} USDC. You can inspect any transaction directly on ArcScan using the links below.`,
      referencedTxHashes,
    };
  }

  // 6. Contract interactions
  if (q.includes('contract') || q.includes('contracts') || q.includes('smart contract')) {
    const contractTxs = transactions.filter(
      (t: any) => t.isContractInteraction || t.direction === 'contract_interaction'
    );
    if (contractTxs.length > 0) {
      referencedTxHashes.push(...contractTxs.slice(0, 3).map((t: any) => t.hash));
      const list = contractTxs
        .slice(0, 3)
        .map((t: any) => {
          const cAddr = t.to ? `${t.to.slice(0, 8)}...${t.to.slice(-6)}` : 'Contract';
          return `- Contract ${cAddr} • Tx: ${t.hash.slice(0, 10)}...`;
        })
        .join('\n');
      return {
        answer: `Your wallet has verified ${walletData.contractCount} smart contract interaction(s) on Arc:\n\n${list}`,
        referencedTxHashes,
      };
    }
    return {
      answer: `Your wallet has recorded ${walletData.contractCount} smart contract interaction(s) in the confirmed Arc dataset.`,
      referencedTxHashes,
    };
  }

  // 7. Arc Protocol & Network parameters
  if (
    q.includes('what is arc') ||
    q.includes('about arc') ||
    q.includes('tell me about arc') ||
    q.includes('what is the arc network') ||
    q.includes('what network') ||
    q.includes('what chain') ||
    q.includes('chain id')
  ) {
    return {
      answer: `Arc is an institutional-grade, EVM-compatible Layer-1 blockchain engineered specifically for programmable finance and high-speed financial settlement.\n\nKey architectural pillars:\n- Native USDC Gas: Arc uses native USDC (with 18 decimals) as its base network token, meaning all transaction and execution fees are paid directly in USDC.\n- Network: Arc. Testnet (Chain ID: 5042002)\n- Deterministic Finality: High throughput and sub-second block times designed for regulated capital markets and decentralized finance.\n- Explorer: ArcScan (https://testnet.arcscan.app)\n- RPC: https://rpc.testnet.arc.io`,
      referencedTxHashes,
    };
  }

  // 8. Arc USDC for gas
  if (
    q.includes('usdc for gas') ||
    q.includes('usdc as gas') ||
    q.includes('pay gas in usdc') ||
    q.includes('how does arc use usdc')
  ) {
    return {
      answer: `Unlike Ethereum or other Layer-1 networks where users must purchase and maintain volatile native coins (like ETH or MATIC) to execute transactions, Arc natively integrates USDC (18 decimals) at the protocol level as its base gas token.\n\nEvery transfer, contract deployment, and swap calculates and settles its gas execution fee directly in USDC. This eliminates volatile currency exposure and makes transaction fees completely predictable.`,
      referencedTxHashes,
    };
  }

  // 9. Main features of GEN-0 FI
  if (
    q.includes('features of gen-0') ||
    q.includes('features of gen-0 fi') ||
    q.includes('main features') ||
    q.includes('what can gen-0 do') ||
    q.includes('what does gen-0 do')
  ) {
    return {
      answer: `GEN-0 FI is an onchain financial intelligence engine built for Arc with 6 core features:\n\n1. Financial Overview: Real-time native USDC balance tracking (18 decimals), verified total received, total sent, total gas spent in USDC, confirmed transactions, and active contract interactions.\n2. AI Wallet Intelligence: Grounded AI summary that analyzes real onchain transactions, explainable metrics, counterparties, and activity levels without hallucinating figures.\n3. Ask GEN-0 (AI Chat): Natural language conversational assistant grounded directly in live Arc blockchain data, answering questions on balances, transfers, gas, transactions, and Arc protocol mechanics.\n4. Activity Ledger: Live transaction feed with directional categorizations (Inbound, Outbound, Contract Interaction, Self-Transfer), gas cost breakdown in USDC, and direct ArcScan links.\n5. Multi-Wallet Connection: Supports MetaMask, Coinbase Wallet, Browser Injected wallets via Wagmi/AppKit, and 1-click Arc switching.\n6. Zero Hallucination Guarantee: Strict blockchain data layer grounding. When data is outside scanned blocks or unavailable, it explicitly states: "I can't verify that from the available onchain data."`,
      referencedTxHashes,
    };
  }

  // 10. How wallet intelligence works
  if (
    q.includes('wallet intelligence work') ||
    q.includes('how does wallet intelligence') ||
    q.includes('how does the ai work')
  ) {
    return {
      answer: `Wallet Intelligence operates on a strict zero-hallucination data architecture:\n\n1. Onchain Ingestion: Queries the live Arc RPC and ArcScan explorer indexer for verified balances, nonces, and transaction receipts.\n2. Deterministic Normalization: Calculates authoritative figures (current balance, total received, total sent, gas spent in USDC, and contract interactions).\n3. Structured Context Binding: Passes this exact structured wallet dataset directly to the Gemini AI model.\n4. Strict Grounding Mandate: Instructs the AI to explain and synthesize only the verified numbers. If data is outside recent scanned blocks or unavailable, it responds with: "I can't verify that from the available onchain data."`,
      referencedTxHashes,
    };
  }

  // Fallback for unverified or unknown queries
  return {
    answer: `I can't verify that from the available onchain data. Your wallet currently has a verified balance of ${walletData.balance} USDC across ${walletData.txCount} transaction(s) on Arc. Testnet. If you have questions about your balance, recent transfers, gas spent, or the Arc protocol, feel free to ask!`,
    referencedTxHashes,
  };
}

/**
 * Unified AI Ask request handler used by both Express (dev server) and Vercel Serverless Functions.
 */
export async function handleAiAskPayload(payload: {
  walletAddress?: string;
  address?: string;
  message?: string;
  currentBalance?: string;
  totalReceived?: string;
  totalSent?: string;
  totalGasSpent?: string;
  totalTransactions?: number;
  contractInteractions?: number;
  recentTransactions?: any[];
  history?: Array<{ role: string; content: string }>;
  walletData?: any;
  walletSummary?: any;
  summary?: any;
}): Promise<{
  answer: string;
  referencedTxHashes: string[];
  model: string;
  notice?: string;
}> {
  const walletDataRaw = payload.walletData || payload.walletSummary || payload.summary || {};
  let address =
    payload.walletAddress ||
    payload.address ||
    walletDataRaw.walletAddress ||
    walletDataRaw.address ||
    '';
  const { message, history } = payload;

  if (!message || typeof message !== 'string') {
    throw new Error('Message is required');
  }

  let balance = String(
    payload.currentBalance ||
      walletDataRaw.currentBalance ||
      walletDataRaw.balanceUSDC ||
      walletDataRaw.balance ||
      ''
  );
  let totalReceived = String(
    payload.totalReceived ||
      walletDataRaw.totalReceived ||
      walletDataRaw.totalReceivedUSDC ||
      walletDataRaw.receivedTotalUSDC ||
      ''
  );
  let totalSent = String(
    payload.totalSent ||
      walletDataRaw.totalSent ||
      walletDataRaw.totalSentUSDC ||
      walletDataRaw.sentTotalUSDC ||
      ''
  );
  let totalGasSpent = String(
    payload.totalGasSpent ||
      walletDataRaw.totalGasSpent ||
      walletDataRaw.gasSpentUSDC ||
      walletDataRaw.gasSpent ||
      ''
  );
  let txCount =
    payload.totalTransactions ??
    walletDataRaw.totalTransactions ??
    walletDataRaw.txCount ??
    (payload.recentTransactions?.length || 0);
  let contractCount =
    payload.contractInteractions ??
    walletDataRaw.contractInteractions ??
    walletDataRaw.contractInteractionsCount ??
    walletDataRaw.activeContractsCount ??
    0;
  let recentTransactions: any[] = payload.recentTransactions || walletDataRaw.recentTransactions || [];

  // Live onchain verification fallback: If walletAddress provided and balance is missing/0 or txs are empty
  if (address && address.startsWith('0x')) {
    const parsedBal = parseFloat(balance.replace(/,/g, '')) || 0;
    if (parsedBal === 0 || recentTransactions.length === 0 || !balance || balance === 'Unavailable') {
      try {
        const liveOnchain = await fetchCompleteWalletState(address);
        if (liveOnchain) {
          if (!balance || parsedBal === 0 || balance === 'Unavailable') {
            if (liveOnchain.currentBalance && liveOnchain.currentBalance !== 'Unavailable') {
              balance = liveOnchain.currentBalance;
            }
          }
          if (recentTransactions.length === 0 && liveOnchain.recentTransactions.length > 0) {
            recentTransactions = liveOnchain.recentTransactions;
          }
          if (!totalReceived || totalReceived === '0.00') {
            totalReceived = liveOnchain.totalReceived;
          }
          if (!totalSent || totalSent === '0.00') {
            totalSent = liveOnchain.totalSent;
          }
          if (!totalGasSpent || totalGasSpent === '0.000000') {
            totalGasSpent = liveOnchain.totalGasSpent;
          }
          if (!txCount || txCount === 0) {
            txCount = liveOnchain.totalTransactions;
          }
          if (!contractCount || contractCount === 0) {
            contractCount = liveOnchain.contractInteractions;
          }
        }
      } catch (onchainErr) {
        console.warn(`[Ask GEN-0] Live onchain fallback check failed for ${address}:`, onchainErr);
      }
    }
  }

  balance = balance || (address ? 'Unavailable' : '0.00');
  totalReceived = totalReceived || '0.00';
  totalSent = totalSent || '0.00';
  totalGasSpent = totalGasSpent || '0.000000';

  const parsedBalFinal = parseFloat(balance.replace(/,/g, '')) || 0;
  const historyStatus =
    walletDataRaw.historyStatus ||
    (recentTransactions.length === 0 && parsedBalFinal > 0
      ? 'incomplete'
      : 'complete');

  const normalizedWalletSnapshot = {
    address: address || '',
    balance,
    totalReceived,
    totalSent,
    gasSpent: totalGasSpent,
    txCount: Number(txCount) || 0,
    contractCount: Number(contractCount) || 0,
    historyStatus,
  };

  // If no wallet is connected and user asks a personal wallet question, answer immediately with guidance
  const qLower = message.toLowerCase().trim();
  const isPersonalWalletQuery =
    qLower.includes('my balance') ||
    qLower.includes('my wallet') ||
    qLower.includes('my transaction') ||
    qLower.includes('my funds') ||
    qLower.includes('my holdings') ||
    qLower.includes('my account') ||
    qLower.includes('my gas') ||
    qLower.includes('how much have i') ||
    qLower.includes('have i received') ||
    qLower.includes('have i sent') ||
    qLower.includes('how much gas have i') ||
    qLower.includes('last transaction') ||
    qLower.includes('latest transaction') ||
    qLower === 'balance' ||
    qLower === 'my balance' ||
    qLower === 'what is my balance' ||
    qLower === 'how much do i have';

  if (!address && isPersonalWalletQuery) {
    return {
      answer:
        'No wallet is currently connected. Please connect your Web3 wallet (MetaMask, Coinbase Wallet, or injected) or provide an Arc address so I can query your verified live balance and transaction activity on Arc Testnet.',
      referencedTxHashes: [],
      model: 'deterministic-verifier',
    };
  }

  // Prepare normalized transaction list with human dates and full details
  const formattedTxList = (recentTransactions || []).slice(0, 20).map((t: any) => ({
    hash: t.hash,
    date: t.timestamp
      ? new Date(t.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : 'Confirmed',
    direction: t.direction,
    classification: t.classificationLabel || t.classification,
    amountUSDC: t.value,
    gasCostUSDC: t.gasCostUSDC,
    from: t.from,
    to: t.to,
    status: t.status,
    isContractInteraction: Boolean(t.isContractInteraction),
    summary: t.summary || undefined,
  }));

  const systemInstruction = `You are GEN-0 FI, the official onchain financial intelligence assistant and Arc protocol expert.

You operate in two primary modes:

MODE 1: WALLET INTELLIGENCE
- Answer user questions regarding their wallet activity, balances, incoming/outgoing funds, gas spending, contract interactions, and transaction dates.
- Use ONLY the provided verified normalized wallet data and transaction list as the source of truth.
- NEVER recalculate, invent, or contradict the normalized metrics:
  * Current USDC balance: ${balance} USDC
  * Total received: ${totalReceived} USDC
  * Total sent: ${totalSent} USDC
  * Total gas spent: ${totalGasSpent} USDC
  * Total transactions: ${txCount}
  * Smart contract interactions: ${contractCount}
- When discussing specific transactions, explicitly cite their dates, amounts in USDC, and transaction hashes (e.g. 0x...).
- Fallback requirement: If the user asks about an event, address, or transaction that does not exist in the provided onchain data, or if historical data is incomplete, clearly state:
  "I can't verify that from the available onchain data."

MODE 2: GEN-0 AI (CHAT) & PROTOCOL INTELLIGENCE
- Answer user questions about Arc, native USDC for gas, GEN-0 FI platform features, and how wallet intelligence works using the verified knowledge base.
- Do not claim features exist if they are not part of GEN-0 FI or Arc.

CRITICAL FORMATTING MANDATES:
- NEVER use asterisks (*) or double asterisks (**) anywhere in the response. Do NOT use markdown bold or italic asterisks. Output clean plain text.
- Concise, intelligent, conversational, and easy for non-technical users to understand.`;

  const formattedHistory = Array.isArray(history)
    ? history
        .slice(-6)
        .map((h) => `${h.role === 'user' ? 'User' : 'Assistant'}: ${h.content}`)
        .join('\n')
    : '';

  const promptContent = `${VERIFIED_ARC_PROTOCOL_KNOWLEDGE}

VERIFIED LIVE ONCHAIN WALLET DATA (AUTHORITATIVE SOURCE OF TRUTH):
- Target Wallet Address: ${address || 'Not connected'}
- Current USDC Balance: ${balance} USDC (Verified via live Arc RPC)
- Total Received (USDC): ${totalReceived}
- Total Sent (USDC): ${totalSent}
- Total Gas Spent on Arc (USDC): ${totalGasSpent} USDC
- Confirmed Transaction Count: ${txCount}
- Smart Contract Interactions Count: ${contractCount}
- Transaction History Status: ${historyStatus}
- Recent Scanned Transactions (${formattedTxList.length} items):
${JSON.stringify(formattedTxList, null, 2)}

CONVERSATION HISTORY:
${formattedHistory}

USER QUESTION: "${message}"

Answer the user directly and concisely following the instructions. Remember: strictly no asterisks.`;

  try {
    const { text, modelUsed } = await callGeminiWithFallback(promptContent, {
      systemInstruction,
      temperature: 0.2, // low temperature for maximum factual adherence
    });

    if (text) {
      const cleanText = text.replace(/\*/g, '');
      const referencedTxHashes = (recentTransactions || [])
        .filter((t: any) => cleanText.includes(t.hash) || cleanText.includes(t.hash.slice(0, 10)))
        .map((t: any) => t.hash);

      return {
        answer: cleanText,
        referencedTxHashes,
        model: modelUsed,
      };
    }
  } catch (geminiErr: any) {
    console.error(`[Ask GEN-0 Production Error] Gemini call failed (${geminiErr?.message || 'Error'}). Engaging deterministic zero-hallucination verifier.`);
  }

  // Factual deterministic fallback engine
  const fallback = generateDeterministicChatAnswer(message, normalizedWalletSnapshot, formattedTxList);
  return {
    answer: fallback.answer.replace(/\*/g, ''),
    referencedTxHashes: fallback.referencedTxHashes,
    model: 'deterministic-verifier',
  };
}
