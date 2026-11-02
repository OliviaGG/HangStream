const { io: ioClient } = require('socket.io-client');
const config = require('./config');

let socket = null;
let registered = false;
let registrationSerial = 0;

function initialize() {
  const url = config.CHAT_RELAY_URL;
  console.log(`[Relay] Connecting to Chat Relay at ${url}...`);

  socket = ioClient(url, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity
  });

  socket.on('connect', () => {
    registered = false;
    const serial = ++registrationSerial;
    console.log('[Relay] Connected to Chat Relay');
    // Register as an app so the dashboard shows us as connected
    socket.emit('app-register', {
      id: 'discord-bot',
      name: 'Discord Bot',
      port: 3026,
      apiKey: process.env.GAME_API_SECRET,
      commandKey: process.env.BOT_COMMAND_SECRET
    }, (ack) => {
      if (serial !== registrationSerial || !socket.connected) return;
      registered = !!ack?.success && ack.id === 'discord-bot';
      if (registered) {
        console.log('[Relay] Registered with Chat Relay as discord-bot');
      } else {
        console.warn('[Relay] Command registration rejected; commands remain unavailable');
      }
    });
  });

  socket.on('disconnect', (reason) => {
    registered = false;
    registrationSerial++;
    console.log(`[Relay] Disconnected: ${reason}`);
  });

  socket.on('connect_error', (err) => {
    console.log(`[Relay] Connection error: ${err.message}`);
  });

  return socket;
}

/**
 * Send a game command through the Chat Relay pipeline.
 * Uses the 'mobile-message' event which the Chat Relay already handles.
 */
function sendCommand(userId, username, displayName, text) {
  if (!socket || !socket.connected || !registered) {
    return false;
  }

  socket.emit('mobile-message', {
    user: {
      id: `discord_${userId}`,
      username: username,
      displayName: displayName
    },
    message: text
  });

  return true;
}

function isConnected() {
  return !!socket && socket.connected && registered;
}

function disconnect() {
  registered = false;
  registrationSerial++;
  if (socket) {
    socket.disconnect();
  }
}

module.exports = { initialize, sendCommand, isConnected, disconnect };
