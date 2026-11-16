'use strict';

const crypto = require('crypto');
const express = require('express');
const { createHostedActionRewards } = require('./hosted-action-rewards');
const core = require('./wordfall-core');
const gameShared = require('./game-shared');

const WIN_SCORE = 25000;
const NEXT_ROUND_MS = 12 * 1000;
const SHARED_HOLD_MS = 4 * 1000;
const HOLD_EXTENSION_MS = 1000;
const MAX_SHARED_HOLD_MS = 8 * 1000;
const EXTENSION_BONUS_XP = 200;
const VOWEL_RESCUE_THRESHOLD = 8;
const STATE_PREFIX = 'wordfall:';
function date() { return gameShared.getEdmontonDate(); }
function compactPlayer(player) {
  return { platform: player.platform, userId: String(player.userId), username: player.username,
    displayName: player.displayName, avatar: typeof player.avatar === 'string' && /^https:\/\//i.test(player.avatar)
      ? player.avatar.slice(0, 500) : null };
}
function playerKey(player) { return player.platform + ':' + player.userId; }
function newGame(mode, seed, now = Date.now()) {
  const shared = mode === 'multi' || mode === 'stream';
  return { id: crypto.randomUUID(), mode, date: date(), seed, board: core.createBoard(core.seededRandom(seed)),
    version: 0, score: 0, moves: shared ? null : core.MOVES, cleared: 0, words: 0,
    foundWords: [], claimedWords: {}, recentAttempts: [], lastAttempts: {}, attemptSeq: 0,
    pendingClaims: [], heldUntil: null,
    players: {}, lastWord: null, startedAt: now,
    endsAt: null, winScore: shared ? WIN_SCORE : null,
    finishedAt: null, winner: null, reward: null };
}
function snapshot(game) {
  return { ...game, board: game.board.map(tile => ({ ...tile })),
    foundWords: [...game.foundWords], recentAttempts: [...(game.recentAttempts || [])],
    pendingClaims: (game.pendingClaims || []).map(claim => ({ ...claim, path: [...claim.path] })),
    lastAttempts: { ...(game.lastAttempts || {}) },
    claimedWords: undefined,
    players: Object.values(game.players).sort((a, b) => b.score - a.score || a.firstAt - b.firstAt)
      .map(player => ({ ...player })) };
}
function recordAttempt(game, type, word, player, now, extra = {}) {
  const attempt = { id: game.attemptSeq = (game.attemptSeq || 0) + 1,
    type, word, finder: player.displayName, avatar: compactPlayer(player).avatar,
    playerKey: playerKey(player), at: now, ...extra };
  (game.recentAttempts ||= []).push(attempt);
  if (game.recentAttempts.length > 24) game.recentAttempts.shift();
  (game.lastAttempts ||= {})[type] = attempt;
  return attempt;
}
function syncHeldUntil(game) {
  for (const claim of game.pendingClaims || [])
    if (!Number.isFinite(claim.expiresAt))
      claim.expiresAt = Number.isFinite(game.heldUntil) ? game.heldUntil : claim.at + SHARED_HOLD_MS;
  game.heldUntil = game.pendingClaims?.length
    ? Math.max(...game.pendingClaims.map(claim => claim.expiresAt)) : null;
}
function nextHeldExpiry(game) {
  return Math.min(...(game.pendingClaims || []).map(claim => claim.expiresAt));
}
function allocateLetterXp(word, points, awarded) {
  const letters = [...String(word || '')];
  const total = Math.max(0, Math.round(Number(awarded) || 0));
  if (!letters.length || !points || !total) return letters.map(() => 0);
  const rarity = letters.map(letter => gameShared.getLetterRarityBonus(letter).bonus);
  const shared = Math.max(0, points - rarity.reduce((sum, value) => sum + value, 0));
  const weights = rarity.map((value, index) => value + Math.floor(shared / letters.length)
    + (index < shared % letters.length ? 1 : 0));
  const exact = weights.map(weight => total * weight / points);
  const amounts = exact.map(Math.floor);
  let remainder = total - amounts.reduce((sum, value) => sum + value, 0);
  const order = exact.map((value, index) => index)
    .sort((a, b) => (exact[b] - amounts[b]) - (exact[a] - amounts[a]) || a - b);
  for (let index = 0; remainder > 0; index++, remainder--) amounts[order[index % order.length]]++;
  return amounts;
}
function settlePending(game, now = Date.now()) {
  if (game.moves !== null || game.finishedAt || !game.pendingClaims?.length) return false;
  syncHeldUntil(game);
  const expired = game.pendingClaims.filter(claim => claim.expiresAt <= now);
  if (!expired.length) return false;
  const oldBoard = game.board;
  const remaining = game.pendingClaims.filter(claim => claim.expiresAt > now);
  const heldIds = remaining.map(claim => claim.path.map(index => oldBoard[index].id));
  const removed = [...new Set(expired.flatMap(claim => claim.path))].sort((a, b) => a - b);
  const pinned = new Set(remaining.flatMap(claim => claim.path));
  game.board = core.dropTiles(game.board, removed,
    core.seededRandom(game.seed + ':drop:' + game.version + ':' + removed.join(',')), pinned);
  if (!remaining.length && (core.countVowels(game.board) < core.MIN_VOWELS || !core.findWords(game.board, 1).length))
    game.board = core.createBoard(core.seededRandom(game.seed + ':rescue:' + game.version));
  const positions = new Map(game.board.map((tile, index) => [tile.id, index]));
  remaining.forEach((claim, index) => { claim.path = heldIds[index].map(id => positions.get(id)); });
  game.version += 1;
  game.pendingClaims = remaining;
  syncHeldUntil(game);
  return true;
}
function playPath(game, player, path, version, now = Date.now()) {
  if (game.finishedAt) return { ok: false, code: 'finished', error: 'This round is over.' };
  if (!Number.isInteger(version) || version !== game.version)
    return { ok: false, code: 'stale', error: 'The board changed. Trace a word on the new board.' };
  const result = core.validatePath(game.board, path);
  if (!result.ok) {
    if (game.moves === null && result.reason === 'word')
      recordAttempt(game, 'wrong', result.word, player, now);
    return { ok: false, code: result.reason, word: result.word,
      error: 'That path is not a valid word on this board.' };
  }
  if (game.moves === null) {
    game.claimedWords ||= Object.fromEntries(game.foundWords.map(entry => [entry.word, 1]));
  }
  const key = playerKey(player);
  if (game.moves === null && game.pendingClaims?.some(claim => claim.playerKey === key
    && claim.path.length === path.length && claim.path.every((index, i) => index === path[i])))
    return { ok: false, code: 'same-path', word: result.word,
      error: 'You already scored that path on this board. Try another path or wait for the fall.' };
  let expiresAt = null, holdDurationMs = null, timerExtendedByMs = 0;
  const connected = new Set();
  if (game.moves === null) {
    game.pendingClaims ||= [];
    syncHeldUntil(game);
    const shared = new Set(path);
    let expanded;
    do {
      expanded = false;
      for (const claim of game.pendingClaims) {
        if (connected.has(claim) || !claim.path.some(index => shared.has(index))) continue;
        connected.add(claim);
        claim.path.forEach(index => shared.add(index));
        expanded = true;
      }
    } while (expanded);
    if (connected.size) {
      const currentDurationMs = Math.max(...[...connected]
        .map(claim => Number.isFinite(claim.holdDurationMs) ? claim.holdDurationMs : SHARED_HOLD_MS));
      holdDurationMs = Math.min(MAX_SHARED_HOLD_MS, currentDurationMs + HOLD_EXTENSION_MS);
      if (holdDurationMs > currentDurationMs) timerExtendedByMs = HOLD_EXTENSION_MS;
    } else holdDurationMs = SHARED_HOLD_MS;
    expiresAt = now + holdDurationMs;
  }
  // RecTangled's frequency tier sets the base; shared tables supply bonuses.
  const tier = core.wordTier(result.word);
  const basePoints = core.baseScore(result.word)
    + gameShared.getLetterRarityBonus(result.word).bonus
    + gameShared.getWordLengthBonus(result.word);
  const bonusXp = timerExtendedByMs ? EXTENSION_BONUS_XP : 0;
  const points = basePoints + bonusXp;
  if (!game.players[key] && Object.keys(game.players).length >= 300)
    return { ok: false, code: 'full', error: 'This shared board is full; try the next round.' };
  const p = game.players[key] || { ...compactPlayer(player), score: 0, words: 0, firstAt: now };
  p.avatar = compactPlayer(player).avatar || p.avatar;
  p.displayName = player.displayName;
  p.score += points; p.words += 1; game.players[key] = p;
  const count = game.moves === null ? (game.claimedWords[result.word] || 0) + 1 : 1;
  if (game.moves === null) game.claimedWords[result.word] = count;
  game.score += points; game.words += 1; game.cleared += path.length;
  game.foundWords.push({ word: result.word, tier, points, finder: p.displayName, at: now });
  if (game.foundWords.length > 80) game.foundWords.shift();
  const fromVersion = game.version;
  game.lastWord = { word: result.word, tier, points, basePoints, bonusXp, holdDurationMs, timerExtendedByMs,
    finder: p.displayName, avatar: p.avatar,
    playerKey: key, platform: p.platform, userId: p.userId,
    path: [...path], fromVersion, at: now, xpAwarded: 0, count };
  let claimId = null;
  if (game.moves === null) {
    const attempt = recordAttempt(game, count > 1 ? 'duplicate' : 'found',
      result.word, player, now, { count, tier, points, basePoints, bonusXp, holdDurationMs,
        timerExtendedByMs, xpAwarded: 0 });
    claimId = attempt.id;
    game.lastWord.claimId = claimId;
    for (const claim of connected) {
      claim.expiresAt = expiresAt;
      claim.holdDurationMs = holdDurationMs;
    }
    game.pendingClaims.push({ id: claimId, word: result.word, path: [...path], expiresAt,
      holdDurationMs, timerExtendedByMs, bonusXp,
      finder: p.displayName, avatar: p.avatar, playerKey: key,
      platform: p.platform, userId: p.userId, at: now });
    syncHeldUntil(game);
  } else {
    game.moves -= 1;
    game.board = core.dropTiles(game.board, path,
      core.seededRandom(game.seed + ':drop:' + game.version + ':' + path.join(',')));
    if (core.countVowels(game.board) < core.MIN_VOWELS || !core.findWords(game.board, 1).length)
      game.board = core.createBoard(core.seededRandom(game.seed + ':rescue:' + game.version));
    game.version += 1;
  }
  if (game.moves !== null && (game.cleared >= core.GOAL || game.moves <= 0)) game.finishedAt = now;
  if (game.moves === null && p.score >= WIN_SCORE) game.finishedAt = now;
  return { ok: true, word: result.word, points, basePoints, bonusXp, holdDurationMs,
    timerExtendedByMs, count, claimId };
}

function registerRoutes(app, deps) {
  const { db, wordBank, wtFetch, WORD_EMPIRES_URL, WT_API_SECRET,
    getCurrentWordTycoonAccountId, streamers, isStreamActive, onDailyWin,
    onStreamRound, onStreamWin } = deps;
  // Targets are possible puzzle answers, not the complete valid-guess list.
  // Keep targets in the union for Word Bank installations where a target is
  // absent from its length-indexed dictionary array.
  const acceptedWords = new Set();
  for (let length = 3; length <= 7; length++) {
    for (const word of wordBank.getDictionary(length)) acceptedWords.add(word);
    for (const word of wordBank.getTargets(length)) acceptedWords.add(word);
  }
  const words = [...acceptedWords];
  // Codes are aligned with words: t = three-letter, c = common (Zipf >= 4),
  // r = rare (below 4), h = hidden (no frequency entry).
  const tierCodes = words.map(word => {
    if (word.length === 3) return 't';
    const zipf = wordBank.getRawFrequency(word);
    return zipf === null ? 'h' : zipf >= core.ZIPF_COMMON_THRESHOLD ? 'c' : 'r';
  }).join('');
  if (!core.configureWords(words, tierCodes)) throw new Error('Wordfall could not load the Word Tycoon word bank.');
  const rewards = deps.rewards || createHostedActionRewards({ game: 'wordfall', directory: deps.rewardOutboxDir,
    db, baseUrl: WORD_EMPIRES_URL, apiSecret: WT_API_SECRET, request: wtFetch });
  const locks = new Map(), hits = new Map(), holdTimers = new Map(), finishDeliveries = new Map();
  const streamerBalances = new Map(), streamerBalanceIdentities = new Map();
  function serial(key, work) {
    const task = (locks.get(key) || Promise.resolve()).catch(() => {}).then(work);
    locks.set(key, task);
    task.finally(() => { if (locks.get(key) === task) locks.delete(key); }).catch(() => {});
    return task;
  }
  function rate(key, max = 120) {
    const now = Date.now(), entry = hits.get(key);
    if (!entry || now - entry.at >= 60000) { hits.set(key, { at: now, count: 1 }); return true; }
    return ++entry.count <= max;
  }
  function get(key) { return db.getLetterworksValue(STATE_PREFIX + key); }
  function set(key, value) { db.setLetterworksValue(STATE_PREFIX + key, value); }
  function isPlayer(player) {
    return player && player.userId && !/^(web_guest_|guest_|anon_|wsguest_|guest-)/i.test(String(player.userId))
      && !['bot', 'system'].includes(player.platform);
  }
  async function bridge(endpoint, payload) {
    const response = await wtFetch(WORD_EMPIRES_URL + endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (!response.ok || data.ok === false) throw new Error(data.message || 'Word Tycoon rejected the update.');
    return data;
  }
  function library(player, word) {
    if (isPlayer(player)) bridge('/api/library/report', { ...compactPlayer(player), game: 'wordfall', word })
      .catch(err => console.warn('[Wordfall] library:', err.message));
  }
  function prepareReward(claim, player, xp, event, period) {
    return rewards.prepare({ key: STATE_PREFIX + 'reward:' + claim, player: compactPlayer(player), xp, event, period });
  }
  function prepareWord(game, player, result) {
    const claim = prepareReward('word:' + game.id + ':' + result.claimId + ':' + playerKey(player), player, result.points, 'word');
    if (claim.eventId) Object.assign(game.lastWord, { rewardEventId: claim.eventId,
      rewardPending: true, rewardAlreadyCollected: !claim.fresh });
    // A goal-reaching word must reserve the round award before waiting on its
    // separate word delivery. Restart/rotation must not lose that second claim.
    if (game.finishedAt) game.finishClaim = prepareFinish(game);
    return claim;
  }
  function prepareFinish(game) {
    const solo = game.mode === 'solo' || game.mode === 'daily';
    const ranked = Object.values(game.players).sort((a, b) => b.score - a.score || a.firstAt - b.firstAt);
    const candidate = solo ? Object.values(game.players)[0] : ranked[0];
    return candidate && (!solo || game.cleared >= core.GOAL)
      ? prepareReward(solo ? game.mode + ':' + game.date + ':' + candidate.userId
        : game.mode + ':' + game.id + ':' + playerKey(candidate), candidate,
        game.mode === 'daily' ? 50 : 25, game.mode === 'daily' ? 'daily-win' : 'win', game.mode === 'daily' ? game.date : null) : null;
  }
  async function account(req) {
    const user = req.session?.discordUser;
    if (!user) return null;
    const id = await getCurrentWordTycoonAccountId(user);
    if (!id) return null;
    return { platform: 'discord', userId: String(id), username: user.username || String(id),
      displayName: String(user.displayName || user.globalName || user.username || 'Player').slice(0, 40),
      avatar: typeof user.avatar === 'string' && user.avatar.startsWith('https://') ? user.avatar.slice(0, 300) : null };
  }
  async function rewardWord(game, player, result, claim) {
    const awarded = await rewards.deliver(claim);
    applyWordReward(game, result, awarded);
    return awarded;
  }
  function applyWordReward(game, result, awarded) {
    result.bonusXpAwarded = result.bonusXp && result.points
      ? Math.min(awarded.xpAwarded, Math.round(awarded.xpAwarded * result.bonusXp / result.points)) : 0;
    result.letterXp = allocateLetterXp(result.word, result.basePoints,
      awarded.xpAwarded - result.bonusXpAwarded);
    if (game.lastWord?.claimId === result.claimId) {
      game.lastWord.xpAwarded = awarded.xpAwarded;
      game.lastWord.letterXp = result.letterXp;
      game.lastWord.bonusXpAwarded = result.bonusXpAwarded;
      game.lastWord.newBalance = awarded.newBalance ?? null;
      game.lastWord.rewardMessage = awarded.message;
      game.lastWord.rewardPending = !!awarded.rewardPending;
    }
    const attempt = game.recentAttempts?.find(entry => entry.id === result.claimId);
    if (attempt && ['found', 'duplicate'].includes(attempt.type)) {
      attempt.xpAwarded = awarded.xpAwarded;
      attempt.bonusXpAwarded = result.bonusXpAwarded;
    }
  }
  async function completeSharedWord(roomId, game, player, result, claim) {
    // Delivery can take seconds. Only board mutations and receipt projection
    // belong in the room lock; never write this pre-delivery board back later.
    const award = await rewardWord(game, player, result, claim);
    Object.assign(result, { xpAwarded: award.xpAwarded, newBalance: award.newBalance ?? null,
      rewardMessage: award.message, rewardPending: !!award.rewardPending });
    await serial('room:' + roomId, async () => {
      const current = get(keyForRoom(roomId));
      if (!current || current.id !== game.id) return;
      applyWordReward(current, result, award);
      if (current.finishedAt) await finish(current, roomId);
      set(keyForRoom(roomId), current);
    });
    // Preserve the winning play's confirmed word/win response, while room
    // reads and round rotation remain free to proceed during either delivery.
    await finishDeliveries.get(game.id);
    return serial('room:' + roomId, async () => snapshot(await room(roomId, game.mode)));
  }
  function deliverSharedFinish(game, roomId, claim) {
    if (finishDeliveries.has(game.id)) return;
    const task = (async () => {
      // A recovered winning round still delivers its saved word before its win.
      if (game.lastWord?.rewardEventId) await rewards.deliver({
        eventId: game.lastWord.rewardEventId, fresh: !game.lastWord.rewardAlreadyCollected });
      const award = await rewards.deliver(claim);
      game.reward = award;
      await serial('room:' + roomId, () => {
        const current = get(keyForRoom(roomId));
        if (current?.id !== game.id) return;
        current.reward = award;
        refreshWord(current);
        set(keyForRoom(roomId), current);
      });
      if (game.mode === 'stream') try {
        const ranked = Object.values(game.players).sort((a, b) => b.score - a.score || a.firstAt - b.firstAt);
        onStreamWin?.(roomId, game.winner, ranked, game);
      } catch (err) { console.error('[Wordfall] stream win:', err.message); }
    })();
    finishDeliveries.set(game.id, task);
    task.finally(() => { finishDeliveries.delete(game.id); })
      .catch(err => console.error('[Wordfall] shared win reward:', err));
  }
  function refreshWord(game) {
    const word = game.lastWord;
    if (!word?.rewardPending || !word.rewardEventId) return false;
    const value = rewards.refresh(word);
    if (value.rewardPending) return false;
    const bonus = word.bonusXp && word.points
      ? Math.min(value.xpAwarded, Math.round(value.xpAwarded * word.bonusXp / word.points)) : 0;
    Object.assign(word, { xpAwarded: value.xpAwarded, bonusXpAwarded: bonus,
      letterXp: allocateLetterXp(word.word, word.basePoints, value.xpAwarded - bonus),
      newBalance: value.newBalance, rewardMessage: value.message, rewardPending: false });
    const attempt = game.recentAttempts?.find(entry => entry.id === word.claimId);
    if (attempt) Object.assign(attempt, { xpAwarded: value.xpAwarded, bonusXpAwarded: bonus });
    return true;
  }
  async function finish(game, roomId) {
    if (!game.finishedAt) game.finishedAt = Date.now();
    if (game.settled) { game.reward = rewards.refresh(game.reward); return; }
    const ranked = Object.values(game.players).sort((a, b) => b.score - a.score || a.firstAt - b.firstAt);
    const claim = game.finishClaim || prepareFinish(game);
    game.settled = true;
    if (roomId) set(keyForRoom(roomId), game);
    if (game.mode === 'solo' || game.mode === 'daily') {
      const winner = Object.values(game.players)[0];
      if (winner && game.mode === 'daily') await serial('daily-board:' + game.date, async () => {
        const key = 'daily-leaderboard:' + game.date;
        const rows = (get(key) || []).filter(row => row.userId !== winner.userId);
        rows.push({ userId: winner.userId, name: winner.displayName, avatar: winner.avatar,
          score: game.score, words: game.words, cleared: game.cleared, finishedAt: game.finishedAt });
        rows.sort((a, b) => b.score - a.score || a.finishedAt - b.finishedAt);
        set(key, rows.slice(0, 100));
      });
      if (winner && game.cleared >= core.GOAL) {
        game.winner = winner;
        if (game.mode === 'daily' && game.date === date()) await onDailyWin?.(winner.userId, game.date);
        game.reward = await rewards.deliver(claim);
        if (game.mode === 'daily') {
          const bestKey = 'daily-best:' + game.date + ':' + winner.userId;
          if ((get(bestKey)?.score || 0) < game.score) set(bestKey, { name: winner.displayName,
            avatar: winner.avatar, score: game.score, words: game.words });
        }
      }
    } else {
      game.winner = ranked[0] || null;
      if (game.mode === 'stream') try { onStreamRound?.(roomId, game); }
      catch (err) { console.error('[Wordfall] stream round:', err.message); }
      if (game.winner) {
        game.reward = claim.skipped ? claim.answer : rewards.refresh({ rewardEventId: claim.eventId,
          rewardAlreadyCollected: !claim.fresh, rewardPending: true, xpAwarded: 0 });
        set(keyForRoom(roomId), game);
        deliverSharedFinish(game, roomId, claim);
      }
    }
  }
  function keyForRun(mode, userId) { return 'run:' + mode + ':' + userId; }
  function keyForRoom(roomId) { return 'room:' + roomId; }
  function scheduleHold(roomId, game) {
    clearTimeout(holdTimers.get(roomId));
    holdTimers.delete(roomId);
    if (game.finishedAt || !game.pendingClaims?.length) return;
    syncHeldUntil(game);
    const nextExpiry = nextHeldExpiry(game);
    const timer = setTimeout(() => {
      holdTimers.delete(roomId);
      serial('room:' + roomId, async () => {
        const current = get(keyForRoom(roomId));
        if (!current || current.id !== game.id) return;
        if (settlePending(current)) set(keyForRoom(roomId), current);
        if (current.pendingClaims?.length) scheduleHold(roomId, current);
      }).catch(err => console.error('[Wordfall] held board:', err));
    }, Math.max(0, nextExpiry - Date.now()) + 15);
    timer.unref();
    holdTimers.set(roomId, timer);
  }
  async function room(roomId, mode) {
    const key = keyForRoom(roomId);
    let game = get(key), now = Date.now();
    if (game?.finishedAt && !game.settled && game.finishClaim) {
      await finish(game, roomId); set(key, game);
    }
    if (!game || (game.finishedAt && now - game.finishedAt >= NEXT_ROUND_MS)) {
      game = newGame(mode, mode + ':' + roomId + ':' + crypto.randomUUID(), now);
      set(key, game);
    }
    if (game.moves === null && !game.finishedAt) {
      if (game.pendingClaims?.some(claim => !Number.isFinite(claim.expiresAt))) {
        syncHeldUntil(game);
        set(key, game);
      }
      if (settlePending(game, now)) set(key, game);
      if (game.pendingClaims?.length) scheduleHold(roomId, game);
      if (!game.pendingClaims?.length && core.countVowels(game.board) < VOWEL_RESCUE_THRESHOLD) {
        game.board = core.createBoard(core.seededRandom(game.seed + ':vowel-rescue:' + game.version));
        game.version += 1;
        set(key, game);
      }
      // Existing persisted timed rounds adopt the new score goal without expiring.
      if (game.endsAt !== null || game.winScore !== WIN_SCORE) {
        game.endsAt = null;
        game.winScore = WIN_SCORE;
        set(key, game);
      }
      if (Object.values(game.players).some(player => player.score >= WIN_SCORE)) {
        await finish(game, roomId);
        set(key, game);
      }
    }
    if (game.settled) game.reward = rewards.refresh(game.reward);
    if (refreshWord(game)) set(key, game);
    return game;
  }
  const router = express.Router();
  router.use((req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (req.method !== 'GET' && req.headers.origin
      && !['https://wordtycoon.live', 'https://www.wordtycoon.live', 'https://w.wordtycoon.live',
        'https://wordgame.live', 'https://www.wordgame.live'].includes(req.headers.origin)
      && !/^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(req.headers.origin))
      return res.status(403).json({ ok: false, error: 'Invalid origin.' });
    if (!rate('ip:' + req.ip, 360)) return res.status(429).json({ ok: false, error: 'Please slow down.' });
    next();
  });
  const signedIn = work => async (req, res) => {
    try {
      const player = await account(req);
      if (!player) return res.status(401).json({ ok: false, error: 'Sign in to Word Tycoon to play connected modes.' });
      await work(req, res, player);
    } catch (err) {
      console.error('[Wordfall]', err);
      if (!res.headersSent) res.status(500).json({ ok: false, error: 'Wordfall is temporarily unavailable.' });
    }
  };
  router.get('/config', (req, res) => res.json({ ok: true, words, tierCodes, scoring: 'rectangled',
    date: date(), moves: core.MOVES, goal: core.GOAL, winScore: WIN_SCORE }));
  router.get('/me', signedIn(async (req, res, player) => {
    const mode = ['solo', 'daily'].includes(req.query.mode) ? req.query.mode : 'daily';
    await serial('run:' + mode + ':' + player.userId, async () => {
      const key = keyForRun(mode, player.userId), game = get(key);
      if (game?.finishedAt) { await finish(game); set(key, game); }
      res.json({ ok: true, player: compactPlayer(player),
        state: game && (mode !== 'daily' || game.date === date()) ? snapshot(game) : null });
    });
  }));
  router.get('/balance', signedIn(async (req, res, player) => {
    const response = await wtFetch(WORD_EMPIRES_URL + '/api/balance', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({ platform: player.platform, userId: player.userId }),
      signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    res.json({ ok: true, balance: Number(data.xp || 0) });
  }));
  router.post('/run/start', express.json({ limit: '2kb' }), signedIn(async (req, res, player) => {
    const mode = req.body?.mode;
    if (!['solo', 'daily'].includes(mode)) return res.status(400).json({ ok: false, error: 'Choose solo or daily.' });
    await serial('run:' + mode + ':' + player.userId, async () => {
      const key = keyForRun(mode, player.userId), old = get(key);
      if (old?.finishedAt) { await finish(old); set(key, old); }
      if (old && ((mode === 'daily' && old.date === date())
        || (!old.finishedAt && req.body?.replace !== true)))
        return res.json({ ok: true, state: snapshot(old), resumed: true });
      if (!rate('start:' + player.userId, 12)) return res.status(429).json({ ok: false, error: 'Please wait before starting again.' });
      const game = newGame(mode, mode === 'daily' ? 'wordfall:daily:' + date() : crypto.randomUUID());
      set(key, game); res.json({ ok: true, state: snapshot(game) });
    });
  }));
  router.post('/run/play', express.json({ limit: '2kb' }), signedIn(async (req, res, player) => {
    const mode = req.body?.mode;
    if (!['solo', 'daily'].includes(mode)) return res.status(400).json({ ok: false, error: 'Invalid mode.' });
    await serial('run:' + mode + ':' + player.userId, async () => {
      const key = keyForRun(mode, player.userId), game = get(key);
      if (!game || (mode === 'daily' && game.date !== date())) return res.status(404).json({ ok: false, error: 'Start today’s round first.' });
      if (game.id !== req.body.roundId) return res.status(409).json({ ok: false, code: 'stale', state: snapshot(game), error: 'This round changed.' });
      const result = playPath(game, player, req.body.path, req.body.version);
      if (result.ok) {
        library(player, result.word);
        set(key, game);
        if (game.finishedAt) await finish(game);
        set(key, game);
      }
      res.status(result.ok ? 200 : 409).json({ ...result, state: snapshot(game) });
    });
  }));
  router.post('/run/shuffle', express.json({ limit: '2kb' }), signedIn(async (req, res, player) => {
    const mode = req.body?.mode;
    if (!['solo', 'daily'].includes(mode)) return res.status(400).json({ ok: false, error: 'Invalid mode.' });
    await serial('run:' + mode + ':' + player.userId, async () => {
      const key = keyForRun(mode, player.userId), game = get(key);
      if (!game || game.id !== req.body.roundId || game.finishedAt
        || game.version !== req.body.version) return res.status(409).json({ ok: false, error: 'The round changed.', state: game && snapshot(game) });
      game.moves -= 1;
      game.board = core.createBoard(core.seededRandom(game.seed + ':shuffle:' + game.version));
      game.version += 1;
      if (game.moves <= 0) game.finishedAt = Date.now();
      set(key, game);
      if (game.finishedAt) await finish(game);
      set(key, game); res.json({ ok: true, state: snapshot(game) });
    });
  }));
  function streamId(value) {
    const streamer = streamers.get(value) || streamers.getByHandle(value);
    return streamer && isStreamActive(streamer.discordId) ? streamer.discordId : null;
  }
  async function linkedBalance(platform, userId) {
    const response = await wtFetch(WORD_EMPIRES_URL + '/api/balance', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-api-key': WT_API_SECRET },
      body: JSON.stringify({ platform, userId }), signal: AbortSignal.timeout(20000) });
    const data = await response.json();
    if (response.ok && data.ok === false && data.message === 'Player not found') return null;
    const balance = Number(data.xp);
    if (!response.ok || !data.ok || !Number.isFinite(balance))
      throw new Error(data.message || 'Streamer balance unavailable.');
    return balance;
  }
  router.get('/room/:scope/streamer-balance', async (req, res) => {
    const id = streamId(req.params.scope);
    if (!id) return res.status(404).json({ ok: false, error: 'Wordfall is not active on this stream.' });
    try {
      const cached = streamerBalances.get(id);
      if (cached && Date.now() - cached.at < 10000)
        return res.json({ ok: true, balance: cached.balance });
      let identity = streamerBalanceIdentities.get(id) || { platform: 'discord', userId: id };
      let balance = await linkedBalance(identity.platform, identity.userId);
      if (balance === null) {
        streamerBalanceIdentities.delete(id);
        const response = await wtFetch(WORD_EMPIRES_URL + '/api/link/status/' + encodeURIComponent(id), {
          headers: { 'x-api-key': WT_API_SECRET }, signal: AbortSignal.timeout(20000) });
        const data = await response.json();
        if (!response.ok || !data.ok) throw new Error(data.message || 'Linked balance unavailable.');
        const accounts = (data.accounts || []).filter(account => account.platform && account.platform_user_id);
        const checks = await Promise.allSettled(accounts.map(account =>
          linkedBalance(account.platform, account.platform_user_id)));
        const found = checks.flatMap((check, index) => check.status === 'fulfilled' && check.value !== null
          ? [{ identity: { platform: accounts[index].platform, userId: accounts[index].platform_user_id },
            balance: check.value }] : []);
        if (!found.length && checks.some(check => check.status === 'rejected'))
          throw checks.find(check => check.status === 'rejected').reason;
        found.sort((a, b) => b.balance - a.balance);
        identity = found[0]?.identity || null;
        balance = found[0]?.balance ?? 0;
      }
      if (identity) streamerBalanceIdentities.set(id, identity);
      streamerBalances.set(id, { balance, at: Date.now() });
      res.json({ ok: true, balance });
    } catch (err) {
      console.warn('[Wordfall] streamer balance:', err.message);
      res.status(503).json({ ok: false, error: 'Streamer balance is temporarily unavailable.' });
    }
  });
  router.get('/room/:scope', async (req, res) => {
    try {
      const scope = req.params.scope;
      if (scope !== 'global' && !streamId(scope)) return res.status(404).json({ ok: false, error: 'Wordfall is not active on this stream.' });
      const id = scope === 'global' ? 'global' : streamId(scope);
      await serial('room:' + id, async () => res.json({ ok: true, state: snapshot(await room(id, scope === 'global' ? 'multi' : 'stream')) }));
    } catch (err) { console.error('[Wordfall] room:', err); res.status(500).json({ ok: false, error: 'Room unavailable.' }); }
  });
  router.post('/room/:scope/play', express.json({ limit: '2kb' }), signedIn(async (req, res, player) => {
    const scope = req.params.scope, id = scope === 'global' ? 'global' : streamId(scope);
    if (!id) return res.status(404).json({ ok: false, error: 'Wordfall is not active on this stream.' });
    const accepted = await serial('room:' + id, async () => {
      const game = await room(id, scope === 'global' ? 'multi' : 'stream');
      if (game.id !== req.body.roundId) return { game,
        result: { ok: false, code: 'stale', error: 'The round changed.' } };
      const beforeAttempt = game.attemptSeq || 0;
      const result = playPath(game, player, req.body.path, req.body.version);
      if (result.ok) {
        const claim = prepareWord(game, player, result);
        library(player, result.word); set(keyForRoom(id), game);
        scheduleHold(id, game);
        return { game, result, claim };
      } else if ((game.attemptSeq || 0) > beforeAttempt) {
        set(keyForRoom(id), game);
      }
      return { game, result };
    });
    const { game, result, claim } = accepted;
    const state = result.ok ? await completeSharedWord(id, game, player, result, claim) : snapshot(game);
    res.status(result.ok ? 200 : 409).json({ ...result, state });
  }));
  router.get('/leaderboard', (req, res) => {
    const day = date();
    res.json({ ok: true, day, top: (get('daily-leaderboard:' + day) || []).slice(0, 20) });
  });
  app.use('/api/wordfall', router);
  const sweep = setInterval(() => {
    for (const [key, entry] of hits) if (Date.now() - entry.at > 120000) hits.delete(key);
  }, 60000);
  sweep.unref();
  return {
    handleChat(streamerId, normalized) {
      if (!normalized || ['bot', 'system'].includes(normalized.platform) || !normalized.user?.id) return;
      const id = streamId(String(streamerId));
      if (!id || !rate('chat:' + id + ':' + normalized.platform + ':' + normalized.user.id, 90)) return;
      const word = String(normalized.message || '').trim().toLowerCase();
      if (!/^[a-z]{3,7}$/.test(word)) return;
      serial('room:' + id, async () => {
        const game = await room(id, 'stream'), path = core.findPathForWord(game.board, word);
        if (!path) return;
        const user = normalized.user;
        const player = { platform: normalized.platform, userId: String(user.id), username: user.username,
          displayName: String(user.customNick || user.displayName || user.username || 'Viewer').slice(0, 40),
          avatar: user.profilePic || null };
        const result = playPath(game, player, path, game.version);
        if (result.ok) {
          const claim = prepareWord(game, player, result);
          set(keyForRoom(id), game); scheduleHold(id, game); library(player, result.word);
          return { game, player, result, claim };
        } else if (['word', 'duplicate'].includes(result.code)) set(keyForRoom(id), game);
      }).then(accepted => accepted && completeSharedWord(id, accepted.game, accepted.player,
        accepted.result, accepted.claim)).catch(err => console.error('[Wordfall] chat:', err));
    },
    startRewards: rewards.start,
    close() { clearInterval(sweep); rewards.stop(); for (const timer of holdTimers.values()) clearTimeout(timer); },
  };
}

module.exports = { newGame, playPath, settlePending, snapshot, registerRoutes, allocateLetterXp };
