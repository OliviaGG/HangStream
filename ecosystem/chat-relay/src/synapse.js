// ─── Synapse (wordtycoon.live/synapse) — semantic bridge-building game ───
//
// Linxicon-style daily: two distant "corner" words; players add words that
// link to each other by embedding cosine similarity until the corners are
// connected. The game itself is the static page public/synapse.html. These
// routes add:
//   GET  /api/synapse/daily                    (public — today's pair + config)
//   GET  /api/synapse/practice?seed=N          (public — deterministic practice pair)
//   POST /api/synapse/guess                    (public, rate-limited — score a word vs the board)
//   POST /api/synapse/complete                 (session required — verify win, award XP, save score)
//   GET  /api/synapse/leaderboard?day=         (public)
//   GET  /api/synapse/me                       (session — profile/streak)
//
// Similarity comes from Searchle's in-memory word vectors via its
// POST /api/similarity endpoint (loopback, GAME_API_SECRET) — this module
// never loads models itself. The server is authoritative: /complete
// re-fetches every pairwise similarity and rebuilds the link graph, so a
// hacked client can't forge a win or an efficiency score.
//
// IMPORTANT: buildLinks() below (threshold + mutual top-K edge rule) is
// duplicated in public/synapse.html for live rendering. If you change the
// rule or the constants here, change it there too or the client will show
// links the server won't honor.

const express = require('express');

// ── Game constants (mirrored in public/synapse.html) ──
// Calibrated 2026-07-13 against prod numberbatch+fasttext blend: clearly
// related pairs score 42-68%, loosely related 37-40% (page-book 37.3,
// word-quote 39.4), unrelated junk ≤32% (banana-car 19.3, battle-plan 22.7).
// 0.38 admits the loose-association band with a ~6-point margin over noise.
const LINK_THRESHOLD = 0.38;   // cosine ≥ this forms a link
const MAX_LINKS_PER_WORD = 5;  // an edge survives only in the mutual top-K of BOTH endpoints (anti-hub)
const BOARD_CAP = 200;         // added words allowed before the run ends (matches MP)
const MAX_BATCH = 200;         // words per /guess-batch submit
const PAIR_MAX_SIM = 0.25;     // daily corner words must be at least this distant
const WORD_RE = /^[a-z]{3,15}$/;
const EPOCH_DAY = '2026-07-13'; // game #1
const TOP_LIMIT = 20;

// XP: first daily win only. 25 base + up to 75 efficiency bonus → 25-100 per
// day, sent as a 'win' event so it also records one game_win for the GOAT
// Synapse-wins column (no cosmetic/3x side effects — those need 'daily-win').
const XP_BASE = 25;
const XP_PER_WORD_UNDER = 6;   // +6 XP per word under 14…
const XP_EFFICIENCY_PAR = 14;  // …so 2 words = +72, 14+ words = +0
const XP_BONUS_CAP = 75;

function edmontonDay(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(d);
}

function gameNoForDay(day) {
  const ms = Date.parse(day + 'T12:00:00Z') - Date.parse(EPOCH_DAY + 'T12:00:00Z');
  return Math.round(ms / 86400000) + 1;
}

// ── Seeded RNG (deterministic pair picking) ──
function hashString(s) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Rate limiter (same shape as junkdrawer's allowSubmit) ──
const hits = new Map(); // key -> { count, first }
const GUESS_WINDOW = 60 * 1000;
const GUESS_MAX = 45;
const SUBMIT_MAX = 10;
function allow(key, max) {
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now - entry.first > GUESS_WINDOW) {
    hits.set(key, { count: 1, first: now });
    return true;
  }
  entry.count++;
  return entry.count <= max;
}
const sweep = setInterval(() => {
  const now = Date.now();
  for (const [k, e] of hits) {
    if (now - e.first > GUESS_WINDOW * 2) hits.delete(k);
  }
}, 5 * 60 * 1000);
if (sweep.unref) sweep.unref();

// ── Link-graph rules (MUST match the copy in public/synapse.html) ──
// simFor: (a, b) => score|null. Returns the surviving edge list.
// 1. candidate edges = every pair with sim ≥ LINK_THRESHOLD
// 2. each node ranks its candidates by sim desc
// 3. an edge survives only if it sits in the top MAX_LINKS_PER_WORD for
//    BOTH endpoints (mutual top-K — deterministic, order-independent,
//    rewards chains over hub words, mirrors Linxicon's link-breaking)
function buildLinks(words, simFor) {
  const candidates = [];
  for (let i = 0; i < words.length; i++) {
    for (let j = i + 1; j < words.length; j++) {
      const s = simFor(words[i], words[j]);
      if (typeof s === 'number' && s >= LINK_THRESHOLD) {
        candidates.push({ a: words[i], b: words[j], score: s });
      }
    }
  }
  const perNode = new Map();
  for (const e of candidates) {
    if (!perNode.has(e.a)) perNode.set(e.a, []);
    if (!perNode.has(e.b)) perNode.set(e.b, []);
    perNode.get(e.a).push(e);
    perNode.get(e.b).push(e);
  }
  const keepSet = new Set();
  for (const [node, edges] of perNode) {
    edges.sort((x, y) => y.score - x.score);
    for (let i = 0; i < Math.min(edges.length, MAX_LINKS_PER_WORD); i++) {
      const e = edges[i];
      const key = e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a;
      keepSet.add(node + '>' + key);
    }
  }
  return candidates.filter((e) => {
    const key = e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a;
    return keepSet.has(e.a + '>' + key) && keepSet.has(e.b + '>' + key);
  });
}

// Union-find connectivity + maximin bottleneck path between the corners.
// Returns null when disconnected, else { bottleneck, path, avgLink }.
function bestBridge(cornerA, cornerB, edges) {
  const sorted = [...edges].sort((x, y) => y.score - x.score);
  const parent = new Map();
  const find = (x) => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)));
      x = parent.get(x);
    }
    return x;
  };
  const ensure = (x) => { if (!parent.has(x)) parent.set(x, x); };
  ensure(cornerA); ensure(cornerB);
  let bottleneck = null;
  for (const e of sorted) {
    ensure(e.a); ensure(e.b);
    parent.set(find(e.a), find(e.b));
    if (find(cornerA) === find(cornerB)) { bottleneck = e.score; break; }
  }
  if (bottleneck === null) return null;
  // Path extraction: BFS over edges at/above the bottleneck.
  const adj = new Map();
  for (const e of edges) {
    if (e.score < bottleneck) continue;
    if (!adj.has(e.a)) adj.set(e.a, []);
    if (!adj.has(e.b)) adj.set(e.b, []);
    adj.get(e.a).push({ to: e.b, score: e.score });
    adj.get(e.b).push({ to: e.a, score: e.score });
  }
  const prev = new Map([[cornerA, null]]);
  const queue = [cornerA];
  while (queue.length) {
    const cur = queue.shift();
    if (cur === cornerB) break;
    for (const n of adj.get(cur) || []) {
      if (!prev.has(n.to)) { prev.set(n.to, cur); queue.push(n.to); }
    }
  }
  if (!prev.has(cornerB)) return null; // shouldn't happen once bottleneck found
  const path = [];
  for (let cur = cornerB; cur !== null; cur = prev.get(cur)) path.unshift(cur);
  let sum = 0;
  const simOf = new Map(edges.map((e) => [e.a < e.b ? e.a + '|' + e.b : e.b + '|' + e.a, e.score]));
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i] < path[i + 1] ? path[i] + '|' + path[i + 1] : path[i + 1] + '|' + path[i];
    sum += simOf.get(key) || 0;
  }
  const avgLink = path.length > 1 ? sum / (path.length - 1) : 0;
  return { bottleneck, path, avgLink };
}

function registerRoutes(app, deps) {
  const { db, hostedRewards, wtFetch, WORD_EMPIRES_URL, WT_API_SECRET, getCurrentWordTycoonAccountId, wordBank, SEARCHLE_URL } = deps;

  // ── Searchle similarity client ──
  const SIMILARITY_URL = (process.env.SYNAPSE_SIMILARITY_URL || SEARCHLE_URL) + '/api/similarity';
  const SIM_TIMEOUT_MS = Number(process.env.SYNAPSE_SIM_TIMEOUT_MS || 8000);
  const SIM_RETRIES = Number(process.env.SYNAPSE_SIM_RETRIES || 2);
  const SIM_CONCURRENCY = Number(process.env.SYNAPSE_SIM_CONCURRENCY || 4);
  const SIM_CACHE_SIZE = Number(process.env.SYNAPSE_SIM_CACHE_SIZE || 2000);
  const SIM_CACHE_TTL_MS = Number(process.env.SYNAPSE_SIM_CACHE_TTL_MS || 5 * 60 * 1000);

  class LRUMap extends Map {
    constructor(capacity) {
      super();
      this.capacity = Math.max(1, capacity | 0);
    }
    get(key) {
      if (!super.has(key)) return undefined;
      const value = super.get(key);
      super.delete(key);
      super.set(key, value);
      return value;
    }
    set(key, value) {
      if (super.has(key)) super.delete(key);
      super.set(key, value);
      while (super.size > this.capacity) {
        const oldestKey = super.keys().next().value;
        super.delete(oldestKey);
      }
      return this;
    }
  }

  const simCache = new LRUMap(SIM_CACHE_SIZE);
  const simCacheMeta = new Map();
  const simInflight = new Map();
  let simActive = 0;
  const simQueue = [];

  function simKey(a, b) {
    return a < b ? `${a}|${b}` : `${b}|${a}`;
  }

  function pruneSimCache() {
    const now = Date.now();
    for (const [key, meta] of simCacheMeta) {
      if (now - meta.createdAt > SIM_CACHE_TTL_MS) {
        simCache.delete(key);
        simCacheMeta.delete(key);
      }
    }
  }

  function simSchedule() {
    if (simActive >= SIM_CONCURRENCY || simQueue.length === 0) return;
    const next = simQueue.shift();
    simActive++;
    next().finally(() => {
      simActive--;
      simSchedule();
    });
  }

  function simEnqueue(fn) {
    return new Promise((resolve, reject) => {
      simQueue.push(() => fn().then(resolve, reject));
      simSchedule();
    });
  }

  async function fetchSimsUncached(pairs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), SIM_TIMEOUT_MS);
    let lastErr;
    try {
      for (let attempt = 0; attempt <= SIM_RETRIES; attempt++) {
        try {
          const r = await fetch(SIMILARITY_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.GAME_API_SECRET },
            body: JSON.stringify({ pairs }),
            signal: controller.signal,
          });
          if (!r.ok) throw new Error('similarity HTTP ' + r.status);
          const j = await r.json();
          if (!j || j.ok !== true || !Array.isArray(j.results)) throw new Error('similarity bad payload');
          return j.results;
        } catch (err) {
          lastErr = err;
          const retryable = !err.message?.includes('HTTP') || err.name === 'AbortError' || isConnectionError(err);
          if (!retryable || attempt === SIM_RETRIES) break;
          await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
        }
      }
      if (LOCAL_FALLBACK && isConnectionError(lastErr)) {
        const local = await fetchSimsLocal(pairs);
        console.warn('[Synapse] Used local ranker fallback for', pairs.length, 'pairs');
        return local;
      }
      throw lastErr;
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchSims(pairs) {
    pruneSimCache();
    if (pairs.length === 0) return [];

    // Split into cached misses and hits; preserve input order on return.
    const misses = [];
    const missIdx = [];
    const results = new Array(pairs.length);
    for (let i = 0; i < pairs.length; i++) {
      const [a, b] = pairs[i];
      const key = simKey(a, b);
      const cached = simCache.get(key);
      if (cached !== undefined) {
        results[i] = { a, b, score: cached, unknown: [] };
      } else {
        misses.push([a, b]);
        missIdx.push(i);
      }
    }
    if (misses.length === 0) return results;

    const chunkKey = misses.map(([a, b]) => simKey(a, b)).join(';;');
    if (simInflight.has(chunkKey)) {
      const fresh = await simInflight.get(chunkKey);
      for (let i = 0; i < missIdx.length; i++) {
        results[missIdx[i]] = fresh[i];
      }
      return results;
    }

    const promise = simEnqueue(async () => {
      const fetched = await fetchSimsUncached(misses);
      const out = [];
      for (let i = 0; i < misses.length; i++) {
        const [a, b] = misses[i];
        const key = simKey(a, b);
        const r = fetched[i];
        const score = r && typeof r.score === 'number' ? r.score : 0;
        simCache.set(key, score);
        simCacheMeta.set(key, { createdAt: Date.now() });
        out.push({ a, b, score, unknown: (r && r.unknown) || [] });
      }
      return out;
    }).finally(() => {
      simInflight.delete(chunkKey);
    });

    simInflight.set(chunkKey, promise);
    const scores = await promise;
    for (let i = 0; i < missIdx.length; i++) {
      results[missIdx[i]] = scores[i];
    }
    return results;
  }

  // ── Local Searchle fallback (shared ranker module) ──
  const LOCAL_FALLBACK = /^(1|true|yes)$/i.test(process.env.SEARCHLE_LOCAL_FALLBACK || '');
  const LOCAL_RANKER_PATH = process.env.SEARCHLE_LOCAL_RANKER_PATH || '/opt/searchle/server/local-ranker.js';
  let localRanker = null;
  let localRankerReady = null;

  function isConnectionError(err) {
    if (!err) return false;
    if (err.name === 'AbortError') return true;
    const code = err.code || err.cause?.code || err.cause?.cause?.code;
    return ['ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH'].includes(code);
  }

  async function getLocalRanker() {
    if (!LOCAL_FALLBACK) return null;
    if (localRanker) return localRanker;
    if (localRankerReady) return localRankerReady;
    localRankerReady = (async () => {
      try {
        const mod = require(LOCAL_RANKER_PATH);
        await mod.ensureInit();
        localRanker = mod;
        console.log('[Synapse] Local ranker fallback initialized');
        return mod;
      } catch (e) {
        console.error('[Synapse] Local ranker fallback failed to initialize:', e.message);
        return null;
      }
    })();
    return localRankerReady;
  }

  async function fetchSimsLocal(pairs) {
    const lr = await getLocalRanker();
    if (!lr) throw new Error('Local ranker fallback not available');
    const { results } = await lr.similarity(pairs);
    return results.map((r) => ({
      a: r.a,
      b: r.b,
      score: typeof r.score === 'number' ? r.score : null,
      unknown: r.unknown,
    }));
  }

  // Searchle's /api/similarity caps at 2500 pairs per request; a full 200-word
  // board re-verify is C(202,2) ≈ 20k pairs, so /complete must chunk.
  const SIM_CHUNK = 2000;
  async function fetchSimsChunked(pairs) {
    if (pairs.length <= SIM_CHUNK) return fetchSims(pairs);
    const chunks = [];
    for (let i = 0; i < pairs.length; i += SIM_CHUNK) {
      chunks.push(pairs.slice(i, i + SIM_CHUNK));
    }
    const outputs = await Promise.all(chunks.map((chunk) => fetchSims(chunk)));
    return outputs.flat();
  }

  // ── Word Library reporting ──
  // Grow the player's Word Tycoon library with the words they connected in a
  // winning run. Mirrors the /api/reward identity exactly (platform:'discord',
  // same resolved userId) so the words attach to the same player the XP does.
  // Best-effort and fire-and-forget: never blocks or fails the win response.
  // Dedupe is handled server-side by /api/library/report.
  async function reportSynapseLibrary(userId, discordUser, words) {
    const displayName = String(
      discordUser?.displayName || discordUser?.globalName || discordUser?.username || ''
    ).slice(0, 40) || undefined;
    for (const word of words) {
      try {
        await wtFetch(`${WORD_EMPIRES_URL}/api/library/report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
          body: JSON.stringify({ platform: 'discord', userId, word, game: 'synapse', displayName }),
        });
      } catch { /* library growth is best-effort */ }
    }
  }

  // ── Corner-pair pool: curated targets, common (Zipf ≥ 4), 4-9 letters ──
  let pairPool = null;
  function getPairPool() {
    if (pairPool) return pairPool;
    const words = new Set();
    for (let len = 4; len <= 9; len++) {
      for (const w of wordBank.getTargets(len)) {
        const z = wordBank.getFrequency(w);
        if (z !== null && z >= 4.0 && WORD_RE.test(w)) words.add(w);
      }
    }
    pairPool = [...words].sort();
    console.log(`[Synapse] pair pool: ${pairPool.length} words`);
    return pairPool;
  }

  // Deterministically walk the pool until we find a pair the models know
  // that is distant enough (< PAIR_MAX_SIM). Falls back to the most
  // distant candidate seen if 40 rolls never get under the bar.
  async function resolvePair(seedString) {
    const pool = getPairPool();
    if (pool.length < 2) throw new Error('pair pool empty');
    const rand = mulberry32(hashString(seedString));
    let fallback = null;
    for (let attempt = 0; attempt < 40; attempt++) {
      const a = pool[Math.floor(rand() * pool.length)];
      let b = pool[Math.floor(rand() * pool.length)];
      if (b === a) continue;
      const [r] = await fetchSims([[a, b]]);
      if (!r || typeof r.score !== 'number') continue; // model doesn't know one — reroll
      if (r.score < PAIR_MAX_SIM) return [a, b];
      if (!fallback || r.score < fallback.score) fallback = { a, b, score: r.score };
    }
    if (fallback) return [fallback.a, fallback.b];
    throw new Error('no viable pair found');
  }

  const dailyCache = new Map(); // day -> [a, b]
  async function getDailyPair(day) {
    if (dailyCache.has(day)) return dailyCache.get(day);
    const row = db.getSynapseDay(day);
    if (row) {
      const pair = [row.word_a, row.word_b];
      dailyCache.set(day, pair);
      return pair;
    }
    const pair = await resolvePair('synapse:' + day);
    db.setSynapseDay(day, pair[0], pair[1], gameNoForDay(day));
    dailyCache.set(day, pair);
    if (dailyCache.size > 10) dailyCache.delete(dailyCache.keys().next().value);
    return pair;
  }

  const CONFIG = { threshold: LINK_THRESHOLD, maxLinks: MAX_LINKS_PER_WORD, cap: BOARD_CAP };

  app.get('/api/synapse/daily', async (_req, res) => {
    try {
      const day = edmontonDay();
      const pair = await getDailyPair(day);
      res.json({ ok: true, day, gameNo: gameNoForDay(day), pair, config: CONFIG });
    } catch (err) {
      console.error('[Synapse] daily error:', err.message);
      res.status(503).json({ ok: false, error: 'daily-unavailable' });
    }
  });

  app.get('/api/synapse/practice', async (req, res) => {
    try {
      const seed = Number.isInteger(Number(req.query.seed)) && Number(req.query.seed) > 0
        ? Math.floor(Number(req.query.seed))
        : (Math.floor(Math.random() * 0xffffffff) || 1);
      const pair = await resolvePair('practice:' + seed);
      res.json({ ok: true, seed, pair, config: CONFIG });
    } catch (err) {
      console.error('[Synapse] practice error:', err.message);
      res.status(503).json({ ok: false, error: 'practice-unavailable' });
    }
  });

  // Score one word against the whole board. Stateless — the client owns the
  // in-progress board; /complete re-verifies everything server-side.
  app.post('/api/synapse/guess', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
      if (!allow('guess:' + ip, GUESS_MAX)) {
        return res.status(429).json({ ok: false, error: 'rate-limited' });
      }
      const word = String(req.body?.word || '').trim().toLowerCase();
      const board = Array.isArray(req.body?.board) ? req.body.board.map((w) => String(w || '').trim().toLowerCase()) : [];
      if (!WORD_RE.test(word)) return res.json({ ok: false, error: 'bad-word' });
      if (!wordBank.isValidWord(word)) return res.json({ ok: false, error: 'not-a-word' });
      if (board.length < 2 || board.length > BOARD_CAP + 2 || board.some((w) => !WORD_RE.test(w))) {
        return res.status(400).json({ ok: false, error: 'bad-board' });
      }
      if (board.includes(word)) return res.json({ ok: false, error: 'duplicate' });

      const results = await fetchSims(board.map((b) => [word, b]));
      // A word no model knows can never link — tell the player instead of
      // silently scoring 0 against everything.
      if (results.every((r) => !r || typeof r.score !== 'number')) {
        return res.json({ ok: false, error: 'unknown-word' });
      }
      const sims = results.map((r, i) => ({
        word: board[i],
        score: (r && typeof r.score === 'number') ? r.score : 0,
      }));
      res.json({ ok: true, word, sims });
    } catch (err) {
      console.error('[Synapse] guess error:', err.message);
      res.status(503).json({ ok: false, error: 'similarity-unavailable' });
    }
  });

  // Score a Searchle-style batch in one round-trip. Same stateless contract
  // as /guess: the client owns the board; each word is validated and scored
  // (in order) against the board plus the batch words accepted before it, and
  // /complete re-verifies everything anyway. Mirrors SynapseArena.submitWords.
  app.post('/api/synapse/guess-batch', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
      if (!allow('guess:' + ip, GUESS_MAX)) {
        return res.status(429).json({ ok: false, error: 'rate-limited' });
      }
      const board = Array.isArray(req.body?.board) ? req.body.board.map((w) => String(w || '').trim().toLowerCase()) : [];
      const words = Array.isArray(req.body?.words) ? req.body.words.map((w) => String(w || '').trim().toLowerCase()).filter(Boolean) : [];
      if (board.length < 2 || board.length > BOARD_CAP + 2 || board.some((w) => !WORD_RE.test(w))) {
        return res.status(400).json({ ok: false, error: 'bad-board' });
      }
      if (words.length < 1 || words.length > MAX_BATCH) return res.status(400).json({ ok: false, error: 'bad-words' });

      const effective = [...board]; // corners + prior words + accepted batch words
      const accepted = [], rejected = [];
      for (const word of words) {
        if (!WORD_RE.test(word)) { rejected.push({ word, error: 'bad-word' }); continue; }
        if (!wordBank.isValidWord(word)) { rejected.push({ word, error: 'not-a-word' }); continue; }
        if (effective.includes(word)) { rejected.push({ word, error: 'duplicate' }); continue; }
        if (effective.length - 2 >= BOARD_CAP) { rejected.push({ word, error: 'board-full' }); continue; }
        const results = await fetchSims(effective.map((b) => [word, b]));
        if (results.every((r) => !r || typeof r.score !== 'number')) {
          rejected.push({ word, error: 'unknown-word' });
          continue;
        }
        const sims = results.map((r, i) => ({
          word: effective[i],
          score: (r && typeof r.score === 'number') ? r.score : 0,
        }));
        accepted.push({ word, sims });
        effective.push(word);
      }
      res.json({ ok: true, accepted, rejected });
    } catch (err) {
      console.error('[Synapse] guess-batch error:', err.message);
      res.status(503).json({ ok: false, error: 'similarity-unavailable' });
    }
  });

  // Verify a finished run and (daily, first win only) award XP.
  app.post('/api/synapse/complete', express.json({ limit: '16kb' }), async (req, res) => {
    try {
      if (!req.session?.discordUser) {
        return res.status(401).json({ ok: false, error: 'no-session' });
      }
      const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
      if (!userId) return res.status(401).json({ ok: false, error: 'no-account' });
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '';
      if (!allow('complete:' + userId + ':' + ip, SUBMIT_MAX)) {
        return res.status(429).json({ ok: false, error: 'rate-limited' });
      }

      const { mode, seed } = req.body || {};
      const words = Array.isArray(req.body?.words) ? req.body.words.map((w) => String(w || '').trim().toLowerCase()) : [];
      if (mode !== 'daily' && mode !== 'practice') return res.status(400).json({ ok: false, error: 'bad-mode' });
      if (words.length < 1 || words.length > BOARD_CAP) return res.status(400).json({ ok: false, error: 'bad-words' });
      if (new Set(words).size !== words.length) return res.status(400).json({ ok: false, error: 'bad-words' });
      for (const w of words) {
        if (!WORD_RE.test(w) || !wordBank.isValidWord(w)) return res.status(400).json({ ok: false, error: 'bad-words' });
      }

      const serverDay = edmontonDay();
      let pair;
      if (mode === 'daily') {
        if (req.body?.day && req.body.day !== serverDay) {
          return res.json({ ok: false, error: 'not-today' }); // run started on an older seed
        }
        pair = await getDailyPair(serverDay);
      } else {
        const s = Math.floor(Number(seed));
        if (!Number.isInteger(s) || s <= 0) return res.status(400).json({ ok: false, error: 'bad-seed' });
        pair = await resolvePair('practice:' + s);
      }
      const [cornerA, cornerB] = pair;
      if (words.includes(cornerA) || words.includes(cornerB)) {
        return res.status(400).json({ ok: false, error: 'bad-words' });
      }

      // Authoritative re-scoring of the full board.
      const board = [cornerA, cornerB, ...words];
      const pairs = [];
      for (let i = 0; i < board.length; i++) {
        for (let j = i + 1; j < board.length; j++) pairs.push([board[i], board[j]]);
      }
      const results = await fetchSimsChunked(pairs);
      const simMap = new Map();
      results.forEach((r, i) => {
        const [a, b] = pairs[i];
        const key = a < b ? a + '|' + b : b + '|' + a;
        simMap.set(key, (r && typeof r.score === 'number') ? r.score : null);
      });
      const simFor = (a, b) => simMap.get(a < b ? a + '|' + b : b + '|' + a);
      const edges = buildLinks(board, simFor);
      const bridge = bestBridge(cornerA, cornerB, edges);
      if (!bridge) {
        console.log('[Synapse] REJECT not-connected user=' + userId + ' mode=' + mode + ' words=' + words.length);
        return res.json({ ok: false, error: 'not-connected' });
      }

      const wordsUsed = words.length;
      const avgLink = Math.round(bridge.avgLink * 1000) / 1000;

      let xpAwarded = 0;
      let entry = null;
      let best = wordsUsed;
      let streak = 0;
      let rewardPending = false;
      if (mode === 'daily') {
        const u = req.session.discordUser;
        const displayName = String(u.displayName || u.globalName || u.username || 'Player').slice(0, 40);
        const avatar = (typeof u.avatar === 'string' && /^https:\/\//.test(u.avatar)) ? u.avatar.slice(0, 300) : null;
        const claim = hostedRewards.prepare({ game: 'synapse', userId, period: serverDay,
          xp: XP_BASE + Math.min(XP_BONUS_CAP, Math.max(0, (XP_EFFICIENCY_PAR - wordsUsed) * XP_PER_WORD_UNDER)),
          score: { userId: String(userId), displayName, avatar, day: serverDay, wordsUsed, avgLink },
          alreadyCompleted: db.hasSynapseEntry(serverDay, String(userId)) });
        const up = db.upsertSynapseScore({
          userId: String(userId), displayName, avatar,
          day: serverDay, wordsUsed, avgLink, xpAwarded,
        });
        best = up.best;
        streak = db.bumpSynapseProfile(String(userId), serverDay, edmontonDay(-1), wordsUsed);
        const delivery = await hostedRewards.deliver(claim);
        xpAwarded = delivery.xpAwarded;
        rewardPending = delivery.rewardPending;
        entry = db.getSynapseUserEntry(serverDay, String(userId));
      }

      // Feed the connected words into the player's Word Library (both modes;
      // fire-and-forget so it never delays or breaks the win response).
      reportSynapseLibrary(String(userId), req.session.discordUser, words);

      console.log('[Synapse] WIN user=' + userId + ' mode=' + mode + ' words=' + wordsUsed + ' avg=' + avgLink + ' xp=' + xpAwarded);
      res.json({
        ok: true,
        win: true,
        wordsUsed,
        avgLink,
        bottleneck: Math.round(bridge.bottleneck * 1000) / 1000,
        path: bridge.path,
        xpAwarded, rewardPending,
        best,
        rank: entry ? entry.rank : null,
        streak,
      });
    } catch (err) {
      console.error('[Synapse] complete error:', err.message);
      res.status(500).json({ ok: false, error: 'server-error' });
    }
  });

  app.get('/api/synapse/leaderboard', async (req, res) => {
    try {
      const day = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.day || '')) ? req.query.day : edmontonDay();
      const top = db.getSynapseTop(day, TOP_LIMIT).map((r, i) => ({
        rank: i + 1,
        name: r.display_name || 'Player',
        avatar: r.avatar || null,
        wordsUsed: r.words_used,
        avgLink: r.avg_link,
      }));
      let me = null;
      if (req.session?.discordUser) {
        const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
        if (userId) me = db.getSynapseUserEntry(day, String(userId));
      }
      res.json({ ok: true, day, top, me });
    } catch (err) {
      console.error('[Synapse] leaderboard error:', err.message);
      res.status(500).json({ ok: false, error: 'server-error' });
    }
  });

  app.get('/api/synapse/me', async (req, res) => {
    try {
      if (!req.session?.discordUser) return res.json({ ok: true, profile: null });
      const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
      if (!userId) return res.json({ ok: true, profile: null });
      const profile = db.getSynapseProfile(String(userId));
      const todayEntry = db.getSynapseUserEntry(edmontonDay(), String(userId));
      res.json({ ok: true, profile, today: todayEntry });
    } catch (err) {
      console.error('[Synapse] me error:', err.message);
      res.status(500).json({ ok: false, error: 'server-error' });
    }
  });

  console.log('[Synapse] routes registered');

  // Expose the similarity client + corner-pair resolver so the multiplayer
  // engine (src/synapse-mp.js) reuses the exact same scoring + pair-picking
  // instead of duplicating them (buildLinks is already shared via exports).
  return { fetchSims, resolvePair, getPairPool };
}

module.exports = { registerRoutes, buildLinks, bestBridge, LINK_THRESHOLD, MAX_LINKS_PER_WORD };
