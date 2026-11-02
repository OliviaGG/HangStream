require('dotenv').config();

const config = {
  DISCORD_TOKEN: process.env.DISCORD_TOKEN,
  DISCORD_CLIENT_ID: process.env.DISCORD_CLIENT_ID,
  DISCORD_GUILD_ID: process.env.DISCORD_GUILD_ID,
  GAME_CHANNEL_ID: process.env.GAME_CHANNEL_ID,
  ANNOUNCEMENTS_CHANNEL_ID: process.env.ANNOUNCEMENTS_CHANNEL_ID || null,
  CHAT_RELAY_URL: process.env.CHAT_RELAY_URL || 'http://localhost:3000',
  GAME_SERVER_URL: process.env.GAME_SERVER_URL || 'http://localhost:3020',
  HANGSTREAM_API_SECRET: process.env.HANGSTREAM_API_SECRET || process.env.GAME_API_SECRET,
  GAME_API_SECRET: process.env.GAME_API_SECRET,
  TRIANGLED_ADMIN_SECRET: process.env.TRIANGLED_ADMIN_SECRET,
  TRIANGLED_URL: process.env.TRIANGLED_URL || 'http://localhost:3024',
  DISCORD_INVITE_URL: process.env.DISCORD_INVITE_URL || null,
  // Set to true if you've enabled "Server Members Intent" in Discord Developer Portal
  ENABLE_GUILD_MEMBERS_INTENT: process.env.ENABLE_GUILD_MEMBERS_INTENT === 'true',
};

// Validate required fields
const required = ['DISCORD_TOKEN', 'DISCORD_CLIENT_ID', 'GAME_CHANNEL_ID'];
for (const key of required) {
  if (!config[key]) {
    console.error(`[Config] Missing required env var: ${key}`);
    console.error('[Config] Copy .env.example to .env and fill in the values');
    process.exit(1);
  }
}

module.exports = config;
