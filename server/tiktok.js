const EventEmitter = require('events');

let WebcastPushConnection;
try {
  WebcastPushConnection = require('tiktok-live-connector').WebcastPushConnection;
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

    const conn = new WebcastPushConnection(channel);

    conn.on('chat', (data) => {
      this.emit('chat', channel, data);
    });

    conn.on('gift', (data) => {
      this.emit('gift', channel, data);
    });

    conn.on('connect', () => this.emit('connect', channel));

    conn.on('streamStart', () => this.emit('streamStart', channel));

    // FIX: streamEnd now cleans up the room so it doesn't leak
    conn.on('streamEnd', () => {
      this.rooms.delete(channel);
      this.emit('streamEnd', channel);
    });

    // FIX: remove dead entry from rooms on connect failure
    conn.connect().catch(err => {
      this.rooms.delete(channel);
      this.emit('error', channel, err);
    });

    this.rooms.set(channel, conn);
  }

  stop(channel) {
    const conn = this.rooms.get(channel);
    if (!conn) return;
    try { conn.disconnect(); } catch (e) {}
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