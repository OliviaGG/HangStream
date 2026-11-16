/**
 * city-buildings.js — 11 pixel-art building types for isometric city
 * Buildings now occupy a 2×2 tile footprint (64px wide iso base).
 * Prestige adds extra 2×2 blocks adjacent to the base.
 * Exports: window.CityBuildings
 */
(function () {
  'use strict';

  const TW = CityCamera.TILE_W;  // 32
  const TH = CityCamera.TILE_H;  // 16

  // Building base size: 2×2 tiles = 64px wide isometric
  const BW = TW * 2;  // 64 — building iso width
  const BH = BW / 2;  // 32 — building iso base height (2:1 ratio)
  const BHW = BW / 2; // 32 — half width
  const BHH = BH / 2; // 16 — half height

  // Building type definitions (heights scaled up for 2×2 base)
  const TYPES = {
    library:    { name: 'Library',         emoji: '\u{1F4DA}', minH: 36, maxH: 72,  maxLv: 100, colors: ['#8B7355', '#A0896B', '#6B5B45'] },
    newspaper:  { name: 'Newspaper Route', emoji: '\u{1F5DE}', minH: 40, maxH: 84,  maxLv: 100, colors: ['#5A7A8A', '#7A9CAB', '#3E5F6F'] },
    carwash:    { name: 'Car Wash',        emoji: '\u{1F697}', minH: 36, maxH: 72,  maxLv: 100, colors: ['#4A90D9', '#6AAEF0', '#336EAA'] },
    stockmogul: { name: 'Stock Mogul',     emoji: '\u{1F4C8}', minH: 48, maxH: 120, maxLv: 100, colors: ['#2E8B57', '#4CAF7A', '#1D6B42'] },
    pizza:      { name: 'Pizza Shop',      emoji: '\u{1F355}', minH: 42, maxH: 96,  maxLv: 100, colors: ['#E8632B', '#FF8040', '#C04820'] },
    arcade:     { name: 'Arcade',          emoji: '\u{1F3AE}', minH: 48, maxH: 72,  maxLv: 1,   colors: ['#9B59B6', '#BB77DD', '#7B3D96'] },
    gym:        { name: 'Gym',             emoji: '\u{1F3CB}', minH: 42, maxH: 84,  maxLv: 75,  colors: ['#E67E22', '#FF9A40', '#C06018'] },
    cinema:     { name: 'Movie Theater',   emoji: '\u{1F3AC}', minH: 48, maxH: 108, maxLv: 50,  colors: ['#C0392B', '#E04E40', '#9A2A20'] },
    startup:    { name: 'Tech Startup',    emoji: '\u{1F4BB}', minH: 54, maxH: 144, maxLv: 50,  colors: ['#3498DB', '#5CB8F0', '#2278B5'] },
    bank:       { name: 'Bank',            emoji: '\u{1F3E6}', minH: 60, maxH: 156, maxLv: 50,  colors: ['#D4A017', '#F1C40F', '#AA8010'] },
    space:      { name: 'Space Agency',    emoji: '\u{1F680}', minH: 72, maxH: 180, maxLv: 25,  colors: ['#1ABC9C', '#3DE0C0', '#10937A'] },
  };

  const spriteCache = new Map();

  function getBuildingHeight(type, level) {
    const t = TYPES[type];
    if (!t) return 48;
    const pct = Math.min(1, level / t.maxLv);
    return Math.round(t.minH + pct * (t.maxH - t.minH));
  }

  function getLevelBucket(type, level) {
    const t = TYPES[type];
    if (!t) return 0;
    const pct = level / t.maxLv;
    if (pct <= 0.1) return 0;
    if (pct <= 0.25) return 1;
    if (pct <= 0.5) return 2;
    if (pct <= 0.75) return 3;
    return 4;
  }

  function spriteKey(type, levelBucket, accentColor, facing) {
    return type + ':' + levelBucket + ':' + (accentColor || '') + ':' + (facing || 'left');
  }

  /**
   * Draw an isometric box with 2×2 tile base.
   * x, y = center-bottom anchor point of the iso diamond.
   */
  function drawIsoBox(ctx, x, y, w, h, colors, accentColor) {
    const hw = w / 2;
    const hh = w / 4;

    // Right face (darker)
    ctx.fillStyle = colors[2];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + hw, y - hh);
    ctx.lineTo(x + hw, y - hh - h);
    ctx.lineTo(x, y - h);
    ctx.closePath();
    ctx.fill();

    // Left face (front)
    ctx.fillStyle = colors[0];
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - hw, y - hh);
    ctx.lineTo(x - hw, y - hh - h);
    ctx.lineTo(x, y - h);
    ctx.closePath();
    ctx.fill();

    // Top face
    ctx.fillStyle = colors[1];
    ctx.beginPath();
    ctx.moveTo(x, y - h);
    ctx.lineTo(x - hw, y - hh - h);
    ctx.lineTo(x, y - hh * 2 - h);
    ctx.lineTo(x + hw, y - hh - h);
    ctx.closePath();
    ctx.fill();

    // Isometric windows
    const wColor = accentColor || lighten(colors[0], 50);
    const windowRows = Math.floor(h / 18);
    if (windowRows <= 0) return;

    const winW = 5;
    const winH = 5;
    ctx.fillStyle = wColor;

    for (let row = 0; row < Math.min(windowRows, 8); row++) {
      const rowY = y - 10 - row * 18;

      // Left face: 3 windows per row
      for (let col = 0; col < 3; col++) {
        const t = 0.15 + col * 0.3;
        const wx = x - t * hw;
        const wy = rowY - t * hh;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx - winW, wy - winW * 0.5);
        ctx.lineTo(wx - winW, wy - winW * 0.5 - winH);
        ctx.lineTo(wx, wy - winH);
        ctx.closePath();
        ctx.fill();
      }

      // Right face: 3 windows per row
      for (let col = 0; col < 3; col++) {
        const t = 0.15 + col * 0.3;
        const wx = x + t * hw;
        const wy = rowY - t * hh;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + winW, wy - winW * 0.5);
        ctx.lineTo(wx + winW, wy - winW * 0.5 - winH);
        ctx.lineTo(wx, wy - winH);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function lighten(hex, amount) {
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.min(255, ((num >> 16) & 0xff) + amount);
    const g = Math.min(255, ((num >> 8) & 0xff) + amount);
    const b = Math.min(255, (num & 0xff) + amount);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  /** Isometric-aligned decorations for building types */
  function drawDecorations(ctx, type, x, y, w, h, level, colors) {
    const hw = w / 2;
    const hh = w / 4;

    switch (type) {
      case 'pizza':
        if (level > 15) {
          // Chimney as iso box on roof
          const cx = x - 4, cy = y - h - hh;
          ctx.fillStyle = '#8B4513';
          ctx.beginPath();
          ctx.moveTo(cx, cy); ctx.lineTo(cx - 4, cy - 2); ctx.lineTo(cx - 4, cy - 12); ctx.lineTo(cx, cy - 10);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#6B3310';
          ctx.beginPath();
          ctx.moveTo(cx, cy); ctx.lineTo(cx + 4, cy - 2); ctx.lineTo(cx + 4, cy - 12); ctx.lineTo(cx, cy - 10);
          ctx.closePath(); ctx.fill();
        }
        break;

      case 'bank':
        // Columns on left face
        ctx.fillStyle = '#F5E6C8';
        for (let i = 0; i < 4; i++) {
          const t = 0.12 + i * 0.22;
          const bx = x - t * hw;
          const by = y - 4 - t * hh;
          ctx.beginPath();
          ctx.moveTo(bx, by); ctx.lineTo(bx - 2, by - 1); ctx.lineTo(bx - 2, by - 1 - (h - 8)); ctx.lineTo(bx, by - (h - 8));
          ctx.closePath(); ctx.fill();
        }
        break;

      case 'space':
        if (level >= 12) {
          // Rocket on rooftop
          const rx = x, ry = y - h - hh;
          ctx.fillStyle = '#DDDDDD';
          ctx.beginPath();
          ctx.moveTo(rx, ry - 24); ctx.lineTo(rx - 4, ry - 4); ctx.lineTo(rx + 4, ry - 4);
          ctx.closePath(); ctx.fill();
          ctx.fillStyle = '#FF4444';
          ctx.beginPath();
          ctx.moveTo(rx, ry - 30); ctx.lineTo(rx - 3, ry - 24); ctx.lineTo(rx + 3, ry - 24);
          ctx.closePath(); ctx.fill();
        }
        break;

      case 'startup':
        if (level > 25) {
          const ax = x, ay = y - h - hh;
          ctx.fillStyle = '#888';
          ctx.fillRect(ax, ay - 14, 1, 14);
          ctx.fillStyle = '#FF0000';
          ctx.fillRect(ax - 1, ay - 16, 3, 3);
        }
        break;

      case 'carwash':
        // Blue stripe bands on left face
        ctx.fillStyle = 'rgba(100,180,255,0.35)';
        for (let i = 0; i < 2; i++) {
          const fy = y - 8 - i * 14;
          ctx.beginPath();
          ctx.moveTo(x, fy); ctx.lineTo(x - hw, fy - hh); ctx.lineTo(x - hw, fy - hh - 3); ctx.lineTo(x, fy - 3);
          ctx.closePath(); ctx.fill();
        }
        break;

      case 'library':
        if (level > 8) {
          ctx.fillStyle = '#A0522D';
          for (let i = 0; i < 2; i++) {
            const fy = y - h + 8 + i * 14;
            ctx.beginPath();
            ctx.moveTo(x, fy); ctx.lineTo(x - hw + 3, fy - hh + 1); ctx.lineTo(x - hw + 3, fy - hh - 2); ctx.lineTo(x, fy - 3);
            ctx.closePath(); ctx.fill();
          }
        }
        break;

      case 'newspaper':
        // Paper stack iso box at ground
        ctx.fillStyle = '#DDD';
        ctx.beginPath();
        ctx.moveTo(x - hw + 4, y - hh + 2);
        ctx.lineTo(x - hw + 12, y - hh - 2);
        ctx.lineTo(x - hw + 12, y - hh - 6);
        ctx.lineTo(x - hw + 4, y - hh - 2);
        ctx.closePath(); ctx.fill();
        break;
    }
  }

  // ─── Custom per-building draw functions ──────────────────────────────────

  /**
   * Library: warm stone building with peaked roof, arched windows, bookshelves, front door
   */
  function drawLibrary(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.7;
    const roofH = h * 0.3;

    // === Walls (lower portion) ===
    // Right wall
    ctx.fillStyle = '#6B5B45';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // Left wall (front)
    ctx.fillStyle = '#8B7355';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // === Peaked roof ===
    const ridgeH = roofH + 6;
    // Left roof slope
    ctx.fillStyle = '#7A3B2E';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH);                       // front bottom of roof
    ctx.lineTo(x - hw, y - hh - wallH);             // left bottom
    ctx.lineTo(x - hw * 0.5, y - hh - wallH - ridgeH); // left ridge peak
    ctx.lineTo(x * 0 + x, y - wallH - ridgeH + 2); // front ridge peak
    ctx.closePath(); ctx.fill();

    // Right roof slope
    ctx.fillStyle = '#5C2A1E';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH);
    ctx.lineTo(x + hw, y - hh - wallH);
    ctx.lineTo(x + hw * 0.5, y - hh - wallH - ridgeH);
    ctx.lineTo(x, y - wallH - ridgeH + 2);
    ctx.closePath(); ctx.fill();

    // Roof ridge top face
    ctx.fillStyle = '#8B4030';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH - ridgeH + 2);
    ctx.lineTo(x - hw * 0.5, y - hh - wallH - ridgeH);
    ctx.lineTo(x, y - hh * 2 - wallH - ridgeH + 4);
    ctx.lineTo(x + hw * 0.5, y - hh - wallH - ridgeH);
    ctx.closePath(); ctx.fill();

    // === Arched windows on left face with book spines ===
    const windowCount = Math.min(3, 1 + Math.floor(level / 25));
    const bookColors = ['#C0392B', '#2980B9', '#27AE60', '#8E44AD', '#F39C12', '#1ABC9C'];

    for (let i = 0; i < windowCount; i++) {
      const t = 0.2 + i * 0.28;
      const wx = x - t * hw;
      const wy = y - 8 - t * hh;
      const archW = 7;
      const archH = 14;

      // Window frame (dark)
      ctx.fillStyle = '#3D2B1F';
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx - archW, wy - archW * 0.5);
      ctx.lineTo(wx - archW, wy - archW * 0.5 - archH);
      // Arch top
      ctx.lineTo(wx - archW * 0.5, wy - archW * 0.25 - archH - 3);
      ctx.lineTo(wx, wy - archH);
      ctx.closePath(); ctx.fill();

      // Book spines inside window — iso-aligned, anchored to window position
      for (let b = 0; b < 4; b++) {
        const bOffset = 1.5 + b * 1.4; // offset along the face from window edge
        const bx = wx - bOffset;
        const by = wy - bOffset * 0.5; // follow iso slope
        const bookH = archH - 5;
        ctx.fillStyle = bookColors[(i * 4 + b) % bookColors.length];
        // Draw as iso-aligned parallelogram
        ctx.beginPath();
        ctx.moveTo(bx, by - 2);
        ctx.lineTo(bx - 1, by - 2 - 0.5);
        ctx.lineTo(bx - 1, by - 2 - 0.5 - bookH);
        ctx.lineTo(bx, by - 2 - bookH);
        ctx.closePath(); ctx.fill();
      }
    }

    // === Arched windows on right face ===
    for (let i = 0; i < windowCount; i++) {
      const t = 0.2 + i * 0.28;
      const wx = x + t * hw;
      const wy = y - 8 - t * hh;
      const archW = 7;
      const archH = 14;

      ctx.fillStyle = '#3D2B1F';
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx + archW, wy - archW * 0.5);
      ctx.lineTo(wx + archW, wy - archW * 0.5 - archH);
      ctx.lineTo(wx + archW * 0.5, wy - archW * 0.25 - archH - 3);
      ctx.lineTo(wx, wy - archH);
      ctx.closePath(); ctx.fill();

      // Book spines — iso-aligned, anchored to window
      for (let b = 0; b < 4; b++) {
        const bOffset = 1.5 + b * 1.4;
        const bx = wx + bOffset;
        const by = wy - bOffset * 0.5;
        const bookH = archH - 5;
        ctx.fillStyle = bookColors[(i * 4 + b + 2) % bookColors.length];
        ctx.beginPath();
        ctx.moveTo(bx, by - 2);
        ctx.lineTo(bx + 1, by - 2 - 0.5);
        ctx.lineTo(bx + 1, by - 2 - 0.5 - bookH);
        ctx.lineTo(bx, by - 2 - bookH);
        ctx.closePath(); ctx.fill();
      }
    }

    // === Front door on left face ===
    const doorT = 0.5;
    const dx = x - doorT * hw;
    const dy = y - doorT * hh;
    ctx.fillStyle = '#5C3A1E';
    ctx.beginPath();
    ctx.moveTo(dx, dy);
    ctx.lineTo(dx - 6, dy - 3);
    ctx.lineTo(dx - 6, dy - 3 - 16);
    ctx.lineTo(dx - 3, dy - 1.5 - 18); // arch
    ctx.lineTo(dx, dy - 16);
    ctx.closePath(); ctx.fill();
    // Door handle
    ctx.fillStyle = '#D4A017';
    ctx.fillRect(Math.round(dx - 2), Math.round(dy - 8), 1, 1);

    // === Steps at entrance ===
    ctx.fillStyle = '#9A8A6A';
    ctx.beginPath();
    ctx.moveTo(dx + 1, dy + 1);
    ctx.lineTo(dx - 8, dy - 3);
    ctx.lineTo(dx - 8, dy - 2);
    ctx.lineTo(dx + 1, dy + 2);
    ctx.closePath(); ctx.fill();

    // === Lantern above door ===
    if (level > 15) {
      ctx.fillStyle = '#FFD700';
      ctx.fillRect(Math.round(dx - 3), Math.round(dy - 20), 3, 3);
      ctx.fillStyle = 'rgba(255,215,0,0.3)';
      ctx.fillRect(Math.round(dx - 5), Math.round(dy - 22), 7, 7);
    }
  }

  /**
   * Car Wash: wide low blue/white building with wash tunnel, brush rollers,
   * striped awning, signage, water effects, and ground puddles.
   */
  function drawCarwash(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.7;

    // ── Walls ──
    // Right wall — darker blue with tile lines
    ctx.fillStyle = '#2468A0';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();
    // Tile grid lines on right wall
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let row = 0; row < Math.floor(wallH / 10); row++) {
      const ry = y - 5 - row * 10;
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x + hw, ry - hh); ctx.stroke();
    }

    // Left wall (front) — lighter blue with tile lines
    ctx.fillStyle = '#3A90D8';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    for (let row = 0; row < Math.floor(wallH / 10); row++) {
      const ry = y - 5 - row * 10;
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x - hw, ry - hh); ctx.stroke();
    }

    // White bottom trim band on both faces
    ctx.fillStyle = '#E8F0F8';
    // Left face trim
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - 5); ctx.lineTo(x, y - 5);
    ctx.closePath(); ctx.fill();
    // Right face trim
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - 5); ctx.lineTo(x, y - 5);
    ctx.closePath(); ctx.fill();

    // ── Flat roof with slight overhang ──
    ctx.fillStyle = '#4AA8E8';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH);
    ctx.lineTo(x - hw - 2, y - hh - wallH - 1);
    ctx.lineTo(x, y - hh * 2 - wallH - 2);
    ctx.lineTo(x + hw + 2, y - hh - wallH - 1);
    ctx.closePath(); ctx.fill();

    // ── Wash bay tunnel on left face ──
    // Large dark opening
    const bayW = 18;
    const bayH = wallH * 0.75;
    const bayT = 0.4;
    const bayX = x - bayT * hw;
    const bayY = y - bayT * hh;

    // Bay frame — white border
    ctx.fillStyle = '#D0E4F0';
    ctx.beginPath();
    ctx.moveTo(bayX + 1, bayY + 1);
    ctx.lineTo(bayX - bayW - 1, bayY - (bayW + 1) * 0.5);
    ctx.lineTo(bayX - bayW - 1, bayY - (bayW + 1) * 0.5 - bayH - 2);
    ctx.lineTo(bayX + 1, bayY - bayH - 2);
    ctx.closePath(); ctx.fill();

    // Bay interior — dark
    ctx.fillStyle = '#0D1520';
    ctx.beginPath();
    ctx.moveTo(bayX, bayY);
    ctx.lineTo(bayX - bayW, bayY - bayW * 0.5);
    ctx.lineTo(bayX - bayW, bayY - bayW * 0.5 - bayH);
    ctx.lineTo(bayX, bayY - bayH);
    ctx.closePath(); ctx.fill();

    // ── Brush rollers inside bay ──
    const rollerCount = Math.min(4, 1 + Math.floor(level / 15));
    const rollerColors = ['#E74C3C', '#2ECC71', '#3498DB', '#F39C12'];
    for (let r = 0; r < rollerCount; r++) {
      const ry = bayY - 8 - r * (bayH / (rollerCount + 1));
      const rx = bayX - bayW * 0.5;
      const rsy = ry - bayW * 0.25;
      const rs = 4;

      // Roller drum
      ctx.fillStyle = rollerColors[r % rollerColors.length];
      ctx.beginPath();
      ctx.moveTo(rx, rsy - rs); ctx.lineTo(rx - rs, rsy); ctx.lineTo(rx, rsy + rs); ctx.lineTo(rx + rs, rsy);
      ctx.closePath(); ctx.fill();

      // Bristle lines radiating out
      const bristleColor = lighten(rollerColors[r % rollerColors.length], 70);
      ctx.strokeStyle = bristleColor;
      ctx.lineWidth = 1;
      for (let b = 0; b < 4; b++) {
        const angle = b * Math.PI / 2;
        const bx = rx + Math.cos(angle) * (rs + 2);
        const by = rsy + Math.sin(angle) * (rs + 2) * 0.5;
        ctx.beginPath(); ctx.moveTo(rx + Math.cos(angle) * rs, rsy + Math.sin(angle) * rs * 0.5);
        ctx.lineTo(bx, by); ctx.stroke();
      }
    }

    // ── Spray nozzles in bay (blue dots) ──
    if (level > 20) {
      ctx.fillStyle = '#56C8FF';
      for (let n = 0; n < 3; n++) {
        const ny2 = bayY - 6 - n * (bayH * 0.3);
        ctx.fillRect(Math.round(bayX - 2), Math.round(ny2 - bayW * 0.1 - bayH * 0.05), 2, 2);
        ctx.fillRect(Math.round(bayX - bayW + 2), Math.round(ny2 - bayW * 0.5 + 2), 2, 2);
      }
    }

    // ── Striped awning above bay ──
    const awningY = bayY - bayH - 2;
    const awningStripes = 6;
    for (let s = 0; s < awningStripes; s++) {
      const st = (s / awningStripes);
      const nextT = ((s + 1) / awningStripes);
      const sx1 = bayX - st * bayW;
      const sy1 = awningY - st * bayW * 0.5;
      const sx2 = bayX - nextT * bayW;
      const sy2 = awningY - nextT * bayW * 0.5;

      ctx.fillStyle = s % 2 === 0 ? '#FFFFFF' : '#E74C3C';
      ctx.beginPath();
      ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
      ctx.lineTo(sx2, sy2 + 6); ctx.lineTo(sx1, sy1 + 6);
      ctx.closePath(); ctx.fill();
    }

    // ── Windows on right face ──
    const wColor = accentColor || '#B8D8F0';
    ctx.fillStyle = wColor;
    const winRows = Math.min(3, Math.floor(wallH / 18));
    for (let row = 0; row < winRows; row++) {
      for (let col = 0; col < 2; col++) {
        const t = 0.2 + col * 0.4;
        const wy = y - 12 - row * 16 - t * hh;
        const wx = x + t * hw;
        ctx.beginPath();
        ctx.moveTo(wx, wy);
        ctx.lineTo(wx + 5, wy - 2.5);
        ctx.lineTo(wx + 5, wy - 2.5 - 6);
        ctx.lineTo(wx, wy - 6);
        ctx.closePath(); ctx.fill();
      }
    }

    // ── Sign on front wall (left face) — above the bay ──
    // White sign band across upper portion of left face
    const signTop = y - wallH + 4;
    const signBot = signTop + 10;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(x, signTop); ctx.lineTo(x - hw + 2, signTop - hh + 1);
    ctx.lineTo(x - hw + 2, signBot - hh + 1); ctx.lineTo(x, signBot);
    ctx.closePath(); ctx.fill();

    // "CAR WASH" — blue letter blocks on the white band, iso-aligned
    ctx.fillStyle = '#1A5C99';
    const letters = 8; // C-A-R-W-A-S-H plus space
    for (let l = 0; l < letters; l++) {
      if (l === 3) continue; // space between CAR and WASH
      const lt = 0.08 + l * 0.11;
      const lx = x - lt * hw;
      const ly = signTop + 3 - lt * hh;
      ctx.fillRect(Math.round(lx - 1), Math.round(ly), 2, 5);
    }

    // ── Water puddle on ground ──
    ctx.fillStyle = 'rgba(80, 180, 255, 0.25)';
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 3);
    ctx.lineTo(x - hw * 0.4, y - hh * 0.4 + 2);
    ctx.lineTo(x - hw * 0.4 + 10, y - hh * 0.4 - 2);
    ctx.lineTo(x + 6, y);
    ctx.closePath(); ctx.fill();

    // Puddle highlight
    ctx.fillStyle = 'rgba(150, 220, 255, 0.15)';
    ctx.beginPath();
    ctx.moveTo(x, y + 1);
    ctx.lineTo(x - hw * 0.2, y - hh * 0.2 + 1);
    ctx.lineTo(x - hw * 0.2 + 6, y - hh * 0.2 - 1);
    ctx.lineTo(x + 4, y - 1);
    ctx.closePath(); ctx.fill();
  }

  /**
   * Pizza Shop: warm brick pizzeria with chimney, checkered awning, oven glow,
   * pizza sign, arched entrance, and outdoor table.
   */
  function drawPizza(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.65;

    // ── Brick walls ──
    // Right wall — darker brick
    ctx.fillStyle = '#B84420';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();
    // Brick lines
    ctx.strokeStyle = 'rgba(0,0,0,0.12)';
    ctx.lineWidth = 1;
    for (let row = 0; row < Math.floor(wallH / 6); row++) {
      const ry = y - 3 - row * 6;
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x + hw, ry - hh); ctx.stroke();
    }

    // Left wall (front) — warm brick
    ctx.fillStyle = '#D45A28';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();
    // Brick lines
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    for (let row = 0; row < Math.floor(wallH / 6); row++) {
      const ry = y - 3 - row * 6;
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x - hw, ry - hh); ctx.stroke();
    }

    // ── Peaked roof ──
    const ridgeH = h * 0.3 + 4;
    // Left slope — terracotta
    ctx.fillStyle = '#A03318';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x - hw, y - hh - wallH);
    ctx.lineTo(x - hw * 0.5, y - hh - wallH - ridgeH); ctx.lineTo(x, y - wallH - ridgeH + 2);
    ctx.closePath(); ctx.fill();
    // Right slope
    ctx.fillStyle = '#7A2810';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x + hw, y - hh - wallH);
    ctx.lineTo(x + hw * 0.5, y - hh - wallH - ridgeH); ctx.lineTo(x, y - wallH - ridgeH + 2);
    ctx.closePath(); ctx.fill();
    // Ridge cap
    ctx.fillStyle = '#B83A18';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH - ridgeH + 2);
    ctx.lineTo(x - hw * 0.5, y - hh - wallH - ridgeH);
    ctx.lineTo(x, y - hh * 2 - wallH - ridgeH + 4);
    ctx.lineTo(x + hw * 0.5, y - hh - wallH - ridgeH);
    ctx.closePath(); ctx.fill();

    // ── Chimney on roof (right side) ──
    const chimX = x + hw * 0.2;
    const chimY = y - wallH - ridgeH * 0.4 - hh * 0.2;
    ctx.fillStyle = '#8B4513';
    // Left face of chimney
    ctx.beginPath();
    ctx.moveTo(chimX, chimY); ctx.lineTo(chimX - 4, chimY - 2);
    ctx.lineTo(chimX - 4, chimY - 14); ctx.lineTo(chimX, chimY - 12);
    ctx.closePath(); ctx.fill();
    // Right face
    ctx.fillStyle = '#6B3310';
    ctx.beginPath();
    ctx.moveTo(chimX, chimY); ctx.lineTo(chimX + 4, chimY - 2);
    ctx.lineTo(chimX + 4, chimY - 14); ctx.lineTo(chimX, chimY - 12);
    ctx.closePath(); ctx.fill();
    // Chimney top
    ctx.fillStyle = '#7A3A15';
    ctx.beginPath();
    ctx.moveTo(chimX, chimY - 12); ctx.lineTo(chimX - 4, chimY - 14);
    ctx.lineTo(chimX, chimY - 16); ctx.lineTo(chimX + 4, chimY - 14);
    ctx.closePath(); ctx.fill();

    // ── Red/white striped awning wrapping BOTH faces ──
    const awningTop = y - wallH + 2;
    const awningDrop = 8;
    const stripeCount = 7;

    // Left face awning
    for (let s = 0; s < stripeCount; s++) {
      const st = 0.02 + s * (0.96 / stripeCount);
      const nt = st + (0.96 / stripeCount);
      const sx1 = x - st * hw, sy1 = awningTop - st * hh;
      const sx2 = x - nt * hw, sy2 = awningTop - nt * hh;
      ctx.fillStyle = s % 2 === 0 ? '#FFFFFF' : '#CC2222';
      ctx.beginPath();
      ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
      ctx.lineTo(sx2, sy2 + awningDrop); ctx.lineTo(sx1, sy1 + awningDrop);
      ctx.closePath(); ctx.fill();
    }
    // Right face awning
    for (let s = 0; s < stripeCount; s++) {
      const st = 0.02 + s * (0.96 / stripeCount);
      const nt = st + (0.96 / stripeCount);
      const sx1 = x + st * hw, sy1 = awningTop - st * hh;
      const sx2 = x + nt * hw, sy2 = awningTop - nt * hh;
      ctx.fillStyle = s % 2 === 0 ? '#F0F0F0' : '#AA1818'; // slightly darker on right side
      ctx.beginPath();
      ctx.moveTo(sx1, sy1); ctx.lineTo(sx2, sy2);
      ctx.lineTo(sx2, sy2 + awningDrop); ctx.lineTo(sx1, sy1 + awningDrop);
      ctx.closePath(); ctx.fill();
    }

    // ── Front door (arched, on left face) ──
    const doorT = 0.45;
    const dx = x - doorT * hw;
    const dy = y - doorT * hh;
    ctx.fillStyle = '#5C2A10';
    ctx.beginPath();
    ctx.moveTo(dx, dy); ctx.lineTo(dx - 8, dy - 4);
    ctx.lineTo(dx - 8, dy - 4 - 18);
    ctx.lineTo(dx - 4, dy - 2 - 21);
    ctx.lineTo(dx, dy - 18);
    ctx.closePath(); ctx.fill();
    // Door window — warm glow
    ctx.fillStyle = '#FFD080';
    ctx.beginPath();
    ctx.moveTo(dx - 1, dy - 10); ctx.lineTo(dx - 6, dy - 13);
    ctx.lineTo(dx - 6, dy - 17); ctx.lineTo(dx - 1, dy - 14);
    ctx.closePath(); ctx.fill();

    // ── Pizza oven glow window (left face) ──
    const ovenT = 0.15;
    const ox = x - ovenT * hw;
    const oy = y - 8 - ovenT * hh;
    ctx.fillStyle = '#FF8C00';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(ox, oy); ctx.lineTo(ox - 6, oy - 3);
    ctx.lineTo(ox - 6, oy - 3 - 8); ctx.lineTo(ox, oy - 8);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#FFCC00';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(ox - 1, oy - 2); ctx.lineTo(ox - 4, oy - 3.5);
    ctx.lineTo(ox - 4, oy - 3.5 - 4); ctx.lineTo(ox - 1, oy - 6);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // ── Windows on right face ──
    const wColor = accentColor || '#FFD080';
    ctx.fillStyle = wColor;
    for (let col = 0; col < 2; col++) {
      const t = 0.2 + col * 0.45;
      const wy = y - 10 - t * hh;
      const wx = x + t * hw;
      ctx.beginPath();
      ctx.moveTo(wx, wy); ctx.lineTo(wx + 5, wy - 2.5);
      ctx.lineTo(wx + 5, wy - 2.5 - 6); ctx.lineTo(wx, wy - 6);
      ctx.closePath(); ctx.fill();
    }

    // ── Hanging pizza sign on wooden beam — above the door, sticking OUT ──
    // Positioned on the left face above the door, projecting forward
    const beamT = 0.42;
    const beamX = x - beamT * hw;
    const beamY = y - beamT * hh - wallH + 14;

    // Wooden beam bracket (horizontal, sticking out from the wall)
    ctx.fillStyle = '#6B4420';
    // Beam extends outward (toward viewer) from the wall
    ctx.fillRect(Math.round(beamX), Math.round(beamY), 1, -12); // vertical post on wall
    ctx.fillRect(Math.round(beamX - 12), Math.round(beamY - 12), 13, 2); // horizontal beam

    // Iron bracket detail
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(beamX, beamY - 4);
    ctx.lineTo(beamX - 8, beamY - 12);
    ctx.lineTo(beamX - 8, beamY - 11);
    ctx.lineTo(beamX, beamY - 3);
    ctx.closePath(); ctx.fill();

    // Chain links hanging from beam
    const chainX = beamX - 6;
    const chainTop = beamY - 10;
    ctx.fillStyle = '#555';
    ctx.fillRect(Math.round(chainX), Math.round(chainTop), 1, 4);

    // Pizza sign — hanging from the chain, facing the viewer (flat circle)
    const pr = 10;
    const signCx = chainX;
    const signCy = chainTop + 4 + pr;

    // Sign backboard (dark circle)
    ctx.fillStyle = '#3A2010';
    ctx.beginPath(); ctx.arc(signCx, signCy, pr + 1.5, 0, Math.PI * 2); ctx.fill();

    // Pizza base — golden crust
    ctx.fillStyle = '#E8B830';
    ctx.beginPath(); ctx.arc(signCx, signCy, pr, 0, Math.PI * 2); ctx.fill();

    // Cheese layer
    ctx.fillStyle = '#F5D868';
    ctx.beginPath(); ctx.arc(signCx, signCy, pr - 2, 0, Math.PI * 2); ctx.fill();

    // Sauce peek-through
    ctx.fillStyle = '#CC4422';
    ctx.beginPath(); ctx.arc(signCx, signCy, pr - 3.5, 0, Math.PI * 2); ctx.fill();

    // Melted cheese on top
    ctx.fillStyle = '#F5D868';
    ctx.globalAlpha = 0.65;
    ctx.beginPath(); ctx.arc(signCx, signCy, pr - 4.5, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // Pepperoni — 6 scattered
    ctx.fillStyle = '#AA2211';
    const pepPos = [[-3,-4],[3,-2],[-1,3],[4,2],[-4,1],[1,-1]];
    for (const [px, py] of pepPos) {
      ctx.beginPath(); ctx.arc(signCx + px, signCy + py, 1.8, 0, Math.PI * 2); ctx.fill();
    }

    // Slice lines
    ctx.strokeStyle = 'rgba(180,140,30,0.4)';
    ctx.lineWidth = 0.7;
    ctx.beginPath(); ctx.moveTo(signCx - pr + 3, signCy); ctx.lineTo(signCx + pr - 3, signCy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(signCx, signCy - pr + 3); ctx.lineTo(signCx, signCy + pr - 3); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(signCx - pr + 5, signCy - pr + 5); ctx.lineTo(signCx + pr - 5, signCy + pr - 5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(signCx + pr - 5, signCy - pr + 5); ctx.lineTo(signCx - pr + 5, signCy + pr - 5); ctx.stroke();

    // ── Outdoor table ──
    if (level > 20) {
      const tx = x + 6;
      const ty = y + 2;
      ctx.fillStyle = '#8B6844';
      ctx.beginPath();
      ctx.moveTo(tx, ty - 5); ctx.lineTo(tx - 5, ty - 2.5);
      ctx.lineTo(tx, ty); ctx.lineTo(tx + 5, ty - 2.5);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#6B4830';
      ctx.fillRect(Math.round(tx), Math.round(ty), 1, 3);
      // Tiny chair
      ctx.fillStyle = '#555';
      ctx.fillRect(Math.round(tx + 4), Math.round(ty - 1), 2, 3);
    }
  }

  /**
   * Newspaper Route: blue-gray depot with loading dock, paper stacks,
   * delivery bicycle, newsstand rack, and "NEWS" banner.
   */
  function drawNewspaper(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.7;

    // ── Walls — industrial blue-gray ──
    // Right wall
    ctx.fillStyle = '#3E5F6F';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();
    // Corrugated metal lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    for (let i = 0; i < Math.floor(wallH / 4); i++) {
      const ry = y - 2 - i * 4;
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x + hw, ry - hh); ctx.stroke();
    }

    // Left wall (front)
    ctx.fillStyle = '#5A7A8A';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();
    // Corrugated lines
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    for (let i = 0; i < Math.floor(wallH / 4); i++) {
      const ry = y - 2 - i * 4;
      ctx.beginPath(); ctx.moveTo(x, ry); ctx.lineTo(x - hw, ry - hh); ctx.stroke();
    }

    // ── Flat roof with slight lip ──
    ctx.fillStyle = '#6A8A9A';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH);
    ctx.lineTo(x - hw - 1, y - hh - wallH);
    ctx.lineTo(x, y - hh * 2 - wallH - 1);
    ctx.lineTo(x + hw + 1, y - hh - wallH);
    ctx.closePath(); ctx.fill();
    // Roof lip edge
    ctx.fillStyle = '#4A6A7A';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x - hw - 1, y - hh - wallH);
    ctx.lineTo(x - hw - 1, y - hh - wallH + 2); ctx.lineTo(x, y - wallH + 2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x + hw + 1, y - hh - wallH);
    ctx.lineTo(x + hw + 1, y - hh - wallH + 2); ctx.lineTo(x, y - wallH + 2);
    ctx.closePath(); ctx.fill();

    // ── Loading dock opening on left face ──
    const dockT = 0.3;
    const dockX = x - dockT * hw;
    const dockY = y - dockT * hh;
    const dockW = 16;
    const dockH = wallH * 0.6;

    // Dock frame
    ctx.fillStyle = '#445566';
    ctx.beginPath();
    ctx.moveTo(dockX + 1, dockY + 1);
    ctx.lineTo(dockX - dockW - 1, dockY - (dockW + 1) * 0.5);
    ctx.lineTo(dockX - dockW - 1, dockY - (dockW + 1) * 0.5 - dockH - 1);
    ctx.lineTo(dockX + 1, dockY - dockH - 1);
    ctx.closePath(); ctx.fill();

    // Dock interior
    ctx.fillStyle = '#1A2530';
    ctx.beginPath();
    ctx.moveTo(dockX, dockY);
    ctx.lineTo(dockX - dockW, dockY - dockW * 0.5);
    ctx.lineTo(dockX - dockW, dockY - dockW * 0.5 - dockH);
    ctx.lineTo(dockX, dockY - dockH);
    ctx.closePath(); ctx.fill();

    // ── Paper stacks inside dock ──
    const stackColors = ['#F0EDE0', '#E8E4D8', '#F5F2E8', '#EAE6DA'];
    for (let s = 0; s < Math.min(4, 1 + Math.floor(level / 20)); s++) {
      const st = 0.15 + s * 0.2;
      const sx = dockX - st * dockW;
      const sy = dockY - st * dockW * 0.5;
      const stackH = 4 + s * 2;
      ctx.fillStyle = stackColors[s % stackColors.length];
      // Small iso box for paper bundle
      ctx.beginPath();
      ctx.moveTo(sx, sy); ctx.lineTo(sx - 4, sy - 2);
      ctx.lineTo(sx - 4, sy - 2 - stackH); ctx.lineTo(sx, sy - stackH);
      ctx.closePath(); ctx.fill();
      // Top face
      ctx.fillStyle = '#FFFEF5';
      ctx.beginPath();
      ctx.moveTo(sx, sy - stackH); ctx.lineTo(sx - 4, sy - 2 - stackH);
      ctx.lineTo(sx - 2, sy - 3 - stackH); ctx.lineTo(sx + 2, sy - 1 - stackH);
      ctx.closePath(); ctx.fill();
    }

    // ── Roll-up door lines on dock frame ──
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 4; i++) {
      const ry = dockY - dockH + 3 + i * 5;
      ctx.beginPath();
      ctx.moveTo(dockX, ry); ctx.lineTo(dockX - dockW, ry - dockW * 0.5);
      ctx.stroke();
    }

    // ── Windows on right face ──
    const wColor = accentColor || '#A0C0D0';
    ctx.fillStyle = wColor;
    const winCount = Math.min(3, 1 + Math.floor(level / 25));
    for (let col = 0; col < winCount; col++) {
      const t = 0.15 + col * 0.3;
      const wy = y - wallH * 0.4 - t * hh;
      const wx = x + t * hw;
      ctx.beginPath();
      ctx.moveTo(wx, wy); ctx.lineTo(wx + 5, wy - 2.5);
      ctx.lineTo(wx + 5, wy - 2.5 - 7); ctx.lineTo(wx, wy - 7);
      ctx.closePath(); ctx.fill();
    }

    // ── "NEWS" banner on front wall (above dock) ──
    const bannerTop = y - wallH + 3;
    const bannerBot = bannerTop + 8;
    // White banner band
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(x - 1, bannerTop + 1); ctx.lineTo(x - hw + 4, bannerTop - hh + 3);
    ctx.lineTo(x - hw + 4, bannerBot - hh + 3); ctx.lineTo(x - 1, bannerBot + 1);
    ctx.closePath(); ctx.fill();
    // Dark text blocks
    ctx.fillStyle = '#1A2530';
    for (let l = 0; l < 4; l++) {
      const lt = 0.1 + l * 0.2;
      const lx = x - 1 - lt * (hw - 5);
      const ly = bannerTop + 2 - lt * hh;
      ctx.fillRect(Math.round(lx), Math.round(ly), 3, 5);
    }

    // ── Delivery bicycle parked outside ──
    if (level > 10) {
      const bx = x + 8;
      const by = y + 1;
      // Wheels (two small circles)
      ctx.strokeStyle = '#555';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(bx, by, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(bx + 7, by - 3.5, 3, 0, Math.PI * 2); ctx.stroke();
      // Frame
      ctx.strokeStyle = '#3498DB';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 4, by - 6);
      ctx.lineTo(bx + 7, by - 3.5); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + 7, by - 3.5); ctx.stroke();
      // Handlebars
      ctx.beginPath(); ctx.moveTo(bx + 3, by - 7); ctx.lineTo(bx + 5, by - 7); ctx.stroke();
      // Basket with papers
      ctx.fillStyle = '#8B7355';
      ctx.fillRect(Math.round(bx + 2), Math.round(by - 8), 4, 3);
      ctx.fillStyle = '#F0EDE0';
      ctx.fillRect(Math.round(bx + 2.5), Math.round(by - 9), 3, 2);
    }

    // ── Newsstand rack on right side ──
    if (level > 30) {
      const nx = x + hw * 0.7;
      const ny = y - hh * 0.7;
      // Stand frame
      ctx.fillStyle = '#6B4420';
      ctx.beginPath();
      ctx.moveTo(nx, ny); ctx.lineTo(nx + 4, ny - 2);
      ctx.lineTo(nx + 4, ny - 12); ctx.lineTo(nx, ny - 10);
      ctx.closePath(); ctx.fill();
      // Papers in stand
      ctx.fillStyle = '#F5F2E8';
      ctx.fillRect(Math.round(nx + 0.5), Math.round(ny - 9), 3, 6);
      ctx.fillStyle = '#DDD';
      ctx.fillRect(Math.round(nx + 0.5), Math.round(ny - 8.5), 3, 1);
      ctx.fillRect(Math.round(nx + 0.5), Math.round(ny - 6), 3, 1);
    }
  }

  /**
   * Gym: wide squat orange building with large front windows showing weights,
   * dumbbell sign, punching bag, and bench press silhouette.
   */
  function drawGym(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.75;

    // ── Walls — orange/rust ──
    // Right wall
    ctx.fillStyle = '#B86018';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // Left wall (front)
    ctx.fillStyle = '#D88030';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // Dark accent band at bottom of both faces
    ctx.fillStyle = '#333';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - 6); ctx.lineTo(x, y - 6);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - 6); ctx.lineTo(x, y - 6);
    ctx.closePath(); ctx.fill();

    // ── Flat roof ──
    ctx.fillStyle = '#E89040';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH);
    ctx.lineTo(x - hw, y - hh - wallH);
    ctx.lineTo(x, y - hh * 2 - wallH);
    ctx.lineTo(x + hw, y - hh - wallH);
    ctx.closePath(); ctx.fill();

    // ── Large front windows on left face (showing gym interior) ──
    for (let i = 0; i < 2; i++) {
      const t = 0.15 + i * 0.4;
      const wx = x - t * hw;
      const wy = y - 10 - t * hh;
      const winW = 10;
      const winH = wallH * 0.55;

      // Window frame
      ctx.fillStyle = '#222';
      ctx.beginPath();
      ctx.moveTo(wx + 1, wy + 1);
      ctx.lineTo(wx - winW - 1, wy - (winW + 1) * 0.5);
      ctx.lineTo(wx - winW - 1, wy - (winW + 1) * 0.5 - winH - 1);
      ctx.lineTo(wx + 1, wy - winH);
      ctx.closePath(); ctx.fill();

      // Window glass — warm interior light
      ctx.fillStyle = '#FFE8A0';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(wx, wy);
      ctx.lineTo(wx - winW, wy - winW * 0.5);
      ctx.lineTo(wx - winW, wy - winW * 0.5 - winH);
      ctx.lineTo(wx, wy - winH);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;

      // Equipment silhouettes inside windows
      if (i === 0 && level > 10) {
        // Dumbbell rack silhouette
        ctx.fillStyle = 'rgba(80,60,40,0.5)';
        const eqX = wx - winW * 0.5;
        const eqY = wy - winW * 0.25 - 4;
        // Vertical bar
        ctx.fillRect(Math.round(eqX), Math.round(eqY - winH * 0.4), 1, Math.round(winH * 0.35));
        // Weight plates
        ctx.fillRect(Math.round(eqX - 2), Math.round(eqY - winH * 0.35), 5, 2);
        ctx.fillRect(Math.round(eqX - 2), Math.round(eqY - winH * 0.15), 5, 2);
      }
      if (i === 1 && level > 20) {
        // Punching bag silhouette
        ctx.fillStyle = 'rgba(120,40,40,0.5)';
        const pbX = wx - winW * 0.5;
        const pbY = wy - winW * 0.25 - winH * 0.3;
        // Chain
        ctx.fillRect(Math.round(pbX), Math.round(pbY - 8), 1, 5);
        // Bag (oval-ish)
        ctx.beginPath();
        ctx.arc(pbX, pbY, 3, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(Math.round(pbX - 2), Math.round(pbY), 4, 6);
      }
    }

    // ── Dumbbell sign hanging above door ──
    const signX = x - 0.5 * hw;
    const signY = y - 0.5 * hh - wallH + 6;
    // Beam
    ctx.fillStyle = '#555';
    ctx.fillRect(Math.round(signX), Math.round(signY), 1, -8);
    ctx.fillRect(Math.round(signX - 10), Math.round(signY - 8), 11, 1);
    // Dumbbell icon hanging
    const dbY = signY - 2;
    const dbX = signX - 5;
    // Bar
    ctx.fillStyle = '#888';
    ctx.fillRect(Math.round(dbX - 5), Math.round(dbY), 10, 2);
    // Weight plates
    ctx.fillStyle = '#444';
    ctx.fillRect(Math.round(dbX - 6), Math.round(dbY - 2), 3, 6);
    ctx.fillRect(Math.round(dbX + 3), Math.round(dbY - 2), 3, 6);

    // ── Front door ──
    const doorT = 0.48;
    const dx = x - doorT * hw;
    const dy = y - doorT * hh;
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(dx, dy); ctx.lineTo(dx - 7, dy - 3.5);
    ctx.lineTo(dx - 7, dy - 3.5 - 16); ctx.lineTo(dx, dy - 16);
    ctx.closePath(); ctx.fill();
    // Door handle
    ctx.fillStyle = '#AAA';
    ctx.fillRect(Math.round(dx - 2), Math.round(dy - 8), 1, 3);

    // ── Windows on right face ──
    const wColor = accentColor || '#FFE0A0';
    ctx.fillStyle = wColor;
    ctx.globalAlpha = 0.5;
    for (let col = 0; col < 2; col++) {
      const t = 0.2 + col * 0.4;
      const wy2 = y - wallH * 0.35 - t * hh;
      const wx2 = x + t * hw;
      ctx.beginPath();
      ctx.moveTo(wx2, wy2); ctx.lineTo(wx2 + 6, wy2 - 3);
      ctx.lineTo(wx2 + 6, wy2 - 3 - 10); ctx.lineTo(wx2, wy2 - 10);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── "GYM" text on right wall ──
    ctx.fillStyle = '#FFF';
    ctx.globalAlpha = 0.3;
    for (let l = 0; l < 3; l++) {
      const lt = 0.25 + l * 0.2;
      const lx = x + lt * hw;
      const ly = y - wallH * 0.7 - lt * hh;
      ctx.fillRect(Math.round(lx), Math.round(ly), 4, 6);
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Arcade: purple/neon building with pixel art game cabinets,
   * glowing neon sign, joystick icon, colorful windows.
   */
  function drawArcade(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.75;

    // ── Walls — dark purple ──
    // Right wall
    ctx.fillStyle = '#5A2D7A';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // Left wall (front)
    ctx.fillStyle = '#7B3D96';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // ── Neon trim at top of both walls ──
    // Left face — magenta neon line
    ctx.fillStyle = '#FF00FF';
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.moveTo(x, y - wallH + 2); ctx.lineTo(x - hw, y - hh - wallH + 2);
    ctx.lineTo(x - hw, y - hh - wallH + 4); ctx.lineTo(x, y - wallH + 4);
    ctx.closePath(); ctx.fill();
    // Right face — cyan neon line
    ctx.fillStyle = '#00FFFF';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH + 2); ctx.lineTo(x + hw, y - hh - wallH + 2);
    ctx.lineTo(x + hw, y - hh - wallH + 4); ctx.lineTo(x, y - wallH + 4);
    ctx.closePath(); ctx.fill();
    // Bottom neon trim
    ctx.fillStyle = '#FF00FF';
    ctx.beginPath();
    ctx.moveTo(x, y - 1); ctx.lineTo(x - hw, y - hh - 1);
    ctx.lineTo(x - hw, y - hh + 1); ctx.lineTo(x, y + 1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#00FFFF';
    ctx.beginPath();
    ctx.moveTo(x, y - 1); ctx.lineTo(x + hw, y - hh - 1);
    ctx.lineTo(x + hw, y - hh + 1); ctx.lineTo(x, y + 1);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // ── Flat roof ──
    ctx.fillStyle = '#6A3DA0';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH);
    ctx.lineTo(x - hw, y - hh - wallH);
    ctx.lineTo(x, y - hh * 2 - wallH);
    ctx.lineTo(x + hw, y - hh - wallH);
    ctx.closePath(); ctx.fill();

    // ── Game cabinet silhouettes on left face (3 cabinets) ──
    const cabCount = 3;
    for (let i = 0; i < cabCount; i++) {
      const t = 0.12 + i * 0.28;
      const cx = x - t * hw;
      const cy = y - 8 - t * hh;
      const cabW = 6;
      const cabH = wallH * 0.5;

      // Cabinet body (dark)
      ctx.fillStyle = '#2A1540';
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx - cabW, cy - cabW * 0.5);
      ctx.lineTo(cx - cabW, cy - cabW * 0.5 - cabH); ctx.lineTo(cx, cy - cabH);
      ctx.closePath(); ctx.fill();

      // Screen (colorful glow)
      const screenColors = ['#00FF88', '#FF4488', '#44AAFF'];
      ctx.fillStyle = screenColors[i % screenColors.length];
      ctx.globalAlpha = 0.7;
      const scrY = cy - cabH * 0.3;
      ctx.beginPath();
      ctx.moveTo(cx - 1, scrY); ctx.lineTo(cx - cabW + 1, scrY - (cabW - 2) * 0.5);
      ctx.lineTo(cx - cabW + 1, scrY - (cabW - 2) * 0.5 - cabH * 0.35);
      ctx.lineTo(cx - 1, scrY - cabH * 0.35);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Neon "ARCADE" sign — hanging from beam above door ──
    const beamT = 0.45;
    const beamX = x - beamT * hw;
    const beamY = y - beamT * hh - wallH + 8;

    // Beam
    ctx.fillStyle = '#555';
    ctx.fillRect(Math.round(beamX), Math.round(beamY), 1, -10);
    ctx.fillRect(Math.round(beamX - 14), Math.round(beamY - 10), 15, 2);

    // Sign board
    const signX = beamX - 7;
    const signY = beamY - 6;
    ctx.fillStyle = '#1A0A30';
    ctx.fillRect(Math.round(signX - 8), Math.round(signY), 16, 10);
    // Border glow
    ctx.strokeStyle = '#FF00FF';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(signX - 8), Math.round(signY), 16, 10);

    // Neon text impression (colored dots for letters)
    ctx.fillStyle = '#FF00FF';
    for (let l = 0; l < 6; l++) {
      ctx.fillRect(Math.round(signX - 6 + l * 2.5), Math.round(signY + 3), 1.5, 4);
    }

    // ── Joystick icon on right wall ──
    const jx = x + hw * 0.5;
    const jy = y - wallH * 0.5 - hh * 0.5;
    // Base
    ctx.fillStyle = '#FF00FF';
    ctx.globalAlpha = 0.5;
    ctx.fillRect(Math.round(jx - 4), Math.round(jy + 2), 8, 3);
    // Stick
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(Math.round(jx), Math.round(jy - 6), 2, 8);
    // Ball top
    ctx.fillStyle = '#FF4444';
    ctx.beginPath(); ctx.arc(jx + 1, jy - 6, 3, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;

    // ── Door ──
    const doorT = 0.5;
    const dx = x - doorT * hw;
    const dy = y - doorT * hh;
    ctx.fillStyle = '#2A1540';
    ctx.beginPath();
    ctx.moveTo(dx, dy); ctx.lineTo(dx - 7, dy - 3.5);
    ctx.lineTo(dx - 7, dy - 3.5 - 16); ctx.lineTo(dx, dy - 16);
    ctx.closePath(); ctx.fill();
    // Door neon frame
    ctx.strokeStyle = '#00FFFF';
    ctx.lineWidth = 1;
    ctx.stroke();

    // ── Colorful windows on right face ──
    const neonColors = ['#FF00FF', '#00FFFF', '#FFFF00', '#FF4444'];
    for (let col = 0; col < 2; col++) {
      const t = 0.2 + col * 0.4;
      const wy = y - 12 - t * hh;
      const wx = x + t * hw;
      ctx.fillStyle = neonColors[col % neonColors.length];
      ctx.globalAlpha = 0.4;
      ctx.beginPath();
      ctx.moveTo(wx, wy); ctx.lineTo(wx + 5, wy - 2.5);
      ctx.lineTo(wx + 5, wy - 2.5 - 8); ctx.lineTo(wx, wy - 8);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /**
   * Stock Mogul: sleek green glass office tower with stock ticker,
   * dollar sign, chart line, and gold trim.
   */
  function drawStockMogul(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.85;

    // ── Glass walls — dark green ──
    ctx.fillStyle = '#1D6B42';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#2E8B57';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // ── Gold trim at base ──
    ctx.fillStyle = '#D4A017';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - 4); ctx.lineTo(x, y - 4);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - 4); ctx.lineTo(x, y - 4);
    ctx.closePath(); ctx.fill();

    // ── Gold trim at top ──
    ctx.fillStyle = '#D4A017';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x - hw, y - hh - wallH);
    ctx.lineTo(x - hw, y - hh - wallH + 3); ctx.lineTo(x, y - wallH + 3);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x + hw, y - hh - wallH);
    ctx.lineTo(x + hw, y - hh - wallH + 3); ctx.lineTo(x, y - wallH + 3);
    ctx.closePath(); ctx.fill();

    // ── Flat roof ──
    ctx.fillStyle = '#3AAA6A';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x - hw, y - hh - wallH);
    ctx.lineTo(x, y - hh * 2 - wallH); ctx.lineTo(x + hw, y - hh - wallH);
    ctx.closePath(); ctx.fill();

    // ── Glass panel windows on left face (reflective green) ──
    const wColor = accentColor || '#4AE090';
    ctx.fillStyle = wColor;
    ctx.globalAlpha = 0.35;
    const panelRows = Math.min(5, Math.floor(wallH / 14));
    for (let row = 0; row < panelRows; row++) {
      for (let col = 0; col < 3; col++) {
        const t = 0.1 + col * 0.28;
        const wy = y - 10 - row * 14 - t * hh;
        const wx = x - t * hw;
        ctx.beginPath();
        ctx.moveTo(wx, wy); ctx.lineTo(wx - 6, wy - 3);
        ctx.lineTo(wx - 6, wy - 3 - 8); ctx.lineTo(wx, wy - 8);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // ── Glass panels on right face ──
    ctx.fillStyle = wColor;
    ctx.globalAlpha = 0.25;
    for (let row = 0; row < panelRows; row++) {
      for (let col = 0; col < 3; col++) {
        const t = 0.1 + col * 0.28;
        const wy = y - 10 - row * 14 - t * hh;
        const wx = x + t * hw;
        ctx.beginPath();
        ctx.moveTo(wx, wy); ctx.lineTo(wx + 6, wy - 3);
        ctx.lineTo(wx + 6, wy - 3 - 8); ctx.lineTo(wx, wy - 8);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // ── Stock chart line on right wall ──
    if (level > 10) {
      ctx.strokeStyle = '#00FF88';
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.6;
      const chartY = y - wallH * 0.45;
      const chartPoints = [0, -3, -1, -6, -4, -9, -7, -12, -8];
      ctx.beginPath();
      for (let i = 0; i < chartPoints.length; i++) {
        const ct = 0.1 + i * 0.1;
        const cx = x + ct * hw;
        const cy = chartY - ct * hh + chartPoints[i];
        if (i === 0) ctx.moveTo(cx, cy); else ctx.lineTo(cx, cy);
      }
      ctx.stroke();
      // Arrow up at the end
      const lastT = 0.1 + (chartPoints.length - 1) * 0.1;
      const ax = x + lastT * hw;
      const ay = chartY - lastT * hh + chartPoints[chartPoints.length - 1];
      ctx.fillStyle = '#00FF88';
      ctx.beginPath();
      ctx.moveTo(ax, ay - 3); ctx.lineTo(ax - 2, ay); ctx.lineTo(ax + 2, ay);
      ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Dollar sign on front wall ──
    if (level > 15) {
      const dsT = 0.55;
      const dsx = x - dsT * hw;
      const dsy = y - wallH * 0.5 - dsT * hh;
      ctx.fillStyle = '#D4A017';
      ctx.globalAlpha = 0.5;
      ctx.font = 'bold 14px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('$', dsx, dsy + 5);
      ctx.globalAlpha = 1;
    }

    // ── Door ──
    const doorT = 0.42;
    const dx = x - doorT * hw;
    const dy = y - doorT * hh;
    ctx.fillStyle = '#155535';
    ctx.beginPath();
    ctx.moveTo(dx, dy); ctx.lineTo(dx - 7, dy - 3.5);
    ctx.lineTo(dx - 7, dy - 3.5 - 16); ctx.lineTo(dx, dy - 16);
    ctx.closePath(); ctx.fill();
    // Gold door handle
    ctx.fillStyle = '#D4A017';
    ctx.fillRect(Math.round(dx - 2), Math.round(dy - 8), 1, 3);
  }

  /**
   * Movie Theater: red/gold building with marquee sign, ticket booth,
   * film reel icon, curtained entrance, and star decorations.
   */
  function drawCinema(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.7;

    // ── Walls — deep red ──
    ctx.fillStyle = '#8A2020';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#B83030';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // ── Gold ornate trim at top ──
    ctx.fillStyle = '#D4A017';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x - hw - 1, y - hh - wallH);
    ctx.lineTo(x - hw - 1, y - hh - wallH + 5); ctx.lineTo(x, y - wallH + 5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x + hw + 1, y - hh - wallH);
    ctx.lineTo(x + hw + 1, y - hh - wallH + 5); ctx.lineTo(x, y - wallH + 5);
    ctx.closePath(); ctx.fill();

    // ── Decorative parapet / stepped top ──
    const parapetH = h * 0.2;
    ctx.fillStyle = '#CC3535';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH - parapetH);
    ctx.lineTo(x - hw * 0.7, y - hh * 0.7 - wallH - parapetH);
    ctx.lineTo(x - hw * 0.7, y - hh * 0.7 - wallH);
    ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#992828';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH - parapetH);
    ctx.lineTo(x + hw * 0.7, y - hh * 0.7 - wallH - parapetH);
    ctx.lineTo(x + hw * 0.7, y - hh * 0.7 - wallH);
    ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();
    // Parapet top face
    ctx.fillStyle = '#DD4040';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH - parapetH);
    ctx.lineTo(x - hw * 0.7, y - hh * 0.7 - wallH - parapetH);
    ctx.lineTo(x, y - hh * 1.4 - wallH - parapetH);
    ctx.lineTo(x + hw * 0.7, y - hh * 0.7 - wallH - parapetH);
    ctx.closePath(); ctx.fill();

    // ── Marquee sign on front (left face) — lit up panel ──
    const mqTop = y - wallH + 8;
    const mqH = 14;
    // Sign background — bright warm yellow
    ctx.fillStyle = '#FFE85C';
    ctx.beginPath();
    ctx.moveTo(x + 1, mqTop); ctx.lineTo(x - hw + 2, mqTop - hh + 1);
    ctx.lineTo(x - hw + 2, mqTop + mqH - hh + 1); ctx.lineTo(x + 1, mqTop + mqH);
    ctx.closePath(); ctx.fill();
    // Sign border — gold frame
    ctx.strokeStyle = '#B8860B';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Marquee bulbs along top edge
    ctx.fillStyle = '#FFFFFF';
    for (let b = 0; b < 6; b++) {
      const bt = 0.08 + b * 0.15;
      const bx = x + 1 - bt * (hw - 3);
      const by = mqTop - 1 - bt * (hh - 1);
      ctx.beginPath(); ctx.arc(bx, by, 1.2, 0, Math.PI * 2); ctx.fill();
    }
    // Marquee bulbs along bottom edge
    for (let b = 0; b < 6; b++) {
      const bt = 0.08 + b * 0.15;
      const bx = x + 1 - bt * (hw - 3);
      const by = mqTop + mqH - bt * (hh - 1);
      ctx.beginPath(); ctx.arc(bx, by, 1.2, 0, Math.PI * 2); ctx.fill();
    }

    // Movie title text blocks on marquee
    ctx.fillStyle = '#8B0000';
    for (let l = 0; l < 5; l++) {
      const lt = 0.1 + l * 0.16;
      const lx = x - lt * (hw - 4);
      const ly = mqTop + 4 - lt * hh;
      ctx.fillRect(Math.round(lx), Math.round(ly), 3, 5);
    }

    // ── Curtained entrance on left face ──
    const doorT = 0.4;
    const dx = x - doorT * hw;
    const dy = y - doorT * hh;
    const doorW = 10;
    const doorH = 20;

    // Door opening
    ctx.fillStyle = '#1A0808';
    ctx.beginPath();
    ctx.moveTo(dx, dy); ctx.lineTo(dx - doorW, dy - doorW * 0.5);
    ctx.lineTo(dx - doorW, dy - doorW * 0.5 - doorH); ctx.lineTo(dx, dy - doorH);
    ctx.closePath(); ctx.fill();

    // Red curtain — left drape
    ctx.fillStyle = '#CC2222';
    ctx.beginPath();
    ctx.moveTo(dx, dy - doorH); ctx.lineTo(dx - 3, dy - doorH * 0.4);
    ctx.lineTo(dx, dy); ctx.closePath(); ctx.fill();
    // Right drape
    ctx.fillStyle = '#AA1818';
    ctx.beginPath();
    ctx.moveTo(dx - doorW, dy - doorW * 0.5 - doorH);
    ctx.lineTo(dx - doorW + 3, dy - doorW * 0.5 - doorH * 0.4);
    ctx.lineTo(dx - doorW, dy - doorW * 0.5); ctx.closePath(); ctx.fill();

    // ── Film reel on right wall ──
    if (level > 15) {
      const rx = x + hw * 0.5;
      const ry = y - wallH * 0.45 - hh * 0.5;
      const rr = 7;
      // Reel circle
      ctx.strokeStyle = '#D4A017';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.stroke();
      // Center hub
      ctx.fillStyle = '#D4A017';
      ctx.beginPath(); ctx.arc(rx, ry, 2, 0, Math.PI * 2); ctx.fill();
      // Spokes
      for (let s = 0; s < 4; s++) {
        const angle = s * Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(rx + Math.cos(angle) * 2, ry + Math.sin(angle) * 2);
        ctx.lineTo(rx + Math.cos(angle) * rr, ry + Math.sin(angle) * rr);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // ── Star decorations on parapet ──
    ctx.fillStyle = '#FFD700';
    const starPositions = [[0.15, -0.5], [0.4, -0.5], [0.65, -0.5]];
    for (const [st, _] of starPositions) {
      const sx = x - st * hw * 0.7;
      const sy = y - wallH - parapetH * 0.5 - st * hh * 0.7;
      // Simple 4-point star
      ctx.beginPath();
      ctx.moveTo(sx, sy - 2.5); ctx.lineTo(sx - 1, sy); ctx.lineTo(sx, sy + 2.5);
      ctx.lineTo(sx + 1, sy); ctx.closePath(); ctx.fill();
    }

    // ── Ticket booth on right side ──
    if (level > 20) {
      const tbx = x + hw * 0.8;
      const tby = y - hh * 0.8;
      // Small booth box
      ctx.fillStyle = '#992828';
      ctx.beginPath();
      ctx.moveTo(tbx, tby); ctx.lineTo(tbx + 5, tby - 2.5);
      ctx.lineTo(tbx + 5, tby - 12); ctx.lineTo(tbx, tby - 10);
      ctx.closePath(); ctx.fill();
      // Booth window
      ctx.fillStyle = '#FFE85C';
      ctx.beginPath();
      ctx.moveTo(tbx + 0.5, tby - 4); ctx.lineTo(tbx + 4, tby - 6);
      ctx.lineTo(tbx + 4, tby - 9); ctx.lineTo(tbx + 0.5, tby - 7);
      ctx.closePath(); ctx.fill();
      // Roof
      ctx.fillStyle = '#CC3535';
      ctx.beginPath();
      ctx.moveTo(tbx - 1, tby - 10); ctx.lineTo(tbx + 6, tby - 13);
      ctx.lineTo(tbx + 6, tby - 12); ctx.lineTo(tbx - 1, tby - 9);
      ctx.closePath(); ctx.fill();
    }
  }

  /**
   * Tech Startup: modern glass tower with blue/silver facade,
   * server rack visible, antenna on roof, wifi symbol, glowing screens.
   */
  function drawStartup(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.85;

    // ── Glass walls — blue/silver ──
    ctx.fillStyle = '#1E5A8A';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#2878B5';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // ── Silver trim bands ──
    ctx.fillStyle = '#B0C4D8';
    for (let band = 0; band < 3; band++) {
      const by = y - wallH * (0.3 + band * 0.3);
      ctx.beginPath();
      ctx.moveTo(x, by); ctx.lineTo(x - hw, by - hh); ctx.lineTo(x - hw, by - hh - 2); ctx.lineTo(x, by - 2);
      ctx.closePath(); ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x, by); ctx.lineTo(x + hw, by - hh); ctx.lineTo(x + hw, by - hh - 2); ctx.lineTo(x, by - 2);
      ctx.closePath(); ctx.fill();
    }

    // ── Flat roof ──
    ctx.fillStyle = '#3090CC';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x - hw, y - hh - wallH);
    ctx.lineTo(x, y - hh * 2 - wallH); ctx.lineTo(x + hw, y - hh - wallH);
    ctx.closePath(); ctx.fill();

    // ── Blue glass windows on both faces ──
    const wColor = accentColor || '#5CC8FF';
    const panelRows = Math.min(5, Math.floor(wallH / 16));
    for (let row = 0; row < panelRows; row++) {
      for (let col = 0; col < 3; col++) {
        const t = 0.1 + col * 0.28;
        const wy = y - 10 - row * 16 - t * hh;
        // Left face
        ctx.fillStyle = wColor;
        ctx.globalAlpha = 0.35;
        const wx = x - t * hw;
        ctx.beginPath();
        ctx.moveTo(wx, wy); ctx.lineTo(wx - 5, wy - 2.5);
        ctx.lineTo(wx - 5, wy - 2.5 - 8); ctx.lineTo(wx, wy - 8);
        ctx.closePath(); ctx.fill();
        // Right face
        const wx2 = x + t * hw;
        ctx.globalAlpha = 0.25;
        ctx.beginPath();
        ctx.moveTo(wx2, wy); ctx.lineTo(wx2 + 5, wy - 2.5);
        ctx.lineTo(wx2 + 5, wy - 2.5 - 8); ctx.lineTo(wx2, wy - 8);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;

    // ── Antenna + beacon on roof ──
    if (level > 15) {
      const ax = x;
      const ay = y - wallH - hh;
      ctx.fillStyle = '#888';
      ctx.fillRect(Math.round(ax), Math.round(ay - 18), 1, 18);
      // Cross bars
      ctx.fillRect(Math.round(ax - 3), Math.round(ay - 14), 7, 1);
      ctx.fillRect(Math.round(ax - 2), Math.round(ay - 10), 5, 1);
      // Red beacon
      ctx.fillStyle = '#FF0000';
      ctx.beginPath(); ctx.arc(ax + 0.5, ay - 19, 2, 0, Math.PI * 2); ctx.fill();
    }

    // ── WiFi/signal icon on front wall ──
    if (level > 20) {
      const wfT = 0.6;
      const wfx = x - wfT * hw;
      const wfy = y - wallH * 0.4 - wfT * hh;
      ctx.strokeStyle = '#5CC8FF';
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1;
      for (let arc = 0; arc < 3; arc++) {
        const r = 3 + arc * 3;
        ctx.beginPath(); ctx.arc(wfx, wfy + 4, r, -Math.PI * 0.8, -Math.PI * 0.2); ctx.stroke();
      }
      ctx.fillStyle = '#5CC8FF';
      ctx.beginPath(); ctx.arc(wfx, wfy + 4, 1.5, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Door — glass with silver frame ──
    const doorT = 0.42;
    const dx = x - doorT * hw;
    const dy = y - doorT * hh;
    ctx.fillStyle = '#1A4060';
    ctx.beginPath();
    ctx.moveTo(dx, dy); ctx.lineTo(dx - 7, dy - 3.5);
    ctx.lineTo(dx - 7, dy - 3.5 - 16); ctx.lineTo(dx, dy - 16);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#B0C4D8';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /**
   * Bank: classical gold/marble building with columns, pediment (triangular top),
   * vault door, dollar emblem, and grand steps.
   */
  function drawBank(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.65;

    // ── Marble walls ──
    ctx.fillStyle = '#9A8010';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#C4A820';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // ── Grand steps at base ──
    for (let step = 0; step < 3; step++) {
      const stepH = 2;
      const sy = y + step * stepH + 1;
      const expand = step * 2;
      ctx.fillStyle = step % 2 === 0 ? '#E8DCC0' : '#D4C8A8';
      // Left face step
      ctx.beginPath();
      ctx.moveTo(x + expand, sy); ctx.lineTo(x - hw - expand, sy - hh);
      ctx.lineTo(x - hw - expand, sy - hh - stepH); ctx.lineTo(x + expand, sy - stepH);
      ctx.closePath(); ctx.fill();
    }

    // ── Classical pediment (triangular top) ──
    const pedH = h * 0.3 + 6;
    // Left face triangle
    ctx.fillStyle = '#D4B830';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x - hw, y - hh - wallH);
    ctx.lineTo(x - hw * 0.5, y - hh * 0.5 - wallH - pedH);
    ctx.closePath(); ctx.fill();
    // Right face triangle
    ctx.fillStyle = '#AA9018';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x + hw, y - hh - wallH);
    ctx.lineTo(x + hw * 0.5, y - hh * 0.5 - wallH - pedH);
    ctx.closePath(); ctx.fill();
    // Pediment front edge
    ctx.fillStyle = '#E8C838';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH);
    ctx.lineTo(x - hw * 0.5, y - hh * 0.5 - wallH - pedH);
    ctx.lineTo(x + hw * 0.5, y - hh * 0.5 - wallH - pedH);
    ctx.closePath(); ctx.fill();

    // ── Columns on left face ──
    ctx.fillStyle = '#F0E4C8';
    for (let i = 0; i < 4; i++) {
      const t = 0.1 + i * 0.22;
      const cx = x - t * hw;
      const cy = y - 6 - t * hh;
      const colH = wallH - 10;
      // Column shaft
      ctx.beginPath();
      ctx.moveTo(cx, cy); ctx.lineTo(cx - 2, cy - 1);
      ctx.lineTo(cx - 2, cy - 1 - colH); ctx.lineTo(cx, cy - colH);
      ctx.closePath(); ctx.fill();
      // Capital (top)
      ctx.fillStyle = '#FFF8E0';
      ctx.beginPath();
      ctx.moveTo(cx + 1, cy - colH + 1); ctx.lineTo(cx - 3, cy - 1 - colH);
      ctx.lineTo(cx - 3, cy - 3 - colH); ctx.lineTo(cx + 1, cy - colH - 1);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#F0E4C8';
    }

    // ── Vault door on left face ──
    const doorT = 0.45;
    const dx = x - doorT * hw;
    const dy = y - doorT * hh;
    // Dark doorframe
    ctx.fillStyle = '#3A3020';
    ctx.beginPath();
    ctx.moveTo(dx + 1, dy + 1); ctx.lineTo(dx - 10, dy - 4);
    ctx.lineTo(dx - 10, dy - 4 - 20); ctx.lineTo(dx + 1, dy - 19);
    ctx.closePath(); ctx.fill();
    // Vault door face — steel gray
    ctx.fillStyle = '#778899';
    ctx.beginPath();
    ctx.moveTo(dx, dy); ctx.lineTo(dx - 9, dy - 4.5);
    ctx.lineTo(dx - 9, dy - 4.5 - 18); ctx.lineTo(dx, dy - 18);
    ctx.closePath(); ctx.fill();
    // Vault wheel (circle)
    const vx = dx - 4.5;
    const vy = dy - 11;
    ctx.strokeStyle = '#D4A017';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.arc(vx, vy, 4, 0, Math.PI * 2); ctx.stroke();
    // Wheel spokes
    ctx.lineWidth = 1;
    for (let s = 0; s < 4; s++) {
      const angle = s * Math.PI / 2 + Math.PI / 4;
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(vx + Math.cos(angle) * 3.5, vy + Math.sin(angle) * 3.5);
      ctx.stroke();
    }

    // ── Dollar emblem in pediment ──
    const embX = x;
    const embY = y - wallH - pedH * 0.4;
    ctx.fillStyle = '#8B7010';
    ctx.font = 'bold 12px serif';
    ctx.textAlign = 'center';
    ctx.fillText('$', embX, embY + 4);

    // ── Windows on right face ──
    const wColor = accentColor || '#F0E8C8';
    ctx.fillStyle = wColor;
    ctx.globalAlpha = 0.4;
    for (let row = 0; row < 2; row++) {
      for (let col = 0; col < 2; col++) {
        const t = 0.15 + col * 0.4;
        const wy = y - 12 - row * 18 - t * hh;
        const wx = x + t * hw;
        ctx.beginPath();
        ctx.moveTo(wx, wy); ctx.lineTo(wx + 5, wy - 2.5);
        ctx.lineTo(wx + 5, wy - 2.5 - 8); ctx.lineTo(wx, wy - 8);
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  /**
   * Space Agency: teal/chrome building with rocket on launch pad,
   * control tower, satellite dish, and exhaust vents.
   */
  function drawSpace(ctx, x, y, w, h, colors, accentColor, level) {
    const hw = w / 2;
    const hh = w / 4;
    const wallH = h * 0.55;

    // ── Main facility walls — teal/dark ──
    ctx.fillStyle = '#107A5A';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + hw, y - hh); ctx.lineTo(x + hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    ctx.fillStyle = '#18A878';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - hw, y - hh); ctx.lineTo(x - hw, y - hh - wallH); ctx.lineTo(x, y - wallH);
    ctx.closePath(); ctx.fill();

    // Chrome trim
    ctx.fillStyle = '#C0D0D8';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x - hw, y - hh - wallH);
    ctx.lineTo(x - hw, y - hh - wallH + 3); ctx.lineTo(x, y - wallH + 3);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x + hw, y - hh - wallH);
    ctx.lineTo(x + hw, y - hh - wallH + 3); ctx.lineTo(x, y - wallH + 3);
    ctx.closePath(); ctx.fill();

    // ── Flat roof ──
    ctx.fillStyle = '#20B888';
    ctx.beginPath();
    ctx.moveTo(x, y - wallH); ctx.lineTo(x - hw, y - hh - wallH);
    ctx.lineTo(x, y - hh * 2 - wallH); ctx.lineTo(x + hw, y - hh - wallH);
    ctx.closePath(); ctx.fill();

    // ── Windows — control room screens ──
    const wColor = accentColor || '#40FFD0';
    ctx.fillStyle = wColor;
    ctx.globalAlpha = 0.4;
    for (let col = 0; col < 3; col++) {
      const t = 0.12 + col * 0.28;
      const wy = y - wallH * 0.4 - t * hh;
      const wx = x - t * hw;
      ctx.beginPath();
      ctx.moveTo(wx, wy); ctx.lineTo(wx - 5, wy - 2.5);
      ctx.lineTo(wx - 5, wy - 2.5 - 7); ctx.lineTo(wx, wy - 7);
      ctx.closePath(); ctx.fill();
    }
    for (let col = 0; col < 2; col++) {
      const t = 0.2 + col * 0.4;
      const wy = y - wallH * 0.4 - t * hh;
      const wx = x + t * hw;
      ctx.beginPath();
      ctx.moveTo(wx, wy); ctx.lineTo(wx + 5, wy - 2.5);
      ctx.lineTo(wx + 5, wy - 2.5 - 7); ctx.lineTo(wx, wy - 7);
      ctx.closePath(); ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ── Launch pad on roof — flat concrete pad ──
    const padX = x + hw * 0.2;
    const padY = y - wallH - hh * 0.2;
    ctx.fillStyle = '#888';
    ctx.beginPath();
    ctx.moveTo(padX, padY - 2); ctx.lineTo(padX - 8, padY - 6);
    ctx.lineTo(padX, padY - 10); ctx.lineTo(padX + 8, padY - 6);
    ctx.closePath(); ctx.fill();
    // Pad markings
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(padX - 5, padY - 5); ctx.lineTo(padX + 5, padY - 7);
    ctx.stroke();

    // ── Rocket on launch pad ──
    const rocketX = padX;
    const rocketY = padY - 10;
    const rocketH = h * 0.45;

    // Rocket body — white/silver
    ctx.fillStyle = '#E8E8E8';
    ctx.beginPath();
    ctx.moveTo(rocketX - 4, rocketY); ctx.lineTo(rocketX + 4, rocketY);
    ctx.lineTo(rocketX + 3, rocketY - rocketH + 8);
    ctx.lineTo(rocketX, rocketY - rocketH);
    ctx.lineTo(rocketX - 3, rocketY - rocketH + 8);
    ctx.closePath(); ctx.fill();

    // Nose cone — red
    ctx.fillStyle = '#E84040';
    ctx.beginPath();
    ctx.moveTo(rocketX, rocketY - rocketH - 6);
    ctx.lineTo(rocketX - 3, rocketY - rocketH + 2);
    ctx.lineTo(rocketX + 3, rocketY - rocketH + 2);
    ctx.closePath(); ctx.fill();

    // Window on rocket
    ctx.fillStyle = '#5CC8FF';
    ctx.beginPath(); ctx.arc(rocketX, rocketY - rocketH * 0.6, 2.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#B0C4D8';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    // Fins
    ctx.fillStyle = '#CC3030';
    // Left fin
    ctx.beginPath();
    ctx.moveTo(rocketX - 4, rocketY); ctx.lineTo(rocketX - 8, rocketY + 4);
    ctx.lineTo(rocketX - 4, rocketY - 6); ctx.closePath(); ctx.fill();
    // Right fin
    ctx.beginPath();
    ctx.moveTo(rocketX + 4, rocketY); ctx.lineTo(rocketX + 8, rocketY + 4);
    ctx.lineTo(rocketX + 4, rocketY - 6); ctx.closePath(); ctx.fill();

    // Exhaust flames (at higher levels)
    if (level >= 15) {
      ctx.fillStyle = '#FF8800';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.moveTo(rocketX - 3, rocketY + 1); ctx.lineTo(rocketX, rocketY + 10);
      ctx.lineTo(rocketX + 3, rocketY + 1); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#FFCC00';
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.moveTo(rocketX - 1.5, rocketY + 1); ctx.lineTo(rocketX, rocketY + 7);
      ctx.lineTo(rocketX + 1.5, rocketY + 1); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 1;
    }

    // ── Satellite dish on roof (left side) ──
    if (level > 10) {
      const sdx = x - hw * 0.3;
      const sdy = y - wallH - hh * 0.3 - 3;
      // Dish — parabolic curve
      ctx.fillStyle = '#C0D0D8';
      ctx.beginPath();
      ctx.moveTo(sdx - 5, sdy); ctx.quadraticCurveTo(sdx, sdy - 8, sdx + 5, sdy);
      ctx.lineTo(sdx + 4, sdy + 1); ctx.quadraticCurveTo(sdx, sdy - 6, sdx - 4, sdy + 1);
      ctx.closePath(); ctx.fill();
      // Dish arm
      ctx.fillStyle = '#888';
      ctx.fillRect(Math.round(sdx), Math.round(sdy - 2), 1, 4);
      // Base
      ctx.fillRect(Math.round(sdx - 1), Math.round(sdy + 1), 3, 2);
    }

    // ── Door ──
    const doorT = 0.42;
    const dx = x - doorT * hw;
    const dy = y - doorT * hh;
    ctx.fillStyle = '#0A5A3A';
    ctx.beginPath();
    ctx.moveTo(dx, dy); ctx.lineTo(dx - 8, dy - 4);
    ctx.lineTo(dx - 8, dy - 4 - 16); ctx.lineTo(dx, dy - 16);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#C0D0D8';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  // Map of custom draw functions per building type
  const CUSTOM_DRAWS = {
    library: drawLibrary,
    carwash: drawCarwash,
    pizza: drawPizza,
    newspaper: drawNewspaper,
    gym: drawGym,
    arcade: drawArcade,
    stockmogul: drawStockMogul,
    cinema: drawCinema,
    startup: drawStartup,
    bank: drawBank,
    space: drawSpace,
  };

  /**
   * Get or create a cached sprite for a building.
   * Sprite is drawn at the 2×2 tile base size (BW wide).
   */
  function getSprite(type, level, accentColor, facing) {
    const bucket = getLevelBucket(type, level);
    const key = spriteKey(type, bucket, accentColor, facing);
    if (spriteCache.has(key)) return spriteCache.get(key);

    const t = TYPES[type];
    if (!t) return null;

    const h = getBuildingHeight(type, level);
    const padding = 40;
    const sprW = BW + 24;
    const sprH = h + BH + padding;
    const anchorX = sprW / 2;
    const anchorY = sprH - 6;

    const offscreen = document.createElement('canvas');
    offscreen.width = sprW;
    offscreen.height = sprH;
    const ctx = offscreen.getContext('2d');

    // For back-facing buildings, swap left/right face colors.
    // colors[0] = left/front face, colors[1] = top, colors[2] = right/side face
    // Swapping 0 and 2 puts the "front" details on the other face.
    const isBack = facing === 'back-left' || facing === 'back-right';
    const drawColors = isBack ? [t.colors[2], t.colors[1], t.colors[0]] : t.colors;

    // Use custom draw function if available, otherwise generic box
    const customDraw = CUSTOM_DRAWS[type];
    if (customDraw) {
      customDraw(ctx, anchorX, anchorY, BW, h, drawColors, accentColor, level);
    } else {
      drawIsoBox(ctx, anchorX, anchorY, BW, h, drawColors, accentColor);
      drawDecorations(ctx, type, anchorX, anchorY, BW, h, level, drawColors);
    }

    const sprite = { canvas: offscreen, width: sprW, height: sprH, anchorX, anchorY };
    spriteCache.set(key, sprite);
    return sprite;
  }

  function clearCache() { spriteCache.clear(); }

  window.CityBuildings = {
    TYPES, BW, BH, BHW, BHH,
    getSprite, getBuildingHeight, clearCache, drawIsoBox
  };
})();
