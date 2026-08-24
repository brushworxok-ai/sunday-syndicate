// Player credit ledger — shared helpers for server and frontend.
// The app only TRACKS money between friends; it never moves real money.
// Positive amounts = credit added (Cash App received, winnings, refund).
// Negative amounts = credit spent (entry fees).

export function creditBalance(ledger, playerId) {
  return Math.round(
    (ledger ?? [])
      .filter((entry) => entry.playerId === playerId)
      .reduce((sum, entry) => sum + Number(entry.amount || 0), 0) * 100,
  ) / 100;
}

export function creditBalances(ledger, players) {
  return Object.fromEntries((players ?? []).map((p) => [p.id, creditBalance(ledger, p.id)]));
}

export function validateCreditEntry({ amount, reason }) {
  const value = Number(amount);
  if (!Number.isFinite(value) || value === 0) return { ok: false, error: 'Amount must be a non-zero number.' };
  if (Math.abs(value) > 1000) return { ok: false, error: 'Amount must be $1000 or less.' };
  if (typeof reason !== 'string' || !reason.trim()) return { ok: false, error: 'A short reason is required (e.g. "Cash App received", "Week 3 winnings").' };
  return { ok: true, value: Math.round(value * 100) / 100 };
}
