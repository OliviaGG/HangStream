// Synapse streamer arena — chat plumbing regression tests.
//
// Two separate breakages shipped together and made the /streamer Synapse
// widget look inert (2026-07-26):
//
//   1. relay.js fed the arena only when `msg._targetGame === 'synapse'`, i.e.
//      only when Synapse was the streamer's PRIMARY active game. But the Game
//      widget's "Displayed game" dropdown is built from the same option list,
//      so a widget could be pinned to Synapse (with its own chat prefix) while
//      chat routed somewhere else entirely — the arena then never saw a word.
//      Synapse has no game server of its own, so unlike every other game it is
//      NOT reachable by an io.to(room) emit; it must be fed from the resolved
//      widget route directly.
//   2. `registerSynapseStreamer().handleChat` is the only input the arena has —
//      if it stops turning a comment into a board word, nothing else notices,
//      because every call site swallows errors so chat can't break.
//
// Part 1 pins the route resolution; part 2 pins the sink itself.

const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveWidgetChatTargets } = require('../src/widget-chat-routing');
const { registerSynapseStreamer } = require('../src/synapse-mp');

const drain = async () => { for (let i = 0; i < 30; i++) await new Promise((r) => setImmediate(r)); };

// ── 1. Widget routing must surface a synapse route ─────────────────────────
test('a game widget pinned to Synapse resolves a synapse route even when the active game is not Synapse', () => {
  const out = resolveWidgetChatTargets({
    widgets: [
      { id: 'gameEmbed-1', type: 'gameEmbed', enabled: true, displayGame: '' },        // follows active game
      { id: 'gameEmbed-2', type: 'gameEmbed', enabled: true, displayGame: 'synapse' }, // pinned
    ],
    activeGames: ['searchle-grid'],
    targetGame: 'searchle',
    normalized: { message: 'ocean' },
  });

  assert.equal(out.usedWidgetRouting, true);
  const synapse = out.targets.find((t) => t.gameId === 'synapse');
  assert.ok(synapse, `no synapse route resolved (got ${JSON.stringify(out.targets)})`);
  assert.equal(synapse.message, 'ocean');
});

test('a Synapse widget chat prefix is stripped before the arena sees the word', () => {
  const out = resolveWidgetChatTargets({
    widgets: [
      { id: 'gameEmbed-1', type: 'gameEmbed', enabled: true, displayGame: 'betwixt', chatPrefix: '/' },
      { id: 'gameEmbed-2', type: 'gameEmbed', enabled: true, displayGame: 'synapse', chatPrefix: '!' },
    ],
    activeGames: ['betwixt'],
    targetGame: 'betwixt',
    normalized: { message: '! ocean' },
  });

  const synapse = out.targets.find((t) => t.gameId === 'synapse');
  assert.ok(synapse, 'prefixed message never reached the synapse route');
  assert.equal(synapse.message, 'ocean', 'prefix (and its trailing space) must be stripped');
});

test('a widget following the active game resolves synapse when synapse IS the active game', () => {
  const out = resolveWidgetChatTargets({
    widgets: [{ id: 'gameEmbed-1', type: 'gameEmbed', enabled: true, displayGame: '' }],
    activeGames: ['synapse'],
    targetGame: 'synapse',
    normalized: { message: 'ocean' },
  });

  assert.deepEqual(out.targets.map((t) => t.gameId), ['synapse']);
});

// ── 2. The sink itself must turn a comment into a board word ───────────────
function makeArena() {
  const emitted = [];
  const io = {
    on: () => {},
    to: (room) => ({ emit: (evt, payload) => emitted.push({ room, evt, payload }) }),
  };
  const streamer = registerSynapseStreamer(io, {
    // Every pair is "known" but well under LINK_THRESHOLD, so words land on the
    // board without accidentally bridging the corners and ending the match.
    fetchSims: async (pairs) => pairs.map(() => ({ score: 0.2 })),
    resolvePair: async () => ['alpha', 'omega'],
    wordBank: { isValidWord: (w) => ['bank', 'river', 'ocean'].includes(w) },
  });
  return { streamer, emitted };
}

const STREAMER_ID = '179331908499406849';
const ROOM = 'synapse-mp:streamer:' + STREAMER_ID;

const comment = (message, id = 'u1') => ({
  platform: 'tiktok',
  message,
  user: { id, username: 'viewer' + id, displayName: 'Viewer ' + id },
});

// The comment that spins an arena up must not be the one that gets thrown
// away: startMatch() is a network round-trip, and until 2026-07-26 handleChat
// submitted straight into the still-null match and lost the word.
test('handleChat picks the first valid word out of a comment and puts it on the viewer board', async () => {
  const { streamer, emitted } = makeArena();

  streamer.handleChat(STREAMER_ID, comment('i think BANK works here'));
  await drain();

  const update = emitted.find((e) => e.evt === 'synapse-mp:update');
  assert.ok(update, `no update broadcast (saw ${emitted.map((e) => e.evt).join(', ')})`);
  assert.equal(update.room, ROOM, 'update must be scoped to the streamer arena room');
  assert.equal(update.payload.word, 'bank');
  assert.deepEqual(update.payload.board.words, ['bank']);

  const join = emitted.find((e) => e.evt === 'synapse-mp:join');
  assert.ok(join, 'viewer was never announced to the arena');
  assert.equal(join.payload.player.id, 'tt:u1');
  assert.equal(join.payload.player.name, 'Viewer u1');
});

test('each chatter gets their own board, and non-words are ignored without a broadcast', async () => {
  const { streamer, emitted } = makeArena();

  streamer.handleChat(STREAMER_ID, comment('river', 'u1'));
  streamer.handleChat(STREAMER_ID, comment('ocean', 'u2'));
  await drain();

  const boards = new Map(
    emitted.filter((e) => e.evt === 'synapse-mp:update').map((e) => [e.payload.playerId, e.payload.board.words])
  );
  assert.deepEqual(boards.get('tt:u1'), ['river']);
  assert.deepEqual(boards.get('tt:u2'), ['ocean']);

  const before = emitted.length;
  streamer.handleChat(STREAMER_ID, comment('lmaooo 🔥', 'u3'));
  await drain();
  assert.equal(emitted.length, before, 'a comment with no dictionary word must not touch the arena');
});

test('arenas are keyed per streamer — one streamer\'s chat never lands on another\'s board', async () => {
  const { streamer, emitted } = makeArena();
  const OTHER = '1492149043630047325';

  streamer.handleChat(OTHER, comment('river'));
  streamer.handleChat(STREAMER_ID, comment('bank'));
  await drain();

  const updates = emitted.filter((e) => e.evt === 'synapse-mp:update');
  assert.equal(updates.length, 2, 'each streamer should have produced exactly one update');

  const mine = updates.find((u) => u.room === ROOM);
  const theirs = updates.find((u) => u.room === 'synapse-mp:streamer:' + OTHER);
  assert.ok(mine && theirs, 'both arenas should have broadcast to their own room');
  assert.deepEqual(mine.payload.board.words, ['bank']);
  assert.deepEqual(theirs.payload.board.words, ['river'], 'a guess leaked across streamer arenas');
});
