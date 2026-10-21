// Builds the two word pools HangStream serves to the browser.
//
//   public/custom-words.json  the curated pool - hand-picked words that carry a
//                              real category, so the on-stream category badge
//                              is a usable hint.
//   public/word-bank.json     the general pool - the Word Tycoon ecosystem's
//                              own curated target list, tagged by difficulty.
//
// Both keep the `{ word, cat, difficulty }` contract the pages already parse.
// The build is deterministic and offline: every input is vendored in the repo.
//
//   node server/games/tools/build-curated-words.js            # write
//   node server/games/tools/build-curated-words.js --check    # report only
//
// Inputs
//   server/games/data/themed-words.json     hand-curated themed entries
//   server/games/data/basic-words.json      hand-curated Wikipedia basic words
//   server/searchle/shared/word-bank/targets.json               upstream targets
//   server/searchle/shared/word-bank/searchle-easy-targets.json
//   server/searchle/shared/word-bank/searchle-very-easy-targets.json
//
// Outputs
//   public/custom-words.json   merged curated pool
//   public/word-bank.json      tagged general pool

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const BANK_DIR = path.join(ROOT, 'server', 'searchle', 'shared', 'word-bank');
const DATA_DIR = path.join(ROOT, 'server', 'games', 'data');
const PUBLIC_DIR = path.join(ROOT, 'public');

const THEMED_PATH = path.join(DATA_DIR, 'themed-words.json');
const BASIC_PATH = path.join(DATA_DIR, 'basic-words.json');
const CURATED_PATH = path.join(PUBLIC_DIR, 'custom-words.json');
const BANK_PATH = path.join(PUBLIC_DIR, 'word-bank.json');

/** The general pool carries no category of its own. */
const GENERAL_CATEGORY = 'Common';

/**
 * Difficulty tag for a general-pool word.
 *
 * Length dominates - a 12-letter word is a hard Hangman board whatever it
 * means - but within a length band the upstream frequency tier decides. The
 * "very easy" tier holds the words viewers actually recognise, so those are
 * the ones that earn an easy board.
 */
function tagFor(word, tier) {
  const len = word.length;
  if (len <= 4) return 'easy';
  if (len <= 6) {
    if (tier === 'very-easy') return 'easy';
    if (tier === 'easy') return 'medium';
    return 'hard';
  }
  if (len <= 8) return tier === 'very-easy' ? 'medium' : 'hard';
  return 'hard';
}

/**
 * Difficulty tag for a curated word.
 *
 * The hand-curated list already states its own difficulty, so that wins. A
 * word that predates the tagging (or carries none) falls back to its length.
 */
function curatedTagFor(word, existing) {
  const known = String(existing || '').toLowerCase();
  if (known === 'easy' || known === 'medium' || known === 'hard') return known;
  const len = word.length;
  if (len <= 6) return 'easy';
  if (len <= 8) return 'medium';
  return 'hard';
}

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * Build both pools from the vendored inputs.
 *
 * Pure: it reads the inputs and returns the result without writing anything,
 * so the test suite can check the committed artefacts still match the inputs.
 */
function buildCuratedWords() {
  // ---- curated pool ------------------------------------------------------
  const themed = readJson(THEMED_PATH, { words: [] });
  const themedList = Array.isArray(themed) ? themed : (themed.words || []);
  const seen = new Set();
  const curated = [];

  const pushCurated = (word, cat, difficulty) => {
    const w = String(word || '').trim();
    if (!w) return;
    const key = w.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    curated.push({ word: w.toUpperCase(), cat, difficulty });
  };

  // Hand-curated themed entries keep their category and their stated difficulty.
  for (const item of themedList) {
    const word = typeof item === 'string' ? item : item.word;
    if (!word) continue;
    const cat = (typeof item === 'object' && item.cat) || 'Common';
    const difficulty = (typeof item === 'object' && item.difficulty) || '';
    pushCurated(word, cat, curatedTagFor(String(word).trim(), difficulty));
  }
  const themedCount = curated.length;

  // Hand-curated Wikipedia basic words add a second set of real categories.
  const basic = readJson(BASIC_PATH, { words: {} });
  let basicCount = 0;
  for (const [cat, words] of Object.entries(basic.words || {})) {
    for (const word of words) {
      const before = curated.length;
      pushCurated(word, cat, curatedTagFor(String(word), ''));
      if (curated.length > before) basicCount++;
    }
  }

  // ---- general pool ------------------------------------------------------
  const targets = readJson(path.join(BANK_DIR, 'targets.json'), {});
  const veryEasy = new Set(readJson(path.join(BANK_DIR, 'searchle-very-easy-targets.json'), []));
  const easyTier = new Set(readJson(path.join(BANK_DIR, 'searchle-easy-targets.json'), []));

  const buckets = { easy: [], medium: [], hard: [] };
  const targetSet = new Set();
  for (const len of Object.keys(targets)) {
    for (const word of targets[len] || []) {
      const w = String(word).toLowerCase();
      if (!/^[a-z]+$/.test(w)) continue;
      if (targetSet.has(w)) continue;
      targetSet.add(w);
      const tier = veryEasy.has(w) ? 'very-easy' : easyTier.has(w) ? 'easy' : 'hard';
      buckets[tagFor(w, tier)].push(w);
    }
  }

  const bank = {
    meta: {
      source: 'Word Tycoon ecosystem - shared word bank (searchle/server/shared/word-bank/targets.json)',
      sourceUrl: 'https://github.com/johnrstanley11-gif/word-tycoon-ecosystem',
      licence: 'MIT (ecosystem code and data). Word lists keep their own terms.',
      category: GENERAL_CATEGORY,
      counts: {
        easy: buckets.easy.length,
        medium: buckets.medium.length,
        hard: buckets.hard.length,
        total: targetSet.size,
      },
      note: 'Difficulty combines word length with the upstream frequency tier. Length dominates: a long word is a hard board whatever it means.',
    },
    words: buckets,
  };

  return { curated, bank, themedCount, basicCount };
}

/**
 * Format the curated pool with one entry per line.
 *
 * The file is generated, but it is committed, so keeping it diff-friendly
 * matters: a one-line JSON blob would make every regeneration unreadable.
 */
function formatCurated(list) {
  const lines = list.map((e) =>
    `  { "word": ${JSON.stringify(e.word)}, "cat": ${JSON.stringify(e.cat)}, "difficulty": ${JSON.stringify(e.difficulty)} }`
  );
  return `[\n${lines.join(',\n')}\n]\n`;
}

/** Format the general pool the same way: one word per line, grouped by tag. */
function formatBank(bank) {
  const meta = JSON.stringify(bank.meta, null, 2)
    .split('\n')
    .map((line, i) => (i === 0 ? line : `  ${line}`))
    .join('\n');
  const buckets = Object.entries(bank.words)
    .map(([tag, list]) => {
      const words = list.map((w) => `      ${JSON.stringify(w)}`).join(',\n');
      return `    ${JSON.stringify(tag)}: [\n${words}\n    ]`;
    })
    .join(',\n');
  return `{\n  "meta": ${meta},\n  "words": {\n${buckets}\n  }\n}\n`;
}

function main() {
  const checkOnly = process.argv.includes('--check');

  const { curated, bank, themedCount, basicCount } = buildCuratedWords();

  // ---- report ------------------------------------------------------------
  console.log(`curated pool : ${curated.length} words (${themedCount} themed + ${basicCount} wikipedia basic)`);
  const byCat = {};
  for (const e of curated) byCat[e.cat] = (byCat[e.cat] || 0) + 1;
  console.log(`  categories : ${Object.keys(byCat).length} -> ${Object.entries(byCat).map(([c, n]) => `${c}(${n})`).join(', ')}`);
  console.log(`general pool : ${bank.meta.counts.total} words (easy ${bank.meta.counts.easy}, medium ${bank.meta.counts.medium}, hard ${bank.meta.counts.hard})`);

  if (checkOnly) {
    console.log('\n--check: nothing written.');
    return;
  }

  fs.writeFileSync(CURATED_PATH, formatCurated(curated), 'utf8');
  fs.writeFileSync(BANK_PATH, formatBank(bank), 'utf8');
  console.log(`\nwrote ${path.relative(ROOT, CURATED_PATH)} (${(fs.statSync(CURATED_PATH).size / 1024).toFixed(1)} KB)`);
  console.log(`wrote ${path.relative(ROOT, BANK_PATH)} (${(fs.statSync(BANK_PATH).size / 1024).toFixed(1)} KB)`);
}

if (require.main === module) {
  try {
    main();
  } catch (err) {
    console.error('ERR', err.message);
    process.exitCode = 1;
  }
}

module.exports = { buildCuratedWords, tagFor, curatedTagFor, CURATED_PATH, BANK_PATH };
