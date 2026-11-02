const { AttachmentBuilder, MessageFlags } = require('discord.js');
const config = require('../config');
const relayClient = require('../relay-client');
const gameClient = require('../game-client');
const { GAME_COMMANDS, EXEMPT_COMMANDS, slashToText } = require('./definitions');
const { buildLeaderboardEmbed, buildErrorEmbed } = require('../utils/embeds');
const canvas = require('../utils/canvas');
let canvasUtils = null; // lazy load to avoid circular deps

// ─── Card Routing ─────────────────────────────────────────

/**
 * Map command names to image filenames for Discord.
 */
const CMD_FILENAMES = {
  '!tap': 'tap.png', '!taps': 'stats.png', '!coins': 'coins.png',
  '!empire': 'empire.png', '!buy': 'buy.png', '!upgrade': 'upgrade.png',
  '!combo': 'combo.png', '!streak': 'streak.png', '!shop': 'shop.png', '!cosmetics': 'shop.png',
  '!buyc': 'purchase.png', '!equip': 'cosmetics.png',
  '!unequip': 'cosmetics.png', '!mycos': 'cosmetics.png', '!help': 'help.png',
  '!sets': 'sets.png', '!buyset': 'buyset.png',
  '!test': 'preview.png', '!untest': 'preview.png',
  '!buybest': 'buy.png', '!buybestmax': 'buy.png',
  '!play': 'welcome.png', '!discord': 'response.png',
};

/**
 * Route a command to the correct visual card generator.
 */
function generateCard(displayName, cmd, message, ok, extraData) {
  const baseCmd = cmd.split(/\s+/)[0].toLowerCase();

  switch (baseCmd) {
    case '!tap':
      return canvas.generateTapCard(displayName, message, ok);

    case '!taps':
      return canvas.generateStatsCard(displayName, message, ok);

    case '!coins':
      return canvas.generateCoinsCard(displayName, message, ok);

    case '!empire':
      return canvas.generateEmpireCard(displayName, message, ok);

    case '!buy':
      // List (5+ pipes = showing all businesses) vs single purchase confirmation
      if ((message || '').split(' | ').length >= 5) {
        return canvas.generateBuyListCard(displayName, message, ok);
      }
      return canvas.generateBuyCard(displayName, baseCmd, message, ok);

    case '!buybest':
      return canvas.generateBuyCard(displayName, baseCmd, message, ok);

    case '!buybestmax':
      return canvas.generateBuyCard(displayName, baseCmd, message, ok);

    case '!upgrade':
      return canvas.generateUpgradeCard(displayName, baseCmd, message, ok);

    case '!combo':
      return canvas.generateComboCard(displayName, message, ok);

    case '!streak':
      return canvas.generateStreakCard(displayName, message, ok);

    case '!shop':
    case '!cosmetics':
      return canvas.generateShopCard(displayName, message, ok);

    case '!buyc':
      return canvas.generateBuyCard(displayName, baseCmd, message, ok, extraData);

    case '!equip':
    case '!unequip':
    case '!mycos':
      return canvas.generateCosmeticsCard(displayName, baseCmd, message, ok, extraData);

    case '!sets':
      return canvas.generateSetsCard(displayName, message, ok, extraData);

    case '!buyset':
      return canvas.generateBuySetCard(displayName, message, ok, extraData);

    case '!test':
    case '!untest':
      return canvas.generateTestCard(displayName, message, ok, extraData?.itemData || null);

    case '!help':
      return canvas.generateHelpCard(displayName, message, ok);

    case '!play':
      return canvas.generateWelcomeCard(displayName);

    default:
      return canvas.generateCommandResponseCard(displayName, baseCmd, message, ok);
  }
}

// ─── Helpers ──────────────────────────────────────────────

function imageAttachment(buffer, cmd) {
  const name = CMD_FILENAMES[cmd] || 'response.png';
  return new AttachmentBuilder(buffer, { name });
}

async function checkLinked(discordUserId) {
  try {
    const res = await fetch(`${config.GAME_SERVER_URL}/api/link/check/${discordUserId}`, {
      headers: { 'x-api-key': config.GAME_API_SECRET }
    });
    const data = await res.json();
    return data.linked === true;
  } catch {
    return true;
  }

  async function getDailyClaim(discordUserId, shouldClaim) {
    const endpoint = shouldClaim ? '/api/daily-claim' : `/api/daily-claim/status?discordId=${encodeURIComponent(discordUserId)}`;
    const response = await fetch(`${config.GAME_SERVER_URL}${endpoint}`, {
      method: shouldClaim ? 'POST' : 'GET',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.HANGSTREAM_API_SECRET
      },
      body: shouldClaim ? JSON.stringify({ discordId: discordUserId }) : undefined,
      signal: AbortSignal.timeout(8000)
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Daily claim request failed');
    return data;
  }

  function formatStreakMessage(data) {
    if (data.claimed) return `🔥 ${data.message} Current streak: ${data.currentStreak} days.`;
    const next = data.nextMilestone ? ` Next milestone: day ${data.nextMilestone.day} in ${data.nextMilestone.daysAway} day(s).` : '';
    return `🔥 Current streak: ${data.currentStreak} days. Longest: ${data.longestStreak} days. ${data.canClaim ? `Claim available for +${data.previewXp.scaled} XP.` : 'Already claimed today.'}${next}`;
  }

  async function handleDailyClaim(messageOrInteraction, userId, isInteraction) {
    try {
      const data = await getDailyClaim(userId, true);
      const text = formatStreakMessage(data);
      if (isInteraction) return messageOrInteraction.editReply({ content: text });
      return messageOrInteraction.reply(text);
    } catch (error) {
      const text = `Could not load your HangStream streak: ${error.message}`;
      if (isInteraction) return messageOrInteraction.editReply({ content: text });
      return messageOrInteraction.reply(text);
    }
  }
}

// ─── Prefix Commands (!) ──────────────────────────────────

async function handlePrefixCommand(message) {
  const text = message.content.trim();
  const cmd = text.split(/\s+/)[0].toLowerCase();

  if (!GAME_COMMANDS.includes(cmd)) return;

  // !verify works in any channel (user may not know the game channel)
  if (cmd === '!verify') {
    const code = text.split(/\s+/)[1];
    if (!code) return message.reply('Usage: `!verify [code]`');
    return await handleVerifyPrefix(message, message.author.id, message.author.username,
      message.member?.displayName || message.author.displayName || message.author.username, code);
  }

  if (message.channel.id !== config.GAME_CHANNEL_ID) return;

  const displayName = message.member?.displayName || message.author.displayName || message.author.username;
  const username = message.author.username;
  const userId = message.author.id;

  // Leaderboard uses embeds, exempt from gating
  if (cmd === '!leaderboard') {
    const args = text.split(/\s+/).slice(1);
    const limit = parseInt(args[0]) || 10;
    return await handleLeaderboard(message, limit);
  }

  if (cmd === '!streak') return await handleDailyClaim(message, userId, false);

  // Account gating for non-exempt commands
  const cmdName = cmd.replace('!', '');
  if (!EXEMPT_COMMANDS.includes(cmdName)) {
    const linked = await checkLinked(userId);
    if (!linked) {
      const img = canvas.generateGateCard();
      return await message.reply({ files: [new AttachmentBuilder(img, { name: 'gate.png' })] });
    }
  }

  // Execute and reply with specialized card
  const result = await executeCommand(userId, username, displayName, text);
  const img = generateCard(displayName, cmd, result.message, result.ok, { itemData: result.itemData, itemsData: result.itemsData, setStatus: result.setStatus });
  await message.reply({ files: [imageAttachment(img, cmd)] });
}

// ─── Slash Commands ───────────────────────────────────────

async function handleSlashCommand(interaction) {
  // /link replies involve a private link code — keep the whole exchange
  // ephemeral so the code can never appear publicly in the channel.
  const isLink = interaction.commandName === 'link';
  await interaction.deferReply(isLink ? { flags: MessageFlags.Ephemeral } : {});

  const displayName = interaction.member?.displayName || interaction.user.displayName || interaction.user.username;
  const username = interaction.user.username;
  const userId = interaction.user.id;
  const cmdName = interaction.commandName;

  // /play (local + auto-grant library via API)
  if (cmdName === 'play') {
    try {
      await fetch(`${config.GAME_SERVER_URL}/api/play`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': config.GAME_API_SECRET },
        body: JSON.stringify({
          platform: 'mobile',
          userId: `discord_${userId}`,
          username: username,
          displayName: displayName
        })
      });
    } catch (err) {
      console.error('[Handler] /play API call failed:', err.message);
    }
    const img = canvas.generateWelcomeCard(displayName);
    return await interaction.editReply({ files: [new AttachmentBuilder(img, { name: 'welcome.png' })] });
  }

  // /link (local)
  if (cmdName === 'link') {
    return await handleLinkCommand(interaction, userId, username, displayName);
  }

  // /verify explains the supported Discord-to-stream linking flow
  if (cmdName === 'verify') {
    return await handleVerifySlash(interaction, userId, username, displayName,
      interaction.options.getString('code'));
  }

  // /leaderboard (REST API, embeds)
  if (cmdName === 'leaderboard') {
    const limit = interaction.options.getInteger('limit') || 10;
    return await handleLeaderboardSlash(interaction, limit);
  }

  if (cmdName === 'streak') return await handleDailyClaim(interaction, userId, true);

  // Account gating
  if (!EXEMPT_COMMANDS.includes(cmdName)) {
    const linked = await checkLinked(userId);
    if (!linked) {
      const img = canvas.generateGateCard();
      return await interaction.editReply({ files: [new AttachmentBuilder(img, { name: 'gate.png' })] });
    }
  }

  // Forward to game server
  const text = slashToText(interaction);
  if (!text) {
    await interaction.editReply({ embeds: [buildErrorEmbed('Unknown command.')] });
    return;
  }

  const result = await executeCommand(userId, username, displayName, text);
  const cmd = text.split(/\s+/)[0].toLowerCase();
  const img = generateCard(displayName, cmd, result.message, result.ok, { itemData: result.itemData, itemsData: result.itemsData, setStatus: result.setStatus });
  await interaction.editReply({ files: [imageAttachment(img, cmd)] });
}

// ─── /link Handler ────────────────────────────────────────

async function handleLinkCommand(interaction, userId, username, displayName) {
  try {
    // 8s timeout — without it a wedged game server hangs this fetch until the
    // Discord interaction dies (~60s) with an opaque AbortError.
    const statusRes = await fetch(`${config.GAME_SERVER_URL}/api/link/status/${userId}`, {
      headers: { 'x-api-key': config.GAME_API_SECRET },
      signal: AbortSignal.timeout(8000)
    });
    const statusData = await statusRes.json();

    // Check which platforms are already linked
    const linkedPlatforms = (statusData.accounts || []).map(a => a.platform);
    const allLinked = linkedPlatforms.length >= 2 &&
      linkedPlatforms.includes('youtube') && linkedPlatforms.includes('tiktok');

    if (allLinked) {
      // Both YouTube and TikTok are linked — show success with all platforms
      const platformList = linkedPlatforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' + ');
      const acct = statusData.accounts[0];
      console.log('[Handler] /link: allLinked path, generating card');
      const img = canvas.generateLinkSuccessCard(displayName, platformList, acct.platform_user_id);
      console.log(`[Handler] /link: card ready (${img.length} bytes), uploading reply`);
      const reply = await interaction.editReply({
        content: `All accounts linked! (${platformList}) Stats are synced across all platforms.`,
        files: [new AttachmentBuilder(img, { name: 'linked.png' })]
      });
      console.log('[Handler] /link: reply with card delivered');
      return reply;
    }

    // Generate a new link code — allows linking additional platforms
    const codeRes = await fetch(`${config.GAME_SERVER_URL}/api/link/create-code`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.GAME_API_SECRET
      },
      body: JSON.stringify({ discordUserId: userId, discordUsername: username }),
      signal: AbortSignal.timeout(8000)
    });
    const codeData = await codeRes.json();

    if (!codeData.ok) {
      await interaction.editReply({ embeds: [buildErrorEmbed(codeData.error || 'Failed to generate link code.')] });
      return;
    }

    let content = '';
    if (linkedPlatforms.length > 0) {
      const existing = linkedPlatforms.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ');
      content = `Already linked: ${existing}. Use this code to link another platform!`;
    }

    console.log('[Handler] /link: generating code card');
    const img = canvas.generateLinkCodeCard(displayName, codeData.code);
    console.log(`[Handler] /link: code card ready (${img.length} bytes), sending DM`);
    // DM the code so it never sits in a channel where someone else could
    // redeem it. The ephemeral reply just points at the DM; if DMs are
    // closed, fall back to the ephemeral reply (still visible only to them).
    let dmed = false;
    try {
      await interaction.user.send({
        content: content || undefined,
        files: [new AttachmentBuilder(img, { name: 'link-code.png' })]
      });
      dmed = true;
    } catch (e) {
      console.warn(`[Handler] /link: DM failed (${e.message}), falling back to ephemeral reply`);
    }
    if (dmed) {
      await interaction.editReply({
        content: '📬 Check your DMs — your private link code is there. Then type `/verify YOURCODE` in the TikTok live chat of any streamer running our games.'
      });
    } else {
      await interaction.editReply({
        content: `${content ? content + '\n' : ''}Couldn't DM you (DMs may be closed), so here's your code — only you can see this message.`,
        files: [new AttachmentBuilder(img, { name: 'link-code.png' })]
      });
    }
    console.log(`[Handler] /link: code delivered ${dmed ? 'via DM' : 'via ephemeral reply'}`);
  } catch (err) {
    console.error('[Handler] Link command error:', err);
    await interaction.editReply({ embeds: [buildErrorEmbed('Failed to connect to game server.')] });
  }
}

// ─── Execute Command ──────────────────────────────────────

async function executeCommand(userId, username, displayName, text) {
  if (!relayClient.isConnected()) {
    return { ok: false, message: 'Not connected to game server. Try again in a moment.' };
  }

  const responsePromise = gameClient.waitForResponse(displayName, userId);
  const sent = relayClient.sendCommand(userId, username, displayName, text);
  if (!sent) {
    return { ok: false, message: 'Failed to send command. Chat Relay may be down.' };
  }

  return await responsePromise;
}

// ─── Leaderboard (uses embeds) ────────────────────────────

async function handleLeaderboard(message, limit) {
  try {
    const res = await fetch(`${config.GAME_SERVER_URL}/api/leaderboard?limit=${limit}`);
    const data = await res.json();
    const embed = buildLeaderboardEmbed(data, limit);
    await message.reply({ embeds: [embed] });
  } catch (err) {
    await message.reply({ embeds: [buildErrorEmbed('Failed to fetch leaderboard.')] });
  }
}

async function handleLeaderboardSlash(interaction, limit) {
  try {
    const res = await fetch(`${config.GAME_SERVER_URL}/api/leaderboard?limit=${limit}`);
    const data = await res.json();
    const embed = buildLeaderboardEmbed(data, limit);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply({ embeds: [buildErrorEmbed('Failed to fetch leaderboard.')] });
  }
}

// ─── DM Message Handler ──────────────────────────────────

async function handleDMMessage(message) {
  const text = message.content.trim();
  if (!text.startsWith('!')) return;

  const cmd = text.split(/\s+/)[0].toLowerCase();
  if (!GAME_COMMANDS.includes(cmd)) {
    await message.reply('Unknown command. Try `!help` to see available commands.');
    return;
  }

  const displayName = message.author.displayName || message.author.username;
  const username = message.author.username;
  const userId = message.author.id;

  // !verify works in DMs too
  if (cmd === '!verify') {
    const code = text.split(/\s+/)[1];
    if (!code) return message.reply('Usage: `!verify [code]`');
    return await handleVerifyPrefix(message, userId, username, displayName, code);
  }

  // Leaderboard uses embeds
  if (cmd === '!leaderboard') {
    const args = text.split(/\s+/).slice(1);
    const limit = parseInt(args[0]) || 10;
    try {
      const res = await fetch(`${config.GAME_SERVER_URL}/api/leaderboard?limit=${limit}`);
      const data = await res.json();
      const embed = buildLeaderboardEmbed(data, limit);
      await message.reply({ embeds: [embed] });
    } catch (err) {
      await message.reply({ embeds: [buildErrorEmbed('Failed to fetch leaderboard.')] });
    }
    return;
  }

  // Account gating for non-exempt commands
  const cmdName = cmd.replace('!', '');
  if (!EXEMPT_COMMANDS.includes(cmdName)) {
    const linked = await checkLinked(userId);
    if (!linked) {
      const img = canvas.generateGateCard();
      await message.reply({ files: [new AttachmentBuilder(img, { name: 'gate.png' })] });
      return;
    }
  }

  // Execute and reply with specialized card
  const result = await executeCommand(userId, username, displayName, text);
  const img = generateCard(displayName, cmd, result.message, result.ok, { itemData: result.itemData, itemsData: result.itemsData, setStatus: result.setStatus });
  await message.reply({ files: [imageAttachment(img, cmd)] });
}

// ─── /verify Handler ──────────────────────────────────────

const VERIFY_GUIDANCE = 'Use /link in Discord to get a private code, then type /verify YOURCODE in the TikTok live chat of a streamer running Word Tycoon games. Discord cannot verify a TikTok identity on your behalf.';
async function handleVerifySlash(interaction, userId, username, displayName, code) {
  return interaction.editReply({ content: VERIFY_GUIDANCE });
}
async function handleVerifyPrefix(message, userId, username, displayName, code) {
  return message.reply(VERIFY_GUIDANCE);
}

module.exports = { handlePrefixCommand, handleSlashCommand, handleDMMessage };
