'use strict';
const accountKey = accountId => require('node:crypto').createHash('sha256').update('word-foundry-owner:' + accountId).digest('hex');

const VALID_ACTIONS = new Set([
  'build-word', 'buy-letter', 'refresh-market', 'buy-research', 'upgrade-line',
  'dismantle-word', 'claim-order', 'buy-legacy', 'hire-manager', 'publish-edition', 'reset'
]);

async function readJson(response) {
  let data = null;
  try { data = await response.json(); } catch {}
  return data || { ok: false, message: 'Word Foundry returned an invalid response.' };
}

function registerWordFoundryProxy(app, { wtFetch, wordTycoonUrl, getAccountId }) {
  app.get('/api/word-foundry/state', async (req, res) => {
    if (!req.session?.discordUser) return res.json({ ok: false, authenticated: false });
    const accountId = await getAccountId(req.session.discordUser);
    if (!accountId) return res.status(401).json({ ok: false, authenticated: false });
    try {
      const upstream = await wtFetch(`${wordTycoonUrl}/api/word-foundry/state?accountId=${encodeURIComponent(accountId)}`);
      const data = await readJson(upstream);
      res.status(upstream.status || 200).json({ ...data, authenticated: true, accountKey: accountKey(accountId) });
    } catch (error) {
      console.error('[WordFoundry] State proxy failed:', error.message);
      res.status(502).json({ ok: false, authenticated: true, message: 'Foundry service unavailable.' });
    }
  });

  app.post('/api/word-foundry/action', async (req, res) => {
    if (!req.session?.discordUser) return res.status(401).json({ ok: false, authenticated: false });
    const accountId = await getAccountId(req.session.discordUser);
    if (!accountId) return res.status(401).json({ ok: false, authenticated: false });
    const type = String(req.body?.type || '');
    const actionId = String(req.body?.actionId || '');
    const payload = req.body?.payload && typeof req.body.payload === 'object' && !Array.isArray(req.body.payload)
      ? req.body.payload
      : {};
    if (!VALID_ACTIONS.has(type)) return res.status(400).json({ ok: false, message: 'Invalid Foundry action.' });
    if (JSON.stringify(payload).length > 8192) return res.status(413).json({ ok: false, message: 'Action payload too large.' });
    try {
      const upstream = await wtFetch(`${wordTycoonUrl}/api/word-foundry/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, actionId, type, payload })
      });
      const data = await readJson(upstream);
      res.status(upstream.status || 200).json({ ...data, authenticated: true, accountKey: accountKey(accountId) });
    } catch (error) {
      console.error('[WordFoundry] Action proxy failed:', error.message);
      res.status(502).json({ ok: false, authenticated: true, message: 'Foundry service unavailable.' });
    }
  });
}

module.exports = { VALID_ACTIONS, registerWordFoundryProxy };
