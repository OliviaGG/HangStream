// win-effects-gl.js — WebGL2 + Three.js + UnrealBloom replacement engine.
//
// Drop-in for window.playWinEffect. Activated by ?fx=gl in the URL.
// Falls back to the canvas2d engine (already loaded as window.playWinEffect)
// for any effect this engine doesn't yet implement, or if WebGL2/imports fail.
//
// Loaded as a module (<script type="module">) so it can import Three.js via
// the importmap declared in the host HTML.

import * as THREE from 'three';
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

const params = new URLSearchParams(location.search);
const FX_FLAG = params.get('fx');
// Opt-in via ?fx=gl. Anything else (including absent) → canvas2d engine wins.
if (FX_FLAG !== 'gl') {
  console.info('[win-effects-gl] disabled (use ?fx=gl to enable)');
} else {
  bootGLEngine();
}

function bootGLEngine() {
  // Capability check: WebGL2 + float render targets for HDR bloom.
  const probe = document.createElement('canvas').getContext('webgl2');
  if (!probe) {
    console.warn('[win-effects-gl] WebGL2 unavailable, leaving canvas2d engine in place');
    return;
  }

  const legacyPlay = window.playWinEffect;

  // Convenience randoms — match canvas2d engine API
  function rand(min, max) { return Math.random() * (max - min) + min; }
  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // ─── Per-instance state (one effect runs at a time) ──────────────
  let renderer, scene, camera, composer, bloomPass;
  let canvas = null;
  let target = null;
  let animId = null;
  let startTime = 0;
  let duration = 0;
  let systems = []; // each item: { object: Object3D, update(elapsedMs, durMs) }

  function teardown() {
    if (animId) {
      cancelAnimationFrame(animId);
      clearTimeout(animId); // safe even if it was a rAF handle
    }
    animId = null;
    if (systems.length) {
      systems.forEach(s => {
        if (s.object) {
          if (scene) scene.remove(s.object);
          if (s.object.geometry) s.object.geometry.dispose();
          if (s.object.material) {
            if (Array.isArray(s.object.material)) s.object.material.forEach(m => m.dispose());
            else s.object.material.dispose();
          }
        }
      });
      systems = [];
    }
    if (composer) { composer.dispose && composer.dispose(); composer = null; }
    if (renderer) { renderer.dispose(); renderer.forceContextLoss && renderer.forceContextLoss(); renderer = null; }
    scene = null;
    camera = null;
    bloomPass = null;
    if (canvas && canvas.parentNode) canvas.parentNode.removeChild(canvas);
    canvas = null;
    target = null;
  }

  function setup(cfgTarget) {
    let w, h;
    target = cfgTarget || null;
    if (target && target !== document.body) {
      w = target.clientWidth || target.offsetWidth || 280;
      h = target.clientHeight || target.offsetHeight || 140;
    } else {
      const vp = window.__gameViewport || { width: window.innerWidth, height: window.innerHeight };
      w = vp.width; h = vp.height;
    }

    canvas = document.createElement('canvas');
    if (target && target !== document.body) {
      canvas.style.cssText = 'position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;';
      target.appendChild(canvas);
    } else {
      canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;z-index:9999;pointer-events:none;';
      document.body.appendChild(canvas);
    }

    renderer = new THREE.WebGLRenderer({
      canvas, alpha: true, antialias: false,
      premultipliedAlpha: false, powerPreference: 'high-performance',
      // preserveDrawingBuffer lets external code (toDataURL, OBS capture
      // backbuffer reads) sample the rendered frame. Small perf cost on
      // composite. Required for accurate test capture and safer for OBS.
      preserveDrawingBuffer: true
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    scene = new THREE.Scene();
    // Ortho camera with pixel-space coords centred on (0,0). +x right, +y up.
    camera = new THREE.OrthographicCamera(-w/2, w/2, h/2, -h/2, -1000, 1000);
    camera.position.z = 10;

    composer = new EffectComposer(renderer);
    composer.setSize(w, h);
    composer.addPass(new RenderPass(scene, camera));

    // UnrealBloom — the killer feature. Strength 0.9 keeps highlights
    // glowing without washing out neighboring detail; threshold 0.85 means
    // only the brightest pixels bloom (preserves spiral arms + ejecta).
    bloomPass = new UnrealBloomPass(new THREE.Vector2(w, h), 0.9, 0.5, 0.85);
    composer.addPass(bloomPass);

    composer.addPass(new OutputPass());

    return { w, h };
  }

  function animate() {
    if (!composer) return;
    const now = performance.now();
    const elapsed = now - startTime;

    // Update systems; remove any that report done
    for (let i = systems.length - 1; i >= 0; i--) {
      const sys = systems[i];
      const alive = sys.update(elapsed, duration);
      if (alive === false) {
        if (sys.object) {
          scene.remove(sys.object);
          if (sys.object.geometry) sys.object.geometry.dispose();
          if (sys.object.material) sys.object.material.dispose();
        }
        systems.splice(i, 1);
      }
    }
    composer.render();

    if (elapsed > duration + 800 || systems.length === 0) {
      teardown();
      return;
    }
    // rAF gets throttled to zero when the page is hidden (preview tools,
    // OBS scene switches). Fall back to setTimeout so the animation always
    // advances; visible pages still get vsync-aligned rAF.
    if (document.hidden) {
      animId = setTimeout(() => animate(), 16);
    } else {
      animId = requestAnimationFrame(animate);
    }
  }

  // ─── Reusable shader chunks ─────────────────────────────────────

  // Soft circular sprite — used for sparks and orbs. Smooth-step gives a
  // disc with a soft edge. Output is RGBA, color × intensity for HDR bloom.
  const SOFT_SPRITE_VERT = /* glsl */ `
    attribute float aSize;
    attribute vec3  aColor;
    attribute float aAlpha;
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vColor = aColor;
      vAlpha = aAlpha;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * mv;
      gl_PointSize = aSize;
    }
  `;
  const SOFT_SPRITE_FRAG = /* glsl */ `
    varying vec3 vColor;
    varying float vAlpha;
    void main() {
      vec2 uv = gl_PointCoord - 0.5;
      float d = length(uv) * 2.0;        // 0 centre, 1 edge
      float a = smoothstep(1.0, 0.0, d); // soft falloff
      a = pow(a, 1.6);                   // tighter core
      gl_FragColor = vec4(vColor * a * 1.6, vAlpha * a);
    }
  `;

  // Shockwave ring shader — concentric annulus, soft inner+outer edges,
  // brightness fades as radius grows. Bloom does the rest of the work.
  const RING_VERT = /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `;
  const RING_FRAG = /* glsl */ `
    uniform vec3  uColor;
    uniform float uOpacity;
    uniform float uInnerR;   // 0..1, inner radius as fraction of mesh radius
    uniform float uOuterR;   // 0..1, outer radius
    uniform float uEdge;     // soft-edge width as fraction
    varying vec2 vUv;
    void main() {
      float d = length(vUv - 0.5) * 2.0;       // 0 at centre, 1 at outer mesh edge
      float a = smoothstep(uInnerR - uEdge, uInnerR + uEdge, d)
              * smoothstep(uOuterR + uEdge, uOuterR - uEdge, d);
      // Bright inner edge highlight
      float core = exp(-pow((d - (uInnerR + uOuterR)*0.5) * 6.0, 2.0)) * 0.6;
      vec3 col = uColor * (1.0 + core * 1.5);
      gl_FragColor = vec4(col * uOpacity, a * uOpacity);
    }
  `;

  // ─── System factories ────────────────────────────────────────────

  function makeFlashPlane(w, h, color) {
    const geo = new THREE.PlaneGeometry(w * 2, h * 2);
    const mat = new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: 0.0,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = 5;
    const flashDur = 320;
    return {
      object: mesh,
      update(elapsed) {
        if (elapsed < flashDur) {
          mat.opacity = (1.0 - elapsed / flashDur) * 0.9;
          return true;
        }
        mat.opacity = 0;
        return false;
      }
    };
  }

  function makeShockwaveRing(opts) {
    // Mesh: a large ring; shader controls the actual visible inner/outer
    // radii to animate without re-creating geometry.
    const baseR = opts.maxRadius;
    const geo = new THREE.PlaneGeometry(baseR * 2, baseR * 2);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: RING_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uColor:   { value: new THREE.Color(opts.color) },
        uOpacity: { value: 0 },
        uInnerR:  { value: 0 },
        uOuterR:  { value: 0 },
        uEdge:    { value: 0.005 }
      }
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.z = 2;
    const lifeMs = opts.life || 1400;
    const widthFrac = opts.widthFrac || 0.03; // ring thickness as fraction of maxRadius
    return {
      object: mesh,
      update(elapsed) {
        const localElapsed = elapsed - (opts.delay || 0);
        if (localElapsed < 0) { mat.uniforms.uOpacity.value = 0; return true; }
        if (localElapsed > lifeMs) return false;
        const t = localElapsed / lifeMs;          // 0..1
        const outer = t;                          // outer edge expands to full radius
        const inner = Math.max(0, outer - widthFrac);
        mat.uniforms.uInnerR.value = inner;
        mat.uniforms.uOuterR.value = outer;
        mat.uniforms.uOpacity.value = (1 - t) * 1.0;
        return true;
      }
    };
  }

  function makeSparkBurst(opts) {
    const count = opts.count;
    const colors = opts.colors.map(c => new THREE.Color(c));
    const pos = new Float32Array(count * 3);
    const colorAttr = new Float32Array(count * 3);
    const sizeAttr = new Float32Array(count);
    const alphaAttr = new Float32Array(count);

    // Per-spark dynamic state held in JS — updated each frame.
    const state = new Array(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * (opts.maxSpeed - 2);
      const c = colors[Math.floor(Math.random() * colors.length)];
      state[i] = {
        x: 0, y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        delay: Math.random() * 220,
        life: 1.0,
        decay: 0.005 + Math.random() * 0.012,
        baseSize: 6 + Math.random() * 10,
      };
      colorAttr[i * 3]     = c.r;
      colorAttr[i * 3 + 1] = c.g;
      colorAttr[i * 3 + 2] = c.b;
      sizeAttr[i] = state[i].baseSize;
      alphaAttr[i] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(colorAttr, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizeAttr, 1));
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphaAttr, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: SOFT_SPRITE_VERT,
      fragmentShader: SOFT_SPRITE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    points.position.z = 3;

    let last = performance.now();

    return {
      object: points,
      update(elapsed) {
        const now = performance.now();
        const dt = Math.min(40, now - last) / 16.67; // frame-rate-normalized
        last = now;
        let anyAlive = false;
        for (let i = 0; i < count; i++) {
          const s = state[i];
          if (elapsed < s.delay) continue;
          if (s.life <= 0) continue;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vx *= 0.965;
          s.vy *= 0.965;
          s.life -= s.decay * dt;
          if (s.life < 0) s.life = 0;
          pos[i * 3]     = s.x;
          pos[i * 3 + 1] = s.y;
          sizeAttr[i] = s.baseSize * s.life;
          alphaAttr[i] = s.life;
          if (s.life > 0) anyAlive = true;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
        geo.attributes.aAlpha.needsUpdate = true;
        return anyAlive;
      }
    };
  }

  function makeOrbField(opts) {
    const count = opts.count;
    const colors = opts.colors.map(c => new THREE.Color(c));
    const pos = new Float32Array(count * 3);
    const colorAttr = new Float32Array(count * 3);
    const sizeAttr = new Float32Array(count);
    const alphaAttr = new Float32Array(count);

    const state = new Array(count);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = 30 + Math.random() * 80;
      const speed = 0.4 + Math.random() * 1.6;
      const c = colors[Math.floor(Math.random() * colors.length)];
      state[i] = {
        x: Math.cos(angle) * r,
        y: Math.sin(angle) * r,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        delay: 200 + Math.random() * 500,
        life: 1.0,
        decay: 0.003 + Math.random() * 0.006,
        baseSize: 14 + Math.random() * 14,
        pulse: Math.random() * Math.PI * 2,
        pulseSpeed: 0.08 + Math.random() * 0.08
      };
      pos[i * 3] = state[i].x;
      pos[i * 3 + 1] = state[i].y;
      colorAttr[i * 3]     = c.r;
      colorAttr[i * 3 + 1] = c.g;
      colorAttr[i * 3 + 2] = c.b;
      sizeAttr[i] = state[i].baseSize;
      alphaAttr[i] = 0;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(colorAttr, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizeAttr, 1));
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphaAttr, 1));

    const mat = new THREE.ShaderMaterial({
      vertexShader: SOFT_SPRITE_VERT,
      fragmentShader: SOFT_SPRITE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    points.position.z = 2;

    let last = performance.now();

    return {
      object: points,
      update(elapsed) {
        const now = performance.now();
        const dt = Math.min(40, now - last) / 16.67;
        last = now;
        let anyAlive = false;
        for (let i = 0; i < count; i++) {
          const s = state[i];
          if (elapsed < s.delay) continue;
          if (s.life <= 0) continue;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.vx *= 0.99;
          s.vy *= 0.99;
          s.pulse += s.pulseSpeed * dt;
          s.life -= s.decay * dt;
          if (s.life < 0) s.life = 0;
          const pulseFactor = 0.75 + 0.25 * Math.sin(s.pulse);
          pos[i * 3] = s.x;
          pos[i * 3 + 1] = s.y;
          sizeAttr[i] = s.baseSize * s.life * pulseFactor;
          alphaAttr[i] = s.life * pulseFactor * 0.9;
          if (s.life > 0) anyAlive = true;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
        geo.attributes.aAlpha.needsUpdate = true;
        return anyAlive;
      }
    };
  }

  // Galaxy swirl — particles spiral outward from centre with angular velocity.
  function makeGalaxySwirl(opts) {
    const count = opts.count;
    const colors = opts.colors.map(c => new THREE.Color(c));
    const pos = new Float32Array(count * 3);
    const colorAttr = new Float32Array(count * 3);
    const sizeAttr = new Float32Array(count);
    const alphaAttr = new Float32Array(count);
    const state = new Array(count);
    for (let i = 0; i < count; i++) {
      // Start near centre with small offset, spiral arm bias
      const armOffset = (i % 3) * (Math.PI * 2 / 3); // 3 spiral arms
      const angle = Math.random() * Math.PI * 2 + armOffset;
      const radiusStart = rand(2, 12);
      const angularVel = rand(0.04, 0.10) * (Math.random() < 0.5 ? -1 : 1) * 0.0; // will spin per arm
      const armSpin = (Math.random() < 0.5 ? 1 : -1);
      const c = colors[Math.floor(Math.random() * colors.length)];
      state[i] = {
        angle,
        radius: radiusStart,
        outwardVel: rand(1.2, 3.8),
        angularVel: armSpin * rand(0.035, 0.075),
        baseSize: rand(5, 12),
        life: 1.0,
        decay: rand(0.0035, 0.008),
        delay: rand(0, 350)
      };
      colorAttr[i*3] = c.r; colorAttr[i*3+1] = c.g; colorAttr[i*3+2] = c.b;
      sizeAttr[i] = state[i].baseSize;
      alphaAttr[i] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(colorAttr, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizeAttr, 1));
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphaAttr, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: SOFT_SPRITE_VERT,
      fragmentShader: SOFT_SPRITE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    let last = performance.now();
    return {
      object: points,
      update(elapsed) {
        const now = performance.now();
        const dt = Math.min(40, now - last) / 16.67;
        last = now;
        let anyAlive = false;
        for (let i = 0; i < count; i++) {
          const s = state[i];
          if (elapsed < s.delay) continue;
          if (s.life <= 0) continue;
          s.angle += s.angularVel * dt;
          s.radius += s.outwardVel * dt;
          s.life -= s.decay * dt;
          if (s.life < 0) s.life = 0;
          pos[i*3]   = Math.cos(s.angle) * s.radius;
          pos[i*3+1] = Math.sin(s.angle) * s.radius;
          sizeAttr[i] = s.baseSize * (0.5 + 0.5 * s.life);
          alphaAttr[i] = s.life;
          if (s.life > 0) anyAlive = true;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
        geo.attributes.aAlpha.needsUpdate = true;
        return anyAlive;
      }
    };
  }

  // Bright vortex disc — central swirling glow for galaxy_burst centre.
  const VORTEX_FRAG = /* glsl */ `
    uniform vec3 uColor;
    uniform float uTime;
    uniform float uOpacity;
    varying vec2 vUv;
    void main() {
      vec2 p = vUv - 0.5;
      float r = length(p) * 2.0;
      float a = smoothstep(1.0, 0.0, r);
      a = pow(a, 1.8);
      // Rotating arms with cos modulation
      float ang = atan(p.y, p.x);
      float swirl = 0.5 + 0.5 * cos(ang * 3.0 + uTime * 4.0 - r * 6.0);
      vec3 col = uColor * (0.6 + swirl * 0.7);
      gl_FragColor = vec4(col * a * 1.1, a * uOpacity);
    }
  `;

  function makeVortexDisc(opts) {
    const size = opts.size || 200;
    const geo = new THREE.PlaneGeometry(size, size);
    const mat = new THREE.ShaderMaterial({
      vertexShader: RING_VERT,
      fragmentShader: VORTEX_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      uniforms: {
        uColor: { value: new THREE.Color(opts.color || '#ffd34d') },
        uTime: { value: 0 },
        uOpacity: { value: 0 }
      }
    });
    const mesh = new THREE.Mesh(geo, mat);
    const lifeMs = opts.life || 2500;
    return {
      object: mesh,
      update(elapsed) {
        if (elapsed > lifeMs) return false;
        const t = elapsed / lifeMs;
        // Quick fade-in, slow fade-out
        const a = t < 0.15 ? (t / 0.15) : (1 - (t - 0.15) / 0.85);
        mat.uniforms.uOpacity.value = Math.max(0, a);
        mat.uniforms.uTime.value = elapsed / 1000;
        return true;
      }
    };
  }

  // Mushroom-style upward ejecta — used by nuclear. Particles emit from
  // centre with a strong upward bias and curl outward.
  function makeMushroomEjecta(opts) {
    const count = opts.count;
    const colors = opts.colors.map(c => new THREE.Color(c));
    const pos = new Float32Array(count * 3);
    const colorAttr = new Float32Array(count * 3);
    const sizeAttr = new Float32Array(count);
    const alphaAttr = new Float32Array(count);
    const state = new Array(count);
    for (let i = 0; i < count; i++) {
      // Bias toward upward emission (-PI/2 .. -PI*1.5 in our coords with +y down? +y up here, so toward PI/2)
      // We use +y up. Bias up means angle near PI/2.
      const angle = (Math.PI / 2) + rand(-Math.PI / 2.2, Math.PI / 2.2);
      const speed = rand(2, 9);
      const c = colors[Math.floor(Math.random() * colors.length)];
      state[i] = {
        x: 0, y: 0,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        delay: rand(0, 300),
        life: 1.0,
        decay: rand(0.005, 0.012),
        baseSize: rand(6, 16),
        gravity: -0.04 // pull DOWN (negative y velocity gain)
      };
      colorAttr[i*3] = c.r; colorAttr[i*3+1] = c.g; colorAttr[i*3+2] = c.b;
      sizeAttr[i] = state[i].baseSize;
      alphaAttr[i] = 0;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aColor',   new THREE.BufferAttribute(colorAttr, 3));
    geo.setAttribute('aSize',    new THREE.BufferAttribute(sizeAttr, 1));
    geo.setAttribute('aAlpha',   new THREE.BufferAttribute(alphaAttr, 1));
    const mat = new THREE.ShaderMaterial({
      vertexShader: SOFT_SPRITE_VERT,
      fragmentShader: SOFT_SPRITE_FRAG,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const points = new THREE.Points(geo, mat);
    let last = performance.now();
    return {
      object: points,
      update(elapsed) {
        const now = performance.now();
        const dt = Math.min(40, now - last) / 16.67;
        last = now;
        let anyAlive = false;
        for (let i = 0; i < count; i++) {
          const s = state[i];
          if (elapsed < s.delay) continue;
          if (s.life <= 0) continue;
          s.vy += s.gravity * dt;
          s.vx *= 0.985;
          s.x += s.vx * dt;
          s.y += s.vy * dt;
          s.life -= s.decay * dt;
          if (s.life < 0) s.life = 0;
          pos[i*3] = s.x;
          pos[i*3+1] = s.y;
          sizeAttr[i] = s.baseSize * s.life;
          alphaAttr[i] = s.life;
          if (s.life > 0) anyAlive = true;
        }
        geo.attributes.position.needsUpdate = true;
        geo.attributes.aSize.needsUpdate = true;
        geo.attributes.aAlpha.needsUpdate = true;
        return anyAlive;
      }
    };
  }

  // ─── Effects ────────────────────────────────────────────────────

  const effects = {};

  effects.galaxy_burst = function(cfg, w, h) {
    const colors = cfg.colors;
    const out = [];
    // Smaller central vortex so the spiral arms stay visible through bloom
    out.push(makeVortexDisc({
      color: colors[colors.length - 1] || '#ffd34d',
      size: Math.min(w, h) * 0.28,
      life: 2200
    }));
    // Outer shockwave ring as the burst kickoff
    out.push(makeShockwaveRing({
      color: colors[0] || '#8b5cf6',
      maxRadius: Math.max(w, h) * 0.55,
      delay: 0,
      life: 1100,
      widthFrac: 0.03
    }));
    // Particles spiral outward from centre (slightly bigger so they show
    // through the central bloom)
    const swirl = makeGalaxySwirl({
      count: cfg.particleCount || 200,
      colors
    });
    out.push(swirl);
    return out;
  };

  effects.nuclear = function(cfg, w, h) {
    const colors = cfg.colors;
    const out = [];
    // Initial blinding flash
    out.push(makeFlashPlane(w, h, 0xffffff));
    // Two shockwave rings, very fast outward expansion
    out.push(makeShockwaveRing({
      color: colors[1] || '#ffff00',
      maxRadius: Math.max(w, h) * 0.85,
      delay: 0,
      life: 1000,
      widthFrac: 0.05
    }));
    out.push(makeShockwaveRing({
      color: colors[2] || '#ffa500',
      maxRadius: Math.max(w, h) * 0.7,
      delay: 250,
      life: 1300,
      widthFrac: 0.04
    }));
    // Central bright mushroom-cap glow
    out.push(makeVortexDisc({
      color: colors[3] || '#ff4500',
      size: Math.min(w, h) * 0.45,
      life: 2400
    }));
    // Upward-biased ejecta — atomic mushroom
    out.push(makeMushroomEjecta({
      count: cfg.particleCount || 180,
      colors
    }));
    // Lingering sparks
    out.push(makeSparkBurst({
      count: 80,
      colors,
      maxSpeed: 10
    }));
    return out;
  };

  effects.sonic_boom = function(cfg, w, h) {
    const colors = cfg.colors;
    const maxR = Math.max(w, h) * 0.65;
    const out = [];
    // Bright central flash (cool white tint)
    out.push(makeFlashPlane(w, h, 0xffffff));
    // Three staggered shockwave rings in different palette colors
    for (let i = 0; i < 3; i++) {
      out.push(makeShockwaveRing({
        color: colors[i % colors.length],
        maxRadius: maxR,
        delay: i * 200,
        life: 1300 + i * 200,
        widthFrac: 0.045 - i * 0.005
      }));
    }
    // Radial spark burst
    out.push(makeSparkBurst({
      count: cfg.particleCount || 200,
      colors,
      maxSpeed: Math.max(8, Math.min(18, maxR / 60))
    }));
    // Lingering glow orbs
    out.push(makeOrbField({
      count: 28,
      colors
    }));
    return out;
  };

  // ─── Public API override ────────────────────────────────────────

  window.playWinEffect = function(config) {
    if (!config || !config.effect) return;
    // Always notify the optional Three.js scene manager (matches legacy behavior)
    if (window.ThreeManager && window.ThreeManager.onGameEvent) {
      try { window.ThreeManager.onGameEvent('win-effect', config); } catch (_) {}
    }
    // Unknown effect → fall back to canvas2d engine
    if (!effects[config.effect]) {
      return legacyPlay && legacyPlay(config);
    }
    // Defaults — same shape the legacy engine guarantees
    config = Object.assign({}, config);
    if (!config.colors || !config.colors.length) {
      config.colors = ['#00ffcc','#00ccff','#8000ff','#00ff88','#ffffff'];
    }

    teardown();
    const { w, h } = setup(config.target);
    duration = config.duration || 3500;
    startTime = performance.now();
    systems = effects[config.effect](config, w, h);
    systems.forEach(s => scene.add(s.object));
    if (document.hidden) animId = setTimeout(() => animate(), 16);
    else animId = requestAnimationFrame(animate);

    // Safety timeout — match legacy engine
    setTimeout(() => {
      if (systems.length === 0) return; // already torn down
      // If the animation has finished, teardown was already called.
      if (performance.now() - startTime > duration + 500) teardown();
    }, duration + 1000);
  };

  // Marker so callers / tests can detect engine
  window.WIN_EFFECTS_GL_LOADED = true;
  window.__WIN_FX_ENGINE = 'webgl';
  console.info('[win-effects-gl] WebGL engine active');
}
