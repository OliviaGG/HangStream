'use strict';

const WEBHOOK_MIN_INTERVAL_MS = 2100;
const WEBHOOK_MAX_BACKOFF_MS = 60_000;
const WEBHOOK_DROP_COOLDOWN_MAX_MS = 30 * 60_000;
const WEBHOOK_MAX_EMBEDS_PER_REQUEST = 10;
// Discord allows 6,000 aggregate text characters across all embeds in one
// message. Leave room for any formatting Discord counts differently.
const WEBHOOK_MAX_BATCH_TEXT_CHARS = 5800;

// Neither the 429 JSON body's `retry_after` NOR the `Retry-After` header is
// reliably in seconds: the unit depends on the API version the webhook URL
// resolves to. An unversioned webhook URL (https://discord.com/api/webhooks/
// <id>/<token>, which is what DISCORD_WEBHOOK_URL holds) is served by the
// oldest supported API version and reports MILLISECONDS in BOTH; v8+ reports
// SECONDS as a float.
//
// Treating either as seconds turns a routine "wait 1.97s" (retry_after: 1965
// -> the tail of Discord's 5-per-2s webhook bucket) into 1,965,100ms. That
// trips the >60s dropPayload branch, so the relay silently bins every chat
// message for 30 minutes at a time, repeatedly, all day.
//
// 2026-07-26: the first pass at this fix normalised ONLY the body and left the
// header on an unconditional *1000, on the assumption that the header is
// RFC-9110 seconds. It is not, on this endpoint. Because the two are combined
// with Math.max, the inflated header ALWAYS won and the body fix was dead
// code — prod logged `requested 1958100ms` (= 1958*1000+100) seven seconds
// after restarting onto the "fixed" build. Both inputs must be normalised.
//
// Normalise by SHAPE rather than trusting one unit:
//   fractional          -> seconds      (v8+ style, e.g. 0.529)
//   integer >= 100      -> milliseconds (legacy style, e.g. 1965)
//   small integer       -> seconds      (over-waiting a few seconds is safe)
//
// The asymmetry is deliberate: under-waiting merely earns another 429 and backs
// off again, while over-waiting silently discards user chat for up to 30 min.
// WEBHOOK_MIN_INTERVAL_MS is the floor, so the worst case is the normal cadence.
const RETRY_AFTER_MS_FLOOR = 100;

function normaliseRetryAfter(value, fallback = WEBHOOK_MIN_INTERVAL_MS) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  if (Number.isInteger(parsed) && parsed >= RETRY_AFTER_MS_FLOOR) {
    return Math.ceil(parsed) + 100;
  }
  return Math.ceil(parsed * 1000) + 100;
}

// hadBucketRetryAfter distinguishes who sent the 429. An ordinary webhook-
// bucket 429 ALWAYS carries retry_after in its JSON body, in the legacy
// ms/seconds mess normaliseRetryAfter handles. When retry_after is ABSENT the
// 429 is an IP-level block and the retry-after HEADER is RFC-9110 SECONDS —
// observed live 2026-08-03 as JSON {"code":0,"message":"You are being blocked
// …exceeding global rate limits"} with `retry-after: 1475` (~25 min); a
// Cloudflare 1015 HTML page is the same situation. The shape heuristic reads
// 1475 as milliseconds, so without this branch the relay knocked every 2.1s
// for the entire ban, renewing it and taking down every Discord consumer on
// the box (incl. the Word Tycoon bot). During an IP ban nothing can be
// delivered anyway: drop the queue and go silent for the ban. Callers that
// don't say (tests, older call sites) default to true, which preserves the
// pre-2026-08-03 behavior exactly.
function getWebhookBackoffPlan({ jsonRetryAfterSeconds, headerRetryAfter, hadBucketRetryAfter = true }) {
  if (!hadBucketRetryAfter) {
    const headerSeconds = Number(headerRetryAfter);
    const requestedRetryMs = Number.isFinite(headerSeconds) && headerSeconds > 0
      ? Math.ceil(headerSeconds * 1000) + 5000
      : WEBHOOK_MAX_BACKOFF_MS;
    return {
      requestedRetryMs,
      effectiveRetryMs: Math.min(requestedRetryMs, WEBHOOK_DROP_COOLDOWN_MAX_MS),
      dropPayload: true
    };
  }

  const jsonRetryMs = normaliseRetryAfter(jsonRetryAfterSeconds, WEBHOOK_MIN_INTERVAL_MS);
  const headerRetryMs = normaliseRetryAfter(headerRetryAfter, 0);
  const requestedRetryMs = Math.max(jsonRetryMs, headerRetryMs, WEBHOOK_MIN_INTERVAL_MS);
  const dropPayload = requestedRetryMs > WEBHOOK_MAX_BACKOFF_MS;

  return {
    requestedRetryMs,
    effectiveRetryMs: dropPayload
      ? Math.min(requestedRetryMs, WEBHOOK_DROP_COOLDOWN_MAX_MS)
      : requestedRetryMs,
    dropPayload
  };
}

function embedTextLength(embed) {
  if (!embed || typeof embed !== 'object') return 0;
  let total = String(embed.title || '').length
    + String(embed.description || '').length
    + String(embed.author?.name || '').length
    + String(embed.footer?.text || '').length;
  for (const field of Array.isArray(embed.fields) ? embed.fields : []) {
    total += String(field?.name || '').length + String(field?.value || '').length;
  }
  return total;
}

function payloadEmbedStats(payload) {
  const embeds = Array.isArray(payload?.embeds) ? payload.embeds : [];
  return {
    embeds: embeds.length,
    textChars: embeds.reduce((sum, embed) => sum + embedTextLength(embed), 0)
  };
}

function selectWebhookBatchSize(payloads, maxBatchSize = WEBHOOK_MAX_EMBEDS_PER_REQUEST) {
  const limit = Math.max(1, Math.min(WEBHOOK_MAX_EMBEDS_PER_REQUEST, Number(maxBatchSize) || 1));
  let selected = 0;
  let embedCount = 0;
  let textChars = 0;

  for (const payload of payloads) {
    if (selected >= limit) break;
    const stats = payloadEmbedStats(payload);
    const exceedsDiscordLimit = embedCount + stats.embeds > WEBHOOK_MAX_EMBEDS_PER_REQUEST
      || textChars + stats.textChars > WEBHOOK_MAX_BATCH_TEXT_CHARS;
    if (selected > 0 && exceedsDiscordLimit) break;
    selected += 1;
    embedCount += stats.embeds;
    textChars += stats.textChars;
  }

  return selected;
}

function buildWebhookBatchPayload(payloads, username = 'Word Tycoon Live Chat') {
  if (payloads.length === 1) return payloads[0];
  return {
    username,
    embeds: payloads.flatMap((payload) => Array.isArray(payload?.embeds) ? payload.embeds : [])
  };
}

module.exports = {
  WEBHOOK_MIN_INTERVAL_MS,
  WEBHOOK_MAX_BACKOFF_MS,
  WEBHOOK_DROP_COOLDOWN_MAX_MS,
  WEBHOOK_MAX_EMBEDS_PER_REQUEST,
  WEBHOOK_MAX_BATCH_TEXT_CHARS,
  getWebhookBackoffPlan,
  selectWebhookBatchSize,
  buildWebhookBatchPayload,
  _internal: { normaliseRetryAfter, RETRY_AFTER_MS_FLOOR, embedTextLength, payloadEmbedStats }
};
