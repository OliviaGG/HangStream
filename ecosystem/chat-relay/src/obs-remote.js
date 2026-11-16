// Remote control for the headless OBS stream renderer (render1 box).
// Speaks obs-websocket protocol v5 over a short-lived connection per call:
// connect -> Hello -> Identify (SHA256 challenge auth) -> one request -> close.
// Short-lived keeps this stateless across render1 reboots/OBS restarts; at
// ~90ms RTT a full round trip is ~300ms, fine for dashboard polling.
const crypto = require('crypto');
const WebSocket = require('ws');

const OBS_WS_URL = process.env.OBS_WS_URL || '';
const OBS_WS_PASSWORD = process.env.OBS_WS_PASSWORD || '';
const MUSIC_INPUT_NAME = process.env.OBS_MUSIC_INPUT || 'music';
const REQUEST_TIMEOUT_MS = 6000;

function isConfigured() {
  return !!(OBS_WS_URL && OBS_WS_PASSWORD);
}

function authToken(password, salt, challenge) {
  const secret = crypto.createHash('sha256').update(password + salt).digest('base64');
  return crypto.createHash('sha256').update(secret + challenge).digest('base64');
}

// Several requests over ONE connection. Each connection costs a
// connect -> Hello -> Identify handshake plus a connect/disconnect line pair
// in OBS's own log; the dashboard's 5s poll needs three requests, so batching
// them is 3x less churn (and 3x less log noise) than a connection apiece.
// Rejects as soon as any request in the batch fails, matching the
// one-request-one-promise behaviour callers already expect.
function obsRequestMany(requests) {
  return new Promise((resolve, reject) => {
    if (!isConfigured()) return reject(new Error('OBS remote not configured (OBS_WS_URL / OBS_WS_PASSWORD)'));
    if (!requests.length) return resolve([]);
    const ws = new WebSocket(OBS_WS_URL, { handshakeTimeout: REQUEST_TIMEOUT_MS });
    const results = new Array(requests.length);
    let pending = requests.length;
    let settled = false;
    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { ws.close(); } catch (_) {}
      err ? reject(err) : resolve(value);
    };
    const timer = setTimeout(() => finish(new Error('OBS request timed out')), REQUEST_TIMEOUT_MS);

    ws.on('error', (err) => finish(new Error('OBS unreachable: ' + err.message)));
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch (_) { return; }
      if (msg.op === 0) {
        // Hello: identify (auth only present when password auth is enabled)
        const auth = msg.d?.authentication
          ? authToken(OBS_WS_PASSWORD, msg.d.authentication.salt, msg.d.authentication.challenge)
          : undefined;
        ws.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, authentication: auth, eventSubscriptions: 0 } }));
      } else if (msg.op === 2) {
        // Identified: send every request, tagged by its index in the batch
        requests.forEach((r, i) => ws.send(JSON.stringify({
          op: 6,
          d: { requestType: r.requestType, requestId: 'r' + i, requestData: r.requestData || {} },
        })));
      } else if (msg.op === 7) {
        const i = Number(String(msg.d?.requestId || '').slice(1));
        if (!Number.isInteger(i) || i < 0 || i >= results.length) return;
        const status = msg.d?.requestStatus;
        if (!status?.result) {
          return finish(new Error('OBS request failed: ' + (status?.comment || status?.code || 'unknown')));
        }
        if (results[i] !== undefined) return; // duplicate response for this id
        results[i] = msg.d.responseData || {};
        if (--pending === 0) finish(null, results);
      }
    });
    ws.on('close', () => finish(new Error('OBS connection closed before response')));
  });
}

function obsRequest(requestType, requestData) {
  return obsRequestMany([{ requestType, requestData }]).then((r) => r[0]);
}

async function getStatus() {
  // One connection for both. GetStats is best-effort, so if the batch fails
  // fall back to asking for the status alone — that one must still throw.
  let stream;
  let stats = null;
  try {
    [stream, stats] = await obsRequestMany([{ requestType: 'GetStreamStatus' }, { requestType: 'GetStats' }]);
  } catch (_) {
    stream = await obsRequest('GetStreamStatus');
  }
  return shapeStatus(stream, stats);
}

function shapeStatus(stream, stats) {
  return {
    configured: true,
    reachable: true,
    streaming: !!stream.outputActive,
    reconnecting: !!stream.outputReconnecting,
    durationMs: stream.outputDuration || 0,
    skippedFrames: stream.outputSkippedFrames || 0,
    totalFrames: stream.outputTotalFrames || 0,
    cpuUsage: stats ? Math.round((stats.cpuUsage || 0) * 10) / 10 : null,
    activeFps: stats ? Math.round((stats.activeFps || 0) * 10) / 10 : null,
    renderSkipped: stats ? stats.renderSkippedFrames || 0 : null,
    renderTotal: stats ? stats.renderTotalFrames || 0 : null,
  };
}

function startStream() { return obsRequest('StartStream'); }
function stopStream() { return obsRequest('StopStream'); }

// Stream service (RTMP server + key). Key is never returned in full —
// callers get a masked tail, enough for "which key is loaded" recognition.
async function getStreamService() {
  return shapeService(await obsRequest('GetStreamServiceSettings'));
}

function shapeService(r) {
  const s = (r && r.streamServiceSettings) || {};
  const key = s.key || '';
  return {
    server: s.server || '',
    keySet: !!key,
    keyTail: key ? key.slice(-4) : null,
  };
}

function shapeMusicStatus(mute, volume) {
  const volumeMul = Number(volume?.inputVolumeMul);
  const safeVolumeMul = Number.isFinite(volumeMul) ? Math.max(0, volumeMul) : 0;
  return {
    inputName: MUSIC_INPUT_NAME,
    playing: !mute?.inputMuted,
    muted: !!mute?.inputMuted,
    volume: Math.round(safeVolumeMul * 100),
    volumeMul: safeVolumeMul,
    volumeDb: Number.isFinite(Number(volume?.inputVolumeDb)) ? Number(volume.inputVolumeDb) : null,
  };
}

async function getMusicStatus() {
  const [mute, volume] = await obsRequestMany([
    { requestType: 'GetInputMute', requestData: { inputName: MUSIC_INPUT_NAME } },
    { requestType: 'GetInputVolume', requestData: { inputName: MUSIC_INPUT_NAME } },
  ]);
  return shapeMusicStatus(mute, volume);
}

function setMusicPlaying(playing) {
  return obsRequest('SetInputMute', {
    inputName: MUSIC_INPUT_NAME,
    inputMuted: !playing,
  });
}

function setMusicVolume(volumePercent) {
  const volume = Number(volumePercent);
  if (!Number.isFinite(volume) || volume < 0 || volume > 100) {
    throw new Error('Music volume must be between 0 and 100');
  }
  return obsRequest('SetInputVolume', {
    inputName: MUSIC_INPUT_NAME,
    inputVolumeMul: volume / 100,
  });
}

// What the dashboard's 5s poll actually wants: status + stats + service in a
// single connection instead of three. Falls back to the individual calls so a
// partial OBS failure degrades exactly as it did before.
async function getStatusWithService() {
  try {
    const [stream, stats, svc, musicMute, musicVolume] = await obsRequestMany([
      { requestType: 'GetStreamStatus' },
      { requestType: 'GetStats' },
      { requestType: 'GetStreamServiceSettings' },
      { requestType: 'GetInputMute', requestData: { inputName: MUSIC_INPUT_NAME } },
      { requestType: 'GetInputVolume', requestData: { inputName: MUSIC_INPUT_NAME } },
    ]);
    const status = shapeStatus(stream, stats);
    status.service = shapeService(svc);
    status.music = shapeMusicStatus(musicMute, musicVolume);
    return status;
  } catch (_) {
    const status = await getStatus();
    try { status.service = await getStreamService(); } catch (_) { /* best-effort */ }
    try { status.music = await getMusicStatus(); } catch (_) { /* best-effort */ }
    return status;
  }
}

function setStreamService(server, key) {
  return obsRequest('SetStreamServiceSettings', {
    streamServiceType: 'rtmp_custom',
    streamServiceSettings: { server, key, use_auth: false, bwtest: false },
  });
}

// Reload browser sources so freshly-deployed overlay/game changes appear on
// stream (same as the OBS "Refresh cache of current page" button). 'all'
// refreshes every browser source — note that restarts the music player's
// current track and reconnects the ai_licia pages.
async function refreshBrowserSources(scope) {
  let targets;
  if (scope === 'all') {
    const { inputs } = await obsRequest('GetInputList', { inputKind: 'browser_source' });
    targets = inputs.map((i) => i.inputName);
  } else {
    targets = ['overlay'];
  }
  const refreshed = [];
  for (const inputName of targets) {
    await obsRequest('PressInputPropertiesButton', { inputName, propertyName: 'refreshnocache' });
    refreshed.push(inputName);
  }
  return refreshed;
}

module.exports = {
  isConfigured,
  getStatus,
  getStatusWithService,
  startStream,
  stopStream,
  getStreamService,
  setStreamService,
  getMusicStatus,
  setMusicPlaying,
  setMusicVolume,
  refreshBrowserSources,
  obsRequest,
  obsRequestMany,
  _internal: { shapeMusicStatus },
};
