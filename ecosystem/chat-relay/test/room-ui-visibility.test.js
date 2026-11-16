const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const roomDir = path.join(__dirname, '..', 'public', 'room');
const html = fs.readFileSync(path.join(roomDir, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(roomDir, 'room.css'), 'utf8');
const js = fs.readFileSync(path.join(roomDir, 'room.js'), 'utf8');

test('owner-only room controls cannot override the hidden attribute', () => {
  assert.match(html, /id="owner-controls" hidden/);
  assert.match(html, /id="vote-card"[^>]* hidden/);
  assert.match(css, /\[hidden\]\s*\{\s*display:\s*none\s*!important;/);
});

test('viewers see the vote card only during an active vote', () => {
  assert.match(js, /showVoteCard = isOwner \|\| phase === 'voting'/);
  assert.match(js, /startVote\.hidden = !isOwner \|\| phase !== 'idle'/);
  assert.match(js, /finishVote\.hidden = !isOwner \|\| phase !== 'voting'/);
  assert.match(js, /cancelVote\.hidden = !isOwner \|\| phase === 'idle'/);
});
