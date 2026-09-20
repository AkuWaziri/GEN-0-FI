import { applyApiSecurity } from '../../_security.js';

const LIFI_QUOTE_URL = 'https://li.quest/v1/quote';

export default async function handler(req: any, res: any) {
  if (!applyApiSecurity(req, res)) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const apiKey = process.env.LIFI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error: 'LI.FI API key is not configured',
    });
  }

  try {
    const query = new URLSearchParams();

    for (const [key, value] of Object.entries(req.query || {})) {
      if (Array.isArray(value)) {
        if (value[0] != null) query.set(key, String(value[0]));
      } else if (value != null) {
        query.set(key, String(value));
      }
    }

    const response = await fetch(`${LIFI_QUOTE_URL}?${query.toString()}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'x-lifi-api-key': apiKey,
      },
      cache: 'no-store',
    });

    const body = await response.text();
    let payload: unknown;

    try {
      payload = JSON.parse(body);
    } catch {
      payload = { message: body || 'LI.FI returned an empty response' };
    }

    return res.status(response.status).json(payload);
  } catch (error: any) {
    console.error('[LI.FI Quote API] Error:', error);
    return res.status(502).json({
      error: 'Failed to reach LI.FI',
      message: error instanceof Error ? error.message : 'Upstream request failed',
    });
  }
}
