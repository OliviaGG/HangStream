'use strict';
// Fixed categories and status counts only; never account IDs, paths, cookies or request bodies.
function createRequestMetrics({ now = Date.now, maxBuckets = 60 } = {}) {
  const buckets = new Map();
  function category(url) {
    const path = typeof url === 'string' ? url.split('?')[0].toLowerCase() : '';
    if (/^\/game\/[^/]+\/(?:api|socket\.io)(?:\/|$)/.test(path)) return 'game';
    if (/^\/api\/(?:sp-complete|sp-weekly-complete|sp-status)(?:\/|$)/.test(path)) return 'completion';
    if (/^\/api\/hints?(?:\/|$)/.test(path)) return 'hint';
    if (/^\/(?:auth|api\/me)(?:\/|$)/.test(path)) return 'account';
    if (/^\/api\/admin(?:\/|$)/.test(path)) return 'admin';
    return 'other';
  }
  function record(group, status, duration) {
    const minute = Math.floor(now() / 60000);
    for (const key of buckets.keys()) if (key <= minute - maxBuckets) buckets.delete(key);
    if (!buckets.has(minute)) buckets.set(minute, {});
    const bucket = buckets.get(minute);
    if (!bucket[group]) bucket[group] = { requests: 0, rejected: 0, errors: 0, slow: 0 };
    const counts = bucket[group]; counts.requests++;
    if ([400, 401, 403, 409, 422, 429].includes(status)) counts.rejected++;
    if (status >= 500) counts.errors++;
    if (duration > 2000) counts.slow++;
  }
  function middleware(req, res, next) {
    const start = now(), group = category(req.originalUrl || req.url);
    res.once('finish', () => record(group, res.statusCode, Math.max(0, now() - start)));
    next();
  }
  function summary() {
    const minute = Math.floor(now() / 60000);
    for (const key of buckets.keys()) if (key <= minute - maxBuckets) buckets.delete(key);
    return { ok: true, windowMinutes: maxBuckets, buckets: [...buckets].map(([minute, counts]) => ({ minute, counts })) };
  }
  return { middleware, summary };
}
module.exports = { createRequestMetrics };
