const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/hangstream.db');
const db = new sqlite3.Database(dbPath);

// Migration functions
async function initializeSchema() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // OAuth tokens table
      db.run(`CREATE TABLE IF NOT EXISTS oauth_tokens (
        provider TEXT PRIMARY KEY,
        access_token TEXT NOT NULL,
        refresh_token TEXT,
        expires_at INTEGER
      )`);

      // Music queue table
      db.run(`CREATE TABLE IF NOT EXISTS music_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        requester_name TEXT NOT NULL,
        song_name TEXT NOT NULL,
        song_url TEXT NOT NULL,
        added_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`);

      // Viewer profiles table
      db.run(`CREATE TABLE IF NOT EXISTS viewer_profiles (
        viewer_id TEXT PRIMARY KEY,
        name TEXT,
        avatar TEXT,
        provider TEXT DEFAULT 'google',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`);

      // Viewer scores table
      db.run(`CREATE TABLE IF NOT EXISTS viewer_scores (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        viewer_id TEXT NOT NULL,
        score INTEGER NOT NULL,
        word TEXT NOT NULL,
        completed_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`);

      // Streamer applications table
      db.run(`CREATE TABLE IF NOT EXISTS streamer_applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT NOT NULL,
        platform TEXT NOT NULL,
        handle TEXT NOT NULL,
        message TEXT,
        status TEXT DEFAULT 'pending',
        api_key TEXT,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`);

      // Streamer accounts table
      db.run(`CREATE TABLE IF NOT EXISTS streamer_accounts (
        email TEXT PRIMARY KEY,
        password_hash TEXT NOT NULL,
        api_key TEXT UNIQUE,
        platform TEXT NOT NULL,
        handle TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )`);

      // Donations table
      db.run(`CREATE TABLE IF NOT EXISTS donations (
        id TEXT PRIMARY KEY,
        viewer_id TEXT,
        viewer_name TEXT,
        amount REAL NOT NULL,
        currency TEXT DEFAULT 'usd',
        status TEXT DEFAULT 'completed',
        created_at INTEGER DEFAULT (strftime('%s', 'now')),
        session_id TEXT
      )`);

      console.log('Database schema initialized');
      resolve();
    });
  });
}

const serverDir = __dirname;

// Migration functions
async function migrateTokens() {
  try {
    const tokensPath = path.join(serverDir, 'oauth-tokens.json');
    if (!fs.existsSync(tokensPath)) {
      console.log('oauth-tokens.json not found, skipping');
      return;
    }

    const raw = fs.readFileSync(tokensPath, 'utf8');
    const tokens = JSON.parse(raw);

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
    console.log('✓ Migrated OAuth tokens');
  } catch (err) {
    console.error('Error migrating tokens:', err.message);
  }
}

async function migrateMusicQueue() {
  try {
    const queuePath = path.join(serverDir, 'music-queue.json');
    if (!fs.existsSync(queuePath)) {
      console.log('music-queue.json not found, skipping');
      return;
    }

    const raw = fs.readFileSync(queuePath, 'utf8');
    const queue = JSON.parse(raw);

    if (!queue.items || !Array.isArray(queue.items)) {
      console.log('No items in music queue, skipping');
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
    console.log('✓ Migrated music queue');
  } catch (err) {
    console.error('Error migrating music queue:', err.message);
  }
}

async function migrateViewerProfiles() {
  try {
    const profilesPath = path.join(serverDir, 'viewer-profiles.json');
    if (!fs.existsSync(profilesPath)) {
      console.log('viewer-profiles.json not found, skipping');
      return;
    }

    const raw = fs.readFileSync(profilesPath, 'utf8');
    const profiles = JSON.parse(raw);

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
    console.log('✓ Migrated viewer profiles');
  } catch (err) {
    console.error('Error migrating viewer profiles:', err.message);
  }
}

async function migrateViewerScores() {
  try {
    const scoresPath = path.join(serverDir, 'viewer-scores.json');
    if (!fs.existsSync(scoresPath)) {
      console.log('viewer-scores.json not found, skipping');
      return;
    }

    const raw = fs.readFileSync(scoresPath, 'utf8');
    const scores = JSON.parse(raw);

    if (!scores.scores || !Array.isArray(scores.scores)) {
      console.log('No scores found, skipping');
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
    console.log('✓ Migrated viewer scores');
  } catch (err) {
    console.error('Error migrating viewer scores:', err.message);
  }
}

async function migrateStreamerApplications() {
  try {
    const appsPath = path.join(serverDir, 'streamer-applications.json');
    if (!fs.existsSync(appsPath)) {
      console.log('streamer-applications.json not found, skipping');
      return;
    }

    const raw = fs.readFileSync(appsPath, 'utf8');
    const apps = JSON.parse(raw);

    const stmt = db.prepare('INSERT INTO streamer_applications (id, name, email, platform, handle, message, status, api_key, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');

    for (const app of apps) {
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
    console.log('✓ Migrated streamer applications');
  } catch (err) {
    console.error('Error migrating streamer applications:', err.message);
  }
}

async function migrateStreamerAccounts() {
  try {
    const accountsPath = path.join(serverDir, 'streamer-accounts.json');
    if (!fs.existsSync(accountsPath)) {
      console.log('streamer-accounts.json not found, skipping');
      return;
    }

    const raw = fs.readFileSync(accountsPath, 'utf8');
    const accounts = JSON.parse(raw);

    const stmt = db.prepare('INSERT INTO streamer_accounts (email, password_hash, api_key, platform, handle, created_at) VALUES (?, ?, ?, ?, ?, ?)');

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
    console.log('✓ Migrated streamer accounts');
  } catch (err) {
    console.error('Error migrating streamer accounts:', err.message);
  }
}

async function migrateDonations() {
  try {
    const donationsPath = path.join(serverDir, 'donations.json');
    if (!fs.existsSync(donationsPath)) {
      console.log('donations.json not found, skipping');
      return;
    }

    const raw = fs.readFileSync(donationsPath, 'utf8');
    const donations = JSON.parse(raw);

    const stmt = db.prepare('INSERT INTO donations (id, viewer_id, viewer_name, amount, currency, status, created_at, session_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');

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
    console.log('✓ Migrated donations');
  } catch (err) {
    console.error('Error migrating donations:', err.message);
  }
}

// Run all migrations
async function runMigrations() {
  console.log('Starting migration from JSON to SQLite...\n');

  await initializeSchema();
  await migrateTokens();
  await migrateMusicQueue();
  await migrateViewerProfiles();
  await migrateViewerScores();
  await migrateStreamerApplications();
  await migrateStreamerAccounts();
  await migrateDonations();

  console.log('\n✅ Migration complete!');
  console.log('Backup your JSON files, then you can delete them after verifying the migration was successful.');

  // Close database connection
  db.close();
}

// Run if executed directly
if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };
