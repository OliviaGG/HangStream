/* Seasonal backdrop shared by the overlay and its standalone preview. */
(function () {
  'use strict';

  function mount(layer, config = {}, options = {}) {
    const clamp = (value, fallback) => Math.max(1, Math.min(10, Number(value) || fallback));
    const intensity = clamp(config.intensity, 5) / 10;
    const speed = clamp(config.speed, 4) / 4;
    const color = (value, fallback) => /^#[0-9a-f]{6}$/i.test(value || '') ? value : fallback;
    const accent = color(config.primaryColor, '#9b55dd');
    const base = color(config.secondaryColor, '#170d29');
    const landscape = options.landscape ?? document.body.classList.contains('landscape');
    // A small backing canvas also keeps software-rendered OBS sources affordable.
    const width = landscape ? 960 : 540;
    const height = landscape ? 540 : 960;
    const unit = Math.min(width, height);
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const canvases = [document.createElement('canvas'), document.createElement('canvas')];
    const contexts = canvases.map(canvas => canvas.getContext('2d'));
    if (contexts.some(ctx => !ctx)) throw new Error('Halloween canvas unavailable');
    canvases.forEach(canvas => {
      canvas.width = width;
      canvas.height = height;
      canvas.setAttribute('aria-hidden', 'true');
      canvas.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;';
      layer.appendChild(canvas);
    });
    const [scene, fx] = contexts;
    const moon = { x: width * .80, y: height * .16, r: unit * .083 };

    function ellipse(ctx, x, y, rx, ry, fill) {
      ctx.fillStyle = fill;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    function branch(x, y, length, angle, depth) {
      const endX = x + Math.cos(angle) * length;
      const endY = y + Math.sin(angle) * length;
      scene.lineWidth = Math.max(1, depth * 1.5);
      scene.beginPath();
      scene.moveTo(x, y);
      scene.lineTo(endX, endY);
      scene.stroke();
      if (depth > 0) {
        branch(endX, endY, length * .69, angle - .39, depth - 1);
        branch(endX, endY, length * .61, angle + .57, depth - 1);
      }
    }

    const pumpkins = [
      { x: width * .055, y: height * .954, r: unit * .068, tilt: -.13 },
      { x: width * .14, y: height * .984, r: unit * .042, tilt: .16 },
      { x: width * .955, y: height * .963, r: unit * .080, tilt: .10 },
      { x: width * .856, y: height * .984, r: unit * .042, tilt: -.12 }
    ];

    function face(ctx, pumpkin, fill) {
      const { x, y, r, tilt } = pumpkin;
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(tilt);
      ctx.fillStyle = fill;
      for (const side of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(side * r * .38, -r * .30);
        ctx.lineTo(side * r * .64, r * .01);
        ctx.lineTo(side * r * .16, r * .01);
        ctx.closePath();
        ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(-r * .61, r * .28);
      ctx.lineTo(-r * .24, r * .39);
      ctx.lineTo(-r * .15, r * .24);
      ctx.lineTo(r * .13, r * .24);
      ctx.lineTo(r * .22, r * .40);
      ctx.lineTo(r * .61, r * .25);
      ctx.quadraticCurveTo(r * .30, r * .81, 0, r * .68);
      ctx.quadraticCurveTo(-r * .39, r * .75, -r * .61, r * .28);
      ctx.fill();
      ctx.restore();
    }

    const sky = scene.createLinearGradient(0, 0, 0, height);
    sky.addColorStop(0, '#10091c');
    sky.addColorStop(.55, base);
    sky.addColorStop(1, '#080710');
    scene.fillStyle = sky;
    scene.fillRect(0, 0, width, height);
    const haze = scene.createRadialGradient(moon.x, moon.y, 0, moon.x, moon.y, unit * .65);
    haze.addColorStop(0, accent + '56');
    haze.addColorStop(.6, accent + '18');
    haze.addColorStop(1, accent + '00');
    scene.fillStyle = haze;
    scene.fillRect(0, 0, width, height);
    for (let i = 0; i < 55; i++) {
      const x = ((i * .6180339) % 1) * width;
      const y = ((i * .4142135) % 1) * height * .72;
      ellipse(scene, x, y, i % 4 === 0 ? 1 : .6, i % 4 === 0 ? 1 : .6, '#d9bce7' + (i % 3 ? '36' : '65'));
    }
    const glow = scene.createRadialGradient(moon.x, moon.y, moon.r * .3, moon.x, moon.y, moon.r * 2.7);
    glow.addColorStop(0, '#ffdfa64a');
    glow.addColorStop(1, '#ffdfa600');
    ellipse(scene, moon.x, moon.y, moon.r * 2.7, moon.r * 2.7, glow);
    const disk = scene.createLinearGradient(moon.x - moon.r, moon.y - moon.r, moon.x + moon.r, moon.y + moon.r);
    disk.addColorStop(0, '#fff0cf');
    disk.addColorStop(1, '#d69f63');
    ellipse(scene, moon.x, moon.y, moon.r, moon.r, disk);
    [[-.3, -.4, .16], [.34, -.13, .23], [-.1, .4, .14], [-.48, .1, .08]].forEach(([x, y, r]) => {
      ellipse(scene, moon.x + x * moon.r, moon.y + y * moon.r, r * moon.r, r * moon.r, '#9a735c26');
    });
    // Bare branches frame the corners without reaching into the game area.
    scene.strokeStyle = '#070810';
    scene.lineCap = 'round';
    branch(-unit * .04, height * .61, unit * .19, -1.25, 5);
    branch(width + unit * .05, height * .66, unit * .18, -1.95, 5);
    scene.fillStyle = '#06070c';
    scene.beginPath();
    scene.moveTo(0, height);
    scene.lineTo(0, height * .94);
    scene.bezierCurveTo(width * .22, height * .90, width * .34, height * .995, width * .55, height * .974);
    scene.bezierCurveTo(width * .77, height * .95, width * .88, height * .915, width, height * .94);
    scene.lineTo(width, height);
    scene.fill();
    for (const pumpkin of pumpkins) {
      const { x, y, r, tilt } = pumpkin;
      const halo = scene.createRadialGradient(x, y, 0, x, y, r * 2.5);
      halo.addColorStop(0, '#ff74003a');
      halo.addColorStop(1, '#ff740000');
      ellipse(scene, x, y, r * 2.5, r * 1.6, halo);
      scene.save();
      scene.translate(x, y);
      scene.rotate(tilt);
      scene.strokeStyle = '#58452a';
      scene.lineWidth = r * .15;
      scene.beginPath();
      scene.moveTo(0, -r * .66);
      scene.quadraticCurveTo(-r * .08, -r * 1.03, r * .16, -r * 1.05);
      scene.stroke();
      for (const lobe of [-2, 2, -1, 1, 0]) {
        const orange = scene.createLinearGradient(-r, -r, r, r);
        orange.addColorStop(0, lobe === 0 ? '#e77f25' : '#a44919');
        orange.addColorStop(1, '#592110');
        ellipse(scene, lobe * r * .25, 0, r * .5, r * (.83 - Math.abs(lobe) * .045), orange);
      }
      scene.restore();
      face(scene, pumpkin, '#ffdf79');
    }

    let raf = null;
    let stopped = false;
    let lastFrame = -Infinity;
    let elapsed = 0;
    let previous = null;
    const frameMs = options.obs ? 1000 / 15 : 1000 / 24;

    function bat(x, y, size, phase) {
      fx.save();
      fx.translate(x, y);
      fx.rotate(Math.sin(phase * .43) * .12);
      fx.scale(size, size);
      fx.fillStyle = '#080711';
      const lift = .55 + Math.sin(phase) * .34;
      for (const side of [-1, 1]) {
        fx.save();
        fx.scale(side, 1);
        fx.beginPath();
        fx.moveTo(0, 0);
        fx.quadraticCurveTo(1, -lift, 2.1, -lift * 1.8);
        fx.quadraticCurveTo(1.55, -.1, 1.8, .5);
        fx.quadraticCurveTo(1.1, .15, .9, .7);
        fx.quadraticCurveTo(.55, .15, 0, .3);
        fx.fill();
        fx.restore();
      }
      ellipse(fx, 0, 0, .25, .5, '#080711');
      fx.restore();
    }

    function draw(time) {
      fx.clearRect(0, 0, width, height);
      for (let i = 0; i < 3 + Math.round(intensity * 3); i++) {
        const phase = time * .10 + i * 1.7;
        const x = width * (.74 + Math.sin(phase) * .19);
        const y = height * (.16 + Math.cos(phase * .8 + i) * .052);
        bat(x, y, unit * (.009 + (i % 3) * .004), time * 3 + i);
      }
      // Soft ribbons stay low and at the edges; the centre remains dark.
      for (let i = 0; i < 6; i++) {
        const x = width * (((i / 6 + time * .009) % 1.5) - .25);
        const y = height * (.88 + (i % 3) * .035) + Math.sin(time * .20 + i) * unit * .025;
        const radius = unit * .39;
        fx.save();
        fx.translate(x, y);
        fx.scale(1, .22);
        const fog = fx.createRadialGradient(0, 0, 0, 0, 0, radius);
        fog.addColorStop(0, accent + '17');
        fog.addColorStop(1, accent + '00');
        ellipse(fx, 0, 0, radius, radius, fog);
        fx.restore();
      }
      for (let i = 0; i < 8 + Math.round(intensity * 12); i++) {
        const phase = (time * .018 + i * .137) % 1;
        const side = i % 2 ? .94 : .06;
        const x = width * side + Math.sin(time * .3 + i) * unit * .06;
        const y = height * (1 - phase * .55);
        const alpha = Math.sin(phase * Math.PI) * .42;
        ellipse(fx, x, y, 1.1, 1.1, `rgba(255,161,64,${alpha})`);
      }
      pumpkins.forEach((pumpkin, i) => {
        face(fx, pumpkin, `rgba(255,243,170,${.28 + .17 * Math.sin(time * 1.4 + i * 2)})`);
      });
    }

    function frame(timestamp) {
      if (stopped) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden) { previous = timestamp; return; }
      if (timestamp - lastFrame < frameMs) return;
      if (previous !== null) elapsed += Math.min(.1, (timestamp - previous) / 1000) * speed;
      previous = timestamp;
      lastFrame = timestamp;
      draw(elapsed);
    }

    function setMotion() {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = null;
      previous = null;
      draw(elapsed);
      if (!motion.matches && !stopped) raf = requestAnimationFrame(frame);
    }
    motion.addEventListener('change', setMotion);
    setMotion();
    return function stop() {
      stopped = true;
      if (raf !== null) cancelAnimationFrame(raf);
      motion.removeEventListener('change', setMotion);
      canvases.forEach(canvas => canvas.remove());
    };
  }

  window.WordTycoonHalloween = { mount };
})();
