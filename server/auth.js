import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'syndicate_admin';
const PLAYER_COOKIE_NAME = 'syndicate_player';

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((part) => part.trim().split('=').map(decodeURIComponent)).filter(([key]) => key));
}

function safeEqual(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function hashPin(pin, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(String(pin), salt, 64).toString('hex')}`;
}

export function verifyPin(pin, stored = '') {
  const [salt, expected] = stored.split(':');
  if (!salt || !expected) return false;
  return safeEqual(scryptSync(String(pin), salt, 64).toString('hex'), expected);
}

export function createAdminAuth({ password, secret, secure = false }) {
  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('hex');
  const createToken = () => {
    const payload = Buffer.from(JSON.stringify({ role: 'admin', expiresAt: Date.now() + 8 * 60 * 60 * 1000 })).toString('base64url');
    return `${payload}.${sign(payload)}`;
  };
  const verifyToken = (token = '') => {
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !safeEqual(signature, sign(payload))) return false;
    try { return JSON.parse(Buffer.from(payload, 'base64url').toString()).expiresAt > Date.now(); } catch { return false; }
  };
  const cookie = (token, maxAge) => `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  return {
    login(request, response) {
      if (!password || !safeEqual(request.body?.password ?? '', password)) return response.status(401).json({ error: 'Invalid commissioner password.' });
      response.setHeader('Set-Cookie', cookie(createToken(), 8 * 60 * 60));
      return response.json({ authenticated: true, role: 'admin' });
    },
    logout(_request, response) {
      response.setHeader('Set-Cookie', cookie('', 0));
      return response.json({ authenticated: false });
    },
    status(request, response) {
      const authenticated = verifyToken(parseCookies(request.headers.cookie)[COOKIE_NAME]);
      return response.json({ authenticated, role: authenticated ? 'admin' : null });
    },
    requireAdmin(request, response, next) {
      if (!verifyToken(parseCookies(request.headers.cookie)[COOKIE_NAME])) return response.status(401).json({ error: 'Commissioner authentication required.' });
      request.actor = 'commissioner';
      return next();
    },
  };
}

export function createPlayerAuth({ store, secret, secure = false, allowDemoCredentials = true }) {
  const sign = (payload) => createHmac('sha256', secret).update(payload).digest('hex');
  const credentialAllowed = (credential) => Boolean(credential) && (allowDemoCredentials || credential.status === 'active');
  const createToken = (player, credential) => {
    const payload = Buffer.from(JSON.stringify({
      role: 'player',
      playerId: player.id,
      leagueId: player.leagueId,
      credentialUpdatedAt: credential.updatedAt,
      expiresAt: Date.now() + 270 * 24 * 60 * 60 * 1000,
    })).toString('base64url');
    return `${payload}.${sign(payload)}`;
  };
  const readToken = (token = '') => {
    const [payload, signature] = token.split('.');
    if (!payload || !signature || !safeEqual(signature, sign(payload))) return null;
    try {
      const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
      return data.expiresAt > Date.now() && data.role === 'player' ? data : null;
    } catch { return null; }
  };
  const cookie = (token, maxAge) => `${PLAYER_COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;
  const fromRequest = (request) => readToken(parseCookies(request.headers.cookie)[PLAYER_COOKIE_NAME]);
  const resolveSessionPlayer = async (request) => {
    const session = fromRequest(request);
    if (!session) return null;
    const [player, credential] = await Promise.all([
      store.getPlayer(session.playerId),
      store.getPlayerCredential(session.playerId),
    ]);
    if (!player || !credentialAllowed(credential) || session.credentialUpdatedAt !== credential.updatedAt) return null;
    return player;
  };

  return {
    async login(request, response) {
      const credential = await store.getPlayerCredential(request.body?.playerId);
      const player = credential ? await store.getPlayer(request.body.playerId) : null;
      if (credential && !credentialAllowed(credential)) {
        return response.status(403).json({
          error: 'The commissioner must issue this player a new private 6-digit PIN before sign-in.',
          code: 'player_pin_setup_required',
        });
      }
      if (!credential || !player || !verifyPin(request.body?.pin ?? '', credential.pinHash)) return response.status(401).json({ error: 'Invalid player or PIN.' });
      response.setHeader('Set-Cookie', cookie(createToken(player, credential), 270 * 24 * 60 * 60));
      return response.json({ authenticated: true, role: 'player', playerId: player.id, name: player.name, account: player.account });
    },
    logout(_request, response) {
      response.setHeader('Set-Cookie', cookie('', 0));
      return response.json({ authenticated: false });
    },
    async status(request, response) {
      const player = await resolveSessionPlayer(request);
      if (!player && fromRequest(request)) response.setHeader('Set-Cookie', cookie('', 0));
      return response.json({ authenticated: Boolean(player), role: player ? 'player' : null, playerId: player?.id ?? null, name: player?.name ?? null, account: player?.account ?? null });
    },
    async requirePlayer(request, response, next) {
      const player = await resolveSessionPlayer(request);
      if (!player) return response.status(401).json({ error: 'Player sign-in required.' });
      request.player = player;
      request.actor = player.id;
      return next();
    },
    /** Optional auth: the signed-in player, or null — never throws. */
    playerFromRequest(request) {
      return resolveSessionPlayer(request);
    },
  };
}
