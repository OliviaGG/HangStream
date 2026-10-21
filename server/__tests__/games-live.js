// Live end-to-end check for the three newly added engine games.
// Requires `node server/server.js` on :8080.
const WebSocket = require('C:/Users/Olivia Garcia-Godos/HangStream/node_modules/ws');

const BASE = 'http://localhost:8080';
const WS = 'ws://localhost:8080';
// A fresh room per run: rounds persist to SQLite, so reusing one owner would
// let a previous run's state bleed into this one.
const OWNER = `e2e${Date.now().toString(36)}`;

async function post(path, body) {
  const res = await fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}
async function get(path) {
  const res = await fetch(BASE + path);
  return { status: res.status, json: await res.json().catch(() => null) };
}

const checks = [];
function check(name, cond, extra) {
  checks.push({ name, ok: !!cond, extra: extra === undefined ? '' : JSON.stringify(extra) });
}

(async () => {
  // ── Hangman round over HTTP ──
  const h = await post('/games/api/new/hangman', { owner: OWNER, timerSeconds: 0 });
  check('hangman round starts', h.json && h.json.success, h.json && h.json.error);
  const hs = await get(`/games/api/state/hangman?owner=${OWNER}`);
  check('hangman state served', hs.json && hs.json.state, hs.status);
  check('hangman answer not leaked', hs.json && hs.json.state && !('word' in hs.json.state));
  check('hangman has a masked board', hs.json && hs.json.state && Array.isArray(hs.json.state.mask));

  // ── Speed Scramble round ──
  const s = await post('/games/api/new/speedscramble', { owner: OWNER, timerSeconds: 30 });
  check('speedscramble round starts', s.json && s.json.success, s.json && s.json.error);
  const ss = await get(`/games/api/state/speedscramble?owner=${OWNER}`);
  check('speedscramble state has scrambled word', ss.json && ss.json.state && ss.json.state.scrambled, ss.status);
  check('speedscramble hides answer live', ss.json && ss.json.state && ss.json.state.answer === undefined);

  // ── Searchle round (async model) ──
  const sl = await post('/games/api/new/searchle', { owner: OWNER, timerSeconds: 0 });
  check('searchle round starts', sl.json && sl.json.success, sl.json && sl.json.error);
  const sls = await get(`/games/api/state/searchle?owner=${OWNER}`);
  check('searchle state has maxGuesses', sls.json && sls.json.state && sls.json.state.maxGuesses === 10);
  check('searchle target hidden live', sls.json && sls.json.state && sls.json.state.answer === undefined);

  // ── WS guess path for hangman (letter) and Searchle (async) ──
  const ws = new WebSocket(WS);
  const replies = [];
  await new Promise((resolve) => { ws.on('open', resolve); ws.on('error', resolve); });
  ws.send(JSON.stringify({ type: 'watch', platform: 'both', owner: OWNER, twitchChannel: OWNER, tiktokChannel: OWNER }));
  ws.on('message', (raw) => { try { replies.push(JSON.parse(raw.toString())); } catch (_) {} });

  /** Wait for a message to arrive rather than sleeping a fixed amount. */
  const waitFor = (predicate, timeoutMs) => new Promise((resolve) => {
    const started = Date.now();
    const tick = () => {
      const hit = replies.find(predicate);
      if (hit) return resolve(hit);
      if (Date.now() - started > timeoutMs) return resolve(null);
      setTimeout(tick, 50);
    };
    tick();
  });

  // A letter guess on hangman gets a guess-result with a mask.
  ws.send(JSON.stringify({ type: 'guess', game: 'hangman', owner: OWNER, letter: 'e', platform: 'web', username: 'webguy' }));
  const letterReply = await waitFor((m) => m.type === 'guess-result' && m.game === 'hangman', 5000);
  check('hangman WS letter guess answered', letterReply, letterReply && letterReply.result);

  // A Searchle guess round-trips through the async ranker.
  ws.send(JSON.stringify({ type: 'guess', game: 'searchle', owner: OWNER, word: 'ocean', platform: 'web', username: 'webguy' }));
  const slReply = await waitFor((m) => m.type === 'guess-result' && m.game === 'searchle', 30000);
  check('searchle WS guess answered asynchronously', slReply, slReply && { result: slReply.result, rank: slReply.rank });

  // ── Vote now lists all real games ──
  const voteState = await get(`/games/api/vote/state?owner=${OWNER}`);
  const choices = (voteState.json && voteState.json.choices || []).map((c) => c.id);
  check('vote offers all five games', ['hangman', 'spellingbee', 'speedscramble', 'wordle', 'searchle'].every((id) => choices.includes(id)), choices);

  // ── Each game's page still serves ──
  for (const path of ['/hangman/solo', '/speed-scramble/solo', '/searchle/solo', '/wordle/solo', '/spelling-bee/solo']) {
    const res = await fetch(BASE + path);
    check(`page ${path} serves`, res.status === 200, res.status);
  }

  // ── Report ──
  let failed = 0;
  for (const c of checks) {
    if (!c.ok) failed++;
    console.log(`${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.extra ? '  ' + c.extra : ''}`);
  }
  console.log(`\n${checks.length - failed} passed, ${failed} failed`);
  process.exitCode = failed ? 1 : 0;
  ws.close();
})().catch((e) => { console.error('ERR', e); process.exitCode = 1; });
