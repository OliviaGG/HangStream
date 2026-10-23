// Speed Scramble — server-authoritative round.
//
// A timed anagram: the round shows a scrambled word and whoever unscrambles it
// first scores. The page (`public/speed-scramble.html`) used to pick the word,
// scramble it and run its own countdown, then reward whoever typed the answer
// in chat — so any viewer could read the answer out of the page source. The
// round now lives here: the scramble, the timer and the score are all server
// state, and the answer only appears in a guess result once the round is over.
//
// Unlike Hangman this fits the engine's word contract exactly — the answer set
// is a single word, and finding it completes the round — so there is no
// `submitWord` override.

const { Game } = require('../engine');
const dictionary = require('../dictionary');
const policy = require('../word-policy');

const DEFAULT_DIFFICULTY = 'normal';

/**
 * Difficulty → word length band and time limit, matching the ranges the
 * Speed Scramble page's difficulty selector already used.
 */
const DIFFICULTY = {
  easy: { minLength: 4, maxLength: 5, timerSeconds: 20 },
  normal: { minLength: 5, maxLength: 7, timerSeconds: 15 },
  hard: { minLength: 7, maxLength: 10, timerSeconds: 12 },
  // "extreme" shipped on the page as a longer word with the same clock.
  extreme: { minLength: 9, maxLength: 14, timerSeconds: 15 },
};

/**
 * Fisher-Yates shuffle that guarantees the result differs from the input, so a
 * round never shows the answer as-is. For a word whose letters cannot be
 * rearranged into anything else (e.g. "aaaa"), it falls back to the original
 * rather than looping forever.
 */
function scrambleWord(word) {
  const letters = word.split('');
  if (new Set(letters).size < 2) return word;
  for (let attempt = 0; attempt < 30; attempt++) {
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    const candidate = letters.join('');
    if (candidate !== word) return candidate;
  }
  return letters.join('');
}

class SpeedScrambleGame extends Game {
  constructor(options = {}) {
    super({ slug: 'speedscramble', name: 'Speed Scramble', minLength: 4, ...options });
    this.answer = '';
    this.scrambled = '';
    this.category = 'General';
    this.difficulty = DEFAULT_DIFFICULTY;
    this.timeLimit = DIFFICULTY[DEFAULT_DIFFICULTY].timerSeconds;
  }

  reset() {
    super.reset();
    if (this.scrambled !== undefined) {
      this.answer = '';
      this.scrambled = '';
      this.category = 'General';
      this.difficulty = DEFAULT_DIFFICULTY;
      this.timeLimit = DIFFICULTY[DEFAULT_DIFFICULTY].timerSeconds;
    }
  }

  /**
   * Build a round. `word` may be pinned (daily replay / streamer override);
   * otherwise one is drawn from the curated list, narrowed by difficulty and
   * optionally category.
   */
  newRound({ word = null, category = null, difficulty = null, timerSeconds = null, isDaily = false, dailyDate = null, puzzleId = null, ...rest } = {}) {
    const level = DIFFICULTY[difficulty] ? difficulty : DEFAULT_DIFFICULTY;
    const band = DIFFICULTY[level];

    let chosen;
    if (word && /^[a-z]+$/i.test(String(word).trim())) {
      chosen = { word: String(word).trim().toLowerCase(), cat: category || 'General', difficulty: level };
    } else {
      chosen = dictionary.randomTarget({
        difficulty: level,
        category,
        minLength: band.minLength,
        maxLength: band.maxLength,
      });
    }
    if (!chosen || !chosen.word) return { success: false, error: 'no_word' };

    // A pinned word still has to clear the blocklist - the streamer may have
    // pinned something before the policy existed.
    if (policy.isBlockedWord(chosen.word)) {
      chosen = dictionary.randomTarget({
        difficulty: level,
        category,
        minLength: band.minLength,
        maxLength: band.maxLength,
      });
      if (!chosen || !chosen.word || policy.isBlockedWord(chosen.word)) {
        return { success: false, error: 'no_word' };
      }
    }

    const seconds = Number(timerSeconds) || band.timerSeconds;

    this.loadRound({
      puzzle: { scrambled: null, length: chosen.word.length, category: chosen.cat },
      answers: [chosen.word],
      required: [chosen.word],
      isDaily,
      dailyDate,
      id: puzzleId,
      name: isDaily ? `Daily ${dailyDate}` : chosen.cat,
    });

    // After loadRound(), which resets round state.
    this.answer = chosen.word;
    this.scrambled = scrambleWord(chosen.word);
    this.category = chosen.cat;
    this.difficulty = level;
    this.timeLimit = seconds;
    this.puzzle = { scrambled: this.scrambled, length: this.answer.length, category: this.category };
    this.status = 'idle';
    return { success: true, scrambled: this.scrambled, length: this.answer.length, category: this.category, timerSeconds: seconds };
  }

  /** Start with the round's own time limit unless one is given explicitly. */
  start(timerSeconds = 0) {
    if (!this.answer) return { success: false, error: 'no_round' };
    const requested = Number(timerSeconds);
    const seconds = Number.isFinite(requested) && requested > 0 ? requested : this.timeLimit;
    const result = super.start(seconds);
    if (result.success) this.timeLimit = seconds;
    return result;
  }

  /** Any dictionary word of the right length is a real guess, like Wordle. */
  validate(word) {
    if (word.length !== this.answer.length) {
      return { ok: false, result: 'wrong_length', error: `Needs ${this.answer.length} letters` };
    }
    if (word !== this.answer && !dictionary.has(word)) {
      return { ok: false, result: 'not_a_word', error: 'Not in the word list' };
    }
    return { ok: true };
  }

  getState() {
    const base = super.getState();
    const solvedEntry = Object.values(this.foundWords).find((entry) => entry.word === this.answer);
    return {
      ...base,
      scrambled: this.scrambled,
      length: this.answer.length,
      category: this.category,
      difficulty: this.difficulty,
      timeLimit: this.timeLimit,
      solved: Boolean(solvedEntry),
      // The answer is only revealed once the round can no longer be won.
      answer: (this.status === 'ended' || solvedEntry) ? this.answer : undefined,
    };
  }

  getSerializableState() {
    return {
      ...super.getSerializableState(),
      answer: this.answer,
      scrambled: this.scrambled,
      category: this.category,
      difficulty: this.difficulty,
      timeLimit: this.timeLimit,
    };
  }

  restoreState(saved = {}) {
    super.restoreState(saved);
    this.answer = saved.answer || '';
    this.scrambled = saved.scrambled || (this.answer ? scrambleWord(this.answer) : '');
    this.category = saved.category || 'General';
    this.difficulty = saved.difficulty || DEFAULT_DIFFICULTY;
    this.timeLimit = saved.timeLimit || DIFFICULTY[this.difficulty].timerSeconds;
    return this;
  }
}

module.exports = { SpeedScrambleGame, scrambleWord, DIFFICULTY };
