/* ════════════════════════════════════════════════════════════════════
   YOUR SUITE — /profile
   Standalone replacement for the portal SPA's "profile" tab.

   Data and behaviour are lifted from portal.js unchanged — same
   endpoints (/api/me/session, /api/me/profile, /api/me/prefs), same
   field names, same fallbacks. Only the markup and styling are new.
   The small helpers below (resolveAvatar, formatNumber, prettyGameName)
   are copies of portal.js's, so this page does not have to pull in
   11k lines to render a nameplate.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var $ = function (sel) { return document.querySelector(sel); };
  var byId = function (id) { return document.getElementById(id); };

  /* ── helpers (mirrors of portal.js) ──────────────────────────────── */

  var AVATAR_FALLBACK = '/portal/img/logo.png';

  function resolveAvatar(url) {
    if (!url) return AVATAR_FALLBACK;
    // Discord's embed/default avatars show up when the account has none of its own
    if (url.indexOf('cdn.discordapp.com/embed/avatars/') !== -1) return AVATAR_FALLBACK;
    return url;
  }

  function isLogoUrl(url) {
    if (!url) return false;
    return url.indexOf('logo.png') !== -1 || url.indexOf('/profile-logos/') !== -1;
  }

  // CSS switches to object-fit:contain when the avatar is really the WT logo,
  // otherwise the logo gets cropped into an unreadable blob.
  function markAvatarFallback(img) {
    img.classList.toggle('avatar-is-logo', !!(img.src && isLogoUrl(img.src)));
  }

  function formatNumber(n) {
    if (n == null) return '–';
    n = Number(n);
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }

  var GAME_NAMES = {
    word500: 'Word5000', word5000: 'Word5000', word1000: 'Word5000 Solo', wordle: 'Wordle',
    betwixt: 'Betwixt', betweenly: 'Betwixt', figural: 'Figural', pixeletters: 'PixeLetters',
    unwordle: 'UnWordle', rectangled: 'recTangled', erectangled: 'erecTangled', sproutle: 'erecTangled',
    subtextle: 'Subtextle', searchle: 'Subtextle', spellingbee: 'Spelling Bee', 'spelling-bee': 'Spelling Bee',
    triangled: 'Triangled', arcade: 'Arcade',
    wikicontexto: 'WikiContexto', wikisearchle: 'WikiContexto',
    wikirectangled: 'WikirecTangled', junkdrawer: 'Junk Drawer', cloudquarry: 'Cloud Quarry', synapse: 'Synapse', letterworks: 'Letterworks', wordfall: 'Wordfall'
  };
  function prettyGameName(id) {
    return GAME_NAMES[id] || String(id || '').replace(/[-_]/g, ' ')
      .replace(/\b\w/g, function (ch) { return ch.toUpperCase(); });
  }

  function showToast(message, type) {
    var host = byId('toasts');
    if (!host) return;
    var t = document.createElement('div');
    t.className = 'toast' + (type ? ' toast-' + type : '');
    t.textContent = message;
    host.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { t.remove(); }, 400);
    }, 3600);
  }

  function setText(id, value) {
    var el = byId(id);
    if (el) el.textContent = value;
  }

  /* ── cosmetics ───────────────────────────────────────────────────── */

  var RARITY_COLORS = {
    common: '#9d9d9d', uncommon: '#4fc34f', rare: '#4a9eff', epic: '#b44aff',
    legendary: '#ffab00', ultra: '#ff4444', aux: '#00ffcc'
  };
  var RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, ultra: 5, aux: 6 };
  var CATEGORY_LABELS = {
    word_color: 'Word Colors', word_glow: 'Word Glows', profile_border: 'Borders',
    profile_glow: 'Glows', name_glow: 'Name Glows', name_color: 'Name Colors',
    title: 'Titles', win_effect: 'Win Effects', hero_badge: 'Hero Badges'
  };
  // Order the filter chips deliberately rather than by whatever the API returns.
  var CATEGORY_ORDER = ['title', 'name_color', 'name_glow', 'word_color', 'word_glow',
    'profile_border', 'profile_glow', 'hero_badge', 'win_effect'];

  var owned = [];        // every cosmetic the player owns
  var filterCat = 'equipped';
  var sortMode = 'default';

  // Every cosmetic carries its own css_property, so unlike the SPA this page
  // never has to fetch the shop catalog to know what an item looks like.
  function cosCss(c) {
    if (!c || !c.css_property) return null;
    if (typeof c.css_property === 'object') return c.css_property;
    try { return JSON.parse(c.css_property); } catch (e) { return null; }
  }

  // Values come from the server and land in inline styles, so strip anything
  // that could break out of the declaration.
  function safeCss(val) {
    if (val == null || typeof val !== 'string') return '';
    return val.replace(/[;"'<>\\]/g, '');
  }

  // Vendor-prefixed camelCase (webkitBackgroundClip) needs the LEADING dash
  // or the declaration is dropped and gradient text renders as a solid box.
  function camelToKebab(str) {
    var kebab = String(str).replace(/([A-Z])/g, '-$1').toLowerCase();
    return /^(webkit|moz|ms|o)-/.test(kebab) ? '-' + kebab : kebab;
  }

  // Apply a css_property object to an element, skipping the keys that are
  // data rather than style (win effects) and handling animation separately.
  var NON_STYLE_KEYS = { title: 1, colors: 1, effect: 1, duration: 1, particleCount: 1 };
  function applyCss(el, css) {
    if (!el || !css) return;
    Object.keys(css).forEach(function (k) {
      if (NON_STYLE_KEYS[k]) return;
      var v = css[k];
      if (typeof v !== 'string' && typeof v !== 'number') return;
      try { el.style.setProperty(camelToKebab(k), safeCss(String(v))); } catch (e) {}
    });
  }

  function equippedIn(category) {
    for (var i = 0; i < owned.length; i++) {
      if (owned[i].category === category && owned[i].equipped) return owned[i];
    }
    return null;
  }

  /* ── the mirror: what you actually look like in chat ─────────────── */

  // Build the { category: css } map the shared appliers expect.
  function equippedCssMap() {
    var map = {};
    owned.forEach(function (c) {
      if (!c.equipped) return;
      var css = cosCss(c);
      if (css) map[c.category] = css;
    });
    return map;
  }

  function renderMirror(profilePic) {
    var av = byId('mirAv');
    var shell = byId('mirAvShell');
    if (av && profilePic) {
      av.src = profilePic;
      av.onerror = function () { this.onerror = null; this.src = AVATAR_FALLBACK; markAvatarFallback(this); };
      markAvatarFallback(av);
    }

    var name = byId('mirName');
    var word = byId('mirWord');
    var title = byId('mirTitle');
    var badge = byId('mirBadge');
    if (!name || !word || !title || !badge) return;

    var cos = equippedCssMap();
    var FX = window.CosmeticsFx;
    var Pfp = window.PfpCosmetics;

    // Reset first — equipping is a swap, not an accumulation. Without this the
    // previous title's glow survives onto the next one.
    if (FX) { FX.clearText(name); FX.clearText(word); FX.clearText(title); }
    else { [name, word, title].forEach(function (el) { el.style.cssText = ''; }); }
    badge.style.cssText = '';
    badge.classList.remove('has-hero-badge');
    if (Pfp && shell) Pfp.clear(shell);

    if (Pfp && shell) {
      // Ring + glow + name + title + badge, exactly as the SPA renders them.
      // wordEl is deliberately omitted: PfpCosmetics.spawnWord is a transient
      // hold-then-fade effect, and a mirror needs to hold the look.
      Pfp.applyAll({ avatarEl: av, shellEl: shell, nameEl: name, titleEl: title, badgeEl: badge }, cos);
    } else if (FX) {
      FX.applyText(name, cos.name_color || {});
      if (cos.name_glow && cos.name_glow.textShadow) name.style.textShadow = cos.name_glow.textShadow;
      FX.applyTitle(title, cos.title || {});
      applyCss(badge, cos.hero_badge);
    }

    // The word is painted statically so you can actually see it.
    if (FX) {
      FX.applyText(word, cos.word_color || {});
      if (cos.word_glow) {
        if (cos.word_glow.textShadow) word.style.textShadow = cos.word_glow.textShadow;
        if (cos.word_glow.animation && !word.style.animation) word.style.animation = cos.word_glow.animation;
      }
    } else {
      applyCss(word, cos.word_color);
      applyCss(word, cos.word_glow);
    }

    var t = equippedIn('title');
    title.textContent = t ? ((cos.title && cos.title.title) || t.name || '') : '';

    // Say what's on, so the mirror explains itself.
    var on = owned.filter(function (c) { return c.equipped; });
    var foot = byId('mirFoot');
    if (foot) {
      foot.textContent = on.length
        ? on.length + ' equipped · ' + on.map(function (c) { return c.name; }).join(', ')
        : 'Nothing equipped yet — pick something from the rack.';
    }
  }

  /* ── the rack ────────────────────────────────────────────────────── */

  function buildSwatch(c) {
    var sw = document.createElement('div');
    sw.className = 'cos-swatch';
    var css = cosCss(c);

    var FX = window.CosmeticsFx;

    if (c.category === 'profile_border' || c.category === 'profile_glow') {
      var ring = document.createElement('div');
      ring.className = 'ring';
      if (FX && c.category === 'profile_border') {
        // applyRing handles conic-gradient rings (border:transparent +
        // background-origin:border-box), which a naive copy renders invisible.
        FX.applyRing(ring, css);
        if (css && css.boxShadow) ring.style.boxShadow = css.boxShadow;
      } else {
        applyCss(ring, css);
      }
      sw.appendChild(ring);
    } else if (c.category === 'hero_badge') {
      var b = document.createElement('div');
      b.className = 'badge';
      applyCss(b, css);
      sw.appendChild(b);
    } else if (c.category === 'win_effect') {
      var dots = document.createElement('div');
      dots.className = 'dots';
      ((css && css.colors) || []).slice(0, 5).forEach(function (col) {
        var d = document.createElement('span');
        d.className = 'dot';
        d.style.background = safeCss(col);
        dots.appendChild(d);
      });
      sw.appendChild(dots);
    } else if (c.category === 'title') {
      var ttl = document.createElement('span');
      ttl.className = 'ttl';
      ttl.textContent = (css && css.title) || c.name || 'Title';
      if (FX) FX.applyTitle(ttl, css || {});   // handles titleBackground sweeps
      else if (css) {
        if (css.titleColor) ttl.style.color = safeCss(css.titleColor);
        if (css.titleGlow) ttl.style.textShadow = safeCss(css.titleGlow);
      }
      sw.appendChild(ttl);
    } else {
      // name_color / name_glow / word_color / word_glow — all text materials,
      // including the gradient-text ones that need the -webkit-* trio.
      var aa = document.createElement('span');
      aa.textContent = 'Aa';
      if (FX) FX.applyText(aa, css || {});
      else applyCss(aa, css);
      sw.appendChild(aa);
    }
    return sw;
  }

  function buildCard(c) {
    var card = document.createElement('div');
    card.className = 'cos' + (c.equipped ? ' is-equipped' : '');

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cos-btn';
    btn.textContent = c.equipped ? 'Equipped' : 'Equip';
    btn.addEventListener('click', function () { toggleCosmetic(c, btn); });
    card.appendChild(btn);

    card.appendChild(buildSwatch(c));

    var nm = document.createElement('div');
    nm.className = 'cos-name';
    nm.textContent = c.name || '';           // textContent, never innerHTML
    card.appendChild(nm);

    var cat = document.createElement('div');
    cat.className = 'cos-cat';
    cat.textContent = CATEGORY_LABELS[c.category] || c.category || '';
    card.appendChild(cat);

    var rar = document.createElement('div');
    rar.className = 'cos-rar';
    rar.textContent = c.rarity || '';
    rar.style.background = RARITY_COLORS[c.rarity] || '#888';
    card.appendChild(rar);

    if (c.buff && (c.buff.label || c.buff.type)) {
      var bf = document.createElement('div');
      bf.className = 'cos-buff';
      bf.textContent = c.buff.label || c.buff.type;
      card.appendChild(bf);
    }

    // `seen` is account-level (comes back on the cosmetic), not per-browser.
    if (!c.seen) {
      var nw = document.createElement('div');
      nw.className = 'cos-new';
      nw.textContent = 'New';
      card.appendChild(nw);
    }
    return card;
  }

  function renderRack() {
    var grid = byId('rackGrid');
    if (!grid) return;

    var items = owned.slice();
    if (filterCat === 'equipped') items = items.filter(function (c) { return c.equipped; });
    else if (filterCat !== 'all') items = items.filter(function (c) { return c.category === filterCat; });

    if (sortMode === 'rarity-desc') items.sort(function (a, b) { return (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0); });
    else if (sortMode === 'rarity-asc') items.sort(function (a, b) { return (RARITY_RANK[a.rarity] || 0) - (RARITY_RANK[b.rarity] || 0); });
    else if (sortMode === 'name') items.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });

    grid.textContent = '';
    if (!items.length) {
      var empty = document.createElement('div');
      empty.className = 'rack-empty';
      empty.textContent = filterCat === 'equipped'
        ? 'Nothing equipped yet — pick a category above.'
        : 'Nothing owned in this category yet.';
      grid.appendChild(empty);
      return;
    }
    var frag = document.createDocumentFragment();
    items.forEach(function (c) { frag.appendChild(buildCard(c)); });
    grid.appendChild(frag);
  }

  function renderFilters() {
    var host = byId('rackFilters');
    var sort = byId('rackSort');
    if (!host || !sort) return;

    // Rebuild the chips, keeping the sort control in place.
    Array.prototype.slice.call(host.querySelectorAll('.cat-chip')).forEach(function (n) { n.remove(); });

    var counts = {};
    owned.forEach(function (c) { counts[c.category] = (counts[c.category] || 0) + 1; });
    var equippedCount = owned.filter(function (c) { return c.equipped; }).length;

    var chips = [
      { key: 'equipped', label: 'Equipped', n: equippedCount },
      { key: 'all', label: 'All', n: owned.length }
    ].concat(CATEGORY_ORDER.filter(function (k) { return counts[k]; }).map(function (k) {
      return { key: k, label: CATEGORY_LABELS[k] || k, n: counts[k] };
    }));

    var frag = document.createDocumentFragment();
    chips.forEach(function (ch) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat-chip' + (ch.key === filterCat ? ' on' : '');
      b.textContent = ch.label;
      var n = document.createElement('span');
      n.className = 'n';
      n.textContent = ch.n;
      b.appendChild(n);
      b.addEventListener('click', function () {
        filterCat = ch.key;
        renderFilters();
        renderRack();
      });
      frag.appendChild(b);
    });
    host.insertBefore(frag, sort);
  }

  async function toggleCosmetic(c, btn) {
    var wasEquipped = !!c.equipped;
    if (btn) btn.disabled = true;
    try {
      var res = await fetch(wasEquipped ? '/api/me/cosmetics/unequip' : '/api/me/cosmetics/equip', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wasEquipped ? { category: c.category } : { cosmeticId: c.cosmetic_id })
      });
      var data = await res.json();
      if (!data || !data.ok) {
        showToast((data && (data.error || data.message)) || 'Could not change that.', 'error');
        return;
      }
      // One item per category: clear the category, then set this one.
      owned.forEach(function (o) { if (o.category === c.category) o.equipped = 0; });
      if (!wasEquipped) c.equipped = 1;
      showToast((wasEquipped ? 'Unequipped ' : 'Equipped ') + (c.name || ''), 'success');
      renderFilters();
      renderRack();
      renderMirror();
    } catch (e) {
      showToast('Could not reach the wardrobe.', 'error');
    } finally {
      if (btn) btn.disabled = false;
    }
  }

  // Clear the NEW tags account-wide once they've actually been on screen.
  function markSeen() {
    var unseen = owned.filter(function (c) { return !c.seen && c.cosmetic_id; })
      .map(function (c) { return c.cosmetic_id; });
    if (!unseen.length) return;
    fetch('/api/me/cosmetics/seen', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cosmeticIds: unseen.slice(0, 400) })
    }).catch(function () { /* the tag simply shows again next visit */ });
  }

  function wireRack() {
    var sort = byId('rackSort');
    if (sort) {
      sort.addEventListener('change', function () {
        sortMode = sort.value;
        renderRack();
      });
    }
  }

  /* ── view switching ──────────────────────────────────────────────── */

  function show(which) {
    ['guest', 'booting', 'suite'].forEach(function (id) {
      var el = byId(id);
      if (el) el.hidden = (id !== which);
    });
  }

  function renderAccountLinks(data) {
    var list = byId('accountLinks');
    if (!list) return;
    list.replaceChildren();
    var names = { discord: 'Discord', github: 'GitHub', google: 'Google', tiktok: 'TikTok', youtube: 'YouTube', twitch: 'Twitch', kick: 'Kick' };
    var seen = new Set();
    ((data.profile || {}).platforms || []).forEach(function (p) {
      if (!p || typeof p.platform !== 'string' || !Object.prototype.hasOwnProperty.call(names, p.platform) || seen.has(p.platform)) return;
      seen.add(p.platform);
      var label = document.createElement('span');
      label.className = 'chip';
      label.textContent = names[p.platform] + ' connected';
      list.appendChild(label);
    });
    if (data.provider === 'discord') {
      ['github', 'tiktok'].forEach(function (provider) {
        if (seen.has(provider)) return;
        var link = document.createElement('a');
        link.className = 'mini-btn';
        link.href = '/auth/' + provider + '?action=link&returnTo=%2Fprofile';
        link.textContent = 'Link ' + names[provider] + ' Account';
        list.appendChild(link);
      });
    }
    setText('accountLinkHelp', data.provider === 'discord'
      ? 'Link GitHub or TikTok to share your Discord account. Stream links can also be added with !link in chat.'
      : 'Standalone sign-in accounts can play directly. To link stream identities, sign in with your Discord anchor and use !link in chat.');
  }

  /* ── render ──────────────────────────────────────────────────────── */

  function render(data) {
    renderAccountLinks(data);
    var p = data.profile || {};
    var career = p.careerStats || {};
    var prefs = data.preferences || {};

    // Avatar — a custom upload always beats the platform picture.
    // NOTE: the API returns `custom_avatar_url` (snake_case); portal.js reads
    // `customAvatarUrl`, which is always undefined. Accept both.
    var customAvatar = prefs.custom_avatar_url || prefs.customAvatarUrl;
    var av = byId('av');
    if (av) {
      av.src = resolveAvatar(customAvatar || p.profilePic);
      av.onerror = function () { this.onerror = null; this.src = AVATAR_FALLBACK; markAvatarFallback(this); };
      av.onload = function () { markAvatarFallback(this); };
      markAvatarFallback(av);
    }

    setText('plName', p.displayName || 'Player');

    // Equipped title, if they have one on.
    var title = (data.cosmetics || []).filter(function (c) {
      return c.category === 'title' && c.equipped;
    })[0];
    var titleEl = byId('plTitle');
    if (titleEl) {
      titleEl.hidden = !title;
      if (title) titleEl.textContent = title.name;
    }

    // Membership tier reads as the "suite class" under the name. The field is
    // passStats.membershipTier — there is no passStats.tier.
    var pass = p.passStats || {};
    var TIERS = { free: 'Ground Floor', donor_class: 'Donor Class', pookie_pass: 'Pookie Pass' };
    var tier = pass.membershipTier;
    var label = tier ? (TIERS[tier] || String(tier)) : '';
    // A cancelled pass still grants its tier until it lapses, so say both
    // rather than showing it as a plain active membership.
    if (label && pass.membershipStatus && pass.membershipStatus !== 'active') {
      label += ' · ' + String(pass.membershipStatus);
    }
    setText('plSub', label);

    // Nameplate chips
    setText('chCoins', formatNumber(p.coins));
    setText('chWords', formatNumber(p.libraryWords || 0));
    setText('chWins', formatNumber(p.totalGameWins || 0));
    loadHints();

    // Headline four
    setText('sCoins', formatNumber(p.coins));
    setText('sTaps', formatNumber(p.totalTaps));
    setText('sWins', formatNumber(p.totalGameWins || 0));
    setText('sElo', formatNumber(p.globalElo || 1200));

    // Career wall
    setText('cWins', formatNumber(career.totalGameWins || p.totalGameWins || 0));
    setText('cStreak', formatNumber(career.longestStreak || 0));
    setText('cClaims', formatNumber(career.totalDailyClaims || 0));
    setText('cGift', formatNumber(p.giftCoins || 0));
    setText('cFav', career.favoriteGame ? prettyGameName(career.favoriteGame) : 'None yet');
    setText('cFavSub', career.favoriteGame
      ? formatNumber(career.favoriteGameWins || 0) + ' wins'
      : 'No wins yet');
    setText('cCos', formatNumber(career.cosmeticsOwned || 0));
    setText('cCosSub', formatNumber(career.cosmeticsEquipped || 0) + ' equipped');

    // Rename drawer seeds from the preferred name, falling back to the
    // linked account's name (same precedence portal.js uses).
    var input = byId('nameInput');
    if (input) {
      input.value = prefs.preferred_display_name || p.displayName || '';
      input.placeholder = p.displayName || 'Set your username';
    }

    /* ── wardrobe ── */
    owned = (data.cosmetics || []).slice();
    var collector = p.collectorStats || {};
    var collection = p.collectionStats || {};

    setText('kOwned', formatNumber(collector.cosmeticsOwned || owned.length));
    setText('kGenerated', formatNumber(collector.generatedOwned || 0));
    setText('kLegendary', formatNumber(collector.legendaryPlusOwned || 0));
    setText('kBadges', formatNumber(collector.heroBadgesOwned || 0));
    setText('kWinFx', formatNumber(collector.winEffectsOwned || 0));
    setText('kTitles', formatNumber(collector.titlesOwned || 0));
    setText('kEquippedSub', formatNumber(collector.cosmeticsEquipped || 0) + ' equipped');

    setText('kCatalog', formatNumber(collection.fixedCatalogOwned || 0));
    setText('kCatalogSub', 'of ' + formatNumber(collection.fixedCatalogTotal || 0));
    setText('kCompletion', collection.completionPct != null
      ? Number(collection.completionPct).toFixed(1) + '%' : '–');
    setText('kCatsDone', formatNumber(collection.categoriesCompleted || 0));
    setText('kCatsSub', 'of ' + formatNumber(collection.totalCategories || 0));

    // The mirror shows the same picture the nameplate does.
    renderMirror(resolveAvatar(customAvatar || p.profilePic));
    setText('mirName', p.displayName || 'Player');
    renderFilters();
    renderRack();
    markSeen();
  }

  /* ── rename ──────────────────────────────────────────────────────── */

  async function saveName(value) {
    var res = await fetch('/api/me/prefs', {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferred_display_name: value })
    });
    return res.json();
  }

  function wireRename() {
    var toggle = byId('btnRename');
    var box = byId('renameBox');
    var input = byId('nameInput');
    var save = byId('btnSave');
    var reset = byId('btnReset');

    if (toggle && box) {
      toggle.addEventListener('click', function () {
        box.hidden = !box.hidden;
        if (!box.hidden && input) input.focus();
      });
    }

    if (input && save) {
      input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); save.click(); }
      });
    }

    if (save) {
      save.addEventListener('click', async function () {
        var next = (input && input.value ? input.value.trim() : '').slice(0, 32);
        if (!next) { showToast('Enter a username or use Reset.', 'error'); return; }
        save.disabled = true; if (reset) reset.disabled = true;
        try {
          var result = await saveName(next);
          if (!result.ok) {
            showToast(result.error || result.message || 'Failed to save username.', 'error');
            return;
          }
          showToast('Username updated.', 'success');
          await load();
        } catch (e) {
          showToast('Failed to save username.', 'error');
        } finally {
          save.disabled = false; if (reset) reset.disabled = false;
        }
      });
    }

    if (reset) {
      reset.addEventListener('click', async function () {
        reset.disabled = true; if (save) save.disabled = true;
        try {
          var result = await saveName(null);
          if (!result.ok) {
            showToast(result.error || result.message || 'Failed to reset username.', 'error');
            return;
          }
          showToast('Username reset to your linked account name.', 'success');
          await load();
        } catch (e) {
          showToast('Failed to reset username.', 'error');
        } finally {
          reset.disabled = false; if (save) save.disabled = false;
        }
      });
    }
  }

  async function loadHints() {
    try {
      var res = await fetch('/api/me/hints', { credentials: 'same-origin' });
      if (!res.ok) return;
      var data = await res.json();
      if (data.ok && data.loggedIn) {
        setText('chHints', formatNumber(data.remaining));
      }
    } catch (e) { /* ignore */ }
  }

  /* ── hint recharge ───────────────────────────────────────────────── */

  function initHintRecharge() {
    var modal = byId('rechargeModal');
    var btn = byId('btnRechargeHints');
    var close = byId('rechargeClose');
    var backdrop = byId('rechargeBackdrop');
    var cancel = byId('rechargeCancel');
    var presets = byId('rechargePresets');
    var custom = byId('rechargeCustom');
    var customGo = byId('rechargeCustomGo');
    var customHints = byId('rechargeCustomHints');
    var status = byId('rechargeStatus');
    if (!modal || !btn) return;

    function setStatus(msg, cls) {
      if (!status) return;
      status.className = 'recharge-status' + (cls ? ' ' + cls : '');
      status.textContent = msg || '';
    }

    var previousFocus = null;
    var sheet = modal.querySelector('[role="dialog"]');
    function open() {
      previousFocus = document.activeElement;
      modal.hidden = false; setStatus(''); if (custom) custom.value = ''; updateCustomHints();
      if (close) close.focus(); else if (sheet) sheet.focus();
    }
    function closeModal() {
      modal.hidden = true; setStatus('');
      if (previousFocus && previousFocus.isConnected) previousFocus.focus();
    }
    modal.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); return; }
      if (e.key !== 'Tab' || !sheet) return;
      var controls = Array.from(sheet.querySelectorAll('button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),[tabindex="0"]'))
        .filter(function (el) { return el.getClientRects().length; });
      if (!controls.length) { e.preventDefault(); sheet.focus(); return; }
      var first = controls[0], last = controls[controls.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
        e.preventDefault(); last.focus();
      } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    function updateCustomHints() {
      if (!customHints) return;
      var dollars = Math.max(0, Math.floor(Number(custom && custom.value) || 0));
      customHints.textContent = formatNumber(dollars * 10);
    }

    async function buy(dollars) {
      dollars = Math.max(1, Math.min(100, Math.floor(Number(dollars) || 0)));
      setStatus('Opening secure checkout…', 'busy');
      try {
        var res = await fetch('/api/me/hints/recharge/checkout', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dollars: dollars })
        });
        var data = await res.json();
        if (!res.ok || !data.ok) {
          setStatus(data.message || data.error || 'Checkout failed. Try again.', 'error');
          return;
        }
        if (data.url) {
          window.location.href = data.url;
        } else {
          setStatus('Checkout link missing.', 'error');
        }
      } catch (e) {
        setStatus('Network error. Try again.', 'error');
      }
    }

    btn.addEventListener('click', open);
    if (close) close.addEventListener('click', closeModal);
    if (backdrop) backdrop.addEventListener('click', closeModal);
    if (cancel) cancel.addEventListener('click', closeModal);
    if (custom) custom.addEventListener('input', updateCustomHints);
    if (customGo) customGo.addEventListener('click', function () { buy(custom && custom.value); });
    if (presets) {
      presets.addEventListener('click', function (e) {
        var target = e.target.closest('button[data-dollars]');
        if (!target) return;
        buy(target.getAttribute('data-dollars'));
      });
    }
    updateCustomHints();
  }

  /* ── boot ────────────────────────────────────────────────────────── */

  async function load() {
    try {
      var res = await fetch('/api/me/profile', { credentials: 'same-origin' });
      // 401/403 means no session — that's the guest suite, not an error.
      if (res.status === 401 || res.status === 403) { show('guest'); return; }
      var data = await res.json();
      if (!data || !data.ok || !data.profile) { show('guest'); return; }
      // Reveal BEFORE rendering: PfpCosmetics sizes the avatar ring from the
      // shell's measured width, and a display:none shell measures 0 — which it
      // treats as "no layout yet", leaving the ring and glow off permanently.
      show('suite');
      render(data);
    } catch (e) {
      // Network/parse failure: keep the guest door rather than a broken room.
      show('guest');
      showToast('Could not reach your suite. Try again in a moment.', 'error');
    }
  }

  function checkCheckoutReturn() {
    var params = new URLSearchParams(window.location.search);
    if (params.get('error') === 'invalid_state') showToast('Sign-in expired or could not be verified. Please start again.', 'error');
    if (params.get('error') === 'already_linked') showToast('That provider account is already linked to another account.', 'error');
    if (params.get('linked') === 'success') showToast('Account linked successfully.', 'success');
    if (params.get('checkout') === 'success') {
      showToast('Payment successful! Your hints have been added.', 'success');
      loadHints();
    } else if (params.get('checkout') === 'cancelled') {
      showToast('Checkout cancelled — no charge was made.');
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    // The night class itself is restored by the inline snippet at the top of
    // <body>; this just wires the topbar toggle and keeps aria-pressed honest.
    if (window.WTToon) window.WTToon.wireToggle(byId('skyToggle'));
    wireRename();
    wireRack();
    initHintRecharge();
    load();
    checkCheckoutReturn();
  });
})();
