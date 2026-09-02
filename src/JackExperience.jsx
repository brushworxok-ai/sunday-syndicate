import { useEffect, useMemo, useState } from 'react';
import { getTeamLogoUrl, TEAMS } from './data.js';
import {
  JACK_AVATAR_STATES,
  JACK_ROAST_LABELS,
  JACK_ROAST_LEVELS,
  moderateJackMessage,
  nextJackAvatarState,
  normalizeJackSettings,
  normalizePlayerJackPolicy,
  previewJackRoast,
  resolveJackRoastPolicy,
} from './jackHost.js';

const STATE_LABELS = {
  idle: 'Ready', listening: 'Listening', thinking: 'Checking facts', talking: 'Talking',
  roast: 'Roast mode', winner: 'Winner moment', shock: 'Breaking update', live: 'Live board', error: 'Data unavailable',
};

/* Animated video loops per avatar state. Talking-family states share the
   animated delivery loop; everything else breathes on the idle loop. The
   static photo stays as the instant fallback if a video can't load. */
const AVATAR_VIDEO_BY_STATE = {
  talking: '/jack-talking.mp4', roast: '/jack-talking.mp4', winner: '/jack-talking.mp4', shock: '/jack-talking.mp4',
  idle: '/jack-idle.mp4', listening: '/jack-idle.mp4', thinking: '/jack-idle.mp4', live: '/jack-idle.mp4', error: '/jack-idle.mp4',
};

export function JackAvatar({ state = 'idle', settings, compact = false, caption }) {
  const jack = normalizeJackSettings(settings);
  const [videoFailed, setVideoFailed] = useState(false);
  const resolved = nextJackAvatarState(state, {
    animationEnabled: jack.animation.enabled,
    reducedMotion: jack.animation.reducedMotion,
  });
  const label = caption || STATE_LABELS[resolved.state];
  const prefersStill = jack.animation.reducedMotion || !jack.animation.enabled;
  const videoSrc = !prefersStill && !videoFailed ? AVATAR_VIDEO_BY_STATE[resolved.state] : null;
  return <figure className={`jack-avatar jack-avatar-${resolved.state} ${resolved.motion} ${compact ? 'compact' : ''}`} data-state={resolved.state} aria-label={`Jack is ${label.toLowerCase()}`}>
    <div className="jack-avatar-frame">
      <span className="jack-avatar-aura" aria-hidden="true" />
      {videoSrc
        ? <video key={videoSrc} src={videoSrc} poster="/jack.jpg" autoPlay loop muted playsInline onError={() => setVideoFailed(true)} aria-label="Jack, the 405 league host" />
        : <img src="/jack.jpg" alt="Jack, the 405 league host" />}
      <span className="jack-avatar-scan" aria-hidden="true" />
      <span className="jack-avatar-expression" aria-hidden="true">{resolved.state === 'winner' ? '♛' : resolved.state === 'shock' ? '!' : resolved.state === 'error' ? '×' : '●'}</span>
    </div>
    <figcaption><i aria-hidden="true" />{label}</figcaption>
    {['listening', 'talking', 'roast', 'winner', 'shock'].includes(resolved.state) && <span className="jack-avatar-wave" aria-hidden="true">{Array.from({ length: 7 }, (_, index) => <i key={index} />)}</span>}
    {resolved.state === 'thinking' && <span className="jack-avatar-dots" aria-hidden="true"><i /><i /><i /></span>}
  </figure>;
}

export default function JackControlStudio({ settings, players = [], auditLog = [], winnerIds = [], onSaveLeague, onSavePlayer, demo = false }) {
  const normalized = useMemo(() => normalizeJackSettings(settings), [settings]);
  const [leagueDraft, setLeagueDraft] = useState(normalized);
  const [playerDrafts, setPlayerDrafts] = useState(() => createPlayerDrafts(players));
  const [selectedPlayerId, setSelectedPlayerId] = useState(players[0]?.id ?? '');
  const [avatarState, setAvatarState] = useState('idle');
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => setLeagueDraft(normalized), [normalized]);
  useEffect(() => {
    setPlayerDrafts(createPlayerDrafts(players));
    setSelectedPlayerId((current) => players.some((player) => player.id === current) ? current : players[0]?.id ?? '');
  }, [players]);

  const selectedPlayer = players.find((player) => player.id === selectedPlayerId);
  const selectedDraft = selectedPlayer ? { ...selectedPlayer, jackPolicy: playerDrafts[selectedPlayer.id] } : null;
  const selectedPolicy = selectedDraft ? resolveJackRoastPolicy({
    player: selectedDraft,
    leagueSettings: { jack: leagueDraft },
    isWinner: winnerIds.includes(selectedDraft.id),
  }) : null;

  const updateLeague = (key, value) => setLeagueDraft((current) => ({ ...current, [key]: value }));
  const updateVoice = (key, value) => setLeagueDraft((current) => ({ ...current, voice: { ...current.voice, [key]: value } }));
  const updateAnimation = (key, value) => setLeagueDraft((current) => ({ ...current, animation: { ...current.animation, [key]: value } }));
  const updatePlayer = (playerId, key, value) => setPlayerDrafts((current) => ({ ...current, [playerId]: { ...current[playerId], [key]: value } }));

  const saveLeague = async () => {
    setSaving('league');
    try {
      await onSaveLeague?.(leagueDraft);
      setMessage(demo ? 'Demo policy updated locally.' : 'Jack’s league policy is saved and audited.');
    } finally { setSaving(''); }
  };

  const savePlayer = async (playerId) => {
    setSaving(playerId);
    try {
      await onSavePlayer?.(playerId, playerDrafts[playerId]);
      setMessage(demo ? 'Demo player limit updated locally.' : 'Saved. A player can still dial Jack down in their own profile.');
    } finally { setSaving(''); }
  };

  const runPreview = () => {
    if (!selectedDraft) return;
    const fact = { correct: 7, incorrect: 5 };
    const result = previewJackRoast({ player: selectedDraft, leagueSettings: { jack: leagueDraft }, isWinner: winnerIds.includes(selectedDraft.id), fact });
    const requestedLevel = selectedPolicy?.effectiveLevel === 'off' ? 'clean' : selectedPolicy.effectiveLevel;
    const moderation = moderateJackMessage({
      text: result.text,
      targetPlayer: selectedDraft,
      leagueSettings: { jack: leagueDraft },
      requestedLevel,
      isWinner: winnerIds.includes(selectedDraft.id),
      groundedFactIds: ['preview-score'],
      availableFactIds: ['preview-score'],
    });
    setPreview({ ...result, moderation });
    setAvatarState(result.state === 'protected' ? 'idle' : result.state);
  };

  return <section className="jack-control-studio">
    <header className="jack-control-header">
      <div><span className="eyebrow">JACK CONTROL BOOTH</span><h2>Commissioner energy. Player-owned limits.</h2><p>The effective level is always the strictest of platform safety, commissioner policy, and the player’s active consent.</p></div>
      <JackAvatar state={avatarState} settings={{ jack: leagueDraft }} compact />
    </header>

    <div className="jack-policy-chain" aria-label="Policy priority">
      <span><b>01</b> Platform safety</span><i>→</i><span><b>02</b> Commissioner cap</span><i>→</i><span><b>03</b> Player consent</span><strong>Strictest wins</strong>
    </div>

    <div className="jack-control-grid">
      <article className="jack-control-panel">
        <div className="jack-control-title"><div><small>LEAGUE POLICY</small><h3>Master controls</h3></div><span className={leagueDraft.enabled ? 'on' : ''}>{leagueDraft.enabled ? 'Jack on' : 'Jack off'}</span></div>
        <Toggle label="Enable Jack" detail="Turns commentary on without changing player consent." checked={leagueDraft.enabled} onChange={(value) => updateLeague('enabled', value)} />
        <Toggle label="Private adult league" detail="Required before adult language can be considered." checked={leagueDraft.privateAdultSpace} onChange={(value) => updateLeague('privateAdultSpace', value)} />
        <Toggle label="Require 18+ confirmation" detail="Adult settings downgrade to PG-13 until confirmed." checked={leagueDraft.ageGateRequired} onChange={(value) => updateLeague('ageGateRequired', value)} />
        <Toggle label="Winner celebrations" detail="Winners receive praise and automatic roast immunity." checked={leagueDraft.winnerCelebrations} onChange={(value) => updateLeague('winnerCelebrations', value)} />
        <label className="jack-field">League roast ceiling<select value={leagueDraft.globalRoastCap} onChange={(event) => updateLeague('globalRoastCap', event.target.value)}>{JACK_ROAST_LEVELS.map((level) => <option key={level} value={level}>{JACK_ROAST_LABELS[level]}</option>)}</select></label>
        <label className="jack-field">Profanity<select value={leagueDraft.profanityLevel} onChange={(event) => updateLeague('profanityLevel', event.target.value)}><option value="off">Off</option><option value="mild">Mild only</option><option value="adult">Adult when fully permitted</option></select></label>
        <button className="button button-primary full" type="button" onClick={saveLeague} disabled={saving === 'league'}>{saving === 'league' ? 'Saving…' : demo ? 'Apply demo controls' : 'Save league policy'}</button>
      </article>

      <article className="jack-control-panel jack-voice-console">
        <div className="jack-control-title"><div><small>VOICE + ACCESSIBILITY</small><h3>Original host profile</h3></div><span className={leagueDraft.voice.enabled ? 'on' : ''}>{leagueDraft.voice.textOnly ? 'Text only' : 'Voice ready'}</span></div>
        <p className="jack-control-note">Deep, warm, original host direction. It does not clone or imitate a real person. Browser speech is the safe no-key fallback.</p>
        <Toggle label="Voice playback" detail="Allow Jack responses to be read aloud." checked={leagueDraft.voice.enabled} onChange={(value) => updateVoice('enabled', value)} />
        <Toggle label="Captions" detail="Keep every spoken line visible as text." checked={leagueDraft.voice.captions} onChange={(value) => updateVoice('captions', value)} />
        <Toggle label="Text-only mode" detail="Disables voice and autoplay immediately." checked={leagueDraft.voice.textOnly} onChange={(value) => updateVoice('textOnly', value)} />
        <Toggle label="Reduced motion" detail="Preserves state changes without animation." checked={leagueDraft.animation.reducedMotion} onChange={(value) => updateAnimation('reducedMotion', value)} />
        <label className="jack-range">Volume <output>{Math.round(leagueDraft.voice.volume * 100)}%</output><input type="range" min="0" max="1" step="0.05" value={leagueDraft.voice.volume} onChange={(event) => updateVoice('volume', Number(event.target.value))} /></label>
        <label className="jack-range">Speech speed <output>{Number(leagueDraft.voice.speed).toFixed(2)}×</output><input type="range" min="0.7" max="1.3" step="0.02" value={leagueDraft.voice.speed} onChange={(event) => updateVoice('speed', Number(event.target.value))} /></label>
        <div className="jack-state-picker" aria-label="Preview Jack animation states">{JACK_AVATAR_STATES.map((state) => <button className={avatarState === state ? 'active' : ''} type="button" key={state} onClick={() => setAvatarState(state)}>{STATE_LABELS[state]}</button>)}</div>
      </article>
    </div>

    <article className="jack-control-panel jack-player-limits">
      <div className="jack-control-title"><div><small>PLAYER LIMITS</small><h3>Admin assignments can never exceed consent</h3></div><span>{players.length} players</span></div>
      <div className="jack-player-policy-grid">{players.map((player) => {
        const draft = playerDrafts[player.id] ?? normalizePlayerJackPolicy(player);
        const policyPlayer = { ...player, jackPolicy: draft };
        const resolved = resolveJackRoastPolicy({ player: policyPlayer, leagueSettings: { jack: leagueDraft }, isWinner: winnerIds.includes(player.id) });
        return <article key={player.id} className={resolved.winnerProtected ? 'winner-protected' : ''}>
          <div className="jack-player-identity"><span><img src={getTeamLogoUrl(player.favoriteTeam || draft.favoriteTeam)} alt="" /></span><div><strong>{player.name}</strong><small>{TEAMS[player.favoriteTeam || draft.favoriteTeam] || 'Favorite team not set'}</small></div>{resolved.winnerProtected && <b>WINNER IMMUNITY</b>}</div>
          <label>Commissioner assignment<select value={draft.adminAssignedLevel} onChange={(event) => updatePlayer(player.id, 'adminAssignedLevel', event.target.value)}>{JACK_ROAST_LEVELS.map((level) => <option key={level} value={level}>{JACK_ROAST_LABELS[level]}</option>)}</select></label>
          <div className="jack-effective-policy"><span>Player consent <b>{JACK_ROAST_LABELS[draft.playerConsentLevel]}</b></span><span>Effective <b>{resolved.effectiveLabel}</b></span><span>Adult ready <b>{resolved.adultSpaceReady ? 'Yes' : 'No'}</b></span></div>
          <Toggle label="Roast enabled" detail="Admin can lower or disable; only the player can raise consent." checked={draft.roastEnabled} onChange={(value) => updatePlayer(player.id, 'roastEnabled', value)} />
          <button type="button" onClick={() => savePlayer(player.id)} disabled={saving === player.id}>{saving === player.id ? 'Saving…' : 'Save player limit'}</button>
        </article>;
      })}</div>
    </article>

    <div className="jack-preview-grid">
      <article className="jack-control-panel jack-preview-console">
        <div className="jack-control-title"><div><small>SAFE PREVIEW</small><h3>Test before anyone hears it</h3></div><span>7–5 fixture</span></div>
        <label className="jack-field">Preview player<select value={selectedPlayerId} onChange={(event) => { setSelectedPlayerId(event.target.value); setPreview(null); }}>{players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>
        {selectedPolicy && <div className="jack-preview-policy"><strong>{selectedPolicy.effectiveLabel}</strong><span>{selectedPolicy.strictestLimit}</span><small>{selectedPolicy.winnerProtected ? 'Winner immunity is active.' : selectedPolicy.adultSpaceReady ? 'Adult safeguards satisfied.' : 'Adult content automatically downgraded.'}</small></div>}
        <button className="button button-primary full" type="button" onClick={runPreview}>Run moderated preview</button>
        {preview && <div className={`jack-preview-output ${preview.moderation.decision}`} role="status"><span>{preview.moderation.decision}</span><p>{preview.text}</p><small>{preview.moderation.reason ? preview.moderation.reason.replaceAll('_', ' ') : 'Grounded in preview-score · no protected topic detected'}</small></div>}
      </article>
      <article className="jack-control-panel jack-audit-preview">
        <div className="jack-control-title"><div><small>AUDIT TRAIL</small><h3>Recent Jack decisions</h3></div><span>Traceable</span></div>
        <ol>{auditLog.filter((item) => String(item.event).startsWith('jack.')).slice(-5).reverse().map((item) => <li key={item.id ?? `${item.at}-${item.event}`}><time>{new Date(item.at).toLocaleString()}</time><strong>{item.event.replace('jack.', '').replaceAll('_', ' ')}</strong><p>{item.detail}</p></li>)}</ol>
        {!auditLog.some((item) => String(item.event).startsWith('jack.')) && <p className="jack-control-empty">No policy changes yet. The first saved control creates an immutable admin audit entry.</p>}
      </article>
    </div>
    {message && <p className="jack-control-success" role="status">✓ {message}</p>}
  </section>;
}

function createPlayerDrafts(players) {
  return Object.fromEntries(players.map((player) => [player.id, normalizePlayerJackPolicy(player)]));
}

function Toggle({ label, detail, checked, onChange }) {
  return <label className="jack-toggle"><span><strong>{label}</strong><small>{detail}</small></span><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} /><i aria-hidden="true" /></label>;
}
