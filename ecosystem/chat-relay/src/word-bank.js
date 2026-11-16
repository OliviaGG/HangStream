/**
 * Shared Word Bank
 * Provides curated target words and a full dictionary for all word games.
 * Data sourced from Betweenly's hand-curated lists.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { filterWordsForGame } = require('./game-word-policy');
const { isExcludedWord, sanitizeWordList } = require('./word-bank-exclusions');

const DATA_DIR = path.join(__dirname, '..', 'data', 'word-bank');

let targets = {};   // { "3": ["ale","ant",...], "5": ["abbey","abyss",...], ... }
let dictionary = {}; // { "3": ["aah","aal",...], "5": ["aahed","aalii",...], ... }
let targetSet = new Set();     // flat set of all target words
let dictionarySet = new Set(); // flat set of all dictionary words
let frequency = {};            // { "the": 7.77, "teeth": 4.52, ... } — Zipf scores
let commonSet = new Set();     // words from frequency data above Zipf threshold
let searchleEasyTargetSet = new Set(); // curated easy Searchle targets

// Minimum Zipf score for a word to be "common" (required for puzzle completion).
// Words below this are still in frequency data but classified as "rare" (bonus).
// Zipf scale: 7-8 ultra-common, 5-6 common, 4-5 recognizable, 3-4 uncommon, <3 obscure
const COMMON_ZIPF_MIN = parseFloat(process.env.COMMON_ZIPF_MIN) || 4.0;

// SUBTLEX-US: subtitle/speech-based frequency dataset used to cross-validate wordfreq.
// wordfreq overcounts written/web-corpus words (e.g. "economic", "hisser") — SUBTLEX
// catches these since they rarely appear in spoken dialogue. We use:
//   effective_zipf = min(wordfreq_zipf, subtlex_zipf + SUBTLEX_BUFFER)
// The +0.2 buffer prevents near-threshold genuine words (areas 3.96, groups 3.98) from
// being demoted due to SUBTLEX sampling noise.
const SUBTLEX_BUFFER = 0.2;
let subtlexMap = null; // lazily built: word -> Zipf score

// ─── Word Length Bonus (exponential curve) ──────────────────────────
// 3-letter words are exempt (special category). 4+ letters earn increasing bonus.
const WORD_LENGTH_BONUS = { 4: 75, 5: 150, 6: 300, 7: 500, 8: 800, 9: 1200, 10: 1750, 11: 2500 };
const WORD_LENGTH_BONUS_MAX = 3500; // 12+ letters

function getWordLengthBonus(word) {
  const len = word.length;
  if (len <= 3) return 0;
  if (len >= 12) return WORD_LENGTH_BONUS_MAX;
  return WORD_LENGTH_BONUS[len] || 0;
}

// ─── Letter Rarity (English frequency-based) ───────────────────────
// Standard English letter frequencies from corpus analysis (%).
// 8-tier system: Trivial > Common > Uncommon > Rare > Epic > Legendary > Mythic > Unique
const LETTER_FREQUENCIES = {
  E: 12.70, T: 9.06, A: 8.17, O: 7.51, I: 6.97,
  N: 6.75,  S: 6.33, H: 6.09, R: 5.99, D: 4.25,
  L: 4.03,  C: 2.78, U: 2.76, M: 2.41, W: 2.36,
  F: 2.23,  G: 2.02, Y: 1.97, P: 1.93, B: 1.29,
  V: 0.98,  K: 0.77, J: 0.15, X: 0.15, Q: 0.10,
  Z: 0.07
};

// Tiers ordered highest-frequency-first; first match wins.
// Bonuses rebased 2026-08-07: common was 0, which meant 64.6% of all tiles on a
// board scored nothing. Every tier now scores. MUST stay in step with
// LETTER_TIER_VALUE in RecTangled/src/game.js and Sproutle/src/game.js — this
// copy serves the /api/word-bank/letter-rarity endpoints and the portal's
// Library → Scoring page, so drift here shows players the wrong numbers.
const LETTER_RARITY_TIERS_LIST = [
  { name: 'common',    minFreq: 5.5,   bonus: 25 },
  { name: 'uncommon',  minFreq: 3.5,   bonus: 40 },
  { name: 'rare',      minFreq: 2.2,   bonus: 60 },
  { name: 'epic',      minFreq: 1.5,   bonus: 90 },
  { name: 'legendary', minFreq: 0.7,   bonus: 140 },
  { name: 'mythic',    minFreq: 0.12,  bonus: 220 },
  { name: 'unique',    minFreq: 0,     bonus: 350 }
];

// Build keyed lookup for API responses
const LETTER_RARITY_TIERS = {};
for (const t of LETTER_RARITY_TIERS_LIST) {
  LETTER_RARITY_TIERS[t.name.toUpperCase()] = t;
}

// Pre-computed letter -> { letter, frequency, tier, bonus } lookup
const LETTER_RARITY = {};
for (const [letter, freq] of Object.entries(LETTER_FREQUENCIES)) {
  const tier = LETTER_RARITY_TIERS_LIST.find(t => freq >= t.minFreq);
  LETTER_RARITY[letter.toLowerCase()] = {
    letter: letter.toLowerCase(),
    frequency: freq,
    tier: tier.name,
    bonus: tier.bonus
  };
}

function buildSubtlexMap() {
  try {
    const data = require('subtlex-word-frequencies');
    const total = data.reduce((sum, e) => sum + e.count, 0);
    subtlexMap = new Map(data.map(e => [e.word.toLowerCase(), Math.log10(e.count / total * 1e6) + 3]));
    console.log(`[Word Bank] Loaded ${subtlexMap.size} SUBTLEX-US frequency words`);
  } catch (e) {
    console.warn('[Word Bank] subtlex-word-frequencies not available — skipping cross-validation');
    subtlexMap = new Map();
  }
}

function getEffectiveZipf(word, wordfreqZipf) {
  if (!subtlexMap) buildSubtlexMap();
  const stZipf = subtlexMap.get(word.toLowerCase());
  if (stZipf === undefined) return wordfreqZipf; // not in SUBTLEX — trust wordfreq
  return Math.min(wordfreqZipf, stZipf + SUBTLEX_BUFFER);
}

function load() {
  try {
    const targetsPath = path.join(DATA_DIR, 'targets.json');
    const dictPath = path.join(DATA_DIR, 'dictionary.json');
    const searchleEasyPath = path.join(DATA_DIR, 'searchle-easy-targets.json');

    if (fs.existsSync(targetsPath)) {
      const raw = JSON.parse(fs.readFileSync(targetsPath, 'utf-8'));
      // Normalize keys to strings, values to lowercase arrays
      targets = {};
      for (const [len, words] of Object.entries(raw)) {
        targets[String(len)] = sanitizeWordList(words);
      }
    }

    if (fs.existsSync(dictPath)) {
      const raw = JSON.parse(fs.readFileSync(dictPath, 'utf-8'));
      dictionary = {};
      for (const [len, words] of Object.entries(raw)) {
        dictionary[String(len)] = sanitizeWordList(words);
      }
    }

    // Build flat sets for fast lookup
    targetSet = new Set();
    for (const words of Object.values(targets)) {
      for (const w of words) targetSet.add(w);
    }

    dictionarySet = new Set();
    for (const words of Object.values(dictionary)) {
      for (const w of words) dictionarySet.add(w);
    }

    // Ensure all targets are also in dictionary set
    for (const w of targetSet) dictionarySet.add(w);

    searchleEasyTargetSet = new Set();
    if (fs.existsSync(searchleEasyPath)) {
      const easyWords = sanitizeWordList(JSON.parse(fs.readFileSync(searchleEasyPath, 'utf-8')));
      for (const w of easyWords) {
        if (targetSet.has(w)) searchleEasyTargetSet.add(w);
      }
      console.log(`[Word Bank] Loaded ${searchleEasyTargetSet.size} Searchle easy daily targets`);
    }

    const targetCount = targetSet.size;
    const dictCount = dictionarySet.size;
    const lengths = Object.keys(targets).sort((a, b) => a - b);
    console.log(`[Word Bank] Loaded ${targetCount} targets, ${dictCount} dictionary words (lengths: ${lengths.join(', ')})`);

    // Load word frequency data (for common/rare classification)
    const freqPath = path.join(DATA_DIR, 'frequency.json');
    if (fs.existsSync(freqPath)) {
      const rawFrequency = JSON.parse(fs.readFileSync(freqPath, 'utf-8'));
      frequency = {};
      for (const [w, zipf] of Object.entries(rawFrequency)) {
        const normalized = w.toLowerCase();
        if (!isExcludedWord(normalized)) frequency[normalized] = zipf;
      }
      buildSubtlexMap(); // load SUBTLEX cross-validation data
      commonSet = new Set();
      for (const [w, zipf] of Object.entries(frequency)) {
        if (getEffectiveZipf(w, zipf) >= COMMON_ZIPF_MIN) commonSet.add(w.toLowerCase());
      }
      console.log(`[Word Bank] Loaded ${Object.keys(frequency).length} frequency words, ${commonSet.size} common (Zipf >= ${COMMON_ZIPF_MIN}, wordfreq+SUBTLEX)`);
    } else {
      console.log('[Word Bank] No frequency.json found — common/rare will fall back to targets');
    }
  } catch (err) {
    console.error('[Word Bank] Error loading word data:', err.message);
  }
}

/**
 * Get curated target words.
 * @param {number|string} [length] - Optional word length filter
 * @returns {object|string[]} All targets by length, or array for specific length
 */
function getTargets(length) {
  if (length !== undefined) {
    return targets[String(length)] || [];
  }
  return targets;
}

/**
 * Get dictionary words (valid guesses).
 * @param {number|string} [length] - Optional word length filter
 * @returns {object|string[]} All dictionary by length, or array for specific length
 */
function getDictionary(length) {
  if (length !== undefined) {
    return dictionary[String(length)] || [];
  }
  return dictionary;
}

/**
 * Check if a word is in the dictionary (valid guess).
 * @param {string} word
 * @returns {boolean}
 */
function isValidWord(word) {
  return dictionarySet.has(word.toLowerCase());
}

/**
 * Check if a word is a curated target.
 * @param {string} word
 * @returns {boolean}
 */
function isValidTarget(word) {
  return targetSet.has(word.toLowerCase());
}

/**
 * Pick a random target word, optionally excluding already-played words.
 * @param {number} length - Word length
 * @param {string[]} [exclude=[]] - Words to exclude (already played)
 * @returns {string|null} Random target word, or null if pool exhausted
 */
function getRandomTarget(length, exclude = []) {
  const pool = targets[String(length)] || [];
  if (pool.length === 0) return null;

  const excludeSet = new Set(exclude.map(w => w.toLowerCase()));
  const available = pool.filter(w => !excludeSet.has(w));

  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)];
}

/**
 * Get available word lengths that have targets.
 * @returns {number[]} Array of available lengths
 */
function getAvailableLengths() {
  return Object.keys(targets)
    .map(Number)
    .filter(n => targets[String(n)] && targets[String(n)].length > 0)
    .sort((a, b) => a - b);
}

/**
 * Get stats about the word bank.
 * @returns {object} Stats per length + totals
 */
function getStats() {
  const stats = {};
  const lengths = getAvailableLengths();
  for (const len of lengths) {
    stats[len] = {
      targets: (targets[String(len)] || []).length,
      dictionary: (dictionary[String(len)] || []).length
    };
  }
  return {
    lengths,
    byLength: stats,
    totalTargets: targetSet.size,
    totalDictionary: dictionarySet.size
  };
}

// ─── Word Frequency / Common Words ──────────────────────────────────

/**
 * Check if a word is "common" based on frequency data.
 * Falls back to isValidTarget() if no frequency data loaded.
 * @param {string} word
 * @returns {boolean}
 */
function isCommonWord(word) {
  if (commonSet.size === 0) return isValidTarget(word);
  return commonSet.has(word.toLowerCase());
}

/**
 * Get the set of common words (frequency-based).
 * Falls back to targetSet if no frequency data loaded.
 * @returns {Set<string>}
 */
function getCommonSet() {
  if (commonSet.size === 0) return targetSet;
  return commonSet;
}

/**
 * Get the Zipf frequency score for a word.
 * @param {string} word
 * @returns {number|null} Zipf score (7-8 = ultra common, 3-4 = uncommon), or null if not in data
 */
function getFrequency(word) {
  const w = word.toLowerCase();
  const z = frequency[w];
  return z !== undefined ? getEffectiveZipf(w, z) : null;
}

// RecTangled classifies its common/rare/hidden scoring tiers from the raw
// Word Bank frequency feed, rather than the cross-validated common-word set.
function getRawFrequency(word) {
  const z = frequency[String(word).toLowerCase()];
  return z !== undefined ? z : null;
}

// ─── Plural Detection ───────────────────────────────────────────────

/**
 * Check if a word is likely a plural form.
 * Uses heuristics: if it ends in -s/-es/-ies and the singular form exists in dictionary.
 * @param {string} word
 * @returns {{ isPlural: boolean, singular?: string }}
 */
function detectPlural(word) {
  word = word.toLowerCase();

  // Skip short words — 3-letter words ending in 's' are rarely plurals (bus, gas, his)
  if (word.length <= 3) return { isPlural: false };

  // -ies → -y (berries → berry, candies → candy)
  if (word.endsWith('ies') && word.length > 4) {
    const singular = word.slice(0, -3) + 'y';
    if (dictionarySet.has(singular)) return { isPlural: true, singular };
  }

  // -ses → -s (buses → bus) or -se (cases → case)
  if (word.endsWith('ses') && word.length > 4) {
    const s1 = word.slice(0, -2); // buses → bus
    if (dictionarySet.has(s1)) return { isPlural: true, singular: s1 };
    const s2 = word.slice(0, -1); // cases → case
    if (dictionarySet.has(s2)) return { isPlural: true, singular: s2 };
  }

  // -zes → -z (fizzes → fizz) or -ze (blazes → blaze)
  if (word.endsWith('zes') && word.length > 4) {
    const s1 = word.slice(0, -2); // fizzes → fizz
    if (dictionarySet.has(s1)) return { isPlural: true, singular: s1 };
    const s2 = word.slice(0, -1); // blazes → blaze
    if (dictionarySet.has(s2)) return { isPlural: true, singular: s2 };
  }

  // -xes → -x (boxes → box)
  if (word.endsWith('xes') && word.length > 4) {
    const singular = word.slice(0, -2);
    if (dictionarySet.has(singular)) return { isPlural: true, singular };
  }

  // -ches → -ch (watches → watch)
  if (word.endsWith('ches') && word.length > 5) {
    const singular = word.slice(0, -2);
    if (dictionarySet.has(singular)) return { isPlural: true, singular };
  }

  // -shes → -sh (dishes → dish)
  if (word.endsWith('shes') && word.length > 5) {
    const singular = word.slice(0, -2);
    if (dictionarySet.has(singular)) return { isPlural: true, singular };
  }

  // -ves → -f (wolves → wolf, knives → knife)
  if (word.endsWith('ves') && word.length > 4) {
    const s1 = word.slice(0, -3) + 'f';
    if (dictionarySet.has(s1)) return { isPlural: true, singular: s1 };
    const s2 = word.slice(0, -3) + 'fe';
    if (dictionarySet.has(s2)) return { isPlural: true, singular: s2 };
  }

  // General -es → remove -es (heroes → hero)
  if (word.endsWith('es') && word.length > 4) {
    const singular = word.slice(0, -2);
    if (dictionarySet.has(singular)) return { isPlural: true, singular };
    // Also check -e form (plates → plate)
    const s2 = word.slice(0, -1);
    if (dictionarySet.has(s2)) return { isPlural: true, singular: s2 };
  }

  // General -s (not -ss, -us, -is) → remove -s
  if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    const singular = word.slice(0, -1);
    if (dictionarySet.has(singular)) return { isPlural: true, singular };
  }

  return { isPlural: false };
}

// ─── Letter Rarity ─────────────────────────────────────────────────

/**
 * Get rarity data for a single letter.
 * @param {string} letter - Single letter (a-z)
 * @returns {{ letter, frequency, tier, bonus } | null}
 */
function getLetterRarity(letter) {
  return LETTER_RARITY[letter.toLowerCase()] || null;
}

/**
 * Calculate letter-rarity bonus score for a word.
 * Sums the per-letter bonus for each letter in the word.
 * Duplicate letters each contribute (e.g. "jazz" gets J + A + Z + Z).
 * @param {string} word
 * @returns {{ score: number, breakdown: Array, tierCounts: Object }}
 */
function getLetterRarityScore(word) {
  const w = word.toLowerCase();
  let score = 0;
  const breakdown = [];
  const tierCounts = {};
  for (const t of LETTER_RARITY_TIERS_LIST) tierCounts[t.name] = 0;

  for (const ch of w) {
    const data = LETTER_RARITY[ch];
    if (!data) continue;
    score += data.bonus;
    breakdown.push({ letter: ch, tier: data.tier, bonus: data.bonus });
    tierCounts[data.tier]++;
  }

  return { score, breakdown, tierCounts };
}

/**
 * Get the full letter rarity table (all 26 letters).
 * @returns {Object} Map of letter -> { letter, frequency, tier, bonus }
 */
function getLetterRarityData() {
  return { ...LETTER_RARITY };
}

/**
 * Get candidate words from dictionary that aren't already targets.
 * Filters out likely plurals by default.
 * @param {number} length - Word length
 * @param {object} [opts] - Options
 * @param {boolean} [opts.filterPlurals=true] - Filter out plural forms
 * @param {number} [opts.page=0] - Page number
 * @param {number} [opts.pageSize=100] - Words per page
 * @param {string} [opts.search] - Filter by prefix/substring
 * @returns {object} { words, total, page, pageSize, totalPages }
 */
function getCandidates(length, opts = {}) {
  const { filterPlurals = true, page = 0, pageSize = 100, search } = opts;
  const dictWords = dictionary[String(length)] || [];
  const targetWords = new Set(targets[String(length)] || []);

  let candidates = dictWords.filter(w => !targetWords.has(w));

  // Apply search filter
  if (search) {
    const s = search.toLowerCase();
    candidates = candidates.filter(w => w.includes(s));
  }

  // Apply plural filter
  if (filterPlurals) {
    candidates = candidates.filter(w => !detectPlural(w).isPlural);
  }

  // Sort alphabetically
  candidates.sort();

  const total = candidates.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = page * pageSize;
  const words = candidates.slice(start, start + pageSize);

  return { words, total, page, pageSize, totalPages };
}

/**
 * Add words to the target list and save to disk.
 * @param {string[]} words - Words to add
 * @returns {object} { added, skipped, errors }
 */
function addTargets(words) {
  const added = [];
  const skipped = [];
  const errors = [];

  for (const raw of words) {
    const w = raw.toLowerCase().trim();
    if (!w) continue;

    if (isExcludedWord(w)) {
      errors.push({ word: w, reason: 'excluded from word bank' });
      continue;
    }

    // Must be in dictionary
    if (!dictionarySet.has(w)) {
      errors.push({ word: w, reason: 'not in dictionary' });
      continue;
    }

    // Already a target
    if (targetSet.has(w)) {
      skipped.push(w);
      continue;
    }

    // Add to targets
    const len = String(w.length);
    if (!targets[len]) targets[len] = [];
    targets[len].push(w);
    targets[len].sort();
    targetSet.add(w);
    added.push(w);
  }

  if (added.length > 0) {
    saveTargets();
  }

  return { added, skipped, errors };
}

/**
 * Remove words from the target list and save to disk.
 * @param {string[]} words - Words to remove
 * @returns {object} { removed, notFound }
 */
function removeTargets(words) {
  const removed = [];
  const notFound = [];

  for (const raw of words) {
    const w = raw.toLowerCase().trim();
    if (!w) continue;

    if (!targetSet.has(w)) {
      notFound.push(w);
      continue;
    }

    const len = String(w.length);
    targets[len] = (targets[len] || []).filter(t => t !== w);
    targetSet.delete(w);
    removed.push(w);
  }

  if (removed.length > 0) {
    saveTargets();
  }

  return { removed, notFound };
}

/**
 * Save current targets to disk.
 */
function saveTargets() {
  try {
    const targetsPath = path.join(DATA_DIR, 'targets.json');
    // Ensure directory exists
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tmpPath = targetsPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(targets, null, 2));
    fs.renameSync(tmpPath, targetsPath);
    console.log(`[Word Bank] Saved ${targetSet.size} targets to disk`);
  } catch (err) {
    console.error('[Word Bank] Error saving targets:', err.message);
    throw err;
  }
}

// ─── Daily Word (Deterministic per Game per Day) ─────────────────────

/**
 * Get the Monday of the Edmonton civil week.
 * @param {Date|string} [date] - Optional date, defaults to now
 * @returns {string} YYYY-MM-DD of the Monday
 */
function getWeekStart(date) {
  // Date-only inputs are civil dates; instants first resolve in Edmonton.
  const today = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? date : _dailyDateFormatter.format(date ? new Date(date) : new Date());
  const d = new Date(today + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Edmonton date formatter — aligns daily word generation with Word Tycoon's daily tracker
const DAILY_TIMEZONE = process.env.DAILY_TIMEZONE || 'America/Edmonton';
const _dailyDateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: DAILY_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
function getEdmontonDate() {
  return _dailyDateFormatter.format(new Date()); // YYYY-MM-DD in Edmonton time
}

/**
 * Get the daily word for a game. Deterministic: same game + same day = same word.
 * Uses SHA-256 hash of gameId + date to pick from the sorted target list.
 * Uses Edmonton timezone to align with Word Tycoon's daily challenge tracker.
 * @param {string} gameId - Game identifier (e.g., 'word500', 'wordle')
 * @param {number} [length=5] - Word length
 * @param {number} [uniqueLetters=0] - If > 0, require exactly this many unique letters (for Spelling Bee)
 * @returns {object|null} { word, date, length, gameId } or null if no targets
 */
const dailyWordCache = {};
let _dailyCacheDate = null;
function getDailyTargetPool(gameId, length) {
  const basePool = filterWordsForGame(targets[String(length)] || [], gameId, 'target');
  if (gameId === 'searchle' && Number(length) === 5 && searchleEasyTargetSet.size > 0) {
    const easyPool = basePool.filter(w => searchleEasyTargetSet.has(String(w).toLowerCase()));
    if (easyPool.length > 0) return easyPool;
    console.warn(`[Word Bank] Searchle easy daily pool had 0 overlap with ${basePool.length} length-${length} targets; using base pool`);
  }
  return basePool;
}

function getDailyWord(gameId, length = 5, uniqueLetters = 0) {
  const today = getEdmontonDate(); // Edmonton timezone — matches Word Tycoon daily tracker
  // Clear stale cache when date rolls over
  if (_dailyCacheDate && _dailyCacheDate !== today) {
    for (const key of Object.keys(dailyWordCache)) delete dailyWordCache[key];
  }
  _dailyCacheDate = today;
  const cacheKey = gameId + ':' + today + ':' + length + ':' + uniqueLetters;
  if (dailyWordCache[cacheKey]) return dailyWordCache[cacheKey];

  const usesSearchleEasyPool = gameId === 'searchle' && Number(length) === 5 && searchleEasyTargetSet.size > 0;
  const seedGameId = usesSearchleEasyPool ? `${gameId}:easy` : gameId;
  const pool = getDailyTargetPool(gameId, length);
  if (pool.length === 0) return null;

  // Try up to 100 offset seeds to find a word meeting uniqueLetters requirement
  for (let attempt = 0; attempt < 100; attempt++) {
    const seed = attempt === 0 ? (seedGameId + today) : (seedGameId + today + ':' + attempt);
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    const index = parseInt(hash.slice(0, 8), 16) % pool.length;
    const word = pool[index];

    if (uniqueLetters > 0) {
      const unique = new Set(word.toLowerCase()).size;
      if (unique !== uniqueLetters) continue;
    }

    const result = { word, date: today, length: Number(length), gameId };
    dailyWordCache[cacheKey] = result;
    return result;
  }

  // Fallback: return first match without uniqueLetters constraint
  const hash = crypto.createHash('sha256').update(seedGameId + today).digest('hex');
  const index = parseInt(hash.slice(0, 8), 16) % pool.length;
  const result = { word: pool[index], date: today, length: Number(length), gameId };
  dailyWordCache[cacheKey] = result;
  return result;
}

/**
 * Get the weekly word for a game. Deterministic: same game + same week = same word.
 * Uses SHA-256 hash of gameId + weekStart to pick from the sorted target list.
 * Once a weekly word is determined for a given week, it is cached in memory so that
 * changes to the target list mid-week won't alter the word.
 * @param {string} gameId - Game identifier (e.g., 'spellingbee', 'rectangled')
 * @param {number} [length=5] - Word length
 * @param {number} [uniqueLetters=0] - If > 0, require exactly this many unique letters (for Spelling Bee)
 * @returns {object|null} { word, weekStart, length, gameId } or null if no targets
 */
const weeklyWordCache = {};
let _weeklyCacheWeek = null;
function getWeeklyWord(gameId, length = 5, uniqueLetters = 0) {
  const weekStart = getWeekStart();
  // Clear stale cache when week rolls over
  if (_weeklyCacheWeek && _weeklyCacheWeek !== weekStart) {
    for (const key of Object.keys(weeklyWordCache)) delete weeklyWordCache[key];
  }
  _weeklyCacheWeek = weekStart;
  const cacheKey = gameId + ':' + weekStart + ':' + length + ':' + uniqueLetters;
  if (weeklyWordCache[cacheKey]) return weeklyWordCache[cacheKey];

  const pool = filterWordsForGame(targets[String(length)] || [], gameId, 'target');
  if (pool.length === 0) return null;

  // Try up to 100 offset seeds to find a word meeting uniqueLetters requirement
  for (let attempt = 0; attempt < 100; attempt++) {
    const seed = attempt === 0 ? (gameId + weekStart) : (gameId + weekStart + ':' + attempt);
    const hash = crypto.createHash('sha256').update(seed).digest('hex');
    const index = parseInt(hash.slice(0, 8), 16) % pool.length;
    const word = pool[index];

    if (uniqueLetters > 0) {
      const unique = new Set(word.toLowerCase()).size;
      if (unique !== uniqueLetters) continue;
    }

    const result = { word, weekStart, length: Number(length), gameId };
    weeklyWordCache[cacheKey] = result;
    return result;
  }

  // Fallback: return first match without uniqueLetters constraint
  const hash = crypto.createHash('sha256').update(gameId + weekStart).digest('hex');
  const index = parseInt(hash.slice(0, 8), 16) % pool.length;
  const result = { word: pool[index], weekStart, length: Number(length), gameId };
  weeklyWordCache[cacheKey] = result;
  return result;
}

/**
 * Register API routes on an Express app.
 * @param {import('express').Express} app
 */
function registerRoutes(app, { hasInternalApiKey = () => false } = {}) {
  // Get all targets (by length)
  app.get('/api/word-bank/targets', (req, res) => {
    res.json(getTargets());
  });

  // Get targets for a specific length
  app.get('/api/word-bank/targets/:length', (req, res) => {
    const len = parseInt(req.params.length);
    if (isNaN(len)) return res.status(400).json({ error: 'Invalid length' });
    res.json(getTargets(len));
  });

  // Get dictionary for a specific length
  app.get('/api/word-bank/dictionary/:length', (req, res) => {
    const len = parseInt(req.params.length);
    if (isNaN(len)) return res.status(400).json({ error: 'Invalid length' });
    res.json(getDictionary(len));
  });

  // Validate a word
  app.get('/api/word-bank/validate/:word', (req, res) => {
    const word = req.params.word.toLowerCase();
    const lr = getLetterRarityScore(word);
    res.json({
      word,
      valid: isValidWord(word),
      isTarget: isValidTarget(word),
      isCommon: isCommonWord(word),
      zipf: getFrequency(word),
      length: word.length,
      letterRarityScore: lr.score,
      letterRarityTierCounts: lr.tierCounts,
      wordLengthBonus: getWordLengthBonus(word)
    });
  });

  // Get word bank stats
  app.get('/api/word-bank/stats', (req, res) => {
    const stats = getStats();
    stats.frequencyLoaded = Object.keys(frequency).length > 0;
    stats.totalFrequencyWords = Object.keys(frequency).length;
    stats.totalCommon = commonSet.size;
    stats.commonZipfMin = COMMON_ZIPF_MIN;
    const bonusValues = {};
    for (const t of LETTER_RARITY_TIERS_LIST) bonusValues[t.name] = t.bonus;
    stats.letterRarity = { bonusValues };
    stats.wordLengthBonus = { ...WORD_LENGTH_BONUS, '12+': WORD_LENGTH_BONUS_MAX };
    res.json(stats);
  });

  // Get common words set (frequency-based, for game rarity classification)
  app.get('/api/word-bank/common', (req, res) => {
    res.json([...getCommonSet()]);
  });

  // Get all frequency data as { word: zipfScore } — for game servers at startup
  app.get('/api/word-bank/frequency', (req, res) => {
    res.json(frequency);
  });

  // Get frequency info for a specific word
  app.get('/api/word-bank/frequency/:word', (req, res) => {
    const word = req.params.word.toLowerCase();
    res.json({
      word,
      zipf: getFrequency(word),
      isCommon: isCommonWord(word),
      isTarget: isValidTarget(word),
      valid: isValidWord(word)
    });
  });

  // ─── Letter Rarity Endpoints ─────────────────────────────────────

  // Get full letter rarity data (all 26 letters with tiers)
  app.get('/api/word-bank/letter-rarity', (req, res) => {
    const tierLetters = {};
    for (const t of LETTER_RARITY_TIERS_LIST) tierLetters[t.name] = [];
    for (const data of Object.values(LETTER_RARITY)) {
      tierLetters[data.tier].push(data.letter);
    }
    const tiers = {};
    for (const t of LETTER_RARITY_TIERS_LIST) {
      tiers[t.name] = { minFreq: t.minFreq, bonus: t.bonus, letters: tierLetters[t.name] };
    }
    res.json({ tiers, letters: getLetterRarityData() });
  });

  // Get rarity for a single letter
  app.get('/api/word-bank/letter-rarity/letter/:letter', (req, res) => {
    const letter = req.params.letter.toLowerCase();
    const data = getLetterRarity(letter);
    if (!data) return res.status(400).json({ error: 'Invalid letter' });
    res.json(data);
  });

  // Get letter rarity breakdown for a word
  app.get('/api/word-bank/letter-rarity/:word', (req, res) => {
    const word = req.params.word.toLowerCase();
    const result = getLetterRarityScore(word);
    res.json({
      word,
      ...result,
      wordLengthBonus: getWordLengthBonus(word),
      zipf: getFrequency(word),
      isCommon: isCommonWord(word),
      valid: isValidWord(word)
    });
  });

  // Daily and weekly answers require a current issuer for that game family.
  // Nginx reaches this process through loopback; source IP is not a credential.
  function requireGameApiKey(req, res, next) {
    if (hasInternalApiKey(req)) return next();
    res.status(401).json({ error: 'Unauthorized' });
  }

  // Get daily word for a game (server-to-server only, deterministic per day)
  app.get('/api/word-bank/daily/:gameId', requireGameApiKey, (req, res) => {
    const gameId = req.params.gameId;
    const length = parseInt(req.query.length) || 5;
    const uniqueLetters = parseInt(req.query.uniqueLetters) || 0;
    const result = getDailyWord(gameId, length, uniqueLetters);
    if (!result) {
      return res.status(404).json({ error: 'No targets for this length' });
    }
    res.json(result);
  });

  // Get weekly word for a game (server-to-server only, deterministic per week Mon-Sun)
  app.get('/api/word-bank/weekly/:gameId', requireGameApiKey, (req, res) => {
    const gameId = req.params.gameId;
    const length = parseInt(req.query.length) || 5;
    const uniqueLetters = parseInt(req.query.uniqueLetters) || 0;
    const result = getWeeklyWord(gameId, length, uniqueLetters);
    if (!result) {
      return res.status(404).json({ error: 'No targets for this length' });
    }
    res.json(result);
  });

  // ─── Current Words (admin overview) ─────────────────────────────────

  app.get('/api/word-bank/current-words', async (req, res) => {
    const dailyGames = [
      { gameId: 'word500', name: 'Word5000', length: 5 },
      { gameId: 'word500-sp', name: 'Word5000 Solo', length: 5 },
      { gameId: 'wordle', name: 'Wordle', length: 5 },
      { gameId: 'wordle-sp', name: 'Wordle SP', length: 5 },
      { gameId: 'betwixt', name: 'Betwixt', length: 5 },
      { gameId: 'betwixt-sp', name: 'Betwixt SP', length: 5 },
      { gameId: 'pixeletters', name: 'PixeLetters', length: 5 },
      { gameId: 'pixeletters-sp', name: 'PixeLetters SP', length: 5 },
      { gameId: 'figural', name: 'Figural', length: 5 },
      { gameId: 'figural-sp', name: 'Figural SP', length: 5 },
      { gameId: 'searchle', name: 'Subtextle', length: 5 },
      { gameId: 'rectangled', name: 'recTangled', length: 5 },
      { gameId: 'spellingbee', name: 'Spelling Bee', length: 7, uniqueLetters: 7 },
      { gameId: 'spellingbee-sp', name: 'Spelling Bee SP', length: 7, uniqueLetters: 7 },
    ];

    const weeklyGames = [
      { gameId: 'searchle-sp', name: 'Subtextle SP', length: 5, fetchFrom: 'http://localhost:3015/api/sp/weekly' },
      { gameId: 'spellingbee', name: 'Spelling Bee', length: 7, uniqueLetters: 7 },
      { gameId: 'spellingbee-sp', name: 'Spelling Bee SP', length: 7, uniqueLetters: 7 },
      { gameId: 'rectangled', name: 'recTangled', length: 5 },
      { gameId: 'rectangled-sp', name: 'recTangled SP', length: 5 },
    ];

    const daily = dailyGames.map(g => {
      const result = getDailyWord(g.gameId, g.length, g.uniqueLetters || 0);
      return { ...g, word: result ? result.word : null, date: result ? result.date : null };
    });

    const weekly = await Promise.all(weeklyGames.map(async g => {
      // Some games have their own weekly word system — fetch directly from them
      if (g.fetchFrom) {
        try {
          const r = await fetch(g.fetchFrom);
          if (r.ok) {
            const data = await r.json();
            console.log(`[Word Bank] Fetched ${g.gameId} weekly from ${g.fetchFrom}: "${data.word}"`);
            return { ...g, word: data.word || null, weekStart: data.weekStart || null };
          }
          console.log(`[Word Bank] fetchFrom ${g.fetchFrom} returned HTTP ${r.status}, falling back to word-bank calculation`);
        } catch (e) {
          console.log(`[Word Bank] fetchFrom ${g.fetchFrom} failed: ${e.message}, falling back to word-bank calculation`);
        }
      }
      const result = getWeeklyWord(g.gameId, g.length, g.uniqueLetters || 0);
      return { ...g, word: result ? result.word : null, weekStart: result ? result.weekStart : null };
    }));

    res.json({ daily, weekly });
  });

  // ─── Admin Endpoints ───────────────────────────────────────────────

  // Get candidate words (dictionary words not yet in targets)
  app.get('/api/word-bank/admin/candidates/:length', (req, res) => {
    const len = parseInt(req.params.length);
    if (isNaN(len)) return res.status(400).json({ error: 'Invalid length' });

    const page = parseInt(req.query.page) || 0;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 100, 500);
    const filterPlurals = req.query.filterPlurals !== 'false';
    const search = req.query.search || undefined;

    res.json(getCandidates(len, { page, pageSize, filterPlurals, search }));
  });

  // Check plural status of a word
  app.get('/api/word-bank/admin/check-plural/:word', (req, res) => {
    const word = req.params.word.toLowerCase();
    const result = detectPlural(word);
    res.json({ word, ...result });
  });

  // Add words to targets
  app.post('/api/word-bank/admin/add', (req, res) => {
    const { words } = req.body;
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: 'words must be a non-empty array' });
    }
    try {
      const result = addTargets(words);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save: ' + err.message });
    }
  });

  // Remove words from targets
  app.post('/api/word-bank/admin/remove', (req, res) => {
    const { words } = req.body;
    if (!Array.isArray(words) || words.length === 0) {
      return res.status(400).json({ error: 'words must be a non-empty array' });
    }
    try {
      const result = removeTargets(words);
      res.json({ ok: true, ...result });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save: ' + err.message });
    }
  });

  // Add a single word directly (quick-add)
  app.post('/api/word-bank/admin/add-word', (req, res) => {
    const { word } = req.body;
    if (!word || typeof word !== 'string') {
      return res.status(400).json({ error: 'word is required' });
    }
    const w = word.toLowerCase().trim();

    // Check if it's in the dictionary
    const inDict = dictionarySet.has(w);
    const isTarget = targetSet.has(w);
    const plural = detectPlural(w);

    if (isTarget) {
      return res.json({ ok: false, reason: 'already a target', word: w });
    }

    if (!inDict) {
      return res.json({ ok: false, reason: 'not in dictionary', word: w });
    }

    try {
      const result = addTargets([w]);
      res.json({ ok: true, word: w, plural, ...result });
    } catch (err) {
      res.status(500).json({ error: 'Failed to save: ' + err.message });
    }
  });

  // Browse current targets (paginated, searchable)
  app.get('/api/word-bank/admin/browse/:length', (req, res) => {
    const len = parseInt(req.params.length);
    if (isNaN(len)) return res.status(400).json({ error: 'Invalid length' });

    const page = parseInt(req.query.page) || 0;
    const pageSize = Math.min(parseInt(req.query.pageSize) || 100, 500);
    const search = req.query.search || undefined;

    let words = [...(targets[String(len)] || [])].sort();

    if (search) {
      const s = search.toLowerCase();
      words = words.filter(w => w.includes(s));
    }

    const total = words.length;
    const totalPages = Math.ceil(total / pageSize);
    const start = page * pageSize;
    const paged = words.slice(start, start + pageSize);

    res.json({ words: paged, total, page, pageSize, totalPages });
  });
}

// Load data on module init
load();

module.exports = {
  getTargets,
  getDictionary,
  isValidWord,
  isValidTarget,
  isCommonWord,
  getCommonSet,
  getFrequency,
  getRawFrequency,
  getRandomTarget,
  getDailyWord,
  getWeeklyWord,
  getWeekStart,
  getAvailableLengths,
  getStats,
  getCandidates,
  addTargets,
  removeTargets,
  detectPlural,
  getLetterRarity,
  getLetterRarityScore,
  getLetterRarityData,
  getWordLengthBonus,
  registerRoutes,
  reload: load
};
