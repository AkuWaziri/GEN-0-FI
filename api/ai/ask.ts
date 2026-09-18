import { applyApiSecurity } from '../_security.js';
import { handleAiAskPayload } from '../../src/services/ai/geminiService.js';

async function extractRequestBody(req: any): Promise<any> {
  // 1. If Web standard Request object (Edge or modern runtime)
  if (typeof req.json === 'function') {
    try {
      return await req.json();
    } catch {
      return {};
    }
  }

  // 2. If req.body is already an object
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    return req.body;
  }

  // 3. If req.body is a string
  if (typeof req.body === 'string' && req.body.length > 0) {
    try {
      return JSON.parse(req.body);
    } catch {
      return {};
    }
  }

  // 4. If req.body is a Buffer
  if (req.body && Buffer.isBuffer(req.body)) {
    try {
      return JSON.parse(req.body.toString('utf-8'));
    } catch {
      return {};
    }
  }

  // 5. If Node IncomingMessage stream
  if (typeof req.on === 'function') {
    return new Promise((resolve) => {
      let data = '';
      req.on('data', (chunk: any) => {
        data += chunk;
      });
      req.on('end', () => {
        if (!data) return resolve({});
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve({});
        }
      });
      req.on('error', () => resolve({}));
    });
  }

  return req.body || {};
}

export default async function handler(req: any, res: any) {
  // 1. Enforce CORS
  if (!applyApiSecurity(req, res)) return;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  const contentLength = Number(req.headers?.['content-length'] || 0);
  if (contentType && !contentType.includes('application/json')) return res.status(415).json({ error: 'Content-Type must be application/json' });
  if (Number.isFinite(contentLength) && contentLength > 64 * 1024) return res.status(413).json({ error: 'Request body too large' });

  try {
    const body = await extractRequestBody(req);
    const result = await handleAiAskPayload(body);
    return res.status(200).json(result);
  } catch (err: any) {
    console.error('[Vercel Serverless /api/ai/ask] Error:', err);
    if (err?.message === 'Message is required') {
      return res.status(400).json({ error: 'Message is required' });
    }
    return res.status(200).json({
      answer: 'GEN-0 AI is temporarily unavailable. Your wallet data is still available in Financial Overview.',
      referencedTxHashes: [],
      model: 'fallback-safe',
    });
  }
}
