const crypto = require('crypto');

// Google sign-in used to store this nonce in a csrfState cookie. Browsers drop
// that cookie on the round trip through accounts.google.com (it is set on a
// redirect, often on www while the callback is the apex host), so the callback
// then fails with "Invalid state". The state value itself is now an HMAC, so
// the callback can check it with no cookie.
// Format: nonce.timestamp.hmac  (hmac = first 32 hex chars of HMAC-SHA256)

const STATE_MAX_AGE_MS = 10 * 60 * 1000;
const CLOCK_SKEW_MS = 2 * 60 * 1000;

function makeCsrfState(secret, now = Date.now()) {
  if (!secret) return '';
  const nonce = crypto.randomBytes(16).toString('hex');
  const ts = String(now);
  const payload = nonce + '.' + ts;
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex').slice(0, 32);
  return payload + '.' + hmac;
}

function verifyCsrfState(state, secret, maxAgeMs = STATE_MAX_AGE_MS, now = Date.now()) {
  if (!secret || typeof state !== 'string') return false;
  const parts = state.split('.');
  if (parts.length !== 3) return false;
  const [nonce, ts, hmac] = parts;
  if (!/^[0-9a-f]{32}$/.test(nonce) || !/^[0-9a-f]{32}$/.test(hmac) || !/^\d{10,16}$/.test(ts)) {
    return false;
  }
  const expected = crypto.createHmac('sha256', secret).update(nonce + '.' + ts).digest('hex').slice(0, 32);
  const actualBytes = Buffer.from(hmac, 'utf8');
  const expectedBytes = Buffer.from(expected, 'utf8');
  if (actualBytes.length !== expectedBytes.length || !crypto.timingSafeEqual(actualBytes, expectedBytes)) {
    return false;
  }
  const age = now - Number(ts);
  if (!Number.isFinite(age) || age > maxAgeMs || age < -CLOCK_SKEW_MS) return false;
  return true;
}

module.exports = { makeCsrfState, verifyCsrfState, STATE_MAX_AGE_MS };
