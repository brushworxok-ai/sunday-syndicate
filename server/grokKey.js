// Jack uses a dedicated xAI key. It can be set by the commissioner in the
// app, stays on the server, and is never included in a league response.
let cache = { value: null, source: 'none', at: 0 };
const TTL = 5 * 60 * 1000;

const envKey = () => {
  const key = process.env.XAI_API_KEY;
  return key && key !== 'your_api_key_here' ? key : null;
};

export function makeGrokKeyResolver(store) {
  return async function getGrokKey() {
    const now = Date.now();
    if (cache.at && now - cache.at < TTL) return cache;
    let dbKey = null;
    try { dbKey = typeof store.getConfig === 'function' ? await store.getConfig('XAI_API_KEY') : null; } catch { dbKey = null; }
    const env = envKey();
    cache = dbKey
      ? { value: dbKey, source: 'db', at: now }
      : env
        ? { value: env, source: 'env', at: now }
        : { value: null, source: 'none', at: now };
    return cache;
  };
}

export function invalidateGrokKeyCache() {
  cache = { value: null, source: 'none', at: 0 };
}
