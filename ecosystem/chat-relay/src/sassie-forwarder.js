'use strict';

/**
 * Sassie Forwarder v1
 *
 * Fire-and-forget bridge from Chat Relay events to Sassie's intake service.
 * Normalizes relay events into Sassie's unified event shape and POSTs them.
 * Never blocks relay flow — all failures are silent and non-fatal.
 *
 * Enable: SASSIE_ENABLED=1
 * Override URL: SASSIE_URL=http://localhost:3035/api/sassie/event
 */

const ailicia = require('./ailicia');

const SASSIE_URL = process.env.SASSIE_URL || 'http://localhost:3035/api/sassie/event';
const SASSIE_ENABLED = process.env.SASSIE_ENABLED === '1';
// Sassie can spend several seconds in model work before responding, so the
// forwarder budget needs to be longer than the intake service's own model timeout.
const TIMEOUT_MS = 10000;

// Sassie should only react to livestream players — not website/mobile/discord users
const LIVESTREAM_PLATFORMS = new Set(['tiktok', 'twitch', 'youtube']);

function isLivestreamPlatform(platform) {
  return LIVESTREAM_PLATFORMS.has((platform || '').toLowerCase());
}

// Sparse logging — only log state changes, not every event
let _online = null;     // null = unknown, true/false = last known
let _totalSent = 0;
let _totalFailed = 0;

function sanitizeSpokenName(name) {
  const raw = String(name || '').trim();
  if (!raw) return 'friend';

  let spoken = raw
    .replace(/[._]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  spoken = spoken.replace(/\d{3,}\b/g, '').replace(/\s+/g, ' ').trim();

  if (!spoken) {
    spoken = raw.replace(/\d+/g, '').replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  }

  return spoken || 'friend';
}

// ── Normalize to Sassie event shape ──────────────────────────

/**
 * Build a Sassie event from a Chat Relay chat message.
 * @param {object} normalized — relay normalized message (from handleMessage)
 */
function fromChatMessage(normalized) {
  // Only forward chat from livestream platforms
  if (!isLivestreamPlatform(normalized.platform)) return null;

  const displayName = normalized.user.displayName || normalized.user.username || 'unknown';
  return {
    type: 'chat_message',
    source: normalized.platform || 'unknown',
    timestamp: normalized.timestamp || new Date().toISOString(),
    priority: 'normal',
    text: normalized.message || '',
    user: {
      id: `${normalized.platform}:${normalized.user.id}`,
      displayName,
      spokenName: sanitizeSpokenName(displayName),
      platform: normalized.platform || 'unknown',
      linkedDiscord: normalized.linkedDiscord || ''
    },
    payload: {},
    meta: {}
  };
}

/**
 * Build a Sassie event from a Chat Relay join.
 * @param {object} joinData — { platform, user: { id, username, displayName } }
 */
function fromJoin(joinData) {
  // Only forward joins from livestream platforms
  if (!isLivestreamPlatform(joinData.platform)) return null;

  const displayName = joinData.user.displayName || joinData.user.username || 'unknown';
  return {
    type: 'join',
    source: joinData.platform || 'unknown',
    timestamp: new Date().toISOString(),
    priority: 'normal',
    text: '',
    user: {
      id: `${joinData.platform}:${joinData.user.id}`,
      displayName,
      spokenName: sanitizeSpokenName(displayName),
      platform: joinData.platform || 'unknown',
      linkedDiscord: ''
    },
    payload: {},
    meta: {}
  };
}

/**
 * Build a Sassie event from a Chat Relay engagement (gift, like, follow).
 * @param {object} engagement — { type, platform, user, giftName, diamondCount, ... }
 */
function fromEngagement(engagement) {
  const engType = engagement.type; // 'gift', 'like', 'follow', 'share', 'subscribe'

  // Only forward gifts and follows — likes/shares are too noisy
  if (engType !== 'gift' && engType !== 'follow') return null;

  const sassieType = engType === 'gift' ? 'gift' : 'follow';
  const payload = {};

  if (engType === 'gift') {
    payload.giftName = engagement.giftName || 'Gift';
    payload.giftCount = engagement.repeatCount || engagement.count || 1;
    payload.giftValue = engagement.diamondCount || 0;
  }

  return {
    type: sassieType,
    source: engagement.platform || 'unknown',
    timestamp: new Date().toISOString(),
    priority: engType === 'gift' ? 'high' : 'normal',
    text: '',
    user: {
      id: `${engagement.platform}:${engagement.user.id}`,
      displayName: engagement.user.displayName || engagement.user.username || 'unknown',
      spokenName: sanitizeSpokenName(engagement.user.displayName || engagement.user.username || 'unknown'),
      platform: engagement.platform || 'unknown',
      linkedDiscord: ''
    },
    payload,
    meta: {}
  };
}

/**
 * Build a Sassie event from a game-win Socket.IO event.
 * @param {object} winData — { game, winner, word, guessCount, jackpot, isDaily, ... }
 */
function fromGameWin(winData) {
  if (!winData || !winData.game) return null;

  const winner = winData.winner || {};

  // Wins from web players are allowed (was previously dropped — broke games
  // with no livestream identity like WikiSearchle's solo / web players).
  // Other event types (chat, joins, follows, gifts) still require a
  // livestream platform because they need a stream-side actor to reference.
  const platform = (winner.platform || '').toLowerCase();
  if (platform && platform !== 'web' && !isLivestreamPlatform(platform)) return null;
  const payload = {
    eventName: winData.jackpot > 0 ? 'jackpot_win' : 'win',
    word: winData.word || '',
    guessCount: winData.guessCount || undefined,
    jackpotAmount: winData.jackpot || undefined,
    isDaily: winData.isDaily || false,
    pot: winData.pot || undefined,
    frenzyMultiplier: winData.frenzyMultiplier || undefined,
    totalRankedWords: winData.totalRankedWords || undefined,
    searchleGuessCount: winData.searchleGuessCount || undefined,
    searchleElapsedMs: winData.searchleElapsedMs || undefined,
    searchlePlayerCount: winData.searchlePlayerCount || undefined,
    searchleAvgGuesses: winData.searchleAvgGuesses || undefined,
    searchleTotalGames: winData.searchleTotalGames || undefined,
    searchleCurrentBestGuess: winData.searchleCurrentBestGuess || undefined,
    searchleCurrentBestRank: winData.searchleCurrentBestRank || undefined,
    searchleCurrentBestPlayer: winData.searchleCurrentBestPlayer || undefined,
    rows: winData.rows ?? undefined,
    cols: winData.cols ?? undefined,
    percentage: winData.percentage ?? undefined,
    puzzleName: winData.puzzleName || undefined,
    puzzleTheme: winData.puzzleTheme || undefined,
    commonCount: winData.commonCount ?? undefined,
    rareCount: winData.rareCount ?? undefined,
    hiddenCount: winData.hiddenCount ?? undefined,
    threeLetterCount: winData.threeLetterCount ?? undefined,
    foundCommonCount: winData.foundCommonCount ?? undefined,
    foundRareCount: winData.foundRareCount ?? undefined,
    foundHiddenCount: winData.foundHiddenCount ?? undefined,
    foundThreeLetterCount: winData.foundThreeLetterCount ?? undefined,
    playerCount: winData.playerCount ?? undefined,
    leaderName: winData.leaderName || undefined,
    leaderScore: winData.leaderScore ?? undefined
  };

  return {
    type: 'game_event',
    source: winData.game,
    timestamp: new Date().toISOString(),
    priority: 'high',
    text: '',
    user: {
      id: winner.odid ? `discord:${winner.odid}` : `${winner.platform || 'unknown'}:${winner.uid || 'unknown'}`,
      displayName: winner.name || winner.displayName || 'Player',
      spokenName: sanitizeSpokenName(winner.name || winner.displayName || 'Player'),
      platform: winner.platform || 'unknown',
      linkedDiscord: winner.odid || ''
    },
    payload,
    streamerHandle: winData.streamerHandle || '',
    meta: { game: winData.game }
  };
}

function normalizeGameUser(source, player) {
  const entity = player || {};
  const platform = entity.platform || 'unknown';
  const rawId = entity.uid || entity.id || entity.platformUserId || entity.odid || entity.username || entity.displayName || entity.name || 'unknown';
  return {
    id: entity.odid ? `discord:${entity.odid}` : `${platform}:${rawId}`,
    displayName: entity.name || entity.displayName || entity.username || 'Player',
    spokenName: sanitizeSpokenName(entity.name || entity.displayName || entity.username || 'Player'),
    platform,
    linkedDiscord: entity.odid || entity.linkedDiscord || ''
  };
}

function fromGameEvent(source, eventName, data, priority) {
  if (!source || !eventName) return null;

  const actor = normalizeGameUser(source, data && (data.user || data.player || data.winner || data));

  // Only forward game events from livestream players — skip website/mobile/discord
  if (!isLivestreamPlatform(actor.platform)) return null;

  // Drop public-room game events: Sassie should only react to events from
  // the streamer's private session(s), not from the global online lobby.
  // wikirec emits roomMode='public' for the public global game and
  // roomMode='streamer'/'solo' for streamer rooms / solo runs. Other games
  // that don't set roomMode are passed through (back-compat).
  if (data && data.roomMode === 'public') return null;
  const rarityType = data?.isHidden
    ? 'ultra_rare'
    : data?.isRare
      ? 'rare'
      : 'common';
  const wordType = data?.isThreeLetter
    ? 'three_letter'
    : rarityType;
  const payload = {
    eventName,
    guess: data?.guess || data?.word || '',
    word: data?.targetWord || data?.word || '',
    guessCount: data?.guessCount || data?.guesses || undefined,
    rank: data?.rank || data?.position || undefined,
    distance: data?.distance || data?.remaining || undefined,
    amount: data?.amount || undefined,
    score: data?.score || undefined,
    isDaily: !!data?.isDaily,
    isRare: !!data?.isRare,
    isHidden: !!data?.isHidden,
    isThreeLetter: !!data?.isThreeLetter,
    rarityType,
    wordType,
    ringAdvanced: !!data?.ringAdvanced,
    currentRing: data?.currentRing || undefined,
    totalRings: data?.totalRings || undefined,
    ringCommonFound: data?.ringCommonFound || undefined,
    ringCommonTotal: data?.ringCommonTotal || undefined,
    rows: data?.rows ?? undefined,
    cols: data?.cols ?? undefined,
    percentage: data?.percentage ?? undefined,
    puzzleName: data?.puzzleName || undefined,
    puzzleTheme: data?.puzzleTheme || undefined,
    commonCount: data?.commonCount ?? undefined,
    rareCount: data?.rareCount ?? undefined,
    hiddenCount: data?.hiddenCount ?? undefined,
    threeLetterCount: data?.threeLetterCount ?? undefined,
    foundCommonCount: data?.foundCommonCount ?? undefined,
    foundRareCount: data?.foundRareCount ?? undefined,
    foundHiddenCount: data?.foundHiddenCount ?? undefined,
    foundThreeLetterCount: data?.foundThreeLetterCount ?? undefined,
    playerCount: data?.playerCount ?? undefined,
    leaderName: data?.leaderName || undefined,
    leaderScore: data?.leaderScore ?? undefined,
    // Searchle-specific context
    totalRankedWords: data?.totalRankedWords || undefined,
    searchleGuessCount: data?.searchleGuessCount || undefined,
    searchleElapsedMs: data?.searchleElapsedMs || undefined,
    searchlePlayerCount: data?.searchlePlayerCount || undefined,
    searchleAvgGuesses: data?.searchleAvgGuesses || undefined,
    searchleTotalGames: data?.searchleTotalGames || undefined,
    searchleCurrentBestGuess: data?.searchleCurrentBestGuess || undefined,
    searchleCurrentBestRank: data?.searchleCurrentBestRank || undefined,
    searchleCurrentBestPlayer: data?.searchleCurrentBestPlayer || undefined
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === '') {
      delete payload[key];
    }
  });

  return {
    type: 'game_event',
    source,
    timestamp: new Date().toISOString(),
    priority: priority || 'normal',
    text: '',
    user: actor,
    payload,
    streamerHandle: data?.streamerHandle || '',
    meta: {}
  };
}

function fromSystemEvent(source, systemEventName, data, priority) {
  if (!source || !systemEventName) return null;

  const payload = {
    systemEventName,
    ...((data && typeof data === 'object') ? data : {})
  };

  Object.keys(payload).forEach((key) => {
    if (payload[key] === undefined || payload[key] === '') {
      delete payload[key];
    }
  });

  return {
    type: 'system_event',
    source,
    timestamp: new Date().toISOString(),
    priority: priority || 'normal',
    text: '',
    user: {
      id: `${source}:system`,
      displayName: 'System',
      spokenName: 'system',
      platform: source,
      linkedDiscord: ''
    },
    payload,
    meta: {}
  };
}

// ── Fire-and-forget POST ─────────────────────────────────────

/**
 * Send a normalized event to Sassie. Non-blocking, non-fatal.
 * @param {object} sassieEvent — normalized Sassie event
 */
function send(sassieEvent) {
  if (!sassieEvent) return;

  // Tee into ai_licia (hosted co-host) — independent of the local Sassie
  // runtime, so it keeps working while sassie-mvp/sassie-runtime are stopped.
  ailicia.ingest(sassieEvent);

  if (!SASSIE_ENABLED) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  fetch(SASSIE_URL, {
    method: 'POST',
    signal: controller.signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sassieEvent)
  })
    .then(res => {
      clearTimeout(timer);
      if (res.ok) {
        if (_online !== true) {
          console.log('[Sassie-Fwd] Connected to Sassie intake');
          _online = true;
        }
        _totalSent++;
      } else {
        _totalFailed++;
        if (_online !== false) {
          console.error(`[Sassie-Fwd] Sassie returned HTTP ${res.status}`);
          _online = false;
        }
      }
    })
    .catch(err => {
      clearTimeout(timer);
      _totalFailed++;
      if (_online !== false) {
        const reason = err.name === 'AbortError' ? 'timeout' : 'offline';
        console.error(`[Sassie-Fwd] Sassie unreachable (${reason}) — forwarding paused until reconnect`);
        _online = false;
      }
    });
}

// ── Public API ───────────────────────────────────────────────

/** Forward a chat message to Sassie */
function forwardChat(normalized) {
  send(fromChatMessage(normalized));
}

/** Forward a join to Sassie */
function forwardJoin(joinData) {
  send(fromJoin(joinData));
}

/** Forward an engagement (gift/follow) to Sassie */
function forwardEngagement(engagement) {
  send(fromEngagement(engagement));
}

/** Forward a game-win to Sassie */
function forwardGameWin(winData) {
  send(fromGameWin(winData));
}

/** Forward a non-win game event to Sassie */
function forwardGameEvent(source, eventName, data, priority) {
  send(fromGameEvent(source, eventName, data, priority));
}

/** Forward a system event to Sassie */
function forwardSystemEvent(source, systemEventName, data, priority) {
  send(fromSystemEvent(source, systemEventName, data, priority));
}

/** Log startup status */
function logStartup() {
  if (SASSIE_ENABLED) {
    console.log(`[Sassie-Fwd] Enabled — forwarding events to ${SASSIE_URL}`);
  }
  ailicia.logStartup();
}

/** Check if forwarding is enabled */
function isEnabled() {
  return SASSIE_ENABLED;
}

module.exports = {
  forwardChat,
  forwardJoin,
  forwardEngagement,
  forwardGameWin,
  forwardGameEvent,
  forwardSystemEvent,
  logStartup,
  isEnabled
};
