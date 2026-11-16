'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { linkedIdentityKey, resolveLinkedIdentity } = require('../src/linked-identity');

test('chat and premium lookups resolve a mixed-case TikTok link', () => {
  const cache = new Map([[linkedIdentityKey('tiktok', 'T.primmz'), 'go_paid']]);
  for (const id of ['t.primmz', 'T.primmz', '@T.Primmz']) {
    assert.equal(cache.get(linkedIdentityKey('tiktok', id)), 'go_paid');
    assert.equal(resolveLinkedIdentity(cache, id), 'go_paid');
  }
});

test('OAuth and other provider IDs remain case-sensitive', () => {
  const cache = new Map([
    [linkedIdentityKey('tiktok', 'abcd'), 'tiktok_handle'],
    [linkedIdentityKey('tiktok', 'tt_AbCd'), 'tiktok_oauth'],
    [linkedIdentityKey('google', 'AbCd'), 'google_account']
  ]);
  assert.equal(resolveLinkedIdentity(cache, 'tt_AbCd'), 'tiktok_oauth');
  assert.equal(resolveLinkedIdentity(cache, 'tt_abcd'), null);
  assert.equal(resolveLinkedIdentity(cache, 'AbCd'), 'google_account');
  assert.equal(resolveLinkedIdentity(cache, 'abcd'), 'tiktok_handle');
});
