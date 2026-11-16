/**
 * rooms.js — audience rooms for Word Tycoon.
 *
 * Streamer rooms are derived from the existing streamer registry so their
 * current game always follows the streamer's dashboard. Donor rooms are
 * persisted here and use the same private-session handles as streamer games,
 * keeping them separate from each game's public online round.
 *
 * Presence and ballots are deliberately in-memory. A relay restart should not
 * resurrect stale viewers or finish a vote nobody can still see.
 */

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, '..', 'data', 'rooms.json');
const HANDLE_RE = /^[a-z0-9](?:[a-z0-9_-]{0,30}[a-z0-9])?$/;
const DEFAULT_GAME = 'searchle';
const DEFAULT_VOTE_SECONDS = 45;
const RESULT_HOLD_MS = 8_000;
const INACTIVITY_MS = 10 * 60_000;
const ACTIVITY_SAVE_INTERVAL_MS = 30_000;

const ROOM_GAMES = Object.freeze([
  { id: 'searchle', label: 'Subtextle' },
  { id: 'searchle-grid', label: 'Subtextle Grid' },
  { id: 'searchle-numbers', label: 'Number Search' },
  { id: 'rectangled', label: 'recTangled' },
  { id: 'erectangled', label: 'erecTangled' },
  { id: 'wikisearchle', label: 'WikiContexto' },
  { id: 'wikirectangled', label: 'WikirecTangled' },
  { id: 'wikiword', label: 'WikiWord', streamerOnly: true },
  { id: 'wikiword-4x4', label: 'WikiWord 4x4' },
  { id: 'word500', label: 'Word5000' },
  { id: 'colour500', label: 'Color500' },
  { id: 'spellingbee', label: 'Spelling Bee' },
  { id: 'pixeletters', label: 'PixeLetters' },
  { id: 'wordle', label: 'Wordle' },
  { id: 'betwixt', label: 'Betwixt' },
  { id: 'figural', label: 'Figural' },
  { id: 'synapse', label: 'Synapse', streamerOnly: true },
  { id: 'letterworks', label: 'Letterworks', streamerOnly: true },
]);
const GAME_BY_ID = new Map(ROOM_GAMES.map((game) => [game.id, game]));

// These are real first-level site routes. A room can never claim one even if
// route ordering changes later.
const RESERVED_SLUGS = new Set([
  'activity-overlay', 'admin', 'api', 'apple-touch-icon', 'arcade', 'assets',
  'auth', 'betweenly', 'betweenly-multi', 'betwixt', 'betwixt-multi', 'color500',
  'colour500', 'cosmetics', 'css', 'download', 'erectangled',
  'erectangled-multi', 'erectangled-overlay', 'event-overlay', 'favicon', 'feed',
  'figural', 'figural-multi', 'fonts', 'game', 'games', 'goat', 'holo-win-overlay',
  'home', 'how-to-play', 'hub', 'images', 'jorry-overlay', 'js', 'junkdrawer',
  'library', 'letterworks', 'link-confirm', 'manifest', 'me', 'membership', 'monitor', 'overlay',
  'pixeletters', 'pixeletters-multi', 'play', 'portal', 'privacy', 'profile', 'qr',
  'rectangled', 'rectangled-multi', 'rectangled-single', 'room', 'rules',
  'searchle', 'searchle-single', 'searchle-toast', 'socket.io', 'sounds',
  'spellingbee', 'spellingbee-multi', 'spotify', 'spotify-overlay', 'sproutle',
  'sproutle-multi', 'sproutle-overlay', 'static', 'store', 'stream-bridge',
  'streambridge', 'streamer', 'subtextle', 'synapse', 'terms', 'tip-overlay',
  'toplikers', 'triangled', 'tycoonio', 'unwordle', 'wikicontexto',
  'wikirectangled', 'wikisearchle', 'wikiword', 'wikiword-4x4', 'win-overlay',
  'word-bank', 'word1000', 'word500', 'word500-multi', 'wordle', 'wordle-multi',
  'www',
]);

function normalizeGameId(value) {
  const id = String(value || '').trim().toLowerCase();
  return id === 'sproutle' ? 'erectangled' : id;
}

function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '')
    .replace(/-{2,}/g, '-')
    .slice(0, 32);
}

function publicUserRoom(record, memberCount) {
  return {
    slug: record.slug,
    type: 'user',
    displayName: record.displayName,
    ownerUsername: record.ownerUsername,
    currentGame: record.currentGame,
    open: record.open !== false,
    live: false,
    viewerCount: 0,
    memberCount,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

class RoomManager {
  constructor(options = {}) {
    this.dataFile = options.dataFile || DATA_FILE;
    this.now = options.now || (() => Date.now());
    this.random = options.random || Math.random;
    this.userRooms = {};
    this.presence = new Map(); // slug -> Map(socketId, participantKey)
    this.votes = new Map();
    this.voteTimers = new Map();
    this.deps = {
      getStreamerByHandle: () => null,
      listStreamers: () => [],
      isStreamerLive: () => false,
      getStreamerViewerCount: () => 0,
      switchStreamerGame: async () => false,
      onStateChange: () => {},
      ...(options.deps || {}),
    };
    if (options.autoLoad !== false) this.load();
  }

  configure(next = {}) {
    this.deps = { ...this.deps, ...next };
  }

  load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.dataFile, 'utf8'));
      const source = parsed && parsed.rooms && typeof parsed.rooms === 'object'
        ? parsed.rooms
        : (parsed && typeof parsed === 'object' ? parsed : {});
      this.userRooms = {};
      for (const [ownerId, raw] of Object.entries(source)) {
        if (!raw || typeof raw !== 'object') continue;
        const slug = slugify(raw.slug);
        if (!HANDLE_RE.test(slug) || RESERVED_SLUGS.has(slug)) continue;
        const currentGame = normalizeGameId(raw.currentGame);
        this.userRooms[String(ownerId)] = {
          ownerId: String(ownerId),
          slug,
          ownerUsername: String(raw.ownerUsername || slug).slice(0, 64),
          displayName: String(raw.displayName || raw.ownerUsername || slug).slice(0, 80),
          currentGame: GAME_BY_ID.has(currentGame) && !GAME_BY_ID.get(currentGame).streamerOnly
            ? currentGame
            : DEFAULT_GAME,
          open: raw.open !== false,
          createdAt: raw.createdAt || new Date(this.now()).toISOString(),
          updatedAt: raw.updatedAt || new Date(this.now()).toISOString(),
          lastActivityAt: raw.lastActivityAt || raw.updatedAt || raw.createdAt || new Date(this.now()).toISOString(),
        };
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('[Rooms] Failed to load:', error.message);
      }
      this.userRooms = {};
    }
  }

  save() {
    try {
      const dir = path.dirname(this.dataFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dataFile, JSON.stringify({ version: 1, rooms: this.userRooms }, null, 2));
    } catch (error) {
      console.error('[Rooms] Failed to save:', error.message);
      throw error;
    }
  }

  _streamerRoom(handle) {
    const slug = slugify(handle);
    if (!slug) return null;
    const streamer = this.deps.getStreamerByHandle(slug);
    if (!streamer || !streamer.discordId) return null;
    const currentGame = normalizeGameId(streamer.activeGame || DEFAULT_GAME) || DEFAULT_GAME;
    return {
      slug,
      type: 'streamer',
      ownerId: String(streamer.discordId),
      displayName: String(streamer.displayName || streamer.username || slug).slice(0, 80),
      ownerUsername: String(streamer.username || slug).slice(0, 64),
      currentGame,
      open: true,
      live: !!this.deps.isStreamerLive(String(streamer.discordId)),
      viewerCount: Math.max(0, Number(this.deps.getStreamerViewerCount(String(streamer.discordId))) || 0),
      memberCount: this.memberCount(slug),
      createdAt: streamer.whitelistedAt || null,
      updatedAt: streamer.updatedAt || null,
    };
  }

  _userRoomBySlug(handle) {
    const slug = slugify(handle);
    for (const record of Object.values(this.userRooms)) {
      if (record.slug === slug) return record;
    }
    return null;
  }

  getByOwner(ownerId) {
    return this.userRooms[String(ownerId || '')] || null;
  }

  isReservedSlug(slug) {
    return RESERVED_SLUGS.has(slugify(slug));
  }

  _slugTaken(slug, exceptOwnerId) {
    if (!slug || RESERVED_SLUGS.has(slug)) return true;
    const streamer = this.deps.getStreamerByHandle(slug);
    if (streamer && String(streamer.discordId) !== String(exceptOwnerId || '')) return true;
    const existing = this._userRoomBySlug(slug);
    return !!existing && String(existing.ownerId) !== String(exceptOwnerId || '');
  }

  _pickSlug(username, ownerId) {
    let base = slugify(username);
    if (!base) base = 'player';
    if (RESERVED_SLUGS.has(base)) base = `${base.slice(0, 27)}-room`;
    if (HANDLE_RE.test(base) && !this._slugTaken(base, ownerId)) return base;

    const suffix = String(ownerId || '').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(-6) || 'room';
    const candidate = `${base.slice(0, Math.max(1, 31 - suffix.length))}-${suffix}`;
    if (HANDLE_RE.test(candidate) && !this._slugTaken(candidate, ownerId)) return candidate;
    throw new Error('No available room link for this username');
  }

  createUserRoom({ ownerId, username, displayName }) {
    const id = String(ownerId || '').trim();
    if (!id) throw new Error('ownerId is required');
    const existing = this.userRooms[id];
    const nowIso = new Date(this.now()).toISOString();
    if (existing) {
      existing.ownerUsername = String(username || existing.ownerUsername || existing.slug).slice(0, 64);
      existing.displayName = String(displayName || existing.displayName || existing.ownerUsername).slice(0, 80);
      existing.open = true;
      existing.updatedAt = nowIso;
      existing.lastActivityAt = nowIso;
      this.save();
      this._emit(existing.slug);
      return { ...existing };
    }

    const slug = this._pickSlug(username || displayName, id);
    const record = {
      ownerId: id,
      slug,
      ownerUsername: String(username || slug).slice(0, 64),
      displayName: String(displayName || username || slug).slice(0, 80),
      currentGame: DEFAULT_GAME,
      open: true,
      createdAt: nowIso,
      updatedAt: nowIso,
      lastActivityAt: nowIso,
    };
    this.userRooms[id] = record;
    this.save();
    this._emit(slug);
    return { ...record };
  }

  setUserRoomOpen(ownerId, open) {
    const record = this.userRooms[String(ownerId || '')];
    if (!record) return null;
    record.open = !!open;
    record.updatedAt = new Date(this.now()).toISOString();
    if (record.open) record.lastActivityAt = record.updatedAt;
    this.save();
    if (!record.open) this.cancelVote(record.slug);
    this._emit(record.slug);
    return { ...record };
  }

  // Only real room interaction extends the lifetime. Polls and open browser
  // sockets do not keep an abandoned room listed indefinitely.
  markActivity(handle) {
    const record = this._userRoomBySlug(handle);
    if (!record || record.open === false) return false;
    const previous = Date.parse(record.lastActivityAt) || 0;
    if (this.now() - previous < ACTIVITY_SAVE_INTERVAL_MS) return true;
    record.lastActivityAt = new Date(this.now()).toISOString();
    this.save();
    return true;
  }

  expireInactive() {
    const now = this.now();
    const expired = [];
    for (const record of Object.values(this.userRooms)) {
      if (!record || record.open === false) continue;
      const lastActivity = Date.parse(record.lastActivityAt) || Date.parse(record.updatedAt) || Date.parse(record.createdAt);
      if (!Number.isFinite(lastActivity) || now - lastActivity < INACTIVITY_MS) continue;
      record.open = false;
      record.updatedAt = new Date(now).toISOString();
      expired.push(record.slug);
      this.cancelVote(record.slug);
    }
    if (expired.length) {
      this.save();
      for (const slug of expired) this._emit(slug);
    }
    return expired;
  }

  resolve(handle, { includeClosed = false } = {}) {
    const slug = slugify(handle);
    if (!HANDLE_RE.test(slug)) return null;
    const streamerRoom = this._streamerRoom(slug);
    if (streamerRoom) return streamerRoom;
    const record = this._userRoomBySlug(slug);
    if (!record || (!includeClosed && record.open === false)) return null;
    return { ...publicUserRoom(record, this.memberCount(slug)), ownerId: record.ownerId };
  }

  listPublic() {
    const out = [];
    const seen = new Set();
    for (const streamer of this.deps.listStreamers() || []) {
      if (!streamer || !streamer.handle) continue;
      const room = this._streamerRoom(streamer.handle);
      if (!room || !room.live || seen.has(room.slug)) continue;
      seen.add(room.slug);
      out.push(room);
    }
    for (const record of Object.values(this.userRooms)) {
      if (!record || record.open === false || seen.has(record.slug)) continue;
      seen.add(record.slug);
      out.push({ ...publicUserRoom(record, this.memberCount(record.slug)), ownerId: record.ownerId });
    }
    return out.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'streamer' ? -1 : 1;
      return (b.memberCount + b.viewerCount) - (a.memberCount + a.viewerCount)
        || a.displayName.localeCompare(b.displayName);
    });
  }

  getSessionHandles() {
    return Object.values(this.userRooms)
      .filter((room) => room && room.open !== false)
      .map((room) => room.slug);
  }

  availableGames(handle) {
    const room = this.resolve(handle, { includeClosed: true });
    const isStreamer = room && room.type === 'streamer';
    return ROOM_GAMES.filter((game) => isStreamer || !game.streamerOnly).map((game) => ({ ...game }));
  }

  async setGame(handle, gameId) {
    const slug = slugify(handle);
    const room = this.resolve(slug, { includeClosed: true });
    if (!room) throw new Error('Room not found');
    const nextGame = normalizeGameId(gameId);
    const game = GAME_BY_ID.get(nextGame);
    if (!game || (game.streamerOnly && room.type !== 'streamer')) throw new Error('Game is not available in this room');

    if (room.type === 'streamer') {
      await this.deps.switchStreamerGame(room.ownerId, nextGame);
    } else {
      const record = this.userRooms[room.ownerId];
      record.currentGame = nextGame;
      record.updatedAt = new Date(this.now()).toISOString();
      record.lastActivityAt = record.updatedAt;
      this.save();
    }
    this._emit(slug);
    return this.resolve(slug, { includeClosed: true });
  }

  join(handle, socketId, participantKey) {
    const slug = slugify(handle);
    if (!this.resolve(slug)) return null;
    let members = this.presence.get(slug);
    if (!members) {
      members = new Map();
      this.presence.set(slug, members);
    }
    members.set(String(socketId), String(participantKey || `guest:${socketId}`));
    this.markActivity(slug);
    this._emit(slug);
    return this.memberCount(slug);
  }

  leave(handle, socketId) {
    const slug = slugify(handle);
    const members = this.presence.get(slug);
    if (!members) return 0;
    members.delete(String(socketId));
    if (!members.size) this.presence.delete(slug);
    this._emit(slug);
    return this.memberCount(slug);
  }

  memberCount(handle) {
    const members = this.presence.get(slugify(handle));
    return members ? new Set(members.values()).size : 0;
  }

  _clearVoteTimer(slug) {
    const timer = this.voteTimers.get(slug);
    if (timer) clearTimeout(timer);
    this.voteTimers.delete(slug);
  }

  startVote(handle, { durationSeconds = DEFAULT_VOTE_SECONDS } = {}) {
    const slug = slugify(handle);
    const room = this.resolve(slug);
    if (!room) throw new Error('Room not found');
    const existing = this.votes.get(slug);
    if (existing && existing.phase === 'voting') throw new Error('A vote is already running');
    this._clearVoteTimer(slug);

    const ballot = this.availableGames(slug)
      .filter((game) => game.id !== normalizeGameId(room.currentGame))
      .map((game, index) => ({ n: index + 1, gameId: game.id, name: game.label }));
    if (!ballot.length) throw new Error('No other games are available');
    const seconds = Math.max(15, Math.min(120, Number(durationSeconds) || DEFAULT_VOTE_SECONDS));
    const state = {
      phase: 'voting',
      ballot,
      tallies: Object.fromEntries(ballot.map((item) => [item.gameId, 0])),
      voters: new Map(),
      startedAt: this.now(),
      endsAt: this.now() + (seconds * 1000),
      winnerGameId: null,
      tiebreak: false,
    };
    this.votes.set(slug, state);
    this.markActivity(slug);
    const timer = setTimeout(() => {
      this.finishVote(slug).catch((error) => console.error('[Rooms] Vote finish failed:', error.message));
    }, seconds * 1000);
    if (typeof timer.unref === 'function') timer.unref();
    this.voteTimers.set(slug, timer);
    this._emit(slug);
    return this.voteSnapshot(slug);
  }

  castVote(handle, voterId, gameId) {
    const slug = slugify(handle);
    const state = this.votes.get(slug);
    if (!state || state.phase !== 'voting') throw new Error('No vote is running');
    const voter = String(voterId || '').trim();
    if (!voter) throw new Error('Login required');
    if (state.voters.has(voter)) throw new Error('You already voted');
    const choice = state.ballot.find((item) => item.gameId === normalizeGameId(gameId));
    if (!choice) throw new Error('That game is not on this ballot');
    state.voters.set(voter, choice.gameId);
    this.markActivity(slug);
    state.tallies[choice.gameId] = (state.tallies[choice.gameId] || 0) + 1;
    this._emit(slug);
    return this.voteSnapshot(slug);
  }

  async finishVote(handle) {
    const slug = slugify(handle);
    const state = this.votes.get(slug);
    if (!state || state.phase !== 'voting') throw new Error('No vote is running');
    this._clearVoteTimer(slug);
    const totalVotes = Object.values(state.tallies).reduce((sum, count) => sum + count, 0);
    if (!totalVotes) {
      this.votes.delete(slug);
      this._emit(slug);
      return { ok: true, winnerGameId: null, reason: 'no-votes' };
    }

    const top = Math.max(...Object.values(state.tallies));
    const leaders = Object.entries(state.tallies).filter(([, count]) => count === top).map(([id]) => id);
    state.phase = 'result';
    state.tiebreak = leaders.length > 1;
    state.winnerGameId = leaders[Math.floor(this.random() * leaders.length)];
    state.resultEndsAt = this.now() + RESULT_HOLD_MS;
    await this.setGame(slug, state.winnerGameId);
    this._emit(slug);

    const timer = setTimeout(() => {
      this.votes.delete(slug);
      this.voteTimers.delete(slug);
      this._emit(slug);
    }, RESULT_HOLD_MS);
    if (typeof timer.unref === 'function') timer.unref();
    this.voteTimers.set(slug, timer);
    return { ok: true, winnerGameId: state.winnerGameId, tiebreak: state.tiebreak };
  }

  cancelVote(handle) {
    const slug = slugify(handle);
    const existed = this.votes.delete(slug);
    this._clearVoteTimer(slug);
    if (existed) this._emit(slug);
    return existed;
  }

  notify(handle) {
    this._emit(handle);
  }

  voteSnapshot(handle) {
    const state = this.votes.get(slugify(handle));
    if (!state) return { phase: 'idle' };
    const totalVotes = Object.values(state.tallies).reduce((sum, count) => sum + count, 0);
    return {
      phase: state.phase,
      startedAt: state.startedAt,
      endsAt: state.endsAt,
      secondsLeft: state.phase === 'voting'
        ? Math.max(0, Math.ceil((state.endsAt - this.now()) / 1000))
        : 0,
      totalVotes,
      winnerGameId: state.winnerGameId,
      tiebreak: state.tiebreak,
      ballot: state.ballot.map((item) => {
        const votes = state.tallies[item.gameId] || 0;
        return { ...item, votes, pct: totalVotes ? Math.round((votes / totalVotes) * 100) : 0 };
      }),
    };
  }

  _emit(handle) {
    try { this.deps.onStateChange(slugify(handle)); } catch (_) {}
  }
}

const rooms = new RoomManager();

module.exports = rooms;
module.exports.RoomManager = RoomManager;
module.exports.ROOM_GAMES = ROOM_GAMES;
module.exports.GAME_BY_ID = GAME_BY_ID;
module.exports.RESERVED_SLUGS = RESERVED_SLUGS;
module.exports.HANDLE_RE = HANDLE_RE;
module.exports.slugify = slugify;
module.exports.normalizeGameId = normalizeGameId;
module.exports.INACTIVITY_MS = INACTIVITY_MS;
