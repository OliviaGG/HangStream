// Smoke test for the next-game vote UI surfaces.
//
// Checks the three things the browser needs that the server-side suite does not
// cover: the shared card assets actually serve, each page references them, and a
// real WebSocket client receives the `game-vote-update` snapshot the card
// renders — plus that a page-style vote (`{type:'game-vote'}`) is tallied.
//
// Run against a live server:  node server/__tests__/vote-ui.smoke.js

const WebSocket = require('ws');

const BASE = process.env.SMOKE_BASE || 'http://localhost:8080';
const WS_URL = BASE.replace(/^http/, 'ws');
// Unique per run: the vote keeps voters in memory, so a reused owner would let
// a previous run's viewer ids suppress this run's votes.
const OWNER = 'uismoke' + Date.now().toString(36);

let passed = 0;
let failed = 0;

function check(label, ok, detail) {
  if (ok) { passed++; console.log('  ok   ' + label); }
  else { failed++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}

function get(path) {
  return fetch(BASE + path).then(async (res) => ({
    status: res.status,
    text: await res.text(),
  }));
}

function postJson(path, body) {
  return fetch(BASE + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));
}

function waitFor(ws, type, timeoutMs = 4000, accept) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => { ws.off('message', onMsg); resolve(null); }, timeoutMs);
    function onMsg(raw) {
      let data;
      try { data = JSON.parse(raw.toString()); } catch (e) { return; }
      const items = data && data.type === 'batch' && Array.isArray(data.items) ? data.items : [data];
      for (const item of items) {
        if (item && item.type === type && (!accept || accept(item))) {
          clearTimeout(timer);
          ws.off('message', onMsg);
          resolve(item);
          return;
        }
      }
    }
    ws.on('message', onMsg);
  });
}

/**
 * Wait for a vote update in a specific phase. The tick re-emits `idle`
 * continuously, so matching on type alone can catch a stale frame.
 */
function waitForVotePhase(ws, phase, timeoutMs = 4000) {
  return waitFor(ws, 'game-vote-update', timeoutMs, (msg) => Boolean(msg.vote && msg.vote.phase === phase));
}

async function main() {
  console.log('Vote UI smoke test against ' + BASE + '\n');

  console.log('Shared card assets');
  const css = await get('/hangstream-vote-card.css');
  check('card stylesheet serves', css.status === 200 && css.text.includes('.hs-vote-card'), String(css.status));
  const js = await get('/hangstream-vote-card.js');
  check('card script serves', js.status === 200 && js.text.includes('HangStreamVoteCard'), String(js.status));
  check('card exposes create()', js.text.includes('create: create'));
  check('card knows the game icons', js.text.includes('spellingbee') && js.text.includes('wordle'));

  console.log('\nPages reference the card');
  const overlay = await get('/overlay/hangstream');
  check('overlay loads the card script', overlay.text.includes('/hangstream-vote-card.js'));
  check('overlay loads the card stylesheet', overlay.text.includes('/hangstream-vote-card.css'));
  check('overlay has a vote slot', overlay.text.includes('id="vote-slot"'));
  check('overlay asks for the vote state', overlay.text.includes('game-vote-state'));
  check('overlay renders vote updates', overlay.text.includes('game-vote-update'));

  const bee = await get('/spelling-bee');
  check('bee page loads the card script', bee.text.includes('/hangstream-vote-card.js'));
  check('bee page has a sidebar vote slot', bee.text.includes('hs-vote-sidebar-slot'));
  check('bee card is interactive', bee.text.includes('interactive: true'));
  check('bee hides the card in overlay mode', bee.text.includes('.hs-vote-sidebar-slot'));

  // The settings page is served at /streamer; /streamer-settings is the
  // homepage (pre-existing routing).
  const settings = await get('/streamer');
  check('settings page has the vote section', settings.text.includes('id="vote-settings-section"'));
  check('settings rotation lists the games', settings.text.includes("id: 'spellingbee'") && settings.text.includes("id: 'hangman'"));
  check('settings saves to the vote API', settings.text.includes('/games/api/vote/config'));
  check('settings can start a ballot', settings.text.includes('/games/api/vote/start'));

  console.log('\nLive vote flow over the socket');
  // A rotation with two games, so a ballot can actually open.
  const saved = await postJson('/games/api/vote/config', {
    owner: OWNER,
    config: {
      candidates: [
        { gameId: 'spellingbee', termUnit: 'rounds', termValue: 3 },
        { gameId: 'wordle', termUnit: 'rounds', termValue: 3 },
        { gameId: 'hangman', termUnit: 'rounds', termValue: 3 },
      ],
      ballotSize: 3,
      voteDurationSec: 60,
      allowKeepPlaying: true,
      autoSwitch: true,
    },
  });
  check('rotation saves from the dashboard payload shape', saved.json && saved.json.success === true, JSON.stringify(saved.json));

  const ws = new WebSocket(WS_URL);
  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
  });

  // Subscribe exactly as the pages do.
  ws.send(JSON.stringify({
    type: 'watch',
    platform: 'both',
    owner: OWNER,
    twitchChannel: OWNER,
    tiktokChannel: OWNER,
  }));

  const statePromise = waitFor(ws, 'game-vote-update');
  ws.send(JSON.stringify({ type: 'game-vote-state', owner: OWNER }));
  const stateMsg = await statePromise;
  check('socket receives a vote update', Boolean(stateMsg), 'no game-vote-update');
  check('snapshot has a phase', Boolean(stateMsg && stateMsg.vote && stateMsg.vote.phase), JSON.stringify(stateMsg && stateMsg.vote));
  // The bug this covers: a read before the first tick used to return null, so a
  // freshly loaded overlay showed nothing until the term clock caught up.
  check('idle snapshot is available before any vote (term pill)', Boolean(stateMsg && stateMsg.vote));
  check('idle snapshot reports the running term', Boolean(stateMsg && stateMsg.vote && (stateMsg.vote.termUnit || stateMsg.vote.phase === 'voting')), JSON.stringify(stateMsg && stateMsg.vote));

  // Open a ballot and confirm the update carries ballot rows the card renders.
  const updatePromise = waitForVotePhase(ws, 'voting');
  const started = await postJson('/games/api/vote/start', { owner: OWNER });
  check('ballot opens', started.json && started.json.ok === true, JSON.stringify(started.json));

  const votingMsg = await updatePromise;
  const vote = votingMsg && votingMsg.vote;
  check('update pushes the voting phase', Boolean(vote && vote.phase === 'voting'), vote && vote.phase);
  check('ballot rows have n, name, votes and pct', Boolean(vote && Array.isArray(vote.ballot) &&
    vote.ballot.length && vote.ballot.every((b) => b.n && b.name !== undefined && b.votes !== undefined && b.pct !== undefined)));
  check('active game is not a challenger', Boolean(vote && vote.ballot.filter((b) => !b.keep).every((b) => b.gameId !== vote.activeGameId)));
  check('countdown is present', Boolean(vote && vote.secondsLeft > 0), vote && String(vote.secondsLeft));

  // The viewer page votes by tapping a row — same path as a chat number.
  // Vote for a row the server actually put on the ballot rather than assuming
  // a number, so ballot ordering can't make the test lie.
  const firstRow = vote && vote.ballot && vote.ballot[0];
  const ackPromise = waitFor(ws, 'game-vote-action', 4000, (m) => m.action === 'vote');
  ws.send(JSON.stringify({
    type: 'game-vote',
    owner: OWNER,
    platform: 'web',
    viewerId: 'ui-viewer-1',
    choice: String(firstRow ? firstRow.n : 1),
  }));
  const ack = await ackPromise;
  check('page vote is accepted', Boolean(ack && ack.voted === true), JSON.stringify(ack));

  const afterState = JSON.parse((await get('/games/api/vote/state?owner=' + OWNER)).text);
  check('tally reflects the page vote', Boolean(afterState.vote && afterState.vote.totalVotes === 1), afterState.vote && String(afterState.vote.totalVotes));

  // One viewer, one vote — the card must not be able to double-count.
  const otherRow = vote && vote.ballot && (vote.ballot[1] || vote.ballot[0]);
  const dupPromise = waitFor(ws, 'game-vote-action', 4000, (m) => m.action === 'vote');
  ws.send(JSON.stringify({ type: 'game-vote', owner: OWNER, platform: 'web', viewerId: 'ui-viewer-1', choice: String(otherRow ? otherRow.n : 2) }));
  const dup = await dupPromise;
  check('repeat tap from the same viewer is ignored', Boolean(dup && dup.voted !== true), JSON.stringify(dup));

  const idlePromise = waitForVotePhase(ws, 'idle');
  await postJson('/games/api/vote/cancel', { owner: OWNER });
  const idleMsg = await idlePromise;
  check('cancelling pushes an idle update', Boolean(idleMsg && idleMsg.vote && idleMsg.vote.phase === 'idle'), idleMsg && idleMsg.vote && idleMsg.vote.phase);

  // Leave no rotation behind for the next run.
  await postJson('/games/api/vote/config', { owner: OWNER, enabled: false });

  ws.close();

  console.log('\n' + passed + ' passed, ' + failed + ' failed');
  if (failed) process.exitCode = 1;
  // Let the sockets finish closing before the process exits naturally; a hard
  // process.exit() here trips a libuv assertion on Windows.
}

main().catch((err) => {
  console.error('vote-ui smoke failed:', err && err.message ? err.message : err);
  process.exitCode = 1;
});
