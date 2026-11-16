// ===== GitHub OAuth2 Module =====
// Handles the OAuth2 authorization code flow for user portal login.
// Mirrors discord-oauth.js pattern (raw fetch, no passport).

const crypto = require('crypto');

const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize';
const GITHUB_TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GITHUB_USER_URL = 'https://api.github.com/user';
const SCOPES = 'read:user user:email';

let config = { clientId: '', clientSecret: '', redirectUri: '' };

function initialize(cfg) {
  config = cfg;
  if (config.clientId) {
    console.log('[GitHub OAuth] Initialized (client ID: ' + config.clientId.slice(0, 6) + '...)');
  } else {
    console.log('[GitHub OAuth] Not configured (GITHUB_CLIENT_ID missing)');
  }
}

function isConfigured() {
  return !!(config.clientId && config.clientSecret && config.redirectUri);
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_id: config.clientId,
    scope: SCOPES,
    redirect_uri: config.redirectUri,
    state
  });
  return `${GITHUB_AUTH_URL}?${params}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
    redirect_uri: config.redirectUri
  });

  const res = await fetch(GITHUB_TOKEN_URL, {
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
  const res = await fetch(GITHUB_USER_URL, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'User-Agent': 'WordTycoon-Portal'
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch GitHub user (${res.status})`);
  }
  return res.json();
}

// Fetch the user's primary verified email. /user.email is null when the user
// has email privacy enabled, so we hit /user/emails (requires user:email scope,
// already in SCOPES) and pick the primary+verified one.
async function getPrimaryVerifiedEmail(accessToken) {
  const res = await fetch('https://api.github.com/user/emails', {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Accept': 'application/json',
      'User-Agent': 'WordTycoon-Portal'
    }
  });
  if (!res.ok) return null;
  const emails = await res.json().catch(() => []);
  if (!Array.isArray(emails)) return null;
  const primary = emails.find(e => e && e.primary && e.verified);
  if (primary?.email) return primary.email;
  const anyVerified = emails.find(e => e && e.verified);
  return anyVerified?.email || null;
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { initialize, isConfigured, getAuthUrl, exchangeCode, getUser, getPrimaryVerifiedEmail, generateState };
