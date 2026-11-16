/**
 * Event Overlay — broadcasts in-game events (word finds, streaks, misses)
 * to OBS browser clients in the `event-overlay` Socket.IO room.
 *
 * - Server-side filters: TikTok platform only, active-game gating, optional
 *   wrong_guess suppression.
 * - Active game is read from the Sassie runtime (port 3036), polled so the
 *   overlay tracks whatever the operator has selected in the Sassie monitor.
 * - Synthesises streak events (streak_3 / streak_5 / streak_10 / streak_broken)
 *   from the per-player rolling tally of successful word finds in the current
 *   active round. Streaks expire after STREAK_IDLE_MS to handle silent round
 *   transitions for games that don't broadcast `new-game`.
 */

const fs = require('fs');
const path = require('path');

const SETTINGS_PATH = path.join(__dirname, '..', 'data', 'event-overlay-settings.json');
const SASSIE_RUNTIME_BASE = process.env.SASSIE_RUNTIME_URL || 'http://localhost:3036';
const ACTIVE_GAME_POLL_MS = 10_000;
const STREAK_IDLE_MS = 90_000; // auto-expire a player's streak after 90s of no finds
const STREAK_SWEEP_MS = 30_000;

// Word-find event names that count as a "successful find" for streak purposes.
const STREAK_INCREMENT_EVENTS = new Set([
  'hidden_word',
  'ultra_rare_word_found',
  'rare_word_found',
  'common_word_found',
  'three_letter_found',
  'pangram_found',
  'guess_best_so_far',
]);

// Events that should NEVER reach the overlay (handled by other overlays / are noise).
const SUPPRESSED_EVENTS = new Set([
  'daily_complete',
  'jackpot_win',
  'win',
]);

let io = null;
let relay = null;
let activeGame = null;
let lastSyncedActiveGame = null;
let pollTimer = null;
let sweepTimer = null;
let settings = { showMisses: false };

// Streaks: Map<game, Map<playerKey, { count, lastFindAt }>>
const streaks = new Map();

function loadSettings() {
  try {
    if (fs.existsSync(SETTINGS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf8'));
      if (raw && typeof raw === 'object') {
        settings = { showMisses: !!raw.showMisses };
      }
    }
  } catch (e) {
    console.warn('[EventOverlay] settings load failed:', e.message);
  }
}

function persistSettings() {
  try {
    fs.mkdirSync(path.dirname(SETTINGS_PATH), { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2));
  } catch (e) {
    console.warn('[EventOverlay] settings persist failed:', e.message);
  }
}

async function fetchActiveGame() {
  try {
    const res = await fetch(`${SASSIE_RUNTIME_BASE}/api/runtime/stream-context`, {
      headers: { 'accept': 'application/json' },
    });
    if (!res.ok) return;
    const json = await res.json();
    // sassie-runtime returns { ok, streamContext: { activeGame, ... } }; fall
    // back to a flat { activeGame } shape for forward-compat / test fixtures.
    const ctx = (json && json.streamContext) || json || {};
    const next = ctx.activeGame ? String(ctx.activeGame).toLowerCase() : null;
    if (next !== activeGame) {
      activeGame = next;
      console.log(`[EventOverlay] activeGame -> ${activeGame || '(none)'}`);
      if (io) io.to('event-overlay').emit('event-overlay-active-game', { activeGame });
    }
    lastSyncedActiveGame = Date.now();
  } catch (e) {
    // sassie-runtime may not be up yet — silently retry on next tick
  }
}

function getPlayerKey(user) {
  if (!user) return null;
  // Prefer stable IDs; fall back to displayName so something is keyable.
  return String(
    user.platformUserId ||
    user.id ||
    user.userId ||
    user.uid ||
    user.displayName ||
    ''
  ).toLowerCase().trim() || null;
}

function getStreakBucket(game) {
  let bucket = streaks.get(game);
  if (!bucket) { bucket = new Map(); streaks.set(game, bucket); }
  return bucket;
}

function bumpStreak(game, key, now) {
  const bucket = getStreakBucket(game);
  const cur = bucket.get(key);
  if (cur && (now - cur.lastFindAt) <= STREAK_IDLE_MS) {
    cur.count += 1;
    cur.lastFindAt = now;
    return cur.count;
  }
  bucket.set(key, { count: 1, lastFindAt: now });
  return 1;
}

function breakStreak(game, key) {
  const bucket = streaks.get(game);
  if (!bucket) return 0;
  const cur = bucket.get(key);
  if (!cur) return 0;
  const broken = cur.count;
  bucket.delete(key);
  return broken;
}

function resetStreaks(game) {
  if (!game) { streaks.clear(); return; }
  streaks.delete(game);
}

function sweepStaleStreaks() {
  const cutoff = Date.now() - STREAK_IDLE_MS;
  for (const [game, bucket] of streaks.entries()) {
    for (const [key, entry] of bucket.entries()) {
      if (entry.lastFindAt < cutoff) bucket.delete(key);
    }
    if (bucket.size === 0) streaks.delete(game);
  }
}

function isTikTokUser(user) {
  if (!user) return false;
  const p = String(user.platform || '').toLowerCase();
  return p === 'tiktok';
}

async function enrichCosmetics(user) {
  if (!user || user.cosmetics) return user;
  if (!relay || typeof relay.lookupLinkedDiscord !== 'function') return user;
  const platform = user.platform;
  const userId = user.platformUserId || user.id || user.userId || user.uid;
  if (!platform || !userId) return user;
  try {
    const linkedDiscord = user.linkedDiscord || relay.lookupLinkedDiscord(platform, userId);
    if (!linkedDiscord) return user;
    const cosmetics = await relay.getUserCosmetics(linkedDiscord);
    if (cosmetics && Object.keys(cosmetics).length > 0) {
      return { ...user, cosmetics, linkedDiscord };
    }
  } catch (_) {}
  return user;
}

function broadcast(payload) {
  if (!io) return;
  io.to('event-overlay').emit('event-overlay-event', payload);
}

/**
 * Process a `game-event` socket payload from a game server. Returns a Promise
 * (fire-and-forget — caller doesn't need to await). Performs all filtering and
 * cosmetics enrichment, then forwards to the `event-overlay` room.
 */
async function processGameEvent(rawGame, eventName, data, priority) {
  if (!io) return;
  const game = String(rawGame || '').toLowerCase();
  if (!game || !eventName) return;
  if (SUPPRESSED_EVENTS.has(eventName)) return;

  // Active-game gate (if no active game is set we let everything through so
  // the operator can still test; once a game is selected we hard-filter).
  if (activeGame && game !== activeGame) return;

  const user = (data && data.user) || null;
  if (!isTikTokUser(user)) return;

  // Misses toggle.
  if (eventName === 'wrong_guess' && !settings.showMisses) return;

  // Streak tracking (mutates state, then we may emit a synthetic event).
  const key = getPlayerKey(user);
  const now = Date.now();
  let synthetic = null;
  if (key) {
    if (STREAK_INCREMENT_EVENTS.has(eventName)) {
      const count = bumpStreak(game, key, now);
      if (count === 3) synthetic = { tier: 'streak_3', count };
      else if (count === 5) synthetic = { tier: 'streak_5', count };
      else if (count === 10) synthetic = { tier: 'streak_10', count };
      else if (count > 10 && count % 5 === 0) synthetic = { tier: 'streak_10', count };
    } else if (eventName === 'wrong_guess') {
      const broken = breakStreak(game, key);
      if (broken >= 3) synthetic = { tier: 'streak_broken', count: broken };
    }
  }

  // Enrich the *real* event first.
  const enrichedUser = await enrichCosmetics(user);
  const outData = { ...(data || {}), user: enrichedUser };

  broadcast({
    game,
    eventName,
    priority: priority || 'normal',
    data: outData,
    ts: now,
  });

  if (synthetic) {
    broadcast({
      game,
      eventName: synthetic.tier,
      priority: synthetic.tier === 'streak_10' ? 'high' : 'normal',
      data: { user: enrichedUser, count: synthetic.count, source: eventName },
      ts: now,
    });
    // Fan-out to the cross-game activity feed (new permanent overlay).
    // Only the milestone tiers (streak_3/5/10) make it through there;
    // streak_broken is intentionally excluded.
    try {
      require('./activity-overlay').processStreak(game, synthetic.tier, { user: enrichedUser, count: synthetic.count });
    } catch (_) {}
    // Same milestones also land in the persistent social feed.
    try {
      require('./feed').processStreak(game, synthetic.tier, { user: enrichedUser, count: synthetic.count });
    } catch (_) {}
  }
}

function init(_io, _relay) {
  io = _io;
  relay = _relay;
  loadSettings();
  fetchActiveGame();
  pollTimer = setInterval(fetchActiveGame, ACTIVE_GAME_POLL_MS);
  sweepTimer = setInterval(sweepStaleStreaks, STREAK_SWEEP_MS);
}

function getState() {
  return {
    activeGame,
    lastSyncedActiveGame,
    settings: { ...settings },
    streakBuckets: Array.from(streaks.entries()).map(([g, b]) => ({ game: g, players: b.size })),
  };
}

function setShowMisses(value) {
  settings.showMisses = !!value;
  persistSettings();
  if (io) io.to('event-overlay').emit('event-overlay-settings', { ...settings });
  return { ...settings };
}

module.exports = {
  init,
  processGameEvent,
  resetStreaks,
  getState,
  setShowMisses,
  getActiveGame: () => activeGame,
  getSettings: () => ({ ...settings }),
};
