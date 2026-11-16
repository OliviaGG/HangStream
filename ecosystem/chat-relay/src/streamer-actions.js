/**
 * streamer-actions.js — Evaluate streamer rules against incoming TikTok
 * events and dispatch matched actions to the per-streamer overlay room.
 *
 * Wiring:
 *   - tiktok-direct.js calls evaluateGift / evaluateChat after each event.
 *   - This module finds matching rules, applies cooldowns, expands
 *     placeholder vars, and emits `action-fire` to room `actions:<streamerId>`.
 *   - The OBS overlay (public/streamer/actions-overlay.html) joins that
 *     room and renders sound / overlay-image actions.
 */

const rules = require('./streamer-rules');

let io = null;
const ROOM = (streamerId) => `actions:${streamerId}`;

// Per-rule cooldown: Map<ruleId, lastFiredEpochMs>
const _lastFired = new Map();

function setIo(socketIO) { io = socketIO; }

function _onCooldown(rule) {
  if (!rule.cooldownMs) return false;
  const last = _lastFired.get(rule.id) || 0;
  return (Date.now() - last) < rule.cooldownMs;
}

function _markFired(rule) {
  _lastFired.set(rule.id, Date.now());
}

/**
 * Replace %placeholder% tokens in a string with values from `vars`.
 * Unknown tokens are left intact (so misspellings are visible to the streamer).
 */
function _expand(str, vars) {
  if (typeof str !== 'string' || !str.includes('%')) return str;
  return str.replace(/%([a-zA-Z_][a-zA-Z0-9_]*)%/g, (m, key) => {
    return Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : m;
  });
}

/**
 * Build the payload emitted to the overlay. Expands placeholders inside
 * action.url so streamers can use, e.g., /assets/sounds/%giftName%.mp3.
 */
function _buildFirePayload(rule, vars, source) {
  const actions = rule.actions.map((a) => {
    const out = { type: a.type, url: _expand(a.url, vars) };
    if (a.type === 'overlay-image') out.durationMs = a.durationMs;
    if (a.type === 'sound') out.volume = a.volume;
    return out;
  });
  return {
    ruleId: rule.id,
    ruleName: rule.name,
    source, // 'gift' | 'chat' | 'test'
    vars,
    actions,
    firedAt: Date.now(),
  };
}

function _dispatch(streamerId, rule, vars, source) {
  if (!io) return;
  if (!rule.enabled) return;
  if (_onCooldown(rule)) return;
  _markFired(rule);
  const payload = _buildFirePayload(rule, vars, source);
  io.to(ROOM(streamerId)).emit('action-fire', payload);
}

/**
 * Evaluate a TikTok gift event. `data` should match the shape
 * built in tiktok-direct.js gift handler:
 *   { user, diamondCount, giftName, repeatCount }
 */
function evaluateGift(streamerId, data) {
  if (!streamerId || !data) return;
  const list = rules.getRules(streamerId);
  if (!list.length) return;

  const coins = Number(data.diamondCount) || 0;
  const giftName = String(data.giftName || '').trim();
  const giftNameLc = giftName.toLowerCase();

  const vars = {
    username: data.user?.username || 'someone',
    nickname: data.user?.displayName || data.user?.username || 'someone',
    coins: coins,
    giftName: giftName,
    repeatCount: Number(data.repeatCount) || 1,
  };

  for (const rule of list) {
    if (rule.trigger === 'gift') {
      if (rule.match.minCoins && coins < rule.match.minCoins) continue;
      _dispatch(streamerId, rule, vars, 'gift');
    } else if (rule.trigger === 'gift-specific') {
      if (!giftNameLc) continue;
      if (!giftNameLc.includes(rule.match.giftName.toLowerCase())) continue;
      if (rule.match.minCoins && coins < rule.match.minCoins) continue;
      _dispatch(streamerId, rule, vars, 'gift');
    }
  }
}

/**
 * Evaluate a TikTok chat message. Only chat-command rules match here.
 * `data` is the normalized message: { user, message }
 */
function evaluateChat(streamerId, data) {
  if (!streamerId || !data) return;
  const list = rules.getRules(streamerId);
  if (!list.length) return;

  const text = String(data.message || '').trim();
  if (!text.startsWith('!')) return; // fast path: only ! commands trigger

  // Parse "!cmd arg1 arg2" → command="cmd", params="arg1 arg2"
  const space = text.indexOf(' ');
  const cmd = (space === -1 ? text.slice(1) : text.slice(1, space)).toLowerCase();
  const params = space === -1 ? '' : text.slice(space + 1).trim();
  if (!cmd) return;

  const vars = {
    username: data.user?.username || 'someone',
    nickname: data.user?.displayName || data.user?.username || 'someone',
    command: cmd,
    commandParams: params,
  };

  for (const rule of list) {
    if (rule.trigger !== 'chat-command') continue;
    if (rule.match.command !== cmd) continue;
    _dispatch(streamerId, rule, vars, 'chat');
  }
}

/**
 * Test-fire a rule manually from the dashboard. Bypasses cooldowns so the
 * streamer can hammer the test button while iterating on assets.
 */
function testFire(streamerId, ruleId) {
  const rule = rules.getRule(streamerId, ruleId);
  if (!rule) return { ok: false, error: 'Rule not found' };
  if (!io) return { ok: false, error: 'Socket.IO not initialized' };

  const vars = {
    username: 'testuser',
    nickname: 'Test User',
    coins: 100,
    giftName: 'Test Gift',
    repeatCount: 1,
    command: rule.match.command || 'test',
    commandParams: '',
  };
  const payload = _buildFirePayload(rule, vars, 'test');
  io.to(ROOM(streamerId)).emit('action-fire', payload);
  return { ok: true, fired: payload };
}

module.exports = {
  setIo,
  evaluateGift,
  evaluateChat,
  testFire,
  ROOM,
};
