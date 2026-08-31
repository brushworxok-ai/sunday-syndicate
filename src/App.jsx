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
import { EMOJIS, ENTRY_FEE, DEADLINE_HOURS_BEFORE_KICKOFF, SCHEDULE, SEASON, WEEK, getGames, getWeek, getByeTeams, getCurrentWeek, getWeekDeadline, isWeekLocked, formatCountdown, TEAMS, TEAM_COLORS, getTeamLogoUrl } from './data.js';
import { DEMO_CHAT, DEMO_LEAGUE } from './demoLeague.js';
import JackControlStudio, { JackAvatar } from './JackExperience.jsx';
import { buildWinningPaths } from './winningPaths.js';
import { deriveSurvivorPool, findTeamGame } from './survivor.js';
import { gradeCfbPool, getTiebreakerGame } from './cfbPool.js';
import { getTiebreakerActual, tiebreakerRank, tiebreakerBusted } from './tiebreaker.js';
import { creditBalance } from './credits.js';

/* ── Simplified 5-tab nav with More menu ── */
const MAIN_NAV = [
  ['home',    'Home',    '🏠'],
  ['picks',   'Picks',   '🏈'],
  ['results', 'Board',   '📊'],
  ['chat',    'Chat',    '💬'],
  ['more',    'More',    '☰'],
];

const MORE_ITEMS = [
  ['live',     'Game Day Live',    '🔴', 'Live scores, picks & projected standings'],
  ['stats',    'Player Stats',     '📊', 'Tendencies, streaks & head-to-head'],
  ['season',   'Season',           '🏆', 'Full-season standings & payouts'],
  ['survivor', 'Survivor',         '🛡️', "One team a week. Lose once, you're out."],
  ['props',    'Prop Picks',       '🎯', 'Passing, rushing, first TD & more'],
  ['cfb',      'College FB',       '🏟️', 'CFB rankings, games & pick-em pools'],
  ['payments', 'My Payments',      '💰', 'Payment history & balance'],
  ['notifs',   'Notifications',    '🔔', 'Reminders, payouts & messages'],
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
  const [signupStep, setSignupStep] = useState(1); // 1: info, 2: team+avatar, 3: OTP verify
  const [signupOtp, setSignupOtp] = useState('');
  const [otpSending, setOtpSending] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
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
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushSupported] = useState(() => 'serviceWorker' in navigator && 'PushManager' in window);
  const [paymentHistory, setPaymentHistory] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [groupTextMsg, setGroupTextMsg] = useState('');
  const [groupTextMode, setGroupTextMode] = useState('individual');

  // Prop picks state
  const [propPicks, setPropPicks] = useState({});
  const PROP_CATEGORIES = useMemo(() => [
    { id: 'passing', label: 'Most Passing Yards', icon: '🎯', desc: 'Which QB throws for the most yards this week?' },
    { id: 'rushing', label: 'Most Rushing Yards', icon: '🏃', desc: 'Which RB racks up the most rushing yards?' },
    { id: 'firstTd', label: 'First Touchdown Scorer', icon: '🏈', desc: 'Who scores the first TD of the week?' },
    { id: 'turnovers', label: 'Turnovers O/U (Kickoff Game)', icon: '🔄', desc: 'Over or under 4.5 total turnovers in the week\'s opening game?' },
  ], []);
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

  // Load this player's saved prop picks for the selected week from the server
  useEffect(() => {
    const saved = serverLeague?.settings?.propPicks?.[selectedWeek]?.[playerSession.playerId];
    if (saved) {
      const { savedAt, ...picks } = saved;
      setPropPicks(picks);
    } else {
      setPropPicks({});
    }
  }, [serverLeague?.settings?.propPicks, selectedWeek, playerSession.playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Season-long prop standings: categories won per player across all settled weeks
  const propStandings = useMemo(() => {
    const allPicks = serverLeague?.settings?.propPicks ?? {};
    const allResults = serverLeague?.settings?.propResults ?? {};
    const players = serverLeague?.players ?? [];
    const rows = new Map();
    const ensure = (playerId) => {
      if (!rows.has(playerId)) {
        const player = players.find((p) => p.id === playerId);
        rows.set(playerId, { playerId, name: player?.name ?? 'Unknown', wins: 0, weeksPlayed: 0 });
      }
      return rows.get(playerId);
    };
    for (const [, weekPicks] of Object.entries(allPicks)) {
      for (const playerId of Object.keys(weekPicks)) ensure(playerId).weeksPlayed += 1;
    }
    for (const [, result] of Object.entries(allResults)) {
      for (const winnerIds of Object.values(result?.winners ?? {})) {
        for (const playerId of winnerIds) ensure(playerId).wins += 1;
      }
    }
    return [...rows.values()].sort((a, b) => b.wins - a.wins || b.weeksPlayed - a.weeksPlayed || a.name.localeCompare(b.name));
  }, [serverLeague?.settings?.propPicks, serverLeague?.settings?.propResults, serverLeague?.players]);

  // Season-long player stats: tendencies, best/worst weeks, head-to-head
  const playerStats = useMemo(() => {
    const allResults = serverLeague?.results ?? {};
    const byPlayer = new Map();
    for (const sheet of sheets) {
      const key = sheet.playerId ?? `name:${sheet.name}`;
      if (!byPlayer.has(key)) byPlayer.set(key, { key, name: sheet.name, weeks: [], teamCounts: {}, homePicks: 0, totalPicks: 0 });
      const row = byPlayer.get(key);
      const games = getGames(sheet.week);
      let score = 0;
      for (const game of games) {
        const pick = sheet.picks[game.id];
        if (!pick) continue;
        row.totalPicks += 1;
        row.teamCounts[pick] = (row.teamCounts[pick] ?? 0) + 1;
        if (pick === game.home) row.homePicks += 1;
        if (allResults[game.id]?.winner && allResults[game.id].winner === pick) score += 1;
      }
      const scored = games.some((g) => allResults[g.id]?.winner);
      row.weeks.push({ week: sheet.week, score, gameCount: games.length, scored });
    }
    const players = [...byPlayer.values()].map((row) => {
      const scoredWeeks = row.weeks.filter((w) => w.scored);
      const totalCorrect = scoredWeeks.reduce((sum, w) => sum + w.score, 0);
      const best = scoredWeeks.length ? scoredWeeks.reduce((a, b) => (b.score > a.score ? b : a)) : null;
      const worst = scoredWeeks.length ? scoredWeeks.reduce((a, b) => (b.score < a.score ? b : a)) : null;
      const favorite = Object.entries(row.teamCounts).sort((a, b) => b[1] - a[1])[0] ?? null;
      return {
        ...row, totalCorrect,
        avg: scoredWeeks.length ? (totalCorrect / scoredWeeks.length).toFixed(1) : '—',
        best, worst, favorite,
        homePct: row.totalPicks ? Math.round((row.homePicks / row.totalPicks) * 100) : 0,
      };
    }).sort((a, b) => b.totalCorrect - a.totalCorrect);
    // Head-to-head: weeks where both played, who scored higher
    const h2h = {};
    for (const a of players) {
      for (const b of players) {
        if (a.key === b.key) continue;
        let wins = 0; let losses = 0;
        for (const wa of a.weeks.filter((w) => w.scored)) {
          const wb = b.weeks.find((w) => w.week === wa.week && w.scored);
          if (!wb) continue;
          if (wa.score > wb.score) wins += 1;
          else if (wa.score < wb.score) losses += 1;
        }
        h2h[`${a.key}|${b.key}`] = { wins, losses };
      }
    }
    return { players, h2h };
  }, [sheets, serverLeague?.results]);

  const savePropPicks = async () => {
    if (!playerSession.authenticated) return notify('Sign in as a player to save prop picks.');
    setServerBusy('prop-save');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/props`, { method: 'POST', body: JSON.stringify({ week: selectedWeek, picks: propPicks }) });
      await loadLeague();
      notify(`Prop picks saved for ${weekLabel}. Good luck.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const [propSettleWinners, setPropSettleWinners] = useState({});
  const autoSettleProps = async (force = false) => {
    setServerBusy('prop-auto');
    try {
      const result = await apiRequest(`/api/leagues/${LEAGUE_ID}/props/auto-settle`, { method: 'POST', body: JSON.stringify({ week: selectedWeek, force }) });
      await loadLeague();
      const f = result.facts ?? {};
      notify(`Auto-settled from ESPN: passing ${f.passing?.player ?? '—'}, rushing ${f.rushing?.player ?? '—'}, first TD ${f.firstTd?.player ?? '—'}, turnovers ${f.turnoverCount ?? '—'} (${f.turnovers ?? '—'}).`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };
  const settlePropWeek = async () => {
    setServerBusy('prop-settle');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/props/settle`, { method: 'POST', body: JSON.stringify({ week: selectedWeek, winners: propSettleWinners }) });
      await loadLeague();
      setPropSettleWinners({});
      notify(`Prop winners settled for ${weekLabel}.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };
  const [betForm, setBetForm] = useState({ creatorId: 'player-marcus', opponentId: 'player-taylor', event: `Week ${selectedWeek} final pick score`, terms: 'Higher verified weekly score wins', settlementRule: 'compare_weekly_score', stakeType: 'virtual_tokens', stakeAmount: 10, stakeLabel: '10 Syndicate tokens', optionalMessage: '' });
  const [recapEdit, setRecapEdit] = useState(DEMO_LEAGUE.recap.finalText);
  const [recapShow, setRecapShow] = useState(null); // { slides, narration, week }
  const [recapShowLoading, setRecapShowLoading] = useState(false);
  const [recapSlideIndex, setRecapSlideIndex] = useState(0);

  // CFB state
  const [cfbRankings, setCfbRankings] = useState(null);
  const [cfbGames, setCfbGames] = useState(null);
  const [cfbWeek, setCfbWeek] = useState(1);
  const [cfbLoading, setCfbLoading] = useState('');

  // CashApp Pool state
  const [cashAppPoolUrl, setCashAppPoolUrl] = useState('');
  const [cashAppPoolLabel, setCashAppPoolLabel] = useState('');

  // CFB Pick-Em pool state
  const [cfbSelected, setCfbSelected] = useState(() => new Set());
  const [cfbEntryFee, setCfbEntryFee] = useState(10);
  const [cfbMyPicks, setCfbMyPicks] = useState({});
  const [cfbTiebreaker, setCfbTiebreaker] = useState('');
  const [cfbBuilderOpen, setCfbBuilderOpen] = useState(false);

  // Player credit form (admin)
  const [creditForm, setCreditForm] = useState({ playerId: '', amount: '', reason: '' });

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

  const loadPaymentHistory = useCallback(async () => {
    if (!playerSession.authenticated) return;
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/payment-history`);
      setPaymentHistory(data);
    } catch { /* non-fatal */ }
  }, [playerSession.authenticated]);

  const loadNotifications = useCallback(async () => {
    if (!playerSession.authenticated) return;
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/notifications`);
      setNotifications(data.notifications ?? []);
    } catch { /* non-fatal */ }
  }, [playerSession.authenticated]);

  // Load payment & notification data when switching to those views
  useEffect(() => {
    if (view === 'payments') loadPaymentHistory();
    if (view === 'notifs') loadNotifications();
  }, [view, loadPaymentHistory, loadNotifications]);

  // Deep-link: open the view specified in ?view= (e.g. invite links)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v) {
      const valid = [...MAIN_NAV.map(([id]) => id), ...MORE_ITEMS.map(([id]) => id)];
      if (valid.includes(v)) setView(v);
      else if (v === 'join') setShowWelcome(true);
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

  // Auto-fill chat name from player session
  useEffect(() => {
    if (playerSession.authenticated && playerSession.name && !chatName) {
      setChatName(playerSession.name);
    }
  }, [playerSession.authenticated, playerSession.name]);

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

  // Game-day live: provisional winner per game (final result, else current leader)
  const liveProvisional = useMemo(() => {
    const map = {};
    for (const game of currentGames) {
      const final = results[game.id];
      if (final?.winner) { map[game.id] = { winner: final.winner, final: true, awayScore: final.awayScore, homeScore: final.homeScore, state: 'post' }; continue; }
      const live = liveByGame[game.id];
      if (live && live.state !== 'pre') {
        const winner = live.awayScore === live.homeScore ? null : (live.awayScore > live.homeScore ? live.away : live.home);
        map[game.id] = { winner, final: false, awayScore: live.awayScore, homeScore: live.homeScore, state: live.state, detail: live.detail };
      }
    }
    return map;
  }, [currentGames, results, liveByGame]);

  // "If games ended now" standings for the selected week
  const liveStandings = useMemo(() => {
    const rows = weekSheets.map((sheet) => {
      let locked = 0; let leading = 0;
      for (const game of currentGames) {
        const prov = liveProvisional[game.id];
        if (!prov?.winner) continue;
        if (sheet.picks[game.id] === prov.winner) { if (prov.final) locked += 1; else leading += 1; }
      }
      return { id: sheet.id, name: sheet.name, playerId: sheet.playerId, locked, leading, projected: locked + leading, tiebreaker: sheet.tiebreaker };
    });
    return rows.sort((a, b) => b.projected - a.projected || b.locked - a.locked || a.name.localeCompare(b.name));
  }, [weekSheets, currentGames, liveProvisional]);
  const completedGames = Object.values(results).filter((result) => result.winner).length;
  const pot = weekSheets.filter((sheet) => sheet.paid).length * ENTRY_FEE;
  const totalPot = pot + Number(rolloverPot || 0);

  const calcScore = (sheet) => Object.entries(sheet.picks).reduce(
    (score, [gameId, pick]) => score + (results[gameId]?.winner === pick ? 1 : 0),
    0,
  );

  // Tiebreaker: closest to the tiebreaker game's actual total WITHOUT going
  // over — going over busts. Until that game's score is final, ties stand.
  const weekTiebreaker = useMemo(() => getTiebreakerActual(currentGames, results), [currentGames, results]);
  const leaderboard = useMemo(() => weekSheets
    .map((sheet) => ({
      ...sheet,
      score: calcScore(sheet),
      tiebreakerBusted: tiebreakerBusted(sheet.tiebreaker, weekTiebreaker.total),
    }))
    .sort((a, b) => b.score - a.score
      || tiebreakerRank(a.tiebreaker, weekTiebreaker.total) - tiebreakerRank(b.tiebreaker, weekTiebreaker.total)), [weekSheets, results, weekTiebreaker]);

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
      const tbTotal = getTiebreakerActual(games, results).total;
      const scored = ws.map((s) => ({ ...s, score: calcScore(s) }))
        .sort((a, b) => b.score - a.score || tiebreakerRank(a.tiebreaker, tbTotal) - tiebreakerRank(b.tiebreaker, tbTotal));
      const top = scored[0];
      const winners = complete && top
        ? scored.filter((s) => s.score === top.score && tiebreakerRank(s.tiebreaker, tbTotal) === tiebreakerRank(top.tiebreaker, tbTotal))
        : [];
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
    // Season pool goes to the best COMBINED record — most total correct picks
    // across every weekly sheet all season — not the most weekly wins.
    const table = [...players.values()]
      .map((row) => ({ ...row, winPct: row.totalPicks ? Math.round((row.totalCorrect / row.totalPicks) * 1000) / 10 : 0 }))
      .sort((a, b) => b.totalCorrect - a.totalCorrect || b.winPct - a.winPct || b.weeklyWins - a.weeklyWins || a.name.localeCompare(b.name));
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


  // CFB data loaders
  const loadCfbRankings = async () => {
    setCfbLoading('rankings');
    try {
      const data = await apiRequest('/api/cfb/rankings');
      setCfbRankings(data);
    } catch (error) { notify(error.message); }
    finally { setCfbLoading(''); }
  };

  const loadCfbGames = async (week) => {
    setCfbLoading('games');
    try {
      const data = await apiRequest(`/api/cfb/scoreboard?week=${week}`);
      setCfbGames(data);
    } catch (error) { notify(error.message); }
    finally { setCfbLoading(''); }
  };

  // CashApp Pool link
  const saveCashAppPool = async (urlOverride, labelOverride) => {
    if (!(await ensureAdmin())) return;
    const url = (urlOverride ?? (cashAppPoolUrl || serverLeague?.settings?.cashAppPool?.url || '')).trim();
    const label = (labelOverride ?? (cashAppPoolLabel || serverLeague?.settings?.cashAppPool?.label || '')).trim();
    setServerBusy('cashapp-pool');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/cashapp-pool`, { method: 'PATCH', body: JSON.stringify({ url, label }) });
      await loadLeague();
      notify(url ? 'Cash App Pool link saved — players will see the pay button now.' : 'Cash App Pool link cleared.');
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  // ── CFB Pick-Em pool ──
  const cfbPool = useMemo(
    () => (serverLeague?.cfbPools ?? []).find((p) => p.week === cfbWeek) ?? null,
    [serverLeague, cfbWeek],
  );
  const cfbBoard = useMemo(() => (cfbPool ? gradeCfbPool(cfbPool) : null), [cfbPool]);
  const cfbMyEntry = cfbPool?.entries?.[playerSession.playerId] ?? null;
  const cfbTbGame = useMemo(() => (cfbPool ? getTiebreakerGame(cfbPool) : null), [cfbPool]);

  // Auto-load games + rankings the first time the CFB page opens
  useEffect(() => {
    if (view !== 'cfb') return;
    if (!cfbGames) loadCfbGames(cfbWeek);
    if (!cfbRankings) loadCfbRankings();
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  // Pre-fill my existing picks when the pool or sign-in changes
  useEffect(() => {
    if (cfbMyEntry) {
      setCfbMyPicks(cfbMyEntry.picks ?? {});
      setCfbTiebreaker(String(cfbMyEntry.tiebreaker ?? ''));
    } else {
      setCfbMyPicks({});
      setCfbTiebreaker('');
    }
  }, [cfbPool?.id, playerSession.playerId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleCfbGame = (gameId) => {
    setCfbSelected((current) => {
      const next = new Set(current);
      if (next.has(gameId)) next.delete(gameId);
      else if (next.size < 20) next.add(gameId);
      return next;
    });
  };

  const createCfbPool = async () => {
    if (!(await ensureAdmin())) return;
    setServerBusy('cfb-pool-create');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/cfb-pool`, {
        method: 'POST',
        body: JSON.stringify({ week: cfbWeek, entryFee: Number(cfbEntryFee) || 0, gameIds: [...cfbSelected] }),
      });
      await loadLeague();
      setCfbSelected(new Set());
      setCfbBuilderOpen(false);
      notify(`Week ${cfbWeek} CFB pool is live — players can pick now.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const patchCfbPool = async (status) => {
    if (!cfbPool || !(await ensureAdmin())) return;
    setServerBusy('cfb-pool-status');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/cfb-pool/${cfbPool.id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
      await loadLeague();
      notify(status === 'locked' ? 'Pool locked — no more pick changes.' : status === 'open' ? 'Pool reopened for picks.' : 'Pool finalized.');
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const submitCfbPicks = async () => {
    if (!cfbPool) return;
    if (!playerSession.authenticated) return notify('Sign in as a player to lock in your CFB picks.');
    setServerBusy('cfb-picks');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/cfb-pool/${cfbPool.id}/picks`, {
        method: 'POST',
        body: JSON.stringify({ picks: cfbMyPicks, tiebreaker: Number(cfbTiebreaker) }),
      });
      await loadLeague();
      notify(`Your Week ${cfbPool.week} CFB picks are locked in. Good luck! 🏟️`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const syncCfbScores = async () => {
    if (!cfbPool || !(await ensureAdmin())) return;
    setServerBusy('cfb-sync');
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/cfb-pool/${cfbPool.id}/sync-scores`, { method: 'POST' });
      await loadLeague();
      notify(data.allFinal ? 'All games final — pool graded and complete. 🏆' : `Scores synced for ${data.updated} game${data.updated === 1 ? '' : 's'}.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const toggleCfbPaid = async (playerId, nextPaid) => {
    if (!cfbPool || !(await ensureAdmin())) return;
    setServerBusy(`cfb-paid-${playerId}`);
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/cfb-pool/${cfbPool.id}/paid`, { method: 'PATCH', body: JSON.stringify({ playerId, paid: nextPaid }) });
      await loadLeague();
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  // ── Player credits ──
  const myCredit = useMemo(
    () => (playerSession.authenticated ? creditBalance(serverLeague?.creditLedger ?? [], playerSession.playerId) : 0),
    [serverLeague, playerSession],
  );

  const payCfbWithCredit = async () => {
    if (!cfbPool) return;
    setServerBusy('cfb-credit-pay');
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/cfb-pool/${cfbPool.id}/pay-with-credit`, { method: 'POST' });
      await loadLeague();
      notify(`Paid $${cfbPool.entryFee} from your credit — $${data.balance} left. You're locked and loaded. ✅`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const paySheetWithCredit = async (sheetId) => {
    setServerBusy('sheet-credit-pay');
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/sheets/${sheetId}/pay-with-credit`, { method: 'POST' });
      await loadLeague();
      notify(`Entry paid from your credit — $${data.balance} left. ✅`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const addCredit = async () => {
    if (!(await ensureAdmin())) return;
    setServerBusy('credit-add');
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/credits`, {
        method: 'POST',
        body: JSON.stringify({ playerId: creditForm.playerId, amount: Number(creditForm.amount), reason: creditForm.reason }),
      });
      await loadLeague();
      setCreditForm((current) => ({ ...current, amount: '', reason: '' }));
      notify(`Credit updated — new balance $${data.balance}.`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const creditCfbWinners = async () => {
    if (!cfbPool || !(await ensureAdmin())) return;
    setServerBusy('cfb-credit-winners');
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/cfb-pool/${cfbPool.id}/credit-winners`, { method: 'POST' });
      await loadLeague();
      notify(`$${data.pot} pot credited: $${data.share} to ${data.winners.join(' & ')}. 🏆`);
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  // ── Payment claims ──
  const claimSheetPayment = async (sheetId) => {
    setServerBusy('claim-sheet');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/sheets/${sheetId}/claim-payment`, { method: 'POST' });
      await loadLeague();
      notify('Got it — the commissioner sees your payment claim and will confirm it. ⏳');
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const claimCfbPayment = async () => {
    if (!cfbPool) return;
    setServerBusy('claim-cfb');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/cfb-pool/${cfbPool.id}/claim-payment`, { method: 'POST' });
      await loadLeague();
      notify('Got it — the commissioner sees your payment claim and will confirm it. ⏳');
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const confirmSheetPaid = async (sheetId, nextPaid) => {
    if (!(await ensureAdmin())) return;
    setServerBusy(`sheet-paid-${sheetId}`);
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/sheets/${sheetId}/paid`, { method: 'PATCH', body: JSON.stringify({ paid: nextPaid }) });
      await loadLeague();
    } catch (error) { notify(error.message); }
    finally { setServerBusy(''); }
  };

  const chooseCfbPick = (gameId, side) => {
    if (cfbPool?.status !== 'open') return;
    setCfbMyPicks((current) => {
      const next = { ...current };
      if (next[gameId] === side) delete next[gameId];
      else next[gameId] = side;
      return next;
    });
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
    if (weekLocked) return notify(`${weekLabel} is locked — sheets were due ${DEADLINE_HOURS_BEFORE_KICKOFF} hours before the first kickoff.`);
    if (!name.trim()) return notify('Add your name before locking in.');
    if (Object.keys(picks).length !== currentGames.length) return notify(`Finish all ${currentGames.length} picks first.`);
    if (!tiebreaker || Number(tiebreaker) < 0) return notify('Add a valid tiebreaker total.');
    if (!paid && !playerSession.authenticated) return notify('Confirm your payment first.');

    setServerBusy('entry');
    try {
      await apiRequest(`/api/leagues/${LEAGUE_ID}/entries`, { method: 'POST', body: JSON.stringify({ name: name.trim(), handle: handle.trim(), picks, tiebreaker: Number(tiebreaker), paid, week: selectedWeek, playerId: playerSession.playerId ?? undefined }) });
      await loadLeague();
      setName(''); setHandle(''); setPicks({}); setTiebreaker(''); setPaid(false);
      notify(paid ? 'Picks locked in and saved to the league database.' : 'Picks locked in — now pay your entry from credit or the Cash App link.');
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
      if (session.name) setChatName(session.name);
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

  const sendGroupText = async () => {
    if (!(await ensureAdmin())) return;
    const msg = groupTextMsg.trim();
    if (!msg) return notify('Type a message first.');
    setServerBusy('group-text');
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/group-text`, { method: 'POST', body: JSON.stringify({ text: msg, mode: groupTextMode }) });
      const sent = data.sent ?? data.results?.filter((r) => r.ok).length ?? 0;
      notify(groupTextMode === 'group_mms' ? `Group MMS sent to ${sent} players in a shared thread.` : `Broadcast sent individually to ${sent} player${sent === 1 ? '' : 's'}.`);
      setGroupTextMsg('');
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

  const shareInviteLink = async () => {
    const url = `${window.location.origin}/?view=join`;
    const shareData = {
      title: '405 BAD GUYS PARLAYS',
      text: `Join our NFL pick'em league — $${ENTRY_FEE}/week, winner takes the pot. Tap to join:`,
      url,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(`${shareData.text}\n${url}`);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2500);
        notify('Invite link copied to clipboard.');
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        try {
          await navigator.clipboard.writeText(`${shareData.text}\n${url}`);
          setShareCopied(true);
          setTimeout(() => setShareCopied(false), 2500);
          notify('Invite link copied to clipboard.');
        } catch { notify('Could not copy link — share manually.'); }
      }
    }
  };

  // Register service worker and check push status
  useEffect(() => {
    if (!pushSupported) return;
    navigator.serviceWorker.register('/sw.js').then(async (reg) => {
      const sub = await reg.pushManager.getSubscription();
      if (sub) setPushEnabled(true);
    }).catch(() => {});
  }, [pushSupported]);

  const togglePushNotifications = async () => {
    if (!pushSupported) return notify('Push notifications are not supported in this browser.');
    if (!playerSession.authenticated) return notify('Sign in first to enable notifications.');
    try {
      const reg = await navigator.serviceWorker.ready;
      if (pushEnabled) {
        const sub = await reg.pushManager.getSubscription();
        if (sub) await sub.unsubscribe();
        setPushEnabled(false);
        notify('Push notifications disabled.');
        return;
      }
      const vapidResp = await apiRequest('/api/push/vapid-public');
      if (!vapidResp.vapidPublicKey) return notify('Push not configured on the server yet.');
      const applicationServerKey = Uint8Array.from(atob(vapidResp.vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      const subscription = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      await apiRequest('/api/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) });
      setPushEnabled(true);
      notify('Push notifications enabled — you\'ll get deadline reminders and results alerts.');
    } catch (err) {
      if (err.name === 'NotAllowedError') notify('Notification permission was denied. Enable it in your browser settings.');
      else notify(err.message || 'Could not enable push notifications.');
    }
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

  const launchRecapShow = async () => {
    setRecapShowLoading(true);
    try {
      const data = await apiRequest(`/api/leagues/${LEAGUE_ID}/recap-show`);
      setRecapShow(data);
      setRecapSlideIndex(0);
    } catch (error) { notify(error.message); }
    finally { setRecapShowLoading(false); }
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

  const sendOtpCode = async () => {
    setOtpSending(true);
    try {
      await apiRequest('/api/otp/send', { method: 'POST', body: JSON.stringify({ phone: signupPhone }) });
      notify('Verification code sent! Check your texts.');
    } catch (error) { notify(error.message); }
    setOtpSending(false);
  };

  const verifyOtpCode = async () => {
    try {
      const result = await apiRequest('/api/otp/verify', { method: 'POST', body: JSON.stringify({ phone: signupPhone, code: signupOtp }) });
      if (result.verified) {
        setOtpVerified(true);
        notify('Phone verified!');
        return true;
      }
    } catch (error) { notify(error.message); }
    return false;
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
    // Step 2 validation → advance to OTP step
    if (signupStep === 2) {
      if (!signupTeam) return notify('Pick your favorite team — Jack needs to know who to roast.');
      if (!signupAvatar && !signupAvatarFile) return notify('Choose an avatar or upload a pic.');
      setSignupStep(3);
      // Auto-send OTP when entering step 3
      setOtpSending(true);
      try {
        await apiRequest('/api/otp/send', { method: 'POST', body: JSON.stringify({ phone: signupPhone }) });
        notify('Verification code sent! Check your texts.');
      } catch (error) { notify(error.message); }
      setOtpSending(false);
      return;
    }
    // Step 3: verify OTP then register
    if (!signupOtp || signupOtp.length < 6) return notify('Enter the 6-digit code from your text.');
    setServerBusy('register');
    try {
      // Verify OTP first
      const otpResult = await apiRequest('/api/otp/verify', { method: 'POST', body: JSON.stringify({ phone: signupPhone, code: signupOtp }) });
      if (!otpResult.verified) { setServerBusy(null); return notify('Verification failed. Try again.'); }
      // Now register with verified phone
      const registered = await apiRequest(`/api/leagues/${LEAGUE_ID}/players/register`, {
        method: 'POST',
        body: JSON.stringify({ name: signupName.trim(), phone: signupPhone, pin: signupPin, favoriteTeam: signupTeam, avatar: signupAvatarFile || signupAvatar, otpVerified: true }),
      });
      const session = await apiRequest('/api/auth/player', { method: 'POST', body: JSON.stringify({ playerId: registered.playerId, pin: signupPin }) });
      setPlayerSession(session);
      await loadLeague();
      setName(registered.name);
      setChatName(registered.name);
      setSignupName(''); setSignupPhone(''); setSignupPin(''); setSignupTeam(''); setSignupAvatar(''); setSignupAvatarFile(null); setSignupStep(1); setSignupOtp(''); setOtpVerified(false);
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
  const activeTab = ['live', 'stats', 'season', 'survivor', 'props', 'entries', 'players', 'bets', 'ai', 'rules', 'demo', 'admin', 'payments', 'notifs'].includes(view) ? 'more' : view;

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
                    <span className="signup-step-line" />
                    <span className={`signup-step ${signupStep >= 3 ? 'active' : ''}`}>3 · Verify</span>
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
                      <button className="button button-primary">Next · Verify phone →</button>
                    </div>
                  </>)}

                  {signupStep === 3 && (<>
                    <div className="otp-verify-section">
                      <div className="otp-icon">📱</div>
                      <p className="otp-heading">Verify your number</p>
                      <p className="otp-subtext">We sent a 6-digit code to <strong>{signupPhone}</strong></p>
                      <label>Verification code
                        <input
                          value={signupOtp}
                          onChange={(e) => setSignupOtp(e.target.value.replace(/\D/g, ''))}
                          placeholder="000000"
                          maxLength="6"
                          type="text"
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          autoFocus
                          className="otp-input"
                        />
                      </label>
                      <button type="button" className="otp-resend" onClick={sendOtpCode} disabled={otpSending}>
                        {otpSending ? 'Sending…' : 'Resend code'}
                      </button>
                    </div>
                    <div className="signup-btn-row">
                      <button type="button" className="button button-ghost" onClick={() => { setSignupStep(2); setSignupOtp(''); }}>← Back</button>
                      <button className="button button-primary" disabled={serverBusy === 'register' || signupOtp.length < 6}>{serverBusy === 'register' ? 'Verifying…' : 'Join the league →'}</button>
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
                  <button className="button button-invite" type="button" onClick={shareInviteLink}>{shareCopied ? '✓ Copied!' : '📤 Invite friends'}</button>
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
                <button className="text-button recap-show-btn" type="button" onClick={launchRecapShow} disabled={recapShowLoading}>{recapShowLoading ? 'Loading…' : '▶ Watch Recap Show'}</button>
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
                  ? <><span className="deadline-icon">🔒</span><div><strong>Sheets are locked for {weekLabel}.</strong><p>Deadline passed — {DEADLINE_HOURS_BEFORE_KICKOFF} hours before the first kickoff. See you next week.</p></div></>
                  : <><span className="deadline-icon">⏱</span><div><strong>Sheets lock in {deadlineCountdown || 'less than a minute'}.</strong><p>Deadline: {weekDeadline ? weekDeadline.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + ` ET (${DEADLINE_HOURS_BEFORE_KICKOFF}h before kickoff)` : `${DEADLINE_HOURS_BEFORE_KICKOFF}h before first kickoff`}.</p></div></>}
              </div>
              <div className="games-list">
                {currentGames.map((game, index) => (
                  <article className={`game-card ${picks[game.id] ? 'picked' : ''}`} key={game.id}>
                    <div className="game-meta"><span>{String(index + 1).padStart(2, '0')}</span><p>{game.time}</p>{game.id === weekTiebreaker.game?.id && <b>★ Tiebreaker game — guess its total points, closest without going over</b>}{liveByGame[game.id]?.state === 'in' && <b className="live-badge">● LIVE {liveByGame[game.id].away} {liveByGame[game.id].awayScore}–{liveByGame[game.id].homeScore} {liveByGame[game.id].home} · {liveByGame[game.id].detail}</b>}</div>
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
              {playerSession.authenticated && (() => {
                const mySheet = weekSheets.find((s) => s.playerId === playerSession.playerId);
                if (mySheet?.paid) return <div className="credit-paid-banner">✅ This week's entry is paid.</div>;
                return (
                  <div className="credit-chip-row">
                    <span className="credit-chip">💳 Your credit: <strong>${myCredit}</strong></span>
                    {mySheet && myCredit >= ENTRY_FEE && (
                      <button className="button button-primary" type="button" disabled={serverBusy === 'sheet-credit-pay'} onClick={() => paySheetWithCredit(mySheet.id)}>
                        {serverBusy === 'sheet-credit-pay' ? 'Paying…' : `Pay $${ENTRY_FEE} from my credit`}
                      </button>
                    )}
                    {!mySheet && myCredit >= ENTRY_FEE && <small className="muted">Lock in your sheet, then pay from credit in one tap.</small>}
                    {mySheet && myCredit < ENTRY_FEE && (
                      mySheet.paymentClaim
                        ? <span className="claim-waiting">⏳ Payment claim sent {new Date(mySheet.paymentClaim.claimedAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })} — waiting for commissioner</span>
                        : <button className="button button-ghost-dark" type="button" disabled={serverBusy === 'claim-sheet'} onClick={() => claimSheetPayment(mySheet.id)}>
                            {serverBusy === 'claim-sheet' ? 'Sending…' : `✋ I sent my $${ENTRY_FEE}`}
                          </button>
                    )}
                  </div>
                );
              })()}
              {serverLeague?.settings?.cashAppPool?.url && !weekSheets.find((s) => s.playerId === playerSession.playerId)?.paid && (
                <div className="cashapp-steps">
                  <a className="cashapp-pool-link" href={serverLeague.settings.cashAppPool.url} target="_blank" rel="noreferrer">
                    <span className="cashapp-icon">💵</span>
                    <div><strong>{serverLeague.settings.cashAppPool.label || 'Pay via Cash App'}</strong><small>{'1. Tap here → 2. Send $'}{ENTRY_FEE}{' → 3. Come back & tap "I sent it"'}</small></div>
                    <span className="cashapp-arrow">↗</span>
                  </a>
                  <small className="muted">Opens Cash App to send your entry fee directly to the commissioner.</small>
                </div>
              )}
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
                    <div><small>Current leader</small><strong>{leader ? `${leader.name}` : '—'}</strong>{leader && <em>{leader.totalCorrect} correct picks · {leader.winPct}%</em>}</div>
                  </div>
                  <p>Most total correct picks combined across all 18 weekly sheets takes the season pot — it's the whole season's work, not one hot week. Ties break on accuracy %.{seasonPaidOut ? ' Season pot has been PAID.' : ''}</p>
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
                  <div className={`season-row ${index === 0 && row.totalCorrect > 0 ? 'leader' : ''}`} key={row.key}>
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

        {view === 'props' && (
          <StandardPage eyebrow={weekLabel.toUpperCase()} title="Prop picks" subtitle="Side action on individual player performances. Bragging rights and bonus pots.">
            <PlayerSessionPanel players={proofLeague.players} session={playerSession} login={playerLogin} setLogin={setPlayerLogin} onLogin={loginPlayer} onLogout={logoutPlayer} busy={serverBusy === 'player-login'} />
            {!playerSession.authenticated ? (
              <p className="muted">Sign in above to make your prop picks for {weekLabel}.</p>
            ) : (
              <div className="prop-picks-grid">
                {PROP_CATEGORIES.map((cat) => (
                  <section className="prop-card" key={cat.id}>
                    <div className="prop-header">
                      <span className="prop-icon">{cat.icon}</span>
                      <div><h3>{cat.label}</h3><p>{cat.desc}</p></div>
                    </div>
                    {cat.id === 'turnovers' ? (
                      <div className="prop-ou-row">
                        <span className="prop-ou-line">Line: 4.5 turnovers</span>
                        <div className="prop-ou-buttons">
                          <button type="button" className={`prop-ou ${propPicks.turnovers === 'over' ? 'selected' : ''}`} onClick={() => setPropPicks((p) => ({ ...p, turnovers: 'over' }))}>OVER</button>
                          <button type="button" className={`prop-ou ${propPicks.turnovers === 'under' ? 'selected' : ''}`} onClick={() => setPropPicks((p) => ({ ...p, turnovers: 'under' }))}>UNDER</button>
                        </div>
                      </div>
                    ) : (
                      <div className="prop-player-select">
                        <input
                          type="text"
                          className="prop-input"
                          placeholder={cat.id === 'firstTd' ? 'Player name (e.g. Tyreek Hill)' : cat.id === 'passing' ? 'QB name (e.g. Patrick Mahomes)' : 'RB name (e.g. Derrick Henry)'}
                          value={propPicks[cat.id] || ''}
                          onChange={(e) => setPropPicks((p) => ({ ...p, [cat.id]: e.target.value }))}
                        />
                      </div>
                    )}
                    {propPicks[cat.id] && <span className="prop-locked-badge">Your pick: {propPicks[cat.id]}</span>}
                  </section>
                ))}
                <button className="button button-primary full" type="button" disabled={weekLocked || serverBusy === 'prop-save' || !Object.keys(propPicks).filter((k) => propPicks[k]).length} onClick={savePropPicks}>{weekLocked ? '🔒 Week locked' : serverBusy === 'prop-save' ? 'Saving…' : 'Save prop picks →'}</button>
                <p className="muted prop-disclaimer">Prop picks are for fun within your league. Results are settled by the commissioner after games wrap.</p>
              </div>
            )}

            <section className="prop-standings">
              <div className="proof-heading"><div><span className="proof-step">SEASON</span><h2>Prop standings</h2></div></div>
              {propStandings.length ? (
                <div className="season-table">
                  <div className="season-head"><span>Player</span><span>Props won</span><span>Weeks played</span></div>
                  {propStandings.map((row, index) => (
                    <div className={`season-row ${index === 0 && row.wins > 0 ? 'leader' : ''}`} key={row.playerId}>
                      <span>{index === 0 && row.wins > 0 ? '👑 ' : ''}{row.name}</span>
                      <span>{row.wins}</span>
                      <span>{row.weeksPlayed}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="muted">No prop picks yet this season. Standings build as picks are saved and the commissioner settles winners each week.</p>}
            </section>

            {isComm && (
              <section className="prop-settle-admin">
                <div className="proof-heading"><div><span className="proof-step">COMMISSIONER</span><h2>Settle {weekLabel} props</h2></div></div>
                {(() => {
                  const weekPicks = serverLeague?.settings?.propPicks?.[selectedWeek] ?? {};
                  const pickerIds = Object.keys(weekPicks);
                  if (!pickerIds.length) return <p className="muted">No prop picks submitted for {weekLabel} yet.</p>;
                  const settled = serverLeague?.settings?.propResults?.[selectedWeek];
                  return <>
                    <button className="button button-primary full" type="button" disabled={serverBusy === 'prop-auto'} onClick={() => autoSettleProps(false)}>{serverBusy === 'prop-auto' ? 'Pulling ESPN stats…' : `⚡ Auto-settle ${weekLabel} from ESPN`}</button>
                    <p className="muted">Auto-settle pulls final stats from ESPN once the week wraps: week-wide passing &amp; rushing leaders, first TD and turnovers from the kickoff game. Checkboxes below stay available as a manual override.</p>
                    {settled?.auto && settled.facts && (
                      <div className="prop-auto-facts">
                        <strong>ESPN results{settled.settledAt ? ` · ${new Date(settled.settledAt).toLocaleDateString()}` : ''}</strong>
                        <span>🎯 Passing: {settled.facts.passing ? `${settled.facts.passing.player} (${settled.facts.passing.yards} yds)` : '—'}</span>
                        <span>🏃 Rushing: {settled.facts.rushing ? `${settled.facts.rushing.player} (${settled.facts.rushing.yards} yds)` : '—'}</span>
                        <span>🏈 First TD: {settled.facts.firstTd?.player ?? '—'}</span>
                        <span>🔄 Turnovers: {settled.facts.turnoverCount ?? '—'} → {(settled.facts.turnovers ?? '—').toUpperCase()}</span>
                      </div>
                    )}
                    {PROP_CATEGORIES.map((cat) => (
                      <div className="prop-settle-cat" key={cat.id}>
                        <strong>{cat.icon} {cat.label}</strong>
                        <div className="prop-settle-players">
                          {pickerIds.filter((pid) => weekPicks[pid]?.[cat.id]).map((pid) => {
                            const player = (serverLeague?.players ?? []).find((p) => p.id === pid);
                            const checked = (propSettleWinners[cat.id] ?? []).includes(pid);
                            return (
                              <label className="prop-settle-check" key={pid}>
                                <input type="checkbox" checked={checked} onChange={() => setPropSettleWinners((w) => {
                                  const current = new Set(w[cat.id] ?? []);
                                  if (current.has(pid)) current.delete(pid); else current.add(pid);
                                  return { ...w, [cat.id]: [...current] };
                                })} />
                                <span>{player?.name ?? pid} — <em>{weekPicks[pid][cat.id]}</em></span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                    <button className="button button-secondary full" type="button" disabled={serverBusy === 'prop-settle'} onClick={settlePropWeek}>{serverBusy === 'prop-settle' ? 'Settling…' : `Settle ${weekLabel} prop winners`}</button>
                    {serverLeague?.settings?.propResults?.[selectedWeek] && <p className="muted">✅ {weekLabel} already settled {new Date(serverLeague.settings.propResults[selectedWeek].settledAt).toLocaleDateString()} — settling again overwrites it.</p>}
                  </>;
                })()}
              </section>
            )}
          </StandardPage>
        )}

        {view === 'live' && (
          <StandardPage eyebrow={`${weekLabel.toUpperCase()} · ${liveScores.anyLive ? '🔴 LIVE' : 'GAME DAY'}`} title="Game day live" subtitle={liveScores.anyLive ? 'Games in progress — picks and standings update every 30 seconds.' : 'No games in progress right now. Scores go live at kickoff.'}>
            <section className="live-standings">
              <div className="proof-heading"><div><span className="proof-step">PROJECTED</span><h2>If games ended now</h2></div>{liveScores.anyLive && <StatusPill state="warn">LIVE</StatusPill>}</div>
              {liveStandings.length ? (
                <div className="season-table live-table">
                  <div className="season-head"><span>Player</span><span>Locked</span><span>Leading</span><span>Proj.</span></div>
                  {liveStandings.map((row, index) => (
                    <div className={`season-row ${index === 0 && row.projected > 0 ? 'leader' : ''}`} key={row.id}>
                      <span>{index === 0 && row.projected > 0 ? '👑 ' : ''}{row.name}</span>
                      <span>{row.locked}</span>
                      <span className="live-leading">{row.leading > 0 ? `+${row.leading}` : '—'}</span>
                      <span><strong>{row.projected}</strong>/{currentGames.length}</span>
                    </div>
                  ))}
                </div>
              ) : <EmptyState icon="📋" title="No sheets in yet" text={`Standings appear once ${weekLabel} sheets are submitted.`} action="Make picks" onAction={() => setView('picks')} />}
              <p className="muted">Locked = correct picks in final games. Leading = picks currently ahead in live games. Projections shift with every score.</p>
            </section>
            <section className="live-games">
              <div className="proof-heading"><div><span className="proof-step">SLATE</span><h2>{weekLabel} games</h2></div></div>
              {currentGames.map((game) => {
                const prov = liveProvisional[game.id];
                const pickers = weekSheets.filter((s) => s.picks[game.id]);
                const awayPickers = pickers.filter((s) => s.picks[game.id] === game.away);
                const homePickers = pickers.filter((s) => s.picks[game.id] === game.home);
                return (
                  <article className={`live-game-card ${prov?.state === 'in' ? 'in-progress' : ''} ${prov?.final ? 'final' : ''}`} key={game.id}>
                    <div className="live-game-score">
                      <div className={`live-team ${prov?.winner === game.away ? 'winning' : ''}`}><span>{game.away}</span><strong>{prov ? prov.awayScore : '—'}</strong></div>
                      <div className="live-game-status">{prov?.final ? 'FINAL' : prov?.state === 'in' ? (prov.detail || 'LIVE') : `${game.day ?? game.date} ${game.time}`}</div>
                      <div className={`live-team ${prov?.winner === game.home ? 'winning' : ''}`}><strong>{prov ? prov.homeScore : '—'}</strong><span>{game.home}</span></div>
                    </div>
                    {pickers.length > 0 && (
                      <div className="live-game-pickers">
                        <div className={prov?.winner === game.away ? 'picks-right' : prov?.winner === game.home ? 'picks-wrong' : ''}>{awayPickers.length ? awayPickers.map((s) => s.name.split(' ')[0]).join(', ') : '—'}</div>
                        <span className="live-vs">picks</span>
                        <div className={prov?.winner === game.home ? 'picks-right' : prov?.winner === game.away ? 'picks-wrong' : ''}>{homePickers.length ? homePickers.map((s) => s.name.split(' ')[0]).join(', ') : '—'}</div>
                      </div>
                    )}
                  </article>
                );
              })}
            </section>
          </StandardPage>
        )}

        {view === 'stats' && (
          <StandardPage eyebrow={`${SEASON} SEASON`} title="Player stats" subtitle="Tendencies, best weeks, and who owns who. Ammunition for the chat.">
            {playerStats.players.length ? <>
              {playerStats.players.map((p, index) => (
                <article className="stats-card" key={p.key}>
                  <div className="stats-card-head">
                    <span className="rank-number">{String(index + 1).padStart(2, '0')}</span>
                    <div><strong>{p.name}</strong><p>{p.weeks.length} week{p.weeks.length === 1 ? '' : 's'} played · {p.totalCorrect} correct · {p.avg} avg/week</p></div>
                  </div>
                  <div className="stats-grid">
                    <div><small>Best week</small><strong>{p.best ? `${p.best.score}/${p.best.gameCount}` : '—'}</strong><span>{p.best ? `Week ${p.best.week}` : ''}</span></div>
                    <div><small>Worst week</small><strong>{p.worst ? `${p.worst.score}/${p.worst.gameCount}` : '—'}</strong><span>{p.worst ? `Week ${p.worst.week}` : ''}</span></div>
                    <div><small>Ride-or-die team</small><strong>{p.favorite ? p.favorite[0] : '—'}</strong><span>{p.favorite ? `picked ${p.favorite[1]}×` : ''}</span></div>
                    <div><small>Home team bias</small><strong>{p.homePct}%</strong><span>picks home</span></div>
                  </div>
                </article>
              ))}
              {playerStats.players.length > 1 && (
                <section className="h2h-section">
                  <div className="proof-heading"><div><span className="proof-step">HEAD-TO-HEAD</span><h2>Who owns who</h2></div></div>
                  <div className="h2h-scroll">
                    <table className="h2h-table">
                      <thead><tr><th></th>{playerStats.players.map((p) => <th key={p.key}>{p.name.split(' ')[0]}</th>)}</tr></thead>
                      <tbody>
                        {playerStats.players.map((a) => (
                          <tr key={a.key}>
                            <th>{a.name.split(' ')[0]}</th>
                            {playerStats.players.map((b) => {
                              if (a.key === b.key) return <td className="h2h-self" key={b.key}>—</td>;
                              const rec = playerStats.h2h[`${a.key}|${b.key}`] ?? { wins: 0, losses: 0 };
                              return <td className={rec.wins > rec.losses ? 'h2h-up' : rec.wins < rec.losses ? 'h2h-down' : ''} key={b.key}>{rec.wins}-{rec.losses}</td>;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <p className="muted">Row vs column: weekly score wins–losses in weeks both played.</p>
                </section>
              )}
            </> : <EmptyState icon="📊" title="No stats yet" text="Stats build as sheets are submitted and weeks get scored." action="Make picks" onAction={() => setView('picks')} />}
          </StandardPage>
        )}

        {view === 'payments' && (
          <StandardPage eyebrow="FINANCES" title="My Payments" subtitle="Your entry fees, payouts, and credit balance — all in one place.">
            {!playerSession.authenticated ? (
              <EmptyState icon="🔐" title="Sign in to view" text="Your payment history is available after signing in." action="Sign in" onAction={() => setShowWelcome(true)} />
            ) : !paymentHistory ? (
              <p className="muted" style={{ textAlign: 'center', padding: '2rem 0' }}>Loading payment history…</p>
            ) : (
              <div className="payment-history-view">
                <div className="payment-summary-cards">
                  <div className="payment-summary-card">
                    <span className="payment-summary-label">Total Paid In</span>
                    <span className="payment-summary-value negative">${paymentHistory.summary.totalPaid}</span>
                  </div>
                  <div className="payment-summary-card">
                    <span className="payment-summary-label">Total Won</span>
                    <span className="payment-summary-value positive">${paymentHistory.summary.totalWon}</span>
                  </div>
                  <div className="payment-summary-card">
                    <span className="payment-summary-label">Credit Balance</span>
                    <span className="payment-summary-value">${paymentHistory.summary.creditBalance}</span>
                  </div>
                  <div className="payment-summary-card accent">
                    <span className="payment-summary-label">Net Position</span>
                    <span className={`payment-summary-value ${paymentHistory.summary.netPosition >= 0 ? 'positive' : 'negative'}`}>
                      {paymentHistory.summary.netPosition >= 0 ? '+' : ''}${paymentHistory.summary.netPosition}
                    </span>
                  </div>
                </div>
                <div className="payment-weeks-bar">
                  <span>✅ {paymentHistory.summary.totalWeeksPaid} weeks paid</span>
                  {paymentHistory.summary.totalWeeksUnpaid > 0 && <span className="payment-warning">⚠️ {paymentHistory.summary.totalWeeksUnpaid} unpaid</span>}
                </div>
                <h3 className="payment-history-heading">Transaction History</h3>
                {paymentHistory.history.length === 0 ? (
                  <p className="muted" style={{ textAlign: 'center' }}>No transactions yet. Submit your first pick sheet to get started.</p>
                ) : (
                  <div className="payment-history-list">
                    {paymentHistory.history.map((item) => (
                      <div className={`payment-history-row ${item.type}`} key={item.id}>
                        <span className="payment-history-icon">
                          {item.type === 'entry_fee' ? '🏈' : item.type === 'payout' ? '🏆' : '💳'}
                        </span>
                        <div className="payment-history-detail">
                          <strong>
                            {item.type === 'entry_fee' ? `Week ${item.week} Entry Fee` : item.type === 'payout' ? `Week ${item.week} Payout (${item.pool})` : item.reason}
                          </strong>
                          <small>
                            {item.status === 'confirmed' ? '✅ Confirmed' : item.status === 'claimed' ? '⏳ Claimed — awaiting confirmation' : item.status === 'unpaid' ? '⚠️ Unpaid' : item.status === 'paid' ? '✅ Paid' : '✅ Completed'}
                            {item.at ? ` · ${new Date(item.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}
                          </small>
                        </div>
                        <span className={`payment-history-amount ${item.amount >= 0 ? 'positive' : 'negative'}`}>
                          {item.amount >= 0 ? '+' : ''}${Math.abs(item.amount)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </StandardPage>
        )}

        {view === 'notifs' && (
          <StandardPage eyebrow="ACTIVITY" title="Notifications" subtitle="Deadline reminders, payouts, Jack messages, and other league events.">
            {!playerSession.authenticated ? (
              <EmptyState icon="🔐" title="Sign in to view" text="Your notification history is available after signing in." action="Sign in" onAction={() => setShowWelcome(true)} />
            ) : notifications.length === 0 ? (
              <EmptyState icon="🔔" title="All quiet" text="No notifications yet. As the season gets going, you'll see reminders, payouts, and messages from Jack here." />
            ) : (
              <div className="notification-history-list">
                {notifications.map((n) => (
                  <div className={`notification-history-row kind-${n.kind}`} key={n.id}>
                    <span className="notification-icon">
                      {n.kind === 'pick_reminder' ? '⏰' : n.kind === 'payout' ? '🏆' : n.kind === 'payment_claimed' ? '💸' : n.kind === 'payment_confirmed' ? '✅' : n.kind === 'jack_sms' ? '🎙️' : '🔔'}
                    </span>
                    <div className="notification-detail">
                      <strong>{n.title}</strong>
                      {n.body && <p>{n.body}</p>}
                      <time>{new Date(n.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </StandardPage>
        )}

        {view === 'entries' && (
          <StandardPage eyebrow={weekLabel.toUpperCase()} title="Locked entries" subtitle="Picks remain hidden here; the commissioner can score them after results arrive.">
            {weekSheets.length ? <div className="entry-list">{weekSheets.map((sheet, index) => (
              <article className="entry-row" key={sheet.id}><span className="rank-number">{String(index + 1).padStart(2, '0')}</span><div><strong>{sheet.name}</strong><p>{Object.keys(sheet.picks).length} picks · TB {sheet.tiebreaker}</p></div><time>{sheet.submittedAt ? new Date(sheet.submittedAt).toLocaleDateString() : weekLabel}</time>{sheet.paid && <b className="paid-pill">PAID</b>}</article>
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
              {weekTiebreaker.game && (
                <p className="tb-status">
                  ★ Tiebreaker: total points in {weekTiebreaker.game.away} @ {weekTiebreaker.game.home} — closest without going over wins ties.
                  {weekTiebreaker.total != null ? ` Final total: ${weekTiebreaker.total}.` : " Awaiting that game's final score."}
                </p>
              )}
              <div className="table-head"><span>Rank</span><span>Player</span><span>Tiebreaker</span><span>Correct</span></div>
              {leaderboard.map((entry, index) => {
                const path = winPathsByEntry[entry.id];
                return <div className={`standing-row ${index === 0 && completedGames ? 'leader' : ''}`} key={entry.id}>
                  <span>#{index + 1}</span>
                  <strong>{entry.name}{index === 0 && completedGames ? '  ♛' : ''}{path && <i className={`path-badge ${path.status}`}>{{ clinched: 'CLINCHED', won: 'WINNER', alive: 'ALIVE', on_tiebreaker: 'TB DECIDES', eliminated: 'OUT' }[path.status]}</i>}</strong>
                  <span>{entry.tiebreaker}{entry.tiebreakerBusted && <em className="tb-busted"> BUST</em>}{!entry.tiebreakerBusted && weekTiebreaker.total != null && <em className="tb-actual">{weekTiebreaker.total - entry.tiebreaker === 0 ? ' ✓ NAILED IT' : ` (−${weekTiebreaker.total - entry.tiebreaker})`}</em>}</span>
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
            {pushSupported && playerSession.authenticated && (
              <section className="push-toggle-section">
                <div className="panel">
                  <div className="panel-heading"><div><span className="eyebrow dark">NOTIFICATIONS</span><h2>Push alerts</h2></div></div>
                  <p className="muted">Get notified when the deadline is approaching, when results post, and when the commissioner has announcements.</p>
                  <button className={`button ${pushEnabled ? 'button-ghost' : 'button-primary'}`} type="button" onClick={togglePushNotifications}>{pushEnabled ? '🔕 Disable push notifications' : '🔔 Enable push notifications'}</button>
                  {pushEnabled && <p className="push-status-on">Push notifications are active on this device.</p>}
                </div>
              </section>
            )}
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
                  <input className="name-input" value={chatName} onChange={(event) => setChatName(event.target.value)} placeholder="Your name" maxLength="40" readOnly={playerSession.authenticated && Boolean(playerSession.name)} style={playerSession.authenticated ? { opacity: 0.6, cursor: 'default' } : {}} />
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

        {view === 'cfb' && (
          <StandardPage eyebrow="COLLEGE FOOTBALL" title="CFB Pick-Em" subtitle="Pick every game against the spread. Best record takes the pot — closest tiebreaker settles ties.">
            <div className="cfb-controls">
              <div className="cfb-week-picker">
                <label>Week</label>
                <select value={cfbWeek} onChange={(e) => { const w = Number(e.target.value); setCfbWeek(w); loadCfbGames(w); }}>{Array.from({ length: 16 }, (_, i) => <option key={i + 1} value={i + 1}>Week {i + 1}</option>)}</select>
                <button className="button button-ghost-dark" type="button" onClick={() => loadCfbGames(cfbWeek)} disabled={cfbLoading === 'games'}>{cfbLoading === 'games' ? 'Loading…' : '↻ Refresh'}</button>
              </div>
              {isComm && !cfbPool && (
                <button className="button button-primary" type="button" onClick={() => setCfbBuilderOpen((v) => !v)}>
                  {cfbBuilderOpen ? '✕ Cancel Builder' : `＋ Build Week ${cfbWeek} Pool`}
                </button>
              )}
            </div>

            {/* ── Commissioner slate builder ── */}
            {isComm && cfbBuilderOpen && !cfbPool && (
              <section className="cfb-pool-card builder">
                <h2 className="cfb-section-title">🛠️ Build the Week {cfbWeek} slate</h2>
                <p className="muted">Tap games below to add them to the slate (3–20 games). The last kickoff automatically becomes the tiebreaker game.</p>
                <div className="cfb-builder-bar">
                  <label>Entry fee $<input type="number" min="0" max="1000" value={cfbEntryFee} onChange={(e) => setCfbEntryFee(e.target.value)} /></label>
                  <span className="cfb-builder-count">{cfbSelected.size} selected</span>
                  <button className="button button-primary" type="button" disabled={cfbSelected.size < 3 || serverBusy === 'cfb-pool-create'} onClick={createCfbPool}>
                    {serverBusy === 'cfb-pool-create' ? 'Creating…' : `Create Pool (${cfbSelected.size} games)`}
                  </button>
                </div>
              </section>
            )}

            {/* ── Active pool ── */}
            {cfbPool && (
              <section className={`cfb-pool-card ${cfbPool.status}`}>
                <div className="cfb-pool-head">
                  <div>
                    <h2 className="cfb-section-title">🏆 Week {cfbPool.week} Pick-Em Pool</h2>
                    <small className="muted">{cfbPool.games.length} games · ${cfbPool.entryFee} entry · Pot ${Object.values(cfbPool.entries ?? {}).filter((e) => e.paid).length * cfbPool.entryFee}</small>
                  </div>
                  <span className={`cfb-pool-status ${cfbPool.status}`}>{cfbPool.status === 'open' ? '🟢 Open for picks' : cfbPool.status === 'locked' ? '🔒 Locked' : '🏁 Final'}</span>
                </div>

                {/* Payment — credit first, Cash App as the backup */}
                {playerSession.authenticated && cfbMyEntry?.paid && (
                  <div className="credit-paid-banner">✅ Your entry is paid{cfbMyEntry.paidVia === 'credit' ? ' from your credit' : ''} — you're in the pot.</div>
                )}
                {playerSession.authenticated && !cfbMyEntry?.paid && (
                  <div className="credit-chip-row">
                    <span className="credit-chip">💳 Your credit: <strong>${myCredit}</strong></span>
                    {cfbMyEntry && myCredit >= (cfbPool.entryFee || 0) && (
                      <button className="button button-primary" type="button" disabled={serverBusy === 'cfb-credit-pay'} onClick={payCfbWithCredit}>
                        {serverBusy === 'cfb-credit-pay' ? 'Paying…' : `Pay $${cfbPool.entryFee} from my credit`}
                      </button>
                    )}
                    {!cfbMyEntry && <small className="muted">Lock in your picks below, then pay in one tap.</small>}
                    {cfbMyEntry && myCredit < (cfbPool.entryFee || 0) && (
                      cfbMyEntry.paymentClaim
                        ? <span className="claim-waiting">⏳ Payment claim sent — waiting for commissioner</span>
                        : <button className="button button-ghost-dark" type="button" disabled={serverBusy === 'claim-cfb'} onClick={claimCfbPayment}>
                            {serverBusy === 'claim-cfb' ? 'Sending…' : `✋ I sent my $${cfbPool.entryFee}`}
                          </button>
                    )}
                  </div>
                )}
                {serverLeague?.settings?.cashAppPool?.url && !cfbMyEntry?.paid && (
                  <div className="cashapp-steps">
                    <a className="cashapp-pool-link" href={serverLeague.settings.cashAppPool.url} target="_blank" rel="noreferrer">
                      <span className="cashapp-icon">💵</span>
                      <div><strong>{serverLeague.settings.cashAppPool.label || 'Pay Entry Fee'}</strong><small>{'Step 1: Tap here · Step 2: Send $'}{cfbPool.entryFee}{' · Step 3: Tap "I sent it"'}</small></div>
                      <span className="cashapp-arrow">↗</span>
                    </a>
                    <small className="muted">Opens Cash App to send your entry fee. The commissioner confirms once it lands.</small>
                  </div>
                )}

                {/* Player pick flow */}
                {cfbPool.status === 'open' && (
                  playerSession.authenticated ? (
                    <div className="cfb-pick-flow">
                      <div className="cfb-pick-progress">
                        <strong>{Object.keys(cfbMyPicks).length}/{cfbPool.games.length} picked</strong>
                        {cfbMyEntry && <span className="cfb-entry-in">✓ Picks in — edit anytime before lock</span>}
                      </div>
                      <div className="cfb-pick-grid">
                        {cfbPool.games.map((g) => (
                          <article className="cfb-pick-card" key={g.id}>
                            <div className="cfb-pick-meta">
                              <span className="cfb-pick-spread">{g.spreadLabel}</span>
                              <span className="cfb-pick-date">{new Date(g.date).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}</span>
                              {cfbTbGame?.id === g.id && <span className="cfb-tb-tag">TIEBREAKER</span>}
                            </div>
                            <div className="cfb-pick-buttons">
                              <button type="button" className={`cfb-pick-team ${cfbMyPicks[g.id] === 'away' ? 'picked' : ''}`} onClick={() => chooseCfbPick(g.id, 'away')}>
                                {g.away.logo && <img src={g.away.logo} alt="" loading="lazy" />}
                                <span>{g.away.rank ? `#${g.away.rank} ` : ''}{g.away.abbr}</span>
                              </button>
                              <span className="cfb-at">@</span>
                              <button type="button" className={`cfb-pick-team ${cfbMyPicks[g.id] === 'home' ? 'picked' : ''}`} onClick={() => chooseCfbPick(g.id, 'home')}>
                                {g.home.logo && <img src={g.home.logo} alt="" loading="lazy" />}
                                <span>{g.home.rank ? `#${g.home.rank} ` : ''}{g.home.abbr}</span>
                              </button>
                            </div>
                          </article>
                        ))}
                      </div>
                      <div className="cfb-tb-row">
                        <label>Tiebreaker — total points in {cfbTbGame ? `${cfbTbGame.away.abbr} @ ${cfbTbGame.home.abbr}` : 'the last game'}
                          <input type="number" min="0" max="200" inputMode="numeric" value={cfbTiebreaker} onChange={(e) => setCfbTiebreaker(e.target.value)} placeholder="e.g. 52" />
                        </label>
                      </div>
                      <button className="button button-primary full" type="button" disabled={serverBusy === 'cfb-picks'} onClick={submitCfbPicks}>
                        {serverBusy === 'cfb-picks' ? 'Locking in…' : cfbMyEntry ? 'Update My Picks' : `Lock In My ${cfbPool.games.length} Picks`}
                      </button>
                    </div>
                  ) : (
                    <div className="cfb-signin-nudge">
                      <p className="muted">Sign in as a player to make your picks — it takes ten seconds.</p>
                      <PlayerSessionPanel players={proofLeague.players} session={playerSession} login={playerLogin} setLogin={setPlayerLogin} onLogin={loginPlayer} onLogout={logoutPlayer} busy={serverBusy === 'player-login'} />
                    </div>
                  )
                )}

                {/* Leaderboard */}
                {cfbBoard && cfbBoard.rows.length > 0 && (
                  <div className="cfb-board">
                    <h3 className="cfb-sub-title">{cfbBoard.complete ? '🏁 Final Standings' : `📊 Standings — ${cfbBoard.gamesFinal}/${cfbBoard.gamesTotal} games final`}</h3>
                    {cfbBoard.tiebreakerTotal != null && <small className="muted">Tiebreaker game landed on {cfbBoard.tiebreakerTotal} total points.</small>}
                    <div className="cfb-board-rows">
                      {cfbBoard.rows.map((row, index) => (
                        <div className={`cfb-board-row ${cfbBoard.complete && cfbBoard.winners.some((w) => w.playerId === row.playerId) ? 'winner' : ''} ${row.playerId === playerSession.playerId ? 'me' : ''}`} key={row.playerId}>
                          <span className="cfb-board-rank">{index + 1}</span>
                          <span className="cfb-board-name">{row.name}{cfbBoard.complete && cfbBoard.winners.some((w) => w.playerId === row.playerId) ? ' 👑' : ''}</span>
                          <span className="cfb-board-record">{row.wins}-{row.losses}{row.pushes ? `-${row.pushes}` : ''}</span>
                          <span className="cfb-board-tb">TB {row.tiebreaker}{row.tbDiff != null ? ` (±${row.tbDiff})` : ''}</span>
                          {isComm ? (
                            <button type="button" className={`cfb-paid-toggle ${row.paid ? 'paid' : ''} ${!row.paid && row.paymentClaim ? 'claimed' : ''}`} disabled={serverBusy === `cfb-paid-${row.playerId}`} onClick={() => toggleCfbPaid(row.playerId, !row.paid)}>
                              {row.paid ? '✓ Paid' : row.paymentClaim ? '⏳ Says paid — confirm' : 'Mark paid'}
                            </button>
                          ) : (
                            <span className={`cfb-paid-chip ${row.paid ? 'paid' : ''}`}>{row.paid ? '✓ Paid' : 'Unpaid'}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Picks reveal once locked */}
                {cfbPool.status !== 'open' && cfbBoard && cfbBoard.rows.length > 0 && (
                  <details className="cfb-picks-reveal">
                    <summary>See everyone's picks</summary>
                    <div className="cfb-reveal-table-wrap">
                      <table className="cfb-reveal-table">
                        <thead><tr><th>Game</th>{cfbBoard.rows.map((row) => <th key={row.playerId}>{row.name.split(' ')[0]}</th>)}</tr></thead>
                        <tbody>
                          {cfbPool.games.map((g) => {
                            const cover = cfbBoard.covers[g.id];
                            return (
                              <tr key={g.id}>
                                <td>{g.away.abbr}@{g.home.abbr}<small> {g.spreadLabel}</small></td>
                                {cfbBoard.rows.map((row) => {
                                  const pick = row.picks?.[g.id];
                                  const label = pick === 'home' ? g.home.abbr : pick === 'away' ? g.away.abbr : '—';
                                  const state = cover == null ? '' : cover === 'push' ? 'push' : pick === cover ? 'hit' : 'miss';
                                  return <td className={state} key={row.playerId}>{label}</td>;
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </details>
                )}

                {/* Commissioner pool controls */}
                {isComm && (
                  <div className="cfb-admin-bar">
                    {cfbPool.status === 'open' && <button className="button button-ghost-dark" type="button" disabled={serverBusy === 'cfb-pool-status'} onClick={() => patchCfbPool('locked')}>🔒 Lock picks</button>}
                    {cfbPool.status === 'locked' && <button className="button button-ghost-dark" type="button" disabled={serverBusy === 'cfb-pool-status'} onClick={() => patchCfbPool('open')}>🔓 Reopen picks</button>}
                    <button className="button button-ghost-dark" type="button" disabled={serverBusy === 'cfb-sync'} onClick={syncCfbScores}>{serverBusy === 'cfb-sync' ? 'Syncing…' : '⚡ Sync scores from ESPN'}</button>
                    {cfbPool.status === 'final' && !cfbPool.potCredited && cfbBoard?.winners?.length > 0 && (
                      <button className="button button-primary" type="button" disabled={serverBusy === 'cfb-credit-winners'} onClick={creditCfbWinners}>
                        {serverBusy === 'cfb-credit-winners' ? 'Crediting…' : `💰 Credit pot to ${cfbBoard.winners.map((w) => w.name.split(' ')[0]).join(' & ')}`}
                      </button>
                    )}
                    {cfbPool.potCredited && <span className="credit-chip">💰 Pot credited to winners</span>}
                  </div>
                )}
              </section>
            )}

            {!cfbPool && !cfbBuilderOpen && (
              <div className="cfb-empty pool-hint"><span>🏆</span><p>No pick-em pool for Week {cfbWeek} yet.{isComm ? ' Tap "Build Pool" above, pick 3–20 games from the list, and the pool goes live.' : " The commissioner hasn't built this week's slate yet — check back soon."}</p></div>
            )}

            {cfbRankings && (
              <section className="cfb-rankings">
                <h2 className="cfb-section-title">📊 {cfbRankings.name} — {cfbRankings.season}</h2>
                <div className="cfb-rankings-grid">
                  {cfbRankings.teams.map((t) => (
                    <article className={`cfb-rank-card ${t.rank <= 5 ? 'top5' : t.rank <= 10 ? 'top10' : ''}`} key={t.rank}>
                      <span className="cfb-rank-num">{t.rank}</span>
                      {t.logo && <img className="cfb-team-logo" src={t.logo} alt="" loading="lazy" />}
                      <div className="cfb-rank-info"><strong>{t.team}</strong><small>{t.abbr} · {t.record || '—'}</small></div>
                      {t.prevRank && t.prevRank !== t.rank && <span className={`cfb-rank-change ${t.rank < t.prevRank ? 'up' : 'down'}`}>{t.rank < t.prevRank ? `▲${t.prevRank - t.rank}` : `▼${t.rank - t.prevRank}`}</span>}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {cfbGames && (
              <section className="cfb-games">
                <h2 className="cfb-section-title">🏟️ Week {cfbGames.week} — {cfbGames.totalGames} Games</h2>
                <div className="cfb-games-grid">
                  {cfbGames.games.filter((g) => g.isRanked).map((g) => (
                    <article className={`cfb-game-card ranked ${cfbBuilderOpen ? 'selectable' : ''} ${cfbSelected.has(g.id) ? 'selected' : ''}`} onClick={cfbBuilderOpen ? () => toggleCfbGame(g.id) : undefined} key={g.id}>
                      <div className="cfb-game-teams">
                        <div className="cfb-game-team">
                          {g.away.logo && <img src={g.away.logo} alt="" className="cfb-game-logo" loading="lazy" />}
                          <div><strong>{g.away.rank ? `#${g.away.rank} ` : ''}{g.away.abbr}</strong><small>{g.away.name}</small></div>
                        </div>
                        <span className="cfb-at">@</span>
                        <div className="cfb-game-team home">
                          {g.home.logo && <img src={g.home.logo} alt="" className="cfb-game-logo" loading="lazy" />}
                          <div><strong>{g.home.rank ? `#${g.home.rank} ` : ''}{g.home.abbr}</strong><small>{g.home.name}</small></div>
                        </div>
                      </div>
                      <div className="cfb-game-odds">
                        {g.spread && <span className="cfb-spread">{g.spread}</span>}
                        {g.overUnder && <span className="cfb-ou">O/U {g.overUnder}</span>}
                      </div>
                      {g.status !== 'scheduled' && <span className="cfb-status">{g.statusDetail}</span>}
                    </article>
                  ))}
                </div>
                {cfbGames.games.filter((g) => !g.isRanked).length > 0 && (
                  <>
                    <h3 className="cfb-sub-title">Other Games</h3>
                    <div className="cfb-games-grid compact">
                      {cfbGames.games.filter((g) => !g.isRanked).map((g) => (
                        <article className={`cfb-game-card ${cfbBuilderOpen ? 'selectable' : ''} ${cfbSelected.has(g.id) ? 'selected' : ''}`} onClick={cfbBuilderOpen ? () => toggleCfbGame(g.id) : undefined} key={g.id}>
                          <div className="cfb-game-teams compact">
                            <span><strong>{g.away.abbr}</strong> @ <strong>{g.home.abbr}</strong></span>
                            {g.spread && <span className="cfb-spread">{g.spread}</span>}
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
              </section>
            )}

            {!cfbRankings && !cfbGames && (
              <div className="cfb-empty"><span>🏟️</span><p>Load rankings or pick a week to see games and spreads. Data pulls live from ESPN — rankings update weekly, spreads as soon as lines are posted.</p></div>
            )}
          </StandardPage>
        )}

        {view === 'rules' && (
          <StandardPage eyebrow="THE FINE PRINT" title="House rules" subtitle="Simple enough to explain before kickoff. Firm enough to settle Monday-night arguments.">
            <div className="rules-grid">
              <Rule number="01" title="Entry" text={`Each weekly sheet costs $${ENTRY_FEE}. Pay from your credit balance in one tap, or through the league's Cash App Pool link. The $25 season pool is separate — one payment for the whole year, and it goes to the most total correct picks combined across all 18 weeks, not the best single week.`} />
              <Rule number="02" title="Picks" text={`Select one winner for all ${currentGames.length} games. A locked sheet cannot be edited in this demo.`} />
              <Rule number="03" title="Scoring" text="Every correct winner earns one point. The highest total after every game wins the weekly pot. A game that ends in a tie counts as no point for anyone." />
              <Rule number="04" title="Tiebreaker" text="Guess the total points of the tiebreaker game (the week's last kickoff — marked with a ★ on the picks page). Closest without going over wins. Going over busts — any under-guess beats any bust. If everyone tied goes over, the least-over guess takes it. Identical guesses split the pot." />
              <Rule number="05" title="Deadline" text={`Sheets lock ${DEADLINE_HOURS_BEFORE_KICKOFF} hours before the week's first kickoff. Late sheets are rejected — no exceptions. The countdown is always visible on the Picks page.`} />
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
              <div className="jack-text-row">
                <div><strong>🎬 Jack's Weekly Recap Show</strong><p>Full-screen animated slideshow with standings, winner spotlight, movers, roasts, and Jack's AI commentary. Auto-advances with manual controls.</p></div>
                <button className="button button-primary" type="button" onClick={launchRecapShow} disabled={recapShowLoading}>{recapShowLoading ? 'Loading show…' : '▶ Launch Recap Show'}</button>
              </div>
              <div className="jack-text-row">
                <div><strong>🔔 Push deadline reminder</strong><p>Send a push notification to all players who haven't submitted their picks yet. Only reaches players who enabled push notifications.</p></div>
                <button className="button button-send" type="button" disabled={weekLocked || serverBusy === 'push-reminder'} onClick={async () => {
                  setServerBusy('push-reminder');
                  try {
                    const result = await apiRequest('/api/push/deadline-reminder', { method: 'POST', body: JSON.stringify({ week: selectedWeek }) });
                    notify(`Deadline reminder sent to ${result.sent} of ${result.missing} missing players.`);
                  } catch (err) { notify(err.message); }
                  finally { setServerBusy(''); }
                }}>{serverBusy === 'push-reminder' ? 'Sending…' : weekLocked ? '🔒 Week locked' : 'Push reminder to missing players'}</button>
              </div>
            </section>
            <section className="autopilot-section">
              <div className="panel-heading"><div><span className="eyebrow dark">AUTO-PILOT</span><h2>Commissioner auto-pilot</h2></div><StatusPill state="pass">ON</StatusPill></div>
              <p>The league runs itself: final scores verify from ESPN automatically, props settle the moment the week wraps, and players missing sheets get push + text reminders 24 hours and 3 hours before the deadline. It runs on a daily schedule and every time someone opens the app. Everything below happened without you lifting a finger.</p>
              <button className="button button-ghost-dark" type="button" disabled={serverBusy === 'autopilot-run'} onClick={async () => {
                setServerBusy('autopilot-run');
                try {
                  const result = await apiRequest(`/api/leagues/${LEAGUE_ID}/auto-pilot/run`, { method: 'POST' });
                  await loadLeague();
                  notify(result.actions?.length ? `Auto-pilot ran: ${result.actions.join(' ')}` : 'Auto-pilot ran — nothing needed doing. All caught up.');
                } catch (err) { notify(err.message); }
                finally { setServerBusy(''); }
              }}>{serverBusy === 'autopilot-run' ? 'Running…' : '⚡ Run auto-pilot now'}</button>
              {(serverLeague?.settings?.autoPilotLog ?? []).length ? (
                <div className="autopilot-log">
                  {(serverLeague.settings.autoPilotLog ?? []).slice(0, 10).map((entry, index) => (
                    <div className="autopilot-log-row" key={index}>
                      <time>{new Date(entry.at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</time>
                      <span>{entry.message}</span>
                    </div>
                  ))}
                </div>
              ) : <p className="muted">No automated actions yet — the log fills in as the season gets rolling.</p>}
            </section>
            <section className="cashapp-admin-section">
              <div className="panel-heading"><div><span className="eyebrow dark">PAYMENTS</span><h2>Cash App Payment Link</h2></div></div>
              <p>One shared payment link for the whole league. Players tap it, send the entry fee, then mark it sent. You confirm with one tap.</p>
              <ol className="cashapp-howto">
                <li>{'Your Cash App link is '}
                  <code>{'https://cash.app/$Tique'}</code>
                  {' — paste it below (or use any Cash App link you want).'}
                </li>
                <li>Hit <strong>Save</strong>. The green pay button shows up on the Picks page and inside every CFB pool automatically.</li>
                <li>{'Players tap the button → Cash App opens → they send $'}{ENTRY_FEE}{' → they mark "I sent it" in the app → you one-tap confirm.'}</li>
              </ol>
              <div className="cashapp-admin-form">
                <label>Cash App URL<input type="url" value={cashAppPoolUrl || serverLeague?.settings?.cashAppPool?.url || ''} onChange={(e) => setCashAppPoolUrl(e.target.value)} placeholder="https://cash.app/$Tique" /></label>
                <label>Button label <small>optional</small><input type="text" value={cashAppPoolLabel || serverLeague?.settings?.cashAppPool?.label || ''} onChange={(e) => setCashAppPoolLabel(e.target.value)} placeholder="Pay $20 Entry Fee" maxLength="80" /></label>
                <div className="cashapp-admin-actions">
                  <button className="button button-primary" type="button" onClick={() => saveCashAppPool()} disabled={serverBusy === 'cashapp-pool'}>{serverBusy === 'cashapp-pool' ? 'Saving…' : 'Save Pool Link'}</button>
                  {serverLeague?.settings?.cashAppPool?.url && <button className="button button-ghost-dark" type="button" onClick={() => { setCashAppPoolUrl(''); setCashAppPoolLabel(''); saveCashAppPool('', ''); }}>Clear Link</button>}
                </div>
                {serverLeague?.settings?.cashAppPool?.url && (
                  <div className="cashapp-preview"><span>💵</span><div><strong>Active:</strong> <a href={serverLeague.settings.cashAppPool.url} target="_blank" rel="noreferrer">{serverLeague.settings.cashAppPool.label || 'Cash App Pool'} ↗</a></div></div>
                )}
              </div>
            </section>
            <section className="cashapp-admin-section">
              <div className="panel-heading"><div><span className="eyebrow dark">PAYMENTS</span><h2>Player Credits</h2></div></div>
              <p>When a Cash App payment lands, add it here as credit — from then on that player pays entries with one tap and winnings can go straight back to their balance. The app only tracks the money; Cash App moves it.</p>
              <div className="credit-balances">
                {(serverLeague?.players ?? []).map((player) => {
                  const balance = creditBalance(serverLeague?.creditLedger ?? [], player.id);
                  return (
                    <div className="credit-balance-row" key={player.id}>
                      <span className="credit-balance-name">{player.name}</span>
                      <span className={`credit-balance-amount ${balance > 0 ? 'positive' : ''}`}>${balance}</span>
                    </div>
                  );
                })}
                {!(serverLeague?.players ?? []).length && <p className="muted">No players yet.</p>}
              </div>
              <div className="cashapp-admin-form">
                <label>Player
                  <select value={creditForm.playerId} onChange={(e) => setCreditForm((c) => ({ ...c, playerId: e.target.value }))}>
                    <option value="">Choose a player…</option>
                    {(serverLeague?.players ?? []).map((player) => <option value={player.id} key={player.id}>{player.name}</option>)}
                  </select>
                </label>
                <div className="form-pair">
                  <label>Amount <small>use a minus to deduct</small><input type="number" step="1" value={creditForm.amount} onChange={(e) => setCreditForm((c) => ({ ...c, amount: e.target.value }))} placeholder="20" /></label>
                  <label>Reason<input type="text" maxLength="120" value={creditForm.reason} onChange={(e) => setCreditForm((c) => ({ ...c, reason: e.target.value }))} placeholder="Cash App received" /></label>
                </div>
                <div className="cashapp-admin-actions">
                  <button className="button button-primary" type="button" disabled={!creditForm.playerId || !creditForm.amount || !creditForm.reason.trim() || serverBusy === 'credit-add'} onClick={addCredit}>
                    {serverBusy === 'credit-add' ? 'Saving…' : 'Add / Deduct Credit'}
                  </button>
                </div>
                {(serverLeague?.creditLedger ?? []).length > 0 && (
                  <details className="credit-ledger">
                    <summary>Full credit history ({serverLeague.creditLedger.length})</summary>
                    <div className="credit-ledger-rows">
                      {[...serverLeague.creditLedger].reverse().slice(0, 40).map((entry) => (
                        <div className="credit-ledger-row" key={entry.id}>
                          <span className={`credit-ledger-amount ${entry.amount > 0 ? 'positive' : 'negative'}`}>{entry.amount > 0 ? '+' : '−'}${Math.abs(entry.amount)}</span>
                          <span className="credit-ledger-name">{(serverLeague.players ?? []).find((p) => p.id === entry.playerId)?.name ?? 'Player'}</span>
                          <span className="credit-ledger-reason">{entry.reason}</span>
                          <span className="credit-ledger-date">{new Date(entry.at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </section>
            <section className="cashapp-admin-section">
              <div className="panel-heading"><div><span className="eyebrow dark">PAYMENTS</span><h2>Payment Center — {weekLabel}</h2></div></div>
              <p>Who's in, who says they paid, and who's missing before the deadline{deadlineCountdown ? ` (${deadlineCountdown})` : ''}. One tap confirms a claim.</p>
              {(() => {
                const unpaidSheets = (sheets ?? []).filter((s) => !s.paid);
                const submittedIds = new Set(weekSheets.map((s) => s.playerId).filter(Boolean));
                const missing = (serverLeague?.players ?? []).filter((p) => !submittedIds.has(p.id));
                return (
                  <div className="payment-center">
                    {unpaidSheets.length === 0 && <p className="muted">✅ Every submitted sheet is paid.</p>}
                    {unpaidSheets.map((s) => (
                      <div className={`payment-row ${s.paymentClaim ? 'claimed' : ''}`} key={s.id}>
                        <span className="payment-name">{s.name}</span>
                        <span className="payment-week">Wk {s.week}</span>
                        <span className="payment-status">{s.paymentClaim ? `⏳ says paid ${new Date(s.paymentClaim.claimedAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}` : 'no payment yet'}</span>
                        <button className="button button-primary" type="button" disabled={serverBusy === `sheet-paid-${s.id}`} onClick={() => confirmSheetPaid(s.id, true)}>
                          {serverBusy === `sheet-paid-${s.id}` ? '…' : '✓ Confirm paid'}
                        </button>
                      </div>
                    ))}
                    {missing.length > 0 && (
                      <p className="payment-missing"><strong>No sheet yet for {weekLabel}:</strong> {missing.map((p) => p.name.split(' ')[0]).join(', ')}</p>
                    )}
                  </div>
                );
              })()}
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
            <section className="group-text-section">
              <div className="panel-heading"><div><span className="eyebrow dark">MESSAGING</span><h2>📢 Group Text</h2></div></div>
              <p className="muted">Send an SMS to all players with verified phone numbers. Group MMS creates a shared thread (2–10 players); Individual sends separate texts to each.</p>
              <div className="group-text-controls">
                <div className="group-text-mode-toggle">
                  <button type="button" className={`mode-btn ${groupTextMode === 'individual' ? 'active' : ''}`} onClick={() => setGroupTextMode('individual')}>📱 Individual</button>
                  <button type="button" className={`mode-btn ${groupTextMode === 'group_mms' ? 'active' : ''}`} onClick={() => setGroupTextMode('group_mms')}>👥 Group MMS</button>
                </div>
                <textarea className="group-text-input" rows="3" maxLength={500} placeholder="Type your message to the league…" value={groupTextMsg} onChange={(e) => setGroupTextMsg(e.target.value)} />
                <div className="group-text-footer">
                  <span className="char-count">{groupTextMsg.length}/500</span>
                  <button className="button button-primary" type="button" disabled={serverBusy === 'group-text' || !groupTextMsg.trim()} onClick={sendGroupText}>
                    {serverBusy === 'group-text' ? 'Sending…' : groupTextMode === 'group_mms' ? '📤 Send Group MMS' : '📤 Send to All'}
                  </button>
                </div>
              </div>
            </section>
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

      {recapShow && (
        <RecapShow data={recapShow} slideIndex={recapSlideIndex} onSlideChange={setRecapSlideIndex} onClose={() => setRecapShow(null)} />
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

function RecapShow({ data, slideIndex, onSlideChange, onClose }) {
  const slide = data.slides[slideIndex];
  const narration = data.narration ?? [];
  const total = data.slides.length;
  const canPrev = slideIndex > 0;
  const canNext = slideIndex < total - 1;

  // Auto-advance every 6 seconds
  useEffect(() => {
    if (slideIndex >= total - 1) return;
    const timer = setTimeout(() => onSlideChange(slideIndex + 1), 6000);
    return () => clearTimeout(timer);
  }, [slideIndex, total, onSlideChange]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && canNext) onSlideChange(slideIndex + 1);
      if (e.key === 'ArrowLeft' && canPrev) onSlideChange(slideIndex - 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [slideIndex, canPrev, canNext, onSlideChange, onClose]);

  return (
    <div className="recap-show-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="recap-show">
        <button className="recap-show-close" type="button" onClick={onClose}>×</button>

        <div className="recap-show-progress">
          {data.slides.map((_, i) => (
            <button key={i} className={`recap-dot ${i === slideIndex ? 'active' : ''} ${i < slideIndex ? 'done' : ''}`} type="button" onClick={() => onSlideChange(i)} aria-label={`Slide ${i + 1}`} />
          ))}
        </div>

        <div className="recap-show-stage">
          {slide.type === 'title' && (
            <div className="recap-slide recap-slide-title">
              <div className="recap-jack-badge">✦</div>
              <h1>Week {slide.week} Recap</h1>
              <p className="recap-subtitle">{slide.season} Season · {slide.gameCount} Games</p>
              {narration[0] && <p className="recap-narration">{narration[0]}</p>}
              <div className="recap-meta-row">
                <span>{slide.playerCount} players</span>
                <span>{slide.verifiedCount}/{slide.gameCount} verified</span>
              </div>
            </div>
          )}

          {slide.type === 'winner' && (
            <div className="recap-slide recap-slide-winner">
              <span className="recap-crown">👑</span>
              <h1>{slide.name}</h1>
              <p className="recap-big-score">{slide.score}–{slide.total - slide.score}</p>
              {narration[1] && <p className="recap-narration">{narration[1]}</p>}
              {slide.runnerUp && (
                <p className="recap-runner-up">Runner-up: {slide.runnerUp.name} ({slide.runnerUp.score}–{slide.total - slide.runnerUp.score})</p>
              )}
              {slide.margin > 0 && <p className="recap-margin">Won by {slide.margin} pick{slide.margin !== 1 ? 's' : ''}</p>}
            </div>
          )}

          {slide.type === 'standings' && (
            <div className="recap-slide recap-slide-standings">
              <h2>Standings</h2>
              {narration[2] && <p className="recap-narration">{narration[2]}</p>}
              <div className="recap-standings-list">
                {slide.entries.map((entry, i) => (
                  <div className={`recap-standing-row ${i === 0 ? 'first' : ''}`} key={entry.playerId}>
                    <span className="recap-rank">#{entry.rank}</span>
                    <span className="recap-name">{entry.name}</span>
                    <span className="recap-score">{entry.score}</span>
                    <span className={`recap-change ${entry.rankChange > 0 ? 'up' : entry.rankChange < 0 ? 'down' : ''}`}>
                      {entry.rankChange > 0 ? `▲${entry.rankChange}` : entry.rankChange < 0 ? `▼${Math.abs(entry.rankChange)}` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {slide.type === 'movers' && (
            <div className="recap-slide recap-slide-movers">
              <h2>Week's Movers</h2>
              {narration[2] && <p className="recap-narration">{narration[2]}</p>}
              <div className="recap-movers-grid">
                {slide.rise && (
                  <div className="recap-mover-card rise">
                    <span className="recap-mover-icon">🚀</span>
                    <h3>{slide.rise.name}</h3>
                    <p className="recap-mover-stat">+{slide.rise.change} positions</p>
                    <p>Score: {slide.rise.score}</p>
                  </div>
                )}
                {slide.fall && (
                  <div className="recap-mover-card fall">
                    <span className="recap-mover-icon">📉</span>
                    <h3>{slide.fall.name}</h3>
                    <p className="recap-mover-stat">{slide.fall.change} positions</p>
                    <p>Score: {slide.fall.score}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {slide.type === 'sideBets' && (
            <div className="recap-slide recap-slide-bets">
              <h2>Side Bets Settled</h2>
              {narration[3] && <p className="recap-narration">{narration[3]}</p>}
              <div className="recap-bets-list">
                {slide.bets.map((bet, i) => (
                  <div className="recap-bet-card" key={i}>
                    <span className="recap-bet-icon">🎲</span>
                    <div>
                      <strong>{bet.winnerName} wins!</strong>
                      <p>{bet.creatorName} vs {bet.opponentName}</p>
                      <p className="recap-bet-stake">{bet.stake}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {slide.type === 'roasts' && (
            <div className="recap-slide recap-slide-roasts">
              <h2>Jack's Takes</h2>
              <div className="recap-roasts-scroll">
                {slide.players.map((p) => (
                  <div className={`recap-roast-card ${p.isWinner ? 'winner' : ''}`} key={p.playerId}>
                    <div className="recap-roast-header">
                      <strong>{p.name}</strong>
                      <span>#{p.rank} · {p.score} pts</span>
                    </div>
                    {p.text && <p className="recap-roast-text">{p.isWinner ? '👑 ' : '🔥 '}{p.text}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {slide.type === 'closing' && (
            <div className="recap-slide recap-slide-closing">
              <div className="recap-jack-badge large">✦</div>
              <h1>That's a wrap!</h1>
              <p className="recap-subtitle">Week {slide.week} is in the books.</p>
              {narration[4] && <p className="recap-narration">{narration[4]}</p>}
              <p className="recap-signoff">— Jack, Commissioner AI</p>
            </div>
          )}
        </div>

        <div className="recap-show-nav">
          <button type="button" disabled={!canPrev} onClick={() => onSlideChange(slideIndex - 1)}>‹ Prev</button>
          <span>{slideIndex + 1} / {total}</span>
          <button type="button" disabled={!canNext} onClick={() => onSlideChange(slideIndex + 1)}>Next ›</button>
        </div>
      </div>
    </div>
  );
}

function AppWithErrorBoundary() {
  return <ErrorBoundary><App /></ErrorBoundary>;
}

export default AppWithErrorBoundary;
