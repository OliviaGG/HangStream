// ===== Authentication Module =====
// Admin password login + user session management via express-session.

const path = require('path');
const crypto = require('crypto');
const session = require('express-session');
const MemoryStore = require('memorystore')(session);

// ─── Admin login rate limiting (in-memory, per-IP) ───────────────────────
const loginAttempts = new Map(); // ip → { count, firstAttempt }
const LOGIN_RATE_WINDOW = 15 * 60 * 1000; // 15 minutes
const LOGIN_RATE_MAX = 10; // max attempts per window

function checkLoginRateLimit(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.firstAttempt > LOGIN_RATE_WINDOW) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now });
    return true; // allowed
  }
  entry.count++;
  if (entry.count > LOGIN_RATE_MAX) return false; // blocked
  return true;
}

// Cleanup stale rate limit entries every 15 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of loginAttempts) {
    if (now - entry.firstAttempt > LOGIN_RATE_WINDOW) loginAttempts.delete(ip);
  }
}, LOGIN_RATE_WINDOW);

// Admin API prefixes that require admin auth
const ADMIN_API_PREFIXES = [
  '/api/tts/',
  '/api/users',
  '/api/apps',
  '/api/ops/summary',
  '/api/daily-sequence',
  '/api/reconnect/',
  '/api/cosmetics-admin/',
  '/api/jackpot-admin/',
  '/api/accounts-admin/',
  '/api/searchle/',
  '/api/rectangled/',
  '/api/word500/',
  '/api/bridge/',
  '/api/commands',
  '/api/word-bank/admin/',
  '/api/word-bank/current-words',
  '/api/tiktok-direct/',
  '/api/streamers/admin/',
  '/api/admin/'
];

// Which Domain= a cookie should carry for this request. THE one definition —
// server.js imports it for wt_remember so the session cookie and the remember
// cookie can never disagree about scope again.
function getCookieDomainForRequest(req) {
  const explicit = process.env.SESSION_COOKIE_DOMAIN;
  if (explicit && explicit.trim()) return explicit.trim();

  const host = String(req.hostname || '').toLowerCase();
  if (host === 'wordtycoon.live' || host === 'www.wordtycoon.live' || host === 'w.wordtycoon.live' ||
      host.endsWith('.wordtycoon.live')) {
    return '.wordtycoon.live';
  }
  return undefined;
}

function initialize(app) {
  const isProduction = !!process.env.DISCORD_OAUTH_REDIRECT_URI &&
    process.env.DISCORD_OAUTH_REDIRECT_URI.startsWith('https://');

  if (!process.env.SESSION_SECRET) {
    if (isProduction) {
      console.error('[Auth] FATAL: SESSION_SECRET not set in production — refusing to start with insecure fallback');
      process.exit(1);
    }
    console.warn('[Auth] SESSION_SECRET not set — using dev fallback (NOT safe for production)');
  }
  const sessionSecret = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
  initialize._sessionSecret = sessionSecret;

  // ── Admin session (SameSite=Lax) ─────────────────────────────────────────
  // Separate cookie "wt-admin.sid" so it doesn't share the SameSite=None
  // portal session. Admin only ever accesses from wordtycoon.live directly,
  // so Lax is fine and avoids browsers that block SameSite=None cookies.
  const adminStore = new MemoryStore({ checkPeriod: 24 * 60 * 60 * 1000, stale: false });
  const _adminSession = session({
    name: 'wt-admin.sid',
    secret: sessionSecret,
    store: adminStore,
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
      httpOnly: true,
      secure: 'auto',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      sameSite: 'lax'  // no cross-domain needed for admin
    }
  });
  initialize._adminStore = adminStore;

  // Inject admin session before the main portal session for admin-relevant paths.
  // Result: req.adminSession = admin session, req.session = portal session.
  function needsAdminSession(path) {
    if (path === '/') return true;
    if (path.startsWith('/admin')) return true;
    if (path.startsWith('/word-bank')) return true;
    if (path === '/spotify/login') return true;
    if (path === '/api/overlay/settings') return true;
    // These two gate on isAdminRequest but were missing here, so req.adminSession
    // was undefined and a browser-authenticated admin could never pass.
    if (path === '/api/win-overlay/settings') return true;
    if (path === '/api/event-overlay/settings') return true;
    if (path === '/api/spotify/disconnect') return true;
    return ADMIN_API_PREFIXES.some(p => path.startsWith(p));
  }
  app.use((req, res, next) => {
    if (!needsAdminSession(req.path)) return next();
    _adminSession(req, res, () => {
      req.adminSession = req.session; // save before portal session overwrites req.session
      next();
    });
  });

  // ── Portal session (SameSite=None for cross-domain game access) ──────────
  const sessionStore = new MemoryStore({
    checkPeriod: 24 * 60 * 60 * 1000,
    stale: false
  });
  const sessionMiddleware = session({
    secret: sessionSecret,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    proxy: isProduction,
    cookie: {
      httpOnly: true,
      secure: 'auto',
      maxAge: 7 * 24 * 60 * 60 * 1000,
      // Standalone domains need a host cookie for their own site.
      sameSite: isProduction ? 'none' : 'lax'
    }
  });
  initialize._sessionStore = sessionStore;

  app.use(sessionMiddleware);
  app.use((req, _res, next) => {
    if (req.session?.cookie) {
      const domain = getCookieDomainForRequest(req);
      if (domain) req.session.cookie.domain = domain;
      else delete req.session.cookie.domain;
    }
    next();
  });

  // --- Admin login page ---
  app.get('/admin/login', (req, res) => {
    if (req.adminSession?.isAdmin) return res.redirect('/admin/dashboard');
    res.sendFile(path.join(__dirname, '..', 'public', 'admin-login.html'));
  });

  // --- Admin login POST (rate-limited) ---
  // Accepts both JSON (fetch) and urlencoded (plain HTML form POST)
  const urlencodedParser = require('express').urlencoded({ extended: false });
  app.post('/admin/login', urlencodedParser, (req, res) => {
    const ip = req.ip || req.connection.remoteAddress;
    const isJson = req.headers['content-type'] && req.headers['content-type'].includes('application/json');

    if (!checkLoginRateLimit(ip)) {
      if (isJson) return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      return res.redirect('/admin/login?error=ratelimit');
    }

    const adminPass = process.env.ADMIN_PASSWORD;
    if (typeof adminPass === 'string' && adminPass.length > 0 && typeof req.body?.password === 'string' && req.body.password === adminPass) {
      loginAttempts.delete(ip);
      req.adminSession.isAdmin = true;
      req.adminSession.save((err) => {
        if (err) {
          console.error('[Auth] Admin session save error:', err);
          if (isJson) return res.status(500).json({ error: 'Session error' });
          return res.redirect('/admin/login?error=session');
        }
        if (isJson) return res.json({ ok: true });
        return res.redirect('/admin/dashboard');
      });
    } else {
      if (isJson) return res.status(401).json({ error: 'Invalid password' });
      return res.redirect('/admin/login?error=invalid');
    }
  });

  // --- Admin logout ---
  app.post('/admin/logout', (req, res) => {
    if (req.adminSession) req.adminSession.isAdmin = false;
    res.json({ ok: true });
  });

  // --- Auth middleware: protect dashboard + admin APIs ---
  app.use((req, res, next) => {
    const isAdmin = req.adminSession?.isAdmin;

    // Admin dashboard — redirect to login if not admin.
    // The /admin landing page is public so admins can find their tools.
    const isProtectedAdminPath =
      req.path === '/admin/dashboard' ||
      req.path === '/index.html' ||
      (req.path.startsWith('/admin/') &&
       req.path !== '/admin/login' &&
       req.path !== '/admin/' &&
       req.path !== '/admin/index.html');
    if (isProtectedAdminPath && !isAdmin) {
      return res.redirect('/admin/login');
    }

    // Word Bank admin page — redirect to login if not admin
    if (req.path.startsWith('/word-bank') && !isAdmin) {
      return res.redirect('/admin/login');
    }

    // Admin API routes — return 401 if not admin
    if (isAdminAPI(req)) {
      if (!isAdmin) return res.status(401).json({ error: 'Admin login required' });
    }

    // POST to overlay settings is admin-only (GET is public for OBS)
    if (req.path === '/api/overlay/settings' && req.method === 'POST' && !isAdmin) {
      return res.status(401).json({ error: 'Admin login required' });
    }

    // Spotify disconnect is admin-only
    if (req.path === '/api/spotify/disconnect' && req.method === 'POST' && !isAdmin) {
      return res.status(401).json({ error: 'Admin login required' });
    }

    next();
  });

  // Share portal session with Socket.IO
  return sessionMiddleware;
}

function isAdminAPI(req) {
  return ADMIN_API_PREFIXES.some(prefix => req.path.startsWith(prefix));
}

// Middleware for user portal endpoints (requires Discord login)
function requireUser(req, res, next) {
  if (req.session?.discordUser) return next();
  res.status(401).json({ error: 'Login required' });
}

function getSessionStats() {
  return new Promise((resolve) => {
    try {
      const store = initialize._sessionStore;
      if (!store || typeof store.length !== 'function') {
        return resolve({ available: false, count: null });
      }
      store.length((err, count) => {
        if (err) {
          return resolve({ available: true, count: null, error: err.message });
        }
        resolve({ available: true, count });
      });
    } catch (err) {
      resolve({ available: false, count: null, error: err.message });
    }
  });
}

initialize._sessionStore = null;

module.exports = { initialize, requireUser, getSessionStats, getCookieDomainForRequest };
