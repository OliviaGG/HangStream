const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../data/hangstream.db');

// sqlite3 does not create the parent directory, so a fresh checkout (or a
// container image built from one) would fail to open the database at all.
// Creating it up front means the app boots on a brand new machine.
try {
  fs.mkdirSync(path.dirname(path.resolve(dbPath)), { recursive: true });
} catch (err) {
  console.error('Could not create the database directory:', err.message);
}

// Resolves once the connection is open AND every table/index has been created.
// Consumers (and tests) can await this instead of guessing at a delay: the
// CREATE TABLE statements below are async, so "schema initialized" only means
// they were queued, not committed.
let readyResolve;
let readyReject;
const ready = new Promise((resolve, reject) => {
  readyResolve = resolve;
  readyReject = reject;
});

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
    readyReject(err);
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
      score_combination TEXT DEFAULT 'combined',
      created_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`);

    // Add score_combination column if it doesn't exist
    db.run(`ALTER TABLE streamer_accounts ADD COLUMN score_combination TEXT DEFAULT 'combined'`, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes('duplicate column name')) {
        console.error('Error adding score_combination column:', err.message);
      }
    });

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

    // Server-authoritative game rounds (server/games/). One row per
    // streamer x game room; `state` holds the serialized Game state so a
    // restart can restore live rounds, and daily/played bookkeeping lets
    // games roll a shared puzzle over once per day.
    db.run(`CREATE TABLE IF NOT EXISTS game_rounds (
      streamer_id TEXT NOT NULL,
      game_id TEXT NOT NULL,
      state TEXT,
      is_daily INTEGER DEFAULT 0,
      daily_date TEXT,
      updated_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (streamer_id, game_id)
    )`);

    db.run(`CREATE TABLE IF NOT EXISTS game_daily_played (
      game_id TEXT NOT NULL,
      daily_date TEXT NOT NULL,
      streamer_id TEXT DEFAULT 'public',
      puzzle_id TEXT,
      completed_at INTEGER DEFAULT (strftime('%s', 'now')),
      PRIMARY KEY (game_id, daily_date, streamer_id)
    )`);

    // Next-game vote config (server/games/game-vote.js). One row per streamer
    // holding the rotation, ballot size, durations and flags — the equivalent
    // of Word Tycoon's per-streamer `gameVote` widget config.
    db.run(`CREATE TABLE IF NOT EXISTS game_vote_config (
      streamer_id TEXT PRIMARY KEY,
      config TEXT NOT NULL,
      enabled INTEGER DEFAULT 1,
      updated_at INTEGER DEFAULT (strftime('%s', 'now'))
    )`);

    // Final serialized statement: when it completes, every table exists.
    db.run('SELECT 1', (err) => {
      if (err) {
        console.error('Error initializing schema:', err.message);
        readyReject(err);
        return;
      }
      console.log('Database schema initialized');
      readyResolve(db);
    });
  });
}

db.ready = ready;

module.exports = db;
