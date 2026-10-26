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
 * Check if a viewer is a donor based on their viewer ID and linked accounts
 */
function isDonor(viewerId, linkedAccounts = null) {
  if (!viewerId) return false;
  try {
    const donations = loadDonations();
    
    // If linkedAccounts not provided, try to load from viewer profiles
    if (!linkedAccounts) {
      try {
        const { loadViewerProfiles } = require('../storage');
        const profiles = loadViewerProfiles();
        const profile = profiles[viewerId];
        if (profile && profile.linkedAccounts) {
          linkedAccounts = profile.linkedAccounts;
        }
      } catch (e) {
        // If loading fails, continue without linked accounts
      }
    }
    
    // Collect all IDs to check: primary ID + linked accounts
    const idsToCheck = [viewerId];
    
    // Add linked TikTok ID
    if (linkedAccounts && linkedAccounts.tiktok && linkedAccounts.tiktok.openId) {
      idsToCheck.push(`tiktok:${linkedAccounts.tiktok.openId}`);
    }
    
    // Add linked Twitch ID
    if (linkedAccounts && linkedAccounts.twitch && linkedAccounts.twitch.userId) {
      idsToCheck.push(`twitch:${linkedAccounts.twitch.userId}`);
    }
    
    // Check against all IDs
    const isDonor = donations.some(donation => {
      for (const id of idsToCheck) {
        // Direct match
        if (donation.viewerId === id) return true;
        
        // Check with platform prefixes
        const prefixes = ['google:', 'twitch:', 'tiktok:'];
        for (const prefix of prefixes) {
          if (donation.viewerId === `${prefix}${id}`) return true;
          if (id.startsWith(prefix) && donation.viewerId === id) return true;
        }
        
        // Reverse check: if donation has prefix, try matching without it
        for (const prefix of prefixes) {
          if (donation.viewerId.startsWith(prefix)) {
            const baseId = donation.viewerId.substring(prefix.length);
            if (baseId === id) return true;
          }
        }
      }
      
      return false;
    });
    
    if (!isDonor) {
      console.log(`Donor check failed for viewerId: ${viewerId}`);
    }
    
    return isDonor;
  } catch (e) {
    console.error('Error checking donor status:', e);
    return false;
  }
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

      // Try Speed Scramble
      game = byGame && byGame.get('speedscramble');
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

      // Try Spelling Bee
      game = byGame && byGame.get('spellingbee');
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

    // Log for debugging
    if (guesses.length > 1) {
      console.log(`Multi-guess attempt by ${info.username} (donor: ${viewerIsDonor}, id: ${info.id}): ${guesses.join(', ')}`);
    }

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
        return { type: 'game-list', games: this.list() };

      case 'game-state':
        const gameId = data.game;
        if (!this.has(gameId)) return null;
        return { type: 'game-state', game: gameId, state: this.state(streamerId, gameId) };

      case 'game-new':
        return this.startRound(streamerId, data.game, data.options || {});

      case 'game-pause':
        const pauseGame = this.room(streamerId, data.game);
        if (!pauseGame) return null;
        pauseGame.pause();
        return { type: 'game-state', game: data.game, state: this._publicState(pauseGame) };

      case 'game-resume':
        const resumeGame = this.room(streamerId, data.game);
        if (!resumeGame) return null;
        resumeGame.resume();
        return { type: 'game-state', game: data.game, state: this._publicState(resumeGame) };

      case 'game-end':
        const endGame = this.room(streamerId, data.game);
        if (!endGame) return null;
        endGame.end();
        return { type: 'game-state', game: data.game, state: this._publicState(endGame) };

      case 'game-join-room':
        const joinRoom = this.room(streamerId, data.game);
        if (!joinRoom) return null;
        return { type: 'game-state', game: data.game, state: this._publicState(joinRoom) };

      case 'guess':
        const guessGame = this.room(streamerId, data.game);
        if (!guessGame) return null;
        const playerInfo = {
          platform: 'web',
          username: data.username || data.viewerName || 'web',
          displayName: data.displayName || data.username || data.viewerName || 'web',
          platformUserId: data.viewerId || null,
          avatar: data.avatar || null,
          id: data.viewerId || null,
        };
        let guessResult;
        if (guessGame.slug === 'searchle') {
          guessResult = guessGame.submitGuessAsync(data.guess, playerInfo);
        } else if (guessGame.slug === 'hangman' && data.guess.length === 1) {
          guessResult = guessGame.guessLetter(data.guess, playerInfo);
        } else {
          guessResult = guessGame.submitWord(data.guess, playerInfo);
        }
        if (!guessResult) return null;
        // Handle both sync and async results
        if (typeof guessResult.then === 'function') {
          return guessResult.then(r => ({ type: 'guess-result', game: data.game, via: 'web', ...r }));
        }
        return { type: 'guess-result', game: data.game, via: 'web', ...guessResult };

      case 'hint':
        const hintGame = this.room(streamerId, data.game);
        if (!hintGame) return null;
        const hintPlayerInfo = {
          platform: 'web',
          username: data.username || data.viewerName || 'web',
          displayName: data.displayName || data.username || data.viewerName || 'web',
          platformUserId: data.viewerId || null,
          avatar: data.avatar || null,
          id: data.viewerId || null,
        };
        const viewerIsDonor = isDonor(hintPlayerInfo.id || hintPlayerInfo.platformUserId);
        if (!viewerIsDonor) {
          return { type: 'error', error: 'hint_denied', message: 'Hint is a donor-only command. Visit https://hangstream.me/donate to support the streamer and unlock hints!' };
        }
        if (!hintGame.revealHint) {
          return { type: 'error', error: 'hint_not_supported', message: 'This game does not support hints.' };
        }
        const hintResult = hintGame.revealHint(hintPlayerInfo);
        if (!hintResult.accepted && hintResult.result === 'hint_limit_reached') {
          return { type: 'error', error: 'hint_limit_reached', message: hintResult.error };
        }
        return { type: 'guess-result', game: data.game, via: 'web', ...hintResult };

      default:
        return null;
    }
  }

  /**
   * Sweep idle rooms every ROOM_TTL_MS.
   */
  startSweep() {
    if (this.sweepInterval) return;
    this.sweepInterval = setInterval(() => {
      const now = Date.now();
      for (const [key, last] of this.lastActivity.entries()) {
        if (now - last > ROOM_TTL_MS) {
          const [streamerId, gameId] = key.split(':');
          const byGame = this.rooms.get(streamerId);
          if (byGame) {
            byGame.delete(gameId);
            if (byGame.size === 0) {
              this.rooms.delete(streamerId);
            }
          }
          this.lastActivity.delete(key);
        }
      }
    }, ROOM_TTL_MS);
  }

  stopSweep() {
    if (this.sweepInterval) {
      clearInterval(this.sweepInterval);
      this.sweepInterval = null;
    }
  }
}

function getDailyDate() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

module.exports = {
  GameRegistry,
  getDailyDate,
  GAME_META,
};
