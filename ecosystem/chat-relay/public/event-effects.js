/**
 * Event-overlay particle effects.
 *
 * Lightweight canvas burst used by the WikiSearchle-themed event overlay.
 * Window-global (window.EventEffects) so the overlay's inline script can call
 * it without a module bundler. All particles share one canvas.
 */
(function () {
  const CANVAS_ID = 'ev-fx-canvas';

  let ctx = null;
  let canvas = null;
  let particles = [];
  let rafHandle = null;

  function ensureCtx() {
    if (ctx) return ctx;
    canvas = document.getElementById(CANVAS_ID);
    if (!canvas) return null;
    ctx = canvas.getContext('2d');
    return ctx;
  }

  function spawnBurst(x, y, opts) {
    const count = opts.count || 36;
    const speed = opts.speed || 7;
    const colors = opts.colors || ['#FF6600'];
    const life = opts.life || 1100;
    const gravity = (opts.gravity != null) ? opts.gravity : 0.18;
    const size = opts.size || 4;

    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const v = speed * (0.55 + Math.random() * 0.6);
      particles.push({
        x, y,
        vx: Math.cos(angle) * v,
        vy: Math.sin(angle) * v - 1.5,
        gravity,
        size: size + Math.random() * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        born: performance.now(),
        life,
      });
    }
    if (!rafHandle) loop();
  }

  function loop() {
    const c = ensureCtx();
    if (!c) { rafHandle = null; return; }
    const now = performance.now();
    c.clearRect(0, 0, canvas.width, canvas.height);

    particles = particles.filter(p => (now - p.born) < p.life);

    for (const p of particles) {
      const t = (now - p.born) / p.life;
      const alpha = Math.max(0, 1 - t);
      p.x += p.vx;
      p.y += p.vy;
      p.vy += p.gravity;
      c.globalAlpha = alpha;
      c.fillStyle = p.color;
      c.beginPath();
      c.arc(p.x, p.y, p.size * (1 - t * 0.4), 0, Math.PI * 2);
      c.fill();
      // Soft glow halo
      c.globalAlpha = alpha * 0.35;
      c.beginPath();
      c.arc(p.x, p.y, p.size * 2.4 * (1 - t * 0.3), 0, Math.PI * 2);
      c.fill();
    }
    c.globalAlpha = 1;

    if (particles.length > 0) {
      rafHandle = requestAnimationFrame(loop);
    } else {
      rafHandle = null;
    }
  }

  const PRESETS = {
    'burst-orange': {
      count: 48, speed: 9, life: 1300, gravity: 0.22, size: 5,
      colors: ['#FF6600', '#FFB066', '#E06620', '#FFFFFF'],
    },
    'burst-rainbow': {
      count: 80, speed: 11, life: 1600, gravity: 0.18, size: 5,
      colors: ['#FF6600', '#FFD93D', '#6BCB77', '#4D96FF', '#9D4EDD', '#FF5DA2'],
    },
    'sparkle': {
      count: 22, speed: 5, life: 900, gravity: 0.05, size: 3,
      colors: ['#FF6600', '#FFD9B3', '#FFFFFF'],
    },
  };

  function fire(presetName, x, y) {
    const preset = PRESETS[presetName];
    if (!preset) return;
    spawnBurst(x, y, preset);
  }

  window.EventEffects = { fire };
})();
