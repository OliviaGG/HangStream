'use strict';

// TikTok handles are case-insensitive. OAuth open IDs (including tt_ IDs)
// and IDs from other providers are opaque and must keep their original case.
function normalizePlatformUserId(platform, value) {
  const id = String(value ?? '');
  const handle = id.trim().replace(/^@/, '');
  if (platform === 'tiktok' && !handle.startsWith('tt_') && /^[a-z0-9_.]{1,24}$/i.test(handle)) {
    return handle.toLowerCase();
  }
  return id;
}

function linkedIdentityKey(platform, id) {
  return `${platform}:${normalizePlatformUserId(platform, id)}`;
}

function resolveLinkedIdentity(cache, rawId) {
  const id = String(rawId || '');
  if (!id) return null;
  for (const [key, accountId] of cache) {
    const sep = key.indexOf(':');
    if (sep !== -1 && key.slice(sep + 1) === id) return accountId;
  }
  // Prefer an exact OAuth/provider ID before treating the input as a handle.
  return cache.get(linkedIdentityKey('tiktok', id)) || null;
}

// IDs from a verified linked group remain opaque. Only TikTok handles are
// normalized when the cache is built; OAuth/provider ids preserve their case.
function linkedAliasIds(cache, accountId) {
  const owner = String(accountId || ''), aliases = new Set(owner ? [owner] : []);
  for (const [key, value] of cache) {
    if (String(value) !== owner) continue;
    const separator = key.indexOf(':');
    if (separator !== -1) aliases.add(key.slice(separator + 1));
  }
  return [...aliases];
}

module.exports = { normalizePlatformUserId, linkedIdentityKey, resolveLinkedIdentity, linkedAliasIds };
