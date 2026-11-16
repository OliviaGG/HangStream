/* ============================================================
   ambient-fx.js — persistent per-element particle effects for cosmetics.
   Sibling of win-effects.js: win-effects = one-shot bursts on win,
   AmbientFx = long-lived auras that follow a player's name/avatar/badge.

   API:
     AmbientFx.attach(el, spec)      spec = { fx, colors, density, clip, zIndex }
       fx: 'aura' | 'sparks' | 'embers' | 'orbit' | 'motes'
     AmbientFx.detach(el)
     AmbientFx.attachFromCss(el, cssObj)   reads cssObj.__ambient (catalog spec);
                                           detaches if the payload has none
     AmbientFx.clear()                     remove all emitters + particles
     AmbientFx.configure({ maxParticles, maxEmitters })

   Budget: hard particle cap shared by ALL emitters on the page.
   Defaults: 150 particles / 20 emitters; OBS surfaces (html.obs-mode or
   ?obs=1) drop to 60 / 12 with halved spawn density. prefers-reduced-motion
   disables the engine entirely. The rAF loop only runs while there is
   something to draw.
   ============================================================ */
(function () {
  'use strict';
  if (window.AmbientFx) return;

  var reduced = false;
  try {
    reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (e) { /* older CEF */ }

  function isObs() {
    try {
      if (document.documentElement.classList.contains('obs-mode')) return true;
      var q = new URLSearchParams(location.search);
      return q.get('obs') === '1' || q.has('obs-mode');
    } catch (e) { return false; }
  }

  var OBS = isObs();
  var cfg = {
    maxParticles: OBS ? 60 : 150,
    maxEmitters: OBS ? 12 : 20,
    densityScale: OBS ? 0.5 : 1
  };

  var canvas = null, ctx = null, rafId = null, tick = 0;
  var emitters = new Map(); // Element -> { spec, angle }
  var parts = [];

  function ensureCanvas(zIndex) {
    if (canvas) return;
    canvas = document.createElement('canvas');
    canvas.className = 'cfx-ambient-canvas';
    canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:' + (zIndex || 9999) + ';';
    document.body.appendChild(canvas);
    ctx = canvas.getContext('2d');
    resize();
    window.addEventListener('resize', resize);
    document.addEventListener('visibilitychange', function () {
      // rAF is suspended while hidden; drop particles so there is no
      // stale-burst catch-up when the tab/source becomes visible again.
      if (document.hidden) parts.length = 0;
    });
  }

  function resize() {
    if (!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(innerWidth * dpr);
    canvas.height = Math.floor(innerHeight * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  var DEFAULT_COLORS = {
    aura: ['#c084fc', '#818cf8'],
    sparks: ['#ffce54', '#ffb347'],
    embers: ['#fb923c', '#fde047', '#ef4444'],
    orbit: ['#f9a8d4', '#fbcfe8'],
    motes: ['#93c5fd', '#e0e7ff']
  };

  // spawn interval in ticks per fx at density 1 (lower = denser)
  var RATES = { aura: 5, sparks: 8, embers: 4, orbit: 6, motes: 7 };

  // Remove every particle owned by an element (used when its emitter is
  // detached or its element becomes hidden — otherwise particles linger
  // over unrelated UI, e.g. a hero-badge effect floating over a modal).
  function purgeOwned(el) {
    for (var i = parts.length - 1; i >= 0; i--) {
      if (parts[i].own === el) parts.splice(i, 1);
    }
  }

  // An element faded out with opacity:0 STILL MEASURES, so the rect check
  // below never fired for surfaces that hide that way — the OBS win-card
  // widget (.widget { opacity: 0 } / .widget.show { opacity: 1 }) left its
  // avatar/name emitters spawning halo particles at the vanished card's
  // coordinates forever. checkVisibility() walks ancestor opacity; engines
  // without it fall back to the rect check alone (old behaviour).
  var HAS_CHECK_VIS = false;
  try {
    HAS_CHECK_VIS = typeof Element !== 'undefined' && Element.prototype &&
                    typeof Element.prototype.checkVisibility === 'function';
  } catch (e) { /* older CEF */ }

  function isVisible(el) {
    if (!HAS_CHECK_VIS) return true;
    try { return el.checkVisibility({ opacityProperty: true, visibilityProperty: true }); }
    catch (e) { return true; }
  }

  function spawn(el, st, r) {
    var spec = st.spec;
    var colors = spec.colors && spec.colors.length ? spec.colors : DEFAULT_COLORS[spec.fx];
    var c = pick(colors);
    var p = null;
    switch (spec.fx) {
      case 'aura': {
        var edge = Math.random() < 0.5;
        p = {
          x: rnd(r.left - 6, r.right + 6), y: edge ? r.top - 3 : r.bottom + 3,
          vx: rnd(-0.2, 0.2), vy: rnd(-0.55, -0.15),
          life: 1, decay: rnd(0.012, 0.028), size: rnd(1.1, 2.6), color: c
        };
        break;
      }
      case 'sparks':
        p = {
          x: rnd(r.left, r.right), y: rnd(r.top, r.bottom - 4),
          vx: rnd(-0.35, 0.35), vy: rnd(-1.5, -0.6), grav: 0.016,
          life: 1, decay: rnd(0.02, 0.042), size: rnd(0.9, 2.3), color: c
        };
        break;
      case 'embers':
        p = {
          x: rnd(r.left + 4, r.right - 4), y: r.bottom - 4,
          vx: rnd(-0.28, 0.28), vy: rnd(-1.2, -0.45),
          life: 1, decay: rnd(0.008, 0.02), size: rnd(1.2, 3), color: c,
          clip: spec.clip !== false ? { t: r.top, l: r.left, r: r.right } : null
        };
        break;
      case 'orbit': {
        var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        p = {
          orbit: { cx: cx, cy: cy, rad: Math.max(r.width, r.height) / 2 + 7, a: rnd(0, 6.283), sp: rnd(0.02, 0.05) * (Math.random() < 0.5 ? 1 : -1) },
          x: cx, y: cy, life: 1, decay: rnd(0.008, 0.016), size: rnd(1.3, 2.5), color: c
        };
        break;
      }
      case 'motes':
        p = {
          x: rnd(r.left, r.right), y: rnd(r.top, r.bottom),
          vx: rnd(-0.12, 0.12), vy: rnd(-0.25, -0.05),
          life: 1, decay: rnd(0.006, 0.014), size: rnd(0.8, 2), color: c,
          clip: spec.clip !== false ? { t: r.top, l: r.left, r: r.right } : null
        };
        break;
    }
    if (p) {
      p.own = el;
      parts.push(p);
    }
  }

  function frame() {
    rafId = null;
    tick++;
    ctx.clearRect(0, 0, innerWidth, innerHeight);

    // prune dead emitters, spawn from live ones
    emitters.forEach(function (st, el) {
      if (!el.isConnected) { emitters.delete(el); purgeOwned(el); return; }
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height || !isVisible(el)) {
        // Element hidden (display:none tab/modal, or faded to opacity:0 like
        // the win-card widget) — kill its particles NOW instead of letting
        // the effect linger over whatever page is shown.
        purgeOwned(el);
        return;
      }
      if (r.bottom < 0 || r.top > innerHeight) return; // scrolled off — just pause
      var rate = Math.max(1, Math.round(RATES[st.spec.fx] / ((st.spec.density || 1) * cfg.densityScale)));
      if (tick % rate === 0 && parts.length < cfg.maxParticles) spawn(el, st, r);
    });

    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      if (p.orbit) {
        p.orbit.a += p.orbit.sp;
        p.x = p.orbit.cx + Math.cos(p.orbit.a) * p.orbit.rad;
        p.y = p.orbit.cy + Math.sin(p.orbit.a) * p.orbit.rad * 0.9;
      } else {
        p.x += p.vx; p.y += p.vy;
        if (p.grav) p.vy += p.grav;
      }
      p.life -= p.decay;
      if (p.life <= 0 || (p.clip && (p.y < p.clip.t || p.x < p.clip.l || p.x > p.clip.r))) {
        parts.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = Math.max(0, Math.min(1, p.life)) * 0.9;
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = p.size * 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, 6.283);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;

    if (emitters.size || parts.length) rafId = requestAnimationFrame(frame);
  }

  function kick() {
    if (!rafId && (emitters.size || parts.length)) rafId = requestAnimationFrame(frame);
  }

  var AmbientFx = {
    attach: function (el, spec) {
      if (reduced || !el || !spec || !spec.fx || !RATES[spec.fx]) return;
      ensureCanvas(spec.zIndex);
      if (!emitters.has(el) && emitters.size >= cfg.maxEmitters) return; // budget: keep existing
      emitters.set(el, { spec: spec });
      kick();
    },
    detach: function (el) { emitters.delete(el); purgeOwned(el); },
    // Detach every emitter whose element is NOT inside rootEl. Used when a
    // modal opens over the page: background emitters would otherwise keep
    // painting on the shared fixed canvas ABOVE the modal. Callers re-attach
    // background effects when the modal closes.
    // Detach every emitter whose element IS inside rootEl. Used when a
    // transient popup (the win card) goes away: the wrapper only fades to
    // opacity:0, so without this its emitters would keep running.
    detachWithin: function (rootEl) {
      if (!rootEl) return;
      emitters.forEach(function (st, el) {
        if (rootEl === el || rootEl.contains(el)) { emitters.delete(el); purgeOwned(el); }
      });
    },
    detachOutside: function (rootEl) {
      if (!rootEl) return;
      emitters.forEach(function (st, el) {
        if (!rootEl.contains(el)) { emitters.delete(el); purgeOwned(el); }
      });
    },
    attachFromCss: function (el, cssObj) {
      var amb = cssObj && cssObj.__ambient;
      if (amb && amb.fx) AmbientFx.attach(el, amb);
      else AmbientFx.detach(el);
    },
    clear: function () { emitters.clear(); parts.length = 0; },
    configure: function (opts) {
      if (!opts) return;
      if (opts.maxParticles != null) cfg.maxParticles = opts.maxParticles;
      if (opts.maxEmitters != null) cfg.maxEmitters = opts.maxEmitters;
      if (opts.densityScale != null) cfg.densityScale = opts.densityScale;
    },
    _debug: function () { return { emitters: emitters.size, particles: parts.length, obs: OBS, cfg: cfg }; }
  };

  window.AmbientFx = AmbientFx;

  // ----------------------------------------------------------------
  // CosmeticsFx — shared style-application helpers so every surface
  // renders the full cosmetic payload (gradient-text materials, conic
  // rings, animated titles) instead of cherry-picking color/textShadow.
  // ----------------------------------------------------------------
  var GRAD_KEYS = ['background-image', 'background-size', '-webkit-background-clip', 'background-clip', '-webkit-text-fill-color'];

  function clearGradient(el) {
    for (var i = 0; i < GRAD_KEYS.length; i++) el.style.removeProperty(GRAD_KEYS[i]);
  }

  window.CosmeticsFx = {
    // Apply a word_color / name_color payload (or any text cosmetic).
    // opts: { color:false } skip solid color, { shadow:false } skip textShadow,
    //       { gradient:false } never touch gradient keys (for glow-only passes),
    //       { keepAnimation:true } don't overwrite an existing animation.
    applyText: function (el, css, opts) {
      if (!el) return;
      opts = opts || {};
      css = css || {};
      if (opts.color !== false) {
        if (css.color) el.style.color = css.color;
      }
      if (opts.shadow !== false) {
        if (css.textShadow) el.style.textShadow = css.textShadow;
      }
      if (opts.gradient !== false) {
        if (css.backgroundImage) {
          el.style.backgroundImage = css.backgroundImage;
          if (css.backgroundSize) el.style.backgroundSize = css.backgroundSize;
          el.style.webkitBackgroundClip = css.webkitBackgroundClip || 'text';
          el.style.backgroundClip = css.backgroundClip || 'text';
          el.style.webkitTextFillColor = css.webkitTextFillColor || 'transparent';
        } else {
          clearGradient(el);
        }
      }
      if (css.animation && !(opts.keepAnimation && el.style.animation)) {
        el.style.animation = css.animation;
      }
    },
    // Apply a title payload to the title span element.
    applyTitle: function (el, css) {
      if (!el) return;
      css = css || {};
      if (css.titleColor) el.style.color = css.titleColor;
      if (css.titleGlow) el.style.textShadow = css.titleGlow;
      if (css.titleBackground) {
        el.style.backgroundImage = css.titleBackground;
        el.style.backgroundSize = '220% auto';
        el.style.webkitBackgroundClip = 'text';
        el.style.backgroundClip = 'text';
        el.style.webkitTextFillColor = 'transparent';
      } else {
        clearGradient(el);
      }
      var anim = css.titleAnimation || css.animation;
      if (anim) el.style.animation = anim;
    },
    // Apply a profile_border payload including conic rings. Does NOT
    // touch boxShadow — callers stack border+glow shadows themselves.
    applyRing: function (el, css) {
      if (!el) return;
      css = css || {};
      if (css.border) el.style.border = css.border;
      if (css.backgroundImage) {
        el.style.backgroundImage = css.backgroundImage;
        el.style.backgroundOrigin = css.backgroundOrigin || 'border-box';
        el.style.backgroundClip = css.backgroundClip || 'border-box';
      } else {
        el.style.removeProperty('background-image');
        el.style.removeProperty('background-origin');
        el.style.removeProperty('background-clip');
      }
      if (css.animation) el.style.animation = css.animation;
    },
    // Reset everything the helpers above may have set.
    clearText: function (el) {
      if (!el) return;
      el.style.removeProperty('color');
      el.style.removeProperty('text-shadow');
      el.style.removeProperty('animation');
      clearGradient(el);
    }
  };
})();
