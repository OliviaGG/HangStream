/**
 * city-characters.js — Walking characters: player avatars + business workers
 * Small pixel art people that walk on roads between buildings.
 * Exports: window.CityCharacters
 */
(function () {
  'use strict';

  let characters = [];
  let frame = 0;

  // Business type colors for workers
  const WORKER_COLORS = {
    library: '#8B7355', newspaper: '#5A7A8A', carwash: '#4A90D9', stockmogul: '#2E8B57',
    pizza: '#E8632B', arcade: '#9B59B6', gym: '#E67E22', cinema: '#C0392B',
    startup: '#3498DB', bank: '#D4A017', space: '#1ABC9C',
  };

  const SPEED = 0.035;       // tiles per frame
  const IDLE_MIN = 90;       // min idle frames (~1.5 seconds)
  const IDLE_MAX = 240;      // max idle frames (~4 seconds)
  const MAX_CHARACTERS = 250; // performance cap

  // ─── Sprite Drawing ───────────────────────────────────────────────────────

  const spriteCache = new Map();

  /**
   * Draw a small isometric pixel person (8x14 pixels).
   * walkFrame: 0-3 (leg positions), facing: 'left' or 'right'
   */
  function getCharSprite(color, walkFrame, facing) {
    const key = color + ':' + walkFrame + ':' + facing;
    if (spriteCache.has(key)) return spriteCache.get(key);

    const w = 16, h = 22;
    const offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
    const ctx = offscreen.getContext('2d');
    const cx = w / 2;

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.ellipse(cx, h - 2, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs — alternate positions based on walkFrame
    ctx.fillStyle = darken(color, 40);
    const legSpread = walkFrame % 2 === 0 ? 2 : 0;
    const legOffset = walkFrame === 1 || walkFrame === 3 ? 1 : -1;
    // Left leg
    ctx.fillRect(Math.round(cx - 2 - legSpread * 0.5), h - 7 + legOffset, 2, 5);
    // Right leg
    ctx.fillRect(Math.round(cx + legSpread * 0.5), h - 7 - legOffset, 2, 5);

    // Body
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(cx - 3), h - 14, 6, 8);

    // Arms — swing based on walkFrame
    const armSwing = (walkFrame % 2 === 0) ? 1 : -1;
    ctx.fillStyle = darken(color, 20);
    // Left arm
    ctx.fillRect(Math.round(cx - 4), h - 13 + armSwing, 2, 5);
    // Right arm
    ctx.fillRect(Math.round(cx + 2), h - 13 - armSwing, 2, 5);

    // Head
    ctx.fillStyle = '#F5D0A9'; // skin tone
    ctx.beginPath();
    ctx.arc(cx, h - 16, 3, 0, Math.PI * 2);
    ctx.fill();

    // Hair (colored)
    ctx.fillStyle = darken(color, 30);
    ctx.beginPath();
    ctx.arc(cx, h - 17, 3, Math.PI, Math.PI * 2);
    ctx.fill();

    const sprite = { canvas: offscreen, width: w, height: h, anchorX: cx, anchorY: h - 2 };

    // If facing right, create a flipped version
    if (facing === 'right') {
      const flipped = document.createElement('canvas');
      flipped.width = w; flipped.height = h;
      const fctx = flipped.getContext('2d');
      fctx.translate(w, 0);
      fctx.scale(-1, 1);
      fctx.drawImage(offscreen, 0, 0);
      sprite.canvas = flipped;
    }

    spriteCache.set(key, sprite);
    return sprite;
  }

  function darken(hex, amount) {
    if (!hex || hex[0] !== '#') return '#333';
    const num = parseInt(hex.replace('#', ''), 16);
    const r = Math.max(0, ((num >> 16) & 0xff) - amount);
    const g = Math.max(0, ((num >> 8) & 0xff) - amount);
    const b = Math.max(0, (num & 0xff) - amount);
    return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
  }

  // ─── BFS Pathfinding on Road Tiles ────────────────────────────────────────

  function findPath(fromX, fromY, toX, toY, maxSteps) {
    maxSteps = maxSteps || 60;
    const start = Math.round(fromX) + ',' + Math.round(fromY);
    const end = Math.round(toX) + ',' + Math.round(toY);
    if (start === end) return [];

    const queue = [{ x: Math.round(fromX), y: Math.round(fromY), path: [] }];
    const visited = new Set([start]);
    const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

    while (queue.length > 0 && visited.size < maxSteps * 4) {
      const cur = queue.shift();
      for (const [dx, dy] of dirs) {
        const nx = cur.x + dx, ny = cur.y + dy;
        const key = nx + ',' + ny;
        if (visited.has(key)) continue;
        visited.add(key);

        if (!CityLayout.isRoad(nx, ny)) continue;

        const newPath = [...cur.path, { x: nx, y: ny }];
        if (nx === Math.round(toX) && ny === Math.round(toY)) return newPath;
        if (newPath.length >= maxSteps) continue;
        queue.push({ x: nx, y: ny, path: newPath });
      }
    }
    return []; // no path found
  }

  function findNearestRoad(wx, wy, maxSearch) {
    maxSearch = maxSearch || 10;
    const cx = Math.round(wx), cy = Math.round(wy);
    if (CityLayout.isRoad(cx, cy)) return { x: cx, y: cy };
    for (let r = 1; r <= maxSearch; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          if (CityLayout.isRoad(cx + dx, cy + dy)) return { x: cx + dx, y: cy + dy };
        }
      }
    }
    return null;
  }

  // ─── Character Spawning ───────────────────────────────────────────────────

  function spawnCharacters() {
    characters = [];
    const plots = CityLayout.getPlots();
    const buildings = CityLayout.getPlacedBuildings();
    let count = 0;

    for (const plot of plots) {
      if (count >= MAX_CHARACTERS) break;

      // Find this plot's buildings
      const plotBiz = buildings.filter(b =>
        b.plotCx === plot.cx && b.plotCy === plot.cy && !b.isPrestigeBlock
      );
      if (!plotBiz.length) continue;

      // Player avatar
      const avatarColor = plot.equippedCosmetics?.name_color?.color || '#AABBCC';
      const avatarRoad = findNearestRoad(plot.cx, plot.cy);
      if (avatarRoad) {
        characters.push(createCharacter(
          'player_' + plot.playerIndex, 'player', null,
          avatarColor, plot.cx, plot.cy,
          avatarRoad.x, avatarRoad.y, plotBiz
        ));
        count++;
      }

      // Workers — one per business (cap to avoid too many)
      const maxWorkers = Math.min(plotBiz.length, 5);
      for (let i = 0; i < maxWorkers; i++) {
        if (count >= MAX_CHARACTERS) break;
        const biz = plotBiz[i];
        const workerColor = WORKER_COLORS[biz.type] || '#888888';
        const workerRoad = findNearestRoad(biz.wx + 1, biz.wy + 1);
        if (workerRoad) {
          characters.push(createCharacter(
            'worker_' + biz.type + '_' + plot.playerIndex, 'worker', biz.type,
            workerColor, plot.cx, plot.cy,
            workerRoad.x, workerRoad.y, plotBiz
          ));
          count++;
        }
      }
    }
  }

  function createCharacter(id, kind, bizType, color, plotCx, plotCy, startX, startY, plotBuildings) {
    return {
      id, kind, bizType, color,
      plotCx, plotCy,
      wx: startX, wy: startY,
      targetWx: startX, targetWy: startY,
      path: [],
      state: 'idle',
      facing: 'left',
      walkFrame: 0,
      idleTimer: Math.floor(Math.random() * IDLE_MAX), // stagger initial idle
      speed: SPEED + Math.random() * 0.01,
      _plotBuildings: plotBuildings,
    };
  }

  // ─── Character AI Update ──────────────────────────────────────────────────

  function update() {
    frame++;

    for (const ch of characters) {
      if (ch.state === 'idle') {
        ch.idleTimer--;
        if (ch.idleTimer <= 0) {
          // Pick a new target — random building in the plot
          const buildings = ch._plotBuildings;
          if (buildings && buildings.length) {
            const target = buildings[Math.floor(Math.random() * buildings.length)];
            const targetRoad = findNearestRoad(target.wx + 1, target.wy + 1);
            if (targetRoad) {
              const path = findPath(ch.wx, ch.wy, targetRoad.x, targetRoad.y);
              if (path.length > 0) {
                ch.path = path;
                ch.state = 'walking';
              } else {
                ch.idleTimer = IDLE_MIN + Math.floor(Math.random() * IDLE_MIN);
              }
            } else {
              ch.idleTimer = IDLE_MIN;
            }
          }
        }
      }

      if (ch.state === 'walking') {
        if (ch.path.length === 0) {
          ch.state = 'idle';
          ch.idleTimer = IDLE_MIN + Math.floor(Math.random() * (IDLE_MAX - IDLE_MIN));
          ch.walkFrame = 0;
          continue;
        }

        const next = ch.path[0];
        const dx = next.x - ch.wx;
        const dy = next.y - ch.wy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < ch.speed * 1.5) {
          // Reached next tile
          ch.wx = next.x;
          ch.wy = next.y;
          ch.path.shift();
        } else {
          // Move toward next tile
          ch.wx += (dx / dist) * ch.speed;
          ch.wy += (dy / dist) * ch.speed;
        }

        // Update facing based on movement direction
        if (dx > 0.01) ch.facing = 'right';
        else if (dx < -0.01) ch.facing = 'left';

        // Walk animation — cycle through 4 frames
        ch.walkFrame = Math.floor((frame / 6) % 4);
      }
    }
  }

  // ─── Get Characters for Rendering ─────────────────────────────────────────

  function getCharacters() {
    return characters;
  }

  function clearCache() {
    spriteCache.clear();
  }

  window.CityCharacters = {
    spawnCharacters, update, getCharacters, getCharSprite, clearCache,
  };
})();
