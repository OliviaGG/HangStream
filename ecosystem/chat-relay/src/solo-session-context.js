'use strict';
const GAMES = new Set(['wordle-sp', 'betwixt-sp', 'figural-sp', 'pixeletters-sp', 'unwordle-sp', 'word500-sp', 'spellingbee-sp']);
function createSoloSessionCheck({ hasInternalApiKey, isSessionActive }) {
  return function check(req, res, accountId, originalUser) {
    const reported = req.body?.game;
    const game = req.params?.gameId || (typeof reported === 'string' && reported.endsWith('-sp') ? reported : `${reported}-sp`);
    if (!GAMES.has(game.replace(/-weekly$/, '')) || hasInternalApiKey(req)) return true;
    const user = req.session?.discordUser;
    if (!user || user !== originalUser || !isSessionActive(req, user)) {
      res.status(401).json({ ok: false, error: 'Your session changed. Reload your own progress.' }); return false;
    }
    let expected;
    try {
      const raw = req.headers['x-solo-session-context'];
      if (!raw) { res.status(428).json({ ok: false, error: 'Reload this game to update account protection.' }); return false; }
      if (typeof raw !== 'string' || raw.length > 1024) throw Error('invalid context');
      expected = JSON.parse(raw);
    } catch { res.status(400).json({ ok: false, error: 'Invalid session context' }); return false; }
    if (!expected || expected.id !== String(user.id) || expected.provider !== (user.provider || 'discord') || expected.anchorId !== String(accountId)) {
      res.status(409).json({ ok: false, error: 'This progress belongs to another account.' }); return false;
    }
    return true;
  };
}
module.exports = { createSoloSessionCheck };
