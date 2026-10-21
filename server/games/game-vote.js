/**
 * game-vote.js — "What do we play next?" chat vote.
 *
 * Direct port of chat-relay/src/game-vote.js from word-tycoon-ecosystem (MIT),
 * reimplemented for HangStream's single process. The design is unchanged:
 *
 * Each game in a streamer's rotation gets a TERM: how long it stays on stream,
 * measured either in rounds (real game wins) or in minutes. When the active
 * game's term runs out, a ballot is built from the OTHER rotation entries,
 * chat votes by typing a number, and the winner becomes the next game.
 *
 * Lifecycle (one vote per streamer at a time):
 *
 *   idle ──term expires──▶ voting ──duration up──▶ result ──grace up──▶ switch
 *     ▲                       │                       │                   │
 *     └───────no votes────────┘                       └──── autoSwitch ───┘
 *                                                            off
 *
 * Deliberate behaviours (all carried over verbatim):
 *   - Nobody voted → the game does NOT change. The term simply restarts, so a
 *     quiet chat never yanks the streamer out of the game they're playing.
 *   - Tie → random pick among the tied leaders, flagged as `tiebreak` so the
 *     overlay can say so rather than looking arbitrary.
 *   - The active game is excluded from its own ballot; otherwise "keep playing"
 *     could win forever and the term would never end.
 *   - Ballot picks the least-recently-played candidates first, so a long
 *     rotation actually rotates instead of re-offering the same three games.
 *   - A win card holds the ballot back, bounded so it can't be deferred forever.
 *
 * State is in-memory and per-process: a restart restarts the current term.
 * That's intentional — this is live-stream state, not something worth
 * persisting through a deploy.
 *
 * Like the original, this module knows nothing about sockets, chat or the game
 * engine. `setDeps` injects every outside contact point.
 */

const VOTE_TICK_MS = 1000;
const EMIT_THROTTLE_MS = 250;
// Longest the ballot will sit behind win cards after its term is up. Each win
// pushes the hold out, and some games (Spelling Bee fires a card per WORD) can
// land wins continuously — without a ceiling the vote could be deferred all
// round. Past this it opens regardless.
const MAX_WIN_CARD_DEFER_MS = 45_000;

// Streamers whose rotation is empty still get a usable vote: this is the
// fallback rotation, mirroring Word Tycoon's "every enabled game" pool.
const DEFAULT_TERM_UNIT = 'rounds';
const DEFAULT_TERM_VALUE = 5;
const DEFAULT_BALLOT_SIZE = 3;
const DEFAULT_VOTE_SECONDS = 60;
const DEFAULT_GRACE_SEC = 20;
const MAX_VOTE_CANDIDATES = 16;

// streamerId -> vote state
const _votes = new Map();
// streamerId -> { timer, pending } broadcast throttle
const _emitThrottle = new Map();

let _tickTimer = null;
let deps = {
  // (streamerId) -> config — the rotation, ballot size, durations, flags.
  // Word Tycoon reads an enabled `gameVote` widget here; HangStream stores the
  // same shape per streamer (see registry wiring in server.js).
  getConfig: () => null,
  // () -> [streamerId] — everyone with the vote enabled. Polled by the tick so
  // enabling it (or a restart) starts a term without hooking every config-save
  // path.
  listVoteStreamers: () => [],
  // (streamerId, payload) -> void
  emit: () => {},
  // (streamerId) -> gameId|null — the game whose term is running.
  getActiveGame: () => null,
  // (streamerId, gameId, setupId?) -> void — performs the real switch.
  switchGame: () => {},
  // (gameId) -> display name
  gameLabel: (id) => id,
  // (streamerId) -> ms the win card will occupy the screen after a win, or 0
  // when the streamer has no win card enabled.
  getWinCardHoldMs: () => 0,
};

function setDeps(next) {
  deps = { ...deps, ...(next || {}) };
  _ensureTicking();
}

// ── Config ──────────────────────────────────────────────────────────
// Word Tycoon validates this in streamer-goals.js; HangStream keeps the same
// clamps here so a hand-edited config can't put nonsense on a ballot.
const VALID_TERM_UNITS = new Set(['rounds', 'minutes']);

function _clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function _normalizeConfig(raw) {
  if (!raw) return null;
  const candidates = (Array.isArray(raw.candidates) ? raw.candidates : [])
    .map((entry) => {
      if (!entry || !entry.gameId) return null;
      const termUnit = VALID_TERM_UNITS.has(entry.termUnit) ? entry.termUnit : DEFAULT_TERM_UNIT;
      return {
        gameId: String(entry.gameId).trim().toLowerCase(),
        termUnit,
        termValue: termUnit === 'rounds'
          ? _clampInt(entry.termValue, 1, 50, DEFAULT_TERM_VALUE)
          : _clampInt(entry.termValue, 1, 240, 30),
        setupId: entry.setupId ? String(entry.setupId) : null,
      };
    })
    .filter(Boolean);

  // Dedupe: a game may only appear once — a duplicate would give the same
  // ballot row two numbers and make the vote ambiguous.
  const seen = new Set();
  const rotation = [];
  for (const c of candidates) {
    if (seen.has(c.gameId)) continue;
    seen.add(c.gameId);
    rotation.push(c);
    if (rotation.length >= MAX_VOTE_CANDIDATES) break;
  }

  return {
    candidates: rotation,
    // ballotSize 0 means "show them all".
    ballotSize: Number(raw.ballotSize) === 0
      ? 0
      : _clampInt(raw.ballotSize, 2, MAX_VOTE_CANDIDATES, DEFAULT_BALLOT_SIZE),
    voteDurationSec: _clampInt(raw.voteDurationSec, 15, 900, DEFAULT_VOTE_SECONDS),
    graceSec: _clampInt(raw.graceSec, 5, 300, DEFAULT_GRACE_SEC),
    autoStart: raw.autoStart !== false,
    autoSwitch: raw.autoSwitch !== false,
    allowKeepPlaying: raw.allowKeepPlaying !== false,
    showLogos: raw.showLogos !== false,
    showCounts: raw.showCounts !== false,
  };
}

function _config(streamerId) {
  try { return _normalizeConfig(deps.getConfig(streamerId)); } catch (_) { return null; }
}

// ── State helpers ───────────────────────────────────────────────────
function _blank(streamerId) {
  return {
    streamerId,
    phase: 'idle',
    // Term tracking for the currently active game
    gameId: null,
    termUnit: null,
    termValue: 0,
    termStartedAt: 0,
    roundsDone: 0,
    // Vote
    ballot: [],
    tallies: {},
    voters: new Map(),   // viewerKey -> gameId
    voteEndsAt: 0,
    // Result
    winnerGameId: null,
    tiebreak: false,
    resultEndsAt: 0,
    // Rotation fairness
    lastPlayedAt: {},
    // A win card is on screen until this timestamp — hold the ballot back so
    // the two don't fight for the viewer's attention (or the same real estate).
    winCardBusyUntil: 0,
    // When the term first came due, so the hold above can't defer forever.
    voteDueSince: 0,
    // Set when a term ended but a vote couldn't run (too few candidates), so
    // the overlay/log can explain the idle instead of silently stalling.
    stalledReason: null,
  };
}

function _get(streamerId) {
  let v = _votes.get(streamerId);
  if (!v) {
    v = _blank(streamerId);
    _votes.set(streamerId, v);
  }
  return v;
}

// Several games answer to more than one id (for example a streamer's page may
// call Spelling Bee `spellingbee` or `spelling-bee`). Comparing raw ids meant a
// streamer could have a game in the rotation, be playing it, and still be told
// they weren't in the rotation — the term would never run and the ballot would
// offer them the game they were already on.
const _GAME_ALIAS = {
  'spelling-bee': 'spellingbee',
  'speed-scramble': 'speedscramble',
};
function _normGame(gameId) {
  const id = String(gameId || '').trim().toLowerCase();
  return _GAME_ALIAS[id] || id;
}
function _sameGame(a, b) {
  return !!a && !!b && _normGame(a) === _normGame(b);
}

function _candidateFor(config, gameId) {
  if (!config || !gameId) return null;
  const cands = config.candidates || [];
  // Exact raw id first: two ids may alias to one game, and only one of them may
  // carry a setupId / its own term length. Alias match is the fallback.
  const want = String(gameId).trim().toLowerCase();
  return cands.find((c) => String(c.gameId || '').trim().toLowerCase() === want)
    || cands.find((c) => _sameGame(c.gameId, gameId))
    || null;
}

// ── Term ────────────────────────────────────────────────────────────
/**
 * Point the term clock at whatever game is active now. Called on config
 * changes, on game switches, and lazily from the tick — so a streamer who
 * changes games by hand mid-term gets a fresh term for the new game rather
 * than inheriting the old one's remaining time.
 */
function syncStreamer(streamerId) {
  if (!streamerId) return;
  const config = _config(streamerId);
  if (!config) {
    // Vote disabled — drop everything so a re-enable starts clean.
    if (_votes.has(streamerId)) _votes.delete(streamerId);
    return;
  }
  const v = _get(streamerId);
  const active = _activeGameFor(streamerId, config);
  if (_sameGame(active, v.gameId)) return;

  // Game changed under us (manual switch, or our own resolved vote).
  if (v.gameId) v.lastPlayedAt[_normGame(v.gameId)] = Date.now();
  if (v.phase === 'voting' || v.phase === 'result') _resetVote(v);
  v.phase = 'idle';
  v.gameId = active;
  v.stalledReason = null;
  _startTerm(v, config);
  _emit(streamerId);
}

function _startTerm(v, config) {
  const cand = _candidateFor(config, v.gameId);
  v.termStartedAt = Date.now();
  v.roundsDone = 0;
  v.termUnit = cand ? cand.termUnit : null;
  v.termValue = cand ? cand.termValue : 0;
  // A fresh term is not overdue — clearing this keeps the win-card deferral
  // ceiling scoped to the term that actually came due.
  v.voteDueSince = 0;
}

/**
 * Which game's term is running.
 *
 * Word Tycoon always has a concrete active game (the streamer's widget points
 * at one). HangStream's dashboard can save a rotation without ever naming a
 * current game, and a rotation with no active game would have no term to burn
 * down — the vote could never fire. Falling back to the first rotation entry
 * makes "just configure a rotation" sufficient, and it matches the promise the
 * dashboard makes: the game you are on is the one that counts down.
 */
function _activeGameFor(streamerId, config) {
  let active = null;
  try { active = deps.getActiveGame(streamerId) || null; } catch (_) { active = null; }
  if (active) return active;
  const first = (config && config.candidates && config.candidates[0]) || null;
  return first ? first.gameId : null;
}

function _termEndsAt(v) {
  if (v.termUnit !== 'minutes') return 0;
  return v.termStartedAt + (v.termValue * 60_000);
}

function _termExpired(v) {
  if (!v.termUnit) return false;          // active game isn't in the rotation
  if (v.termUnit === 'rounds') return v.roundsDone >= v.termValue;
  return Date.now() >= _termEndsAt(v);
}

/**
 * A round finished in `gameId`. Only counts toward the term when it's the game
 * whose term is actually running — a win in a pinned secondary game must not
 * burn down the primary game's term.
 */
function noteRound(streamerId, gameId) {
  if (!streamerId) return;
  const config = _config(streamerId);
  if (!config) return;
  const v = _get(streamerId);
  if (v.phase !== 'idle') return;
  // Alias-aware: a win reported as `spelling-bee` still counts toward a
  // `spellingbee` term (and vice versa).
  if (!v.gameId || !_sameGame(gameId, v.gameId)) return;
  if (v.termUnit !== 'rounds') return;
  v.roundsDone += 1;
  _emit(streamerId);
}

/**
 * A win just fired, so the win card is about to take over the overlay. Hold the
 * ballot back until it's done — a vote that opens underneath the celebration is
 * both ugly and easy to miss.
 *
 * Called for wins in ANY of the streamer's games, not just the one whose term
 * is running. The hold is bounded by the card's own display time.
 */
function noteWinCard(streamerId) {
  if (!streamerId) return;
  if (!_config(streamerId)) return;
  let hold = 0;
  try { hold = Number(deps.getWinCardHoldMs(streamerId)) || 0; } catch (_) { hold = 0; }
  if (hold <= 0) return;
  const v = _get(streamerId);
  v.winCardBusyUntil = Date.now() + hold;
}

// Term is up but the win card still owns the screen. Bounded: once the ballot
// has been due for MAX_WIN_CARD_DEFER_MS it opens regardless, so a game that
// fires cards back-to-back can't hold it off indefinitely.
function _waitingOnWinCard(v) {
  if (Date.now() >= (v.winCardBusyUntil || 0)) return false;
  if (v.voteDueSince && (Date.now() - v.voteDueSince) >= MAX_WIN_CARD_DEFER_MS) return false;
  return true;
}

// ── Ballot ──────────────────────────────────────────────────────────
function _buildBallot(v, config) {
  // Alias-aware so the game in play never appears as a challenger against
  // itself under its other id.
  const pool = (config.candidates || []).filter((c) => !_sameGame(c.gameId, v.gameId));
  // Least-recently-played first; never-played (undefined) sorts to the front.
  pool.sort((a, b) => (v.lastPlayedAt[_normGame(a.gameId)] || 0) - (v.lastPlayedAt[_normGame(b.gameId)] || 0));
  // ballotSize 0 means "show them all".
  const wanted = Number(config.ballotSize) === 0 ? pool.length : (config.ballotSize || DEFAULT_BALLOT_SIZE);
  const size = Math.min(wanted, pool.length);
  const ballot = pool.slice(0, size).map((c, i) => ({
    n: i + 1,
    gameId: _normGame(c.gameId),
    name: deps.gameLabel(c.gameId) || c.gameId,
    keep: false,
  }));
  // "Keep playing" is an EXTRA row on top of ballotSize, not one of its slots —
  // turning it on shouldn't quietly cost the streamer a challenger. Always
  // last, so it never takes the number-1 position and skews the vote.
  if (config.allowKeepPlaying !== false && v.gameId) {
    ballot.push({
      n: ballot.length + 1,
      gameId: _normGame(v.gameId),
      name: deps.gameLabel(v.gameId) || v.gameId,
      keep: true,
    });
  }
  return ballot;
}

function _resetVote(v) {
  v.ballot = [];
  v.tallies = {};
  v.voters = new Map();
  v.voteEndsAt = 0;
  v.winnerGameId = null;
  v.tiebreak = false;
  v.resultEndsAt = 0;
}

/**
 * Open a vote. Returns { ok } or { ok:false, error } so a manual "Start vote"
 * button can report why nothing happened.
 */
function startVote(streamerId) {
  const config = _config(streamerId);
  if (!config) return { ok: false, error: 'No game-vote rotation configured' };
  const v = _get(streamerId);
  if (v.phase !== 'idle') return { ok: false, error: 'A vote is already running' };

  // Resolve the active game first — a manual start shouldn't inherit a stale
  // gameId from before an untracked switch.
  const active = _activeGameFor(streamerId, config);
  if (!_sameGame(active, v.gameId)) {
    if (v.gameId) v.lastPlayedAt[_normGame(v.gameId)] = Date.now();
    v.gameId = active;
    _startTerm(v, config);
  }

  const ballot = _buildBallot(v, config);
  // A ballot of nothing but "keep playing" is not a vote, so require a real
  // challenger as well as two rows.
  if (ballot.length < 2 || !ballot.some((b) => !b.keep)) {
    v.stalledReason = 'needs-candidates';
    _emit(streamerId);
    return { ok: false, error: 'Add at least 2 other games to the rotation' };
  }

  _resetVote(v);
  v.phase = 'voting';
  v.stalledReason = null;
  v.ballot = ballot;
  for (const b of ballot) v.tallies[b.gameId] = 0;
  v.voteEndsAt = Date.now() + (config.voteDurationSec * 1000);
  _emit(streamerId, true);
  return { ok: true, ballot };
}

/**
 * Close voting and pick a winner. No votes → the current game's term simply
 * restarts (never switch to a game nobody asked for).
 */
function endVote(streamerId) {
  const config = _config(streamerId);
  const v = _get(streamerId);
  if (v.phase !== 'voting') return { ok: false, error: 'No vote is running' };

  const total = Object.values(v.tallies).reduce((a, b) => a + b, 0);
  if (!total) {
    v.phase = 'idle';
    _resetVote(v);
    if (config) _startTerm(v, config);
    _emit(streamerId, true);
    return { ok: true, winner: null, reason: 'no-votes' };
  }

  const top = Math.max(...Object.values(v.tallies));
  const leaders = Object.keys(v.tallies).filter((g) => v.tallies[g] === top);
  v.tiebreak = leaders.length > 1;
  v.winnerGameId = leaders[Math.floor(Math.random() * leaders.length)];
  v.phase = 'result';
  v.resultEndsAt = Date.now() + ((config ? config.graceSec : DEFAULT_GRACE_SEC) * 1000);
  _emit(streamerId, true);
  return { ok: true, winner: v.winnerGameId, tiebreak: v.tiebreak };
}

/**
 * Grace period over — hand the winner to the real switch and restart the term
 * for the new game. With autoSwitch off the winner is announced only, and the
 * current game's term restarts instead.
 */
function _resolveResult(streamerId) {
  const config = _config(streamerId);
  const v = _get(streamerId);
  const winner = v.winnerGameId;
  // winner === v.gameId means "keep playing" won: there is nothing to switch
  // to, so we fall through to the restart-the-term branch below and the game
  // carries on uninterrupted.
  const shouldSwitch = !!(config && config.autoSwitch) && winner && !_sameGame(winner, v.gameId);

  v.phase = 'idle';
  _resetVote(v);

  if (shouldSwitch) {
    const cand = _candidateFor(config, winner);
    const setupId = cand && cand.setupId ? String(cand.setupId) : null;
    if (v.gameId) v.lastPlayedAt[_normGame(v.gameId)] = Date.now();
    if (!setupId) {
      // Plain switch: pre-commit the new game so the syncStreamer callback
      // inside the switch path no-ops and the term starts exactly once.
      v.gameId = winner;
      if (config) _startTerm(v, config);
      _emit(streamerId, true);
    }
    // With a setup attached we deliberately leave v.gameId stale: the switch
    // path may land on the setup's saved game rather than the ballot's, and
    // game-vote.syncStreamer — called at the end of the switch — then repoints
    // the term against the game that actually became active.
    try {
      deps.switchGame(streamerId, winner, setupId);
    } catch (err) {
      console.warn('[GameVote] switch failed:', err && err.message ? err.message : err);
    }
    if (setupId) _emit(streamerId, true);
    return;
  }
  if (config) _startTerm(v, config);
  _emit(streamerId, true);
}

/** Abandon whatever is running and go back to idle with a fresh term. */
function cancelVote(streamerId) {
  const v = _votes.get(streamerId);
  if (!v) return { ok: false, error: 'Nothing to cancel' };
  const config = _config(streamerId);
  v.phase = 'idle';
  _resetVote(v);
  if (config) _startTerm(v, config);
  _emit(streamerId, true);
  return { ok: true };
}

// ── Chat ────────────────────────────────────────────────────────────
// Accepted while a vote is open: a bare number ("2"), a hashed number ("#2"),
// or an explicit "!vote 2" / "/vote 2". Bare numbers only count during the
// voting window — outside it they pass through to games untouched, which is
// why this sink never suppresses a message.
// Two digits allowed so a full-rotation ballot (rows past 9) is still votable.
// Out-of-range numbers fall out below when no ballot row matches.
const _VOTE_RE = /^(?:[!/]?vote\s*)?#?\s*([1-9]\d?)\s*$/i;

function handleChat(streamerId, normalized) {
  if (!streamerId || !normalized) return;
  const v = _votes.get(streamerId);
  if (!v || v.phase !== 'voting') return;

  const m = _VOTE_RE.exec(String(normalized.message || '').trim());
  if (!m) return;
  const n = parseInt(m[1], 10);
  const choice = v.ballot.find((b) => b.n === n);
  if (!choice) return;

  const user = normalized.user || {};
  const viewerId = user.id || user.username || '';
  if (!viewerId) return;                      // no identifiable viewer — can't dedupe
  const key = `${normalized.platform || '?'}:${viewerId}`;
  if (v.voters.has(key)) return;              // one viewer, one vote — first wins

  v.voters.set(key, choice.gameId);
  v.tallies[choice.gameId] = (v.tallies[choice.gameId] || 0) + 1;
  _emit(streamerId);
  return { voted: true, gameId: choice.gameId };
}

// ── Broadcast ───────────────────────────────────────────────────────
/**
 * Full vote surface for the overlay. Logos are NOT resolved here — the page
 * owns the game->image map (those are browser asset paths), so this stays to
 * ids and names.
 */
function snapshotFor(streamerId) {
  const config = _config(streamerId);
  if (!config) return null;
  // A page may ask for the snapshot before the tick has ever seen this
  // streamer (a viewer opening the overlay is the common case). Sync on demand
  // so the first read is already correct instead of null for up to a tick.
  if (!_votes.has(streamerId)) syncStreamer(streamerId);
  const v = _votes.get(streamerId);
  if (!v) return null;
  const now = Date.now();
  const total = Object.values(v.tallies).reduce((a, b) => a + b, 0);

  const out = {
    streamerId,
    phase: v.phase,
    activeGameId: v.gameId,
    activeGameName: v.gameId ? (deps.gameLabel(v.gameId) || v.gameId) : null,
    inRotation: !!v.termUnit,
    stalledReason: v.stalledReason,
    at: now,
  };

  // Term is over and a vote is queued behind the win card. The status card
  // surfaces this so the gap doesn't read as the widget having stalled.
  if (v.phase === 'idle' && _termExpired(v) && _waitingOnWinCard(v)) {
    out.votePending = true;
  }

  // Idle term countdown — what the slim pill shows between votes.
  if (v.termUnit === 'rounds') {
    out.termUnit = 'rounds';
    out.roundsDone = v.roundsDone;
    out.termValue = v.termValue;
  } else if (v.termUnit === 'minutes') {
    out.termUnit = 'minutes';
    out.termValue = v.termValue;
    out.termSecondsLeft = Math.max(0, Math.ceil((_termEndsAt(v) - now) / 1000));
  }

  if (v.phase === 'voting') {
    out.secondsLeft = Math.max(0, Math.ceil((v.voteEndsAt - now) / 1000));
    out.totalVotes = total;
    out.ballot = v.ballot.map((b) => {
      const votes = v.tallies[b.gameId] || 0;
      return { ...b, votes, pct: total ? Math.round((votes / total) * 100) : 0 };
    });
  } else if (v.phase === 'result') {
    out.resultSecondsLeft = Math.max(0, Math.ceil((v.resultEndsAt - now) / 1000));
    out.totalVotes = total;
    out.tiebreak = v.tiebreak;
    out.willSwitch = !!config.autoSwitch;
    out.ballot = v.ballot.map((b) => {
      const votes = v.tallies[b.gameId] || 0;
      return { ...b, votes, pct: total ? Math.round((votes / total) * 100) : 0 };
    });
    // `stay` = "keep playing" won, so no switch happens and the current game's
    // term just restarts. The card says STAYING ON rather than NEXT UP.
    const isStay = !!v.winnerGameId && _sameGame(v.winnerGameId, v.gameId);
    out.winner = v.winnerGameId ? {
      gameId: v.winnerGameId,
      name: deps.gameLabel(v.winnerGameId) || v.winnerGameId,
      votes: v.tallies[v.winnerGameId] || 0,
      tiebreak: v.tiebreak,
      stay: isStay,
    } : null;
    if (isStay) out.willSwitch = false;
  }
  return out;
}

// Votes can land faster than the overlay needs to repaint; coalesce them.
// Phase changes bypass the throttle so the card never flips late.
function _emit(streamerId, immediate) {
  const payload = snapshotFor(streamerId);
  if (!payload) return;
  if (immediate) {
    const t = _emitThrottle.get(streamerId);
    if (t && t.timer) clearTimeout(t.timer);
    _emitThrottle.delete(streamerId);
    deps.emit(streamerId, payload);
    return;
  }
  const existing = _emitThrottle.get(streamerId);
  if (existing) { existing.pending = true; return; }
  deps.emit(streamerId, payload);
  const entry = { pending: false, timer: null };
  entry.timer = setTimeout(() => {
    const wasPending = entry.pending;
    _emitThrottle.delete(streamerId);
    if (wasPending) _emit(streamerId);
  }, EMIT_THROTTLE_MS);
  _emitThrottle.set(streamerId, entry);
}

// ── Tick ────────────────────────────────────────────────────────────
// One process-wide 1s timer drives every streamer's clock. Per-streamer timers
// would leak on disable/delete and there is no precision to gain here.
function _tick() {
  const now = Date.now();

  // Pick up streamers who just enabled the vote, and re-point the term at the
  // active game if it changed by hand. syncStreamer is a cheap no-op when
  // nothing moved.
  for (const streamerId of deps.listVoteStreamers() || []) {
    syncStreamer(streamerId);
  }

  for (const streamerId of [..._votes.keys()]) {
    const config = _config(streamerId);
    if (!config) { _votes.delete(streamerId); continue; }
    const v = _votes.get(streamerId);
    if (!v) continue;

    if (v.phase === 'voting') {
      if (now >= v.voteEndsAt) endVote(streamerId);
      else _emit(streamerId);   // keeps the countdown ticking on the card
      continue;
    }
    if (v.phase === 'result') {
      if (now >= v.resultEndsAt) _resolveResult(streamerId);
      else _emit(streamerId);
      continue;
    }
    // idle — keep the term pill's countdown live, and open a vote when due
    if (_termExpired(v)) {
      if (!v.voteDueSince) v.voteDueSince = now;
      // The term almost always ends ON a win, so without this the ballot would
      // appear on top of the win card every single time.
      if (_waitingOnWinCard(v)) { _emit(streamerId); continue; }
      if (config.autoStart) startVote(streamerId);
      else if (v.termUnit === 'minutes') _startTerm(v, config);  // don't spam; restart clock
      continue;
    }
    if (v.termUnit === 'minutes') _emit(streamerId);
  }
}

function _ensureTicking() {
  if (_tickTimer) return;
  _tickTimer = setInterval(() => {
    try { _tick(); } catch (err) {
      console.warn('[GameVote] tick error:', err && err.message ? err.message : err);
    }
  }, VOTE_TICK_MS);
  if (_tickTimer.unref) _tickTimer.unref();
}

/** Demo vote for a dashboard "Test" button — real switching never fires. */
function testFire(streamerId) {
  if (!_config(streamerId)) return { ok: false, error: 'Enable the game vote first' };
  const r = startVote(streamerId);
  if (!r.ok) return r;
  return { ok: true, ballot: r.ballot };
}

function clearStreamer(streamerId) {
  _votes.delete(streamerId);
  const t = _emitThrottle.get(streamerId);
  if (t && t.timer) clearTimeout(t.timer);
  _emitThrottle.delete(streamerId);
}

/** Current phase for a streamer ('idle' | 'voting' | 'result'), or 'idle'. */
function phaseOf(streamerId) {
  const v = _votes.get(streamerId);
  return v ? v.phase : 'idle';
}

module.exports = {
  setDeps,
  // The interval body, exposed so tests can advance the clock without waiting
  // on real seconds. Nothing in the app should call this.
  _tickNow: _tick,
  syncStreamer,
  noteRound,
  noteWinCard,
  handleChat,
  startVote,
  endVote,
  cancelVote,
  snapshotFor,
  testFire,
  clearStreamer,
  phaseOf,
  // Re-exported so callers can build the same config shape server.js stores.
  normalizeConfig: _normalizeConfig,
  MAX_VOTE_CANDIDATES,
  VOTE_RE: _VOTE_RE,
};
