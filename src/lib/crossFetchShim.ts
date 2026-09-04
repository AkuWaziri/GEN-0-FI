// Shim for cross-fetch in modern browser / Vite environment
// Prevents cross-fetch browser-ponyfill from attempting to write to Window.fetch when Window.fetch has only a getter.

const rawFetch = typeof window !== 'undefined' && typeof window.fetch === 'function'
  ? window.fetch.bind(window)
  : (typeof globalThis !== 'undefined' && typeof globalThis.fetch === 'function'
      ? globalThis.fetch.bind(globalThis)
      : undefined);

const safeFetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : (input instanceof Request ? input.url : String(input));
  if (url && (url.includes('cbhq.net') || url.includes('analytics-service'))) {
    if (typeof Response !== 'undefined') {
      return Promise.resolve(new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));
    }
  }
  if (rawFetch) {
    return rawFetch(input, init);
  }
  return Promise.resolve(new Response());
};

const nativeHeaders = typeof window !== 'undefined' && window.Headers
  ? window.Headers
  : (typeof globalThis !== 'undefined' && globalThis.Headers ? globalThis.Headers : undefined);

const nativeRequest = typeof window !== 'undefined' && window.Request
  ? window.Request
  : (typeof globalThis !== 'undefined' && globalThis.Request ? globalThis.Request : undefined);

const nativeResponse = typeof window !== 'undefined' && window.Response
  ? window.Response
  : (typeof globalThis !== 'undefined' && globalThis.Response ? globalThis.Response : undefined);

export const fetch = safeFetch as unknown as typeof globalThis.fetch;
export const Headers = nativeHeaders as unknown as typeof globalThis.Headers;
export const Request = nativeRequest as unknown as typeof globalThis.Request;
export const Response = nativeResponse as unknown as typeof globalThis.Response;

export default fetch;
