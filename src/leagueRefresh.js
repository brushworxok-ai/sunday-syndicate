const SUPERSEDED = Symbol('superseded');

export function validLeagueSnapshot(value) {
  return value && typeof value === 'object' && typeof value.id === 'string' && Array.isArray(value.players) && Array.isArray(value.sheets)
    && value.results && typeof value.results === 'object' && !Array.isArray(value.results)
    && Array.isArray(value.chat);
}

// Bound the entire read, including a stalled response body. Writes never use this loader.
// `cache: 'no-cache'` (not 'no-store') matters: it makes the browser revalidate
// with If-None-Match, so an unchanged league comes back as a 304 with no body.
export function createLeagueLoader({ request, onSnapshot, onStatus, timeoutMs = 15000, now = Date.now }) {
  let version = 0;
  let cancel = () => {};
  let lastSuccessAt = null;
  const status = (loading, error = '') => onStatus({ loading, error, lastSuccessAt });
  return {
    async load() {
      const current = ++version;
      cancel();
      const controller = new AbortController();
      let timer;
      const cancelled = new Promise((resolve) => { cancel = () => { controller.abort(); resolve(SUPERSEDED); }; });
      status(true);
      try {
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            reject(new Error('League refresh timed out. Please retry.'));
            controller.abort();
          }, timeoutMs);
        });
        const value = await Promise.race([Promise.resolve().then(() => request({ signal: controller.signal, cache: 'no-cache' })), timeout, cancelled]);
        if (current !== version || value === SUPERSEDED) return null;
        if (!validLeagueSnapshot(value)) throw new Error('The server returned incomplete league data. Please retry.');
        onSnapshot(value);
        lastSuccessAt = now();
        status(false);
        return value;
      } catch (error) {
        if (current === version) status(false, error?.message || 'League refresh failed. Please retry.');
        return null;
      } finally {
        clearTimeout(timer);
        if (current === version) cancel = () => {};
      }
    },
    dispose() { ++version; cancel(); cancel = () => {}; },
  };
}

export function bindLeagueResume({ load, windowTarget = window, documentTarget = document, now = Date.now }) {
  let last = -Infinity;
  const refresh = () => {
    if (documentTarget.hidden || now() - last < 1000) return;
    last = now();
    load();
  };
  const reconnect = () => { last = -Infinity; refresh(); };
  windowTarget.addEventListener('focus', refresh);
  windowTarget.addEventListener('online', reconnect);
  documentTarget.addEventListener('visibilitychange', refresh);
  return () => {
    windowTarget.removeEventListener('focus', refresh);
    windowTarget.removeEventListener('online', reconnect);
    documentTarget.removeEventListener('visibilitychange', refresh);
  };
}

/* Heartbeat polling. The server exposes a ~80-byte "pulse" carrying the
   league's write counter. Ask for it every few seconds; fetch the whole league
   only when the number moves (or, as a safety net, when it has been a long
   time). This is what makes a chat message or a final show up on every phone
   within seconds without every phone downloading the league every 30s. */
export function bindLeaguePulse({ fetchPulse, load, getVersion, intervalMs = 10_000, fallbackMs = 300_000, documentTarget = document, now = Date.now, setIntervalFn = setInterval, clearIntervalFn = clearInterval }) {
  let busy = false;
  let lastLoadAt = now();
  const tick = async () => {
    if (busy || documentTarget.hidden) return;
    busy = true;
    try {
      const pulse = await fetchPulse();
      const known = getVersion();
      const moved = pulse?.version != null && pulse.version !== known;
      const overdue = now() - lastLoadAt >= fallbackMs;
      if (moved || overdue) {
        lastLoadAt = now();
        await load();
      }
    } catch {
      /* A missed heartbeat is not an error worth showing; the next one retries. */
    } finally {
      busy = false;
    }
  };
  const timer = setIntervalFn(tick, intervalMs);
  return () => clearIntervalFn(timer);
}
