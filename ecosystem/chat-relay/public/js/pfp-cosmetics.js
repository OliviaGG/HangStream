/* ============================================================
   pfp-cosmetics.js — THE single applier for profile_border +
   profile_glow, shared by every surface (portal, overlays, win
   cards, chat widget, and all games via top-player-cards).

   Replaces eight divergent copy-pasted appliers that each
   interpreted the same catalog payload differently.

   ── Rendering model ────────────────────────────────────────
   The ring is NOT a CSS border. It is a filled disc sitting
   behind an opaque avatar:

     shell   position:relative; box-sizing:border-box;
             border-radius:50%; padding:<ring>px;
             box-shadow:<outer glow + border glow, scaled>
       .pfpx-disc  position:absolute; inset:0; border-radius:50%;
                   background:<paint>;  z-index:0
       <avatar>    position:relative; z-index:1
                   (its own width/height:100% now resolves against
                    the padded content box, so it insets for free)

   Why a disc instead of `border: 4px solid transparent` plus a
   border-box-clipped conic gradient:
     - the ring is ONE property (`background`). The old form needed
       four coupled keys and silently degraded to an invisible gap
       whenever an applier copied only `border` — which is exactly
       what every game does today.
     - conic rotation runs as `transform: rotate()` on the disc, so
       it needs no `@property --cfx-a` registration. Works on OBS's
       older CEF, and composites on the GPU instead of repainting a
       gradient every frame.
     - the glow belongs to the outermost circle by construction, so
       "border shadow + glow shadow" stacking is structural rather
       than a convention each surface has to remember.

   ── Scaling ────────────────────────────────────────────────
   Catalog px values were authored against the ~96px portal hero
   avatar. Every px in `border` and `boxShadow` is rescaled by
   size/96 at apply time, so a 22px game card and a 130px win
   overlay show the same cosmetic at the same visual weight.
   No catalog migration — set items, donor items and generated
   cosmetics all come along for free.

   ── API ────────────────────────────────────────────────────
     PfpCosmetics.apply(avatarEl, shellEl, cos, opts)
        cos  = { profile_border: {...}, profile_glow: {...} }
        opts = { size, neutralizeBorder, observe }
     PfpCosmetics.clear(shellEl)
     PfpCosmetics.refresh(shellEl)      re-measure + re-apply

   Signature intentionally mirrors the old
   TopPlayerCards.applyAvatarCosmetics(avatarEl, wrapEl, cos)
   so the game shim is a one-liner.
   ============================================================ */
(function () {
  'use strict';
  if (window.PfpCosmetics) return;

  var DISC_CLASS = 'pfpx-disc';
  var REF_SIZE = 96;     // diameter the catalog was authored against
  var RING_FLOOR = 0.5;  // px — minimum before a ring stops resolving at all
  var RING_MAX_RATIO = 0.18; // never let a ring eat more than 18% of the radius

  // EVERY ring is the same weight, as a fraction of the avatar's diameter.
  // The catalog's per-item 3px/4px was never a deliberate design — it made
  // some tiers look chunky next to others for no reason, and at large avatar
  // sizes the 4px ones scaled up into something heavy. One ratio means a ring
  // reads identically on a 22px card and a 200px hero; only the PAINT differs
  // between tiers. Tune here and everywhere follows.
  var RING_RATIO = 0.032;   // 3.2% of diameter → ~3.1px at the 96px reference
  // With no ring to sit against, a full-width halo reads as detached from the
  // avatar. Pull it in so it hugs the edge instead.
  var GLOW_HUG_NO_RING = 0.7;

  // Per-shell bookkeeping so clear() can put back exactly what it found.
  var state = new WeakMap();

  /* ---------- css value helpers ---------- */

  // Scale every px length in a value by k. Colors and keywords untouched.
  function scalePx(str, k, floor) {
    return String(str).replace(/(-?\d*\.?\d+)px/g, function (_, n) {
      var v = parseFloat(n) * k;
      if (floor != null && v !== 0 && Math.abs(v) < floor) v = (v < 0 ? -1 : 1) * floor;
      return (Math.round(v * 100) / 100) + 'px';
    });
  }

  // "3px solid #cd7f32" -> 3
  function borderWidth(border) {
    var m = /(-?\d*\.?\d+)px/.exec(border || '');
    return m ? parseFloat(m[1]) : 0;
  }

  // "3px solid #cd7f32" -> "#cd7f32"   (transparent for the conic entries)
  function borderColor(border) {
    var m = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/.exec(border || '');
    return m ? m[1] : 'transparent';
  }

  // Drop the Houdini angle so the gradient becomes a plain paint we rotate.
  // 'conic-gradient(from var(--cfx-a, 0deg), #a, #b)' -> 'conic-gradient(#a, #b)'
  function staticConic(bg) {
    return String(bg).replace(/from\s+var\(\s*--cfx-a[^)]*\)\s*,\s*/i, '');
  }

  // Split a box-shadow list on top-level commas (rgba(...) contains commas),
  // separating outer shadows from inset ones. An inset shadow on the disc
  // would be hidden behind the avatar, so it moves to the avatar layer.
  function splitShadow(bs) {
    if (!bs) return { outer: '', inset: '' };
    var parts = [], depth = 0, cur = '', s = String(bs), i, ch;
    for (i = 0; i < s.length; i++) {
      ch = s.charAt(i);
      if (ch === '(') depth++;
      else if (ch === ')') depth--;
      else if (ch === ',' && depth === 0) { parts.push(cur); cur = ''; continue; }
      cur += ch;
    }
    if (cur.replace(/\s/g, '')) parts.push(cur);
    var outer = [], inset = [];
    for (i = 0; i < parts.length; i++) {
      (/inset/i.test(parts[i]) ? inset : outer).push(parts[i].trim());
    }
    return { outer: outer.join(', '), inset: inset.join(', ') };
  }

  // Catalog animations that drive a conic ring are named cfx-spin. On the disc
  // we rotate the element instead, which needs no registered custom property.
  function discAnimation(anim) {
    if (!anim) return '';
    if (!/cfx-spin/.test(anim)) return anim;   // legacy per-item keyframes pass through
    var m = /(\d*\.?\d+)s/.exec(anim);
    return 'pfpx-spin ' + (m ? m[1] : '4') + 's linear infinite';
  }

  /* ---------- dom ---------- */

  function getDisc(shell, create) {
    var d = shell.querySelector(':scope > .' + DISC_CLASS);
    if (!d && create) {
      d = document.createElement('span');
      d.className = DISC_CLASS;
      d.setAttribute('aria-hidden', 'true');
      shell.insertBefore(d, shell.firstChild);
    }
    return d;
  }

  // Remember the inline styles we are about to overwrite, once per shell.
  function snapshot(shell, avatarEl) {
    if (state.has(shell)) return state.get(shell);
    var st = {
      avatar: avatarEl || null,
      shell: {
        boxSizing: shell.style.boxSizing,
        padding: shell.style.padding,
        borderRadius: shell.style.borderRadius,
        boxShadow: shell.style.boxShadow,
        position: shell.style.position,
        animation: shell.style.animation,
        borderColor: shell.style.borderColor
      },
      av: avatarEl ? {
        position: avatarEl.style.position,
        zIndex: avatarEl.style.zIndex,
        boxShadow: avatarEl.style.boxShadow,
        borderColor: avatarEl.style.borderColor,
        top: avatarEl.style.top, left: avatarEl.style.left,
        right: avatarEl.style.right, bottom: avatarEl.style.bottom,
        // inline (host-free) mode paints the ring into the avatar itself
        border: avatarEl.style.border,
        backgroundImage: avatarEl.style.backgroundImage,
        backgroundOrigin: avatarEl.style.backgroundOrigin,
        backgroundClip: avatarEl.style.backgroundClip,
        animation: avatarEl.style.animation
      } : null,
      ro: null,
      mode: null,  // 'disc' | 'inline' — decided once from pristine geometry
      size: null   // pristine avatar diameter, cached for the same reason
    };
    state.set(shell, st);
    return st;
  }

  // Measure the shell's laid-out diameter. box-sizing is forced to border-box
  // BEFORE measuring so our own padding never feeds back into the measurement.
  function measure(shell, avatarEl, explicit) {
    if (explicit) return explicit;
    shell.style.boxSizing = 'border-box';
    var w = shell.offsetWidth || shell.offsetHeight;
    if (!w && avatarEl) w = avatarEl.offsetWidth || avatarEl.offsetHeight;
    return w || 0;
  }

  /* ---------- main ---------- */

  // Is `shell` actually safe to turn into the ring host?
  //
  // The disc model pads the shell and relies on the avatar filling the padded
  // content box. That only holds when the shell IS the avatar's box. Handed a
  // foreign container — Subtextle's `.av` (78px flex wrapper around a 68px img,
  // position:absolute inside a grid cell), or a non-square card like
  // WikiRecTangled's 67x108 `.player-card` — padding shifts a centred avatar
  // off-centre and, inside a grid, wrecks the layout. Fall back in that case.
  function shellIsUsable(shell, avatarEl, ring) {
    if (!shell || shell === avatarEl) return false;
    var w = shell.offsetWidth, h = shell.offsetHeight;
    if (!w || !h) return false;
    if (Math.abs(w - h) > 2) return false;                 // must be square
    if (!avatarEl) return true;
    var aw = avatarEl.offsetWidth, ah = avatarEl.offsetHeight;
    if (!aw || !ah) return false;
    // Must fill it — but tolerate a hairline gap. A 1px shell border puts the
    // avatar 2px short on a 41px shell (Subtextle's grid `.av`), which is NOT
    // the foreign-container case this check exists for (a 78px wrapper around
    // a 68px img). Reject only gaps that are both over a px and over a tenth
    // of the shell; the pad test below remains the decisive guard.
    var gapW = w - aw, gapH = h - ah;
    if ((gapW > 1 && gapW > w * 0.1) || (gapH > 1 && gapH > h * 0.1)) return false;

    // ...and must be SIZED BY it. Matching sizes are not enough: Subtextle's
    // `.user-pic` is a FIXED 153px inside a 153px wrap, so padding the wrap
    // does not inset the image — it just overflows the content box and covers
    // the disc unevenly, which is what put a ring over the whole avatar.
    // There is no reliable way to infer this, so measure: pad, look, restore.
    if (!ring) return true;
    var prevBox = shell.style.boxSizing, prevPad = shell.style.padding;
    shell.style.boxSizing = 'border-box';
    shell.style.padding = ring + 'px';
    var shrank = avatarEl.offsetWidth < aw - 0.5;
    shell.style.boxSizing = prevBox;
    shell.style.padding = prevPad;
    return shrank;
  }

  // One ring weight for every cosmetic, derived from the avatar's diameter.
  function ringWidthFor(size) {
    var w = size * RING_RATIO;
    if (w > 0 && w < RING_FLOOR) w = RING_FLOOR;
    var cap = size * RING_MAX_RATIO;
    if (w > cap) w = cap;
    return Math.round(w * 100) / 100;
  }

  // Host-free ring: paint the conic straight into the avatar's own border box.
  // This is the ORIGINAL catalog form done correctly — the games' bug was
  // copying `border` while dropping the three background keys, which rendered
  // `4px solid transparent` as an invisible gap. No container is touched.
  // OUTSET DISC — the ring for hosts we cannot pad.
  //
  // Replaces a CSS border, which had two failings:
  //  1. border-width snaps to whole device pixels, so a 27px and a 34px avatar
  //     both rendered 0.8px — the ring looked THICKER on the smaller avatar.
  //     A disc is sized with width/height, which honour fractional px, so the
  //     ratio holds at every size.
  //  2. `background-clip: border-box` paints the conic behind the image too,
  //     so a pfp that had not loaded showed a filled circle instead of a ring.
  //     A disc sits BEHIND the avatar and is covered by it.
  //
  // The shell is only made a positioning context — its box is never touched.
  function applyRingOutset(shell, avatarEl, border, size) {
    if (!avatarEl || !shell) return 0;
    // Measure the avatar LIVE, every time. The cached size exists to stop a
    // feedback loop in padding mode (padding shrinks the avatar, which would
    // shrink the next ring). An outset disc is absolutely positioned and never
    // changes the avatar's box, so there is no loop — and caching actively
    // breaks it: these avatars resize (the current guess grows and shrinks),
    // leaving a disc sized for 153px wrapped around a 126px pfp, a 14.6% ring.
    var live = avatarEl.offsetWidth || size;
    var w = ringWidthFor(live);
    if (!w) return 0;
    if (getComputedStyle(shell).position === 'static') shell.style.position = 'relative';
    var disc = getDisc(shell, true);
    // Ring WIDTH comes from the design size, but the disc must wrap the
    // AVATAR's real box — on a host larger than its avatar those differ, and
    // sizing off the host left the ring offset from the pfp.
    var aw = live, ah = avatarEl.offsetHeight || live;
    disc.style.width = (aw + 2 * w) + 'px';
    disc.style.height = (ah + 2 * w) + 'px';
    disc.style.left = (avatarEl.offsetLeft - w) + 'px';
    disc.style.top = (avatarEl.offsetTop - w) + 'px';
    disc.style.right = disc.style.bottom = 'auto';
    disc.style.background = border.backgroundImage
      ? staticConic(border.backgroundImage)
      : borderColor(border.border);
    var da = discAnimation(border.animation);
    disc.style.animation = da || '';
    disc.style.display = '';
    if (getComputedStyle(avatarEl).position === 'static') avatarEl.style.position = 'relative';
    avatarEl.style.zIndex = '1';
    return w;
  }

  function applyRingInline(avatarEl, border, k, size) {
    if (!avatarEl) return 0;
    var w = ringWidthFor(size);
    if (!w) return 0;
    // uniform width, catalog colour (transparent for the conic entries)
    avatarEl.style.border = w + 'px solid ' + borderColor(border.border);
    if (border.backgroundImage) {
      avatarEl.style.backgroundImage = border.backgroundImage;
      avatarEl.style.backgroundOrigin = border.backgroundOrigin || 'border-box';
      avatarEl.style.backgroundClip = border.backgroundClip || 'border-box';
      if (border.animation) avatarEl.style.animation = border.animation;
    } else {
      avatarEl.style.removeProperty('background-image');
      avatarEl.style.removeProperty('background-origin');
      avatarEl.style.removeProperty('background-clip');
      if (border.animation) avatarEl.style.animation = border.animation;
    }
    return w;
  }

  // Re-dress when the avatar or its host changes size. Subtextle sizes its
  // guess bubbles by rank and animates them AFTER the first dress, so without
  // this every disc keeps the size it was first measured at — which is how a
  // 126px pfp ended up wearing a disc built for a 153px one (a 14.6% ring).
  function observeSize(shell, avatarEl, st, size) {
    if (st.ro || !window.ResizeObserver) return;
    var lastW = size, lastA = (avatarEl && avatarEl.offsetWidth) || 0;
    st.ro = new ResizeObserver(function () {
      var w = shell.offsetWidth;
      var a = (st.last && st.last.avatarEl && st.last.avatarEl.offsetWidth) || 0;
      if (a && Math.abs(a - lastA) > 0.5) { lastA = a; st.size = a; }
      else if (!w || w === lastW) return;
      lastW = w;
      if (st.last) apply(st.last.avatarEl, shell, st.last.cos, st.last.opts);
    });
    try { st.ro.observe(shell); } catch (e) {}
    if (avatarEl) { try { st.ro.observe(avatarEl); } catch (e) {} }
  }

  function apply(avatarEl, shellEl, cos, opts) {
    var shell = shellEl || avatarEl;
    if (!shell || !cos) return;
    opts = opts || {};

    var border = cos.profile_border || null;
    var glow = cos.profile_glow || null;

    // Nothing equipped — make sure any previous ring is gone.
    if (!border && !glow) { clear(shell); return; }

    var st = snapshot(shell, avatarEl);
    st.last = { cos: cos, opts: opts, avatarEl: avatarEl };

    // Ring geometry follows the avatar's ACTUAL rendered diameter, not a
    // caller-supplied hint: Subtextle's grid passes a flat `avatarSize: 24`
    // for avatars that really render at 63 / 41 / 39px, so a hint-derived ring
    // came out a different fraction of each one. Measured once and cached for
    // the same reason the mode is — disc mode pads the shell, which shrinks
    // the avatar, so re-measuring every apply would ratchet the ring down.
    // A measured 0 is NOT a cacheable result: while the element has no layout
    // we must re-measure on every entry. Caching 0 (st.size === 0, not null)
    // was the stuck-forever bug — the rAF retry below re-entered apply(), saw
    // a non-null st.size and never measured again, so anything FIRST applied
    // before layout (Subtextle's ticker builds chips before appendChild) stayed
    // undressed permanently, and later re-applies hit the same cached 0.
    if (!st.size) {
      // Cache only a MEASURED size. The hint is a per-call paint fallback,
      // never a cache entry: the grid dresses cells with `avatarSize: 24`
      // while they are still detached, and a cached 24 made every later ring
      // a fraction of 24px instead of the real 39-41px avatar.
      st.size = shell.offsetWidth || (avatarEl && avatarEl.offsetWidth) || 0;
    }
    var size = st.size || opts.size || 0;
    // The MODE also needs real layout: shellIsUsable reads offset geometry, so
    // a first apply on a detached shell (the grid's cells, dressed with a
    // size hint before appendChild) would see zeroes and cache a bogus
    // 'inline' forever — every cell kept a mis-sized outset ring. Defer the
    // decision exactly like the zero-size case. Host-free applies
    // (shell === avatarEl) and forced-inline callers need no shell geometry.
    var modeUnready = st.mode == null && opts.inline !== true &&
      shell !== avatarEl && !shell.offsetWidth;
    if (!size || modeUnready) {
      // Not laid out yet (hidden tab / modal not open / element not attached).
      // Retry next frame rather than baking in a wrong scale — but stop if the
      // element is gone for good, and cap zero-layout polls: a permanently
      // hidden node (Subtextle grid tiers 6-9 keep .av at display:none) would
      // otherwise burn a rAF callback every frame forever. A later real
      // apply() call restarts the process, so visible-later surfaces still
      // dress on their next render event.
      if (!st.pending) {
        st.pending = true;
        requestAnimationFrame(function () {
          st.pending = false;
          if (!shell.isConnected) { state.delete(shell); return; }
          st.zeroFrames = (st.zeroFrames || 0) + 1;
          if (st.zeroFrames > 300) return;
          if (state.has(shell) && st.last) apply(st.last.avatarEl, shell, st.last.cos, st.last.opts);
        });
      }
      return;
    }
    st.zeroFrames = 0;

    var k = size / REF_SIZE;

    /* --- pick a rendering strategy ---
       Disc mode needs a shell that IS the avatar's box. Anywhere else, paint
       the ring into the avatar's own border box instead and touch nothing
       around it. Both paths produce the same ring; only the host differs.

       DECIDED ONCE, then remembered. Disc mode pads the shell, which insets
       the avatar — so re-measuring on a later apply (refresh, re-render,
       ResizeObserver) would see the avatar no longer filling the shell and
       flip to inline, orphaning the disc and drawing a second ring. The mode
       must come from the PRISTINE geometry, so it is cached on the shell's
       state and only recomputed after a clear(). */
    if (st.mode == null) {
      st.mode = (opts.inline === true || !shellIsUsable(shell, avatarEl, ringWidthFor(size)))
        ? 'inline' : 'disc';
    }
    var discMode = st.mode === 'disc';
    if (!discMode) {
      st.inline = true;
      var iRing = border && border.border
        ? applyRingOutset(shell, avatarEl, border, size)
        : 0;
      if (!iRing) {
        var deadDisc = getDisc(shell, false);
        if (deadDisc) deadDisc.style.display = 'none';
      }
      // The host's own decorative border must be REMOVED, not just made
      // transparent. The disc sits behind the avatar, so a transparent border
      // simply reveals more disc: Subtextle's 4px `.user-pic` border turned a
      // 5px ring into a 9px one, varying per surface because each defines its
      // own width, and eating 8px of the photo. Geometry, not just colour.
      if (avatarEl && opts.neutralizeBorder !== false && iRing) {
        avatarEl.style.border = '0';
      }
      // glow still belongs on the avatar itself here
      var iHug = iRing ? 1 : GLOW_HUG_NO_RING;
      var iOuter = [], iInset = [];
      if (glow && glow.boxShadow) {
        var igs = splitShadow(glow.boxShadow);
        if (igs.outer) iOuter.push(scalePx(igs.outer, k * iHug));
        if (igs.inset) iInset.push(scalePx(igs.inset, k * iHug));
      }
      if (avatarEl) {
        avatarEl.style.setProperty('--pfpx-k', String(Math.round(k * iHug * 1000) / 1000));
        avatarEl.style.boxShadow = iOuter.concat(iInset).join(', ');
        if (glow && glow.animation && !avatarEl.style.animation) {
          avatarEl.style.animation = glow.animation;
        }
      }
      if (opts.observe !== false) observeSize(shell, avatarEl, st, size);
      return;
    }

    /* --- ring geometry --- */
    var ring = (border && border.border) ? ringWidthFor(size) : 0;

    /* --- shell --- */
    if (getComputedStyle(shell).position === 'static') shell.style.position = 'relative';
    shell.style.boxSizing = 'border-box';
    shell.style.borderRadius = '50%';
    shell.style.padding = ring ? ring + 'px' : '';
    // Ten legacy keyframes animate box-shadow, and an ACTIVE ANIMATION'S
    // computed value beats the inline box-shadow we set below — so without
    // this the rescale would have no effect on any animated glow. Those
    // keyframes multiply their lengths by --pfpx-k (see cosmetics-fx.css);
    // it inherits down to the disc and avatar layers. The no-ring hug is
    // folded in here too, so an animated glow hugs exactly like a static one.
    var kEff = k * (ring ? 1 : GLOW_HUG_NO_RING);
    shell.style.setProperty('--pfpx-k', String(Math.round(kEff * 1000) / 1000));

    // A decorative border already on the wrap would read as a stray second
    // ring next to the cosmetic one. Hide it (keeping its geometry) while a
    // cosmetic ring is active; clear() puts the color back.
    if (opts.neutralizeBorder !== false && ring) shell.style.borderColor = 'transparent';

    /* --- disc (the ring itself) --- */
    var disc = getDisc(shell, !!ring);
    if (disc) {
      if (ring) {
        disc.style.background = border.backgroundImage
          ? staticConic(border.backgroundImage)
          : borderColor(border.border);
        var da = discAnimation(border.animation);
        disc.style.animation = da || '';
        disc.style.display = '';
      } else {
        disc.style.display = 'none';
      }
    }

    /* --- avatar sits above the disc --- */
    if (avatarEl) {
      var avPos = getComputedStyle(avatarEl).position;
      if (avPos === 'static') avatarEl.style.position = 'relative';
      avatarEl.style.zIndex = '1';
      // If the surface positions the avatar absolutely, padding won't inset it
      // — do it explicitly so the ring is visible either way.
      if (avPos === 'absolute' && ring) {
        avatarEl.style.top = avatarEl.style.left =
        avatarEl.style.right = avatarEl.style.bottom = ring + 'px';
      }
      // The avatar's own decorative border must be REMOVED, not just made
      // transparent — same geometry rule as the outset path. A transparent
      // border keeps its WIDTH, leaving a window between the photo and the
      // shell's pad edge where the disc shows through: on RecTangled's
      // 2px-bordered .tp-avatar the 0.9px ring read as a ~3px muddy band
      // (worst with the multi-colour SF/DC conics — "the cosmetics are very
      // blurry"). Zeroing the width lets the photo fill to the pad edge so
      // the visible ring is exactly the ring.
      if (opts.neutralizeBorder !== false && ring) avatarEl.style.border = '0';
    }

    /* --- shadows ---
       A BORDER CONTRIBUTES NO SHADOW AT ALL — outer or inset. It sets the
       ring paint and nothing else. Many catalog borders ship their own
       boxShadow, but glowing is profile_glow's job; rendering both made an
       equipped border read as a half-strength glow and blurred the line
       between the two categories.

       With no ring present the glow is pulled in so it hugs the pfp edge
       rather than floating off it. */
    var hug = ring ? 1 : GLOW_HUG_NO_RING;
    var outer = [], inset = [];
    if (glow && glow.boxShadow) {
      var gs = splitShadow(glow.boxShadow);
      if (gs.outer) outer.push(scalePx(gs.outer, k * hug));
      if (gs.inset) inset.push(scalePx(gs.inset, k * hug));
    }
    shell.style.boxShadow = outer.length ? outer.join(', ') : '';
    if (avatarEl) avatarEl.style.boxShadow = inset.length ? inset.join(', ') : '';

    // Glow animations (pulse/aura) keyframe box-shadow, so they belong on the
    // element carrying the glow. A ring animation never lands here — it is on
    // the disc — so the two can run independently.
    if (glow && glow.animation) shell.style.animation = glow.animation;
    else if (!glow) shell.style.animation = st.shell.animation || '';

    if (opts.observe !== false) observeSize(shell, avatarEl, st, size);
  }

  function clear(shell) {
    if (!shell) return;
    var st = state.get(shell);
    var disc = shell.querySelector(':scope > .' + DISC_CLASS);
    if (disc) disc.parentNode.removeChild(disc);
    if (!st) return;

    if (st.ro) { try { st.ro.disconnect(); } catch (e) {} st.ro = null; }

    shell.style.removeProperty('--pfpx-k');
    var s = st.shell;
    shell.style.boxSizing = s.boxSizing;
    shell.style.padding = s.padding;
    shell.style.borderRadius = s.borderRadius;
    shell.style.boxShadow = s.boxShadow;
    shell.style.position = s.position;
    shell.style.animation = s.animation;
    shell.style.borderColor = s.borderColor;

    if (st.avatar && st.av) {
      var a = st.av, el = st.avatar;
      el.style.position = a.position;
      el.style.zIndex = a.zIndex;
      el.style.boxShadow = a.boxShadow;
      el.style.borderColor = a.borderColor;
      el.style.top = a.top; el.style.left = a.left;
      el.style.right = a.right; el.style.bottom = a.bottom;
      el.style.border = a.border;
      el.style.backgroundImage = a.backgroundImage;
      el.style.backgroundOrigin = a.backgroundOrigin;
      el.style.backgroundClip = a.backgroundClip;
      el.style.animation = a.animation;
      el.style.removeProperty('--pfpx-k');
    }
    state.delete(shell);
  }

  function refresh(shell) {
    var st = shell && state.get(shell);
    if (st && st.last) apply(st.last.avatarEl, shell, st.last.cos, st.last.opts);
  }

  /* ================================================================
     The other seven categories.

     These live here rather than in each game so that "the same cosmetic
     looks the same everywhere" holds for names, titles, badges and words
     too — not just the avatar ring. Before this, five of the eight game
     appliers rendered no word cosmetics at all, three rendered no hero
     badge, and each had its own idea of how a gradient material works.
     ================================================================ */

  var GRAD_KEYS = ['background-image', 'background-size', '-webkit-background-clip',
                   'background-clip', '-webkit-text-fill-color'];

  function clearGradient(el) {
    for (var i = 0; i < GRAD_KEYS.length; i++) el.style.removeProperty(GRAD_KEYS[i]);
  }

  // Paint a text cosmetic. Handles the rare+ gradient materials, which are
  // NOT a colour — they are a background clipped to the glyphs with the fill
  // made transparent, so setting `color` alone renders nothing.
  function paintText(el, css, opts) {
    if (!el) return;
    css = css || {};
    opts = opts || {};
    if (opts.color !== false && css.color) el.style.color = css.color;
    if (opts.shadow !== false && css.textShadow) el.style.textShadow = css.textShadow;
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
  }

  function applyName(nameEl, cos, opts) {
    if (!nameEl || !cos) return;
    opts = opts || {};
    if (cos.name_color) paintText(nameEl, cos.name_color, { shadow: false });
    if (cos.name_glow) {
      if (cos.name_glow.textShadow) nameEl.style.textShadow = cos.name_glow.textShadow;
      if (cos.name_glow.animation && !nameEl.style.animation) {
        nameEl.style.animation = cos.name_glow.animation;
      }
    }
  }

  function applyTitle(titleEl, cos) {
    if (!titleEl || !cos || !cos.title) return;
    var css = cos.title;
    if (css.titleColor) titleEl.style.color = css.titleColor;
    if (css.titleGlow) titleEl.style.textShadow = css.titleGlow;
    if (css.titleBackground) {
      titleEl.style.backgroundImage = css.titleBackground;
      titleEl.style.backgroundSize = '220% auto';
      titleEl.style.webkitBackgroundClip = 'text';
      titleEl.style.backgroundClip = 'text';
      titleEl.style.webkitTextFillColor = 'transparent';
    } else {
      clearGradient(titleEl);
    }
    var anim = css.titleAnimation || css.animation;
    if (anim) titleEl.style.animation = anim;
  }

  function applyHeroBadge(el, cos) {
    if (!el || !cos || !cos.hero_badge) return;
    var hb = cos.hero_badge;
    if (!hb.background) return;
    el.style.background = hb.background;
    if (hb.backgroundSize) el.style.backgroundSize = hb.backgroundSize;
    if (hb.animation) el.style.animation = hb.animation;
    el.classList.add('has-hero-badge');
  }

  /* ---------------- word cosmetics: a SPAWN effect ----------------
     word_color / word_glow used to be a permanent tint, which left every
     entry in a guess list wearing the finder's colour forever. They are
     now transient: the word lands wearing the cosmetic, holds briefly so
     you can see whose it was, then settles to the list's normal colour.

     Implemented as a throwaway OVERLAY rather than by styling the element
     and animating back, because the rare+ materials are gradients clipped
     to the glyphs — `color` does not transition to or from those, and any
     half-cleaned gradient leaves the word invisible (transparent fill).
     Fading a copy is uniform across solid colours, gradients, glows and
     animations, and is guaranteed to leave nothing behind. */

  var WORD_LAYER = 'cfx-word-spawn';
  var WORD_HOLD_MS = 500;
  var WORD_FADE_MS = 600;

  function spawnWord(wordEl, cos, opts) {
    if (!wordEl || !cos) return;
    opts = opts || {};
    var wc = cos.word_color, wg = cos.word_glow;
    if (!wc && !wg) return;

    var hold = opts.hold != null ? opts.hold : WORD_HOLD_MS;
    var fade = opts.fade != null ? opts.fade : WORD_FADE_MS;

    // Restart cleanly if the same element spawns again.
    // Critically, RESTORE the baseline before re-capturing: otherwise a second
    // spawn snapshots the first one's cosmetic colour as "the list default"
    // and the word reverts to the cosmetic instead of back to white.
    if (wordEl._pfpxT1) clearTimeout(wordEl._pfpxT1);
    if (wordEl._pfpxT2) clearTimeout(wordEl._pfpxT2);
    wordEl._pfpxT1 = wordEl._pfpxT2 = null;
    if (wordEl._pfpxPrev) {
      var p0 = wordEl._pfpxPrev;
      clearGradient(wordEl);
      wordEl.style.transition = 'none';
      wordEl.style.color = p0.color || '';
      wordEl.style.textShadow = p0.textShadow || '';
      wordEl.style.animation = p0.animation || '';
      wordEl._pfpxPrev = null;
    }
    // drop any overlay left by the previous (overlay-based) implementation
    var stale = wordEl.querySelector && wordEl.querySelector('.' + WORD_LAYER);
    if (stale && stale.parentNode) stale.parentNode.removeChild(stale);

    // Remember only what we are about to touch, so the revert is exact and the
    // element goes back to the list's own colour rather than a guessed one.
    if (!wordEl._pfpxPrev) {
      wordEl._pfpxPrev = {
        color: wordEl.style.color,
        textShadow: wordEl.style.textShadow,
        animation: wordEl.style.animation,
        transition: wordEl.style.transition,
        backgroundImage: wordEl.style.backgroundImage,
        backgroundSize: wordEl.style.backgroundSize,
        webkitBackgroundClip: wordEl.style.webkitBackgroundClip,
        backgroundClip: wordEl.style.backgroundClip,
        webkitTextFillColor: wordEl.style.webkitTextFillColor
      };
    }
    var prev = wordEl._pfpxPrev;

    // Paint the cosmetic ONTO the word — it replaces the default colour rather
    // than floating a copy over it. An absolutely-positioned overlay could not
    // be aligned reliably: these rows are flex containers that centre their
    // text, with optional leading elements (a bumper pic), so a copy pinned to
    // the host's top-left landed off-centre and read as a second, ghost word.
    wordEl.style.transition = 'none';
    if (wc) paintText(wordEl, wc);
    if (wg) {
      if (wg.textShadow) {
        wordEl.style.textShadow = wc && wc.textShadow
          ? wc.textShadow + ', ' + wg.textShadow
          : wg.textShadow;
      }
      if (wg.animation && !wordEl.style.animation) wordEl.style.animation = wg.animation;
    }

    wordEl._pfpxT1 = setTimeout(function () {
      // A gradient material cannot animate back to a flat colour, so drop the
      // gradient first — the element falls to the cosmetic's own solid colour —
      // then transition THAT to the list default.
      clearGradient(wordEl);
      wordEl.style.transition = 'color ' + fade + 'ms ease-out, text-shadow ' + fade + 'ms ease-out';
      // force the transition to start from the current painted values
      void wordEl.offsetWidth;
      wordEl.style.color = prev.color || '';
      wordEl.style.textShadow = prev.textShadow || '';

      wordEl._pfpxT2 = setTimeout(function () {
        wordEl.style.animation = prev.animation || '';
        wordEl.style.transition = prev.transition || '';
        wordEl.style.color = prev.color || '';
        wordEl.style.textShadow = prev.textShadow || '';
        wordEl._pfpxPrev = null;
        wordEl._pfpxT1 = wordEl._pfpxT2 = null;
      }, fade + 60);
    }, hold);

    return wordEl;
  }

  /* One call that dresses a whole player row/card identically everywhere.
     els: { avatarEl, shellEl, nameEl, titleEl, badgeEl, wordEl }
     Any element you omit is simply skipped. */
  function applyAll(els, cos, opts) {
    if (!els || !cos) return;
    opts = opts || {};
    if (els.avatarEl || els.shellEl) {
      apply(els.avatarEl, els.shellEl || els.avatarEl, cos, opts.pfp || {});
    }
    if (els.nameEl) applyName(els.nameEl, cos, opts);
    if (els.titleEl) applyTitle(els.titleEl, cos);
    if (els.badgeEl) applyHeroBadge(els.badgeEl, cos);
    if (els.wordEl) spawnWord(els.wordEl, cos, opts.word || {});
  }

  window.PfpCosmetics = {
    // avatar ring + glow
    apply: apply,
    clear: clear,
    refresh: refresh,
    // the other categories
    applyName: applyName,
    applyTitle: applyTitle,
    applyHeroBadge: applyHeroBadge,
    spawnWord: spawnWord,
    applyAll: applyAll,
    // exposed for the comparison harness / tests
    _internals: {
      scalePx: scalePx, splitShadow: splitShadow, staticConic: staticConic,
      borderWidth: borderWidth, borderColor: borderColor, discAnimation: discAnimation,
      paintText: paintText,
      REF_SIZE: REF_SIZE, RING_FLOOR: RING_FLOOR,
      GLOW_HUG_NO_RING: GLOW_HUG_NO_RING,
      WORD_HOLD_MS: WORD_HOLD_MS, WORD_FADE_MS: WORD_FADE_MS, WORD_LAYER: WORD_LAYER
    }
  };
})();
