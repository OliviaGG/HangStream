/**
 * art.js — polished isometric vector art: plot slabs, 9 business buildings
 * (3 art tiers each), decorations, ambient effects. All drawing happens in
 * iso plane units at scale 1; the camera transform handles zoom.
 * Exports: window.TyArt
 */
(function () {
  'use strict';

  const { TILE_W, TILE_H, isoX, isoY } = window.TyCam;

  // ── Color helpers ──────────────────────────────────────────────────────────
  function hexRgb(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  function shade(hex, k) { // k>1 lighten, k<1 darken
    const [r, g, b] = hexRgb(hex);
    const f = (v) => Math.max(0, Math.min(255, Math.round(k >= 1 ? v + (255 - v) * (k - 1) : v * k)));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  function rgba(hex, a) { const [r, g, b] = hexRgb(hex); return `rgba(${r},${g},${b},${a})`; }

  function poly(ctx, pts, fill, stroke) {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1; ctx.stroke(); }
  }
  function pt(wx, wy, h) { return { x: isoX(wx, wy), y: isoY(wx, wy) - (h || 0) }; }
  function lerp(a, b, t) { return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }; }

  // ── Core iso box ───────────────────────────────────────────────────────────
  /** Draw a box on footprint (wx,wy)-(wx+w,wy+d), base lifted z, height h. */
  function isoBox(ctx, wx, wy, w, d, h, color, z) {
    z = z || 0;
    const N = pt(wx, wy, z), E = pt(wx + w, wy, z), S = pt(wx + w, wy + d, z), W = pt(wx, wy + d, z);
    const Nt = { x: N.x, y: N.y - h }, Et = { x: E.x, y: E.y - h }, St = { x: S.x, y: S.y - h }, Wt = { x: W.x, y: W.y - h };
    // left face (SW-facing) darkest, right face (SE) mid, top lightest
    poly(ctx, [W, S, St, Wt], shade(color, 0.62));
    poly(ctx, [S, E, Et, St], shade(color, 0.84));
    poly(ctx, [Nt, Et, St, Wt], shade(color, 1.16));
    // crisp top edge highlight
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(Wt.x, Wt.y); ctx.lineTo(St.x, St.y); ctx.lineTo(Et.x, Et.y); ctx.stroke();
    return { N, E, S, W, Nt, Et, St, Wt };
  }

  /** Rows×cols windows on the face spanned by ground corners c0→c1 with height h (z-offset zb). */
  function windows(ctx, c0, c1, h, zb, rows, cols, color, litFrac, t) {
    const mU = 0.14, mV = 0.16;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const u0 = mU + (c / cols) * (1 - 2 * mU), u1 = mU + ((c + 0.62) / cols) * (1 - 2 * mU);
        const v0 = mV + (r / rows) * (1 - 2 * mV), v1 = mV + ((r + 0.58) / rows) * (1 - 2 * mV);
        const a0 = lerp(c0, c1, u0), a1 = lerp(c0, c1, u1);
        const y00 = a0.y - zb - h * (1 - v0), y01 = a0.y - zb - h * (1 - v1);
        const y10 = a1.y - zb - h * (1 - v0), y11 = a1.y - zb - h * (1 - v1);
        const lit = ((r * 7 + c * 13) % 10) / 10 < litFrac;
        poly(ctx, [{ x: a0.x, y: y00 }, { x: a1.x, y: y10 }, { x: a1.x, y: y11 }, { x: a0.x, y: y01 }],
          lit ? '#ffe9a8' : color);
      }
    }
  }

  function shadow(ctx, wx, wy, w, d, spread) {
    const c = pt(wx + w / 2, wy + d / 2, 0);
    const rx = (w + d) * (TILE_W / 4) * (spread || 0.62);
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.scale(1, 0.5);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
    g.addColorStop(0, 'rgba(20,40,60,0.28)');
    g.addColorStop(1, 'rgba(20,40,60,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /** Striped awning along the SE face edge (from corner (wx+w,wy) to (wx+w,wy+d)) */
  function awning(ctx, wx, wy, w, d, zTop, colA, colB) {
    const stripes = 6;
    const e0 = pt(wx + w, wy, zTop), e1 = pt(wx + w, wy + d, zTop);
    const o0 = pt(wx + w + 0.45, wy, zTop - 9), o1 = pt(wx + w + 0.45, wy + d, zTop - 9);
    for (let i = 0; i < stripes; i++) {
      const a = lerp(e0, e1, i / stripes), b = lerp(e0, e1, (i + 1) / stripes);
      const a2 = lerp(o0, o1, i / stripes), b2 = lerp(o0, o1, (i + 1) / stripes);
      poly(ctx, [a, b, b2, a2], i % 2 ? colA : colB);
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath(); ctx.moveTo(o0.x, o0.y); ctx.lineTo(o1.x, o1.y); ctx.stroke();
  }

  /** Small floating sign board above the building with an emoji. */
  function sign(ctx, wx, wy, z, emoji, col) {
    const c = pt(wx, wy, z);
    ctx.save();
    ctx.translate(c.x, c.y);
    const w2 = 17, h2 = 17, r = 5;
    ctx.beginPath();
    ctx.roundRect(-w2 / 2 - 3, -h2 - 3, w2 + 6, h2 + 6, r);
    ctx.fillStyle = col || '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = '13px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(emoji, 0, -h2 / 2 - 2.5);
    ctx.restore();
  }

  // ── Buildings ──────────────────────────────────────────────────────────────
  // Every drawer: (ctx, wx, wy, tier, t) with footprint from TyData.BIZ.

  const B = {};

  B.newspaper = (ctx, wx, wy, tier, t) => {
    const h = 26 + tier * 10;
    shadow(ctx, wx, wy, 2, 2);
    const f = isoBox(ctx, wx, wy, 2, 2, h, '#93a9be');
    windows(ctx, f.S, f.E, h * 0.8, 0, tier, 2, '#3d5570', 0.5, t);
    windows(ctx, f.W, f.S, h * 0.8, 0, tier, 2, '#334a63', 0.35, t);
    // rooftop paper roll
    isoBox(ctx, wx + 0.55, wy + 0.55, 0.9, 0.9, 9, '#e8eef4', h);
    if (tier >= 2) awning(ctx, wx, wy, 2, 2, 14, '#ffffff', '#5b7fa6');
    sign(ctx, wx + 1, wy + 1, h + 26, '🗞️', '#eef3f8');
  };

  B.carwash = (ctx, wx, wy, tier, t) => {
    shadow(ctx, wx, wy, 3, 2);
    const h = 22 + tier * 5;
    const f = isoBox(ctx, wx, wy, 3, 2, h, '#57bbe9');
    // tunnel arch on SE face
    const a0 = lerp(f.S, f.E, 0.28), a1 = lerp(f.S, f.E, 0.72);
    poly(ctx, [{ x: a0.x, y: a0.y }, { x: a1.x, y: a1.y }, { x: a1.x, y: a1.y - h * 0.62 }, { x: a0.x, y: a0.y - h * 0.62 }], '#1e3b52');
    // brush rollers hint
    poly(ctx, [{ x: a0.x + 3, y: a0.y - h * 0.58 }, { x: a1.x - 3, y: a1.y - h * 0.58 }, { x: a1.x - 3, y: a1.y - h * 0.30 }, { x: a0.x + 3, y: a0.y - h * 0.30 }], '#2f8fc4');
    if (tier >= 2) {
      // animated bubbles
      for (let i = 0; i < 4 + tier; i++) {
        const ph = (t * 0.5 + i * 0.23) % 1;
        const c = pt(wx + 1.5 + Math.sin(i * 2.4) * 0.7, wy + 1, h + 6 + ph * 26);
        ctx.beginPath();
        ctx.arc(c.x, c.y, 2.6 + (i % 3), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(210,240,255,${0.75 * (1 - ph)})`;
        ctx.fill();
      }
    }
    if (tier >= 3) isoBox(ctx, wx + 0.2, wy + 0.2, 1.0, 1.6, 16, '#3aa6dd', h);
    sign(ctx, wx + 1.5, wy + 1, h + 30, '🚗', '#e2f4ff');
  };

  B.stockmogul = (ctx, wx, wy, tier, t) => {
    shadow(ctx, wx, wy, 2, 2, 0.72);
    const h = 40 + tier * 22;
    const f = isoBox(ctx, wx, wy, 2, 2, h, '#41c98f');
    windows(ctx, f.S, f.E, h * 0.9, 0, 3 + tier * 2, 2, '#0f5c3c', 0.55, t);
    windows(ctx, f.W, f.S, h * 0.9, 0, 3 + tier * 2, 2, '#0c4d32', 0.4, t);
    // rooftop antenna with pulsing tip
    const c = pt(wx + 1, wy + 1, h);
    ctx.strokeStyle = '#0e4b31'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - 16); ctx.stroke();
    ctx.beginPath(); ctx.arc(c.x, c.y - 18, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = (Math.floor(t * 2) % 2) ? '#ff5c5c' : '#ffd0d0'; ctx.fill();
    sign(ctx, wx + 1, wy + 1, h + 30, '📈', '#e2fff1');
  };

  B.pizza = (ctx, wx, wy, tier, t) => {
    shadow(ctx, wx, wy, 2, 2);
    const h = 22 + tier * 6;
    const f = isoBox(ctx, wx, wy, 2, 2, h, '#e8645c');
    awning(ctx, wx, wy, 2, 2, h * 0.55, '#ffffff', '#2fa05a');
    windows(ctx, f.W, f.S, h * 0.65, 0, 1, 2, '#7a201c', 0.8, t);
    // chimney + smoke
    isoBox(ctx, wx + 1.35, wy + 0.25, 0.4, 0.4, 10, '#b8443d', h);
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.35 + i * 0.33) % 1;
      const c = pt(wx + 1.55, wy + 0.45, h + 12 + ph * 22);
      ctx.beginPath();
      ctx.arc(c.x + Math.sin(ph * 5 + i) * 3, c.y, 2 + ph * 4, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240,240,240,${0.5 * (1 - ph)})`;
      ctx.fill();
    }
    if (tier >= 3) isoBox(ctx, wx + 0.15, wy + 1.1, 0.8, 0.8, 14, '#d8564e', h);
    sign(ctx, wx + 1, wy + 1, h + 28, '🍕', '#fff1e2');
  };

  B.gym = (ctx, wx, wy, tier, t) => {
    shadow(ctx, wx, wy, 3, 2);
    const h = 24 + tier * 7;
    const f = isoBox(ctx, wx, wy, 3, 2, h, '#a97fe8');
    windows(ctx, f.S, f.E, h * 0.7, 0, 1, 3, '#4a2a7a', 0.7, t);
    // rooftop barbell
    const c = pt(wx + 1.5, wy + 1, h + 8);
    ctx.strokeStyle = '#3c2a55'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(c.x - 14, c.y); ctx.lineTo(c.x + 14, c.y); ctx.stroke();
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#54407a';
      ctx.beginPath(); ctx.roundRect(c.x + s * 14 - 3, c.y - 7, 6, 14, 2); ctx.fill();
    }
    if (tier >= 2) isoBox(ctx, wx + 0.3, wy + 0.3, 1.2, 1.4, 12, '#9668d6', h);
    sign(ctx, wx + 1.5, wy + 1, h + 30, '🏋️', '#f0e6ff');
  };

  B.cinema = (ctx, wx, wy, tier, t) => {
    shadow(ctx, wx, wy, 3, 3);
    const h = 30 + tier * 8;
    isoBox(ctx, wx, wy, 3, 3, h, '#8c3040');
    // marquee band on both street faces with chasing bulbs
    const f = { S: pt(wx + 3, wy + 3, 0), E: pt(wx + 3, wy, 0), W: pt(wx, wy + 3, 0) };
    for (const [c0, c1] of [[f.S, f.E], [f.W, f.S]]) {
      const y0 = h * 0.62, y1 = h * 0.82;
      poly(ctx, [
        { x: c0.x, y: c0.y - y1 }, { x: c1.x, y: c1.y - y1 },
        { x: c1.x, y: c1.y - y0 }, { x: c0.x, y: c0.y - y0 }
      ], '#ffd766');
      for (let i = 0; i < 7; i++) {
        const p = lerp(c0, c1, (i + 0.5) / 7);
        const on = (i + Math.floor(t * 6)) % 3 === 0;
        ctx.beginPath(); ctx.arc(p.x, p.y - (y1 + 4), 1.8, 0, Math.PI * 2);
        ctx.fillStyle = on ? '#fff6c8' : '#c8951e'; ctx.fill();
      }
    }
    if (tier >= 2) isoBox(ctx, wx + 0.5, wy + 0.5, 2, 2, 12, '#7a2836', h);
    sign(ctx, wx + 1.5, wy + 1.5, h + (tier >= 2 ? 14 : 0) + 28, '🎬', '#ffedc2');
  };

  B.startup = (ctx, wx, wy, tier, t) => {
    shadow(ctx, wx, wy, 2, 2, 0.7);
    const h = 34 + tier * 16;
    const f = isoBox(ctx, wx, wy, 2, 2, h, '#6d88f2');
    windows(ctx, f.S, f.E, h * 0.92, 0, 2 + tier, 2, '#22336e', 0.75, t);
    windows(ctx, f.W, f.S, h * 0.92, 0, 2 + tier, 2, '#1b2a5e', 0.55, t);
    // satellite dish
    const c = pt(wx + 0.6, wy + 0.6, h + 4);
    ctx.fillStyle = '#dfe6ff';
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 7, 4.5, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#93a2d8'; ctx.stroke();
    sign(ctx, wx + 1, wy + 1, h + 28, '💡', '#e6ecff');
  };

  B.bank = (ctx, wx, wy, tier, t) => {
    shadow(ctx, wx, wy, 3, 3);
    const h = 30 + tier * 8;
    // stone base + main hall
    isoBox(ctx, wx, wy, 3, 3, 6, '#c9bfa4');
    const f = isoBox(ctx, wx + 0.15, wy + 0.15, 2.7, 2.7, h, '#e3d9bf', 6);
    // columns on SE face
    for (let i = 0; i < 4; i++) {
      const u = 0.15 + i * 0.24;
      const p = lerp(f.S, f.E, u);
      ctx.fillStyle = '#f2ecd9';
      ctx.fillRect(p.x - 2, p.y - h - 2, 4, h * 0.85);
    }
    // gold dome at tier 3
    if (tier >= 3) {
      const c = pt(wx + 1.5, wy + 1.5, h + 6);
      const g = ctx.createRadialGradient(c.x - 4, c.y - 14, 2, c.x, c.y - 8, 16);
      g.addColorStop(0, '#ffe9a0'); g.addColorStop(1, '#d09a12');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y - 6, 12, Math.PI, 0); ctx.closePath(); ctx.fill();
    } else if (tier >= 2) {
      isoBox(ctx, wx + 0.9, wy + 0.9, 1.2, 1.2, 10, '#d9cdaa', h + 6);
    }
    sign(ctx, wx + 1.5, wy + 1.5, h + 40, '🏦', '#fdf6df');
  };

  B.space = (ctx, wx, wy, tier, t) => {
    shadow(ctx, wx, wy, 3, 3, 0.75);
    // launch pad
    isoBox(ctx, wx, wy, 3, 3, 5, '#9aa6b2');
    // control bunker
    isoBox(ctx, wx + 0.1, wy + 1.9, 1.1, 1.0, 14, '#c2ccd8', 5);
    // gantry tower
    isoBox(ctx, wx + 2.2, wy + 0.4, 0.5, 0.5, 46 + tier * 8, '#8f4f43', 5);
    // rocket body
    const rx = wx + 1.55, ry = wy + 1.0;
    const bodyH = 34 + tier * 10;
    const c = pt(rx, ry, 5);
    ctx.save();
    // body cylinder
    const grad = ctx.createLinearGradient(c.x - 8, 0, c.x + 8, 0);
    grad.addColorStop(0, '#c8d2da'); grad.addColorStop(0.45, '#ffffff'); grad.addColorStop(1, '#aab6c2');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.roundRect(c.x - 7, c.y - bodyH - 8, 14, bodyH, 6); ctx.fill();
    // nose cone
    ctx.fillStyle = '#e8574f';
    ctx.beginPath();
    ctx.moveTo(c.x - 7, c.y - bodyH - 6);
    ctx.quadraticCurveTo(c.x, c.y - bodyH - 26, c.x + 7, c.y - bodyH - 6);
    ctx.closePath(); ctx.fill();
    // fins
    ctx.fillStyle = '#e8574f';
    ctx.beginPath(); ctx.moveTo(c.x - 7, c.y - 12); ctx.lineTo(c.x - 13, c.y - 2); ctx.lineTo(c.x - 7, c.y - 2); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(c.x + 7, c.y - 12); ctx.lineTo(c.x + 13, c.y - 2); ctx.lineTo(c.x + 7, c.y - 2); ctx.closePath(); ctx.fill();
    // window
    ctx.fillStyle = '#5fc3e8';
    ctx.beginPath(); ctx.arc(c.x, c.y - bodyH + 8, 3.4, 0, Math.PI * 2); ctx.fill();
    // idle engine glow at tier3
    if (tier >= 3) {
      const fl = 4 + Math.sin(t * 9) * 2;
      const g2 = ctx.createRadialGradient(c.x, c.y + 2, 0, c.x, c.y + 2, 10 + fl);
      g2.addColorStop(0, 'rgba(255,220,130,0.9)'); g2.addColorStop(1, 'rgba(255,120,40,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(c.x, c.y + 2, 10 + fl, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    sign(ctx, rx, ry, bodyH + 42, '🚀', '#eef3f8');
  };

  // legacy types → simple charming box
  function genericBuilding(ctx, wx, wy, tier, t, pal, emoji) {
    shadow(ctx, wx, wy, 2, 2);
    const h = 24 + tier * 8;
    const f = isoBox(ctx, wx, wy, 2, 2, h, pal);
    windows(ctx, f.S, f.E, h * 0.75, 0, tier, 2, shade(pal, 0.45), 0.6, t);
    sign(ctx, wx + 1, wy + 1, h + 26, emoji, '#ffffff');
  }

  function drawBuilding(ctx, type, wx, wy, tier, t) {
    if (B[type]) B[type](ctx, wx, wy, tier, t);
    else {
      const m = window.TyData.bizMeta(type);
      genericBuilding(ctx, wx, wy, tier, t, m.pal || '#9aa8b5', m.emoji || '🏢');
    }
  }

  // ── Decorations ────────────────────────────────────────────────────────────
  const D = {};
  D.tree = (ctx, wx, wy, t) => {
    const c = pt(wx + 0.5, wy + 0.5, 0);
    shadow(ctx, wx, wy, 1, 1, 0.5);
    ctx.fillStyle = '#8a5a34';
    ctx.fillRect(c.x - 2, c.y - 14, 4, 14);
    const sway = Math.sin(t * 1.2 + wx * 3 + wy) * 1.2;
    for (const [dx, dy, r, k] of [[-6, -20, 9, 0.92], [6, -22, 9, 0.98], [0, -30, 11, 1.1]]) {
      ctx.beginPath(); ctx.arc(c.x + dx + sway, c.y + dy, r, 0, Math.PI * 2);
      ctx.fillStyle = shade('#3fae5c', k); ctx.fill();
    }
  };
  D.pine = (ctx, wx, wy, t) => {
    const c = pt(wx + 0.5, wy + 0.5, 0);
    shadow(ctx, wx, wy, 1, 1, 0.45);
    ctx.fillStyle = '#7a4d2c'; ctx.fillRect(c.x - 2, c.y - 8, 4, 8);
    for (let i = 0; i < 3; i++) {
      const w2 = 15 - i * 4, y0 = -8 - i * 11;
      ctx.beginPath();
      ctx.moveTo(c.x - w2, c.y + y0); ctx.lineTo(c.x + w2, c.y + y0); ctx.lineTo(c.x, c.y + y0 - 15);
      ctx.closePath();
      ctx.fillStyle = shade('#2d8a52', 1 + i * 0.09); ctx.fill();
    }
  };
  D.bush = (ctx, wx, wy) => {
    const c = pt(wx + 0.5, wy + 0.5, 0);
    for (const [dx, r, k] of [[-5, 6, 0.9], [5, 6, 1.0], [0, 7.5, 1.12]]) {
      ctx.beginPath(); ctx.arc(c.x + dx, c.y - 5, r, 0, Math.PI * 2);
      ctx.fillStyle = shade('#4cae53', k); ctx.fill();
    }
  };
  D.flowers = (ctx, wx, wy) => {
    const c = pt(wx + 0.5, wy + 0.5, 0);
    ctx.fillStyle = 'rgba(70,150,80,0.45)';
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 1, 13, 6, 0, 0, Math.PI * 2); ctx.fill();
    const cols = ['#ff7eb0', '#ffd166', '#ff5c5c', '#c586ff'];
    for (let i = 0; i < 6; i++) {
      const a = i * 1.05, r = 3 + (i % 3) * 3;
      ctx.beginPath(); ctx.arc(c.x + Math.cos(a) * r * 1.6, c.y - 2 - Math.sin(a) * r * 0.5, 2, 0, Math.PI * 2);
      ctx.fillStyle = cols[i % cols.length]; ctx.fill();
    }
  };
  D.fountain = (ctx, wx, wy, t) => {
    const c = pt(wx + 0.5, wy + 0.5, 0);
    shadow(ctx, wx, wy, 1, 1, 0.55);
    ctx.fillStyle = '#b9c4cf';
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 2, 14, 7, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#57bbe9';
    ctx.beginPath(); ctx.ellipse(c.x, c.y - 3, 10, 4.6, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#c8d2da'; ctx.fillRect(c.x - 2, c.y - 16, 4, 13);
    // spray
    for (let i = 0; i < 5; i++) {
      const ph = (t * 0.9 + i / 5) % 1;
      ctx.beginPath();
      ctx.arc(c.x + (i - 2) * 2.4 * ph, c.y - 16 - Math.sin(ph * Math.PI) * 9, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(190,235,255,${0.85 * (1 - ph)})`; ctx.fill();
    }
  };
  D.lamp = (ctx, wx, wy, t) => {
    const c = pt(wx + 0.5, wy + 0.5, 0);
    ctx.strokeStyle = '#3b4757'; ctx.lineWidth = 2.4;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - 24); ctx.stroke();
    const g = ctx.createRadialGradient(c.x, c.y - 27, 0, c.x, c.y - 27, 9);
    g.addColorStop(0, 'rgba(255,236,150,0.95)'); g.addColorStop(1, 'rgba(255,236,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(c.x, c.y - 27, 9, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ffdf78';
    ctx.beginPath(); ctx.arc(c.x, c.y - 27, 3, 0, Math.PI * 2); ctx.fill();
  };
  D.bench = (ctx, wx, wy) => {
    const c = pt(wx + 0.5, wy + 0.5, 0);
    ctx.fillStyle = '#9a6a3c';
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.transform(1, 0.5, -1, 0.5, 0, 0); // squash to iso-ish
    ctx.fillRect(-7, -8, 14, 5);
    ctx.restore();
    ctx.fillStyle = '#7a5330';
    ctx.fillRect(c.x - 6, c.y - 6, 2.4, 6);
    ctx.fillRect(c.x + 4, c.y - 6, 2.4, 6);
  };

  function drawDecor(ctx, kind, wx, wy, t) { if (D[kind]) D[kind](ctx, wx, wy, t); }

  /** Approximate total visual height (px at scale 1) per building — signs anchor to this. */
  function buildingHeight(type, tier) {
    switch (type) {
      case 'newspaper':  return 26 + tier * 10 + 12;
      case 'carwash':    return 22 + tier * 5 + (tier >= 3 ? 16 : 0);
      case 'stockmogul': return 40 + tier * 22 + 18;
      case 'pizza':      return 22 + tier * 6 + 12;
      case 'gym':        return 24 + tier * 7 + (tier >= 2 ? 12 : 0) + 14;
      case 'cinema':     return 30 + tier * 8 + (tier >= 2 ? 12 : 0);
      case 'startup':    return 34 + tier * 16 + 8;
      case 'bank':       return 36 + tier * 8 + 12;
      case 'space':      return 5 + 34 + tier * 10 + 28;
      default:           return 24 + tier * 8;
    }
  }

  /** Level pill floating above a building, drawn in world space so it tracks zoom. */
  function drawLevelPill(ctx, wx, wy, z, level) {
    const c = pt(wx, wy, z);
    const label = 'Lv ' + level;
    ctx.font = '800 10px -apple-system, "Segoe UI", sans-serif';
    const w2 = ctx.measureText(label).width + 12;
    ctx.fillStyle = 'rgba(25,40,60,0.75)';
    ctx.beginPath(); ctx.roundRect(c.x - w2 / 2, c.y - 8, w2, 15, 8); ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, c.x, c.y);
  }

  // ── Plot slab ──────────────────────────────────────────────────────────────
  /** Floating island slab: grass top, earth sides, soft drop shadow. size = tiles. */
  function drawSlab(ctx, wx, wy, size, opts) {
    const depth = (opts && opts.depth) || 16;
    const N = pt(wx, wy, 0), E = pt(wx + size, wy, 0), S = pt(wx + size, wy + size, 0), W = pt(wx, wy + size, 0);
    // drop shadow below the island
    ctx.save();
    ctx.translate(0, depth + 14);
    ctx.globalAlpha = 0.18;
    poly(ctx, [N, E, S, W], '#12324a');
    ctx.restore();
    // earth sides
    poly(ctx, [W, S, { x: S.x, y: S.y + depth }, { x: W.x, y: W.y + depth }], '#7a5330');
    poly(ctx, [S, E, { x: E.x, y: E.y + depth }, { x: S.x, y: S.y + depth }], '#8f6238');
    // dirt strata line
    ctx.strokeStyle = 'rgba(60,38,18,0.35)'; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(W.x, W.y + depth * 0.55); ctx.lineTo(S.x, S.y + depth * 0.55); ctx.lineTo(E.x, E.y + depth * 0.55);
    ctx.stroke();
    // grass top
    const g = ctx.createLinearGradient(N.x, N.y, S.x, S.y);
    g.addColorStop(0, opts && opts.grassA || '#8ed86e');
    g.addColorStop(1, opts && opts.grassB || '#5cbf4e');
    poly(ctx, [N, E, S, W], g);
    // grass lip
    ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(W.x, W.y); ctx.lineTo(S.x, S.y); ctx.lineTo(E.x, E.y); ctx.stroke();
    // subtle tile checker
    ctx.save();
    ctx.globalAlpha = 0.05;
    for (let x = 0; x < size; x++) {
      for (let y = 0; y < size; y++) {
        if ((x + y) % 2) poly(ctx, [pt(wx + x, wy + y, 0), pt(wx + x + 1, wy + y, 0), pt(wx + x + 1, wy + y + 1, 0), pt(wx + x, wy + y + 1, 0)], '#1e5c2e');
      }
    }
    ctx.restore();
  }

  /** Highlighted tile (edit mode target) */
  function drawTileHighlight(ctx, wx, wy, ok) {
    poly(ctx, [pt(wx, wy, 0), pt(wx + 1, wy, 0), pt(wx + 1, wy + 1, 0), pt(wx, wy + 1, 0)],
      ok ? 'rgba(80,230,120,0.4)' : 'rgba(240,80,80,0.4)');
  }

  window.TyArt = { drawBuilding, drawDecor, drawSlab, drawTileHighlight, buildingHeight, drawLevelPill, shade, rgba, poly, pt, isoBox, shadowBlob: shadow };
})();
