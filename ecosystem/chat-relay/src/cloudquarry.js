'use strict';

// Cloud Quarry — 2D block-breaking daily challenge.
//
// The game itself is the static page public/cloudquarry.html. The daily board
// is deterministic for the Edmonton date. Signed-in runs receive a
// one-use, server-timed token so leaderboard times cannot be submitted without
// actually spending time in a run. The first verified clear of the day earns
// Word Tycoon XP and records one Cloud Quarry win.

const crypto = require('crypto');
const express = require('express');
const core = require('../public/js/cloudquarry-core');
const { createReplayValidator } = require('./cloudquarry-replay');

const DAILY_BLOCKS = 320;
const DAILY_LIMIT_MS = 360000;
const MIN_CLEAR_MS = 30000;
const RUN_TOKEN_TTL_MS = 12 * 60 * 1000;
const TOP_LIMIT = 20;
const XP_BASE = 35;
const XP_SPEED_CAP = 65;
const DAILY_SCORE_VERSION = core.VERSION;

function edmontonDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Edmonton' }).format(date);
}

function dailyConfig() {
  const day = edmontonDay();
  return {
    day,
    seed: `cloudquarry:${day}`,
    blocks: DAILY_BLOCKS,
    limitMs: DAILY_LIMIT_MS,
    version: core.VERSION,
  };
}

function dailyScoreDay(day) {
  return `${day}:${DAILY_SCORE_VERSION}`;
}

function cleanIp(req) {
  return String((req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip || '').slice(0, 80);
}

function registerRoutes(app, deps) {
  const { db, hostedRewards, wtFetch, WORD_EMPIRES_URL, WT_API_SECRET, getCurrentWordTycoonAccountId } = deps;
  const runTokens = new Map();
  const verifyRun = deps.verifyCloudQuarryRun || createReplayValidator();
  const submitHits = new Map();

  function allowSubmit(key) {
    const now = Date.now();
    const old = submitHits.get(key);
    if (!old || now - old.first > 60000) {
      submitHits.set(key, { first: now, count: 1 });
      return true;
    }
    old.count += 1;
    return old.count <= 10;
  }

  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [token, run] of runTokens) {
      if (now - run.startedAt > RUN_TOKEN_TTL_MS) runTokens.delete(token);
    }
    for (const [key, entry] of submitHits) {
      if (now - entry.first > 120000) submitHits.delete(key);
    }
  }, 5 * 60 * 1000);
  if (sweep.unref) sweep.unref();

  app.get('/api/cloudquarry/daily', (req, res) => {
    res.json({ ok: true, ...dailyConfig() });
  });

  app.get('/api/cloudquarry/leaderboard', async (req, res) => {
    try {
      const { day } = dailyConfig();
      const scoreDay = dailyScoreDay(day);
      const top = db.getCloudQuarryTop(scoreDay, TOP_LIMIT).map((row, index) => ({
        rank: index + 1,
        name: row.display_name || 'Player',
        avatar: row.avatar || null,
        durationMs: row.duration_ms,
        shots: row.shots,
        maxCombo: row.max_combo,
      }));
      let me = null;
      if (req.session?.discordUser) {
        const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
        if (userId) me = db.getCloudQuarryUserEntry(scoreDay, String(userId));
      }
      res.json({ ok: true, day, top, me });
    } catch (err) {
      console.error('[CloudQuarry] leaderboard error:', err.message);
      res.status(500).json({ ok: false, error: 'server-error' });
    }
  });

  app.post('/api/cloudquarry/run/start', express.json({ limit: '4kb' }), async (req, res) => {
    try {
      const config = dailyConfig();
      if (!req.session?.discordUser) return res.json({ ok: true, guest: true, ...config });
      const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
      if (!userId) return res.json({ ok: true, guest: true, ...config });
      const ip = cleanIp(req);
      if (!allowSubmit(`start:${userId}:${ip}`)) {
        return res.status(429).json({ ok: false, error: 'rate-limited' });
      }
      for (const [key, old] of runTokens) if (Date.now() - old.startedAt > RUN_TOKEN_TTL_MS) runTokens.delete(key);
      if ([...runTokens.values()].filter(old => old.userId === String(userId)).length >= 8)
        return res.status(429).json({ ok: false, error: 'active-runs' });
      if (runTokens.size >= 1000) return res.status(503).json({ ok: false, error: 'run-capacity' });
      const token = crypto.randomUUID();
      runTokens.set(token, {
        userId: String(userId),
        ip,
        day: config.day,
        version: config.version,
        startedAt: Date.now(),
      });
      res.json({ ok: true, token, ...config });
    } catch (err) {
      console.error('[CloudQuarry] run start error:', err.message);
      res.status(500).json({ ok: false, error: 'server-error' });
    }
  });

  app.post('/api/cloudquarry/score', express.json({ limit: '512kb' }), async (req, res) => {
    let consumedRun = null;
    try {
      if (!req.session?.discordUser) return res.status(401).json({ ok: false, error: 'no-session' });
      const userId = await getCurrentWordTycoonAccountId(req.session.discordUser);
      if (!userId) return res.status(401).json({ ok: false, error: 'no-account' });

      const ip = cleanIp(req);
      if (!allowSubmit(`score:${userId}:${ip}`)) {
        return res.status(429).json({ ok: false, error: 'rate-limited' });
      }

      const body = req.body || {};
      const token = typeof body.token === 'string' ? body.token : '';
      const run = runTokens.get(token);
      if (!run) return res.status(400).json({ ok: false, error: 'bad-run' });

      const config = dailyConfig();
      if (run.userId !== String(userId) || run.ip !== ip) {
        return res.status(400).json({ ok: false, error: 'bad-run' });
      }
      runTokens.delete(token); // owner-bound, one validation attempt per token
      consumedRun = { token, run };
      if (run.day !== config.day || body.day !== config.day || run.version !== core.VERSION) {
        return res.status(400).json({ ok: false, error: 'bad-run' });
      }

      const durationMs = Date.now() - run.startedAt;
      let transcript;
      try { core.validate(body.transcript); transcript = JSON.parse(JSON.stringify(body.transcript)); }
      catch { return res.status(422).json({ ok: false, error: 'invalid-transcript' }); }
      // A little network/render slack is allowed after the six-minute client
      // timer, but an overtime clear is not a valid Daily Sprint result.
      if (durationMs < MIN_CLEAR_MS || durationMs > config.limitMs + 10000) {
        return res.status(400).json({ ok: false, error: 'implausible-time' });
      }

      const verified = await verifyRun(config.seed, transcript);
      if (run.day !== edmontonDay()) return res.status(400).json({ ok: false, error: 'not-today' });
      if (!verified.cleared || verified.blocks !== config.blocks || verified.shots < 1 ||
          verified.maxCombo < 1 || verified.maxCombo > config.blocks ||
          verified.elapsedMs > config.limitMs || verified.elapsedMs > durationMs + 1000) {
        return res.status(422).json({ ok: false, error: 'incomplete-replay' });
      }
      // Claimed browser statistics are ignored. The shared simulation owns them.
      const shots = verified.shots, maxCombo = verified.maxCombo;
      const u = req.session.discordUser;
      const displayName = String(u.displayName || u.globalName || u.username || 'Player').slice(0, 40);
      const avatar = typeof u.avatar === 'string' && /^https:\/\//.test(u.avatar) ? u.avatar.slice(0, 300) : null;

      let xpAwarded = 0;
      const scoreDay = dailyScoreDay(config.day);
      // Versioned score days preserve launch-era results without mixing a
      // 180-block time into the rebalanced 320-block leaderboard. Checking
      // both keys also prevents a second same-day XP/win reward after rollout.
      const alreadyRewarded = db.hasCloudQuarryEntry(config.day, String(userId)) ||
        db.hasCloudQuarryEntry(`${config.day}:v2`, String(userId)) ||
        db.hasCloudQuarryEntry(scoreDay, String(userId));
      const scoreData = { userId: String(userId), displayName, avatar, day: scoreDay,
        durationMs, shots, maxCombo };
      const speedBonus = Math.max(0, Math.floor((config.limitMs - durationMs) / 4000));
      const claim = hostedRewards.prepare({ game: 'cloudquarry', userId, period: config.day,
        xp: XP_BASE + Math.min(XP_SPEED_CAP, speedBonus), score: scoreData,
        alreadyCompleted: alreadyRewarded, durationSeconds: Math.round(durationMs / 1000) });

      const { bestMs } = db.upsertCloudQuarryScore({
        userId: String(userId),
        displayName,
        avatar,
        day: scoreDay,
        durationMs,
        shots,
        maxCombo,
        xpAwarded,
      });
      const delivery = await hostedRewards.deliver(claim);
      xpAwarded = delivery.xpAwarded;
      const entry = db.getCloudQuarryUserEntry(scoreDay, String(userId));
      console.log(`[CloudQuarry] OK user=${userId} duration=${durationMs} shots=${shots} xp=${xpAwarded}`);
      res.json({ ok: true, durationMs, bestMs, rank: entry ? entry.rank : null, xpAwarded, rewardPending: delivery.rewardPending });
    } catch (err) {
      // Infrastructure failure is retryable; explicit validation rejections still consume the token.
      if (!err.invalid && consumedRun && consumedRun.run.day === edmontonDay() &&
          Date.now() - consumedRun.run.startedAt <= RUN_TOKEN_TTL_MS && runTokens.size < 1000)
        runTokens.set(consumedRun.token, consumedRun.run);
      console.error('[CloudQuarry] score error:', err.message);
      res.status(err.invalid ? 422 : err.retryable ? 503 : 500).json({ ok: false, error: err.invalid ? 'invalid-transcript' : 'server-error' });
    }
  });

  console.log('[CloudQuarry] Authoritative daily replay enabled (v3)');
}

module.exports = {
  DAILY_BLOCKS,
  DAILY_LIMIT_MS,
  dailyConfig,
  dailyScoreDay,
  edmontonDay,
  registerRoutes,
};
