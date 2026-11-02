const { Client, GatewayIntentBits, Partials, REST, Routes } = require('discord.js');
const http = require('http');
const config = require('./config');
const relayClient = require('./relay-client');
const gameClient = require('./game-client');
const { SLASH_COMMANDS, GAME_COMMANDS } = require('./commands/definitions');
const { handlePrefixCommand, handleSlashCommand, handleDMMessage } = require('./commands/handler');

// Build intents list — GuildMembers is privileged and only needed for !discord invite search
const intents = [
  GatewayIntentBits.Guilds,
  GatewayIntentBits.GuildMessages,
  GatewayIntentBits.MessageContent,    // Privileged — enable in Discord Developer Portal
  GatewayIntentBits.DirectMessages,
];

// Only request GuildMembers if explicitly enabled (avoids crash if not toggled in portal)
if (config.ENABLE_GUILD_MEMBERS_INTENT) {
  intents.push(GatewayIntentBits.GuildMembers);
}

const client = new Client({
  intents,
  partials: [Partials.Channel, Partials.Message]
});

// REST diagnostics — surfaces rate limits and slow/aborted Discord API calls
// (added 2026-07-29 while chasing /link replies that hung for ~60s).
client.rest.on('rateLimited', (info) => {
  console.warn(`[REST] rateLimited: route=${info.route} timeToReset=${info.timeToReset}ms global=${info.global} limit=${info.limit}`);
});
client.rest.on('response', (req, res) => {
  if (res && res.status === 429) console.warn(`[REST] 429 on ${req.method} ${req.path}`);
});

// ─── Bot Ready ───────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`[Bot] Logged in as ${client.user.tag}`);
  console.log(`[Bot] Guilds: ${client.guilds.cache.map(g => `${g.name} (${g.id})`).join(', ')}`);

  // Verify game channel access
  const gameChannel = client.channels.cache.get(config.GAME_CHANNEL_ID);
  if (gameChannel) {
    console.log(`[Bot] Game channel: #${gameChannel.name} (${config.GAME_CHANNEL_ID})`);
    const perms = gameChannel.permissionsFor(client.user);
    if (perms) {
      const needed = ['ViewChannel', 'SendMessages', 'AttachFiles', 'ReadMessageHistory', 'EmbedLinks'];
      const missing = needed.filter(p => !perms.has(p));
      if (missing.length > 0) {
        console.warn(`[Bot] WARNING: Missing permissions in game channel: ${missing.join(', ')}`);
      } else {
        console.log(`[Bot] Game channel permissions: OK`);
      }
    }
  } else {
    console.warn(`[Bot] WARNING: Cannot find game channel ${config.GAME_CHANNEL_ID} — bot may not be in the right server`);
  }

  if (config.ANNOUNCEMENTS_CHANNEL_ID) {
    console.log(`[Bot] Announcements channel: ${config.ANNOUNCEMENTS_CHANNEL_ID}`);
  }

  // Register slash commands
  await registerSlashCommands();
});

// ─── Prefix Commands (!) ─────────────────────────────────
client.on('messageCreate', async (message) => {
  // Ignore bots
  if (message.author.bot) return;

  // Only handle messages starting with !
  const text = message.content.trim();
  if (!text.startsWith('!')) return;

  console.log(`[Bot] Prefix: "${text}" from ${message.author.username} in ${message.guild ? '#' + message.channel.name : 'DM'}`);

  try {
    // Route DMs to the DM handler for private conversations
    if (!message.guild) {
      await handleDMMessage(message);
      return;
    }
    await handlePrefixCommand(message);
  } catch (err) {
    console.error('[Bot] Prefix command error:', err);
  }
});

// ─── Slash Commands ──────────────────────────────────────
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  console.log(`[Bot] Slash: /${interaction.commandName} from ${interaction.user.username}`);

  try {
    await handleSlashCommand(interaction);
  } catch (err) {
    console.error('[Bot] Slash command error:', err);
    const reply = { content: 'Something went wrong. Try again.', ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(reply).catch(() => {});
    } else {
      await interaction.reply(reply).catch(() => {});
    }
  }
});

// ─── Register Slash Commands ─────────────────────────────
async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(config.DISCORD_TOKEN);

  try {
    console.log('[Bot] Registering slash commands...');

    if (config.DISCORD_GUILD_ID) {
      // Guild-scoped (instant, good for development)
      await rest.put(
        Routes.applicationGuildCommands(config.DISCORD_CLIENT_ID, config.DISCORD_GUILD_ID),
        { body: SLASH_COMMANDS }
      );
      console.log(`[Bot] Registered ${SLASH_COMMANDS.length} guild slash commands`);
    } else {
      // Global (takes up to 1 hour to propagate)
      await rest.put(
        Routes.applicationCommands(config.DISCORD_CLIENT_ID),
        { body: SLASH_COMMANDS }
      );
      console.log(`[Bot] Registered ${SLASH_COMMANDS.length} global slash commands`);
    }
  } catch (err) {
    console.error('[Bot] Failed to register slash commands:', err);
  }
}

const { createLoginRecovery } = require('./login-recovery');
const loginRecovery = createLoginRecovery({
  login: () => client.login(config.DISCORD_TOKEN),
  onRetry: () => console.warn('[Bot] Discord temporarily unavailable; login retry scheduled'),
  onFatal: () => { console.error('[Bot] Discord login configuration requires attention'); loginRecovery.stop(); process.exit(1); }
});

// ─── Health Endpoint (for app manager) ───────────────────
const HEALTH_PORT = parseInt(process.env.PORT) || 3026;
http.createServer((req, res) => {
  const status = {
    bot: client.isReady() ? 'online' : 'offline',
    loginRecovery: loginRecovery.summary(),
    relay: relayClient.isConnected(),
    game: gameClient.isConnected(),
    uptime: Math.floor(process.uptime())
  };
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(status));
}).listen(HEALTH_PORT, () => {
  console.log(`[Bot] Health endpoint on port ${HEALTH_PORT}`);
});

// ─── Initialize Connections ──────────────────────────────
async function start() {
  console.log('========================================');
  console.log('  Word Tycoon — Discord Bot');
  console.log('========================================');

  // Connect to Chat Relay (for sending commands)
  relayClient.initialize();

  // Connect to Game Server (for receiving responses & events)
  gameClient.initialize(client);

  // Log in to Discord
  try {
    await loginRecovery.start();
  } catch (err) {
    if (err.message && err.message.includes('disallowed intents')) {
      console.error('');
      console.error('╔══════════════════════════════════════════════════════════════╗');
      console.error('║  DISALLOWED INTENTS — Enable these in Discord Developer     ║');
      console.error('║  Portal → Bot → Privileged Gateway Intents:                 ║');
      console.error('║                                                              ║');
      console.error('║  ✓ MESSAGE CONTENT INTENT  (required for !commands)          ║');
      console.error('║  ○ SERVER MEMBERS INTENT   (optional, for !discord invite)   ║');
      console.error('║                                                              ║');
      console.error('║  https://discord.com/developers/applications                 ║');
      console.error('╚══════════════════════════════════════════════════════════════╝');
      console.error('');
    } else if (err.message && (err.message.includes('TOKEN_INVALID') || err.message.includes('invalid token'))) {
      console.error('');
      console.error('[Bot] Invalid Discord token. Check DISCORD_TOKEN in .env');
      console.error('');
    } else {
      console.error('[Bot] Failed to login:', err.message);
    }
    process.exit(1);
  }
}

// ─── Graceful Shutdown ───────────────────────────────────
function shutdown() {
  console.log('\n[Bot] Shutting down...');
  loginRecovery.stop();
  relayClient.disconnect();
  gameClient.disconnect();
  client.destroy();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start();
