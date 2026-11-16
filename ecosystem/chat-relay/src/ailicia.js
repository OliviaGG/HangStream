'use strict';

/**
 * ai_licia Forwarder v1
 *
 * Second sink behind sassie-forwarder: receives the same normalized events
 * and relays game state to the hosted ai_licia co-host service so she can
 * comment on and hint at the live Word Tycoon games.
 *
 *   POST {base}/events              — silent context (memory), <= 700 chars
 *   POST {base}/events/generations  — makes her speak, <= 300 chars
 *
 * The March-2026 migration away from ai_licia was caused by 429 storms, so
 * this module is aggressively rate-disciplined:
 *   - context is coalesced and flushed at most once per CONTEXT_MIN_INTERVAL
 *   - generations obey a global cooldown; excess triggers are dropped, not queued
 *   - a 429 pauses ALL sends until Retry-After (default 5 min)
 *
 * Safe-context rule: the round's target word is NEVER sent while a round is
 * in progress — only guesses, ranks, and player info. The answer word is only
 * included on win events, when the round is already over.
 *
 * Enable: AILICIA_ENABLED=1 + AILICIA_API_KEY in .env
 */

const AILICIA_ENABLED = process.env.AILICIA_ENABLED === '1';
const API_KEY = process.env.AILICIA_API_KEY || '';
// NOTE: the TikTok handle was renamed jorrybeaufart -> museumcomesalive on
// 2026-07-19. ai_licia answers 401 (not 404) when the API key is valid but the
// channelName is not one it is authorised for, so a stale value here reads as
// an auth failure and sends you hunting for a bad key. Keep this in sync.
const CHANNEL = process.env.AILICIA_CHANNEL || 'museumcomesalive';
const BASE_URL = (process.env.AILICIA_API_URL || 'https://api.getailicia.com/v1').replace(/\/+$/, '');

const CONTEXT_MAX_CHARS = 700;
const GENERATION_MAX_CHARS = 300;
const CONTEXT_MIN_INTERVAL_MS = 20 * 1000;   // coalesced state pushes
const CONTEXT_TTL_SECONDS = 120;             // context self-expires in her memory
const GENERATION_COOLDOWN_MS = 60 * 1000;    // min gap between spoken reactions
const WIN_COOLDOWN_MS = 15 * 1000;           // wins are rare — allow a shorter gap
const HINT_INTERVAL_MS = 4 * 60 * 1000;      // stall nudge at most every 4 min
const ACTIVE_WINDOW_MS = 3 * 60 * 1000;      // game counts as "being played" window
const RATE_LIMIT_PAUSE_MS = 5 * 60 * 1000;   // default pause on 429
const TIMEOUT_MS = 8000;

// ── Fan-club "become a Pookie" promo ─────────────────────────
// A slow, personal, opt-out-able nudge: ai_licia invites a recent chatter who
// is NOT yet a fan-club member (a "Pookie") to join by sending the TikTok
// "Heart Me" gift. Lowest priority — it obeys the same global generation
// cooldown as everything else, so any game win/close-guess reaction always
// wins the slot and the promo only speaks in the quiet gaps.
const FANCLUB_PROMO_ENABLED = process.env.AILICIA_FANCLUB_PROMO !== '0'; // default ON
const PROMO_INTERVAL_MS = parseInt(process.env.AILICIA_FANCLUB_PROMO_INTERVAL_MS, 10) > 0
  ? parseInt(process.env.AILICIA_FANCLUB_PROMO_INTERVAL_MS, 10)
  : 12 * 60 * 1000;                          // at most one promo every 12 min
const PROMO_CHATTER_TTL_MS = 10 * 60 * 1000; // a chatter counts as "recent" for 10 min
const PROMO_CHECK_INTERVAL_MS = parseInt(process.env.AILICIA_FANCLUB_PROMO_CHECK_MS, 10) > 0
  ? parseInt(process.env.AILICIA_FANCLUB_PROMO_CHECK_MS, 10)
  : 60 * 1000;                               // how often the promo slot is evaluated
const WELCOME_MIN_GAP_MS = 15 * 1000;        // min gap between two join-welcomes (anti-flood)
// Read paid "Pookie Tok" messages out loud. Already filtered before payment,
// so it's safe to voice. Own anti-flood gap so a burst of paid messages can't
// overlap. On by default; AILICIA_POOKIE_READ=0 disables.
const POOKIE_READ_ENABLED = process.env.AILICIA_POOKIE_READ !== '0';
const POOKIE_READ_MIN_GAP_MS = 8 * 1000;

// ── Runtime state ────────────────────────────────────────────

// Per-game rolling state, keyed by event source (game name)
const games = new Map();
let activeGame = null;          // most recently active source
let contextDirty = false;
let lastContextSentAt = 0;
let lastGenerationAt = 0;
let lastWinGenerationAt = 0;
let pausedUntil = 0;            // 429 backoff window
let timersStarted = false;

// Fan-club promo state
const recentChatters = new Map();  // key `${platform}:${id}` -> { name, lastSeen }
const nudgedChatters = new Map();  // key -> ts last nudged (session-long, avoid repeats)
let lastPromoAt = 0;
let lastWelcomeAt = 0;
let lastPookieReadAt = 0;
let _totalPookieReads = 0;
let _totalPromos = 0;
let _totalWelcomes = 0;

// Sparse logging — only log state changes
let _online = null;
let _totalContext = 0;
let _totalGenerations = 0;
let _totalFailed = 0;

function gameState(source) {
  let g = games.get(source);
  if (!g) {
    g = {
      lastEventTs: 0,
      lastWinTs: 0,
      lastHintTs: 0,
      playerCount: 0,
      bestGuess: '',
      bestRank: 0,
      bestPlayer: '',
      totalRankedWords: 0,
      recent: []   // short strings, newest first
    };
    games.set(source, g);
  }
  return g;
}

function clamp(text, max) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  return t.length <= max ? t : t.slice(0, max - 1) + '…';
}

// ── HTTP (fire-and-forget with 429 discipline) ───────────────

function post(path, content, kind) {
  if (Date.now() < pausedUntil) return;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${API_KEY}`
    },
    body: JSON.stringify({
      eventType: 'GAME_EVENT',
      data: kind === 'context'
        ? { channelName: CHANNEL, content, ttl: CONTEXT_TTL_SECONDS }
        : { channelName: CHANNEL, content }
    })
  })
    .then(res => {
      clearTimeout(timer);
      if (res.ok) {
        if (_online !== true) {
          console.log('[ai_licia] Connected — relaying game events');
          _online = true;
        }
        if (kind === 'context') _totalContext++; else _totalGenerations++;
      } else if (res.status === 429) {
        const retryAfter = parseInt(res.headers.get('retry-after'), 10);
        pausedUntil = Date.now() + (Number.isFinite(retryAfter) ? retryAfter * 1000 : RATE_LIMIT_PAUSE_MS);
        _totalFailed++;
        console.error(`[ai_licia] 429 rate-limited — pausing all sends for ${Math.round((pausedUntil - Date.now()) / 1000)}s`);
        _online = false;
      } else {
        _totalFailed++;
        if (_online !== false) {
          console.error(`[ai_licia] HTTP ${res.status} on ${path}`);
          _online = false;
        }
        // One delayed retry for spoken reactions only — context is droppable
        if (kind === 'generation' && res.status >= 500) {
          setTimeout(() => post(path, content, 'generation-retry'), 2500);
        }
      }
    })
    .catch(err => {
      clearTimeout(timer);
      _totalFailed++;
      if (_online !== false) {
        const reason = err.name === 'AbortError' ? 'timeout' : 'unreachable';
        console.error(`[ai_licia] API ${reason} — sends paused until reconnect`);
        _online = false;
      }
    });
}

function sendContext(content) {
  post('/events', clamp(content, CONTEXT_MAX_CHARS), 'context');
  lastContextSentAt = Date.now();
  contextDirty = false;
}

function trySpeak(content, cooldownMs) {
  const now = Date.now();
  if (now - lastGenerationAt < (cooldownMs || GENERATION_COOLDOWN_MS)) return false;
  lastGenerationAt = now;
  post('/events/generations', clamp(content, GENERATION_MAX_CHARS), 'generation');
  return true;
}

// Wins bypass the global chatter cooldown (a win seconds after a close-guess
// reaction is the normal sequence) — they only rate-limit against other wins.
function speakWin(content) {
  const now = Date.now();
  if (now - lastWinGenerationAt < WIN_COOLDOWN_MS) return false;
  lastWinGenerationAt = now;
  lastGenerationAt = now; // a win reaction still pushes back regular chatter
  post('/events/generations', clamp(content, GENERATION_MAX_CHARS), 'generation');
  return true;
}

// A fan-club join is a rare, celebratory moment (and the best possible ad), so
// it's greeted promptly like a win — bypassing the global chatter cooldown and
// rate-limiting only against other welcomes so a burst of joins can't spam.
function speakWelcome(content) {
  const now = Date.now();
  if (now < pausedUntil) return false;
  if (now - lastWelcomeAt < WELCOME_MIN_GAP_MS) return false;
  lastWelcomeAt = now;
  lastGenerationAt = now; // a welcome still pushes back regular chatter/promo
  post('/events/generations', clamp(content, GENERATION_MAX_CHARS), 'generation');
  return true;
}

// A paid Pookie Tok message the viewer paid to have read out. Like a win/welcome
// it bypasses the global chatter cooldown and only rate-limits against other
// paid reads, so each one is reliably voiced but a burst can't overlap.
function speakPookie(content) {
  const now = Date.now();
  if (now < pausedUntil) return false;
  if (now - lastPookieReadAt < POOKIE_READ_MIN_GAP_MS) return false;
  lastPookieReadAt = now;
  lastGenerationAt = now;
  post('/events/generations', clamp(content, GENERATION_MAX_CHARS), 'generation');
  return true;
}

// Public: called when a paid Pookie Tok message is displayed, to have ai_licia
// read it aloud and thank the sender. Message is pre-filtered, so it's safe.
function readPookieMessage(payload) {
  if (!isEnabled() || !POOKIE_READ_ENABLED || !payload) return;
  const msg = String(payload.message || '').replace(/\s+/g, ' ').trim();
  if (!msg) return;
  const name = _spokenName(payload.displayName) || 'a viewer';
  // Message last so any 300-char clamp trims its tail, not the instruction.
  const spoke = speakPookie(`Read ${name}'s paid Pookie Tok message out loud to the stream word-for-word, then warmly thank ${name}. The message: "${msg}"`);
  if (spoke) _totalPookieReads++;
}

// ── Context assembly (safe: never includes the target word) ──

function buildContextSummary() {
  if (!activeGame) return '';
  const g = games.get(activeGame);
  if (!g) return '';

  const parts = [`Live on Word Tycoon: playing "${activeGame}".`];
  if (g.playerCount > 0) parts.push(`${g.playerCount} players in.`);
  if (g.lastWinTs >= g.lastEventTs && g.lastWinTs > 0) {
    parts.push('Round just ended — between rounds.');
  } else if (g.bestGuess && g.bestRank > 0) {
    const total = g.totalRankedWords ? ` of ${g.totalRankedWords}` : '';
    const by = g.bestPlayer ? ` by ${g.bestPlayer}` : '';
    parts.push(`Round unsolved. Best guess so far: "${g.bestGuess}" (rank #${g.bestRank}${total})${by}.`);
  } else {
    parts.push('Round in progress, no strong guesses yet.');
  }
  if (g.recent.length) parts.push(`Recent: ${g.recent.slice(0, 4).join('; ')}.`);
  return parts.join(' ');
}

// ── Event ingestion (called by sassie-forwarder tee) ─────────

function ingest(evt) {
  if (!AILICIA_ENABLED || !API_KEY || !evt) return;
  if (evt.type !== 'game_event') return;   // chat/gifts/joins: ai_licia's own platform hookup covers those
  // Scope to the owner's own stream: drop other streamers' game events (e.g.
  // co-hosted TikTok sessions like sueatimes). Unscoped/global events (searchle,
  // no handle) still pass. Mirrors the _channelMatches gate on chatters/joins.
  if (!_channelMatches(evt.streamerHandle)) return;

  startTimers();

  const source = evt.source || 'unknown';
  const p = evt.payload || {};
  const g = gameState(source);
  const now = Date.now();
  const name = (evt.user && (evt.user.spokenName || evt.user.displayName)) || 'a player';

  activeGame = source;
  g.lastEventTs = now;
  contextDirty = true;

  if (p.playerCount || p.searchlePlayerCount) g.playerCount = p.playerCount || p.searchlePlayerCount;
  if (p.totalRankedWords) g.totalRankedWords = p.totalRankedWords;
  if (p.searchleCurrentBestGuess && p.searchleCurrentBestRank) {
    g.bestGuess = p.searchleCurrentBestGuess;
    g.bestRank = p.searchleCurrentBestRank;
    g.bestPlayer = p.searchleCurrentBestPlayer || g.bestPlayer;
  }

  const eventName = p.eventName || '';
  const guess = p.guess || '';
  const rank = p.rank || 0;

  // ── Wins: round is over, the word is now public — speak it ──
  if (eventName === 'win' || eventName === 'jackpot_win') {
    g.lastWinTs = now;
    g.bestGuess = '';
    g.bestRank = 0;
    g.bestPlayer = '';
    g.recent = [];
    const word = p.word ? ` — the word was "${p.word}"` : '';
    const jackpot = eventName === 'jackpot_win' && p.jackpotAmount ? ` and hit a ${p.jackpotAmount} JACKPOT` : '';
    speakWin(
      `GAME WIN in ${source}: ${name} just won${word}${jackpot}${p.guessCount ? ` after ${p.guessCount} guesses` : ''}! React now: congratulate ${name} by name, hype the win, and invite chat into the next round.`
    );
    return;
  }

  // ── In-progress events: NEVER pass p.word (may be the answer) ──
  if (guess && rank > 0) {
    g.recent.unshift(`${name} guessed "${guess}" (#${rank})`);
    if (!g.bestRank || rank < g.bestRank) {
      g.bestGuess = guess;
      g.bestRank = rank;
      g.bestPlayer = name;
    }
  } else if (eventName === 'first_time_player') {
    g.recent.unshift(`${name} joined for the first time`);
  }
  if (g.recent.length > 6) g.recent.length = 6;

  // Very close guess — hype moment
  if (eventName === 'guess_best_so_far' && rank > 1 && rank <= 5) {
    trySpeak(
      `${name} guessed "${guess}" in ${source} — rank #${rank}${g.totalRankedWords ? ` of ${g.totalRankedWords}` : ''}, extremely close to the answer. React: hype ${name} up and tell chat someone is about to crack it. You don't know the answer, so don't guess it.`
    );
    return;
  }

  // Rare / hidden word finds
  if (p.isHidden || p.isRare) {
    const kind = p.isHidden ? 'ultra-rare hidden' : 'rare';
    trySpeak(
      `${name} just found the ${kind} word "${guess || p.word || ''}" in ${source}! React with excitement and congratulate ${name} by name.`
    );
  }
}

// ── Fan-club "become a Pookie" promo ─────────────────────────

// TTS-friendly name cleanup. Unlike the forwarder's sanitizeSpokenName, this
// returns '' (not 'friend') on failure so a promo/welcome is skipped rather
// than delivered impersonally — the whole point is to address a real name.
function _spokenName(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  let s = raw.replace(/[._]+/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\d{3,}\b/g, '').replace(/\s+/g, ' ').trim();
  return s;
}

// ai_licia speaks on a single channel; only that channel's chatters/joins are
// relevant. An unscoped (public, no-handle) event is allowed through.
function _channelMatches(streamerHandle) {
  if (!streamerHandle) return true;
  return String(streamerHandle).toLowerCase() === CHANNEL.toLowerCase();
}

function _promoInstruction(name) {
  return `${name} is active in chat but isn't a fan-club member yet. Warmly invite ${name} by name to become one of your Pookies — join by tapping your profile and sending the "Heart Me" gift (about a penny) for a special Pookie badge. Keep it short, sweet, and genuine — not salesy.`;
}

// Called by the relay for every scoped chat message. Members are dropped from
// (and never added to) the buffer so she never nudges someone who already joined.
function noteChatter(streamerHandle, chatter) {
  if (!isEnabled() || !FANCLUB_PROMO_ENABLED || !chatter) return;
  if (!_channelMatches(streamerHandle)) return;
  const key = chatter.key || `${chatter.platform || '?'}:${chatter.userId || ''}`;
  if (chatter.isMember) { recentChatters.delete(key); return; }
  const name = _spokenName(chatter.displayName);
  if (!name) return;
  recentChatters.set(key, { name, lastSeen: Date.now() });
  startTimers();
}

// Called by the relay the first time a viewer is observed as a NEW fan-club
// member (genuine join, checked against the DB so restarts don't re-greet).
function welcomeFanClubJoin(streamerHandle, member) {
  if (!isEnabled() || !FANCLUB_PROMO_ENABLED || !member) return;
  if (!_channelMatches(streamerHandle)) return;
  const key = member.key || `${member.platform || '?'}:${member.userId || ''}`;
  recentChatters.delete(key);
  nudgedChatters.set(key, Date.now());   // a member now — never promo them
  const name = _spokenName(member.displayName);
  if (!name) return;
  startTimers();
  const spoke = speakWelcome(
    `${name} just joined the fan club and became one of your Pookies! Give ${name} a warm, excited, personal welcome by name — thank them and make them feel special. Keep it short and genuine.`
  );
  if (spoke) _totalWelcomes++;
}

// Timer body: pick the most-recently-active eligible non-member and nudge them.
function _runFanClubPromo() {
  if (!FANCLUB_PROMO_ENABLED) return;
  const now = Date.now();
  if (now < pausedUntil) return;
  if (now - lastPromoAt < PROMO_INTERVAL_MS) return;
  if (now - lastGenerationAt < GENERATION_COOLDOWN_MS) return; // yield to any recent speech

  let target = null;
  for (const [key, c] of recentChatters) {
    if (now - c.lastSeen > PROMO_CHATTER_TTL_MS) { recentChatters.delete(key); continue; }
    if (nudgedChatters.has(key)) continue;          // already nudged this session
    if (!target || c.lastSeen > target.lastSeen) target = { key, name: c.name, lastSeen: c.lastSeen };
  }
  if (!target) return;                              // no eligible recent chatter → stream quiet/all members

  if (trySpeak(_promoInstruction(target.name), GENERATION_COOLDOWN_MS)) {
    lastPromoAt = now;
    nudgedChatters.set(target.key, now);
    _totalPromos++;
  }
}

// ── Timers: coalesced context flush + stall-hint nudge ───────

function startTimers() {
  if (timersStarted) return;
  timersStarted = true;

  const contextTimer = setInterval(() => {
    if (!contextDirty) return;
    if (Date.now() - lastContextSentAt < CONTEXT_MIN_INTERVAL_MS) return;
    const summary = buildContextSummary();
    if (summary) sendContext(summary);
  }, 5000);
  contextTimer.unref();

  const hintTimer = setInterval(() => {
    if (!activeGame) return;
    const g = games.get(activeGame);
    if (!g) return;
    const now = Date.now();
    const roundInProgress = g.lastEventTs > g.lastWinTs;
    const beingPlayed = now - g.lastEventTs < ACTIVE_WINDOW_MS;
    if (!roundInProgress || !beingPlayed) return;
    if (now - g.lastHintTs < HINT_INTERVAL_MS) return;
    if (now - lastGenerationAt < GENERATION_COOLDOWN_MS) return;

    g.lastHintTs = now;
    const best = g.bestGuess
      ? `Best guess so far is "${g.bestGuess}" (rank #${g.bestRank}) by ${g.bestPlayer || 'a player'}.`
      : 'No strong guesses yet.';
    trySpeak(
      `The ${activeGame} round is still unsolved. ${best} You don't know the answer — give chat a playful strategy nudge (think synonyms, related themes, common words) and encourage them to keep guessing.`
    );
  }, 30 * 1000);
  hintTimer.unref();

  if (FANCLUB_PROMO_ENABLED) {
    const promoTimer = setInterval(_runFanClubPromo, PROMO_CHECK_INTERVAL_MS);
    promoTimer.unref();
  }
}

// ── Public API ───────────────────────────────────────────────

function logStartup() {
  if (!AILICIA_ENABLED) return;
  if (!API_KEY) {
    console.error('[ai_licia] AILICIA_ENABLED=1 but AILICIA_API_KEY is missing — forwarder disabled');
    return;
  }
  console.log(`[ai_licia] Enabled — channel "${CHANNEL}", API ${BASE_URL}`);
  console.log(`[ai_licia] Fan-club promo ${FANCLUB_PROMO_ENABLED ? `ON (every ${Math.round(PROMO_INTERVAL_MS / 60000)} min)` : 'OFF'}`);
  console.log(`[ai_licia] Pookie Tok read-aloud ${POOKIE_READ_ENABLED ? 'ON' : 'OFF'}`);
}

function isEnabled() {
  return AILICIA_ENABLED && !!API_KEY;
}

function getStats() {
  return {
    enabled: isEnabled(),
    online: _online,
    contextSent: _totalContext,
    generationsSent: _totalGenerations,
    failed: _totalFailed,
    pausedUntil: pausedUntil > Date.now() ? new Date(pausedUntil).toISOString() : null,
    fanClubPromo: {
      enabled: FANCLUB_PROMO_ENABLED,
      intervalMs: PROMO_INTERVAL_MS,
      recentNonMembers: recentChatters.size,
      promosSent: _totalPromos,
      welcomesSent: _totalWelcomes,
      lastPromoAt: lastPromoAt ? new Date(lastPromoAt).toISOString() : null
    },
    pookieReadAloud: { enabled: POOKIE_READ_ENABLED, reads: _totalPookieReads }
  };
}

module.exports = { ingest, noteChatter, welcomeFanClubJoin, readPookieMessage, logStartup, isEnabled, getStats };
