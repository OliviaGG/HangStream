// Hangman — server-authoritative round.
//
// The last HangStream game whose rules lived in the browser: `public/index.html`
// kept the word, the revealed letters and the wrong-guess count in local state
// and simply told everyone else over the socket. Here the word, the reveal
// board and the strikes are all server-side, so a chat guess and a page guess
// are judged identically and the answer can never be read out of the client.
//
// Hangman is *letter*-based, not word-based, which is the one place it diverges
// from the engine's word-submitting shape. The engine's `submitWord` collects
// completed words and scores them, so this class keeps that contract intact
// (most games in the registry share it) but adds `guessLetter` as its real
// input path, plus a `submitWord` override that treats a full-word message as a
// whole-word solve attempt — which is exactly what chat naturally sends.

const { Game } = require('../engine');
const dictionary = require('../dictionary');
const policy = require('../word-policy');

const MAX_WRONG = 6;
const DEFAULT_DIFFICULTY = 'medium';

/**
 * Difficulty → letter budget and word length band, mirroring the ranges the
 * Hangman page used so the slider keeps meaning the same thing.
 */
const DIFFICULTY = {
  easy: { maxWrong: 6, minLength: 4, maxLength: 6 },
  medium: { maxWrong: 6, minLength: 5, maxLength: 8 },
  hard: { maxWrong: 6, minLength: 8, maxLength: 20 },
};

class HangmanGame extends Game {
  constructor(options = {}) {
    // minLength 1: the letter path does its own length checks, and a single
    // letter guess must not be rejected by the engine's word-length floor.
    super({ slug: 'hangman', name: 'Hangman', minLength: 1, ...options });
    this.word = '';
    this.category = 'General';
    this.difficulty = DEFAULT_DIFFICULTY;
    this.maxWrong = MAX_WRONG;
    this.revealed = new Set(); // letters the round has revealed
    this.guessedLetters = new Set(); // every letter anybody has tried
    this.wrongLetters = [];
    this.wrongCount = 0;
    this.solved = false;
  }

  reset() {
    super.reset();
    // `reset()` runs from the base constructor before these exist, so guard.
    if (this.guessedLetters) {
      this.word = '';
      this.category = 'General';
      this.difficulty = DEFAULT_DIFFICULTY;
      this.revealed = new Set();
      this.guessedLetters = new Set();
      this.wrongLetters = [];
      this.wrongCount = 0;
      this.solved = false;
    }
  }

  /**
   * Build a round. `word` may be supplied (the streamer pinning a word, or the
   * daily puzzle replaying); otherwise one is drawn from the curated list the
   * Hangman page already ships.
   */
  newRound({ word = null, category = null, difficulty = null, isDaily = false, dailyDate = null, puzzleId = null } = {}) {
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

    // Hangman has no answer set — every letter is guessable but only the word's
    // own letters score. `requireAll: false` keeps the engine from demanding an
    // answer-set completion.
    this.loadRound({
      puzzle: {
        length: chosen.word.length,
        category: chosen.cat,
        difficulty: level,
        maxWrong: band.maxWrong,
        // The masked board, so a client can render without the answer.
        pattern: chosen.word.split('').map(() => null),
      },
      answers: [],
      required: [],
      requireAll: false,
      isDaily,
      dailyDate,
      id: puzzleId,
      name: isDaily ? `Daily ${dailyDate}` : chosen.cat,
    });

    // loadRound() reset round state, so the word-owning fields come after.
    this.word = chosen.word;
    this.category = chosen.cat;
    this.difficulty = level;
    this.maxWrong = band.maxWrong;
    this.revealed = new Set();
    this.guessedLetters = new Set();
    this.wrongLetters = [];
    this.wrongCount = 0;
    this.solved = false;
    this.status = 'idle';
    // The answer is stored on `foundWords`-adjacent state only for the server;
    // `getState` masks it, so this never leaves the process.
    return { success: true, length: this.word.length, category: this.category, difficulty: level };
  }

  /** Hangman is word-driven, so bypass the base "must have answers" gate. */
  start(timerSeconds = 0) {
    if (!this.word) return { success: false, error: 'no_round' };
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

  /** The masked board: revealed letters, null for everything still hidden. */
  mask() {
    return this.word.split('').map((ch) => (this.revealed.has(ch) ? ch : null));
  }

  /** A letter guess from a page or chat. */
  guessLetter(rawLetter, playerInfo = {}) {
    if (this.status !== 'active') {
      return { accepted: false, result: 'not_active', error: 'Round is not active' };
    }
    const letter = String(rawLetter || '').trim().toLowerCase();
    if (!/^[a-z]$/.test(letter)) {
      return { accepted: false, result: 'bad_request', error: 'Guess a single letter' };
    }
    if (this.guessedLetters.has(letter)) {
      return { accepted: false, result: 'already_guessed', letter, error: 'Already guessed' };
    }

    this.guessedLetters.add(letter);
    const hit = this.word.includes(letter);
    if (hit) {
      this.revealed.add(letter);
    } else {
      this.wrongCount++;
      this.wrongLetters.push(letter);
    }

    // Letter guesses are not words, so they bypass the engine's scoring — the
    // solve itself is what awards points (see `_creditSolve`).
    const entry = {
      type: 'letter',
      letter,
      hit,
      player: playerInfo.displayName || playerInfo.username || 'viewer',
      platform: playerInfo.platform || 'web',
      wrongCount: this.wrongCount,
      maxWrong: this.maxWrong,
      time: Date.now(),
    };
    this.wordHistory.unshift(entry);
    if (this.wordHistory.length > 200) this.wordHistory.length = 200;

    this.emit('letter-guess', { ...entry, mask: this.mask() });

    const complete = this.mask().every(Boolean);
    if (complete && !this.completionEmitted) {
      this.solved = true;
      this._creditSolve(playerInfo);
      this.completionEmitted = true;
      setImmediate(() => { try { this.emit('round-complete', this.getState()); } catch (_) {} });
    }

    return { accepted: true, result: hit ? 'correct' : 'incorrect', letter, hit, mask: this.mask(), wrongCount: this.wrongCount };
  }

  /**
   * A whole-word guess. Chat naturally sends complete words, and the Hangman
   * page's keyboard only sends letters — both funnel through here.
   */
  submitWord(word, playerInfo) {
    if (this.status !== 'active') {
      return { accepted: false, result: 'not_active', error: 'Round is not active' };
    }
    if (typeof word !== 'string' || !playerInfo || typeof playerInfo !== 'object') {
      return { accepted: false, result: 'bad_request', error: 'Invalid guess' };
    }
    const normalized = word.toLowerCase().trim();

    // A single letter is a letter guess, not a word guess.
    if (normalized.length === 1) return this.guessLetter(normalized, playerInfo);

    // A blocked word is refused outright and never echoed back.
    if (!policy.isWordAllowedForGame('hangman', 'guess', normalized)) {
      return { accepted: false, result: 'blocked', error: 'Not the word' };
    }

    // "I know the answer" — a full-word guess. Only the exact word counts;
    // anything else is a miss but does not consume a strike (matching the
    // page's behaviour, where the keyboard is the strike mechanism).
    if (normalized !== this.word) {
      return { accepted: false, result: 'incorrect', word: normalized, error: 'Not the word' };
    }

    for (const ch of this.word) this.revealed.add(ch);
    const alreadySolved = this.solved;
    this.solved = true;
    if (!alreadySolved) this._creditSolve(playerInfo, 1.5);
    this.completionEmitted = true;
    setImmediate(() => { try { this.emit('round-complete', this.getState()); } catch (_) {} });
    return { accepted: true, result: 'correct', word: normalized, win: true, mask: this.mask() };
  }

  /** Solving is the only scoring action; fewer strikes is worth more. */
  _creditSolve(playerInfo, multiplier = 1) {
    const remaining = Math.max(0, this.maxWrong - this.wrongCount);
    const score = Math.round((100 + remaining * 50) * multiplier);
    const key = `${playerInfo.platform || 'web'}:${playerInfo.platformUserId || playerInfo.username}`;
    this._creditPlayer(key, playerInfo, this.word, score, false);
    // Keep `foundWords` consistent with the other games for leaderboards.
    this.foundWords[this.word] = {
      word: this.word,
      player: playerInfo.displayName || playerInfo.username || 'viewer',
      playerKey: key,
      platform: playerInfo.platform || 'web',
      score,
      tier: 'common',
      isPangram: false,
      solved: true,
      time: Date.now(),
    };
    this.emit('word-found', this.foundWords[this.word]);
  }

  getState() {
    const base = super.getState();
    return {
      ...base,
      // Note: `word` is deliberately absent — clients get the masked board.
      mask: this.mask(),
      length: this.word.length,
      category: this.category,
      difficulty: this.difficulty,
      revealed: Array.from(this.revealed),
      guessedLetters: Array.from(this.guessedLetters),
      wrongLetters: this.wrongLetters.slice(),
      wrongCount: this.wrongCount,
      maxWrong: this.maxWrong,
      solved: this.solved,
      // `puzzle.answerLength` is safe; `puzzle.answer` is not, and is never set.
    };
  }

  getSerializableState() {
    return {
      ...super.getSerializableState(),
      word: this.word,
      category: this.category,
      difficulty: this.difficulty,
      maxWrong: this.maxWrong,
      revealed: Array.from(this.revealed),
      guessedLetters: Array.from(this.guessedLetters),
      wrongLetters: this.wrongLetters,
      wrongCount: this.wrongCount,
      solved: this.solved,
    };
  }

  restoreState(saved = {}) {
    super.restoreState(saved);
    this.word = saved.word || '';
    this.category = saved.category || 'General';
    this.difficulty = saved.difficulty || DEFAULT_DIFFICULTY;
    this.maxWrong = saved.maxWrong || MAX_WRONG;
    this.revealed = new Set(saved.revealed || []);
    this.guessedLetters = new Set(saved.guessedLetters || []);
    this.wrongLetters = saved.wrongLetters || [];
    this.wrongCount = saved.wrongCount || 0;
    this.solved = Boolean(saved.solved);
    return this;
  }
}

module.exports = { HangmanGame, DIFFICULTY, MAX_WRONG };
