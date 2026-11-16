const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.RELAY_DB_PATH || path.join(__dirname, '..', 'data', 'relaybroadcast.db');
const OLD_DB_PATH = path.join(__dirname, '..', 'data', 'chatrelay.db');
let db = null;
const SAVE_DELAY = parseInt(process.env.RELAY_DB_SAVE_DEBOUNCE_MS || '1000', 10);
const DB_COMPACT_THRESHOLD_MB = parseFloat(process.env.RELAY_DB_COMPACT_THRESHOLD_MB || '16');
const SQLITE_HEADER = Buffer.from('SQLite format 3\0', 'utf8');

// --- sql.js WASM corruption watchdog ---
// sql.js keeps the whole DB in a WASM heap that can degrade over long uptime.
// Once corrupted, every query throws "memory access out of bounds" and the
// service stays silently dead until a manual restart. Detect it at the DB
// choke point, persist what we can, and exit so PM2 restarts us clean.
function _installCorruptionWatchdog(instance) {
  const bail = (err) => {
    console.error('[DB] sql.js WASM heap corrupted — persisting and exiting for PM2 restart:', err && err.message);
    try { save(); } catch (_) {}
    setTimeout(() => process.exit(1), 1500);
  };
  const guard = (fn) => function (...args) {
    try { return fn.apply(this, args); }
    catch (err) {
      if (err && /memory access out of bounds/i.test(String(err.message || err))) bail(err);
      throw err;
    }
  };
  instance.exec = guard(instance.exec.bind(instance));
  instance.run = guard(instance.run.bind(instance));
  const origPrepare = instance.prepare.bind(instance);
  instance.prepare = guard(function (...args) {
    const stmt = origPrepare(...args);
    if (stmt) {
      stmt.bind = guard(stmt.bind.bind(stmt));
      stmt.step = guard(stmt.step.bind(stmt));
      stmt.getAsObject = guard(stmt.getAsObject.bind(stmt));
      stmt.run = guard(stmt.run.bind(stmt));
    }
    return stmt;
  });
  return instance;
}

async function initialize() {
  const SQL = await initSqlJs();
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // Auto-migrate old database filename
  if (!fs.existsSync(DB_PATH) && fs.existsSync(OLD_DB_PATH)) {
    fs.renameSync(OLD_DB_PATH, DB_PATH);
    console.log('[DB] Migrated chatrelay.db -> relaybroadcast.db');
  }

  if (fs.existsSync(DB_PATH)) {
    const buffer = fs.readFileSync(DB_PATH);
    db = _installCorruptionWatchdog(new SQL.Database(buffer));
  } else {
    db = _installCorruptionWatchdog(new SQL.Database());
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      platform_user_id TEXT NOT NULL,
      username TEXT,
      display_name TEXT,
      profile_pic TEXT,
      is_following INTEGER DEFAULT 0,
      is_subscriber INTEGER DEFAULT 0,
      is_fan_club INTEGER DEFAULT 0,
      is_superfan INTEGER DEFAULT 0,
      tts_enabled INTEGER DEFAULT 0,
      tts_banned INTEGER DEFAULT 0,
      tts_voice TEXT DEFAULT NULL,
      custom_color TEXT DEFAULT NULL,
      custom_nick TEXT DEFAULT NULL,
      hide_fanclub_badge INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(platform, platform_user_id)
    )
  `);

  // Migrate existing users tables to include hide_fanclub_badge
  try {
    const cols = queryAll("PRAGMA table_info(users)");
    if (!cols.some(c => c.name === 'hide_fanclub_badge')) {
      db.run(`ALTER TABLE users ADD COLUMN hide_fanclub_badge INTEGER DEFAULT 0`);
      console.log('[DB] Added users.hide_fanclub_badge column');
    }
  } catch (e) {
    console.error('[DB] hide_fanclub_badge migration failed:', e.message);
  }

  // Per-streamer fan-club membership. A viewer can be a fan of multiple
  // streamers; each (viewer, streamer) pair is one row. Recorded the first
  // time we see an FC-tagged event (chat/like/gift/join/etc.) from that
  // viewer in that streamer's TikTok room. Required so jorry's fans don't
  // light up as FC in another streamer's private session.
  db.run(`
    CREATE TABLE IF NOT EXISTS fan_club_memberships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      platform TEXT NOT NULL,
      platform_user_id TEXT NOT NULL,
      streamer_handle TEXT NOT NULL,
      recorded_at TEXT DEFAULT (datetime('now')),
      UNIQUE(platform, platform_user_id, streamer_handle)
    )
  `);
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_fcm_lookup ON fan_club_memberships(platform, platform_user_id, streamer_handle)`);
  } catch (e) { /* index already exists */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS account_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discord_user_id TEXT NOT NULL,
      linked_platform TEXT NOT NULL,
      linked_platform_user_id TEXT NOT NULL,
      verified INTEGER DEFAULT 0,
      verification_code TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS tts_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    )
  `);

  // Voice preferences — viewer's chosen ElevenLabs voice (keyed by Discord ID via portal login).
  db.run(`
    CREATE TABLE IF NOT EXISTS voice_preferences (
      discord_user_id TEXT PRIMARY KEY,
      voice_id TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Per-streamer chat-TTS config.
  db.run(`
    CREATE TABLE IF NOT EXISTS voice_streamer_settings (
      streamer_discord_id TEXT PRIMARY KEY,
      enabled INTEGER NOT NULL DEFAULT 0,
      trigger_mode TEXT NOT NULL DEFAULT 'prefix',
      trigger_symbol TEXT NOT NULL DEFAULT '.',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Per-streamer mute list — viewer identities (platform:platform_user_id) that won't trigger TTS.
  db.run(`
    CREATE TABLE IF NOT EXISTS voice_muted_viewers (
      streamer_discord_id TEXT NOT NULL,
      viewer_key TEXT NOT NULL,
      muted_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (streamer_discord_id, viewer_key)
    )
  `);

  // Admin override — Discord IDs in this table can save a voice without
  // an active Donor Class subscription. For staff / mods / partners.
  db.run(`
    CREATE TABLE IF NOT EXISTS voice_admin_override (
      discord_user_id TEXT PRIMARY KEY,
      note TEXT,
      granted_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Manual TikTok Super Fan overrides. The live is_superfan flag (users table)
  // is only set on rare owner-channel TikTok events, so real Super Fans often
  // read as free. Owner-marked rows here are authoritative and immune to the
  // live pipeline — honored everywhere Super Fan status grants perks (Donor-tier
  // game access + premium voices). Manual removal only (no auto-expiry).
  db.run(`
    CREATE TABLE IF NOT EXISTS superfan_overrides (
      platform TEXT NOT NULL DEFAULT 'tiktok',
      platform_user_id TEXT NOT NULL,
      display_name TEXT,
      note TEXT,
      granted_by TEXT,
      granted_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (platform, platform_user_id)
    )
  `);

  // Monthly hint allowance ledger. Donors get 20/mo, TikTok Super Fans 30/mo.
  // Keyed by (owning account id, YYYY-MM) so each calendar month is a fresh
  // grant (use-it-or-lose-it). granted is the subscription cap; purchased counts
  // hints bought via Stripe recharge; used counts spent hints.
  db.run(`
    CREATE TABLE IF NOT EXISTS hint_ledger (
      account_id TEXT NOT NULL,
      month_key TEXT NOT NULL,
      tier TEXT,
      granted INTEGER NOT NULL DEFAULT 0,
      purchased INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (account_id, month_key)
    )
  `);
  // Migration: add purchased column to existing ledgers created before recharge.
  try { db.run("ALTER TABLE hint_ledger ADD COLUMN purchased INTEGER NOT NULL DEFAULT 0"); } catch (_) {}

  // A purchased private reveal and its allowance debit are one durable action.
  db.run(`CREATE TABLE IF NOT EXISTS hint_reveal_receipts (
    account_id TEXT NOT NULL, game TEXT NOT NULL, action_id TEXT NOT NULL,
    round_key TEXT NOT NULL, position INTEGER, result TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(account_id, game, action_id),
    UNIQUE(account_id, game, round_key, position)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS hint_reveal_pending (
    account_id TEXT NOT NULL, game TEXT NOT NULL, action_id TEXT NOT NULL, expires_at TEXT NOT NULL,
    PRIMARY KEY(account_id,game,action_id)
  )`);
  db.run('CREATE INDEX IF NOT EXISTS hint_reveal_pending_expiry ON hint_reveal_pending(expires_at)');

  // Stripe hint-recharge audit log. Guards against double-credit on webhook replay.
  db.run(`
    CREATE TABLE IF NOT EXISTS hint_recharges (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id TEXT NOT NULL,
      month_key TEXT NOT NULL,
      hints INTEGER NOT NULL DEFAULT 0,
      stripe_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(stripe_session_id)
    )
  `);

  // Pookie Tok — paid viewer messages shown transiently on the stream overlay.
  // token: opaque id we mint before checkout and echo back through Stripe/WT so
  // the completed payment re-attaches to this row (the message text never rides
  // through Stripe). status: pending -> paid (shown) -> hidden | failed.
  db.run(`
    CREATE TABLE IF NOT EXISTS pookie_tok_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token TEXT NOT NULL UNIQUE,
      streamer_id TEXT,
      tier TEXT,
      amount_cents INTEGER,
      message TEXT NOT NULL,
      display_name TEXT,
      duration_ms INTEGER,
      status TEXT NOT NULL DEFAULT 'pending',
      stripe_session_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      paid_at TEXT,
      hidden_at TEXT
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS searchle_discord_daily_puzzles (
      guild_id TEXT NOT NULL,
      puzzle_date TEXT NOT NULL,
      target_word TEXT NOT NULL,
      source_game_id TEXT NOT NULL DEFAULT 'searchle-discord',
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (guild_id, puzzle_date)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS searchle_discord_guesses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      guild_id TEXT NOT NULL,
      puzzle_date TEXT NOT NULL,
      user_id TEXT NOT NULL,
      username TEXT,
      display_name TEXT,
      guess_word TEXT NOT NULL,
      normalized_word TEXT NOT NULL,
      rank INTEGER NOT NULL,
      is_win INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE (guild_id, puzzle_date, user_id, normalized_word)
    )
  `);
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_searchle_discord_guess_lookup
      ON searchle_discord_guesses(guild_id, puzzle_date, user_id)
    `);
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_searchle_discord_leaderboard
      ON searchle_discord_guesses(guild_id, puzzle_date, rank)
    `);
  } catch (e) { /* index already exists */ }

  // ─── Junk Drawer (junkdrawer.live) scores ───
  // One row per user per mode ('daily' rows keyed by Edmonton date in `day`,
  // 'endless' rows use day='' and hold the all-time best).
  db.run(`
    CREATE TABLE IF NOT EXISTS junkdrawer_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      mode TEXT NOT NULL,
      day TEXT NOT NULL DEFAULT '',
      score INTEGER NOT NULL,
      merges INTEGER DEFAULT 0,
      biggest INTEGER DEFAULT 0,
      xp_awarded INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE (user_id, mode, day)
    )
  `);
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_junkdrawer_leaderboard
      ON junkdrawer_scores(mode, day, score)
    `);
  } catch (e) { /* index already exists */ }

  // Junk Drawer meta-game profile (coins / level / house / streak / stats)
  // — one JSON blob per account plus atomic server action receipts.
  db.run(`
    CREATE TABLE IF NOT EXISTS junkdrawer_profiles (
      user_id TEXT PRIMARY KEY,
      profile TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.run(`CREATE TABLE IF NOT EXISTS junkdrawer_profile_receipts (
    event_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, revision INTEGER NOT NULL,
    record_hash TEXT NOT NULL, outcome TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(user_id, revision)
  )`);

  // Letterworks authoritative saves, records, and durable reward claims.
  db.run(`CREATE TABLE IF NOT EXISTS letterworks_state (
    key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT DEFAULT (datetime('now'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS letterworks_scores (
    user_id TEXT NOT NULL, day TEXT NOT NULL, display_name TEXT, avatar TEXT,
    score INTEGER NOT NULL, words INTEGER NOT NULL, updated_at TEXT DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, day)
  )`);

  // ─── Cloud Quarry daily sprint scores ───
  // Lower duration is better; shots break equal-time ties. Campaign progress
  // remains local because it is an untimed, offline-friendly mode.
  db.run(`
    CREATE TABLE IF NOT EXISTS cloudquarry_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      day TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      shots INTEGER NOT NULL,
      max_combo INTEGER DEFAULT 0,
      xp_awarded INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE (user_id, day)
    )
  `);
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_cloudquarry_leaderboard
      ON cloudquarry_scores(day, duration_ms, shots)
    `);
  } catch (e) { /* index already exists */ }

  // ─── Synapse (wordtycoon.live/synapse) ───
  // Resolved daily corner-word pairs. Persisted so the day's pair survives
  // restarts and stays stable even if the similarity service hiccups later.
  db.run(`
    CREATE TABLE IF NOT EXISTS synapse_days (
      day TEXT PRIMARY KEY,
      word_a TEXT NOT NULL,
      word_b TEXT NOT NULL,
      game_no INTEGER NOT NULL
    )
  `);

  // One score row per user per day (daily mode only — practice runs are
  // never persisted). Lower words_used is better; avg_link breaks ties.
  db.run(`
    CREATE TABLE IF NOT EXISTS synapse_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      display_name TEXT,
      avatar TEXT,
      day TEXT NOT NULL,
      words_used INTEGER NOT NULL,
      avg_link REAL DEFAULT 0,
      xp_awarded INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      UNIQUE (user_id, day)
    )
  `);
  try {
    db.run(`
      CREATE INDEX IF NOT EXISTS idx_synapse_leaderboard
      ON synapse_scores(day, words_used)
    `);
  } catch (e) { /* index already exists */ }

  // Daily streak + lifetime bests, updated server-side on verified wins.
  db.run(`
    CREATE TABLE IF NOT EXISTS synapse_profiles (
      user_id TEXT PRIMARY KEY,
      streak INTEGER DEFAULT 0,
      best_streak INTEGER DEFAULT 0,
      last_daily TEXT DEFAULT '',
      wins INTEGER DEFAULT 0,
      best_words INTEGER,
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `);

  // Default TTS settings
  const count = queryScalar("SELECT COUNT(*) as c FROM tts_settings");
  if (count === 0) {
    db.run("INSERT INTO tts_settings (key, value) VALUES (?, ?)", ['rate', '1']);
    db.run("INSERT INTO tts_settings (key, value) VALUES (?, ?)", ['volume', '0.8']);
    db.run("INSERT INTO tts_settings (key, value) VALUES (?, ?)", ['pitch', '1']);
    db.run("INSERT INTO tts_settings (key, value) VALUES (?, ?)", ['enabled', 'true']);
  }

  // Migration: add is_moderator column if not exists
  try {
    db.run("ALTER TABLE users ADD COLUMN is_moderator INTEGER DEFAULT 0");
    save();
  } catch (e) {
    // Column already exists — ignore
  }

  // ─── Balances Owing (admin-flagged players who must pay to play) ───
  // Viewers the admin has flagged as owing money. While a row is active,
  // relay.js never forwards their chat to any game (guesses blocked
  // everywhere) and the goals overlay shows a "pay up" banner instead.
  // tiktok_user_id stores BOTH the TikTok uniqueId (handle) and numeric id
  // forms lowercased — matching in relay checks user.id and username.
  // Clearing is manual-only (admin page) per user decision 2026-07-19.
  db.run(`
    CREATE TABLE IF NOT EXISTS balances_owing (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tiktok_user_id TEXT NOT NULL UNIQUE,
      display_name TEXT,
      amount_dollars REAL NOT NULL DEFAULT 0,
      note TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      cleared_at TEXT,
      blocked_count INTEGER NOT NULL DEFAULT 0,
      last_blocked_at TEXT
    )
  `);

  // ─── Site usage tracking (wordtycoon.live page views) ─────────────
  // Aggregated daily counters, not raw hits — sql.js keeps the whole DB in
  // memory, so per-request rows are off the table. Visitor hashes rotate
  // daily (sha256 of day+ip+ua), so uniques are per-day and nothing
  // personally identifiable is ever stored.
  db.run(`
    CREATE TABLE IF NOT EXISTS usage_daily_pages (
      day TEXT NOT NULL,
      page TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, page)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS usage_daily_visitors (
      day TEXT NOT NULL,
      visitor TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, visitor)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS usage_daily_referrers (
      day TEXT NOT NULL,
      host TEXT NOT NULL,
      views INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, host)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS usage_daily_events (
      day TEXT NOT NULL,
      event TEXT NOT NULL,
      page TEXT NOT NULL,
      label TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      medium TEXT NOT NULL DEFAULT '',
      campaign TEXT NOT NULL DEFAULT '',
      events INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (day, event, page, label, source, medium, campaign)
    )
  `);

  // ─── Chat Messages Table (12-hour persistent history) ─────────────
  // Composite PK (id, room) so the same message can exist in multiple rooms
  // (game-room messages are copied to 'main' for aggregated history)
  db.run(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT NOT NULL,
      room TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      data TEXT NOT NULL,
      PRIMARY KEY (id, room)
    )
  `);
  // Index for fast room+time queries
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_room_time ON chat_messages(room, timestamp)`);
  } catch (e) { /* index already exists */ }

  // Migrate from old single-column PK to composite PK if needed
  try {
    const tableInfo = queryAll("SELECT sql FROM sqlite_master WHERE type='table' AND name='chat_messages'");
    if (tableInfo.length && tableInfo[0].sql && !tableInfo[0].sql.includes('PRIMARY KEY (id, room)')) {
      console.log('[DB] Migrating chat_messages to composite PK (id, room)...');
      db.run(`ALTER TABLE chat_messages RENAME TO chat_messages_old`);
      db.run(`
        CREATE TABLE chat_messages (
          id TEXT NOT NULL,
          room TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          data TEXT NOT NULL,
          PRIMARY KEY (id, room)
        )
      `);
      db.run(`INSERT OR IGNORE INTO chat_messages SELECT * FROM chat_messages_old`);
      db.run(`DROP TABLE chat_messages_old`);
      try {
        db.run(`CREATE INDEX IF NOT EXISTS idx_chat_messages_room_time ON chat_messages(room, timestamp)`);
      } catch (e) { /* index already exists */ }
      save();
      console.log('[DB] Chat messages migration complete');
    }
  } catch (e) {
    console.error('[DB] Chat migration check failed:', e.message);
  }

  // ─── Social Feed Tables (persistent WT activity feed) ─────────────
  // feed_events is append-only and pruned (30 days / 5k rows) so the
  // in-memory sql.js image stays small. user_json carries the already-
  // enriched player object (displayName, pfp, cosmetics, perk flags) so
  // reads never re-enrich.
  db.run(`
    CREATE TABLE IF NOT EXISTS feed_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ts INTEGER NOT NULL,
      event_type TEXT NOT NULL,
      game TEXT,
      game_name TEXT,
      value REAL,
      value_label TEXT,
      user_json TEXT NOT NULL,
      detail_json TEXT
    )
  `);
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_feed_events_ts ON feed_events(ts)`);
  } catch (e) { /* index already exists */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS feed_reactions (
      event_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      emoji TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (event_id, user_id, emoji)
    )
  `);
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_feed_reactions_event ON feed_reactions(event_id)`);
  } catch (e) { /* index already exists */ }

  db.run(`
    CREATE TABLE IF NOT EXISTS feed_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL,
      user_id TEXT NOT NULL,
      user_json TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )
  `);
  try {
    db.run(`CREATE INDEX IF NOT EXISTS idx_feed_comments_event ON feed_comments(event_id)`);
  } catch (e) { /* index already exists */ }

  maybeCompactDatabase({ reason: 'startup' });
  save();
  console.log('[DB] Database initialized');
  return db;
}

// Debounced save — coalesces rapid writes into a single disk flush
let _saveTimer = null;

function bufferFromUint8Array(data) {
  return Buffer.from(data.buffer, data.byteOffset, data.byteLength);
}

function hasValidSqliteHeader(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const header = Buffer.allocUnsafe(SQLITE_HEADER.length);
    const bytesRead = fs.readSync(fd, header, 0, SQLITE_HEADER.length, 0);
    return bytesRead === SQLITE_HEADER.length && header.equals(SQLITE_HEADER);
  } finally {
    fs.closeSync(fd);
  }
}

function getFreelistStats() {
  const pageCount = Number(queryScalar('PRAGMA page_count') || 0);
  const pageSize = Number(queryScalar('PRAGMA page_size') || 0);
  const freelistCount = Number(queryScalar('PRAGMA freelist_count') || 0);
  const sizeBytes = pageCount * pageSize;
  const freeBytes = freelistCount * pageSize;
  return {
    pageCount,
    pageSize,
    freelistCount,
    sizeBytes,
    sizeMB: sizeBytes / (1024 * 1024),
    freeBytes,
    freeMB: freeBytes / (1024 * 1024)
  };
}

function maybeCompactDatabase({ reason = 'manual', force = false } = {}) {
  if (!db) return false;
  const before = getFreelistStats();
  if (!force && before.freeMB < DB_COMPACT_THRESHOLD_MB) {
    return false;
  }

  const startedAt = Date.now();
  db.run('VACUUM');
  const after = getFreelistStats();
  const totalMs = Date.now() - startedAt;

  console.log(
    `[DB] VACUUM ${reason} sizeBeforeMB=${before.sizeMB.toFixed(2)} sizeAfterMB=${after.sizeMB.toFixed(2)} ` +
    `freeBeforeMB=${before.freeMB.toFixed(2)} freeAfterMB=${after.freeMB.toFixed(2)} totalMs=${totalMs}`
  );
  return true;
}

function save() {
  if (!db) return;
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(_flushToDisk, SAVE_DELAY);
}

function _flushToDisk(strict = false) {
  if (!db) return;
  _saveTimer = null;
  try {
    const data = db.export();
    const buffer = bufferFromUint8Array(data);
    const tmpPath = DB_PATH + '.tmp';
    fs.writeFileSync(tmpPath, buffer);
    if (strict) { const fd = fs.openSync(tmpPath, 'r+'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); } }

    const stat = fs.statSync(tmpPath);
    if (stat.size !== buffer.length) {
      console.error(`[DB] Save aborted: temp file size mismatch (${stat.size} vs ${buffer.length})`);
      fs.unlinkSync(tmpPath);
      if (strict) throw Error('Strict database snapshot validation failed');
      return;
    }
    if (!hasValidSqliteHeader(tmpPath)) {
      console.error('[DB] Save aborted: temp file missing SQLite header');
      fs.unlinkSync(tmpPath);
      if (strict) throw Error('Strict database snapshot validation failed');
      return;
    }

    fs.renameSync(tmpPath, DB_PATH);
    if (strict && process.platform !== 'win32') {
      const fd = fs.openSync(path.dirname(DB_PATH), 'r'); try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    }
  } catch (err) {
    console.error('[DB] Save error:', err.message);
    if (strict) throw err;
  }
}

// Force immediate save (for shutdown)
function saveImmediate(strict = false) {
  if (_saveTimer) {
    clearTimeout(_saveTimer);
    _saveTimer = null;
  }
  _flushToDisk(strict);
}

// Helper: run a parameterized query and return array of row objects
function queryAll(sql, params = []) {
  const stmt = db.prepare(sql);
  if (params.length > 0) stmt.bind(params);
  const rows = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

// Helper: get first row as object, or null
function queryOne(sql, params = []) {
  const rows = queryAll(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

// Helper: get scalar value from first row/column
function queryScalar(sql, params = []) {
  const row = queryOne(sql, params);
  if (!row) return null;
  const keys = Object.keys(row);
  return keys.length > 0 ? row[keys[0]] : null;
}

function getOrCreateUser(platform, platformUserId, data = {}) {
  let user = queryOne(
    "SELECT * FROM users WHERE platform = ? AND platform_user_id = ?",
    [platform, platformUserId]
  );

  if (user) {
    // Update fields if they changed
    let updates = [];
    let params = [];
    if (data.username && data.username !== user.username) {
      updates.push('username = ?');
      params.push(data.username);
    }
    if (data.display_name && data.display_name !== user.display_name) {
      updates.push('display_name = ?');
      params.push(data.display_name);
    }
    if (data.profile_pic && data.profile_pic !== user.profile_pic) {
      updates.push('profile_pic = ?');
      params.push(data.profile_pic);
    }
    if (data.is_following !== undefined) {
      updates.push('is_following = ?');
      params.push(data.is_following ? 1 : 0);
    }
    if (data.is_subscriber !== undefined) {
      updates.push('is_subscriber = ?');
      params.push(data.is_subscriber ? 1 : 0);
    }
    if (data.is_fan_club !== undefined) {
      updates.push('is_fan_club = ?');
      params.push(data.is_fan_club ? 1 : 0);
    }
    if (data.is_superfan !== undefined) {
      updates.push('is_superfan = ?');
      params.push(data.is_superfan ? 1 : 0);
    }
    if (data.is_moderator !== undefined) {
      updates.push('is_moderator = ?');
      params.push(data.is_moderator ? 1 : 0);
    }

    if (updates.length > 0) {
      params.push(user.id);
      db.run(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
      save();
      user = queryOne("SELECT * FROM users WHERE id = ?", [user.id]);
    }
    return user;
  }

  // Create new user
  db.run(
    `INSERT INTO users (platform, platform_user_id, username, display_name, profile_pic, is_following, is_subscriber, is_fan_club, is_superfan, is_moderator)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      platform,
      platformUserId,
      data.username || platformUserId,
      data.display_name || data.username || platformUserId,
      data.profile_pic || null,
      data.is_following ? 1 : 0,
      data.is_subscriber ? 1 : 0,
      data.is_fan_club ? 1 : 0,
      data.is_superfan ? 1 : 0,
      data.is_moderator ? 1 : 0
    ]
  );
  save();
  return queryOne(
    "SELECT * FROM users WHERE platform = ? AND platform_user_id = ?",
    [platform, platformUserId]
  );
}

function getUserByPlatform(platform, platformUserId) {
  return queryOne(
    "SELECT * FROM users WHERE platform = ? AND platform_user_id = ?",
    [platform, platformUserId]
  );
}

function setUserVoice(platform, platformUserId, voice) {
  db.run(
    "UPDATE users SET tts_voice = ? WHERE platform = ? AND platform_user_id = ?",
    [voice, platform, platformUserId]
  );
  save();
}

function enableTTS(platform, platformUserId, enabled) {
  db.run(
    "UPDATE users SET tts_enabled = ? WHERE platform = ? AND platform_user_id = ?",
    [enabled ? 1 : 0, platform, platformUserId]
  );
  save();
}

function banTTS(platform, platformUserId, banned) {
  db.run(
    "UPDATE users SET tts_banned = ? WHERE platform = ? AND platform_user_id = ?",
    [banned ? 1 : 0, platform, platformUserId]
  );
  save();
}

function setUserColor(platform, platformUserId, color) {
  db.run(
    "UPDATE users SET custom_color = ? WHERE platform = ? AND platform_user_id = ?",
    [color, platform, platformUserId]
  );
  save();
}

function setUserNick(platform, platformUserId, nick) {
  db.run(
    "UPDATE users SET custom_nick = ? WHERE platform = ? AND platform_user_id = ?",
    [nick, platform, platformUserId]
  );
  save();
}

function setHideFanClubBadge(platform, platformUserId, hide) {
  db.run(
    "UPDATE users SET hide_fanclub_badge = ? WHERE platform = ? AND platform_user_id = ?",
    [hide ? 1 : 0, platform, platformUserId]
  );
  save();
}

function getFanClubStatus(platform, platformUserId) {
  return queryOne(
    "SELECT is_fan_club, hide_fanclub_badge FROM users WHERE platform = ? AND platform_user_id = ?",
    [platform, platformUserId]
  );
}

function recordFanClubMembership(platform, platformUserId, streamerHandle) {
  if (!platform || !platformUserId || !streamerHandle) return;
  try {
    db.run(
      "INSERT OR IGNORE INTO fan_club_memberships (platform, platform_user_id, streamer_handle) VALUES (?, ?, ?)",
      [platform, platformUserId, String(streamerHandle).toLowerCase()]
    );
    save();
  } catch {}
}

// Admin counterpart to recordFanClubMembership — drops ONE membership pair.
// Scoped to a single streamer_handle on purpose: someone can be in several
// streamers' fan clubs, and removing them from the owner's must not touch the
// rest. Returns true when a row actually went away, so the caller can tell
// "removed" from "was never a member".
function removeFanClubMembership(platform, platformUserId, streamerHandle) {
  if (!platform || !platformUserId || !streamerHandle) return false;
  const handle = String(streamerHandle).toLowerCase();
  if (!isFanClubOfStreamer(platform, platformUserId, handle)) return false;
  try {
    db.run(
      "DELETE FROM fan_club_memberships WHERE platform = ? AND platform_user_id = ? AND streamer_handle = ?",
      [platform, platformUserId, handle]
    );
    save();
    return true;
  } catch {
    return false;
  }
}

function isFanClubOfStreamer(platform, platformUserId, streamerHandle) {
  if (!platform || !platformUserId || !streamerHandle) return false;
  const row = queryOne(
    "SELECT 1 AS hit FROM fan_club_memberships WHERE platform = ? AND platform_user_id = ? AND streamer_handle = ? LIMIT 1",
    [platform, platformUserId, String(streamerHandle).toLowerCase()]
  );
  return !!row;
}

function getFanClubStreamers(platform, platformUserId) {
  if (!platform || !platformUserId) return [];
  return queryAll(
    "SELECT streamer_handle FROM fan_club_memberships WHERE platform = ? AND platform_user_id = ?",
    [platform, platformUserId]
  ).map(r => r.streamer_handle);
}

function getTTSUsers() {
  return queryAll(
    "SELECT * FROM users WHERE tts_enabled = 1 OR tts_banned = 1 ORDER BY display_name"
  );
}

function getAllUsers() {
  return queryAll("SELECT * FROM users ORDER BY display_name");
}

function getSubscriberCount() {
  return Number(queryScalar("SELECT COUNT(*) as c FROM users WHERE is_subscriber = 1") || 0);
}

function findUserByUsername(platform, username) {
  return queryOne(
    "SELECT * FROM users WHERE platform = ? AND (username = ? OR display_name = ?)",
    [platform, username, username]
  );
}

function findUserAcrossPlatforms(username) {
  return queryOne(
    "SELECT * FROM users WHERE username = ? OR display_name = ?",
    [username, username]
  );
}

// ── DEPRECATED ─────────────────────────────────────────────────────
// These functions operated on Chat Relay's own account_links table.
// Account linking is now managed by Word Tycoon (port 3020).
// relay.js caches linked groups from Word Tycoon's API instead.
// These functions are retained for backward compatibility but are no
// longer called by any active code path.
// ───────────────────────────────────────────────────────────────────

// Account linking
function createLink(discordUserId, platform, platformUserId, code) {
  db.run(
    "DELETE FROM account_links WHERE discord_user_id = ? AND linked_platform = ? AND verified = 0",
    [discordUserId, platform]
  );
  db.run(
    `INSERT INTO account_links (discord_user_id, linked_platform, linked_platform_user_id, verification_code)
     VALUES (?, ?, ?, ?)`,
    [discordUserId, platform, platformUserId, code]
  );
  save();
}

function verifyLink(discordUserId, code) {
  const link = queryOne(
    "SELECT * FROM account_links WHERE discord_user_id = ? AND verification_code = ? AND verified = 0",
    [discordUserId, code]
  );
  if (!link) return null;

  db.run("UPDATE account_links SET verified = 1 WHERE id = ?", [link.id]);
  save();
  return link;
}

function getLinkedDiscord(platform, platformUserId) {
  const row = queryOne(
    "SELECT discord_user_id FROM account_links WHERE linked_platform = ? AND linked_platform_user_id = ? AND verified = 1",
    [platform, platformUserId]
  );
  return row ? row.discord_user_id : null;
}

function getLinkedPlatforms(discordUserId) {
  return queryAll(
    "SELECT * FROM account_links WHERE discord_user_id = ?",
    [discordUserId]
  );
}

function unlinkAccount(platform, platformUserId) {
  db.run(
    "DELETE FROM account_links WHERE linked_platform = ? AND linked_platform_user_id = ?",
    [platform, platformUserId]
  );
  save();
}

function unlinkByDiscord(discordUserId) {
  db.run(
    "DELETE FROM account_links WHERE discord_user_id = ?",
    [discordUserId]
  );
  save();
}

function updateLinkDiscordId(linkId, discordUserId) {
  db.run(
    "UPDATE account_links SET discord_user_id = ? WHERE id = ?",
    [discordUserId, linkId]
  );
  save();
}

// TTS settings
function getTTSSetting(key) {
  const row = queryOne("SELECT value FROM tts_settings WHERE key = ?", [key]);
  return row ? row.value : null;
}

function setTTSSetting(key, value) {
  db.run(
    "INSERT OR REPLACE INTO tts_settings (key, value) VALUES (?, ?)",
    [key, value]
  );
  save();
}

function getAllTTSSettings() {
  const rows = queryAll("SELECT key, value FROM tts_settings");
  const settings = {};
  rows.forEach(r => settings[r.key] = r.value);
  return settings;
}

// ─── Voice preferences (viewer's chosen ElevenLabs voice) ─────────────
function getVoicePreference(discordUserId) {
  const row = queryOne(
    "SELECT voice_id, updated_at FROM voice_preferences WHERE discord_user_id = ?",
    [discordUserId]
  );
  return row || null;
}

function setVoicePreference(discordUserId, voiceId) {
  db.run(
    `INSERT INTO voice_preferences (discord_user_id, voice_id, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(discord_user_id) DO UPDATE SET
       voice_id = excluded.voice_id,
       updated_at = datetime('now')`,
    [discordUserId, voiceId]
  );
  save();
}

function clearVoicePreference(discordUserId) {
  db.run("DELETE FROM voice_preferences WHERE discord_user_id = ?", [discordUserId]);
  save();
}

function listAllVoicePreferences() {
  return queryAll('SELECT discord_user_id, voice_id, updated_at FROM voice_preferences');
}

// TikTok handles currently flagged as owner-channel subscribers (voice-
// eligible). Set live by owner-channel chat events (tiktok-direct.js). Used
// by getVoiceAccess and the voice-preference reconcile job to grant/keep
// voice for TikTok Super Fans.
function listSuperfanTiktokHandles() {
  const live = queryAll(
    "SELECT platform_user_id FROM users WHERE platform = 'tiktok' AND is_superfan = 1"
  ).map(r => r.platform_user_id);
  // Union in manually-marked Super Fans so their voice preferences aren't
  // reconciled away and they keep voice access even with no live flag.
  const overrides = queryAll(
    "SELECT platform_user_id FROM superfan_overrides WHERE platform = 'tiktok'"
  ).map(r => r.platform_user_id);
  return [...new Set([...live, ...overrides])];
}

// ─── Per-streamer voice/TTS settings ──────────────────────────────────
function getStreamerVoiceSettings(streamerDiscordId) {
  const row = queryOne(
    `SELECT enabled, trigger_mode, trigger_symbol, updated_at
     FROM voice_streamer_settings WHERE streamer_discord_id = ?`,
    [streamerDiscordId]
  );
  if (!row) {
    return { enabled: 0, trigger_mode: 'prefix', trigger_symbol: '.', updated_at: null };
  }
  return row;
}

function setStreamerVoiceSettings(streamerDiscordId, { enabled, trigger_mode, trigger_symbol }) {
  const current = getStreamerVoiceSettings(streamerDiscordId);
  const next = {
    enabled: enabled !== undefined ? (enabled ? 1 : 0) : current.enabled,
    trigger_mode: trigger_mode || current.trigger_mode,
    trigger_symbol: trigger_symbol || current.trigger_symbol,
  };
  db.run(
    `INSERT INTO voice_streamer_settings
       (streamer_discord_id, enabled, trigger_mode, trigger_symbol, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(streamer_discord_id) DO UPDATE SET
       enabled = excluded.enabled,
       trigger_mode = excluded.trigger_mode,
       trigger_symbol = excluded.trigger_symbol,
       updated_at = excluded.updated_at`,
    [streamerDiscordId, next.enabled, next.trigger_mode, next.trigger_symbol]
  );
  save();
  return next;
}

function listMutedViewers(streamerDiscordId) {
  return queryAll(
    `SELECT viewer_key, muted_at FROM voice_muted_viewers WHERE streamer_discord_id = ?`,
    [streamerDiscordId]
  );
}

function isViewerMuted(streamerDiscordId, viewerKey) {
  const row = queryOne(
    `SELECT 1 FROM voice_muted_viewers WHERE streamer_discord_id = ? AND viewer_key = ?`,
    [streamerDiscordId, viewerKey]
  );
  return !!row;
}

function muteViewer(streamerDiscordId, viewerKey) {
  db.run(
    `INSERT OR IGNORE INTO voice_muted_viewers (streamer_discord_id, viewer_key)
     VALUES (?, ?)`,
    [streamerDiscordId, viewerKey]
  );
  save();
}

function unmuteViewer(streamerDiscordId, viewerKey) {
  db.run(
    `DELETE FROM voice_muted_viewers WHERE streamer_discord_id = ? AND viewer_key = ?`,
    [streamerDiscordId, viewerKey]
  );
  save();
}

// ─── Balances owing (admin-flagged pay-to-play blocks) ───────────────────
// Keys are stored lowercase with any leading @ stripped (admins paste
// handles as "@name" but TikTok chat identities arrive without the @);
// lookups normalize the same way so matching is forgiving.
function _owingKey(value) {
  return String(value || '').trim().toLowerCase().replace(/^@+/, '');
}
function listBalancesOwing() {
  return queryAll(
    `SELECT tiktok_user_id, display_name, amount_dollars, note, active,
            created_at, cleared_at, blocked_count, last_blocked_at
       FROM balances_owing ORDER BY active DESC, created_at DESC`
  );
}

function addBalanceOwing({ tiktokUserId, displayName, amountDollars, note }) {
  const key = _owingKey(tiktokUserId);
  if (!key) throw new Error('tiktokUserId required');
  const amount = Number(amountDollars) || 0;
  // Re-adding a previously cleared viewer reactivates the same row so the
  // block history (blocked_count) carries across.
  db.run(
    `INSERT INTO balances_owing (tiktok_user_id, display_name, amount_dollars, note, active, cleared_at)
     VALUES (?, ?, ?, ?, 1, NULL)
     ON CONFLICT(tiktok_user_id) DO UPDATE SET
       display_name = excluded.display_name,
       amount_dollars = excluded.amount_dollars,
       note = excluded.note,
       active = 1,
       cleared_at = NULL`,
    [key, displayName || null, amount, note || null]
  );
  save();
}

function clearBalanceOwing(tiktokUserId) {
  const key = _owingKey(tiktokUserId);
  // Also match the un-normalized form so rows saved before @-stripping
  // landed (stored WITH the @) can still be cleared from the admin page.
  const rawKey = String(tiktokUserId || '').trim().toLowerCase();
  db.run(
    `UPDATE balances_owing SET active = 0, cleared_at = datetime('now')
      WHERE tiktok_user_id IN (?, ?)`,
    [key, rawKey]
  );
  save();
}

// Hot-path lookup used by relay.js on every TikTok chat message. Checks the
// viewer's platform user id AND username (uniqueId) — whichever the admin
// entered. sql.js is in-memory, so this stays cheap and is always fresh
// (no cache staleness when the admin adds/clears someone mid-stream).
function getActiveBalanceOwing(idOrHandles) {
  const keys = (Array.isArray(idOrHandles) ? idOrHandles : [idOrHandles])
    .map(_owingKey)
    .filter(Boolean);
  if (!keys.length) return null;
  const placeholders = keys.map(() => '?').join(',');
  return queryOne(
    `SELECT tiktok_user_id, display_name, amount_dollars
       FROM balances_owing
      WHERE active = 1 AND tiktok_user_id IN (${placeholders})`,
    keys
  ) || null;
}

function recordOwingBlocked(tiktokUserId) {
  db.run(
    `UPDATE balances_owing
        SET blocked_count = blocked_count + 1, last_blocked_at = datetime('now')
      WHERE tiktok_user_id = ? AND active = 1`,
    [_owingKey(tiktokUserId)]
  );
  save(); // debounced — coalesces rapid blocks into one flush
}

// ─── Voice admin override (staff/mods get voice access without paying) ───
function isVoiceAdmin(discordUserId) {
  const row = queryOne(
    'SELECT 1 FROM voice_admin_override WHERE discord_user_id = ?',
    [discordUserId]
  );
  return !!row;
}

function getVoiceAdmin(discordUserId) {
  return queryOne(
    'SELECT discord_user_id, note, granted_at FROM voice_admin_override WHERE discord_user_id = ?',
    [discordUserId]
  );
}

function grantVoiceAdmin(discordUserId, note) {
  db.run(
    `INSERT INTO voice_admin_override (discord_user_id, note, granted_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(discord_user_id) DO UPDATE SET
       note = excluded.note,
       granted_at = datetime('now')`,
    [discordUserId, note || null]
  );
  save();
}

function revokeVoiceAdmin(discordUserId) {
  db.run('DELETE FROM voice_admin_override WHERE discord_user_id = ?', [discordUserId]);
  save();
}

function listVoiceAdmins() {
  return queryAll('SELECT discord_user_id, note, granted_at FROM voice_admin_override ORDER BY granted_at DESC');
}

// ─── Manual TikTok Super Fan overrides (owner-marked; see table comment) ───
// TikTok handles are stored lowercase and without a leading @, matching the
// users table / relay chat identities. Normalize here so lookups always match.
function _normHandle(platformUserId) {
  return String(platformUserId || '').trim().replace(/^@+/, '').toLowerCase();
}

function isSuperfanOverride(platform, platformUserId) {
  const handle = _normHandle(platformUserId);
  if (!handle) return false;
  const row = queryOne(
    'SELECT 1 FROM superfan_overrides WHERE platform = ? AND platform_user_id = ?',
    [String(platform || 'tiktok'), handle]
  );
  return !!row;
}

// Single source of truth for "is this TikTok handle a Super Fan?" — true by
// EITHER the live is_superfan flag OR a manual owner override. Used by the perk
// bridge (server.js isLinkedTiktokSuperfan / computePremiumById) and relay.js.
function isTiktokSuperfan(platformUserId) {
  const handle = _normHandle(platformUserId);
  if (!handle) return false;
  const u = getUserByPlatform('tiktok', handle);
  if (u && u.is_superfan) return true;
  return isSuperfanOverride('tiktok', handle);
}

function addSuperfanOverride(platform, platformUserId, displayName, note, grantedBy) {
  const handle = _normHandle(platformUserId);
  if (!handle) return;
  db.run(
    `INSERT INTO superfan_overrides (platform, platform_user_id, display_name, note, granted_by, granted_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(platform, platform_user_id) DO UPDATE SET
       display_name = excluded.display_name,
       note = excluded.note,
       granted_by = excluded.granted_by,
       granted_at = datetime('now')`,
    [String(platform || 'tiktok'), handle, displayName || null, note || null, grantedBy || null]
  );
  save();
}

function removeSuperfanOverride(platform, platformUserId) {
  const handle = _normHandle(platformUserId);
  if (!handle) return;
  db.run('DELETE FROM superfan_overrides WHERE platform = ? AND platform_user_id = ?',
    [String(platform || 'tiktok'), handle]);
  save();
}

function listSuperfanOverrides() {
  return queryAll(
    'SELECT platform, platform_user_id, display_name, note, granted_by, granted_at FROM superfan_overrides ORDER BY granted_at DESC'
  );
}

// Live/automatic TikTok Super Fans — flagged by the owner-channel chat pipeline
// (users.is_superfan), NOT manually. Surfaced read-only on the admin page for
// visibility next to the manual overrides.
function listLiveSuperfans() {
  return queryAll(
    "SELECT platform_user_id, display_name FROM users WHERE platform = 'tiktok' AND is_superfan = 1 ORDER BY COALESCE(display_name, platform_user_id)"
  );
}

// Fan-club members of ONE streamer's channel, with whatever profile info the
// chat pipeline has recorded for them. Joined against users because
// fan_club_memberships only stores the identity pair — the admin hub needs a
// display name and avatar to be usable. LEFT JOIN so a membership recorded
// before we ever saw a profile still shows up (handle only).
function listFanClubMembers(streamerHandle, platform = 'tiktok') {
  if (!streamerHandle) return [];
  return queryAll(
    `SELECT m.platform_user_id, m.recorded_at,
            u.display_name, u.username, u.profile_pic, u.is_superfan
       FROM fan_club_memberships m
       LEFT JOIN users u
         ON u.platform = m.platform AND u.platform_user_id = m.platform_user_id
      WHERE m.platform = ? AND m.streamer_handle = ?
      ORDER BY COALESCE(u.display_name, m.platform_user_id)`,
    [platform, String(streamerHandle).toLowerCase()]
  );
}

// Profile info for a batch of TikTok handles — used by the admin hub to put a
// name/avatar on Super Fan rows that only exist as an override row.
function getUserProfiles(platform, platformUserIds) {
  const ids = (platformUserIds || []).filter(Boolean).map(String);
  if (!ids.length) return [];
  const placeholders = ids.map(() => '?').join(',');
  return queryAll(
    `SELECT platform_user_id, display_name, username, profile_pic, is_fan_club, is_superfan
       FROM users WHERE platform = ? AND platform_user_id IN (${placeholders})`,
    [platform, ...ids]
  );
}

// ─── Hint allowance (rollover balance — hints no longer expire) ───────────
function getHintLedger(accountId, monthKey) {
  return queryOne(
    'SELECT account_id, month_key, tier, granted, purchased, used FROM hint_ledger WHERE account_id = ? AND month_key = ?',
    [String(accountId), String(monthKey)]
  );
}

function getHintRemaining(accountId, _monthKey) {
  const row = queryOne(
    'SELECT COALESCE(SUM(granted + purchased - used), 0) AS remaining FROM hint_ledger WHERE account_id = ?',
    [String(accountId)]
  );
  return Math.max(0, row ? Number(row.remaining) : 0);
}

function getHintTotals(accountId) {
  const row = queryOne(
    'SELECT COALESCE(SUM(granted), 0) AS granted, COALESCE(SUM(purchased), 0) AS purchased, COALESCE(SUM(used), 0) AS used FROM hint_ledger WHERE account_id = ?',
    [String(accountId)]
  );
  return {
    granted: row ? Number(row.granted) : 0,
    purchased: row ? Number(row.purchased) : 0,
    used: row ? Number(row.used) : 0,
    remaining: getHintRemaining(accountId),
  };
}

// Ensure this month's grant is at least `allowance`. Never lowers an existing
// grant, so a mid-month tier upgrade (e.g. donor→super fan) raises the cap.
// Because hints now roll over forever, this simply tops up the user's balance
// each month rather than resetting it.
function ensureHintGrant(accountId, monthKey, tier, allowance) {
  const a = Math.max(0, Math.floor(Number(allowance) || 0));
  db.run(
    `INSERT INTO hint_ledger (account_id, month_key, tier, granted, purchased, used, updated_at)
     VALUES (?, ?, ?, ?, 0, 0, datetime('now'))
     ON CONFLICT(account_id, month_key) DO UPDATE SET
       granted = MAX(hint_ledger.granted, excluded.granted),
       tier = excluded.tier,
       updated_at = datetime('now')`,
    [String(accountId), String(monthKey), tier || null, a]
  );
  save();
  return getHintLedger(accountId, monthKey);
}

// Add purchased/granted hints to a ledger row. Idempotent by stripeSessionId if
// provided; returns the new total remaining count.
function purchaseHints(accountId, monthKey, amount, stripeSessionId) {
  const a = Math.max(0, Math.floor(Number(amount) || 0));
  if (a <= 0) return { ok: false, remaining: getHintRemaining(accountId) };

  // Idempotency: don't double-credit the same Stripe session.
  if (stripeSessionId) {
    const existing = queryOne(
      'SELECT 1 AS found FROM hint_recharges WHERE stripe_session_id = ? LIMIT 1',
      [String(stripeSessionId)]
    );
    if (existing) return { ok: true, remaining: getHintRemaining(accountId), duplicated: true };
  }

  db.run(
    `INSERT INTO hint_ledger (account_id, month_key, tier, granted, purchased, used, updated_at)
     VALUES (?, ?, NULL, 0, ?, 0, datetime('now'))
     ON CONFLICT(account_id, month_key) DO UPDATE SET
       purchased = hint_ledger.purchased + excluded.purchased,
       updated_at = datetime('now')`,
    [String(accountId), String(monthKey), a]
  );

  if (stripeSessionId) {
    db.run(
      'INSERT OR IGNORE INTO hint_recharges (account_id, month_key, hints, stripe_session_id, created_at) VALUES (?, ?, ?, ?, datetime("now"))',
      [String(accountId), String(monthKey), a, String(stripeSessionId)]
    );
  }

  save();
  return { ok: true, remaining: getHintRemaining(accountId), amount: a };
}

// Grant free hints (e.g. daily login reward). Uses the 'lifetime' bucket so
// they never expire and do not interfere with monthly donor/superfan grants.
function grantHints(accountId, amount, sourceMonth = 'lifetime') {
  return purchaseHints(accountId, sourceMonth, amount, null);
}

// Spend one hint from the user's rollover balance. Returns { ok, remaining }.
function spendHint(accountId, _monthKey) {
  const total = getHintRemaining(accountId);
  if (total <= 0) return { ok: false, remaining: 0 };

  // Deduct from the oldest row with remaining capacity (FIFO).
  const row = queryOne(
    `SELECT month_key, (granted + purchased - used) AS remaining
       FROM hint_ledger
       WHERE account_id = ? AND (granted + purchased - used) > 0
       ORDER BY month_key ASC
       LIMIT 1`,
    [String(accountId)]
  );
  if (!row) return { ok: false, remaining: 0 };

  db.run(
    "UPDATE hint_ledger SET used = used + 1, updated_at = datetime('now') WHERE account_id = ? AND month_key = ?",
    [String(accountId), row.month_key]
  );
  save();
  return { ok: true, remaining: total - 1 };
}

// Always persist before exposing a receipt, including a retry after a failed save.
function getHintRevealReceipt(accountId, game, actionId) {
  const row = queryOne('SELECT result FROM hint_reveal_receipts WHERE account_id=? AND game=? AND action_id=?', [accountId, game, actionId]);
  if (!row) return null;
  const result = JSON.parse(row.result);
  if (result.deliveryStatus === 'pending' && Date.parse(result.expiresAt) <= Date.now()) return settleHintReveal(accountId, game, actionId, 'cancel', 'hint_expired');
  _flushToDisk(true);
  return { ...result, remaining: getHintRemaining(accountId) };
}

function purchaseHintReveal(input) {
  const { accountId, game, actionId, roundKey, candidates, handle, startTime, source, monthKey } = input;
  const receipt = getHintRevealReceipt(accountId, game, actionId);
  if (receipt) return receipt;
  db.run('BEGIN');
  let result;
  try {
    const used = new Set(queryAll('SELECT position FROM hint_reveal_receipts WHERE account_id=? AND game=? AND round_key=? AND position IS NOT NULL', [accountId, game, roundKey]).map(row => row.position));
    const available = candidates.filter(hint => !used.has(hint.position));
    const total = getHintRemaining(accountId);
    result = { ok: false, reason: input.terminalReason || (available.length ? 'no_hints_remaining' : 'nothing_to_reveal'), remaining: total, handle, startTime, roundKey };
    let position = null;
    if (available.length && total > 0) {
      const row = queryOne(`SELECT month_key FROM hint_ledger WHERE account_id=? AND (granted+purchased-used)>0 ORDER BY month_key ASC LIMIT 1`, [accountId]);
      if (!row) throw Error('Hint balance changed');
      const hint = available[Math.floor(Math.random() * available.length)];
      position = hint.position;
      db.run("UPDATE hint_ledger SET used=used+1, updated_at=datetime('now') WHERE account_id=? AND month_key=?", [accountId, row.month_key]);
      result = { ok: true, remaining: total-1, source: source || 'free', monthKey, handle, startTime, roundKey, hint };
      if (input.deliveryPending) Object.assign(result, { deliveryStatus: 'pending', debitMonth: row.month_key, expiresAt: new Date(Date.now() + 600000).toISOString() });
    }
    db.run('INSERT INTO hint_reveal_receipts (account_id,game,action_id,round_key,position,result) VALUES (?,?,?,?,?,?)', [accountId,game,actionId,roundKey,position,JSON.stringify(result)]);
    if (result.deliveryStatus === 'pending') db.run('INSERT INTO hint_reveal_pending (account_id,game,action_id,expires_at) VALUES (?,?,?,?)', [accountId,game,actionId,result.expiresAt]);
    db.run('COMMIT');
  } catch (error) { db.run('ROLLBACK'); throw error; }
  // A save failure returns no reveal. Retrying finds the same in-memory receipt;
  // loss of unsaved memory discards both the debit and reveal together.
  _flushToDisk(true);
  return result;
}

// Settlement is idempotent. Delivered reveals cannot later be refunded;
// cancelled or expired provisional debits release their reserved position.
function settleHintReveal(accountId, game, actionId, disposition, reason, persist = true) {
  const row = queryOne('SELECT result FROM hint_reveal_receipts WHERE account_id=? AND game=? AND action_id=?', [accountId, game, actionId]);
  if (!row) return null;
  let result = JSON.parse(row.result);
  if (result.deliveryStatus === 'pending') {
    db.run('BEGIN');
    try {
      const expired = Date.parse(result.expiresAt) <= Date.now();
      if (disposition === 'cancel' || expired) {
        const debit = queryOne('SELECT used FROM hint_ledger WHERE account_id=? AND month_key=?', [accountId, result.debitMonth]);
        if (!debit || debit.used < 1) throw Error('Missing reserved hint debit');
        db.run("UPDATE hint_ledger SET used=used-1, updated_at=datetime('now') WHERE account_id=? AND month_key=?", [accountId, result.debitMonth]);
        const { hint, debitMonth, ...rest } = result;
        result = { ...rest, ok: false, reason: expired ? 'hint_expired' : reason, deliveryStatus: 'cancelled', remaining: getHintRemaining(accountId) };
        db.run('UPDATE hint_reveal_receipts SET position=NULL WHERE account_id=? AND game=? AND action_id=?', [accountId, game, actionId]);
      } else {
        result = { ...result, deliveryStatus: 'delivered', deliveredAt: new Date().toISOString() };
      }
      db.run('UPDATE hint_reveal_receipts SET result=? WHERE account_id=? AND game=? AND action_id=?', [JSON.stringify(result), accountId, game, actionId]);
      db.run('DELETE FROM hint_reveal_pending WHERE account_id=? AND game=? AND action_id=?', [accountId, game, actionId]);
      db.run('COMMIT');
    } catch (error) { db.run('ROLLBACK'); throw error; }
  }
  if (persist) _flushToDisk(true);
  return { ...result, remaining: getHintRemaining(accountId) };
}

let _hintExpiryDirty = false;
function expirePendingHintReveals(limit = 20) {
  const rows = queryAll('SELECT account_id,game,action_id FROM hint_reveal_pending WHERE expires_at<=? ORDER BY expires_at LIMIT ?', [new Date().toISOString(), Math.min(100, Math.max(1, Number(limit) || 20))]);
  const accounts = new Set();
  if (rows.length) _hintExpiryDirty = true;
  for (const row of rows) {
    settleHintReveal(row.account_id, row.game, row.action_id, 'cancel', 'hint_expired', false);
    accounts.add(row.account_id);
  }
  if (_hintExpiryDirty) { _flushToDisk(true); _hintExpiryDirty = false; }
  return [...accounts];
}

// ─── Searchle Discord Companion Bot ─────────────────────────────────

function getSearchleDiscordPuzzle(guildId, puzzleDate) {
  return queryOne(
    `SELECT * FROM searchle_discord_daily_puzzles
     WHERE guild_id = ? AND puzzle_date = ?`,
    [guildId, puzzleDate]
  );
}

function upsertSearchleDiscordPuzzle(guildId, puzzleDate, targetWord, sourceGameId = 'searchle-discord') {
  db.run(
    `INSERT INTO searchle_discord_daily_puzzles (guild_id, puzzle_date, target_word, source_game_id)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(guild_id, puzzle_date)
     DO UPDATE SET target_word = excluded.target_word, source_game_id = excluded.source_game_id`,
    [guildId, puzzleDate, targetWord, sourceGameId]
  );
  save();
  return getSearchleDiscordPuzzle(guildId, puzzleDate);
}

function recordSearchleDiscordGuess({
  guildId,
  puzzleDate,
  userId,
  username,
  displayName,
  guessWord,
  normalizedWord,
  rank,
  isWin
}) {
  const existing = queryOne(
    `SELECT * FROM searchle_discord_guesses
     WHERE guild_id = ? AND puzzle_date = ? AND user_id = ? AND normalized_word = ?`,
    [guildId, puzzleDate, userId, normalizedWord]
  );
  if (existing) {
    return { ok: true, duplicate: true, guess: existing };
  }

  db.run(
    `INSERT INTO searchle_discord_guesses
       (guild_id, puzzle_date, user_id, username, display_name, guess_word, normalized_word, rank, is_win)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      guildId,
      puzzleDate,
      userId,
      username || null,
      displayName || username || userId,
      guessWord,
      normalizedWord,
      rank,
      isWin ? 1 : 0
    ]
  );
  save();

  const guess = queryOne(
    `SELECT * FROM searchle_discord_guesses WHERE id = last_insert_rowid()`
  );
  return { ok: true, duplicate: false, guess };
}

function getSearchleDiscordUserSummary(guildId, puzzleDate, userId) {
  const row = queryOne(
    `SELECT
       COUNT(*) AS attempts,
       MIN(rank) AS best_rank,
       MAX(is_win) AS solved
     FROM searchle_discord_guesses
     WHERE guild_id = ? AND puzzle_date = ? AND user_id = ?`,
    [guildId, puzzleDate, userId]
  );

  return {
    attempts: Number(row?.attempts || 0),
    bestRank: row?.best_rank != null ? Number(row.best_rank) : null,
    solved: !!Number(row?.solved || 0)
  };
}

function getSearchleDiscordLeaderboard(guildId, puzzleDate, limit = 10) {
  const rows = queryAll(
    `SELECT
       user_id,
       MAX(display_name) AS display_name,
       MAX(username) AS username,
       MIN(rank) AS best_rank,
       COUNT(*) AS attempts,
       MAX(is_win) AS solved,
       MIN(created_at) AS first_at
     FROM searchle_discord_guesses
     WHERE guild_id = ? AND puzzle_date = ?
     GROUP BY user_id
     ORDER BY solved DESC, best_rank ASC, attempts ASC, first_at ASC
     LIMIT ?`,
    [guildId, puzzleDate, limit]
  );

  return rows.map((row, index) => ({
    position: index + 1,
    userId: row.user_id,
    displayName: row.display_name || row.username || row.user_id,
    username: row.username || null,
    bestRank: row.best_rank != null ? Number(row.best_rank) : null,
    attempts: Number(row.attempts || 0),
    solved: !!Number(row.solved || 0),
    firstAt: row.first_at || null
  }));
}

function getSearchleDiscordRecentGuesses(guildId, puzzleDate, userId, limit = 5) {
  const rows = queryAll(
    `SELECT normalized_word, rank, is_win, created_at
     FROM searchle_discord_guesses
     WHERE guild_id = ? AND puzzle_date = ? AND user_id = ?
     ORDER BY created_at DESC, id DESC
     LIMIT ?`,
    [guildId, puzzleDate, userId, limit]
  );

  return rows.map((row) => ({
    normalizedWord: row.normalized_word,
    rank: row.rank != null ? Number(row.rank) : null,
    isWin: !!Number(row.is_win || 0),
    createdAt: row.created_at || null
  }));
}

function getSearchleDiscordUserPosition(guildId, puzzleDate, userId) {
  const rows = queryAll(
    `SELECT
       user_id,
       MIN(rank) AS best_rank,
       COUNT(*) AS attempts,
       MAX(is_win) AS solved,
       MIN(created_at) AS first_at
     FROM searchle_discord_guesses
     WHERE guild_id = ? AND puzzle_date = ?
     GROUP BY user_id
     ORDER BY solved DESC, best_rank ASC, attempts ASC, first_at ASC`,
    [guildId, puzzleDate]
  );

  const index = rows.findIndex((row) => row.user_id === userId);
  return index >= 0 ? index + 1 : null;
}

function getSearchleDiscordCurrentStreak(guildId, userId) {
  const rows = queryAll(
    `SELECT DISTINCT puzzle_date
     FROM searchle_discord_guesses
     WHERE guild_id = ? AND user_id = ? AND is_win = 1
     ORDER BY puzzle_date DESC`,
    [guildId, userId]
  );

  if (!rows.length) return 0;

  const solvedDates = rows.map((row) => row.puzzle_date).filter(Boolean);
  let streak = 0;
  let expected = null;

  for (const dateStr of solvedDates) {
    const current = new Date(`${dateStr}T00:00:00Z`);
    if (Number.isNaN(current.getTime())) continue;
    if (!expected) {
      expected = current;
      streak = 1;
      continue;
    }

    expected = new Date(expected.getTime() - 24 * 60 * 60 * 1000);
    if (current.toISOString().slice(0, 10) === expected.toISOString().slice(0, 10)) {
      streak += 1;
      continue;
    }
    break;
  }

  return streak;
}

function getSearchleDiscordPuzzleStats(guildId, puzzleDate) {
  const row = queryOne(
    `SELECT
       COUNT(*) AS total_guesses,
       COUNT(DISTINCT user_id) AS player_count,
       COUNT(DISTINCT CASE WHEN is_win = 1 THEN user_id END) AS solved_count
     FROM searchle_discord_guesses
     WHERE guild_id = ? AND puzzle_date = ?`,
    [guildId, puzzleDate]
  );

  return {
    totalGuesses: Number(row?.total_guesses || 0),
    playerCount: Number(row?.player_count || 0),
    solvedCount: Number(row?.solved_count || 0)
  };
}

function getSearchleDiscordTopGuesses(guildId, puzzleDate, limit = 5) {
  const rows = queryAll(
    `SELECT
       normalized_word,
       MIN(rank) AS best_rank,
       MAX(display_name) AS display_name,
       MIN(created_at) AS first_at
     FROM searchle_discord_guesses
     WHERE guild_id = ? AND puzzle_date = ?
     GROUP BY normalized_word
     ORDER BY best_rank ASC, first_at ASC
     LIMIT ?`,
    [guildId, puzzleDate, limit]
  );

  return rows.map((row, index) => ({
    position: index + 1,
    normalizedWord: row.normalized_word,
    bestRank: row.best_rank != null ? Number(row.best_rank) : null,
    displayName: row.display_name || null,
    firstAt: row.first_at || null
  }));
}

// ─── Chat Messages (12-hour history) ─────────────────────────────────

const CHAT_HISTORY_HOURS = 12;
const CHAT_HISTORY_LIMIT = 200; // max messages to return per room

function saveChatMessage(room, msg) {
  db.run(
    `INSERT OR IGNORE INTO chat_messages (id, room, timestamp, data) VALUES (?, ?, ?, ?)`,
    [msg.id, room, msg.timestamp, JSON.stringify(msg)]
  );
  save();
}

function getChatHistory(room, hoursBack = CHAT_HISTORY_HOURS) {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  const rows = queryAll(
    `SELECT data FROM chat_messages WHERE room = ? AND timestamp > ? ORDER BY timestamp ASC LIMIT ?`,
    [room, cutoff, CHAT_HISTORY_LIMIT]
  );
  return rows.map(r => {
    try { return JSON.parse(r.data); }
    catch (e) { return null; }
  }).filter(Boolean);
}

function cleanOldChatMessages(hoursBack = CHAT_HISTORY_HOURS) {
  const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();
  db.run(`DELETE FROM chat_messages WHERE timestamp < ?`, [cutoff]);
  const compacted = maybeCompactDatabase({ reason: `chat-cleanup-${hoursBack}h` });
  save();
  const remaining = queryScalar(`SELECT COUNT(*) as c FROM chat_messages`);
  console.log(
    `[DB] Chat cleanup: removed messages older than ${hoursBack}h, ${remaining} remaining` +
    (compacted ? ' compacted=1' : '')
  );
}

// ─── Social Feed (feed_events / feed_reactions / feed_comments) ──────

const FEED_MAX_EVENTS = 5000;
const FEED_RETENTION_DAYS = 30;
const FEED_COMMENTS_LIMIT = 200; // max comments returned per event

function parseJsonOrNull(text) {
  if (!text) return null;
  try { return JSON.parse(text); } catch (e) { return null; }
}

// Insert one feed event. Caller passes the already-shaped event (src/feed.js
// owns the shaping); returns the new row id.
function insertFeedEvent(evt) {
  db.run(
    `INSERT INTO feed_events (ts, event_type, game, game_name, value, value_label, user_json, detail_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      evt.ts,
      evt.eventType,
      evt.game || null,
      evt.gameName || null,
      (typeof evt.value === 'number' && isFinite(evt.value)) ? evt.value : null,
      evt.valueLabel || null,
      JSON.stringify(evt.user || {}),
      evt.detail ? JSON.stringify(evt.detail) : null
    ]
  );
  const id = Number(queryScalar('SELECT last_insert_rowid()'));
  save();
  return id;
}

// Paginated newest-first read with aggregated reaction counts + comment
// counts. `userId` (optional) also returns which emojis that user pressed.
function getFeedEvents({ beforeId = null, limit = 30, userId = null } = {}) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || 30, 1), 100);
  const rows = beforeId
    ? queryAll(`SELECT * FROM feed_events WHERE id < ? ORDER BY id DESC LIMIT ?`, [beforeId, lim])
    : queryAll(`SELECT * FROM feed_events ORDER BY id DESC LIMIT ?`, [lim]);
  if (rows.length === 0) return [];

  const ids = rows.map(r => r.id);
  const ph = ids.map(() => '?').join(',');
  const reactionCounts = {}; // eventId -> { emoji: n }
  queryAll(
    `SELECT event_id, emoji, COUNT(*) AS n FROM feed_reactions WHERE event_id IN (${ph}) GROUP BY event_id, emoji`,
    ids
  ).forEach(r => {
    (reactionCounts[r.event_id] = reactionCounts[r.event_id] || {})[r.emoji] = Number(r.n);
  });
  const myReactions = {}; // eventId -> [emoji]
  if (userId) {
    queryAll(
      `SELECT event_id, emoji FROM feed_reactions WHERE user_id = ? AND event_id IN (${ph})`,
      [userId, ...ids]
    ).forEach(r => {
      (myReactions[r.event_id] = myReactions[r.event_id] || []).push(r.emoji);
    });
  }
  const commentCounts = {}; // eventId -> n
  queryAll(
    `SELECT event_id, COUNT(*) AS n FROM feed_comments WHERE event_id IN (${ph}) GROUP BY event_id`,
    ids
  ).forEach(r => { commentCounts[r.event_id] = Number(r.n); });

  return rows.map(r => ({
    id: r.id,
    ts: Number(r.ts),
    eventType: r.event_type,
    game: r.game,
    gameName: r.game_name,
    value: r.value != null ? Number(r.value) : null,
    valueLabel: r.value_label,
    user: parseJsonOrNull(r.user_json) || {},
    detail: parseJsonOrNull(r.detail_json),
    reactions: reactionCounts[r.id] || {},
    myReactions: myReactions[r.id] || [],
    commentCount: commentCounts[r.id] || 0
  }));
}

// Toggle a reaction. Returns { reacted, reactions } or null if the event
// doesn't exist (pruned or bogus id).
function toggleFeedReaction(eventId, userId, emoji) {
  const exists = queryOne(`SELECT id FROM feed_events WHERE id = ?`, [eventId]);
  if (!exists) return null;
  const had = queryOne(
    `SELECT 1 AS x FROM feed_reactions WHERE event_id = ? AND user_id = ? AND emoji = ?`,
    [eventId, userId, emoji]
  );
  if (had) {
    db.run(`DELETE FROM feed_reactions WHERE event_id = ? AND user_id = ? AND emoji = ?`, [eventId, userId, emoji]);
  } else {
    db.run(`INSERT OR IGNORE INTO feed_reactions (event_id, user_id, emoji) VALUES (?, ?, ?)`, [eventId, userId, emoji]);
  }
  save();
  const reactions = {};
  queryAll(`SELECT emoji, COUNT(*) AS n FROM feed_reactions WHERE event_id = ? GROUP BY emoji`, [eventId])
    .forEach(r => { reactions[r.emoji] = Number(r.n); });
  return { reacted: !had, reactions };
}

// Append a comment. Returns the stored comment (with id) or null if the
// event doesn't exist.
function addFeedComment(eventId, userId, user, text) {
  const exists = queryOne(`SELECT id FROM feed_events WHERE id = ?`, [eventId]);
  if (!exists) return null;
  const createdAt = Date.now();
  db.run(
    `INSERT INTO feed_comments (event_id, user_id, user_json, text, created_at) VALUES (?, ?, ?, ?, ?)`,
    [eventId, userId, JSON.stringify(user || {}), text, createdAt]
  );
  const id = Number(queryScalar('SELECT last_insert_rowid()'));
  const commentCount = Number(queryScalar(`SELECT COUNT(*) FROM feed_comments WHERE event_id = ?`, [eventId]));
  save();
  return { id, eventId, userId, user: user || {}, text, createdAt, commentCount };
}

function getFeedComments(eventId, limit = FEED_COMMENTS_LIMIT) {
  const lim = Math.min(Math.max(parseInt(limit, 10) || FEED_COMMENTS_LIMIT, 1), FEED_COMMENTS_LIMIT);
  return queryAll(
    `SELECT * FROM feed_comments WHERE event_id = ? ORDER BY id ASC LIMIT ?`,
    [eventId, lim]
  ).map(r => ({
    id: r.id,
    eventId: r.event_id,
    userId: r.user_id,
    user: parseJsonOrNull(r.user_json) || {},
    text: r.text,
    createdAt: Number(r.created_at)
  }));
}

// Delete a comment. Owners can always delete their own; pass isAdmin=true
// to allow moderation deletes. Returns { deleted, eventId, commentCount }.
function deleteFeedComment(commentId, userId, isAdmin = false) {
  const row = queryOne(`SELECT id, event_id, user_id FROM feed_comments WHERE id = ?`, [commentId]);
  if (!row) return { deleted: false };
  if (!isAdmin && String(row.user_id) !== String(userId)) return { deleted: false };
  db.run(`DELETE FROM feed_comments WHERE id = ?`, [commentId]);
  const commentCount = Number(queryScalar(`SELECT COUNT(*) FROM feed_comments WHERE event_id = ?`, [row.event_id]));
  save();
  return { deleted: true, eventId: row.event_id, commentCount };
}

// Retention: age out events past FEED_RETENTION_DAYS and enforce the hard
// row cap, cascading orphaned reactions/comments. Called hourly by src/feed.js.
function pruneFeedEvents({ days = FEED_RETENTION_DAYS, maxRows = FEED_MAX_EVENTS } = {}) {
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  db.run(`DELETE FROM feed_events WHERE ts < ?`, [cutoff]);
  const minKeepId = queryScalar(
    `SELECT id FROM feed_events ORDER BY id DESC LIMIT 1 OFFSET ?`,
    [maxRows - 1]
  );
  if (minKeepId != null) {
    db.run(`DELETE FROM feed_events WHERE id < ?`, [minKeepId]);
  }
  db.run(`DELETE FROM feed_reactions WHERE event_id NOT IN (SELECT id FROM feed_events)`);
  db.run(`DELETE FROM feed_comments WHERE event_id NOT IN (SELECT id FROM feed_events)`);
  save();
  const remaining = Number(queryScalar(`SELECT COUNT(*) FROM feed_events`));
  return remaining;
}

// ─── Site usage tracking (wordtycoon.live page views) ────────────────

function utcDay(offsetDays = 0) {
  return new Date(Date.now() - offsetDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// One page view. Increments the (day, page) counter, the daily visitor
// counter (drives uniques), and the referrer counter when present.
// save() is debounced, so bursts coalesce into one disk flush.
function recordUsageView({ day, page, visitor, referrerHost }) {
  db.run(
    `INSERT INTO usage_daily_pages (day, page, views) VALUES (?, ?, 1)
     ON CONFLICT(day, page) DO UPDATE SET views = views + 1`,
    [day, page]
  );
  if (visitor) {
    db.run(
      `INSERT INTO usage_daily_visitors (day, visitor, views) VALUES (?, ?, 1)
       ON CONFLICT(day, visitor) DO UPDATE SET views = views + 1`,
      [day, visitor]
    );
  }
  if (referrerHost) {
    db.run(
      `INSERT INTO usage_daily_referrers (day, host, views) VALUES (?, ?, 1)
       ON CONFLICT(day, host) DO UPDATE SET views = views + 1`,
      [day, referrerHost]
    );
  }
  save();
}

// Day-by-day views + unique visitors for the last N days, zero-filled so
// the chart never has holes on quiet days.
function getUsageDailySeries(days) {
  const cutoff = utcDay(days - 1);
  const viewRows = queryAll(
    `SELECT day, SUM(views) AS views FROM usage_daily_pages WHERE day >= ? GROUP BY day`,
    [cutoff]
  );
  const uniqueRows = queryAll(
    `SELECT day, COUNT(*) AS uniques FROM usage_daily_visitors WHERE day >= ? GROUP BY day`,
    [cutoff]
  );
  const byDay = new Map();
  for (const r of viewRows) byDay.set(r.day, { day: r.day, views: Number(r.views), uniques: 0 });
  for (const r of uniqueRows) {
    const entry = byDay.get(r.day) || { day: r.day, views: 0, uniques: 0 };
    entry.uniques = Number(r.uniques);
    byDay.set(r.day, entry);
  }
  const series = [];
  for (let i = days - 1; i >= 0; i--) {
    const day = utcDay(i);
    series.push(byDay.get(day) || { day, views: 0, uniques: 0 });
  }
  return series;
}

function getUsageTopPages(days, limit = 25) {
  const cutoff = utcDay(days - 1);
  return queryAll(
    `SELECT page, SUM(views) AS views FROM usage_daily_pages
     WHERE day >= ? GROUP BY page ORDER BY views DESC LIMIT ?`,
    [cutoff, limit]
  ).map(r => ({ page: r.page, views: Number(r.views) }));
}

function getUsageTopReferrers(days, limit = 15) {
  const cutoff = utcDay(days - 1);
  return queryAll(
    `SELECT host, SUM(views) AS views FROM usage_daily_referrers
     WHERE day >= ? GROUP BY host ORDER BY views DESC LIMIT ?`,
    [cutoff, limit]
  ).map(r => ({ host: r.host, views: Number(r.views) }));
}

// Privacy-preserving conversion events. These are aggregate counters only:
// no IP address, user id, share payload, or other free-form value is stored.
function recordUsageEvent({ day, event, page, label = '', source = '', medium = '', campaign = '' }) {
  db.run(
    `INSERT INTO usage_daily_events
       (day, event, page, label, source, medium, campaign, events)
     VALUES (?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(day, event, page, label, source, medium, campaign)
     DO UPDATE SET events = events + 1`,
    [day, event, page, label, source, medium, campaign]
  );
  save();
}

function getUsageTopEvents(days, limit = 50) {
  const cutoff = utcDay(days - 1);
  return queryAll(
    `SELECT event, page, label, source, medium, campaign, SUM(events) AS events
       FROM usage_daily_events
      WHERE day >= ?
      GROUP BY event, page, label, source, medium, campaign
      ORDER BY events DESC LIMIT ?`,
    [cutoff, limit]
  ).map(r => ({
    event: r.event,
    page: r.page,
    label: r.label,
    source: r.source,
    medium: r.medium,
    campaign: r.campaign,
    events: Number(r.events)
  }));
}

function getUsageTotals() {
  const windowTotals = (days) => {
    const cutoff = utcDay(days - 1);
    const views = Number(queryScalar(`SELECT SUM(views) FROM usage_daily_pages WHERE day >= ?`, [cutoff]) || 0);
    const uniques = Number(queryScalar(`SELECT COUNT(*) FROM usage_daily_visitors WHERE day >= ?`, [cutoff]) || 0);
    return { views, uniques };
  };
  return {
    today: windowTotals(1),
    last7: windowTotals(7),
    last30: windowTotals(30),
    // Visitor hashes rotate daily, so a true all-time unique count doesn't
    // exist — all-time is views only.
    allTimeViews: Number(queryScalar(`SELECT SUM(views) FROM usage_daily_pages`) || 0)
  };
}

// Keep every aggregate usage table bounded to the same retention window.
function pruneUsageData(retainDays = 400) {
  const cutoff = utcDay(retainDays);
  db.run(`DELETE FROM usage_daily_pages WHERE day < ?`, [cutoff]);
  db.run(`DELETE FROM usage_daily_visitors WHERE day < ?`, [cutoff]);
  db.run(`DELETE FROM usage_daily_referrers WHERE day < ?`, [cutoff]);
  db.run(`DELETE FROM usage_daily_events WHERE day < ?`, [cutoff]);
  save();
}

// Ensure data is flushed on process exit (do NOT call process.exit — let server.js handle shutdown)
process.on('exit', () => { _flushToDisk(); });
process.on('SIGINT', () => { _flushToDisk(); });
process.on('SIGTERM', () => { _flushToDisk(); });

// ─── Junk Drawer (junkdrawer.live) score helpers ───

// True if the user already has a row for this mode/day (drives the
// XP-only-on-first-daily-submit rule in src/junkdrawer.js).
function hasJunkdrawerEntry(mode, day, userId) {
  return !!queryOne(
    'SELECT 1 FROM junkdrawer_scores WHERE mode = ? AND day = ? AND user_id = ?',
    [mode, day, userId]
  );
}

// Insert or best-score-update a user's row. Returns { best, firstSubmit }.
function upsertJunkdrawerScore({ userId, displayName, avatar, mode, day, score, merges, biggest, xpAwarded }) {
  const existing = queryOne(
    'SELECT id, score FROM junkdrawer_scores WHERE user_id = ? AND mode = ? AND day = ?',
    [userId, mode, day]
  );
  if (!existing) {
    db.run(
      `INSERT INTO junkdrawer_scores (user_id, display_name, avatar, mode, day, score, merges, biggest, xp_awarded, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [userId, displayName, avatar, mode, day, score, merges, biggest, xpAwarded]
    );
    save();
    return { best: score, firstSubmit: true };
  }
  if (score > existing.score) {
    db.run(
      `UPDATE junkdrawer_scores
         SET score = ?, merges = ?, biggest = ?, display_name = ?, avatar = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [score, merges, biggest, displayName, avatar, existing.id]
    );
    save();
    return { best: score, firstSubmit: false };
  }
  return { best: existing.score, firstSubmit: false };
}

function getJunkdrawerTop(mode, day, limit = 20) {
  return queryAll(
    `SELECT display_name, avatar, score, biggest FROM junkdrawer_scores
     WHERE mode = ? AND day = ?
     ORDER BY score DESC, updated_at ASC
     LIMIT ?`,
    [mode, day, limit]
  );
}

function getJunkdrawerProfile(userId) {
  const row = queryOne('SELECT profile FROM junkdrawer_profiles WHERE user_id = ?', [userId]);
  if (!row) return null;
  try { return JSON.parse(row.profile); } catch (e) { return null; }
}

function upsertJunkdrawerProfile(userId, profileObj) {
  const json = JSON.stringify(profileObj);
  const existing = queryOne('SELECT user_id FROM junkdrawer_profiles WHERE user_id = ?', [userId]);
  if (existing) {
    db.run(`UPDATE junkdrawer_profiles SET profile = ?, updated_at = datetime('now') WHERE user_id = ?`, [json, userId]);
  } else {
    db.run('INSERT INTO junkdrawer_profiles (user_id, profile) VALUES (?, ?)', [userId, json]);
  }
  save();
}

// Profile changes and their receipts share one in-memory SQL transaction.
// A durable journal precedes this method; strict snapshot failure propagates
// so recovery can retry the same immutable action without granting it twice.
function getJunkdrawerProfileReceipt(eventId) {
  return queryOne('SELECT * FROM junkdrawer_profile_receipts WHERE event_id = ?', [eventId]);
}
function commitJunkdrawerProfileRecord(record) {
  const receipt = getJunkdrawerProfileReceipt(record.eventId);
  if (receipt) {
    if (receipt.user_id !== record.userId || receipt.record_hash !== record.recordHash) throw Error('Profile receipt conflict');
    _flushToDisk(true);
    return { fresh: false, profile: getJunkdrawerProfile(record.userId), outcome: JSON.parse(receipt.outcome) };
  }
  const old = getJunkdrawerProfile(record.userId);
  if ((old?._revision || 0) !== record.oldRevision) throw Error('Profile revision conflict');
  db.run('BEGIN');
  try {
    db.run(`INSERT INTO junkdrawer_profiles (user_id, profile) VALUES (?, ?)
      ON CONFLICT(user_id) DO UPDATE SET profile = excluded.profile, updated_at = datetime('now')`,
      [record.userId, JSON.stringify(record.profile)]);
    db.run(`INSERT INTO junkdrawer_profile_receipts (event_id,user_id,revision,record_hash,outcome) VALUES (?,?,?,?,?)`,
      [record.eventId,record.userId,record.profile._revision,record.recordHash,JSON.stringify(record.outcome)]);
    db.run('COMMIT');
  } catch (error) { db.run('ROLLBACK'); throw error; }
  _flushToDisk(true);
  return { fresh: true, profile: record.profile, outcome: record.outcome };
}

// Returns { score, rank } for one user, or null if they have no entry.
function getJunkdrawerUserEntry(mode, day, userId) {
  const row = queryOne(
    'SELECT score FROM junkdrawer_scores WHERE mode = ? AND day = ? AND user_id = ?',
    [mode, day, userId]
  );
  if (!row) return null;
  const better = queryScalar(
    'SELECT COUNT(*) FROM junkdrawer_scores WHERE mode = ? AND day = ? AND score > ?',
    [mode, day, row.score]
  );
  return { score: row.score, rank: (better || 0) + 1 };
}

function getLetterworksValue(key) {
  const row = queryOne('SELECT value FROM letterworks_state WHERE key = ?', [key]);
  if (!row) return null;
  try { return JSON.parse(row.value); } catch { return null; }
}
function setLetterworksValue(key, value) {
  db.run(`INSERT INTO letterworks_state(key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`, [key, JSON.stringify(value)]);
  save();
}
function reserveLetterworksValue(key, value) {
  db.run('INSERT OR IGNORE INTO letterworks_state(key, value) VALUES (?, ?)', [key, JSON.stringify(value)]);
  const inserted = db.getRowsModified() > 0; if (inserted) save(); return inserted;
}
function upsertLetterworksScore({ userId, name, avatar, day, score, words }) {
  db.run(`INSERT INTO letterworks_scores(user_id, day, display_name, avatar, score, words)
    VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(user_id, day) DO UPDATE SET
    display_name = excluded.display_name, avatar = excluded.avatar, score = excluded.score,
    words = excluded.words, updated_at = datetime('now') WHERE excluded.score > letterworks_scores.score`,
    [userId, day, name, avatar, score, words]);
  save();
}
function getLetterworksTop(day) {
  return queryAll(`SELECT display_name AS name, avatar, score, words FROM letterworks_scores
    WHERE day = ? ORDER BY score DESC, updated_at ASC LIMIT 20`, [day]);
}

// ─── Cloud Quarry score helpers ───

function hasCloudQuarryEntry(day, userId) {
  return !!queryOne(
    'SELECT 1 FROM cloudquarry_scores WHERE day = ? AND user_id = ?',
    [day, userId]
  );
}

function upsertCloudQuarryScore({ userId, displayName, avatar, day, durationMs, shots, maxCombo, xpAwarded }) {
  const existing = queryOne(
    'SELECT id, duration_ms, shots FROM cloudquarry_scores WHERE user_id = ? AND day = ?',
    [userId, day]
  );
  if (!existing) {
    db.run(
      `INSERT INTO cloudquarry_scores
       (user_id, display_name, avatar, day, duration_ms, shots, max_combo, xp_awarded, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [userId, displayName, avatar, day, durationMs, shots, maxCombo, xpAwarded]
    );
    save();
    return { bestMs: durationMs, firstSubmit: true };
  }
  const isBetter = durationMs < existing.duration_ms ||
    (durationMs === existing.duration_ms && shots < existing.shots);
  if (isBetter) {
    db.run(
      `UPDATE cloudquarry_scores
          SET duration_ms = ?, shots = ?, max_combo = ?, display_name = ?, avatar = ?, updated_at = datetime('now')
        WHERE id = ?`,
      [durationMs, shots, maxCombo, displayName, avatar, existing.id]
    );
    save();
    return { bestMs: durationMs, firstSubmit: false };
  }
  return { bestMs: existing.duration_ms, firstSubmit: false };
}

function getCloudQuarryTop(day, limit = 20) {
  return queryAll(
    `SELECT display_name, avatar, duration_ms, shots, max_combo
       FROM cloudquarry_scores
      WHERE day = ?
      ORDER BY duration_ms ASC, shots ASC, updated_at ASC
      LIMIT ?`,
    [day, limit]
  );
}

function getCloudQuarryUserEntry(day, userId) {
  const row = queryOne(
    'SELECT duration_ms, shots, max_combo FROM cloudquarry_scores WHERE day = ? AND user_id = ?',
    [day, userId]
  );
  if (!row) return null;
  const better = queryScalar(
    `SELECT COUNT(*) FROM cloudquarry_scores
      WHERE day = ? AND (duration_ms < ? OR (duration_ms = ? AND shots < ?))`,
    [day, row.duration_ms, row.duration_ms, row.shots]
  );
  return {
    durationMs: row.duration_ms,
    shots: row.shots,
    maxCombo: row.max_combo,
    rank: (better || 0) + 1,
  };
}

// A durable hosted claim owns its raw XP column; clients cannot set this.
function setHostedDailyXp(game, userId, day, xp) {
  const tables = { junkdrawer: 'junkdrawer_scores', cloudquarry: 'cloudquarry_scores', synapse: 'synapse_scores' };
  const table = Object.hasOwn(tables, game) ? tables[game] : null;
  if (!table || !Number.isSafeInteger(xp) || xp < 0) throw new Error('Invalid hosted reward state');
  db.run('UPDATE ' + table + ' SET xp_awarded = ? WHERE user_id = ? AND day = ?' + (game === 'junkdrawer' ? ' AND mode = ?' : ''),
    game === 'junkdrawer' ? [xp, String(userId), day, 'daily'] : [xp, String(userId), day]);
  save();
}

// ─── Synapse (wordtycoon.live/synapse) helpers ───

function getSynapseDay(day) {
  return queryOne('SELECT word_a, word_b, game_no FROM synapse_days WHERE day = ?', [day]);
}

function setSynapseDay(day, wordA, wordB, gameNo) {
  db.run('INSERT OR IGNORE INTO synapse_days (day, word_a, word_b, game_no) VALUES (?, ?, ?, ?)',
    [day, wordA, wordB, gameNo]);
  save();
}

// True if the user already has a daily row (drives XP-only-on-first-win).
function hasSynapseEntry(day, userId) {
  return !!queryOne('SELECT 1 FROM synapse_scores WHERE day = ? AND user_id = ?', [day, userId]);
}

// Insert or improve a user's daily row. Fewer words wins; on a tie the
// higher average link strength wins. Returns { best } (best words_used).
function upsertSynapseScore({ userId, displayName, avatar, day, wordsUsed, avgLink, xpAwarded }) {
  const existing = queryOne(
    'SELECT id, words_used, avg_link FROM synapse_scores WHERE user_id = ? AND day = ?',
    [userId, day]
  );
  if (!existing) {
    db.run(
      `INSERT INTO synapse_scores (user_id, display_name, avatar, day, words_used, avg_link, xp_awarded, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [userId, displayName, avatar, day, wordsUsed, avgLink, xpAwarded]
    );
    save();
    return { best: wordsUsed };
  }
  const better = wordsUsed < existing.words_used
    || (wordsUsed === existing.words_used && avgLink > (existing.avg_link || 0));
  if (better) {
    db.run(
      `UPDATE synapse_scores
         SET words_used = ?, avg_link = ?, display_name = ?, avatar = ?, updated_at = datetime('now')
       WHERE id = ?`,
      [wordsUsed, avgLink, displayName, avatar, existing.id]
    );
    save();
    return { best: wordsUsed };
  }
  return { best: existing.words_used };
}

function getSynapseTop(day, limit = 20) {
  return queryAll(
    `SELECT display_name, avatar, words_used, avg_link FROM synapse_scores
     WHERE day = ?
     ORDER BY words_used ASC, avg_link DESC, updated_at ASC
     LIMIT ?`,
    [day, limit]
  );
}

// Returns { wordsUsed, avgLink, rank } for one user, or null.
function getSynapseUserEntry(day, userId) {
  const row = queryOne(
    'SELECT words_used, avg_link FROM synapse_scores WHERE day = ? AND user_id = ?',
    [day, userId]
  );
  if (!row) return null;
  const better = queryScalar(
    `SELECT COUNT(*) FROM synapse_scores
     WHERE day = ? AND (words_used < ? OR (words_used = ? AND avg_link > ?))`,
    [day, row.words_used, row.words_used, row.avg_link || 0]
  );
  return { wordsUsed: row.words_used, avgLink: row.avg_link, rank: (better || 0) + 1 };
}

function getSynapseProfile(userId) {
  return queryOne(
    'SELECT streak, best_streak, last_daily, wins, best_words FROM synapse_profiles WHERE user_id = ?',
    [userId]
  );
}

// Advance the streak for a verified daily win and return the new streak.
// Idempotent per day: a second win today only updates best_words.
function bumpSynapseProfile(userId, today, yesterday, wordsUsed) {
  const p = getSynapseProfile(userId);
  if (!p) {
    db.run(
      `INSERT INTO synapse_profiles (user_id, streak, best_streak, last_daily, wins, best_words, updated_at)
       VALUES (?, 1, 1, ?, 1, ?, datetime('now'))`,
      [userId, today, wordsUsed]
    );
    save();
    return 1;
  }
  const bestWords = (p.best_words === null || p.best_words === undefined || wordsUsed < p.best_words)
    ? wordsUsed : p.best_words;
  if (p.last_daily === today) {
    db.run(
      `UPDATE synapse_profiles SET best_words = ?, updated_at = datetime('now') WHERE user_id = ?`,
      [bestWords, userId]
    );
    save();
    return p.streak;
  }
  const streak = p.last_daily === yesterday ? (p.streak || 0) + 1 : 1;
  db.run(
    `UPDATE synapse_profiles
       SET streak = ?, best_streak = MAX(best_streak, ?), last_daily = ?, wins = wins + 1,
           best_words = ?, updated_at = datetime('now')
     WHERE user_id = ?`,
    [streak, streak, today, bestWords, userId]
  );
  save();
  return streak;
}

// ── Pookie Tok (paid stream messages) ────────────────────────
function createPookieMessage({ token, streamerId, tier, amountCents, message, displayName, durationMs }) {
  db.run(
    `INSERT INTO pookie_tok_messages
       (token, streamer_id, tier, amount_cents, message, display_name, duration_ms, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [token, streamerId || null, tier || null, amountCents || 0, message, displayName || null, durationMs || 0]
  );
  save();
  return getPookieMessageByToken(token);
}

function getPookieMessageByToken(token) {
  return queryOne(`SELECT * FROM pookie_tok_messages WHERE token = ?`, [token]);
}

// Idempotent paid transition. Returns { row, firstTime }: firstTime is true
// only on the pending->paid flip, so a retried Stripe webhook never re-emits.
function markPookiePaid(token, stripeSessionId) {
  const existing = getPookieMessageByToken(token);
  if (!existing) return { row: null, firstTime: false };
  if (existing.status !== 'pending') return { row: existing, firstTime: false };
  db.run(
    `UPDATE pookie_tok_messages
       SET status='paid', stripe_session_id=?, paid_at=datetime('now')
     WHERE token=? AND status='pending'`,
    [stripeSessionId || null, token]
  );
  save();
  return { row: getPookieMessageByToken(token), firstTime: true };
}

function markPookieFailed(token) {
  db.run(`UPDATE pookie_tok_messages SET status='failed' WHERE token=? AND status='pending'`, [token]);
  save();
}

// Hide is scoped to the owning streamer so one streamer can't hide another's.
function hidePookieMessage(streamerId, id) {
  db.run(
    `UPDATE pookie_tok_messages SET status='hidden', hidden_at=datetime('now')
     WHERE id=? AND streamer_id=? AND status IN ('paid','pending')`,
    [id, streamerId]
  );
  save();
  return queryOne(`SELECT * FROM pookie_tok_messages WHERE id=? AND streamer_id=?`, [id, streamerId]);
}

function listRecentPookieMessages(streamerId, limit) {
  const lim = Math.min(Math.max(Number(limit) || 25, 1), 100);
  return queryAll(
    `SELECT id, token, tier, amount_cents, message, display_name, duration_ms, status, created_at, paid_at
       FROM pookie_tok_messages
      WHERE streamer_id = ? AND status IN ('paid','hidden')
      ORDER BY id DESC LIMIT ?`,
    [streamerId, lim]
  );
}

module.exports = {
  getLetterworksValue, setLetterworksValue, reserveLetterworksValue, upsertLetterworksScore, getLetterworksTop,
  initialize,
  save,
  saveImmediate,
  setHostedDailyXp,
  hasJunkdrawerEntry,
  upsertJunkdrawerScore,
  getJunkdrawerTop,
  getJunkdrawerUserEntry,
  getJunkdrawerProfile,
  upsertJunkdrawerProfile,
  getJunkdrawerProfileReceipt,
  commitJunkdrawerProfileRecord,
  hasCloudQuarryEntry,
  upsertCloudQuarryScore,
  getCloudQuarryTop,
  getCloudQuarryUserEntry,
  getSynapseDay,
  setSynapseDay,
  hasSynapseEntry,
  upsertSynapseScore,
  getSynapseTop,
  getSynapseUserEntry,
  getSynapseProfile,
  bumpSynapseProfile,
  getOrCreateUser,
  getUserByPlatform,
  setUserVoice,
  enableTTS,
  banTTS,
  setUserColor,
  setUserNick,
  setHideFanClubBadge,
  getFanClubStatus,
  recordFanClubMembership,
  removeFanClubMembership,
  createPookieMessage,
  getPookieMessageByToken,
  markPookiePaid,
  markPookieFailed,
  hidePookieMessage,
  listRecentPookieMessages,
  isFanClubOfStreamer,
  getFanClubStreamers,
  getTTSUsers,
  getAllUsers,
  getSubscriberCount,
  findUserByUsername,
  findUserAcrossPlatforms,
  createLink,
  verifyLink,
  getLinkedDiscord,
  getLinkedPlatforms,
  unlinkAccount,
  unlinkByDiscord,
  updateLinkDiscordId,
  getTTSSetting,
  setTTSSetting,
  getAllTTSSettings,
  getVoicePreference,
  setVoicePreference,
  clearVoicePreference,
  listAllVoicePreferences,
  listSuperfanTiktokHandles,
  listBalancesOwing,
  addBalanceOwing,
  clearBalanceOwing,
  getActiveBalanceOwing,
  recordOwingBlocked,
  getStreamerVoiceSettings,
  setStreamerVoiceSettings,
  listMutedViewers,
  isViewerMuted,
  muteViewer,
  unmuteViewer,
  isVoiceAdmin,
  getVoiceAdmin,
  grantVoiceAdmin,
  revokeVoiceAdmin,
  listVoiceAdmins,
  isSuperfanOverride,
  isTiktokSuperfan,
  addSuperfanOverride,
  removeSuperfanOverride,
  listSuperfanOverrides,
  listLiveSuperfans,
  listFanClubMembers,
  getUserProfiles,
  getHintLedger,
  getHintRemaining,
  getHintTotals,
  ensureHintGrant,
  purchaseHints,
  grantHints,
  spendHint,
  getHintRevealReceipt,
  purchaseHintReveal,
  settleHintReveal,
  expirePendingHintReveals,
  getSearchleDiscordPuzzle,
  upsertSearchleDiscordPuzzle,
  recordSearchleDiscordGuess,
  getSearchleDiscordUserSummary,
  getSearchleDiscordLeaderboard,
  getSearchleDiscordRecentGuesses,
  getSearchleDiscordUserPosition,
  getSearchleDiscordCurrentStreak,
  getSearchleDiscordPuzzleStats,
  getSearchleDiscordTopGuesses,
  saveChatMessage,
  getChatHistory,
  cleanOldChatMessages,
  insertFeedEvent,
  getFeedEvents,
  toggleFeedReaction,
  addFeedComment,
  getFeedComments,
  deleteFeedComment,
  pruneFeedEvents,
  recordUsageView,
  recordUsageEvent,
  getUsageDailySeries,
  getUsageTopPages,
  getUsageTopReferrers,
  getUsageTopEvents,
  getUsageTotals,
  pruneUsageData
};
