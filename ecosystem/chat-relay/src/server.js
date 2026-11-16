const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const httpProxy = require('http-proxy');

const { io: ioClient } = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

const db = require('./src/database');
const relay = require('./src/relay');
const tiktok = require('./src/tiktok');
const youtube = require('./src/youtube');
const discord = require('./src/discord');
const commands = require('./src/commands');
const apps = require('./src/apps');
const spotify = require('./src/spotify');
const auth = require('./src/auth');
const discordOAuth = require('./src/discord-oauth');
const githubOAuth = require('./src/github-oauth');
const wordBank = require('./src/word-bank');
const chatFilter = require('./src/chat-filter');

const app = express();

// Trust nginx reverse proxy (needed for secure cookies, correct protocol detection)
app.set('trust proxy', 1);

// ─── Chat Room System ──────────────────────────────────────────────────
const VALID_ROOMS = ['main', 'wordle', 'subtextle', 'searchle', 'spellingbee', 'pixeletters', 'word500', 'word5000', 'colour500', 'color500', 'betwixt', 'betweenly', 'squaredle', 'rectangled', 'figural', 'unwordle', 'erectangled', 'sproutle', 'wikicontexto', 'wikisearchle', 'wikirectangled', 'triangled', 'junkdrawer', 'synapse'];

// Chat history is now DB-backed (12-hour persistence)
// Clean up old messages every 30 minutes
function startChatCleanup() {
  // Clean on startup
  db.cleanOldChatMessages();
  // Then every 30 minutes
  setInterval(() => {
    db.cleanOldChatMessages();
  }, 30 * 60 * 1000);
}
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000', 'http://127.0.0.1:3000',
      'https://wordtycoon.live', 'https://www.wordtycoon.live'
    ],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;
const WORD_EMPIRES_PORT = 3020;
const WORD_EMPIRES_URL = `http://localhost:${WORD_EMPIRES_PORT}`;
const WT_API_SECRET = process.env.GAME_API_SECRET;

// Authenticated fetch helper — adds API key for Word Tycoon requests
function wtFetch(url, options = {}) {
  const headers = { ...options.headers || {} };
  headers['x-relay-auth'] = WT_API_SECRET;
  if (!headers['Content-Type'] && options.method && options.method !== 'GET') {
    headers['Content-Type'] = 'application/json';
  }
  return fetch(url, { ...options, headers });
}

async function proxyStripeWebhook(req, res) {
  try {
    const upstream = await fetch(`${WORD_EMPIRES_URL}/api/stripe/webhook`, {
      method: 'POST',
      headers: {
        'Content-Type': req.headers['content-type'] || 'application/json',
        'stripe-signature': req.headers['stripe-signature'] || '',
        'x-relay-auth': WT_API_SECRET
      },
      body: req.body
    });

    const text = await upstream.text();
    const contentType = upstream.headers.get('content-type');
    if (contentType) res.setHeader('Content-Type', contentType);
    res.status(upstream.status).send(text);
  } catch (error) {
    console.error('[Stripe webhook proxy] Failed:', error.message);
    res.status(502).json({ ok: false, message: 'Stripe webhook proxy failed' });
  }
}

async function resolveWordTycoonAccountId(discordUser) {
  const provider = discordUser.provider || (discordUser.id.startsWith('gh_') ? 'github' : 'discord');
  if (provider !== 'github') {
    return { ok: true, linked: true, provider, accountId: discordUser.id };
  }

  try {
    const resolveRes = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(discordUser.id)}`);
    const resolveData = await resolveRes.json();
    if (resolveData.linked && resolveData.discordUserId) {
      return { ok: true, linked: true, provider, accountId: resolveData.discordUserId };
    }
    return { ok: true, linked: false, provider, accountId: null };
  } catch (error) {
    return { ok: false, linked: false, provider, error };
  }
}

// Cosmetics lookup — uses relay module's shared cache (no duplication)
const getUserCosmetics = (discordId) => relay.getUserCosmetics(discordId);
const SEARCHLE_PORT = 3015;
const SEARCHLE_URL = `http://localhost:${SEARCHLE_PORT}`;
const WORD500_URL = process.env.WORD500_URL || 'https://wordtycoon.live/word500';
const WORD500_PORT = 3011;
const WORD500_DIRECT = `http://localhost:${WORD500_PORT}`; // Direct for admin API (avoids nginx loop)
const BETWEENLY_PORT = 3017;
const BETWEENLY_URL = `http://localhost:${BETWEENLY_PORT}`;
const WORDLE_PORT = 3014;
const WORDLE_URL = `http://localhost:${WORDLE_PORT}`;
const PIXELETTERS_PORT = 3012;
const PIXELETTERS_URL = `http://localhost:${PIXELETTERS_PORT}`;

// ─── Live Game State Aggregation ────────────────────────────────────
const LIVE_GAMES = [
  { id: 'wordle', name: 'Wordle', emoji: '🎯', color: '#6aaa64', port: 3014, endpoint: '/api/state', playUrl: '/wordle-multi/' },
  { id: 'word500', name: 'Word5000', emoji: '🔤', color: '#4fc34f', port: 3011, endpoint: '/api/state', playUrl: '/word500-multi/' },
  { id: 'betwixt', name: 'Betwixt', emoji: '📐', color: '#7b68ee', port: 3017, endpoint: '/api/public-state', playUrl: '/betwixt-multi/' },
  { id: 'pixeletters', name: 'PixeLetters', emoji: '🧩', color: '#ff6b9d', port: 3012, endpoint: '/api/game', playUrl: '/pixeletters-multi/' },
  { id: 'searchle', name: 'Subtextle', emoji: '🔍', color: '#4a9eff', port: 3015, endpoint: '/api/game/state', playUrl: '/searchle/' },
  { id: 'spellingbee', name: 'Spelling Bee', emoji: '🐝', color: '#ffab00', port: 3013, endpoint: '/api/state', playUrl: '/spellingbee-multi/' },
  { id: 'squaredle', name: 'recTangled', emoji: '⬛', color: '#e94560', port: 3016, endpoint: '/api/game/state', playUrl: '/squaredle-multi/' },
  { id: 'figural', name: 'Figural', emoji: '🔣', color: '#00f0ff', port: 3019, endpoint: '/api/state', playUrl: '/figural-multi/' },
  { id: 'erectangled', legacyIds: ['sproutle'], name: 'erecTangled', emoji: '🌱', color: '#44bb88', port: 3023, endpoint: '/api/state', playUrl: 'https://erectangled.com/' },
];

let cachedLiveState = { games: [], timestamp: 0 };

async function pollGameStates() {
  const results = await Promise.all(LIVE_GAMES.map(async (cfg) => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(`http://localhost:${cfg.port}${cfg.endpoint}`, { signal: controller.signal });
      clearTimeout(timeout);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const raw = await res.json();
      return normalizeGameState(cfg, raw);
    } catch (e) {
      return {
        id: cfg.id, name: cfg.name, emoji: cfg.emoji, color: cfg.color,
        status: 'offline', guesses: 0, jackpot: 0, elapsed: 0, wordLength: 0,
        winner: null, extra: {}, playUrl: cfg.playUrl
      };
    }
  }));
  cachedLiveState = { games: results, timestamp: Date.now() };
}

function normalizeGameState(cfg, raw) {
  // Unwrap { ok, game: { ... } } wrapper (e.g. Figural)
  if (raw && raw.ok && raw.game && typeof raw.game === 'object') raw = raw.game;

  const base = {
    id: cfg.id, name: cfg.name, emoji: cfg.emoji, color: cfg.color, playUrl: cfg.playUrl,
    extra: {}
  };

  let status = 'active';
  if (raw.gameOver || raw.isWon || raw.hasWinner || raw.isComplete || raw.status === 'won' || raw.status === 'ended') {
    status = 'won';
  } else if (raw.status === 'idle' || raw.status === 'paused') {
    status = raw.status;
  }

  let guesses = 0;
  if (typeof raw.guesses === 'number') guesses = raw.guesses;
  else if (Array.isArray(raw.guesses)) guesses = raw.guesses.length;
  else if (typeof raw.guessCount === 'number') guesses = raw.guessCount;

  let jackpot = raw.jackpot || 0;

  let elapsed = 0;
  if (raw.startTime) {
    elapsed = Math.max(0, Math.floor((Date.now() - new Date(raw.startTime).getTime()) / 1000));
  } else if (raw.gameStartTime) {
    elapsed = Math.max(0, Math.floor((Date.now() - new Date(raw.gameStartTime).getTime()) / 1000));
  }

  let wordLength = raw.wordLength || 0;

  let winner = null;
  if (raw.winner && typeof raw.winner === 'object') {
    winner = { displayName: raw.winner.displayName || raw.winner.username || 'Player', profilePic: raw.winner.profilePic || null };
  }

  if (cfg.id === 'spellingbee') {
    base.extra.timerRemaining = raw.timerRemaining || null;
    base.extra.centerLetter = raw.centerLetter || null;
    base.extra.letters = raw.letters || [];
    if (raw.foundWords && typeof raw.foundWords === 'object') {
      guesses = Array.isArray(raw.foundWords) ? raw.foundWords.length : Object.keys(raw.foundWords).length;
    }
    base.extra.guessLabel = 'words';
    base.extra.commonCount = raw.commonCount || 0;
    base.extra.foundCommonCount = raw.foundCommonCount || 0;
  }

  if (cfg.id === 'squaredle') {
    base.extra.foundCommonCount = raw.foundCommonCount || 0;
    base.extra.commonCount = raw.commonCount || raw.totalCount || 0;
    base.extra.percentage = raw.percentage || 0;
    base.extra.guessLabel = 'words';
    guesses = raw.foundCommonCount || 0;
  }

  if (cfg.id === 'betwixt') {
    base.extra.confirmedLetters = raw.confirmedLetters || [];
  }

  if (cfg.id === 'erectangled') {
    base.extra.foundCommonCount = raw.foundCommonCount || 0;
    base.extra.commonCount = raw.commonCount || 0;
    base.extra.guessLabel = 'words';
    base.extra.gridSize = raw.gridSize || '';
    base.extra.revealedCells = raw.revealedCells || 0;
    base.extra.totalCells = raw.totalCells || 0;
    guesses = raw.wordsFound || 0;
  }

  const playerCount = raw.playerCount || 0;
  const isDaily = raw.isDaily || false;

  return { ...base, status, guesses, jackpot, elapsed, wordLength, winner, playerCount, isDaily };
}

// JSON parsing (must be before auth so login POST works)
// Skip body parsing for /game/* routes — the proxy needs the raw request stream intact
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), proxyStripeWebhook);
app.use((req, res, next) => {
  if (req.path.startsWith('/game/')) return next();
  express.json()(req, res, next);
});

// ─── Domain redirect: wordtycoon.live:3000 → wordtycoon.live (port 80 via nginx) ───
// Must be before auth so it catches requests before admin redirect kicks in
app.use((req, res, next) => {
  const host = req.hostname;
  if (host && host.endsWith('wordtycoon.live') && req.headers.host && req.headers.host.includes(':')) {
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }
  next();
});

// Standalone game domains — trusted for OAuth redirect + CORS
const TRUSTED_GAME_DOMAINS = ['word5000.com', 'subtextle.com', 'grid.subtextle.com', 'rectangled.live', 'erectangled.com'];

// CORS — whitelist known origins for API access
const CR_ALLOWED_ORIGINS = [
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'https://wordtycoon.live', 'https://www.wordtycoon.live',
  'https://word5000.com', 'https://subtextle.com', 'https://grid.subtextle.com', 'https://rectangled.live', 'https://erectangled.com',
  'http://localhost:3010', 'http://localhost:3011', 'http://localhost:3012',
  'http://localhost:3013', 'http://localhost:3014', 'http://localhost:3015',
  'http://localhost:3016', 'http://localhost:3017', 'http://localhost:3018',
  'http://localhost:3019', 'http://localhost:3020', 'http://localhost:3021',
  'http://localhost:3025', 'http://localhost:3030'
];
// (must be before auth so pre-flight OPTIONS requests work)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && CR_ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  // No origin = same-origin or server-to-server — no CORS header needed
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, x-api-key, x-relay-auth');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Security Headers ─────────────────────────────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '0'); // Disabled per OWASP (legacy browser XSS auditors can cause issues)
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Auth middleware — sessions + admin route protection (must be before static serving)
const sessionMiddleware = auth.initialize(app);

// Share session with Socket.IO (enables identity verification for chat)
io.engine.use(sessionMiddleware);

// ─── Persistent "Remember Me" Token (survives PM2 restarts) ─────────
const crypto = require('crypto');
const REMEMBER_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const REMEMBER_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const REMEMBER_COOKIE = 'wt_remember';

function createRememberToken(user) {
  const payload = JSON.stringify({
    id: user.id,
    username: user.username,
    globalName: user.globalName,
    avatar: user.avatar,
    provider: user.provider || (user.id.startsWith('gh_') ? 'github' : 'discord'),
    exp: Date.now() + REMEMBER_MAX_AGE
  });
  const sig = crypto.createHmac('sha256', REMEMBER_SECRET).update(payload).digest('hex');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

function verifyRememberToken(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const payload = Buffer.from(parts[0], 'base64url').toString();
    const expectedSig = crypto.createHmac('sha256', REMEMBER_SECRET).update(payload).digest('hex');
    // Timing-safe comparison
    const sigBuf = Buffer.from(parts[1], 'hex');
    const expectedBuf = Buffer.from(expectedSig, 'hex');
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) return null;
    const data = JSON.parse(payload);
    if (data.exp < Date.now()) return null;
    return { id: data.id, username: data.username, globalName: data.globalName, avatar: data.avatar, provider: data.provider };
  } catch (e) { return null; }
}

function getCookieValue(req, name) {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  const match = cookies.split(';').find(function(c) { return c.trim().startsWith(name + '='); });
  return match ? decodeURIComponent(match.trim().slice(name.length + 1)) : null;
}

function setRememberCookie(res, user) {
  const token = createRememberToken(user);
  res.cookie(REMEMBER_COOKIE, token, {
    httpOnly: true,
    secure: !!process.env.DISCORD_OAUTH_REDIRECT_URI && process.env.DISCORD_OAUTH_REDIRECT_URI.startsWith('https://'),
    sameSite: 'lax',
    maxAge: REMEMBER_MAX_AGE,
    path: '/'
  });
}

// Middleware: restore session from persistent cookie if session is empty
app.use(function(req, res, next) {
  if (!req.session.discordUser) {
    var rememberVal = getCookieValue(req, REMEMBER_COOKIE);
    if (rememberVal) {
      var user = verifyRememberToken(rememberVal);
      if (user) {
        req.session.discordUser = user;
        console.log('[Auth] Session restored from remember cookie: ' + user.username);
      } else {
        // Token invalid/expired — clear it
        res.clearCookie(REMEMBER_COOKIE, { path: '/' });
      }
    }
  }
  next();
});

// ─── Cross-origin auth token store (for Searchle at port 3015) ──────
const authTokens = new Map(); // token → { user, created }
const AUTH_TOKEN_TTL = 60000; // 60 seconds

function generateAuthToken(discordUser) {
  const token = crypto.randomBytes(24).toString('hex');
  authTokens.set(token, { user: discordUser, created: Date.now() });
  // Clean expired tokens
  for (const [k, v] of authTokens) {
    if (Date.now() - v.created > AUTH_TOKEN_TTL) authTokens.delete(k);
  }
  return token;
}

// ─── Discord OAuth2 Routes ──────────────────────────────────────────

// ─── Account Linking Helpers ─────────────────────────────────────────
async function checkLinkConflict(platform, platformUserId, expectedDiscordId) {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=${encodeURIComponent(platform)}&platformUserId=${encodeURIComponent(platformUserId)}`);
    const data = await r.json();
    if (data.linked && data.discordUserId && data.discordUserId !== expectedDiscordId) {
      return { conflict: true, existingDiscordId: data.discordUserId };
    }
    return { conflict: false };
  } catch (e) {
    console.error('[Link] Conflict check failed:', e.message);
    return { conflict: false }; // fail open — let it try
  }
}

async function createAccountLink(discordId, platform, platformUserId) {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${encodeURIComponent(discordId)}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, platformUserId })
    });
    const data = await r.json();
    console.log(`[Link] Created link: Discord ${discordId} ↔ ${platform}:${platformUserId} → ${data.ok ? 'OK' : data.message}`);
    return data;
  } catch (e) {
    console.error('[Link] Create link failed:', e.message);
    return { ok: false, message: e.message };
  }
}

async function removeAccountLink(discordId, platform, platformUserId) {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${encodeURIComponent(discordId)}/unlink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, platformUserId })
    });
    const data = await r.json();
    console.log(`[Link] Removed link: Discord ${discordId} ↔ ${platform}:${platformUserId} → ${data.ok ? 'OK' : data.message}`);
    return data;
  } catch (e) {
    console.error('[Link] Remove link failed:', e.message);
    return { ok: false, message: e.message };
  }
}

// Auto-link TikTok/YouTube/Twitch from Discord connections
async function autoLinkConnections(discordId, discordUsername, connections) {
  const LINKABLE = ['tiktok', 'youtube', 'twitch'];
  const linkable = connections.filter(c => LINKABLE.includes(c.type) && !c.revoked);
  let linked = 0;

  for (const conn of linkable) {
    const platform = conn.type;
    // TikTok: use name (username like "draybaebae"). YouTube: use id (channel ID "UCxxx...")
    const platformUserId = (platform === 'youtube') ? conn.id : (conn.name || conn.id);

    const conflict = await checkLinkConflict(platform, platformUserId, discordId);
    if (conflict.conflict) {
      console.log(`[Link] Auto-link skip: ${platform}:${platformUserId} already linked to ${conflict.existingDiscordId}`);
      continue;
    }

    await createAccountLink(discordId, platform, platformUserId);
    console.log(`[Link] Auto-linked: Discord ${discordId} → ${platform}:${platformUserId}`);
    linked++;
  }

  if (linked > 0) {
    try { relay.refreshLinkedCache(); } catch (e) {}
  }
  return linked;
}

// Helper: regenerate session after OAuth login (prevents session fixation)
function regenerateSessionAndSet(req, userData) {
  const wasAdmin = req.session.isAdmin;
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.discordUser = userData;
      if (wasAdmin) req.session.isAdmin = true;
      resolve();
    });
  });
}

// Helper: extract a same-origin path from a Referer header or URL.
function extractSameOriginPath(urlString, reqHostname) {
  if (!urlString) return null;
  if (urlString.startsWith('/') && !urlString.startsWith('//')) return urlString; // already a path (reject protocol-relative //evil.com)
  try {
    const parsed = new URL(urlString);
    if (parsed.hostname === reqHostname) {
      return parsed.pathname + (parsed.search || '');
    }
  } catch (e) {}
  return null;
}

app.get('/auth/discord', (req, res) => {
  if (!discordOAuth.isConfigured()) {
    return res.status(500).send('Discord OAuth not configured');
  }

  // Account linking: if ?action=link and user is already logged in, save linking state
  if (req.query.action === 'link' && req.session.discordUser) {
    req.session.linkingFrom = { ...req.session.discordUser };
    req.session.oauthReturnTo = '/me?linked=success';
    console.log(`[Link] ${req.session.discordUser.username} initiating Discord link (from ${req.session.discordUser.provider})`);
  } else {
    // Determine where to redirect after login:
    // 1. Explicit returnTo param — kept AS-IS (path or full URL)
    //    Full URLs get token-based redirect (Searchle game needs ?auth=<token>)
    //    Paths get session-based redirect (chat widget, game proxy games)
    // 2. Referer header fallback — extracted as path (catches games with no returnTo)
    // 3. Default to /me
    let returnTo = req.query.returnTo || null;

    if (!returnTo) {
      const referer = req.get('Referer');
      const refPath = extractSameOriginPath(referer, req.hostname);
      if (refPath && !refPath.startsWith('/auth/')) {
        returnTo = refPath;
      }
    }

    if (returnTo) {
      req.session.oauthReturnTo = returnTo;
    }
  }

  const state = discordOAuth.generateState();
  req.session.oauthState = state;
  console.log(`[OAuth] Initiating Discord login (returnTo: ${req.session.oauthReturnTo || '/me'})`);
  res.redirect(discordOAuth.getAuthUrl(state));
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const returnTo = req.session.oauthReturnTo;
  delete req.session.oauthReturnTo;

  // For error redirects, extract a safe same-origin path (never fall back to raw returnTo — open redirect risk)
  const safePath = extractSameOriginPath(returnTo, req.hostname);

  if (error || !code) {
    console.log(`[OAuth] Discord denied/error (returnTo: ${safePath || '/me'})`);
    return res.redirect(safePath || '/me?error=denied');
  }
  if (state !== req.session.oauthState) {
    console.log(`[OAuth] State mismatch (returnTo: ${safePath || '/me'})`);
    return res.redirect(safePath || '/me?error=invalid_state');
  }
  delete req.session.oauthState;

  try {
    const tokens = await discordOAuth.exchangeCode(code);
    const user = await discordOAuth.getUser(tokens.access_token);

    // Map Discord locale to ISO country code for region settings
    const localeToCountry = {
      'en-US': 'US', 'en-GB': 'GB', 'de-DE': 'DE', 'fr-FR': 'FR',
      'ja-JP': 'JP', 'ko-KR': 'KR', 'sv-SE': 'SE', 'nl': 'NL', 'nl-NL': 'NL',
      'pt-BR': 'BR', 'es-ES': 'ES', 'es-419': 'MX', 'it-IT': 'IT',
      'pl-PL': 'PL', 'ru-RU': 'RU', 'zh-CN': 'CN', 'zh-TW': 'TW',
      'en': 'US', 'de': 'DE', 'fr': 'FR', 'ja': 'JP', 'ko': 'KR',
    };
    const discordCountry = localeToCountry[user.locale] || null;
    req.session.discordCountry = discordCountry;

    const discordUser = {
      id: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : null,
      provider: 'discord'
    };

    // ── Account Linking: GitHub user linking their Discord ──
    const linkingFrom = req.session.linkingFrom;
    delete req.session.linkingFrom;

    if (linkingFrom && linkingFrom.provider === 'github') {
      // GitHub user is linking Discord → Discord becomes the anchor
      const githubPlatformId = linkingFrom.id; // e.g. "gh_12345"
      const discordId = user.id;

      // Check if this GitHub account is already linked to a different Discord user
      const conflict = await checkLinkConflict('github', githubPlatformId, discordId);
      if (conflict.conflict) {
        console.log(`[Link] Conflict: GitHub ${githubPlatformId} already linked to Discord ${conflict.existingDiscordId}`);
        return res.redirect('/me?error=already_linked');
      }

      // Create the link (Discord anchor ↔ GitHub platform)
      await createAccountLink(discordId, 'github', githubPlatformId);

      // Also auto-link TikTok/YouTube/Twitch from Discord connections
      try {
        const connections = await discordOAuth.getConnections(tokens.access_token);
        await autoLinkConnections(discordId, user.username, connections);
      } catch (e) {
        console.log('[Link] Discord connections auto-link failed (non-fatal):', e.message);
      }

      // Switch session to Discord identity (Discord is the anchor)
      await regenerateSessionAndSet(req, discordUser);
      setRememberCookie(res, discordUser);

      // Refresh relay linked-groups cache
      try { relay.refreshLinkedCache(); } catch (e) {}

      console.log(`[Link] Success: GitHub ${githubPlatformId} → Discord ${discordId}`);
      return res.redirect('/me?linked=success');
    }

    // ── Auto-link TikTok/YouTube/Twitch from Discord connections ──
    try {
      const connections = await discordOAuth.getConnections(tokens.access_token);
      await autoLinkConnections(user.id, user.username, connections);
    } catch (e) {
      console.log('[Link] Discord connections auto-link failed (non-fatal):', e.message);
    }

    // ── Normal Discord login ──
    await regenerateSessionAndSet(req, discordUser);
    console.log(`[OAuth] Discord login: ${user.username} (${user.id}) → ${returnTo || '/me'}`);

    // Set persistent "remember me" cookie (survives PM2 restarts)
    setRememberCookie(res, discordUser);

    if (returnTo) {
      if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        return res.redirect(returnTo);
      }
      // Allow full-URL redirects to same hostname OR trusted game domains
      try {
        const parsed = new URL(returnTo);
        const isSameHost = parsed.hostname === req.hostname;
        const isTrusted = TRUSTED_GAME_DOMAINS.includes(parsed.hostname);
        if (isSameHost || isTrusted) {
          const token = generateAuthToken(discordUser);
          const sep = returnTo.includes('?') ? '&' : '?';
          return res.redirect(`${returnTo}${sep}auth_token=${token}`);
        }
      } catch (e) {}
      // External URL — reject, redirect to /me instead
      console.warn(`[OAuth] Blocked external returnTo: ${returnTo}`);
    }

    res.redirect('/me');
  } catch (err) {
    console.error('[OAuth] Discord callback error:', err.message);
    res.redirect(safePath || '/me?error=auth_failed');
  }
});

// ─── GitHub OAuth ──────────────────────────────────────────────────
app.get('/auth/github', (req, res) => {
  if (!githubOAuth.isConfigured()) {
    return res.status(500).send('GitHub OAuth not configured');
  }

  // Account linking: if ?action=link and user is already logged in, save linking state
  if (req.query.action === 'link' && req.session.discordUser) {
    req.session.linkingFrom = { ...req.session.discordUser };
    req.session.oauthReturnTo = '/me?linked=success';
    console.log(`[Link] ${req.session.discordUser.username} initiating GitHub link (from ${req.session.discordUser.provider})`);
  } else {
    let returnTo = req.query.returnTo || null;
    if (!returnTo) {
      const referer = req.get('Referer');
      const refPath = extractSameOriginPath(referer, req.hostname);
      if (refPath && !refPath.startsWith('/auth/')) {
        returnTo = refPath;
      }
    }
    if (returnTo) {
      req.session.oauthReturnTo = returnTo;
    }
  }

  const state = githubOAuth.generateState();
  req.session.oauthState = state;
  console.log(`[OAuth] Initiating GitHub login (returnTo: ${req.session.oauthReturnTo || '/me'})`);
  res.redirect(githubOAuth.getAuthUrl(state));
});

app.get('/auth/github/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const returnTo = req.session.oauthReturnTo;
  delete req.session.oauthReturnTo;

  // For error redirects, extract a safe same-origin path (never fall back to raw returnTo — open redirect risk)
  const safePath = extractSameOriginPath(returnTo, req.hostname);

  if (error || !code) {
    console.log(`[OAuth] GitHub denied/error (returnTo: ${safePath || '/me'})`);
    return res.redirect(safePath || '/me?error=denied');
  }
  if (state !== req.session.oauthState) {
    console.log(`[OAuth] State mismatch (returnTo: ${safePath || '/me'})`);
    return res.redirect(safePath || '/me?error=invalid_state');
  }
  delete req.session.oauthState;

  try {
    const tokens = await githubOAuth.exchangeCode(code);
    const user = await githubOAuth.getUser(tokens.access_token);
    const githubUser = {
      id: 'gh_' + user.id,
      username: user.login,
      globalName: user.name || user.login,
      avatar: user.avatar_url || null,
      provider: 'github'
    };

    // ── Account Linking: Discord user linking their GitHub ──
    const linkingFrom = req.session.linkingFrom;
    delete req.session.linkingFrom;

    if (linkingFrom && linkingFrom.provider === 'discord') {
      // Discord user is linking GitHub → Discord stays the anchor
      const discordId = linkingFrom.id;
      const githubPlatformId = 'gh_' + user.id;

      // Check if this GitHub account is already linked to a different Discord user
      const conflict = await checkLinkConflict('github', githubPlatformId, discordId);
      if (conflict.conflict) {
        console.log(`[Link] Conflict: GitHub ${githubPlatformId} already linked to Discord ${conflict.existingDiscordId}`);
        return res.redirect('/me?error=already_linked');
      }

      // Create the link (Discord anchor ↔ GitHub platform)
      await createAccountLink(discordId, 'github', githubPlatformId);

      // Keep session as Discord (already the anchor)
      await regenerateSessionAndSet(req, linkingFrom);
      setRememberCookie(res, linkingFrom);

      // Refresh relay linked-groups cache
      try { relay.refreshLinkedCache(); } catch (e) {}

      console.log(`[Link] Success: Discord ${discordId} → GitHub ${githubPlatformId}`);
      return res.redirect('/me?linked=success');
    }

    // ── Normal GitHub login ──
    await regenerateSessionAndSet(req, githubUser);
    console.log(`[OAuth] GitHub login: ${githubUser.username} (${user.id}) → ${returnTo || '/me'}`);

    setRememberCookie(res, githubUser);

    if (returnTo) {
      if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        return res.redirect(returnTo);
      }
      // Allow full-URL redirects to same hostname OR trusted game domains
      try {
        const parsed = new URL(returnTo);
        const isSameHost = parsed.hostname === req.hostname;
        const isTrusted = TRUSTED_GAME_DOMAINS.includes(parsed.hostname);
        if (isSameHost || isTrusted) {
          const token = generateAuthToken(githubUser);
          const sep = returnTo.includes('?') ? '&' : '?';
          return res.redirect(`${returnTo}${sep}auth_token=${token}`);
        }
      } catch (e) {}
      console.warn(`[OAuth] Blocked external returnTo: ${returnTo}`);
    }

    res.redirect('/me');
  } catch (err) {
    console.error('[OAuth] GitHub callback error:', err.message);
    res.redirect(safePath || '/me?error=auth_failed');
  }
});

// ─── Word Bank API ──
wordBank.registerRoutes(app);

// ─── Token exchange (cross-origin apps call this to get user data) ──
app.get('/api/auth/exchange', (req, res) => {
  // Use origin whitelist instead of wildcard (token exchange sets cookies)
  const origin = req.headers.origin;
  if (origin && CR_ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  const { token } = req.query;
  if (!token) return res.status(400).json({ ok: false, error: 'Missing token' });

  const entry = authTokens.get(token);
  if (!entry || Date.now() - entry.created > AUTH_TOKEN_TTL) {
    authTokens.delete(token);
    return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  }
  authTokens.delete(token); // one-time use
  // Also set remember cookie + session so the chat widget stays logged in
  req.session.discordUser = entry.user;
  setRememberCookie(res, entry.user);
  res.json({ ok: true, user: entry.user });
});

// ─── User Portal API ────────────────────────────────────────────────
app.get('/api/me/session', (req, res) => {
  if (req.session.discordUser) {
    res.json({ ok: true, user: req.session.discordUser });
  } else {
    res.json({ ok: false });
  }
});

app.post('/api/me/logout', (req, res) => {
  delete req.session.discordUser;
  res.clearCookie(REMEMBER_COOKIE, { path: '/' });
  res.json({ ok: true });
});

// Trust device toggle — controls whether login persists across browser sessions
app.get('/api/me/trust-status', (req, res) => {
  var hasCookie = !!getCookieValue(req, REMEMBER_COOKIE);
  res.json({ ok: true, trusted: hasCookie, user: req.session.discordUser || null });
});

app.post('/api/me/trust-device', express.json(), (req, res) => {
  if (!req.session.discordUser) {
    return res.json({ ok: false, error: 'Not logged in' });
  }
  if (req.body.trust) {
    setRememberCookie(res, req.session.discordUser);
  } else {
    res.clearCookie(REMEMBER_COOKIE, { path: '/' });
  }
  res.json({ ok: true, trusted: !!req.body.trust });
});

// ─── Daily MP Game Sequence ───────────────────────────────────────────────────
// Sequence order for daily MP games — admin can start this manually when needed
const DAILY_SEQUENCE = ['searchle', 'word500', 'squaredle', 'pixeletters', 'figural', 'spellingbee'];
const DAILY_SEQUENCE_FILE = path.join(__dirname, 'data', 'daily-sequence.json');
const appSockets = new Map(); // appId → socket (game server connections)

// Sequence state: which game is active, which are done, and what date it's for
let sequenceState = { date: null, currentIndex: -1, completed: [] };

function loadSequenceState() {
  try {
    if (fs.existsSync(DAILY_SEQUENCE_FILE)) {
      const saved = JSON.parse(fs.readFileSync(DAILY_SEQUENCE_FILE, 'utf-8'));
      const { date: edmontonDate } = getEdmontonTime();
      if (saved.date === edmontonDate) {
        sequenceState = saved;
        console.log(`[DailySequence] Restored state for ${edmontonDate}: index=${saved.currentIndex}, completed=${saved.completed}`);
      }
    }
  } catch (e) {
    console.warn('[DailySequence] Failed to load state:', e.message);
  }
}

function saveSequenceState() {
  try {
    fs.writeFileSync(DAILY_SEQUENCE_FILE, JSON.stringify(sequenceState, null, 2));
  } catch (e) {
    console.warn('[DailySequence] Failed to save state:', e.message);
  }
}

function getEdmontonTime() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false
  }).formatToParts(now);
  const get = (type) => parts.find(p => p.type === type)?.value || '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hour: parseInt(get('hour')),
    minute: parseInt(get('minute'))
  };
}

const DAILY_SEQUENCE_AUTO_START = false;

function startDailySequence() {
  const { date } = getEdmontonTime();
  sequenceState = { date, currentIndex: 0, completed: [] };
  saveSequenceState();
  const firstId = DAILY_SEQUENCE[0];
  const sock = appSockets.get(firstId);
  if (sock && sock.connected) {
    sock.emit('activate-daily');
    console.log(`[DailySequence] Started → activating ${firstId}`);
  } else {
    console.warn(`[DailySequence] Started but ${firstId} is not connected`);
  }
  io.to('dashboard').emit('daily-sequence-update', { ...sequenceState, sequence: DAILY_SEQUENCE });
}

function advanceDailySequence(completedGame) {
  const idx = DAILY_SEQUENCE.indexOf(completedGame);
  if (idx === -1 || idx !== sequenceState.currentIndex) {
    console.warn(`[DailySequence] daily-win from "${completedGame}" ignored (expected index ${sequenceState.currentIndex})`);
    return;
  }
  sequenceState.completed.push(completedGame);
  sequenceState.currentIndex = idx + 1;
  saveSequenceState();
  io.to('dashboard').emit('daily-sequence-update', { ...sequenceState, sequence: DAILY_SEQUENCE });

  if (sequenceState.currentIndex < DAILY_SEQUENCE.length) {
    const nextId = DAILY_SEQUENCE[sequenceState.currentIndex];
    const sock = appSockets.get(nextId);
    if (sock && sock.connected) {
      sock.emit('activate-daily');
      console.log(`[DailySequence] ${completedGame} done → activating ${nextId}`);
    } else {
      console.warn(`[DailySequence] ${completedGame} done but ${nextId} is not connected`);
    }
  } else {
    console.log('[DailySequence] All daily games complete!');
  }
}

// Multiplayer daily sequence is admin-start only.
loadSequenceState();
setInterval(() => {
  if (!DAILY_SEQUENCE_AUTO_START) return;
  const { date, hour, minute } = getEdmontonTime();
  if (hour === 18 && minute < 2 && sequenceState.date !== date) {
    console.log('[DailySequence] 6 PM Edmonton — starting daily sequence');
    startDailySequence();
  }
}, 30000);

// ─── SP Daily Completion Tracking (cross-device) ─────────────────────
const SP_DAILY_FILE = path.join(__dirname, 'data', 'sp-daily-completions.json');
const SP_STATE_FILE_PATH = path.join(__dirname, 'data', 'sp-game-state.json');

// Valid gameIds (whitelist to prevent prototype pollution)
const VALID_SP_GAME_IDS = new Set([
  'word500-sp', 'searchle-sp', 'wordle-sp', 'betwixt-sp', 'pixeletters-sp', 'figural-sp',
  'spellingbee-sp', 'rectangled-sp', 'sproutle-sp', 'unwordle-sp',
  'spellingbee-sp-weekly', 'rectangled-sp-weekly', 'sproutle-sp-weekly', 'searchle-sp-weekly'
]);

function isValidGameId(gameId) {
  return typeof gameId === 'string' && VALID_SP_GAME_IDS.has(gameId);
}

// File locks to prevent concurrent read-modify-write race conditions
const fileLocks = {};
function withFileLock(filePath, fn) {
  if (!fileLocks[filePath]) fileLocks[filePath] = Promise.resolve();
  const prev = fileLocks[filePath];
  const next = prev.then(fn, fn); // run fn after previous completes
  fileLocks[filePath] = next.catch(() => {}); // prevent rejection propagation
  return next;
}

function loadJsonFile(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e.code !== 'ENOENT') {
      console.error('[SP] Failed to load', filePath, ':', e.message);
      // Try to back up the corrupted file
      try {
        const backupPath = filePath + '.corrupt.' + Date.now();
        fs.copyFileSync(filePath, backupPath);
        console.error('[SP] Backed up corrupted file to', backupPath);
      } catch (_) {}
    }
    return {};
  }
}

function saveJsonFile(filePath, data) {
  const tmp = filePath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filePath); // atomic rename
}

function loadDailyCompletions() {
  return loadJsonFile(SP_DAILY_FILE);
}

function saveDailyCompletions(data) {
  saveJsonFile(SP_DAILY_FILE, data);
}

// Get daily completion status for logged-in user
app.get('/api/sp-daily/status/:gameId', (req, res) => {
  if (!req.session.discordUser) return res.json({ ok: false, error: 'Not logged in' });
  const gameId = req.params.gameId;
  if (!isValidGameId(gameId)) return res.json({ ok: false, error: 'Invalid gameId' });
  const userId = req.session.discordUser.id;
  const data = loadDailyCompletions();
  const userDates = (data[gameId] && data[gameId][userId]) || [];
  res.json({ ok: true, completedDates: userDates });
});

// Mark a daily as completed
app.post('/api/sp-daily/complete/:gameId', express.json(), async (req, res) => {
  // Accept userId from session, or from request body ONLY with valid API key (server-to-server)
  let userId = req.session?.discordUser?.id;
  if (!userId && req.body?.userId) {
    if (req.headers['x-api-key'] !== WT_API_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    userId = String(req.body.userId);
  }
  if (!userId) return res.json({ ok: false, error: 'Not logged in' });
  const gameId = req.params.gameId;
  if (!isValidGameId(gameId)) return res.json({ ok: false, error: 'Invalid gameId' });
  const date = req.body.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.json({ ok: false, error: 'Invalid date' });
  }
  // Only allow today's UTC date (prevent future/past completions)
  const todayUTC = new Date().toISOString().slice(0, 10);
  if (date !== todayUTC) {
    return res.json({ ok: false, error: 'Date must be today' });
  }

  let alreadyCompleted = false;
  await withFileLock(SP_DAILY_FILE, () => {
    const data = loadDailyCompletions();
    if (!data[gameId]) data[gameId] = {};
    if (!data[gameId][userId]) data[gameId][userId] = [];
    if (data[gameId][userId].includes(date)) {
      alreadyCompleted = true;
      return;
    }
    data[gameId][userId].push(date);
    // Keep only last 90 days per user
    if (data[gameId][userId].length > 90) {
      data[gameId][userId] = data[gameId][userId].slice(-90);
    }
    saveDailyCompletions(data);
  });
  if (alreadyCompleted) return res.json({ ok: true, alreadyCompleted: true });

  // Forward to Word Tycoon as daily-win reward (triggers 3x coins + loot box check)
  const dailyGameMap = { 'word500-sp': 'word500', 'wordle-sp': 'wordle', 'betwixt-sp': 'betwixt', 'figural-sp': 'figural', 'pixeletters-sp': 'pixeletters', 'unwordle-sp': 'unwordle', 'rectangled-sp': 'rectangled', 'sproutle-sp': 'erectangled' };
  const wtGame = dailyGameMap[gameId] || gameId;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/reward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({
        platform: 'discord', userId, username: userId,
        coins: 1, game: wtGame, event: 'daily-win'
      })
    });
    const result = await r.json();
    res.json({ ok: true, reward: result });
  } catch (e) {
    console.error('[SP-Daily] Failed to forward to Word Tycoon:', e.message);
    res.json({ ok: true, reward: null }); // completion recorded even if WT unreachable
  }
});

// Check daily status for a user (called by game clients + Searchle server-side)
app.get('/api/sp-daily/status/:gameId/:userId', (req, res) => {
  const { gameId, userId } = req.params;
  if (!isValidGameId(gameId)) return res.json({ ok: false, error: 'Invalid gameId' });
  const data = loadDailyCompletions();
  const userDates = (data[gameId] && data[gameId][userId]) || [];
  res.json({ ok: true, completedDates: userDates });
});

// ─── Weekly SP Completion (awards cosmetic via Word Tycoon) ──────────
app.post('/api/sp-weekly/complete/:gameId', express.json(), async (req, res) => {
  // Accept userId from session, or from request body ONLY with valid API key (server-to-server)
  let userId = req.session?.discordUser?.id;
  if (!userId && req.body?.userId) {
    if (req.headers['x-api-key'] !== WT_API_SECRET) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    userId = String(req.body.userId);
  }
  if (!userId) return res.json({ ok: false, error: 'Not logged in' });
  const gameId = req.params.gameId;
  if (!isValidGameId(gameId)) return res.json({ ok: false, error: 'Invalid gameId' });
  const weekStart = req.body.weekStart;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    return res.json({ ok: false, error: 'Missing or invalid weekStart' });
  }
  // Only allow current week (prevent future/past completions)
  const currentWeekStart = wordBank.getWeekStart();
  if (weekStart !== currentWeekStart) {
    return res.json({ ok: false, error: 'weekStart must be current week' });
  }

  // Record in JSON file (same pattern as daily) — use lock to prevent race conditions
  let alreadyCompleted = false;
  await withFileLock(SP_DAILY_FILE, () => {
    const data = loadDailyCompletions();
    const key = gameId + '-weekly';
    if (!data[key]) data[key] = {};
    if (!data[key][userId]) data[key][userId] = [];
    if (data[key][userId].includes(weekStart)) {
      alreadyCompleted = true;
      return;
    }
    data[key][userId].push(weekStart);
    // Keep only last 20 weeks per user
    if (data[key][userId].length > 20) {
      data[key][userId] = data[key][userId].slice(-20);
    }
    saveDailyCompletions(data);
  });
  if (alreadyCompleted) return res.json({ ok: true, alreadyCompleted: true });

  // Forward to Word Tycoon as weekly-win reward
  const gameMap = { 'spellingbee-sp': 'spelling-bee', 'squaredle-sp': 'squaredle', 'searchle-sp': 'searchle' };
  const wtGame = gameMap[gameId] || gameId;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/reward`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({
        platform: 'discord', userId, username: userId,
        coins: 1, game: wtGame, event: 'weekly-win'
      })
    });
    const result = await r.json();
    res.json({ ok: true, reward: result });
  } catch (e) {
    console.error('[SP-Weekly] Failed to forward to Word Tycoon:', e.message);
    res.json({ ok: true, reward: null }); // completion recorded even if WT unreachable
  }
});

// Library word reporting — proxy to Word Tycoon for SP game clients
app.post('/api/library/word', express.json(), async (req, res) => {
  if (!req.session?.discordUser) return res.json({ ok: false, error: 'Not logged in' });
  const userId = req.session.discordUser.id;
  const { word, game } = req.body;
  if (!word || !game || typeof word !== 'string') {
    return res.json({ ok: false, error: 'Missing word or game' });
  }
  if (word.length < 3 || word.length > 30) {
    return res.json({ ok: false, error: 'Invalid word length' });
  }
  // Validate word exists in dictionary
  if (!wordBank.isValidWord(word.toLowerCase())) {
    return res.json({ ok: false, error: 'Not a valid word' });
  }
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/library/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({ platform: 'discord', userId, word: word.toLowerCase(), game })
    });
    const result = await r.json();
    res.json(result);
  } catch (e) {
    console.error('[Library] Failed to report word:', e.message);
    res.json({ ok: false, error: 'Server error' });
  }
});

// ─── Bulk SP Sync (all daily + weekly completions in one call) ──────────
app.get('/api/sp-sync', (req, res) => {
  if (!req.session.discordUser) return res.json({ ok: false, error: 'Not logged in' });
  const userId = req.session.discordUser.id;
  const data = loadDailyCompletions();
  const today = new Date().toISOString().slice(0, 10);

  // Compute week start (Monday UTC)
  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  const weekStart = d.toISOString().slice(0, 10);

  const dailyGames = ['word500-sp', 'wordle-sp', 'betwixt-sp', 'pixeletters-sp', 'figural-sp', 'unwordle-sp', 'rectangled-sp', 'sproutle-sp'];
  const daily = {};
  for (const g of dailyGames) {
    const userDates = (data[g] && data[g][userId]) || [];
    daily[g] = userDates.includes(today);
  }

  const weeklyKeys = ['spellingbee-sp-weekly', 'rectangled-sp-weekly', 'searchle-sp-weekly', 'sproutle-sp-weekly'];
  const weekly = {};
  for (const g of weeklyKeys) {
    const userDates = (data[g] && data[g][userId]) || [];
    weekly[g] = userDates.includes(weekStart);
  }

  res.json({ ok: true, today, weekStart, daily, weekly });
});

// ─── SP Game State Sync (in-progress daily/weekly state) ──────────
function loadGameStates() {
  return loadJsonFile(SP_STATE_FILE_PATH);
}

function saveGameStates(data) {
  saveJsonFile(SP_STATE_FILE_PATH, data);
}

// Max state size: 50KB per game per user (prevent abuse)
const MAX_STATE_SIZE = 50 * 1024;

// Load saved in-progress game state
app.get('/api/sp-state/:gameId', async (req, res) => {
  if (!req.session.discordUser) return res.json({ ok: false });
  const userId = req.session.discordUser.id;
  const gameId = req.params.gameId;
  if (!isValidGameId(gameId)) return res.json({ ok: false, error: 'Invalid gameId' });

  let result = null;
  await withFileLock(SP_STATE_FILE_PATH, () => {
    const data = loadGameStates();
    const entry = data[gameId]?.[userId] || null;
    if (!entry) { result = null; return; }

    // Auto-clean stale daily states
    if (entry.dailyDate) {
      const today = new Date().toISOString().slice(0, 10);
      if (entry.dailyDate !== today) {
        delete data[gameId][userId];
        saveGameStates(data);
        result = null;
        return;
      }
    }
    // Auto-clean stale weekly states
    if (entry.weekStart) {
      const d2 = new Date();
      const day2 = d2.getUTCDay();
      const diff2 = day2 === 0 ? 6 : day2 - 1;
      d2.setUTCDate(d2.getUTCDate() - diff2);
      const ws = d2.toISOString().slice(0, 10);
      if (entry.weekStart !== ws) {
        delete data[gameId][userId];
        saveGameStates(data);
        result = null;
        return;
      }
    }
    result = entry;
  });
  res.json({ ok: true, state: result });
});

// Save in-progress game state
app.post('/api/sp-state/:gameId', express.json(), async (req, res) => {
  if (!req.session.discordUser) return res.json({ ok: false });
  const userId = req.session.discordUser.id;
  const gameId = req.params.gameId;
  if (!isValidGameId(gameId)) return res.json({ ok: false, error: 'Invalid gameId' });
  const state = req.body.state;
  if (!state || typeof state !== 'object') return res.json({ ok: false, error: 'No state' });
  // Size limit check
  const stateStr = JSON.stringify(state);
  if (stateStr.length > MAX_STATE_SIZE) return res.json({ ok: false, error: 'State too large' });

  await withFileLock(SP_STATE_FILE_PATH, () => {
    const data = loadGameStates();
    if (!data[gameId]) data[gameId] = {};
    data[gameId][userId] = state;
    saveGameStates(data);
  });
  res.json({ ok: true });
});

// Clear saved state (game complete)
app.delete('/api/sp-state/:gameId', async (req, res) => {
  if (!req.session.discordUser) return res.json({ ok: false });
  const userId = req.session.discordUser.id;
  const gameId = req.params.gameId;
  if (!isValidGameId(gameId)) return res.json({ ok: false, error: 'Invalid gameId' });

  await withFileLock(SP_STATE_FILE_PATH, () => {
    const data = loadGameStates();
    if (data[gameId]) {
      delete data[gameId][userId];
      saveGameStates(data);
    }
  });
  res.json({ ok: true });
});

app.post('/api/me/unlink', auth.requireUser, express.json(), async (req, res) => {
  const { platform, platformUserId } = req.body;
  if (!platform || !platformUserId) {
    return res.json({ ok: false, error: 'Missing platform or platformUserId' });
  }

  const sessionUser = req.session.discordUser;
  const provider = sessionUser.provider || (sessionUser.id.startsWith('gh_') ? 'github' : 'discord');

  // Determine the Discord anchor ID
  let discordId;
  if (provider === 'discord') {
    discordId = sessionUser.id;
  } else {
    // GitHub user — resolve to linked Discord ID
    try {
      const r = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(sessionUser.id)}`);
      const data = await r.json();
      if (!data.linked || !data.discordUserId) {
        return res.json({ ok: false, error: 'No linked Discord account found' });
      }
      discordId = data.discordUserId;
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'Game server unreachable' });
    }
  }

  // Verify the platform being unlinked actually belongs to this user
  try {
    const statusRes = await wtFetch(`${WORD_EMPIRES_URL}/api/link/status/${encodeURIComponent(discordId)}`);
    const statusData = await statusRes.json();
    const match = (statusData.accounts || []).find(a => a.platform === platform && a.platform_user_id === platformUserId);
    if (!match) {
      return res.json({ ok: false, error: 'Platform not linked to your account' });
    }
  } catch (e) {
    return res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }

  // Perform the unlink
  const result = await removeAccountLink(discordId, platform, platformUserId);
  if (!result.ok) {
    return res.json({ ok: false, error: result.message || 'Unlink failed' });
  }

  // If the user unlinked their own provider, switch session to Discord identity
  if (platform === provider && platformUserId === sessionUser.id) {
    // They unlinked themselves — would need to be Discord user now
    // But if they're a GitHub user unlinking GitHub, they lose their link
    // Just keep their current session
  }

  // Refresh relay linked-groups cache
  try { relay.refreshLinkedCache(); } catch (e) {}

  res.json({ ok: true });
});

app.get('/api/me/profile', auth.requireUser, async (req, res) => {
  const du = req.session.discordUser;
  const provider = du.provider || (du.id.startsWith('gh_') ? 'github' : 'discord');
  let accountId = du.id; // Discord ID or gh_xxx

  // For GitHub-only users, resolve to linked Discord ID if available
  if (provider === 'github') {
    try {
      const resolveRes = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(du.id)}`);
      const resolveData = await resolveRes.json();
      if (resolveData.linked && resolveData.discordUserId) {
        accountId = resolveData.discordUserId; // use linked Discord ID
      } else {
        // GitHub user not linked — show basic profile with link prompt
        return res.json({
          ok: true,
          linked: false,
          provider: 'github',
          profile: {
            displayName: du.globalName || du.username,
            profilePic: du.avatar || null,
            platforms: [{
              platform: 'github',
              platformUserId: du.id,
              username: du.username,
              displayName: du.globalName || du.username,
              profilePic: du.avatar || null
            }]
          }
        });
      }
    } catch (e) {
      return res.status(502).json({ ok: false, error: 'Game server unreachable' });
    }
  }

  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${accountId}`);
    const data = await r.json();
    if (!data.ok) return res.json({ ok: false, linked: false });

    // Helper: detect raw platform IDs (long numeric strings like Discord/TikTok user IDs)
    const isRawId = s => s && /^\d{10,}$/.test(s);

    // Build platforms list from linked accounts
    // Filter out 'mobile' (Discord bot player, not a real linked platform)
    const rawPlatforms = (data.linkedPlatforms || [])
      .filter(p => p.platform !== 'mobile')
      .map(p => ({
        platform: p.platform,
        platformUserId: p.platform_user_id || p.platformUserId,
        username: p.player?.username || p.platform_user_id || p.platformUserId,
        displayName: p.player?.display_name || p.player?.username,
        profilePic: p.player?.profile_pic
      }));

    // Deduplicate: keep the entry with the best display info per platform
    const platformMap = new Map();
    for (const p of rawPlatforms) {
      const existing = platformMap.get(p.platform);
      if (!existing) {
        platformMap.set(p.platform, p);
      } else {
        // Prefer the entry with a non-raw-ID display name, or the one with a profile pic
        const existingHasName = existing.displayName && !isRawId(existing.displayName);
        const newHasName = p.displayName && !isRawId(p.displayName);
        if ((!existingHasName && newHasName) || (!existing.profilePic && p.profilePic)) {
          platformMap.set(p.platform, p);
        }
      }
    }
    const platforms = [...platformMap.values()];

    // Clean up gh_ prefixed IDs — set to null so frontend can show "Linked" fallback
    for (const p of platforms) {
      if (p.displayName && (isRawId(p.displayName) || p.displayName.startsWith('gh_'))) p.displayName = null;
      if (p.username && p.username.startsWith('gh_')) p.username = null;
    }

    // Enrich GitHub platform with OAuth session data when logged in via GitHub
    if (provider === 'github') {
      const ghPlat = platforms.find(p => p.platform === 'github');
      if (ghPlat) {
        if (!ghPlat.displayName) ghPlat.displayName = du.globalName || du.username;
        if (!ghPlat.username) ghPlat.username = du.username;
        if (!ghPlat.profilePic) ghPlat.profilePic = du.avatar || null;
      } else {
        // GitHub not in linkedPlatforms — add from session
        platforms.push({
          platform: 'github',
          platformUserId: du.id,
          username: du.username,
          displayName: du.globalName || du.username,
          profilePic: du.avatar || null
        });
      }
    }

    // Add Discord as a platform (from OAuth session or resolved account)
    const discordAvatar = (provider === 'discord') ? (du.avatar || null) : null;
    let discordUsername, discordDisplayName;
    if (provider === 'discord') {
      discordUsername = du.username;
      discordDisplayName = du.globalName || du.username;
    } else {
      // Not logged in via Discord — primaryPlayer may be from any platform,
      // only use its info if it doesn't look like a raw ID
      const ppUser = data.primaryPlayer?.username;
      const ppName = data.primaryPlayer?.display_name;
      discordUsername = (ppUser && !isRawId(ppUser)) ? ppUser : null;
      discordDisplayName = (ppName && !isRawId(ppName)) ? ppName : discordUsername;
    }
    platforms.push({
      platform: 'discord',
      platformUserId: accountId,
      username: discordUsername || accountId,
      displayName: discordDisplayName || discordUsername || accountId,
      profilePic: discordAvatar
    });

    // Display name & profile pic priority: preference > Discord > TikTok > YouTube > GitHub
    const DISPLAY_PRIORITY = ['discord', 'tiktok', 'youtube', 'github'];

    // Resolve hero display name
    let heroDisplayName = data.preferences?.preferred_display_name || null;
    if (!heroDisplayName) {
      for (const platName of DISPLAY_PRIORITY) {
        const plat = platforms.find(p => p.platform === platName);
        if (plat) {
          const name = plat.displayName || plat.username;
          if (name && !isRawId(name) && !name.startsWith('gh_')) {
            heroDisplayName = name;
            break;
          }
        }
      }
    }
    if (!heroDisplayName) heroDisplayName = data.primaryPlayer?.display_name || data.primaryPlayer?.username;

    const selectedProfileLogo = data.selectedProfileLogo || null;
    const resolvedProfilePic = data.resolvedProfilePic || null;

    // Resolve profile pic with priority
    const pfpPref = data.preferences?.preferred_pfp_platform;
    let profilePic = null;
    if (resolvedProfilePic) {
      profilePic = resolvedProfilePic;
    } else if (pfpPref === 'default') {
      profilePic = '/portal/img/logo.png';
    } else if (pfpPref) {
      const match = platforms.find(p => p.platform === pfpPref && p.profilePic);
      profilePic = match?.profilePic || null;
    }
    if (!profilePic) {
      for (const platName of DISPLAY_PRIORITY) {
        const plat = platforms.find(p => p.platform === platName);
        if (plat?.profilePic) {
          profilePic = plat.profilePic;
          break;
        }
      }
    }

    res.json({
      ok: true,
      linked: true,
      provider,
      profile: {
        displayName: heroDisplayName,
        coins: data.primaryPlayer?.xp || 0,
        giftCoins: data.primaryPlayer?.gift_coins || 0,
        totalTaps: data.primaryPlayer?.total_taps || 0,
        tapPower: data.primaryPlayer?.tap_power || 1,
        critChance: data.primaryPlayer?.crit_chance || 0,
        multiTap: data.primaryPlayer?.multi_tap || 1,
        totalGameWins: data.careerStats?.total_game_wins || data.primaryPlayer?.total_game_wins || 0,
        libraryWords: data.totalLibraryWords || data.primaryPlayer?.library_words || 0,
        profilePic,
        platforms,
        careerStats: {
          totalGameWins: data.careerStats?.total_game_wins || data.primaryPlayer?.total_game_wins || 0,
          longestStreak: data.careerStats?.longest_streak || 0,
          totalDailyClaims: data.careerStats?.total_daily_claims || 0,
          favoriteGame: data.careerStats?.favorite_game || null,
          favoriteGameWins: data.careerStats?.favorite_game_wins || 0,
          totalDailyPuzzles: data.careerStats?.total_daily_puzzles || 0,
          totalWeeklyPuzzles: data.careerStats?.total_weekly_puzzles || 0,
          cosmeticsOwned: data.careerStats?.cosmetics_owned || (data.cosmetics || []).length,
          cosmeticsEquipped: data.careerStats?.cosmetics_equipped || (data.cosmetics || []).filter(c => c.equipped).length
        },
        businessStats: {
          businessesOwned: data.businessStats?.businesses_owned || (data.businesses || []).length,
          totalPrestige: data.businessStats?.total_prestige || 0,
          pizzasServed: data.businessStats?.pizzas_served || 0,
          papersDelivered: data.businessStats?.papers_delivered || 0,
          carsWashed: data.businessStats?.cars_washed || 0,
          tradesMade: data.businessStats?.trades_made || 0,
          membersTrained: data.businessStats?.members_trained || 0,
          viewersServed: data.businessStats?.viewers_served || 0,
          usersServed: data.businessStats?.users_served || 0,
          clientsServed: data.businessStats?.clients_served || 0,
          businessRecords: Array.isArray(data.businessStats?.business_records) ? data.businessStats.business_records : []
        },
        collectorStats: {
          cosmeticsOwned: data.collectorStats?.cosmetics_owned || (data.cosmetics || []).length,
          cosmeticsEquipped: data.collectorStats?.cosmetics_equipped || (data.cosmetics || []).filter(c => c.equipped).length,
          generatedOwned: data.collectorStats?.generated_owned || 0,
          legendaryPlusOwned: data.collectorStats?.legendary_plus_owned || 0,
          heroBadgesOwned: data.collectorStats?.hero_badges_owned || 0,
          winEffectsOwned: data.collectorStats?.win_effects_owned || 0,
          titlesOwned: data.collectorStats?.titles_owned || 0
        },
        economyStats: {
          lifetimeCoinsEarned: data.economyStats?.lifetime_coins_earned || 0,
          lifetimeCoinsSpent: data.economyStats?.lifetime_coins_spent || 0,
          giftCoinsEarned: data.economyStats?.gift_coins_earned || 0,
          giftCoinsSpent: data.economyStats?.gift_coins_spent || 0,
          cosmeticPurchases: data.economyStats?.cosmetic_purchases || 0,
          setPurchases: data.economyStats?.set_purchases || 0
        },
        collectionStats: {
          fixedCatalogOwned: data.collectionStats?.fixed_catalog_owned || 0,
          fixedCatalogTotal: data.collectionStats?.fixed_catalog_total || 0,
          completionPct: data.collectionStats?.completion_pct || 0,
          storeOwned: data.collectionStats?.store_owned || 0,
          storeTotal: data.collectionStats?.store_total || 0,
          passOwned: data.collectionStats?.pass_owned || 0,
          passTotal: data.collectionStats?.pass_total || 0,
          categoriesCompleted: data.collectionStats?.categories_completed || 0,
          totalCategories: data.collectionStats?.total_categories || 0
        },
        puzzleStats: {
          totalDailyPuzzles: data.puzzleStats?.total_daily_puzzles || 0,
          totalWeeklyPuzzles: data.puzzleStats?.total_weekly_puzzles || 0,
          currentDailyCompleted: data.puzzleStats?.current_daily_completed || 0,
          currentWeeklyCompleted: data.puzzleStats?.current_weekly_completed || 0,
          favoriteDailyGame: data.puzzleStats?.favorite_daily_game || null,
          favoriteDailyGameCount: data.puzzleStats?.favorite_daily_game_count || 0,
          favoriteWeeklyGame: data.puzzleStats?.favorite_weekly_game || null,
          favoriteWeeklyGameCount: data.puzzleStats?.favorite_weekly_game_count || 0
        },
        passStats: {
          membershipTier: data.passStats?.membership_tier || 'free',
          membershipStatus: data.passStats?.membership_status || 'inactive',
          seasonId: data.passStats?.season_id || null,
          seasonName: data.passStats?.season_name || null,
          passXp: data.passStats?.pass_xp || 0,
          tierLevel: data.passStats?.tier_level || 1,
          premiumUnlocked: data.passStats?.premium_unlocked || 0,
          freeClaims: data.passStats?.free_claims || 0,
          premiumClaims: data.passStats?.premium_claims || 0,
          monthlyGrantsReceived: data.passStats?.monthly_grants_received || 0
        },
        gameStats: {
          perGameWins: Array.isArray(data.gameStats?.per_game_wins) ? data.gameStats.per_game_wins : [],
          perGameRecords: Array.isArray(data.gameStats?.per_game_records) ? data.gameStats.per_game_records : []
        }
      },
      businesses: data.businesses || [],
      cosmetics: data.cosmetics || [],
      profileLogos: data.profileLogos || [],
      selectedProfileLogo,
      resolvedProfilePic,
      preferences: data.preferences || {},
      incomePerSecond: data.incomePerSecond || { bizIncome: 0, pizzaIncome: 0, newsIncome: 0, gymIncome: 0, cinemaIncome: 0, startupIncome: 0, bankIncome: 0, carwashCleanRate: 0, stockmogulIncome: 0, byBusinessType: {}, total: 0 }
    });
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.post('/api/me/presence/heartbeat', auth.requireUser, async (req, res) => {
  const resolved = await resolveWordTycoonAccountId(req.session.discordUser);
  if (!resolved.ok) {
    return res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
  if (!resolved.linked || !resolved.accountId) {
    return res.status(404).json({ ok: false, error: 'No linked Word Tycoon account found' });
  }

  const requestedSource = req.body && typeof req.body.source === 'string'
    ? req.body.source.trim()
    : '';
  const source = ['web-focus', 'portal-focus', 'web-heartbeat'].includes(requestedSource)
    ? requestedSource
    : 'web-heartbeat';

  try {
    const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${encodeURIComponent(resolved.accountId)}/presence-heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source })
    });
    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (error) {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.put('/api/me/prefs', auth.requireUser, async (req, res) => {
  const du = req.session.discordUser;
  const provider = du.provider || (du.id.startsWith('gh_') ? 'github' : 'discord');
  let discordId = du.id;
  // Whitelist allowed preference fields — prevent primary_player_id manipulation
  // Whitelist: accept snake_case from portal, convert to camelCase for Word Tycoon
  const FIELD_MAP = {
    preferred_pfp_platform: 'preferredPfpPlatform',
    preferred_profile_logo_id: 'preferredProfileLogoId',
    preferred_display_name: 'preferredDisplayName',
    cosmetic_visibility: 'cosmeticVisibility',
    custom_avatar_url: 'customAvatarUrl'
  };
  const wtBody = {};
  for (const [snakeKey, camelKey] of Object.entries(FIELD_MAP)) {
    if (req.body[snakeKey] !== undefined) wtBody[camelKey] = req.body[snakeKey];
  }
  try {
    if (provider === 'github') {
      const rr = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(du.id)}`);
      const rd = await rr.json();
      if (!rd.linked || !rd.discordUserId) {
        return res.status(400).json({ ok: false, message: 'No linked Discord account found' });
      }
      discordId = rd.discordUserId;
    }
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${discordId}/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify(wtBody)
    });
    const data = await r.json();
    if (
      data.ok !== false &&
      (
        wtBody.preferredPfpPlatform !== undefined ||
        wtBody.preferredProfileLogoId !== undefined ||
        wtBody.customAvatarUrl !== undefined
      )
    ) {
      relay.clearCosmeticsCache(discordId);
    }
    return res.status(r.status).json(data);
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.get('/api/me/visibility', auth.requireUser, async (req, res) => {
  try {
    const du = req.session.discordUser;
    let accountId = du.id;
    if (du.provider === 'github' || du.id.startsWith('gh_')) {
      try {
        const rr = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(du.id)}`);
        const rd = await rr.json();
        if (rd.linked && rd.discordUserId) accountId = rd.discordUserId;
      } catch {}
    }
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/cosmetic-visibility/${encodeURIComponent(accountId)}`, {
      headers: { 'x-api-key': WT_API_SECRET }
    });
    const data = await r.json();
    res.json({ ok: true, visibility: data.visibility || {} });
  } catch {
    res.json({ ok: true, visibility: {} });
  }
});

app.get('/api/public/visibility', async (req, res) => {
  try {
    const platform = String(req.query.platform || '').trim().toLowerCase();
    const platformUserId = String(req.query.platformUserId || '').trim();
    if (!platform || !platformUserId) {
      return res.status(400).json({ ok: false, error: 'Missing platform or platformUserId' });
    }

    let discordId = null;
    if (platform === 'discord') {
      discordId = platformUserId;
    } else {
      const rr = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=${encodeURIComponent(platform)}&platformUserId=${encodeURIComponent(platformUserId)}`);
      const rd = await rr.json();
      if (rd.linked && rd.discordUserId) discordId = rd.discordUserId;
    }

    if (!discordId) {
      return res.json({ ok: true, visibility: { word_color: false, word_glow: false } });
    }

    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/cosmetic-visibility/${encodeURIComponent(discordId)}`, {
      headers: { 'x-api-key': WT_API_SECRET }
    });
    const data = await r.json();
    res.json({ ok: true, visibility: data.visibility || {} });
  } catch {
    res.json({ ok: true, visibility: { word_color: false, word_glow: false } });
  }
});

app.post('/api/me/profile/tap-upgrade', auth.requireUser, async (req, res) => {
  const du = req.session.discordUser;
  const provider = du.provider || (du.id.startsWith('gh_') ? 'github' : 'discord');
  let discordId = du.id;
  const { upgradeType } = req.body || {};
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    if (provider === 'github') {
      const rr = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(du.id)}`);
      const rd = await rr.json();
      if (!rd.linked || !rd.discordUserId) {
        return res.status(400).json({ ok: false, message: 'No linked Discord account found' });
      }
      discordId = rd.discordUserId;
    }
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/tap-upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({ discordUserId: discordId, upgradeType })
    });
    res.json(await r.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

function parseSqlTimestamp(value) {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  if (/z$/i.test(raw) || /[+-]\d\d:\d\d$/.test(raw)) {
    const dated = new Date(raw);
    return Number.isNaN(dated.getTime()) ? null : dated;
  }
  const dated = new Date(raw.replace(' ', 'T') + 'Z');
  return Number.isNaN(dated.getTime()) ? null : dated;
}

function toEdmontonDateKey(value) {
  const dated = value instanceof Date ? value : parseSqlTimestamp(value);
  if (!dated) return null;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Edmonton',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(dated);
}

function humanizeToken(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function membershipTierLabel(tier) {
  const normalized = String(tier || '').toLowerCase();
  if (normalized === 'pookie_pass') return 'Pookie Pass';
  if (normalized === 'donor_class') return 'Donor Class';
  return 'Free Tier';
}

function businessLabel(key) {
  const map = {
    pizza: 'Pizza Shop',
    newspaper: 'Newspaper Route',
    carwash: 'Car Wash',
    stockmogul: 'Stock Mogul',
    gym: 'Gym',
    cinema: 'Movie Theater',
    startup: 'Tech Startup',
    bank: 'Bank'
  };
  return map[String(key || '').toLowerCase()] || humanizeToken(key || 'Business');
}

function describePassReward(reward) {
  if (!reward || typeof reward !== 'object') return null;
  if (reward.type === 'gift_coins') {
    return `${Number(reward.amount) || 0} gift coins`;
  }
  if (reward.type === 'cosmetic') {
    return humanizeToken(reward.id || 'Cosmetic');
  }
  return humanizeToken(reward.type || 'Reward');
}

function normalizeEconomyLedgerEntry(entry) {
  const eventType = String(entry?.event_type || '').toLowerCase();
  const detail = entry?.detail && typeof entry.detail === 'object' ? entry.detail : {};
  const response = String(entry?.response || '').trim();
  const coinsDelta = Number(entry?.coins_delta) || 0;
  const giftCoinsDelta = Number(entry?.gift_coins_delta) || 0;
  const createdAt = entry?.created_at || null;

  if (!['biz-collect', 'reward', 'daily-claim', 'gift', 'cosmetic', 'deduct'].includes(eventType)) {
    return null;
  }

  if (eventType === 'biz-collect') {
    const business = businessLabel(detail.business);
    return {
      id: `ledger-${entry.id}`,
      source: 'ledger',
      category: 'business',
      badge: 'Business',
      title: business,
      subtitle: response || `Collected from ${business}`,
      coinsDelta,
      giftCoinsDelta,
      created_at: createdAt
    };
  }

  if (eventType === 'cosmetic') {
    const isSet = typeof entry.command === 'string' && entry.command.toLowerCase().includes('!buyset');
    return {
      id: `ledger-${entry.id}`,
      source: 'ledger',
      category: 'store',
      badge: 'Store',
      title: isSet ? (detail.setName || 'Cosmetic Set') : (detail.cosmeticName || 'Cosmetic Purchase'),
      subtitle: response || (isSet ? 'Set unlocked from the store' : 'Cosmetic purchased from the store'),
      coinsDelta,
      giftCoinsDelta,
      created_at: createdAt
    };
  }

  if (eventType === 'daily-claim') {
    return {
      id: `ledger-${entry.id}`,
      source: 'ledger',
      category: 'rewards',
      badge: 'Reward',
      title: 'Daily Claim',
      subtitle: response || `Streak Day ${detail.streakDay || 0}`,
      coinsDelta,
      giftCoinsDelta,
      created_at: createdAt
    };
  }

  if (eventType === 'gift') {
    return {
      id: `ledger-${entry.id}`,
      source: 'ledger',
      category: 'rewards',
      badge: 'Reward',
      title: 'Gift Reward',
      subtitle: response || `${detail.tiktokCoins || 0} TikTok coins converted`,
      coinsDelta,
      giftCoinsDelta,
      created_at: createdAt
    };
  }

  if (eventType === 'deduct') {
    return {
      id: `ledger-${entry.id}`,
      source: 'ledger',
      category: 'rewards',
      badge: 'Adjustment',
      title: 'Balance Adjustment',
      subtitle: response || humanizeToken(detail.event || 'deduct'),
      coinsDelta,
      giftCoinsDelta,
      created_at: createdAt
    };
  }

  const game = detail.game ? humanizeToken(detail.game) : 'Game';
  return {
    id: `ledger-${entry.id}`,
    source: 'ledger',
    category: 'rewards',
    badge: 'Reward',
    title: `${game} Reward`,
    subtitle: response || (detail.isDailyWin ? 'Daily win bonus paid out' : 'Game completion reward'),
    coinsDelta,
    giftCoinsDelta,
    created_at: createdAt
  };
}

function normalizeMembershipGrantEntry(grant) {
  const amount = Number(grant?.gift_coins_awarded) || 0;
  return {
    id: `membership-${grant.discord_user_id}-${grant.membership_tier}-${grant.period_key}`,
    source: 'membership',
    category: 'membership',
    badge: 'Membership',
    title: `${membershipTierLabel(grant.membership_tier)} Gift Coin Grant`,
    subtitle: `${grant.period_key} payout`,
    coinsDelta: 0,
    giftCoinsDelta: amount,
    created_at: grant.granted_at || null
  };
}

function normalizePassClaimEntry(claim, passState) {
  const lane = String(claim?.lane || 'free').toLowerCase() === 'premium' ? 'premium' : 'free';
  const tierNumber = Number(claim?.tier_number) || 1;
  const laneRewards = Array.isArray(passState?.rewards?.[lane]) ? passState.rewards[lane] : [];
  const bundle = laneRewards.find((entry) => Number(entry.tier) === tierNumber);
  const rewards = Array.isArray(bundle?.rewards) ? bundle.rewards : [];
  const summary = rewards.map(describePassReward).filter(Boolean);
  const giftCoinsDelta = rewards
    .filter((reward) => reward.type === 'gift_coins')
    .reduce((sum, reward) => sum + (Number(reward.amount) || 0), 0);

  return {
    id: `pass-${claim.discord_user_id}-${claim.season_id}-${lane}-${tierNumber}`,
    source: 'pass',
    category: 'pass',
    badge: 'Season Pass',
    title: `${lane === 'premium' ? 'Premium' : 'Free'} Tier ${tierNumber} Claimed`,
    subtitle: summary.length ? summary.join(' • ') : 'Season Pass reward claimed',
    coinsDelta: 0,
    giftCoinsDelta,
    created_at: claim.claimed_at || null
  };
}

function buildEconomyHistorySummary(entries) {
  const todayKey = toEdmontonDateKey(new Date());
  const recent = [...entries].sort((a, b) => {
    const aTime = parseSqlTimestamp(a.created_at)?.getTime() || 0;
    const bTime = parseSqlTimestamp(b.created_at)?.getTime() || 0;
    return bTime - aTime;
  });
  const todaysEntries = recent.filter((entry) => toEdmontonDateKey(entry.created_at) === todayKey);
  const earnedToday = todaysEntries.reduce((sum, entry) => sum + Math.max(0, Number(entry.coinsDelta) || 0), 0);
  const spentToday = todaysEntries.reduce((sum, entry) => sum + Math.abs(Math.min(0, Number(entry.coinsDelta) || 0)), 0);
  const lastBusinessCollect = recent.find((entry) => entry.category === 'business') || null;
  const lastMonthlyGrant = recent.find((entry) => entry.category === 'membership') || null;

  return {
    earnedToday,
    spentToday,
    lastBusinessCollect,
    lastMonthlyGrant
  };
}

app.get('/api/me/history', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 50);
  const type = String(req.query.type || '').trim().toLowerCase();
  const fetchWindow = Math.min(Math.max((page * limit) + 50, 120), 500);

  try {
    const [acctRes, membershipRes, passRes] = await Promise.all([
      wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${discordId}`),
      wtFetch(`${WORD_EMPIRES_URL}/api/admin/membership/${discordId}`),
      wtFetch(`${WORD_EMPIRES_URL}/api/admin/pass/${discordId}`)
    ]);

    const [acctData, membershipData, passData] = await Promise.all([
      acctRes.json(),
      membershipRes.json(),
      passRes.json()
    ]);

    if (!acctData.ok || !acctData.primaryPlayer) {
      return res.json({ ok: true, entries: [], summary: buildEconomyHistorySummary([]), page, limit, total: 0, totalPages: 1 });
    }

    const playerIds = Array.isArray(acctData.linkedPlayerIds) && acctData.linkedPlayerIds.length
      ? acctData.linkedPlayerIds
      : [acctData.primaryPlayer.id];

    const ledgerResponses = await Promise.all(
      playerIds.map((playerId) =>
        wtFetch(`${WORD_EMPIRES_URL}/api/admin/ledger/player/${playerId}?page=1&limit=${fetchWindow}`)
          .then((r) => r.json())
          .catch(() => ({ ok: false, entries: [] }))
      )
    );

    const ledgerEntries = ledgerResponses
      .flatMap((payload) => Array.isArray(payload?.entries) ? payload.entries : [])
      .map(normalizeEconomyLedgerEntry)
      .filter(Boolean);

    const membershipEntries = Array.isArray(membershipData?.grantHistory)
      ? membershipData.grantHistory.map(normalizeMembershipGrantEntry)
      : [];

    const passEntries = Array.isArray(passData?.claims)
      ? passData.claims.map((claim) => normalizePassClaimEntry(claim, passData))
      : [];

    const mergedEntries = [...ledgerEntries, ...membershipEntries, ...passEntries].sort((a, b) => {
      const aTime = parseSqlTimestamp(a.created_at)?.getTime() || 0;
      const bTime = parseSqlTimestamp(b.created_at)?.getTime() || 0;
      return bTime - aTime;
    });

    const filteredEntries = type ? mergedEntries.filter((entry) => entry.category === type) : mergedEntries;
    const total = filteredEntries.length;
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const start = (page - 1) * limit;
    const pagedEntries = filteredEntries.slice(start, start + limit);

    res.json({
      ok: true,
      page,
      limit,
      total,
      totalPages,
      summary: buildEconomyHistorySummary(type ? filteredEntries : mergedEntries),
      entries: pagedEntries
    });
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

// Helper: fetch game stats from centralized Word Tycoon API
async function fetchCentralizedGameStats(discordId, game) {
  const statsRes = await wtFetch(`${WORD_EMPIRES_URL}/api/player-game-stats/${discordId}?game=${game}`);
  return await statsRes.json();
}

app.get('/api/me/searchle', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'searchle');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      averageGuesses: stats.averageGuesses || 0,
      history: (stats.history || []).map(h => ({
        word: h.word,
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch {
    res.json({ ok: false, totalWins: 0, history: [] });
  }
});

app.get('/api/me/searchle-sp', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const histRes = await fetch(`${SEARCHLE_URL}/api/sp/history?userId=${encodeURIComponent(discordId)}`);
    const userWins = await histRes.json();
    res.json({
      ok: true,
      totalWins: userWins.length,
      averageGuesses: userWins.length > 0
        ? Math.round(userWins.reduce((s, w) => s + (w.guessCount || 0), 0) / userWins.length)
        : 0,
      history: userWins.slice(0, 50)
    });
  } catch {
    res.json({ ok: false, totalWins: 0, history: [] });
  }
});

app.get('/api/searchle/sp-pool-index', async (_req, res) => {
  try {
    const r = await fetch(`${SEARCHLE_URL}/api/sp/pool-index`);
    res.json(await r.json());
  } catch { res.json({ words: {}, nextNumber: 1 }); }
});

app.get('/api/me/word500', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'word500');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      averageGuesses: stats.averageGuesses || 0,
      history: (stats.history || []).map(h => ({
        word: h.word,
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch {
    res.json({ ok: false, totalWins: 0, history: [] });
  }
});

app.get('/api/me/betwixt', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'betwixt');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      gamesPlayed: stats.totalWins || 0,
      averageGuesses: stats.averageGuesses || 0,
      winStreak: 0,
      history: (stats.history || []).map(h => ({
        word: h.word,
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch {
    res.json({ ok: false, totalWins: 0, gamesPlayed: 0, history: [] });
  }
});

app.get('/api/me/wordle', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'wordle');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      gamesPlayed: stats.totalWins || 0,
      averageGuesses: stats.averageGuesses || 0,
      winStreak: 0,
      history: (stats.history || []).map(h => ({
        word: h.word,
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch {
    res.json({ ok: false, totalWins: 0, gamesPlayed: 0, history: [] });
  }
});

app.get('/api/me/pixeletters', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'pixeletters');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      gamesPlayed: stats.totalWins || 0,
      averageGuesses: stats.averageGuesses || 0,
      winStreak: 0,
      history: (stats.history || []).map(h => ({
        word: h.word,
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch {
    res.json({ ok: false, totalWins: 0, gamesPlayed: 0, history: [] });
  }
});

app.get('/api/me/squaredle', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'squaredle');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      totalWordsFound: 0, // per-word tracking not in game_wins
      gamesParticipated: stats.totalWins || 0,
      history: (stats.history || []).map(h => ({
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch (err) {
    console.error('[Squaredle stats error]', err.message);
    res.json({ ok: false, totalWins: 0, totalWordsFound: 0, gamesParticipated: 0, history: [] });
  }
});

app.get('/api/me/spellingbee', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'spelling-bee');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      totalWordsFound: 0, // per-word tracking not in game_wins
      totalScore: 0,
      totalPangrams: 0,
      gamesParticipated: stats.totalWins || 0,
      history: (stats.history || []).map(h => ({
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch (err) {
    console.error('[SpellingBee stats error]', err.message);
    res.json({ ok: false, totalWins: 0, totalWordsFound: 0, gamesParticipated: 0, totalPangrams: 0, totalScore: 0, history: [] });
  }
});

app.get('/api/me/shop', auth.requireUser, async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/cosmetics/shop`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Game server unreachable' }); }
});

app.get('/api/me/membership', auth.requireUser, async (req, res) => {
  const resolved = await resolveWordTycoonAccountId(req.session.discordUser);
  if (!resolved.ok) return res.status(502).json({ ok: false, error: 'Game server unreachable' });
  if (!resolved.linked || !resolved.accountId) {
      return res.json({ ok: false, linked: false, error: 'Link your account to view your Season Pass.' });
  }

  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/membership/${resolved.accountId}`);
    res.json(await r.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.get('/api/me/pass', auth.requireUser, async (req, res) => {
  const resolved = await resolveWordTycoonAccountId(req.session.discordUser);
  if (!resolved.ok) return res.status(502).json({ ok: false, error: 'Game server unreachable' });
  if (!resolved.linked || !resolved.accountId) {
      return res.json({ ok: false, linked: false, error: 'Link your account to view your Season Pass.' });
  }

  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pass/${resolved.accountId}`);
    res.json(await r.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

  app.post('/api/me/pass/claim', auth.requireUser, express.json(), async (req, res) => {
  const resolved = await resolveWordTycoonAccountId(req.session.discordUser);
  if (!resolved.ok) return res.status(502).json({ ok: false, error: 'Game server unreachable' });
  if (!resolved.linked || !resolved.accountId) {
    return res.json({ ok: false, linked: false, error: 'Link your account to claim pass rewards.' });
  }

  const { lane, tierNumber } = req.body || {};
  if (!lane || !tierNumber) {
    return res.status(400).json({ ok: false, error: 'Missing lane or tierNumber' });
  }

  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pass/${resolved.accountId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ lane, tierNumber })
    });
    res.json(await r.json());
    } catch {
      res.status(502).json({ ok: false, error: 'Game server unreachable' });
    }
  });

  app.post('/api/me/pass/checkout', auth.requireUser, express.json(), async (req, res) => {
    const resolved = await resolveWordTycoonAccountId(req.session.discordUser);
    if (!resolved.ok) return res.status(502).json({ ok: false, error: 'Game server unreachable' });
    if (!resolved.linked || !resolved.accountId) {
      return res.json({ ok: false, linked: false, error: 'Link your account to upgrade your Season Pass.' });
    }

    const { tier } = req.body || {};
    if (!tier) {
      return res.status(400).json({ ok: false, error: 'Missing tier' });
    }

    const sessionUser = req.session.discordUser || {};
    const customerName = sessionUser.globalName || sessionUser.displayName || sessionUser.username || '';
    const customerEmail = sessionUser.email || '';

    try {
      const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/membership/${resolved.accountId}/checkout`, {
        method: 'POST',
        body: JSON.stringify({ tier, customerName, customerEmail })
      });
      res.status(r.status).json(await r.json());
    } catch {
      res.status(502).json({ ok: false, error: 'Game server unreachable' });
    }
  });

  app.get('/api/me/pass/manage', auth.requireUser, async (req, res) => {
    const resolved = await resolveWordTycoonAccountId(req.session.discordUser);
    if (!resolved.ok) return res.status(502).json({ ok: false, error: 'Game server unreachable' });
    if (!resolved.linked || !resolved.accountId) {
      return res.json({ ok: false, linked: false, error: 'Link your account to manage your Season Pass.' });
    }

    try {
      const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/membership/${resolved.accountId}/manage`);
      res.status(r.status).json(await r.json());
    } catch {
      res.status(502).json({ ok: false, error: 'Game server unreachable' });
    }
  });

  app.get('/api/me/sets', auth.requireUser, async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/cosmetics/sets`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Game server unreachable' }); }
});

app.post('/api/me/cosmetics/equip', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { cosmeticId } = req.body;
  if (!cosmeticId) return res.status(400).json({ ok: false, message: 'Missing cosmeticId' });
  try {
    // Use discord identity � game-engine equips across all linked players
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/cosmetics/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'discord', userId: discordId, cosmeticId })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/cosmetics/unequip', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { category } = req.body;
  if (!category) return res.status(400).json({ ok: false, message: 'Missing category' });
  try {
    // Use discord identity � game-engine unequips across all linked players
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/cosmetics/unequip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: 'discord', userId: discordId, category })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Buy/upgrade a business (proxy to Mobile Tycoon)
app.post('/api/me/business/buy', auth.requireUser, async (req, res) => {
  const du = req.session.discordUser;
  const provider = du.provider || (du.id.startsWith('gh_') ? 'github' : 'discord');
  let discordId = du.id;
  const { businessType } = req.body;
  if (!businessType) return res.status(400).json({ ok: false, message: 'Missing businessType' });
  try {
    if (provider === 'github') {
      const rr = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(du.id)}`);
      const rd = await rr.json();
      if (!rd.linked || !rd.discordUserId) {
        return res.status(400).json({ ok: false, message: 'No linked Discord account found' });
      }
      discordId = rd.discordUserId;
    }
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/business/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({ discordUserId: discordId, businessType })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// ==================== PIZZA SHOP PROXY ENDPOINTS ====================

// Get pizza shop state
app.get('/api/me/pizza', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pizza/${discordId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Initialize pizza shop
app.post('/api/me/pizza/init', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pizza/${discordId}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Upgrade pizza shop component
app.post('/api/me/pizza/upgrade', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pizza/${discordId}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Max-buy pizza shop upgrade (buy as many levels as affordable)
app.post('/api/me/pizza/upgrade-max', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pizza/${discordId}/upgrade-max`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Collect pizza shop income
app.post('/api/me/pizza/collect', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pizza/${discordId}/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Prestige pizza shop
app.post('/api/me/pizza/prestige', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pizza/${discordId}/prestige`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Set pizza shop customization
app.post('/api/me/pizza/customize', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { category, value } = req.body;
  if (!category || !value) return res.status(400).json({ ok: false, message: 'Missing category or value' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pizza/${discordId}/customize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, value })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Rename pizza shop
app.post('/api/me/pizza/rename', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ ok: false, message: 'Missing name' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pizza/${discordId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// ==================== NEWSPAPER ROUTE PROXY ENDPOINTS ====================

// Get newspaper route state
app.get('/api/me/newspaper', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/newspaper/${discordId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Initialize newspaper route
app.post('/api/me/newspaper/init', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/newspaper/${discordId}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Upgrade newspaper route component
app.post('/api/me/newspaper/upgrade', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/newspaper/${discordId}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Max-buy newspaper upgrade
app.post('/api/me/newspaper/upgrade-max', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/newspaper/${discordId}/upgrade-max`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Collect newspaper income
app.post('/api/me/newspaper/collect', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/newspaper/${discordId}/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Prestige newspaper route
app.post('/api/me/newspaper/prestige', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/newspaper/${discordId}/prestige`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Set newspaper customization
app.post('/api/me/newspaper/customize', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { category, value } = req.body;
  if (!category || !value) return res.status(400).json({ ok: false, message: 'Missing category or value' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/newspaper/${discordId}/customize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, value })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Rename newspaper route
app.post('/api/me/newspaper/rename', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ ok: false, message: 'Missing name' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/newspaper/${discordId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// ==================== GYM PROXY ENDPOINTS ====================

app.get('/api/me/gym', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/gym/${discordId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/gym/init', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/gym/${discordId}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/gym/upgrade', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/gym/${discordId}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/gym/upgrade-max', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/gym/${discordId}/upgrade-max`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/gym/collect', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/gym/${discordId}/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/gym/prestige', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/gym/${discordId}/prestige`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/gym/customize', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { category, value } = req.body;
  if (!category || !value) return res.status(400).json({ ok: false, message: 'Missing category or value' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/gym/${discordId}/customize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, value })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/gym/rename', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ ok: false, message: 'Missing name' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/gym/${discordId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// ==================== CINEMA PROXY ENDPOINTS ====================

app.get('/api/me/cinema', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cinema/${discordId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/cinema/init', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cinema/${discordId}/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/cinema/upgrade', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cinema/${discordId}/upgrade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/cinema/upgrade-max', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cinema/${discordId}/upgrade-max`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/cinema/collect', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cinema/${discordId}/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/cinema/prestige', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cinema/${discordId}/prestige`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/cinema/customize', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { category, value } = req.body;
  if (!category || !value) return res.status(400).json({ ok: false, message: 'Missing category or value' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cinema/${discordId}/customize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category, value })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/cinema/rename', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const { name } = req.body;
  if (!name) return res.status(400).json({ ok: false, message: 'Missing name' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cinema/${discordId}/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Get library data (proxy to Word Tycoon)
app.get('/api/me/library', auth.requireUser, async (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const query = new URLSearchParams(req.query).toString();
    const url = `${WORD_EMPIRES_URL}/api/admin/accounts/${discordId}/library${query ? '?' + query : ''}`;
    const r = await wtFetch(url);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Buy a cosmetic (proxy to Mobile Tycoon)
app.post('/api/me/cosmetics/buy', auth.requireUser, async (req, res) => {
  const du = req.session.discordUser;
  const { cosmeticId } = req.body;
  if (!cosmeticId) return res.status(400).json({ ok: false, message: 'Missing cosmeticId' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cosmetics/buy-for-discord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordUserId: du.id, cosmeticId })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Buy a gift set (proxy to Mobile Tycoon)
app.post('/api/me/cosmetics/buyset', auth.requireUser, async (req, res) => {
  const du = req.session.discordUser;
  const { setKey } = req.body;
  if (!setKey) return res.status(400).json({ ok: false, message: 'Missing setKey' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cosmetics/buyset-for-discord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordUserId: du.id, setKey })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Serve Word Bank Admin at /word-bank
app.use('/word-bank', express.static(path.join(__dirname, 'public', 'word-bank')));

// Serve portal at /me
app.get('/me', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal', 'index.html'));
});
app.use('/portal', express.static(path.join(__dirname, 'public', 'portal')));

// GOAT Hall of Fame
app.get('/goat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'goat', 'index.html'));
});
app.get('/api/goat', async (req, res) => {
  try {
    const allowed = ['page', 'limit', 'sort', 'direction', 'q', 'region', 'compact'];
    const query = new URLSearchParams();
    for (const key of allowed) {
      if (req.query[key] == null) continue;
      query.set(key, String(req.query[key]));
    }
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/goat?${query.toString()}`);
    if (!r.ok) throw new Error(`Word Tycoon returned ${r.status}`);
    if (String(req.query.compact || '') === '1') {
      res.set('Cache-Control', 'public, max-age=15, stale-while-revalidate=30');
    } else {
      res.set('Cache-Control', 'no-store');
    }
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Admin pages
app.get('/admin/jackpots', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'jackpots.html'));
});

// Admin dashboard (moved from / — protected by auth middleware above)
app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Public landing page (only on wordtycoon.live — direct IP access gets admin dashboard)
app.get('/', (req, res) => {
  const host = (req.hostname || '').toLowerCase();
  if (host === 'wordtycoon.live' || host === 'www.wordtycoon.live') {
    return res.sendFile(path.join(__dirname, 'public', 'landing.html'));
  }
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve static files (dashboard HTML protected by auth middleware above)
app.use(express.static(path.join(__dirname, 'public')));

// API endpoints
app.get('/api/commands', (req, res) => {
  res.json(commands.getCommandList());
});

app.get('/api/tts/users', (req, res) => {
  res.json(db.getTTSUsers());
});

app.get('/api/tts/settings', (req, res) => {
  res.json(db.getAllTTSSettings());
});

app.post('/api/tts/settings', (req, res) => {
  const { key, value } = req.body;
  if (key && value !== undefined) {
    db.setTTSSetting(key, String(value));
    relay.broadcastTTSUpdate();
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Missing key or value' });
  }
});

app.post('/api/tts/toggle', (req, res) => {
  const { platform, platformUserId, enabled } = req.body;
  if (platform && platformUserId) {
    db.enableTTS(platform, platformUserId, !!enabled);
    relay.broadcastTTSUpdate();
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Missing platform or platformUserId' });
  }
});

app.post('/api/tts/ban', (req, res) => {
  const { platform, platformUserId, banned } = req.body;
  if (platform && platformUserId) {
    db.banTTS(platform, platformUserId, !!banned);
    relay.broadcastTTSUpdate();
    res.json({ ok: true });
  } else {
    res.status(400).json({ error: 'Missing platform or platformUserId' });
  }
});

app.get('/api/users', (req, res) => {
  res.json(db.getAllUsers());
});

app.get('/api/status', (req, res) => {
  res.json({
    tiktok: tiktok.isConnected(),
    youtube: youtube.isConnected(),
    discord: discord.isConnected()
  });
});

app.post('/api/reconnect/:platform', (req, res) => {
  const platform = req.params.platform;
  switch (platform) {
    case 'tiktok':
      tiktok.reconnect(req.body.url);
      res.json({ ok: true });
      break;
    case 'youtube':
      youtube.reconnect(req.body.url);
      res.json({ ok: true });
      break;
    default:
      res.status(400).json({ error: 'Unknown platform' });
  }
});

// App Manager API
app.get('/api/apps', (req, res) => {
  res.json(apps.getAll());
});

// Static routes before parameterized routes
app.post('/api/apps/start-all', (req, res) => {
  res.json(apps.startAll());
});

app.post('/api/apps/stop-all', (req, res) => {
  res.json(apps.stopAll());
});

app.post('/api/apps/reload', (req, res) => {
  apps.reload();
  res.json({ ok: true, apps: apps.getAll() });
});

app.post('/api/apps/:id/start', (req, res) => {
  res.json(apps.startApp(req.params.id));
});

app.post('/api/apps/:id/stop', (req, res) => {
  res.json(apps.stopApp(req.params.id));
});

app.post('/api/apps/:id/restart', (req, res) => {
  res.json(apps.restartApp(req.params.id));
});

app.get('/api/apps/:id/logs', (req, res) => {
  const count = parseInt(req.query.count) || 50;
  res.json(apps.getLogs(req.params.id, count));
});

// ─── Overlay Settings (per-type, persisted to disk, broadcast to OBS overlays) ──
const DEFAULT_OVERLAY = { fontSize: 14, bgOpacity: 65, fadeDuration: 0, maxMessages: 30, showBadge: true, showUsername: true, animate: true };
const OVERLAY_SETTINGS_PATH = path.join(__dirname, 'data', 'overlay-settings.json');

let overlaySettings = {
  standard: { ...DEFAULT_OVERLAY },
  fade: { ...DEFAULT_OVERLAY, fadeDuration: 50 },
  all: { ...DEFAULT_OVERLAY }
};

// Load persisted overlay settings
try {
  if (fs.existsSync(OVERLAY_SETTINGS_PATH)) {
    const saved = JSON.parse(fs.readFileSync(OVERLAY_SETTINGS_PATH, 'utf-8'));
    for (const type of Object.keys(overlaySettings)) {
      if (saved[type]) Object.assign(overlaySettings[type], saved[type]);
    }
    console.log('[Overlay] Loaded saved settings');
  }
} catch (err) {
  console.error('[Overlay] Failed to load saved settings:', err.message);
}

app.get('/api/overlay/settings', (req, res) => {
  const type = req.query.type;
  if (type && overlaySettings[type]) {
    res.json(overlaySettings[type]);
  } else {
    res.json(overlaySettings);
  }
});

app.post('/api/overlay/settings', (req, res) => {
  const s = req.body;
  const type = s.type || 'standard';
  if (!overlaySettings[type]) return res.status(400).json({ error: 'Invalid overlay type' });

  const target = overlaySettings[type];
  if (s.fontSize !== undefined) target.fontSize = Math.min(32, Math.max(10, Number(s.fontSize)));
  if (s.bgOpacity !== undefined) target.bgOpacity = Math.min(100, Math.max(0, Number(s.bgOpacity)));
  if (s.fadeDuration !== undefined) target.fadeDuration = Math.min(300, Math.max(0, Number(s.fadeDuration)));
  if (s.maxMessages !== undefined) target.maxMessages = Math.min(100, Math.max(1, Number(s.maxMessages)));
  if (s.showBadge !== undefined) target.showBadge = !!s.showBadge;
  if (s.showUsername !== undefined) target.showUsername = !!s.showUsername;
  if (s.animate !== undefined) target.animate = !!s.animate;
  io.emit('overlay-settings', { type, ...target });
  // Persist to disk
  try { fs.writeFileSync(OVERLAY_SETTINGS_PATH, JSON.stringify(overlaySettings, null, 2)); } catch {}
  res.json({ ok: true, settings: target });
});

// ─── Spotify Integration ─────────────────────────────────────────────
app.get('/spotify/login', (req, res) => {
  if (!req.session?.isAdmin) return res.redirect('/admin/login');
  spotify.handleLogin(req, res);
});
app.get('/spotify/callback', (req, res) => spotify.handleCallback(req, res));
app.get('/api/spotify/status', (req, res) => spotify.handleStatus(req, res));
app.post('/api/spotify/disconnect', (req, res) => spotify.handleDisconnect(req, res));

// ─── Bridge status ──────────────────────────────────────────────────
app.get('/api/bridge/status', (req, res) => {
  res.json(require('./src/relay-bridge').getStats());
});

// ─── Daily claim / progress proxy to Word Tycoon ────────────────────
app.get('/api/daily-claim/status', async (req, res) => {
  try {
    const query = new URLSearchParams();
    if (req.query.discordId) query.set('discordId', String(req.query.discordId));
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/daily-claim/status${query.toString() ? `?${query}` : ''}`, {
      headers: {
        'x-discord-id': req.headers['x-discord-id'] || '',
      }
    });
    res.status(r.status).json(await r.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.get('/api/daily-progress/:platform/:userId', async (req, res) => {
  const { platform, userId } = req.params;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/daily-progress/${encodeURIComponent(platform)}/${encodeURIComponent(userId)}`);
    res.status(r.status).json(await r.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.get('/api/player-game-stats/:discordId', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/player-game-stats/${encodeURIComponent(req.params.discordId)}`);
    res.status(r.status).json(await r.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

// ─── Daily Sequence API ───────────────────────────────────────────────────────
app.get('/api/daily-sequence', (req, res) => {
  if (!req.session?.isAdmin) return res.status(403).json({ error: 'Unauthorized' });
  res.json({ ...sequenceState, sequence: DAILY_SEQUENCE });
});

app.post('/api/daily-sequence/start', (req, res) => {
  if (!req.session?.isAdmin) return res.status(403).json({ error: 'Unauthorized' });
  startDailySequence();
  res.json({ ok: true, state: { ...sequenceState, sequence: DAILY_SEQUENCE } });
});

// ─── Live Games API ─────────────────────────────────────────────────
app.get('/api/games/live', (req, res) => {
  res.json(cachedLiveState);
});

// ─── Cosmetics broadcast (fan out to all game servers) ───────────────
app.post('/api/cosmetics-broadcast', (req, res) => {
  // Only Word Tycoon should call this — require API key
  const key = req.headers['x-api-key'] || req.headers['x-relay-auth'];
  if (key !== WT_API_SECRET) return res.status(403).json({ error: 'Unauthorized' });
  const { platform, platformUserId, equipped } = req.body;
  if (!platform || !platformUserId) return res.status(400).json({ ok: false });
  res.json({ ok: true });
  // Broadcast to all connected socket clients (game servers + WiPGaMe)
  io.emit('cosmetics-updated', { platform, platformUserId, equipped });
});

// ─── Jackpot Admin API (proxy to game servers, admin-only) ───────────
// Port map includes all games with jackpot support (LIVE_GAMES + UnWordle)
const JACKPOT_GAME_PORTS = {};
LIVE_GAMES.forEach(g => { JACKPOT_GAME_PORTS[g.id] = g.port; });
JACKPOT_GAME_PORTS['unwordle'] = 3021;
JACKPOT_GAME_PORTS['squaredle'] = 3016;

app.get('/api/jackpot-admin/:gameId/settings', async (req, res) => {
  const port = JACKPOT_GAME_PORTS[req.params.gameId];
  if (!port) return res.status(404).json({ error: 'Game not found' });
  try {
    const r = await fetch(`http://localhost:${port}/api/jackpot/settings`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Game server unreachable' }); }
});

app.post('/api/jackpot-admin/:gameId/settings', async (req, res) => {
  const port = JACKPOT_GAME_PORTS[req.params.gameId];
  if (!port) return res.status(404).json({ error: 'Game not found' });
  try {
    const r = await fetch(`http://localhost:${port}/api/jackpot/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Game server unreachable' }); }
});

app.post('/api/jackpot-admin/:gameId/reset', async (req, res) => {
  const port = JACKPOT_GAME_PORTS[req.params.gameId];
  if (!port) return res.status(404).json({ error: 'Game not found' });
  try {
    const r = await fetch(`http://localhost:${port}/api/jackpot/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Game server unreachable' }); }
});

// ─── Cosmetics Admin API (proxy to Word Empires) ─────────────────────

app.get('/api/cosmetics-admin/shop', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/cosmetics/shop`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word Empires unreachable' }); }
});

app.get('/api/cosmetics-admin/players', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/players?search=${encodeURIComponent(req.query.search || '')}`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word Empires unreachable' }); }
});

app.get('/api/cosmetics-admin/player/:id/cosmetics', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/player/${req.params.id}/cosmetics`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word Empires unreachable' }); }
});

app.post('/api/cosmetics-admin/grant', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cosmetics/grant`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word Empires unreachable' }); }
});

app.post('/api/cosmetics-admin/equip', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cosmetics/equip`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word Empires unreachable' }); }
});

app.post('/api/cosmetics-admin/revoke', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cosmetics/revoke`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word Empires unreachable' }); }
});

app.post('/api/cosmetics-admin/merge', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/players/merge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word Empires unreachable' }); }
});

app.get('/api/cosmetics-admin/duplicates', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/players/duplicates`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word Empires unreachable' }); }
});

app.post('/api/cosmetics-admin/merge-all-duplicates', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/players/merge-all-duplicates`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body || {})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word Empires unreachable' }); }
});

// ─── Accounts Admin API (proxy to Mobile Tycoon) ──────────────────────

app.get('/api/accounts-admin/search', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/search?q=${encodeURIComponent(req.query.q || '')}`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.get('/api/accounts-admin/linked-groups', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/linked-groups`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.get('/api/accounts-admin/potential-matches/:playerId', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/potential-matches/${req.params.playerId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.post('/api/accounts-admin/multi-link', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/multi-link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.get('/api/accounts-admin/search-discord', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/search-discord?q=${encodeURIComponent(req.query.q || '')}`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.get('/api/accounts-admin/:discordUserId', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${req.params.discordUserId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.post('/api/accounts-admin/:discordUserId/link', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${req.params.discordUserId}/link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.post('/api/accounts-admin/:discordUserId/unlink', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${req.params.discordUserId}/unlink`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.post('/api/accounts-admin/:discordUserId/merge', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${req.params.discordUserId}/merge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body || {})
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.put('/api/accounts-admin/:discordUserId/prefs', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${req.params.discordUserId}/prefs`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.get('/api/accounts-admin/:discordUserId/inventory', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${req.params.discordUserId}/inventory`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

// ─── Ledger / Audit API (proxy to Mobile Tycoon) ──────────────────────

app.get('/api/accounts-admin/ledger/search', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/ledger/search?${qs}`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.get('/api/accounts-admin/ledger/player/:playerId', async (req, res) => {
  try {
    const qs = new URLSearchParams(req.query).toString();
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/ledger/player/${req.params.playerId}?${qs}`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.get('/api/accounts-admin/ledger/player/:playerId/summary', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/ledger/player/${req.params.playerId}/summary`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

app.get('/api/accounts-admin/ledger/stats', async (req, res) => {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/ledger/stats`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Mobile Tycoon unreachable' }); }
});

// ─── Searchle Admin API (proxy to Searchle 3.0 server) ──────────────
let searchleSocket = null;
let lastSearchleState = null; // Cache last Searchle game state for new dashboard clients

app.get('/api/searchle/state', async (req, res) => {
  try {
    const r = await fetch(`${SEARCHLE_URL}/api/game/state`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Searchle unreachable' }); }
});

app.get('/api/searchle/history', async (req, res) => {
  try {
    const r = await fetch(`${SEARCHLE_URL}/api/game/history`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Searchle unreachable' }); }
});

app.get('/api/searchle/reveal', async (req, res) => {
  try {
    const r = await fetch(`${SEARCHLE_URL}/api/game/reveal`, { headers: { 'x-api-key': WT_API_SECRET } });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Searchle unreachable' }); }
});

app.post('/api/searchle/new', async (req, res) => {
  try {
    const r = await fetch(`${SEARCHLE_URL}/api/game/new`, { method: 'POST', headers: { 'x-api-key': WT_API_SECRET } });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Searchle unreachable' }); }
});

app.get('/api/searchle/models', async (req, res) => {
  try {
    const r = await fetch(`${SEARCHLE_URL}/api/models`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Searchle unreachable' }); }
});

app.post('/api/searchle/models', async (req, res) => {
  try {
    const r = await fetch(`${SEARCHLE_URL}/api/models/active`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Searchle unreachable' }); }
});

app.get('/api/searchle/jackpot', async (req, res) => {
  try {
    const r = await fetch(`${SEARCHLE_URL}/api/game/jackpot`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Searchle unreachable' }); }
});

app.post('/api/searchle/jackpot', async (req, res) => {
  try {
    const r = await fetch(`${SEARCHLE_URL}/api/game/jackpot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Searchle unreachable' }); }
});

app.post('/api/searchle/reset-jackpot', async (req, res) => {
  try {
    const r = await fetch(`${SEARCHLE_URL}/api/game/reset-jackpot`, { method: 'POST', headers: { 'x-api-key': WT_API_SECRET } });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Searchle unreachable' }); }
});

// ─── Squaredle Admin API (proxy to Squaredle server) ────────────────
const SQUAREDLE_PORT = 3016;
const SQUAREDLE_URL = `http://localhost:${SQUAREDLE_PORT}`;

app.post('/api/squaredle/command', async (req, res) => {
  try {
    const r = await fetch(`${SQUAREDLE_URL}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Squaredle unreachable' }); }
});

app.get('/api/squaredle/state', async (req, res) => {
  try {
    const r = await fetch(`${SQUAREDLE_URL}/api/game/state`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Squaredle unreachable' }); }
});

app.get('/api/squaredle/history', async (req, res) => {
  try {
    const r = await fetch(`${SQUAREDLE_URL}/api/game/history`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Squaredle unreachable' }); }
});

app.get('/api/squaredle/jackpot', async (req, res) => {
  try {
    const r = await fetch(`${SQUAREDLE_URL}/api/jackpot/settings`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Squaredle unreachable' }); }
});

app.post('/api/squaredle/jackpot', async (req, res) => {
  try {
    const r = await fetch(`${SQUAREDLE_URL}/api/jackpot/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Squaredle unreachable' }); }
});

app.post('/api/squaredle/reset-jackpot', async (req, res) => {
  try {
    const r = await fetch(`${SQUAREDLE_URL}/api/jackpot/reset`, {
      method: 'POST', headers: { 'x-api-key': WT_API_SECRET }
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Squaredle unreachable' }); }
});

app.post('/api/squaredle/start-daily', async (req, res) => {
  try {
    const r = await fetch(`${SQUAREDLE_URL}/api/game/start-daily`, {
      method: 'POST', headers: { 'x-api-key': WT_API_SECRET }
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Squaredle unreachable' }); }
});

// ─── Word500 Admin API (proxy to Word500 server) ────────────────────
let word500Socket = null;
let lastWord500State = null;

app.get('/api/word500/state', async (req, res) => {
  try {
    const r = await fetch(`${WORD500_DIRECT}/api/state`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word500 unreachable' }); }
});

app.get('/api/word500/stats', async (req, res) => {
  try {
    const r = await fetch(`${WORD500_DIRECT}/api/stats`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word500 unreachable' }); }
});

app.post('/api/word500/new-game', async (req, res) => {
  try {
    const r = await fetch(`${WORD500_DIRECT}/api/new-game`, { method: 'POST', headers: { 'x-api-key': WT_API_SECRET } });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word500 unreachable' }); }
});

app.get('/api/word500/jackpot', async (req, res) => {
  try {
    const r = await fetch(`${WORD500_DIRECT}/api/jackpot`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word500 unreachable' }); }
});

app.post('/api/word500/jackpot', async (req, res) => {
  try {
    const r = await fetch(`${WORD500_DIRECT}/api/jackpot`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word500 unreachable' }); }
});

app.post('/api/word500/reset-jackpot', async (req, res) => {
  try {
    const r = await fetch(`${WORD500_DIRECT}/api/reset-jackpot`, { method: 'POST', headers: { 'x-api-key': WT_API_SECRET } });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word500 unreachable' }); }
});

app.post('/api/word500/toggle-slash-prefix', async (req, res) => {
  try {
    const r = await fetch(`${WORD500_DIRECT}/api/toggle-slash-prefix`, { method: 'POST', headers: { 'x-api-key': WT_API_SECRET } });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word500 unreachable' }); }
});

app.post('/api/word500/test-guess', async (req, res) => {
  try {
    const r = await fetch(`${WORD500_DIRECT}/api/test-guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'Word500 unreachable' }); }
});

// ─── Portal Game Redirects ──────────────────────────────────────────
// Redirect user-facing portal URLs (e.g. /squaredle-multi/) to game proxy paths
const PORTAL_GAME_REDIRECTS = {
  '/squaredle/':        '/game/squaredle/sp.html',
  '/squaredle-multi/':  '/game/squaredle/mp.html',
  '/spellingbee/':      '/game/spellingbee/sp.html',
  '/spellingbee-multi/':'/game/spellingbee/mp.html',
  '/pixeletters/':      '/game/pixeletters/sp.html',
  '/pixeletters-multi/':'/game/pixeletters/mp.html',
  '/betwixt/':        '/game/betwixt/play',
  '/betwixt/solo/':   '/game/betwixt/play',
  '/betwixt/online/': '/game/betwixt/mp.html',
  '/betwixt-multi/':  '/game/betwixt/mp.html',
  '/wordle/':           '/game/wordle/sp.html',
  '/wordle-multi/':     '/game/wordle/mp.html',
  '/searchle/':         '/game/searchle/mp.html',
  '/searchle-single/':  '/game/searchle/sp.html',
  '/searchle-toast/':   '/game/searchle/v/toast',
  '/word500/solo/':     '/game/word500/',
  '/word500/':          '/game/word500/',
  '/word500-multi/':    '/game/word500/',
  '/word1000/':         '/game/word1000/play.html',
  '/figural/':          '/game/figural/sp.html',
  '/figural/solo/':     '/game/figural/sp.html',
  '/figural/online/':   '/game/figural/mp.html',
  '/figural-multi/':    '/game/figural/mp.html',
  '/unwordle/solo/':    '/game/unwordle/sp.html',
  '/unwordle/':         '/game/unwordle/sp.html',
  '/wordmine/':         '/game/wordmine/sp.html',
  '/wordmine-multi/':   '/game/wordmine/mp.html',
  '/erectangled/solo/':    'https://erectangled.com/solo',
  '/erectangled-single/':  'https://erectangled.com/solo',
  '/erectangled/':         'https://erectangled.com/',
  '/erectangled/online/':  'https://erectangled.com/',
  '/erectangled-multi/':   'https://erectangled.com/',
  '/erectangled-overlay/': '/game/erectangled/',
  '/sproutle/solo/':       'https://erectangled.com/solo',
  '/sproutle-single/':     'https://erectangled.com/solo',
  '/sproutle/':            'https://erectangled.com/',
  '/sproutle/online/':     'https://erectangled.com/',
  '/sproutle-multi/':      'https://erectangled.com/',
  '/sproutle-overlay/':    '/game/erectangled/',
};

for (const [from, to] of Object.entries(PORTAL_GAME_REDIRECTS)) {
  app.get(from, (req, res) => {
    // Preserve query string (e.g. ?auth=TOKEN from OAuth callback)
    const qs = req.originalUrl.includes('?') ? '?' + req.originalUrl.split('?')[1] : '';
    res.redirect(to + qs);
  });
}

// ─── Game Reverse Proxy ─────────────────────────────────────────────
// Serves all game overlays through port 3000 at /game/:id/
// so only one port needs to be exposed to the internet.
const appsConfig = JSON.parse(fs.readFileSync(path.join(__dirname, 'apps.json'), 'utf-8'));
const gameHttpProxies = {};  // HTTP: selfHandleResponse for HTML injection
const gameWsProxies = {};    // WebSocket: clean proxy, no selfHandleResponse
const proxyRouteIds = new Set();

for (const game of appsConfig.apps) {
  const routeIds = [game.id, ...((Array.isArray(game.aliases) ? game.aliases : []).filter(Boolean))];

  // HTTP proxy with response interception (for HTML modification)
  const httpProx = httpProxy.createProxyServer({
    target: `http://localhost:${game.port}`,
    selfHandleResponse: true
  });

  // Modify HTML responses to fix Socket.IO paths through the proxy
  httpProx.on('proxyRes', (proxyRes, req, res) => {
    const ct = proxyRes.headers['content-type'] || '';

    if (!ct.includes('text/html')) {
      // Non-HTML (JS, CSS, images): pass through unchanged
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
      return;
    }

    // HTML: buffer, inject Socket.IO path fix, send
    const chunks = [];
    proxyRes.on('data', (c) => chunks.push(c));
    proxyRes.on('end', () => {
      let body = Buffer.concat(chunks).toString();

      // Rewrite absolute /socket.io/ references to game-specific path
      body = body.replace(
        /(src|href)=(["'])\/socket\.io\//g,
        `$1=$2/game/${game.id}/socket.io/`
      );

      // Inject script that overrides io() to use the proxied Socket.IO path
      // Only override path for same-origin connections (no URL or relative URL);
      // explicit URLs like "http://localhost:3000" pass through unchanged so
      // game apps can still connect to the Relay Broadcast from the browser.
      const ioFix = `<script>(function(){var _io;Object.defineProperty(window,"io",{` +
        `get:function(){if(!_io)return undefined;` +
        `var w=function(u,o){o=o||{};` +
        `if(!u||typeof u!=="string"||u.charAt(0)==="/"){` +
        `if(u&&typeof u==="object"){u.path="/game/${game.id}/socket.io";}` +
        `else{o.path="/game/${game.id}/socket.io";}}` +
        `return _io(u,o)};` +
        `w.connect=w;if(_io.Manager)w.Manager=_io.Manager;` +
        `if(_io.Socket)w.Socket=_io.Socket;if(_io.protocol)w.protocol=_io.protocol;return w;},` +
        `set:function(v){_io=v;},configurable:true});})();</script>`;

      // Inject script that overrides fetch() and EventSource to rewrite absolute paths through the proxy.
      // e.g. fetch('/api/state') → fetch('/game/word-tycoon/api/state')
      // Only rewrites same-origin absolute paths; full URLs pass through unchanged.
      // Auth paths (/api/me/, /api/auth/, /auth/) and Chat Relay API paths (/api/library/, /api/sp-) are excluded — they must reach Chat Relay directly.
      const fetchFix = `<script>(function(){` +
        `function rewriteUrl(u){` +
        `if(typeof u==="string"&&u.charAt(0)==="/"&&!u.startsWith("/game/")&&!u.startsWith("/api/me")&&!u.startsWith("/api/auth")&&!u.startsWith("/auth/")&&!u.startsWith("/api/library")&&!u.startsWith("/api/sp-"))` +
        `return"/game/${game.id}"+u;return u;}` +
        `var _fetch=window.fetch;window.fetch=function(u,o){return _fetch.call(this,rewriteUrl(u),o)};` +
        `var _ES=window.EventSource;window.EventSource=function(u,o){return new _ES(rewriteUrl(u),o)};` +
        `window.EventSource.prototype=_ES.prototype;window.EventSource.CONNECTING=_ES.CONNECTING;window.EventSource.OPEN=_ES.OPEN;window.EventSource.CLOSED=_ES.CLOSED;` +
        `})();</script>`;

      body = body.replace('<head>', '<head>' + ioFix + fetchFix);

      // Inject chat widget + game help scripts before </body>. Stream embeds keep the game clean.
      const suppressChatWidget = ['obs', 'embedGame', 'streamer_self', 'transparent', 'overlay']
        .some((key) => Object.prototype.hasOwnProperty.call(req.query || {}, key));
      const chatWidgetScript = suppressChatWidget ? '' : '<script src="/chat-widget.js?v=11"></script>';
      const gameHelpInject = '<link rel="stylesheet" href="/game-help.css?v=1">' +
        '<script src="/game-help.js?v=1"></script>';
      body = body.replace('</body>', chatWidgetScript + gameHelpInject + '</body>');

      const headers = { ...proxyRes.headers };
      delete headers['content-encoding'];
      headers['content-length'] = Buffer.byteLength(body);
      res.writeHead(proxyRes.statusCode, headers);
      res.end(body);
    });
  });

  httpProx.on('error', (err, req, res) => {
    if (res && res.writeHead) {
      res.writeHead(502);
      res.end('Game server unreachable');
    }
  });

  // Separate WebSocket proxy — NO selfHandleResponse
  const wsProx = httpProxy.createProxyServer({
    target: `http://localhost:${game.port}`,
    ws: true
  });

  wsProx.on('error', (err, req, socket) => {
    console.log(`[Proxy WS] Error for ${game.id}:`, err.message);
    if (socket && socket.destroy) socket.destroy();
  });

  for (const routeId of routeIds) {
    gameHttpProxies[routeId] = httpProx;
    gameWsProxies[routeId] = wsProx;
    proxyRouteIds.add(routeId);
  }
}

// HTTP proxy: /game/:gameId/* → localhost:port/*
// Blocked paths: admin endpoints and write-only APIs that must go through authenticated Chat Relay proxies
const GAME_PROXY_BLOCKED = ['/api/admin', '/api/cosmetics/buy', '/api/cosmetics/buyset',
  '/api/cosmetics/equip', '/api/cosmetics/unequip', '/api/business/buy'];

app.use('/game/:gameId', (req, res) => {
  const rawGameId = req.params.gameId;
  const gameId = String(rawGameId || '').toLowerCase();
  const hasProxy = !!gameHttpProxies[gameId];
  require('fs').appendFileSync('/tmp/game-proxy-debug.log', JSON.stringify({ t: Date.now(), path: req.path, url: req.url, rawGameId, gameId, hasProxy }) + '\n');
  const proxy = gameHttpProxies[gameId];
  if (!proxy) return res.status(404).send('Game not found: ' + gameId + ' raw=' + rawGameId);

  // Strip prefix and disable compression so we can modify HTML
  // Express app.use already strips the mount path; only strip manually if still present
  const prefix = `/game/${req.params.gameId}`;
  if (req.url.startsWith(prefix)) {
    req.url = req.url.slice(prefix.length) || '/';
  }

  // Block admin and sensitive write endpoints — these must go through authenticated Chat Relay routes
  if (GAME_PROXY_BLOCKED.some(p => req.url.startsWith(p))) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  delete req.headers['accept-encoding'];
  proxy.web(req, res);
});

// WebSocket proxy: /game/:gameId/socket.io/* → localhost:port/socket.io/*
// Uses separate proxy instances without selfHandleResponse
server.on('upgrade', (req, socket, head) => {
  const match = req.url.match(/^\/game\/([^/]+)(\/.*)?$/);
  if (!match) return; // Let Relay Broadcast's Socket.IO handle /socket.io/ upgrades

  const gameId = match[1].toLowerCase();
  const wsProxy = gameWsProxies[gameId];
  if (!wsProxy) return socket.destroy();

  req.url = req.url.replace(`/game/${match[1]}`, '') || '/';
  wsProxy.ws(req, socket, head);
});

console.log(`[Proxy] ${proxyRouteIds.size} game route(s) proxied through /game/:id/`);

// ─── Socket.IO rate limiting by IP (prevents multi-connection abuse) ─────
const socketRateByIP = new Map(); // ip → lastMsgTime
const SOCKET_RATE_MS = 300; // min ms between messages per IP
// Cleanup stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 60000;
  for (const [ip, ts] of socketRateByIP) {
    if (ts < cutoff) socketRateByIP.delete(ip);
  }
}, 5 * 60_000);

// Socket.IO connection handling
io.on('connection', (socket) => {
  // Join dashboard room for browser clients (game servers will set _appId via app-register)
  socket.join('dashboard');
  console.log('[Server] Client connected');

  // Send initial state to dashboard clients
  socket.emit('platform-status', {
    tiktok: tiktok.isConnected(),
    youtube: youtube.isConnected(),
    discord: discord.isConnected()
  });

  socket.emit('tts-update', {
    users: db.getTTSUsers(),
    settings: db.getAllTTSSettings()
  });

  socket.emit('commands', commands.getCommandList());

  socket.emit('apps-status', apps.getAll());

  // Send Searchle connection status + cached game state
  socket.emit('searchle-connected', !!(searchleSocket && searchleSocket.connected));
  if (lastSearchleState) {
    socket.emit('searchle-game-state', lastSearchleState);
  }

  // Send Word500 connection status + cached game state
  socket.emit('word500-connected', !!(word500Socket && word500Socket.connected));
  if (lastWord500State) {
    socket.emit('word500-game-state', lastWord500State);
  }

  // Send all overlay settings (per-type)
  socket.emit('overlay-settings-init', overlaySettings);

  // Mobile app message handler
  socket.on('mobile-message', (data) => {
    if (!data || !data.user || !data.message) return;

    const username = (data.user.username || '').trim();
    const message = (data.message || '').trim();
    if (!username || !message) return;

    // Rate limit: max 1 message per 500ms per socket
    const now = Date.now();
    if (socket._lastMobileMsg && now - socket._lastMobileMsg < 500) return;
    socket._lastMobileMsg = now;

    relay.handleMessage({
      platform: 'mobile',
      user: {
        id: data.user.id || `mobile_${username}`,
        username: username,
        displayName: data.user.displayName || username,
        profilePic: data.user.profilePic || null,
        isFollowing: true,
        badges: []
      },
      message: message
    });
  });

  // ─── Chat Room Events ─────────────────────────────────────────────────
  socket.on('chat-join-room', async (room) => {
    if (!room || !VALID_ROOMS.includes(room)) return;
    socket.join(`chat:${room}`);
    // Send 12-hour history from database, enriched with cosmetics
    const history = db.getChatHistory(room);
    // Batch-fetch cosmetics for unique users in history
    const userIds = new Set();
    history.forEach(m => { if (m.user && m.user.id) userIds.add(m.user.id); });
    const cosmeticsMap = {};
    await Promise.all([...userIds].map(async (uid) => {
      const c = await getUserCosmetics(uid);
      if (c) cosmeticsMap[uid] = c;
    }));
    // Enrich messages with cosmetics (overwrite stale/missing cosmetics)
    history.forEach(m => {
      if (m.user && m.user.id && cosmeticsMap[m.user.id]) {
        m.user.cosmetics = cosmeticsMap[m.user.id];
      }
    });
    socket.emit('chat-room-history', { room, messages: history });
  });

  socket.on('chat-leave-room', (room) => {
    if (!room) return;
    socket.leave(`chat:${room}`);
  });

  socket.on('chat-room-message', async (data) => {
    if (!data || !data.user || !data.message) return;
    const room = data.room || 'main';
    if (!VALID_ROOMS.includes(room)) return;

    // Use verified session identity when available (prevents identity spoofing)
    const sessionUser = socket.request?.session?.discordUser;
    const userId = sessionUser ? sessionUser.id : (data.user.id || 'unknown');
    const message = (data.message || '').trim();
    const username = sessionUser ? (sessionUser.globalName || sessionUser.username) : (data.user.username || '').trim();
    if (!message || !username) return;

    // Rate limit: per-IP (prevents multi-socket abuse) + per-socket
    const now = Date.now();
    const clientIP = socket.handshake?.address || 'unknown';
    const lastIPMsg = socketRateByIP.get(clientIP);
    if (lastIPMsg && now - lastIPMsg < SOCKET_RATE_MS) {
      socket.emit('chat-room-error', { message: 'Slow down!' });
      return;
    }
    socketRateByIP.set(clientIP, now);
    if (socket._lastChatMsg && now - socket._lastChatMsg < 500) {
      socket.emit('chat-room-error', { message: 'Slow down!' });
      return;
    }
    socket._lastChatMsg = now;

    // Run through moderation filter
    const filterResult = chatFilter.filterMessage(message, {
      id: userId,
      discordId: userId,
      badges: data.user.badges || []
    });

    if (!filterResult.allowed) {
      socket.emit('chat-room-error', { message: filterResult.reason || 'Message blocked' });
      return;
    }

    // Fetch cosmetics for portal users (they auth via Discord, so userId = Discord ID)
    const cosmetics = await getUserCosmetics(userId);

    // Build the normalized message
    const msg = {
      id: uuidv4(),
      room: room,
      platform: 'mobile',
      user: {
        id: userId,
        username: username,
        displayName: sessionUser ? (sessionUser.globalName || sessionUser.username) : (data.user.displayName || username),
        profilePic: sessionUser ? (sessionUser.avatar || null) : (data.user.profilePic || null),
        cosmetics: cosmetics || {}
      },
      message: filterResult.filtered,
      timestamp: new Date().toISOString()
    };

    // Emit to room & persist to DB
    io.to(`chat:${room}`).emit('chat-room-msg', msg);
    db.saveChatMessage(room, msg);

    // If not main, also emit to main room (skip sockets already in the game room
    // since their client-side addMessage() already copies to main)
    if (room !== 'main') {
      const mainMsg = { ...msg, _fromRoom: room };
      io.to('chat:main').except(`chat:${room}`).emit('chat-room-msg', mainMsg);
      db.saveChatMessage('main', mainMsg);
    }
  });

  // Relay Bridge handler — receive forwarded events from remote bridge
  socket.on('relay-bridge', (data) => {
    if (!data || !data.type || !data.payload) return;

    // Validate bridge secret (REQUIRED — reject if not configured)
    const expectedSecret = process.env.BRIDGE_SECRET;
    if (!expectedSecret || data.secret !== expectedSecret) {
      console.log('[Bridge] Rejected relay-bridge event: invalid or missing secret');
      return;
    }

    // Only allow specific event types
    const allowedTypes = ['chat-message', 'engagement', 'platform-status'];
    if (!allowedTypes.includes(data.type)) return;

    // Mark as bridged and broadcast to all OTHER sockets (not back to sender)
    const payload = { ...data.payload, _bridged: true };
    socket.broadcast.emit(data.type, payload);
  });

  // Game app handshake — apps identify themselves on connect (requires API key)
  socket.on('app-register', (data, callback) => {
    if (!data || !data.id) {
      if (typeof callback === 'function') callback({ success: false, error: 'Missing app id' });
      return;
    }
    // Validate API key to prevent unauthorized app registration
    if (data.apiKey !== WT_API_SECRET) {
      console.log(`[Apps] Rejected app-register from ${data.name || data.id}: invalid API key`);
      if (typeof callback === 'function') callback({ success: false, error: 'Invalid API key' });
      return;
    }
    console.log(`[Apps] App registered: ${data.name || data.id} (port ${data.port || '?'})`);
    apps.setReachable(data.id, true);
    socket._appId = data.id;
    appSockets.set(data.id, socket);
    // Game servers don't need dashboard broadcasts (apps-status, tts-update, etc.)
    socket.leave('dashboard');
    io.to('dashboard').emit('apps-status', apps.getAll());
    if (typeof callback === 'function') callback({ success: true, id: data.id });
  });

  // Win overlay — browser clients join this room to receive all game win events
  socket.on('join-win-overlay', () => {
    socket.join('win-overlay');
  });

  // Forward game-win events from authenticated game sockets to win-overlay clients
  // Enriches winner cosmetics centrally so all games get consistent cosmetics display.
  socket.on('game-win', async (data) => {
    if (!socket._appId || !data || !data.game) return;
    const winner = data.winner;
    if (winner && !winner.cosmetics) {
      const platform = winner.platform;
      const userId = winner.platformUserId || winner.id;
      const linkedDiscord = winner.linkedDiscord || relay.lookupLinkedDiscord(platform, userId);
      if (linkedDiscord) {
        const cosmetics = await relay.getUserCosmetics(linkedDiscord);
        if (cosmetics && Object.keys(cosmetics).length > 0) {
          data = { ...data, winner: { ...winner, cosmetics } };
        }
      }
    }
    io.to('win-overlay').emit('game-win', data);
  });

  // Forward frenzy state from Word Tycoon to all connected game servers
  socket.on('frenzy-update', (data) => {
    if (socket._appId === 'word-tycoon' && data) {
      socket.broadcast.emit('frenzy-update', data);
    }
  });

  // Daily sequence: game servers report when their daily game is won
  socket.on('daily-win', (data) => {
    if (!socket._appId || !data?.game) return;
    if (sequenceState.currentIndex >= 0 && sequenceState.date) {
      advanceDailySequence(data.game);
    }
  });

  socket.on('disconnect', () => {
    if (socket._appId) {
      console.log(`[Apps] App disconnected: ${socket._appId}`);
      apps.setReachable(socket._appId, false);
      appSockets.delete(socket._appId);
    } else {
      console.log('[Server] Dashboard client disconnected');
    }
  });
});

// Start everything
async function start() {
  console.log('========================================');
  console.log('     Relay Broadcast - Starting Up');
  console.log('========================================');

  // Initialize database
  await db.initialize();

  // Initialize relay
  relay.initialize(io, process.env.DISCORD_WEBHOOK_URL);

  // Start chat message cleanup (12-hour history)
  startChatCleanup();

  // Initialize app manager
  apps.initialize(io);

  // Initialize Spotify "Now Playing"
  spotify.initialize(io, {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/spotify/callback',
    onNowPlaying: (payload) => {
      sassie.forwardSystemEvent('spotify', 'spotify_now_playing', payload, 'low');
    }
  });

  // Connect to Searchle 3.0 game server for real-time relay
  searchleSocket = ioClient(`http://localhost:${SEARCHLE_PORT}`, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000
  });

  searchleSocket.on('connect', () => {
    console.log('[Searchle] Connected to game server');
    io.emit('searchle-connected', true);
    apps.setReachable('searchle', true);
  });

  searchleSocket.on('disconnect', () => {
    console.log('[Searchle] Disconnected from game server');
    io.emit('searchle-connected', false);
    apps.setReachable('searchle', false);
  });

  searchleSocket.on('game-state', (data) => {
    lastSearchleState = data; // Cache for new dashboard clients
    io.emit('searchle-game-state', data);
  });

  searchleSocket.on('new-guess', (data) => {
    io.emit('searchle-new-guess', data);
  });

  searchleSocket.on('bump-guess', (data) => {
    io.emit('searchle-bump-guess', data);
  });

  searchleSocket.on('game-won', (data) => {
    // Update cached state so new dashboard clients see winner immediately
    if (lastSearchleState) {
      lastSearchleState.isWon = true;
      lastSearchleState.winner = data.user;
      lastSearchleState.targetWord = data.targetWord;
      lastSearchleState.lastWinner = { user: data.user, word: data.targetWord, guessCount: data.guessCount };
    }
    io.emit('searchle-game-won', data);
  });

  searchleSocket.on('new-game', (data) => {
    // Update cached state for new dashboard clients
    if (lastSearchleState) {
      lastSearchleState.isWon = false;
      lastSearchleState.winner = null;
      lastSearchleState.targetWord = null;
      lastSearchleState.guesses = [];
      lastSearchleState.startTime = data.startTime;
      lastSearchleState.totalRankedWords = data.totalRankedWords;
    }
    io.emit('searchle-new-game', data);
  });

  searchleSocket.on('models-updated', (data) => {
    io.emit('searchle-models-updated', data);
  });

  searchleSocket.on('sp-pool-word-added', (data) => {
    io.emit('sp-pool-word-added', data);
  });

  // Connect to Word500 game server for real-time relay
  // Word500 runs on the droplet behind nginx at /word500/
  const word500Base = WORD500_URL.replace(/\/+$/, '');
  const word500Origin = new URL(word500Base).origin;
  const word500Path = new URL(word500Base).pathname.replace(/\/+$/, '') + '/socket.io/';
  word500Socket = ioClient(word500Origin, {
    path: word500Path,
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    transports: ['polling', 'websocket']
  });

  word500Socket.on('connect', () => {
    console.log('[Word500] Connected to game server');
    io.emit('word500-connected', true);
    apps.setReachable('word500', true);
  });

  word500Socket.on('disconnect', () => {
    console.log('[Word500] Disconnected from game server');
    io.emit('word500-connected', false);
    apps.setReachable('word500', false);
  });

  word500Socket.on('game-state', (data) => {
    lastWord500State = data;
    io.emit('word500-game-state', data);
  });

  word500Socket.on('guess', (data) => {
    io.emit('word500-guess', data);
  });

  word500Socket.on('game-over', (data) => {
    if (lastWord500State) {
      lastWord500State.gameOver = true;
      lastWord500State.winner = data.winner;
    }
    io.emit('word500-game-over', data);
  });

  word500Socket.on('new-game', (data) => {
    if (lastWord500State) {
      lastWord500State.gameOver = false;
      lastWord500State.winner = null;
      lastWord500State.guesses = [];
    }
    io.emit('word500-new-game', data);
  });

  // Start server
  server.listen(PORT, () => {
    console.log(`[Server] Dashboard running at http://localhost:${PORT}`);
    // Start live game state polling
    pollGameStates();
    setInterval(pollGameStates, 5000);
  });

  // Connect to TikFinity
  if (process.env.TIKFINITY_WS_URL) {
    tiktok.initialize(process.env.TIKFINITY_WS_URL, process.env.TIKTOK_USERNAME);
  }

  // Connect to Streamer.bot
  if (process.env.STREAMERBOT_WS_URL) {
    youtube.initialize(process.env.STREAMERBOT_WS_URL);
  }

  // Connect Discord bot
  if (process.env.DISCORD_BOT_TOKEN) {
    discord.initialize(process.env.DISCORD_BOT_TOKEN, process.env.DISCORD_CHANNEL_ID);
  }

  // Initialize Discord OAuth
  discordOAuth.initialize({
    clientId: process.env.DISCORD_CLIENT_ID || '',
    clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
    redirectUri: process.env.DISCORD_OAUTH_REDIRECT_URI || `http://localhost:${PORT}/auth/discord/callback`
  });

  // Initialize GitHub OAuth
  githubOAuth.initialize({
    clientId: process.env.GITHUB_CLIENT_ID || '',
    clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    redirectUri: process.env.GITHUB_OAUTH_REDIRECT_URI || `http://localhost:${PORT}/auth/github/callback`
  });

  // Initialize relay bridge (syncs local ↔ server, only if BRIDGE_RELAY_URL is set)
  const bridge = require('./src/relay-bridge');
  bridge.initialize();

  console.log('========================================');
  console.log('   All services starting...');
  console.log('========================================');
}

start().catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});

// Graceful shutdown
let shuttingDown = false;

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log('\n[Relay Broadcast] Shutting down...');
  db.save();
  console.log('[Relay Broadcast] Database saved');
  apps.shutdown();
  require('./src/relay-bridge').shutdown();
  if (searchleSocket) searchleSocket.disconnect();
  if (word500Socket) word500Socket.disconnect();
  discord.getClient()?.destroy();
  server.close();
  console.log('[Relay Broadcast] Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
