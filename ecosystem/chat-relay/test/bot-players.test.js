const assert = require('node:assert/strict');
const test = require('node:test');
const http = require('node:http');

const botPlayers = require('../src/bot-players');
const { T, runtimes, tick, makeAnonRoster } = botPlayers.__private;

// ── Mock game servers ─────────────────────────────────────────────
// Searchle mock: /api/session/target + /api/discord-bot/searchle/evaluate.
// Word500 mock: /api/session/target with wordLength/letterStates/guessedWords.
const API_SECRET = 'test-secret';

const searchleMock = {
  target: 'ocean',
  isWon: false,
  // evalMode: 'cold' → rank 5000 | 'hot' → rank 50 | 'allwin' → rank 1/isWin
  evalMode: 'cold',
  evalCalls: 0,
};

const word500Mock = {
  target: 'BREAD',      // uppercase, as the real game stores it
  isWon: false,
  wordLength: 5,
  letterStates: {},     // e.g. { Q: 'absent' }
  guessedWords: [],
};

let searchleServer, word500Server;
let searchlePort, word500Port;

function startMock(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.headers['x-api-key'] !== API_SECRET) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        return res.end(JSON.stringify({ ok: false, message: 'Unauthorized' }));
      }
      handler(req, res);
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function searchleHandler(req, res) {
  if (req.method === 'GET' && req.url.startsWith('/api/session/target')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, targetWord: searchleMock.target, isWon: searchleMock.isWon }));
  }
  if (req.method === 'POST' && req.url === '/api/discord-bot/searchle/evaluate') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      searchleMock.evalCalls++;
      const { guess } = JSON.parse(body || '{}');
      let rank;
      if (searchleMock.evalMode === 'allwin' || guess === searchleMock.target) rank = 1;
      else if (searchleMock.evalMode === 'hot') rank = 50;
      else rank = 5000;
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, valid: true, normalizedGuess: guess, rank, isWin: rank === 1 }));
    });
    return;
  }
  res.writeHead(404); res.end();
}

function word500Handler(req, res) {
  if (req.method === 'GET' && req.url.startsWith('/api/session/target')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      ok: true,
      targetWord: word500Mock.target,
      isWon: word500Mock.isWon,
      wordLength: word500Mock.wordLength,
      letterStates: word500Mock.letterStates,
      guessedWords: word500Mock.guessedWords,
    }));
  }
  res.writeHead(404); res.end();
}

// ── Stub deps ─────────────────────────────────────────────────────
const sent = []; // messages captured from relay.handleMessage
const state = {
  enabled: true,
  session: { gameId: 'searchle', sessionId: 'sess-1' },
  activeGames: ['searchle'],
  widgets: [],
  language: 'en',
  count: 3,
  intensity: 'busy',
};

const stubStreamers = {
  getAll: () => [{ discordId: 'D1', handle: 'teststreamer' }],
  getBotPlayers: () => ({ enabled: state.enabled, count: state.count, intensity: state.intensity }),
  getCurrentSession: () => state.session,
  getActiveGames: () => state.activeGames,
  getSearchleLanguage: () => state.language,
};

const stubStreamerGoals = {
  getForStreamer: () => ({ config: { widgets: state.widgets } }),
};

const stubRelay = {
  handleMessage: async (msg) => { sent.push(msg); },
};

const FIVE = ['apple', 'bread', 'chair', 'dance', 'eagle', 'flame', 'grape', 'house', 'input', 'juice',
              'knife', 'lemon', 'mango', 'night', 'olive', 'piano', 'queen', 'river', 'stone', 'tiger'];
const stubWordBank = {
  getTargets: (len) => {
    if (len === undefined) return { 5: FIVE };
    return (String(len) === '5') ? FIVE : [];
  },
  getDictionary: (len) => (String(len) === '5' ? FIVE : []),
  getFrequency: () => 5.0, // everything "common"
};

function resetScenario() {
  runtimes.clear();
  sent.length = 0;
  searchleMock.target = 'ocean';
  searchleMock.isWon = false;
  searchleMock.evalMode = 'cold';
  searchleMock.evalCalls = 0;
  word500Mock.target = 'BREAD';
  word500Mock.isWon = false;
  word500Mock.letterStates = {};
  word500Mock.guessedWords = [];
  state.enabled = true;
  state.session = { gameId: 'searchle', sessionId: 'sess-1' };
  state.activeGames = ['searchle'];
  state.widgets = [];
  state.language = 'en';
}

async function ticks(n) {
  for (let i = 0; i < n; i++) await tick();
}

test.before(async () => {
  searchleServer = await startMock(searchleHandler);
  word500Server = await startMock(word500Handler);
  searchlePort = searchleServer.address().port;
  word500Port = word500Server.address().port;
  // Compress the clock: no polling gaps, no stagger, no per-game floor,
  // no bump randomness — every tick can produce at most one guess per game.
  T.TARGET_POLL_MS = 0;
  T.MIN_GAP_PER_GAME_MS = 0;
  T.STAGGER_MIN_MS = 0;
  T.STAGGER_SPREAD_MS = 0;
  T.QUIET_MIN_MS = 40;
  T.QUIET_SPREAD_MS = 0;
  T.BUMP_CHANCE = 0;
  botPlayers.init({
    relay: stubRelay,
    streamers: stubStreamers,
    streamerGoals: stubStreamerGoals,
    wordBank: stubWordBank,
    gamePorts: { searchle: searchlePort, word500: word500Port },
    apiSecret: API_SECRET,
  });
  botPlayers.stop(); // kill the interval — tests drive tick() manually
});

test.after(() => {
  botPlayers.stop();
  if (searchleServer) searchleServer.close();
  if (word500Server) word500Server.close();
});

test('anon roster: distinct numbers within 1-200, honors exclusions', () => {
  const first = makeAnonRoster(8);
  const nums = first.map((p) => p.num);
  assert.equal(new Set(nums).size, 8, 'numbers are distinct');
  for (const n of nums) assert.ok(n >= 1 && n <= 200, `anon number ${n} in range`);
  const second = makeAnonRoster(8, new Set(nums));
  for (const p of second) assert.ok(!nums.includes(p.num), 'excluded numbers are not reused');
  for (const p of [...first, ...second]) {
    assert.match(p.displayName, /^Anon #\d{1,3}$/);
    assert.ok(p.skill >= 0.2 && p.skill <= 0.9);
  }
});

test('disabled bots never create runtimes or guesses', async () => {
  resetScenario();
  state.enabled = false;
  await ticks(3);
  assert.equal(runtimes.size, 0);
  assert.equal(sent.length, 0);
});

test('ineligible contexts idle: unsupported game, no session, non-english searchle', async () => {
  resetScenario();
  state.activeGames = ['rectangled'];
  await ticks(2);
  assert.equal(runtimes.size, 0);

  state.activeGames = ['searchle'];
  state.session = null;
  await ticks(2);
  assert.equal(runtimes.size, 0);

  state.session = { gameId: 'searchle' };
  state.language = 'pt-br';
  await ticks(2);
  assert.equal(runtimes.size, 0);
  assert.equal(sent.length, 0);
});

test('searchle session produces well-formed solo-routed bot guesses', async () => {
  resetScenario();
  await tick();               // tick 1: fetch target, schedule personas
  await ticks(6);             // subsequent ticks: guesses
  assert.ok(sent.length >= 3, `expected >=3 guesses, got ${sent.length}`);
  for (const msg of sent) {
    assert.equal(msg.platform, 'bot');
    assert.equal(msg._targetGame, 'searchle');
    assert.equal(msg._botSoloGame, 'searchle', 'single-game routing flag present');
    assert.equal(msg._streamerId, 'D1');
    assert.match(msg.user.id, /^bot_anon\d{1,3}$/);
    assert.match(msg.user.displayName, /^Anon #\d{1,3}$/, 'bots present as anonymous viewers');
    assert.notEqual(msg.message, searchleMock.target, 'bot must never guess the target');
  }
  // No duplicate words across bot guesses (bump chance is zeroed)
  const words = sent.map((m) => m.message);
  assert.equal(new Set(words).size, words.length);
});

test('word500 widget alongside searchle: separate rosters, separate words, solo routing', async () => {
  resetScenario();
  state.widgets = [{ id: 'w1', type: 'gameEmbed', enabled: true, displayGame: 'word500' }];
  await tick();
  assert.equal(runtimes.size, 2, 'one runtime per game family');

  // Rosters must be disjoint — the same Anon # in two games is a tell.
  const rts = [...runtimes.values()];
  const numsA = new Set(rts[0].personas.map((p) => p.num));
  for (const p of rts[1].personas) assert.ok(!numsA.has(p.num), 'anon numbers disjoint across games');

  await ticks(8);
  const searchleMsgs = sent.filter((m) => m._botSoloGame === 'searchle');
  const w500Msgs = sent.filter((m) => m._botSoloGame === 'word500');
  assert.ok(searchleMsgs.length >= 1, 'searchle bots played');
  assert.ok(w500Msgs.length >= 1, 'word500 bots played');

  const searchleIds = new Set(searchleMsgs.map((m) => m.user.id));
  for (const m of w500Msgs) {
    assert.ok(!searchleIds.has(m.user.id), 'word500 bots are different identities');
    assert.equal(m.message.length, 5, 'word500 guesses match word length');
    assert.notEqual(m.message.toUpperCase(), word500Mock.target, 'never the secret word');
  }
});

test('word500 guesses respect the board: no absent letters, no repeats', async () => {
  resetScenario();
  state.session = { gameId: 'word500', sessionId: 'sess-w' };
  state.activeGames = ['word500'];
  // Board says these letters are proven absent; APPLE/GRAPE/etc already played.
  word500Mock.letterStates = { T: 'absent', G: 'absent' };
  word500Mock.guessedWords = ['APPLE', 'BRAVE'];
  await tick();
  await ticks(8);
  const w500Msgs = sent.filter((m) => m._botSoloGame === 'word500');
  assert.ok(w500Msgs.length >= 2, `expected word500 guesses, got ${w500Msgs.length}`);
  for (const m of w500Msgs) {
    const upper = m.message.toUpperCase();
    assert.ok(!upper.includes('T') && !upper.includes('G'), `"${m.message}" avoids absent letters`);
    assert.ok(upper !== 'APPLE' && upper !== 'BRAVE', 'already-guessed words are skipped');
    assert.notEqual(upper, word500Mock.target);
  }
});

test('bots never emit a searchle win even when every word would win', async () => {
  resetScenario();
  searchleMock.evalMode = 'allwin';
  await ticks(8);
  assert.ok(searchleMock.evalCalls > 0, 'evaluate endpoint was consulted');
  assert.equal(sent.length, 0, 'no guess may be emitted when all candidates would win');
});

test('word500 never emits the secret word even when the pool is tiny', async () => {
  resetScenario();
  state.session = { gameId: 'word500', sessionId: 'sess-w' };
  state.activeGames = ['word500'];
  // Every non-secret word is already guessed — only BREAD remains in pool.
  word500Mock.guessedWords = FIVE.filter((w) => w !== 'bread').map((w) => w.toUpperCase());
  await tick();
  await ticks(8);
  const w500Msgs = sent.filter((m) => m._botSoloGame === 'word500');
  assert.equal(w500Msgs.length, 0, 'starved pool must yield silence, not the secret word');
});

test('young searchle rounds reject too-good candidates (difficulty band)', async () => {
  resetScenario();
  searchleMock.evalMode = 'hot'; // rank 50 < minRank 200 for rounds younger than 120s
  await ticks(6);
  assert.equal(sent.length, 0, 'rank-50 guesses must not appear in a fresh round');

  // Age the round past the last band boundary (minRank drops to 8) and make
  // the personas due again.
  const rt = runtimes.get('D1|searchle');
  assert.ok(rt, 'runtime exists');
  rt.roundStartedAt = Date.now() - 400000;
  for (const p of rt.personas) p.nextGuessAt = Date.now() - 1;
  await ticks(4);
  assert.ok(sent.length >= 1, 'rank-50 guesses are fine late in a round');
});

test('a won round silences bots, and they resume on the next round', async () => {
  resetScenario();
  await ticks(4);
  const before = sent.length;
  assert.ok(before >= 1, 'guesses flowed before the win');

  searchleMock.isWon = true;
  await ticks(4);            // observes the win → quiet, no new guesses
  const duringWin = sent.length;
  assert.equal(duringWin, before, 'no guesses while the round is won');

  // Round auto-restarts with a new target. Detecting the flip opens a fresh
  // quiet window (intended behavior), so poll with real delays until the
  // bots come back rather than ticking back-to-back inside the hush.
  searchleMock.isWon = false;
  searchleMock.target = 'tiger';     // note: also in the bot vocab — must be avoided
  for (let i = 0; i < 30 && sent.length <= duringWin; i++) {
    await new Promise((r) => setTimeout(r, 15));
    await tick();
  }
  assert.ok(sent.length > duringWin, 'guesses resume on the new round');
  for (const msg of sent.slice(duringWin)) {
    assert.notEqual(msg.message, 'tiger', 'new target must never be guessed');
  }
});

test('disabling mid-flight clears all runtimes', async () => {
  resetScenario();
  state.widgets = [{ id: 'w1', type: 'gameEmbed', enabled: true, displayGame: 'word500' }];
  await ticks(3);
  assert.equal(runtimes.size, 2);
  state.enabled = false;
  await tick();
  assert.equal(runtimes.size, 0);
});

test('gameShared.rewardPlayer refuses platform bot without any network call', async () => {
  const gameShared = require('../src/game-shared');
  // Point WT at a dead port — if the guard fails, this would hang/retry.
  gameShared.init({ wordEmpiresUrl: 'http://127.0.0.1:1', apiSecret: 'x' });
  const t0 = Date.now();
  const res = await gameShared.rewardPlayer('bot', 'bot_anon42', 'anon42', 'Anon #42', 5000, 'searchle', 'word', {});
  assert.equal(res.bot, true);
  assert.equal(res.skipped, true);
  assert.ok(Date.now() - t0 < 100, 'guard must return instantly (no fetch/retry)');
});
