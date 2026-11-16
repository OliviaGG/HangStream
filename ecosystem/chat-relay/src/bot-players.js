'use strict';

/**
 * Bot Players v2 — simulated viewers for streamer game sessions.
 *
 * Injects synthetic guesses through relay.handleMessage() — the same entry
 * point TikTok chat and the streamer keyboard widget use — so bot guesses
 * land on the session board and overlays exactly like a real viewer's.
 *
 * Supported games (per-streamer, each with its OWN independent roster; the
 * streamer picks which of these bots are routed to via settings.games):
 *   - Searchle / Searchle Grid — semantic word hunt. Candidates are
 *     pre-ranked via /api/discord-bot/searchle/evaluate; anything that
 *     would hit rank 1 is discarded, and the allowed rank floor tightens
 *     with round age so the "crowd" appears to converge.
 *   - Word5000 — Wordle-style secret word. Bots read the session's board
 *     (letterStates) via the game's /api/session/target and only play
 *     valid words that avoid letters already proven absent — guesses that
 *     genuinely narrow the puzzle — while never playing the secret word.
 *   - Color 500 (game id colour500) — Mastermind. Bots read the code and the
 *     board's peg history via the game's /api/session/target and play codes
 *     consistent with that feedback (skill-weighted), sent as coloured
 *     squares. They never play the code, nor a near-miss early in a round.
 *
 * Anti-tell design: bots impersonate independent WEBSITE players (named
 * "Anon #N", N random 1–200, ids bot_anon<N>), so:
 *   - each game gets a DIFFERENT roster with DISJOINT anon numbers and
 *     different words — the same name guessing the same word in two games
 *     at once would reveal a chat-fed bot;
 *   - every message carries _botSoloGame so relay.js routes it to exactly
 *     one game room instead of the streamer-wide chat fan-out;
 *   - bots never appear in the stream chat overlay or TTS (relay.js skips
 *     platform 'bot' on those surfaces, like real website players).
 *
 * Bots NEVER win: per-game never-win filters plus a quiet window after any
 * win/round flip (covers each game's ~8s auto-restart) plus a send-time
 * target check. Sessions award no WT XP/ELO/GOAT, and rewardPlayer /
 * reportLibraryWord refuse platform 'bot' outright as belt-and-braces.
 */

// Timing/tuning knobs. Mutable object (not consts) so tests can compress the
// clock via __private.T — production code never reassigns these.
const T = {
  TICK_MS: 2000,
  TARGET_POLL_MS: 4000,          // refresh session state at most this often
  TARGET_STALE_MS: 12000,        // never guess against state older than this
  MIN_GAP_PER_GAME_MS: 2500,     // floor between bot guesses in one game session
  EVAL_BATCH: 6,                 // candidates considered per guess decision
  HTTP_TIMEOUT_MS: 5000,
  BUMP_CHANCE: 0.08,             // searchle only: odds of re-guessing a known word (bump)
  STAGGER_MIN_MS: 3000,          // first-guess stagger after a round starts
  STAGGER_SPREAD_MS: 15000,
  QUIET_MIN_MS: 12000,           // hush after a win / round flip
  QUIET_SPREAD_MS: 10000,
  // Mean seconds between guesses per bot, by intensity. ±45% jitter applied.
  INTENSITY_GAP_S: { chill: 45, normal: 24, busy: 12 },
};

// Supported game ids → brain family. Games in the same family share ONE
// backend session (searchle-grid renders the same round as searchle), so a
// streamer gets at most one runtime per family. searchle-numbers stays
// unsupported (numeric targets; the evaluate endpoint ranks words only).
const GAME_FAMILY = {
  searchle: 'searchle',
  'searchle-grid': 'searchle',
  word500: 'word500',
  colour500: 'colour500',
};

// Round-age difficulty shaping (searchle): until `untilS` seconds into the
// round, a candidate whose rank is better (lower) than `minRank` is
// rejected. Rank 1 is always rejected regardless of band.
const DIFFICULTY_BANDS = [
  { untilS: 120, minRank: 200 },
  { untilS: 300, minRank: 40 },
  { untilS: Infinity, minRank: 8 },
];

// Bots present as anonymous viewers: "Anon #N" with N random in 1–200,
// matching the naming Searchle's anonRegistry gives real unnamed viewers.
// `exclude` keeps numbers disjoint across a streamer's per-game rosters.
// skill ∈ [0,1]: higher skill picks the strongest allowed candidate from
// its batch; lower skill picks more randomly.
const ANON_MAX = 200;

// Words bots must never volunteer on a stream. Real viewers can and do type
// crude words (the games' own blocklists arbitrate those), but a bot doing
// it unprompted is a bad look on a family stream. Applied when building the
// searchle vocab and when picking word500 candidates.
const NSFW_EXCLUDE = new Set([
  'anal', 'anus', 'arse', 'ass', 'asses', 'boob', 'boobs', 'butt', 'butts',
  'cock', 'cocks', 'cum', 'dick', 'dicks', 'dildo', 'erotic', 'hooker',
  'horny', 'nude', 'nudes', 'penis', 'piss', 'porn', 'prostitute', 'pussy',
  'rape', 'rectum', 'semen', 'sex', 'sexy', 'shit', 'slut', 'sluts', 'tit',
  'tits', 'turd', 'vagina', 'whore', 'whores',
]);

// ── Colour 500 palette ───────────────────────────────────────────
// Index-aligned with PALETTE in Colour500's src/mastermind.js — position IS
// the colour id in every code the game hands us, so these two lists must
// never drift. Bots send the SQUARES: emoji parse bare no matter how the
// streamer has `requireLetterPrefix` set, where letters would not.
const COLOUR500_LETTERS = ['R', 'G', 'B', 'Y', 'P', 'O', 'N', 'K'];
const COLOUR500_SQUARES = ['🟥', '🟩', '🟦', '🟨', '🟪', '🟧', '🟫', '⬛'];

function _codeToLetters(code) {
  return code.map((i) => COLOUR500_LETTERS[i] || '?').join('').toLowerCase();
}

function _lettersToSquares(letters) {
  return [...letters.toUpperCase()]
    .map((ch) => COLOUR500_SQUARES[COLOUR500_LETTERS.indexOf(ch)] || '')
    .join('');
}

// Mastermind scoring — a local copy of mm.scoreGuess() from the Colour500
// repo. Duplicated rather than required across repos (the game already
// reaches into chat-relay for game-shared.js; a cycle back would be worse),
// so keep the two in step if the rule ever changes.
function _scoreCode(guess, code) {
  let exact = 0;
  const codeCounts = new Map();
  const guessCounts = new Map();
  for (let i = 0; i < code.length; i++) {
    if (guess[i] === code[i]) { exact++; continue; }
    codeCounts.set(code[i], (codeCounts.get(code[i]) || 0) + 1);
    guessCounts.set(guess[i], (guessCounts.get(guess[i]) || 0) + 1);
  }
  let misplaced = 0;
  for (const [colour, n] of guessCounts) {
    misplaced += Math.min(n, codeCounts.get(colour) || 0);
  }
  return { exact, misplaced };
}

function makeAnonRoster(count, exclude) {
  const n = Math.max(1, Math.min(ANON_MAX, count || 4));
  const taken = exclude instanceof Set ? exclude : new Set();
  const nums = new Set();
  let guard = 0;
  while (nums.size < n && guard++ < 5000) {
    const num = 1 + Math.floor(Math.random() * ANON_MAX);
    if (!taken.has(num)) nums.add(num);
  }
  return [...nums].map((num) => ({
    num,
    slug: `anon${num}`,
    username: `anon${num}`,
    displayName: `Anon #${num}`,
    skill: 0.2 + Math.random() * 0.7,
  }));
}

// ── Runtime state (module-level, declared above all closures — TDZ rule) ──
// One runtime per (streamer, game family), keyed "discordId|family".
const runtimes = new Map();

let _deps = null;     // { relay, streamers, streamerGoals, wordBank, gamePorts, apiSecret }
let _timer = null;
let _vocab = null;    // searchle vocab { common, mid, rare } — built lazily

// ── Init / lifecycle ─────────────────────────────────────────────

function init(deps) {
  _deps = deps;
  if (_timer) clearInterval(_timer);
  _timer = setInterval(() => { tick().catch(() => {}); }, T.TICK_MS);
  if (_timer.unref) _timer.unref();
  console.log('[BotPlayers] Initialized ('
    + [...new Set(Object.values(GAME_FAMILY))].join(' + ')
    + ' sessions, tick ' + T.TICK_MS + 'ms)');
}

function stop() {
  if (_timer) clearInterval(_timer);
  _timer = null;
}

// ── Searchle vocabulary ──────────────────────────────────────────
// Built once from the word-bank target pool (curated common words — the
// same style of vocabulary real casual players draw from), bucketed by
// Zipf frequency so sampling can skew common.

function buildVocab() {
  if (_vocab) return _vocab;
  const wb = _deps.wordBank;
  const buckets = { common: [], mid: [], rare: [] };
  const byLength = wb.getTargets();
  for (const len of Object.keys(byLength)) {
    const n = Number(len);
    if (!(n >= 4 && n <= 10)) continue;
    for (const w of byLength[len]) {
      if (NSFW_EXCLUDE.has(w)) continue;
      const z = wb.getFrequency(w);
      if (z == null) { buckets.rare.push(w); continue; }
      if (z >= 4.2) buckets.common.push(w);
      else if (z >= 3.4) buckets.mid.push(w);
      else buckets.rare.push(w);
    }
  }
  _vocab = buckets;
  console.log(`[BotPlayers] Vocab ready: ${buckets.common.length} common / ${buckets.mid.length} mid / ${buckets.rare.length} rare`);
  return _vocab;
}

function sampleWord(skill) {
  const v = buildVocab();
  // Higher skill drifts slightly away from ultra-common words.
  const r = Math.random();
  let pool;
  if (r < 0.62 - skill * 0.15) pool = v.common;
  else if (r < 0.92) pool = v.mid;
  else pool = v.rare;
  if (!pool.length) pool = v.common.length ? v.common : v.mid;
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Game-server internal API ─────────────────────────────────────

function _gamePort(family) {
  const ports = _deps.gamePorts || {};
  if (family === 'searchle') return ports.searchle || 3015;
  if (family === 'word500') return ports.word500 || 3011;
  if (family === 'colour500') return ports.colour500 || 3033;
  return null;
}

async function _gameGet(family, pathname) {
  const res = await fetch(`http://localhost:${_gamePort(family)}${pathname}`, {
    headers: { 'x-api-key': _deps.apiSecret },
    signal: AbortSignal.timeout(T.HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${family} ${pathname} -> ${res.status}`);
  return res.json();
}

async function _gamePost(family, pathname, body) {
  const res = await fetch(`http://localhost:${_gamePort(family)}${pathname}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': _deps.apiSecret },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(T.HTTP_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${family} ${pathname} -> ${res.status}`);
  return res.json();
}

// Both games expose the same GET /api/session/target contract (targetWord /
// isWon); word500 additionally returns wordLength / letterStates /
// guessedWords, which its brain uses to make guesses that respect the board.
function fetchSessionTarget(family, handle, gameId) {
  return _gameGet(family, `/api/session/target?handle=${encodeURIComponent(handle)}&gameId=${encodeURIComponent(gameId || family)}`);
}

function evaluateSearchleGuess(targetWord, guess) {
  return _gamePost('searchle', '/api/discord-bot/searchle/evaluate', { targetWord, guess });
}

// ── Per-(streamer, game) runtime ─────────────────────────────────

function _rtKey(discordId, family) { return `${discordId}|${family}`; }

function _anonNumbersInUse(discordId, exceptFamily) {
  const used = new Set();
  for (const [key, rt] of runtimes) {
    if (!key.startsWith(`${discordId}|`)) continue;
    if (exceptFamily && key === _rtKey(discordId, exceptFamily)) continue;
    for (const p of rt.personas) used.add(p.num);
  }
  return used;
}

function _newRuntime(discordId, family, settings) {
  return {
    discordId,
    family,
    handle: null,
    gameId: family,       // raw routed game id (e.g. searchle-grid); updated each tick
    personas: makeAnonRoster(settings.count, _anonNumbersInUse(discordId, family)).map((p) => ({
      ...p,
      nextGuessAt: 0,     // 0 = unscheduled (set on round detect)
    })),
    target: { word: null, fetchedAt: 0, isWon: false },
    // Per-family view of the visible board. word500 uses wordLength/
    // letterStates/guessedWords; colour500 uses code/codeLength/paletteSize/
    // history/playedKeys/boardFull. searchle needs none of it.
    board: {
      wordLength: 5, letterStates: {}, guessedWords: new Set(),
      code: null, codeLength: 4, paletteSize: 6, history: [], playedKeys: new Set(), boardFull: false,
    },
    roundStartedAt: 0,
    quietUntil: 0,
    guessedThisRound: new Set(),
    lastGuessAt: 0,
    guessesThisRound: 0,
    totalGuesses: 0,
    busy: false,          // in-flight guard: one decision pipeline at a time
    lastError: null,
  };
}

function _gapMs(intensity, skill) {
  const base = (T.INTENSITY_GAP_S[intensity] || T.INTENSITY_GAP_S.normal) * 1000;
  // Lower-skill personas chat a touch less often; ±45% jitter.
  const personaMult = 1.15 - skill * 0.3;
  const jitter = 0.55 + Math.random() * 0.9;
  return Math.round(base * personaMult * jitter);
}

function _difficultyMinRank(roundAgeS) {
  for (const band of DIFFICULTY_BANDS) {
    if (roundAgeS < band.untilS) return band.minRank;
  }
  return DIFFICULTY_BANDS[DIFFICULTY_BANDS.length - 1].minRank;
}

function _onRoundChange(rt, newWord) {
  rt.target.word = newWord;
  rt.roundStartedAt = Date.now();
  rt.guessedThisRound = new Set();
  rt.guessesThisRound = 0;
  // Stagger everyone's first guess out so a fresh round doesn't get an
  // instant synchronized burst.
  for (const p of rt.personas) {
    p.nextGuessAt = Date.now() + T.STAGGER_MIN_MS + Math.random() * T.STAGGER_SPREAD_MS;
  }
}

// ── Eligibility ──────────────────────────────────────────────────
// A streamer's bot-eligible games = primary active game + enabled gameEmbed
// widget games, mapped to supported families (deduped — grid and plain
// searchle share one session), then filtered by the streamer's chosen
// routing (settings.games). Searchle additionally requires English.

function _eligibleGamesFor(s, streamers, settings) {
  const discordId = s.discordId;
  const session = streamers.getCurrentSession(discordId);
  if (!session || !s.handle) return [];

  const rawIds = [];
  const primary = (streamers.getActiveGames(discordId) || [])[0] || null;
  if (primary) rawIds.push(primary);
  try {
    const widgets = _deps.streamerGoals?.getForStreamer?.(discordId)?.config?.widgets || [];
    for (const w of widgets) {
      if (!w || w.type !== 'gameEmbed' || w.enabled === false) continue;
      let gameId = String(w.displayGame || '').trim().toLowerCase();
      if (gameId === 'searchle' && w.searchleMode === 'grid') gameId = 'searchle-grid';
      if (gameId) rawIds.push(gameId);
    }
  } catch (_) { /* widget config unavailable — primary game still plays */ }

  // Routing: settings.games is a family allowlist. Older settings records
  // predate routing and carry no list — treat that as "every family".
  const routed = Array.isArray(settings && settings.games) ? new Set(settings.games) : null;

  const byFamily = new Map();
  for (const gameId of rawIds) {
    const family = GAME_FAMILY[gameId];
    if (!family || byFamily.has(family)) continue;
    if (routed && !routed.has(family)) continue;
    if (family === 'searchle' && streamers.getSearchleLanguage(discordId) !== 'en') continue;
    byFamily.set(family, gameId);
  }
  return [...byFamily.entries()].map(([family, gameId]) => ({ family, gameId }));
}

// ── Main loop ────────────────────────────────────────────────────

async function tick() {
  if (!_deps) return;
  const { streamers } = _deps;

  const liveKeys = new Set();
  const work = [];

  for (const s of streamers.getAll()) {
    const discordId = s.discordId;
    const settings = streamers.getBotPlayers(discordId);
    if (!settings.enabled) continue;

    for (const { family, gameId } of _eligibleGamesFor(s, streamers, settings)) {
      const key = _rtKey(discordId, family);
      liveKeys.add(key);

      let rt = runtimes.get(key);
      if (!rt || rt.personas.length !== Math.max(1, Math.min(ANON_MAX, settings.count || 4))) {
        rt = _newRuntime(discordId, family, settings);
        runtimes.set(key, rt);
      }
      rt.handle = s.handle;
      rt.gameId = gameId;
      work.push({ rt, settings });
    }
  }

  // Drop runtimes whose streamer/game is no longer eligible.
  for (const key of [...runtimes.keys()]) {
    if (!liveKeys.has(key)) runtimes.delete(key);
  }

  // Per-game pipelines run concurrently (each guards itself with rt.busy).
  await Promise.all(work.map(async ({ rt, settings }) => {
    if (rt.busy) return;
    rt.busy = true;
    try {
      await _tickRuntime(rt, settings);
      rt.lastError = null;
    } catch (err) {
      rt.lastError = err.message || String(err);
    } finally {
      rt.busy = false;
    }
  }));
}

async function _tickRuntime(rt, settings) {
  const now = Date.now();

  // Refresh session state (rate-limited).
  if (now - rt.target.fetchedAt > T.TARGET_POLL_MS) {
    const data = await fetchSessionTarget(rt.family, rt.handle, rt.gameId);
    rt.target.fetchedAt = Date.now();
    // Every family reports its secret as one comparable lowercase string —
    // the word for searchle/word500, the letter form of the code (rgby) for
    // colour500 — so round-change detection below is family-agnostic.
    const rawTarget = data && (rt.family === 'colour500' ? data.targetCode : data.targetWord);
    const word = rawTarget ? String(rawTarget).toLowerCase() : null;
    const isWon = !!(data && data.isWon);

    if (rt.family === 'word500' && data) {
      rt.board.wordLength = Number(data.wordLength) || 5;
      rt.board.letterStates = data.letterStates || {};
      rt.board.guessedWords = new Set((data.guessedWords || []).map((w) => String(w).toLowerCase()));
    }

    if (rt.family === 'colour500' && data) {
      rt.board.code = Array.isArray(data.code) ? data.code : null;
      rt.board.codeLength = Number(data.codeLength) || 4;
      rt.board.paletteSize = Number(data.paletteSize) || 6;
      rt.board.boardFull = !!data.boardFull;
      rt.board.history = (data.guesses || []).filter((g) => Array.isArray(g.code));
      rt.board.playedKeys = new Set(rt.board.history.map((g) => _codeToLetters(g.code)));
    }

    if (isWon || (rt.target.word && word && word !== rt.target.word)) {
      // Round ended (or flipped under us). Go quiet through the win card +
      // the session's auto-restart window, then re-detect the new round.
      rt.target.isWon = isWon;
      if (word && word !== rt.target.word) {
        _onRoundChange(rt, word);
      } else {
        rt.target.word = null; // rediscover after restart
      }
      rt.quietUntil = Date.now() + T.QUIET_MIN_MS + Math.random() * T.QUIET_SPREAD_MS;
      return;
    }

    rt.target.isWon = isWon;
    if (word && !rt.target.word) _onRoundChange(rt, word);
    if (!word) rt.target.word = null;
  }

  // Gates: need a live, un-won round, fresh state, and no quiet period.
  if (!rt.target.word || rt.target.isWon) return;
  if (now < rt.quietUntil) return;
  if (now - rt.target.fetchedAt > T.TARGET_STALE_MS) return;
  if (now - rt.lastGuessAt < T.MIN_GAP_PER_GAME_MS) return;

  // Find the persona whose turn is up (earliest due).
  const due = rt.personas
    .filter((p) => p.nextGuessAt > 0 && p.nextGuessAt <= now)
    .sort((a, b) => a.nextGuessAt - b.nextGuessAt)[0];
  if (!due) return;

  // Every brain returns the guess in the same comparable form the target is
  // stored in (colour500: letters, e.g. "rgby"), so the safety check below
  // stays family-agnostic; only the wire format differs at send time.
  let word;
  if (rt.family === 'word500') word = _pickWord500Guess(rt, due);
  else if (rt.family === 'colour500') word = _pickColour500Guess(rt, due);
  else word = await _pickSearchleGuess(rt, due);
  // Reschedule regardless of outcome so a dry pick doesn't hot-loop.
  due.nextGuessAt = Date.now() + _gapMs(settings.intensity, due.skill);
  if (!word) return;

  // Final safety: never emit the target word itself (covers the tiny race
  // where the round flipped after our last state poll).
  if (word.toLowerCase() === rt.target.word) return;

  // Colour 500 takes coloured squares on the wire — they parse bare whatever
  // the streamer's requireLetterPrefix setting is, and a contiguous run of
  // emoji is one token, so the relay's batch-guess clamp can't bite either.
  const message = rt.family === 'colour500' ? _lettersToSquares(word) : word;
  if (!message) return;

  _deps.relay.handleMessage({
    platform: 'bot',
    user: {
      id: `bot_${due.slug}`,
      username: due.username,
      displayName: due.displayName,
      profilePic: null,
      badges: [],
    },
    message,
    _targetGame: rt.gameId,
    _botSoloGame: rt.gameId,
    _streamerId: rt.discordId,
  }).catch((err) => {
    console.warn('[BotPlayers] handleMessage error:', err.message || err);
  });

  rt.guessedThisRound.add(word.toLowerCase());
  rt.lastGuessAt = Date.now();
  rt.guessesThisRound++;
  rt.totalGuesses++;
}

// ── Searchle brain ───────────────────────────────────────────────
// Occasionally re-guesses a word bots already found (renders as a bump —
// real chats do this constantly). Otherwise samples a batch, ranks each
// against the target, and picks per skill and round-age difficulty band.
// Returns null when nothing safe emerged.

async function _pickSearchleGuess(rt, persona) {
  if (rt.guessedThisRound.size > 2 && Math.random() < T.BUMP_CHANCE) {
    const arr = [...rt.guessedThisRound];
    return arr[Math.floor(Math.random() * arr.length)];
  }

  const seen = new Set();
  const candidates = [];
  for (let i = 0; i < T.EVAL_BATCH * 2 && candidates.length < T.EVAL_BATCH; i++) {
    const w = sampleWord(persona.skill);
    if (!w || seen.has(w) || rt.guessedThisRound.has(w) || w === rt.target.word) continue;
    seen.add(w);
    candidates.push(w);
  }
  if (!candidates.length) return null;

  const roundAgeS = (Date.now() - rt.roundStartedAt) / 1000;
  const minRank = _difficultyMinRank(roundAgeS);

  const ranked = [];
  for (const w of candidates) {
    let evald;
    try {
      evald = await evaluateSearchleGuess(rt.target.word, w);
    } catch (_) {
      continue; // evaluate hiccup — drop this candidate, keep the rest
    }
    if (!evald || !evald.ok || !evald.valid) continue;
    if (evald.isWin || evald.rank === 1) continue;             // NEVER win
    const guessWord = evald.normalizedGuess || w;
    if (guessWord === rt.target.word || rt.guessedThisRound.has(guessWord)) continue;
    const rank = Number.isFinite(evald.rank) && evald.rank > 0 ? evald.rank : Infinity;
    if (rank < minRank) continue;                              // too hot for this round age
    ranked.push({ word: guessWord, rank });
  }
  if (!ranked.length) return null;

  ranked.sort((a, b) => a.rank - b.rank);
  // High skill takes the best allowed candidate; low skill wanders.
  const idx = Math.random() < persona.skill ? 0 : Math.floor(Math.random() * ranked.length);
  return ranked[idx].word;
}

// ── Word5000 brain ───────────────────────────────────────────────
// Wordle-style: play valid words of the session's length that respect the
// visible board — no letters already proven absent, not already guessed —
// preferring words that try the most untested letters (the guesses a good
// player makes to narrow the word). NEVER the secret word itself.

function _pickWord500Guess(rt, persona) {
  const len = rt.board.wordLength || 5;
  const states = rt.board.letterStates || {};
  const wb = _deps.wordBank;
  const pool = [...(wb.getTargets(len) || []), ...(wb.getTargets(String(len)) || [])];
  const source = pool.length ? pool : (wb.getDictionary(len) || []);
  if (!source.length) return null;

  const scored = [];
  const tried = new Set();
  for (let i = 0; i < 80 && scored.length < T.EVAL_BATCH; i++) {
    const w = source[Math.floor(Math.random() * source.length)];
    if (!w || w.length !== len || tried.has(w)) continue;
    tried.add(w);
    const lower = w.toLowerCase();
    if (NSFW_EXCLUDE.has(lower)) continue;
    if (lower === rt.target.word) continue;                    // NEVER win
    if (rt.guessedThisRound.has(lower) || rt.board.guessedWords.has(lower)) continue;
    const letters = new Set(lower.toUpperCase().split(''));
    let hasAbsent = false;
    let fresh = 0;
    for (const ch of letters) {
      const st = states[ch];
      if (st === 'absent') { hasAbsent = true; break; }
      if (!st) fresh++;
    }
    if (hasAbsent) continue;                                   // respect the board
    scored.push({ word: lower, fresh });
  }
  if (!scored.length) return null;

  // High skill maximizes new information; low skill picks whatever fits.
  scored.sort((a, b) => b.fresh - a.fresh);
  const idx = Math.random() < persona.skill ? 0 : Math.floor(Math.random() * scored.length);
  return scored[idx].word;
}

// ── Colour 500 brain ─────────────────────────────────────────────
// Mastermind: a secret code of `codeLength` slots drawn from the first
// `paletteSize` palette colours (repeats allowed), scored as exact/misplaced
// peg counts. Whether a candidate is CONSISTENT — does it reproduce every
// past guess's score? — is computable without the secret, which is exactly
// the deduction a real player does, so high-skill personas play consistent
// codes and low-skill ones wander. Never the secret, and never a near-miss
// while the round is young.

// A bot that plays a code one peg from the answer is handing it over. Until
// the round is 2 minutes old a candidate must sit at least 2 exact pegs off;
// after that, 1. Exactly right is always refused — that's a win.
function _colour500MaxExact(codeLength, roundAgeS) {
  return Math.max(0, codeLength - (roundAgeS < 120 ? 2 : 1));
}

// The default board (4 slots × 6 colours) is only 1296 codes, so enumerate
// the space when it's small enough — that's what makes high-skill deduction
// actually find consistent codes late in a round, where random sampling
// almost never would. Big boards (8 colours × 6 slots = 262k) fall back to
// sampling. Either way the list is shuffled, so the caller's early exit
// stays unbiased.
const COLOUR500_ENUMERATE_MAX = 20000;
const COLOUR500_SAMPLE_N = 400;

function _colour500Candidates(len, palette) {
  const space = Math.pow(palette, len);
  const out = [];
  if (space <= COLOUR500_ENUMERATE_MAX) {
    for (let n = 0; n < space; n++) {
      const code = [];
      let rest = n;
      for (let s = 0; s < len; s++) { code.push(rest % palette); rest = Math.floor(rest / palette); }
      out.push(code);
    }
  } else {
    for (let i = 0; i < COLOUR500_SAMPLE_N; i++) {
      const code = [];
      for (let s = 0; s < len; s++) code.push(Math.floor(Math.random() * palette));
      out.push(code);
    }
  }
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const COLOUR500_POOL_TARGET = 24; // stop scanning once each pool is this deep

function _pickColour500Guess(rt, persona) {
  const len = rt.board.codeLength || 4;
  const palette = Math.min(COLOUR500_LETTERS.length, Math.max(2, rt.board.paletteSize || 6));
  const secret = rt.board.code;
  if (!Array.isArray(secret) || secret.length !== len) return null;
  if (rt.board.boardFull) return null;   // game silently drops guesses past the cap

  const maxExact = _colour500MaxExact(len, (Date.now() - rt.roundStartedAt) / 1000);
  const history = rt.board.history || [];

  const consistent = [];
  const loose = [];
  for (const code of _colour500Candidates(len, palette)) {
    const letters = _codeToLetters(code);
    // A code already on the board is ignored by the game, so sending it
    // would be a silent no-op that still burned the persona's turn.
    if (rt.guessedThisRound.has(letters) || rt.board.playedKeys.has(letters)) continue;
    const vs = _scoreCode(code, secret);
    if (vs.exact >= len) continue;       // NEVER win
    if (vs.exact > maxExact) continue;   // too close for this round's age
    const fits = history.every((h) => {
      const s = _scoreCode(code, h.code);
      return s.exact === h.exact && s.misplaced === h.misplaced;
    });
    (fits ? consistent : loose).push(letters);
    if (consistent.length >= COLOUR500_POOL_TARGET && loose.length >= COLOUR500_POOL_TARGET) break;
  }

  // High skill deduces; low skill plays something plausible. Either pool
  // falls back to the other so a persona still speaks when one runs dry.
  const wantConsistent = Math.random() < persona.skill;
  const pool = (wantConsistent && consistent.length) ? consistent
    : (loose.length ? loose : consistent);
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Status (for the dashboard card) ──────────────────────────────

function getStatus(discordId) {
  const settings = _deps
    ? _deps.streamers.getBotPlayers(discordId)
    : { enabled: false, count: 4, intensity: 'normal', games: ['searchle', 'word500'] };
  const games = [];
  for (const [key, rt] of runtimes) {
    if (!key.startsWith(`${discordId}|`)) continue;
    games.push({
      gameId: rt.gameId,
      active: !!(rt.target.word && !rt.target.isWon && Date.now() >= rt.quietUntil),
      roster: rt.personas.map((p) => p.displayName),
      roundGuesses: rt.guessesThisRound,
      totalGuesses: rt.totalGuesses,
      lastError: rt.lastError,
    });
  }
  return {
    settings,
    games,
    active: games.some((g) => g.active),
    roster: games.flatMap((g) => g.roster),
    roundGuesses: games.reduce((sum, g) => sum + g.roundGuesses, 0),
    totalGuesses: games.reduce((sum, g) => sum + g.totalGuesses, 0),
    lastGuessAt: null,
    lastError: games.map((g) => g.lastError).filter(Boolean)[0] || null,
  };
}

module.exports = {
  init,
  stop,
  getStatus,
  __private: { T, runtimes, tick, makeAnonRoster, sampleWord, buildVocab, GAME_FAMILY },
};
