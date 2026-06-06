// @CodeScene(disable:"Lines of Code in a Single File")
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const crypto = require('crypto');
const querystring = require('querystring');
const https = require('https');
const {
  loadTokens,
  saveTokens,
  loadMusicQueue,
  saveMusicQueue,
  loadViewerProfiles,
  saveViewerProfiles,
  loadViewerProfilesForOwner,
  saveViewerProfilesForOwner,
  loadViewerScores,
  saveViewerScores,
  loadViewerScoresForOwner,
  saveViewerScoresForOwner,
  loadGlobalViewerScores,
  saveGlobalViewerScores,
} = require('./storage');

const port = process.env.PORT || 8080;
const viewerPath = path.join(__dirname, '..', 'public', 'index.html');
const homepagePath = path.join(__dirname, '..', 'public', 'homepage.html');
const settingsPath = path.join(__dirname, '..', 'public', 'streamer-settings.html');
const termsPath = path.join(__dirname, '..', 'public', 'terms.html');
const privacyPath = path.join(__dirname, '..', 'public', 'privacy.html');

const CLIENT_KEY = process.env.TIKTOK_CLIENT_KEY || '';
const CLIENT_SECRET = process.env.TIKTOK_CLIENT_SECRET || '';
const REDIRECT_URI = process.env.TIKTOK_REDIRECT_URI || `http://localhost:${port}/oauth/callback`;
const TOKEN_STORE = path.join(__dirname, 'oauth-tokens.json');
const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || '';
const TWITCH_CLIENT_ID = process.env.TWITCH_CLIENT_ID || '';
const TWITCH_CLIENT_SECRET = process.env.TWITCH_CLIENT_SECRET || '';
const TWITCH_REDIRECT = process.env.TWITCH_REDIRECT_URI || `http://localhost:${port}/oauth/twitch/callback`;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GOOGLE_OWNER_REDIRECT = process.env.GOOGLE_OWNER_REDIRECT_URI || process.env.GOOGLE_REDIRECT_URI || `http://localhost:${port}/oauth/google/callback`;
const GOOGLE_VIEWER_REDIRECT = process.env.GOOGLE_VIEWER_REDIRECT_URI || GOOGLE_OWNER_REDIRECT.replace('/oauth/google/callback', '/auth/google/callback');
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';
const SPOTIFY_REDIRECT = process.env.SPOTIFY_REDIRECT_URI || `http://localhost:${port}/oauth/spotify/callback`;

// Environment validation
function validateEnvironment() {
  const isProduction = process.env.NODE_ENV === 'production';
  const errors = [];
  const warnings = [];

  // Required variables
  if (!GOOGLE_CLIENT_ID) errors.push('GOOGLE_CLIENT_ID is required');
  if (!GOOGLE_CLIENT_SECRET) errors.push('GOOGLE_CLIENT_SECRET is required');

  // Production-specific requirements
  if (isProduction) {
    if (!ENCRYPTION_KEY) warnings.push('TOKEN_ENCRYPTION_KEY is recommended in production for secure token storage');
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
      warnings.push('NODE_TLS_REJECT_UNAUTHORIZED=0 disables SSL verification and should not be used in production');
    }
  }

  // Optional integrations - warn if partially configured
  if (CLIENT_KEY && !CLIENT_SECRET) warnings.push('TIKTOK_CLIENT_SECRET is missing when TIKTOK_CLIENT_KEY is set');
  if (CLIENT_SECRET && !CLIENT_KEY) warnings.push('TIKTOK_CLIENT_KEY is missing when TIKTOK_CLIENT_SECRET is set');
  if (TWITCH_CLIENT_ID && !TWITCH_CLIENT_SECRET) warnings.push('TWITCH_CLIENT_SECRET is missing when TWITCH_CLIENT_ID is set');
  if (TWITCH_CLIENT_SECRET && !TWITCH_CLIENT_ID) warnings.push('TWITCH_CLIENT_ID is missing when TWITCH_CLIENT_SECRET is set');
  if (SPOTIFY_CLIENT_ID && !SPOTIFY_CLIENT_SECRET) warnings.push('SPOTIFY_CLIENT_SECRET is missing when SPOTIFY_CLIENT_ID is set');
  if (SPOTIFY_CLIENT_SECRET && !SPOTIFY_CLIENT_ID) warnings.push('SPOTIFY_CLIENT_ID is missing when SPOTIFY_CLIENT_SECRET is set');

  // Log validation results
  if (errors.length > 0) {
    console.error('❌ Environment validation failed:');
    errors.forEach(err => console.error(`  - ${err}`));
    console.error('Please set the required environment variables and restart the server.');
    process.exit(1);
  }

  if (warnings.length > 0) {
    console.warn('⚠️  Environment warnings:');
    warnings.forEach(warn => console.warn(`  - ${warn}`));
  }

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Environment validation passed');
  }
}

// Run validation at startup
validateEnvironment();

// Security headers middleware
function addSecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Only add HSTS in production
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}

// Standardized error response function
function sendErrorResponse(res, statusCode, message, error = null) {
  const errorResponse = {
    error: message,
    statusCode,
    timestamp: new Date().toISOString()
  };
  
  if (error && process.env.NODE_ENV !== 'production') {
    errorResponse.details = error.message || String(error);
  }

  res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(errorResponse));
}

function parseCookies(cookieHeader) {
  return (cookieHeader || '').split(';').map(s => s.trim()).reduce((acc, cur) => {
    const [k, v] = cur.split('='); if (k) acc[k] = v; return acc;
  }, {});
}

function buildOwnerLoginSuccessPage(ownerId, ownerName, provider) {
  const idJson = JSON.stringify(ownerId || '');
  const nameJson = JSON.stringify(ownerName || '');
  const providerJson = JSON.stringify(provider || '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Login successful</title></head><body style="font-family: sans-serif; padding: 24px; background: #0e0e12; color: #f0ede8;">
    <h2>Login successful</h2>
    <p>Owner account connected. You can close this window and return to HangStream.</p>
    <script>
      (function() {
        try {
          const ownerId = ${idJson};
          const ownerName = ${nameJson};
          const provider = ${providerJson};
          if (ownerId) {
            localStorage.setItem('hangstream-streamer-id', ownerId);
            document.cookie = 'owner=' + encodeURIComponent(ownerId) + '; Path=/;';
          }
          if (ownerName) localStorage.setItem('hangstream-owner-name', ownerName);
          if (provider) localStorage.setItem('hangstream-owner-provider', provider);
          if (window.opener) {
            window.opener.postMessage({ type: 'owner-login', ownerId: ownerId, ownerName: ownerName, provider: provider }, location.origin);
          }
        } catch (e) {}
        setTimeout(() => window.close(), 400);
      })();
    </script>
  </body></html>`;
}

function buildViewerLoginSuccessPage(viewerId, viewerName, provider) {
  const idJson = JSON.stringify(viewerId || '');
  const nameJson = JSON.stringify(viewerName || '');
  const providerJson = JSON.stringify(provider || '');
  return `<!doctype html><html><head><meta charset="utf-8"><title>Login successful</title></head><body style="font-family: sans-serif; padding: 24px; background: #0e0e12; color: #f0ede8;">
    <h2>Login successful</h2>
    <p>You may close this window and return to the game.</p>
    <script>
      (function() {
        try {
          const viewerId = ${idJson};
          const viewerName = ${nameJson};
          const provider = ${providerJson};
          if (window.opener) {
            window.opener.postMessage({ type: 'viewer-login', id: viewerId, name: viewerName, provider: provider }, location.origin);
          }
        } catch (e) {}
        setTimeout(() => window.close(), 400);
      })();
    </script>
  </body></html>`;
}

// Create a music request programmatically (used by HTTP endpoint and chat commands)
async function createMusicRequest(owner, query, user, opts) {
  opts = opts || {};
  // enforce simple rate limits for chat-originated requests
  if (opts.source === 'chat') {
    try {
      const now = Date.now();
      const o = String(owner || '').toLowerCase();
      const list = _playRequestLog.get(o) || [];
      // remove entries older than 60s
      while (list.length && (now - list[0]) > 60 * 1000) list.shift();
      if (list.length >= OWNER_MAX_PLAY_PER_MIN) {
        const err = new Error('owner rate limit exceeded'); err.code = 'RATE_LIMIT_OWNER'; throw err;
      }
      const userKey = `${o}:${String(user || 'unknown')}`;
      const last = _playUserLast.get(userKey) || 0;
      if (now - last < USER_PLAY_COOLDOWN_MS) {
        const err = new Error('user rate limit cooldown'); err.code = 'RATE_LIMIT_USER'; throw err;
      }
      // record
      list.push(now);
      _playRequestLog.set(o, list);
      _playUserLast.set(userKey, now);
    } catch (e) {
      throw e;
    }
  }

  const item = {
    id: crypto.randomBytes(8).toString('hex'),
    query,
    requestedBy: user || 'viewer',
    owner: owner || '',
    status: 'queued',
    createdAt: Date.now(),
    spotify: { queued: false, trackName: '', artist: '', uri: '', url: '' },
  };

  const queues = loadMusicQueue();
  if (!queues[item.owner]) queues[item.owner] = [];
  queues[item.owner].unshift(item);

  // Try to find a matching Spotify token for this owner/channel
  try {
    const spotifyMatch = findSpotifyTokenEntry(item.owner) || (function() {
      // attempt heuristic matches: profile display name or username
      const tokens = loadTokens();
      const entries = Object.entries(tokens || {});
      for (const [id, entry] of entries) {
        if (!entry || entry.platform !== 'spotify') continue;
        const uname = entry.username || (entry.profile && (entry.profile.display_name || entry.profile.id));
        if (uname && String(uname).toLowerCase() === String(item.owner).toLowerCase()) return [id, entry];
      }
      return null;
    })();

    if (spotifyMatch) {
      const [spotifyId/*, spotifyEntry*/] = spotifyMatch;
      const accessToken = await getSpotifyAccessToken(spotifyId);
      if (accessToken) {
        try {
          const track = await spotifySearchTrack(query, accessToken);
          if (track) {
            const queued = await spotifyAddToQueue(track.uri, accessToken);
            item.spotify = { queued, trackName: track.name, artist: track.artist, uri: track.uri, url: track.url, image: track.image };
            item.status = queued ? 'sent-to-spotify' : 'queued-locally';
            item.spotifyAccount = spotifyId;
          } else {
            item.status = 'queued-locally';
          }
        } catch (e) {
          item.status = 'queued-locally';
          item.spotifyError = String(e && e.message ? e.message : e);
        }
      } else {
        item.status = 'queued-locally';
      }
    }
  } catch (e) {
    // ignore errors and keep item queued locally
    item.status = item.status || 'queued-locally';
  }

  queues[item.owner][0] = item;
  saveMusicQueue(queues);

  // notify connected watchers for both twitch and tiktok channels that a music request was added
  try {
    broadcastToChannel(`twitch:${item.owner}`, { type: 'musicRequest', item });
    broadcastToChannel(`tiktok:${item.owner}`, { type: 'musicRequest', item });
  } catch (e) {}

  return item;
}

function getOwnerKey(req, fallbackOwner = '') {
  const cookies = parseCookies(req.headers.cookie);
  return String(cookies.owner || fallbackOwner || '').trim();
}

function spotifyAuthHeader() {
  return 'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');
}

function httpJsonRequest(urlString, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const target = new URL(urlString);
    const req = https.request({
      hostname: target.hostname,
      path: target.pathname + target.search,
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ statusCode: res.statusCode || 0, data: data ? JSON.parse(data) : null, raw: data });
        } catch {
          resolve({ statusCode: res.statusCode || 0, data: null, raw: data });
        }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function spotifySearchTrack(query, accessToken) {
  const url = 'https://api.spotify.com/v1/search?type=track&limit=1&q=' + encodeURIComponent(query);
  const result = await httpJsonRequest(url, {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  const track = result.data && result.data.tracks && Array.isArray(result.data.tracks.items) ? result.data.tracks.items[0] : null;
  if (!track || !track.uri) return null;
  return {
    uri: track.uri,
    name: track.name || query,
    artist: Array.isArray(track.artists) ? track.artists.map(a => a.name).filter(Boolean).join(', ') : '',
    url: (track.external_urls && track.external_urls.spotify) || '',
    image: Array.isArray(track.album && track.album.images) && track.album.images[0] ? track.album.images[0].url : '',
  };
}

async function spotifyAddToQueue(uri, accessToken) {
  const url = 'https://api.spotify.com/v1/me/player/queue?uri=' + encodeURIComponent(uri);
  const result = await httpJsonRequest(url, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return result.statusCode >= 200 && result.statusCode < 300;
}

async function spotifyPlaybackRequest(pathname, accessToken, method, body = null) {
  const result = await httpJsonRequest('https://api.spotify.com' + pathname, {
    method,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
  }, body ? JSON.stringify(body) : null);
  return result;
}

async function getSpotifyAccessToken(owner) {
  const match = findSpotifyTokenEntry(owner);
  if (!match) return null;
  const [id, entry] = match;
  let accessToken = entry && entry.resp && entry.resp.access_token;
  if (!accessToken) return null;
  if (entry && entry.resp && entry.resp.expires_in && entry.created) {
    const expiresAt = entry.created + ((entry.resp.expires_in || 0) * 1000);
    if (Date.now() >= expiresAt - 60 * 1000) {
      const refreshed = await refreshSpotifyToken(id, entry);
      if (refreshed) {
        const tokens = loadTokens();
        accessToken = tokens[id] && tokens[id].resp && tokens[id].resp.access_token ? tokens[id].resp.access_token : accessToken;
      }
    }
  }
  return accessToken;
}

async function spotifyGetPlaybackState(accessToken) {
  const result = await spotifyPlaybackRequest('/v1/me/player/currently-playing?additional_types=track', accessToken, 'GET');
  if (result.statusCode === 204) return { is_playing: false, item: null, progress_ms: 0, device: null };
  return result.data || { is_playing: false, item: null, progress_ms: 0, device: null };
}

async function spotifySkipTrack(accessToken) {
  const result = await spotifyPlaybackRequest('/v1/me/player/next', accessToken, 'POST');
  return result.statusCode >= 200 && result.statusCode < 300;
}

async function spotifyPausePlayback(accessToken) {
  const result = await spotifyPlaybackRequest('/v1/me/player/pause', accessToken, 'PUT');
  return result.statusCode >= 200 && result.statusCode < 300;
}

async function spotifyResumePlayback(accessToken) {
  const result = await spotifyPlaybackRequest('/v1/me/player/play', accessToken, 'PUT');
  return result.statusCode >= 200 && result.statusCode < 300;
}

async function spotifyGetProfile(accessToken) {
  const result = await httpJsonRequest('https://api.spotify.com/v1/me', {
    method: 'GET',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  return result.data || null;
}

function findSpotifyTokenEntry(owner) {
  const tokens = loadTokens();
  const entries = Object.entries(tokens || {});
  return entries.find(([id, entry]) => {
    if (!entry || entry.platform !== 'spotify') return false;
    if (owner && (entry.owner === owner || id === owner)) return true;
    return !owner;
  }) || null;
}

function sendFile(res, filePath, contentType) {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Failed to load page.');
      return;
    }

    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, `http://${req.headers.host}`);
  const pathname = reqUrl.pathname;

  // Apply security headers to all responses
  addSecurityHeaders(res);

  // OAuth entry: redirect to TikTok
  if (pathname === '/oauth') {
    if (!CLIENT_KEY) {
      sendErrorResponse(res, 500, 'TIKTOK_CLIENT_KEY not configured on server.');
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    // set state cookie
    res.setHeader('Set-Cookie', `csrfState=${state}; HttpOnly; Path=/; Max-Age=600`);
    const authUrl = new URL('https://www.tiktok.com/v2/auth/authorize/');
    authUrl.searchParams.set('client_key', CLIENT_KEY);
    authUrl.searchParams.set('scope', 'user.info.basic');
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('state', state);
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // Viewer Google OAuth entry (for viewers to sign in)
  if (pathname === '/auth/google') {
    if (!GOOGLE_CLIENT_ID) {
      sendErrorResponse(res, 500, 'GOOGLE_CLIENT_ID not configured on server.');
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', `csrfState=${state}; HttpOnly; Path=/; Max-Age=600`);
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    // use a dedicated viewer callback
    authUrl.searchParams.set('redirect_uri', GOOGLE_VIEWER_REDIRECT);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'select_account');
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // Google owner login entry
  if (pathname === '/oauth/google') {
    if (!GOOGLE_CLIENT_ID) {
      sendErrorResponse(res, 500, 'GOOGLE_CLIENT_ID not configured on server.');
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', `csrfState=${state}; HttpOnly; Path=/; Max-Age=600`);
    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', GOOGLE_OWNER_REDIRECT);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'openid email profile');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('prompt', 'select_account');
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // Spotify owner login entry
  if (pathname === '/oauth/spotify') {
    if (!SPOTIFY_CLIENT_ID) {
      sendErrorResponse(res, 500, 'SPOTIFY_CLIENT_ID not configured on server.');
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', `csrfState=${state}; HttpOnly; Path=/; Max-Age=600`);
    const authUrl = new URL('https://accounts.spotify.com/authorize');
    authUrl.searchParams.set('client_id', SPOTIFY_CLIENT_ID);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('redirect_uri', SPOTIFY_REDIRECT);
    authUrl.searchParams.set('scope', 'user-read-email user-read-private user-read-playback-state user-modify-playback-state user-read-currently-playing');
    authUrl.searchParams.set('state', state);
    authUrl.searchParams.set('show_dialog', 'true');
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // Twitch OAuth entry
  if (pathname === '/oauth/twitch') {
    if (!TWITCH_CLIENT_ID) {
      sendErrorResponse(res, 500, 'TWITCH_CLIENT_ID not configured on server.');
      return;
    }
    const state = crypto.randomBytes(16).toString('hex');
    res.setHeader('Set-Cookie', `csrfState=${state}; HttpOnly; Path=/; Max-Age=600`);
    const authUrl = new URL('https://id.twitch.tv/oauth2/authorize');
    authUrl.searchParams.set('client_id', TWITCH_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', TWITCH_REDIRECT);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', 'user:read:email');
    authUrl.searchParams.set('state', state);
    res.writeHead(302, { Location: authUrl.toString() });
    res.end();
    return;
  }

  // OAuth callback
  if (pathname === '/oauth/callback') {
    const params = reqUrl.searchParams;
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');

    const cookies = parseCookies(req.headers.cookie);

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('OAuth error: ' + error);
      return;
    }

    if (!state || cookies.csrfState !== state) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid state (possible CSRF)');
      return;
    }

    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing code');
      return;
    }

    if (!CLIENT_KEY || !CLIENT_SECRET) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET not configured on server.');
      return;
    }

    // Exchange code for access token
    const tokenEndpoint = 'https://open-api.tiktok.com/oauth/access_token/';
    const postData = querystring.stringify({
      client_key: CLIENT_KEY,
      client_secret: CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: REDIRECT_URI,
    });

    const reqOptions = new URL(tokenEndpoint);
    const opts = {
      hostname: reqOptions.hostname,
      path: reqOptions.pathname + (reqOptions.search || ''),
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      }
    };

    const tokenReq = https.request(opts, (tokenRes) => {
      let body = '';
      tokenRes.on('data', (chunk) => body += chunk);
      tokenRes.on('end', () => {
        try {
          const parsed = JSON.parse(body);
            const tokens = loadTokens();
            // store response under a generated id
            const id = crypto.randomBytes(8).toString('hex');
            tokens[id] = { created: Date.now(), resp: parsed, platform: 'tiktok', owner: (cookies && cookies.owner) || null };
            saveTokens(tokens);

            // try to get userinfo using access token if present
            const accessToken = (parsed.data && (parsed.data.access_token || parsed.data.accessToken)) || parsed.access_token || parsed.accessToken;
            if (accessToken) {
              const userInfoUrl = `https://open-api.tiktok.com/oauth/userinfo/?access_token=${encodeURIComponent(accessToken)}`;
              https.get(userInfoUrl, (uRes) => {
                let ub = '';
                uRes.on('data', c => ub += c);
                uRes.on('end', () => {
                  try {
                    const up = JSON.parse(ub);
                    tokens[id].userinfo = up;
                    // try to pick a username field
                    const uname = (up.data && (up.data.unique_id || up.data.open_id || up.data.nickname || up.data.display_name)) || up.unique_id || up.open_id || (up.data && up.data.user && up.data.user.unique_id);
                    if (uname) {
                      tokens[id].username = uname;
                      // auto-watch this username
                      try { tiktok.watch(uname); } catch (e) { console.warn('auto-watch failed', e); }
                    }
                    saveTokens(tokens);
                  } catch (e) { /* ignore */ }
                });
              }).on('error', () => {});
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`<h2>Authentication successful</h2><p>Tokens saved (id: ${id}). Close this window and return to the streamer page.</p>`);
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Failed to parse token response: ' + e.message + '\n' + body);
        }
      });
    });

    tokenReq.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Token exchange failed: ' + String(err));
    });

    tokenReq.write(postData);
    tokenReq.end();
    return;
  }

  // Viewer Google callback
  if (pathname === '/auth/google/callback') {
    const params = reqUrl.searchParams;
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const cookies = parseCookies(req.headers.cookie);

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Google OAuth error: ' + error);
      return;
    }
    if (!state || cookies.csrfState !== state) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid state (possible CSRF)');
      return;
    }
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing code');
      return;
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured on server.');
      return;
    }

    const postDataV = querystring.stringify({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_VIEWER_REDIRECT,
    });

    const tokenReqV = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postDataV),
      },
    }, (tokenRes) => {
      let body = '';
      tokenRes.on('data', (chunk) => body += chunk);
      tokenRes.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const accessToken = parsed.access_token;
          if (!accessToken) throw new Error('Missing access token');

          const userReq = https.request('https://openidconnect.googleapis.com/v1/userinfo', {
            method: 'GET',
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }, (userRes) => {
            let userBody = '';
            userRes.on('data', (chunk) => userBody += chunk);
            userRes.on('end', () => {
              try {
                const profile = JSON.parse(userBody);
                  const viewerId = `google:${profile.sub || profile.email || crypto.randomBytes(8).toString('hex')}`;
                  const viewerName = profile.name || profile.email || profile.given_name || 'Google user';
                  // persist profile server-side and create a simple viewer session cookie
                  try {
                    const profiles = loadViewerProfiles();
                    profiles[viewerId] = profiles[viewerId] || {};
                    profiles[viewerId].id = viewerId;
                    profiles[viewerId].name = viewerName;
                    profiles[viewerId].avatar = profiles[viewerId].avatar || '';
                    profiles[viewerId].provider = 'google';
                    profiles[viewerId].updatedAt = Date.now();
                    saveViewerProfiles(profiles);
                  } catch (e) { console.warn('Failed to persist viewer profile', e); }

                  // set an HTTP-only cookie for the viewer session
                  res.setHeader('Set-Cookie', `viewer_id=${encodeURIComponent(viewerId)}; HttpOnly; Path=/; Max-Age=${60*60*24*365}`);
                  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                  res.end(buildViewerLoginSuccessPage(viewerId, viewerName, 'google'));
              } catch (e) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Failed to parse Google profile: ' + e.message);
              }
            });
          });
          userReq.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Google userinfo request failed: ' + String(err));
          });
          userReq.end();
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Failed to parse Google token response: ' + e.message + '\n' + body);
        }
      });
    });

    tokenReqV.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Google token exchange failed: ' + String(err));
    });
    tokenReqV.write(postDataV);
    tokenReqV.end();
    return;
  }

  if (pathname === '/oauth/google/callback') {
    const params = reqUrl.searchParams;
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const cookies = parseCookies(req.headers.cookie);

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Google OAuth error: ' + error);
      return;
    }
    if (!state || cookies.csrfState !== state) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid state (possible CSRF)');
      return;
    }
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing code');
      return;
    }
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not configured on server.');
      return;
    }

    const postData = querystring.stringify({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: GOOGLE_OWNER_REDIRECT,
    });

    const tokenReq = https.request('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (tokenRes) => {
      let body = '';
      tokenRes.on('data', (chunk) => body += chunk);
      tokenRes.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const accessToken = parsed.access_token;
          if (!accessToken) throw new Error('Missing access token');

          const userReq = https.request('https://openidconnect.googleapis.com/v1/userinfo', {
            method: 'GET',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
            },
          }, (userRes) => {
            let userBody = '';
            userRes.on('data', (chunk) => userBody += chunk);
            userRes.on('end', () => {
              try {
                const profile = JSON.parse(userBody);
                const ownerId = `google:${profile.sub || profile.email || crypto.randomBytes(8).toString('hex')}`;
                const ownerName = profile.name || profile.email || profile.given_name || 'Google user';
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(buildOwnerLoginSuccessPage(ownerId, ownerName, 'google'));
              } catch (e) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
                res.end('Failed to parse Google profile: ' + e.message);
              }
            });
          });
          userReq.on('error', (err) => {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Google userinfo request failed: ' + String(err));
          });
          userReq.end();
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Failed to parse Google token response: ' + e.message + '\n' + body);
        }
      });
    });

    tokenReq.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Google token exchange failed: ' + String(err));
    });

    tokenReq.write(postData);
    tokenReq.end();
    return;
  }

  if (pathname === '/oauth/spotify/callback') {
    const params = reqUrl.searchParams;
    const code = params.get('code');
    const state = params.get('state');
    const error = params.get('error');
    const cookies = parseCookies(req.headers.cookie);

    if (error) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Spotify OAuth error: ' + error);
      return;
    }
    if (!state || cookies.csrfState !== state) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Invalid state (possible CSRF)');
      return;
    }
    if (!code) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Missing code');
      return;
    }
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET not configured on server.');
      return;
    }

    const postData = querystring.stringify({
      grant_type: 'authorization_code',
      code,
      redirect_uri: SPOTIFY_REDIRECT,
    });

    const tokenReq = https.request('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': spotifyAuthHeader(),
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (tokenRes) => {
      let body = '';
      tokenRes.on('data', (chunk) => body += chunk);
      tokenRes.on('end', async () => {
        try {
          const parsed = JSON.parse(body);
          const accessToken = parsed.access_token;
          if (!accessToken) throw new Error('Missing access token');
          const profile = await spotifyGetProfile(accessToken);
          const ownerId = (cookies && cookies.owner) || `spotify:${profile && profile.id ? profile.id : crypto.randomBytes(8).toString('hex')}`;
          const ownerName = (profile && profile.display_name) || (profile && profile.email) || 'Spotify user';
          const tokens = loadTokens();
          tokens[ownerId] = {
            created: Date.now(),
            resp: parsed,
            platform: 'spotify',
            owner: ownerId,
            profile,
          };
          saveTokens(tokens);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(buildOwnerLoginSuccessPage(ownerId, ownerName, 'spotify'));
        } catch (e) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('Failed to parse Spotify token response: ' + e.message + '\n' + body);
        }
      });
    });

    tokenReq.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Spotify token exchange failed: ' + String(err));
    });
    tokenReq.write(postData);
    tokenReq.end();
    return;
  }

  // Twitch callback
  if (pathname === '/oauth/twitch/callback') {
    const params = reqUrl.searchParams;
    const code = params.get('code');
    const state = params.get('state');
    const cookies = parseCookies(req.headers.cookie);
    if (!state || cookies.csrfState !== state) { res.writeHead(403); res.end('Invalid state'); return; }
    if (!code) { res.writeHead(400); res.end('Missing code'); return; }
    if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) { res.writeHead(500); res.end('Twitch OAuth not configured'); return; }

    // Exchange code
    const tokenUrl = `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(TWITCH_CLIENT_ID)}&client_secret=${encodeURIComponent(TWITCH_CLIENT_SECRET)}&code=${encodeURIComponent(code)}&grant_type=authorization_code&redirect_uri=${encodeURIComponent(TWITCH_REDIRECT)}`;
    https.get(tokenUrl, (tRes) => {
      let body = '';
      tRes.on('data', c => body += c);
      tRes.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          const tokens = loadTokens();
          const id = crypto.randomBytes(8).toString('hex');
          tokens[id] = { created: Date.now(), resp: parsed, platform: 'twitch', owner: (cookies && cookies.owner) || null };
          // fetch user info
          const opts = { hostname: 'api.twitch.tv', path: '/helix/users', method: 'GET', headers: { 'Authorization': `Bearer ${parsed.access_token}`, 'Client-Id': TWITCH_CLIENT_ID } };
          const r = https.request(opts, (uRes) => {
            let ub = '';
            uRes.on('data', c => ub += c);
            uRes.on('end', () => {
              try {
                const up = JSON.parse(ub);
                tokens[id].userinfo = up;
                if (up.data && up.data[0] && up.data[0].login) {
                  tokens[id].username = up.data[0].login;
                  try { twitch.watch(up.data[0].login); } catch (e) {}
                }
                saveTokens(tokens);
              } catch (e) { saveTokens(tokens); }
            });
          });
          r.on('error', () => { saveTokens(tokens); });
          r.end();
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<h2>Twitch login successful</h2><p>Saved (id: ${id}).</p>`);
        } catch (e) { res.writeHead(500); res.end('Token parse failed'); }
      });
    }).on('error', () => { res.writeHead(500); res.end('Token request failed'); });
    return;
  }

  // Return stored tokens (safe for local streamer page)
  if (pathname === '/oauth/tokens' && req.method === 'GET') {
    const tokens = loadTokens();
    const owner = reqUrl.searchParams.get('owner');
    if (owner) {
      const out = {};
      for (const id of Object.keys(tokens || {})) {
        if (tokens[id] && tokens[id].owner === owner) out[id] = tokens[id];
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(out));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(tokens));
    return;
  }

  // Remove a token by id
  if (pathname === '/oauth/remove' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const id = parsed.id;
        const cookies = parseCookies(req.headers.cookie);
        if (!id) { res.writeHead(400); res.end('missing id'); return; }
        const tokens = loadTokens();
        if (!tokens[id]) { res.writeHead(404); res.end('not found'); return; }
        if (tokens[id].owner && cookies.owner && tokens[id].owner !== cookies.owner) { res.writeHead(403); res.end('forbidden'); return; }
        // allow deletion if owners match or if token has no owner
        delete tokens[id];
        saveTokens(tokens);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) { res.writeHead(500); res.end('error'); }
    });
    return;
  }

  if (pathname === '/music/request' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const query = typeof parsed.query === 'string' ? parsed.query.trim() : '';
        const user = typeof parsed.user === 'string' ? parsed.user.trim() : 'viewer';
        const owner = getOwnerKey(req, typeof parsed.owner === 'string' ? parsed.owner : '');
        if (!query) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'missing query' }));
          return;
        }

        try {
          const item = await createMusicRequest(owner, query, user);
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify(item));
        } catch (e) {
          if (e && (e.code === 'RATE_LIMIT_OWNER' || e.code === 'RATE_LIMIT_USER')) {
            sendErrorResponse(res, 429, 'rate_limited', e);
          } else {
            sendErrorResponse(res, 500, 'failed to add music request', e);
          }
        }
      } catch (e) {
        sendErrorResponse(res, 500, 'failed to add music request', e);
      }
    });
    return;
  }

  if (pathname === '/music/skip' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const owner = getOwnerKey(req, typeof parsed.owner === 'string' ? parsed.owner : '');
        const accessToken = await getSpotifyAccessToken(owner);
        if (!accessToken) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'spotify account not connected' }));
          return;
        }
        const ok = await spotifySkipTrack(accessToken);
        res.writeHead(ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok }));
      } catch (e) {
        sendErrorResponse(res, 500, 'failed to skip track', e);
      }
    });
    return;
  }

  if (pathname === '/music/pause' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', async () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const owner = getOwnerKey(req, typeof parsed.owner === 'string' ? parsed.owner : '');
        const action = String(parsed.action || '').toLowerCase();
        const accessToken = await getSpotifyAccessToken(owner);
        if (!accessToken) {
          res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'spotify account not connected' }));
          return;
        }
        const ok = action === 'resume' ? await spotifyResumePlayback(accessToken) : await spotifyPausePlayback(accessToken);
        res.writeHead(ok ? 200 : 502, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok, action: action === 'resume' ? 'resume' : 'pause' }));
      } catch (e) {
        sendErrorResponse(res, 500, 'failed to update playback', e);
      }
    });
    return;
  }

  if (pathname === '/music/current' && req.method === 'GET') {
    const owner = getOwnerKey(req, reqUrl.searchParams.get('owner') || '');
    (async () => {
      try {
        const accessToken = await getSpotifyAccessToken(owner);
        if (!accessToken) {
          res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ owner, is_playing: false, item: null, progress_ms: 0, device: null }));
          return;
        }
        const state = await spotifyGetPlaybackState(accessToken);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ owner, ...state }));
      } catch (e) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ owner, is_playing: false, item: null, progress_ms: 0, device: null }));
      }
    })().catch(() => {});
    return;
  }

  if (pathname === '/music/queue' && req.method === 'GET') {
    const owner = getOwnerKey(req, reqUrl.searchParams.get('owner') || '');
    const queues = loadMusicQueue();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ owner, items: queues[owner] || [] }));
    return;
  }

  if (pathname === '/music/queue/remove' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const id = typeof parsed.id === 'string' ? parsed.id.trim() : '';
        const owner = getOwnerKey(req, typeof parsed.owner === 'string' ? parsed.owner : '');
        if (!id) {
          res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'missing id' }));
          return;
        }
        const queues = loadMusicQueue();
        const list = queues[owner] || [];
        queues[owner] = list.filter((entry) => entry && entry.id !== id);
        saveMusicQueue(queues);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ ok: true }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'failed to remove music request' }));
      }
    });
    return;
  }

  // Viewer profile endpoints (GET by id, POST to save) - now using global profiles
  if (pathname === '/viewer/profile' && req.method === 'GET') {
    const id = reqUrl.searchParams.get('id');
    const profiles = loadViewerProfiles(); // Global profiles (shared across all streamers)
    if (id) {
      const p = profiles[id] || null;
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(p));
      return;
    }
    // return all profiles
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(profiles));
    return;
  }

  if (pathname === '/viewer/profile' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try {
        const parsed = JSON.parse(body || '{}');
        const cookies = parseCookies(req.headers.cookie);
        const sessionViewer = cookies.viewer_id ? decodeURIComponent(cookies.viewer_id) : '';
        if (!sessionViewer) {
          res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: 'not authenticated' }));
          return;
        }
        // ensure clients cannot impersonate other viewers: use sessionViewer as authoritative id
        const id = sessionViewer;
        const profiles = loadViewerProfiles(); // Global profiles (shared across all streamers)
        profiles[id] = profiles[id] || {};
        profiles[id].id = id;
        profiles[id].name = parsed.name || parsed.viewerName || profiles[id].name || '';
        profiles[id].avatar = parsed.avatar || parsed.viewerAvatar || profiles[id].avatar || '';
        profiles[id].provider = parsed.provider || profiles[id].provider || null;
        profiles[id].updatedAt = Date.now();
        saveViewerProfiles(profiles); // Save to global profiles
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify(profiles[id]));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'failed to save profile' }));
      }
    });
    return;
  }

  // Score endpoints - require authenticated viewer session via cookie
  // Updates both per-room scores and global scores
  if (pathname === '/score' && req.method === 'POST') {
    let body = '';
    req.on('data', (c) => body += c);
    req.on('end', () => {
      try {
        const cookies = parseCookies(req.headers.cookie);
        const sessionViewer = cookies.viewer_id ? decodeURIComponent(cookies.viewer_id) : '';
        if (!sessionViewer) { res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'not authenticated' })); return; }
        const parsed = JSON.parse(body || '{}');
        const points = Number(parsed.points || 0);
        if (!Number.isFinite(points)) { res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify({ error: 'invalid points' })); return; }
        const owner = getOwnerKey(req, '');

        // Update per-room scores
        const scores = loadViewerScoresForOwner(owner);
        scores[sessionViewer] = scores[sessionViewer] || { id: sessionViewer, total: 0, history: [] };
        scores[sessionViewer].total = (scores[sessionViewer].total || 0) + points;
        scores[sessionViewer].history = scores[sessionViewer].history || [];
        scores[sessionViewer].history.push({ ts: Date.now(), points, reason: parsed.reason || '' });
        saveViewerScoresForOwner(owner, scores);

        // Update global scores (across all streamers)
        const globalScores = loadGlobalViewerScores();
        globalScores[sessionViewer] = globalScores[sessionViewer] || { id: sessionViewer, total: 0, history: [] };
        globalScores[sessionViewer].total = (globalScores[sessionViewer].total || 0) + points;
        globalScores[sessionViewer].history = globalScores[sessionViewer].history || [];
        globalScores[sessionViewer].history.push({ ts: Date.now(), points, reason: parsed.reason || '', owner });
        saveGlobalViewerScores(globalScores);

        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({
          id: sessionViewer,
          roomTotal: scores[sessionViewer].total,
          globalTotal: globalScores[sessionViewer].total
        }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'failed to save score' }));
      }
    });
    return;
  }

  if (pathname === '/scores' && req.method === 'GET') {
    const owner = getOwnerKey(req, '');
    const roomScores = loadViewerScoresForOwner(owner);
    const globalScores = loadGlobalViewerScores();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      roomScores,
      globalScores
    }));
    return;
  }

  const urlPath = req.url === '/' ? '/homepage.html' : req.url;

  if (urlPath === '/homepage.html' || urlPath === '/index.html' || urlPath === '/') {
    // serve the project homepage if present, otherwise fall back to viewer
    if (fs.existsSync(homepagePath)) {
      sendFile(res, homepagePath, 'text/html; charset=utf-8');
      return;
    }
    sendFile(res, viewerPath, 'text/html; charset=utf-8');
    return;
  }

  // keep the original viewer reachable at /viewer
  if (urlPath === '/viewer' || urlPath === '/viewer/') {
    sendFile(res, viewerPath, 'text/html; charset=utf-8');
    return;
  }

  if (urlPath === '/styles.css') {
    sendFile(res, path.join(__dirname, '..', 'public', 'styles.css'), 'text/css; charset=utf-8');
    return;
  }

  if (urlPath === '/streamer' || urlPath === '/streamer/' || urlPath === '/streamer-settings.html') {
    sendFile(res, settingsPath, 'text/html; charset=utf-8');
    return;
  }

  if (urlPath === '/custom-words.json') {
    sendFile(res, path.join(__dirname, '..', 'public', 'custom-words.json'), 'application/json; charset=utf-8');
    return;
  }

  if (urlPath === '/terms' || urlPath === '/terms.html') {
    if (fs.existsSync(termsPath)) { sendFile(res, termsPath, 'text/html; charset=utf-8'); return; }
  }

  if (urlPath === '/privacy' || urlPath === '/privacy.html') {
    if (fs.existsSync(privacyPath)) { sendFile(res, privacyPath, 'text/html; charset=utf-8'); return; }
  }

  const isSingleSegmentRoute = /^\/[^/]+\/?$/.test(urlPath) && !/[.]/.test(urlPath) && !/^\/(viewer|streamer|oauth|auth|scores|score|music|terms|privacy)(\/|$)/.test(urlPath);
  if (isSingleSegmentRoute) {
    sendFile(res, viewerPath, 'text/html; charset=utf-8');
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('Not found');
});

server.listen(port, () => {
  console.log(`HangStream running at http://localhost:${port}`);
});

// WebSocket server for streamer UI and forwarding chat
const WebSocket = require('ws');
const tiktok = require('./tiktok');
const twitch = require('./twitch');

const wss = new WebSocket.Server({ server });
// map key (platform:channel) => Set of ws clients
const watchers = new Map();

// per-channel message queues to batch broadcasts when under high load
const channelQueues = new Map();
const BROADCAST_FLUSH_MS = Number(process.env.BROADCAST_FLUSH_MS || 150);
const MAX_BATCH_PER_FLUSH = Number(process.env.MAX_BATCH_PER_FLUSH || 200);
const WS_PING_INTERVAL = Number(process.env.WS_PING_INTERVAL || 30000);

// Rate limiting for chat-originated play requests
const OWNER_MAX_PLAY_PER_MIN = Number(process.env.OWNER_MAX_PLAY_PER_MIN || 6);
const USER_PLAY_COOLDOWN_MS = Number(process.env.USER_PLAY_COOLDOWN_MS || 20 * 1000);
const _playRequestLog = new Map(); // owner -> [timestamps]
const _playUserLast = new Map(); // `${owner}:${user}` -> lastTs

function broadcastToChannel(key, payload) {
  // queue payload for the channel; this reduces write pressure during bursts
  let q = channelQueues.get(key);
  if (!q) { q = []; channelQueues.set(key, q); }
  q.push(payload);
  // cap queue length to avoid memory blowups
  if (q.length > 1000) q.splice(0, q.length - 1000);
}

function flushChannelQueues() {
  if (channelQueues.size === 0) return;
  for (const [key, q] of Array.from(channelQueues.entries())) {
    if (!q || q.length === 0) { channelQueues.delete(key); continue; }
    const items = q.splice(0, MAX_BATCH_PER_FLUSH);
    channelQueues.set(key, q.length ? q : []);
    const set = watchers.get(key);
    if (!set || set.size === 0) continue;
    try {
      if (items.length === 1) {
        const str = JSON.stringify(items[0]);
        for (const ws of set) {
          if (ws.readyState === WebSocket.OPEN) ws.send(str);
        }
      } else {
        const str = JSON.stringify({ type: 'batch', items });
        for (const ws of set) {
          if (ws.readyState === WebSocket.OPEN) ws.send(str);
        }
      }
    } catch (e) {
      // a send failure shouldn't stop other channels
      console.warn('Failed to flush channel', key, e && e.message);
    }
  }
}

// periodic flush to send queued messages in short bursts
setInterval(flushChannelQueues, BROADCAST_FLUSH_MS);

// heartbeat/ping to detect dead clients and free resources
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    try { ws.ping(() => {}); } catch (e) {}
  });
}, WS_PING_INTERVAL);

wss.on('connection', (ws) => {
  // connection liveness for heartbeat
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (msg) => {
    let data;
    try { data = JSON.parse(msg); } catch { return; }
    if (data.type === 'watch') {
      if (data.owner) ws.owner = data.owner;
      const platform = (data.platform || 'tiktok').toLowerCase();
      if (platform === 'tiktok' && data.channel) {
        const chan = data.channel.trim();
        const key = `tiktok:${chan}`;
        let set = watchers.get(key); if (!set) { set = new Set(); watchers.set(key, set); }
        set.add(ws);
        tiktok.watch(chan);
        ws._watching = ws._watching || new Set(); ws._watching.add(key);
        ws.send(JSON.stringify({ type: 'status', status: 'watching', platform: 'tiktok', channel: chan }));
      }
      if ((platform === 'twitch' || platform === 'both') && data.twitchChannel) {
        const chan = data.twitchChannel.trim();
        const key = `twitch:${chan}`;
        let set = watchers.get(key); if (!set) { set = new Set(); watchers.set(key, set); }
        set.add(ws);
        try { twitch.watch(chan); } catch (e) { console.warn('twitch.watch failed', e); }
        ws._watching = ws._watching || new Set(); ws._watching.add(key);
        ws.send(JSON.stringify({ type: 'status', status: 'watching', platform: 'twitch', channel: chan }));
      }
      if (platform === 'both' && data.tiktokChannel) {
        // also start tiktok if both specified and tiktokChannel provided
        const chan = data.tiktokChannel.trim();
        const key = `tiktok:${chan}`;
        let set = watchers.get(key); if (!set) { set = new Set(); watchers.set(key, set); }
        set.add(ws);
        tiktok.watch(chan);
        ws._watching = ws._watching || new Set(); ws._watching.add(key);
        ws.send(JSON.stringify({ type: 'status', status: 'watching', platform: 'tiktok', channel: chan }));
      }
    }

    if (data.type === 'unwatch') {
      // can unwatch specific platform/channel or all for this ws
      if (data.channel && data.platform) {
        const key = `${data.platform}:${data.channel}`;
        const set = watchers.get(key);
        if (set) { set.delete(ws); if (set.size === 0) { watchers.delete(key); const [pl, ch] = key.split(':'); if (pl === 'tiktok') tiktok.stop(ch); if (pl === 'twitch') twitch.stop(ch); } }
        if (ws._watching) ws._watching.delete(key);
        ws.send(JSON.stringify({ type: 'status', status: 'stopped', channel: data.channel, platform: data.platform }));
      } else {
        // remove all
        if (ws._watching) {
          for (const key of Array.from(ws._watching)) {
            const set = watchers.get(key);
            if (set) { set.delete(ws); if (set.size === 0) { watchers.delete(key); const [pl, ch] = key.split(':'); if (pl === 'tiktok') tiktok.stop(ch); if (pl === 'twitch') twitch.stop(ch); } }
          }
          ws._watching = null;
          ws.send(JSON.stringify({ type: 'status', status: 'stopped_all' }));
        }
      }
    }
  });

  ws.on('close', () => {
    if (ws._watching) {
      for (const key of Array.from(ws._watching)) {
        const set = watchers.get(key);
        if (set) { set.delete(ws); if (set.size === 0) { watchers.delete(key); const [pl, ch] = key.split(':'); if (pl === 'tiktok') tiktok.stop(ch); if (pl === 'twitch') twitch.stop(ch); } }
      }
    }
  });
});

function getMessageFromChatData(platform, data) {
  if (!data) return '';
  if (platform === 'twitch') return String(data.message || data.msg || '').trim();
  // tiktok data shapes vary; try common properties
  return String(data.comment || data.message || data.msg || data.text || (data.data && (data.data.comment || data.data.message)) || '').trim();
}

async function handleChatCommand(platform, channel, data) {
  try {
    const message = getMessageFromChatData(platform, data);
    if (!message) return;
    const m = /^\s*!play\s+(.+)/i.exec(message);
    if (!m) return;
    const query = m[1].trim();
    if (!query) return;

    // try to extract a user display name if available
    const user = (data && (data.user || data.displayName || data.nick || data.uniqueId || data.author)) || 'chat';
    // owner/channel mapping: use the chat channel name as the owner namespace
    const owner = String(channel || '').toLowerCase();
    let item;
    try {
      item = await createMusicRequest(owner, query, user, { source: 'chat' });
    } catch (err) {
      // if rate limited, notify watchers so UI can show a message
      if (err && (err.code === 'RATE_LIMIT_OWNER' || err.code === 'RATE_LIMIT_USER')) {
        broadcastToChannel(`${platform}:${owner}`, { type: 'musicRequestRejected', reason: err.code, user });
      }
      throw err;
    }
    // broadcast the new music request (already done inside createMusicRequest, but also send explicit event)
    broadcastToChannel(`${platform}:${owner}`, { type: 'musicRequest', item });
  } catch (e) {
    // swallow errors to avoid crashing the chat watcher
    console.warn('chat command handler failed', e && e.message ? e.message : e);
  }
}

tiktok.on('chat', (channel, data) => {
  broadcastToChannel(`tiktok:${channel}`, { type: 'chat', platform: 'tiktok', channel, data });
  // parse commands asynchronously
  handleChatCommand('tiktok', channel, data).catch(() => {});
});

tiktok.on('streamStart', (channel) => broadcastToChannel(`tiktok:${channel}`, { type: 'streamStart', platform: 'tiktok', channel }));
tiktok.on('streamEnd', (channel) => broadcastToChannel(`tiktok:${channel}`, { type: 'streamEnd', platform: 'tiktok', channel }));

twitch.on('chat', (channel, data) => {
  broadcastToChannel(`twitch:${channel}`, { type: 'chat', platform: 'twitch', channel, data });
  // parse commands asynchronously
  handleChatCommand('twitch', channel, data).catch(() => {});
});

twitch.on('started', (channel) => broadcastToChannel(`twitch:${channel}`, { type: 'streamStart', platform: 'twitch', channel }));
twitch.on('stopped', (channel) => broadcastToChannel(`twitch:${channel}`, { type: 'streamEnd', platform: 'twitch', channel }));

// On startup, load saved tokens and auto-watch known usernames
try {
  const saved = loadTokens();
  for (const id of Object.keys(saved || {})) {
    const entry = saved[id];
    const uname = entry && (entry.username || (entry.userinfo && entry.userinfo.data && (entry.userinfo.data.unique_id || entry.userinfo.data.open_id)));
    if (uname) {
      try { tiktok.watch(uname); } catch (e) { console.warn('startup auto-watch failed', uname, e); }
    }
  }
} catch (e) { /* ignore */ }

// Token refresh helpers: refresh tokens when they're close to expiry.
function _getExpiry(entry) {
  if (!entry || !entry.resp) return 0;
  const r = entry.resp;
  const expires = (r.expires_in || (r.data && r.data.expires_in) || 0);
  if (!expires) return 0;
  return (entry.created || 0) + (Number(expires) * 1000);
}

function shouldRefresh(entry, marginSec = 3600) {
  const exp = _getExpiry(entry);
  if (!exp) return false;
  const now = Date.now();
  return (exp - now) < (marginSec * 1000);
}

function refreshTikTokToken(id, entry) {
  return new Promise((resolve) => {
    try {
      const refreshToken = (entry.resp && (entry.resp.data && (entry.resp.data.refresh_token || entry.resp.data.refreshToken))) || entry.resp.refresh_token || entry.resp.refreshToken;
      if (!refreshToken || !CLIENT_KEY || !CLIENT_SECRET) return resolve(false);
      const postData = querystring.stringify({ client_key: CLIENT_KEY, grant_type: 'refresh_token', refresh_token: refreshToken });
      const opts = new URL('https://open-api.tiktok.com/oauth/refresh_token/');
      const reqOpts = { hostname: opts.hostname, path: opts.pathname + (opts.search || ''), method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) } };
      const r = https.request(reqOpts, (rres) => {
        let body = '';
        rres.on('data', c => body += c);
        rres.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const tokens = loadTokens();
            if (!tokens[id]) tokens[id] = entry;
            tokens[id].resp = parsed;
            tokens[id].created = Date.now();
            saveTokens(tokens);
            resolve(true);
          } catch (e) { resolve(false); }
        });
      });
      r.on('error', () => resolve(false));
      r.write(postData); r.end();
    } catch (e) { resolve(false); }
  });
}

function refreshTwitchToken(id, entry) {
  return new Promise((resolve) => {
    try {
      const refreshToken = (entry.resp && (entry.resp.refresh_token || entry.resp.refreshToken));
      if (!refreshToken || !TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET) return resolve(false);
      const qs = querystring.stringify({ client_id: TWITCH_CLIENT_ID, client_secret: TWITCH_CLIENT_SECRET, grant_type: 'refresh_token', refresh_token: refreshToken });
      const url = `https://id.twitch.tv/oauth2/token?${qs}`;
      https.get(url, (tres) => {
        let body = '';
        tres.on('data', c => body += c);
        tres.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const tokens = loadTokens();
            if (!tokens[id]) tokens[id] = entry;
            tokens[id].resp = parsed;
            tokens[id].created = Date.now();
            // fetch userinfo to refresh username
            const opts = { hostname: 'api.twitch.tv', path: '/helix/users', method: 'GET', headers: { 'Authorization': `Bearer ${parsed.access_token}`, 'Client-Id': TWITCH_CLIENT_ID } };
            const r = https.request(opts, (uRes) => { let ub = ''; uRes.on('data', c => ub += c); uRes.on('end', () => { try { const up = JSON.parse(ub); tokens[id].userinfo = up; if (up.data && up.data[0] && up.data[0].login) tokens[id].username = up.data[0].login; saveTokens(tokens); resolve(true); } catch (e) { saveTokens(tokens); resolve(true); } }); });
            r.on('error', () => { saveTokens(tokens); resolve(true); });
            r.end();
          } catch (e) { resolve(false); }
        });
      }).on('error', () => resolve(false));
    } catch (e) { resolve(false); }
  });
}

function refreshSpotifyToken(id, entry) {
  return new Promise((resolve) => {
    try {
      const refreshToken = (entry.resp && entry.resp.refresh_token) || entry.refresh_token;
      if (!refreshToken || !SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return resolve(false);
      const postData = querystring.stringify({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      });
      const r = https.request('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Authorization': spotifyAuthHeader(),
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(postData),
        },
      }, (res) => {
        let body = '';
        res.on('data', (c) => body += c);
        res.on('end', () => {
          try {
            const parsed = JSON.parse(body);
            const tokens = loadTokens();
            if (!tokens[id]) tokens[id] = entry;
            tokens[id].resp = { ...(tokens[id].resp || {}), ...parsed, refresh_token: parsed.refresh_token || refreshToken };
            tokens[id].created = Date.now();
            saveTokens(tokens);
            resolve(true);
          } catch (e) {
            resolve(false);
          }
        });
      });
      r.on('error', () => resolve(false));
      r.write(postData);
      r.end();
    } catch (e) {
      resolve(false);
    }
  });
}

async function refreshTokensLoop() {
  try {
    const tokens = loadTokens();
    const ids = Object.keys(tokens || {});
    for (const id of ids) {
      const entry = tokens[id];
      if (!entry) continue;
      if (!shouldRefresh(entry, 3600)) continue; // refresh if less than 1h left
      if (entry.platform === 'tiktok') {
        const ok = await refreshTikTokToken(id, entry);
        if (ok) console.log('Refreshed TikTok token', id);
      } else if (entry.platform === 'twitch') {
        const ok = await refreshTwitchToken(id, entry);
        if (ok) console.log('Refreshed Twitch token', id);
      } else if (entry.platform === 'spotify') {
        const ok = await refreshSpotifyToken(id, entry);
        if (ok) console.log('Refreshed Spotify token', id);
      }
    }
  } catch (e) { console.warn('refresh loop failed', e); }
}

// run every 10 minutes
setInterval(() => { refreshTokensLoop().catch(()=>{}); }, 10 * 60 * 1000);
// also run once at startup shortly after load
setTimeout(() => { refreshTokensLoop().catch(()=>{}); }, 5000);

