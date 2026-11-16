/**
 * streamer-setups.js — Named snapshots of a streamer's overlay config.
 *
 * A "setup" is a saved copy of the streamer's Goals & Milestones overlay
 * config (the same object that /api/streamer/goals PUTs — widgets, layout,
 * animated background, widgetOrder). Streamers save the config they've built
 * under a name and re-apply it later, e.g. one setup per game or show format.
 *
 * We deliberately snapshot only `config`, never runtime `state` (goal
 * progress, milestone counters). Applying a setup routes the stored config
 * back through streamerGoals.setConfig(), which validates it and reconciles
 * widget state exactly like a normal dashboard save.
 *
 * Persisted to data/streamer-setups.json. Mirrors the streamer-rules.js
 * pattern (single JSON file, in-memory map, write-through on every mutation).
 *
 * Store shape:
 *   { [discordId]: [ { id, name, game, config, createdAt, updatedAt } ] }
 *
 * `game` is the streamer's active game id at save time. Applying a setup
 * switches the active game back (via the normal game-change flow) so the
 * overlay resolves per-game widget positions/background for the right game —
 * without it, loading a setup drew widgets from whatever game stayed active.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'streamer-setups.json');

// In-memory store: { [discordId]: Setup[] }
let setupsByStreamer = {};

const MAX_SETUPS_PER_STREAMER = 20;
const MAX_NAME_LENGTH = 60;

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    setupsByStreamer = JSON.parse(raw) || {};
    const total = Object.values(setupsByStreamer).reduce((n, arr) => n + (arr?.length || 0), 0);
    console.log(`[StreamerSetups] Loaded ${total} setup(s) for ${Object.keys(setupsByStreamer).length} streamer(s)`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      setupsByStreamer = {};
      save();
      console.log('[StreamerSetups] Created empty setups file');
    } else {
      console.error('[StreamerSetups] Failed to load:', err.message);
      setupsByStreamer = {};
    }
  }
}

function save() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(setupsByStreamer, null, 2));
  } catch (err) {
    console.error('[StreamerSetups] Failed to save:', err.message);
  }
}

function _clone(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function _clean(name) {
  return String(name || '').trim().slice(0, MAX_NAME_LENGTH);
}

// Public list view: no `config` blob, just enough for the dashboard picker.
function _summary(s) {
  return {
    id: s.id,
    name: s.name,
    game: s.game || null,
    widgetCount: Array.isArray(s.config?.widgets) ? s.config.widgets.length : 0,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
  };
}

/**
 * List a streamer's saved setups (summaries only, newest first).
 */
function listSetups(streamerId) {
  if (!streamerId) return [];
  const arr = setupsByStreamer[streamerId] || [];
  return arr
    .slice()
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')))
    .map(_summary);
}

/**
 * Full setup record (including config) by id, or null.
 */
function getSetup(streamerId, id) {
  if (!streamerId || !id) return null;
  return (setupsByStreamer[streamerId] || []).find(s => s.id === id) || null;
}

/**
 * Snapshot `config` under `name` as a new setup. `config` should be the
 * streamer's live, already-validated overlay config (deep-cloned here so
 * later dashboard edits never mutate the saved copy). `game` is the active
 * game id at save time (restored on apply; null when unknown). Throws when
 * the per-streamer cap is reached. Returns the new setup's summary.
 */
function saveSetup(streamerId, name, config, game) {
  if (!streamerId) throw new Error('streamerId required');
  if (!config || typeof config !== 'object') throw new Error('config required');

  const list = setupsByStreamer[streamerId] || (setupsByStreamer[streamerId] = []);
  if (list.length >= MAX_SETUPS_PER_STREAMER) {
    throw new Error(`Setup limit reached (max ${MAX_SETUPS_PER_STREAMER}). Delete one first.`);
  }

  const now = new Date().toISOString();
  const setup = {
    id: crypto.randomUUID(),
    name: _clean(name) || 'Untitled setup',
    game: game ? String(game).trim().slice(0, 40) : null,
    config: _clone(config),
    createdAt: now,
    updatedAt: now,
  };
  list.push(setup);
  save();
  return _summary(setup);
}

/**
 * Delete a setup by id. Returns true if something was removed.
 */
function deleteSetup(streamerId, id) {
  if (!streamerId || !id) return false;
  const list = setupsByStreamer[streamerId];
  if (!list) return false;
  const idx = list.findIndex(s => s.id === id);
  if (idx === -1) return false;
  list.splice(idx, 1);
  if (list.length === 0) delete setupsByStreamer[streamerId];
  save();
  return true;
}

/**
 * Drop all setups for a streamer (admin / unwhitelist cleanup).
 */
function clearStreamer(streamerId) {
  if (setupsByStreamer[streamerId]) {
    delete setupsByStreamer[streamerId];
    save();
  }
}

load();

module.exports = {
  listSetups,
  getSetup,
  saveSetup,
  deleteSetup,
  clearStreamer,
  MAX_SETUPS_PER_STREAMER,
  MAX_NAME_LENGTH,
};
