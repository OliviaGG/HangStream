// ─── Chat Moderation & Censorship ─────────────────────────────────────────
// Layered filtering: word blacklist, pattern detection, spam prevention, user controls

const fs = require('fs');
const path = require('path');

const BLOCKED_WORDS_PATH = path.join(__dirname, '..', 'data', 'blocked-words.json');

// ─── State ────────────────────────────────────────────────────────────────

let blockedData = { exact: [], partial: [], patterns: [] };
let blockedRegexes = [];       // compiled from patterns
let exactSet = new Set();      // lowercase exact matches
let partialList = [];           // substrings to check

const mutedUsers = new Map();   // discordId → { until: timestamp | null (permanent) }
const bannedUsers = new Set();  // discordId set

// Spam tracking per user
const userMessages = new Map(); // discordId → [{ text, timestamp }]
const floodCooldowns = new Map(); // discordId → cooldownUntil timestamp

let slowMode = false;
const SLOW_MODE_COOLDOWN = 5000;  // 5s between messages in slow mode
const lastMessageTime = new Map(); // discordId → timestamp

// ─── Character substitution map ──────────────────────────────────────────

const CHAR_SUBS = {
  '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't',
  '@': 'a', '$': 's', '!': 'i', '+': 't', '(': 'c',
  '|': 'l', '¡': 'i', '€': 'e', '£': 'l',
  // Unicode homoglyphs — Cyrillic, Greek, and common confusables
  '\u0430': 'a', '\u0435': 'e', '\u043e': 'o', '\u0440': 'p', '\u0441': 'c',
  '\u0443': 'y', '\u0445': 'x', '\u0456': 'i', '\u0455': 's', '\u0460': 'o',
  '\u0410': 'a', '\u0412': 'b', '\u0415': 'e', '\u041a': 'k', '\u041c': 'm',
  '\u041d': 'h', '\u041e': 'o', '\u0420': 'p', '\u0421': 'c', '\u0422': 't',
  '\u0425': 'x', '\u04bb': 'h',
  '\u03B1': 'a', '\u03B5': 'e', '\u03B9': 'i', '\u03BF': 'o', '\u03C1': 'p',
  '\u03BA': 'k', '\u03BD': 'v', '\u03C5': 'u',
  '\u0391': 'a', '\u0392': 'b', '\u0395': 'e', '\u0397': 'h', '\u0399': 'i',
  '\u039A': 'k', '\u039C': 'm', '\u039D': 'n', '\u039F': 'o', '\u03A1': 'p',
  '\u03A4': 't', '\u03A5': 'y', '\u03A7': 'x', '\u03A9': 'w',
  // Fullwidth Latin
  '\uFF41': 'a', '\uFF42': 'b', '\uFF43': 'c', '\uFF44': 'd', '\uFF45': 'e',
  '\uFF46': 'f', '\uFF47': 'g', '\uFF48': 'h', '\uFF49': 'i', '\uFF4A': 'j',
  '\uFF4B': 'k', '\uFF4C': 'l', '\uFF4D': 'm', '\uFF4E': 'n', '\uFF4F': 'o',
  '\uFF50': 'p', '\uFF51': 'q', '\uFF52': 'r', '\uFF53': 's', '\uFF54': 't',
  '\uFF55': 'u', '\uFF56': 'v', '\uFF57': 'w', '\uFF58': 'x', '\uFF59': 'y', '\uFF5A': 'z'
};

// ─── Load blocked words ──────────────────────────────────────────────────

function loadBlockedWords() {
  try {
    const raw = fs.readFileSync(BLOCKED_WORDS_PATH, 'utf8');
    blockedData = JSON.parse(raw);

    exactSet = new Set((blockedData.exact || []).map(w => w.toLowerCase()));
    partialList = (blockedData.partial || []).map(w => w.toLowerCase());

    blockedRegexes = (blockedData.patterns || []).map(p => {
      try { return new RegExp(p, 'gi'); } catch { return null; }
    }).filter(Boolean);

    console.log(`[ChatFilter] Loaded ${exactSet.size} exact, ${partialList.length} partial, ${blockedRegexes.length} pattern rules`);
  } catch (e) {
    console.error('[ChatFilter] Failed to load blocked words:', e.message);
  }
}

function saveBlockedWords() {
  try {
    blockedData.exact = Array.from(exactSet);
    fs.writeFileSync(BLOCKED_WORDS_PATH, JSON.stringify(blockedData, null, 2));
  } catch (e) {
    console.error('[ChatFilter] Failed to save blocked words:', e.message);
  }
}

// ─── Text normalization ──────────────────────────────────────────────────

function normalizeText(text) {
  let normalized = text.toLowerCase();

  // Apply character substitutions
  normalized = normalized.split('').map(c => CHAR_SUBS[c] || c).join('');

  // Remove zero-width characters and combining marks (zalgo)
  normalized = normalized.replace(/[\u0300-\u036f\u0489\u200b-\u200f\u2028-\u202f\uFEFF]/g, '');

  // Collapse repeated characters: fuuuuck → fuck
  normalized = normalized.replace(/(.)\1{2,}/g, '$1$1');

  // Remove spaces between single characters: f u c k → fuck
  normalized = normalized.replace(/\b(\w)\s+(?=\w\b)/g, '$1');

  return normalized;
}

// ─── Word filtering ──────────────────────────────────────────────────────

function containsBlockedWord(text) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/);

  // Check exact matches (word-level)
  for (const word of words) {
    const clean = word.replace(/[^a-z]/g, '');
    if (clean && exactSet.has(clean)) return true;
  }

  // Check partial matches (substring)
  for (const partial of partialList) {
    if (normalized.includes(partial)) return true;
  }

  // Check regex patterns (handles elongated words)
  for (const regex of blockedRegexes) {
    regex.lastIndex = 0;
    if (regex.test(normalized)) return true;
  }

  return false;
}

function censorText(text) {
  let result = text;
  const normalized = normalizeText(text);

  // Replace exact words
  result = result.replace(/\b\w+\b/g, (match) => {
    const clean = match.toLowerCase().replace(/[^a-z]/g, '');
    const normClean = normalizeText(match).replace(/[^a-z]/g, '');
    if (exactSet.has(clean) || exactSet.has(normClean)) {
      return '*'.repeat(match.length);
    }
    return match;
  });

  // Replace pattern matches
  for (const regex of blockedRegexes) {
    regex.lastIndex = 0;
    result = result.replace(regex, (match) => '*'.repeat(match.length));
  }

  return result;
}

// ─── Link filtering ──────────────────────────────────────────────────────

function stripLinks(text, isModerator) {
  if (isModerator) return text;
  return text.replace(/https?:\/\/\S+/gi, '[link removed]')
             .replace(/www\.\S+/gi, '[link removed]');
}

// ─── Caps normalization ──────────────────────────────────────────────────

function normalizeCaps(text) {
  if (text.length <= 5) return text;
  const upper = (text.match(/[A-Z]/g) || []).length;
  const alpha = (text.match(/[a-zA-Z]/g) || []).length;
  if (alpha > 0 && upper / alpha > 0.7) {
    return text.toLowerCase();
  }
  return text;
}

// ─── Spam prevention ─────────────────────────────────────────────────────

function checkSpam(userId, text) {
  const now = Date.now();

  // Check flood cooldown
  const cooldownUntil = floodCooldowns.get(userId);
  if (cooldownUntil && now < cooldownUntil) {
    const remaining = Math.ceil((cooldownUntil - now) / 1000);
    return { blocked: true, reason: `Slow down! Try again in ${remaining}s` };
  }

  // Slow mode check
  if (slowMode) {
    const last = lastMessageTime.get(userId);
    if (last && now - last < SLOW_MODE_COOLDOWN) {
      const remaining = Math.ceil((SLOW_MODE_COOLDOWN - (now - last)) / 1000);
      return { blocked: true, reason: `Slow mode active. Wait ${remaining}s` };
    }
  }

  // Get user's recent messages
  if (!userMessages.has(userId)) userMessages.set(userId, []);
  const history = userMessages.get(userId);

  // Prune old messages (>30s)
  while (history.length > 0 && now - history[0].timestamp > 30000) {
    history.shift();
  }

  // Duplicate detection (same message within 30s)
  const lowerText = text.toLowerCase().trim();
  for (const entry of history) {
    if (entry.text === lowerText) {
      return { blocked: true, reason: 'Duplicate message' };
    }
  }

  // Flood protection (>5 messages in 10s)
  const recentCount = history.filter(e => now - e.timestamp < 10000).length;
  if (recentCount >= 5) {
    floodCooldowns.set(userId, now + 30000);
    return { blocked: true, reason: 'Too many messages. Cooldown 30s' };
  }

  // Record this message
  history.push({ text: lowerText, timestamp: now });
  lastMessageTime.set(userId, now);

  return { blocked: false };
}

// ─── Main filter function ────────────────────────────────────────────────

function filterMessage(text, user) {
  const userId = user.id || user.discordId || 'unknown';
  const isModerator = user.badges && user.badges.includes('moderator');

  // Check ban
  if (bannedUsers.has(userId)) {
    return { allowed: false, filtered: '', reason: 'You are banned from chat' };
  }

  // Check mute
  const muteInfo = mutedUsers.get(userId);
  if (muteInfo) {
    if (muteInfo.until && Date.now() > muteInfo.until) {
      mutedUsers.delete(userId);
    } else {
      const remaining = muteInfo.until ? Math.ceil((muteInfo.until - Date.now()) / 1000) : 'permanently';
      return { allowed: false, filtered: '', reason: `You are muted (${remaining}${typeof remaining === 'number' ? 's remaining' : ''})` };
    }
  }

  // Empty/whitespace check
  const trimmed = text.trim();
  if (!trimmed || trimmed.length === 0) {
    return { allowed: false, filtered: '', reason: 'Empty message' };
  }

  // Length check
  if (trimmed.length > 200) {
    return { allowed: false, filtered: '', reason: 'Message too long (max 200 characters)' };
  }

  // Spam check (skip for moderators)
  if (!isModerator) {
    const spamResult = checkSpam(userId, trimmed);
    if (spamResult.blocked) {
      return { allowed: false, filtered: '', reason: spamResult.reason };
    }
  }

  // Strip zalgo
  let filtered = trimmed.replace(/[\u0300-\u036f\u0489]/g, '');

  // Normalize caps
  filtered = normalizeCaps(filtered);

  // Strip links
  filtered = stripLinks(filtered, isModerator);

  // Censor bad words
  filtered = censorText(filtered);

  return { allowed: true, filtered };
}

// ─── User control functions ──────────────────────────────────────────────

function muteUser(userId, durationMs) {
  const until = durationMs ? Date.now() + durationMs : null;
  mutedUsers.set(userId, { until });
  return { ok: true, userId, until };
}

function unmuteUser(userId) {
  mutedUsers.delete(userId);
  return { ok: true, userId };
}

function banUser(userId) {
  bannedUsers.add(userId);
  return { ok: true, userId };
}

function unbanUser(userId) {
  bannedUsers.delete(userId);
  return { ok: true, userId };
}

function isBanned(userId) {
  return bannedUsers.has(userId);
}

function isMuted(userId) {
  const info = mutedUsers.get(userId);
  if (!info) return false;
  if (info.until && Date.now() > info.until) {
    mutedUsers.delete(userId);
    return false;
  }
  return true;
}

function setSlowMode(enabled) {
  slowMode = enabled;
  return { ok: true, slowMode };
}

function isSlowMode() {
  return slowMode;
}

function addBlockedWord(word) {
  exactSet.add(word.toLowerCase());
  saveBlockedWords();
  return { ok: true, word };
}

function removeBlockedWord(word) {
  exactSet.delete(word.toLowerCase());
  saveBlockedWords();
  return { ok: true, word };
}

function getBlockedWords() {
  return Array.from(exactSet);
}

// ─── Init ────────────────────────────────────────────────────────────────

loadBlockedWords();

// Periodic cleanup of stale tracking data (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  // Purge flood cooldowns that have expired
  for (const [id, until] of floodCooldowns) {
    if (now > until) floodCooldowns.delete(id);
  }
  // Purge lastMessageTime entries older than 1 hour
  for (const [id, ts] of lastMessageTime) {
    if (now - ts > 3600_000) lastMessageTime.delete(id);
  }
  // Purge userMessages entries with no recent activity (> 1 hour)
  for (const [id, msgs] of userMessages) {
    if (msgs.length === 0 || now - msgs[msgs.length - 1].timestamp > 3600_000) {
      userMessages.delete(id);
    }
  }
  // Purge expired temp mutes
  for (const [id, mute] of mutedUsers) {
    if (mute.until && now > mute.until) mutedUsers.delete(id);
  }
}, 5 * 60_000);

module.exports = {
  filterMessage,
  containsBlockedWord,
  normalizeText,
  muteUser,
  unmuteUser,
  banUser,
  unbanUser,
  isBanned,
  isMuted,
  setSlowMode,
  isSlowMode,
  addBlockedWord,
  removeBlockedWord,
  getBlockedWords,
  reload: loadBlockedWords
};
