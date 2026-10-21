// Word bank and blocklist tests.
//
// The word bank is two pools with one contract:
//   public/custom-words.json  curated  - hand-picked, carries a real category
//   public/word-bank.json     general  - the ecosystem's target list, tagged by
//                                       difficulty but without a category
//
// The blocklist is the ecosystem's own, so a word blocked upstream is blocked
// here too, in every role a word can play (answer, board word, guess).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dictionary = require('../games/dictionary');
const policy = require('../games/word-policy');
const { buildCuratedWords, CURATED_PATH, BANK_PATH } = require('../games/tools/build-curated-words');
const { HangmanGame } = require('../games/hangman');

const ROOT = path.join(__dirname, '..', '..');

function player(name) {
  return { platform: 'twitch', username: name, displayName: name, platformUserId: name };
}

// ── the blocklist ──────────────────────────────────────────────────────────

test('word policy blocks the words on the list and lets the rest through', () => {
  assert.equal(policy.isBlockedWord('nigger'), true);
  assert.equal(policy.isBlockedWord('NIGGER'), true);
  assert.equal(policy.isBlockedWord('  nigger  '), true);
  assert.equal(policy.isBlockedWord('retarded'), true);
  assert.equal(policy.isBlockedWord('zebra'), false);
  assert.equal(policy.isBlockedWord(''), false);
});

test('word policy resolves a role per game, defaulting to block', () => {
  assert.equal(policy.getRule('hangman', 'target'), 'block');
  assert.equal(policy.getRule('spellingbee', 'board_word'), 'block');
  assert.equal(policy.getRule('speedscramble', 'guess'), 'block');
  // Aliases resolve to the same game.
  assert.equal(policy.normalizeGameId('speed-scramble'), 'speedscramble');
  assert.equal(policy.normalizeGameId('spelling-bee'), 'spellingbee');
});

test('word policy filters a list down to the allowed words', () => {
  const kept = policy.filterWordsForGame(['zebra', 'nigger', 'apple'], 'hangman', 'target');
  assert.deepEqual(kept, ['zebra', 'apple']);
  assert.deepEqual(policy.sanitizeWords(['zebra', 'nigger']), ['zebra']);
});

test('a blocked guess is refused without the word being echoed back', () => {
  const game = new HangmanGame();
  game.newRound({ word: 'zebra', category: 'Animals' });
  game.start();

  const result = game.submitWord('nigger', player('a'));
  assert.equal(result.accepted, false);
  assert.equal(result.result, 'blocked');
  assert.equal(result.word, undefined);
  // The guess must not have scored anything.
  assert.equal(Object.keys(game.foundWords).length, 0);
});

// ── the pools ──────────────────────────────────────────────────────────────

test('the general pool is much larger than the curated one', () => {
  const general = dictionary.general();
  const curated = dictionary.curated();
  assert.ok(general.length > 1000, `general pool only had ${general.length} words`);
  assert.ok(curated.length > 100, `curated pool only had ${curated.length} words`);
  assert.ok(general.length > curated.length * 5);
});

test('every curated word carries a category and a difficulty', () => {
  for (const entry of dictionary.curated()) {
    assert.ok(entry.word, 'curated entry without a word');
    assert.ok(entry.cat, `${entry.word} has no category`);
    assert.ok(['easy', 'medium', 'hard'].includes(entry.difficulty), `${entry.word} has tag ${entry.difficulty}`);
  }
});

test('randomTarget honours the requested length band and category', () => {
  for (let i = 0; i < 40; i++) {
    const easy = dictionary.randomTarget({ difficulty: 'easy', minLength: 4, maxLength: 6 });
    assert.ok(easy && easy.word);
    assert.ok(easy.word.length >= 4 && easy.word.length <= 6, `${easy.word} is outside the easy band`);

    const hard = dictionary.randomTarget({ difficulty: 'hard', minLength: 8, maxLength: 20 });
    assert.ok(hard && hard.word);
    assert.ok(hard.word.length >= 8 && hard.word.length <= 20, `${hard.word} is outside the hard band`);
  }

  // An explicit category is never traded away.
  const animals = dictionary.randomTarget({ category: 'Animals', minLength: 3, maxLength: 12 });
  assert.ok(animals && animals.word);
  assert.equal(animals.cat.toLowerCase(), 'animals');
});

test('randomTarget never hands out a blocked word', () => {
  for (let i = 0; i < 60; i++) {
    const pick = dictionary.randomTarget({ minLength: 3, maxLength: 14 });
    assert.ok(pick && pick.word);
    assert.equal(policy.isBlockedWord(pick.word), false, `${pick.word} is blocked`);
  }
});

test('the picker uses both pools and does not repeat a word straight away', () => {
  const draws = 300;
  const words = new Set();
  let curated = 0;
  let common = 0;
  for (let i = 0; i < draws; i++) {
    const pick = dictionary.randomTarget({ difficulty: 'medium', minLength: 5, maxLength: 8 });
    assert.ok(pick && pick.word);
    words.add(pick.word);
    if (pick.cat === 'Common') common++;
    else curated++;
  }

  // Both pools have to contribute, or the expanded bank is not being used.
  assert.ok(curated > 0, 'no curated words were drawn');
  assert.ok(common > 0, 'no general words were drawn');

  // The draw bag means a band does not serve the same word twice in a row.
  assert.ok(words.size > draws * 0.5, `only ${words.size} distinct words in ${draws} draws`);
});

test('poolSizes counts each pool by difficulty inside a band', () => {
  const band = { minLength: 4, maxLength: 6 };
  const sizes = dictionary.poolSizes(band);

  const count = (entries) => {
    const out = {};
    for (const entry of entries) {
      if (entry.word.length < band.minLength || entry.word.length > band.maxLength) continue;
      out[entry.difficulty] = (out[entry.difficulty] || 0) + 1;
    }
    return out;
  };

  assert.deepEqual(sizes.curated, count(dictionary.curated()));
  assert.deepEqual(sizes.general, count(dictionary.general()));
  // Both pools have to have stock for an easy round.
  assert.ok(sizes.curated.easy > 0);
  assert.ok(sizes.general.easy > 0);
});

// ── the shipped artefacts ──────────────────────────────────────────────────

test('the committed word bank files match what the build produces', () => {
  const { curated, bank } = buildCuratedWords();

  const shippedCurated = JSON.parse(fs.readFileSync(CURATED_PATH, 'utf8'));
  const shippedBank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));

  assert.deepEqual(shippedCurated, curated, 'public/custom-words.json is stale - re-run the build');
  assert.deepEqual(shippedBank, bank, 'public/word-bank.json is stale - re-run the build');
});

test('the shipped word bank keeps the { word, cat, difficulty } contract', () => {
  const curated = JSON.parse(fs.readFileSync(CURATED_PATH, 'utf8'));
  assert.ok(Array.isArray(curated) && curated.length > 0);
  for (const entry of curated) {
    assert.deepEqual(Object.keys(entry).sort(), ['cat', 'difficulty', 'word']);
    assert.equal(typeof entry.word, 'string');
    assert.equal(typeof entry.cat, 'string');
    assert.equal(typeof entry.difficulty, 'string');
  }

  const bank = JSON.parse(fs.readFileSync(BANK_PATH, 'utf8'));
  assert.ok(bank.meta && bank.words);
  assert.ok(Array.isArray(bank.words.easy));
  assert.ok(Array.isArray(bank.words.medium));
  assert.ok(Array.isArray(bank.words.hard));
  // The general pool carries no category, so the pages label it "Common".
  assert.equal(bank.meta.category, 'Common');
  assert.equal(bank.meta.counts.total, bank.words.easy.length + bank.words.medium.length + bank.words.hard.length);
});

test('the shipped word bank is referenced by the pages that serve it', () => {
  for (const page of ['public/index.html', 'public/overlay.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.match(html, /\/word-bank\.json/, `${page} does not fetch the general pool`);
    assert.match(html, /\/custom-words\.json/, `${page} does not fetch the curated pool`);
  }
  const server = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  assert.match(server, /'\/word-bank\.json'/, 'the server does not serve /word-bank.json');
});
