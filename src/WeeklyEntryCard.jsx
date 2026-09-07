export default function WeeklyEntryCard({ sheet, games, weekLabel, locked, deadline, balance, fee, onNavigate, receipt = false }) {
  const count = games.filter(game => [game.home, game.away].includes(sheet?.picks?.[game.id])).length;
  const picksDone = games.length > 0 && count === games.length;
  const tieDone = sheet?.tiebreaker != null && sheet.tiebreaker !== '' && Number.isFinite(Number(sheet.tiebreaker));
  const saved = picksDone && tieDone;
  const complete = saved && sheet?.paid;
  const pending = saved && !sheet?.paid && sheet?.paymentClaim;
  const destination = complete ? 'results' : pending ? 'payments' : !saved ? (locked ? 'results' : 'picks') : 'payments';
  const title = complete ? `You’re in for ${weekLabel}` : pending ? 'Picks saved — payment pending' : locked && !saved ? 'Picks are closed for this week' : saved ? 'One step left: pay your entry' : 'Finish your weekly entry';
  return <section className="panel weekly-entry-card" aria-label={receipt ? 'Your entry receipt' : 'This week checklist'}>
    <div className="panel-heading"><div><span className="eyebrow dark">{receipt ? 'YOUR SAVED ENTRY' : 'THIS WEEK'} · NFL · {weekLabel}</span><h2>{title}</h2></div><span className="credit-chip">Available balance: <strong>${Number(balance).toFixed(2)}</strong></span></div>
    <p className="muted">{deadline ? `${locked ? 'Picks closed' : 'Picks close'} ${deadline.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })}.` : 'Check the Picks page for the deadline.'} {locked ? 'Saved picks can no longer be edited.' : 'You can edit saved picks until the deadline.'}</p>
    <ol className="weekly-entry-steps">
      <li><span aria-hidden="true">{picksDone ? '✓' : '1'}</span><div><strong>{picksDone ? 'Picks saved' : 'Pick every game'}</strong><small>{count} of {games.length} saved{!picksDone ? ` · ${Math.max(0, games.length - count)} remaining` : ''}</small></div></li>
      <li><span aria-hidden="true">{tieDone ? '✓' : '2'}</span><div><strong>{tieDone ? 'Tiebreaker saved' : 'Add your tiebreaker'}</strong><small>{tieDone ? `${sheet.tiebreaker} total points` : 'Predict total points in the last game'}</small></div></li>
      <li><span aria-hidden="true">{sheet?.paid ? '✓' : '3'}</span><div><strong>{sheet?.paid ? 'Entry paid' : pending ? 'Payment awaiting confirmation' : `Pay $${fee} entry`}</strong><small>{sheet?.paid ? 'Payment confirmed' : pending ? 'The commissioner is checking your payment' : Number(balance) >= fee ? 'Your available balance covers this entry' : 'Use your balance or Cash App'}</small></div></li>
    </ol>
    <div className="you-week-actions">
      <button type="button" className="button button-primary" onClick={() => onNavigate(destination)}>{complete || locked && !saved ? 'See the board' : pending ? 'View payment status' : 'Finish My Entry'} →</button>
      {saved && !locked && <button type="button" className="button button-ghost-dark" onClick={() => onNavigate('picks')}>Edit picks</button>}
      <button type="button" className="button button-ghost-dark" onClick={() => onNavigate('payments')}>My Payments / Add Funds</button>
    </div>
    <small className="muted">This checklist covers your NFL weekly entry. College and season pools are separate entries.</small>
  </section>;
}
