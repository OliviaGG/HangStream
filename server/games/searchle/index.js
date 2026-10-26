// Searchle — server-authoritative round.
//
// Searchle is the odd one out among HangStream's games: it does not judge words
// by "is this the answer", it *ranks* a guess against a hidden target with an
// embedding model, and the player closes in over successive guesses. A full
// backend already exists under `server/searchle/` (ranking engine, plural and
// British-spelling normalizers, session store) and is wired to `/searchle/api/*`.
//
// This class does not duplicate any of that. It adapts the existing ranker into
// the shared engine so Searchle can join a room, take chat guesses and burn down
// the next-game vote's term exactly like the other games. The round semantics
// come from Word Tycoon's Searchle: 10 guesses, a win when the guess ranks #1,
// and points that fall off as the guess count grows.
//
// The ranker is async and may not be ready (the model is a ~1GB download), so
// `newRound` and `submitWord` both handle a MODEL_NOT_READY state by surfacing
// it rather than throwing. A round simply cannot start until the model exists.

const { Game } = require('../engine');

const MAX_GUESSES = 10;

// Points by how quickly the target was found, matching the ranker's own scale.
function pointsForGuess(guessNumber) {
  if (guessNumber <= 3) return 100;
  if (guessNumber <= 6) return 60;
  if (guessNumber <= 10) return 30;
  return 10;
}

class SearchleGame extends Game {
  constructor(options = {}) {
    super({ slug: 'searchle', name: 'Searchle', minLength: 3, ...options });
    this.ranker = options.ranker || require('../searchle/ranker');
    this.sessionId = null;
    this.guesses = []; // [{ word, rank, status, guessNumber, player }]
    this.guessedWords = new Set();
    this.bestRank = null;
    this.maxGuesses = MAX_GUESSES;
    this.won = false;
    this.target = null;
    this.modelError = null;
    this.hintsUsed = 0;
    this.maxHints = 3;
    // Guards against two chat lines racing an async submission.
    this.pendingGuesses = new Set();
  }

  reset() {
    super.reset();
    if (this.guesses !== undefined) {
      this.sessionId = null;
      this.guesses = [];
      this.guessedWords = new Set();
      this.bestRank = null;
      this.won = false;
      this.target = null;
      this.pendingGuesses = new Set();
      this.hintsUsed = 0;
    }
  }

  /** True when Searchle can actually run (embedding model present). */
  isReady() {
    try { return this.ranker.modelReady(); } catch (_) { return false; }
  }

  /**
   * Open a Searchle session. Searchle is a fixed-length round (10 guesses), so
   * `newRound` is synchronous in shape but the ranker underneath is not — it
   * returns the round info and lets the session id settle in the background.
   */
  newRound({ isDaily = false, dailyDate = null, puzzleId = null } = {}) {
    if (!this.isReady()) {
      this.modelError = 'Searchle is unavailable until its embedding model is built';
      return { success: false, error: 'MODEL_NOT_READY' };
    }
    this.modelError = null;

    // Searchle has no answer set to validate against; the ranker owns ranking.
    this.loadRound({
      puzzle: { maxGuesses: MAX_GUESSES, mode: 'rank' },
      answers: [],
      required: [],
      requireAll: false,
      isDaily,
      dailyDate,
      id: puzzleId,
      name: isDaily ? `Daily ${dailyDate}` : 'Random',
    });

    // After loadRound(), which resets round state.
    this.sessionId = null;
    this.guesses = [];
    this.guessedWords = new Set();
    this.bestRank = null;
    this.won = false;
    this.target = null;
    this.pendingGuesses = new Set();
    this.hintsUsed = 0;
    this.status = 'idle';

    // Fire-and-forget: the session id is only needed by the first guess, and
    // `createGame` also warms the ranking cache for the target.
    this.ranker.createGame().then((game) => {
      this.sessionId = game.gameId;
      this.emit('session-ready', { sessionId: this.sessionId });
    }).catch((err) => {
      this.modelError = err && err.message ? err.message : 'Searchle session failed';
      this.emit('session-failed', { error: this.modelError });
    });

    return { success: true, maxGuesses: MAX_GUESSES };
  }

  /** Fixed-length adapted round: "no_round" is a missing session, not answers. */
  start(timerSeconds = 0) {
    if (!this.isReady()) return { success: false, error: 'MODEL_NOT_READY' };
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

  /**
   * Judge a guess by rank. The engine's `submitWord` is synchronous and so is
   * the transport around it, but ranking is async — so `submitWord` is
   * intentionally *not* the entry point here. `submitGuessAsync` is, and
   * `registry.js` awaits it. `submitWord` remains for a synchronous caller and
   * reports that the guess is in flight.
   */
  submitWord() {
    return { accepted: false, result: 'async', error: 'Use submitGuessAsync for Searchle' };
  }

  /**
   * Rank a word against the hidden target. Returns the same result shape the
   * other games use, plus Searchle's rank fields.
   */
  async submitGuessAsync(rawWord, playerInfo = {}) {
    if (this.status !== 'active') {
      return { accepted: false, result: 'not_active', error: 'Round is not active' };
    }
    const word = String(rawWord || '').toLowerCase().trim();
    if (!/^[a-z]+$/.test(word)) {
      return { accepted: false, result: 'bad_request', error: 'Letters only' };
    }
    if (this.pendingGuesses.has(word)) {
      return { accepted: false, result: 'pending', word, error: 'Already being checked' };
    }
    if (this.guessedWords.has(word)) {
      return { accepted: false, result: 'already_guessed', word, error: 'Already guessed' };
    }
    if (this.guesses.length >= this.maxGuesses) {
      return { accepted: false, result: 'no_guesses_left', word, error: 'Out of guesses' };
    }
    if (!this.sessionId) {
      // The session opens asynchronously; a guess in the first moments waits.
      return { accepted: false, result: 'not_ready', word, error: 'Round is still opening' };
    }

    this.pendingGuesses.add(word);
    let verdict;
    try {
      verdict = await this.ranker.submitGuess(this.sessionId, word);
    } catch (err) {
      this.pendingGuesses.delete(word);
      return { accepted: false, result: 'error', word, error: err && err.message ? err.message : 'Ranking failed' };
    }
    this.pendingGuesses.delete(word);

    // Not a real word: reject without spending one of the 10 guesses.
    if (verdict.status === 'unknown' || verdict.status === 'invalid') {
      return { accepted: false, result: 'not_a_word', word, error: 'Not in the word list' };
    }
    // A blocked word is refused for the same reason, and without echoing it.
    if (verdict.status === 'blocked') {
      return { accepted: false, result: 'not_a_word', word, error: 'Not in the word list' };
    }
    if (verdict.status === 'duplicate') {
      this.guessedWords.add(word);
      return { accepted: false, result: 'already_guessed', word, error: 'Already guessed' };
    }

    const guessNumber = this.guesses.length + 1;
    const win = Boolean(verdict.win);
    const entry = {
      word,
      rank: verdict.rank,
      total: verdict.total,
      // 'ranked' = inside the model's pool, 'outside' = a real word but not
      // ranked (a long shot), which is genuinely useful feedback.
      status: verdict.status,
      guessNumber,
      win,
      player: playerInfo.displayName || playerInfo.username || 'viewer',
      playerKey: `${playerInfo.platform || 'web'}:${playerInfo.platformUserId || playerInfo.username}`,
      platform: playerInfo.platform || 'web',
      time: Date.now(),
    };

    this.guesses.push(entry);
    this.guessedWords.add(word);
    if (typeof verdict.rank === 'number' && (this.bestRank === null || verdict.rank < this.bestRank)) {
      this.bestRank = verdict.rank;
      entry.newBest = true;
    }

    if (win) {
      this.won = true;
      this.target = verdict.target || null;
      entry.score = pointsForGuess(guessNumber);
      // Searchle scores a solve like any other game: credit the player and
      // record the word so the shared leaderboard sees it.
      this.foundWords[word] = { ...entry, score: entry.score };
      this._creditPlayer(entry.playerKey, playerInfo, word, entry.score, false);
    } else {
      this.foundWords[word] = { ...entry, score: 0 };
    }

    this.wordHistory.unshift(entry);
    if (this.wordHistory.length > 200) this.wordHistory.length = 200;

    this.emit('guess', entry);

    const exhausted = !win && this.guesses.length >= this.maxGuesses;
    if ((win || exhausted) && !this.completionEmitted) {
      this.completionEmitted = true;
      setImmediate(() => { try { this.emit('round-complete', this.getState()); } catch (_) {} });
    }

    return {
      accepted: true,
      result: win ? 'correct' : 'guessed',
      word,
      rank: verdict.rank,
      total: verdict.total,
      status: verdict.status,
      guessNumber,
      win,
      remaining: this.maxGuesses - this.guesses.length,
      points: win ? pointsForGuess(guessNumber) : 0,
      // The target only becomes public once the round can no longer be won.
      answer: (win || exhausted) ? this.target : undefined,
    };
  }

  /** Reveal a word with better ranking (donor perk). */
  async revealHint(playerInfo = {}) {
    if (this.status !== 'active') {
      return { accepted: false, result: 'not_active', error: 'Round is not active' };
    }
    if (!this.isReady()) {
      return { accepted: false, result: 'not_ready', error: 'Searchle model not ready' };
    }
    if (!this.sessionId) {
      return { accepted: false, result: 'not_ready', error: 'Round is still opening' };
    }

    // Check hint limit
    if (this.hintsUsed >= this.maxHints) {
      return { accepted: false, result: 'hint_limit_reached', error: `You have used all ${this.maxHints} hints for this round` };
    }

    // For Searchle, we'll return a placeholder - the actual implementation
    // would need the ranker to support hint generation
    // For now, we'll suggest they use the existing best rank info
    this.hintsUsed++;
    
    const entry = {
      type: 'hint',
      message: 'Try words related to the same topic as your best guess',
      bestRank: this.bestRank,
      player: playerInfo.displayName || playerInfo.username || 'viewer',
      platform: playerInfo.platform || 'web',
      hintsUsed: this.hintsUsed,
      maxHints: this.maxHints,
      time: Date.now(),
    };
    this.wordHistory.unshift(entry);
    if (this.wordHistory.length > 200) this.wordHistory.length = 200;

    this.emit('guess', entry);

    return { 
      accepted: true, 
      result: 'hint_revealed', 
      hint: 'Try words related to the same topic as your best guess',
      bestRank: this.bestRank,
      hintsUsed: this.hintsUsed,
      maxHints: this.maxHints
    };
  }

  getState() {
    const base = super.getState();
    return {
      ...base,
      maxGuesses: this.maxGuesses,
      guesses: this.guesses.slice(-this.maxGuesses),
      guessesUsed: this.guesses.length,
      bestRank: this.bestRank,
      total: this.guesses.length ? this.guesses[this.guesses.length - 1].total : null,
      won: this.won,
      ready: this.isReady(),
      error: this.modelError,
      // Never expose the target while the round is still winnable.
      answer: (this.won || this.status === 'ended') ? this.target : undefined,
    };
  }

  getSerializableState() {
    return {
      ...super.getSerializableState(),
      sessionId: this.sessionId,
      guesses: this.guesses,
      guessedWords: Array.from(this.guessedWords || []),
      bestRank: this.bestRank,
      maxGuesses: this.maxGuesses,
      won: this.won,
      target: this.target,
      modelError: this.modelError,
    };
  }

  restoreState(saved = {}) {
    super.restoreState(saved);
    this.sessionId = saved.sessionId || null;
    this.guesses = saved.guesses || [];
    this.guessedWords = new Set(saved.guessedWords || this.guesses.map((g) => g.word));
    this.bestRank = saved.bestRank === undefined ? null : saved.bestRank;
    this.maxGuesses = saved.maxGuesses || MAX_GUESSES;
    this.won = Boolean(saved.won);
    this.target = saved.target || null;
    this.modelError = saved.modelError || null;
    this.pendingGuesses = new Set();
    return this;
  }
}

module.exports = { SearchleGame, pointsForGuess, MAX_GUESSES };
