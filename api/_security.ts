import type { IncomingMessage } from 'node:http';
import { isAddress } from 'viem';

const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 30;
const buckets = new Map<string, { count: number; resetAt: number }>();

function getClientIp(req: IncomingMessage & { headers?: Record<string, any> }): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) return forwarded.split(',')[0].trim();
  return String(req.headers?.['x-real-ip'] || req.socket?.remoteAddress || 'unknown');
}

export function applyApiSecurity(req: any, res: any): boolean {
  // GEN-0FI browser traffic is same-origin. Do not grant wildcard cross-origin
  // access to endpoints that expose wallet data or consume AI resources.
  res.setHeader('Vary', 'Origin');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return false;
  }

  const ip = getClientIp(req);
  const now = Date.now();
  const bucket = buckets.get(ip);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= MAX_REQUESTS_PER_WINDOW) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    res.status(429).json({ error: 'Too many requests. Please try again shortly.' });
    return false;
  }
  bucket.count += 1;
  return true;
}

export function requireValidAddress(address: unknown): address is string {
  return typeof address === 'string' && isAddress(address, { strict: false });
}

export function requirePostJson(req: any, res: any): boolean {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return false;
  }
  const contentType = String(req.headers?.['content-type'] || '').toLowerCase();
  if (contentType && !contentType.includes('application/json')) {
    res.status(415).json({ error: 'Content-Type must be application/json' });
    return false;
  }
  const length = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(length) && length > 64 * 1024) {
    res.status(413).json({ error: 'Request body too large' });
    return false;
  }
  return true;
}
