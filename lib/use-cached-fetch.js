'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { cachedFetch, invalidateCache, onFocusRevalidate } from './data-cache';

/**
 * React hook for fetching data with caching, dedup, and revalidate-on-focus.
 *
 * @param {string|null} url - The URL to fetch. Pass null to skip fetching.
 * @param {object} [options]
 * @param {number} [options.ttl=60000] - Cache TTL in milliseconds
 * @param {any} [options.fallback=[]] - Default value before data loads
 * @returns {{ data: any, loading: boolean, refresh: () => Promise<void> }}
 *
 * Usage:
 *   const { data: accounts, loading, refresh } = useCachedFetch(
 *     user ? `/api/accounts?userId=${user.id}` : null,
 *     { ttl: 60000, fallback: [] }
 *   );
 */
export function useCachedFetch(url, { ttl = 60_000, fallback = [] } = {}) {
  const [data, setData] = useState(fallback);
  const [loading, setLoading] = useState(!!url);
  const urlRef = useRef(url);
  urlRef.current = url;

  const doFetch = useCallback(async () => {
    const currentUrl = urlRef.current;
    if (!currentUrl) return;
    setLoading(true);
    try {
      const result = await cachedFetch(currentUrl, { ttl });
      // Only update if the URL hasn't changed while we were fetching
      if (urlRef.current === currentUrl) {
        setData(Array.isArray(result) ? result : (result ?? fallback));
        setLoading(false);
      }
    } catch (e) {
      console.error(`useCachedFetch error for ${currentUrl}:`, e);
      if (urlRef.current === currentUrl) {
        setLoading(false);
      }
    }
  }, [ttl]); // ttl is the only external dep; url is tracked via ref

  // Initial fetch when url changes
  useEffect(() => {
    if (!url) {
      setData(fallback);
      setLoading(false);
      return;
    }
    doFetch();
  }, [url, doFetch]);

  // Revalidate on focus — re-fetch when tab regains visibility
  useEffect(() => {
    if (!url) return;
    return onFocusRevalidate(() => {
      doFetch();
    });
  }, [url, doFetch]);

  // Refresh: invalidate this URL's cache and re-fetch
  const refresh = useCallback(async () => {
    if (!urlRef.current) return;
    invalidateCache(urlRef.current);
    await doFetch();
  }, [doFetch]);

  return { data, loading, refresh };
}
