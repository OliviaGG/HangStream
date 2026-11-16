/**
 * city-interaction.js — Side panel, direct map placement, info cards, business panel
 * Exports: window.CityInteraction
 */
(function () {
  'use strict';

  // ─── Constants ────────────────────────────────────────────────────────────

  const BIZ_NAMES = {
    library: 'Library', newspaper: 'Newspaper', carwash: 'Car Wash',
    stockmogul: 'Stock Mogul', pizza: 'Pizza Shop', arcade: 'Arcade',
    gym: 'Gym', cinema: 'Movie Theater', startup: 'Tech Startup',
    bank: 'Bank', space: 'Space Agency'
  };
  const BIZ_EMOJIS = {
    library: '\u{1F4DA}', newspaper: '\u{1F5DE}', carwash: '\u{1F697}',
    stockmogul: '\u{1F4C8}', pizza: '\u{1F355}', arcade: '\u{1F3AE}',
    gym: '\u{1F3CB}', cinema: '\u{1F3AC}', startup: '\u{1F4BB}',
    bank: '\u{1F3E6}', space: '\u{1F680}'
  };

  function formatNumber(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return String(Math.floor(n));
  }
  function escapeHtml(str) {
    const d = document.createElement('div'); d.textContent = str; return d.innerHTML;
  }

  // ─── State ────────────────────────────────────────────────────────────────

  let selectedItem = null;    // { kind: 'building'|'decoration', type: string } or null
  let myPlotOrigin = null;    // { wx, wy } — current user's plot center
  let myBusinesses = [];
  let myDecorations = [];     // [{ type, x, y }] — relative to plot center
  let myBuildingLayout = {};  // { bizType: { x, y } } — relative to plot center
  let panelVisible = false;
  let dirty = false;          // unsaved changes
  let coinTickerInterval = null;
  let displayedCoins = 0;
  let displayedIPS = 0;

  function startCoinTicker(coins, ips) {
    stopCoinTicker();
    displayedCoins = coins;
    displayedIPS = ips || 0;
    if (displayedIPS <= 0) return;
    coinTickerInterval = setInterval(() => {
      displayedCoins += displayedIPS / 10;
      const coinText = formatNumber(Math.floor(displayedCoins)) + ' XP · ' + formatNumber(Math.floor(displayedIPS)) + '/sec';
      const el = document.getElementById('sp-player-coins');
      if (el) el.textContent = coinText;
      const topCoins = document.getElementById('top-player-coins');
      if (topCoins) topCoins.textContent = coinText;
    }, 100);
  }

  function stopCoinTicker() {
    if (coinTickerInterval) { clearInterval(coinTickerInterval); coinTickerInterval = null; }
  }

  function refreshCoinDisplay() {
    CityData.fetchMyProfile().then(profile => {
      if (!profile || profile.coins == null) return;
      stopCoinTicker();
      const el = document.getElementById('sp-player-coins');
      if (el) {
        const ips = profile.totalIncomePerSecond || 0;
        const coinText = formatNumber(profile.coins) + ' XP' + (ips > 0 ? ' · ' + formatNumber(Math.floor(ips)) + '/sec' : '');
        el.textContent = coinText;
        const topCoins = document.getElementById('top-player-coins');
        if (topCoins) topCoins.textContent = coinText;
        startCoinTicker(profile.coins, ips);
      }
    });
  }

  // ─── Side Panel ───────────────────────────────────────────────────────────

  async function showPanel(businesses, plotOrigin) {
    myBusinesses = businesses || [];
    myPlotOrigin = plotOrigin;
    panelVisible = true;

    // Load saved decorations from the city data (other players' data includes ours)
    const user = CityData.getCurrentUser();
    myDecorations = [];

    // Find our decorations and building positions from the placed data
    if (plotOrigin) {
      const placed = CityLayout.getPlacedDecorations();
      const ours = placed.filter(d => d.plotCx === plotOrigin.wx && d.plotCy === plotOrigin.wy);
      myDecorations = ours.map(d => ({
        type: d.type,
        x: d.wx - plotOrigin.wx,
        y: d.wy - plotOrigin.wy,
      }));

      // Load current building positions (relative to plot center)
      myBuildingLayout = {};
      const allBuildings = CityLayout.getPlacedBuildings();
      const myBuildings = allBuildings.filter(b =>
        b.plotCx === plotOrigin.wx && b.plotCy === plotOrigin.wy && !b.isPrestigeBlock
      );
      for (const b of myBuildings) {
        myBuildingLayout[b.type] = {
          x: b.wx - plotOrigin.wx,
          y: b.wy - plotOrigin.wy,
        };
      }
    }

    const isMobile = window.innerWidth <= 768;
    const panel = document.getElementById('side-panel');

    if (isMobile) {
      // Mobile: panel is a bottom drawer, starts collapsed
      panel.classList.remove('hidden');
      panel.classList.add('panel-ready');
      // Don't add has-panel (no canvas shift on mobile)
    } else {
      panel.classList.remove('hidden');
      document.body.classList.add('has-panel');
    }

    // Player info in top bar (mobile)
    const displayName = user?.displayName || user?.username || 'Player';
    document.getElementById('sp-player-name').textContent = displayName;
    document.getElementById('sp-player-coins').textContent = '... coins';
    // Mobile top bar player info
    const topName = document.getElementById('top-player-name');
    if (topName) topName.textContent = displayName;
    refreshCoinDisplay();

    // Show toggle button on mobile
    const toggleBtn = document.getElementById('panel-toggle');
    if (toggleBtn) toggleBtn.classList.remove('hidden');

    renderPanelItems();

    // Bind save button
    document.getElementById('sp-save').onclick = saveAll;
    document.getElementById('sp-find-me').onclick = () => {
      if (myPlotOrigin && window._cityDebug?.cam) {
        const cam = window._cityDebug.cam;
        CityCamera.centerOn(cam, myPlotOrigin.wx, myPlotOrigin.wy);
        cam.zoom = 1.5;
        CityCamera.clamp(cam);
        cam.dirty = true;
      }
    };
  }

  function renderPanelItems() {
    const maxSlots = CityDecorations.calcSlots(myBusinesses);
    const usedSlots = myDecorations.length;

    // Buildings list
    const bizContainer = document.getElementById('sp-buildings');
    bizContainer.innerHTML = '';
    for (const biz of myBusinesses) {
      const info = CityBuildings.TYPES[biz.type];
      const el = document.createElement('div');
      el.className = 'sp-item' + (selectedItem?.kind === 'building' && selectedItem.type === biz.type ? ' sp-item-selected' : '');
      el.innerHTML = `
        <span class="sp-item-emoji">${info?.emoji || BIZ_EMOJIS[biz.type] || ''}</span>
        <span class="sp-item-name">${BIZ_NAMES[biz.type] || biz.type}</span>
        <span class="sp-item-detail">Lv.${biz.level}</span>
      `;
      el.addEventListener('click', () => {
        selectedItem = { kind: 'building', type: biz.type };
        renderPanelItems();
        updateCursor();
        autoClosePanelMobile();
      });
      bizContainer.appendChild(el);
    }

    // Decorations list
    const decoContainer = document.getElementById('sp-decorations');
    decoContainer.innerHTML = '';
    for (const [decoType, info] of Object.entries(CityDecorations.TYPES)) {
      const count = myDecorations.filter(d => d.type === decoType).length;
      const el = document.createElement('div');
      el.className = 'sp-item' + (selectedItem?.kind === 'decoration' && selectedItem.type === decoType ? ' sp-item-selected' : '');
      el.innerHTML = `
        <span class="sp-item-emoji">${info.emoji}</span>
        <span class="sp-item-name">${info.name}</span>
        <span class="sp-item-detail">${count > 0 ? '(' + count + ')' : ''}</span>
      `;
      el.addEventListener('click', () => {
        if (usedSlots >= maxSlots && count === 0) return;
        selectedItem = { kind: 'decoration', type: decoType };
        renderPanelItems();
        updateCursor();
        autoClosePanelMobile();
      });
      decoContainer.appendChild(el);
    }

    // Remove tool button
    const removeEl = document.createElement('div');
    removeEl.className = 'sp-item sp-item-remove' + (selectedItem?.kind === 'remove' ? ' sp-item-selected' : '');
    removeEl.innerHTML = `
      <span class="sp-item-emoji">🗑️</span>
      <span class="sp-item-name">Remove</span>
      <span class="sp-item-detail">click item</span>
    `;
    removeEl.addEventListener('click', () => {
      selectedItem = selectedItem?.kind === 'remove' ? null : { kind: 'remove' };
      renderPanelItems();
      updateCursor();
      if (selectedItem) autoClosePanelMobile();
    });
    decoContainer.appendChild(removeEl);

    // Deselect all button
    if (selectedItem) {
      const deselectEl = document.createElement('div');
      deselectEl.className = 'sp-item sp-item-deselect';
      deselectEl.innerHTML = `
        <span class="sp-item-emoji">✖️</span>
        <span class="sp-item-name">Deselect</span>
      `;
      deselectEl.addEventListener('click', () => {
        selectedItem = null;
        renderPanelItems();
        updateCursor();
      });
      decoContainer.appendChild(deselectEl);
    }

    // Slot counter
    document.getElementById('sp-slot-count').textContent = `${usedSlots}/${maxSlots}`;
  }

  function updateCursor() {
    const canvas = document.getElementById('city-canvas');
    canvas.classList.remove('placing', 'removing');
    if (selectedItem?.kind === 'remove') {
      canvas.classList.add('removing');
    } else if (selectedItem) {
      canvas.classList.add('placing');
    }
    // Update mobile placement indicator
    if (selectedItem) {
      showPlacementIndicator();
    } else {
      hidePlacementIndicator();
    }
  }

  function hidePanel() {
    panelVisible = false;
    stopCoinTicker();
    const panel = document.getElementById('side-panel');
    panel.classList.add('hidden');
    panel.classList.remove('panel-ready', 'panel-open');
    document.body.classList.remove('has-panel');
    const toggleBtn = document.getElementById('panel-toggle');
    if (toggleBtn) toggleBtn.classList.add('hidden');
  }

  function togglePanel() {
    const panel = document.getElementById('side-panel');
    if (panel.classList.contains('panel-open')) {
      panel.classList.remove('panel-open');
    } else {
      panel.classList.add('panel-open');
    }
  }

  /**
   * On mobile, auto-close the bottom drawer when an item is selected
   * and show a floating indicator so the user knows what they're placing.
   */
  function autoClosePanelMobile() {
    if (window.innerWidth > 768) return;
    const panel = document.getElementById('side-panel');
    panel.classList.remove('panel-open');
    showPlacementIndicator();
  }

  function showPlacementIndicator() {
    // Remove existing indicator
    let ind = document.getElementById('placement-indicator');
    if (ind) ind.remove();
    if (!selectedItem) return;

    const label = selectedItem.kind === 'remove' ? '🗑️ Remove Mode'
      : selectedItem.kind === 'building' ? '🏗️ Tap to move ' + (BIZ_NAMES[selectedItem.type] || selectedItem.type)
      : (CityDecorations.TYPES[selectedItem.type]?.emoji || '') + ' Tap to place';

    ind = document.createElement('div');
    ind.id = 'placement-indicator';
    ind.textContent = label;
    ind.style.cssText = 'position:fixed;bottom:12px;left:50%;transform:translateX(-50%);' +
      'background:rgba(10,16,30,0.92);border:1px solid rgba(243,191,75,0.5);' +
      'color:#f3bf4b;padding:8px 16px;border-radius:20px;font-size:0.8rem;font-weight:700;' +
      'z-index:160;pointer-events:none;text-align:center;white-space:nowrap;';
    document.body.appendChild(ind);
  }

  function hidePlacementIndicator() {
    const ind = document.getElementById('placement-indicator');
    if (ind) ind.remove();
  }

  // ─── Direct Map Placement (click on canvas) ──────────────────────────────

  function bindClick(canvas, cam) {
    let startX = 0, startY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      startX = e.clientX;
      startY = e.clientY;
    });

    canvas.addEventListener('pointerup', (e) => {
      const dist = Math.abs(e.clientX - startX) + Math.abs(e.clientY - startY);
      // Mobile fingers move more during taps — use wider threshold for touch
      const threshold = e.pointerType === 'touch' ? 25 : 10;
      if (dist > threshold) return; // was a drag

      const canvasRect = canvas.getBoundingClientRect();
      const cx = e.clientX - canvasRect.left;
      const cy = e.clientY - canvasRect.top;
      const worldPos = CityCamera.screenToWorld(cam, cx, cy);
      const twx = Math.floor(worldPos.x);
      const twy = Math.floor(worldPos.y);

      // ── Remove mode: clicking "Remove" in panel ──
      if (selectedItem && selectedItem.kind === 'remove' && myPlotOrigin) {
        // Try to remove a decoration at click position
        const deco = CityLayout.getDecorationAt(worldPos.x, worldPos.y);
        if (deco && deco.plotCx === myPlotOrigin.wx && deco.plotCy === myPlotOrigin.wy) {
          removeDecoration(deco.wx, deco.wy);
          return;
        }
        // Deselect remove mode if clicking empty
        selectedItem = null;
        renderPanelItems();
        updateCursor();
        return;
      }

      // ── Placement: item selected, clicking in own plot ──
      if (selectedItem && myPlotOrigin) {
        if (CityLayout.isInPlot(twx, twy, myPlotOrigin.wx, myPlotOrigin.wy)) {
          // First check if clicking on own decoration — remove it instead of placing
          const existingDeco = CityLayout.getDecorationAt(worldPos.x, worldPos.y);
          if (existingDeco && existingDeco.plotCx === myPlotOrigin.wx && existingDeco.plotCy === myPlotOrigin.wy) {
            removeDecoration(existingDeco.wx, existingDeco.wy);
            return;
          }

          if (selectedItem.kind === 'decoration') {
            placeDecoration(selectedItem.type, twx, twy);
          } else if (selectedItem.kind === 'building') {
            moveBuilding(selectedItem.type, twx, twy);
          }
          return;
        }
      }

      // ── No item selected: clicking own decoration removes it ──
      if (myPlotOrigin) {
        const deco = CityLayout.getDecorationAt(worldPos.x, worldPos.y);
        if (deco && deco.plotCx === myPlotOrigin.wx && deco.plotCy === myPlotOrigin.wy) {
          removeDecoration(deco.wx, deco.wy);
          return;
        }
      }

      // ── Building info card ──
      const building = CityLayout.getBuildingAt(worldPos.x, worldPos.y);
      if (building) {
        showInfoCard(building, e.clientX, e.clientY, cam);
      } else {
        hideInfoCard();
        if (selectedItem) {
          selectedItem = null;
          renderPanelItems();
          updateCursor();
        }
      }
    });

    // Close info card on X
    document.getElementById('info-card').addEventListener('click', (e) => {
      if (e.target.classList.contains('ic-close')) hideInfoCard();
    });
  }

  function placeDecoration(type, wx, wy) {
    // Collision check
    if (!CityLayout.isTileFree(wx, wy, false)) {
      console.log('[Panel] Place blocked: tile not free at', wx, wy);
      return;
    }

    const maxSlots = CityDecorations.calcSlots(myBusinesses);
    if (myDecorations.length >= maxSlots) {
      console.log('[Panel] Place blocked: slots full', myDecorations.length, '/', maxSlots);
      return;
    }

    // Add to local list (relative position)
    const relX = wx - myPlotOrigin.wx;
    const relY = wy - myPlotOrigin.wy;
    myDecorations.push({ type, x: relX, y: relY });
    console.log('[Panel] Placed', type, 'at world', wx, wy, '→ relative', relX, relY, '| myDecorations now:', myDecorations.length);

    // Add to world decorations
    const allDecos = CityLayout.getPlacedDecorations();
    allDecos.push({ wx, wy, type, plotCx: myPlotOrigin.wx, plotCy: myPlotOrigin.wy });
    CityLayout.setPlacedDecorations(allDecos);

    dirty = true;
    renderPanelItems();
    if (window._cityDebug?.cam) window._cityDebug.cam.dirty = true;
  }

  function moveBuilding(bizType, wx, wy) {
    // Check if the 2×2 area is free (temporarily remove this building from collision check)
    const allBuildings = CityLayout.getPlacedBuildings();

    // Check each tile in the 2×2 footprint
    for (let dx = 0; dx < 2; dx++) {
      for (let dy = 0; dy < 2; dy++) {
        const tx = wx + dx, ty = wy + dy;
        if (CityLayout.isRoad(tx, ty)) {
          console.log('[Panel] Move blocked: road at', tx, ty);
          return;
        }
        // Check other buildings (not this one)
        for (const b of allBuildings) {
          if (b.type === bizType && b.plotCx === myPlotOrigin.wx && b.plotCy === myPlotOrigin.wy) continue;
          if (tx >= b.wx && tx < b.wx + 2 && ty >= b.wy && ty < b.wy + 2) {
            console.log('[Panel] Move blocked: building collision at', tx, ty);
            return;
          }
        }
        // Check decorations
        const decos = CityLayout.getPlacedDecorations();
        for (const d of decos) {
          if (tx === d.wx && ty === d.wy) {
            console.log('[Panel] Move blocked: decoration at', tx, ty);
            return;
          }
        }
      }
    }

    // Update the building position in the world
    const buildings = CityLayout.getPlacedBuildings();
    for (const b of buildings) {
      if (b.type === bizType && b.plotCx === myPlotOrigin.wx && b.plotCy === myPlotOrigin.wy && !b.isPrestigeBlock) {
        b.wx = wx;
        b.wy = wy;
      }
    }
    // Also update prestige blocks (shift them relative to new position)
    const pBlocks = buildings.filter(b =>
      b.type === bizType && b.plotCx === myPlotOrigin.wx && b.plotCy === myPlotOrigin.wy && b.isPrestigeBlock
    );
    const extensions = [{ dx: 2, dy: 0 }, { dx: 0, dy: 2 }, { dx: 2, dy: 2 }];
    for (const pb of pBlocks) {
      const ext = extensions[pb.blockIndex - 1];
      if (ext) {
        pb.wx = wx + ext.dx;
        pb.wy = wy + ext.dy;
      }
    }

    // Update local layout tracking
    const relX = wx - myPlotOrigin.wx;
    const relY = wy - myPlotOrigin.wy;
    myBuildingLayout[bizType] = { x: relX, y: relY };

    // Clear sprite cache and redraw
    CityBuildings.clearCache();
    dirty = true;
    if (window._cityDebug?.cam) window._cityDebug.cam.dirty = true;

    // Deselect after placement
    selectedItem = null;
    renderPanelItems();
    updateCursor();

    console.log('[Panel] Moved', bizType, 'to world', wx, wy, '→ relative', relX, relY);
  }

  function removeDecoration(wx, wy) {
    // Remove from world
    const allDecos = CityLayout.getPlacedDecorations().filter(
      d => !(d.wx === wx && d.wy === wy && d.plotCx === myPlotOrigin.wx && d.plotCy === myPlotOrigin.wy)
    );
    CityLayout.setPlacedDecorations(allDecos);

    // Remove from local list
    const relX = wx - myPlotOrigin.wx;
    const relY = wy - myPlotOrigin.wy;
    const idx = myDecorations.findIndex(d => d.x === relX && d.y === relY);
    if (idx >= 0) myDecorations.splice(idx, 1);

    dirty = true;
    renderPanelItems();
    if (window._cityDebug?.cam) window._cityDebug.cam.dirty = true;
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  async function saveAll() {
    try {
      const btn = document.getElementById('sp-save');
      btn.textContent = 'Saving...';
      btn.disabled = true;
      const payload = {
        city_decorations: JSON.stringify(myDecorations),
        city_layout: JSON.stringify(myBuildingLayout),
      };
      console.log('[Panel] Saving decorations:', payload.city_decorations, '(' + myDecorations.length + ' items)');
      const resp = await fetch('/api/me/prefs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      console.log('[Panel] Save response:', JSON.stringify(data));
      if (!resp.ok || data.ok === false) {
        throw new Error(data.error || data.message || 'Save failed');
      }
      btn.textContent = 'Saved!';
      dirty = false;
      setTimeout(() => { btn.textContent = 'Save Layout'; btn.disabled = false; }, 2000);
    } catch (e) {
      console.error('[Panel] Save failed:', e.message);
      const btn = document.getElementById('sp-save');
      btn.textContent = 'Error!';
      btn.disabled = false;
      setTimeout(() => { btn.textContent = 'Save Layout'; }, 2000);
    }
  }

  // ─── Info Card ────────────────────────────────────────────────────────────

  function showInfoCard(building, screenX, screenY, cam) {
    const card = document.getElementById('info-card');
    const user = CityData.getCurrentUser();
    const isOwn = user && (building.displayName === user.displayName || building.displayName === user.username);

    const bizPills = (building.businesses || []).map(b => {
      const emoji = BIZ_EMOJIS[b.type] || '';
      const name = BIZ_NAMES[b.type] || b.type;
      const isThis = b.type === building.type;
      const style = isThis ? 'border-color: var(--gold); color: var(--gold);' : '';
      const pLabel = b.prestige > 0 ? ` P${b.prestige}` : '';
      return `<span class="ic-biz-pill" style="${style}">${emoji} ${name} Lv.${b.level}${pLabel}</span>`;
    }).join('');

    const title = building.equippedCosmetics?.title?.name || '';
    const nameColor = building.equippedCosmetics?.name_color?.color || 'var(--text)';
    const bizType = building.type;

    let actionHtml = '';
    if (isOwn) {
      actionHtml = `
        <div class="ic-actions">
          <button class="ic-action-btn ic-collect" data-biz="${bizType}" data-action="collect">Collect</button>
          <button class="ic-action-btn ic-upgrade" data-biz="${bizType}" data-action="upgrade">Upgrade</button>
        </div>
        <div class="ic-detail-link">
          <button class="ic-manage-btn" data-biz="${bizType}">Manage ${BIZ_NAMES[bizType] || bizType}</button>
        </div>
      `;
    }

    card.innerHTML = `
      <button class="ic-close">&times;</button>
      <div class="ic-name" style="color: ${nameColor}">${escapeHtml(building.displayName || 'Player')}</div>
      ${title ? `<div class="ic-title">${escapeHtml(title)}</div>` : ''}
      <div class="ic-building-type">${CityBuildings.TYPES[bizType]?.emoji || ''} ${BIZ_NAMES[bizType] || bizType} — Level ${building.level}${building.prestige > 0 ? ' · Prestige ' + building.prestige : ''}</div>
      <div class="ic-stat"><span class="ic-stat-label">Coins</span><span class="ic-stat-value">${formatNumber(building.coins || 0)}</span></div>
      <div class="ic-stat"><span class="ic-stat-label">Empire Value</span><span class="ic-stat-value">${formatNumber(building.empireValue || 0)}</span></div>
      <div class="ic-businesses">${bizPills}</div>
      ${actionHtml}
    `;

    // Bind action buttons
    if (isOwn) {
      for (const btn of card.querySelectorAll('.ic-action-btn')) {
        btn.addEventListener('click', async () => {
          const biz = btn.dataset.biz, action = btn.dataset.action;
          const origText = btn.textContent;
          btn.disabled = true; btn.textContent = 'Working...';
          try {
            const r = await fetch(`/api/tycoon/${encodeURIComponent(biz)}/${encodeURIComponent(action)}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              credentials: 'include', body: JSON.stringify({})
            });
            const data = await r.json();
            if (!r.ok || data.error) throw new Error(data.error || 'Failed');
            btn.textContent = 'Done!';
            // Particle effects at building location
            if (window._cityDebug?.cam) {
              const cam = window._cityDebug.cam;
              const scr = CityCamera.worldToScreen(cam, building.wx + 1, building.wy + 1);
              if (action === 'collect') CityEffects.coinCollect(scr.x, scr.y - 20 * cam.zoom);
              else if (action === 'upgrade') CityEffects.buildingPopIn(scr.x, scr.y - 20 * cam.zoom);
            }
            // Refresh coin counter in panel
            refreshCoinDisplay();
            setTimeout(() => { btn.textContent = origText; btn.disabled = false; }, 1500);
          } catch (e) { btn.textContent = origText; btn.disabled = false; alert(e.message); }
        });
      }
      const manageBtn = card.querySelector('.ic-manage-btn');
      if (manageBtn) manageBtn.addEventListener('click', () => openBusinessPanel(manageBtn.dataset.biz));
    }

    // Position
    const isMobile = window.innerWidth <= 768;
    if (isMobile) {
      card.style.left = '8px'; card.style.right = '8px'; card.style.bottom = '0'; card.style.top = 'auto';
    } else {
      let cx = screenX + 16, cy = screenY - 100;
      if (cx + 280 > window.innerWidth - 12) cx = screenX - 296;
      if (cy < 56) cy = 56;
      if (cy + 200 > window.innerHeight - 12) cy = window.innerHeight - 212;
      card.style.left = cx + 'px'; card.style.top = cy + 'px'; card.style.right = 'auto'; card.style.bottom = 'auto';
    }
    card.classList.remove('hidden');
  }

  function hideInfoCard() {
    document.getElementById('info-card').classList.add('hidden');
  }

  // ─── Business Management Panel ────────────────────────────────────────────

  function openBusinessPanel(bizType) {
    const panel = document.getElementById('biz-panel');
    const bizName = BIZ_NAMES[bizType] || bizType;
    const emoji = BIZ_EMOJIS[bizType] || '';
    const managePath = `/tycoonio/business/${encodeURIComponent(bizType)}`;

    panel.innerHTML = `
      <div class="editor-header">
        <h3>${emoji} Manage ${bizName}</h3>
        <button class="editor-close" id="bp-close">&times;</button>
      </div>
      <iframe id="bp-iframe" class="bp-iframe" src="${managePath}"></iframe>
    `;
    panel.classList.remove('hidden');
    panel.classList.add('show');
    panel.querySelector('#bp-close').addEventListener('click', () => {
      panel.classList.remove('show');
      setTimeout(() => { panel.classList.add('hidden'); panel.innerHTML = ''; }, 300);
    });
  }

  // ─── Exports ──────────────────────────────────────────────────────────────

  window.CityInteraction = {
    bindClick, showPanel, hidePanel, togglePanel,
    showInfoCard, hideInfoCard,
    formatNumber, getSelected: () => selectedItem,
    isPanelVisible: () => panelVisible,
  };
})();
