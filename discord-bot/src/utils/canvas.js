const { createCanvas } = require('canvas');

// ═══════════════════════════════════════════════════════════
//  THEME CONSTANTS
// ═══════════════════════════════════════════════════════════

const COLORS = {
  bgTop: '#020118',
  bgBottom: '#0a0825',
  gold: '#ffd700',
  goldDark: '#d4930d',
  white: '#ffffff',
  muted: '#8888aa',
  success: '#4ade80',
  error: '#ef4444',
  info: '#38bdf8',
  cardBg: 'rgba(255, 255, 255, 0.04)',
  border: 'rgba(255, 215, 0, 0.2)',
  borderBright: 'rgba(255, 215, 0, 0.5)',
  panelBg: 'rgba(10, 10, 30, 0.6)',
  panelBorder: 'rgba(60, 60, 120, 0.3)',
  dimText: '#666688',
  accentPurple: '#a78bfa',
  accentPink: '#f472b6',
  accentCyan: '#22d3ee',
  comboOrange: '#fb923c',
};

const RARITY_COLORS = {
  common: '#9d9d9d', uncommon: '#4fc34f', rare: '#4a9eff',
  epic: '#b44aff', legendary: '#ffab00', ultra: '#ff4444',
  aux: '#00ffcc'
};

// Representative sample items for each category (for shop overview thumbnails)
const CATEGORY_SAMPLES = {
  word_color:     { id: 'wc_crimson',   category: 'word_color',     name: 'Crimson',     rarity: 'common', cost: 10000, css: { color: '#ef4444' }, buff: { type: 'tap_boost', value: 0.01, label: '+1% Tap Power' } },
  word_glow:      { id: 'wg_electric',  category: 'word_glow',      name: 'Electric Blue', rarity: 'uncommon', cost: 750000, css: { textShadow: '0 0 8px rgba(0,150,255,0.6), 0 0 16px rgba(0,150,255,0.3)' }, buff: { type: 'word_game_boost', value: 0.05, label: '+5% Word Game Money' } },
  profile_border: { id: 'pb_gold',      category: 'profile_border', name: 'Gold Ring',   rarity: 'uncommon', cost: 750000, css: { border: '2px solid #ffd700' }, buff: { type: 'biz_boost', value: 0.03, label: '+3% Biz Income' } },
  profile_glow:   { id: 'pg_blue_aura', category: 'profile_glow',   name: 'Blue Aura',   rarity: 'uncommon', cost: 1000000, css: { boxShadow: '0 0 10px rgba(59,130,246,0.5), 0 0 20px rgba(59,130,246,0.2)' }, buff: { type: 'offline_boost', value: 0.10, label: '+10% Offline Income' } },
  name_glow:      { id: 'ng_electric',  category: 'name_glow',      name: 'Electric Blue', rarity: 'uncommon', cost: 750000, css: { textShadow: '0 0 8px rgba(0,150,255,0.6), 0 0 16px rgba(0,150,255,0.3)' }, buff: { type: 'combo_boost', value: 0.10, label: '+10% Combo Max' } },
  name_color:     { id: 'nc_rose',      category: 'name_color',     name: 'Rose',        rarity: 'common', cost: 10000, css: { color: '#fb7185' }, buff: { type: 'coin_bonus', value: 0.005, label: '+0.5% All Coins' } },
  title:          { id: 'tt_champion',  category: 'title',          name: 'Champion',    rarity: 'rare', cost: 35000000, css: { title: 'Champion', titleColor: '#fbbf24' }, buff: { type: 'prestige', value: 0.05, label: '+5% All Income' } },
  win_effect:     { id: 'we_confetti',  category: 'win_effect',     name: 'Confetti',    rarity: 'common', cost: 25000, css: { effect: 'confetti', colors: ['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff'], particleCount: 80 }, buff: { type: 'lucky_bonus', value: 0.01, label: '+1% Lucky 2x' } },
};

const CMD_LABELS = {
  '!tap': 'TAP', '!taps': 'STATS', '!coins': 'COINS', '!empire': 'EMPIRE',
  '!buy': 'BUY', '!upgrade': 'UPGRADE', '!combo': 'COMBO', '!shop': 'SHOP',
  '!cosmetics': 'SHOP', '!buyc': 'COSMETIC', '!equip': 'EQUIP',
  '!unequip': 'UNEQUIP', '!mycos': 'COSMETICS', '!help': 'HELP',
  '!verify': 'VERIFY'
};

// ═══════════════════════════════════════════════════════════
//  SHARED DRAWING HELPERS
// ═══════════════════════════════════════════════════════════

// Seeded random for consistent decorative elements
let _seed = 42;
function seededRandom() {
  _seed = (_seed * 16807 + 0) % 2147483647;
  return (_seed - 1) / 2147483646;
}
function resetSeed(s) { _seed = s || 42; }

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function drawBackground(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, COLORS.bgTop);
  grad.addColorStop(1, COLORS.bgBottom);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
  // Subtle border
  roundRect(ctx, 2, 2, w - 4, h - 4, 12);
  ctx.strokeStyle = COLORS.border;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawTitle(ctx, text, x, y, fontSize) {
  ctx.font = `bold ${fontSize || 28}px Arial`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const grad = ctx.createLinearGradient(x - 100, y, x + 100, y);
  grad.addColorStop(0, COLORS.goldDark);
  grad.addColorStop(0.3, COLORS.gold);
  grad.addColorStop(0.5, '#ffed4a');
  grad.addColorStop(0.7, COLORS.gold);
  grad.addColorStop(1, COLORS.goldDark);
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);
}

function wrapText(ctx, text, maxWidth) {
  const words = text.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ─── New Decorative Helpers ─────────────────────────────

function drawStars(ctx, w, h, count) {
  resetSeed(w * h);
  for (let i = 0; i < (count || 12); i++) {
    const sx = seededRandom() * w;
    const sy = seededRandom() * h * 0.6;
    const sr = seededRandom() * 1.3 + 0.3;
    const so = seededRandom() * 0.4 + 0.15;
    ctx.beginPath();
    ctx.arc(sx, sy, sr, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255, 255, 255, ${so})`;
    ctx.fill();
  }
}

function drawSkyline(ctx, baseY, w, height, opacity) {
  resetSeed(w + 7);
  const h = height || 50;
  const op = opacity || 0.4;
  const buildingCount = Math.floor(w / 30);
  for (let i = 0; i < buildingCount; i++) {
    const bx = i * (w / buildingCount) + seededRandom() * 6 - 3;
    const bw = 14 + seededRandom() * 22;
    const bh = 15 + seededRandom() * (h - 15);
    const by = baseY - bh;
    // Building body
    ctx.fillStyle = `rgba(10, 10, 30, ${op})`;
    ctx.fillRect(bx, by, bw, bh + 4);
    // Edge highlight
    ctx.fillStyle = `rgba(255, 255, 255, ${op * 0.06})`;
    ctx.fillRect(bx, by, 1, bh);
    // Windows
    const winSize = 2;
    const cols = Math.floor(bw / 7);
    const rows = Math.floor(bh / 8);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (seededRandom() > 0.45) continue;
        const wx = bx + 3 + c * 7;
        const wy = by + 4 + r * 8;
        const warm = seededRandom() > 0.5;
        ctx.fillStyle = warm
          ? `rgba(255, 210, 100, ${op * 0.6})`
          : `rgba(180, 210, 255, ${op * 0.4})`;
        ctx.fillRect(wx, wy, winSize, winSize + 1);
      }
    }
    // Occasional spire
    if (bh > h * 0.6 && seededRandom() > 0.6) {
      ctx.beginPath();
      ctx.moveTo(bx + bw / 2, by - 10);
      ctx.lineTo(bx + bw / 2 - 3, by);
      ctx.lineTo(bx + bw / 2 + 3, by);
      ctx.closePath();
      ctx.fillStyle = `rgba(20, 20, 50, ${op})`;
      ctx.fill();
      // Antenna light
      ctx.beginPath();
      ctx.arc(bx + bw / 2, by - 10, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 50, 50, ${op * 0.7})`;
      ctx.fill();
    }
  }
}

function drawCoinIcon(ctx, x, y, size) {
  // Outer circle
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  const coinGrad = ctx.createRadialGradient(x - size * 0.2, y - size * 0.2, 0, x, y, size);
  coinGrad.addColorStop(0, '#ffed4a');
  coinGrad.addColorStop(0.6, COLORS.gold);
  coinGrad.addColorStop(1, COLORS.goldDark);
  ctx.fillStyle = coinGrad;
  ctx.fill();
  // Inner ring
  ctx.beginPath();
  ctx.arc(x, y, size * 0.72, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(180, 130, 10, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  // $ symbol
  ctx.font = `bold ${Math.round(size * 1.1)}px Arial`;
  ctx.fillStyle = 'rgba(140, 100, 0, 0.7)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('$', x, y + 1);
}

function drawCoinGlow(ctx, x, y, size) {
  const glow = ctx.createRadialGradient(x, y, size * 0.5, x, y, size * 3);
  glow.addColorStop(0, 'rgba(255, 215, 0, 0.15)');
  glow.addColorStop(0.5, 'rgba(255, 200, 50, 0.05)');
  glow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(x - size * 3, y - size * 3, size * 6, size * 6);
}

function drawProgressBar(ctx, x, y, w, h, progress, color1, color2) {
  // Background track
  roundRect(ctx, x, y, w, h, h / 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();
  // Filled portion
  const fillW = Math.max(h, w * Math.min(1, Math.max(0, progress)));
  roundRect(ctx, x, y, fillW, h, h / 2);
  const grad = ctx.createLinearGradient(x, 0, x + fillW, 0);
  grad.addColorStop(0, color1 || COLORS.gold);
  grad.addColorStop(1, color2 || '#ffed4a');
  ctx.fillStyle = grad;
  ctx.fill();
}

function drawPanel(ctx, x, y, w, h, r) {
  roundRect(ctx, x, y, w, h, r || 8);
  ctx.fillStyle = COLORS.panelBg;
  ctx.fill();
  ctx.strokeStyle = COLORS.panelBorder;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawGoldDivider(ctx, x, y, w) {
  const grad = ctx.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, 'rgba(255, 215, 0, 0)');
  grad.addColorStop(0.2, 'rgba(255, 215, 0, 0.4)');
  grad.addColorStop(0.5, 'rgba(255, 215, 0, 0.6)');
  grad.addColorStop(0.8, 'rgba(255, 215, 0, 0.4)');
  grad.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.strokeStyle = grad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x + w, y);
  ctx.stroke();
}

function drawPlayerHeader(ctx, displayName, cmdLabel, accentColor, w) {
  // Accent bar at top
  ctx.fillStyle = accentColor;
  ctx.fillRect(3, 3, w - 6, 3);

  // Command badge
  ctx.font = 'bold 11px Arial';
  const badgeW = ctx.measureText(cmdLabel).width + 20;
  roundRect(ctx, 20, 18, badgeW, 24, 12);
  ctx.fillStyle = accentColor + '20';
  ctx.fill();
  ctx.strokeStyle = accentColor + '60';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = accentColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(cmdLabel, 20 + badgeW / 2, 30);

  // Player name
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(displayName, 20 + badgeW + 12, 21);

  return 50; // header height
}

function drawFooter(ctx, w, h) {
  ctx.font = '10px Arial';
  ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'bottom';
  ctx.fillText('Word Tycoon — Livestream Tycoon Clicker', w / 2, h - 8);
}

function drawHintBox(ctx, text, centerX, y, color, subtext) {
  ctx.font = 'bold 12px Arial';
  const tw = ctx.measureText(text).width + 24;
  const boxH = subtext ? 42 : 28;
  roundRect(ctx, centerX - tw / 2, y, tw, boxH, 6);
  ctx.fillStyle = (color || COLORS.info) + '12';
  ctx.fill();
  ctx.strokeStyle = (color || COLORS.info) + '40';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = color || COLORS.info;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(text, centerX, y + (subtext ? 5 : 7));
  if (subtext) {
    ctx.font = '10px Arial';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(subtext, centerX, y + 23);
  }
}

function drawStatusIcon(ctx, x, y, size, ok) {
  ctx.beginPath();
  ctx.arc(x, y, size, 0, Math.PI * 2);
  ctx.fillStyle = ok ? COLORS.success + '30' : COLORS.error + '30';
  ctx.fill();
  ctx.strokeStyle = ok ? COLORS.success : COLORS.error;
  ctx.lineWidth = 2;
  ctx.stroke();
  // Checkmark or X
  ctx.strokeStyle = ok ? COLORS.success : COLORS.error;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  if (ok) {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.4, y);
    ctx.lineTo(x - size * 0.1, y + size * 0.35);
    ctx.lineTo(x + size * 0.45, y - size * 0.3);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(x - size * 0.3, y - size * 0.3);
    ctx.lineTo(x + size * 0.3, y + size * 0.3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + size * 0.3, y - size * 0.3);
    ctx.lineTo(x - size * 0.3, y + size * 0.3);
    ctx.stroke();
  }
  ctx.lineCap = 'butt';
}

/** Split game server pipe-separated responses into segments */
function splitSegments(message) {
  return (message || '').split(' | ').map(s => s.trim()).filter(Boolean);
}

// ═══════════════════════════════════════════════════════════
//  WELCOME CARD (/play)
// ═══════════════════════════════════════════════════════════

function generateWelcomeCard(displayName) {
  const W = 600, H = 420;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 20);

  // Title
  drawTitle(ctx, 'WORD TYCOON', W / 2, 20, 38);

  // Decorative line
  drawGoldDivider(ctx, W / 2 - 120, 66, 240);

  // Welcome text
  ctx.font = '16px Arial';
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText(`Welcome, ${displayName}!`, W / 2, 80);

  // Tagline
  ctx.font = '13px Arial';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('Build your empire, collect cosmetics, and compete on the leaderboard!', W / 2, 102);

  // Getting Started Steps
  const steps = [
    { num: '1', title: 'Start Playing', desc: 'Type !play to get your free Library', color: COLORS.success },
    { num: '2', title: 'Link Account', desc: 'Use /link to connect your livestream account', color: '#5865F2' },
    { num: '3', title: 'Build Empire', desc: 'Use !buy to grow your business empire', color: COLORS.gold },
    { num: '4', title: 'Get Help', desc: 'Type !help to see all commands', color: COLORS.accentCyan }
  ];

  const stepsY = 124;
  const stepH = 42;
  const stepsPanel = steps.length * stepH + 12;
  drawPanel(ctx, 24, stepsY, W - 48, stepsPanel, 10);

  ctx.font = 'bold 10px Arial';
  ctx.fillStyle = COLORS.dimText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('HOW TO PLAY', 40, stepsY + 2);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const sy = stepsY + 18 + i * stepH;

    // Numbered circle
    ctx.beginPath();
    ctx.arc(52, sy + 12, 12, 0, Math.PI * 2);
    ctx.fillStyle = step.color + '18';
    ctx.fill();
    ctx.strokeStyle = step.color + '50';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = step.color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(step.num, 52, sy + 12);

    // Title
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(step.title, 74, sy + 1);

    // Description
    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(step.desc, 74, sy + 19);
  }

  // CTA box
  const ctaY = stepsY + stepsPanel + 14;
  roundRect(ctx, 100, ctaY, W - 200, 46, 10);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.08)';
  ctx.fill();
  ctx.strokeStyle = COLORS.borderBright;
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = 'bold 15px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Type !play to start, then /link to connect!', W / 2, ctaY + 8);
  ctx.font = '11px Arial';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('Link your livestream account to sync progress across platforms', W / 2, ctaY + 28);

  // Skyline + footer
  drawSkyline(ctx, H - 18, W, 35, 0.25);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  LINK CODE CARD (/link)
// ═══════════════════════════════════════════════════════════

function generateLinkCodeCard(displayName, code) {
  const W = 600, H = 300;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 12);

  // Title
  ctx.font = 'bold 20px Arial';
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Link Your Account', W / 2, 20);

  // Code glow
  drawCoinGlow(ctx, W / 2, 100, 30);

  // Code display box
  roundRect(ctx, 150, 60, W - 300, 80, 12);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.06)';
  ctx.fill();
  ctx.strokeStyle = COLORS.borderBright;
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.font = 'bold 52px Arial';
  const codeGrad = ctx.createLinearGradient(W / 2 - 80, 70, W / 2 + 80, 130);
  codeGrad.addColorStop(0, COLORS.gold);
  codeGrad.addColorStop(0.5, '#ffed4a');
  codeGrad.addColorStop(1, COLORS.gold);
  ctx.fillStyle = codeGrad;
  ctx.fillText(code, W / 2, 72);

  // Instructions
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = COLORS.white;
  ctx.fillText('Type this in the livestream chat:', W / 2, 160);

  // Command box
  roundRect(ctx, 150, 186, W - 300, 40, 8);
  ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = 'bold 20px Arial';
  ctx.fillStyle = COLORS.info;
  ctx.fillText(`/verify ${code}`, W / 2, 194);

  // Expiry
  ctx.font = '13px Arial';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('This code expires in 10 minutes', W / 2, 242);
  ctx.fillText(`${displayName} — YouTube or TikTok livestream chat`, W / 2, 262);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  LINK SUCCESS CARD
// ═══════════════════════════════════════════════════════════

function generateLinkSuccessCard(displayName, platform, platformName) {
  const W = 600, H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 10);

  // Green accent bar
  ctx.fillStyle = COLORS.success;
  ctx.fillRect(3, 3, W - 6, 3);

  // Success icon + title
  drawStatusIcon(ctx, W / 2 - 90, 42, 12, true);
  ctx.font = 'bold 24px Arial';
  ctx.fillStyle = COLORS.success;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Account Linked!', W / 2 + 2, 28);

  // Details
  ctx.font = '16px Arial';
  ctx.fillStyle = COLORS.white;
  ctx.fillText(`${displayName}, your account has been linked.`, W / 2, 68);

  const platformLabel = (platform || 'unknown').charAt(0).toUpperCase() + (platform || 'unknown').slice(1);
  ctx.font = '14px Arial';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText(`${platformLabel} account: ${platformName}`, W / 2, 98);
  ctx.fillText('Your stats have been merged. You can now use all game commands!', W / 2, 126);

  // Commands hint
  roundRect(ctx, 120, 154, W - 240, 36, 8);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.06)';
  ctx.fill();
  ctx.font = 'bold 13px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.fillText('Try /tap  /empire  /coins  /buy  /leaderboard', W / 2, 162);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  GATE CARD (not linked)
// ═══════════════════════════════════════════════════════════

function generateGateCard() {
  const W = 600, H = 180;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 8);

  // Gold accent bar
  ctx.fillStyle = COLORS.gold;
  ctx.fillRect(3, 3, W - 6, 3);

  ctx.font = 'bold 22px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Account Link Required', W / 2, 28);

  ctx.font = '15px Arial';
  ctx.fillStyle = COLORS.white;
  ctx.fillText('You need to link your TikTok or YouTube account first.', W / 2, 68);

  ctx.font = '14px Arial';
  ctx.fillStyle = COLORS.muted;
  ctx.fillText('This verifies you\'re part of the livestream community.', W / 2, 96);

  // CTA
  drawHintBox(ctx, 'Use /link to get started', W / 2, 126, COLORS.info, 'Link your TikTok or YouTube account');

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  TAP CARD (!tap)
// ═══════════════════════════════════════════════════════════

function generateTapCard(displayName, message, ok) {
  const W = 500, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 10);

  const accentColor = ok !== false ? COLORS.gold : COLORS.error;
  drawPlayerHeader(ctx, displayName, 'TAP', accentColor, W);

  if (ok !== false) {
    // Coin glow behind icon
    drawCoinGlow(ctx, 60, 105, 20);
    drawCoinIcon(ctx, 60, 105, 20);

    // Response text
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(message || 'Tap!', 100, 100);

    // Subtle sparkle particles
    resetSeed(Date.now() % 10000);
    for (let i = 0; i < 5; i++) {
      const sx = 30 + seededRandom() * 60;
      const sy = 80 + seededRandom() * 50;
      ctx.beginPath();
      ctx.arc(sx, sy, 1 + seededRandom() * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 215, 0, ${0.1 + seededRandom() * 0.15})`;
      ctx.fill();
    }

    // Subtle tip text
    ctx.font = '10px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Keep tapping to build combos! Use !upgrade to boost power', W / 2, H - 22);
  } else {
    // Error state
    ctx.font = '15px Arial';
    ctx.fillStyle = COLORS.error;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(message || 'Error', 30, 105);
  }

  drawSkyline(ctx, H - 16, W, 30, 0.2);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  STATS CARD (!taps)
// ═══════════════════════════════════════════════════════════

function generateStatsCard(displayName, message, ok) {
  const segments = splitSegments(message);
  // First segment usually includes "PlayerName: X taps | Power: 5x | ..."
  // Remove player name prefix if present
  const firstSeg = segments[0] || '';
  const colonIdx = firstSeg.indexOf(': ');
  const cleanSegments = [...segments];
  if (colonIdx > 0 && colonIdx < 30) {
    cleanSegments[0] = firstSeg.substring(colonIdx + 2);
  }

  const rowCount = Math.max(cleanSegments.length, 1);
  const H = Math.max(180, 60 + rowCount * 34 + 60);
  const W = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 14);

  const headerH = drawPlayerHeader(ctx, displayName, 'STATS', COLORS.gold, W);
  drawGoldDivider(ctx, 40, headerH + 2, W - 80);

  // Stat rows in a panel
  const panelY = headerH + 12;
  const panelH = rowCount * 34 + 16;
  drawPanel(ctx, 20, panelY, W - 40, panelH, 10);

  const statDotColors = [COLORS.gold, COLORS.accentPurple, COLORS.error, COLORS.accentCyan, COLORS.comboOrange];

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';

  for (let i = 0; i < cleanSegments.length; i++) {
    const rowY = panelY + 22 + i * 34;
    const dotColor = statDotColors[i % statDotColors.length];

    // Colored dot
    ctx.beginPath();
    ctx.arc(38, rowY, 4, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    // Check if this is a combo or buff line
    const isCombo = cleanSegments[i].toLowerCase().includes('combo');
    const isBuff = cleanSegments[i].toLowerCase().startsWith('buffs:');

    ctx.font = (isCombo || isBuff) ? 'bold 15px Arial' : '15px Arial';
    ctx.fillStyle = isBuff ? COLORS.accentCyan : (isCombo ? COLORS.comboOrange : COLORS.white);
    ctx.fillText(cleanSegments[i], 52, rowY);
  }

  drawSkyline(ctx, H - 16, W, 40, 0.25);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  COINS CARD (!coins)
// ═══════════════════════════════════════════════════════════

function generateCoinsCard(displayName, message, ok) {
  const W = 500, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 12);

  // Gold shimmer overlay
  const shimmer = ctx.createLinearGradient(0, 0, W, 0);
  shimmer.addColorStop(0, 'rgba(255, 215, 0, 0)');
  shimmer.addColorStop(0.5, 'rgba(255, 215, 0, 0.03)');
  shimmer.addColorStop(1, 'rgba(255, 215, 0, 0)');
  ctx.fillStyle = shimmer;
  ctx.fillRect(0, 0, W, H);

  drawPlayerHeader(ctx, displayName, 'COINS', COLORS.gold, W);

  // Large coin icon
  drawCoinGlow(ctx, 65, 115, 28);
  drawCoinIcon(ctx, 65, 115, 28);

  // Extract balance from message (format: "Name: X coins | Buffs: ...")
  const balanceText = message || '0 coins';
  const colonIdx = balanceText.indexOf(': ');
  const afterName = colonIdx > 0 ? balanceText.substring(colonIdx + 2) : balanceText;

  // Separate balance from buff info
  const buffSepIdx = afterName.indexOf(' | Buffs: ');
  const balance = buffSepIdx > 0 ? afterName.substring(0, buffSepIdx) : afterName;
  const buffInfo = buffSepIdx > 0 ? afterName.substring(buffSepIdx + 3) : null;

  ctx.font = 'bold 24px Arial';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  const balGrad = ctx.createLinearGradient(110, 105, 400, 105);
  balGrad.addColorStop(0, COLORS.gold);
  balGrad.addColorStop(0.5, '#ffed4a');
  balGrad.addColorStop(1, COLORS.gold);
  ctx.fillStyle = balGrad;
  ctx.fillText(balance, 110, buffInfo ? 100 : 110);

  // Draw buff info line if present
  if (buffInfo) {
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = COLORS.accentCyan;
    ctx.fillText(buffInfo, 110, 128);
  }

  drawGoldDivider(ctx, 50, 148, W - 100);
  drawSkyline(ctx, H - 16, W, 30, 0.2);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  EMPIRE CARD (!empire)
// ═══════════════════════════════════════════════════════════

function generateEmpireCard(displayName, message, ok) {
  const segments = splitSegments(message);

  // If no businesses or short message
  if (segments.length <= 2) {
    return _generateSimpleResponseCard(displayName, 'EMPIRE', COLORS.gold, message, ok, '!play to start your empire');
  }

  // First segment = coins + income summary, last may be a hint
  const header = segments[0];
  const businessLines = segments.slice(1);

  const rowH = 30;
  const H = Math.min(600, 120 + businessLines.length * rowH + 70);
  const W = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 16);

  const headerH = drawPlayerHeader(ctx, displayName, 'EMPIRE', COLORS.gold, W);

  // Sub-header (coins + income)
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(header, 24, headerH + 4);

  drawGoldDivider(ctx, 20, headerH + 24, W - 40);

  // Business rows in panel
  const panelY = headerH + 32;
  const panelH = businessLines.length * rowH + 12;
  drawPanel(ctx, 16, panelY, W - 32, panelH, 10);

  ctx.textBaseline = 'middle';
  for (let i = 0; i < businessLines.length; i++) {
    const rowY = panelY + 16 + i * rowH;

    // Alternating subtle tint
    if (i % 2 === 0) {
      roundRect(ctx, 18, rowY - 12, W - 36, rowH - 2, 4);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fill();
    }

    ctx.font = '14px Arial';
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'left';
    ctx.fillText(businessLines[i], 32, rowY);
  }

  // Taller skyline for empire
  drawSkyline(ctx, H - 16, W, 55, 0.35);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  BUY LIST CARD (!buy with no args)
// ═══════════════════════════════════════════════════════════

function generateBuyListCard(displayName, message, ok) {
  const segments = splitSegments(message);

  // First segment = coins, last = "!buy [name]"
  const header = segments[0] || '';
  const hint = segments[segments.length - 1] || '';
  const isHint = hint.startsWith('!');
  const businessLines = isHint ? segments.slice(1, -1) : segments.slice(1);

  const rowH = 30;
  const H = Math.min(600, 120 + businessLines.length * rowH + 70);
  const W = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 14);

  const headerH = drawPlayerHeader(ctx, displayName, 'BUY', COLORS.gold, W);

  // Coin balance sub-header
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(header, 24, headerH + 4);

  drawGoldDivider(ctx, 20, headerH + 24, W - 40);

  // Business rows
  const panelY = headerH + 32;
  const panelH = businessLines.length * rowH + 12;
  drawPanel(ctx, 16, panelY, W - 32, panelH, 10);

  ctx.textBaseline = 'middle';
  for (let i = 0; i < businessLines.length; i++) {
    const rowY = panelY + 16 + i * rowH;

    if (i % 2 === 0) {
      roundRect(ctx, 18, rowY - 12, W - 36, rowH - 2, 4);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.02)';
      ctx.fill();
    }

    // Highlight earnings in green, costs in gold
    const line = businessLines[i];
    const earnMatch = line.match(/\[([^\]]+)\]/);
    const costMatch = line.match(/\(([^)]+)\)$/);
    let x = 32;
    ctx.textAlign = 'left';

    if (earnMatch) {
      const beforeEarn = line.substring(0, line.indexOf('['));
      const earnText = earnMatch[0];
      const afterEarn = line.substring(line.indexOf(']') + 1);

      // Part before earnings
      ctx.font = '14px Arial';
      ctx.fillStyle = COLORS.white;
      ctx.fillText(beforeEarn, x, rowY);
      x += ctx.measureText(beforeEarn).width;

      // Earnings in green
      ctx.font = 'bold 13px Arial';
      ctx.fillStyle = COLORS.success;
      ctx.fillText(earnText, x, rowY);
      x += ctx.measureText(earnText).width;

      // Part after earnings (may contain cost)
      const costMatch2 = afterEarn.match(/\(([^)]+)\)$/);
      if (costMatch2) {
        const beforeCost = afterEarn.substring(0, afterEarn.lastIndexOf('('));
        const cost = costMatch2[0];
        ctx.font = '14px Arial';
        ctx.fillStyle = COLORS.white;
        ctx.fillText(beforeCost, x, rowY);
        x += ctx.measureText(beforeCost).width;
        ctx.fillStyle = COLORS.gold;
        ctx.font = 'bold 14px Arial';
        ctx.fillText(cost, x, rowY);
      } else {
        ctx.font = '14px Arial';
        ctx.fillStyle = COLORS.white;
        ctx.fillText(afterEarn, x, rowY);
      }
    } else if (costMatch) {
      const beforeCost = line.substring(0, line.lastIndexOf('('));
      const cost = costMatch[0];
      ctx.font = '14px Arial';
      ctx.fillStyle = COLORS.white;
      ctx.fillText(beforeCost, x, rowY);
      x += ctx.measureText(beforeCost).width;
      ctx.fillStyle = COLORS.gold;
      ctx.font = 'bold 14px Arial';
      ctx.fillText(cost, x, rowY);
    } else {
      ctx.font = '14px Arial';
      ctx.fillStyle = COLORS.white;
      ctx.fillText(line, x, rowY);
    }
  }

  // Hint box
  if (isHint) {
    drawHintBox(ctx, hint, W / 2, H - 58, COLORS.info, 'Businesses earn coins automatically!');
  }

  drawSkyline(ctx, H - 16, W, 45, 0.3);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  BUY CARD (!buy [name] / !buyc [name]) — purchase result
// ═══════════════════════════════════════════════════════════

function generateBuyCard(displayName, command, message, ok, extraData) {
  const isCosmetic = command === '!buyc';
  const itemData = extraData?.itemData || null;

  // Rich visual card for successful cosmetic purchase
  if (isCosmetic && ok !== false && itemData) {
    return _generateCosmeticPurchaseCard(displayName, message, itemData);
  }

  // Fallback: simple text card for !buy, errors, or missing itemData
  const W = 550, H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 10);

  const label = isCosmetic ? 'COSMETIC' : 'BUY';
  const accentColor = ok !== false ? COLORS.success : COLORS.error;

  drawPlayerHeader(ctx, displayName, label, accentColor, W);

  // Status icon
  drawStatusIcon(ctx, 50, 100, 16, ok !== false);

  // Message text
  ctx.font = '15px Arial';
  ctx.fillStyle = ok !== false ? COLORS.white : COLORS.error;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const msgLines = wrapText(ctx, message || '', W - 120);
  let msgY = 86;
  for (const line of msgLines) {
    ctx.fillText(line, 80, msgY);
    msgY += 22;
  }

  // Hint
  const hint = isCosmetic
    ? 'Auto-equipped! Use !mycos to see all cosmetics'
    : 'Use !empire to view your businesses';
  const sub = isCosmetic
    ? 'Check !mycos to see all your cosmetics'
    : 'Businesses earn coins even while offline!';
  drawHintBox(ctx, hint, W / 2, H - 60, COLORS.muted, sub);

  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/** Rich cosmetic purchase card with visual preview */
function _generateCosmeticPurchaseCard(displayName, message, itemData) {
  const W = 600, H = (itemData.buff || itemData.buffs) ? 370 : 340;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);

  // Subtle success gradient overlay
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, 'rgba(74, 222, 128, 0.04)');
  grad.addColorStop(1, 'rgba(34, 211, 238, 0.04)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  drawStars(ctx, W, H, 14);

  const rarityColor = RARITY_COLORS[itemData.rarity] || COLORS.muted;
  const headerH = drawPlayerHeader(ctx, displayName, 'PURCHASED', COLORS.success, W);

  // ─── Visual Preview Area ───────────────────────────
  const previewX = 24, previewY = headerH + 8;
  const previewW = W - 48, previewH = 110;
  drawCosmeticPreview(ctx, itemData, displayName, previewX, previewY, previewW, previewH);

  // ─── Item Info Row ─────────────────────────────────
  const infoY = previewY + previewH + 14;

  // Cosmetic name (left)
  ctx.font = 'bold 18px Arial';
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(itemData.name, 28, infoY);

  // Rarity badge (right of name)
  const rarityLabel = (itemData.rarity || 'common').toUpperCase();
  const nameActualW = ctx.measureText(itemData.name).width;
  const badgeX = 28 + nameActualW + 10;
  ctx.font = 'bold 10px Arial';
  const rarityW = ctx.measureText(rarityLabel).width + 14;
  roundRect(ctx, badgeX, infoY + 3, rarityW, 18, 9);
  ctx.fillStyle = rarityColor + '25';
  ctx.fill();
  ctx.strokeStyle = rarityColor + '60';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = rarityColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rarityLabel, badgeX + rarityW / 2, infoY + 12);

  // Cost (right side)
  const costStr = formatCoinAmount(itemData.cost || 0);
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(costStr, W - 28, infoY);

  // Category label
  const CATEGORY_LABELS = {
    word_color: 'Word Color', word_glow: 'Word Glow', profile_border: 'Profile Border',
    profile_glow: 'Profile Glow', name_glow: 'Name Glow', name_color: 'Name Color',
    title: 'Title', win_effect: 'Win Effect'
  };
  ctx.font = '12px Arial';
  ctx.fillStyle = COLORS.dimText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(CATEGORY_LABELS[itemData.category] || itemData.category, 28, infoY + 24);

  // ─── Buff Badge ──────────────────────────────────
  let buffEndY = infoY + 40;
  if (itemData.buff || itemData.buffs) {
    const buffY = infoY + 44;
    ctx.font = 'bold 12px Arial';
    const buffText = itemData.buffs ? itemData.buffs.map(b => b.label).join(' + ') : itemData.buff.label;
    const buffTextW = ctx.measureText(buffText).width + 16;

    roundRect(ctx, 28, buffY, buffTextW, 20, 10);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.accentCyan;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(buffText, 36, buffY + 10);

    ctx.font = '10px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText('when equipped', 36 + buffTextW + 4, buffY + 10);
    buffEndY = buffY + 28;
  }

  // ─── Success checkmark + equip hint ──────────────
  drawHintBox(ctx, 'Auto-equipped! Buff now active', W / 2, H - 56, COLORS.success, 'Equipped cosmetics give gameplay buffs!');

  drawSkyline(ctx, H - 16, W, 30, 0.2);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  UPGRADE CARD (!upgrade)
// ═══════════════════════════════════════════════════════════

function generateUpgradeCard(displayName, command, message, ok) {
  const segments = splitSegments(message);
  const isFullList = segments.length >= 3;

  if (!isFullList) {
    // Single upgrade confirmation
    return _generateSimpleResponseCard(displayName, 'UPGRADE', COLORS.accentPurple, message, ok, '!upgrade [tap|crit|multi]');
  }

  // Full upgrade list
  const header = segments[0] || '';
  const hint = segments[segments.length - 1] || '';
  const isHint = hint.startsWith('!');
  const upgradeLines = isHint ? segments.slice(1, -1) : segments.slice(1);

  const H = 250;
  const W = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 12);

  const headerH = drawPlayerHeader(ctx, displayName, 'UPGRADE', COLORS.accentPurple, W);

  // Coin balance
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(header, 24, headerH + 4);

  drawGoldDivider(ctx, 20, headerH + 24, W - 40);

  // Upgrade rows with colored dots
  const upgradeDotColors = [COLORS.gold, COLORS.error, COLORS.accentPurple];
  const panelY = headerH + 32;
  const rowH = 36;
  const panelH = upgradeLines.length * rowH + 12;
  drawPanel(ctx, 16, panelY, W - 32, panelH, 10);

  ctx.textBaseline = 'middle';
  for (let i = 0; i < upgradeLines.length; i++) {
    const rowY = panelY + 20 + i * rowH;
    const dotColor = upgradeDotColors[i % upgradeDotColors.length];

    // Colored dot
    ctx.beginPath();
    ctx.arc(38, rowY, 5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    // Upgrade text
    ctx.font = '15px Arial';
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'left';
    ctx.fillText(upgradeLines[i], 54, rowY);

    // Extract cost and highlight it
    const costMatch = upgradeLines[i].match(/\(([^)]+)\)/);
    if (costMatch) {
      const idx = upgradeLines[i].indexOf(costMatch[0]);
      const before = upgradeLines[i].substring(0, idx);
      ctx.font = '15px Arial';
      const bw = ctx.measureText(before).width;
      ctx.fillStyle = COLORS.gold;
      ctx.font = 'bold 15px Arial';
      ctx.fillText(costMatch[0], 54 + bw, rowY);
    }
  }

  // Hint
  if (isHint) {
    drawHintBox(ctx, hint, W / 2, H - 56, COLORS.accentPurple, 'Higher taps + crits = more coins per tap!');
  }

  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  COMBO CARD (!combo)
// ═══════════════════════════════════════════════════════════

function generateComboCard(displayName, message, ok) {
  const W = 500, H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);

  // Warm orange tint overlay
  ctx.fillStyle = 'rgba(251, 146, 60, 0.03)';
  ctx.fillRect(0, 0, W, H);

  drawStars(ctx, W, H, 8);
  drawPlayerHeader(ctx, displayName, 'COMBO', COLORS.comboOrange, W);

  const hasCombo = message && !message.toLowerCase().includes('no active combo');

  if (hasCombo) {
    // Response text
    const colonIdx = (message || '').indexOf(': ');
    const cleanMsg = colonIdx > 0 ? message.substring(colonIdx + 2) : message;

    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(cleanMsg.split(' | ')[0] || '', W / 2, 58);

    // Decorative combo progress bar
    const barY = 100;
    drawProgressBar(ctx, 50, barY, W - 100, 14, 0.5, COLORS.comboOrange, COLORS.error);

    // Labels
    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('1.0x', 50, barY + 20);
    ctx.textAlign = 'right';
    ctx.fillText('2.0x', W - 50, barY + 20);

    // Multiplier centered
    const multMatch = (message || '').match(/(\d+\.\d+)x/);
    if (multMatch) {
      ctx.font = 'bold 20px Arial';
      ctx.fillStyle = COLORS.comboOrange;
      ctx.textAlign = 'center';
      ctx.fillText(`${multMatch[1]}x`, W / 2, barY + 22);
    }

    // Sub-info
    const subInfo = cleanMsg.split(' | ')[1] || '';
    if (subInfo) {
      ctx.font = '13px Arial';
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.fillText(subInfo, W / 2, 155);
    }
  } else {
    // No active combo
    ctx.font = '16px Arial';
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No active combo', W / 2, 90);

    ctx.font = '14px Arial';
    ctx.fillText('Keep tapping to build one!', W / 2, 115);

    // Empty progress bar
    drawProgressBar(ctx, 80, 140, W - 160, 10, 0, COLORS.comboOrange, COLORS.error);

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.textAlign = 'left';
    ctx.fillText('1.0x', 80, 156);
    ctx.textAlign = 'right';
    ctx.fillText('2.0x', W - 80, 156);
  }

  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  STREAK CARD (!streak)
// ═══════════════════════════════════════════════════════════

function generateStreakCard(displayName, message, ok) {
  const W = 500, H = 220;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);

  // Warm amber tint overlay
  ctx.fillStyle = 'rgba(251, 191, 60, 0.03)';
  ctx.fillRect(0, 0, W, H);

  drawStars(ctx, W, H, 8);
  drawPlayerHeader(ctx, displayName, 'STREAK', COLORS.gold, W);

  const hasStreak = message && !message.toLowerCase().includes('only available for');

  if (hasStreak) {
    const colonIdx = (message || '').indexOf(': ');
    const cleanMsg = colonIdx > 0 ? message.substring(colonIdx + 2) : message;

    // Parse streak number
    const streakMatch = cleanMsg.match(/\*\*(\d+) day/);
    const streakDays = streakMatch ? parseInt(streakMatch[1]) : 0;

    // Main streak number
    ctx.font = 'bold 48px Arial';
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${streakDays}`, W / 2, 58);

    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('DAY STREAK', W / 2, 108);

    // Progress bar toward next milestone
    const milestoneMatch = cleanMsg.match(/Day (\d+)/g);
    const nextMilestoneDay = milestoneMatch ? parseInt(milestoneMatch[milestoneMatch.length - 1].replace('Day ', '')) : 30;
    const progress = Math.min(streakDays / nextMilestoneDay, 1);
    const barY = 140;
    drawProgressBar(ctx, 80, barY, W - 160, 12, progress, COLORS.gold, COLORS.error);

    // Milestone labels
    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.textAlign = 'left';
    ctx.fillText('0', 80, barY + 18);
    ctx.textAlign = 'right';
    ctx.fillText(String(nextMilestoneDay), W - 80, barY + 18);

    // Sub info line
    const subInfo = cleanMsg.split(' — ')[1] || '';
    if (subInfo) {
      ctx.font = '13px Arial';
      ctx.fillStyle = COLORS.muted;
      ctx.textAlign = 'center';
      ctx.fillText(subInfo, W / 2, 175);
    }
  } else {
    ctx.font = '16px Arial';
    ctx.fillStyle = COLORS.muted;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Daily claim streaks require a Discord-linked account.', W / 2, 90);
    ctx.font = '14px Arial';
    ctx.fillText('Use !discord to link your account.', W / 2, 115);
  }

  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  SHOP CARD (!shop)
// ═══════════════════════════════════════════════════════════

const RARITY_LABELS = {
  common: 'COM', uncommon: 'UNC', rare: 'RAR', epic: 'EPI', legendary: 'LEG', ultra: 'ULT', aux: 'AUX'
};

function drawRarityLegend(ctx, x, y, w) {
  const rarities = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ultra', 'aux'];
  const labels = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Ultra', 'AUX'];
  const spacing = w / rarities.length;

  ctx.textBaseline = 'middle';
  for (let i = 0; i < rarities.length; i++) {
    const cx = x + i * spacing + spacing / 2;
    // Colored dot
    ctx.beginPath();
    ctx.arc(cx - 18, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = RARITY_COLORS[rarities[i]];
    ctx.fill();
    // Label
    ctx.font = 'bold 9px Arial';
    ctx.fillStyle = RARITY_COLORS[rarities[i]];
    ctx.textAlign = 'left';
    ctx.fillText(labels[i], cx - 12, y);
  }
}

function generateShopCard(displayName, message, ok) {
  const segments = splitSegments(message);

  if (ok === false || segments.length <= 1) {
    return _generateSimpleResponseCard(displayName, 'SHOP', COLORS.accentCyan, message, ok, '!shop [category]');
  }

  // Check for OVERVIEW mode (shop with no category)
  if (segments.length >= 2 && segments[1] === 'OVERVIEW') {
    return _generateShopOverviewCard(displayName, segments);
  }

  // First = coins, last = hint
  const header = segments[0] || '';
  const hint = segments[segments.length - 1] || '';
  const isHint = hint.startsWith('!');
  const itemLines = isHint ? segments.slice(1, -1) : segments.slice(1);

  // Check for title line (e.g. "Rare Items" or "Word Colors — Rare")
  let titleLine = null;
  let items = itemLines;
  if (itemLines.length > 0 && !itemLines[0].match(/^\{?\w/) === false && !itemLines[0].includes('(')) {
    // If first line has no cost parens, it's a title
  }
  // Detect title: lines without cost info like "Rare Items" or "Word Colors — Rare"
  if (itemLines.length > 0 && !itemLines[0].includes('(') && !itemLines[0].startsWith('{')) {
    titleLine = itemLines[0];
    items = itemLines.slice(1);
  }

  const rowH = 28;
  const legendH = 24;
  const titleH = titleLine ? 22 : 0;
  const H = Math.min(700, 120 + titleH + items.length * rowH + legendH + 70);
  const W = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 12);

  const headerH = drawPlayerHeader(ctx, displayName, 'SHOP', COLORS.accentCyan, W);

  // Coin balance
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(header, 24, headerH + 4);

  // Title line (e.g. "Rare Items", "Word Colors — Rare")
  if (titleLine) {
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = COLORS.accentCyan;
    ctx.textAlign = 'right';
    ctx.fillText(titleLine, W - 24, headerH + 6);
  }

  drawGoldDivider(ctx, 20, headerH + 24, W - 40);

  // Item rows in panel
  const panelY = headerH + 32 + titleH;
  const panelH = items.length * rowH + 12;
  drawPanel(ctx, 16, panelY, W - 32, panelH, 10);

  ctx.textBaseline = 'middle';
  for (let i = 0; i < items.length; i++) {
    const rowY = panelY + 16 + i * rowH;
    let line = items[i];

    // Parse {rarity} tag prefix
    let rarityKey = null;
    const rarityMatch = line.match(/^\{(\w+)\}\s*/);
    if (rarityMatch) {
      rarityKey = rarityMatch[1];
      line = line.substring(rarityMatch[0].length);
    }

    const isOwned = line.includes('✓');
    const dotColor = rarityKey && RARITY_COLORS[rarityKey]
      ? RARITY_COLORS[rarityKey]
      : (isOwned ? COLORS.success : COLORS.muted);

    // Rarity-colored dot
    ctx.beginPath();
    ctx.arc(34, rowY, 4, 0, Math.PI * 2);
    ctx.fillStyle = isOwned ? COLORS.success : dotColor;
    ctx.fill();

    // Inline rarity badge
    let textStartX = 48;
    if (rarityKey && RARITY_LABELS[rarityKey]) {
      const badgeLabel = RARITY_LABELS[rarityKey];
      ctx.font = 'bold 8px Arial';
      const badgeW = ctx.measureText(badgeLabel).width + 8;
      roundRect(ctx, 46, rowY - 7, badgeW, 14, 4);
      ctx.fillStyle = dotColor + '20';
      ctx.fill();
      ctx.strokeStyle = dotColor + '50';
      ctx.lineWidth = 0.5;
      ctx.stroke();
      ctx.fillStyle = dotColor;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeLabel, 46 + badgeW / 2, rowY);
      textStartX = 46 + badgeW + 6;
    }

    // Item text — highlight buff label [+X% Type] in cyan
    ctx.textAlign = 'left';
    const buffMatch = line.match(/\[([^\]]+)\]/);
    if (buffMatch) {
      const bIdx = line.indexOf('[');
      const beforeBuff = line.substring(0, bIdx);
      const buffText = buffMatch[0];
      const afterBuff = line.substring(bIdx + buffText.length);

      ctx.font = isOwned ? 'bold 12px Arial' : '12px Arial';
      ctx.fillStyle = isOwned ? COLORS.success : COLORS.white;
      ctx.fillText(beforeBuff, textStartX, rowY);
      const bw = ctx.measureText(beforeBuff).width;

      ctx.font = 'bold 10px Arial';
      ctx.fillStyle = COLORS.accentCyan;
      ctx.fillText(buffText, textStartX + bw, rowY);
      const bw2 = ctx.measureText(buffText).width;

      if (afterBuff.trim()) {
        ctx.font = isOwned ? 'bold 12px Arial' : '12px Arial';
        ctx.fillStyle = isOwned ? COLORS.success : COLORS.white;
        ctx.fillText(afterBuff, textStartX + bw + bw2, rowY);
      }
    } else {
      ctx.font = isOwned ? 'bold 12px Arial' : '12px Arial';
      ctx.fillStyle = isOwned ? COLORS.success : COLORS.white;
      ctx.fillText(line, textStartX, rowY);
    }
  }

  // Rarity legend
  const legendY = panelY + panelH + 12;
  drawRarityLegend(ctx, 16, legendY, W - 32);

  // Hint
  if (isHint) {
    drawHintBox(ctx, hint, W / 2, H - 56, COLORS.accentCyan, 'Use !test [name] to preview before buying');
  }

  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ── Shop Overview Card (no category selected) ─────────────

function _generateShopOverviewCard(displayName, segments) {
  const header = segments[0] || ''; // coins
  // segments[1] = 'OVERVIEW', segments[2..n-1] = categories, segments[n] = hint
  const hint = segments[segments.length - 1] || '';
  const isHint = hint.startsWith('!');
  const catLines = isHint ? segments.slice(2, -1) : segments.slice(2);

  const categoryColors = [
    COLORS.error, COLORS.comboOrange, COLORS.gold, COLORS.success,
    COLORS.accentCyan, COLORS.info, COLORS.accentPurple, COLORS.accentPink
  ];

  // Map category display names to CATEGORY_SAMPLES keys
  const catNameToKey = {
    'Word Colors': 'word_color', 'Word Glows': 'word_glow',
    'Borders': 'profile_border', 'Glows': 'profile_glow',
    'Name Glows': 'name_glow', 'Name Colors': 'name_color',
    'Titles': 'title', 'Win Effects': 'win_effect'
  };

  const rowH = 72; // Taller rows for mini preview
  const previewBoxW = 80, previewBoxH = 50;
  const legendH = 28;
  const H = Math.min(850, 110 + catLines.length * rowH + legendH + 64);
  const W = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 16);

  const headerH = drawPlayerHeader(ctx, displayName, 'SHOP', COLORS.accentCyan, W);

  // Coin balance
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(header, 24, headerH + 4);

  drawGoldDivider(ctx, 20, headerH + 24, W - 40);

  // Category rows in panel
  const panelY = headerH + 32;
  const panelH = catLines.length * rowH + 8;
  drawPanel(ctx, 16, panelY, W - 32, panelH, 10);

  ctx.textBaseline = 'middle';
  for (let i = 0; i < catLines.length; i++) {
    const rowY = panelY + 12 + i * rowH;
    const line = catLines[i];

    // Parse: "Word Colors (18) ~Tap Power~ 4c/4uc/3r/3e/2l/2u"
    const nameMatch = line.match(/^(.+?)\s*\((\d+)\)/);
    const buffMatch = line.match(/~(.+?)~/);
    const distMatch = line.match(/(\d+c\/\d+uc\/\d+r\/\d+e\/\d+l\/\d+u)/);

    const catName = nameMatch ? nameMatch[1] : line;
    const count = nameMatch ? nameMatch[2] : '';
    const buffType = buffMatch ? buffMatch[1] : '';
    const distStr = distMatch ? distMatch[1] : '';

    // Mini preview thumbnail on the left
    const sampleKey = catNameToKey[catName.trim()];
    const sampleItem = sampleKey ? CATEGORY_SAMPLES[sampleKey] : null;
    if (sampleItem) {
      ctx.save();
      // Clip to preview area so subtitle text doesn't overflow
      ctx.beginPath();
      ctx.rect(24, rowY + 2, previewBoxW, previewBoxH);
      ctx.clip();
      drawCosmeticPreview(ctx, sampleItem, displayName, 24, rowY + 2, previewBoxW, previewBoxH);
      ctx.restore();
    }

    // Text info offset to right of preview
    const textX = 24 + previewBoxW + 10;

    // Colored accent bar
    const accentColor = categoryColors[i % categoryColors.length];
    roundRect(ctx, textX, rowY + 4, 3, 18, 2);
    ctx.fillStyle = accentColor;
    ctx.fill();

    // Category name
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'left';
    ctx.fillText(catName, textX + 10, rowY + 13);

    // Item count
    const nameW = ctx.measureText(catName).width;
    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(`(${count})`, textX + 10 + nameW + 6, rowY + 13);

    // Buff type pill badge
    if (buffType) {
      ctx.font = 'bold 10px Arial';
      const pillW = ctx.measureText(buffType).width + 14;
      const pillX = W - 40 - pillW;
      roundRect(ctx, pillX, rowY + 5, pillW, 18, 9);
      ctx.fillStyle = 'rgba(34, 211, 238, 0.12)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(34, 211, 238, 0.35)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = COLORS.accentCyan;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(buffType, pillX + pillW / 2, rowY + 14);
    }

    // Rarity distribution dots row
    if (distStr) {
      const distParts = distStr.split('/');
      const rarityKeys = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'ultra', 'aux'];
      let dotX = textX + 10;
      const dotY = rowY + 32;

      for (let d = 0; d < distParts.length; d++) {
        const num = parseInt(distParts[d]) || 0;
        const rKey = rarityKeys[d];
        const rColor = RARITY_COLORS[rKey];

        for (let n = 0; n < num; n++) {
          ctx.beginPath();
          ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
          ctx.fillStyle = rColor;
          ctx.fill();
          dotX += 9;
        }
        if (num > 0) dotX += 3; // gap between rarity groups
      }
    }

    // Category sample item name below dots
    if (sampleItem) {
      ctx.font = '10px Arial';
      ctx.fillStyle = COLORS.dimText;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`Sample: ${sampleItem.name}`, textX + 10, rowY + 50);
    }
  }

  // Rarity legend
  const legendY = panelY + panelH + 10;
  drawRarityLegend(ctx, 16, legendY, W - 32);

  // Hint
  if (isHint) {
    drawHintBox(ctx, hint, W / 2, H - 56, COLORS.accentCyan, 'Filter by rarity: !shop common, !shop ultra');
  }

  drawSkyline(ctx, H - 16, W, 30, 0.2);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  COSMETICS CARD (!mycos, !equip, !unequip)
// ═══════════════════════════════════════════════════════════

function generateCosmeticsCard(displayName, command, message, ok, extraData) {
  const itemData = extraData?.itemData || null;
  const itemsData = extraData?.itemsData || null;

  // For equip/unequip confirmation — rich visual card if itemData available
  if (command === '!equip' || command === '!unequip') {
    if (ok !== false && itemData) {
      return _generateEquipVisualCard(displayName, command, message, itemData);
    }
    const label = command === '!equip' ? 'EQUIP' : 'UNEQUIP';
    return _generateSimpleResponseCard(displayName, label, COLORS.accentPink, message, ok, '!mycos to see owned');
  }

  // !mycos — owned cosmetics list
  const segments = splitSegments(message);

  if (segments.length <= 1) {
    return _generateSimpleResponseCard(displayName, 'COSMETICS', COLORS.accentPink, message, ok, '!shop to browse');
  }

  // Header like "12 cosmetics:" then item names
  const header = segments[0] || 'Cosmetics';
  const items = segments.slice(1);

  // Calculate height: extra space for equipped preview row if we have equipped items
  const equippedItems = itemsData || [];
  const previewRowH = equippedItems.length > 0 ? 80 : 0;
  const rowH = 26;
  const H = Math.min(700, 110 + previewRowH + items.length * rowH + 65);
  const W = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 12);

  const headerH = drawPlayerHeader(ctx, displayName, 'COSMETICS', COLORS.accentPink, W);

  // Sub-header count
  ctx.font = 'bold 14px Arial';
  ctx.fillStyle = COLORS.accentPink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(header, 24, headerH + 4);

  drawGoldDivider(ctx, 20, headerH + 22, W - 40);

  let cursorY = headerH + 30;

  // ─── Equipped Items Preview Row ────────────────────
  if (equippedItems.length > 0) {
    const previewPanelH = 68;
    drawPanel(ctx, 16, cursorY, W - 32, previewPanelH, 10);

    // "Equipped:" label
    ctx.font = 'bold 10px Arial';
    ctx.fillStyle = COLORS.success;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('EQUIPPED', 26, cursorY + 4);

    // Mini preview boxes for each equipped item
    const maxPreviews = Math.min(equippedItems.length, 6);
    const boxW = Math.min(80, Math.floor((W - 64) / maxPreviews) - 6);
    const boxH = 44;
    const startX = 24;
    const boxY = cursorY + 18;

    for (let i = 0; i < maxPreviews; i++) {
      const eItem = equippedItems[i];
      const bx = startX + i * (boxW + 6);
      ctx.save();
      ctx.beginPath();
      ctx.rect(bx, boxY, boxW, boxH);
      ctx.clip();
      drawCosmeticPreview(ctx, eItem, displayName, bx, boxY, boxW, boxH);
      ctx.restore();
    }

    cursorY += previewPanelH + 8;
  }

  // ─── Items List ────────────────────────────────────
  const panelH = items.length * rowH + 12;
  drawPanel(ctx, 16, cursorY, W - 32, panelH, 10);

  ctx.textBaseline = 'middle';
  for (let i = 0; i < items.length; i++) {
    const rowY = cursorY + 16 + i * rowH;
    const item = items[i];
    const isEquipped = item.includes('✓');

    // Status dot
    ctx.beginPath();
    ctx.arc(34, rowY, 4, 0, Math.PI * 2);
    ctx.fillStyle = isEquipped ? COLORS.success : COLORS.muted;
    ctx.fill();

    // Check if this is the buffs summary line
    const isBuffLine = item.toLowerCase().startsWith('buffs:');
    ctx.font = isBuffLine ? 'bold 13px Arial' : '13px Arial';
    ctx.fillStyle = isBuffLine ? COLORS.accentCyan : (isEquipped ? COLORS.white : COLORS.muted);
    ctx.textAlign = 'left';
    ctx.fillText(item, 48, rowY);
  }

  drawHintBox(ctx, '!equip [name] | !shop to browse', W / 2, H - 52, COLORS.accentPink, 'Equipped cosmetics give gameplay buffs!');
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/** Rich equip/unequip confirmation card with visual preview */
function _generateEquipVisualCard(displayName, command, message, itemData) {
  const isEquip = command === '!equip';
  const W = 600, H = (itemData.buff || itemData.buffs) ? 340 : 310;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);

  // Subtle accent gradient overlay
  const grad = ctx.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, isEquip ? 'rgba(244, 114, 182, 0.04)' : 'rgba(136, 136, 170, 0.04)');
  grad.addColorStop(1, 'rgba(34, 211, 238, 0.04)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  drawStars(ctx, W, H, 12);

  const rarityColor = RARITY_COLORS[itemData.rarity] || COLORS.muted;
  const label = isEquip ? 'EQUIPPED' : 'UNEQUIPPED';
  const accentColor = isEquip ? COLORS.success : COLORS.muted;
  const headerH = drawPlayerHeader(ctx, displayName, label, accentColor, W);

  // ─── Visual Preview Area ───────────────────────────
  const previewX = 24, previewY = headerH + 8;
  const previewW = W - 48, previewH = 100;
  drawCosmeticPreview(ctx, itemData, displayName, previewX, previewY, previewW, previewH);

  // ─── Item Info Row ─────────────────────────────────
  const infoY = previewY + previewH + 12;

  // Cosmetic name (left)
  ctx.font = 'bold 18px Arial';
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(itemData.name, 28, infoY);

  // Rarity badge
  const rarityLabel = (itemData.rarity || 'common').toUpperCase();
  const nameActualW = ctx.measureText(itemData.name).width;
  const badgeX = 28 + nameActualW + 10;
  ctx.font = 'bold 10px Arial';
  const rarityW = ctx.measureText(rarityLabel).width + 14;
  roundRect(ctx, badgeX, infoY + 3, rarityW, 18, 9);
  ctx.fillStyle = rarityColor + '25';
  ctx.fill();
  ctx.strokeStyle = rarityColor + '60';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = rarityColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rarityLabel, badgeX + rarityW / 2, infoY + 12);

  // Category label
  const CATEGORY_LABELS = {
    word_color: 'Word Color', word_glow: 'Word Glow', profile_border: 'Profile Border',
    profile_glow: 'Profile Glow', name_glow: 'Name Glow', name_color: 'Name Color',
    title: 'Title', win_effect: 'Win Effect'
  };
  ctx.font = '12px Arial';
  ctx.fillStyle = COLORS.dimText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(CATEGORY_LABELS[itemData.category] || itemData.category, 28, infoY + 24);

  // ─── Buff Badge ──────────────────────────────────
  if (itemData.buff || itemData.buffs) {
    const buffY = infoY + 44;
    ctx.font = 'bold 12px Arial';
    const buffText = itemData.buffs ? itemData.buffs.map(b => b.label).join(' + ') : itemData.buff.label;
    const buffTextW = ctx.measureText(buffText).width + 16;

    roundRect(ctx, 28, buffY, buffTextW, 20, 10);
    ctx.fillStyle = isEquip ? 'rgba(34, 211, 238, 0.15)' : 'rgba(136, 136, 170, 0.1)';
    ctx.fill();
    ctx.strokeStyle = isEquip ? 'rgba(34, 211, 238, 0.4)' : 'rgba(136, 136, 170, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = isEquip ? COLORS.accentCyan : COLORS.muted;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(buffText, 36, buffY + 10);

    ctx.font = '10px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText(isEquip ? 'now active!' : 'buff removed', 36 + buffTextW + 4, buffY + 10);
  }

  // ─── Hint ─────────────────────────────────────────
  const hintText = isEquip ? '!mycos to see all owned' : '!shop to browse cosmetics';
  drawHintBox(ctx, hintText, W / 2, H - 56, COLORS.accentPink, isEquip ? 'Buffs stack with all equipped cosmetics!' : '!equip [name] to re-equip');

  drawSkyline(ctx, H - 16, W, 30, 0.2);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  TEST CARD (!test / !untest — cosmetic preview with visual)
// ═══════════════════════════════════════════════════════════

/**
 * Parse a CSS textShadow string into { color, blur } for canvas rendering.
 * Handles: "0 0 6px rgba(255,0,0,0.4)" or "0 0 8px #ff0000"
 */
function parseTextShadow(shadowStr) {
  if (!shadowStr) return [];
  // Split on commas that are NOT inside parens (for multiple shadows)
  const parts = [];
  let depth = 0, current = '';
  for (const ch of shadowStr) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());

  return parts.map(p => {
    // Match: offsetX offsetY blur color
    const m = p.match(/(-?\d+)\s+(-?\d+)\s+(\d+)px\s+(.+)/);
    if (!m) return null;
    return { blur: parseInt(m[3]), color: m[4].trim() };
  }).filter(Boolean);
}

/**
 * Parse a CSS border string: "2px solid #cd7f32"
 */
function parseBorder(borderStr) {
  if (!borderStr) return null;
  const m = borderStr.match(/(\d+)px\s+\w+\s+(.+)/);
  return m ? { width: parseInt(m[1]), color: m[2].trim() } : null;
}

/**
 * Parse a CSS boxShadow string into { blur, color }.
 */
function parseBoxShadow(shadowStr) {
  return parseTextShadow(shadowStr); // Same format
}

/**
 * Apply text shadows on canvas by rendering text multiple times.
 */
function drawTextWithShadow(ctx, text, x, y, shadows) {
  ctx.save();
  for (const s of shadows) {
    ctx.shadowColor = s.color;
    ctx.shadowBlur = s.blur * 1.5; // Amplify for visibility on dark bg
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.fillText(text, x, y);
  }
  // Final clean pass
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.fillText(text, x, y);
  ctx.restore();
}

/**
 * Render the visual preview area for a cosmetic item.
 */
function drawCosmeticPreview(ctx, item, displayName, previewX, previewY, previewW, previewH) {
  const css = item.css || {};
  const cat = item.category;
  const cx = previewX + previewW / 2;
  const cy = previewY + previewH / 2;

  // Panel background
  drawPanel(ctx, previewX, previewY, previewW, previewH, 12);

  // Category-specific rendering
  if (cat === 'word_color' || cat === 'word_glow') {
    // Show "Word Tycoon" sample text with the color/glow
    const sampleText = 'Word Tycoon';
    ctx.font = 'bold 28px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = css.color || COLORS.white;

    const shadows = parseTextShadow(css.textShadow);
    if (shadows.length > 0) {
      drawTextWithShadow(ctx, sampleText, cx, cy - 6, shadows);
    }
    // Render the text with color
    ctx.fillStyle = css.color || COLORS.white;
    ctx.fillText(sampleText, cx, cy - 6);

    // Subtitle showing what it applies to
    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillText(cat === 'word_color' ? 'Applied to game words' : 'Glow effect on words', cx, cy + 18);

  } else if (cat === 'name_color' || cat === 'name_glow') {
    // Show the player's name with the cosmetic
    ctx.font = 'bold 24px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = css.color || COLORS.gold;

    const shadows = parseTextShadow(css.textShadow);
    if (shadows.length > 0) {
      drawTextWithShadow(ctx, displayName, cx, cy - 6, shadows);
    }
    ctx.fillStyle = css.color || COLORS.gold;
    ctx.fillText(displayName, cx, cy - 6);

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillText(cat === 'name_color' ? 'Applied to your name' : 'Glow effect on name', cx, cy + 18);

  } else if (cat === 'profile_border') {
    // Show a mini profile box with the border
    const boxW = 120, boxH = 60;
    const bx = cx - boxW / 2, by = cy - boxH / 2 - 4;

    const border = parseBorder(css.border);
    const boxShadows = parseBoxShadow(css.boxShadow);

    ctx.save();
    // Apply box shadow as glow
    if (boxShadows.length > 0) {
      ctx.shadowColor = boxShadows[0].color;
      ctx.shadowBlur = boxShadows[0].blur * 2;
    }
    roundRect(ctx, bx, by, boxW, boxH, 8);
    ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
    ctx.fill();
    ctx.restore();

    // Border
    if (border) {
      roundRect(ctx, bx, by, boxW, boxH, 8);
      ctx.strokeStyle = border.color;
      ctx.lineWidth = border.width;
      ctx.stroke();
    }

    // Inner content: player name + fake stats
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayName, cx, by + 20);
    ctx.font = '10px Arial';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Lv.5 | 2.3K coins', cx, by + 38);

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.textBaseline = 'middle';
    ctx.fillText('Applied to your profile card', cx, by + boxH + 16);

  } else if (cat === 'profile_glow') {
    // Show a mini profile box with glow
    const boxW = 120, boxH = 60;
    const bx = cx - boxW / 2, by = cy - boxH / 2 - 4;

    const boxShadows = parseBoxShadow(css.boxShadow);

    ctx.save();
    if (boxShadows.length > 0) {
      ctx.shadowColor = boxShadows[0].color;
      ctx.shadowBlur = boxShadows[0].blur * 2.5;
    }
    roundRect(ctx, bx, by, boxW, boxH, 8);
    ctx.fillStyle = 'rgba(20, 20, 40, 0.8)';
    ctx.fill();
    ctx.restore();

    // Border
    roundRect(ctx, bx, by, boxW, boxH, 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Inner content
    ctx.font = 'bold 12px Arial';
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayName, cx, by + 20);
    ctx.font = '10px Arial';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText('Lv.5 | 2.3K coins', cx, by + 38);

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText('Glow around your profile card', cx, by + boxH + 16);

  } else if (cat === 'title') {
    // Show the title below the player name
    ctx.font = 'bold 18px Arial';
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayName, cx, cy - 18);

    // Title text
    const titleText = css.title || item.name;
    ctx.font = 'bold 14px Arial';
    ctx.fillStyle = css.titleColor || COLORS.muted;

    const titleShadows = parseTextShadow(css.titleGlow);
    if (titleShadows.length > 0) {
      drawTextWithShadow(ctx, titleText, cx, cy + 6, titleShadows);
    }
    ctx.fillStyle = css.titleColor || COLORS.muted;
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.fillText(titleText, cx, cy + 6);

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText('Title displayed under your name', cx, cy + 28);

  } else if (cat === 'win_effect') {
    // Show colored particles for effect
    const colors = css.colors || ['#ffffff'];
    const effectName = css.effect || 'effect';

    // Draw particle dots in the effect colors
    resetSeed(42);
    for (let i = 0; i < Math.min(30, (css.particleCount || 20)); i++) {
      const px = previewX + 20 + seededRandom() * (previewW - 40);
      const py = previewY + 12 + seededRandom() * (previewH - 36);
      const pr = 2 + seededRandom() * 4;
      const pc = colors[Math.floor(seededRandom() * colors.length)];
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fillStyle = pc;
      ctx.globalAlpha = 0.5 + seededRandom() * 0.5;
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // Effect label
    ctx.font = 'bold 16px Arial';
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(effectName.charAt(0).toUpperCase() + effectName.slice(1), cx, cy + 2);

    ctx.font = '11px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText('Plays when you win a game', cx, previewY + previewH - 12);

  } else {
    // Fallback: just show the cosmetic name
    ctx.font = 'bold 20px Arial';
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.name, cx, cy);
  }
}

function generateTestCard(displayName, message, ok, itemData) {
  // If no itemData (e.g., !untest or error), use simple layout
  if (!itemData || ok === false) {
    return _generateTestCardSimple(displayName, message, ok);
  }

  const W = 600, H = (itemData.buff || itemData.buffs) ? 380 : 360;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);

  // Subtle purple/cyan gradient overlay
  const previewGrad = ctx.createLinearGradient(0, 0, W, H);
  previewGrad.addColorStop(0, 'rgba(167, 139, 250, 0.04)');
  previewGrad.addColorStop(1, 'rgba(34, 211, 238, 0.04)');
  ctx.fillStyle = previewGrad;
  ctx.fillRect(0, 0, W, H);

  drawStars(ctx, W, H, 16);

  // Rarity-colored accent bar
  const rarityColor = RARITY_COLORS[itemData.rarity] || COLORS.muted;
  const headerH = drawPlayerHeader(ctx, displayName, 'PREVIEW', rarityColor, W);

  // ─── Visual Preview Area ───────────────────────────
  const previewX = 24, previewY = headerH + 8;
  const previewW = W - 48, previewH = 110;
  drawCosmeticPreview(ctx, itemData, displayName, previewX, previewY, previewW, previewH);

  // ─── Item Info Row ─────────────────────────────────
  const infoY = previewY + previewH + 14;

  // Cosmetic name (left)
  ctx.font = 'bold 18px Arial';
  ctx.fillStyle = COLORS.white;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(itemData.name, 28, infoY);

  // Rarity badge (right of name)
  const rarityLabel = (itemData.rarity || 'common').toUpperCase();
  ctx.font = 'bold 10px Arial';
  const rarityW = ctx.measureText(rarityLabel).width + 14;
  const nameW = ctx.measureText(itemData.name).width;
  ctx.font = 'bold 18px Arial';
  const nameActualW = ctx.measureText(itemData.name).width;
  const badgeX = 28 + nameActualW + 10;
  ctx.font = 'bold 10px Arial';
  roundRect(ctx, badgeX, infoY + 3, rarityW, 18, 9);
  ctx.fillStyle = rarityColor + '25';
  ctx.fill();
  ctx.strokeStyle = rarityColor + '60';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = rarityColor;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(rarityLabel, badgeX + rarityW / 2, infoY + 12);

  // Cost (right side)
  const costStr = formatCoinAmount(itemData.cost || 0);
  ctx.font = 'bold 16px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'top';
  ctx.fillText(costStr, W - 28, infoY);

  // Category label (smaller, below name)
  const CATEGORY_LABELS = {
    word_color: 'Word Color', word_glow: 'Word Glow', profile_border: 'Profile Border',
    profile_glow: 'Profile Glow', name_glow: 'Name Glow', name_color: 'Name Color',
    title: 'Title', win_effect: 'Win Effect'
  };
  ctx.font = '12px Arial';
  ctx.fillStyle = COLORS.dimText;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(CATEGORY_LABELS[itemData.category] || itemData.category, 28, infoY + 24);

  // ─── Buff Badge ──────────────────────────────────
  if (itemData.buff || itemData.buffs) {
    const buffY = infoY + 40;
    ctx.font = 'bold 12px Arial';
    const buffText = itemData.buffs ? itemData.buffs.map(b => b.label).join(' + ') : itemData.buff.label;
    const buffTextW = ctx.measureText(buffText).width + 16;

    roundRect(ctx, 28, buffY, buffTextW, 20, 10);
    ctx.fillStyle = 'rgba(34, 211, 238, 0.15)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.4)';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = COLORS.accentCyan;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(buffText, 36, buffY + 10);

    ctx.font = '10px Arial';
    ctx.fillStyle = COLORS.dimText;
    ctx.fillText('when equipped', 36 + buffTextW + 4, buffY + 10);
  }

  // ─── Timer Bar ─────────────────────────────────────
  const barY = infoY + ((itemData.buff || itemData.buffs) ? 68 : 48);
  drawProgressBar(ctx, 28, barY, W - 56, 8, 1.0, rarityColor, COLORS.accentCyan);

  ctx.font = '11px Arial';
  ctx.fillStyle = COLORS.muted;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('Preview active for 30 seconds — check the overlay!', W / 2, barY + 14);

  // ─── Buy CTA ───────────────────────────────────────
  drawHintBox(ctx, `!buyc ${itemData.name.toLowerCase()} to purchase`, W / 2, H - 60, COLORS.gold, 'Equip cosmetics for unique gameplay buffs!');

  drawSkyline(ctx, H - 16, W, 35, 0.25);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

/** Simple test card for !untest / errors / missing itemData */
function _generateTestCardSimple(displayName, message, ok) {
  const W = 550, H = 200;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 8);

  const accentColor = ok !== false ? COLORS.accentPurple : COLORS.error;
  drawPlayerHeader(ctx, displayName, 'PREVIEW', accentColor, W);

  if (ok !== false) {
    ctx.font = '16px Arial';
    ctx.fillStyle = COLORS.white;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(message || 'Done.', W / 2, 100);
    drawHintBox(ctx, '!shop to browse cosmetics', W / 2, H - 48, COLORS.muted);
  } else {
    drawStatusIcon(ctx, 50, 100, 16, false);
    ctx.font = '15px Arial';
    ctx.fillStyle = COLORS.error;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    const msgLines = wrapText(ctx, message || 'Error', W - 120);
    let msgY = 86;
    for (const line of msgLines) {
      ctx.fillText(line, 80, msgY);
      msgY += 22;
    }
    drawHintBox(ctx, '!shop to browse available cosmetics', W / 2, H - 48, COLORS.muted);
  }

  drawFooter(ctx, W, H);
  return canvas.toBuffer('image/png');
}

/** Format coin amount: 10000 → "10K", 2000000000 → "2B" */
function formatCoinAmount(n) {
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B coins';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M coins';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K coins';
  return n + ' coins';
}

// ═══════════════════════════════════════════════════════════
//  HELP CARD (!help)
// ═══════════════════════════════════════════════════════════

function generateHelpCard(displayName, message, ok) {
  const W = 600, H = 580;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 25);

  // Big title
  drawTitle(ctx, 'WORD TYCOON', W / 2, 16, 32);
  drawGoldDivider(ctx, W / 2 - 100, 52, 200);

  // Parse commands from message into a lookup map
  const segments = splitSegments(message);
  if (segments.length > 0 && segments[0].startsWith('Commands: ')) {
    segments[0] = segments[0].replace('Commands: ', '');
  }
  const cmdMap = {};
  for (const seg of segments) {
    const parts = seg.split(' - ');
    if (parts.length >= 2) cmdMap[parts[0].trim()] = parts[1].trim();
  }

  let y = 62;

  // ── GETTING STARTED section ──
  ctx.font = 'bold 11px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText('GETTING STARTED', 28, y);
  y += 16;

  const steps = [
    { num: '1', cmd: '/link', desc: 'Connect your livestream account' },
    { num: '2', cmd: '!tap', desc: 'Tap for coins in the stream chat' },
    { num: '3', cmd: '!buy', desc: 'Purchase your first business' }
  ];

  const stepsH = steps.length * 32 + 12;
  drawPanel(ctx, 16, y, W - 32, stepsH, 8);

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepY = y + 16 + i * 32;

    // Numbered gold circle
    ctx.beginPath();
    ctx.arc(38, stepY, 10, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.gold + '20';
    ctx.fill();
    ctx.strokeStyle = COLORS.gold + '50';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.font = 'bold 11px Arial';
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(step.num, 38, stepY);

    // Command
    ctx.font = 'bold 13px Arial';
    ctx.fillStyle = COLORS.gold;
    ctx.textAlign = 'left';
    ctx.fillText(step.cmd, 58, stepY);

    // Description
    const cmdW = ctx.measureText(step.cmd).width;
    ctx.font = '12px Arial';
    ctx.fillStyle = COLORS.muted;
    ctx.fillText(step.desc, 58 + cmdW + 10, stepY);
  }

  y += stepsH + 12;

  // ── Command group sections ──
  const HELP_SECTIONS = [
    { title: 'EARNING', color: COLORS.accentCyan, commands: ['!tap', '!taps', '!combo', '!upgrade'] },
    { title: 'EMPIRE', color: COLORS.gold, commands: ['!coins', '!empire', '!buy'] },
    { title: 'COSMETICS', color: COLORS.accentPink, commands: ['!shop', '!buyc', '!equip', '!unequip', '!mycos', '!test'] }
  ];

  const cmdRowH = 20;
  for (const section of HELP_SECTIONS) {
    // Section title
    ctx.font = 'bold 10px Arial';
    ctx.fillStyle = section.color;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(section.title, 28, y);
    y += 14;

    // Section panel with accent bar
    const secPanelH = section.commands.length * cmdRowH + 10;
    drawPanel(ctx, 16, y, W - 32, secPanelH, 6);

    // Accent bar on left
    roundRect(ctx, 20, y + 4, 3, secPanelH - 8, 2);
    ctx.fillStyle = section.color;
    ctx.fill();

    ctx.textBaseline = 'middle';
    for (let i = 0; i < section.commands.length; i++) {
      const cmd = section.commands[i];
      const desc = cmdMap[cmd] || '';
      const rowY = y + 10 + i * cmdRowH;

      ctx.font = 'bold 11px Arial';
      ctx.fillStyle = COLORS.gold;
      ctx.textAlign = 'left';
      ctx.fillText(cmd, 34, rowY);

      ctx.font = '10px Arial';
      ctx.fillStyle = COLORS.muted;
      ctx.fillText(desc, 110, rowY);
    }

    y += secPanelH + 8;
  }

  // Hint
  drawHintBox(ctx, 'Play in the livestream chat or use /commands in Discord', W / 2, H - 60, COLORS.gold, 'Use /link to connect your account');

  // Skyline + footer
  drawSkyline(ctx, H - 16, W, 45, 0.3);
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  SIMPLE RESPONSE CARD (fallback/confirmation)
// ═══════════════════════════════════════════════════════════

function _generateSimpleResponseCard(displayName, label, accentColor, message, ok, hint) {
  const W = 550;
  const tempCanvas = createCanvas(1, 1);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = '15px Arial';
  const msgLines = wrapText(tempCtx, message || 'Done.', W - 80);
  const H = Math.max(150, 70 + msgLines.length * 22 + (hint ? 50 : 20));

  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 8);

  const ac = ok !== false ? accentColor : COLORS.error;
  drawPlayerHeader(ctx, displayName, label, ac, W);

  // Status icon for confirmations
  if (ok !== false && !message?.includes(' | ')) {
    drawStatusIcon(ctx, 38, 84, 12, true);
  }

  // Message
  ctx.font = '15px Arial';
  ctx.fillStyle = ok !== false ? COLORS.white : COLORS.error;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const startX = (ok !== false && !message?.includes(' | ')) ? 60 : 24;
  let msgY = 74;
  for (const line of msgLines) {
    ctx.fillText(line, startX, msgY);
    msgY += 22;
  }

  // Hint
  if (hint) {
    drawHintBox(ctx, hint, W / 2, H - 48, COLORS.muted);
  }

  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

// ═══════════════════════════════════════════════════════════
//  GENERIC FALLBACK (old behavior, for unknown commands)
// ═══════════════════════════════════════════════════════════

function generateCommandResponseCard(displayName, command, message, ok) {
  const cmdLabel = CMD_LABELS[command] || command.replace('!', '').toUpperCase();
  return _generateSimpleResponseCard(displayName, cmdLabel, COLORS.gold, message, ok);
}

// ═══════════════════════════════════════════════════════════
//  COSMETIC SETS CARDS
// ═══════════════════════════════════════════════════════════

function generateSetsCard(displayName, message, ok, extraData) {
  // Parse the pipe-separated message into set lines
  const segments = splitSegments(message);
  if (segments.length <= 1) {
    return _generateSimpleResponseCard(displayName, 'SETS', COLORS.accentPurple, message, ok, '!buyset [name] for gift sets');
  }

  const header = segments[0] || 'Sets';
  const setLines = segments.slice(1);

  const rowH = 32;
  const H = Math.min(700, 110 + setLines.length * rowH + 65);
  const W = 600;
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');

  drawBackground(ctx, W, H);
  drawStars(ctx, W, H, 12);

  const headerH = drawPlayerHeader(ctx, displayName, 'COSMETIC SETS', COLORS.accentPurple, W);

  // Sub-header with balance info
  ctx.font = 'bold 13px Arial';
  ctx.fillStyle = COLORS.gold;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillText(header, 24, headerH + 4);

  drawGoldDivider(ctx, 20, headerH + 22, W - 40);

  // Set rows
  const panelH = setLines.length * rowH + 12;
  const panelY = headerH + 30;
  drawPanel(ctx, 16, panelY, W - 32, panelH, 10);

  ctx.textBaseline = 'middle';
  for (let i = 0; i < setLines.length; i++) {
    const rowY = panelY + 18 + i * rowH;
    const line = setLines[i];

    // Extract rarity from {Rarity} tag
    const rarMatch = line.match(/\{(\w+)\}/);
    const rarity = rarMatch ? rarMatch[1].toLowerCase() : 'common';
    const dotColor = RARITY_COLORS[rarity] || COLORS.muted;
    const isActive = line.includes('ACTIVE');

    // Rarity dot
    ctx.beginPath();
    ctx.arc(34, rowY, 5, 0, Math.PI * 2);
    ctx.fillStyle = dotColor;
    ctx.fill();

    // Set name + info
    const cleanLine = line.replace(/\{(\w+)\}\s*/, '');
    ctx.font = isActive ? 'bold 13px Arial' : '13px Arial';
    ctx.fillStyle = isActive ? COLORS.success : COLORS.white;
    ctx.textAlign = 'left';
    ctx.fillText(cleanLine, 48, rowY);

    // Active badge
    if (isActive) {
      const textW = ctx.measureText(cleanLine).width;
      ctx.font = 'bold 10px Arial';
      ctx.fillStyle = COLORS.success;
      ctx.fillText(' \u2713', 48 + textW + 2, rowY);
    }
  }

  drawHintBox(ctx, '!buyset [america|canada] for gift sets', W / 2, H - 52, COLORS.accentPurple, 'Complete a set for bonus buffs!');
  drawFooter(ctx, W, H);

  return canvas.toBuffer('image/png');
}

function generateBuySetCard(displayName, message, ok, extraData) {
  return _generateSimpleResponseCard(displayName, 'BUY SET', ok !== false ? COLORS.success : COLORS.error, message, ok, '!sets to view all sets');
}

// ═══════════════════════════════════════════════════════════
//  EXPORTS
// ═══════════════════════════════════════════════════════════

module.exports = {
  // Account flow cards
  generateWelcomeCard,
  generateLinkCodeCard,
  generateLinkSuccessCard,
  generateGateCard,
  // Game command cards
  generateTapCard,
  generateStatsCard,
  generateCoinsCard,
  generateEmpireCard,
  generateBuyListCard,
  generateBuyCard,
  generateUpgradeCard,
  generateComboCard,
  generateStreakCard,
  generateShopCard,
  generateCosmeticsCard,
  generateSetsCard,
  generateBuySetCard,
  generateTestCard,
  generateHelpCard,
  // Fallback
  generateCommandResponseCard,
};
