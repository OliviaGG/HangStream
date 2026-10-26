// Game registry — rooms, round lifecycle and the bridge to HangStream's
// existing WebSocket hub and chat modules.
//
// This is the piece HangStream was missing. In word-tycoon-ecosystem each game
// server registers itself with a central chat-relay hub and owns one
// authoritative round; here a single process plays both roles, so the registry
// keeps one Game per `streamer x game` room and exposes the same concepts:
//
//   - rooms          one Game instance per streamer (namespace) per game
//   - sendChatGuess  chat messages from twitch/tiktok/tiktok feed into games
//   - handleMessage  browser messages ('game-join-room', 'guess', ...) from ws
//   - broadcast      game state out to the room's watchers over ws
//   - daily rounds   rolled once per day per game
//
// It hooks into server.js through three injected functions so it never needs to
// import the HTTP/WS layer directly:
//
//   broadcast(streamerId, payload)   send to a room's ws watchers
//   shouldWatch(streamerId)          whether chat for that streamer is live
//   persist(streamerId, gameId)      optional hook after state changes

const dictionary = require('./dictionary');
const rounds = require('./rounds');
const { SpellingBeeGame } = require('./spellingbee');
const { WordleGame } = require('./wordle');
const { HangmanGame } = require('./hangman');
const { SpeedScrambleGame } = require('./speedscramble');
const { SearchleGame } = require('./searchle');
const { playerKeyFor } = require('./engine');
const { loadDonations } = require('../storage');

// How long an idle public room survives before it is recycled.
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
// A round with no activity for this long is retired on the next guess.
const STALE_ROUND_MS = 12 * 60 * 60 * 1000;

/**
 * Check if a viewer is a donor based on their viewer ID
 */
function isDonor(viewerId) {
  if (!viewerId) return false;
  try {
    const donations = loadDonations();
    // Check against viewerId (for Google OAuth) and platformUserId (for Twitch/TikTok)
    // Also check if viewerId contains platform prefix
    const isDonor = donations.some(donation => {
      // Direct match
      if (donation.viewerId === viewerId) return true;
      
      // Check with platform prefixes
      const prefixes = ['google:', 'twitch:', 'tiktok:'];
      for (const prefix of prefixes) {
        if (donation.viewerId === `${prefix}${viewerId}`) return true;
        if (viewerId.startsWith(prefix) && donation.viewerId === viewerId) return true;
      }
      
      // Reverse check: if donation has prefix, try matching without it
      for (const prefix of prefixes) {
        if (donation.viewerId.startsWith(prefix)) {
          const baseId = donation.viewerId.substring(prefix.length);
          if (baseId === viewerId) return true;
        }
      }
      
      return false;
    });
    
    if (!isDonor) {
      console.log(`Donor check failed for viewerId: ${viewerId}`);
    }
    
    return isDonor;
  }

const GAME_FACTORIES = {
  spellingbee: () => new SpellingBeeGame(),
  wordle: () => new WordleGame(),
  hangman: () => new HangmanGame(),
  speedscramble: () => new SpeedScrambleGame(),
  searchle: () => new SearchleGame(),
};

const GAME_META = {
  spellingbee: { id: 'spellingbee', name: 'Spelling Bee', icon: '🐝', minPlayers: 1 },
  wordle: { id: 'wordle', name: 'Wordle', icon: '🟩', minPlayers: 1 },
  hangman: { id: 'hangman', name: 'Hangman', icon: '🎯', minPlayers: 1 },
  speedscramble: { id: 'speedscramble', name: 'Speed Scramble', icon: '⚡', minPlayers: 1 },
  searchle: { id: 'searchle', name: 'Searchle', icon: '🔎', minPlayers: 1 },
};

class GameRegistry {
  constructor(options = {}) {
    // streamerId -> Map<gameId, Game>
    this.rooms = new Map();
    this.options = options;
    this.broadcastFn = options.broadcast || (() => {});
    this.persistFn = options.persist || (() => {});
    this.dailyEnabled = options.dailyEnabled !== false;
    // (streamerId, gameId) -> void, called when a round completes. server.js
    // points this at the next-game vote's term clock.
    this.onRoundComplete = options.onRoundComplete || null;
    // Per-room last-activity timestamp, keyed `${streamerId}:${gameId}`.
    this.lastActivity = new Map();
    this.sweepInterval = null;
    // Make sure the word bank is ready before the first round is built.
    dictionary.load();
  }

  /** Games this registry can host. */
  list() { return Object.values(GAME_META); }

  has(gameId) { return Boolean(GAME_FACTORIES[gameId]); }

  /** Get (creating if needed) the Game for a streamer x game room. */
  room(streamerId, gameId) {
    const key = streamerId || 'public';
    if (!GAME_FACTORIES[gameId]) return null;
    let byGame = this.rooms.get(key);
    if (!byGame) { byGame = new Map(); this.rooms.set(key, byGame); }
    let game = byGame.get(gameId);
    if (!game) {
      game = GAME_FACTORIES[gameId]();
      this._wire(game, key);
      byGame.set(gameId, game);
    }
    this.touch(key, gameId);
    return game;
  }

  _wire(game, streamerId) {
    game.on('word-found', (entry) => {
      this.touch(streamerId, game.slug);
      this.broadcastFn(streamerId, {
        type: 'game-word-found',
        game: game.slug,
        entry,
        leaderboard: game.getLeaderboard(10),
        foundCount: Object.keys(game.foundWords).length,
        totalRequired: game.requiredAnswers.length,
      });
      this.persistFn(streamerId, game.slug);
    });

    game.on('guess', (entry) => {
      this.touch(streamerId, game.slug);
      this.broadcastFn(streamerId, { type: 'game-guess-feedback', game: game.slug, entry });
      this.persistFn(streamerId, game.slug);
    });

    for (const evt of ['game-started', 'game-paused', 'game-resumed', 'round-loaded']) {
      game.on(evt, (state) => {
        this.broadcastFn(streamerId, { type: 'game-state', game: game.slug, event: evt, state: this._publicState(game) });
      });
    }

    game.on('round-complete', (state) => {
      this.touch(streamerId, game.slug);
      const winner = game.getLeaderboard(1)[0] || null;
      this.broadcastFn(streamerId, {
        type: 'game-complete',
        game: game.slug,
        winner,
        topPlayers: game.getTopPlayers(3),
        isDaily: game.isDaily,
        state: this._publicState(game),
      });
      this.persistFn(streamerId, game.slug);
      this._afterComplete(streamerId, game);
    });

    game.on('timer-tick', (remaining) => {
      this.broadcastFn(streamerId, { type: 'game-timer', game: game.slug, remaining });
    });

    game.on('game-ended', (state) => {
      this.touch(streamerId, game.slug);
      this.broadcastFn(streamerId, { type: 'game-ended', game: game.slug, state: this._publicState(game) });
      this.persistFn(streamerId, game.slug);
    });
  }

  /** Strip anything clients must not see (Wordle's answer, etc.). */
  _publicState(game) {
    return this.stateFor(game);
  }

  /**
   * Mask the fields a live client must not receive. Kept in one place so every
   * broadcast and snapshot goes through the same redaction.
   *
   * Wordle is length-driven: while the round can still be won, the secret word
   * must never be serializable. Hangman and Speed Scramble carry the same risk
   * for their own answers.
   */
  stateFor(game) {
    if (!game) return null;
    const state = game.getState();
    const live = state.status === 'active' || state.status === 'paused';
    if (game.slug === 'wordle') {
      return live ? state : { ...state, answer: game.answer };
    }
    if (game.slug === 'speedscramble') {
      // `getState` already withholds the answer until the round is over; this
      // only adds it back for a finished round, matching Wordle.
      return state;
    }
    return state;
  }

  touch(streamerId, gameId) {
    this.lastActivity.set(`${streamerId || 'public'}:${gameId}`, Date.now());
  }

  /** Read a room's public state without creating it. */
  state(streamerId, gameId) {
    const byGame = this.rooms.get(streamerId || 'public');
    const game = byGame && byGame.get(gameId);
    if (!game) return null;
    return this.stateFor(game);
  }

  // ── Round control ────────────────────────────────────────────────

  /** Start a fresh round in a room (generating a puzzle as needed). */
  startRound(streamerId, gameId, opts = {}) {
    const game = this.room(streamerId, gameId);
    if (!game) return { success: false, error: 'unknown_game' };

    const dailyDate = getDailyDate();
    const makeDaily = Boolean(opts.daily) && this.dailyEnabled;

    let built;
    if (game.slug === 'spellingbee') {
      built = game.newRound({ isDaily: makeDaily, dailyDate: makeDaily ? dailyDate : null, ...opts });
    } else if (game.slug === 'wordle') {
      built = game.newRound({ isDaily: makeDaily, dailyDate: makeDaily ? dailyDate : null, ...opts });
    } else if (game.slug === 'hangman' || game.slug === 'speedscramble') {
      // Round options (difficulty, category, a pinned word) pass straight
      // through so the dashboard can shape the round.
      built = game.newRound({ isDaily: makeDaily, dailyDate: makeDaily ? dailyDate : null, ...opts });
    } else if (game.slug === 'searchle') {
      // Searchle needs its embedding model; `newRound` reports MODEL_NOT_READY
      // rather than starting a round nobody can finish.
      built = game.newRound({ isDaily: makeDaily, dailyDate: makeDaily ? dailyDate : null, ...opts });
    }
    if (!built || built.success === false) return built || { success: false, error: 'no_round' };

    if (makeDaily) {
      rounds.markDailyPlayed(gameId, dailyDate, streamerId || 'public', game.puzzleId).catch(() => {});
    }

    const started = game.start(opts.timerSeconds || 0);
    if (started.success) {
      game.status = 'active';
      this.broadcastFn(streamerId || 'public', { type: 'game-state', game: game.slug, event: 'new-round', state: this._publicState(game) });
      this.persistFn(streamerId || 'public', game.slug);
    }
    return started;
  }

  /** Called on completion — daily rounds wait for a manual restart. */
  _afterComplete(streamerId, game) {
    // A completed round is a "round won" as far as the next-game vote is
    // concerned: it burns down the active game's term (see game-vote.js), and
    // the win card holds the ballot back if the streamer has one enabled.
    if (this.onRoundComplete) {
      try { this.onRoundComplete(streamerId, game.slug); } catch (e) {
        console.warn('onRoundComplete hook failed', e && e.message ? e.message : e);
      }
    }
    if (game.isDaily || game.slug === 'wordle') return; // wordle rounds end on solve/miss
    // Bee and Speed Scramble are endless stream formats: they roll straight into
    // the next puzzle so chat always has something to solve. Hangman is
    // letter-by-letter and ends the same way, but restarts a little slower so
    // the solved board stays readable on stream. Searchle is fixed-length and
    // waits for a deliberate restart, like Wordle.
    if (game.slug === 'searchle') return;
    const delay = game.slug === 'hangman' ? 12000 : 8000;
    setTimeout(() => {
      if (game.slug === 'spellingbee' || game.slug === 'speedscramble' || game.slug === 'hangman') {
        if (game.isDaily) return;
        this.startRound(streamerId, game.slug, {
          timerSeconds: game.timerDuration,
          difficulty: game.difficulty,
          category: game.category,
        });
      }
    }, delay);
  }

  /** Retire a stale idle round so a fresh one can start. */
  maybeRetire(streamerId, gameId) {
    const key = `${streamerId || 'public'}:${gameId}`;
    const last = this.lastActivity.get(key) || 0;
    const byGame = this.rooms.get(streamerId || 'public');
    const game = byGame && byGame.get(gameId);
    if (!game) return;
    if (game.status === 'active') return;
    if (game.isDaily || game.status === 'idle') return;
    if (Date.now() - last > STALE_ROUND_MS) {
      this.startRound(streamerId, gameId, {});
    }
  }

  // ── Input paths ──────────────────────────────────────────────────

  /** Handle a chat line from twitch/tiktok. Returns what the game made of it. */
  async sendChatGuess(platform, streamerId, message, playerInfo = {}) {
    const text = String(message || '').trim();
    if (!text) return null;

    // Check for donor hint command
    if (text.toLowerCase() === '/hint') {
      const viewerIsDonor = isDonor(playerInfo.id || playerInfo.platformUserId);
      if (!viewerIsDonor) {
        // Return a result that will be shown in chat
        return { 
          donorOnly: true, 
          error: 'Hint is a donor-only command. Donate to use hints!',
          message: 'Hint is a donor-only command. Visit https://hangstream.me/donate to support the streamer and unlock hints!' 
        };
      }

      // Process hint command for Hangman, Wordle, and Searchle
      const byGame = this.rooms.get(streamerId || 'public');
      
      // Try Hangman first
      let game = byGame && byGame.get('hangman');
      if (game && game.status === 'active' && game.revealHint) {
        const info = {
          platform,
          username: playerInfo.username || playerInfo.user || 'viewer',
          displayName: playerInfo.displayName || playerInfo.username || playerInfo.user || 'viewer',
          platformUserId: playerInfo.platformUserId || playerInfo.userId || null,
          avatar: playerInfo.avatar || null,
          id: playerInfo.id || null,
        };
        const result = game.revealHint(info);
        if (!result.accepted && result.result === 'hint_limit_reached') {
          return { hintLimitReached: true, error: result.error, message: result.error };
        }
        return result;
      }

      // Try Wordle
      game = byGame && byGame.get('wordle');
      if (game && game.status === 'active' && game.revealHint) {
        const info = {
          platform,
          username: playerInfo.username || playerInfo.user || 'viewer',
          displayName: playerInfo.displayName || playerInfo.username || playerInfo.user || 'viewer',
          platformUserId: playerInfo.platformUserId || playerInfo.userId || null,
          avatar: playerInfo.avatar || null,
          id: playerInfo.id || null,
        };
        const result = game.revealHint(info);
        if (!result.accepted && result.result === 'hint_limit_reached') {
          return { hintLimitReached: true, error: result.error, message: result.error };
        }
        return result;
      }

      // Try Searchle
      game = byGame && byGame.get('searchle');
      if (game && game.status === 'active' && game.revealHint) {
        const info = {
          platform,
          username: playerInfo.username || playerInfo.user || 'viewer',
          displayName: playerInfo.displayName || playerInfo.username || playerInfo.user || 'viewer',
          platformUserId: playerInfo.platformUserId || playerInfo.userId || null,
          avatar: playerInfo.avatar || null,
          id: playerInfo.id || null,
        };
        const result = await game.revealHint(info);
        if (!result.accepted && result.result === 'hint_limit_reached') {
          return { hintLimitReached: true, error: result.error, message: result.error };
        }
        return result;
      }

      return null;
    }

    // Only allow letters for regular guesses (not commands)
    if (!/^[a-z]+$/i.test(text)) return null;

    const info = {
      platform,
      username: playerInfo.username || playerInfo.user || 'viewer',
      displayName: playerInfo.displayName || playerInfo.username || playerInfo.user || 'viewer',
      platformUserId: playerInfo.platformUserId || playerInfo.userId || null,
      avatar: playerInfo.avatar || null,
      id: playerInfo.id || null, // For donor check
    };

    const viewerIsDonor = isDonor(info.id || info.platformUserId);

    // If donor, split message into multiple guesses (space-separated)
    // Otherwise, treat as single guess
    const guesses = viewerIsDonor ? text.split(/\s+/) : [text];

    const results = [];
    for (const gameId of Object.keys(GAME_FACTORIES)) {
      const byGame = this.rooms.get(streamerId || 'public');
      const game = byGame && byGame.get(gameId);
      if (!game || game.status !== 'active') continue;

      // Process each guess for this game
      for (const guess of guesses) {
        // Hangman's floor is 1 (single letters are its native input); every other
        // game's own minLength already governs.
        if (guess.length < game.minLength) continue;

        let result;
        if (game.slug === 'searchle') {
          // Ranking is async; a chat line can't block the chat relay.
          result = await game.submitGuessAsync(guess, info);
        } else if (game.slug === 'hangman') {
          // Hangman handles single letters specially - route to guessLetter
          if (guess.length === 1) {
            result = game.guessLetter(guess, info);
          } else {
            // Full word guess for Hangman
            result = game.submitWord(guess, info);
          }
        } else {
          result = game.submitWord(guess, info);
        }
        if (!result) continue;
        // Chat guesses that are simply "not a word" are noise; stay quiet on them.
        if (result.accepted || !['too_short', 'not_a_word', 'incorrect'].includes(result.result)) {
          results.push({ gameId, guess, ...result });
        }
        // Searchle's verdict is only meaningful per-guess, so broadcast it.
        if (game.slug === 'searchle' && result.accepted) {
          this.broadcastFn(streamerId || 'public', {
            type: 'guess-result',
            game: game.slug,
            via: 'chat',
            ...result,
          });
        }
      }
    }
    return results.length ? results : null;
  }

  /**
   * Handle a browser message from the ws hub. Returns payloads to send back —
   * or, for the Searchle guess case, a promise that resolves to them, since its
   * ranking step is async. server.js handles both shapes.
   */
  handleMessage(ws, data) {
    const streamerId = data.owner || data.streamerId || ws.owner || 'public';

    switch (data.type) {
      case 'game-list':
        return [{ type: 'game-list', games: this.list(), rooms: this._roomSummaries(streamerId) }];

      case 'game-state': {
        const state = this.state(streamerId, data.game);
        return [{ type: 'game-state', game: data.game, event: 'snapshot', state }];
      }

      case 'game-new': {
        const result = this.startRound(streamerId, data.game, {
          timerSeconds: data.timerSeconds || 0,
          word: data.word || null,
          letters: data.letters || null,
          centerLetter: data.centerLetter || null,
          category: data.category || null,
          difficulty: data.difficulty || null,
        });
        return [{ type: 'game-action', action: 'game-new', game: data.game, ...result }];
      }

      case 'game-pause':
      case 'game-resume':
      case 'game-end': {
        const game = this.room(streamerId, data.game);
        if (!game) return [{ type: 'game-action', action: data.type, game: data.game, success: false, error: 'unknown_game' }];
        const result = data.type === 'game-pause' ? game.pause()
          : data.type === 'game-resume' ? game.resume()
            : game.end();
        return [{ type: 'game-action', action: data.type, game: data.game, ...result }];
      }

      case 'guess': {
        const game = this.room(streamerId, data.game);
        if (!game) return [];
        if (game.status !== 'active') this.maybeRetire(streamerId, data.game);
        const info = {
          platform: data.platform || 'web',
          username: data.username || (ws.viewer && ws.viewer.name) || 'viewer',
          displayName: data.displayName || (ws.viewer && ws.viewer.name) || 'viewer',
          platformUserId: data.platformUserId || (ws.viewer && ws.viewer.id) || null,
          avatar: data.avatar || (ws.viewer && ws.viewer.avatar) || null,
          id: ws.viewer && ws.viewer.id || null,
        };
        // Hangman is letter-based: a page sending `letter` (or a one-character
        // `word`) takes its native path and gets a fresh masked board back.
        if (game.slug === 'hangman' && (data.letter || (data.word && String(data.word).length === 1))) {
          const letterResult = game.guessLetter(data.letter || data.word, info);
          return [{ type: 'guess-result', game: game.slug, ...letterResult }];
        }
        // Searchle ranks against an embedding model, so its verdict is async.
        // Returning the promise lets server.js land the reply when it settles.
        if (game.slug === 'searchle') {
          return game.submitGuessAsync(data.word, info)
            .then((result) => [{ type: 'guess-result', game: game.slug, ...result }]);
        }
        // Wordle needs to accept repeat-safe validation before the round check.
        const result = game.submitWord(data.word, info);
        const payloads = [{ type: 'guess-result', game: data.game, ...result }];
        if (game.slug === 'wordle' && !result.accepted && result.result === 'not_active' &&
            Object.keys(game.foundWords).length >= game.maxGuesses) {
          payloads.push({ type: 'game-state', game: game.slug, event: 'snapshot', state: this.state(streamerId, game.slug) });
        }
        return payloads;
      }

      case 'hint': {
        const game = this.room(streamerId, data.game);
        if (!game) return [{ type: 'error', error: 'game_not_found' }];
        
        // Check if donor
        const viewerId = ws.viewer && ws.viewer.id;
        const viewerIsDonor = isDonor(viewerId);
        if (!viewerIsDonor) {
          return [{ type: 'error', error: 'donor_only', message: 'Hint is a donor-only feature' }];
        }

        // Only Hangman, Wordle, and Searchle support hints
        if (!game.revealHint) {
          return [{ type: 'error', error: 'not_supported', message: 'Hints not supported for this game' }];
        }

        if (game.status !== 'active') {
          return [{ type: 'error', error: 'not_active', message: 'Round is not active' }];
        }

        const info = {
          platform: data.platform || 'web',
          username: data.username || (ws.viewer && ws.viewer.name) || 'viewer',
          displayName: data.displayName || (ws.viewer && ws.viewer.name) || 'viewer',
          platformUserId: data.platformUserId || (ws.viewer && ws.viewer.id) || null,
          avatar: data.avatar || (ws.viewer && ws.viewer.avatar) || null,
          id: ws.viewer && ws.viewer.id || null,
        };

        // Searchle is async
        if (game.slug === 'searchle') {
          return game.revealHint(info)
            .then((result) => {
              if (!result.accepted && result.result === 'hint_limit_reached') {
                return [{ type: 'error', error: 'hint_limit_reached', message: result.error }];
              }
              return [{ type: 'guess-result', game: game.slug, ...result }];
            });
        }

        const result = game.revealHint(info);
        if (!result.accepted && result.result === 'hint_limit_reached') {
          return [{ type: 'error', error: 'hint_limit_reached', message: result.error }];
        }
        return [{ type: 'guess-result', game: game.slug, ...result }];
      }

      case 'game-join-room': {
        ws.owner = ws.owner || streamerId;
        ws._rooms = ws._rooms || new Set();
        ws._rooms.add(`${streamerId}:${data.game}`);
        // Start a fresh round when entering an idle room and nothing is running.
        const game = this.room(streamerId, data.game);
        if (game && game.status === 'idle') {
          // A persisted room resumes on first access after a restart; only
          // auto-start when there is genuinely nothing to restore.
          this.restore(streamerId, data.game).then((restored) => {
            if (restored && restored.status === 'idle') this.startRound(streamerId, data.game, {});
          }).catch(() => {
            this.startRound(streamerId, data.game, {});
          });
        }
        return [{
          type: 'game-joined',
          game: data.game,
          streamerId,
          state: this.state(streamerId, data.game),
        }];
      }

      default:
        return null;
    }
  }

  _roomSummaries(streamerId) {
    const out = {};
    for (const gameId of Object.keys(GAME_FACTORIES)) {
      const game = this.state(streamerId, gameId);
      out[gameId] = game
        ? { status: game.status, foundCount: game.foundCount, isDaily: game.isDaily }
        : null;
    }
    return out;
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  /**
   * Restore a persisted room into memory (called on first access after a
   * restart). Rounds resume paused, so clients explicitly opt back in.
   */
  async restore(streamerId, gameId) {
    const game = this.room(streamerId, gameId);
    if (!game || game.status !== 'idle' || Object.keys(game.foundWords).length > 0) return game;
    const saved = await rounds.loadRound(streamerId || 'public', gameId);
    if (saved) {
      game.restoreState(saved);
      this.broadcastFn(streamerId || 'public', {
        type: 'game-state',
        game: game.slug,
        event: 'restored',
        state: this._publicState(game),
      });
    }
    return game;
  }

  startSweeper() {
    if (this.sweepInterval) return;
    this.sweepInterval = setInterval(() => {
      const cutoff = Date.now() - ROOM_TTL_MS;
      for (const [streamerId, byGame] of Array.from(this.rooms.entries())) {
        if (streamerId === 'public') continue; // keep the demo/default room warm
        let empty = true;
        for (const [gameId, game] of byGame) {
          const last = this.lastActivity.get(`${streamerId}:${gameId}`) || 0;
          if (last >= cutoff || game.status === 'active') { empty = false; break; }
        }
        if (empty) this.rooms.delete(streamerId);
      }
    }, 10 * 60 * 1000);
    if (this.sweepInterval.unref) this.sweepInterval.unref();
  }
}

/** Daily puzzles roll over on America/Edmonton, matching Word Tycoon. */
function getDailyDate(now = new Date()) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(now);
  } catch (_) {
    return now.toISOString().slice(0, 10);
  }
}

module.exports = { GameRegistry, getDailyDate, GAME_META, GAME_FACTORIES, playerKeyFor };
