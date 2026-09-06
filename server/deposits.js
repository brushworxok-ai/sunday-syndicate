import { randomUUID } from 'node:crypto';

export function changeDeposit(state, action, input) {
  state.deposits ??= [];
  if (action === 'request') {
    if (typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) throw new Error('Invalid deposit request ID.');
    const existing = state.deposits.find(d => d.requestId === input.requestId && d.playerId === input.playerId);
    if (existing) return existing;
    const amount = Number(input.amount);
    if (!Number.isFinite(amount) || amount < 1 || amount > 1000 || Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001) throw new Error('Enter $1–$1,000, with no more than two decimal places.');
    const pending = state.deposits.find(d => d.playerId === input.playerId && d.status === 'pending');
    if (pending) return pending;
    const deposit = { id: randomUUID(), requestId: input.requestId, playerId: input.playerId, amount, status: 'pending', at: new Date().toISOString() };
    state.deposits.push(deposit);
    return deposit;
  }
  const deposit = state.deposits.find(d => d.id === input.id);
  if (!deposit) throw new Error('Deposit not found.');
  if (deposit.status !== 'pending') return deposit;
  if (!['confirm', 'reject'].includes(action)) throw new Error('Invalid action.');
  deposit.status = action === 'confirm' ? 'confirmed' : 'rejected';
  deposit.resolvedAt = new Date().toISOString();
  if (action === 'confirm') {
    state.creditLedger ??= [];
    state.creditLedger.push({ id: `deposit-${deposit.id}`, playerId: deposit.playerId, amount: deposit.amount, reason: 'Cash App deposit confirmed', by: 'admin', at: deposit.resolvedAt });
  }
  state.notifications ??= [];
  state.notifications.push({ id: `deposit-${deposit.id}`, playerId: deposit.playerId, kind: 'deposit', title: action === 'confirm' ? 'Deposit confirmed' : 'Deposit declined', body: action === 'confirm' ? `$${deposit.amount.toFixed(2)} added to your credit for future games.` : 'Contact the commissioner about your deposit.', at: deposit.resolvedAt });
  return deposit;
}
