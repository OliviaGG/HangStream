const { EmbedBuilder } = require('discord.js');

// Colors for different contexts
const COLORS = {
  success: 0x4ade80,
  error: 0xef4444,
  info: 0x38bdf8,
  gold: 0xffd700,
  // Ticker event colors
  buy: 0x4ade80,
  levelup: 0x38bdf8,
  upgrade: 0xa78bfa,
  gift: 0xffd700,
  reward: 0xfb923c
};

// Emojis for ticker events
const TICKER_EMOJIS = {
  buy: '\uD83D\uDED2',
  levelup: '\u2B06\uFE0F',
  upgrade: '\u2B50',
  gift: '\uD83C\uDF81',
  reward: '\uD83C\uDFC6'
};

// Emojis for commands
const CMD_EMOJIS = {
  '!tap': '\uD83D\uDC46',
  '!taps': '\uD83D\uDCCA',
  '!coins': '\uD83E\uDE99',
  '!empire': '\uD83C\uDFD7\uFE0F',
  '!buy': '\uD83D\uDED2',
  '!upgrade': '\u2B50',
  '!combo': '\uD83D\uDD25',
  '!shop': '\uD83D\uDED2',
  '!cosmetics': '\uD83D\uDED2',
  '!buyc': '\uD83C\uDFA8',
  '!equip': '\uD83D\uDC55',
  '!unequip': '\uD83D\uDC55',
  '!mycos': '\uD83C\uDFA8',
  '!sets': '\uD83E\uDDE9',
  '!buyset': '\uD83C\uDF81',
  '!help': '\u2753'
};

/**
 * Build a Discord embed for a game command response.
 */
function buildCommandEmbed(result, command) {
  const emoji = CMD_EMOJIS[command] || '\uD83C\uDFAE';
  const color = result.ok ? COLORS.success : COLORS.error;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(`${emoji} ${result.message || 'Done.'}`)
    .setTimestamp();

  return embed;
}

/**
 * Build a Discord embed for an error message.
 */
function buildErrorEmbed(message) {
  return new EmbedBuilder()
    .setColor(COLORS.error)
    .setDescription(`\u274C ${message}`)
    .setTimestamp();
}

/**
 * Build a Discord embed for the leaderboard.
 */
function buildLeaderboardEmbed(data, limit) {
  const medals = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49'];

  const embed = new EmbedBuilder()
    .setColor(COLORS.gold)
    .setTitle('\uD83C\uDFC6 Word Tycoon Leaderboard')
    .setTimestamp();

  // Top tappers
  if (data.tappers && data.tappers.length > 0) {
    const tapperLines = data.tappers.slice(0, limit).map((p, i) => {
      const medal = medals[i] || `\`${i + 1}.\``;
      const taps = formatNumber(p.total_taps || 0);
      return `${medal} **${p.display_name}** — ${taps} taps`;
    });
    embed.addFields({ name: '\uD83D\uDC46 Top Tappers', value: tapperLines.join('\n') || 'No data', inline: true });
  }

  // Top earners
  if (data.earners && data.earners.length > 0) {
    const earnerLines = data.earners.slice(0, limit).map((p, i) => {
      const medal = medals[i] || `\`${i + 1}.\``;
      const coins = formatNumber(p.coins || 0);
      return `${medal} **${p.display_name}** — ${coins} coins`;
    });
    embed.addFields({ name: '\uD83E\uDE99 Top Earners', value: earnerLines.join('\n') || 'No data', inline: true });
  }

  if ((!data.tappers || data.tappers.length === 0) && (!data.earners || data.earners.length === 0)) {
    embed.setDescription('No player data yet. Start playing with `!tap`!');
  }

  return embed;
}

/**
 * Build a Discord embed for a ticker event (purchase, level-up, etc.).
 */
function buildTickerEmbed(event) {
  if (!event || !event.type) return null;

  const emoji = TICKER_EMOJIS[event.type] || '\uD83C\uDFAE';
  const color = COLORS[event.type] || COLORS.info;
  const detail = event.detail || '';
  const player = event.playerName || 'Someone';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setDescription(`${emoji} **${player}** ${detail}`)
    .setTimestamp(event.timestamp ? new Date(event.timestamp) : new Date());

  return embed;
}

/**
 * Format large numbers with K, M, B, T suffixes.
 */
function formatNumber(num) {
  if (num >= 1e12) return (num / 1e12).toFixed(1) + 'T';
  if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
  if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
  if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
  return num.toString();
}

module.exports = { buildCommandEmbed, buildErrorEmbed, buildLeaderboardEmbed, buildTickerEmbed, formatNumber };
