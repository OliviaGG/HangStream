/**
 * camera.js — isometric projection + touch camera (pan / pinch / tap) + tweened flights.
 * Exports: window.TyCam
 */
(function () {
  'use strict';

  // Isometric tile size in world-screen units at scale 1
  const TILE_W = 64, TILE_H = 32;

  // world (tile coords, fractional ok) → iso plane units
  function isoX(wx, wy) { return (wx - wy) * (TILE_W / 2); }
  function isoY(wx, wy) { return (wx + wy) * (TILE_H / 2); }
  // inverse: iso plane units → world tile coords
  function worldFromIso(ix, iy) {
    const a = ix / (TILE_W / 2), b = iy / (TILE_H / 2);
    return { wx: (a + b) / 2, wy: (b - a) / 2 };
  }

  const cam = {
    // center of viewport in iso plane units
    x: 0, y: 0, scale: 1,
    min: 0.06, max: 2.6,
    vw: 0, vh: 0, dpr: 1,
    dirty: true,
    // tween target (null = free)
    tween: null
  };

  function screenToIso(sx, sy) {
    return { ix: (sx - cam.vw / 2) / cam.scale + cam.x, iy: (sy - cam.vh / 2) / cam.scale + cam.y };
  }
  function screenToWorld(sx, sy) {
    const p = screenToIso(sx, sy);
    return worldFromIso(p.ix, p.iy);
  }
  function applyTransform(ctx) {
    ctx.setTransform(cam.scale * cam.dpr, 0, 0, cam.scale * cam.dpr,
      (cam.vw / 2 - cam.x * cam.scale) * cam.dpr,
      (cam.vh / 2 - cam.y * cam.scale) * cam.dpr);
  }

  /** Fly camera so the iso-space rect fits with padding; d = ms */
  function flyToRect(ix0, iy0, ix1, iy1, opts) {
    const pad = (opts && opts.pad) || 60;
    const dur = (opts && opts.dur) || 650;
    const w = ix1 - ix0, h = iy1 - iy0;
    const sx = (cam.vw - pad * 2) / Math.max(1, w);
    const sy = (cam.vh - pad * 2) / Math.max(1, h);
    const scale = Math.max(cam.min, Math.min(cam.max, Math.min(sx, sy)));
    startTween({ x: ix0 + w / 2, y: iy0 + h / 2 + ((opts && opts.yBias) || 0), scale }, dur);
  }

  function startTween(target, dur) {
    cam.tween = {
      t0: performance.now(), dur: dur || 600,
      from: { x: cam.x, y: cam.y, scale: cam.scale },
      to: target
    };
  }
  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function tick() {
    if (!cam.tween) return false;
    const tw = cam.tween;
    let t = (performance.now() - tw.t0) / tw.dur;
    if (t >= 1) { t = 1; }
    const k = easeInOut(t);
    // zoom-interpolate in log space so the flight feels even
    cam.scale = Math.exp(Math.log(tw.from.scale) + (Math.log(tw.to.scale) - Math.log(tw.from.scale)) * k);
    cam.x = tw.from.x + (tw.to.x - tw.from.x) * k;
    cam.y = tw.from.y + (tw.to.y - tw.from.y) * k;
    if (t === 1) cam.tween = null;
    cam.dirty = true;
    return true;
  }

  // ── Input ──────────────────────────────────────────────────────────────────
  // callbacks: onTap(sx, sy), onLongPress(sx, sy), onMoveStart(),
  //            onDragStart(sx, sy) → truthy to claim the drag (camera stops panning),
  //            onDragMove(sx, sy), onDragEnd(sx, sy)
  function bindInput(canvas, cb) {
    const pts = new Map(); // pointerId → {x, y}
    let moved = false, startDist = 0, startScale = 1, downAt = 0, downPt = null;
    let dragging = false; // consumer (edit mode) owns this gesture

    canvas.addEventListener('pointerdown', (e) => {
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        moved = false; dragging = false;
        downAt = performance.now(); downPt = { x: e.clientX, y: e.clientY };
        if (cb.onDragStart && cb.onDragStart(e.clientX, e.clientY)) {
          dragging = true; cam.tween = null;
        }
      }
      if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        startDist = Math.hypot(a.x - b.x, a.y - b.y);
        startScale = cam.scale;
      }
    });

    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return;
      const prev = pts.get(e.pointerId);
      const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pts.size === 1) {
        if (dragging) {
          if (cb.onDragMove) cb.onDragMove(e.clientX, e.clientY);
          cam.dirty = true;
          return;
        }
        if (!moved && downPt && Math.hypot(e.clientX - downPt.x, e.clientY - downPt.y) > 12) {
          moved = true; cam.tween = null;
          if (cb.onMoveStart) cb.onMoveStart();
        }
        if (moved) {
          cam.x -= dx / cam.scale;
          cam.y -= dy / cam.scale;
          cam.dirty = true;
        }
      } else if (pts.size === 2) {
        cam.tween = null; moved = true;
        const [a, b] = [...pts.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const before = screenToIso(mid.x, mid.y);
        cam.scale = Math.max(cam.min, Math.min(cam.max, startScale * (dist / Math.max(1, startDist))));
        const after = screenToIso(mid.x, mid.y);
        cam.x += before.ix - after.ix;
        cam.y += before.iy - after.iy;
        cam.dirty = true;
      }
    });

    function up(e) {
      if (!pts.has(e.pointerId)) return;
      pts.delete(e.pointerId);
      if (pts.size === 0 && dragging) {
        if (cb.onDragEnd) cb.onDragEnd(e.clientX, e.clientY);
        dragging = false; downPt = null;
        return;
      }
      if (pts.size === 0 && !moved && downPt) {
        const held = performance.now() - downAt;
        if (held > 450 && cb.onLongPress) cb.onLongPress(downPt.x, downPt.y);
        else if (cb.onTap) cb.onTap(downPt.x, downPt.y);
      }
      if (pts.size === 0) downPt = null;
    }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    // trackpad / wheel zoom (desktop uses the same mobile layout, zoom still works)
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      cam.tween = null;
      const before = screenToIso(e.clientX, e.clientY);
      cam.scale = Math.max(cam.min, Math.min(cam.max, cam.scale * Math.exp(-e.deltaY * 0.0016)));
      const after = screenToIso(e.clientX, e.clientY);
      cam.x += before.ix - after.ix;
      cam.y += before.iy - after.iy;
      cam.dirty = true;
      if (cb.onMoveStart) cb.onMoveStart();
    }, { passive: false });
  }

  window.TyCam = { TILE_W, TILE_H, cam, isoX, isoY, worldFromIso, screenToIso, screenToWorld, applyTransform, flyToRect, startTween, tick, bindInput };
})();
