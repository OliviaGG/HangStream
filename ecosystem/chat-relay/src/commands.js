const fetch = require('./service-fetch').serviceFetch;
const db = require('./database');
const spotifyRequests = require('./spotify-requests');
const { v4: uuidv4 } = require('uuid');

// Commands use / prefix, abbreviated for convenience
// Admin user IDs — comma-separated "platform:userId" pairs in .env, e.g.
// ADMIN_USER_IDS=discord:123456789,tiktok:draybaebae
const ADMIN_IDS = (process.env.ADMIN_USER_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const COMMANDS = {
  // TTS commands
  '/v': { handler: setVoice, desc: 'Set TTS voice', usage: '/v [voice]' },
  '/voices': { handler: listVoices, desc: 'List voices', usage: '/voices' },
  '/tts': { handler: toggleTTS, desc: 'Toggle your TTS', usage: '/tts' },
  '/vol': { handler: setVolume, desc: 'Set TTS volume (admin)', usage: '/vol [1-100]', admin: true },

  // Perks — monthly hint allowance for Donors (20) and TikTok Super Fans (30)
  '/hint': { handler: useHint, desc: 'Reveal a Subtextle letter (Donor/Super Fan perk)', usage: '/hint' },

  // Account linking. '!verify' is handled HERE (not in Word Tycoon) so it
  // works from ANY streamer's chat — messages from non-Tycoon streams are
  // room-routed and never reach WT's own !-command handler.
  '/link': { handler: linkAccount, desc: 'Link to Discord', usage: '/link' },
  '/verify': { handler: verifyAccount, desc: 'Verify Discord link', usage: '/verify [code]' },
  '!verify': { handler: verifyAccount, desc: 'Verify Discord link', usage: '!verify [code]' },
  '/unlink': { handler: unlinkAccount, desc: 'Remove account link', usage: '/unlink' },

  // TikTok music requests for the owner's render1 Spotify receiver.
  '!play': { handler: playSong, desc: 'Request a Spotify song', usage: '!play Song - Artist' },
  '!revoke': { handler: revokeSong, desc: 'Remove your latest pending song request', usage: '!revoke' },
  '!skip': { handler: skipSong, desc: 'Skip a non-viewer-requested song', usage: '!skip' },

  // Profile
  '/color': { handler: setColor, desc: 'Set name color', usage: '/color [hex]' },
  '/nick': { handler: setNick, desc: 'Set display name', usage: '/nick [name]' },

  // Admin
  '/bantts': { handler: banTTS, desc: 'Ban user from TTS (admin)', usage: '/bantts [username]', admin: true },
  '/unbantts': { handler: unbanTTS, desc: 'Unban user TTS (admin)', usage: '/unbantts [username]', admin: true },
  '/tts-on': { handler: adminEnableTTS, desc: 'Enable TTS for user (admin)', usage: '/tts-on [username]', admin: true },
  '/tts-off': { handler: adminDisableTTS, desc: 'Disable TTS for user (admin)', usage: '/tts-off [username]', admin: true },

  // Info
  '/help': { handler: showHelp, desc: 'Show all commands', usage: '/help' },
  '/cmds': { handler: showHelp, desc: 'Show all commands', usage: '/cmds' },
};

function isCommand(message) {
  if (!message || typeof message !== 'string') return false;
  const trimmed = message.trim();
  const cmd = trimmed.split(' ')[0].toLowerCase();
  // '/'-prefixed relay commands, plus explicitly registered relay-side '!'
  // commands. Other '!' commands (WT economy etc.) still pass to games.
  if (trimmed.startsWith('/')) return !!COMMANDS[cmd];
  return !!COMMANDS[cmd];
}

/**
 * Check if a message sender has admin/moderator privileges.
 * Admins: moderators (TikTok/DB flag), Discord admins/mods, or ADMIN_USER_IDS env list.
 */
function isAdmin(msg) {
  // Check badges (set by relay.js from DB is_moderator field)
  if (msg.user && msg.user.badges && msg.user.badges.indexOf('moderator') !== -1) {
    return true;
  }
  // Check env-configured admin IDs (format: "platform:userId")
  const key = `${msg.platform}:${msg.user.id}`;
  if (ADMIN_IDS.indexOf(key) !== -1) {
    return true;
  }
  return false;
}

async function handleCommand(msg, ctx) {
  const parts = msg.message.trim().split(' ');
  const cmd = parts[0].toLowerCase();
  const args = parts.slice(1);
  const entry = COMMANDS[cmd];

  if (!entry) return null;

  // Admin permission gate
  if (entry.admin && !isAdmin(msg)) {
    return { response: `${msg.user.displayName}: You don't have permission to use ${cmd}. (Admin only)`, suppress: true };
  }

  return entry.handler(msg, args, ctx);
}

function setVoice(msg, args, ctx) {
  if (args.length === 0) {
    return { response: `Usage: /v [voice name]. Use /voices to see available voices.`, suppress: true };
  }
  const voice = args.join(' ');
  db.getOrCreateUser(msg.platform, msg.user.id, {
    username: msg.user.username,
    display_name: msg.user.displayName
  });
  db.setUserVoice(msg.platform, msg.user.id, voice);
  const relay = require('./relay');
  relay.broadcastTTSUpdate();
  return { response: `${msg.user.displayName}: TTS voice set to "${voice}"`, suppress: true };
}

function listVoices(msg, args, ctx) {
  // Voices are browser-side (Web Speech API), so we tell the user to check the dashboard
  return {
    response: `Available voices are shown on the TTS panel in the dashboard. Voice names vary by browser. Common ones: Google US English, Google UK English, Microsoft David, Microsoft Zira, Microsoft Mark`,
    suppress: true
  };
}

function toggleTTS(msg, args, ctx) {
  const user = db.getOrCreateUser(msg.platform, msg.user.id, {
    username: msg.user.username,
    display_name: msg.user.displayName
  });

  if (user.tts_banned) {
    return { response: `${msg.user.displayName}: Your TTS has been banned.`, suppress: true };
  }
  if (!user.is_following) {
    return { response: `${msg.user.displayName}: TTS is only available for followers.`, suppress: true };
  }

  const newState = !user.tts_enabled;
  db.enableTTS(msg.platform, msg.user.id, newState);
  const relay = require('./relay');
  relay.broadcastTTSUpdate();
  return {
    response: `${msg.user.displayName}: TTS ${newState ? 'enabled' : 'disabled'}.`,
    suppress: true
  };
}

function setVolume(msg, args, ctx) {
  if (args.length === 0) {
    return { response: `Usage: /vol [1-100]`, suppress: true };
  }
  const vol = parseInt(args[0]);
  if (isNaN(vol) || vol < 1 || vol > 100) {
    return { response: `Volume must be between 1-100.`, suppress: true };
  }
  db.setTTSSetting('volume', String(vol / 100));
  const relay = require('./relay');
  relay.broadcastTTSUpdate();
  return { response: `TTS volume set to ${vol}%.`, suppress: true };
}

// Monthly hint allowance by entitlement source. computePremiumById resolves a
// donor+superfan to 'tiktok' (super fan checked first), so 'source' already
// encodes overlap=max: super fan (30) wins over donor (20). 'admin' = staff.
const HINT_ALLOWANCE = { tiktok: 30, admin: 30, donor: 20 };

function _currentMonthKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

// /hint — a Donor / TikTok Super Fan spends one monthly hint to reveal a letter
// on the streamer's live Subtextle puzzle. A hint is only spent if a letter is
// actually revealed (no active puzzle / already-solved never charge).
async function useHint(msg, args, ctx) {
  const name = msg.user.displayName;
  const accountId = msg.linkedDiscord || msg.user.id;

  // Resolve entitlement tier via the public entitlement endpoint (donor vs super fan).
  let source = null;
  try {
    const base = `http://127.0.0.1:${process.env.PORT || 3000}`;
    const r = await fetch(`${base}/api/public/entitlement?discordId=${encodeURIComponent(accountId)}`);
    if (r.ok) { const d = await r.json(); if (d && d.premium) source = d.source; }
  } catch (_) { /* fail-closed below */ }

  const allowance = HINT_ALLOWANCE[source] || 0;
  if (allowance <= 0) {
    return { response: `${name}: Hints are a Donor (20/mo) and TikTok Super Fan (30/mo) perk. Unlock them at wordtycoon.live/me?tab=pass 🔍`, suppress: true };
  }

  const monthKey = _currentMonthKey();
  const ledger = db.ensureHintGrant(accountId, monthKey, source, allowance);
  const remaining = Math.max(0, (ledger.granted || 0) - (ledger.used || 0));

  const handle = String(msg.streamerHandle || '').toLowerCase().trim();
  if (!handle) {
    return { response: `${name}: You have ${remaining} hint${remaining === 1 ? '' : 's'} left this month. Use /hint during a live Subtextle puzzle to reveal a letter.`, suppress: true };
  }
  if (remaining <= 0) {
    return { response: `${name}: You're out of hints this month (0 left) — they reset on the 1st.`, suppress: true };
  }

  // Reveal a letter on the streamer's live Subtextle puzzle.
  let reveal = null;
  try {
    const port = (require('./apps').getApp('subtextle') || require('./apps').getApp('searchle') || {}).config?.port || 3015;
    const resp = await fetch(`http://127.0.0.1:${port}/api/session/hint`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.GAME_API_SECRET,
      },
      body: JSON.stringify({ handle, label: name }),
    });
    reveal = await resp.json();
  } catch (_) {
    return { response: `${name}: Couldn't reach Subtextle for a hint right now — try again in a moment. (No hint used, still ${remaining} left.)`, suppress: true };
  }

  if (!reveal || !reveal.ok) {
    const why = reveal && reveal.reason;
    if (why === 'no_session') {
      return { response: `${name}: There's no live Subtextle puzzle right now — no hint used, still ${remaining} left.`, suppress: true };
    }
    if (why === 'fully_revealed' || why === 'nothing_to_reveal') {
      return { response: `${name}: The word's already fully revealed — no hint used, still ${remaining} left.`, suppress: true };
    }
    return { response: `${name}: Couldn't reveal a hint right now — no hint used, still ${remaining} left.`, suppress: true };
  }

  // A letter was revealed — spend one hint.
  const spend = db.spendHint(accountId, monthKey);
  const left = spend.ok ? spend.remaining : Math.max(0, remaining - 1);
  return { response: `${name} spent a hint — revealed a letter! 🔍 (${left} hint${left === 1 ? '' : 's'} left this month)`, suppress: true };
}

function linkAccount(msg, args, ctx) {
  return { response: `To link: use /link in the Word Tycoon Discord to get a code, then type /verify CODE here in chat.`, suppress: true };
}

async function verifyAccount(msg, args, ctx) {
  const name = msg.user.customNick || msg.user.displayName || msg.user.username;
  const code = String(args[0] || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{4,10}$/.test(code)) {
    return { response: `${name}: Usage: /verify [code] — get a code with /link in the Word Tycoon Discord.`, suppress: true };
  }
  const apiKey = process.env.WT_API_SECRET || process.env.GAME_API_SECRET;
  if (!apiKey) {
    return { response: `${name}: Linking is temporarily unavailable — try again later.`, suppress: true };
  }
  try {
    const base = process.env.WT_API_BASE || 'http://127.0.0.1:3020';
    const r = await fetch(`${base}/api/link/verify-code`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({
        code,
        platform: msg.platform,
        platformUserId: String(msg.user.id),
        displayName: name,
      }),
    });
    const data = await r.json();
    if (!data.ok) {
      return { response: `${name}: ${data.message || 'Invalid or expired code. Get a new one with /link in Discord.'}`, suppress: true };
    }
    // Refresh the relay's linked-account cache so voice/cosmetics/superfan
    // perks pick up the new link immediately instead of on the next TTL.
    try { require('./relay').refreshLinkedCache(); } catch (_) {}
    const who = data.discordUsername ? ` to ${data.discordUsername}` : '';
    return { response: `${name}: ✅ Account linked${who}! Your voice, cosmetics and perks now follow you everywhere.`, suppress: true };
  } catch (e) {
    console.error('[Commands] verify failed:', e.message);
    return { response: `${name}: Linking is temporarily unavailable — try again in a minute.`, suppress: true };
  }
}

function unlinkAccount(msg, args, ctx) {
  return { response: `To unlink, use the /unlink command in Discord, or ask an admin.`, suppress: true };
}

function playSong(msg, args) {
  return spotifyRequests.requestSong(msg, args.join(' '));
}

function revokeSong(msg) {
  return spotifyRequests.revokeRequest(msg);
}

function skipSong(msg) {
  return spotifyRequests.skipNonRequest(msg);
}

function setColor(msg, args, ctx) {
  if (args.length === 0) {
    return { response: `Usage: /color [hex code]. Example: /color #FF5500`, suppress: true };
  }
  let color = args[0];
  if (!color.startsWith('#')) color = '#' + color;
  if (!/^#[0-9A-Fa-f]{3,6}$/.test(color)) {
    return { response: `Invalid hex color. Example: /color #FF5500`, suppress: true };
  }
  db.getOrCreateUser(msg.platform, msg.user.id, {
    username: msg.user.username,
    display_name: msg.user.displayName
  });
  db.setUserColor(msg.platform, msg.user.id, color);
  return { response: `${msg.user.displayName}: Name color set to ${color}`, suppress: true };
}

function setNick(msg, args, ctx) {
  if (args.length === 0) {
    return { response: `Usage: /nick [display name]`, suppress: true };
  }
  const nick = args.join(' ').substring(0, 30);
  db.getOrCreateUser(msg.platform, msg.user.id, {
    username: msg.user.username,
    display_name: msg.user.displayName
  });
  db.setUserNick(msg.platform, msg.user.id, nick);
  return { response: `${msg.user.displayName}: Display name changed to "${nick}"`, suppress: true };
}

function banTTS(msg, args, ctx) {
  if (args.length === 0) {
    return { response: `Usage: /bantts [username]`, suppress: true };
  }
  const target = args.join(' ');
  const user = db.findUserAcrossPlatforms(target);
  if (!user) {
    return { response: `User "${target}" not found.`, suppress: true };
  }
  db.banTTS(user.platform, user.platform_user_id, true);
  const relay = require('./relay');
  relay.broadcastTTSUpdate();
  return { response: `TTS banned for ${user.display_name} (${user.platform}).`, suppress: true };
}

function unbanTTS(msg, args, ctx) {
  if (args.length === 0) {
    return { response: `Usage: /unbantts [username]`, suppress: true };
  }
  const target = args.join(' ');
  const user = db.findUserAcrossPlatforms(target);
  if (!user) {
    return { response: `User "${target}" not found.`, suppress: true };
  }
  db.banTTS(user.platform, user.platform_user_id, false);
  const relay = require('./relay');
  relay.broadcastTTSUpdate();
  return { response: `TTS unbanned for ${user.display_name} (${user.platform}).`, suppress: true };
}

function adminEnableTTS(msg, args, ctx) {
  if (args.length === 0) {
    return { response: `Usage: /tts-on [username]`, suppress: true };
  }
  const target = args.join(' ');
  const user = db.findUserAcrossPlatforms(target);
  if (!user) {
    return { response: `User "${target}" not found.`, suppress: true };
  }
  db.enableTTS(user.platform, user.platform_user_id, true);
  const relay = require('./relay');
  relay.broadcastTTSUpdate();
  return { response: `TTS enabled for ${user.display_name} (${user.platform}).`, suppress: true };
}

function adminDisableTTS(msg, args, ctx) {
  if (args.length === 0) {
    return { response: `Usage: /tts-off [username]`, suppress: true };
  }
  const target = args.join(' ');
  const user = db.findUserAcrossPlatforms(target);
  if (!user) {
    return { response: `User "${target}" not found.`, suppress: true };
  }
  db.enableTTS(user.platform, user.platform_user_id, false);
  const relay = require('./relay');
  relay.broadcastTTSUpdate();
  return { response: `TTS disabled for ${user.display_name} (${user.platform}).`, suppress: true };
}

function showHelp(msg, args, ctx) {
  const lines = ['**Relay Broadcast Commands:**'];
  const categories = {
    'TTS': ['/v', '/voices', '/tts', '/vol'],
    'Perks': ['/hint'],
    'Music': ['!play', '!revoke', '!skip'],
    'Account Linking (via Word Tycoon bot)': ['/link', '/verify', '/unlink'],
    'Profile': ['/color', '/nick'],
    'Admin': ['/bantts', '/unbantts', '/tts-on', '/tts-off'],
    'Info': ['/help']
  };

  for (const [cat, cmds] of Object.entries(categories)) {
    lines.push(`\n**${cat}:**`);
    cmds.forEach(cmd => {
      const entry = COMMANDS[cmd];
      if (entry) {
        lines.push(`  ${entry.usage} - ${entry.desc}`);
      }
    });
  }

  return { response: lines.join('\n'), suppress: true };
}

function getCommandList() {
  return Object.entries(COMMANDS).map(([cmd, entry]) => ({
    command: cmd,
    description: entry.desc,
    usage: entry.usage
  }));
}

module.exports = {
  isCommand,
  handleCommand,
  getCommandList,
  COMMANDS,
  HINT_ALLOWANCE,
  currentMonthKey: _currentMonthKey
};
