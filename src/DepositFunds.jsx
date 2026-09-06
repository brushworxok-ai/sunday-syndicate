import { useEffect, useRef, useState } from 'react';

export default function DepositFunds({ apiRequest, leagueId, cashAppUrl, admin = false, players = [], onUpdated }) {
  const [amount, setAmount] = useState('20');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [opened, setOpened] = useState(false);
  const [sent, setSent] = useState(false);
  const [deposits, setDeposits] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const previous = useRef(null);
  const updated = useRef(onUpdated);
  updated.current = onUpdated;
  const base = `/api/leagues/${leagueId}/${admin ? 'admin/' : ''}deposits`;
  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const data = await apiRequest(base);
        if (active) {
          const snapshot = JSON.stringify(data.deposits);
          const changed = previous.current !== null && previous.current !== snapshot;
          previous.current = snapshot;
          setDeposits(data.deposits); setLoaded(true); setError('');
          if (changed) await updated.current?.();
        }
      } catch (e) { if (active) setError(e.message); }
    };
    load();
    const timer = setInterval(load, 15000);
    return () => { active = false; clearInterval(timer); };
  }, [base, apiRequest]);
  const pending = deposits.filter(d => d.status === 'pending');
  const valid = Number(amount) >= 1 && Number(amount) <= 1000 && /^\d+(\.\d{1,2})?$/.test(amount);
  async function submit(id, action) {
    setBusy(true); setError('');
    try {
      await apiRequest(id ? `${base}/${id}` : base, { method: 'POST', body: JSON.stringify(id ? { action } : { amount: Number(amount), requestId }) });
      const data = await apiRequest(base);
      setDeposits(data.deposits); setOpened(false); setSent(false);
      setRequestId(crypto.randomUUID());
      await onUpdated?.();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <section className="cashapp-admin-section" aria-label={admin ? 'Deposit requests' : 'Add funds'}>
    <h2>{admin ? 'Deposit requests' : 'Add Funds'}</h2>
    {error && <p role="alert">{error}</p>}
    {!loaded && !error && <p>Loading deposits…</p>}
    {admin ? <>
      <p>Check Cash App for the actual payment before confirming. Confirmation adds the amount to the player’s credit.</p>
      {loaded && pending.length === 0 && <p>No deposits waiting for confirmation.</p>}
      {pending.map(d => <div className="deposit-request" key={d.id}>
        <strong>{players.find(p => p.id === d.playerId)?.name || 'Player'} — ${d.amount.toFixed(2)}</strong>
        <small>Requested {new Date(d.at).toLocaleString()}</small>
        <div className="cashapp-admin-actions">
          <button type="button" className="button button-primary" disabled={busy} onClick={() => submit(d.id, 'confirm')}>Payment received — confirm ${d.amount.toFixed(2)}</button>
          <button type="button" className="button button-ghost-dark" disabled={busy} onClick={() => submit(d.id, 'reject')}>Decline request</button>
        </div>
      </div>)}
    </> : <>
      <p>Send money through Cash App for future games. Credit becomes available after the commissioner confirms receipt.</p>
      {pending.length > 0 ? <p role="status">${pending[0].amount.toFixed(2)} deposit pending — waiting for commissioner confirmation.</p> : <>
        {!cashAppUrl && <p>Ask the commissioner to set up the Cash App link.</p>}
        {!opened ? <button type="button" className="button button-primary" disabled={!cashAppUrl || !loaded || busy} onClick={() => setOpened(true)}>Add Funds</button> : <div className="cashapp-admin-form">
          <div className="cashapp-admin-actions">{[10,20,50,100].map(value => <button type="button" className="button button-ghost-dark" aria-pressed={amount === String(value)} disabled={sent || busy} key={value} onClick={() => setAmount(String(value))}>${value}</button>)}</div>
          <label>Amount (or enter another amount)<input type="number" min="1" max="1000" step="0.01" value={amount} disabled={sent || busy} onChange={e => setAmount(e.target.value)} /></label>
          <p>In Cash App, send ${valid ? Number(amount).toFixed(2) : '…'} and include your player name and “future games” in the payment note.</p>
          {valid && <a className="button button-primary" href={cashAppUrl} target="_blank" rel="noreferrer" onClick={() => setSent(true)}>Send with Cash App ↗</a>}
          <button type="button" className="button button-primary" disabled={!valid || !sent || busy} onClick={() => submit()}> {busy ? 'Saving…' : `I sent $${valid ? Number(amount).toFixed(2) : '…'}`}</button>
          <button type="button" className="button button-ghost-dark" disabled={busy} onClick={() => { setOpened(false); setSent(false); }}>Cancel</button>
        </div>}
      </>}
      {deposits.filter(d => d.status !== 'pending').slice(-5).reverse().map(d => <p key={d.id}>${d.amount.toFixed(2)} — {d.status === 'confirmed' ? 'Deposit confirmed. Credit added to your balance.' : 'Deposit declined. Contact the commissioner.'}</p>)}
    </>}
  </section>;
}
