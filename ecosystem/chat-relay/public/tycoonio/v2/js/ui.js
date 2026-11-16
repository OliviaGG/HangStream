/**
 * ui.js — HUD, slide-up AdCap-style manage sheet, toasts.
 * Exports: window.TyUI
 */
(function () {
  'use strict';

  const Data = window.TyData;
  const $ = (id) => document.getElementById(id);

  // Per-business earning currency (matches the live WT systems)
  const CURRENCY = {
    newspaper: 'XP', carwash: 'clean cash', stockmogul: 'clean cash',
    pizza: 'pizza cash', gym: 'XP', cinema: 'XP',
    startup: 'XP', bank: 'XP', space: 'XP'
  };

  let onAction = null; // set by main.js: (type, action, upgradeType) => Promise
  let toastTimer = null;

  // ── HUD ────────────────────────────────────────────────────────────────────
  function setHud(user, coins, income, townLabel) {
    if (user) {
      $('hud-name').textContent = user.displayName || user.username || 'Tycoon';
      const av = $('hud-avatar');
      if (user.avatar || user.profilePic) {
        av.innerHTML = `<img src="${user.avatar || user.profilePic}" alt="">`;
      } else {
        av.textContent = (user.displayName || user.username || 'T').slice(0, 1).toUpperCase();
      }
    }
    if (coins != null) $('hud-coins').textContent = Data.fmt(coins);
    if (income != null) $('hud-income').textContent = Data.fmt(income) + '/s';
    if (townLabel) $('hud-town').textContent = townLabel;
  }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  // ── Sheet plumbing ─────────────────────────────────────────────────────────
  function openSheet(html) {
    const body = $('sheet-body');
    // in-place refresh: keep the scroll position so re-renders after an
    // upgrade/collect don't jump the sheet around
    const wasOpen = !$('sheet').classList.contains('hidden');
    const scrollTop = wasOpen ? body.scrollTop : 0;
    body.innerHTML = html;
    $('sheet').classList.remove('hidden');
    $('sheet-scrim').classList.remove('hidden');
    if (wasOpen) body.scrollTop = scrollTop;
  }
  function closeSheet() {
    $('sheet').classList.add('hidden');
    $('sheet-scrim').classList.add('hidden');
  }
  function isSheetOpen() { return !$('sheet').classList.contains('hidden'); }

  function iconStyle(type) {
    const m = Data.bizMeta(type);
    return `background:linear-gradient(160deg, ${m.pal}, ${shadeCss(m.pal)});`;
  }
  function shadeCss(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.round(((n >> 16) & 255) * 0.72), g = Math.round(((n >> 8) & 255) * 0.72), b = Math.round((n & 255) * 0.72);
    return `rgb(${r},${g},${b})`;
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  // ── Business manage sheet (AdCap style) ────────────────────────────────────
  /**
   * building: {type, level}
   * ctxInfo: { isMine, ownerName, card, detail } — detail = /api/tycoon/:type response
   */
  function showBusiness(building, ctxInfo) {
    const type = building.type;
    const m = Data.bizMeta(type);
    const card = ctxInfo.card;
    const level = building.level || card?.level || 0;
    const tier = Data.artTier(level);
    const next = Data.nextMilestone(level);
    const prev = Data.prevMilestone(level);
    const pct = next ? Math.round(((level - prev) / (next - prev)) * 100) : 100;
    const income = card ? card.incomePerSecond : null;
    const managed = !!Data.BIZ[type]?.managed;
    const cur = CURRENCY[type] || 'XP';
    const detail = ctxInfo.detail;

    const head = `
      <div class="bz-head">
        <div class="bz-icon" style="${iconStyle(type)}">${m.emoji}</div>
        <div>
          <div class="bz-title">${m.name}</div>
          <div class="bz-sub">Tier ${tier} building${managed ? '' : ' · earns automatically'}</div>
          ${!ctxInfo.isMine ? `<div class="bz-owner">Owner: ${escapeHtml(ctxInfo.ownerName || '?')}</div>` : ''}
        </div>
      </div>
      <div class="bz-stats">
        <div class="bz-stat"><b>${level || '—'}</b><span>Level</span></div>
        <div class="bz-stat"><b>${income != null ? Data.fmt(income) + '/s' : '—'}</b><span>Income</span></div>
        <div class="bz-stat"><b>${card?.prestigeLevel || 0}</b><span>Prestige</span></div>
      </div>
      ${level ? `
      <div class="bz-milestone">
        <div class="bz-mile-row"><span>Next building look</span><span>${next ? level + ' / ' + next : 'MAX TIER'}</span></div>
        <div class="bz-mile-bar"><div class="bz-mile-fill" style="width:${pct}%"></div></div>
      </div>` : ''}`;

    let body = '';
    if (!ctxInfo.isMine) {
      body = `<div class="bz-note">👀 You're visiting ${escapeHtml(ctxInfo.ownerName || 'a neighbor')}'s ${m.name}.</div>`;
    } else if (!card?.owned) {
      body = `
        <div class="bz-actions"><div class="bz-row">
          <button class="bz-btn" data-act="buy">Open Business 🔓</button>
        </div></div>`;
    } else if (!managed) {
      body = `<div class="bz-note">🕰️ This business pays straight into your XP wallet — nothing to manage yet. The big economy update gives it upgrades too.</div>`;
    } else if (!detail) {
      body = `<div class="bz-note">Loading upgrades…</div>`;
    } else {
      const ready = Number(detail.summary?.readyToCollect || 0);
      const ups = detail.payload?.availableUpgrades || {};
      const rows = Object.entries(ups).map(([key, def]) => {
        const maxed = !!def.maxed;
        const maxN = def.maxBuy && def.maxBuy.levels > 0 ? def.maxBuy.levels : 0;
        const preview = def.effectPreview || {};
        return `
          <div class="up-row">
            <div class="up-info">
              <div class="up-name">${escapeHtml(def.emoji || '•')} ${escapeHtml(def.name || key)}</div>
              <div class="up-meta">Lv ${escapeHtml(def.currentLevel)}${def.maxLevel ? ' / ' + escapeHtml(def.maxLevel) : ''}${preview.next && !maxed ? ` · ${escapeHtml(preview.current || '')} → <b>${escapeHtml(preview.next)}</b>` : ''}</div>
            </div>
            <div class="up-btns">
              ${maxed ? `<button class="up-btn" disabled>MAX</button>` : `
                <button class="up-btn buy" data-act="upgrade" data-up="${escapeHtml(key)}">+1<small>${Data.fmt(def.cost || 0)}</small></button>
                <button class="up-btn max" data-act="upgrade-max" data-up="${escapeHtml(key)}" ${maxN ? '' : 'disabled'}>MAX${maxN ? `<small>+${maxN}</small>` : ''}</button>`}
            </div>
          </div>`;
      }).join('');
      // manager row — AdCap-style hire-to-automate
      const mgrCat = ctxInfo.managers?.catalog?.[type];
      let mgrHtml = '';
      if (mgrCat) {
        mgrHtml = mgrCat.hired ? `
          <div class="mgr-row hired">
            <span class="mgr-ico">🧑‍💼</span>
            <div class="mgr-info">
              <div class="mgr-name">${escapeHtml(mgrCat.name)}</div>
              <div class="mgr-meta">Collecting for you every 5 minutes</div>
            </div>
            <span class="mgr-badge">HIRED</span>
          </div>` : `
          <div class="mgr-row">
            <span class="mgr-ico">${escapeHtml(mgrCat.emoji || '🧑‍💼')}</span>
            <div class="mgr-info">
              <div class="mgr-name">Hire ${escapeHtml(mgrCat.name)}</div>
              <div class="mgr-meta">Auto-collects this business every 5 min</div>
            </div>
            <button class="up-btn mgr-btn" data-act="hire-manager">Hire<small>${Data.fmt(mgrCat.cost)}</small></button>
          </div>`;
      }
      body = `
        <div class="bz-actions">
          <div class="bz-row">
            <button class="bz-btn collect" data-act="collect" ${ready > 0 ? '' : 'disabled'}>
              Collect ${ready > 0 ? Data.fmt(ready) : ''} 💰<small>${escapeHtml(cur)}</small>
            </button>
          </div>
        </div>
        ${mgrHtml}
        <div class="up-title">Upgrades <span class="up-cur">costs in ${escapeHtml(cur)}</span></div>
        ${rows || '<div class="bz-note">No upgrades available yet.</div>'}`;
    }

    openSheet(head + body);

    $('sheet-body').querySelectorAll('[data-act]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!onAction || btn.disabled) return;
        btn.disabled = true;
        await onAction(type, btn.dataset.act, btn.dataset.up || null);
      });
    });
  }

  // ── Business list sheet ────────────────────────────────────────────────────
  function showBusinessList(cards, onPick) {
    const rows = Data.BIZ_ORDER.map(type => {
      const m = Data.bizMeta(type);
      const card = cards?.find(c => c.businessType === type);
      const owned = card?.owned;
      return `
        <div class="bl-item ${owned ? '' : 'locked'}" data-type="${type}">
          <div class="bl-icon" style="${iconStyle(type)}">${m.emoji}</div>
          <div class="bl-info">
            <div class="bl-name">${m.name}</div>
            <div class="bl-meta">${owned ? (Data.BIZ[type].managed ? 'Tap to manage' : 'Earns automatically') : 'Not opened yet'}</div>
          </div>
          <div class="bl-right">
            ${owned ? `${Data.fmt(card.incomePerSecond)}/s<span class="lvl">Lv ${card.level}</span>` : '🔒'}
          </div>
        </div>`;
    }).join('');
    openSheet(`<div class="bl-title">Your Businesses</div>${rows}`);
    $('sheet-body').querySelectorAll('.bl-item').forEach(el => {
      el.addEventListener('click', () => onPick(el.dataset.type));
    });
  }

  window.TyUI = {
    setHud, toast, openSheet, closeSheet, isSheetOpen, showBusiness, showBusinessList,
    setActionHandler: (fn) => { onAction = fn; }
  };
})();
