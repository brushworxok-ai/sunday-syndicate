/* Player payment handles — Cash App, Venmo, PayPal. Shared by server + client.
   Only public handles are stored (no Zelle emails/phones: the league already
   has each player's phone on file for that). */

export const PAY_METHODS = Object.freeze({
  cashapp: { key: 'cashapp', field: 'cashApp', label: 'Cash App', prefix: '$', url: (h) => `https://cash.app/$${h}`, placeholder: '$YourCashtag', pattern: /^[A-Za-z][A-Za-z0-9_-]{0,29}$/ },
  venmo: { key: 'venmo', field: 'venmo', label: 'Venmo', prefix: '@', url: (h) => `https://venmo.com/u/${h}`, placeholder: '@your-venmo', pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/ },
  paypal: { key: 'paypal', field: 'paypal', label: 'PayPal', prefix: '', url: (h) => `https://paypal.me/${h}`, placeholder: 'paypal.me name', pattern: /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/ },
});
export const PAY_ORDER = ['cashapp', 'venmo', 'paypal'];

const cleanHandle = (value, method) => {
  let text = String(value ?? '').trim();
  if (!text) return '';
  text = text.replace(/^(https?:\/\/)?(www\.)?(cash\.app\/|venmo\.com\/(u\/)?|paypal\.me\/)/i, '');
  text = text.replace(/^[$@]+/, '').replace(/\/+$/, '');
  return method.pattern.test(text) ? text : null; // null = invalid
};

/* Normalize user input into { cashApp, venmo, paypal, preferred }.
   Returns { payment, error }. Empty handles are dropped. */
export function normalizePayment(input = {}) {
  const payment = {};
  for (const key of PAY_ORDER) {
    const method = PAY_METHODS[key];
    const raw = input[method.field];
    if (raw === undefined || raw === null || String(raw).trim() === '') continue;
    const handle = cleanHandle(raw, method);
    if (handle === null) return { error: `That ${method.label} handle doesn't look right. Letters, numbers, dashes, and underscores only.` };
    payment[method.field] = handle;
  }
  const available = PAY_ORDER.filter((key) => payment[PAY_METHODS[key].field]);
  const wanted = PAY_ORDER.includes(input.preferred) ? input.preferred : null;
  payment.preferred = wanted && available.includes(wanted) ? wanted : (available[0] ?? null);
  payment.updatedAt = new Date().toISOString();
  return { payment };
}

/* The handle a commissioner should pay this player at. */
export function preferredHandle(player) {
  const payment = player?.payment ?? {};
  const key = payment.preferred && payment[PAY_METHODS[payment.preferred]?.field] ? payment.preferred : PAY_ORDER.find((k) => payment[PAY_METHODS[k].field]);
  if (!key) return null;
  const method = PAY_METHODS[key];
  const handle = payment[method.field];
  return { key, label: method.label, handle, display: `${method.prefix}${handle}`, url: method.url(handle) };
}

export function hasPaymentHandle(player) {
  return Boolean(preferredHandle(player));
}
