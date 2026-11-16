// ===== Google OAuth2 Module =====
// Handles the OAuth2 authorization code flow for user portal login.
// Mirrors github-oauth.js pattern (raw fetch, no passport).

const crypto = require('crypto');

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USER_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';
const SCOPES = 'openid email profile';

let config = { clientId: '', clientSecret: '', redirectUri: '' };

function initialize(cfg) {
  config = cfg;
  if (config.clientId) {
    console.log('[Google OAuth] Initialized (client ID: ' + config.clientId.slice(0, 8) + '...)');
  } else {
    console.log('[Google OAuth] Not configured (GOOGLE_CLIENT_ID missing)');
  }
}

function isConfigured() {
  return !!(config.clientId && config.clientSecret && config.redirectUri);
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: SCOPES,
    state,
    access_type: 'online',
    prompt: 'select_account',
    include_granted_scopes: 'true'
  });
  return `${GOOGLE_AUTH_URL}?${params}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri,
    grant_type: 'authorization_code'
  });

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json'
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (data.error) {
    throw new Error(`Token exchange error: ${data.error_description || data.error}`);
  }
  return data;
}

async function getUser(accessToken) {
  const res = await fetch(GOOGLE_USER_URL, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch Google user (${res.status})`);
  }
  return res.json();
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { initialize, isConfigured, getAuthUrl, exchangeCode, getUser, generateState };
