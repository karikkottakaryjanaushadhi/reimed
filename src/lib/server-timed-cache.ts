type CacheEntry<T> = {
  value: T;
  expiresAt: number;
  lastUsedAt: number;
};

const valueCache = new Map<string, CacheEntry<unknown>>();
const inflightCache = new Map<string, Promise<unknown>>();

const MAX_ENTRIES = 400;

function pruneExpired(now: number) {
  for (const [key, entry] of valueCache.entries()) {
    if (entry.expiresAt <= now) valueCache.delete(key);
  }
}

function pruneLruIfNeeded() {
  if (valueCache.size <= MAX_ENTRIES) return;
  const entries = [...valueCache.entries()].sort((a, b) => a[1].lastUsedAt - b[1].lastUsedAt);
  const removeCount = valueCache.size - MAX_ENTRIES;
  for (let i = 0; i < removeCount; i += 1) {
    const key = entries[i]?.[0];
    if (key) valueCache.delete(key);
  }
}

/**
 * Process-local timed cache for hot read paths (best effort only; no cross-instance guarantees).
 */
export async function withServerTimedCache<T>(
  namespace: string,
  keyParts: unknown,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const key = `${namespace}:${JSON.stringify(keyParts)}`;

  const cached = valueCache.get(key) as CacheEntry<T> | undefined;
  if (cached && cached.expiresAt > now) {
    cached.lastUsedAt = now;
    return cached.value;
  }

  const running = inflightCache.get(key) as Promise<T> | undefined;
  if (running) return running;

  const nextPromise = (async () => {
    const value = await loader();
    const at = Date.now();
    pruneExpired(at);
    valueCache.set(key, {
      value,
      expiresAt: at + Math.max(1000, ttlMs),
      lastUsedAt: at,
    });
    pruneLruIfNeeded();
    return value;
  })();

  inflightCache.set(key, nextPromise);
  try {
    return await nextPromise;
  } finally {
    inflightCache.delete(key);
  }
}
