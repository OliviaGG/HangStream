// ===== Discord OAuth2 Module =====
// Handles the OAuth2 authorization code flow for user portal login.
// Pattern follows the existing spotify.js module (raw fetch, no passport).

const crypto = require('crypto');

const DISCORD_API = 'https://discord.com/api/v10';
const SCOPES = 'identify connections email';

let config = { clientId: '', clientSecret: '', redirectUri: '' };

function initialize(cfg) {
  config = cfg;
  if (config.clientId) {
    console.log('[Discord OAuth] Initialized (client ID: ' + config.clientId.slice(0, 6) + '...)');
  } else {
    console.log('[Discord OAuth] Not configured (DISCORD_CLIENT_ID missing)');
  }
}

function isConfigured() {
  return !!(config.clientId && config.clientSecret && config.redirectUri);
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: config.clientId,
    scope: SCOPES,
    redirect_uri: config.redirectUri,
    state,
    prompt: 'consent'
  });
  return `https://discord.com/oauth2/authorize?${params}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: config.redirectUri
  });

  const res = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': 'Basic ' + Buffer.from(
        config.clientId + ':' + config.clientSecret
      ).toString('base64')
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }
  return res.json();
}

async function getUser(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Discord user (${res.status})`);
  }
  return res.json();
}

async function getConnections(accessToken) {
  const res = await fetch(`${DISCORD_API}/users/@me/connections`, {
    headers: { 'Authorization': `Bearer ${accessToken}` }
  });
  if (!res.ok) return [];
  return res.json();
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { initialize, isConfigured, getAuthUrl, exchangeCode, getUser, getConnections, generateState };
