// Server-side word validation for server-authoritative games.
//
// Mirrors the word-tycoon-ecosystem pattern where each game server owns an
// authoritative answer set instead of trusting the browser. HangStream ships
// one word file for every game:
//
//   - public/word-bank.json           { curated, general, fiveLetter,
//                                     basicEnglish } built by
//                                     server/games/tools/build-curated-words.js
//                                     - curated: [{ word, cat, difficulty }]
//                                       hand-picked words that carry a real
//                                       category, so the on-stream badge is a
//                                       usable hint
//                                     - general: { easy, medium, hard } the
//                                       ecosystem's own curated target list,
//                                       tagged by difficulty
//                                     - fiveLetter / basicEnglish: flat lists
//   - <repo>/server/searchle/shared/word-bank/dictionary.json
//                                     { "<len>": [words...] } large dictionary
//
// The dictionary.json that ships with Searchle is the richest source, so we
// prefer it when present and fall back to the smaller lists otherwise.
//
// Every pool is filtered through server/games/word-policy.js, so a blocked
// word can never become an answer or be accepted as a guess.

const fs = require('fs');
const path = require('path');

const policy = require('./word-policy');

const PUBLIC_DIR = path.join(__dirname, '..', '..', 'public');
const SEARCHLE_DICT = path.join(__dirname, '..', 'searchle', 'shared', 'word-bank', 'dictionary.json');
const SEARCHLE_BANK = path.join(__dirname, '..', 'searchle', 'shared', 'word-bank');
const WORD_BANK_PATH = path.join(PUBLIC_DIR, 'word-bank.json');

// Zipf-ish common-word tiers. Without a frequency table we approximate rarity
// from length: short words are common, long words are rare. Word Tycoon uses a
// real Zipf threshold (>= 4.0 common) — the shape of the split is what matters
// for scoring, and this keeps the port dependency-free.
const RARE_LENGTH = 9;
const HIDDEN_LENGTH = 12;

// Curated Hangman entries ({ word, cat, difficulty }) from the `curated`
// section of word-bank.json.
// Kept separately because these are the words the existing Hangman page and
// streamer hint UI already expose — a server round should draw from the same
// pool so a streamer recognises what chat is guessing.
let curatedWords = [];
let curatedLoaded = false;

// The general pool: the ecosystem's curated target list, tagged by difficulty
// and carrying the upstream frequency tier it came from.
let generalWords = [];
let generalLoaded = false;

let wordsByLength = new Map(); // length -> Set<word>
let allWords = new Set();
let loaded = false;

// Parsed word-bank.json, loaded once and shared by every section reader.
let bankFile = null;

function addWord(raw) {
  const word = String(raw || '').toLowerCase().trim();
  if (!/^[a-z]+$/.test(word)) return;
  allWords.add(word);
  let set = wordsByLength.get(word.length);
  if (!set) { set = new Set(); wordsByLength.set(word.length, set); }
  set.add(word);
}

/**
 * Read public/word-bank.json once. Every section is optional so a partial or
 * older file still loads.
 */
function loadBankFile() {
  if (bankFile) return bankFile;
  bankFile = { curated: [], general: {}, fiveLetter: [], basicEnglish: [] };
  if (!fs.existsSync(WORD_BANK_PATH)) return bankFile;
  try {
    const data = JSON.parse(fs.readFileSync(WORD_BANK_PATH, 'utf8'));
    if (Array.isArray(data.curated)) bankFile.curated = data.curated;
    if (data.general && typeof data.general === 'object') bankFile.general = data.general;
    if (Array.isArray(data.fiveLetter)) bankFile.fiveLetter = data.fiveLetter;
    if (Array.isArray(data.basicEnglish)) bankFile.basicEnglish = data.basicEnglish;
  } catch (err) {
    console.warn('word-bank: failed to read word-bank.json:', err.message);
  }
  return bankFile;
}

/**
 * Add every word in the merged bank to the shared dictionary: the curated and
 * general pools (which may carry objects or bare strings), plus the flat
 * five-letter and Basic English lists.
 */
function loadFromWordBank() {
  const bank = loadBankFile();
  let count = 0;
  const add = (raw) => {
    const before = allWords.size;
    addWord(typeof raw === 'string' ? raw : raw && raw.word);
    if (allWords.size > before) count++;
  };
  for (const item of bank.curated) add(item);
  for (const list of Object.values(bank.general)) {
    if (!Array.isArray(list)) continue;
    for (const word of list) add(word);
  }
  for (const word of bank.fiveLetter) add(word);
  for (const word of bank.basicEnglish) add(word);
  return count;
}

function loadFromSearchleDictionary() {
  if (!fs.existsSync(SEARCHLE_DICT)) return 0;
  try {
    const raw = JSON.parse(fs.readFileSync(SEARCHLE_DICT, 'utf8'));
    let count = 0;
    for (const key of Object.keys(raw)) {
      const list = raw[key];
      if (!Array.isArray(list)) continue;
      for (const word of list) { addWord(word); count++; }
    }
    return count;
  } catch (err) {
    console.warn('word-bank: failed to read Searchle dictionary:', err.message);
    return 0;
  }
}

/**
 * Load the curated word list once, preserving `cat` and `difficulty`.
 *
 * The `curated` section of word-bank.json is the source the Spielend Hangman
 * page uses, so it is also the right fountainhead for a server-authoritative
 * round: the category shown on stream stays meaningful and the difficulty
 * slider keeps working.
 *
 * Blocked words are dropped here rather than at pick time so no caller can
 * accidentally serve one.
 */
function loadCurated() {
  if (curatedLoaded) return curatedWords;
  curatedLoaded = true;
  for (const item of loadBankFile().curated) {
    const word = String((typeof item === 'string' ? item : item && item.word) || '').trim();
    if (!/^[a-z]+$/i.test(word)) continue;
    if (policy.isBlockedWord(word)) continue;
    curatedWords.push({
      word: word.toLowerCase(),
      cat: (typeof item === 'object' && item.cat) || 'General',
      difficulty: (typeof item === 'object' && item.difficulty) || 'medium',
    });
  }
  return curatedWords;
}

/**
 * Load the general pool once.
 *
 * `public/word-bank.json` is built by server/games/tools/build-curated-words.js
 * from the ecosystem's shared target list. The upstream frequency tiers are
 * read alongside it so the picker can prefer the words viewers recognise.
 */
function loadGeneralPool() {
  if (generalLoaded) return generalWords;
  generalLoaded = true;
  const buckets = loadBankFile().general;
  if (!buckets || typeof buckets !== 'object') return generalWords;
  try {
    const readList = (file) => {
      const full = path.join(SEARCHLE_BANK, file);
      if (!fs.existsSync(full)) return [];
      const raw = JSON.parse(fs.readFileSync(full, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    };
    const veryEasy = new Set(readList('searchle-very-easy-targets.json').map((w) => String(w).toLowerCase()));
    const easyTier = new Set(readList('searchle-easy-targets.json').map((w) => String(w).toLowerCase()));

    const seen = new Set();
    for (const [difficulty, list] of Object.entries(buckets)) {
      if (!Array.isArray(list)) continue;
      for (const raw of list) {
        const word = String(raw || '').toLowerCase();
        if (!/^[a-z]+$/.test(word)) continue;
        if (seen.has(word)) continue;
        seen.add(word);
        if (policy.isBlockedWord(word)) continue;
        const tier = veryEasy.has(word) ? 'very-easy' : easyTier.has(word) ? 'easy' : 'hard';
        generalWords.push({ word, difficulty, tier });
      }
    }
  } catch (err) {
    console.warn('word-bank: failed to read word-bank.json:', err.message);
  }
  return generalWords;
}

/** Every curated entry ({ word, cat, difficulty }), loading once. */
function curated() {
  return loadCurated();
}

/** The general pool ({ word, difficulty, tier }), loading once. */
function general() {
  return loadGeneralPool();
}

/** Curated entries matching an optional difficulty and/or category. */
function curatedFor({ difficulty = null, category = null } = {}) {
  return loadCurated().filter((entry) => {
    if (difficulty && entry.difficulty !== difficulty) return false;
    if (category && entry.cat.toLowerCase() !== String(category).toLowerCase()) return false;
    return true;
  });
}

/** The distinct categories present in the curated list, sorted. */
function curatedCategories() {
  const set = new Set(loadCurated().map((entry) => entry.cat));
  return Array.from(set).sort();
}

/** Load (once) and report how many words are available per length. */
function load() {
  if (loaded) return { sizes: sizes(), total: allWords.size };
  const fromDict = loadFromSearchleDictionary();
  const fromBank = loadFromWordBank();
  loaded = true;
  console.log(`word-bank loaded: ${allWords.size} words (searchle:${fromDict} bank:${fromBank})`);
  return { sizes: sizes(), total: allWords.size };
}

/**
 * Read-only helpers auto-load on first use so any consumer (including a bare
 * registry in tests) works without a separate boot step. `load()` stays
 * idempotent, so calling it explicitly at startup is still fine and cheap.
 */
function ensureLoaded() {
  if (!loaded) load();
}

/** { length: count } overview of the loaded maps (no lazy-load side effects). */
function sizes() {
  const out = {};
  for (const [len, set] of wordsByLength) out[len] = set.size;
  return out;
}

/** Lengths that have at least `min` words. */
function availableLengths(min = 1) {
  ensureLoaded();
  return Array.from(wordsByLength.keys()).filter((len) => wordsByLength.get(len).size >= min).sort((a, b) => a - b);
}

function has(word) {
  ensureLoaded();
  return allWords.has(String(word || '').toLowerCase());
}

function wordsOfLength(length) {
  ensureLoaded();
  return wordsByLength.get(Number(length)) || new Set();
}

/** Random word of a given length (or any length when omitted). */
function randomWord(length) {
  ensureLoaded();
  if (length) {
    const set = wordsOfLength(length);
    if (set.size === 0) return null;
    const arr = Array.from(set);
    return arr[Math.floor(Math.random() * arr.length)];
  }
  const arr = Array.from(allWords);
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

/**
 * Every dictionary word buildable from `letters` (a Set or string), optionally
 * requiring `requiredLetter`. Used by bee-style rounds.
 *
 * Blocked words are dropped: they are board words, and a board word ends up on
 * screen, so the blocklist applies here as well as to answers and guesses.
 */
function wordsFromLetters(letters, { requiredLetter = null, minLength = 3, maxLength = 15, gameId = 'spellingbee' } = {}) {
  ensureLoaded();
  const set = letters instanceof Set ? letters : new Set(String(letters || '').toLowerCase());
  const out = [];
  for (let len = minLength; len <= maxLength; len++) {
    const candidates = wordsByLength.get(len);
    if (!candidates || candidates.size === 0) continue;
    for (const word of candidates) {
      if (requiredLetter && !word.includes(requiredLetter)) continue;
      let ok = true;
      for (const ch of word) {
        if (!set.has(ch)) { ok = false; break; }
      }
      if (ok) out.push(word);
    }
  }
  return policy.filterWordsForGame(out, gameId, 'board_word');
}

/** Rarity tier for a word, used to weight scoring. */
function tierFor(word) {
  const len = String(word || '').length;
  if (len >= HIDDEN_LENGTH) return 'hidden';
  if (len >= RARE_LENGTH) return 'rare';
  return 'common';
}

/**
 * A random word drawn from the curated list, optionally filtered. Falls back to
 * the full word bank when the curated list has nothing matching, so a round can
 * always be built.
 */
function randomCuratedWord({ difficulty = null, category = null, minLength = 0, maxLength = Infinity } = {}) {
  ensureLoaded();
  let pool = curatedFor({ difficulty, category }).filter(
    (entry) => entry.word.length >= minLength && entry.word.length <= maxLength
  );
  if (pool.length === 0) {
    // Widen: drop the category, then the difficulty, before giving up.
    pool = curatedFor({ difficulty }).filter(
      (entry) => entry.word.length >= minLength && entry.word.length <= maxLength
    );
  }
  if (pool.length === 0) {
    // Last resort: any word inside the length band, so the band the game asked
    // for still holds.
    pool = loadGeneralPool().filter(
      (entry) => entry.word.length >= minLength && entry.word.length <= maxLength
    );
  }
  if (pool.length === 0) {
    const word = randomWord(null);
    return word ? { word, cat: 'General', difficulty: 'medium' } : null;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * Game difficulty level -> curated difficulty tag.
 *
 * The games do not agree on names: Hangman says easy/medium/hard, Speed
 * Scramble says easy/normal/hard/extreme, and the curated list only ever says
 * easy/medium/hard. This maps a level onto the tag vocabulary.
 */
const LEVEL_TO_TAG = {
  easy: 'easy',
  medium: 'medium',
  normal: 'medium',
  hard: 'hard',
  extreme: 'hard',
};

/**
 * How often a round is drawn from the curated pool rather than the general
 * one. The curated words carry a real category, so the badge on stream stays
 * useful; the general pool is far bigger, so it supplies the variety.
 */
const CURATED_PREFERENCE = 0.6;

/**
 * Below this many curated words in the requested band, the general pool takes
 * over completely. A thin band would otherwise serve the same handful of words
 * over and over.
 */
const MIN_CURATED_STOCK = 40;

/**
 * Draw bags, so a pool never serves the same word twice before it has been
 * exhausted. Keyed by pool, selector and length band.
 */
const bags = new Map();

/**
 * Take one entry from a pool without repeating an entry until the pool is
 * exhausted. The bag is refilled with a fresh shuffle when it runs dry.
 *
 * `match` narrows the draw without splitting the bag: the bag still holds the
 * whole pool, so the entries that do not match are simply stepped over. That
 * way a difficulty tag never shortens the cycle - a band with 281 curated
 * words still serves 281 distinct words even when only the "medium" ones are
 * wanted.
 */
function drawFromBag(key, entries, match = null) {
  if (!entries || entries.length === 0) return null;
  let bag = bags.get(key);
  if (!bag) {
    bag = { items: [], at: 0 };
    bags.set(key, bag);
  }
  // Refill the bag if it's empty or if the entries have changed (detected by length mismatch)
  if (bag.at >= bag.items.length || bag.items.length !== entries.length) {
    bag.items = entries.slice();
    for (let i = bag.items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag.items[i], bag.items[j]] = [bag.items[j], bag.items[i]];
    }
    bag.at = 0;
  }
  if (!match) return bag.items[bag.at++];

  const start = bag.at;
  for (let step = 0; step < bag.items.length; step++) {
    const idx = (start + step) % bag.items.length;
    if (match(bag.items[idx])) {
      bag.at = idx + 1;
      return bag.items[idx];
    }
  }
  return null;
}

/** Normalise a pool entry into the { word, cat, difficulty } shape callers expect. */
function toTarget(entry) {
  if (!entry) return null;
  return {
    word: entry.word,
    cat: entry.cat || 'Common',
    difficulty: entry.difficulty,
  };
}

/**
 * Pick a puzzle word.
 *
 * Two pools feed this:
 *
 *   curated  hand-picked words that carry a real category, so the badge on
 *            stream is a usable hint
 *   general  the ecosystem's curated target list - thousands of words, so a
 *            round never repeats and the difficulty tiers always have stock
 *
 * The general pool leads most of the time because variety matters over a long
 * stream, but the curated pool is preferred often enough that the category
 * badge keeps meaning something. A band that holds too few curated words to
 * avoid repeats falls back to the general pool entirely.
 *
 * The length band is what makes a board hard, so it is a hard filter. Only
 * when no pool has an in-band word at all does the band relax.
 */
function randomTarget({ difficulty = null, category = null, minLength = 0, maxLength = Infinity } = {}) {
  ensureLoaded();
  const level = String(difficulty || '').toLowerCase();
  const tag = LEVEL_TO_TAG[level] || null;
  const inBand = (word) => word.length >= minLength && word.length <= maxLength;
  const curatedPool = loadCurated();
  const generalPool = loadGeneralPool();
  const wantCategory = category ? String(category).toLowerCase() : null;
  const band = `${minLength}-${maxLength}`;

  const curatedInBand = curatedPool.filter((e) => inBand(e.word));
  const generalInBand = generalPool.filter((e) => inBand(e.word));

  // An explicitly requested category wins outright and is never traded away.
  if (wantCategory) {
    const entries = curatedInBand.filter((e) => e.cat.toLowerCase() === wantCategory);
    const picked = drawFromBag(`curated|${wantCategory}|${band}`, entries);
    if (picked) return toTarget(picked);
  }

  const preferCurated = curatedInBand.length >= MIN_CURATED_STOCK && Math.random() < CURATED_PREFERENCE;

  if (preferCurated) {
    const picked = drawFromBag(`curated|${band}`, curatedInBand, tag ? (e) => e.difficulty === tag : null)
      || drawFromBag(`curated|${band}`, curatedInBand);
    if (picked) return toTarget(picked);
  }

  const picked = drawFromBag(`general|${band}`, generalInBand, tag ? (e) => e.difficulty === tag : null)
    || drawFromBag(`general|${band}`, generalInBand);
  if (picked) return toTarget(picked);

  // Nothing inside the band anywhere - keep the tag, drop the band.
  const relaxedCurated = tag ? curatedPool.filter((e) => e.difficulty === tag) : curatedPool;
  const relaxed = relaxedCurated.length ? relaxedCurated : (tag ? generalPool.filter((e) => e.difficulty === tag) : generalPool);
  const fallback = relaxed.length ? relaxed[Math.floor(Math.random() * relaxed.length)] : null;
  return toTarget(fallback);
}

/**
 * Pool sizes for the picker, grouped by difficulty tag and length band.
 * Exposed so tooling and the settings page can show what a round can actually
 * draw from.
 */
function poolSizes({ minLength = 0, maxLength = Infinity } = {}) {
  ensureLoaded();
  const inBand = (word) => word.length >= minLength && word.length <= maxLength;
  const out = { curated: {}, general: {} };
  for (const entry of loadCurated()) {
    if (!inBand(entry.word)) continue;
    out.curated[entry.difficulty] = (out.curated[entry.difficulty] || 0) + 1;
  }
  for (const entry of loadGeneralPool()) {
    if (!inBand(entry.word)) continue;
    out.general[entry.difficulty] = (out.general[entry.difficulty] || 0) + 1;
  }
  return out;
}

/**
 * Clear all draw bags, forcing a fresh shuffle on the next word selection.
 * This is useful when the server restarts or when you want to reset the
 * word selection cycle to avoid repeating the same words.
 */
function clearBags() {
  bags.clear();
}

/**
 * Build a bee-style round: 7 distinct letters, one designated center letter,
 * and every dictionary word that uses only those letters and includes the
 * center. Returns null when the letterset has too few answers to be fun.
 */
function buildBeeRound({ minAnswers = 12, preferredLengths = null } = {}) {
  ensureLoaded();
  const lengths = (preferredLengths || availableLengths(200))
    .filter((len) => len >= 4 && len <= 9);
  if (lengths.length === 0) return null;

  for (let attempt = 0; attempt < 400; attempt++) {
    // Seed from a mid-length word so the letter set is productive.
    const seedLen = lengths[Math.floor(Math.random() * lengths.length)];
    const seed = randomWord(seedLen);
    if (!seed) continue;
    // A blocked word must not shape the puzzle either.
    if (policy.isBlockedWord(seed)) continue;

    const seedLetters = Array.from(new Set(seed.split('')));
    if (seedLetters.length > 7) continue;

    let letters = seedLetters.slice();
    // Top up to exactly 7 letters from the length-4 pool, which has good spread.
    while (letters.length < 7) {
      const filler = randomWord(4);
      if (!filler) break;
      if (policy.isBlockedWord(filler)) continue;
      for (const ch of filler) {
        if (!letters.includes(ch)) letters.push(ch);
        if (letters.length === 7) break;
      }
    }
    if (letters.length !== 7) continue;

    const center = seedLetters[Math.floor(Math.random() * seedLetters.length)];
    const answers = wordsFromLetters(new Set(letters), { requiredLetter: center, minLength: 4 });
    if (answers.length < minAnswers) continue;

    const rarity = new Map();
    for (const word of answers) rarity.set(word, tierFor(word));
    const pangrams = answers.filter((w) => new Set(w.split('')).size === 7);

    return {
      puzzle: { letters, centerLetter: center, pangrams },
      answers,
      // Completion goal: every word, matching Word Tycoon's "find them all" bee.
      required: answers,
      rarity,
    };
  }
  return null;
}

/**
 * Build a seeded daily bee round based on date and difficulty.
 * This ensures every player gets the same puzzle on the same day for each difficulty.
 */
function buildSeededBeeRound({ dailyDate, difficulty = 'normal', minAnswers = 12 } = {}) {
  ensureLoaded();
  if (!dailyDate) return buildBeeRound({ minAnswers });

  // Create a seeded random number generator based on date and difficulty
  const seed = stringToSeed(`${dailyDate}-${difficulty}`);
  const rng = seededRandom(seed);

  const lengths = availableLengths(200).filter((len) => len >= 4 && len <= 9);
  if (lengths.length === 0) return null;

  // Adjust minAnswers based on difficulty
  const difficultyMinAnswers = {
    easy: 15,
    normal: 20,
    medium: 25,
    hard: 30
  };
  const actualMinAnswers = difficultyMinAnswers[difficulty] || minAnswers;

  for (let attempt = 0; attempt < 400; attempt++) {
    // Use seeded random to pick a seed word
    const seedLen = lengths[Math.floor(rng() * lengths.length)];
    const seedPool = Array.from(wordsOfLength(seedLen));
    if (seedPool.length === 0) continue;
    const seed = seedPool[Math.floor(rng() * seedPool.length)];
    if (!seed) continue;
    if (policy.isBlockedWord(seed)) continue;

    const seedLetters = Array.from(new Set(seed.split('')));
    if (seedLetters.length > 7) continue;

    let letters = seedLetters.slice();
    // Top up to exactly 7 letters using seeded random
    while (letters.length < 7) {
      const fillerPool = Array.from(wordsOfLength(4));
      if (fillerPool.length === 0) break;
      const filler = fillerPool[Math.floor(rng() * fillerPool.length)];
      if (!filler) break;
      if (policy.isBlockedWord(filler)) continue;
      for (const ch of filler) {
        if (!letters.includes(ch)) letters.push(ch);
        if (letters.length === 7) break;
      }
    }
    if (letters.length !== 7) continue;

    const center = seedLetters[Math.floor(rng() * seedLetters.length)];
    const answers = wordsFromLetters(new Set(letters), { requiredLetter: center, minLength: 4 });
    if (answers.length < actualMinAnswers) continue;

    const rarity = new Map();
    for (const word of answers) rarity.set(word, tierFor(word));
    const pangrams = answers.filter((w) => new Set(w.split('')).size === 7);

    return {
      puzzle: { letters, centerLetter: center, pangrams },
      answers,
      required: answers,
      rarity,
    };
  }
  return null;
}

// ── 4x4 grid rounds (solo Spelling Bee) ────────────────────────────────────
//
// The solo Spelling Bee page plays Boggle-style: 16 letters in a 4x4 grid,
// words traced along adjacent cells without reusing a letter. That is a
// different puzzle shape from the hive-style SpellingBeeGame used for online
// rounds, so the solo daily endpoint builds its puzzle here instead.

/** 8-direction adjacency for the 4x4 grid, as neighbour cell indexes. */
const GRID_NEIGHBORS = (() => {
  const out = [];
  for (let i = 0; i < 16; i++) {
    const r = (i / 4) | 0;
    const c = i % 4;
    const n = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = r + dr;
        const nc = c + dc;
        if (nr >= 0 && nr < 4 && nc >= 0 && nc < 4) n.push(nr * 4 + nc);
      }
    }
    out.push(n);
  }
  return out;
})();

/** Letter pools for grid generation, weighted like the page's own grids. */
const GRID_VOWELS = 'AAEEEIIIOOOUU';
const GRID_CONSONANTS = 'NNRRSSTTLLCCDDMMGGHHBBKKPPFJ';

/** Page difficulty -> minimum word length (public/spelling-bee.html). */
const GRID_MIN_LENGTH = { easy: 3, normal: 4, medium: 4, hard: 5 };

/** Fewest answers a generated grid may have before it is reshuffled. */
const GRID_MIN_ANSWERS = { easy: 25, normal: 35, medium: 45, hard: 20 };

/** Daily grid puzzles are deterministic, so cache them per date+difficulty. */
const gridRounds = new Map();

/** Can `word` be traced on `grid` (16 lowercase letters) without reuse? */
function wordOnGrid(word, grid) {
  const starts = [];
  for (let i = 0; i < 16; i++) if (grid[i] === word[0]) starts.push(i);
  if (!starts.length) return false;
  const visited = new Uint8Array(16);
  const letters = word.split('');
  function dfs(cell, pos) {
    if (pos === letters.length) return true;
    visited[cell] = 1;
    for (const nb of GRID_NEIGHBORS[cell]) {
      if (!visited[nb] && grid[nb] === letters[pos] && dfs(nb, pos + 1)) {
        visited[cell] = 0;
        return true;
      }
    }
    visited[cell] = 0;
    return false;
  }
  for (const start of starts) {
    if (dfs(start, 1)) return true;
  }
  return false;
}

/** Every dictionary word traceable on the grid, lowercase, policy-filtered. */
function gridAnswers(grid, minLength, maxLength = 16) {
  ensureLoaded();
  const counts = {};
  for (const ch of grid) counts[ch] = (counts[ch] || 0) + 1;
  const out = [];
  for (let len = minLength; len <= maxLength; len++) {
    const candidates = wordsByLength.get(len);
    if (!candidates || candidates.size === 0) continue;
    for (const word of candidates) {
      const needed = {};
      let feasible = true;
      for (const ch of word) {
        needed[ch] = (needed[ch] || 0) + 1;
        if (needed[ch] > (counts[ch] || 0)) { feasible = false; break; }
      }
      if (!feasible) continue;
      if (wordOnGrid(word, grid)) out.push(word);
    }
  }
  return policy.filterWordsForGame(out, 'spellingbee', 'board_word');
}

/**
 * Build the solo daily grid puzzle: { letters (16 uppercase), answers }.
 *
 * Seeded by `${dailyDate}-${difficulty}` so every player gets the same board.
 * A grid with too few answers is reshuffled (still seeded) rather than served.
 */
function buildGridRound({ dailyDate, difficulty = 'normal' } = {}) {
  ensureLoaded();
  const key = `${dailyDate || 'random'}|${difficulty}`;
  if (gridRounds.has(key)) return gridRounds.get(key);

  const level = String(difficulty || 'normal').toLowerCase();
  const minLength = GRID_MIN_LENGTH[level] || GRID_MIN_LENGTH.normal;
  const minAnswers = GRID_MIN_ANSWERS[level] || GRID_MIN_ANSWERS.normal;
  const rng = seededRandom(stringToSeed(`grid-${key}`));

  let result = null;
  for (let attempt = 0; attempt < 20 && !result; attempt++) {
    const vowelCount = 5 + Math.floor(rng() * 2);
    const letters = [];
    for (let i = 0; i < vowelCount; i++) letters.push(GRID_VOWELS[Math.floor(rng() * GRID_VOWELS.length)]);
    for (let i = vowelCount; i < 16; i++) letters.push(GRID_CONSONANTS[Math.floor(rng() * GRID_CONSONANTS.length)]);
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    const grid = letters.map((l) => l.toLowerCase());
    const answers = gridAnswers(grid, minLength);
    if (answers.length >= minAnswers) {
      result = { letters: letters.map((l) => l.toUpperCase()), answers };
    }
  }

  // Last resort: serve the best grid seen even if it is thin.
  if (!result) {
    const letters = [];
    for (let i = 0; i < 16; i++) letters.push(GRID_VOWELS[i % GRID_VOWELS.length] || 'A');
    const grid = letters.map((l) => l.toLowerCase());
    result = { letters: letters.map((l) => l.toUpperCase()), answers: gridAnswers(grid, minLength) };
  }

  gridRounds.set(key, result);
  return result;
}

/**
 * Convert a string to a numeric seed for the seeded random generator.
 */
function stringToSeed(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

/**
 * Seeded random number generator (simple LCG).
 * Returns a function that generates random numbers between 0 and 1.
 */
function seededRandom(seed) {
  const m = 0x80000000;
  const a = 1103515245;
  const c = 12345;
  let state = seed;

  return function() {
    state = (a * state + c) % m;
    return state / (m - 1);
  };
}

/**
 * Build a seeded daily word puzzle for Hangman, Speed Scramble, etc.
 * This ensures every player gets the same word on the same day for each difficulty.
 */
function buildSeededWordRound({ dailyDate, difficulty = 'normal', category = null, minLength = 4, maxLength = 20 } = {}) {
  ensureLoaded();
  if (!dailyDate) return null;

  // Create a seeded random number generator based on date and difficulty
  const seed = stringToSeed(`${dailyDate}-${difficulty}-${category || 'all'}`);
  const rng = seededRandom(seed);

  // Get word pool based on difficulty and length band
  const level = LEVEL_TO_TAG[difficulty] || 'medium';
  const curatedPool = loadCurated().filter(e => {
    const matchesDifficulty = e.difficulty === level;
    const matchesLength = e.word.length >= minLength && e.word.length <= maxLength;
    const matchesCategory = !category || e.cat.toLowerCase() === String(category).toLowerCase();
    return matchesDifficulty && matchesLength && matchesCategory;
  });

  // If curated pool is empty, fall back to general pool
  const pool = curatedPool.length > 0 ? curatedPool : loadGeneralPool().filter(e => {
    const matchesDifficulty = e.difficulty === level;
    const matchesLength = e.word.length >= minLength && e.word.length <= maxLength;
    return matchesDifficulty && matchesLength;
  });

  if (pool.length === 0) return null;

  // Use seeded random to pick a word
  const chosen = pool[Math.floor(rng() * pool.length)];

  if (!chosen || policy.isBlockedWord(chosen.word)) {
    // Try a few more times to find a non-blocked word
    for (let i = 0; i < 10; i++) {
      const next = pool[Math.floor(rng() * pool.length)];
      if (next && !policy.isBlockedWord(next.word)) {
        return next;
      }
    }
    return null;
  }

  return chosen;
}

module.exports = {
  load,
  ensureLoaded,
  sizes,
  availableLengths,
  has,
  wordsOfLength,
  randomWord,
  wordsFromLetters,
  tierFor,
  buildBeeRound,
  buildSeededBeeRound,
  buildSeededWordRound,
  buildGridRound,
  curated,
  curatedFor,
  curatedCategories,
  randomCuratedWord,
  randomTarget,
  poolSizes,
  general,
  clearBags,
  get total() { return allWords.size; },
};
