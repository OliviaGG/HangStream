/**
 * GOAT public data client.
 *
 * The server owns filtering, sorting and pagination. The browser requests only
 * the 20 rows it can display, instead of walking the full account roster.
 */
(function initGoatDataClient() {
  const CACHE_TTL_MS = 30_000;
  const cache = new Map();

  function pruneCache(now) {
    for (const [key, entry] of cache) {
      if (entry.expiresAt <= now) cache.delete(key);
    }
    while (cache.size > 50) cache.delete(cache.keys().next().value);
  }

  async function publicLeaderboard({
    page = 1,
    limit = 20,
    sort = 'elo',
    direction = 'desc',
    search = '',
    region = 'GLOBAL',
    signal
  } = {}) {
    const params = new URLSearchParams({
      compact: '1',
      page: String(page),
      limit: String(limit),
      sort,
      direction,
      region
    });
    if (search) params.set('q', search);

    const key = params.toString();
    const now = Date.now();
    pruneCache(now);
    const cached = cache.get(key);
    if (cached && cached.expiresAt > now) return cached.payload;

    const response = await fetch(`/api/goat?${key}`, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
      signal
    });
    if (!response.ok) throw new Error(`Leaderboard request failed (${response.status})`);

    const payload = await response.json();
    if (!payload.ok || !Array.isArray(payload.players) || !payload.pagination) {
      throw new Error(payload.error || 'Leaderboard response was incomplete');
    }
    cache.set(key, { payload, expiresAt: now + CACHE_TTL_MS });
    return payload;
  }

  window.__GOAT_API = {
    publicLeaderboard,
    clearCache() { cache.clear(); }
  };
})();
