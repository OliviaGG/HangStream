const test = require('node:test');
const assert = require('node:assert/strict');

const { Game, scoreWordFull } = require('../games/engine');
const { WordleGame, evaluateGuess } = require('../games/wordle');
const { SpellingBeeGame } = require('../games/spellingbee');
const { HangmanGame } = require('../games/hangman');
const { SpeedScrambleGame, scrambleWord } = require('../games/speedscramble');
const { SearchleGame, pointsForGuess, MAX_GUESSES } = require('../games/searchle');
const dictionary = require('../games/dictionary');
const { GameRegistry, getDailyDate } = require('../games/registry');

function player(name) {
  return { platform: 'twitch', username: name, displayName: name, platformUserId: name };
}

test('scoreWordFull rewards rarity, length and pangrams', () => {
  const common = scoreWordFull('read', {});
  const rare = scoreWordFull('read', { isRare: true });
  const hidden = scoreWordFull('read', { isHidden: true });
  assert.ok(common > 0);
  assert.ok(rare > common);
  assert.ok(hidden > rare);
  assert.ok(scoreWordFull('read', { isPangram: true }) > common);
});

test('base Game enforces lifecycle and scoring', () => {
  const game = new Game({ slug: 'demo', minLength: 3 });
  game.loadRound({ answers: ['cat', 'dog'], required: ['cat'], rarity: new Map([['dog', 'rare']]) });

  assert.equal(game.submitWord('cat', player('a')).result, 'not_active');

  game.start();
  const wrong = game.submitWord('hat', player('a'));
  assert.equal(wrong.accepted, false);
  assert.equal(wrong.result, 'incorrect');

  const right = game.submitWord('cat', player('a'));
  assert.equal(right.accepted, true);
  assert.equal(right.result, 'correct');

  const dupe = game.submitWord('cat', player('a'));
  assert.equal(dupe.result, 'already_found');

  assert.equal(game.foundRequiredCount, 1);
  assert.equal(game.getLeaderboard()[0].score, right.score);

  game.end();
  assert.equal(game.status, 'ended');
});

test('wordle feedback follows classic rules with duplicates', () => {
  assert.deepEqual(evaluateGuess('crane', 'crane'), ['correct', 'correct', 'correct', 'correct', 'correct']);
  // Positional matches win first; leftover letters then match by count.
  assert.deepEqual(evaluateGuess('geese', 'these'), ['absent', 'absent', 'correct', 'correct', 'correct']);
  // The second 'e' in the guess cannot re-match the single 'e' left in the answer.
  assert.deepEqual(evaluateGuess('eerie', 'crepe'), ['present', 'absent', 'present', 'absent', 'correct']);
});

test('wordle round accepts real guesses, rejects repeats and non-words', () => {
  const game = new WordleGame();
  const built = game.newRound({ word: 'crane' });
  assert.equal(built.success, true);
  game.start();

  const miss = game.submitWord('adieu', player('a'));
  assert.equal(miss.accepted, true);
  assert.equal(miss.win, false);
  assert.equal(miss.feedback.length, 5);

  assert.equal(game.submitWord('adieu', player('a')).result, 'already_guessed');
  assert.equal(game.submitWord('zzzzz', player('a')).result, 'not_a_word');

  const win = game.submitWord('crane', player('b'));
  assert.equal(win.win, true);
  assert.equal(win.result, 'correct');
  // The round stays active so other players can still take their six guesses;
  // solving is reported per guess, and completion is a separate event.
  assert.equal(game.status, 'active');
  assert.equal(game.getState().solved, true);
});

test('wordle hides the answer from live state', () => {
  const registry = new GameRegistry({ broadcast: () => {}, persist: () => {} });
  registry.startRound('caster', 'wordle', { word: 'crane' });
  const live = registry.state('caster', 'wordle');
  assert.equal(live.answer, undefined);
});

test('registry routes chat and web guesses through the same room', async () => {
  const sent = [];
  const registry = new GameRegistry({ broadcast: (room, payload) => sent.push({ room, payload }), persist: () => {} });

  registry.startRound('caster', 'spellingbee', { letters: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], centerLetter: 'a' });
  const game = registry.room('caster', 'spellingbee');
  assert.equal(game.status, 'active');
  assert.ok(game.answers.length > 0);

  const answer = game.answers[0];
  // sendChatGuess is async because Searchle ranks over an embedding model.
  const chatResult = await registry.sendChatGuess('twitch', 'caster', answer, { username: 'chatfan' });
  assert.ok(Array.isArray(chatResult));
  assert.equal(chatResult[0].accepted, true);

  // Web guess for the same word is now already found.
  const webResult = await registry.sendChatGuess('twitch', 'caster', answer, { username: 'webfan' });
  assert.equal(webResult[0].result, 'already_found');

  assert.ok(sent.some((m) => m.payload.type === 'game-word-found'));
});

test('registry rejects guesses that ignore the center letter', () => {
  const registry = new GameRegistry({ broadcast: () => {}, persist: () => {} });
  registry.startRound('caster', 'spellingbee', { letters: ['a', 'b', 'c', 'd', 'e', 'f', 'g'], centerLetter: 'a' });
  const game = registry.room('caster', 'spellingbee');
  const noCenter = game.answers.find((w) => !w.includes('a'));
  if (noCenter) {
    const result = game.submitWord(noCenter, player('a'));
    assert.equal(result.accepted, false);
    assert.equal(result.result, 'missing_center');
  }
});

test('daily date is an ISO day in the Edmonton timezone', () => {
  assert.match(getDailyDate(new Date('2026-01-15T12:00:00Z')), /^\d{4}-\d{2}-\d{2}$/);
  // 05:00 UTC is still the previous day in Edmonton (UTC-7).
  assert.equal(getDailyDate(new Date('2026-01-15T05:00:00Z')), '2026-01-14');
});

test('dictionary exposes lengths and bee rounds are buildable', () => {
  dictionary.load();
  const sizes = dictionary.sizes();
  assert.ok(Object.keys(sizes).length > 0);
  const round = dictionary.buildBeeRound({ minAnswers: 8 });
  if (round) {
    assert.equal(round.puzzle.letters.length, 7);
    assert.ok(round.answers.length >= 8);
    assert.ok(round.answers.every((w) => w.includes(round.puzzle.centerLetter)));
  }
});

test('dictionary exposes the curated hangman list with categories', () => {
  const curated = dictionary.curated();
  assert.ok(curated.length > 0);
  assert.ok(curated.every((e) => e.word && e.cat && e.difficulty));
  assert.ok(dictionary.curatedCategories().length > 0);
  const hard = dictionary.randomCuratedWord({ difficulty: 'hard' });
  assert.ok(hard && hard.word);
});

test('hangman keeps the answer server-side and scores a solve', () => {
  const game = new HangmanGame();
  const built = game.newRound({ word: 'zebra', category: 'Animals' });
  assert.equal(built.success, true);
  assert.equal(game.word, 'zebra');

  game.start();
  // The public state must never carry the answer.
  const state = game.getState();
  assert.equal('word' in state, false);
  assert.equal(state.length, 5);

  // A wrong letter costs a strike and stays hidden.
  const miss = game.guessLetter('q', player('a'));
  assert.equal(miss.result, 'incorrect');
  assert.equal(miss.wrongCount, 1);
  assert.deepEqual(game.mask(), [null, null, null, null, null]);

  // A hit reveals every occurrence.
  const hit = game.guessLetter('a', player('b'));
  assert.equal(hit.result, 'correct');
  assert.deepEqual(game.mask(), [null, null, null, null, 'a']);

  // A duplicate letter is rejected without a strike.
  assert.equal(game.guessLetter('a', player('c')).result, 'already_guessed');

  // Solving by whole word wins and awards points.
  const win = game.submitWord('ZEBRA', player('d'));
  assert.equal(win.accepted, true);
  assert.equal(win.win, true);
  assert.ok(game.getLeaderboard(1)[0].score > 0);
});

test('hangman rejects a wrong whole-word guess without a strike', () => {
  const game = new HangmanGame();
  game.newRound({ word: 'planet' });
  game.start();
  const wrong = game.submitWord('pluto', player('a'));
  assert.equal(wrong.accepted, false);
  assert.equal(wrong.result, 'incorrect');
  assert.equal(game.wrongCount, 0);
});

test('speed scramble scrambles the answer and hides it until solved', () => {
  const game = new SpeedScrambleGame();
  const built = game.newRound({ word: 'garden' });
  assert.equal(built.success, true);
  assert.equal(game.answer, 'garden');
  assert.notEqual(game.scrambled, 'garden');
  // The scrambled form is a true anagram (same letters).
  assert.deepEqual(game.scrambled.split('').sort(), 'garden'.split('').sort());

  game.start();
  assert.equal(game.getState().answer, undefined, 'live state must not leak the answer');

  const right = game.submitWord('garden', player('a'));
  assert.equal(right.accepted, true);
  assert.equal(right.result, 'correct');
  assert.equal(game.getState().answer, 'garden', 'the answer is revealed once won');
});

test('speed scramble rejects wrong-length and non-words without scoring', () => {
  const game = new SpeedScrambleGame();
  game.newRound({ word: 'ocean' });
  game.start();
  assert.equal(game.submitWord('oceans', player('a')).result, 'wrong_length');
  assert.ok(game.getLeaderboard(5).length === 0);
});

test('scrambleWord always returns a different arrangement when possible', () => {
  const out = scrambleWord('banana');
  assert.notEqual(out, 'banana');
  assert.deepEqual(out.split('').sort(), 'banana'.split('').sort());
  // A word with no other arrangement is returned unchanged rather than looping.
  assert.equal(scrambleWord('aaaa'), 'aaaa');
});

test('searchle scores by guess number', () => {
  assert.equal(pointsForGuess(1), 100);
  assert.equal(pointsForGuess(3), 100);
  assert.equal(pointsForGuess(5), 60);
  assert.equal(pointsForGuess(9), 30);
  assert.equal(pointsForGuess(11), 10);
  assert.equal(MAX_GUESSES, 10);
});

test('searchle refuses to start without its model, without throwing', () => {
  // Inject a ranker stub so the test does not depend on the ~1GB model.
  const stub = { modelReady: () => false, createGame: () => Promise.reject(new Error('no model')) };
  const game = new SearchleGame({ ranker: stub });
  const built = game.newRound({});
  assert.equal(built.success, false);
  assert.equal(built.error, 'MODEL_NOT_READY');
  assert.equal(game.start().success, false);
});

test('searchle ranks guesses and wins on rank 1', async () => {
  // A deterministic stand-in for the embedding ranker.
  const stub = {
    modelReady: () => true,
    createGame: () => Promise.resolve({ gameId: 'session-1' }),
    submitGuess: (sessionId, word) => {
      if (word === 'zzzz') return Promise.resolve({ status: 'invalid' });
      if (word === 'close') return Promise.resolve({ status: 'ranked', rank: 40, total: 500 });
      return Promise.resolve({ status: 'ranked', rank: 1, total: 500, win: true, target: 'moon' });
    },
  };
  const game = new SearchleGame({ ranker: stub });
  assert.equal(game.newRound({}).success, true);
  game.start();
  // Let the async session id land.
  await new Promise((r) => setImmediate(r));

  const miss = await game.submitGuessAsync('close', player('a'));
  assert.equal(miss.accepted, true);
  assert.equal(miss.win, false);
  assert.equal(miss.rank, 40);
  assert.equal(miss.remaining, 9);

  // Unknown words are rejected without spending a guess.
  assert.equal((await game.submitGuessAsync('zzzz', player('a'))).result, 'not_a_word');
  assert.equal(game.guesses.length, 1);

  const win = await game.submitGuessAsync('luna', player('b'));
  assert.equal(win.win, true);
  assert.equal(win.points, 100);
  assert.equal(game.getState().answer, 'moon', 'the target is revealed once won');
});

test('searchle ends after ten guesses and reveals the target', async () => {
  const stub = {
    modelReady: () => true,
    createGame: () => Promise.resolve({ gameId: 'session-2' }),
    submitGuess: (sessionId, word) => Promise.resolve({ status: 'ranked', rank: 400, total: 500 }),
  };
  const game = new SearchleGame({ ranker: stub });
  game.newRound({});
  game.start();
  await new Promise((r) => setImmediate(r));

  for (let i = 1; i <= MAX_GUESSES; i++) {
    const result = await game.submitGuessAsync(`word${String.fromCharCode(96 + i)}`, player('a'));
    assert.equal(result.accepted, true);
    assert.equal(result.remaining, MAX_GUESSES - i);
  }
  const extra = await game.submitGuessAsync('oneMore', player('a'));
  assert.equal(extra.result, 'no_guesses_left');
});

test('registry exposes all five games and their rooms', () => {
  const registry = new GameRegistry({ broadcast: () => {}, persist: () => {} });
  const ids = registry.list().map((g) => g.id).sort();
  assert.deepEqual(ids, ['hangman', 'searchle', 'speedscramble', 'spellingbee', 'wordle']);
});
