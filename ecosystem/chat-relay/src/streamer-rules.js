/**
 * streamer-rules.js — Per-streamer Actions & Events rule store.
 *
 * MVP triggers: gift, gift-specific, chat-command
 * MVP actions:  sound, overlay-image
 *
 * Persisted to data/streamer-rules.json. Mirrors the streamers.js pattern
 * (single JSON file, in-memory map, write-through on every mutation).
 *
 * Rule shape:
 * {
 *   id: string,
 *   name: string,
 *   enabled: boolean,
 *   trigger: 'gift' | 'gift-specific' | 'chat-command',
 *   match: {                         // trigger-specific match criteria
 *     giftName?: string,             // case-insensitive contains, gift-specific only
 *     minCoins?: number,             // gift / gift-specific
 *     command?: string,              // chat-command, leading '!' optional, case-insensitive
 *   },
 *   cooldownMs?: number,             // per-rule cooldown (default 0)
 *   actions: Array<{
 *     type: 'sound' | 'overlay-image',
 *     url: string,                   // absolute or root-relative URL
 *     durationMs?: number,           // overlay-image only (default 4000)
 *     volume?: number,               // sound only, 0..1 (default 1)
 *   }>
 * }
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'streamer-rules.json');

// In-memory store: { [discordId]: Rule[] }
let rulesByStreamer = {};

const VALID_TRIGGERS = new Set(['gift', 'gift-specific', 'chat-command']);
const VALID_ACTION_TYPES = new Set(['sound', 'overlay-image']);
const MAX_RULES_PER_STREAMER = 100;
const MAX_ACTIONS_PER_RULE = 8;
const MAX_URL_LENGTH = 2048;

function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    rulesByStreamer = JSON.parse(raw) || {};
    const total = Object.values(rulesByStreamer).reduce((n, arr) => n + (arr?.length || 0), 0);
    console.log(`[StreamerRules] Loaded ${total} rule(s) for ${Object.keys(rulesByStreamer).length} streamer(s)`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      rulesByStreamer = {};
      save();
      console.log('[StreamerRules] Created empty rules file');
    } else {
      console.error('[StreamerRules] Failed to load:', err.message);
      rulesByStreamer = {};
    }
  }
}

function save() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(rulesByStreamer, null, 2));
  } catch (err) {
    console.error('[StreamerRules] Failed to save:', err.message);
  }
}

function getRules(streamerId) {
  if (!streamerId) return [];
  return rulesByStreamer[streamerId] || [];
}

/**
 * Validate and normalize a single rule. Throws on invalid input.
 */
function _validateRule(raw, { existingId } = {}) {
  if (!raw || typeof raw !== 'object') throw new Error('Rule must be an object');

  const trigger = String(raw.trigger || '').trim();
  if (!VALID_TRIGGERS.has(trigger)) {
    throw new Error(`Invalid trigger: ${trigger}. Must be one of: ${[...VALID_TRIGGERS].join(', ')}`);
  }

  const name = String(raw.name || '').trim().slice(0, 80) || 'Untitled rule';
  const enabled = raw.enabled !== false;
  const cooldownMs = Math.max(0, Math.min(3_600_000, Number(raw.cooldownMs) || 0));

  // Match criteria (trigger-specific)
  const match = {};
  if (trigger === 'gift') {
    if (raw.match?.minCoins != null) {
      const m = Math.max(0, Number(raw.match.minCoins) || 0);
      if (m > 0) match.minCoins = m;
    }
  } else if (trigger === 'gift-specific') {
    const gn = String(raw.match?.giftName || '').trim().slice(0, 80);
    if (!gn) throw new Error('gift-specific trigger requires match.giftName');
    match.giftName = gn;
    if (raw.match?.minCoins != null) {
      const m = Math.max(0, Number(raw.match.minCoins) || 0);
      if (m > 0) match.minCoins = m;
    }
  } else if (trigger === 'chat-command') {
    let cmd = String(raw.match?.command || '').trim().slice(0, 40).toLowerCase();
    if (!cmd) throw new Error('chat-command trigger requires match.command');
    if (cmd.startsWith('!')) cmd = cmd.slice(1);
    if (!/^[a-z0-9_-]+$/.test(cmd)) throw new Error('Command must be alphanumeric / underscore / hyphen');
    match.command = cmd;
  }

  // Actions
  const actionsRaw = Array.isArray(raw.actions) ? raw.actions : [];
  if (actionsRaw.length === 0) throw new Error('Rule must have at least one action');
  if (actionsRaw.length > MAX_ACTIONS_PER_RULE) {
    throw new Error(`Too many actions (max ${MAX_ACTIONS_PER_RULE})`);
  }

  const actions = actionsRaw.map((a, i) => {
    if (!a || typeof a !== 'object') throw new Error(`Action ${i} must be an object`);
    const type = String(a.type || '').trim();
    if (!VALID_ACTION_TYPES.has(type)) {
      throw new Error(`Action ${i}: invalid type '${type}'. Must be one of: ${[...VALID_ACTION_TYPES].join(', ')}`);
    }
    const url = String(a.url || '').trim();
    if (!url) throw new Error(`Action ${i}: url is required`);
    if (url.length > MAX_URL_LENGTH) throw new Error(`Action ${i}: url too long`);
    if (!/^(https?:\/\/|\/)/.test(url)) {
      throw new Error(`Action ${i}: url must be absolute (http/https) or root-relative (start with /)`);
    }

    const out = { type, url };
    if (type === 'overlay-image') {
      out.durationMs = Math.max(500, Math.min(60_000, Number(a.durationMs) || 4000));
    }
    if (type === 'sound') {
      const v = Number(a.volume);
      out.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
    }
    return out;
  });

  return {
    id: existingId || raw.id || crypto.randomUUID(),
    name,
    enabled,
    trigger,
    match,
    cooldownMs,
    actions,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * Replace the entire rule list for a streamer. Validates every rule;
 * throws on the first invalid one (no partial writes).
 * Returns the saved rules.
 */
function setRules(streamerId, rawRules) {
  if (!streamerId) throw new Error('streamerId required');
  if (!Array.isArray(rawRules)) throw new Error('Rules must be an array');
  if (rawRules.length > MAX_RULES_PER_STREAMER) {
    throw new Error(`Too many rules (max ${MAX_RULES_PER_STREAMER})`);
  }

  const validated = rawRules.map((r, i) => {
    try {
      return _validateRule(r, { existingId: r.id });
    } catch (e) {
      throw new Error(`Rule ${i} (${r?.name || 'unnamed'}): ${e.message}`);
    }
  });

  rulesByStreamer[streamerId] = validated;
  save();
  return validated;
}

/**
 * Find a single rule by id for a streamer. Used by test-fire.
 */
function getRule(streamerId, ruleId) {
  return getRules(streamerId).find(r => r.id === ruleId) || null;
}

/**
 * Drop all rules for a streamer (admin / unwhitelist cleanup).
 */
function clearStreamer(streamerId) {
  if (rulesByStreamer[streamerId]) {
    delete rulesByStreamer[streamerId];
    save();
  }
}

load();

module.exports = {
  getRules,
  setRules,
  getRule,
  clearStreamer,
  // Constants exposed for UI / docs
  VALID_TRIGGERS: [...VALID_TRIGGERS],
  VALID_ACTION_TYPES: [...VALID_ACTION_TYPES],
  MAX_RULES_PER_STREAMER,
  MAX_ACTIONS_PER_RULE,
};
