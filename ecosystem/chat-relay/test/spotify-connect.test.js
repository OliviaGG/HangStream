'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const spotifyConnect = require('../src/spotify-connect');

test('parseSystemctlShow reports a healthy running receiver', () => {
  const state = spotifyConnect.parseSystemctlShow([
    'ActiveState=active',
    'SubState=running',
    'MainPID=272384',
    'NRestarts=2',
    'ExecMainStartTimestamp=Wed 2026-09-30 02:13:12 CEST',
    'Result=success',
  ].join('\n'));

  assert.deepEqual(state, {
    unit: 'spotify-connect.service',
    active: 'active',
    sub: 'running',
    running: true,
    pid: 272384,
    restarts: 2,
    since: 'Wed 2026-09-30 02:13:12 CEST',
    result: 'success',
  });
});

test('parseSystemctlShow does not mistake an exited unit for healthy', () => {
  const state = spotifyConnect.parseSystemctlShow('ActiveState=active\nSubState=exited\nMainPID=0\n');
  assert.equal(state.running, false);
  assert.equal(state.active, 'active');
  assert.equal(state.sub, 'exited');
  assert.equal(state.pid, 0);
});
