// ─── Junk Drawer (junkdrawer.live) — daily challenge scores + leaderboard ───
//
// The game itself is the static page public/junkdrawer.html. These routes add:
//   GET  /api/junkdrawer/leaderboard?mode=daily|endless   (public)
//   POST /api/junkdrawer/score                            (session required)
//
// Scores persist in Chat Relay's sql.js DB (junkdrawer_scores — see
// src/database.js). XP forwards to Word Tycoon /api/reward with
// event 'win' (one daily win, no daily cosmetic/3x side effects), and ONLY on a user's first
// daily submission of the day so resubmitting can never farm XP.
// The daily day boundary is America/Edmonton, matching sp-daily.

const express = require('express');
const crypto = require('node:crypto');
const core = require('../public/js/junkdrawer-core');
const { createReplayValidator } = require('./junkdrawer-replay');
const path = require('node:path');
const meta = require('../public/js/junkdrawer-meta');
const { createProfileActions } = require('./junkdrawer-profiles');
const RUN_TTL_MS = 35 * 60 * 1000;
function scoreDay(mode, day) { return mode === 'daily' ? `${day}:${core.VERSION}` : `endless:${core.VERSION}`; }
function cleanIp(req) { return String((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '').slice(0, 80); }

const MODES = ['daily', 'endless'];
const RUN_MODES = [...MODES, 'level'];
const TOP_LIMIT = 20;
const MAX_TIER = core.MAX_TIER;
const XP_BASE = 25;         // daily first-submit XP…
const XP_PER_SCORE = 40;    // …+1 XP per 40 points…
const XP_BONUS_CAP = 75;    // …capped, so 25-100 XP per day total

function edmontonDay() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(new Date());
}

function registerRoutes(app, deps) {
  const { db, hostedRewards, getCurrentWordTycoonAccountId } = deps;
  // Account-scoped starts/scores; profile writes retain their existing IP key.
  const submitHits = new Map(); // key -> { count, first }
  const SUBMIT_WINDOW = 60 * 1000;
  const SUBMIT_MAX = 12;
  function allowSubmit(key) {
    const now = Date.now();
    const entry = submitHits.get(key);
    if (!entry || now - entry.first > SUBMIT_WINDOW) {
      submitHits.set(key, { count: 1, first: now });
      return true;
    }
    entry.count++;
    return entry.count <= SUBMIT_MAX;
  }
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [k, e] of submitHits) {
      if (now - e.first > SUBMIT_WINDOW * 2) submitHits.delete(k);
    }
  }, 5 * 60 * 1000);
  if (sweep.unref) sweep.unref();

  const profiles = createProfileActions({ db, directory: deps.junkdrawerProfileDirectory || path.join(__dirname, '../data/junkdrawer-profile-actions') });
  const recovered = profiles.recover();
  console.log('[JunkDrawerProfile] Authoritative profile actions enabled; recovered=' + recovered.recovered);
  const profileReply = (userId, result) => ({ profile: result.profile, profileVersion: meta.PROFILE_VERSION, accountId: String(userId), profileWritable: profiles.writable(),
    ...(result.outcome || {}), profileFresh: !!result.fresh });
  const runTokens = new Map();
  const verifyRun = deps.verifyJunkDrawerRun || createReplayValidator();
  const expire = () => { for (const [token, run] of runTokens) if (Date.now() - run.startedAt > RUN_TTL_MS) runTokens.delete(token); };
  const timer = setInterval(expire, 5 * 60 * 1000); timer.unref?.();


  app.get('/api/junkdrawer/leaderboard', async (req, res) => {
    try {
      const mode = MODES.includes(req.query.mode) ? req.query.mode : 'daily';
      const publicDay = mode === 'daily' ? edmontonDay() : '';
      const day = scoreDay(mode, publicDay);
      const top = db.getJunkdrawerTop(mode, day, TOP_LIMIT).map((r, i) => ({
        rank: i + 1,
        name: r.display_name || 'Player',
        avatar: r.avatar || null,
        score: r.score,
        biggest: r.biggest,
      }));
      let me = null;
      if (req.session?.discordUser) {
        const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
        if (userId) me = db.getJunkdrawerUserEntry(mode, day, String(userId));
      }
      res.json({ ok: true, mode, day: publicDay, version: core.VERSION, top, me });
    } catch (err) {
      console.error('[JunkDrawer] leaderboard error:', err.message);
      res.status(500).json({ ok: false, error: 'server-error' });
    }
  });

  app.post('/api/junkdrawer/run/start', express.json({ limit: '4kb' }), async (req, res) => {
    try {
      const mode = req.body?.mode;
      if (!RUN_MODES.includes(mode)) return res.status(400).json({ ok: false, error: 'bad-mode' });
      const day = edmontonDay(), seed = mode === 'daily' ? `junkdrawer:${day}` : `junkdrawer:${crypto.randomUUID()}`;
      const config = { mode, day, seed, version: core.VERSION, limitMs: core.MAX_TICKS * core.STEP_MS, level: 1 };
      if (!req.session?.discordUser) return res.json({ ok: true, guest: true, ...config });
      const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
      if (!userId) return res.json({ ok: true, guest: true, ...config });
      config.level = profiles.get(userId).level;
      const ip = cleanIp(req);
      if (!allowSubmit('start:' + String(userId))) return res.status(429).json({ ok: false, error: 'rate-limited' });
      expire();
      if ([...runTokens.values()].filter(run => run.userId === String(userId)).length >= 8)
        return res.status(429).json({ ok: false, error: 'active-runs' });
      if (runTokens.size >= 1000) return res.status(503).json({ ok: false, error: 'run-capacity' });
      const token = crypto.randomUUID();
      runTokens.set(token, { userId: String(userId), ip, startedAt: Date.now(), ...config });
      res.json({ ok: true, token, ...config, ...profileReply(userId, { profile: profiles.get(userId) }) });
    } catch (err) {
      console.error('[JunkDrawer] start failed:', err.message);
      res.status(500).json({ ok: false, error: 'server-error' });
    }
  });

  app.post('/api/junkdrawer/score', express.json({ limit: '768kb' }), async (req, res) => {
    let consumedRun = null;
    try {
      if (!req.session?.discordUser) return res.status(401).json({ ok: false, error: 'no-session' });
      const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
      if (!userId) return res.status(401).json({ ok: false, error: 'no-account' });
      if (!allowSubmit('score:' + String(userId))) return res.status(429).json({ ok: false, error: 'rate-limited' });
      const body = req.body || {}, token = typeof body.token === 'string' ? body.token : '';
      const run = runTokens.get(token);
      if (!run || run.userId !== String(userId) || run.ip !== cleanIp(req))
        return res.status(400).json({ ok: false, error: 'bad-run' });
      runTokens.delete(token); consumedRun = { token, run };
      if (body.mode !== run.mode || body.day !== run.day || (run.mode === 'daily' && run.day !== edmontonDay()))
        return res.status(400).json({ ok: false, error: 'not-today' });
      let transcript;
      try { core.validate(body.transcript); transcript = JSON.parse(JSON.stringify(body.transcript)); }
      catch { return res.status(422).json({ ok: false, error: 'invalid-transcript' }); }
      const durationMs = Date.now() - run.startedAt;
      if (durationMs < 0 || durationMs > run.limitMs + 30000 || transcript.ticks * core.STEP_MS > durationMs + 1000)
        return res.status(400).json({ ok: false, error: 'implausible-time' });
      const verified = await verifyRun(run.mode, run.seed, run.day, transcript, run.level);
      if (run.mode === 'daily' && run.day !== edmontonDay()) return res.status(400).json({ ok: false, error: 'not-today' });
      if (!verified.gameOver || !Number.isSafeInteger(verified.score) || verified.score < 0 ||
          !Number.isSafeInteger(verified.merges) || verified.merges < 0 || !Number.isInteger(verified.biggest) ||
          verified.biggest < 0 || verified.biggest > MAX_TIER || verified.elapsedMs > durationMs + 1000 ||
          !Array.isArray(verified.discovered) || verified.discovered.some(tier => !Number.isInteger(tier) || tier < 0 || tier > MAX_TIER) ||
          !Number.isSafeInteger(verified.tvBuilt) || verified.tvBuilt < 0)
        return res.status(422).json({ ok: false, error: 'incomplete-replay' });
      const profileResult = profiles.earn(userId, token, run, verified);
      if (run.mode === 'level' || verified.score === 0) return res.json({ ok: true, score: verified.score, xpAwarded: 0,
        ...profileReply(userId, profileResult) });
      // The input replay owns score, merges and the biggest tier. Browser
      // result fields cannot influence the leaderboard or reward amount.
      const mode = run.mode, day = scoreDay(mode, run.day), score = verified.score;
      const u = req.session.discordUser;
      const displayName = String(u.displayName || u.globalName || u.username || 'Player').slice(0, 40);
      const avatar = typeof u.avatar === 'string' && /^https:\/\//.test(u.avatar) ? u.avatar.slice(0, 300) : null;
      const scoreData = { userId: String(userId), displayName, avatar, mode, day, score,
        merges: verified.merges, biggest: verified.biggest };
      // Old rows remain readable historically. Never pay them again after
      // separating deterministic v3 leaderboards from claimed results.
      const alreadyCompleted = mode === 'daily' && (db.hasJunkdrawerEntry(mode, run.day, String(userId)) ||
        db.hasJunkdrawerEntry(mode, day, String(userId)));
      const claim = mode === 'daily' ? hostedRewards.prepare({ game: 'junkdrawer', userId,
        period: run.day, xp: XP_BASE + Math.min(XP_BONUS_CAP, Math.floor(score / XP_PER_SCORE)),
        score: scoreData, alreadyCompleted }) : null;
      const { best } = db.upsertJunkdrawerScore({ ...scoreData, xpAwarded: 0 });
      const delivery = await hostedRewards.deliver(claim);
      const entry = db.getJunkdrawerUserEntry(mode, day, String(userId));
      res.json({ ok: true, best, score, merges: verified.merges, biggest: verified.biggest,
        rank: entry ? entry.rank : null, xpAwarded: delivery.xpAwarded, rewardPending: delivery.rewardPending,
        ...profileReply(userId, profileResult) });
    } catch (err) {
      if (!err.invalid && consumedRun && (consumedRun.run.mode !== 'daily' || consumedRun.run.day === edmontonDay()) &&
          Date.now() - consumedRun.run.startedAt <= RUN_TTL_MS && runTokens.size < 1000 &&
          [...runTokens.values()].filter(run => run.userId === consumedRun.run.userId).length < 8)
        runTokens.set(consumedRun.token, consumedRun.run);
      console.error('[JunkDrawer] score failed:', err.message);
      res.status(err.invalid ? 422 : err.retryable ? 503 : 500).json({ ok: false,
        error: err.invalid ? 'invalid-transcript' : 'server-error' });
    }
  });

  app.get('/api/junkdrawer/profile', async (req, res) => {
    try {
      if (!req.session?.discordUser) return res.json({ ok: true, profile: null });
      const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
      if (!userId) return res.json({ ok: true, profile: null });
      res.json({ ok: true, ...profileReply(userId, { profile: profiles.get(userId) }) });
    } catch { res.status(500).json({ ok: false, error: 'server-error' }); }
  });
  // Legacy/local profile blobs never authorize new account progress.
  app.post('/api/junkdrawer/profile', express.json({ limit: '32kb' }), async (req, res) => {
    if (!req.session?.discordUser) return res.status(401).json({ ok: false, error: 'no-session' });
    try {
      const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
      if (!userId) return res.status(401).json({ ok: false, error: 'no-account' });
      res.status(409).json({ ok: false, error: 'profile-read-only', ...profileReply(userId, { profile: profiles.get(userId) }) });
    } catch { res.status(500).json({ ok: false, error: 'server-error' }); }
  });
  app.post('/api/junkdrawer/profile/clean', express.json({ limit: '4kb' }), async (req, res) => {
    if (!req.session?.discordUser) return res.status(401).json({ ok: false, error: 'no-session' });
    try {
      const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
      if (!userId) return res.status(401).json({ ok: false, error: 'no-account' });
      if (!allowSubmit('clean:' + String(userId))) return res.status(429).json({ ok: false, error: 'rate-limited' });
      const result = profiles.clean(userId, req.body?.spotId);
      res.json({ ok: true, ...profileReply(userId, result) });
    } catch (error) { res.status(error.code === 'bad-spot' ? 400 : error.code === 'insufficient-coins' ? 409 : 503)
      .json({ ok: false, error: error.code || 'server-error' }); }
  });

  console.log('[JunkDrawer] Authoritative daily/endless replay enabled (v3)');
}

module.exports = { registerRoutes };
