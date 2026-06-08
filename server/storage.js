const db = require('./db');
const crypto = require('crypto');

// In-memory cache for synchronous access
let tokensCache = null;

// OAuth tokens (with encryption)
function loadTokens(callback) {
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
      tokens[row.provider] = {
        access_token: row.access_token,
        refresh_token: row.refresh_token,
        expires_at: row.expires_at
      };
    }

    tokensCache = tokens;
    callback(tokens);
  });
}

function loadTokensSync() {
  try {
    const rows = db.prepare('SELECT * FROM oauth_tokens').all();
    const tokens = {};
    if (Array.isArray(rows)) {
      for (const row of rows) {
        tokens[row.provider] = {
          access_token: row.access_token,
          refresh_token: row.refresh_token,
          expires_at: row.expires_at
        };
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
  const stmt = db.prepare('INSERT OR REPLACE INTO oauth_tokens (provider, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)');

  for (const [provider, data] of Object.entries(tokens)) {
    stmt.run(
      provider,
      data.access_token,
      data.refresh_token || null,
      data.expires_at || null
    );
  }

  stmt.finalize();
  tokensCache = tokens;
  console.log('Tokens saved to database');
}

function saveTokensAsync(tokens) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO oauth_tokens (provider, access_token, refresh_token, expires_at) VALUES (?, ?, ?, ?)');
    const promises = [];

    for (const [provider, data] of Object.entries(tokens)) {
      promises.push(
        new Promise((res, rej) => {
          stmt.run(
            provider,
            data.access_token,
            data.refresh_token || null,
            data.expires_at || null,
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
        created_at: row.created_at
      };
    }

    callback(accounts);
  });
}

function saveStreamerAccounts(accounts) {
  const stmt = db.prepare('INSERT OR REPLACE INTO streamer_accounts (email, password_hash, api_key, platform, handle, created_at) VALUES (?, ?, ?, ?, ?, ?)');

  for (const [email, account] of Object.entries(accounts)) {
    stmt.run(
      email,
      account.password_hash,
      account.api_key || null,
      account.platform,
      account.handle,
      account.created_at || Math.floor(Date.now() / 1000)
    );
  }

  stmt.finalize();
  console.log('Streamer accounts saved to database');
}

// Donations
function loadDonations(callback) {
  db.all('SELECT * FROM donations ORDER BY created_at DESC', (err, rows) => {
    if (err) {
      console.error('Error loading donations:', err);
      callback([]);
      return;
    }

    callback(rows.map(row => ({
      id: row.id,
      viewer_id: row.viewer_id,
      viewer_name: row.viewer_name,
      amount: row.amount,
      currency: row.currency,
      status: row.status,
      createdAt: new Date(row.created_at * 1000).toISOString(),
      sessionId: row.session_id
    })));
  });
}

function saveDonations(donations) {
  const stmt = db.prepare('INSERT OR REPLACE INTO donations (id, viewer_id, viewer_name, amount, currency, status, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

  for (const donation of donations) {
    stmt.run(
      donation.id,
      donation.viewer_id || null,
      donation.viewer_name,
      donation.amount,
      donation.currency || 'usd',
      donation.status || 'completed',
      donation.createdAt ? Math.floor(new Date(donation.createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000),
      donation.sessionId || null
    );
  }

  stmt.finalize();
  console.log('Donations saved to database');
}

function saveDonationsAsync(donations) {
  return new Promise((resolve, reject) => {
    const stmt = db.prepare('INSERT OR REPLACE INTO donations (id, viewer_id, viewer_name, amount, currency, status, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const promises = [];

    for (const donation of donations) {
      promises.push(
        new Promise((res, rej) => {
          stmt.run(
            donation.id,
            donation.viewer_id || null,
            donation.viewer_name,
            donation.amount,
            donation.currency || 'usd',
            donation.status || 'completed',
            donation.createdAt ? Math.floor(new Date(donation.createdAt).getTime() / 1000) : Math.floor(Date.now() / 1000),
            donation.sessionId || null,
            (err) => err ? rej(err) : res()
          );
        })
      );
    }

    stmt.finalize();
    Promise.all(promises)
      .then(() => {
        console.log('Donations saved to database');
        resolve();
      })
      .catch(reject);
  });
}

module.exports = {
  loadTokens,
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
