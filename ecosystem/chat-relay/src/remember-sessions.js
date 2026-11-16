'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const MAX_AGE = 30 * 24 * 60 * 60 * 1000, MAX_BYTES = 4 * 1024 * 1024, MAX_ENTRIES = 20000;
function createRememberSessions({ secret, filename, now = Date.now, legacySecret = secret, legacyUntil = now() + MAX_AGE,
  fsImpl = fs, randomBytes = crypto.randomBytes } = {}) {
  if (typeof secret !== 'string' || secret.length < 32 || !filename) throw Error('Remember session configuration required');
  if (typeof legacySecret !== 'string' || !Number.isFinite(legacyUntil) || legacyUntil < 0 || legacyUntil > now() + MAX_AGE + 60000) throw Error('Invalid legacy remember deadline');
  const digest = value => crypto.createHmac('sha256', secret).update('remember-revocation:' + value).digest('hex');
  let revoked = new Map(), legacy = new Map(), uncertain = false;
  function load() {
    try {
      const stat = fsImpl.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > MAX_BYTES || (process.platform !== 'win32' && (stat.mode & 0o077))) throw Error('invalid');
      const saved = JSON.parse(fsImpl.readFileSync(filename, 'utf8'));
      if (saved.version !== 1 || !Array.isArray(saved.revoked) || !Array.isArray(saved.legacy) || saved.revoked.length + saved.legacy.length > MAX_ENTRIES) throw Error('invalid');
      const time = now();
      for (const [key, until] of saved.revoked) {
        if (!/^[a-f0-9]{64}$/.test(key) || !Number.isFinite(until) || until <= 0 || until > time + MAX_AGE + 60000 || revoked.has(key)) throw Error('invalid');
        if (until > time) revoked.set(key, until);
      }
      for (const [key, value] of saved.legacy) {
        if (!/^[a-f0-9]{64}$/.test(key) || !value || !Number.isFinite(value.cutoff) || value.cutoff <= 0 || value.cutoff > time + 60000 ||
            !Number.isFinite(value.until) || value.until !== value.cutoff + MAX_AGE || legacy.has(key)) throw Error('invalid');
        if (value.until > time) legacy.set(key, value);
      }
    } catch (error) {
      if (error.code !== 'ENOENT') throw Error('Remember revocation store unavailable or invalid');
    }
  }
  load();
  function normalizedUser(user) {
    if (!user || typeof user.id !== 'string' || !user.id || user.id.length > 128 || user.id !== user.id.trim() ||
        typeof user.username !== 'string' || !user.username.trim() || user.username.length > 256) return null;
    const provider = user.provider || (user.id.startsWith('gh_') ? 'github' : user.id.startsWith('go_') ? 'google' : user.id.startsWith('tt_') ? 'tiktok' : 'discord');
    if (!['discord', 'github', 'google', 'tiktok'].includes(provider)) return null;
    const result = { id: user.id, username: user.username, provider };
    for (const [key, max] of [['globalName', 256], ['avatar', 2048], ['tiktokHandle', 128]]) {
      if (user[key] != null) { if (typeof user[key] !== 'string' || user[key].length > max) return null; result[key] = user[key]; }
    }
    return result;
  }
  function validPeriod(session) {
    const time = now();
    return !!session && typeof session.account === 'string' && /^[a-f0-9]{64}$/.test(session.account) &&
      Number.isFinite(session.iat) && session.iat <= time + 60000 && Number.isFinite(session.exp) && session.exp > time &&
      session.exp <= time + MAX_AGE + 60000 && session.exp > session.iat && session.exp - session.iat <= MAX_AGE;
  }
  function activeSession(session, userId) {
    if (uncertain || !validPeriod(session) || (userId != null && session.account !== digest('account:' + userId))) return false;
    if (session.legacy === true) return (legacy.get(session.account)?.cutoff ?? -Infinity) < session.iat;
    return typeof session.sid === 'string' && /^[a-f0-9]{32}$/.test(session.sid) && (revoked.get(digest('session:' + session.sid)) || 0) <= now();
  }
  function decode(token) {
    if (typeof token !== 'string' || token.length > 8192 || !/^[A-Za-z0-9_-]+\.[a-f0-9]{64}$/.test(token)) return null;
    try {
      const [encoded, signature] = token.split('.'), payload = Buffer.from(encoded, 'base64url').toString('utf8');
      const value = JSON.parse(payload), user = normalizedUser(value);
      if (!user || !Number.isFinite(value.exp)) return null;
      const old = value.v == null;
      if (!old && value.v !== 2) return null;
      if (old && (!legacySecret || now() >= legacyUntil)) return null;
      const expected = crypto.createHmac('sha256', old ? legacySecret : secret).update(payload).digest();
      if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), expected)) return null;
      const session = { account: digest('account:' + user.id), iat: old ? value.exp - MAX_AGE : value.iat, exp: value.exp,
        ...(old ? { legacy: true } : { sid: value.sid }) };
      if (!validPeriod(session)) return null;
      if (!old && (typeof value.sid !== 'string' || !/^[a-f0-9]{32}$/.test(value.sid))) return null;
      return { user, session };
    } catch { return null; }
  }
  function verify(token) {
    const decoded = decode(token);
    return decoded && activeSession(decoded.session, decoded.user.id) ? decoded : null;
  }
  function mint(user, { session, maxAge = MAX_AGE } = {}) {
    user = normalizedUser(user);
    if (uncertain || !user || !Number.isSafeInteger(maxAge) || maxAge <= 0 || maxAge > MAX_AGE) throw Error('Remember session unavailable');
    const time = now();
    if (session && !activeSession(session, user.id)) throw Error('Remember session expired or revoked');
    const context = session ? { account: session.account, iat: session.iat, exp: session.exp,
      sid: session.legacy ? randomBytes(16).toString('hex') : session.sid } :
      { account: digest('account:' + user.id), iat: time, exp: time + maxAge, sid: randomBytes(16).toString('hex') };
    const payload = JSON.stringify({ ...user, v: 2, sid: context.sid, iat: context.iat, exp: context.exp });
    const token = Buffer.from(payload).toString('base64url') + '.' + crypto.createHmac('sha256', secret).update(payload).digest('hex');
    return { token, session: context, maxAge: context.exp - time };
  }
  function save(nextRevoked, nextLegacy) {
    if (uncertain) throw Error('Remember revocation persistence uncertain');
    if (nextRevoked.size + nextLegacy.size > MAX_ENTRIES) throw Error('Remember revocation capacity reached');
    const bytes = Buffer.from(JSON.stringify({ version: 1, revoked: [...nextRevoked], legacy: [...nextLegacy] }));
    if (bytes.length > MAX_BYTES) throw Error('Remember revocation capacity reached');
    fsImpl.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
    const temporary = filename + '.next-' + randomBytes(8).toString('hex');
    let fd, renamed = false;
    try {
      fd = fsImpl.openSync(temporary, 'wx', 0o600); fsImpl.writeFileSync(fd, bytes); fsImpl.fsyncSync(fd); fsImpl.closeSync(fd); fd = undefined;
      fsImpl.renameSync(temporary, filename); renamed = true;
      if (process.platform !== 'win32') { const directory = fsImpl.openSync(path.dirname(filename), 'r'); try { fsImpl.fsyncSync(directory); } finally { fsImpl.closeSync(directory); } }
      revoked = nextRevoked; legacy = nextLegacy;
    } catch {
      if (renamed) uncertain = true;
      throw Error(renamed ? 'Remember revocation persistence uncertain' : 'Remember revocation could not persist');
    } finally {
      if (fd !== undefined) try { fsImpl.closeSync(fd); } catch {}
      if (!renamed) try { fsImpl.unlinkSync(temporary); } catch {}
    }
  }
  function revoke({ token, session, userId } = {}) {
    const decoded = decode(token), context = session || decoded?.session, id = userId || decoded?.user.id;
    if (!id && !context) return { changed: false };
    if (typeof id !== 'string' || !id || id.length > 128 || (context && context.account !== digest('account:' + id))) throw Error('Remember revocation identity mismatch');
    const time = now(), nextRevoked = new Map([...revoked].filter(([, until]) => until > time)), nextLegacy = new Map([...legacy].filter(([, value]) => value.until > time));
    if (context && context.exp > time && !context.legacy && typeof context.sid === 'string' && /^[a-f0-9]{32}$/.test(context.sid)) {
      nextRevoked.set(digest('session:' + context.sid), context.exp);
    }
    // Old tokens have no device nonce. A logout invalidates all older legacy
    // tokens for this account; newly minted v2 tokens on other devices retain access.
    nextLegacy.set(digest('account:' + id), { cutoff: time, until: time + MAX_AGE });
    save(nextRevoked, nextLegacy);
    return { changed: true };
  }
  return { mint, verify, activeSession, revoke };
}
module.exports = { createRememberSessions, MAX_AGE };
