import { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';

class ErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('App crash:', error, info?.componentStack); }
  render() {
    if (this.state.error) return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#fff', background: '#111', minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem' }}>
        <h1 style={{ fontSize: '1.5rem' }}>Something went wrong</h1>
        <p style={{ color: '#aaa', maxWidth: '24rem' }}>{this.state.error?.message || 'An unexpected error occurred.'}</p>
        <button type="button" onClick={() => { this.setState({ error: null }); window.location.reload(); }} style={{ padding: '0.75rem 1.5rem', background: '#00ff87', color: '#000', border: 'none', borderRadius: '8px', fontWeight: 600, cursor: 'pointer' }}>Reload App</button>
      </div>
    );
    return this.props.children;
  }
}
import { EMOJIS, ENTRY_FEE, SCHEDULE, SEASON, WEEK, getGames, getWeek, getByeTeams, getCurrentWeek, getWeekDeadline, isWeekLocked, formatCountdown, TEAMS, TEAM_COLORS, getTeamLogoUrl } from './data.js';
import { DEMO_CHAT, DEMO_LEAGUE } from './demoLeague.js';
import JackControlStudio, { JackAvatar } from './JackExperience.jsx';
import { buildWinningPaths } from './winningPaths.js';
import { deriveSurvivorPool, findTeamGame } from './survivor.js';

/* ── Simplified 5-tab nav with More menu ── */
const MAIN_NAV = [
  ['home',    'Home',    '🏠'],
  ['picks',   'Picks',   '🏈'],
  ['results', 'Board',   '📊'],
  ['chat',    'Chat',    '💬'],
  ['more',    'More',    '☰'],
];

const MORE_ITEMS = [
  ['season',   'Season',           '🏆', 'Full-season standings & payouts'],
  ['survivor', 'Survivor',         '🛡️', "One team a week. Lose once, you're out."],
  ['entries',  'Locked Entries',   '📋', 'View submitted pick sheets'],
  ['players',  'Player Settings',  '👤', 'Preferences & consent'],
  ['bets',     'Side Bets',        '🎲', 'Challenge your crew'],
  ['ai',       'AI Tools',         '✦',  'Gemini-powered insights'],
  ['rules',    'House Rules',      '📖', 'The fine print'],
  ['demo',     'Demo Proof',       '🔍', 'Acceptance scenario'],
  ['admin',    'Commissioner',     '🔒', 'Admin controls'],
];

const PRESET_AVATARS = ['🏈', '🔥', '💰', '👑', '🦅', '🐻', '🐅', '🐬', '🐎', '🐺', '🦁', '⚡'];

const LEAGUE_ID = 'league-sunday-syndicate-demo';

async function apiRequest(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Request failed (${response.status}).`);
  return data;
}

function App() {
  const [view, setView] = useState('home');
  const [showMore, setShowMore] = useState(false);
  const [showWelcome, setShowWelcome] = useState(false);
  const [welcomeMode, setWelcomeMode] = useState('join'); // 'join' or 'signin'
  const [signupName, setSignupName] = useState('');
  const [signupPhone, setSignupPhone] = useState('');
  const [signupPin, setSignupPin] = useState('');
  const [signupTeam, setSignupTeam] = useState('');
  const [signupAvatar, setSignupAvatar] = useState('');
  const [signupAvatarFile, setSignupAvatarFile] = useState(null);
  const [signupStep, setSignupStep] = useState(1); // 1: info, 2: team+avatar
  const [name, setName] = useState('');
  const [handle, setHandle] = useState('');
  const [picks, setPicks] = useState({});
  const [tiebreaker, setTiebreaker] = useState('');
  const [paid, setPaid] = useState(false);
  const [sheets, setSheets] = useState(DEMO_LEAGUE.sheets);
  const [results, setResults] = useState(DEMO_LEAGUE.results);
  const [chatMsgs, setChatMsgs] = useState(DEMO_CHAT);
  const [rolloverPot, setRolloverPot] = useState(0);
  const [serverLeague, setServerLeague] = useState(null);
  const [serverBusy, setServerBusy] = useState('');
  const [serverError, setServerError] = useState('');
  const [chatInput, setChatInput] = useState('');
  const [chatName, setChatName] = useState('');
  const [showEmoji, setShowEmoji] = useState(false);
  const [isComm, setIsComm] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [playerSession, setPlayerSession] = useState({ authenticated: false, playerId: null, name: null });
  const [playerLogin, setPlayerLogin] = useState({ playerId: 'player-marcus', pin: '' });
  const [toast, setToast] = useState('');
  const [aiStatus, setAiStatus] = useState({ checked: false, configured: false, model: '', database: '', smsProvider: 'demo', twilioConfigured: false });
  const [aiResult, setAiResult] = useState({ recap: DEMO_LEAGUE.recap.finalText, picks: '', trashTalk: '' });
  const [aiLoading, setAiLoading] = useState('');
  const [aiError, setAiError] = useState('');
  const [trashTone, setTrashTone] = useState('playful');
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantInput, setAssistantInput] = useState('');
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantSpeaking, setAssistantSpeaking] = useState('');
  const [assistantMessages, setAssistantMessages] = useState([{
    id: 'assistant-welcome', role: 'assistant',
    text: "Hey, I'm Jack — your league assistant. Ask me about standings, rules, your picks, or anything else about the league.",
  }]);
  const assistantEndRef = useRef(null);
  const [jackAvatarState, setJackAvatarState] = useState('idle');
  const [selectedWeek, setSelectedWeek] = useState(WEEK);
  const [liveScores, setLiveScores] = useState({ week: null, anyLive: false, scores: [] });
  const [nflNews, setNflNews] = useState({ items: [] });
  const [nflInjuries, setNflInjuries] = useState({ teams: [] });
  const [nowTick, setNowTick] = useState(() => Date.now());
  const currentGames = useMemo(() => getGames(selectedWeek), [selectedWeek]);
  const currentByeTeams = useMemo(() => getByeTeams(selectedWeek), [selectedWeek]);
  const weekLabel = useMemo(() => getWeek(selectedWeek)?.label ?? `Week ${selectedWeek}`, [selectedWeek]);
  const [betForm, setBetForm] = useState({ creatorId: 'player-marcus', opponentId: 'player-taylor', event: `Week ${selectedWeek} final pick score`, terms: 'Higher verified weekly score wins', settlementRule: 'compare_weekly_score', stakeType: 'virtual_tokens', stakeAmount: 10, stakeLabel: '10 Syndicate tokens', optionalMessage: '' });
  const [recapEdit, setRecapEdit] = useState(DEMO_LEAGUE.recap.finalText);

  const loadLeague = useCallback(async () => {
    try {
      const league = await apiRequest(`/api/leagues/${LEAGUE_ID}`);
      setServerLeague(league);
      setSheets(league.sheets);
      setResults(league.results);
      setChatMsgs(league.chat);
      if (league.latestRecap?.finalText) {
        setAiResult((current) => ({ ...current, recap: league.latestRecap.finalText }));
        setRecapEdit(league.latestRecap.finalText);
      }
      setServerError('');
      return league;
    } catch (error) {
      setServerError(error.message);
      return null;
    }
  }, []);

  useEffect(() => {
    apiRequest('/api/health')
      .then((data) => setAiStatus({ checked: true, configured: data.geminiConfigured, model: data.model, database: data.database, smsProvider: data.smsProvider, twilioConfigured: data.twilioConfigured }))
      .catch(() => setAiStatus({ checked: true, configured: false, model: '', database: '', smsProvider: 'offline', twilioConfigured: false }));
    apiRequest('/api/auth/status').then((status) => setIsComm(status.authenticated)).catch(() => {});
    apiRequest('/api/auth/player/status').then(setPlayerSession).catch(() => {});
    loadLeague();
  }, [loadLeague]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(''), 2800);
    return () => clearTimeout(timer);
  }, [toast]);

  // NFL Wire: injuries, statuses, team news (refreshes every 10 minutes)
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      apiRequest('/api/nfl-news').then((data) => { if (!cancelled) setNflNews(data); }).catch(() => {});
      apiRequest('/api/nfl-injuries').then((data) => { if (!cancelled) setNflInjuries(data); }).catch(() => {});
    };
    load();
    const timer = setInterval(load, 600_000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  // Deadline countdown ticker (30s)
  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Live scores: fetch on week change, then poll — every 30s while games are
  // in progress, every 3 minutes otherwise.
  useEffect(() => {
    let cancelled = false;
    let timer = null;
    const poll = async () => {
      try {
        const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/live-scores?week=${selectedWeek}`);
        if (cancelled) return;
        setLiveScores(data);
        // The server auto-verifies finals from the feed — refresh standings when new ones land.
        if (data.autoVerified > 0) loadLeague();
        timer = setTimeout(poll, data.anyLive ? 30_000 : 180_000);
      } catch {
        if (!cancelled) timer = setTimeout(poll, 180_000);
      }
    };
    poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [selectedWeek]);

  const weekDeadline = useMemo(() => getWeekDeadline(selectedWeek), [selectedWeek]);
  const weekLocked = useMemo(() => isWeekLocked(selectedWeek, new Date(nowTick)), [selectedWeek, nowTick]);
  const deadlineCountdown = useMemo(() => formatCountdown(weekDeadline, new Date(nowTick)), [weekDeadline, nowTick]);
  const liveByGame = useMemo(() => Object.fromEntries((liveScores.scores ?? []).map((s) => [s.gameId, s])), [liveScores]);

  const weekSheets = useMemo(() => sheets.filter((sheet) => sheet.week === selectedWeek), [sheets, selectedWeek]);
  const completedGames = Object.values(results).filter((result) => result.winner).length;
  const pot = weekSheets.filter((sheet) => sheet.paid).length * ENTRY_FEE;
  const totalPot = pot + Number(rolloverPot || 0);

  const calcScore = (sheet) => Object.entries(sheet.picks).reduce(
    (score, [gameId, pick]) => score + (results[gameId]?.winner === pick ? 1 : 0),
    0,
  );

  const leaderboard = useMemo(() => weekSheets
    .map((sheet) => ({ ...sheet, score: calcScore(sheet) }))
    .sort((a, b) => b.score - a.score || a.tiebreaker - b.tiebreaker), [weekSheets, results]);

  // Exact clinch / alive / eliminated math for the current week
  const winPathsByEntry = useMemo(() => {
    if (!weekSheets.length) return {};
    const snapshot = buildWinningPaths(
      { players: serverLeague?.players ?? DEMO_LEAGUE.players, sheets: weekSheets, results },
      { week: selectedWeek, games: currentGames },
    );
    return Object.fromEntries(snapshot.paths.map((p) => [p.entryId ?? p.playerId ?? p.name, p]));
  }, [weekSheets, results, selectedWeek, currentGames, serverLeague]);

  // Season-long stats: weekly wins, totals, earnings, payout status
  const seasonStats = useMemo(() => {
    const weeks = [...new Set(sheets.map((s) => s.week))].sort((a, b) => a - b);
    const players = new Map();
    const weekSummaries = [];
    for (const week of weeks) {
      const ws = sheets.filter((s) => s.week === week);
      const games = getGames(week);
      const complete = games.length > 0 && games.every((g) => results[g.id]?.winner);
      const scored = ws.map((s) => ({ ...s, score: calcScore(s) })).sort((a, b) => b.score - a.score || a.tiebreaker - b.tiebreaker);
      const top = scored[0];
      const winners = complete && top ? scored.filter((s) => s.score === top.score && s.tiebreaker === top.tiebreaker) : [];
      const weekPot = ws.filter((s) => s.paid).length * ENTRY_FEE;
      const payout = (serverLeague?.payouts ?? []).find((p) => p.week === week && (p.pool ?? 'weekly') === 'weekly');
      weekSummaries.push({ week, entries: ws.length, pot: weekPot, complete, winners: winners.map((w) => w.name), topScore: top?.score ?? 0, paid: Boolean(payout), payout });
      for (const s of scored) {
        const key = s.playerId ?? s.name;
        if (!players.has(key)) players.set(key, { key, name: s.name, weeksPlayed: 0, totalCorrect: 0, totalPicks: 0, weeklyWins: 0, earnings: 0 });
        const row = players.get(key);
        row.weeksPlayed += 1;
        row.totalCorrect += s.score;
        row.totalPicks += Object.keys(s.picks).length;
        if (winners.some((w) => (w.playerId ?? w.name) === key)) { row.weeklyWins += 1; row.earnings += weekPot / winners.length; }
      }
    }
    const table = [...players.values()]
      .map((row) => ({ ...row, winPct: row.totalPicks ? Math.round((row.totalCorrect / row.totalPicks) * 1000) / 10 : 0 }))
      .sort((a, b) => b.weeklyWins - a.weeklyWins || b.totalCorrect - a.totalCorrect || a.name.localeCompare(b.name));
    return { weeks: weekSummaries, table };
  }, [sheets, results, serverLeague]);

  // Survivor pool (derived — never stored)
  const survivorPool = useMemo(
    () => deriveSurvivorPool({ survivorPicks: serverLeague?.survivorPicks ?? [], players: serverLeague?.players ?? DEMO_LEAGUE.players, results }),
    [serverLeague, results],
  );
  const [survivorTeam, setSurvivorTeam] = useState('');

  const entryContext = leaderboard.map((entry) => {
    const player = (serverLeague?.players ?? DEMO_LEAGUE.players).find((candidate) => candidate.id === entry.playerId);
    return {
      id: entry.playerId || entry.id,
      name: entry.name,
      score: entry.score,
      tiebreaker: entry.tiebreaker,
      pickCount: Object.keys(entry.picks).length,
      roastLevel: player?.trashTalk.level ?? 'none',
      roastEligible: Boolean(player && player.trashTalk.level !== 'none'),
    };
  });

  const gameContext = currentGames.map((game) => ({ ...game, ...results[game.id] }));
  const proofLeague = serverLeague ?? { ...DEMO_LEAGUE, latestRecap: DEMO_LEAGUE.recap, latestBroadcast: DEMO_LEAGUE.broadcast, recaps: [DEMO_LEAGUE.recap], broadcasts: [DEMO_LEAGUE.broadcast], chat: DEMO_CHAT };
  const demoPlayerName = (playerId) => proofLeague.players.find((player) => player.id === playerId)?.name ?? 'Unknown player';

  const notify = (message) => setToast(message);

  const ensureAdmin = async () => {
    if (isComm) return true;
    setView('admin');
    notify('Sign in as commissioner to complete that action.');
    return false;
  };

  const loginAdmin = async (event) => {
    event.preventDefault();
    setServerBusy('admin-login');
    try {
      await apiRequest('/api/auth/admin', { method: 'POST', body: JSON.stringify({ password: adminPassword }) });
      setIsComm(true);
      setAdminPassword('');
      notify('Commissioner session active for eight hours.');
    } catch (error) {
      notify(error.message);
    } finally { setServerBusy(''); }
  };


  const choosePick = (gameId, team) => {
    setPicks((current) => {
      const next = { ...current };
      if (next[gameId] === team) delete next[gameId];
      else next[gameId] = team;
      return next;
    });
  };

  const submit = async () => {
    if (weekLocked) return notify(`${weekLabel} is locked — sheets were due before the first kickoff.`);
    if (!name.trim()) return notify('Add your name before locking in.');
    if (Object.keys(picks).length !== currentGames.length) return notify(`Finish all ${currentGames.length} picks first.`);
    if (!tiebreaker || Number(tiebreaker) < 0) return notify('Add a valid tiebreaker total.');
    if (!paid) return notify('Confirm your payment first.');

    setServerBusy('entry');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/entries`, { method: 'POST', body: JSON.stringify({ name: name.trim(), handle: handle.trim(), picks, tiebreaker: Number(tiebreaker), paid, week: selectedWeek }) });
      await loadLeague();
      setName(''); setHandle(''); setPicks({}); setTiebreaker(''); setPaid(false);
      notify('Picks locked in and saved to the league database.');
      setView('entries');
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const sendChat = async () => {
    if (!chatName.trim()) return notify('Add your chat name first.');
    if (!chatInput.trim()) return;
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/chat`, { method: 'POST', body: JSON.stringify({ name: chatName.trim(), msg: chatInput.trim() }) });
      await loadLeague();
      setChatInput('');
      setAiResult((current) => ({ ...current, trashTalk: '' }));
    } catch (error) { notify(error.message); }
  };

  const askGemini = async (action, payload, resultKey) => {
    setAiLoading(resultKey);
    setAiError('');
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, payload }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Gemini request failed.');
      setAiResult((current) => ({ ...current, [resultKey]: data.text }));
      return data.text;
    } catch (error) {
      setAiError(error.message);
      return '';
    } finally {
      setAiLoading('');
    }
  };

  const getRecap = () => askGemini('recap', {
    week: selectedWeek,
    pot: totalPot,
    rollover: Number(rolloverPot || 0),
    entries: entryContext,
    players: proofLeague.players.map((player) => ({ id: player.id, name: player.name, roastLevel: player.trashTalk.level })),
    games: gameContext,
  }, 'recap');

  const analyzePicks = () => askGemini('picks', {
    week: selectedWeek,
    totalGames: currentGames.length,
    tiebreaker,
    picks: currentGames.map((game) => ({ ...game, selection: picks[game.id] })),
  }, 'picks');

  const draftTrashTalk = async () => {
    const text = await askGemini('trashTalk', {
      author: chatName,
      tone: trashTone,
      entries: entryContext,
      players: proofLeague.players.map((player) => ({ id: player.id, name: player.name, roastLevel: player.trashTalk.level })),
      seed: chatInput,
    }, 'trashTalk');
    if (text) setChatInput(text);
  };

  const askAssistant = async (question) => {
    const q = (question || assistantInput).trim();
    if (!q || assistantBusy) return;
    const userMsg = { id: `user-${Date.now()}`, role: 'user', text: q };
    setAssistantMessages((prev) => [...prev, userMsg]);
    setAssistantInput('');
    setAssistantBusy(true);
    setJackAvatarState('thinking');
    try {
      const history = assistantMessages.filter((m) => m.id !== 'assistant-welcome').slice(-6).map((m) => ({ role: m.role, text: m.text }));
      const response = await fetch(`/api/leagues/${LEAGUE_ID}/assistant`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q, history, playerId: playerSession.playerId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Assistant request failed.');
      const reply = { id: `assistant-${Date.now()}`, role: 'assistant', text: data.text };
      setAssistantMessages((prev) => [...prev, reply]);
      setJackAvatarState('talking');
      setTimeout(() => { assistantEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, 100);
      // Auto-speak Jack's response
      readAssistantMessage(data.text);
    } catch (error) {
      setAssistantMessages((prev) => [...prev, { id: `error-${Date.now()}`, role: 'assistant', text: `Sorry, I couldn't answer that right now. ${error.message}` }]);
      setJackAvatarState('error');
      setTimeout(() => setJackAvatarState('idle'), 3000);
    } finally {
      setAssistantBusy(false);
    }
  };

  const jackAudioRef = useRef(null);

  const speakWithBrowser = (text) => {
    if (!('speechSynthesis' in window)) { setAssistantSpeaking(''); setJackAvatarState('idle'); return; }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.95;
    utterance.pitch = 0.85;
    utterance.onend = () => { setAssistantSpeaking(''); setJackAvatarState('idle'); };
    utterance.onerror = () => { setAssistantSpeaking(''); setJackAvatarState('idle'); };
    setJackAvatarState('talking');
    window.speechSynthesis.speak(utterance);
  };

  const readAssistantMessage = async (text) => {
    if (!text || assistantSpeaking) return;
    setAssistantSpeaking(text.slice(0, 40));
    // Try Jack's real voice first (server-side ElevenLabs); fall back to the browser voice.
    try {
      const response = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.slice(0, 1200) }),
      });
      if (response.ok && (response.headers.get('content-type') || '').startsWith('audio/')) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        jackAudioRef.current = audio;
        audio.onended = () => { setAssistantSpeaking(''); setJackAvatarState('idle'); URL.revokeObjectURL(url); jackAudioRef.current = null; };
        audio.onerror = () => { setAssistantSpeaking(''); setJackAvatarState('idle'); URL.revokeObjectURL(url); jackAudioRef.current = null; };
        await audio.play();
        return;
      }
    } catch { /* fall through to browser voice */ }
    speakWithBrowser(text);
  };

  const stopSpeaking = () => {
    if (jackAudioRef.current) { jackAudioRef.current.pause(); jackAudioRef.current = null; }
    window.speechSynthesis?.cancel();
    setAssistantSpeaking('');
  };

  const JACK_QUICK_PROMPTS = [
    "What are the standings?",
    "How does scoring work?",
    "Who's winning this week?",
    "What are the house rules?",
  ];

  const navigate = (target) => {
    if (target === 'more') {
      setShowMore(true);
      return;
    }
    setShowMore(false);
    setView(target);
  };

  const updatePreferences = async (playerId, changes) => {
    if (playerSession.playerId !== playerId) return notify('Sign in as this player to change their preferences.');
    setServerBusy(`player-${playerId}`);
    try {
      await apiRequest(`/api/players/${playerId}/preferences`, { method: 'PATCH', body: JSON.stringify(changes) });
      await loadLeague();
      notify('Preferences saved with a new consent record.');
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const loginPlayer = async (event) => {
    event.preventDefault();
    setServerBusy('player-login');
    try {
      const session = await apiRequest('/api/auth/player', { method: 'POST', body: JSON.stringify(playerLogin) });
      setPlayerSession(session);
      setBetForm((current) => ({ ...current, creatorId: session.playerId, opponentId: current.opponentId === session.playerId ? proofLeague.players.find((player) => player.id !== session.playerId)?.id ?? '' : current.opponentId }));
      setPlayerLogin((current) => ({ ...current, pin: '' }));
      notify(`Signed in as ${session.name}.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const logoutPlayer = async () => {
    await apiRequest('/api/auth/player', { method: 'DELETE' });
    setPlayerSession({ authenticated: false, playerId: null, name: null });
    notify('Player session ended.');
  };

  const createBet = async (event) => {
    event.preventDefault();
    if (!playerSession.authenticated) return notify('Sign in as a player before creating a side bet.');
    setServerBusy('create-bet');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/side-bets`, { method: 'POST', body: JSON.stringify({ ...betForm, creatorId: playerSession.playerId }) });
      await loadLeague();
      notify('Side-bet proposal sent privately to the opponent.');
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const respondBet = async (bet, decision) => {
    if (playerSession.playerId !== bet.opponentId) return notify('Only the invited opponent can respond.');
    setServerBusy(`bet-${bet.id}`);
    try {
      await apiRequest(`/api/side-bets/${bet.id}/respond`, { method: 'POST', body: JSON.stringify({ decision }) });
      await loadLeague();
      notify(`Side bet ${decision === 'accept' ? 'accepted and locked' : 'declined'}.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const settleBet = async (betId) => {
    if (!(await ensureAdmin())) return;
    setServerBusy(`bet-${betId}`);
    try {
      await apiRequest(`/api/side-bets/${betId}/settle`, { method: 'POST' });
      await loadLeague();
      notify('Side bet settled from verified standings.');
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const generateAdminRecap = async () => {
    if (!(await ensureAdmin())) return;
    setServerBusy('generate-recap');
    try {
      const recap = await apiRequest(`/api/leagues/${LEAGUE_ID}/recaps/generate`, { method: 'POST' });
      setRecapEdit(recap.draftText);
      await loadLeague();
      notify(`Grounded recap generated via ${recap.generationSource}.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const approveAdminRecap = async () => {
    const recapId = proofLeague.latestRecap?.id;
    if (!recapId || !(await ensureAdmin())) return;
    setServerBusy('approve-recap');
    try {
      await apiRequest(`/api/recaps/${recapId}/approve`, { method: 'POST', body: JSON.stringify({ text: recapEdit }) });
      await loadLeague();
      notify('Recap approved and unlocked for broadcast.');
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const sendAdminBroadcast = async () => {
    const recapId = proofLeague.latestRecap?.id;
    if (!recapId || !(await ensureAdmin())) return;
    setServerBusy('send-broadcast');
    try {
      const broadcast = await apiRequest(`/api/leagues/${LEAGUE_ID}/broadcasts`, { method: 'POST', body: JSON.stringify({ recapId }) });
      await loadLeague();
      notify(`Broadcast completed: ${broadcast.status.replaceAll('_', ' ')}.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const syncFinals = async () => {
    if (!(await ensureAdmin())) return;
    setServerBusy('sync-finals');
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/results/sync`, { method: 'POST', body: JSON.stringify({ week: selectedWeek }) });
      await loadLeague();
      notify(data.appliedCount
        ? `Verified ${data.appliedCount} final${data.appliedCount === 1 ? '' : 's'} from the live feed${data.liveInProgress ? ` (${data.liveInProgress} still in progress)` : ''}.`
        : data.liveInProgress ? `No new finals yet — ${data.liveInProgress} game${data.liveInProgress === 1 ? '' : 's'} still in progress.` : 'No new finals on the feed.');
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const sendPickReminders = async () => {
    if (!(await ensureAdmin())) return;
    setServerBusy('reminders');
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/reminders/picks`, { method: 'POST', body: JSON.stringify({ week: selectedWeek }) });
      notify(data.missing?.length ? `Jack nudged ${data.missing.join(', ')}.` : data.message);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const markWeekPaid = async (weekSummary) => {
    if (!(await ensureAdmin())) return;
    setServerBusy(`payout-${weekSummary.week}`);
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/payouts`, { method: 'POST', body: JSON.stringify({ week: weekSummary.week, amount: weekSummary.pot, winnerNames: weekSummary.winners, method: 'cashapp_venmo' }) });
      await loadLeague();
      notify(`Week ${weekSummary.week} pot marked paid to ${weekSummary.winners.join(' & ')}.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const submitSurvivorPick = async () => {
    if (!playerSession.authenticated) return notify('Sign in as a player to make a survivor pick.');
    if (!survivorTeam) return notify('Pick a team first.');
    setServerBusy('survivor-pick');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/survivor/pick`, { method: 'POST', body: JSON.stringify({ week: selectedWeek, team: survivorTeam }) });
      await loadLeague();
      setSurvivorTeam('');
      notify(`Survivor pick locked: ${TEAMS[survivorTeam]}. No takebacks after kickoff.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const toggleSeasonPaid = async (playerId) => {
    if (!(await ensureAdmin())) return;
    const pool = serverLeague?.settings?.seasonPool ?? { entryFee: 25, paidPlayerIds: [] };
    const paid = new Set(pool.paidPlayerIds ?? []);
    if (paid.has(playerId)) paid.delete(playerId); else paid.add(playerId);
    setServerBusy(`season-paid-${playerId}`);
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/season-pool`, { method: 'PATCH', body: JSON.stringify({ entryFee: pool.entryFee ?? 25, paidPlayerIds: [...paid] }) });
      await loadLeague();
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const sendJackText = async () => {
    if (!(await ensureAdmin())) return;
    setServerBusy('jack-text');
    try {
      const broadcast = await apiRequest(`/api/leagues/${LEAGUE_ID}/jack/broadcast`, { method: 'POST' });
      await loadLeague();
      const sent = broadcast.deliveries.filter((d) => d.status === 'delivered' || d.status === 'queued').length;
      const suppressed = broadcast.deliveries.filter((d) => d.status === 'suppressed').length;
      notify(`Jack texted ${sent} player${sent === 1 ? '' : 's'} (${suppressed} suppressed by consent).`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const saveJackLeagueSettings = async (jackSettings) => {
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/jack-settings`, { method: 'PATCH', body: JSON.stringify(jackSettings) });
      await loadLeague();
      notify('Jack league policy saved.');
    } catch (error) { notify(error.message); }
  };

  const saveJackPlayerPolicy = async (playerId, policy) => {
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/players/${playerId}/jack-policy`, { method: 'PATCH', body: JSON.stringify(policy) });
      await loadLeague();
      notify('Player roast limit saved.');
    } catch (error) { notify(error.message); }
  };

  const handleAvatarUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return notify('Image must be under 2 MB.');
    const reader = new FileReader();
    reader.onload = () => { setSignupAvatarFile(reader.result); setSignupAvatar(''); };
    reader.readAsDataURL(file);
  };

  const handleSignup = async (event) => {
    event.preventDefault();
    // Step 1 validation
    if (signupStep === 1) {
      if (!signupName.trim()) return notify('Enter your name.');
      if (signupPhone.replace(/\D/g, '').length < 10) return notify('Enter your 10-digit phone number.');
      if (signupPin.length < 4) return notify('Create a 4-digit PIN.');
      return setSignupStep(2);
    }
    // Step 2 validation
    if (!signupTeam) return notify('Pick your favorite team — Jack needs to know who to roast.');
    if (!signupAvatar && !signupAvatarFile) return notify('Choose an avatar or upload a pic.');
    setServerBusy('register');
    try {
      const registered = await apiRequest(`/api/leagues/${LEAGUE_ID}/players/register`, {
        method: 'POST',
        body: JSON.stringify({ name: signupName.trim(), phone: signupPhone, pin: signupPin, favoriteTeam: signupTeam, avatar: signupAvatarFile || signupAvatar }),
      });
      const session = await apiRequest('/api/auth/player', { method: 'POST', body: JSON.stringify({ playerId: registered.playerId, pin: signupPin }) });
      setPlayerSession(session);
      await loadLeague();
      setName(registered.name);
      setChatName(registered.name);
      setSignupName(''); setSignupPhone(''); setSignupPin(''); setSignupTeam(''); setSignupAvatar(''); setSignupAvatarFile(null); setSignupStep(1);
      setShowWelcome(false);
      notify(`Welcome to the 405 BadGuys Parlay, ${registered.name}! You're signed in and opted in to Jack's texts (reply STOP anytime).`);
      // Jack greets the new player with the house rules
      setAssistantMessages((prev) => [...prev, {
        id: `jack-onboard-${Date.now()}`,
        role: 'assistant',
        text: `Ayy ${registered.name}, welcome to the league! Let me put you up on game real quick. Every week: drop $${ENTRY_FEE} in the pot, pick a winner for every game — straight up, no spreads, no excuses. Each correct pick is a point, most points takes the whole pot. Tiebreaker is total points in the tiebreaker game — closest WITHOUT going over. Go over, you bust. Sheets lock at the first kickoff, so don't be that guy texting me Thursday night. Ask me anything — rules, standings, your picks. I got you.`,
      }]);
      setAssistantOpen(true);
      // Auto-speak the welcome message
      const welcomeText = `Ayy ${registered.name}, welcome to the league! Let me put you up on game real quick. Every week: drop $${ENTRY_FEE} in the pot, pick a winner for every game — straight up, no spreads, no excuses.`;
      setTimeout(() => readAssistantMessage(welcomeText), 500);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  // Determine active tab (map sub-views to parent)
  const activeTab = ['season', 'survivor', 'entries', 'players', 'bets', 'ai', 'rules', 'demo', 'admin'].includes(view) ? 'more' : view;

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" type="button" onClick={() => setView('home')} aria-label="Go home">
          <span className="brand-mark">405</span>
          <span><strong>405 BADGUYS</strong><small>PARLAY</small></span>
        </button>
        <div className="header-week">
          <select value={selectedWeek} onChange={(e) => { setSelectedWeek(Number(e.target.value)); setPicks({}); }} aria-label="Select week">
            {SCHEDULE.map((w) => <option key={w.week} value={w.week}>{w.label}</option>)}
          </select>
          <strong>{SEASON}</strong>
        </div>
      </header>

      {/* ── Bottom Navigation ── */}
      <nav className="nav-tabs" aria-label="Main navigation">
        {MAIN_NAV.map(([id, label, icon]) => (
          <button className={activeTab === id ? 'active' : ''} type="button" key={id} onClick={() => navigate(id)}>
            <span className="nav-icon">{icon}</span>
            {label}
          </button>
        ))}
      </nav>

      {/* ── More Menu Overlay ── */}
      {showMore && (
        <div className="more-menu-overlay" onClick={(e) => e.target === e.currentTarget && setShowMore(false)}>
          <div className="more-menu">
            <div className="more-menu-header">
              <h3>More</h3>
              <button className="more-menu-close" type="button" onClick={() => setShowMore(false)}>×</button>
            </div>
            <div className="more-menu-items">
              {MORE_ITEMS.map(([id, label, icon, desc]) => (
                <button className="more-menu-item" type="button" key={id} onClick={() => { setView(id); setShowMore(false); }}>
                  <span className="menu-icon">{icon}</span>
                  {label}
                  <span>{desc}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Welcome / Account Creation Screen ── */}
      {showWelcome && (
        <div className="more-menu-overlay" onClick={(e) => e.target === e.currentTarget && setShowWelcome(false)}>
          <div className="more-menu" style={{ maxHeight: '85vh' }}>
            <div className="more-menu-header">
              <h3>{welcomeMode === 'join' ? 'Join the League' : 'Sign In'}</h3>
              <button className="more-menu-close" type="button" onClick={() => setShowWelcome(false)}>×</button>
            </div>
            <div className="welcome-form" style={{ border: 0, background: 'transparent', padding: '0 4px' }}>
              <div className="welcome-tabs">
                <button className={welcomeMode === 'join' ? 'active' : ''} type="button" onClick={() => setWelcomeMode('join')}>Join</button>
                <button className={welcomeMode === 'signin' ? 'active' : ''} type="button" onClick={() => setWelcomeMode('signin')}>Sign In</button>
              </div>
              {welcomeMode === 'join' ? (
                <form onSubmit={handleSignup}>
                  {/* Step indicator */}
                  <div className="signup-steps">
                    <span className={`signup-step ${signupStep >= 1 ? 'active' : ''}`}>1 · Info</span>
                    <span className="signup-step-line" />
                    <span className={`signup-step ${signupStep >= 2 ? 'active' : ''}`}>2 · Identity</span>
                  </div>

                  {signupStep === 1 && (<>
                    <label>Your name<input value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="First and last" maxLength="50" autoFocus /></label>
                    <label>Phone <small style={{ float: 'right', fontWeight: 400 }}>for SMS updates</small><input value={signupPhone} onChange={(e) => setSignupPhone(e.target.value)} placeholder="(555) 123-4567" maxLength="15" type="tel" /></label>
                    <label>Create a PIN<input value={signupPin} onChange={(e) => setSignupPin(e.target.value.replace(/\D/g, ''))} placeholder="4 digits" maxLength="4" type="password" inputMode="numeric" /></label>
                    <button className="button button-primary full" style={{ marginTop: 16 }}>Next · Pick your team →</button>
                    <p style={{ fontSize: '0.68rem', color: 'rgba(255,255,255,0.45)', marginTop: 10 }}>Your number is used for game results, reminders, and Jack's weekly texts. Reply STOP to any message to opt out.</p>
                  </>)}

                  {signupStep === 2 && (<>
                    <label>Your team <small style={{ float: 'right', fontWeight: 400 }}>required — Jack keeps rivalry receipts</small>
                      <select value={signupTeam} onChange={(e) => setSignupTeam(e.target.value)}>
                        <option value="">Pick your squad</option>
                        {Object.entries(TEAMS).map(([abbr, full]) => <option key={abbr} value={abbr}>{full}</option>)}
                      </select>
                    </label>
                    {signupTeam && <div className="signup-team-preview"><img src={getTeamLogoUrl(signupTeam)} alt="" /><strong>{TEAMS[signupTeam]}</strong></div>}

                    <div className="signup-avatar-section">
                      <p className="signup-avatar-label">Profile pic</p>
                      <div className="signup-avatar-grid">
                        {PRESET_AVATARS.map((emoji) => (
                          <button type="button" key={emoji} className={`avatar-pick ${signupAvatar === emoji ? 'selected' : ''}`} onClick={() => { setSignupAvatar(emoji); setSignupAvatarFile(null); }}>{emoji}</button>
                        ))}
                      </div>
                      <div className="signup-avatar-upload">
                        <label className="upload-btn">
                          📷 Upload photo
                          <input type="file" accept="image/*" onChange={handleAvatarUpload} hidden />
                        </label>
                        {signupAvatarFile && <div className="avatar-preview-img"><img src={signupAvatarFile} alt="Your avatar" /><span>✓</span></div>}
                      </div>
                    </div>

                    <div className="signup-btn-row">
                      <button type="button" className="button button-ghost" onClick={() => setSignupStep(1)}>← Back</button>
                      <button className="button button-primary" disabled={serverBusy === 'register'}>{serverBusy === 'register' ? 'Creating…' : 'Join the league →'}</button>
                    </div>
                  </>)}
                </form>
              ) : (
                <form onSubmit={loginPlayer}>
                  <label>Player<select aria-label="Player identity" value={playerLogin.playerId} onChange={(event) => setPlayerLogin((current) => ({ ...current, playerId: event.target.value }))}>{proofLeague.players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label>
                  <label>PIN<input aria-label="Player PIN" type="password" inputMode="numeric" maxLength="4" value={playerLogin.pin} onChange={(event) => setPlayerLogin((current) => ({ ...current, pin: event.target.value.replace(/\D/g, '') }))} placeholder="4-digit PIN" /></label>
                  <button className="button button-primary full" disabled={serverBusy === 'player-login' || playerLogin.pin.length !== 4} style={{ marginTop: 16 }}>{serverBusy === 'player-login' ? 'Signing in…' : 'Sign In'}</button>
                </form>
              )}
            </div>
          </div>
        </div>
      )}

      <main>
        {serverError && <div className="server-banner"><strong>Server connection unavailable.</strong><span>{serverError} The seeded read-only fixture remains visible.</span><button type="button" onClick={loadLeague}>Retry</button></div>}

        {view === 'home' && (
          <div className="stack-lg">
            <section className="hero">
              <div className="hero-copy">
                <span className="eyebrow">THE BOARD IS OPEN</span>
                <h1>{currentGames.length} games.<br /><em>One clean sheet.</em></h1>
                <p>Call every winner, survive the tiebreaker, and earn the right to be unbearable until Thursday.</p>
                <div className="hero-actions">
                  <button className="button button-light" type="button" onClick={() => setView('picks')}>Make my picks <span>→</span></button>
                  {!playerSession.authenticated && (
                    <button className="button button-ghost" type="button" onClick={() => setShowWelcome(true)}>Join the league</button>
                  )}
                  {playerSession.authenticated && (
                    <button className="button button-ghost" type="button" onClick={() => setView('results')}>View standings</button>
                  )}
                </div>
              </div>
              <div className="hero-scorecard">
                <span className="scorecard-label">This week's purse</span>
                <strong>${totalPot.toLocaleString()}</strong>
                <div><span>{weekSheets.length} entries</span><span>{completedGames}/{currentGames.length} final</span></div>
                {rolloverPot > 0 && <p>Includes ${Number(rolloverPot).toLocaleString()} rollover</p>}
              </div>
            </section>

            {/* ── Live Game Ticker ── */}
            <section className="game-ticker" aria-label="Game ticker">
              <div className="ticker-head">
                <span className={liveScores.anyLive ? 'live-dot on' : 'live-dot'} />
                <strong>{liveScores.anyLive ? 'Live games' : `Week ${selectedWeek} games`}</strong>
                <small>{completedGames}/{currentGames.length} final</small>
              </div>
              <div className="ticker-scroll">
                {currentGames.map((game) => {
                  const live = liveByGame[game.id];
                  const state = live?.state ?? 'pre';
                  const result = (proofLeague.results ?? {})[game.id];
                  return (
                    <article className={`ticker-card ticker-${state}`} key={game.id}>
                      <div className="ticker-matchup">
                        <div className={`ticker-team ${state === 'post' && live && live.awayScore > live.homeScore ? 'won' : ''}`}>
                          <img src={getTeamLogoUrl(game.away)} alt="" loading="lazy" />
                          <span>{game.away}</span>
                          {state !== 'pre' && <b>{live?.awayScore ?? 0}</b>}
                        </div>
                        <div className={`ticker-team ${state === 'post' && live && live.homeScore > live.awayScore ? 'won' : ''}`}>
                          <img src={getTeamLogoUrl(game.home)} alt="" loading="lazy" />
                          <span>{game.home}</span>
                          {state !== 'pre' && <b>{live?.homeScore ?? 0}</b>}
                        </div>
                      </div>
                      <small className="ticker-status">
                        {state === 'in' ? `● ${live?.detail || 'Live'}` : state === 'post' ? '✓ Final' : game.time}
                      </small>
                      {result?.winner && <span className="ticker-winner">{result.winner} ✓</span>}
                    </article>
                  );
                })}
              </div>
            </section>

            {/* ── Injury & News Ticker ── */}
            {(nflInjuries.teams?.length > 0 || nflNews.items?.length > 0) && (
              <section className="injury-ticker" aria-label="Injury and news ticker">
                <div className="ticker-head">
                  <span className="injury-icon">🏥</span>
                  <strong>Injuries & player status</strong>
                </div>
                <div className="injury-scroll">
                  {nflInjuries.teams?.slice(0, 12).map((team) => (
                    <article className="injury-team-card" key={team.team}>
                      <div className="injury-team-head">
                        <img src={team.logo} alt="" loading="lazy" />
                        <strong>{team.team}</strong>
                      </div>
                      {team.injuries.slice(0, 3).map((inj, j) => (
                        <div className="injury-player" key={j}>
                          <span className={`injury-status injury-${inj.status.toLowerCase().replace(/\s/g, '-')}`}>{inj.status}</span>
                          <span>{inj.name} <small>{inj.position}</small></span>
                        </div>
                      ))}
                    </article>
                  ))}
                  {nflNews.items?.slice(0, 6).map((item, i) => (
                    <article className="injury-item" key={`news-${i}`}>
                      <strong>{item.headline}</strong>
                      {item.url && <a href={item.url} target="_blank" rel="noreferrer">↗</a>}
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="stat-grid">
              <article className="stat-card"><span>01</span><strong>{currentGames.length}</strong><p>games on the board</p></article>
              <article className="stat-card"><span>02</span><strong>{weekSheets.length}</strong><p>locked entries</p></article>
              <article className="stat-card"><span>03</span><strong>${ENTRY_FEE}</strong><p>per sheet</p></article>
              <article className="stat-card accent"><span>04</span><strong>{completedGames}</strong><p>results posted</p></article>
            </section>

            <section className="section-grid">
              <div className="panel">
                <div className="panel-heading"><div><span className="eyebrow dark">GEMINI COMMISSIONER</span><h2>League pulse</h2></div><span className={`status-dot ${aiStatus.configured ? 'online' : ''}`}>{aiStatus.configured ? 'Live ready' : 'Approved demo'}</span></div>
                {aiResult.recap ? <p className="ai-copy">{aiResult.recap}</p> : <p className="muted">Turn your entries and posted results into a sharp, grounded league update—no invented stats.</p>}
                {aiError && <p className="error-text">{aiError}</p>}
                <button className="text-button" type="button" onClick={getRecap} disabled={!weekSheets.length || aiLoading === 'recap'}>{aiLoading === 'recap' ? 'Writing…' : aiResult.recap ? 'Refresh recap ↗' : 'Generate league recap ↗'}</button>
              </div>
              <div className="panel next-up">
                <span className="eyebrow dark">NEXT UP</span><h2>{currentGames[0]?.away} <i>at</i> {currentGames[0]?.home}</h2><p>{currentGames[0]?.time}</p>
                <div className="matchup-teams"><span>{currentGames[0]?.away}</span><b>VS</b><span>{currentGames[0]?.home}</span></div>
              </div>
            </section>

            {nflNews.items?.length > 0 && (
              <section className="panel nfl-wire">
                <div className="panel-heading"><div><span className="eyebrow dark">NFL WIRE</span><h2>Injuries, statuses & team news</h2></div><small className="wire-updated">Updated {nflNews.fetchedAt ? new Date(nflNews.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</small></div>
                <div className="wire-list">
                  {nflNews.items.slice(0, 8).map((item, index) => (
                    <article key={index}>
                      <strong>{item.headline}</strong>
                      {item.description && <p>{item.description}</p>}
                      <div className="wire-meta">
                        {item.published && <time>{new Date(item.published).toLocaleDateString([], { month: 'short', day: 'numeric' })}</time>}
                        {item.url && <a href={item.url} target="_blank" rel="noreferrer">Full story ↗</a>}
                      </div>
                    </article>
                  ))}
                </div>
                <p className="wire-note">Ask Jack about any of these — he's read the wire.</p>
              </section>
            )}
          </div>
        )}

        {view === 'picks' && (
          <div className="page-grid">
            <section className="content-column">
              <div className="page-title"><span className="eyebrow dark">{weekLabel.toUpperCase()}</span><h1>Build your sheet</h1><p>Pick one winner in every matchup. Your choices stay private on this device until you lock them in.</p>{currentByeTeams.length > 0 && <p className="bye-notice"><strong>Bye teams:</strong> {currentByeTeams.map(t => TEAMS[t]).join(', ')}</p>}</div>
              <div className={`deadline-banner ${weekLocked ? 'locked' : ''}`}>
                {weekLocked
                  ? <><span className="deadline-icon">🔒</span><div><strong>Sheets are locked for {weekLabel}.</strong><p>The first game has kicked off. See you next week — Jack remembers who was late.</p></div></>
                  : <><span className="deadline-icon">⏱</span><div><strong>Sheets lock in {deadlineCountdown || 'less than a minute'}.</strong><p>Deadline: {weekDeadline ? weekDeadline.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ' ET (first kickoff)' : 'first kickoff'}.</p></div></>}
              </div>
              <div className="games-list">
                {currentGames.map((game, index) => (
                  <article className={`game-card ${picks[game.id] ? 'picked' : ''}`} key={game.id}>
                    <div className="game-meta"><span>{String(index + 1).padStart(2, '0')}</span><p>{game.time}</p>{game.isTiebreaker && <b>★ Tiebreaker game</b>}{liveByGame[game.id]?.state === 'in' && <b className="live-badge">● LIVE {liveByGame[game.id].away} {liveByGame[game.id].awayScore}–{liveByGame[game.id].homeScore} {liveByGame[game.id].home} · {liveByGame[game.id].detail}</b>}</div>
                    <div className="team-buttons">
                      <button type="button" className={picks[game.id] === game.away ? 'selected' : ''} style={{ '--team-color': TEAM_COLORS[game.away] }} onClick={() => choosePick(game.id, game.away)}><img className="team-logo" src={getTeamLogoUrl(game.away)} alt="" loading="lazy" /><small>{game.awayFull}</small><strong>{game.away}</strong><span>AWAY</span></button>
                      <i>at</i>
                      <button type="button" className={picks[game.id] === game.home ? 'selected' : ''} style={{ '--team-color': TEAM_COLORS[game.home] }} onClick={() => choosePick(game.id, game.home)}><img className="team-logo" src={getTeamLogoUrl(game.home)} alt="" loading="lazy" /><small>{game.homeFull}</small><strong>{game.home}</strong><span>HOME</span></button>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <aside className="slip-card">
              <div className="slip-progress"><span>YOUR SHEET</span><strong>{Object.keys(picks).length}<small> / {currentGames.length}</small></strong></div>
              <div className="progress-track"><span style={{ width: `${(Object.keys(picks).length / currentGames.length) * 100}%` }} /></div>
              <label>Full name<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Your name" maxLength="50" /></label>
              <label>Payment handle <small>optional</small><input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="@handle" maxLength="50" /></label>
              <label>Tiebreaker total<input type="number" min="0" value={tiebreaker} onChange={(event) => setTiebreaker(event.target.value)} placeholder="48" /></label>
              <p className="rule-note"><strong>Closest without going over wins.</strong> Going over means your tiebreaker is busted.</p>
              <label className="check-row"><input type="checkbox" checked={paid} onChange={(event) => setPaid(event.target.checked)} /><span>I confirm I sent ${ENTRY_FEE}</span></label>
              <button className="button button-primary full" type="button" onClick={submit} disabled={weekLocked || serverBusy === 'entry'}>{weekLocked ? '🔒 Week locked' : serverBusy === 'entry' ? 'Locking in…' : <>Lock in picks <span>→</span></>}</button>
              <button className="ai-mini-button" type="button" onClick={analyzePicks} disabled={aiLoading === 'picks'}><span>✦</span>{aiLoading === 'picks' ? 'Reviewing…' : 'Ask Gemini to check my sheet'}</button>
              {aiResult.picks && <div className="ai-slip-result">{aiResult.picks}</div>}
              {aiError && <p className="error-text">{aiError}</p>}
            </aside>
          </div>
        )}

        {view === 'season' && (
          <StandardPage eyebrow={`${SEASON} SEASON`} title="Season standings" subtitle="Weekly crowns, cumulative accuracy, and who has actually been paid.">
            {(() => {
              const pool = serverLeague?.settings?.seasonPool ?? { entryFee: 25, paidPlayerIds: [] };
              const paidSet = new Set(pool.paidPlayerIds ?? []);
              const seasonPot = paidSet.size * (pool.entryFee ?? 25);
              const leader = seasonStats.table[0];
              const seasonPaidOut = (serverLeague?.payouts ?? []).some((p) => p.pool === 'season');
              return <section className="season-pool-card">
                <div className="season-pool-main">
                  <span className="eyebrow dark">SEASON POOL · ${pool.entryFee ?? 25}/PLAYER · WINNER TAKES ALL</span>
                  <div className="season-pool-figures">
                    <div><small>Season pot</small><strong>${seasonPot.toLocaleString()}</strong></div>
                    <div><small>Paid in</small><strong>{paidSet.size}<i>/{proofLeague.players.length}</i></strong></div>
                    <div><small>Current leader</small><strong>{leader ? `${leader.name}` : '—'}</strong>{leader && <em>{leader.weeklyWins} wins · {leader.totalCorrect} correct</em>}</div>
                  </div>
                  <p>Best record across all 18 weeks takes the season pot. Ties break on total correct picks.{seasonPaidOut ? ' Season pot has been PAID.' : ''}</p>
                </div>
                {isComm && <div className="season-pool-admin">
                  <small>SEASON ENTRIES PAID</small>
                  {proofLeague.players.map((player) => (
                    <label key={player.id} className="check-row compact">
                      <input type="checkbox" checked={paidSet.has(player.id)} disabled={serverBusy === `season-paid-${player.id}`} onChange={() => toggleSeasonPaid(player.id)} />
                      <span>{player.name}</span>
                    </label>
                  ))}
                </div>}
              </section>;
            })()}
            {seasonStats.table.length ? <>
              <div className="season-table">
                <div className="season-head"><span>Player</span><span>Wins</span><span>Correct</span><span>Acc %</span><span>Earnings</span></div>
                {seasonStats.table.map((row, index) => (
                  <div className={`season-row ${index === 0 && row.weeklyWins > 0 ? 'leader' : ''}`} key={row.key}>
                    <strong>{row.name}{row.weeklyWins > 0 && ' ' + '👑'.repeat(Math.min(row.weeklyWins, 5))}</strong>
                    <span>{row.weeklyWins}</span>
                    <span>{row.totalCorrect}<small>/{row.totalPicks}</small></span>
                    <span>{row.winPct}%</span>
                    <b>${Math.round(row.earnings).toLocaleString()}</b>
                  </div>
                ))}
              </div>
              <section className="week-ledger">
                <div className="proof-heading"><div><span className="proof-step">LEDGER</span><h2>Week-by-week pots</h2></div><StatusPill state="pass">{seasonStats.weeks.filter((w) => w.paid).length}/{seasonStats.weeks.length} paid</StatusPill></div>
                <div className="week-ledger-list">
                  {seasonStats.weeks.map((w) => (
                    <article key={w.week} className={w.paid ? 'paid' : ''}>
                      <span className="ledger-week">W{w.week}</span>
                      <div><strong>${w.pot.toLocaleString()} · {w.entries} entries</strong><p>{w.complete ? (w.winners.length ? `Winner: ${w.winners.join(' & ')} (${w.topScore} correct)` : 'Complete — no winner determined') : 'In progress'}</p></div>
                      {w.paid
                        ? <StatusPill state="pass">Paid {w.payout?.paidAt ? new Date(w.payout.paidAt).toLocaleDateString() : ''}</StatusPill>
                        : w.complete && w.winners.length
                          ? (isComm ? <button className="text-button" type="button" disabled={serverBusy === `payout-${w.week}`} onClick={() => markWeekPaid(w)}>{serverBusy === `payout-${w.week}` ? 'Saving…' : 'Mark paid ↗'}</button> : <StatusPill state="warn">Pending</StatusPill>)
                          : <StatusPill state="neutral">Open</StatusPill>}
                    </article>
                  ))}
                </div>
              </section>
            </> : <EmptyState icon="🏆" title="No season data yet" text="Standings build as sheets lock and results post each week." action="Make picks" onAction={() => setView('picks')} />}
          </StandardPage>
        )}

        {view === 'survivor' && (
          <StandardPage eyebrow="SURVIVOR POOL" title="Last one standing" subtitle="Pick one team to win each week. Never reuse a team. One loss and you're out.">
            <PlayerSessionPanel players={proofLeague.players} session={playerSession} login={playerLogin} setLogin={setPlayerLogin} onLogin={loginPlayer} onLogout={logoutPlayer} busy={serverBusy === 'player-login'} />
            {survivorPool.champion && <div className="survivor-champion">🏆 <strong>{survivorPool.champion.name}</strong> is the last one standing — survivor pool champion!</div>}
            {(() => {
              const myEntry = survivorPool.entries.find((e) => e.playerId === playerSession.playerId);
              const myPickThisWeek = myEntry?.picks.find((p) => p.week === selectedWeek);
              const used = new Set((myEntry?.usedTeams ?? []).filter((t) => myPickThisWeek?.team !== t));
              const weekTeams = currentGames.flatMap((g) => [{ team: g.away, opp: g.home, at: true }, { team: g.home, opp: g.away, at: false }]);
              if (!playerSession.authenticated) return <p className="muted">Sign in above to make your survivor pick for {weekLabel}.</p>;
              if (myEntry && !myEntry.alive) return <div className="survivor-eliminated">💀 You were eliminated in Week {myEntry.eliminatedWeek}. Enjoy the graveyard view — it's quite peaceful.</div>;
              return <section className="survivor-picker">
                <div className="panel-heading"><div><span className="eyebrow dark">{weekLabel.toUpperCase()}</span><h2>{myPickThisWeek ? `Your pick: ${TEAMS[myPickThisWeek.team]}` : 'Make your pick'}</h2></div>{weekLocked ? <StatusPill state="neutral">Locked</StatusPill> : <StatusPill state="pass">Open · locks in {deadlineCountdown || '<1m'}</StatusPill>}</div>
                <div className="survivor-team-grid">
                  {weekTeams.map(({ team, opp, at }) => {
                    const burned = used.has(team);
                    const selected = survivorTeam === team || (!survivorTeam && myPickThisWeek?.team === team);
                    return <button key={team} type="button" className={`survivor-team ${selected ? 'selected' : ''} ${burned ? 'burned' : ''}`} disabled={burned || weekLocked} onClick={() => setSurvivorTeam(team)}>
                      <strong>{team}</strong><small>{at ? '@' : 'vs'} {opp}</small>{burned && <i>USED</i>}
                    </button>;
                  })}
                </div>
                <button className="button button-primary full" type="button" onClick={submitSurvivorPick} disabled={!survivorTeam || weekLocked || serverBusy === 'survivor-pick'}>{serverBusy === 'survivor-pick' ? 'Locking…' : weekLocked ? '🔒 Week locked' : myPickThisWeek ? 'Change my pick →' : 'Lock survivor pick →'}</button>
              </section>;
            })()}
            <section className="survivor-board">
              <div className="proof-heading"><div><span className="proof-step">POOL</span><h2>The board</h2></div><StatusPill state="pass">{survivorPool.aliveCount}/{survivorPool.totalCount || 0} alive</StatusPill></div>
              {survivorPool.entries.length ? <div className="survivor-list">
                {survivorPool.entries.map((entry) => (
                  <article key={entry.playerId} className={entry.alive ? 'alive' : 'dead'}>
                    <span className="survivor-status">{entry.alive ? '🛡️' : '💀'}</span>
                    <div>
                      <strong>{entry.name}</strong>
                      <p>{entry.alive ? `${entry.wins} win${entry.wins === 1 ? '' : 's'} · still breathing` : `Eliminated Week ${entry.eliminatedWeek}`}</p>
                      <div className="survivor-history">{entry.picks.map((p) => <i key={p.week} className={p.outcome} title={`W${p.week}: ${p.teamFull}`}>{p.team}</i>)}</div>
                    </div>
                  </article>
                ))}
              </div> : <p className="muted">No survivor picks yet. Be the first in the pool.</p>}
            </section>
          </StandardPage>
        )}

        {view === 'entries' && (
          <StandardPage eyebrow={weekLabel.toUpperCase()} title="Locked entries" subtitle="Picks remain hidden here; the commissioner can score them after results arrive.">
            {weekSheets.length ? <div className="entry-list">{weekSheets.map((sheet, index) => (
              <article className="entry-row" key={sheet.id}><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{sheet.name}</strong><p>{Object.keys(sheet.picks).length} picks · TB {sheet.tiebreaker}</p></div><time>{sheet.submittedAt ? new Date(sheet.submittedAt).toLocaleDateString() : weekLabel}</time><b className="paid-pill">PAID</b></article>
            ))}</div> : <EmptyState icon="◎" title="The board is quiet" text="Be the first entry on the sheet this week." action="Make picks" onAction={() => setView('picks')} />}
          </StandardPage>
        )}

        {view === 'results' && (
          <StandardPage eyebrow={`${completedGames} OF ${currentGames.length} FINAL`} title="League standings" subtitle="One point per correct pick. Tiebreakers settle equal scores once the featured game is final.">
            {(liveScores.scores ?? []).some((s) => s.state !== 'pre') && (
              <section className="live-strip" aria-label="Live scores">
                <div className="live-strip-head"><span className={liveScores.anyLive ? 'live-dot on' : 'live-dot'} /><strong>{liveScores.anyLive ? 'Games in progress' : 'Scoreboard'}</strong><small>{liveScores.fetchedAt ? `Updated ${new Date(liveScores.fetchedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : ''}</small></div>
                <div className="live-strip-row">
                  {(liveScores.scores ?? []).filter((s) => s.state !== 'pre').map((s) => (
                    <article className={`live-score-card ${s.state}`} key={s.gameId}>
                      <div className="live-score-teams">
                        <span className={s.state === 'post' && s.awayScore > s.homeScore ? 'winning' : ''}>{s.away} <b>{s.awayScore}</b></span>
                        <span className={s.state === 'post' && s.homeScore > s.awayScore ? 'winning' : ''}>{s.home} <b>{s.homeScore}</b></span>
                      </div>
                      <small>{s.state === 'in' ? `● ${s.detail}` : 'FINAL'}</small>
                    </article>
                  ))}
                </div>
              </section>
            )}
            {weekSheets.length ? <div className="standings-table">
              <div className="table-head"><span>Rank</span><span>Player</span><span>Tiebreaker</span><span>Correct</span></div>
              {leaderboard.map((entry, index) => {
                const path = winPathsByEntry[entry.id];
                return <div className={`standing-row ${index === 0 && completedGames ? 'leader' : ''}`} key={entry.id}>
                  <span>#{index + 1}</span>
                  <strong>{entry.name}{index === 0 && completedGames ? '  ♛' : ''}{path && <i className={`path-badge ${path.status}`}>{{ clinched: 'CLINCHED', won: 'WINNER', alive: 'ALIVE', on_tiebreaker: 'TB DECIDES', eliminated: 'OUT' }[path.status]}</i>}</strong>
                  <span>{entry.tiebreaker}</span>
                  <b>{entry.score}<small> / {completedGames || '—'}</small></b>
                </div>;
              })}
            </div> : <EmptyState icon="↗" title="No standings yet" text="Locked entries will appear here as soon as the league joins." action="Make picks" onAction={() => setView('picks')} />}
          </StandardPage>
        )}

        {view === 'players' && (
          <StandardPage eyebrow="PLAYER CONTROL CENTER" title="Preferences, by player" subtitle="Every communication choice is explicit, timestamped, and reversible. Phone verification never implies SMS permission.">
            <PlayerSessionPanel players={proofLeague.players} session={playerSession} login={playerLogin} setLogin={setPlayerLogin} onLogin={loginPlayer} onLogout={logoutPlayer} busy={serverBusy === 'player-login'} />
            <div className="player-settings-grid">
              {proofLeague.players.map((player) => <article className={`player-settings-card ${playerSession.playerId === player.id ? 'current' : ''}`} key={player.id}>
                <div className="player-card-head"><span>{player.name.split(' ').map((word) => word[0]).join('')}</span><div><h2>{player.name}</h2><p>{player.phone} · {player.phoneVerifiedAt ? 'verified' : 'unverified'}</p></div><StatusPill state={player.messaging.smsConsent === 'opted_in' ? 'pass' : 'neutral'}>{player.messaging.smsConsent.replace('_', ' ')}</StatusPill></div>
                <label>Weekly results
                  <select value={player.messaging.resultsChannel} disabled={serverBusy === `player-${player.id}` || playerSession.playerId !== player.id} onChange={(event) => updatePreferences(player.id, { resultsChannel: event.target.value })}>
                    <option value="sms_and_in_app">SMS + in-app</option><option value="sms">SMS only</option><option value="in_app">In-app only</option>
                  </select>
                </label>
                <label>SMS consent
                  <select value={player.messaging.smsConsent} disabled={serverBusy === `player-${player.id}` || playerSession.playerId !== player.id} onChange={(event) => updatePreferences(player.id, { smsConsent: event.target.value })}>
                    <option value="opted_in">Opted in</option><option value="opted_out">STOP / opted out</option>
                  </select>
                </label>
                <label>Trash-talk level
                  <select value={player.trashTalk.level} disabled={serverBusy === `player-${player.id}` || playerSession.playerId !== player.id} onChange={(event) => updatePreferences(player.id, { trashTalkLevel: event.target.value })}>
                    <option value="none">No trash talk</option><option value="light">Light / friendly</option><option value="competitive">Competitive</option><option value="maximum">Maximum roast</option>
                  </select>
                </label>
                <label>Favorite team <small>Jack tracks rivalry bragging rights</small>
                  <select value={player.trashTalk?.jackPolicy?.favoriteTeam ?? ''} disabled={serverBusy === `player-${player.id}` || playerSession.playerId !== player.id} onChange={(event) => updatePreferences(player.id, { favoriteTeam: event.target.value })}>
                    <option value="">No favorite team</option>
                    {Object.entries(TEAMS).map(([abbr, full]) => <option key={abbr} value={abbr}>{full}</option>)}
                  </select>
                </label>
                <small>{serverBusy === `player-${player.id}` ? 'Saving…' : `Last tone update ${new Date(player.trashTalk.updatedAt).toLocaleString()}`}</small>
              </article>)}
            </div>
            <section className="consent-history">
              <div className="proof-heading"><div><span className="proof-step">LOG</span><h2>Immutable consent history</h2></div><StatusPill state="pass">{proofLeague.consentRecords?.length ?? 0} records</StatusPill></div>
              <div>{(proofLeague.consentRecords ?? []).slice(0, 12).map((record) => <article key={record.id}><time>{new Date(record.recordedAt).toLocaleString()}</time><strong>{demoPlayerName(record.playerId)}</strong><span>{record.channel.replaceAll('_', ' ')}</span><StatusPill state={record.status === 'opted_out' || record.status === 'none' ? 'neutral' : 'pass'}>{record.status.replaceAll('_', ' ')}</StatusPill><small>{record.source.replaceAll('_', ' ')}</small></article>)}</div>
            </section>
          </StandardPage>
        )}

        {view === 'bets' && (
          <StandardPage eyebrow="SOCIAL STAKES · NO CASH" title="Side bets" subtitle="Private, mutually agreed challenges using virtual tokens, points, or bragging rights. The app never collects or enforces money.">
            <PlayerSessionPanel players={proofLeague.players} session={playerSession} login={playerLogin} setLogin={setPlayerLogin} onLogin={loginPlayer} onLogout={logoutPlayer} busy={serverBusy === 'player-login'} />
            <div className="side-bet-layout">
              <form className="bet-composer" onSubmit={createBet}>
                <span className="eyebrow dark">NEW PROPOSAL</span><h2>Challenge a player</h2>
                <div className="form-pair"><label>From<input value={playerSession.name ?? 'Sign in first'} disabled /></label><label>Opponent<select value={betForm.opponentId} onChange={(event) => setBetForm((current) => ({ ...current, opponentId: event.target.value }))}>{proofLeague.players.filter((player) => player.id !== playerSession.playerId).map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label></div>
                <label>Event<input value={betForm.event} maxLength="180" onChange={(event) => setBetForm((current) => ({ ...current, event: event.target.value }))} /></label>
                <label>Terms<textarea value={betForm.terms} maxLength="300" onChange={(event) => setBetForm((current) => ({ ...current, terms: event.target.value }))} /></label>
                <div className="form-pair"><label>Stake type<select value={betForm.stakeType} onChange={(event) => setBetForm((current) => ({ ...current, stakeType: event.target.value }))}><option value="virtual_tokens">Virtual tokens</option><option value="points">League points</option><option value="bragging_rights">Bragging rights</option></select></label><label>Amount<input type="number" min="1" max="10000" value={betForm.stakeAmount} onChange={(event) => setBetForm((current) => ({ ...current, stakeAmount: event.target.value }))} /></label></div>
                <label>Stake label<input value={betForm.stakeLabel} maxLength="100" onChange={(event) => setBetForm((current) => ({ ...current, stakeLabel: event.target.value }))} /></label>
                <label>Optional message<input value={betForm.optionalMessage} maxLength="240" placeholder="Keep it friendly…" onChange={(event) => setBetForm((current) => ({ ...current, optionalMessage: event.target.value }))} /></label>
                <button className="button button-primary full" disabled={!playerSession.authenticated || serverBusy === 'create-bet'}>{serverBusy === 'create-bet' ? 'Sending…' : playerSession.authenticated ? 'Send private proposal →' : 'Player sign-in required'}</button>
              </form>
              <section className="live-bets"><div className="panel-heading"><div><span className="eyebrow dark">LEAGUE BETS</span><h2>Proposals & outcomes</h2></div><StatusPill state="pass">{proofLeague.sideBets.length} total</StatusPill></div>
                <div className="live-bet-list">{proofLeague.sideBets.map((bet) => <article key={bet.id}>
                  <div className="bet-line-head"><StatusPill state={bet.proposalStatus === 'accepted' ? 'pass' : bet.proposalStatus === 'pending' ? 'warn' : 'neutral'}>{bet.proposalStatus}</StatusPill><small>{bet.visibility.replaceAll('_', ' ')}</small></div>
                  <h3>{demoPlayerName(bet.creatorId)} <i>vs</i> {demoPlayerName(bet.opponentId)}</h3><p>{bet.event}</p><strong>{bet.stake.label}</strong><small>{bet.terms}</small>
                  {bet.proposalStatus === 'pending' && playerSession.playerId === bet.opponentId && <div className="bet-actions"><button type="button" onClick={() => respondBet(bet, 'accept')}>Accept & lock</button><button type="button" onClick={() => respondBet(bet, 'decline')}>Decline</button></div>}
                  {bet.proposalStatus === 'pending' && playerSession.playerId !== bet.opponentId && <small className="awaiting-player">Awaiting {demoPlayerName(bet.opponentId)}</small>}
                  {bet.proposalStatus === 'accepted' && bet.settlementStatus !== 'settled' && <button className="text-button" type="button" onClick={() => settleBet(bet.id)}>Settle from results ↗</button>}
                  {bet.settlementStatus === 'settled' && <div className="settlement-box"><span>Verified settlement</span><b>{demoPlayerName(bet.winnerId)} wins · {bet.creatorScore}–{bet.opponentScore}</b></div>}
                  {bet.proposalStatus === 'declined' && <div className="settlement-box neutral"><span>No locked terms</span><b>Declined · no settlement</b></div>}
                </article>)}</div>
              </section>
            </div>
          </StandardPage>
        )}

        {view === 'demo' && (
          <StandardPage eyebrow="ACCEPTANCE SCENARIO · WEEK 12" title="The proof board" subtitle="A deterministic demo league showing the complete path from verified results to a moderated recap, consent-aware delivery, and non-cash side-bet settlement.">
            <div className="proof-actions">
              <p><strong>Demo snapshot:</strong> finalized November 23, 2025 · every identifier and timestamp is inspectable below. Demo players are removed automatically when the real season opens.</p>
            </div>

            <section className="proof-metrics" aria-label="Acceptance scenario summary">
              <ProofMetric value={proofLeague.players.length} label="demo players" state="pass" />
              <ProofMetric value={`${Object.values(proofLeague.results).filter((result) => result.winner && result.verifiedAt).length}/${Object.keys(proofLeague.results).length || currentGames.length}`} label="verified results" state="pass" />
              <ProofMetric value={proofLeague.recaps.filter((recap) => recap.adminApproval?.status === 'approved').length} label="approved recaps" state="pass" />
              <ProofMetric value={proofLeague.sideBets.length} label="side-bet records" state="pass" />
              <ProofMetric value={proofLeague.latestBroadcast?.deliveries?.filter((item) => item.status === 'failed').length ?? 0} label="failed SMS + fallback" state="warn" />
              <ProofMetric value={proofLeague.latestRecap?.moderation?.blocked?.length ?? 0} label="roasts blocked" state="pass" />
            </section>

            <section className="proof-section">
              <div className="proof-heading"><div><span className="proof-step">01</span><h2>Consent & player controls</h2></div><StatusPill state="pass">Enforced</StatusPill></div>
              <p className="proof-intro">Consent is evaluated per player and per channel. A verified phone alone is never treated as permission.</p>
              <div className="proof-table consent-table">
                <div className="proof-table-head"><span>Player</span><span>Phone</span><span>Results SMS</span><span>Trash talk</span></div>
                {proofLeague.players.map((player) => <div className="proof-table-row" key={player.id}>
                  <strong>{player.name}</strong>
                  <span><StatusPill state="pass">Verified</StatusPill> {player.phone}</span>
                  <span><StatusPill state={player.messaging.smsConsent === 'opted_in' ? 'pass' : 'neutral'}>{player.messaging.smsConsent === 'opted_in' ? 'Opted in' : 'STOP / opted out'}</StatusPill></span>
                  <span><StatusPill state={player.trashTalk.level === 'none' ? 'neutral' : player.trashTalk.level === 'maximum' ? 'warn' : 'pass'}>{player.trashTalk.level === 'none' ? 'No trash talk' : `${player.trashTalk.level} mode`}</StatusPill></span>
                </div>)}
              </div>
              <div className="proof-callout"><span>✓</span><p><strong>Chris Morgan is protected twice:</strong> SMS is suppressed before any provider request, and name-based roast candidates are rejected because trash talk is set to "none." Taylor Brooks explicitly selected maximum roast mode.</p></div>
            </section>

            <section className="proof-section">
              <div className="proof-heading"><div><span className="proof-step">02</span><h2>Grounded AI recap & moderation</h2></div><StatusPill state="pass">Approved</StatusPill></div>
              <div className="recap-proof-grid">
                <article className="published-recap">
                  <div><span>WEEKLY RECAP · {proofLeague.latestRecap?.adminApproval?.status?.toUpperCase()}</span><small>{proofLeague.latestRecap?.generationSource?.replaceAll('_', ' ')}</small></div>
                  <p>{proofLeague.latestRecap?.finalText}</p>
                  <div className="recap-footer"><span>Facts locked {new Date(proofLeague.latestRecap?.factsSnapshot?.resultsFinalizedAt).toLocaleString()}</span><span>{proofLeague.latestRecap?.adminApproval?.approvedBy ? `Approved by ${proofLeague.latestRecap.adminApproval.approvedBy}` : 'Awaiting commissioner approval'}</span></div>
                </article>
                <aside className="fact-ledger">
                  <h3>Grounding ledger</h3>
                  <dl><div><dt>Winner</dt><dd>Marcus · 12–2</dd></div><div><dt>Biggest rise</dt><dd>Marcus · +2</dd></div><div><dt>Closest top gap</dt><dd>1 point</dd></div><div><dt>Verified games</dt><dd>14</dd></div><div><dt>Settled bet</dt><dd>25 virtual tokens</dd></div></dl>
                </aside>
              </div>
              <div className="moderation-list">
                {(proofLeague.latestRecap?.moderation?.allowed ?? []).map((item) => <article className="moderation-row allowed" key={item.id}><StatusPill state="pass">Allowed</StatusPill><div><strong>{demoPlayerName(item.targetPlayerId)} · {item.tone}</strong><p>{item.text}</p></div><small>Within player + league tone limits</small></article>)}
                {(proofLeague.latestRecap?.moderation?.blocked ?? []).map((item) => <article className="moderation-row blocked" key={item.id}><StatusPill state="blocked">Blocked</StatusPill><div><strong>{demoPlayerName(item.targetPlayerId)} · {item.tone}</strong><p>{item.text}</p></div><small>{item.reason.replaceAll('_', ' ')}</small></article>)}
              </div>
            </section>

            <section className="proof-section">
              <div className="proof-heading"><div><span className="proof-step">03</span><h2>Consent-aware delivery</h2></div><StatusPill state="warn">1 fallback</StatusPill></div>
              <p className="proof-intro">The recap is sent as private, individualized broadcast SMS—not an unreliable carrier group thread. The in-app league conversation remains the shared reply surface.</p>
              <div className="delivery-list">
                {(proofLeague.latestBroadcast?.deliveries ?? []).map((delivery) => <article key={delivery.playerId}>
                  <div className="delivery-person"><span>{demoPlayerName(delivery.playerId).split(' ').map((word) => word[0]).join('')}</span><div><strong>{demoPlayerName(delivery.playerId)}</strong><small>SMS · private broadcast</small></div></div>
                  <StatusPill state={delivery.status === 'delivered' ? 'pass' : delivery.status === 'failed' ? 'blocked' : 'neutral'}>{delivery.status}</StatusPill>
                  <p>{delivery.status === 'delivered' ? `Provider receipt ${delivery.providerMessageId}` : delivery.status === 'failed' ? `${delivery.errorCode}: ${delivery.error}` : 'Provider not called — consent inactive'}</p>
                  <div className="fallback-state">{delivery.fallback ? <><strong>Fallback</strong><span>{delivery.fallback.channel.replace('_', '-')} · {delivery.fallback.status}</span></> : <span>No fallback needed</span>}</div>
                </article>)}
              </div>
              <div className="proof-callout warning"><span>!</span><p><strong>Jordan's carrier delivery failed after one retry.</strong> The system stopped retrying, preserved the error code, and delivered the same approved recap to Jordan's in-app inbox. Chris's row is a consent suppression, not a provider failure.</p></div>
            </section>

            <section className="proof-section">
              <div className="proof-heading"><div><span className="proof-step">04</span><h2>Mutual side bets</h2></div><StatusPill state="pass">Non-cash only</StatusPill></div>
              <div className="bet-proof-grid">
                {proofLeague.sideBets.map((bet) => <article className="bet-proof-card" key={bet.id}>
                  <div><StatusPill state={bet.proposalStatus === 'accepted' ? 'pass' : 'neutral'}>{bet.proposalStatus}</StatusPill><small>{bet.visibility.replaceAll('_', ' ')}</small></div>
                  <h3>{demoPlayerName(bet.creatorId)} <i>vs</i> {demoPlayerName(bet.opponentId)}</h3>
                  <p>{bet.event}</p><strong>{bet.stake.label}</strong>
                  {bet.settlementStatus === 'settled' ? <div className="settlement-box"><span>Settled from verified {weekLabel} standings</span><b>{demoPlayerName(bet.winnerId)} wins · {bet.creatorScore}–{bet.opponentScore}</b></div> : <div className="settlement-box neutral"><span>No locked terms · no settlement</span><b>Declined {new Date(bet.declinedAt).toLocaleString()}</b></div>}
                </article>)}
              </div>
            </section>

            <section className="proof-section audit-section">
              <div className="proof-heading"><div><span className="proof-step">05</span><h2>Admin approval & audit trail</h2></div><StatusPill state="pass">Traceable</StatusPill></div>
              <div className="policy-strip"><div><small>Auto-send</small><strong>Off</strong></div><div><small>Admin approval</small><strong>Required</strong></div><div><small>League tone cap</small><strong>Maximum</strong></div><div><small>SMS mode</small><strong>Individual broadcast</strong></div></div>
              <ol className="audit-timeline">{proofLeague.auditLog.map((entry) => <li key={entry.id ?? `${entry.at}-${entry.event}`}><time>{new Date(entry.at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time><div><strong>{entry.event}</strong><p>{entry.detail}</p></div></li>)}</ol>
            </section>
          </StandardPage>
        )}

        {view === 'ai' && (
          <StandardPage eyebrow="POWERED BY GEMINI" title="Commissioner's room" subtitle="AI tools grounded in the league data already on this page. Nothing here fetches live sports news or odds.">
            <div className="ai-grid">
              <AiCard number="01" title="League recap" description="Summarize the current pot, entries, standings, and completed games into a shareable update." button={aiResult.recap ? 'Rewrite recap' : 'Write recap'} loading={aiLoading === 'recap'} disabled={!weekSheets.length} onClick={getRecap} result={aiResult.recap} />
              <AiCard number="02" title="Sheet review" description="Check your current pick sheet for blanks, patterns, and tiebreaker readiness—without pretending to know the future." button={aiResult.picks ? 'Review again' : 'Review my sheet'} loading={aiLoading === 'picks'} onClick={analyzePicks} result={aiResult.picks} />
              <AiCard number="03" title="Trash-talk assist" description="Draft friendly banter from the actual standings, then edit it before anything is posted." button="Open chat" onClick={() => setView('chat')} />
              <AiCard number="04" title="League assistant" description="Ask Jack about standings, rules, schedules, your entry credits, or where to find something in the app." button="Ask Jack" onClick={() => setAssistantOpen(true)} />
            </div>
            <div className="ai-privacy"><span>✦</span><div><strong>{aiStatus.configured ? `Connected to ${aiStatus.model}` : 'Gemini API key required'}</strong><p>{aiStatus.configured ? 'Prompts are assembled on the server from league context. The API key never ships to the browser.' : 'Copy .env.example to .env, add GEMINI_API_KEY, and restart the development server.'}</p></div></div>
            {aiError && <p className="error-text standalone">{aiError}</p>}
          </StandardPage>
        )}

        {view === 'chat' && (
          <StandardPage eyebrow="KEEP IT FRIENDLY" title="League chat" subtitle="The place for victory laps, questionable predictions, and receipts.">
            <div className="chat-layout">
              <section className="chat-panel">
                <div className="messages">
                  {chatMsgs.length ? chatMsgs.map((message) => <article className={message.name === chatName ? 'mine' : ''} key={message.id}><div><strong>{message.name}</strong><time>{new Date(message.time).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</time></div><p>{message.msg}</p></article>) : <div className="empty-chat"><span>"</span><p>No messages yet. The group chat is showing remarkable restraint.</p></div>}
                </div>
                <div className="composer">
                  <input className="name-input" value={chatName} onChange={(event) => setChatName(event.target.value)} placeholder="Your name" maxLength="40" />
                  {showEmoji && <div className="emoji-row">{EMOJIS.map((emoji) => <button type="button" key={emoji} onClick={() => setChatInput((current) => current + emoji)}>{emoji}</button>)}</div>}
                  <div className="message-input"><button type="button" onClick={() => setShowEmoji((current) => !current)}>☺</button><input value={chatInput} onChange={(event) => setChatInput(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && sendChat()} placeholder="Write something you can defend later…" maxLength="400" /><button className="send" type="button" onClick={sendChat}>Send ↑</button></div>
                </div>
              </section>
              <aside className="trash-assist"><span className="eyebrow dark">GEMINI ASSIST</span><h2>Need a line?</h2><p>Choose a tone. Gemini uses only the standings above and any idea already in your draft.</p>
                <div className="tone-picker">{['playful', 'bold', 'deadpan'].map((tone) => <button className={trashTone === tone ? 'active' : ''} type="button" key={tone} onClick={() => setTrashTone(tone)}>{tone}</button>)}</div>
                <button className="button button-primary full" type="button" onClick={draftTrashTalk} disabled={aiLoading === 'trashTalk'}>{aiLoading === 'trashTalk' ? 'Drafting…' : '✦ Draft trash talk'}</button>
                <small>Gemini drafts; you decide what gets posted.</small>{aiError && <p className="error-text">{aiError}</p>}
              </aside>
            </div>
          </StandardPage>
        )}

        {view === 'rules' && (
          <StandardPage eyebrow="THE FINE PRINT" title="House rules" subtitle="Simple enough to explain before kickoff. Firm enough to settle Monday-night arguments.">
            <div className="rules-grid">
              <Rule number="01" title="Entry" text={`Each sheet costs $${ENTRY_FEE}. Payment must be confirmed before picks can be locked.`} />
              <Rule number="02" title="Picks" text={`Select one winner for all ${currentGames.length} games. A locked sheet cannot be edited in this demo.`} />
              <Rule number="03" title="Scoring" text="Every correct winner earns one point. The highest total after every game wins the weekly pot." />
              <Rule number="04" title="Tiebreaker" text="Closest total without going over wins. Going over busts. If every tied player busts, the pot rolls over." />
            </div>
          </StandardPage>
        )}

        {view === 'admin' && !isComm && (
          <StandardPage eyebrow="RESTRICTED AREA" title="Commissioner sign-in" subtitle="Result verification, recap approval, broadcasts, and settlements require a server-verified admin session.">
            <form className="admin-login-card" onSubmit={loginAdmin}>
              <span>BT</span><h2>Open league operations</h2><p>The local demo password is documented in the README. Set a unique ADMIN_PASSWORD before deployment.</p>
              <label>Password<input type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} placeholder="Commissioner password" /></label>
              <button className="button button-primary full" disabled={!adminPassword || serverBusy === 'admin-login'}>{serverBusy === 'admin-login' ? 'Signing in…' : 'Sign in securely →'}</button>
            </form>
          </StandardPage>
        )}

        {view === 'admin' && isComm && (
          <StandardPage eyebrow="COMMISSIONER ACCESS" title="League operations" subtitle="Verify scores, generate and approve grounded recaps, send consent-aware broadcasts, and inspect delivery outcomes from one durable workflow.">
            <section className="admin-command-grid">
              <article><span className="eyebrow dark">PROVIDERS</span><h2>System readiness</h2><dl><div><dt>Database</dt><dd>{aiStatus.database === 'postgres' ? 'Neon Postgres · durable' : aiStatus.database === 'sqlite' ? 'SQLite · local' : 'Unavailable'}</dd></div><div><dt>Gemini</dt><dd>{aiStatus.configured ? aiStatus.model : 'Fallback mode'}</dd></div><div><dt>SMS</dt><dd>{aiStatus.smsProvider === 'twilio' ? 'Twilio live' : aiStatus.smsProvider === 'textbelt' ? 'TextBelt live' : 'Demo adapter'}</dd></div></dl></article>
              <article><span className="eyebrow dark">POLICY</span><h2>Send guardrails</h2><dl><div><dt>Auto-send</dt><dd>Off</dd></div><div><dt>Approval</dt><dd>Required</dd></div><div><dt>Tone cap</dt><dd>{proofLeague.settings.maximumTone}</dd></div></dl></article>
              <article><span className="eyebrow dark">CURRENT</span><h2>Latest delivery</h2><dl><div><dt>Status</dt><dd>{proofLeague.latestBroadcast?.status?.replaceAll('_', ' ') ?? 'Not sent'}</dd></div><div><dt>Failures</dt><dd>{proofLeague.latestBroadcast?.deliveries?.filter((item) => item.status === 'failed').length ?? 0}</dd></div><div><dt>Suppressed</dt><dd>{proofLeague.latestBroadcast?.deliveries?.filter((item) => item.status === 'suppressed').length ?? 0}</dd></div></dl></article>
            </section>
            <section className="recap-workbench">
              <div className="panel-heading"><div><span className="eyebrow dark">WEEKLY WORKFLOW</span><h2>Recap review & send</h2></div><StatusPill state={proofLeague.latestRecap?.adminApproval?.status === 'approved' ? 'pass' : 'warn'}>{proofLeague.latestRecap?.adminApproval?.status ?? 'no draft'}</StatusPill></div>
              <div className="workflow-steps"><span className="done">1 · Results verified</span><span className={proofLeague.latestRecap ? 'done' : ''}>2 · Draft generated</span><span className={proofLeague.latestRecap?.adminApproval?.status === 'approved' ? 'done' : ''}>3 · Admin approved</span><span className={proofLeague.latestBroadcast?.recapId === proofLeague.latestRecap?.id ? 'done' : ''}>4 · Broadcast sent</span></div>
              <textarea value={recapEdit} onChange={(event) => setRecapEdit(event.target.value)} maxLength="3200" aria-label="Recap copy" />
              <div className="workflow-actions"><button className="button button-ghost-dark" type="button" onClick={generateAdminRecap} disabled={serverBusy === 'generate-recap'}>{serverBusy === 'generate-recap' ? 'Generating…' : 'Generate grounded draft'}</button><button className="button button-primary" type="button" onClick={approveAdminRecap} disabled={!proofLeague.latestRecap || serverBusy === 'approve-recap'}>{serverBusy === 'approve-recap' ? 'Approving…' : 'Approve edited copy'}</button><button className="button button-send" type="button" onClick={sendAdminBroadcast} disabled={proofLeague.latestRecap?.adminApproval?.status !== 'approved' || serverBusy === 'send-broadcast'}>{serverBusy === 'send-broadcast' ? 'Sending…' : `Send via ${aiStatus.smsProvider === 'twilio' ? 'Twilio' : aiStatus.smsProvider === 'textbelt' ? 'TextBelt' : 'demo adapter'}`}</button></div>
              <p>Only verified, opted-in recipients reach the provider. Failures retry once and then receive an in-app fallback.</p>
              <div className="jack-text-row">
                <div><strong>📱 Jack's weekly text</strong><p>Texts every opted-in player their results, the reigning champ shoutout, and a personal (PG-13 over SMS) jab. Full-strength roasts stay in the app.</p></div>
                <button className="button button-send" type="button" onClick={sendJackText} disabled={serverBusy === 'jack-text'}>{serverBusy === 'jack-text' ? 'Texting…' : 'Send Jack\'s texts'}</button>
              </div>
            </section>
            <JackControlStudio
              settings={serverLeague?.settings}
              players={proofLeague.players}
              auditLog={proofLeague.auditLog ?? []}
              winnerIds={leaderboard.length && completedGames === currentGames.length ? [leaderboard[0]?.playerId].filter(Boolean) : []}
              onSaveLeague={saveJackLeagueSettings}
              onSavePlayer={saveJackPlayerPolicy}
            />
            <div className="admin-toolbar">
              <label>Rollover pot ($)<input type="number" min="0" value={rolloverPot} onChange={(event) => setRolloverPot(Number(event.target.value || 0))} /></label>
              <p>{completedGames} results posted</p>
              <button className="button button-ghost-dark" type="button" onClick={syncFinals} disabled={serverBusy === 'sync-finals'}>{serverBusy === 'sync-finals' ? 'Syncing…' : '⚡ Sync finals from live feed'}</button>
              <button className="button button-ghost-dark" type="button" onClick={sendPickReminders} disabled={serverBusy === 'reminders' || weekLocked}>{serverBusy === 'reminders' ? 'Sending…' : '⏰ Text pick reminders'}</button>
            </div>
            <div className="admin-games">{currentGames.map((game) => {
              const gameResult = results[game.id] ?? {};
              const setWinner = async () => {
                const awayScore = Number(gameResult.awayScore);
                const homeScore = Number(gameResult.homeScore);
                if (!Number.isFinite(awayScore) || !Number.isFinite(homeScore) || awayScore === homeScore) return notify('Enter two different final scores.');
                try {
                  await apiRequest(`/api/leagues/${LEAGUE_ID}/results/${game.id}`, { method: 'PUT', body: JSON.stringify({ awayScore, homeScore }) });
                  await loadLeague();
                  notify(`${game.away} at ${game.home} verified and audited.`);
                } catch (error) { notify(error.message); }
              };
              return <article key={game.id}><div><span>{game.away} <i>at</i> {game.home}</span><small>{game.time}</small></div><label>{game.away}<input type="number" min="0" value={gameResult.awayScore ?? ''} onChange={(event) => setResults((current) => ({ ...current, [game.id]: { ...current[game.id], awayScore: event.target.value === '' ? '' : Number(event.target.value), winner: undefined } }))} /></label><label>{game.home}<input type="number" min="0" value={gameResult.homeScore ?? ''} onChange={(event) => setResults((current) => ({ ...current, [game.id]: { ...current[game.id], homeScore: event.target.value === '' ? '' : Number(event.target.value), winner: undefined } }))} /></label><button type="button" className={gameResult.winner ? 'final' : ''} onClick={setWinner}>{gameResult.winner ? `${gameResult.winner} final ✓` : 'Set final'}</button></article>;
            })}</div>
          </StandardPage>
        )}
      </main>

      {/* ── Floating Ask Jack Button ── */}
      <button className="jack-fab" type="button" onClick={() => setAssistantOpen(true)} aria-label="Ask Jack">
        <span className="jack-fab-icon">✦</span>
        <span className="jack-fab-label">Ask Jack</span>
      </button>

      {/* ── Jack Assistant Drawer ── */}
      {assistantOpen && (
        <div className="assistant-overlay" onClick={(e) => e.target === e.currentTarget && setAssistantOpen(false)}>
          <div className="assistant-drawer">
            <div className="assistant-header">
              <div className="assistant-title">
                <JackAvatar state={jackAvatarState} settings={serverLeague?.settings} compact caption={assistantBusy ? 'Thinking…' : assistantSpeaking ? 'Speaking…' : 'Ready'} />
                <div><strong>Jack</strong><small>League commissioner AI</small></div>
              </div>
              <button className="assistant-close" type="button" onClick={() => { setAssistantOpen(false); stopSpeaking(); setJackAvatarState('idle'); }}>×</button>
            </div>

            <div className="assistant-quick-prompts">
              {JACK_QUICK_PROMPTS.map((prompt) => (
                <button key={prompt} type="button" onClick={() => askAssistant(prompt)} disabled={assistantBusy}>{prompt}</button>
              ))}
            </div>

            <div className="assistant-messages">
              {assistantMessages.map((msg) => (
                <div className={`assistant-msg ${msg.role}`} key={msg.id}>
                  {msg.role === 'assistant' && <span className="msg-avatar">✦</span>}
                  <div className="msg-bubble">
                    <p>{msg.text}</p>
                    {msg.role === 'assistant' && msg.id !== 'assistant-welcome' && (
                      <button className="msg-speak" type="button" onClick={() => assistantSpeaking ? stopSpeaking() : readAssistantMessage(msg.text)} title={assistantSpeaking ? 'Stop' : 'Listen'}>
                        {assistantSpeaking ? '■' : '🔊'}
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {assistantBusy && (
                <div className="assistant-msg assistant">
                  <span className="msg-avatar">✦</span>
                  <div className="msg-bubble typing"><span /><span /><span /></div>
                </div>
              )}
              <div ref={assistantEndRef} />
            </div>

            <div className="assistant-composer">
              <input
                value={assistantInput}
                onChange={(e) => setAssistantInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && askAssistant()}
                placeholder="Ask Jack anything…"
                maxLength="500"
                disabled={assistantBusy}
              />
              <button className="assistant-send" type="button" onClick={() => askAssistant()} disabled={!assistantInput.trim() || assistantBusy}>
                {assistantBusy ? '…' : '↑'}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer><span>405 BadGuys Parlay · {weekLabel}</span><span>Built for bragging rights</span></footer>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function StandardPage({ eyebrow, title, subtitle, children }) {
  return <div className="standard-page"><div className="page-title"><span className="eyebrow dark">{eyebrow}</span><h1>{title}</h1><p>{subtitle}</p></div>{children}</div>;
}

function EmptyState({ icon, title, text, action, onAction }) {
  return <div className="empty-state"><span>{icon}</span><h2>{title}</h2><p>{text}</p><button className="button button-primary" type="button" onClick={onAction}>{action} →</button></div>;
}

function AiCard({ number, title, description, button, loading, disabled, onClick, result }) {
  return <article className="ai-card"><span>{number}</span><h2>{title}</h2><p>{description}</p>{result && <div className="ai-card-result">{result}</div>}<button className="text-button" type="button" disabled={disabled || loading} onClick={onClick}>{loading ? 'Thinking…' : `${button} ↗`}</button></article>;
}

function Rule({ number, title, text }) {
  return <article><span>{number}</span><h2>{title}</h2><p>{text}</p></article>;
}

function ProofMetric({ value, label, state }) {
  return <article className={state}><strong>{value}</strong><span>{label}</span><i>✓</i></article>;
}

function StatusPill({ state = 'neutral', children }) {
  return <span className={`proof-status ${state}`}>{children}</span>;
}

function PlayerSessionPanel({ players, session, login, setLogin, onLogin, onLogout, busy }) {
  if (session.authenticated) return <div className="player-session active"><div><span>{session.name.split(' ').map((word) => word[0]).join('')}</span><p><strong>Signed in as {session.name}</strong><small>Player-owned controls are unlocked only for this identity.</small></p></div><button type="button" onClick={onLogout}>Switch player</button></div>;
  return <form className="player-session" onSubmit={onLogin}><div><span>◎</span><p><strong>Player sign-in</strong><small>Demo PIN is the last four visible phone digits. Production should replace this with OTP verification.</small></p></div><label>Player<select aria-label="Player identity" value={login.playerId} onChange={(event) => setLogin((current) => ({ ...current, playerId: event.target.value }))}>{players.map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}</select></label><label>PIN<input aria-label="Player PIN" type="password" inputMode="numeric" maxLength="4" value={login.pin} onChange={(event) => setLogin((current) => ({ ...current, pin: event.target.value.replace(/\D/g, '') }))} /></label><button type="submit" disabled={busy || login.pin.length !== 4}>{busy ? 'Signing in…' : 'Sign in'}</button></form>;
}

function AppWithErrorBoundary() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}

export default AppWithErrorBoundary;
