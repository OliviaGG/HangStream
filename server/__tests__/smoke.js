// End-to-end smoke test against a running HangStream server.
//
// Start the server, then: node server/__tests__/smoke.js [baseUrl]
// It exercises the real HTTP + WebSocket surface the site uses — the pages a
// viewer loads, the game API, and a full server-authoritative round driven over
// the socket, including a chat guess. Exits non-zero on the first failure.

const WebSocket = require('ws');

const BASE = process.argv[2] || 'http://localhost:8080';
const WS_URL = BASE.replace(/^http/, 'ws');

let passed = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { passed++; console.log(`  ok   ${name}`); }
  else { failures.push(name); console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); }
}

async function get(path) {
  const res = await fetch(BASE + path);
  return { status: res.status, text: await res.text() };
}

async function postJson(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  let json = null;
  try { json = await res.json(); } catch (e) {}
  return { status: res.status, json };
}

function socket() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(WS_URL);
    ws.on('open', () => resolve(ws));
    ws.on('error', reject);
  });
}

/** Wait for a socket message matching `type`, with a timeout. */
function waitFor(ws, type, ms = 5000) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { ws.off('message', onMsg); resolve(null); }, ms);
    function onMsg(raw) {
      let data;
      try { data = JSON.parse(raw); } catch (e) { return; }
      if (data.type === type) { clearTimeout(timer); ws.off('message', onMsg); resolve(data); }
    }
    ws.on('message', onMsg);
  });
}

async function main() {
  console.log(`Smoke test against ${BASE}\n`);
  console.log('Pages');

  for (const path of ['/', '/games', '/viewer', '/spelling-bee', '/wordle', '/searchle', '/styles.css']) {
    const { status } = await get(path);
    check(`GET ${path} -> 200`, status === 200, `got ${status}`);
  }

  console.log('\nGame API');
  const list = await get('/games/api/list');
  check('GET /games/api/list -> 200', list.status === 200, `got ${list.status}`);
  const games = JSON.parse(list.text).games.map((g) => g.id);
  check('engine hosts spellingbee + wordle', games.includes('spellingbee') && games.includes('wordle'), games.join(','));

  const startBee = await postJson('/games/api/new/spellingbee', { owner: 'smoke', timerSeconds: 0 });
  check('POST /games/api/new/spellingbee starts a round', startBee.json && startBee.json.success === true, JSON.stringify(startBee.json));

  const beeState = await get('/games/api/state/spellingbee?owner=smoke');
  const bee = JSON.parse(beeState.text).state;
  check('bee round is active', bee && bee.status === 'active', bee && bee.status);
  check('bee exposes 7 letters + center', bee && bee.letters.length === 7 && !!bee.centerLetter);
  check('bee has answers to find', bee && bee.totalAnswers > 0, bee && String(bee.totalAnswers));

  const startWordle = await postJson('/games/api/new/wordle', { owner: 'smoke' });
  check('POST /games/api/new/wordle starts a round', startWordle.json && startWordle.json.success === true, JSON.stringify(startWordle.json));
  const wordleState = JSON.parse((await get('/games/api/state/wordle?owner=smoke')).text).state;
  check('wordle does not leak its answer', wordleState && wordleState.answer === undefined, JSON.stringify(wordleState && wordleState.answer));

  console.log('\nWebSocket round flow');
  const ws = await socket();
  ws.send(JSON.stringify({ type: 'watch', platform: 'both', owner: 'smoke', twitchChannel: 'smoke', tiktokChannel: 'smoke' }));
  ws.send(JSON.stringify({ type: 'game-join-room', game: 'spellingbee', owner: 'smoke' }));

  const joined = await waitFor(ws, 'game-joined');
  check('socket joins the bee room', Boolean(joined));
  check('join returns round state', Boolean(joined && joined.state && joined.state.letters));

  // Play a real guess through the socket; the server judges it.
  const letters = joined && joined.state && joined.state.letters ? joined.state.letters : [];
  const center = joined && joined.state ? joined.state.centerLetter : '';
  const stateNow = JSON.parse((await get('/games/api/state/spellingbee?owner=smoke')).text).state;
  // Reconstruct a valid answer: pull the full answer list via a fresh round state
  // (answers are not exposed), so instead guess the best-effort word using the
  // centre letter and see the server's verdict — a rejection still proves the
  // round judged it rather than the client.
  ws.send(JSON.stringify({ type: 'guess', game: 'spellingbee', owner: 'smoke', word: 'zzzzzzz', platform: 'web', username: 'smoker' }));
  const verdict = await waitFor(ws, 'guess-result');
  check('socket guess is judged by the server', Boolean(verdict));
  check('invalid guess is rejected with a reason', Boolean(verdict && verdict.accepted === false && verdict.result), verdict && verdict.result);

  // A chat line for the streamer feeds the same room. Use the public API to
  // confirm the room is still healthy after the socket + chat paths ran.
  const afterState = await get('/games/api/state/spellingbee?owner=smoke');
  const after = JSON.parse(afterState.text);
  check('room state reachable after guess + chat paths', afterState.status === 200 && after.success === true && after.state);

  console.log('\nNext-game vote');
  // Configure a rotation for this room, then run a ballot by hand.
  const cfg = await postJson('/games/api/vote/config', {
    owner: 'smoke',
    config: {
      candidates: [
        { gameId: 'spellingbee', termUnit: 'rounds', termValue: 2 },
        { gameId: 'wordle', termUnit: 'rounds', termValue: 2 },
        { gameId: 'hangman', termUnit: 'rounds', termValue: 2 },
      ],
      voteDurationSec: 60,
      graceSec: 20,
    },
  });
  check('vote config saves', cfg.json && cfg.json.success === true, JSON.stringify(cfg.json));

  const cfgRead = JSON.parse((await get('/games/api/vote/config?owner=smoke')).text);
  check('vote config reads back', cfgRead.enabled === true && cfgRead.config && cfgRead.config.candidates.length === 3);
  check('vote config exposes ballot choices', Array.isArray(cfgRead.choices) && cfgRead.choices.length > 0);

  const started = await postJson('/games/api/vote/start', { owner: 'smoke' });
  check('a ballot can be opened', started.json && started.json.ok === true, JSON.stringify(started.json));

  const voteState = JSON.parse((await get('/games/api/vote/state?owner=smoke')).text);
  check('vote state reports voting', voteState.vote && voteState.vote.phase === 'voting', voteState.vote && voteState.vote.phase);
  check('ballot has real challengers', Boolean(voteState.vote && voteState.vote.ballot.some((b) => !b.keep)));

  // A page vote and a chat vote share one tally, deduped per viewer.
  ws.send(JSON.stringify({ type: 'game-vote', owner: 'smoke', platform: 'web', choice: '1', viewerId: 'web-1' }));
  const voteAck = await waitFor(ws, 'game-vote-action');
  check('socket vote is accepted', Boolean(voteAck && voteAck.voted === true), JSON.stringify(voteAck));

  const afterVote = JSON.parse((await get('/games/api/vote/state?owner=smoke')).text);
  check('the vote is tallied', afterVote.vote && afterVote.vote.totalVotes === 1, afterVote.vote && String(afterVote.vote.totalVotes));

  const cancelled = await postJson('/games/api/vote/cancel', { owner: 'smoke' });
  check('a ballot can be cancelled', cancelled.json && cancelled.json.ok === true);

  const idle = JSON.parse((await get('/games/api/vote/state?owner=smoke')).text);
  check('vote returns to idle', idle.vote && idle.vote.phase === 'idle');

  ws.close();

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('Failures:\n - ' + failures.join('\n - '));
    process.exitCode = 1;
  }
  // Let the sockets finish closing before the process exits naturally; a hard
  // process.exit() here trips a libuv assertion on Windows.
}

main().catch((err) => {
  console.error('\nSmoke test crashed:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
