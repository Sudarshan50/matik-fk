/** Simple in-memory sliding window rate limiter (login brute-force protection). */
export function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 20,
} = {}) {
  const hits = new Map();

  function prune(now) {
    for (const [key, times] of hits) {
      const next = times.filter((t) => now - t < windowMs);
      if (next.length) hits.set(key, next);
      else hits.delete(key);
    }
  }

  return {
    check(key) {
      const now = Date.now();
      if (hits.size > 5000) prune(now);
      const times = (hits.get(key) || []).filter((t) => now - t < windowMs);
      if (times.length >= max) {
        hits.set(key, times);
        const retryAfterMs = windowMs - (now - times[0]);
        return { allowed: false, retryAfterMs };
      }
      times.push(now);
      hits.set(key, times);
      return { allowed: true, retryAfterMs: 0 };
    },
  };
}
