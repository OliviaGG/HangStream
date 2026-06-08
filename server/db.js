const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/hangstream.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database:', dbPath);
    initializeSchema();
  }
});

function initializeSchema() {
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
  });
}

module.exports = db;
