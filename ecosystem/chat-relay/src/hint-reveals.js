'use strict';
const { signPreparation, verifyPreparation } = require('./hint-tokens');
const GAMES = new Set(['wordle', 'betwixt', 'pixeletters', 'figural', 'word1000', 'wikisearchle']);
const LABELS = { not_present: 'not in the word', wrong_position: 'in the word, wrong position', correct: 'correct letter & position' };
const ACTION = /^[A-Za-z0-9_-]{16,80}$/;
function identity(body) {
  return body && typeof body.discordId === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(body.discordId)
    && GAMES.has(body.game) && typeof body.actionId === 'string' && ACTION.test(body.actionId);
}
function validPurchase(body) {
  if (!identity(body) || typeof body.roundKey !== 'string' || !/^[a-f0-9]{64}$/.test(body.roundKey)
    || typeof body.handle !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(body.handle)
    || typeof body.startTime !== 'string' || !Number.isFinite(Date.parse(body.startTime))) return false;
  const hints = body.candidates;
  if (!Array.isArray(hints) || hints.length > (body.game === 'wikisearchle' ? 128 : body.game === 'word1000' ? 10 : 8)) return false;
  const positions = new Set();
  let length = null;
  for (const hint of hints) {
    if (!hint || !Number.isInteger(hint.position) || positions.has(hint.position)) return false;
    if (body.game === 'wikisearchle') {
      if (hint.type !== 'title_word' || hint.position < 1 || hint.position > 128
        || typeof hint.word !== 'string' || hint.word.length < 1 || hint.word.length > 80
        || typeof hint.norm !== 'string' || !/^[\p{L}\p{N}]{1,80}$/u.test(hint.norm)
        || /[\x00-\x1f<>]/.test(hint.word)) return false;
    } else if (body.game === 'figural') {
      if (hints.length > 3 || hint.position < 0 || hint.position > 2 || hint.type !== 'symbol_meaning'
        || typeof hint.symbol !== 'string' || hint.symbol.length < 1 || hint.symbol.length > 16
        || /[\x00-\x1f<>]/.test(hint.symbol) || !Object.hasOwn(LABELS, hint.meaning)) return false;
    } else if (!Number.isInteger(hint.wordLength) || hint.wordLength < 4 || hint.wordLength > (body.game === 'word1000' ? 10 : 8)
      || hint.position < 0 || hint.position >= hint.wordLength || typeof hint.letter !== 'string'
      || !/^[A-Z]$/.test(hint.letter) || (length !== null && length !== hint.wordLength)) return false;
    positions.add(hint.position); length = hint.wordLength;
  }
  return true;
}
function installHintRevealRoutes(app, { db, hasInternalApiKey, computePremiumById, commands, hintStatusCache, secret }) {
  app.post('/api/hints/reveal/prepare', async (req, res) => {
    if (!hasInternalApiKey(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    if (!validPurchase(req.body)) return res.status(400).json({ ok: false, error: 'invalid_hint_action' });
    if (!secret) return res.status(503).json({ ok: false, error: 'hint_retry_required' });
    const body = req.body;
    try {
      const prior = db.getHintRevealReceipt(body.discordId, body.game, body.actionId);
      if (prior) return res.json({ ok: true, purchase: prior });
      const { source } = await computePremiumById(body.discordId);
      const monthKey = commands.currentMonthKey(), allowance = commands.HINT_ALLOWANCE[source] || 0;
      if (allowance > 0) db.ensureHintGrant(body.discordId, monthKey, source, allowance);
      db.saveImmediate(true);
      return res.json({ ok: true, preparedToken: signPreparation(body, source, monthKey, secret) });
    } catch (_) { return res.status(503).json({ ok: false, error: 'hint_retry_required' }); }
  });
  app.post('/api/hints/reveal/settle', (req, res) => {
    if (!hasInternalApiKey(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const body = req.body;
    if (!identity(body) || !['deliver', 'cancel'].includes(body.disposition)
      || (body.disposition === 'cancel' && !['round_changed', 'nothing_to_reveal'].includes(body.reason))) return res.status(400).json({ ok: false, error: 'invalid_hint_action' });
    try {
      const result = db.settleHintReveal(body.discordId, body.game, body.actionId, body.disposition, body.reason);
      if (!result) return res.status(409).json({ ok: false, error: 'hint_retry_required' });
      hintStatusCache.delete(body.discordId);
      return res.json(result);
    } catch (_) { return res.status(503).json({ ok: false, error: 'hint_retry_required' }); }
  });
  const expiryTimer = setInterval(() => {
    try { for (const account of db.expirePendingHintReveals(20)) hintStatusCache.delete(account); }
    catch (_) { console.error('[HintReceipts] Expiry persistence failed; will retry'); }
  }, 60000);
  expiryTimer.unref?.();
  if (app.once) app.once('close', () => clearInterval(expiryTimer));
  // Closing a stale attempt durably wins against a still-pending premium lookup.
  // If a purchase already won, its original result remains recoverable instead.
  app.post('/api/hints/reveal/close', (req, res) => {
    if (!hasInternalApiKey(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    const body = req.body;
    if (!identity(body) || typeof body.handle !== 'string' || !/^[a-z0-9_-]{1,32}$/.test(body.handle)
      || !['round_changed', 'nothing_to_reveal'].includes(body.reason)) return res.status(400).json({ ok: false, error: 'invalid_hint_action' });
    try {
      const prior = db.getHintRevealReceipt(body.discordId, body.game, body.actionId);
      if (prior?.deliveryStatus === 'pending') return res.json(db.settleHintReveal(body.discordId, body.game, body.actionId, 'cancel', body.reason));
      return res.json(db.purchaseHintReveal({ accountId: body.discordId, game: body.game, actionId: body.actionId,
        roundKey: '0'.repeat(64), candidates: [], handle: body.handle,
        startTime: typeof body.startTime === 'string' ? body.startTime : null, terminalReason: body.reason }));
    } catch (_) { return res.status(503).json({ ok: false, error: 'hint_retry_required' }); }
  });
  app.post('/api/hints/reveal/receipt', (req, res) => {
    if (!hasInternalApiKey(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    if (!identity(req.body)) return res.status(400).json({ ok: false, error: 'invalid_hint_action' });
    try {
      const purchase = db.getHintRevealReceipt(req.body.discordId, req.body.game, req.body.actionId);
      return res.json({ ok: true, found: !!purchase, purchase });
    } catch (_) { return res.status(503).json({ ok: false, error: 'hint_retry_required' }); }
  });
  app.post('/api/hints/reveal', async (req, res) => {
    if (!hasInternalApiKey(req)) return res.status(403).json({ ok: false, error: 'forbidden' });
    if (!validPurchase(req.body)) return res.status(400).json({ ok: false, error: 'invalid_hint_action' });
    const body = req.body;
    try {
      const prior = db.getHintRevealReceipt(body.discordId, body.game, body.actionId);
      if (prior) return res.json(prior);
      const prepared = verifyPreparation(body.preparedToken, body, secret);
      if (body.preparedToken && !prepared) return res.status(503).json({ ok: false, error: 'hint_retry_required' });
      if (!prepared && body.game !== 'wordle') return res.status(400).json({ ok: false, error: 'invalid_hint_action' });
      let source, monthKey;
      if (prepared) ({ source, monthKey } = prepared);
      else {
        // Compatibility for existing internal Wordle callers. Browser purchases
        // use preparation and settlement through the updated game proxy.
        ({ source } = await computePremiumById(body.discordId));
        monthKey = commands.currentMonthKey();
        const allowance = commands.HINT_ALLOWANCE[source] || 0;
        if (allowance > 0) db.ensureHintGrant(body.discordId, monthKey, source, allowance);
      }
      // Selection, position uniqueness, allowance debit and receipt are synchronous
      // after the async premium lookup; concurrent requests cannot share a slot.
      const result = db.purchaseHintReveal({
        accountId: body.discordId, game: body.game, actionId: body.actionId,
        roundKey: body.roundKey, handle: body.handle, startTime: body.startTime,
        candidates: body.candidates.map(hint => body.game === 'wikisearchle' ? ({ type: 'title_word', word: hint.word, norm: hint.norm, position: hint.position }) : body.game === 'figural' ? ({ type: 'symbol_meaning', symbol: hint.symbol, position: hint.position, meaning: hint.meaning, label: LABELS[hint.meaning] }) : ({ letter: hint.letter, position: hint.position, wordLength: hint.wordLength })),
        source, monthKey, deliveryPending: !!prepared,
      });
      hintStatusCache.delete(body.discordId);
      return res.json(result);
    } catch (_) { return res.status(503).json({ ok: false, error: 'hint_retry_required' }); }
  });
  return { close: () => clearInterval(expiryTimer) };
}
module.exports = { installHintRevealRoutes, validPurchase };
