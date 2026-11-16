const express = require('express');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');
const { Server } = require('socket.io');

const state = require('./src/bridge-state');
const config = require('./src/config');
const { TickfinityClient } = require('./src/tickfinity-client');
// ^ Imported up here so the `/raw-events` handler below can reach its
// static `lastRawEvents` buffer.
const { CloudClient } = require('./src/cloud-client');

const PORT = Number(process.env.STREAM_BRIDGE_PORT || 21420);
const HOST = process.env.STREAM_BRIDGE_HOST || '127.0.0.1';
const DEBUG_RAW_EVENTS = process.env.STREAM_BRIDGE_DEBUG_RAW === '1';
const SHOULD_OPEN_BROWSER = process.env.STREAM_BRIDGE_OPEN_BROWSER === '1' || Boolean(process.pkg);
const SHOULD_OPEN_LAUNCHER = process.env.STREAM_BRIDGE_OPEN_LAUNCHER !== '0';

let cfg = config.load();
state.setPrimary(cfg.primary);
state.setEnabled('tikfinity', cfg.tikfinityEnabled);
state.setEnabled('cloud', cfg.cloudEnabled);
state.setUrl('cloud', cfg.cloudUrl);
state.setCloudIdentity({ tokenConfigured: !!cfg.cloudToken });

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);
      if (/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(origin)) return callback(null, true);
      if (/^https:\/\/(rectangled\.live|erectangled\.com|searchle\.live|wordgame\.live|wordtycoon\.live)$/i.test(origin)) return callback(null, true);
      return callback(new Error('CORS rejected'));
    }
  }
});

const publicDir = path.join(__dirname, 'public');
app.use(express.static(publicDir));
app.use(express.json());

app.get('/health', (_req, res) => {
  res.json(state.snapshot());
});

// Diagnostic: dump the last ~20 raw TikFinity envelopes so we can see
// exactly what the local TikFinity instance is broadcasting when event
// classification is off. Only the bridge operator hits this locally.
app.get('/raw-events', (_req, res) => {
  res.json({
    count: TickfinityClient.lastRawEvents.length,
    events: TickfinityClient.lastRawEvents.slice().reverse(),
  });
});

app.get('/info', (_req, res) => {
  res.json({
    ok: true,
    bridgeVersion: '0.2.1',
    localSocketIo: `http://${HOST}:${PORT}`,
    tikfinityUrl: 'ws://127.0.0.1:21213',
    cloudUrl: cfg.cloudUrl,
    features: ['bridge-status', 'chat-message', 'engagement', 'raw-event', 'dual-source', 'cloud-token'],
  });
});

app.get('/config', (_req, res) => {
  const c = config.load();
  res.json({
    tikfinityEnabled: c.tikfinityEnabled,
    cloudEnabled: c.cloudEnabled,
    primary: c.primary,
    cloudUrl: c.cloudUrl,
    cloudTokenConfigured: !!c.cloudToken,
  });
});

// One-click handoff from the /streamer dashboard. The dashboard links the
// user's browser here with their bridge token on the query string; we save
// it, flip Cloud on + make it primary, then bounce them back with a
// success flag the dashboard turns into a toast. No paste needed.
app.get('/connect', (req, res) => {
  const token = String(req.query.token || '').trim();
  const returnTo = typeof req.query.returnTo === 'string' && req.query.returnTo.startsWith('http')
    ? req.query.returnTo
    : 'https://wordgame.live/streamer?bridge=connected';
  if (!token) {
    return res.redirect(returnTo.replace('bridge=connected', 'bridge=missing-token'));
  }
  applyConfigPatch({ cloudToken: token, cloudEnabled: true, primary: 'cloud' });
  res.redirect(returnTo);
});

// Shared applyConfigPatch — used by local PUT /config, the /connect handoff,
// and inbound bridge-config pushes from the /streamer dashboard. Central so
// behavior is identical no matter which surface drives the change.
function applyConfigPatch(body) {
  const patch = {};
  if (typeof body.tikfinityEnabled === 'boolean') patch.tikfinityEnabled = body.tikfinityEnabled;
  if (typeof body.cloudEnabled === 'boolean') patch.cloudEnabled = body.cloudEnabled;
  if (body.primary === 'tikfinity' || body.primary === 'cloud') patch.primary = body.primary;
  if (typeof body.cloudToken === 'string') patch.cloudToken = body.cloudToken;
  if (typeof body.cloudUrl === 'string' && body.cloudUrl.startsWith('http')) patch.cloudUrl = body.cloudUrl;
  if (!Object.keys(patch).length) return patch;

  cfg = config.save(patch);

  if ('primary' in patch) state.setPrimary(patch.primary);
  if ('tikfinityEnabled' in patch) {
    state.setEnabled('tikfinity', patch.tikfinityEnabled);
    if (patch.tikfinityEnabled) tickfinity.start(); else tickfinity.stop();
  }
  if ('cloudEnabled' in patch || 'cloudToken' in patch || 'cloudUrl' in patch) {
    state.setEnabled('cloud', cfg.cloudEnabled);
    state.setUrl('cloud', cfg.cloudUrl);
    cloud.updateToken(cfg.cloudToken);
    if (cfg.cloudEnabled && cfg.cloudToken) cloud.start(); else cloud.stop();
  }

  io.emit('bridge-status', state.snapshot());
  cloud.pushStateUp();
  return patch;
}

app.put('/config', (req, res) => {
  applyConfigPatch(req.body || {});
  res.json({
    ok: true,
    tikfinityEnabled: cfg.tikfinityEnabled,
    cloudEnabled: cfg.cloudEnabled,
    primary: cfg.primary,
    cloudUrl: cfg.cloudUrl,
    cloudTokenConfigured: !!cfg.cloudToken,
  });
});

io.on('connection', (socket) => {
  socket.emit('bridge-status', state.snapshot());
});

const tickfinity = new TickfinityClient({
  url: 'ws://127.0.0.1:21213',
  io,
  isPrimary: (name) => state.getPrimary() === name,
  debugRaw: DEBUG_RAW_EVENTS,
});

const cloud = new CloudClient({
  url: cfg.cloudUrl,
  token: cfg.cloudToken,
  localIo: io,
  isPrimary: (name) => state.getPrimary() === name,
});
// Inbound config pushes from the /streamer dashboard take the same code
// path as local PUT /config. Set AFTER applyConfigPatch is declared below
// (see hoisting note — function declarations are hoisted, so referencing
// it here is safe).
cloud.onConfigFromCloud = (patch) => applyConfigPatch(patch || {});

server.on('error', (error) => {
  if (error && error.code === 'EADDRINUSE') {
    const localUrl = `http://${HOST}:${PORT}`;
    console.warn(`[Streamer Bridge] ${localUrl} already in use; opening the existing bridge instead.`);
    setTimeout(() => openClientWindow(localUrl), 150);
    setTimeout(() => process.exit(0), 450);
    return;
  }
  throw error;
});

server.listen(PORT, HOST, () => {
  const localUrl = `http://${HOST}:${PORT}`;
  console.log(`[Streamer Bridge] Listening on ${localUrl}`);
  console.log(`[Streamer Bridge] Primary source: ${state.getPrimary()}`);
  if (cfg.tikfinityEnabled) tickfinity.start();
  if (cfg.cloudEnabled && cfg.cloudToken) cloud.start();

  if (SHOULD_OPEN_LAUNCHER) {
    setTimeout(() => openClientWindow(localUrl), 450);
  } else if (SHOULD_OPEN_BROWSER) {
    setTimeout(() => openBrowser(localUrl), 450);
  }
});

function openClientWindow(url) {
  try {
    if (process.platform === 'win32') {
      const htaUrl = `${url}/launcher.hta`;
      try {
        const child = spawn('mshta.exe', [htaUrl], {
          detached: true, stdio: 'ignore', windowsHide: false,
        });
        child.unref();
        return;
      } catch (_error) { /* fall back to browser */ }
    }
    if (SHOULD_OPEN_BROWSER) openBrowser(url);
  } catch (error) {
    console.warn(`[Streamer Bridge] Failed to open launcher window: ${error.message}`);
    if (SHOULD_OPEN_BROWSER) openBrowser(url);
  }
}

function openBrowser(url) {
  try {
    if (process.platform === 'win32') {
      const launchers = [
        { command: process.env.ComSpec || 'C:\\Windows\\System32\\cmd.exe', args: ['/c', 'start', '""', url] },
        { command: 'powershell.exe', args: ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', `Start-Process '${url.replace(/'/g, "''")}'`] },
        { command: 'explorer.exe', args: [url] },
      ];
      for (const launcher of launchers) {
        try {
          const child = spawn(launcher.command, launcher.args, {
            detached: true, stdio: 'ignore', windowsHide: true,
          });
          child.unref();
          return;
        } catch (_error) { /* try next */ }
      }
      return;
    }
    if (process.platform === 'darwin') {
      const child = spawn('open', [url], { detached: true, stdio: 'ignore' });
      child.unref();
      return;
    }
    const child = spawn('xdg-open', [url], { detached: true, stdio: 'ignore' });
    child.unref();
  } catch (error) {
    console.warn(`[Streamer Bridge] Failed to open browser: ${error.message}`);
  }
}

function shutdown() {
  tickfinity.stop();
  cloud.stop();
  io.close(() => server.close(() => process.exit(0)));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
