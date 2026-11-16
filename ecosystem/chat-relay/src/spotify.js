/**
 * Spotify "Now Playing" Integration
 *
 * OAuth2 Authorization Code Flow + polling.
 * Exposes Express route handlers and emits socket.io events.
 * Tokens are persisted to disk so polling auto-resumes after restart.
 *
 * Setup:
 *   1. Create app at https://developer.spotify.com/dashboard
 *   2. Add redirect URI: http://localhost:3000/spotify/callback
 *   3. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env
 *   4. Visit http://localhost:3000/spotify/login to authorize (first time only)
 */

const fs = require('fs');
const path = require('path');

const TOKEN_FILE = path.join(__dirname, '..', 'data', 'spotify-tokens.json');

let io = null;
let config = { clientId: '', clientSecret: '', redirectUri: '' };
let nowPlayingCallback = null;
let playbackUpdateCallback = null;

// Token state (persisted to disk)
let accessToken = null;
let refreshToken = null;
let tokenExpiry = 0;
let grantedScopes = new Set();

// Polling
let pollInterval = null;
const POLL_MS = 5000;
let lastTrackId = null;
let lastIsPlaying = null;
const tempoCache = {}; // trackId -> tempo (BPM)

// ─── Token Persistence ──────────────────────────────────────────────
function saveTokens() {
  try {
    const dir = path.dirname(TOKEN_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(TOKEN_FILE, JSON.stringify({
      accessToken,
      refreshToken,
      tokenExpiry,
      scopes: Array.from(grantedScopes)
    }, null, 2));
  } catch (err) {
    console.error('[Spotify] Failed to save tokens:', err.message);
  }
}

function loadTokens() {
  try {
    if (!fs.existsSync(TOKEN_FILE)) return false;
    const data = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
    if (!data.refreshToken) return false;
    accessToken = data.accessToken || null;
    refreshToken = data.refreshToken;
    tokenExpiry = data.tokenExpiry || 0;
    grantedScopes = new Set(Array.isArray(data.scopes)
      ? data.scopes
      : String(data.scopes || '').split(/\s+/).filter(Boolean));
    return true;
  } catch (err) {
    console.error('[Spotify] Failed to load tokens:', err.message);
    return false;
  }
}

function clearTokenFile() {
  try { if (fs.existsSync(TOKEN_FILE)) fs.unlinkSync(TOKEN_FILE); } catch {}
}

// ─── Initialization ─────────────────────────────────────────────────
function initialize(socketIO, cfg) {
  io = socketIO;
  config = {
    clientId: cfg.clientId || '',
    clientSecret: cfg.clientSecret || '',
    redirectUri: cfg.redirectUri || 'http://localhost:3000/spotify/callback'
  };
  nowPlayingCallback = typeof cfg.onNowPlaying === 'function' ? cfg.onNowPlaying : null;
  playbackUpdateCallback = typeof cfg.onPlaybackUpdate === 'function' ? cfg.onPlaybackUpdate : null;

  if (!config.clientId || !config.clientSecret) {
    console.log('[Spotify] No credentials configured — skipping');
    return;
  }

  // Try to restore saved tokens and auto-resume polling
  if (loadTokens()) {
    console.log('[Spotify] Restored saved tokens — resuming polling');
    startPolling();
  } else {
    console.log('[Spotify] Module initialized (visit /spotify/login to authorize)');
  }
}

// ─── OAuth Helpers ──────────────────────────────────────────────────
const SCOPES = 'user-read-currently-playing user-read-playback-state user-modify-playback-state';

function getAuthUrl() {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    scope: SCOPES,
    redirect_uri: config.redirectUri,
    show_dialog: 'true'
  });
  return `https://accounts.spotify.com/authorize?${params}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(config.clientId + ':' + config.clientSecret).toString('base64')
    },
    body
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error('Token exchange failed: ' + err);
  }

  const data = await res.json();
  accessToken = data.access_token;
  refreshToken = data.refresh_token || refreshToken;
  tokenExpiry = Date.now() + (data.expires_in - 60) * 1000; // refresh 60 s early
  grantedScopes = new Set(String(data.scope || SCOPES).split(/\s+/).filter(Boolean));
  saveTokens();
  console.log('[Spotify] Authorized — access token acquired (saved to disk)');
}

async function refreshAccessToken() {
  if (!refreshToken) return false;

  try {
    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken
    });

    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(config.clientId + ':' + config.clientSecret).toString('base64')
      },
      body
    });

    if (!res.ok) throw new Error('Refresh failed: ' + res.status);

    const data = await res.json();
    accessToken = data.access_token;
    if (data.refresh_token) refreshToken = data.refresh_token;
    tokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
    if (data.scope) grantedScopes = new Set(String(data.scope).split(/\s+/).filter(Boolean));
    saveTokens();
    console.log('[Spotify] Token refreshed');
    return true;
  } catch (err) {
    console.error('[Spotify] Token refresh error:', err.message);
    return false;
  }
}

class SpotifyApiError extends Error {
  constructor(message, status, body = null) {
    super(message);
    this.name = 'SpotifyApiError';
    this.status = status;
    this.body = body;
  }
}

/**
 * Make an authenticated Spotify Web API request, refreshing the access token
 * once when necessary. Playback controls share this helper with the song
 * request queue so credentials never leave this module.
 */
async function apiRequest(endpoint, options = {}, mayRetry = true) {
  if (!accessToken) {
    throw new SpotifyApiError('Spotify is not authenticated', 401);
  }

  if (Date.now() >= tokenExpiry) {
    const refreshed = await refreshAccessToken();
    if (!refreshed) throw new SpotifyApiError('Spotify token refresh failed', 401);
  }

  const headers = {
    Authorization: 'Bearer ' + accessToken,
    ...(options.headers || {})
  };
  const res = await fetch(`https://api.spotify.com/v1${endpoint}`, {
    ...options,
    headers
  });

  if (res.status === 401 && mayRetry) {
    const refreshed = await refreshAccessToken();
    if (refreshed) return apiRequest(endpoint, options, false);
  }

  if (res.status === 204 || res.status === 202) return null;

  const text = await res.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch (_) { body = text; }
  }
  if (!res.ok) {
    const detail = body && body.error && body.error.message
      ? body.error.message
      : `Spotify API returned ${res.status}`;
    throw new SpotifyApiError(detail, res.status, body);
  }
  return body;
}

async function searchTrack(query) {
  const data = await apiRequest(`/search?type=track&limit=1&q=${encodeURIComponent(query)}`);
  return data && data.tracks && Array.isArray(data.tracks.items)
    ? data.tracks.items[0] || null
    : null;
}

function getPlaybackState() {
  return apiRequest('/me/player');
}

function getQueue() {
  return apiRequest('/me/player/queue');
}

function getDevices() {
  return apiRequest('/me/player/devices');
}

function startPlayback(deviceId, body) {
  const suffix = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
  return apiRequest(`/me/player/play${suffix}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
}

function skipNext(deviceId) {
  const suffix = deviceId ? `?device_id=${encodeURIComponent(deviceId)}` : '';
  return apiRequest(`/me/player/next${suffix}`, { method: 'POST' });
}

function addToQueue(uri, deviceId) {
  const params = new URLSearchParams({ uri: String(uri || '') });
  if (deviceId) params.set('device_id', deviceId);
  return apiRequest(`/me/player/queue?${params}`, { method: 'POST' });
}

// Last payload emitted to clients — stashed so new subscribers / page refreshes
// can prime UI with the current track without waiting for the next 5s poll.
let lastPayload = { isPlaying: false };

// ─── Polling ────────────────────────────────────────────────────────
async function pollNowPlaying() {
  if (!accessToken) return;

  // Auto-refresh before expiry
  if (Date.now() >= tokenExpiry) {
    const ok = await refreshAccessToken();
    if (!ok) { stopPolling(); return; }
  }

  try {
    const res = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
      headers: { 'Authorization': 'Bearer ' + accessToken }
    });

    if (res.status === 204 || res.status === 202) {
      // Nothing playing
      if (lastIsPlaying !== false) {
        lastIsPlaying = false;
        lastTrackId = null;
        lastPayload = { isPlaying: false };
        if (io) io.emit('spotify-now-playing', { isPlaying: false });
        if (nowPlayingCallback) nowPlayingCallback({ isPlaying: false });
        if (playbackUpdateCallback) playbackUpdateCallback({ isPlaying: false });
      }
      return;
    }

    if (res.status === 401) {
      console.log('[Spotify] Token expired, refreshing...');
      const ok = await refreshAccessToken();
      if (!ok) stopPolling();
      return;
    }

    if (!res.ok) return;

    const data = await res.json();

    if (!data || !data.item) {
      if (lastIsPlaying !== false) {
        lastIsPlaying = false;
        lastTrackId = null;
        lastPayload = { isPlaying: false };
        if (io) io.emit('spotify-now-playing', { isPlaying: false });
        if (nowPlayingCallback) nowPlayingCallback({ isPlaying: false });
        if (playbackUpdateCallback) playbackUpdateCallback({ isPlaying: false });
      }
      return;
    }

    const track = data.item;
    const trackId = track.id;
    const isPlaying = data.is_playing;

    // Emit on track change or play/pause change
    const changed = trackId !== lastTrackId || isPlaying !== lastIsPlaying;
    lastTrackId = trackId;
    lastIsPlaying = isPlaying;

    const payload = {
      trackId,
      trackUri: track.uri || '',
      track: track.name || '',
      artist: (track.artists || []).map(a => a.name).join(', '),
      album: track.album ? track.album.name : '',
      albumArt: track.album && track.album.images && track.album.images.length > 0
        ? (track.album.images.find(i => i.width <= 300) || track.album.images[0]).url
        : '',
      albumArtLarge: track.album && track.album.images && track.album.images.length > 0
        ? (track.album.images.find(i => i.width >= 640) || track.album.images[0]).url
        : '',
      progress: data.progress_ms || 0,
      duration: track.duration_ms || 0,
      isPlaying,
      tempo: tempoCache[trackId] ? tempoCache[trackId].tempo : null,
      energy: tempoCache[trackId] ? tempoCache[trackId].energy : null,
      danceability: tempoCache[trackId] ? tempoCache[trackId].danceability : null
    };

    // Fetch audio features for new tracks (non-blocking)
    if (changed && isPlaying && !tempoCache[trackId]) {
      fetch(`https://api.spotify.com/v1/audio-features/${trackId}`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
      }).then(r => r.ok ? r.json() : null).then(af => {
        if (af && af.tempo) {
          tempoCache[trackId] = {
            tempo: Math.round(af.tempo),
            energy: af.energy || 0,
            danceability: af.danceability || 0
          };
          payload.tempo = tempoCache[trackId].tempo;
          payload.energy = tempoCache[trackId].energy;
          payload.danceability = tempoCache[trackId].danceability;
          if (io) io.emit('spotify-now-playing', { ...payload });
          if (nowPlayingCallback) nowPlayingCallback({ ...payload });
          if (playbackUpdateCallback) playbackUpdateCallback({ ...payload });
        }
      }).catch(() => {});
    }

    lastPayload = payload;
    if (io) io.emit('spotify-now-playing', payload);
    if (changed && nowPlayingCallback) nowPlayingCallback(payload);
    if (playbackUpdateCallback) playbackUpdateCallback(payload);

  } catch (err) {
    // Silently ignore network errors during polling
  }
}

function startPolling() {
  stopPolling();
  console.log('[Spotify] Polling started');
  pollInterval = setInterval(pollNowPlaying, POLL_MS);
  pollNowPlaying(); // immediate first poll
}

function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// ─── Express Route Handlers ─────────────────────────────────────────
function handleLogin(req, res) {
  if (!config.clientId) {
    return res.status(500).send('Spotify not configured. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env');
  }
  res.redirect(getAuthUrl());
}

async function handleCallback(req, res) {
  const code = req.query.code;
  const error = req.query.error;

  if (error) {
    return res.status(400).send('Authorization denied: ' + error);
  }

  if (!code) {
    return res.status(400).send('Missing authorization code');
  }

  try {
    await exchangeCode(code);
    startPolling();
    res.send(`
      <html><body style="background:#0a0014;color:#00fff9;font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh">
        <div style="text-align:center">
          <h1 style="color:#ff2d95">✓ Spotify Connected</h1>
          <p>Now playing data will appear on the overlay.</p>
          <p style="color:#666">You can close this tab.</p>
        </div>
      </body></html>
    `);
  } catch (err) {
    console.error('[Spotify] Auth error:', err.message);
    res.status(500).send('Authorization failed: ' + err.message);
  }
}

function handleStatus(req, res) {
  res.json({
    configured: !!(config.clientId && config.clientSecret),
    authenticated: !!accessToken,
    polling: !!pollInterval,
    playbackControl: grantedScopes.has('user-modify-playback-state'),
    lastTrackId
  });
}

// Returns the last emitted spotify-now-playing payload so a newly-loaded
// overlay can render current state instantly instead of waiting up to 5s
// for the next poll tick.
function handleNowPlaying(req, res) {
  res.json(lastPayload || { isPlaying: false });
}

function handleDisconnect(req, res) {
  stopPolling();
  accessToken = null;
  refreshToken = null;
  tokenExpiry = 0;
  grantedScopes = new Set();
  lastTrackId = null;
  lastIsPlaying = null;
  clearTokenFile();
  if (io) io.emit('spotify-now-playing', { isPlaying: false });
  if (nowPlayingCallback) nowPlayingCallback({ isPlaying: false });
  if (playbackUpdateCallback) playbackUpdateCallback({ isPlaying: false });
  console.log('[Spotify] Disconnected (tokens cleared from disk)');
  res.json({ ok: true });
}

// ─── Exports ────────────────────────────────────────────────────────
module.exports = {
  initialize,
  handleLogin,
  handleCallback,
  handleStatus,
  handleNowPlaying,
  handleDisconnect,
  searchTrack,
  getPlaybackState,
  getQueue,
  getDevices,
  startPlayback,
  skipNext,
  addToQueue,
  SpotifyApiError,
  SCOPES,
  isAuthenticated: () => !!accessToken,
  hasScope: scope => grantedScopes.has(scope),
  getCurrentTrackId: () => lastTrackId
};
