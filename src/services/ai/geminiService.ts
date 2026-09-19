import { GoogleGenAI } from '@google/genai';
import { ARC_NETWORK_CONFIG } from '../../config/arc.js';
import { fetchCompleteWalletState, fetchWalletAssetSummary } from '../blockchain/arcService.js';

/**
 * Verified knowledge base on Arc protocol & GEN-0 FI platform.
 * Strictly used to ground Gemini AI responses and deterministic fallbacks.
 */
export const VERIFIED_ARC_PROTOCOL_KNOWLEDGE = `
VERIFIED PROTOCOL & PRODUCT KNOWLEDGE BASE:

1. ARC PROTOCOL:
- What is Arc: Arc is an institutional-grade, EVM-compatible Layer-1 blockchain engineered for high-throughput programmable finance, instant deterministic finality, and stablecoin-native settlement. Arc is officially LIVE on Mainnet.
- Native USDC for Gas: Unlike traditional EVM networks (e.g. Ethereum, Arbitrum, Polygon) where users must hold volatile native assets (ETH, MATIC) to execute transactions, Arc natively uses USDC (with 18 decimals) as its base gas and transaction fee token. Every transfer, contract deployment, and dApp interaction on Arc computes and pays its gas fee directly in native USDC.
- Arc Parameters:
  - Network Name: Arc (Mainnet)
  - Chain ID: 5042 (Hex: 0x13b2)
  - Native Currency: USDC (Symbol: USDC, Decimals: 18)
  - Block Explorer: Arc Explorer (https://explorer.arc.io). Arcscan is an independent Arc explorer and indexed-data provider.
  - Official RPC: https://rpc.mainnet.arc.io

2. GEN-0 FI PLATFORM & CORE CAPABILITIES:
- What is GEN-0 FI: An onchain financial intelligence engine built specifically for Arc. It transforms raw hexadecimal blocks, internal transactions, and gas logs into human-readable accounting and real-time portfolio intelligence.
- Core Capabilities:
  1. Financial Overview: Verified USDC balance, total inbound USDC, total outbound USDC, total gas fees paid in USDC, confirmed transaction count, and contract interaction count.
  2. AI Wallet Intelligence: Grounded AI summary that analyzes real onchain transactions, explainable metrics, counterparties, and activity levels without hallucinating figures.
  3. Ask GEN-0 (AI Chat): Natural language conversational assistant grounded directly in live Arc blockchain data, answering questions on balances, transfers, gas, transactions, and Arc protocol mechanics.
  4. Activity Ledger: Real-time ledger with directional categorizations (Inbound, Outbound, Contract Interaction, Self-Transfer), gas cost breakdown in USDC, and direct ArcScan links.
  5. Multi-Wallet Connection: Seamless integration with MetaMask, Coinbase Wallet, Browser Injected wallets via Wagmi/AppKit.
  6. Wallet Holdings: Ask GEN-0 can explain indexed coin, fungible-token, and NFT holdings for the connected wallet. Native Arc USDC is counted once as a coin holding when the live native balance is greater than zero.
  7. Data Integrity: Live wallet figures come from Arc Mainnet RPC and Arcscan indexed data. Never invent balances, transactions, tokens, NFTs, contract calls, dates, counterparties, prices, or protocol facts.
  8. Scope: Ask GEN-0 should answer broad English questions about Arc architecture, EVM behavior, consensus/finality, native USDC gas, network parameters, transactions, blocks, addresses, tokens, NFTs, smart contracts, RPC/explorer concepts, interoperability, payments, privacy, developer tooling, ecosystem projects, and GEN-0 FI product behavior.
  9. Official Arc Sources: For Arc protocol facts, documentation, developer implementation details, releases, ecosystem information, and current changes, prefer and search the official Arc sources:
     - Arc Docs: https://docs.arc.network/
     - Arc main site: https://www.arc.network/
     - Arc blog/community: https://community.arc.network/
     - Arc Docs index: https://docs.arc.network/llms.txt
  10. Source Freshness: Arc-related answers must use live web grounding when the question could depend on current documentation, recent announcements, deployed features, supported integrations, ecosystem status, network parameters, or other changing information. Prefer official Arc sources over third-party summaries.
  11. Source Attribution: When an answer materially relies on an official Arc document or blog, briefly identify the relevant source or include its official link when useful. Do not invent links or source titles.
  12. Zero Hallucination Guarantee: Strict blockchain data layer grounding. When data is outside scanned blocks or unavailable, it explicitly states: "I can't verify that from the available onchain data."
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
  'gemini-3.1-pro-preview',
  'gemini-3.8-flash',
  'gemini-3.1-flash-lite',
];

/**
 * Call Gemini with progressive model fallback and snappy execution timeout
 */
export async function callGeminiWithFallback(
  contents: string,
  config?: {
    systemInstruction?: string;
    temperature?: number;
    useGoogleSearch?: boolean;
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
              ...(config.useGoogleSearch ? { tools: [{ googleSearch: {} }] } : {}),
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
      answer: `Hello! I am GEN-0 FI, your onchain financial intelligence assistant for Arc Mainnet. I can answer questions about your connected wallet's live USDC balance, recent transfers, gas fees, and transactions, as well as explain the Arc protocol and its native USDC gas mechanics. How can I help you today?`,
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
      answer: `Your connected wallet (${short}) currently holds ${walletData.balance} USDC on Arc Mainnet, verified live via the native Arc RPC.`,
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
        answer: `Your wallet (${short}) has a verified inbound total of ${walletData.totalReceived} USDC on Arc Mainnet.\n\nRecent Inbound Transfers:\n${details}`,
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
      answer: `Arc is an institutional-grade, EVM-compatible Layer-1 blockchain engineered specifically for programmable finance and high-speed financial settlement. Arc is officially live on Mainnet.\n\nKey architectural pillars:\n- Native USDC Gas: Arc uses native USDC (with 18 decimals) as its base network token, meaning all transaction and execution fees are paid directly in USDC.\n- Network: Arc Mainnet (Chain ID: 5042)\n- Deterministic Finality: High throughput and sub-second block times designed for regulated capital markets and decentralized finance.\n- Explorer: ArcScan (https://arc.etherscan.io)\n- RPC: https://rpc.mainnet.arc.io`,
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
    answer: `I can't verify that from the available onchain data. Your wallet currently has a verified balance of ${walletData.balance} USDC across ${walletData.txCount} transaction(s) on Arc Mainnet. If you have questions about your balance, recent transfers, gas spent, or the Arc protocol, feel free to ask!`,
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

  // If a wallet address is present, the server is the sole source of truth.
  // Client-provided totals are never allowed to override live Arc Mainnet data.
  let balance = 'Unavailable';
  let totalReceived = 'Unavailable';
  let totalSent = 'Unavailable';
  let totalGasSpent = 'Unavailable';
  let txCount = 0;
  let contractCount = 0;
  let recentTransactions: any[] = [];
  let walletAssets: {
    tokenHoldings: number;
    coinHoldings: number;
    nftHoldings: number;
    fungibleHoldings: number;
    historyStatus: 'complete' | 'unavailable';
  } | null = null;
  let historyStatus = 'unavailable';

  if (address && address.startsWith('0x')) {
    try {
      const [liveOnchain, liveAssets] = await Promise.all([
        fetchCompleteWalletState(address),
        fetchWalletAssetSummary(address).catch((assetErr) => {
          console.warn('[Ask GEN-0] Wallet asset read failed:', assetErr);
          return null;
        }),
      ]);
      balance = liveOnchain.currentBalance;
      totalReceived = liveOnchain.totalReceived;
      totalSent = liveOnchain.totalSent;
      totalGasSpent = liveOnchain.totalGasSpent;
      txCount = liveOnchain.totalTransactions;
      contractCount = liveOnchain.contractInteractions;
      recentTransactions = liveOnchain.recentTransactions;
      walletAssets = liveAssets;
      historyStatus = liveOnchain.historyStatus;
    } catch (onchainErr) {
      console.warn('[Ask GEN-0] Authoritative Arc Mainnet read failed:', onchainErr);
    }
  }

  const normalizedWalletSnapshot = {
    address: address || '',
    balance,
    totalReceived,
    totalSent,
    gasSpent: totalGasSpent,
    txCount: Number(txCount) || 0,
    contractCount: Number(contractCount) || 0,
    coinHoldings: walletAssets?.coinHoldings ?? null,
    nftHoldings: walletAssets?.nftHoldings ?? null,
    fungibleHoldings: walletAssets?.fungibleHoldings ?? null,
    historyStatus,
  };

  // Exact-answer layer: simple questions are answered from fresh server-side Arc data.
  const exactQuestion = message.toLowerCase().trim();

  if (address) {
    const exactAnswers: Array<[RegExp, string]> = [
      [/^(what('s| is) )?my balance\??$/, balance === 'Unavailable' ? 'Unavailable' : balance + ' USDC'],
      [/^how much (usdc )?do i have\??$/, balance === 'Unavailable' ? 'Unavailable' : balance + ' USDC'],
      [/^current balance\??$/, balance === 'Unavailable' ? 'Unavailable' : balance + ' USDC'],
      [/^how much have i sent\??$/, totalSent === 'Unavailable' ? 'Unavailable' : totalSent + ' USDC'],
      [/^(what('s| is) )?my total sent\??$/, totalSent === 'Unavailable' ? 'Unavailable' : totalSent + ' USDC'],
      [/^how much have i received\??$/, totalReceived === 'Unavailable' ? 'Unavailable' : totalReceived + ' USDC'],
      [/^(what('s| is) )?my total received\??$/, totalReceived === 'Unavailable' ? 'Unavailable' : totalReceived + ' USDC'],
      [/^how much gas have i spent\??$/, totalGasSpent === 'Unavailable' ? 'Unavailable' : totalGasSpent + ' USDC'],
      [/^(what('s| is) )?my gas spent\??$/, totalGasSpent === 'Unavailable' ? 'Unavailable' : totalGasSpent + ' USDC'],
      [/^how many transactions (do i have|have i)\??$/, txCount + ' transactions'],
      [/^transaction count\??$/, txCount + ' transactions'],
      [/^how many coins (do i have|am i holding)\??$/, walletAssets?.coinHoldings == null ? 'Unavailable' : walletAssets.coinHoldings + ' coins'],
      [/^coin holdings\??$/, walletAssets?.coinHoldings == null ? 'Unavailable' : walletAssets.coinHoldings + ' coins'],
      [/^how many nfts (do i have|am i holding)\??$/, walletAssets?.nftHoldings == null ? 'Unavailable' : walletAssets.nftHoldings + ' NFTs'],
      [/^nft holdings\??$/, walletAssets?.nftHoldings == null ? 'Unavailable' : walletAssets.nftHoldings + ' NFTs'],
    ];

    for (const [pattern, answer] of exactAnswers) {
      if (pattern.test(exactQuestion)) {
        return { answer, referencedTxHashes: [], model: 'deterministic-exact' };
      }
    }

    const asksRecent =
      /^(show|what('s| is)|tell me|give me) (my )?(the )?(most )?(recent|latest|last) (transaction|tx)\??$/.test(exactQuestion) ||
      /^my (most )?(recent|latest|last) (transaction|tx)\??$/.test(exactQuestion);

    if (asksRecent) {
      const tx = recentTransactions[0];
      if (!tx) return { answer: 'No recent transaction is available in the verified Arc transaction history.', referencedTxHashes: [], model: 'deterministic-exact' };
      const direction = tx.direction === 'received' ? 'Received' : tx.direction === 'sent' ? 'Sent' : tx.direction === 'contract_interaction' ? 'Contract interaction' : 'Transaction';
      const amount = tx.value && tx.value !== '0' ? tx.value + ' USDC' : 'No transfer value';
      const date = tx.timestamp ? new Date(tx.timestamp).toISOString().replace('T', ' ').replace('.000Z', ' UTC') : 'Unavailable';
      return {
        answer: ['Latest transaction', direction + ' · ' + amount, 'Date: ' + date, 'Status: ' + (tx.status || 'unknown'), 'Gas: ' + (tx.gasCostUSDC || 'Unavailable') + ' USDC', 'Hash: ' + tx.hash].join('\n'),
        referencedTxHashes: [tx.hash],
        model: 'deterministic-exact',
      };
    }

    const asksHowGen0 =
      /how does gen-?0( fi)? work\??/.test(exactQuestion) ||
      /how does gen-?0( fi)? (get|read|understand) my wallet/.test(exactQuestion) ||
      /what is gen-?0( fi)? and how does it work/.test(exactQuestion);

    if (asksHowGen0) {
      return {
        answer: [
          'GEN-0FI connects your wallet to an onchain financial intelligence layer.',
          '',
          '1. Wallet connection: your wallet remains under your control. GEN-0FI does not receive your private key or seed phrase.',
          '2. Arc data: GEN-0FI reads live Arc Mainnet balance and indexed transaction/activity data.',
          '3. Normalization: raw blockchain data is converted into balance, received, sent, gas, transaction, contract, coin, and NFT metrics.',
          '4. Intelligence: Ask GEN-0 uses that verified context to answer questions about your wallet, Arc, and GEN-0FI.',
          '5. Explanation: when you ask why something happened, GEN-0 explains the verified transaction or metric without inventing missing data.',
        ].join('\n'),
        referencedTxHashes: [],
        model: 'deterministic-gen0',
      };
    }
  }

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
        'No wallet is currently connected. Please connect your Web3 wallet (MetaMask, Coinbase Wallet, or injected) or provide an Arc address so I can query your verified live balance and transaction activity on Arc Mainnet.',
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
    blockNumber: t.blockNumber,
    contractAddress: t.contractAddress || undefined,
    contractName: t.contractName || undefined,
    methodName: t.methodName || undefined,
  }));

  const systemInstruction = `You are GEN-0 FI, the official onchain financial intelligence assistant and Arc protocol expert.

You operate in two primary modes:

MODE 1: WALLET INTELLIGENCE
- Answer user questions regarding wallet activity, balances, holdings, incoming/outgoing funds, gas spending, counterparties, transactions, blocks, contract interactions, token/NFT holdings, and transaction dates.
- Use ONLY the provided verified normalized wallet data, holdings snapshot, transaction list, and verified protocol knowledge as sources of truth.
- You may explain what a transaction means, why a gas fee exists, what a contract interaction is, how a transfer affects the wallet, and how GEN-0 FI derives a metric. Separate verified facts from general protocol explanations.
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

MODE 2: GEN-0 AI (CHAT) & ARC PROTOCOL INTELLIGENCE
- Answer broad English questions about Arc, including its architecture, EVM compatibility, consensus/finality, native USDC gas, chain/network parameters, transaction lifecycle, blocks, accounts, addresses, tokens, NFTs, smart contracts, RPCs, explorers, payments, stablecoin settlement, interoperability, privacy, developer tooling, SDKs, ecosystem projects, integrations, grants/builders programs, and current Arc announcements.
- For Arc protocol questions, use Google Search grounding actively. Prefer official Arc documentation and official Arc sources first: docs.arc.network, arc.network, and community.arc.network.
- If the official Arc docs/blog contain the answer, base the response on them rather than guessing from general blockchain knowledge. For implementation questions, prefer the relevant current Arc documentation page.
- If the user asks for the latest Arc change, release, feature, integration, ecosystem project, or announcement, search the web before answering and use the current source date.
- When useful, tell the user which official Arc documentation/blog source supports the answer. Never fabricate a source, title, URL, version, contract address, feature, or deployment status.
- If sources disagree, explain the discrepancy and prefer the most authoritative and current official source. Do not silently merge conflicting facts.
- Do not claim features exist if they are not part of GEN-0 FI or Arc.
- Do not confuse general blockchain knowledge with facts about this specific wallet. For wallet-specific claims, rely on the live snapshot only.
- If the user asks a mixed question such as "what happened to my wallet and why does Arc work this way?", use the live wallet data for the personal portion and official Arc sources for the protocol portion.

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
- Indexed Coin Holdings: ${walletAssets?.coinHoldings ?? 'Unavailable'}
- Indexed NFT Holdings: ${walletAssets?.nftHoldings ?? 'Unavailable'}
- Indexed Fungible Token Holdings: ${walletAssets?.fungibleHoldings ?? 'Unavailable'}
- Recent Scanned Transactions (${formattedTxList.length} items):
${JSON.stringify(formattedTxList, null, 2)}

CONVERSATION HISTORY:
${formattedHistory}

USER QUESTION: "${message}"

Answer the user directly in clear English. For simple questions, answer simply. For technical questions, explain the mechanism step by step when useful. For Arc questions, use live Google Search grounding and prefer official Arc Docs/blog/site sources. If the question asks how to build something on Arc, search for the current official developer documentation and answer from it. If the question asks about a recent Arc announcement or ecosystem change, verify the current official source and date. When an official source materially supports the answer, name the source or provide its official link. For wallet questions, use the live data above and name the exact metric or transaction that supports the answer. Never fabricate missing data. If the user asks about something outside the supplied verified wallet data or available Arc sources, say that it cannot be verified rather than guessing. Remember: strictly no asterisks.`;

  try {
    const { text, modelUsed } = await callGeminiWithFallback(promptContent, {
      systemInstruction,
      temperature: 0.2,
      useGoogleSearch: true,
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
