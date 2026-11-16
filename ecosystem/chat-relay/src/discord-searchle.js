const fetch = require('./service-fetch').serviceFetch;
const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const db = require('./database');
const wordBank = require('./word-bank');

const SUBTEXTLE_INTERNAL_URL = process.env.SEARCHLE_INTERNAL_URL || 'http://localhost:3015';
const GAME_API_SECRET = process.env.GAME_API_SECRET;
const DAILY_TIMEZONE = process.env.DAILY_TIMEZONE || 'America/Edmonton';
const SUBTEXTLE_LINK_URL = process.env.SEARCHLE_DISCORD_LINK_URL || 'https://wordtycoon.live/auth/discord';
const SUBTEXTLE_FULL_URL = process.env.SEARCHLE_FULL_URL || 'https://subtextle.com/';
const SUBTEXTLE_ART_URL = process.env.SEARCHLE_DISCORD_ART_URL || 'https://wordtycoon.live/portal/img/game-subtextle.png';
const CUSTOM_IDS = {
  guessButton: 'subtextle:guess',
  leaderboardButton: 'subtextle:leaderboard',
  linkButton: 'subtextle:link',
  guessModal: 'subtextle:guess-modal',
  guessInput: 'subtextle:guess-word'
};

let client = null;
const COLORS = {
  brand: 0x2f80ed,
  success: 0x22c55e,
  warning: 0xf59e0b,
  danger: 0xef4444
};
const TIER_EMOJIS = {
  solved: '🎯',
  elite: '🔥',
  excellent: '✨',
  strong: '🧠',
  warm: '🌤️',
  far: '🧊'
};

const slashCommands = [
  new SlashCommandBuilder()
    .setName('subtextle')
    .setDescription('Play the daily Subtextle server puzzle')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('daily')
        .setDescription('Show today\'s Subtextle puzzle for this server'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('guess')
        .setDescription('Submit a guess for today\'s Subtextle puzzle')
        .addStringOption((option) =>
          option
            .setName('word')
            .setDescription('Your guess')
            .setRequired(true)
            .setMaxLength(32)))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('leaderboard')
        .setDescription('Show today\'s Subtextle server leaderboard'))
    .addSubcommand((subcommand) =>
      subcommand
        .setName('link')
        .setDescription('Link your Discord account to Word Tycoon')),
];

function getPuzzleDate() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DAILY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function getGuildId(interaction) {
  return interaction.guildId || interaction.guild?.id || null;
}

function ensureGuildPuzzle(guildId) {
  const result = wordBank.getDailyWord('searchle-discord', 5);
  if (!result || !result.word || !result.date) {
    throw new Error('No Subtextle daily word available');
  }
  const puzzle = db.upsertSearchleDiscordPuzzle(guildId, result.date, result.word, result.gameId || 'searchle-discord');
  return {
    guildId,
    puzzleDate: result.date,
    targetWord: puzzle.target_word,
    sourceGameId: puzzle.source_game_id
  };
}

async function evaluateGuess(targetWord, guessWord) {
  const response = await fetch(`${SUBTEXTLE_INTERNAL_URL}/api/discord-bot/searchle/evaluate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': GAME_API_SECRET
    },
    body: JSON.stringify({
      targetWord,
      guess: guessWord
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Subtextle evaluate failed (${response.status}): ${text}`);
  }

  return response.json();
}

function formatRankLabel(rank) {
  if (rank === 1) return `${TIER_EMOJIS.solved} Solved`;
  if (rank <= 10) return `${TIER_EMOJIS.elite} Elite (#${rank})`;
  if (rank <= 100) return `${TIER_EMOJIS.excellent} Excellent (#${rank})`;
  if (rank <= 1000) return `${TIER_EMOJIS.strong} Strong (#${rank})`;
  if (rank <= 10000) return `${TIER_EMOJIS.warm} Warm (#${rank.toLocaleString()})`;
  return `${TIER_EMOJIS.far} Far (#${rank.toLocaleString()})`;
}

function getResultColor(rank, isWin) {
  if (isWin || rank === 1) return COLORS.success;
  if (rank <= 10) return 0xf97316;
  if (rank <= 100) return 0xeab308;
  if (rank <= 1000) return 0x06b6d4;
  if (rank <= 10000) return 0x6366f1;
  return COLORS.brand;
}

function formatLeaderboardLines(entries) {
  if (!entries.length) return ['No guesses yet today.'];
  return entries.map((entry) => {
    const medal = entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : entry.position === 3 ? '🥉' : `#${entry.position}`;
    const rankLabel = entry.solved
      ? '🎯 Solved'
      : (entry.bestRank != null ? `Best #${entry.bestRank.toLocaleString()}` : 'No rank');
    return `${medal} ${entry.displayName} — ${rankLabel} in ${entry.attempts} guess${entry.attempts === 1 ? '' : 'es'}`;
  });
}

function formatRecentGuessLines(entries) {
  if (!entries.length) return 'No guesses yet.';
  return entries.map((entry) => {
    if (entry.isWin || entry.rank === 1) {
      return `🎯 ${entry.normalizedWord.toUpperCase()} — solved`;
    }
    return `${formatRankLabel(entry.rank)} • ${entry.normalizedWord.toUpperCase()}`;
  }).join('\n');
}

function formatActivityBar(stats) {
  const capped = Math.min(8, Math.max(0, Math.ceil((stats.totalGuesses || 0) / 3)));
  const filled = '█'.repeat(capped);
  const empty = '░'.repeat(8 - capped);
  return `\`${filled}${empty}\` ${stats.totalGuesses} guesses • ${stats.playerCount} players • ${stats.solvedCount} solved`;
}

function formatTopGuessLines(entries) {
  if (!entries.length) return 'No ranked words yet.';
  return entries.map((entry) => {
    const badge = entry.position === 1 ? '🥇' : entry.position === 2 ? '🥈' : entry.position === 3 ? '🥉' : `#${entry.position}`;
    const by = entry.displayName ? ` — ${entry.displayName}` : '';
    return `${badge} ${entry.normalizedWord.toUpperCase()} • #${entry.bestRank.toLocaleString()}${by}`;
  }).join('\n');
}

function buildHudStatRow(progress, summary, stats) {
  return [
    '```text',
    `POS ${formatPosition(progress.position).padEnd(10)} SOLVED ${formatSolvedStatus(progress.solved).padEnd(7)} STREAK ${String(progress.streak).padEnd(2)}`,
    `BEST ${(summary.bestRank != null ? `#${summary.bestRank}` : '—').padEnd(10)} GUESSES ${String(summary.attempts).padEnd(5)} PLAYERS ${String(stats.playerCount)}`,
    '```'
  ].join('\n');
}

function buildWinHud(displayName, word, summary, progress, stats) {
  const crown = progress.position === 1 ? '👑' : '🎉';
  return [
    '```text',
    `${crown} Subtextle DAILY CLEARED`,
    `${displayName.toUpperCase()}`,
    `${word.toUpperCase()}  |  ${summary.attempts} GUESSES  |  ${formatPosition(progress.position)}`,
    `${stats.totalGuesses} TOTAL GUESSES  |  ${stats.playerCount} PLAYERS  |  ${stats.solvedCount} SOLVED`,
    '```'
  ].join('\n');
}

function buildLeaderboardHud(rows) {
  if (!rows.length) {
    return '```text\nNO SERVER GUESSES YET\n```';
  }

  const lines = rows.slice(0, 5).map((row) => {
    const pos = String(row.position).padStart(2, ' ');
    const name = (row.displayName || 'Player').slice(0, 12).padEnd(12, ' ');
    const rank = row.solved ? 'SOLVED'.padEnd(8, ' ') : `#${row.bestRank}`.padEnd(8, ' ');
    const tries = `${row.attempts}G`.padStart(3, ' ');
    return `${pos}. ${name} ${rank} ${tries}`;
  });

  return ['```text', 'SERVER RANKINGS', ...lines, '```'].join('\n');
}

function buildPinnedGuessPanel(latestGuess) {
  if (!latestGuess) {
    return '```text\nLATEST GUESS\nWaiting for your first shot\n```';
  }
  const label = latestGuess.isWin || latestGuess.rank === 1
    ? '🎯 SOLVED'
    : formatRankLabel(latestGuess.rank).replace(/^[^\s]+\s/, '');
  return [
    '```text',
    'LATEST GUESS',
    latestGuess.normalizedWord.toUpperCase(),
    label,
    '```'
  ].join('\n');
}

function formatPosition(position) {
  return position != null ? `#${position}` : 'Unranked';
}

function formatSolvedStatus(solved) {
  return solved ? 'Yes' : 'Not yet';
}

function addProgressHeader(embed, progress) {
  embed.addFields(
    { name: 'Position', value: formatPosition(progress.position), inline: true },
    { name: 'Solved Today', value: formatSolvedStatus(progress.solved), inline: true },
    { name: 'Streak', value: `${progress.streak} day${progress.streak === 1 ? '' : 's'}`, inline: true }
  );
  return embed;
}

function buildShareLine(displayName, word, attempts, position) {
  const pos = position != null ? ` | ${formatPosition(position)}` : '';
  return `🎯 ${displayName} solved today’s Subtextle with ${word.toUpperCase()} in ${attempts} guess${attempts === 1 ? '' : 'es'}${pos}`;
}

function replyPayload(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    return interaction.editReply(payload);
  }
  return interaction.reply(payload);
}

function buildBaseEmbed(title, color = COLORS.brand) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setAuthor({ name: 'Subtextle Daily', iconURL: SUBTEXTLE_ART_URL })
    .setThumbnail(SUBTEXTLE_ART_URL)
    .setFooter({ text: 'Subtextle x Word Tycoon' })
    .setTimestamp();
}

function buildGameControls() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.guessButton)
        .setLabel('Guess')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.leaderboardButton)
        .setLabel('Leaderboard')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(CUSTOM_IDS.linkButton)
        .setLabel('Link Account')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setLabel('Play Full')
        .setStyle(ButtonStyle.Link)
        .setURL(SUBTEXTLE_FULL_URL)
    )
  ];
}

function buildGuessModal() {
  const input = new TextInputBuilder()
    .setCustomId(CUSTOM_IDS.guessInput)
    .setLabel('Enter your Subtextle guess')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(32)
    .setPlaceholder('ocean');

  return new ModalBuilder()
    .setCustomId(CUSTOM_IDS.guessModal)
    .setTitle('Subtextle Guess')
    .addComponents(new ActionRowBuilder().addComponents(input));
}

async function handleDaily(interaction) {
  const guildId = getGuildId(interaction);
  if (!guildId) {
    return replyPayload(interaction, { content: 'Subtextle daily puzzles are server-only right now.' });
  }

  const puzzle = ensureGuildPuzzle(guildId);
  const summary = db.getSearchleDiscordUserSummary(guildId, puzzle.puzzleDate, interaction.user.id);
  const recent = db.getSearchleDiscordRecentGuesses(guildId, puzzle.puzzleDate, interaction.user.id, 4);
  const stats = db.getSearchleDiscordPuzzleStats(guildId, puzzle.puzzleDate);
  const topWords = db.getSearchleDiscordTopGuesses(guildId, puzzle.puzzleDate, 5);
  const latestGuess = recent[0] || null;
  const progress = {
    position: db.getSearchleDiscordUserPosition(guildId, puzzle.puzzleDate, interaction.user.id),
    solved: summary.solved,
    streak: db.getSearchleDiscordCurrentStreak(guildId, interaction.user.id)
  };
  const embed = buildBaseEmbed(`Subtextle Daily — ${interaction.guild?.name || 'This Server'}`)
    .setDescription('Guess the hidden word by meaning, climb your server leaderboard, and carry the rivalry into the full game.')
  addProgressHeader(embed, progress);
  embed.addFields(
      { name: 'Subtextle HUD', value: buildHudStatRow(progress, summary, stats), inline: false },
      { name: 'Puzzle Date', value: puzzle.puzzleDate, inline: true },
      { name: 'Your Attempts', value: String(summary.attempts), inline: true },
      { name: 'Your Best Rank', value: summary.bestRank != null ? `#${summary.bestRank.toLocaleString()}` : '—', inline: true },
      { name: 'Server Heat', value: formatActivityBar(stats), inline: false },
      { name: 'Latest Guess', value: buildPinnedGuessPanel(latestGuess), inline: false },
      { name: 'Closest Words', value: formatTopGuessLines(topWords), inline: false },
      { name: 'Your Recent Guesses', value: formatRecentGuessLines(recent), inline: false }
    );
  embed.setImage(SUBTEXTLE_ART_URL);

  return replyPayload(interaction, { embeds: [embed], components: buildGameControls() });
}

function getGuessWordFromInteraction(interaction) {
  if (interaction.isModalSubmit()) {
    return interaction.fields.getTextInputValue(CUSTOM_IDS.guessInput).trim().toLowerCase();
  }
  return interaction.options.getString('word', true).trim().toLowerCase();
}

async function handleGuess(interaction) {
  const guildId = getGuildId(interaction);
  if (!guildId) {
    return replyPayload(interaction, { content: 'Subtextle daily puzzles are server-only right now.' });
  }

  const rawWord = getGuessWordFromInteraction(interaction);
  const puzzle = ensureGuildPuzzle(guildId);
  const evaluation = await evaluateGuess(puzzle.targetWord, rawWord);

  if (!evaluation.ok) {
    return replyPayload(interaction, { content: 'Subtextle scoring is unavailable right now. Try again in a minute.' });
  }

  if (!evaluation.valid) {
    const reason = evaluation.reason === 'not_in_vocabulary'
      ? 'That word is not in the Subtextle vocabulary.'
      : 'Please enter a single valid word.';
    const embed = buildBaseEmbed('Subtextle Guess Rejected', COLORS.danger)
      .setDescription(reason)
      .addFields({ name: 'Try Again', value: 'Press **Guess** below or use `/subtextle guess <word>` with another word.' });
    return replyPayload(interaction, { embeds: [embed], components: buildGameControls() });
  }

  const displayName = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
  const saved = db.recordSearchleDiscordGuess({
    guildId,
    puzzleDate: puzzle.puzzleDate,
    userId: interaction.user.id,
    username: interaction.user.username,
    displayName,
    guessWord: rawWord,
    normalizedWord: evaluation.normalizedGuess,
    rank: evaluation.rank,
    isWin: evaluation.isWin
  });

  if (saved.duplicate) {
    const embed = buildBaseEmbed('Duplicate Guess', COLORS.warning)
      .setDescription(`You already guessed **${evaluation.normalizedGuess.toUpperCase()}** today in this server.`)
      .addFields({ name: 'Next Move', value: 'Try a different word or open the leaderboard to see how close you are.' });
    return replyPayload(interaction, { embeds: [embed], components: buildGameControls() });
  }

  const summary = db.getSearchleDiscordUserSummary(guildId, puzzle.puzzleDate, interaction.user.id);
  const top = db.getSearchleDiscordLeaderboard(guildId, puzzle.puzzleDate, 3);
  const recent = db.getSearchleDiscordRecentGuesses(guildId, puzzle.puzzleDate, interaction.user.id, 5);
  const stats = db.getSearchleDiscordPuzzleStats(guildId, puzzle.puzzleDate);
  const topWords = db.getSearchleDiscordTopGuesses(guildId, puzzle.puzzleDate, 5);
  const progress = {
    position: db.getSearchleDiscordUserPosition(guildId, puzzle.puzzleDate, interaction.user.id),
    solved: summary.solved,
    streak: db.getSearchleDiscordCurrentStreak(guildId, interaction.user.id)
  };
  const embed = buildBaseEmbed(
    evaluation.isWin ? `${displayName} solved today’s Subtextle` : `${displayName} guessed ${evaluation.normalizedGuess.toUpperCase()}`,
    getResultColor(evaluation.rank, evaluation.isWin)
  );

  addProgressHeader(embed, progress);
  embed.addFields(
    {
      name: 'Subtextle HUD',
      value: buildHudStatRow(progress, summary, stats),
      inline: false
    },
    {
      name: 'Result',
      value: evaluation.isWin ? `Solved with **${evaluation.normalizedGuess.toUpperCase()}**` : formatRankLabel(evaluation.rank),
      inline: true
    },
    {
      name: 'Your Best Today',
      value: summary.bestRank != null ? `#${summary.bestRank.toLocaleString()}` : '—',
      inline: true
    },
    {
      name: 'Attempts',
      value: String(summary.attempts),
      inline: true
    },
    {
      name: 'Guess',
      value: evaluation.normalizedGuess.toUpperCase(),
      inline: true
    },
    {
      name: 'Server Heat',
      value: formatActivityBar(stats),
      inline: false
    },
    {
      name: 'Closest Words',
      value: formatTopGuessLines(topWords),
      inline: false
    },
    {
      name: 'Today’s Top 3',
      value: formatLeaderboardLines(top).join('\n'),
      inline: false
    },
    {
      name: 'Your Recent Guesses',
      value: formatRecentGuessLines(recent),
      inline: false
    }
  );

  if (evaluation.isWin) {
    embed
      .setTitle(`🎉 ${displayName} solved today’s Subtextle!`)
      .setDescription('The daily server puzzle has been cracked. This is the one worth screenshotting.')
      .setImage(SUBTEXTLE_ART_URL)
      .addFields(
        {
          name: 'Win Card',
          value: buildWinHud(displayName, evaluation.normalizedGuess, summary, progress, stats),
          inline: false
        },
        {
          name: 'Victory Line',
          value: buildShareLine(displayName, evaluation.normalizedGuess, summary.attempts, progress.position),
          inline: false
        },
        {
          name: 'Brag Version',
          value: `Solved with **${evaluation.normalizedGuess.toUpperCase()}** • ${summary.attempts} guess${summary.attempts === 1 ? '' : 'es'} • ${formatPosition(progress.position)}`,
          inline: false
        }
      );
  } else {
    embed.setDescription('Closer words mean you are getting warmer. Keep climbing toward `#1`.');
  }

  return replyPayload(interaction, { embeds: [embed], components: buildGameControls() });
}

async function handleLeaderboard(interaction) {
  const guildId = getGuildId(interaction);
  if (!guildId) {
    return replyPayload(interaction, { content: 'Subtextle leaderboards are server-only right now.' });
  }

  const puzzle = ensureGuildPuzzle(guildId);
  const rows = db.getSearchleDiscordLeaderboard(guildId, puzzle.puzzleDate, 10);
  const summary = db.getSearchleDiscordUserSummary(guildId, puzzle.puzzleDate, interaction.user.id);
  const recent = db.getSearchleDiscordRecentGuesses(guildId, puzzle.puzzleDate, interaction.user.id, 5);
  const stats = db.getSearchleDiscordPuzzleStats(guildId, puzzle.puzzleDate);
  const topWords = db.getSearchleDiscordTopGuesses(guildId, puzzle.puzzleDate, 5);
  const progress = {
    position: db.getSearchleDiscordUserPosition(guildId, puzzle.puzzleDate, interaction.user.id),
    solved: summary.solved,
    streak: db.getSearchleDiscordCurrentStreak(guildId, interaction.user.id)
  };
  const embed = buildBaseEmbed(`Subtextle Leaderboard — ${interaction.guild?.name || 'This Server'}`)
    .setDescription('Today’s best Subtextle hunters in this server.');
  addProgressHeader(embed, progress);
  embed.addFields(
      { name: 'Subtextle HUD', value: buildHudStatRow(progress, summary, stats), inline: false },
      { name: 'Date', value: puzzle.puzzleDate, inline: true },
      { name: 'Server Heat', value: formatActivityBar(stats), inline: false },
      { name: 'Latest Guess', value: buildPinnedGuessPanel(recent[0] || null), inline: false },
      { name: 'Closest Words', value: formatTopGuessLines(topWords), inline: false },
      { name: 'Board View', value: buildLeaderboardHud(rows), inline: false },
      { name: 'Standings', value: formatLeaderboardLines(rows).join('\n'), inline: false },
      { name: 'Jump In', value: 'Press **Guess** below to make your move.', inline: false }
    );

  return replyPayload(interaction, { embeds: [embed], components: buildGameControls() });
}

async function handleLink(interaction) {
  const embed = buildBaseEmbed('Link your Discord to Word Tycoon')
    .setDescription(`Open ${SUBTEXTLE_LINK_URL}\n\nOnce you log in there with this Discord account, your profile can line up with the full Word Tycoon arcade and future Subtextle rewards.`);
  return replyPayload(interaction, {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('Open Link Flow')
          .setStyle(ButtonStyle.Link)
          .setURL(SUBTEXTLE_LINK_URL)
      )
    ]
  });
}

async function handleSubtextleCommand(interaction) {
  const subcommand = interaction.options.getSubcommand();
  if (subcommand === 'daily') return handleDaily(interaction);
  if (subcommand === 'guess') return handleGuess(interaction);
  if (subcommand === 'leaderboard') return handleLeaderboard(interaction);
  if (subcommand === 'link') return handleLink(interaction);
  return interaction.reply({ content: 'Unknown Subtextle command.', ephemeral: true });
}

async function registerSlashCommands(token) {
  const rest = new REST({ version: '10' }).setToken(token);
  const guildId = process.env.SEARCHLE_DISCORD_BOT_GUILD_ID || '';
  const body = slashCommands.map((command) => command.toJSON());

  if (guildId) {
    console.log(`[Subtextle Discord] Registering slash commands for guild ${guildId}...`);
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, guildId),
      { body }
    );
    return;
  }

  console.log('[Subtextle Discord] Registering global slash commands...');
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body }
  );
}

async function initialize(token) {
  client = new Client({
    intents: [GatewayIntentBits.Guilds]
  });

  client.on(Events.ClientReady, async () => {
    console.log(`[Subtextle Discord] Bot logged in as ${client.user.tag}`);
    try {
      await registerSlashCommands(token);
      console.log('[Subtextle Discord] Slash commands registered');
    } catch (error) {
      console.error('[Subtextle Discord] Failed to register slash commands:', error.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName !== 'subtextle') return;
        const subcommand = interaction.options.getSubcommand();
        await interaction.deferReply({ ephemeral: subcommand === 'link' });
        await handleSubtextleCommand(interaction);
        return;
      }

      if (interaction.isButton()) {
        if (interaction.customId === CUSTOM_IDS.guessButton) {
          await interaction.showModal(buildGuessModal());
          return;
        }
        if (interaction.customId === CUSTOM_IDS.leaderboardButton) {
          await interaction.deferReply({ ephemeral: true });
          await handleLeaderboard(interaction);
          return;
        }
        if (interaction.customId === CUSTOM_IDS.linkButton) {
          await interaction.deferReply({ ephemeral: true });
          await handleLink(interaction);
          return;
        }
        return;
      }

      if (interaction.isModalSubmit()) {
        if (interaction.customId !== CUSTOM_IDS.guessModal) return;
        await interaction.deferReply();
        await handleGuess(interaction);
      }
    } catch (error) {
      console.error('[Subtextle Discord] Interaction error:', error.message);
      const reply = interaction.replied || interaction.deferred
        ? interaction.followUp.bind(interaction)
        : interaction.reply.bind(interaction);
      await reply({ content: 'Something went wrong while handling that Subtextle command.', ephemeral: true });
    }
  });

  client.on(Events.Error, (error) => {
    console.error('[Subtextle Discord] Error:', error.message);
  });

  await client.login(token);
}

function isConnected() {
  return !!(client && client.isReady());
}

function getClient() {
  return client;
}

function shutdown() {
  if (client) {
    client.destroy();
    client = null;
  }
}

module.exports = {
  initialize,
  isConnected,
  getClient,
  shutdown
};
