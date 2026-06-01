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
    if (!WebcastPushConnection) return;
    if (this.rooms.has(channel)) return;

    const conn = new WebcastPushConnection(channel);

    conn.on('chat', (data) => {
      // normalize and forward
      this.emit('chat', channel, data);
    });

    // some versions emit like this; forward generic events if available
    conn.on('streamStart', () => this.emit('streamStart', channel));
    conn.on('streamEnd', () => this.emit('streamEnd', channel));
    conn.on('connect', () => this.emit('connect', channel));

    conn.connect().catch(err => {
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
}

module.exports = new TikTokManager();
