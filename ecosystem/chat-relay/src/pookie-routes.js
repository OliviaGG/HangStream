'use strict';
/**
 * pookie-routes.js — Express wiring for Pookie Tok. Extracted from server.js so
 * the routes are mountable and testable in isolation (server.js can't be booted
 * in a test without logging in the live Discord bot). All logic lives in
 * ./pookie-tok; these handlers are thin.
 *
 * registerPookieTokRoutes(app, {
 *   express,            // the express module (for express.json())
 *   wtFetch,            // server.js wtFetch (adds WT auth headers)
 *   wordEmpiresUrl,     // WT base URL
 *   hasInternalApiKey,  // server.js internal-key guard
 *   requireStreamer,    // server.js streamer-session guard
 * })
 */

const path = require('path');
const pookieTok = require('./pookie-tok');

function registerPookieTokRoutes(app, deps) {
  const { express, wtFetch, wordEmpiresUrl, hasInternalApiKey, requireStreamer } = deps;
  const PUBLIC_BASE = process.env.POOKIE_PUBLIC_BASE || 'https://jorry.live';

  // Clean URL for the checkout page (Stripe success/cancel redirect here).
  app.get('/pookie-tok', (_req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'pookie-tok.html'));
  });

  // Public: tier catalog for the jorry.live/pookie-tok checkout page.
  app.get('/api/pookie-tok/config', (_req, res) => {
    res.json({ ok: true, tiers: pookieTok.publicTiers(), handle: 'museumcomesalive' });
  });

  // Light per-IP throttle so the public checkout can't be spammed into creating
  // endless pending rows / Stripe sessions. Low-volume feature; in-memory is fine.
  const hits = new Map(); // ip -> [timestamps]
  function rateLimited(ip) {
    const now = Date.now();
    const WINDOW = 5 * 60 * 1000, MAX = 8;
    const arr = (hits.get(ip) || []).filter(t => now - t < WINDOW);
    arr.push(now);
    hits.set(ip, arr);
    return arr.length > MAX;
  }

  // Public/guest: validate the message BEFORE payment (no refunds for blocked
  // content), mint a token + pending row, then ask Word Tycoon (which owns the
  // Stripe account) to create a one-time Checkout carrying just the token.
  app.post('/api/pookie-tok/checkout', express.json(), async (req, res) => {
    if (rateLimited(req.ip)) {
      return res.status(429).json({ ok: false, error: 'Too many attempts — give it a minute.' });
    }
    const { tierId, message, displayName } = req.body || {};
    const prep = pookieTok.prepare({ tierId, message, displayName });
    if (!prep.ok) return res.status(400).json({ ok: false, error: prep.error });

    try {
      const r = await wtFetch(`${wordEmpiresUrl}/api/admin/pookie-tok/checkout`, {
        method: 'POST',
        body: JSON.stringify({
          token: prep.token,
          amountCents: prep.amountCents,
          productName: prep.productName,
          successUrl: `${PUBLIC_BASE}/pookie-tok?status=success`,
          cancelUrl: `${PUBLIC_BASE}/pookie-tok?status=cancel`,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok || !data || !data.url) {
        pookieTok.fail(prep.token);
        return res.status(502).json({ ok: false, error: 'Could not start checkout. Please try again.' });
      }
      res.json({ ok: true, url: data.url });
    } catch (e) {
      pookieTok.fail(prep.token);
      res.status(502).json({ ok: false, error: 'Payment service unreachable.' });
    }
  });

  // Internal: Word Tycoon's Stripe webhook calls this on completed payment.
  // Guarded by the shared GAME_API_SECRET (x-api-key / x-relay-auth).
  app.post('/api/internal/pookie-tok/complete', express.json(), (req, res) => {
    if (!hasInternalApiKey(req)) return res.status(401).json({ ok: false, error: 'Unauthorized' });
    const { token, stripeSessionId } = req.body || {};
    if (!token) return res.status(400).json({ ok: false, error: 'Missing token' });
    const result = pookieTok.complete(token, { stripeSessionId });
    if (!result.ok) return res.status(404).json(result);
    res.json(result);
  });

  // Streamer: recent messages + one-tap Hide (scoped to the owning streamer).
  app.get('/api/streamer/pookie-tok/recent', requireStreamer, (req, res) => {
    res.json({ ok: true, messages: pookieTok.recent(req.session.discordUser.id, req.query.limit) });
  });

  app.post('/api/streamer/pookie-tok/:id/hide', requireStreamer, (req, res) => {
    const result = pookieTok.hide(req.session.discordUser.id, req.params.id);
    if (!result.ok) return res.status(404).json(result);
    res.json(result);
  });
}

module.exports = { registerPookieTokRoutes };
