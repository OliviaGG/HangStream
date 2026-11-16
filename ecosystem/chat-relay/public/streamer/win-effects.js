// win-effects.js — Shared particle-based win effect system for all word games
// Include via <script src="/win-effects.js"></script> or copy to each game's public/

(function () {
  'use strict';

  var canvas, ctx, particles, animFrame, startTime, duration, effectConfig;

  function createCanvas(target) {
    canvas = document.createElement('canvas');
    if (target && target !== document.body) {
      // Contained mode (in-card preview). Fill the target absolutely.
      // Caller must give the target position:relative or similar.
      canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
      canvas.width = target.clientWidth || target.offsetWidth || 200;
      canvas.height = target.clientHeight || target.offsetHeight || 150;
      target.appendChild(canvas);
    } else {
      canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;pointer-events:none;';
      var vp = window.__gameViewport || { width: window.innerWidth, height: window.innerHeight };
      canvas.width = vp.width;
      canvas.height = vp.height;
      document.body.appendChild(canvas);
    }
    ctx = canvas.getContext('2d');
    return canvas;
  }

  function removeCanvas() {
    if (animFrame) cancelAnimationFrame(animFrame);
    animFrame = null;
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null;
    ctx = null;
    particles = null;
  }

  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // When the caller passes config.spawnRect = { left, top, width, height }
  // (in window coords — what getBoundingClientRect() returns), particle
  // factories spawn at a random point along the rectangle's PERIMETER
  // instead of their hard-coded defaults (screen edges, center, etc.).
  // Falls back to defaults when spawnRect absent.
  function _spawnPoint(defaultX, defaultY) {
    var r = effectConfig && effectConfig.spawnRect;
    if (!r || !(r.width > 0 && r.height > 0)) return { x: defaultX, y: defaultY };
    var perim = 2 * (r.width + r.height);
    var t = Math.random() * perim;
    if (t < r.width)                              return { x: r.left + t,                                y: r.top };
    t -= r.width;
    if (t < r.height)                             return { x: r.left + r.width,                         y: r.top + t };
    t -= r.height;
    if (t < r.width)                              return { x: r.left + (r.width - t),                   y: r.top + r.height };
    t -= r.width;
    return                                                { x: r.left,                                  y: r.top + (r.height - t) };
  }

  // Shared image cache for image-based particle effects (heart_shower, etc.)
  var imageCache = {};
  function loadEffectImage(url) {
    if (!url) return null;
    var entry = imageCache[url];
    if (entry) return entry.img;
    entry = imageCache[url] = { img: new Image(), ready: false, error: false };
    entry.img.onload = function () { entry.ready = true; };
    entry.img.onerror = function () { entry.error = true; };
    entry.img.src = url;
    return entry.img;
  }

  // ─── Particle types ───────────────────────────────────────

  function makeConfettiParticle(colors, w, h) {
    var sp = _spawnPoint(rand(0, w), rand(-h * 0.3, -20));
    return {
      x: sp.x, y: sp.y,
      vx: rand(-3, 3), vy: rand(2, 6),
      size: rand(6, 12), rotation: rand(0, 360), rotSpeed: rand(-8, 8),
      color: pick(colors), shape: pick(['rect', 'circle']),
      gravity: 0.08, drag: 0.99, wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.02, 0.06),
      opacity: 1
    };
  }

  function makeSparkleParticle(colors, w, h) {
    var cx = w / 2, cy = h / 2;
    var angle = rand(0, Math.PI * 2);
    var speed = rand(2, 8);
    var sp = _spawnPoint(cx + rand(-100, 100), cy + rand(-100, 100));
    return {
      x: sp.x, y: sp.y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(2, 5), color: pick(colors),
      life: 1, decay: rand(0.008, 0.02), twinkle: rand(0, Math.PI * 2),
      gravity: 0.02
    };
  }

  function makeHeartParticle(colors, w, h) {
    var sp = _spawnPoint(rand(0, w), h + rand(10, 60));
    return {
      x: sp.x, y: sp.y,
      vx: rand(-1, 1), vy: rand(-4, -2),
      size: rand(10, 22), color: pick(colors),
      rotation: rand(-20, 20), wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.02, 0.05),
      opacity: 1, fadeStart: 0.7
    };
  }

  function makeFireworkShell(colors, w, h) {
    var tx = rand(w * 0.2, w * 0.8);
    var ty = rand(h * 0.1, h * 0.4);
    var sp = _spawnPoint(tx, h + 10);
    return { type: 'shell', x: sp.x, y: sp.y, targetY: ty, vy: rand(-12, -8), color: pick(colors), exploded: false, trail: [] };
  }

  function makeFireworkSpark(x, y, color) {
    var angle = rand(0, Math.PI * 2);
    var speed = rand(1, 7);
    return {
      type: 'spark', x: x, y: y,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      color: color, size: rand(2, 4), life: 1, decay: rand(0.015, 0.03),
      gravity: 0.06
    };
  }

  function makeLightningBolt(w, h) {
    var x = rand(w * 0.1, w * 0.9);
    var points = [{ x: x, y: 0 }];
    var y = 0;
    while (y < h) {
      y += rand(20, 60);
      x += rand(-40, 40);
      points.push({ x: x, y: Math.min(y, h) });
    }
    return { points: points, opacity: 1, width: rand(2, 5), glow: rand(15, 30), delay: rand(0, 1500), born: Date.now() };
  }

  function makeSnowflake(colors, w) {
    var sp = _spawnPoint(rand(-20, w + 20), rand(-40, -10));
    return {
      x: sp.x, y: sp.y,
      vx: rand(-0.5, 0.5), vy: rand(1, 3),
      size: rand(3, 8), color: pick(colors),
      wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.01, 0.04), wobbleAmp: rand(0.3, 1),
      opacity: rand(0.5, 1), rotation: rand(0, 360), rotSpeed: rand(-2, 2)
    };
  }

  function makeMeteor(colors, w, h) {
    var startX = rand(-50, w + 50);
    var angle = rand(0.3, 0.8);
    var sp = _spawnPoint(startX, -20);
    return {
      x: sp.x, y: sp.y,
      vx: Math.cos(angle) * rand(6, 14), vy: Math.sin(angle) * rand(6, 14),
      size: rand(3, 6), color: pick(colors), tailLen: rand(30, 80),
      trail: [], life: 1, decay: rand(0.005, 0.012)
    };
  }

  function makePetal(colors, w) {
    var sp = _spawnPoint(rand(-20, w + 20), rand(-40, -10));
    return {
      x: sp.x, y: sp.y,
      vx: rand(-1.5, 1.5), vy: rand(1, 2.5),
      size: rand(6, 14), color: pick(colors),
      rotation: rand(0, 360), rotSpeed: rand(-3, 3),
      wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.02, 0.05), wobbleAmp: rand(0.5, 1.5),
      opacity: rand(0.6, 1)
    };
  }

  function makeAuroraWave(colors, w, h, i) {
    return {
      color: pick(colors), y: h * rand(0.15, 0.6),
      amplitude: rand(30, 80), frequency: rand(0.003, 0.008),
      speed: rand(0.5, 1.5), phase: i * 1.2,
      opacity: rand(0.15, 0.35), height: rand(60, 140),
      w: w
    };
  }

  function makeGalaxyParticle(colors, w, h) {
    var cx = w / 2, cy = h / 2;
    var angle = rand(0, Math.PI * 2);
    var dist = rand(5, 200);
    // Re-anchor the orbit center on the card center when spawnRect is set.
    var r = effectConfig && effectConfig.spawnRect;
    if (r && r.width > 0 && r.height > 0) {
      cx = r.left + r.width / 2;
      cy = r.top + r.height / 2;
    }
    var sp = _spawnPoint(cx + Math.cos(angle) * dist, cy + Math.sin(angle) * dist);
    return {
      x: sp.x, y: sp.y,
      angle: angle, dist: dist, speed: rand(0.01, 0.04),
      size: rand(1, 4), color: pick(colors),
      vr: rand(0.5, 2), life: 1, decay: rand(0.002, 0.008),
      cx: cx, cy: cy
    };
  }

  function makePhoenixParticle(colors, w, h) {
    var cx = w / 2;
    var sp = _spawnPoint(cx + rand(-30, 30), h + rand(0, 20));
    return {
      x: sp.x, y: sp.y,
      vx: rand(-2, 2), vy: rand(-8, -3),
      size: rand(3, 8), color: pick(colors),
      life: 1, decay: rand(0.008, 0.02), gravity: -0.05,
      trail: []
    };
  }

  function makeNuclearRing(w, h) {
    return { cx: w / 2, cy: h / 2, radius: 0, maxRadius: Math.max(w, h), speed: 12, opacity: 1, width: 8 };
  }

  function makeNuclearParticle(colors, w, h) {
    var cx = w / 2, cy = h / 2;
    var angle = rand(0, Math.PI * 2);
    var speed = rand(3, 15);
    return {
      x: cx, y: cy,
      vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
      size: rand(2, 6), color: pick(colors),
      life: 1, decay: rand(0.005, 0.015), gravity: 0.04
    };
  }

  // ─── Draw helpers ─────────────────────────────────────────

  function drawHeart(cx, cy, size, color, opacity, rotation) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    var s = size / 2;
    ctx.moveTo(0, s * 0.4);
    ctx.bezierCurveTo(-s, -s * 0.4, -s * 1.4, s * 0.4, 0, s * 1.2);
    ctx.bezierCurveTo(s * 1.4, s * 0.4, s, -s * 0.4, 0, s * 0.4);
    ctx.fill();
    ctx.restore();
  }

  function drawStar(cx, cy, size, color, opacity) {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (var i = 0; i < 4; i++) {
      var a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * size, cy + Math.sin(a) * size);
      ctx.lineTo(cx + Math.cos(a + 0.3) * size * 0.3, cy + Math.sin(a + 0.3) * size * 0.3);
    }
    ctx.fill();
    ctx.restore();
  }

  function drawPetal(cx, cy, size, color, opacity, rotation) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rotation * Math.PI / 180);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.4, size, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // ─── Effect renderers ────────────────────────────────────

  var effects = {};

  effects.confetti = {
    init: function (cfg, w, h) {
      var ps = [];
      for (var i = 0; i < (cfg.particleCount || 80); i++) ps.push(makeConfettiParticle(cfg.colors, w, h));
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      // Continuously spawn new confetti during first 70% of duration
      if (elapsed < dur * 0.7 && ps.length < 120) {
        var spawnRate = Math.max(1, Math.floor((effectConfig.particleCount || 80) / 30));
        for (var s = 0; s < spawnRate; s++) {
          ps.push(makeConfettiParticle(effectConfig.colors, w, h));
        }
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.wobble += p.wobbleSpeed;
        p.vx += Math.sin(p.wobble) * 0.1;
        p.vy += p.gravity;
        p.vx *= p.drag;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        if (elapsed > dur * 0.7) p.opacity = Math.max(0, p.opacity - 0.015);
        if (p.y > h + 30 || p.opacity <= 0) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        if (p.shape === 'rect') {
          ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        } else {
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  };

  effects.sparkles = {
    init: function (cfg, w, h) {
      var ps = [];
      for (var i = 0; i < (cfg.particleCount || 40); i++) ps.push(makeSparkleParticle(cfg.colors, w, h));
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      // Continuously spawn sparkles during first 75% of duration
      if (elapsed < dur * 0.75 && ps.length < 60) {
        for (var s = 0; s < 2; s++) {
          ps.push(makeSparkleParticle(effectConfig.colors, w, h));
        }
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.twinkle += 0.15;
        p.life -= p.decay;
        if (p.life <= 0) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        var alpha = p.life * (0.5 + 0.5 * Math.sin(p.twinkle));
        drawStar(p.x, p.y, p.size * 2, p.color, alpha);
      }
    }
  };

  effects.hearts = {
    init: function (cfg, w, h) {
      var ps = [];
      for (var i = 0; i < (cfg.particleCount || 30); i++) ps.push(makeHeartParticle(cfg.colors, w, h));
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      // Continuously spawn hearts during first 65% of duration
      if (elapsed < dur * 0.65 && ps.length < 40) {
        ps.push(makeHeartParticle(effectConfig.colors, w, h));
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 0.5;
        p.y += p.vy;
        p.rotation += Math.sin(p.wobble) * 0.5;
        var progress = elapsed / dur;
        if (progress > p.fadeStart) {
          p.opacity = Math.max(0, 1 - (progress - p.fadeStart) / (1 - p.fadeStart));
        }
        if (p.y < -40 || p.opacity <= 0) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        drawHeart(p.x, p.y, p.size, p.color, p.opacity, p.rotation);
      }
    }
  };

  // ─── Image-particle effect: heart_shower ─────────────────────
  // Renders an image (default: TikTok fan-club heart) as falling/floating
  // particles. Falls back to vector hearts if the image fails to load.
  function makeImageParticle(w, h) {
    var sp = _spawnPoint(rand(0, w), h + rand(10, 80));
    return {
      x: sp.x,
      y: sp.y,
      vx: rand(-1.5, 1.5),
      vy: rand(-5.5, -2.5),
      size: rand(36, 72),
      rotation: rand(-30, 30),
      rotSpeed: rand(-2.5, 2.5),
      wobble: rand(0, Math.PI * 2),
      wobbleSpeed: rand(0.02, 0.05),
      opacity: 1,
      fadeStart: 0.72
    };
  }

  effects.heart_shower = {
    _img: null,
    init: function (cfg, w, h) {
      this._img = loadEffectImage(cfg.imageUrl || '/cosmetics/fanclub-heart.png');
      var ps = [];
      var count = cfg.particleCount || 40;
      for (var i = 0; i < count; i++) ps.push(makeImageParticle(w, h));
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      var cap = (effectConfig.particleCount || 40) + 20;
      if (elapsed < dur * 0.7 && ps.length < cap) {
        ps.push(makeImageParticle(w, h));
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * 0.6;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        var progress = elapsed / dur;
        if (progress > p.fadeStart) {
          p.opacity = Math.max(0, 1 - (progress - p.fadeStart) / (1 - p.fadeStart));
        }
        if (p.y < -80 || p.opacity <= 0) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      var img = this._img;
      var imgReady = img && img.complete && img.naturalWidth > 0;
      var fallbackColor = (effectConfig.colors && effectConfig.colors[0]) || '#FE2C55';
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        if (imgReady) {
          ctx.drawImage(img, -p.size / 2, -p.size / 2, p.size, p.size);
        } else {
          drawHeart(0, 0, p.size * 0.45, fallbackColor, p.opacity, 0);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  };

  effects.fireworks = {
    _lastShellTime: 0,
    init: function (cfg, w, h) {
      var ps = [];
      var shellCount = Math.min(cfg.particleCount || 60, 8);
      for (var i = 0; i < shellCount; i++) {
        var shell = makeFireworkShell(cfg.colors, w, h);
        shell.delay = i * 400;
        shell.born = Date.now();
        ps.push(shell);
      }
      effects.fireworks._lastShellTime = Date.now();
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      var now = Date.now();
      // Launch new shells periodically during first 70% of duration
      if (elapsed < dur * 0.7 && now - effects.fireworks._lastShellTime > 600) {
        var shell = makeFireworkShell(effectConfig.colors, w, h);
        shell.delay = 0;
        shell.born = now;
        ps.push(shell);
        effects.fireworks._lastShellTime = now;
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        if (p.type === 'shell') {
          if (now - p.born < (p.delay || 0)) continue;
          p.y += p.vy;
          p.vy += 0.15;
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > 8) p.trail.shift();
          if (p.y <= p.targetY || p.vy >= 0) {
            // Explode
            for (var j = 0; j < 30; j++) {
              ps.push(makeFireworkSpark(p.x, p.y, p.color));
            }
            ps.splice(i, 1);
          }
        } else if (p.type === 'spark') {
          p.vy += p.gravity;
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.98;
          p.life -= p.decay;
          if (p.life <= 0) ps.splice(i, 1);
        }
      }
    },
    draw: function (ps) {
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (p.type === 'shell') {
          // Draw trail
          for (var t = 0; t < p.trail.length; t++) {
            ctx.globalAlpha = (t / p.trail.length) * 0.6;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.trail[t].x, p.trail[t].y, 2, 0, Math.PI * 2);
            ctx.fill();
          }
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#fff';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'spark') {
          ctx.globalAlpha = p.life;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      ctx.globalAlpha = 1;
    }
  };

  effects.lightning = {
    init: function (cfg, w, h) {
      var ps = [];
      for (var i = 0; i < (cfg.particleCount || 8); i++) {
        ps.push(makeLightningBolt(w, h));
      }
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      var now = Date.now();
      // Spawn new bolts periodically during first 80% of duration
      if (elapsed < dur * 0.8 && ps.length < 4) {
        var bolt = makeLightningBolt(w || canvas.width, h || canvas.height);
        bolt.delay = 0;
        bolt.born = now;
        ps.push(bolt);
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        var age = now - p.born;
        if (age < p.delay) continue;
        var liveAge = age - p.delay;
        if (liveAge < 100) {
          p.opacity = 1;
        } else if (liveAge < 200) {
          p.opacity = 0.3;
        } else if (liveAge < 300) {
          p.opacity = 0.8;
        } else {
          p.opacity = Math.max(0, 1 - (liveAge - 300) / 400);
        }
        if (p.opacity <= 0) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      var now = Date.now();
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (now - p.born < p.delay) continue;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = p.width;
        ctx.shadowColor = '#a5f3fc';
        ctx.shadowBlur = p.glow;
        ctx.beginPath();
        ctx.moveTo(p.points[0].x, p.points[0].y);
        for (var j = 1; j < p.points.length; j++) {
          ctx.lineTo(p.points[j].x, p.points[j].y);
        }
        ctx.stroke();
        // Bright core
        ctx.lineWidth = Math.max(1, p.width - 2);
        ctx.shadowBlur = p.glow * 2;
        ctx.stroke();
        ctx.restore();
      }
    }
  };

  effects.snowfall = {
    init: function (cfg, w, h) {
      var ps = [];
      for (var i = 0; i < (cfg.particleCount || 60); i++) {
        var p = makeSnowflake(cfg.colors, w);
        p.y = rand(-h, -10); // stagger start positions
        ps.push(p);
      }
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      // Continuously spawn snowflakes during first 70% of duration
      if (elapsed < dur * 0.7 && ps.length < 80) {
        ps.push(makeSnowflake(effectConfig.colors, w));
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * p.wobbleAmp;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        if (elapsed > dur * 0.75) p.opacity = Math.max(0, p.opacity - 0.01);
        if (p.y > h + 20 || p.opacity <= 0) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rotation * Math.PI / 180);
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        // Simple snowflake: 6-pointed star
        for (var s = 0; s < 6; s++) {
          var a = (s / 6) * Math.PI * 2;
          ctx.fillRect(-0.5, 0, 1, p.size);
          ctx.save();
          ctx.rotate(a);
          ctx.fillRect(-0.5, 0, 1, p.size);
          ctx.restore();
        }
        ctx.restore();
      }
    }
  };

  effects.meteors = {
    _lastMeteor: 0,
    init: function (cfg, w, h) {
      var ps = [];
      for (var i = 0; i < (cfg.particleCount || 12); i++) {
        var p = makeMeteor(cfg.colors, w, h);
        p.delay = i * 200;
        p.born = Date.now();
        ps.push(p);
      }
      effects.meteors._lastMeteor = Date.now();
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      var now = Date.now();
      // Spawn new meteors periodically during first 70% of duration
      if (elapsed < dur * 0.7 && now - effects.meteors._lastMeteor > 300 && ps.length < 20) {
        var p = makeMeteor(effectConfig.colors, w, h);
        p.delay = 0;
        p.born = now;
        ps.push(p);
        effects.meteors._lastMeteor = now;
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        if (now - p.born < (p.delay || 0)) continue;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 15) p.trail.shift();
        p.x += p.vx;
        p.y += p.vy;
        p.life -= p.decay;
        if (p.life <= 0 || p.y > h + 30 || p.x > w + 50) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      var now = Date.now();
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (now - p.born < (p.delay || 0)) continue;
        // Trail
        for (var t = 0; t < p.trail.length; t++) {
          var tAlpha = (t / p.trail.length) * p.life * 0.6;
          var tSize = p.size * (t / p.trail.length);
          ctx.globalAlpha = tAlpha;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.trail[t].x, p.trail[t].y, tSize, 0, Math.PI * 2);
          ctx.fill();
        }
        // Head
        ctx.globalAlpha = p.life;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }
  };

  effects.cherry_blossom = {
    init: function (cfg, w, h) {
      var ps = [];
      for (var i = 0; i < (cfg.particleCount || 50); i++) {
        var p = makePetal(cfg.colors, w);
        p.y = rand(-h * 0.5, -10);
        ps.push(p);
      }
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      // Continuously spawn petals during first 65% of duration
      if (elapsed < dur * 0.65 && ps.length < 60) {
        ps.push(makePetal(effectConfig.colors, w));
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.wobble += p.wobbleSpeed;
        p.x += p.vx + Math.sin(p.wobble) * p.wobbleAmp;
        p.y += p.vy;
        p.rotation += p.rotSpeed;
        if (elapsed > dur * 0.7) p.opacity = Math.max(0, p.opacity - 0.01);
        if (p.y > h + 30 || p.opacity <= 0) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        drawPetal(p.x, p.y, p.size, p.color, p.opacity, p.rotation);
      }
    }
  };

  effects.aurora = {
    init: function (cfg, w, h) {
      var ps = [];
      for (var i = 0; i < (cfg.particleCount || 6); i++) {
        ps.push(makeAuroraWave(cfg.colors, w, h, i));
      }
      return ps;
    },
    update: function (ps, dt, elapsed, dur) {
      for (var i = 0; i < ps.length; i++) {
        ps[i].phase += ps[i].speed * 0.01;
        if (elapsed > dur * 0.6) {
          ps[i].opacity = Math.max(0, ps[i].opacity - 0.003);
        }
      }
      for (var j = ps.length - 1; j >= 0; j--) {
        if (ps[j].opacity <= 0) ps.splice(j, 1);
      }
    },
    draw: function (ps) {
      for (var i = 0; i < ps.length; i++) {
        var w = ps[i];
        ctx.save();
        ctx.globalAlpha = w.opacity;
        var grad = ctx.createLinearGradient(0, w.y - w.height / 2, 0, w.y + w.height / 2);
        grad.addColorStop(0, 'transparent');
        grad.addColorStop(0.5, w.color);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.shadowColor = w.color;
        ctx.shadowBlur = 30;
        ctx.beginPath();
        ctx.moveTo(0, w.y);
        for (var x = 0; x <= w.w; x += 4) {
          var yOff = Math.sin(x * w.frequency + w.phase) * w.amplitude;
          ctx.lineTo(x, w.y + yOff);
        }
        ctx.lineTo(w.w, w.y + w.height);
        ctx.lineTo(0, w.y + w.height);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
    }
  };

  effects.galaxy_burst = {
    init: function (cfg, w, h) {
      var ps = [];
      for (var i = 0; i < (cfg.particleCount || 100); i++) {
        ps.push(makeGalaxyParticle(cfg.colors, w, h));
      }
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      // Continuously spawn galaxy particles during first 60% of duration
      if (elapsed < dur * 0.6 && ps.length < 120) {
        for (var s = 0; s < 3; s++) {
          ps.push(makeGalaxyParticle(effectConfig.colors, w, h));
        }
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.angle += p.speed;
        p.dist += p.vr;
        p.x = p.cx + Math.cos(p.angle) * p.dist;
        p.y = p.cy + Math.sin(p.angle) * p.dist;
        p.life -= p.decay;
        if (p.life <= 0) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  };

  effects.phoenix = {
    init: function (cfg, w, h) {
      var ps = [];
      for (var i = 0; i < (cfg.particleCount || 80); i++) {
        var p = makePhoenixParticle(cfg.colors, w, h);
        p.delay = rand(0, 1500);
        p.born = Date.now();
        ps.push(p);
      }
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      var now = Date.now();
      // Continuously spawn phoenix particles during first 70% of duration
      if (elapsed < dur * 0.7 && ps.length < 100) {
        var p = makePhoenixParticle(effectConfig.colors, w, h);
        p.delay = 0;
        p.born = now;
        ps.push(p);
      }
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        if (now - p.born < p.delay) continue;
        p.trail.push({ x: p.x, y: p.y });
        if (p.trail.length > 10) p.trail.shift();
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.99;
        p.life -= p.decay;
        if (p.life <= 0) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      var now = Date.now();
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (now - p.born < p.delay) continue;
        // Fire trail
        for (var t = 0; t < p.trail.length; t++) {
          ctx.globalAlpha = (t / p.trail.length) * p.life * 0.5;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(p.trail[t].x, p.trail[t].y, p.size * (t / p.trail.length), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = p.life;
        ctx.fillStyle = '#fff';
        ctx.shadowColor = p.color;
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
    }
  };

  effects.nuclear = {
    init: function (cfg, w, h) {
      var ps = [];
      // Shockwave rings
      ps.push({ type: 'ring', cx: w / 2, cy: h / 2, radius: 0, maxRadius: Math.max(w, h), speed: 14, opacity: 1, width: 10 });
      ps.push({ type: 'ring', cx: w / 2, cy: h / 2, radius: 0, maxRadius: Math.max(w, h), speed: 10, opacity: 0.7, width: 6, delay: 200, born: Date.now() });
      // Flash
      ps.push({ type: 'flash', opacity: 1 });
      // Particles
      for (var i = 0; i < (cfg.particleCount || 150); i++) {
        var p = makeNuclearParticle(cfg.colors, w, h);
        p.type = 'particle';
        p.delay = rand(0, 500);
        p.born = Date.now();
        ps.push(p);
      }
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      var now = Date.now();
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        if (p.type === 'flash') {
          p.opacity = Math.max(0, 1 - elapsed / 600);
          if (p.opacity <= 0) ps.splice(i, 1);
        } else if (p.type === 'ring') {
          if (p.delay && now - p.born < p.delay) continue;
          p.radius += p.speed;
          p.opacity = Math.max(0, 1 - p.radius / p.maxRadius);
          if (p.opacity <= 0) ps.splice(i, 1);
        } else if (p.type === 'particle') {
          if (now - p.born < (p.delay || 0)) continue;
          p.vy += p.gravity;
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.98;
          p.life -= p.decay;
          if (p.life <= 0) ps.splice(i, 1);
        }
      }
    },
    draw: function (ps) {
      var now = Date.now();
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (p.type === 'flash') {
          ctx.save();
          ctx.globalAlpha = p.opacity * 0.7;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        } else if (p.type === 'ring') {
          if (p.delay && now - p.born < p.delay) continue;
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = p.width * p.opacity;
          ctx.shadowColor = '#ffff00';
          ctx.shadowBlur = 20;
          ctx.beginPath();
          ctx.arc(p.cx, p.cy, p.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (p.type === 'particle') {
          if (now - p.born < (p.delay || 0)) continue;
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  };

  // ─── crown_burst — Super Fan "Solar Sovereign" exclusive ─────────────
  // A golden crown materializes at center, then bursts: royal shockwave
  // rings + a fountain of gold/violet stars + slow violet sparkle rain.
  function drawCrown(cx, cy, size, color, gemColor, opacity, glow) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.globalAlpha = opacity;
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = glow;
    var w = size, h = size * 0.72;
    // band + three spikes
    ctx.beginPath();
    ctx.moveTo(-w / 2, h / 2);
    ctx.lineTo(-w / 2, -h * 0.05);
    ctx.lineTo(-w * 0.30, h * 0.12);
    ctx.lineTo(-w * 0.17, -h / 2);
    ctx.lineTo(0, h * 0.06);
    ctx.lineTo(w * 0.17, -h / 2);
    ctx.lineTo(w * 0.30, h * 0.12);
    ctx.lineTo(w / 2, -h * 0.05);
    ctx.lineTo(w / 2, h / 2);
    ctx.closePath();
    ctx.fill();
    // gems on the spike tips + band
    ctx.fillStyle = gemColor;
    ctx.shadowColor = gemColor;
    ctx.shadowBlur = glow * 0.8;
    ctx.beginPath(); ctx.arc(-w * 0.17, -h / 2, size * 0.055, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(w * 0.17, -h / 2, size * 0.055, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(0, h * 0.28, size * 0.07, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  effects.crown_burst = {
    _img: null,
    init: function (cfg, w, h) {
      // The Super Fan symbol (gold heart, purple crown) is the centerpiece;
      // the vector crown only draws while the image is still loading.
      this._img = loadEffectImage(cfg.imageUrl || '/cosmetics/superfan-heart.png');
      var ps = [];
      var cx = w / 2, cy = h * 0.42;
      var now = Date.now();
      var gold = (cfg.colors && cfg.colors[0]) || '#ffd700';
      var violet = (cfg.colors && cfg.colors[2]) || '#a855f7';
      var BURST_AT = 650;
      // The symbol itself (scale-in, hold, burst-fade)
      ps.push({ type: 'crown', cx: cx, cy: cy, size: Math.min(w, h) * 0.34, gold: gold, violet: violet, burstAt: BURST_AT });
      // A ring of mini symbols flung outward at the burst
      for (var m = 0; m < 8; m++) {
        var ang = (m / 8) * Math.PI * 2 - Math.PI / 2;
        ps.push({
          type: 'mini',
          x: cx, y: cy,
          vx: Math.cos(ang) * rand(4.5, 6.5),
          vy: Math.sin(ang) * rand(4.5, 6.5) - 1.2,
          gravity: 0.1,
          size: rand(30, 46),
          rot: rand(-25, 25), spin: rand(-3, 3),
          life: 1, decay: rand(0.008, 0.013),
          delay: BURST_AT, born: now
        });
      }
      // Royal shockwave rings (fire at burst)
      ps.push({ type: 'ring', cx: cx, cy: cy, radius: 0, maxRadius: Math.max(w, h) * 0.9, speed: 11, opacity: 1, width: 7, color: gold, delay: BURST_AT, born: now });
      ps.push({ type: 'ring', cx: cx, cy: cy, radius: 0, maxRadius: Math.max(w, h) * 0.9, speed: 8, opacity: 0.75, width: 4, color: violet, delay: BURST_AT + 140, born: now });
      // Star fountain (launches at burst)
      var count = cfg.particleCount || 90;
      for (var i = 0; i < count; i++) {
        var up = Math.random() < 0.75;
        ps.push({
          type: 'star',
          x: cx + rand(-16, 16), y: cy,
          vx: rand(-3.4, 3.4),
          vy: up ? rand(-9.5, -4.5) : rand(-3, -1),
          gravity: 0.16,
          size: rand(4, 11),
          color: Math.random() < 0.62 ? gold : (Math.random() < 0.5 ? violet : '#fff7cc'),
          life: 1, decay: rand(0.006, 0.014),
          spin: rand(-4, 4), rot: rand(0, 360),
          delay: BURST_AT + rand(0, 250), born: now
        });
      }
      // Violet sparkle rain from the top (regal afterglow)
      for (var j = 0; j < Math.floor(count * 0.4); j++) {
        ps.push({
          type: 'rain',
          x: rand(0, w), y: rand(-h * 0.25, 0),
          vy: rand(0.7, 1.8), drift: rand(-0.4, 0.4),
          size: rand(2, 5),
          color: Math.random() < 0.6 ? violet : gold,
          life: 1, decay: rand(0.004, 0.009),
          delay: BURST_AT + rand(200, 900), born: now
        });
      }
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      var now = Date.now();
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        if (p.type === 'crown') {
          if (elapsed > p.burstAt + 400) ps.splice(i, 1);
        } else if (p.type === 'mini') {
          if (now - p.born < p.delay) continue;
          p.vy += p.gravity;
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.985;
          p.rot += p.spin;
          p.life -= p.decay;
          if (p.life <= 0) ps.splice(i, 1);
        } else if (p.type === 'ring') {
          if (now - p.born < p.delay) continue;
          p.radius += p.speed;
          p.opacity = Math.max(0, 1 - p.radius / p.maxRadius) * (p.width > 5 ? 1 : 0.75);
          if (p.opacity <= 0) ps.splice(i, 1);
        } else if (p.type === 'star') {
          if (now - p.born < p.delay) continue;
          p.vy += p.gravity;
          p.x += p.vx;
          p.y += p.vy;
          p.vx *= 0.985;
          p.rot += p.spin;
          p.life -= p.decay;
          if (p.life <= 0) ps.splice(i, 1);
        } else if (p.type === 'rain') {
          if (now - p.born < p.delay) continue;
          p.y += p.vy;
          p.x += p.drift;
          p.life -= p.decay;
          if (p.life <= 0 || p.y > h + 10) ps.splice(i, 1);
        }
      }
    },
    draw: function (ps) {
      var now = Date.now();
      var elapsed = Date.now() - startTime;
      var img = this._img;
      var imgReady = img && img.complete && img.naturalWidth > 0;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (p.type === 'crown') {
          // scale-in with overshoot, then burst-fade
          var t = Math.min(1, elapsed / 420);
          var scale = t < 1 ? (1.15 * t * (2 - t)) : 1;
          var op = 1;
          if (elapsed > p.burstAt) op = Math.max(0, 1 - (elapsed - p.burstAt) / 400);
          if (elapsed > p.burstAt) scale = 1 + (elapsed - p.burstAt) / 900;
          if (imgReady) {
            var sz = p.size * 1.35 * scale;
            ctx.save();
            ctx.globalAlpha = op;
            ctx.shadowColor = p.gold;
            ctx.shadowBlur = 34;
            ctx.drawImage(img, p.cx - sz / 2, p.cy - sz / 2, sz, sz);
            ctx.restore();
          } else {
            drawCrown(p.cx, p.cy, p.size * scale, p.gold, p.violet, op, 26);
          }
        } else if (p.type === 'mini') {
          if (now - p.born < p.delay) continue;
          ctx.save();
          ctx.globalAlpha = p.life;
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * Math.PI / 180);
          if (imgReady) {
            var ms = p.size * (0.5 + p.life * 0.5);
            ctx.drawImage(img, -ms / 2, -ms / 2, ms, ms);
          } else {
            drawStar(0, 0, p.size * 0.4 * p.life, p.gold || '#ffd700', p.life);
          }
          ctx.restore();
        } else if (p.type === 'ring') {
          if (now - p.born < p.delay) continue;
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.width * Math.max(0.3, p.opacity);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 18;
          ctx.beginPath();
          ctx.arc(p.cx, p.cy, p.radius, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        } else if (p.type === 'star') {
          if (now - p.born < p.delay) continue;
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot * Math.PI / 180);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          drawStar(0, 0, p.size * p.life, p.color, p.life);
          ctx.restore();
        } else if (p.type === 'rain') {
          if (now - p.born < p.delay) continue;
          ctx.globalAlpha = p.life * 0.85;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  };

  effects.sonic_boom = {
    init: function (cfg, w, h) {
      var ps = [];
      var cx = w / 2, cy = h / 2;
      var now = Date.now();
      // Three concentric shockwave rings staggered for the "boom" beat.
      var ringColors = cfg.colors.slice(0, Math.min(3, cfg.colors.length));
      for (var r = 0; r < 3; r++) {
        ps.push({
          type: 'ring', cx: cx, cy: cy,
          radius: 0, maxRadius: Math.max(w, h) * 0.95,
          speed: 18 - r * 3, width: 14 - r * 3,
          color: ringColors[r % ringColors.length],
          delay: r * 180, born: now, opacity: 1
        });
      }
      // Central white flash
      ps.push({ type: 'flash', opacity: 1, born: now });
      // Radial spark burst — particles fly outward from center on random angles.
      var sparkCount = cfg.particleCount || 200;
      for (var i = 0; i < sparkCount; i++) {
        var angle = rand(0, Math.PI * 2);
        var speed = rand(4, 14);
        var trail = [];
        ps.push({
          type: 'spark', x: cx, y: cy,
          vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
          color: pick(cfg.colors),
          size: rand(2, 5), life: 1, decay: rand(0.008, 0.018),
          trail: trail, trailMax: 8,
          delay: rand(0, 250), born: now
        });
      }
      // Lingering glow orbs that drift after the boom
      for (var j = 0; j < 24; j++) {
        var a2 = rand(0, Math.PI * 2);
        var s2 = rand(1, 4);
        ps.push({
          type: 'orb', x: cx + Math.cos(a2) * 40, y: cy + Math.sin(a2) * 40,
          vx: Math.cos(a2) * s2, vy: Math.sin(a2) * s2,
          color: pick(cfg.colors),
          size: rand(6, 14), life: 1, decay: rand(0.004, 0.01),
          pulse: rand(0, Math.PI * 2), pulseSpeed: rand(0.08, 0.16),
          delay: rand(100, 600), born: now
        });
      }
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      var now = Date.now();
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        if (p.delay && now - p.born < p.delay) continue;
        if (p.type === 'flash') {
          p.opacity = Math.max(0, 1 - elapsed / 350);
          if (p.opacity <= 0) ps.splice(i, 1);
        } else if (p.type === 'ring') {
          p.radius += p.speed;
          p.opacity = Math.max(0, 1 - p.radius / p.maxRadius);
          if (p.opacity <= 0) ps.splice(i, 1);
        } else if (p.type === 'spark') {
          // Push trail head
          p.trail.push({ x: p.x, y: p.y });
          if (p.trail.length > p.trailMax) p.trail.shift();
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.96; p.vy *= 0.96;
          p.life -= p.decay;
          if (p.life <= 0) ps.splice(i, 1);
        } else if (p.type === 'orb') {
          p.x += p.vx; p.y += p.vy;
          p.vx *= 0.985; p.vy *= 0.985;
          p.pulse += p.pulseSpeed;
          p.life -= p.decay;
          if (p.life <= 0) ps.splice(i, 1);
        }
      }
    },
    draw: function (ps) {
      var now = Date.now();
      // Additive blending for that neon shockwave look
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (p.delay && now - p.born < p.delay) continue;
        if (p.type === 'flash') {
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = p.opacity * 0.85;
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.restore();
        } else if (p.type === 'ring') {
          ctx.save();
          ctx.globalAlpha = p.opacity;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, p.width * p.opacity);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 30;
          ctx.beginPath();
          ctx.arc(p.cx, p.cy, p.radius, 0, Math.PI * 2);
          ctx.stroke();
          // Inner bright core stroke
          ctx.shadowBlur = 60;
          ctx.lineWidth = Math.max(1, (p.width * p.opacity) * 0.4);
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = p.opacity * 0.6;
          ctx.stroke();
          ctx.restore();
        } else if (p.type === 'spark') {
          // Trail
          for (var t = 0; t < p.trail.length; t++) {
            var tp = p.trail[t];
            var tAlpha = (t / p.trail.length) * p.life * 0.6;
            ctx.globalAlpha = tAlpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(tp.x, tp.y, p.size * (t / p.trail.length) * p.life, 0, Math.PI * 2);
            ctx.fill();
          }
          // Head
          ctx.globalAlpha = p.life;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.type === 'orb') {
          var pulse = 0.7 + 0.3 * Math.sin(p.pulse);
          ctx.globalAlpha = p.life * pulse * 0.8;
          ctx.fillStyle = p.color;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 22;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
    }
  };

  // ─── Main animation loop ─────────────────────────────────

  function animate() {
    if (!canvas || !ctx || !particles) return;

    var now = Date.now();
    var elapsed = now - startTime;
    var dt = 16; // approximate frame time

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    var effectType = particles._effectType;
    var handler = effects[effectType];
    if (handler) {
      handler.update(particles, dt, elapsed, duration, canvas.width, canvas.height);
      handler.draw(particles);
    }

    if (elapsed < duration) {
      animFrame = requestAnimationFrame(animate);
    } else {
      removeCanvas();
    }
  }

  /* ─── Iridescent collection ──────────────────────
     Three calm effects for the cheap tier. They get their look from shape
     and timing rather than particle count, so they stay legible over a win
     card instead of burying it. */

  // Canvas gradients interpolate toward transparent BLACK if you stop at the
  // keyword 'transparent', which greys the outer edge of a coloured halo.
  // Stopping at the same colour with alpha 0 keeps the falloff clean.
  function withAlpha(color, a) {
    var c = String(color).trim(), m, hex, n, parts;
    if (c.charAt(0) === '#') {
      hex = c.slice(1);
      if (hex.length === 3) {
        hex = hex.charAt(0) + hex.charAt(0) + hex.charAt(1) + hex.charAt(1) + hex.charAt(2) + hex.charAt(2);
      }
      n = parseInt(hex.slice(0, 6), 16);
      if (isNaN(n)) return c;
      return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
    }
    m = /^rgba?\(([^)]+)\)$/i.exec(c);
    if (m) {
      parts = m[1].split(',');
      return 'rgba(' + parts[0].trim() + ',' + parts[1].trim() + ',' + parts[2].trim() + ',' + a + ')';
    }
    return c;
  }

  function makeFirefly(colors, w, h) {
    var sp = _spawnPoint(rand(0, w), rand(h * 0.12, h * 0.95));
    return {
      baseX: sp.x, baseY: sp.y, x: sp.x, y: sp.y,
      drift: rand(0, Math.PI * 2), driftSpeed: rand(0.004, 0.012),
      driftAmpX: rand(14, 46), driftAmpY: rand(8, 26),
      vy: rand(-0.30, -0.06),
      size: rand(1.6, 3.4), color: pick(colors),
      // Own phase AND own period, so the swarm never blinks in unison.
      // That synchrony is most of what makes cheap particle effects read
      // as cheap.
      pulse: rand(0, Math.PI * 2), pulseSpeed: rand(0.020, 0.055),
      opacity: 0
    };
  }

  effects.fireflies = {
    init: function (cfg, w, h) {
      var ps = [], i, n = cfg.particleCount || 34;
      for (i = 0; i < n; i++) ps.push(makeFirefly(cfg.colors, w, h));
      return ps;
    },
    update: function (ps, dt, elapsed, dur) {
      var fadeIn = Math.min(1, elapsed / (dur * 0.18));
      var fadeOut = elapsed > dur * 0.68
        ? Math.max(0, 1 - (elapsed - dur * 0.68) / (dur * 0.32))
        : 1;
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        p.drift += p.driftSpeed;
        p.pulse += p.pulseSpeed;
        p.baseY += p.vy;
        p.x = p.baseX + Math.sin(p.drift) * p.driftAmpX;
        p.y = p.baseY + Math.cos(p.drift * 0.7) * p.driftAmpY;
        // Floor at 0.35 so they hover and breathe rather than strobe.
        p.opacity = (0.675 + 0.325 * Math.sin(p.pulse)) * fadeIn * fadeOut;
      }
    },
    draw: function (ps) {
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (p.opacity <= 0.01) continue;
        var r = p.size * 7;
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, withAlpha(p.color, 0.9));
        g.addColorStop(0.35, withAlpha(p.color, 0.45));
        g.addColorStop(1, withAlpha(p.color, 0));
        ctx.globalAlpha = p.opacity * 0.55;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = p.opacity;
        ctx.fillStyle = '#fffdf0';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
  };

  function makeBubble(colors, w, h) {
    var sp = _spawnPoint(rand(w * 0.06, w * 0.94), h + rand(10, 90));
    return {
      x: sp.x, y: sp.y,
      vy: rand(-1.9, -0.7),
      wobble: rand(0, Math.PI * 2), wobbleSpeed: rand(0.015, 0.040), wobbleAmp: rand(0.4, 1.5),
      r: rand(7, 26),
      // Each bubble's film gradient runs at its own angle, so two bubbles
      // never show the same colours in the same place.
      spin: rand(0, Math.PI * 2), spinSpeed: rand(-0.010, 0.010),
      colors: colors, opacity: 0
    };
  }

  effects.soap_bubbles = {
    init: function (cfg, w, h) {
      var ps = [], i, n = cfg.particleCount || 26;
      for (i = 0; i < n; i++) {
        var b = makeBubble(cfg.colors, w, h);
        b.y = rand(h * 0.2, h + 80);
        ps.push(b);
      }
      return ps;
    },
    update: function (ps, dt, elapsed, dur, w, h) {
      if (elapsed < dur * 0.55 && ps.length < 40) {
        ps.push(makeBubble(effectConfig.colors, w, h));
      }
      var fadeOut = elapsed > dur * 0.70
        ? Math.max(0, 1 - (elapsed - dur * 0.70) / (dur * 0.30))
        : 1;
      for (var i = ps.length - 1; i >= 0; i--) {
        var p = ps[i];
        p.wobble += p.wobbleSpeed;
        p.spin += p.spinSpeed;
        p.y += p.vy;
        p.x += Math.sin(p.wobble) * p.wobbleAmp;
        p.opacity = Math.min(1, p.opacity + 0.04) * fadeOut;
        if (p.y < -p.r * 2 || p.opacity <= 0) ps.splice(i, 1);
      }
    },
    draw: function (ps) {
      for (var i = 0; i < ps.length; i++) {
        var p = ps[i];
        if (p.opacity <= 0.01) continue;
        var c = p.colors, n = c.length;
        ctx.save();
        ctx.globalAlpha = p.opacity;
        // Body: barely there, so the card stays readable through it.
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.09)';
        ctx.fill();
        // Rim: the soap film.
        var dx = Math.cos(p.spin) * p.r, dy = Math.sin(p.spin) * p.r;
        var g = ctx.createLinearGradient(p.x - dx, p.y - dy, p.x + dx, p.y + dy);
        g.addColorStop(0.00, withAlpha(c[0 % n], 1.00));
        g.addColorStop(0.35, withAlpha(c[1 % n], 0.80));
        g.addColorStop(0.65, withAlpha(c[2 % n], 1.00));
        g.addColorStop(1.00, withAlpha(c[3 % n], 0.85));
        ctx.strokeStyle = g;
        ctx.lineWidth = Math.max(1.4, p.r * 0.16);
        // The rim carries its own colour into the dark rather than
        // relying on contrast against whatever is behind the card.
        ctx.shadowColor = withAlpha(c[0 % n], 0.9);
        ctx.shadowBlur = Math.max(4, p.r * 0.5);
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
        // Two speculars: a soft key up-left, a faint bounce down-right.
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath();
        ctx.ellipse(p.x - p.r * 0.36, p.y - p.r * 0.40, p.r * 0.17, p.r * 0.11, -0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.30)';
        ctx.beginPath();
        ctx.arc(p.x + p.r * 0.40, p.y + p.r * 0.42, p.r * 0.07, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  };

  function makeRibbon(colors, w, h, i, total) {
    return {
      phase: rand(0, Math.PI * 2), speed: rand(0.006, 0.016),
      amp: rand(h * 0.05, h * 0.13),
      y: (h / (total + 1)) * (i + 1) + rand(-h * 0.05, h * 0.05),
      drift: rand(-0.35, 0.35),
      thickness: rand(10, 30), waves: rand(1.2, 2.4),
      color: pick(colors), color2: pick(colors),
      opacity: 0
    };
  }

  effects.silk_ribbons = {
    init: function (cfg, w, h) {
      var ps = [], i, n = cfg.particleCount || 7;
      for (i = 0; i < n; i++) ps.push(makeRibbon(cfg.colors, w, h, i, n));
      return ps;
    },
    update: function (ps, dt, elapsed, dur) {
      var fadeIn = Math.min(1, elapsed / (dur * 0.20));
      var fadeOut = elapsed > dur * 0.65
        ? Math.max(0, 1 - (elapsed - dur * 0.65) / (dur * 0.35))
        : 1;
      for (var i = 0; i < ps.length; i++) {
        var r = ps[i];
        r.phase += r.speed;
        r.y += r.drift;
        r.opacity = 0.85 * fadeIn * fadeOut;
      }
    },
    draw: function (ps) {
      var w = canvas.width, steps = 48;
      for (var i = 0; i < ps.length; i++) {
        var r = ps[i];
        if (r.opacity <= 0.01) continue;
        var k, t, x, y, th;
        ctx.save();
        ctx.globalAlpha = r.opacity;
        var g = ctx.createLinearGradient(0, 0, w, 0);
        g.addColorStop(0.00, withAlpha(r.color, 0));
        g.addColorStop(0.28, withAlpha(r.color, 0.85));
        g.addColorStop(0.62, withAlpha(r.color2, 0.85));
        g.addColorStop(1.00, withAlpha(r.color2, 0));
        ctx.fillStyle = g;
        ctx.beginPath();
        // Top edge left-to-right, then bottom edge back. Thickness follows
        // sin(pi*t), so both ends taper to a point instead of being cut off
        // at the canvas edge.
        for (k = 0; k <= steps; k++) {
          t = k / steps;
          x = t * w;
          y = r.y + Math.sin(r.phase + t * Math.PI * 2 * r.waves) * r.amp;
          th = r.thickness * Math.sin(Math.PI * t);
          if (k === 0) ctx.moveTo(x, y - th / 2); else ctx.lineTo(x, y - th / 2);
        }
        for (k = steps; k >= 0; k--) {
          t = k / steps;
          x = t * w;
          y = r.y + Math.sin(r.phase + t * Math.PI * 2 * r.waves) * r.amp;
          th = r.thickness * Math.sin(Math.PI * t);
          ctx.lineTo(x, y + th / 2);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    }
  };

  // ─── Public API ───────────────────────────────────────────

  // Per-effect default colors. Callers that pass only { effect } (e.g. fallback
  // paths in win-overlay) would otherwise hit pick(undefined) → TypeError.
  var DEFAULT_COLORS = {
    fireflies:      ['#ffe9a8','#fff3c9','#d8f5b0','#ffd980'],
    soap_bubbles:   ['#6fd4ff','#ff8fd0','#63ffc0','#b795ff','#ffdb6b'],
    silk_ribbons:   ['#ffc9b0','#ff9e9e','#d9a7d4','#b8a9e0','#fde8e4'],
    confetti:       ['#ff3b6b','#ffd700','#36e3ff','#7cff7c','#c084fc'],
    sparkles:       ['#ffffff','#fffacd','#ffd700'],
    hearts:         ['#ff6b81','#ff4757','#ff6348','#ff7979'],
    fireworks:      ['#ff0000','#ffd700','#00ff00','#00bfff','#ff69b4'],
    snowfall:       ['#ffffff','#e0f2fe','#bae6fd','#dbeafe'],
    lightning:      ['#ffffff','#a5f3fc','#67e8f9'],
    meteors:        ['#ff8c00','#ff6347','#ffd700','#ff4500'],
    cherry_blossom: ['#ffb7c5','#ff69b4','#ffc0cb','#fff0f5'],
    aurora:         ['#00ff87','#00bcd4','#7c4dff','#e040fb'],
    galaxy_burst:   ['#8b5cf6','#a78bfa','#c4b5fd','#818cf8','#6366f1','#fcd34d'],
    phoenix:        ['#ff4500','#ff6347','#ffd700','#ff8c00','#ffffff'],
    nuclear:        ['#ffffff','#ffff00','#ffa500','#ff4500','#ff0000'],
    sonic_boom:     ['#00ffcc','#00ccff','#8000ff','#00ff88','#ffffff'],
    heart_shower:   ['#FE2C55','#FF4D7A','#FFFFFF','#25F4EE'],
    crown_burst:    ['#ffd700','#fff7cc','#a855f7','#ffffff']
  };

  window.playWinEffect = function (config) {
    if (!config || !config.effect) return;
    // Canvas 2D renders win effects on top of DOM (z-index 9999).
    // Three.js handles background environment, ambient particles, and post-processing.
    // Notify Three.js for game-reactive effects (chromatic aberration, light burst, etc.)
    if (window.ThreeManager && window.ThreeManager.onGameEvent) {
      window.ThreeManager.onGameEvent('win-effect', config);
    }
    var effectType = config.effect;
    if (!effects[effectType]) return;

    // Shallow clone + fill missing colors so a bare { effect } never crashes.
    config = Object.assign({}, config);
    if (!config.colors || !config.colors.length) {
      config.colors = DEFAULT_COLORS[effectType] || ['#ffffff','#ffd700','#ff69b4'];
    }

    // Clean up any existing effect
    removeCanvas();

    createCanvas(config.target);
    var w = canvas.width;
    var h = canvas.height;

    effectConfig = config; // Store config for respawning particles
    duration = config.duration || 3000;
    startTime = Date.now();
    particles = effects[effectType].init(config, w, h);
    particles._effectType = effectType;

    animFrame = requestAnimationFrame(animate);

    // Safety timeout
    setTimeout(function () { removeCanvas(); }, duration + 1000);
  };

  // Allow checking if win effects system is loaded
  window.WIN_EFFECTS_LOADED = true;

})();
