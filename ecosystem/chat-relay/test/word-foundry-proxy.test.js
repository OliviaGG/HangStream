'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { VALID_ACTIONS, registerWordFoundryProxy } = require('../src/word-foundry-proxy');

function createApp() {
  const routes = [];
  return {
    routes,
    get(path, handler) { routes.push({ method: 'GET', path, handler }); },
    post(path, handler) { routes.push({ method: 'POST', path, handler }); }
  };
}

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function route(app, method, path) {
  return app.routes.find(item => item.method === method && item.path === path).handler;
}

test('Foundry proxy requires a signed-in portal session', async () => {
  const app = createApp();
  let called = false;
  registerWordFoundryProxy(app, {
    wordTycoonUrl: 'http://word-tycoon',
    getAccountId: async () => 'discord:1',
    wtFetch: async () => { called = true; }
  });
  const res = responseRecorder();
  await route(app, 'GET', '/api/word-foundry/state')({ session: {} }, res);
  assert.equal(res.body.authenticated, false);
  assert.equal(called, false);
});

test('Foundry proxy injects the session account and discards browser identity', async () => {
  const app = createApp();
  const calls = [];
  registerWordFoundryProxy(app, {
    wordTycoonUrl: 'http://word-tycoon',
    getAccountId: async () => 'discord:trusted',
    wtFetch: async (url, options) => {
      calls.push({ url, options });
      return { status: 200, json: async () => ({ ok: true, state: { inventory: [], words: [], market: [] } }) };
    }
  });
  const req = {
    session: { discordUser: { id: 'browser-session' } },
    body: {
      accountId: 'discord:attacker',
      userId: 'attacker',
      type: 'refresh-market',
      actionId: 'proxy-action-001',
      payload: { accountId: 'discord:attacker', cash: 999999 }
    }
  };
  const res = responseRecorder();
  await route(app, 'POST', '/api/word-foundry/action')(req, res);
  const forwarded = JSON.parse(calls[0].options.body);
  assert.equal(forwarded.accountId, 'discord:trusted');
  assert.equal('userId' in forwarded, false);
  assert.equal(forwarded.type, 'refresh-market');
  assert.deepEqual(forwarded.payload, req.body.payload);
  assert.equal(res.body.authenticated, true);
});

test('Foundry proxy rejects unknown actions before forwarding', async () => {
  const app = createApp();
  let called = false;
  registerWordFoundryProxy(app, {
    wordTycoonUrl: 'http://word-tycoon',
    getAccountId: async () => 'discord:trusted',
    wtFetch: async () => { called = true; }
  });
  const res = responseRecorder();
  await route(app, 'POST', '/api/word-foundry/action')({
    session: { discordUser: { id: 'browser-session' } },
    body: { type: 'mint-cash', actionId: 'proxy-action-002', payload: {} }
  }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(called, false);
});

test('Foundry proxy permits the server-authoritative manager action', () => {
  assert.equal(VALID_ACTIONS.has('hire-manager'), true);
});
