const fetch = require('./service-fetch').serviceFetch;
const { v4: uuidv4 } = require('uuid');
const db = require('./database');
const chatFilter = require('./chat-filter');
const sassie = require('./sassie-forwarder');
const ailicia = require('./ailicia');
const {
  WEBHOOK_MIN_INTERVAL_MS,
  WEBHOOK_MAX_EMBEDS_PER_REQUEST,
  getWebhookBackoffPlan,
  selectWebhookBatchSize,
  buildWebhookBatchPayload
} = require('./relay-webhook');
const streamers = require('./streamers');
const streamerGoals = require('./streamer-goals');
const spotifyRequests = require('./spotify-requests');
const streamerTts = require('./streamer-tts');
const widgetChatRouting = require('./widget-chat-routing');
const { linkedIdentityKey, resolveLinkedIdentity, linkedAliasIds } = require('./linked-identity');

const { STREAMER_TO_RELAY_ROOM, normalizeRelayRoomId } = widgetChatRouting;

function _resolveBroadcastRooms(msg) {
  // Returns array of room ids to broadcast to. Combines msg._targetGame
  // (legacy single primary) with the streamer's full activeGames list when
  // _streamerId is present (multi-game fan-out).
  const rooms = [];
  if (msg._targetGame) rooms.push(msg._targetGame);
  if (msg._streamerId) {
    const games = streamers.getActiveGames(msg._streamerId);
    for (const g of games) {
      const room = STREAMER_TO_RELAY_ROOM[g] || g;
      if (room && !rooms.includes(room)) rooms.push(room);
    }
  }
  return rooms;
}

function _normalizeRelayRoomId(gameId) {
  return normalizeRelayRoomId(gameId);
}

function _resolveWidgetChatTargets(msg, normalized) {
  if (!msg?._streamerId) return { usedWidgetRouting: false, targets: [] };
  let widgets = [];
  try {
    widgets = streamerGoals.getForStreamer(msg._streamerId)?.config?.widgets || [];
  } catch (_) {
    widgets = [];
  }
  const activeGames = streamers.getActiveGames(msg._streamerId);
  return widgetChatRouting.resolveWidgetChatTargets({
    widgets,
    activeGames,
    targetGame: msg._targetGame,
    normalized,
  });
}

// Recent-chatters per streamer — populated from chat events stamped with
// _streamerId. Used by /api/streamer/recent-chatters so the dashboard can
// show "block from list" candidates.
// Map<discordId, Map<"<platform>:<id>", { platform, id, name, lastChatAt, profilePic }>>
const _recentChattersByStreamer = new Map();
const _RECENT_CHATTERS_LIMIT = 50;

// ─── TikTok Fan Club bundle: universal grant + per-stream visibility ────
// Per-streamer membership recording is handled by _persistFanClubFromEvent
// (already present in this file). This block only adds the WT-side bundle
// grant + a broadcast-time visibility filter that strips fanClubOnly items
// for streams where the viewer isn't a fan-club member.
const _fanClubGrantAttempts = new Set(); // "tiktok:<viewerId>" — session-scoped grant dedupe
const _fanClubGrantInFlight = new Map(); // concurrent events share one grant request
const _superFanGrantAttempts = new Set(); // same dedupe for the Super Fan set
const _superDonorGrantAttempts = new Set(); // same dedupe for the Super Donor set

// Balances owing (/admin/balances) — per-viewer throttle for the on-stream
// "pay up" banner, so a blocked viewer spamming chat doesn't loop the popup.
// Stays tiny (one entry per flagged viewer) — no pruning needed.
const _owingBannerAt = new Map(); // tiktok_user_id -> last banner epoch ms
const OWING_BANNER_THROTTLE_MS = 30 * 1000;

// Batch-guessing perk (2026-07-20) — pasting multiple words as multiple guesses
// is a Donor Class / TikTok Super Fan perk. A non-entitled TikTok viewer who
// batches gets only their FIRST word forwarded to games (clamped per game route,
// AFTER any widget chat-prefix is stripped); a banner nudges them to subscribe.
// Their full comment still flows to chat / TTS / Discord — like the owing banner,
// the chat stays visible; only what reaches a game is limited. Entitled = owner-
// channel Super Fan (local is_superfan badge — also covers unlinked super fans)
// OR Donor (shared /api/public/entitlement, 60s cache, fail-open so an outage
// never strips a paying viewer's batch).
const _batchBannerAt = new Map();            // tiktok id -> last batch banner epoch ms
const BATCH_BANNER_THROTTLE_MS = 30 * 1000;
const _batchPerkCache = new Map();           // linkedDiscord -> { at, premium }
const BATCH_PERK_TTL_MS = 60 * 1000;
const CHAT_RELAY_SELF_URL = process.env.CHAT_RELAY_URL || 'http://localhost:3000';

// ─── Donor Class badge for CHAT identities ────────────────────────────────
// Super Fan and fan-club both have a per-user flag in our own database, so
// badging them is a local lookup. Donor Class does not: it lives in Word
// Tycoon's player_memberships, which is why chat users never wore a donor
// heart anywhere — stream view included.
//
// Read the whole active-donor set in ONE query and cache it, rather than
// resolving membership per message: chat is the hot path, and a per-user WT
// round-trip on every line would be untenable during a busy stream. The set is
// small (tens of rows) and 60s stale at worst.
//
// node:sqlite read-only, NOT sql.js — the WT database is ~150MB and sql.js
// would pull the whole file into memory on every refresh. Same reasoning as
// readWordTycoonSnapshot in server.js; keep the two consistent.
const WT_DB_PATH_FOR_DONORS = '/opt/word-tycoon/data/word-tycoon.db';
const DONOR_SET_TTL_MS = 60 * 1000;
let _donorSet = null;
let _donorSetAt = 0;

function _activeDonorAccounts() {
  if (_donorSet && Date.now() - _donorSetAt < DONOR_SET_TTL_MS) return _donorSet;
  let handle = null;
  try {
    const fs = require('fs');
    if (!fs.existsSync(WT_DB_PATH_FOR_DONORS)) return _donorSet || new Set();
    const { DatabaseSync } = require('node:sqlite');
    handle = new DatabaseSync(WT_DB_PATH_FOR_DONORS, { readOnly: true });
    const rows = handle.prepare(
      "SELECT discord_user_id FROM player_memberships WHERE status = 'active' AND tier IN ('donor_class', 'pookie_pass')"
    ).all();
    _donorSet = new Set(rows.map(r => String(r.discord_user_id)));
    _donorSetAt = Date.now();
    return _donorSet;
  } catch (e) {
    // Serve the stale set rather than silently un-badging every donor on a
    // transient read error.
    return _donorSet || new Set();
  } finally {
    try { handle?.close(); } catch (_) {}
  }
}

async function _viewerHasBatchPerk(normalized) {
  const badges = (normalized && normalized.user && normalized.user.badges) || [];
  if (badges.includes('superfan')) return true;   // owner-channel Super Fan — instant, no network
  const id = normalized && normalized.linkedDiscord;
  if (!id) return false;                            // unlinked & not a super fan → no perk
  const key = String(id);
  const hit = _batchPerkCache.get(key);
  if (hit && Date.now() - hit.at < BATCH_PERK_TTL_MS) return hit.premium;
  try {
    const r = await fetch(`${CHAT_RELAY_SELF_URL}/api/public/entitlement?discordId=${encodeURIComponent(key)}`);
    if (!r.ok) throw new Error('http ' + r.status);
    const data = await r.json();
    const premium = !!(data && data.premium);
    if (_batchPerkCache.size > 5000) _batchPerkCache.clear();
    _batchPerkCache.set(key, { at: Date.now(), premium });
    return premium;
  } catch (_) {
    return true; // fail-open — never strip a legit donor's batch over an entitlement hiccup
  }
}

const WT_API_BASE = process.env.WT_API_BASE || 'http://127.0.0.1:3020';
const WT_API_SECRET_FC = process.env.WT_API_SECRET || process.env.GAME_API_SECRET;

async function _maybeGrantFanClubBundle(msg) {
  if (!msg || msg.platform !== 'tiktok' || !msg.user?.isFanClub || !msg.user?.id) return;
  const dedupeKey = `tiktok:${msg.user.id}`;
  if (_fanClubGrantAttempts.has(dedupeKey)) return;
  if (_fanClubGrantInFlight.has(dedupeKey)) return _fanClubGrantInFlight.get(dedupeKey);
  const pending = _grantFanClubBundle(msg, dedupeKey);
  _fanClubGrantInFlight.set(dedupeKey, pending);
  try { await pending; } finally { _fanClubGrantInFlight.delete(dedupeKey); }
}

async function _grantFanClubBundle(msg, dedupeKey) {
  try {
    if (!WT_API_SECRET_FC) {
      console.warn('[FanClubGrant] WT_API_SECRET unset — skipping grant call');
      return;
    }

    const sh = _resolveStreamerHandle(msg._streamerId);
    // Send identifying info (username/displayName/profilePic) so WT can
    // auto-create the player row if one doesn't yet exist for this
    // TikTok identity. This bypasses the "link Discord first" friction
    // — fan-club viewers see their cosmetics immediately on the next
    // chip burst, no portal sign-up needed.
    const res = await fetch(WT_API_BASE + '/api/cosmetics/grant-fanclub-set', {
      method: 'POST',
      signal: AbortSignal.timeout(5000),
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET_FC },
      body: JSON.stringify({
        platform: 'tiktok',
        platformUserId: String(msg.user.id),
        username: msg.user.username || null,
        displayName: msg.user.displayName || msg.user.username || null,
        profilePic: msg.user.profilePic || null,
        setKey: 'tiktok_fc',
        source: `tiktok:${sh || 'unknown'}:fan-club-detected`
      })
    });
    if (!res.ok) {
      console.warn(`[FanClubGrant] ${dedupeKey}: HTTP ${res.status}; will retry on next event`);
      return;
    }
    const data = await res.json();
    if (!data.ok || (!data.granted && !data.alreadyGranted && !data.queued)) {
      console.warn(`[FanClubGrant] ${dedupeKey}: grant not confirmed; will retry on next event`);
      return;
    }
    if (data.granted || data.alreadyGranted) {
      _fanClubGrantAttempts.add(dedupeKey);
      _cosmeticsCache.delete(dedupeKey);
      const discordId = _lookupLinkedDiscord('tiktok', msg.user.id);
      if (discordId) _cosmeticsCache.delete(discordId);
    }
    if (data.granted) {
      console.log(`[FanClubGrant] Granted tiktok_fc to player ${data.playerId} via @${sh} (tiktok:${msg.user.id})`);
    } else if (data.queued) {
      console.log(`[FanClubGrant] Queued tiktok_fc for unlinked tiktok:${msg.user.id} via @${sh}`);
    }
  } catch (err) {
    console.warn(`[FanClubGrant] ${dedupeKey}: ${err.message}; will retry on next event`);
  }
}

// Super Fan bundle: auto-grant the Super Fan set ($10/mo tier reward).
// Mirrors _maybeGrantFanClubBundle — WT's grant endpoint is generic over
// setKey and idempotent via player_cosmetic_grants, and the set is
// keep-forever (no revoke on lapse, by design).
async function _maybeGrantSuperFanBundle(msg) {
  try {
    if (!msg || msg.platform !== 'tiktok') return;
    if (!msg.user?.id) return;

    const dedupeKey = `tiktok:${msg.user.id}`;
    if (_superFanGrantAttempts.has(dedupeKey)) return;
    _superFanGrantAttempts.add(dedupeKey);

    if (!WT_API_SECRET_FC) {
      console.warn('[SuperFanGrant] WT_API_SECRET unset — skipping grant call');
      return;
    }

    const sh = _resolveStreamerHandle(msg._streamerId);
    const res = await fetch(WT_API_BASE + '/api/cosmetics/grant-fanclub-set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET_FC },
      body: JSON.stringify({
        platform: 'tiktok',
        platformUserId: String(msg.user.id),
        username: msg.user.username || null,
        displayName: msg.user.displayName || msg.user.username || null,
        profilePic: msg.user.profilePic || null,
        setKey: 'superfan',
        source: `tiktok:${sh || 'unknown'}:superfan-detected`
      })
    });
    if (!res.ok) {
      _superFanGrantAttempts.delete(dedupeKey);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.granted) {
      console.log(`[SuperFanGrant] Granted Super Fan set to player ${data.playerId} via @${sh} (tiktok:${msg.user.id})`);
    } else if (data.queued) {
      console.log(`[SuperFanGrant] Queued Super Fan set for unlinked tiktok:${msg.user.id} via @${sh}`);
    }
  } catch (err) {
    // Network failure (e.g. WT mid-restart): clear the dedupe so the next
    // chat message retries instead of silently never granting.
    try { _superFanGrantAttempts.delete(`tiktok:${msg.user.id}`); } catch (_) {}
    console.warn('[SuperFanGrant] error:', err.message);
  }
}

// Super Donor bundle: the top set, for chatters holding BOTH Super Fan and
// Donor Class. The caller has already established both, so there is nothing to
// check here beyond the usual dedupe — same generic WT endpoint, same
// idempotence via player_cosmetic_grants, same keep-forever policy.
//
// Note this fires on the TikTok side only. The Pookie Pass route reaches the
// same set through membership.js, since Pookie is both entitlements at once.
async function _maybeGrantSuperDonorBundle(msg) {
  try {
    if (!msg || msg.platform !== 'tiktok') return;
    if (!msg.user?.id) return;

    const dedupeKey = `tiktok:${msg.user.id}`;
    if (_superDonorGrantAttempts.has(dedupeKey)) return;
    _superDonorGrantAttempts.add(dedupeKey);

    if (!WT_API_SECRET_FC) {
      console.warn('[SuperDonorGrant] WT_API_SECRET unset — skipping grant call');
      return;
    }

    const sh = _resolveStreamerHandle(msg._streamerId);
    const res = await fetch(WT_API_BASE + '/api/cosmetics/grant-fanclub-set', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET_FC },
      body: JSON.stringify({
        platform: 'tiktok',
        platformUserId: String(msg.user.id),
        username: msg.user.username || null,
        displayName: msg.user.displayName || msg.user.username || null,
        profilePic: msg.user.profilePic || null,
        setKey: 'super_donor',
        source: `tiktok:${sh || 'unknown'}:super-donor-detected`
      })
    });
    if (!res.ok) {
      _superDonorGrantAttempts.delete(dedupeKey);
      return;
    }
    const data = await res.json().catch(() => ({}));
    if (data.granted) {
      console.log(`[SuperDonorGrant] Granted Super Donor to player ${data.playerId} via @${sh} (tiktok:${msg.user.id})`);
    } else if (data.queued) {
      console.log(`[SuperDonorGrant] Queued Super Donor for unlinked tiktok:${msg.user.id} via @${sh}`);
    }
  } catch (err) {
    try { _superDonorGrantAttempts.delete(`tiktok:${msg.user.id}`); } catch (_) {}
    console.warn('[SuperDonorGrant] error:', err.message);
  }
}

// Strip fanClubOnly cosmetics unless the viewer is a recorded fan-club
// member of the source stream's streamer. Source = msg._streamerId →
// streamer handle. No stream context → drop all fanClubOnly items.
// `equipped` is { category: cssObject } where each css object may carry
// __fanClubOnly:true (added in WT's getPlayerEquipped).
function _filterFanClubByStream(equipped, msg) {
  if (!equipped) return null;
  const sh = msg && msg._streamerId ? _resolveStreamerHandle(msg._streamerId) : null;
  let memberOfSource = false;
  if (sh && msg.platform === 'tiktok' && msg.user?.id) {
    try {
      memberOfSource = db.isFanClubOfStreamer('tiktok', String(msg.user.id), sh);
    } catch (_) {}
  }
  if (memberOfSource) {
    // If a streamer has chosen a custom FC title (e.g. "Pookie"), substitute
    // the catalog default ('Fan Club') with theirs for this broadcast.
    if (equipped.title && equipped.title.__fanClubOnly && equipped.title.title && msg._streamerId) {
      let customTitle = null;
      try { customTitle = streamers.getFcTitle(msg._streamerId); } catch (_) {}
      if (customTitle && customTitle !== equipped.title.title) {
        return { ...equipped, title: { ...equipped.title, title: customTitle } };
      }
    }
    return equipped;
  }

  let modified = false;
  const out = {};
  for (const cat of Object.keys(equipped)) {
    const v = equipped[cat];
    if (v && v.__fanClubOnly) { modified = true; continue; }
    out[cat] = v;
  }
  return modified ? out : equipped;
}

function _trackChatter(streamerId, normalized) {
  if (!streamerId) return;
  const u = normalized && normalized.user;
  if (!u || !u.id || !normalized.platform) return;
  const key = String(normalized.platform).toLowerCase() + ':' + String(u.id);
  let m = _recentChattersByStreamer.get(streamerId);
  if (!m) { m = new Map(); _recentChattersByStreamer.set(streamerId, m); }
  m.set(key, {
    platform: String(normalized.platform).toLowerCase(),
    id: String(u.id),
    name: u.displayName || u.username || '',
    profilePic: u.profilePic || null,
    lastChatAt: Date.now(),
  });
  if (m.size > _RECENT_CHATTERS_LIMIT) {
    // Drop oldest by lastChatAt
    const sorted = [...m.entries()].sort((a, b) => a[1].lastChatAt - b[1].lastChatAt);
    const drop = m.size - _RECENT_CHATTERS_LIMIT;
    for (let i = 0; i < drop; i++) m.delete(sorted[i][0]);
  }
}

function getRecentChatters(streamerId, limit) {
  const m = _recentChattersByStreamer.get(streamerId);
  if (!m) return [];
  const arr = [...m.values()].sort((a, b) => b.lastChatAt - a.lastChatAt);
  return arr.slice(0, limit || 20);
}

function clearRecentChatters(streamerId) {
  _recentChattersByStreamer.delete(streamerId);
}



// Look up the streamer's session handle from a TikTok event's _streamerId.
// Game servers route incoming chat to a per-streamer private session when
// msg.streamerHandle is set; absent → falls through to the public game.
// Returns null when the streamer has disableSession=true or no handle.
function _resolveStreamerHandle(streamerId) {
  if (!streamerId) return null;
  const s = streamers.get(streamerId);
  if (!s || s.disableSession || !s.handle) return null;
  return s.handle;
}

// ─── WT logo fallback for missing/default avatars ────────────────────
// Single source of truth: when a user has no real pfp (null/empty) or
// only the Discord embed-default placeholder, downstream games should
// receive the Word Tycoon logo URL so they can apply the existing
// `avatar-is-logo` scale-up cosmetic. Mirrors the portal's resolveAvatar
// at /opt/chat-relay/public/portal/js/portal.js so the substitution
// happens consistently whether the pfp flows through the portal directly
// or through chat-relay's broadcast path.
const WT_LOGO_URL = 'https://wordtycoon.live/portal/img/logo.png';
const WT_HOST = 'https://wordtycoon.live';

// ── Voice TTS — chat-driven playback to streamer dashboard ───────────
// When a chat message arrives, check the streamer's voice settings. If
// the trigger matches, look up the viewer's voice preference and emit
// 'tts-play' to room 'voice-tts:<streamerDiscordId>' so their open
// dashboard tab plays the audio (which OBS picks up as window audio).

// Private/clone voices may list Discord snowflakes or platform-prefixed
// viewer keys (e.g. 'tiktok:aquaelly') in allowedDiscordIds.
function _isVoiceAllowedForViewer(voiceMeta, viewerKey, linkedDiscord) {
  if (!voiceMeta) return true;
  const allowed = voiceMeta.allowedDiscordIds;
  if (!Array.isArray(allowed) || allowed.length === 0) return true;
  if (viewerKey && allowed.includes(viewerKey)) return true;
  if (linkedDiscord && allowed.includes(linkedDiscord)) return true;
  return false;
}

function _maybeFireTTS(io, normalized, streamerDiscordId) {
  if (!io || !streamerDiscordId) return;
  // Settings come from streamer-tts.json (the file the dashboard writes
  // to). The legacy DB-based voice_streamer_settings table is dead code;
  // its setter is never invoked. Reading from a single source means the
  // dashboard's enable/trigger/voice changes always take effect.
  const settings = streamerTts.getSettings(streamerDiscordId);
  if (!settings || !settings.enabled) return;

  const rawText = String(normalized.message || '');
  let speakText;
  if (settings.trigger_mode === 'all') {
    speakText = rawText.trim();
  } else {
    const sym = settings.trigger_symbol || '.';
    if (!rawText.startsWith(sym)) return;
    speakText = rawText.slice(sym.length).trim();
  }
  if (!speakText || speakText.length > 500) return;

  // Streamer mute list lives in the JSON file alongside settings.
  const candidateKeys = [
    `${normalized.platform}:${normalized.user.id}`,
    normalized.user.username || '',
    normalized.user.displayName || '',
  ];
  const muted = streamerTts.getMuted(streamerDiscordId).map(k => String(k).toLowerCase());
  if (muted.length) {
    for (const cand of candidateKeys) {
      if (!cand) continue;
      const lc = String(cand).toLowerCase();
      if (muted.some(m => lc === m || lc.includes(m) || m.includes(lc))) return;
    }
  }

  const viewerName = normalized.user.displayName || normalized.user.username || 'someone';
  const room = 'voice-tts:' + streamerDiscordId;

  // Voice resolution priority — single fallback chain:
  //   1. Viewer's saved voice preference (paid/linked viewers picked one)
  //   2. Streamer's voice_id from streamer-tts.json (e.g. Indra for grace)
  //   3. Browser's default speechSynthesis voice (last-resort, robotic)
  // The third tier guarantees TTS always fires — previously unlinked
  // viewers fell straight to browser default even when the streamer had
  // a chosen voice configured, which felt inconsistent across viewers.
  let mp3Url = null;
  let voiceKey = null;            // 'web:us-female' etc. for Web Speech voices
  let gain = 1;
  let chosenVoiceId = null;
  if (normalized.linkedDiscord) {
    try {
      const pref = db.getVoicePreference(normalized.linkedDiscord);
      if (pref?.voice_id) chosenVoiceId = pref.voice_id;
    } catch (_) {}
  }
  if (!chosenVoiceId) {
    // Unlinked viewers (no Discord/WT account) can still get an assigned
    // voice — admins key the preference by `platform:userId`, the same
    // key shape the mute list uses (e.g. `tiktok:dadsareforlosers`).
    try {
      const pref = db.getVoicePreference(`${normalized.platform}:${normalized.user.id}`);
      if (pref?.voice_id) chosenVoiceId = pref.voice_id;
    } catch (_) {}
  }
  if (!chosenVoiceId && settings.voice_id) chosenVoiceId = settings.voice_id;
  // Final fallback — `web:default` (eSpeak robotic). Intentionally lower
  // quality than the pickable Piper voices so unconfigured viewers hear
  // an obviously-cheap voice that nudges them to pick a better one (still
  // free) or upgrade to Donor Class / Pookie Pass for ElevenLabs voices.
  if (!chosenVoiceId) chosenVoiceId = 'web:default';

  // Enforce private/clone voice allowlists. If the chosen voice is restricted
  // and this viewer isn't on the list, fall back to the streamer's default
  // (if allowed) and finally to the free robotic default.
  const viewerKey = candidateKeys[0];
  const chosenMeta = _voiceCatalogById && _voiceCatalogById[chosenVoiceId];
  if (chosenMeta && !_isVoiceAllowedForViewer(chosenMeta, viewerKey, normalized.linkedDiscord)) {
    const fallbackId = settings.voice_id || 'web:default';
    const fallbackMeta = _voiceCatalogById && _voiceCatalogById[fallbackId];
    chosenVoiceId = (fallbackMeta && _isVoiceAllowedForViewer(fallbackMeta, viewerKey, normalized.linkedDiscord))
      ? fallbackId
      : 'web:default';
  }

  if (chosenVoiceId) {
    if (chosenVoiceId.startsWith('web:')) {
      // Free tier — served by voice-tts /api/tts/free via the chat-relay
      // proxy. Produces an mp3 (Piper + ffmpeg) that the dashboard / overlay
      // plays through the HTML <audio> element. This path IS captured by
      // OBS browser source, unlike speechSynthesis which routes to system
      // audio. We still emit voiceKey as a hint so the dashboard's
      // speechSynthesis fallback can fire if the proxy request fails.
      mp3Url = '/api/voice/tts-free?voice_key=' + encodeURIComponent(chosenVoiceId) +
               '&text=' + encodeURIComponent(speakText);
      voiceKey = chosenVoiceId;
    } else {
      mp3Url = '/api/voice/tts?voice_id=' + encodeURIComponent(chosenVoiceId) +
               '&text=' + encodeURIComponent(speakText);
    }
    const voiceMeta = _voiceCatalogById && _voiceCatalogById[chosenVoiceId];
    if (voiceMeta && typeof voiceMeta.gain === 'number') gain = voiceMeta.gain;
  }

  // Three modes:
  //   mp3Url    → fetch + play (ElevenLabs)
  //   voiceKey  → speechSynthesis with specific voice (free Web voice)
  //   neither   → speechSynthesis default (unlinked + streamer has no voice)
  io.to(room).emit('tts-play', {
    viewerName,
    text: speakText,
    viewerKey,
    mp3Url,
    voiceKey,
    gain,
    useBrowserTTS: !mp3Url,
    timestamp: Date.now(),
  });
}

// Lazy catalog cache so _maybeFireTTS can look up per-voice gain without
// HTTP roundtrips per chat message. Refreshed every 5 min.
let _voiceCatalogById = null;
let _voiceCatalogFetchedAt = 0;
async function _refreshVoiceCatalogCache() {
  const VOICE_URL = process.env.VOICE_URL || 'http://localhost:3032';
  try {
    const r = await fetch(`${VOICE_URL}/api/voices/list`);
    if (!r.ok) return;
    const j = await r.json();
    const byId = {};
    for (const v of (j.voices || [])) byId[v.id] = v;
    _voiceCatalogById = byId;
    _voiceCatalogFetchedAt = Date.now();
  } catch (_) {}
}
setInterval(() => {
  if (Date.now() - _voiceCatalogFetchedAt > 5 * 60 * 1000) _refreshVoiceCatalogCache();
}, 60 * 1000);
_refreshVoiceCatalogCache();
function isDiscordEmbedDefault(url) {
  return typeof url === 'string' && url.indexOf('cdn.discordapp.com/embed/avatars/') !== -1;
}
// Root-relative URLs from WT (custom uploads at /portal/uploads/avatars/…
// and profile-logo cosmetics at /portal/assets/profile-logos/…) only
// resolve correctly on wordtycoon.live. Game pages on different hosts
// (subtextle.com, wikisearchle.com, etc.) would 404 the same path on
// their own domain. Prefix with WT_HOST so every downstream game
// gets a fully-qualified URL it can render directly. WikiSearchle
// already does this client-side via its own resolvePfp, but Searchle
// and the other games don't — fixing it once at the broadcast layer
// covers all of them.
function absolutizeWtPfp(url) {
  if (!url || typeof url !== 'string') return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (url.startsWith('/')) return WT_HOST + url;
  return url;
}
function withDefaultLogoFallback(url) {
  if (!url) return WT_LOGO_URL;
  if (isDiscordEmbedDefault(url)) return WT_LOGO_URL;
  return absolutizeWtPfp(url);
}

let io = null;
let webhookUrl = null;
let discordBot = null;
let bridgeNamespace = null;
// Optional consumer for chat destined to the Synapse multiplayer streamer mode.
// Set by server.js via setSynapseChatSink; called with (streamerId, normalized)
// only for messages whose _targetGame is 'synapse'. Never throws into the pipe.
let _synapseChatSink = null;
function setSynapseChatSink(fn) { _synapseChatSink = fn; }
let _letterworksChatSink = null;
function setLetterworksChatSink(fn) { _letterworksChatSink = fn; }
let _wordfallChatSink = null;
function setWordfallChatSink(fn) { _wordfallChatSink = fn; }

// Optional consumer for the "what do we play next" chat vote (gameVote widget).
// Set by server.js via setGameVoteChatSink; called with (streamerId, normalized)
// for every real viewer message. The sink itself decides whether a vote is open
// and whether the text is a ballot number — it NEVER suppresses the message, so
// a bare "2" still reaches the games when no vote is running.
let _gameVoteChatSink = null;
function setGameVoteChatSink(fn) { _gameVoteChatSink = fn; }

// Called by server.js once the /streamer-bridge namespace is wired up.
// Events for a streamer-scoped TikTok feed get mirrored here so the local
// Tycoon Stream Bridge can subscribe via its paste-in token.
function setBridgeNamespace(ns) {
  bridgeNamespace = ns;
}

function _emitToBridge(streamerId, eventName, payload) {
  if (!bridgeNamespace || !streamerId) return;
  bridgeNamespace.to(`streamer:${streamerId}`).emit(eventName, payload);
}

// ─── Discord Webhook Rate Limiter ────────────────────────────────────
// Discord webhooks are rate-limited (~5 req/2s per webhook). We queue
// messages and drain with a minimum interval, backing off on 429s.
const _webhookQueue = [];
let _webhookTimer = null;
let _webhookDraining = false;
let _webhookBackoffUntil = 0;
let _webhookDropUntil = 0;
let _webhookLastTrimLogAt = 0;
let _webhookLastSuppressedLogAt = 0;
const WEBHOOK_MAX_QUEUE_LENGTH = parseInt(process.env.WEBHOOK_MAX_QUEUE_LENGTH || '250', 10);
const WEBHOOK_MAX_BATCH_SIZE = Math.max(1, Math.min(
  WEBHOOK_MAX_EMBEDS_PER_REQUEST,
  parseInt(process.env.WEBHOOK_MAX_BATCH_SIZE || String(WEBHOOK_MAX_EMBEDS_PER_REQUEST), 10) || 1
));
const WEBHOOK_MAX_TRANSIENT_RETRIES = Math.max(0, Math.min(
  5,
  parseInt(process.env.WEBHOOK_MAX_TRANSIENT_RETRIES || '2', 10) || 0
));
const _webhookStats = {
  enqueuedMessages: 0,
  deliveredMessages: 0,
  sentRequests: 0,
  rateLimitedRequests: 0,
  transientRetries: 0,
  droppedQueueMessages: 0,
  droppedCooldownMessages: 0,
  droppedFailedMessages: 0,
  lastSuccessAt: null,
  lastErrorAt: null
};

function getWebhookStats() {
  return {
    enabled: !!webhookUrl,
    queueLength: _webhookQueue.length,
    draining: _webhookDraining,
    maxQueueLength: WEBHOOK_MAX_QUEUE_LENGTH,
    maxBatchSize: WEBHOOK_MAX_BATCH_SIZE,
    maxTransientRetries: WEBHOOK_MAX_TRANSIENT_RETRIES,
    backoffRemainingMs: Math.max(0, _webhookBackoffUntil - Date.now()),
    cooldownRemainingMs: Math.max(0, _webhookDropUntil - Date.now()),
    ..._webhookStats
  };
}

function _enqueueWebhook(payload) {
  const now = Date.now();
  if (now < _webhookDropUntil) {
    _webhookStats.droppedCooldownMessages += 1;
    if (now - _webhookLastSuppressedLogAt >= 60_000) {
      _webhookLastSuppressedLogAt = now;
      console.warn(
        `[Relay] Webhook suppressed during cooldown for ${Math.ceil((_webhookDropUntil - now) / 1000)}s`
      );
    }
    return;
  }

  if (_webhookQueue.length >= WEBHOOK_MAX_QUEUE_LENGTH) {
    const dropCount = (_webhookQueue.length - WEBHOOK_MAX_QUEUE_LENGTH) + 1;
    _webhookQueue.splice(0, dropCount);
    _webhookStats.droppedQueueMessages += dropCount;
    if (now - _webhookLastTrimLogAt >= 60_000) {
      _webhookLastTrimLogAt = now;
      console.warn(
        `[Relay] Webhook queue trimmed by ${dropCount} stale payload(s) (cap ${WEBHOOK_MAX_QUEUE_LENGTH})`
      );
    }
  }

  _webhookQueue.push({ payload, attempts: 0 });
  _webhookStats.enqueuedMessages += 1;
  if (!_webhookTimer && !_webhookDraining) _drainWebhookQueue();
}

async function _drainWebhookQueue() {
  // Single-flight guard: while a send is awaiting fetch, _webhookTimer is
  // null, so every _enqueueWebhook during that await would otherwise start
  // another concurrent drain — dozens of parallel POSTs under live chat,
  // which is what got the whole box IP-banned by Discord's edge (2026-08-03).
  if (_webhookDraining) return;
  _webhookTimer = null;
  if (_webhookQueue.length === 0) return;

  const now = Date.now();
  if (now < _webhookBackoffUntil) {
    const wait = _webhookBackoffUntil - now;
    _webhookTimer = setTimeout(_drainWebhookQueue, wait);
    return;
  }

  _webhookDraining = true;
  const batchSize = selectWebhookBatchSize(
    _webhookQueue.map((entry) => entry.payload),
    WEBHOOK_MAX_BATCH_SIZE
  );
  const batchEntries = _webhookQueue.splice(0, batchSize);
  const payload = buildWebhookBatchPayload(
    batchEntries.map((entry) => entry.payload),
    process.env.DISCORD_WEBHOOK_BOT_NAME || 'Word Tycoon Live Chat'
  );
  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (response.status === 429) {
      _webhookStats.rateLimitedRequests += 1;
      _webhookStats.lastErrorAt = new Date().toISOString();
      // Respect retry_after from JSON body (Discord sends seconds as float),
      // but don't keep stale chat messages queued for half an hour.
      let jsonRetryAfterSeconds = null;
      let hadBucketRetryAfter = false;
      try {
        const json = await response.json();
        // A bucket 429 always carries retry_after. A global block is JSON too
        // ({"code":0,"message":"You are being blocked…global rate limits"})
        // but has NO retry_after — only the header, in seconds.
        if (json.retry_after != null) {
          hadBucketRetryAfter = true;
          jsonRetryAfterSeconds = json.retry_after;
        }
      } catch { /* non-JSON body — Cloudflare edge ban page */ }
      const plan = getWebhookBackoffPlan({
        jsonRetryAfterSeconds,
        headerRetryAfter: response.headers.get('retry-after'),
        hadBucketRetryAfter
      });

      if (plan.dropPayload) {
        const droppedQueued = _webhookQueue.length;
        _webhookStats.droppedCooldownMessages += batchEntries.length + droppedQueued;
        console.error(
          `[Relay] Webhook 429 — requested ${plan.requestedRetryMs}ms; dropping stale payload and ${droppedQueued} queued payload(s), cooling down ${plan.effectiveRetryMs}ms`
        );
        _webhookQueue.length = 0;
        _webhookDropUntil = Date.now() + plan.effectiveRetryMs;
        _webhookBackoffUntil = _webhookDropUntil;
        return;
      }

      console.error(`[Relay] Webhook 429 — backing off ${plan.effectiveRetryMs}ms (queue: ${_webhookQueue.length + batchEntries.length})`);
      _webhookBackoffUntil = Date.now() + plan.effectiveRetryMs;
      _webhookQueue.unshift(...batchEntries); // put the whole batch back at the front
      _webhookTimer = setTimeout(_drainWebhookQueue, plan.effectiveRetryMs);
      return;
    }

    if (!response.ok) {
      console.error('[Relay] Webhook error:', response.status);
      _webhookStats.lastErrorAt = new Date().toISOString();
      if (response.status >= 500 && response.status <= 599) {
        const retryable = batchEntries.filter((entry) => entry.attempts < WEBHOOK_MAX_TRANSIENT_RETRIES);
        for (const entry of retryable) entry.attempts += 1;
        const dropped = batchEntries.length - retryable.length;
        _webhookStats.transientRetries += retryable.length;
        _webhookStats.droppedFailedMessages += dropped;
        if (retryable.length > 0) {
          const retryDelay = Math.min(30_000, WEBHOOK_MIN_INTERVAL_MS * (2 ** retryable[0].attempts));
          _webhookQueue.unshift(...retryable);
          _webhookTimer = setTimeout(_drainWebhookQueue, retryDelay);
        }
      } else {
        _webhookStats.droppedFailedMessages += batchEntries.length;
      }
    } else {
      _webhookStats.deliveredMessages += batchEntries.length;
      _webhookStats.sentRequests += 1;
      _webhookStats.lastSuccessAt = new Date().toISOString();
    }
  } catch (err) {
    console.error('[Relay] Webhook send failed:', err.message);
    _webhookStats.lastErrorAt = new Date().toISOString();
    const retryable = batchEntries.filter((entry) => entry.attempts < WEBHOOK_MAX_TRANSIENT_RETRIES);
    for (const entry of retryable) entry.attempts += 1;
    const dropped = batchEntries.length - retryable.length;
    _webhookStats.transientRetries += retryable.length;
    _webhookStats.droppedFailedMessages += dropped;
    if (retryable.length > 0) {
      const retryDelay = Math.min(30_000, WEBHOOK_MIN_INTERVAL_MS * (2 ** retryable[0].attempts));
      _webhookQueue.unshift(...retryable);
      _webhookTimer = setTimeout(_drainWebhookQueue, retryDelay);
    }
  } finally {
    _webhookDraining = false;
  }

  if (_webhookQueue.length > 0 && !_webhookTimer) {
    _webhookTimer = setTimeout(_drainWebhookQueue, WEBHOOK_MIN_INTERVAL_MS);
  }
}

const WORD_TYCOON_URL = process.env.WORD_TYCOON_URL || 'http://localhost:3020';

// ─── Cosmetics Cache (from Word Tycoon API) ──────────────────────────
const _cosmeticsCache = new Map(); // discordId → { data, ts }
const COSMETICS_CACHE_TTL = 5 * 60_000; // 5 min

// Periodic cleanup of stale cosmetics cache entries (every 10 minutes)
setInterval(() => {
  const now = Date.now();
  for (const [id, entry] of _cosmeticsCache) {
    if (now - entry.ts > COSMETICS_CACHE_TTL * 2) _cosmeticsCache.delete(id);
  }
}, 10 * 60_000);

async function _getUserCosmetics(discordId) {
  if (!discordId) return null;
  const cached = _cosmeticsCache.get(discordId);
  if (cached && Date.now() - cached.ts < COSMETICS_CACHE_TTL) return cached.data;
  try {
    const res = await fetch(`${WORD_TYCOON_URL}/api/cosmetics/discord/${discordId}`);
    if (!res.ok) return null;
    const data = await res.json();
    const payload = {
      equipped: data.equipped || {},
      preferredDisplayName: data.preferredDisplayName || null,
      // Raw value from WT: truthy = user has explicitly set a custom pfp,
      // null = no preference. Downstream code uses this distinction to
      // decide whether to override the live (TikTok) pfp. Don't apply the
      // WT-logo fallback here — that happens at the user-message-build
      // step where we know if the live message also had no pic.
      profilePic: data.profilePic || null
    };
    _cosmeticsCache.set(discordId, { data: payload, ts: Date.now() });
    return payload;
  } catch {
    return null;
  }
}

// Fetch cosmetics for a non-Discord-linked platform user (typically a
// TikTok viewer who never linked their Discord account). Hits WT's
// generic /api/cosmetics/:platform/:userId endpoint which returns the
// equipped set for that platform-identity row in the players table.
// Used so fan-club cosmetics can show without requiring Discord linking.
async function _getPlatformCosmetics(platform, userId) {
  if (!platform || !userId) return null;
  const cacheKey = `${platform}:${userId}`;
  const cached = _cosmeticsCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < COSMETICS_CACHE_TTL) return cached.data;
  try {
    const url = `${WORD_TYCOON_URL}/api/cosmetics/${encodeURIComponent(platform)}/${encodeURIComponent(userId)}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const payload = {
      equipped: data.equipped || {},
      preferredDisplayName: data.preferredDisplayName || null,
      profilePic: data.profilePic || null
    };
    _cosmeticsCache.set(cacheKey, { data: payload, ts: Date.now() });
    return payload;
  } catch {
    return null;
  }
}

// ─── Word Tycoon Linked Groups Cache ────────────────────────────────
// Maps "platform:userId" → discordUserId for cross-platform identity.
// Refreshed periodically from Word Tycoon's account linking API.
const _linkedCache = new Map();      // "tiktok:draybaebae" → "1132790718851711036"
let _linkedCacheReady = false;
const LINKED_CACHE_TTL = 5 * 60_000; // refresh every 5 minutes

async function _refreshLinkedCache() {
  try {
    const apiSecret = process.env.GAME_API_SECRET;
    // Account directory access uses the separate operator credential.
    const adminSecret = process.env.ADMIN_API_SECRET;
    if (!adminSecret) return;
    const res = await fetch(`${WORD_TYCOON_URL}/api/admin/accounts/linked-groups`, {
      headers: { 'x-api-key': apiSecret, 'x-admin-key': adminSecret }
    });
    if (!res.ok) return;
    const data = await res.json();
    const groups = data.groups || data;  // API returns { ok, groups, total }
    if (!Array.isArray(groups)) return;
    _linkedCache.clear();
    for (const group of groups) {
      const discordId = group.discordUserId;
      if (!discordId) continue;
      for (const p of group.platforms || []) {
        _linkedCache.set(linkedIdentityKey(p.platform, p.platformUserId), discordId);
      }
    }
    if (!_linkedCacheReady) {
      console.log(`[Relay] Linked-groups cache loaded (${_linkedCache.size} entries, ${groups.length} groups)`);
      _linkedCacheReady = true;
    } else {
      console.log(`[Relay] Linked-groups cache refreshed (${_linkedCache.size} entries, ${groups.length} groups)`);
    }
  } catch (err) {
    // Word Tycoon may not be running yet — silently retry later
    if (!_linkedCacheReady) {
      console.log('[Relay] Word Tycoon not reachable yet — linked-groups cache will retry');
    }
  }
}

function _lookupLinkedDiscord(platform, userId) {
  return _linkedCache.get(linkedIdentityKey(platform, userId)) || null;
}

// Same lookup when the caller knows the raw identity but NOT which platform it
// came from — game gates receive a client-asserted id that may be a TikTok
// handle, a numeric stream id, or a gh_/google_ web id, with no reliable way to
// tell them apart (TikTok numeric ids and Discord snowflakes are both 19
// digits). Memberships are keyed by the owning WT account, so without this a
// paying subscriber reads as free on every surface except a Discord login.
function _resolveAnyLinkedDiscord(rawId) {
  return resolveLinkedIdentity(_linkedCache, rawId);
}

function initialize(socketIO, webhook) {
  io = socketIO;
  webhookUrl = webhook;

  // Seed the linked-groups cache and refresh periodically
  _refreshLinkedCache();
  setInterval(_refreshLinkedCache, LINKED_CACHE_TTL);

  console.log('[Relay] Message relay initialized');
}

function setDiscordBot(bot) {
  discordBot = bot;
}

async function handleMessage(msg) {
  // Persist per-streamer FC membership for chat events the same way join/like/
  // gift events do. Without this, a viewer who chats while wearing the formal
  // Fan Club badge would have users.is_fan_club flipped (via getOrCreateUser
  // below) but no fan_club_memberships row — so isFanClubOfStreamer returns
  // false and the badge never shows.
  _persistFanClubFromEvent(msg);

  const streamerGameIds = msg._streamerId ? streamers.getActiveGames(msg._streamerId) : [];
  // Normalize the message
  const normalized = {
    id: msg.id || uuidv4(),
    platform: msg.platform,
    user: {
      id: msg.user.id,
      username: msg.user.username,
      displayName: msg.user.displayName || msg.user.username,
      // Keep raw — the precedence block below decides between TikTok pic,
      // WT custom (overrides TikTok), and WT-logo fallback (no pic anywhere).
      profilePic: msg.user.profilePic || null,
      badges: msg.user.badges || [],
      customColor: null,
      customNick: null
    },
    message: msg.message,
    timestamp: msg.timestamp || new Date().toISOString(),
    linkedDiscord: null,
    ttsEligible: false,
    musicRequestTier: 'none',
    streamerId: msg._streamerId || null,
    streamerHandle: _resolveStreamerHandle(msg._streamerId),
    streamerGameId: streamerGameIds[0] || null,
    streamerGameIds: streamerGameIds.length ? streamerGameIds.slice(0, 2) : [],
  };

  // Track chatter for streamer dashboard (only when this is a session msg).
  if (normalized.streamerHandle && msg._streamerId) {
    _trackChatter(msg._streamerId, normalized);
  }

  // Streamer-side blocklist enforcement. A blocked viewer's chat messages
  // must NOT reach the streamer's per-game rooms (else their guesses still
  // count, defeating the purpose). Block check is per-streamer so the same
  // viewer is only blocked for the streamer who blocked them — they can
  // still play other streamers' sessions or the public game. Uses the
  // same `user.id` key the recent-chatters cache uses for its "platform:id"
  // entries (which is what the dashboard's blockPlayer button sends to
  // /api/streamer/blocks), so the keys match end-to-end.
  if (msg._streamerId) {
    const _blockPlatform = normalized.platform || msg.platform;
    const _blockUserId = normalized.user?.id;
    if (_blockPlatform && _blockUserId &&
        streamers.isBlocked(msg._streamerId, _blockPlatform, _blockUserId)) {
      return;
    }
  }

  // Get/create user in database
  const dbUser = db.getOrCreateUser(msg.platform, msg.user.id, {
    username: msg.user.username,
    display_name: msg.user.displayName || msg.user.username,
    profile_pic: msg.user.profilePic,
    is_following: msg.user.isFollowing,
    is_subscriber: msg.user.isSubscriber,
    is_fan_club: msg.user.isFanClub,
    is_superfan: msg.user.isSuperfan,
    is_moderator: msg.user.isModerator
  });

  // Apply custom profile settings
  if (dbUser.custom_color) normalized.user.customColor = dbUser.custom_color;
  if (dbUser.custom_nick) normalized.user.customNick = dbUser.custom_nick;

  // Badge metadata can be absent after a join. The stream membership is
  // durable; use it even when this chat resets the legacy rollup flag.
  // Wait for any join/gift grant before fetching cosmetics for this guess.
  const fcHandle = _resolveStreamerHandle(msg._streamerId);
  if (msg.platform === 'tiktok' && (dbUser?.is_fan_club ||
      (fcHandle && db.isFanClubOfStreamer('tiktok', String(msg.user.id), fcHandle)))) {
    await _maybeGrantFanClubBundle({ ...msg, user: { ...msg.user, isFanClub: true } });
  }

  // Super Fan bundle grant — same signal as the 'superfan' badge below
  // (live is_superfan or the manual owner override table).
  if (msg.platform === 'tiktok' && (dbUser.is_superfan || db.isSuperfanOverride(msg.platform, msg.user.id))) {
    _maybeGrantSuperFanBundle(msg);
  }

  // Check cross-platform account linking (from Word Tycoon linked groups)
  const linkedDiscord = _lookupLinkedDiscord(msg.platform, msg.user.id);
  if (linkedDiscord) {
    normalized.linkedDiscord = linkedDiscord;
  } else if (msg.platform === 'discord' || msg.platform === 'mobile') {
    // Discord/mobile users ARE the discord identity — use their own ID
    normalized.linkedDiscord = msg.user.id;
  }

  // Check TTS eligibility: must be following or subscriber, TTS enabled, not banned
  if ((dbUser.is_following || dbUser.is_subscriber) && dbUser.tts_enabled && !dbUser.tts_banned) {
    normalized.ttsEligible = true;
    normalized.ttsVoice = dbUser.tts_voice;
  }

  // Add user badges
  if (dbUser.is_moderator) normalized.user.badges.push('moderator');
  // Fan-club is per-streamer. When the message is bound to a streamer's
  // private session (normalized.streamerHandle set), the badge fires only if
  // this viewer is registered as FC of THAT specific streamer. For unscoped
  // messages (cross-stream / public), fall back to the legacy "FC of any
  // streamer" flag so public surfaces still get a sensible badge.
  let _isFanClubMember = false;
  if (normalized.streamerHandle) {
    _isFanClubMember = db.isFanClubOfStreamer(msg.platform, msg.user.id, normalized.streamerHandle);
  } else {
    _isFanClubMember = !!dbUser.is_fan_club;
  }
  if (!dbUser.hide_fanclub_badge && _isFanClubMember) normalized.user.badges.push('fan-club');
  // Live is_superfan OR a manual owner override (the latter covers real Super
  // Fans TikTok's rare live signal never flagged). Drives the batch-guessing
  // fast-path in _viewerHasBatchPerk.
  if (dbUser.is_superfan || db.isSuperfanOverride(msg.platform, msg.user.id)) normalized.user.badges.push('superfan');
  // Donor Class — only resolvable for a chat identity that is LINKED to a Word
  // Tycoon account, since the membership is keyed by that account. An unlinked
  // donor chatting on TikTok is invisible to us here, which is exactly the
  // "NOT LINKED" case the Members hub exists to surface.
  if (normalized.linkedDiscord && _activeDonorAccounts().has(String(normalized.linkedDiscord))) {
    normalized.user.badges.push('donor');
  }
  // Super Donor is DERIVED — holding both of the above, nothing of its own to
  // look up. Pushed alongside them rather than replacing them so anything
  // reading for `superfan` or `donor` specifically still sees what it expects;
  // the badge renderer draws only the top tier, so the cluster stays clean.
  if (normalized.user.badges.includes('superfan') && normalized.user.badges.includes('donor')) {
    normalized.user.badges.push('super-donor');
    _maybeGrantSuperDonorBundle(msg);
  }
  if (dbUser.is_subscriber) normalized.user.badges.push('subscriber');
  if (dbUser.is_following) normalized.user.badges.push('follower');

  // Keep request eligibility separate from cosmetic badge visibility. A Fan
  // Club member who hides their badge still receives the three-song quota.
  if (normalized.user.badges.includes('donor') || normalized.user.badges.includes('superfan')) {
    normalized.musicRequestTier = 'unlimited';
  } else if (_isFanClubMember) {
    normalized.musicRequestTier = 'fan-club';
  } else if (dbUser.is_following) {
    normalized.musicRequestTier = 'follower';
  }

  // Fan-club "become a Pookie" promo feed (Feature 1): let ai_licia personally
  // invite recent chatters who aren't fan-club members yet. Existing members,
  // Super Fans, and moderators are flagged isMember so she never nudges them.
  // The module scopes this to the ai_licia channel and only acts when enabled.
  if (normalized.streamerHandle && ailicia.isEnabled()) {
    try {
      const isMember =
        db.isFanClubOfStreamer(msg.platform, msg.user.id, normalized.streamerHandle) ||
        normalized.user.badges.includes('superfan') ||
        normalized.user.badges.includes('moderator');
      ailicia.noteChatter(normalized.streamerHandle, {
        key: `${msg.platform}:${msg.user.id}`,
        platform: msg.platform,
        userId: msg.user.id,
        displayName: normalized.user.customNick || normalized.user.displayName,
        isMember
      });
    } catch (_) {}
  }

  // Pull Word Tycoon cosmetics + canonical preferred name/avatar before broadcasting.
  //
  // Three lookup paths:
  //   1. Discord-linked / Discord-platform user → /api/cosmetics/discord/<id>
  //      (handles cross-platform merge via WT's discord-keyed resolver)
  //   2. Non-linked TikTok user → /api/cosmetics/tiktok/<id>
  //      (picks up cosmetics granted directly to the platform identity,
  //       e.g. fan-club bundles auto-granted on FC detection without
  //       requiring Discord linking)
  //   3. Other unlinked platforms → no fetch (rare; would expand here
  //      if youtube/etc. ever gain platform-direct cosmetics)
  let cosmeticsPayload = null;
  if (normalized.linkedDiscord || (msg.platform === 'discord' || msg.platform === 'mobile')) {
    cosmeticsPayload = await _getUserCosmetics(normalized.linkedDiscord || msg.user.id);
  } else if (msg.platform === 'tiktok' && msg.user && msg.user.id) {
    cosmeticsPayload = await _getPlatformCosmetics('tiktok', msg.user.id);
  }
  if (cosmeticsPayload) {
    if (cosmeticsPayload?.preferredDisplayName) {
      normalized.user.displayName = cosmeticsPayload.preferredDisplayName;
      normalized.user.customNick = cosmeticsPayload.preferredDisplayName;
    }
    // Profile pic precedence (highest first):
    //   1. WT custom pfp explicitly set in /me portal — wins over TikTok.
    //      Per design: "when a user sets a pfp in WT profile it changes
    //      their pfp for all games". cosmeticsPayload.profilePic comes
    //      from WT's account_preferences.customAvatarUrl, set via
    //      POST /api/me/avatar. Truthy = explicit user choice.
    //   2. Live TikTok-supplied pic (signed CDN URL) — already on
    //      normalized.user.profilePic from the inbound message.
    //   3. WT logo fallback — only when neither WT nor TikTok has a
    //      pic, so anon viewers without an avatar still get a
    //      recognizable image instead of a text-initial circle.
    if (cosmeticsPayload?.profilePic) {
      // WT-supplied URLs are root-relative (/portal/uploads/avatars/… or
      // /portal/assets/profile-logos/…). Absolutize so game pages on
      // subtextle.com, etc. can render them — they 404 on root-relative
      // paths against their own host.
      normalized.user.profilePic = absolutizeWtPfp(cosmeticsPayload.profilePic);
    }
    // Attach equipped cosmetics to the chat-message broadcast so game pages
    // (WikiSearchle, RecTangled, etc.) can render hero badges, profile glow,
    // name color, title etc. without a separate fetch. Previously this was
    // only attached to the chat-widget message at line ~310 below — game
    // backends saw msg.user.cosmetics as undefined.
    // Per-stream visibility: strip items tagged __fanClubOnly when this
    // message originated on a stream whose handle the viewer is NOT a fan-
    // club member of. Public/cross-stream broadcasts drop them entirely.
    normalized.user.cosmetics = _filterFanClubByStream(cosmeticsPayload?.equipped, msg);
  }
  // Final pfp fallback (for ALL platforms, including those that skip the
  // cosmetics block above — youtube, discord-without-link, etc.): if
  // neither the live message nor a WT custom pfp provided anything, drop
  // in the WT logo URL so downstream games can render the recognizable
  // brand image instead of falling back to a text-initial circle.
  if (!normalized.user.profilePic) {
    normalized.user.profilePic = WT_LOGO_URL;
  }
  // Absolutize the final pfp URL. Covers TikTok pics rewritten to the
  // /api/avatar/tiktok/<id> persistent-proxy route by tiktok-direct.js
  // (root-relative on wordtycoon.live), so cross-origin game pages on
  // erectangled.com / rectangled.live / etc. can render them. No-op
  // for already-absolute URLs.
  normalized.user.profilePic = absolutizeWtPfp(normalized.user.profilePic);

  // Run stream messages through chat filter (censor bad words, strip zalgo/links)
  const filterResult = chatFilter.filterMessage(normalized.message, {
    id: normalized.linkedDiscord || normalized.user.id,
    discordId: normalized.linkedDiscord || normalized.user.id,
    badges: normalized.user.badges || []
  });
  if (!filterResult.allowed) {
    // Message blocked (banned/muted user or spam) — suppress entirely
    return;
  }
  normalized.message = filterResult.filtered;

  // Balances owing — admin-flagged viewers (/admin/balances) must pay before
  // they can play again. Their chat stays VISIBLE (stream chat widget, chat
  // room, TTS) so the stream looks normal, but nothing they type is ever
  // forwarded to a game — no guesses land anywhere — until the admin clears
  // them. Every message they send while flagged pops a "pay up" banner on
  // the goals overlay (throttled per viewer). TikTok-only: entries are keyed
  // by TikTok user id / handle.
  let owingEntry = null;
  if (normalized.platform === 'tiktok') {
    try {
      owingEntry = db.getActiveBalanceOwing([
        msg.user && msg.user.id,
        msg.user && msg.user.uniqueId,
        normalized.user.username,
      ]);
    } catch (e) { /* fail-open — the owing check must never break chat */ }
  }
  if (owingEntry) {
    try {
      db.recordOwingBlocked(owingEntry.tiktok_user_id);
      const now = Date.now();
      const last = _owingBannerAt.get(owingEntry.tiktok_user_id) || 0;
      if (now - last >= OWING_BANNER_THROTTLE_MS && io) {
        _owingBannerAt.set(owingEntry.tiktok_user_id, now);
        const banner = {
          tiktokUserId: owingEntry.tiktok_user_id,
          displayName: owingEntry.display_name || normalized.user.displayName
            || normalized.user.username || owingEntry.tiktok_user_id,
          profilePic: normalized.user.profilePic || null,
          amountDollars: Number(owingEntry.amount_dollars) || 0,
          streamerId: msg._streamerId || null,
        };
        // Scope to the streamer's goals room when the message came from a
        // streamer session; global fallback covers legacy unscoped paths
        // (only the goals overlay listens for this event, so a broad emit
        // is harmless).
        if (msg._streamerId) io.to(`goals:${msg._streamerId}`).emit('owing-blocked', banner);
        else io.emit('owing-blocked', banner);
      }
    } catch (e) { /* banner is best-effort */ }
  }

  // Batch-guessing perk gate (2026-07-20) — see _viewerHasBatchPerk. A TikTok
  // viewer who pastes multiple words only gets their FIRST word forwarded to
  // games unless they're a Donor / Super Fan. Entitlement is resolved lazily
  // (only when a real multi-word guess is seen) and clamping happens per game
  // route so widget chat-prefixes are stripped first. Owing viewers are already
  // fully blocked above, so they're excluded here.
  const _rawTok = String(normalized.message || '').trim().split(/\s+/).filter(Boolean);
  const _batchCandidate = !owingEntry && normalized.platform === 'tiktok' && _rawTok.length > 1;
  let _batchPerk = null;      // lazily-resolved entitlement (null until first batch seen)
  let _batchLimited = false;  // did we actually clamp a guess this message?
  // Games where a multi-token message is ONE guess, not a batch of guesses.
  // Clamping these would silently destroy a non-Donor's guess.
  const CLAMP_EXEMPT_GAMES = new Set(['colour500']);
  const _clampGuessForGame = async (text) => {
    if (!_batchCandidate) return text;
    const toks = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (toks.length <= 1) return text;                 // not a batch (after prefix strip)
    if (_batchPerk === null) _batchPerk = await _viewerHasBatchPerk(normalized);
    if (_batchPerk) return text;                       // Donor / Super Fan — batch freely
    _batchLimited = true;
    return toks[0];                                    // non-entitled — first word only
  };

  // Check for commands
  const commands = require('./commands');
  if (commands.isCommand(normalized.message)) {
    const result = await commands.handleCommand(normalized, { io, discordBot });
    if (result && result.response) {
      // Send command response back to chat
      const responseMsg = {
        id: uuidv4(),
        platform: 'system',
        user: {
          id: 'system',
          username: 'RelayBroadcast',
          displayName: 'Relay Broadcast Bot',
          profilePic: null,
          badges: ['bot']
        },
        message: result.response,
        timestamp: new Date().toISOString(),
        isSystem: true
      };
      io.emit('chat-message', responseMsg);

      // Also relay command responses to Discord if applicable
      if (result.discordResponse && discordBot) {
        discordBot.sendToChannel(result.discordResponse);
      }
    }
    if (result && result.suppress) return; // Don't relay command messages
  }

  // Feed the Synapse multiplayer streamer arena: each chat comment is a word
  // submission for that viewer in the streamer's race. Synapse has no game
  // server of its own — the arena lives in this process — so it can't be
  // reached by an io.to(room) emit like every other game. It gets fed here
  // instead, from the SAME resolved routes the room emits use, so a Synapse
  // game widget behaves identically to a Searchle/Betwixt one (per-widget
  // Displayed game + chat prefix both work). Best-effort — never blocks or
  // breaks the chat pipeline.
  const _feedSynapse = (gameId, text) => {
    const target = String(gameId || '').trim().toLowerCase();
    const sink = target === 'synapse' ? _synapseChatSink
      : target === 'letterworks' ? _letterworksChatSink
      : target === 'wordfall' ? _wordfallChatSink : null;
    if (!sink || owingEntry) return;
    if (!msg._streamerId || normalized.platform === 'system') return;
    try {
      sink(msg._streamerId, text === normalized.message ? normalized : { ...normalized, message: text });
    } catch (_) { /* arena must never break chat */ }
  };

  // Streamer overlay chat widgets listen in the existing goals room, which is
  // already scoped to one streamer and joined by stream-view/goals-overlay.
  // Bot players are excluded: they impersonate per-game WEBSITE players, and
  // website players never appear in the stream chat overlay — an "Anon #N"
  // line in the TikTok chat widget would give them away.
  if (msg._streamerId && normalized.platform !== 'system' && normalized.platform !== 'bot' && io) {
    io.to(`goals:${msg._streamerId}`).emit('stream-chat-message', {
      ...normalized,
      streamerId: msg._streamerId,
    });
  }

  // Next-game vote. Same scope as the chat widget above (real viewers only —
  // bots impersonate website players and must not stuff the ballot). Owing
  // viewers are NOT excluded: a poll isn't a guess, so the balance gate that
  // blocks gameplay below doesn't apply here. Best-effort — a vote must never
  // break the chat pipeline.
  if (_gameVoteChatSink && msg._streamerId
      && normalized.platform !== 'system' && normalized.platform !== 'bot') {
    try { _gameVoteChatSink(msg._streamerId, normalized); } catch (_) {}
  }

  // Broadcast to dashboard / game rooms. If the streamer has enabled game
  // widgets, chat routing follows those widget rules first so each embed can
  // target its own game and optional chat prefix. Otherwise fall back to the
  // legacy activeGames fan-out. Skipped entirely for balance-owing viewers —
  // this is THE gate that keeps their guesses out of every game.
  if (!owingEntry) {
    // Single-game routing for synthetic bot players (src/bot-players.js).
    // A real chat viewer's message fans out to every game the streamer has
    // live (widget routing below) — that's correct for humans in chat, but
    // bots impersonate independent per-game players, so the same guess
    // appearing in two games at once would be a tell. _botSoloGame pins the
    // message to exactly one game room and skips the fan-out.
    if (msg._botSoloGame && msg.platform === 'bot') {
      const soloGameId = String(msg._botSoloGame);
      const soloRoom = STREAMER_TO_RELAY_ROOM[soloGameId] || soloGameId;
      io.to(soloRoom).emit('chat-message', {
        ...normalized,
        gameId: soloGameId,
        streamerGameId: soloGameId,
        streamerGameIds: [soloGameId],
      });
      _feedSynapse(soloGameId, normalized.message);
      return;
    }
    const widgetRoutes = _resolveWidgetChatTargets(msg, normalized);
    if (widgetRoutes.usedWidgetRouting) {
      for (const route of widgetRoutes.targets) {
        const guessText = CLAMP_EXEMPT_GAMES.has(route.gameId)
          ? route.message
          : await _clampGuessForGame(route.message);
        const payload = {
          ...(guessText === normalized.message ? normalized : { ...normalized, message: guessText }),
          gameId: route.gameId || normalized.gameId,
          streamerGameId: route.gameId || normalized.streamerGameId,
          streamerGameIds: route.gameId ? [route.gameId] : normalized.streamerGameIds,
        };
        io.to(route.room).emit('chat-message', payload);
        // Arena is in-process, so the room emit above reaches nobody for
        // Synapse — hand the (prefix-stripped) text to the sink directly.
        _feedSynapse(route.gameId, route.message);
      }
    } else {
      const guessText = await _clampGuessForGame(normalized.message);
      const gamePayload = (guessText === normalized.message) ? normalized : { ...normalized, message: guessText };
      const rooms = _resolveBroadcastRooms(msg);
      if (rooms.length) {
        // Per room: an exempt game gets the untouched message, everyone else
        // gets the clamped one. Resolving once for all rooms would leak the
        // exemption to whatever other game the streamer has live.
        for (const r of rooms) {
          io.to(r).emit('chat-message', CLAMP_EXEMPT_GAMES.has(r) ? normalized : gamePayload);
        }
      } else {
        io.emit('chat-message', gamePayload);
      }
      // No game widgets configured — the streamer's primary active game is the
      // only route, so fall back to the legacy _targetGame check.
      _feedSynapse(msg._targetGame, normalized.message);
    }
  }

  // Voice TTS — fire-and-forget, checks streamer settings + trigger.
  try { _maybeFireTTS(io, normalized, msg._streamerId); } catch (_) {}

  // Mirror to the streamer-bridge namespace so a locally-running Tycoon
  // Stream Bridge can observe this streamer's own TikTok chat. Owing viewers
  // are excluded — the bridge feeds guesses into rectangled/sproutle-style
  // stream games, so mirroring them would reopen a guess path. Non-entitled
  // batchers are clamped to their first word here too (this is a guess path).
  if (!owingEntry) {
    const bridgeText = await _clampGuessForGame(normalized.message);
    _emitToBridge(msg._streamerId, 'chat-message',
      bridgeText === normalized.message ? normalized : { ...normalized, message: bridgeText });
  }

  // Non-entitled batcher nudge — fires once per message (throttled per viewer),
  // after the game forwards above have clamped the guess to the first word.
  if (_batchLimited && io) {
    try {
      const ttId = String((msg.user && msg.user.id) || normalized.user.username || 'anon');
      const now = Date.now();
      const last = _batchBannerAt.get(ttId) || 0;
      if (now - last >= BATCH_BANNER_THROTTLE_MS) {
        if (_batchBannerAt.size > 5000) _batchBannerAt.clear();
        _batchBannerAt.set(ttId, now);
        const banner = {
          tiktokUserId: ttId,
          displayName: normalized.user.displayName || normalized.user.username || ttId,
          profilePic: normalized.user.profilePic || null,
          streamerId: msg._streamerId || null,
        };
        if (msg._streamerId) io.to(`goals:${msg._streamerId}`).emit('batch-locked', banner);
        else io.emit('batch-locked', banner);
      }
    } catch (_) { /* banner is best-effort */ }
  }

  // Forward to Sassie (fire-and-forget, non-blocking)
  sassie.forwardChat(normalized);

  // Stream messages are NOT mirrored into the chat widget's main room
  // anymore (removed 2026-08-09): the widget's Lobby is the site-only chat,
  // and the widget v2 subscribes to the global 'chat-message' broadcast for
  // its Live Feed tab instead — mirroring here would double them up and put
  // TikTok chatter in the Lobby. This also stops the firehose being
  // persisted into the chat_messages 12-hour history.

  // Relay to Discord webhook (if not from Discord or mobile — mobile messages
  // already arrive via Discord webhook, so re-posting would create duplicates)
  if (msg.platform !== 'discord' && msg.platform !== 'mobile' && webhookUrl) {
    sendToDiscordWebhook(normalized);
  }
}

function sendToDiscordWebhook(msg) {
  const platformColors = {
    tiktok: 0x69C9D0,
    youtube: 0xFF0000,
    system: 0x808080
  };

  const displayName = msg.user.customNick || msg.user.displayName;
  const badges = msg.user.badges.map(b => {
    switch (b) {
      case 'fan-club': return '[FC]';
      case 'superfan': return '[SF]';
      case 'subscriber': return '[SUB]';
      case 'follower': return '[F]';
      default: return '';
    }
  }).filter(Boolean).join(' ');

  const platformLabel = msg.platform.charAt(0).toUpperCase() + msg.platform.slice(1);
  const username = badges ? `${displayName} ${badges}` : displayName;

  const description = String(msg.message || "").slice(0, 4096);
  const payload = {
    username: `${platformLabel} | ${displayName}`,
    avatar_url: msg.user.profilePic || undefined,
    embeds: [{
      description,
      color: platformColors[msg.platform] || 0x808080,
      author: {
        name: `${username} [${platformLabel}]`,
        icon_url: msg.user.profilePic || undefined
      },
      timestamp: msg.timestamp
    }]
  };

  _enqueueWebhook(payload);
}

// Persist FC status from any TikTok event payload (chat, join, like, gift,
// follow, share). Records per-streamer membership so jorry's fans don't show
// up as FC in another streamer's session — each (viewer, streamer) pair is
// its own row in fan_club_memberships. The legacy users.is_fan_club flag is
// also set as a "FC of at least one streamer" rollup for non-session contexts.
//
// In-process caches skip the redundant DB calls when the same FC viewer
// fires many events in quick succession (likes can hit 100+/sec). _seenFC*
// resets on process restart; sql.js itself is in-memory so a miss here just
// pays the cost of one no-op INSERT/UPDATE, but skipping the call entirely
// drops zero-value work off the hot path.
const _seenFCRollup = new Set();      // `${platform}|${pid}` once flagged globally
const _seenFCMembership = new Set();  // `${platform}|${pid}|${handle}` once recorded
function _persistFanClubFromEvent(data) {
  try {
    const u = data && data.user;
    if (!u || !u.isFanClub || !data.platform || !u.id) return;
    // Join and engagement events must grant too: a member need not chat
    // before receiving the set. The grant helper deduplicates and retries.
    _maybeGrantFanClubBundle(data);
    const rollupKey = `${data.platform}|${u.id}`;
    if (!_seenFCRollup.has(rollupKey)) {
      db.getOrCreateUser(data.platform, u.id, {
        username: u.username,
        display_name: u.displayName,
        profile_pic: u.profilePic,
        is_fan_club: 1
      });
      _seenFCRollup.add(rollupKey);
    }
    // Per-streamer scope: record membership for the streamer whose TikTok
    // connection this event came in on. _streamerId is the streamer's Discord
    // ID; resolveStreamerHandle maps it to a stable handle for the membership row.
    const sh = _resolveStreamerHandle(data._streamerId);
    if (sh) {
      const memberKey = `${data.platform}|${u.id}|${sh}`;
      if (!_seenFCMembership.has(memberKey)) {
        // Check persistent membership BEFORE recording so a genuine new join is
        // distinguished from an existing member (survives process restarts —
        // the in-process _seenFC set does not, but the DB row does).
        const wasMember = db.isFanClubOfStreamer(data.platform, u.id, sh);
        db.recordFanClubMembership(data.platform, u.id, sh);
        _seenFCMembership.add(memberKey);
        if (!wasMember && ailicia.isEnabled()) {
          // New Pookie! Let ai_licia give them a warm, personal welcome.
          try {
            ailicia.welcomeFanClubJoin(sh, {
              key: `${data.platform}:${u.id}`,
              platform: data.platform,
              userId: u.id,
              displayName: u.displayName || u.username
            });
          } catch (_) {}
        }
      }
    }
  } catch {}
}

function handleJoin(data) {
  if (!io) return;
  _persistFanClubFromEvent(data);

  // Persist the owner-channel Super Fan marker on join. tiktok-direct only sets
  // data.user.isSuperfan (to true) for owner-channel subscribers, so this DB
  // write fires rarely — never on generic joins where isSuperfan is undefined.
  if (data.user && data.user.isSuperfan !== undefined) {
    try {
      db.getOrCreateUser(data.platform, data.user.id, {
        username: data.user.username,
        display_name: data.user.displayName || data.user.username,
        is_superfan: data.user.isSuperfan
      });
    } catch (_) {}
  }

  const msg = {
    id: uuidv4(),
    platform: data.platform,
    user: {
      id: data.user.id,
      username: data.user.username,
      displayName: data.user.displayName || data.user.username,
      profilePic: withDefaultLogoFallback(data.user.profilePic),
      badges: data.user.badges || [],
      customColor: null,
      customNick: null
    },
    message: data.message || 'joined the stream',
    timestamp: new Date().toISOString(),
    isJoin: true,
    streamerHandle: _resolveStreamerHandle(data._streamerId)
  };

  // Keep join notices visible on relay/dashboard chat surfaces, but do not
  // emit them to game rooms as chat-message. Game servers treat chat-message
  // as guesses, and "joined the stream" can leak in as a fake guess.
  io.to('dashboard').emit('chat-message', msg);

  // Mirror joins as engagement so the local bridge can observe them without
  // feeding stream pages through their chat-to-guess path.
  _emitToBridge(data._streamerId, 'engagement', {
    type: 'join',
    platform: data.platform,
    user: msg.user,
    timestamp: msg.timestamp,
    streamerHandle: msg.streamerHandle
  });

  // Forward to Sassie (fire-and-forget)
  sassie.forwardJoin(data);
}

function handleEngagement(event) {
  // TikTok's Heart Me gift joins the sender to this streamer's fan club.
  // The gift/chat payload may not carry the portrait badge yet.
  if (event?.platform === 'tiktok' && event.type === 'gift' && event.user &&
      String(event.giftName || '').trim().toLowerCase() === 'heart me' &&
      event.diamondCount > 0) {
    event = { ...event, user: { ...event.user, isFanClub: true } };
  }
  _persistFanClubFromEvent(event);
  spotifyRequests.handleLike(event);
  // Tag with streamerHandle so game servers can route engagement events
  // (likes, gifts, follows, shares) into the streamer's private session
  // when one is active, parallel to the chat-message path.
  if (event && event._streamerId && !event.streamerHandle) {
    event.streamerHandle = _resolveStreamerHandle(event._streamerId);
  }
  if (io) {
    const rooms = _resolveBroadcastRooms(event);
    if (rooms.length) {
      for (const r of rooms) io.to(r).emit('engagement', event);
    } else {
      io.emit('engagement', event);
    }
  }

  // Per-streamer raw gift room for browser games (Junk Drawer TikTok mode).
  // Mirrors the win-overlay pattern: a browser joins 'streamer-gift:<handle>'
  // and gets a lightweight gift payload it can turn into gameplay.
  // Two names can address the same streamer here and they often differ:
  // _streamerHandle is the CONNECTED TIKTOK handle (museumcomesalive) while
  // widgets join with the SITE handle from their URL (jorrybeaufart). Emit to
  // both — otherwise gifts from a second TikTok account land in a room nobody
  // joined. .to().to() dedupes a socket that somehow sits in both rooms.
  if (io && event.type === 'gift') {
    const names = [event._streamerHandle, event.streamerHandle]
      .map((n) => String(n || '').toLowerCase().trim())
      .filter((n) => /^[a-z0-9_.-]{1,32}$/.test(n));
    const rooms = [...new Set(names)];
    if (rooms.length) {
      let target = io;
      for (const r of rooms) target = target.to('streamer-gift:' + r);
      target.emit('gift', {
        giftName: event.giftName,
        diamondCount: event.diamondCount,
        user: event.user ? {
          username: event.user.username,
          displayName: event.user.displayName,
          profilePic: event.user.profilePic,
        } : null,
      });
    }
  }

  // Mirror to streamer-bridge namespace for the local bridge observer.
  _emitToBridge(event._streamerId, 'engagement', event);

  // Forward gifts and follows to Sassie (fire-and-forget)
  sassie.forwardEngagement(event);
}

function broadcastStatus(platform, connected) {
  if (io) {
    io.emit('platform-status', { platform, connected });
  }
}

function broadcastTTSUpdate() {
  if (io) {
    const users = db.getTTSUsers();
    const settings = db.getAllTTSSettings();
    io.emit('tts-update', { users, settings });
  }
}

function clearCosmeticsCache(discordId) {
  if (discordId) _cosmeticsCache.delete(discordId);
}

module.exports = {
  initialize,
  setDiscordBot,
  setBridgeNamespace,
  handleMessage,
  setSynapseChatSink,
  setLetterworksChatSink,
  setWordfallChatSink,
  setGameVoteChatSink,
  handleJoin,
  handleEngagement,
  broadcastStatus,
  broadcastTTSUpdate,
  refreshLinkedCache: _refreshLinkedCache,
  refreshVoiceCatalogCache: _refreshVoiceCatalogCache,
  getUserCosmetics: _getUserCosmetics,
  lookupLinkedDiscord: _lookupLinkedDiscord,
  // Super Fan check for win-payload enrichment (pfp badge on win cards).
  // Same signal as the 'superfan' chat badge: live flag OR owner override.
  isSuperfanViewer: function (platform, userId) {
    try {
      if (!platform || !userId) return false;
      if (db.isSuperfanOverride(platform, String(userId))) return true;
      const u = db.getUserByPlatform(platform, String(userId));
      return !!(u && u.is_superfan);
    } catch (_) { return false; }
  },
  resolveAnyLinkedDiscord: _resolveAnyLinkedDiscord,
  linkedAliasIds: accountId => linkedAliasIds(_linkedCache, accountId),
  clearCosmeticsCache,
  getRecentChatters,
  clearRecentChatters,
  getWebhookStats
};
