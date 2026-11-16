'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { expand, safeOutput } = require('../scripts/expand-subtextle-public-targets.cjs');
const options = { dictionary: new Set(['basketball', 'coffee']), membership: new Set(['basketball', 'coffee']),
  canonicals: {}, frequency: { basketball: 4.56, coffee: 4.86 }, blocked: () => false };
test('adding a curated public target preserves every shorter puzzle and the original inputs', () => {
  const targets = { 4: ['rice'], 5: ['bread'], 7: ['country'], 10: ['playground'] };
  const original = structuredClone(targets);
  const easy = ['rice', 'bread', 'country'];
  const result = expand(targets, easy, ['basketball'], options);
  assert.deepEqual(targets, original);
  for (const length of [4, 5, 7]) assert.deepEqual(result.targets[length], original[length]);
  assert.deepEqual(result.targets[10], ['basketball', 'playground']);
  assert.deepEqual(result.easy, ['rice', 'bread', 'country', 'basketball']);
  assert.equal(easy.length, 3);
});
test('short targets, duplicates, morphology, policy and unsupported vectors cannot enter this release', () => {
  assert.throws(() => expand({}, [], ['coffee'], options), /shorter puzzle pool/);
  assert.throws(() => expand({ 10: ['basketball'] }, [], ['basketball'], options), /Existing/);
  assert.throws(() => expand({}, [], ['basketball'], { ...options, canonicals: { basketball: 'basket' } }), /canonical/);
  assert.throws(() => expand({}, [], ['basketball'], { ...options, blocked: () => true }), /policy/);
  assert.throws(() => expand({}, [], ['basketball'], { ...options, membership: new Set() }), /membership/);
});
test('output cannot overwrite canonical snapshot files', () => {
  assert.throws(() => safeOutput('/tmp/snapshot/generated', '/tmp/snapshot'), /outside the canonical snapshot/);
});
