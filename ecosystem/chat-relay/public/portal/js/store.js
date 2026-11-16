/* ════════════════════════════════════════════════════════════════════
   THE VAULT — /store
   Standalone port of the portal SPA's Store tab (portal.js): catalog
   grid, live preview panel, filters, gift sets and the four Fan Club /
   membership showcase cards, against the same endpoints:
     /api/me/profile          (identity + coins + owned cosmetics)
     /api/me/shop             (catalog with css/render payloads)
     /api/me/sets             (cosmetic sets incl. fan-club tiers)
     /api/me/fanclub-status   (granted/queued for the TikTok set)
     /api/me/cosmetics/buy    /api/me/cosmetics/buyset
     /api/me/pass/checkout    (Pookie Pass CTA on the Super Donor card)

   Everything is login-gated server-side, so a 401 anywhere flips the
   page to the keycard door.

   Adaptations from the SPA (kept deliberately small):
   - `shopCatalog` and `storeItems` are one list here (the SPA kept two
     copies of the same fetch).
   - "View in Wardrobe" CTAs go to /profile — the wardrobe lives there
     now instead of in a picker modal.
   - The sets header uses .vr-sets-title (page-styled) instead of the
     SPA's .section-title.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── constants (verbatim from portal.js) ─────────────────────────── */
  var AVATAR_FALLBACK = '/portal/img/logo.png';
  var RARITY_COLORS = {
    common: '#9d9d9d', uncommon: '#4fc34f', rare: '#4a9eff', epic: '#b44aff',
    legendary: '#ffab00', ultra: '#ff4444', aux: '#00ffcc'
  };
  var RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, ultra: 5, aux: 6 };
  var CATEGORY_LABELS = {
    word_color: 'Word Color', word_glow: 'Word Glow', profile_border: 'Border',
    profile_glow: 'Glow', name_glow: 'Name Glow', name_color: 'Name Color',
    title: 'Title', win_effect: 'Win Effect', hero_badge: 'Hero Badge'
  };
  var STORE_SYMBOL = '<span class="wt-symbol wt-symbol-sm wt-symbol-store"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h10l2 3.5L12 18 5 9.5zM7 6l5 12M17 6l-5 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>';

  /* ── state ───────────────────────────────────────────────────────── */
  var profile = null;
  var storeItems = [];
  var shopSets = {};
  var fanClubStatus = null;
  var storePreviewItem = null;
  var _activeWePreviewContainer = null;

  /* ── helpers (verbatim from portal.js) ───────────────────────────── */
  function resolveAvatar(url) {
    if (!url) return AVATAR_FALLBACK;
    if (url.indexOf('cdn.discordapp.com/embed/avatars/') !== -1) return AVATAR_FALLBACK;
    return url;
  }
  function formatNumber(n) {
    if (n == null) return '-';
    n = Number(n);
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }
  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
  function sanitizeCssValue(val) {
    if (!val || typeof val !== 'string') return '';
    return val.replace(/[;"'<>\\]/g, '');
  }
  function showToast(msg) {
    var host = document.getElementById('toasts');
    if (!host) return;
    var t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    host.appendChild(t);
    setTimeout(function () { t.classList.add('out'); }, 3200);
    setTimeout(function () { t.remove(); }, 3600);
  }

  /* ── wardrobe stage pipeline (verbatim, minus the picker modal) ──── */
  function wdStageHtml(cat) {
    if (cat === 'profile_border' || cat === 'profile_glow') return '<div class="wd-ring"><span class="wd-ring-face"></span></div>';
    if (cat === 'hero_badge') return '<div class="wd-badge-fill"></div>';
    if (cat === 'win_effect') return '<div class="wd-we-dots"></div>';
    if (cat === 'title') return '<div class="wd-spec wd-spec-title"></div>';
    return '<div class="wd-spec">WORDY</div>';
  }

  function wdVideoFill(host, render) {
    var vid = document.createElement('video');
    vid.src = render.asset || '';
    if (render.poster) vid.poster = render.poster;
    vid.autoplay = true; vid.muted = true; vid.loop = true; vid.playsInline = true;
    vid.setAttribute('muted', ''); vid.setAttribute('playsinline', '');
    vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
    host.appendChild(vid);
    if (render.scrim) {
      var scrim = document.createElement('div');
      scrim.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:' + render.scrim + ';';
      host.appendChild(scrim);
    }
  }

  function wdPlayWeInStage(stage, css) {
    if (!stage || !css || !window.playWinEffect) return;
    // Spread the WHOLE css and override only what the stage needs — listing
    // fields by hand once dropped `imageUrl` and every image effect fell back
    // to the Super Fan heart. See the SPA's wdPlayWeInStage comment.
    playWinEffect(Object.assign({}, css, {
      duration: 2400,
      particleCount: Math.min(Number(css.particleCount) || 50, 60),
      target: stage
    }));
  }

  function wdFillStage(stage, cat, css, cosmeticId, render) {
    if (!stage || !css) return;
    var FX = window.CosmeticsFx;
    try {
      if (cat === 'hero_badge' && render && render.type === 'video_bg') {
        stage.style.position = 'relative';
        stage.style.overflow = 'hidden';
        wdVideoFill(stage, render);
        if (window.AmbientFx) AmbientFx.attachFromCss(stage, css);
        return;
      }
      if (cat === 'profile_border' || cat === 'profile_glow') {
        var ring = stage.querySelector('.wd-ring');
        var ringFace = ring && ring.querySelector('.wd-ring-face');
        if (window.PfpCosmetics) {
          window.PfpCosmetics.apply(ringFace, ring, {
            profile_border: cat === 'profile_border' ? css : null,
            profile_glow: cat === 'profile_glow' ? css : null
          });
        }
        if (window.AmbientFx) AmbientFx.attachFromCss(ring, css);
      } else if (cat === 'hero_badge') {
        var b = stage.querySelector('.wd-badge-fill');
        if (css.background) b.style.background = css.background;
        if (css.backgroundSize) b.style.backgroundSize = css.backgroundSize;
        if (css.animation) b.style.animation = css.animation;
        if (window.AmbientFx) AmbientFx.attachFromCss(b, css);
      } else if (cat === 'win_effect') {
        var dots = stage.querySelector('.wd-we-dots');
        dots.innerHTML = (css.colors || []).slice(0, 5).map(function (c) {
          return '<span style="background:' + sanitizeCssValue(c) + '"></span>';
        }).join('');
        var play = document.createElement('button');
        play.className = 'wd-we-play';
        play.innerHTML = '&#9654; Play';
        play.onclick = function (e) {
          e.stopPropagation();
          wdPlayWeInStage(stage, css);
        };
        stage.appendChild(play);
        stage.style.cursor = 'pointer';
        stage.onclick = function () { wdPlayWeInStage(stage, css); };
      } else if (cat === 'title') {
        var t = stage.querySelector('.wd-spec-title');
        t.textContent = css.title || 'Title';
        if (FX) FX.applyTitle(t, css);
        else if (css.titleColor) t.style.color = css.titleColor;
      } else if (cat === 'word_glow' || cat === 'name_glow') {
        var g = stage.querySelector('.wd-spec');
        g.style.color = '#dfe4ff';
        if (FX) FX.applyText(g, css, { gradient: false, color: false });
        else if (css.textShadow) g.style.textShadow = css.textShadow;
        if (window.AmbientFx) AmbientFx.attachFromCss(g, css);
      } else {
        var s = stage.querySelector('.wd-spec');
        if (FX) FX.applyText(s, css);
        else {
          if (css.color) s.style.color = css.color;
          if (css.textShadow) s.style.textShadow = css.textShadow;
        }
        if (window.AmbientFx) AmbientFx.attachFromCss(s, css);
      }
    } catch (err) {
      console.warn('[vault] stage fill failed:', err, cat, cosmeticId);
    }
  }

  /* ── equipped-cosmetics helper (SPA's buildPortalCosmeticsByCategory,
        with storeItems standing in for shopCatalog) ────────────────── */
  function buildCosmeticsByCategory(equipped) {
    var cosmeticsByCategory = {};
    (equipped || []).forEach(function (c) {
      var css = null, render = null, fallbackCss = null, renderType = 'css';
      var shopItem = storeItems.find(function (s) { return s.id === c.cosmetic_id; });
      if (shopItem) {
        if (shopItem.css) css = shopItem.css;
        if (shopItem.render) render = shopItem.render;
        if (shopItem.fallbackCss) fallbackCss = shopItem.fallbackCss;
        if (shopItem.renderType) renderType = shopItem.renderType;
      }
      if (!css && c.css_property) {
        try { css = JSON.parse(c.css_property); } catch (e) {}
      }
      if (!render && c.render) render = c.render;
      if (!fallbackCss && c.fallbackCss) fallbackCss = c.fallbackCss;
      if (c.renderType) renderType = c.renderType;
      cosmeticsByCategory[c.category] = {
        css: css || fallbackCss || {},
        render: render || null,
        fallbackCss: fallbackCss || css || null,
        renderType: renderType || 'css'
      };
    });
    return cosmeticsByCategory;
  }

  /* ── coin balances ───────────────────────────────────────────────── */
  function updateStoreCoinBalance() {
    var el = document.getElementById('store-coin-balance');
    var giftEl = document.getElementById('store-gift-balance');
    if (profile && profile.profile) {
      el.textContent = formatNumber(profile.profile.coins);
      if (giftEl) giftEl.textContent = formatNumber(profile.profile.giftCoins || 0);
    }
  }

  /* ── live preview panel (verbatim from the SPA) ──────────────────── */
  function initStorePreview() {
    var platforms = (profile && profile.profile && profile.profile.platforms) || [];
    if (platforms.length === 0) return;
    var plat = platforms[0];
    var avatarEl = document.getElementById('store-preview-avatar');
    avatarEl.src = resolveAvatar(plat.profilePic);
    avatarEl.style.display = 'block';
    avatarEl.onerror = function () { this.onerror = null; this.src = AVATAR_FALLBACK; };
    document.getElementById('store-preview-name').textContent = plat.displayName || plat.username || 'Player';
    applyStorePreviewFromEquipped();
  }

  function applyStorePreviewFromEquipped() {
    var avatarWrap = document.querySelector('.store-preview-avatar-wrap');
    var avatarEl = document.getElementById('store-preview-avatar');
    var nameEl = document.getElementById('store-preview-name');
    var wordEl = document.getElementById('store-preview-word');
    var titleEl = document.getElementById('store-preview-title');
    var badgeBg = document.getElementById('store-preview-badge-bg');

    if (!avatarWrap) return;

    avatarWrap.style.cssText = '';
    avatarEl.style.border = '3px solid var(--border)';
    avatarEl.style.animation = '';
    avatarEl.style.backgroundImage = '';
    avatarEl.style.backgroundOrigin = '';
    avatarEl.style.backgroundClip = '';
    nameEl.style.cssText = '';
    wordEl.style.cssText = '';
    titleEl.innerHTML = '';
    titleEl.style.cssText = '';
    if (window.AmbientFx) {
      [avatarWrap, avatarEl, nameEl, wordEl, titleEl, badgeBg].forEach(function (el) { if (el) AmbientFx.detach(el); });
    }
    if (window.PortalCosmeticRenderer) {
      window.PortalCosmeticRenderer.clearLayers(avatarWrap);
      window.PortalCosmeticRenderer.clearLayers(badgeBg);
    }

    var ownedList = (profile && profile.cosmetics) || [];
    var equipped = ownedList.filter(function (c) { return c.equipped; });
    if (equipped.length === 0) return;

    applyStorePreviewCSS(buildCosmeticsByCategory(equipped));
  }

  function applyStorePreviewCSS(cosmeticsByCategory) {
    var avatarWrap = document.querySelector('.store-preview-avatar-wrap');
    var avatarEl = document.getElementById('store-preview-avatar');
    var nameEl = document.getElementById('store-preview-name');
    var wordEl = document.getElementById('store-preview-word');
    var titleEl = document.getElementById('store-preview-title');
    var storeBadgeBg = document.getElementById('store-preview-badge-bg');

    var FX = window.CosmeticsFx;
    var border = cosmeticsByCategory.profile_border && cosmeticsByCategory.profile_border.css;
    var glow = cosmeticsByCategory.profile_glow && cosmeticsByCategory.profile_glow.css;
    if (window.PfpCosmetics) {
      window.PfpCosmetics.apply(avatarEl, avatarWrap, { profile_border: border, profile_glow: glow });
    }
    var nameColor = cosmeticsByCategory.name_color && cosmeticsByCategory.name_color.css;
    if (nameColor) {
      if (FX) FX.applyText(nameEl, nameColor, { shadow: false });
      else {
        if (nameColor.color) nameEl.style.color = nameColor.color;
        if (nameColor.animation) nameEl.style.animation = nameColor.animation;
      }
    }
    var nameGlow = cosmeticsByCategory.name_glow && cosmeticsByCategory.name_glow.css;
    if (nameGlow) {
      if (nameGlow.textShadow) nameEl.style.textShadow = nameGlow.textShadow;
      if (nameGlow.animation && !nameEl.style.animation) nameEl.style.animation = nameGlow.animation;
    }
    var wordColor = cosmeticsByCategory.word_color && cosmeticsByCategory.word_color.css;
    if (wordColor) {
      if (FX) FX.applyText(wordEl, wordColor);
      else {
        if (wordColor.color) wordEl.style.color = wordColor.color;
        if (wordColor.textShadow) wordEl.style.textShadow = wordColor.textShadow;
        if (wordColor.animation) wordEl.style.animation = wordColor.animation;
      }
    }
    var wordGlow = cosmeticsByCategory.word_glow && cosmeticsByCategory.word_glow.css;
    if (wordGlow) {
      if (wordGlow.textShadow && !wordEl.style.textShadow) wordEl.style.textShadow = wordGlow.textShadow;
      if (wordGlow.animation && !wordEl.style.animation) wordEl.style.animation = wordGlow.animation;
    }
    var titleCos = cosmeticsByCategory.title && cosmeticsByCategory.title.css;
    if (titleCos) {
      titleEl.textContent = titleCos.title || '';
      if (FX) FX.applyTitle(titleEl, titleCos);
      else {
        if (titleCos.titleColor) titleEl.style.color = titleCos.titleColor;
        if (titleCos.titleGlow) titleEl.style.textShadow = titleCos.titleGlow;
        if (titleCos.animation) titleEl.style.animation = titleCos.animation;
      }
    }

    var badge = cosmeticsByCategory.hero_badge && cosmeticsByCategory.hero_badge.css;
    if (storeBadgeBg) {
      if (badge) {
        if (badge.background) storeBadgeBg.style.background = badge.background;
        if (badge.backgroundSize) storeBadgeBg.style.backgroundSize = badge.backgroundSize;
        if (badge.animation) storeBadgeBg.style.animation = badge.animation;
      } else {
        storeBadgeBg.style.background = '';
        storeBadgeBg.style.backgroundSize = '';
        storeBadgeBg.style.animation = '';
      }
    }

    if (window.AmbientFx) {
      AmbientFx.attachFromCss(wordEl, wordColor || wordGlow || {});
      AmbientFx.attachFromCss(nameEl, nameColor || nameGlow || {});
      AmbientFx.attachFromCss(avatarWrap, (border && border.__ambient ? border : glow) || {});
      if (storeBadgeBg) AmbientFx.attachFromCss(storeBadgeBg, badge || {});
    }

    if (window.PortalCosmeticRenderer) {
      window.PortalCosmeticRenderer.applyHeroLayers({
        avatarWrap: avatarWrap,
        avatarEl: avatarEl,
        heroBg: storeBadgeBg,
        borderSpec: cosmeticsByCategory.profile_border || null,
        badgeSpec: cosmeticsByCategory.hero_badge || null
      });
    }
  }

  function previewStoreItem(item) {
    storePreviewItem = item;
    applyStorePreviewFromEquipped();

    var css = item.css;
    if (!css) return;

    var avatarWrap = document.querySelector('.store-preview-avatar-wrap');
    var avatarEl = document.getElementById('store-preview-avatar');
    var nameEl = document.getElementById('store-preview-name');
    var wordEl = document.getElementById('store-preview-word');
    var titleEl = document.getElementById('store-preview-title');
    var storeBadgeBg = document.getElementById('store-preview-badge-bg');

    var FX = window.CosmeticsFx;
    if (item.category === 'word_color') {
      if (FX) FX.applyText(wordEl, css);
      else {
        if (css.color) wordEl.style.color = css.color;
        if (css.textShadow) wordEl.style.textShadow = css.textShadow;
        if (css.animation) wordEl.style.animation = css.animation;
      }
      if (window.AmbientFx) AmbientFx.attachFromCss(wordEl, css);
    } else if (item.category === 'word_glow') {
      if (css.textShadow) wordEl.style.textShadow = css.textShadow;
      if (css.animation) wordEl.style.animation = css.animation;
      if (window.AmbientFx) AmbientFx.attachFromCss(wordEl, css);
    } else if (item.category === 'profile_border' || item.category === 'profile_glow') {
      if (window.PfpCosmetics) {
        window.PfpCosmetics.apply(avatarEl, avatarWrap, {
          profile_border: item.category === 'profile_border' ? css : null,
          profile_glow: item.category === 'profile_glow' ? css : null
        });
      }
      if (window.AmbientFx) AmbientFx.attachFromCss(avatarWrap, css);
    } else if (item.category === 'name_color') {
      if (FX) FX.applyText(nameEl, css, { shadow: false });
      else {
        if (css.color) nameEl.style.color = css.color;
        if (css.animation) nameEl.style.animation = css.animation;
      }
      if (window.AmbientFx) AmbientFx.attachFromCss(nameEl, css);
    } else if (item.category === 'name_glow') {
      if (css.textShadow) nameEl.style.textShadow = css.textShadow;
      if (css.animation) nameEl.style.animation = css.animation;
      if (window.AmbientFx) AmbientFx.attachFromCss(nameEl, css);
    } else if (item.category === 'title') {
      titleEl.textContent = css.title || '';
      if (FX) FX.applyTitle(titleEl, css);
      else {
        if (css.titleColor) titleEl.style.color = css.titleColor;
        if (css.titleGlow) titleEl.style.textShadow = css.titleGlow;
        if (css.animation) titleEl.style.animation = css.animation;
      }
    } else if (item.category === 'hero_badge') {
      if (storeBadgeBg) {
        if (css.background) storeBadgeBg.style.background = css.background;
        if (css.backgroundSize) storeBadgeBg.style.backgroundSize = css.backgroundSize;
        if (css.animation) storeBadgeBg.style.animation = css.animation;
        if (window.AmbientFx) AmbientFx.attachFromCss(storeBadgeBg, css);
      }
    }

    if (window.PortalCosmeticRenderer) {
      if (item.category === 'profile_border') {
        window.PortalCosmeticRenderer.applyHeroLayers({
          avatarWrap: avatarWrap,
          avatarEl: avatarEl,
          heroBg: storeBadgeBg,
          borderSpec: {
            css: item.css || item.fallbackCss || {},
            render: item.render || null,
            fallbackCss: item.fallbackCss || item.css || null,
            renderType: item.renderType || 'css'
          },
          badgeSpec: null
        });
      } else if (item.category === 'hero_badge') {
        window.PortalCosmeticRenderer.applyHeroLayers({
          avatarWrap: avatarWrap,
          avatarEl: avatarEl,
          heroBg: storeBadgeBg,
          borderSpec: null,
          badgeSpec: {
            css: item.css || item.fallbackCss || {},
            render: item.render || null,
            fallbackCss: item.fallbackCss || item.css || null,
            renderType: item.renderType || 'css'
          }
        });
      }
    }

    document.querySelectorAll('.store-card.previewing').forEach(function (c) { c.classList.remove('previewing'); });
    var card = document.querySelector('.store-card[data-id="' + item.id + '"]');
    if (card) card.classList.add('previewing');
  }

  window.storePreview = function (itemId) {
    var item = storeItems.find(function (i) { return i.id === itemId; });
    if (item) previewStoreItem(item);
  };

  function resetStorePreview() {
    storePreviewItem = null;
    applyStorePreviewFromEquipped();
    document.querySelectorAll('.store-card.previewing').forEach(function (c) { c.classList.remove('previewing'); });
  }

  /* ── filters + grid (verbatim from the SPA) ──────────────────────── */
  function getStoreFiltered() {
    var catFilter = document.getElementById('store-cat-filter').value;
    var rarityFilter = document.getElementById('store-rarity-filter').value;
    var setFilter = document.getElementById('store-set-filter').value;
    var buffFilter = document.getElementById('store-buff-filter').value;
    var sortVal = document.getElementById('store-sort').value;

    var items = storeItems.slice();

    if (catFilter === 'gift') {
      items = items.filter(function (i) { return i.giftSet; });
    } else if (catFilter !== 'all') {
      items = items.filter(function (i) { return i.category === catFilter && !i.giftSet; });
    }
    if (rarityFilter !== 'all') items = items.filter(function (i) { return i.rarity === rarityFilter; });
    if (setFilter === 'none') {
      items = items.filter(function (i) { return !i.setId; });
    } else if (setFilter !== 'all') {
      items = items.filter(function (i) { return i.setId === setFilter; });
    }
    if (buffFilter !== 'all') {
      items = items.filter(function (i) {
        if (i.buff && i.buff.type === buffFilter) return true;
        if (i.buffs && i.buffs.some(function (b) { return b.type === buffFilter; })) return true;
        return false;
      });
    }

    var parts = sortVal.split('-');
    var sortKey = parts[0], sortDir = parts[1];
    items.sort(function (a, b) {
      if (sortKey === 'price') {
        return sortDir === 'asc' ? a.cost - b.cost : b.cost - a.cost;
      } else if (sortKey === 'rarity') {
        var ra = RARITY_RANK[a.rarity] || 0;
        var rb = RARITY_RANK[b.rarity] || 0;
        return sortDir === 'asc' ? ra - rb : rb - ra;
      } else if (sortKey === 'buff') {
        var ba = a.buff ? a.buff.value : (a.buffs ? Math.max.apply(null, a.buffs.map(function (b2) { return b2.value; })) : 0);
        var bb = b.buff ? b.buff.value : (b.buffs ? Math.max.apply(null, b.buffs.map(function (b2) { return b2.value; })) : 0);
        return sortDir === 'asc' ? ba - bb : bb - ba;
      } else if (sortKey === 'name') {
        return a.name.localeCompare(b.name);
      }
      return 0;
    });

    return items;
  }

  function renderStoreGrid() {
    var grid = document.getElementById('store-grid');
    var items = getStoreFiltered();
    var ownedIds = new Set(((profile && profile.cosmetics) || []).map(function (c) { return c.cosmetic_id; }));

    document.getElementById('store-count').textContent = items.length;

    if (items.length === 0) {
      grid.innerHTML = '<div class="loading-placeholder">No items match your filters</div>';
      renderStoreGuidance();
      return;
    }

    grid.innerHTML = items.map(function (item) {
      var color = RARITY_COLORS[item.rarity] || '#888';
      var catLabel = CATEGORY_LABELS[item.category] || item.category;
      var owned = ownedIds.has(item.id);
      var isGift = item.giftSet || item.cost === 0;
      var isPreviewing = storePreviewItem && storePreviewItem.id === item.id;

      var previewHtml = item.css
        ? '<div class="wd-stage store-stage' + (item.category === 'hero_badge' ? ' wd-stage-badge' : '') + '">' + wdStageHtml(item.category) + '</div>'
        : '';

      var buffHtml = '';
      if (item.buffs) {
        buffHtml = item.buffs.map(function (b) { return '<div class="store-card-buff">' + escapeHtml(b.label) + '</div>'; }).join('');
      } else if (item.buff) {
        buffHtml = '<div class="store-card-buff">' + escapeHtml(item.buff.label) + '</div>';
      }

      var setBadge = item.setId ? '<span class="store-set-badge">' + escapeHtml(item.setId) + '</span>' : '';

      var priceHtml;
      var buyBtnHtml = '';
      if (isGift) {
        priceHtml = '<span class="store-card-gift">Gift Only</span>';
        if (!owned && item.setId) {
          buyBtnHtml = '<button class="store-buy-btn store-buy-gift" onclick="event.stopPropagation(); portalBuySet(\'' + item.setId + '\')">Buy Set</button>';
        }
      } else {
        priceHtml = '<span class="store-card-price-value">' + formatNumber(item.cost) + '</span>';
        if (!owned) {
          var canAfford = ((profile && profile.profile && profile.profile.coins) || 0) >= item.cost;
          buyBtnHtml = '<button class="store-buy-btn' + (canAfford ? '' : ' store-buy-disabled') + '" onclick="event.stopPropagation(); portalBuyCosmetic(\'' + item.id + '\')" ' + (canAfford ? '' : 'disabled') + '>Buy</button>';
        }
      }

      var auxBadge = item.audioReactive ? '<span class="store-aux-badge">AUX</span>' : '';
      var fanClubBadge = item.fanClubOnly
        ? '<span class="store-fanclub-badge" title="Only visible in fan-club streams">♥ FC</span>'
        : '';

      return '' +
        '<div class="store-card' + (owned ? ' owned' : '') + (isPreviewing ? ' previewing' : '') + (item.fanClubOnly ? ' fanclub-only-item' : '') + '" data-id="' + item.id + '" style="--rarity-color: ' + color + '" onclick="storePreview(\'' + item.id + '\')">' +
          '<div class="store-card-rarity-strip" style="background: ' + color + '"></div>' +
          (owned ? '<div class="store-owned-badge">OWNED</div>' : '') +
          auxBadge +
          fanClubBadge +
          previewHtml +
          '<div class="store-card-body">' +
            '<div class="store-card-name">' + escapeHtml(item.name) + '</div>' +
            '<div class="store-card-meta">' +
              '<span class="store-card-category">' + catLabel + '</span>' +
              setBadge +
            '</div>' +
            '<div class="store-card-rarity" style="background:' + color + '18; color:' + color + '">' + item.rarity + (item.audioReactive ? ' (Audio)' : '') + '</div>' +
            buffHtml +
            '<div class="store-card-price">' + priceHtml + buyBtnHtml + '</div>' +
          '</div>' +
        '</div>';
    }).join('');

    // Fill the live stages (wardrobe pipeline: gradients, rings, scenes,
    // contained win-effect playback). AmbientFx caps its own budget.
    var stageCards = grid.querySelectorAll('.store-card');
    items.forEach(function (item, idx) {
      var card = stageCards[idx];
      var stage = card && card.querySelector('.wd-stage');
      if (stage && item.css) wdFillStage(stage, item.category, item.css, item.id, item.render || null);
    });

    renderStoreGuidance();
  }

  /* ── sets + Fan Club showcase cards (verbatim, CTAs re-homed) ────── */
  function renderStoreSets() {
    var section = document.getElementById('store-sets-section');
    var entries = Object.entries(shopSets || {});
    if (entries.length === 0) { section.innerHTML = ''; return; }

    var ownedIds = new Set(((profile && profile.cosmetics) || []).map(function (c) { return c.cosmetic_id; }));

    var setsHtml = entries.map(function (entry) {
      var key = entry[0], set = entry[1];
      var owned = set.itemIds.filter(function (id) { return ownedIds.has(id); }).length;
      var total = set.itemIds.length;
      var pct = Math.round((owned / total) * 100);
      var complete = owned === total;
      var color = RARITY_COLORS[set.rarity] || '#888';

      var itemDots = set.itemIds.map(function (id) {
        var item = storeItems.find(function (i) { return i.id === id; });
        var isOwned = ownedIds.has(id);
        var catLabel = item ? (CATEGORY_LABELS[item.category] || '') : '';
        return '<span class="store-set-dot' + (isOwned ? ' owned' : '') + '" style="background:' + (isOwned ? color : 'var(--surface2)') + '" title="' + catLabel + (item ? ': ' + escapeHtml(item.name) : '') + '"></span>';
      }).join('');

      // ── Super Donor — needs BOTH memberships; locked CTA sells the
      //    Pookie Pass, the only single purchase that counts as both ──
      if (set.superDonorOnly) {
        var sdUnlocked = owned > 0;
        var sdPill = sdUnlocked
          ? '<span class="fanclub-pill fanclub-pill--unlocked" style="background:rgba(110,227,74,0.18);color:#8ee86a;border-color:rgba(110,227,74,0.45)">Unlocked ✓</span>'
          : '<span class="fanclub-pill fanclub-pill--locked">Super Fan + Donor Class</span>';
        var sdCta = sdUnlocked
          ? '<a class="store-buy-btn fanclub-cta-view" href="/profile">View in your Suite</a>'
          : '<button class="store-buy-btn superdonor-cta-join" onclick="vaultPookieCheckout(this)">Get the Pookie Pass — both in one</button>';
        return '' +
          '<div class="store-set-card store-set-card--superdonor' + (sdUnlocked ? ' fanclub-unlocked' : '') + '" style="--set-color: #ffd700">' +
            '<div class="fanclub-hero superfan-hero superdonor-hero">' +
              '<video class="superfan-hero-video" src="/cosmetics/superdonor-hero.mp4" poster="/cosmetics/superdonor-hero-poster.jpg" autoplay muted loop playsinline></video>' +
              '<div class="superfan-hero-scrim superdonor-hero-scrim"></div>' +
              '<img class="fanclub-hero-img superdonor-hero-img" src="/cosmetics/superdonor-heart.png" alt="" />' +
            '</div>' +
            '<div class="store-set-header">' +
              '<div>' +
                '<span class="store-set-name">' + escapeHtml(set.name) + '</span>' +
                '<span class="store-set-rarity" style="color:#8ee86a">' + escapeHtml(set.rarity) + '</span>' +
              '</div>' +
              sdPill +
            '</div>' +
            '<div class="store-set-bar"><div class="store-set-bar-fill" style="width:' + pct + '%;background:linear-gradient(90deg,#ffd700,#6ee34a,#a855f7)"></div></div>' +
            '<div class="store-set-dots">' + itemDots + '</div>' +
            '<div class="store-set-bonus">' + escapeHtml(set.setBonusLabel || '') + ' · exclusive Laurel Burst win effect · Throne of Laurels video hero badge</div>' +
            '<div class="fanclub-cta-row">' + sdCta + '</div>' +
            '<div class="fanclub-footnote">' + (sdUnlocked
              ? 'Yours forever — the rarest set in the game. Granted because you hold both.'
              : 'Hold Super Fan AND Donor Class at the same time and the full 9-piece set is granted and equipped automatically. The Pookie Pass counts as both on its own.') + '</div>' +
          '</div>';
      }

      // ── Donor Class exclusive — chrome/sapphire showcase card ──
      if (set.donorClassOnly) {
        var dcUnlocked = owned > 0;
        var dcPill = dcUnlocked
          ? '<span class="fanclub-pill fanclub-pill--unlocked" style="background:rgba(96,165,250,0.16);color:#60a5fa">Unlocked ✓</span>'
          : '<span class="fanclub-pill fanclub-pill--locked">Donor Class only</span>';
        var dcCta = dcUnlocked
          ? '<a class="store-buy-btn fanclub-cta-view" href="/profile">View in your Suite</a>'
          : '<a class="store-buy-btn donorclass-cta-join" href="/membership">' + escapeHtml(set.unlockLabel || 'Become a Donor Class member') + '</a>';
        return '' +
          '<div class="store-set-card store-set-card--donorclass' + (dcUnlocked ? ' fanclub-unlocked' : '') + '" style="--set-color: #60a5fa">' +
            '<div class="fanclub-hero superfan-hero donorclass-hero">' +
              '<video class="superfan-hero-video" src="/cosmetics/donorclass-hero.mp4" poster="/cosmetics/donorclass-hero-poster.jpg" autoplay muted loop playsinline></video>' +
              '<div class="superfan-hero-scrim donorclass-hero-scrim"></div>' +
              '<img class="fanclub-hero-img donorclass-hero-img" src="/cosmetics/donorclass-heart.png" alt="" />' +
            '</div>' +
            '<div class="store-set-header">' +
              '<div>' +
                '<span class="store-set-name">' + escapeHtml(set.name) + '</span>' +
                '<span class="store-set-rarity" style="color:#60a5fa">' + escapeHtml(set.rarity) + '</span>' +
              '</div>' +
              dcPill +
            '</div>' +
            '<div class="store-set-bar"><div class="store-set-bar-fill" style="width:' + pct + '%;background:linear-gradient(90deg,#e5e7eb,#2563eb)"></div></div>' +
            '<div class="store-set-dots">' + itemDots + '</div>' +
            '<div class="store-set-bonus">' + escapeHtml(set.setBonusLabel || '') + ' · exclusive Sapphire Burst win effect · video hero badge</div>' +
            '<div class="fanclub-cta-row">' + dcCta + '</div>' +
            '<div class="fanclub-footnote">' + (dcUnlocked
              ? 'Yours forever — granted when your Donor Class membership activated.'
              : 'The full 9-piece chrome set is granted and equipped automatically the moment your Donor Class membership activates.') + '</div>' +
          '</div>';
      }

      // ── Super Fan exclusive — flagship showcase card ──
      if (set.superfanOnly) {
        var sfUnlocked = owned > 0;
        var sfPill = sfUnlocked
          ? '<span class="fanclub-pill fanclub-pill--unlocked" style="background:rgba(255,215,0,0.16);color:#ffd700">Unlocked ✓</span>'
          : '<span class="fanclub-pill fanclub-pill--locked">Super Fans only</span>';
        var sfCta = sfUnlocked
          ? '<a class="store-buy-btn fanclub-cta-view" href="/profile">View in your Suite</a>'
          : '<a class="store-buy-btn superfan-cta-join" href="' + escapeHtml(set.unlockUrl || 'https://www.tiktok.com/@jorrybeaufart') + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(set.unlockLabel || 'Become a Super Fan') + ' ↗</a>';
        return '' +
          '<div class="store-set-card store-set-card--superfan' + (sfUnlocked ? ' fanclub-unlocked' : '') + '" style="--set-color: #ffd700">' +
            '<div class="fanclub-hero superfan-hero">' +
              '<video class="superfan-hero-video" src="/cosmetics/superfan-hero.mp4" poster="/cosmetics/superfan-hero-poster.jpg" autoplay muted loop playsinline></video>' +
              '<div class="superfan-hero-scrim"></div>' +
              '<img class="fanclub-hero-img superfan-hero-img" src="/cosmetics/superfan-heart.png" alt="" />' +
            '</div>' +
            '<div class="store-set-header">' +
              '<div>' +
                '<span class="store-set-name">' + escapeHtml(set.name) + '</span>' +
                '<span class="store-set-rarity" style="color:#ffd700">' + escapeHtml(set.rarity) + '</span>' +
              '</div>' +
              sfPill +
            '</div>' +
            '<div class="store-set-bar"><div class="store-set-bar-fill" style="width:' + pct + '%;background:linear-gradient(90deg,#ffd700,#a855f7)"></div></div>' +
            '<div class="store-set-dots">' + itemDots + '</div>' +
            '<div class="store-set-bonus">' + escapeHtml(set.setBonusLabel || '') + ' · exclusive Crown Burst win effect · video hero badge</div>' +
            '<div class="fanclub-cta-row">' + sfCta + '</div>' +
            '<div class="fanclub-footnote">' + (sfUnlocked
              ? 'Yours forever — granted the moment you chatted as a Super Fan.'
              : 'Subscribe as a Super Fan on TikTok and the full 9-piece set is granted automatically the next time you chat. Yours forever, even if the sub lapses.') + '</div>' +
          '</div>';
      }

      // ── Fan-Club-only sets: image hero + TikTok CTA ──
      if (set.fanClubOnly) {
        var fc = fanClubStatus || {};
        var fcUnlocked = !!(fc.granted || complete);
        var fcPill = fcUnlocked
          ? '<span class="fanclub-pill fanclub-pill--unlocked">Unlocked ✓</span>'
          : (fc.queued
              ? '<span class="fanclub-pill fanclub-pill--queued">Queued — link TikTok to claim</span>'
              : '<span class="fanclub-pill fanclub-pill--locked">Locked</span>');
        var fcCta = fcUnlocked
          ? '<a class="store-buy-btn fanclub-cta-view" href="/profile">View in your Suite</a>'
          : '<a class="store-buy-btn fanclub-cta-join" href="' + escapeHtml(set.unlockUrl || 'https://www.tiktok.com/@jorrybeaufart') + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(set.unlockLabel || 'Join Fan Club on TikTok') + ' ↗</a>';

        return '' +
          '<div class="store-set-card store-set-card--fanclub' + (fcUnlocked ? ' fanclub-unlocked' : '') + '" style="--set-color: #FE2C55">' +
            '<div class="fanclub-hero">' +
              '<div class="fanclub-hero-aurora"></div>' +
              '<div class="fanclub-hero-sheen"></div>' +
              '<div class="fanclub-hero-motes"></div>' +
              '<div class="fanclub-hero-heart">' +
                '<span class="fanclub-hero-ring"></span>' +
                '<span class="fanclub-hero-ring"></span>' +
                '<img class="fanclub-hero-img" src="/cosmetics/fanclub-heart.png" alt="" />' +
              '</div>' +
              '<div class="fanclub-hero-glow"></div>' +
            '</div>' +
            '<div class="store-set-header">' +
              '<div>' +
                '<span class="store-set-name">' + escapeHtml(set.name) + '</span>' +
                '<span class="store-set-rarity" style="color:#FE2C55">' + escapeHtml(set.rarity) + '</span>' +
              '</div>' +
              fcPill +
            '</div>' +
            '<div class="store-set-bar"><div class="store-set-bar-fill" style="width:' + pct + '%;background:#FE2C55"></div></div>' +
            '<div class="store-set-dots">' + itemDots + '</div>' +
            '<div class="store-set-bonus">' + escapeHtml(set.setBonusLabel || '') + '</div>' +
            '<div class="fanclub-cta-row">' + fcCta + '</div>' +
            '<div class="fanclub-footnote">' + (fcUnlocked
              ? 'Auto-equipped in empty slots. Visible only in streams where you\'re a fan-club member.'
              : "Join any TikTok streamer's fan club (e.g. @jorrybeaufart). The cosmetics show in chat + games for that streamer's stream only.") + '</div>' +
          '</div>';
      }

      var costHtml;
      if (complete) {
        costHtml = '<div class="store-set-cost store-set-complete-label">Complete!</div>';
      } else if (set.giftSet) {
        var giftCoins = (profile && profile.profile && profile.profile.giftCoins) || 0;
        var canAffordSet = giftCoins >= (set.totalCost || 0);
        costHtml = '<div class="store-set-cost-row"><span class="store-set-cost">' + STORE_SYMBOL + ' ' + formatNumber(set.totalCost || 0) + ' gift XP</span><button class="store-buy-btn store-buy-gift" onclick="portalBuySet(\'' + key + '\')" ' + (canAffordSet ? '' : 'disabled') + '>Buy Set</button></div>';
      } else {
        costHtml = '<div class="store-set-cost">Set: ' + formatNumber(set.totalCost) + '</div>';
      }

      return '' +
        '<div class="store-set-card' + (complete ? ' complete' : '') + '" style="--set-color: ' + color + '">' +
          '<div class="store-set-header">' +
            '<div>' +
              '<span class="store-set-name">' + escapeHtml(set.name) + '</span>' +
              '<span class="store-set-rarity" style="color:' + color + '">' + set.rarity + '</span>' +
            '</div>' +
            '<span class="store-set-progress">' + owned + '/' + total + '</span>' +
          '</div>' +
          '<div class="store-set-bar"><div class="store-set-bar-fill" style="width:' + pct + '%;background:' + color + '"></div></div>' +
          '<div class="store-set-dots">' + itemDots + '</div>' +
          '<div class="store-set-bonus">' + escapeHtml(set.setBonusLabel || '') + '</div>' +
          costHtml +
        '</div>';
    }).join('');

    section.innerHTML =
      '<h3 class="vr-sets-title">Cosmetic Sets</h3>' +
      '<div class="store-sets-grid">' + setsHtml + '</div>';
  }

  /* ── store guidance card (adapted: no portal tab jumps) ──────────── */
  function renderStoreGuidance() {
    var el = document.getElementById('store-guidance');
    if (!el) return;
    var currentProfile = profile && profile.profile;
    if (!currentProfile) {
      el.innerHTML = '<div class="loading-placeholder">Link your account to see store guidance.</div>';
      return;
    }

    var filtered = getStoreFiltered();
    var xpBalance = Number(currentProfile.coins || 0);
    var giftBalance = Number(currentProfile.giftCoins || 0);
    var affordable = storeItems.filter(function (item) {
      return item && !item.giftSet && Number(item.cost || 0) > 0 && Number(item.cost || 0) <= xpBalance;
    }).length;
    var giftSetReady = Object.values(shopSets || {}).filter(function (set) {
      return set && set.giftSet && Number(set.totalCost || 0) > 0 && Number(set.totalCost || 0) <= giftBalance;
    }).length;
    var ultraItems = storeItems.filter(function (item) { return item && item.rarity === 'ultra'; }).length;

    var title = 'Preview before you spend.';
    var copy = 'Cosmetics change how your profile, name, border, and win effects look. XP buys catalog items, and gift XP buys gift sets.';
    if (giftSetReady > 0) {
      title = giftSetReady + ' gift set' + (giftSetReady === 1 ? ' is' : 's are') + ' ready.';
      copy = 'Gift XP can only be used on gift sets. If you want the fastest visible upgrade, check the set section before spending regular XP.';
    } else if (affordable > 0) {
      title = affordable + ' store item' + (affordable === 1 ? '' : 's') + ' are affordable right now.';
      copy = 'Use price sorting to grab a quick upgrade, or preview rarer cosmetics first so you know what you want to save for.';
    }

    function metric(label, value, subcopy, accent) {
      return '<div class="reward-guide-metric' + (accent ? ' ' + accent : '') + '">' +
        '<div class="reward-guide-metric-label">' + escapeHtml(label) + '</div>' +
        '<div class="reward-guide-metric-value">' + escapeHtml(value) + '</div>' +
        '<div class="reward-guide-metric-sub">' + escapeHtml(subcopy) + '</div>' +
      '</div>';
    }

    el.innerHTML =
      '<div class="reward-guide-head">' +
        '<div class="reward-guide-kicker">Store guide</div>' +
        '<div class="reward-guide-title">' + escapeHtml(title) + '</div>' +
        '<div class="reward-guide-copy">' + escapeHtml(copy) + '</div>' +
      '</div>' +
      '<div class="reward-guide-grid">' +
        metric('XP', formatNumber(xpBalance), affordable + ' catalog item' + (affordable === 1 ? '' : 's') + ' affordable', 'mint') +
        metric('Gift XP', formatNumber(giftBalance), giftSetReady + ' set' + (giftSetReady === 1 ? '' : 's') + ' within reach', 'gold') +
        metric('Filtered view', formatNumber(filtered.length) + ' items', 'Current store filters', 'blue') +
        metric('Ultra items', formatNumber(ultraItems), 'Endgame cosmetics with buffs', 'violet') +
      '</div>' +
      '<div class="reward-guide-actions">' +
        '<button type="button" class="reward-guide-action primary" onclick="openStoreAffordableView()">Show Affordable Items</button>' +
        '<button type="button" class="reward-guide-action" onclick="document.getElementById(\'store-sets-section\').scrollIntoView({behavior:\'smooth\'})">Jump To Gift Sets</button>' +
      '</div>';
  }

  window.openStoreAffordableView = function () {
    ['store-cat-filter', 'store-rarity-filter', 'store-set-filter', 'store-buff-filter'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = 'all';
    });
    var sort = document.getElementById('store-sort');
    if (sort) sort.value = 'price-asc';
    renderStoreGrid();
    document.getElementById('store-grid').scrollIntoView({ behavior: 'smooth' });
  };

  /* ── buy flows (verbatim from the SPA) ───────────────────────────── */
  window.portalBuyCosmetic = async function (cosmeticId) {
    var btn = document.querySelector('.store-buy-btn[onclick*="\'' + cosmeticId + '\'"]');
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="biz-btn-spinner"></span>'; }
    try {
      var res = await fetch('/api/me/cosmetics/buy', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosmeticId: cosmeticId })
      });
      var data = await res.json();
      if (data.ok) {
        showToast(data.message || 'Purchased!');
        if (data.coins !== undefined) profile.profile.coins = data.coins;
        if (data.cosmetics) profile.cosmetics = data.cosmetics;
        updateStoreCoinBalance();
        renderStoreGrid();
        renderStoreSets();
      } else {
        showToast(data.message || 'Purchase failed');
        if (btn) { btn.disabled = false; btn.textContent = 'Buy'; }
      }
    } catch (e) {
      showToast('Server error — try again');
      if (btn) { btn.disabled = false; btn.textContent = 'Buy'; }
    }
  };

  window.portalBuySet = async function (setKey) {
    var btns = document.querySelectorAll('.store-buy-gift[onclick*="\'' + setKey + '\'"]');
    btns.forEach(function (btn) { btn.disabled = true; btn.innerHTML = '<span class="biz-btn-spinner"></span>'; });
    try {
      var res = await fetch('/api/me/cosmetics/buyset', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ setKey: setKey })
      });
      var data = await res.json();
      if (data.ok) {
        showToast(data.message || 'Set purchased!');
        if (data.giftCoins !== undefined) profile.profile.giftCoins = data.giftCoins;
        if (data.cosmetics) profile.cosmetics = data.cosmetics;
        updateStoreCoinBalance();
        renderStoreGrid();
        renderStoreSets();
      } else {
        showToast(data.message || 'Purchase failed');
        btns.forEach(function (btn) { btn.disabled = false; btn.textContent = 'Buy Set'; });
      }
    } catch (e) {
      showToast('Server error — try again');
      btns.forEach(function (btn) { btn.disabled = false; btn.textContent = 'Buy Set'; });
    }
  };

  /* Pookie Pass CTA on the Super Donor card — same Stripe checkout the
     /membership page uses. */
  window.vaultPookieCheckout = async function (btn) {
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Redirecting…';
    try {
      var res = await fetch('/api/me/pass/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier: 'pookie_pass' })
      });
      var data = await res.json();
      if (!res.ok || !data.ok || !data.url) {
        showToast(data.message || data.error || 'Membership checkout is not configured yet');
        btn.disabled = false; btn.textContent = original;
        return;
      }
      window.location.href = data.url;
    } catch (e) {
      showToast('Membership checkout failed');
      btn.disabled = false; btn.textContent = original;
    }
  };

  /* ── boot ────────────────────────────────────────────────────────── */
  function setupStore() {
    ['store-cat-filter', 'store-rarity-filter', 'store-set-filter', 'store-buff-filter', 'store-sort'].forEach(function (id) {
      document.getElementById(id).addEventListener('change', renderStoreGrid);
    });
    document.getElementById('store-preview-reset').addEventListener('click', resetStorePreview);
  }

  function showGuest() {
    document.getElementById('vaultBooting').hidden = true;
    document.getElementById('vaultGuest').hidden = false;
  }

  async function boot() {
    if (window.WTToon) WTToon.wireToggle(document.getElementById('skyToggle'));
    setupStore();

    var profRes;
    try {
      profRes = await fetch('/api/me/profile', { credentials: 'same-origin' });
    } catch (e) {
      document.getElementById('vaultBooting').textContent = 'The vault is unreachable right now — try again in a minute.';
      return;
    }
    if (profRes.status === 401) { showGuest(); return; }
    try {
      profile = await profRes.json();
    } catch (e) { showGuest(); return; }

    try {
      var results = await Promise.all([
        fetch('/api/me/shop', { credentials: 'same-origin' }),
        fetch('/api/me/sets', { credentials: 'same-origin' }),
        fetch('/api/me/fanclub-status', { credentials: 'same-origin' }).catch(function () { return null; })
      ]);
      var shopData = await results[0].json();
      if (Array.isArray(shopData)) {
        storeItems = shopData;
      } else {
        storeItems = [];
        Object.entries(shopData).forEach(function (entry) {
          (entry[1] || []).forEach(function (item) {
            if (!item.category) item.category = entry[0];
            storeItems.push(item);
          });
        });
      }
      var setsData = await results[1].json();
      shopSets = setsData.sets || setsData;
      if (results[2] && results[2].ok) {
        try { fanClubStatus = await results[2].json(); } catch (e) { fanClubStatus = null; }
      }
    } catch (e) {
      document.getElementById('vaultBooting').textContent = 'The vault is unreachable right now — try again in a minute.';
      return;
    }

    // Reveal BEFORE rendering: PfpCosmetics sizes rings from offsetWidth,
    // and a display:none stage measures 0 — the ring never appears.
    document.getElementById('vaultBooting').hidden = true;
    document.getElementById('vaultRoom').hidden = false;

    updateStoreCoinBalance();
    renderStoreGrid();
    renderStoreSets();
    renderStoreGuidance();
    initStorePreview();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
