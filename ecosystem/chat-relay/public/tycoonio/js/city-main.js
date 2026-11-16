/**
 * city-main.js — Entry point and orchestrator for TycoonIO City
 */
(function () {
  'use strict';

  const canvas = document.getElementById('city-canvas');
  const ctx = canvas.getContext('2d');
  const minimap = document.getElementById('minimap');
  const loading = document.getElementById('loading');
  const loginBtn = document.getElementById('login-btn');

  let cam = null;
  let buildings = [];
  let lastMinimapDraw = 0;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const cw = canvas.offsetWidth || window.innerWidth;
    const ch = canvas.offsetHeight || window.innerHeight;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.scale(dpr, dpr);
    if (cam) {
      cam.width = cw;
      cam.height = ch;
      cam.dirty = true;
    }
  }

  let frameCount = 0;
  function frame() {
    requestAnimationFrame(frame);
    frameCount++;
    CityCamera.update(cam);
    // Update characters every 2nd frame for performance
    if (frameCount % 2 === 0) CityCharacters.update();
    // Always redraw — characters and effects are always active
    // But throttle minimap to every 30 frames

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    CityRenderer.render(ctx, cam, buildings);
    CityEffects.updateParticles(ctx);

    const now = Date.now();
    if (now - lastMinimapDraw > 200) {
      CityRenderer.renderMinimap(minimap, cam, buildings);
      lastMinimapDraw = now;
    }
    cam.dirty = false;
  }

  async function loadCity() {
    const data = await CityData.fetchCityData();
    if (data && data.players) {
      buildings = CityLayout.layoutCity(data.players);
      // Spawn walking characters after layout is complete
      CityCharacters.spawnCharacters();
      const bounds = CityLayout.getBounds();
      cam.boundsMinX = (bounds.minX - bounds.maxY) * CityCamera.HALF_W;
      cam.boundsMaxX = (bounds.maxX - bounds.minY) * CityCamera.HALF_W;
      cam.boundsMinY = (bounds.minX + bounds.minY) * CityCamera.HALF_H;
      cam.boundsMaxY = (bounds.maxX + bounds.maxY) * CityCamera.HALF_H;
    }
    cam.dirty = true;
  }

  function initUI() {
    const isMobile = window.innerWidth <= 768;

    loginBtn.addEventListener('click', () => {
      window.location.href = CityData.getLoginUrl();
    });

    // Panel toggle button (mobile)
    const toggleBtn = document.getElementById('panel-toggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        CityInteraction.togglePanel();
      });
    }

    const user = CityData.getCurrentUser();
    if (user) {
      loginBtn.classList.add('hidden');
      // Hide top bar logo since panel has it (desktop), keep for mobile
      if (!isMobile) {
        document.getElementById('top-logo').style.display = 'none';
      }

      // Find user's buildings and show side panel
      const myBuilding = buildings.find(b =>
        b.displayName === user.displayName || b.displayName === user.username
      );
      if (myBuilding) {
        const plotCx = myBuilding.plotCx || myBuilding.wx;
        const plotCy = myBuilding.plotCy || myBuilding.wy;

        CityInteraction.showPanel(
          myBuilding.businesses,
          { wx: plotCx, wy: plotCy }
        );

        // Center on own city
        CityCamera.centerOn(cam, plotCx, plotCy);
        cam.zoom = isMobile ? 1.2 : 1.5;
        CityCamera.clamp(cam);
        cam.dirty = true;

        // Resize after panel appears (canvas width changes) — desktop only
        if (!isMobile) setTimeout(resize, 100);
      }
    }
  }

  function hideLoading() {
    loading.classList.add('fade-out');
    setTimeout(() => { loading.style.display = 'none'; }, 500);
  }

  function startPolling() {
    setInterval(async () => {
      const data = await CityData.fetchCityData();
      if (data && data.players) {
        buildings = CityLayout.layoutCity(data.players);
        CityBuildings.clearCache();
        cam.dirty = true;
      }
    }, 60000);
  }

  async function boot() {
    console.log('[TycoonIO] Booting city...');

    resize();
    window.addEventListener('resize', resize);

    cam = CityCamera.create(canvas);
    cam.width = canvas.offsetWidth || window.innerWidth;
    cam.height = canvas.offsetHeight || window.innerHeight;
    CityCamera.bindInput(cam, canvas);

    CityInteraction.bindClick(canvas, cam);

    const loggedIn = await CityData.checkAuth();
    await loadCity();

    const center = CityLayout.getCenter();
    CityCamera.centerOn(cam, center.x, center.y);

    initUI();
    frame();
    hideLoading();
    startPolling();

    window._cityDebug = { cam, buildings };
    console.log('[TycoonIO] City ready! ' + buildings.length + ' buildings placed.');
  }

  boot().catch(err => {
    console.error('[TycoonIO] Boot failed:', err);
    loading.querySelector('p').textContent = 'Failed to load city. Refresh to try again.';
  });
})();
