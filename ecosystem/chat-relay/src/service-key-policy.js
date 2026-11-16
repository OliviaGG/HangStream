'use strict';
const fs = require('node:fs');
const crypto = require('node:crypto');
const SPECS = Object.freeze({
  'word-tycoon': { port: 3020, game: null },
  'chat-relay': { port: 3000, game: null },
  'discord-bot': { port: 3026, game: null },
  word500: { port: 3011, game: 'word5000' },
  word1000: { port: 3018, game: 'word5000' },
  colour500: { port: 3033, game: 'color500' },
  pixeletters: { port: 3012, game: 'pixeletters' },
  spellingbee: { port: 3013, game: 'spelling-bee' },
  wordle: { port: 3014, game: 'wordle' },
  searchle: { port: 3015, game: 'subtextle', aliases: ['subtextle'] },
  rectangled: { port: 3016, game: 'rectangled' },
  betwixt: { port: 3017, game: 'betwixt' },
  figural: { port: 3019, game: 'figural' },
  unwordle: { port: 3021, game: 'unwordle' },
  erectangled: { port: 3023, game: 'erectangled', aliases: ['sproutle'] },
  triangled: { port: 3024, game: 'triangled' },
  wikisearchle: { port: 3029, game: 'wikicontexto' },
  wikirectangled: { port: 3031, game: 'wikirectangled' }
});
for (const spec of Object.values(SPECS)) {
  if (spec.aliases) Object.freeze(spec.aliases);
  Object.freeze(spec);
}
const GAME_ALIASES = Object.freeze({
  word500: 'word5000', word1000: 'word5000', 'word-500': 'word5000',
  colour500: 'color500', 'colour-500': 'color500', spellingbee: 'spelling-bee',
  searchle: 'subtextle', 'searchle-grid': 'subtextle', 'searchle-numbers': 'subtextle', squaredle: 'rectangled',
  sproutle: 'erectangled', betweenly: 'betwixt', betweenle: 'betwixt',
  wikisearchle: 'wikicontexto'
});
const GAME_FAMILIES = new Set([...Object.values(SPECS).map(spec => spec.game).filter(Boolean),
  'junkdrawer', 'cloudquarry', 'letterworks', 'wordfall', 'synapse']);
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
function gameFamily(value) {
  if (typeof value !== 'string' || value.length > 80) return null;
  let id = value.trim().toLowerCase();
  id = id.replace(/(?:[-_](?:sp|mp|solo|online|weekly)){1,2}$/, '');
  return GAME_ALIASES[id] || id || null;
}
function serviceForApp(value) {
  if (typeof value !== 'string') return null;
  return Object.keys(SPECS).find(id => id === value || SPECS[id].aliases?.includes(value)) || null;
}
function safePath(value) {
  if (typeof value !== 'string' || value.length > 2048 || value.includes('\\') || /%(?:2f|5c|2e)/i.test(value) || /(?:^|\/)\.{1,2}(?:\/|\?|$)/.test(value)) return null;
  try { return new URL(value, 'http://local').pathname; } catch { return null; }
}
function createServiceKeyPolicy({ filename, now = Date.now, pollMs = 1000, filesystem = fs }) {
  let state = null, stamp = null, lastChecked = -Infinity, failed = false;
  function refresh(force = false) {
    const time = now();
    if (!force && time - lastChecked < pollMs) return !!state;
    lastChecked = time;
    try {
      const stat = filesystem.lstatSync(filename);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 32768 ||
          (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) throw Error('unsafe registry');
      const signature = stat.ino + ':' + stat.mtimeMs + ':' + stat.size;
      if (state && !failed && stamp === signature) return true;
      const registry = JSON.parse(filesystem.readFileSync(filename, 'utf8'));
      if (registry.version !== 1 || !registry.keys || typeof registry.keys !== 'object' || Array.isArray(registry.keys)) throw Error('invalid registry');
      const ids = Object.keys(SPECS), supplied = Object.keys(registry.keys);
      if (supplied.length !== ids.length || supplied.some(id => !Object.hasOwn(SPECS, id))) throw Error('incomplete registry');
      const byDigest = new Map();
      for (const id of ids) {
        const key = registry.keys[id];
        if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key) || byDigest.has(digest(key))) throw Error('invalid issuer key');
        byDigest.set(digest(key), Object.freeze({ id, game: SPECS[id].game, keyDigest: digest(key), legacy: false }));
      }
      const legacy = registry.legacy;
      if (legacy != null && (typeof legacy.key !== 'string' || !legacy.key || legacy.key.length > 256 ||
          !Number.isFinite(legacy.until) || legacy.until > time + 600000 || byDigest.has(digest(legacy.key)))) throw Error('invalid migration window');
      if (legacy?.pending != null && (!Array.isArray(legacy.pending) || legacy.pending.length > ids.length ||
          new Set(legacy.pending).size !== legacy.pending.length || legacy.pending.some(id => !Object.hasOwn(SPECS, id)))) throw Error('invalid migration targets');
      state = { keys: { ...registry.keys }, byDigest, legacy: legacy ? { key: legacy.key, until: legacy.until, pending: new Set(legacy.pending || []) } : null };
      stamp = signature; failed = false;
      return true;
    } catch {
      state = null; failed = true;
      if (force) throw Error('Service credential registry unavailable or invalid');
      return false;
    }
  }
  refresh(true);
  function identify(key) {
    if (typeof key !== 'string' || !key || key.length > 256 || !refresh()) return null;
    const principal = state.byDigest.get(digest(key));
    if (principal) return principal;
    if (state.legacy && state.legacy.until > now() && digest(key) === digest(state.legacy.key)) return Object.freeze({ id: 'legacy', game: null, keyDigest: digest(key), legacy: true });
    return null;
  }
  function active(principal) {
    if (!principal || !refresh()) return false;
    if (principal.legacy) return (principal.id === 'legacy' || Object.hasOwn(SPECS, principal.id))
      && !!state.legacy && state.legacy.until > now() && principal.keyDigest === digest(state.legacy.key);
    return state.byDigest.get(principal.keyDigest)?.id === principal.id;
  }
  function ownsGame(principal, game) {
    if (!active(principal)) return false;
    const family = gameFamily(game);
    if (!GAME_FAMILIES.has(family)) return false;
    if (['word-tycoon', 'chat-relay'].includes(principal.id) || principal.id === 'legacy') return true;
    return !!SPECS[principal.id]?.game && family === SPECS[principal.id].game;
  }
  function register(key, data) {
    const principal = identify(key), id = serviceForApp(data?.id);
    if (!principal || !id || id === 'chat-relay' || (!principal.legacy && principal.id !== id)) return null;
    if (data.port != null && String(data.port) !== String(SPECS[id].port)) return null;
    return Object.freeze({ id, game: SPECS[id].game, keyDigest: principal.keyDigest, legacy: principal.legacy });
  }
  function canEconomy(principal, method, url, { body = {}, params = {}, query = {} } = {}) {
    const path = safePath(url);
    if (!active(principal) || !path || !['GET', 'POST'].includes(method) || path.startsWith('/api/word-foundry')) return false;
    const central = ['word-tycoon', 'chat-relay', 'legacy'].includes(principal.id);
    if (central) {
      if (method === 'POST' && ['/api/reward', '/api/library/report', '/api/elo/update'].includes(path)) return ownsGame(principal, body.game);
      if (method === 'POST' && ['/api/deduct', '/api/balance', '/api/play', '/api/player/region', '/api/daily-claim',
        '/api/link/create-code', '/api/link/verify-code', '/api/link/verified-email', '/api/link/decline',
        '/api/cosmetics/buy', '/api/cosmetics/equip', '/api/cosmetics/unequip', '/api/cosmetics/buyset', '/api/cosmetics/grant-fanclub-set',
        '/api/report-ip', '/api/friends/request', '/api/friends/accept', '/api/friends/decline', '/api/friends/remove'].includes(path)) return true;
      if (method === 'POST' && /^\/api\/link\/sync\/[^/]+$/.test(path)) return true;
      if (method === 'GET' && ['/api/reward/protocol', '/api/link/resolve', '/api/link/by-email', '/api/link/decline-check',
        '/api/account/zero-state', '/api/daily-claim/status', '/api/city-data', '/api/cosmetics/grant-status',
        '/api/friends/search', '/api/elo/cheaters'].includes(path)) return true;
      if (method === 'GET' && /^\/api\/(?:cosmetic-visibility|completion-status|link\/(?:status|check)|friends\/(?:list|profile)|elo\/player)\/[^/]+$/.test(path)) return true;
      if (method === 'GET' && path.startsWith('/api/reward/status/')) return ownsGame(principal, params.game || path.split('/')[4]);
    }
    if (method === 'GET' && path === '/api/reward/protocol') return true;
    if (method === 'POST' && ['/api/reward', '/api/library/report', '/api/elo/update'].includes(path)) return ownsGame(principal, body.game);
    if (method === 'GET' && path.startsWith('/api/reward/status/')) return ownsGame(principal, params.game || path.split('/')[4]);
    if (method === 'POST' && path === '/api/balance') return !!SPECS[principal.id]?.game || principal.id === 'discord-bot';
    if (method === 'POST' && path === '/api/player/region') return !!SPECS[principal.id]?.game;
    if (method === 'POST' && path === '/api/report-ip') return ownsGame(principal, body.game);
    if (principal.id === 'discord-bot') {
      if (method === 'POST' && ['/api/play', '/api/link/create-code', '/api/link/verify-code'].includes(path)) return true;
      if (method === 'POST' && /^\/api\/link\/sync\/[^/]+$/.test(path)) return true;
      if (method === 'GET' && /^\/api\/link\/(?:status|check)\/[^/]+$/.test(path)) return true;
    }
    if (principal.id === 'searchle' && method === 'GET') {
      if (path === '/api/admin/accounts/linked-groups') return true;
      if (['/api/admin/game-recent', '/api/admin/game-won-words'].includes(path)) return ownsGame(principal, query.game);
    }
    return false;
  }
  function canRelay(principal, method, url, { body = {}, params = {} } = {}) {
    const path = safePath(url);
    if (!active(principal) || !path || !['GET', 'POST'].includes(method)) return false;
    if (method === 'GET' && path === '/api/internal/whoami') return true;
    if (method === 'GET' && /^\/api\/word-bank\/(?:daily|weekly)\/[^/]+$/.test(path))
      return ownsGame(principal, params.gameId || path.split('/')[4]);
    if (method === 'POST' && /^\/api\/sp-(?:daily|weekly)\/complete\/[^/]+$/.test(path))
      return ownsGame(principal, params.gameId || path.split('/')[4]);
    if (method === 'POST' && ['/api/hints/spend', '/api/hints/reveal', '/api/hints/reveal/prepare', '/api/hints/reveal/settle',
      '/api/hints/reveal/close', '/api/hints/reveal/receipt'].includes(path)) return ownsGame(principal, body.game);
    if (['word-tycoon', 'chat-relay', 'legacy'].includes(principal.id)) {
      if (method === 'POST' && ['/api/feed-event', '/api/cosmetics-broadcast', '/api/internal/hints/recharge',
        '/api/internal/hints/grant', '/api/internal/pookie-tok/complete'].includes(path)) return true;
    }
    if (method === 'POST' && path === '/api/link/sync') return ['discord-bot', 'word-tycoon', 'chat-relay', 'legacy'].includes(principal.id);
    return false;
  }
  function keyForService(id) {
    if (!Object.hasOwn(SPECS, id) || !refresh()) throw Error('Service credential unavailable');
    if (pending(id)) return state.legacy.key;
    return state.keys[id];
  }
  function pending(id) { return refresh() && !!state.legacy && state.legacy.until > now() && state.legacy.pending.has(id); }
  return { identify, active, ownsGame, register, canEconomy, canRelay, keyForService, pending,
    summary: () => ({ available: refresh(), issuers: state ? state.byDigest.size : 0, legacyActive: !!state?.legacy && state.legacy.until > now() }) };
}
module.exports = { SPECS, gameFamily, serviceForApp, safePath, createServiceKeyPolicy };
