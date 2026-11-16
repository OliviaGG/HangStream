/**
 * top-likers.js — Per-streamer, per-session TikTok like leaderboards.
 *
 * State is in-memory only. A session's leaderboard is reset when the
 * streamer's TikTok connection definitively ends (streamEnd, explicit
 * disconnect, or max reconnects). Transient disconnects do NOT reset.
 *
 * Each streamer (keyed by Discord ID) has an independent top-10.
 * The overlay URL is /toplikers/:discordId.
 */

const relay = require('./relay');

let io = null;
let getActiveGameInfo = async () => ({ activeGame: null, activeGameLabel: null });
let getEntryGameStats = async () => null;

// discordId → Map<tiktokUserId, { tiktokUserId, username, displayName, profilePic, likes, lastUpdate }>
const sessions = new Map();

// Coalesce rapid-fire like events — TikTok can burst 10+ like events per second.
// We defer broadcasts so the overlay doesn't get hammered.
const BROADCAST_DEBOUNCE_MS = 250;
const pendingBroadcasts = new Map(); // discordId → timer

function initialize(socketIO, options = {}) {
  io = socketIO;
  if (typeof options.getActiveGameInfo === 'function') {
    getActiveGameInfo = options.getActiveGameInfo;
  }
  if (typeof options.getEntryGameStats === 'function') {
    getEntryGameStats = options.getEntryGameStats;
  }
}

function recordLike({ streamerId, user, count }) {
  if (!streamerId || !user || !user.id) return;
  const n = Math.max(1, parseInt(count, 10) || 1);

  let session = sessions.get(streamerId);
  if (!session) {
    session = new Map();
    sessions.set(streamerId, session);
  }

  const key = String(user.id).toLowerCase();
  const existing = session.get(key);
  if (existing) {
    existing.likes += n;
    if (user.username) existing.username = user.username;
    if (user.displayName) existing.displayName = user.displayName;
    if (user.profilePic) existing.profilePic = user.profilePic;
    existing.lastUpdate = Date.now();
  } else {
    session.set(key, {
      tiktokUserId: key,
      username: user.username || String(user.id),
      displayName: user.displayName || user.username || String(user.id),
      profilePic: user.profilePic || null,
      likes: n,
      lastUpdate: Date.now(),
    });
  }

  scheduleBroadcast(streamerId);
}

function scheduleBroadcast(streamerId) {
  if (pendingBroadcasts.has(streamerId)) return;
  const timer = setTimeout(() => {
    pendingBroadcasts.delete(streamerId);
    broadcastUpdate(streamerId).catch(err => {
      console.warn('[TopLikers] broadcast failed:', err.message || err);
    });
  }, BROADCAST_DEBOUNCE_MS);
  pendingBroadcasts.set(streamerId, timer);
}

function topEntries(session, limit) {
  return [...session.values()]
    .sort((a, b) => b.likes - a.likes || a.lastUpdate - b.lastUpdate)
    .slice(0, limit);
}

function resolveLinkedDiscord(tiktokUserId) {
  try {
    return relay.lookupLinkedDiscord('tiktok', tiktokUserId);
  } catch {
    return null;
  }
}

async function resolveActiveGameInfo(streamerId) {
  try {
    const info = await getActiveGameInfo(streamerId);
    return {
      activeGame: info && info.activeGame ? String(info.activeGame) : null,
      activeGameLabel: info && info.activeGameLabel ? String(info.activeGameLabel) : null,
    };
  } catch {
    return { activeGame: null, activeGameLabel: null };
  }
}

async function resolveEntryStats(entry, activeGameInfo) {
  try {
    return await getEntryGameStats({
      activeGame: activeGameInfo.activeGame,
      activeGameLabel: activeGameInfo.activeGameLabel,
      linkedDiscord: entry.linkedDiscord || null,
      tiktokUserId: entry.tiktokUserId,
      username: entry.username,
      displayName: entry.displayName,
    });
  } catch {
    return null;
  }
}

async function enrich(entries, streamerId) {
  const activeGameInfo = await resolveActiveGameInfo(streamerId);
  const top = await Promise.all(entries.map(async (e, i) => {
    const linkedDiscord = resolveLinkedDiscord(e.tiktokUserId);
    const cos = await resolveCosmetics(linkedDiscord);
    const gameStats = await resolveEntryStats({ ...e, linkedDiscord }, activeGameInfo);
    return {
      rank: i + 1,
      tiktokUserId: e.tiktokUserId,
      username: e.username,
      displayName: cos?.preferredDisplayName || e.displayName,
      profilePic: cos?.profilePic || e.profilePic,
      likes: e.likes,
      cosmetics: cos?.equipped || null,
      linkedDiscord: linkedDiscord || null,
      linked: !!linkedDiscord,
      gameStats: gameStats || null,
    };
  }));

  return {
    activeGame: activeGameInfo.activeGame,
    activeGameLabel: activeGameInfo.activeGameLabel,
    top,
  };
}

async function resolveCosmetics(linkedDiscord) {
  try {
    if (!linkedDiscord) return null;
    return await relay.getUserCosmetics(linkedDiscord);
  } catch {
    return null;
  }
}

async function getTopLikers(streamerId, limit = 10) {
  const snapshot = await getTopLikersSnapshot(streamerId, limit);
  return snapshot.top;
}

function getSessionSize(streamerId) {
  const session = sessions.get(streamerId);
  return session ? session.size : 0;
}

async function getTopLikersSnapshot(streamerId, limit = 10) {
  const session = sessions.get(streamerId);
  const enriched = await enrich(session ? topEntries(session, limit) : [], streamerId);
  return {
    streamerId,
    top: enriched.top,
    totalLikers: getSessionSize(streamerId),
    activeGame: enriched.activeGame,
    activeGameLabel: enriched.activeGameLabel,
    ts: Date.now(),
  };
}

async function broadcastUpdate(streamerId) {
  if (!io) return;
  io.to(`toplikers:${streamerId}`).emit('toplikers-update', await getTopLikersSnapshot(streamerId, 10));
}

function resetStreamer(streamerId, reason = 'session-end') {
  const hadSession = sessions.delete(streamerId);
  const timer = pendingBroadcasts.get(streamerId);
  if (timer) {
    clearTimeout(timer);
    pendingBroadcasts.delete(streamerId);
  }
  if (hadSession && io) {
    io.to(`toplikers:${streamerId}`).emit('toplikers-reset', { streamerId, reason, ts: Date.now() });
  }
  if (hadSession) {
    console.log(`[TopLikers] Session reset for ${streamerId} (${reason})`);
  }
}

module.exports = {
  initialize,
  recordLike,
  getTopLikers,
  getTopLikersSnapshot,
  resetStreamer,
  getSessionSize,
};
