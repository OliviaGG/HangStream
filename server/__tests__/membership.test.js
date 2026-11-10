const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const tempDb = path.join(__dirname, '..', '..', 'data', 'test-membership.db');
try { fs.unlinkSync(tempDb); } catch (e) {}
process.env.DB_PATH = tempDb;

const db = require('../db');
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

  db.close();
});

process.on('exit', () => {
  try { db.close(); } catch (e) {}
  try { fs.unlinkSync(tempDb); } catch (e) {}
});
