import { applyApiSecurity } from '../_security.js';
import { isAddress } from 'viem';
import { callGeminiWithFallback } from '../../src/services/ai/geminiService.js';
import { fetchCompleteWalletState } from '../../src/services/blockchain/arcService.js';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  const contentLength = Number(req.headers?.['content-length'] || 0);
  if (contentType && !contentType.includes('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) return res.status(413).json({ error: 'Request body too large' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const { address } = body;

    if (!address || !isAddress(address, { strict: false })) {
      return res.status(400).json({ error: 'Valid wallet address is required' });
    }

    // The browser payload is advisory only. Never trust client-side financial
    // figures for an AI answer. Re-read the authoritative Arc Mainnet state
    // on the server so stale UI state cannot contaminate the summary.
    const liveState = await fetchCompleteWalletState(address);

    const balance = liveState.currentBalance;
    const totalReceived = liveState.totalReceived;
    const totalSent = liveState.totalSent;
    const gasSpent = liveState.totalGasSpent;
    const txCount = liveState.totalTransactions;
    const contractCount = liveState.contractInteractions;
    const historyStatus = liveState.historyStatus;

    const unavailable =
      [balance, totalReceived, totalSent, gasSpent].some(value => value === 'Unavailable') ||
      historyStatus !== 'complete';

    const formatSignedFlow = (received: string, sent: string): string => {
      if (received === 'Unavailable' || sent === 'Unavailable') return 'Unavailable';
      try {
        const toRaw = (value: string) => {
          const cleaned = value.replace(/,/g, '');
          const [whole, fraction = ''] = cleaned.split('.');
          return BigInt(whole || '0') * 1000000n + BigInt((fraction + '000000').slice(0, 6));
        };
        const net = toRaw(received) - toRaw(sent);
        const sign = net < 0n ? '-' : '';
        const abs = net < 0n ? -net : net;
        return `${sign}${abs / 1000000n}.${(abs % 1000000n).toString().padStart(6, '0')}`;
      } catch {
        return 'Unavailable';
      }
    };

    const netFlow = formatSignedFlow(totalReceived, totalSent);
    const activityLevel = txCount > 20 ? 'active' : txCount > 0 ? 'moderate' : 'low';

    // Deterministic facts are the safety floor. If any lifetime metric is
    // unavailable, say so rather than converting missing data into zero.
    const deterministicResult = unavailable
      ? {
          summary: `Live Arc Mainnet data is partially unavailable for this wallet. No missing lifetime financial value has been inferred.`,
          keyObservations: [
            `Current verified balance: ${balance} USDC.`,
            historyStatus !== 'complete'
              ? 'Lifetime Arc transaction history is currently unavailable.'
              : 'One or more lifetime financial metrics are currently unavailable.'
          ],
          activityLevel,
          generatedAt: Date.now(),
          disclaimer: 'Generated from verified Arc Mainnet state. Missing data is not inferred.',
        }
      : {
          summary: `Wallet holds ${balance} USDC on Arc Mainnet with ${txCount} indexed transaction(s). Lifetime verified inflow is ${totalReceived} USDC and outflow is ${totalSent} USDC.`,
          keyObservations: [
            `Current verified balance: ${balance} USDC.`,
            `Net verified flow: ${netFlow} USDC.`,
            `Execution fees paid: ${gasSpent} USDC.`,
            `${contractCount} wallet-to-contract interaction(s) verified.`
          ],
          activityLevel,
          generatedAt: Date.now(),
          disclaimer: 'Generated from verified Arc Mainnet state. Missing data is not inferred.',
        };

    if (unavailable) {
      return res.status(200).json(deterministicResult);
    }

    // Gemini is allowed to explain the verified facts, not create them.
    // Every number in the response is validated against this allow-list.
    try {
      const prompt = `You are the explanation layer for GEN-0FI.
Use ONLY the verified Arc Mainnet facts below.
Do not calculate alternative totals.
Do not invent transactions, counterparties, profits, losses, prices, risks, causes, or intent.
Do not mention any number that is not already present in the facts.
Do not say the wallet is profitable or losing money because the dataset does not prove P&L.
Do not confuse contract interactions with transfers.
Return JSON only:
{"summary":"2 concise sentences","keyObservations":["2 concise factual observations"]}

Verified facts:
Balance: ${balance} USDC
Lifetime received: ${totalReceived} USDC
Lifetime sent: ${totalSent} USDC
Net flow (received - sent): ${netFlow} USDC
Gas spent: ${gasSpent} USDC
Indexed transactions: ${txCount}
Wallet-to-contract interactions: ${contractCount}
Network: Arc Mainnet, chain 5042

The summary must explain the wallet's onchain activity in plain English.
If the facts do not support an interpretation, leave it out.`;

      const { text } = await callGeminiWithFallback(prompt);
      const cleaned = text.trim();
      if (cleaned.startsWith('{') && cleaned.endsWith('}')) {
        const parsed = JSON.parse(cleaned);
        const summaryText = String(parsed.summary || '').replace(/\*/g, '').trim();
        const observations = Array.isArray(parsed.keyObservations)
          ? parsed.keyObservations.map((o: unknown) => String(o).replace(/\*/g, '').trim()).filter(Boolean).slice(0, 3)
          : [];

        const allowedNumbers = new Set(
          [balance, totalReceived, totalSent, netFlow, gasSpent, String(txCount), String(contractCount)]
            .flatMap(value => String(value).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/g) || [])
        );
        const outputNumbers = [...summaryText, ...observations.join(' ')]
          .join('')
          .replace(/,/g, '')
          .match(/-?\d+(?:\.\d+)?/g) || [];

        const numbersAreGrounded = outputNumbers.every(n => allowedNumbers.has(n));
        const hasUsableText = summaryText.length > 20 && observations.length >= 1;

        if (numbersAreGrounded && hasUsableText) {
          return res.status(200).json({
            summary: summaryText,
            keyObservations: observations,
            activityLevel,
            generatedAt: Date.now(),
            disclaimer: 'Generated from verified Arc Mainnet state. Financial figures are server-verified; AI only explains them.',
          });
        }
      }
    } catch {
      // Deterministic facts remain the fallback.
    }

    return res.status(200).json(deterministicResult);

  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to generate summary' });
  }
}
