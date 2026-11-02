/**
 * Triangled Client
 *
 * Handles daily puzzle review DMs and admin commands.
 * Admin gets 3 puzzle options + 3 image styles.
 * Reacts: 1️⃣/2️⃣/3️⃣ for puzzle, 🅰️/🅱️/🅲 for image.
 */

const { io: ioClient } = require('socket.io-client');
const { AttachmentBuilder } = require('discord.js');
const fs = require('fs');
const config = require('./config');

let socket = null;
let discordClient = null;

const CHOICE_REACTIONS = ['1️⃣', '2️⃣', '3️⃣'];

// API helper for Triangled admin endpoints
const API_KEY = config.TRIANGLED_ADMIN_SECRET;
const BASE_URL = config.TRIANGLED_URL || 'http://localhost:3024';

function adminBaseUrl() {
  if (typeof API_KEY !== 'string' || !/^[a-f0-9]{64}$/.test(API_KEY)) throw new Error('Triangled admin credential unavailable');
  const url = new URL(BASE_URL);
  if (url.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
      url.port !== '3024' || url.pathname !== '/' || url.username || url.password || url.search || url.hash)
    throw new Error('Triangled admin destination rejected');
  return url.origin;
}
async function adminFetch(method, path, body = null) {
  const base = adminBaseUrl();
  const opts = {
    method, redirect: 'error', signal: AbortSignal.timeout(12000),
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': API_KEY
    }
  };
  if (body) opts.body = JSON.stringify(body);
  
  try {
    const res = await fetch(`${base}${path}`, opts);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: Triangled admin request rejected`);
    }
    return await res.json();
  } catch (err) {
    console.error(`[Triangled] API error: ${err.message}`);
    throw err;
  }
}

function initialize(client) {
  discordClient = client;

  if (!config.ADMIN_DISCORD_ID) {
    console.log('[Triangled] No ADMIN_DISCORD_ID set, puzzle review DMs disabled');
    return;
  }

  let url;
  try { url = adminBaseUrl(); } catch { console.warn('[Triangled] Puzzle review disabled: admin credential/destination unavailable'); return; }
  console.log(`[Triangled] Connecting to Triangled server at ${url}...`);

  socket = ioClient(url, {
    auth: { apiKey: API_KEY },
    reconnection: true,
    reconnectionDelay: 5000,
    reconnectionDelayMax: 30000,
    reconnectionAttempts: Infinity
  });

  socket.on('connect', () => console.log('[Triangled] Connected'));
  socket.on('disconnect', (r) => console.log(`[Triangled] Disconnected: ${r}`));
  socket.on('connect_error', () => {});
  socket.on('triangled-puzzle-review', handlePuzzleReview);
}

async function handlePuzzleReview(data) {
  if (!discordClient || !config.ADMIN_DISCORD_ID) return;

  const { date, message, puzzleCount, imageFiles } = data;
  console.log(`[Triangled] Review for ${date}: ${puzzleCount} puzzles, ${imageFiles?.length || 0} images`);

  try {
    const user = await discordClient.users.fetch(config.ADMIN_DISCORD_ID);
    if (!user) return;

    // Build image attachments
    const attachments = [];
    const styleNames = ['cartoon', 'realistic', 'artistic'];
    if (imageFiles) {
      for (let i = 0; i < imageFiles.length; i++) {
        if (fs.existsSync(imageFiles[i])) {
          attachments.push(new AttachmentBuilder(fs.readFileSync(imageFiles[i]), {
            name: `${styleNames[i] || 'option_' + (i + 1)}.jpg`
          }));
        }
      }
    }

    const dm = await user.send({ content: message, files: attachments });

    // Add number reactions
    for (const emoji of CHOICE_REACTIONS.slice(0, puzzleCount || 3)) {
      try { await dm.react(emoji); } catch {}
    }

    // Collect one reaction — picks both puzzle and its matching image
    const filter = (reaction, reactUser) => {
      return CHOICE_REACTIONS.includes(reaction.emoji.name) && reactUser.id === config.ADMIN_DISCORD_ID;
    };

    const collector = dm.createReactionCollector({ filter, max: 1, time: 12 * 60 * 60 * 1000 });

    let decision = null;
    function select(choice, automatic) {
      if (decision) return decision;
      decision = (async () => {
        try {
          const result = await adminFetch('POST', '/api/admin/select', { date, puzzleChoice: choice, imageChoice: choice });
          if (result.success !== true) throw new Error('Selection was not acknowledged');
          await user.send(automatic
            ? `**Triangled ${date}** — Auto-approved option 1 (no response).`
            : `**Triangled ${date}** — Option **${choice}** selected and approved!`);
        } catch {
          await user.send(`**Triangled ${date}** — Could not confirm approval. Check the puzzle status and retry the admin command.`).catch(() => {});
        }
      })();
      return decision;
    }
    collector.on('collect', reaction => { void select(CHOICE_REACTIONS.indexOf(reaction.emoji.name) + 1, false); });
    collector.on('end', collected => { if (collected.size === 0) void select(1, true); });

  } catch (err) {
    console.error('[Triangled] DM failed:', err.message);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// ADMIN DM COMMAND HANDLER
// ═════════════════════════════════════════════════════════════════════════════

async function handleAdminCommand(message, args) {
  if (!config.ADMIN_DISCORD_ID || message.author.id !== config.ADMIN_DISCORD_ID) {
    return; // Not admin
  }

  const parts = args.trim().split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const subArgs = parts.slice(1);

  console.log(`[Triangled] Admin command: !tg ${command}`);

  try {
    switch (command) {
      case 'help':
      case '':
        await sendHelp(message);
        break;
      case 'puzzles':
        await listPuzzles(message);
        break;
      case 'today':
        await showToday(message);
        break;
      case 'stats':
        await showStats(message);
        break;
      case 'view':
        await viewPuzzle(message, subArgs[0]);
        break;
      case 'images':
        await sendImages(message, subArgs[0]);
        break;
      case 'generate':
        await generatePuzzle(message, subArgs[0]);
        break;
      case 'pick':
        await pickPuzzle(message, subArgs[0], subArgs[1]);
        break;
      case 'set-daily':
        await setDaily(message, subArgs[0]);
        break;
      case 'gen-images':
        await genImages(message, subArgs[0]);
        break;
      case 'library':
        await showLibrary(message);
        break;
      case 'list':
        if (subArgs[0] === 'new') {
          await showUnusedPuzzles(message);
        } else {
          await showFullList(message);
        }
        break;
      default:
        await message.reply(`Unknown command: "${command}". Use \`!tg help\` for available commands.`);
    }
  } catch (err) {
    console.error('[Triangled] Command error:', err);
    await message.reply(`❌ Error: ${err.message}`);
  }
}

async function sendHelp(message) {
  const helpText = [
    '**🎮 Triangled Admin Commands**',
    '',
    '`!tg help` — Show this help',
    '`!tg puzzles` — List all puzzles (date, theme, status)',
    '`!tg today` — Show today\'s live puzzle',
    '`!tg stats` — Show today\'s player stats',
    '`!tg view <date>` — View puzzle details (browse only)',
    '`!tg images <date>` — Send all images for a date',
    '`!tg generate <date>` — Generate 3 new puzzle options + images',
    '`!tg pick <date> <1-3>` — Select and approve a puzzle option',
    '`!tg set-daily <date>` — Set a date as the active daily',
    '`!tg gen-images <date>` — Generate new images for existing puzzle',
    '`!tg library` — Show all approved puzzles (archive)',
    '',
    '**Examples:**',
    '`!tg view 2026-04-13`',
    '`!tg generate 2026-04-15`',
    '`!tg pick 2026-04-15 2`',
  ].join('\n');

  await message.reply(helpText);
}

async function listPuzzles(message) {
  const data = await adminFetch('GET', '/api/admin/puzzles');
  
  if (!data || !data.puzzles || data.puzzles.length === 0) {
    await message.reply('No puzzles found.');
    return;
  }

  const lines = ['**📅 All Triangled Puzzles**\n'];
  
  data.puzzles.forEach(p => {
    const status = p.status === 'approved' ? '✅' : p.status === 'pending' ? '⏳' : '❌';
    lines.push(`${status} **${p.date}** — ${p.theme || 'No theme'} (${p.status})`);
  });

  await message.reply(lines.join('\n'));
}

async function showToday(message) {
  const today = new Date().toISOString().slice(0, 10);
  const data = await adminFetch('GET', `/api/admin/puzzle/${today}`);
  
  if (!data) {
    await message.reply(`No puzzle found for today (${today}).`);
    return;
  }

  const p = data.puzzle;
  const lines = [
    `**📊 Today's Puzzle — ${today}**`,
    '',
    `Status: ${data.status.toUpperCase()}`,
    `Theme: **${p?.theme || 'N/A'}**`,
    `Hint: "${p?.themeHint || 'N/A'}"`,
  ];

  if (data.status === 'approved' && p) {
    lines.push(`Spangram: ||${p.spangram}|| (${p.spangram?.length} letters)`);
    lines.push(`Words: ${p.words?.length || 0}`);
    lines.push(`Image: ${p.imageFile || 'None'}`);
  } else if (data.puzzleOptions) {
    lines.push('');
    lines.push('Options:');
    data.puzzleOptions.forEach((opt, i) => {
      const selected = data.selectedPuzzle === i + 1 ? ' ✅' : '';
      lines.push(`  ${i + 1}. ${opt.theme}${selected}`);
    });
  }

  await message.reply(lines.join('\n'));
}

async function showStats(message) {
  try {
    const data = await adminFetch('GET', '/api/daily/stats');
    
    const lines = [
      '**📈 Today\'s Player Stats**',
      '',
      `Players: ${data.players || 0}`,
      `Completions: ${data.completions || 0}`,
      `Average Hints Used: ${data.avgHints?.toFixed(2) || 'N/A'}`,
    ];

    await message.reply(lines.join('\n'));
  } catch (err) {
    await message.reply('Could not retrieve stats. The endpoint may not be available yet.');
  }
}

async function viewPuzzle(message, date) {
  if (!date) {
    await message.reply('Please specify a date: `!tg view 2026-04-13`');
    return;
  }

  const data = await adminFetch('GET', `/api/admin/puzzle/${date}`);
  
  if (!data) {
    await message.reply(`No puzzle found for ${date}.`);
    return;
  }

  const lines = [
    `**🔍 Puzzle Details — ${date}**`,
    `Status: ${data.status.toUpperCase()}`,
    ''
  ];

  if (data.puzzleOptions) {
    data.puzzleOptions.forEach((opt, i) => {
      const selected = data.selectedPuzzle === i + 1 ? ' ✅ **SELECTED**' : '';
      lines.push(`${i + 1}. **${opt.theme}**${selected}`);
      lines.push(`   Hint: "${opt.themeHint}"`);
      lines.push(`   Spangram: ||${opt.spangram}|| (${opt.spangram?.length})`);
      lines.push(`   Words: ${opt.words?.length || 0} words`);
      if (opt.words) {
        lines.push(`   ||${opt.words.join(', ')}||`);
      }
      if (opt.gridString) {
        lines.push(`   Grid: \`${opt.gridString.substring(0, 30)}...\``);
      }
      lines.push('');
    });
  } else if (data.puzzle) {
    const p = data.puzzle;
    lines.push(`Theme: **${p.theme}**`);
    lines.push(`Hint: "${p.themeHint}"`);
    lines.push(`Spangram: ||${p.spangram}||`);
    lines.push(`Words: ||${p.words?.join(', ')}||`);
  }

  await message.reply(lines.join('\n'));
}

async function sendImages(message, date) {
  if (!date) {
    await message.reply('Please specify a date: `!tg images 2026-04-13`');
    return;
  }

  const data = await adminFetch('GET', `/api/admin/puzzle/${date}`);
  
  if (!data) {
    await message.reply(`No puzzle found for ${date}.`);
    return;
  }

  await message.reply(`**🖼️ Images for ${date}**`);

  const puzzlesDir = '/opt/triangled/data/puzzles';
  const imageFiles = [];

  // Check for images: main image and option images
  const mainImg = `${puzzlesDir}/${date}.jpg`;
  if (fs.existsSync(mainImg)) {
    imageFiles.push({ path: mainImg, name: 'selected.jpg', label: 'Selected Image' });
  }

  for (let i = 1; i <= 3; i++) {
    const optImg = `${puzzlesDir}/${date}_option${i}.jpg`;
    if (fs.existsSync(optImg)) {
      imageFiles.push({ path: optImg, name: `option_${i}.jpg`, label: `Option ${i}` });
    }
  }

  if (imageFiles.length === 0) {
    await message.reply('No images found for this date.');
    return;
  }

  for (const img of imageFiles) {
    try {
      const attachment = new AttachmentBuilder(fs.readFileSync(img.path), { name: img.name });
      await message.author.send({ content: img.label, files: [attachment] });
    } catch (err) {
      console.error(`Failed to send image ${img.path}:`, err.message);
    }
  }
}

async function generatePuzzle(message, date) {
  if (!date) {
    date = new Date().toISOString().slice(0, 10);
  }

  await message.reply(`🎲 Generating puzzles for ${date}...\n(This takes 30-60 seconds)`);

  try {
    const data = await adminFetch('POST', '/api/admin/generate', { date });
    
    const lines = [
      `✅ **Generated puzzles for ${date}**`,
      '',
      `Options created: ${data.puzzleOptions?.length || 0}`,
      `Images created: ${data.imageOptions?.length || 0}`,
      ''
    ];

    if (data.puzzleOptions) {
      data.puzzleOptions.forEach((opt, i) => {
        lines.push(`${i + 1}. **${opt.theme}** — "${opt.themeHint}"`);
      });
    }

    lines.push('');
    lines.push('Use `!tg view ' + date + '` to see details');
    lines.push('Use `!tg pick ' + date + ' <1-3>` to select and approve');

    await message.reply(lines.join('\n'));

    // Send images
    await sendImages(message, date);

  } catch (err) {
    await message.reply(`❌ Generation failed: ${err.message}`);
  }
}

async function pickPuzzle(message, date, choice) {
  if (!date || !choice) {
    await message.reply('Usage: `!tg pick <date> <1-3>`\nExample: `!tg pick 2026-04-13 2`');
    return;
  }

  const puzzleChoice = parseInt(choice);
  if (isNaN(puzzleChoice) || puzzleChoice < 1 || puzzleChoice > 3) {
    await message.reply('Please choose a valid option (1-3).');
    return;
  }

  const data = await adminFetch('POST', '/api/admin/select', { 
    date, 
    puzzleChoice, 
    imageChoice: puzzleChoice 
  });

  const p = data?.puzzle;
  
  const lines = [
    `✅ **Daily Puzzle Set — ${date}**`,
    '',
    `Theme: **${p?.theme || 'N/A'}**`,
    `Hint: "${p?.themeHint || 'N/A'}"`,
    `Spangram: ||${p?.spangram || 'N/A'}||`,
    `Words: ||${p?.words?.join(', ') || 'N/A'}||`,
  ];

  if (p?.imageFile) {
    lines.push(`Image: ${p.imageFile}`);
  }

  lines.push('');
  lines.push('Status: **APPROVED** and ready to serve');

  await message.reply(lines.join('\n'));

  // Send the selected image
  if (p?.imageFile) {
    const imgPath = `/opt/triangled/data/puzzles/${p.imageFile}`;
    if (fs.existsSync(imgPath)) {
      const attachment = new AttachmentBuilder(fs.readFileSync(imgPath), { name: 'selected.jpg' });
      await message.author.send({ content: 'Selected image:', files: [attachment] });
    }
  }
}

async function setDaily(message, date) {
  if (!date) {
    await message.reply('Please specify a date: `!tg set-daily 2026-04-13`');
    return;
  }

  // The API might not have a direct "set daily" endpoint, so we approve if pending
  const data = await adminFetch('GET', `/api/admin/puzzle/${date}`);
  
  if (!data) {
    await message.reply(`No puzzle found for ${date}.`);
    return;
  }

  if (data.status === 'approved') {
    await message.reply(`✅ ${date} is already approved and will be served as the daily puzzle when that date arrives.`);
    return;
  }

  if (data.status === 'pending') {
    await adminFetch('POST', '/api/admin/approve', { date });
    await message.reply(`✅ Approved ${date}. It will be served as the daily puzzle.`);
  }
}

async function genImages(message, date) {
  if (!date) {
    await message.reply('Please specify a date: `!tg gen-images 2026-04-13`');
    return;
  }

  await message.reply(`🎨 Generating new images for ${date}...\n(This takes 30-60 seconds)`);

  // Note: This assumes there's a generate-images endpoint or we use the generate endpoint
  // If the API doesn't support this directly, we'll regenerate the whole puzzle
  try {
    // Try to get existing puzzle data first
    const existing = await adminFetch('GET', `/api/admin/puzzle/${date}`);
    
    if (!existing) {
      await message.reply(`No puzzle found for ${date}. Use \`!tg generate ${date}\` instead.`);
      return;
    }

    // Re-generate to get new images
    const data = await adminFetch('POST', '/api/admin/generate', { date });
    
    await message.reply(`✅ Generated ${data.imageOptions?.length || 0} new images for ${date}`);
    
    // Send the new images
    await sendImages(message, date);

  } catch (err) {
    await message.reply(`❌ Failed: ${err.message}`);
  }
}

async function showUnusedPuzzles(message) {
  try {
    const puzzles = await adminFetch('GET', '/api/admin/puzzles');
    const lines = ['**Triangled — Unused Puzzle Options**', ''];
    let count = 0;

    for (const p of (puzzles || [])) {
      // Fetch full puzzle data to see all options
      let detail;
      try { detail = await adminFetch('GET', `/api/admin/puzzle/${p.date}`); } catch { continue; }

      const opts = detail.puzzleOptions || [];
      const selected = detail.selectedPuzzle || 1;
      if (opts.length <= 1) continue;

      for (const o of opts) {
        if (o.index === selected) continue;
        count++;
        lines.push(`\uD83D\uDCE6 **${o.theme}** \u2014 *"${o.themeHint || ''}"*`);
        lines.push(`> Spangram: ||${o.spangram}|| | Words: ||${o.words.join(', ')}||`);
        lines.push(`> From: ${p.date} option ${o.index}`);
        lines.push('');
      }
    }

    if (count === 0) {
      lines.push('No unused puzzles. Use `!tg generate <date>` to create more.');
    } else {
      lines.push(`**${count} unused puzzle(s) available.**`);
      lines.push('These can be reused for future dates.');
    }

    // Attach all images as visible files
    const imgDir = '/opt/triangled/data/puzzles/';
    let images = [];
    try { images = fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png')); } catch {}

    const attachments = [];
    for (const f of images) {
      const fullPath = imgDir + f;
      try {
        if (fs.existsSync(fullPath)) {
          attachments.push(new AttachmentBuilder(fs.readFileSync(fullPath), { name: f }));
        }
      } catch {}
    }

    if (attachments.length > 0) {
      lines.push('');
      lines.push(`**Images (${attachments.length}):**`);
    }

    // Discord has a 10 file limit per message — split if needed
    await message.reply({ content: lines.join('\n'), files: attachments.slice(0, 10) });
    if (attachments.length > 10) {
      await message.reply({ content: '**More images:**', files: attachments.slice(10, 20) });
    }
  } catch (err) {
    await message.reply(`Error: ${err.message}`);
  }
}

async function showFullList(message) {
  try {
    const puzzles = await adminFetch('GET', '/api/admin/puzzles');
    const imgDir = '/opt/triangled/data/puzzles/';
    let images = [];
    try { images = fs.readdirSync(imgDir).filter(f => f.endsWith('.jpg') || f.endsWith('.png')); } catch {}

    const lines = ['**Triangled — Full Inventory**', ''];

    // Puzzles
    lines.push('**Puzzles:**');
    if (!puzzles || puzzles.length === 0) {
      lines.push('  None');
    } else {
      for (const p of puzzles) {
        const icon = p.status === 'approved' ? '\u2705' : '\u23F3';
        lines.push(`${icon} **${p.date}** \u2014 ${p.theme || '?'} [${p.status}]`);
      }
    }

    // Images
    lines.push('');
    lines.push(`**Images (${images.length}):**`);
    if (images.length === 0) {
      lines.push('  None');
    } else {
      images.forEach(f => lines.push(`  \uD83D\uDCCE ${f}`));
    }

    lines.push('');
    lines.push('`!tg view <date>` \u2014 details | `!tg images <date>` \u2014 see images | `!tg pick <date> <#>` \u2014 approve');

    await message.reply(lines.join('\n'));
  } catch (err) {
    await message.reply(`Error: ${err.message}`);
  }
}

async function showLibrary(message) {
  const data = await adminFetch('GET', '/api/archive');
  
  if (!data || !data.puzzles || data.puzzles.length === 0) {
    await message.reply('📚 Puzzle library is empty.');
    return;
  }

  const lines = [
    `**📚 Triangled Puzzle Library** (${data.puzzles.length} puzzles)`,
    ''
  ];

  const today = new Date().toISOString().slice(0, 10);
  
  data.puzzles.forEach(p => {
    const isLive = p.date === today ? ' ⭐ LIVE' : '';
    lines.push(`📅 ${p.date} — ${p.theme || 'Unknown'}${isLive}`);
  });

  await message.reply(lines.join('\n'));
}

function isConnected() { return socket?.connected; }
function disconnect() { if (socket) socket.disconnect(); }

module.exports = { 
  initialize, 
  isConnected, 
  disconnect,
  handleAdminCommand
};
