/**
 * Client-side in-memory data cache with TTL and revalidate-on-focus.
 *
 * - Each tab gets its own cache (module-level Map), so no cross-tab issues.
 * - When the tab regains focus (visibilitychange), all cached data is
 *   invalidated and registered listeners are notified to refetch.
 * - In-flight request deduplication: if two components request the same
 *   URL simultaneously, only one network request fires.
 */

const cache = new Map();          // key → { data, timestamp }
const inflight = new Map();       // key → Promise (dedup in-flight requests)
const listeners = new Set();      // Set<() => void> — focus revalidation callbacks

const DEFAULT_TTL = 60_000;       // 60 seconds

/**
 * Get cached data for a URL if it exists and is still fresh.
 * @param {string} key - The cache key (usually the fetch URL)
 * @param {number} ttl - Time-to-live in ms
 * @returns {any|null} The cached data, or null if expired/missing
 */
export function getCached(key, ttl = DEFAULT_TTL) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > ttl) {
    cache.delete(key);
    return null;
  }
  return entry.data;
}

/**
 * Store data in the cache.
 * @param {string} key
 * @param {any} data
 */
export function setCache(key, data) {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Fetch with caching and in-flight deduplication.
 * @param {string} url
 * @param {object} options
 * @param {number} options.ttl - Cache TTL in ms (default 60s)
 * @returns {Promise<any>} Parsed JSON response
 */
export async function cachedFetch(url, { ttl = DEFAULT_TTL } = {}) {
  // 1. Return cached data if fresh
  const cached = getCached(url, ttl);
  if (cached !== null) return cached;

  // 2. Deduplicate in-flight requests
  if (inflight.has(url)) {
    return inflight.get(url);
  }

  // 3. Fire the request
  const promise = fetch(url)
    .then(async (res) => {
      const data = await res.json();
      setCache(url, data);
      inflight.delete(url);
      return data;
    })
    .catch((err) => {
      inflight.delete(url);
      throw err;
    });

  inflight.set(url, promise);
  return promise;
}

/**
 * Invalidate cache entries matching a prefix.
 * @param {string} [prefix] - URL prefix to match. If omitted, clears everything.
 */
export function invalidateCache(prefix) {
  if (!prefix) {
    cache.clear();
    return;
  }
  for (const key of cache.keys()) {
    if (key.startsWith(prefix)) {
      cache.delete(key);
    }
  }
}

/**
 * Register a callback to be invoked when the cache is invalidated
 * due to window focus. Returns an unsubscribe function.
 */
export function onFocusRevalidate(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

// ─── Revalidate on focus ────────────────────────────────────
// When the user switches back to this tab (e.g. from phone to laptop,
// or alt-tab), invalidate all cached data and notify listeners.

if (typeof window !== 'undefined') {
  let lastHidden = 0;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      lastHidden = Date.now();
    }

    if (document.visibilityState === 'visible') {
      // Only revalidate if the tab was hidden for at least 5 seconds.
      // This avoids unnecessary refetches from quick alt-tabs.
      const hiddenDuration = Date.now() - lastHidden;
      if (hiddenDuration > 5_000) {
        invalidateCache();
        listeners.forEach((cb) => {
          try { cb(); } catch (e) { console.error('Focus revalidation error:', e); }
        });
      }
    }
  });
}
