/**
 * Social Feed — persistent cross-game activity feed for wordtycoon.live
 * (Feed tab in the /me portal + Toon Tower lobby ticker).
 *
 * This is the PERSISTED sibling of src/activity-overlay.js: same event
 * vocabulary and enrichment expectations, but every event is written to
 * feed_events (30-day / 5k-row retention, see database.js) and broadcast
 * to the Socket.IO room `feed` as `feed-event`.
 *
 * Event shape (stored + emitted; superset of the activity-overlay contract):
 *   {
 *     id: number,                      // feed_events row id
 *     ts: number,                      // ms epoch
 *     eventType: 'win' | 'jackpot' | 'daily' | 'streak'   // relay-sourced
 *               | 'buy' | 'levelup' | 'cosmetic' | 'lootbox', // WT-pushed
 *     game: string | null,             // canonical game id, 'wordtycoon' for WT events
 *     gameName: string | null,
 *     value: number | null,
 *     valueLabel: string | null,       // 'pts' | 'coins' | '×3' | ...
 *     user: { displayName, platform, platformUserId, profilePic, cosmetics?,
 *             linkedDiscord?, isSuperfan?, isDonor?, isFanClub?, isSuperDonor? },
 *     detail: object | null,           // type-specific: { word, guessCount, streamer,
 *                                      //   businessName, level, cosmeticName, rarity }
 *     reactions: { [emoji]: count },
 *     myReactions: [emoji],            // per-requester, read path only
 *     commentCount: number
 *   }
 *
 * Reactions/comments live in feed_reactions / feed_comments and are served
 * by the /api/feed* routes in server.js.
 */

const db = require('./database');
const activityOverlay = require('./activity-overlay');

let io = null;
let pruneTimer = null;

// The emoji palette the portal renders; reaction writes are validated
// against this so the table can't fill with arbitrary strings.
const REACTION_EMOJIS = ['👍', '🔥', '🎉', '😂', '💎'];

// Event types WT is allowed to push via POST /api/feed-event.
const WT_EVENT_TYPES = ['buy', 'levelup', 'cosmetic', 'lootbox'];

const PRUNE_INTERVAL_MS = 60 * 60 * 1000; // hourly

function init(_io) {
  io = _io;
  if (pruneTimer) clearInterval(pruneTimer);
  pruneTimer = setInterval(() => {
    try {
      const remaining = db.pruneFeedEvents();
      console.log(`[Feed] Prune pass complete, ${remaining} events remaining`);
    } catch (e) {
      console.warn('[Feed] Prune failed:', e.message);
    }
  }, PRUNE_INTERVAL_MS);
  if (pruneTimer.unref) pruneTimer.unref();
}

// Keep stored user objects lean: the win pipeline attaches big extras
// (badges arrays, per-row leaderboards) that a feed row never renders.
function slimUser(u) {
  if (!u || typeof u !== 'object') return { displayName: 'Player', platform: 'unknown' };
  const slim = {
    displayName: u.displayName || u.username || 'Player',
    platform: u.platform || 'unknown',
    platformUserId: u.platformUserId || u.id || null,
    profilePic: u.profilePic || null
  };
  if (u.username) slim.username = u.username;
  if (u.cosmetics && typeof u.cosmetics === 'object' && Object.keys(u.cosmetics).length) slim.cosmetics = u.cosmetics;
  const linked = u.linkedDiscord || u.discordId;
  if (linked) slim.linkedDiscord = linked;
  if (u.isSuperfan) slim.isSuperfan = true;
  if (u.isDonor) slim.isDonor = true;
  if (u.isFanClub) slim.isFanClub = true;
  if (u.isSuperDonor) slim.isSuperDonor = true;
  return slim;
}

// Core write: persist + broadcast. Never throws — a feed failure must not
// disturb the win/reward pipelines that call into it.
function record(evt) {
  if (!evt || !evt.eventType) return null;
  const full = {
    ts: evt.ts || Date.now(),
    eventType: String(evt.eventType),
    game: evt.game ? String(evt.game).toLowerCase() : null,
    gameName: evt.gameName || (evt.game ? activityOverlay._internal.gameLabel(evt.game) : null),
    value: (typeof evt.value === 'number' && isFinite(evt.value)) ? evt.value : null,
    valueLabel: evt.valueLabel || null,
    user: slimUser(evt.user),
    detail: evt.detail || null
  };
  try {
    const id = db.insertFeedEvent(full);
    const out = { id, ...full, reactions: {}, myReactions: [], commentCount: 0 };
    if (io) io.to('feed').emit('feed-event', out);
    return out;
  } catch (e) {
    console.warn('[Feed] record failed:', e.message);
    return null;
  }
}

/**
 * Hook for game-win events — called from server.js's socket.on('game-win')
 * after cosmetics/perk enrichment, right next to activityOverlay.processGameWin.
 * Same gate: SpellingBee's per-word emits (winType==='word') are not wins.
 */
function processGameWin(data) {
  if (!data || !data.game || !data.winner) return;
  if (data.winType === 'word') return;
  const isJackpot = data.jackpot && data.jackpot > 0;
  const value = isJackpot
    ? Number(data.jackpot)
    : (typeof data.points === 'number' ? data.points : null);
  const detail = {};
  if (data.word) detail.word = String(data.word).slice(0, 40);
  if (typeof data.guessCount === 'number') detail.guessCount = data.guessCount;
  if (data.streamerHandle) detail.streamer = String(data.streamerHandle).toLowerCase();
  record({
    ts: Date.now(),
    game: data.game,
    gameName: data.gameName,
    eventType: isJackpot ? 'jackpot' : 'win',
    value,
    valueLabel: isJackpot ? 'coins' : (value != null ? 'pts' : null),
    user: data.winner,
    detail: Object.keys(detail).length ? detail : null
  });
}

/** Hook for daily-win events (same call site as activityOverlay.processDailyWin). */
function processDailyWin(data) {
  if (!data || !data.game) return;
  const userObj = (data.winner && typeof data.winner === 'object')
    ? data.winner
    : {
        displayName: data.winner || data.displayName || 'Player',
        platform: data.platform || 'unknown',
        platformUserId: data.platformUserId || data.userId || null,
        profilePic: null
      };
  record({
    ts: Date.now(),
    game: data.game,
    eventType: 'daily',
    value: typeof data.amount === 'number' ? data.amount : null,
    valueLabel: typeof data.amount === 'number' ? 'coins' : null,
    user: userObj,
    detail: null
  });
}

/** Hook for streak tiers synthesised by event-overlay.js (streak_3/5/10). */
function processStreak(game, eventName, data) {
  const tiers = { streak_3: '×3', streak_5: '×5', streak_10: '×10' };
  const label = tiers[eventName];
  if (!label || !data || !data.user) return;
  record({
    ts: Date.now(),
    game,
    eventType: 'streak',
    value: typeof data.count === 'number' ? data.count : Number(eventName.split('_')[1]),
    valueLabel: label,
    user: data.user,
    detail: null
  });
}

/**
 * Receiver for Word Tycoon pushes (POST /api/feed-event, key-gated in
 * server.js). WT owns the volume policy (e.g. level-up milestones only);
 * this end just validates shape.
 */
function processWTEvent(body) {
  if (!body || typeof body !== 'object') return null;
  const eventType = String(body.eventType || '');
  if (!WT_EVENT_TYPES.includes(eventType)) return null;
  const user = body.user;
  if (!user || typeof user !== 'object' || !(user.displayName || user.username)) return null;
  let detail = null;
  if (body.detail && typeof body.detail === 'object') {
    detail = {};
    for (const k of ['businessName', 'level', 'cosmeticName', 'rarity', 'category']) {
      if (body.detail[k] != null) detail[k] = body.detail[k];
    }
    if (!Object.keys(detail).length) detail = null;
  }
  return record({
    ts: Date.now(),
    game: 'wordtycoon',
    gameName: 'Word Tycoon',
    eventType,
    value: typeof body.value === 'number' ? body.value : null,
    valueLabel: body.valueLabel ? String(body.valueLabel).slice(0, 12) : null,
    user,
    detail
  });
}


/** User-created status post (no game attachment). */
function post(user, text) {
  return record({
    ts: Date.now(),
    eventType: 'post',
    game: 'wordtycoon',
    gameName: 'Word Tycoon',
    value: null,
    valueLabel: null,
    user: slimUser(user),
    detail: { text: String(text).slice(0, 280) }
  });
}
// Read/interaction passthroughs used by the /api/feed* routes.
function list(opts) { return db.getFeedEvents(opts); }

function react(eventId, userId, emoji) {
  if (!REACTION_EMOJIS.includes(emoji)) return { error: 'bad_emoji' };
  const result = db.toggleFeedReaction(eventId, userId, emoji);
  if (!result) return { error: 'not_found' };
  if (io) io.to('feed').emit('feed-reaction', { eventId, reactions: result.reactions });
  return result;
}

function comment(eventId, userId, user, text) {
  const result = db.addFeedComment(eventId, userId, slimUser(user), text);
  if (!result) return { error: 'not_found' };
  if (io) {
    io.to('feed').emit('feed-comment', {
      eventId,
      comment: { id: result.id, userId: result.userId, user: result.user, text: result.text, createdAt: result.createdAt },
      commentCount: result.commentCount
    });
  }
  return result;
}

function comments(eventId) { return db.getFeedComments(eventId); }

function deleteComment(commentId, userId, isAdmin) {
  const result = db.deleteFeedComment(commentId, userId, isAdmin);
  if (result.deleted && io) {
    io.to('feed').emit('feed-comment-deleted', {
      eventId: result.eventId,
      commentId,
      commentCount: result.commentCount
    });
  }
  return result;
}

module.exports = {
  init,
  record,
  processGameWin,
  processDailyWin,
  processStreak,
  processWTEvent,
  post,
  list,
  react,
  comment,
  comments,
  deleteComment,
  REACTION_EMOJIS
};
