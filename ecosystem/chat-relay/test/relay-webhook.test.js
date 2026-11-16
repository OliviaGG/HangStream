const assert = require('node:assert/strict');
const test = require('node:test');

const {
  WEBHOOK_MIN_INTERVAL_MS,
  WEBHOOK_MAX_BACKOFF_MS,
  WEBHOOK_DROP_COOLDOWN_MAX_MS,
  getWebhookBackoffPlan
} = require('../src/relay-webhook');

// Values lifted verbatim from render1's mobile-relay error log on 2026-07-26.
// DISCORD_WEBHOOK_URL is unversioned, so Discord answers with legacy semantics
// and reports retry_after in MILLISECONDS. Every one of these is just under
// 2000ms — the tail of the 5-request-per-2-second webhook bucket.
const PROD_RETRY_AFTER_VALUES = [400, 1178, 1675, 1676, 1678, 1905, 1965, 1973, 1975, 1976];

test('millisecond retry_after values from an unversioned webhook do not trigger a cooldown', () => {
  for (const retryAfter of PROD_RETRY_AFTER_VALUES) {
    const plan = getWebhookBackoffPlan({ jsonRetryAfterSeconds: retryAfter, headerRetryAfter: null });

    assert.equal(
      plan.dropPayload,
      false,
      `retry_after ${retryAfter} should not drop the payload (was a ${Math.round(retryAfter * 1000 / 60000)}min stall)`
    );
    assert.ok(
      plan.effectiveRetryMs <= WEBHOOK_MAX_BACKOFF_MS,
      `retry_after ${retryAfter} backed off ${plan.effectiveRetryMs}ms, over the ${WEBHOOK_MAX_BACKOFF_MS}ms ceiling`
    );
  }
});

test('the worst observed value waits ~2s instead of ~33min', () => {
  const plan = getWebhookBackoffPlan({ jsonRetryAfterSeconds: 1965, headerRetryAfter: null });

  // Regression guard: this used to be 1_965_100 (32.75 minutes).
  // 1965ms + 100ms padding = 2065, then floored up to the 2100ms minimum
  // send interval, which is the real drain cadence anyway.
  assert.equal(plan.requestedRetryMs, WEBHOOK_MIN_INTERVAL_MS);
  assert.equal(plan.effectiveRetryMs, WEBHOOK_MIN_INTERVAL_MS);
  assert.equal(plan.dropPayload, false);
});

test('fractional retry_after is still read as seconds (v8+ style)', () => {
  assert.equal(getWebhookBackoffPlan({ jsonRetryAfterSeconds: 0.529 }).requestedRetryMs, WEBHOOK_MIN_INTERVAL_MS);
  assert.equal(getWebhookBackoffPlan({ jsonRetryAfterSeconds: 4.5 }).requestedRetryMs, 4600);
  assert.equal(getWebhookBackoffPlan({ jsonRetryAfterSeconds: 12.25 }).requestedRetryMs, 12350);
});

test('small integer retry_after is read as seconds, never as milliseconds', () => {
  // 5 must mean 5s, not 5ms — under-waiting would just earn another 429.
  assert.equal(getWebhookBackoffPlan({ jsonRetryAfterSeconds: 5 }).requestedRetryMs, 5100);
  assert.equal(getWebhookBackoffPlan({ jsonRetryAfterSeconds: 30 }).requestedRetryMs, 30100);
});

test('the Retry-After HEADER is normalised too, not multiplied by 1000', () => {
  // Regression guard for the 2026-07-26 half-fix. Verbatim from render1:
  //   20:14:17 [Relay] Webhook 429 — requested 1958100ms … cooling down 1800000ms
  // logged 7s after the relay restarted onto the build that "fixed" this.
  // 1958100 === 1958 * 1000 + 100 — the header took the seconds branch and,
  // via Math.max, overrode the correctly-normalised body. Both are ms here.
  const plan = getWebhookBackoffPlan({ jsonRetryAfterSeconds: 1958, headerRetryAfter: '1958' });

  assert.equal(plan.requestedRetryMs, WEBHOOK_MIN_INTERVAL_MS);
  assert.equal(plan.dropPayload, false, 'a ~2s rate limit must not blackout chat for 30 minutes');
});

test('a genuine long ban still drops and cools down', () => {
  // On this endpoint a real 10-minute ban arrives as 600000 (ms), not 600.
  const plan = getWebhookBackoffPlan({ jsonRetryAfterSeconds: null, headerRetryAfter: '600000' });

  assert.equal(plan.requestedRetryMs, 600_100);
  assert.equal(plan.dropPayload, true);
  assert.equal(plan.effectiveRetryMs, Math.min(600_100, WEBHOOK_DROP_COOLDOWN_MAX_MS));
});

test('a long cooldown is still capped at the drop ceiling', () => {
  const plan = getWebhookBackoffPlan({ jsonRetryAfterSeconds: null, headerRetryAfter: '7200000' });

  assert.equal(plan.dropPayload, true);
  assert.equal(plan.effectiveRetryMs, WEBHOOK_DROP_COOLDOWN_MAX_MS);
});

test('body and header disagreeing never inflates past the larger normalised value', () => {
  // Both normalised the same way, so max() is now safe to keep.
  const plan = getWebhookBackoffPlan({ jsonRetryAfterSeconds: 1965, headerRetryAfter: '90000' });

  assert.equal(plan.requestedRetryMs, 90_100, 'the genuinely longer 90s wait must win');
  assert.equal(plan.dropPayload, true);
});

test('missing or junk values fall back to the minimum interval', () => {
  for (const bad of [null, undefined, 0, -1, NaN, 'abc', '']) {
    const plan = getWebhookBackoffPlan({ jsonRetryAfterSeconds: bad, headerRetryAfter: bad });
    assert.equal(plan.requestedRetryMs, WEBHOOK_MIN_INTERVAL_MS, `bad value ${String(bad)}`);
    assert.equal(plan.dropPayload, false);
  }
});
