/**
 * city-effects.js — Ambient building effects + one-shot particles
 * Large, visible pixel art effects: smoke clouds, neon glow, sparkle bursts, rocket fire.
 * Exports: window.CityEffects
 */
(function () {
  'use strict';

  const particles = [];
  let frame = 0;

  function hash(x, y) { return ((x * 73856093) ^ (y * 19349663)) >>> 0; }

  // ─── One-Shot Particles ───────────────────────────────────────────────────

  function spawn(x, y, count, color, speed, life) {
    for (let i = 0; i < count; i++) {
      particles.push({
        x, y,
        vx: (Math.random() - 0.5) * speed,
        vy: -Math.random() * speed * 1.5,
        life: life + Math.random() * life * 0.5,
        maxLife: life,
        color,
        size: Math.random() > 0.5 ? 3 : 2,
      });
    }
  }

  function updateParticles(ctx) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.02;
      p.life--;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life / p.maxLife;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function buildingPopIn(x, y) {
    spawn(x, y, 12, '#F3BF4B', 3, 40);
    spawn(x, y, 6, '#56D4FF', 2, 35);
  }

  function coinCollect(x, y) { spawn(x, y, 8, '#FFD700', 2, 45); }

  function fireworks(x, y) {
    for (const c of ['#FF4444', '#44FF44', '#4444FF', '#FFFF44', '#FF44FF', '#44FFFF']) {
      spawn(x, y, 8, c, 4, 55);
    }
  }

  // ─── Ambient Building Effects ─────────────────────────────────────────────

  function drawAmbient(ctx, buildings, cam) {
    frame++;
    const z = cam.zoom;
    if (z < 0.3) return; // skip effects at very low zoom

    for (const b of buildings) {
      // 2×2 building center
      const scr = CityCamera.worldToScreen(cam, b.wx + 1, b.wy + 1);
      const bh = CityBuildings.getBuildingHeight(b.type, b.level);
      const seed = hash(b.wx, b.wy);
      const phase = (seed % 200) / 200;

      switch (b.type) {
        case 'pizza':
          if (b.level > 10) drawSmoke(ctx, scr.x, scr.y - (bh + 8) * z, z, phase);
          break;
        case 'space':
          if (b.level >= 15) drawRocketFire(ctx, scr.x, scr.y - (bh + 4) * z, z, phase, b.level);
          break;
        case 'startup':
          if (b.level > 15) drawBeacon(ctx, scr.x + 1 * z, scr.y - (bh + 12) * z, z, phase);
          break;
        case 'arcade':
          if (b.level > 5) drawNeonSign(ctx, scr.x, scr.y - (bh + 6) * z, z, phase);
          break;
        case 'bank':
          if (b.level > 10) drawSparkle(ctx, scr.x, scr.y - (bh + 5) * z, z, phase);
          break;
        case 'gym':
          if (b.level > 8) drawSweatDrops(ctx, scr.x, scr.y - (bh + 4) * z, z, phase);
          break;
        case 'cinema':
          if (b.level > 5) drawMarquee(ctx, scr.x, scr.y - (bh + 4) * z, z, phase);
          break;
      }
    }
  }

  /** Big puffy smoke clouds rising from pizza chimneys */
  function drawSmoke(ctx, x, y, z, phase) {
    const t = (frame + phase * 300) * 0.025;

    for (let i = 0; i < 4; i++) {
      const age = (t + i * 0.9) % 3.6;
      const rise = age * 10 * z;
      const drift = Math.sin(age * 1.5 + i * 2) * 5 * z;
      const py = y - rise;
      const px = x + drift;
      const size = (3 + age * 3) * z;
      const alpha = Math.max(0, 0.45 - age * 0.12);

      // Draw a chunky pixel cloud (3x3 cross pattern)
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#aaaaaa';
      const s = Math.round(size);
      const hs = Math.round(s / 2);
      ctx.fillRect(Math.round(px) - hs, Math.round(py) - hs, s, s);
      // Extended edges for cloud shape
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillRect(Math.round(px) - hs - Math.round(z), Math.round(py), Math.round(z), Math.round(s * 0.6));
      ctx.fillRect(Math.round(px) + hs, Math.round(py) - Math.round(z), Math.round(z), Math.round(s * 0.6));
    }
    ctx.globalAlpha = 1;
  }

  /** Glowing neon sign above arcade — large, bright, flickering */
  function drawNeonSign(ctx, x, y, z, phase) {
    const t = frame + phase * 300;
    // Irregular flicker pattern
    const flicker = Math.sin(t * 0.12) > -0.6 && Math.sin(t * 0.37) > -0.8;
    const brightness = flicker ? 1 : 0.1;
    const w = Math.round(16 * z);
    const h = Math.round(4 * z);

    // Magenta neon bar
    ctx.globalAlpha = brightness * 0.9;
    ctx.fillStyle = '#FF00FF';
    ctx.fillRect(Math.round(x - w / 2), Math.round(y), w, h);

    // Inner cyan highlight
    ctx.globalAlpha = brightness * 0.7;
    ctx.fillStyle = '#FF88FF';
    ctx.fillRect(Math.round(x - w / 2 + 2 * z), Math.round(y + z), Math.round(w - 4 * z), Math.round(2 * z));

    // Glow underneath
    ctx.globalAlpha = brightness * 0.3;
    ctx.fillStyle = '#FF00FF';
    const gw = Math.round(20 * z);
    const gh = Math.round(6 * z);
    ctx.fillRect(Math.round(x - gw / 2), Math.round(y - z), gw, gh);

    ctx.globalAlpha = 1;
  }

  /** Gold sparkle bursts on bank buildings — large cross shapes */
  function drawSparkle(ctx, x, y, z, phase) {
    const t = (frame + phase * 300) * 0.04;

    for (let i = 0; i < 4; i++) {
      const cycle = (t + i * 1.6) % 6.3;
      const alpha = Math.sin(cycle);
      if (alpha <= 0.1) continue;

      const sx = x + Math.cos(cycle * 2.5 + i * 3) * 10 * z;
      const sy = y + Math.sin(cycle * 1.8 + i * 2.5) * 14 * z;
      const arm = Math.round(3 * z * alpha);
      const core = Math.round(2 * z);

      ctx.globalAlpha = alpha * 0.8;
      ctx.fillStyle = '#FFD700';
      // Cross sparkle
      ctx.fillRect(Math.round(sx) - arm, Math.round(sy) - Math.round(z / 2), arm * 2, core);
      ctx.fillRect(Math.round(sx) - Math.round(z / 2), Math.round(sy) - arm, core, arm * 2);
      // Bright center
      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(Math.round(sx) - Math.round(z / 2), Math.round(sy) - Math.round(z / 2), core, core);
    }
    ctx.globalAlpha = 1;
  }

  /** Rocket exhaust fire — large flickering flame column */
  function drawRocketFire(ctx, x, y, z, phase, level) {
    const t = (frame + phase * 300) * 0.08;
    const flames = level >= 20 ? 6 : 4;
    const colors = ['#FF2200', '#FF6600', '#FFAA00', '#FFCC00', '#FF8800', '#FF4400'];

    for (let i = 0; i < flames; i++) {
      const fy = y + i * 3 * z;
      const wobble = Math.sin(t * 4 + i * 2.1) * 2 * z;
      const fx = x + wobble;
      const size = Math.round((4 - i * 0.5) * z);

      ctx.globalAlpha = 0.9 - i * 0.12;
      ctx.fillStyle = colors[i % colors.length];
      ctx.fillRect(Math.round(fx - size / 2), Math.round(fy), size, Math.round(3 * z));
    }

    // Bright white core
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#FFFFFF';
    const coreSize = Math.round(2 * z);
    ctx.fillRect(Math.round(x - coreSize / 2), Math.round(y), coreSize, Math.round(2 * z));

    ctx.globalAlpha = 1;
  }

  /** Chasing marquee lights on cinema buildings */
  function drawMarquee(ctx, x, y, z, phase) {
    const t = (frame + phase * 300) * 0.06;
    const count = 7;
    const totalW = 18 * z;
    const spacing = totalW / count;
    const dotSize = Math.max(2, Math.round(2.5 * z));

    for (let i = 0; i < count; i++) {
      const chasePos = ((Math.floor(t) + i) % 4);
      const on = chasePos === 0 || chasePos === 1;
      ctx.globalAlpha = on ? 0.95 : 0.15;
      ctx.fillStyle = on ? '#FFD700' : '#665500';
      const lx = x - totalW / 2 + i * spacing;
      ctx.fillRect(Math.round(lx), Math.round(y), dotSize, dotSize);
      // Glow for lit bulbs
      if (on) {
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#FFD700';
        ctx.fillRect(Math.round(lx - z), Math.round(y - z), Math.round(dotSize + 2 * z), Math.round(dotSize + 2 * z));
      }
    }
    ctx.globalAlpha = 1;
  }

  /** Blinking red beacon on tech startup antenna */
  function drawBeacon(ctx, x, y, z, phase) {
    const t = (frame + phase * 300) * 0.03;
    const intensity = (Math.sin(t) + 1) / 2; // 0 to 1 smooth pulse
    if (intensity < 0.2) return;

    const size = Math.round(3 * z);

    // Red dot
    ctx.globalAlpha = intensity;
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(Math.round(x - size / 2), Math.round(y - size / 2), size, size);

    // Glow halo
    ctx.globalAlpha = intensity * 0.35;
    const glow = Math.round(6 * z);
    ctx.fillStyle = '#FF0000';
    ctx.fillRect(Math.round(x - glow / 2), Math.round(y - glow / 2), glow, glow);

    ctx.globalAlpha = 1;
  }

  /** Sweat drops flying off gym buildings */
  function drawSweatDrops(ctx, x, y, z, phase) {
    const t = (frame + phase * 300) * 0.04;

    for (let i = 0; i < 2; i++) {
      const cycle = (t + i * 3.1) % 5;
      if (cycle > 3) continue;
      const dx = (5 + cycle * 4) * z * (i === 0 ? 1 : -1);
      const dy = -cycle * 3 * z + cycle * cycle * z; // arc
      const alpha = Math.max(0, 0.7 - cycle * 0.2);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = '#87CEEB';
      const s = Math.round(2 * z);
      ctx.fillRect(Math.round(x + dx), Math.round(y + dy), s, s);
    }
    ctx.globalAlpha = 1;
  }

  // ─── API ──────────────────────────────────────────────────────────────────

  function hasActiveEffects() { return true; }

  window.CityEffects = {
    spawn, updateParticles, drawAmbient,
    buildingPopIn, coinCollect, fireworks,
    hasActiveEffects
  };
})();
