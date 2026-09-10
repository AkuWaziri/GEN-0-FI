import { handleAiAskPayload, getGeminiApiKey } from '../../src/services/ai/geminiService';

export default async function handler(req: any, res: any) {
  // 1. Enforce CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');

  // Handle preflight OPTIONS
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Handle GET diagnostics
  if (req.method === 'GET') {
    const hasKey = Boolean(getGeminiApiKey());
    return res.status(200).json({
      status: 'ok',
      service: 'Ask GEN-0 AI Assistant',
      hasGeminiApiKey: hasKey,
      engine: hasKey ? 'Gemini 3.8 Flash / 3.1 Flash-Lite' : 'Arc Deterministic Onchain Engine',
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
    const result = await handleAiAskPayload(body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Vercel Serverless /api/ai/ask] Error:', err);
    if (err?.message === 'Message is required') {
      return res.status(400).json({ error: 'Message is required' });
    }
    return res.status(200).json({
      answer: "I am temporarily unable to process this question. Your live Arc wallet data remains verified onchain. Please try asking again in a moment.",
      referencedTxHashes: [],
      model: 'fallback-safe',
    });
  }
}
