import { isAddress } from 'viem';
import { callGeminiWithFallback } from '../../src/services/ai/geminiService';

export default async function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { address } = body;
    const walletData = body.walletData || body.summary || {};
    const recentTransactions = body.recentTransactions || [];

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

    // Deterministic baseline
    const fallbackSummary =
      txCount > 0
        ? `Wallet holds ${balance} USDC with ${txCount} confirmed transaction(s) and ${contractCount} contract interaction(s) on Arc. Testnet.`
        : `Wallet holds ${balance} USDC on Arc. Testnet with no recent transaction history.`;

    const observations = [
      `Current verified balance: ${balance} USDC.`,
      `Verified inbound: ${totalReceived} USDC | Outbound: ${totalSent} USDC.`,
    ];
    if (parseFloat(gasSpent) > 0) {
      observations.push(`Total execution gas fees paid on Arc: ${gasSpent} USDC.`);
    }
    if (contractCount > 0) {
      observations.push(`${contractCount} smart contract interaction(s) verified.`);
    }

    const deterministicResult = {
      summary: fallbackSummary.replace(/\*/g, ''),
      keyObservations: observations.map((o) => o.replace(/\*/g, '')),
      activityLevel: txCount > 5 ? 'active' : txCount > 0 ? 'moderate' : 'low',
      generatedAt: Date.now(),
      disclaimer: 'Generated from real Arc. Testnet onchain state.',
    };

    // Try Gemini if available
    try {
      const prompt = `Analyze this verified onchain wallet data on Arc. Testnet:
Address: ${address}
Balance: ${balance} USDC
Total Received: ${totalReceived} USDC
Total Sent: ${totalSent} USDC
Gas Spent: ${gasSpent} USDC
Transactions: ${txCount}
Contract Interactions: ${contractCount}
Provide a 2-sentence executive summary and 2 concise key observations strictly based on these figures. Strictly no asterisks. Return JSON: {"summary": "...", "keyObservations": ["..."], "activityLevel": "active"|"moderate"|"low"}`;

      const { text } = await callGeminiWithFallback(prompt);
      const cleaned = text.trim();
      if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        const parsed = JSON.parse(cleaned);
        if (parsed.summary) {
          return res.status(200).json({
            summary: String(parsed.summary).replace(/\*/g, ''),
            keyObservations: (parsed.keyObservations || []).map((o: string) => String(o).replace(/\*/g, '')),
            activityLevel: parsed.activityLevel || deterministicResult.activityLevel,
            generatedAt: Date.now(),
            disclaimer: 'Generated with Gemini AI and verified Arc. Testnet state.',
          });
        }
      }
    } catch {
      // Gracefully return deterministic result
    }

    return res.status(200).json(deterministicResult);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to generate summary' });
  }
}
