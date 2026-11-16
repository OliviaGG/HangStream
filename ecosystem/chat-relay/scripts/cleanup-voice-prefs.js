// Cleanup voice_preferences for users not on Donor Class+ (or in admin override).
// Pass --commit to apply. Without it, dry-runs.
//
// IMPORTANT: stop mobile-relay BEFORE running with --commit. The chat-relay
// process holds the db in memory and will flush over our disk changes.
//
// Reads via WT's player_memberships table DIRECTLY (truth source) instead of
// going through /api/admin/pass which has had response-shape surprises.

const initSqlJs = require('sql.js');
const fs = require('fs');

const CR_DB = '/opt/chat-relay/data/relaybroadcast.db';
const WT_DB = '/opt/word-tycoon/data/word-tycoon.db';
const ALLOWED = new Set(['donor_class', 'pookie_pass']);
const COMMIT = process.argv.includes('--commit');

(async () => {
  console.log(COMMIT ? '== COMMIT MODE — will delete ==' : '== DRY RUN — no changes ==');
  const SQL = await initSqlJs();

  // Read Chat Relay db (rebuild fresh Buffer so the file bytes aren't aliased
  // by sql.js — fixes the bug from the previous script that wrote a mutated
  // buffer to the "backup" file).
  const crDisk = fs.readFileSync(CR_DB);
  // Take a SEPARATE backup of disk bytes BEFORE opening with sql.js.
  if (COMMIT) {
    fs.writeFileSync(CR_DB + '.cleanup-bak', crDisk);
    console.log('backup written: ' + CR_DB + '.cleanup-bak (' + crDisk.length + ' bytes)');
  }
  // Pass a fresh copy to sql.js so the original Buffer isn't mutated.
  const crDb = new SQL.Database(Buffer.from(crDisk));

  // Read voice_preferences rows.
  const vpRes = crDb.exec('SELECT discord_user_id, voice_id, updated_at FROM voice_preferences');
  const rows = vpRes.length ? vpRes[0].values.map(v => ({ id: v[0], voice: v[1], updated: v[2] })) : [];

  // Read admin override list (from same chat-relay db).
  const aoRes = crDb.exec('SELECT discord_user_id FROM voice_admin_override');
  const admins = new Set(aoRes.length ? aoRes[0].values.map(v => v[0]) : []);

  // Read active subscribers from WT db (truth source).
  const wtDb = new SQL.Database(Buffer.from(fs.readFileSync(WT_DB)));
  const memRes = wtDb.exec(`SELECT discord_user_id, tier, status FROM player_memberships
                            WHERE status = 'active' AND tier IN ('donor_class', 'pookie_pass')`);
  const activeSubs = new Map();
  if (memRes.length) for (const v of memRes[0].values) activeSubs.set(v[0], v[1]);
  console.log(`pulled ${activeSubs.size} active subscribers + ${admins.size} admin overrides`);

  console.log(`\nscanning ${rows.length} voice_preferences rows...`);
  const toDelete = [];
  for (const r of rows) {
    let eligible = false, reason = '';
    if (admins.has(r.id)) { eligible = true; reason = 'admin override'; }
    else if (activeSubs.has(r.id)) { eligible = true; reason = activeSubs.get(r.id) + ' active'; }
    else { reason = 'not subscribed, not admin'; }
    console.log(`  ${r.id} (${r.voice})  ${reason}  -> ${eligible ? 'KEEP' : 'DELETE'}`);
    if (!eligible) toDelete.push(r.id);
  }

  console.log(`\nsummary: ${rows.length - toDelete.length} keep, ${toDelete.length} would-delete`);
  if (!COMMIT) { console.log('\n(dry run — run with --commit, after stopping mobile-relay)'); return; }
  if (!toDelete.length) { console.log('\nnothing to commit.'); return; }

  const stmt = crDb.prepare('DELETE FROM voice_preferences WHERE discord_user_id = ?');
  for (const id of toDelete) { stmt.bind([id]); stmt.step(); stmt.reset(); }
  stmt.free();

  fs.writeFileSync(CR_DB, Buffer.from(crDb.export()));
  console.log(`\ndeleted ${toDelete.length} rows. backup at ${CR_DB}.cleanup-bak`);
})().catch(e => { console.error('ERR', e); process.exit(1); });
