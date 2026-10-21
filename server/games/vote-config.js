// Persistence for per-streamer next-game vote config (game-vote.js).
//
// Word Tycoon keeps this inside the streamer's `gameVote` widget config. Here it
// is one JSON row per streamer in the `game_vote_config` table, so a rotation
// survives a restart. Like rounds.js, every function tolerates a missing
// database and resolves to null / false rather than throwing.

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

/** Vote config for a streamer, or null when they have none / it is disabled. */
async function loadVoteConfig(streamerId) {
  const row = await get(
    'SELECT config, enabled FROM game_vote_config WHERE streamer_id = ?',
    [streamerId || 'public']
  );
  if (!row || !row.enabled) return null;
  try {
    return JSON.parse(row.config);
  } catch (_) { return null; }
}

/** Create or replace a streamer's vote config. `enabled` defaults to true. */
async function saveVoteConfig(streamerId, config, enabled = true) {
  return run(
    `INSERT INTO game_vote_config (streamer_id, config, enabled, updated_at)
     VALUES (?, ?, ?, strftime('%s','now'))
     ON CONFLICT(streamer_id) DO UPDATE SET
       config = excluded.config,
       enabled = excluded.enabled,
       updated_at = excluded.updated_at`,
    [streamerId || 'public', JSON.stringify(config || {}), enabled ? 1 : 0]
  );
}

/** Remove a streamer's vote config (disables the vote for them). */
async function clearVoteConfig(streamerId) {
  return run('DELETE FROM game_vote_config WHERE streamer_id = ?', [streamerId || 'public']);
}

/** Every streamer with the vote enabled — polled by game-vote.js's tick. */
async function listVoteStreamers() {
  const rows = await all('SELECT streamer_id FROM game_vote_config WHERE enabled = 1');
  return rows.map((r) => r.streamer_id);
}

module.exports = {
  loadVoteConfig,
  saveVoteConfig,
  clearVoteConfig,
  listVoteStreamers,
};
