const { io: ioClient } = require('socket.io-client');
const { AttachmentBuilder } = require('discord.js');
const config = require('./config');

let socket = null;
let discordClient = null;
let canvasUtils = null;

// Pending command responses: Map<displayName, { resolve, timer }>
const pendingResponses = new Map();

const RESPONSE_TIMEOUT_MS = 5000;

function initialize(client) {
  discordClient = client;
  const url = config.GAME_SERVER_URL;
  console.log(`[Game] Connecting to Game Server at ${url}...`);

  socket = ioClient(url, {
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionDelayMax: 10000,
    reconnectionAttempts: Infinity
  });

  socket.on('connect', () => {
    console.log('[Game] Connected to Game Server');
  });

  socket.on('disconnect', (reason) => {
    console.log(`[Game] Disconnected: ${reason}`);
  });

  socket.on('connect_error', (err) => {
    console.log(`[Game] Connection error: ${err.message}`);
  });

  // Lazy-load canvas utils (avoids circular dependencies)
  canvasUtils = require('./utils/canvas');

  // Listen for command responses from the game server
  socket.on('command-response', handleCommandResponse);

  // Listen for ticker events (purchases, level-ups, etc.)
  socket.on('ticker-event', handleTickerEvent);

  // Listen for account-linked events (from !verify command)
  socket.on('account-linked', handleAccountLinked);

  // Listen for Discord invite requests (from !discord command in TikTok/YouTube)
  socket.on('discord-invite-request', handleDiscordInviteRequest);

  return socket;
}

/**
 * Route command responses back to the Discord user who sent the command.
 */
function handleCommandResponse(data) {
  if (!data || !data.user) return;

  // Prefer userId for matching (unique), fall back to displayName for backwards compat
  const key = data.userId || data.user;
  const pending = pendingResponses.get(key);
  if (pending) {
    clearTimeout(pending.timer);
    pendingResponses.delete(key);
    pending.resolve({
      ok: data.ok !== false,
      message: data.response || '',
      command: data.command || '',
      itemData: data.itemData || null,
      itemsData: data.itemsData || null,
      setStatus: data.setStatus || null
    });
  }
}

/**
 * Forward ticker events to the announcements channel.
 */
async function handleTickerEvent(event) {
  if (!discordClient || !config.ANNOUNCEMENTS_CHANNEL_ID) return;

  const channel = discordClient.channels.cache.get(config.ANNOUNCEMENTS_CHANNEL_ID);
  if (!channel) return;

  const { buildTickerEmbed } = require('./utils/embeds');
  const embed = buildTickerEmbed(event);
  if (!embed) return;

  try {
    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.error('[Game] Failed to send ticker event:', err.message);
  }
}

/**
 * Handle account-linked events — notify the Discord user and game channel.
 */
async function handleAccountLinked(data) {
  if (!discordClient || !data) return;

  const { discordUserId, platform, platformUsername } = data;
  if (!discordUserId) return;

  console.log(`[Game] Account linked: Discord ${discordUserId} ↔ ${platform} ${platformUsername}`);

  try {
    // Generate success card image
    const img = canvasUtils.generateLinkSuccessCard(
      platformUsername || 'Player',
      platform || 'unknown',
      platformUsername || 'unknown'
    );
    const attachment = new AttachmentBuilder(img, { name: 'linked.png' });

    // DM the Discord user
    try {
      const user = await discordClient.users.fetch(discordUserId);
      if (user) {
        await user.send({
          content: '🎉 Your livestream account has been linked to Discord!',
          files: [attachment]
        });
      }
    } catch (dmErr) {
      console.log(`[Game] Could not DM user ${discordUserId} (DMs may be disabled)`);
    }

    // Post announcement in game channel
    if (config.GAME_CHANNEL_ID) {
      const channel = discordClient.channels.cache.get(config.GAME_CHANNEL_ID);
      if (channel) {
        const platformLabel = (platform || 'unknown').charAt(0).toUpperCase() + (platform || 'unknown').slice(1);
        // Re-create attachment since Discord consumes it on first use
        const channelAttachment = new AttachmentBuilder(img, { name: 'linked.png' });
        await channel.send({
          content: `🔗 **${platformUsername}** linked their ${platformLabel} account to Discord!`,
          files: [channelAttachment]
        });
      }
    }
    // Sync link to Relay Broadcast database
    try {
      const relayUrl = config.CHAT_RELAY_URL;
      await fetch(`${relayUrl}/api/link/sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': config.GAME_API_SECRET
        },
        body: JSON.stringify({
          discordUserId,
          platform,
          platformUserId: platformUsername
        })
      });
      console.log(`[Game] Link synced to Relay Broadcast: ${platform} ${platformUsername}`);
    } catch (syncErr) {
      console.log('[Game] Link sync to Relay Broadcast failed:', syncErr.message);
    }
  } catch (err) {
    console.error('[Game] Failed to handle account-linked event:', err.message);
  }
}

/**
 * Handle Discord invite requests — search guild for the user and DM them an invite.
 * Triggered when a TikTok/YouTube viewer types !discord [username] in chat.
 */
async function handleDiscordInviteRequest(data) {
  if (!discordClient || !data) return;

  const { discordUsername, platform, platformUsername } = data;
  if (!discordUsername) return;

  console.log(`[Game] Discord invite request: ${platformUsername} (${platform}) → Discord user "${discordUsername}"`);

  const inviteUrl = config.DISCORD_INVITE_URL;

  try {
    // Find the guild (first guild the bot is in)
    const guild = discordClient.guilds.cache.first();
    if (!guild) {
      console.log('[Game] No guild found — cannot search for members');
      return;
    }

    // Search for the Discord member by username
    // Note: Requires Server Members Intent (GuildMembers) to be enabled
    let match = null;
    try {
      const members = await guild.members.fetch({ query: discordUsername, limit: 5 });
      match = members.find(m =>
        m.user.username.toLowerCase() === discordUsername.toLowerCase() ||
        m.displayName.toLowerCase() === discordUsername.toLowerCase()
      );
    } catch (fetchErr) {
      console.log(`[Game] Cannot search members (Server Members Intent may not be enabled): ${fetchErr.message}`);
      return;
    }

    if (!match) {
      console.log(`[Game] Could not find Discord user "${discordUsername}" in server`);
      return;
    }

    // DM the Discord user with welcome message + invite
    const platformLabel = (platform || 'unknown').charAt(0).toUpperCase() + (platform || 'unknown').slice(1);
    const parts = [
      `**${platformUsername}** from ${platformLabel} wants you to play Word Tycoon!`,
      '',
      'Use `/play` in the game channel to get started, then `/link` to connect your accounts.',
      'Your stats will sync across all platforms!'
    ];

    if (inviteUrl) {
      parts.push('', `**Join the server:** ${inviteUrl}`);
    }

    try {
      await match.user.send(parts.join('\n'));
      console.log(`[Game] Sent Discord invite DM to ${match.user.username}`);
    } catch (dmErr) {
      console.log(`[Game] Could not DM ${match.user.username} (DMs may be disabled)`);
    }
  } catch (err) {
    console.error('[Game] Failed to handle discord-invite-request:', err.message);
  }
}

/**
 * Wait for a command response from the game server.
 * Uses discord_userId as key to match the userId sent in command-response events.
 * Falls back to displayName for backwards compatibility.
 */
function waitForResponse(displayName, userId) {
  const key = userId ? `discord_${userId}` : displayName;
  return new Promise((resolve) => {
    // Clear any existing pending response for this user
    const existing = pendingResponses.get(key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.resolve({ ok: false, message: 'Superseded by new command' });
    }

    const timer = setTimeout(() => {
      pendingResponses.delete(key);
      resolve({ ok: false, message: 'Command timed out — game server may be busy.' });
    }, RESPONSE_TIMEOUT_MS);

    pendingResponses.set(key, { resolve, timer });
  });
}

function isConnected() {
  return socket && socket.connected;
}

function disconnect() {
  // Clear all pending responses
  for (const [key, pending] of pendingResponses) {
    clearTimeout(pending.timer);
    pending.resolve({ ok: false, message: 'Bot shutting down' });
  }
  pendingResponses.clear();

  if (socket) {
    socket.disconnect();
  }
}

module.exports = { initialize, waitForResponse, isConnected, disconnect };
