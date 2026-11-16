/**
 * win-tallies.js — Per-streamer running win counts for the Win Card widget.
 *
 * The Win Card's leaderboard has always shown `topPlayers` from the game-win
 * payload — i.e. THIS ROUND'S points. Streamers asked for a standings board
 * instead: who has won the most games while the stream has been running, and
 * optionally a board that survives across streams.
 *
 * Two independent counters per player, both incremented by the same win:
 *   session — the streamer's "since I last cleared it" board
 *   saved   — the long-running / all-time board
 * NEITHER auto-resets. A stream ending does NOT clear the session count (that
 * was an explicit product call — streamers wanted to decide when a "session"
 * ends, e.g. across a multi-part stream or a dropped TikTok connection). Both
 * are cleared only from the dashboard's Reset buttons.
 *
 * Counts are kept per game so a Win Card filtered to one game shows that
 * game's standings; the cross-game total is summed at read time.
 *
 * Persisted to data/streamer-win-tallies.json (debounced) so an OBS reload,
 * a PM2 restart, or a deploy never wipes a streamer's board.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'streamer-win-tallies.json');
const SAVE_DEBOUNCE_MS = 1500;

// Per streamer, per game. Above this we prune the least-decorated players
// (fewest saved wins, oldest win first) so a long-running board can't grow
// without bound from drive-by viewers.
const MAX_PLAYERS_PER_GAME = 300;
const MAX_ROWS = 10;

// Collapse repeat game-win emits for the same player+game. `${streamerId}|
// ${gameId}|${playerKey}` → last counted timestamp.
const DEDUPE_WINDOW_MS = 5000;
const _recentWins = new Map();

let io = null;

// { [streamerId]: { games: { [gameId]: { gameName, players: { [key]: entry } } } } }
// entry = { platform, platformUserId, username, displayName, profilePic,
//           session, saved, lastWin }
let byStreamer = {};

let _saveTimer = null;

function setIo(socketIO) { io = socketIO; }

// ── Persistence ─────────────────────────────────────────────────────
function load() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {};
    byStreamer = _migrate(parsed);
    const n = Object.keys(byStreamer).length;
    console.log(`[WinTallies] Loaded win tallies for ${n} streamer(s)`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      byStreamer = {};
      save();
      console.log('[WinTallies] Created empty tally file');
    } else {
      console.error('[WinTallies] Failed to load:', err.message);
      byStreamer = {};
    }
  }
}

// Defensive re-shape on load — a hand-edited or half-written file must not
// take the win pipeline down.
function _migrate(parsed) {
  const out = {};
  for (const streamerId of Object.keys(parsed || {})) {
    const src = parsed[streamerId];
    if (!src || typeof src !== 'object') continue;
    const games = {};
    for (const gameId of Object.keys(src.games || {})) {
      const g = src.games[gameId];
      if (!g || typeof g !== 'object') continue;
      const players = {};
      for (const key of Object.keys(g.players || {})) {
        const p = g.players[key];
        if (!p || typeof p !== 'object') continue;
        const session = Math.max(0, parseInt(p.session, 10) || 0);
        const saved = Math.max(0, parseInt(p.saved, 10) || 0);
        if (!session && !saved) continue;
        players[key] = {
          platform: p.platform ? String(p.platform) : null,
          platformUserId: p.platformUserId ? String(p.platformUserId) : null,
          username: p.username ? String(p.username).slice(0, 64) : null,
          displayName: p.displayName ? String(p.displayName).slice(0, 64) : null,
          profilePic: p.profilePic ? String(p.profilePic).slice(0, 512) : null,
          session,
          saved,
          lastWin: Number(p.lastWin) || 0,
        };
      }
      games[String(gameId)] = {
        gameName: g.gameName ? String(g.gameName).slice(0, 64) : null,
        players,
      };
    }
    out[String(streamerId)] = { games };
  }
  return out;
}

function save() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(byStreamer, null, 2));
  } catch (err) {
    console.error('[WinTallies] Failed to save:', err.message);
  }
}

function _scheduleSave() {
  if (_saveTimer) return;
  _saveTimer = setTimeout(() => { _saveTimer = null; save(); }, SAVE_DEBOUNCE_MS);
}

/** Flush any pending debounced write (called on shutdown). */
function flush() {
  if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
  save();
}

// ── Helpers ─────────────────────────────────────────────────────────
function _gameId(game) {
  const id = String(game || '').trim().toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(id) ? id : null;
}

function _playerKey(winner) {
  const uid = winner.platformUserId || winner.id;
  if (!uid) return null;
  const platform = String(winner.platform || 'unknown').toLowerCase();
  return `${platform}:${String(uid).toLowerCase()}`;
}

function _prune(bucket) {
  const keys = Object.keys(bucket.players);
  if (keys.length <= MAX_PLAYERS_PER_GAME) return;
  keys
    .sort((a, b) => {
      const pa = bucket.players[a], pb = bucket.players[b];
      return (pa.saved - pb.saved) || (pa.session - pb.session) || (pa.lastWin - pb.lastWin);
    })
    .slice(0, keys.length - MAX_PLAYERS_PER_GAME)
    .forEach(k => { delete bucket.players[k]; });
}

// ── Record ──────────────────────────────────────────────────────────
/**
 * Count one win for a streamer's boards. Returns true if it was counted.
 * Safe to call with junk — anything unidentifiable is silently ignored so a
 * malformed payload can never break the win broadcast.
 */
function recordWin({ streamerId, game, gameName, winner }) {
  if (!streamerId || !winner) return false;
  const gid = _gameId(game);
  if (!gid) return false;
  const key = _playerKey(winner);
  if (!key) return false;

  // Some game servers emit game-win on more than one path for a single round
  // (e.g. a session win that also completes the daily). Nobody legitimately
  // wins the same game twice within a few seconds, so collapse repeats rather
  // than let a double emit quietly inflate someone's board.
  const dedupeKey = `${streamerId}|${gid}|${key}`;
  const last = _recentWins.get(dedupeKey);
  const now = Date.now();
  if (last && now - last < DEDUPE_WINDOW_MS) return false;
  _recentWins.set(dedupeKey, now);
  if (_recentWins.size > 500) {
    for (const [k, t] of _recentWins) if (now - t > DEDUPE_WINDOW_MS) _recentWins.delete(k);
  }

  if (!byStreamer[streamerId]) byStreamer[streamerId] = { games: {} };
  const games = byStreamer[streamerId].games;
  if (!games[gid]) games[gid] = { gameName: null, players: {} };
  const bucket = games[gid];
  if (gameName) bucket.gameName = String(gameName).slice(0, 64);

  const existing = bucket.players[key];
  if (existing) {
    existing.session += 1;
    existing.saved += 1;
    existing.lastWin = Date.now();
    // Refresh identity — display names and avatars change between streams.
    if (winner.username) existing.username = String(winner.username).slice(0, 64);
    if (winner.displayName) existing.displayName = String(winner.displayName).slice(0, 64);
    if (winner.profilePic) existing.profilePic = String(winner.profilePic).slice(0, 512);
  } else {
    bucket.players[key] = {
      platform: winner.platform ? String(winner.platform).toLowerCase() : null,
      platformUserId: String(winner.platformUserId || winner.id),
      username: winner.username ? String(winner.username).slice(0, 64) : null,
      displayName: winner.displayName ? String(winner.displayName).slice(0, 64)
        : (winner.username ? String(winner.username).slice(0, 64) : 'Anon'),
      profilePic: winner.profilePic ? String(winner.profilePic).slice(0, 512) : null,
      session: 1,
      saved: 1,
      lastWin: Date.now(),
    };
    _prune(bucket);
  }

  _scheduleSave();
  return true;
}

// ── Read ────────────────────────────────────────────────────────────
function _rowsFrom(playerMap, mode, limit) {
  const field = mode === 'saved' ? 'saved' : 'session';
  return Object.values(playerMap)
    .filter(p => p[field] > 0)
    .sort((a, b) => b[field] - a[field] || b.lastWin - a.lastWin)
    .slice(0, limit)
    .map((p, i) => ({
      rank: i + 1,
      platform: p.platform,
      platformUserId: p.platformUserId,
      username: p.username,
      displayName: p.displayName || p.username || 'Anon',
      profilePic: p.profilePic,
      wins: p[field],
    }));
}

/** Merge every game's players into one map, summing both counters. */
function _mergeAllGames(streamerId) {
  const entry = byStreamer[streamerId];
  const merged = {};
  if (!entry) return merged;
  for (const gid of Object.keys(entry.games)) {
    const players = entry.games[gid].players;
    for (const key of Object.keys(players)) {
      const p = players[key];
      const m = merged[key];
      if (m) {
        m.session += p.session;
        m.saved += p.saved;
        if (p.lastWin > m.lastWin) {
          m.lastWin = p.lastWin;
          m.displayName = p.displayName;
          m.profilePic = p.profilePic;
          m.username = p.username;
        }
      } else {
        merged[key] = { ...p };
      }
    }
  }
  return merged;
}

/**
 * Board for one game (or all games when gameId is falsy), in both modes.
 * Both modes ship together so the overlay can switch the Win Card's
 * "List shows" setting with no round-trip.
 */
function getBoard(streamerId, gameId, limit = MAX_ROWS) {
  const n = Math.max(1, Math.min(MAX_ROWS, parseInt(limit, 10) || MAX_ROWS));
  const gid = _gameId(gameId);
  const players = gid
    ? (byStreamer[streamerId]?.games?.[gid]?.players || {})
    : _mergeAllGames(streamerId);
  return {
    session: _rowsFrom(players, 'session', n),
    saved: _rowsFrom(players, 'saved', n),
  };
}

/**
 * Payload attached to a streamer's game-win event. Carries the board for the
 * game that was just won AND the cross-game board, so Win Cards with and
 * without a game filter both render from the same emit.
 */
function snapshotForWin(streamerId, gameId, limit = MAX_ROWS) {
  const gid = _gameId(gameId);
  return {
    gameId: gid,
    game: getBoard(streamerId, gid, limit),
    all: getBoard(streamerId, null, limit),
    ts: Date.now(),
  };
}

/**
 * Every board this streamer has, keyed by game, plus the cross-game total.
 * Sent when an overlay joins (so an always-on Win Card renders standings
 * before the first win of the stream) and after a reset (so every card,
 * including game-filtered ones, drops its now-stale rows).
 */
function fullSnapshot(streamerId, limit = MAX_ROWS) {
  const entry = byStreamer[streamerId];
  const games = {};
  for (const gid of Object.keys(entry?.games || {})) {
    games[gid] = getBoard(streamerId, gid, limit);
  }
  return { full: true, games, all: getBoard(streamerId, null, limit), ts: Date.now() };
}

/** Dashboard summary: totals + the top rows in both modes. */
function getSummary(streamerId, gameId = null, limit = MAX_ROWS) {
  const gid = _gameId(gameId);
  const players = gid
    ? (byStreamer[streamerId]?.games?.[gid]?.players || {})
    : _mergeAllGames(streamerId);
  const vals = Object.values(players);
  return {
    gameId: gid,
    players: vals.length,
    sessionWins: vals.reduce((a, p) => a + p.session, 0),
    savedWins: vals.reduce((a, p) => a + p.saved, 0),
    sessionPlayers: vals.filter(p => p.session > 0).length,
    board: getBoard(streamerId, gid, limit),
    ts: Date.now(),
  };
}

// ── Reset ───────────────────────────────────────────────────────────
/**
 * which: 'session' | 'saved' | 'both'
 * gameId: null clears every game for this streamer.
 * Clearing 'saved' also clears 'session' — a saved count can never be lower
 * than the session count it contains, and leaving session behind would show
 * a board where "all-time" is smaller than "session".
 */
function reset(streamerId, which = 'session', gameId = null) {
  const entry = byStreamer[streamerId];
  if (!entry) return { ok: true, cleared: 0 };
  const gid = _gameId(gameId);
  const gameIds = gid ? [gid] : Object.keys(entry.games);
  const clearSaved = which === 'saved' || which === 'both';
  let cleared = 0;

  for (const g of gameIds) {
    const bucket = entry.games[g];
    if (!bucket) continue;
    for (const key of Object.keys(bucket.players)) {
      const p = bucket.players[key];
      if (clearSaved) {
        cleared += p.saved;
        delete bucket.players[key];
      } else if (p.session > 0) {
        cleared += p.session;
        p.session = 0;
        // A player with nothing left on either board is dead weight.
        if (p.saved <= 0) delete bucket.players[key];
      }
    }
    if (!Object.keys(bucket.players).length) delete entry.games[g];
  }

  _scheduleSave();
  broadcast(streamerId);
  return { ok: true, cleared };
}

/**
 * Push the current boards to the streamer's goals overlay. Used after a reset
 * so an always-on-screen Win Card updates without waiting for the next win.
 */
function broadcast(streamerId) {
  if (!io || !streamerId) return;
  io.to(`goals:${streamerId}`).emit('win-tally-update', fullSnapshot(streamerId));
}

module.exports = {
  setIo,
  load,
  save,
  flush,
  recordWin,
  getBoard,
  getSummary,
  snapshotForWin,
  fullSnapshot,
  reset,
  broadcast,
};
