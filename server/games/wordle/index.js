// Wordle — server-authoritative round.
//
// HangStream already ships a 5-letter list (public/wordle-words.js) and a
// client-only board. Here the secret word, the guesses and the colour feedback
// all live on the server (word-tycoon-ecosystem wordle follows the same
// shape), so chat and page guesses are judged identically and the answer can
// never be read out of the client bundle.

const { Game } = require('../engine');
const dictionary = require('../dictionary');

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;

/** Classic Wordle feedback: 'correct' | 'present' | 'absent' per letter. */
function evaluateGuess(guess, answer) {
  const g = guess.split('');
  const a = answer.split('');
  const result = new Array(g.length).fill('absent');
  const remaining = {};

  for (let i = 0; i < g.length; i++) {
    if (g[i] === a[i]) result[i] = 'correct';
    else remaining[a[i]] = (remaining[a[i]] || 0) + 1;
  }
  for (let i = 0; i < g.length; i++) {
    if (result[i] === 'correct') continue;
    if (remaining[g[i]] > 0) { result[i] = 'present'; remaining[g[i]]--; }
  }
  return result;
}

class WordleGame extends Game {
  constructor(options = {}) {
    super({ slug: 'wordle', name: 'Wordle', minLength: WORD_LENGTH, ...options });
    this.answer = '';
    this.guesses = []; // newest-last: { word, player, feedback, time }
    this.guessedWords = new Set();
    this.maxGuesses = MAX_GUESSES;
    this.hintsUsed = 0;
    this.maxHints = 3;
  }

  reset() {
    super.reset();
    if (this.guesses) {
      this.answer = '';
      this.guesses = [];
      this.guessedWords = new Set();
      this.hintsUsed = 0;
    }
  }

  newRound({ word = null, isDaily = false, dailyDate = null, puzzleId = null } = {}) {
    let answer = word ? String(word).toLowerCase() : null;
    if (!answer || answer.length !== WORD_LENGTH || !dictionary.has(answer)) {
      answer = dictionary.randomWord(WORD_LENGTH);
    }
    if (!answer) return { success: false, error: 'no_word' };

    // Wordle is length-driven, not answer-set-driven: any dictionary word of the
    // right length is an acceptable guess. loadRound() resets round state, so it
    // must run before we store the answer and guess history.
    this.loadRound({
      puzzle: { length: WORD_LENGTH, maxGuesses: MAX_GUESSES },
      answers: [],
      required: [],
      requireAll: false,
      isDaily,
      dailyDate,
      id: puzzleId,
      name: isDaily ? `Daily ${dailyDate}` : 'Random',
    });
    this.answer = answer;
    this.guesses = [];
    this.guessedWords = new Set();
    this.hintsUsed = 0;
    this.status = 'idle';
    return { success: true, length: WORD_LENGTH };
  }

  /** Wordle has no answer set, so bypass the base "must have answers" gate. */
  start(timerSeconds = 0) {
    if (!this.answer) return { success: false, error: 'no_round' };
    const duration = Number(timerSeconds) || 0;
    if (!Number.isFinite(duration) || duration < 0 || duration > 86400) {
      return { success: false, error: 'invalid_timer' };
    }
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    delete this._remainingAtPause;

    this.status = 'active';
    this.startTime = Date.now();
    this.endTime = null;
    this.timerDuration = duration;
    if (duration > 0) {
      this.endTime = this.startTime + duration * 1000;
      this._armTimer();
    }
    this.emit('game-started', this.getState());
    return { success: true };
  }

  /** Guesses must be real 5-letter dictionary words (unless it's the answer). */
  validate(word) {
    if (word.length !== WORD_LENGTH) {
      return { ok: false, result: 'wrong_length', error: `Needs ${WORD_LENGTH} letters` };
    }
    if (!dictionary.has(word)) {
      return { ok: false, result: 'not_a_word', error: 'Not in the word list' };
    }
    return { ok: true };
  }

  /** Accepts guesses, returns per-letter feedback; wins when answer is exact. */
  submitWord(word, playerInfo) {
    if (this.status !== 'active') {
      return { accepted: false, result: 'not_active', error: 'Round is not active' };
    }
    if (typeof word !== 'string' || !playerInfo || typeof playerInfo !== 'object') {
      return { accepted: false, result: 'bad_request', error: 'Invalid guess' };
    }

    const normalized = word.toLowerCase().trim();
    if (normalized.length !== WORD_LENGTH) {
      return { accepted: false, result: 'wrong_length', word: normalized, error: `Needs ${WORD_LENGTH} letters` };
    }
    if (this.guessedWords.has(normalized)) {
      return { accepted: false, result: 'already_guessed', word: normalized, error: 'Already guessed' };
    }
    if (normalized !== this.answer && !dictionary.has(normalized)) {
      return { accepted: false, result: 'not_a_word', word: normalized, error: 'Not in the word list' };
    }

    const feedback = evaluateGuess(normalized, this.answer);
    const win = normalized === this.answer;
    const entry = {
      word: normalized,
      player: playerInfo.displayName || playerInfo.username || 'viewer',
      platform: playerInfo.platform || 'web',
      feedback,
      win,
      time: Date.now(),
    };
    this.guesses.push(entry);
    this.guessedWords.add(normalized);
    this.foundWords[normalized] = { ...entry, score: win ? 100 : 0 };
    this.wordHistory.unshift(entry);
    if (this.wordHistory.length > 200) this.wordHistory.length = 200;

    if (win) {
      this._creditPlayer(`${playerInfo.platform || 'web'}:${playerInfo.platformUserId || playerInfo.username}`, playerInfo, normalized, 100, false);
    }

    this.emit('guess', entry);

    const solved = win;
    const exhausted = !solved && this.guesses.length >= this.maxGuesses;
    if ((solved || exhausted) && !this.completionEmitted) {
      this.completionEmitted = true;
      setImmediate(() => { try { this.emit('round-complete', this.getState()); } catch (_) {} });
    }

    return {
      accepted: true,
      result: solved ? 'correct' : 'guessed',
      word: normalized,
      feedback,
      win: solved,
      remaining: this.maxGuesses - this.guesses.length,
      answer: (solved || exhausted) ? this.answer : undefined,
    };
  }

  /** Reveal a letter in the correct position (donor perk). */
  revealHint(playerInfo = {}) {
    if (this.status !== 'active') {
      return { accepted: false, result: 'not_active', error: 'Round is not active' };
    }

    // Check hint limit
    if (this.hintsUsed >= this.maxHints) {
      return { accepted: false, result: 'hint_limit_reached', error: `You have used all ${this.maxHints} hints for this round` };
    }

    // Find unrevealed positions (where we haven't guessed the correct letter yet)
    const answer = this.answer.split('');
    const unrevealedPositions = [];
    
    for (let i = 0; i < answer.length; i++) {
      let revealed = false;
      // Check if this position has been revealed in any guess
      for (const guess of this.guesses) {
        if (guess.feedback[i] === 'correct') {
          revealed = true;
          break;
        }
      }
      if (!revealed) {
        unrevealedPositions.push(i);
      }
    }

    if (unrevealedPositions.length === 0) {
      return { accepted: false, result: 'no_hint', error: 'All positions already revealed' };
    }

    // Pick a random unrevealed position
    const randomIndex = Math.floor(Math.random() * unrevealedPositions.length);
    const position = unrevealedPositions[randomIndex];
    const letter = answer[position];

    // Increment hint counter
    this.hintsUsed++;

    // Create a hint entry showing which letter is correct at which position
    const entry = {
      type: 'hint',
      position,
      letter,
      player: playerInfo.displayName || playerInfo.username || 'viewer',
      platform: playerInfo.platform || 'web',
      hintsUsed: this.hintsUsed,
      maxHints: this.maxHints,
      time: Date.now(),
    };
    this.wordHistory.unshift(entry);
    if (this.wordHistory.length > 200) this.wordHistory.length = 200;

    this.emit('guess', entry);

    return { accepted: true, result: 'hint_revealed', position, letter, hint: `Position ${position + 1} is "${letter}"`, hintsUsed: this.hintsUsed, maxHints: this.maxHints };
  }

  getState() {
    const base = super.getState();
    return {
      ...base,
      length: WORD_LENGTH,
      maxGuesses: this.maxGuesses,
      guesses: this.guesses.slice(-this.maxGuesses),
      guessesUsed: this.guesses.length,
      solved: Object.keys(this.foundWords).some((w) => this.foundWords[w].win),
    };
  }

  getSerializableState() {
    return {
      ...super.getSerializableState(),
      answer: this.answer,
      guesses: this.guesses,
      guessedWords: Array.from(this.guessedWords || []),
    };
  }

  restoreState(saved = {}) {
    super.restoreState(saved);
    this.answer = saved.answer || '';
    this.guesses = saved.guesses || [];
    this.guessedWords = new Set(saved.guessedWords || this.guesses.map((g) => g.word));
    this.maxGuesses = saved.maxGuesses || MAX_GUESSES;
    return this;
  }
}

module.exports = { WordleGame, evaluateGuess, WORD_LENGTH, MAX_GUESSES };
