const { Client, GatewayIntentBits, Events, REST, Routes, SlashCommandBuilder } = require('discord.js');
const relay = require('./relay');

let client = null;
let channelId = null;
let channel = null;

// ─── Slash Command Definitions ─────────────────────────────────────────
const slashCommands = [
  new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show available Relay Broadcast commands'),
];

async function registerSlashCommands(token) {
  const rest = new REST({ version: '10' }).setToken(token);
  try {
    console.log('[Discord] Registering slash commands...');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: slashCommands.map(c => c.toJSON()) }
    );
    console.log('[Discord] Slash commands registered successfully');
  } catch (err) {
    console.error('[Discord] Failed to register slash commands:', err.message);
  }
}

async function initialize(token, chId) {
  channelId = chId;

  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.GuildMembers
    ]
  });

  client.on(Events.ClientReady, async () => {
    console.log(`[Discord] Bot logged in as ${client.user.tag}`);

    // Register slash commands globally
    await registerSlashCommands(token);

    // Print invite link if bot has no guilds
    if (client.guilds.cache.size === 0) {
      const inviteUrl = `https://discord.com/oauth2/authorize?client_id=${client.user.id}&permissions=274877975552&scope=bot%20applications.commands`;
      console.log(`[Discord] Bot is not in any servers!`);
      console.log(`[Discord] Invite link: ${inviteUrl}`);
    }

    // Try to find the channel
    channel = client.channels.cache.get(channelId);
    if (!channel) {
      try {
        channel = await client.channels.fetch(channelId);
        console.log(`[Discord] Watching channel: #${channel.name}`);
      } catch (err) {
        console.log(`[Discord] Channel ${channelId} not accessible yet. Bot may need to be invited to the server.`);
      }
    } else {
      console.log(`[Discord] Watching channel: #${channel.name}`);
    }
    relay.broadcastStatus('discord', true);
  });

  // ─── Slash Command Handler ─────────────────────────────────────────
  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName } = interaction;

    try {
      if (commandName === 'help') {
        await handleSlashHelp(interaction);
      }
    } catch (err) {
      console.error(`[Discord] Slash command /${commandName} error:`, err.message);
      const reply = interaction.replied || interaction.deferred
        ? interaction.followUp.bind(interaction)
        : interaction.reply.bind(interaction);
      await reply({ content: 'Something went wrong. Please try again.', ephemeral: true });
    }
  });

  // Retry channel fetch when bot joins a guild
  client.on(Events.GuildCreate, async (guild) => {
    console.log(`[Discord] Joined guild: ${guild.name}`);
    if (!channel) {
      try {
        channel = await client.channels.fetch(channelId);
        console.log(`[Discord] Now watching channel: #${channel.name}`);
      } catch (err) {
        console.log(`[Discord] Channel ${channelId} not found in ${guild.name}`);
      }
    }
  });

  client.on(Events.MessageCreate, (message) => {
    // Only process messages from the watched channel
    if (message.channel.id !== channelId) return;

    // Allow LiveWords mobile app webhook messages (username starts with "LiveWords | ")
    if (message.webhookId && message.author.username.startsWith('LiveWords | ')) {
      handleMobileWebhookMessage(message);
      return;
    }

    // Ignore other bot/webhook messages
    if (message.author.bot) return;

    handleDiscordMessage(message);
  });

  client.on(Events.Error, (err) => {
    console.error('[Discord] Error:', err.message);
  });

  // discord.js v14: 'disconnect' event doesn't fire — use ShardDisconnect instead
  client.on(Events.ShardDisconnect, (event, shardId) => {
    console.log(`[Discord] Shard ${shardId} disconnected (code: ${event.code})`);
    relay.broadcastStatus('discord', false);
  });

  client.on(Events.ShardReconnecting, (shardId) => {
    console.log(`[Discord] Shard ${shardId} reconnecting...`);
  });

  client.on(Events.ShardResume, (shardId) => {
    console.log(`[Discord] Shard ${shardId} resumed`);
    relay.broadcastStatus('discord', true);
  });

  try {
    await client.login(token);
  } catch (err) {
    console.error('[Discord] Login failed:', err.message);
    relay.broadcastStatus('discord', false);
  }

  relay.setDiscordBot({ sendToChannel, getClient: () => client });
}

function handleMobileWebhookMessage(message) {
  const displayName = message.author.username.replace('LiveWords | ', '');
  const username = displayName.toLowerCase().replace(/[^a-z0-9_]/g, '');

  relay.handleMessage({
    platform: 'mobile',
    user: {
      id: `mobile_${username}`,
      username: username,
      displayName: displayName,
      profilePic: null,
      isFollowing: true,
      badges: []
    },
    message: message.content
  });
}

function handleDiscordMessage(message) {
  const member = message.member;
  const roles = member ? member.roles.cache.map(r => r.name.toLowerCase()) : [];

  // Check if Discord user has admin/moderator permissions
  const isMod = member && (
    member.permissions.has('Administrator') ||
    member.permissions.has('ManageMessages') ||
    member.permissions.has('ModerateMembers') ||
    roles.some(r => r.includes('mod') || r.includes('admin'))
  );

  relay.handleMessage({
    platform: 'discord',
    user: {
      id: message.author.id,
      username: message.author.username,
      displayName: member?.displayName || message.author.displayName || message.author.username,
      profilePic: message.author.displayAvatarURL({ size: 64 }),
      isFollowing: true, // Discord users in channel are considered "following"
      isModerator: !!isMod,
      badges: roles.length > 0 ? ['discord-member'] : []
    },
    message: message.content
  });
}

// ─── Slash Command Handlers ──────────────────────────────────────────

async function handleSlashHelp(interaction) {
  const helpText = [
    '**Relay Broadcast Commands:**',
    '',
    '**Chat Commands (TikTok/YouTube/Discord):**',
    '`/v <voice>` — Set TTS voice',
    '`/voices` — List available voices',
    '`/tts` — Toggle your TTS on/off',
    '`/color <hex>` — Set your name color',
    '`/nick <name>` — Set display name',
    '`/help` — Show this help',
    '',
    '*Account linking is managed by the Word Tycoon bot. Use its `/link` and `/unlink` commands in Discord.*',
  ].join('\n');

  await interaction.reply({ content: helpText, ephemeral: true });
}

async function sendToChannel(text) {
  if (!channel) {
    console.error('[Discord] No channel available to send message');
    return;
  }
  try {
    await channel.send(text);
  } catch (err) {
    console.error('[Discord] Send failed:', err.message);
  }
}

function isConnected() {
  return client && client.isReady();
}

function getClient() {
  return client;
}

module.exports = { initialize, sendToChannel, isConnected, getClient };
