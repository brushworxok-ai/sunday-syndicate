export const COMMISSIONER_PAYMENT_METHODS = Object.freeze([
  {
    id: 'cashapp',
    label: 'Cash App',
    handle: '$Tique',
    action: 'Open Cash App',
    href: 'https://cash.app/$Tique',
    accent: '#00d64f',
  },
  {
    id: 'paypal',
    label: 'PayPal',
    handle: '@Eubanks1212',
    action: 'Open PayPal',
    accent: '#0070e0',
    hrefForAmount: (amount) => `https://www.paypal.com/paypalme/Eubanks1212/${Number(amount)}USD`,
  },
  {
    id: 'applecash',
    label: 'Apple Cash',
    handle: '(405) 503-8055',
    action: 'Open Messages',
    href: 'sms:+14055038055',
    accent: '#111827',
  },
]);

export function commissionerPaymentHref(method, amount) {
  return method.hrefForAmount ? method.hrefForAmount(amount) : method.href;
}

export function buildPaymentMemo({ season, week, playerName, purpose = 'weekly entry' }) {
  const player = String(playerName || 'PLAYER').trim().replace(/\s+/g, ' ').slice(0, 40);
  return `405 BADGUYS · ${season} W${week} · ${player} · ${purpose}`;
}
