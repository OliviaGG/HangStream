'use strict';
const crypto = require('node:crypto');
const TTL = 60000, CAP = 1000;
function createAuthHandoffs({ origins, isSessionActive, now = Date.now, randomBytes = crypto.randomBytes } = {}) {
  const allowed = new Set(origins), tokens = new Map();
  function targetUrl(value) {
    if (typeof value !== 'string' || value.length > 4096) return null;
    try {
      const url = new URL(value);
      return !url.username && !url.password && allowed.has(url.origin) ? url : null;
    } catch { return null; }
  }
  function active(entry) {
    if (!entry || now() < entry.created || now() - entry.created >= TTL) return false;
    try { return isSessionActive(entry.session, entry.user.id) === true; } catch { return false; }
  }
  function prune() { for (const [token, entry] of tokens) if (!active(entry)) tokens.delete(token); }
  function issue(user, target, session, { rememberDisabled = false } = {}) {
    const url = targetUrl(target);
    if (!url || !user || typeof user.id !== 'string' || !user.id || user.id.length > 128) throw Error('Invalid authentication handoff');
    const entry = { user: JSON.parse(JSON.stringify(user)), audience: url.origin, session: session && { ...session }, created: now(), rememberDisabled: rememberDisabled === true };
    if (!active(entry)) throw Error('Authentication session unavailable');
    prune();
    for (const [token, prior] of tokens) if (prior.user.id === user.id && prior.audience === entry.audience && prior.session.sid === entry.session.sid) return token;
    if (tokens.size >= CAP) throw Error('Authentication handoff capacity reached');
    const token = randomBytes(24).toString('hex');
    if (!/^[a-f0-9]{48}$/.test(token) || tokens.has(token)) throw Error('Authentication handoff entropy unavailable');
    tokens.set(token, entry); return token;
  }
  function take(token, origin) {
    if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token) || typeof origin !== 'string') return null;
    const entry = tokens.get(token);
    if (!active(entry)) { tokens.delete(token); return null; }
    if (origin !== entry.audience || !allowed.has(origin)) return null;
    tokens.delete(token); return entry;
  }
  function appendToken(target, token) {
    const url = targetUrl(target);
    if (!url || typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) throw Error('Invalid authentication return target');
    url.searchParams.set('auth_token', token); return url.toString();
  }
  return { issue, take, targetUrl, appendToken };
}
module.exports = { createAuthHandoffs, TTL, CAP };
