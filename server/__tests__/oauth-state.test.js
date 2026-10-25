const test = require('node:test');
const assert = require('node:assert/strict');
const { makeCsrfState, verifyCsrfState, STATE_MAX_AGE_MS } = require('../oauth-state');

const SECRET = 'test-session-secret';

test('a freshly signed Google state verifies without a cookie', () => {
  const now = 1_700_000_000_000;
  const state = makeCsrfState(SECRET, now);
  assert.equal(state.split('.').length, 3);
  assert.equal(verifyCsrfState(state, SECRET, STATE_MAX_AGE_MS, now + 1000), true);
});

test('the plain hex state the live site sends does not verify', () => {
  assert.equal(verifyCsrfState('4444ee6f847464b091d9450082de1c6f', SECRET), false);
});

test('a state signed with another secret is rejected', () => {
  const state = makeCsrfState(SECRET, Date.now());
  assert.equal(verifyCsrfState(state, 'other-secret'), false);
});

test('a state older than ten minutes is rejected', () => {
  const now = 1_700_000_000_000;
  const state = makeCsrfState(SECRET, now - STATE_MAX_AGE_MS - 1);
  assert.equal(verifyCsrfState(state, SECRET, STATE_MAX_AGE_MS, now), false);
});

test('a tampered timestamp is rejected', () => {
  const state = makeCsrfState(SECRET, 1_700_000_000_000);
  const [nonce, , hmac] = state.split('.');
  assert.equal(verifyCsrfState(`${nonce}.1700000000001.${hmac}`, SECRET), false);
});
