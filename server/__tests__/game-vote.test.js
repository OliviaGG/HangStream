// Tests for the next-game vote (server/games/game-vote.js) — a port of
// chat-relay/src/game-vote.js from word-tycoon-ecosystem. Each test pins one of
// the deliberate behaviours documented in the module header.

const test = require('node:test');
const assert = require('node:assert/strict');

const gameVote = require('../games/game-vote');

/**
 * Wire the module the way server.js does, with an in-memory world:
 *   config      — the streamer's rotation
 *   activeGame  — which game's term is running
 *   switched    — record of switchGame calls
 */
function harness({ config, activeGame = 'spellingbee' } = {}) {
  const emitted = [];
  const switched = [];
  let active = activeGame;
  let cfg = config;

  gameVote.setDeps({
    getConfig: () => cfg,
    listVoteStreamers: () => (cfg ? ['caster'] : []),
    emit: (streamerId, payload) => emitted.push(payload),
    getActiveGame: () => active,
    switchGame: (streamerId, gameId) => { switched.push(gameId); active = gameId; },
    gameLabel: (id) => ({ spellingbee: 'Spelling Bee', wordle: 'Wordle', hangman: 'Hangman', searchle: 'Searchle' }[id] || id),
    getWinCardHoldMs: () => 0,
  });

  return {
    emitted, switched,
    setActive(gameId) { active = gameId; },
    setConfig(next) { cfg = next; },
    gameVote,
  };
}

const ROTATION = {
  candidates: [
    { gameId: 'spellingbee', termUnit: 'rounds', termValue: 2 },
    { gameId: 'wordle', termUnit: 'rounds', termValue: 2 },
    { gameId: 'hangman', termUnit: 'rounds', termValue: 2 },
  ],
  ballotSize: 3,
  voteDurationSec: 60,
  graceSec: 20,
  autoStart: true,
  autoSwitch: true,
  allowKeepPlaying: true,
};

/** Always start from clean module state — it is a process-wide singleton. */
function reset() { gameVote.clearStreamer('caster'); }

test('ballot excludes the active game and appends "keep playing" last', () => {
  reset();
  harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  const r = gameVote.startVote('caster');
  assert.equal(r.ok, true);

  const ballot = r.ballot;
  const challengers = ballot.filter((b) => !b.keep).map((b) => b.gameId);
  assert.ok(!challengers.includes('spellingbee'), 'active game is not a challenger');
  assert.equal(ballot[ballot.length - 1].keep, true, 'keep-playing is last');
  assert.equal(ballot[ballot.length - 1].gameId, 'spellingbee');
  // Numbers are 1..n with no gaps.
  assert.deepEqual(ballot.map((b) => b.n), ballot.map((_, i) => i + 1));
});

test('chat votes with a bare number, #n, and !vote n', () => {
  reset();
  harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  gameVote.startVote('caster');

  for (const [i, text] of ['1', '#1', '!vote 1', '/vote 1'].entries()) {
    const r = gameVote.handleChat('caster', { platform: 'twitch', message: text, user: { id: `viewer${i}` } });
    assert.equal(r && r.voted, true, `"${text}" should count`);
  }
  // Four distinct viewers all landed on row 1.
  const snap = gameVote.snapshotFor('caster');
  assert.equal(snap.ballot[0].votes, 4);
});

test('one viewer, one vote — the first wins', () => {
  reset();
  harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  gameVote.startVote('caster');

  const first = gameVote.handleChat('caster', { platform: 'twitch', message: '1', user: { id: 'same' } });
  assert.equal(first.voted, true);
  const second = gameVote.handleChat('caster', { platform: 'twitch', message: '2', user: { id: 'same' } });
  assert.equal(second, undefined, 'repeat vote is ignored');

  const snap = gameVote.snapshotFor('caster');
  assert.equal(snap.totalVotes, 1);
  assert.equal(snap.ballot[0].votes, 1);
  assert.equal(snap.ballot[1].votes, 0);
});

test('votes only count while a ballot is open', () => {
  reset();
  harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  // No startVote — idle. A bare number must pass through untouched.
  const r = gameVote.handleChat('caster', { platform: 'twitch', message: '1', user: { id: 'early' } });
  assert.equal(r, undefined);
});

test('a viewer with no identifiable id cannot vote', () => {
  reset();
  harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  gameVote.startVote('caster');
  const r = gameVote.handleChat('caster', { platform: 'twitch', message: '1', user: {} });
  assert.equal(r, undefined);
  assert.equal(gameVote.snapshotFor('caster').totalVotes, 0);
});

test('no votes means no switch — the term just restarts', () => {
  reset();
  const h = harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  gameVote.startVote('caster');

  const result = gameVote.endVote('caster');
  assert.equal(result.winner, null);
  assert.equal(result.reason, 'no-votes');
  assert.equal(h.switched.length, 0, 'never switch to a game nobody asked for');
  assert.equal(gameVote.phaseOf('caster'), 'idle');
});

test('the winner switches the active game after the grace period', () => {
  reset();
  const h = harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  gameVote.startVote('caster');

  // Row 1 is the first challenger on a fresh ballot (least-recently-played).
  gameVote.handleChat('caster', { platform: 'twitch', message: '1', user: { id: 'a' } });
  const ended = gameVote.endVote('caster');
  assert.equal(ended.ok, true);
  assert.ok(ended.winner);

  // Grace period is 20s; advance the clock past it via the injected tick.
  const realNow = Date.now;
  Date.now = () => realNow() + 25_000;
  try { gameVote._tickNow(); } finally { Date.now = realNow; }

  assert.deepEqual(h.switched, [ended.winner]);
});

test('"keep playing" winning switches nothing and restarts the term', () => {
  reset();
  const h = harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  const start = gameVote.startVote('caster');
  const keepRow = start.ballot.find((b) => b.keep);

  gameVote.handleChat('caster', { platform: 'twitch', message: String(keepRow.n), user: { id: 'a' } });
  const ended = gameVote.endVote('caster');
  assert.equal(ended.winner, 'spellingbee');

  const realNow = Date.now;
  Date.now = () => realNow() + 25_000;
  try { gameVote._tickNow(); } finally { Date.now = realNow; }

  assert.equal(h.switched.length, 0, 'keep-playing never switches');
});

test('autoSwitch off announces the winner without switching', () => {
  reset();
  const h = harness({ config: { ...ROTATION, autoSwitch: false }, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  gameVote.startVote('caster');
  gameVote.handleChat('caster', { platform: 'twitch', message: '1', user: { id: 'a' } });
  const ended = gameVote.endVote('caster');
  assert.ok(ended.winner);

  const realNow = Date.now;
  Date.now = () => realNow() + 25_000;
  try { gameVote._tickNow(); } finally { Date.now = realNow; }
  assert.equal(h.switched.length, 0);
});

test('a tie is flagged and resolved by a random pick among leaders', () => {
  reset();
  harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  gameVote.startVote('caster');

  gameVote.handleChat('caster', { platform: 'twitch', message: '1', user: { id: 'a' } });
  gameVote.handleChat('caster', { platform: 'twitch', message: '2', user: { id: 'b' } });
  const ended = gameVote.endVote('caster');
  assert.equal(ended.tiebreak, true);
  assert.ok(['wordle', 'hangman'].includes(ended.winner));
  assert.equal(gameVote.snapshotFor('caster').tiebreak, true);
});

test('rounds win burn down the term and open a vote when it expires', () => {
  reset();
  harness({ config: ROTATION, activeGame: 'spellingbee' }); // termValue 2
  gameVote.syncStreamer('caster');

  // A win in a DIFFERENT game must not count toward this term.
  gameVote.noteRound('caster', 'wordle');
  assert.equal(gameVote.snapshotFor('caster').roundsDone, 0);

  gameVote.noteRound('caster', 'spellingbee');
  assert.equal(gameVote.snapshotFor('caster').roundsDone, 1);
  assert.equal(gameVote.phaseOf('caster'), 'idle');

  gameVote.noteRound('caster', 'spellingbee');
  // Term (2 rounds) is now met; the tick opens the ballot because autoStart.
  gameVote._tickNow();
  assert.equal(gameVote.phaseOf('caster'), 'voting');
});

test('an active game outside the rotation has no term and never votes', () => {
  reset();
  harness({ config: ROTATION, activeGame: 'searchle' }); // not a candidate
  gameVote.syncStreamer('caster');
  gameVote.noteRound('caster', 'searchle');
  gameVote._tickNow();
  const snap = gameVote.snapshotFor('caster');
  assert.equal(snap.inRotation, false);
  assert.equal(snap.phase, 'idle');
});

test('a rotation too thin to ballot stalls instead of opening a one-row vote', () => {
  reset();
  harness({
    config: { ...ROTATION, candidates: [{ gameId: 'spellingbee', termUnit: 'rounds', termValue: 1 }] },
    activeGame: 'spellingbee',
  });
  gameVote.syncStreamer('caster');
  const r = gameVote.startVote('caster');
  assert.equal(r.ok, false);
  assert.equal(gameVote.snapshotFor('caster').stalledReason, 'needs-candidates');
});

test('least-recently-played games fill the ballot first', () => {
  reset();
  const h = harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  gameVote.startVote('caster');

  // Switch to wordle, then to hangman. Now spellingbee and wordle are oldest.
  h.setActive('wordle'); gameVote.syncStreamer('caster');
  h.setActive('hangman'); gameVote.syncStreamer('caster');

  const r = gameVote.startVote('caster');
  assert.equal(r.ok, true);
  // hangman is active so it is excluded; spellingbee (played longest ago) leads.
  assert.equal(r.ballot[0].gameId, 'spellingbee');
});

test('id aliases are normalised (spelling-bee === spellingbee)', () => {
  reset();
  const h = harness({ config: ROTATION, activeGame: 'spellingbee' });
  gameVote.syncStreamer('caster');
  // A win reported under the alias still counts toward the real term.
  gameVote.noteRound('caster', 'spelling-bee');
  gameVote.noteRound('caster', 'spelling-bee');
  gameVote._tickNow();
  assert.equal(gameVote.phaseOf('caster'), 'voting');
  assert.equal(h.switched.length, 0);
});

test('snapshot is readable before the tick, with the term already running', () => {
  reset();
  // No syncStreamer and no tick — this is a page asking on first load.
  harness({ config: ROTATION, activeGame: 'spellingbee' });
  const snap = gameVote.snapshotFor('caster');
  assert.ok(snap, 'a configured streamer must have a snapshot immediately');
  assert.equal(snap.phase, 'idle');
  assert.equal(snap.termUnit, 'rounds');
  assert.equal(snap.termValue, 2);
  assert.equal(snap.roundsDone, 0);
  assert.equal(snap.inRotation, true);
});

test('snapshot is null when the vote is not configured', () => {
  reset();
  harness({ config: null, activeGame: 'spellingbee' });
  assert.equal(gameVote.snapshotFor('caster'), null);
});

test('a rotation with no explicit active game uses the first candidate', () => {
  reset();
  // The dashboard can save a rotation without naming a current game. Without a
  // fallback there would be no term to run down and the vote could never fire.
  harness({ config: ROTATION, activeGame: null });
  const snap = gameVote.snapshotFor('caster');
  assert.ok(snap, 'snapshot still available');
  assert.equal(snap.activeGameId, 'spellingbee', 'first candidate becomes active');
  assert.equal(snap.inRotation, true);
  assert.equal(snap.termUnit, 'rounds');
  assert.equal(snap.termValue, 2);
  // And its term actually burns down.
  gameVote.noteRound('caster', 'spellingbee');
  gameVote.noteRound('caster', 'spellingbee');
  gameVote._tickNow();
  assert.equal(gameVote.phaseOf('caster'), 'voting');
});

test('config normalisation clamps durations and dedupes the rotation', () => {
  const cfg = gameVote.normalizeConfig({
    candidates: [
      { gameId: 'wordle', termUnit: 'rounds', termValue: 999 },
      { gameId: 'wordle', termUnit: 'minutes', termValue: 10 }, // duplicate
      { gameId: 'hangman', termUnit: 'minutes', termValue: 9999 },
    ],
    ballotSize: 99,
    voteDurationSec: 5,
    graceSec: 1000,
  });
  assert.equal(cfg.candidates.length, 2, 'duplicate game dropped');
  assert.equal(cfg.candidates[0].termValue, 50, 'rounds clamped to 50');
  assert.equal(cfg.candidates[1].termValue, 240, 'minutes clamped to 240');
  assert.equal(cfg.voteDurationSec, 15, 'duration clamped to >= 15');
  assert.equal(cfg.graceSec, 300, 'grace clamped to <= 300');
});
