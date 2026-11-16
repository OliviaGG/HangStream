// ─── Synapse Multiplayer — real-time "first to connect" race engine ───
//
// A match shares ONE pair of corner words. Every player builds their OWN
// private tree (they can never use another player's words). The first player
// whose tree connects the two corners wins. Everyone sees everyone's
// constellations live, but each player is a distinct planet type/colour.
//
// This module is TRANSPORT-AGNOSTIC on purpose: it never touches Socket.IO or
// TikTok directly. The host wires it up by injecting:
//   getSims(pairs)  -> Promise<[{score}|null]>   (Searchle similarity client)
//   broadcast(evt, payload)                       (fan-out to the room)
//   onWin({ match, player })                      (award XP / GOAT, side effects)
//   nextPair()      -> Promise<[cornerA, cornerB]> (fresh distant corners)
// The SAME engine therefore drives both the Word Tycoon online arena and the
// wordgame.live TikTok-chat streamer mode — only the wiring differs.
//
// The scoring core (buildLinks + bestBridge) is imported from ./synapse so the
// MP verdict is byte-identical to the single-player server verdict. Do NOT
// re-implement them here (the SP/HTML buildLinks duplication is already a known
// landmine — don't add a third copy).

'use strict';

const crypto = require('crypto');
const { createSynapseMpRewards } = require('./synapse-mp-rewards');
const { buildLinks, bestBridge, LINK_THRESHOLD, MAX_LINKS_PER_WORD } = require('./synapse');

// ── Arena auth token ──
// HTTP session reading is reliable (the /api/ block forwards cookies), but
// reading the session off a raw Socket.IO handshake has been flaky in prod.
// So the client mints a short-lived HMAC token from an authenticated HTTP
// endpoint and presents it in the socket handshake. Server-signed → the client
// can't forge an identity.
const MP_TOKEN_TTL_MS = 5 * 60 * 1000;
function mintMpToken(secret, accountId, name) {
  const payload = Buffer.from(JSON.stringify({
    a: String(accountId), n: String(name || '').slice(0, 40), e: Date.now() + MP_TOKEN_TTL_MS,
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', String(secret)).update(payload).digest('base64url');
  return payload + '.' + sig;
}
function verifyMpToken(secret, token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expect = crypto.createHmac('sha256', String(secret)).update(payload).digest('base64url');
  const a = Buffer.from(sig); const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let obj; try { obj = JSON.parse(Buffer.from(payload, 'base64url').toString()); } catch { return null; }
  if (!obj || !obj.a || !obj.e || Date.now() > obj.e) return null;
  return { accountId: String(obj.a), name: String(obj.n || 'Player') };
}

const WORD_RE = /^[a-z]{3,15}$/;
const BOARD_CAP = 200;          // words a single player may add before they're out (MP allows deep boards)
const MAX_BATCH = 200;          // max words accepted in one batch submit
const INTERMISSION_MS = 8000;   // pause between a win and the next corners

// ── Per-match planet palette ──
// Distinct (type, colour) combos assigned by join slot so every player in a
// match looks clearly different. Wraps after PLANETS.length players (slot mod).
const PLANETS = [
  { type: 'gas',  color: '#4a9eff', name: 'Azure' },
  { type: 'rock', color: '#ff7a3c', name: 'Ember' },
  { type: 'ice',  color: '#57e0c8', name: 'Frost' },
  { type: 'gas',  color: '#b44aff', name: 'Violet' },
  { type: 'rock', color: '#ffd23c', name: 'Amber' },
  { type: 'ice',  color: '#4fc34f', name: 'Verdant' },
  { type: 'gas',  color: '#ff4d6d', name: 'Rose' },
  { type: 'rock', color: '#9d8cff', name: 'Lilac' },
  { type: 'ice',  color: '#00c2ff', name: 'Cyan' },
  { type: 'gas',  color: '#ff9e00', name: 'Tangerine' },
  { type: 'rock', color: '#6ee7ff', name: 'Sky' },
  { type: 'ice',  color: '#f062c8', name: 'Fuchsia' },
];

function planetForSlot(slot) {
  const p = PLANETS[slot % PLANETS.length];
  // After a full wrap, tint the ring so slot 0 and slot 12 still differ.
  return { slot, type: p.type, color: p.color, name: p.name, ring: Math.floor(slot / PLANETS.length) };
}

const pairKey = (a, b) => (a < b ? a + '|' + b : b + '|' + a);

// Nodes reachable from `start` over the surviving edges (how far a bridge
// extends) — a cheap, honest progress signal for the race panel.
function reachFrom(start, edges) {
  const adj = new Map();
  for (const e of edges) {
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push(e.b);
    adj.get(e.b).push(e.a);
  }
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift();
    for (const n of adj.get(cur) || []) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  }
  return seen.size - 1; // exclude the corner itself
}

// ── One live race ──────────────────────────────────────────────────────────
class SynapseArena {
  // scope: opaque id for the room ('arena' | 'streamer:<handle>' | ...).
  // getSims/broadcast/onWin/nextPair are injected (see module header).
  // now(): injectable clock (defaults to Date.now) so tests are deterministic.
  constructor({ scope, getSims, broadcast, beforeWin, onWin, nextPair, now }) {
    this.scope = scope;
    this._getSims = getSims;
    this._broadcast = broadcast || (() => {});
    this._beforeWin = beforeWin || (() => {});
    this._onWin = onWin || (() => {});
    this._boardQueues = new WeakMap();
    this._nextPair = nextPair;
    this._now = now || (() => Date.now());
    this.matchNo = 0;
    this.simCache = new Map();   // pairKey -> score|null (shared across players, whole match)
    this.match = null;           // current match state
    this._slotSeq = 0;           // monotonically increasing planet slot assigner
    this._players = new Map();   // playerId -> persistent player (planet survives matches)
  }

  // Fetch any pairwise sims for `board` not already cached (symmetric, so a
  // freshly added word only costs N-1 lookups — the rest are already cached).
  async _ensureSims(board, cache) {
    const missing = [];
    for (let i = 0; i < board.length; i++) {
      for (let j = i + 1; j < board.length; j++) {
        const k = pairKey(board[i], board[j]);
        if (!cache.has(k)) missing.push([board[i], board[j], k]);
      }
    }
    if (!missing.length) return;
    const results = await this._getSims(missing.map(([a, b]) => [a, b]));
    results.forEach((r, i) => {
      const k = missing[i][2];
      cache.set(k, r && typeof r.score === 'number' ? r.score : null);
    });
  }

  _simFor(a, b, cache) {
    const v = cache.get(pairKey(a, b));
    return typeof v === 'number' ? v : null;
  }

  // Start a fresh match on the given corners (or fetched via nextPair()).
  async startMatch(cornerA, cornerB) {
    if (!cornerA || !cornerB) {
      const pair = await this._nextPair();
      cornerA = pair[0]; cornerB = pair[1];
    }
    this.matchNo += 1;
    this.simCache = new Map();           // corners change → old sims irrelevant
    this.match = {
      id: crypto.randomUUID(),
      no: this.matchNo,
      simCache: this.simCache,
      cornerA, cornerB,
      status: 'active',
      startedAt: this._now(),
      winnerId: null,
      boards: new Map(),                 // playerId -> { words:[], edges:[], connected, wordsUsed }
    };
    // Re-seat everyone who is still present into the new match.
    for (const id of this._players.keys()) {
      this.match.boards.set(id, { words: [], edges: [], connected: false, wordsUsed: 0, reach: 0 });
    }
    this._broadcast('newmatch', this.snapshot());
    return this.match;
  }

  join(playerId, name) {
    playerId = String(playerId);
    let player = this._players.get(playerId);
    if (!player) {
      player = { id: playerId, name: String(name || 'Player').slice(0, 40), planet: planetForSlot(this._slotSeq++) };
      this._players.set(playerId, player);
    } else if (name) {
      player.name = String(name).slice(0, 40);
    }
    if (this.match && !this.match.boards.has(playerId)) {
      this.match.boards.set(playerId, { words: [], edges: [], connected: false, wordsUsed: 0, reach: 0 });
    }
    this._broadcast('join', { scope: this.scope, player: this._publicPlayer(playerId) });
    return this.snapshot();
  }

  leave(playerId) {
    playerId = String(playerId);
    this._players.delete(playerId);
    if (this.match) this.match.boards.delete(playerId);
    this._broadcast('leave', { scope: this.scope, playerId });
  }

  _active(m, playerId, board) {
    return this.match === m && m.status === 'active' && !m.winnerId
      && m.boards.get(playerId) === board && this._players.has(playerId);
  }

  // Serialize only one player's board. Other players can still race in parallel.
  // Capture the board at arrival so queued work cannot migrate to a new match.
  _submit(playerId, work) {
    playerId = String(playerId);
    const m = this.match, board = m && m.boards.get(playerId);
    if (!m) return Promise.resolve({ ok: false, reason: 'no-match' });
    if (!board) return Promise.resolve({ ok: false, reason: 'not-joined' });
    let queue = this._boardQueues.get(board);
    if (!queue) { queue = { tail: Promise.resolve(), pending: 0 }; this._boardQueues.set(board, queue); }
    if (queue.pending >= 16) return Promise.resolve({ ok: false, reason: 'busy' });
    queue.pending++;
    const task = queue.tail.then(() => this._active(m, playerId, board)
      ? work(playerId, m, board) : { ok: false, reason: 'match-over' });
    queue.tail = task.catch(() => {}).finally(() => { queue.pending--; });
    return task;
  }

  submitWord(playerId, rawWord, isValidWord) {
    return this._submit(playerId, (id, m, board) => this._submitWord(id, rawWord, isValidWord, m, board));
  }

  submitWords(playerId, rawWords, isValidWord) {
    const words = Array.isArray(rawWords) ? rawWords.slice(0, MAX_BATCH) : [];
    return this._submit(playerId, (id, m, board) => this._submitWords(id, words, isValidWord, m, board));
  }

  // Validate + score a word for a player. Returns a result object; also
  // broadcasts the per-player update and, on a win, fires onWin + intermission.
  // isValidWord: injected predicate (word-bank check).
  async _submitWord(playerId, rawWord, isValidWord, m, board) {
    const word = String(rawWord || '').trim().toLowerCase();
    if (!WORD_RE.test(word)) return { ok: false, reason: 'bad-word' };
    if (word === m.cornerA || word === m.cornerB) return { ok: false, reason: 'is-corner' };
    if (board.words.includes(word)) return { ok: false, reason: 'duplicate' };
    if (board.wordsUsed >= BOARD_CAP) return { ok: false, reason: 'board-full' };
    if (isValidWord && !isValidWord(word)) return { ok: false, reason: 'not-a-word' };

    // Score the candidate against the current board WITHOUT committing it yet.
    const others = [m.cornerA, m.cornerB, ...board.words];
    const full = [...others, word];
    await this._ensureSims(full, m.simCache);
    if (!this._active(m, playerId, board)) return { ok: false, reason: 'match-over' };
    // A word no model knows can never link — reject it (don't burn a board slot).
    const known = others.some((w) => this._simFor(word, w, m.simCache) !== null);
    if (!known) return { ok: false, reason: 'unknown-word' };

    const candidate = { ...board, words: [...board.words, word], wordsUsed: board.words.length + 1 };
    const settle = await this._settle(playerId, m, board, candidate, word);
    return { ok: true, connected: board.connected, win: settle.win, edges: board.edges, result: settle.result };
  }

  // Rebuild links/bridge/reach from the (already-fetched) sim cache, broadcast
  // ONE update, and fire the win path if this closes the bridge first.
  async _settle(playerId, m, board, candidate, word) {
    const full = [m.cornerA, m.cornerB, ...candidate.words];
    candidate.edges = buildLinks(full, (a, b) => this._simFor(a, b, m.simCache));
    const bridge = bestBridge(m.cornerA, m.cornerB, candidate.edges);
    candidate.connected = !!bridge;
    candidate.reach = reachFrom(m.cornerA, candidate.edges);
    let result, player;
    if (bridge) {
      player = this._players.get(playerId);
      result = {
        scope: this.scope, winnerId: playerId, name: player ? player.name : 'Player',
        wordsUsed: candidate.wordsUsed, path: bridge.path, avgLink: Math.round(bridge.avgLink * 1000) / 1000, matchNo: m.no,
      };
      // Synchronous durable reservation before consuming the winning state.
      // If persistence fails, the candidate remains uncommitted and can retry.
      this._beforeWin({ scope: this.scope, match: m, player, result });
      m.winnerId = playerId;
      m.status = 'won';
      m.wonAt = this._now();
    }
    Object.assign(board, candidate);
    this._broadcast('update', { scope: this.scope, playerId, word, board: this._publicBoard(playerId) });
    if (result) {
      this._broadcast('win', result);
      try { await this._onWin({ scope: this.scope, match: m, player, result }); }
      catch (error) { console.error('[SynapseMP] win delivery pending:', error.message); }
      return { win: true, result };
    }
    return { win: false };
  }

  // Batch submit (paste / space-separated, Searchle-style). Validates + scores
  // each word incrementally against the growing board, then settles ONCE — a
  // single update broadcast and one win check for the whole batch.
  async _submitWords(playerId, rawWords, isValidWord, m, board) {
    const candidate = { ...board, words: board.words.slice() };
    const list = (Array.isArray(rawWords) ? rawWords : []).map((w) => String(w || '').trim().toLowerCase()).slice(0, MAX_BATCH);
    const accepted = [], rejected = [];
    const seen = new Set(candidate.words);   // dedup vs board AND within the batch
    for (const word of list) {
      if (candidate.wordsUsed >= BOARD_CAP) { rejected.push({ word, reason: 'board-full' }); continue; }
      if (!WORD_RE.test(word)) { rejected.push({ word, reason: 'bad-word' }); continue; }
      if (word === m.cornerA || word === m.cornerB) { rejected.push({ word, reason: 'is-corner' }); continue; }
      if (seen.has(word)) { rejected.push({ word, reason: 'duplicate' }); continue; }
      if (isValidWord && !isValidWord(word)) { rejected.push({ word, reason: 'not-a-word' }); continue; }
      const others = [m.cornerA, m.cornerB, ...candidate.words];
      await this._ensureSims([...others, word], m.simCache);
      if (!this._active(m, playerId, board)) return { ok: false, reason: 'match-over', accepted: [], rejected };
      if (!others.some((w) => this._simFor(word, w, m.simCache) !== null)) { rejected.push({ word, reason: 'unknown-word' }); continue; }
      candidate.words.push(word); candidate.wordsUsed = candidate.words.length; seen.add(word); accepted.push(word);
    }
    if (!accepted.length) return { ok: false, reason: (rejected[0] && rejected[0].reason) || 'no-words', accepted, rejected };
    const settle = await this._settle(playerId, m, board, candidate, accepted[accepted.length - 1]);
    return { ok: true, accepted, rejected, connected: board.connected, win: settle.win, result: settle.result };
  }

  _publicBoard(playerId) {
    const b = this.match && this.match.boards.get(playerId);
    if (!b) return null;
    return { playerId, words: b.words.slice(), edges: b.edges.slice(), connected: b.connected, wordsUsed: b.wordsUsed, reach: b.reach || 0 };
  }

  _publicPlayer(playerId) {
    const p = this._players.get(playerId);
    if (!p) return null;
    return { id: p.id, name: p.name, planet: p.planet };
  }

  // Everyone-sees-everyone snapshot: corners + every player's planet + their
  // full (public) tree. Each player still can only ADD to their own board.
  snapshot() {
    const m = this.match;
    return {
      scope: this.scope,
      config: { threshold: LINK_THRESHOLD, maxLinks: MAX_LINKS_PER_WORD, cap: BOARD_CAP },
      match: m ? {
        no: m.no,
        cornerA: m.cornerA,
        cornerB: m.cornerB,
        status: m.status,
        winnerId: m.winnerId,
      } : null,
      players: [...this._players.keys()].map((id) => ({
        ...this._publicPlayer(id),
        board: this._publicBoard(id),
      })),
    };
  }
}

// ── Socket.IO wiring — the Word Tycoon online arena ─────────────────────────
// Attaches to Chat Relay's io. One global rolling arena (scope 'arena').
// Login required to play (stable identity + XP/GOAT). Events:
//   client → 'synapse-mp:join'  (ack: { ok, you, snapshot })
//   client → 'synapse-mp:word'  { word }  (ack: submit result)
//   server → 'synapse-mp:{newmatch,join,leave,update,win}'  (room broadcasts)
function registerSynapseMp(app, io, deps) {
  const {
    fetchSims, resolvePair, wordBank,
    wtFetch, WORD_EMPIRES_URL, WT_API_SECRET, getCurrentWordTycoonAccountId,
  } = deps;
  const rewards = deps.rewards || createSynapseMpRewards({ baseUrl: WORD_EMPIRES_URL, apiSecret: WT_API_SECRET, request: wtFetch });
  rewards.start();
  console.log('[SynapseMP] Durable match delivery enabled');
  const ROOM = 'synapse-mp:arena';
  const sockets = new Map(); // playerId -> Set<socketId> (multi-tab ref count)

  // Seat grace (2026-07-21): a dropped socket must NOT destroy an in-progress
  // tree. arena.leave() deletes the player's board, but Socket.IO reconnects
  // within seconds of a blip and the client re-joins on 'connect' — so a brief
  // outage used to hand the player back an empty board under unchanged corners
  // (a silent wipe that reads like a restart). Hold the seat instead, and only
  // free it if they're still gone when the grace expires.
  const LEAVE_GRACE_MS = 60 * 1000;
  const pendingLeave = new Map(); // playerId -> timer

  // Premium gate (2026-07-19): the MP arena requires Donor Class / TikTok
  // Super Fan; the solo daily + practice (src/synapse.js) stay free. Checked
  // at join via the public entitlement endpoint (60s cache, fail-open).
  const PREMIUM_SELF_URL = process.env.CHAT_RELAY_URL || 'http://localhost:3000';
  const premiumMpCache = new Map(); // accountId -> { at, premium }
  const PREMIUM_MP_TTL_MS = 60 * 1000;
  async function isPremiumMpUser(accountId) {
    const id = String(accountId || '');
    if (!id) return false;
    const hit = premiumMpCache.get(id);
    if (hit && Date.now() - hit.at < PREMIUM_MP_TTL_MS) return hit.premium;
    try {
      const r = await fetch(`${PREMIUM_SELF_URL}/api/public/entitlement?discordId=${encodeURIComponent(id)}`);
      if (!r.ok) throw new Error('http ' + r.status);
      const data = await r.json();
      const premium = !!(data && data.premium);
      if (premiumMpCache.size > 5000) premiumMpCache.clear();
      premiumMpCache.set(id, { at: Date.now(), premium });
      return premium;
    } catch (e) {
      return true; // fail-open: an entitlement hiccup must never lock the arena
    }
  }

  // Authenticated HTTP endpoint (session reading works reliably here) that mints
  // the socket-auth token. Client fetches this on load, then connects the arena
  // socket with the token. Returns { ok:false } for logged-out users.
  app.get('/api/synapse/mp/token', async (req, res) => {
    try {
      const du = req.session && req.session.discordUser;
      if (!du) return res.json({ ok: false });
      const accountId = await getCurrentWordTycoonAccountId(du);
      if (!accountId) return res.json({ ok: false });
      const name = du.displayName || du.globalName || du.username || 'Player';
      res.json({ ok: true, token: mintMpToken(WT_API_SECRET, accountId, name), name: String(name).slice(0, 40) });
    } catch (e) {
      console.error('[SynapseMP] token error:', e.message);
      res.json({ ok: false });
    }
  });

  let rollTimer = null;

  // Roll to fresh corners after `delay` ms. A WIN is the only thing that ends a
  // match — there is deliberately no idle/timed rotation, because startMatch()
  // wipes every player's tree and an in-progress race must never be interrupted.
  // (A 3-minute timed rotate lived here until 2026-07-21 with its condition
  // inverted — it fired only when players WERE connected, wiping live boards
  // mid-race. Removed, not fixed: don't reintroduce any timed rotation.)
  function rollNow(delay) {
    clearTimeout(rollTimer);
    rollTimer = setTimeout(async () => {
      try {
        await arena.startMatch();
      } catch (e) {
        // Searchle down or still booting: keep retrying, or the arena would sit
        // with match === null forever and nobody could play at all.
        console.error('[SynapseMP] startMatch failed:', e.message);
        rollNow(15000);
      }
    }, delay);
  }

  const arena = new SynapseArena({
    scope: 'arena',
    getSims: fetchSims,
    broadcast: (evt, payload) => io.to(ROOM).emit('synapse-mp:' + evt, payload),
    nextPair: () => resolvePair('mp:' + Date.now() + ':' + Math.floor(Math.random() * 1e9)),
    beforeWin: (win) => rewards.reserve(win),
    onWin: async ({ match }) => {
      rollNow(INTERMISSION_MS);          // fresh corners after the celebration
      await rewards.deliver('synapse-mp:' + match.id);
    },
  });

  // Kick off the first match once the pair pool is warm.
  arena.startMatch().catch((e) => {
    console.error('[SynapseMP] initial match failed:', e.message);
    rollNow(5000); // retry shortly (Searchle may still be booting)
  });

  const isValidWord = (w) => wordBank.isValidWord(w);

  io.on('connection', (socket) => {
    socket.on('synapse-mp:join', async (data, ack) => {
      try {
        // Primary: HMAC token from /api/synapse/mp/token (handshake auth or payload).
        let accountId = null, name = null;
        const tok = verifyMpToken(WT_API_SECRET, (socket.handshake && socket.handshake.auth && socket.handshake.auth.token) || (data && data.token));
        if (tok) { accountId = tok.accountId; name = tok.name; }
        else {
          // Fallback: session on the raw handshake (works in some setups).
          const du = socket.request?.session?.discordUser;
          if (du) { accountId = await getCurrentWordTycoonAccountId(du); name = du.displayName || du.globalName || du.username; }
        }
        if (!accountId) return ack && ack({ ok: false, error: 'login-required' });
        if (!(await isPremiumMpUser(accountId))) {
          return ack && ack({ ok: false, error: 'premium-required' });
        }
        const playerId = String(accountId);
        name = String(name || 'Player').slice(0, 40);
        // Back within the grace window — cancel the pending seat release so
        // arena.join() finds the existing board and leaves it untouched.
        const pending = pendingLeave.get(playerId);
        if (pending) { clearTimeout(pending); pendingLeave.delete(playerId); }
        socket.data.mpPlayerId = playerId;
        socket.join(ROOM);
        if (!sockets.has(playerId)) sockets.set(playerId, new Set());
        sockets.get(playerId).add(socket.id);
        const snapshot = arena.join(playerId, name);
        ack && ack({ ok: true, you: playerId, snapshot });
      } catch (e) {
        console.error('[SynapseMP] join error:', e.message);
        ack && ack({ ok: false, error: 'server-error' });
      }
    });

    socket.on('synapse-mp:word', async (data, ack) => {
      try {
        const playerId = socket.data.mpPlayerId;
        if (!playerId) return ack && ack({ ok: false, error: 'not-joined' });
        const r = await arena.submitWord(playerId, data && data.word, isValidWord);
        ack && ack(r);
      } catch (e) {
        console.error('[SynapseMP] word error:', e.message);
        ack && ack({ ok: false, error: 'server-error' });
      }
    });

    socket.on('synapse-mp:words', async (data, ack) => {   // batch (Searchle-style)
      try {
        const playerId = socket.data.mpPlayerId;
        if (!playerId) return ack && ack({ ok: false, error: 'not-joined' });
        const r = await arena.submitWords(playerId, data && data.words, isValidWord);
        ack && ack(r);
      } catch (e) {
        console.error('[SynapseMP] words error:', e.message);
        ack && ack({ ok: false, error: 'server-error' });
      }
    });

    socket.on('synapse-mp:leave', () => dropSocket(socket));
    socket.on('disconnect', () => dropSocket(socket));
  });

  function dropSocket(socket) {
    const playerId = socket.data.mpPlayerId;
    if (!playerId) return;
    const set = sockets.get(playerId);
    if (set) {
      set.delete(socket.id);
      if (set.size === 0) {              // last tab gone — hold the seat, don't free it yet
        sockets.delete(playerId);
        clearTimeout(pendingLeave.get(playerId));
        pendingLeave.set(playerId, setTimeout(() => {
          pendingLeave.delete(playerId);
          if (!sockets.has(playerId)) arena.leave(playerId); // still gone → release the board
        }, LEAVE_GRACE_MS));
      }
    }
    socket.data.mpPlayerId = null;
  }

  console.log('[SynapseMP] arena wired');
  return arena;
}

// ── TikTok / wordgame.live streamer variant ─────────────────────────────────
// One arena per streamer (scope 'streamer:<id>'). Viewers race by typing words
// in TikTok chat — each comment is one word submission for that viewer. No XP
// (viewers are anonymous chatters); wins are display-only on the stream overlay.
// Overlays watch read-only via the 'synapse-mp:watch' socket event.
function registerSynapseStreamer(io, deps) {
  const { fetchSims, resolvePair, wordBank } = deps;
  const arenas = new Map(); // streamerId -> { arena, rollTimer, lastActivity, watchers:Set }
  const roomFor = (sid) => 'synapse-mp:streamer:' + sid;
  const WORD_TOKEN = /[a-z]{3,15}/g;

  function getOrCreate(streamerId) {
    let entry = arenas.get(streamerId);
    if (entry) return entry;
    const room = roomFor(streamerId);
    entry = { arena: null, rollTimer: null, lastActivity: Date.now(), watchers: new Set() };
    const arena = new SynapseArena({
      scope: 'streamer:' + streamerId,
      getSims: fetchSims,
      broadcast: (evt, payload) => io.to(room).emit('synapse-mp:' + evt, payload),
      nextPair: () => resolvePair('mps:' + streamerId + ':' + Date.now() + ':' + Math.floor(Math.random() * 1e9)),
      onWin: async () => {
        clearTimeout(entry.rollTimer);
        entry.rollTimer = setTimeout(() => { arena.startMatch().catch((e) => console.error('[SynapseMP/stream] roll fail:', e.message)); }, INTERMISSION_MS);
      },
    });
    entry.arena = arena;
    arenas.set(streamerId, entry);
    // Held so handleChat can wait on it. The first match is fetched over the
    // network (Searchle pair lookup), so a comment arriving in that window
    // would otherwise be rejected with 'no-match' and silently lost — which is
    // exactly the comment that spun the arena up in the first place.
    entry.ready = arena.startMatch().catch((e) => console.error('[SynapseMP/stream] start fail:', e.message));
    return entry;
  }

  // Called by relay.setSynapseChatSink for every Synapse-targeted comment.
  function handleChat(streamerId, normalized) {
    if (!streamerId || !normalized) return;
    const text = String(normalized.message || '').toLowerCase();
    const tokens = text.match(WORD_TOKEN) || [];
    const word = tokens.find((w) => wordBank.isValidWord(w)); // first valid word in the comment
    if (!word) return;
    const entry = getOrCreate(streamerId);
    entry.lastActivity = Date.now();
    const u = normalized.user || {};
    const vid = 'tt:' + String(u.id || u.username || 'anon');
    const name = String(u.displayName || u.username || 'Viewer').slice(0, 40);
    // join() first so the player exists in _players — startMatch() seats every
    // known player onto the new board, so this works whether the match is
    // already running or still being fetched.
    entry.arena.join(vid, name);
    Promise.resolve(entry.ready)
      .then(() => entry.arena.submitWord(vid, word, (w) => wordBank.isValidWord(w)))
      .catch(() => {});
  }

  io.on('connection', (socket) => {
    socket.on('synapse-mp:watch', (data, ack) => {
      try {
        let streamerId = data && data.streamerId;
        if (!streamerId) { const du = socket.request?.session?.discordUser; if (du) streamerId = du.id; }
        if (!streamerId) return ack && ack({ ok: false, error: 'no-streamer' });
        const entry = getOrCreate(String(streamerId));
        entry.watchers.add(socket.id);
        socket.data.mpWatch = String(streamerId);
        socket.join(roomFor(String(streamerId)));
        ack && ack({ ok: true, streamerId: String(streamerId), snapshot: entry.arena.snapshot() });
      } catch (e) {
        console.error('[SynapseMP/stream] watch error:', e.message);
        ack && ack({ ok: false, error: 'server-error' });
      }
    });
    socket.on('disconnect', () => {
      const sid = socket.data.mpWatch;
      if (sid) { const e = arenas.get(sid); if (e) e.watchers.delete(socket.id); }
    });
  });

  // Reclaim idle arenas: no watchers and no chat for 10 min → drop + clear timer.
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [sid, e] of arenas) {
      if (e.watchers.size === 0 && now - e.lastActivity > 10 * 60000) {
        clearTimeout(e.rollTimer);
        arenas.delete(sid);
      }
    }
  }, 5 * 60000);
  if (sweep.unref) sweep.unref();

  console.log('[SynapseMP] streamer manager wired');
  return { handleChat, _arenas: arenas };
}

module.exports = { SynapseArena, registerSynapseMp, registerSynapseStreamer, mintMpToken, verifyMpToken, planetForSlot, PLANETS, BOARD_CAP, INTERMISSION_MS };
