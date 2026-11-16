// App Manager - starts, stops, and monitors external game apps
const { spawn, execSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const path = require('path');

const APPS_CONFIG = path.join(__dirname, '..', 'apps.json');
const HEALTH_CHECK_INTERVAL = 8000; // ms

let apps = {};       // id -> { config, process, status, logs }
let aliasToId = {};  // alias -> canonical id
let io = null;
let healthCheckTimer = null;

function loadConfig() {
  try {
    const raw = fs.readFileSync(APPS_CONFIG, 'utf-8');
    const config = JSON.parse(raw);
    return config.apps || [];
  } catch (err) {
    console.error('[Apps] Failed to load apps.json:', err.message);
    return [];
  }
}

function initialize(socketIO) {
  io = socketIO;

  const configs = loadConfig();
  apps = {};
  for (const cfg of configs) {
    apps[cfg.id] = {
      config: cfg,
      process: null,
      status: 'stopped',  // stopped | starting | running | error
      logs: [],
      error: null,
      reachable: false
    };
  }
  rebuildAliasIndex();

  // Start periodic health checks
  if (healthCheckTimer) clearInterval(healthCheckTimer);
  healthCheckTimer = setInterval(runHealthChecks, HEALTH_CHECK_INTERVAL);
  // Run an initial check after a short delay
  setTimeout(runHealthChecks, 2000);

  console.log(`[Apps] Loaded ${configs.length} app(s) from registry`);
}

function rebuildAliasIndex() {
  aliasToId = {};
  for (const [id, app] of Object.entries(apps)) {
    const aliases = Array.isArray(app.config.aliases) ? app.config.aliases : [];
    for (const alias of aliases) {
      const normalized = String(alias || '').trim();
      if (!normalized) continue;
      aliasToId[normalized] = id;
    }
  }
}

function resolveAppId(id) {
  const raw = String(id || '').trim();
  if (!raw) return raw;
  return apps[raw] ? raw : (aliasToId[raw] || raw);
}

function getAll() {
  return Object.values(apps).map(app => ({
    id: app.config.id,
    name: app.config.name,
    description: app.config.description,
    port: app.config.port,
    path: app.config.path,
    pages: app.config.pages || [],
    status: app.status,
    error: app.error,
    reachable: app.reachable,
    managed: !!app.process
  }));
}

function getApp(id) {
  return apps[resolveAppId(id)] || null;
}

function startApp(id) {
  id = resolveAppId(id);
  const app = apps[id];
  if (!app) return { ok: false, error: 'App not found' };
  if (app.process) return { ok: false, error: 'App already running' };
  // Don't spawn if the port is already in use (externally running)
  if (app.reachable) return { ok: false, error: 'App already running externally' };

  // Verify the app directory exists
  const appDir = app.config.path;
  const entryFile = path.join(appDir, app.config.entryPoint);
  if (!fs.existsSync(entryFile)) {
    app.status = 'error';
    app.error = `Entry point not found: ${entryFile}`;
    broadcastStatus();
    return { ok: false, error: app.error };
  }

  app.status = 'starting';
  app.error = null;
  app.logs = [];
  broadcastStatus();

  // Spawn the app process with PORT override
  // Use process.execPath to get the full path to node.exe (avoids PATH issues)
  // Each game loads its own private configuration; never inherit Relay credentials.
  const runtimeKeys = new Set([
    'PATH', 'HOME', 'USER', 'LOGNAME', 'SHELL', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'TERM',
    'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'PATHEXT', 'HOMEDRIVE', 'HOMEPATH',
    'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA', 'TEMP', 'TMP',
    'NODE_ENV', 'NODE_OPTIONS', 'NODE_EXTRA_CA_CERTS', 'UV_THREADPOOL_SIZE'
  ]);
  const env = Object.fromEntries(Object.entries(process.env)
    .filter(([key]) => runtimeKeys.has(key.toUpperCase())));
  env.PORT = String(app.config.port);
  const child = spawn(process.execPath, [app.config.entryPoint], {
    cwd: appDir,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false
  });

  app.process = child;

  child.stdout.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      app.logs.push({ type: 'stdout', text: line, time: Date.now() });
      // Keep logs bounded
      if (app.logs.length > 200) app.logs.shift();
    }

    // Detect when app is actually listening
    if (app.status === 'starting') {
      const text = data.toString().toLowerCase();
      if (text.includes('listening') || text.includes('running') || text.includes('started') || (text.includes('server') && text.includes('port'))) {
        app.status = 'running';
        broadcastStatus();
        // Immediate health check now that it's running
        scheduleHealthCheck(id);
      }
    }
  });

  child.stderr.on('data', (data) => {
    const lines = data.toString().split('\n').filter(Boolean);
    for (const line of lines) {
      app.logs.push({ type: 'stderr', text: line, time: Date.now() });
      if (app.logs.length > 200) app.logs.shift();
    }
  });

  child.on('error', (err) => {
    app.status = 'error';
    app.error = err.message;
    app.process = null;
    broadcastStatus();
    console.error(`[Apps] ${app.config.name} error:`, err.message);
  });

  child.on('exit', (code, signal) => {
    const wasRunning = app.status === 'running' || app.status === 'starting';
    if (app.status !== 'stopped') {
      // Treat signal kills (SIGTERM, SIGINT) and code 1 as clean stops, not errors
      const cleanExit = code === 0 || signal === 'SIGTERM' || signal === 'SIGINT' || code === 1;
      app.status = cleanExit ? 'stopped' : 'error';
      if (!cleanExit && code !== null) {
        app.error = `Exited with code ${code}`;
      } else {
        app.error = null;
      }
    }
    app.process = null;
    broadcastStatus();
    if (wasRunning) {
      console.log(`[Apps] ${app.config.name} exited (code=${code}, signal=${signal})`);
    }
  });

  // If we don't detect "running" within 5s, assume it started
  setTimeout(() => {
    if (app.status === 'starting' && app.process) {
      app.status = 'running';
      broadcastStatus();
      // Immediate health check now that it's running
      scheduleHealthCheck(id);
    }
  }, 5000);

  console.log(`[Apps] Starting ${app.config.name} on port ${app.config.port}`);
  return { ok: true };
}

function stopApp(id) {
  id = resolveAppId(id);
  const app = apps[id];
  if (!app) return { ok: false, error: 'App not found' };

  let pid = null;

  if (app.process) {
    // Managed process — use stored PID
    pid = app.process.pid;
    app.process = null;
  } else if (app.reachable) {
    // Externally running — find PID by port
    pid = findPidForPort(app.config.port);
    if (!pid) return { ok: false, error: `Could not find process on port ${app.config.port}` };
  } else {
    return { ok: false, error: 'App not running' };
  }

  app.status = 'stopped';
  app.error = null;
  app.reachable = false;

  killProcessTree(pid);
  broadcastStatus();
  console.log(`[Apps] Stopped ${app.config.name} (PID ${pid})`);
  return { ok: true };
}

/**
 * Find the PID of the process listening on a given port.
 * Returns the PID as a number, or null if not found.
 */
function findPidForPort(port) {
  try {
    if (process.platform === 'win32') {
      const output = execSync(`netstat -ano | findstr "LISTENING" | findstr ":${port} "`, { encoding: 'utf-8', timeout: 5000 });
      // Parse lines like: TCP  0.0.0.0:3020  0.0.0.0:0  LISTENING  73952
      for (const line of output.split('\n')) {
        const match = line.match(/:(\d+)\s+\S+\s+LISTENING\s+(\d+)/);
        if (match && parseInt(match[1]) === port) {
          return parseInt(match[2]);
        }
      }
    } else {
      const output = execSync(`lsof -ti :${port}`, { encoding: 'utf-8', timeout: 5000 });
      const pid = parseInt(output.trim());
      if (!isNaN(pid)) return pid;
    }
  } catch {
    // Command failed or no match
  }
  return null;
}

/**
 * Kill a process and its children.
 */
function killProcessTree(pid) {
  if (process.platform === 'win32') {
    try {
      spawn('taskkill', ['/pid', String(pid), '/T', '/F'], { shell: true, stdio: 'ignore' });
    } catch {}
  } else {
    try {
      process.kill(-pid, 'SIGTERM');
    } catch {
      try { process.kill(pid, 'SIGTERM'); } catch {}
    }
  }
}

function startAll() {
  const results = {};
  for (const id of Object.keys(apps)) {
    if (!apps[id].process) {
      results[id] = startApp(id);
    } else {
      results[id] = { ok: true, alreadyRunning: true };
    }
  }
  return results;
}

function restartApp(id) {
  id = resolveAppId(id);
  const app = apps[id];
  if (!app) return { ok: false, error: 'App not found' };

  // Guard against double-restart race condition
  if (app._restarting) return { ok: false, error: 'Already restarting' };
  app._restarting = true;

  const wasManaged = !!app.process;
  const stop = stopApp(id);
  if (!stop.ok) { app._restarting = false; return stop; }

  // Short delay to let the port free up before restarting
  const doRestart = () => {
    app._restarting = false;
    startApp(id);
  };

  if (wasManaged) {
    setTimeout(doRestart, 1000);
    return { ok: true, message: 'Restarting...' };
  }

  // External app was killed; start it as managed
  setTimeout(doRestart, 1000);
  return { ok: true, message: 'Restarting...' };
}

function stopAll() {
  const results = {};
  for (const id of Object.keys(apps)) {
    if (apps[id].process) {
      results[id] = stopApp(id);
    } else {
      results[id] = { ok: true, alreadyStopped: true };
    }
  }
  return results;
}

function getLogs(id, count = 50) {
  const app = apps[resolveAppId(id)];
  if (!app) return [];
  return app.logs.slice(-count);
}

function broadcastStatus() {
  if (io) {
    io.to('dashboard').emit('apps-status', getAll());
  }
}

// Reload apps.json and merge with current state
function reload() {
  const configs = loadConfig();
  const existingIds = new Set(Object.keys(apps));
  const newIds = new Set(configs.map(c => c.id));

  // Add new apps
  for (const cfg of configs) {
    if (!existingIds.has(cfg.id)) {
      apps[cfg.id] = {
        config: cfg,
        process: null,
        status: 'stopped',
        logs: [],
        error: null,
        reachable: false
      };
    } else {
      // Update config for existing apps (but keep process state)
      apps[cfg.id].config = cfg;
    }
  }

  // Remove apps no longer in config (stop them first)
  for (const id of existingIds) {
    if (!newIds.has(id)) {
      if (apps[id].process) stopApp(id);
      delete apps[id];
    }
  }

  rebuildAliasIndex();

  broadcastStatus();
  console.log(`[Apps] Reloaded config: ${configs.length} app(s)`);
}

// Schedule an immediate health check for a single app (with short delay for port to open)
function scheduleHealthCheck(id) {
  setTimeout(async () => {
    const app = apps[id];
    if (!app) return;
    const was = app.reachable;
    app.reachable = await checkPort(app.config.port);
    if (app.reachable !== was) broadcastStatus();
  }, 1500);
}

// Directly set reachable state for an app (used by server for socket-connected apps)
function setReachable(id, value) {
  const app = apps[resolveAppId(id)];
  if (!app) return;
  const was = app.reachable;
  app.reachable = !!value;
  if (app.reachable !== was) broadcastStatus();
}

// Health check - ping each app's port to see if it's reachable
function checkPort(port) {
  return new Promise((resolve) => {
    const req = http.get(`http://localhost:${port}/`, { timeout: 2000 }, (res) => {
      res.resume(); // drain response
      resolve(true);
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

async function runHealthChecks() {
  let changed = false;
  for (const app of Object.values(apps)) {
    const wasReachable = app.reachable;
    app.reachable = await checkPort(app.config.port);

    // Auto-detect externally running games:
    // If port is reachable but we didn't start the process, mark as running
    if (app.reachable && !app.process && app.status === 'stopped') {
      app.status = 'running';
      changed = true;
    }
    // If port went unreachable and we have no managed process, mark as stopped
    if (!app.reachable && !app.process && app.status === 'running') {
      app.status = 'stopped';
      changed = true;
    }

    if (app.reachable !== wasReachable) changed = true;
  }
  if (changed) broadcastStatus();
}

// Clean shutdown
function shutdown() {
  for (const id of Object.keys(apps)) {
    if (apps[id].process) {
      try {
        apps[id].process.kill('SIGTERM');
      } catch {}
    }
  }
}

module.exports = {
  initialize,
  getAll,
  getApp,
  startApp,
  stopApp,
  restartApp,
  startAll,
  stopAll,
  getLogs,
  reload,
  setReachable,
  shutdown
};
