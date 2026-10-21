// Word policy — the shared blocklist every game consults.
//
// Ported from the Word Tycoon ecosystem, which keeps one blocklist for the
// whole product (chat-relay/src/word-bank-exclusions.js) and applies it through
// a per-game policy file (chat-relay/src/game-word-policy.js). HangStream uses
// the same blocklist file the ecosystem ships, so a word that is blocked
// upstream is blocked here too.
//
// The point is that a blocked word must never reach a stream: it can neither
// be the answer (that would put it on screen) nor be accepted as a guess (that
// would put it in chat history or a scoreboard).
//
// Usage notes:
//   - `exact`   — whole-word matches, compared lowercased
//   - `partial` — substring matches
//   - `patterns`— regular expressions, matched case-insensitively

const fs = require('fs');
const path = require('path');

const BLOCKED_PATH = path.join(__dirname, '..', 'searchle', 'shared', 'word-bank', 'blocked-words.json');

/**
 * What a game does with a blocked word in each role.
 *
 * `block` refuses it outright. `allow` lets it through. Every game inherits
 * the same defaults; the table below only needs an entry when a game wants
 * something different, which is why it is empty here - same as upstream.
 */
const DEFAULT_RULES = {
  target: 'block',
  board_word: 'block',
  guess: 'block',
};

const GAME_RULES = {};

/** Aliases so the policy answers for whichever id a caller happens to hold. */
const GAME_ALIASES = {
  hangman: 'hangman',
  spellingbee: 'spellingbee',
  'spelling-bee': 'spellingbee',
  speedscramble: 'speedscramble',
  'speed-scramble': 'speedscramble',
  wordle: 'wordle',
  searchle: 'searchle',
};

let exactWords = new Set();
let partialWords = [];
let patterns = [];
let loaded = false;

/**
 * How often the blocklist file is re-checked for changes, in ms.
 *
 * The file is consulted per word, and a bee round can walk thousands of
 * dictionary entries, so the mtime is only re-read on this interval rather
 * than on every lookup.
 */
const STAT_INTERVAL_MS = 2000;
let lastStat = 0;

function refresh() {
  const now = Date.now();
  if (loaded && now - lastStat < STAT_INTERVAL_MS) return;
  lastStat = now;
  try {
    const stats = fs.statSync(BLOCKED_PATH);
    if (loaded && stats.mtimeMs === refresh._mtimeMs) return;
    const raw = JSON.parse(fs.readFileSync(BLOCKED_PATH, 'utf8'));
    exactWords = new Set(
      (raw.exact || []).map((w) => String(w || '').toLowerCase()).filter(Boolean)
    );
    partialWords = (raw.partial || []).map((w) => String(w || '').toLowerCase()).filter(Boolean);
    patterns = (raw.patterns || [])
      .map((p) => {
        try { return new RegExp(p, 'i'); } catch (_) { return null; }
      })
      .filter(Boolean);
    refresh._mtimeMs = stats.mtimeMs;
    loaded = true;
  } catch (err) {
    console.warn('[word-policy] failed to load blocked-words.json:', err.message);
  }
}
refresh._mtimeMs = null;

/** Normalise a game id to the key the policy table uses. */
function normalizeGameId(gameId) {
  const key = String(gameId || '').trim();
  if (!key) return '';
  return GAME_ALIASES[key] || GAME_ALIASES[key.toLowerCase()] || key.toLowerCase();
}

/** Normalise a role name to one of target / board_word / guess. */
function normalizeUsage(usage) {
  const key = String(usage || '').trim().toLowerCase();
  return key || 'guess';
}

/** The resolved rules for a game. */
function getRules(gameId) {
  return { ...DEFAULT_RULES, ...(GAME_RULES[normalizeGameId(gameId)] || {}) };
}

/** What a game does with a blocked word in one role: 'block' or 'allow'. */
function getRule(gameId, usage) {
  const rules = getRules(gameId);
  const role = normalizeUsage(usage);
  return rules[role] || DEFAULT_RULES[role] || 'block';
}

/** True when the word itself is on the blocklist. */
function isBlockedWord(word) {
  refresh();
  const w = String(word || '').toLowerCase().trim();
  if (!w) return false;
  if (exactWords.has(w)) return true;
  if (partialWords.some((p) => w.includes(p))) return true;
  return patterns.some((re) => re.test(w));
}

/** True when the word may be used in the given role for the given game. */
function isWordAllowedForGame(gameId, usage, word) {
  if (getRule(gameId, usage) !== 'block') return true;
  return !isBlockedWord(word);
}

/** True when the word may not be used in the given role for the given game. */
function isWordBlockedForGame(gameId, usage, word) {
  return !isWordAllowedForGame(gameId, usage, word);
}

/** Drop every blocked word from a list. */
function filterWordsForGame(words, gameId, usage) {
  if (!Array.isArray(words)) return [];
  return words.filter((word) => isWordAllowedForGame(gameId, usage, word));
}

/** Drop every blocked word from a list, regardless of role. */
function sanitizeWords(words) {
  if (!Array.isArray(words)) return [];
  return words.filter((word) => !isBlockedWord(word));
}

/** The blocklist, for tooling and tests. */
function getExcludedWords() {
  refresh();
  return new Set(exactWords);
}

module.exports = {
  normalizeGameId,
  normalizeUsage,
  getRules,
  getRule,
  isBlockedWord,
  isWordAllowedForGame,
  isWordBlockedForGame,
  filterWordsForGame,
  sanitizeWords,
  getExcludedWords,
};
