(function () {
  'use strict';

  let canvas;
  let context;
  let frame;
  let particles = [];

  function removeCanvas() {
    if (frame) cancelAnimationFrame(frame);
    frame = null;
    if (canvas) canvas.remove();
    canvas = null;
    context = null;
    particles = [];
  }

  function random(min, max) {
    return Math.random() * (max - min) + min;
  }

  function play(options) {
    const config = options || {};
    removeCanvas();
    canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:9999;pointer-events:none;';
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    context = canvas.getContext('2d');

    const colors = config.colors || ['#ff4d6d', '#7c5cff', '#25c27a', '#ffbe55'];
    const count = Math.min(Number(config.particleCount) || 100, 180);
    for (let i = 0; i < count; i += 1) {
      particles.push({
        x: random(0, canvas.width),
        y: random(-canvas.height * 0.35, -20),
        vx: random(-3, 3),
        vy: random(2, 6),
        gravity: 0.08,
        size: random(5, 11),
        rotation: random(0, Math.PI * 2),
        spin: random(-0.15, 0.15),
        wobble: random(0, Math.PI * 2),
        color: colors[i % colors.length],
        shape: i % 3 === 0 ? 'circle' : 'rect'
      });
    }

    const started = performance.now();
    const duration = Number(config.duration) || 3200;
    function animate(now) {
      if (!context || !canvas) return;
      const elapsed = now - started;
      context.clearRect(0, 0, canvas.width, canvas.height);
      particles.forEach((particle) => {
        particle.wobble += 0.05;
        particle.x += particle.vx + Math.sin(particle.wobble) * 0.5;
        particle.y += particle.vy;
        particle.vy += particle.gravity;
        particle.rotation += particle.spin;
        context.save();
        context.translate(particle.x, particle.y);
        context.rotate(particle.rotation);
        context.fillStyle = particle.color;
        context.globalAlpha = Math.max(0, 1 - Math.max(0, elapsed - duration * 0.65) / (duration * 0.35));
        if (particle.shape === 'circle') {
          context.beginPath();
          context.arc(0, 0, particle.size / 2, 0, Math.PI * 2);
          context.fill();
        } else {
          context.fillRect(-particle.size / 2, -particle.size / 2, particle.size, particle.size * 0.65);
        }
        context.restore();
      });
      if (elapsed < duration) {
        frame = requestAnimationFrame(animate);
      } else {
        removeCanvas();
      }
    }
    frame = requestAnimationFrame(animate);
  }

  window.HangStreamWinEffects = { play };
})();
