// ===== Relay Bridge =====
// Syncs chat messages BIDIRECTIONALLY between local and remote Relay Broadcasts.
// Activated only when BRIDGE_RELAY_URL is set in .env.
//
// How it works:
//   1. Connects to LOCAL relay as a Socket.IO client (receives all events)
//   2. Connects to REMOTE relay as a Socket.IO client (receives all events)
//   3. Forwards chat-message, engagement, platform-status LOCAL → REMOTE
//   4. Forwards chat-message, engagement, platform-status REMOTE → LOCAL
//   5. Both relays re-broadcast to their connected apps
//
// Loop prevention:
//   - All forwarded messages are tagged with _bridged: true
//   - Bridge skips any message already tagged
//   - Server uses socket.broadcast.emit (sender doesn't receive back)

const { io: ioClient } = require('socket.io-client');

const EVENTS_TO_FORWARD = ['chat-message', 'engagement', 'platform-status'];

let localSocket = null;
let remoteSocket = null;
let stats = { forwarded: 0, received: 0, errors: 0, lastForward: null, lastReceived: null };

function initialize() {
  const remoteUrl = process.env.BRIDGE_RELAY_URL;
  if (!remoteUrl) {
    console.log('[Bridge] BRIDGE_RELAY_URL not set, bridge disabled');
    return;
  }

  // Detect self-referencing bridge (remote URL points back to this server)
  const localPort = process.env.PORT || 3000;
  const localUrl = `http://localhost:${localPort}`;
  try {
    const remoteHostname = new URL(remoteUrl).hostname;
    const os = require('os');
    const localIPs = new Set(['localhost', '127.0.0.1', '::1']);
    for (const ifaces of Object.values(os.networkInterfaces())) {
      for (const iface of ifaces) localIPs.add(iface.address);
    }
    if (localIPs.has(remoteHostname)) {
      console.log(`[Bridge] BRIDGE_RELAY_URL points to this server (${remoteHostname}) — self-guard activated, bridge disabled (expected on production; PC bridge connects inbound instead)`);
      return;
    }
  } catch (e) { /* URL parse failed, continue anyway */ }

  const bridgeSecret = process.env.BRIDGE_SECRET || '';

  console.log(`[Bridge] Initializing: local=${localUrl} -> remote=${remoteUrl}`);

  // --- Connect to LOCAL relay as a client ---
  localSocket = ioClient(localUrl, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity
  });

  localSocket.on('connect', () => {
    console.log('[Bridge] Connected to LOCAL relay');
  });

  localSocket.on('disconnect', (reason) => {
    console.log(`[Bridge] Disconnected from LOCAL relay: ${reason}`);
  });

  localSocket.on('connect_error', (err) => {
    console.log(`[Bridge] Local connection error: ${err.message}`);
  });

  // --- Connect to REMOTE relay as a client ---
  remoteSocket = ioClient(remoteUrl, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 30000,
    reconnectionAttempts: Infinity,
    auth: { bridgeSecret }
  });

  remoteSocket.on('connect', () => {
    console.log('[Bridge] Connected to REMOTE relay');
    // Register as a bridge app on the remote relay
    remoteSocket.emit('app-register', {
      id: 'relay-bridge',
      name: 'Relay Bridge (PC)',
      port: 0,
      apiKey: process.env.GAME_API_SECRET
    }, (ack) => {
      if (ack?.success) console.log('[Bridge] Registered with remote relay');
    });
  });

  remoteSocket.on('disconnect', (reason) => {
    console.log(`[Bridge] Disconnected from REMOTE relay: ${reason}`);
  });

  remoteSocket.on('connect_error', (err) => {
    // Only log periodically to avoid spam
    if (!remoteSocket._lastErrLog || Date.now() - remoteSocket._lastErrLog > 30000) {
      console.log(`[Bridge] Remote connection error: ${err.message}`);
      remoteSocket._lastErrLog = Date.now();
    }
  });

  // --- Forward events from LOCAL → REMOTE ---
  for (const eventName of EVENTS_TO_FORWARD) {
    localSocket.on(eventName, (payload) => {
      // Skip messages that were already bridged (loop prevention)
      if (payload && payload._bridged) return;

      // Skip system messages — command responses are local only
      if (eventName === 'chat-message' && payload && payload.isSystem) return;

      // Don't forward if remote is disconnected
      if (!remoteSocket || !remoteSocket.connected) {
        stats.errors++;
        return;
      }

      try {
        remoteSocket.emit('relay-bridge', {
          type: eventName,
          payload: { ...payload, _bridged: true },
          secret: bridgeSecret
        });
        stats.forwarded++;
        stats.lastForward = Date.now();
      } catch (err) {
        console.error(`[Bridge] Forward error for ${eventName}:`, err.message);
        stats.errors++;
      }
    });
  }

  // --- Forward events from REMOTE → LOCAL ---
  for (const eventName of EVENTS_TO_FORWARD) {
    remoteSocket.on(eventName, (payload) => {
      // Skip messages that were already bridged (loop prevention)
      if (payload && payload._bridged) return;

      // Skip system messages
      if (eventName === 'chat-message' && payload && payload.isSystem) return;

      // Don't forward if local is disconnected
      if (!localSocket || !localSocket.connected) {
        stats.errors++;
        return;
      }

      try {
        localSocket.emit('relay-bridge', {
          type: eventName,
          payload: { ...payload, _bridged: true },
          secret: bridgeSecret
        });
        stats.received++;
        stats.lastReceived = Date.now();
      } catch (err) {
        console.error(`[Bridge] Reverse forward error for ${eventName}:`, err.message);
        stats.errors++;
      }
    });
  }

  console.log('[Bridge] Forwarding events (bidirectional):', EVENTS_TO_FORWARD.join(', '));
}

function getStats() {
  return {
    enabled: !!process.env.BRIDGE_RELAY_URL,
    localConnected: !!(localSocket && localSocket.connected),
    remoteConnected: !!(remoteSocket && remoteSocket.connected),
    remoteUrl: process.env.BRIDGE_RELAY_URL || null,
    ...stats
  };
}

function shutdown() {
  if (localSocket) { localSocket.disconnect(); localSocket = null; }
  if (remoteSocket) { remoteSocket.disconnect(); remoteSocket = null; }
  console.log('[Bridge] Shut down');
}

module.exports = { initialize, getStats, shutdown };
