const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const http = require('node:http');
const { Server } = require('socket.io');

const { createRelayClient } = require('../src/game-shared.js');

class FakeSocket extends EventEmitter {
  constructor() {
    super();
    this.outbound = [];
    this.connected = false;
  }

  emit(event, ...args) {
    this.outbound.push({ event, args });
    const ack = args[args.length - 1];
    if (event === 'app-register' && typeof ack === 'function') {
      ack({ success: true });
    }
    return true;
  }

  trigger(event, ...args) {
    if (event === 'connect') this.connected = true;
    if (event === 'disconnect') this.connected = false;
    return super.emit(event, ...args);
  }

  disconnect() {
    this.trigger('disconnect', 'client disconnect');
  }
}

function createFakeFactory(capture) {
  return (url, options) => {
    capture.url = url;
    capture.options = options;
    capture.socket = new FakeSocket();
    return capture.socket;
  };
}

test('factory returns a socket-like Socket.IO client instance', async (t) => {
  const server = http.createServer();
  const io = new Server(server);
  await new Promise((resolve) => server.listen(0, resolve));
  const address = server.address();
  const relayUrl = `http://127.0.0.1:${address.port}`;

  await t.test('connects with default client factory', async () => {
    const socket = createRelayClient({ id: 'test', name: 'Test Game', port: 9999, relayUrl });
    await new Promise((resolve, reject) => {
      socket.on('connect', resolve);
      socket.on('connect_error', reject);
    });
    assert.equal(typeof socket.on, 'function');
    assert.equal(typeof socket.emit, 'function');
    assert.equal(typeof socket.disconnect, 'function');
    assert.ok(socket.io);
    socket.disconnect();
  });

  io.close();
  server.close();
});

test('app-register emitted on connect with correct payload', () => {
  const capture = {};
  const socket = createRelayClient({
    id: 'wordle',
    name: 'Wordle',
    port: 3003,
    apiSecret: 'secret',
    relayUrl: 'http://relay.test',
    clientFactory: createFakeFactory(capture)
  });

  capture.socket.trigger('connect');

  const registration = capture.socket.outbound.find((entry) => entry.event === 'app-register');
  assert.ok(registration);
  assert.deepEqual(registration.args[0], {
    id: 'wordle',
    name: 'Wordle',
    port: 3003,
    apiKey: 'secret'
  });
  socket.disconnect();
});

test('default reconnection config applied when not overridden', () => {
  const capture = {};
  const socket = createRelayClient({
    id: 'defaults',
    name: 'Defaults',
    port: 1,
    clientFactory: createFakeFactory(capture)
  });

  assert.equal(capture.options.reconnection, true);
  assert.equal(capture.options.reconnectionDelay, 2000);
  assert.equal(capture.options.reconnectionAttempts, Infinity);
  assert.equal(capture.options.reconnectionDelayMax, undefined);
  socket.disconnect();
});

test('custom reconnection config respected', () => {
  const capture = {};
  const socket = createRelayClient({
    id: 'custom',
    name: 'Custom',
    port: 2,
    reconnectionDelay: 1500,
    reconnectionDelayMax: 6000,
    reconnectionAttempts: 9,
    timeout: 5000,
    clientFactory: createFakeFactory(capture)
  });

  assert.equal(capture.options.reconnectionDelay, 1500);
  assert.equal(capture.options.reconnectionDelayMax, 6000);
  assert.equal(capture.options.reconnectionAttempts, 9);
  assert.equal(capture.options.timeout, 5000);
  socket.disconnect();
});

test('onChat handler called when chat-message fires', () => {
  const capture = {};
  let received = null;
  const socket = createRelayClient({
    id: 'chat',
    name: 'Chat',
    port: 3,
    clientFactory: createFakeFactory(capture)
  }, {
    onChat: (data) => {
      received = data;
    }
  });

  capture.socket.trigger('chat-message', { message: 'hello' });
  assert.deepEqual(received, { message: 'hello' });
  socket.disconnect();
});

test('onCosmeticsUpdated handler called', () => {
  const capture = {};
  let received = null;
  const socket = createRelayClient({
    id: 'cosmetics',
    name: 'Cosmetics',
    port: 4,
    clientFactory: createFakeFactory(capture)
  }, {
    onCosmeticsUpdated: (data) => {
      received = data;
    }
  });

  capture.socket.trigger('cosmetics-updated', { platform: 'tiktok' });
  assert.deepEqual(received, { platform: 'tiktok' });
  socket.disconnect();
});

test('onFrenzyUpdate handler called', () => {
  const capture = {};
  let received = null;
  const socket = createRelayClient({
    id: 'frenzy',
    name: 'Frenzy',
    port: 5,
    clientFactory: createFakeFactory(capture)
  }, {
    onFrenzyUpdate: (data) => {
      received = data;
    }
  });

  capture.socket.trigger('frenzy-update', { multiplier: 2 });
  assert.deepEqual(received, { multiplier: 2 });
  socket.disconnect();
});

test('onActivateDaily only wired when handler provided', () => {
  const captureA = {};
  const captureB = {};
  let activateCount = 0;

  const socketA = createRelayClient({
    id: 'daily-a',
    name: 'Daily A',
    port: 6,
    clientFactory: createFakeFactory(captureA)
  }, {
    onActivateDaily: () => {
      activateCount += 1;
    }
  });

  const socketB = createRelayClient({
    id: 'daily-b',
    name: 'Daily B',
    port: 7,
    clientFactory: createFakeFactory(captureB)
  });

  captureA.socket.trigger('activate-daily');
  captureB.socket.trigger('activate-daily');
  assert.equal(activateCount, 1);
  socketA.disconnect();
  socketB.disconnect();
});

test('connect_error logging is sparse', () => {
  const capture = {};
  const messages = [];
  const originalLog = console.log;
  console.log = (...args) => {
    messages.push(args.join(' '));
  };

  try {
    const socket = createRelayClient({
      id: 'errors',
      name: 'Errors',
      port: 8,
      clientFactory: createFakeFactory(capture)
    });

    capture.socket.trigger('connect_error', new Error('boom'));
    capture.socket.trigger('connect_error', new Error('boom'));
    assert.equal(messages.filter((line) => line.includes('Chat Relay connection error')).length, 1);

    capture.socket.trigger('connect');
    capture.socket.trigger('connect_error', new Error('boom-again'));
    assert.equal(messages.filter((line) => line.includes('Chat Relay connection error')).length, 2);
    socket.disconnect();
  } finally {
    console.log = originalLog;
  }
});

test('missing handlers do not throw', () => {
  const capture = {};
  const socket = createRelayClient({
    id: 'missing',
    name: 'Missing',
    port: 9,
    clientFactory: createFakeFactory(capture)
  });

  assert.doesNotThrow(() => {
    capture.socket.trigger('chat-message', { message: 'hello' });
    capture.socket.trigger('cosmetics-updated', { equipped: {} });
    capture.socket.trigger('frenzy-update', { multiplier: 2 });
    capture.socket.trigger('activate-daily');
    capture.socket.trigger('engagement', { type: 'like' });
  });

  socket.disconnect();
});
