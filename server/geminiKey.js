// Central Gemini API key resolution with a database override.
// Why: hosting env vars (e.g. on Vercel) can go stale and the commissioner
// shouldn't need dashboard access to fix Jack. A key stored in the app's own
// database (set via the admin-only /api/admin/config endpoint) wins over the
// environment. Cached for 5 minutes; never exposed to the frontend.

let cache = { value: null, source: 'none', at: 0 };
const TTL = 5 * 60 * 1000;

const envKey = () => {
  const key = process.env.GEMINI_API_KEY;
  return key && key !== 'your_api_key_here' ? key : null;
};

export function makeGeminiKeyResolver(store) {
  return async function getGeminiKey() {
    const now = Date.now();
    if (cache.at && now - cache.at < TTL) return cache;
    let dbKey = null;
    try {
      dbKey = typeof store.getConfig === 'function' ? await store.getConfig('GEMINI_API_KEY') : null;
    } catch { dbKey = null; }
    const env = envKey();
    cache = dbKey
      ? { value: dbKey, source: 'db', at: now }
      : env
        ? { value: env, source: 'env', at: now }
        : { value: null, source: 'none', at: now };
    return cache;
  };
}

export function invalidateGeminiKeyCache() {
  cache = { value: null, source: 'none', at: 0 };
}
