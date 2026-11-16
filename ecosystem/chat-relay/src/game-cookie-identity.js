'use strict';
const crypto = require('node:crypto');

// Games forward cookie proofs to the portal; browser-supplied player IDs never
// participate in this lookup. Support live sessions even when device trust is off.
function createGameCookieIdentity({ secret, getSession, verifyRememberToken,
  isSessionActive = () => true, now = Date.now, timeoutMs = 2000 } = {}) {
  if (typeof secret !== 'string' || !secret || typeof getSession !== 'function' ||
      typeof verifyRememberToken !== 'function') throw Error('Game identity configuration required');

  function cookie(header, name) {
    const part = header.split(';').find(value => value.trim().startsWith(name + '='));
    try { return part ? decodeURIComponent(part.trim().slice(name.length + 1)) : null; } catch { return null; }
  }
  function sessionId(value) {
    if (typeof value !== 'string' || !value.startsWith('s:') || value.length > 512) return null;
    const signed = value.slice(2), at = signed.lastIndexOf('.');
    if (at < 1 || at > 256) return null;
    const id = signed.slice(0, at), signature = signed.slice(at + 1);
    const expected = crypto.createHmac('sha256', secret).update(id).digest('base64').replace(/=+$/, '');
    const actual = Buffer.from(signature), proof = Buffer.from(expected);
    return actual.length === proof.length && crypto.timingSafeEqual(actual, proof) ? id : null;
  }
  function normalizedUser(user) {
    if (!user || typeof user.id !== 'string' || !user.id || user.id.length > 128 || user.id !== user.id.trim() ||
        typeof user.username !== 'string' || !user.username.trim() || user.username.length > 256) return null;
    const provider = user.provider || (user.id.startsWith('gh_') ? 'github' : user.id.startsWith('go_') ? 'google' : user.id.startsWith('tt_') ? 'tiktok' : 'discord');
    if (!['discord', 'github', 'google', 'tiktok'].includes(provider)) return null;
    return { id: user.id, username: user.username, provider };
  }
  function readSession(id) {
    return new Promise(resolve => {
      let settled = false;
      const finish = result => { if (settled) return; settled = true; clearTimeout(timer); resolve(result); };
      const timer = setTimeout(() => finish({ failed: true }), timeoutMs);
      try { getSession(id, (error, session) => finish(error ? { failed: true } : { session })); }
      catch { finish({ failed: true }); }
    });
  }
  async function resolve(header) {
    if (typeof header !== 'string' || !header || header.length > 16384) return null;
    const rememberToken = cookie(header, 'wt_remember');
    let remembered = null;
    try { remembered = normalizedUser(verifyRememberToken(rememberToken)); } catch { return null; }
    const id = sessionId(cookie(header, 'connect.sid'));
    if (!id) return remembered;
    const result = await readSession(id);
    if (result.failed) return null;
    // Logout/account switching can revoke the remembered proof while the store
    // read is pending. Revalidate before using it as a fallback or account choice.
    try { remembered = normalizedUser(verifyRememberToken(rememberToken)); } catch { return null; }
    const session = result.session, user = normalizedUser(session?.discordUser);
    const expiry = Date.parse(session?.cookie?.expires);
    try {
      if (!user || !Number.isFinite(expiry) || expiry <= now() || !isSessionActive(session)) return remembered;
    } catch { return null; }
    // Match the portal's restore middleware when both cookies prove different
    // accounts. A valid remember cookie selects that account in the portal too.
    return remembered && remembered.id !== user.id ? remembered : user;
  }
  return { resolve };
}
module.exports = { createGameCookieIdentity };
