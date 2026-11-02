const { ApplicationCommandOptionType } = require('discord.js');

/**
 * All slash command definitions for the Word Tycoon bot.
 * These mirror the game commands from the livestream chat.
 */
const SLASH_COMMANDS = [
  {
    name: 'tap',
    description: 'Tap to earn coins (1/sec limit)'
  },
  {
    name: 'taps',
    description: 'Show your tap stats'
  },
  {
    name: 'coins',
    description: 'Show your coin balance'
  },
  {
    name: 'empire',
    description: 'View your businesses and income'
  },
  {
    name: 'buy',
    description: 'Buy or upgrade a business',
    options: [{
      name: 'name',
      description: 'Business name (library, newspaper, carwash, pizza, arcade, gym, cinema, startup, bank, space)',
      type: ApplicationCommandOptionType.String,
      required: false
    }]
  },
  {
    name: 'upgrade',
    description: 'Upgrade your tap power, combo crit, or multi-tap',
    options: [{
      name: 'type',
      description: 'Which upgrade to buy',
      type: ApplicationCommandOptionType.String,
      required: false,
      choices: [
        { name: 'Tap Power', value: 'tap' },
        { name: 'Critical Tap', value: 'crit' },
        { name: 'Multi-Tap', value: 'multi' }
      ]
    }]
  },
  {
    name: 'combo',
    description: 'Show your current combo streak'
  },
  {
    name: 'streak',
    description: 'Show your daily claim streak'
  },
  {
    name: 'shop',
    description: 'Browse the cosmetics shop',
    options: [
      {
        name: 'category',
        description: 'Category to browse (colors, glows, borders, titles, etc.)',
        type: ApplicationCommandOptionType.String,
        required: false
      },
      {
        name: 'rarity',
        description: 'Filter by rarity tier',
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: 'Common', value: 'common' },
          { name: 'Uncommon', value: 'uncommon' },
          { name: 'Rare', value: 'rare' },
          { name: 'Epic', value: 'epic' },
          { name: 'Legendary', value: 'legendary' },
          { name: 'Ultra', value: 'ultra' },
          { name: 'AUX (Audio Reactive)', value: 'aux' }
        ]
      }
    ]
  },
  {
    name: 'buyc',
    description: 'Buy a cosmetic item by name or rarity+category',
    options: [{
      name: 'name',
      description: 'Cosmetic name OR [rarity] [category] (e.g. "aurora" or "rare word glow")',
      type: ApplicationCommandOptionType.String,
      required: true
    }]
  },
  {
    name: 'equip',
    description: 'Equip a cosmetic item by name or rarity+category',
    options: [{
      name: 'name',
      description: 'Cosmetic name OR [rarity] [category] (e.g. "aurora" or "rare word glow")',
      type: ApplicationCommandOptionType.String,
      required: true
    }]
  },
  {
    name: 'unequip',
    description: 'Unequip a cosmetic by category',
    options: [{
      name: 'category',
      description: 'Category to unequip (color, glow, border, title, etc.)',
      type: ApplicationCommandOptionType.String,
      required: true
    }]
  },
  {
    name: 'mycos',
    description: 'View your owned cosmetics'
  },
  {
    name: 'sets',
    description: 'View cosmetic sets and set bonuses'
  },
  {
    name: 'buyset',
    description: 'Buy a gift set with gift coins',
    options: [{
      name: 'name',
      description: 'Set name to purchase',
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        { name: 'Stars & Stripes (USA)', value: 'america' },
        { name: 'Great North (Canada)', value: 'canada' }
      ]
    }]
  },
  {
    name: 'buybest',
    description: 'Buy the single best ROI upgrade (business, tap, or cosmetic)'
  },
  {
    name: 'buybestmax',
    description: 'Spend all your coins on the best upgrades automatically'
  },
  {
    name: 'help',
    description: 'Show all Word Tycoon commands'
  },
  // Discord-only commands
  {
    name: 'leaderboard',
    description: 'Show the top players',
    options: [{
      name: 'limit',
      description: 'Number of players to show (default 10)',
      type: ApplicationCommandOptionType.Integer,
      required: false,
      min_value: 1,
      max_value: 25
    }]
  },
  {
    name: 'play',
    description: 'Start playing Word Tycoon!'
  },
  {
    name: 'link',
    description: 'Link your livestream account to Discord'
  },
  {
    name: 'verify',
    description: 'Verify your account link with a code from TikTok/YouTube chat',
    options: [{
      name: 'code',
      description: 'The 6-character verification code',
      type: ApplicationCommandOptionType.String,
      required: true
    }]
  },
  {
    name: 'test',
    description: 'Preview any cosmetic for 30 seconds before buying',
    options: [{
      name: 'name',
      description: 'Cosmetic name OR [rarity] [category] (e.g. "prismatic", "ultra word glow")',
      type: ApplicationCommandOptionType.String,
      required: true
    }]
  }
];

/**
 * Game commands recognized for prefix (!) handling.
 */
const GAME_COMMANDS = [
  '!tap', '!taps', '!coins', '!empire', '!buy', '!upgrade',
  '!combo', '!shop', '!cosmetics', '!buyc', '!equip', '!unequip',
  '!mycos', '!sets', '!buyset', '!buybest', '!buybestmax',
  '!help', '!leaderboard', '!streak', '!test', '!untest',
  '!play', '!discord', '!verify'
];

/**
 * Map a slash command interaction to a !command text string.
 * Returns null for commands that need special handling (e.g., leaderboard).
 */
function slashToText(interaction) {
  const name = interaction.commandName;

  // These commands are handled locally, not forwarded through relay
  if (name === 'leaderboard') return null;
  if (name === 'play') return null;
  if (name === 'link') return null;
  if (name === 'verify') return null;

  let text = `!${name}`;

  // Map option names per command
  const optionMap = {
    buy: 'name',
    upgrade: 'type',
    shop: 'category',
    buyc: 'name',
    equip: 'name',
    unequip: 'category',
    test: 'name',
    buyset: 'name'
  };

  // Special handling for shop (two options: category + rarity)
  if (name === 'shop') {
    const cat = interaction.options.getString('category');
    const rar = interaction.options.getString('rarity');
    if (cat) text += ` ${cat}`;
    if (rar) text += ` ${rar}`;
    return text;
  }

  if (optionMap[name]) {
    const val = interaction.options.getString(optionMap[name]);
    if (val) text += ` ${val}`;
  }

  return text;
}

/**
 * Commands exempt from account-linking gating.
 */
const EXEMPT_COMMANDS = ['play', 'link', 'verify', 'leaderboard', 'help', 'discord', 'streak'];

module.exports = { SLASH_COMMANDS, GAME_COMMANDS, EXEMPT_COMMANDS, slashToText };
