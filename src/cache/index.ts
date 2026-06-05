const HOT_TICKERS = new Set([
  'NVDA', 'AAPL', 'MSFT', 'META', 'AMZN', 'GOOGL', 'TSLA',
]);

const KV_NORMAL_TTL = 86400;
const KV_HOT_TTL = 604800;

export function isHotTicker(ticker: string): boolean {
  return HOT_TICKERS.has(ticker.toUpperCase());
}

export function kvTtl(ticker: string): number {
  return isHotTicker(ticker) ? KV_HOT_TTL : KV_NORMAL_TTL;
}

export function cacheKey(ticker: string, type: string): string {
  return `v1:${type}:${ticker.toUpperCase()}`;
}

/**
 * Three-tier read-through: Cache API → KV → D1.
 * Cache API is bound to the request URL (edge cache, ~1h implicit).
 * KV uses explicit keys with variable TTL (24h normal / 7d hot).
 * Returns the response and populates upper cache tiers on miss.
 */
export async function getCachedResponse(
  request: Request,
  kv: KVNamespace,
  ticker: string,
  type: string,
  fetcher: () => Promise<Response>,
): Promise<Response> {
  const key = cacheKey(ticker, type);

  // 1. Cache API (edge cache, bound to request URL)
  const cache = caches.default;
  const cached = await cache.match(request);
  if (cached) return cached;

  // 2. KV (regional cache)
  const kvData = await kv.get(key, 'json');
  if (kvData) {
    const res = Response.json(kvData);
    // Populate Cache API in background (don't block response)
    void cache.put(request, res.clone());
    return res;
  }

  // 3. D1 (source of truth)
  const res = await fetcher();
  const data = await res.clone().json();
  const ttl = kvTtl(ticker);

  // Populate KV + Cache API in background
  void kv.put(key, JSON.stringify(data), { expirationTtl: ttl });
  void cache.put(request, Response.json(data));

  return res;
}

/**
 * Called by cron after D1 writes.
 * Only invalidates KV keys — Cache API auto-expires within ~1h.
 */
export async function invalidateCache(
  ticker: string,
  kv: KVNamespace,
): Promise<void> {
  const types = ['company', 'breakdown', 'financials'];
  await Promise.all(types.map((t) => kv.delete(cacheKey(ticker, t))));
}
