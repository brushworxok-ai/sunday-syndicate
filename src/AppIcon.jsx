const paths = {
  home: ['M3 11.5 12 4l9 7.5', 'M5 10.5V20h14v-9.5', 'M9 20v-6h6v6'],
  picks: ['M7 4c5-2 9 2 10 6s-2 9-7 10c-5 1-8-3-7-7 .7-3 1.8-7 4-9Z', 'm7 4 10 6', 'M4 12h13', 'm10 7-7-6'],
  results: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  chat: ['M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z'],
  more: ['M4 6h16', 'M4 12h16', 'M4 18h16'],
  live: ['M4 12h3l2-6 4 12 2-6h5'],
  stats: ['M4 19V9', 'M10 19V5', 'M16 19v-7', 'M22 19H2'],
  season: ['M8 4h8v5a4 4 0 0 1-8 0Z', 'M12 13v5', 'M8 21h8', 'M5 5H3v2a4 4 0 0 0 5 4', 'M19 5h2v2a4 4 0 0 1-5 4'],
  survivor: ['M12 3 20 6v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6Z', 'm9 12 2 2 4-5'],
  props: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12Z', 'M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z'],
  cfb: ['M3 10h18', 'M5 10v9', 'M9 10v9', 'M15 10v9', 'M19 10v9', 'M2 21h20', 'm12 3 9 5H3Z'],
  payments: ['M3 6h18v12H3Z', 'M3 10h18', 'M7 15h3'],
  notifs: ['M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9', 'M10 21h4'],
  entries: ['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'],
  players: ['M20 21a8 8 0 0 0-16 0', 'M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z'],
  bets: ['M4 4h16v16H4Z', 'M8 8h.01', 'M16 8h.01', 'M8 16h.01', 'M16 16h.01', 'M12 12h.01'],
  ai: ['m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z', 'm18 14 .8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8Z', 'm5 13 .7 1.8L8 15.5l-2.3.7L5 18l-.7-1.8L2 15.5l2.3-.7Z'],
  rules: ['M4 4h6a4 4 0 0 1 4 4v12a4 4 0 0 0-4-4H4Z', 'M20 4h-6a4 4 0 0 0-4 4v12a4 4 0 0 1 4-4h6Z'],
  demo: ['M11 19a8 8 0 1 1 0-16 8 8 0 0 1 0 16Z', 'm21 21-4.4-4.4'],
  admin: ['M5 10h14v11H5Z', 'M8 10V7a4 4 0 0 1 8 0v3', 'M12 14v3'],
  volume: ['M11 5 6 9H3v6h3l5 4Z', 'M15 9a4 4 0 0 1 0 6', 'M18 6a8 8 0 0 1 0 12'],
  volumeOff: ['M11 5 6 9H3v6h3l5 4Z', 'm16 10 5 5', 'm21 10-5 5'],
  key: ['M15 7a5 5 0 1 1-3.5 8.6L9 18H6v3H3v-3.2l5-5A5 5 0 0 1 15 7Z', 'M16 7h.01'],
  camera: ['M4 7h3l2-3h6l2 3h3v13H4Z', 'M12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z'],
  bellOff: ['m3 3 18 18', 'M18 8a6 6 0 0 0-9.3-5', 'M6.3 6.3A6 6 0 0 0 6 8c0 7-3 7-3 9h14', 'M10 21h4'],
  share: ['M4 12v8h16v-8', 'M12 16V3', 'm7 8 5-5 5 5'],
  lock: ['M5 10h14v11H5Z', 'M8 10V7a4 4 0 0 1 8 0v3'],
  unlock: ['M5 10h14v11H5Z', 'M8 10V7a4 4 0 0 1 7-2'],
  sync: ['M20 7h-5V2', 'M4 17h5v5', 'M20 7a8 8 0 0 0-13.6-2.8L4 7', 'M4 17a8 8 0 0 0 13.6 2.8L20 17'],
  wallet: ['M3 7h16v13H3Z', 'M3 7l13-4v4', 'M15 12h6v4h-6Z'],
  clock: ['M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z', 'M12 6v6l4 2'],
  phone: ['M6.6 2h3l1.5 5-2 1.5a16 16 0 0 0 6.4 6.4l1.5-2 5 1.5v3A3.6 3.6 0 0 1 18.4 21C9.9 20.4 3.6 14.1 3 5.6A3.6 3.6 0 0 1 6.6 2Z'],
  users: ['M16 21a6 6 0 0 0-12 0', 'M10 13a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M17 11a3 3 0 1 0 0-6', 'M22 21a5 5 0 0 0-5-5'],
  send: ['m3 3 18 9-18 9 4-9Z', 'M7 12h14'],
  stop: ['M7 7h10v10H7Z'],
};

export default function AppIcon({ name, size = 22, className = '' }) {
  const iconPaths = paths[name] ?? paths.more;
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {iconPaths.map((path, index) => <path d={path} key={`${name}-${index}`} />)}
    </svg>
  );
}
