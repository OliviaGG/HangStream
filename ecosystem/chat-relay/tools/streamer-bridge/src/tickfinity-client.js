const WebSocket = require('ws');
const state = require('./bridge-state');
const { normalizeTickfinityEvent, eventPreview } = require('./normalize');

/**
 * TickfinityClient — local WebSocket client to TikFinity (ws://127.0.0.1:21213).
 *
 * Records events into the 'tikfinity' source of bridge-state. Downstream
 * emit to /stream game-page consumers is gated by `isPrimary('tikfinity')`
 * so running both sources at once doesn't double-send chat.
 */
class TickfinityClient {
  constructor({ url, io, isPrimary, reconnectMs = 2500, debugRaw = false }) {
    this.url = url;
    this.io = io;
    this.isPrimary = typeof isPrimary === 'function' ? isPrimary : () => true;
    this.reconnectMs = reconnectMs;
    this.debugRaw = debugRaw;
    this.ws = null;
    this.retryTimer = null;
    this.closed = false;
    state.setUrl('tikfinity', url);
  }

  start() {
    this.closed = false;
    this.connect();
  }

  stop() {
    this.closed = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    if (this.ws) {
      try { this.ws.close(); } catch {}
      this.ws = null;
    }
    state.setConnected('tikfinity', false);
    this.emitStatus();
  }

  connect() {
    if (this.closed) return;
    state.setLastError('tikfinity', null);
    const ws = new WebSocket(this.url);
    this.ws = ws;

    ws.on('open', () => {
      state.setConnected('tikfinity', true);
      state.setLastError('tikfinity', null);
      this.emitStatus();
      console.log(`[Bridge:TikFinity] Connected to ${this.url}`);
    });

    ws.on('message', (buffer) => {
      let raw;
      try {
        raw = JSON.parse(String(buffer));
      } catch (error) {
        state.setLastError('tikfinity', `Invalid JSON from TikFinity: ${error.message}`);
        this.emitStatus();
        return;
      }

      state.incrementCount('tikfinity', 'raw');
      // Keep a small ring buffer of the last raw envelopes so /raw-events
      // can surface them to the user for diagnosis when classification
      // goes sideways.
      TickfinityClient.lastRawEvents.push({ at: Date.now(), raw });
      if (TickfinityClient.lastRawEvents.length > 20) TickfinityClient.lastRawEvents.shift();

      const normalized = normalizeTickfinityEvent(raw);
      if (!normalized) return; // ignored event (config, ping, etc.)

      // Unknown events: record AND forward on 'raw-event'. Never silently
      // drop — we'd rather the consumer decide what to do with it.
      state.recordEvent('tikfinity', normalized.kind, eventPreview(normalized));
      if (this.isPrimary('tikfinity')) {
        this.io.emit(normalized.channel, normalized.payload);
      }
      this.emitStatus();
    });

    ws.on('close', () => {
      state.setConnected('tikfinity', false);
      this.emitStatus();
      if (!this.closed) this.scheduleReconnect();
    });

    ws.on('error', (error) => {
      state.setConnected('tikfinity', false);
      state.setLastError('tikfinity', error.message || 'TikFinity connection error');
      this.emitStatus();
    });
  }

  scheduleReconnect() {
    if (this.retryTimer || this.closed) return;
    console.log(`[Bridge:TikFinity] Disconnected; retrying in ${this.reconnectMs}ms`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, this.reconnectMs);
  }

  emitStatus() {
    this.io.emit('bridge-status', state.snapshot());
  }
}

TickfinityClient.lastRawEvents = [];

module.exports = { TickfinityClient };
