'use strict';
const crypto = require('node:crypto');
const GAMES = new Set(['triangled']);
const TTL_MS = 5 * 60 * 1000;
function mintGameSession(secret, game, player, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ audience: game, player, expires: now + TTL_MS })).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update('game-http-session:' + payload).digest('base64url');
  return { token: payload + '.' + sig, expires: now + TTL_MS };
}
function verifyGameSession(secret, game, token, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const expected = crypto.createHmac('sha256', secret).update('game-http-session:' + parts[0]).digest('base64url');
  const a = Buffer.from(parts[1]), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (p.audience !== game || !Number.isFinite(p.expires) || p.expires <= now || p.expires > now + TTL_MS || !p.player?.userId) return null;
    return p.player;
  } catch { return null; }
}
function registerGameIdentityRoutes(app, { secret, getAccountId, isSessionActive = () => true }) {
  app.get('/api/game-session/:gameId', async (req, res) => {
    res.set('Cache-Control', 'no-store');
    if (!GAMES.has(req.params.gameId)) return res.status(404).json({ ok: false });
    const user = req.session?.discordUser;
    if (!user) return res.status(401).json({ ok: false, error: 'auth_required' });
    try {
      if (!isSessionActive(req, user)) return res.status(401).json({ ok: false, error: 'auth_required' });
      const accountId = await getAccountId(user);
      if (!accountId || !isSessionActive(req, user)) return res.status(401).json({ ok: false, error: 'auth_required' });
      const player = { platform: String(user.provider || 'discord'), userId: String(user.id), accountId: String(accountId), username: String(user.username || accountId).slice(0, 64) };
      return res.json({ ok: true, accountId: player.accountId, ...mintGameSession(secret, req.params.gameId, player) });
    } catch { return res.status(503).json({ ok: false, error: 'identity_unavailable' }); }
  });
}
module.exports = { mintGameSession, verifyGameSession, registerGameIdentityRoutes };
