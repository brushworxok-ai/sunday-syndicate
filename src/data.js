// ============================================================
// 2026–2027 NFL Season Schedule — Complete 18-Week Regular Season
// Generated from CBS Sports, ESPN, and NFL.com schedule data
// Season: September 9, 2026 – January 10, 2027
// Playoffs: Jan 16–Feb 14, 2027 (Super Bowl LXI @ SoFi Stadium)
// ============================================================

export const SEASON = 2026;
export const ENTRY_FEE = 20;
export const DEADLINE_HOURS_BEFORE_KICKOFF = 5;

export const TEAMS = {
  ARI: 'Arizona Cardinals',
  ATL: 'Atlanta Falcons',
  BAL: 'Baltimore Ravens',
  BUF: 'Buffalo Bills',
  CAR: 'Carolina Panthers',
  CHI: 'Chicago Bears',
  CIN: 'Cincinnati Bengals',
  CLE: 'Cleveland Browns',
  DAL: 'Dallas Cowboys',
  DEN: 'Denver Broncos',
  DET: 'Detroit Lions',
  GB:  'Green Bay Packers',
  HOU: 'Houston Texans',
  IND: 'Indianapolis Colts',
  JAX: 'Jacksonville Jaguars',
  KC:  'Kansas City Chiefs',
  LV:  'Las Vegas Raiders',
  LAC: 'Los Angeles Chargers',
  LAR: 'Los Angeles Rams',
  MIA: 'Miami Dolphins',
  MIN: 'Minnesota Vikings',
  NE:  'New England Patriots',
  NO:  'New Orleans Saints',
  NYG: 'New York Giants',
  NYJ: 'New York Jets',
  PHI: 'Philadelphia Eagles',
  PIT: 'Pittsburgh Steelers',
  SF:  'San Francisco 49ers',
  SEA: 'Seattle Seahawks',
  TB:  'Tampa Bay Buccaneers',
  TEN: 'Tennessee Titans',
  WAS: 'Washington Commanders',
};

/** Return a team logo URL for the given abbreviation. Uses ESPN's static CDN. */
export function getTeamLogoUrl(abbr) {
  if (!abbr || !TEAMS[abbr]) return 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%23333"/></svg>';
  const espnIds = { ARI:'22',ATL:'1',BAL:'33',BUF:'2',CAR:'29',CHI:'3',CIN:'4',CLE:'5',DAL:'6',DEN:'7',DET:'8',GB:'9',HOU:'34',IND:'11',JAX:'30',KC:'12',LV:'13',LAC:'24',LAR:'14',MIA:'15',MIN:'16',NE:'17',NO:'18',NYG:'19',NYJ:'20',PHI:'21',PIT:'23',SF:'25',SEA:'26',TB:'27',TEN:'10',WAS:'28' };
  const id = espnIds[abbr];
  return id ? `https://a.espncdn.com/i/teamlogos/nfl/500/${abbr.toLowerCase()}.png` : 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="%23333"/></svg>';
}

/** Team accent colors — vivid brand-adjacent hues tuned to stay visible on the dark UI. */
export const TEAM_COLORS = {
  ARI: '#B0264C', ATL: '#C6273D', BAL: '#7B5BC7', BUF: '#3B6FD4',
  CAR: '#0085CA', CHI: '#E8622C', CIN: '#FB4F14', CLE: '#FF3C00',
  DAL: '#5B8DC9', DEN: '#FB4F14', DET: '#0076B6', GB:  '#3E9B5F',
  HOU: '#C8102E', IND: '#4C8CD4', JAX: '#00A5B8', KC:  '#E31837',
  LV:  '#A5ACAF', LAC: '#0080C6', LAR: '#4A76D8', MIA: '#00B2A9',
  MIN: '#8A5BC7', NE:  '#D63A50', NO:  '#D3BC8D', NYG: '#4C7BD4',
  NYJ: '#2E9B6E', PHI: '#2C8C7A', PIT: '#FFB612', SF:  '#D42B2B',
  SEA: '#69BE28', TB:  '#E23838', TEN: '#4B92DB', WAS: '#B0433C',
};

// Helper: build a game object with auto-resolved full names
function g(id, away, home, date, time) {
  return {
    id,
    away,
    awayFull: TEAMS[away],
    home,
    homeFull: TEAMS[home],
    date,       // ISO date string (YYYY-MM-DD)
    time,       // display string like "Thu · 8:15 PM ET"
    kickoff: `${date}T${toISO(time)}`,  // ISO datetime for locking logic
  };
}

// Convert display time "8:15 PM" → "20:15:00" (ET, 24h)
function toISO(display) {
  const match = display.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return '00:00:00';
  let [, h, m, ampm] = match;
  h = parseInt(h, 10);
  if (ampm.toUpperCase() === 'PM' && h !== 12) h += 12;
  if (ampm.toUpperCase() === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${m}:00`;
}

// ============================================================
// SCHEDULE — Every game, every week
// ============================================================

export const SCHEDULE = [
  // ── WEEK 1 ─────────────────────────────────────────────────
  {
    week: 1,
    label: 'Week 1',
    byeTeams: [],
    games: [
      g('w1-1',  'NE',  'SEA', '2026-09-09', 'Wed · 8:20 PM ET'),
      g('w1-2',  'SF',  'LAR', '2026-09-10', 'Thu · 8:35 PM ET'),
      g('w1-3',  'ATL', 'PIT', '2026-09-13', 'Sun · 1:00 PM ET'),
      g('w1-4',  'BAL', 'IND', '2026-09-13', 'Sun · 1:00 PM ET'),
      g('w1-5',  'BUF', 'HOU', '2026-09-13', 'Sun · 1:00 PM ET'),
      g('w1-6',  'CHI', 'CAR', '2026-09-13', 'Sun · 1:00 PM ET'),
      g('w1-7',  'CLE', 'JAX', '2026-09-13', 'Sun · 1:00 PM ET'),
      g('w1-8',  'NO',  'DET', '2026-09-13', 'Sun · 1:00 PM ET'),
      g('w1-9',  'NYJ', 'TEN', '2026-09-13', 'Sun · 1:00 PM ET'),
      g('w1-10', 'TB',  'CIN', '2026-09-13', 'Sun · 1:00 PM ET'),
      g('w1-11', 'ARI', 'LAC', '2026-09-13', 'Sun · 4:25 PM ET'),
      g('w1-12', 'GB',  'MIN', '2026-09-13', 'Sun · 4:25 PM ET'),
      g('w1-13', 'MIA', 'LV',  '2026-09-13', 'Sun · 4:25 PM ET'),
      g('w1-14', 'WAS', 'PHI', '2026-09-13', 'Sun · 4:25 PM ET'),
      g('w1-15', 'DAL', 'NYG', '2026-09-13', 'Sun · 8:20 PM ET'),
      g('w1-16', 'DEN', 'KC',  '2026-09-14', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 2 ─────────────────────────────────────────────────
  {
    week: 2,
    label: 'Week 2',
    byeTeams: [],
    games: [
      g('w2-1',  'DET', 'BUF', '2026-09-17', 'Thu · 8:15 PM ET'),
      g('w2-2',  'CIN', 'HOU', '2026-09-20', 'Sun · 1:00 PM ET'),
      g('w2-3',  'CAR', 'ATL', '2026-09-20', 'Sun · 1:00 PM ET'),
      g('w2-4',  'CLE', 'TB',  '2026-09-20', 'Sun · 1:00 PM ET'),
      g('w2-5',  'GB',  'NYJ', '2026-09-20', 'Sun · 1:00 PM ET'),
      g('w2-6',  'MIN', 'CHI', '2026-09-20', 'Sun · 1:00 PM ET'),
      g('w2-7',  'NO',  'BAL', '2026-09-20', 'Sun · 1:00 PM ET'),
      g('w2-8',  'PHI', 'TEN', '2026-09-20', 'Sun · 1:00 PM ET'),
      g('w2-9',  'PIT', 'NE',  '2026-09-20', 'Sun · 1:00 PM ET'),
      g('w2-10', 'LV',  'LAC', '2026-09-20', 'Sun · 4:05 PM ET'),
      g('w2-11', 'JAX', 'DEN', '2026-09-20', 'Sun · 4:05 PM ET'),
      g('w2-12', 'MIA', 'SF',  '2026-09-20', 'Sun · 4:25 PM ET'),
      g('w2-13', 'SEA', 'ARI', '2026-09-20', 'Sun · 4:25 PM ET'),
      g('w2-14', 'WAS', 'DAL', '2026-09-20', 'Sun · 4:25 PM ET'),
      g('w2-15', 'IND', 'KC',  '2026-09-20', 'Sun · 8:20 PM ET'),
      g('w2-16', 'NYG', 'LAR', '2026-09-21', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 3 ─────────────────────────────────────────────────
  {
    week: 3,
    label: 'Week 3',
    byeTeams: [],
    games: [
      g('w3-1',  'ATL', 'GB',  '2026-09-24', 'Thu · 8:15 PM ET'),
      g('w3-2',  'CAR', 'CLE', '2026-09-27', 'Sun · 1:00 PM ET'),
      g('w3-3',  'CIN', 'PIT', '2026-09-27', 'Sun · 1:00 PM ET'),
      g('w3-4',  'HOU', 'IND', '2026-09-27', 'Sun · 1:00 PM ET'),
      g('w3-5',  'KC',  'MIA', '2026-09-27', 'Sun · 1:00 PM ET'),
      g('w3-6',  'LAC', 'BUF', '2026-09-27', 'Sun · 1:00 PM ET'),
      g('w3-7',  'NE',  'JAX', '2026-09-27', 'Sun · 1:00 PM ET'),
      g('w3-8',  'NYJ', 'DET', '2026-09-27', 'Sun · 1:00 PM ET'),
      g('w3-9',  'SEA', 'WAS', '2026-09-27', 'Sun · 1:00 PM ET'),
      g('w3-10', 'TEN', 'NYG', '2026-09-27', 'Sun · 1:00 PM ET'),
      g('w3-11', 'ARI', 'SF',  '2026-09-27', 'Sun · 4:05 PM ET'),
      g('w3-12', 'MIN', 'TB',  '2026-09-27', 'Sun · 4:05 PM ET'),
      g('w3-13', 'BAL', 'DAL', '2026-09-27', 'Sun · 4:25 PM ET'),
      g('w3-14', 'LV',  'NO',  '2026-09-27', 'Sun · 4:25 PM ET'),
      g('w3-15', 'LAR', 'DEN', '2026-09-27', 'Sun · 8:20 PM ET'),
      g('w3-16', 'PHI', 'CHI', '2026-09-28', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 4 ─────────────────────────────────────────────────
  {
    week: 4,
    label: 'Week 4',
    byeTeams: [],
    games: [
      g('w4-1',  'PIT', 'CLE', '2026-10-01', 'Thu · 8:15 PM ET'),
      g('w4-2',  'IND', 'WAS', '2026-10-04', 'Sun · 9:30 AM ET'),
      g('w4-3',  'ARI', 'NYG', '2026-10-04', 'Sun · 1:00 PM ET'),
      g('w4-4',  'DAL', 'HOU', '2026-10-04', 'Sun · 1:00 PM ET'),
      g('w4-5',  'GB',  'TB',  '2026-10-04', 'Sun · 1:00 PM ET'),
      g('w4-6',  'JAX', 'CIN', '2026-10-04', 'Sun · 1:00 PM ET'),
      g('w4-7',  'LAR', 'PHI', '2026-10-04', 'Sun · 1:00 PM ET'),
      g('w4-8',  'NE',  'BUF', '2026-10-04', 'Sun · 1:00 PM ET'),
      g('w4-9',  'NYJ', 'CHI', '2026-10-04', 'Sun · 1:00 PM ET'),
      g('w4-10', 'TEN', 'BAL', '2026-10-04', 'Sun · 1:00 PM ET'),
      g('w4-11', 'MIA', 'MIN', '2026-10-04', 'Sun · 4:05 PM ET'),
      g('w4-12', 'DEN', 'SF',  '2026-10-04', 'Sun · 4:25 PM ET'),
      g('w4-13', 'KC',  'LV',  '2026-10-04', 'Sun · 4:25 PM ET'),
      g('w4-14', 'LAC', 'SEA', '2026-10-04', 'Sun · 4:25 PM ET'),
      g('w4-15', 'DET', 'CAR', '2026-10-04', 'Sun · 8:20 PM ET'),
      g('w4-16', 'ATL', 'NO',  '2026-10-05', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 5 ─────────────────────────────────────────────────
  {
    week: 5,
    label: 'Week 5',
    byeTeams: ['CAR', 'KC'],
    games: [
      g('w5-1',  'TB',  'DAL', '2026-10-08', 'Thu · 8:15 PM ET'),
      g('w5-2',  'PHI', 'JAX', '2026-10-11', 'Sun · 9:30 AM ET'),
      g('w5-3',  'CIN', 'MIA', '2026-10-11', 'Sun · 1:00 PM ET'),
      g('w5-4',  'CLE', 'NYJ', '2026-10-11', 'Sun · 1:00 PM ET'),
      g('w5-5',  'HOU', 'TEN', '2026-10-11', 'Sun · 1:00 PM ET'),
      g('w5-6',  'IND', 'PIT', '2026-10-11', 'Sun · 1:00 PM ET'),
      g('w5-7',  'LV',  'NE',  '2026-10-11', 'Sun · 1:00 PM ET'),
      g('w5-8',  'MIN', 'NO',  '2026-10-11', 'Sun · 1:00 PM ET'),
      g('w5-9',  'NYG', 'WAS', '2026-10-11', 'Sun · 1:00 PM ET'),
      g('w5-10', 'DEN', 'LAC', '2026-10-11', 'Sun · 4:05 PM ET'),
      g('w5-11', 'CHI', 'GB',  '2026-10-11', 'Sun · 4:25 PM ET'),
      g('w5-12', 'DET', 'ARI', '2026-10-11', 'Sun · 4:25 PM ET'),
      g('w5-13', 'SF',  'SEA', '2026-10-11', 'Sun · 4:25 PM ET'),
      g('w5-14', 'BAL', 'ATL', '2026-10-11', 'Sun · 8:20 PM ET'),
      g('w5-15', 'BUF', 'LAR', '2026-10-12', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 6 ─────────────────────────────────────────────────
  {
    week: 6,
    label: 'Week 6',
    byeTeams: ['CIN', 'DET', 'MIA', 'MIN'],
    games: [
      g('w6-1',  'SEA', 'DEN', '2026-10-15', 'Thu · 8:15 PM ET'),
      g('w6-2',  'HOU', 'JAX', '2026-10-18', 'Sun · 9:30 AM ET'),
      g('w6-3',  'CAR', 'PHI', '2026-10-18', 'Sun · 1:00 PM ET'),
      g('w6-4',  'BAL', 'CLE', '2026-10-18', 'Sun · 1:00 PM ET'),
      g('w6-5',  'CHI', 'ATL', '2026-10-18', 'Sun · 1:00 PM ET'),
      g('w6-6',  'NO',  'NYG', '2026-10-18', 'Sun · 1:00 PM ET'),
      g('w6-7',  'NYJ', 'NE',  '2026-10-18', 'Sun · 1:00 PM ET'),
      g('w6-8',  'PIT', 'TB',  '2026-10-18', 'Sun · 1:00 PM ET'),
      g('w6-9',  'TEN', 'IND', '2026-10-18', 'Sun · 1:00 PM ET'),
      g('w6-10', 'ARI', 'LAR', '2026-10-18', 'Sun · 4:05 PM ET'),
      g('w6-11', 'BUF', 'LV',  '2026-10-18', 'Sun · 4:25 PM ET'),
      g('w6-12', 'LAC', 'KC',  '2026-10-18', 'Sun · 4:25 PM ET'),
      g('w6-13', 'DAL', 'GB',  '2026-10-18', 'Sun · 8:20 PM ET'),
      g('w6-14', 'WAS', 'SF',  '2026-10-19', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 7 ─────────────────────────────────────────────────
  {
    week: 7,
    label: 'Week 7',
    byeTeams: ['BUF', 'JAX', 'LAC', 'WAS'],
    games: [
      g('w7-1',  'NE',  'CHI', '2026-10-22', 'Thu · 8:15 PM ET'),
      g('w7-2',  'PIT', 'NO',  '2026-10-25', 'Sun · 9:30 AM ET'),
      g('w7-3',  'CLE', 'TEN', '2026-10-25', 'Sun · 1:00 PM ET'),
      g('w7-4',  'CIN', 'BAL', '2026-10-25', 'Sun · 1:00 PM ET'),
      g('w7-5',  'IND', 'MIN', '2026-10-25', 'Sun · 1:00 PM ET'),
      g('w7-6',  'MIA', 'NYJ', '2026-10-25', 'Sun · 1:00 PM ET'),
      g('w7-7',  'NYG', 'HOU', '2026-10-25', 'Sun · 1:00 PM ET'),
      g('w7-8',  'SF',  'ATL', '2026-10-25', 'Sun · 1:00 PM ET'),
      g('w7-9',  'TB',  'CAR', '2026-10-25', 'Sun · 1:00 PM ET'),
      g('w7-10', 'DEN', 'ARI', '2026-10-25', 'Sun · 4:05 PM ET'),
      g('w7-11', 'GB',  'DET', '2026-10-25', 'Sun · 4:25 PM ET'),
      g('w7-12', 'LAR', 'LV',  '2026-10-25', 'Sun · 4:25 PM ET'),
      g('w7-13', 'KC',  'SEA', '2026-10-25', 'Sun · 8:20 PM ET'),
      g('w7-14', 'DAL', 'PHI', '2026-10-26', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 8 ─────────────────────────────────────────────────
  {
    week: 8,
    label: 'Week 8',
    byeTeams: ['HOU', 'NO', 'NYG', 'SF'],
    games: [
      g('w8-1',  'CAR', 'GB',  '2026-10-29', 'Thu · 8:15 PM ET'),
      g('w8-2',  'ATL', 'TB',  '2026-11-01', 'Sun · 1:00 PM ET'),
      g('w8-3',  'ARI', 'DAL', '2026-11-01', 'Sun · 1:00 PM ET'),
      g('w8-4',  'BAL', 'BUF', '2026-11-01', 'Sun · 1:00 PM ET'),
      g('w8-5',  'CLE', 'PIT', '2026-11-01', 'Sun · 1:00 PM ET'),
      g('w8-6',  'IND', 'JAX', '2026-11-01', 'Sun · 1:00 PM ET'),
      g('w8-7',  'LV',  'NYJ', '2026-11-01', 'Sun · 1:00 PM ET'),
      g('w8-8',  'MIN', 'DET', '2026-11-01', 'Sun · 1:00 PM ET'),
      g('w8-9',  'TEN', 'CIN', '2026-11-01', 'Sun · 1:00 PM ET'),
      g('w8-10', 'LAC', 'LAR', '2026-11-01', 'Sun · 4:05 PM ET'),
      g('w8-11', 'KC',  'DEN', '2026-11-01', 'Sun · 4:25 PM ET'),
      g('w8-12', 'NE',  'MIA', '2026-11-01', 'Sun · 4:25 PM ET'),
      g('w8-13', 'PHI', 'WAS', '2026-11-01', 'Sun · 8:20 PM ET'),
      g('w8-14', 'CHI', 'SEA', '2026-11-02', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 9 ─────────────────────────────────────────────────
  {
    week: 9,
    label: 'Week 9',
    byeTeams: ['PIT', 'TEN'],
    games: [
      g('w9-1',  'JAX', 'BAL', '2026-11-05', 'Thu · 8:15 PM ET'),
      g('w9-2',  'CIN', 'ATL', '2026-11-08', 'Sun · 9:30 AM ET'),
      g('w9-3',  'CLE', 'NO',  '2026-11-08', 'Sun · 1:00 PM ET'),
      g('w9-4',  'DAL', 'IND', '2026-11-08', 'Sun · 1:00 PM ET'),
      g('w9-5',  'DEN', 'CAR', '2026-11-08', 'Sun · 1:00 PM ET'),
      g('w9-6',  'DET', 'MIA', '2026-11-08', 'Sun · 1:00 PM ET'),
      g('w9-7',  'LAR', 'WAS', '2026-11-08', 'Sun · 1:00 PM ET'),
      g('w9-8',  'NYG', 'PHI', '2026-11-08', 'Sun · 1:00 PM ET'),
      g('w9-9',  'NYJ', 'KC',  '2026-11-08', 'Sun · 1:00 PM ET'),
      g('w9-10', 'HOU', 'LAC', '2026-11-08', 'Sun · 4:05 PM ET'),
      g('w9-11', 'LV',  'SF',  '2026-11-08', 'Sun · 4:05 PM ET'),
      g('w9-12', 'ARI', 'SEA', '2026-11-08', 'Sun · 4:25 PM ET'),
      g('w9-13', 'GB',  'NE',  '2026-11-08', 'Sun · 4:25 PM ET'),
      g('w9-14', 'TB',  'CHI', '2026-11-08', 'Sun · 8:20 PM ET'),
      g('w9-15', 'BUF', 'MIN', '2026-11-09', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 10 ────────────────────────────────────────────────
  {
    week: 10,
    label: 'Week 10',
    byeTeams: ['CHI', 'DEN', 'PHI', 'TB'],
    games: [
      g('w10-1',  'WAS', 'NYG', '2026-11-12', 'Thu · 8:15 PM ET'),
      g('w10-2',  'NE',  'DET', '2026-11-15', 'Sun · 9:30 AM ET'),
      g('w10-3',  'CAR', 'NO',  '2026-11-15', 'Sun · 1:00 PM ET'),
      g('w10-4',  'BUF', 'NYJ', '2026-11-15', 'Sun · 1:00 PM ET'),
      g('w10-5',  'HOU', 'CLE', '2026-11-15', 'Sun · 1:00 PM ET'),
      g('w10-6',  'JAX', 'TEN', '2026-11-15', 'Sun · 1:00 PM ET'),
      g('w10-7',  'KC',  'ATL', '2026-11-15', 'Sun · 1:00 PM ET'),
      g('w10-8',  'MIA', 'IND', '2026-11-15', 'Sun · 1:00 PM ET'),
      g('w10-9',  'MIN', 'GB',  '2026-11-15', 'Sun · 1:00 PM ET'),
      g('w10-10', 'LAR', 'ARI', '2026-11-15', 'Sun · 4:05 PM ET'),
      g('w10-11', 'SEA', 'LV',  '2026-11-15', 'Sun · 4:05 PM ET'),
      g('w10-12', 'SF',  'DAL', '2026-11-15', 'Sun · 4:25 PM ET'),
      g('w10-13', 'PIT', 'CIN', '2026-11-15', 'Sun · 8:20 PM ET'),
      g('w10-14', 'LAC', 'BAL', '2026-11-16', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 11 ────────────────────────────────────────────────
  {
    week: 11,
    label: 'Week 11',
    byeTeams: ['ATL', 'CLE', 'GB', 'LAR', 'NE', 'SEA'],
    games: [
      g('w11-1',  'IND', 'HOU', '2026-11-19', 'Thu · 8:15 PM ET'),
      g('w11-2',  'BAL', 'CAR', '2026-11-22', 'Sun · 1:00 PM ET'),
      g('w11-3',  'ARI', 'KC',  '2026-11-22', 'Sun · 1:00 PM ET'),
      g('w11-4',  'JAX', 'NYG', '2026-11-22', 'Sun · 1:00 PM ET'),
      g('w11-5',  'MIA', 'BUF', '2026-11-22', 'Sun · 1:00 PM ET'),
      g('w11-6',  'NO',  'CHI', '2026-11-22', 'Sun · 1:00 PM ET'),
      g('w11-7',  'TB',  'DET', '2026-11-22', 'Sun · 1:00 PM ET'),
      g('w11-8',  'TEN', 'DAL', '2026-11-22', 'Sun · 1:00 PM ET'),
      g('w11-9',  'NYJ', 'LAC', '2026-11-22', 'Sun · 4:05 PM ET'),
      g('w11-10', 'LV',  'DEN', '2026-11-22', 'Sun · 4:25 PM ET'),
      g('w11-11', 'PIT', 'PHI', '2026-11-22', 'Sun · 4:25 PM ET'),
      g('w11-12', 'MIN', 'SF',  '2026-11-22', 'Sun · 8:20 PM ET'),
      g('w11-13', 'CIN', 'WAS', '2026-11-23', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 12 (Thanksgiving) ─────────────────────────────────
  {
    week: 12,
    label: 'Week 12 — Thanksgiving',
    byeTeams: [],
    games: [
      g('w12-1',  'GB',  'LAR', '2026-11-25', 'Wed · 8:00 PM ET'),
      g('w12-2',  'CHI', 'DET', '2026-11-26', 'Thu · 1:00 PM ET'),
      g('w12-3',  'PHI', 'DAL', '2026-11-26', 'Thu · 4:30 PM ET'),
      g('w12-4',  'KC',  'BUF', '2026-11-26', 'Thu · 8:20 PM ET'),
      g('w12-5',  'DEN', 'PIT', '2026-11-27', 'Fri · 3:00 PM ET'),
      g('w12-6',  'BAL', 'HOU', '2026-11-29', 'Sun · 1:00 PM ET'),
      g('w12-7',  'ATL', 'MIN', '2026-11-29', 'Sun · 1:00 PM ET'),
      g('w12-8',  'LV',  'CLE', '2026-11-29', 'Sun · 1:00 PM ET'),
      g('w12-9',  'NO',  'CIN', '2026-11-29', 'Sun · 1:00 PM ET'),
      g('w12-10', 'NYG', 'IND', '2026-11-29', 'Sun · 1:00 PM ET'),
      g('w12-11', 'NYJ', 'MIA', '2026-11-29', 'Sun · 1:00 PM ET'),
      g('w12-12', 'TEN', 'JAX', '2026-11-29', 'Sun · 4:05 PM ET'),
      g('w12-13', 'SEA', 'SF',  '2026-11-29', 'Sun · 4:25 PM ET'),
      g('w12-14', 'WAS', 'ARI', '2026-11-29', 'Sun · 4:25 PM ET'),
      g('w12-15', 'NE',  'LAC', '2026-11-29', 'Sun · 8:20 PM ET'),
      g('w12-16', 'CAR', 'TB',  '2026-11-30', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 13 ────────────────────────────────────────────────
  {
    week: 13,
    label: 'Week 13',
    byeTeams: ['BAL', 'IND', 'LV', 'NYJ'],
    games: [
      g('w13-1',  'KC',  'LAR', '2026-12-03', 'Thu · 8:15 PM ET'),
      g('w13-2',  'CIN', 'CLE', '2026-12-06', 'Sun · 1:00 PM ET'),
      g('w13-3',  'DET', 'ATL', '2026-12-06', 'Sun · 1:00 PM ET'),
      g('w13-4',  'GB',  'NO',  '2026-12-06', 'Sun · 1:00 PM ET'),
      g('w13-5',  'JAX', 'CHI', '2026-12-06', 'Sun · 1:00 PM ET'),
      g('w13-6',  'LAC', 'TB',  '2026-12-06', 'Sun · 1:00 PM ET'),
      g('w13-7',  'SF',  'NYG', '2026-12-06', 'Sun · 1:00 PM ET'),
      g('w13-8',  'WAS', 'TEN', '2026-12-06', 'Sun · 1:00 PM ET'),
      g('w13-9',  'MIA', 'DEN', '2026-12-06', 'Sun · 4:05 PM ET'),
      g('w13-10', 'PHI', 'ARI', '2026-12-06', 'Sun · 4:05 PM ET'),
      g('w13-11', 'BUF', 'NE',  '2026-12-06', 'Sun · 4:25 PM ET'),
      g('w13-12', 'CAR', 'MIN', '2026-12-06', 'Sun · 4:25 PM ET'),
      g('w13-13', 'HOU', 'PIT', '2026-12-06', 'Sun · 8:20 PM ET'),
      g('w13-14', 'DAL', 'SEA', '2026-12-07', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 14 ────────────────────────────────────────────────
  {
    week: 14,
    label: 'Week 14',
    byeTeams: ['ARI', 'DAL'],
    games: [
      g('w14-1',  'MIN', 'NE',  '2026-12-10', 'Thu · 8:15 PM ET'),
      g('w14-2',  'ATL', 'CLE', '2026-12-13', 'Sun · 1:00 PM ET'),
      g('w14-3',  'CHI', 'MIA', '2026-12-13', 'Sun · 1:00 PM ET'),
      g('w14-4',  'DEN', 'NYJ', '2026-12-13', 'Sun · 1:00 PM ET'),
      g('w14-5',  'HOU', 'WAS', '2026-12-13', 'Sun · 1:00 PM ET'),
      g('w14-6',  'IND', 'PHI', '2026-12-13', 'Sun · 1:00 PM ET'),
      g('w14-7',  'NO',  'CAR', '2026-12-13', 'Sun · 1:00 PM ET'),
      g('w14-8',  'TB',  'BAL', '2026-12-13', 'Sun · 1:00 PM ET'),
      g('w14-9',  'TEN', 'DET', '2026-12-13', 'Sun · 1:00 PM ET'),
      g('w14-10', 'LAC', 'LV',  '2026-12-13', 'Sun · 4:05 PM ET'),
      g('w14-11', 'KC',  'CIN', '2026-12-13', 'Sun · 4:25 PM ET'),
      g('w14-12', 'LAR', 'SF',  '2026-12-13', 'Sun · 4:25 PM ET'),
      g('w14-13', 'NYG', 'SEA', '2026-12-13', 'Sun · 4:25 PM ET'),
      g('w14-14', 'BUF', 'GB',  '2026-12-13', 'Sun · 8:20 PM ET'),
      g('w14-15', 'PIT', 'JAX', '2026-12-14', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 15 ────────────────────────────────────────────────
  {
    week: 15,
    label: 'Week 15',
    byeTeams: [],
    games: [
      g('w15-1',  'SF',  'LAC', '2026-12-17', 'Thu · 8:15 PM ET'),
      g('w15-2',  'SEA', 'PHI', '2026-12-19', 'Sat · 5:00 PM ET'),
      g('w15-3',  'CHI', 'BUF', '2026-12-19', 'Sat · 8:20 PM ET'),
      g('w15-4',  'BAL', 'PIT', '2026-12-20', 'Sun · 1:00 PM ET'),
      g('w15-5',  'ATL', 'WAS', '2026-12-20', 'Sun · 1:00 PM ET'),
      g('w15-6',  'CIN', 'CAR', '2026-12-20', 'Sun · 1:00 PM ET'),
      g('w15-7',  'CLE', 'NYG', '2026-12-20', 'Sun · 1:00 PM ET'),
      g('w15-8',  'IND', 'TEN', '2026-12-20', 'Sun · 1:00 PM ET'),
      g('w15-9',  'JAX', 'HOU', '2026-12-20', 'Sun · 1:00 PM ET'),
      g('w15-10', 'MIA', 'GB',  '2026-12-20', 'Sun · 1:00 PM ET'),
      g('w15-11', 'NO',  'TB',  '2026-12-20', 'Sun · 1:00 PM ET'),
      g('w15-12', 'NYJ', 'ARI', '2026-12-20', 'Sun · 4:05 PM ET'),
      g('w15-13', 'DAL', 'LAR', '2026-12-20', 'Sun · 4:25 PM ET'),
      g('w15-14', 'DEN', 'LV',  '2026-12-20', 'Sun · 4:25 PM ET'),
      g('w15-15', 'DET', 'MIN', '2026-12-20', 'Sun · 8:20 PM ET'),
      g('w15-16', 'NE',  'KC',  '2026-12-21', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 16 (Christmas) ────────────────────────────────────
  {
    week: 16,
    label: 'Week 16 — Christmas',
    byeTeams: [],
    games: [
      g('w16-1',  'HOU', 'PHI', '2026-12-24', 'Thu · 8:15 PM ET'),
      g('w16-2',  'GB',  'CHI', '2026-12-25', 'Fri · 1:00 PM ET'),
      g('w16-3',  'BUF', 'DEN', '2026-12-25', 'Fri · 4:30 PM ET'),
      g('w16-4',  'LAR', 'SEA', '2026-12-25', 'Fri · 8:15 PM ET'),
      g('w16-5',  'ARI', 'NO',  '2026-12-27', 'Sun · 1:00 PM ET'),
      g('w16-6',  'CLE', 'BAL', '2026-12-27', 'Sun · 1:00 PM ET'),
      g('w16-7',  'LAC', 'MIA', '2026-12-27', 'Sun · 1:00 PM ET'),
      g('w16-8',  'NE',  'NYJ', '2026-12-27', 'Sun · 1:00 PM ET'),
      g('w16-9',  'CAR', 'PIT', '2026-12-27', 'Sun · 1:00 PM ET'),
      g('w16-10', 'CIN', 'IND', '2026-12-27', 'Sun · 1:00 PM ET'),
      g('w16-11', 'TB',  'ATL', '2026-12-27', 'Sun · 1:00 PM ET'),
      g('w16-12', 'WAS', 'MIN', '2026-12-27', 'Sun · 1:00 PM ET'),
      g('w16-13', 'TEN', 'LV',  '2026-12-27', 'Sun · 4:05 PM ET'),
      g('w16-14', 'SF',  'KC',  '2026-12-27', 'Sun · 4:25 PM ET'),
      g('w16-15', 'JAX', 'DAL', '2026-12-27', 'Sun · 8:20 PM ET'),
      g('w16-16', 'NYG', 'DET', '2026-12-28', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 17 ────────────────────────────────────────────────
  {
    week: 17,
    label: 'Week 17',
    byeTeams: [],
    games: [
      g('w17-1',  'BAL', 'CIN', '2026-12-31', 'Thu · 8:15 PM ET'),
      g('w17-2',  'BUF', 'MIA', '2027-01-03', 'Sun · 1:00 PM ET'),
      g('w17-3',  'IND', 'CLE', '2027-01-03', 'Sun · 1:00 PM ET'),
      g('w17-4',  'MIN', 'NYJ', '2027-01-03', 'Sun · 1:00 PM ET'),
      g('w17-5',  'NO',  'ATL', '2027-01-03', 'Sun · 1:00 PM ET'),
      g('w17-6',  'NYG', 'DAL', '2027-01-03', 'Sun · 1:00 PM ET'),
      g('w17-7',  'PIT', 'TEN', '2027-01-03', 'Sun · 1:00 PM ET'),
      g('w17-8',  'SEA', 'CAR', '2027-01-03', 'Sun · 1:00 PM ET'),
      g('w17-9',  'KC',  'LAC', '2027-01-03', 'Sun · TBA'),
      g('w17-10', 'DEN', 'NE',  '2027-01-03', 'Sun · TBA'),
      g('w17-11', 'LAR', 'TB',  '2027-01-03', 'Sun · TBA'),
      g('w17-12', 'WAS', 'JAX', '2027-01-03', 'Sun · TBA'),
      g('w17-13', 'LV',  'ARI', '2027-01-03', 'Sun · 4:05 PM ET'),
      g('w17-14', 'DET', 'CHI', '2027-01-03', 'Sun · 4:25 PM ET'),
      g('w17-15', 'PHI', 'SF',  '2027-01-03', 'Sun · 8:20 PM ET'),
      g('w17-16', 'HOU', 'GB',  '2027-01-04', 'Mon · 8:15 PM ET'),
    ],
  },

  // ── WEEK 18 ────────────────────────────────────────────────
  {
    week: 18,
    label: 'Week 18 — Season Finale',
    byeTeams: [],
    games: [
      g('w18-1',  'ATL', 'CAR', '2027-01-10', 'Sun · TBA'),
      g('w18-2',  'CHI', 'MIN', '2027-01-10', 'Sun · TBA'),
      g('w18-3',  'CLE', 'CIN', '2027-01-10', 'Sun · TBA'),
      g('w18-4',  'DAL', 'WAS', '2027-01-10', 'Sun · TBA'),
      g('w18-5',  'DET', 'GB',  '2027-01-10', 'Sun · TBA'),
      g('w18-6',  'JAX', 'IND', '2027-01-10', 'Sun · TBA'),
      g('w18-7',  'LAC', 'DEN', '2027-01-10', 'Sun · TBA'),
      g('w18-8',  'LV',  'KC',  '2027-01-10', 'Sun · TBA'),
      g('w18-9',  'MIA', 'NE',  '2027-01-10', 'Sun · TBA'),
      g('w18-10', 'NYJ', 'BUF', '2027-01-10', 'Sun · TBA'),
      g('w18-11', 'PHI', 'NYG', '2027-01-10', 'Sun · TBA'),
      g('w18-12', 'PIT', 'BAL', '2027-01-10', 'Sun · TBA'),
      g('w18-13', 'SEA', 'LAR', '2027-01-10', 'Sun · TBA'),
      g('w18-14', 'SF',  'ARI', '2027-01-10', 'Sun · TBA'),
      g('w18-15', 'TB',  'NO',  '2027-01-10', 'Sun · TBA'),
      g('w18-16', 'TEN', 'HOU', '2027-01-10', 'Sun · TBA'),
    ],
  },
];

// ============================================================
// Helpers for the app
// ============================================================

/** Get the current week based on today's date */
export function getCurrentWeek(now = new Date()) {
  for (let i = SCHEDULE.length - 1; i >= 0; i--) {
    const week = SCHEDULE[i];
    const firstGameDate = new Date(week.games[0].date + 'T00:00:00');
    // A week "starts" 2 days before the first game (to show picks UI early)
    const weekStart = new Date(firstGameDate);
    weekStart.setDate(weekStart.getDate() - 2);
    if (now >= weekStart) return week.week;
  }
  return 1;
}

/** Get a specific week's data */
export function getWeek(weekNum) {
  return SCHEDULE.find((w) => w.week === weekNum) ?? null;
}

/** Get games for a specific week */
export function getGames(weekNum) {
  return getWeek(weekNum)?.games ?? [];
}

/** US Eastern offset for a YYYY-MM-DD date (DST ends 2026-11-01, resumes 2027-03-14) */
function etOffset(dateStr) {
  return dateStr >= '2026-11-01' && dateStr < '2027-03-14' ? '-05:00' : '-04:00';
}

/**
 * Sheet-submission deadline for a week: 5 hours before the first scheduled kickoff.
 * Games with TBA times are ignored when a firm kickoff exists; if every game
 * is TBA, the deadline falls back to 5 hours before 1:00 PM ET on the earliest game date.
 */
export function getWeekDeadline(weekNum) {
  const games = getGames(weekNum);
  if (!games.length) return null;
  const firm = games.filter((game) => !game.time.includes('TBA'));
  const source = firm.length ? firm : games;
  const kickoffs = source.map((game) => {
    const time = firm.length ? game.kickoff.split('T')[1] : '13:00:00';
    return new Date(`${game.date}T${time}${etOffset(game.date)}`);
  }).filter((date) => !Number.isNaN(date.getTime()));
  if (!kickoffs.length) return null;
  const firstKickoff = kickoffs.sort((a, b) => a - b)[0];
  return new Date(firstKickoff.getTime() - DEADLINE_HOURS_BEFORE_KICKOFF * 3_600_000);
}

/** True once a week's submission deadline has passed */
export function isWeekLocked(weekNum, now = new Date()) {
  const deadline = getWeekDeadline(weekNum);
  return deadline ? now >= deadline : false;
}

/** Human countdown to a deadline, e.g. "2d 4h 12m" (empty string when passed) */
export function formatCountdown(deadline, now = new Date()) {
  if (!deadline) return '';
  let ms = deadline.getTime() - now.getTime();
  if (ms <= 0) return '';
  const days = Math.floor(ms / 86_400_000); ms -= days * 86_400_000;
  const hours = Math.floor(ms / 3_600_000); ms -= hours * 3_600_000;
  const minutes = Math.floor(ms / 60_000);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${Math.max(minutes, 1)}m`;
}

/** Check if a game has kicked off (for pick-locking). Kickoff strings are
 * stored as naive ET wall-clock times — anchor them to the correct Eastern
 * offset so the comparison is timezone-safe on any server or device. */
export function hasGameStarted(game, now = new Date()) {
  // TBA games carry a midnight placeholder kickoff — never treat them as started;
  // the weekly deadline (isWeekLocked) still governs pick locking for those.
  if (!game.kickoff || game.kickoff.includes('TBA') || game.time?.includes('TBA')) return false;
  const hasZone = /(?:[+-]\d{2}:\d{2}|Z)$/.test(game.kickoff);
  const stamp = hasZone ? game.kickoff : `${game.kickoff}${etOffset(game.date ?? game.kickoff.slice(0, 10))}`;
  return now >= new Date(stamp);
}

/** Get all teams on bye for a given week */
export function getByeTeams(weekNum) {
  return getWeek(weekNum)?.byeTeams ?? [];
}

/** Season-aware game lookup — games exist only for the schedule's own season. */
export function getGamesForWeek(season, weekNum) {
  if (Number(season) !== SEASON) return [];
  return getGames(weekNum);
}

/** Two-color identity for a team: [accent, dark base]; safe fallback for unknown teams. */
export function getTeamColors(abbr) {
  const primary = TEAM_COLORS[abbr];
  return primary ? [primary, '#101820'] : ['#0c2c1c', '#c8f75a'];
}

// Backward compatibility — export current week's games as GAMES
export const WEEK = getCurrentWeek();
export const GAMES = getGames(WEEK);

export const EMOJIS = ['😂', '😎', '👍', '🔥', '💯', '🏈', '🎯', '💰', '😤', '💪', '🙌', '👏', '🎉', '😭', '😱', '🤯', '👑', '💎'];
