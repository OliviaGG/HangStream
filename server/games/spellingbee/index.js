// Spelling Bee — server-authoritative round.
//
// Direct port of the rules from word-tycoon-ecosystem spellingbee/src/game.js
// (MIT): a 7-letter set with a mandatory center letter, answers classified into
// common / rare / hidden, pangrams worth a bonus, completion when every answer
// is found. HangStream's client used to do all of this in the browser; now the
// server owns the letterset, the answer set and the scores.

const { Game } = require('../engine');
const dictionary = require('../dictionary');

const DEFAULT_MIN_ANSWERS = 12;

class SpellingBeeGame extends Game {
  constructor(options = {}) {
    super({ slug: 'spellingbee', name: 'Spelling Bee', minLength: 4, ...options });
    this.letters = [];
    this.centerLetter = '';
    this.pangramSet = new Set();
  }

  reset() {
    super.reset();
    if (this.letters) this.letters = [];
  }

  /**
   * Build (or accept) a round. `letters` + `centerLetter` may be supplied to
   * replay a specific daily puzzle; otherwise one is generated from the
   * dictionary.
   */
  newRound({ letters = null, centerLetter = null, isDaily = false, dailyDate = null, puzzleId = null } = {}) {
    let round;
    if (Array.isArray(letters) && letters.length === 7 && centerLetter) {
      const normalized = letters.map((l) => String(l).toLowerCase());
      const center = String(centerLetter).toLowerCase();
      const answers = dictionary.wordsFromLetters(new Set(normalized), { requiredLetter: center, minLength: 4 });
      if (answers.length === 0) return { success: false, error: 'empty_puzzle' };
      const rarity = new Map();
      for (const word of answers) rarity.set(word, dictionary.tierFor(word));
      round = {
        puzzle: { letters: normalized, centerLetter: center },
        answers,
        required: answers,
        rarity,
      };
    } else {
      round = dictionary.buildBeeRound({ minAnswers: DEFAULT_MIN_ANSWERS });
      if (!round) return { success: false, error: 'no_puzzle' };
    }

    // loadRound() resets round state, so it must run before the bee-specific
    // fields (letters / center / pangram set) are stored.
    this.loadRound({
      puzzle: {
        letters: round.puzzle.letters,
        centerLetter: round.puzzle.centerLetter,
        pangramCount: round.answers.filter((w) => new Set(w.split('')).size === 7).length,
      },
      answers: round.answers,
      required: round.required,
      rarity: round.rarity,
      isDaily,
      dailyDate,
      id: puzzleId,
      name: isDaily ? `Daily ${dailyDate}` : 'Random',
    });
    this.letters = round.puzzle.letters.slice();
    this.centerLetter = round.puzzle.centerLetter;
    this.pangramSet = new Set(round.answers.filter((w) => new Set(w.split('')).size === 7));
    this.splitCounts = {
      common: round.answers.filter((w) => round.rarity.get(w) === 'common').length,
      rare: round.answers.filter((w) => round.rarity.get(w) === 'rare').length,
      hidden: round.answers.filter((w) => round.rarity.get(w) === 'hidden').length,
    };
    return { success: true, ...round.puzzle };
  }

  /** A bee guess must only use the round's letters and include the center. */
  validate(word) {
    const allowed = new Set(this.letters);
    for (const ch of word) {
      if (!allowed.has(ch)) return { ok: false, result: 'invalid_letter', error: 'Uses letters not in the hive' };
    }
    if (!word.includes(this.centerLetter)) {
      return { ok: false, result: 'missing_center', error: 'Must use the center letter' };
    }
    return super.validate(word);
  }

  _isPangram(word) { return this.pangramSet.has(word); }

  getState() {
    const base = super.getState();
    const pangramsFound = Object.keys(this.foundWords).filter((w) => this.pangramSet.has(w));
    return {
      ...base,
      letters: this.letters,
      centerLetter: this.centerLetter,
      pangramCount: this.pangramSet.size,
      pangramsFound,
      counts: this.splitCounts || { common: 0, rare: 0, hidden: 0 },
    };
  }

  getSerializableState() {
    return { ...super.getSerializableState(), letters: this.letters, centerLetter: this.centerLetter, splitCounts: this.splitCounts };
  }

  restoreState(saved = {}) {
    super.restoreState(saved);
    this.letters = saved.letters || (this.puzzle && this.puzzle.letters) || [];
    this.centerLetter = saved.centerLetter || (this.puzzle && this.puzzle.centerLetter) || '';
    this.pangramSet = new Set(this.answers.filter((w) => new Set(w.split('')).size === 7));
    this.splitCounts = saved.splitCounts || this.splitCounts;
    return this;
  }
}

module.exports = { SpellingBeeGame };
