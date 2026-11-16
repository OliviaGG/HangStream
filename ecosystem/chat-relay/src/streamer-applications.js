/**
 * Streamer applications — self-service apply flow with admin approval.
 *
 * Status lifecycle:
 *   none → pending → approved (also writes to streamers whitelist)
 *                  → denied (with reason; user may re-apply, overwriting)
 *
 * Persisted to data/streamer-applications.json. Single-writer model:
 *   submit / approve / deny mutate the in-memory map and synchronously save.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'streamer-applications.json');

let apps = {};
try {
  if (fs.existsSync(FILE_PATH)) {
    apps = JSON.parse(fs.readFileSync(FILE_PATH, 'utf-8')) || {};
    console.log(`[StreamerApps] Loaded ${Object.keys(apps).length} application(s)`);
  } else {
    apps = {};
  }
} catch (err) {
  console.error('[StreamerApps] Failed to load:', err.message);
  apps = {};
}

function save() {
  try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(FILE_PATH, JSON.stringify(apps, null, 2));
  } catch (err) {
    console.error('[StreamerApps] Save failed:', err.message);
  }
}

function get(discordId) {
  return apps[discordId] || null;
}

function getAll() {
  return Object.values(apps);
}

function listByStatus(status) {
  return Object.values(apps).filter(a => a.status === status);
}

/**
 * Submit (or re-submit) an application. Re-submitting after a denial resets
 * the record back to pending. Approved users can't re-submit (handled by caller).
 */
function submit(discordId, { discordUsername, discordDisplayName, tiktokUsername, reason }) {
  const now = new Date().toISOString();
  const tk = String(tiktokUsername || '').replace(/^@/, '').trim().toLowerCase();
  if (!tk) throw new Error('tiktokUsername is required');
  if (!/^[a-z0-9._-]{2,32}$/.test(tk)) throw new Error('tiktokUsername must be 2-32 chars (a-z, 0-9, dot/underscore/dash)');
  apps[discordId] = {
    discordId,
    discordUsername: discordUsername || 'unknown',
    discordDisplayName: discordDisplayName || discordUsername || 'unknown',
    tiktokUsername: tk,
    reason: String(reason || '').slice(0, 500),
    requestedAt: now,
    status: 'pending',
    decidedAt: null,
    decidedBy: null,
    denyReason: null,
  };
  save();
  return apps[discordId];
}

function approve(discordId, decidedBy) {
  const app = apps[discordId];
  if (!app) return null;
  app.status = 'approved';
  app.decidedAt = new Date().toISOString();
  app.decidedBy = decidedBy || null;
  app.denyReason = null;
  save();
  return app;
}

function deny(discordId, denyReason, decidedBy) {
  const app = apps[discordId];
  if (!app) return null;
  app.status = 'denied';
  app.decidedAt = new Date().toISOString();
  app.decidedBy = decidedBy || null;
  app.denyReason = String(denyReason || '').slice(0, 500);
  save();
  return app;
}

function remove(discordId) {
  if (!apps[discordId]) return false;
  delete apps[discordId];
  save();
  return true;
}

module.exports = { get, getAll, listByStatus, submit, approve, deny, remove };
