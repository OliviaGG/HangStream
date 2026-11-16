'use strict';
const { SPECS } = require('./service-key-policy');
// Credentials are selected from a fixed localhost service inventory. Redirects
// cannot carry them to another host or to a different service.
function createServiceFetch({ request = globalThis.fetch, policy, relayKey, operatorKey, adminKeys = {} }) {
  if (!policy || typeof relayKey !== 'string' || !relayKey) throw new Error('Service transport unavailable');
  const ports = new Map(Object.entries(SPECS).filter(([, spec]) => spec.game).map(([id, spec]) => [String(spec.port), id]));
  const privateKeys = new Set([relayKey, operatorKey, ...Object.values(adminKeys)].filter(key => typeof key === 'string' && key));
  return function serviceFetch(input, options = {}) {
    const headers = new Headers(options.headers ?? input?.headers ?? {});
    const supplied = ['x-api-key', 'x-admin-key', 'x-relay-auth'].some(name => privateKeys.has(headers.get(name))) ||
      privateKeys.has(headers.get('authorization')?.replace(/^Bearer /i, ''));
    if (!supplied) return request(input, options);
    let url;
    try { url = new URL(typeof input?.url === 'string' ? input.url : input); }
    catch { throw new Error('Service credential destination is not allowed'); }
    const local = url.protocol === 'http:' && !url.username && !url.password && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const id = local ? ports.get(url.port) : null;
    if (!id) {
      if (local && ['3000', '3020'].includes(url.port)) return request(input, { ...options, redirect: 'error' });
      if (local && url.port === '3032') {
        // Voice has its own protocol; the economy key is not its credential.
        for (const name of ['x-api-key', 'x-admin-key', 'x-relay-auth', 'authorization']) headers.delete(name);
        return request(input, { ...options, headers, redirect: 'error' });
      }
      throw new Error('Service credential destination is not allowed');
    }
    let key = policy.keyForService(id);
    if (adminKeys[id] && url.pathname.startsWith('/api/admin/') && !policy.pending(id)) key = adminKeys[id];
    for (const name of ['x-api-key', 'x-admin-key', 'x-relay-auth', 'authorization']) headers.delete(name);
    headers.set('x-api-key', key);
    // Some game endpoints call their own service key x-admin-key.
    headers.set('x-admin-key', key);
    return request(input, { ...options, headers, redirect: 'error' });
  };
}
let defaultTransport;
function serviceFetch(input, options) {
  if (!defaultTransport) {
    const { createServiceKeyPolicy } = require('./service-key-policy');
    defaultTransport = createServiceFetch({
      policy: createServiceKeyPolicy({ filename: require('node:path').join(__dirname, '../data/service-keys.json') }),
      relayKey: process.env.GAME_API_SECRET,
      operatorKey: process.env.ADMIN_API_SECRET,
      adminKeys: { triangled: process.env.TRIANGLED_ADMIN_SECRET }
    });
  }
  return defaultTransport(input, options);
}
module.exports = { createServiceFetch, serviceFetch };
