'use strict';

const crypto = require('crypto');
const express = require('express');
const { createHostedActionRewards } = require('./hosted-action-rewards');
// These two files are generated from Word Tycoon's tested browser core.
const core = require('./letterworks-core/core');

class Workshop {
  constructor(mode, seed, now = Date.now(), saved = null, { timed = true } = {}) {
    this.state = saved || { version: core.DATA_VERSION, id: crypto.randomUUID(), mode,
      date: core.getEdmontonDate(now), seed, roundIndex: 0, runScore: 0, roundScore: 0,
      totalWords: 0, foundWords: [], masterFound: false, upgrades: [], history: [],
      hintsRemaining: 1, hintedWords: [], hintText: '', status: 'playing', won: false,
      startedAt: now, updatedAt: now, reward: null, timed };
    this.rounds = core.createRun(this.state.seed);
    if (!saved) this.startRound(now);
  }
  puzzle() { return this.rounds[this.state.roundIndex]; }
  isTimed() { return this.state.timed !== false; }
  setTimed(timed, now = Date.now()) {
    if (timed === this.isTimed()) return;
    this.tick(now);
    this.state.timed = timed;
    if (this.state.status === 'playing') this.state.deadline = timed ? now + this.state.millisecondsRemaining : null;
    this.state.updatedAt = now;
  }
  startRound(now) {
    Object.assign(this.state, { roundScore: 0, foundWords: [], masterFound: false,
      hintsRemaining: core.getHintsPerRound(this.state.upgrades), hintedWords: [], hintText: '',
      status: 'playing', millisecondsRemaining: core.getRoundSeconds(this.puzzle(), this.state.upgrades) * 1000 });
    this.state.deadline = this.isTimed() ? now + this.state.millisecondsRemaining : null;
  }
  tick(now) {
    if (this.state.status !== 'playing' || !this.isTimed()) return;
    this.state.millisecondsRemaining = Math.max(0, this.state.deadline - now);
    if (!this.state.millisecondsRemaining) {
      if (core.roundComplete(this.state.roundScore, this.state.masterFound, this.puzzle())) this.bank(now);
      else this.finish(false, now);
    }
  }
  finish(won, now) {
    if (!this.state.history.some(item => item.index === this.state.roundIndex)) {
      this.state.history.push({ index: this.state.roundIndex, found: [...this.state.foundWords] });
    }
    Object.assign(this.state, { status: 'finished', won, finishedAt: now });
  }
  bank(now) {
    const s = this.state;
    if (s.status !== 'playing' || !(core.roundComplete(s.roundScore, s.masterFound, this.puzzle())
      || core.canBankWithoutBlueprint(s.roundScore, s.masterFound, s.foundWords.length, this.puzzle()))) return false;
    if (this.isTimed()) {
      s.millisecondsRemaining = Math.max(0, s.deadline - now);
      s.runScore += core.getBankBonus(Math.floor(s.millisecondsRemaining / 1000), s.upgrades);
    }
    s.history.push({ index: s.roundIndex, found: [...s.foundWords] });
    s.status = 'choosing';
    if (this.puzzle().boss) this.finish(true, now);
    return true;
  }
  choices() { return core.getUpgradeChoices(this.state.seed, this.state.roundIndex, this.state.upgrades, this.isTimed() ? this.state.mode : 'practice'); }
  action(body, now = Date.now()) {
    this.tick(now);
    const s = this.state;
    if (body.runId !== s.id || body.roundIndex !== s.roundIndex) return { ok: false, error: 'This workshop changed. Your current state has been refreshed.' };
    if (body.type === 'sync') return { ok: true };
    if (body.type === 'resume' && s.status === 'paused') {
      s.status = 'playing'; s.deadline = this.isTimed() ? now + s.millisecondsRemaining : null;
    } else if (body.type === 'end' && ['playing', 'paused', 'choosing'].includes(s.status)) {
      this.finish(false, now);
    } else if (body.type === 'contract' && s.status === 'choosing') {
      if (!this.choices().some(choice => choice.id === body.contract)) return { ok: false, error: 'Choose one of the offered contracts.' };
      s.upgrades.push(body.contract); s.roundIndex += 1; this.startRound(now);
    } else if (s.status !== 'playing') return { ok: false, error: 'The shift is not running.' };
    else if (body.type === 'pause') s.status = 'paused';
    else if (body.type === 'word') {
      if (typeof body.word !== 'string' || !/^[a-zA-Z]{3,6}$/.test(body.word)) return { ok: false, error: 'Enter a word of 3–6 letters.' };
      const result = core.validateSubmission(body.word, this.puzzle(), s.foundWords);
      if (!result.ok) return { ok: false, code: result.code, error: result.message };
      const points = core.scoreWord(result.word, s.upgrades, { acceptedCount: s.foundWords.length, bonusLetter: this.puzzle().bonusLetter }).score;
      s.foundWords.push(result.word); s.totalWords += 1; s.roundScore += points; s.runScore += points;
      s.masterFound ||= core.isMasterWord(result.word, this.puzzle());
      if (this.isTimed() && s.upgrades.includes('overtime') && result.word.length >= 5) { s.deadline += 2000; s.millisecondsRemaining += 2000; }
      s.updatedAt = now;
      return { ok: true, word: result.word, points };
    } else if (body.type === 'bank') {
      if (!this.bank(now)) return { ok: false, error: 'Meet the quota and find a six-letter blueprint, or complete every other word first.' };
    } else if (body.type === 'hint') {
      if (s.hintsRemaining <= 0) return { ok: false, error: 'No hints left this shift.' };
      const word = this.puzzle().words.filter(word => !s.foundWords.includes(word) && !s.hintedWords.includes(word))
        .sort((a, b) => Number(!s.masterFound && b.length === 6) - Number(!s.masterFound && a.length === 6) || b.length - a.length || a.localeCompare(b))[0];
      if (!word) return { ok: false, error: 'All available hints have been used.' };
      s.hintedWords.push(word); s.hintsRemaining -= 1;
      s.hintText = word[0].toUpperCase() + ' ' + '_ '.repeat(word.length - 1).trim() + ' · ' + word.length + ' letters';
    } else return { ok: false, error: 'Unknown workshop action.' };
    s.updatedAt = now;
    return { ok: true };
  }
  snapshot(now = Date.now()) {
    this.tick(now);
    const { deadline, ...snapshot } = this.state;
    return { ...snapshot, foundWords: [...snapshot.foundWords], upgrades: [...snapshot.upgrades],
      history: snapshot.history.map(item => ({ ...item, found: [...item.found] })) };
  }
}

function registerRoutes(app, deps) {
  const { db, wtFetch, WORD_EMPIRES_URL, WT_API_SECRET, getCurrentWordTycoonAccountId,
    streamers, isStreamActive, onStreamRound, onStreamWin, onDailyWin } = deps;
  const rewards = deps.rewards || createHostedActionRewards({ game: 'letterworks', directory: deps.rewardOutboxDir,
    db, baseUrl: WORD_EMPIRES_URL, apiSecret: WT_API_SECRET, request: wtFetch });
  const locks = new Map(), hits = new Map(), streams = new Map();
  function rate(key, max = 90) {
    const now = Date.now(); let entry = hits.get(key);
    if (!entry || now - entry.time > 60000) { entry = { time: now, count: 0 }; hits.set(key, entry); }
    return ++entry.count <= max;
  }
  function serial(key, work) {
    const queued = (locks.get(key) || Promise.resolve()).catch(() => {}).then(work);
    locks.set(key, queued);
    queued.finally(() => { if (locks.get(key) === queued) locks.delete(key); }).catch(() => {});
    return queued;
  }
  function validPlayer(player) {
    return player && typeof player.platform === 'string' && !['bot', 'system'].includes(player.platform)
      && player.userId && !/^(web_guest_|guest_|anon_|wsguest_|guest-)/i.test(player.userId);
  }
  async function bridge(endpoint, payload) {
    const response = await wtFetch(WORD_EMPIRES_URL + endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
    const result = await response.json();
    if (!response.ok || result.ok === false) throw new Error(result.message || 'Word Tycoon rejected the update');
    return result;
  }
  function library(player, word) {
    if (!validPlayer(player)) return;
    bridge('/api/library/report', { ...player, game: 'letterworks', word }).catch(err => console.warn('[Letterworks] library:', err.message));
  }
  function prepareReward(key, player, xp, event, period) {
    return rewards.prepare({ key, player, xp, event, period });
  }
  async function account(req) {
    const u = req.session?.discordUser;
    if (!u) return null;
    const id = await getCurrentWordTycoonAccountId(u);
    if (!id) return null;
    return { platform: 'discord', userId: String(id), username: u.username || String(id),
      displayName: String(u.displayName || u.globalName || u.username || 'Player').slice(0, 40),
      avatar: typeof u.avatar === 'string' && u.avatar.startsWith('https://') ? u.avatar.slice(0, 300) : null };
  }
  function load(userId) {
    const saved = db.getLetterworksValue('run:' + userId);
    return saved && saved.version === core.DATA_VERSION ? new Workshop(saved.mode, saved.seed, Date.now(), saved) : null;
  }
  async function settle(game, player) {
    const s = game.state;
    if (s.status === 'finished' && !s.recorded) {
      const today = core.getEdmontonDate();
      const claim = s.won && (s.mode !== 'daily' || s.date === today)
        ? prepareReward('reward:' + s.mode + ':' + today + ':' + player.userId, player,
          s.mode === 'daily' ? 50 : 25, s.mode === 'daily' ? 'daily-win' : 'win', s.mode === 'daily' ? s.date : null) : null;
      if (s.mode === 'daily' && s.won) {
        db.upsertLetterworksScore({ userId: player.userId,
          name: player.displayName, avatar: player.avatar, day: s.date, score: s.runScore, words: s.totalWords });
        if (onDailyWin && s.date === core.getEdmontonDate()) await onDailyWin(player.userId, s.date);
      }
      s.recorded = true;
      const stats = db.getLetterworksValue('stats:' + player.userId) || { best: 0, wins: 0, runs: 0 };
      stats.best = Math.max(stats.best, s.runScore); stats.runs += 1; if (s.won) stats.wins += 1;
      if (s.mode === 'daily') { stats.dailyBest = stats.dailyDate === s.date ? Math.max(stats.dailyBest || 0, s.runScore) : s.runScore; stats.dailyDate = s.date; }
      db.setLetterworksValue('stats:' + player.userId, stats);
      // Save finished state before awaiting the reward bridge.
      db.setLetterworksValue('run:' + player.userId, s);
      if (s.mode === 'daily' && s.date !== core.getEdmontonDate()) s.reward = { xpAwarded: 0, message: 'Past-day daily clear saved. Play today’s workshop for the daily reward.' };
      else if (claim) s.reward = await rewards.deliver(claim);
      else s.reward = { xpAwarded: 0, message: 'Finish all five shifts to earn Word Tycoon XP.' };
    }
    s.reward = rewards.refresh(s.reward);
    db.setLetterworksValue('run:' + player.userId, s);
  }
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.headers.origin && !['https://wordtycoon.live', 'https://www.wordtycoon.live', 'https://w.wordtycoon.live', 'https://wordgame.live', 'https://www.wordgame.live'].includes(req.headers.origin)
      && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(req.headers.origin)) return res.status(403).json({ ok: false, error: 'Invalid origin.' });
    if (!rate(req.ip, 360)) return res.status(429).json({ ok: false, error: 'Too many requests. Please wait a moment.' });
    next();
  });
  router.get('/leaderboard', (req, res) => res.json({ ok: true, day: core.getEdmontonDate(), top: db.getLetterworksTop(core.getEdmontonDate()) }));
  const userRoute = work => async (req, res) => {
    try {
      const player = await account(req);
      if (!player) return res.status(401).json({ ok: false, error: 'Sign in to Word Tycoon to save account progress.' });
      await serial(player.userId, () => work(req, res, player));
    } catch (err) { console.error('[Letterworks]', err); if (!res.headersSent) res.status(500).json({ ok: false, error: 'Workshop unavailable. Please retry.' }); }
  };
  router.get('/me', userRoute(async (req, res, player) => {
    const game = load(player.userId);
    if (game) { game.tick(Date.now()); await settle(game, player); }
    res.json({ ok: true, player, state: game?.snapshot() || null, stats: db.getLetterworksValue('stats:' + player.userId) || { best: 0, wins: 0, runs: 0 } });
  }));
  router.post('/run/start', express.json({ limit: '2kb' }), userRoute(async (req, res, player) => {
    if (!['daily', 'run'].includes(req.body?.mode)) return res.status(400).json({ ok: false, error: 'Invalid mode.' });
    if (!rate('start:' + player.userId, 10)) return res.status(429).json({ ok: false, error: 'Please wait before starting another run.' });
    const old = load(player.userId);
    if (old && old.state.status !== 'finished' && req.body.replace !== true) return res.status(409).json({ ok: false, error: 'A run is already saved.', state: old.snapshot() });
    const rackKey = 'recent-racks:account:' + player.userId;
    const recentRacks = core.rememberRacks(db.getLetterworksValue(rackKey), old?.rounds.map(round => round.rack));
    const seed = req.body.mode === 'daily' ? core.dailySeed(core.getEdmontonDate())
      : core.chooseFreshSeed('v2:run', recentRacks, () => crypto.randomUUID());
    const game = new Workshop(req.body.mode, seed);
    db.setLetterworksValue(rackKey, core.rememberRacks(recentRacks, game.rounds.map(round => round.rack)));
    db.setLetterworksValue('run:' + player.userId, game.state);
    res.json({ ok: true, state: game.snapshot() });
  }));
  router.post('/run/action', express.json({ limit: '2kb' }), userRoute(async (req, res, player) => {
    const game = load(player.userId);
    if (!game) return res.status(404).json({ ok: false, error: 'No saved account workshop.' });
    const result = game.action(req.body || {});
    if (result.word) library(player, result.word);
    await settle(game, player);
    res.json({ ...result, state: game.snapshot() });
  }));

  function streamSettings(id) { return { timed: db.getLetterworksValue('stream-settings:' + id)?.timed === true }; }
  function newStreamGame(id, previousGame = null) {
    const rackKey = 'recent-racks:stream:' + id;
    const recentRacks = core.rememberRacks(db.getLetterworksValue(rackKey), previousGame?.rounds.map(round => round.rack));
    const seed = core.chooseFreshSeed('v2:stream', recentRacks, () => crypto.randomUUID());
    const game = new Workshop('stream', seed, Date.now(), null, streamSettings(id));
    db.setLetterworksValue(rackKey, core.rememberRacks(recentRacks, game.rounds.map(round => round.rack)));
    return game;
  }
  function streamEntry(id, previousGame = null) {
    if (!streamers.get(id)?.handle || !isStreamActive(id)) return null;
    let entry = streams.get(id);
    if (!entry) {
      if (streams.size >= 200) return null;
      entry = { game: newStreamGame(id, previousGame), players: new Map(), votes: new Map(), lastAt: Date.now() };
      streams.set(id, entry);
    }
    return entry;
  }
  function streamSnapshot(entry) {
    return { ...entry.game.snapshot(), contributors: [...entry.players.values()].sort((a, b) => b.score - a.score).slice(0, 10),
      choices: entry.game.state.status === 'choosing' ? entry.game.choices() : [],
      guesses: entry.guesses || [],
      voteEndsAt: entry.voteEndsAt || null, nextRunAt: entry.nextRunAt || null,
      votes: [1, 2, 3].map(number => [...entry.votes.values()].filter(value => value === number).length), lastWord: entry.lastWord || null };
  }
  function updateStream(id, entry) {
    const now = Date.now(), game = entry.game, s = game.state;
    game.tick(now);
    if (s.status === 'playing' && !game.isTimed() && s.foundWords.length === game.puzzle().words.length) game.bank(now);
    // A Game Vote round is one completed shift, including owner banks and
    // automatic banks. Report it once before the contract vote advances.
    if ((s.status === 'choosing' || (s.status === 'finished' && s.won))
        && s.history.some(round => round.index === s.roundIndex)
        && entry.lastReportedRound !== s.roundIndex) {
      entry.lastReportedRound = s.roundIndex;
      try { onStreamRound?.(id, s.roundIndex, s); } catch (err) { console.error('[Letterworks] stream round:', err.message); }
    }
    if (s.status === 'choosing') {
      entry.voteEndsAt ||= now + 12000;
      if (now >= entry.voteEndsAt) {
        const tally = [1, 2, 3].map(n => ({ n, count: [...entry.votes.values()].filter(v => v === n).length }));
        tally.sort((a, b) => b.count - a.count || a.n - b.n);
        game.action({ runId: s.id, roundIndex: s.roundIndex, type: 'contract', contract: game.choices()[tally[0].n - 1].id }, now);
        entry.voteEndsAt = null; entry.votes.clear();
      }
    }
    if (s.status === 'finished') {
      if (!entry.resultRecorded) {
        const ranked = [...entry.players.values()].sort((a, b) => b.score - a.score);
        // Preserve the existing linked-account daily cap; reserve before the
        // result flag or any asynchronous delivery can consume this clear.
        const claims = s.won ? ranked.filter(validPlayer).map(player => {
          const accountKey = player.linkedDiscord ? 'discord:' + player.linkedDiscord : player.platform + ':' + player.userId;
          return prepareReward('reward:stream:' + core.getEdmontonDate() + ':' + accountKey, player, 25, 'mp-win');
        }) : [];
        entry.resultRecorded = true;
        if (s.won && entry.players.size) {
          claims.forEach(claim => rewards.deliver(claim).catch(err => console.error('[Letterworks] reward pending:', err.message)));
          try { onStreamWin(id, ranked[0], ranked, s); } catch (err) { console.error('[Letterworks] stream win:', err.message); }
        }
      }
      entry.nextRunAt ||= now + 15000;
      if (now >= entry.nextRunAt) Object.assign(entry, { game: newStreamGame(id, game), players: new Map(), votes: new Map(), nextRunAt: null, voteEndsAt: null, lastWord: null, resultRecorded: false, lastReportedRound: -1,
        guesses: [], guessCounts: new Map(), guessSequence: 0, guessRound: null });
    }
  }
  const settingsRoute = work => userRoute(async (req, res) => {
    const id = streamers.get(req.params.id)?.discordId || streamers.getByHandle(req.params.id)?.discordId;
    if (!id || req.session.discordUser.id !== id) return res.status(403).json({ ok: false, error: 'Only the streamer can manage this workshop.' });
    await work(req, res, id);
  });
  router.get('/stream/:id/settings', settingsRoute(async (req, res, id) => {
    res.json({ ok: true, settings: streamSettings(id) });
  }));
  router.put('/stream/:id/settings', express.json({ limit: '2kb' }), settingsRoute(async (req, res, id) => {
    if (typeof req.body?.timed !== 'boolean') return res.status(400).json({ ok: false, error: 'Choose Timed or No timer.' });
    const timed = req.body.timed, entry = streams.get(id), changed = streamSettings(id).timed !== timed;
    db.setLetterworksValue('stream-settings:' + id, { timed }); db.saveImmediate();
    if (entry && changed) {
      entry.game.setTimed(timed);
      if (entry.game.state.status === 'choosing') { entry.votes.clear(); entry.voteEndsAt = Date.now() + 12000; }
      entry.lastAt = Date.now(); updateStream(id, entry);
    }
    res.json({ ok: true, settings: { timed }, state: entry ? streamSnapshot(entry) : null });
  }));
  router.get('/stream/:id', (req, res) => {
    const id = streamers.get(req.params.id)?.discordId || streamers.getByHandle(req.params.id)?.discordId;
    const entry = id && streamEntry(id);
    if (!entry) return res.status(404).json({ ok: false, error: 'Letterworks is not active on this stream.' });
    entry.lastAt = Date.now(); updateStream(id, entry);
    res.json({ ok: true, streamer: streamers.get(id)?.displayName || streamers.get(id)?.handle, state: streamSnapshot(entry) });
  });
  router.post('/stream/:id/word', express.json({ limit: '2kb' }), userRoute(async (req, res, player) => {
    const id = streamers.get(req.params.id)?.discordId || streamers.getByHandle(req.params.id)?.discordId;
    const entry = id && streamEntry(id);
    if (!entry) return res.status(404).json({ ok: false, error: 'Letterworks is not active on this stream.' });
    const result = submitStream(id, entry, player, req.body.word, req.body.runId, req.body.roundIndex);
    res.json({ ...result, state: streamSnapshot(entry) });
  }));
  router.post('/stream/:id/restart', express.json({ limit: '2kb' }), userRoute(async (req, res) => {
    const id = streamers.get(req.params.id)?.discordId || streamers.getByHandle(req.params.id)?.discordId;
    if (req.session.discordUser.id !== id) return res.status(403).json({ ok: false, error: 'Only the streamer can restart this workshop.' });
    if (!streamEntry(id)) return res.status(404).json({ ok: false, error: 'Letterworks is not active on this stream.' });
    const previousGame = streams.get(id).game;
    streams.delete(id); const entry = streamEntry(id, previousGame);
    res.json({ ok: true, state: streamSnapshot(entry) });
  }));
  router.post('/stream/:id/bank', express.json({ limit: '2kb' }), settingsRoute(async (req, res, id) => {
    const entry = streamEntry(id);
    if (!entry) return res.status(404).json({ ok: false, error: 'Letterworks is not active on this stream.' });
    updateStream(id, entry);
    const result = entry.game.action({ type: 'bank', runId: req.body?.runId, roundIndex: req.body?.roundIndex });
    updateStream(id, entry);
    res.status(result.ok ? 200 : 400).json({ ...result, state: streamSnapshot(entry) });
  }));
  function submitStream(id, entry, player, word, runId, roundIndex) {
    updateStream(id, entry);
    const s = entry.game.state, text = String(word || '').trim().toLowerCase();
    if (runId && (runId !== s.id || roundIndex !== s.roundIndex)) return { ok: false, error: 'The shift changed.' };
    if (s.status === 'choosing' && /^[123]$/.test(text)) {
      entry.votes.set(player.platform + ':' + player.userId, Number(text)); return { ok: true };
    }
    if (entry.players.size >= 300 && !entry.players.has(player.platform + ':' + player.userId)) return { ok: false, error: 'This workshop is full.' };
    const wasPlaying = s.status === 'playing';
    const result = entry.game.action({ runId: s.id, roundIndex: s.roundIndex, type: 'word', word: text });
    if (wasPlaying && /^[a-z]{1,6}$/.test(text)) {
      if (entry.guessRound !== s.roundIndex) { entry.guessRound = s.roundIndex; entry.guessCounts = new Map(); }
      const count = (entry.guessCounts.get(text) || (result.code === 'duplicate' ? 1 : 0)) + 1;
      entry.guessCounts.set(text, count);
      if (entry.guessCounts.size > 1000) entry.guessCounts.delete(entry.guessCounts.keys().next().value);
      entry.guesses ||= [];
      entry.guesses.push({ id: entry.guessSequence = (entry.guessSequence || 0) + 1, word: text,
        status: result.ok ? 'correct' : result.code === 'duplicate' ? 'duplicate' : 'incorrect', count, roundIndex: s.roundIndex });
      if (entry.guesses.length > 120) entry.guesses.splice(0, entry.guesses.length - 120);
    }
    if (result.ok && result.word) {
      const key = player.platform + ':' + player.userId;
      const contributor = entry.players.get(key) || { ...player, score: 0, words: 0 };
      contributor.score += result.points; contributor.words += 1; entry.players.set(key, contributor);
      entry.lastWord = { name: player.displayName, word: result.word, points: result.points }; library(player, result.word);
      if (entry.game.isTimed() && core.roundComplete(s.roundScore, s.masterFound, entry.game.puzzle())) entry.game.bank(Date.now());
      updateStream(id, entry);
    }
    entry.lastAt = Date.now(); return result;
  }
  app.use('/api/letterworks', router);
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of hits) if (now - entry.time > 120000) hits.delete(key);
    for (const [id, entry] of streams) {
      if (!isStreamActive(id) || (entry.game.isTimed() && now - entry.lastAt > 10 * 60000)) streams.delete(id);
      else try { updateStream(id, entry); } catch (err) { console.error('[Letterworks] stream settlement pending:', err.message); }
    }
  }, 1000);
  sweep.unref();
  return { handleChat(id, normalized) {
    if (!normalized || ['bot', 'system'].includes(normalized.platform)) return;
    const entry = streamEntry(String(id)); if (!entry) return;
    const u = normalized.user || {};
    if (!u.id || !rate('chat:' + id + ':' + normalized.platform + ':' + u.id, 90)) return;
    submitStream(String(id), entry, { platform: normalized.platform, userId: String(u.id), username: u.username,
      displayName: String(u.customNick || u.displayName || u.username || 'Viewer').slice(0, 40), profilePic: u.profilePic || null,
      linkedDiscord: normalized.linkedDiscord || null, customColor: u.customColor || null }, normalized.message);
  }, startRewards: rewards.start, close() { clearInterval(sweep); rewards.stop(); }, streams };
}

module.exports = { Workshop, registerRoutes };
