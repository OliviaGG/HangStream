/**
 * city-renderer.js — Isometric rendering engine (OPTIMIZED)
 * Exports: window.CityRenderer
 */
(function () {
  'use strict';

  const { TILE_W, TILE_H, HALF_W, HALF_H, worldToScreen, getVisibleRange } = CityCamera;

  function formatEmpireValue(v) {
    if (v >= 10000) return (v / 1000).toFixed(0) + 'K';
    if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
    return String(v);
  }

  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.moveTo(x + r, y);
      this.lineTo(x + w - r, y); this.arcTo(x + w, y, x + w, y + r, r);
      this.lineTo(x + w, y + h - r); this.arcTo(x + w, y + h, x + w - r, y + h, r);
      this.lineTo(x + r, y + h); this.arcTo(x, y + h, x, y + h - r, r);
      this.lineTo(x, y + r); this.arcTo(x, y, x + r, y, r);
    };
  }

  // Ground colors
  const GRASS_COLORS = ['#1a2e1a', '#1d321d', '#192c19', '#1b301b'];
  const ROAD_COLOR = '#2a2a3a';
  const WATER_COLORS = ['#122e4a', '#153356', '#102a44', '#14304e'];
  const SAND_COLORS = ['#5c4a32', '#54432c', '#634f38', '#4e3f28'];
  const BRIDGE_COLORS = ['#5C3A1E', '#6B4423', '#523215', '#614020'];

  // Ground layer cache
  let groundCache = null;
  let groundCacheX = null;
  let groundCacheY = null;
  let groundCacheZoom = null;

  /**
   * Draw ground tiles with caching.
   * Only redraws when camera moves more than 2 tiles or zoom changes.
   */
  function renderGround(ctx, cam) {
    const range = getVisibleRange(cam);
    const hw = HALF_W * cam.zoom;
    const hh = HALF_H * cam.zoom;

    // Check if cache is still valid (camera hasn't moved much)
    const cacheValid = groundCache &&
      groundCacheZoom === cam.zoom &&
      groundCacheX !== null &&
      Math.abs(cam.x - groundCacheX) < hw * 2 &&
      Math.abs(cam.y - groundCacheY) < hh * 2;

    if (cacheValid) {
      // Draw cached ground with offset
      const dx = cam.x - groundCacheX;
      const dy = cam.y - groundCacheY;
      ctx.drawImage(groundCache, dx, dy);
      return;
    }

    // At very low zoom, just fill with average grass color — skip individual tiles
    if (cam.zoom < 0.3) {
      ctx.fillStyle = '#1b301b';
      ctx.fillRect(0, 0, cam.width, cam.height);
      // Draw roads as simple lines
      // Skip ground cache entirely at this zoom
      groundCache = null;
      return;
    }

    // Regenerate ground cache
    if (!groundCache) {
      groundCache = document.createElement('canvas');
    }
    groundCache.width = cam.width;
    groundCache.height = cam.height;
    const gctx = groundCache.getContext('2d');

    // Clear with background
    gctx.fillStyle = '#0a0e1a';
    gctx.fillRect(0, 0, cam.width, cam.height);

    // Batch tiles by type — grass stores world coords for detail hashing
    const grassBatches = [[], [], [], []]; // each entry: [sx, sy, wx, wy, ...]
    const roadBatch = [];
    const waterBatches = [[], [], [], []];
    const sandBatches = [[], [], [], []];
    const bridgeBatches = [[], [], [], []];

    for (let wy = range.minWY; wy <= range.maxWY; wy++) {
      for (let wx = range.minWX; wx <= range.maxWX; wx++) {
        const sx = (wx - wy) * hw + cam.x + cam.width / 2;
        const sy = (wx + wy) * hh + cam.y + cam.height / 2;

        if (sx < -hw * 2 || sx > cam.width + hw * 2) continue;
        if (sy < -hh * 2 || sy > cam.height + hh * 2) continue;

        // Bridge tiles override water
        if (CityLayout.isBridge(wx, wy)) {
          const bi = ((wx * 7 + wy * 13) & 3);
          bridgeBatches[bi].push(sx, sy, wx, wy);
        } else {
          const riverType = CityLayout.getRiverType(wx, wy);
          if (riverType === 'water') {
            const wi = ((wx * 7 + wy * 13) & 3);
            waterBatches[wi].push(sx, sy, wx, wy);
          } else if (riverType === 'sand') {
            const si = ((wx * 7 + wy * 13) & 3);
            sandBatches[si].push(sx, sy, wx, wy);
          } else if (CityLayout.isRoad(wx, wy)) {
            roadBatch.push(sx, sy);
          } else {
            const gi = ((wx * 7 + wy * 13) & 3);
            grassBatches[gi].push(sx, sy, wx, wy);
          }
        }
      }
    }

    // Draw all grass tiles in batches (one fillStyle per batch)
    for (let gi = 0; gi < 4; gi++) {
      const batch = grassBatches[gi];
      if (!batch.length) continue;
      gctx.fillStyle = GRASS_COLORS[gi];
      gctx.beginPath();
      for (let i = 0; i < batch.length; i += 4) {
        const sx = batch[i], sy = batch[i + 1];
        gctx.moveTo(sx, sy - hh);
        gctx.lineTo(sx + hw, sy);
        gctx.lineTo(sx, sy + hh);
        gctx.lineTo(sx - hw, sy);
      }
      gctx.fill();
    }

    // Draw all road tiles in one batch
    if (roadBatch.length) {
      gctx.fillStyle = ROAD_COLOR;
      gctx.beginPath();
      for (let i = 0; i < roadBatch.length; i += 2) {
        const sx = roadBatch[i], sy = roadBatch[i + 1];
        gctx.moveTo(sx, sy - hh);
        gctx.lineTo(sx + hw, sy);
        gctx.lineTo(sx, sy + hh);
        gctx.lineTo(sx - hw, sy);
      }
      gctx.fill();
    }

    // Draw water tiles in batches
    for (let wi = 0; wi < 4; wi++) {
      const batch = waterBatches[wi];
      if (!batch.length) continue;
      gctx.fillStyle = WATER_COLORS[wi];
      gctx.beginPath();
      for (let i = 0; i < batch.length; i += 4) {
        const sx = batch[i], sy = batch[i + 1];
        gctx.moveTo(sx, sy - hh);
        gctx.lineTo(sx + hw, sy);
        gctx.lineTo(sx, sy + hh);
        gctx.lineTo(sx - hw, sy);
      }
      gctx.fill();
    }

    // Draw sand tiles in batches
    for (let si = 0; si < 4; si++) {
      const batch = sandBatches[si];
      if (!batch.length) continue;
      gctx.fillStyle = SAND_COLORS[si];
      gctx.beginPath();
      for (let i = 0; i < batch.length; i += 4) {
        const sx = batch[i], sy = batch[i + 1];
        gctx.moveTo(sx, sy - hh);
        gctx.lineTo(sx + hw, sy);
        gctx.lineTo(sx, sy + hh);
        gctx.lineTo(sx - hw, sy);
      }
      gctx.fill();
    }

    // Draw bridges with 3D depth — elevated surface + side walls
    const bridgeElev = 4 * cam.zoom; // elevation in screen pixels

    // Side walls first (drawn below the surface)
    for (let bi = 0; bi < 4; bi++) {
      const batch = bridgeBatches[bi];
      if (!batch.length) continue;
      for (let i = 0; i < batch.length; i += 4) {
        const sx = batch[i], sy = batch[i + 1];
        // Right-side wall (darker wood)
        gctx.fillStyle = '#3A2210';
        gctx.beginPath();
        gctx.moveTo(sx, sy + hh - bridgeElev);       // bottom-center elevated
        gctx.lineTo(sx + hw, sy - bridgeElev);        // right elevated
        gctx.lineTo(sx + hw, sy);                      // right ground
        gctx.lineTo(sx, sy + hh);                      // bottom-center ground
        gctx.closePath();
        gctx.fill();
        // Bottom-side wall (medium wood)
        gctx.fillStyle = '#4A2E14';
        gctx.beginPath();
        gctx.moveTo(sx, sy + hh - bridgeElev);
        gctx.lineTo(sx - hw, sy - bridgeElev);
        gctx.lineTo(sx - hw, sy);
        gctx.lineTo(sx, sy + hh);
        gctx.closePath();
        gctx.fill();
      }
    }

    // Bridge surface (elevated)
    for (let bi = 0; bi < 4; bi++) {
      const batch = bridgeBatches[bi];
      if (!batch.length) continue;
      gctx.fillStyle = BRIDGE_COLORS[bi];
      gctx.beginPath();
      for (let i = 0; i < batch.length; i += 4) {
        const sx = batch[i], sy = batch[i + 1] - bridgeElev;
        gctx.moveTo(sx, sy - hh);
        gctx.lineTo(sx + hw, sy);
        gctx.lineTo(sx, sy + hh);
        gctx.lineTo(sx - hw, sy);
      }
      gctx.fill();
    }

    // Bridge plank lines + railing posts
    if (cam.zoom >= 0.4) {
      const z = cam.zoom;
      for (let bi = 0; bi < 4; bi++) {
        const batch = bridgeBatches[bi];
        for (let i = 0; i < batch.length; i += 4) {
          const sx = batch[i], sy = batch[i + 1] - bridgeElev;
          const wx = batch[i + 2], wy = batch[i + 3];
          // Plank grain lines
          gctx.strokeStyle = '#3A2210';
          gctx.lineWidth = Math.max(0.5, 0.5 * z);
          for (let pl = -1; pl <= 1; pl++) {
            const py = sy + pl * hh * 0.4;
            gctx.beginPath();
            gctx.moveTo(sx - hw * 0.6, py + hh * 0.3);
            gctx.lineTo(sx + hw * 0.6, py - hh * 0.3);
            gctx.stroke();
          }
          // Railing posts every 3 tiles on bridge edges
          if ((wx + wy) % 3 === 0) {
            const postH = Math.max(3, Math.round(6 * z));
            const postW = Math.max(1, Math.round(1.5 * z));
            // Top-right edge post
            gctx.fillStyle = '#5C3311';
            gctx.fillRect(Math.round(sx + hw * 0.9) - postW, Math.round(sy - hh * 0.1) - postH, postW * 2, postH);
            // Top-left edge post
            gctx.fillRect(Math.round(sx - hw * 0.9) - postW, Math.round(sy - hh * 0.1) - postH, postW * 2, postH);
            // Post caps
            gctx.fillStyle = '#8B5E2E';
            gctx.fillRect(Math.round(sx + hw * 0.9) - postW, Math.round(sy - hh * 0.1) - postH, postW * 2, 1);
            gctx.fillRect(Math.round(sx - hw * 0.9) - postW, Math.round(sy - hh * 0.1) - postH, postW * 2, 1);
          }
        }
      }
    }

    // Draw grass tufts, weeds, and small details on non-road tiles
    // Uses WORLD coordinates for hashing so grass stays fixed when camera moves
    if (cam.zoom >= 0.5) {
      const grassDetailColors = ['#2a4a2a', '#254525', '#1e3e1e', '#2d502d', '#335533'];
      const weedColors = ['#3a6a3a', '#2e5e2e', '#4a7a4a'];
      const z = cam.zoom;

      for (let gi = 0; gi < 4; gi++) {
        const batch = grassBatches[gi];
        for (let i = 0; i < batch.length; i += 4) {
          const sx = batch[i], sy = batch[i + 1];
          const wx = batch[i + 2], wy = batch[i + 3];

          // Hash on WORLD coordinates — deterministic regardless of camera position
          const tileHash = ((wx * 73856093) ^ (wy * 19349663)) >>> 0;

          // ~40% of tiles get grass tufts
          if ((tileHash & 7) > 4) continue;

          const grassType = tileHash % 5;
          // Offset within the tile — also based on world coords so it's fixed
          const offsetX = ((tileHash >> 3) % 7 - 3) * z;
          const offsetY = ((tileHash >> 6) % 5 - 2) * z;
          const px = sx + offsetX;
          const py = sy + offsetY;

          if (grassType === 0) {
            // Short grass tuft
            gctx.fillStyle = grassDetailColors[tileHash % grassDetailColors.length];
            const h = (2 + (tileHash >> 9) % 2) * z;
            gctx.fillRect(Math.round(px - 0.5 * z), Math.round(py - h), Math.round(z), Math.round(h));
            gctx.fillRect(Math.round(px + z), Math.round(py - h * 0.8), Math.round(z), Math.round(h * 0.8));
          } else if (grassType === 1) {
            // Tall weed
            gctx.fillStyle = weedColors[tileHash % weedColors.length];
            const h = (3 + (tileHash >> 9) % 3) * z;
            gctx.fillRect(Math.round(px), Math.round(py - h), Math.round(z * 0.8), Math.round(h));
            gctx.fillRect(Math.round(px - z), Math.round(py - h), Math.round(z * 2), Math.round(z));
          } else if (grassType === 2) {
            // Grass clump
            gctx.fillStyle = grassDetailColors[(tileHash >> 4) % grassDetailColors.length];
            const h = 2 * z;
            gctx.fillRect(Math.round(px - z), Math.round(py - h), Math.round(z * 3), Math.round(h));
          } else if (grassType === 3) {
            // Tiny flower
            gctx.fillStyle = grassDetailColors[0];
            gctx.fillRect(Math.round(px), Math.round(py - 2 * z), Math.round(z), Math.round(2 * z));
            const flowerColors = ['#FFD700', '#FF69B4', '#FFFFFF', '#DDA0DD'];
            gctx.fillStyle = flowerColors[(tileHash >> 12) % flowerColors.length];
            gctx.fillRect(Math.round(px - 0.5 * z), Math.round(py - 3 * z), Math.round(z * 1.5), Math.round(z * 1.5));
          } else {
            // Dark patch
            gctx.fillStyle = '#152015';
            gctx.fillRect(Math.round(px - z), Math.round(py - z), Math.round(z * 2), Math.round(z * 1.5));
          }
        }
      }
    }

    // Draw water details: subtle ripple highlights
    if (cam.zoom >= 0.5) {
      const z = cam.zoom;
      const waterHighlights = ['#1e4a6e', '#2a5a7e', '#1a4264'];
      for (let wi = 0; wi < 4; wi++) {
        const batch = waterBatches[wi];
        for (let i = 0; i < batch.length; i += 4) {
          const sx = batch[i], sy = batch[i + 1];
          const wx = batch[i + 2], wy = batch[i + 3];
          const tileHash = ((wx * 73856093) ^ (wy * 19349663)) >>> 0;
          if ((tileHash & 7) > 2) continue; // ~37% of water tiles get ripples
          const offsetX = ((tileHash >> 3) % 5 - 2) * z;
          const offsetY = ((tileHash >> 6) % 3 - 1) * z;
          gctx.fillStyle = waterHighlights[tileHash % waterHighlights.length];
          const rw = (2 + (tileHash >> 9) % 3) * z;
          gctx.fillRect(Math.round(sx + offsetX - rw / 2), Math.round(sy + offsetY), Math.round(rw), Math.round(z * 0.7));
        }
      }
    }

    // Draw sand details: small pebbles and texture
    if (cam.zoom >= 0.5) {
      const z = cam.zoom;
      const pebbleColors = ['#7a6545', '#6b583a', '#8c7550'];
      for (let si = 0; si < 4; si++) {
        const batch = sandBatches[si];
        for (let i = 0; i < batch.length; i += 4) {
          const sx = batch[i], sy = batch[i + 1];
          const wx = batch[i + 2], wy = batch[i + 3];
          const tileHash = ((wx * 73856093) ^ (wy * 19349663)) >>> 0;
          if ((tileHash & 7) > 3) continue; // ~50% of sand tiles
          const offsetX = ((tileHash >> 3) % 7 - 3) * z;
          const offsetY = ((tileHash >> 6) % 5 - 2) * z;
          gctx.fillStyle = pebbleColors[tileHash % pebbleColors.length];
          gctx.fillRect(Math.round(sx + offsetX), Math.round(sy + offsetY), Math.round(z), Math.round(z));
        }
      }
    }

    // Save cache state
    groundCacheX = cam.x;
    groundCacheY = cam.y;
    groundCacheZoom = cam.zoom;

    // Draw cached ground
    ctx.drawImage(groundCache, 0, 0);
  }

  // ─── Fence drawing helpers ─────────────────────────────────────────────────

  function drawFencePost(ctx, sx, sy, z) {
    const pw = Math.max(2, Math.round(2 * z));
    const ph = Math.max(3, Math.round(8 * z));
    ctx.fillStyle = '#3D1F08';
    ctx.fillRect(Math.round(sx) - pw + 1, Math.round(sy) - ph + 1, pw * 2 - 1, ph - 1);
    ctx.fillStyle = '#5C3311';
    ctx.fillRect(Math.round(sx) - pw, Math.round(sy) - ph, pw * 2, ph);
    ctx.fillStyle = '#8B5E2E';
    ctx.fillRect(Math.round(sx) - pw, Math.round(sy) - ph, 1, ph);
    ctx.fillStyle = '#A07040';
    ctx.fillRect(Math.round(sx) - pw, Math.round(sy) - ph, pw * 2, 1);
  }

  function drawFenceRail(ctx, sx1, sy1, sx2, sy2, z, heightPx) {
    const rh = Math.max(1, Math.round(1.5 * z));
    const hy = heightPx * z;
    const r1y = Math.round(sy1 - hy);
    const r2y = Math.round(sy2 - hy);
    ctx.fillStyle = '#7A4E23';
    ctx.beginPath();
    ctx.moveTo(Math.round(sx1), r1y);
    ctx.lineTo(Math.round(sx2), r2y);
    ctx.lineTo(Math.round(sx2), r2y + rh);
    ctx.lineTo(Math.round(sx1), r1y + rh);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#9E6534';
    ctx.beginPath();
    ctx.moveTo(Math.round(sx1), r1y);
    ctx.lineTo(Math.round(sx2), r2y);
    ctx.lineTo(Math.round(sx2), r2y + 1);
    ctx.lineTo(Math.round(sx1), r1y + 1);
    ctx.closePath();
    ctx.fill();
  }

  function drawFenceSegment(ctx, cam, wx, wy, dir) {
    const z = cam.zoom;
    const s1 = worldToScreen(cam, wx, wy);
    if (dir === 'h') {
      if (CityLayout.isRoad(wx, wy) || CityLayout.isRoad(wx + 1, wy)) return;
      if (CityLayout.getRiverType(wx, wy) || CityLayout.getRiverType(wx + 1, wy)) return;
      const s2 = worldToScreen(cam, wx + 1, wy);
      drawFenceRail(ctx, s1.x, s1.y, s2.x, s2.y, z, 5);
      drawFenceRail(ctx, s1.x, s1.y, s2.x, s2.y, z, 2);
      drawFencePost(ctx, s1.x, s1.y, z);
      drawFencePost(ctx, s2.x, s2.y, z);
    } else {
      if (CityLayout.isRoad(wx, wy) || CityLayout.isRoad(wx, wy + 1)) return;
      if (CityLayout.getRiverType(wx, wy) || CityLayout.getRiverType(wx, wy + 1)) return;
      const s2 = worldToScreen(cam, wx, wy + 1);
      drawFenceRail(ctx, s1.x, s1.y, s2.x, s2.y, z, 5);
      drawFenceRail(ctx, s1.x, s1.y, s2.x, s2.y, z, 2);
      drawFencePost(ctx, s1.x, s1.y, z);
      drawFencePost(ctx, s2.x, s2.y, z);
    }
  }

  /**
   * Render the full city frame
   */
  function render(ctx, cam, buildings) {
    const w = cam.width;
    const h = cam.height;

    // Clear
    ctx.fillStyle = '#0a0e1a';
    ctx.fillRect(0, 0, w, h);

    // Draw ground tiles (cached)
    renderGround(ctx, cam);

    if (!buildings || !buildings.length) return;

    // Get visible range for culling
    const range = getVisibleRange(cam);

    // Draw ground-level decorations
    const allDecos = CityLayout.getPlacedDecorations();
    for (const d of allDecos) {
      if (d.wx < range.minWX || d.wx > range.maxWX) continue;
      if (d.wy < range.minWY || d.wy > range.maxWY) continue;
      const info = CityDecorations.TYPES[d.type];
      if (!info || !info.ground) continue;
      const sprite = CityDecorations.getSprite(d.type);
      if (!sprite) continue;
      const scr = worldToScreen(cam, d.wx, d.wy);
      const dw = sprite.width * cam.zoom;
      const dh = sprite.height * cam.zoom;
      ctx.drawImage(sprite.canvas, 0, 0, sprite.width, sprite.height,
        scr.x - sprite.anchorX * cam.zoom, scr.y - sprite.anchorY * cam.zoom, dw, dh);
    }

    // Collect visible buildings + non-ground decorations + characters
    const visible = [];
    for (const b of buildings) {
      if (b.wx < range.minWX - 2 || b.wx > range.maxWX + 2) continue;
      if (b.wy < range.minWY - 2 || b.wy > range.maxWY + 2) continue;
      visible.push(b);
    }

    // Only add decorations and characters if zoom is high enough
    if (cam.zoom >= 0.4) {
      for (const d of allDecos) {
        if (d.wx < range.minWX || d.wx > range.maxWX) continue;
        if (d.wy < range.minWY || d.wy > range.maxWY) continue;
        const info = CityDecorations.TYPES[d.type];
        if (!info || info.ground) continue;
        visible.push({ ...d, _kind: 'decoration' });
      }
    }

    // Ambient trees (outside plots) — show at zoom >= 0.3
    if (cam.zoom >= 0.3) {
      const ambientTrees = CityLayout.getAmbientTrees();
      for (const t of ambientTrees) {
        if (t.wx < range.minWX - 1 || t.wx > range.maxWX + 1) continue;
        if (t.wy < range.minWY - 1 || t.wy > range.maxWY + 1) continue;
        visible.push({ ...t, _kind: 'decoration' });
      }
    }

    // Characters only at higher zoom
    if (cam.zoom >= 0.5) {
      const chars = CityCharacters.getCharacters();
      for (const ch of chars) {
        if (ch.wx < range.minWX - 1 || ch.wx > range.maxWX + 1) continue;
        if (ch.wy < range.minWY - 1 || ch.wy > range.maxWY + 1) continue;
        visible.push({ ...ch, _kind: 'character' });
      }
    }

    // Fence segments for plot boundaries — depth-sorted with buildings
    if (cam.zoom >= 0.35) {
      const plots = CityLayout.getPlots();
      for (const plot of plots) {
        const hw = Math.floor(plot.w / 2);
        const hh = Math.floor(plot.h / 2);
        const x1 = plot.cx - hw, y1 = plot.cy - hh;
        const x2 = plot.cx + hw, y2 = plot.cy + hh;
        // North edge: constant y1, walk x
        for (let wx = x1; wx < x2; wx++) {
          if (wx < range.minWX - 1 || wx > range.maxWX + 1 || y1 < range.minWY - 1 || y1 > range.maxWY + 1) continue;
          visible.push({ wx, wy: y1, _kind: 'fence', dir: 'h' });
        }
        // South edge: constant y2, walk x
        for (let wx = x1; wx < x2; wx++) {
          if (wx < range.minWX - 1 || wx > range.maxWX + 1 || y2 < range.minWY - 1 || y2 > range.maxWY + 1) continue;
          visible.push({ wx, wy: y2, _kind: 'fence', dir: 'h' });
        }
        // West edge: constant x1, walk y
        for (let wy = y1; wy < y2; wy++) {
          if (x1 < range.minWX - 1 || x1 > range.maxWX + 1 || wy < range.minWY - 1 || wy > range.maxWY + 1) continue;
          visible.push({ wx: x1, wy, _kind: 'fence', dir: 'v' });
        }
        // East edge: constant x2, walk y
        for (let wy = y1; wy < y2; wy++) {
          if (x2 < range.minWX - 1 || x2 > range.maxWX + 1 || wy < range.minWY - 1 || wy > range.maxWY + 1) continue;
          visible.push({ wx: x2, wy, _kind: 'fence', dir: 'v' });
        }
      }
    }

    // Sort back-to-front
    visible.sort((a, b) => (a.wy + a.wx) - (b.wy + b.wx));

    // Draw everything
    for (const b of visible) {
      if (b._kind === 'character') {
        const sprite = CityCharacters.getCharSprite(b.color, b.walkFrame || 0, b.facing || 'left');
        if (!sprite) continue;
        const scr = worldToScreen(cam, b.wx, b.wy);
        const dw = sprite.width * cam.zoom;
        const dh = sprite.height * cam.zoom;
        ctx.drawImage(sprite.canvas, 0, 0, sprite.width, sprite.height,
          scr.x - sprite.anchorX * cam.zoom, scr.y - sprite.anchorY * cam.zoom, dw, dh);
        continue;
      }

      if (b._kind === 'fence') {
        drawFenceSegment(ctx, cam, b.wx, b.wy, b.dir);
        continue;
      }

      if (b._kind === 'decoration') {
        const sprite = CityDecorations.getSprite(b.type);
        if (!sprite) continue;
        const scr = worldToScreen(cam, b.wx, b.wy);
        const dw = sprite.width * cam.zoom;
        const dh = sprite.height * cam.zoom;
        ctx.drawImage(sprite.canvas, 0, 0, sprite.width, sprite.height,
          scr.x - sprite.anchorX * cam.zoom, scr.y - sprite.anchorY * cam.zoom, dw, dh);
        continue;
      }

      // Building
      const scr = worldToScreen(cam, b.wx + 1, b.wy + 1);
      const accent = b.equippedCosmetics?.word_color?.color || null;
      const facing = b.facing || 'left';
      const sprite = CityBuildings.getSprite(b.type, b.level, accent, facing);
      if (!sprite) continue;

      const dw = sprite.width * cam.zoom;
      const dh = sprite.height * cam.zoom;
      const dx = scr.x - sprite.anchorX * cam.zoom;
      const dy = scr.y - sprite.anchorY * cam.zoom;

      // Skip tiny buildings at low zoom
      if (dw < 3 || dh < 3) continue;

      if (facing === 'right' || facing === 'back-right') {
        ctx.save();
        ctx.translate(dx + dw, dy);
        ctx.scale(-1, 1);
        ctx.drawImage(sprite.canvas, 0, 0, sprite.width, sprite.height, 0, 0, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(sprite.canvas, 0, 0, sprite.width, sprite.height, dx, dy, dw, dh);
      }
    }

    // Ambient effects — only at higher zoom
    if (cam.zoom >= 0.6) {
      const visibleBuildings = visible.filter(b => !b._kind);
      CityEffects.drawAmbient(ctx, visibleBuildings, cam);
    }

    // Player name labels — only at higher zoom
    const plots = CityLayout.getPlots();
    if (plots && cam.zoom >= 0.4) {
      for (const plot of plots) {
        if (plot.cx < range.minWX - 4 || plot.cx > range.maxWX + 4) continue;
        if (plot.cy < range.minWY - 4 || plot.cy > range.maxWY + 4) continue;

        const scr = worldToScreen(cam, plot.cx, plot.cy);
        const cosParams = CityCosmetics.extractCanvasParams(plot.equippedCosmetics);
        const nameColor = cosParams.nameColor || '#eef4ff';
        const nameGlow = cam.zoom >= 0.7 ? cosParams.nameGlow : null;

        let maxH = 40;
        for (const b of visible) {
          if (b.plotCx === plot.cx && b.plotCy === plot.cy && !b._kind) {
            const bh = CityBuildings.getBuildingHeight(b.type, b.level);
            if (bh > maxH) maxH = bh;
          }
        }

        const labelY = scr.y - (maxH + HALF_H + 14) * cam.zoom;
        const fontSize = Math.max(9, Math.round(11 * cam.zoom));
        ctx.font = `bold ${fontSize}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        const name = plot.displayName || 'Player';
        const textW = ctx.measureText(name).width;

        ctx.fillStyle = 'rgba(10, 14, 26, 0.7)';
        const pillPad = 4 * cam.zoom;
        ctx.beginPath();
        ctx.roundRect(scr.x - textW / 2 - pillPad, labelY - fontSize + 1, textW + pillPad * 2, fontSize + pillPad, 4);
        ctx.fill();

        if (nameGlow) {
          ctx.shadowColor = nameGlow.color;
          ctx.shadowBlur = nameGlow.blur * cam.zoom;
          ctx.shadowOffsetX = (nameGlow.offsetX || 0) * cam.zoom;
          ctx.shadowOffsetY = (nameGlow.offsetY || 0) * cam.zoom;
        }
        ctx.fillStyle = nameColor;
        ctx.fillText(name, scr.x, labelY);
        if (nameGlow) {
          ctx.shadowBlur = 0;
          ctx.shadowColor = 'transparent';
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 0;
        }

        if (cam.zoom >= 0.8) {
          ctx.font = `${Math.max(7, Math.round(8 * cam.zoom))}px Inter, sans-serif`;
          ctx.fillStyle = '#f3bf4b';
          ctx.globalAlpha = 0.7;
          ctx.fillText(formatEmpireValue(plot.empireValue), scr.x, labelY + fontSize * 0.9);
          ctx.globalAlpha = 1;
        }
      }
    }
  }

  /**
   * Render the minimap
   */
  function renderMinimap(minimapCanvas, cam, buildings) {
    const mctx = minimapCanvas.getContext('2d');
    const mw = minimapCanvas.width;
    const mh = minimapCanvas.height;
    mctx.fillStyle = '#0a0e1a';
    mctx.fillRect(0, 0, mw, mh);

    const bounds = CityLayout.getBounds();
    const rangeX = bounds.maxX - bounds.minX || 60;
    const rangeY = bounds.maxY - bounds.minY || 60;

    if (buildings) {
      for (const b of buildings) {
        if (b.isPrestigeBlock) continue; // skip prestige blocks for perf
        const mx = (b.wx - bounds.minX) / rangeX * mw * 0.8 + mw * 0.1;
        const my = (b.wy - bounds.minY) / rangeY * mh * 0.8 + mh * 0.1;
        const typeInfo = CityBuildings.TYPES[b.type];
        mctx.fillStyle = typeInfo ? typeInfo.colors[0] : '#888';
        mctx.fillRect(mx - 1, my - 1, 2, 2);
      }
    }

    const tl = CityCamera.screenToWorld(cam, 0, 0);
    const br = CityCamera.screenToWorld(cam, cam.width, cam.height);
    const vlx = (tl.x - bounds.minX) / rangeX * mw * 0.8 + mw * 0.1;
    const vly = (tl.y - bounds.minY) / rangeY * mh * 0.8 + mh * 0.1;
    const vrx = (br.x - bounds.minX) / rangeX * mw * 0.8 + mw * 0.1;
    const vry = (br.y - bounds.minY) / rangeY * mh * 0.8 + mh * 0.1;

    mctx.strokeStyle = '#56d4ff';
    mctx.lineWidth = 1;
    mctx.strokeRect(vlx, vly, vrx - vlx, vry - vly);
  }

  window.CityRenderer = {
    render, renderMinimap
  };
})();
