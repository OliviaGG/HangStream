/**
 * config.js — persisted bridge settings.
 *
 * Stored next to the exe (or next to server.js in dev) as config.json so
 * double-clicking the exe preserves the streamer's bridge token + source
 * toggles across runs.
 */

const fs = require('fs');
const path = require('path');

const DEFAULTS = {
  // wordtycoon.live, NOT wordgame.live — the Cloudflare worker fronting
  // wordgame.live doesn't proxy /socket.io/, so socket connections fail
  // silently. wordtycoon.live passes socket.io through cleanly.
  cloudUrl: 'https://wordtycoon.live',
  cloudToken: '',
  tikfinityEnabled: true,
  cloudEnabled: false,
  primary: 'tikfinity',  // 'tikfinity' | 'cloud'
};

function configPath() {
  // When packaged via `pkg`, process.execPath points to the exe on disk; the
  // snapshot fs is read-only. Persist next to the exe so the user can open
  // config.json in Notepad if they ever want to inspect/edit it.
  const baseDir = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');
  return path.join(baseDir, 'config.json');
}

function load() {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8');
    const parsed = JSON.parse(raw);
    const merged = { ...DEFAULTS, ...parsed };
    // Migrate: old configs pointed at wordgame.live, but that domain's CF
    // worker drops /socket.io/. Silently rewrite to the working domain.
    if (merged.cloudUrl === 'https://wordgame.live' || merged.cloudUrl === 'http://wordgame.live') {
      merged.cloudUrl = DEFAULTS.cloudUrl;
    }
    return merged;
  } catch (err) {
    return { ...DEFAULTS };
  }
}

function save(partial) {
  const current = load();
  const next = { ...current, ...partial };
  try {
    fs.writeFileSync(configPath(), JSON.stringify(next, null, 2));
  } catch (err) {
    console.warn(`[Bridge] Failed to save config: ${err.message}`);
  }
  return next;
}

module.exports = { load, save, DEFAULTS, configPath };
