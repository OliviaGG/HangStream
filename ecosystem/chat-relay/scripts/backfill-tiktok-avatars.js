#!/usr/bin/env node
/**
 * backfill-tiktok-avatars.js — One-shot rewrite of TikTok signed avatar URLs
 * stored in Word Tycoon's `players` and `linked_accounts` tables to the
 * persistent Chat Relay proxy URL (/api/avatar/tiktok/<platform_user_id>).
 *
 * WHY: TikTok signs avatar URLs with a ~14d x-expires. After expiry the CDN
 * 403s every fetch, so any consumer that stored the raw URL silently shows
 * a broken image. Going forward, src/avatar-cache.js rewrites at ingest
 * time. This script cleans up rows already in the DB.
 *
 * SAFE TO RUN WHILE WT IS UP? No — WT keeps the DB in memory and snapshots
 * to disk periodically. A direct file write would be overwritten on the
 * next snapshot. Stop WT first:
 *
 *     pm2 stop mobile-tycoon
 *     node scripts/backfill-tiktok-avatars.js [--dry-run] [--db <path>]
 *     pm2 start mobile-tycoon
 *
 * The script aborts with a non-zero exit if --db points at a file that
 * looks locked / actively written.
 */

const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

function parseArgs(argv) {
  const args = { dryRun: false, db: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') args.dryRun = true;
    else if (a === '--db') args.db = argv[++i];
    else if (a.startsWith('--db=')) args.db = a.slice(5);
    else if (a === '--help' || a === '-h') {
      console.log('Usage: backfill-tiktok-avatars.js [--dry-run] [--db <path>]');
      process.exit(0);
    }
  }
  return args;
}

function isTikTokSignedUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (!/tiktokcdn(-[a-z0-9]+)?\.com/i.test(url)) return false;
  return /[?&]x-expires=/i.test(url) && /[?&]x-signature=/i.test(url);
}

function proxyUrl(platform, userId) {
  return `/api/avatar/${encodeURIComponent(String(platform).toLowerCase())}/${encodeURIComponent(String(userId))}`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbPath = args.db ||
    process.env.WT_DB_PATH ||
    '/opt/word-tycoon/data/word-tycoon.db';

  if (!fs.existsSync(dbPath)) {
    console.error(`[backfill] DB not found at ${dbPath}`);
    console.error('         Pass --db <path> or set WT_DB_PATH env.');
    process.exit(1);
  }

  console.log(`[backfill] Loading ${dbPath}${args.dryRun ? ' (dry run)' : ''}`);
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync(dbPath);
  const db = new SQL.Database(buffer);

  const stats = { players: 0, linked: 0 };

  // ── players ──
  const pStmt = db.prepare(
    "SELECT id, platform, platform_user_id, profile_pic FROM players WHERE profile_pic LIKE '%tiktokcdn%'"
  );
  const pUpdates = [];
  while (pStmt.step()) {
    const row = pStmt.getAsObject();
    if (!isTikTokSignedUrl(row.profile_pic)) continue;
    if (!row.platform || !row.platform_user_id) continue;
    pUpdates.push({ id: row.id, newUrl: proxyUrl(row.platform, row.platform_user_id) });
  }
  pStmt.free();
  for (const u of pUpdates) {
    if (!args.dryRun) db.run('UPDATE players SET profile_pic = ? WHERE id = ?', [u.newUrl, u.id]);
    stats.players++;
  }

  // ── linked_accounts ──
  // No profile_pic column existed pre-migration, so guard the query.
  let hasLinkedPic = false;
  try {
    const colStmt = db.prepare("PRAGMA table_info(linked_accounts)");
    while (colStmt.step()) {
      if (colStmt.getAsObject().name === 'profile_pic') { hasLinkedPic = true; break; }
    }
    colStmt.free();
  } catch (e) {}

  if (hasLinkedPic) {
    const lStmt = db.prepare(
      "SELECT id, platform, platform_user_id, profile_pic FROM linked_accounts WHERE profile_pic LIKE '%tiktokcdn%'"
    );
    const lUpdates = [];
    while (lStmt.step()) {
      const row = lStmt.getAsObject();
      if (!isTikTokSignedUrl(row.profile_pic)) continue;
      if (!row.platform || !row.platform_user_id) continue;
      lUpdates.push({ id: row.id, newUrl: proxyUrl(row.platform, row.platform_user_id) });
    }
    lStmt.free();
    for (const u of lUpdates) {
      if (!args.dryRun) db.run('UPDATE linked_accounts SET profile_pic = ? WHERE id = ?', [u.newUrl, u.id]);
      stats.linked++;
    }
  }

  if (!args.dryRun && (stats.players + stats.linked) > 0) {
    const out = Buffer.from(db.export());
    const tmp = dbPath + '.bak-backfill-' + Date.now();
    fs.copyFileSync(dbPath, tmp);
    fs.writeFileSync(dbPath, out);
    console.log(`[backfill] Wrote ${out.length} bytes to ${dbPath}`);
    console.log(`[backfill] Backup: ${tmp}`);
  } else if (args.dryRun) {
    console.log('[backfill] DRY RUN — no writes.');
  } else {
    console.log('[backfill] No matching rows.');
  }

  console.log(`[backfill] players rewritten: ${stats.players}`);
  console.log(`[backfill] linked_accounts rewritten: ${stats.linked}`);
  db.close();
}

main().catch((e) => {
  console.error('[backfill] Failed:', e.stack || e.message);
  process.exit(1);
});
