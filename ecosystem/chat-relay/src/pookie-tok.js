'use strict';
/**
 * pookie-tok.js - paid viewer messages shown on the live stream overlay.
 *
 * Flow: a viewer fills the jorry.live/pookie-tok form -> the message is filtered
 * BEFORE payment (pookie-filter) -> we mint a `token` and a `pending` DB row ->
 * Word Tycoon creates a one-time Stripe Checkout carrying only the token ->
 * on payment, WT calls us back with the token -> we flip the row to `paid` and
 * emit it to the streamer's goals overlay, where it shows for the tier's
 * duration and then vanishes. The message text never travels through Stripe.
 *
 * Tiers: more money = fancier styling (a CSS class on the overlay) + longer on
 * screen + a longer allowed message.
 */

const crypto = require('crypto');
const db = require('./database');
const filter = require('./pookie-filter');
const streamerGoals = require('./streamer-goals');
const ailicia = require('./ailicia');

// v1 targets the owner's stream only (same id the goals overlay uses).
const TARGET_STREAMER_ID = process.env.STREAM_OWNER_DISCORD_ID || '179331908499406849';

// Source of truth for the 4 tiers. amountCents >= 50 satisfies Stripe's floor.
const TIERS = {
  note: {
    id: 'note', label: 'Pookie Note', emoji: '💌',
    amountCents: 50, durationMs: 15000, maxChars: 120,
    blurb: 'A sweet little note on screen.',
  },
  shout: {
    id: 'shout', label: 'Pookie Shout', emoji: '💖',
    amountCents: 200, durationMs: 30000, maxChars: 160,
    blurb: 'Bigger card with a gradient and a floating heart.',
  },
  spotlight: {
    id: 'spotlight', label: 'Pookie Spotlight', emoji: '👑',
    amountCents: 500, durationMs: 60000, maxChars: 200,
    blurb: 'Full glowing card with your name, pinned for a minute.',
  },
  royalty: {
    id: 'royalty', label: 'Pookie Royalty', emoji: '🌟',
    amountCents: 1000, durationMs: 120000, maxChars: 220,
    blurb: 'The showstopper - top-center takeover with hearts, ~2 minutes.',
  },
};

function getTier(id) {
  return Object.prototype.hasOwnProperty.call(TIERS, id) ? TIERS[id] : null;
}

function targetStreamerId() {
  return TARGET_STREAMER_ID;
}

// Public tier list for the checkout page (no internal-only fields).
function publicTiers() {
  return Object.values(TIERS).map((t) => ({
    id: t.id, label: t.label, emoji: t.emoji,
    amountCents: t.amountCents, durationSec: Math.round(t.durationMs / 1000),
    maxChars: t.maxChars, blurb: t.blurb,
  }));
}

// Validate + persist a pending message. Returns what the caller needs to mint a
// Stripe session, or an error the form should show. Does NOT touch Stripe.
function prepare({ tierId, message, displayName }) {
  const tier = getTier(tierId);
  if (!tier) return { ok: false, error: 'Pick a tier.' };

  const msg = filter.validate(message, tier.maxChars);
  if (!msg.ok) return { ok: false, error: msg.reason };

  const nm = filter.validateName(displayName);
  if (!nm.ok) return { ok: false, error: nm.reason };

  const token = crypto.randomBytes(16).toString('hex');
  db.createPookieMessage({
    token,
    streamerId: TARGET_STREAMER_ID,
    tier: tier.id,
    amountCents: tier.amountCents,
    message: msg.cleaned,
    displayName: nm.cleaned || null,
    durationMs: tier.durationMs,
  });

  return {
    ok: true,
    token,
    amountCents: tier.amountCents,
    productName: `${tier.emoji} ${tier.label} - message on @museumcomesalive's stream`,
  };
}

// If minting the Stripe session fails, release the pending row.
function fail(token) {
  if (token) db.markPookieFailed(token);
}

// Called when payment completes (via the WT webhook -> our internal endpoint).
// Idempotent: only the first completion emits to the overlay.
function complete(token, { stripeSessionId } = {}) {
  const { row, firstTime } = db.markPookiePaid(token, stripeSessionId);
  if (!row) return { ok: false, error: 'Unknown token' };
  if (!firstTime) return { ok: true, firstTime: false };

  streamerGoals.emitPookieTok(row.streamer_id, {
    id: row.id,
    tier: row.tier,
    message: row.message,
    displayName: row.display_name || null,
    durationMs: row.duration_ms || 15000,
    at: Date.now(),
  });
  // Have ai_licia read it out loud (best-effort; never blocks the display).
  try {
    ailicia.readPookieMessage({ tier: row.tier, message: row.message, displayName: row.display_name });
  } catch (_) {}
  return { ok: true, firstTime: true };
}

// Streamer pulls a shown message off screen. Scoped to the owning streamer.
function hide(streamerId, id) {
  const row = db.hidePookieMessage(streamerId, id);
  if (!row) return { ok: false, error: 'Not found' };
  streamerGoals.emitPookieTokHide(streamerId, Number(id));
  return { ok: true };
}

function recent(streamerId, limit) {
  return db.listRecentPookieMessages(streamerId, limit);
}

module.exports = {
  TIERS, getTier, publicTiers, targetStreamerId,
  prepare, fail, complete, hide, recent,
};
