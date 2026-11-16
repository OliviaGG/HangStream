/**
 * world.js — world model (plots, layouts) + renderer (sky, slabs, buildings,
 * labels, LOD) + hit testing.
 * Exports: window.TyWorld
 */
(function () {
  'use strict';

  const { TILE_W, TILE_H, cam, isoX, isoY, screenToIso, worldFromIso, applyTransform } = window.TyCam;
  const Art = window.TyArt;
  const Data = window.TyData;

  // ── Layout constants ───────────────────────────────────────────────────────
  const SLOT_PITCH = 16;      // tiles between plot origins (slab + air gap)
  const SLAB_GAP_LIFT = 0;

  // Building anchor slots per slab size (local tile coords, roomy for 3x3 feet)
  const SLOTS = {
    8:  [[1, 1], [4.5, 1], [1, 4.5], [4.5, 4.5]],
    10: [[1, 1], [4, 1], [7, 1.5], [1, 4], [1, 7], [4.5, 4.5]],
    12: [[1, 1], [4.5, 1], [8, 1], [1, 4.5], [8, 4.5], [1, 8], [4.5, 8], [8, 8], [4.5, 4.5], [8.5, 6.5], [6.5, 8.5]]
  };
  // default decorative fillers (used on tiles that stay free)
  const DEFAULT_DECOR = {
    8:  [['tree', 6.2, 6.2], ['bush', 0.2, 6.5], ['flowers', 6.5, 0.2]],
    10: [['tree', 8.2, 8.2], ['pine', 0.2, 8.4], ['flowers', 8.4, 3.4], ['bush', 3.2, 8.4], ['lamp', 5.5, 0.2]],
    12: [['fountain', 5.6, 5.6], ['tree', 10.4, 10.4], ['pine', 0.2, 10.4], ['tree', 10.4, 0.2], ['flowers', 3.2, 10.5], ['lamp', 6.5, 10.5], ['bench', 10.5, 6.4], ['bush', 0.2, 6.4]]
  };

  const model = { plots: [], myPlot: null };

  // spiral slot positions: 0=(0,0), then ring by ring
  function spiralPos(i) {
    if (i === 0) return [0, 0];
    let ring = 1, count = 1;
    while (count + ring * 8 <= i) { count += ring * 8; ring++; }
    const idx = i - count;
    const side = Math.floor(idx / (ring * 2)), off = idx % (ring * 2) - ring;
    if (side === 0) return [off, -ring];
    if (side === 1) return [ring, off];
    if (side === 2) return [-off, ring];
    return [-ring, -off];
  }

  function empireValue(p) {
    let v = Number(p.coins) || 0;
    (p.businesses || []).forEach(b => { v += (Number(b.level) || 0) * 5000; });
    return v;
  }

  function slabSize(bizCount) { return bizCount <= 3 ? 8 : bizCount <= 6 ? 10 : 12; }

  function parseMaybeJson(v, fallback) {
    if (v == null) return fallback;
    if (typeof v === 'object') return v;
    try { return JSON.parse(v); } catch (e) { return fallback; }
  }

  /** Compose a plot's building placements from saved layout or auto slots. */
  function layoutPlot(plot) {
    const size = plot.size;
    const slots = SLOTS[size];
    // prod /api/city exposes the layout as cityPrefs.buildingLayout ({type:{x,y}});
    // older/local variants may use cityLayout/city_layout
    const prefs = plot.player.cityPrefs || {};
    const savedLayout = parseMaybeJson(prefs.buildingLayout ?? prefs.cityLayout ?? prefs.city_layout, null);
    const placed = [];
    const used = [];

    const list = (plot.player.businesses || []).filter(b => b && b.type);

    // collision helpers — a saved position is only honored if it fits AND doesn't
    // overlap anything already placed (old v1 layouts used different geometry)
    const collides = (x, y, w, d) => used.some(([ux, uy, uw, ud]) =>
      x + w > ux && x < ux + uw && y + d > uy && y < uy + ud);
    const fits = (x, y, w, d) =>
      isFinite(x) && isFinite(y) && x >= 0 && y >= 0 && x + w <= size && y + d <= size && !collides(x, y, w, d);

    const footOf = (b) => (Data.bizMeta(b.type).foot || [2, 2]);
    const heightOf = (b) => window.TyArt.buildingHeight(b.type, Data.artTier(Number(b.level) || 1));

    // saved positions claim their spots first; the rest auto-place TALLEST-FIRST
    // into back-most slots so towers never hide short buildings in front
    const savedOnes = [], autoOnes = [];
    list.forEach(b => {
      const saved = savedLayout && savedLayout[b.type];
      const foot = footOf(b);
      if (saved && isFinite(Number(saved.x)) && isFinite(Number(saved.y))) savedOnes.push(b);
      else autoOnes.push(b);
    });
    autoOnes.sort((a, b) => heightOf(b) - heightOf(a));
    const slotOrder = [...slots].sort((a, b) => (a[0] + a[1]) - (b[0] + b[1])); // back → front

    const place = (b, x, y, foot) => {
      placed.push({
        type: b.type, level: Number(b.level) || 1,
        x, y, foot,
        tier: Data.artTier(Number(b.level) || 1)
      });
      used.push([x, y, foot[0], foot[1]]);
    };
    const autoSpot = (foot) => {
      for (const [sx, sy] of slotOrder) {
        if (fits(sx, sy, foot[0], foot[1])) return [sx, sy];
      }
      for (let gy = 0; gy <= size - foot[1]; gy += 0.5) {
        for (let gx = 0; gx <= size - foot[0]; gx += 0.5) {
          if (fits(gx, gy, foot[0], foot[1])) return [gx, gy];
        }
      }
      return [0, 0]; // plot genuinely full — stack at origin
    };

    savedOnes.forEach(b => {
      const foot = footOf(b);
      const saved = savedLayout[b.type];
      if (fits(Number(saved.x), Number(saved.y), foot[0], foot[1])) {
        place(b, Number(saved.x), Number(saved.y), foot);
      } else {
        const [x, y] = autoSpot(foot);
        place(b, x, y, foot);
      }
    });
    autoOnes.forEach(b => {
      const foot = footOf(b);
      const [x, y] = autoSpot(foot);
      place(b, x, y, foot);
    });
    plot.buildings = placed;

    // decorations: saved or defaults on free tiles
    const savedDecor = parseMaybeJson(prefs.decorations ?? prefs.cityDecorations ?? prefs.city_decorations, null);
    const overlaps = (x, y) => used.some(([ux, uy, uw, ud]) => x + 1 > ux && x < ux + uw && y + 1 > uy && y < uy + ud);
    if (Array.isArray(savedDecor) && savedDecor.length) {
      plot.decor = savedDecor
        .filter(d => d && (d.kind !== undefined || d.type !== undefined))
        .map(d => ({ kind: d.kind || d.type, x: Number(d.x) || 0, y: Number(d.y) || 0 }))
        .filter(d => Data.DECOR[d.kind] && d.x >= 0 && d.y >= 0 && d.x < plot.size && d.y < plot.size);
    } else {
      plot.decor = (DEFAULT_DECOR[size] || [])
        .filter(([, x, y]) => !overlaps(x, y))
        .map(([kind, x, y]) => ({ kind, x, y }));
    }
  }

  /** Build the whole world from /api/city players. Me-centric: my plot at center.
   *  Identity: match by discordId (exact, from session) first; display name is a
   *  last-resort fallback for older cached payloads. */
  function build(players, me) {
    const meId = me && me.id ? String(me.id) : null;
    const meName = me && (me.displayName || me.username);
    const sorted = [...players].sort((a, b) => empireValue(b) - empireValue(a));
    let mine = null;
    if (meId) {
      const idx = sorted.findIndex(p => p.discordId && String(p.discordId) === meId);
      if (idx >= 0) mine = sorted.splice(idx, 1)[0];
    }
    if (!mine && meName) {
      const idx = sorted.findIndex(p => p.displayName === meName || p.username === meName);
      if (idx >= 0) mine = sorted.splice(idx, 1)[0];
    }
    const ordered = mine ? [mine, ...sorted] : sorted;

    model.plots = ordered.map((player, i) => {
      const [gx, gy] = spiralPos(i);
      const size = slabSize((player.businesses || []).length);
      const origin = {
        wx: gx * SLOT_PITCH - size / 2,
        wy: gy * SLOT_PITCH - size / 2
      };
      const plot = {
        player, size, origin,
        isMine: mine ? i === 0 : false,
        value: empireValue(player),
        nameColor: player.equippedCosmetics?.name_color?.color || null
      };
      layoutPlot(plot);
      return plot;
    });
    model.myPlot = mine ? model.plots[0] : null;
    return model;
  }

  /** Refresh a single plot's layout (after edit / upgrade). */
  function relayout(plot) { layoutPlot(plot); cam.dirty = true; }

  // ── Geometry helpers ───────────────────────────────────────────────────────
  function plotIsoRect(plot) {
    const { wx, wy } = plot.origin, s = plot.size;
    const xs = [isoX(wx, wy), isoX(wx + s, wy), isoX(wx + s, wy + s), isoX(wx, wy + s)];
    const ys = [isoY(wx, wy), isoY(wx + s, wy), isoY(wx + s, wy + s), isoY(wx, wy + s)];
    return { x0: Math.min(...xs), y0: Math.min(...ys) - 90, x1: Math.max(...xs), y1: Math.max(...ys) + 30 };
  }
  function worldIsoRect() {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    model.plots.forEach(p => {
      const r = plotIsoRect(p);
      x0 = Math.min(x0, r.x0); y0 = Math.min(y0, r.y0);
      x1 = Math.max(x1, r.x1); y1 = Math.max(y1, r.y1);
    });
    return { x0, y0, x1, y1 };
  }

  // ── Rendering ──────────────────────────────────────────────────────────────
  const CLOUDS = [];
  for (let i = 0; i < 10; i++) {
    CLOUDS.push({ x: (i * 977) % 2400 - 1200, y: (i * 431) % 700 - 350, s: 0.7 + (i % 4) * 0.3, v: 4 + (i % 3) * 3 });
  }

  function drawSky(ctx, w, h, t) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#79c4f0');
    g.addColorStop(0.55, '#a5d8f6');
    g.addColorStop(1, '#d7ecfb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // sun glow top-left
    const sg = ctx.createRadialGradient(w * 0.18, h * 0.1, 0, w * 0.18, h * 0.1, w * 0.4);
    sg.addColorStop(0, 'rgba(255,250,220,0.55)');
    sg.addColorStop(1, 'rgba(255,250,220,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawClouds(ctx, w, h, t, layer) {
    // parallax: clouds drift + shift slightly against camera
    ctx.save();
    ctx.globalAlpha = layer === 0 ? 0.5 : 0.85;
    CLOUDS.forEach((c, i) => {
      if (i % 2 !== layer) return;
      const px = ((c.x + t * c.v - cam.x * 0.05 * c.s) % (w + 400)) - 200;
      const py = h * 0.12 + ((c.y - cam.y * 0.04 * c.s) % (h * 0.5) + h * 0.5) % (h * 0.5);
      const s = c.s * (w < 500 ? 0.8 : 1);
      ctx.fillStyle = '#ffffff';
      for (const [dx, dy, r] of [[-28, 4, 16], [0, 0, 22], [26, 6, 15], [8, 10, 18]]) {
        ctx.beginPath();
        ctx.arc(px + dx * s, py + dy * s, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    ctx.restore();
  }

  /** Main scene render. editState may carry {plot, sel, hover} */
  function render(ctx, canvas, t, editState) {
    const w = cam.vw, h = cam.vh;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    drawSky(ctx, w, h, t);
    drawClouds(ctx, w, h, t, 0);

    applyTransform(ctx);

    // visible iso viewport
    const tl = screenToIso(0, 0), br = screenToIso(w, h);
    const vis = model.plots.filter(p => {
      const r = plotIsoRect(p);
      return r.x1 > tl.ix - 40 && r.x0 < br.ix + 40 && r.y1 > tl.iy - 40 && r.y0 < br.iy + 120;
    });
    // paint far plots first (N to S)
    vis.sort((a, b) => (a.origin.wx + a.origin.wy) - (b.origin.wx + b.origin.wy));

    const lowLod = cam.scale < 0.2;
    const midLod = cam.scale < 0.34;

    vis.forEach(plot => {
      const { wx, wy } = plot.origin;
      Art.drawSlab(ctx, wx, wy, plot.size, plot.isMine ? { grassA: '#96e07a', grassB: '#5fc653' } : {});

      // depth-sort contents
      const items = [];
      plot.buildings.forEach(b => items.push({ d: (wx + b.x + b.foot[0] / 2) + (wy + b.y + b.foot[1] / 2), b }));
      plot.decor.forEach(dc => items.push({ d: (wx + dc.x + 0.5) + (wy + dc.y + 0.5), dc }));
      items.sort((a, b) => a.d - b.d);

      items.forEach(it => {
        if (it.b) {
          const bx = wx + it.b.x, by = wy + it.b.y;
          if (lowLod) {
            Art.isoBox(ctx, bx, by, it.b.foot[0], it.b.foot[1], 18 + it.b.tier * 10, Data.bizMeta(it.b.type).pal);
          } else {
            Art.drawBuilding(ctx, it.b.type, bx, by, it.b.tier, t);
            if (!midLod) {
              Art.drawLevelPill(ctx, bx + it.b.foot[0] / 2, by + it.b.foot[1] / 2,
                Art.buildingHeight(it.b.type, it.b.tier) + 44, it.b.level);
            }
          }
        } else if (!lowLod) {
          Art.drawDecor(ctx, it.dc.kind, wx + it.dc.x, wy + it.dc.y, t);
        }
      });

      // edit-mode overlays — dashed footprint outline, green = fits, red = blocked
      if (editState && editState.plot === plot) {
        if (editState.sel) {
          const b = editState.sel;
          ctx.save();
          ctx.strokeStyle = editState.selOk ? 'rgba(80,230,120,0.95)' : 'rgba(240,80,80,0.95)';
          ctx.lineWidth = 2.5;
          ctx.setLineDash([6, 4]);
          const p0 = Art.pt(wx + b.x, wy + b.y, 0), p1 = Art.pt(wx + b.x + b.foot[0], wy + b.y, 0),
                p2 = Art.pt(wx + b.x + b.foot[0], wy + b.y + b.foot[1], 0), p3 = Art.pt(wx + b.x, wy + b.y + b.foot[1], 0);
          ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.lineTo(p3.x, p3.y); ctx.closePath(); ctx.stroke();
          ctx.restore();
        }
      }
    });

    drawCloudLayerOver(ctx, w, h, t);

    // screen-space labels
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    plateHits.length = 0;
    if (midLod) {
      // plot name plates when zoomed out — a FIXED set (mine + richest N) so
      // plates don't pop in and out as the camera moves; overlapping lower-value
      // plates are skipped. Plates are also tap targets (see hitTest).
      const far = cam.scale < 0.12;
      const MAX_PLATES = far ? 9 : 14;
      const order = [...vis].sort((a, b) => (b.isMine - a.isMine) || (b.value - a.value)).slice(0, MAX_PLATES);
      order.forEach(plot => {
        const c = plotCenterScreen(plot);
        if (!c) return;
        const name = plot.player.displayName || '???';
        const val = Data.fmt(plot.value);
        const fs = far ? 10 : 12;
        ctx.font = `800 ${fs}px -apple-system, "Segoe UI", sans-serif`;
        const tw = Math.max(ctx.measureText(name).width, 30);
        const bw = tw + 20, bh = far ? 26 : 30;
        const x = c.x - bw / 2, y = c.y - (plot.size * TILE_H / 2) * cam.scale - (far ? 34 : 46);
        if (plateHits.some(r => x < r.x + r.w + 4 && x + bw > r.x - 4 && y < r.y + r.h + 4 && y + bh > r.y - 4)) return;
        plateHits.push({ x, y, w: bw, h: bh, plot });
        ctx.fillStyle = plot.isMine ? 'rgba(46,120,40,0.88)' : 'rgba(25,40,60,0.82)';
        ctx.beginPath(); ctx.roundRect(x, y, bw, bh, 9); ctx.fill();
        ctx.fillStyle = plot.nameColor || '#ffffff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(name, c.x, y + 3);
        ctx.fillStyle = 'rgba(255,225,130,0.95)';
        ctx.font = `700 ${far ? 9 : 10}px -apple-system, "Segoe UI", sans-serif`;
        ctx.fillText('⚡ ' + val, c.x, y + (far ? 14 : 17));
      });
    }
  }

  function drawCloudLayerOver(ctx, w, h, t) {
    // faint foreground clouds only when zoomed far out (adds depth to city view)
    if (cam.scale > 0.16) return;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.save();
    ctx.globalAlpha = 0.35;
    drawClouds(ctx, w, h, t * 1.6, 1);
    ctx.restore();
  }

  function plotCenterScreen(plot) {
    const cx = plot.origin.wx + plot.size / 2, cy = plot.origin.wy + plot.size / 2;
    return {
      x: (isoX(cx, cy) - cam.x) * cam.scale + cam.vw / 2,
      y: (isoY(cx, cy) - cam.y) * cam.scale + cam.vh / 2
    };
  }

  // ── Hit testing ────────────────────────────────────────────────────────────
  const plateHits = []; // screen-space name plate rects from the last render

  /** Precise picking: name plates → building bodies (front-to-back, z-swept only
   *  up to each building's real height) → ground tiles (z=0 only). */
  function hitTest(sx, sy) {
    // 1. name plates are explicit tap targets when zoomed out
    for (const r of plateHits) {
      if (sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h) {
        return { kind: 'plot', plot: r.plot };
      }
    }

    const iso = screenToIso(sx, sy);
    const frontFirst = [...model.plots].sort((a, b) => (b.origin.wx + b.origin.wy) - (a.origin.wx + a.origin.wy));

    // 2. building bodies — sweep z only up to that building's own height, and test
    //    every plot's buildings before falling back to any ground, so a tall
    //    building in front always wins over a slab behind it
    for (const plot of frontFirst) {
      const bs = [...plot.buildings].sort((a, b) => (b.x + b.y) - (a.x + a.y));
      for (const b of bs) {
        const h = Art.buildingHeight(b.type, b.tier);
        for (let dz = 0; dz <= h; dz += 6) {
          const wpt = worldFromIso(iso.ix, iso.iy + dz);
          const lx = wpt.wx - plot.origin.wx, ly = wpt.wy - plot.origin.wy;
          if (lx >= b.x && lx <= b.x + b.foot[0] && ly >= b.y && ly <= b.y + b.foot[1]) {
            return { kind: 'building', plot, building: b };
          }
        }
      }
    }

    // 3. ground tiles at z=0
    const g = worldFromIso(iso.ix, iso.iy);
    for (const plot of frontFirst) {
      const lx = g.wx - plot.origin.wx, ly = g.wy - plot.origin.wy;
      if (lx >= 0 && ly >= 0 && lx <= plot.size && ly <= plot.size) {
        return { kind: 'tile', plot, x: Math.min(plot.size - 1, Math.floor(lx)), y: Math.min(plot.size - 1, Math.floor(ly)) };
      }
    }
    return null;
  }

  window.TyWorld = { model, build, relayout, plotIsoRect, worldIsoRect, render, hitTest, empireValue };
})();
