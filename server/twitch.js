const EventEmitter = require('events');
let tmi;
try {
  tmi = require('tmi.js');
} catch (e) {
  console.warn('tmi.js not installed. Twitch features will be disabled.');
}

class TwitchManager extends EventEmitter {
  constructor() {
    super();
    this.watched = new Set();
    this.client = null;
    this._initClient();
  }

  _initClient() {
    if (!tmi) return;
    // use a single anonymous client that joins channels dynamically
    this.client = new tmi.Client({ connection: { reconnect: true, secure: true } });
    this.client.on('message', (channel, userstate, message, self) => {
      const chan = channel.replace(/^#/, '');
      this.emit('chat', chan, { user: userstate['display-name'] || userstate['username'] || userstate['user-id'], message, raw: userstate });
    });
    this.client.on('connected', (addr, port) => { /*noop*/ });
    this.client.connect().catch(() => {});
  }

  async watch(channel) {
    if (!tmi || !this.client) return;
    const chan = channel.toLowerCase();
    if (this.watched.has(chan)) return;
    try {
      await this.client.join(chan);
      this.watched.add(chan);
      this.emit('started', chan);
    } catch (e) {
      console.warn('twitch join failed', chan, e);
    }
  }

  async stop(channel) {
    if (!tmi || !this.client) return;
    const chan = channel.toLowerCase();
    if (!this.watched.has(chan)) return;
    try {
      await this.client.part(chan);
    } catch (e) {}
    this.watched.delete(chan);
    this.emit('stopped', chan);
  }
}

module.exports = new TwitchManager();
