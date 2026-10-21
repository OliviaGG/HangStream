const EventEmitter = require('events');

let WebcastPushConnection;
try {
  // tiktok-live-connector v2.5+ is ESM-only and moved the old EventEmitter-style
  // client to the './legacy' entry point. The legacy class still emits the flat
  // 'chat' / 'gift' / 'streamEnd' payloads HangStream expects, so we keep using
  // it instead of rewriting every handler against the new typed API.
  // NOTE: this is a `require()` of an ESM module, which needs Node >= 20.19
  // (or 22.12+). See package.json "engines".
  WebcastPushConnection = require('tiktok-live-connector/legacy').WebcastPushConnection;
} catch (e) {
  console.warn('tiktok-live-connector not installed. TikTok live features will be disabled.');
}

class TikTokManager extends EventEmitter {
  constructor() {
    super();
    this.rooms = new Map();
  }

  watch(channel) {
    // FIX: emit error instead of silently returning when connector is missing
    if (!WebcastPushConnection) {
      this.emit('error', channel, new Error('tiktok-live-connector is not installed'));
      return;
    }

    if (this.rooms.has(channel)) return;

    // v2.5 requires an options object - the constructor reads properties off it
    // unconditionally, so `new WebcastPushConnection(channel)` now throws.
    const conn = new WebcastPushConnection(channel, {});
    const abort = new AbortController();

    // v2.5 reports a failed connect twice: once through the connection's
    // 'error' event and once as the rejected promise. Collapse them into a
    // single report so a dead channel does not spam the log.
    let errorReported = false;
    const reportError = (err) => {
      if (errorReported) return;
      errorReported = true;
      this.emit('error', channel, err);
    };

    conn.on('chat', (data) => {
      this.emit('chat', channel, data);
    });

    conn.on('gift', (data) => {
      this.emit('gift', channel, data);
    });

    // v2.5 renamed 'connect' to 'connected' and dropped 'streamStart'. A
    // successful connect only happens while the streamer is live, so 'connected'
    // now covers both.
    conn.on('connected', () => {
      errorReported = false;
      this.emit('connect', channel);
      this.emit('streamStart', channel);
    });

    // FIX: streamEnd now cleans up the room so it doesn't leak
    conn.on('streamEnd', () => {
      this.rooms.delete(channel);
      abort.abort();
      this.emit('streamEnd', channel);
    });

    // v2.5 emits 'error' as { info, exception }. Without a listener the
    // EventEmitter would throw and take the whole server down.
    conn.on('error', (err) => {
      reportError((err && err.exception) || err);
    });

    // FIX: remove dead entry from rooms on connect failure
    const start = async () => {
      try {
        // The streamer is usually not live yet when a channel is first watched,
        // and v2.5 refuses to connect unless they are. Wait for them to go live
        // instead of dropping the watch.
        await conn.waitUntilLive(60, abort.signal);
        await conn.connect();
      } catch (err) {
        if (abort.signal.aborted) return;
        this.rooms.delete(channel);
        reportError(err);
      }
    };
    start();

    this.rooms.set(channel, { conn, abort });
  }

  stop(channel) {
    const entry = this.rooms.get(channel);
    if (!entry) return;
    const { conn, abort } = entry;
    try { abort.abort(); } catch (e) {}
    // v2.5 made disconnect() async - swallow the rejection instead of leaving
    // an unhandled promise behind.
    try {
      const result = conn.disconnect();
      if (result && typeof result.catch === 'function') result.catch(() => {});
    } catch (e) {}
    this.rooms.delete(channel);
    this.emit('stopped', channel);
  }

  // FIX: added stopAll() for clean shutdown
  stopAll() {
    for (const channel of [...this.rooms.keys()]) {
      this.stop(channel);
    }
  }
}

// FIX: export both instance and class for testability
const instance = new TikTokManager();
module.exports = instance;
module.exports.TikTokManager = TikTokManager;
