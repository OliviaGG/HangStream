/**
 * streamers.js — Streamer whitelist and settings management
 *
 * Stores whitelisted streamers and their TikTok settings.
 * Data persisted to data/streamers.json.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'streamers.json');
const DEFAULT_ACTIVE_GAME = 'searchle';

// In-memory store: { [discordId]: { discordId, username, displayName, tiktokUsername, activeGame, whitelistedAt, updatedAt } }
let streamers = {};

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    streamers = JSON.parse(raw);
    console.log(`[Streamers] Loaded ${Object.keys(streamers).length} streamer(s)`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      streamers = {};
      save();
      console.log('[Streamers] Created empty streamers file');
    } else {
      console.error('[Streamers] Failed to load:', err.message);
      streamers = {};
    }
  }
}

function save() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(streamers, null, 2));
  } catch (err) {
    console.error('[Streamers] Failed to save:', err.message);
  }
}

/**
 * Check if a Discord user is whitelisted as a streamer.
 */
function isWhitelisted(discordId) {
  return !!streamers[discordId];
}

/**
 * Get a streamer's settings.
 */
function get(discordId) {
  return streamers[discordId] || null;
}

/**
 * Get all streamers.
 */
function getAll() {
  return Object.values(streamers);
}

/**
 * Whitelist a new streamer (admin action).
 */
function whitelist(discordId, username, displayName) {
  if (streamers[discordId]) return streamers[discordId]; // already whitelisted

  streamers[discordId] = {
    discordId,
    username: username || 'unknown',
    displayName: displayName || username || 'unknown',
    tiktokUsername: null,
    activeGame: DEFAULT_ACTIVE_GAME,
    activeGames: [DEFAULT_ACTIVE_GAME],
    whitelistedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  ensureHandle(discordId);
  save();
  console.log(`[Streamers] Whitelisted: ${displayName || username} (${discordId})`);
  return streamers[discordId];
}

// ── Streamer handle (URL slug for /play/:handle and /win-overlay?streamer=) ────
function _slugify(input) {
  if (!input) return '';
  return String(input).toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
}

function _handleTaken(handle, exceptDiscordId) {
  for (const [id, s] of Object.entries(streamers)) {
    if (id === exceptDiscordId) continue;
    if (s.handle && s.handle === handle) return true;
  }
  return false;
}

function ensureHandle(discordId) {
  const s = streamers[discordId];
  if (!s) return null;
  if (s.handle) return s.handle;

  // Try username slug, then displayName slug, then s-<discordId> as fallback.
  const candidates = [_slugify(s.username), _slugify(s.displayName), `s-${discordId}`].filter(Boolean);
  let chosen = null;
  for (const c of candidates) {
    if (!_handleTaken(c, discordId)) { chosen = c; break; }
  }
  if (!chosen) chosen = `s-${discordId}`;
  s.handle = chosen;
  s.updatedAt = new Date().toISOString();
  save();
  return chosen;
}

function getByHandle(handle) {
  if (!handle) return null;
  const target = String(handle).toLowerCase();
  for (const s of Object.values(streamers)) {
    if (s.handle && s.handle.toLowerCase() === target) return s;
  }
  return null;
}

/**
 * Remove a streamer from the whitelist (admin action).
 */
function unwhitelist(discordId) {
  if (!streamers[discordId]) return false;
  const name = streamers[discordId].displayName;
  delete streamers[discordId];
  save();
  console.log(`[Streamers] Removed: ${name} (${discordId})`);
  return true;
}

// Maximum TikTok accounts one streamer may run at the same time. This is a
// real cost cap, not a UI nicety: every connect (and every reconnect attempt)
// spends 1-3 EulerStream signing requests out of a quota shared by the whole
// relay, so N streamers x N handles multiplies against a fixed budget.
const MAX_TIKTOK_ACCOUNTS = 2;

/**
 * Normalize a TikTok account list. Accepts an array, a comma-separated
 * string or a single name; strips @, drops blanks, dedupes case-insensitively
 * (preserving the caller's casing and order) and caps at MAX_TIKTOK_ACCOUNTS.
 */
function _normalizeTiktokList(input) {
  const raw = Array.isArray(input)
    ? input
    : (typeof input === 'string' ? input.split(',') : (input ? [input] : []));
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    const name = entry ? String(entry).replace(/^@+/, '').trim() : '';
    if (!name) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
    if (out.length >= MAX_TIKTOK_ACCOUNTS) break;
  }
  return out;
}

/**
 * Update a streamer's TikTok accounts (up to MAX_TIKTOK_ACCOUNTS).
 * `tiktokUsername` is kept in sync as the PRIMARY mirror — the admin UI,
 * streamer applications and the ai_licia name matching all still read that
 * singular field, so it must never drift from tiktokUsernames[0].
 */
function setTiktokUsername(discordId, tiktokUsername) {
  if (!streamers[discordId]) return null;

  const names = _normalizeTiktokList(tiktokUsername);
  streamers[discordId].tiktokUsername = names[0] || null;
  streamers[discordId].tiktokUsernames = names;

  streamers[discordId].updatedAt = new Date().toISOString();
  save();
  return streamers[discordId];
}

/**
 * Get TikTok usernames for a streamer (0..MAX_TIKTOK_ACCOUNTS entries).
 * Records written before multi-account support only carry the singular field.
 */
function getTiktokUsernames(discordId) {
  const s = streamers[discordId];
  if (!s) return [];
  if (Array.isArray(s.tiktokUsernames) && s.tiktokUsernames.length) {
    return _normalizeTiktokList(s.tiktokUsernames);
  }
  return s.tiktokUsername ? [s.tiktokUsername] : [];
}

/**
 * Find the streamer who already owns a TikTok handle, ignoring
 * `exceptDiscordId`. Two streamers sharing a handle would fight over the same
 * connection slot (connections are keyed by username in tiktok-direct.js), so
 * callers use this to reject the claim.
 */
function findByTiktokUsername(tiktokUsername, exceptDiscordId) {
  const target = String(tiktokUsername || '').replace(/^@+/, '').trim().toLowerCase();
  if (!target) return null;
  for (const [id, s] of Object.entries(streamers)) {
    if (id === exceptDiscordId) continue;
    const owned = (Array.isArray(s.tiktokUsernames) && s.tiktokUsernames.length)
      ? s.tiktokUsernames
      : (s.tiktokUsername ? [s.tiktokUsername] : []);
    if (owned.some(u => String(u || '').toLowerCase() === target)) return s;
  }
  return null;
}

/**
 * Update a streamer's primary active game. Accepts a single gameId or an
 * array for backward compatibility, but only the first non-empty entry is
 * persisted. Additional live games now come from enabled game widgets.
 */
function setActiveGames(discordId, gameIds) {
  if (!streamers[discordId]) return null;
  const list = Array.isArray(gameIds) ? gameIds : (gameIds ? [gameIds] : []);
  // Normalize: drop blanks, dedupe (preserving order), keep primary only.
  const seen = new Set();
  const cleaned = [];
  for (const g of list) {
    const id = g ? String(g).trim() : '';
    if (!id || seen.has(id)) continue;
    seen.add(id);
    cleaned.push(id);
    if (cleaned.length >= 1) break;
  }
  streamers[discordId].activeGames = cleaned;
  streamers[discordId].activeGame = cleaned[0] || null;
  streamers[discordId].updatedAt = new Date().toISOString();
  save();
  return streamers[discordId];
}

/**
 * Single-game variant kept for legacy callers. Wipes any secondary game.
 */
function setActiveGame(discordId, gameId) {
  return setActiveGames(discordId, gameId ? [gameId] : []);
}

/**
 * Get a streamer's primary active-game list (always 0 or 1 entries). Pulls
 * from the first `activeGames` slot if present, falls back to `activeGame`.
 */
function getActiveGames(discordId) {
  const s = streamers[discordId];
  if (!s) return [];
  if (Array.isArray(s.activeGames) && s.activeGames.length) return [s.activeGames[0]];
  return s.activeGame ? [s.activeGame] : [DEFAULT_ACTIVE_GAME];
}

/**
 * Get all streamers with active TikTok connections configured.
 */
function getActiveStreamers() {
  return Object.values(streamers).filter(s => s.tiktokUsername);
}

// ── Streamer game session (private session per /play/:handle) ─────
// A "session" is a logical bundle: one streamer + one active game + a sessionId.
// Started when the streamer hits Connect on the dashboard, ended on Disconnect.
// Persisted so chat-relay restarts can rebuild it alongside TikTok reconnects.

function markSessionStart(discordId, gameId) {
  const s = streamers[discordId];
  if (!s) return null;
  if (!gameId) return null;
  ensureHandle(discordId);
  // Reuse sessionId if same game still active (e.g. owner connecting a 2nd TikTok)
  const cur = s.currentSession;
  if (cur && cur.gameId === gameId && cur.sessionId) {
    return cur;
  }
  s.currentSession = {
    sessionId: crypto.randomUUID(),
    gameId,
    handle: s.handle,
    startedAt: new Date().toISOString(),
  };
  s.updatedAt = new Date().toISOString();
  save();
  return s.currentSession;
}

function markSessionEnd(discordId) {
  const s = streamers[discordId];
  if (!s || !s.currentSession) return false;
  delete s.currentSession;
  s.updatedAt = new Date().toISOString();
  save();
  return true;
}

function getCurrentSession(discordId) {
  const s = streamers[discordId];
  return (s && s.currentSession) || null;
}

// Per-streamer opt-out of private game sessions. When true, /api/streamer/connect
// and /api/streamer/game skip session creation, so this streamer's TikTok chat
// flows to the public game like before sessions existed.
function isSessionDisabled(discordId) {
  const s = streamers[discordId];
  return !!(s && s.disableSession);
}

function isConnectBlocked(discordId) {
  const s = streamers[discordId];
  return !!(s && s.connectBlocked);
}

function setWantsConnected(discordId, value) {
  const s = streamers[discordId];
  if (!s) return null;
  s.wantsConnected = !!value;
  s.updatedAt = new Date().toISOString();
  save();
  return s;
}

function setConnectBlocked(discordId, value, meta = {}) {
  const s = streamers[discordId];
  if (!s) return null;

  if (value) {
    s.connectBlocked = true;
    s.connectBlockedAt = new Date().toISOString();
    if (meta.reason) s.connectBlockedReason = String(meta.reason).slice(0, 200);
    else delete s.connectBlockedReason;
  } else {
    delete s.connectBlocked;
    delete s.connectBlockedAt;
    delete s.connectBlockedReason;
  }

  s.updatedAt = new Date().toISOString();
  save();
  return s;
}

// Per-streamer word-frequency / difficulty preference. Games that opt in
// (Searchle as of 2026-05-20) read this on session start and bias target
// word selection by Zipf score. 'normal' = current behavior (no filter).
const VALID_WORD_FREQUENCIES = new Set(['very-common', 'common', 'normal', 'rare', 'very-rare']);
const VALID_SEARCHLE_LANGUAGES = new Set(['en', 'pt-br']);
function getWordFrequency(discordId) {
  const s = streamers[discordId];
  if (!s) return 'normal';
  return VALID_WORD_FREQUENCIES.has(s.wordFrequency) ? s.wordFrequency : 'normal';
}
function setWordFrequency(discordId, value) {
  const s = streamers[discordId];
  if (!s) return null;
  if (!VALID_WORD_FREQUENCIES.has(value)) throw new Error('invalid word_frequency: ' + value);
  s.wordFrequency = value;
  s.updatedAt = new Date().toISOString();
  save();
  return s;
}
// Per-streamer target word length for the games whose private sessions can
// vary it (Wordle, Betwixt, PixeLetters, Figural, Word5000 as of 2026-07-20).
// 'random' re-rolls the length every round. Each game clamps the value to
// the lengths its own target bank actually stocks, so a 8 here is a request,
// not a guarantee.
const VALID_WORD_LENGTHS = new Set(['random', '4', '5', '6', '7', '8']);
function getWordLength(discordId) {
  const s = streamers[discordId];
  if (!s) return '5';
  const raw = s.wordLength == null ? '' : String(s.wordLength);
  return VALID_WORD_LENGTHS.has(raw) ? raw : '5';
}
function setWordLength(discordId, value) {
  const s = streamers[discordId];
  if (!s) return null;
  const normalized = String(value == null ? '' : value).trim().toLowerCase();
  if (!VALID_WORD_LENGTHS.has(normalized)) throw new Error('invalid word_length: ' + value);
  s.wordLength = normalized;
  s.updatedAt = new Date().toISOString();
  save();
  return s;
}

function getSearchleLanguage(discordId) {
  const s = streamers[discordId];
  if (!s) return 'en';
  return VALID_SEARCHLE_LANGUAGES.has(s.searchleLanguage) ? s.searchleLanguage : 'en';
}
function setSearchleLanguage(discordId, value) {
  const s = streamers[discordId];
  if (!s) return null;
  const normalized = value === 'pt' || value === 'pt_br' ? 'pt-br' : String(value || '').toLowerCase();
  if (!VALID_SEARCHLE_LANGUAGES.has(normalized)) throw new Error('invalid searchle_language: ' + value);
  s.searchleLanguage = normalized;
  s.updatedAt = new Date().toISOString();
  save();
  return s;
}

// Per-streamer board size for the RecTangled-family games, whose private
// session board is generated at an arbitrary rows x cols. Stored as a preset
// KEY rather than raw numbers so 'normal' keeps tracking whatever each game
// considers its default (RecTangled ships 8x6, eRecTangled 9x7) instead of
// freezing today's value into every streamer record.
//
// Sizes are deliberately a short list: each game's board pool keeps only
// MAX_KEYS=4 warm sizes, and a size with no warm pool is built inline on the
// game's event loop — which stalls the PUBLIC game too. Four presets fit.
const GRID_SIZE_GAMES = new Set(['rectangled', 'erectangled']);
const GRID_SIZE_PRESETS = {
  // key      rows x cols per game               label shown in the dashboard
  small:  { rectangled: [6, 5],  erectangled: [6, 5] },
  normal: { rectangled: [8, 6],  erectangled: [9, 7] },
  large:  { rectangled: [10, 7], erectangled: [10, 7] },
  // Short and wide — 8 columns across, 4 rows deep.
  wide:   { rectangled: [4, 8],  erectangled: [4, 8] },
};
const VALID_GRID_SIZES = new Set(Object.keys(GRID_SIZE_PRESETS));

// 'sproutle' is eRecTangled's legacy id and must resolve to the same setting,
// or a streamer whose dropdown says "eRecTangled" would save under one key and
// the game would read the other.
function _normGridGame(gameId) {
  const g = String(gameId || '').trim().toLowerCase();
  if (g === 'sproutle') return 'erectangled';
  return GRID_SIZE_GAMES.has(g) ? g : null;
}

function getGridSize(discordId, gameId) {
  const game = _normGridGame(gameId);
  if (!game) return 'normal';
  const s = streamers[discordId];
  const raw = s && s.gridSizes ? s.gridSizes[game] : null;
  return VALID_GRID_SIZES.has(raw) ? raw : 'normal';
}

function setGridSize(discordId, gameId, value) {
  const s = streamers[discordId];
  if (!s) return null;
  const game = _normGridGame(gameId);
  if (!game) throw new Error('invalid grid_size game: ' + gameId);
  const normalized = String(value || '').trim().toLowerCase();
  if (!VALID_GRID_SIZES.has(normalized)) throw new Error('invalid grid_size: ' + value);
  if (!s.gridSizes || typeof s.gridSizes !== 'object') s.gridSizes = {};
  s.gridSizes[game] = normalized;
  s.updatedAt = new Date().toISOString();
  save();
  return normalized;
}

// Resolved { rows, cols } per game — this is what the game servers actually
// consume, so a preset table change here reaches them on their next poll
// without any game-side deploy.
function getGridSizeDimensions(discordId) {
  const out = {};
  for (const game of GRID_SIZE_GAMES) {
    const preset = getGridSize(discordId, game);
    const dims = GRID_SIZE_PRESETS[preset][game];
    out[game] = { preset, rows: dims[0], cols: dims[1] };
  }
  return out;
}

// Per-streamer fan-club title override. Returned null means the streamer
// hasn't customized — downstream renders fall back to the catalog default
// ('Fan Club'). Empty/null input clears the override.
function getFcTitle(discordId) {
  const s = streamers[discordId];
  return (s && typeof s.fcTitle === 'string' && s.fcTitle) ? s.fcTitle : null;
}

function setFcTitle(discordId, title) {
  const s = streamers[discordId];
  if (!s) return null;
  if (title == null || title === '') {
    delete s.fcTitle;
    s.updatedAt = new Date().toISOString();
    save();
    return s;
  }
  if (typeof title !== 'string') throw new Error('fcTitle must be a string');
  const trimmed = title.trim();
  if (trimmed.length === 0) {
    delete s.fcTitle;
  } else {
    if (trimmed.length > 16) throw new Error('fcTitle must be 16 characters or fewer');
    if (/[ -]/.test(trimmed)) throw new Error('fcTitle contains control characters');
    s.fcTitle = trimmed;
  }
  s.updatedAt = new Date().toISOString();
  save();
  return s;
}

function setSessionDisabled(discordId, disabled) {
  const s = streamers[discordId];
  if (!s) return false;
  s.disableSession = !!disabled;
  s.updatedAt = new Date().toISOString();
  if (disabled && s.currentSession) delete s.currentSession;
  save();
  return true;
}

// NOTE (2026-07-21): the per-streamer `sessionNoRewards` flag was removed.
// It was a dev-iteration switch that never shipped a toggle — nothing called
// the setter and chat-relay never stamped `noRewards` onto outgoing chat, so
// every game's `if (msg.noRewards)` branch was unreachable. Private-session
// rounds now award XP and report ELO/rounds to Word Tycoon exactly like
// public rounds (see the GOAT stream-stats work).

// ── Active TikTok session tracking ─────────────────────────────
// Persist which TikTok usernames each streamer currently has connected, so
// that restoreActiveSessions() can rebuild them after a chat-relay restart.
// Schema: streamer.activeSessions = { '<lowercase-tiktok-username>': { targetGame, connectedAt } }

function _normalizeTk(u) {
  if (!u) return '';
  return String(u).replace(/^@/, '').trim().toLowerCase();
}

function markConnected(discordId, tiktokUsername, targetGame) {
  const s = streamers[discordId];
  if (!s) return;
  const key = _normalizeTk(tiktokUsername);
  if (!key) return;
  if (!s.activeSessions) s.activeSessions = {};
  s.activeSessions[key] = {
    targetGame: targetGame || null,
    connectedAt: new Date().toISOString(),
  };
  save();
}

function markDisconnected(discordId, tiktokUsername) {
  const s = streamers[discordId];
  if (!s || !s.activeSessions) return;
  const key = _normalizeTk(tiktokUsername);
  if (!key) return;
  if (s.activeSessions[key]) {
    delete s.activeSessions[key];
    if (Object.keys(s.activeSessions).length === 0) delete s.activeSessions;
    save();
  }
}

function getActiveSessions() {
  const out = [];
  for (const s of Object.values(streamers)) {
    if (!s.activeSessions) continue;
    for (const [tiktokUsername, sess] of Object.entries(s.activeSessions)) {
      out.push({
        discordId: s.discordId,
        tiktokUsername,
        targetGame: sess.targetGame || null,
        connectedAt: sess.connectedAt,
      });
    }
  }
  return out;
}

// ── Bridge tokens ──────────────────────────────────────────────
// Opaque token a streamer pastes into their local Tycoon Stream Bridge exe.
// Presenting this token over Socket.IO lets the bridge subscribe to the
// streamer's own TikTok chat feed without exposing session auth.
function getBridgeToken(discordId) {
  const s = streamers[discordId];
  if (!s) return null;
  if (!s.bridgeToken) {
    s.bridgeToken = crypto.randomUUID();
    s.updatedAt = new Date().toISOString();
    save();
  }
  return s.bridgeToken;
}

function regenerateBridgeToken(discordId) {
  const s = streamers[discordId];
  if (!s) return null;
  s.bridgeToken = crypto.randomUUID();
  s.updatedAt = new Date().toISOString();
  save();
  return s.bridgeToken;
}

function findByBridgeToken(token) {
  if (!token || typeof token !== 'string') return null;
  for (const s of Object.values(streamers)) {
    if (s.bridgeToken && s.bridgeToken === token) return s;
  }
  return null;
}

// Load on require
load();
// Backfill handles for any pre-existing streamers without one.
for (const id of Object.keys(streamers)) {
  if (!streamers[id].handle) ensureHandle(id);
}


// Player page disable + per-streamer blocklist
// disablePlayerPage: when true, /<handle> player page becomes watch-only.
// OBS overlay /overlay/<handle> stays fully functional.
// blockedPlayers: applies to ALL of this streamer's private games.

function isPlayerPageDisabled(discordId) {
  const s = streamers[discordId];
  return !!(s && s.disablePlayerPage);
}

function setPlayerPageDisabled(discordId, value) {
  const s = streamers[discordId];
  if (!s) return false;
  s.disablePlayerPage = !!value;
  s.updatedAt = new Date().toISOString();
  save();
  return true;
}

// Per-streamer ai_licia avatar browser-source URL. Stored on the streamer
// record (NOT in the goals config) so it survives loading a saved setup —
// setups snapshot/replace the goals config, which would otherwise wipe it.
// New ai_licia overlay widgets auto-fill from this so the streamer never has
// to re-paste the long URL. Only https is accepted; '' clears it.
function getAiliciaUrl(discordId) {
  const s = streamers[discordId];
  return (s && typeof s.ailiciaUrl === 'string') ? s.ailiciaUrl : '';
}

function setAiliciaUrl(discordId, url) {
  const s = streamers[discordId];
  if (!s) return false;
  const u = String(url || '').trim().slice(0, 600);
  s.ailiciaUrl = /^https:\/\//i.test(u) ? u : '';
  s.updatedAt = new Date().toISOString();
  save();
  return true;
}

function getBlockedPlayers(discordId) {
  const s = streamers[discordId];
  if (!s || !Array.isArray(s.blockedPlayers)) return [];
  return s.blockedPlayers.slice();
}

function _normPlatform(p) { return String(p || '').trim().toLowerCase(); }
function _normId(id) { return String(id || '').trim(); }

function isBlocked(discordId, platform, platformUserId) {
  const s = streamers[discordId];
  if (!s || !Array.isArray(s.blockedPlayers)) return false;
  const p = _normPlatform(platform);
  const id = _normId(platformUserId);
  if (!p || !id) return false;
  for (const b of s.blockedPlayers) {
    if (_normPlatform(b.platform) === p && _normId(b.id) === id) return true;
  }
  return false;
}

function addBlockedPlayer(discordId, { platform, id, name }) {
  const s = streamers[discordId];
  if (!s) return null;
  const p = _normPlatform(platform);
  const pid = _normId(id);
  if (!p || !pid) return null;
  if (!Array.isArray(s.blockedPlayers)) s.blockedPlayers = [];
  if (s.blockedPlayers.some(b => _normPlatform(b.platform) === p && _normId(b.id) === pid)) {
    return s.blockedPlayers;
  }
  s.blockedPlayers.push({
    platform: p,
    id: pid,
    name: String(name || '').slice(0, 64),
    blockedAt: Date.now(),
  });
  s.updatedAt = new Date().toISOString();
  save();
  return s.blockedPlayers;
}

function removeBlockedPlayer(discordId, platform, id) {
  const s = streamers[discordId];
  if (!s || !Array.isArray(s.blockedPlayers)) return [];
  const p = _normPlatform(platform);
  const pid = _normId(id);
  const before = s.blockedPlayers.length;
  s.blockedPlayers = s.blockedPlayers.filter(b =>
    !(_normPlatform(b.platform) === p && _normId(b.id) === pid)
  );
  if (s.blockedPlayers.length !== before) {
    s.updatedAt = new Date().toISOString();
    save();
  }
  return s.blockedPlayers;
}

// ── Bot Players (simulated viewers) ─────────────────────────────
// Per-streamer settings for src/bot-players.js. Bots only ever play the
// streamer's private session (never the public game) and earn no rewards.
const VALID_BOT_INTENSITIES = new Set(['chill', 'normal', 'busy']);
const BOT_COUNT_MIN = 1;
const BOT_COUNT_MAX = 8;
// Game families bots can be routed to (mirrors GAME_FAMILY in src/bot-players.js).
// Stored as a family list, so 'searchle' covers Subtextle and Subtextle Grid.
const VALID_BOT_GAMES = ['searchle', 'word500', 'colour500'];

// Legacy records (saved before routing existed) have no `games` key — they ran
// in every eligible game, so absent means "all", not "none".
function normalizeBotGames(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (!Array.isArray(value)) return fallback;
  return VALID_BOT_GAMES.filter((g) => value.includes(g));
}

function getBotPlayers(discordId) {
  const s = streamers[discordId];
  const cfg = (s && s.botPlayers) || {};
  return {
    enabled: !!cfg.enabled,
    count: Math.max(BOT_COUNT_MIN, Math.min(BOT_COUNT_MAX, Number(cfg.count) || 4)),
    intensity: VALID_BOT_INTENSITIES.has(cfg.intensity) ? cfg.intensity : 'normal',
    games: normalizeBotGames(cfg.games, [...VALID_BOT_GAMES]),
  };
}

function setBotPlayers(discordId, { enabled, count, intensity, games } = {}) {
  const s = streamers[discordId];
  if (!s) return null;
  const cur = getBotPlayers(discordId);
  const next = {
    enabled: enabled === undefined ? cur.enabled : !!enabled,
    count: count === undefined ? cur.count : Math.max(BOT_COUNT_MIN, Math.min(BOT_COUNT_MAX, Number(count) || cur.count)),
    intensity: intensity === undefined ? cur.intensity : (VALID_BOT_INTENSITIES.has(intensity) ? intensity : cur.intensity),
    games: normalizeBotGames(games, cur.games),
  };
  s.botPlayers = next;
  s.updatedAt = new Date().toISOString();
  save();
  return next;
}

// Public-facing settings consumed by games via /api/streamer-handles.
function getPublicSettings(discordId) {
  const s = streamers[discordId];
  if (!s) return null;
  return {
    handle: s.handle,
    disablePlayerPage: !!s.disablePlayerPage,
    searchleLanguage: getSearchleLanguage(discordId),
    gridSizes: getGridSizeDimensions(discordId),
    blockedPlayers: Array.isArray(s.blockedPlayers)
      ? s.blockedPlayers.map(b => ({ platform: _normPlatform(b.platform), id: _normId(b.id) }))
      : [],
  };
}

module.exports = {
  getFcTitle,
  setFcTitle,
  isWhitelisted,
  get,
  getAll,
  whitelist,
  unwhitelist,
  setTiktokUsername,
  getTiktokUsernames,
  findByTiktokUsername,
  MAX_TIKTOK_ACCOUNTS,
  setActiveGame,
  setActiveGames,
  getActiveGames,
  getActiveStreamers,
  getBridgeToken,
  regenerateBridgeToken,
  findByBridgeToken,
  load,
  markConnected,
  markDisconnected,
  getActiveSessions,
  ensureHandle,
  getByHandle,
  markSessionStart,
  markSessionEnd,
  getCurrentSession,
  isSessionDisabled,
  isConnectBlocked,
  setSessionDisabled,
  setWantsConnected,
  setConnectBlocked,
  getWordFrequency,
  setWordFrequency,
  getWordLength,
  setWordLength,
  getSearchleLanguage,
  setSearchleLanguage,
  getGridSize,
  setGridSize,
  getGridSizeDimensions,
  GRID_SIZE_PRESETS,
  VALID_GRID_SIZES,
  isPlayerPageDisabled,
  setPlayerPageDisabled,
  getAiliciaUrl,
  setAiliciaUrl,
  getBlockedPlayers,
  isBlocked,
  addBlockedPlayer,
  removeBlockedPlayer,
  getPublicSettings,
  getBotPlayers,
  setBotPlayers,
  DEFAULT_ACTIVE_GAME,
};
