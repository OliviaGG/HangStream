// ===== Searchle game ranker (HangStream port) =====
// Wraps the ported wt-eco ranking engine with game sessions and a
// guess-ranking API used by server/server.js.
//
// The embedding model is loaded lazily on the first Searchle API call so
// server startup and all other games are unaffected. Until the model is
// built (tools/download-fasttext.js → build-model.js → convert-float16.js),
// API calls reject with code MODEL_NOT_READY instead of crashing the server.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const rankingEngine = require('./ranking-engine');
const guessHelpers = require('./guess-helpers');
const config = require('./config');
// The shared blocklist. A blocked word must never become a Searchle target
// (it would end up on screen) nor a guess (it would end up in chat history).
const wordPolicy = require('../games/word-policy');

const MODEL_BIN = path.join(config.modelsDir, 'fasttext', 'vectors.bin');
const MODEL_INDEX = path.join(config.modelsDir, 'fasttext', 'index.json');

const GAME_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours
const CLEANUP_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes

let initPromise = null;
let initialized = false;
let bankSet = null;      // all known English words (bank dictionary)
let targetList = [];     // targets valid in the active model vocabulary
let targetsLoaded = false;

function modelReady() {
  return fs.existsSync(MODEL_BIN) && fs.existsSync(MODEL_INDEX);
}

// Lazy, one-shot initialization of engine + bank dictionary.
function ensureInit() {
  if (initialized) return Promise.resolve();
  if (initPromise) return initPromise;

  initPromise = (async () => {
    if (!modelReady()) {
      const err = new Error(
        'Searchle embedding model not built. Run: node server/searchle/tools/download-fasttext.js, ' +
        'then node server/searchle/tools/build-model.js fasttext, then node server/searchle/tools/convert-float16.js fasttext'
      );
      err.code = 'MODEL_NOT_READY';
      throw err;
    }
    const t0 = Date.now();
    rankingEngine.init(config);

    // Bank dictionary — every valid English word (for "outside pool" tier).
    bankSet = new Set();
    try {
      const dict = JSON.parse(fs.readFileSync(
        path.join(__dirname, 'shared', 'word-bank', 'dictionary.json'), 'utf8'));
      for (const len in dict) {
        if (Array.isArray(dict[len])) {
          for (const w of dict[len]) bankSet.add(w);
        }
      }
    } catch (e) {
      console.warn('[Searchle] bank dictionary load failed:', e.message);
    }

    console.log(`[Searchle] ready in ${Date.now() - t0}ms (bank: ${bankSet.size.toLocaleString()} words)`);
    initialized = true;
  })();

  initPromise.catch(() => { initPromise = null; }); // allow retry on failure
  return initPromise;
}

// Lazily compute the list of target words present in the model vocabulary.
async function getTargets() {
  await ensureInit();
  if (!targetsLoaded) {
    const raw = JSON.parse(fs.readFileSync(config.targetsPath, 'utf8'));
    targetList = (Array.isArray(raw) ? raw : [])
      .map(w => String(w).toLowerCase().trim())
      .filter(w => /^[a-z]+$/.test(w) && rankingEngine.isValidTarget(w))
      .filter(w => wordPolicy.isWordAllowedForGame('searchle', 'target', w));
    targetsLoaded = true;
    console.log(`[Searchle] ${targetList.length} valid targets`);
  }
  return targetList;
}

// ---------------------------------------------------------------------------
// Game sessions
// ---------------------------------------------------------------------------
const games = new Map(); // gameId → { target, createdAt, guesses: Map, won, bestRank }

setInterval(() => {
  const now = Date.now();
  for (const [id, g] of games) {
    if (now - g.createdAt > GAME_TTL_MS) games.delete(id);
  }
}, CLEANUP_INTERVAL_MS).unref();

async function createGame() {
  const targets = await getTargets();
  if (targets.length === 0) {
    const err = new Error('No valid target words in model vocabulary');
    err.code = 'MODEL_NOT_READY';
    throw err;
  }
  const target = targets[crypto.randomInt(targets.length)];
  const gameId = crypto.randomBytes(8).toString('hex');
  const game = { target, createdAt: Date.now(), guesses: new Map(), won: false, bestRank: null };
  games.set(gameId, game);
  // Warm the ranking cache in the background so the first guess is fast.
  rankingEngine.computeRankings(target, config).catch(() => {});
  return { gameId };
}

function resolveTier(word, rankings) {
  if (rankings.has(word)) return { status: 'ranked', rank: rankings.get(word) };
  if (bankSet.has(word)) return { status: 'outside', rank: null };
  return { status: 'unknown', rank: null };
}

async function submitGuess(gameId, rawWord) {
  const game = games.get(gameId);
  if (!game) {
    const err = new Error('Game not found or expired');
    err.code = 'NO_GAME';
    throw err;
  }
  if (game.won) {
    const err = new Error('Round already won — start a new round');
    err.code = 'GAME_WON';
    throw err;
  }

  const word = String(rawWord || '').toLowerCase().trim();
  if (!config.guessPattern.test(word)) {
    return { status: 'invalid' };
  }
  if (!wordPolicy.isWordAllowedForGame('searchle', 'guess', word)) {
    return { status: 'blocked' };
  }

  await ensureInit();

  if (game.guesses.has(word)) {
    return { status: 'duplicate', word };
  }

  const canonical = guessHelpers.normalizeWord(word);
  const rankings = await rankingEngine.computeRankings(game.target, config);
  const total = rankings.size;

  const tier = resolveTier(canonical, rankings);
  if (tier.status === 'unknown') {
    // Not a real word — reject without counting it as a guess.
    return { status: 'unknown', word };
  }

  const guessNumber = game.guesses.size + 1;
  const win = tier.rank === config.winRank;
  const result = {
    status: tier.status,
    word,
    canonical,
    rank: tier.rank,
    total,
    guessNumber,
    win,
    bestRank: game.bestRank,
    poolSize: total,
  };

  game.guesses.set(word, { rank: tier.rank, status: tier.status });
  if (tier.rank !== null) {
    const isCloser = game.bestRank === null || tier.rank < game.bestRank;
    if (isCloser) game.bestRank = tier.rank;
    result.newBest = isCloser;
  }
  if (win) {
    game.won = true;
    result.target = game.target;
    result.points = guessNumber <= 3 ? 100 : guessNumber <= 6 ? 60 : guessNumber <= 10 ? 30 : 10;
    result.guessCount = guessNumber;
  }
  return result;
}

// For online/chat mode: submit a chat word against a game. Chat guesses that
// aren't real words are silently ignored (returns unknown, not counted).
async function status() {
  return {
    modelReady: modelReady(),
    initialized,
    games: games.size,
  };
}

module.exports = { modelReady, ensureInit, createGame, submitGuess, status, games };
