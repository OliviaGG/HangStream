// Persistence for server-authoritative game rounds.
//
// Word Tycoon keeps this in per-game JSON files (`data/current-game.json`,
// `data/daily-rounds.json`). HangStream is deliberately a single SQLite-backed
// process, so the same information lives in two small tables added in db.js:
//
//   game_rounds        serialized Game state per streamer x game
//   game_daily_played  which daily puzzle each room has already consumed
//
// Every function tolerates a missing database (e.g. in unit tests) and simply
// resolves to null / false rather than throwing.

const db = require('../db');

function get(sql, params = []) {
  return new Promise((resolve) => {
    try {
      db.get(sql, params, (err, row) => resolve(err ? null : row));
    } catch (_) { resolve(null); }
  });
}

function all(sql, params = []) {
  return new Promise((resolve) => {
    try {
      db.all(sql, params, (err, rows) => resolve(err ? [] : (rows || [])));
    } catch (_) { resolve([]); }
  });
}

function run(sql, params = []) {
  return new Promise((resolve) => {
    try {
      db.run(sql, params, function (err) { resolve(!err); });
    } catch (_) { resolve(false); }
  });
}

/** Load the last serialized state for a room, or null. */
async function loadRound(streamerId, gameId) {
  const row = await get(
    'SELECT state, is_daily, daily_date FROM game_rounds WHERE streamer_id = ? AND game_id = ?',
    [streamerId || 'public', gameId]
  );
  if (!row || !row.state) return null;
  try {
    return JSON.parse(row.state);
  } catch (_) { return null; }
}

/** Persist a room's serialized state (upsert). */
async function saveRound(streamerId, gameId, state) {
  const payload = JSON.stringify(state || {});
  const isDaily = state && state.isDaily ? 1 : 0;
  const dailyDate = (state && state.dailyDate) || null;
  return run(
    `INSERT INTO game_rounds (streamer_id, game_id, state, is_daily, daily_date, updated_at)
     VALUES (?, ?, ?, ?, ?, strftime('%s','now'))
     ON CONFLICT(streamer_id, game_id) DO UPDATE SET
       state = excluded.state,
       is_daily = excluded.is_daily,
       daily_date = excluded.daily_date,
       updated_at = excluded.updated_at`,
    [streamerId || 'public', gameId, payload, isDaily, dailyDate]
  );
}

/** Has this room already played today's daily puzzle? */
async function hasPlayedDaily(gameId, dailyDate, streamerId = 'public') {
  const row = await get(
    'SELECT 1 AS played FROM game_daily_played WHERE game_id = ? AND daily_date = ? AND streamer_id = ?',
    [gameId, dailyDate, streamerId || 'public']
  );
  return Boolean(row && row.played);
}

/** Mark today's daily puzzle as consumed for this room. */
async function markDailyPlayed(gameId, dailyDate, streamerId = 'public', puzzleId = null) {
  return run(
    `INSERT OR REPLACE INTO game_daily_played (game_id, daily_date, streamer_id, puzzle_id, completed_at)
     VALUES (?, ?, ?, ?, strftime('%s','now'))`,
    [gameId, dailyDate, streamerId || 'public', puzzleId]
  );
}

/** Recent daily winners/puzzles for a game, newest first. */
async function dailyHistory(gameId, limit = 30) {
  return all(
    `SELECT daily_date, streamer_id, puzzle_id, completed_at
       FROM game_daily_played
      WHERE game_id = ?
      ORDER BY completed_at DESC
      LIMIT ?`,
    [gameId, limit]
  );
}

module.exports = {
  loadRound,
  saveRound,
  hasPlayedDaily,
  markDailyPlayed,
  dailyHistory,
};
