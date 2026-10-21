// Shared server-authoritative game engine.
//
// Ported from the word-tycoon-ecosystem backend (MIT) — the `Game`
// EventEmitter pattern used by every game server there (spellingbee/src/game.js,
// rectangled/src/game.js, ...). HangStream historically parsed guesses in the
// browser; this class moves the rules, scoring and round lifecycle onto the
// server so chat and page guesses share one source of truth.
//
// Nothing here knows about HTTP, WebSockets, chat or the database — a Game is
// pure rules + state + events. `registry.js` owns the transport wiring.

const EventEmitter = require('events');
const policy = require('./word-policy');

// English letter rarity tiers (word-tycoon-ecosystem spellingbee/src/game.js).
const LETTER_RARITY = {
  e: 0, t: 0, a: 0, o: 0, i: 0, n: 0, s: 0, h: 0, r: 0,
  d: 15, l: 15, c: 30, u: 30, m: 30, w: 30, f: 30,
  g: 60, y: 60, p: 60, b: 105, v: 105, k: 105,
  j: 180, x: 180, q: 300, z: 300,
};

// Extra points by word length, on top of the base word value.
const WORD_LENGTH_BONUS = { 4: 75, 5: 150, 6: 300, 7: 500, 8: 800, 9: 1200, 10: 1750, 11: 2500 };

const MAX_TIMER_SECONDS = 86400;
const MAX_WORD_LENGTH = 128;

/**
 * Full point value for a found word: base value by word tier, plus per-letter
 * rarity, plus a length bonus, plus a pangram bonus.
 */
function scoreWordFull(word, { isRare = false, isHidden = false, isThreeLetter = false, isPangram = false } = {}) {
  let base = isThreeLetter ? 100 : (isHidden ? 1500 : (isRare ? 1000 : 500));
  const lower = String(word || '').toLowerCase();
  for (const ch of lower) base += (LETTER_RARITY[ch] || 0);
  const len = lower.length;
  if (len >= 12) base += 3500;
  else if (len >= 4) base += (WORD_LENGTH_BONUS[len] || 0);
  if (isPangram) base += 1000;
  return base;
}

/** Stable key for a player across platforms: platform:id, or username fallback. */
function playerKeyFor(playerInfo = {}) {
  const platform = playerInfo.platform || 'web';
  const id = playerInfo.platformUserId || playerInfo.username;
  return `${platform}:${id}`;
}

class Game extends EventEmitter {
  constructor(options = {}) {
    super();
    this.slug = options.slug || 'game';
    this.name = options.name || this.slug;
    // Minimum letters required for a guess, per game (e.g. 3 for bee, 5 for wordle).
    this.minLength = options.minLength || 3;
    this.reset();
  }

  /** Clears round state back to `idle` without touching game identity. */
  reset() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    delete this._remainingAtPause;

    this.status = 'idle'; // idle | active | paused | ended
    this.startTime = null;
    this.endTime = null;
    this.timerDuration = 0; // seconds; 0 = untimed
    this.timerInterval = null;

    // Round puzzle definition — set by subclasses via `loadRound`.
    this.puzzle = null;
    this.puzzleId = null;
    this.puzzleName = null;
    this.isDaily = false;
    this.dailyDate = null;

    // Accepted answers for this round, plus the subclasses' notion of a subset
    // that must all be found before the round completes.
    this.answers = [];
    this.requiredAnswers = [];
    this.rarity = new Map(); // word -> 'common' | 'rare' | 'hidden'

    this.foundWords = {}; // word -> { player, playerKey, platform, favorite..., score, time }
    this.players = {}; // playerKey -> { username, displayName, platform, score, words[] }
    this.wordHistory = []; // newest-first feed
    this.foundRequiredCount = 0;
    this.completionEmitted = false;
  }

  /**
   * Load a round's puzzle without starting it.
   * @param {object} round
   * @param {string[]} round.answers     every acceptable word
   * @param {string[]} [round.required]  words that must all be found to complete
   * @param {Map<string,string>} [round.rarity]  word -> tier ('common'|'rare'|'hidden')
   */
  loadRound(round = {}) {
    this.reset();
    this.answers = (round.answers || []).map((w) => String(w).toLowerCase());
    this.requiredAnswers = (round.required || (round.requireAll === false ? [] : this.answers))
      .map((w) => String(w).toLowerCase());
    this.rarity = round.rarity instanceof Map ? round.rarity : new Map();
    this.puzzle = round.puzzle || null;
    this.puzzleId = round.id || null;
    this.puzzleName = round.name || null;
    this.isDaily = Boolean(round.isDaily);
    this.dailyDate = round.dailyDate || null;
    this.answerSet = new Set(this.answers);
    this.requiredSet = new Set(this.requiredAnswers);
    this.emit('round-loaded', this.getState());
    return this;
  }

  /** Start the round, optionally with a countdown in seconds. */
  start(timerSeconds = 0) {
    if (!this.answers.length) return { success: false, error: 'no_round' };
    const duration = Number(timerSeconds) || 0;
    if (!Number.isFinite(duration) || duration < 0 || duration > MAX_TIMER_SECONDS) {
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

  pause() {
    if (this.status !== 'active') return { success: false, error: 'not_active' };
    this.status = 'paused';
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
      this._remainingAtPause = Math.max(0, (this.endTime || 0) - Date.now());
    }
    this.emit('game-paused', this.getState());
    return { success: true };
  }

  resume() {
    if (this.status !== 'paused') return { success: false, error: 'not_paused' };
    this.status = 'active';
    if (Number.isFinite(this._remainingAtPause) && this._remainingAtPause >= 0) {
      if (this._remainingAtPause === 0) {
        delete this._remainingAtPause;
        this.end();
        return { success: true };
      }
      this.endTime = Date.now() + this._remainingAtPause;
      this._armTimer();
      delete this._remainingAtPause;
    }
    this.emit('game-resumed', this.getState());
    return { success: true };
  }

  end() {
    if (this.status === 'ended') return { success: false, error: 'already_ended' };
    this.status = 'ended';
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
    this.emit('game-ended', this.getState());
    return { success: true };
  }

  /**
   * Validate a guess against the round. Subclasses may override `validate` to
   * add rules (e.g. "must use the center letter", "must be adjacent on a grid").
   */
  validate(word) {
    if (!this.answerSet || !this.answerSet.has(word)) {
      return { ok: false, result: 'incorrect', error: 'not a valid word' };
    }
    return { ok: true };
  }

  /**
   * Submit a word from a player (chat or page). Returns a result descriptor the
   * transport layer can send straight back to the client.
   */
  submitWord(word, playerInfo) {
    if (this.status !== 'active') {
      return { accepted: false, result: 'not_active', error: 'Round is not active' };
    }
    if (typeof word !== 'string' || word.length > MAX_WORD_LENGTH || !playerInfo || typeof playerInfo !== 'object') {
      return { accepted: false, result: 'bad_request', error: 'Invalid guess' };
    }

    const normalized = word.toLowerCase().trim();
    if (normalized.length < this.minLength) {
      return { accepted: false, result: 'too_short', word: normalized, error: `Needs ${this.minLength}+ letters` };
    }

    // A blocked word is refused outright and never echoed back, so it cannot
    // reach a scoreboard, a feed or the overlay.
    if (!policy.isWordAllowedForGame(this.slug, 'guess', normalized)) {
      return { accepted: false, result: 'blocked', error: 'Not a valid word' };
    }

    const check = this.validate(normalized);
    if (!check.ok) {
      return { accepted: false, result: check.result || 'incorrect', word: normalized, error: check.error || 'Not a valid word' };
    }

    if (this.foundWords[normalized]) {
      return { accepted: false, result: 'already_found', word: normalized, error: 'Already found' };
    }

    const tier = this.rarity.get(normalized) || 'common';
    const isPangram = this._isPangram(normalized);
    const score = scoreWordFull(normalized, {
      isRare: tier === 'rare',
      isHidden: tier === 'hidden',
      isThreeLetter: normalized.length === 3,
      isPangram,
    });

    const key = playerKeyFor(playerInfo);
    const entry = {
      word: normalized,
      player: playerInfo.displayName || playerInfo.username || 'viewer',
      playerKey: key,
      platform: playerInfo.platform || 'web',
      platformUserId: playerInfo.platformUserId || playerInfo.username || null,
      score,
      tier: normalized.length === 3 ? 'three' : tier,
      isPangram,
      time: Date.now(),
    };

    this.foundWords[normalized] = entry;
    this._creditPlayer(key, playerInfo, normalized, score, isPangram);
    this.wordHistory.unshift(entry);
    if (this.wordHistory.length > 200) this.wordHistory.length = 200;

    if (this.requiredSet.has(normalized)) this.foundRequiredCount++;

    if (!this.completionEmitted && this.requiredAnswers.length > 0 && this.foundRequiredCount >= this.requiredAnswers.length) {
      // Defer so listeners receive the word events before the completion event.
      this.completionEmitted = true;
      setImmediate(() => { try { this.emit('round-complete', this.getState()); } catch (_) {} });
    }

    this.emit('word-found', entry);
    return { accepted: true, result: 'correct', ...entry };
  }

  _creditPlayer(key, playerInfo, word, score, isPangram) {
    if (!this.players[key]) {
      this.players[key] = {
        username: playerInfo.username || playerInfo.displayName || 'viewer',
        displayName: playerInfo.displayName || playerInfo.username || 'viewer',
        platform: playerInfo.platform || 'web',
        platformUserId: playerInfo.platformUserId || playerInfo.username || null,
        avatar: playerInfo.avatar || null,
        score: 0,
        words: [],
        pangrams: 0,
      };
    }
    const player = this.players[key];
    player.score += score;
    player.words.push(word);
    if (isPangram) player.pangrams++;
    if (playerInfo.avatar) player.avatar = playerInfo.avatar;
  }

  /** Overridable pangram rule; by default no word is a pangram. */
  _isPangram() { return false; }

  getLeaderboard(limit = 20) {
    return Object.values(this.players)
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  getTopPlayers(limit = 3) {
    return this.getLeaderboard(limit).map((p) => ({
      name: p.displayName || p.username,
      displayName: p.displayName || p.username,
      score: p.score,
      profileImage: p.avatar || null,
    }));
  }

  getRemainingTime() {
    if (!this.endTime) return null;
    return Math.max(0, Math.ceil((this.endTime - Date.now()) / 1000));
  }

  getCurrentScore() {
    return Object.values(this.foundWords).reduce((sum, w) => sum + w.score, 0);
  }

  /** Public state broadcast to clients. Subclasses extend via `getState`. */
  getState() {
    return {
      game: this.slug,
      gameName: this.name,
      status: this.status,
      puzzle: this.puzzle,
      puzzleId: this.puzzleId,
      puzzleName: this.puzzleName,
      isDaily: this.isDaily,
      dailyDate: this.dailyDate,
      minLength: this.minLength,
      totalAnswers: this.answers.length,
      totalRequired: this.requiredAnswers.length,
      foundCount: Object.keys(this.foundWords).length,
      foundRequiredCount: this.foundRequiredCount,
      currentScore: this.getCurrentScore(),
      foundWords: this.foundWords,
      wordHistory: this.wordHistory.slice(0, 50),
      leaderboard: this.getLeaderboard(),
      topPlayers: this.getTopPlayers(),
      remainingTime: this.getRemainingTime(),
      timerDuration: this.timerDuration,
      startTime: this.startTime,
    };
  }

  getSerializableState() {
    return {
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      timerDuration: this.timerDuration,
      _remainingAtPause: this._remainingAtPause ?? null,
      puzzle: this.puzzle,
      puzzleId: this.puzzleId,
      puzzleName: this.puzzleName,
      isDaily: this.isDaily,
      dailyDate: this.dailyDate,
      answers: this.answers,
      requiredAnswers: this.requiredAnswers,
      rarity: Array.from(this.rarity.entries()),
      foundWords: this.foundWords,
      players: this.players,
      wordHistory: this.wordHistory,
      foundRequiredCount: this.foundRequiredCount,
      completionEmitted: this.completionEmitted,
    };
  }

  restoreState(saved = {}) {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = null;
    delete this._remainingAtPause;

    this.status = saved.status || 'idle';
    this.startTime = saved.startTime || null;
    this.endTime = saved.endTime || null;
    this.timerDuration = saved.timerDuration || 0;
    this.puzzle = saved.puzzle || null;
    this.puzzleId = saved.puzzleId || null;
    this.puzzleName = saved.puzzleName || null;
    this.isDaily = Boolean(saved.isDaily);
    this.dailyDate = saved.dailyDate || null;
    this.answers = saved.answers || [];
    this.requiredAnswers = saved.requiredAnswers || [];
    this.rarity = new Map(saved.rarity || []);
    this.answerSet = new Set(this.answers);
    this.requiredSet = new Set(this.requiredAnswers);
    this.foundWords = saved.foundWords || {};
    this.players = saved.players || {};
    this.wordHistory = saved.wordHistory || [];
    this.foundRequiredCount = saved.foundRequiredCount || 0;
    this.completionEmitted = Boolean(saved.completionEmitted);

    if (Number.isFinite(saved._remainingAtPause) && saved._remainingAtPause >= 0) {
      this._remainingAtPause = saved._remainingAtPause;
    }
    // A restored active timed round resumes paused — clients must opt back in.
    if (this.status === 'active' && this.timerDuration > 0) {
      this.status = 'paused';
      this._remainingAtPause = Number.isFinite(this.endTime) ? Math.max(0, this.endTime - Date.now()) : 0;
    }
    return this;
  }

  _armTimer() {
    if (this.timerInterval) clearInterval(this.timerInterval);
    this.timerInterval = setInterval(() => {
      if (this.endTime && Date.now() >= this.endTime) {
        try { this.end(); } catch (_) {}
      }
      this.emit('timer-tick', this.getRemainingTime());
    }, 1000);
    if (this.timerInterval.unref) this.timerInterval.unref();
  }
}

module.exports = { Game, scoreWordFull, playerKeyFor, LETTER_RARITY, WORD_LENGTH_BONUS };
