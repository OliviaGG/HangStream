/**
 * cloud-client.js — Socket.IO client to the wordgame.live /streamer-bridge
 * namespace. Receives this streamer's own TikTok chat feed (already
 * enriched server-side with cosmetics, linked Discord, etc.) and mirrors
 * it into the local bridge state + optionally downstream to /stream pages.
 *
 * Downstream emit is gated by `isPrimary(name)` so enabling both sources
 * simultaneously doesn't duplicate chat into game rooms.
 */

const { io: ioClient } = require('socket.io-client');
const state = require('./bridge-state');

class CloudClient {
  constructor({ url, token, localIo, isPrimary }) {
    this.url = url;
    this.token = token;
    this.localIo = localIo;
    this.isPrimary = typeof isPrimary === 'function' ? isPrimary : () => false;
    this.socket = null;
    this.closed = false;
    state.setUrl('cloud', url);
    state.setCloudIdentity({ tokenConfigured: !!token });
  }

  start() {
    if (!this.token) {
      state.setLastError('cloud', 'No bridge token configured');
      this.emitStatus();
      return;
    }
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    if (this.socket) {
      try { this.socket.disconnect(); } catch {}
      this.socket = null;
    }
    state.setConnected('cloud', false);
    this.emitStatus();
  }

  updateToken(token) {
    this.token = token || '';
    state.setCloudIdentity({ tokenConfigured: !!this.token });
    // Reconnect with new credentials if we're currently supposed to be live.
    const wasClosed = this.closed;
    this.stop();
    if (!wasClosed && this.token) { this.closed = false; this.start(); }
  }

  connect() {
    if (this.closed) return;
    state.setLastError('cloud', null);
    // Socket.IO namespace is selected by appending it to the URL path.
    const nsUrl = this.url.replace(/\/$/, '') + '/streamer-bridge';
    const socket = ioClient(nsUrl, {
      transports: ['websocket'],
      auth: { token: this.token },
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
      timeout: 10000,
      forceNew: true,
    });
    this.socket = socket;

    socket.on('connect', () => {
      state.setConnected('cloud', true);
      state.setLastError('cloud', null);
      this.emitStatus();
      this.pushStateUp();
      console.log(`[Bridge:Cloud] Connected to ${nsUrl}`);
    });

    socket.on('bridge-ready', (info) => {
      state.setCloudIdentity({
        streamerId: info?.streamerId || null,
        displayName: info?.displayName || null,
        tokenConfigured: true,
      });
      this.emitStatus();
      this.pushStateUp();
    });

    // Commands pushed down from the /streamer dashboard. The web UI POSTs
    // a config patch to Chat Relay → Chat Relay emits bridge-config here →
    // we apply the same logic as the local PUT /config, then push updated
    // state back up so the dashboard sees the change.
    socket.on('bridge-config', (patch) => {
      try { if (this.onConfigFromCloud) this.onConfigFromCloud(patch); } catch {}
    });

    socket.on('chat-message', (msg) => {
      state.incrementCount('cloud', 'raw');
      const preview = `${msg?.user?.displayName || msg?.user?.username || '?'}: ${msg?.message || ''}`;
      state.recordEvent('cloud', 'chatMessage', preview);
      if (this.isPrimary('cloud')) this.localIo.emit('chat-message', msg);
      this.emitStatus();
    });

    socket.on('engagement', (evt) => {
      state.incrementCount('cloud', 'raw');
      const user = evt?.user?.displayName || evt?.user?.username || '?';
      const preview = evt?.type === 'gift'
        ? `${user} sent ${evt?.diamondCount || 0} diamonds (${evt?.giftName || 'gift'})`
        : `${user} ${evt?.type || 'engagement'}`;
      state.recordEvent('cloud', 'engagement', preview);
      if (this.isPrimary('cloud')) this.localIo.emit('engagement', evt);
      this.emitStatus();
    });

    socket.on('disconnect', (reason) => {
      state.setConnected('cloud', false);
      if (reason !== 'io client disconnect') {
        state.setLastError('cloud', `Disconnected: ${reason}`);
      }
      this.emitStatus();
    });

    socket.on('connect_error', (err) => {
      state.setConnected('cloud', false);
      state.setLastError('cloud', err?.message || 'Cloud connection error');
      this.emitStatus();
      if (err?.message === 'invalid bridge token') {
        console.warn('[Bridge:Cloud] Invalid token — stopping reconnect attempts');
        this.stop();
      }
    });
  }

  emitStatus() {
    this.localIo.emit('bridge-status', state.snapshot());
    this.pushStateUp();
  }

  // Push our snapshot up to Chat Relay so the /streamer dashboard can
  // render it. Server caches the last snapshot per streamer; no-op if
  // the socket isn't connected yet.
  pushStateUp() {
    if (this.socket && this.socket.connected) {
      this.socket.emit('bridge-state', state.snapshot());
    }
  }
}

module.exports = { CloudClient };
