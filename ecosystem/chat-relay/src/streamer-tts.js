/**
 * streamer-tts.js — Per-streamer TTS settings and mute list.
 *
 * Persisted to data/streamer-tts.json. Mirrors the streamers.js /
 * streamer-rules.js pattern (single JSON file, in-memory map,
 * write-through on every mutation).
 *
 * Shape:
 * {
 *   [discordId]: {
 *     settings: { enabled, trigger_mode, trigger_symbol, voice_id|null },
 *     muted: [viewer_key, ...]   // free-form strings the streamer typed
 *   }
 * }
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'streamer-tts.json');

const DEFAULT_SETTINGS = {
  enabled: false,
  trigger_mode: 'prefix',   // 'prefix' | 'all'
  trigger_symbol: '.',
  voice_id: null,           // null → server picks a default from voice-tts catalog
};

let store = {};

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    store = JSON.parse(raw) || {};
    console.log(`[StreamerTTS] Loaded settings for ${Object.keys(store).length} streamer(s)`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      store = {};
      save();
      console.log('[StreamerTTS] Created empty TTS file');
    } else {
      console.error('[StreamerTTS] Failed to load:', err.message);
      store = {};
    }
  }
}

function save() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2));
  } catch (err) {
    console.error('[StreamerTTS] Failed to save:', err.message);
  }
}

function _ensure(streamerId) {
  if (!store[streamerId]) {
    store[streamerId] = { settings: { ...DEFAULT_SETTINGS }, muted: [] };
  } else {
    // Backfill any new default fields if added in future
    store[streamerId].settings = { ...DEFAULT_SETTINGS, ...store[streamerId].settings };
    if (!Array.isArray(store[streamerId].muted)) store[streamerId].muted = [];
  }
  return store[streamerId];
}

function getSettings(streamerId) {
  if (!streamerId) return { ...DEFAULT_SETTINGS };
  return { ..._ensure(streamerId).settings };
}

/**
 * Apply a partial settings patch. Unknown keys are dropped; values are
 * normalized so callers can't poison the store with garbage.
 */
function setSettings(streamerId, patch) {
  if (!streamerId) throw new Error('streamerId required');
  if (!patch || typeof patch !== 'object') patch = {};

  const entry = _ensure(streamerId);
  const next = { ...entry.settings };

  if ('enabled' in patch) next.enabled = !!patch.enabled;
  if ('trigger_mode' in patch) {
    next.trigger_mode = patch.trigger_mode === 'all' ? 'all' : 'prefix';
  }
  if ('trigger_symbol' in patch) {
    const sym = String(patch.trigger_symbol || '').trim().slice(0, 4);
    next.trigger_symbol = sym || '.';
  }
  if ('voice_id' in patch) {
    const vid = patch.voice_id == null ? null : String(patch.voice_id).trim().slice(0, 80) || null;
    next.voice_id = vid;
  }

  entry.settings = next;
  save();
  return { ...next };
}

function getMuted(streamerId) {
  if (!streamerId) return [];
  return [..._ensure(streamerId).muted];
}

function addMute(streamerId, viewerKey) {
  if (!streamerId) throw new Error('streamerId required');
  const key = String(viewerKey || '').trim().slice(0, 80);
  if (!key) return getMuted(streamerId);
  const entry = _ensure(streamerId);
  if (!entry.muted.includes(key)) {
    entry.muted.push(key);
    save();
  }
  return [...entry.muted];
}

function removeMute(streamerId, viewerKey) {
  if (!streamerId) return [];
  const key = String(viewerKey || '').trim();
  const entry = _ensure(streamerId);
  const i = entry.muted.indexOf(key);
  if (i !== -1) {
    entry.muted.splice(i, 1);
    save();
  }
  return [...entry.muted];
}

/**
 * Decide whether a chat message should be spoken for a given streamer.
 * Returns the text to synthesize (with trigger symbol stripped if prefix
 * mode), or null if the message should be skipped.
 */
function shouldSpeak(streamerId, message, viewerCandidateKeys) {
  const s = getSettings(streamerId);
  if (!s.enabled) return null;

  const text = String(message || '').trim();
  if (!text) return null;

  // Mute check — viewer can match by any of the candidate keys (e.g.
  // "tiktok:alice", "alice", "@alice"). Case-insensitive contains.
  const muted = getMuted(streamerId).map(k => k.toLowerCase());
  if (muted.length && Array.isArray(viewerCandidateKeys)) {
    for (const cand of viewerCandidateKeys) {
      if (!cand) continue;
      const lc = String(cand).toLowerCase();
      if (muted.some(m => lc === m || lc.includes(m) || m.includes(lc))) return null;
    }
  }

  if (s.trigger_mode === 'all') return text;

  // Prefix mode — message must start with trigger_symbol (default '.')
  const sym = s.trigger_symbol || '.';
  if (!text.startsWith(sym)) return null;
  const stripped = text.slice(sym.length).trim();
  return stripped || null;
}

load();

module.exports = {
  getSettings,
  setSettings,
  getMuted,
  addMute,
  removeMute,
  shouldSpeak,
  DEFAULT_SETTINGS,
};
