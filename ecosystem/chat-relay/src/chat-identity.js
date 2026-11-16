'use strict';
const crypto = require('node:crypto');
function createChatIdentity({ getSession, botKey, now = Date.now, isBotServiceActive = () => true,
  isSessionActive = () => true,
  origins = ['https://wordtycoon.live', 'https://www.wordtycoon.live'], timeoutMs = 2000 } = {}) {
  const allowed = new Set(origins), botDigest = botKey ? crypto.createHash('sha256').update(botKey).digest('hex') : null;
  function authorizeBot(socket, registration) {
    socket._botCommandIdentity = null;
    if (!botKey || registration?.id !== 'discord-bot' || String(registration?.port) !== '3026' ||
        typeof registration.commandKey !== 'string' || registration.commandKey.length !== botKey.length) return false;
    const actual = Buffer.from(registration.commandKey), expected = Buffer.from(botKey);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return false;
    socket._botCommandIdentity = botDigest;
    return true;
  }
  function envelope(data) {
    return !!data && typeof data === 'object' && !Array.isArray(data) &&
      Object.hasOwn(data, 'user') && Object.hasOwn(data, 'message') &&
      !!data.user && typeof data.user === 'object' && !Array.isArray(data.user) && Object.hasOwn(data.user, 'id') &&
      typeof data.user.id === 'string' && data.user.id.length > 0 && data.user.id.length <= 128 &&
      typeof data.message === 'string' && data.message.trim().length > 0 && data.message.length <= 500;
  }
  async function resolve(socket, data, { allowBot = false } = {}) {
    if (!envelope(data)) return null;
    if (allowBot && botDigest && socket._appId === 'discord-bot' && socket._botCommandIdentity === botDigest) {
      try { if (!isBotServiceActive(socket)) return null; } catch { return null; }
      if (!/^discord_\d{17,20}$/.test(data.user.id) || typeof data.user.username !== 'string' ||
          !data.user.username.trim() || data.user.username.length > 128) return null;
      return { kind: 'bot', message: data.message.trim(), user: { id: data.user.id,
        username: data.user.username.trim(), displayName: typeof data.user.displayName === 'string'
          && data.user.displayName.trim() && data.user.displayName.length <= 128 ? data.user.displayName.trim() : data.user.username.trim(), profilePic: null } };
    }
    // SameSite=None portal cookies can ride cross-site WebSockets. Origin must be a hub.
    if (!allowed.has(socket.handshake?.headers?.origin)) return null;
    const sid = socket.request?.sessionID;
    if (typeof sid !== 'string' || !sid || sid.length > 256 || typeof getSession !== 'function') return null;
    let session;
    try {
      session = await new Promise(resolve => {
        let settled = false;
        const timer = setTimeout(() => { settled = true; resolve(null); }, timeoutMs); timer.unref?.();
        try { getSession(sid, (error, value) => { if (settled) return; settled = true; clearTimeout(timer); resolve(error ? null : value); }); }
        catch { settled = true; clearTimeout(timer); resolve(null); }
      });
    } catch { return null; }
    try { if (!isSessionActive(session)) return null; } catch { return null; }
    const user = session?.discordUser, expiry = Date.parse(session?.cookie?.expires);
    if (!user || typeof user.id !== 'string' || user.id.length > 128 || data.user.id !== user.id ||
        !Number.isFinite(expiry) || expiry <= now() || typeof user.username !== 'string' ||
        !user.username.trim() || user.username.length > 128) return null;
    const displayName = typeof user.globalName === 'string' && user.globalName.trim() && user.globalName.length <= 128
      ? user.globalName.trim() : user.username.trim();
    const profilePic = typeof user.avatar === 'string' && user.avatar.length <= 2048 &&
      (/^https:\/\//.test(user.avatar) || /^\/(?!\/)/.test(user.avatar)) ? user.avatar : null;
    return { kind: 'portal', message: data.message.trim(), user: { id: user.id, username: user.username.trim(), displayName, profilePic } };
  }
  return { authorizeBot, envelope, resolve };
}
module.exports = { createChatIdentity };
