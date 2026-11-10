const db = require('./db');
const crypto = require('crypto');

// In-memory cache for synchronous access
let tokensCache = null;

// node-sqlite3 Statement reads without a callback return the Statement
// object (the query runs async and results are discarded), so synchronous
// SELECTs silently yield nothing. Hot paths — chat guesses, /viewer/is-donor,
// difficulty gating — need real sync reads, so memberships and donations are
// kept in memory and hydrated once the schema is ready. Writes go through
// saveDonations/upsertMembership which update the cache immediately.
const membershipsCache = new Map(); // viewer_id -> membership row
let membershipsHydrated = false;
const donationsCache = [];
let donationsHydrated = false;

function rowToDonation(row) {
  return {
    id: row.id,
    viewer_id: row.viewer_id,
    viewer_name: row.viewer_name,
    amount: row.amount,
    currency: row.currency,
    status: row.status,
    createdAt: row.created_at
      ? new Date(row.created_at * 1000).toISOString()
      : (row.createdAt || new Date().toISOString()),
    sessionId: row.session_id || row.sessionId || null,
  };
}

function hydrateCaches() {
  db.all('SELECT * FROM memberships', (err, rows) => {
    if (err) { console.error('Error hydrating memberships cache:', err.message); return; }
    for (const row of rows || []) {
      membershipsCache.set(row.viewer_id, {
        viewer_id: row.viewer_id,
        tier: row.tier || 'free',
        status: row.status || 'inactive',
        stripe_customer_id: row.stripe_customer_id || null,
        stripe_subscription_id: row.stripe_subscription_id || null,
        current_period_start: row.current_period_start || null,
        current_period_end: row.current_period_end || null,
        cancel_at_period_end: !!row.cancel_at_period_end,
        updated_at: row.updated_at || null,
      });
    }
    membershipsHydrated = true;
  });
  db.all('SELECT * FROM donations ORDER BY created_at DESC', (err, rows) => {
    if (err) { console.error('Error hydrating donations cache:', err.message); return; }
    donationsCache.length = 0;
    for (const row of rows || []) donationsCache.push(rowToDonation(row));
    donationsHydrated = true;
  });
}

db.ready.then(hydrateCaches).catch((e) => console.error('Cache hydration failed:', e.message));

function ensureOAuthTokensTable() {
  db.run(`CREATE TABLE IF NOT EXISTS oauth_tokens (
    provider TEXT PRIMARY KEY,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at INTEGER
  )`);
}

function getTokenEncryptionKey() {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || '';
  if (!secret) {
    console.warn('TOKEN_ENCRYPTION_KEY is not set; OAuth tokens are being stored in plaintext.');
    return null;
  }
  return crypto.createHash('sha256').update(String(secret)).digest();
}

function encryptTokenPayload(value) {
  const key = getTokenEncryptionKey();
  if (!key) {
    return typeof value === 'string' ? value : JSON.stringify(value);
  }

  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const payload = typeof value === 'string' ? value : JSON.stringify(value);
  const encrypted = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:${Buffer.concat([iv, tag, encrypted]).toString('base64')}`;
}

function decryptTokenPayload(value) {
  if (typeof value !== 'string' || !value.startsWith('enc:')) {
    return value;
  }

  const key = getTokenEncryptionKey();
  if (!key) {
    return value;
  }

  try {
    const raw = Buffer.from(value.slice(4), 'base64');
    if (raw.length < 32) {
      return value;
    }
    const iv = raw.subarray(0, 16);
    const tag = raw.subarray(16, 32);
    const encrypted = raw.subarray(32);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  } catch (err) {
    console.warn('Failed to decrypt saved OAuth token payload:', err.message);
    return value;
  }
}

function normalizeStoredTokenEntry(row) {
  if (!row || typeof row !== 'object') return {};

  const decrypted = decryptTokenPayload(row.access_token);
  try {
    const parsed = JSON.parse(decrypted);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (err) {
    // fall through to legacy token row shape below
  }

  return {
    access_token: row.access_token,
    refresh_token: row.refresh_token,
    expires_at: row.expires_at,
    provider: row.provider,
    created: row.created || null,
    platform: row.platform || row.provider || null,
  };
}

// OAuth tokens (with encryption)
function loadTokens(callback) {
  ensureOAuthTokensTable();

  // If called without callback, return cached value (for backward compatibility)
  if (!callback) {
    if (tokensCache !== null) {
      return tokensCache;
    }
    // Cache not yet loaded, load synchronously
    return loadTokensSync();
  }

  // Async version with callback
  db.all('SELECT * FROM oauth_tokens', (err, rows) => {
    if (err) {
      console.error('Error loading tokens:', err);
      callback({});
      return;
    }

    const tokens = {};
    for (const row of rows) {
      const entry = normalizeStoredTokenEntry(row);
      tokens[row.provider] = entry;
    }

    tokensCache = tokens;
    callback(tokens);
  });
}

function loadTokensSync() {
  if (tokensCache !== null) {
    return tokensCache;
  }

  try {
    ensureOAuthTokensTable();
    const rows = db.prepare('SELECT * FROM oauth_tokens').all();
    const tokens = {};
    if (Array.isArray(rows)) {
      for (const row of rows) {
        const entry = normalizeStoredTokenEntry(row);
        tokens[row.provider] = entry;
      }
    }
    tokensCache = tokens;
    return tokens;
  } catch (err) {
    console.error('Error loading tokens synchronously:', err);
    return {};
  }
}

function saveTokens(tokens) {
  ensureOAuthTokensTable();
  tokensCache = tokens || {};
  const stmt = db.prepare('INSERT OR REPLACE INTO oauth_tokens (provider, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)');

  for (const [provider, data] of Object.entries(tokens || {})) {
    const entry = data && typeof data === 'object' ? data : { access_token: data };
    const expiresAt = Number(entry.expires_at ?? (entry.resp && entry.resp.expires_in ? (entry.created || Date.now()) + (Number(entry.resp.expires_in) * 1000) : null));
    const encryptedPayload = encryptTokenPayload(entry);
    stmt.run(
      provider,
      encryptedPayload,
      entry.refresh_token || (entry.resp && entry.resp.refresh_token) || null,
      Number.isFinite(expiresAt) ? expiresAt : null
    );
  }

  stmt.finalize();
  console.log('Tokens saved to database');
}

function saveTokensAsync(tokens) {
  return new Promise((resolve, reject) => {
    ensureOAuthTokensTable();
    tokensCache = tokens || {};
    const stmt = db.prepare('INSERT OR REPLACE INTO oauth_tokens (provider, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)');
    const promises = [];

    for (const [provider, data] of Object.entries(tokens || {})) {
      const entry = data && typeof data === 'object' ? data : { access_token: data };
      const expiresAt = Number(entry.expires_at ?? (entry.resp && entry.resp.expires_in ? (entry.created || Date.now()) + (Number(entry.resp.expires_in) * 1000) : null));
      const encryptedPayload = encryptTokenPayload(entry);
      promises.push(
        new Promise((res, rej) => {
          stmt.run(
            provider,
            encryptedPayload,
            entry.refresh_token || (entry.resp && entry.resp.refresh_token) || null,
            Number.isFinite(expiresAt) ? expiresAt : null,
            (err) => err ? rej(err) : res()
          );
        })
      );
    }

    stmt.finalize();
    Promise.all(promises)
      .then(() => {
        tokensCache = tokens;
        console.log('Tokens saved to database');
        resolve();
      })
      .catch(reject);
  });
}

// Music queue
function loadMusicQueue(callback) {
  if (!callback) {
    try {
      const rows = db.prepare('SELECT * FROM music_queue ORDER BY added_at ASC').all() || [];
      return {
        items: Array.isArray(rows) ? rows.map(row => ({
          requester_name: row.requester_name,
          song_name: row.song_name,
          song_url: row.song_url,
          added_at: row.added_at
        })) : []
      };
    } catch (err) {
      console.error('Error loading music queue synchronously:', err);
      return { items: [] };
    }
  }

  db.all('SELECT * FROM music_queue ORDER BY added_at ASC', (err, rows) => {
    if (err) {
      console.error('Error loading music queue:', err);
      callback({ items: [] });
      return;
    }

    const queue = {
      items: rows.map(row => ({
        requester_name: row.requester_name,
        song_name: row.song_name,
        song_url: row.song_url,
        added_at: row.added_at
      }))
    };

    callback(queue);
  });
}

function saveMusicQueue(queue) {
  // Clear existing queue
  db.run('DELETE FROM music_queue', (err) => {
    if (err) {
      console.error('Error clearing music queue:', err);
      return;
    }

    if (!queue.items || !Array.isArray(queue.items)) {
      console.log('No items to save in music queue');
      return;
    }

    const stmt = db.prepare('INSERT INTO music_queue (requester_name, song_name, song_url, added_at) VALUES (?, ?, ?, ?)');

    for (const item of queue.items) {
      stmt.run(
        item.requester_name,
        item.song_name,
        item.song_url,
        item.added_at || Math.floor(Date.now() / 1000)
      );
    }

    stmt.finalize();
    console.log('Music queue saved to database');
  });
}

// Viewer profiles
function loadViewerProfiles(callback) {
  if (!callback) {
    try {
      const rows = db.prepare('SELECT * FROM viewer_profiles').all() || [];
      const profiles = {};
      for (const row of Array.isArray(rows) ? rows : []) {
        profiles[row.viewer_id] = {
          name: row.name,
          avatar: row.avatar,
          provider: row.provider,
          created_at: row.created_at,
          updated_at: row.updated_at
        };
      }
      return profiles;
    } catch (err) {
      console.error('Error loading viewer profiles synchronously:', err);
      return {};
    }
  }

  db.all('SELECT * FROM viewer_profiles', (err, rows) => {
    if (err) {
      console.error('Error loading viewer profiles:', err);
      callback({});
      return;
    }

    const profiles = {};
    for (const row of rows) {
      profiles[row.viewer_id] = {
        name: row.name,
        avatar: row.avatar,
        provider: row.provider,
        created_at: row.created_at,
        updated_at: row.updated_at
      };
    }

    callback(profiles);
  });
}

function saveViewerProfiles(profiles) {
  const stmt = db.prepare('INSERT OR REPLACE INTO viewer_profiles (viewer_id, name, avatar, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');

  for (const [viewerId, profile] of Object.entries(profiles)) {
    stmt.run(
      viewerId,
      profile.name || null,
      profile.avatar || null,
      profile.provider || 'google',
      profile.created_at || Math.floor(Date.now() / 1000),
      profile.updated_at || Math.floor(Date.now() / 1000)
    );
  }

  stmt.finalize();
  console.log('Viewer profiles saved to database');
}

function saveViewerProfilesAsync(profiles) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO viewer_profiles (viewer_id, name, avatar, provider, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    const promises = [];

    for (const [viewerId, profile] of Object.entries(profiles)) {
      promises.push(
        new Promise((res, rej) => {
          stmt.run(
            viewerId,
            profile.name || null,
            profile.avatar || null,
            profile.provider || 'google',
            profile.created_at || Math.floor(Date.now() / 1000),
            profile.updated_at || Math.floor(Date.now() / 1000),
            (err) => err ? rej(err) : res()
          );
        })
      );
    }

    stmt.finalize();
    Promise.all(promises)
      .then(() => {
        console.log('Viewer profiles saved to database');
        resolve();
      })
      .catch(reject);
  });
}

// Viewer scores
function loadViewerScores(callback) {
  if (!callback) {
    try {
      const rows = db.prepare('SELECT * FROM viewer_scores ORDER BY completed_at DESC').all() || [];
      return {
        scores: Array.isArray(rows) ? rows.map(row => ({
          viewer_id: row.viewer_id,
          score: row.score,
          word: row.word,
          completed_at: row.completed_at
        })) : []
      };
    } catch (err) {
      console.error('Error loading viewer scores synchronously:', err);
      return { scores: [] };
    }
  }

  db.all('SELECT * FROM viewer_scores ORDER BY completed_at DESC', (err, rows) => {
    if (err) {
      console.error('Error loading viewer scores:', err);
      callback({ scores: [] });
      return;
    }

    const scores = {
      scores: rows.map(row => ({
        viewer_id: row.viewer_id,
        score: row.score,
        word: row.word,
        completed_at: row.completed_at
      }))
    };

    callback(scores);
  });
}

function saveViewerScores(scores) {
  db.run('DELETE FROM viewer_scores', (err) => {
    if (err) {
      console.error('Error clearing viewer scores:', err);
      return;
    }

    if (!scores.scores || !Array.isArray(scores.scores)) {
      console.log('No scores to save');
      return;
    }

    const stmt = db.prepare('INSERT INTO viewer_scores (viewer_id, score, word, completed_at) VALUES (?, ?, ?, ?)');

    for (const score of scores.scores) {
      stmt.run(
        score.viewer_id,
        score.score,
        score.word,
        score.completed_at || Math.floor(Date.now() / 1000)
      );
    }

    stmt.finalize();
    console.log('Viewer scores saved to database');
  });
}

// Streamer applications
function loadStreamerApplications(callback) {
  if (!callback) {
    try {
      const rows = db.prepare('SELECT * FROM streamer_applications ORDER BY created_at DESC').all() || [];
      return Array.isArray(rows) ? rows.map(row => ({
        id: row.id,
        name: row.name,
        email: row.email,
        platform: row.platform,
        handle: row.handle,
        message: row.message,
        status: row.status,
        api_key: row.api_key,
        created_at: row.created_at
      })) : [];
    } catch (err) {
      console.error('Error loading streamer applications synchronously:', err);
      return [];
    }
  }

  db.all('SELECT * FROM streamer_applications ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Error loading streamer applications:', err);
      callback([]);
      return;
    }

    callback(rows.map(row => ({
      id: row.id,
      name: row.name,
      email: row.email,
      platform: row.platform,
      handle: row.handle,
      message: row.message,
      status: row.status,
      api_key: row.api_key,
      created_at: row.created_at
    })));
  });
}

function saveStreamerApplications(applications) {
  const stmt = db.prepare('INSERT OR REPLACE INTO streamer_applications (id, name, email, platform, handle, message, status, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

  for (const app of applications) {
    stmt.run(
      app.id,
      app.name,
      app.email,
      app.platform,
      app.handle,
      app.message || null,
      app.status || 'pending',
      app.api_key || null,
      app.created_at || Math.floor(Date.now() / 1000)
    );
  }

  stmt.finalize();
  console.log('Streamer applications saved to database');
}

// Streamer accounts
function loadStreamerAccounts(callback) {
  if (!callback) {
    try {
      const rows = db.prepare('SELECT * FROM streamer_accounts').all() || [];
      const accounts = {};
      for (const row of Array.isArray(rows) ? rows : []) {
        accounts[row.email] = {
          password_hash: row.password_hash,
          api_key: row.api_key,
          platform: row.platform,
          handle: row.handle,
          score_combination: row.score_combination || 'combined',
          layout: row.layout || null,
          tiktok_username: row.tiktok_username || null,
          twitch_username: row.twitch_username || null,
          selected_game: row.selected_game || 'hangman',
          created_at: row.created_at
        };
      }
      return accounts;
    } catch (err) {
      console.error('Error loading streamer accounts synchronously:', err);
      return {};
    }
  }

  db.all('SELECT * FROM streamer_accounts', (err, rows) => {
    if (err) {
      console.error('Error loading streamer accounts:', err);
      callback({});
      return;
    }

    const accounts = {};
    for (const row of rows) {
      accounts[row.email] = {
        password_hash: row.password_hash,
        api_key: row.api_key,
        platform: row.platform,
        handle: row.handle,
        score_combination: row.score_combination || 'combined',
        layout: row.layout || null,
        tiktok_username: row.tiktok_username || null,
        twitch_username: row.twitch_username || null,
        selected_game: row.selected_game || 'hangman',
        created_at: row.created_at
      };
    }

    callback(accounts);
  });
}

function saveStreamerAccounts(accounts) {
  const stmt = db.prepare('INSERT OR REPLACE INTO streamer_accounts (email, password_hash, api_key, platform, handle, score_combination, layout, tiktok_username, twitch_username, selected_game, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');

  for (const [email, account] of Object.entries(accounts)) {
    stmt.run(
      email,
      account.password_hash,
      account.api_key || null,
      account.platform,
      account.handle,
      account.score_combination || 'combined',
      account.layout || null,
      account.tiktok_username || null,
      account.twitch_username || null,
      account.selected_game || 'hangman',
      account.created_at || Math.floor(Date.now() / 1000)
    );
  }

  stmt.finalize();
  console.log('Streamer accounts saved to database');
}

// Donations — served from the in-memory cache (see hydrateCaches). The DB
// write in saveDonations is still authoritative for persistence.
function normalizeDonationForCache(donation) {
  return {
    id: donation.id,
    viewer_id: donation.viewer_id || donation.viewerId || null,
    viewer_name: donation.viewer_name || donation.viewerName || 'Anonymous',
    amount: donation.amount,
    currency: donation.currency || 'usd',
    status: donation.status || 'completed',
    createdAt: donation.createdAt || new Date().toISOString(),
    sessionId: donation.sessionId || donation.session_id || null,
  };
}

function loadDonations(callback) {
  const snapshot = donationsCache.map(d => ({ ...d }));
  if (!callback) return snapshot;
  callback(snapshot);
}

function persistDonations(donations) {
  const stmt = db.prepare('INSERT OR REPLACE INTO donations (id, viewer_id, viewer_name, amount, currency, status, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  for (const donation of donations) {
    stmt.run(
      donation.id,
      donation.viewer_id || donation.viewerId || null,
      donation.viewer_name || donation.viewerName || 'Anonymous',
      donation.amount,
      donation.currency || 'usd',
      donation.status || 'completed',
      donation.createdAt ? Math.floor(new Date(donation.createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000),
      donation.sessionId || donation.session_id || null
    );
  }

  stmt.finalize();
  console.log('Donations saved to database');
}

function saveDonations(donations) {
  donationsCache.length = 0;
  for (const d of donations || []) donationsCache.push(normalizeDonationForCache(d));
  persistDonations(donations);
}

function saveDonationsAsync(donations) {
  donationsCache.length = 0;
  for (const d of donations || []) donationsCache.push(normalizeDonationForCache(d));
  return new Promise((resolve, reject) => {
    try {
      persistDonations(donations);
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

// Memberships (Stripe subscriptions) — served from the in-memory cache.
function getMembership(viewerId) {
  const row = membershipsCache.get(viewerId);
  return row ? { ...row } : null;
}

function getMembershipByStripeSubscription(subscriptionId) {
  for (const row of membershipsCache.values()) {
    if (row.stripe_subscription_id === subscriptionId) return { ...row };
  }
  return null;
}

function getMembershipByStripeCustomer(customerId) {
  for (const row of membershipsCache.values()) {
    if (row.stripe_customer_id === customerId) return { ...row };
  }
  return null;
}

function upsertMembership(viewerId, fields = {}) {
  const membership = {
    viewer_id: viewerId,
    tier: fields.tier || 'free',
    status: fields.status || 'inactive',
    stripe_customer_id: fields.stripe_customer_id || null,
    stripe_subscription_id: fields.stripe_subscription_id || null,
    current_period_start: fields.current_period_start || null,
    current_period_end: fields.current_period_end || null,
    cancel_at_period_end: !!fields.cancel_at_period_end,
    updated_at: Math.floor(Date.now() / 1000),
  };
  membershipsCache.set(viewerId, membership);

  // INSERT OR REPLACE keeps any columns not listed at their defaults, so
  // write the full row explicitly.
  const stmt = db.prepare(`INSERT OR REPLACE INTO memberships
    (viewer_id, tier, status, stripe_customer_id, stripe_subscription_id,
     current_period_start, current_period_end, cancel_at_period_end, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  stmt.run(
    membership.viewer_id,
    membership.tier,
    membership.status,
    membership.stripe_customer_id,
    membership.stripe_subscription_id,
    membership.current_period_start,
    membership.current_period_end,
    membership.cancel_at_period_end ? 1 : 0,
    membership.updated_at
  );
  stmt.finalize();
  return { ok: true };
}

// Perks (donor difficulties, hints, multi-guess) are active only while the
// subscription is in a paid-and-current state. past_due/unpaid keep the row
// Stripe-managed but do not unlock perks, matching word-tycoon.
function isActiveSubscriber(viewerId) {
  const membership = getMembership(viewerId);
  return !!membership && membership.tier !== 'free' &&
    (membership.status === 'active' || membership.status === 'trialing');
}

module.exports = {
  loadTokens,
  loadTokensSync,
  saveTokens,
  saveTokensAsync,
  loadMusicQueue,
  saveMusicQueue,
  loadViewerProfiles,
  saveViewerProfiles,
  saveViewerProfilesAsync,
  loadViewerProfilesForOwner,
  saveViewerProfilesForOwner,
  loadViewerScores,
  saveViewerScores,
  loadViewerScoresForOwner,
  saveViewerScoresForOwner,
  loadGlobalViewerScores,
  saveGlobalViewerScores,
  loadStreamerApplications,
  saveStreamerApplications,
  loadStreamerAccounts,
  saveStreamerAccounts,
  loadDonations,
  saveDonations,
  saveDonationsAsync,
  getMembership,
  getMembershipByStripeSubscription,
  getMembershipByStripeCustomer,
  upsertMembership,
  isActiveSubscriber,
};

// Owner-specific storage functions (for streamer-specific data)
function loadViewerProfilesForOwner(owner) {
  // For now, returns the global viewer profiles
  // Could be extended to support per-streamer profiles
  return new Promise((resolve) => {
    loadViewerProfiles(resolve);
  });
}

function saveViewerProfilesForOwner(owner, profiles) {
  // For now, saves to global viewer profiles
  // Could be extended to support per-streamer profiles
  return new Promise((resolve) => {
    saveViewerProfiles(profiles);
    resolve();
  });
}

function loadViewerScoresForOwner(owner) {
  // For now, returns the global viewer scores
  // Could be extended to support per-streamer scores
  return new Promise((resolve) => {
    loadViewerScores(resolve);
  });
}

function saveViewerScoresForOwner(owner, scores) {
  // For now, saves to global viewer scores
  // Could be extended to support per-streamer scores
  return new Promise((resolve) => {
    saveViewerScores(scores);
    resolve();
  });
}

function loadGlobalViewerScores() {
  // Returns global viewer scores
  return new Promise((resolve) => {
    loadViewerScores(resolve);
  });
}

function saveGlobalViewerScores(scores) {
  // Saves global viewer scores
  return new Promise((resolve) => {
    saveViewerScores(scores);
    resolve();
  });
}
