const test = require('node:test');
const { after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const tempDb = path.join(__dirname, '..', '..', 'data', 'test-membership.db');
try { fs.unlinkSync(tempDb); } catch (e) {}
process.env.DB_PATH = tempDb;

const db = require('../db');
const membership = require('../membership');
const {
  getMembership,
  getMembershipByStripeSubscription,
  getMembershipByStripeCustomer,
  upsertMembership,
  isActiveSubscriber,
} = require('../storage');

test('membership upsert, lookup, and active-subscriber check', async () => {
  await db.ready;

  const viewerId = 'google:test-user';
  assert.equal(getMembership(viewerId), null);
  assert.equal(isActiveSubscriber(viewerId), false);

  // Inactive row does not unlock perks
  upsertMembership(viewerId, {
    tier: 'supporter',
    status: 'incomplete',
    stripe_customer_id: 'cus_123',
    stripe_subscription_id: 'sub_123',
  });
  assert.equal(isActiveSubscriber(viewerId), false);

  // Active subscription unlocks perks
  upsertMembership(viewerId, {
    tier: 'tycoon',
    status: 'active',
    stripe_customer_id: 'cus_123',
    stripe_subscription_id: 'sub_123',
    cancel_at_period_end: true,
  });
  assert.equal(isActiveSubscriber(viewerId), true);

  const membership = getMembership(viewerId);
  assert.equal(membership.tier, 'tycoon');
  assert.equal(membership.status, 'active');
  assert.equal(membership.cancel_at_period_end, true);
  assert.equal(getMembershipByStripeSubscription('sub_123').viewer_id, viewerId);
  assert.equal(getMembershipByStripeCustomer('cus_123').viewer_id, viewerId);

  // Cancellation revokes perks but keeps the row
  upsertMembership(viewerId, {
    tier: 'tycoon',
    status: 'canceled',
    stripe_customer_id: 'cus_123',
    stripe_subscription_id: 'sub_123',
  });
  assert.equal(isActiveSubscriber(viewerId), false);
  assert.equal(getMembership(viewerId).status, 'canceled');

  // Free tier never counts as a subscriber
  upsertMembership('google:free-user', { tier: 'free', status: 'active' });
  assert.equal(isActiveSubscriber('google:free-user'), false);
});

test('membership module tier helpers', async () => {
  await db.ready;

  // Config-driven tiers
  assert.equal(membership.normalizeTier('supporter'), 'supporter');
  assert.equal(membership.normalizeTier('tycoon'), 'tycoon');
  // word-tycoon aliases map onto the HangStream tiers
  assert.equal(membership.normalizeTier('donor_class'), 'supporter');
  assert.equal(membership.normalizeTier('pookie_pass'), 'tycoon');
  assert.equal(membership.normalizeTier('bogus'), 'free');

  const supporter = membership.getTierConfig('supporter');
  assert.equal(supporter.priceUsd, 2);
  assert.equal(supporter.premiumPassUnlocked, true);
  const tycoon = membership.getTierConfig('tycoon');
  assert.equal(tycoon.priceUsd, 10);
  assert.ok(membership.getTierRank('tycoon') > membership.getTierRank('supporter'));
  assert.ok(membership.getTierRank('supporter') > membership.getTierRank('free'));

  // State reflects stored membership
  upsertMembership('google:state-user', { tier: 'tycoon', status: 'active' });
  const state = membership.getMembershipState('google:state-user');
  assert.equal(state.active, true);
  assert.equal(state.premiumPassUnlocked, true);
  assert.equal(state.tierRank, membership.getTierRank('tycoon'));

  upsertMembership('google:state-user', { tier: 'tycoon', status: 'canceled' });
  assert.equal(membership.getMembershipState('google:state-user').active, false);
});

after(() => {
  try { db.close(); } catch (e) {}
  try { fs.unlinkSync(tempDb); } catch (e) {}
});
