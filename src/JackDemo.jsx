import { useMemo, useState } from 'react';
import { getTeamLogoUrl } from './data.js';
import JackControlStudio, { JackAvatar } from './JackExperience.jsx';
import { DEFAULT_JACK_SETTINGS } from './jackHost.js';
import {
  JACK_DEMO_GAME,
  JACK_DEMO_INJURY,
  JACK_DEMO_PLAYERS,
  JACK_INVITE_CODE,
  JACK_TEST_LEAGUE,
  ROAST_MODE_LABELS,
  buildJackDemoStandings,
  buildJackPlayerComment,
  buildJackVoiceAnswer,
  createDemoAccount,
  generateJackDemoRecap,
  jackOnboardingMessage,
  unavailableLiveDataState,
  validateInvite,
} from './jackDemo.js';

const STEP_LABELS = ['Invite', 'Account', 'Welcome', 'Jack lab'];
const DEMO_ACCOUNT = { id: 'player-avery', displayName: 'Avery Johnson', email: 'avery@example.com', humor: 'competitive', favoriteTeam: 'KC', verification: 'demo_verified' };

function initialInviteCode() {
  if (typeof window === 'undefined') return '';
  return new URLSearchParams(window.location.search).get('invite') || '';
}

function initialStep() {
  if (typeof window === 'undefined') return 0;
  return new URLSearchParams(window.location.search).get('stage') === 'league' ? 3 : 0;
}

function setDemoUrl({ invite = JACK_INVITE_CODE, stage } = {}) {
  if (typeof window === 'undefined') return;
  const next = new URL(window.location.href);
  next.searchParams.set('view', 'join');
  next.searchParams.set('invite', invite);
  if (stage) next.searchParams.set('stage', stage);
  else next.searchParams.delete('stage');
  window.history.replaceState({}, '', next);
}

export default function JackDemo({ onExit }) {
  const [step, setStep] = useState(initialStep);
  const [inviteCode, setInviteCode] = useState(initialInviteCode);
  const [inviteResult, setInviteResult] = useState(() => validateInvite(initialInviteCode()));
  const [accountForm, setAccountForm] = useState({ displayName: 'Avery Johnson', email: 'avery@example.com', password: 'DemoPass26!', favoriteTeam: 'KC', humor: 'competitive', acceptRules: true });
  const [account, setAccount] = useState(() => initialStep() === 3 ? DEMO_ACCOUNT : null);
  const [formError, setFormError] = useState('');
  const [scorePhase, setScorePhase] = useState('before');
  const [injuryPhase, setInjuryPhase] = useState('before');
  const [recap, setRecap] = useState(null);
  const [recapBusy, setRecapBusy] = useState(false);
  const [feedUnavailable, setFeedUnavailable] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState('');
  const [voiceState, setVoiceState] = useState('idle');
  const [voiceAnswer, setVoiceAnswer] = useState(null);
  const [voicePlayback, setVoicePlayback] = useState('off');
  const [avatarState, setAvatarState] = useState('idle');
  const [jackSettings, setJackSettings] = useState(() => ({ ...DEFAULT_JACK_SETTINGS, voice: { ...DEFAULT_JACK_SETTINGS.voice }, animation: { ...DEFAULT_JACK_SETTINGS.animation } }));
  const [demoPlayers, setDemoPlayers] = useState(() => JACK_DEMO_PLAYERS.map((player) => ({
    ...player,
    jackPolicy: {
      playerConsentLevel: player.humor === 'maximum' ? 'target' : player.humor === 'competitive' ? 'pg13' : 'clean',
      adminAssignedLevel: player.humor === 'maximum' ? 'target' : player.humor === 'competitive' ? 'pg13' : 'clean',
      roastEnabled: player.humor !== 'none',
      adultLanguageConsent: player.humor === 'maximum',
      adultAgeGate: player.humor === 'maximum',
      favoriteTeam: player.favoriteTeam,
      updatedBy: 'fixture',
    },
  })));

  const standings = useMemo(() => buildJackDemoStandings(scorePhase), [scorePhase]);
  const score = JACK_DEMO_GAME[scorePhase];
  const injury = JACK_DEMO_INJURY[injuryPhase];
  const fallback = unavailableLiveDataState();
  const comments = useMemo(() => JACK_DEMO_PLAYERS.map((player) => buildJackPlayerComment(player.id, scorePhase)), [scorePhase]);

  const useDemoInvite = () => {
    setInviteCode(JACK_INVITE_CODE);
    setInviteResult(validateInvite(JACK_INVITE_CODE));
    setDemoUrl();
  };

  const verifyInvite = (event) => {
    event.preventDefault();
    const result = validateInvite(inviteCode);
    setInviteResult(result);
    if (result.valid) setDemoUrl({ invite: inviteCode.trim().toUpperCase() });
  };

  const createAccount = (event) => {
    event.preventDefault();
    const result = createDemoAccount({ ...accountForm, inviteCode });
    if (!result.ok) {
      setFormError(result.error);
      return;
    }
    setFormError('');
    setAccount(result.account);
    setStep(2);
  };

  const openLab = () => {
    setStep(3);
    setDemoUrl({ stage: 'league' });
  };

  const makeRecap = () => {
    setRecapBusy(true);
    setAvatarState('thinking');
    window.setTimeout(() => {
      setRecap(generateJackDemoRecap(scorePhase));
      setRecapBusy(false);
      setAvatarState('winner');
    }, 420);
  };

  const startVoiceInput = () => {
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) {
      setVoiceState('unsupported');
      setAvatarState('error');
      return;
    }
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      setVoiceTranscript(event.results[0][0].transcript);
      setVoiceState('captured');
      setAvatarState('thinking');
    };
    recognition.onerror = () => { setVoiceState('error'); setAvatarState('error'); };
    recognition.onend = () => setVoiceState((current) => current === 'listening' ? 'idle' : current);
    setVoiceState('listening');
    setAvatarState('listening');
    recognition.start();
  };

  const useDemoVoice = () => {
    setVoiceTranscript('Jack, what injuries matter tonight, and how did I do last year?');
    setVoiceState('captured');
    setVoiceAnswer(null);
    setAvatarState('thinking');
  };

  const askVoiceQuestion = (event) => {
    event.preventDefault();
    if (!voiceTranscript.trim()) return;
    setVoiceAnswer(buildJackVoiceAnswer({ playerId: 'player-avery', scorePhase, injuryPhase }));
    setVoiceState('answered');
    setAvatarState('talking');
  };

  const readVoiceAnswer = () => {
    if (!voiceAnswer || jackSettings.voice.textOnly || !jackSettings.voice.enabled || !('speechSynthesis' in window)) {
      setVoicePlayback('unsupported');
      setAvatarState('error');
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(voiceAnswer.text);
    utterance.rate = jackSettings.voice.speed;
    utterance.volume = jackSettings.voice.volume;
    utterance.pitch = jackSettings.voice.pitch;
    utterance.lang = jackSettings.voice.language;
    utterance.onend = () => { setVoicePlayback('off'); setAvatarState('idle'); };
    window.speechSynthesis.speak(utterance);
    setVoicePlayback('playing');
    setAvatarState('talking');
  };

  const restart = () => {
    setStep(0);
    setScorePhase('before');
    setInjuryPhase('before');
    setRecap(null);
    setFeedUnavailable(false);
    setVoiceTranscript('');
    setVoiceAnswer(null);
    setVoiceState('idle');
    setAvatarState('idle');
    setDemoUrl();
  };

  const saveDemoJackSettings = async (next) => setJackSettings(next);
  const saveDemoPlayerPolicy = async (playerId, next) => setDemoPlayers((current) => current.map((player) => player.id === playerId ? { ...player, jackPolicy: { ...player.jackPolicy, ...next } } : player));

  return (
    <div className="jack-demo-shell jack-intelligence-demo">
      <section className="jack-demo-banner" aria-label="Demo disclosure">
        <span>JACK TEST LEAGUE</span>
        <p>Every score, injury, record, and voice exchange is a deterministic product-test fixture—not current NFL information.</p>
        <button type="button" onClick={onExit}>Exit demo</button>
      </section>

      <ol className="jack-demo-steps" aria-label="Demo progress">
        {STEP_LABELS.map((label, index) => <li className={index === step ? 'active' : index < step ? 'complete' : ''} key={label} aria-current={index === step ? 'step' : undefined}><span>{index < step ? '✓' : index + 1}</span><strong>{label}</strong></li>)}
      </ol>

      {step === 0 && (
        <section className="jack-onboarding-layout">
          <article className="jack-invite-card">
            <span className="eyebrow dark">PRIVATE LEAGUE INVITE</span><h1>You’ve been invited to the 405.</h1><p>Join a four-player test league where Jack knows the board, remembers last season, and stays inside every player’s humor settings.</p>
            <form onSubmit={verifyInvite}><label htmlFor="jack-invite">Invite code</label><div><input id="jack-invite" value={inviteCode} onChange={(event) => { setInviteCode(event.target.value); setInviteResult({ valid: false }); }} placeholder="Enter invite code" autoCapitalize="characters" /><button className="button button-primary" type="submit">Verify</button></div></form>
            {!inviteResult.valid && inviteResult.reason && inviteCode && <p className="jack-form-error" role="alert">{inviteResult.reason}</p>}
            {!inviteResult.valid && <button className="text-button" type="button" onClick={useDemoInvite}>Use the demo invite →</button>}
            {inviteResult.valid && <div className="jack-invite-success" role="status"><span>✓</span><div><strong>Invite verified</strong><p>{inviteResult.leagueName} · four-player Jack test league</p></div><button className="button button-primary" type="button" onClick={() => setStep(1)}>Join now →</button></div>}
          </article>
          <JackPortrait />
        </section>
      )}

      {step === 1 && (
        <section className="jack-account-layout">
          <article className="jack-account-card">
            <span className="eyebrow dark">CREATE YOUR DEMO ACCOUNT</span><h1>Tell Jack who you are.</h1><p>The test stores nothing. It proves that favorite-team memory and humor consent can be captured together.</p>
            <form onSubmit={createAccount}>
              <label>Display name<input value={accountForm.displayName} maxLength="40" onChange={(event) => setAccountForm({ ...accountForm, displayName: event.target.value })} /></label>
              <label>Email<input type="email" value={accountForm.email} onChange={(event) => setAccountForm({ ...accountForm, email: event.target.value })} /></label>
              <label>Demo password<input type="password" value={accountForm.password} minLength="8" onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} /><small>Eight characters minimum. This demo does not save it.</small></label>
              <label>Favorite team<select value={accountForm.favoriteTeam} onChange={(event) => setAccountForm({ ...accountForm, favoriteTeam: event.target.value })}><option value="KC">Kansas City Chiefs</option><option value="BUF">Buffalo Bills</option><option value="DAL">Dallas Cowboys</option><option value="PHI">Philadelphia Eagles</option></select></label>
              <label>Jack’s tone<select value={accountForm.humor} onChange={(event) => setAccountForm({ ...accountForm, humor: event.target.value })}>{Object.entries(ROAST_MODE_LABELS).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
              <label className="jack-rule-check"><input type="checkbox" checked={accountForm.acceptRules} onChange={(event) => setAccountForm({ ...accountForm, acceptRules: event.target.checked })} /><span>I accept the demo rules and understand every sports update is simulated.</span></label>
              {formError && <p className="jack-form-error" role="alert">{formError}</p>}
              <div className="jack-form-actions"><button className="button button-ghost-dark" type="button" onClick={() => setStep(0)}>Back</button><button className="button button-primary" type="submit">Create account →</button></div>
            </form>
          </article>
          <aside className="jack-privacy-card"><strong>Player-controlled by design.</strong><p>Jack may use league facts and team preferences, but only applies the exact humor level each player selected.</p><ul><li>No appearance, family, health, money, or private-life jokes</li><li>No audio recording or storage</li><li>Commissioner review before sharing AI commentary</li></ul></aside>
        </section>
      )}

      {step === 2 && account && (
        <section className="jack-welcome-card" role="status"><img src="/jack.jpg" alt="Jack, the 405 league host" /><div><span className="eyebrow dark">ACCOUNT CREATED</span><h1>Welcome, {account.displayName}.</h1><p>{jackOnboardingMessage(account)}</p><div className="jack-account-proof"><span>✓ Favorite team: {account.favoriteTeam}</span><span>✓ {ROAST_MODE_LABELS[account.humor]}</span><span>✓ No audio stored</span></div><button className="button button-primary" type="button" onClick={openLab}>Open Jack’s test league →</button></div></section>
      )}

      {step === 3 && (
        <div className="jack-lab">
          <section className="jack-lab-hero">
            <JackAvatar state={avatarState} settings={{ jack: jackSettings }} />
            <div><span className="eyebrow">JACK INTELLIGENCE LAB · WEEK 1</span><h1>Facts first.<br /><em>Smart-ass second.</em></h1><p>Four personalities, one remembered season, and zero permission to invent a score.</p></div>
            <button className="button button-ghost" type="button" onClick={restart}>Restart walkthrough</button>
          </section>

          <section className="jack-lab-proof-strip" aria-label="Test league coverage"><div><strong>4</strong><span>favorite teams</span></div><div><strong>4</strong><span>roast modes</span></div><div><strong>2025</strong><span>history loaded</span></div><div><strong>0</strong><span>audio files stored</span></div></section>

          {feedUnavailable && <section className="jack-lab-fallback" role="alert"><span>!</span><div><strong>{fallback.label}</strong><p>{fallback.detail}</p><small>Score snapshot {fallback.lastSuccessfulScoreUpdate} · Injury snapshot {fallback.lastSuccessfulInjuryUpdate}</small></div><button className="button button-primary" type="button" onClick={() => { setFeedUnavailable(false); setAvatarState('live'); }}>Retry fixture feed</button></section>}

          <section className="jack-lab-live-grid">
            <article className="jack-lab-card jack-live-command">
              <CardHeader eyebrow="SIMULATED LIVE" title="Buffalo at Kansas City" status={feedUnavailable ? 'STALE' : scorePhase === 'after' ? 'UPDATED' : 'LIVE'} tone={feedUnavailable ? 'warn' : 'live'} />
              <div className="jack-lab-source"><span>{JACK_DEMO_GAME.source}</span><span>{score.updatedAt}</span></div>
              <div className="jack-lab-score"><LabTeam code="BUF" score={score.awayScore} /><div><strong>{score.quarter}</strong><b>{score.clock}</b><span>{JACK_DEMO_GAME.venue}</span></div><LabTeam code="KC" score={score.homeScore} home /></div>
              <p className="jack-data-disclaimer">{JACK_DEMO_GAME.disclaimer}</p>
              <div className="jack-lab-actions"><button className="button button-primary" type="button" onClick={() => { setScorePhase('after'); setRecap(null); setAvatarState('live'); }} disabled={scorePhase === 'after'}>{scorePhase === 'before' ? 'Run score update →' : 'Score update applied ✓'}</button><button className="button button-ghost-dark" type="button" onClick={() => { setFeedUnavailable(true); setAvatarState('error'); }}>Test data outage</button></div>
            </article>

            <article className={`jack-lab-card jack-injury-command ${injuryPhase === 'after' ? 'major' : ''}`}>
              <CardHeader eyebrow="INJURY WATCH" title="Kansas City QB1" status={injury.status.toUpperCase()} tone={injuryPhase === 'after' ? 'danger' : 'warn'} />
              <div className="jack-injury-body"><div className="jack-injury-icon">+</div><div><span>Designation</span><strong>{JACK_DEMO_INJURY.injury}</strong><span>Participation</span><strong>{injury.participation}</strong></div></div>
              <div className="jack-lab-source"><span>{JACK_DEMO_INJURY.source}</span><span>{injury.updatedAt}</span></div><p className="jack-data-disclaimer">{JACK_DEMO_INJURY.disclaimer}</p>
              <button className="button button-primary full" type="button" onClick={() => { setInjuryPhase('after'); setVoiceAnswer(null); setAvatarState('shock'); }} disabled={injuryPhase === 'after'}>{injuryPhase === 'before' ? 'Run major injury update →' : 'Status changed to OUT ✓'}</button>
            </article>
          </section>

          <section className="jack-lab-board-grid">
            <article className="jack-lab-card jack-lab-standings">
              <CardHeader eyebrow="PROJECTED BOARD" title={scorePhase === 'before' ? 'Before the score update' : 'After the score update'} status="NOT FINAL" tone="warn" />
              <div className="jack-lab-table-head"><span>Rank</span><span>Player</span><span>Team</span><span>Pick</span><span>Projected</span></div>
              {standings.map((player) => <div className="jack-lab-standing" key={player.id}><strong>#{player.rank}</strong><span>{player.name}<small>{ROAST_MODE_LABELS[player.humor]}</small></span><TeamMark code={player.favoriteTeam} /><span>{player.livePick}</span><b>{player.projectedScore}{player.movement !== 0 && <em className={player.movement > 0 ? 'up' : 'down'}>{player.movement > 0 ? `↑${player.movement}` : `↓${Math.abs(player.movement)}`}</em>}</b></div>)}
              <p className="jack-data-disclaimer">Projection only. Commissioner verification is required before winner or payout finalization.</p>
            </article>

            <article className="jack-lab-card jack-history-card">
              <CardHeader eyebrow="MEMORY" title="2025 season records" status="HISTORY" tone="neutral" />
              {JACK_DEMO_PLAYERS.map((player) => <div className="jack-history-row" key={player.id}><TeamMark code={player.favoriteTeam} /><div><strong>{player.name}</strong><span>{player.history.correct}–{player.history.incorrect} · {player.history.winPercentage}% · #{player.history.priorRank}</span></div><div><b>{player.history.pickSense}</b><small>Pick Sense</small></div></div>)}
              <p className="jack-data-disclaimer">Pick Sense is a fictional league metric based only on pick results. It is not a measure of intelligence.</p>
            </article>
          </section>

          <section className="jack-lab-card jack-personality-card">
            <CardHeader eyebrow="PLAYER-CONTROLLED HUMOR" title="Same facts. Four different settings." status="CONSENT ENFORCED" tone="live" />
            <div className="jack-personality-grid">{comments.map((comment) => <article className={`mode-${comment.mode}`} key={comment.playerId}><div><TeamMark code={JACK_DEMO_PLAYERS.find((player) => player.id === comment.playerId).favoriteTeam} /><span><strong>{comment.playerName}</strong><small>{comment.modeLabel}</small></span><b>{comment.targetedJoke ? 'OPTED IN' : 'PROTECTED'}</b></div><p>{comment.text}</p></article>)}</div>
          </section>

          <JackControlStudio settings={{ jack: jackSettings }} players={demoPlayers} auditLog={[]} winnerIds={scorePhase === 'after' ? ['player-avery'] : []} onSaveLeague={saveDemoJackSettings} onSavePlayer={saveDemoPlayerPolicy} demo />

          <section className="jack-lab-card jack-recap-card lab-recap">
            <div><img src="/jack.jpg" alt="" /><div><span className="eyebrow dark">HISTORY-AWARE RECAP</span><h2>Jack can remember without making things up.</h2></div></div>
            {!recap && <p>Generate a recap from the visible fixture score, projected standings, 2025 records, and four consent settings.</p>}
            {recap && <div className="jack-recap-output" role="status"><strong>{recap.title}</strong><p>{recap.body}</p><div>{recap.commentary.map((item) => <span key={item.playerId}>{item.playerName}: {item.modeLabel} ✓</span>)}</div><small>Chris protected · Admin review required · Fixture source</small></div>}
            <button className="button button-primary" type="button" disabled={recapBusy} onClick={makeRecap}>{recapBusy ? 'Jack is checking every fact…' : recap ? 'Regenerate recap' : 'Generate Jack’s recap →'}</button>
          </section>

          <section className="jack-lab-card jack-voice-card">
            <div className="jack-voice-heading"><div className={`jack-mic-orb ${voiceState === 'listening' ? 'listening' : ''}`}>⌁</div><div><span className="eyebrow dark">TALK TO JACK</span><h2>Ask by voice. Edit before sending.</h2><p>Browser speech recognition is used when available. Audio is never saved by this demo.</p></div></div>
            <form onSubmit={askVoiceQuestion}>
              <label htmlFor="jack-voice-transcript">Voice transcript</label><textarea id="jack-voice-transcript" value={voiceTranscript} onChange={(event) => setVoiceTranscript(event.target.value)} placeholder="Your transcript appears here for review…" />
              <div className="jack-voice-actions"><button className="button button-ghost-dark" type="button" onClick={startVoiceInput}>{voiceState === 'listening' ? 'Listening…' : 'Use microphone'}</button><button className="button button-ghost-dark" type="button" onClick={useDemoVoice}>Load demo voice question</button><button className="button button-primary" type="submit" disabled={!voiceTranscript.trim()}>Ask Jack →</button></div>
              {['unsupported', 'error'].includes(voiceState) && <p className="jack-voice-fallback" role="status">Voice recognition is unavailable here. The editable demo transcript keeps the feature accessible.</p>}
            </form>
            {voiceAnswer && <div className="jack-voice-conversation" role="status"><div className="user"><span>AJ</span><p>{voiceTranscript}</p><small>VOICE TRANSCRIPT · EDITED BEFORE SEND</small></div><div className="jack"><img src="/jack.jpg" alt="" /><p>{voiceAnswer.text}</p><small>FIXTURE FACTS · COMPETITIVE MODE · AUDIO NOT STORED</small></div><button className="button button-ghost-dark" type="button" onClick={readVoiceAnswer} disabled={jackSettings.voice.textOnly || !jackSettings.voice.enabled}>{voicePlayback === 'playing' ? 'Reading aloud…' : jackSettings.voice.textOnly ? 'Text-only mode active' : 'Read Jack’s answer aloud'}</button>{jackSettings.voice.captions && <small className="jack-caption-status">CAPTIONS ON · ORIGINAL HOST PROFILE · NO VOICE CLONING</small>}</div>}
          </section>
        </div>
      )}
    </div>
  );
}

function JackPortrait() {
  return <aside className="jack-portrait-card"><div className="jack-portrait-image"><img src="/jack.jpg" alt="Jack, the 405 league host" /><span>AI LEAGUE HOST</span></div><div><span className="eyebrow">MEET YOUR COMMISSIONER</span><h2>I’m Jack.</h2><p>I use visible facts, remembered league history, and the exact tone each player chose. If the data goes dark, I say so.</p></div></aside>;
}

function CardHeader({ eyebrow, title, status, tone }) {
  return <header className="jack-lab-card-header"><div><span>{eyebrow}</span><h2>{title}</h2></div><b className={tone}>{status}</b></header>;
}

function TeamMark({ code }) {
  return <span className="jack-team-mark"><img src={getTeamLogoUrl(code)} alt={`${code} logo`} /></span>;
}

function LabTeam({ code, score, home = false }) {
  return <div className={`jack-lab-team ${home ? 'home' : ''}`}><TeamMark code={code} /><span>{home ? 'HOME' : 'AWAY'}</span><strong>{code}</strong><b>{score}</b></div>;
}
