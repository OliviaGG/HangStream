/**
 * city-layout.js — City-block grid layout with winding river
 * Players arranged in rectangular grid blocks, wealthiest at center.
 * A meandering river flows through the map center.
 * Exports: window.CityLayout
 */
(function () {
  'use strict';

  // Business progression multipliers for empire value calculation
  const BIZ_MULT = {
    library: 1, newspaper: 2, carwash: 4, stockmogul: 6, pizza: 8,
    arcade: 15, gym: 30, cinema: 60, startup: 100, bank: 150, space: 250
  };

  // Street width between plots (tiles)
  const STREET_WIDTH = 4;

  // Road tile positions
  let roadTiles = new Set();

  // Bridge tiles (road tiles over water — rendered with wooden plank look)
  let bridgeTiles = new Set();

  // All placed buildings
  let placedBuildings = [];

  // All placed decorations: { wx, wy, type, plotCx, plotCy }
  let placedDecorations = [];

  // Ambient trees scattered outside player plots
  let ambientTrees = [];

  // Player plot metadata: { cx, cy, w, h, displayName, ... }
  let playerPlots = [];

  // City center of mass (for camera centering)
  let cityCenter = { x: 0, y: 0 };

  // City bounds
  let bounds = { minX: -10, minY: -10, maxX: 10, maxY: 10 };

  // ─── River system ──────────────────────────────────────────────────────────

  const RIVER_HALF_WIDTH = 3;   // half-width in tiles (total ~6 wide)
  const RIVER_BANK_WIDTH = 2;   // sand bank on each side
  const RIVER_OFFSET = 5;       // offset from x=0 so river doesn't bisect center plot

  /**
   * Get the world-X center of the river at a given world-Y.
   * Two-frequency sine for natural meandering.
   */
  function riverCenterX(wy) {
    return RIVER_OFFSET +
      Math.sin(wy * 0.07) * 14 +
      Math.sin(wy * 0.025 + 1.8) * 9 +
      Math.sin(wy * 0.15 + 0.5) * 3;
  }

  /**
   * Get the river tile type at a world position.
   * @returns {'water'|'sand'|null}
   */
  function getRiverType(wx, wy) {
    const cx = riverCenterX(wy);
    const dist = Math.abs(wx - cx);
    if (dist <= RIVER_HALF_WIDTH) return 'water';
    if (dist <= RIVER_HALF_WIDTH + RIVER_BANK_WIDTH) return 'sand';
    return null;
  }

  /**
   * Check if a rectangular area overlaps the river zone (water + sand + margin).
   */
  function overlapsRiver(cx, cy, w, h) {
    const margin = 2;
    const halfW = Math.floor(w / 2);
    const halfH = Math.floor(h / 2);
    const x1 = cx - halfW, x2 = cx + halfW;
    const y1 = cy - halfH, y2 = cy + halfH;
    // Sample several points along the plot's Y range
    const step = Math.max(1, Math.floor((y2 - y1) / 6));
    for (let y = y1; y <= y2; y += step) {
      const rc = riverCenterX(y);
      const riverLeft = rc - RIVER_HALF_WIDTH - RIVER_BANK_WIDTH - margin;
      const riverRight = rc + RIVER_HALF_WIDTH + RIVER_BANK_WIDTH + margin;
      if (x2 >= riverLeft && x1 <= riverRight) return true;
    }
    // Always check endpoints
    const rcEnd = riverCenterX(y2);
    const rlEnd = rcEnd - RIVER_HALF_WIDTH - RIVER_BANK_WIDTH - margin;
    const rrEnd = rcEnd + RIVER_HALF_WIDTH + RIVER_BANK_WIDTH + margin;
    if (x2 >= rlEnd && x1 <= rrEnd) return true;
    return false;
  }

  // ─── Empire value & plot sizing ────────────────────────────────────────────

  function empireValue(player) {
    if (!player.businesses || !player.businesses.length) return 0;
    let total = 0;
    for (const biz of player.businesses) {
      total += biz.level * (BIZ_MULT[biz.type] || 1);
    }
    return total;
  }

  function prestigeBlocks(prestige) {
    if (!prestige || prestige <= 0) return 1;
    return Math.min(4, prestige + 1);
  }

  function plotSize(businesses) {
    if (!businesses || !businesses.length) return { w: 14, h: 14 };
    const bizCount = businesses.length;
    const cols = Math.min(3, bizCount);
    const rows = Math.ceil(bizCount / 3);
    const w = cols * 4 + 6;
    const h = rows * 4 + 6;
    return { w: Math.max(w, 14), h: Math.max(h, 14) };
  }

  // ─── City grid placement ──────────────────────────────────────────────────

  /**
   * Generate grid positions for plots, filling from center outward.
   * Skips positions that overlap the river zone.
   */
  function gridPlotPositions(plotSizes) {
    if (!plotSizes.length) return [];

    // Compute uniform cell pitch from the largest plot dimension
    let maxDim = 14;
    for (const s of plotSizes) {
      if (s.w > maxDim) maxDim = s.w;
      if (s.h > maxDim) maxDim = s.h;
    }
    const pitch = maxDim + STREET_WIDTH;

    // Generate candidate grid slots sorted by distance from center
    // Generate enough slots: up to ~200 in case many get skipped by river
    const maxRing = Math.ceil(Math.sqrt(plotSizes.length)) + 4;
    const candidates = [];
    for (let r = -maxRing; r <= maxRing; r++) {
      for (let c = -maxRing; c <= maxRing; c++) {
        const dist = Math.sqrt(c * c + r * r);
        candidates.push({ col: c, row: r, dist });
      }
    }
    // Sort by distance, breaking ties: prefer center-left (negative col) so
    // plots cluster on the "city side" of the river
    candidates.sort((a, b) => a.dist - b.dist || a.col - b.col || a.row - b.row);

    const positions = [];
    let ci = 0;
    for (let i = 0; i < plotSizes.length && ci < candidates.length; ) {
      const slot = candidates[ci++];
      const wx = slot.col * pitch;
      const wy = slot.row * pitch;
      const pw = plotSizes[i].w;
      const ph = plotSizes[i].h;

      // Skip if this grid cell overlaps the river
      if (overlapsRiver(wx, wy, pw, ph)) continue;

      positions.push({ x: wx, y: wy });
      i++;
    }

    return positions;
  }

  // ─── Road helpers ─────────────────────────────────────────────────────────

  function hRoad(x1, x2, y) {
    const lo = Math.min(x1, x2), hi = Math.max(x1, x2);
    for (let x = lo; x <= hi; x++) {
      roadTiles.add(x + ',' + y);
      roadTiles.add(x + ',' + (y + 1));
    }
  }

  function vRoad(y1, y2, x) {
    const lo = Math.min(y1, y2), hi = Math.max(y1, y2);
    for (let y = lo; y <= hi; y++) {
      roadTiles.add(x + ',' + y);
      roadTiles.add((x + 1) + ',' + y);
    }
  }

  // ─── Grid road generation ────────────────────────────────────────────────

  function generateRoads() {
    roadTiles = new Set();
    const MAX_TILES = 80000;

    // 1. Each plot gets a + cross through its center
    for (const plot of playerPlots) {
      const cx = plot.cx;
      const cy = plot.cy;
      const arm = Math.floor(plot.w / 2);
      hRoad(cx - arm, cx + arm, cy);
      vRoad(cy - arm, cy + arm, cx);
    }

    // 2. Grid streets: connect adjacent plots along same row/column
    //    Find all unique rows and columns of plots
    const rowMap = {};  // row → sorted array of plot indices
    const colMap = {};  // col → sorted array of plot indices

    // Compute cell pitch (same as in gridPlotPositions)
    let maxDim = 14;
    for (const p of playerPlots) {
      if (p.w > maxDim) maxDim = p.w;
      if (p.h > maxDim) maxDim = p.h;
    }
    const pitch = maxDim + STREET_WIDTH;
    const tolerance = pitch / 2;

    // Group plots by approximate grid row/col
    for (let i = 0; i < playerPlots.length; i++) {
      const p = playerPlots[i];
      const gridRow = Math.round(p.cy / pitch);
      const gridCol = Math.round(p.cx / pitch);
      if (!rowMap[gridRow]) rowMap[gridRow] = [];
      rowMap[gridRow].push(i);
      if (!colMap[gridCol]) colMap[gridCol] = [];
      colMap[gridCol].push(i);
    }

    // Connect plots in the same row (horizontal streets between them)
    for (const row in rowMap) {
      const indices = rowMap[row];
      if (indices.length < 2) continue;
      // Sort by cx
      indices.sort((a, b) => playerPlots[a].cx - playerPlots[b].cx);
      for (let j = 0; j < indices.length - 1; j++) {
        if (roadTiles.size >= MAX_TILES) break;
        const a = playerPlots[indices[j]];
        const b = playerPlots[indices[j + 1]];
        // Horizontal road from edge of a to edge of b, at shared row Y
        const aRight = a.cx + Math.floor(a.w / 2);
        const bLeft = b.cx - Math.floor(b.w / 2);
        if (bLeft - aRight > 0 && bLeft - aRight < pitch * 2) {
          const roadY = Math.round((a.cy + b.cy) / 2);
          // Don't draw over river
          let blocked = false;
          for (let x = aRight; x <= bLeft; x++) {
            if (getRiverType(x, roadY) === 'water') { blocked = true; break; }
          }
          if (!blocked) hRoad(aRight, bLeft, roadY);
        }
      }
    }

    // Connect plots in the same column (vertical streets between them)
    for (const col in colMap) {
      const indices = colMap[col];
      if (indices.length < 2) continue;
      indices.sort((a, b) => playerPlots[a].cy - playerPlots[b].cy);
      for (let j = 0; j < indices.length - 1; j++) {
        if (roadTiles.size >= MAX_TILES) break;
        const a = playerPlots[indices[j]];
        const b = playerPlots[indices[j + 1]];
        const aBottom = a.cy + Math.floor(a.h / 2);
        const bTop = b.cy - Math.floor(b.h / 2);
        if (bTop - aBottom > 0 && bTop - aBottom < pitch * 2) {
          const roadX = Math.round((a.cx + b.cx) / 2);
          let blocked = false;
          for (let y = aBottom; y <= bTop; y++) {
            if (getRiverType(roadX, y) === 'water') { blocked = true; break; }
          }
          if (!blocked) vRoad(aBottom, bTop, roadX);
        }
      }
    }

    // 3. Remove any road tiles that fall on water
    for (const key of [...roadTiles]) {
      const [x, y] = key.split(',').map(Number);
      if (getRiverType(x, y) === 'water') {
        roadTiles.delete(key);
      }
    }

    // 4. Build bridges across the river
    bridgeTiles = new Set();
    if (playerPlots.length >= 2) {
      // Find the Y range of the city
      let cityMinY = Infinity, cityMaxY = -Infinity;
      for (const p of playerPlots) {
        const half = Math.floor(p.h / 2);
        if (p.cy - half < cityMinY) cityMinY = p.cy - half;
        if (p.cy + half > cityMaxY) cityMaxY = p.cy + half;
      }

      // Pick 2-3 evenly spaced bridge Y positions
      const range = cityMaxY - cityMinY;
      const bridgeCount = range > 80 ? 3 : 2;
      const bridgeSpacing = range / (bridgeCount + 1);

      for (let bi = 1; bi <= bridgeCount; bi++) {
        const bridgeY = Math.round(cityMinY + bi * bridgeSpacing);
        const rc = riverCenterX(bridgeY);
        const riverLeft = Math.floor(rc - RIVER_HALF_WIDTH) - 1;
        const riverRight = Math.ceil(rc + RIVER_HALF_WIDTH) + 1;

        // Road bridge: 2 tiles wide
        for (let bx = riverLeft; bx <= riverRight; bx++) {
          bridgeTiles.add(bx + ',' + bridgeY);
          bridgeTiles.add(bx + ',' + (bridgeY + 1));
          roadTiles.add(bx + ',' + bridgeY);
          roadTiles.add(bx + ',' + (bridgeY + 1));
        }

        // Extend road from bridge to nearest plot on each side
        // Left side: extend road left until reaching a plot's road
        for (let x = riverLeft - 1; x >= riverLeft - 30; x--) {
          if (getRiverType(x, bridgeY) === 'water') continue;
          if (roadTiles.has(x + ',' + bridgeY)) break;
          roadTiles.add(x + ',' + bridgeY);
          roadTiles.add(x + ',' + (bridgeY + 1));
        }
        // Right side
        for (let x = riverRight + 1; x <= riverRight + 30; x++) {
          if (getRiverType(x, bridgeY) === 'water') continue;
          if (roadTiles.has(x + ',' + bridgeY)) break;
          roadTiles.add(x + ',' + bridgeY);
          roadTiles.add(x + ',' + (bridgeY + 1));
        }
      }

      // Path bridges (smaller, 1-tile wide, between road bridges)
      for (let bi = 0; bi <= bridgeCount; bi++) {
        const pathBridgeY = Math.round(cityMinY + (bi + 0.5) * bridgeSpacing);
        const rc = riverCenterX(pathBridgeY);
        const riverLeft = Math.floor(rc - RIVER_HALF_WIDTH) - 1;
        const riverRight = Math.ceil(rc + RIVER_HALF_WIDTH) + 1;
        for (let bx = riverLeft; bx <= riverRight; bx++) {
          bridgeTiles.add(bx + ',' + pathBridgeY);
        }
      }
    }
  }

  /**
   * Check if a tile is a road
   */
  function isRoad(wx, wy) {
    return roadTiles.has(wx + ',' + wy);
  }

  function isBridge(wx, wy) {
    return bridgeTiles.has(wx + ',' + wy);
  }

  // ─── Main layout ─────────────────────────────────────────────────────────

  function layoutCity(players) {
    placedBuildings = [];
    playerPlots = [];
    roadTiles = new Set();
    bridgeTiles = new Set();

    if (!players || !players.length) return placedBuildings;

    // Sort by empire value descending
    const ranked = players.map((p, i) => ({
      ...p,
      _index: i,
      _value: empireValue(p),
      _bizCount: (p.businesses || []).length
    }));
    ranked.sort((a, b) => b._value - a._value);

    // Calculate plot sizes
    const plotSizes = ranked.map(p => plotSize(p.businesses));

    // Generate plot center positions via city grid
    const plotPositions = gridPlotPositions(plotSizes);

    // Place each player's buildings within their plot
    for (let i = 0; i < ranked.length; i++) {
      const player = ranked[i];
      const size = plotSizes[i];
      const pos = plotPositions[i];
      if (!pos || !player.businesses || !player.businesses.length) continue;

      const plotCx = pos.x;
      const plotCy = pos.y;

      playerPlots.push({
        cx: plotCx, cy: plotCy,
        w: size.w, h: size.h,
        displayName: player.displayName,
        equippedCosmetics: player.equippedCosmetics || {},
        empireValue: player._value,
        playerIndex: player._index,
      });

      // Sort businesses by value (biggest first)
      const sortedBiz = [...player.businesses].sort((a, b) => {
        return (b.level * (BIZ_MULT[b.type] || 1)) - (a.level * (BIZ_MULT[a.type] || 1));
      });

      const savedLayout = player.cityPrefs?.buildingLayout || {};
      const GRID_STEP = 4;
      const GRID_COLS = 3;
      const gridStartX = plotCx - Math.floor(GRID_COLS * GRID_STEP / 2);
      const gridStartY = plotCy - Math.floor(Math.ceil(sortedBiz.length / GRID_COLS) * GRID_STEP / 2);

      for (let j = 0; j < sortedBiz.length; j++) {
        const biz = sortedBiz[j];
        let wx, wy, facing;

        if (savedLayout[biz.type]) {
          wx = plotCx + savedLayout[biz.type].x;
          wy = plotCy + savedLayout[biz.type].y;
          facing = 'left';
        } else {
          const col = j % GRID_COLS;
          const row = Math.floor(j / GRID_COLS);
          wx = gridStartX + col * GRID_STEP;
          wy = gridStartY + row * GRID_STEP;
          if (wx === plotCx || wx === plotCx + 1) wx = plotCx + 3;
          if (wy === plotCy || wy === plotCy + 1) wy = plotCy + 3;
          facing = 'left';
        }

        const buildingData = {
          wx, wy,
          type: biz.type,
          level: biz.level,
          prestige: biz.prestige || 0,
          facing: facing || 'left',
          isPrestigeBlock: false,
          blockIndex: 0,
          playerIndex: player._index,
          displayName: player.displayName,
          profilePic: player.profilePic,
          equippedCosmetics: player.equippedCosmetics || {},
          empireValue: player._value,
          businesses: player.businesses,
          incomePerSecond: player.incomePerSecond || 0,
          coins: player.coins || 0,
          plotCx: plotCx,
          plotCy: plotCy,
        };
        placedBuildings.push(buildingData);

        const pBlocks = prestigeBlocks(biz.prestige || 0);
        const extensions = [
          { dx: 2, dy: 0 },
          { dx: 0, dy: 2 },
          { dx: 2, dy: 2 },
        ];
        for (let pb = 1; pb < pBlocks; pb++) {
          const ext = extensions[pb - 1];
          placedBuildings.push({
            ...buildingData,
            wx: wx + ext.dx,
            wy: wy + ext.dy,
            isPrestigeBlock: true,
            blockIndex: pb,
          });
        }
      }
    }

    // Place decorations from each player's saved preferences
    placedDecorations = [];
    for (let i = 0; i < ranked.length; i++) {
      const player = ranked[i];
      const pos = plotPositions[i];
      if (!pos) continue;
      const decos = player.cityPrefs?.decorations;
      if (!decos || !Array.isArray(decos)) continue;
      for (const d of decos) {
        if (!d.type || !CityDecorations.TYPES[d.type]) continue;
        placedDecorations.push({
          wx: pos.x + (d.x || 0),
          wy: pos.y + (d.y || 0),
          type: d.type,
          plotCx: pos.x,
          plotCy: pos.y,
        });
      }
    }

    // Generate grid roads
    generateRoads();

    // ── Ambient trees ────────────────────────────────────────────────────────
    ambientTrees = [];
    const normalTreeTypes = ['tree', 'pine', 'tree', 'pine', 'bush'];
    const riverTreeTypes = ['tree', 'bush', 'tree', 'bush', 'tree'];

    // Expand bounds for tree scattering
    let tMinX = -30, tMinY = -30, tMaxX = 30, tMaxY = 30;
    for (const b of placedBuildings) {
      if (b.wx - 20 < tMinX) tMinX = b.wx - 20;
      if (b.wy - 20 < tMinY) tMinY = b.wy - 20;
      if (b.wx + 20 > tMaxX) tMaxX = b.wx + 20;
      if (b.wy + 20 > tMaxY) tMaxY = b.wy + 20;
    }

    const CELL_SIZE = 6;
    for (let cy = tMinY; cy <= tMaxY; cy += CELL_SIZE) {
      for (let cx = tMinX; cx <= tMaxX; cx += CELL_SIZE) {
        const cellHash = ((cx * 73856093) ^ (cy * 19349663)) >>> 0;

        // Check if this cell is near the river (within ~8 tiles of sand edge)
        const midY = cy + CELL_SIZE / 2;
        const rc = riverCenterX(midY);
        const distToRiver = Math.abs((cx + CELL_SIZE / 2) - rc) - RIVER_HALF_WIDTH - RIVER_BANK_WIDTH;
        const nearRiver = distToRiver >= 0 && distToRiver < 8;

        // Higher tree density near river
        let treeCount;
        if (nearRiver) {
          treeCount = cellHash % 3 === 0 ? 3 : (cellHash % 2 === 0 ? 2 : 1);
        } else {
          treeCount = cellHash % 5 === 0 ? 2 : (cellHash % 3 === 0 ? 1 : 0);
        }

        for (let t = 0; t < treeCount; t++) {
          const subHash = ((cx * 48271 + cy * 16807 + t * 65537) * 2654435761) >>> 0;
          const rx = cx + (subHash % CELL_SIZE);
          const ry = cy + ((subHash >> 8) % CELL_SIZE);

          // Skip if inside any player plot
          let insidePlot = false;
          for (const plot of playerPlots) {
            const half = Math.floor(plot.w / 2) + 2;
            if (rx >= plot.cx - half && rx <= plot.cx + half &&
                ry >= plot.cy - half && ry <= plot.cy + half) {
              insidePlot = true;
              break;
            }
          }
          if (insidePlot) continue;

          // Skip if on road or water
          if (roadTiles.has(rx + ',' + ry)) continue;
          if (getRiverType(rx, ry) === 'water') continue;

          // Near river: prefer leafy trees and bushes. Far: normal mix
          const types = nearRiver ? riverTreeTypes : normalTreeTypes;
          const type = types[subHash % types.length];
          ambientTrees.push({ wx: rx, wy: ry, type });
        }
      }
    }

    // ── River walk: continuous meandering paths + furniture ─────────────────
    function isInsideAnyPlot(px, py) {
      for (const plot of playerPlots) {
        const half = Math.floor(plot.w / 2) + 2;
        if (px >= plot.cx - half && px <= plot.cx + half &&
            py >= plot.cy - half && py <= plot.cy + half) return true;
      }
      return false;
    }

    function isTileOpen(px, py) {
      if (isInsideAnyPlot(px, py)) return false;
      if (roadTiles.has(px + ',' + py)) return false;
      if (getRiverType(px, py)) return false;
      return true;
    }

    // Continuous path (step 1) with meandering offset via sine waves
    // Track previous X per side to fill corner gaps
    const prevPathX = { '-1': null, '1': null };

    for (let wy = tMinY; wy <= tMaxY; wy++) {
      for (const side of [-1, 1]) {
        const rc = riverCenterX(wy);
        const bankEdge = RIVER_HALF_WIDTH + RIVER_BANK_WIDTH;
        // Meandering offset: varies 1.5 to 7.5 tiles from sand edge
        const pathOffset = 3 + Math.sin(wy * 0.18) * 2.5 + Math.sin(wy * 0.06 + 1) * 2;
        const pathX = Math.round(rc + side * (bankEdge + pathOffset));

        if (!isTileOpen(pathX, wy)) {
          prevPathX[side] = null;
          continue;
        }

        // Main path tile
        ambientTrees.push({ wx: pathX, wy, type: 'path' });

        // Fill corner gap: when path shifts X, add intermediate tiles
        const prev = prevPathX[side];
        if (prev !== null && prev !== pathX) {
          const step = prev < pathX ? 1 : -1;
          for (let fx = prev; fx !== pathX; fx += step) {
            if (fx === prev) continue; // skip the tile already placed at prev wy
            if (isTileOpen(fx, wy)) {
              ambientTrees.push({ wx: fx, wy, type: 'path' });
            }
          }
        }
        prevPathX[side] = pathX;

        const hash = ((pathX * 73856093) ^ (wy * 19349663)) >>> 0;

        // Bench every ~20 tiles
        if (hash % 20 === 0 && isTileOpen(pathX + side, wy)) {
          ambientTrees.push({ wx: pathX + side, wy, type: 'bench' });
        }
        // Trash can every ~30 tiles
        if (hash % 30 === 5 && isTileOpen(pathX + side * 2, wy)) {
          ambientTrees.push({ wx: pathX + side * 2, wy, type: 'trash' });
        }
        // Lamp post every ~25 tiles
        if (hash % 25 === 11 && isTileOpen(pathX, wy + 1)) {
          ambientTrees.push({ wx: pathX, wy: wy + 1, type: 'lamp' });
        }
      }
    }

    // ── Parks in open grassy areas ───────────────────────────────────────────
    const parkSpacing = 22;
    let parksPlaced = 0;
    for (let py = tMinY + 10; py <= tMaxY - 10 && parksPlaced < 8; py += parkSpacing) {
      for (let px = tMinX + 10; px <= tMaxX - 10 && parksPlaced < 8; px += parkSpacing) {
        const parkHash = ((px * 48271 + py * 16807) * 2654435761) >>> 0;
        // Only ~30% of candidate spots get a park
        if (parkHash % 10 > 2) continue;

        // Check 6×6 area is clear
        let clear = true;
        for (let dy = -3; dy <= 3 && clear; dy++) {
          for (let dx = -3; dx <= 3 && clear; dx++) {
            if (!isTileOpen(px + dx, py + dy)) clear = false;
          }
        }
        if (!clear) continue;

        // Place park cluster
        // Central fountain
        ambientTrees.push({ wx: px, wy: py, type: 'fountain' });
        // Path tiles forming a small plaza ring
        const ring = [[-2,0],[2,0],[0,-2],[0,2],[-1,-1],[1,-1],[-1,1],[1,1]];
        for (const [dx, dy] of ring) {
          ambientTrees.push({ wx: px + dx, wy: py + dy, type: 'path' });
        }
        // Benches (2-3)
        ambientTrees.push({ wx: px - 3, wy: py, type: 'bench' });
        ambientTrees.push({ wx: px + 3, wy: py, type: 'bench' });
        if (parkHash % 3 === 0) {
          ambientTrees.push({ wx: px, wy: py + 3, type: 'bench' });
        }
        // Flower beds
        ambientTrees.push({ wx: px - 2, wy: py - 2, type: 'flowers' });
        ambientTrees.push({ wx: px + 2, wy: py + 2, type: 'flowers' });
        // Lamp post
        ambientTrees.push({ wx: px - 1, wy: py - 3, type: 'lamp' });
        // Trash can
        ambientTrees.push({ wx: px + 3, wy: py + 1, type: 'trash' });

        parksPlaced++;
      }
    }

    // Calculate bounds and center of mass
    let minX = 0, minY = 0, maxX = 0, maxY = 0;
    let sumX = 0, sumY = 0;
    for (const b of placedBuildings) {
      if (b.wx < minX) minX = b.wx;
      if (b.wy < minY) minY = b.wy;
      if (b.wx > maxX) maxX = b.wx;
      if (b.wy > maxY) maxY = b.wy;
      sumX += b.wx;
      sumY += b.wy;
    }
    for (const t of ambientTrees) {
      if (t.wx < minX) minX = t.wx;
      if (t.wy < minY) minY = t.wy;
      if (t.wx > maxX) maxX = t.wx;
      if (t.wy > maxY) maxY = t.wy;
    }
    const n = placedBuildings.length || 1;
    cityCenter = { x: sumX / n, y: sumY / n };
    bounds = {
      minX: minX - 5, minY: minY - 5,
      maxX: maxX + 5, maxY: maxY + 5
    };

    return placedBuildings;
  }

  // ─── Utility functions (unchanged) ────────────────────────────────────────

  function getBuildingAt(wx, wy) {
    const twx = Math.floor(wx);
    const twy = Math.floor(wy);
    for (const b of placedBuildings) {
      if (twx >= b.wx && twx < b.wx + 2 && twy >= b.wy && twy < b.wy + 2) {
        return b;
      }
    }
    let best = null;
    let bestDist = Infinity;
    for (const b of placedBuildings) {
      const cx = b.wx + 1;
      const cy = b.wy + 1;
      const dx = cx - wx;
      const dy = cy - wy;
      const dist = dx * dx + dy * dy;
      if (dist < 6 && dist < bestDist) {
        bestDist = dist;
        best = b;
      }
    }
    return best;
  }

  function getPlots() {
    return playerPlots;
  }

  function isTileFree(wx, wy, isBuilding) {
    const tiles = isBuilding ? [[0,0],[1,0],[0,1],[1,1]] : [[0,0]];
    for (const [dx, dy] of tiles) {
      const tx = wx + dx, ty = wy + dy;
      if (roadTiles.has(tx + ',' + ty)) return false;
      for (const b of placedBuildings) {
        if (tx >= b.wx && tx < b.wx + 2 && ty >= b.wy && ty < b.wy + 2) return false;
      }
      for (const d of placedDecorations) {
        if (tx === d.wx && ty === d.wy) return false;
      }
    }
    return true;
  }

  function isInPlot(wx, wy, plotCx, plotCy) {
    const plot = playerPlots.find(p => p.cx === plotCx && p.cy === plotCy);
    if (!plot) return false;
    const half = Math.floor(plot.w / 2);
    return wx >= plotCx - half && wx <= plotCx + half &&
           wy >= plotCy - half && wy <= plotCy + half;
  }

  function getDecorationAt(wx, wy) {
    const twx = Math.round(wx);
    const twy = Math.round(wy);
    return placedDecorations.find(d => d.wx === twx && d.wy === twy) || null;
  }

  window.CityLayout = {
    layoutCity, isRoad, isBridge, getRiverType, getBuildingAt, getDecorationAt,
    isTileFree, isInPlot, generateRoads,
    getPlacedBuildings: () => placedBuildings,
    getPlacedDecorations: () => placedDecorations,
    getAmbientTrees: () => ambientTrees,
    setPlacedDecorations: (d) => { placedDecorations = d; },
    getPlots,
    getBounds: () => bounds,
    getCenter: () => cityCenter,
    empireValue,
    DISTRICTS: {},
  };
})();
