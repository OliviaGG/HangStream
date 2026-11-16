/**
 * main.js — boot, view state machine (town / city / visiting / edit), render loop.
 */
(function () {
  'use strict';

  const Cam = window.TyCam, cam = Cam.cam;
  const Data = window.TyData, World = window.TyWorld, UI = window.TyUI;
  const $ = (id) => document.getElementById(id);

  const canvas = $('game');
  const ctx = canvas.getContext('2d');

  // view: 'town' (my plot), 'city' (zoomed out), 'visit' (someone else's plot)
  let view = 'town';
  let visitingPlot = null;
  let edit = null; // { plot, sel, selOk, drag, snapshot }
  let hudCoins = 0, hudIncome = 0;

  // ── Canvas sizing ──────────────────────────────────────────────────────────
  function resize() {
    cam.dpr = Math.min(2.5, window.devicePixelRatio || 1);
    cam.vw = window.innerWidth;
    cam.vh = window.innerHeight;
    canvas.width = Math.round(cam.vw * cam.dpr);
    canvas.height = Math.round(cam.vh * cam.dpr);
    cam.dirty = true;
  }
  window.addEventListener('resize', resize);
  resize();

  // ── Camera flights ─────────────────────────────────────────────────────────
  function flyToPlot(plot, dur) {
    const r = World.plotIsoRect(plot);
    Cam.flyToRect(r.x0, r.y0, r.x1, r.y1, { pad: Math.min(60, cam.vw * 0.1), dur: dur || 700 });
  }
  function flyToCity(dur) {
    const r = World.worldIsoRect();
    Cam.flyToRect(r.x0, r.y0, r.x1, r.y1, { pad: 30, dur: dur || 800 });
  }
  function goHome(dur) {
    const home = World.model.myPlot;
    if (!home) { UI.toast('Log in and open a business to claim a town'); return; }
    setView('town');
    flyToPlot(home, dur || 700);
  }

  function setView(v, plot) {
    view = v;
    visitingPlot = v === 'visit' ? plot : null;
    $('visit-banner').classList.toggle('hidden', v !== 'visit');
    if (v === 'visit' && plot) {
      $('visit-name').textContent = 'Visiting ' + (plot.player.displayName || '???');
    }
    $('nav-world').querySelector('.nav-lbl').textContent = v === 'city' ? 'My Town' : 'City';
    $('nav-world').querySelector('.nav-ico').textContent = v === 'city' ? '🏠' : '🌆';
  }

  // ── Manage sheet flow ──────────────────────────────────────────────────────
  function cardFor(type) {
    const ov = Data.getOverview();
    return ov?.businesses?.find(c => c.businessType === type) || null;
  }

  function renderManage(type, detail) {
    const card = cardFor(type);
    const b = World.model.myPlot?.buildings.find(x => x.type === type) || { type, level: card?.level || 0 };
    UI.showBusiness(b, { isMine: true, card, detail, managers: Data.getManagersData() });
  }

  /** Open the manage sheet for one of MY businesses; fetches the upgrade catalog. */
  async function openManage(type) {
    renderManage(type, null); // instant open, upgrades fill in when loaded
    if (cardFor(type)?.owned && Data.BIZ[type]?.managed) {
      const detail = await Data.fetchBizDetail(type);
      // only re-render if the sheet is still open (user may have closed it)
      if (UI.isSheetOpen()) renderManage(type, detail);
    }
  }

  UI.setActionHandler(async (type, act, upgradeType) => {
    let res;
    if (act === 'buy') {
      res = await Data.buyBusiness(type);
    } else if (act === 'hire-manager') {
      res = await Data.hireManager(type);
    } else {
      const body = {};
      if (act === 'upgrade' || act === 'upgrade-max') {
        if (!upgradeType) { UI.toast('Pick an upgrade'); return; }
        body.upgradeType = upgradeType;
      }
      res = await Data.bizAction(type, act, body);
    }
    if (res && res.ok !== false) {
      UI.toast(res?.message || { collect: 'Collected! 💰', buy: 'Business opened! 🎉', 'hire-manager': 'Manager hired! 🧑‍💼' }[act] || 'Upgraded! ⬆️');
    } else {
      UI.toast(res?.message || res?.error || 'That didn\'t work — try again');
    }
    // refresh silently in the background, then update the sheet IN PLACE —
    // no loading flash, no scroll jump
    const wantDetail = cardFor(type)?.owned && Data.BIZ[type]?.managed;
    const [detail] = await Promise.all([
      wantDetail ? Data.fetchBizDetail(type) : Promise.resolve(null),
      Data.fetchOverview(),
      act === 'hire-manager' || act === 'buy' ? Data.fetchManagers() : Promise.resolve(null)
    ]);
    syncMineFromOverview();
    if (UI.isSheetOpen()) renderManage(type, detail);
  });

  /** Sync my plot + HUD from the already-fetched overview (no network). */
  function syncMineFromOverview() {
    const ov = Data.getOverview();
    if (ov && World.model.myPlot) {
      const me = World.model.myPlot.player;
      me.businesses = (ov.businesses || []).filter(c => c.owned).map(c => ({ type: c.businessType, level: c.level }));
      World.relayout(World.model.myPlot);
      hudCoins = Number(ov.coins) || hudCoins;
      hudIncome = Number(ov.totalIncomePerSecond) || hudIncome;
      UI.setHud(null, hudCoins, hudIncome);
    }
    cam.dirty = true;
  }

  // ── Edit mode (drag buildings around your plot) ────────────────────────────
  function enterEdit() {
    const plot = World.model.myPlot;
    if (!plot) { UI.toast('Log in and open a business first'); return; }
    UI.closeSheet();
    edit = {
      plot, sel: null, selOk: true, drag: null,
      snapshot: plot.buildings.map(b => ({ type: b.type, x: b.x, y: b.y }))
    };
    setView('town');
    flyToPlot(plot, 500);
    $('nav').classList.add('hidden');
    $('edit-bar').classList.remove('hidden');
    UI.toast('Hold and drag a building to move it');
  }
  function exitEdit(save) {
    if (!edit) return;
    if (!save) {
      edit.snapshot.forEach(s => {
        const b = edit.plot.buildings.find(x => x.type === s.type);
        if (b) { b.x = s.x; b.y = s.y; }
      });
    }
    edit = null;
    $('nav').classList.remove('hidden');
    $('edit-bar').classList.add('hidden');
    cam.dirty = true;
  }
  function canPlace(plot, b, x, y) {
    if (x < 0 || y < 0 || x + b.foot[0] > plot.size || y + b.foot[1] > plot.size) return false;
    return !plot.buildings.some(o => o !== b &&
      x + b.foot[0] > o.x && x < o.x + o.foot[0] &&
      y + b.foot[1] > o.y && y < o.y + o.foot[1]);
  }

  $('edit-cancel').addEventListener('click', () => exitEdit(false));
  $('edit-save').addEventListener('click', async () => {
    const plot = edit.plot;
    const layout = {};
    plot.buildings.forEach(b => { layout[b.type] = { x: b.x, y: b.y }; });
    // save with `type` key — same shape v1 wrote and prod /api/city echoes back
    const decorations = plot.decor.map(d => ({ type: d.kind, x: d.x, y: d.y }));
    exitEdit(true);
    const res = await Data.saveLayout(layout, decorations);
    UI.toast(res && res.ok !== false ? 'Town saved! ✅' : 'Save failed — try again');
  });

  // drag handlers (only active in edit mode; camera pan is suppressed while dragging)
  function editDragStart(sx, sy) {
    if (!edit) return false;
    const hit = World.hitTest(sx, sy);
    if (hit && hit.kind === 'building' && hit.plot === edit.plot) {
      edit.drag = { b: hit.building, ox: hit.building.x, oy: hit.building.y };
      edit.sel = hit.building;
      edit.selOk = true;
      return true;
    }
    return false;
  }
  function editDragMove(sx, sy) {
    if (!edit || !edit.drag) return;
    const b = edit.drag.b;
    const w = Cam.screenToWorld(sx, sy);
    const lx = w.wx - edit.plot.origin.wx, ly = w.wy - edit.plot.origin.wy;
    let nx = Math.round(lx - b.foot[0] / 2);
    let ny = Math.round(ly - b.foot[1] / 2);
    nx = Math.max(0, Math.min(edit.plot.size - b.foot[0], nx));
    ny = Math.max(0, Math.min(edit.plot.size - b.foot[1], ny));
    b.x = nx; b.y = ny;
    edit.selOk = canPlace(edit.plot, b, nx, ny);
  }
  function editDragEnd() {
    if (!edit || !edit.drag) return;
    const { b, ox, oy } = edit.drag;
    if (!canPlace(edit.plot, b, b.x, b.y)) {
      b.x = ox; b.y = oy;
      UI.toast('Doesn\'t fit there');
    }
    edit.drag = null;
    edit.sel = null;
    cam.dirty = true;
  }

  // ── Tap handling ───────────────────────────────────────────────────────────
  function onTap(sx, sy) {
    if (edit) return; // edit mode is drag-driven

    const hit = World.hitTest(sx, sy);
    if (!hit) { UI.closeSheet(); return; }

    if (hit.kind === 'building') {
      if (hit.plot === World.model.myPlot) {
        openManage(hit.building.type);
      } else {
        UI.showBusiness(hit.building, {
          isMine: false,
          ownerName: hit.plot.player.displayName,
          card: { owned: true, level: hit.building.level, incomePerSecond: null, prestigeLevel: 0 },
          detail: null
        });
      }
      return;
    }

    // plate tap or ground tap → go there
    const plot = hit.plot;
    if (plot === World.model.myPlot) {
      if (view !== 'town') goHome();
      else UI.closeSheet();
    } else if (plot === visitingPlot) {
      UI.closeSheet();
    } else {
      setView('visit', plot);
      flyToPlot(plot);
    }
  }

  Cam.bindInput(canvas, {
    onTap,
    onLongPress: (sx, sy) => onTap(sx, sy),
    onMoveStart: () => {},
    onDragStart: editDragStart,
    onDragMove: editDragMove,
    onDragEnd: editDragEnd
  });

  // ── Nav buttons ────────────────────────────────────────────────────────────
  $('nav-world').addEventListener('click', () => {
    UI.closeSheet();
    if (view === 'city') {
      goHome();
    } else {
      setView('city');
      flyToCity();
    }
  });
  $('nav-biz').addEventListener('click', () => {
    const ov = Data.getOverview();
    if (!ov) { UI.toast('Log in to manage businesses'); return; }
    UI.showBusinessList(ov.businesses, (type) => openManage(type));
  });
  $('nav-edit').addEventListener('click', enterEdit);
  $('visit-home').addEventListener('click', () => goHome());
  $('sheet-scrim').addEventListener('click', UI.closeSheet);

  // ── Render loop ────────────────────────────────────────────────────────────
  let t0 = performance.now();
  function frame() {
    const t = (performance.now() - t0) / 1000;
    Cam.tick();
    World.render(ctx, canvas, t, edit);
    requestAnimationFrame(frame);
  }

  // ── Income ticker (display only — server is the source of truth) ──────────
  setInterval(() => {
    if (hudIncome > 0) {
      hudCoins += hudIncome;
      UI.setHud(null, hudCoins, hudIncome);
    }
  }, 1000);

  // ── Boot ───────────────────────────────────────────────────────────────────
  (async function boot() {
    const loggedIn = await Data.checkAuth();
    await Data.fetchCity();
    await Data.fetchOverview();
    await Data.fetchManagers();

    let me = Data.getCurrentUser();
    if (!me && Data.isDemo()) {
      // demo: adopt the first demo player so town/edit/business flows are testable
      me = { displayName: Data.getPlayers()[0].displayName, username: Data.getPlayers()[0].displayName };
    }
    // identity: the overview carries the RESOLVED WT discord id — session ids can
    // be tt_/gh_ prefixed (TikTok/GitHub logins) and never match city discordIds
    const ovBoot = Data.getOverview();
    if (me && ovBoot?.discordId) me = { ...me, id: ovBoot.discordId };

    World.build(Data.getPlayers(), me);

    const ov = Data.getOverview();
    const myPlayer = World.model.myPlot?.player;
    hudCoins = Number(ov?.coins ?? myPlayer?.coins ?? 0);
    hudIncome = Number(ov?.totalIncomePerSecond ?? myPlayer?.incomePerSecond ?? 0);
    UI.setHud(me || { displayName: 'Visitor' }, hudCoins, hudIncome,
      World.model.myPlot ? 'My Town' : 'Tycoon City');

    // start on my town (or city overview if just browsing / no town yet)
    const home = World.model.myPlot;
    if (home) {
      const r = World.plotIsoRect(home);
      cam.x = (r.x0 + r.x1) / 2; cam.y = (r.y0 + r.y1) / 2;
      cam.scale = Math.min(2.2, (cam.vw - 60) / Math.max(1, r.x1 - r.x0));
      setView('town');
    } else {
      const r = World.worldIsoRect();
      cam.x = (r.x0 + r.x1) / 2; cam.y = (r.y0 + r.y1) / 2;
      cam.scale = Math.max(cam.min, Math.min(1, (cam.vw - 40) / Math.max(1, r.x1 - r.x0)));
      setView('city');
      $('nav-edit').classList.add('hidden');
    }

    // login card for guests (real site only — demo already adopted a player)
    if (!loggedIn && !Data.isDemo()) {
      $('login-go').href = Data.getLoginUrl();
      $('login-card').classList.remove('hidden');
      $('login-skip').addEventListener('click', () => $('login-card').classList.add('hidden'));
      $('nav-edit').classList.add('hidden');
    }

    $('loading').classList.add('fade');
    setTimeout(() => $('loading').classList.add('hidden'), 500);
    requestAnimationFrame(frame);
  })();
})();
