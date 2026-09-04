import { useRef, useState } from 'react';

const attemptKey = 'commissioner-sms-test';
export default function CommunicationsCheck({ request }) {
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [attempt, setAttempt] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(attemptKey) || 'null'); } catch { return null; }
  });
  const busyRef = useRef(false);
  const run = async (name, action) => {
    if (busyRef.current) return;
    busyRef.current = true; setBusy(name); setError('');
    try { await action(); } catch (err) { setError(err.message); }
    finally { busyRef.current = false; setBusy(''); }
  };
  const saveAttempt = (value) => {
    setAttempt(value);
    try { sessionStorage.setItem(attemptKey, JSON.stringify(value)); } catch { /* State still prevents double-clicks. */ }
  };
  const check = () => run('check', async () => {
    const read = async (url) => { try { return await request(url); } catch (err) { return { error: err.message }; } };
    const [sms, voice, health] = await Promise.all([read('/api/sms/diagnose'), read('/api/tts/diagnose'), read('/api/health')]);
    setReport({ sms, voice, health });
  });
  const send = () => run('send', async () => {
    if (!confirmed || attempt) return;
    const requestId = crypto.randomUUID();
    saveAttempt({ requestId, status: 'unknown', note: 'Test requested. If interrupted, check provider logs before another send.' });
    const result = await request('/api/sms/test', { method: 'POST', body: JSON.stringify({ confirm: true, requestId }) });
    saveAttempt({ requestId, ...result });
  });
  const trace = () => run('trace', async () => {
    const result = await request(`/api/sms/trace?id=${encodeURIComponent(attempt.id)}`);
    saveAttempt({ ...attempt, trace: result });
  });
  return (
    <section className="communications-check" aria-labelledby="communications-title">
      <div className="panel-heading"><div><span className="eyebrow dark">LIVE VERIFICATION</span><h2 id="communications-title">Jack, texts & notifications</h2></div>
        <button className="button button-ghost-dark" type="button" disabled={Boolean(busy)} onClick={check}>{busy === 'check' ? 'Checking…' : 'Check connections'}</button>
      </div>
      <p>Connection checks send no texts and generate no audio. Configuration alone does not confirm delivery.</p>
      {error && <p role="alert">{error}</p>}
      {report && <div className="communications-report" aria-live="polite">
        <div><strong>Text messages · {report.sms.provider || 'Unavailable'}</strong>
          <p>{report.sms.error || (report.sms.apiKeyValid === true ? `API key accepted. Sending number ${report.sms.numberStatus || 'status unknown'}.` : 'Provider access has not been verified.')}</p>
          <p>Messaging: {report.sms.messagingEnabled ? 'enabled' : 'not confirmed'} · Signed webhooks: {report.sms.webhookVerificationConfigured ? 'configured' : 'missing'}</p>
        </div>
        <div><strong>Jack’s selected voice</strong><p>{report.voice.error || report.voice.voiceLookup?.error || report.voice.voiceLookup?.name || 'No studio voice verified'}</p>
          <p>{report.voice.provider || 'Unknown provider'}{report.voice.voiceId ? ` · ${report.voice.voiceId}` : ''} · {report.voice.model || 'device fallback'}</p>
          <p>Use Jack’s speaker button to listen and confirm this is the voice you want.</p>
        </div>
        <div><strong>Push notifications</strong><p>{report.health.pushConfigured ? 'Server keys configured. Each device still needs permission and a test.' : 'Server push keys are missing or could not be checked.'}</p><p>Sign in as a player, then enable and test notifications in My Profile.</p></div>
      </div>}
      <div className="communications-test">
        <h3>One commissioner-only test</h3>
        <p>Sends only to the configured commissioner phone, never to the roster. Carrier charges may apply.</p>
        {!attempt && <>
          <label className="check-row"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /><span>I authorize one test to the configured commissioner phone.</span></label>
          <button className="button button-primary" type="button" disabled={!confirmed || Boolean(busy) || !report?.sms?.testDestinationConfigured} onClick={send}>{busy === 'send' ? 'Sending once…' : 'Send one test text'}</button>
        </>}
        {attempt && <div role="status">
          <p><strong>Test status: {attempt.trace?.to?.map((recipient) => recipient.status).join(', ') || attempt.status || 'unknown'}</strong></p>
          {attempt.id && <p>Message ID: <code>{attempt.id}</code></p>}
          <p>{attempt.error || attempt.trace?.error || attempt.note}</p>
          {attempt.trace?.errors?.map((item, index) => <p key={index}>Provider error {item.code}: {item.detail || item.title}</p>)}
          {attempt.id && <button className="button button-ghost-dark" type="button" disabled={Boolean(busy)} onClick={trace}>{busy === 'trace' ? 'Checking delivery…' : 'Check delivery status'}</button>}
          <p>No second test will be sent from this panel in this browser session.</p>
        </div>}
      </div>
    </section>
  );
}
