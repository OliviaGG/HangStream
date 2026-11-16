const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
if (!process.env.GAME_API_SECRET) {
  console.error('[FATAL] GAME_API_SECRET env var not set — refusing to start. '
                + 'Populate .env or pm2 env before starting this service.');
  process.exit(1);
}

const { socketClientAddress, requestClientAddress } = require('./src/client-address');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
// ─── ELO Data Loader (for holo-win-overlay enrichment) ─────────────────
const ELO_RATINGS_PATH = '/opt/word-tycoon/data/elo-ratings.json';
let eloDataCache = { games: {}, global: {}, lastLoad: 0, _mtime: 0 };

function loadEloData() {
  try {
    const stat = fs.statSync(ELO_RATINGS_PATH);
    const raw = fs.readFileSync(ELO_RATINGS_PATH, 'utf-8');
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      eloDataCache = { games: obj.games || {}, global: obj.global || {}, lastLoad: Date.now(), _mtime: stat.mtimeMs };
    }
  } catch (e) {
    if (e.code !== 'ENOENT') console.log('[ChatRelay] ELO load failed:', e.message);
  }
}

// Fresh on demand: stat the file and only reparse if mtime advanced. Cheap
// enough to call from the game-win hot path (a few times per minute), and
// closes the race where a game posts to /api/elo/update and emits game-win
// before the next 30s refresh tick.
function loadEloDataIfChanged() {
  try {
    const stat = fs.statSync(ELO_RATINGS_PATH);
    if (stat.mtimeMs !== eloDataCache._mtime) loadEloData();
  } catch (e) { /* file may not exist yet */ }
}

loadEloData();

function getWinnerIdentityKey(winner) {
  if (!winner) return null;
  if (winner.linkedDiscord) return 'discord:' + winner.linkedDiscord;
  // Discord snowflakes are 17–20 digits. When a game forwards a 'web' platform
  // user with a snowflake-shaped id but no explicit linkedDiscord field, the
  // ELO row is still stored under discord:<id> by WT — match that here so
  // lookups succeed even when the source emit omits linkedDiscord.
  const puid = winner.platformUserId || winner.id;
  if (winner.platform === 'web' && puid && /^\d{17,20}$/.test(String(puid))) {
    return 'discord:' + puid;
  }
  if (winner.platform && winner.platformUserId) return winner.platform + ':' + winner.platformUserId;
  if (winner.platform && winner.id) return winner.platform + ':' + winner.id;
  return null;
}

function getEloForIdentity(game, identityKey) {
  const gameMap = eloDataCache.games[game];
  if (!gameMap) return null;
  const entry = gameMap[identityKey];
  if (!entry) return null;
  const latestHistory = entry.history && entry.history[0];
  return {
    elo: entry.elo,
    eloDelta: latestHistory ? latestHistory.delta : 0
  };
}

function buildEloTop10(game) {
  const gameMap = eloDataCache.games[game];
  if (!gameMap) return [];
  return Object.entries(gameMap)
    .map(([identityKey, data]) => ({
      identityKey,
      elo: data.elo,
      eloDelta: data.history && data.history[0] ? data.history[0].delta : 0,
      roundsCounted: data.roundsCounted || 0
    }))
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 10);
}

function resolveDisplayNameForEloKey(identityKey) {
  // Best-effort name lookup via Chat Relay users table
  try {
    if (identityKey.startsWith('discord:')) {
      const discordId = identityKey.slice(8);
      const user = db.getUserByPlatform('discord', discordId);
      if (user && user.display_name) return user.display_name;
      return 'Discord Player';
    }
    const colon = identityKey.indexOf(':');
    if (colon > 0) {
      const platform = identityKey.slice(0, colon);
      const puid = identityKey.slice(colon + 1);
      const user = db.getUserByPlatform(platform, puid);
      if (user && user.display_name) return user.display_name;
    }
  } catch (e) { /* DB unavailable */ }
  return identityKey;
}

function enrichGameWinWithElo(data) {
  loadEloDataIfChanged();
  const game = data.game;
  if (!game || !eloDataCache.games[game]) return data;
  const winner = data.winner;
  if (!winner) return data;

  let enriched = { ...data };
  const winnerKey = getWinnerIdentityKey(winner);
  if (winnerKey) {
    const winnerElo = getEloForIdentity(game, winnerKey);
    if (winnerElo) {
      enriched.winner = { ...winner, ...winnerElo };
    }
  }

  // Annotate the game-supplied per-round leaderboard with each player's ELO
  // and delta where we can identify them. Preserves round points and other
  // fields; entries we can't identify pass through unchanged.
  if (Array.isArray(data.topPlayers)) {
    enriched.topPlayers = data.topPlayers.map((p) => {
      const key = getWinnerIdentityKey(p);
      if (!key) return p;
      const elo = getEloForIdentity(game, key);
      return elo ? { ...p, ...elo } : p;
    });
  }

  return enriched;
}

const httpProxy = require('http-proxy');

const { io: ioClient } = require('socket.io-client');
const { v4: uuidv4 } = require('uuid');

const db = require('./src/database');
const relay = require('./src/relay');
const sassie = require('./src/sassie-forwarder');
const ailicia = require('./src/ailicia');
const tiktok = require('./src/tiktok');
const tiktokDirect = require('./src/tiktok-direct');
const topLikers = require('./src/top-likers');
const streamers = require('./src/streamers');
const streamerRules = require('./src/streamer-rules');
const streamerGoals = require('./src/streamer-goals');
const streamerSetups = require('./src/streamer-setups');
const streamerApplications = require('./src/streamer-applications');
const { registerPookieTokRoutes } = require('./src/pookie-routes');
const winTallies = require('./src/win-tallies');
const gameVote = require('./src/game-vote');
const rooms = require('./src/rooms');
const roomEmbed = require('./src/room-embed');
const streamerActions = require('./src/streamer-actions');
const streamerTts = require('./src/streamer-tts');
const obsRemote = require('./src/obs-remote');
const obsPower = require('./src/obs-power');
const streamerTtsPipeline = require('./src/streamer-tts-pipeline');
const youtube = require('./src/youtube');
const facebook = require('./src/facebook');
const discord = require('./src/discord');
const discordSearchle = require('./src/discord-searchle');
const commands = require('./src/commands');
const apps = require('./src/apps');
const spotify = require('./src/spotify');
const spotifyConnect = require('./src/spotify-connect');
const spotifyRequests = require('./src/spotify-requests');
const auth = require('./src/auth');
const { buildGameFetchProxyInject } = require('./src/game-proxy-browser');
const discordOAuth = require('./src/discord-oauth');
const githubOAuth = require('./src/github-oauth');
const googleOAuth = require('./src/google-oauth');
const tiktokOAuth = require('./src/tiktok-oauth');
const wordBank = require('./src/word-bank');
const { DAILY_RULES, validateDailyTranscript } = require('./src/sp-transcript-validator');
const { validateSpellingBeeWeekly } = require('./src/spellingbee-weekly-validator');
const junkdrawer = require('./src/junkdrawer');
const cloudquarry = require('./src/cloudquarry');
const letterworks = require('./src/letterworks');
const wordfall = require('./src/wordfall');
const synapse = require('./src/synapse');
const synapseMp = require('./src/synapse-mp');
const chatFilter = require('./src/chat-filter');
const eventOverlay = require('./src/event-overlay');
const activityOverlay = require('./src/activity-overlay');
const feed = require('./src/feed');
const avatarCache = require('./src/avatar-cache');
const botPlayers = require('./src/bot-players');
const { registerWordFoundryProxy } = require('./src/word-foundry-proxy');

const app = express();
const requestMetrics = require('./src/request-metrics').createRequestMetrics();
app.use(requestMetrics.middleware);

// Trust nginx reverse proxy (needed for secure cookies, correct protocol detection)
app.set('trust proxy', 1);

// ─── Chat Room System ──────────────────────────────────────────────────
const VALID_ROOMS = ['main', 'wordle', 'searchle', 'spellingbee', 'pixeletters', 'word500', 'colour500', 'betwixt', 'rectangled', 'figural', 'unwordle', 'triangled', 'sproutle'];

// Chat history is now DB-backed (12-hour persistence)
// Clean up old messages every 30 minutes
function startChatCleanup() {
  // Clean on startup
  db.cleanOldChatMessages();
  // Then every 30 minutes
  setInterval(() => {
    db.cleanOldChatMessages();
    db.pruneUsageData();
  }, 30 * 60 * 1000);
}
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:3000', 'http://127.0.0.1:3000',
      'https://wordtycoon.live', 'https://www.wordtycoon.live',
      'https://hangstream.me', 'https://www.hangstream.me',
      'https://play.hangstream.me'
    ],
    credentials: true
  }
});

const PORT = process.env.PORT || 3000;
const WORD_EMPIRES_PORT = 3020;
const WORD_EMPIRES_URL = `http://localhost:${WORD_EMPIRES_PORT}`;
const WT_API_SECRET = process.env.GAME_API_SECRET;
const RELAY_GATEWAY_SECRET = process.env.RELAY_GATEWAY_SECRET || null;
// Operator and player-proof credentials never fall back to a game issuer.
const WT_ADMIN_SECRET = process.env.ADMIN_API_SECRET;
const TRI_ADMIN_SECRET = process.env.TRIANGLED_ADMIN_SECRET;
const TRI_SESSION_SECRET = process.env.TRIANGLED_SESSION_SECRET;
const HINT_TOKEN_SECRET = process.env.HINT_TOKEN_SECRET;
if (![WT_ADMIN_SECRET, TRI_ADMIN_SECRET, TRI_SESSION_SECRET, HINT_TOKEN_SECRET].every(key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key)))
  throw new Error('Dedicated service purpose credentials are unavailable');
const serviceKeyPolicy = require('./src/service-key-policy').createServiceKeyPolicy({
  filename: path.join(__dirname, 'data', 'service-keys.json'),
});
const fetch = require('./src/service-fetch').createServiceFetch({
  request: globalThis.fetch, policy: serviceKeyPolicy, relayKey: WT_API_SECRET,
  operatorKey: WT_ADMIN_SECRET,
  adminKeys: { triangled: TRI_ADMIN_SECRET },
});
const STREAM_OWNER_ID = process.env.STREAM_OWNER_DISCORD_ID || '179331908499406849';
const WIN_OVERLAY_SETTINGS_PATH = path.join(__dirname, 'data', 'win-overlay-settings.json');

const TYCOONIO_BUSINESS_ORDER = ['newspaper', 'carwash', 'stockmogul', 'pizza', 'gym', 'cinema', 'startup', 'bank', 'space'];
const TYCOONIO_SUPPORTED_BUSINESSES = new Set(['newspaper', 'carwash', 'stockmogul', 'pizza', 'gym', 'cinema', 'startup', 'bank']);
const TYCOONIO_BUSINESS_META = {
  newspaper: { name: 'Newspaper Route', icon: 'NP' },
  carwash: { name: 'Car Wash', icon: 'CW' },
  stockmogul: { name: 'Stock Mogul', icon: 'SM' },
  pizza: { name: 'Pizza Shop', icon: 'PZ' },
  gym: { name: 'Gym', icon: 'GY' },
  cinema: { name: 'Movie Theater', icon: 'CN' },
  startup: { name: 'Tech Startup', icon: 'TS' },
  bank: { name: 'Bank', icon: 'BK' },
  space: { name: 'Space Agency', icon: 'SP' }
};

function humanizeTycoonKey(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function formatTycoonCompactNumber(value) {
  const numeric = Number(value) || 0;
  if (Math.abs(numeric) >= 1000000) return `${(numeric / 1000000).toFixed(1)}M`;
  if (Math.abs(numeric) >= 1000) return `${(numeric / 1000).toFixed(1)}K`;
  return `${Math.round(numeric)}`;
}

function getTycoonBusinessLevel(business) {
  if (!business) return 0;
  if (business.shop_level != null) return Number(business.shop_level) || 0;
  if (business.level != null) return Number(business.level) || 0;
  return 0;
}

function getTycoonBusinessIncome(type, incomePerSecond = {}) {
  const current = incomePerSecond.current || incomePerSecond;
  let value = 0;
  let label = 'XP/sec';

  switch (type) {
    case 'newspaper':
      value = Number(current.newsIncome ?? incomePerSecond.newsIncome ?? 0) || 0;
      label = 'XP/sec';
      break;
    case 'carwash':
      value = Number(current.carwashCleanRate ?? incomePerSecond.carwashCleanRate ?? 0) || 0;
      label = 'clean cash/sec';
      break;
    case 'stockmogul':
      value = Number(current.stockmogulIncome ?? incomePerSecond.stockmogulIncome ?? 0) || 0;
      label = 'portfolio/sec';
      break;
    case 'pizza':
      value = Number(current.pizzaIncome ?? incomePerSecond.pizzaIncome ?? 0) || 0;
      label = 'XP/sec';
      break;
    case 'gym':
      value = Number(current.gymIncome ?? incomePerSecond.gymIncome ?? 0) || 0;
      label = 'XP/sec';
      break;
    case 'cinema':
      value = Number(current.cinemaIncome ?? incomePerSecond.cinemaIncome ?? 0) || 0;
      label = 'XP/sec';
      break;
    case 'startup':
      value = Number(current.startupIncome ?? incomePerSecond.startupIncome ?? 0) || 0;
      label = 'XP/sec';
      break;
    case 'bank':
      value = Number(current.bankIncome ?? incomePerSecond.bankIncome ?? 0) || 0;
      label = 'XP/sec';
      break;
    case 'space':
      value = Number(current.spaceIncome ?? incomePerSecond.spaceIncome ?? 0) || 0;
      label = 'XP/sec';
      break;
  }

  return { value, label };
}

function buildTycoonBusinessCard(type, ownedMap, incomePerSecond) {
  const meta = TYCOONIO_BUSINESS_META[type] || { name: humanizeTycoonKey(type), icon: 'TY' };
  const business = ownedMap[type] || null;
  const level = getTycoonBusinessLevel(business);
  const prestigeLevel = Number(business?.prestige_level || business?.prestigeLevel || 0) || 0;
  const income = getTycoonBusinessIncome(type, incomePerSecond);
  return {
    businessType: type,
    name: meta.name,
    icon: meta.icon,
    owned: !!business,
    supported: TYCOONIO_SUPPORTED_BUSINESSES.has(type),
    level,
    prestigeLevel,
    incomePerSecond: income.value,
    incomeLabel: income.label,
    shopName: business?.name || null,
    status: business ? 'owned' : 'locked'
  };
}

function buildTycoonBusinessCards(rawData) {
  const ownedMap = {};
  (rawData?.businesses || []).forEach((business) => {
    if (business?.business_type && business.business_type !== 'library') {
      ownedMap[business.business_type] = business;
    }
  });
  return TYCOONIO_BUSINESS_ORDER.map((type) => buildTycoonBusinessCard(type, ownedMap, rawData?.incomePerSecond || {}));
}

function deriveTycoonActions(cards) {
  const owned = cards
    .filter((card) => card.owned)
    .sort((a, b) => (b.incomePerSecond || 0) - (a.incomePerSecond || 0));

  const actions = owned.slice(0, 3).map((card) => ({
    type: card.supported ? 'manage' : 'view',
    label: `${card.supported ? 'Manage' : 'View'} ${card.name}`,
    href: `/tycoonio/business/${card.businessType}`
  }));

  if (!actions.length) {
    actions.push({
      type: 'welcome',
      label: 'Your empire is ready to begin',
      href: null
    });
  }

  return actions;
}

function pickTycoonPrimaryState(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const preferred = ['route', 'shop', 'club', 'theater', 'portfolio', 'business', 'state'];
  for (const key of preferred) {
    if (payload[key] && typeof payload[key] === 'object' && !Array.isArray(payload[key])) {
      return { key, value: payload[key] };
    }
  }
  for (const [key, value] of Object.entries(payload)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return { key, value };
    }
  }
  return null;
}

function buildTycoonDetailStats(source) {
  if (!source || typeof source !== 'object') return [];
  const ignored = new Set([
    'id', 'player_id', 'created_at', 'updated_at', 'name', 'shop_name', 'business_type',
    'incomePerSecond', 'income_per_second', 'prestige_level', 'prestigeLevel', 'level', 'shop_level'
  ]);
  const stats = [];
  for (const [key, value] of Object.entries(source)) {
    if (ignored.has(key)) continue;
    if (value == null) continue;
    if (typeof value === 'number' && Number.isFinite(value)) {
      stats.push({ label: humanizeTycoonKey(key), value: formatTycoonCompactNumber(value) });
    } else if (typeof value === 'string' && value && !/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      stats.push({ label: humanizeTycoonKey(key), value });
    }
    if (stats.length >= 8) break;
  }
  return stats;
}

function buildTycoonDetailSummary(type, card, payload) {
  const primary = pickTycoonPrimaryState(payload);
  const source = primary?.value || {};
  const currentLevel = Number(source.shopLevel ?? source.shop_level ?? source.level ?? card.level ?? 0) || 0;
  const prestigeLevel = Number(source.prestigeLevel ?? source.prestige_level ?? card.prestigeLevel ?? 0) || 0;
  const incomePerSecond = Number(source.incomePerSecond ?? source.income_per_second ?? card.incomePerSecond ?? 0) || 0;
  const pendingPayload = payload?.pending || {};
  const readyToCollect =
    Number(pendingPayload.xpEarned ?? pendingPayload.pizzaCoins ?? pendingPayload.cleanCash ?? pendingPayload.portfolioCoins ??
      source.readyToCollect ?? source.ready_to_collect ?? source.accumulatedIncome ?? source.accumulated_income ?? source.pendingIncome ?? 0) || 0;

  return {
    primaryKey: primary?.key || null,
    title: source.name || source.shopName || card.shopName || card.name,
    currentLevel,
    prestigeLevel,
    incomePerSecond,
    incomeLabel: card.incomeLabel,
    readyToCollect,
    stats: buildTycoonDetailStats(source)
  };
}

// Dedup set for relay-bridge events (prevents double delivery from multiple bridge sockets)
const _bridgeDedup = new Set();

// Authenticated fetch helper — adds API key for Word Tycoon requests
function wtFetch(url, options = {}) {
  const headers = { ...options.headers || {} };
  const isEconomy = new URL(url, WORD_EMPIRES_URL).origin === new URL(WORD_EMPIRES_URL).origin;
  if (isEconomy && !RELAY_GATEWAY_SECRET) throw new Error('Economy gateway credential not configured');
  headers['x-relay-auth'] = isEconomy ? RELAY_GATEWAY_SECRET : WT_API_SECRET;
  if (isEconomy) headers['x-admin-key'] = WT_ADMIN_SECRET;
  else delete headers['x-admin-key'];
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

// Every key a platform identity might be filed under in WT's linked_accounts.
// TikTok needs all three: rows written by autoLinkConnections use the handle,
// legacy rows use the numeric stream id, and the TikTok Login Kit hands us an
// open_id that we prefix with tt_. They all name the same person.
function linkLookupCandidates(user, provider) {
  const id = String(user?.id || '');
  const out = [id];
  if (provider === 'tiktok') {
    if (id.startsWith('tt_')) out.push(id.slice(3));
    if (user?.tiktokHandle) out.push(String(user.tiktokHandle).toLowerCase());
  }
  return [...new Set(out.filter(Boolean))];
}

// First candidate that resolves to a Discord anchor wins. A candidate that
// throws is skipped rather than failing the whole lookup.
async function resolveLinkedDiscordId(provider, candidates) {
  for (const candidate of candidates) {
    try {
      const r = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=${provider}&platformUserId=${encodeURIComponent(candidate)}`);
      const data = await r.json();
      if (data.linked && data.discordUserId) return data.discordUserId;
    } catch (e) {
      console.warn(`[Link] resolve failed for ${provider}:${candidate} — ${e.message}`);
    }
  }
  return null;
}

async function resolveWordTycoonAccountId(discordUser) {
  const provider = discordUser.provider || (discordUser.id.startsWith('gh_') ? 'github' : discordUser.id.startsWith('go_') ? 'google' : discordUser.id.startsWith('tt_') ? 'tiktok' : 'discord');
  if (provider !== 'github' && provider !== 'tiktok') {
    // Discord ids and standalone web ids (go_/gh_) are first-class WT account ids.
    return { ok: true, linked: true, provider, accountId: discordUser.id, discordAnchor: provider === 'discord' };
  }

  try {
    const anchor = await resolveLinkedDiscordId(provider, linkLookupCandidates(discordUser, provider));
    if (anchor) {
      return { ok: true, linked: true, provider, accountId: anchor, discordAnchor: true };
    }
    if (provider === 'github') {
      // No Discord anchor — GitHub accounts stand alone (same model as Google).
      return { ok: true, linked: true, provider, accountId: discordUser.id, discordAnchor: false };
    }
    // TikTok users must link — stream identity depends on the Discord anchor.
    return { ok: true, linked: false, provider, accountId: null, discordAnchor: false };
  } catch (error) {
    return { ok: false, linked: false, provider, error };
  }
}

async function getCurrentWordTycoonAccountId(discordUser) {
  if (!discordUser?.id) return null;
  const resolved = await resolveWordTycoonAccountId(discordUser);
  return resolved.ok && resolved.accountId ? resolved.accountId : discordUser.id;
}

// Cosmetics lookup — uses relay module's shared cache (no duplication)
const getUserCosmetics = (discordId) => relay.getUserCosmetics(discordId);
const PORTAL_DISPLAY_PRIORITY = ['discord', 'tiktok', 'youtube', 'github', 'google'];

// Admin comes from wt-admin.sid ONLY. The portal session (req.session) is
// SameSite=None so it rides along on requests from every game domain — an
// isAdmin flag living there would grant admin cross-site. Nothing sets it
// today; the fallback was removed 2026-07-31 so nothing can start to.
function isAdminRequest(req) {
  const keys = [req.headers?.['x-admin-key'], req.headers?.['x-api-key']];
  return !!req.adminSession?.isAdmin || (typeof WT_ADMIN_SECRET === 'string' && !!WT_ADMIN_SECRET && keys.includes(WT_ADMIN_SECRET));
}

function hasInternalApiKey(req) {
  const keys = [req.headers?.['x-api-key'], req.headers?.['x-relay-auth']];
  return keys.some(key => serviceKeyPolicy.canRelay(serviceKeyPolicy.identify(key), req.method,
    req.originalUrl || req.path, { body: req.body, params: req.params, query: req.query }));
}
const chatIdentity = require('./src/chat-identity').createChatIdentity({
  botKey: process.env.BOT_COMMAND_SECRET || null,
  isBotServiceActive: socket => serviceKeyPolicy.active(socket._servicePrincipal),
  isSessionActive: session => !session?.rememberSession || rememberSessions.activeSession(session.rememberSession, session.discordUser?.id),
  getSession(sid, callback) {
    const store = auth.initialize._sessionStore;
    if (!store || typeof store.get !== 'function') return callback(new Error('Session store unavailable'));
    store.get(sid, callback);
  },
  origins: ['https://wordtycoon.live', 'https://www.wordtycoon.live',
    ...(process.env.NODE_ENV === 'development' ? ['http://localhost:3000', 'http://127.0.0.1:3000'] : [])]
});


function getAdminActorLogData(req) {
  const portalUser = req.session?.discordUser || null;
  return {
    portalUserId: portalUser?.id || null,
    portalUsername: portalUser?.username || null,
    ip: req.ip || req.connection?.remoteAddress || null,
    origin: req.get('Origin') || null,
    referer: req.get('Referer') || null,
    userAgent: (req.get('User-Agent') || '').slice(0, 200) || null,
  };
}

async function getResolvedSessionAccountId(req) {
  if (!req.session?.discordUser?.id) return null;
  try {
    return await getCurrentWordTycoonAccountId(req.session.discordUser);
  } catch {
    return null;
  }
}

async function canAccessDiscordScopedData(req, discordId) {
  if (isAdminRequest(req) || hasInternalApiKey(req)) return true;
  const sessionAccountId = await getResolvedSessionAccountId(req);
  return !!sessionAccountId && String(sessionAccountId) === String(discordId);
}

function isRawPortalId(value) {
  return !!value && /^\d{10,}$/.test(value);
}

function toAbsolutePortalAsset(url) {
  if (!url || typeof url !== 'string') return null;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return `https://wordtycoon.live${url}`;
  return url;
}

async function buildResolvedSessionUser(sessionUser) {
  if (!sessionUser?.id) return null;

  const resolvedUser = {
    ...sessionUser,
    displayName: sessionUser.displayName || sessionUser.globalName || sessionUser.username,
    globalName: sessionUser.globalName || sessionUser.displayName || sessionUser.username,
    avatar: toAbsolutePortalAsset(sessionUser.avatar) || null,
    provider: sessionUser.provider || 'discord'
  };

  try {
    const resolvedAccount = await resolveWordTycoonAccountId(sessionUser);
    const accountId = (resolvedAccount.ok && resolvedAccount.accountId) ? resolvedAccount.accountId : sessionUser.id;
    if (!accountId) return resolvedUser;
    const hasDiscordAnchor = !!resolvedAccount.discordAnchor;

    const overviewResponse = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${accountId}`);
    const overviewData = await overviewResponse.json();
    if (overviewData?.ok) {
      const provider = resolvedUser.provider;
      const rawPlatforms = (overviewData.linkedPlatforms || [])
        .filter((platform) => platform.platform !== 'mobile')
        .map((platform) => ({
          platform: platform.platform,
          username: platform.player?.username || platform.platform_user_id || platform.platformUserId,
          displayName: platform.player?.display_name || platform.player?.username,
          profilePic: toAbsolutePortalAsset(platform.player?.profile_pic)
        }));

      const platformMap = new Map();
      for (const platform of rawPlatforms) {
        const existing = platformMap.get(platform.platform);
        if (!existing) {
          platformMap.set(platform.platform, platform);
          continue;
        }

        const existingHasName = existing.displayName && !isRawPortalId(existing.displayName);
        const nextHasName = platform.displayName && !isRawPortalId(platform.displayName);
        if ((!existingHasName && nextHasName) || (!existing.profilePic && platform.profilePic)) {
          platformMap.set(platform.platform, platform);
        }
      }

      const platforms = [...platformMap.values()];
      for (const platform of platforms) {
        if (platform.displayName && (isRawPortalId(platform.displayName) || platform.displayName.startsWith('gh_') || platform.displayName.startsWith('go_') || platform.displayName.startsWith('tt_'))) {
          platform.displayName = null;
        }
        if (platform.username && (platform.username.startsWith('gh_') || platform.username.startsWith('go_') || platform.username.startsWith('tt_'))) {
          platform.username = null;
        }
      }

      if (provider === 'github' || provider === 'google') {
        const ownPlatform = platforms.find((platform) => platform.platform === provider);
        const ownAvatar = toAbsolutePortalAsset(sessionUser.avatar);
        if (ownPlatform) {
          if (!ownPlatform.displayName) ownPlatform.displayName = sessionUser.globalName || sessionUser.displayName || sessionUser.username;
          if (!ownPlatform.username) ownPlatform.username = sessionUser.username;
          if (!ownPlatform.profilePic) ownPlatform.profilePic = ownAvatar;
        } else {
          platforms.push({
            platform: provider,
            username: sessionUser.username,
            displayName: sessionUser.globalName || sessionUser.displayName || sessionUser.username,
            profilePic: ownAvatar
          });
        }
      }

      // Only surface a Discord entry when the account is actually Discord-anchored;
      // standalone gh_/go_ accounts have no Discord identity to show.
      if (hasDiscordAnchor) {
        const discordAvatar = provider === 'discord' ? (toAbsolutePortalAsset(sessionUser.avatar) || null) : null;
        let discordUsername;
        let discordDisplayName;
        if (provider === 'discord') {
          discordUsername = sessionUser.username;
          discordDisplayName = sessionUser.globalName || sessionUser.displayName || sessionUser.username;
        } else {
          const primaryUsername = overviewData.primaryPlayer?.username;
          const primaryDisplayName = overviewData.primaryPlayer?.display_name;
          discordUsername = primaryUsername && !isRawPortalId(primaryUsername) ? primaryUsername : null;
          discordDisplayName = primaryDisplayName && !isRawPortalId(primaryDisplayName) ? primaryDisplayName : discordUsername;
        }

        platforms.push({
          platform: 'discord',
          username: discordUsername || accountId,
          displayName: discordDisplayName || discordUsername || accountId,
          profilePic: discordAvatar
        });
      }

      let resolvedDisplayName = overviewData.preferences?.preferred_display_name || null;
      if (!resolvedDisplayName) {
        for (const platformName of PORTAL_DISPLAY_PRIORITY) {
          const platform = platforms.find((entry) => entry.platform === platformName);
          const name = platform?.displayName || platform?.username;
          if (name && !isRawPortalId(name) && !name.startsWith('gh_') && !name.startsWith('go_') && !name.startsWith('tt_')) {
            resolvedDisplayName = name;
            break;
          }
        }
      }
      if (resolvedDisplayName) {
        resolvedUser.displayName = resolvedDisplayName;
        resolvedUser.globalName = resolvedDisplayName;
      }

      const pfpPref = overviewData.preferences?.preferred_pfp_platform;
      let resolvedAvatar = null;
      if (pfpPref === 'default') {
        resolvedAvatar = 'https://wordtycoon.live/portal/img/logo.png';
      } else if (pfpPref) {
        resolvedAvatar = platforms.find((platform) => platform.platform === pfpPref && platform.profilePic)?.profilePic || null;
      }
      if (!resolvedAvatar) {
        for (const platformName of PORTAL_DISPLAY_PRIORITY) {
          const platform = platforms.find((entry) => entry.platform === platformName);
          if (platform?.profilePic) {
            resolvedAvatar = platform.profilePic;
            break;
          }
        }
      }
      if (resolvedAvatar) {
        resolvedUser.avatar = toAbsolutePortalAsset(resolvedAvatar);
      }
    }

    const cosmetics = await getUserCosmetics(accountId);
    if (cosmetics?.preferredDisplayName) {
      resolvedUser.displayName = cosmetics.preferredDisplayName;
      resolvedUser.globalName = cosmetics.preferredDisplayName;
    }
    if (cosmetics?.profilePic) {
      resolvedUser.avatar = toAbsolutePortalAsset(cosmetics.profilePic);
    }
  } catch (error) {
    console.warn('[Portal] Failed to resolve preferred session avatar:', error?.message || error);
  }

  return resolvedUser;
}

async function syncResolvedSessionUser(req, baseUser) {
  const resolvedUser = await buildResolvedSessionUser(baseUser);
  if (!resolvedUser || !baseUser?.id || !req?.session) return resolvedUser;

  req.session.discordUser = {
    ...baseUser,
    tiktokHandle: baseUser.tiktokHandle || null,
    displayName: resolvedUser.displayName || baseUser.displayName,
    globalName: resolvedUser.globalName || baseUser.globalName,
    avatar: resolvedUser.avatar || baseUser.avatar,
    provider: resolvedUser.provider || baseUser.provider
  };

  return req.session.discordUser;
}

const SEARCHLE_PORT = 3015;
const SEARCHLE_URL = `http://localhost:${SEARCHLE_PORT}`;
const SASSIE_RUNTIME_PORT = 3036;
const SASSIE_RUNTIME_URL = `http://localhost:${SASSIE_RUNTIME_PORT}`;

// Fire-and-forget instant Live2D gesture. Coexists with sassie.forwardGameEvent
// (which goes through MVP's LLM scoring + speech). The gesture path bypasses
// the LLM and triggers an immediate expression + motion + scene move on the
// overlay via runtime's SSE channel. Mappings live in
// /opt/word-tycoon/tools/sassie-runtime/src/game-gestures.js.
function forwardGameGesture(game, eventName) {
  if (!game || !eventName) return;
  fetch(`${SASSIE_RUNTIME_URL}/api/runtime/game-gesture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game, eventName }),
  }).catch(() => {});
}
const WIKISEARCHLE_PORT = 3029;
const WIKISEARCHLE_URL = `http://localhost:${WIKISEARCHLE_PORT}`;
const WORD500_URL = process.env.WORD500_URL || 'https://wordtycoon.live/word500';
const WORD500_PORT = 3011;
const WORD500_DIRECT = `http://localhost:${WORD500_PORT}`; // Direct for admin API (avoids nginx loop)
const SPROUTLE_PORT = 3023;
const SPROUTLE_URL = `http://localhost:${SPROUTLE_PORT}`;
const BETWIXT_PORT = 3017;
const BETWIXT_URL = `http://localhost:${BETWIXT_PORT}`;
const WORDLE_PORT = 3014;
const WORDLE_URL = `http://localhost:${WORDLE_PORT}`;
const PIXELETTERS_PORT = 3012;
const PIXELETTERS_URL = `http://localhost:${PIXELETTERS_PORT}`;

const TOP_LIKERS_GAME_LABELS = {
  searchle: 'Subtextle',
  wikisearchle: 'WikiContexto',
  rectangled: 'recTangled',
  erectangled: 'erecTangled',
  sproutle: 'erecTangled',
  betwixt: 'Betwixt',
  wordle: 'Wordle',
  pixeletters: 'PixeLetters',
  figural: 'Figural',
  spellingbee: 'Spelling Bee',
  triangled: 'Triangled',
  // Game ID `word500`, public name Word5000 (word5000.com) — both IDs label the same game.
  word500: 'Word5000',
  word5000: 'Word5000',
};

const TOP_LIKERS_ACTIVE_GAME_TTL_MS = 5_000;
const TOP_LIKERS_STATS_TTL_MS = 60_000;
// Keyed by streamer: the active game is per-streamer once it comes from the
// streamer registry rather than one global stream context.
const topLikersActiveGameCache = new Map(); // streamerId -> { expiresAt, value }
const topLikersStatsCache = new Map();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of topLikersStatsCache.entries()) {
    if (!entry || now - entry.ts > TOP_LIKERS_STATS_TTL_MS * 3) {
      topLikersStatsCache.delete(key);
    }
  }
}, 10 * 60_000);

function getTopLikersGameLabel(gameId) {
  const normalized = String(gameId || '').trim().toLowerCase();
  // TOP_LIKERS_GAME_LABELS first (it uses this overlay's preferred casing, e.g.
  // "recTangled"), then the canonical streamer map, which knows the ids this one
  // never had — searchle-grid, searchle-numbers, colour500, wikirectangled,
  // synapse. Without the fallback those rendered as the raw id on stream.
  // STREAMER_GAME_LABELS is declared further down the file; this only runs
  // per-request, well after module evaluation.
  return TOP_LIKERS_GAME_LABELS[normalized]
    || STREAMER_GAME_LABELS[normalized]
    || normalized
    || null;
}

async function getTopLikersActiveGameInfo(streamerId) {
  const key = String(streamerId || '_global');
  const hit = topLikersActiveGameCache.get(key);
  if (hit && Date.now() < hit.expiresAt) return hit.value;

  let activeGame = null;
  try {
    const upstream = await fetch(`${SASSIE_RUNTIME_URL}/api/runtime/stream-context`);
    const payload = upstream.ok ? await upstream.json() : null;
    activeGame = String(payload?.streamContext?.activeGame || '').trim().toLowerCase() || null;
  } catch { /* runtime down — the fallback below is the point */ }

  // The Sassie runtime on :3036 has been dead for a while, and it was the ONLY
  // source here: the throw left activeGame null, so the overlay showed no game
  // label and getTopLikerGameStats bailed on the empty id. resolveStreamerActiveGame
  // answers the same question from the live TikTok connection and the streamer
  // registry, so Top Likers no longer depends on that process being up.
  if (!activeGame && streamerId) {
    try { activeGame = resolveStreamerActiveGame(streamerId); } catch { /* leave null */ }
  }

  const next = {
    activeGame: activeGame || null,
    activeGameLabel: activeGame ? getTopLikersGameLabel(activeGame) : null
  };

  if (topLikersActiveGameCache.size > 200) topLikersActiveGameCache.clear();
  topLikersActiveGameCache.set(key, {
    expiresAt: Date.now() + TOP_LIKERS_ACTIVE_GAME_TTL_MS,
    value: next
  });
  return next;
}

async function fetchTopLikersWins(identityKey, activeGame) {
  const upstream = await wtFetch(
    `${WORD_EMPIRES_URL}/api/player-game-stats/${encodeURIComponent(identityKey)}?game=${encodeURIComponent(activeGame)}`
  );
  if (!upstream.ok) return 0;
  const payload = await upstream.json();
  return Number(payload?.totalWins || 0);
}

async function fetchTopLikersWikiSearchleStats(identityKey) {
  const upstream = await fetch(`${WIKISEARCHLE_URL}/api/internal/account-stats/${encodeURIComponent(identityKey)}`, {
    headers: { 'x-api-key': WT_API_SECRET }
  });
  if (!upstream.ok) return null;
  return await upstream.json();
}

async function getTopLikerGameStats({ activeGame, activeGameLabel, linkedDiscord, tiktokUserId }) {
  const normalizedGame = String(activeGame || '').trim().toLowerCase();
  if (!normalizedGame) return null;

  const identityKey = String(linkedDiscord || tiktokUserId || '').trim();
  if (!identityKey) return null;

  const cacheKey = `${normalizedGame}:${identityKey}`;
  const cached = topLikersStatsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < TOP_LIKERS_STATS_TTL_MS) {
    return cached.value;
  }

  let wins = 0;
  try {
    wins = await fetchTopLikersWins(identityKey, normalizedGame);
  } catch {}

  const stats = {
    game: normalizedGame,
    gameLabel: activeGameLabel || getTopLikersGameLabel(normalizedGame),
    wins,
    items: [
      { key: 'wins', label: 'Wins', value: wins }
    ]
  };

  if (normalizedGame === 'wikisearchle') {
    try {
      const wikiStats = await fetchTopLikersWikiSearchleStats(identityKey);
      const totalTitleWordsFound = Number(wikiStats?.totalTitleWordsFound || 0);
      stats.totalTitleWordsFound = totalTitleWordsFound;
      stats.items.push({ key: 'titleWordsFound', label: 'Title Words', value: totalTitleWordsFound });
    } catch {
      stats.totalTitleWordsFound = 0;
      stats.items.push({ key: 'titleWordsFound', label: 'Title Words', value: 0 });
    }
  }

  topLikersStatsCache.set(cacheKey, { ts: Date.now(), value: stats });
  return stats;
}

// ─── Live Game State Aggregation ────────────────────────────────────
const LIVE_GAMES = [
  { id: 'wordle', name: 'Wordle', emoji: '🎯', color: '#6aaa64', port: 3014, endpoint: '/api/state', playUrl: '/wordle/online/' },
  { id: 'word500', name: 'Word 500', emoji: '🔤', color: '#4fc34f', port: 3011, endpoint: '/api/state', playUrl: '/game/word500/' },
  { id: 'betwixt', name: 'Betwixt', emoji: '📐', color: '#7b68ee', port: 3017, endpoint: '/api/public-state', playUrl: '/betwixt/online/' },
  { id: 'pixeletters', name: 'PixeLetters', emoji: '🧩', color: '#ff6b9d', port: 3012, endpoint: '/api/game', playUrl: '/pixeletters/online/' },
  { id: 'searchle', name: 'Subtextle', emoji: '🔍', color: '#4a9eff', port: 3015, endpoint: '/api/game/state', playUrl: '/game/searchle/' },
  { id: 'spellingbee', name: 'Spelling Bee', emoji: '🐝', color: '#ffab00', port: 3013, endpoint: '/api/state', playUrl: '/spellingbee/online/' },
  { id: 'rectangled', name: 'recTangled', emoji: '⬛', color: '#e94560', port: 3016, endpoint: '/api/game/state', playUrl: '/game/rectangled/mobile.html' },
  { id: 'erectangled', name: 'erecTangled', emoji: '🟩', color: '#44bb88', port: 3023, endpoint: '/api/game/state', playUrl: '/game/erectangled/mp.html' },
  { id: 'wikirectangled', name: 'WiKirecTangled', emoji: '🌀', color: '#ee7a2c', port: 3031, endpoint: '/api/state', playUrl: '/game/wikirectangled/' },
  { id: 'figural', name: 'Figural', emoji: '🔣', color: '#00f0ff', port: 3019, endpoint: '/api/state', playUrl: '/figural/online/' },
  { id: 'triangled', name: 'Triangled', emoji: '🔺', color: '#ff9100', port: 3024, endpoint: '/api/daily', playUrl: '/game/triangled/' },
];

const WIN_OVERLAY_GAMES = [
  ...LIVE_GAMES.map(game => ({ id: game.id, name: game.name })),
  { id: 'unwordle', name: 'Unwordle' },
  { id: 'wikiword-4x4', name: 'WikiWord 4×4' }
];

function getDefaultWinOverlaySettings() {
  const games = {};
  for (const game of WIN_OVERLAY_GAMES) {
    games[game.id] = { name: game.name, enabled: true };
  }
  return { games };
}

function mergeWinOverlaySettings(base, incoming) {
  const merged = getDefaultWinOverlaySettings();
  const source = incoming && incoming.games ? incoming.games : {};
  const fallback = base && base.games ? base.games : {};
  for (const game of WIN_OVERLAY_GAMES) {
    const legacyId = game.id === 'erectangled' ? 'sproutle' : null;
    const next = source[game.id] || (legacyId ? source[legacyId] : null);
    const prev = fallback[game.id] || (legacyId ? fallback[legacyId] : null);
    merged.games[game.id].enabled = typeof next?.enabled === 'boolean'
      ? next.enabled
      : typeof prev?.enabled === 'boolean'
        ? prev.enabled
        : true;
  }
  return merged;
}

function loadWinOverlaySettings() {
  const defaults = getDefaultWinOverlaySettings();
  try {
    const dir = path.dirname(WIN_OVERLAY_SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(WIN_OVERLAY_SETTINGS_PATH)) {
      fs.writeFileSync(WIN_OVERLAY_SETTINGS_PATH, JSON.stringify(defaults, null, 2));
      return defaults;
    }
    const parsed = JSON.parse(fs.readFileSync(WIN_OVERLAY_SETTINGS_PATH, 'utf-8'));
    const merged = mergeWinOverlaySettings(defaults, parsed);
    fs.writeFileSync(WIN_OVERLAY_SETTINGS_PATH, JSON.stringify(merged, null, 2));
    return merged;
  } catch (err) {
    console.error('[WinOverlay] Failed to load settings:', err.message);
    return defaults;
  }
}

function saveWinOverlaySettings(settings) {
  const dir = path.dirname(WIN_OVERLAY_SETTINGS_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(WIN_OVERLAY_SETTINGS_PATH, JSON.stringify(settings, null, 2));
}

function isWinOverlayEnabled(gameId) {
  if (!gameId) return true;
  return winOverlaySettings.games[gameId]?.enabled !== false;
}

// ─── Win voice announcement (Adam / ElevenLabs) ───────────────────────
// Opt-in per winCard widget (`voiceAnnounce`). Spoken congratulation is
// pushed through the SAME server→client tts-play pipeline as viewer chat
// TTS (room voice-tts:<discordId>), so it plays from whichever wordgame.live
// tab the streamer already hears TTS on (dashboard OR Stream View), via the
// already-unlocked <audio> element. (A client-side `new Audio().play()` in
// the overlay is blocked by the browser autoplay policy — hence routing it
// here instead.) Fires only on streamer-session wins.
//
// Voice announce is a Donor Class+ perk. Free streamers can toggle the
// checkbox in UI but the server will not emit audio unless the streamer has
// an active voice subscription (Donor Class, TikTok Super Fan, or admin).
const DEFAULT_WIN_ANNOUNCE_VOICE_ID = '8QaWQ0Nu8n1UPSV9sMYT'; // ElevenLabs "Shayla"

function _normalizeAnnounceGameId(raw) {
  const g = String(raw || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{1,32}$/.test(g)) return '';
  if (g === 'sproutle') return 'erectangled';
  if (g === 'searchle-grid') return 'searchle';
  return g;
}
function _annName(p) {
  return String((p && (p.displayName || p.username)) || 'Anonymous').trim() || 'Anonymous';
}
function _annPoints(p) {
  const v = p && (p.points != null ? p.points : (p.score != null ? p.score : p.xp));
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
// Allowed win-announcer voices: any ElevenLabs voice, excluding personal
// clones except Shayla (the original default announcer).
function _isAllowedAnnouncerVoice(v) {
  if (!v || v.kind === 'web') return false;
  if (!Array.isArray(v.allowedDiscordIds) || v.allowedDiscordIds.length === 0) return true;
  return v.id === DEFAULT_WIN_ANNOUNCE_VOICE_ID;
}

// Clean-announcer script. Word games (searchle/wikisearchle — any payload
// carrying a target `word`) name the word-finder separately from the top
// scorer, then read the top-3 point totals.
function buildWinAnnounceText(data) {
  const parts = [];
  const word = data.word ? String(data.word).trim() : '';
  const game = _normalizeAnnounceGameId(data.game || data.gameId || '');
  // Who FOUND the word. When the target-finder is a DIFFERENT person from the
  // round winner (Searchle / WikiSearchle / RecTangled), that's
  // data.targetFinder || data.titleFinder — NEVER data.winner, which is the
  // top scorer (bug 2026-07-12: reading data.winner there credited the top
  // scorer with the find). But word-guessing games (Wordle, SpellingBee,
  // WordFall, Figural, …) don't send a separate finder because the winner IS
  // the finder — so fall back to data.winner and speak their word too. This
  // mirrors the win-card OVERLAY, which applies the same fallback (goals-
  // overlay ~4177: no finder + a word ⇒ the winner solved it). The old
  // `word && finder` guard silently dropped the word from every game except
  // the targetFinder ones — that is the gap this closes.
  const finder = data.targetFinder || data.titleFinder || data.winner;
  if (game === 'wikisearchle' && finder) {
    // WikiContexto is about finding the most article words, not a single word.
    parts.push(`Congratulations ${_annName(finder)} for finding the most article words.`);
  } else if (word && finder) {
    parts.push(`${_annName(finder)} found the word, ${word}.`);
  } else if (word) {
    parts.push(`The word was ${word}.`);
  }
  // Who has the MOST POINTS = sort the leaderboard by points descending so the
  // top-3 read is correct no matter what order the payload arrived in (don't
  // assume topPlayers[0] is the highest scorer).
  const top = (Array.isArray(data.topPlayers) ? data.topPlayers.slice() : [])
    .sort((a, b) => _annPoints(b) - _annPoints(a))
    .slice(0, 3);
  if (top.length) {
    // Name the top 3 by rank only — scores are intentionally not read aloud.
    top.forEach((p, i) => {
      if (i === 0) parts.push(`Top scorer, ${_annName(p)}.`);
      else if (i === 1) parts.push(`Second place, ${_annName(p)}.`);
      else parts.push(`Third place, ${_annName(p)}.`);
    });
  } else if (data.winner && !word) {
    // Single-winner, no leaderboard, no word (non-word games). When a word was
    // already spoken above we've named the solver, so don't tack on a
    // redundant "Congratulations {same name}".
    parts.push(`Congratulations ${_annName(data.winner)}.`);
  }
  return parts.join(' ').slice(0, 500);
}
// Return the first matching winCard widget that wants to announce this win,
// or null. Only streamer-scoped wins are announced (public wins are silent).
function winCardVoiceWidget(discordId, data) {
  try {
    const snap = streamerGoals.snapshot(discordId);
    const widgets = (snap && snap.config && snap.config.widgets) || [];
    const evGame = _normalizeAnnounceGameId(data.game || data.gameId || '');
    return widgets.find((w) => {
      if (!w || w.type !== 'winCard' || !w.enabled || !w.voiceAnnounce) return false;
      if (w.scope === 'public') return false; // announce on streamer wins only
      const filter = _normalizeAnnounceGameId(w.displayGame || '');
      if (filter && filter !== evGame) return false;
      return true;
    }) || null;
  } catch (_) { return null; }
}
// Emit the spoken congratulation into the streamer's TTS room (idempotent
// per win; the browser's per-(voice_id,text) MP3 cache makes repeats cheap).
function maybeEmitWinAnnounce(discordId, data) {
  if (!io || !discordId) return;
  // SpellingBee's per-word `winType: 'word'` emits are NOT real wins (they
  // carry a word + a name for the per-word overlay card). winTallies and
  // Sassie already skip them; the announcer must too, or every intermediate
  // word found in a round would be spoken aloud now that a word-only payload
  // triggers a spoken line.
  if (data.winType === 'word') return;
  const widget = winCardVoiceWidget(discordId, data);
  if (!widget) return;

  // Voice announce is Donor Class+ only. Run async checks without blocking
  // the win-payload handler.
  Promise.resolve().then(async () => {
    let access;
    try { access = await getVoiceAccess({ id: discordId }); } catch (_) { access = null; }
    if (!access?.canSaveVoice) return;

    const text = buildWinAnnounceText(data);
    if (!text) return;

    // Resolve the chosen announcer voice, defaulting to Shayla.
    let voiceId = DEFAULT_WIN_ANNOUNCE_VOICE_ID;
    try {
      const catalog = await streamerTtsPipeline._getCatalog();
      const chosen = widget.announcerVoiceId ? catalog.find(v => v.id === widget.announcerVoiceId) : null;
      if (chosen && _isAllowedAnnouncerVoice(chosen)) voiceId = chosen.id;
    } catch (_) {}

    io.to(`voice-tts:${discordId}`).emit('tts-play', {
      mp3Url: `/api/voice/tts?voice_id=${voiceId}&text=${encodeURIComponent(text)}`,
      gain: 1,
      text,
      announcer: true,
      firedAt: Date.now(),
    });
  }).catch(() => {});
}

let cachedLiveState = { games: [], timestamp: 0 };

// ─── Sitemap auto-generation ─────────────────────────────────────────
// Builds /opt/word-tycoon/public/sitemap.xml from the public, canonical
// Word Tycoon pages. Game proxy URLs are intentionally excluded: their
// canonical pages live on their own domains or in the /games catalog.
const SITEMAP_PATH = '/opt/word-tycoon/public/sitemap.xml';
const SITEMAP_HOST = 'https://wordtycoon.live';
const SITEMAP_URLS = [
  '/',
  '/daily',
  '/games',
  '/games/searchle',
  '/games/rectangled',
  '/games/erectangled',
  '/games/word5000',
  '/games/betwixt',
  '/games/pixeletters',
  '/games/figural',
  '/games/spellingbee',
  '/games/wordfall',
  '/how-to-play',
  '/letterworks/',
  '/wordfall/',
  '/word-trails/',
  '/cloudquarry',
  '/synapse',
  '/goat',
  '/privacy',
  '/terms',
];
function generateSitemap() {
  // Do not emit a synthetic lastmod on every restart. False freshness makes
  // the signal useless, and Google ignores changefreq/priority.
  const urls = SITEMAP_URLS.map((loc) => SITEMAP_HOST + loc);
  const body = urls.map((url) =>
    `  <url>\n    <loc>${url}</loc>\n  </url>`
  ).join('\n');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
  try {
    const tmp = SITEMAP_PATH + '.tmp';
    fs.writeFileSync(tmp, xml);
    fs.renameSync(tmp, SITEMAP_PATH);
    console.log(`[Sitemap] Wrote ${urls.length} URLs to ${SITEMAP_PATH}`);
  } catch (e) {
    console.log(`[Sitemap] Failed to write ${SITEMAP_PATH}: ${e.message}`);
  }
}
// Run once at startup. setImmediate defers past the rest of module init
// so any logging order looks natural.
setImmediate(() => { try { generateSitemap(); } catch (e) {} });
let winOverlaySettings = loadWinOverlaySettings();

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
        winner: null, playerCount: 0, isDaily: false, extra: {}, playUrl: cfg.playUrl
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

  if (cfg.id === 'rectangled') {
    base.extra.foundCommonCount = raw.foundCommonCount || 0;
    base.extra.commonCount = raw.commonCount || raw.totalCount || 0;
    base.extra.percentage = raw.percentage || 0;
    base.extra.guessLabel = 'words';
    guesses = raw.foundCommonCount || 0;
  }

  if (cfg.id === 'betwixt') {
    base.extra.confirmedLetters = raw.confirmedLetters || [];
  }


  if (cfg.id === 'sproutle' || cfg.id === 'erectangled') {
    base.extra.foundCommonCount = raw.foundCommonCount || 0;
    base.extra.commonCount = raw.commonCount || 0;
    base.extra.guessLabel = 'words';
    base.extra.gridSize = raw.gridSize || (raw.rows && raw.cols ? raw.rows + 'x' + raw.cols : '');
    base.extra.revealedCells = Array.isArray(raw.revealedCells) ? raw.revealedCells.length : (raw.revealedCells || 0);
    base.extra.totalCells = raw.totalCells || (raw.rows && raw.cols ? raw.rows * raw.cols : 0);
    guesses = typeof raw.wordsFound === "number" ? raw.wordsFound : (Array.isArray(raw.foundWords) ? raw.foundWords.length : 0);
  }

  let playerCount = 0;
  if (typeof raw.playerCount === 'number') playerCount = raw.playerCount;
  else if (typeof raw.playersOnline === 'number') playerCount = raw.playersOnline;
  else if (typeof raw.onlinePlayers === 'number') playerCount = raw.onlinePlayers;
  else if (Array.isArray(raw.topPlayers)) playerCount = raw.topPlayers.length;
  else if (Array.isArray(raw.players)) playerCount = raw.players.length;
  const isDaily = raw.isDaily || false;

  return { ...base, status, guesses, jackpot, elapsed, wordLength, winner, playerCount, isDaily };
}

// JSON parsing (must be before auth so login POST works)
// Skip body parsing for /game/* routes — the proxy needs the raw request stream intact
app.post('/api/stripe/webhook', express.raw({ type: 'application/json' }), proxyStripeWebhook);
app.use((req, res, next) => {
  if (req.path.startsWith('/game/')) return next();
  express.json(req.path === '/api/cloudquarry/score' ? { limit: '512kb' } :
    req.path === '/api/junkdrawer/score' ? { limit: '768kb' } : {})(req, res, next);
});

// ─── Domain redirect: wordtycoon.live:3000 → wordtycoon.live (port 80 via nginx) ───
// Must be before auth so it catches requests before admin redirect kicks in
app.use((req, res, next) => {
  const host = req.hostname;
  if (host === 'www.wordtycoon.live') {
    return res.redirect(301, `https://wordtycoon.live${req.originalUrl}`);
  }
  if (host && host.endsWith('wordtycoon.live') && req.headers.host && req.headers.host.includes(':')) {
    return res.redirect(301, `https://${host}${req.originalUrl}`);
  }
  next();
});

// Standalone game domains — trusted for OAuth redirect + CORS
// ─── Standalone game domains — ONE source of truth ────────────────────────
// Membership here is a trust grant, not a convenience list. Every entry gets
// credentialed CORS (Access-Control-Allow-Origin + Allow-Credentials, below)
// and becomes a legal post-OAuth auth_token redirect target via
// TRUSTED_RETURN_HOSTS. So a host may only appear here while WE control where
// it resolves.
//
// QUARANTINED 2026-07-31 — do NOT re-add until DNS is repointed at render1:
//   word500.ca / www.word500.ca
//   triangled.live / www.triangled.live      (triangled.io is fine — render1)
//   wikiword.live / www.wikiword.live
//     ...all three still A→178.156.171.251, the DELETED Ashburn box. Whoever
//     claims that IP next would inherit read access to any logged-in user's
//     /api/me/* responses, because the portal cookie is SameSite=None.
//   betwixt.live / www.betwixt.live — no A record at all (SOA only).
// Betwixt itself is unaffected: it is served from wordtycoon.live/game/betwixt/.
const TRUSTED_GAME_DOMAINS = [
  'tycoonio.com', 'www.tycoonio.com', 'origin.tycoonio.com',
  'word5000.com', 'www.word5000.com', 'origin.word5000.com', 'live.word5000.com',
  'color500.com', 'www.color500.com',
  'searchle.live', 'www.searchle.live', 'grid.searchle.live', 'origin.searchle.live',
  'subtextle.com', 'www.subtextle.com', 'grid.subtextle.com',
  'triangled.io', 'www.triangled.io',
  'rectangled.live', 'www.rectangled.live', 'origin.rectangled.live',
  'erectangled.com', 'www.erectangled.com', 'origin.erectangled.com',
  'wordgame.live', 'www.wordgame.live', 'origin.wordgame.live',
  'wikisearchle.com', 'www.wikisearchle.com',
  'wikicontexto.com', 'www.wikicontexto.com',
  'wikirectangled.com', 'www.wikirectangled.com', '3d.wikirectangled.com',
  'junkdrawer.live', 'www.junkdrawer.live'
];

// CORS — whitelist known origins for API access. The game domains come straight
// from TRUSTED_GAME_DOMAINS so the two lists can never drift apart again (they
// had: color500 was missing from one, four dead hosts were only in the other).
const CR_ALLOWED_ORIGINS = [
  'http://localhost:3000', 'http://127.0.0.1:3000',
  'https://wordtycoon.live', 'https://www.wordtycoon.live',
  'https://voice.wordtycoon.live',
  'https://hangstream.me', 'https://www.hangstream.me', 'https://play.hangstream.me',
  ...TRUSTED_GAME_DOMAINS.map((h) => 'https://' + h),
  'http://localhost:3033',
  'http://localhost:3010', 'http://localhost:3011', 'http://localhost:3012',
  'http://localhost:3013', 'http://localhost:3014', 'http://localhost:3015',
  'http://localhost:3016', 'http://localhost:3017', 'http://localhost:3018',
  'http://localhost:3019', 'http://localhost:3020', 'http://localhost:3021',
  'http://localhost:3025', 'http://localhost:3030',
  'http://localhost:3035', 'http://localhost:3036'
];
// Public, cookie-free static art: cosmetics, icons, fonts, stylesheets and the
// shared front-end bundles. Every game domain pulls these cross-origin (some
// with crossOrigin="anonymous", which makes them true CORS requests), and they
// are served Cache-Control: public, max-age=14400 through Cloudflare.
//
// Reflecting the request Origin on these breaks CORS through Cloudflare, and it
// does NOT heal on its own. Measured 2026-08-07: CF keeps a separate cached
// variant per Origin, and a variant that revalidates answers 304 — at which
// point CF re-serves its OWN STORED headers and resets the freshness clock. So
// a stale Access-Control-Allow-Origin (or a no-Origin variant carrying none at
// all) is handed back indefinitely, for as long as the file's bytes are
// unchanged. Purging the exact URL did not clear those variants either; it took
// a zone-wide purge. A wildcard is a single variant that is correct for every
// origin, and it is safe precisely because these responses carry no credentials
// — so this branch deliberately does NOT set Allow-Credentials ("*" plus
// credentials is illegal and browsers reject it outright).
const PUBLIC_ASSET_CORS = /^\/(?:cosmetics|icons|fonts|css|js)\/|^\/portal\/img\//;

// (must be before auth so pre-flight OPTIONS requests work)
app.use((req, res, next) => {
  if (PUBLIC_ASSET_CORS.test(req.path)) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    if (req.method === 'OPTIONS') return res.sendStatus(204);
    return next();
  }
  const origin = req.headers.origin;
  if (origin && CR_ALLOWED_ORIGINS.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  }
  // No origin = same-origin or server-to-server — no CORS header needed
  res.header('Access-Control-Allow-Headers', 'Content-Type, x-admin-key, x-api-key, x-relay-auth, x-solo-session-context');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Credentials', 'true');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Security Headers ─────────────────────────────────────────────────
// Hosts in EMBED_FRAME_ANCESTORS may be iframed by the listed parents
// (e.g. play.hangstream.me inside hangstream.me). XFO can't express a
// whitelist, so those hosts get CSP frame-ancestors instead.
const EMBED_FRAME_ANCESTORS = new Set(
  (process.env.EMBED_FRAME_ANCESTORS || 'play.hangstream.me')
    .split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const host = (req.hostname || '').toLowerCase();
  if (EMBED_FRAME_ANCESTORS.has(host)) {
    res.setHeader('Content-Security-Policy',
      "frame-ancestors 'self' https://hangstream.me https://www.hangstream.me");
  } else {
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  }
  res.setHeader('X-XSS-Protection', '0'); // Disabled per OWASP (legacy browser XSS auditors can cause issues)
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const allowCamera = req.path.startsWith('/streamer/');
  res.setHeader('Permissions-Policy', allowCamera
    ? 'camera=(self), microphone=(), geolocation=()'
    : 'camera=(), microphone=(), geolocation=()');
  next();
});

// ─── Site usage tracking ──────────────────────────────────────────────
// Records every HTML page served to a real visitor into daily counters
// (views, unique visitors, referrers) — backs /admin/usage. Server-side so
// no page needs a tracking snippet; only traffic that flows through this
// Express app is counted (nginx-proxied standalone game servers are not).
const USAGE_BOT_RE = /bot|crawl|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegram|skype|headless|lighthouse|pagespeed|pingdom|uptime|monitor|scanner|python-requests|curl|wget/i;
const USAGE_SECRET = process.env.USAGE_SIGNING_SECRET || process.env.SESSION_SECRET || require('crypto').randomBytes(32).toString('hex');
const USAGE_EVENT_LABELS = {
  daily3_challenge_view: new Set(['']),
  daily3_start: new Set(['']),
  daily3_game_complete: new Set(['wordle', 'figural', 'betwixt', 'unwordle', 'word500', 'pixeletters', 'subtextle', 'wikicontexto', 'wikirectangled', 'wikiword4x4']),
  daily3_complete: new Set(['']),
  daily3_share: new Set(['copy', 'native']),
  daily3_sign_in: new Set(['google'])
};
const usageEventRateLimits = new Map();

function usageTrackableHost(host) {
  if (host === 'wordtycoon.live' || host === 'www.wordtycoon.live') return true;
  // Dev/local so the feature is testable without the real domain
  return host === 'localhost' || host === '127.0.0.1';
}

function usageSkipPath(p) {
  return p.startsWith('/api/') || p.startsWith('/admin') || p.startsWith('/socket.io') ||
    p.startsWith('/word-bank') || p.startsWith('/streamer') || p.startsWith('/ad-') ||
    p === '/index.html' || p.includes('overlay') || p === '/favicon.ico' || p === '/health';
}

// Normalize a request path to a stable page key: /me/ and /me/index.html and
// /me.html all count as /me.
function usagePageKey(p) {
  let page = String(p).toLowerCase();
  if (page.endsWith('/index.html')) page = page.slice(0, -'/index.html'.length);
  if (page.endsWith('.html')) page = page.slice(0, -'.html'.length);
  if (page.length > 1 && page.endsWith('/')) page = page.slice(0, -1);
  if (page === '') page = '/';
  return page.slice(0, 120);
}

function usageCampaignToken(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9._~-]/g, '').slice(0, 64);
}

function usageEventAllowed(ip) {
  const now = Date.now();
  const current = usageEventRateLimits.get(ip);
  if (!current || current.resetAt <= now) {
    usageEventRateLimits.set(ip, { count: 1, resetAt: now + 60_000 });
    if (usageEventRateLimits.size > 5000) {
      for (const [key, value] of usageEventRateLimits) {
        if (value.resetAt <= now) usageEventRateLimits.delete(key);
      }
    }
    return true;
  }
  current.count += 1;
  return current.count <= 30;
}

app.use((req, res, next) => {
  if (req.method !== 'GET' || !usageTrackableHost((req.hostname || '').toLowerCase()) ||
      usageSkipPath(req.path)) {
    return next();
  }
  const ua = req.headers['user-agent'] || '';
  if (!ua || USAGE_BOT_RE.test(ua)) return next();

  res.on('finish', () => {
    try {
      const type = res.getHeader('content-type');
      const isHtml200 = res.statusCode === 200 && typeof type === 'string' && type.includes('text/html');
      // 304s carry no content-type — count them when the request was clearly
      // for a page, so returning visitors with warm caches aren't missed.
      const is304Page = res.statusCode === 304 &&
        String(req.headers.accept || '').includes('text/html') &&
        !/\.[a-z0-9]{2,5}$/i.test(req.path.replace(/\.html$/i, ''));
      if (!isHtml200 && !is304Page) return;

      const day = new Date().toISOString().slice(0, 10);
      const visitor = crypto.createHash('sha256')
        .update(`${day}|${req.ip}|${ua}|${USAGE_SECRET}`)
        .digest('hex').slice(0, 16);

      let referrerHost = null;
      const ref = req.headers.referer || req.headers.referrer;
      if (ref) {
        try {
          const host = new URL(ref).hostname.toLowerCase();
          // Self-navigation isn't a referral
          if (host && !host.endsWith('wordtycoon.live') && host !== 'localhost' && host !== '127.0.0.1') {
            referrerHost = host.slice(0, 120);
          }
        } catch { /* malformed referrer — ignore */ }
      }

      db.recordUsageView({ day, page: usagePageKey(req.path), visitor, referrerHost });
    } catch (e) {
      // Tracking must never affect a request
      console.error('[usage] record failed:', e?.message);
    }
  });
  next();
});

// Auth middleware — sessions + admin route protection (must be before static serving)
const sessionMiddleware = auth.initialize(app);

// Share session with Socket.IO (enables identity verification for chat)
io.engine.use(sessionMiddleware);

// ─── Persistent "Remember Me" Token (survives PM2 restarts) ─────────
const crypto = require('crypto');
const REMEMBER_SECRET = process.env.REMEMBER_SESSION_SECRET;
if (typeof REMEMBER_SECRET !== 'string' || !/^[a-f0-9]{64}$/.test(REMEMBER_SECRET)) throw Error('Private remember session credential unavailable');
const REMEMBER_MAX_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days
const REMEMBER_COOKIE = 'wt_remember';

// Cookie scope lives in src/auth.js — this file used to keep a second copy that
// had drifted (no `.wordtycoon.live` suffix match), which left wt_remember
// host-scoped on voice.wordtycoon.live while the session cookie was not.
const getCookieDomainForRequest = auth.getCookieDomainForRequest;

const rememberSessions = require('./src/remember-sessions').createRememberSessions({
  secret: REMEMBER_SECRET, filename: path.join(__dirname, 'data', 'remember-revocations.json'),
  legacySecret: process.env.REMEMBER_LEGACY_SECRET || '', legacyUntil: Number(process.env.REMEMBER_LEGACY_UNTIL || 0)
});
function verifyRememberToken(token) {
  return rememberSessions.verify(token)?.user || null;
}

function parseCookieValue(cookieHeader, name) {
  if (typeof cookieHeader !== 'string' || cookieHeader.length > 16384) return null;
  const match = cookieHeader.split(';').find(function(c) { return c.trim().startsWith(name + '='); });
  try { return match ? decodeURIComponent(match.trim().slice(name.length + 1)) : null; } catch { return null; }
}

function getCookieValue(req, name) {
  return parseCookieValue(req.headers.cookie, name);
}

function setRememberCookie(req, res, user) {
  try {
    let context = req.session.rememberSession;
    if (!context && !req.session.freshRememberLogin) {
      const previous = rememberSessions.verify(getCookieValue(req, REMEMBER_COOKIE));
      if (previous?.user.id === user.id) context = previous.session;
    }
    const maxAge = req.session.rememberDisabled ? Math.min(REMEMBER_MAX_AGE, Date.parse(req.session.cookie?.expires) - Date.now()) : REMEMBER_MAX_AGE;
    const issued = rememberSessions.mint(user, { session: context, maxAge });
    req.session.rememberSession = issued.session;
    delete req.session.freshRememberLogin;
    if (req.session.rememberDisabled) return true;
    const isSecureCookie = !!process.env.DISCORD_OAUTH_REDIRECT_URI && process.env.DISCORD_OAUTH_REDIRECT_URI.startsWith('https://');
    const options = { httpOnly: true, secure: isSecureCookie, sameSite: isSecureCookie ? 'none' : 'lax', maxAge: issued.maxAge, path: '/' };
    const domain = getCookieDomainForRequest(req);
    if (domain) options.domain = domain;
    res.cookie(REMEMBER_COOKIE, issued.token, options);
    return true;
  } catch {
    // A stale asynchronous response must not overwrite a newer login/session.
    req.session = null;
    res.status(503).json({ ok: false, error: 'Authentication retry required' });
    return false;
  }
}

function clearRememberCookie(req, res) {
  const isSecureCookie = !!process.env.DISCORD_OAUTH_REDIRECT_URI && process.env.DISCORD_OAUTH_REDIRECT_URI.startsWith('https://');
  const options = {
    path: '/',
    secure: isSecureCookie,
    sameSite: isSecureCookie ? 'none' : 'lax'
  };
  const domain = getCookieDomainForRequest(req);
  if (domain) options.domain = domain;
  res.clearCookie(REMEMBER_COOKIE, options);
}

// An email address must never surface as a visible name. Google's /userinfo is
// the only provider that can hand us one — Discord, GitHub and TikTok all return
// a handle — and from the session it reaches live chat, the overlays and the
// relay `users` table. Strip any address down to its local part wherever it
// turns up. Kept deliberately narrow: a name only counts as an address if a
// dotted TLD-shaped domain follows the '@', because plenty of legitimate TikTok
// display names carry one ("@Zero", "Im_bl@¢k", "foresthomestaykuching@Podium").
function stripEmailDomain(value) {
  const raw = String(value || '').trim();
  const at = raw.indexOf('@');
  if (at > 0 && /^[^@\s]+\.[a-z]{2,}$/i.test(raw.slice(at + 1))) return raw.slice(0, at);
  return raw;
}

// Restore and revalidate the device family on every portal request.
app.use(function(req, res, next) {
  try {
    const token = getCookieValue(req, REMEMBER_COOKIE), verified = token ? rememberSessions.verify(token) : null;
    if (req.session.discordUser && req.session.rememberSession &&
        !rememberSessions.activeSession(req.session.rememberSession, req.session.discordUser.id)) {
      delete req.session.discordUser; delete req.session.rememberSession;
    }
    if (req.session.discordUser && verified && verified.user.id !== req.session.discordUser.id) {
      delete req.session.discordUser; delete req.session.rememberSession;
    }
    if (!req.session.discordUser && verified) {
      const user = verified.user;
      user.username = stripEmailDomain(user.username); user.globalName = stripEmailDomain(user.globalName);
      req.session.discordUser = user; req.session.rememberSession = verified.session;
      if (!setRememberCookie(req, res, user)) return;
    } else if (req.session.discordUser && !req.session.rememberSession) {
      if (verified) req.session.rememberSession = verified.session;
      else req.session.rememberSession = rememberSessions.mint(req.session.discordUser, {
        maxAge: Math.min(REMEMBER_MAX_AGE, Date.parse(req.session.cookie?.expires) - Date.now())
      }).session;
    }
    next();
  } catch { res.status(503).json({ ok: false, error: 'Authentication retry required' }); }
});

// ─── Cross-origin auth token store (for Searchle at port 3015) ──────
const authHandoffs = require('./src/auth-handoffs').createAuthHandoffs({
  origins: CR_ALLOWED_ORIGINS.filter(origin => origin.startsWith('https:') || process.env.NODE_ENV === 'development'),
  isSessionActive: (session, userId) => rememberSessions.activeSession(session, userId)
});
function generateAuthToken(discordUser, target, req) {
  if (!req.session.rememberSession) {
    const expiry = Date.parse(req.session.cookie?.expires);
    const maxAge = Math.min(REMEMBER_MAX_AGE, expiry - Date.now());
    req.session.rememberSession = rememberSessions.mint(discordUser, { maxAge }).session;
  }
  return authHandoffs.issue(discordUser, target, req.session.rememberSession, { rememberDisabled: req.session.rememberDisabled });
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
  return new Promise((resolve, reject) => {
    const previous = req.session.discordUser;
    const sameAccount = previous?.id === userData.id;
    const context = sameAccount ? req.session.rememberSession : null;
    try {
      if (previous && !sameAccount) rememberSessions.revoke({
        token: getCookieValue(req, REMEMBER_COOKIE), session: req.session.rememberSession, userId: previous.id
      });
    } catch (error) { return reject(error); }
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.discordUser = userData;
      if (context) req.session.rememberSession = context;
      else req.session.freshRememberLogin = true;
      resolve();
    });
  });
}

const OAUTH_TRANSACTION_TTL_MS = 15 * 60 * 1000;
const OAUTH_TRANSACTION_LIMIT = 10;

function pruneOAuthTransactions(transactions) {
  const now = Date.now();
  const list = Array.isArray(transactions) ? transactions : [];
  return list
    .filter((tx) => tx && typeof tx.provider === 'string' && typeof tx.state === 'string' && tx.state.length > 0 && tx.state.length <= 256 && Number.isFinite(tx.createdAt) && tx.createdAt <= now && (now - tx.createdAt) < OAUTH_TRANSACTION_TTL_MS)
    .slice(-OAUTH_TRANSACTION_LIMIT);
}

function queueOAuthTransaction(req, transaction) {
  const transactions = pruneOAuthTransactions(req.session.oauthTransactions);
  transactions.push({
    provider: transaction.provider,
    state: transaction.state,
    returnTo: transaction.returnTo || null,
    linkingFrom: transaction.linkingFrom || null,
    createdAt: Date.now()
  });
  req.session.oauthTransactions = transactions.slice(-OAUTH_TRANSACTION_LIMIT);
}

function consumeOAuthTransaction(req, provider, state) {
  if (typeof state !== 'string' || !state || state.length > 256) return null;
  const transactions = pruneOAuthTransactions(req.session.oauthTransactions);
  const index = transactions.findIndex((tx) => tx.provider === provider && tx.state === state);
  const match = index >= 0 ? transactions.splice(index, 1)[0] : null;
  req.session.oauthTransactions = transactions;
  return match;
}

function saveSession(req) {
  if (!req.session || typeof req.session.save !== 'function') {
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    req.session.save((err) => {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function saveSessionAndRedirect(req, res, targetUrl) {
  res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
  try {
    await saveSession(req);
  } catch (err) {
    req.session = null;
    return res.status(503).json({ ok: false, error: 'Authentication retry required' });
  }
  return res.redirect(targetUrl);
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

// Legal post-OAuth redirect targets (an auth_token rides on the URL, so this is
// the most safety-critical of the three lists). Derived from TRUSTED_GAME_DOMAINS
// plus the WT-owned hosts that aren't game domains — previously hand-maintained,
// which is how origin.* and live.word5000.com ended up trusted to START a login
// but not to RECEIVE one, silently dropping returnTo.
const TRUSTED_RETURN_HOSTS = new Set([
  'wordtycoon.live', 'www.wordtycoon.live', 'voice.wordtycoon.live',
  'hangstream.me', 'www.hangstream.me', 'play.hangstream.me',
  ...TRUSTED_GAME_DOMAINS,
  'localhost', '127.0.0.1'
]);

function extractTrustedReturnUrl(urlString) {
  return authHandoffs.targetUrl(urlString)?.toString() || null;
}

const AUTH_HUB_ORIGIN = 'https://wordtycoon.live';

// When /auth/<provider> is reached on a standalone game domain, the OAuth
// callback will land on the hub — a different origin, and therefore a different
// session, because the portal cookie is host-scoped everywhere except
// *.wordtycoon.live. Anything we stash now (state, returnTo, linkingFrom) is
// invisible to the callback. So don't start the flow here: hand it to the hub
// with an absolute returnTo and let it come back with an auth_token.
//
// Returns the URL to redirect to, or null when this is not a standalone host.
function standaloneAuthRedirect(req, provider) {
  const reqHost = String(req.hostname || '').toLowerCase();
  if (!TRUSTED_GAME_DOMAINS.includes(reqHost)) return null;

  // Account linking is only ever initiated from /me on the hub, and it needs the
  // logged-in hub session to build linkingFrom. If it somehow arrives here, leave
  // it alone rather than silently downgrading a link attempt into a plain login.
  if (req.query.action === 'link') return null;

  let returnTo = req.query.returnTo || '/';
  if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
    const scheme = (reqHost === 'localhost' || reqHost === '127.0.0.1') ? req.protocol : 'https';
    returnTo = scheme + '://' + reqHost + returnTo;
  }

  // Discord keeps the extra sso-check hop: that endpoint short-circuits when a
  // hub session already exists, minting an auth_token with no provider
  // round-trip at all. The other providers have no such endpoint, so they go
  // straight to the hub's own /auth/<provider>.
  const target = provider === 'discord'
    ? `${AUTH_HUB_ORIGIN}/api/auth/sso-check?returnTo=`
    : `${AUTH_HUB_ORIGIN}/auth/${provider}?returnTo=`;
  return target + encodeURIComponent(returnTo);
}

app.get('/auth/discord', async (req, res) => {
  if (!discordOAuth.isConfigured()) {
    return res.status(500).send('Discord OAuth not configured');
  }

  const standalone = standaloneAuthRedirect(req, 'discord');
  if (standalone) {
    console.log(`[OAuth] Standalone domain ${req.hostname} → hub (discord)`);
    return res.redirect(standalone);
  }

  // If the browser already has a restored session, avoid starting a second
  // OAuth flow just because the UI still showed the login button.
  if (req.session?.discordUser) {
    let returnTo = req.query.returnTo || null;
    if (!returnTo) {
      const referer = req.get('Referer');
      const refPath = extractSameOriginPath(referer, req.hostname);
      if (refPath && !refPath.startsWith('/auth/')) {
        returnTo = refPath;
      }
    }

    const sessionUser = await syncResolvedSessionUser(req, req.session.discordUser);
    const user = sessionUser || req.session.discordUser;
    if (!setRememberCookie(req, res, user)) return;

    if (returnTo) {
      if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        console.log(`[OAuth] Existing session short-circuit (${user.username} → ${returnTo})`);
        return saveSessionAndRedirect(req, res, returnTo);
      }
      const trustedReturnUrl = extractTrustedReturnUrl(returnTo);
      if (trustedReturnUrl) {
        const token = generateAuthToken(user, trustedReturnUrl, req);
        return saveSessionAndRedirect(req, res, authHandoffs.appendToken(trustedReturnUrl, token));
      }
    }

    console.log(`[OAuth] Existing session short-circuit (${user.username} → /me)`);
    return saveSessionAndRedirect(req, res, '/');
  }

  delete req.session.oauthReturnTo;
  delete req.session.linkingFrom;

  // (github→discord account linking removed 2026-07-19 — gh_/go_ ids are
  // standalone WT accounts now; Discord linking is no longer offered to them.)
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

  const state = discordOAuth.generateState();
  req.session.oauthState = state;
  queueOAuthTransaction(req, {
    provider: 'discord',
    state,
    returnTo: req.session.oauthReturnTo || null,
    linkingFrom: null
  });
  console.log(`[OAuth] Initiating Discord login (returnTo: ${req.session.oauthReturnTo || '/'})`);
  return saveSessionAndRedirect(req, res, discordOAuth.getAuthUrl(state));
});

app.get('/auth/discord/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const transaction = consumeOAuthTransaction(req, 'discord', state);
  const returnTo = transaction?.returnTo || null;
  const linkingFrom = transaction?.linkingFrom || null;
  delete req.session.oauthReturnTo;
  delete req.session.oauthState;
  delete req.session.linkingFrom;
  const safePath = extractSameOriginPath(returnTo, req.hostname);

  // Only the single-use, provider-bound transaction authorizes a callback.
  // A restarted/lost session must start again rather than exchange an unbound code.
  if (!transaction || (linkingFrom && (linkingFrom.id !== req.session.discordUser?.id ||
      (linkingFrom.provider || 'discord') !== (req.session.discordUser?.provider || 'discord')))) {
    await saveSession(req).catch(() => {});
    return res.redirect('/profile?error=invalid_state');
  }
  try { await saveSession(req); } catch {
    return res.status(503).send('Sign-in could not be confirmed. Please start again.');
  }
  if (error || typeof code !== 'string' || !code || code.length > 4096) {
    return res.redirect(safePath || '/profile?error=denied');
  }

  try {
    const tokens = await discordOAuth.exchangeCode(code);
    const user = await discordOAuth.getUser(tokens.access_token);
    const discordUser = {
      id: user.id,
      username: user.username,
      globalName: user.global_name || user.username,
      avatar: user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : null,
      provider: 'discord'
    };

    // ── Auto-link TikTok/YouTube/Twitch from Discord connections ──
    try {
      const connections = await discordOAuth.getConnections(tokens.access_token);
      await autoLinkConnections(user.id, user.username, connections);
    } catch (e) {
      console.log('[Link] Discord connections auto-link failed (non-fatal):', e.message);
    }

    // ── Normal Discord login ──
    await regenerateSessionAndSet(req, discordUser);
    console.log(`[OAuth] Discord login: ${user.username} (${user.id}) → ${returnTo || '/'}`);

    // Set persistent "remember me" cookie (survives PM2 restarts)
    if (!setRememberCookie(req, res, discordUser)) return;

    if (returnTo) {
      if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        return saveSessionAndRedirect(req, res, returnTo);
      }
      const trustedReturnUrl = extractTrustedReturnUrl(returnTo);
      if (trustedReturnUrl) {
        const token = generateAuthToken(discordUser, trustedReturnUrl, req);
        return saveSessionAndRedirect(req, res, authHandoffs.appendToken(trustedReturnUrl, token));
      }
      console.warn(`[OAuth] Blocked external returnTo: ${returnTo}`);
    }

    return saveSessionAndRedirect(req, res, '/');
  } catch (err) {
    console.error('[OAuth] Discord callback error:', err.message);
    await saveSession(req).catch(() => {});
    res.redirect(safePath || '/?error=auth_failed');
  }
});

// ─── GitHub OAuth ──────────────────────────────────────────────────
app.get('/auth/github', (req, res) => {
  if (!githubOAuth.isConfigured()) {
    return res.status(500).send('GitHub OAuth not configured');
  }

  const standalone = standaloneAuthRedirect(req, 'github');
  if (standalone) {
    console.log(`[OAuth] Standalone domain ${req.hostname} → hub (github)`);
    return res.redirect(standalone);
  }

  delete req.session.oauthReturnTo;
  delete req.session.linkingFrom;

  // Account linking: if ?action=link and user is already logged in, save linking state
  let linkingFrom = null;
  if (req.query.action === 'link' && req.session.discordUser) {
    linkingFrom = { ...req.session.discordUser };
    req.session.oauthReturnTo = '/profile?linked=success';
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
  req.session.linkingFrom = linkingFrom;
  queueOAuthTransaction(req, {
    provider: 'github',
    state,
    returnTo: req.session.oauthReturnTo || null,
    linkingFrom
  });
  console.log(`[OAuth] Initiating GitHub login (returnTo: ${req.session.oauthReturnTo || '/'})`);
  return saveSessionAndRedirect(req, res, githubOAuth.getAuthUrl(state));
});

app.get('/auth/github/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const transaction = consumeOAuthTransaction(req, 'github', state);
  const returnTo = transaction?.returnTo || null;
  const linkingFrom = transaction?.linkingFrom || null;
  delete req.session.oauthReturnTo;
  delete req.session.oauthState;
  delete req.session.linkingFrom;
  const safePath = extractSameOriginPath(returnTo, req.hostname);

  // Only the single-use, provider-bound transaction authorizes a callback.
  // A restarted/lost session must start again rather than exchange an unbound code.
  if (!transaction || (linkingFrom && (linkingFrom.id !== req.session.discordUser?.id ||
      (linkingFrom.provider || 'discord') !== (req.session.discordUser?.provider || 'discord')))) {
    await saveSession(req).catch(() => {});
    return res.redirect('/profile?error=invalid_state');
  }
  try { await saveSession(req); } catch {
    return res.status(503).send('Sign-in could not be confirmed. Please start again.');
  }
  if (error || typeof code !== 'string' || !code || code.length > 4096) {
    return res.redirect(safePath || '/profile?error=denied');
  }

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
    if (linkingFrom && linkingFrom.provider === 'discord') {
      // Discord user is linking GitHub → Discord stays the anchor
      const discordId = linkingFrom.id;
      const githubPlatformId = 'gh_' + user.id;

      // Check if this GitHub account is already linked to a different Discord user
      const conflict = await checkLinkConflict('github', githubPlatformId, discordId);
      if (conflict.conflict) {
        console.log(`[Link] Conflict: GitHub ${githubPlatformId} already linked to Discord ${conflict.existingDiscordId}`);
        return saveSessionAndRedirect(req, res, '/profile?error=already_linked');
      }

      // Create the link (Discord anchor ↔ GitHub platform)
      await createAccountLink(discordId, 'github', githubPlatformId);

      // Keep session as Discord (already the anchor)
      await regenerateSessionAndSet(req, linkingFrom);
      if (!setRememberCookie(req, res, linkingFrom)) return;

      // Refresh relay linked-groups cache
      try { relay.refreshLinkedCache(); } catch (e) {}

      console.log(`[Link] Success: Discord ${discordId} → GitHub ${githubPlatformId}`);
      return saveSessionAndRedirect(req, res, '/profile?linked=success');
    }

    // ── Normal GitHub login ──
    await regenerateSessionAndSet(req, githubUser);
    console.log(`[OAuth] GitHub login: ${githubUser.username} (${user.id}) → ${returnTo || '/'}`);

    if (!setRememberCookie(req, res, githubUser)) return;

    if (returnTo) {
      if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        return saveSessionAndRedirect(req, res, returnTo);
      }
      const trustedReturnUrl = extractTrustedReturnUrl(returnTo);
      if (trustedReturnUrl) {
        const token = generateAuthToken(githubUser, trustedReturnUrl, req);
        return saveSessionAndRedirect(req, res, authHandoffs.appendToken(trustedReturnUrl, token));
      }
      console.warn(`[OAuth] Blocked external returnTo: ${returnTo}`);
    }

    return saveSessionAndRedirect(req, res, '/');
  } catch (err) {
    console.error('[OAuth] GitHub callback error:', err.message);
    await saveSession(req).catch(() => {});
    res.redirect(safePath || '/?error=auth_failed');
  }
});

// ─── Google OAuth ──────────────────────────────────────────────────
// Phase 1: login-only. Account-linking (action=link, linkingFrom branches in
// other callbacks) is intentionally deferred until WT confirms platform=google
// is accepted by the account-link API.
app.get('/auth/google', (req, res) => {
  if (!googleOAuth.isConfigured()) {
    return res.status(500).send('Google OAuth not configured');
  }

  const standalone = standaloneAuthRedirect(req, 'google');
  if (standalone) {
    console.log(`[OAuth] Standalone domain ${req.hostname} → hub (google)`);
    return res.redirect(standalone);
  }

  delete req.session.oauthReturnTo;
  delete req.session.linkingFrom;

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

  const state = googleOAuth.generateState();
  req.session.oauthState = state;
  queueOAuthTransaction(req, {
    provider: 'google',
    state,
    returnTo: req.session.oauthReturnTo || null,
    linkingFrom: null
  });
  console.log(`[OAuth] Initiating Google login (returnTo: ${req.session.oauthReturnTo || '/'})`);
  return saveSessionAndRedirect(req, res, googleOAuth.getAuthUrl(state));
});

app.get('/auth/google/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const transaction = consumeOAuthTransaction(req, 'google', state);
  const returnTo = transaction?.returnTo || null;
  const linkingFrom = transaction?.linkingFrom || null;
  delete req.session.oauthReturnTo;
  delete req.session.oauthState;
  delete req.session.linkingFrom;
  const safePath = extractSameOriginPath(returnTo, req.hostname);

  // Only the single-use, provider-bound transaction authorizes a callback.
  // A restarted/lost session must start again rather than exchange an unbound code.
  if (!transaction || (linkingFrom && (linkingFrom.id !== req.session.discordUser?.id ||
      (linkingFrom.provider || 'discord') !== (req.session.discordUser?.provider || 'discord')))) {
    await saveSession(req).catch(() => {});
    return res.redirect('/profile?error=invalid_state');
  }
  try { await saveSession(req); } catch {
    return res.status(503).send('Sign-in could not be confirmed. Please start again.');
  }
  if (error || typeof code !== 'string' || !code || code.length > 4096) {
    return res.redirect(safePath || '/profile?error=denied');
  }

  try {
    const tokens = await googleOAuth.exchangeCode(code);
    const user = await googleOAuth.getUser(tokens.access_token);
    // Google /userinfo returns `sub` (stable user id), `email`, `name`, `picture`.
    // `email` is NOT a username — it used to be assigned here and leaked into
    // live chat. Mirror the other providers instead: a handle in `username`
    // (GitHub uses `login`), the human name in `globalName`.
    const googleHandle = stripEmailDomain(user.email) || ('google_' + user.sub);
    const googleUser = {
      id: 'go_' + user.sub,
      username: googleHandle,
      globalName: stripEmailDomain(user.name) || googleHandle,
      avatar: user.picture || null,
      provider: 'google'
    };

    await regenerateSessionAndSet(req, googleUser);
    console.log(`[OAuth] Google login: ${googleUser.username} (${user.sub}) → ${returnTo || '/'}`);

    if (!setRememberCookie(req, res, googleUser)) return;

    if (returnTo) {
      if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        return saveSessionAndRedirect(req, res, returnTo);
      }
      const trustedReturnUrl = extractTrustedReturnUrl(returnTo);
      if (trustedReturnUrl) {
        const token = generateAuthToken(googleUser, trustedReturnUrl, req);
        return saveSessionAndRedirect(req, res, authHandoffs.appendToken(trustedReturnUrl, token));
      }
      console.warn(`[OAuth] Blocked external returnTo: ${returnTo}`);
    }

    return saveSessionAndRedirect(req, res, '/');
  } catch (err) {
    console.error('[OAuth] Google callback error:', err.message);
    await saveSession(req).catch(() => {});
    res.redirect(safePath || '/?error=auth_failed');
  }
});

// ─── TikTok OAuth ──────────────────────────────────────────────────────────

app.get('/auth/tiktok', (req, res) => {
  if (!tiktokOAuth.isConfigured()) {
    return res.status(500).send('TikTok OAuth not configured');
  }

  const standalone = standaloneAuthRedirect(req, 'tiktok');
  if (standalone) {
    console.log(`[OAuth] Standalone domain ${req.hostname} → hub (tiktok)`);
    return res.redirect(standalone);
  }

  delete req.session.oauthReturnTo;
  delete req.session.linkingFrom;

  let linkingFrom = null;
  if (req.query.action === 'link' && req.session.discordUser) {
    linkingFrom = { ...req.session.discordUser };
    req.session.oauthReturnTo = '/profile?linked=success';
    console.log(`[Link] ${req.session.discordUser.username} initiating TikTok link (from ${req.session.discordUser.provider})`);
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

  const state = tiktokOAuth.generateState();
  req.session.oauthState = state;
  req.session.linkingFrom = linkingFrom;
  queueOAuthTransaction(req, {
    provider: 'tiktok',
    state,
    returnTo: req.session.oauthReturnTo || null,
    linkingFrom
  });
  console.log(`[OAuth] Initiating TikTok login (returnTo: ${req.session.oauthReturnTo || '/'})`);
  return saveSessionAndRedirect(req, res, tiktokOAuth.getAuthUrl(state));
});

app.get('/auth/tiktok/callback', async (req, res) => {
  const { code, state, error } = req.query;
  const transaction = consumeOAuthTransaction(req, 'tiktok', state);
  const returnTo = transaction?.returnTo || null;
  const linkingFrom = transaction?.linkingFrom || null;
  delete req.session.oauthReturnTo;
  delete req.session.oauthState;
  delete req.session.linkingFrom;
  const safePath = extractSameOriginPath(returnTo, req.hostname);

  // Only the single-use, provider-bound transaction authorizes a callback.
  // A restarted/lost session must start again rather than exchange an unbound code.
  if (!transaction || (linkingFrom && (linkingFrom.id !== req.session.discordUser?.id ||
      (linkingFrom.provider || 'discord') !== (req.session.discordUser?.provider || 'discord')))) {
    await saveSession(req).catch(() => {});
    return res.redirect('/profile?error=invalid_state');
  }
  try { await saveSession(req); } catch {
    return res.status(503).send('Sign-in could not be confirmed. Please start again.');
  }
  if (error || typeof code !== 'string' || !code || code.length > 4096) {
    return res.redirect(safePath || '/profile?error=denied');
  }

  try {
    const tokenData = await tiktokOAuth.exchangeCode(code);
    const accessToken = tokenData.access_token;
    const openId = tokenData.open_id;
    const user = await tiktokOAuth.getUser(accessToken);

    const tiktokUser = {
      id: 'tt_' + (user.open_id || openId),
      username: user.display_name || user.username || 'TikTok User',
      globalName: user.display_name || user.username || 'TikTok User',
      avatar: user.avatar_url || null,
      provider: 'tiktok',
      // The @handle, kept separate from the display name. This is the key the
      // rest of the system files TikTok users under (chat, superfans,
      // autoLinkConnections), so without it a web login is unresolvable.
      tiktokHandle: user.username ? String(user.username).toLowerCase() : null
    };

    // ── Account linking ──
    if (linkingFrom) {
      // Write every key this person can later arrive under: the @handle (what
      // chat, superfans and autoLinkConnections use) AND tt_<open_id> (what a
      // TikTok web login presents). Linking only one of them is why TikTok web
      // logins never resolved before 2026-07-31.
      const tiktokKeys = [...new Set([
        tiktokUser.tiktokHandle,
        tiktokUser.id
      ].filter(Boolean))];
      // Only Discord-anchored sessions may create TikTok links; standalone
      // web accounts (gh_/go_) have no Discord anchor to link against.
      if (linkingFrom.provider === 'discord' || (!linkingFrom.id.startsWith('gh_') && !linkingFrom.id.startsWith('go_') && !linkingFrom.id.startsWith('tt_'))) {
        const discordId = linkingFrom.id;
        for (const key of tiktokKeys) {
          const conflict = await checkLinkConflict('tiktok', key, discordId);
          if (conflict.conflict) {
            console.warn(`[Link] TikTok ${key} already linked to ${conflict.existingDiscordId}`);
            return res.redirect('/profile?error=already_linked');
          }
        }
        for (const key of tiktokKeys) {
          await createAccountLink(discordId, 'tiktok', key);
        }
        console.log(`[Link] Linked TikTok [${tiktokKeys.join(', ')}] to Discord ${discordId}`);
        if (!setRememberCookie(req, res, linkingFrom)) return;
        relay.refreshLinkedCache();
        return saveSessionAndRedirect(req, res, '/profile?linked=success');
      }
    }

    // ── Normal login ──
    await regenerateSessionAndSet(req, tiktokUser);
    const sessionUser = await syncResolvedSessionUser(req, tiktokUser);
    if (!setRememberCookie(req, res, sessionUser || tiktokUser)) return;

    if (returnTo) {
      if (returnTo.startsWith('/') && !returnTo.startsWith('//')) {
        console.log(`[OAuth] TikTok login → ${tiktokUser.username} → ${returnTo}`);
        return saveSessionAndRedirect(req, res, returnTo);
      }
      const trustedReturnUrl = extractTrustedReturnUrl(returnTo);
      if (trustedReturnUrl) {
        const token = generateAuthToken(sessionUser || tiktokUser, trustedReturnUrl, req);
        return saveSessionAndRedirect(req, res, authHandoffs.appendToken(trustedReturnUrl, token));
      }
    }

    console.log(`[OAuth] TikTok login → ${tiktokUser.username} → /me`);
    return saveSessionAndRedirect(req, res, '/');
  } catch (err) {
    console.error('[OAuth] TikTok callback error:', err.message);
    return res.redirect('/?error=tiktok_failed');
  }
});

// ─── Word Bank API ──
wordBank.registerRoutes(app, { hasInternalApiKey });

// ─── Junk Drawer (junkdrawer.live) scores + leaderboard ──
const { createHostedRewardDelivery } = require('./src/hosted-reward-delivery');
const hostedRewards = createHostedRewardDelivery({ directory: path.join(__dirname, 'data', 'hosted-reward-outbox'),
  db, baseUrl: WORD_EMPIRES_URL, apiSecret: WT_API_SECRET, request: wtFetch });

junkdrawer.registerRoutes(app, {
  hostedRewards,
  db,
  wtFetch,
  WORD_EMPIRES_URL,
  WT_API_SECRET,
  getCurrentWordTycoonAccountId,
});

// ─── Cloud Quarry — 2D destruction/incremental daily challenge ──
cloudquarry.registerRoutes(app, {
  hostedRewards,
  db,
  wtFetch,
  WORD_EMPIRES_URL,
  WT_API_SECRET,
  getCurrentWordTycoonAccountId,
});

// ─── Synapse (wordtycoon.live/synapse) — semantic bridge game ──
const synapseCore = synapse.registerRoutes(app, {
  hostedRewards,
  db,
  wtFetch,
  WORD_EMPIRES_URL,
  WT_API_SECRET,
  getCurrentWordTycoonAccountId,
  wordBank,
  SEARCHLE_URL,
});

// Synapse Multiplayer arena (real-time "first to connect" race) — reuses the
// SP similarity client + pair resolver via synapseCore, races on io.
synapseMp.registerSynapseMp(app, io, {
  fetchSims: synapseCore.fetchSims,
  resolvePair: synapseCore.resolvePair,
  wordBank,
  wtFetch,
  WORD_EMPIRES_URL,
  WT_API_SECRET,
  getCurrentWordTycoonAccountId,
});

// Synapse MP — TikTok/wordgame.live streamer variant: one arena per streamer,
// fed by chat via the relay sink (streamer selects Synapse as their game).
const synapseStreamer = synapseMp.registerSynapseStreamer(io, {
  fetchSims: synapseCore.fetchSims,
  resolvePair: synapseCore.resolvePair,
  wordBank,
});
relay.setSynapseChatSink(synapseStreamer.handleChat);

const letterworksManager = letterworks.registerRoutes(app, {
  db, wtFetch, WORD_EMPIRES_URL, WT_API_SECRET, getCurrentWordTycoonAccountId, streamers,
  onDailyWin: (userId, date) => withFileLock(SP_DAILY_FILE, () => {
    const data = loadDailyCompletions();
    const users = data['letterworks-sp'] ||= {};
    users[userId] ||= [];
    if (!users[userId].includes(date)) users[userId] = [...users[userId], date].slice(-90);
    saveDailyCompletions(data);
  }),
  isStreamActive: (id) => {
    const s = streamers.get(id);
    return !!s && !streamers.isSessionDisabled(id) && getStreamerAdvertisedGameIds(s).includes('letterworks');
  },
  onStreamRound: (id) => gameVote.noteRound(id, 'letterworks'),
  onStreamWin: (id, first, ranked, state) => {
    const streamer = streamers.get(id); if (!streamer) return;
    const player = p => ({ ...p, id: p.userId, platformUserId: p.userId });
    const data = { game: 'letterworks', gameName: 'Letterworks', winType: 'mp-win',
      streamerHandle: streamer.handle, winner: player(first), topPlayers: ranked.slice(0, 10).map(player),
      score: state.runScore, word: 'WORKSHOP SAVED', timestamp: Date.now() };
    winTallies.recordWin({ streamerId: id, game: data.game, gameName: data.gameName, winner: data.winner });
    gameVote.noteWinCard(id);
    io.to(`goals:${id}`).emit('game-win', { ...data, winTally: winTallies.snapshotForWin(id, data.game) });
    io.to(`streamer-win:${streamer.handle}`).emit('game-win', data);
    maybeEmitWinAnnounce(id, data);
  },
});
relay.setLetterworksChatSink(letterworksManager.handleChat);

const wordfallManager = wordfall.registerRoutes(app, {
  db, wordBank, wtFetch, WORD_EMPIRES_URL, WT_API_SECRET, getCurrentWordTycoonAccountId, streamers,
  onDailyWin: (userId, day) => withFileLock(SP_DAILY_FILE, () => {
    const data = loadDailyCompletions();
    const users = data['wordfall-sp'] ||= {};
    users[userId] ||= [];
    if (!users[userId].includes(day)) users[userId] = [...users[userId], day].slice(-90);
    saveDailyCompletions(data);
  }),
  isStreamActive: (id) => {
    const s = streamers.get(id);
    return !!s && !streamers.isSessionDisabled(id) && getStreamerAdvertisedGameIds(s).includes('wordfall');
  },
  onStreamRound: (id) => gameVote.noteRound(id, 'wordfall'),
  onStreamWin: (id, first, ranked, state) => {
    const streamer = streamers.get(id); if (!streamer) return;
    const player = p => ({ ...p, id: p.userId, platformUserId: p.userId });
    const data = { game: 'wordfall', gameName: 'Wordfall', winType: 'mp-win',
      streamerHandle: streamer.handle, winner: player(first), topPlayers: ranked.slice(0, 10).map(player),
      score: first.score, word: 'SHARED BOARD', timestamp: Date.now() };
    winTallies.recordWin({ streamerId: id, game: data.game, gameName: data.gameName, winner: data.winner });
    gameVote.noteWinCard(id);
    io.to(`goals:${id}`).emit('game-win', { ...data, winTally: winTallies.snapshotForWin(id, data.game) });
    io.to(`streamer-win:${streamer.handle}`).emit('game-win', data);
    maybeEmitWinAnnounce(id, data);
  },
});
relay.setWordfallChatSink(wordfallManager.handleChat);

// ─── Token exchange (cross-origin apps call this to get user data) ──
app.get('/api/auth/exchange', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.set('Referrer-Policy', 'no-referrer');
  const origin = req.headers.origin || `${req.protocol}://${req.get('host')}`;
  const entry = authHandoffs.take(req.query.token, origin);
  if (!entry) return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
  try {
    const previous = req.session?.rememberSession, previousUser = req.session?.discordUser;
    if (previous && previousUser?.id === entry.user.id && previous.sid !== entry.session.sid) {
      rememberSessions.revoke({ session: previous, userId: previousUser.id });
    }
    await regenerateSessionAndSet(req, entry.user);
    req.session.rememberSession = entry.session;
    req.session.rememberDisabled = entry.rememberDisabled;
    delete req.session.freshRememberLogin;
    const sessionUser = await syncResolvedSessionUser(req, entry.user);
    if (!rememberSessions.activeSession(entry.session, entry.user.id)) {
      req.session = null;
      return res.status(401).json({ ok: false, error: 'Invalid or expired token' });
    }
    if (!setRememberCookie(req, res, sessionUser || entry.user)) return;
    await saveSession(req);
    res.json({ ok: true, user: sessionUser || entry.user });
  } catch {
    req.session = null;
    res.status(503).json({ ok: false, error: 'Authentication retry required' });
  }
});
// ─── Silent SSO check — standalone domains auto-bridge wordtycoon.live session ──
const SSO_ALLOWED_HOSTS = TRUSTED_RETURN_HOSTS;
app.get('/api/auth/sso-check', (req, res) => {
  res.set('Cache-Control', 'no-store'); res.set('Referrer-Policy', 'no-referrer');
  const returnTo = extractTrustedReturnUrl(req.query.returnTo);
  if (!returnTo) return res.redirect('/');
  if (req.session?.discordUser) {
    try {
      const token = generateAuthToken(req.session.discordUser, returnTo, req);
      return saveSessionAndRedirect(req, res, authHandoffs.appendToken(returnTo, token));
    } catch { return res.status(503).json({ ok: false, error: 'Authentication retry required' }); }
  }
  res.redirect('/auth/discord?returnTo=' + encodeURIComponent(returnTo));
});
// ─── User Portal API ────────────────────────────────────────────────
app.get('/api/me/session', async (req, res) => {
  if (!req.session.discordUser) {
    return res.json({ ok: false });
  }

  const sessionUser = await syncResolvedSessionUser(req, req.session.discordUser);
  const u = sessionUser || req.session.discordUser;
  const accountId = await getCurrentWordTycoonAccountId(u);
  if (!setRememberCookie(req, res, u)) return;
  res.json({
    ok: true,
    user: {
      id: u.id,
      anchorId: accountId,
      username: u.username,
      displayName: u.displayName,
      globalName: u.globalName || u.displayName || u.username,
      avatar: u.avatar,
      discriminator: u.discriminator,
      provider: u.provider || 'discord'
    }
  });
});

function allowedSessionMutation(req) {
  const origin = req.headers.origin;
  return typeof origin === 'string' && CR_ALLOWED_ORIGINS.includes(origin) &&
    (origin.startsWith('https:') || process.env.NODE_ENV === 'development');
}
app.post('/api/me/logout', (req, res) => {
  if (!allowedSessionMutation(req)) return res.status(403).json({ ok: false, error: 'origin_required' });
  try {
    rememberSessions.revoke({ token: getCookieValue(req, REMEMBER_COOKIE),
      session: req.session.rememberSession, userId: req.session.discordUser?.id });
    delete req.session.discordUser;
    delete req.session.rememberSession;
    clearRememberCookie(req, res);
    req.session.save(error => {
      if (error) return res.status(503).json({ ok: false, error: 'logout_retry' });
      res.json({ ok: true });
    });
  } catch { res.status(503).json({ ok: false, error: 'logout_retry' }); }
});
// Persistent avatar proxy: TikTok signed avatar URLs expire (~14 days), so
// any consumer that stores the raw URL eventually shows a broken image. We
// cache the bytes once and serve them from a stable URL keyed by userId.
// See src/avatar-cache.js for the full strategy.
app.get('/api/avatar/:platform/:userId', (req, res) => {
  avatarCache.handleRequest(req, res).catch(() => {
    res.redirect(302, avatarCache.FALLBACK_PATH);
  });
});

// Lightweight equipped-cosmetics fetch for game pages (e.g. WikiSearchle solo)
// that need to render the current user's cosmetics on cards without going
// through the chat-message enrichment path. Returns the same shape the
// chat-message enrichment attaches: { equipped }.
app.get('/api/me/equipped-cosmetics', async (req, res) => {
  try {
    const sessionUser = req.session.discordUser;
    if (!sessionUser) return res.json({ ok: true, equipped: null });
    const accountId = await getCurrentWordTycoonAccountId(sessionUser);
    if (!accountId) return res.json({ ok: true, equipped: null });
    const cos = await getUserCosmetics(accountId);
    res.json({ ok: true, equipped: (cos && cos.equipped) || null });
  } catch (e) {
    res.json({ ok: true, equipped: null });
  }
});

app.get('/api/tycoon/overview', auth.requireUser, async (req, res) => {
  try {
    const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const sessionUser = await syncResolvedSessionUser(req, req.session.discordUser);
    const user = sessionUser || req.session.discordUser;
    const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${discordId}`);
    const data = await upstream.json();
    if (!data?.ok) {
      return res.status(502).json({ ok: false, error: 'Failed to load tycoon overview' });
    }

    const cards = buildTycoonBusinessCards(data);
    const activeBuffs = Array.isArray(data.incomePerSecond?.activeBuffs)
      ? data.incomePerSecond.activeBuffs.filter((entry) => Number(entry?.value) > 0)
      : [];
    const incomeCurrent = data.incomePerSecond?.current || data.incomePerSecond || {};

    res.json({
      ok: true,
      // resolved WT account anchor — TycoonIO matches the caller's city plot by this
      // (session ids can be tt_/gh_ prefixed and never match city discordIds)
      discordId,
      player: {
        id: user?.id || discordId,
        displayName: user?.displayName || user?.globalName || user?.username || data.primaryPlayer?.display_name || data.primaryPlayer?.username || 'Player',
        avatar: user?.avatar || data.resolvedProfilePic || '/portal/img/logo.png',
        provider: user?.provider || 'discord'
      },
      // Single-currency economy: the spendable balance is XP (WT players.xp).
      // `dollars` kept for old clients but now mirrors the same wallet.
      dollars: Number(data.primaryPlayer?.xp || 0) || 0,
      coins: Number(data.primaryPlayer?.xp || 0) || 0,
      ownedBusinessCount: cards.filter((card) => card.owned).length,
      totalIncomePerSecond: Number(incomeCurrent.total ?? data.incomePerSecond?.total ?? 0) || 0,
      totalPrestige: Number(data.businessStats?.total_prestige || 0) || 0,
      activeBuffsCount: activeBuffs.length,
      activeBuffs,
      businesses: cards,
      recommendedActions: deriveTycoonActions(cards),
      recentActivity: Array.isArray(data.businessStats?.business_records) ? data.businessStats.business_records.slice(0, 6) : []
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: error?.message || 'Tycoon overview unavailable' });
  }
});

app.post('/api/tycoon/businesses/buy', auth.requireUser, express.json(), async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const businessType = String(req.body?.businessType || '');
  if (!TYCOONIO_BUSINESS_ORDER.includes(businessType)) {
    return res.status(400).json({ ok: false, message: 'Invalid businessType' });
  }
  try {
    const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/business/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({ discordUserId: discordId, businessType })
    });
    res.json(await upstream.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

// Business managers (AdCap auto-collect) — registered BEFORE /api/tycoon/:businessType
// so the literal path "managers" is not swallowed by the businessType param
app.get('/api/tycoon/managers', auth.requireUser, async (req, res) => {
  try {
    const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/managers/${discordId}`);
    res.json(await upstream.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.post('/api/tycoon/managers/hire', auth.requireUser, express.json(), async (req, res) => {
  const businessType = String(req.body?.businessType || '');
  if (!TYCOONIO_SUPPORTED_BUSINESSES.has(businessType)) {
    return res.status(400).json({ ok: false, message: 'No manager for that business' });
  }
  try {
    const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/managers/${discordId}/hire`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessType })
    });
    res.json(await upstream.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.post('/api/tycoon/managers/hire-foreman', auth.requireUser, express.json(), async (req, res) => {
  const businessType = String(req.body?.businessType || '');
  if (!TYCOONIO_SUPPORTED_BUSINESSES.has(businessType)) {
    return res.status(400).json({ ok: false, message: 'No foreman for that business' });
  }
  try {
    const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/managers/${discordId}/hire-foreman`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessType })
    });
    res.json(await upstream.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.get('/api/tycoon/:businessType', auth.requireUser, async (req, res) => {
  const businessType = String(req.params.businessType || '');
  if (!TYCOONIO_BUSINESS_ORDER.includes(businessType)) {
    return res.status(404).json({ ok: false, error: 'Unknown business type' });
  }

  try {
    const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const overviewUpstream = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${discordId}`);
    const overviewData = await overviewUpstream.json();
    if (!overviewData?.ok) {
      return res.status(502).json({ ok: false, error: 'Failed to load business overview' });
    }

    const cards = buildTycoonBusinessCards(overviewData);
    const businessCard = cards.find((card) => card.businessType === businessType) || buildTycoonBusinessCard(businessType, {}, {});
    if (!businessCard.owned || !TYCOONIO_SUPPORTED_BUSINESSES.has(businessType)) {
      return res.json({
        ok: true,
        business: businessCard,
        supported: false,
        summary: {
          title: businessCard.name,
          currentLevel: businessCard.level,
          prestigeLevel: businessCard.prestigeLevel,
          incomePerSecond: businessCard.incomePerSecond,
          incomeLabel: businessCard.incomeLabel,
          readyToCollect: 0,
          stats: []
        },
        payload: null
      });
    }

    const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/${businessType}/${discordId}`);
    const payload = await upstream.json();
    res.json({
      ok: true,
      business: businessCard,
      supported: true,
      summary: buildTycoonDetailSummary(businessType, businessCard, payload),
      payload
    });
  } catch (error) {
    res.status(502).json({ ok: false, error: error?.message || 'Business page unavailable' });
  }
});

app.post('/api/tycoon/:businessType/:action', auth.requireUser, express.json(), async (req, res) => {
  const businessType = String(req.params.businessType || '');
  const action = String(req.params.action || '');
  const allowedActions = new Set(['init', 'collect', 'prestige', 'upgrade', 'upgrade-max', 'customize', 'rename']);
  if (!TYCOONIO_SUPPORTED_BUSINESSES.has(businessType)) {
    return res.status(404).json({ ok: false, error: 'Unsupported business type' });
  }
  if (!allowedActions.has(action)) {
    return res.status(404).json({ ok: false, error: 'Unsupported business action' });
  }

  try {
    const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/${businessType}/${discordId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {})
    });
    res.json(await upstream.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

// Trust device toggle — controls whether login persists across browser sessions
app.get('/api/me/trust-status', async (req, res) => {
  var hasCookie = !!getCookieValue(req, REMEMBER_COOKIE);
  const u = req.session.discordUser;
  const sessionUser = u ? await syncResolvedSessionUser(req, u) : null;
  const user = sessionUser || u;
  res.json({ ok: true, trusted: hasCookie, user: user ? { id: user.id, username: user.username, displayName: user.displayName, avatar: user.avatar } : null });
});

app.post('/api/me/trust-device', express.json(), (req, res) => {
  if (!allowedSessionMutation(req)) return res.status(403).json({ ok: false, error: 'origin_required' });
  if (!req.session.discordUser) return res.status(401).json({ ok: false, error: 'Not logged in' });
  if (typeof req.body?.trust !== 'boolean') return res.status(400).json({ ok: false, error: 'invalid_trust' });
  try {
    if (req.body.trust) {
      if (req.session.rememberDisabled) {
        rememberSessions.revoke({ session: req.session.rememberSession, userId: req.session.discordUser.id });
        delete req.session.rememberSession;
        req.session.freshRememberLogin = true;
      }
      delete req.session.rememberDisabled;
      if (!setRememberCookie(req, res, req.session.discordUser)) return;
    }
    else {
      rememberSessions.revoke({ token: getCookieValue(req, REMEMBER_COOKIE),
        session: req.session.rememberSession, userId: req.session.discordUser.id });
      delete req.session.rememberSession;
      req.session.rememberDisabled = true;
      clearRememberCookie(req, res);
      if (!setRememberCookie(req, res, req.session.discordUser)) return;
    }
    req.session.save(error => {
      if (error) return res.status(503).json({ ok: false, error: 'trust_retry' });
      res.json({ ok: true, trusted: req.body.trust });
    });
  } catch { res.status(503).json({ ok: false, error: 'trust_retry' }); }
});
// ─── Daily MP Game Sequence ───────────────────────────────────────────────────
// Sequence order for daily MP games — admin can start this manually when needed
const DAILY_SEQUENCE = ['searchle', 'word500', 'rectangled', 'pixeletters', 'figural', 'spellingbee'];
const DAILY_SEQUENCE_FILE = path.join(__dirname, 'data', 'daily-sequence.json');
const appSockets = new Map(); // appId → socket (game server connections)
const serviceRegistration = require('./src/service-registration').createServiceRegistration({
  policy: serviceKeyPolicy, sockets: appSockets, apps, authorizeBot: chatIdentity.authorizeBot,
  changed: () => io.to('dashboard').emit('apps-status', apps.getAll()),
});
const serviceRevocationTimer = setInterval(() => serviceRegistration.revokeInactive(), 1000);
serviceRevocationTimer.unref();

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

// Get next midnight in Edmonton as ISO timestamp (for portal countdown)
function getNextEdmontonMidnightISO() {
  const now = new Date();
  const edm = new Date(now.toLocaleString('en-US', { timeZone: 'America/Edmonton' }));
  const nextMidnight = new Date(edm);
  nextMidnight.setHours(24, 0, 0, 0);
  const msUntil = nextMidnight.getTime() - edm.getTime();
  return new Date(now.getTime() + msUntil).toISOString();
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
const { createRewardOutbox, createRewardTransport, stableCompletionEvent } = require('./src/reward-outbox');
const { isOwnedSoloCompletion } = require('./src/owned-solo-completion');
const spRewardOutbox = createRewardOutbox({
  directory: path.join(__dirname, 'data', 'sp-reward-outbox'),
  send: createRewardTransport({ baseUrl: WORD_EMPIRES_URL, apiSecret: WT_API_SECRET, request: wtFetch })
});
spRewardOutbox.start();
app.get('/api/admin/reward-deliveries', requireAdminKey, (_req, res) => res.json(spRewardOutbox.summary()));
app.get('/api/admin/request-metrics', (_req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(requestMetrics.summary());
});
app.get('/admin/operations', (req, res) => {
  if (!isAdminRequest(req)) return res.redirect('/admin/login');
  res.sendFile(path.join(__dirname, 'public', 'admin', 'operations.html'));
});
app.get('/api/admin/operations-health', async (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const upstream = await wtFetch(WORD_EMPIRES_URL + '/api/admin/operations', { signal: AbortSignal.timeout(5000) });
    if (!upstream.ok) throw new Error();
    res.json({ ok: true, operations: await upstream.json(), requests: requestMetrics.summary() });
  } catch { res.status(503).json({ ok: false, error: 'Operations monitor unavailable' }); }
});

const SP_STATE_FILE_PATH = path.join(__dirname, 'data', 'sp-game-state.json');

// Valid gameIds (whitelist to prevent prototype pollution)
const VALID_SP_GAME_IDS = new Set([
  'letterworks-sp',
  'wordfall-sp',
  'word500-sp', 'colour500-sp', 'searchle-sp', 'wordle-sp', 'betwixt-sp', 'pixeletters-sp', 'figural-sp',
  'spellingbee-sp', 'rectangled-sp', 'erectangled-sp', 'sproutle-sp', 'unwordle-sp', 'triangled-sp',
  'spellingbee-sp-weekly', 'rectangled-sp-weekly', 'erectangled-sp-weekly', 'sproutle-sp-weekly', 'searchle-sp-weekly',
  'wikisearchle-sp', 'wikisearchle-sp-weekly'
]);

function isValidGameId(gameId) {
  return typeof gameId === 'string' && VALID_SP_GAME_IDS.has(gameId);
}

function normalizeSpGameId(gameId) {
  const raw = String(gameId || '').trim().toLowerCase();
  if (raw === 'sproutle-sp') return 'erectangled-sp';
  if (raw === 'sproutle-sp-weekly') return 'erectangled-sp-weekly';
  return raw;
}

function getSpGameIdVariants(gameId) {
  const normalized = normalizeSpGameId(gameId);
  const variants = [normalized];
  if (normalized === 'erectangled-sp') variants.push('sproutle-sp');
  if (normalized === 'erectangled-sp-weekly') variants.push('sproutle-sp-weekly');
  return variants;
}

function getCompletionDatesForGame(data, gameId, userId) {
  const merged = new Set();
  for (const variant of getSpGameIdVariants(gameId)) {
    const userDates = (data[variant] && data[variant][userId]) || [];
    userDates.forEach((date) => merged.add(date));
  }
  return [...merged].sort();
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

// ─── Canonical completion status helper ──────────────────────────────
// Queries Word Tycoon DB for a user's canonical completion state.
// Falls back to JSON file if WT is unreachable.
// Maps between SP game IDs (e.g. 'word500-sp') and WT game IDs (e.g. 'word500').
const SP_TO_WT_DAILY = { 'spellingbee-sp': 'spelling-bee', 'word500-sp': 'word5000', 'colour500-sp': 'color500', 'searchle-sp': 'subtextle', 'wordle-sp': 'wordle', 'betwixt-sp': 'betwixt', 'figural-sp': 'figural', 'pixeletters-sp': 'pixeletters', 'unwordle-sp': 'unwordle', 'rectangled-sp': 'rectangled', 'erectangled-sp': 'erectangled', 'sproutle-sp': 'erectangled', 'triangled-sp': 'triangled', 'wikisearchle-sp': 'wikicontexto' };
const SP_TO_WT_WEEKLY = { 'spellingbee-sp': 'spelling-bee', 'rectangled-sp': 'rectangled', 'searchle-sp': 'subtextle', 'erectangled-sp': 'erectangled', 'sproutle-sp': 'erectangled', 'wikisearchle-sp': 'wikicontexto' };

// Per-user cache: avoid hammering WT on every game page load (TTL 30s)
const _canonicalCache = new Map();
const CANONICAL_CACHE_TTL = 30000;

async function getCanonicalCompletionStatus(discordUserId) {
  const cached = _canonicalCache.get(discordUserId);
  if (cached && Date.now() - cached.ts < CANONICAL_CACHE_TTL) return cached.data;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/completion-status/${encodeURIComponent(discordUserId)}`, {
      method: 'GET',
      headers: { 'x-api-key': WT_API_SECRET }
    });
    const data = await r.json();
    if (data.ok) {
      _canonicalCache.set(discordUserId, { data, ts: Date.now() });
      // Evict stale entries
      if (_canonicalCache.size > 500) {
        for (const [k, v] of _canonicalCache) {
          if (Date.now() - v.ts > CANONICAL_CACHE_TTL) _canonicalCache.delete(k);
        }
      }
      return data;
    }
  } catch (e) {
    console.warn('[Canonical] Failed to query Word Tycoon:', e.message);
  }
  return null; // fallback caller should use JSON file
}

const soloSessionCheck = require('./src/solo-session-context').createSoloSessionCheck({
  hasInternalApiKey,
  isSessionActive: (req, user) => !req.session.rememberSession || rememberSessions.activeSession(req.session.rememberSession, user.id)
});
// Get daily completion status for logged-in user — canonical from Word Tycoon DB
app.get('/api/sp-daily/status/:gameId', async (req, res) => {

  const soloUser = req.session?.discordUser;  if (!req.session.discordUser) return res.json({ ok: false, error: 'Not logged in' });
  const requestedGameId = req.params.gameId;
  if (!isValidGameId(requestedGameId)) return res.json({ ok: false, error: 'Invalid gameId' });
  const gameId = normalizeSpGameId(requestedGameId);
  const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  if (!soloSessionCheck(req, res, userId, soloUser)) return;

  // Try canonical DB first
  const canonical = await getCanonicalCompletionStatus(userId);
  if (canonical) {
    // Determine the WT game ID for this SP game
    const isWeekly = gameId.endsWith('-weekly');
    const baseGameId = isWeekly ? gameId.replace(/-weekly$/, '') : gameId;
    const wtGame = isWeekly ? (SP_TO_WT_WEEKLY[baseGameId] || baseGameId) : (SP_TO_WT_DAILY[gameId] || gameId);
    const isCompleted = isWeekly
      ? canonical.weeklyGames.includes(wtGame)
      : canonical.dailyGames.includes(wtGame);
    // Return in the completedDates format clients expect
    const dateKey = isWeekly ? canonical.weekStart : canonical.today;
    const locallyPlayed = !isWeekly && DAILY_RULES.has(gameId)
      && getCompletionDatesForGame(loadDailyCompletions(), gameId, userId).includes(dateKey);
    const queuedCompletion = spRewardOutbox.completedPeriods(baseGameId, userId, isWeekly ? 'weekly' : 'daily').includes(dateKey);
    return res.json({ ok: true, completedDates: (isCompleted || locallyPlayed || queuedCompletion) ? [dateKey] : [] });
  }

  // Fallback: read from JSON file
  const data = loadDailyCompletions();
  const userDates = getCompletionDatesForGame(data, gameId, userId);
  res.json({ ok: true, completedDates: userDates, _fallback: true });
});

// Mark a daily as completed
app.post('/api/sp-daily/complete/:gameId', express.json(), async (req, res) => {

  const soloUser = req.session?.discordUser;  if (!isValidGameId(req.params.gameId) || req.params.gameId.endsWith('-weekly'))
    return res.status(400).json({ ok: false, error: 'Invalid completion gameId' });
  if (['letterworks-sp', 'wordfall-sp', 'wikisearchle-sp', 'triangled-sp'].includes(req.params.gameId))
    return res.status(403).json({ ok: false, error: 'This game records its own daily completions.' });
  if (['rectangled-sp', 'erectangled-sp', 'sproutle-sp', 'colour500-sp', 'searchle-sp'].includes(req.params.gameId)
      && !hasInternalApiKey(req))
    return res.status(403).json({ ok: false, error: 'A verified game-server solve is required.' });
  console.log('[SP-Daily] IN game=' + req.params.gameId + ' hasSession=' + !!req.session?.discordUser + ' bodyUserId=' + (req.body?.userId || '-') + ' date=' + (req.body?.date || '-'));
  // Accept userId from session, or from request body ONLY with valid API key (server-to-server)
  let userId = req.session?.discordUser ? await getCurrentWordTycoonAccountId(req.session.discordUser) : null;
  if (!soloSessionCheck(req, res, userId, soloUser)) return;
  if (!userId && req.body?.userId) {
    if (!hasInternalApiKey(req)) {
      console.warn('[SP-Daily] REJECT game=' + req.params.gameId + ' reason=bad-api-key');
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    userId = String(req.body.userId);
  }
  if (!userId) {
    console.warn('[SP-Daily] REJECT game=' + req.params.gameId + ' reason=no-session origin=' + (req.headers.origin || req.hostname));
    return res.json({ ok: false, error: 'Not logged in' });
  }
  if (req.body.expectedAccountId !== undefined && (typeof req.body.expectedAccountId !== 'string' || req.body.expectedAccountId !== userId))
    return res.status(409).json({ ok: false, error: 'Completion belongs to another account.' });
  const requestedGameId = req.params.gameId;
  if (!isValidGameId(requestedGameId)) {
    console.warn('[SP-Daily] REJECT game=' + requestedGameId + ' reason=invalid-game-id');
    return res.json({ ok: false, error: 'Invalid gameId' });
  }
  const gameId = normalizeSpGameId(requestedGameId);
  const date = req.body.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    console.warn('[SP-Daily] REJECT game=' + gameId + ' user=' + userId + ' reason=invalid-date value=' + date);
    return res.json({ ok: false, error: 'Invalid date' });
  }
  const previouslyAccepted = getCompletionDatesForGame(loadDailyCompletions(), gameId, userId).includes(date);
  // Browser claims require today; scoped Subtextle can recover a durable old decision.
  const { date: todayEdmonton } = getEdmontonTime();
  if (date !== todayEdmonton && !previouslyAccepted && !(gameId === 'searchle-sp' && isOwnedSoloCompletion({
    authorized: hasInternalApiKey(req), gameId, userId, kind: 'daily', period: date, decision: req.body.serverCompletion,
  }))) {
    console.warn('[SP-Daily] REJECT game=' + gameId + ' user=' + userId + ' reason=not-today date=' + date + ' today=' + todayEdmonton);
    return res.json({ ok: false, error: 'Date must be today' });
  }

  const solve = previouslyAccepted ? { required: false, ok: true } : validateDailyTranscript(wordBank, gameId, date, req.body.evidence);
  if (solve.required && !solve.ok)
    return res.status(solve.unavailable ? 503 : 422).json({ ok: false, error: solve.error });

  const dailyGameMap = { 'spellingbee-sp': 'spelling-bee', 'word500-sp': 'word5000', 'colour500-sp': 'color500', 'searchle-sp': 'subtextle', 'wordle-sp': 'wordle', 'betwixt-sp': 'betwixt', 'figural-sp': 'figural', 'pixeletters-sp': 'pixeletters', 'unwordle-sp': 'unwordle', 'rectangled-sp': 'rectangled', 'erectangled-sp': 'erectangled', 'sproutle-sp': 'erectangled', 'triangled-sp': 'triangled', 'wikisearchle-sp': 'wikicontexto' };
  const wtGame = dailyGameMap[gameId] || gameId;
  const rewardEventId = stableCompletionEvent('daily', gameId, userId, date);
  const rewardPayload = { platform: 'discord', userId, username: userId,
    coins: 1, game: wtGame, event: 'daily-win', eventId: rewardEventId, rewardPeriod: date };
  let delivery = null;
  let alreadyCompleted = false;
  try { await withFileLock(SP_DAILY_FILE, () => {
    if (!soloSessionCheck(req, res, userId, soloUser)) return;
    const data = loadDailyCompletions();
    if (!data[gameId]) data[gameId] = {};
    if (!data[gameId][userId]) data[gameId][userId] = [];
    if (data[gameId][userId].includes(date)) {
      alreadyCompleted = true;
      delivery = spRewardOutbox.read(rewardEventId);
      return;
    }
    if (!solve.required || solve.won) {
      delivery = spRewardOutbox.reserve(rewardPayload, { gameId, userId, period: date, kind: 'daily' });
    }
    data[gameId][userId].push(date);
    // Keep only last 90 days per user
    if (data[gameId][userId].length > 90) {
      data[gameId][userId] = data[gameId][userId].slice(-90);
    }
    saveDailyCompletions(data);
  }); } catch (error) {
    console.error('[SP-RewardOutbox] Could not persist completion:', error.message);
    return res.status(503).json({ ok: false, error: 'Completion could not be persisted; retry with the same solve.' });
  }
  if (res.headersSent) return;
  if (alreadyCompleted && !delivery) {
    console.log('[SP-Daily] OK game=' + gameId + ' user=' + userId + ' date=' + date + ' alreadyCompleted=true');
    return res.json({ ok: true, alreadyCompleted: true });
  }

  if (solve.required && !solve.won)
    return res.json({ ok: true, won: false, reward: null });


  // The durable validated claim survives a timeout, caller disconnect or restart.
  try {
    const record = await spRewardOutbox.deliver(rewardEventId);
    return res.json({ ok: true, alreadyCompleted, rewardEventId,
      reward: record?.state === 'delivered' ? record.result : null,
      rewardPending: record?.state !== 'delivered',
      ...(record?.state !== 'delivered' ? { warning: 'Completion saved; reward delivery is pending.' } : {}) });
  } catch (error) {
    console.error('[SP-RewardOutbox]', error.message);
    return res.status(503).json({ ok: false, rewardEventId, error: 'Reward delivery record unavailable; retry this completion.' });
  }
});

// Check daily/weekly status for a specific user (server-to-server, e.g. Searchle)
// Canonical from Word Tycoon DB with JSON fallback
app.get('/api/sp-daily/status/:gameId/:userId', async (req, res) => {
  const { userId } = req.params;
  const requestedGameId = req.params.gameId;
  if (!isValidGameId(requestedGameId)) return res.json({ ok: false, error: 'Invalid gameId' });
  const gameId = normalizeSpGameId(requestedGameId);

  // Try canonical DB
  const canonical = await getCanonicalCompletionStatus(userId);
  if (canonical) {
    const isWeekly = gameId.endsWith('-weekly');
    const baseGameId = isWeekly ? gameId.replace(/-weekly$/, '') : gameId;
    const wtGame = isWeekly ? (SP_TO_WT_WEEKLY[baseGameId] || baseGameId) : (SP_TO_WT_DAILY[gameId] || gameId);
    const isCompleted = isWeekly
      ? canonical.weeklyGames.includes(wtGame)
      : canonical.dailyGames.includes(wtGame);
    const dateKey = isWeekly ? canonical.weekStart : canonical.today;
    const locallyPlayed = !isWeekly && DAILY_RULES.has(gameId)
      && getCompletionDatesForGame(loadDailyCompletions(), gameId, userId).includes(dateKey);
    const queuedCompletion = spRewardOutbox.completedPeriods(baseGameId, userId, isWeekly ? 'weekly' : 'daily').includes(dateKey);
    return res.json({ ok: true, completedDates: (isCompleted || locallyPlayed || queuedCompletion) ? [dateKey] : [] });
  }

  // Fallback: read from JSON file
  const data = loadDailyCompletions();
  const userDates = getCompletionDatesForGame(data, gameId, userId);
  res.json({ ok: true, completedDates: userDates, _fallback: true });
});

// ─── Weekly SP Completion (awards cosmetic via Word Tycoon) ──────────
app.post('/api/sp-weekly/complete/:gameId', express.json(), async (req, res) => {
  const soloUser = req.session?.discordUser;
  if (DAILY_RULES.has(req.params.gameId) && req.params.gameId !== 'spellingbee-sp')
    return res.status(403).json({ ok: false, error: 'This game has no weekly challenge.' });
  if (!isValidGameId(req.params.gameId) || req.params.gameId.endsWith('-weekly'))
    return res.status(400).json({ ok: false, error: 'Invalid completion gameId' });
  if (['wikisearchle-sp', 'triangled-sp', 'letterworks-sp', 'wordfall-sp'].includes(req.params.gameId))
    return res.status(403).json({ ok: false, error: 'This game records its own completions.' });
  if (['rectangled-sp', 'erectangled-sp', 'sproutle-sp', 'colour500-sp', 'searchle-sp'].includes(req.params.gameId)
      && !hasInternalApiKey(req))
    return res.status(403).json({ ok: false, error: 'A verified game-server solve is required.' });
  console.log('[SP-Weekly] IN game=' + req.params.gameId + ' hasSession=' + !!req.session?.discordUser + ' bodyUserId=' + (req.body?.userId || '-') + ' weekStart=' + (req.body?.weekStart || '-'));
  // Accept userId from session, or from request body ONLY with valid API key (server-to-server)
  let userId = req.session?.discordUser ? await getCurrentWordTycoonAccountId(req.session.discordUser) : null;
  if (!soloSessionCheck(req, res, userId, soloUser)) return;
  if (!userId && req.body?.userId) {
    if (!hasInternalApiKey(req)) {
      console.warn('[SP-Weekly] REJECT game=' + req.params.gameId + ' reason=bad-api-key');
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    userId = String(req.body.userId);
  }
  if (!userId) {
    console.warn('[SP-Weekly] REJECT game=' + req.params.gameId + ' reason=no-session origin=' + (req.headers.origin || req.hostname));
    return res.json({ ok: false, error: 'Not logged in' });
  }
  if (req.body.expectedAccountId !== undefined && (typeof req.body.expectedAccountId !== 'string' || req.body.expectedAccountId !== userId))
    return res.status(409).json({ ok: false, error: 'Completion belongs to another account.' });
  const requestedGameId = req.params.gameId;
  if (!isValidGameId(requestedGameId)) {
    console.warn('[SP-Weekly] REJECT game=' + requestedGameId + ' reason=invalid-game-id');
    return res.json({ ok: false, error: 'Invalid gameId' });
  }
  const gameId = normalizeSpGameId(requestedGameId);
  const weekStart = req.body.weekStart;
  if (!weekStart || !/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
    console.warn('[SP-Weekly] REJECT game=' + gameId + ' user=' + userId + ' reason=invalid-weekStart value=' + weekStart);
    return res.json({ ok: false, error: 'Missing or invalid weekStart' });
  }
  // Browser claims require this week; owned Subtextle decisions retain their week.
  const currentWeekStart = wordBank.getWeekStart();
  const previouslyAccepted = getCompletionDatesForGame(loadDailyCompletions(), gameId + '-weekly', userId).includes(weekStart);
  if (weekStart !== currentWeekStart && !previouslyAccepted && !(gameId === 'searchle-sp' && isOwnedSoloCompletion({
    authorized: hasInternalApiKey(req), gameId, userId, kind: 'weekly', period: weekStart, decision: req.body.serverCompletion,
  }))) {
    console.warn('[SP-Weekly] REJECT game=' + gameId + ' user=' + userId + ' reason=not-current-week weekStart=' + weekStart + ' current=' + currentWeekStart);
    return res.json({ ok: false, error: 'weekStart must be current week' });
  }

  if (gameId === 'spellingbee-sp' && !previouslyAccepted) {
    const solve = validateSpellingBeeWeekly(wordBank, weekStart, req.body.evidence);
    if (!solve.ok) return res.status(solve.unavailable ? 503 : 422).json({ ok: false, error: solve.error });
  }

  // Record in JSON file (same pattern as daily) — use lock to prevent race conditions
  const gameMap = { 'spellingbee-sp': 'spelling-bee', 'rectangled-sp': 'rectangled', 'searchle-sp': 'searchle', 'erectangled-sp': 'erectangled', 'sproutle-sp': 'erectangled', 'wikisearchle-sp': 'wikisearchle' };
  const wtGame = gameMap[gameId] || gameId;
  const rewardEventId = stableCompletionEvent('weekly', gameId, userId, weekStart);
  const rewardPayload = { platform: 'discord', userId, username: userId,
    coins: 1, game: wtGame, event: 'weekly-win', eventId: rewardEventId, rewardPeriod: weekStart };
  let delivery = null;
  let alreadyCompleted = false;
  try { await withFileLock(SP_DAILY_FILE, () => {
    if (!soloSessionCheck(req, res, userId, soloUser)) return;
    const data = loadDailyCompletions();
    const key = gameId + '-weekly';
    if (!data[key]) data[key] = {};
    if (!data[key][userId]) data[key][userId] = [];
    if (data[key][userId].includes(weekStart)) {
      alreadyCompleted = true;
      delivery = spRewardOutbox.read(rewardEventId);
      return;
    }
    delivery = spRewardOutbox.reserve(rewardPayload, { gameId, userId, period: weekStart, kind: 'weekly' });
    data[key][userId].push(weekStart);
    // Keep only last 20 weeks per user
    if (data[key][userId].length > 20) {
      data[key][userId] = data[key][userId].slice(-20);
    }
    saveDailyCompletions(data);
  }); } catch (error) {
    console.error('[SP-RewardOutbox] Could not persist completion:', error.message);
    return res.status(503).json({ ok: false, error: 'Completion could not be persisted; retry with the same solve.' });
  }
  if (res.headersSent) return;
  if (alreadyCompleted && !delivery) {
    console.log('[SP-Weekly] OK game=' + gameId + ' user=' + userId + ' weekStart=' + weekStart + ' alreadyCompleted=true');
    return res.json({ ok: true, alreadyCompleted: true });
  }


  // The durable validated claim survives a timeout, caller disconnect or restart.
  try {
    const record = await spRewardOutbox.deliver(rewardEventId);
    return res.json({ ok: true, alreadyCompleted, rewardEventId,
      reward: record?.state === 'delivered' ? record.result : null,
      rewardPending: record?.state !== 'delivered',
      ...(record?.state !== 'delivered' ? { warning: 'Completion saved; reward delivery is pending.' } : {}) });
  } catch (error) {
    console.error('[SP-RewardOutbox]', error.message);
    return res.status(503).json({ ok: false, rewardEventId, error: 'Reward delivery record unavailable; retry this completion.' });
  }
});

// Library word reporting — proxy to Word Tycoon for SP game clients
app.post('/api/library/word', express.json(), async (req, res) => {

  const soloUser = req.session?.discordUser;  if (!req.session?.discordUser) return res.json({ ok: false, error: 'Not logged in' });
  const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  if (!soloSessionCheck(req, res, userId, soloUser)) return;
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
// ─── SP Sync — canonical completion status from Word Tycoon DB ───────
// This is the SINGLE source of truth for the portal's daily/weekly challenge tracker.
// Returns canonical completion data from Word Tycoon's daily_completions + weekly_completions tables.
// Game IDs from WT (e.g. 'word500') are mapped back to SP IDs (e.g. 'word500-sp') for portal compatibility.
app.get('/api/sp-sync', async (req, res) => {
  if (!req.session.discordUser) return res.json({ ok: false, error: 'Not logged in' });
  const discordUserId = await getCurrentWordTycoonAccountId(req.session.discordUser);

  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/completion-status/${encodeURIComponent(discordUserId)}`, {
      method: 'GET',
      headers: { 'x-api-key': WT_API_SECRET }
    });
    const canonical = await r.json();
    if (!canonical.ok) {
      return res.json({ ok: false, error: 'Upstream error' });
    }

    // Map WT game IDs → SP game IDs for portal daily tracker
    const dailyWtToSp = { 'word5000': 'word500-sp', 'color500': 'colour500-sp', 'word500': 'word500-sp', 'colour500': 'colour500-sp', 'wordle': 'wordle-sp', 'betwixt': 'betwixt-sp', 'figural': 'figural-sp', 'pixeletters': 'pixeletters-sp', 'unwordle': 'unwordle-sp', 'rectangled': 'rectangled-sp', 'erectangled': 'erectangled-sp', 'sproutle': 'erectangled-sp', 'triangled': 'triangled-sp' };
    const daily = {};
    for (const [wtId, spId] of Object.entries(dailyWtToSp)) {
      daily[spId] = daily[spId] || canonical.dailyGames.includes(wtId);
    }
    daily['sproutle-sp'] = daily['erectangled-sp'];

    // Map WT game IDs → SP weekly keys for portal weekly tracker
    const weeklyWtToSp = { 'spelling-bee': 'spellingbee-sp-weekly', 'rectangled': 'rectangled-sp-weekly', 'subtextle': 'searchle-sp-weekly', 'searchle': 'searchle-sp-weekly', 'erectangled': 'erectangled-sp-weekly', 'sproutle': 'erectangled-sp-weekly', 'wikicontexto': 'wikisearchle-sp-weekly', 'wikisearchle': 'wikisearchle-sp-weekly' };
    const weekly = {};
    for (const [wtId, spKey] of Object.entries(weeklyWtToSp)) {
      weekly[spKey] = weekly[spKey] || canonical.weeklyGames.includes(wtId);
    }
    weekly['sproutle-sp-weekly'] = weekly['erectangled-sp-weekly'];

    // Return server-authoritative dates — portal MUST use these, not compute its own
    res.json({
      ok: true, accountId: discordUserId,
      today: canonical.today,        // Edmonton YYYY-MM-DD
      weekStart: canonical.weekStart, // Edmonton Monday YYYY-MM-DD
      daily,
      weekly,
      // Include next-reset time so portal can show accurate countdown
      nextDailyReset: getNextEdmontonMidnightISO()
    });
  } catch (e) {
    console.error('[SP-Sync] Failed to fetch canonical status from Word Tycoon:', e.message);
    // Fallback: return JSON file data (degraded but not broken)
    const data = loadDailyCompletions();
    const { date: today } = getEdmontonTime();
    const weekStart = wordBank.getWeekStart();
    const dailyGames = ['word500-sp', 'colour500-sp', 'wordle-sp', 'betwixt-sp', 'pixeletters-sp', 'figural-sp', 'unwordle-sp', 'rectangled-sp', 'erectangled-sp', 'triangled-sp'];
    const daily = {};
    for (const g of dailyGames) { const userDates = (data[g] && data[g][discordUserId]) || []; daily[g] = userDates.includes(today); }
    daily['sproutle-sp'] = daily['erectangled-sp'];
    const weeklyKeys = ['spellingbee-sp-weekly', 'rectangled-sp-weekly', 'searchle-sp-weekly', 'erectangled-sp-weekly', 'wikisearchle-sp-weekly'];
    const weekly = {};
    for (const g of weeklyKeys) { const userDates = (data[g] && data[g][discordUserId]) || []; weekly[g] = userDates.includes(weekStart); }
    weekly['sproutle-sp-weekly'] = weekly['erectangled-sp-weekly'];
    res.json({ ok: true, accountId: discordUserId, today, weekStart, daily, weekly, nextDailyReset: getNextEdmontonMidnightISO(), _fallback: true });
  }
});

// ─── SP Game State Sync (in-progress daily/weekly state) ──────────
require('./src/game-http-identity').registerGameIdentityRoutes(app, {
  secret: TRI_SESSION_SECRET, getAccountId: getCurrentWordTycoonAccountId,
  isSessionActive: (req, user) => req.session?.discordUser?.id === user.id &&
    (!req.session.rememberSession || rememberSessions.activeSession(req.session.rememberSession, user.id))
});

registerWordFoundryProxy(app, {
  wtFetch,
  wordTycoonUrl: WORD_EMPIRES_URL,
  getAccountId: getCurrentWordTycoonAccountId
});

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

  const soloUser = req.session?.discordUser;  if (!req.session.discordUser) return res.json({ ok: false });
  const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  if (!soloSessionCheck(req, res, userId, soloUser)) return;
  const gameId = req.params.gameId;
  if (!isValidGameId(gameId)) return res.json({ ok: false, error: 'Invalid gameId' });

  let result = null;
  await withFileLock(SP_STATE_FILE_PATH, () => {
    if (!soloSessionCheck(req, res, userId, soloUser)) return;
    const data = loadGameStates();
    const entry = data[gameId]?.[userId] || null;
    if (!entry) { result = null; return; }

    // Auto-clean stale daily states (Edmonton timezone — matches word bank)
    if (entry.dailyDate) {
      const { date: today } = getEdmontonTime();
      if (entry.dailyDate !== today) {
        delete data[gameId][userId];
        saveGameStates(data);
        result = null;
        return;
      }
    }
    // Auto-clean stale weekly states
    if (entry.weekStart) {
      const ws = wordBank.getWeekStart();
      if (entry.weekStart !== ws) {
        delete data[gameId][userId];
        saveGameStates(data);
        result = null;
        return;
      }
    }
    result = entry;
  });
  if (res.headersSent) return;
  res.json({ ok: true, state: result });
});

// Save in-progress game state
app.post('/api/sp-state/:gameId', express.json(), async (req, res) => {

  const soloUser = req.session?.discordUser;  if (!req.session.discordUser) return res.json({ ok: false });
  const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  if (!soloSessionCheck(req, res, userId, soloUser)) return;
  const gameId = req.params.gameId;
  if (!isValidGameId(gameId)) return res.json({ ok: false, error: 'Invalid gameId' });
  const state = req.body.state;
  if (!state || typeof state !== 'object') return res.json({ ok: false, error: 'No state' });
  // Size limit check
  const stateStr = JSON.stringify(state);
  if (stateStr.length > MAX_STATE_SIZE) return res.json({ ok: false, error: 'State too large' });

  await withFileLock(SP_STATE_FILE_PATH, () => {
    if (!soloSessionCheck(req, res, userId, soloUser)) return;
    const data = loadGameStates();
    if (!data[gameId]) data[gameId] = {};
    data[gameId][userId] = state;
    saveGameStates(data);
  });
  if (res.headersSent) return;
  res.json({ ok: true });
});

// Clear saved state (game complete)
app.delete('/api/sp-state/:gameId', async (req, res) => {

  const soloUser = req.session?.discordUser;  if (!req.session.discordUser) return res.json({ ok: false });
  const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  if (!soloSessionCheck(req, res, userId, soloUser)) return;
  const gameId = req.params.gameId;
  if (!isValidGameId(gameId)) return res.json({ ok: false, error: 'Invalid gameId' });

  await withFileLock(SP_STATE_FILE_PATH, () => {
    if (!soloSessionCheck(req, res, userId, soloUser)) return;
    const data = loadGameStates();
    if (data[gameId]) {
      delete data[gameId][userId];
      saveGameStates(data);
    }
  });
  if (res.headersSent) return;
  res.json({ ok: true });
});

app.post('/api/me/unlink', auth.requireUser, express.json(), async (req, res) => {
  const { platform, platformUserId } = req.body || {};
  if (typeof platform !== 'string' || !['github', 'tiktok', 'youtube', 'twitch', 'kick'].includes(platform) ||
      typeof platformUserId !== 'string' || !platformUserId || platformUserId.length > 128) {
    return res.status(400).json({ ok: false, error: 'Invalid linked platform' });
  }
  const sessionUser = req.session.discordUser;
  const resolved = await resolveWordTycoonAccountId(sessionUser);
  if (!resolved.ok) return res.status(502).json({ ok: false, error: 'Game server unreachable' });
  if (!resolved.discordAnchor || !resolved.accountId) {
    return res.status(403).json({ ok: false, error: 'No linked Discord account found' });
  }
  const discordId = resolved.accountId;
  const provider = resolved.provider;

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

// Fan club status for the logged-in user. Drives the portal store card
// (locked vs unlocked) for the TikTok Fan Club cosmetic bundle.
// Returns { isFanClub, granted, queued, tiktokUserId, unlockUrl }.
// Preserved from the 2026-05-23 server.js when restoring the 2026-05-21
// snapshot — this was the only new route added between the two states.
app.get('/api/me/fanclub-status', auth.requireUser, async (req, res) => {
  const FAN_CLUB_UNLOCK_URL = 'https://www.tiktok.com/@jorrybeaufart';
  try {
    const du = req.session.discordUser;
    let tiktokUserId = null;

    // 1. Provider is already TikTok → that IS the TikTok identity.
    if (du.provider === 'tiktok' || (typeof du.id === 'string' && du.id.startsWith('tt_'))) {
      tiktokUserId = du.id.startsWith('tt_') ? du.id.slice(3) : du.id;
    } else {
      // 2. Resolve to Discord ID, then ask WT for linked TikTok accounts.
      let discordId = du.id;
      if (du.provider === 'github' || (typeof du.id === 'string' && du.id.startsWith('gh_'))) {
        try {
          const rr = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(du.id)}`);
          const rd = await rr.json();
          if (rd.linked && rd.discordUserId) discordId = rd.discordUserId;
        } catch {}
      }
      try {
        const r = await wtFetch(`${WORD_EMPIRES_URL}/api/link/status/${encodeURIComponent(discordId)}`);
        const data = await r.json();
        const tiktokAcct = (data.accounts || []).find(a => a.platform === 'tiktok');
        if (tiktokAcct) tiktokUserId = tiktokAcct.platform_user_id;
      } catch {}
    }

    let isFanClub = false;
    let granted = false;
    let queued = false;

    if (tiktokUserId) {
      // Fan-club badge from Chat Relay's own users table (set by TikTok chat events).
      try {
        const u = db.getUserByPlatform('tiktok', String(tiktokUserId));
        isFanClub = !!(u && u.is_fan_club);
      } catch {}

      // Grant + queue status from Word Tycoon.
      try {
        const r = await wtFetch(`${WORD_EMPIRES_URL}/api/cosmetics/grant-status?platform=tiktok&platformUserId=${encodeURIComponent(tiktokUserId)}&setKey=tiktok_fc`);
        const data = await r.json();
        granted = !!data.granted;
        queued = !!data.queued;
      } catch {}
    }

    res.json({
      ok: true,
      isFanClub,
      granted,
      queued,
      tiktokUserId,
      hasTiktokLink: !!tiktokUserId,
      unlockUrl: FAN_CLUB_UNLOCK_URL,
      setKey: 'tiktok_fc'
    });
  } catch (err) {
    res.json({
      ok: false,
      isFanClub: false,
      granted: false,
      queued: false,
      tiktokUserId: null,
      hasTiktokLink: false,
      unlockUrl: FAN_CLUB_UNLOCK_URL,
      setKey: 'tiktok_fc',
      message: err.message
    });
  }
});

app.get('/api/me/profile', auth.requireUser, async (req, res) => {
  const du = req.session.discordUser;
  const provider = du.provider || (du.id.startsWith('gh_') ? 'github' : du.id.startsWith('go_') ? 'google' : du.id.startsWith('tt_') ? 'tiktok' : 'discord');
  let accountId = du.id; // Discord ID, or standalone gh_/go_ id
  let hasDiscordAnchor = provider === 'discord';

  // GitHub may still resolve to a legacy Discord anchor (links created before
  // gh_ became standalone). TikTok users must link — stream identity depends
  // on the Discord anchor.
  if (provider === 'github' || provider === 'tiktok') {
    try {
      const resolveRes = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=${provider}&platformUserId=${encodeURIComponent(du.id)}`);
      const resolveData = await resolveRes.json();
      if (resolveData.linked && resolveData.discordUserId) {
        accountId = resolveData.discordUserId; // use linked Discord ID
        hasDiscordAnchor = true;
      } else if (provider === 'tiktok') {
        // TikTok user not linked — show basic profile with link prompt
        return res.json({
          ok: true,
          linked: false,
          provider,
          profile: {
            displayName: du.globalName || du.username,
            profilePic: du.avatar || null,
            platforms: [{
              platform: provider,
              platformUserId: du.id,
              username: du.username,
              displayName: du.globalName || du.username,
              profilePic: du.avatar || null
            }]
          }
        });
      }
      // Unlinked GitHub falls through as a standalone gh_ account.
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

    // Clean up gh_/go_ prefixed IDs — set to null so frontend can show "Linked" fallback
    for (const p of platforms) {
      if (p.displayName && (isRawId(p.displayName) || p.displayName.startsWith('gh_') || p.displayName.startsWith('go_') || p.displayName.startsWith('tt_'))) p.displayName = null;
      if (p.username && (p.username.startsWith('gh_') || p.username.startsWith('go_') || p.username.startsWith('tt_'))) p.username = null;
    }

    // Enrich the login provider's platform entry with OAuth session data
    // (GitHub/Google standalone accounts aren't in WT linkedPlatforms at all)
    if (provider === 'github' || provider === 'google') {
      const ownPlat = platforms.find(p => p.platform === provider);
      if (ownPlat) {
        if (!ownPlat.displayName) ownPlat.displayName = du.globalName || du.username;
        if (!ownPlat.username) ownPlat.username = du.username;
        if (!ownPlat.profilePic) ownPlat.profilePic = du.avatar || null;
      } else {
        platforms.push({
          platform: provider,
          platformUserId: du.id,
          username: du.username,
          displayName: du.globalName || du.username,
          profilePic: du.avatar || null
        });
      }
    }

    // Add Discord as a platform — only when the account is Discord-anchored.
    // Standalone gh_/go_ accounts have no Discord identity to show.
    if (hasDiscordAnchor) {
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
    }

    // Display name & profile pic priority: preference > Discord > TikTok > YouTube > GitHub > Google
    const DISPLAY_PRIORITY = ['discord', 'tiktok', 'youtube', 'github', 'google'];

    // Resolve hero display name
    let heroDisplayName = data.preferences?.preferred_display_name || null;
    if (!heroDisplayName) {
      for (const platName of DISPLAY_PRIORITY) {
        const plat = platforms.find(p => p.platform === platName);
        if (plat) {
          const name = plat.displayName || plat.username;
          if (name && !isRawId(name) && !name.startsWith('gh_') && !name.startsWith('go_') && !name.startsWith('tt_')) {
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
      profilePic = '/portal/img/logo.png'; // explicit default — show WT logo
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
        xp: data.primaryPlayer?.xp || 0,
        dollars: data.primaryPlayer?.coins || 0,
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
          membershipStatus: data.passStats?.membership_status || 'inactive'
        },
        gameStats: {
          perGameWins: Array.isArray(data.gameStats?.per_game_wins) ? data.gameStats.per_game_wins : [],
          perGameRecords: Array.isArray(data.gameStats?.per_game_records) ? data.gameStats.per_game_records : []
        },
        globalElo: (eloDataCache.global['discord:' + accountId]?.elo) || (eloDataCache.global[accountId]?.elo) || 1200
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
  const provider = du.provider || (du.id.startsWith('gh_') ? 'github' : du.id.startsWith('tt_') ? 'tiktok' : 'discord');
  let discordId = du.id;
  // Whitelist allowed preference fields — prevent primary_player_id manipulation
  // Whitelist: accept snake_case from portal, convert to camelCase for Word Tycoon
  const FIELD_MAP = {
    preferred_pfp_platform: 'preferredPfpPlatform',
    preferred_profile_logo_id: 'preferredProfileLogoId',
    preferred_display_name: 'preferredDisplayName',
    cosmetic_visibility: 'cosmeticVisibility',
    custom_avatar_url: 'customAvatarUrl',
    city_layout: 'cityLayout',
    city_building_style: 'cityBuildingStyle',
    city_district: 'cityDistrict',
    city_sign_text: 'citySignText',
    city_decorations: 'cityDecorations'
  };
  const wtBody = {};
  for (const [snakeKey, camelKey] of Object.entries(FIELD_MAP)) {
    if (req.body[snakeKey] !== undefined) wtBody[camelKey] = req.body[snakeKey];
  }
  try {
    if (provider === 'github') {
      // Legacy Discord-anchored GitHub accounts resolve to their anchor;
      // standalone gh_ accounts proceed with their own id.
      const rr = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(du.id)}`);
      const rd = await rr.json();
      if (rd.linked && rd.discordUserId) discordId = rd.discordUserId;
    }
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${discordId}/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify(wtBody)
    });
    const data = await r.json();
    // Invalidate cosmetics cache so next chat message picks up the new profile pic immediately
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
    // Invalidate city cache if city-related prefs changed
    if (wtBody.cityDecorations !== undefined || wtBody.cityLayout !== undefined ||
        wtBody.cityBuildingStyle !== undefined || wtBody.cityDistrict !== undefined) {
      invalidateCityCache();
    }
    return res.status(r.status).json(data);
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

// ── Avatar upload ─────────────────────────────────────────────────────────
// Accepts a base64 data URL, writes a PNG to disk, saves URL in prefs.
app.post('/api/me/avatar', auth.requireUser, express.json({ limit: '4mb' }), async (req, res) => {
  const du = req.session.discordUser;
  const provider = du.provider || (du.id.startsWith('gh_') ? 'github' : du.id.startsWith('tt_') ? 'tiktok' : 'discord');
  let discordId = du.id;

  const { dataUrl } = req.body || {};
  if (!dataUrl || typeof dataUrl !== 'string') {
    return res.status(400).json({ ok: false, error: 'Missing dataUrl' });
  }

  // Validate format: must be a base64 PNG, JPEG, or WebP data URL
  const match = dataUrl.match(/^data:(image\/(png|jpeg|webp));base64,(.+)$/);
  if (!match) {
    return res.status(400).json({ ok: false, error: 'Invalid image format. Use PNG, JPEG, or WebP.' });
  }

  try {
    // Resolve discordId for legacy Discord-anchored GitHub accounts;
    // standalone gh_ accounts proceed with their own id.
    if (provider === 'github') {
      const rr = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(du.id)}`);
      const rd = await rr.json();
      if (rd.linked && rd.discordUserId) discordId = rd.discordUserId;
    }

    // Save image to disk
    const uploadsDir = path.join(__dirname, 'public', 'portal', 'uploads', 'avatars');
    await fs.promises.mkdir(uploadsDir, { recursive: true });
    const ext = match[2] === 'jpeg' ? 'jpg' : match[2];
    const filename = `${discordId}.${ext}`;
    const filepath = path.join(uploadsDir, filename);
    const imgBuffer = Buffer.from(match[3], 'base64');

    // Sanity-check decoded size (max 2MB)
    if (imgBuffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ ok: false, error: 'Image too large after decode (max 2MB)' });
    }

    await fs.promises.writeFile(filepath, imgBuffer);
    const avatarUrl = `/portal/uploads/avatars/${filename}`;

    // Persist URL in Word Tycoon account_preferences
    await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${discordId}/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({ customAvatarUrl: avatarUrl })
    });

    return res.json({ ok: true, url: avatarUrl });
  } catch (err) {
    console.error('[avatar upload]', err);
    return res.status(500).json({ ok: false, error: 'Upload failed' });
  }
});

app.post('/api/me/avatar/reset', auth.requireUser, async (req, res) => {
  const du = req.session.discordUser;
  const provider = du.provider || (du.id.startsWith('gh_') ? 'github' : du.id.startsWith('tt_') ? 'tiktok' : 'discord');
  let discordId = du.id;
  try {
    if (provider === 'github') {
      // Legacy anchor resolve; standalone gh_ accounts keep their own id.
      const rr = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(du.id)}`);
      const rd = await rr.json();
      if (rd.linked && rd.discordUserId) discordId = rd.discordUserId;
    }
    await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${discordId}/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({ customAvatarUrl: null })
    });
    return res.json({ ok: true });
  } catch {
    return res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.post('/api/me/profile/tap-upgrade', auth.requireUser, async (req, res) => {
  const du = req.session.discordUser;
  const provider = du.provider || (du.id.startsWith('gh_') ? 'github' : du.id.startsWith('tt_') ? 'tiktok' : 'discord');
  let discordId = du.id;
  const { upgradeType } = req.body || {};
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    if (provider === 'github') {
      // Legacy anchor resolve; standalone gh_ accounts keep their own id.
      const rr = await wtFetch(`${WORD_EMPIRES_URL}/api/link/resolve?platform=github&platformUserId=${encodeURIComponent(du.id)}`);
      const rd = await rr.json();
      if (rd.linked && rd.discordUserId) discordId = rd.discordUserId;
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

// Lightweight cosmetic visibility endpoint (used by all game pages).
// Visibility records ONLY hidden categories as false — an empty object means
// every category is visible. Do not reintroduce a { word_color:false,
// word_glow:false } default here: word cosmetics are a transient spawn
// effect now (PfpCosmetics.spawnWord), not a permanent tint.
app.get('/api/me/visibility', auth.requireUser, async (req, res) => {
  try {
    const du = req.session.discordUser;
    let accountId = du.id;
    // Resolve GitHub-only users to linked Discord ID
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
      return res.json({ ok: true, visibility: {} });
    }

    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/cosmetic-visibility/${encodeURIComponent(discordId)}`, {
      headers: { 'x-api-key': WT_API_SECRET }
    });
    const data = await r.json();
    res.json({ ok: true, visibility: data.visibility || {} });
  } catch {
    res.json({ ok: true, visibility: {} });
  }
});

// ─── Friend System Proxy Routes ───────────────────────────────────────────────

app.get('/api/me/friends', auth.requireUser, async (req, res) => {
  try {
    const accountId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/friends/list?discordId=${encodeURIComponent(accountId)}`);
    res.json(await r.json());
  } catch (e) { res.json({ ok: false, error: 'Failed to fetch friends' }); }
});

app.post('/api/me/friends/request', auth.requireUser, express.json(), async (req, res) => {
  try {
    const accountId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/friends/request`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requesterDiscordId: accountId, targetDiscordId: req.body.targetDiscordId })
    });
    res.json(await r.json());
  } catch (e) { res.json({ ok: false, error: 'Failed to send request' }); }
});

app.post('/api/me/friends/accept', auth.requireUser, express.json(), async (req, res) => {
  try {
    const accountId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/friends/accept`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: req.body.requestId, discordId: accountId })
    });
    res.json(await r.json());
  } catch (e) { res.json({ ok: false, error: 'Failed to accept' }); }
});

app.post('/api/me/friends/decline', auth.requireUser, express.json(), async (req, res) => {
  try {
    const accountId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/friends/decline`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requestId: req.body.requestId, discordId: accountId })
    });
    res.json(await r.json());
  } catch (e) { res.json({ ok: false, error: 'Failed to decline' }); }
});

app.post('/api/me/friends/remove', auth.requireUser, express.json(), async (req, res) => {
  try {
    const accountId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/friends/remove`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId: accountId, friendDiscordId: req.body.friendDiscordId })
    });
    res.json(await r.json());
  } catch (e) { res.json({ ok: false, error: 'Failed to remove friend' }); }
});

app.get('/api/me/friends/search', auth.requireUser, async (req, res) => {
  try {
    const q = encodeURIComponent(req.query.q || '');
    const accountId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/friends/search?q=${q}&exclude=${encodeURIComponent(accountId)}`);
    res.json(await r.json());
  } catch (e) { res.json({ ok: false, results: [] }); }
});

app.get('/api/me/friends/profile/:discordId', auth.requireUser, async (req, res) => {
  try {
    const myDiscordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const friendDiscordId = req.params.discordId;
    // Fetch both profiles in parallel
    const [myRes, friendRes] = await Promise.all([
      wtFetch(`${WORD_EMPIRES_URL}/api/friends/profile/${encodeURIComponent(myDiscordId)}`),
      wtFetch(`${WORD_EMPIRES_URL}/api/friends/profile/${encodeURIComponent(friendDiscordId)}`)
    ]);
    const myData = await myRes.json();
    const friendData = await friendRes.json();
    res.json({ ok: true, you: myData.profile || myData, friend: friendData.profile || friendData });
  } catch (e) { res.json({ ok: false, error: 'Failed to fetch profile' }); }
});

// ==================== DAILY CLAIM + STREAK ====================

app.get('/api/me/daily-claim/status', auth.requireUser, async (req, res) => {
  try {
    const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/daily-claim/status?discordId=${encodeURIComponent(discordId)}`);
    res.json(await r.json());
  } catch (e) { res.json({ ok: false, error: 'Failed to fetch claim status' }); }
});

app.post('/api/me/daily-claim', auth.requireUser, express.json(), async (req, res) => {
  try {
    const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/daily-claim`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordId })
    });
    res.json(await r.json());
  } catch (e) { res.json({ ok: false, error: 'Failed to process claim' }); }
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 30, 1), 50);
  const type = String(req.query.type || '').trim().toLowerCase();
  const fetchWindow = Math.min(Math.max((page * limit) + 50, 120), 500);

  try {
    const [acctRes, membershipRes] = await Promise.all([
      wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${discordId}`),
      wtFetch(`${WORD_EMPIRES_URL}/api/admin/membership/${discordId}`)
    ]);

    const [acctData, membershipData] = await Promise.all([
      acctRes.json(),
      membershipRes.json()
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

    const mergedEntries = [...ledgerEntries, ...membershipEntries].sort((a, b) => {
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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

app.get('/api/me/rectangled', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'rectangled');
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

app.get('/api/me/triangled', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'triangled');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      gamesParticipated: stats.totalWins || 0,
      history: (stats.history || []).map(h => ({
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch (err) {
    console.error('[Triangled stats error]', err.message);
    res.json({ ok: false, totalWins: 0, gamesParticipated: 0, history: [] });
  }
});

app.get('/api/me/wikisearchle', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'wikisearchle');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      gamesParticipated: stats.totalWins || 0,
      history: (stats.history || []).map(h => ({
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch (err) {
    console.error('[WikiSearchle stats error]', err.message);
    res.json({ ok: false, totalWins: 0, gamesParticipated: 0, history: [] });
  }
});

app.get('/api/me/spellingbee', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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

async function sendErectangledStats(req, res) {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'erectangled');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      gamesParticipated: stats.totalWins || 0,
      history: (stats.history || []).map(h => ({
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch (err) {
    console.error('[erecTangled stats error]', err.message);
    res.json({ ok: false, totalWins: 0, gamesParticipated: 0, history: [] });
  }
}

app.get('/api/me/erectangled', auth.requireUser, sendErectangledStats);
app.get('/api/me/sproutle', auth.requireUser, sendErectangledStats);


app.get('/api/me/figural', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const stats = await fetchCentralizedGameStats(discordId, 'figural');
    res.json({
      ok: true,
      totalWins: stats.totalWins || 0,
      gamesParticipated: stats.totalWins || 0,
      history: (stats.history || []).map(h => ({
        guessCount: h.guess_count,
        coinsAwarded: h.coins_awarded,
        timestamp: h.created_at
      }))
    });
  } catch (err) {
    console.error('[Figural stats error]', err.message);
    res.json({ ok: false, totalWins: 0, gamesParticipated: 0, history: [] });
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

  // Membership (Donor Class) checkout — named /pass/ historically; the season
  // pass itself was removed 2026-07-20 but these two endpoints are pure
  // membership plumbing (Stripe checkout + billing portal) and stay.
  app.post('/api/me/pass/checkout', auth.requireUser, express.json(), async (req, res) => {
    const resolved = await resolveWordTycoonAccountId(req.session.discordUser);
    if (!resolved.ok) return res.status(502).json({ ok: false, error: 'Game server unreachable' });
    if (!resolved.linked || !resolved.accountId) {
      return res.json({ ok: false, linked: false, error: 'Link your account to upgrade your membership.' });
    }

    const { tier } = req.body || {};
    if (!tier) {
      return res.status(400).json({ ok: false, error: 'Missing tier' });
    }

    const sessionUser = req.session.discordUser || {};
    const customerName = sessionUser.displayName || sessionUser.globalName || sessionUser.username || '';
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
      return res.json({ ok: false, linked: false, error: 'Link your account to manage your membership.' });
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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

// Mark owned cosmetics as seen (account-level, so new browsers don't re-alert)
app.post('/api/me/cosmetics/seen', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { cosmeticIds } = req.body || {};
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cosmetics/mark-seen`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordUserId: discordId, cosmeticIds: Array.isArray(cosmeticIds) ? cosmeticIds.slice(0, 400) : null })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Buy/upgrade a business (proxy to Mobile Tycoon)
app.post('/api/me/business/buy', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { businessType } = req.body;
  if (!businessType) return res.status(400).json({ ok: false, message: 'Missing businessType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/business/buy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({ discordUserId: discordId, businessType })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// ==================== VOICE PICKER (per-user) ====================
// Restored 2026-05-14 from server.js.bak-pre-email-capture-20260513-180134
// after a 2026-05-13 layout deploy clobbered this section. The streamer-
// side TTS endpoints (/api/me/voice-streamer/*, /api/voice/{catalog,tts})
// live in their own block earlier in this file (added 2026-05-14).

// Stripe membership tiers that unlock premium voice. Pookie Pass was retired
// 2026-07-12 (voice moved to Donor Class + TikTok Super Fan); it no longer
// grants voice. Donor Class remains the paid path; TikTok Super Fans are
// granted separately via the owner-channel is_superfan flag (see
// isLinkedTiktokSuperfan + getVoiceAccess below).
// Pookie Pass is back on sale (2026-08-03) as the non-TikTok route to Super
// Fan status, and Super Fans get premium voices — so it belongs here again.
// MUST stay in lockstep with the tier list in reconcileVoicePreferences below:
// that reconciler DELETES saved voices for anyone outside its allowlist, so a
// tier present here but missing there loses its voice within 6 hours.
const VOICE_TIERS_ALLOWED = new Set(['donor_class', 'pookie_pass']);
const WT_DB_PATH = '/opt/word-tycoon/data/word-tycoon.db';
const VOICE_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6h

// Periodic reconciliation — deletes voice_preferences for users who are no
// longer active subscribers and aren't on the admin override list. Reads WT's
// player_memberships table directly to avoid past API response-shape bugs.
// Defensive: if WT's db can't be read, we skip the run entirely rather than
// guessing free for everyone.
async function reconcileVoicePreferences() {
  let wt = null;
  try {
    const fs = require('fs');
    if (!fs.existsSync(WT_DB_PATH)) {
      console.warn('[VoiceReconcile] WT db missing, skipping');
      return;
    }
    // node:sqlite, NOT sql.js. sql.js has no file access — it reads the whole
    // database into a Buffer and parses it in memory, which for WT's ~150MB db
    // meant a 150MB+ heap spike every 6h just to read ~17 rows (the relay's PM2
    // max_memory_restart is 1.5G). A read-only handle does the same query in
    // ~2ms with no meaningful allocation. Same pattern as
    // readWordTycoonSnapshot() below — keep them consistent.
    const { DatabaseSync } = require('node:sqlite');
    wt = new DatabaseSync(WT_DB_PATH, { readOnly: true });
    // Keep this list identical to VOICE_TIERS_ALLOWED above — a tier granted
    // voice there but omitted here has its voice deleted on the next run.
    const memRows = wt.prepare(
      "SELECT discord_user_id FROM player_memberships WHERE status = 'active' AND tier IN ('donor_class', 'pookie_pass')"
    ).all();
    const activeSubs = new Set(memRows.map(r => r.discord_user_id));
    const admins = new Set((db.listVoiceAdmins() || []).map(a => a.discord_user_id));

    // TikTok Super Fans: resolve each owner-channel subscriber's TikTok handle
    // to its linked Discord/WT account so we don't reconcile away their voice.
    // Resolution is local (relay's linked-account cache) — no WT round-trips.
    const superfanIds = new Set();
    try {
      for (const handle of (db.listSuperfanTiktokHandles() || [])) {
        const linked = relay.lookupLinkedDiscord('tiktok', handle);
        if (linked) superfanIds.add(linked);
      }
    } catch (_) {}

    // Defensive: if WT looks empty AND we have voice prefs, something is wrong
    // — skip rather than nuke everyone.
    if (activeSubs.size === 0) {
      console.warn('[VoiceReconcile] 0 active subscribers found in WT — skipping (defensive)');
      return;
    }

    const prefs = db.listAllVoicePreferences ? db.listAllVoicePreferences() : [];
    const stale = [];
    for (const r of prefs) {
      const id = r.discord_user_id;
      const vid = String(r.voice_id || '');
      // Free voices (web: prefix → eSpeak / Piper) are ALWAYS allowed —
      // no API cost, no subscription required. Only delete prefs that
      // point at paid ElevenLabs voices for users who aren't subscribers
      // or admins. This fixes the bug where free viewers' picks were
      // reconciled away and bounced back to the eSpeak default.
      if (vid.startsWith('web:')) continue;
      // Platform-prefixed keys (e.g. tiktok:<userId>) belong to unlinked
      // viewers whose only admin gate is the assignment itself; memberships
      // and overrides are Discord-anchored and cannot match these keys.
      if (_isPlatformKey(id)) continue;
      if (!activeSubs.has(id) && !admins.has(id) && !superfanIds.has(id)) stale.push(id);
    }
    for (const id of stale) {
      try { db.clearVoicePreference(id); } catch (_) {}
    }
    if (stale.length) {
      console.log(`[VoiceReconcile] cleared ${stale.length} stale voice_preferences (kept free web: picks)`);
    }
  } catch (e) {
    console.warn('[VoiceReconcile] failed:', e.message);
  } finally {
    // Every early return above lands here — the handle must not outlive the run.
    try { wt?.close(); } catch (_) {}
  }
}

setTimeout(reconcileVoicePreferences, 60 * 1000);
setInterval(reconcileVoicePreferences, VOICE_RECONCILE_INTERVAL_MS);

// Is the account's LINKED TikTok a current owner-channel subscriber?
// Resolves the account's linked TikTok handle via WT's link status (the
// authoritative link store — keyed by handle, same key our users table uses),
// then reads the locally-maintained is_superfan flag. Returns false on any
// error so a WT/link hiccup never wrongly grants access.
// Every TikTok handle linked to a WT account. A user can have MULTIPLE (Shonna
// has 3), and per-handle flags like is_superfan land on whichever handle they
// actually chat under — so callers must check EVERY one, never just the first.
// A .find() here once silently missed flagged users whose primary link wasn't
// the handle they stream-chat with.
async function getLinkedTiktokHandles(discordAccountId) {
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/link/status/${encodeURIComponent(discordAccountId)}`);
    if (!r.ok) return [];
    const data = await r.json();
    return (data.accounts || [])
      .filter(a => a.platform === 'tiktok' && a.platform_user_id)
      .map(a => String(a.platform_user_id));
  } catch (_) {
    return [];
  }
}

async function isLinkedTiktokSuperfan(discordAccountId) {
  // Live is_superfan OR a manual owner override (db.isTiktokSuperfan checks both).
  for (const handle of await getLinkedTiktokHandles(discordAccountId)) {
    if (db.isTiktokSuperfan(handle)) return true;
  }
  return false;
}

async function getVoiceAccess(discordUserSession) {
  const directId = discordUserSession?.id || null;
  if (directId && db.isVoiceAdmin(directId)) {
    return { tier: 'admin', active: true, canSaveVoice: true, override: true };
  }
  const resolved = await resolveWordTycoonAccountId(discordUserSession);
  if (resolved.accountId && db.isVoiceAdmin(resolved.accountId)) {
    return { tier: 'admin', active: true, canSaveVoice: true, override: true };
  }
  if (!resolved.ok || !resolved.linked || !resolved.accountId) {
    return { tier: 'free', active: false, canSaveVoice: false, reason: 'unlinked' };
  }
  // TikTok Super Fan path — linked TikTok is a current subscriber of the
  // owner's channel. Checked before the Stripe membership so Super Fans get
  // voice even with no paid Word Tycoon membership.
  if (await isLinkedTiktokSuperfan(resolved.accountId)) {
    return { tier: 'tiktok_superfan', active: true, canSaveVoice: true, source: 'tiktok' };
  }
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/membership/${encodeURIComponent(resolved.accountId)}`);
    if (!r.ok) return { tier: 'free', active: false, canSaveVoice: false, reason: 'wt_error' };
    const data = await r.json();
    const m = data?.membership || {};
    const tier = String(m.tier || 'free').toLowerCase();
    const active = !!m.active;
    const canSaveVoice = active && VOICE_TIERS_ALLOWED.has(tier);
    return { tier, active, canSaveVoice, source: canSaveVoice ? 'donor' : undefined };
  } catch (e) {
    return { tier: 'free', active: false, canSaveVoice: false, reason: 'wt_unreachable' };
  }
}

// Authed — current user's saved voice preference.
app.get('/api/me/voice', auth.requireUser, async (req, res) => {
  try {
    const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const pref = db.getVoicePreference(discordId);
    res.json({ ok: true, voice_id: pref?.voice_id || null, updated_at: pref?.updated_at || null });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
});

// Authed — set / clear the current user's voice.
app.put('/api/me/voice', auth.requireUser, express.json(), async (req, res) => {
  try {
    const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
    const { voice_id } = req.body || {};

    if (voice_id === null || voice_id === '') {
      db.clearVoicePreference(discordId);
      return res.json({ ok: true, voice_id: null });
    }
    if (typeof voice_id !== 'string') {
      return res.status(400).json({ ok: false, error: 'voice_id_required' });
    }

    // Validate against the voice-tts catalog (fetched + cached by the
    // streamer TTS pipeline module — single source of truth for voices).
    const catalog = await streamerTtsPipeline._getCatalog();
    const catalogEntry = catalog.find(v => v.id === voice_id);
    if (!catalogEntry) {
      return res.status(400).json({ ok: false, error: 'voice_not_in_catalog' });
    }

    // Per-voice ACL — pretend the voice doesn't exist if the caller isn't allowed.
    if (Array.isArray(catalogEntry.allowedDiscordIds) && catalogEntry.allowedDiscordIds.length > 0) {
      const rawId = req.session?.discordUser?.id || null;
      const allowed = catalogEntry.allowedDiscordIds.includes(discordId) ||
                      (rawId && catalogEntry.allowedDiscordIds.includes(rawId));
      if (!allowed) return res.status(400).json({ ok: false, error: 'voice_not_in_catalog' });
    }

    // Free voices (Web Speech API) bypass the subscription gate. Premium
    // (ElevenLabs) voices require Donor Class+.
    const isFreeVoice = catalogEntry.kind === 'web';
    if (!isFreeVoice) {
      const access = await getVoiceAccess(req.session.discordUser);
      if (!access.canSaveVoice) {
        return res.status(402).json({
          ok: false,
          error: 'subscription_required',
          tier: access.tier,
          upgradeTo: 'donor_class',
          upgradeUrl: 'https://wordtycoon.live/me?tab=pass',
        });
      }
    }

    db.setVoicePreference(discordId, voice_id);
    res.json({ ok: true, voice_id });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'save_failed' });
  }
});

// Authed — lightweight check the picker page calls to render the gate banner.
app.get('/api/me/voice-access', auth.requireUser, async (req, res) => {
  try {
    const access = await getVoiceAccess(req.session.discordUser);
    res.json({ ok: true, ...access });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
});

// Public — manual voice request fallback from voice.wordtycoon.live for
// viewers who can't complete TikTok↔Discord linking. Only notifies the
// owner (Discord DM, channel fallback); the actual assignment stays a
// manual admin action, so this grants nothing by itself.
const VOICE_REQUEST_WINDOW_MS = 60 * 60 * 1000;
const VOICE_REQUEST_MAX_PER_IP = 3;
const voiceRequestHits = new Map(); // ip -> [timestamps]

app.post('/api/voice/request', express.json(), async (req, res) => {
  try {
    // CF-Connecting-IP = the real visitor; X-Real-IP behind Cloudflare is the CF edge IP (shared across many viewers).
    const ip = requestClientAddress(req) || 'unknown';
    const now = Date.now();
    const hits = (voiceRequestHits.get(ip) || []).filter(t => now - t < VOICE_REQUEST_WINDOW_MS);
    if (hits.length >= VOICE_REQUEST_MAX_PER_IP) {
      return res.status(429).json({ ok: false, error: 'rate_limited' });
    }

    const handle = String(req.body?.tiktok_username || '').trim().replace(/^@+/, '').toLowerCase();
    if (!/^[a-z0-9._]{2,24}$/.test(handle)) {
      return res.status(400).json({ ok: false, error: 'invalid_username' });
    }
    const voiceId = String(req.body?.voice_id || '');
    const catalog = await streamerTtsPipeline._getCatalog();
    const entry = catalog.find(v => v.id === voiceId);
    // Custom clones are owner-gated — not requestable through this form.
    if (!entry || (Array.isArray(entry.allowedDiscordIds) && entry.allowedDiscordIds.length > 0)) {
      return res.status(400).json({ ok: false, error: 'voice_not_in_catalog' });
    }

    const ownerId = process.env.STREAM_OWNER_DISCORD_ID || '179331908499406849';
    const premiumNote = entry.kind === 'web'
      ? 'free voice — preference only'
      : 'PREMIUM voice — needs voice-preference + voice-override row';
    const text = [
      '🎙️ **Voice request** (voice.wordtycoon.live)',
      `TikTok: \`@${handle}\` → **${entry.label}** (\`${voiceId}\`)`,
      `${premiumNote}`,
    ].join('\n');

    let delivered = false;
    const client = discord.getClient();
    if (client && client.isReady()) {
      try {
        const owner = await client.users.fetch(ownerId);
        await owner.send(text);
        delivered = true;
      } catch (e) {
        console.warn('[VoiceRequest] owner DM failed, falling back to channel:', e.message);
      }
    }
    if (!delivered && discord.isConnected()) {
      await discord.sendToChannel(`<@${ownerId}> ${text}`);
      delivered = true;
    }
    if (!delivered) {
      console.error(`[VoiceRequest] UNDELIVERED: @${handle} wants ${voiceId}`);
      return res.status(503).json({ ok: false, error: 'notify_failed' });
    }

    hits.push(now);
    voiceRequestHits.set(ip, hits);
    console.log(`[VoiceRequest] @${handle} → ${voiceId} (${entry.label}) from ${ip}`);
    res.json({ ok: true });
  } catch (e) {
    console.error('[VoiceRequest] failed:', e.message);
    res.status(500).json({ ok: false, error: 'request_failed' });
  }
});

// ── Premium game entitlement ─────────────────────────────────────────
// 2026-07-17 update: non-daily game modes (multiplayer + unlimited-solo)
// require Donor Class ($2/mo). Entitlement is the SAME grant set as premium
// voice — voice-admin override OR linked TikTok Super Fan (owner-channel
// subscriber) OR active Donor Class membership — so it reuses getVoiceAccess.
// If voice access ever diverges from game access, split this out instead of
// changing getVoiceAccess. Cached briefly per user because the portal calls
// this on every page load and getVoiceAccess makes 2-3 WT round-trips.
const entitlementCache = new Map(); // discordId -> { at, result }
const ENTITLEMENT_CACHE_MS = 60 * 1000;

app.get('/api/me/entitlement', async (req, res) => {
  try {
    const sess = req.session?.discordUser;
    if (!sess) return res.json({ ok: true, loggedIn: false, premium: false });
    const key = String(sess.id || '');
    const hit = entitlementCache.get(key);
    if (hit && Date.now() - hit.at < ENTITLEMENT_CACHE_MS) return res.json(hit.result);
    // Direct-session admin check first (mirrors getVoiceAccess), then the
    // shared by-id computation (admin/superfan/paid tier — includes Pookie,
    // unlike voice) against the resolved WT account.
    let premium = false;
    let source = null;
    if (key && db.isVoiceAdmin(key)) {
      premium = true;
      source = 'admin';
    } else {
      const resolved = await resolveWordTycoonAccountId(sess);
      if (resolved.accountId) {
        const computed = await computePremiumById(resolved.accountId);
        premium = computed.premium;
        source = computed.source;
      }
    }
    const result = { ok: true, loggedIn: true, premium, source };
    if (entitlementCache.size > 5000) entitlementCache.clear();
    entitlementCache.set(key, { at: Date.now(), result });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
});

// Auth-gated read: current user's monthly hint allowance.
// Mirrors /api/me/entitlement's session resolution so the portal/profile page
// can show remaining hints without exposing the account id to JS.
app.get('/api/me/hints', async (req, res) => {
  try {
    const sess = req.session?.discordUser;
    if (!sess) return res.json({ ok: true, loggedIn: false, remaining: 0 });

    let source = null;
    const key = String(sess.id || '');
    if (key && db.isVoiceAdmin(key)) {
      source = 'admin';
    } else {
      const resolved = await resolveWordTycoonAccountId(sess);
      if (resolved.accountId) {
        const computed = await computePremiumById(resolved.accountId);
        source = computed.source;
      }
    }

    const allowance = commands.HINT_ALLOWANCE[source] || 0;
    const monthKey = commands.currentMonthKey();
    if (allowance > 0) db.ensureHintGrant(key, monthKey, source, allowance);
    const totals = db.getHintTotals(key);
    res.json({
      ok: true,
      loggedIn: true,
      remaining: totals.remaining,
      granted: totals.granted,
      purchased: totals.purchased,
      used: totals.used,
      source: source || 'free',
      monthKey
    });
  } catch (e) {
    console.error('[Hints] /api/me/hints failed:', e.message);
    res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
});

// Initiate a Stripe Checkout to purchase extra hints ($1 = 10 hints).
// Called by the portal / games; proxies to Word Tycoon which owns Stripe.
app.post('/api/me/hints/recharge/checkout', express.json(), async (req, res) => {
  try {
    const sess = req.session?.discordUser;
    if (!sess) return res.status(401).json({ ok: false, error: 'login_required' });

    const resolved = await resolveWordTycoonAccountId(sess);
    const discordId = resolved.accountId || sess.id;
    if (!discordId) {
      return res.status(400).json({ ok: false, error: 'identity_required' });
    }

    const dollars = Math.max(0, Math.floor(Number((req.body && req.body.dollars) || 0)));
    if (dollars < 1) {
      return res.status(400).json({ ok: false, error: 'minimum_dollar_amount', message: 'Minimum recharge is $1' });
    }
    if (dollars > 100) {
      return res.status(400).json({ ok: false, error: 'maximum_dollar_amount', message: 'Maximum recharge is $100' });
    }

    const successUrl = `https://wordtycoon.live/portal/profile.html?tab=hints&checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `https://wordtycoon.live/portal/profile.html?tab=hints&checkout=cancelled`;

    const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/hints/recharge/checkout`, {
      method: 'POST',
      body: JSON.stringify({ discordUserId: discordId, dollars, successUrl, cancelUrl })
    });

    const text = await upstream.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { ok: false, message: text }; }
    if (!upstream.ok) {
      console.error('[Hints] recharge checkout upstream failed:', upstream.status, text);
      return res.status(upstream.status || 503).json({ ok: false, error: 'checkout_failed', message: data.message || 'Checkout failed' });
    }
    res.json(data);
  } catch (e) {
    console.error('[Hints] /api/me/hints/recharge/checkout failed:', e.message);
    res.status(500).json({ ok: false, error: 'checkout_failed' });
  }
});

// Public — premium entitlement by WT account id (read-only boolean).
// Used by game SERVERS to gate premium web play (Phase 2 enforcement) and by
// game CLIENTS as the cookie-less SSO fallback (they already know their id
// from the auth-token exchange). Follows the /api/public/visibility pattern:
// exposing a yes/no premium flag per account id is an accepted, low-risk
// read. Same grant set as /api/me/entitlement, minus session resolution.
const publicEntitlementCache = new Map(); // accountId -> { at, result }

// Unlike VOICE_TIERS_ALLOWED (which deliberately dropped Pookie Pass when
// voice moved to Donor Class + Super Fan), GAME access must include the
// grandfathered $10 Pookie holders — a higher paid tier always includes the
// $2 game unlock. Verified 2026-07-17: 2 active pookie subs still exist.
const GAME_PREMIUM_TIERS = new Set(['donor_class', 'pookie_pass']);

async function computePremiumById(accountId) {
  if (db.isVoiceAdmin(accountId)) return { premium: true, source: 'admin' };
  if (await isLinkedTiktokSuperfan(accountId)) return { premium: true, source: 'tiktok' };
  // Direct-handle Super Fan: the id handed to us may itself be a TikTok handle
  // (an unlinked chat viewer whose linkedDiscord fell back to the raw id).
  // isLinkedTiktokSuperfan only resolves handles LINKED to a WT account, so a
  // bare handle needs its own check.
  if (db.isTiktokSuperfan(String(accountId))) return { premium: true, source: 'tiktok' };
  // Callers hand us whatever the client holds, which for a TikTok web login is
  // tt_<open_id>. Nothing else in the system stores that prefix, so try the bare
  // form as well before concluding "not premium".
  const bareTiktokId = String(accountId).startsWith('tt_') ? String(accountId).slice(3) : null;
  if (bareTiktokId && db.isTiktokSuperfan(bareTiktokId)) return { premium: true, source: 'tiktok' };
  if (bareTiktokId && await isLinkedTiktokSuperfan(bareTiktokId)) return { premium: true, source: 'tiktok' };
  // Callers hand us whatever identity they hold — /api/public/entitlement takes
  // a client-asserted id straight off a game socket — but player_memberships is
  // keyed by the owning WT account. Resolve through the linked-groups cache so a
  // TikTok handle / numeric stream id / gh_ / google_ id finds its subscription;
  // 2026-07-22: without this every identity except a Discord snowflake read as
  // free, walling paying subscribers out of the games they'd bought.
  const membershipId = relay.resolveAnyLinkedDiscord(accountId)
    || (bareTiktokId && relay.resolveAnyLinkedDiscord(bareTiktokId))
    || accountId;
  if (membershipId !== accountId && db.isVoiceAdmin(membershipId)) {
    return { premium: true, source: 'admin' };
  }
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/membership/${encodeURIComponent(membershipId)}`);
    if (!r.ok) return { premium: false, source: null };
    const data = await r.json();
    const m = data?.membership || {};
    const premium = !!m.active && GAME_PREMIUM_TIERS.has(String(m.tier || 'free').toLowerCase());
    return { premium, source: premium ? 'donor' : null };
  } catch (e) {
    return { premium: false, source: null };
  }
}

// Internal — resolve a game socket's cookies to a verified identity.
//
// Called by src/game-shared.js on behalf of every game server. The game forwards
// the raw Cookie header it received on the Socket.IO handshake; we verify the
// signed portal session or wt_remember HMAC and return its verified identity.
// Device trust is optional: a live portal session alone is sufficient. Nothing
// the player's client asserted is involved, so a forged data.user.id cannot survive this.
//
// Requires the internal API key: the game servers are the only callers, and the
// endpoint must never be reachable from a browser.
const gameCookieIdentity = require('./src/game-cookie-identity').createGameCookieIdentity({
  secret: auth.initialize._sessionSecret,
  verifyRememberToken,
  isSessionActive: session => !session?.rememberSession || rememberSessions.activeSession(session.rememberSession, session.discordUser?.id),
  getSession(id, callback) {
    const store = auth.initialize._sessionStore;
    if (!store || typeof store.get !== 'function') return callback(Error('Portal session store unavailable'));
    store.get(id, callback);
  }
});
app.get('/api/internal/whoami', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!hasInternalApiKey(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
  try {
    // Sent as a header rather than the real Cookie so nginx/CDN caching and the
    // relay's own session middleware never touch it.
    const forwarded = req.headers['x-forwarded-cookie'] || '';
    const user = await gameCookieIdentity.resolve(forwarded);
    if (!user) return res.json({ ok: true, user: null });
    // The WT account this identity belongs to. A linked player legitimately
    // presents their anchor id in game payloads while their cookie proves the
    // gh_/go_/tt_ side — the game needs both to tell "same person" from
    // "impersonation".
    let anchorId = null;
    try { anchorId = relay.resolveAnyLinkedDiscord(user.id) || null; } catch (e) {}
    res.json({
      ok: true,
      user: { id: user.id, username: user.username, provider: user.provider, anchorId, aliases: relay.linkedAliasIds(anchorId || user.id) }
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'whoami_failed' });
  }
});

app.get('/api/public/entitlement', async (req, res) => {
  try {
    const id = String(req.query.discordId || '').trim();
    if (!id || id.length > 64) return res.json({ ok: true, premium: false });
    const hit = publicEntitlementCache.get(id);
    if (hit && Date.now() - hit.at < ENTITLEMENT_CACHE_MS) return res.json(hit.result);
    const { premium, source } = await computePremiumById(id);
    const result = { ok: true, premium, source };
    if (publicEntitlementCache.size > 5000) publicEntitlementCache.clear();
    publicEntitlementCache.set(id, { at: Date.now(), result });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
});

// Public — which perk badges an account wears, by WT account id.
//
// The relay already stamps `superfan` / `fan-club` badges onto CHAT identities
// (relay.js normalizeMessage), but those are keyed by TikTok handle. A player
// signed in on the website with Discord/GitHub/Google has no TikTok key, so
// game clients saw nothing and the badges only ever appeared in stream view.
// This is the web counterpart: hand it whatever id the game holds and it
// resolves the same three perks. Same read-only, low-risk shape as
// /api/public/entitlement — three booleans, no PII.
const PERKS_CACHE_MS = 60 * 1000;
const perksCache = new Map(); // accountId -> { at, result }

async function computePerksById(accountId) {
  const id = String(accountId || '').trim();
  if (!id) return { superfan: false, donor: false, fanClub: false, superDonor: false };
  // A TikTok web login presents tt_<open_id>; nothing else stores that prefix,
  // so the bare form has to be tried too (same reasoning as computePremiumById).
  const bare = id.startsWith('tt_') ? id.slice(3) : null;

  const handles = await getLinkedTiktokHandles(id);
  const tiktokIds = [id, bare, ...handles].filter(Boolean);

  let superfan = tiktokIds.some(h => db.isTiktokSuperfan(String(h)));

  // Fan club is scoped to the OWNER's channel — being in some other streamer's
  // fan club must not badge you here.
  const ownerHandle = ownerStreamerHandle();
  const fanClub = !!ownerHandle && tiktokIds.some(
    h => db.isFanClubOfStreamer('tiktok', String(h).toLowerCase(), ownerHandle)
  );

  // Paid membership, resolved through the linked-groups cache so a gh_/go_/
  // tt_ id or a bare TikTok handle still finds its subscription.
  let donor = false;
  const membershipId = relay.resolveAnyLinkedDiscord(id)
    || (bare && relay.resolveAnyLinkedDiscord(bare))
    || id;
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/membership/${encodeURIComponent(membershipId)}`);
    if (r.ok) {
      const m = (await r.json())?.membership || {};
      const tier = String(m.tier || 'free').toLowerCase();
      if (m.active && GAME_PREMIUM_TIERS.has(tier)) {
        donor = true;
        // Pookie Pass is the non-TikTok route to Super Fan status, so it wears
        // the Super Fan badge as well as the Donor one — it owns both sets.
        if (tier === 'pookie_pass') superfan = true;
      }
    }
  } catch (_) {}

  // Super Donor is purely derived — both entitlements at once. Pookie Pass
  // satisfies it on its own because the branch above already promotes it to
  // Super Fan on top of the Donor it is.
  return { superfan, donor, fanClub, superDonor: superfan && donor };
}

app.get('/api/public/perks', async (req, res) => {
  try {
    const id = String(req.query.discordId || '').trim();
    const none = { ok: true, superfan: false, donor: false, fanClub: false, superDonor: false };
    if (!id || id.length > 64) return res.json(none);
    const hit = perksCache.get(id);
    if (hit && Date.now() - hit.at < PERKS_CACHE_MS) return res.json(hit.result);
    const result = { ok: true, ...(await computePerksById(id)) };
    if (perksCache.size > 5000) perksCache.clear();
    perksCache.set(id, { at: Date.now(), result });
    res.json(result);
  } catch (e) {
    res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
});

// ── Monthly hint allowance ───────────────────────────────────────────
// Public read: how many hints remain this month for an account.
// Game servers proxy this through their own auth so the browser never
// needs to assert an account id.
const HINT_STATUS_CACHE_MS = 30 * 1000;
const hintStatusCache = new Map(); // discordId -> { at, result }

app.get('/api/public/hints', async (req, res) => {
  try {
    const id = String(req.query.discordId || '').trim();
    if (!id || id.length > 64) return res.status(400).json({ ok: false, error: 'identity_required' });
    const hit = hintStatusCache.get(id);
    if (hit && Date.now() - hit.at < HINT_STATUS_CACHE_MS) return res.json(hit.result);
    const { premium, source } = await computePremiumById(id);
    const allowance = commands.HINT_ALLOWANCE[source] || 0;
    const monthKey = commands.currentMonthKey();
    if (allowance > 0) db.ensureHintGrant(id, monthKey, source, allowance);
    const totals = db.getHintTotals(id);
    const result = {
      ok: true,
      remaining: totals.remaining,
      granted: totals.granted,
      purchased: totals.purchased,
      used: totals.used,
      source: source || 'free',
      monthKey
    };
    if (hintStatusCache.size > 5000) hintStatusCache.clear();
    hintStatusCache.set(id, { at: Date.now(), result });
    res.json(result);
  } catch (e) {
    console.error('[Hints] public hints lookup failed:', e.message);
    res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
});

require('./src/hint-reveals').installHintRevealRoutes(app, { db, hasInternalApiKey, computePremiumById, commands, hintStatusCache, secret: HINT_TOKEN_SECRET });

// Internal — game servers spend a hint on behalf of an authenticated user.
app.post('/api/hints/spend', express.json(), async (req, res) => {
  if (!hasInternalApiKey(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
  try {
    const discordId = String((req.body && req.body.discordId) || '').trim();
    const game = String((req.body && req.body.game) || '').trim().toLowerCase();
    if (!discordId || discordId.length > 64) return res.status(400).json({ ok: false, error: 'identity_required' });
    if (!game || game.length > 40) return res.status(400).json({ ok: false, error: 'game_required' });

    const { source } = await computePremiumById(discordId);
    const allowance = commands.HINT_ALLOWANCE[source] || 0;
    const monthKey = commands.currentMonthKey();
    if (allowance > 0) {
      db.ensureHintGrant(discordId, monthKey, source, allowance);
    }

    const spend = db.spendHint(discordId);
    if (!spend.ok) {
      return res.json({ ok: false, reason: 'no_hints_remaining', remaining: spend.remaining });
    }

    hintStatusCache.delete(discordId);
    console.log(`[Hints] spend ok: game=${game} account=${discordId} remaining=${spend.remaining}`);
    res.json({ ok: true, remaining: spend.remaining, source: source || 'free', monthKey });
  } catch (e) {
    console.error('[Hints] spend failed:', e.message);
    res.status(500).json({ ok: false, error: 'spend_failed' });
  }
});

// Internal — Word Tycoon credits hints after a successful Stripe recharge.
app.post('/api/internal/hints/recharge', express.json(), async (req, res) => {
  if (!hasInternalApiKey(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
  try {
    const discordId = String((req.body && req.body.discordId) || '').trim();
    const hints = Math.max(0, Math.floor(Number((req.body && req.body.hints) || 0)));
    const stripeSessionId = String((req.body && req.body.stripeSessionId) || '').trim();
    const monthKey = commands.currentMonthKey();

    if (!discordId || discordId.length > 64) {
      return res.status(400).json({ ok: false, error: 'identity_required' });
    }
    if (hints <= 0) {
      return res.status(400).json({ ok: false, error: 'amount_required' });
    }

    const result = db.purchaseHints(discordId, monthKey, hints, stripeSessionId || null);
    hintStatusCache.delete(discordId);
    console.log(`[Hints] recharge ok: account=${discordId} hints=${hints} remaining=${result.remaining}`);
    res.json({ ok: true, remaining: result.remaining, hints: result.amount, duplicated: !!result.duplicated });
  } catch (e) {
    console.error('[Hints] recharge failed:', e.message);
    res.status(500).json({ ok: false, error: 'recharge_failed' });
  }
});

// Internal — Word Tycoon (or other services) grant free hints to an account.
// Used for the daily login reward (+1 hint per day). Idempotent by sourceMonth
// when callers need it, but daily-claim callers pass a fresh date key each day.
app.post('/api/internal/hints/grant', express.json(), async (req, res) => {
  if (!hasInternalApiKey(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
  try {
    const discordId = String((req.body && req.body.discordId) || '').trim();
    const hints = Math.max(0, Math.floor(Number((req.body && req.body.hints) || 0)));
    const sourceMonth = String((req.body && req.body.sourceMonth) || 'lifetime').trim();

    if (!discordId || discordId.length > 64) {
      return res.status(400).json({ ok: false, error: 'identity_required' });
    }
    if (hints <= 0) {
      return res.status(400).json({ ok: false, error: 'amount_required' });
    }

    const result = db.grantHints(discordId, hints, sourceMonth);
    hintStatusCache.delete(discordId);
    console.log(`[Hints] grant ok: account=${discordId} hints=${hints} sourceMonth=${sourceMonth} remaining=${result.remaining}`);
    res.json({ ok: true, remaining: result.remaining, hints: result.amount });
  } catch (e) {
    console.error('[Hints] grant failed:', e.message);
    res.status(500).json({ ok: false, error: 'grant_failed' });
  }
});

// Public — a player's all-time win count in ONE game, for the shared win
// card's "🏆 N wins" chip. The auth-gated /api/player-game-stats proxy is
// dashboard-scoped; win counts are already public via /api/goat, so this
// read-only aggregate is safe to expose. Accepts a Discord id or any
// platform identity (resolved through the linked-accounts cache; the WT
// endpoint's own TikTok fallback covers unlinked TikTok players).
const PLAYER_WINS_CACHE_MS = 60 * 1000;
const playerWinsCache = new Map(); // game:id -> { at, totalWins }

app.get('/api/public/player-wins', async (req, res) => {
  try {
    const game = String(req.query.game || '').trim().toLowerCase();
    if (!game || game.length > 40) return res.status(400).json({ ok: false, error: 'game_required' });
    let id = String(req.query.discordId || '').trim();
    if (!id) {
      const userId = String(req.query.userId || '').trim();
      if (!userId || userId.length > 128) return res.status(400).json({ ok: false, error: 'identity_required' });
      id = relay.resolveAnyLinkedDiscord(userId) || userId;
    }
    if (id.length > 128) return res.status(400).json({ ok: false, error: 'identity_required' });
    const cacheKey = game + ':' + id;
    const hit = playerWinsCache.get(cacheKey);
    if (hit && Date.now() - hit.at < PLAYER_WINS_CACHE_MS) {
      return res.json({ ok: true, game, totalWins: hit.totalWins });
    }
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/player-game-stats/${encodeURIComponent(id)}?game=${encodeURIComponent(game)}`);
    const j = await r.json().catch(() => null);
    const totalWins = (j && typeof j.totalWins === 'number') ? j.totalWins : 0;
    if (playerWinsCache.size > 5000) playerWinsCache.clear();
    playerWinsCache.set(cacheKey, { at: Date.now(), totalWins });
    res.json({ ok: true, game, totalWins });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream_failed' });
  }
});

// Public — a player's equipped cosmetics, for win cards rendered on pages
// whose own server has no /api/cosmetics proxy. Same read-only data the
// portal and overlays already show publicly.
const PLAYER_COS_CACHE_MS = 60 * 1000;
const playerCosCache = new Map(); // platform:userId -> { at, equipped }

app.get('/api/public/player-cosmetics', async (req, res) => {
  try {
    const platform = String(req.query.platform || '').trim().toLowerCase();
    const userId = String(req.query.userId || '').trim();
    if (!platform || platform.length > 24 || !userId || userId.length > 128) {
      return res.status(400).json({ ok: false, error: 'identity_required' });
    }
    const cacheKey = platform + ':' + userId;
    const hit = playerCosCache.get(cacheKey);
    if (hit && Date.now() - hit.at < PLAYER_COS_CACHE_MS) {
      return res.json({ ok: true, equipped: hit.equipped });
    }
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/cosmetics/${encodeURIComponent(platform)}/${encodeURIComponent(userId)}`);
    const j = await r.json().catch(() => null);
    const equipped = (j && j.equipped) || {};
    if (playerCosCache.size > 5000) playerCosCache.clear();
    playerCosCache.set(cacheKey, { at: Date.now(), equipped });
    res.json({ ok: true, equipped });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'upstream_failed' });
  }
});

// ─── Social Feed API (portal Feed tab + Toon Tower ticker) ───────────
// Reads are public — the feed is global and carries the same data the
// overlays already broadcast. Reactions and comments require a portal
// session. Live pushes ride the Socket.IO 'feed' room (join-feed).

const feedActionLast = new Map(); // key -> last action ts
function feedRateLimited(key, ms) {
  const now = Date.now();
  const last = feedActionLast.get(key);
  if (last && now - last < ms) return true;
  if (feedActionLast.size > 5000) feedActionLast.clear();
  feedActionLast.set(key, now);
  return false;
}

app.get('/api/feed', (req, res) => {
  try {
    const beforeRaw = parseInt(req.query.before, 10);
    const limitRaw = parseInt(req.query.limit, 10);
    const events = feed.list({
      beforeId: Number.isFinite(beforeRaw) && beforeRaw > 0 ? beforeRaw : null,
      limit: Number.isFinite(limitRaw) ? limitRaw : 30,
      userId: req.session?.discordUser?.id || null
    });
    res.json({ ok: true, events, emojis: feed.REACTION_EMOJIS });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'feed_failed' });
  }
});

app.post('/api/feed/:id/react', auth.requireUser, express.json(), (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isFinite(eventId) || eventId <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
    const userId = req.session.discordUser.id;
    if (feedRateLimited('react:' + userId, 300)) return res.status(429).json({ ok: false, error: 'slow_down' });
    const result = feed.react(eventId, userId, String(req.body?.emoji || ''));
    if (result.error === 'bad_emoji') return res.status(400).json({ ok: false, error: 'bad_emoji' });
    if (result.error === 'not_found') return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({ ok: true, reacted: result.reacted, reactions: result.reactions });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'react_failed' });
  }
});

app.get('/api/feed/:id/comments', (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isFinite(eventId) || eventId <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
    res.json({ ok: true, comments: feed.comments(eventId) });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'comments_failed' });
  }
});

app.post('/api/feed/:id/comments', auth.requireUser, express.json(), async (req, res) => {
  try {
    const eventId = parseInt(req.params.id, 10);
    if (!Number.isFinite(eventId) || eventId <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
    const sessionUser = req.session.discordUser;
    const userId = sessionUser.id;
    if (feedRateLimited('comment:' + userId, 3000)) return res.status(429).json({ ok: false, error: 'slow_down' });
    const text = String(req.body?.text || '').trim().slice(0, 280);
    if (!text) return res.status(400).json({ ok: false, error: 'empty' });
    // Same moderation filter as portal chat — badges derived server-side only.
    const filterResult = chatFilter.filterMessage(text, { id: userId, discordId: userId, badges: [] });
    if (!filterResult.allowed) {
      return res.status(400).json({ ok: false, error: 'blocked', reason: filterResult.reason || 'Message blocked' });
    }
    const cosmetics = await getUserCosmetics(userId);
    const user = {
      displayName: sessionUser.globalName || sessionUser.username || 'Player',
      platform: 'mobile',
      platformUserId: userId,
      profilePic: sessionUser.avatar || null,
      cosmetics: cosmetics || null
    };
    const result = feed.comment(eventId, userId, user, filterResult.filtered);
    if (result.error === 'not_found') return res.status(404).json({ ok: false, error: 'not_found' });
    res.json({
      ok: true,
      comment: { id: result.id, userId: result.userId, user: result.user, text: result.text, createdAt: result.createdAt },
      commentCount: result.commentCount
    });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'comment_failed' });
  }
});

app.delete('/api/feed/comments/:commentId', auth.requireUser, (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId, 10);
    if (!Number.isFinite(commentId) || commentId <= 0) return res.status(400).json({ ok: false, error: 'bad_id' });
    const result = feed.deleteComment(commentId, req.session.discordUser.id, isAdminRequest(req));
    if (!result.deleted) return res.status(403).json({ ok: false, error: 'not_allowed' });
    res.json({ ok: true, eventId: result.eventId, commentCount: result.commentCount });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'delete_failed' });
  }
});

// Word Tycoon pushes purchase/level-up/cosmetic/lootbox events here —
// same key gate as /api/cosmetics-broadcast.
app.post('/api/feed-event', express.json(), async (req, res) => {
  if (!hasInternalApiKey(req)) return res.status(403).json({ error: 'Unauthorized' });
  const body = req.body || {};
  // Enrich with equipped cosmetics through the same cached pipeline the
  // game-win handler uses, so WT-pushed rows render rings/name effects too.
  try {
    const u = body.user;
    if (u && !u.cosmetics && u.platform && u.platformUserId) {
      const linked = u.linkedDiscord || relay.lookupLinkedDiscord(u.platform, u.platformUserId);
      if (linked) {
        const cosmetics = await getUserCosmetics(linked);
        if (cosmetics && Object.keys(cosmetics).length > 0) {
          body.user = { ...u, linkedDiscord: linked, cosmetics };
        }
      }
    }
  } catch (_) { /* cosmetic enrichment is optional — never block the event */ }
  const evt = feed.processWTEvent(body);
  if (!evt) return res.status(400).json({ ok: false, error: 'bad_event' });
  res.json({ ok: true, id: evt.id });
});
// User-created status posts for the Live Feed page.
app.post('/api/feed/post', auth.requireUser, express.json(), async (req, res) => {
  try {
    const sessionUser = req.session.discordUser;
    const userId = sessionUser.id;
    if (feedRateLimited('post:' + userId, 5000)) return res.status(429).json({ ok: false, error: 'slow_down' });
    const text = String(req.body?.text || '').trim().slice(0, 280);
    if (!text) return res.status(400).json({ ok: false, error: 'empty' });
    const filterResult = chatFilter.filterMessage(text, { id: userId, discordId: userId, badges: [] });
    if (!filterResult.allowed) {
      return res.status(400).json({ ok: false, error: 'blocked', reason: filterResult.reason || 'Message blocked' });
    }
    const cosmetics = await getUserCosmetics(userId);
    const user = {
      displayName: sessionUser.globalName || sessionUser.username || 'Player',
      platform: 'mobile',
      platformUserId: userId,
      profilePic: sessionUser.avatar || null,
      cosmetics: cosmetics || null
    };
    const evt = feed.post(user, filterResult.filtered);
    if (!evt) return res.status(500).json({ ok: false, error: 'post_failed' });
    res.json({ ok: true, event: evt });
  } catch (e) {
    console.error('[Feed post] failed:', e);
    res.status(500).json({ ok: false, error: 'post_failed' });
  }
});

// Admin — manage voice-access overrides (staff, mods, partners).
function requireAdminKey(req, res, next) {
  if (isAdminRequest(req) || hasInternalApiKey(req)) return next();
  return res.status(403).json({ ok: false, error: 'admin_required' });
}

app.get('/api/admin/voice-override', requireAdminKey, (_req, res) => {
  try {
    res.json({ ok: true, admins: db.listVoiceAdmins() });
  } catch (e) { res.status(500).json({ ok: false, error: 'lookup_failed' }); }
});

app.post('/api/admin/voice-override', requireAdminKey, express.json(), (req, res) => {
  try {
    const { discord_user_id, note } = req.body || {};
    if (typeof discord_user_id !== 'string' || !discord_user_id.trim()) {
      return res.status(400).json({ ok: false, error: 'discord_user_id_required' });
    }
    db.grantVoiceAdmin(discord_user_id.trim(), note || null);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'grant_failed' }); }
});

app.delete('/api/admin/voice-override', requireAdminKey, express.json(), (req, res) => {
  try {
    const { discord_user_id } = req.body || {};
    if (typeof discord_user_id !== 'string' || !discord_user_id.trim()) {
      return res.status(400).json({ ok: false, error: 'discord_user_id_required' });
    }
    db.revokeVoiceAdmin(discord_user_id.trim());
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'revoke_failed' }); }
});

// Admin — manual TikTok Super Fan list. A marked handle gets the SAME grant set
// as a live owner-channel Super Fan: Donor-tier game perks + premium voices,
// via the shared bridge (computePremiumById / getVoiceAccess / relay badge).
// Exists because TikTok's live super-fan signal only fires on rare events, so
// real Super Fans (paying TikTok subscribers) otherwise read as free. Manual
// removal only — no auto-expiry.
app.get('/api/admin/superfan', requireAdminKey, (_req, res) => {
  try {
    // manual = owner-marked overrides; automatic = live is_superfan flag set by
    // the TikTok owner-channel pipeline (read-only on the page, for visibility).
    res.json({ ok: true, manual: db.listSuperfanOverrides(), automatic: db.listLiveSuperfans() });
  } catch (e) { res.status(500).json({ ok: false, error: 'lookup_failed' }); }
});

app.post('/api/admin/superfan', requireAdminKey, express.json(), (req, res) => {
  try {
    const { platform_user_id, display_name, note } = req.body || {};
    if (typeof platform_user_id !== 'string' || !platform_user_id.trim()) {
      return res.status(400).json({ ok: false, error: 'platform_user_id_required' });
    }
    // db.addSuperfanOverride normalizes (strips @, lowercases) to match how
    // TikTok handles are stored in the users table / arrive on chat identities.
    db.addSuperfanOverride('tiktok', platform_user_id, (display_name || '').trim() || null, (note || '').trim() || null, 'admin');
    perksCache.clear();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'grant_failed' }); }
});

app.delete('/api/admin/superfan', requireAdminKey, express.json(), (req, res) => {
  try {
    const { platform_user_id } = req.body || {};
    if (typeof platform_user_id !== 'string' || !platform_user_id.trim()) {
      return res.status(400).json({ ok: false, error: 'platform_user_id_required' });
    }
    db.removeSuperfanOverride('tiktok', platform_user_id);
    perksCache.clear();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'revoke_failed' }); }
});

// ─── Members hub (/admin/superfans) ──────────────────────────────────────
// One roster of everyone who holds a perk — Super Fans, Donor Class members
// and the owner's TikTok fan club — with their Word Tycoon link status on the
// same row. The link column is the point: a Super Fan or Donor whose TikTok
// handle isn't linked to a WT account silently gets none of their perks on the
// web games (the Miss Joyce / Shayla failure mode), and that is invisible on
// any of the per-cohort views.

// Donors + the authoritative link table live in Word Tycoon's sqlite. Read it
// directly (read-only) rather than over HTTP: WT exposes no membership LIST
// endpoint, and linked_accounts carries the display names/avatars we need for
// donor rows anyway. node:sqlite, NOT sql.js — the WT db is ~150MB and sql.js
// would load the whole file into memory on every page load.
const WT_SNAPSHOT_TTL_MS = 30_000;
let _wtSnapshotCache = null;
let _wtSnapshotAt = 0;

function readWordTycoonSnapshot() {
  if (_wtSnapshotCache && Date.now() - _wtSnapshotAt < WT_SNAPSHOT_TTL_MS) {
    return _wtSnapshotCache;
  }
  const empty = {
    ok: false, donors: new Map(), linksByAccount: new Map(),
    accountByIdentity: new Map(), profileByAccount: new Map(), candidates: [],
  };
  let handle = null;
  try {
    const fs = require('fs');
    if (!fs.existsSync(WT_DB_PATH)) return empty;
    const { DatabaseSync } = require('node:sqlite');
    handle = new DatabaseSync(WT_DB_PATH, { readOnly: true });

    const donors = new Map();
    for (const r of handle.prepare(
      `SELECT discord_user_id, tier, status, current_period_end, cancel_at_period_end,
              stripe_subscription_id
         FROM player_memberships WHERE status = 'active' AND tier = 'donor_class'`
    ).all()) {
      donors.set(String(r.discord_user_id), {
        tier: r.tier,
        status: r.status,
        currentPeriodEnd: r.current_period_end || null,
        cancelAtPeriodEnd: !!r.cancel_at_period_end,
        // Drives the admin hub's read-only treatment: a Stripe-backed row can
        // only be cancelled in Stripe, so the page must not offer a Remove
        // button that would silently fail (or worse, look like it worked).
        stripeBacked: !!String(r.stripe_subscription_id || '').trim(),
      });
    }

    // accountByIdentity is keyed the same way relay.js keys its linked cache
    // ("platform:platformUserId") so a TikTok handle resolves to its WT anchor.
    const linksByAccount = new Map();
    const accountByIdentity = new Map();
    for (const r of handle.prepare(
      `SELECT discord_user_id, platform, platform_user_id, display_name, profile_pic, username, linked_at
         FROM linked_accounts`
    ).all()) {
      const acct = String(r.discord_user_id);
      const entry = {
        platform: r.platform,
        platformUserId: String(r.platform_user_id),
        displayName: r.display_name || r.username || null,
        profilePic: r.profile_pic || null,
        linkedAt: r.linked_at || null,
      };
      if (!linksByAccount.has(acct)) linksByAccount.set(acct, []);
      linksByAccount.get(acct).push(entry);
      accountByIdentity.set(`${r.platform}:${entry.platformUserId}`, acct);
      if (r.platform === 'tiktok') {
        // TikTok rows are filed under the handle, the numeric stream id, or a
        // tt_<open_id> depending on which path wrote them — index the
        // lowercased handle too so a chat-sourced handle still resolves.
        accountByIdentity.set(`tiktok:${entry.platformUserId.toLowerCase()}`, acct);
      }
    }

    // Link targets for the inline "link to account" control. Built from
    // linked_accounts (every account that has ever linked anything) plus
    // discord/mobile players, which is how WT's own quicklink identifies an
    // account. Deliberately NOT WT's /api/admin/accounts/search-discord —
    // that filters to platform IN ('discord','mobile') and so cannot find the
    // gh_/go_ standalone accounts that hold real donor subscriptions.
    const candidates = new Map();
    const addCandidate = (id, name, platform) => {
      const key = String(id || '');
      if (!key) return;
      if (!candidates.has(key)) candidates.set(key, { accountId: key, name: null, platforms: new Set() });
      const c = candidates.get(key);
      if (!c.name && name) c.name = name;
      if (platform) c.platforms.add(platform);
    };
    for (const [acct, links] of linksByAccount) {
      for (const l of links) addCandidate(acct, l.displayName, l.platform);
    }
    for (const acct of donors.keys()) addCandidate(acct, null, null);
    // profileByAccount is the last-resort name/avatar for a donor whose
    // linked_accounts rows carry no display_name (several real ones don't).
    const profileByAccount = new Map();
    for (const r of handle.prepare(
      `SELECT platform, platform_user_id, username, display_name, profile_pic
         FROM players WHERE platform IN ('discord', 'mobile')`
    ).all()) {
      const name = r.display_name || r.username || null;
      addCandidate(r.platform_user_id, name, r.platform);
      const acct = String(r.platform_user_id);
      if (!profileByAccount.has(acct)) {
        profileByAccount.set(acct, { displayName: name, profilePic: r.profile_pic || null });
      }
    }

    _wtSnapshotCache = {
      ok: true,
      donors,
      linksByAccount,
      accountByIdentity,
      profileByAccount,
      candidates: [...candidates.values()].map(c => ({
        accountId: c.accountId,
        name: c.name,
        platforms: [...c.platforms],
        donor: donors.has(c.accountId),
      })),
    };
    _wtSnapshotAt = Date.now();
    return _wtSnapshotCache;
  } catch (e) {
    console.warn('[MembersHub] WT snapshot read failed:', e.message);
    return empty;
  } finally {
    try { handle?.close(); } catch (_) {}
  }
}

// Fan club rows are scoped to the OWNER's channel only. streamer_handle in
// fan_club_memberships is the SITE handle (relay._resolveStreamerHandle
// returns streamers.get().handle), NOT the TikTok handle — they differ for
// most streamers, including the owner. Shared by the roster read and the
// fan-club grant/revoke writes so they can never disagree about the key.
function ownerStreamerHandle() {
  const ownerId = process.env.STREAM_OWNER_DISCORD_ID || '179331908499406849';
  try { return streamers.get(ownerId)?.handle || null; } catch (_) { return null; }
}

app.get('/api/admin/members', requireAdminKey, (_req, res) => {
  try {
    const wt = readWordTycoonSnapshot();
    const ownerHandle = ownerStreamerHandle();

    // people is keyed by TikTok handle for chat identities and by "wt:<id>" for
    // donors with no TikTok row, so someone who is two things is ONE row.
    const people = new Map();
    const norm = (h) => String(h || '').trim().replace(/^@+/, '').toLowerCase();

    function rowFor(key, seed) {
      if (!people.has(key)) {
        people.set(key, {
          key,
          handle: null, accountId: null,
          displayName: null, profilePic: null,
          superfan: null, donor: null, fanClub: null,
          linked: false, linkedPlatforms: [],
        });
      }
      const row = people.get(key);
      if (seed) {
        if (!row.displayName && seed.displayName) row.displayName = seed.displayName;
        if (!row.profilePic && seed.profilePic) row.profilePic = seed.profilePic;
      }
      return row;
    }

    // 1. Super Fans — manual overrides are authoritative, live flags are the
    //    unreliable TikTok signal. Both land on the same row.
    for (const e of (db.listSuperfanOverrides() || [])) {
      const handle = norm(e.platform_user_id);
      if (!handle) continue;
      const row = rowFor(handle, { displayName: e.display_name });
      row.handle = handle;
      row.superfan = { ...(row.superfan || {}), manual: true, note: e.note || null, grantedAt: e.granted_at || null };
    }
    for (const e of (db.listLiveSuperfans() || [])) {
      const handle = norm(e.platform_user_id);
      if (!handle) continue;
      const row = rowFor(handle, { displayName: e.display_name });
      row.handle = handle;
      row.superfan = { manual: false, ...(row.superfan || {}), auto: true };
    }

    // 2. Owner's TikTok fan club.
    if (ownerHandle) {
      for (const e of (db.listFanClubMembers(ownerHandle) || [])) {
        const handle = norm(e.platform_user_id);
        if (!handle) continue;
        const row = rowFor(handle, { displayName: e.display_name || e.username, profilePic: e.profile_pic });
        row.handle = handle;
        row.fanClub = { since: e.recorded_at || null };
      }
    }

    // Fill in names/avatars for Super Fan rows that never came from the fan-club join.
    const missing = [...people.values()].filter(r => r.handle && (!r.displayName || !r.profilePic)).map(r => r.handle);
    for (const p of (db.getUserProfiles('tiktok', missing) || [])) {
      const row = people.get(norm(p.platform_user_id));
      if (!row) continue;
      if (!row.displayName) row.displayName = p.display_name || p.username || null;
      if (!row.profilePic) row.profilePic = p.profile_pic || null;
    }

    // 3. Resolve each TikTok row to its WT account before folding donors in, so
    //    a donor who also chats on TikTok merges into their existing row.
    for (const row of people.values()) {
      if (!row.handle) continue;
      const acct = wt.accountByIdentity.get(`tiktok:${row.handle}`) ||
                   relay.lookupLinkedDiscord('tiktok', row.handle) || null;
      if (acct) {
        row.accountId = acct;
        row.linked = true;
        row.linkedPlatforms = wt.linksByAccount.get(acct) || [];
      }
    }

    // 4. Donors, keyed by WT account. Merge into the TikTok rows that resolved
    //    to the same account; otherwise stand alone. One person can hold two
    //    TikTok handles and so occupy two rows — badge BOTH, or their donor
    //    status would silently depend on which handle sorted first.
    const byAccount = new Map();
    for (const row of people.values()) {
      if (!row.accountId) continue;
      if (!byAccount.has(row.accountId)) byAccount.set(row.accountId, []);
      byAccount.get(row.accountId).push(row);
    }
    for (const [acct, donor] of wt.donors) {
      let rows = byAccount.get(acct);
      if (!rows || !rows.length) {
        const row = rowFor(`wt:${acct}`);
        row.accountId = acct;
        row.linked = true;
        row.linkedPlatforms = wt.linksByAccount.get(acct) || [];
        rows = [row];
        byAccount.set(acct, rows);
      }
      const fallback = wt.profileByAccount.get(acct) || {};
      for (const row of rows) {
        row.donor = donor;
        if (!row.displayName) {
          row.displayName = (row.linkedPlatforms || []).find(p => p.displayName)?.displayName
            || fallback.displayName || null;
        }
        if (!row.profilePic) {
          row.profilePic = (row.linkedPlatforms || []).find(p => p.profilePic)?.profilePic
            || fallback.profilePic || null;
        }
      }
    }

    const list = [...people.values()];
    const counts = {
      total: list.length,
      superfans: list.filter(r => r.superfan).length,
      // Distinct accounts, not rows — a donor with two TikTok handles is one
      // donor even though they badge two rows.
      donors: new Set(list.filter(r => r.donor).map(r => r.accountId)).size,
      fanClub: list.filter(r => r.fanClub).length,
      // "Perk holder with no WT account" — the rows that need action. Fan club
      // alone grants cosmetics without a link, so it doesn't count as broken.
      unlinked: list.filter(r => !r.linked && (r.superfan || r.donor)).length,
    };

    res.json({
      ok: true,
      people: list,
      counts,
      wtOk: wt.ok,
      ownerHandle,
    });
  } catch (e) {
    console.error('[MembersHub] failed:', e.message);
    res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
});

// Admin — candidate Word Tycoon accounts for the hub's inline link control.
app.get('/api/admin/members/account-search', requireAdminKey, (req, res) => {
  try {
    const q = String(req.query.q || '').trim().toLowerCase();
    if (q.length < 2) return res.json({ ok: true, results: [] });
    const wt = readWordTycoonSnapshot();
    const results = wt.candidates
      .filter(c => c.accountId.toLowerCase().includes(q) || (c.name || '').toLowerCase().includes(q))
      // Exact account-id paste first, then donors, then everything else.
      .sort((a, b) => {
        const ax = a.accountId.toLowerCase() === q ? 0 : a.donor ? 1 : 2;
        const bx = b.accountId.toLowerCase() === q ? 0 : b.donor ? 1 : 2;
        return ax - bx || String(a.name || '').localeCompare(String(b.name || ''));
      })
      .slice(0, 20);
    res.json({ ok: true, results, wtOk: wt.ok });
  } catch (e) {
    res.status(500).json({ ok: false, error: 'search_failed' });
  }
});

// Admin — link a TikTok handle to a Word Tycoon account from the hub. Thin
// wrapper over WT's link endpoint that also drops our cached WT snapshot and
// refreshes relay.js's linked cache, so the row flips to LINKED on the next
// reload instead of after the 30s / 5min TTLs.
app.post('/api/admin/members/link', requireAdminKey, express.json(), async (req, res) => {
  try {
    const { accountId, platform, platformUserId } = req.body || {};
    if (typeof accountId !== 'string' || !accountId.trim()) {
      return res.status(400).json({ ok: false, error: 'accountId_required' });
    }
    if (typeof platformUserId !== 'string' || !platformUserId.trim()) {
      return res.status(400).json({ ok: false, error: 'platformUserId_required' });
    }
    const plat = String(platform || 'tiktok').trim().toLowerCase();
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/accounts/${encodeURIComponent(accountId.trim())}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: plat, platformUserId: platformUserId.trim() }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      return res.status(502).json({ ok: false, error: data.message || 'link_failed' });
    }
    _wtSnapshotCache = null;
    try { await relay.refreshLinkedCache(); } catch (_) {}
    res.json({ ok: true, message: data.message || 'linked' });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'word_tycoon_unreachable' });
  }
});

// Admin — fan club membership for the owner's channel, granted/revoked by hand
// from the Members hub. Normally these rows are written by the TikTok pipeline
// when a fan-club member chats; this is the manual override for people the
// pipeline never saw (or who joined off-stream).
app.post('/api/admin/members/fan-club', requireAdminKey, express.json(), (req, res) => {
  try {
    const handle = String(req.body?.platform_user_id || '').trim().replace(/^@+/, '').toLowerCase();
    if (!handle) return res.status(400).json({ ok: false, error: 'platform_user_id_required' });
    const ownerHandle = ownerStreamerHandle();
    if (!ownerHandle) return res.status(503).json({ ok: false, error: 'owner_handle_unresolved' });
    db.recordFanClubMembership('tiktok', handle, ownerHandle);
    perksCache.clear();
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'grant_failed' }); }
});

app.delete('/api/admin/members/fan-club', requireAdminKey, express.json(), (req, res) => {
  try {
    const handle = String(req.body?.platform_user_id || '').trim().replace(/^@+/, '').toLowerCase();
    if (!handle) return res.status(400).json({ ok: false, error: 'platform_user_id_required' });
    const ownerHandle = ownerStreamerHandle();
    if (!ownerHandle) return res.status(503).json({ ok: false, error: 'owner_handle_unresolved' });
    const removed = db.removeFanClubMembership('tiktok', handle, ownerHandle);
    perksCache.clear();
    res.json({ ok: true, removed });
  } catch (e) { res.status(500).json({ ok: false, error: 'revoke_failed' }); }
});

// Admin — manual Donor Class, proxied to Word Tycoon (player_memberships lives
// there). WT refuses both directions on a Stripe-backed row; surface its 409
// verbatim rather than pretending the change landed.
//
// Drops the WT snapshot and both entitlement caches on success so the perk is
// live immediately instead of after the 30s / 60s TTLs.
async function setManualDonor(req, res, method) {
  const accountId = String(req.body?.accountId || '').trim();
  if (!accountId) return res.status(400).json({ ok: false, error: 'accountId_required' });
  try {
    const url = `${WORD_EMPIRES_URL}/api/admin/membership/${encodeURIComponent(accountId)}/manual-tier`;
    const r = await wtFetch(url, method === 'POST'
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tier: 'donor_class' }) }
      : { method: 'DELETE' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || data.ok === false) {
      return res.status(r.status === 409 ? 409 : 502).json({
        ok: false,
        code: data.code || null,
        error: data.message || 'donor_update_failed',
      });
    }
    _wtSnapshotCache = null;
    entitlementCache.clear();
    publicEntitlementCache.clear();
    perksCache.clear();
    res.json({ ok: true, membership: data.membership || null, grantedSets: data.grantedSets || [] });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'word_tycoon_unreachable' });
  }
}

app.post('/api/admin/members/donor', requireAdminKey, express.json(), (req, res) => setManualDonor(req, res, 'POST'));
app.delete('/api/admin/members/donor', requireAdminKey, express.json(), (req, res) => setManualDonor(req, res, 'DELETE'));

// Admin — balances owing (pay-to-play blocks). Viewers flagged here have all
// their chat withheld from every game by relay.js until the admin clears
// them (manual-only clearing — no automatic donor detection, since these
// viewers typically have no linked Discord account to check).
app.get('/api/admin/balances-owing', requireAdminKey, (_req, res) => {
  try {
    res.json({ ok: true, entries: db.listBalancesOwing() });
  } catch (e) { res.status(500).json({ ok: false, error: 'lookup_failed' }); }
});

app.post('/api/admin/balances-owing', requireAdminKey, express.json(), (req, res) => {
  try {
    const { tiktok_user_id, display_name, amount_dollars, note } = req.body || {};
    if (typeof tiktok_user_id !== 'string' || !tiktok_user_id.trim()) {
      return res.status(400).json({ ok: false, error: 'tiktok_user_id_required' });
    }
    const amount = Number(amount_dollars);
    if (!Number.isFinite(amount) || amount < 0) {
      return res.status(400).json({ ok: false, error: 'amount_invalid' });
    }
    db.addBalanceOwing({
      tiktokUserId: tiktok_user_id,
      displayName: (display_name || '').trim() || null,
      amountDollars: amount,
      note: (note || '').trim() || null,
    });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'save_failed' }); }
});

app.delete('/api/admin/balances-owing', requireAdminKey, express.json(), (req, res) => {
  try {
    const { tiktok_user_id } = req.body || {};
    if (typeof tiktok_user_id !== 'string' || !tiktok_user_id.trim()) {
      return res.status(400).json({ ok: false, error: 'tiktok_user_id_required' });
    }
    db.clearBalanceOwing(tiktok_user_id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false, error: 'clear_failed' }); }
});

// Anonymous, aggregate conversion tracking for the Daily 3 acquisition
// funnel. Event names and labels are allowlisted to keep the table bounded;
// attribution accepts only compact UTM-style tokens.
app.post('/api/usage/event', express.json({ limit: '2kb' }), (req, res) => {
  try {
    const host = (req.hostname || '').toLowerCase();
    const ua = req.headers['user-agent'] || '';
    if (!usageTrackableHost(host) || !ua || USAGE_BOT_RE.test(ua)) return res.sendStatus(204);

    if (req.headers.origin) {
      let originHost = '';
      try { originHost = new URL(req.headers.origin).hostname.toLowerCase(); } catch { return res.sendStatus(403); }
      if (!usageTrackableHost(originHost)) return res.sendStatus(403);
    }
    if (!usageEventAllowed(req.ip || 'unknown')) return res.sendStatus(429);

    const event = String(req.body?.event || '');
    const label = String(req.body?.label || '');
    const allowedLabels = USAGE_EVENT_LABELS[event];
    if (!allowedLabels || !allowedLabels.has(label)) {
      return res.status(400).json({ ok: false, error: 'invalid_usage_event' });
    }

    db.recordUsageEvent({
      day: new Date().toISOString().slice(0, 10),
      event,
      page: '/daily',
      label,
      source: usageCampaignToken(req.body?.source),
      medium: usageCampaignToken(req.body?.medium),
      campaign: usageCampaignToken(req.body?.campaign)
    });
    res.sendStatus(204);
  } catch (e) {
    console.error('[usage event] record failed:', e?.message);
    res.sendStatus(204);
  }
});

// Admin — site usage analytics. Data comes from the tracking middleware near
// the top of this file; backs /admin/usage.
app.get('/api/admin/usage', requireAdminKey, (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    res.json({
      ok: true,
      days,
      series: db.getUsageDailySeries(days),
      topPages: db.getUsageTopPages(days, 25),
      topReferrers: db.getUsageTopReferrers(days, 15),
      topEvents: db.getUsageTopEvents(days, 50),
      totals: db.getUsageTotals()
    });
  } catch (e) {
    console.error('[usage admin] query failed:', e?.message);
    res.status(500).json({ ok: false, error: 'usage_query_failed' });
  }
});

// Admin — set someone else's voice preference. Skips the subscription gate
// and ACL (admin auth implies the operator is authorized to assign any voice).
app.post('/api/admin/voice-preference', requireAdminKey, express.json(), async (req, res) => {
  try {
    const { discord_user_id, voice_id } = req.body || {};
    if (typeof discord_user_id !== 'string' || !discord_user_id.trim()) {
      return res.status(400).json({ ok: false, error: 'discord_user_id_required' });
    }
    if (voice_id === null || voice_id === '') {
      db.clearVoicePreference(discord_user_id.trim());
      return res.json({ ok: true, voice_id: null });
    }
    if (typeof voice_id !== 'string') {
      return res.status(400).json({ ok: false, error: 'voice_id_required' });
    }
    const catalog = await streamerTtsPipeline._getCatalog();
    if (!catalog.find(v => v.id === voice_id)) {
      return res.status(400).json({ ok: false, error: 'voice_not_in_catalog' });
    }
    db.setVoicePreference(discord_user_id.trim(), voice_id);
    res.json({ ok: true, discord_user_id: discord_user_id.trim(), voice_id });
  } catch (e) {
    console.error('[voice-pref admin] save failed:', e?.message);
    res.status(500).json({ ok: false, error: 'save_failed' });
  }
});

// ─── Voice Assignment Admin Panel APIs ───────────────────────────────
// Backing /admin/voices.html: one place to look up a viewer, see their
// current voice + access, and assign/revoke voices. Supports both linked
// Discord IDs and raw TikTok handles (unlinked viewers).
//
// Unlinked TikTok viewers are keyed by "tiktok:<platformUserId>" in
// voice_preferences — the same key shape the TTS pipeline already uses as a
// fallback. Premium voices assigned to platform keys do NOT need a
// voice_admin_override row; the nightly reconcile job skips platform-prefixed
// keys because memberships/admins are all Discord-anchored.

function _normTiktokHandle(handle) {
  return String(handle || '').trim().replace(/^@+/, '').toLowerCase();
}

function _isDiscordId(s) {
  return /^\d{17,20}$/.test(String(s).trim());
}

function _isPlatformKey(s) {
  return /^[a-z]+:/.test(String(s).trim());
}

// Resolve an admin lookup query into the key we store the voice preference
// under. Returns { key, kind, tiktok_handle?, discord_id?, platform_user_id? }.
async function _resolveVoiceAdminKey(query) {
  const raw = String(query.discord_id || query.tiktok_handle || '').trim();
  if (!raw) return null;

  // Plain Discord snowflake.
  if (_isDiscordId(raw)) {
    return { key: raw, kind: 'discord', discord_id: raw };
  }

  // Already a platform key (e.g. pasted from another tool).
  if (_isPlatformKey(raw)) {
    return { key: raw, kind: 'platform' };
  }

  // TikTok handle: prefer a linked Discord account, otherwise look up the
  // platform user id in the local users table so we can key by tiktok:<id>.
  const handle = _normTiktokHandle(raw);
  const linked = relay.resolveAnyLinkedDiscord(handle);
  if (linked) return { key: linked, kind: 'discord', discord_id: linked, tiktok_handle: handle };

  const legacyLinked = db.getLinkedDiscord('tiktok', handle);
  if (legacyLinked) return { key: legacyLinked, kind: 'discord', discord_id: legacyLinked, tiktok_handle: handle };

  const user = db.findUserByUsername('tiktok', handle);
  if (user?.platform_user_id) {
    const key = `tiktok:${user.platform_user_id}`;
    return { key, kind: 'platform', tiktok_handle: handle, platform_user_id: user.platform_user_id };
  }

  return { key: null, kind: 'tiktok_unlinked', tiktok_handle: handle };
}

function _voiceFromCatalog(catalog, voiceId) {
  if (!voiceId) return null;
  return catalog.find(v => v.id === voiceId) || null;
}

// Admin — look up a viewer's current voice state by Discord ID or TikTok handle.
app.get('/api/admin/voice-user', requireAdminKey, async (req, res) => {
  try {
    const resolved = await _resolveVoiceAdminKey(req.query || {});
    if (!resolved) {
      return res.status(400).json({ ok: false, error: 'discord_id_or_tiktok_handle_required' });
    }
    if (!resolved.key) {
      return res.status(404).json({
        ok: false,
        error: 'tiktok_not_found',
        tiktok_handle: resolved.tiktok_handle,
        detail: 'TikTok handle has not chatted yet and is not linked.',
      });
    }

    const key = resolved.key;
    const catalog = await streamerTtsPipeline._getCatalog();
    const pref = db.getVoicePreference(key);
    const override = resolved.kind === 'discord' ? db.getVoiceAdmin(key) : null;
    const access = resolved.kind === 'discord' ? await getVoiceAccess({ id: key }) : null;

    res.json({
      ok: true,
      key,
      kind: resolved.kind,
      discord_id: resolved.discord_id || null,
      tiktok_handle: resolved.tiktok_handle || null,
      platform_user_id: resolved.platform_user_id || null,
      preference: pref ? {
        voice_id: pref.voice_id,
        voice: _voiceFromCatalog(catalog, pref.voice_id),
        updated_at: pref.updated_at,
      } : null,
      override: override ? {
        note: override.note,
        granted_at: override.granted_at,
      } : null,
      access,
    });
  } catch (e) {
    console.error('[voice-admin] lookup failed:', e?.message);
    res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
});

// Admin — assign a voice to a viewer. Accepts either a Discord ID or a
// platform key (e.g. tiktok:12345). Premium Discord assignments grant a
// voice_admin_override row so they survive reconcile; platform-key
// assignments are immune to reconcile by prefix.
app.post('/api/admin/voice-assign', requireAdminKey, express.json(), async (req, res) => {
  try {
    const { key, voice_id } = req.body || {};
    if (typeof key !== 'string' || !key.trim()) {
      return res.status(400).json({ ok: false, error: 'key_required' });
    }
    if (typeof voice_id !== 'string' || !voice_id.trim()) {
      return res.status(400).json({ ok: false, error: 'voice_id_required' });
    }

    const targetKey = key.trim();
    const catalog = await streamerTtsPipeline._getCatalog();
    const entry = catalog.find(v => v.id === voice_id);
    if (!entry) {
      return res.status(400).json({ ok: false, error: 'voice_not_in_catalog' });
    }

    // Private/clone voices may restrict usage to specific Discord IDs or
    // platform-prefixed viewer keys (e.g. 'tiktok:aquaelly').
    if (Array.isArray(entry.allowedDiscordIds) && entry.allowedDiscordIds.length > 0) {
      if (!entry.allowedDiscordIds.includes(targetKey)) {
        return res.status(403).json({
          ok: false,
          error: 'voice_not_available_for_target',
          detail: 'This clone is restricted to specific viewers.',
        });
      }
    }

    const isPremium = entry.kind !== 'web';
    const isDiscord = _isDiscordId(targetKey);
    const actor = getAdminActorLogData(req);
    const note = `assigned ${entry.label} (${voice_id}) via voice admin panel`;

    db.setVoicePreference(targetKey, voice_id);
    if (isPremium && isDiscord) {
      db.grantVoiceAdmin(targetKey, note);
    }

    console.log('[Voice-Admin] assign', targetKey, voice_id, isPremium ? 'premium' : 'free', 'actor:', JSON.stringify(actor));
    res.json({
      ok: true,
      key: targetKey,
      voice_id,
      voice: entry,
      override_granted: isPremium && isDiscord,
    });
  } catch (e) {
    console.error('[voice-admin] assign failed:', e?.message);
    res.status(500).json({ ok: false, error: 'save_failed' });
  }
});

// Admin — revoke a viewer's voice preference, override, or both.
app.post('/api/admin/voice-revoke', requireAdminKey, express.json(), async (req, res) => {
  try {
    const { key, what } = req.body || {};
    if (typeof key !== 'string' || !key.trim()) {
      return res.status(400).json({ ok: false, error: 'key_required' });
    }
    const validWhat = new Set(['preference', 'override', 'both']);
    if (!validWhat.has(what)) {
      return res.status(400).json({ ok: false, error: 'what_must_be_preference_override_or_both' });
    }

    const targetKey = key.trim();
    const isDiscord = _isDiscordId(targetKey);
    const actor = getAdminActorLogData(req);

    if (what === 'preference' || what === 'both') {
      db.clearVoicePreference(targetKey);
    }
    if ((what === 'override' || what === 'both') && isDiscord) {
      db.revokeVoiceAdmin(targetKey);
    }

    console.log('[Voice-Admin] revoke', targetKey, what, 'actor:', JSON.stringify(actor));
    res.json({ ok: true, key: targetKey, revoked: what });
  } catch (e) {
    console.error('[voice-admin] revoke failed:', e?.message);
    res.status(500).json({ ok: false, error: 'revoke_failed' });
  }
});

// Admin — list all current voice preferences with their override status.
// Lightweight; for the "recent assignments" view in /admin/voices.html.
app.get('/api/admin/voice-assignments', requireAdminKey, (_req, res) => {
  try {
    const prefs = db.listAllVoicePreferences();
    const overrides = new Map(
      db.listVoiceAdmins().map(o => [o.discord_user_id, o])
    );
    res.json({
      ok: true,
      assignments: prefs.map(p => ({
        key: p.discord_user_id,
        is_platform: _isPlatformKey(p.discord_user_id),
        voice_id: p.voice_id,
        updated_at: p.updated_at,
        override: overrides.has(p.discord_user_id) ? {
          note: overrides.get(p.discord_user_id).note,
          granted_at: overrides.get(p.discord_user_id).granted_at,
        } : null,
      })),
    });
  } catch (e) {
    console.error('[voice-admin] list assignments failed:', e?.message);
    res.status(500).json({ ok: false, error: 'lookup_failed' });
  }
});

// Preview proxy — fetches voice-tts's per-voice sample clip ("Hi, I'm X. This
// is what I sound like.") so the admin volume page can A/B levels.
app.get('/api/voice/preview', async (req, res) => {
  try {
    const voiceId = String(req.query.voice_id || '');
    if (!voiceId) return res.status(400).json({ error: 'voice_id_required' });
    const upstream = await fetch(`${streamerTtsPipeline.VOICE_URL}/api/voices/${encodeURIComponent(voiceId)}/preview`);
    if (!upstream.ok) {
      return res.status(502).json({ error: 'voice_preview_failed', status: upstream.status });
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: 'voice_proxy_error', detail: String(e?.message || e).slice(0, 200) });
  }
});

// Admin — read/write per-voice gain overrides applied to TTS playback.
// Backs the /admin/voice-volumes.html slider page. Proxies the request to
// the private voice-tts service which owns the storage + catalog merge.
app.get('/api/admin/voice-gains', requireAdminKey, async (req, res) => {
  try {
    const upstream = await fetch(`${streamerTtsPipeline.VOICE_URL}/api/admin/voice-gains`);
    if (!upstream.ok) {
      return res.status(502).json({ ok: false, error: 'voice_service_unavailable' });
    }
    const data = await upstream.json();
    res.json(data);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'voice_proxy_error', detail: String(e?.message || e).slice(0, 200) });
  }
});

app.put('/api/admin/voice-gains', requireAdminKey, express.json(), async (req, res) => {
  try {
    const upstream = await fetch(`${streamerTtsPipeline.VOICE_URL}/api/admin/voice-gains`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gains: req.body?.gains || {} }),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) return res.status(upstream.status).json(data);
    // Bust the relay's 5-min catalog cache so the new gains ship on the
    // very next tts-play instead of waiting up to 5 minutes.
    try { await relay.refreshVoiceCatalogCache(); } catch (_) {}
    res.json(data);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'voice_proxy_error', detail: String(e?.message || e).slice(0, 200) });
  }
});

// ==================== PIZZA SHOP PROXY ENDPOINTS ====================

// Get pizza shop state
app.get('/api/me/pizza', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/pizza/${discordId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Initialize pizza shop
app.post('/api/me/pizza/init', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/newspaper/${discordId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Initialize newspaper route
app.post('/api/me/newspaper/init', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/gym/${discordId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/gym/init', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cinema/${discordId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/cinema/init', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
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

// ==================== STARTUP PROXY ENDPOINTS ====================

app.get('/api/me/startup', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/startup/${discordId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/startup/init', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/startup/${discordId}/init`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/startup/upgrade', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/startup/${discordId}/upgrade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/startup/upgrade-max', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/startup/${discordId}/upgrade-max`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/startup/collect', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/startup/${discordId}/collect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/startup/prestige', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/startup/${discordId}/prestige`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/startup/customize', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/startup/${discordId}/customize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/startup/rename', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { name } = req.body;
  if (!name) return res.status(400).json({ ok: false, message: 'Missing name' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/startup/${discordId}/rename`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// ==================== BANK PROXY ENDPOINTS ====================

app.get('/api/me/bank', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/bank/${discordId}`);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/bank/init', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/bank/${discordId}/init`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/bank/upgrade', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/bank/${discordId}/upgrade`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/bank/upgrade-max', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/bank/${discordId}/upgrade-max`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/bank/collect', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/bank/${discordId}/collect`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/bank/prestige', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/bank/${discordId}/prestige`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/bank/customize', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/bank/${discordId}/customize`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

app.post('/api/me/bank/rename', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { name } = req.body;
  if (!name) return res.status(400).json({ ok: false, message: 'Missing name' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/bank/${discordId}/rename`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// ==================== CAR WASH PROXY ENDPOINTS ====================

app.get('/api/me/carwash', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}`);
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to fetch car wash data' }); }
});

app.post('/api/me/carwash/init', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}/init`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to init car wash' }); }
});

app.post('/api/me/carwash/upgrade', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}/upgrade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upgradeType }) });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to upgrade' }); }
});

app.post('/api/me/carwash/upgrade-max', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}/upgrade-max`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upgradeType }) });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to max upgrade' }); }
});

app.post('/api/me/carwash/collect', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}/collect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to collect' }); }
});

app.get('/api/me/carwash/tax-season', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}/tax-season`);
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to load Tax Season state' }); }
});

app.post('/api/me/carwash/tax-season', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { confirmation, resetReason } = req.body || {};
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}/tax-season`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation, resetReason })
    });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to run Tax Season' }); }
});

app.post('/api/me/carwash/prestige', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}/prestige`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to prestige' }); }
});

app.post('/api/me/carwash/customize', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { category, value } = req.body;
  if (!category || !value) return res.status(400).json({ ok: false, message: 'Missing category or value' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}/customize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, value }) });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to customize' }); }
});

app.post('/api/me/carwash/rename', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { name } = req.body;
  if (!name) return res.status(400).json({ ok: false, message: 'Missing name' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to rename' }); }
});

app.post('/api/me/carwash/buy-stockmogul', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/carwash/${discordId}/buy-stockmogul`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to buy Stock Mogul' }); }
});

// ==================== STOCK MOGUL PROXY ENDPOINTS ====================

app.get('/api/me/stockmogul', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/stockmogul/${discordId}`);
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to fetch portfolio data' }); }
});

app.post('/api/me/stockmogul/init', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/stockmogul/${discordId}/init`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to init portfolio' }); }
});

app.post('/api/me/stockmogul/upgrade', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/stockmogul/${discordId}/upgrade`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upgradeType }) });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to upgrade' }); }
});

app.post('/api/me/stockmogul/upgrade-max', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { upgradeType } = req.body;
  if (!upgradeType) return res.status(400).json({ ok: false, message: 'Missing upgradeType' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/stockmogul/${discordId}/upgrade-max`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upgradeType }) });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to max upgrade' }); }
});

app.post('/api/me/stockmogul/collect', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/stockmogul/${discordId}/collect`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to collect' }); }
});

app.post('/api/me/stockmogul/prestige', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/stockmogul/${discordId}/prestige`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to prestige' }); }
});

app.post('/api/me/stockmogul/customize', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { category, value } = req.body;
  if (!category || !value) return res.status(400).json({ ok: false, message: 'Missing category or value' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/stockmogul/${discordId}/customize`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, value }) });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to customize' }); }
});

app.post('/api/me/stockmogul/rename', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { name } = req.body;
  if (!name) return res.status(400).json({ ok: false, message: 'Missing name' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/stockmogul/${discordId}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    res.json(await r.json());
  } catch { res.status(500).json({ ok: false, message: 'Failed to rename' }); }
});

// Get library data (proxy to Word Tycoon)
app.get('/api/me/library', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  try {
    const query = new URLSearchParams(req.query).toString();
    const url = `${WORD_EMPIRES_URL}/api/admin/accounts/${discordId}/library${query ? '?' + query : ''}`;
    const r = await wtFetch(url);
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Buy a cosmetic (proxy to Mobile Tycoon)
app.post('/api/me/cosmetics/buy', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { cosmeticId } = req.body;
  if (!cosmeticId) return res.status(400).json({ ok: false, message: 'Missing cosmeticId' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cosmetics/buy-for-discord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordUserId: discordId, cosmeticId })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Buy a gift set (proxy to Mobile Tycoon)
app.post('/api/me/cosmetics/buyset', auth.requireUser, async (req, res) => {
  const discordId = await getCurrentWordTycoonAccountId(req.session.discordUser);
  const { setKey } = req.body;
  if (!setKey) return res.status(400).json({ ok: false, message: 'Missing setKey' });
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/admin/cosmetics/buyset-for-discord`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordUserId: discordId, setKey })
    });
    res.json(await r.json());
  } catch { res.status(502).json({ ok: false, error: 'Game server unreachable' }); }
});

// Serve Word Bank Admin at /word-bank
app.use('/word-bank', express.static(path.join(__dirname, 'public', 'word-bank')));

// /me is RETIRED (301'd 2026-08-09): the 16-tab SPA's features all live on
// standalone toon pages now (/profile, /store, /membership, /library,
// /how-to-play, and the Tower's Empire floor). The SPA files stay on disk
// unrouted. 301 on purpose — the address is permanently gone.
app.get(['/me', '/me/'], (req, res) => {
  res.redirect(301, '/');
});
// Your Suite — the standalone toon replacement for the SPA's profile tab.
// Guest-browsable: signed-out visitors get the sign-in door rather than a
// redirect, so the URL survives the OAuth round trip (returnTo=/profile).
app.get(['/profile', '/profile/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal', 'profile.html'));
});
// The Rulebook — standalone toon replacement for the SPA's How to Play tab.
// /rules stays as an alias because it's the URL spoken on stream
// ("WordTycoon.Live/Rules"); it serves the same file rather than
// redirecting so the address bar keeps the spoken URL.
app.get(['/how-to-play', '/how-to-play/', '/rules', '/rules/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal', 'how-to-play.html'));
});
// Daily 3 — a guest-first acquisition loop that combines the canonical
// Wordle, Betwixt, and PixeLetters dailies into one shareable score.
// The page embeds the existing same-origin solo routes; it does not create
// guest player records or duplicate any game/reward logic.
app.get(['/daily', '/daily/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal', 'daily.html'));
});
// The Library — standalone toon replacement for the SPA's Library tab.
// Guest-browsable: the Scoring ledger is public documentation; Words and
// Stats show sign-in keycards when /api/me/library answers 401.
app.get(['/library', '/library/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal', 'library.html'));
});
// The Penthouse — standalone toon replacement for the SPA's Membership
// (pass) tab. Guest-browsable sales floor: plans render for everyone,
// Stripe CTAs need the session (/api/me/pass/* are auth-gated).
app.get(['/membership', '/membership/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal', 'membership.html'));
});
// The Vault — standalone toon replacement for the SPA's Store tab. The
// shop APIs are all login-gated, so signed-out visitors get the keycard
// door client-side.
app.get(['/store', '/store/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'portal', 'store.html'));
});
app.get(['/portal', '/portal/', '/portal/index.html'], (req, res) => {
  res.redirect(301, '/');
});
app.use('/portal', express.static(path.join(__dirname, 'public', 'portal')));

// TycoonIO: business management pages use old app.js SPA shell
app.get(['/tycoonio/business/:businessType', '/tycoonio/businesses', '/tycoonio/businesses/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tycoonio', 'manage.html'));
});
// TycoonIO: main city view
app.get(['/tycoonio', '/tycoonio/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'tycoonio', 'index.html'));
});
app.use('/tycoonio', express.static(path.join(__dirname, 'public', 'tycoonio')));

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

// TycoonIO City data — cached, refreshed every 60s
let cachedCityData = null;
let cityDataTimestamp = 0;
function invalidateCityCache() { cityDataTimestamp = 0; }
app.get('/api/city', async (req, res) => {
  const now = Date.now();
  if (cachedCityData && now - cityDataTimestamp < 60000 && !req.query.fresh) {
    return res.json(cachedCityData);
  }
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/city-data?limit=500`);
    const data = await r.json();
    cachedCityData = {
      ok: true,
      players: data.players || [],
      liveGames: (cachedLiveState?.games || []).map(g => ({
        id: g.id, name: g.name, playerCount: g.playerCount, status: g.status
      })),
      timestamp: now
    };
    cityDataTimestamp = now;
    res.json(cachedCityData);
  } catch (e) {
    res.status(502).json({ ok: false, error: 'City data unavailable' });
  }
});

// Streamer Dashboard — main wordgame.live page
app.get(['/streamer', '/streamer/dashboard'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'streamer', 'index.html'));
});

// Pro dashboard — the full editor (widgets/layout/cosmetics, bots, OBS,
// raw-JSON rules). The page bounces non-owners to /streamer client-side,
// and every owner-only API behind it is enforced by requireStreamOwner.
app.get('/streamer/pro', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'streamer', 'pro.html'));
});

// Stream Bridge — public download page + EXE download
const streamBridgePagePath = path.join(__dirname, 'public', 'stream-bridge', 'index.html');
app.get(['/stream-bridge', '/streambridge'], (req, res) => {
  res.sendFile(streamBridgePagePath);
});
app.get([
  '/stream-bridge/download/TycoonStreamBridge.exe',
  '/streambridge/download/TycoonStreamBridge.exe',
  '/stream-bridge/download/TycoonStreamBridge-20260401.exe',
  '/streambridge/download/TycoonStreamBridge-20260401.exe',
  '/stream-bridge/download/TycoonStreamBridge-20260419.exe',
  '/streambridge/download/TycoonStreamBridge-20260419.exe',
  '/stream-bridge/download/TycoonStreamBridge-v0.2.1.exe',
  '/streambridge/download/TycoonStreamBridge-v0.2.1.exe',
  '/download/TycoonStreamBridge.exe',
  '/download/TycoonStreamBridge-20260401.exe',
  '/download/TycoonStreamBridge-20260419.exe',
  '/download/TycoonStreamBridge-v0.2.1.exe'
], (req, res) => {
  const exePath = path.join(__dirname, 'tools', 'streamer-bridge', 'dist', 'TycoonStreamBridge.exe');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.download(exePath, 'TycoonStreamBridge-v0.2.1.exe', (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'File not found' });
  });
});
app.get([
  '/stream-bridge/download/TycoonStreamBridge-portable.zip',
  '/streambridge/download/TycoonStreamBridge-portable.zip',
  '/stream-bridge/download/TycoonStreamBridge-portable-20260401.zip',
  '/streambridge/download/TycoonStreamBridge-portable-20260401.zip',
  '/stream-bridge/download/TycoonStreamBridge-portable-20260419.zip',
  '/streambridge/download/TycoonStreamBridge-portable-20260419.zip',
  '/stream-bridge/download/TycoonStreamBridge-portable-v0.2.1.zip',
  '/streambridge/download/TycoonStreamBridge-portable-v0.2.1.zip',
  '/download/TycoonStreamBridge-portable.zip',
  '/download/TycoonStreamBridge-portable-20260401.zip',
  '/download/TycoonStreamBridge-portable-20260419.zip',
  '/download/TycoonStreamBridge-portable-v0.2.1.zip'
], (req, res) => {
  const zipPath = path.join(__dirname, 'tools', 'streamer-bridge', 'dist', 'TycoonStreamBridge-portable.zip');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  res.download(zipPath, 'TycoonStreamBridge-portable-v0.2.1.zip', (err) => {
    if (err && !res.headersSent) res.status(404).json({ error: 'Portable zip not available yet' });
  });
});

// Admin pages
app.get('/admin/jackpots', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'jackpots.html'));
});

// Balances owing — flag viewers who must pay before they can play again.
// The page itself is harmless without login: every API call it makes goes
// through requireAdminKey, so unauthenticated visitors just see empty data.
app.get('/admin/balances', (req, res) => {
  if (!isAdminRequest(req)) return res.redirect('/admin/login');
  res.sendFile(path.join(__dirname, 'public', 'admin', 'balances.html'));
});

app.get('/admin/superfans', (req, res) => {
  if (!isAdminRequest(req)) return res.redirect('/admin/login');
  res.sendFile(path.join(__dirname, 'public', 'admin', 'superfans.html'));
});

// Site usage analytics — page views, uniques, top pages, referrers
app.get('/admin/usage', (req, res) => {
  if (!isAdminRequest(req)) return res.redirect('/admin/login');
  res.sendFile(path.join(__dirname, 'public', 'admin', 'usage.html'));
});

// Admin landing page — directory of admin tools
app.get(['/admin', '/admin/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// Admin dashboard (moved from / — protected by auth middleware above)
app.get('/admin/dashboard', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Public root (wordtycoon.live only — direct IP access gets admin dashboard):
// the Toon Tower serves everyone — guest onboarding when logged out, player
// mode (live Empire, real balances) when the page detects a session client-side.
// Hosts that get the public portal at /. wordtycoon.live is the canonical
// deployment; PUBLIC_PORTAL_HOSTS (comma-separated) adds more.
const PORTAL_HOSTS = new Set(
  (process.env.PUBLIC_PORTAL_HOSTS || '')
    .split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
);
// Hosts that get the HangStream-branded landing page at / instead of the
// Word Tycoon portal (the WT portal stays reachable at /home and /hub).
const HANGSTREAM_LANDING_HOSTS = new Set(
  (process.env.HANGSTREAM_LANDING_HOSTS || 'play.hangstream.me')
    .split(',').map(h => h.trim().toLowerCase()).filter(Boolean)
);
app.get('/', (req, res) => {
  const host = (req.hostname || '').toLowerCase();
  if (HANGSTREAM_LANDING_HOSTS.has(host)) {
    return res.sendFile(path.join(__dirname, 'public', 'play.html'));
  }
  if (PORTAL_HOSTS.has(host)) {
    return res.redirect(301, '/play.html');
  }
  // Admin dashboard for direct IP/localhost access — require login
  if (!isAdminRequest(req)) return res.redirect('/admin/login');
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// The Word Tycoon Toon Tower homepage is retired — /home and /hub now just
// bounce to /, which serves the HangStream Play landing on this deployment.
app.get(['/home', '/home/', '/hub', '/hub/'], (req, res) => {
  res.redirect(301, '/');
});

// Live Feed — public social feed of wins, dailies, jackpots, businesses, etc.
app.get(['/feed', '/feed/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'feed.html'));
});

app.get(['/wikirectangled', '/wikirectangled/'], (req, res) => {
  res.redirect(302, '/game/wikirectangled/');
});

// Synapse — semantic bridge game (static page, APIs in src/synapse.js)
app.get(['/synapse', '/synapse/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'synapse.html'));
});
// Synapse Multiplayer arena (real-time race; engine in src/synapse-mp.js over io)
app.get(['/synapse/mp', '/synapse/mp/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'synapse-mp.html'));
});

// Cloud Quarry — self-contained 2D canvas game. Keeping the public URL as one
// segment means it also works with the production vhost's safe top-level route.
app.get(['/cloudquarry', '/cloudquarry/'], (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'cloudquarry.html'));
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
    tiktokDirect: tiktokDirect.isConnected(),
    youtube: youtube.isConnected(),
    discord: discord.isConnected(),
    discordSearchle: discordSearchle.isConnected()
  });
});

app.get('/api/health', async (_req, res) => {
  const memory = process.memoryUsage();
  const sessionStats = await auth.getSessionStats();
  let wordTycoonReachable = false;
  let wordTycoonStatus = null;
  let wordTycoonError = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/status`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    wordTycoonReachable = upstream.ok;
    wordTycoonStatus = await upstream.json();
  } catch (err) {
    wordTycoonError = err.message;
  }

  res.json({
    ok: true,
    uptimeSec: Math.floor(process.uptime()),
    memoryMB: {
      rss: Math.round(memory.rss / (1024 * 1024)),
      heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
      heapTotal: Math.round(memory.heapTotal / (1024 * 1024)),
      external: Math.round(memory.external / (1024 * 1024))
    },
    sessions: sessionStats,
    sassieForwarderEnabled: !!(process.env.SASSIE_ENABLED === '1' || process.env.SASSIE_URL),
    ailiciaForwarder: ailicia.getStats(),
    wordTycoonReachable,
    wordTycoonStatus,
    wordTycoonError,
    webhookMirror: relay.getWebhookStats(),
    appsRegistered: apps.getAll().length
  });
});

app.get('/api/ops/summary', async (_req, res) => {
  const req = _req;
  if (!isAdminRequest(req) && !hasInternalApiKey(req)) {
    return res.status(401).json({ error: 'Admin login required' });
  }
  const checks = [
    {
      key: 'chatRelay',
      name: 'Chat Relay',
      fetcher: async () => {
        const memory = process.memoryUsage();
        const sessionStats = await auth.getSessionStats();
        return {
          ok: true,
          uptimeSec: Math.floor(process.uptime()),
          memoryMB: {
            rss: Math.round(memory.rss / (1024 * 1024)),
            heapUsed: Math.round(memory.heapUsed / (1024 * 1024)),
            external: Math.round(memory.external / (1024 * 1024))
          },
          sessions: sessionStats,
          appsRegistered: apps.getAll().length,
          webhookMirror: relay.getWebhookStats(),
          platforms: {
            tiktok: tiktok.isConnected(),
            tiktokDirect: tiktokDirect.isConnected(),
            youtube: youtube.isConnected(),
            discord: discord.isConnected()
          }
        };
      }
    },
    {
      key: 'wordTycoon',
      name: 'Word Tycoon',
      fetcher: async ({ signal }) => {
        const upstream = await wtFetch(`${WORD_EMPIRES_URL}/api/health`, { signal });
        return upstream.json();
      }
    },
    {
      key: 'searchle',
      name: 'Subtextle',
      fetcher: async ({ signal }) => {
        const upstream = await fetch(`${SEARCHLE_URL}/api/health`, { signal });
        return upstream.json();
      }
    },
    {
      key: 'sassie',
      name: 'Sassie Runtime',
      fetcher: async ({ signal }) => {
        const upstream = await fetch(`${SASSIE_RUNTIME_URL}/api/runtime/health`, { signal });
        return upstream.json();
      }
    }
  ];

  const results = await Promise.all(checks.map(async (check) => {
    let timeout = null;
    try {
      const controller = new AbortController();
      timeout = setTimeout(() => controller.abort(), 2500);
      const startedAt = Date.now();
      const payload = await Promise.resolve(check.fetcher({ signal: controller.signal }));
      clearTimeout(timeout);
      return {
        key: check.key,
        name: check.name,
        ok: !!payload?.ok,
        latencyMs: Date.now() - startedAt,
        payload
      };
    } catch (err) {
      if (timeout) clearTimeout(timeout);
      return {
        key: check.key,
        name: check.name,
        ok: false,
        error: err && err.message ? err.message : 'unreachable'
      };
    }
  }));

  const services = results.reduce((acc, item) => {
    acc[item.key] = item;
    return acc;
  }, {});

  res.json({
    ok: results.every((item) => item.ok),
    checkedAt: new Date().toISOString(),
    services
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

// ── TikTok Direct Connection API (admin-protected via ADMIN_API_PREFIXES) ──
app.post('/api/tiktok-direct/connect', (req, res) => {
  const { username, sessionId, targetGame, streamerId } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });
  const result = tiktokDirect.connectStream(username, { sessionId, targetGame, streamerId });
  res.json(result);
});

app.post('/api/tiktok-direct/disconnect', (req, res) => {
  const { username } = req.body;
  if (!username) return res.status(400).json({ error: 'username is required' });
  const result = tiktokDirect.disconnectStream(username);
  res.json(result);
});

app.post('/api/tiktok-direct/disconnect-all', (req, res) => {
  tiktokDirect.disconnectAll();
  res.json({ ok: true });
});

app.get('/api/tiktok-direct/status', (req, res) => {
  res.json(tiktokDirect.getStatus());
});

app.get('/api/facebook/status', (req, res) => {
  res.json(facebook.status());
});

// Ingest endpoint for the Facebook Live Producer browser bridge
// (tools/facebook-live-bridge.user.js). Dedicated key — deliberately NOT
// GAME_API_SECRET/WT_API_SECRET, since this key ships inside a userscript
// and leaking it must only ever allow chat injection, nothing admin.
app.post('/api/facebook/ingest', (req, res) => {
  if (!process.env.FACEBOOK_INGEST_KEY) {
    return res.status(503).json({ error: 'facebook ingest not configured' });
  }
  if (req.headers['x-ingest-key'] !== process.env.FACEBOOK_INGEST_KEY) {
    return res.status(403).json({ error: 'invalid ingest key' });
  }
  const { name, message, dedupKey } = req.body || {};
  res.json(facebook.ingest({ name, message, dedupKey }));
});

// ── Streamer Management API ──
// Admin: whitelist/unwhitelist streamers
app.get('/api/streamers/admin/list', (req, res) => {
  res.json({ streamers: streamers.getAll() });
});

app.post('/api/streamers/admin/whitelist', express.json(), (req, res) => {
  const { discordId, username, displayName, tiktokUsername } = req.body || {};
  if (!discordId || typeof discordId !== 'string') {
    return res.status(400).json({ error: 'discordId is required' });
  }
  if (!/^\d{8,}$/.test(discordId.trim())) {
    return res.status(400).json({ error: 'discordId must be a numeric Discord user ID' });
  }
  let streamer = streamers.whitelist(discordId.trim(), username || null, displayName || null);
  // Optional TikTok handle assignment in the same request. Strip the
  // leading @ if pasted in, and only assign if non-empty.
  if (typeof tiktokUsername === 'string') {
    const tt = tiktokUsername.trim().replace(/^@+/, '');
    if (tt) {
      try { streamer = streamers.setTiktokUsername(discordId.trim(), tt); }
      catch (e) { return res.status(400).json({ error: 'tiktok_set_failed', detail: e.message }); }
    }
  }
  console.log('[Streamers-Admin] whitelist', discordId, '→', streamer?.tiktokUsername || '(no tt)');
  res.json({ ok: true, streamer });
});

// ── Shared TikTok handle assignment ───────────────────────────────────
// Both the streamer-facing PUT /api/streamer/tiktok and the admin
// POST /api/streamers/admin/set-tiktok run through these, so the two paths
// can't drift on the cap, the charset or the cross-streamer clash rule.

// Accepts an array, a comma-separated string or a single name.
// `revealOwner` names the clashing streamer — admin-only, so one streamer
// can't probe another's identity by guessing handles.
// Returns { ok: true, names } or { ok: false, status, error }.
function normalizeTiktokHandleUpdate(input, discordId, { revealOwner = false } = {}) {
  const raw = Array.isArray(input)
    ? input
    : (typeof input === 'string' ? input.split(',') : (input ? [input] : []));

  const names = [];
  const seen = new Set();
  for (const entry of raw) {
    const name = (entry == null ? '' : String(entry)).replace(/^@+/, '').trim();
    if (!name) continue;
    if (!/^[a-zA-Z0-9._-]{2,32}$/.test(name)) {
      return { ok: false, status: 400, error: `"${name}" is not a valid TikTok username (2-32 chars: letters, numbers, dot, underscore, dash)` };
    }
    const key = name.toLowerCase();
    if (seen.has(key)) continue;   // same handle twice = one account
    seen.add(key);
    names.push(name);
  }
  if (names.length > streamers.MAX_TIKTOK_ACCOUNTS) {
    return { ok: false, status: 400, error: `At most ${streamers.MAX_TIKTOK_ACCOUNTS} TikTok accounts can be linked at once` };
  }
  // tiktok-direct keys its connection map by username, so two streamers
  // sharing a handle would fight over one connection slot (and each other's
  // chat would route to the wrong game). Reject the claim.
  for (const name of names) {
    const clash = streamers.findByTiktokUsername(name, discordId);
    if (clash) {
      const who = revealOwner ? (clash.displayName || clash.username || clash.discordId) : 'another streamer';
      return { ok: false, status: 409, error: `@${name} is already assigned to ${who}` };
    }
  }
  return { ok: true, names };
}

// Persist the new list, dropping live connections for handles that were
// removed. /api/streamer/disconnect only iterates CONFIGURED usernames, so an
// orphaned connection would otherwise keep running with no way to stop it.
function applyTiktokHandleUpdate(discordId, names) {
  const previous = streamers.getTiktokUsernames(discordId);
  const kept = new Set(names.map(n => n.toLowerCase()));
  const dropped = [];
  for (const old of previous) {
    if (kept.has(String(old).toLowerCase())) continue;
    dropped.push(old);
    try { tiktokDirect.disconnectStream(old); } catch (_) {}
  }
  const streamer = streamers.setTiktokUsername(discordId, names);
  return { streamer, dropped };
}

// Admin set-or-clear a streamer's TikTok handles. Accepts `tiktokUsernames: []`
// (up to streamers.MAX_TIKTOK_ACCOUNTS) or the legacy single `tiktokUsername`
// string; pass an empty string / empty array to clear.
app.post('/api/streamers/admin/set-tiktok', express.json(), (req, res) => {
  const { discordId, tiktokUsername, tiktokUsernames } = req.body || {};
  if (!discordId) return res.status(400).json({ error: 'discordId required' });
  if (!streamers.get(discordId)) return res.status(404).json({ error: 'streamer_not_found' });

  const incoming = Array.isArray(tiktokUsernames) ? tiktokUsernames : tiktokUsername;
  const parsed = normalizeTiktokHandleUpdate(incoming, discordId, { revealOwner: true });
  if (!parsed.ok) return res.status(parsed.status).json({ ok: false, error: parsed.error });

  try {
    const { streamer, dropped } = applyTiktokHandleUpdate(discordId, parsed.names);
    const actor = getAdminActorLogData(req);
    console.log('[Streamers-Admin] set-tiktok', discordId, '→',
      parsed.names.length ? parsed.names.map(n => '@' + n).join(' ') : '(cleared)',
      dropped.length ? `(disconnected ${dropped.map(n => '@' + n).join(' ')})` : '',
      'actor:', JSON.stringify(actor));
    res.json({ ok: true, streamer, tiktokUsernames: streamers.getTiktokUsernames(discordId), dropped });
  } catch (e) {
    res.status(400).json({ error: 'tiktok_set_failed', detail: e.message });
  }
});

// Combined snapshot: streamer record + live TikTok connection status. Backs
// the /admin/streamers.html management page (one round-trip per refresh).
app.get('/api/streamers/admin/list-with-status', (req, res) => {
  const all = streamers.getAll();
  const status = tiktokDirect.getStatus();
  const byUser = {};
  for (const s of status.streams || []) byUser[s.username] = s;
  const rows = all.map((s) => {
    // A streamer can run more than one TikTok handle — surface whichever is
    // actually live (preferring a connected one) rather than only the primary.
    const handles = streamers.getTiktokUsernames(s.discordId);
    const liveCandidates = handles.map(u => byUser[u]).filter(Boolean);
    const live = liveCandidates.find(c => c.state === 'connected')
      || liveCandidates.find(c => c.state === 'connecting')
      || liveCandidates[0]
      || null;
    // Per-handle state so the table can dot each linked account individually —
    // `live` above collapses to one connection and can't show that account #1
    // is live while #2 is offline.
    const liveByHandle = {};
    for (const u of handles) {
      liveByHandle[u] = byUser[u] ? byUser[u].state : 'disconnected';
    }
    return {
      ...s,
      tiktokUsernames: handles,
      liveByHandle,
      live: live ? {
        state: live.state,
        viewerCount: live.viewerCount,
        connectedAt: live.connectedAt,
        targetGame: live.targetGame,
        eventCounts: live.eventCounts,
      } : null,
    };
  });
  res.json({ streamers: rows, totalActive: status.activeConnections, maxTiktokAccounts: streamers.MAX_TIKTOK_ACCOUNTS });
});

// Admin force-disconnect: blocks future manual connects, clears the
// boot-time reconnect intent, and drops the live TikTok connection.
app.post('/api/streamers/admin/force-disconnect', express.json(), (req, res) => {
  const { discordId, reason } = req.body || {};
  if (!discordId) return res.status(400).json({ error: 'discordId required' });
  const s = streamers.get(discordId);
  if (!s) return res.status(404).json({ error: 'streamer_not_found' });
  const actor = getAdminActorLogData(req);
  streamers.setConnectBlocked(discordId, true, { reason: reason || null });
  streamers.setWantsConnected(discordId, false);
  // Kill EVERY handle this streamer runs. Dropping only s.tiktokUsername
  // would leave a second account live and still feeding the game.
  const handles = streamers.getTiktokUsernames(discordId);
  let disconnected = false;
  for (const handle of handles) {
    try {
      tiktokDirect.disconnectStream(handle);
      disconnected = true;
    } catch (_) {}
  }
  const remaining = tiktokDirect.getStatus().streams.filter(c => c.streamerId === discordId && (c.state === 'connected' || c.state === 'connecting'));
  if (!remaining.length) {
    const lastGameIds = getStreamerSessionCleanupGameIds(s);
    const lastHandle = s.handle;
    streamers.markSessionEnd(discordId);
    if (lastHandle) {
      for (const lastGameId of lastGameIds) {
        if (lastGameId) endStreamerSessionInGame(lastGameId, lastHandle).catch(() => {});
      }
    }
  }
  console.log('[Streamers-Admin] force-disconnect', discordId, handles.length ? handles.map(h => '@' + h).join(' ') : '(no tt)', 'reason:', reason || '(none)', 'actor:', JSON.stringify(actor));
  res.json({ ok: true, discordId, disconnected, reason: reason || null });
});

// Admin re-allow: clears the force-disconnect flag only. This must not
// re-arm boot-time reconnects on its own.
app.post('/api/streamers/admin/allow-connect', express.json(), (req, res) => {
  const { discordId } = req.body || {};
  if (!discordId) return res.status(400).json({ error: 'discordId required' });
  const s = streamers.get(discordId);
  if (!s) return res.status(404).json({ error: 'streamer_not_found' });
  const actor = getAdminActorLogData(req);
  streamers.setConnectBlocked(discordId, false);
  console.log('[Streamers-Admin] allow-connect', discordId, s.tiktokUsername || '(no tt)', 'actor:', JSON.stringify(actor));
  res.json({ ok: true, discordId });
});

app.post('/api/streamers/admin/unwhitelist', express.json(), (req, res) => {
  const { discordId } = req.body;
  if (!discordId) return res.status(400).json({ error: 'discordId is required' });
  // Read the handles BEFORE unwhitelist deletes the record — the old code
  // looked them up afterwards, so streamers.get() was already null and the
  // disconnect never actually ran.
  const handles = streamers.getTiktokUsernames(discordId);
  const removed = streamers.unwhitelist(discordId);
  if (removed) {
    // Disconnect every active TikTok connection for this streamer
    for (const handle of handles) {
      try { tiktokDirect.disconnectStream(handle); } catch (_) {}
    }
  }
  res.json({ ok: removed });
});

// Admin: streamer application review (backs /admin/streamers.html#applications).
// Auth comes from the /api/streamers/admin/ prefix gate in src/auth.js.
app.get('/api/streamers/admin/applications', (req, res) => {
  const applications = streamerApplications.getAll()
    .slice()
    .sort((a, b) => String(b.requestedAt || '').localeCompare(String(a.requestedAt || '')));
  res.json({ applications });
});

app.post('/api/streamers/admin/applications/approve', express.json(), (req, res) => {
  const { discordId } = req.body || {};
  if (!discordId) return res.status(400).json({ ok: false, error: 'discordId required' });
  const appn = streamerApplications.get(discordId);
  if (!appn) return res.status(404).json({ ok: false, error: 'application_not_found' });
  // Refuse rather than half-apply if their TikTok handle already belongs to
  // another whitelisted streamer — admin resolves the conflict manually.
  const clash = streamers.getAll().find(s =>
    s.discordId !== discordId &&
    s.tiktokUsername && appn.tiktokUsername &&
    s.tiktokUsername.toLowerCase() === appn.tiktokUsername.toLowerCase());
  if (clash) {
    return res.status(409).json({ ok: false, error: `tiktok handle @${appn.tiktokUsername} already assigned to ${clash.displayName || clash.discordId}` });
  }
  try {
    streamers.whitelist(discordId, appn.discordUsername || null, appn.discordDisplayName || null);
    if (appn.tiktokUsername) streamers.setTiktokUsername(discordId, appn.tiktokUsername);
  } catch (e) {
    return res.status(400).json({ ok: false, error: 'whitelist_failed', detail: e.message });
  }
  const actor = getAdminActorLogData(req);
  const updated = streamerApplications.approve(discordId, actor?.username || actor?.id || 'admin');
  console.log('[StreamerApps] approve', discordId, '@' + (appn.tiktokUsername || '?'), 'actor:', JSON.stringify(actor));
  res.json({ ok: true, application: updated });
});

app.post('/api/streamers/admin/applications/deny', express.json(), (req, res) => {
  const { discordId, reason } = req.body || {};
  if (!discordId) return res.status(400).json({ ok: false, error: 'discordId required' });
  const appn = streamerApplications.get(discordId);
  if (!appn) return res.status(404).json({ ok: false, error: 'application_not_found' });
  const actor = getAdminActorLogData(req);
  const updated = streamerApplications.deny(discordId, reason || null, actor?.username || actor?.id || 'admin');
  console.log('[StreamerApps] deny', discordId, 'reason:', reason || '(none)', 'actor:', JSON.stringify(actor));
  res.json({ ok: true, application: updated });
});

// Streamer self-service API (requires user login + whitelist)
function requireStreamer(req, res, next) {
  if (!req.session?.discordUser) return res.status(401).json({ error: 'Login required' });
  const discordId = req.session.discordUser.id;
  if (!streamers.isWhitelisted(discordId)) {
    return res.status(403).json({ error: 'Not whitelisted as a streamer' });
  }
  req.streamer = streamers.get(discordId) || { discordId };
  next();
}

// ── Streamer applications (self-service, login required but NOT whitelist) ──
// Backs the "Apply to be a streamer" form on /streamer for logged-in users
// who aren't whitelisted yet.
app.get('/api/streamer/me-application', auth.requireUser, (req, res) => {
  const discordId = req.session.discordUser.id;
  const appn = streamerApplications.get(discordId);
  let application = null;
  if (appn) {
    const { decidedBy, ...publicFields } = appn;
    application = publicFields;
  }
  res.json({ ok: true, isStreamer: streamers.isWhitelisted(discordId), application });
});

app.post('/api/streamer/apply', auth.requireUser, express.json(), async (req, res) => {
  const u = req.session.discordUser;
  if (streamers.isWhitelisted(u.id)) {
    return res.status(400).json({ ok: false, error: 'You are already a streamer — reload the page.' });
  }
  const prior = streamerApplications.get(u.id);
  if (prior && prior.status === 'pending') {
    return res.status(400).json({ ok: false, error: 'Your application is already pending review.' });
  }
  let application;
  try {
    application = streamerApplications.submit(u.id, {
      discordUsername: u.username,
      discordDisplayName: u.globalName || u.username,
      tiktokUsername: req.body?.tiktokUsername,
      reason: req.body?.reason,
    });
  } catch (e) {
    return res.status(400).json({ ok: false, error: e.message });
  }
  console.log(`[StreamerApps] apply ${u.username} (${u.id}) @${application.tiktokUsername}`);

  // Notify the owner (DM, channel fallback) — same delivery pattern as
  // /api/voice/request. Best-effort: the application is already saved, so
  // a notify failure must not fail the request.
  try {
    const ownerId = process.env.STREAM_OWNER_DISCORD_ID || '179331908499406849';
    const text = [
      '📋 **Streamer application** (wordgame.live/streamer)',
      `Discord: **${application.discordDisplayName}** (\`${u.username}\`, ${u.id})`,
      `TikTok: \`@${application.tiktokUsername}\``,
      application.reason ? `Reason: ${application.reason}` : 'Reason: (none given)',
      'Review: https://wordgame.live/admin/streamers.html#applications',
    ].join('\n');
    let delivered = false;
    const client = discord.getClient();
    if (client && client.isReady()) {
      try {
        const owner = await client.users.fetch(ownerId);
        await owner.send(text);
        delivered = true;
      } catch (e) {
        console.warn('[StreamerApps] owner DM failed, falling back to channel:', e.message);
      }
    }
    if (!delivered && discord.isConnected()) {
      await discord.sendToChannel(`<@${ownerId}> ${text}`);
      delivered = true;
    }
    if (!delivered) console.error(`[StreamerApps] notify UNDELIVERED for ${u.id} @${application.tiktokUsername}`);
  } catch (e) {
    console.error('[StreamerApps] notify failed:', e.message);
  }

  res.json({ ok: true, application });
});

// Per-streamer word difficulty preference. Games that opt in (Searchle)
// read this at session start to bias target word selection by Zipf
// score. 'normal' = current behavior (no filter).
app.get('/api/streamer/difficulty', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  res.json({
    ok: true,
    wordFrequency: streamers.getWordFrequency(discordId),
    wordLength: streamers.getWordLength(discordId),
    searchleLanguage: streamers.getSearchleLanguage(discordId),
  });
});

app.put('/api/streamer/difficulty', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const value = req.body?.wordFrequency;
  const length = req.body?.wordLength;
  const language = req.body?.searchleLanguage;
  try {
    if (value !== undefined) streamers.setWordFrequency(discordId, value);
    if (length !== undefined) streamers.setWordLength(discordId, length);
    if (language !== undefined) streamers.setSearchleLanguage(discordId, language);
    res.json({
      ok: true,
      wordFrequency: streamers.getWordFrequency(discordId),
      wordLength: streamers.getWordLength(discordId),
      searchleLanguage: streamers.getSearchleLanguage(discordId),
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Games whose session board is generated at a configurable rows x cols and
// which expose the admin /api/session/restart route. 'sproutle' is
// eRecTangled's legacy dropdown id and reaches the same server.
const GRID_SIZE_RESTART_GAMES = new Set(['rectangled', 'erectangled', 'sproutle']);

// Per-streamer board size for RecTangled / eRecTangled. Unlike Subtextle's
// gridRows (a pure render cap on the chip list), this changes the ACTUAL
// generated board, which is one shared Game object read by chat, the
// /<handle> player page and every overlay widget at once — so it is stored
// per streamer per game, not on a widget.
//
// Takes effect on the next round. The dashboard's "Restart now" button hits
// /api/streamer/grid-size/restart below to deal a fresh board immediately.
app.get('/api/streamer/grid-size', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  res.json({
    ok: true,
    gridSizes: streamers.getGridSizeDimensions(discordId),
    presets: streamers.GRID_SIZE_PRESETS,
  });
});

app.put('/api/streamer/grid-size', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const { gameId, preset } = req.body || {};
  try {
    const saved = streamers.setGridSize(discordId, gameId, preset);
    const gridSizes = streamers.getGridSizeDimensions(discordId);
    // Push straight into the game so "Restart now" (and the next round-end
    // restart) use this size, instead of whatever the game last polled.
    const s = streamers.get(discordId);
    const gameKey = String(gameId).trim().toLowerCase() === 'sproutle' ? 'erectangled' : String(gameId).trim().toLowerCase();
    if (s && s.handle && gridSizes[gameKey]) {
      pushGridSizeToGame(gameKey, String(s.handle).toLowerCase(), gridSizes[gameKey]).catch(() => {});
    }
    res.json({ ok: true, preset: saved, gridSizes });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

// Deal a fresh board at the current size right now, ending the round in
// progress. Separate from the PUT so saving a size never surprises a
// streamer by wiping chat's in-progress finds.
app.post('/api/streamer/grid-size/restart', requireStreamer, express.json(), async (req, res) => {
  const discordId = req.session.discordUser.id;
  const gameId = String(req.body?.gameId || '').trim().toLowerCase();
  const s = streamers.get(discordId);
  if (!s || !s.handle) return res.status(404).json({ ok: false, error: 'streamer not found' });
  // Only the RecTangled family exposes /api/session/restart. Guard on the
  // game list rather than on "does a port exist" — every game has a port,
  // and posting to one that has no such route just 404s silently.
  if (!GRID_SIZE_RESTART_GAMES.has(gameId)) {
    return res.status(400).json({ ok: false, error: 'game does not support board restart' });
  }
  // Push the size first and WAIT for it, so the restart below can't race the
  // push and rebuild the board at the previously-cached size.
  const gameKey = gameId === 'sproutle' ? 'erectangled' : gameId;
  const dims = streamers.getGridSizeDimensions(discordId)[gameKey];
  if (dims) await pushGridSizeToGame(gameKey, String(s.handle).toLowerCase(), dims);
  const restarted = await restartStreamerSessionInGame(gameId, String(s.handle).toLowerCase());
  if (!restarted) return res.status(502).json({ ok: false, error: 'game did not restart the round' });
  res.json({ ok: true });
});

// ── Public streamer-id validator ─────────────────────────────────────────
// The :discordId path segment on every public streamer surface is NOT always a
// Discord snowflake. A streamer who signed in with Google / GitHub / TikTok is
// keyed by `go_…` / `gh_` / `tt_`, and site-native accounts by `wt-…` — that is
// the id under which streamers.get() stores their record and the id the
// dashboard puts in its own URLs.
//
// These routes used to test /^\d{5,25}$/, which 400s every one of those
// streamers. The tell was narrow and confusing: `join-goals-overlay` validates
// with this same permissive charset, so their overlay and every other widget
// loaded normally and only the GAME widget (plus TTS and top-likers, the other
// numeric-gated surfaces) came up blank.
//
// The charset stays tight because these ids are concatenated into Socket.IO
// room names below; it just no longer assumes "id" means "digits".
function isPublicStreamerId(id) {
  return /^[A-Za-z0-9_-]{3,64}$/.test(String(id || '').trim());
}

// Public lookup for game servers (Searchle, etc.) — no auth, just the
// minimum information the game needs to bias its target picker.
app.get('/api/streamer-public/:discordId/difficulty', (req, res) => {
  const wordFrequency = streamers.getWordFrequency(req.params.discordId);
  const wordLength = streamers.getWordLength(req.params.discordId);
  const searchleLanguage = streamers.getSearchleLanguage(req.params.discordId);
  res.json({ ok: true, wordFrequency, wordLength, searchleLanguage });
});

// ==================== POOKIE TOK (paid stream messages) ====================
// Routes live in ./src/pookie-routes so they can be tested without booting the
// full server. All feature logic is in ./src/pookie-tok.
registerPookieTokRoutes(app, {
  express,
  wtFetch,
  wordEmpiresUrl: WORD_EMPIRES_URL,
  hasInternalApiKey,
  requireStreamer,
});

// Public read-only TTS state for the mobile stream-view. The page can be
// opened without a dashboard session, but it still needs to avoid showing
// TTS as ready when the streamer's server-side TTS setting is off.
app.get('/api/streamer-public/:discordId/tts-settings', (req, res) => {
  const id = String(req.params.discordId || '').trim();
  if (!isPublicStreamerId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
  const s = streamers.get(id);
  if (!s) return res.status(404).json({ ok: false, error: 'Not found' });
  const settings = streamerTts.getSettings(id);
  res.json({
    ok: true,
    enabled: !!settings.enabled,
    trigger_mode: settings.trigger_mode,
    trigger_symbol: settings.trigger_symbol,
  });
});

// Handle-keyed alias — most game servers (Searchle, RecTangled, etc.)
// know the streamer by their handle/slug, not their Discord ID. Resolves
// the handle then returns the same shape as the discordId endpoint.
app.get('/api/streamer-public/by-handle/:handle/difficulty', (req, res) => {
  const s = streamers.getByHandle(String(req.params.handle || '').toLowerCase());
  if (!s) return res.status(404).json({ ok: false, error: 'streamer_not_found', wordFrequency: 'normal', wordLength: '5' });
  res.json({
    ok: true,
    wordFrequency: streamers.getWordFrequency(s.discordId),
    wordLength: streamers.getWordLength(s.discordId),
    searchleLanguage: streamers.getSearchleLanguage(s.discordId),
  });
});

app.get('/api/streamer/me', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  const s = streamers.get(discordId);
  const primaryGameId = getStreamerPrimaryGameId(s);
  const clientStreamer = s
    ? {
        ...s,
        activeGame: primaryGameId || null,
        activeGames: primaryGameId ? [primaryGameId] : [],
      }
    : null;
  const usernames = streamers.getTiktokUsernames(discordId);
  const allStatus = tiktokDirect.getStatus();
  const liveConnections = allStatus.streams.filter(c => c.streamerId === discordId);
  const liveByUsername = new Map(liveConnections.map((c) => [String(c.username || '').toLowerCase(), c]));
  const connections = usernames.map((username) => {
    const key = String(username || '').toLowerCase();
    return liveByUsername.get(key) || {
      username,
      state: 'disconnected',
      connectedAt: null,
      viewerCount: 0,
      eventCounts: { chat: 0, like: 0, gift: 0, join: 0, follow: 0, share: 0 },
      autoReconnect: false,
      targetGame: primaryGameId || null,
      streamerId: discordId,
    };
  });
  const session = streamers.isSessionDisabled(discordId) ? null : streamers.getCurrentSession(discordId);
  res.json({
    streamer: clientStreamer,
    connections,
    session,
    handle: s?.handle || null,
    maxTiktokAccounts: streamers.MAX_TIKTOK_ACCOUNTS,
  });
});

// ── Actions & Events (streamer-defined rules) ──────────────────────────
// Per-streamer trigger→action rules. The OBS overlay
// (/streamer/actions-overlay.html) joins room actions:<streamerId> and
// renders the dispatched actions. See src/streamer-actions.js for the
// evaluator wired into tiktok-direct.js.
app.get('/api/streamer/rules', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  res.json({
    ok: true,
    rules: streamerRules.getRules(discordId),
    overlayUrl: `/streamer/actions-overlay.html?streamerId=${encodeURIComponent(discordId)}`,
    limits: {
      maxRules: streamerRules.MAX_RULES_PER_STREAMER,
      maxActionsPerRule: streamerRules.MAX_ACTIONS_PER_RULE,
      validTriggers: streamerRules.VALID_TRIGGERS,
      validActionTypes: streamerRules.VALID_ACTION_TYPES,
    },
  });
});

app.put('/api/streamer/rules', requireStreamer, express.json({ limit: '256kb' }), (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const saved = streamerRules.setRules(discordId, req.body?.rules || []);
    res.json({ ok: true, rules: saved });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

app.post('/api/streamer/rules/:id/test', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  const result = streamerActions.testFire(discordId, req.params.id);
  if (!result.ok) return res.status(404).json(result);
  res.json(result);
});

// ── Goals & Milestones (gift goal, follow/like goal, milestone burst) ──
// Per-streamer configuration for the goals OBS overlay. The overlay page
// (/streamer/goals-overlay.html) joins room goals:<streamerId> via the
// `join-goals-overlay` socket event and renders the dispatched updates.
// Both portrait (1080×1920) and landscape (1920×1080) modes are supported
// via the `?mode=portrait|landscape` query param.
app.get('/api/streamer/goals', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  const data = streamerGoals.snapshot(discordId);
  res.json({
    ok: true,
    config: data.config,
    state: data.state,
    defaultGameLayouts: data.defaultGameLayouts,
    defaultBgPerGame: data.defaultBgPerGame,
    defaultBgFallback: data.defaultBgFallback,
    widgetTypeDefaults: data.widgetTypeDefaults,
    portraitUrl: `/streamer/stream-view.html?streamerId=${encodeURIComponent(discordId)}&mode=portrait&obs=1`,
    landscapeUrl: `/streamer/stream-view.html?streamerId=${encodeURIComponent(discordId)}&mode=landscape&obs=1`,
    validWidgetTypes: streamerGoals.VALID_WIDGET_TYPES,
    validFollowSources: streamerGoals.VALID_FOLLOW_SOURCES,
    validMilestoneSources: streamerGoals.VALID_MILESTONE_SOURCES,
    validColors: streamerGoals.VALID_COLORS,
    validStyles: streamerGoals.VALID_STYLES,
    validPaddings: streamerGoals.VALID_PADDINGS,
    validPersistence: streamerGoals.VALID_PERSISTENCE,
    validWinScopes: streamerGoals.VALID_WIN_SCOPES,
    maxWidgets: streamerGoals.MAX_WIDGETS_PER_STREAMER,
    // Per-streamer ai_licia avatar URL (stored on the streamer record, not the
    // goals config) so the dashboard can auto-fill new ai_licia widgets and
    // remember the URL across setup switches.
    ailiciaUrl: streamers.getAiliciaUrl(discordId),
  });
});

// Add a new widget instance of the given type. Returns the new instance.
// Pro-only widget types can only be added from the owner-only /streamer/pro dashboard.
app.post('/api/streamer/goals/widgets', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const type = String(req.body?.type || '');
  if (discordId !== STREAM_OWNER_ID && streamerGoals.isProOnlyWidgetType(type)) {
    return res.status(403).json({ ok: false, error: 'This widget requires the Pro dashboard.' });
  }
  try {
    const { widget } = streamerGoals.addWidget(discordId, type, req.body?.name);
    res.json({ ok: true, widget });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

// Duplicate an existing widget instance — same settings and positions, new id.
// Pro-only widgets cannot be duplicated from the regular /streamer dashboard.
app.post('/api/streamer/goals/widgets/:id/duplicate', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  const widgetId = String(req.params.id || '');
  try {
    const source = streamerGoals.getForStreamer(discordId)?.config?.widgets?.find(w => w.id === widgetId);
    if (source && discordId !== STREAM_OWNER_ID && streamerGoals.isProOnlyWidgetType(source.type)) {
      return res.status(403).json({ ok: false, error: 'This widget requires the Pro dashboard.' });
    }
    const { widget } = streamerGoals.duplicateWidget(discordId, widgetId);
    res.json({ ok: true, widget });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

// Manually set the current value of a widget (goal bars + milestone counters).
app.post('/api/streamer/goals/widgets/:id/current', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const id = String(req.params.id || '');
  const value = req.body?.current;
  const result = streamerGoals.setWidgetCurrent(discordId, id, value);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// Delete a widget instance.
app.delete('/api/streamer/goals/widgets/:id', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    streamerGoals.deleteWidget(discordId, String(req.params.id || ''));
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

app.put('/api/streamer/goals', requireStreamer, express.json({ limit: '32kb' }), (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const saved = streamerGoals.setConfig(discordId, req.body?.config || {});
    res.json({ ok: true, config: saved.config, state: saved.state });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

// Reset a widget's runtime state by ID (or 'all' to wipe every widget's state).
app.post('/api/streamer/goals/reset', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const widgetId = String(req.body?.widgetId || req.body?.widget || 'all');
  const saved = streamerGoals.reset(discordId, widgetId);
  res.json({ ok: true, state: saved.state });
});

// ── Win tallies ───────────────────────────────────────────────────
// Running per-player win counts shown by the Win Card's session / saved
// leaderboard modes. `game` narrows to one game's board; omit for the
// cross-game totals.
app.get('/api/streamer/wins', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  const game = req.query?.game ? String(req.query.game) : null;
  res.json({ ok: true, ...winTallies.getSummary(discordId, game) });
});

// which: 'session' (default) | 'saved' | 'both'. Clearing 'saved' also clears
// 'session' — see the note in src/win-tallies.js reset().
app.post('/api/streamer/wins/reset', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const which = String(req.body?.which || 'session');
  if (!['session', 'saved', 'both'].includes(which)) {
    return res.status(400).json({ ok: false, error: 'Invalid which' });
  }
  const game = req.body?.game ? String(req.body.game) : null;
  const result = winTallies.reset(discordId, which, game);
  res.json({ ok: true, cleared: result.cleared, ...winTallies.getSummary(discordId, game) });
});

// Test-fire a widget by ID (placeholder data, no real event needed).
app.post('/api/streamer/goals/test', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const widgetId = String(req.body?.widgetId || req.body?.widget || '');
  // Game Vote owns its own state machine, so its test opens a REAL vote chat
  // can participate in (the streamer can cancel it, or let it resolve). It
  // lives in game-vote.js rather than streamerGoals.testFire.
  const widget = streamerGoals.getForStreamer(discordId).config.widgets.find(w => w.id === widgetId);
  if (widget && widget.type === 'gameVote') {
    const r = gameVote.testFire(discordId);
    if (!r.ok) return res.status(400).json(r);
    return res.json(r);
  }
  const result = streamerGoals.testFire(discordId, widgetId);
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

// Music Credits playback controls. Actions: play | pause | toggle | next | prev | ended | seek
app.post('/api/streamer/goals/widgets/:id/music', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const widgetId = String(req.params.id || '');
  const action = String(req.body?.action || '');
  const result = streamerGoals.musicControl(discordId, widgetId, action, req.body || {});
  if (!result.ok) return res.status(400).json(result);
  res.json(result);
});

app.get('/api/streamer/goals/widgets/:id/music', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  const widgetId = String(req.params.id || '');
  const state = streamerGoals.getMusicState(discordId, widgetId);
  if (!state) return res.status(404).json({ ok: false, error: 'Widget not found' });
  res.json({ ok: true, state });
});

// ── Game Vote controls ────────────────────────────────────────────────
// Manual overrides for the next-game vote. The vote normally runs itself off
// the widget's per-game terms; these exist so a streamer can open one on demand
// ("chat, pick the next one"), close it early, or abandon it.
app.post('/api/streamer/vote/start', requireStreamer, express.json(), (req, res) => {
  const r = gameVote.startVote(req.session.discordUser.id);
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});

app.post('/api/streamer/vote/end', requireStreamer, express.json(), (req, res) => {
  const r = gameVote.endVote(req.session.discordUser.id);
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});

app.post('/api/streamer/vote/cancel', requireStreamer, express.json(), (req, res) => {
  const r = gameVote.cancelVote(req.session.discordUser.id);
  if (!r.ok) return res.status(400).json(r);
  res.json(r);
});

// Current vote surface — the dashboard polls this to mirror what's on the
// overlay (phase, tallies, time left) without joining the overlay room.
app.get('/api/streamer/vote', requireStreamer, (req, res) => {
  res.json({ ok: true, vote: gameVote.snapshotFor(req.session.discordUser.id) });
});

// Reset layout positions. If widgetId is provided, only that widget for the
// given mode. Otherwise all widgets in the mode.
app.post('/api/streamer/goals/reset-layout', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const mode = String(req.body?.mode || '');
  if (mode !== 'portrait' && mode !== 'landscape') {
    return res.status(400).json({ ok: false, error: 'Invalid mode' });
  }
  const widgetId = req.body?.widgetId || req.body?.widget;
  try {
    const saved = streamerGoals.resetLayout(discordId, mode, widgetId ? String(widgetId) : null);
    res.json({ ok: true, config: saved.config });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

// ── Saved setups (named overlay-config snapshots) ─────────────────────
// A setup captures the streamer's current Goals & Milestones overlay config
// (widgets + layout + background + order). Applying one routes the stored
// config back through streamerGoals.setConfig() — same validation and live
// OBS emit as a normal dashboard save. Only `config` is snapshotted; runtime
// state (goal progress, counters) is never carried across.
app.get('/api/streamer/setups', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  res.json({
    ok: true,
    setups: streamerSetups.listSetups(discordId),
    maxSetups: streamerSetups.MAX_SETUPS_PER_STREAMER,
    maxNameLength: streamerSetups.MAX_NAME_LENGTH,
  });
});

// Save the current live overlay config as a new named setup.
app.post('/api/streamer/setups', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const name = String(req.body?.name || '').trim();
  if (!name) return res.status(400).json({ ok: false, error: 'Name is required' });
  try {
    const current = streamerGoals.getForStreamer(discordId);
    // Capture the active game too — overlay widget positions/background resolve
    // per-game, so restoring the game on apply keeps the layout looking right.
    const activeGame = streamers.get(discordId)?.activeGame || null;
    const setup = streamerSetups.saveSetup(discordId, name, current.config, activeGame);
    res.json({ ok: true, setup, setups: streamerSetups.listSetups(discordId) });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

// Apply a saved setup: replace the live overlay config AND switch to the
// setup's stored game, all server-side (applyStreamerSetup, defined next to
// applyStreamerGameSwitch). The dashboard no longer needs its own follow-up
// game switch; non-browser callers (a resolved game vote) get the full effect.
app.post('/api/streamer/setups/:id/apply', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  try {
    const result = applyStreamerSetup(discordId, String(req.params.id || ''));
    if (!result) return res.status(404).json({ ok: false, error: 'Setup not found' });
    res.json({ ok: true, config: result.saved.config, state: result.saved.state, game: result.game });
  } catch (err) {
    res.status(400).json({ ok: false, error: err.message || String(err) });
  }
});

// Delete a saved setup.
app.delete('/api/streamer/setups/:id', requireStreamer, (req, res) => {
  const discordId = req.session.discordUser.id;
  const removed = streamerSetups.deleteSetup(discordId, String(req.params.id || ''));
  if (!removed) return res.status(404).json({ ok: false, error: 'Setup not found' });
  res.json({ ok: true, setups: streamerSetups.listSetups(discordId) });
});

// Remember the streamer's ai_licia avatar URL on their account (independent of
// the goals config / saved setups). The dashboard PUTs here whenever the URL is
// typed into an ai_licia widget, and auto-fills new widgets from it.
app.put('/api/streamer/ailicia-url', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  streamers.setAiliciaUrl(discordId, req.body?.url || '');
  res.json({ ok: true, ailiciaUrl: streamers.getAiliciaUrl(discordId) });
});

// Streamer types a guess in the stream-view keyboard widget — we inject it
// into the chat relay as if they posted in their own session, routed only
// to their current active game. Goes through the same pipeline as TikTok
// chat (so badges/cosmetics/TTS work consistently), but tagged with
// platform 'discord' since the streamer is authenticated via Discord.
app.post('/api/streamer/inject-chat', requireStreamer, express.json(), (req, res) => {
  const discordUser = req.session.discordUser;
  const text = String(req.body?.text || '').trim();
  if (!text) return res.status(400).json({ ok: false, error: 'Empty message' });
  if (text.length > 200) return res.status(400).json({ ok: false, error: 'Too long (200 char max)' });
  const activeGames = streamers.getActiveGames(discordUser.id);
  const targetGame = activeGames[0] || null;
  if (!targetGame) return res.status(400).json({ ok: false, error: 'No active game' });

  const msg = {
    platform: 'discord',
    user: {
      id: discordUser.id,
      // `globalName`, not `global_name` — the session field is camelCase, so the
      // snake_case read was always undefined and both names collapsed onto
      // `username` (which, for a Google login, used to be the email address).
      username: discordUser.username || discordUser.globalName || 'streamer',
      displayName: discordUser.globalName || discordUser.username || 'streamer',
      // Already an absolute URL for every provider — Discord's hash is expanded
      // at the OAuth callback, and GitHub/Google/TikTok hand us a full URL. This
      // used to re-wrap it in the Discord CDN template, producing a nested
      // double-URL that 404s.
      profilePic: discordUser.avatar || null,
      badges: [],
    },
    message: text,
    _targetGame: targetGame,
    _streamerId: discordUser.id,
  };
  try {
    relay.handleMessage(msg).catch((err) => {
      console.warn('[inject-chat] handleMessage error:', err.message || err);
    });
    res.json({ ok: true, targetGame });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// ── Bot Players — simulated viewers for the streamer's Searchle session ──
// Settings persist on the streamer record (streamers.json); the loop in
// src/bot-players.js picks changes up on its next tick (≤3s).
app.get('/api/streamer/bots', requireStreamer, (req, res) => {
  res.json({ ok: true, ...botPlayers.getStatus(req.session.discordUser.id) });
});

app.put('/api/streamer/bots', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const body = req.body || {};
  const saved = streamers.setBotPlayers(discordId, {
    enabled: body.enabled,
    count: body.count,
    intensity: body.intensity,
    games: body.games,
  });
  if (!saved) return res.status(400).json({ ok: false, error: 'Not a whitelisted streamer' });
  res.json({ ok: true, settings: saved });
});

// ── Server-side stream (render1 headless OBS) remote control ──
// The 24/7 datacenter stream renderer. Owner-only: this starts/stops the
// owner's actual TikTok broadcast, so other whitelisted streamers must not
// see or touch it. Internal API key allowed for automation/diagnostics.
function requireStreamOwner(req, res, next) {
  if (hasInternalApiKey(req)) return next();
  const u = req.session?.discordUser;
  if (!u) return res.status(401).json({ error: 'Login required' });
  if (u.id !== STREAM_OWNER_ID) {
    console.warn(`[stream-owner] DENIED ${req.method} ${req.path} by non-owner discord ${u.id} (${u.username || '?'})`);
    return res.status(403).json({ error: 'Owner only' });
  }
  if (req.method !== 'GET') console.log(`[stream-owner] ${req.method} ${req.path} by owner ${u.id}`);
  next();
}

app.get('/api/streamer/obs/status', requireStreamOwner, async (req, res) => {
  if (!obsRemote.isConfigured()) return res.json({ configured: false });
  try {
    res.json(await obsRemote.getStatusWithService());
  } catch (err) {
    res.json({ configured: true, reachable: false, error: err.message });
  }
});

// Update the RTMP target (TikTok rotates stream keys per session, so the
// owner pastes the fresh key from Live Studio before each go-live).
app.post('/api/streamer/obs/config', requireStreamOwner, express.json(), async (req, res) => {
  const server = String(req.body?.server || '').trim();
  const key = String(req.body?.key || '').trim();
  if (!/^rtmps?:\/\/.+/i.test(server)) {
    return res.status(400).json({ ok: false, error: 'Server must be an rtmp:// or rtmps:// URL' });
  }
  if (!key) return res.status(400).json({ ok: false, error: 'Stream key required' });
  try {
    const status = await obsRemote.getStatus();
    if (status.streaming) {
      return res.status(409).json({ ok: false, error: 'Stop the stream before changing the key' });
    }
    await obsRemote.setStreamService(server, key);
    res.json({ ok: true, service: await obsRemote.getStreamService() });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.post('/api/streamer/obs/start', requireStreamOwner, async (req, res) => {
  try {
    await obsRemote.startStream();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

app.post('/api/streamer/obs/stop', requireStreamOwner, async (req, res) => {
  try {
    await obsRemote.stopStream();
    res.json({ ok: true });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Reload the renderer's browser sources so deployed overlay/game updates
// show on stream without touching the broadcast itself.
app.post('/api/streamer/obs/refresh', requireStreamOwner, express.json(), async (req, res) => {
  const scope = req.body?.scope === 'all' ? 'all' : 'overlay';
  try {
    const refreshed = await obsRemote.refreshBrowserSources(scope);
    res.json({ ok: true, refreshed });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Live mix controls for render1's dedicated background-music browser input.
// Muting stops music from reaching the TikTok stream without reloading the
// browser source, so Start resumes the current song instead of beginning again.
app.post('/api/streamer/obs/music', requireStreamOwner, express.json(), async (req, res) => {
  const action = req.body?.action == null ? null : String(req.body.action);
  const hasVolume = req.body?.volume != null;
  const volume = hasVolume ? Number(req.body.volume) : null;

  if (action !== null && !['start', 'stop'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'action must be start or stop' });
  }
  if (hasVolume && (!Number.isFinite(volume) || volume < 0 || volume > 100)) {
    return res.status(400).json({ ok: false, error: 'volume must be between 0 and 100' });
  }
  if (action === null && !hasVolume) {
    return res.status(400).json({ ok: false, error: 'action or volume required' });
  }

  try {
    if (action !== null) await obsRemote.setMusicPlaying(action === 'start');
    if (hasVolume) await obsRemote.setMusicVolume(volume);
    res.json({ ok: true, music: await obsRemote.getMusicStatus() });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Headless Spotify Connect receiver control. This is separate from Chat
// Relay's Spotify Web API OAuth above: librespot is the audio device feeding
// OBS, while src/spotify.js supplies metadata and playback commands.
const SPOTIFY_CONNECT_DEVICE_NAME = process.env.SPOTIFY_REQUEST_DEVICE || 'Word Tycoon render1';

async function getSpotifyConnectStatus() {
  const service = await spotifyConnect.status();
  let device = null;
  let deviceCheck = 'unavailable';
  let deviceError = null;

  if (spotify.isAuthenticated()) {
    try {
      const payload = await spotify.getDevices();
      const devices = payload && Array.isArray(payload.devices) ? payload.devices : [];
      const match = devices.find(item => String(item.name || '').toLowerCase() === SPOTIFY_CONNECT_DEVICE_NAME.toLowerCase());
      if (match) {
        device = {
          name: match.name,
          type: match.type,
          active: !!match.is_active,
          restricted: !!match.is_restricted,
          volume: Number.isFinite(Number(match.volume_percent)) ? Number(match.volume_percent) : null,
        };
      }
      deviceCheck = 'ok';
    } catch (err) {
      deviceCheck = 'error';
      deviceError = err.message;
    }
  }

  return {
    ...service,
    receiverName: SPOTIFY_CONNECT_DEVICE_NAME,
    visible: !!device,
    healthy: !!service.running && !!device,
    device,
    deviceCheck,
    deviceError,
  };
}

async function captureSpotifyResumeHint() {
  let playback = null;
  let queue = null;
  try { playback = await spotify.getPlaybackState(); } catch (_) {}
  try { queue = await spotify.getQueue(); } catch (_) {}

  const current = playback?.item || queue?.currently_playing || null;
  return {
    // A dead receiver commonly returns no playback object even though Spotify
    // still retains its queue. Treat that queue anchor as resumable, while a
    // normal explicitly-paused playback object remains paused.
    shouldResume: playback?.is_playing === true || (!playback?.item && !!queue?.currently_playing),
    contextUri: playback?.context?.uri || null,
    trackUri: current?.uri || null,
    progressMs: Math.max(0, Number(playback?.progress_ms) || 0),
  };
}

async function resumeSpotifyAfterRestart(hint) {
  if (!hint?.shouldResume || !spotify.isAuthenticated()) return false;

  // Spotify can keep advertising the pre-restart device record briefly. Give
  // librespot time to authenticate and publish its new Connect session before
  // attempting any playback transfer.
  await new Promise(resolve => setTimeout(resolve, 2200));

  const strategies = [];
  if (hint.contextUri && hint.trackUri) {
    strategies.push({
      context_uri: hint.contextUri,
      offset: { uri: hint.trackUri },
      position_ms: hint.progressMs,
    });
  }
  if (hint.contextUri) strategies.push({ context_uri: hint.contextUri });
  if (hint.trackUri) strategies.push({ uris: [hint.trackUri], position_ms: hint.progressMs });
  // Last resort: ask Spotify to resume whatever queue it retained.
  strategies.push({});

  let device = null;
  let resumeError = null;
  for (const body of strategies) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        const payload = await spotify.getDevices();
        device = payload?.devices?.find(item => String(item.name || '').toLowerCase() === SPOTIFY_CONNECT_DEVICE_NAME.toLowerCase()) || null;
      } catch (err) {
        resumeError = err;
      }
      if (!device) {
        await new Promise(resolve => setTimeout(resolve, 650));
        continue;
      }

      try {
        await spotify.startPlayback(device.id, body);
      } catch (err) {
        resumeError = err;
        // A 4xx means this particular context/offset is unusable; move to the
        // next fallback. Gateway/server errors are transient during startup.
        if (err.status >= 400 && err.status < 500 && err.status !== 429) break;
        await new Promise(resolve => setTimeout(resolve, 650));
        continue;
      }

      await new Promise(resolve => setTimeout(resolve, 900));
      try {
        const playback = await spotify.getPlaybackState();
        if (playback?.is_playing && String(playback.device?.name || '').toLowerCase() === SPOTIFY_CONNECT_DEVICE_NAME.toLowerCase()) {
          return true;
        }
      } catch (err) {
        resumeError = err;
      }
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }

  if (resumeError) throw resumeError;
  return false;
}

app.get('/api/streamer/spotify-connect/status', requireStreamOwner, async (req, res) => {
  try {
    res.json({ ok: true, ...(await getSpotifyConnectStatus()) });
  } catch (err) {
    res.json({ ok: false, configured: true, reachable: false, error: err.message });
  }
});

app.post('/api/streamer/spotify-connect/restart', requireStreamOwner, async (req, res) => {
  try {
    const resumeHint = await captureSpotifyResumeHint();
    await spotifyConnect.restart();
    const resumed = await resumeSpotifyAfterRestart(resumeHint);
    const state = await getSpotifyConnectStatus();
    console.log(`[spotify-connect] restart by ${req.session?.discordUser?.id || 'owner'} -> running=${state.running} visible=${state.visible} resumed=${resumed}`);
    res.json({ ok: true, resumed, ...state });
  } catch (err) {
    console.error('[spotify-connect] restart failed:', err.message);
    res.status(502).json({ ok: false, error: err.message });
  }
});

// Renderer PROCESS control (obs-power), distinct from the broadcast controls
// above. StopStream ends the RTMP output but leaves OBS compositing, and with
// no GPU on render1 that still costs roughly the whole box — on 2026-07-22 it
// sat in a failed reconnect loop for ~37h at ~950% CPU while sending 8 kbps.
// These endpoints stop/start the systemd unit so the machine actually goes idle.
app.get('/api/streamer/obs/power', requireStreamOwner, async (req, res) => {
  if (!obsPower.isConfigured()) return res.json({ configured: false });
  try {
    res.json({ configured: true, reachable: true, ...(await obsPower.status()) });
  } catch (err) {
    res.json({ configured: true, reachable: false, error: err.message });
  }
});

app.post('/api/streamer/obs/power', requireStreamOwner, express.json(), async (req, res) => {
  const action = String(req.body?.action || '');
  if (!['start', 'stop', 'restart'].includes(action)) {
    return res.status(400).json({ ok: false, error: 'action must be start, stop or restart' });
  }
  try {
    const state = await obsPower[action]();
    console.log(`[obs-power] ${action} by ${req.session?.discordUser?.id || 'owner'} -> active=${state.active} procs=${state.obsProcesses}`);
    res.json({ ok: true, ...state });
  } catch (err) {
    res.status(502).json({ ok: false, error: err.message });
  }
});

// ── Voice / TTS — per-streamer settings + mute list + voice-tts proxy ──
// The streamer dashboard's TTS card calls these. Settings persist per
// Discord ID; the chat-to-TTS pipeline (src/streamer-tts-pipeline.js)
// reads them on every TikTok chat event and emits `tts-play` to room
// voice-tts:<discordId>. The dashboard plays the resulting MP3 via the
// /api/voice/tts proxy below (voice-tts itself runs on a private port).
app.get('/api/me/voice-streamer/settings', auth.requireUser, (req, res) => {
  res.json(streamerTts.getSettings(req.session.discordUser.id));
});

app.put('/api/me/voice-streamer/settings', auth.requireUser, express.json(), (req, res) => {
  try {
    const saved = streamerTts.setSettings(req.session.discordUser.id, req.body || {});
    res.json(saved);
  } catch (err) {
    res.status(400).json({ error: err.message || String(err) });
  }
});

app.get('/api/me/voice-streamer/muted', auth.requireUser, (req, res) => {
  const list = streamerTts.getMuted(req.session.discordUser.id);
  res.json({ muted: list.map((viewer_key) => ({ viewer_key })) });
});

app.post('/api/me/voice-streamer/muted', auth.requireUser, express.json(), (req, res) => {
  const key = req.body?.viewer_key;
  if (!key) return res.status(400).json({ error: 'viewer_key required' });
  const list = streamerTts.addMute(req.session.discordUser.id, key);
  res.json({ muted: list.map((viewer_key) => ({ viewer_key })) });
});

app.delete('/api/me/voice-streamer/muted', auth.requireUser, express.json(), (req, res) => {
  const key = req.body?.viewer_key;
  if (!key) return res.status(400).json({ error: 'viewer_key required' });
  const list = streamerTts.removeMute(req.session.discordUser.id, key);
  res.json({ muted: list.map((viewer_key) => ({ viewer_key })) });
});

// Catalog proxy — exposes voice-tts /api/voices/list to the dashboard so
// streamers can pick a voice without us re-implementing the catalog.
app.get('/api/voice/catalog', async (req, res) => {
  try {
    const voices = await streamerTtsPipeline._getCatalog();
    res.json({ ok: true, voices });
  } catch (e) {
    res.status(502).json({ ok: false, error: 'voice_service_unavailable' });
  }
});

// MP3 stream proxy — fetches synthesized audio from voice-tts (private
// port, see VOICE_URL in streamer-tts-pipeline) and streams it back to
// the dashboard's <audio> element. voice-tts caches per-(voice_id,text)
// so repeat calls are cheap.
app.get('/api/voice/tts', async (req, res) => {
  try {
    const voice_id = String(req.query.voice_id || '');
    const text = String(req.query.text || '');
    if (!voice_id || !text) return res.status(400).json({ error: 'voice_id_and_text_required' });

    const upstream = await fetch(`${streamerTtsPipeline.VOICE_URL}/api/tts/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ voice_id, text }),
    });
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'voice_synth_failed', status: upstream.status, detail: detail.slice(0, 200) });
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    const cacheHeader = upstream.headers.get('x-tts-cache');
    if (cacheHeader) res.setHeader('X-TTS-Cache', cacheHeader);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: 'voice_proxy_error', detail: String(e?.message || e).slice(0, 200) });
  }
});

// Free TTS proxy — proxies voice-tts /api/tts/free (Piper, no API cost).
// Same shape as /api/voice/tts so the dashboard plays it the same way.
app.get('/api/voice/tts-free', async (req, res) => {
  try {
    const voice_key = String(req.query.voice_key || '');
    const text = String(req.query.text || '');
    if (!voice_key || !text) return res.status(400).json({ error: 'voice_key_and_text_required' });
    const url = `${streamerTtsPipeline.VOICE_URL}/api/tts/free?voice_key=${encodeURIComponent(voice_key)}&text=${encodeURIComponent(text)}`;
    const upstream = await fetch(url);
    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');
      return res.status(502).json({ error: 'free_synth_failed', status: upstream.status, detail: detail.slice(0, 200) });
    }
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'audio/mpeg');
    const cacheHeader = upstream.headers.get('x-tts-cache');
    if (cacheHeader) res.setHeader('X-TTS-Cache', cacheHeader);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.send(buf);
  } catch (e) {
    res.status(502).json({ error: 'free_proxy_error', detail: String(e?.message || e).slice(0, 200) });
  }
});

// Set the streamer's TikTok account(s). Accepts `tiktokUsernames: []` (up to
// streamers.MAX_TIKTOK_ACCOUNTS) and still honors the legacy single-string
// `tiktokUsername` body from older dashboard builds.
app.put('/api/streamer/tiktok', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const body = req.body || {};
  const incoming = Array.isArray(body.tiktokUsernames) ? body.tiktokUsernames : body.tiktokUsername;

  const parsed = normalizeTiktokHandleUpdate(incoming, discordId);
  if (!parsed.ok) return res.status(parsed.status).json({ ok: false, error: parsed.error });

  const { streamer } = applyTiktokHandleUpdate(discordId, parsed.names);
  res.json({ ok: true, streamer, tiktokUsernames: streamers.getTiktokUsernames(discordId) });
});

// Streamer game-routing → /monitor sync
//
// We track the most-recently-connected streamer in _lastActiveStreamerId
// (module-level, in-memory). Only that streamer's game-changes propagate
// to the sassie-runtime /monitor surface — multi-streamer collisions
// resolve to "whoever connected last owns the monitor". Cleared explicitly
// only on process restart; disconnect doesn't clear (a streamer can
// reconnect later and reclaim ownership via the connect endpoint).
//
// Game-id translation: /streamer's dropdown uses sproutle/betwixt/etc.
// while sassie-runtime's stream-context wants erectangled/betweenly. The
// reverse map already lives at sassie's STREAM_TO_WIN_OVERLAY_ID. The
// triangled option has no monitor counterpart at all (not in
// VALID_STREAM_GAMES on the sassie side) — silently skipped.
//
// Chat broadcast rooms are different: they must match the id each game server
// uses in app-register. Betwixt now registers as "betwixt", not the old
// "betweenly" id, so keep monitor and relay-room translation separate.
// Searchle render aliases share the same backend room / API port even when
// the frontend/session variant differs.
const STREAMER_TO_MONITOR_GAME = {
  sproutle: 'erectangled',
  betwixt: 'betweenly',
  'searchle-grid': 'searchle',
  'searchle-numbers': 'searchle',
};
const STREAMER_TO_RELAY_ROOM = {
  sproutle: 'erectangled',
  'searchle-grid': 'searchle',
  'searchle-numbers': 'searchle',
  'wikiword-4x4': 'wikirectangled',
};
const MONITOR_SKIP_GAMES = new Set(['triangled']);
function resolveStreamerGameRoom(rawGameId) {
  if (!rawGameId) return null;
  return STREAMER_TO_RELAY_ROOM[rawGameId] || rawGameId;
}

// Game-id → backend HTTP port (from apps.json on boot). Used by the
// streamer-side helpers below to call into each game's admin endpoints
// when a streamer disconnects / switches games.
const GAME_API_PORTS = (() => {
  try {
    const cfg = JSON.parse(require('fs').readFileSync(require('path').join(__dirname, 'apps.json'), 'utf-8'));
    const map = {};
    for (const a of (cfg.apps || [])) if (a.id && a.port) map[a.id] = a.port;
    return map;
  } catch (e) { console.warn('[StreamerSession] failed to load apps.json:', e.message); return {}; }
})();

function _resolveStreamerGameApiPort(rawGameId) {
  if (!rawGameId) return null;
  if (MONITOR_SKIP_GAMES.has(rawGameId)) return null;
  const targetGameId = STREAMER_TO_RELAY_ROOM[rawGameId] || rawGameId;
  const port = GAME_API_PORTS[targetGameId];
  if (!port) return null;
  return { targetGameId, port };
}

// Tell a game to drop any persistent redirect target for this handle —
// called when the streamer arrives at a new game so viewers landing on
// /?session=<handle> there aren't bounced to the streamer's PRIOR game.
async function clearStreamerRedirectInGame(rawGameId, handle) {
  if (!rawGameId || !handle) return;
  const r = _resolveStreamerGameApiPort(rawGameId);
  if (!r) return;
  try {
    const res = await fetch(`http://localhost:${r.port}/api/session/clear-redirect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.GAME_API_SECRET, 'x-admin-key': process.env.GAME_API_SECRET },
      body: JSON.stringify({ handle, gameId: rawGameId }),
    });
    if (!res.ok) console.log(`[StreamerSession] clear-redirect failed for ${r.targetGameId}: ${res.status}`);
  } catch (e) { console.log(`[StreamerSession] clear-redirect error for ${r.targetGameId}: ${e.message}`); }
}

// Deal a fresh board for this handle without ending the session. Used by the
// dashboard's "Restart now" button so a board-size change can be seen
// immediately instead of at the next natural round end. Returns true only if
// the game confirmed the restart.
async function restartStreamerSessionInGame(rawGameId, handle) {
  if (!rawGameId || !handle) return false;
  const r = _resolveStreamerGameApiPort(rawGameId);
  if (!r) { console.log(`[StreamerSession] no port mapped for "${rawGameId}" — skipping restart`); return false; }
  try {
    const res = await fetch(`http://localhost:${r.port}/api/session/restart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.GAME_API_SECRET, 'x-admin-key': process.env.GAME_API_SECRET },
      body: JSON.stringify({ handle, gameId: rawGameId }),
    });
    if (!res.ok) {
      console.log(`[StreamerSession] restart failed for ${r.targetGameId}: ${res.status}`);
      return false;
    }
    const body = await res.json().catch(() => null);
    // `restarted:false` means there was no live session to restart — the next
    // one will be built at the new size anyway, so treat it as success.
    return !!(body && body.ok);
  } catch (e) {
    console.log(`[StreamerSession] restart error for ${r.targetGameId}: ${e.message}`);
    return false;
  }
}

// Push a streamer's resolved board size straight into the game's cache.
// Without this the game only learns about a size change on its 5-minute
// /api/streamer-handles poll, so a streamer who picks a size and immediately
// hits "Restart now" gets a board built from the PREVIOUS value and
// reasonably concludes the feature is broken.
async function pushGridSizeToGame(rawGameId, handle, dims) {
  if (!rawGameId || !handle || !dims) return false;
  const r = _resolveStreamerGameApiPort(rawGameId);
  if (!r) return false;
  try {
    const res = await fetch(`http://localhost:${r.port}/api/session/grid-size`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.GAME_API_SECRET, 'x-admin-key': process.env.GAME_API_SECRET },
      body: JSON.stringify({ handle, rows: dims.rows, cols: dims.cols }),
    });
    if (!res.ok) { console.log(`[StreamerSession] grid-size push failed for ${r.targetGameId}: ${res.status}`); return false; }
    return true;
  } catch (e) {
    console.log(`[StreamerSession] grid-size push error for ${r.targetGameId}: ${e.message}`);
    return false;
  }
}

async function endStreamerSessionInGame(rawGameId, handle) {
  if (!rawGameId || !handle) return;
  const r = _resolveStreamerGameApiPort(rawGameId);
  if (!r) { console.log(`[StreamerSession] no port mapped for "${rawGameId}" — skipping end`); return; }
  try {
    const res = await fetch(`http://localhost:${r.port}/api/session/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.GAME_API_SECRET, 'x-admin-key': process.env.GAME_API_SECRET },
      body: JSON.stringify({ handle, gameId: rawGameId }),
    });
    if (!res.ok) console.log(`[StreamerSession] end failed for ${r.targetGameId}: ${res.status}`);
  } catch (e) { console.log(`[StreamerSession] end error for ${r.targetGameId}: ${e.message}`); }
}

// Notify the OLD game's session viewers that the streamer moved. Emits
// `session-redirect` over the streamer's session room with target URL +
// game name. Doesn't end the session — the streamer might switch back.
async function redirectStreamerSessionInGame(rawOldGameId, handle, opts) {
  if (!rawOldGameId || !handle || !opts || !opts.targetUrl) return;
  const r = _resolveStreamerGameApiPort(rawOldGameId);
  if (!r) { console.log(`[StreamerSession] no port mapped for "${rawOldGameId}" — skipping redirect`); return; }
  try {
    const res = await fetch(`http://localhost:${r.port}/api/session/redirect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.GAME_API_SECRET, 'x-admin-key': process.env.GAME_API_SECRET },
      body: JSON.stringify({
        handle,
        gameId: rawOldGameId,
        targetUrl: opts.targetUrl,
        targetGameName: opts.targetGameName || '',
        targetGameId: opts.targetGameId || '',
      }),
    });
    if (!res.ok) console.log(`[StreamerSession] redirect failed for ${r.targetGameId}: ${res.status}`);
  } catch (e) { console.log(`[StreamerSession] redirect error for ${r.targetGameId}: ${e.message}`); }
}

// Game-id → public player URL builder. Used by /api/streamer/game when
// announcing a game switch to old viewers.
const STREAMER_PLAYER_URL = {
  searchle: (h) => `https://subtextle.com/${h}`,
  'searchle-grid': (h) => `https://grid.subtextle.com/${h}`,
  'searchle-numbers': (h) => `https://subtextle.com/numbers/${h}`,
  rectangled: (h) => `https://rectangled.live/${h}`,
  erectangled: (h) => `https://erectangled.com/${h}`,
  sproutle: (h) => `https://erectangled.com/${h}`,
  wikisearchle: (h) => `https://wikicontexto.com/${h}`,
  wikirectangled: (h) => `https://wikirectangled.com/${h}`,
  wikiword: (h) => `https://wikiword.live/`,
  'wikiword-4x4': (h) => `https://wikirectangled.com/wikiword-4x4/${h}`,
  word500: (h) => `https://word5000.com/${h}`,
  colour500: (h) => `https://color500.com/${h}`,
  spellingbee: (h) => `https://wordtycoon.live/game/spellingbee/mp.html?session=${encodeURIComponent(h)}`,
  pixeletters: (h) => `https://wordtycoon.live/game/pixeletters/mp.html?session=${encodeURIComponent(h)}`,
  wordle: (h) => `https://wordtycoon.live/game/wordle/mp.html?session=${encodeURIComponent(h)}`,
  betwixt: (h) => `https://wordtycoon.live/game/betwixt/mp.html?session=${encodeURIComponent(h)}`,
  figural: (h) => `https://wordtycoon.live/game/figural/mp.html?session=${encodeURIComponent(h)}`,
  // Synapse is the ONE game with no game server — the streamer arena runs
  // INSIDE chat-relay and is keyed by the streamer's discord id (the chat sink
  // feeds msg._streamerId), not the tiktok handle. A handle-only builder can't
  // produce the watch URL, so this entry exists to REGISTER the game id (so
  // getStreamerAdvertisedGameIds / /api/streamers/live stop dropping it) and
  // the real URL is built from the record at the call site — same override the
  // /stream-game handler applies. Callers must null-guard the result.
  synapse: () => null,
  letterworks: (h) => `https://wordtycoon.live/letterworks/stream.html?session=${encodeURIComponent(h)}`,
  wordfall: (h) => `https://wordtycoon.live/wordfall/stream.html?session=${encodeURIComponent(h)}&mode=multi`,
};
const STREAMER_GAME_LABELS = {
  searchle: 'Subtextle',
  'searchle-grid': 'Subtextle (Grid)',
  'searchle-numbers': 'Number Search',
  rectangled: 'RecTangled',
  erectangled: 'eRecTangled',
  sproutle: 'eRecTangled',
  wikisearchle: 'WikiContexto',
  wikirectangled: 'WiKirecTangled',
  wikiword: 'WikiWord',
  'wikiword-4x4': 'WikiWord 4×4',
  word500: 'Word5000',
  colour500: 'Color 500',
  spellingbee: 'Spelling Bee',
  pixeletters: 'PixeLetters',
  wordle: 'Wordle',
  betwixt: 'Betwixt',
  figural: 'Figural',
  synapse: 'Synapse',
  letterworks: 'Letterworks',
  wordfall: 'Wordfall',
};
const STREAMER_HUB_GAME_ALIAS = {
  sproutle: 'erectangled',
  'searchle-grid': 'searchle',
  'searchle-numbers': 'searchle',
};

function resolveHubStreamerGameId(rawGameId) {
  const key = String(rawGameId || '').trim().toLowerCase();
  if (!key) return '';
  return STREAMER_HUB_GAME_ALIAS[key] || key;
}

function getStreamerPrimaryGameId(streamer) {
  if (!streamer) return '';
  const activeGames = streamers.getActiveGames(streamer.discordId);
  return String(activeGames[0] || streamers.DEFAULT_ACTIVE_GAME || 'searchle').trim().toLowerCase();
}

function getStreamerPinnedWidgetGameIds(discordId) {
  const out = [];
  const seen = new Set();
  if (!discordId) return out;
  try {
    const widgets = streamerGoals.getForStreamer(discordId)?.config?.widgets || [];
    for (const widget of widgets) {
      if (!widget || widget.type !== 'gameEmbed' || widget.enabled === false) continue;
      let gameId = String(widget.displayGame || '').trim().toLowerCase();
      if (gameId === 'searchle' && widget.searchleMode === 'grid') {
        gameId = 'searchle-grid';
      }
      if (!gameId || !STREAMER_PLAYER_URL[gameId] || seen.has(gameId)) continue;
      seen.add(gameId);
      out.push(gameId);
    }
  } catch (_) {}
  return out;
}

function getStreamerAdvertisedGameIds(streamer) {
  const out = [];
  const seen = new Set();
  const push = (rawGameId) => {
    const gameId = String(rawGameId || '').trim().toLowerCase();
    if (!gameId || !STREAMER_PLAYER_URL[gameId] || seen.has(gameId)) return;
    seen.add(gameId);
    out.push(gameId);
  };
  push(getStreamerPrimaryGameId(streamer));
  for (const gameId of getStreamerPinnedWidgetGameIds(streamer?.discordId)) push(gameId);
  return out;
}

function getStreamerSessionCleanupGameIds(streamer) {
  const out = [];
  const seen = new Set();
  const push = (rawGameId) => {
    const gameId = String(rawGameId || '').trim().toLowerCase();
    if (!gameId || seen.has(gameId)) return;
    seen.add(gameId);
    out.push(gameId);
  };
  push(getStreamerPrimaryGameId(streamer));
  if (streamer?.currentSession?.gameId) push(streamer.currentSession.gameId);
  if (Array.isArray(streamer?.activeGames)) {
    for (const gameId of streamer.activeGames) push(gameId);
  }
  for (const gameId of getStreamerPinnedWidgetGameIds(streamer?.discordId)) push(gameId);
  return out;
}

function normalizeStreamerSessionGameId(rawGameId) {
  const gameId = String(rawGameId || '').trim().toLowerCase();
  if (gameId === 'searchle-grid') return 'searchle';
  if (gameId === 'erectangled') return 'sproutle';
  return gameId;
}

function getStreamerSessionKeepGameIds(discordId, primaryGameId) {
  const out = [];
  const seen = new Set();
  const push = (rawGameId) => {
    const gameId = String(rawGameId || '').trim().toLowerCase();
    if (!gameId || seen.has(gameId)) return;
    seen.add(gameId);
    out.push(gameId);
  };
  push(primaryGameId);
  for (const gameId of getStreamerPinnedWidgetGameIds(discordId)) push(gameId);
  return out;
}

function shouldKeepStreamerSessionGame(rawGameId, keepGameIds) {
  const target = normalizeStreamerSessionGameId(rawGameId);
  return (Array.isArray(keepGameIds) ? keepGameIds : [])
    .some(gameId => normalizeStreamerSessionGameId(gameId) === target);
}

let _lastActiveStreamerId = null;

function syncMonitorFromStreamer(rawGameId) {
  if (!rawGameId) return; // empty / "All games (broadcast)" → leave monitor unchanged
  if (MONITOR_SKIP_GAMES.has(rawGameId)) return; // triangled etc. → skip
  const monitorGame = STREAMER_TO_MONITOR_GAME[rawGameId] || rawGameId;
  fetch(`${SASSIE_RUNTIME_URL}/api/runtime/stream-context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ game: monitorGame, source: 'streamer' }),
  }).then(r => {
    if (!r.ok) console.log(`[StreamerMonitor] sync to /monitor failed: ${r.status}`);
  }).catch(err => {
    console.log(`[StreamerMonitor] sync error: ${err.message}`);
  });
}

// Streamer-dashboard: fetch the current target for this streamer's
// private session. Only meaningful for searchle (target word) and
// wikisearchle (article title) — other games return { supported: false }
// so the dashboard hides the card. Read-only, requires logged-in
// streamer (callers can only see their own session, not other streamers').
app.get('/api/streamer/session-target', requireStreamer, async (req, res) => {
  const discordId = req.session.discordUser.id;
  const streamer = streamers.get(discordId);
  if (!streamer || !streamer.handle) return res.json({ ok: true, supported: false, reason: 'no-handle' });
  const rawGameId = getStreamerPrimaryGameId(streamer);
  const gameId = rawGameId;
  // Only games with a single spoilerable target expose this card.
  if (gameId !== 'searchle' && gameId !== 'searchle-grid' && gameId !== 'searchle-numbers' && gameId !== 'wikisearchle') {
    return res.json({ ok: true, supported: false, reason: 'unsupported-game', gameId: rawGameId });
  }
  const r = _resolveStreamerGameApiPort(gameId);
  if (!r) return res.json({ ok: true, supported: false, reason: 'port-unmapped', gameId: rawGameId });
  try {
    const url = `http://localhost:${r.port}/api/session/target?handle=${encodeURIComponent(streamer.handle)}&gameId=${encodeURIComponent(gameId)}`;
    const upstream = await fetch(url, {
      headers: { 'x-api-key': process.env.GAME_API_SECRET, 'x-admin-key': process.env.GAME_API_SECRET },
    });
    if (!upstream.ok) return res.json({ ok: true, supported: true, gameId: rawGameId, target: null, error: `upstream-${upstream.status}` });
    const data = await upstream.json();
    // Normalize: searchle returns `targetWord`, wikisearchle returns `articleTitle`.
    const target = data.articleTitle || data.targetWord || null;
    res.json({ ok: true, supported: true, gameId: rawGameId, handle: streamer.handle, target, isWon: !!data.isWon });
  } catch (e) {
    res.json({ ok: true, supported: true, gameId: rawGameId, target: null, error: e.message });
  }
});

app.post('/api/streamer/searchle/set-word', requireStreamer, express.json(), async (req, res) => {
  const discordId = req.session.discordUser.id;
  const streamer = streamers.get(discordId);
  if (!streamer || !streamer.handle) return res.status(400).json({ ok: false, error: 'no_handle' });
  const gameId = getStreamerPrimaryGameId(streamer);
  if (gameId !== 'searchle' && gameId !== 'searchle-grid') {
    return res.status(400).json({ ok: false, error: 'Searchle word sessions only' });
  }
  const r = _resolveStreamerGameApiPort(gameId);
  if (!r) return res.status(400).json({ ok: false, error: 'port_unmapped' });
  try {
    const upstream = await fetch(`http://localhost:${r.port}/api/session/set-word`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.GAME_API_SECRET,
        'x-admin-key': process.env.GAME_API_SECRET,
      },
      body: JSON.stringify({
        handle: streamer.handle,
        gameId,
        word: req.body?.word || '',
      }),
    });
    const data = await upstream.json().catch(() => ({}));
    res.status(upstream.status).json(data);
  } catch (e) {
    res.status(502).json({ ok: false, error: e.message || 'upstream_failed' });
  }
});

/**
 * Switch a streamer's primary game — retargets live TikTok connections, mirrors
 * to /monitor, restarts the private session, and redirects/ends sessions in the
 * game being left.
 *
 * Extracted from PUT /api/streamer/game so the Game Vote widget can perform a
 * real switch when a vote resolves. There is exactly ONE switch path; anything
 * that changes the active game must come through here or it will leave live
 * viewers stranded in the old game.
 */
// Apply a saved setup end-to-end: replace the live overlay config, then switch
// the active game to the setup's stored game (falling back to fallbackGameId —
// e.g. the vote candidate's game — for legacy setups saved without one).
// Returns null when the setup no longer exists; with a fallbackGameId a plain
// game switch still happens so a vote never strands the stream.
function applyStreamerSetup(discordId, setupId, fallbackGameId = null, opts = {}) {
  const setup = streamerSetups.getSetup(discordId, String(setupId || ''));
  if (!setup) {
    if (fallbackGameId) applyStreamerGameSwitch(discordId, fallbackGameId);
    return null;
  }
  // Clone so the validator inside setConfig can never retain references
  // into (and later mutate) the stored setup.
  const cfg = JSON.parse(JSON.stringify(setup.config));
  // Vote-driven applies keep the rotation alive: if the winning setup has no
  // gameVote / gameVoteStatus widgets at all, carry the streamer's current
  // ones over — otherwise loading the setup silently ends all future votes.
  // A setup that CONTAINS one of these (even disabled) is respected as-is,
  // and manual dashboard loads never do this (opts flag off).
  if (opts.preserveVoteWidgets) {
    try {
      const current = streamerGoals.getForStreamer(discordId).config;
      for (const type of ['gameVote', 'gameVoteStatus']) {
        if ((cfg.widgets || []).some(w => w && w.type === type)) continue;
        const live = (current.widgets || []).find(w => w && w.type === type && w.enabled !== false);
        if (!live) continue;
        cfg.widgets = cfg.widgets || [];
        cfg.widgets.push(JSON.parse(JSON.stringify(live)));
        if (Array.isArray(cfg.widgetOrder)) cfg.widgetOrder.push(live.id);
      }
    } catch (_) { /* preservation is best-effort — the apply itself must land */ }
  }
  const saved = streamerGoals.setConfig(discordId, cfg);
  const targetGame = setup.game || fallbackGameId || null;
  const active = streamers.get(discordId)?.activeGame || null;
  if (targetGame && targetGame !== active) {
    applyStreamerGameSwitch(discordId, targetGame);
  } else {
    // Same game — still re-point the vote engine at the new widget list.
    try { gameVote.syncStreamer(discordId); } catch (_) {}
  }
  return { setup, saved, game: targetGame };
}

function applyStreamerGameSwitch(discordId, rawGameId) {
  const gameId = String(rawGameId || '').trim() || null;
  // Capture the PRIOR active game BEFORE mutating state, so we can tell the
  // OLD game's session viewers the streamer moved.
  const _prev = streamers.get(discordId);
  const prevGameId = _prev && _prev.activeGame;
  const handle = _prev && _prev.handle;
  const s = streamers.setActiveGame(discordId, gameId);
  // Update target game on all live connections for this streamer.
  // Translate dropdown id → relay-room id so io.to(targetGame) reaches
  // the actual listener (sproutle dropdown → erectangled room, etc.).
  const usernames = streamers.getTiktokUsernames(discordId);
  const roomGameId = resolveStreamerGameRoom(gameId);
  for (const u of usernames) {
    tiktokDirect.updateStream(u, { targetGame: roomGameId });
  }
  // Mirror the change onto /monitor — only when this streamer is the
  // most-recently-connected one (otherwise their game-change shouldn't
  // hijack the monitor from the active broadcaster).
  if (discordId === _lastActiveStreamerId) {
    syncMonitorFromStreamer(gameId);
  }
  // If a live connection exists and the streamer runs a private session,
  // refresh the session to point at the new game (markSessionStart will
  // mint a fresh sessionId since gameId changed).
  const liveCount = tiktokDirect.getStatus().streams.filter(c => c.streamerId === discordId && (c.state === 'connected' || c.state === 'connecting')).length;
  if (liveCount && gameId && !streamers.isSessionDisabled(discordId)) {
    streamers.markSessionStart(discordId, gameId);
  }
  // Clean up any sessions in OTHER session-supported games for this
  // handle. A streamer should only run one private round at a time.
  // The immediate prev game also gets a redirect modal so its viewers
  // can follow; other games (stale leftovers from past switches) are
  // ended silently. endStreamerSessionInGame is idempotent — if the
  // game has no session for this handle it's a cheap no-op.
  if (handle && gameId) {
    const SESSION_GAMES = ['searchle', 'searchle-numbers', 'rectangled', 'sproutle', 'wikisearchle', 'colour500'];
    const keepSessionGames = getStreamerSessionKeepGameIds(discordId, gameId);
    const builder = STREAMER_PLAYER_URL[gameId];
    const targetUrl = builder ? builder(handle) : null;
    // Clear stale redirect targets on all games the stream still displays:
    // the primary game plus any pinned game widgets. Otherwise a secondary
    // widget can connect successfully but never receive game-state.
    for (const keepGameId of keepSessionGames) {
      clearStreamerRedirectInGame(keepGameId, handle).catch(() => {});
    }
    for (const g of SESSION_GAMES) {
      if (shouldKeepStreamerSessionGame(g, keepSessionGames)) continue;
      if (normalizeStreamerSessionGameId(g) === normalizeStreamerSessionGameId(prevGameId) && targetUrl) {
        console.log(`[StreamerSession] redirect+end ${g} -> ${gameId} for ${handle}`);
        redirectStreamerSessionInGame(g, handle, {
          targetUrl,
          targetGameName: STREAMER_GAME_LABELS[gameId] || gameId,
          targetGameId: gameId,
        })
          .catch(() => {})
          .then(() => endStreamerSessionInGame(g, handle).catch(() => {}));
      } else {
        console.log(`[StreamerSession] sweep-end ${g} for ${handle}`);
        endStreamerSessionInGame(g, handle).catch(() => {});
      }
    }
  }
  // Re-point the Game Vote term clock at the new game. Covers BOTH callers:
  // a manual switch from the dashboard restarts the term, and a vote-driven
  // switch confirms the game the vote already moved to.
  try { gameVote.syncStreamer(discordId); } catch (_) { /* never block a switch */ }
  // Streamer audience rooms are a live view over this same setting. Notify
  // browsers immediately; the room's iframe will follow the new game URL.
  if (handle) rooms.notify(handle);
  return s;
}

app.put('/api/streamer/game', requireStreamer, express.json(), (req, res) => {
  // Primary stream game only. Older callers may still send { gameIds }, but
  // only the first entry is honored — extra live games now come from pinned
  // game widgets, not this endpoint.
  const gameId = String(
    req.body?.gameId
    || (Array.isArray(req.body?.gameIds) ? req.body.gameIds[0] : '')
    || ''
  ).trim() || null;
  const s = applyStreamerGameSwitch(req.session.discordUser.id, gameId);
  res.json({ ok: true, streamer: s });
});

app.post('/api/streamer/connect', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const configuredUsernames = streamers.getTiktokUsernames(discordId);
  const requestedUsername = req.body?.username ? String(req.body.username).replace(/^@/, '').trim().toLowerCase() : null;
  const usernames = requestedUsername ? configuredUsernames.filter(u => String(u).toLowerCase() === requestedUsername) : configuredUsernames;
  if (!usernames.length) return res.status(400).json({ error: 'Set your TikTok username first' });
  if (requestedUsername && !configuredUsernames.some(u => String(u).toLowerCase() === requestedUsername)) {
    return res.status(400).json({ error: 'That TikTok username is not configured for your account' });
  }
  const s = streamers.get(discordId);
  if (streamers.isConnectBlocked(discordId)) {
    console.warn('[Streamer] blocked connect attempt', discordId, s?.tiktokUsername || '(no tt)');
    return res.status(403).json({ error: 'Your streamer slot is blocked by admin. Ask an admin to re-allow it before reconnecting.' });
  }
  // Translate dropdown id → relay-room id (see resolveStreamerGameRoom).
  const effectiveGameId = getStreamerPrimaryGameId(s);
  const roomGameId = resolveStreamerGameRoom(effectiveGameId);
  const results = [];
  for (const u of usernames) {
    results.push({ username: u, ...tiktokDirect.connectStream(u, {
      targetGame: roomGameId,
      streamerId: discordId,
    })});
  }
  // Claim /monitor ownership on a successful connect — subsequent game
  // changes from this streamer (and only this streamer) propagate to
  // /monitor until someone else connects.
  if (results.some(r => r.ok)) {
    _lastActiveStreamerId = discordId;
    streamers.setWantsConnected(discordId, true);
    if (!streamers.isSessionDisabled(discordId) && effectiveGameId) {
      streamers.markSessionStart(discordId, effectiveGameId);
    }
    // Fresh stream → reset stream-accumulated goal/milestone counters
    // (except for widgets the streamer marked persist=true). This is
    // gated on the manual /connect call, so auto-reconnects after a
    // dropped TikTok connection do NOT wipe progress — only intentional
    // stream-start clicks do.
    try {
      const out = streamerGoals.resetForNewStream(discordId);
      if (out.resetIds.length) {
        console.log(`[Goals] Reset ${out.resetIds.length} widget(s) on new stream for ${discordId}`);
      }
    } catch (err) {
      console.warn('[Goals] resetForNewStream failed:', err.message || err);
    }
  }
  res.json({ ok: results.some(r => r.ok), results });
});

app.post('/api/streamer/disconnect', requireStreamer, express.json(), (req, res) => {
  const discordId = req.session.discordUser.id;
  const configuredUsernames = streamers.getTiktokUsernames(discordId);
  const requestedUsername = req.body?.username ? String(req.body.username).replace(/^@/, '').trim().toLowerCase() : null;
  const usernames = requestedUsername ? configuredUsernames.filter(u => String(u).toLowerCase() === requestedUsername) : configuredUsernames;
  if (!usernames.length) return res.status(400).json({ error: 'No TikTok username set' });
  if (requestedUsername && !configuredUsernames.some(u => String(u).toLowerCase() === requestedUsername)) {
    return res.status(400).json({ error: 'That TikTok username is not configured for your account' });
  }
  const results = [];
  for (const u of usernames) {
    results.push({ username: u, ...tiktokDirect.disconnectStream(u) });
  }
  // End session when no live connections remain for this streamer.
  const remaining = tiktokDirect.getStatus().streams.filter(c => c.streamerId === discordId && (c.state === 'connected' || c.state === 'connecting'));
  if (!remaining.length) {
    const streamer = streamers.get(discordId);
    const lastGameIds = streamer ? getStreamerSessionCleanupGameIds(streamer) : [];
    const lastHandle = streamer && streamer.handle;
    streamers.markSessionEnd(discordId);
    streamers.setWantsConnected(discordId, false);
    if (lastHandle) {
      for (const lastGameId of lastGameIds) {
        if (lastGameId) endStreamerSessionInGame(lastGameId, lastHandle).catch(()=>{});
      }
    }
  }
  res.json({ ok: results.some(r => r.ok), results });
});

// Bridge token — opaque UUID a streamer pastes into their local Tycoon
// Stream Bridge exe. The exe presents it over Socket.IO on /streamer-bridge
// and receives a mirror of this streamer's own TikTok chat feed.
app.get('/api/streamer/bridge-token', requireStreamer, (req, res) => {
  const token = streamers.getBridgeToken(req.session.discordUser.id);
  res.json({ token });
});

app.post('/api/streamer/bridge-token/regenerate', requireStreamer, (req, res) => {
  const token = streamers.regenerateBridgeToken(req.session.discordUser.id);
  res.json({ token });
});

// Read the current state of this streamer's local bridge. Returns
// { connected, state, lastUpdate }. `connected` is false if no bridge has
// pushed state recently — dashboard uses this to render the bridge card.
app.get('/api/streamer/bridge/state', requireStreamer, (req, res) => {
  const entry = bridgeStateCache.get(req.session.discordUser.id);
  if (!entry) return res.json({ connected: false, state: null, lastUpdate: null });
  const stale = Date.now() - entry.lastUpdate > BRIDGE_PRESENCE_STALE_MS;
  res.json({
    connected: !stale,
    state: entry.state,
    lastUpdate: entry.lastUpdate,
    ageMs: Date.now() - entry.lastUpdate,
  });
});

// Push a config patch down to the bridge. The bridge applies it and
// re-emits bridge-state, updating the cache for the next poll.
app.post('/api/streamer/bridge/config', requireStreamer, express.json(), (req, res) => {
  const body = req.body || {};
  const patch = {};
  if (typeof body.tikfinityEnabled === 'boolean') patch.tikfinityEnabled = body.tikfinityEnabled;
  if (typeof body.cloudEnabled === 'boolean') patch.cloudEnabled = body.cloudEnabled;
  if (body.primary === 'tikfinity' || body.primary === 'cloud') patch.primary = body.primary;
  if (!Object.keys(patch).length) return res.status(400).json({ error: 'No valid fields in patch' });
  pushBridgeConfig(req.session.discordUser.id, patch);
  res.json({ ok: true, patch });
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

app.post('/api/word-bank/reload', async (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Unauthorized' });
  await wordBank.reload();
  res.json({ ok: true, message: 'Word bank reloaded' });
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

app.get('/api/win-overlay/settings', (req, res) => {
  res.json({ ok: true, settings: winOverlaySettings });
});

app.post('/api/win-overlay/settings', (req, res) => {
  if (!isAdminRequest(req) && !hasInternalApiKey(req)) {
    return res.status(401).json({ ok: false, error: 'Admin only' });
  }
  winOverlaySettings = mergeWinOverlaySettings(winOverlaySettings, req.body || {});
  try {
    saveWinOverlaySettings(winOverlaySettings);
  } catch (err) {
    return res.status(500).json({ ok: false, error: err.message || 'Failed to save win overlay settings' });
  }
  res.json({ ok: true, settings: winOverlaySettings });
});

// ─── Event Overlay (in-game events for the active Sassie game) ────────
app.get('/api/event-overlay/state', (req, res) => {
  res.json({ ok: true, state: eventOverlay.getState() });
});

app.post('/api/event-overlay/settings', express.json(), (req, res) => {
  if (!isAdminRequest(req) && !hasInternalApiKey(req)) {
    return res.status(401).json({ ok: false, error: 'Admin only' });
  }
  const body = req.body || {};
  const settings = eventOverlay.setShowMisses(!!body.showMisses);
  res.json({ ok: true, settings });
});

// ─── Top Likers Overlay ──────────────────────────────────────────────
// OBS URL: https://wordtycoon.live/toplikers/:discordId
// Per-session TikTok like leaderboard, one room per streamer.
app.get('/toplikers/:discordId', (req, res) => {
  const id = String(req.params.discordId || '').trim();
  if (!isPublicStreamerId(id)) return res.status(400).send('Invalid streamer id');
  res.sendFile(path.join(__dirname, 'public', 'top-likers.html'));
});

app.get('/api/toplikers/:discordId', async (req, res) => {
  const id = String(req.params.discordId || '').trim();
  if (!isPublicStreamerId(id)) return res.status(400).json({ error: 'Invalid streamer id' });
  try {
    res.json(await topLikers.getTopLikersSnapshot(id, 10));
  } catch (err) {
    res.status(500).json({ error: err.message || 'Failed to fetch top likers' });
  }
});

// ─── Spotify Integration ─────────────────────────────────────────────
app.get('/spotify/login', (req, res) => {
  if (!isAdminRequest(req)) return res.redirect('/admin/login');
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
  const requestedDiscordId = req.query.discordId ? String(req.query.discordId) : null;
  const sessionAccountId = await getResolvedSessionAccountId(req);

  if (!requestedDiscordId && !sessionAccountId && !isAdminRequest(req) && !hasInternalApiKey(req)) {
    return res.status(401).json({ ok: false, error: 'Login required' });
  }

  if (requestedDiscordId && !(await canAccessDiscordScopedData(req, requestedDiscordId))) {
    return res.status(403).json({ ok: false, error: 'Forbidden' });
  }

  try {
    const query = new URLSearchParams();
    if (requestedDiscordId) query.set('discordId', requestedDiscordId);
    else if (sessionAccountId) query.set('discordId', String(sessionAccountId));
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

  if (!isAdminRequest(req) && !hasInternalApiKey(req)) {
    const sessionAccountId = await getResolvedSessionAccountId(req);
    const isOwnDiscordProgress = platform === 'discord' && sessionAccountId && String(sessionAccountId) === String(userId);
    if (!sessionAccountId) {
      return res.status(401).json({ ok: false, error: 'Login required' });
    }
    if (!isOwnDiscordProgress) {
      return res.status(403).json({ ok: false, error: 'Forbidden' });
    }
  }

  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/daily-progress/${encodeURIComponent(platform)}/${encodeURIComponent(userId)}`);
    res.status(r.status).json(await r.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

app.get('/api/player-game-stats/:discordId', async (req, res) => {
  if (!(await canAccessDiscordScopedData(req, req.params.discordId))) {
    return res.status(req.session?.discordUser ? 403 : 401).json({ ok: false, error: req.session?.discordUser ? 'Forbidden' : 'Login required' });
  }
  try {
    const r = await wtFetch(`${WORD_EMPIRES_URL}/api/player-game-stats/${encodeURIComponent(req.params.discordId)}`);
    res.status(r.status).json(await r.json());
  } catch {
    res.status(502).json({ ok: false, error: 'Game server unreachable' });
  }
});

// ─── Daily Sequence API ───────────────────────────────────────────────────────
app.get('/api/daily-sequence', (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Unauthorized' });
  res.json({ ...sequenceState, sequence: DAILY_SEQUENCE });
});

app.post('/api/daily-sequence/start', (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Unauthorized' });
  startDailySequence();
  res.json({ ok: true, state: { ...sequenceState, sequence: DAILY_SEQUENCE } });
});

// Force-advance to a specific game (or next game) — API key auth for SSH use
app.post('/api/daily-sequence/advance', (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Unauthorized' });
  const { game } = req.body || {};
  const target = game || DAILY_SEQUENCE[sequenceState.currentIndex];
  if (!target) return res.status(400).json({ error: 'No active sequence step' });
  advanceDailySequence(target);
  res.json({ ok: true, state: { ...sequenceState, sequence: DAILY_SEQUENCE } });
});

// ─── Live Games API ─────────────────────────────────────────────────
app.get('/api/games/live', (req, res) => {
  res.json(cachedLiveState);
});

// Dynamic PWA manifest for the public mobile stream-view. Unlike the
// dashboard manifest, this one reopens the exact streamer + orientation
// the user installed from so the home-screen app lands back on the live
// composed stream surface instead of /streamer/.
app.get('/streamer/stream-view-manifest.webmanifest', (req, res) => {
  const referer = String(req.headers.referer || '').trim();
  let refererParams = null;
  try {
    if (referer) refererParams = new URL(referer).searchParams;
  } catch (_) { refererParams = null; }
  const rawId = String(req.query?.streamerId || refererParams?.get('streamerId') || '').trim();
  const streamerId = isPublicStreamerId(rawId) ? rawId : '';
  const modeRaw = String(req.query?.mode || refererParams?.get('mode') || '').trim().toLowerCase();
  const mode = modeRaw === 'landscape' ? 'landscape' : 'portrait';
  const sourcePath = streamerId
    ? `/streamer/stream-view.html?streamerId=${encodeURIComponent(streamerId)}&mode=${mode}&source=pwa`
    : '/streamer/?source=pwa';
  let handleLabel = '';
  try {
    const s = streamerId ? streamers.get(streamerId) : null;
    const handle = String(s?.handle || '').trim();
    if (handle) handleLabel = '@' + handle;
  } catch (_) {}
  const manifest = {
    name: handleLabel ? `Word Game Live ${handleLabel}` : 'Word Game Live Stream View',
    short_name: handleLabel ? handleLabel.slice(0, 12) : 'WT Stream',
    description: 'Install the live mobile stream-view with the active game and widgets composed on one screen.',
    id: sourcePath,
    start_url: sourcePath,
    scope: '/streamer/',
    display: 'standalone',
    orientation: mode,
    background_color: '#000000',
    theme_color: '#000000',
    icons: [
      { src: '/streamer/icons/icon-512.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/streamer/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/streamer/icons/icon-1024.png', sizes: '1024x1024', type: 'image/png', purpose: 'any maskable' },
    ],
  };
  res.set('Cache-Control', 'no-store');
  res.type('application/manifest+json');
  res.send(JSON.stringify(manifest, null, 2));
});

// Public list of currently-live streamers (those with at least one connected
// TikTok stream AND private-session enabled). Used by /me's game cards to
// render a "(N) Streamers" pill on each game showing who's live there.
// Polled every ~5s by the portal — keep this lightweight.
// Public list of whitelisted streamer handles. Games hit this
// to gate session creation — only whitelisted handles get a
// /<handle> private session; everything else redirects to public.
// Handles are not secret (they're public TikTok identities).
// Public lookup: given a streamer discord ID, return the active game's
// board overlay URL + handle + gameId. Used by /streamer/stream-view.html
// (mobile streaming surface) which needs to embed the live game without
// requiring the streamer's session cookie.
// Same trust model as the existing /api/streamer-handles endpoint —
// discord IDs are public knowledge from OBS URLs already.
// Mirrors GAME_BOARD_OVERLAY_URL in public/streamer/index.html — keep both
// in sync when adding/renaming a game. Triangled isn't in the dashboard map
// (no board overlay), so we exclude it here.
// Per-game embed URL for the stream-view's gameEmbed widget.
// Three categories:
//   1. OBS-overlay (still works well): searchle, wikirectangled
//      → keep using /overlay/<handle>; the overlay is designed for the
//        1080×1920 canvas and renders cleanly.
//   2. Private multiplayer page: wikisearchle, rectangled, erectangled, sproutle, word500
//      → use the public player URL /<handle> instead of the OBS overlay.
//        Player pages are full responsive mobile UIs that fit any viewport.
//   3. wordtycoon.live games (spellingbee/pixeletters/wordle/betwixt/figural)
//      → use the multiplayer page (mp.html) with ?session=<handle> so the
//        embed shows the same live session anyone else joining would see.
//        These pages are responsive mobile-first; the OBS overlay variant
//        crops too much to be usable in the embed.
// Cache-bust version computed once at server startup. Appended to every
// embed URL so each chat-relay restart guarantees iframes fetch a fresh
// copy of the game pages (browser-side aggressive caching otherwise leaves
// streamers on stale game JS/CSS after we deploy). Per-poll URL stays
// constant during a single server lifetime so the iframe doesn't reload
// repeatedly while the streamer is live.
const _GAME_EMBED_VERSION = Date.now().toString(36);
// Player-page embeds carry `&obs=1` so the global session-disable-gate.js
// treats them like an OBS broadcast surface and skips the "Join the live
// stream" overlay. Without it, any streamer with the disablePlayerPage
// setting on would see the gate cover the embedded game in stream-view.
// The OBS-overlay URLs already exit the gate via their /overlay/ path or
// in-page detection, so they don't need the flag explicitly (but it's
// harmless to add for consistency).
const _STREAM_VIEW_GAME_URLS = {
  searchle:       (h) => `https://subtextle.com/overlay/${h}?obs=1&_v=${_GAME_EMBED_VERSION}`,
  // searchle-grid: chip-grid mode lives on grid.subtextle.com (no /overlay
  // path — the subdomain is the alt mode). Same backend room as searchle.
  // NB: this host had no DNS record for a while and every link handed out
  // here hit NXDOMAIN. The record now exists (Cloudflare, proxied). If the
  // grid ever looks "offline" again, check DNS before touching the code —
  // nginx serves the host correctly either way, so a Host-header curl on
  // render1 will pass while real viewers get nothing.
  'searchle-grid': (h) => `https://grid.subtextle.com/${h}?obs=1&_v=${_GAME_EMBED_VERSION}`,
  'searchle-numbers': (h) => `https://subtextle.com/numbers/overlay/${h}?obs=1&_v=${_GAME_EMBED_VERSION}`,
  // `obs=1` is load-bearing and NOT redundant with stream_widget=1. The game
  // page's _isObsOverlay() accepts either flag (that's what suppresses the win
  // card), but the `obs-overlay-mode` CLASS — which hides the site header /
  // login screen / guess bar, clears the page background, kills three
  // backdrop-filter blurs and applies the 720-design self-scale — is gated on
  // the literal `obs=1` alone (wikicontexto index.html head script). It was
  // dropped in 7b5eb0f (2026-05-31) when `obs=1` was REPLACED by
  // `streamer_self=1` instead of joined to it, so the widget spent ~10 weeks
  // rendering the full site inside the OBS embed: wrong layout vs a direct
  // /overlay/<handle> source, and three software-rasterized blurs on render1,
  // which has no GPU. Keep all three flags.
  wikisearchle:   (h) => `/game/wikisearchle/?session=${encodeURIComponent(h)}&streamer_self=1&stream_widget=1&obs=1&_v=${_GAME_EMBED_VERSION}`,
  wikirectangled: (h) => `https://wikirectangled.com/overlay/${h}?obs=1&_v=${_GAME_EMBED_VERSION}`,
  wikiword: (h) => `https://wikirectangled.com/wikiword?stream_widget=1&obs=1&_v=${_GAME_EMBED_VERSION}`,
  'wikiword-4x4': (h) => `https://wikirectangled.com/wikiword-4x4/${h}?stream_widget=1&obs=1&_v=${_GAME_EMBED_VERSION}`,
  rectangled:     (h) => `https://rectangled.live/${h}?obs=1&_v=${_GAME_EMBED_VERSION}`,
  erectangled:    (h) => `https://erectangled.com/${h}?obs=1&_v=${_GAME_EMBED_VERSION}`,
  sproutle:       (h) => `https://erectangled.com/${h}?obs=1&_v=${_GAME_EMBED_VERSION}`,
  word500:        (h) => `https://word5000.com/${h}?obs=1&_v=${_GAME_EMBED_VERSION}`,
  // Board-only OBS view built for the stream canvas (category 1).
  colour500:      (h) => `https://color500.com/overlay/${h}?obs=1&_v=${_GAME_EMBED_VERSION}`,
  spellingbee:    (h) => `https://wordtycoon.live/game/spellingbee/mp.html?session=${encodeURIComponent(h)}&obs=1&_v=${_GAME_EMBED_VERSION}`,
  pixeletters:    (h) => `https://wordtycoon.live/game/pixeletters/mp.html?session=${encodeURIComponent(h)}&obs=1&_v=${_GAME_EMBED_VERSION}`,
  wordle:         (h) => `https://wordtycoon.live/game/wordle/mp.html?session=${encodeURIComponent(h)}&obs=1&_v=${_GAME_EMBED_VERSION}`,
  betwixt:        (h) => `https://wordtycoon.live/game/betwixt/mp.html?session=${encodeURIComponent(h)}&obs=1&_v=${_GAME_EMBED_VERSION}`,
  figural:        (h) => `https://wordtycoon.live/game/figural/mp.html?session=${encodeURIComponent(h)}&obs=1&_v=${_GAME_EMBED_VERSION}`,
  // Synapse MP is a bespoke chat-race arena keyed by the streamer's discord id
  // (not the tiktok handle), so the real URL is built in the stream-game handler
  // with `id`. This entry just registers the game id so it resolves here.
  synapse:        () => null,
  letterworks:    (h) => `https://wordtycoon.live/letterworks/stream.html?session=${encodeURIComponent(h)}&obs=1&_v=${_GAME_EMBED_VERSION}`,
  wordfall:      (h) => `https://wordtycoon.live/wordfall/stream.html?session=${encodeURIComponent(h)}&mode=multi&obs=1&_v=${_GAME_EMBED_VERSION}`,
};
// Per-game viewport hint for the gameEmbed widget. Two modes:
//   'fixed-720'    → game's HTML uses <meta viewport width=720>; the embed
//                    must size the iframe at 720×1280 (portrait) and CSS-
//                    transform-scale it to fill the container. This is what
//                    wikisearchle/wikirectangled need so their fixed-width
//                    design renders at the intended layout.
//   'responsive'   → game's HTML uses <meta viewport width=device-width>;
//                    the iframe should be sized at the actual container
//                    pixel dimensions and rendered natively (no transform).
//                    Searchle/rectangled/etc. use this — forcing a 720
//                    viewport breaks their responsive layout because
//                    elements wrap/position differently at non-design widths.
// Default for unmapped games: 'responsive' (safer — render natively).
// Per-game iframe sizing strategy for the gameEmbed widget / bgGame:
//   'fixed-720'      → iframe at 720×1280 then CSS-scale to fill container.
//                      Required for games designed at a 720 viewport
//                      (wikisearchle/wikirectangled use `width=720`).
//   'responsive'     → same: iframe at 720×1280 + CSS-scale. Matches the
//                      legacy bgGame behavior. Used for games whose content
//                      fits within 1280px height at 720 width.
//   'canvas-native'  → iframe sized at the actual container pixels with NO
//                      transform. The game lays itself out at canvas
//                      resolution (1080×1920). Required when the game's
//                      content is taller than 1280px at 720 width and would
//                      get clipped by 720×1280 + scale (Spelling Bee's
//                      vertically-centered overlay does this).
const _STREAM_VIEW_GAME_VIEWPORT = {
  // OBS overlays: tuned to render at 720×1280 design viewport, scale up.
  searchle:       'responsive',     // overlay at 720+scale (bgGame parity)
  'searchle-grid': 'responsive',    // same viewport as regular searchle
  'searchle-numbers': 'responsive', // same alt-shell viewport as Searchle grid
  // WAS 'fixed-720'. That was a workaround for the missing `obs=1` flag (see
  // _STREAM_VIEW_GAME_URLS above): with no obs-overlay-mode the page never ran
  // its own `scale(innerWidth/720)`, so the only way to fill the frame was to
  // lay the page out at 720 CSS px and CSS-scale the RASTER up ~1.46x — which
  // is why the stream looked soft. obs=1 is restored, so the page self-scales
  // and the iframe can take real canvas pixels: same apparent size (720 x
  // 1.4889 x 0.9824 widget scale = 1053px either way), rendered at 1080
  // natively instead of upscaled from 720.
  wikisearchle:   'canvas-native',
  // Left on fixed-720 deliberately — wikirectangled is a different app and was
  // not verified to self-scale under obs=1. Do not flip it without checking.
  wikirectangled: 'fixed-720',
  wikiword: 'fixed-720',
  'wikiword-4x4': 'fixed-720',
  // Player pages (mp.html / /<handle>): responsive mobile UIs that fit
  // whatever viewport they're given. Use canvas-native so the iframe gets
  // actual canvas pixels and the page lays itself out for that area.
  rectangled:     'canvas-native',
  erectangled:    'canvas-native',
  sproutle:       'canvas-native',
  word500:        'canvas-native',
  // Board-only fluid view that scales itself. MUST be canvas-native:
  // 'responsive' applies scale(sx,sy) with DIFFERENT x/y factors, which
  // squashes the board whenever the widget isn't exactly 9:16.
  colour500:      'canvas-native',
  spellingbee:    'canvas-native',
  pixeletters:    'canvas-native',
  wordle:         'canvas-native',
  betwixt:        'canvas-native',
  figural:        'canvas-native',
  // Synapse MP arena: position:fixed/inset:0 canvas that sizes itself to the
  // viewport. MUST be canvas-native for the same reason colour500 is —
  // 'responsive' applies scale(sx,sy) with DIFFERENT x/y factors, so every
  // width/height tweak squashes the constellation instead of resizing it.
  synapse:        'canvas-native',
  letterworks:    'canvas-native',
  wordfall:       'canvas-native',
};
app.get('/api/streamer-public/:discordId/stream-game', (req, res) => {
  const id = String(req.params.discordId || '').trim();
  if (!isPublicStreamerId(id)) return res.status(400).json({ ok: false, error: 'Invalid id' });
  const s = streamers.get(id);
  if (!s || !s.handle) return res.status(404).json({ ok: false, error: 'Not found' });
  const handle = String(s.handle).toLowerCase();
  const requestedGameId = String(req.query?.gameId || '').trim().toLowerCase();
  const requestedMode = String(req.query?.mode || '').trim().toLowerCase();
  const layoutMode = (requestedMode === 'landscape') ? 'landscape' : 'portrait';
  const explicitGameId = (requestedGameId && _STREAM_VIEW_GAME_URLS[requestedGameId]) ? requestedGameId : null;
  const widgetId = String(req.query?.widgetId || '').trim();
  const session = streamers.isSessionDisabled(id) ? null : streamers.getCurrentSession(id);
  const activeGames = Array.isArray(s.activeGames) && s.activeGames.length
    ? s.activeGames
    : ((session && session.gameId) ? [session.gameId] : [getStreamerPrimaryGameId(s)]);
  const gameId = explicitGameId || activeGames[0] || null;
  const builder = gameId && _STREAM_VIEW_GAME_URLS[gameId];
  let boardOverlayUrl = builder ? builder(handle) : null;
  // Synapse MP arena: overlay is keyed by the streamer's discord id (which is
  // the same id the chat sink feeds — msg._streamerId), not the tiktok handle.
  if (gameId === 'synapse') boardOverlayUrl = `https://wordtycoon.live/synapse/mp?streamer=${encodeURIComponent(id)}`;
  if (gameId && getStreamerAdvertisedGameIds(s).includes(gameId) && !streamers.isSessionDisabled(id)) {
    clearStreamerRedirectInGame(gameId, handle).catch(() => {});
  }
  let goals = null;
  const resolveGameEmbedWidget = () => {
    if (!goals) {
      try { goals = streamerGoals.getForStreamer(id); } catch (_) { goals = null; }
    }
    const widgets = goals?.config?.widgets || [];
    if (widgetId) {
      const exact = widgets.find(w => w && w.type === 'gameEmbed' && w.id === widgetId);
      if (exact) return exact;
    }
    return widgets.find(w => w && w.type === 'gameEmbed') || null;
  };
  // Append &rows=N for grid-mode renders. Reads widget.gridRows from the
  // gameEmbed widget — that's the single source of truth for both the
  // searchle-grid gameId path AND the legacy searchleMode='grid' path.
  // The legacy path is handled in the overlay's URL append (since the
  // overlay knows the widget config); we only append here when the
  // gameId itself signals grid mode.
  if (boardOverlayUrl && gameId === 'searchle-grid') {
    try {
      const gw = resolveGameEmbedWidget();
      const rawRows = gw?.gridRows;
      const rows = Number.isFinite(Number(rawRows)) ? Math.max(3, Math.min(25, Math.round(Number(rawRows)))) : 15;
      const sep = boardOverlayUrl.includes('?') ? '&' : '?';
      boardOverlayUrl += `${sep}rows=${rows}`;
    } catch (_) { /* boardOverlayUrl falls through unchanged */ }
  }
  // viewportMode: streamer's per-game override (saved in their goals
  // config under gameLayouts[gameId][mode]['gameEmbed-default'])
  // .viewportMode) wins over the global default. Lets a streamer force
  // e.g. 'canvas-native' on wikisearchle for a sharper render without
  // changing the default for everyone else.
  let viewportMode = null;
  if (gameId) {
    try {
      const wm = goals?.config?.gameLayouts?.[gameId]?.[layoutMode]?.[widgetId || 'gameEmbed-default']?.viewportMode;
      if (typeof wm === 'string' && ['fixed-720', 'responsive', 'canvas-native'].includes(wm)) {
        viewportMode = wm;
      }
    } catch (_) { /* fall through to global default */ }
  }
  if (!viewportMode) viewportMode = (gameId && _STREAM_VIEW_GAME_VIEWPORT[gameId]) || 'responsive';
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, handle, gameId, boardOverlayUrl, viewportMode, ts: Date.now() });
});

// ── Audience rooms ──────────────────────────────────────────────────────
// Streamer rooms are virtual views over the existing streamer registry;
// donor rooms are persisted by src/rooms.js. Both use the same private-game
// session handles, so a room never drops its players into the public round.
function getLiveConnectionsForStreamer(discordId) {
  return tiktokDirect.getStatus().streams.filter((connection) =>
    connection.streamerId === discordId && connection.state === 'connected'
  );
}

rooms.configure({
  getStreamerByHandle: (handle) => streamers.getByHandle(handle),
  listStreamers: () => streamers.getAll(),
  isStreamerLive: (discordId) => getLiveConnectionsForStreamer(discordId).length > 0,
  getStreamerViewerCount: (discordId) => getLiveConnectionsForStreamer(discordId)
    .reduce((sum, connection) => sum + (Number(connection.viewerCount) || 0), 0),
  switchStreamerGame: async (discordId, gameId) => !!applyStreamerGameSwitch(discordId, gameId),
  onStateChange: (slug) => {
    // Avoid coupling the state manager to Socket.IO. The async broadcaster is
    // fire-and-forget because room presence and vote mutations must stay fast.
    broadcastAudienceRoomState(slug).catch(() => {});
  },
});

// Donor rooms end after ten minutes without interaction, including across
// relay restarts. Streamer rooms follow the live connection instead.
rooms.expireInactive();
const roomExpiryTimer = setInterval(() => rooms.expireInactive(), 30_000);
roomExpiryTimer.unref?.();

// Audience rooms embed games beside room chat. Keep every iframe on
// the room's origin so games with frame-ancestors 'self' still work, and use
// direct ?session= entry points so a newly-created donor room does not wait
// for a game's five-minute handle-cache refresh.
const ROOM_PLAYER_URL = {
  letterworks: (h) => `/letterworks/stream.html?session=${encodeURIComponent(h)}`,
  wordfall: (h) => `/wordfall/stream.html?session=${encodeURIComponent(h)}&mode=multi`,
  searchle: (h) => `/game/searchle/?session=${encodeURIComponent(h)}&mobile=1`,
  'searchle-grid': (h) => `/game/searchle/?session=${encodeURIComponent(h)}&mode=grid&mobile=1`,
  'searchle-numbers': (h) => `/game/searchle/numbers?session=${encodeURIComponent(h)}&mobile=1`,
  rectangled: (h) => `/game/rectangled/?session=${encodeURIComponent(h)}`,
  erectangled: (h) => `/game/erectangled/mp.html?session=${encodeURIComponent(h)}`,
  wikisearchle: (h) => `/game/wikisearchle/?session=${encodeURIComponent(h)}`,
  wikirectangled: (h) => `/game/wikirectangled/?session=${encodeURIComponent(h)}`,
  wikiword: () => '/game/wikirectangled/wikiword?stream_widget=1',
  'wikiword-4x4': (h) => `/game/wikirectangled/wikiword-4x4/${encodeURIComponent(h)}`,
  word500: (h) => `/game/word500/?session=${encodeURIComponent(h)}`,
  colour500: (h) => `/game/colour500/?session=${encodeURIComponent(h)}`,
  spellingbee: (h) => `/game/spellingbee/mp.html?session=${encodeURIComponent(h)}`,
  pixeletters: (h) => `/game/pixeletters/mp.html?session=${encodeURIComponent(h)}`,
  wordle: (h) => `/game/wordle/mp.html?session=${encodeURIComponent(h)}`,
  betwixt: (h) => `/game/betwixt/mp.html?session=${encodeURIComponent(h)}`,
  figural: (h) => `/game/figural/mp.html?session=${encodeURIComponent(h)}`,
};

function roomGameUrl(room) {
  if (!room) return null;
  const gameId = rooms.normalizeGameId(room.currentGame);
  if (gameId === 'synapse') {
    return room.type === 'streamer'
      ? `/synapse/mp?streamer=${encodeURIComponent(room.ownerId)}&_v=${_GAME_EMBED_VERSION}`
      : null;
  }
  const builder = ROOM_PLAYER_URL[gameId];
  // Proxy HTML includes current account/socket shims. A deployment must bypass
  // upstream HTML validators that could otherwise keep an older injected page.
  if (!builder) return null;
  const url = builder(room.slug);
  return `${url}${url.includes('?') ? '&' : '?'}_v=${_GAME_EMBED_VERSION}`;
}

function buildAudienceRoomPayload(room, actorId = null) {
  if (!room) return null;
  const currentGame = rooms.normalizeGameId(room.currentGame);
  const gameMeta = rooms.GAME_BY_ID.get(currentGame);
  const payload = {
    slug: room.slug,
    type: room.type,
    displayName: room.displayName,
    ownerUsername: room.ownerUsername,
    currentGame,
    gameName: gameMeta?.label || STREAMER_GAME_LABELS[currentGame] || currentGame,
    gameUrl: roomGameUrl(room),
    gameViewportWidth: roomEmbed.getVirtualWidth(currentGame),
    roomUrl: `https://wordtycoon.live/${encodeURIComponent(room.slug)}`,
    open: room.open !== false,
    live: !!room.live,
    viewerCount: Math.max(0, Number(room.viewerCount) || 0),
    memberCount: Math.max(0, Number(room.memberCount) || rooms.memberCount(room.slug)),
    availableGames: rooms.availableGames(room.slug),
    vote: rooms.voteSnapshot(room.slug),
    createdAt: room.createdAt || null,
    updatedAt: room.updatedAt || null,
  };
  // Generic Socket.IO broadcasts must not overwrite the owner's private flag
  // with false. Only actor-specific HTTP/join snapshots carry this field.
  if (actorId !== null && actorId !== undefined) {
    payload.isOwner = String(actorId) === String(room.ownerId);
  }
  return payload;
}

async function getAudienceRoomActor(req, { includeEligibility = false } = {}) {
  const sessionUser = req.session?.discordUser;
  if (!sessionUser?.id) return null;
  const ownerId = await getCurrentWordTycoonAccountId(sessionUser);
  const streamer = ownerId ? streamers.get(ownerId) : null;
  let donor = false;
  if (ownerId && includeEligibility) {
    try { donor = !!(await computePerksById(ownerId)).donor; } catch (_) {}
  }
  return {
    id: String(ownerId || sessionUser.id),
    username: String(sessionUser.username || sessionUser.globalName || sessionUser.displayName || 'player'),
    displayName: String(sessionUser.globalName || sessionUser.displayName || sessionUser.username || 'Player'),
    donor,
    streamer: !!streamer,
    streamerRecord: streamer,
  };
}

async function broadcastAudienceRoomState(slug) {
  const room = rooms.resolve(slug, { includeClosed: true });
  if (!room) return;
  io.to(`audience-room:${room.slug}`).emit('audience-room-state', buildAudienceRoomPayload(room));
}

app.get('/api/streamer-handles', (req, res) => {
  const HRE = /^[a-z0-9_-]{1,32}$/;
  const all = streamers.getAll();
  const handles = [];
  const settings = [];
  for (const s of all) {
    if (!s || !s.handle) continue;
    const h = String(s.handle).toLowerCase();
    if (!HRE.test(h)) continue;
    handles.push(h);
    settings.push({
      handle: h,
      disablePlayerPage: !!s.disablePlayerPage,
      // Resolved board size per RecTangled-family game — { rectangled:
      // { preset, rows, cols }, erectangled: {...} }. Those games read it
      // at session start / round restart. Games that don't size their board
      // ignore the key entirely.
      gridSizes: streamers.getGridSizeDimensions(s.discordId),
      blockedPlayers: Array.isArray(s.blockedPlayers)
        ? s.blockedPlayers.map(b => ({
            platform: String(b.platform || '').toLowerCase(),
            id: String(b.id || ''),
          }))
        : [],
    });
  }
  // Open donor rooms are also valid private-session handles. They get neutral
  // settings: no player-page gate and no blocklist. Streamer handles already
  // won any collision above and are not duplicated.
  for (const h of rooms.getSessionHandles()) {
    if (!HRE.test(h) || handles.includes(h)) continue;
    handles.push(h);
    settings.push({
      handle: h,
      disablePlayerPage: false,
      blockedPlayers: [],
    });
  }
  res.json({ handles, settings });
});

// ── Streamer settings + blocklist endpoints ────────────────────────
// Owned by the authenticated streamer (requireStreamer). Affect ALL of
// this streamer's private games. Games consume settings via the polled
// /api/streamer-handles endpoint above.

app.post('/api/streamer/settings', requireStreamer, express.json(), (req, res) => {
  const { disablePlayerPage } = req.body || {};
  if (typeof disablePlayerPage !== 'boolean') {
    return res.status(400).json({ error: 'disablePlayerPage must be a boolean' });
  }
  const ok = streamers.setPlayerPageDisabled(req.streamer.discordId, disablePlayerPage);
  if (!ok) return res.status(404).json({ error: 'streamer not found' });
  res.json({
    ok: true,
    disablePlayerPage: streamers.isPlayerPageDisabled(req.streamer.discordId),
  });
});

app.put('/api/streamer/fanclub-title', requireStreamer, express.json(), (req, res) => {
  const { title } = req.body || {};
  if (title != null && typeof title !== 'string') {
    return res.status(400).json({ ok: false, error: 'title must be a string' });
  }

  try {
    const s = streamers.setFcTitle(req.streamer.discordId, title || '');
    if (!s) return res.status(404).json({ ok: false, error: 'streamer not found' });
    res.json({
      ok: true,
      fcTitle: streamers.getFcTitle(req.streamer.discordId) || '',
    });
  } catch (e) {
    res.status(400).json({ ok: false, error: e.message });
  }
});

app.get('/api/streamer/blocks', requireStreamer, (req, res) => {
  res.json({ blocks: streamers.getBlockedPlayers(req.streamer.discordId) });
});

app.post('/api/streamer/block', requireStreamer, express.json(), (req, res) => {
  const { platform, id, name } = req.body || {};
  if (!platform || !id) {
    return res.status(400).json({ error: 'platform and id are required' });
  }
  const result = streamers.addBlockedPlayer(req.streamer.discordId, { platform, id, name });
  if (!result) return res.status(400).json({ error: 'invalid block payload' });
  res.json({ ok: true, blocks: result });
});

app.post('/api/streamer/unblock', requireStreamer, express.json(), (req, res) => {
  const { platform, id } = req.body || {};
  if (!platform || !id) {
    return res.status(400).json({ error: 'platform and id are required' });
  }
  const blocks = streamers.removeBlockedPlayer(req.streamer.discordId, platform, id);
  res.json({ ok: true, blocks });
});

app.get('/api/streamer/recent-chatters', requireStreamer, (req, res) => {
  const limit = Math.max(1, Math.min(50, parseInt(req.query.limit, 10) || 20));
  res.json({
    chatters: relay.getRecentChatters(req.streamer.discordId, limit),
  });
});


app.get('/api/streamers/live', (req, res) => {
  // Map: discordId → live TikTok stream entries (state=connected)
  const liveByStreamer = new Map();
  for (const c of tiktokDirect.getStatus().streams) {
    if (!c.streamerId || c.state !== 'connected') continue;
    if (!liveByStreamer.has(c.streamerId)) liveByStreamer.set(c.streamerId, []);
    liveByStreamer.get(c.streamerId).push(c);
  }
  const out = [];
  for (const s of streamers.getAll()) {
    if (s.disableSession) continue;
    if (!s.handle) continue;
    const conns = liveByStreamer.get(s.discordId);
    if (!conns || !conns.length) continue;
    const liveGameIds = getStreamerAdvertisedGameIds(s);
    if (!liveGameIds.length) continue;
    const totalViewers = conns.reduce((sum, c) => sum + (c.viewerCount || 0), 0);
    const seenHubGames = new Set();
    for (const sourceGameId of liveGameIds) {
      const builder = STREAMER_PLAYER_URL[sourceGameId];
      if (!builder) continue; // game doesn't support private sessions
      const hubGameId = resolveHubStreamerGameId(sourceGameId);
      if (!hubGameId || seenHubGames.has(hubGameId)) continue;
      // Synapse's builder returns null on purpose: its arena is keyed by the
      // streamer's discord id, not the handle (see STREAMER_PLAYER_URL). Build
      // the spectator URL from the record — mirrors the /stream-game override.
      // Viewers play Synapse by typing in TikTok chat, so the watch view is the
      // correct destination for the hub's streamer pill.
      let playerUrl = builder(s.handle);
      if (sourceGameId === 'synapse') {
        playerUrl = `https://wordtycoon.live/synapse/mp?streamer=${encodeURIComponent(s.discordId)}`;
      }
      // Resolved nothing and no override applies — don't burn the hub slot, a
      // later sourceGameId aliasing to the same hub card may still resolve.
      if (!playerUrl) continue;
      seenHubGames.add(hubGameId);
      out.push({
        handle: s.handle,
        displayName: s.displayName || s.username || s.handle,
        gameId: hubGameId,
        sourceGameId,
        gameName: STREAMER_GAME_LABELS[sourceGameId] || sourceGameId,
        playerUrl,
        viewerCount: totalViewers,
        connectedAt: conns[0]?.connectedAt || null,
      });
    }
  }
  res.json({ streamers: out });
});

// Public room directory used by the Toon Tower's former ON AIR strip.
// Streamer rooms appear only while their TikTok connection is live; donor
// rooms remain listed while their owner has left the room open.
app.get('/api/rooms', (req, res) => {
  const directory = rooms.listPublic().map((room) => {
    const payload = buildAudienceRoomPayload(room);
    return {
      slug: payload.slug,
      type: payload.type,
      displayName: payload.displayName,
      currentGame: payload.currentGame,
      gameName: payload.gameName,
      roomUrl: payload.roomUrl,
      live: payload.live,
      viewerCount: payload.viewerCount,
      memberCount: payload.memberCount,
    };
  });
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, rooms: directory });
});

app.get('/api/rooms/:slug', async (req, res) => {
  const actor = await getAudienceRoomActor(req);
  const room = rooms.resolve(req.params.slug, { includeClosed: true });
  if (!room || (room.open === false && String(room.ownerId) !== String(actor?.id || ''))) {
    return res.status(404).json({ ok: false, error: 'room_not_found' });
  }
  res.set('Cache-Control', 'no-store');
  res.json({ ok: true, room: buildAudienceRoomPayload(room, actor?.id) });
});

// One permanent donor room per Word Tycoon account. Streamers already own a
// virtual room at their approved handle, so they receive that instead of a
// duplicate donor-room record.
app.get('/api/me/room', auth.requireUser, async (req, res) => {
  const actor = await getAudienceRoomActor(req, { includeEligibility: true });
  if (!actor) return res.status(401).json({ ok: false, error: 'login_required' });
  let room = actor.streamerRecord?.handle
    ? rooms.resolve(actor.streamerRecord.handle, { includeClosed: true })
    : null;
  if (!room) {
    const record = rooms.getByOwner(actor.id);
    if (record) room = rooms.resolve(record.slug, { includeClosed: true });
  }
  res.json({
    ok: true,
    eligible: actor.donor || actor.streamer,
    donor: actor.donor,
    streamer: actor.streamer,
    room: room ? buildAudienceRoomPayload(room, actor.id) : null,
  });
});

app.post('/api/me/room', auth.requireUser, express.json(), async (req, res) => {
  const actor = await getAudienceRoomActor(req, { includeEligibility: true });
  if (!actor) return res.status(401).json({ ok: false, error: 'login_required' });
  if (actor.streamerRecord?.handle) {
    const room = rooms.resolve(actor.streamerRecord.handle, { includeClosed: true });
    return res.json({ ok: true, room: buildAudienceRoomPayload(room, actor.id) });
  }
  if (!actor.donor) {
    return res.status(403).json({
      ok: false,
      error: 'donor_required',
      message: 'Creating a room requires Donor Class or higher.',
      upgradeUrl: '/membership',
    });
  }
  try {
    const record = rooms.createUserRoom({
      ownerId: actor.id,
      username: actor.username,
      displayName: actor.displayName,
    });
    const room = rooms.resolve(record.slug, { includeClosed: true });
    res.status(201).json({ ok: true, room: buildAudienceRoomPayload(room, actor.id) });
  } catch (error) {
    res.status(400).json({ ok: false, error: 'room_create_failed', message: error.message });
  }
});

app.delete('/api/me/room', auth.requireUser, async (req, res) => {
  const actor = await getAudienceRoomActor(req);
  if (!actor) return res.status(401).json({ ok: false, error: 'login_required' });
  if (actor.streamer) {
    return res.status(400).json({ ok: false, error: 'streamer_room_follows_live_status' });
  }
  const record = rooms.setUserRoomOpen(actor.id, false);
  if (!record) return res.status(404).json({ ok: false, error: 'room_not_found' });
  const room = rooms.resolve(record.slug, { includeClosed: true });
  res.json({ ok: true, room: buildAudienceRoomPayload(room, actor.id) });
});

app.put('/api/rooms/:slug/game', auth.requireUser, express.json(), async (req, res) => {
  const actor = await getAudienceRoomActor(req);
  const room = rooms.resolve(req.params.slug, { includeClosed: true });
  if (!actor || !room || String(room.ownerId) !== String(actor.id)) {
    return res.status(403).json({ ok: false, error: 'owner_required' });
  }
  try {
    const updated = await rooms.setGame(room.slug, req.body?.gameId);
    res.json({ ok: true, room: buildAudienceRoomPayload(updated, actor.id) });
  } catch (error) {
    res.status(400).json({ ok: false, error: 'game_change_failed', message: error.message });
  }
});

app.post('/api/rooms/:slug/vote/start', auth.requireUser, express.json(), async (req, res) => {
  const actor = await getAudienceRoomActor(req);
  const room = rooms.resolve(req.params.slug);
  if (!actor || !room || String(room.ownerId) !== String(actor.id)) {
    return res.status(403).json({ ok: false, error: 'owner_required' });
  }
  try {
    const vote = rooms.startVote(room.slug, { durationSeconds: req.body?.durationSeconds });
    res.json({ ok: true, vote });
  } catch (error) {
    res.status(400).json({ ok: false, error: 'vote_start_failed', message: error.message });
  }
});

app.post('/api/rooms/:slug/vote/finish', auth.requireUser, async (req, res) => {
  const actor = await getAudienceRoomActor(req);
  const room = rooms.resolve(req.params.slug);
  if (!actor || !room || String(room.ownerId) !== String(actor.id)) {
    return res.status(403).json({ ok: false, error: 'owner_required' });
  }
  try {
    res.json(await rooms.finishVote(room.slug));
  } catch (error) {
    res.status(400).json({ ok: false, error: 'vote_finish_failed', message: error.message });
  }
});

app.post('/api/rooms/:slug/vote/cancel', auth.requireUser, async (req, res) => {
  const actor = await getAudienceRoomActor(req);
  const room = rooms.resolve(req.params.slug, { includeClosed: true });
  if (!actor || !room || String(room.ownerId) !== String(actor.id)) {
    return res.status(403).json({ ok: false, error: 'owner_required' });
  }
  rooms.cancelVote(room.slug);
  res.json({ ok: true });
});

// ─── Ad overlay trigger ──────────────────────────────────────────────
// Accepts optional body: { slide: 0|1|2|3|4 }
// OBS overlay: 0=Word Tycoon, 1=erecTangled, 2=Searchle, 3=recTangled
// Portal overlay: 0=Word Tycoon Info, 1=Word Tycoon Retro, 2=erecTangled, 3=Searchle, 4=recTangled
const AD_SLIDES = [
  { name: 'Word Tycoon',  website: 'wordtycoon.live',  cta: 'Play on the website for less delay' },
  { name: 'erecTangled',  website: 'erectangled.com',  cta: 'Play erecTangled for free' },
  { name: 'Subtextle',     website: 'subtextle.com',    cta: 'Guess words, climb the ranks on Subtextle' },
  { name: 'recTangled',   website: 'rectangled.live',  cta: 'Play recTangled for free' },
  { name: 'Junk Drawer',  website: 'junkdrawer.live',  cta: 'Merge household items into the Big TV at junk drawer dot live' },
  { name: 'Color 500',    website: 'color500.com',     cta: 'Crack the hidden colour code on Color 500' },
];
const AD_OVERLAY_DEFAULT_FILE = '/ad-vertical-generic.html';
const AD_OVERLAY_FILE_MAP = {
  wordtycoon: '/ad-vertical-generic.html',
  searchle: '/ad-vertical-searchle.html',
  'searchle-grid': '/ad-vertical-searchle.html',
  'searchle-numbers': '/ad-vertical-searchle.html',
  rectangled: '/ad-vertical-rectangled.html',
  erectangled: '/ad-vertical-erectangled.html',
  sproutle: '/ad-vertical-sproutle.html',
  betweenly: '/ad-vertical-betweenly.html',
  betwixt: '/ad-vertical-betwixt.html',
  // `word500` is the game ID; the game's public name is Word5000 (word5000.com).
  // Both IDs therefore point at the WORD5000-spelling banner — the follow-active-
  // game path resolves the ID `word500` and used to serve a rail that spelled
  // "WORD500". ad-vertical-word500.html is now unreferenced but kept on disk.
  word500: '/ad-vertical-word5000.html',
  word5000: '/ad-vertical-word5000.html',
  wordle: '/ad-vertical-wordle.html',
  pixeletters: '/ad-vertical-pixeletters.html',
  figural: '/ad-vertical-figural.html',
  spellingbee: '/ad-vertical-spellingbee.html',
  squaredle: '/ad-vertical-squaredle.html',
  unwordle: '/ad-vertical-unwordle.html',
  triangled: '/ad-vertical.html',
  junkdrawer: '/ad-vertical-junkdrawer.html',
  wordmine: '/ad-vertical-wordmine.html',
  wikisearchle: '/ad-vertical-wikisearchle.html',
  wikirectangled: '/ad-vertical-wikirectangled.html',
  colour500: '/ad-vertical-colour500.html',
  synapse: '/ad-vertical-synapse.html'
};

// Resolve a streamer identifier to the game they're playing:
// live TikTok Direct connection first, then their active game session.
//
// The identifier is whatever the caller has to hand, and the surfaces disagree:
// the goals-overlay Ad Banner widget embeds /ad-vertical/<handle> (the URL slug,
// e.g. `jorrybeaufart`), while TikTok Direct only knows the TikTok username
// (e.g. `museumcomesalive`). Matching on `tiktokUsername` alone meant every
// streamer whose handle differs from their TikTok handle silently fell through
// to the generic (Word Tycoon) banner — which is exactly what the ai_licia
// handle rename did to the owner account. Match on handle/username too.
function resolveStreamerActiveGame(handle) {
  const h = String(handle || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{1,32}$/.test(h)) return null;
  // Field priority is deliberate, not cosmetic: one streamer's `username` must
  // never shadow another's `tiktokUsername`, so each field is swept across the
  // whole roster before falling to the next.
  let _rec = null;
  try {
    const all = streamers.getAll() || [];
    const by = (field) => all.find((s) => String(s[field] || '').toLowerCase() === h) || null;
    // A streamer can run several TikTok handles — sweep the whole list, not
    // just the primary, or the secondary account resolves to no game at all.
    const bySecondary = () => all.find((s) => (streamers.getTiktokUsernames(s.discordId) || [])
      .some((u) => String(u || '').toLowerCase() === h)) || null;
    _rec = by('tiktokUsername') || bySecondary() || by('handle') || by('username')
      || all.find((s) => String(s.discordId || '') === h) || null;
  } catch (e) { /* fall through */ }
  try {
    // Live connection wins — the streamer may have retargeted mid-stream. Match
    // the live stream by TikTok username, resolving through the record first so
    // a handle-based lookup still finds it.
    const liveNames = new Set([h]);
    if (_rec) {
      for (const u of streamers.getTiktokUsernames(_rec.discordId) || []) {
        liveNames.add(String(u).toLowerCase());
      }
    }
    const live = (tiktokDirect.getStatus().streams || [])
      .find((s) => liveNames.has(String(s.username || '').toLowerCase()));
    if (live && live.targetGame) return String(live.targetGame).trim().toLowerCase();
  } catch (e) { /* fall through */ }
  try {
    if (_rec) {
      const games = streamers.getActiveGames(_rec.discordId) || [];
      if (games[0]) return String(games[0]).trim().toLowerCase();
    }
  } catch (e) { /* fall through */ }
  return null;
}

// Per-streamer OBS ad overlay: /ad-vertical/<handle> serves the wrapper page,
// which reads the handle from its own path, asks /api/ad-overlay/current
// ?streamer= for that streamer's game, and forwards ?streamer= to the inner
// per-game banner (win-room scoping). The nginx side (wordgame.live) already
// proxies this path — the route was the missing piece.
app.get(/^\/ad-vertical\/[a-z0-9_-]{1,32}\/?$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'ad-vertical.html'));
});
app.get('/api/ad-slides', (req, res) => {
  res.json({ ok: true, slides: AD_SLIDES.map((s, i) => ({ id: i, name: s.name })) });
});
app.get('/api/ad-overlay/current', async (req, res) => {
  const requestedGame = typeof req.query?.game === 'string' ? req.query.game.trim().toLowerCase() : '';
  const gameId = requestedGame || null;

  if (gameId) {
    return res.json({
      ok: true,
      source: 'query',
      activeGame: gameId,
      overlayPath: AD_OVERLAY_FILE_MAP[gameId] || AD_OVERLAY_DEFAULT_FILE
    });
  }

  // Streamer-scoped: follow this streamer's own game rather than the
  // global Sassie stream context. Falls through to the global path if the
  // streamer isn't connected / has no active session.
  const requestedStreamer = typeof req.query?.streamer === 'string' ? req.query.streamer.trim().toLowerCase() : '';
  if (requestedStreamer) {
    const streamerGame = resolveStreamerActiveGame(requestedStreamer);
    if (streamerGame) {
      return res.json({
        ok: true,
        source: 'streamer',
        activeGame: streamerGame,
        overlayPath: AD_OVERLAY_FILE_MAP[streamerGame] || AD_OVERLAY_DEFAULT_FILE
      });
    }
  }

  try {
    const upstream = await fetch(`${SASSIE_RUNTIME_URL}/api/runtime/stream-context`);
    const payload = upstream.ok ? await upstream.json() : null;
    const activeGame = String(payload?.streamContext?.activeGame || '').trim().toLowerCase() || null;
    return res.json({
      ok: true,
      source: 'sassie-runtime',
      activeGame,
      overlayPath: activeGame ? (AD_OVERLAY_FILE_MAP[activeGame] || AD_OVERLAY_DEFAULT_FILE) : AD_OVERLAY_DEFAULT_FILE
    });
  } catch (error) {
    return res.json({
      ok: true,
      source: 'fallback',
      activeGame: null,
      overlayPath: AD_OVERLAY_DEFAULT_FILE,
      warning: error.message
    });
  }
});
// Simulate a TikTok gift into a streamer's gift room — for testing Junk
// Drawer TikTok mode without a live stream. Admin-keyed.
app.post('/api/junkdrawer/test-gift', express.json(), (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Unauthorized' });
  const handle = String(req.body?.handle || '').toLowerCase().trim();
  if (!/^[a-z0-9_.-]{1,32}$/.test(handle)) return res.status(400).json({ error: 'bad handle' });
  const gift = {
    giftName: String(req.body?.giftName || 'Rose').slice(0, 40),
    diamondCount: Math.max(1, Math.min(100000, parseInt(req.body?.diamondCount, 10) || 1)),
    user: {
      username: String(req.body?.username || 'tester').slice(0, 40),
      displayName: String(req.body?.username || 'Tester').slice(0, 40),
      profilePic: null,
    },
  };
  io.to('streamer-gift:' + handle).emit('gift', gift);
  res.json({ ok: true, room: 'streamer-gift:' + handle, sent: gift });
});

app.post('/api/trigger-ad', (req, res) => {
  if (!isAdminRequest(req)) return res.status(403).json({ error: 'Unauthorized' });
  const slide = typeof req.body?.slide === 'number' ? req.body.slide : undefined;
  const adData = slide != null ? { slide } : {};
  io.emit('show-ad', adData);
  const info = AD_SLIDES[slide] || AD_SLIDES[0];
  sassie.forwardSystemEvent('word-tycoon', 'ad_promo', {
    website: info.website,
    callToAction: info.cta,
    overlay: info.name
  }, 'normal');
  res.json({ ok: true, slide: slide != null ? slide : 'cycle' });
});

// ─── Cosmetics broadcast (fan out to all game servers) ───────────────
app.post('/api/cosmetics-broadcast', (req, res) => {
  // Only Word Tycoon should call this — require API key
  if (!hasInternalApiKey(req)) return res.status(403).json({ error: 'Unauthorized' });
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
JACKPOT_GAME_PORTS['rectangled'] = 3016;

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

function getSearchleBestGuess(state) {
  const guesses = Array.isArray(state?.guesses) ? state.guesses : [];
  let best = null;
  for (const guess of guesses) {
    if (!guess || typeof guess.rank !== 'number' || guess.rank <= 0) continue;
    if (!best || guess.rank < best.rank) best = guess;
  }
  return best;
}

function buildSearchleSassieContext(state) {
  const guessCount = state ? (state.guesses || []).length : undefined;
  const elapsedMs = state?.startTime
    ? Date.now() - new Date(state.startTime).getTime()
    : undefined;
  const bestGuess = getSearchleBestGuess(state);

  return {
    searchleGuessCount: guessCount || undefined,
    searchleElapsedMs: elapsedMs || undefined,
    searchlePlayerCount: state?.playerCount || undefined,
    searchleAvgGuesses: state?.avgGuesses || undefined,
    searchleTotalGames: state?.totalMPGames || undefined,
    searchleCurrentBestGuess: bestGuess?.word || undefined,
    searchleCurrentBestRank: bestGuess?.rank || undefined,
    searchleCurrentBestPlayer: bestGuess?.user?.displayName || bestGuess?.user?.username || undefined
  };
}

function buildSproutleSassieContext(state) {
  const topPlayers = Array.isArray(state?.topPlayers) ? state.topPlayers : [];
  const leader = topPlayers[0] || null;
  const percentage = typeof state?.percentage === 'number'
    ? Math.round(state.percentage)
    : undefined;

  return {
    rows: state?.rows ?? undefined,
    cols: state?.cols ?? undefined,
    percentage: percentage ?? undefined,
    puzzleName: state?.puzzleName || undefined,
    puzzleTheme: state?.puzzleTheme || undefined,
    commonCount: state?.commonCount ?? undefined,
    rareCount: state?.rareCount ?? undefined,
    hiddenCount: state?.hiddenCount ?? undefined,
    threeLetterCount: state?.threeLetterCount ?? undefined,
    foundCommonCount: state?.foundCommonCount ?? undefined,
    foundRareCount: state?.foundRareCount ?? undefined,
    foundHiddenCount: state?.foundHiddenCount ?? undefined,
    foundThreeLetterCount: state?.foundThreeLetterCount ?? undefined,
    playerCount: topPlayers.length || undefined,
    leaderName: leader?.displayName || undefined,
    leaderScore: leader?.score ?? undefined
  };
}

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
const RECTANGLED_PORT = 3016;
const RECTANGLED_URL = `http://localhost:${RECTANGLED_PORT}`;

app.post('/api/rectangled/command', async (req, res) => {
  try {
    const r = await fetch(`${RECTANGLED_URL}/api/command`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'recTangled unreachable' }); }
});

app.get('/api/rectangled/state', async (req, res) => {
  try {
    const r = await fetch(`${RECTANGLED_URL}/api/game/state`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'recTangled unreachable' }); }
});

app.get('/api/rectangled/history', async (req, res) => {
  try {
    const r = await fetch(`${RECTANGLED_URL}/api/game/history`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'recTangled unreachable' }); }
});

app.get('/api/rectangled/jackpot', async (req, res) => {
  try {
    const r = await fetch(`${RECTANGLED_URL}/api/jackpot/settings`);
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'recTangled unreachable' }); }
});

app.post('/api/rectangled/jackpot', async (req, res) => {
  try {
    const r = await fetch(`${RECTANGLED_URL}/api/jackpot/settings`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET }, body: JSON.stringify(req.body)
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'recTangled unreachable' }); }
});

app.post('/api/rectangled/reset-jackpot', async (req, res) => {
  try {
    const r = await fetch(`${RECTANGLED_URL}/api/jackpot/reset`, {
      method: 'POST', headers: { 'x-api-key': WT_API_SECRET }
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'recTangled unreachable' }); }
});

app.post('/api/rectangled/start-daily', async (req, res) => {
  try {
    const r = await fetch(`${RECTANGLED_URL}/api/game/start-daily`, {
      method: 'POST', headers: { 'x-api-key': WT_API_SECRET }
    });
    res.json(await r.json());
  } catch { res.status(502).json({ error: 'recTangled unreachable' }); }
});

// ─── Word500 Admin API (proxy to Word500 server) ────────────────────
let word500Socket = null;
let lastWord500State = null;

let erectangledSocket = null;
let lastSproutleState = null;

let wordleSocket = null;
let lastWordleState = null;

let rectangledSocket = null;
let lastRectangledState = null;

// First-time-player tracker per game. Reset on each new-game / round start.
// Keyed by game id; value is a Set of normalized player keys we've already
// announced to Sassie this round.
const sassieSeenPlayers = new Map();
function emitFirstTimePlayer(game, user, extraData) {
  if (!user) return;
  const key = String(
    user.id || user.uid || user.platformUserId || user.username || user.displayName || ''
  ).toLowerCase().trim();
  if (!key) return;
  let set = sassieSeenPlayers.get(game);
  if (!set) { set = new Set(); sassieSeenPlayers.set(game, set); }
  if (set.has(key)) return;
  set.add(key);
  sassie.forwardGameEvent(game, 'first_time_player', { user, ...(extraData || {}) }, 'low');
}
function resetSeenPlayers(game) { sassieSeenPlayers.delete(game); }

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
// Redirect user-facing game URLs to internal game proxy paths.
const PORTAL_GAME_REDIRECTS = {

  '/rectangled/':        '/game/rectangled/mobile.html',
  '/rectangled/online/': '/game/rectangled/mobile.html',
  '/rectangled-multi/':  '/game/rectangled/mobile.html',
  '/rectangled/solo/':   '/game/rectangled/mobile-sp.html',
  '/rectangled-single/': '/game/rectangled/mobile-sp.html',
  '/spellingbee/online/':'/game/spellingbee/mp.html',
  '/spellingbee/solo/':  '/game/spellingbee/sp.html',
  '/spellingbee/':      '/game/spellingbee/sp.html',
  '/spellingbee-multi/':'/game/spellingbee/mp.html',
  '/pixeletters/online/':'/game/pixeletters/mp.html',
  '/pixeletters/solo/': '/game/pixeletters/sp.html',
  '/pixeletters/':      '/game/pixeletters/sp.html',
  '/pixeletters-multi/':'/game/pixeletters/mp.html',
  '/betwixt/online/': '/game/betwixt/mp.html',
  '/betwixt/solo/':   '/game/betwixt/play',
  '/betwixt/':        '/game/betwixt/play',
  '/betwixt-multi/':  '/game/betwixt/mp.html',
  // Legacy betweenly URLs — redirect to betwixt
  '/betweenly/online/': '/game/betwixt/mp.html',
  '/betweenly/solo/':   '/game/betwixt/play',
  '/betweenly/':        '/game/betwixt/play',
  '/betweenly-multi/':  '/game/betwixt/mp.html',
  '/wordle/online/':    '/game/wordle/mp.html',
  '/wordle/solo/':      '/game/wordle/sp.html',
  '/wordle/':           '/game/wordle/sp.html',
  '/wordle-multi/':     '/game/wordle/mp.html',
  // Subtextle (formerly Searchle). /game/subtextle/* is a proxy alias of
  // /game/searchle/* (apps.json aliases), so both serve the same app and
  // the old paths stay alive for the TWA, overlays and bookmarks.
  '/subtextle/online/': '/game/subtextle/',
  '/subtextle/solo/':   '/game/subtextle/sp.html',
  '/subtextle/':        '/game/subtextle/',
  '/searchle/online/':  '/game/subtextle/',
  '/searchle/solo/':    '/game/subtextle/sp.html',
  '/searchle/':         '/game/subtextle/',
  '/searchle-single/':  '/game/subtextle/sp.html',
  '/searchle-toast/':   '/game/searchle/v/toast',
  '/word500/solo/':     '/game/word500/',
  '/word500/':          '/game/word500/',
  '/word500-multi/':    '/game/word500/',
  '/word1000/solo/':    '/game/word1000/play.html',
  '/word1000/':         '/game/word1000/play.html',
  '/figural/online/':   '/game/figural/mp.html',
  '/figural/solo/':     '/game/figural/sp.html',
  '/figural/':          '/game/figural/sp.html',
  '/figural-multi/':    '/game/figural/mp.html',
  '/unwordle/solo/':    '/game/unwordle/sp.html',
  '/unwordle/':         '/game/unwordle/sp.html',
  '/erectangled/solo/':    '/game/erectangled/sp.html',
  '/erectangled-single/':  '/game/erectangled/sp.html',
  '/erectangled/':         '/game/erectangled/mp.html',
  '/erectangled/online/':  '/game/erectangled/mp.html',
  '/erectangled-multi/':   '/game/erectangled/mp.html',
  '/erectangled-overlay/': '/game/erectangled/',
  '/sproutle/solo/':       '/game/erectangled/sp.html',
  '/sproutle-single/':     '/game/erectangled/sp.html',
  '/sproutle/':            '/game/erectangled/mp.html',
  '/sproutle/online/':     '/game/erectangled/mp.html',
  '/sproutle-multi/':      '/game/erectangled/mp.html',
  '/sproutle-overlay/':    '/game/erectangled/',
  '/triangled/solo/':   '/game/triangled/',
  '/triangled/':        '/game/triangled/',
  '/arcade/':           '/game/arcade/play.html',
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
const ROOT_ASSET_REWRITE_GAMES = new Set(['searchle', 'wikisearchle', 'wikirectangled', 'wikiword-4x4']);
const INTERNAL_GAME_VIEWPORT_SHIM_GAMES = new Set(['word500', 'wordle', 'pixeletters', 'figural', 'betwixt', 'unwordle']);

function shouldRewriteRootAssetPath(url) {
  return typeof url === 'string'
    && url.startsWith('/')
    && !url.startsWith('//')
    && !url.startsWith('/game/')
    && !url.startsWith('/api/me')
    && !url.startsWith('/api/auth')
    && !url.startsWith('/auth/')
    && !url.startsWith('/api/library')
    && !url.startsWith('/api/sp-')
    && !url.startsWith('/portal/')
    && !url.startsWith('/privacy')
    && !url.startsWith('/terms')
    && !url.startsWith('/game-help')
    && !url.startsWith('/login-prompt')
    && !url.startsWith('/pwa-install');
}

function proxiedRootAssetPath(gameId, url) {
  if (!shouldRewriteRootAssetPath(url)) return url;
  if (gameId === 'wikisearchle' && url.startsWith('/searchle/')) {
    return `/game/${gameId}${url.slice('/searchle'.length)}`;
  }
  return `/game/${gameId}${url}`;
}

function rewriteHtmlRootAssets(body, gameId) {
  return body.replace(/\b(src|href|action)=(["'])(\/(?!\/)[^"']*)\2/g, (_m, attr, quote, url) => {
    return `${attr}=${quote}${proxiedRootAssetPath(gameId, url)}${quote}`;
  });
}

function rewriteCssRootAssets(css, gameId) {
  return css.replace(/url\(\s*(["']?)(\/(?!\/)[^)"']*)\1\s*\)/g, (_m, quote, url) => {
    return `url(${quote}${proxiedRootAssetPath(gameId, url)}${quote})`;
  });
}

function buildWikiContextoBrandInject() {
  return `<script>(function(){` +
    `function swap(v){return String(v||"").replace(/WikiSearchle/g,"WikiContexto").replace(/wikisearchle\\.com/g,"wikicontexto.com");}` +
    `function apply(){` +
    `document.documentElement.dataset.brand="wikicontexto";` +
    `document.title=swap(document.title);` +
    `document.querySelectorAll('meta[content]').forEach(function(m){m.setAttribute("content",swap(m.getAttribute("content")));});` +
    `document.querySelectorAll('img[src*="brand.png"]').forEach(function(img){img.src=img.src.replace(/(^|\\/)brand\\.png/,"$1wikicontexto-brand.png");if(img.alt)img.alt=swap(img.alt);});` +
    `document.querySelectorAll('[aria-label],[title]').forEach(function(el){["aria-label","title"].forEach(function(a){var v=el.getAttribute(a);if(v)el.setAttribute(a,swap(v));});});` +
    `var w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT,{acceptNode:function(n){var tag=n.parentElement&&n.parentElement.tagName;if(tag==="SCRIPT"||tag==="STYLE"||tag==="NOSCRIPT")return NodeFilter.FILTER_REJECT;return /WikiSearchle|wikisearchle\\.com/.test(n.nodeValue)?NodeFilter.FILTER_ACCEPT:NodeFilter.FILTER_REJECT;}});` +
    `var nodes=[];while(w.nextNode())nodes.push(w.currentNode);nodes.forEach(function(n){n.nodeValue=swap(n.nodeValue);});` +
    `}` +
    `if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",apply);else apply();` +
    `})();</script>`;
}

function buildWikiSearchleStreamWidgetInject(reqUrl) {
  let isStreamWidget = false;
  try {
    const u = new URL(reqUrl || '/', 'https://wordgame.live');
    isStreamWidget = u.searchParams.get('stream_widget') === '1';
  } catch (_) {}
  if (!isStreamWidget) return '';
  return `<style id="wt-wikisearchle-stream-widget-css">` +
    `.round-end-overlay,#sw-card{display:none!important;visibility:hidden!important;opacity:0!important;pointer-events:none!important}` +
    `</style>` +
    `<script id="wt-wikisearchle-stream-widget-script">(function(){` +
    `window.__WT_STREAM_WIDGET=true;` +
    `function hide(){document.documentElement.dataset.wtStreamWidget="1";` +
    `document.querySelectorAll(".round-end-overlay,#sw-card").forEach(function(el){el.style.setProperty("display","none","important");el.style.setProperty("visibility","hidden","important");el.style.setProperty("opacity","0","important");});}` +
    `if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",hide);else hide();` +
    `try{new MutationObserver(hide).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:["class","style"]});}catch(_){}` +
    `})();</script>`;
}

function stripSearchleForcedLoginModal(body) {
  body = body.replace(
    '<style>.mp-login-screen,.sp-login-screen,#login-bar,.guess-login-prompt{display:none!important;}</style>',
    ''
  );
  const marker = '<script>(function(){var H="https://wordtycoon.live";function dismiss()';
  const start = body.indexOf(marker);
  if (start === -1) return body;
  const endMarker = '})();</script>';
  const end = body.indexOf(endMarker, start);
  if (end === -1) return body;
  const snippet = body.slice(start, end + endMarker.length);
  if (!snippet.includes('LoginPrompt.showModal') || !snippet.includes('/api/me/session')) return body;
  return body.slice(0, start) + body.slice(end + endMarker.length);
}

function buildInternalGameViewportShim(gameId) {
  if (!INTERNAL_GAME_VIEWPORT_SHIM_GAMES.has(gameId)) return '';
  const safeGameId = String(gameId).replace(/[^a-z0-9_-]/gi, '');
  return `<style id="wt-internal-game-viewport-shim">` +
    `html[data-wt-game-proxy]{--wt-internal-vh:100dvh;--wt-keyboard-height:156px;--wt-app-bottom-clearance:16px}` +
    `@media (max-width:700px){` +
    `html[data-wt-game-proxy] body:not(.overlay-mode):not([data-mode="overlay"]){min-height:var(--wt-internal-vh)!important}` +
    `html[data-wt-game-proxy="wordle"] #app,html[data-wt-game-proxy="pixeletters"] #app,html[data-wt-game-proxy="betwixt"] #app,html[data-wt-game-proxy="figural"] #app,html[data-wt-game-proxy="unwordle"] #app{height:var(--wt-internal-vh)!important;max-height:var(--wt-internal-vh)!important}` +
    `html[data-wt-game-proxy="wordle"] #game-ui,html[data-wt-game-proxy="pixeletters"] #game-ui,html[data-wt-game-proxy="betwixt"] #game-ui,html[data-wt-game-proxy="figural"] #game-ui{min-height:0!important}` +
    `html[data-wt-game-proxy="figural"] body.mp-mode.mp-game-active #game-ui{display:flex!important;flex-direction:column;height:100%!important}` +
    `html[data-wt-game-proxy="wordle"] .keyboard,html[data-wt-game-proxy="pixeletters"] .keyboard,html[data-wt-game-proxy="betwixt"] .keyboard,html[data-wt-game-proxy="figural"] #keyboard,html[data-wt-game-proxy="unwordle"] .keyboard{padding-bottom:max(var(--wt-app-bottom-clearance),env(safe-area-inset-bottom))!important}` +
    // Wordle wants its keyboard flush with the viewport bottom — safe-area inset only,
    // no 16px clearance (later rule, same specificity, wins over the shared one above).
    `html[data-wt-game-proxy="wordle"] .keyboard{padding-bottom:env(safe-area-inset-bottom)!important}` +
    // Keep the figural keyboard flush with the viewport bottom: the keyboard's own padding-bottom
    // already provides safe-area clearance, so the extra #app bottom padding just lifts it off the
    // bottom and pushes the fixed legal footer down into the keyboard's top row.
    `html[data-wt-game-proxy="figural"] #app{padding-bottom:0!important}` +
    `html[data-wt-game-proxy="betwixt"] #game-ui>.legal-footer{order:40;min-height:24px;padding:2px 4px 4px!important}` +
    `html[data-wt-game-proxy="betwixt"] #game-ui>#keyboard{order:50}` +
    `html[data-wt-game-proxy="figural"]>body>.wt-legal-footer,html[data-wt-game-proxy="unwordle"]>body>.wt-legal-footer{display:block!important;position:fixed;left:0;right:0;bottom:calc(var(--wt-keyboard-height) + 4px + env(safe-area-inset-bottom));z-index:880;margin:0!important;padding:2px 8px 4px!important;background:linear-gradient(180deg,rgba(10,10,15,0),rgba(10,10,15,.82));font-size:10px!important;line-height:1.25!important;opacity:.78!important}` +
    `html[data-wt-game-proxy="word500"] body:not([data-mode="overlay"]){padding-bottom:calc(var(--wt-keyboard-height) + 32px + env(safe-area-inset-bottom))!important}` +
    `html[data-wt-game-proxy="word500"] #keyboard{bottom:calc(3px + env(safe-area-inset-bottom))!important;padding-bottom:10px!important;max-width:375px!important;width:calc(100vw - 14px)!important}` +
    `html[data-wt-game-proxy="word500"] .kb-key{max-width:42px!important;font-size:14.5px!important}` +
    `html[data-wt-game-proxy="word500"] .kb-key.wide{max-width:63px!important;font-size:11.5px!important}` +
    `html[data-wt-game-proxy="word500"] footer.legal{position:fixed;left:0;right:0;bottom:calc(var(--wt-keyboard-height) + 4px + env(safe-area-inset-bottom));z-index:880;margin:0!important;padding:2px 8px 4px!important;background:linear-gradient(180deg,rgba(0,0,0,0),rgba(0,0,0,.82));font-size:10px!important;line-height:1.25!important}` +
    `}` +
    `</style>` +
    `<script id="wt-internal-game-viewport-shim-script">(function(){` +
    `var game=${JSON.stringify(safeGameId)};` +
    `function root(){document.documentElement.setAttribute("data-wt-game-proxy",game);if(document.body)document.body.setAttribute("data-wt-game-proxy",game);}` +
    `function setVar(n,v){document.documentElement.style.setProperty(n,v);}` +
    `function update(){root();var vv=window.visualViewport;var h=Math.max(320,Math.round((vv&&vv.height)||window.innerHeight||document.documentElement.clientHeight||0));setVar("--wt-internal-vh",h+"px");var kb=document.querySelector("#keyboard,.keyboard");if(kb){var r=kb.getBoundingClientRect();if(r&&r.height>20)setVar("--wt-keyboard-height",Math.ceil(r.height)+"px");}}` +
    `function wire(){update();var kb=document.querySelector("#keyboard,.keyboard");if(kb&&window.ResizeObserver&&!kb.__wtViewportShim){kb.__wtViewportShim=true;new ResizeObserver(update).observe(kb);}}` +
    `if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",wire);else wire();` +
    `window.addEventListener("resize",update,{passive:true});window.addEventListener("orientationchange",function(){setTimeout(update,80);},{passive:true});` +
    `if(window.visualViewport){visualViewport.addEventListener("resize",update,{passive:true});visualViewport.addEventListener("scroll",update,{passive:true});}` +
    `setTimeout(wire,250);setTimeout(wire,1000);` +
    `})();</script>`;
}

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
    const rewriteRootAssets = ROOT_ASSET_REWRITE_GAMES.has(game.id);

    if (rewriteRootAssets && ct.includes('text/css')) {
      const chunks = [];
      proxyRes.on('data', (c) => chunks.push(c));
      proxyRes.on('end', () => {
        const css = rewriteCssRootAssets(Buffer.concat(chunks).toString(), game.id);
        const headers = { ...proxyRes.headers };
        delete headers['content-encoding'];
        headers['content-length'] = Buffer.byteLength(css);
        res.writeHead(proxyRes.statusCode, headers);
        res.end(css);
      });
      return;
    }

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
      if (rewriteRootAssets) {
        body = rewriteHtmlRootAssets(body, game.id);
      }
      if (game.id === 'searchle') {
        body = stripSearchleForcedLoginModal(body);
      }

      // Inject script that overrides io() to use the proxied Socket.IO path
      // Only override path for same-origin connections (no URL or relative URL);
      // explicit URLs like "http://localhost:3000" pass through unchanged so
      // game apps can still connect to the Relay Broadcast from the browser.
      const proxiedSocketPath = `/game/${game.id}/socket.io`;
      // Keep WikiContexto here too: a direct game-domain connection cannot
      // carry the Word Tycoon cookie that proves a room viewer's login.
      const ioLateFix = `<script>(function(){var _io=window.io;if(!_io||_io.__wtProxyWrapped)return;` +
        `var path=${JSON.stringify(proxiedSocketPath)};` +
        `var w=function(u,o){o=o||{};` +
        `if(u&&typeof u==="object"){u.path=path;return _io(u);}` +
        `if(!u||(typeof u==="string"&&u.charAt(0)==="/")){o.path=path;}` +
        `return _io(u,o)};` +
        `w.connect=w;if(_io.Manager)w.Manager=_io.Manager;` +
        `if(_io.Socket)w.Socket=_io.Socket;if(_io.protocol)w.protocol=_io.protocol;` +
        `w.__wtProxyWrapped=true;window.io=w;})();</script>`;
      body = body.replace(
        new RegExp(`(<script[^>]+src=(["'])/game/${game.id}/socket\\.io/socket\\.io\\.js[^>]*>\\s*</script>)`, 'g'),
        `$1${ioLateFix}`
      );

      // Inject script that overrides fetch() and EventSource to rewrite absolute paths through the proxy.
      // e.g. fetch('/api/state') → fetch('/game/word-tycoon/api/state')
      // Game paths stay scoped to this proxy. Hub account URLs, including legacy
      // absolute URLs, use the room origin so they receive the current login cookie.
      const fetchFix = buildGameFetchProxyInject(game.id);

      body = body.replace('<head>', '<head>' + fetchFix);

      // Keep proxied game pages visually owned by the game app. The small
      // viewport shim is proxy-only and corrects Android app-frame insets.
      const gameHelpInject = '';
      const wikiContextoBrandInject = game.id === 'wikisearchle' ? buildWikiContextoBrandInject() : '';
      const wikiSearchleStreamWidgetInject = game.id === 'wikisearchle' ? buildWikiSearchleStreamWidgetInject(req.url) : '';
      const internalGameViewportShim = buildInternalGameViewportShim(game.id);
      body = body.replace('</body>', wikiContextoBrandInject + wikiSearchleStreamWidgetInject + gameHelpInject + internalGameViewportShim + '</body>');

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
const GAME_PROXY_BLOCKED = ['/api/admin/', '/api/cosmetics/buy', '/api/cosmetics/buyset',
  '/api/cosmetics/equip', '/api/cosmetics/unequip', '/api/business/buy'];

app.use('/game/:gameId', (req, res) => {
  const gameId = String(req.params.gameId || '').toLowerCase();
  const proxy = gameHttpProxies[gameId];
  if (!proxy) return res.status(404).send('Game not found');

  // Strip prefix and disable compression so we can modify HTML
  // Express app.use already strips the mount path; only strip manually if still present
  const prefix = `/game/${req.params.gameId}`;
  if (req.url.startsWith(prefix)) {
    req.url = req.url.slice(prefix.length) || '/';
  }
  if (gameId === 'wikisearchle' && req.url.startsWith('/searchle/')) {
    req.url = req.url.slice('/searchle'.length) || '/';
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

// Permanent audience-room links: wordtycoon.live/<username>. This route lives
// after every named page, API, static asset and game proxy, so existing site
// paths always win. Unknown single-segment paths continue to the normal 404.
app.get('/:roomSlug', async (req, res, next) => {
  const rawSlug = String(req.params.roomSlug || '').trim().toLowerCase();
  if (!rooms.HANDLE_RE.test(rawSlug) || rooms.isReservedSlug(rawSlug)) return next();
  const actor = await getAudienceRoomActor(req);
  const room = rooms.resolve(rawSlug, { includeClosed: true });
  if (!room || (room.open === false && String(room.ownerId) !== String(actor?.id || ''))) return next();
  res.sendFile(path.join(__dirname, 'public', 'room', 'index.html'));
});

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

// /streamer-bridge — token-authenticated namespace for the local Tycoon
// Stream Bridge exe. Each streamer's bridge presents their paste-in token
// on connect; the server maps it to their Discord ID, drops them into
// their streamer:<id> room, and relay.js mirrors their own TikTok events
// to that room. Separate namespace so no game-room or admin events leak.
//
// Presence + state mirror: bridges push bridge-state snapshots periodically.
// The /streamer dashboard polls /api/streamer/bridge/state which reads from
// this in-memory cache (avoids needing the dashboard to open its own socket).
const streamerBridgeNs = io.of('/streamer-bridge');
const bridgeStateCache = new Map(); // streamerId → { state, lastUpdate, socketId }
const BRIDGE_PRESENCE_STALE_MS = 15_000;

streamerBridgeNs.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  const streamer = streamers.findByBridgeToken(token);
  if (!streamer) return next(new Error('invalid bridge token'));
  socket.data.streamerId = streamer.discordId;
  socket.data.streamerDisplayName = streamer.displayName;
  next();
});
streamerBridgeNs.on('connection', (socket) => {
  const room = `streamer:${socket.data.streamerId}`;
  socket.join(room);
  console.log(`[StreamerBridge] ${socket.data.streamerDisplayName} (${socket.data.streamerId}) connected`);
  socket.emit('bridge-ready', {
    streamerId: socket.data.streamerId,
    displayName: socket.data.streamerDisplayName,
  });
  // Bridge pushes its snapshot on connect and on every source change.
  socket.on('bridge-state', (snapshot) => {
    bridgeStateCache.set(socket.data.streamerId, {
      state: snapshot,
      lastUpdate: Date.now(),
      socketId: socket.id,
    });
  });
  socket.on('disconnect', () => {
    console.log(`[StreamerBridge] ${socket.data.streamerDisplayName} disconnected`);
    const entry = bridgeStateCache.get(socket.data.streamerId);
    if (entry && entry.socketId === socket.id) bridgeStateCache.delete(socket.data.streamerId);
  });
});
relay.setBridgeNamespace(streamerBridgeNs);

// Dashboard → bridge command channel. Dashboard POSTs a config patch; we
// emit it to the streamer's bridge socket over /streamer-bridge, and it
// re-pushes its state which the dashboard picks up on its next poll.
function pushBridgeConfig(streamerId, patch) {
  streamerBridgeNs.to(`streamer:${streamerId}`).emit('bridge-config', patch);
}

// Socket.IO connection handling
io.on('connection', (socket) => {
  // Join dashboard room for browser clients (game servers will set _appId via app-register)
  socket.join('dashboard');
  console.log('[Server] Client connected');

  // OBS / dashboard preview joins the per-streamer actions room. The room
  // is keyed by the streamer's Discord ID, which is what the rule
  // evaluator emits to. No auth — the room name is treated as a shared
  // secret (same trust model as the existing OBS browser-source overlays).
  socket.on('join-actions-overlay', ({ streamerId } = {}) => {
    if (!streamerId || typeof streamerId !== 'string') return;
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(streamerId)) return;
    socket.join(streamerActions.ROOM(streamerId));
  });

  // Goals overlay — same trust model as actions overlay (room name acts as
  // shared secret). On join we push a snapshot so the OBS source renders
  // immediately instead of waiting for the next event.
  socket.on('join-goals-overlay', ({ streamerId } = {}) => {
    if (!streamerId || typeof streamerId !== 'string') return;
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(streamerId)) return;
    socket.join(streamerGoals.ROOM(streamerId));
    socket.emit('goal-update', streamerGoals.snapshot(streamerId));
    // Seed the Win Card's session/saved boards so an always-on card shows
    // standings immediately instead of waiting for this stream's first win.
    try { socket.emit('win-tally-update', winTallies.fullSnapshot(streamerId)); } catch (_) {}
    // Seed the Game Vote card too, so a browser source that reconnects
    // mid-vote shows the live ballot instead of a blank widget until the
    // next tick.
    try {
      const v = gameVote.snapshotFor(streamerId);
      if (v) socket.emit('game-vote-update', v);
    } catch (_) {}
    // Seed any Music Credits widgets so the overlay shows the current track
    // and play state immediately on reconnect.
    try {
      const cfg = streamerGoals.getForStreamer(streamerId)?.config;
      for (const w of (cfg?.widgets || [])) {
        if (w.type === 'musicCredits') {
          const s = streamerGoals.getMusicState(streamerId, w.id);
          if (s) socket.emit('music-state', s);
        }
      }
    } catch (_) {}
    // Seed the Spotify DJ widget with the stream-scoped combined playback and
    // request-queue state. Future per-streamer Spotify accounts can publish the
    // same payload shape to their own goals room without changing the widget.
    try { socket.emit('spotify-request-state', spotifyRequests.getPublicSnapshot(streamerId)); } catch (_) {}
  });

  // Music Credits track-ended notification from the overlay. The room name is
  // the shared secret (anyone with the browser source URL can emit this), so
  // we only act on it for widgets that actually exist and are playing.
  socket.on('music-ended', ({ streamerId, widgetId } = {}) => {
    if (!streamerId || typeof streamerId !== 'string') return;
    if (!/^[a-zA-Z0-9_-]{1,40}$/.test(streamerId)) return;
    if (!socket.rooms.has(streamerGoals.ROOM(streamerId))) return;
    const cfg = streamerGoals.getForStreamer(streamerId)?.config;
    if (!cfg) return;
    // If no widgetId provided, find the first playing musicCredits widget.
    let targetId = widgetId;
    if (!targetId) {
      const entry = streamerGoals.getForStreamer(streamerId);
      for (const w of cfg.widgets) {
        if (w.type === 'musicCredits' && entry?.state?.widgetState?.[w.id]?.musicPlaying) {
          targetId = w.id;
          break;
        }
      }
    }
    if (!targetId) return;
    streamerGoals.musicControl(streamerId, targetId, 'ended');
  });

  // Drag-to-position preview. Only the logged-in streamer can move their own
  // widgets, so this is authed via session — not by trusting the room name
  // like the join events above (which only let you receive, not send).
  socket.on('goals-position-preview', (p = {}) => {
    const sessUser = socket.request?.session?.discordUser;
    if (!sessUser?.id) return;
    // Accept widgetId (new) or widget (legacy) for backwards compat
    const widgetId = p.widgetId || p.widget;
    streamerGoals.broadcastPositionPreview(sessUser.id, { ...p, widgetId });
  });

  // Drag-to-reorder preview. Same auth model as position-preview — only
  // the logged-in streamer can change z-order for their own overlay.
  socket.on('goals-order-preview', (payload = {}) => {
    const sessUser = socket.request?.session?.discordUser;
    if (!sessUser?.id) return;
    streamerGoals.broadcastOrderPreview(sessUser.id, payload.widgetOrder);
  });

  // Manual clear: dismiss currently-displayed winner. Optional widgetId targets
  // a single win-card instance; omitted = clear all win cards.
  socket.on('goals-clear-winner', (payload, ack) => {
    // Allow legacy call with no payload
    if (typeof payload === 'function') { ack = payload; payload = {}; }
    const sessUser = socket.request?.session?.discordUser;
    if (!sessUser?.id) {
      console.log('[StreamerGoals] goals-clear-winner ignored: no session');
      if (typeof ack === 'function') ack({ ok: false, error: 'no-session' });
      return;
    }
    const widgetId = payload?.widgetId || null;
    streamerGoals.broadcastClearWinner(sessUser.id, widgetId);
    console.log(`[StreamerGoals] cleared winner for ${sessUser.id} (widget=${widgetId || 'all'})`);
    if (typeof ack === 'function') ack({ ok: true });
  });

  // TTS room — the streamer dashboard's TTS card joins this on load so it
  // can receive `tts-play` events for the logged-in streamer's chat. Auth
  // is via the session attached to the underlying socket request.
  socket.on('voice-tts-join', () => {
    const sessUser = socket.request?.session?.discordUser;
    if (!sessUser?.id) {
      socket.emit('voice-tts-joined', { ok: false, error: 'login_required' });
      return;
    }
    const room = `voice-tts:${sessUser.id}`;
    socket.join(room);
    socket.emit('voice-tts-joined', { ok: true, room });
  });

  // Same TTS room, but joined by URL-supplied streamerId rather than session
  // user. Used by the public mobile stream-view / OBS browser source so TTS
  // audio plays through the embedded-game page (no login required). The
  // stream is broadcast publicly anyway, so subscribing to its TTS feed
  // doesn't reveal anything that isn't already on-air.
  socket.on('voice-tts-join-public', (streamerId) => {
    const id = String(streamerId || '').trim();
    if (!isPublicStreamerId(id)) {
      socket.emit('voice-tts-joined', { ok: false, error: 'bad_id' });
      return;
    }
    const room = `voice-tts:${id}`;
    socket.join(room);
    socket.emit('voice-tts-joined', { ok: true, room });
  });

  // Send initial state to dashboard clients
  socket.emit('platform-status', {
    tiktok: tiktok.isConnected(),
    tiktokDirect: tiktokDirect.isConnected(),
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

  // Send erecTangled connection status + cached game state
  // Dual-emit legacy `sproutle-*` alongside canonical `erectangled-*` for 2 weeks.
  {
    const connected = !!(erectangledSocket && erectangledSocket.connected);
    socket.emit('erectangled-connected', connected);
    socket.emit('sproutle-connected', connected); // legacy alias
    if (lastSproutleState) {
      socket.emit('erectangled-game-state', lastSproutleState);
      socket.emit('sproutle-game-state', lastSproutleState); // legacy alias
    }
  }

  // Send Wordle connection status + cached game state
  socket.emit('wordle-connected', !!(wordleSocket && wordleSocket.connected));
  if (lastWordleState) {
    socket.emit('wordle-game-state', lastWordleState);
  }

  // Send RecTangled connection status + cached game state
  socket.emit('rectangled-connected', !!(rectangledSocket && rectangledSocket.connected));
  if (lastRectangledState) {
    socket.emit('rectangled-game-state', lastRectangledState);
  }

  // Send all overlay settings (per-type)
  socket.emit('overlay-settings-init', overlaySettings);

  // ── Audience room presence, chat and voting ──────────────────────────
  // Reading a room is public; sending chat or voting requires the verified
  // portal session attached to this socket. No client-provided identity is
  // trusted here.
  socket.on('audience-room-join', async (payload = {}, ack) => {
    const rawSlug = typeof payload === 'string' ? payload : payload.slug;
    const slug = String(rawSlug || '').trim().toLowerCase();
    const room = rooms.resolve(slug);
    if (!room) {
      if (typeof ack === 'function') ack({ ok: false, error: 'room_not_found' });
      return;
    }

    if (socket.data.audienceRoomSlug && socket.data.audienceRoomSlug !== slug) {
      const oldSlug = socket.data.audienceRoomSlug;
      socket.leave(`audience-room:${oldSlug}`);
      rooms.leave(oldSlug, socket.id);
    }

    const sessionUser = socket.request?.session?.discordUser || null;
    const actorId = sessionUser ? await getCurrentWordTycoonAccountId(sessionUser) : null;
    socket.data.audienceRoomSlug = slug;
    socket.join(`audience-room:${slug}`);
    rooms.join(slug, socket.id, actorId ? `user:${actorId}` : `guest:${socket.id}`);

    const roomKey = `audience:${slug}`;
    const history = db.getChatHistory(roomKey);
    const userIds = new Set(history.map((message) => message?.user?.id).filter(Boolean));
    const cosmeticsByUser = {};
    await Promise.all([...userIds].map(async (userId) => {
      const cosmetics = await getUserCosmetics(userId);
      if (cosmetics) cosmeticsByUser[userId] = cosmetics;
    }));
    for (const message of history) {
      if (message?.user?.id && cosmeticsByUser[message.user.id]) {
        message.user.cosmetics = cosmeticsByUser[message.user.id];
      }
    }

    const freshRoom = rooms.resolve(slug);
    socket.emit('audience-room-history', { slug, messages: history });
    socket.emit('audience-room-state', buildAudienceRoomPayload(freshRoom, actorId));
    if (typeof ack === 'function') ack({ ok: true, slug });
  });

  socket.on('audience-room-leave', (payload = {}) => {
    const rawSlug = typeof payload === 'string' ? payload : payload.slug;
    const slug = String(rawSlug || socket.data.audienceRoomSlug || '').trim().toLowerCase();
    if (!slug) return;
    socket.leave(`audience-room:${slug}`);
    rooms.leave(slug, socket.id);
    if (socket.data.audienceRoomSlug === slug) delete socket.data.audienceRoomSlug;
  });

  socket.on('audience-room-chat', async (payload = {}, ack) => {
    const slug = String(payload.slug || socket.data.audienceRoomSlug || '').trim().toLowerCase();
    const room = rooms.resolve(slug);
    const sessionUser = socket.request?.session?.discordUser;
    if (!room || !socket.rooms.has(`audience-room:${slug}`)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'room_not_joined' });
      return;
    }
    if (!sessionUser?.id) {
      if (typeof ack === 'function') ack({ ok: false, error: 'login_required' });
      return;
    }

    const message = String(payload.message || '').trim().slice(0, 500);
    if (!message) return;
    const now = Date.now();
    const clientIP = socketClientAddress(socket) || 'unknown';
    const lastIPMsg = socketRateByIP.get(clientIP);
    if (lastIPMsg && now - lastIPMsg < SOCKET_RATE_MS) {
      if (typeof ack === 'function') ack({ ok: false, error: 'slow_down' });
      return;
    }
    socketRateByIP.set(clientIP, now);
    if (socket.data.lastAudienceRoomChat && now - socket.data.lastAudienceRoomChat < 650) {
      if (typeof ack === 'function') ack({ ok: false, error: 'slow_down' });
      return;
    }
    socket.data.lastAudienceRoomChat = now;

    const actorId = await getCurrentWordTycoonAccountId(sessionUser);
    const filtered = chatFilter.filterMessage(message, {
      id: actorId,
      discordId: actorId,
      badges: [],
    });
    if (!filtered.allowed) {
      if (typeof ack === 'function') ack({ ok: false, error: 'message_blocked', message: filtered.reason });
      return;
    }

    const cosmetics = await getUserCosmetics(actorId);
    const username = sessionUser.globalName || sessionUser.displayName || sessionUser.username || 'Player';
    const chatMessage = {
      id: uuidv4(),
      room: slug,
      platform: 'web',
      user: {
        id: actorId,
        username: sessionUser.username || username,
        displayName: username,
        profilePic: sessionUser.avatar || null,
        cosmetics: cosmetics || {},
      },
      message: filtered.filtered,
      timestamp: new Date().toISOString(),
    };
    io.to(`audience-room:${slug}`).emit('audience-room-message', chatMessage);
    db.saveChatMessage(`audience:${slug}`, chatMessage);
    rooms.markActivity(slug);
    if (typeof ack === 'function') ack({ ok: true, id: chatMessage.id });
  });

  socket.on('audience-room-activity', (payload = {}) => {
    const slug = String(payload.slug || '').trim().toLowerCase();
    if (socket.data.audienceRoomSlug !== slug || !socket.rooms.has(`audience-room:${slug}`)) return;
    rooms.markActivity(slug);
  });

  socket.on('audience-room-vote', async (payload = {}, ack) => {
    const slug = String(payload.slug || socket.data.audienceRoomSlug || '').trim().toLowerCase();
    const room = rooms.resolve(slug);
    const sessionUser = socket.request?.session?.discordUser;
    if (!room || !socket.rooms.has(`audience-room:${slug}`)) {
      if (typeof ack === 'function') ack({ ok: false, error: 'room_not_joined' });
      return;
    }
    if (!sessionUser?.id) {
      if (typeof ack === 'function') ack({ ok: false, error: 'login_required' });
      return;
    }
    try {
      const actorId = await getCurrentWordTycoonAccountId(sessionUser);
      const vote = rooms.castVote(slug, actorId, payload.gameId);
      if (typeof ack === 'function') ack({ ok: true, vote });
    } catch (error) {
      if (typeof ack === 'function') ack({ ok: false, error: 'vote_failed', message: error.message });
    }
  });

  socket.on('disconnect', () => {
    if (socket.data.audienceRoomSlug) {
      rooms.leave(socket.data.audienceRoomSlug, socket.id);
    }
  });

  // Mobile app message handler
  socket.on('mobile-message', async (data) => {
    if (!chatIdentity.envelope(data)) {
      socket.emit('chat-room-error', { code: 'invalid_message', message: 'Invalid chat message.' });
      return;
    }
    const now = Date.now();
    if (socket._lastMobileMsg && now - socket._lastMobileMsg < 500) return;
    socket._lastMobileMsg = now;
    const identity = await chatIdentity.resolve(socket, data, { allowBot: true });
    if (!identity) {
      socket.emit('chat-room-error', { code: 'auth_changed', message: 'Chat sign-in changed. Refresh or sign in again, then resend your message.' });
      return;
    }
    relay.handleMessage({ platform: 'mobile', user: { ...identity.user, isFollowing: true, badges: [] }, message: identity.message });
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
    if (!chatIdentity.envelope(data)) return;
    const room = data.room || 'main';
    if (!VALID_ROOMS.includes(room)) return;
    const now = Date.now();
    if (socket._pendingChatIdentity || (socket._lastChatIdentity && now - socket._lastChatIdentity < 500)) return;
    socket._lastChatIdentity = now;
    socket._pendingChatIdentity = true;
    let identity;
    try { identity = await chatIdentity.resolve(socket, data); }
    finally { socket._pendingChatIdentity = false; }
    if (!identity) {
      socket.emit('chat-room-error', { code: 'auth_changed', message: 'Chat sign-in changed. Refresh or sign in again, then resend your message.' });
      return;
    }
    const userId = identity.user.id, message = identity.message, username = identity.user.username;

    // Rate limit: per-IP (prevents multi-socket abuse) + per-socket
    const clientIP = socketClientAddress(socket) || 'unknown';
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

    // Run through moderation filter — badges derived server-side only (never trust client).
    // No moderator badge here: Socket.IO shares only the PORTAL session, and admin
    // lives on wt-admin.sid, so there is no admin signal on a socket. The old
    // req.session.isAdmin read could never fire; it was removed 2026-07-31 rather
    // than "fixed" by putting isAdmin on a SameSite=None cookie.
    const serverBadges = [];
    const filterResult = chatFilter.filterMessage(message, {
      id: userId,
      discordId: userId,
      badges: serverBadges
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
        displayName: identity.user.displayName,
        profilePic: identity.user.profilePic,
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
    if (data.type === 'chat-message' && data.payload && data.payload.isJoin) return;

    // Deduplicate: bridge may deliver the same message via multiple sockets.
    // Use message ID (or timestamp+user) to skip duplicates within a short window.
    const msgId = data.payload.id || `${data.type}:${data.payload.timestamp}:${(data.payload.user || {}).id || ''}`;
    if (msgId && _bridgeDedup.has(msgId)) return;
    if (msgId) {
      _bridgeDedup.add(msgId);
      setTimeout(() => _bridgeDedup.delete(msgId), 5000);
    }

    // Mark as bridged and broadcast to all OTHER sockets (not back to sender)
    const payload = { ...data.payload, _bridged: true };
    socket.broadcast.emit(data.type, payload);
  });

  // Game app handshake — apps identify themselves on connect (requires API key)
  socket.on('app-register', (data, callback) => {
    const result = serviceRegistration.register(socket, data);
    if (typeof callback === 'function') callback(result);
    if (!result.success) return;

    // Re-send activate-daily if this game is the currently pending sequence step
    // (handles reconnects after a Chat Relay restart during an active sequence)
    const { date: edmontonDate } = getEdmontonTime();
    if (sequenceState.date === edmontonDate &&
        sequenceState.currentIndex >= 0 &&
        sequenceState.currentIndex < DAILY_SEQUENCE.length &&
        DAILY_SEQUENCE[sequenceState.currentIndex] === data.id) {
      socket.emit('activate-daily');
      console.log(`[DailySequence] Re-sent activate-daily to ${data.id} on reconnect`);
    }
  });

  // Win overlay — browser clients join this room to receive all game win events
  socket.on('join-win-overlay', () => {
    socket.join('win-overlay');
  });

  // Per-streamer win overlay — OBS sources opened with ?streamer=<handle>
  // join a scoped room. Only this streamer's private-session wins fire on
  // them; public wins land on the global 'win-overlay' room only.
  socket.on('join-streamer-win-overlay', (handleRaw) => {
    const handle = typeof handleRaw === 'string' ? handleRaw.toLowerCase().trim() : '';
    if (!/^[a-z0-9_-]{1,32}$/.test(handle)) return;
    socket.join(`streamer-win:${handle}`);
  });

  // Junk Drawer TikTok mode: browser games join this to receive that
  // streamer's raw TikTok gifts (relay.handleEngagement emits here).
  socket.on('join-streamer-gifts', (handleRaw) => {
    const handle = typeof handleRaw === 'string' ? handleRaw.toLowerCase().trim() : '';
    if (!/^[a-z0-9_.-]{1,32}$/.test(handle)) return;
    socket.join(`streamer-gift:${handle}`);
  });

  // Event overlay — browser clients join this room to receive in-game events
  // (word finds, streaks, misses) for the currently-selected Sassie active game.
  socket.on('join-event-overlay', () => {
    socket.join('event-overlay');
    // Send current active-game + settings so the overlay can render its banner
    // and respect the misses toggle without waiting for the next event.
    socket.emit('event-overlay-active-game', { activeGame: eventOverlay.getActiveGame() });
    socket.emit('event-overlay-settings', eventOverlay.getSettings());
  });

  // Activity overlay — cross-game permanent feed of significant events
  // (wins, jackpots, dailys, streaks). No active-game gate. See
  // src/activity-overlay.js for the broadcast contract.
  socket.on('join-activity-overlay', () => {
    socket.join('activity-overlay');
  });

  // Social feed — portal Feed tab + Toon Tower ticker join this room for
  // live feed-event / feed-reaction / feed-comment pushes.
  socket.on('join-feed', () => {
    socket.join('feed');
  });

  // Holo win overlay — replaces the old win-overlay with a hologram-style
  // card that follows Sassie's position. Big mode (centered) on active-game
  // wins, small mode (anchored under Sassie) on inactive-game wins. The
  // game-win event is also broadcast to the existing 'win-overlay' room
  // for backwards compat with any OBS sources still pointed at /win-overlay.
  socket.on('join-holo-win-overlay', () => {
    socket.join('holo-win-overlay');
  });

  // Top-likers overlay — one room per streamer (discordId), set via OBS URL param
  socket.on('join-toplikers', (discordId) => {
    const id = String(discordId || '').trim();
    if (!isPublicStreamerId(id)) return;
    socket.join(`toplikers:${id}`);
  });

  // Forward game-win events from authenticated game sockets to win-overlay clients
  // Enriches winner cosmetics centrally so all games get consistent cosmetics display.
  // Only daily wins are shown on the overlay.
  socket.on('game-win', async (data) => {
    if (!data || !serviceRegistration.ownsGame(socket, data.game)) return;

    // Global jackpot toast — Searchle only for now
    if (data.game === 'searchle' && data.jackpot > 0) {
      io.emit('jackpot-toast', {
        game: data.game,
        gameName: data.gameName || 'Searchle',
        winner: { displayName: data.winner?.displayName || 'Someone' },
        jackpot: data.jackpot
      });
    }

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
    // Super Fan pfp badge on win cards (gold heart replaces the FC heart)
    if (data.winner && typeof data.winner.isSuperfan === 'undefined') {
      const w = data.winner;
      data = { ...data, winner: { ...w, isSuperfan: relay.isSuperfanViewer(w.platform, w.platformUserId || w.id) } };
    }
    if (Array.isArray(data.topPlayers)) {
      data = { ...data, topPlayers: data.topPlayers.map(p =>
        (p && typeof p.isSuperfan === 'undefined')
          ? { ...p, isSuperfan: relay.isSuperfanViewer(p.platform, p.platformUserId || p.id) }
          : p) };
    }
    // Full perk set (SF/DC/FC hearts) on the WINNER for the shared win card's
    // avatar badges. Winner-only: rows keep isSuperfan and the card lazy-
    // fetches /api/public/perks (60s cached) per row instead, so the hot
    // path pays for at most one membership lookup per win.
    if (data.winner && typeof data.winner.isDonor === 'undefined') {
      try {
        const w = data.winner;
        const perkId = w.linkedDiscord || relay.lookupLinkedDiscord(w.platform, w.platformUserId || w.id)
          || w.platformUserId || w.id || w.username;
        if (perkId) {
          const perks = await computePerksById(perkId);
          data = {
            ...data,
            winner: {
              ...w,
              isSuperfan: w.isSuperfan || perks.superfan,
              isDonor: perks.donor,
              isFanClub: typeof w.isFanClub === 'undefined' ? perks.fanClub : w.isFanClub,
              // Recomputed against the merged flags rather than taken from
              // perks.superDonor: the winner may already have arrived flagged
              // isSuperfan by the game, which perks alone would not know.
              isSuperDonor: (w.isSuperfan || perks.superfan) && perks.donor,
            }
          };
        }
      } catch (_) { /* perk enrichment is cosmetic — never block a win */ }
    }
    // Streamer-overlay top-10: enrich every row's cosmetics so namecolor /
    // hero-badge / glow render correctly. Skipped for public wins (those use
    // a single-winner card and don't need the whole leaderboard enriched).
    if (data.streamerHandle && Array.isArray(data.topPlayers) && data.topPlayers.length) {
      const enrichedTop = await Promise.all(data.topPlayers.slice(0, 10).map(async (p) => {
        if (!p || p.cosmetics) return p;
        const platform = p.platform;
        const userId = p.platformUserId || p.id;
        const linkedDiscord = p.linkedDiscord || relay.lookupLinkedDiscord(platform, userId);
        if (!linkedDiscord) return { ...p, linkedDiscord: null };
        try {
          const cosmetics = await relay.getUserCosmetics(linkedDiscord);
          return { ...p, linkedDiscord, cosmetics: (cosmetics && Object.keys(cosmetics).length > 0) ? cosmetics : null };
        } catch (_) {
          return { ...p, linkedDiscord };
        }
      }));
      data = { ...data, topPlayers: enrichedTop };
    }
    if (!serviceRegistration.ownsGame(socket, data.game)) return;
    // Goals overlay (per-streamer) wincard fires independent of the
    // global win-overlay-settings gate — that gate controls the public
    // OBS win-overlay, but each streamer's goals overlay is a separate
    // surface they configure themselves via the dashboard widget.
    if (data.streamerHandle) {
      const handle = String(data.streamerHandle).toLowerCase();
      const streamer = streamers.getByHandle(handle);
      if (streamer && streamer.discordId) {
        // Running win counts for the Win Card's session/saved leaderboard
        // modes. Tallied BEFORE the emit so the card that announces the win
        // already shows it counted. SpellingBee's per-word `winType: 'word'`
        // emits are not real wins — they must not inflate the board.
        let goalsPayload = data;
        if (data.winType !== 'word') {
          try {
            const counted = winTallies.recordWin({
              streamerId: streamer.discordId,
              game: data.game,
              gameName: data.gameName,
              winner: data.winner,
            });
            if (counted) {
              goalsPayload = { ...data, winTally: winTallies.snapshotForWin(streamer.discordId, data.game) };
            }
          } catch (err) {
            // A tally failure must never swallow the win broadcast.
            console.warn('[WinTallies] record failed:', err.message || err);
          }
        }
        // A finished round counts toward the Game Vote term for rounds-based
        // games. Uses the same `winType !== 'word'` gate as the tally above —
        // SpellingBee's per-word emits are not rounds and must not burn the term.
        if (data.winType !== 'word') {
          try { gameVote.noteRound(streamer.discordId, data.game); } catch (_) {}
        }
        // Hold any queued ballot until the win card has had its moment. NOT
        // gated on winType: the overlay renders a card for per-word emits too,
        // so those occupy the screen just the same.
        try { gameVote.noteWinCard(streamer.discordId); } catch (_) {}
        io.to(`goals:${streamer.discordId}`).emit('game-win', goalsPayload);
        // Spoken win congratulation (opt-in per winCard) — rides the viewer
        // TTS pipeline so it plays from the streamer's live wordgame.live tab.
        maybeEmitWinAnnounce(streamer.discordId, data);
      }
    }

    if (isWinOverlayEnabled((data.game || '').toLowerCase())) {
      // Private-session wins go to the per-streamer overlay only — must not
      // bleed into the global public OBS overlay.
      if (data.streamerHandle) {
        const handle = String(data.streamerHandle).toLowerCase();
        io.to(`streamer-win:${handle}`).emit('game-win', data);
      } else {
        io.to('win-overlay').emit('game-win', data);
      }
    }

    // Forward to Sassie (fire-and-forget). Skip per-word emits like
    // SpellingBee's `winType: 'word'` — those aren't real wins; the game
    // server forwards them as proper game-events with rarity tier instead.
    if (data.winType !== 'word') {
      sassie.forwardGameWin(data);
      // Instant gesture path: jackpot wins get the dedicated 'jackpot_win'
      // mapping (centred + scale 1.30 in WikiSearchle's table); regular wins
      // get the 'win' mapping (same celebrate, slightly different LLM prompt).
      const gestureName = (data.jackpot && data.jackpot > 0) ? 'jackpot_win' : 'win';
      forwardGameGesture(data.game, gestureName);
      // Hologram trigger — every game's win fires the universal 'scan'
      // gesture (look_side via game-gestures._default), regardless of
      // whether the game has a per-game win mapping. The holo-win-overlay
      // pops down under Sassie when this fires.
      forwardGameGesture(data.game, 'scan');
      // Cross-game activity feed.
      activityOverlay.processGameWin(data);
      // Persistent social feed (portal Feed tab + Tower ticker).
      feed.processGameWin(data);
      // Holo win card receives the same payload as win-overlay. Suppress
      // for private-session wins so they don't appear on the public holo
      // overlay (no streamer-scoped holo overlay yet).
      if (!data.streamerHandle) {
        io.to('holo-win-overlay').emit('game-win', enrichGameWinWithElo(data));
      }
    }
  });

  // Forward frenzy state from Word Tycoon to all connected game servers
  socket.on('frenzy-update', (data) => {
    if (serviceRegistration.active(socket) && socket._servicePrincipal.id === 'word-tycoon' && data) {
      socket.broadcast.emit('frenzy-update', data);
    }
  });

  // Generic game-event channel — used by game servers (e.g. WikiSearchle)
  // that don't have a dedicated chat-relay socket pipeline. Forwards to
  // Sassie so reactions work for those games. Authenticated by app-register.
  // Also feeds the event-overlay (TikTok-only, active-game-gated).
  socket.on('game-event', (data) => {
    if (!data || !data.eventName || !serviceRegistration.ownsGame(socket, data.game)) return;
    sassie.forwardGameEvent(data.game, data.eventName, data.data || {}, data.priority || 'normal');
    eventOverlay.processGameEvent(data.game, data.eventName, data.data || {}, data.priority || 'normal');
    forwardGameGesture(data.game, data.eventName);
  });

  // Daily sequence: game servers report when their daily game is won
  socket.on('daily-win', (data) => {
    if (!data || !serviceRegistration.ownsGame(socket, data.game)) return;
    if (sequenceState.currentIndex >= 0 && sequenceState.date) {
      advanceDailySequence(data.game);
    }
    forwardGameGesture(data.game, 'daily_complete');
    activityOverlay.processDailyWin(data);
    feed.processDailyWin(data);

    sassie.forwardGameEvent(data.game, 'daily_complete', {
      displayName: data.winner || data.displayName || 'Player',
      platform: data.platform || 'unknown',
      platformUserId: data.platformUserId || data.userId || 'unknown',
      amount: data.amount || undefined,
      isDaily: true
    }, 'high');
  });

  // Like-for-Hint: a game server (Searchle) answers a reveal-hint by telling
  // us WHAT it revealed (a word, or a masked letter progression) so we can
  // flash the streamer's likeHint overlay burst. streamerId + widgetId are the
  // opaque values we handed it in the reveal-hint broadcast.
  socket.on('hint-reveal', (data) => {
    if (!serviceRegistration.active(socket) || socket._servicePrincipal.id !== 'searchle' || !data || !data.streamerId) return;
    const text = String(data.text || '').slice(0, 120);
    if (!text) return;
    streamerGoals.fireLikeHintBurst(data.streamerId, {
      widgetId: data.widgetId || null,
      text,
      mode: data.mode || null,
    });
  });

  socket.on('disconnect', () => {
    if (socket._appId) {
      console.log(`[Apps] App disconnected: ${socket._appId}`);
      if (appSockets.get(socket._appId) === socket) {
        apps.setReachable(socket._appId, false);
        appSockets.delete(socket._appId);
      }
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
  hostedRewards.start();
  letterworksManager.startRewards();
  wordfallManager.startRewards();

  // Initialize relay
  relay.initialize(io, process.env.DISCORD_WEBHOOK_URL);

  // Streamer Actions & Events — emits to room actions:<streamerId>
  streamerActions.setIo(io);

  // Streamer Goals & Milestones — emits to room goals:<streamerId>
  streamerGoals.setIo(io);
  streamerGoals.setHandleResolver((id) => streamers.get(id)?.handle || null);
  // Like-for-Hint sink — when a likeHint widget crosses its like threshold,
  // route a `reveal-hint` to every connected game server. Each game reveals
  // a hint only if it currently owns a live session for this handle; all
  // others no-op. This keeps Like-for-Hint game-agnostic: a game opts in
  // simply by handling `reveal-hint` (v1: Searchle reveals its best
  // unguessed word). Broadcasting (vs. resolving the active game) also means
  // it Just Works regardless of the streamer's chat-routing target.
  streamerGoals.setLikeHintSink((streamerId, payload) => {
    const handle = payload?.handle || streamers.get(streamerId)?.handle || null;
    if (!handle) return;
    // streamerId + widgetId are echoed straight back by the game in its
    // `hint-reveal` response so we can fire the burst against the exact
    // widget without a handle→streamerId reverse lookup.
    const revealMsg = {
      streamerId: streamerId || null,
      streamerHandle: String(handle).toLowerCase(),
      widgetId: payload?.widgetId || null,
      count: Number(payload?.count) || 0,
      test: !!payload?.test,
      at: Date.now(),
    };
    let delivered = 0;
    for (const [, sock] of appSockets.entries()) {
      if (sock && sock.connected) { sock.emit('reveal-hint', revealMsg); delivered++; }
    }
    console.log(`[LikeHint] @${revealMsg.streamerHandle} → reveal-hint to ${delivered} game(s) (count=${revealMsg.count}${revealMsg.test ? ', test' : ''})`);
  });

  // Game Vote — chat picks the next game. The engine owns term/ballot/tally
  // state; everything it needs to touch the outside world is injected here so
  // it stays testable and never reaches into routing or session code itself.
  gameVote.setDeps({
    getWidgets: (streamerId) => streamerGoals.getGameVoteWidgets(streamerId),
    listVoteStreamers: () => streamers.getAll()
      .map(s => s.discordId)
      .filter(id => id && streamerGoals.getGameVoteWidgets(id).length > 0),
    emit: (streamerId, payload) => streamerGoals.emitGameVote(streamerId, payload),
    getActiveGame: (streamerId) => streamers.get(streamerId)?.activeGame || null,
    switchGame: (streamerId, gameId, setupId) => {
      const handle = streamers.get(streamerId)?.handle || streamerId;
      if (setupId) {
        // Winning candidate carries a saved setup — apply the whole thing
        // (widgets + layout + its stored game). Falls back to a plain switch
        // to the ballot's game if the setup was deleted meanwhile.
        console.log(`[GameVote] @${handle} → applying setup ${setupId} (ballot winner ${gameId})`);
        applyStreamerSetup(streamerId, setupId, gameId, { preserveVoteWidgets: true });
        return;
      }
      console.log(`[GameVote] @${handle} → switching to ${gameId}`);
      applyStreamerGameSwitch(streamerId, gameId);
    },
    gameLabel: (gameId) => STREAMER_GAME_LABELS[gameId] || gameId,
    // How long the win card will hold the overlay after a win, so the ballot
    // can wait its turn. Mirrors the overlay's own clamp for the fade timer
    // (goals-overlay.html: max(1000, min(10000, durationMs || 5000))) plus a
    // margin for the exit transition. Bounded by that clamp on purpose: a card
    // set to 'until-next'/'manual' persistence never hides on its own, and the
    // vote must not be blocked forever by one.
    getWinCardHoldMs: (streamerId) => {
      try {
        const cfg = streamerGoals.getForStreamer(streamerId).config;
        const card = (cfg.widgets || []).find(w => w.type === 'winCard' && w.enabled);
        if (!card) return 0;
        return Math.max(1000, Math.min(10000, Number(card.durationMs) || 5000)) + 800;
      } catch (_) { return 0; }
    },
  });
  relay.setGameVoteChatSink((streamerId, normalized) => gameVote.handleChat(streamerId, normalized));

  // One-time repair of widget positions that were accidentally pinned to a
  // single game (see migrateLayoutScope). Runs here rather than inside load()
  // because it wants each streamer's ACTIVE game — promoting that entry means
  // a live overlay doesn't shift at all. Idempotent via a config flag.
  try {
    let repaired = 0;
    for (const s of streamers.getAll()) {
      if (!s || !s.discordId) continue;
      const r = streamerGoals.migrateLayoutScope(s.discordId, s.activeGame || null);
      if (r && r.promoted) repaired++;
    }
    if (repaired) console.log(`[StreamerGoals] layout scope repaired for ${repaired} streamer(s)`);
  } catch (err) {
    console.warn('[StreamerGoals] layout scope repair failed:', err.message || err);
  }

  // Streamer TTS pipeline — emits tts-play to room voice-tts:<streamerId>
  streamerTtsPipeline.setIo(io);

  // Initialize event overlay (active-game polling, streak tracker, broadcaster)
  eventOverlay.init(io, relay);

  // Initialize activity overlay (cross-game permanent feed)
  activityOverlay.init(io);

  // Initialize social feed (persistent activity feed + hourly prune)
  feed.init(io);

  // Win tallies — running per-player win counts behind the Win Card's
  // session / saved leaderboard modes. Emits to the same goals:<id> room.
  winTallies.setIo(io);
  winTallies.load();

  // Initialize top-likers broadcasting
  topLikers.initialize(io, {
    getActiveGameInfo: getTopLikersActiveGameInfo,
    getEntryGameStats: getTopLikerGameStats
  });

  // Start chat message cleanup (12-hour history)
  startChatCleanup();

  // Initialize app manager
  apps.initialize(io);

  // Initialize Spotify "Now Playing"
  spotifyRequests.setIo(io);
  spotify.initialize(io, {
    clientId: process.env.SPOTIFY_CLIENT_ID || '',
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
    redirectUri: process.env.SPOTIFY_REDIRECT_URI || 'http://localhost:3000/spotify/callback',
    onNowPlaying: (payload) => {
      sassie.forwardSystemEvent('spotify', 'spotify_now_playing', payload, 'low');
    },
    onPlaybackUpdate: (payload) => {
      spotifyRequests.handlePlaybackUpdate(spotifyRequests.ownerStreamerId, payload);
    },
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

    emitFirstTimePlayer('searchle', data.user, buildSearchleSassieContext(lastSearchleState));

    // Enrich with game context before forwarding to Sassie
    const rank = data.rank || 0;
    const totalRanked = data.totalRankedWords || 0;
    const liveContext = buildSearchleSassieContext(lastSearchleState);

    // Classify guess quality by rank (rank 1 = win, handled by game-won)
    let eventName = 'wrong_guess';
    let priority = 'normal';
    if (rank > 0 && rank <= 5) {
      eventName = 'guess_best_so_far';
      priority = 'high';
    } else if (rank > 0 && rank <= 25) {
      eventName = 'guess_best_so_far';
    }

    sassie.forwardGameEvent('searchle', eventName, {
      ...data,
      totalRankedWords: totalRanked || undefined,
      ...liveContext
    }, priority);
  });

  searchleSocket.on('bump-guess', (data) => {
    io.emit('searchle-bump-guess', data);
    // bump-guess = duplicate guess by another player, not a new discovery
    // No Sassie forwarding — these are noisy and carry no rank data
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

    // Enrich win event with frenzy and pot data
    const liveContext = buildSearchleSassieContext(lastSearchleState);
    sassie.forwardGameWin({
      game: 'searchle',
      winner: {
        displayName: data.user?.displayName || data.user?.username || 'Player',
        platform: data.user?.platform || 'unknown',
        uid: data.user?.id || data.user?.uid || 'unknown',
        linkedDiscord: data.user?.linkedDiscord || ''
      },
      word: data.targetWord || data.word || '',
      guessCount: data.guessCount || undefined,
      jackpot: data.jackpot || 0,
      isDaily: !!data.isDaily,
      pot: data.pot || undefined,
      frenzyMultiplier: data.frenzy?.multiplier || undefined,
      totalRankedWords: lastSearchleState?.totalRankedWords || undefined,
      ...liveContext
    });
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
    resetSeenPlayers('searchle');
    eventOverlay.resetStreaks('searchle');
    sassie.forwardGameEvent('searchle', 'challenge_progress', {
      ...data,
      ...buildSearchleSassieContext(lastSearchleState)
    }, 'low');
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
    emitFirstTimePlayer('word500', data.user);
    sassie.forwardGameEvent('word500', 'wrong_guess', data, 'normal');
  });

  word500Socket.on('game-over', (data) => {
    if (lastWord500State) {
      lastWord500State.gameOver = true;
      lastWord500State.winner = data.winner;
    }
    io.emit('word500-game-over', data);
    if (data && data.winner) {
      sassie.forwardGameWin({
        game: 'word500',
        winner: {
          displayName: data.winner?.displayName || data.winner?.username || 'Player',
          platform: data.winner?.platform || 'unknown',
          uid: data.winner?.id || data.winner?.uid || 'unknown'
        },
        word: data.word || '',
        guessCount: data.guessCount || undefined,
        jackpot: data.jackpot || 0,
        isDaily: !!data.isDaily
      });
    }
  });

  word500Socket.on('new-game', (data) => {
    if (lastWord500State) {
      lastWord500State.gameOver = false;
      lastWord500State.winner = null;
      lastWord500State.guesses = [];
    }
    io.emit('word500-new-game', data);
    resetSeenPlayers('word500');
    eventOverlay.resetStreaks('word500');
    sassie.forwardGameEvent('word500', 'challenge_progress', data, 'low');
  });

  // Connect to Sproutle game server for richer eRecTangled relay events
  erectangledSocket = ioClient(SPROUTLE_URL, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000
  });

  erectangledSocket.on('connect', () => {
    console.log('[erecTangled] Connected to game server');
    io.emit('erectangled-connected', true);
    io.emit('sproutle-connected', true); // legacy alias
    apps.setReachable('sproutle', true);
  });

  erectangledSocket.on('disconnect', () => {
    console.log('[erecTangled] Disconnected from game server');
    io.emit('erectangled-connected', false);
    io.emit('sproutle-connected', false); // legacy alias
    apps.setReachable('sproutle', false);
  });

  erectangledSocket.on('game-state', (data) => {
    lastSproutleState = data;
    io.emit('erectangled-game-state', data);
    io.emit('sproutle-game-state', data); // legacy alias
  });

  erectangledSocket.on('word-found', (data) => {
    io.emit('erectangled-word-found', data);
    io.emit('sproutle-word-found', data); // legacy alias
    emitFirstTimePlayer('sproutle', data?.user, buildSproutleSassieContext(lastSproutleState));
    const eventName = data?.isHidden
      ? 'ultra_rare_word_found'
      : data?.isRare
        ? 'rare_word_found'
        : data?.isThreeLetter
          ? 'three_letter_found'
          : 'common_word_found';
    sassie.forwardGameEvent(
      'sproutle',
      eventName,
      { ...buildSproutleSassieContext(lastSproutleState), ...data },
      data?.isHidden || data?.isRare ? 'high' : 'normal'
    );
  });

  erectangledSocket.on('new-game', (data) => {
    lastSproutleState = data;
    io.emit('erectangled-new-game', data);
    io.emit('sproutle-new-game', data); // legacy alias
    resetSeenPlayers('sproutle');
    eventOverlay.resetStreaks('sproutle');
    sassie.forwardGameEvent(
      'sproutle',
      'challenge_progress',
      { ...buildSproutleSassieContext(data), ...data },
      'low'
    );
  });

  // Connect to Wordle game server for real-time guess relay
  wordleSocket = ioClient(`http://localhost:${WORDLE_PORT}`, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000
  });

  wordleSocket.on('connect', () => {
    console.log('[Wordle] Connected to game server');
    io.emit('wordle-connected', true);
    apps.setReachable('wordle', true);
  });

  wordleSocket.on('disconnect', () => {
    console.log('[Wordle] Disconnected from game server');
    io.emit('wordle-connected', false);
    apps.setReachable('wordle', false);
  });

  wordleSocket.on('game-state', (data) => {
    lastWordleState = data;
    io.emit('wordle-game-state', data);
  });

  wordleSocket.on('guess', (data) => {
    io.emit('wordle-guess', data);
    emitFirstTimePlayer('wordle', data.user);
    // Check if all letters are 'correct' — that's a win, handled by game-win
    const isCorrect = Array.isArray(data.result) && data.result.every(r => r === 'correct');
    if (!isCorrect) {
      sassie.forwardGameEvent('wordle', 'wrong_guess', data, 'low');
    }
  });

  wordleSocket.on('game-over', (data) => {
    io.emit('wordle-game-over', data);
    sassie.forwardGameEvent('wordle', 'challenge_progress', data, 'low');
  });

  wordleSocket.on('new-game', (data) => {
    lastWordleState = data;
    io.emit('wordle-new-game', data);
    resetSeenPlayers('wordle');
    eventOverlay.resetStreaks('wordle');
    sassie.forwardGameEvent('wordle', 'challenge_progress', data, 'low');
  });

  // Connect to RecTangled game server for word-found + guess relay
  rectangledSocket = ioClient(`http://localhost:${RECTANGLED_PORT}`, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000
  });

  rectangledSocket.on('connect', () => {
    console.log('[RecTangled] Connected to game server');
    io.emit('rectangled-connected', true);
    apps.setReachable('rectangled', true);
  });

  rectangledSocket.on('disconnect', () => {
    console.log('[RecTangled] Disconnected from game server');
    io.emit('rectangled-connected', false);
    apps.setReachable('rectangled', false);
  });

  rectangledSocket.on('game-state', (data) => {
    lastRectangledState = data;
    io.emit('rectangled-game-state', data);
  });

  rectangledSocket.on('word-found', (data) => {
    io.emit('rectangled-word-found', data);
    emitFirstTimePlayer('rectangled', data?.user);
    const eventName = data?.isHidden
      ? 'hidden_word'
      : data?.isThreeLetter
        ? 'three_letter_found'
        : data?.isRare
          ? 'rare_word_found'
          : 'common_word_found';
    sassie.forwardGameEvent(
      'rectangled',
      eventName,
      data,
      data?.isHidden ? 'high' : (data?.isRare ? 'high' : 'normal')
    );
  });

  rectangledSocket.on('chat-guess', (data) => {
    io.emit('rectangled-chat-guess', data);
    emitFirstTimePlayer('rectangled', data?.user);
    // Only forward incorrect guesses (not already_found)
    if (data?.result === 'incorrect') {
      sassie.forwardGameEvent('rectangled', 'wrong_guess', data, 'low');
    }
  });

  rectangledSocket.on('new-game', (data) => {
    lastRectangledState = data;
    io.emit('rectangled-new-game', data);
    resetSeenPlayers('rectangled');
    eventOverlay.resetStreaks('rectangled');
    sassie.forwardGameEvent('rectangled', 'challenge_progress', data, 'low');
  });

  // Start server
  server.listen(PORT, () => {
    console.log(`[Server] Dashboard running at http://localhost:${PORT}`);
    sassie.logStartup();
    // Start live game state polling
    pollGameStates();
    setInterval(pollGameStates, 5000);
  });

  // Connect to TikFinity (legacy mode)
  if (process.env.TIKFINITY_WS_URL) {
    tiktok.initialize(process.env.TIKFINITY_WS_URL, process.env.TIKTOK_USERNAME);
  }

  // Connect to TikTok directly (bypasses TikFinity)
  if (process.env.TIKTOK_DIRECT_USERNAME) {
    const usernames = process.env.TIKTOK_DIRECT_USERNAME.split(',').map(u => u.trim()).filter(Boolean);
    for (const username of usernames) {
      tiktokDirect.connectStream(username, {
        sessionId: process.env.TIKTOK_SESSION_ID || undefined,
      });
    }
  }

  // Auto-reconnect streamers who explicitly asked to stay connected and
  // have not been blocked by an admin. Small stagger so we don't fire all
  // WebSocket connects in the same tick.
  try {
    const reconnectList = streamers.getAll().filter(s => s && s.wantsConnected && !streamers.isConnectBlocked(s.discordId));
    if (reconnectList.length) {
      console.log(`[StreamerBoot] auto-reconnecting ${reconnectList.length} streamer(s)`);
    }
    let i = 0;
    for (const s of reconnectList) {
      const usernames = streamers.getTiktokUsernames(s.discordId);
      if (!usernames || !usernames.length) continue;
      const effectiveGameId = getStreamerPrimaryGameId(s);
      const roomGameId = resolveStreamerGameRoom(effectiveGameId);
      // Stagger per HANDLE, not per streamer: a multi-account streamer would
      // otherwise fire both EulerStream signing requests in the same tick.
      let sessionStarted = false;
      for (const u of usernames) {
        const delay = i++ * 250;
        setTimeout(() => {
          try {
            tiktokDirect.connectStream(u, { targetGame: roomGameId, streamerId: s.discordId });
          } catch (e) {
            console.warn(`[StreamerBoot] reconnect failed for ${s.discordId}/${u}: ${e.message}`);
          }
          if (!sessionStarted && !streamers.isSessionDisabled(s.discordId) && effectiveGameId) {
            sessionStarted = true;   // one session per streamer, not per handle
            streamers.markSessionStart(s.discordId, effectiveGameId);
          }
        }, delay);
      }
    }
  } catch (e) {
    console.warn('[StreamerBoot] auto-reconnect sweep failed:', e.message);
  }

  // Bot Players — simulated viewers for streamer game sessions (Searchle +
  // Word5000). Idle until a streamer enables them on the dashboard AND has
  // a live session; all guesses flow through relay.handleMessage with
  // single-game routing (_botSoloGame) so each game gets its own roster.
  botPlayers.init({
    relay,
    streamers,
    streamerGoals,
    wordBank,
    gamePorts: GAME_API_PORTS,
    apiSecret: process.env.GAME_API_SECRET,
  });

  // Connect to Streamer.bot
  if (process.env.STREAMERBOT_WS_URL) {
    youtube.initialize(process.env.STREAMERBOT_WS_URL);
  }

  // Connect Facebook Live comments (Graph API SSE)
  if (process.env.FACEBOOK_PAGE_TOKEN) {
    facebook.initialize({
      token: process.env.FACEBOOK_PAGE_TOKEN,
      videoId: process.env.FACEBOOK_LIVE_VIDEO_ID,
    });
  }

  // Connect Discord bot
  if (process.env.DISCORD_BOT_TOKEN) {
    discord.initialize(process.env.DISCORD_BOT_TOKEN, process.env.DISCORD_CHANNEL_ID);
  }

  // Connect companion Searchle Discord bot
  if (process.env.SEARCHLE_DISCORD_BOT_TOKEN) {
    discordSearchle.initialize(process.env.SEARCHLE_DISCORD_BOT_TOKEN);
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

  // Initialize Google OAuth
  googleOAuth.initialize({
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_OAUTH_REDIRECT_URI || `http://localhost:${PORT}/auth/google/callback`
  });

  tiktokOAuth.initialize({
    clientKey: process.env.TIKTOK_CLIENT_KEY || '',
    clientSecret: process.env.TIKTOK_CLIENT_SECRET || '',
    redirectUri: process.env.TIKTOK_OAUTH_REDIRECT_URI || `http://localhost:${PORT}/auth/tiktok/callback`
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
  // Win tallies are written on a 1.5s debounce — flush so a restart right
  // after a win doesn't lose it off the streamer's board.
  try { winTallies.flush(); } catch (_) {}
  apps.shutdown();
  require('./src/relay-bridge').shutdown();
  if (searchleSocket) searchleSocket.disconnect();
  if (word500Socket) word500Socket.disconnect();
  if (erectangledSocket) erectangledSocket.disconnect();
  if (wordleSocket) wordleSocket.disconnect();
  if (rectangledSocket) rectangledSocket.disconnect();
  discord.getClient()?.destroy();
  discordSearchle.shutdown();
  server.close();
  console.log('[Relay Broadcast] Shutdown complete');
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught exception (keeping alive):', err.message, err.stack);
});
process.on('unhandledRejection', (reason) => {
  console.error('[Server] Unhandled rejection (keeping alive):', reason);
});
