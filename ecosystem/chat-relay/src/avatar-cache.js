/**
 * avatar-cache.js — Proxy + persistent cache for short-lived avatar URLs.
 *
 * TikTok avatar URLs are signed with x-expires (~14 days). Once the URL is
 * stored in the DB and the user stops appearing in connected live streams,
 * the URL silently expires and every consumer (game pages, leaderboards,
 * win-overlay) shows a broken image.
 *
 * Strategy:
 *   1. When a fresh signed URL flows in via the realtime ingest (tiktok-direct
 *      mapUser), eagerly download the bytes to disk keyed by (platform,userId)
 *      and rewrite the in-memory user.profilePic to a stable proxy URL
 *      (/api/avatar/<platform>/<userId>).
 *   2. The /api/avatar endpoint serves the cached bytes. On cache miss it
 *      tries the persisted source URL once; if that 403s (expired), it
 *      redirects to the WT logo placeholder.
 *
 * Net effect: every consumer stores a permanent proxy URL that never breaks
 * even if the underlying signed URL expires.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { URL } = require('url');

const ROOT = path.join(__dirname, '..', 'data', 'avatars');
const FALLBACK_PATH = '/portal/img/logo.png';
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB hard cap
const FETCH_TIMEOUT_MS = 8000;

// In-flight de-dupe. Two near-simultaneous chat events for the same user
// would otherwise both download the avatar.
const inflight = new Map();

try { fs.mkdirSync(ROOT, { recursive: true }); } catch (e) {}

/**
 * Sanitize a platform-userId pair into a safe filename slug. Only allows
 * [a-zA-Z0-9._-]; everything else collapses to '_'. Caps length at 96.
 */
function slug(platform, userId) {
  const p = String(platform || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const u = String(userId || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 96);
  if (!p || !u) return null;
  return `${p}_${u}`;
}

/**
 * Detect TikTok signed CDN URLs. These are the ones that expire.
 * Pattern: any *.tiktokcdn.com host with x-expires + x-signature query params.
 */
function isTikTokSignedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    if (!/(^|\.)tiktokcdn(-[a-z0-9]+)?\.com$/i.test(u.hostname)) return false;
    return u.searchParams.has('x-expires') && u.searchParams.has('x-signature');
  } catch (e) {
    return false;
  }
}

const AVATAR_BASE_URL = process.env.PUBLIC_URL || '';

function proxyUrl(platform, userId) {
  const s = slug(platform, userId);
  if (!s) return null;
  // Keep the URL structure resource-like so any downstream cache key sees a
  // stable path. Browsers can disk-cache it.
  // Use absolute URL so game servers (Searchle, RecTangled, etc.) can serve
  // the proxied avatar without hosting their own /api/avatar endpoint.
  const base = AVATAR_BASE_URL.endsWith('/') ? AVATAR_BASE_URL.slice(0, -1) : AVATAR_BASE_URL;
  return `${base}/api/avatar/${encodeURIComponent(platform.toLowerCase())}/${encodeURIComponent(userId)}`;
}

/**
 * Find a cached file for the given (platform, userId). Returns the absolute
 * path + extension, or null if nothing cached yet.
 */
function findCachedFile(platform, userId) {
  const s = slug(platform, userId);
  if (!s) return null;
  for (const ext of ['webp', 'jpg', 'jpeg', 'png', 'gif']) {
    const p = path.join(ROOT, `${s}.${ext}`);
    if (fs.existsSync(p)) return { path: p, ext };
  }
  return null;
}

function metaPath(platform, userId) {
  const s = slug(platform, userId);
  return s ? path.join(ROOT, `${s}.json`) : null;
}

function readMeta(platform, userId) {
  const p = metaPath(platform, userId);
  if (!p || !fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function writeMeta(platform, userId, data) {
  const p = metaPath(platform, userId);
  if (!p) return;
  try { fs.writeFileSync(p, JSON.stringify(data, null, 2)); } catch (e) {}
}

/**
 * Pick a file extension from Content-Type. Falls back to webp because
 * TikTok serves webp by default.
 */
function extFromContentType(ct) {
  const c = String(ct || '').toLowerCase();
  if (c.includes('webp')) return 'webp';
  if (c.includes('jpeg') || c.includes('jpg')) return 'jpg';
  if (c.includes('png')) return 'png';
  if (c.includes('gif')) return 'gif';
  return 'webp';
}

const EXT_TO_MIME = {
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
};

/**
 * Download a URL into a Buffer with a size cap and timeout. Resolves with
 * { buffer, contentType } or rejects.
 */
function fetchBytes(url) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { return reject(new Error('Invalid URL')); }
    const lib = parsed.protocol === 'http:' ? http : https;
    const req = lib.get(url, {
      headers: {
        // TikTok CDNs accept generic UAs; some hosts 403 empty UAs.
        'User-Agent': 'Mozilla/5.0 (compatible; ChatRelayAvatarCache/1.0)',
        Accept: 'image/webp,image/avif,image/png,image/*;q=0.8,*/*;q=0.5',
      },
      timeout: FETCH_TIMEOUT_MS,
    }, (res) => {
      // Follow one level of redirect.
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        fetchBytes(new URL(res.headers.location, url).toString()).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const chunks = [];
      let total = 0;
      res.on('data', (c) => {
        total += c.length;
        if (total > MAX_BYTES) {
          req.destroy(new Error('Avatar too large'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType: res.headers['content-type'] || '' }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Avatar fetch timeout')));
    req.on('error', reject);
  });
}

/**
 * Download (platform, userId) avatar from sourceUrl, save to disk, write
 * meta. Idempotent + de-duped. Returns { ok, path?, error? }.
 */
async function cacheFromUrl(platform, userId, sourceUrl) {
  const s = slug(platform, userId);
  if (!s || !sourceUrl) return { ok: false, error: 'invalid args' };
  if (inflight.has(s)) return inflight.get(s);
  const promise = (async () => {
    try {
      const { buffer, contentType } = await fetchBytes(sourceUrl);
      if (!buffer.length) throw new Error('Empty body');
      const ext = extFromContentType(contentType);
      // Remove any prior cached extension for this slug so we don't end up
      // with both foo.webp and foo.jpg.
      for (const e of ['webp', 'jpg', 'jpeg', 'png', 'gif']) {
        if (e === ext) continue;
        const p = path.join(ROOT, `${s}.${e}`);
        try { fs.unlinkSync(p); } catch (_) {}
      }
      const filePath = path.join(ROOT, `${s}.${ext}`);
      fs.writeFileSync(filePath, buffer);
      writeMeta(platform, userId, {
        platform: String(platform).toLowerCase(),
        userId: String(userId),
        sourceUrl,
        contentType,
        fetchedAt: new Date().toISOString(),
        bytes: buffer.length,
      });
      return { ok: true, path: filePath, ext };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    } finally {
      inflight.delete(s);
    }
  })();
  inflight.set(s, promise);
  return promise;
}

/**
 * Async fire-and-forget: cache the bytes if we don't already have a fresh
 * copy for this user. "Fresh" = file exists AND meta.sourceUrl matches the
 * incoming URL (re-cache if the URL changed).
 */
function ensureCached(platform, userId, sourceUrl) {
  if (!isTikTokSignedUrl(sourceUrl)) return;
  const cached = findCachedFile(platform, userId);
  const meta = readMeta(platform, userId);
  if (cached && meta && meta.sourceUrl === sourceUrl) return;
  // Background download — never await, never throw.
  cacheFromUrl(platform, userId, sourceUrl).catch(() => {});
}

/**
 * For a (platform, userId) with a signed URL: store the URL in meta so the
 * /api/avatar handler can fall back to it on cold-cache reads, kick off the
 * download, and return the proxy URL the caller should use everywhere.
 */
function rewriteAvatarUrl(platform, userId, sourceUrl) {
  if (!sourceUrl) return null;
  if (!isTikTokSignedUrl(sourceUrl)) return sourceUrl;
  const proxy = proxyUrl(platform, userId);
  if (!proxy) return sourceUrl;
  ensureCached(platform, userId, sourceUrl);
  return proxy;
}

/**
 * Express handler for GET /api/avatar/:platform/:userId.
 *
 * Resolution order:
 *   1. Cached file on disk → stream it.
 *   2. Persisted sourceUrl in meta → fetch once, cache, stream.
 *   3. Redirect to fallback placeholder.
 */
async function handleRequest(req, res) {
  const { platform, userId } = req.params;
  const s = slug(platform, userId);
  if (!s) {
    res.set('Cache-Control', 'public, max-age=60');
    return res.redirect(302, FALLBACK_PATH);
  }

  let cached = findCachedFile(platform, userId);
  if (!cached) {
    const meta = readMeta(platform, userId);
    if (meta && meta.sourceUrl) {
      const result = await cacheFromUrl(platform, userId, meta.sourceUrl);
      if (result.ok) cached = { path: result.path, ext: result.ext };
    }
  }

  if (!cached) {
    res.set('Cache-Control', 'public, max-age=300');
    return res.redirect(302, FALLBACK_PATH);
  }

  res.set('Content-Type', EXT_TO_MIME[cached.ext] || 'image/webp');
  // Long browser cache; the URL is keyed by stable userId so contents only
  // change if the user picks a new TikTok avatar.
  res.set('Cache-Control', 'public, max-age=86400, immutable');
  fs.createReadStream(cached.path).pipe(res);
}

module.exports = {
  isTikTokSignedUrl,
  proxyUrl,
  rewriteAvatarUrl,
  ensureCached,
  cacheFromUrl,
  handleRequest,
  FALLBACK_PATH,
};
