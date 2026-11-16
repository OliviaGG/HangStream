// ===== Shared Game Utilities =====
// Used by all game servers in the Word Tycoon ecosystem.
// Centralizes: reward calls, library word reporting, cosmetics caching.
//
// Usage in game servers:
//   const RELAY_DIR = process.env.CHAT_RELAY_DIR || (process.platform === 'win32' ? 'C:/Chat Relay' : '/opt/chat-relay');
//   const gameShared = require(path.join(RELAY_DIR, 'src', 'game-shared.js'));
//   gameShared.init({ wordEmpiresUrl, apiSecret, io });
//

const { io: ioClient } = require('socket.io-client');
const path = require('path');
const crypto = require('crypto');
const { createRewardOutbox, createRewardTransport } = require('./reward-outbox');
let rewardOutbox = null;
const announcedRewards = new Set();

const DEFAULT_WORD_EMPIRES_URL = 'http://localhost:3020';
const DEFAULT_CHAT_RELAY_URL = 'http://localhost:3000';

let _config = {
  wordEmpiresUrl: DEFAULT_WORD_EMPIRES_URL,
  apiSecret: null, // set via init() before use
  io: null  // Socket.IO server instance — set via init()
};

/**
 * Initialize the shared module.
 * @param {Object} opts
 * @param {string} opts.wordEmpiresUrl - Word Tycoon API base URL
 * @param {string} opts.apiSecret - API key for Word Tycoon endpoints
 * @param {Object} opts.io - Socket.IO server instance (for emitting coin-reward events)
 */
function isGuestId(userId) {
  if (!userId) return true;
  const id = String(userId).toLowerCase();
  return id.startsWith('web_guest_') ||
         id.startsWith('guest_') ||
         id.startsWith('wsguest_') ||
         id.startsWith('guest-') ||
         id.startsWith('anon_');
}

/**
 * Should this player's round participation count toward Word Tycoon stats
 * (ELO, rounds played, suspicion)?
 *
 * Filters the two kinds of non-real players that reach a game's round-end:
 *   - bot players (chat-relay's src/bot-players.js simulated stream viewers)
 *   - guests (unauthenticated web/session players with no WT account)
 *
 * Accepts either (platform, userId) or a single "platform:userId" identity
 * key, because games build participant lists both ways.
 *
 * Added 2026-07-21 with the stream-stats-to-GOAT work: private streamer
 * sessions now report ELO like public rounds, and bots play in those
 * sessions — without this filter they would earn real ratings.
 */
function isStatsEligible(platform, userId) {
  let p = platform;
  let id = userId;
  if (userId === undefined && typeof platform === 'string' && platform.includes(':')) {
    const i = platform.indexOf(':');
    p = platform.slice(0, i);
    id = platform.slice(i + 1);
  }
  if (String(p || '').toLowerCase() === 'bot') return false;
  if (!id || String(id).toLowerCase() === 'unknown') return false;
  if (isGuestId(id)) return false;
  return true;
}

function init(opts = {}) {
  if (opts.wordEmpiresUrl) _config.wordEmpiresUrl = opts.wordEmpiresUrl;
  if (opts.apiSecret) _config.apiSecret = opts.apiSecret;
  if (opts.io) _config.io = opts.io;
  // One application owns this directory; queued requests carry no credentials.
  // Reinitialization replaces only the worker, retaining persisted claims.
  if (rewardOutbox) rewardOutbox.stop();
  rewardOutbox = createRewardOutbox({
    directory: opts.rewardOutboxDir || path.join(process.cwd(), 'data', 'reward-outbox'),
    send: createRewardTransport({ baseUrl: _config.wordEmpiresUrl, apiSecret: _config.apiSecret })
  });
  rewardOutbox.start();
  console.log('[RewardDelivery] Durable event protocol enabled');
}

// ── Reward ──────────────────────────────────────────────────────────────────

/**
 * Award coins to a player via Word Tycoon's /api/reward endpoint.
 * Persists an immutable event before sending. Retries survive process restart
 * and reconcile lost responses against the central durable receipt.
 * On success, emits 'coin-reward' to all connected Socket.IO clients.
 *
 * @param {string} platform - 'tiktok', 'youtube', 'discord'
 * @param {string} userId - platform user ID
 * @param {string} username - player username
 * @param {string} displayName - player display name
 * @param {number} coins - base coin amount to award
 * @param {string} gameName - game identifier (e.g. 'betweenly', 'wordle')
 * @param {string} event - reward event type (e.g. 'jackpot-win', 'daily-win', 'word')
 * @param {Object} extras - additional fields (guessCount, word, etc.)
 * @returns {Object|null} - response from Word Tycoon or null on failure
 */
async function rewardPlayer(platform, userId, username, displayName, coins, gameName, event, extras = {}) {
  // Bot players (src/bot-players.js simulated viewers) never earn WT
  // rewards — they exist only on in-round surfaces.
  if (String(platform || '').toLowerCase() === 'bot') {
    return { ok: true, bot: true, skipped: true, coinsAwarded: 0, newBalance: 0 };
  }
  // Guest players get session-only rewards (no DB persistence)
  if (isGuestId(userId)) {
    if (_config.io) {
      _config.io.emit('coin-reward', {
        player: displayName,
        coinsAwarded: coins,
        newBalance: 0
      });
    }
    return { ok: true, guest: true, coinsAwarded: coins, newBalance: 0 };
  }
  const eventId = extras.eventId || 'game:' + crypto.randomUUID();
  let payload, record, wasDelivered = false;
  try {
    if (!rewardOutbox) throw new Error('Reward delivery not initialized');
    const period = extras.rewardPeriod ||
      (['daily-win', 'mp-daily-win'].includes(event) ? getEdmontonDate() :
       ['weekly-win', 'mp-weekly-win'].includes(event) ? getRewardWeekStart() : undefined);
    // Snapshot metadata and protect the recipient/action fields from extras.
    payload = JSON.parse(JSON.stringify({ ...extras, platform, userId, username, displayName,
      coins, game: gameName, event, eventId, ...(period ? { rewardPeriod: period } : {}) }));
    const reserved = rewardOutbox.reserve(payload);
    wasDelivered = reserved.state === 'delivered';
    record = await rewardOutbox.deliver(eventId);
  } catch (error) {
    console.error('[RewardDelivery] ' + eventId + ': ' + error.message);
    return null;
  }
  if (record?.state !== 'delivered') {
    console.warn('[RewardDelivery] ' + eventId + ' retained for delivery review/retry (' + record?.state + ')');
    return null;
  }
  const data = record.result;
  if (data.ok && _config.io && !wasDelivered && !announcedRewards.has(eventId)) {
    announcedRewards.add(eventId);
    if (announcedRewards.size > 1000) announcedRewards.delete(announcedRewards.values().next().value);
    _config.io.emit('coin-reward', {
      player: displayName,
      coinsAwarded: data.coinsAwarded || coins,
      newBalance: data.newBalance || 0
    });

    // Emit post-game progress summary (if backend included one)
    if (data.progressSummary) {
      _config.io.emit('progress-summary', {
        player: displayName,
        game: gameName,
        summary: data.progressSummary
      });
    }

    // Emit cosmetic reward events for celebration animations
    if (data.dailyLootBox && data.dailyLootBox.length > 0) {
      _config.io.emit('cosmetic-reward', {
        player: displayName, type: 'daily-cosmetic',
        items: data.dailyLootBox, game: gameName
      });
    }
    if (data.lootBox) {
      _config.io.emit('cosmetic-reward', {
        player: displayName, type: 'daily-all-lootbox',
        items: data.lootBox, game: gameName
      });
    }
    if (data.weeklyCosmetic && data.weeklyCosmetic.length > 0) {
      _config.io.emit('cosmetic-reward', {
        player: displayName, type: 'weekly-lootbox',
        items: data.weeklyCosmetic, game: gameName
      });
    }
    if (data.weeklyAllGamesBox && data.weeklyAllGamesBox.length > 0) {
      _config.io.emit('cosmetic-reward', {
        player: displayName, type: 'weekly-all-lootbox',
        items: data.weeklyAllGamesBox, game: gameName
      });
    }
  }
  return data;
}

// Game-owned completion paths can reserve synchronously before consuming their
// authoritative state. These helpers never accept a browser-selected event ID.
function reservePlayerReward(platform, userId, username, displayName, coins, gameName, event, extras = {}) {
  if (['bot', 'system'].includes(String(platform || '').toLowerCase()) || isGuestId(userId)) return null;
  if (!rewardOutbox) throw new Error('Reward delivery not initialized');
  const eventId = extras.eventId || 'game:' + crypto.randomUUID();
  const period = extras.rewardPeriod ||
    (['daily-win', 'mp-daily-win'].includes(event) ? getEdmontonDate() :
      ['weekly-win', 'mp-weekly-win'].includes(event) ? getRewardWeekStart() : undefined);
  const payload = JSON.parse(JSON.stringify({ ...extras, platform, userId, username, displayName,
    coins, game: gameName, event, eventId, ...(period ? { rewardPeriod: period } : {}) }));
  return rewardOutbox.reserve(payload);
}
function getPlayerRewardDelivery(eventId) {
  return rewardOutbox ? rewardOutbox.read(eventId) : null;
}
async function deliverPlayerReward(eventId) {
  const record = getPlayerRewardDelivery(eventId);
  if (!record) return null;
  const p = record.payload;
  return rewardPlayer(p.platform, p.userId, p.username, p.displayName, p.coins, p.game, p.event, p);
}

// Resolve the accepted instant to an Edmonton civil date before finding Monday.
function getRewardWeekStart() {
  const date = new Date(getEdmontonDate() + 'T12:00:00Z');
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

async function privateEconomyFetch(endpoint, options) {
  const target = new URL(_config.wordEmpiresUrl);
  if (target.username || target.password || target.pathname !== '/' || target.search || target.hash ||
      !((target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) && target.port === '3020') ||
        (target.protocol === 'https:' && ['wordtycoon.live', 'www.wordtycoon.live'].includes(target.hostname) && !target.port))) throw Error('Invalid economy destination');
  return fetch(target.origin + endpoint, { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) });
}

async function privateRelayFetch(endpoint, options = {}) {
  const target = new URL(process.env.CHAT_RELAY_URL || DEFAULT_CHAT_RELAY_URL);
  if (target.username || target.password || target.pathname !== '/' || target.search || target.hash ||
      !((target.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname) && target.port === '3000') ||
        (target.protocol === 'https:' && ['wordtycoon.live', 'www.wordtycoon.live'].includes(target.hostname) && !target.port))) throw Error('Invalid relay destination');
  return fetch(target.origin + endpoint, { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) });
}

// ── Library Word Reporting ──────────────────────────────────────────────────

/**
 * Report a word found by a player to Word Tycoon's library.
 * If the word is new to the player's library, emits 'library-word-new' via Socket.IO.
 *
 * @param {string} platform
 * @param {string} userId
 * @param {string} word
 * @param {string} game - game identifier
 */
async function reportLibraryWord(platform, userId, word, game, username, displayName, socket) {
  if (!word || !userId) return;
  if (String(platform || '').toLowerCase() === 'bot') return; // simulated viewers earn no library credit
  if (isGuestId(userId)) return;
  const payload = { platform, userId, word: word.toLowerCase(), game };
  if (username) payload.username = username;
  if (displayName) payload.displayName = displayName;
  try {
    const res = await privateEconomyFetch('/api/library/report', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': _config.apiSecret
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.ok && data.isNew) {
      const evt = { word: word.toLowerCase(), userId, displayName: displayName || null };
      // Emit to specific player's socket (with self flag for client filtering)
      if (socket && typeof socket.emit === 'function') {
        socket.emit('library-word-new', { ...evt, self: true });
      }
      // Broadcast for OBS overlays
      if (_config.io) {
        _config.io.emit('library-word-new', evt);
      }
    }
  } catch {}
}

// ── Cosmetics Cache ─────────────────────────────────────────────────────────

const _cosmeticsCache = new Map();
const COSMETICS_TTL = 60000; // 1 minute
const COSMETICS_OUTAGE_GRACE_MS = 4 * 60000; // five minutes from last success
const COSMETICS_CACHE_LIMIT = 5000;
function cacheCosmetics(key, value) {
  _cosmeticsCache.delete(key);
  while (_cosmeticsCache.size >= COSMETICS_CACHE_LIMIT) _cosmeticsCache.delete(_cosmeticsCache.keys().next().value);
  _cosmeticsCache.set(key, value);
}

/**
 * Fetch a player's equipped cosmetics from Word Tycoon.
 * Cached for 60 seconds. Returns empty object on failure.
 */
async function getPlayerCosmetics(platform, userId) {
  if (!platform || !userId || String(platform).length > 32 || String(userId).length > 128) return {};
  if (isGuestId(userId)) return {};
  const key = `${platform}:${userId}`;
  const cached = _cosmeticsCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  try {
    const res = await privateEconomyFetch(`/api/cosmetics/${encodeURIComponent(platform)}/${encodeURIComponent(userId)}`, {});
    const data = res.ok ? (await res.json()).equipped || {} : {};
    cacheCosmetics(key, { data, expiresAt: Date.now() + COSMETICS_TTL });
    return data;
  } catch {
    return cached && Date.now() < cached.expiresAt + COSMETICS_OUTAGE_GRACE_MS ? cached.data : {};
  }
}

/**
 * Invalidate or update a player's cosmetics cache entry.
 * Called when 'cosmetics-updated' event is received from Chat Relay.
 */
function invalidateCosmetics(platform, platformUserId, equipped) {
  const key = `${platform}:${platformUserId}`;
  if (equipped) {
    cacheCosmetics(key, { data: equipped, expiresAt: Date.now() + COSMETICS_TTL });
  } else {
    _cosmeticsCache.delete(key);
  }
}

// ── Relay Client Factory ────────────────────────────────────────────────────

/**
 * Create a standard Socket.IO Chat Relay client for game servers.
 *
 * @param {Object} config
 * @param {string} config.id
 * @param {string} config.name
 * @param {number|string} config.port
 * @param {string} [config.relayUrl]
 * @param {string} [config.apiSecret]
 * @param {boolean} [config.reconnection]
 * @param {number} [config.reconnectionDelay]
 * @param {number} [config.reconnectionDelayMax]
 * @param {number} [config.reconnectionAttempts]
 * @param {number} [config.timeout]
 * @param {(url: string, options: Object) => Object} [config.clientFactory] - test hook
 * @param {Object} [handlers]
 * @param {(data: Object) => void} [handlers.onChat]
 * @param {(data: Object) => void} [handlers.onCosmeticsUpdated]
 * @param {(data: Object) => void} [handlers.onFrenzyUpdate]
 * @param {() => void} [handlers.onActivateDaily]
 * @param {(data: Object) => void} [handlers.onRevealHint]
 * @param {(data: Object) => void} [handlers.onEngagement]
 * @param {(socket: Object, ack?: any) => void} [handlers.onConnect]
 * @param {(reason?: string) => void} [handlers.onDisconnect]
 * @param {(error: Error) => void} [handlers.onConnectError]
 * @returns {Object}
 */
function createRelayClient(config = {}, handlers = {}) {
  const {
    id,
    name,
    port,
    relayUrl = process.env.CHAT_RELAY_URL || DEFAULT_CHAT_RELAY_URL,
    apiSecret = process.env.GAME_API_SECRET,
    reconnection = true,
    reconnectionDelay = 2000,
    reconnectionDelayMax,
    reconnectionAttempts = Infinity,
    timeout,
    clientFactory = ioClient
  } = config;

  const options = {
    reconnection,
    reconnectionDelay,
    reconnectionAttempts
  };

  if (typeof reconnectionDelayMax === 'number') options.reconnectionDelayMax = reconnectionDelayMax;
  if (typeof timeout === 'number') options.timeout = timeout;

  const socket = clientFactory(relayUrl, options);
  let didLogConnectError = false;

  socket.on('connect', () => {
    didLogConnectError = false;
    console.log(`[${name}] Connected to Chat Relay`);
    socket.emit('app-register', { id, name, port, apiKey: apiSecret }, (ack) => {
      if (ack?.success) console.log(`[${name}] Registered with Chat Relay`);
      if (typeof handlers.onConnect === 'function') handlers.onConnect(socket, ack);
    });
  });

  socket.on('disconnect', (reason) => {
    console.log(`[${name}] Disconnected from Chat Relay`);
    if (typeof handlers.onDisconnect === 'function') handlers.onDisconnect(reason);
  });

  socket.on('connect_error', (err) => {
    if (!didLogConnectError) {
      console.log(`[${name}] Chat Relay connection error (will retry):`, err.message);
      didLogConnectError = true;
    }
    if (typeof handlers.onConnectError === 'function') handlers.onConnectError(err);
  });

  if (typeof handlers.onChat === 'function') {
    socket.on('chat-message', (data) => {
      if (data && data.isJoin) return;
      handlers.onChat(data);
    });
  }
  if (typeof handlers.onCosmeticsUpdated === 'function') {
    socket.on('cosmetics-updated', (data) => handlers.onCosmeticsUpdated(data));
  }
  if (typeof handlers.onFrenzyUpdate === 'function') {
    socket.on('frenzy-update', (data) => handlers.onFrenzyUpdate(data));
  }
  if (typeof handlers.onActivateDaily === 'function') {
    socket.on('activate-daily', () => handlers.onActivateDaily());
  }
  if (typeof handlers.onRevealHint === 'function') {
    // Like-for-Hint: chat-relay broadcasts this when a streamer's likeHint
    // widget crosses its threshold. Payload: { streamerHandle, count, test }.
    // Games reveal a hint only if they own a live session for that handle.
    socket.on('reveal-hint', (data) => handlers.onRevealHint(data));
  }
  if (typeof handlers.onEngagement === 'function') {
    socket.on('engagement', (data) => handlers.onEngagement(data));
  }

  return socket;
}

// ── Edmonton Date Helper ────────────────────────────────────────────────────
// All daily/weekly systems use America/Edmonton timezone to align with Word Tycoon.
const _edmontonDateFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: process.env.DAILY_TIMEZONE || 'America/Edmonton',
  year: 'numeric', month: '2-digit', day: '2-digit'
});
function getEdmontonDate() {
  return _edmontonDateFmt.format(new Date()); // YYYY-MM-DD
}

// ── IP Logging ──────────────────────────────────────────────────────────────

// In-memory dedup: "platform:userId:ip" → expiry timestamp
const _ipReportCache = new Map();
const IP_REPORT_TTL = 10 * 60 * 1000; // 10 minutes

/**
 * Extract the real client IP from a Socket.IO socket's handshake headers.
 * Priority: CF-Connecting-IP > X-Real-IP > X-Forwarded-For > socket address.
 */
function getClientIP(socket) {
  return require('./client-address').socketClientAddress(socket);
}

/**
 * Report a player's IP to Word Tycoon for storage. Fire-and-forget with dedup.
 */
const ipReportsInFlight = new Set();
async function reportPlayerIP(platform, platformUserId, ip, game) {
  if (typeof platform !== 'string' || typeof platformUserId !== 'string' || !platformUserId || platformUserId.length > 128 ||
      isGuestId(platformUserId) || !require('node:net').isIP(ip) || typeof game !== 'string' || !game || game.length > 80) return;
  const key = `${platform}:${platformUserId}:${ip}`, time = Date.now();
  if ((_ipReportCache.get(key) || 0) > time || ipReportsInFlight.has(key) || ipReportsInFlight.size >= 200) return;
  ipReportsInFlight.add(key);
  try {
    const response = await privateEconomyFetch('/api/report-ip', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': _config.apiSecret },
      body: JSON.stringify({ platform, platformUserId, ip, game })
    });
    if (!response.ok || (await response.json()).ok !== true) return;
    for (const [existing, expiry] of _ipReportCache) if (expiry <= time) _ipReportCache.delete(existing);
    if (_ipReportCache.size >= 2000) _ipReportCache.delete(_ipReportCache.keys().next().value);
    _ipReportCache.set(key, time + IP_REPORT_TTL);
  } catch {} finally { ipReportsInFlight.delete(key); }
}

/** Report only the socket's verified account and actual trusted client address. */
async function reportSocketIP(socket, _platform, platformUserId, game) {
  if (!socket || typeof platformUserId !== 'string' || isGuestId(platformUserId)) return;
  const identity = await resolveWebIdentity([platformUserId], socket);
  if (!identity.verified || !identity.claimIsSamePerson) return;
  const ip = getClientIP(socket);
  if (!ip || ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(ip)) return;
  const anchor = socket._wtVerifiedAnchorId;
  return reportPlayerIP(anchor ? 'discord' : 'web', anchor || identity.id, ip, game);
}

// ── Exports ─────────────────────────────────────────────────────────────────


// ─── Word-find scoring helpers (shared across rectangled / sproutle / wikirectangled) ────
// Ported from /opt/sproutle/src/game.js — kept here so all word-find games can
// call the same per-letter and per-length bonus tables. Tweaks land in one place.

const _WORD_LENGTH_BONUS_TABLE = { 4: 75, 5: 150, 6: 300, 7: 500, 8: 800, 9: 1200, 10: 1750, 11: 2500 };
const _WORD_LENGTH_BONUS_MAX = 3500;
function getWordLengthBonus(word) {
  const len = (word || '').length;
  if (len <= 3) return 0;
  if (len >= 12) return _WORD_LENGTH_BONUS_MAX;
  return _WORD_LENGTH_BONUS_TABLE[len] || 0;
}

const _LETTER_RARITY = {
  e: 0, t: 0, a: 0, o: 0, i: 0, n: 0, s: 0, h: 0, r: 0,
  d: 15, l: 15,
  c: 30, u: 30, m: 30, w: 30, f: 30,
  g: 60, y: 60, p: 60,
  b: 105, v: 105, k: 105,
  j: 180, x: 180,
  q: 300, z: 300,
};
const _LETTER_TIER_NAMES = {
  0: 'common', 15: 'uncommon', 30: 'rare', 60: 'epic',
  105: 'legendary', 180: 'mythic', 300: 'unique',
};
function getLetterRarityBonus(word) {
  let bonus = 0;
  const tierCounts = { common: 0, uncommon: 0, rare: 0, epic: 0, legendary: 0, mythic: 0, unique: 0 };
  for (const ch of String(word || '').toLowerCase()) {
    const b = _LETTER_RARITY[ch];
    if (b === undefined) continue;
    bonus += b;
    tierCounts[_LETTER_TIER_NAMES[b]]++;
  }
  return { bonus, tierCounts };
}

// ─── Premium web-play gate (shared, 2026-07-31) ──────────────────────────
// Single implementation of the Donor-Class / Super-Fan check every game runs
// before accepting a WEBSITE guess — public rooms AND streamer session pages.
//
// History: each game grew its own copy when public MP was gated (2026-07-17).
// Most of those copies decide "logged in" by DISCORD SNOWFLAKE SHAPE
// (/^\d{17,20}$/) and hard-block anything else, which silently walls out
// GitHub / Google / TikTok logins whose subscription hangs off a LINKED
// account. That was survivable in public rooms; streamer session pages are
// full of exactly those viewers, so this version hands whatever id the client
// holds to the relay and lets computePremiumById resolve the linked group
// (relay server.js — resolveAnyLinkedDiscord / isLinkedTiktokSuperfan).
//
// Semantics (deliberate):
//   - anonymous guests are refused WITHOUT a lookup (they can never be premium)
//   - outages retain only a recently confirmed active entitlement, for five minutes
//   - only WEB sockets reach this; TikTok/Discord chat play-along enters via
//     createRelayClient's chat-message path and is never gated.
const PREMIUM_WEB_TTL_MS = 60 * 1000;
const PREMIUM_WEB_OUTAGE_GRACE_MS = 5 * 60 * 1000;
const _premiumWebCache = new Map(); // id -> { at, premium }

/**
 * True when an id belongs to an unauthenticated web player. Superset of the
 * per-game copies — those only knew web_guest_/guest_/'anon', so a wsguest_
 * or anon_ id skipped the guest short-circuit and burned a relay lookup.
 */
function isAnonWebId(id) {
  const s = String(id || '').toLowerCase();
  if (!s || s === 'anon' || s === 'guest' || s === 'unknown') return true;
  return s.startsWith('web_guest_') || s.startsWith('guest_') ||
         s.startsWith('wsguest_') || s.startsWith('guest-') ||
         s.startsWith('anon_') || s.startsWith('bot_');
}

// ── Verified socket identity ────────────────────────────────────────────────
// Each action resolves the current cookie proof and account aliases. Only
// overlapping lookups coalesce; previous success cannot authorize a later action.
const IDENTITY_ENFORCE = true;

function _socketCookieHeader(socket) {
  return (socket && socket.handshake && socket.handshake.headers &&
          socket.handshake.headers.cookie) || '';
}

/**
 * The identity this socket can PROVE, or null.
 *
 * The proof is the wt_remember cookie the relay set at login: an HMAC over the
 * user id signed with SESSION_SECRET, which only the relay can produce. The game
 * server forwards the header and the relay hands back the id it verifies. A
 * client that fabricates data.user.id cannot fabricate this.
 *
 * Returns null on any relay/network failure — callers decide what that means;
 * Previous verification is cleared when the fresh lookup cannot authorize.
 */
async function verifySocketIdentity(socket) {
  if (!socket || socket.connected === false) return null;
  const cookie = _socketCookieHeader(socket);
  if (typeof cookie !== 'string' || !cookie || cookie.length > 16384) {
    socket._wtVerifiedIdentity = null; socket._wtVerifiedAliases = new Set(); socket._wtVerifiedAnchorId = null; return null;
  }
  if (socket._wtIdentityCheck?.cookie === cookie) return socket._wtIdentityCheck.promise;
  const check = { cookie, promise: null };
  socket._wtIdentityCheck = check;
  socket._wtVerifiedIdentity = null; socket._wtVerifiedAliases = new Set(); socket._wtVerifiedAnchorId = null;
  check.promise = (async () => {
    try {
      const response = await privateRelayFetch('/api/internal/whoami', {
        headers: { 'x-api-key': _config.apiSecret, 'x-forwarded-cookie': cookie }
      });
      if (!response.ok) return null;
      const data = await response.json(), user = data?.user;
      if (typeof user?.id !== 'string' || !user.id || user.id.length > 128 ||
          (user.aliases != null && (!Array.isArray(user.aliases) || user.aliases.length > 64))) return null;
      if (socket._wtIdentityCheck !== check || _socketCookieHeader(socket) !== cookie || socket.connected === false) return null;
      const aliases = new Set([user.id, user.anchorId, ...(user.aliases || [])]
        .filter(value => typeof value === 'string' && value && value.length <= 128));
      socket._wtVerifiedIdentity = user.id; socket._wtVerifiedAliases = aliases;
      socket._wtVerifiedAnchorId = typeof user.anchorId === 'string' && user.anchorId && user.anchorId.length <= 128 ? user.anchorId : null;
      return user.id;
    } catch { return null; }
  })();
  try { return await check.promise; }
  finally { if (socket._wtIdentityCheck === check) delete socket._wtIdentityCheck; }
}

/**
 * The id a web action should be attributed to: the verified one when we have it,
 * otherwise the best client-asserted candidate.
 *
 * Games should use this for reward/XP attribution instead of data.user.id, so a
 * player cannot bank their score into someone else's account.
 *
 * @returns {Promise<{id: string, verified: boolean, claimed: string}>}
 */
async function resolveWebIdentity(candidateIds, socket) {
  const list = Array.isArray(candidateIds) ? candidateIds : [candidateIds];
  const claims = [...new Set(list.map(value => String(value || '').trim()).filter(value => value && !isAnonWebId(value)))];
  const claimed = claims[0] || '';
  const verified = await verifySocketIdentity(socket);
  if (verified) {
    const aliases = socket._wtVerifiedAliases || new Set([String(verified)]);
    // A linked player's payload names their WT anchor while the cookie proves
    // the gh_/go_/tt_ side. Both are the same person, so both are accepted.
    const claimIsSamePerson = claims.every(value => aliases.has(value));
    if (!claimIsSamePerson) {
      console.warn('[Identity] unrecognized identity in game payload blocked');
    }
    return { id: verified, verified: true, claimed, claimIsSamePerson };
  }
  return { id: claimed, verified: false, claimed, claimIsSamePerson: true };
}

async function isPremiumWebUser(accountId) {
  const id = String(accountId || '');
  if (isAnonWebId(id) || id.length > 64) return false;
  const hit = _premiumWebCache.get(id);
  if (hit && Date.now() - hit.at < PREMIUM_WEB_TTL_MS) return hit.premium;
  try {
    const r = await privateRelayFetch(`/api/public/entitlement?discordId=${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error('http ' + r.status);
    const data = await r.json();
    if (typeof data?.premium !== 'boolean') throw Error('Invalid entitlement response');
    const premium = data.premium;
    if (_premiumWebCache.size > 5000) _premiumWebCache.clear();
    _premiumWebCache.set(id, { at: Date.now(), premium });
    return premium;
  } catch (e) {
    return hit?.premium === true && Date.now() - hit.at < PREMIUM_WEB_OUTAGE_GRACE_MS;
  }
}

// Perk badges for a WEB player. The relay stamps superfan/fan-club badges onto
// chat identities itself, but those are keyed by TikTok handle — a player
// signed in on the site with Discord/GitHub/Google has no such key, so games
// saw no perks for them at all.
//
// Unknown badges fail closed. Recently confirmed badges use the same bounded
// five-minute outage grace as the entitlement gate; failures never renew it.
const NO_PERKS = Object.freeze({ superfan: false, donor: false, fanClub: false });
const _perksWebCache = new Map(); // accountId -> { at, perks }
const PERKS_WEB_TTL_MS = 60000;

async function getWebPlayerPerks(accountId) {
  const id = String(accountId || '');
  if (!id || isAnonWebId(id) || isGuestId(id) || id.length > 64) return NO_PERKS;
  const hit = _perksWebCache.get(id);
  if (hit && Date.now() - hit.at < PERKS_WEB_TTL_MS) return hit.perks;
  try {
    const r = await privateRelayFetch(`/api/public/perks?discordId=${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error('http ' + r.status);
    const data = await r.json();
    const perks = {
      superfan: data?.superfan === true,
      donor: data?.donor === true,
      fanClub: data?.fanClub === true,
    };
    if (_perksWebCache.size > 5000) _perksWebCache.clear();
    _perksWebCache.set(id, { at: Date.now(), perks });
    return perks;
  } catch (e) {
    return hit && Date.now() - hit.at < PREMIUM_WEB_OUTAGE_GRACE_MS ? hit.perks : NO_PERKS;
  }
}

/**
 * Gate a web guess. Pass every identity the client handed you, best first
 * (linkedDiscord, platformUserId, id). Every non-guest id must belong to the
 * verified linked group; one valid id cannot conceal a different second id.
 *
 * @param {string|string[]} candidateIds
 * @param {Object} socket - emitted 'premium-required' on refusal
 * @param {string} [context] - 'mp' (public room) | 'session' (streamer page)
 * @returns {Promise<boolean>} true when the guess may proceed
 */
async function passesPremiumWebGate(candidateIds, socket, context = 'mp') {
  const { id, verified, claimed, claimIsSamePerson } = await resolveWebIdentity(candidateIds, socket);

  // Refuse outright when the socket proves one person and the payload names
  // another. This is what makes reward/XP/ELO attribution correct in every game
  // without touching any of them: the only payload that gets past this point is
  // one whose supplied identities all belong to the real player, so downstream
  // its own id variables is already the right account.
  if (verified && !claimIsSamePerson) {
    try { socket.emit('premium-required', { loggedIn: true, context, reason: 'identity_mismatch' }); } catch (e) {}
    return false;
  }

  // A verified identity always wins — including when it is LESS privileged than
  // the claim. That is the whole point: entitlement follows the person holding
  // the cookie, not the string in the payload.
  let gateId = verified ? id : '';

  if (!verified) {
    // No proof. Enforcing means an unprovable claim buys nothing; observing
    // means we behave exactly as before and just record it, so the enforcement
    // switch can be flipped on evidence rather than hope. The population at
    // risk is real: a game iframed on another origin loses the cookie to
    // third-party cookie blocking even though the player is legitimately
    // signed in.
    if (claimed) {
      console.warn('[Identity] unverified game identity blocked');
    }
    if (!IDENTITY_ENFORCE) gateId = claimed;
  }

  if (gateId && await isPremiumWebUser(gateId)) {
    // Stash the player's perk badges on the socket. Every game wraps this
    // function with its own signature (arrays of ids, a bare id, a user
    // object, socket-only), so there is no shared argument to hang them off —
    // but every one of them has the socket. Games spread socket._wtPerks into
    // whatever user object they build; games that don't render badges simply
    // ignore it.
    //
    // Keyed off the VERIFIED id only. Stamping perks for an unproven claim
    // would let anyone wear a Super Fan heart by editing their payload, which
    // is exactly the attack resolveWebIdentity exists to stop.
    socket._wtPerks = verified ? _perksToFlags(await getWebPlayerPerks(gateId)) : _perksToFlags(NO_PERKS);
    const current = await verifySocketIdentity(socket);
    const ids = Array.isArray(candidateIds) ? candidateIds : [candidateIds];
    if (current !== id || !ids.filter(value => value && !isAnonWebId(value)).every(value => socket._wtVerifiedAliases.has(String(value).trim()))) {
      socket._wtPerks = _perksToFlags(NO_PERKS);
      try { socket.emit('premium-required', { loggedIn: !!current, context, reason: 'identity_changed' }); } catch {}
      return false;
    }
    return true;
  }
  try { socket.emit('premium-required', { loggedIn: !!gateId, context }); } catch (e) {}
  return false;
}

// Games name these flags isFanClub / isSuperfan (the shape chat identities
// already arrive in), so translate once here rather than in each game.
function _perksToFlags(perks) {
  return {
    isSuperfan: !!perks.superfan,
    isDonor: !!perks.donor,
    isFanClub: !!perks.fanClub,
  };
}

module.exports = {
  createDailyRoundStore: require('./daily-round-state').createDailyRoundStore,
  init,
  isGuestId,
  isStatsEligible,
  isAnonWebId,
  isPremiumWebUser,
  getWebPlayerPerks,
  passesPremiumWebGate,
  verifySocketIdentity,
  resolveWebIdentity,
  rewardPlayer,
  reservePlayerReward,
  getPlayerRewardDelivery,
  deliverPlayerReward,
  reportLibraryWord,
  getPlayerCosmetics,
  invalidateCosmetics,
  createRelayClient,
  getEdmontonDate,
  getClientIP,
  reportPlayerIP,
  reportSocketIP,
  getLetterRarityBonus,
  getWordLengthBonus,
};
