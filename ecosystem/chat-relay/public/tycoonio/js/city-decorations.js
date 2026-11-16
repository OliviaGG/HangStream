/**
 * city-decorations.js — Decoration types, high-res pixel art sprites, and drawing
 * Exports: window.CityDecorations
 */
(function () {
  'use strict';

  const TW = CityCamera.TILE_W;
  const TH = CityCamera.TILE_H;

  const TYPES = {
    tree:    { name: 'Oak Tree',    emoji: '\u{1F333}', category: 'nature',    ground: false },
    pine:    { name: 'Pine Tree',   emoji: '\u{1F332}', category: 'nature',    ground: false },
    bush:    { name: 'Bush',        emoji: '\u{1F33F}', category: 'nature',    ground: false },
    flowers: { name: 'Flower Bed',  emoji: '\u{1F338}', category: 'nature',    ground: true  },
    bench:   { name: 'Park Bench',  emoji: '\u{1FA91}', category: 'furniture', ground: false },
    lamp:    { name: 'Lamp Post',   emoji: '\u{1F3EE}', category: 'furniture', ground: false },
    fountain:{ name: 'Fountain',    emoji: '\u26F2',     category: 'structure', ground: false },
    path:    { name: 'Stone Path',  emoji: '\u{1FAA8}', category: 'ground',    ground: true  },
    car:     { name: 'Parked Car',  emoji: '\u{1F697}', category: 'vehicle',   ground: false },
    bike:    { name: 'Bicycle',     emoji: '\u{1F6B2}', category: 'vehicle',   ground: false },
    trash:   { name: 'Trash Can',   emoji: '\u{1F5D1}', category: 'furniture', ground: false },
  };

  const spriteCache = new Map();

  // Sprite canvas — large enough for tall objects
  const SPR_W = 80;
  const SPR_H = 90;

  function getSprite(type) {
    if (spriteCache.has(type)) return spriteCache.get(type);
    const t = TYPES[type];
    if (!t) return null;
    const drawFn = DRAW_FUNCTIONS[type];
    if (!drawFn) return null;

    const offscreen = document.createElement('canvas');
    offscreen.width = SPR_W;
    offscreen.height = SPR_H;
    const ctx = offscreen.getContext('2d');
    const anchorX = SPR_W / 2;
    // The anchor is the point that aligns with worldToScreen output.
    // worldToScreen returns the CENTER of the iso tile diamond.
    // Drawing functions use y as ground level where shadows/bases sit.
    // So anchorY = where y is in the sprite canvas.
    const anchorY = SPR_H - 14; // ground level in the sprite

    drawFn(ctx, anchorX, anchorY);

    const sprite = { canvas: offscreen, width: SPR_W, height: SPR_H, anchorX, anchorY, ground: t.ground };
    spriteCache.set(type, sprite);
    return sprite;
  }

  // ─── Drawing functions ────────────────────────────────────────────────────

  function drawTree(ctx, x, y) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 10, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk — thick brown with bark texture
    ctx.fillStyle = '#5C3A1E';
    ctx.fillRect(x - 3, y - 32, 6, 28);
    // Bark lines
    ctx.fillStyle = '#4A2E16';
    ctx.fillRect(x - 2, y - 28, 1, 6);
    ctx.fillRect(x + 1, y - 20, 1, 8);
    ctx.fillRect(x - 1, y - 14, 1, 5);
    // Root bumps
    ctx.fillStyle = '#5C3A1E';
    ctx.fillRect(x - 5, y - 5, 3, 3);
    ctx.fillRect(x + 3, y - 4, 3, 2);

    // Canopy — layered circles for full, natural look
    ctx.fillStyle = '#1E6B2E';
    ctx.beginPath(); ctx.arc(x, y - 38, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#258A38';
    ctx.beginPath(); ctx.arc(x - 6, y - 34, 10, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 6, y - 40, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2DA045';
    ctx.beginPath(); ctx.arc(x - 3, y - 42, 8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4, y - 35, 8, 0, Math.PI * 2); ctx.fill();
    // Highlights
    ctx.fillStyle = '#3CC058';
    ctx.beginPath(); ctx.arc(x + 2, y - 45, 5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 5, y - 38, 4, 0, Math.PI * 2); ctx.fill();
    // Light dots
    ctx.fillStyle = '#4AD868';
    ctx.beginPath(); ctx.arc(x + 5, y - 47, 3, 0, Math.PI * 2); ctx.fill();
  }

  function drawPine(ctx, x, y) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y - 2, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Trunk
    ctx.fillStyle = '#4A2E16';
    ctx.fillRect(x - 2, y - 24, 4, 20);

    // Three triangular tiers
    const tiers = [
      { y: y - 24, w: 18, h: 12, color: '#145A28' },
      { y: y - 34, w: 14, h: 12, color: '#1A6B30' },
      { y: y - 43, w: 10, h: 12, color: '#208838' },
    ];
    for (const t of tiers) {
      ctx.fillStyle = t.color;
      ctx.beginPath();
      ctx.moveTo(x, t.y - t.h);
      ctx.lineTo(x - t.w / 2, t.y);
      ctx.lineTo(x + t.w / 2, t.y);
      ctx.closePath();
      ctx.fill();
      // Snow/highlight edge
      ctx.fillStyle = '#2AAA48';
      ctx.beginPath();
      ctx.moveTo(x, t.y - t.h + 2);
      ctx.lineTo(x + t.w / 2 - 2, t.y - 1);
      ctx.lineTo(x + t.w / 2, t.y);
      ctx.closePath();
      ctx.fill();
    }
    // Star/tip
    ctx.fillStyle = '#3CC858';
    ctx.beginPath(); ctx.arc(x, y - 55, 2, 0, Math.PI * 2); ctx.fill();
  }

  function drawBush(ctx, x, y) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Bush body — overlapping circles
    ctx.fillStyle = '#1E6B2E';
    ctx.beginPath(); ctx.arc(x, y - 8, 10, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#258A38';
    ctx.beginPath(); ctx.arc(x - 5, y - 10, 7, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 5, y - 7, 7, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2DA045';
    ctx.beginPath(); ctx.arc(x + 2, y - 12, 6, 0, Math.PI * 2); ctx.fill();
    // Highlights
    ctx.fillStyle = '#3CC058';
    ctx.beginPath(); ctx.arc(x - 2, y - 13, 3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4, y - 10, 3, 0, Math.PI * 2); ctx.fill();
    // Small berry dots
    ctx.fillStyle = '#CC3333';
    ctx.beginPath(); ctx.arc(x - 4, y - 6, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 6, y - 9, 1.5, 0, Math.PI * 2); ctx.fill();
  }

  function drawFlowers(ctx, x, y) {
    // Ground base
    ctx.fillStyle = '#2A7A2A';
    ctx.beginPath();
    ctx.moveTo(x, y - 3); ctx.lineTo(x - 12, y - 9);
    ctx.lineTo(x, y - 15); ctx.lineTo(x + 12, y - 9);
    ctx.closePath(); ctx.fill();
    // Dirt edge
    ctx.fillStyle = '#3A5A2A';
    ctx.beginPath();
    ctx.moveTo(x, y - 1); ctx.lineTo(x - 12, y - 7);
    ctx.lineTo(x - 12, y - 9); ctx.lineTo(x, y - 3);
    ctx.closePath(); ctx.fill();

    // Flowers with stems
    const flowers = [
      { dx: -6, dy: -8, color: '#FF6B8A', size: 3 },
      { dx: -2, dy: -11, color: '#FFD700', size: 2.5 },
      { dx: 3, dy: -9, color: '#FF69B4', size: 3 },
      { dx: 6, dy: -7, color: '#FFFFFF', size: 2 },
      { dx: -4, dy: -6, color: '#DDA0DD', size: 2.5 },
      { dx: 1, dy: -7, color: '#FF8844', size: 2 },
      { dx: 5, dy: -11, color: '#FF6B8A', size: 2.5 },
    ];
    for (const f of flowers) {
      // Stem
      ctx.fillStyle = '#2A6A2A';
      ctx.fillRect(x + f.dx, y + f.dy, 1, 4);
      // Petals
      ctx.fillStyle = f.color;
      ctx.beginPath(); ctx.arc(x + f.dx + 0.5, y + f.dy - 1, f.size, 0, Math.PI * 2); ctx.fill();
      // Center
      ctx.fillStyle = '#FFD700';
      ctx.beginPath(); ctx.arc(x + f.dx + 0.5, y + f.dy - 1, f.size * 0.4, 0, Math.PI * 2); ctx.fill();
    }
  }

  function drawBench(ctx, x, y) {
    // y = tile center = ground level
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    ctx.beginPath();
    ctx.ellipse(x, y, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    const legH = 5;
    const seatY = y - legH;

    // Legs at isometric corners of the seat diamond
    ctx.fillStyle = '#555';
    // Left corner
    ctx.fillRect(x - 9, seatY + 1, 2, legH);
    // Top corner
    ctx.fillRect(x - 1, seatY - 3, 2, legH);
    // Right corner
    ctx.fillRect(x + 7, seatY + 1, 2, legH);
    // Bottom corner
    ctx.fillRect(x - 1, seatY + 3, 2, legH);

    // Back rest (isometric left face)
    ctx.fillStyle = '#7A5838';
    ctx.beginPath();
    ctx.moveTo(x - 10, seatY); ctx.lineTo(x, seatY - 4);
    ctx.lineTo(x, seatY - 11); ctx.lineTo(x - 10, seatY - 7);
    ctx.closePath(); ctx.fill();
    // Slat lines
    ctx.fillStyle = '#6A4828';
    ctx.fillRect(x - 7, seatY - 6, 1, 5);
    ctx.fillRect(x - 4, seatY - 8, 1, 5);
    ctx.fillRect(x - 1, seatY - 10, 1, 5);

    // Seat surface (isometric diamond)
    ctx.fillStyle = '#8B6844';
    ctx.beginPath();
    ctx.moveTo(x - 10, seatY); ctx.lineTo(x, seatY - 4);
    ctx.lineTo(x + 10, seatY); ctx.lineTo(x, seatY + 4);
    ctx.closePath(); ctx.fill();
    // Seat front edge thickness
    ctx.fillStyle = '#7A5838';
    ctx.beginPath();
    ctx.moveTo(x, seatY + 4); ctx.lineTo(x + 10, seatY);
    ctx.lineTo(x + 10, seatY + 1.5); ctx.lineTo(x, seatY + 5.5);
    ctx.closePath(); ctx.fill();
  }

  function drawLamp(ctx, x, y) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();

    // Base plate
    ctx.fillStyle = '#3A3A3A';
    ctx.beginPath();
    ctx.moveTo(x, y - 2); ctx.lineTo(x - 5, y - 4);
    ctx.lineTo(x, y - 6); ctx.lineTo(x + 5, y - 4);
    ctx.closePath(); ctx.fill();

    // Pole — gradient dark to light
    ctx.fillStyle = '#4A4A4A';
    ctx.fillRect(x - 1, y - 44, 2, 38);
    ctx.fillStyle = '#555';
    ctx.fillRect(x - 1, y - 44, 1, 38);

    // Decorative ring
    ctx.fillStyle = '#666';
    ctx.fillRect(x - 2, y - 36, 4, 2);

    // Lamp head — ornate shape
    ctx.fillStyle = '#555';
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 44);
    ctx.lineTo(x + 6, y - 44);
    ctx.lineTo(x + 5, y - 48);
    ctx.lineTo(x - 5, y - 48);
    ctx.closePath(); ctx.fill();
    // Top cap
    ctx.fillStyle = '#444';
    ctx.beginPath();
    ctx.moveTo(x - 4, y - 48);
    ctx.lineTo(x + 4, y - 48);
    ctx.lineTo(x + 2, y - 51);
    ctx.lineTo(x - 2, y - 51);
    ctx.closePath(); ctx.fill();

    // Light bulb — warm glow
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(x, y - 46, 4, 0, Math.PI * 2); ctx.fill();
    // Glow halo
    ctx.fillStyle = 'rgba(255,215,0,0.15)';
    ctx.beginPath(); ctx.arc(x, y - 46, 12, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,215,0,0.08)';
    ctx.beginPath(); ctx.arc(x, y - 46, 18, 0, Math.PI * 2); ctx.fill();
  }

  function drawFountain(ctx, x, y) {
    // y = tile center = ground level
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(x, y + 1, 15, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Ground-level base plate (anchors fountain to ground)
    ctx.fillStyle = '#4A5A6A';
    ctx.beginPath();
    ctx.moveTo(x, y + 4); ctx.lineTo(x - 14, y - 3);
    ctx.lineTo(x, y - 10); ctx.lineTo(x + 14, y - 3);
    ctx.closePath(); ctx.fill();
    // Base plate front edge (gives depth)
    ctx.fillStyle = '#3A4A5A';
    ctx.beginPath();
    ctx.moveTo(x, y + 4); ctx.lineTo(x + 14, y - 3);
    ctx.lineTo(x + 14, y - 2); ctx.lineTo(x, y + 5);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y + 4); ctx.lineTo(x - 14, y - 3);
    ctx.lineTo(x - 14, y - 2); ctx.lineTo(x, y + 5);
    ctx.closePath(); ctx.fill();

    // Basin walls on top of base plate
    const wallH = 5;
    const baseY = y - 1; // basin sits on top of base plate
    // Right wall
    ctx.fillStyle = '#5A6A7A';
    ctx.beginPath();
    ctx.moveTo(x, baseY + 2); ctx.lineTo(x + 11, baseY - 4);
    ctx.lineTo(x + 11, baseY - 4 - wallH); ctx.lineTo(x, baseY + 2 - wallH);
    ctx.closePath(); ctx.fill();
    // Left wall
    ctx.fillStyle = '#6A7A8A';
    ctx.beginPath();
    ctx.moveTo(x, baseY + 2); ctx.lineTo(x - 11, baseY - 4);
    ctx.lineTo(x - 11, baseY - 4 - wallH); ctx.lineTo(x, baseY + 2 - wallH);
    ctx.closePath(); ctx.fill();
    // Rim (top surface of basin walls)
    ctx.fillStyle = '#8899AA';
    ctx.beginPath();
    ctx.moveTo(x, baseY + 2 - wallH); ctx.lineTo(x - 11, baseY - 4 - wallH);
    ctx.lineTo(x, baseY - 10 - wallH); ctx.lineTo(x + 11, baseY - 4 - wallH);
    ctx.closePath(); ctx.fill();
    // Water inside basin
    ctx.fillStyle = '#4A90D9';
    ctx.globalAlpha = 0.5;
    ctx.beginPath();
    ctx.moveTo(x, baseY + 1 - wallH); ctx.lineTo(x - 9, baseY - 4 - wallH + 1);
    ctx.lineTo(x, baseY - 9 - wallH + 1); ctx.lineTo(x + 9, baseY - 4 - wallH + 1);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // Central column
    const colBase = baseY + 2 - wallH;
    ctx.fillStyle = '#778899';
    ctx.fillRect(x - 2, colBase - 16, 4, 16);
    ctx.fillStyle = '#8899AA';
    ctx.fillRect(x - 3, colBase - 16, 6, 2);

    // Spray particles
    ctx.fillStyle = '#87CEEB';
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      ctx.beginPath(); ctx.arc(x + Math.cos(a) * 5, colBase - 18 + Math.sin(a) * 3, 1.5, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#ADD8E6';
    ctx.globalAlpha = 0.4;
    ctx.beginPath(); ctx.arc(x, colBase - 20, 4, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  function drawPath(ctx, x, y) {
    // Iso diamond CENTERED on y — the tile goes from y-8 (top) to y+8 (bottom)
    // This matches how grass tiles are drawn in the ground renderer
    const hw = 12, hh = 6;
    ctx.fillStyle = '#7A6A5A';
    ctx.beginPath();
    ctx.moveTo(x, y - hh); ctx.lineTo(x + hw, y);
    ctx.lineTo(x, y + hh); ctx.lineTo(x - hw, y);
    ctx.closePath(); ctx.fill();

    // Stone blocks inside the diamond
    ctx.fillStyle = '#8A7A6A';
    ctx.beginPath();
    ctx.moveTo(x - 6, y - 1); ctx.lineTo(x - 2, y - 3);
    ctx.lineTo(x - 2, y - 1); ctx.lineTo(x - 6, y + 1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#9A8A7A';
    ctx.beginPath();
    ctx.moveTo(x + 1, y - 3); ctx.lineTo(x + 6, y - 1);
    ctx.lineTo(x + 6, y + 1); ctx.lineTo(x + 1, y - 1);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6A5A4A';
    ctx.beginPath();
    ctx.moveTo(x - 3, y + 1); ctx.lineTo(x + 3, y - 2);
    ctx.lineTo(x + 3, y); ctx.lineTo(x - 3, y + 3);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8A7A6A';
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 2); ctx.lineTo(x + 8, y);
    ctx.lineTo(x + 8, y + 1); ctx.lineTo(x + 3, y + 3);
    ctx.closePath(); ctx.fill();
    // Mortar
    ctx.strokeStyle = '#5A4A3A';
    ctx.lineWidth = 0.6;
    ctx.beginPath(); ctx.moveTo(x - 4, y); ctx.lineTo(x + 4, y - 2); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y - 3); ctx.lineTo(x, y + 3); ctx.stroke();
  }

  function drawCar(ctx, x, y) {
    // y = ground level. Wheels sit ON y.
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(x, y, 18, 7, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wheels — centers at y (ground)
    ctx.fillStyle = '#1A1A1A';
    ctx.beginPath(); ctx.ellipse(x - 10, y, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 10, y - 3, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - 3, y - 2, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + 4, y - 4, 4, 2.5, 0, 0, Math.PI * 2); ctx.fill();
    // Hubcaps
    ctx.fillStyle = '#666';
    ctx.beginPath(); ctx.arc(x - 10, y, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 10, y - 3, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 3, y - 2, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + 4, y - 4, 1.5, 0, Math.PI * 2); ctx.fill();

    // Car body — iso box sitting on wheels, base at y
    const bw = 16, bh = 8, bodyH = 6;

    // Right body panel
    ctx.fillStyle = '#AA2525';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + bw, y - bh);
    ctx.lineTo(x + bw, y - bh - bodyH); ctx.lineTo(x, y - bodyH);
    ctx.closePath(); ctx.fill();
    // Left body panel
    ctx.fillStyle = '#CC3333';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - bw, y - bh);
    ctx.lineTo(x - bw, y - bh - bodyH); ctx.lineTo(x, y - bodyH);
    ctx.closePath(); ctx.fill();
    // Hood/trunk top
    ctx.fillStyle = '#DD3838';
    ctx.beginPath();
    ctx.moveTo(x, y - bodyH); ctx.lineTo(x - bw, y - bh - bodyH);
    ctx.lineTo(x, y - bh * 2 - bodyH); ctx.lineTo(x + bw, y - bh - bodyH);
    ctx.closePath(); ctx.fill();

    // Cabin on top of body
    const cw = 9, ch = 5, cabH = 6;
    const cabOff = -2;
    const cabBase = y - bodyH;
    ctx.fillStyle = '#992222';
    ctx.beginPath();
    ctx.moveTo(x + cabOff, cabBase); ctx.lineTo(x + cabOff + cw, cabBase - ch);
    ctx.lineTo(x + cabOff + cw, cabBase - ch - cabH); ctx.lineTo(x + cabOff, cabBase - cabH);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#BB2E2E';
    ctx.beginPath();
    ctx.moveTo(x + cabOff, cabBase); ctx.lineTo(x + cabOff - cw, cabBase - ch);
    ctx.lineTo(x + cabOff - cw, cabBase - ch - cabH); ctx.lineTo(x + cabOff, cabBase - cabH);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#CC3333';
    ctx.beginPath();
    ctx.moveTo(x + cabOff, cabBase - cabH); ctx.lineTo(x + cabOff - cw, cabBase - ch - cabH);
    ctx.lineTo(x + cabOff, cabBase - ch * 2 - cabH); ctx.lineTo(x + cabOff + cw, cabBase - ch - cabH);
    ctx.closePath(); ctx.fill();

    // Windows
    ctx.fillStyle = '#88CCFF';
    ctx.globalAlpha = 0.7;
    ctx.beginPath();
    ctx.moveTo(x + cabOff - 1, cabBase); ctx.lineTo(x + cabOff - cw + 1, cabBase - ch + 1);
    ctx.lineTo(x + cabOff - cw + 1, cabBase - ch - cabH + 2); ctx.lineTo(x + cabOff - 1, cabBase - cabH + 2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + cabOff + 1, cabBase); ctx.lineTo(x + cabOff + cw - 1, cabBase - ch + 1);
    ctx.lineTo(x + cabOff + cw - 1, cabBase - ch - cabH + 2); ctx.lineTo(x + cabOff + 1, cabBase - cabH + 2);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;

    // Headlights
    ctx.fillStyle = '#FFD700';
    ctx.beginPath(); ctx.arc(x - bw + 2, y - bh + 1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - bw + 5, y - bh, 2, 0, Math.PI * 2); ctx.fill();
    // Taillights
    ctx.fillStyle = '#FF0000';
    ctx.beginPath(); ctx.arc(x + bw - 2, y - bh + 1, 2, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x + bw - 5, y - bh, 2, 0, Math.PI * 2); ctx.fill();
    // Bumpers
    ctx.fillStyle = '#888';
    ctx.fillRect(x - bw, y - bh + 1, 3, 1);
    ctx.fillRect(x + bw - 3, y - bh + 1, 3, 1);
  }

  function drawBike(ctx, x, y) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x, y, 11, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Back wheel — tire + spokes + hub
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x - 7, y - 4, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x - 7, y - 4);
      ctx.lineTo(x - 7 + Math.cos(a) * 5.5, y - 4 + Math.sin(a) * 5.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#777';
    ctx.beginPath(); ctx.arc(x - 7, y - 4, 1.5, 0, Math.PI * 2); ctx.fill();

    // Front wheel
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x + 7, y - 7, 6, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 0.5;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(x + 7, y - 7);
      ctx.lineTo(x + 7 + Math.cos(a) * 5.5, y - 7 + Math.sin(a) * 5.5);
      ctx.stroke();
    }
    ctx.fillStyle = '#777';
    ctx.beginPath(); ctx.arc(x + 7, y - 7, 1.5, 0, Math.PI * 2); ctx.fill();

    // Frame — proper diamond shape
    ctx.strokeStyle = '#2980B9';
    ctx.lineWidth = 2.5;
    // Bottom bracket to rear hub (chain stay)
    ctx.beginPath(); ctx.moveTo(x - 7, y - 4); ctx.lineTo(x - 1, y - 5); ctx.stroke();
    // Bottom bracket to seat tube top (seat tube)
    ctx.beginPath(); ctx.moveTo(x - 1, y - 5); ctx.lineTo(x - 2, y - 17); ctx.stroke();
    // Bottom bracket to head tube (down tube)
    ctx.beginPath(); ctx.moveTo(x - 1, y - 5); ctx.lineTo(x + 3, y - 16); ctx.stroke();
    // Seat tube to head tube (top tube)
    ctx.beginPath(); ctx.moveTo(x - 2, y - 17); ctx.lineTo(x + 3, y - 16); ctx.stroke();
    // Rear hub to seat tube (seat stay)
    ctx.beginPath(); ctx.moveTo(x - 7, y - 4); ctx.lineTo(x - 2, y - 17); ctx.stroke();
    // Head tube to front hub (fork)
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 3, y - 16); ctx.lineTo(x + 7, y - 7); ctx.stroke();

    // Crank/pedals
    ctx.fillStyle = '#555';
    ctx.strokeStyle = '#444';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 1, y - 5); ctx.lineTo(x - 4, y - 3); ctx.stroke();
    ctx.fillRect(x - 6, y - 4, 3, 2);
    // Chain ring
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x - 1, y - 5, 2.5, 0, Math.PI * 2); ctx.stroke();

    // Handlebars — curved
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x + 2, y - 17); ctx.lineTo(x + 5, y - 19); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 2, y - 17); ctx.lineTo(x - 1, y - 18); ctx.stroke();
    // Grips
    ctx.fillStyle = '#111';
    ctx.beginPath(); ctx.arc(x + 5, y - 19, 1.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(x - 1, y - 18, 1.5, 0, Math.PI * 2); ctx.fill();

    // Seat
    ctx.fillStyle = '#2A2A2A';
    ctx.beginPath();
    ctx.moveTo(x - 5, y - 18); ctx.lineTo(x - 1, y - 18);
    ctx.lineTo(x - 1, y - 19.5); ctx.lineTo(x - 4, y - 19.5);
    ctx.closePath(); ctx.fill();
    // Seat post
    ctx.strokeStyle = '#555';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 2, y - 17); ctx.lineTo(x - 2.5, y - 18); ctx.stroke();

    // Kickstand
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x - 2, y - 6); ctx.lineTo(x - 5, y); ctx.stroke();

    // Basket on front
    ctx.fillStyle = '#8B7355';
    ctx.strokeStyle = '#6A5535';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 14); ctx.lineTo(x + 10, y - 17);
    ctx.lineTo(x + 10, y - 13); ctx.lineTo(x + 4, y - 10);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    // Basket weave
    ctx.lineWidth = 0.4;
    ctx.beginPath(); ctx.moveTo(x + 6, y - 15.5); ctx.lineTo(x + 6, y - 11.5); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + 8, y - 16.5); ctx.lineTo(x + 8, y - 12.5); ctx.stroke();
  }

  function drawTrash(ctx, x, y) {
    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.1)';
    ctx.beginPath();
    ctx.ellipse(x, y - 1, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    // Body — isometric box
    ctx.fillStyle = '#4A5A4A';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + 6, y - 3);
    ctx.lineTo(x + 6, y - 14); ctx.lineTo(x, y - 11);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5A6A5A';
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x - 6, y - 3);
    ctx.lineTo(x - 6, y - 14); ctx.lineTo(x, y - 11);
    ctx.closePath(); ctx.fill();
    // Rim band
    ctx.fillStyle = '#3A4A3A';
    ctx.beginPath();
    ctx.moveTo(x, y - 1); ctx.lineTo(x + 6, y - 4);
    ctx.lineTo(x + 6, y - 5); ctx.lineTo(x, y - 2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x, y - 1); ctx.lineTo(x - 6, y - 4);
    ctx.lineTo(x - 6, y - 5); ctx.lineTo(x, y - 2);
    ctx.closePath(); ctx.fill();
    // Lid
    ctx.fillStyle = '#6A7A6A';
    ctx.beginPath();
    ctx.moveTo(x, y - 11); ctx.lineTo(x - 7, y - 14);
    ctx.lineTo(x, y - 17); ctx.lineTo(x + 7, y - 14);
    ctx.closePath(); ctx.fill();
    // Lid handle
    ctx.fillStyle = '#333';
    ctx.fillRect(x - 1, y - 18, 2, 2);
  }

  const DRAW_FUNCTIONS = {
    tree: drawTree, pine: drawPine, bush: drawBush, flowers: drawFlowers,
    bench: drawBench, lamp: drawLamp, fountain: drawFountain, path: drawPath,
    car: drawCar, bike: drawBike, trash: drawTrash,
  };

  function calcSlots(businesses) {
    if (!businesses || !businesses.length) return 10;
    let slots = 10;
    slots += businesses.length;
    let totalPrestige = 0, above50 = 0, above75 = 0;
    for (const b of businesses) {
      totalPrestige += b.prestige || 0;
      if (b.level >= 50) above50++;
      if (b.level >= 75) above75++;
    }
    slots += Math.floor(totalPrestige / 2);
    slots += above50 * 2;
    slots += above75 * 3;
    return slots;
  }

  function clearCache() { spriteCache.clear(); }

  window.CityDecorations = {
    TYPES, getSprite, calcSlots, clearCache,
  };
})();
