/**
 * tiktok-direct.js — Direct TikTok Live connection via tiktok-live-connector
 *
 * Connects directly to TikTok's Webcast push service, bypassing TikFinity.
 * Supports multiple simultaneous streams (one connection per streamer).
 * Each connection uses 1-3 EulerStream signing requests; all events flow
 * over a persistent WebSocket after that.
 */

// LANDMINE: tiktok-live-connector is PINNED to 2.1.1-beta1 (exact) in
// package.json. Versions >=2.2 drop WebcastPushConnection AND route
// signing through fetchWebcastSignatureFromEulerRoute, which EulerStream
// now paywalls behind a Business plan — our SIGN_API_KEY gets rejected
// and every connect fails. Do NOT let `npm audit fix` / `npm update`
// bump this package; protobufjs is patched via an "overrides" entry
// instead. Verified working 2026-07-10.
const { WebcastPushConnection } = require('tiktok-live-connector');
const relay = require('./relay');
const topLikers = require('./top-likers');
const spotifyRequests = require('./spotify-requests');
const avatarCache = require('./avatar-cache');
const streamerActions = require('./streamer-actions');
const streamerGoals = require('./streamer-goals');
const streamers = require('./streamers');
// streamerTtsPipeline import removed — TTS is dispatched centrally by
// relay._maybeFireTTS for all chat sources (TikTok, Discord, etc.). The
// pipeline module's _getCatalog helper is still required elsewhere
// (server.js exposes the catalog proxy via it).

// Active connections keyed by TikTok username (lowercase)
const connections = new Map();
const MAX_RECONNECT_ATTEMPTS = 5;
// Connection must stay alive this long before we count it as "real" and
// reset the reconnect-attempt counter. Phantom streams (connect → end in
// <1s) won't qualify, so they accrue against MAX_RECONNECT_ATTEMPTS and
// trip the breaker instead of looping forever.
const SUSTAINED_CONNECT_MS = 30000;
// Streams that end within this window of connecting are flagged as
// phantom — schedule a much longer reconnect to avoid hammering TikTok.
const PHANTOM_END_WINDOW_MS = 5000;
const PHANTOM_RECONNECT_MS  = 5 * 60 * 1000;
const SUBSCRIBER_COUNT_CACHE_TTL = 60_000;
const CONNECT_TIMEOUT_MS = 15_000;
const subscriberCountCache = new Map();

// Connection states
const STATE = { DISCONNECTED: 0, CONNECTING: 1, CONNECTED: 2 };

/**
 * Connect to a TikTok live stream by username.
 * @param {string} username - TikTok username (with or without @)
 * @param {object} [opts] - Options
 * @param {string} [opts.sessionId] - TikTok sessionid cookie for authenticated features
 * @param {boolean} [opts.autoReconnect] - Auto-reconnect on disconnect (default: true)
 * @param {string} [opts.targetGame] - Route events only to this game room (e.g. 'searchle')
 * @param {string} [opts.streamerId] - Discord ID of the streamer who owns this connection
 * @returns {{ ok: boolean, error?: string }}
 */
function connectStream(username, opts = {}) {
  username = normalizeUsername(username);
  if (!username) return { ok: false, error: 'Invalid username' };

  if (connections.has(username)) {
    const existing = connections.get(username);
    if (existing.state === STATE.CONNECTED || existing.state === STATE.CONNECTING) {
      return { ok: false, error: `Already connected to @${username}` };
    }
  }

  const autoReconnect = opts.autoReconnect !== false;

  const connectionOpts = {
    processInitialData: true,
    enableExtendedGiftInfo: true,
    requestPollingIntervalMs: 1000,
  };

  // If session cookie provided, enable authenticated connection
  if (opts.sessionId) {
    connectionOpts.sessionId = opts.sessionId;
  }

  const tiktok = new WebcastPushConnection(username, connectionOpts);

  const entry = {
    username,
    connection: tiktok,
    state: STATE.CONNECTING,
    autoReconnect,
    reconnectAttempts: opts.reconnectAttempts || 0,
    superseded: false,
    targetGame: opts.targetGame || null,
    streamerId: opts.streamerId || null,
    reconnectTimer: null,
    connectTimeoutTimer: null,
    connectedAt: null,
    viewerCount: 0,
    subscriberCount: 0,
    eventCounts: { chat: 0, like: 0, gift: 0, join: 0, follow: 0, share: 0 },
  };

  connections.set(username, entry);

  // Wire up all event handlers
  bindEvents(entry);
  startConnectTimeout(entry);

  // Attempt connection
  tiktok.connect()
    .then((state) => {
      clearConnectTimeout(entry);
      entry.state = STATE.CONNECTED;
      // Don't reset reconnectAttempts here — phantom streams "connect" and
      // immediately end, which would forever reset the counter and never
      // trip the MAX_RECONNECT_ATTEMPTS limit. Reset only after the
      // connection has stayed alive for SUSTAINED_CONNECT_MS.
      if (entry.sustainedConnectTimer) clearTimeout(entry.sustainedConnectTimer);
      entry.sustainedConnectTimer = setTimeout(() => {
        entry.reconnectAttempts = 0;
        entry.sustainedConnectTimer = null;
      }, SUSTAINED_CONNECT_MS);
      entry.connectedAt = Date.now();
      entry.viewerCount = state?.roomInfo?.user_count || 0;
      entry.subscriberCount = extractSubscriberCount(state?.roomInfo);
      console.log(`[TikTok-Direct] Connected to @${username} (${entry.viewerCount} viewers, game: ${entry.targetGame || 'all'})`);
      relay.broadcastStatus('tiktok', true);
    })
    .catch((err) => {
      clearConnectTimeout(entry);
      entry.state = STATE.DISCONNECTED;
      const msg = extractErrorMessage(err);
      console.error(`[TikTok-Direct] Failed to connect to @${username}: ${msg}`);
      updateOverallStatus();

      if (isOfflineConnectError(msg)) {
        console.log(`[TikTok-Direct] @${username} is not currently live`);
      }

      if (autoReconnect) {
        scheduleReconnect(entry);
      }
    });

  return { ok: true };
}

/**
 * Bind tiktok-live-connector events to relay handlers.
 */
function bindEvents(entry) {
  const { connection: tiktok, username } = entry;

  // ── Chat messages ──
  tiktok.on('chat', (data) => {
    entry.eventCounts.chat++;
    _maybeDumpChatShape(data);

    const chatUser = _logIfFc(mapUser(data));
    // Voice eligibility marker (is_superfan): only written on the OWNER's own
    // stream, and only when the event actually carries the userIdentity struct
    // — so we never clobber a real owner-sub's flag from an event that omits
    // it, and a co-streamer's subscribers never gain platform voice. On the
    // owner channel we both set (true) and clear (false) the flag, giving it
    // automatic expiry the moment a lapsed subscriber chats again.
    if (isOwnerVoiceChannel(entry.username) && data.userIdentity) {
      chatUser.isSuperfan = !!data.userIdentity.isSubscriberOfAnchor;
    }
    const msg = {
      platform: 'tiktok',
      user: chatUser,
      message: data.comment || '',
    };
    if (entry.targetGame) msg._targetGame = entry.targetGame;
    if (entry.streamerId) msg._streamerId = entry.streamerId;
    relay.handleMessage(msg);

    if (entry.streamerId) {
      streamerActions.evaluateChat(entry.streamerId, msg);
      // TTS is fired by relay.handleMessage (_maybeFireTTS) — single
      // path so per-viewer voice + streamer-voice fallback + browser
      // default all flow through the same emitter. Removing the
      // duplicate handleChat call here prevents double-firing on every
      // TikTok chat message.
    }
  });

  // ── Likes ──
  tiktok.on('like', (data) => {
    entry.eventCounts.like++;
    const user = mapUser(data);
    const burstCount = data.likeCount || 1; // per-burst, NOT data.totalLikeCount (that's stream-wide)
    const evt = {
      type: 'like',
      platform: 'tiktok',
      user,
      count: burstCount,
    };
    if (entry.targetGame) evt._targetGame = entry.targetGame;
    if (entry.streamerId) evt._streamerId = entry.streamerId;
    relay.handleEngagement(evt);

    if (entry.streamerId) {
      topLikers.recordLike({ streamerId: entry.streamerId, user, count: burstCount });
      streamerGoals.applyLike({ streamerId: entry.streamerId, count: burstCount, user });
    }
  });

  // ── Gifts ──
  tiktok.on('gift', (data) => {
    // gift event fires for streaks too; only count when streak ends or non-streak
    if (data.giftType === 1 && data.repeatEnd === false) return; // streak still going

    entry.eventCounts.gift++;
    const diamonds = data.diamondCount || data.coinCount || 0;
    const repeatCount = data.repeatCount || 1;
    const totalDiamonds = diamonds * repeatCount;

    if (totalDiamonds > 0) {
      const evt = {
        type: 'gift',
        platform: 'tiktok',
        user: mapUser(data),
        diamondCount: totalDiamonds,
        giftName: data.giftName || data.describe || 'Gift',
      };
      if (entry.targetGame) evt._targetGame = entry.targetGame;
      if (entry.streamerId) evt._streamerId = entry.streamerId;
      evt._streamerHandle = entry.username;   // the connected TikTok handle (for browser gift rooms)
      relay.handleEngagement(evt);
      console.log(`[TikTok-Direct] Gift from @${data.uniqueId}: ${totalDiamonds} diamonds (${data.giftName || 'unknown'})`);

      if (entry.streamerId) {
        streamerActions.evaluateGift(entry.streamerId, {
          user: evt.user,
          diamondCount: totalDiamonds,
          giftName: evt.giftName,
          repeatCount,
        });
        streamerGoals.applyGift({
          streamerId: entry.streamerId,
          coins: totalDiamonds,
          giftName: evt.giftName,
          user: evt.user,
        });
      }
    }
  });

  // ── Member join ──
  tiktok.on('member', (data) => {
    entry.eventCounts.join++;
    const joinUser = mapUser(data);
    // Flag owner-channel Super Fans on JOIN too, so a subscriber who's watching
    // gets voice access as soon as they enter — they don't have to type first.
    // Only SET (never clear) here: leaving isSuperfan undefined for everyone
    // else means handleJoin does no DB write on generic joins, and lapsed-sub
    // CLEARING stays with the chat handler (which fires on owner-channel chat).
    if (isOwnerVoiceChannel(entry.username) && data.userIdentity && data.userIdentity.isSubscriberOfAnchor) {
      joinUser.isSuperfan = true;
    }
    const joinData = { platform: 'tiktok', user: joinUser };
    if (entry.targetGame) joinData._targetGame = entry.targetGame;
    if (entry.streamerId) joinData._streamerId = entry.streamerId;
    relay.handleJoin(joinData);
  });

  // ── Follow ──
  tiktok.on('follow', (data) => {
    entry.eventCounts.follow++;
    const evt = { type: 'follow', platform: 'tiktok', user: mapUser(data), count: 1 };
    if (entry.targetGame) evt._targetGame = entry.targetGame;
    if (entry.streamerId) evt._streamerId = entry.streamerId;
    relay.handleEngagement(evt);
    if (entry.streamerId) {
      streamerGoals.applyFollow({ streamerId: entry.streamerId, user: evt.user });
    }
  });

  // ── Share ──
  tiktok.on('share', (data) => {
    entry.eventCounts.share++;
    const evt = { type: 'share', platform: 'tiktok', user: mapUser(data), count: 1 };
    if (entry.targetGame) evt._targetGame = entry.targetGame;
    if (entry.streamerId) evt._streamerId = entry.streamerId;
    relay.handleEngagement(evt);
    if (entry.streamerId) {
      streamerGoals.applyShare({ streamerId: entry.streamerId, user: evt.user });
    }
  });

  // ── Viewer count updates ──
  tiktok.on('roomUser', (data) => {
    entry.viewerCount = data.viewerCount || 0;
  });

  // ── Stream ended ──
  tiktok.on('streamEnd', (actionId) => {
    if (entry.superseded) return;
    clearConnectTimeout(entry);
    if (entry.sustainedConnectTimer) {
      clearTimeout(entry.sustainedConnectTimer);
      entry.sustainedConnectTimer = null;
    }
    // Detect phantom streams — connector says "live" but TikTok ends the
    // session within seconds. These should back off aggressively instead
    // of retrying every 60s and pegging the connection slot.
    const liveDuration = entry.connectedAt ? Date.now() - entry.connectedAt : Infinity;
    const isPhantom = liveDuration < PHANTOM_END_WINDOW_MS;
    console.log(`[TikTok-Direct] @${username} stream ended (action: ${actionId})${isPhantom ? ` — phantom (lasted ${liveDuration}ms)` : ''}`);
    entry.state = STATE.DISCONNECTED;
    updateOverallStatus();

    // Stream ending is a definitive session boundary — reset the top-likers leaderboard.
    // Transient `disconnected` events don't reset; only true stream-end does.
    if (entry.streamerId) {
      topLikers.resetStreamer(entry.streamerId, 'streamEnd');
      spotifyRequests.resetStreamer(entry.streamerId, 'streamEnd');
    }

    if (entry.autoReconnect) {
      scheduleReconnect(entry, isPhantom ? PHANTOM_RECONNECT_MS : 60000);
    }
  });

  // ── Disconnected ──
  tiktok.on('disconnected', () => {
    if (entry.superseded) return;
    clearConnectTimeout(entry);
    console.log(`[TikTok-Direct] Disconnected from @${username}`);
    entry.state = STATE.DISCONNECTED;
    updateOverallStatus();

    // If `streamEnd` already scheduled a (longer) reconnect, don't clobber
    // it with the default 10s delay — that caused a tight loop on phantom
    // streams (connect → streamEnd → disconnected → 10s reconnect → repeat).
    if (entry.autoReconnect && !entry.reconnectTimer) {
      scheduleReconnect(entry);
    }
  });

  // ── Errors ──
  tiktok.on('error', (err) => {
    if (shouldSuppressConnectErrorLog(entry, err)) return;
    console.error(`[TikTok-Direct] Error on @${username}: ${extractErrorMessage(err)}`);
  });
}

/**
 * Map tiktok-live-connector user data to Chat Relay's user format.
 */
// Detect whether this TikTok event's user is an ACTIVE fan-club member
// of the streamer's channel. The protobuf schema (User_FansClub /
// User_FansClubInfo, see tiktok-live-connector/dist/types/tiktok-schema)
// exposes fan-club state under multiple shapes depending on event type:
//
//   • data.fansClub.data.userFansClubStatus === 1   (ACTIVE per enum)
//   • data.fansClubInfo.fansLevel non-zero / fansClubName present
//   • Some events flatten under data.userDetails.fansClub
//
// Without this check, mapUser was returning users without isFanClub set,
// so _persistFanClubFromEvent (relay.js:808) returned early — new fan-
// club members were never recorded in fan_club_memberships and never got
// the tiktok_fc cosmetic bundle granted. Legacy users with is_fan_club=1
// from the old TikFinity ingest still worked; new chatters did not.
// Known TikTok portraitTag IDs that indicate "Heart Me" / Fan Club
// membership. Confirmed via raw event inspection:
//   • 7399855526094359314 → 'viewerLabel_memberDays'  (≥1 day member)
//   • 7399855526094326546 → 'viewerLabel_memberToday' (joined today)
// TikTok may add more variants (e.g. memberHours, memberJoined) — we
// also do a substring match on `viewerLabel_member` so any future tag
// in that family still detects as FC.
const TIKTOK_FC_TAG_IDS = new Set([
  '7399855526094359314', // memberDays
  '7399855526094326546', // memberToday
]);

function _detectFansClub(data) {
  if (!data) return false;
  // PRIMARY: portraitTag with a Heart-Me member marker.
  // Path: data.publicAreaMessageCommon.portraitInfo.portraitTag[]
  const pa = data.publicAreaMessageCommon;
  const tags = pa && pa.portraitInfo && pa.portraitInfo.portraitTag;
  if (Array.isArray(tags)) {
    for (const t of tags) {
      if (!t) continue;
      if (TIKTOK_FC_TAG_IDS.has(t.tagId)) return true;
      // Substring match catches future variants (memberHours, etc.) and
      // is resilient to tagId rotation.
      if (typeof t.showValue === 'string'
          && t.showValue.indexOf('viewerLabel_member') !== -1) {
        return true;
      }
    }
  }
  // SECONDARY: defensive fallback to fansClub data path (kept for older
  // library builds; not present on current tiktok-live-connector chat
  // events but harmless to check).
  const fc = data.fansClub;
  if (fc && fc.data) {
    const s = fc.data.userFansClubStatus;
    if (s === 1 || s === 'ACTIVE') return true;
    if (typeof fc.data.level === 'number' && fc.data.level > 0) return true;
  }
  return false;
}

// Strip decorative bracket / ornament characters from TikTok display names
// that break layout in downstream games. Specifically, characters with
// unusually large glyph metrics (Javanese rerenggan U+A9C1/U+A9C2 like
// "꧁꧂", curly arrow brackets U+22B0-22BF / U+2980-29FF, geometric
// shape brackets, box-drawing characters, etc.) render with line-box
// heights that bypass our `height` constraints on text elements and
// push the top-card / podium card taller. Common emoji (🧸, hearts,
// flags) are preserved — only DECORATIVE BRACKET / ORNAMENT codepoints
// are stripped. After stripping, leading/trailing whitespace and runs
// of 2+ spaces are collapsed so a name like "🧸꧁Millie꧂🧸" becomes
// "🧸Millie🧸" instead of "🧸 Millie 🧸".
//
// If we ever need a more aggressive strip (e.g. ALL Symbol-Other chars),
// expand the regex; current list targets only the specific glyph
// families empirically shown to cause layout expansion in alt-mode.
const _NAME_STRIP_RE = new RegExp(
  '[' +
  '\\u{A9C1}-\\u{A9CE}' +   // Javanese punctuation (꧁꧂)
  '\\u{2500}-\\u{257F}' +   // Box Drawing (╰╯)
  '\\u{2580}-\\u{259F}' +   // Block Elements (▓ etc.)
  '\\u{25A0}-\\u{25FF}' +   // Geometric Shapes (◤◣◢)
  '\\u{2980}-\\u{29FF}' +   // Misc Math Symbols-B (⊰⊱)
  '\\u{27C0}-\\u{27EF}' +   // Misc Math Symbols-A
  '\\u{2768}-\\u{2775}' +   // Medium Math/Ornament brackets
  '\\u{A789}-\\u{A78A}' +   // Modifier Letter Colons/Equals (decorative)
  '\\u{27E6}-\\u{27EB}' +   // Math Brackets (⟦⟧⟨⟩⟪⟫)
  '\\u{2E00}-\\u{2E7F}' +   // Supplemental Punctuation (⸻⸺ etc.)
  '\\u{FE3D}-\\u{FE44}' +   // CJK decorative brackets
  '\\u{FF5F}-\\u{FF60}' +   // Fullwidth brackets
  '\\u{3010}-\\u{3019}' +   // CJK black brackets 【】〖〗
  '\\u{2E26}-\\u{2E29}' +   // Inverted/turned brackets
  ']',
  'gu'
);

function _sanitizeDisplayName(name) {
  if (typeof name !== 'string' || name.length === 0) return name;
  const stripped = name.replace(_NAME_STRIP_RE, '');
  // Collapse runs of whitespace introduced by the strip, then trim.
  const cleaned = stripped.replace(/\s{2,}/g, ' ').trim();
  // Safety: never return an empty name (would break downstream rendering).
  return cleaned.length > 0 ? cleaned : name;
}

// Owner TikTok handles whose SUBSCRIBERS qualify for Super Fan status.
// TikTok subscription is per-creator, so only the platform owner's own
// subscribers earn it — a co-streamer's subscribers do not.
//
// This list used to be hardcoded to @jorrybeaufart / @jorost96, which are the
// owner's DISCORD handles, not channels TikTok is ever connected to. The
// comparison is against entry.username — the connected TikTok handle — so it
// matched nothing once the owner streamed as @museumcomesalive: every call
// returned false, chatUser.isSuperfan was never assigned, and users.is_superfan
// could never leave 0. Super Fans silently lost batch guessing, the [SF] badge,
// the Super Fan cosmetic bundle and the win-card badge, and only the manual
// superfan_overrides table still worked.
//
// Read the owner's registered TikTok handles from the streamer registry
// instead, so the set follows whatever /streamer has configured and changing a
// handle can't quietly break the perk again. VOICE_OWNER_HANDLES still wins
// when set, as an escape hatch.
const OWNER_DISCORD_ID = process.env.OWNER_DISCORD_ID || '179331908499406849';
const VOICE_OWNER_HANDLES_ENV = String(process.env.VOICE_OWNER_HANDLES || '')
  .split(',')
  .map(s => normalizeUsername(s.trim()))
  .filter(Boolean);

// streamers.json is edited at runtime, so resolve per-call rather than freezing
// the set at module load. Cached briefly — this runs on every chat event.
let _ownerHandles = null;
let _ownerHandlesAt = 0;
const OWNER_HANDLE_TTL_MS = 60 * 1000;
function ownerVoiceHandles() {
  if (VOICE_OWNER_HANDLES_ENV.length) return new Set(VOICE_OWNER_HANDLES_ENV);
  if (_ownerHandles && Date.now() - _ownerHandlesAt < OWNER_HANDLE_TTL_MS) return _ownerHandles;
  let set;
  try {
    set = new Set(streamers.getTiktokUsernames(OWNER_DISCORD_ID).map(normalizeUsername).filter(Boolean));
  } catch (_) {
    return _ownerHandles || new Set();
  }
  // An empty result means the registry isn't loaded yet (or the owner entry is
  // gone). Serve the last good set rather than caching "nobody is the owner"
  // for 60s and un-flagging every subscriber who chats in that window.
  if (!set.size) return _ownerHandles || set;
  _ownerHandles = set;
  _ownerHandlesAt = Date.now();
  return set;
}
function isOwnerVoiceChannel(username) {
  return ownerVoiceHandles().has(normalizeUsername(username || ''));
}

function mapUser(data) {
  const uniqueId = data.uniqueId || data.nickname || 'unknown';
  const id = String(uniqueId || data.userId || 'unknown');
  // Rewrite TikTok signed avatar URLs to our persistent proxy. The raw URL
  // is short-lived (~14 days) and any consumer that stores it ends up with
  // a 403'd image. avatar-cache.rewriteAvatarUrl kicks off a background
  // download and returns /api/avatar/tiktok/<id> instead. Non-TikTok URLs
  // (rare on this path) pass through untouched.
  const profilePic = avatarCache.rewriteAvatarUrl('tiktok', id, data.profilePictureUrl || null);
  return {
    // Keep parity with the legacy TikFinity path and Discord auto-linking:
    // prefer the public handle when present, only falling back to numeric IDs.
    id,
    username: uniqueId,
    displayName: _sanitizeDisplayName(data.nickname || uniqueId),
    profilePic,
    isFollowing: !!(data.followRole && data.followRole >= 1),
    // TikTok's paid Subscription status. The pinned connector (2.1.1-beta1)
    // does NOT expose a top-level `data.isSubscriber` — that field is always
    // undefined, which is why is_subscriber was 0 for every TikTok user. The
    // real signal rides on chat events at
    // `data.userIdentity.isSubscriberOfAnchor` (WebcastChatMessage_UserIdentity)
    // and means "subscriber of THIS stream's anchor". Keep the legacy
    // top-level read as a harmless fallback for any other event shape.
    isSubscriber: !!(data.userIdentity && data.userIdentity.isSubscriberOfAnchor) || !!data.isSubscriber,
    isModerator: !!data.isModerator,
    isFanClub: _detectFansClub(data),
    badges: mapBadges(data),
  };
}

// TEMP: log first detection of each fan-club user so we can confirm the
// _detectFansClub paths actually fire on real incoming TikTok events.
// Throttled per-user to avoid spam. Remove once detection is verified.
const _fcDetectionLogged = new Set();
function _logIfFc(user) {
  if (user && user.isFanClub && !_fcDetectionLogged.has(user.id)) {
    _fcDetectionLogged.add(user.id);
    console.log(`[TikTok] FC DETECTED: ${user.id} (${user.displayName})`);
  }
  return user;
}

// TEMP: dump the raw chat-event data shape for the FIRST chat event,
// then once per unique user up to 3 samples total. Goal: see what
// top-level keys + nested fan-club-related keys actually exist on real
// TikTok events so we can adjust _detectFansClub paths. Logs only keys
// that look fan-club-related to keep output readable.
// Debug dump removed — detection now matches both memberDays + memberToday.
function _maybeDumpChatShape(_data) {}

/**
 * Extract badge info from user data.
 */
function mapBadges(data) {
  const badges = [];
  if (data.gifterLevel) badges.push({ type: 'gifter', level: data.gifterLevel });
  if (data.teamMemberLevel) badges.push({ type: 'team', level: data.teamMemberLevel });
  if (data.topGifterRank) badges.push({ type: 'top_gifter', rank: data.topGifterRank });
  return badges;
}

/**
 * Disconnect a single stream.
 */
function disconnectStream(username) {
  username = normalizeUsername(username);
  const entry = connections.get(username);
  if (!entry) return { ok: false, error: `Not connected to @${username}` };

  clearReconnectTimer(entry);
  clearConnectTimeout(entry);
  if (entry.sustainedConnectTimer) {
    clearTimeout(entry.sustainedConnectTimer);
    entry.sustainedConnectTimer = null;
  }
  entry.autoReconnect = false;
  entry.state = STATE.DISCONNECTED;

  try { entry.connection.disconnect(); } catch (e) {}
  connections.delete(username);
  if (entry.streamerId) {
    topLikers.resetStreamer(entry.streamerId, 'explicit-disconnect');
    spotifyRequests.resetStreamer(entry.streamerId, 'explicit-disconnect');
  }
  console.log(`[TikTok-Direct] Disconnected from @${username}`);
  updateOverallStatus();

  return { ok: true };
}

/**
 * Disconnect all streams.
 */
function disconnectAll() {
  for (const [username] of connections) {
    disconnectStream(username);
  }
}

/**
 * Get status of all connections.
 */
function getStatus() {
  const streams = [];
  for (const [username, entry] of connections) {
    streams.push({
      username,
      state: ['disconnected', 'connecting', 'connected'][entry.state],
      connectedAt: entry.connectedAt,
      viewerCount: entry.viewerCount,
      subscriberCount: entry.subscriberCount || 0,
      eventCounts: { ...entry.eventCounts },
      autoReconnect: entry.autoReconnect,
      reconnectAttempts: entry.reconnectAttempts || 0,
      maxReconnectAttempts: MAX_RECONNECT_ATTEMPTS,
      targetGame: entry.targetGame,
      streamerId: entry.streamerId,
    });
  }
  return {
    mode: 'direct',
    totalConnections: connections.size,
    activeConnections: streams.filter(s => s.state === 'connected').length,
    streams,
  };
}

/**
 * Check if any stream is connected.
 */
function isConnected() {
  for (const entry of connections.values()) {
    if (entry.state === STATE.CONNECTED) return true;
  }
  return false;
}

async function getSubscriberCount() {
  let max = 0;
  const streams = [];

  for (const [username, entry] of connections) {
    let roomInfo = entry.connection?.roomInfo || null;
    if (!roomInfo && typeof entry.connection?.fetchRoomInfo === 'function') {
      try {
        roomInfo = await entry.connection.fetchRoomInfo();
      } catch {
        roomInfo = null;
      }
    }

    const count = extractSubscriberCount(roomInfo);
    if (count > 0) entry.subscriberCount = count;
    max = Math.max(max, count || 0);
    streams.push({
      username,
      state: ['disconnected', 'connecting', 'connected'][entry.state],
      subscriberCount: count || 0,
    });
  }

  return { count: max, streams };
}

async function fetchSubscriberCount(usernames = []) {
  const clean = [...new Set((usernames || []).map(normalizeUsername).filter(Boolean))];
  let max = 0;
  const streams = [];

  for (const username of clean) {
    const cached = subscriberCountCache.get(username);
    if (cached && (Date.now() - cached.ts) < SUBSCRIBER_COUNT_CACHE_TTL) {
      max = Math.max(max, cached.count || 0);
      streams.push({ username, subscriberCount: cached.count || 0, cached: true });
      continue;
    }

    let count = 0;
    try {
      const temp = new WebcastPushConnection(username, { fetchRoomInfoOnConnect: false });
      const roomInfo = await temp.fetchRoomInfo();
      count = extractSubscriberCount(roomInfo);
    } catch {
      count = 0;
    }

    subscriberCountCache.set(username, { count, ts: Date.now() });
    max = Math.max(max, count);
    streams.push({ username, subscriberCount: count, cached: false });
  }

  return { count: max, streams };
}

// ── Internal helpers ──

function normalizeUsername(username) {
  if (!username) return null;
  return username.replace(/^@/, '').trim().toLowerCase();
}

function extractErrorMessage(err) {
  const candidates = [
    err?.exception?.message,
    err?.message,
    err?.cause?.message,
    typeof err === 'string' ? err : null,
    err?.info,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function isOfflineConnectError(messageOrError) {
  const msg = extractErrorMessage(messageOrError).toLowerCase();
  return msg.includes("isn't online")
    || msg.includes('is not online')
    || msg.includes('not online')
    || msg.includes('offline')
    || msg.includes('not live');
}

function shouldSuppressConnectErrorLog(entry, err) {
  if (!entry || entry.state !== STATE.CONNECTING) return false;
  return isOfflineConnectError(err);
}

function streamerHasOtherLiveConnections(streamerId, usernameToIgnore, connectionMap = connections) {
  if (!streamerId) return false;
  const ignored = normalizeUsername(usernameToIgnore);
  for (const [username, other] of connectionMap) {
    if (!other || other.streamerId !== streamerId) continue;
    if (normalizeUsername(username) === ignored) continue;
    if (other.state === STATE.CONNECTED || other.state === STATE.CONNECTING) {
      return true;
    }
  }
  return false;
}

function stopUntilManualRetrigger(entry, deps = {}) {
  const connectionMap = deps.connections || connections;
  const streamersApi = deps.streamers || streamers;
  const topLikersApi = deps.topLikers || topLikers;
  const spotifyRequestsApi = deps.spotifyRequests || spotifyRequests;

  entry.autoReconnect = false;
  entry.state = STATE.DISCONNECTED;

  if (entry.streamerId) {
    topLikersApi.resetStreamer(entry.streamerId, 'max-reconnects');
    spotifyRequestsApi.resetStreamer(entry.streamerId, 'max-reconnects');
  }

  const persistedStop = !!(entry.streamerId && !streamerHasOtherLiveConnections(entry.streamerId, entry.username, connectionMap));
  if (persistedStop) {
    streamersApi.setWantsConnected(entry.streamerId, false);
    streamersApi.markSessionEnd(entry.streamerId);
  }

  return { persistedStop };
}

function scheduleReconnect(entry, delayMs = 10000) {
  clearReconnectTimer(entry);

  // Stale entry: was superseded by a newer connection object. Ignore.
  if (entry.superseded) return;

  if ((entry.reconnectAttempts || 0) >= MAX_RECONNECT_ATTEMPTS) {
    const stopped = stopUntilManualRetrigger(entry);
    console.log(`[TikTok-Direct] @${entry.username} hit reconnect limit (${MAX_RECONNECT_ATTEMPTS}) — stopping until manually retriggered`);
    if (stopped.persistedStop) {
      console.log(`[TikTok-Direct] Cleared boot reconnect intent for @${entry.username} until the streamer manually reconnects`);
    }
    updateOverallStatus();
    return;
  }

  const nextAttempt = (entry.reconnectAttempts || 0) + 1;
  console.log(`[TikTok-Direct] Reconnecting to @${entry.username} in ${delayMs / 1000}s (attempt ${nextAttempt}/${MAX_RECONNECT_ATTEMPTS})...`);
  entry.reconnectTimer = setTimeout(() => {
    entry.reconnectTimer = null;
    if (entry.autoReconnect && !entry.superseded) {
      // Mark this entry dead so stale events/timers from the old connection can't
      // trigger another reconnect chain after we hand off to the new entry.
      entry.autoReconnect = false;
      entry.superseded = true;

      // Create fresh connection, preserving settings
      const opts = {
        autoReconnect: true,
        reconnectAttempts: nextAttempt,
        targetGame: entry.targetGame,
        streamerId: entry.streamerId,
      };
      connections.delete(entry.username);
      connectStream(entry.username, opts);
    }
  }, delayMs);
}

function clearReconnectTimer(entry) {
  if (entry.reconnectTimer) {
    clearTimeout(entry.reconnectTimer);
    entry.reconnectTimer = null;
  }
}

function startConnectTimeout(entry) {
  clearConnectTimeout(entry);
  entry.connectTimeoutTimer = setTimeout(() => {
    entry.connectTimeoutTimer = null;
    if (entry.superseded || entry.state !== STATE.CONNECTING) return;

    console.warn(`[TikTok-Direct] Connect timeout for @${entry.username} after ${CONNECT_TIMEOUT_MS}ms`);
    entry.state = STATE.DISCONNECTED;
    updateOverallStatus();

    try { entry.connection.disconnect(); } catch {}

    if (entry.autoReconnect) {
      scheduleReconnect(entry);
    }
  }, CONNECT_TIMEOUT_MS);
}

function clearConnectTimeout(entry) {
  if (entry.connectTimeoutTimer) {
    clearTimeout(entry.connectTimeoutTimer);
    entry.connectTimeoutTimer = null;
  }
}

function updateOverallStatus() {
  relay.broadcastStatus('tiktok', isConnected());
}

function extractSubscriberCount(roomInfo) {
  const candidates = [
    roomInfo?.owner?.subscribeInfo?.subscriberCount,
    roomInfo?.owner?.subscribeInfo?.subscriber_count,
    roomInfo?.owner?.stats?.subscriberCount,
    roomInfo?.owner?.stats?.subscriber_count,
    roomInfo?.user?.subscribeInfo?.subscriberCount,
    roomInfo?.user?.subscribeInfo?.subscriber_count,
    roomInfo?.liveRoomUserInfo?.user?.subscribeInfo?.subscriberCount,
    roomInfo?.liveRoomUserInfo?.user?.subscribeInfo?.subscriber_count,
  ];

  for (const candidate of candidates) {
    const parsed = parseCount(candidate);
    if (parsed > 0) return parsed;
  }
  return 0;
}

function parseCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(0, Math.round(value));
  if (typeof value !== 'string') return 0;

  const raw = value.trim().toUpperCase().replace(/,/g, '');
  const match = raw.match(/^(\d+(?:\.\d+)?)([KMB])?$/);
  if (!match) {
    const digits = raw.replace(/\D/g, '');
    return digits ? parseInt(digits, 10) : 0;
  }

  const base = parseFloat(match[1]);
  const suffix = match[2] || '';
  const mult = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : suffix === 'B' ? 1_000_000_000 : 1;
  return Math.round(base * mult);
}

/**
 * Update settings on a live connection (e.g. change target game).
 */
function updateStream(username, updates) {
  username = normalizeUsername(username);
  const entry = connections.get(username);
  if (!entry) return { ok: false, error: `Not connected to @${username}` };

  if ('targetGame' in updates) {
    entry.targetGame = updates.targetGame || null;
    console.log(`[TikTok-Direct] @${username} target game → ${entry.targetGame || 'all'}`);
  }
  return { ok: true };
}

module.exports = {
  connectStream,
  disconnectStream,
  disconnectAll,
  updateStream,
  getStatus,
  getSubscriberCount,
  fetchSubscriberCount,
  isConnected,
  __private: {
    STATE,
    extractErrorMessage,
    isOfflineConnectError,
    shouldSuppressConnectErrorLog,
    streamerHasOtherLiveConnections,
    stopUntilManualRetrigger,
  },
};
