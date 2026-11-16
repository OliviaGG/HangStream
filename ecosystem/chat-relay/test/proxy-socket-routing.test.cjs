'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function proxySocket(gameId) {
  const source = fs.readFileSync(path.join(__dirname, '../server.js'), 'utf8');
  const start = source.indexOf('      const proxiedSocketPath =');
  const end = source.indexOf('      body = body.replace(', start);
  assert.ok(start > 0 && end > start, 'Use the actual game proxy injection');
  const inject = vm.runInNewContext(source.slice(start, end) + '\nioLateFix;', { game: { id: gameId } });
  const script = inject.replace(/^<script>/, '').replace(/<\/script>$/, '');
  const calls = [];
  const original = (...args) => { calls.push(args); return { connected: true }; };
  original.Manager = function Manager() {};
  original.Socket = function Socket() {};
  original.protocol = 5;
  const window = { io: original };
  vm.runInNewContext(script, { window });
  return { window, calls, original, script };
}

test('legacy room game sockets stay on the page origin and preserve private-session auth', () => {
  for (const gameId of ['wikisearchle', 'searchle', 'wordle']) {
    const f = proxySocket(gameId);
    const options = { path: '/socket.io', auth: { session: 'jorrybeaufart' }, withCredentials: true };
    f.window.io(options);
    assert.deepEqual(f.calls, [[{ ...options, path: `/game/${gameId}/socket.io` }]]);
    assert.equal(f.calls[0][0].auth.session, 'jorrybeaufart');
  }
});

test('default and namespace game connections use the game proxy rather than the relay root socket', () => {
  const f = proxySocket('wikisearchle');
  f.window.io();
  f.window.io('/spectators', { auth: { session: 'room' } });
  const calls = JSON.parse(JSON.stringify(f.calls));
  assert.deepEqual(calls, [
    [null, { path: '/game/wikisearchle/socket.io' }],
    ['/spectators', { auth: { session: 'room' }, path: '/game/wikisearchle/socket.io' }],
  ]);
});

test('explicit relay connections retain their own origin and socket path', () => {
  const f = proxySocket('wikisearchle');
  const options = { path: '/socket.io', auth: { session: 'room' } };
  f.window.io('https://wordtycoon.live', options);
  assert.deepEqual(f.calls, [['https://wordtycoon.live', options]]);
  assert.equal(options.path, '/socket.io');
});

test('the shim retains the Socket.IO API and cannot wrap the connection twice', () => {
  const f = proxySocket('wikisearchle');
  const wrapped = f.window.io;
  assert.equal(wrapped.Manager, f.original.Manager);
  assert.equal(wrapped.Socket, f.original.Socket);
  assert.equal(wrapped.protocol, f.original.protocol);
  assert.equal(wrapped.connect, wrapped);
  vm.runInNewContext(f.script, { window: f.window });
  assert.equal(f.window.io, wrapped);
});
