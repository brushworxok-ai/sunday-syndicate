/* Account funding — a player says "I sent $20 to fund my account", the
   commissioner confirms, and it lands on the credit ledger. The app only
   TRACKS the money; Cash App / Venmo / PayPal / Apple Cash move it.
   Shared by server + client. Deposits live in league.settings.deposits[]. */

export const DEPOSIT_PRESETS = [10, 20, 50, 100];
export const DEPOSIT_MIN = 5;
export const DEPOSIT_MAX = 500;
export const DEPOSIT_METHODS = ['cashapp', 'venmo', 'paypal', 'applecash', 'cash'];
export const MAX_PENDING_DEPOSITS = 3;

export function validateDepositAmount(input) {
  const value = Number(input);
  if (!Number.isFinite(value)) return { ok: false, error: 'Enter a dollar amount.' };
  if (!Number.isInteger(value)) return { ok: false, error: 'Whole dollars only.' };
  if (value < DEPOSIT_MIN) return { ok: false, error: `Minimum is $${DEPOSIT_MIN}.` };
  if (value > DEPOSIT_MAX) return { ok: false, error: `Maximum is $${DEPOSIT_MAX} at a time.` };
  return { ok: true, value };
}

export function pendingDeposits(deposits, playerId = null) {
  return (deposits ?? []).filter((d) => d.status === 'pending' && (!playerId || d.playerId === playerId));
}

export function depositReason(deposit, methodLabel) {
  return `Account funding via ${methodLabel ?? deposit.method}`;
}
