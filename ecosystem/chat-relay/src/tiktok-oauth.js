// ===== TikTok OAuth2 Module =====
// Handles the OAuth2 authorization code flow for TikTok Login Kit v2.
// Mirrors github-oauth.js pattern (raw fetch, no passport).

const crypto = require('crypto');

const TIKTOK_AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const TIKTOK_TOKEN_URL = 'https://open.tiktokapis.com/v2/oauth/token/';
const TIKTOK_USER_URL = 'https://open.tiktokapis.com/v2/user/info/';
const SCOPES = 'user.info.basic,user.info.profile';

let config = { clientKey: '', clientSecret: '', redirectUri: '' };

function initialize(cfg) {
  config = cfg;
  if (config.clientKey) {
    console.log('[TikTok OAuth] Initialized (client key: ' + config.clientKey.slice(0, 6) + '...)');
  } else {
    console.log('[TikTok OAuth] Not configured (TIKTOK_CLIENT_KEY missing)');
  }
}

function isConfigured() {
  return !!(config.clientKey && config.clientSecret && config.redirectUri);
}

function getAuthUrl(state) {
  const params = new URLSearchParams({
    client_key: config.clientKey,
    scope: SCOPES,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    state
  });
  return `${TIKTOK_AUTH_URL}?${params}`;
}

async function exchangeCode(code) {
  const body = new URLSearchParams({
    client_key: config.clientKey,
    client_secret: config.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: config.redirectUri
  });

  const res = await fetch(TIKTOK_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`TikTok token exchange failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  if (data.error || (data.data && data.data.error_code)) {
    const errMsg = data.error_description || data.data?.description || data.error || 'Unknown error';
    throw new Error(`TikTok token error: ${errMsg}`);
  }
  // TikTok v2 wraps token in data.data
  return data.data || data;
}

async function getUser(accessToken) {
  const params = new URLSearchParams({
    fields: 'open_id,display_name,avatar_url,username'
  });
  const res = await fetch(`${TIKTOK_USER_URL}?${params}`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch TikTok user (${res.status})`);
  }
  const data = await res.json();
  if (data.error && data.error.code !== 'ok') {
    throw new Error(`TikTok user API error: ${data.error.message || data.error.code}`);
  }
  // TikTok v2 wraps user in data.data.user
  return data.data?.user || data.data || data;
}

function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

module.exports = { initialize, isConfigured, getAuthUrl, exchangeCode, getUser, generateState };
