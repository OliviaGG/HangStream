/* ════════════════════════════════════════════════════════════════════
   WORD TYCOON — EMPIRE MODULE ("Toon Tower" skin, v2)
   One unified idle-tycoon screen for every business: buy, upgrade,
   collect, prestige, and staff (managers + foremen).

   v2 changes:
   • Rigid, uniform cards — every card face is the same fixed-row grid
     (head / income / xp / staff / action) so all 11 cards are exactly
     the same height at any viewport width, in any state. Cards never
     change size after render.
   • Management sheet — clicking a card (or Empire.open(type)) opens a
     toon-styled overlay (centered modal ≥900px, bottom sheet <900px)
     with upgrades, prestige, rename, style, collect, and staff.
     The old inline accordion is gone.
   • Foreman (auto-upgrade) UI on top of managers.
   • Mountable: Empire.mount(containerEl, deps) lets the module run
     outside the portal. deps = { getProfile, refreshProfile,
     buyBusiness, notify } — all optional, defaulting to the portal
     globals so portal behavior is unchanged. CSS is scoped under
     .emp-scope, which mount() adds to its container (and to the
     sheet/toast/burst roots appended to <body>).

   Exposes: window.Empire = { render(profile), open(type), refresh(),
     mount(containerEl, deps), ... }
   Loaded AFTER portal.js in the portal; may call existing portal
   globals through its DEFAULT deps only (escapeHtml, formatIncome,
   formatNumber, portalBuyBusiness, openArcade, openLibrary, profile,
   getBizCost, getBizIncomePerSec, getBizProgressionMult, ...).

   Demo mode: /me?empireDemo=1 renders built-in fixture data with
   NO network calls, so the page can be screenshot-verified on a
   static server while logged out. Fixtures include all three foreman
   states (hired / hireable / locked behind manager).
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var DEMO = /[?&]empireDemo=1(&|$)/.test(window.location.search);

  // ─── Business meta (order mirrors portal.js BUSINESS_DATA) ────────
  var BIZ_ORDER = ['library', 'newspaper', 'carwash', 'stockmogul', 'pizza',
    'arcade', 'gym', 'cinema', 'startup', 'bank', 'space'];

  var MANAGED = { newspaper: 1, carwash: 1, pizza: 1, stockmogul: 1, gym: 1, cinema: 1, startup: 1, bank: 1 };
  var MANAGED_COUNT = 8;

  var BIZ_META = {
    library:    { name: 'Library',         emoji: '📚', c: '#4a9eff', c2: '#7cc0ff' },
    newspaper:  { name: 'Newspaper Route', emoji: '🗞️', c: '#ffab00', c2: '#ffd84d' },
    carwash:    { name: 'Car Wash',        emoji: '🚗', c: '#22d3ee', c2: '#8ae9f8' },
    stockmogul: { name: 'Stock Mogul',     emoji: '📈', c: '#44bb88', c2: '#86efac' },
    pizza:      { name: 'Pizza Shop',      emoji: '🍕', c: '#ff6b6b', c2: '#ffa3a3' },
    arcade:     { name: 'Arcade',          emoji: '🕹️', c: '#8a5cf7', c2: '#b3a6f6' },
    gym:        { name: 'Gym',             emoji: '🏋️', c: '#ff6b9d', c2: '#ffa3c2' },
    cinema:     { name: 'Movie Theater',   emoji: '🎬', c: '#7b68ee', c2: '#aa9cf5' },
    startup:    { name: 'Tech Startup',    emoji: '🚀', c: '#4fc34f', c2: '#8fe08f' },
    bank:       { name: 'Bank',            emoji: '🏦', c: '#f5a623', c2: '#ffd07a' },
    space:      { name: 'Space Agency',    emoji: '🛰️', c: '#00d5ee', c2: '#7deefb' }
  };

  // ─── Per-managed-type API shape (verified against portal.js loaders)
  //   newspaper: {ok, hasRoute, route:{routeLevel, routeXp, xpNeeded, routeName,
  //     prestigeLevel, prestigeTier, prestigeMultiplier, incomePerSecond, lastCollectedAt},
  //     playerCoins, pending:{xpEarned}, collectCap, availableUpgrades, availableCustomizations, upgrades, customizations}
  //   carwash: {ok, hasShop, shop:{shopLevel, shopXp, xpNeeded, shopName, cleanCash,
  //     cleanCashPerSec, cleanCashCap, ...}, pending:{cleanCash}, ...}
  //   stockmogul: {ok, hasPortfolio, portfolio:{portfolioLevel, portfolioXp, xpNeeded,
  //     portfolioName, cleanCash, portfolioCoins, portfolioCoinsCap, incomePerSecond, ...},
  //     pending:{portfolioCoins}, ...}
  //   pizza: {ok, hasShop, shop:{shopLevel, shopXp, xpNeeded, shopName, pizzaCoins,
  //     incomePerSecond, ...}, pending:{pizzaCoins}, ...}
  //   gym/cinema/startup/bank: {ok, has<X>, <x>:{<x>Level, <x>Xp, xpNeeded, <x>Name,
  //     incomePerSecond, lastCollectedAt, ...}, playerCoins, pending:{xpEarned}, collectCap, ...}
  //   GET /api/tycoon/managers additionally returns:
  //     foremen: {[type]:{hired,hiredAt}}
  //     foremanCatalog: {[type]:{name,emoji,cost,hired,requiresManager}}
  var API = {
    newspaper:  { hasKey: 'hasRoute',     stateKey: 'route',     levelKey: 'routeLevel',     xpKey: 'routeXp',     nameKey: 'routeName',     wallet: 'coins', collectUnit: 'XP' },
    carwash:    { hasKey: 'hasShop',      stateKey: 'shop',      levelKey: 'shopLevel',      xpKey: 'shopXp',      nameKey: 'shopName',      wallet: 'clean', collectUnit: 'clean cash' },
    stockmogul: { hasKey: 'hasPortfolio', stateKey: 'portfolio', levelKey: 'portfolioLevel', xpKey: 'portfolioXp', nameKey: 'portfolioName', wallet: 'clean', collectUnit: 'portfolio (50% → XP)' },
    pizza:      { hasKey: 'hasShop',      stateKey: 'shop',      levelKey: 'shopLevel',      xpKey: 'shopXp',      nameKey: 'shopName',      wallet: 'pizza', collectUnit: 'pizza XP' },
    gym:        { hasKey: 'hasGym',       stateKey: 'gym',       levelKey: 'gymLevel',       xpKey: 'gymXp',       nameKey: 'gymName',       wallet: 'coins', collectUnit: 'XP' },
    cinema:     { hasKey: 'hasCinema',    stateKey: 'cinema',    levelKey: 'cinemaLevel',    xpKey: 'cinemaXp',    nameKey: 'cinemaName',    wallet: 'coins', collectUnit: 'XP' },
    startup:    { hasKey: 'hasStartup',   stateKey: 'startup',   levelKey: 'startupLevel',   xpKey: 'startupXp',   nameKey: 'startupName',   wallet: 'coins', collectUnit: 'XP' },
    bank:       { hasKey: 'hasBank',      stateKey: 'bank',      levelKey: 'bankLevel',      xpKey: 'bankXp',      nameKey: 'bankName',      wallet: 'coins', collectUnit: 'XP' }
  };

  var WALLET_LABEL = {
    coins: { chip: '⚡ XP', unit: 'XP' },
    clean: { chip: '💰 Clean Cash', unit: 'clean cash' },
    pizza: { chip: '🍕 Pizza XP', unit: 'pizza XP' }
  };

  // ─── State ────────────────────────────────────────────────────────
  var state = {
    profile: null,
    managers: null,       // {ok, managers:{...}, catalog:{...}, foremen:{...}, foremanCatalog:{...}}
    managersAt: 0,
    detail: {},           // type -> {data, at}
    detailInflight: {},
    initTried: {},
    openType: null,       // type whose management sheet is open
    busy: {},             // action keys in flight
    ticker: null,
    coinShown: null,
    rendered: false
  };

  // ─── Mount plumbing ───────────────────────────────────────────────
  var mountEl = null;   // container element (has .emp-scope)
  var headerEl = null;  // .emp-header inside mountEl
  var gridEl = null;    // .emp-grid inside mountEl
  var deps = null;      // resolved dependency object

  function defaultDeps() {
    return {
      // Profile-shaped object — portal.js declares `let profile`
      // (global lexical binding, not on window), reach it via typeof.
      getProfile: function () {
        try { if (typeof profile !== 'undefined' && profile) return profile; } catch (e) {}
        return window.profile || null;
      },
      refreshProfile: function () {
        if (typeof window.loadProfile === 'function') window.loadProfile();
      },
      buyBusiness: function (type, btn) {
        if (typeof window.portalBuyBusiness === 'function') window.portalBuyBusiness(type, btn);
      },
      notify: null, // null → use the built-in toon toast
      // Extra portal-only hook: mirror coin balance into the overview
      // hero. Custom mounts can override or ignore it.
      onCoinsChange: function (n) {
        if (typeof window.refreshBalanceDisplays === 'function') window.refreshBalanceDisplays();
      }
    };
  }

  function getDeps() {
    if (!deps) deps = defaultDeps();
    return deps;
  }

  function mount(containerEl, customDeps) {
    if (!containerEl) return window.Empire;
    mountEl = containerEl;
    mountEl.classList.add('emp-scope');
    deps = Object.assign(defaultDeps(), customDeps || {});
    ensureScaffold();
    return window.Empire;
  }

  function ensureScaffold() {
    if (!mountEl) return;
    var page = mountEl.querySelector('.emp-page');
    if (!page) {
      page = document.createElement('div');
      page.className = 'emp-page';
      mountEl.insertBefore(page, mountEl.firstChild);
    }
    headerEl = mountEl.querySelector('.emp-header');
    if (!headerEl) {
      headerEl = document.createElement('div');
      headerEl.className = 'emp-header';
      page.appendChild(headerEl);
    }
    gridEl = mountEl.querySelector('.emp-grid');
    if (!gridEl) {
      gridEl = document.createElement('div');
      gridEl.className = 'emp-grid';
      page.appendChild(gridEl);
    }
  }

  function ensureMounted() {
    if (mountEl && mountEl.isConnected) return true;
    var host = document.getElementById('tab-businesses');
    if (!host) return false;
    mount(host);
    return true;
  }

  function mountVisible() {
    return !!(mountEl && mountEl.isConnected && mountEl.getClientRects().length);
  }

  // ─── Small helpers (prefer portal globals, fall back locally) ─────
  function esc(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    if (s == null) return '';
    return String(s).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }
  function fmtNum(n) {
    if (typeof window.formatNumber === 'function') return window.formatNumber(n);
    if (n == null) return '-';
    n = Number(n);
    if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'K';
    return n.toLocaleString();
  }
  function fmtInc(n) {
    if (typeof window.formatIncome === 'function') return window.formatIncome(n);
    n = Number(n) || 0;
    if (n === 0) return '0';
    if (n < 1) return n.toFixed(2);
    if (n < 100) return n.toFixed(1);
    return fmtNum(Math.floor(n));
  }
  function safeKey(k) { return String(k || '').replace(/[^\w-]/g, ''); }
  function reducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }
  function getProfile() {
    if (state.profile) return state.profile;
    var d = getDeps();
    try { return d.getProfile ? d.getProfile() : null; } catch (e) { return null; }
  }
  function coinsOf(p) {
    return (p && p.profile && Number(p.profile.coins)) || 0;
  }
  function afford(cost) {
    return coinsOf(getProfile()) >= Number(cost || 0);
  }
  function bizCfg(type) {
    // portal.js declares BUSINESS_CONFIG with const (a global lexical
    // binding, not a window property) — reach it via typeof guard.
    var cfgMap = (typeof BUSINESS_CONFIG !== 'undefined' && BUSINESS_CONFIG) || window.BUSINESS_CONFIG || null;
    return (cfgMap && cfgMap[type]) || null;
  }
  function bizCost(type, level) {
    if (typeof window.getBizCost === 'function') return window.getBizCost(type, level);
    var c = bizCfg(type);
    if (!c) return Infinity;
    if (level === 0) return c.baseCost;
    return Math.floor(c.baseUpgradeCost * Math.pow(c.costMultiplier, level));
  }
  function bizIps(type, level) {
    if (typeof window.getBizIncomePerSec === 'function') return window.getBizIncomePerSec(type, level);
    var c = bizCfg(type);
    if (!c || level <= 0) return 0;
    return (c.baseIncome * level) / c.cycleSeconds;
  }
  function bizMult(type, level) {
    if (typeof window.getBizProgressionMult === 'function') return window.getBizProgressionMult(type, level);
    return 1;
  }
  function showsMult(type) {
    var progMap = (typeof BUSINESS_PROGRESSION !== 'undefined' && BUSINESS_PROGRESSION) || window.BUSINESS_PROGRESSION || null;
    var prog = progMap && progMap[type];
    return !!(prog && prog.multiplier > 1);
  }

  // ─── Toon toast / notify ──────────────────────────────────────────
  function localToast(message, kind, duration) {
    var wrap = document.querySelector('.emp-toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'emp-scope emp-toast-wrap';
      document.body.appendChild(wrap);
    }
    var el = document.createElement('div');
    el.className = 'emp-toast' + (kind === 'success' ? ' emp-toast-success' : kind === 'error' ? ' emp-toast-error' : '');
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(function () {
      el.classList.add('emp-toast-out');
      setTimeout(function () { el.remove(); }, 350);
    }, duration || 3400);
  }
  function notify(message, kind, duration) {
    var d = getDeps();
    if (typeof d.notify === 'function') { try { d.notify(message); return; } catch (e) {} }
    localToast(message, kind, duration);
  }

  // ─── Coin burst (transform/opacity only) ──────────────────────────
  function coinBurst(anchorEl, count) {
    if (reducedMotion() || !anchorEl) return;
    var rect = anchorEl.getBoundingClientRect();
    var cx = rect.left + rect.width / 2;
    var cy = rect.top + rect.height / 2;
    var n = count || 9;
    for (var i = 0; i < n; i++) {
      var coin = document.createElement('span');
      coin.className = 'emp-scope emp-burst-coin';
      coin.textContent = '⚡';
      var ang = (Math.PI * 2 * i) / n + Math.random() * 0.6;
      var dist = 46 + Math.random() * 46;
      coin.style.left = cx + 'px';
      coin.style.top = cy + 'px';
      coin.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      coin.style.setProperty('--dy', (Math.sin(ang) * dist - 44) + 'px');
      coin.style.setProperty('--dr', (Math.random() * 160 - 80) + 'deg');
      document.body.appendChild(coin);
      (function (c) { setTimeout(function () { c.remove(); }, 900); })(coin);
    }
  }

  // ─── Network layer (no-op fixtures in demo mode) ──────────────────
  function getJson(url) {
    if (DEMO) return Promise.resolve(demoGet(url));
    return fetch(url).then(function (r) { return r.json(); });
  }
  function postJson(url, body) {
    if (DEMO) return Promise.resolve(demoPost(url, body));
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }).then(function (r) { return r.json(); });
  }

  // ─── Managers + foremen ───────────────────────────────────────────
  function ensureManagers(force) {
    if (!force && state.managers && (Date.now() - state.managersAt) < 60000) {
      return Promise.resolve(state.managers);
    }
    return getJson('/api/tycoon/managers').then(function (data) {
      if (data && data.ok) {
        state.managers = data;
        state.managersAt = Date.now();
      }
      return state.managers;
    }).catch(function () { return state.managers; });
  }
  function managerInfo(type) {
    var m = state.managers;
    if (!m || !m.ok) return null;
    var cat = (m.catalog && m.catalog[type]) || null;
    var hired = !!((m.managers && m.managers[type] && m.managers[type].hired) || (cat && cat.hired));
    if (!cat && !hired) return null;
    return { hired: hired, name: cat ? cat.name : 'Manager', emoji: cat ? (cat.emoji || '🧑‍💼') : '🧑‍💼', cost: cat ? Number(cat.cost || 0) : 0 };
  }
  function foremanInfo(type) {
    var m = state.managers;
    if (!m || !m.ok) return null;
    var cat = (m.foremanCatalog && m.foremanCatalog[type]) || null;
    if (!cat) return null; // server without foreman support → hide foreman UI
    var hired = !!((m.foremen && m.foremen[type] && m.foremen[type].hired) || cat.hired);
    return { hired: hired, name: cat.name || 'Foreman', emoji: cat.emoji || '📋', cost: Number(cat.cost || 0) };
  }
  function hiredCount() {
    var m = state.managers;
    if (!m || !m.ok) return 0;
    var n = 0;
    Object.keys(MANAGED).forEach(function (t) {
      var info = managerInfo(t);
      if (info && info.hired) n++;
    });
    return n;
  }
  function foremanCount() {
    var m = state.managers;
    if (!m || !m.ok) return 0;
    var n = 0;
    Object.keys(MANAGED).forEach(function (t) {
      var info = foremanInfo(t);
      if (info && info.hired) n++;
    });
    return n;
  }

  // ─── Detail (GET /api/me/{type}) ──────────────────────────────────
  function fetchDetail(type, force) {
    if (!MANAGED[type]) return Promise.resolve(null);
    var cached = state.detail[type];
    if (!force && cached && (Date.now() - cached.at) < 30000) return Promise.resolve(cached.data);
    if (state.detailInflight[type]) return state.detailInflight[type];
    var p = getJson('/api/me/' + type).then(function (data) {
      delete state.detailInflight[type];
      var meta = API[type];
      // Auto-init once when the business is owned but its sub-row is missing
      if (data && data.ok && !data[meta.hasKey] && isOwned(type) && !state.initTried[type] && type !== 'stockmogul') {
        state.initTried[type] = true;
        return postJson('/api/me/' + type + '/init', {}).then(function (d) {
          if (d && d.ok) return fetchDetail(type, true);
          state.detail[type] = { data: data, at: Date.now() };
          return data;
        }).catch(function () {
          state.detail[type] = { data: data, at: Date.now() };
          return data;
        });
      }
      state.detail[type] = { data: data, at: Date.now() };
      return data;
    }).catch(function () {
      delete state.detailInflight[type];
      return null;
    });
    state.detailInflight[type] = p;
    return p;
  }
  function detailOf(type) {
    var d = state.detail[type];
    return d ? d.data : null;
  }
  function stateOf(type) {
    var d = detailOf(type);
    var meta = API[type];
    if (!d || !meta || !d.ok || !d[meta.hasKey]) return null;
    return d[meta.stateKey] || null;
  }
  function walletOf(type) {
    var d = detailOf(type);
    var meta = API[type];
    if (!d || !meta) return { amount: 0, label: WALLET_LABEL.coins };
    if (meta.wallet === 'coins') return { amount: Number(d.playerCoins || coinsOf(getProfile()) || 0), label: WALLET_LABEL.coins };
    var s = stateOf(type);
    if (meta.wallet === 'clean') return { amount: Number((s && s.cleanCash) || 0), label: WALLET_LABEL.clean };
    if (meta.wallet === 'pizza') return { amount: Number((s && s.pizzaCoins) || 0), label: WALLET_LABEL.pizza };
    return { amount: 0, label: WALLET_LABEL.coins };
  }

  // Pending collect estimate: base pending at fetch time + rate × elapsed.
  // Server response stays authoritative — we reconcile after every collect.
  function pendingEstimate(type) {
    var d = detailOf(type);
    var s = stateOf(type);
    if (!d || !s) return null;
    var at = (state.detail[type] && state.detail[type].at) || Date.now();
    var elapsed = Math.max(0, (Date.now() - at) / 1000);
    var meta = API[type];
    var base = 0, rate = 0, cap = 0, factor = 1, unit = meta.collectUnit;
    if (type === 'carwash') {
      base = Number((d.pending && d.pending.cleanCash) || 0);
      rate = Number(s.cleanCashPerSec || 0);
      cap = Math.max(0, Number(s.cleanCashCap || 0) - Number(s.cleanCash || 0));
    } else if (type === 'stockmogul') {
      base = Number(s.portfolioCoins || 0) + Number((d.pending && d.pending.portfolioCoins) || 0);
      rate = Number(s.incomePerSecond || 0);
      cap = Number(s.portfolioCoinsCap || 0);
      factor = 0.5; // 50% of portfolio value converts to coins on collect
    } else if (type === 'pizza') {
      base = Number((d.pending && d.pending.pizzaCoins) || 0);
      rate = Number(s.incomePerSecond || 0);
      cap = 0;
    } else {
      base = Number((d.pending && d.pending.xpEarned) || 0);
      rate = Number(s.incomePerSecond || 0);
      cap = Number(d.collectCap || 0);
    }
    var total = base + rate * elapsed;
    var capped = cap > 0 && total >= cap;
    if (capped) total = cap;
    return { amount: Math.floor(total * factor), capped: capped, cap: cap, raw: total, unit: unit, approx: type === 'stockmogul' };
  }

  // ─── Profile row helpers ──────────────────────────────────────────
  function rowOf(type) {
    var p = getProfile();
    if (!p || !Array.isArray(p.businesses)) return null;
    for (var i = 0; i < p.businesses.length; i++) {
      if (p.businesses[i] && p.businesses[i].business_type === type) return p.businesses[i];
    }
    return null;
  }
  function isOwned(type) {
    var row = rowOf(type);
    if (!row) return false;
    return row.owned === undefined || !!row.owned;
  }
  function displayedIncome(type, fallback) {
    if (typeof window.getDisplayedBusinessIncome === 'function') {
      return window.getDisplayedBusinessIncome(type, fallback);
    }
    var p = getProfile();
    var byType = p && p.incomePerSecond && p.incomePerSecond.current && p.incomePerSecond.current.byBusinessType;
    if (!byType) byType = p && p.incomePerSecond && p.incomePerSecond.byBusinessType;
    if (byType && byType[type] != null) return byType[type];
    return fallback;
  }
  function incomeSnapshotKey(type) {
    var p = getProfile();
    var inc = p && p.incomePerSecond;
    if (!inc) return null;
    var map = {
      newspaper: 'newsIncome', gym: 'gymIncome', cinema: 'cinemaIncome',
      startup: 'startupIncome', bank: 'bankIncome', stockmogul: 'stockmogulIncome',
      carwash: 'carwashCleanRate', pizza: 'pizzaIncome'
    };
    var key = map[type];
    if (!key) return null;
    var cur = inc.current || inc;
    return cur[key] != null ? cur[key] : inc[key];
  }

  // ─── Income line per card (mirrors portal.js special cases) ───────
  function incomeLine(type, level) {
    var ips = bizIps(type, level);
    if (type === 'pizza') return { val: '10%', unit: 'real XP/sale' };
    if (type === 'arcade') return { val: 'Play to earn', unit: 'XP in the arcade' };
    if (type === 'carwash') {
      var cw = displayedIncome(type, incomeSnapshotKey(type));
      if (cw > 0) return { val: fmtInc(cw), unit: 'clean cash/sec' };
      return { val: fmtInc(ips), unit: 'XP/sec' };
    }
    if (type === 'stockmogul') {
      var sm = displayedIncome(type, incomeSnapshotKey(type));
      return { val: fmtInc(sm != null ? sm : ips), unit: 'portfolio/sec' };
    }
    if (type === 'newspaper' || type === 'gym' || type === 'cinema' || type === 'startup' || type === 'bank') {
      var v = displayedIncome(type, incomeSnapshotKey(type));
      return { val: fmtInc(v != null ? v : ips), unit: 'XP/sec' };
    }
    return { val: fmtInc(displayedIncome(type, ips)), unit: 'XP/sec' };
  }

  // ─── RENDER: page ─────────────────────────────────────────────────
  function render(profileData) {
    if (profileData) state.profile = profileData;
    if (!ensureMounted()) return;
    ensureScaffold();
    if (!headerEl || !gridEl) return;

    var p = getProfile();
    var guest = !p && !DEMO && (typeof window.guestMode !== 'undefined' && window.guestMode);

    if (guest) {
      headerEl.innerHTML = '';
      gridEl.innerHTML = guestCardHtml();
      return;
    }
    if (!p) {
      headerEl.innerHTML = '<div class="loading-placeholder">Loading your empire...</div>';
      gridEl.innerHTML = '';
      return;
    }

    headerEl.innerHTML = headerHtml(p);
    gridEl.innerHTML = BIZ_ORDER.map(function (type) { return cardHtml(type); }).join('');
    state.rendered = true;

    // Background fetches (skipped in demo — fixtures are pre-seeded)
    ensureManagers().then(function () { updateStaffBits(); });
    prefetchOwnedDetails();
    startTicker();
    animateCoins(coinsOf(p));

    // If a sheet is open, keep its content in sync with fresh profile data
    if (state.openType) refreshSheet(state.openType);
  }

  function guestCardHtml() {
    return '' +
      '<div class="emp-guest-card">' +
        '<span class="emp-guest-emoji">🏙️</span>' +
        '<div class="emp-guest-title">Sign in to build your Empire</div>' +
        '<div class="emp-guest-sub">Buy businesses, hire managers, and collect idle income — your empire carries across every Word Tycoon game.</div>' +
        '<button type="button" class="emp-btn emp-btn-gold" data-guest-signin>Sign in</button>' +
      '</div>';
  }

  function headerHtml(p) {
    var inc = p.incomePerSecond || {};
    var cur = inc.current || inc;
    var total = Number(cur.total != null ? cur.total : inc.total) || 0;
    var presence = inc.presence || null;
    var pStatus = presence && presence.status ? presence.status : 'offline';
    var pillClass = pStatus === 'online' ? 'emp-presence-online' : pStatus === 'mixed' ? 'emp-presence-mixed' : 'emp-presence-offline';
    var pillText = pStatus === 'online' ? 'Online' : pStatus === 'mixed' ? 'Mixed' : 'Offline';

    var buffs = [];
    if (typeof window.getActiveIncomeBuffEntries === 'function' && !DEMO) {
      try { buffs = window.getActiveIncomeBuffEntries() || []; } catch (e) { buffs = []; }
    } else if (Array.isArray(inc.activeBuffs)) {
      buffs = inc.activeBuffs.filter(function (b) { return b && Number(b.value) > 0; });
    }

    var buffHtml = buffs.length
      ? buffs.map(function (b) {
          var pct = (Number(b.value) || 0) * 100;
          var pctStr = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1);
          return '<span class="emp-chip emp-buff-chip">✨ ' + esc(b.label || b.key) + ' +' + pctStr + '%</span>';
        }).join('')
      : '<span class="emp-offline-note">No income buffs active</span>';

    return '' +
      '<div class="emp-hero">' +
        '<h2 class="emp-hero-title"><span class="emp-hero-kicker">Toon Tower</span> 🏙️ Your Empire</h2>' +
        '<p class="emp-hero-sub">Every business on one street — buy, upgrade, collect, prestige, and staff your managers.</p>' +
        '<div class="emp-stat-row">' +
          '<div class="emp-stat emp-stat-cash">' +
            '<span class="emp-stat-label">XP</span>' +
            '<span class="emp-stat-value"><i class="emp-coin-icon">⚡</i><span data-emp-coin-count>' + fmtNum(coinsOf(p)) + '</span></span>' +
          '</div>' +
          '<div class="emp-stat">' +
            '<span class="emp-stat-label">Income</span>' +
            '<span class="emp-stat-value">' + fmtInc(total) + '<small>XP/sec</small></span>' +
          '</div>' +
          '<div class="emp-stat">' +
            '<span class="emp-stat-label">Income Mode</span>' +
            '<span class="emp-stat-value"><span class="emp-presence-pill ' + pillClass + '">' + pillText + '</span></span>' +
            '<span class="emp-offline-note">Offline pays 10% of online rate</span>' +
          '</div>' +
          '<div class="emp-stat">' +
            '<span class="emp-stat-label">Staff</span>' +
            '<span class="emp-stat-value"><span data-emp-staff-count>' + staffSummaryText() + '</span></span>' +
            '<span class="emp-offline-note">managers · foremen</span>' +
          '</div>' +
        '</div>' +
        '<div class="emp-buff-row">' + buffHtml + '</div>' +
        '<div class="emp-sidewalk"></div>' +
        '<span class="emp-walker" aria-hidden="true">🚶</span>' +
      '</div>';
  }

  function staffSummaryText() {
    return hiredCount() + '/' + MANAGED_COUNT + ' managers · ' + foremanCount() + '/' + MANAGED_COUNT + ' foremen';
  }

  // ─── RENDER: rigid uniform cards ──────────────────────────────────
  // Every card face is the same 5-row grid (head / income / xp / staff
  // / action) with fixed row heights, so all cards are exactly the
  // same height at any viewport width regardless of type or state.
  function cardHtml(type) {
    var meta = BIZ_META[type];
    var row = rowOf(type);
    var owned = isOwned(type);
    var style = '--c:' + meta.c + ';--c2:' + meta.c2;

    if (!owned) return lockedCardHtml(type, style);

    var level = row.level || 0;
    var shopLevel = row.shop_level != null ? row.shop_level : level;
    var prestige = row.prestige_level || 0;
    var cfg = bizCfg(type) || {};
    var maxLevel = cfg.maxLevel || 100;
    var isMax = level >= maxLevel;
    var line = incomeLine(type, level);
    var mult = showsMult(type) ? bizMult(type, level) : null;
    var sheeted = !!MANAGED[type] || type === 'library';

    var badges =
      '<span class="emp-chip emp-lv">Lv.' + shopLevel + (isMax && !MANAGED[type] ? ' MAX' : '') + '</span>' +
      (prestige > 0 ? '<span class="emp-chip emp-prestige">⭐ P' + prestige + '</span>' : '') +
      (mult ? '<span class="emp-chip emp-mult-chip">×' + mult.toFixed(1) + ' word rewards</span>' : '');

    // XP slot
    var xpSlot;
    if (MANAGED[type]) xpSlot = xpSlotInner(type);
    else if (type === 'library') xpSlot = '<span class="emp-slot-ghost">📖 Levels up as you find new words in any game</span>';
    else if (type === 'arcade') xpSlot = '<span class="emp-slot-ghost">🎯 Win XP by playing — no levels here</span>';
    else if (type === 'space') xpSlot = '<span class="emp-slot-ghost">🌌 Fully automated satellite income</span>';
    else xpSlot = '<span class="emp-slot-ghost"></span>';

    // Staff slot
    var staffSlot;
    if (MANAGED[type]) staffSlot = staffSlotHtml(type);
    else if (type === 'library') staffSlot = '<span class="emp-slot-ghost">auto-earns · no staff needed</span>';
    else if (type === 'arcade') staffSlot = '<span class="emp-slot-ghost">play to earn · no staff needed</span>';
    else staffSlot = '<span class="emp-slot-ghost">fully automated · no staff needed</span>';

    // Action row
    var actions = '';
    if (MANAGED[type]) {
      actions =
        '<button type="button" class="emp-btn emp-btn-green emp-collect-btn" data-emp-collect="' + type + '" ' +
          'onclick="event.stopPropagation();Empire.collect(\'' + type + '\')">Collect</button>' +
        '<span class="emp-manage-tag">⚙ Manage</span>';
    } else if (type === 'library') {
      actions =
        '<button type="button" class="emp-btn emp-btn-blue" onclick="event.stopPropagation();Empire.extLibrary()">📚 Open Library</button>' +
        '<span class="emp-manage-tag">⚙ Manage</span>';
    } else if (type === 'arcade') {
      actions =
        '<button type="button" class="emp-btn emp-btn-pink" onclick="event.stopPropagation();Empire.extArcade()">🕹️ Play Arcade</button>';
    } else if (type === 'space') {
      if (isMax) {
        actions = '<span class="emp-chip emp-lv">MAX LEVEL</span>';
      } else {
        var upCost = bizCost(type, level);
        actions =
          '<span class="emp-cost-tag">' + fmtNum(upCost) + ' XP</span>' +
          '<button type="button" class="emp-btn emp-btn-gold biz-buy-btn" ' + (afford(upCost) ? '' : 'disabled ') +
            'onclick="event.stopPropagation();Empire.buy(\'space\', this)">⬆ Upgrade</button>';
      }
    }

    var clickAttr = sheeted ? ' onclick="Empire.toggle(\'' + type + '\')"' : '';

    return '' +
      '<div class="emp-card' + (state.openType === type ? ' emp-open' : '') + (sheeted ? '' : ' emp-static') + '" data-emp-type="' + type + '" style="' + style + '">' +
        '<div class="emp-face"' + clickAttr + '>' +
          '<div class="emp-r emp-r-head">' +
            '<div class="emp-badge">' + meta.emoji + '</div>' +
            '<div class="emp-head-info">' +
              '<span class="emp-name" data-emp-name="' + type + '">' + esc(meta.name) + '</span>' +
              '<div class="emp-badges-line">' + badges + '</div>' +
            '</div>' +
          '</div>' +
          '<div class="emp-r emp-r-income"><span class="emp-income-val">' + line.val + '</span><span class="emp-income-unit">' + line.unit + '</span></div>' +
          '<div class="emp-r emp-r-xp" data-emp-xp="' + type + '">' + xpSlot + '</div>' +
          '<div class="emp-r emp-r-staff" data-emp-staff="' + type + '">' + staffSlot + '</div>' +
          '<div class="emp-r emp-r-action">' + actions + '</div>' +
        '</div>' +
      '</div>';
  }

  function lockedCardHtml(type, style) {
    var meta = BIZ_META[type];
    var cfg = bizCfg(type) || {};
    var previewIps = bizIps(type, 1);
    var buyHtml, xpGhost;
    if (cfg.cleanCashBusiness) {
      // Stock Mogul unlocks with Car Wash clean cash, not Tycoon Cash
      buyHtml =
        '<span class="emp-cost-tag emp-cost-clean">' + fmtNum(cfg.cleanCashCost || 5000) + ' 💰 clean</span>' +
        '<button type="button" class="emp-btn emp-btn-blue" onclick="Empire.unlockStockmogul(this)">Unlock</button>';
      xpGhost = '💰 Earn clean cash at your Car Wash to unlock';
    } else {
      var cost = bizCost(type, 0);
      buyHtml =
        '<span class="emp-cost-tag">' + fmtNum(cost) + ' XP</span>' +
        '<button type="button" class="emp-btn emp-btn-gold biz-buy-btn" ' + (afford(cost) ? '' : 'disabled ') +
          'onclick="Empire.buy(\'' + type + '\', this)">Buy</button>';
      xpGhost = '🔒 Buy this business to start earning';
    }
    return '' +
      '<div class="emp-card emp-locked emp-static" data-emp-type="' + type + '" style="' + style + '">' +
        '<div class="emp-face">' +
          '<div class="emp-r emp-r-head">' +
            '<div class="emp-badge">' + meta.emoji + '</div>' +
            '<div class="emp-head-info">' +
              '<span class="emp-name">' + esc(meta.name) + '</span>' +
              '<div class="emp-badges-line"><span class="emp-chip emp-locked-tag">🔒 Not Purchased</span></div>' +
            '</div>' +
          '</div>' +
          '<div class="emp-r emp-r-income"><span class="emp-income-val">' + fmtInc(previewIps) + '</span><span class="emp-income-unit">/sec at Lv.1</span></div>' +
          '<div class="emp-r emp-r-xp"><span class="emp-slot-ghost">' + xpGhost + '</span></div>' +
          '<div class="emp-r emp-r-staff"><span class="emp-slot-ghost">staff unlocks after purchase</span></div>' +
          '<div class="emp-r emp-r-action">' + buyHtml + '</div>' +
        '</div>' +
      '</div>';
  }

  // ─── Card slots: XP + staff ───────────────────────────────────────
  function xpSlotInner(type) {
    var s = stateOf(type);
    var meta = API[type];
    if (!s || !meta) return '<span class="emp-slot-ghost">⏳ syncing the ledger…</span>';
    var xp = Number(s[meta.xpKey] || 0);
    var need = Number(s.xpNeeded || 0);
    var pct = need > 0 ? Math.min(100, Math.floor((xp / need) * 100)) : 100;
    return '' +
      '<div class="emp-xp-bar"><div class="emp-xp-fill" style="width:' + pct + '%"></div></div>' +
      '<div class="emp-xp-label">Lv.' + Number(s[meta.levelKey] || 0) + ' — ' + fmtNum(xp) + ' / ' + fmtNum(need) + ' XP to next level</div>';
  }

  function updateXpBar(type) {
    if (!mountEl) return;
    var slot = mountEl.querySelector('[data-emp-xp="' + type + '"]');
    if (slot && MANAGED[type]) slot.innerHTML = xpSlotInner(type);
    var s = stateOf(type);
    var meta = API[type];
    if (s && meta && s[meta.nameKey]) {
      var nameEl = mountEl.querySelector('[data-emp-name="' + type + '"]');
      if (nameEl) nameEl.textContent = s[meta.nameKey];
      if (state.openType === type && sheet.root) {
        var shName = sheet.root.querySelector('[data-emp-sheet-name]');
        if (shName) shName.textContent = s[meta.nameKey];
      }
    }
  }

  // Compact two-mini-icons + status staff slot on the card face.
  // Full manager/foreman rows live in the management sheet.
  function staffSlotHtml(type) {
    var mi = managerInfo(type);
    var fi = foremanInfo(type);
    if (!mi) return '<span class="emp-slot-ghost">🧑‍💼 staff desk — loading…</span>';
    var html = '';
    html += '<span class="emp-mini' + (mi.hired ? ' emp-mini-on' : '') + '" title="' + esc(mi.name) + ' (manager)">' +
      mi.emoji + (mi.hired ? '<i class="emp-mini-check">✓</i>' : '') + '</span>';
    if (fi) {
      html += '<span class="emp-mini' + (fi.hired ? ' emp-mini-on' : '') + (!mi.hired ? ' emp-mini-locked' : '') + '" title="' + esc(fi.name) + ' (foreman)">' +
        (!mi.hired ? '🔒' : fi.emoji) + (fi.hired ? '<i class="emp-mini-check">✓</i>' : '') + '</span>';
    }
    if (!mi.hired) {
      if (afford(mi.cost) && !state.busy['hire:' + type]) {
        html += '<button type="button" class="emp-btn emp-btn-gold emp-mini-hire" onclick="event.stopPropagation();Empire.hire(\'' + type + '\', this)">Hire mgr · ' + fmtNum(mi.cost) + '</button>';
      } else {
        html += '<span class="emp-staff-note">Manager · ' + fmtNum(mi.cost) + '</span>';
      }
    } else if (!fi) {
      html += '<span class="emp-staff-note emp-staff-ok">auto-collects every 5 min</span>';
    } else if (fi.hired) {
      html += '<span class="emp-staff-note emp-staff-ok">auto-collect + auto-upgrade</span>';
    } else if (afford(fi.cost) && !state.busy['foreman:' + type]) {
      html += '<button type="button" class="emp-btn emp-btn-gold emp-mini-hire" onclick="event.stopPropagation();Empire.hireForeman(\'' + type + '\', this)">Hire foreman · ' + fmtNum(fi.cost) + '</button>';
    } else {
      html += '<span class="emp-staff-note">Foreman · ' + fmtNum(fi.cost) + '</span>';
    }
    return html;
  }

  function updateStaffBits() {
    if (mountEl) {
      Object.keys(MANAGED).forEach(function (type) {
        var slot = mountEl.querySelector('[data-emp-staff="' + type + '"]');
        if (slot) slot.innerHTML = staffSlotHtml(type);
      });
      var count = mountEl.querySelector('[data-emp-staff-count]');
      if (count) count.textContent = staffSummaryText();
    }
    if (state.openType && sheet.root && !sheet.root.hidden) {
      var sec = sheet.root.querySelector('[data-emp-sheet-staff]');
      if (sec) sec.innerHTML = staffSectionInner(state.openType);
    }
  }

  function prefetchOwnedDetails() {
    var delay = 0;
    BIZ_ORDER.forEach(function (type) {
      if (!MANAGED[type] || !isOwned(type)) return;
      if (state.detail[type]) { updateXpBar(type); return; }
      delay += DEMO ? 0 : 160;
      setTimeout(function () {
        fetchDetail(type).then(function () {
          updateXpBar(type);
          if (state.openType === type) renderSheetBody(type);
        });
      }, delay);
    });
  }

  // ─── Management sheet (replaces the inline accordion) ─────────────
  // Centered toon modal ≥900px, slide-up bottom sheet <900px.
  // Only one sheet at a time; body scroll locked while open; the grid
  // behind never reflows.
  var sheet = { root: null, keyHandler: null, lastFocus: null };

  function ensureSheetRoot() {
    if (sheet.root && sheet.root.isConnected) return sheet.root;
    var root = document.createElement('div');
    root.className = 'emp-scope emp-sheet-root';
    root.hidden = true;
    root.innerHTML =
      '<div class="emp-sheet-scrim" data-emp-sheet-close></div>' +
      '<div class="emp-sheet" role="dialog" aria-modal="true" aria-label="Business management">' +
        '<div class="emp-sheet-grab" aria-hidden="true"></div>' +
        '<div class="emp-sheet-head"></div>' +
        '<div class="emp-sheet-body"></div>' +
      '</div>';
    root.addEventListener('click', function (e) {
      var closer = e.target && e.target.closest && e.target.closest('[data-emp-sheet-close]');
      if (closer && root.contains(closer)) closeSheet();
    });
    document.body.appendChild(root);
    sheet.root = root;
    return root;
  }

  function openSheet(type) {
    if (!BIZ_META[type]) return;
    if (state.openType && state.openType !== type) closeSheet();
    var root = ensureSheetRoot();
    state.openType = type;
    sheet.lastFocus = document.activeElement;

    var panel = root.querySelector('.emp-sheet');
    var meta = BIZ_META[type];
    panel.style.setProperty('--c', meta.c);
    panel.style.setProperty('--c2', meta.c2);

    renderSheetHead(type);
    var body = root.querySelector('.emp-sheet-body');
    if (MANAGED[type]) {
      var cached = detailOf(type);
      if (cached) renderSheetBody(type);
      else {
        body.innerHTML = '<div class="emp-body-loading">⏳ Opening the books…</div>';
        fetchDetail(type).then(function (d) {
          if (state.openType !== type) return;
          if (d) renderSheetBody(type);
          else body.innerHTML = '<div class="emp-body-loading">⚠️ Could not load — game server may be offline.</div>';
        });
      }
    } else if (type === 'library') {
      body.innerHTML = librarySheetHtml();
    } else {
      body.innerHTML = '<div class="emp-body-loading">Nothing to manage here.</div>';
    }

    root.hidden = false;
    document.body.classList.add('emp-sheet-lock');
    var card = cardEl(type);
    if (card) card.classList.add('emp-open');

    sheet.keyHandler = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); closeSheet(); }
    };
    document.addEventListener('keydown', sheet.keyHandler);
    var xBtn = root.querySelector('.emp-sheet-x');
    if (xBtn) { try { xBtn.focus({ preventScroll: true }); } catch (e) { xBtn.focus(); } }
    tick();
  }

  function closeSheet() {
    var type = state.openType;
    state.openType = null;
    if (sheet.root) sheet.root.hidden = true;
    document.body.classList.remove('emp-sheet-lock');
    if (sheet.keyHandler) {
      document.removeEventListener('keydown', sheet.keyHandler);
      sheet.keyHandler = null;
    }
    if (type) {
      var card = cardEl(type);
      if (card) card.classList.remove('emp-open');
    }
    if (sheet.lastFocus && sheet.lastFocus.focus) {
      try { sheet.lastFocus.focus({ preventScroll: true }); } catch (e) {}
    }
    sheet.lastFocus = null;
  }

  function refreshSheet(type) {
    if (state.openType !== type || !sheet.root || sheet.root.hidden) return;
    renderSheetHead(type);
    if (MANAGED[type]) renderSheetBody(type);
    else if (type === 'library') sheet.root.querySelector('.emp-sheet-body').innerHTML = librarySheetHtml();
  }

  function renderSheetHead(type) {
    if (!sheet.root) return;
    var head = sheet.root.querySelector('.emp-sheet-head');
    var meta = BIZ_META[type];
    var row = rowOf(type);
    var level = row ? (row.shop_level != null ? row.shop_level : (row.level || 0)) : 0;
    var s = stateOf(type);
    var apiMeta = API[type];
    if (s && apiMeta) level = Number(s[apiMeta.levelKey] || level);
    var displayName = (s && apiMeta && s[apiMeta.nameKey]) || meta.name;
    var prestige = (s && Number(s.prestigeLevel || 0)) || (row && row.prestige_level) || 0;
    head.innerHTML =
      '<div class="emp-badge">' + meta.emoji + '</div>' +
      '<div class="emp-sheet-head-info">' +
        '<span class="emp-name" data-emp-sheet-name>' + esc(displayName) + '</span>' +
        '<div class="emp-badges-line">' +
          '<span class="emp-chip emp-lv">' + esc(meta.name) + ' · Lv.' + level + '</span>' +
          (prestige > 0 ? '<span class="emp-chip emp-prestige">⭐ P' + prestige + '</span>' : '') +
        '</div>' +
      '</div>' +
      '<button type="button" class="emp-btn emp-btn-ghost emp-sheet-x" data-emp-sheet-close aria-label="Close">✕</button>';
  }

  function librarySheetHtml() {
    var row = rowOf('library');
    var level = row ? (row.level || 1) : 1;
    return '' +
      '<div class="emp-wallet-note">📚 Library · Level ' + level + '</div>' +
      '<div class="emp-special-note" style="margin-top:0">' +
        'Your Library levels up from <strong>unique words</strong> you find across every Word Tycoon game — there is nothing to buy here. ' +
        'Each level raises its passive income. Open the Library tab to browse your word collection.' +
      '</div>' +
      '<div class="emp-prestige-actions" style="margin-top:10px">' +
        '<button type="button" class="emp-btn emp-btn-blue" onclick="Empire.extLibrary()">📚 Open Library</button>' +
      '</div>';
  }

  // The stat strip the retired /me management pages showed in their heroes:
  // level + XP progress bar, income rate, prestige tier, StockMogul's career
  // totals, and the collect-cap gauge (portfolio cap / clean-cash storage /
  // XP collect cap). Data comes from the same /api/me/<type> payload the
  // deep pages read, so nothing is lost when /me goes away.
  function sheetStatsHtml(type, d, s) {
    var meta = API[type];
    var level = Number(s[meta.levelKey] || 0);
    var xp = Number(s[meta.xpKey] || 0);
    var need = Number(s.xpNeeded || 0);
    var xpPct = need > 0 ? Math.min(100, Math.floor((xp / need) * 100)) : 100;
    var ips = Number(s.incomePerSecond != null ? s.incomePerSecond : (s.cleanCashPerSec || 0));
    var ipsUnit = type === 'carwash' ? '💰 clean/sec'
      : type === 'stockmogul' ? 'portfolio/sec'
      : type === 'pizza' ? '🍕 pizza XP/sec'
      : 'XP/sec';
    var mult = s.prestigeMultiplier != null ? s.prestigeMultiplier : 1;

    var html = '<div class="emp-statline">';
    html += '<div class="emp-statcell"><b>Lv.' + level + '</b><span>' + fmtNum(xp) + ' / ' + fmtNum(need) + ' XP</span></div>';
    html += '<div class="emp-statcell"><b>' + fmtInc(ips) + '</b><span>' + ipsUnit + '</span></div>';
    html += '<div class="emp-statcell"><b>×' + mult + '</b><span>' + esc(s.prestigeTier || 'multiplier') + '</span></div>';
    if (type === 'stockmogul') {
      html += '<div class="emp-statcell"><b>' + fmtNum(Math.floor(s.totalTrades || 0)) + '</b><span>trades made</span></div>';
      html += '<div class="emp-statcell"><b>' + fmtNum(Math.floor(s.totalCoinsEarned || 0)) + '</b><span>total earned</span></div>';
    }
    html += '</div>';

    // level progress toward the next portfolio/shop level
    html += '<div class="emp-meter" title="Progress to the next level"><i style="width:' + xpPct + '%"></i></div>';

    // collect-cap gauge — mirrors the deep pages' cap bars
    var est = pendingEstimate(type);
    if (est && est.cap > 0) {
      var capPct = Math.min(100, Math.floor((est.raw / est.cap) * 100));
      var capLabel;
      if (type === 'stockmogul') {
        capLabel = 'Portfolio: ' + fmtNum(Math.floor(est.raw)) + ' / ' + fmtNum(est.cap) + ' · 50% converts to ⚡ XP on collect';
      } else if (type === 'carwash') {
        capLabel = 'Storage room: ' + fmtNum(Math.floor(est.raw)) + ' / ' + fmtNum(est.cap) + ' 💰 until full';
      } else {
        capLabel = 'Collect cap: ' + fmtNum(Math.floor(est.raw)) + ' / ' + fmtNum(est.cap) + ' ' + est.unit;
      }
      html += '<div class="emp-cap-note' + (est.capped ? ' emp-capped' : '') + '">' + capLabel + (est.capped ? ' — full, collect now!' : '') + '</div>';
      html += '<div class="emp-meter emp-meter-cap' + (est.capped ? ' emp-capped' : '') + '"><i style="width:' + capPct + '%"></i></div>';
    }
    return html;
  }

  function renderSheetBody(type) {
    if (!sheet.root || state.openType !== type) return;
    var body = sheet.root.querySelector('.emp-sheet-body');
    if (!body) return;
    var d = detailOf(type);
    var meta = API[type];
    if (!d) { body.innerHTML = '<div class="emp-body-loading">⏳ Opening the books…</div>'; return; }
    if (!d.ok || !d[meta.hasKey]) {
      body.innerHTML = '<div class="emp-body-loading">🚧 This business has no ledger yet — try again in a moment.</div>';
      return;
    }
    var s = d[meta.stateKey];
    var wallet = walletOf(type);
    var scrollTop = body.scrollTop;
    var html = '';

    // Collect + wallet
    html += '<div class="emp-sheet-toprow">';
    html += '<div class="emp-wallet-note">' + wallet.label.chip + ': <strong>' + fmtNum(Math.floor(wallet.amount)) + '</strong></div>';
    html += '<button type="button" class="emp-btn emp-btn-green emp-collect-btn" data-emp-collect="' + type + '" ' +
      'onclick="Empire.collect(\'' + type + '\')">Collect</button>';
    html += '</div>';

    // The old /me deep pages' hero numbers, folded into the sheet:
    // level + XP progress, income rate, prestige tier, and the cap gauge.
    html += sheetStatsHtml(type, d, s);

    // Upgrades
    html += '<div class="emp-sec-title">🔧 Upgrades</div>';
    html += '<div class="emp-upg-list">';
    var au = d.availableUpgrades || {};
    Object.keys(au).forEach(function (key) {
      html += upgradeRowHtml(type, key, au[key], wallet);
    });
    if (!Object.keys(au).length) html += '<div class="emp-body-loading">No upgrades available.</div>';
    html += '</div>';

    // Prestige
    var level = Number(s[meta.levelKey] || 0);
    var canPrestige = level >= 100;
    var gatePct = Math.min(100, Math.floor(level));
    var busyP = !!state.busy[type + ':prestige'];
    html += '<div class="emp-sec-title">⭐ Prestige</div>';
    html += '<div class="emp-prestige-panel">';
    html += '<div class="emp-prestige-top">';
    if (s.prestigeTier) html += '<span class="emp-prestige-tier">' + esc(s.prestigeTier) + '</span>';
    html += '<span class="emp-chip emp-prestige-mult">×' + (s.prestigeMultiplier != null ? s.prestigeMultiplier : 1) + ' multiplier</span>';
    if (Number(s.prestigeLevel || 0) > 0) html += '<span class="emp-chip emp-prestige">P' + s.prestigeLevel + '</span>';
    html += '</div>';
    if (canPrestige) {
      html += '<div class="emp-prestige-note">✨ Level 100 reached — ready for the next tier!</div>';
    } else {
      html += '<div class="emp-prestige-note">Reach shop level 100 to prestige (' + level + '/100).</div>';
      html += '<div class="emp-prestige-gate-bar"><i style="width:' + gatePct + '%"></i></div>';
    }
    html += '<div class="emp-prestige-actions">';
    html += '<button type="button" class="emp-btn emp-btn-gold" ' + (canPrestige && !busyP ? '' : 'disabled ') +
      'onclick="Empire.prestige(\'' + type + '\')">' + (busyP ? 'Prestiging…' : '⭐ Prestige Now') + '</button>';
    html += '</div></div>';

    // Staff: manager + foreman full rows
    html += '<div class="emp-sec-title">🧑‍💼 Staff</div>';
    html += '<div class="emp-staff-list" data-emp-sheet-staff>' + staffSectionInner(type) + '</div>';

    // Footer: rename + style chips
    html += '<div class="emp-foot">';
    html += '<div class="emp-rename-row">' +
      '<input class="emp-rename-input" data-emp-rename="' + type + '" maxlength="24" value="' + esc(s[meta.nameKey] || '') + '" placeholder="Business name...">' +
      '<button type="button" class="emp-btn emp-btn-ghost" onclick="Empire.rename(\'' + type + '\')">Rename</button>' +
    '</div>';
    var ac = d.availableCustomizations || {};
    if (Object.keys(ac).length) {
      html += '<details class="emp-style-details"><summary>🎨 Style &amp; decor ▾</summary>';
      Object.keys(ac).forEach(function (cat) {
        var catDef = ac[cat] || {};
        var currentVal = (d.customizations && d.customizations[cat]) || catDef.default;
        html += '<div class="emp-style-group"><div class="emp-style-group-name">' + esc(catDef.name || cat) + '</div><div class="emp-style-chips">';
        (catDef.options || []).forEach(function (opt) {
          var sel = opt.id === currentVal;
          var locked = !!opt.locked;
          html += '<span class="emp-chip emp-style-chip' + (sel ? ' emp-selected' : '') + (locked ? ' emp-style-locked' : '') + '"' +
            (locked ? '' : ' onclick="Empire.customize(\'' + type + '\',\'' + safeKey(cat) + '\',\'' + safeKey(opt.id) + '\')"') + '>' +
            esc(opt.name) + (locked ? ' 🔒 P' + (opt.minPrestige || '?') : '') + (sel ? ' ✔' : '') +
          '</span>';
        });
        html += '</div></div>';
      });
      html += '</details>';
    }
    html += '</div>';

    body.innerHTML = html;
    body.scrollTop = scrollTop;
    updateXpBar(type);
    tick();
  }

  // Full-size manager + foreman rows for the sheet's staff section.
  function staffSectionInner(type) {
    var mi = managerInfo(type);
    var fi = foremanInfo(type);
    if (!mi) return '<div class="emp-body-loading">⏳ Loading staff…</div>';
    var html = '';

    // Manager row
    html += '<div class="emp-staff-row">';
    html += '<span class="emp-manager-portrait">' + mi.emoji + '</span>';
    html += '<div class="emp-staff-info">' +
      '<div class="emp-staff-name">' + esc(mi.name) + '</div>' +
      '<div class="emp-staff-desc">Manager · auto-collects every 5 min</div>' +
    '</div>';
    if (mi.hired) {
      html += '<span class="emp-chip emp-manager-hired">✅ Hired</span>';
    } else {
      var busyM = !!state.busy['hire:' + type];
      html += '<button type="button" class="emp-btn emp-btn-gold emp-hire-btn" ' + (afford(mi.cost) && !busyM ? '' : 'disabled ') +
        'onclick="Empire.hire(\'' + type + '\', this)">' + (busyM ? 'Hiring…' : 'Hire · ' + fmtNum(mi.cost) + ' XP') + '</button>';
    }
    html += '</div>';

    // Foreman row (hidden entirely if the server has no foreman catalog)
    if (fi) {
      html += '<div class="emp-staff-row' + (!mi.hired ? ' emp-staff-locked' : '') + '">';
      html += '<span class="emp-manager-portrait">' + (mi.hired ? fi.emoji : '🔒') + '</span>';
      html += '<div class="emp-staff-info">' +
        '<div class="emp-staff-name">' + esc(fi.name) + '</div>' +
        '<div class="emp-staff-desc">Foreman · works under the manager</div>' +
      '</div>';
      if (!mi.hired) {
        html += '<span class="emp-chip emp-staff-req">Requires manager</span>';
      } else if (fi.hired) {
        html += '<span class="emp-chip emp-manager-hired">✅ auto-buys the cheapest upgrade every 5 min</span>';
      } else {
        var busyF = !!state.busy['foreman:' + type];
        html += '<button type="button" class="emp-btn emp-btn-gold emp-hire-btn" ' + (afford(fi.cost) && !busyF ? '' : 'disabled ') +
          'onclick="Empire.hireForeman(\'' + type + '\', this)">' + (busyF ? 'Hiring…' : 'Hire · ' + fmtNum(fi.cost) + ' XP') + '</button>';
      }
      html += '</div>';
    }
    return html;
  }

  function upgradeRowHtml(type, key, def, wallet) {
    var k = safeKey(key);
    var pct = def.maxLevel > 0 ? Math.floor((def.currentLevel / def.maxLevel) * 100) : 0;
    var preview = def.effectPreview || {};
    var maxBuy = def.maxBuy || { levels: 0 };
    var busyOne = !!state.busy[type + ':upg:' + key];
    var busyMax = !!state.busy[type + ':upgmax:' + key];
    var affordUp = wallet.amount >= Number(def.cost || 0);
    var html = '<div class="emp-upg' + (def.maxed ? ' emp-upg-maxed' : '') + '">';
    html += '<div class="emp-upg-emoji">' + (def.emoji || '🔧') + '</div>';
    html += '<div class="emp-upg-info">';
    html += '<div class="emp-upg-name">' + esc(def.name) + '<small>Lv.' + def.currentLevel + '/' + def.maxLevel + '</small></div>';
    if (def.desc) html += '<div class="emp-upg-desc">' + esc(def.desc) + '</div>';
    if (preview.current) {
      html += '<div class="emp-upg-effect">' + esc(preview.current) +
        (preview.next && !def.maxed ? ' → ' + esc(preview.next) : '') + '</div>';
    }
    html += '<div class="emp-upg-bar"><i style="width:' + pct + '%"></i></div>';
    html += '</div>';
    if (def.maxed) {
      html += '<div class="emp-upg-btns"><span class="emp-upg-max-tag">MAXED ⭐</span></div>';
    } else {
      html += '<div class="emp-upg-btns">';
      html += '<button type="button" class="emp-btn emp-btn-green" ' + (affordUp && !busyOne ? '' : 'disabled ') +
        'onclick="Empire.upgrade(\'' + type + '\',\'' + k + '\',false)">' +
        (busyOne ? '…' : '+1 · ' + fmtNum(def.cost) + ' ' + wallet.label.unit) + '</button>';
      html += '<button type="button" class="emp-btn emp-btn-ghost" ' + (maxBuy.levels > 0 && !busyMax ? '' : 'disabled ') +
        'onclick="Empire.upgrade(\'' + type + '\',\'' + k + '\',true)">' +
        (busyMax ? '…' : 'MAX' + (maxBuy.levels > 0 ? ' (+' + maxBuy.levels + ')' : '')) + '</button>';
      html += '</div>';
    }
    html += '</div>';
    return html;
  }

  function cardEl(type) {
    return mountEl ? mountEl.querySelector('.emp-card[data-emp-type="' + type + '"]') : null;
  }

  function collectBtns(type) {
    var out = [];
    if (mountEl) {
      var a = mountEl.querySelector('[data-emp-collect="' + type + '"]');
      if (a) out.push(a);
    }
    if (sheet.root && !sheet.root.hidden) {
      var b = sheet.root.querySelector('[data-emp-collect="' + type + '"]');
      if (b) out.push(b);
    }
    return out;
  }

  // ─── Ticker (collect estimates on cards + open sheet) ─────────────
  function startTicker() {
    if (state.ticker) return;
    state.ticker = setInterval(tick, 1000);
    tick();
  }
  function tick() {
    var sheetOpen = !!(state.openType && sheet.root && !sheet.root.hidden);
    if (!mountVisible() && !sheetOpen) return;
    Object.keys(MANAGED).forEach(function (type) {
      var btns = collectBtns(type);
      if (!btns.length) return;
      var est = pendingEstimate(type);
      var label = !est ? 'Collect'
        : 'Collect ' + (est.approx ? '≈' : '') + fmtNum(est.amount) + ' ' + est.unit + (est.capped ? ' ⚠' : '');
      btns.forEach(function (btn) {
        if (btn.disabled) return;
        btn.textContent = label;
      });
    });
  }

  // ─── Coin counter animation ───────────────────────────────────────
  function coinCountEl() {
    return mountEl ? mountEl.querySelector('[data-emp-coin-count]') : null;
  }
  function animateCoins(target) {
    var el = coinCountEl();
    if (!el) return;
    target = Number(target) || 0;
    if (state.coinShown == null || reducedMotion()) {
      state.coinShown = target;
      el.textContent = fmtNum(target);
      return;
    }
    var from = state.coinShown;
    if (from === target) return;
    state.coinShown = target;
    var start = null;
    var dur = 600;
    function step(ts) {
      if (state.coinShown !== target) return; // superseded by a newer value
      if (!start) start = ts;
      var t = Math.min(1, (ts - start) / dur);
      var eased = 1 - Math.pow(1 - t, 3);
      var cur = coinCountEl();
      if (!cur) return;
      cur.textContent = fmtNum(Math.round(from + (target - from) * eased));
      if (t < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
    // rAF is throttled in hidden/background tabs — guarantee the final value
    setTimeout(function () {
      if (state.coinShown !== target) return;
      var cur = coinCountEl();
      if (cur) cur.textContent = fmtNum(target);
    }, dur + 150);
  }

  function setCoins(newBalance) {
    if (newBalance == null || isNaN(Number(newBalance))) return;
    var p = getProfile();
    if (p && p.profile) p.profile.coins = Number(newBalance);
    animateCoins(Number(newBalance));
    var d = getDeps();
    if (typeof d.onCoinsChange === 'function') {
      try { d.onCoinsChange(Number(newBalance)); } catch (e) {}
    }
  }

  function refreshProfileSoft() {
    if (DEMO) { render(state.profile); return; }
    var d = getDeps();
    if (typeof d.refreshProfile === 'function') { try { d.refreshProfile(); } catch (e) {} }
  }

  // ─── Actions ──────────────────────────────────────────────────────
  function collect(type) {
    if (!MANAGED[type] || state.busy[type + ':collect']) return;
    state.busy[type + ':collect'] = true;
    var btns = collectBtns(type);
    var est = pendingEstimate(type);
    btns.forEach(function (btn) { btn.disabled = true; btn.textContent = 'Collecting…'; });
    postJson('/api/me/' + type + '/collect', {}).then(function (data) {
      delete state.busy[type + ':collect'];
      collectBtns(type).forEach(function (btn) { btn.disabled = false; });
      if (data && data.ok) {
        // Server response is authoritative; the button estimate was a preview.
        var collected = data.collected != null ? data.collected : (est ? est.amount : 0);
        var msg = data.message || ('+' + fmtNum(Math.floor(collected)) + ' ' + API[type].collectUnit + ' collected!' + (data.capped ? ' (cap reached)' : ''));
        notify(msg, 'success');
        coinBurst(collectBtns(type)[0] || cardEl(type));
        if (data.newBalance != null) setCoins(data.newBalance);
        fetchDetail(type, true).then(function () {
          updateXpBar(type);
          if (state.openType === type) renderSheetBody(type);
          tick();
        });
        refreshProfileSoft();
      } else {
        notify((data && data.message) || 'Nothing to collect yet', data && data.message ? 'error' : 'info');
        tick();
      }
    }).catch(function () {
      delete state.busy[type + ':collect'];
      collectBtns(type).forEach(function (btn) { btn.disabled = false; });
      notify('Failed to collect — try again', 'error');
      tick();
    });
  }

  function upgrade(type, key, isMax) {
    var busyKey = type + (isMax ? ':upgmax:' : ':upg:') + key;
    if (state.busy[busyKey]) return;
    state.busy[busyKey] = true;
    if (state.openType === type) renderSheetBody(type);
    postJson('/api/me/' + type + '/' + (isMax ? 'upgrade-max' : 'upgrade'), { upgradeType: key }).then(function (data) {
      delete state.busy[busyKey];
      if (data && data.ok) {
        notify(data.message || 'Upgrade purchased!', 'success');
        coinBurst(cardEl(type), 6);
        if (data.playerCoins != null) setCoins(data.playerCoins);
        fetchDetail(type, true).then(function () {
          updateXpBar(type);
          if (state.openType === type) renderSheetBody(type);
        });
        refreshProfileSoft();
      } else {
        notify((data && data.message) || 'Upgrade failed', 'error');
        if (state.openType === type) renderSheetBody(type);
      }
    }).catch(function () {
      delete state.busy[busyKey];
      notify('Upgrade failed — try again', 'error');
      if (state.openType === type) renderSheetBody(type);
    });
  }

  function prestige(type) {
    if (state.busy[type + ':prestige']) return;
    var s = stateOf(type);
    var mult = s && s.prestigeMultiplier != null ? s.prestigeMultiplier : 1;
    if (!window.confirm('Prestige ' + BIZ_META[type].name + '?\n\nThis resets its level, upgrades and stored cash — but you keep your ×' + mult + ' multiplier and move up a tier.')) return;
    state.busy[type + ':prestige'] = true;
    if (state.openType === type) renderSheetBody(type);
    postJson('/api/me/' + type + '/prestige', {}).then(function (data) {
      delete state.busy[type + ':prestige'];
      if (data && data.ok) {
        notify(data.message || 'Prestige complete! ⭐', 'success');
        coinBurst(cardEl(type), 14);
        fetchDetail(type, true).then(function () {
          updateXpBar(type);
          if (state.openType === type) renderSheetBody(type);
        });
        refreshProfileSoft();
      } else {
        notify((data && data.message) || 'Prestige failed', 'error');
        if (state.openType === type) renderSheetBody(type);
      }
    }).catch(function () {
      delete state.busy[type + ':prestige'];
      notify('Prestige failed — try again', 'error');
      if (state.openType === type) renderSheetBody(type);
    });
  }

  function rename(type) {
    var input = sheet.root ? sheet.root.querySelector('[data-emp-rename="' + type + '"]') : null;
    if (!input) return;
    var name = input.value.trim();
    if (!name) { notify('Enter a name first', 'error'); return; }
    postJson('/api/me/' + type + '/rename', { name: name }).then(function (data) {
      if (data && data.ok) {
        notify('Renamed to "' + name + '"!', 'success');
        var meta = API[type];
        var s = stateOf(type);
        if (s) s[meta.nameKey] = data[meta.nameKey] || name;
        updateXpBar(type);
      } else {
        notify((data && data.message) || 'Rename failed', 'error');
      }
    }).catch(function () { notify('Rename failed — try again', 'error'); });
  }

  function customize(type, category, value) {
    postJson('/api/me/' + type + '/customize', { category: category, value: value }).then(function (data) {
      if (data && data.ok) {
        var d = detailOf(type);
        if (d) {
          if (!d.customizations) d.customizations = {};
          d.customizations[category] = value;
        }
        notify('Style updated!', 'success');
        if (state.openType === type) renderSheetBody(type);
      } else {
        notify((data && data.message) || 'Customization failed', 'error');
      }
    }).catch(function () { notify('Customization failed — try again', 'error'); });
  }

  function hire(type, btn) {
    if (state.busy['hire:' + type]) return;
    var info = managerInfo(type);
    if (!info || info.hired) return;
    state.busy['hire:' + type] = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Hiring…'; }
    postJson('/api/tycoon/managers/hire', { businessType: type }).then(function (data) {
      delete state.busy['hire:' + type];
      if (data && data.ok) {
        notify(data.message || (info.name + ' hired! Auto-collecting every 5 minutes.'), 'success');
        coinBurst(btn || cardEl(type), 12);
        if (data.newBalance != null) setCoins(data.newBalance);
        ensureManagers(true).then(function () { updateStaffBits(); });
      } else {
        notify((data && data.message) || 'Could not hire manager', 'error');
        updateStaffBits();
      }
    }).catch(function () {
      delete state.busy['hire:' + type];
      notify('Could not hire manager — try again', 'error');
      updateStaffBits();
    });
  }

  // Foreman: auto-buys the cheapest upgrade every 5 min. Server
  // enforces manager-first — surface its message on failure.
  function hireForeman(type, btn) {
    if (state.busy['foreman:' + type]) return;
    var info = foremanInfo(type);
    if (!info || info.hired) return;
    state.busy['foreman:' + type] = true;
    if (btn) { btn.disabled = true; btn.textContent = 'Hiring…'; }
    postJson('/api/tycoon/managers/hire-foreman', { businessType: type }).then(function (data) {
      delete state.busy['foreman:' + type];
      if (data && data.ok) {
        notify(data.message || (info.name + ' hired! Auto-buying the cheapest upgrade every 5 minutes.'), 'success');
        coinBurst(btn || cardEl(type), 12);
        if (data.newBalance != null) setCoins(data.newBalance);
        ensureManagers(true).then(function () { updateStaffBits(); });
      } else {
        notify((data && data.message) || 'Could not hire foreman', 'error');
        updateStaffBits();
      }
    }).catch(function () {
      delete state.busy['foreman:' + type];
      notify('Could not hire foreman — try again', 'error');
      updateStaffBits();
    });
  }

  function unlockStockmogul(btn) {
    var cfg = bizCfg('stockmogul') || {};
    var cost = cfg.cleanCashCost || 5000;
    if (!window.confirm('Unlock Stock Mogul for ' + fmtNum(cost) + ' clean cash from your Car Wash?')) return;
    if (btn) { btn.disabled = true; btn.textContent = 'Unlocking…'; }
    postJson('/api/me/carwash/buy-stockmogul', {}).then(function (data) {
      if (data && data.ok) {
        notify(data.message || 'Stock Mogul unlocked! 📈', 'success');
        coinBurst(btn);
        delete state.detail.stockmogul;
        delete state.detail.carwash;
        refreshProfileSoft();
      } else {
        notify((data && data.message) || 'Not enough clean cash', 'error');
        if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
      }
    }).catch(function () {
      notify('Unlock failed — try again', 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Unlock'; }
    });
  }

  function buy(type, btn) {
    var d = getDeps();
    if (typeof d.buyBusiness === 'function') { try { d.buyBusiness(type, btn); } catch (e) {} }
  }

  function extLibrary() {
    if (typeof window.openLibrary === 'function') { window.openLibrary(); return; }
    notify('The Library lives in the Word Tycoon portal', 'info');
  }
  function extArcade() {
    if (typeof window.openArcade === 'function') { window.openArcade(); return; }
    window.open('/arcade/', '_blank');
  }

  // ─── Public API ───────────────────────────────────────────────────
  function open(type) {
    if (!type || !BIZ_META[type]) return;
    if (type === 'arcade') { extArcade(); return; }
    var attempt = function (tries) {
      var card = cardEl(type);
      if (card) {
        if ((MANAGED[type] && isOwned(type)) || type === 'library') {
          openSheet(type);
        } else {
          try { card.scrollIntoView({ behavior: reducedMotion() ? 'auto' : 'smooth', block: 'nearest' }); } catch (e) {}
        }
        return;
      }
      // Grid not rendered yet (tab still loading) — retry briefly.
      if (tries > 0) setTimeout(function () { attempt(tries - 1); }, 250);
    };
    attempt(8);
  }

  function toggle(type) {
    if (state.openType === type) closeSheet();
    else open(type);
  }

  function refresh() {
    state.detail = {};
    state.managers = null;
    if (DEMO) { seedDemo(); render(state.profile); return; }
    var d = getDeps();
    if (typeof d.refreshProfile === 'function') d.refreshProfile();
    else render(getProfile());
  }

  window.Empire = {
    render: render,
    open: open,
    close: closeSheet,
    refresh: refresh,
    mount: mount,
    toggle: toggle,
    collect: collect,
    upgrade: upgrade,
    prestige: prestige,
    rename: rename,
    customize: customize,
    hire: hire,
    hireForeman: hireForeman,
    unlockStockmogul: unlockStockmogul,
    buy: buy,
    extLibrary: extLibrary,
    extArcade: extArcade
  };

  // Pre-tag the portal host so empire.css paints the tab before the
  // first render (portal-only convenience; harmless elsewhere).
  (function earlyScope() {
    var host = document.getElementById('tab-businesses');
    if (host) host.classList.add('emp-scope');
  })();

  // ════════════════════════════════════════════════════════════════
  // DEMO MODE — built-in fixtures, zero network calls
  // ════════════════════════════════════════════════════════════════
  function mkUpgrades(defs, walletAmount) {
    var out = {};
    defs.forEach(function (u) {
      var maxed = u.lv >= u.max;
      out[u.key] = {
        name: u.name, emoji: u.emoji, desc: u.desc,
        currentLevel: u.lv, maxLevel: u.max, cost: u.cost, maxed: maxed,
        maxBuy: maxed ? { levels: 0, totalCost: 0 } : { levels: Math.max(0, Math.min(u.max - u.lv, Math.floor(walletAmount / Math.max(1, u.cost)))), totalCost: u.cost * 2 },
        effectPreview: { current: u.cur, next: u.next }
      };
    });
    return out;
  }
  function mkCustomizations() {
    return {
      theme: {
        name: 'Theme', default: 'classic',
        options: [
          { id: 'classic', name: 'Classic' },
          { id: 'neon', name: 'Neon' },
          { id: 'gold', name: 'Gold', locked: true, minPrestige: 2 }
        ]
      },
      music: {
        name: 'Music', default: 'none',
        options: [
          { id: 'none', name: 'None' },
          { id: 'jazz', name: 'Jazz' },
          { id: 'lofi', name: 'Lo-fi' }
        ]
      }
    };
  }

  var demoDb = null;
  function seedDemo() {
    var now = Date.now();
    demoDb = {
      coins: 8000000,
      managers: {
        ok: true,
        managers: {
          newspaper: { hired: true, hiredAt: now - 86400000 },
          carwash: { hired: true, hiredAt: now - 43200000 },
          pizza: { hired: true, hiredAt: now - 3600000 }
        },
        catalog: {
          newspaper:  { name: 'Route Chief',     emoji: '🗞️', cost: 100000,    hired: true },
          carwash:    { name: 'Suds Supervisor', emoji: '🧽',       cost: 500000,    hired: true },
          pizza:      { name: 'Head Chef',       emoji: '👨‍🍳', cost: 1000000, hired: true },
          stockmogul: { name: 'Floor Broker',    emoji: '🧑‍💼', cost: 2000000, hired: false },
          gym:        { name: 'Coach',           emoji: '💪',       cost: 5000000,   hired: false },
          cinema:     { name: 'Projectionist',   emoji: '🎞️', cost: 20000000,  hired: false },
          startup:    { name: 'CTO',             emoji: '🚀',       cost: 50000000,  hired: false },
          bank:       { name: 'Branch Director', emoji: '🏦',       cost: 100000000, hired: false }
        },
        // Foreman fixtures cover all three states:
        //   newspaper → HIRED · carwash → hireable (affordable) ·
        //   pizza → hireable but unaffordable (10M > 8M) ·
        //   the rest → locked behind an unhired manager.
        foremen: {
          newspaper: { hired: true, hiredAt: now - 43200000 }
        },
        foremanCatalog: {
          newspaper:  { name: 'Route Foreman',            emoji: '📋', cost: 1000000,    hired: true,  requiresManager: true },
          carwash:    { name: 'Bay Foreman',              emoji: '🪣', cost: 5000000,    hired: false, requiresManager: true },
          pizza:      { name: 'Sous Chef',                emoji: '🍕', cost: 10000000,   hired: false, requiresManager: true },
          stockmogul: { name: 'Trading Desk Chief',       emoji: '📊', cost: 20000000,   hired: false, requiresManager: true },
          gym:        { name: 'Head Coach',               emoji: '🥇', cost: 50000000,   hired: false, requiresManager: true },
          cinema:     { name: 'Floor Manager',            emoji: '🎟️', cost: 200000000,  hired: false, requiresManager: true },
          startup:    { name: 'VP of Engineering',        emoji: '🧑‍💻', cost: 500000000, hired: false, requiresManager: true },
          bank:       { name: 'Chief Operations Officer', emoji: '🏛️', cost: 1000000000, hired: false, requiresManager: true }
        }
      },
      detail: {
        newspaper: {
          ok: true, hasRoute: true, playerCoins: 8000000, collectCap: 1000000,
          pending: { xpEarned: 412300 },
          route: {
            routeName: 'The Daily Toon', routeLevel: 100, routeXp: 88200, xpNeeded: 91000,
            prestigeLevel: 2, prestigeTier: 'Metro Desk', prestigeMultiplier: 3,
            incomePerSecond: 96.4, lastCollectedAt: new Date(now - 3600000).toISOString(),
            totalPapersDelivered: 184220, totalXpEarned: 96000000
          },
          upgrades: { bicycle: 18, carriers: 12, subscribers: 9, racks: 6, headlines: 4, presses: 3, vans: 1 },
          customizations: { theme: 'classic', music: 'none' },
          availableUpgrades: mkUpgrades([
            { key: 'bicycle', name: 'Faster Bicycle', emoji: '🚲', desc: 'Deliver papers faster on every loop.', lv: 18, max: 25, cost: 220000, cur: '5.2s/route', next: '5.0s/route' },
            { key: 'carriers', name: 'Paper Carriers', emoji: '🧍', desc: 'More carriers, more papers per route.', lv: 12, max: 20, cost: 340000, cur: '12 carriers', next: '13 carriers' },
            { key: 'subscribers', name: 'Subscribers', emoji: '📬', desc: 'Loyal readers boost route income.', lv: 9, max: 20, cost: 410000, cur: '+45% income', next: '+50% income' },
            { key: 'racks', name: 'News Racks', emoji: '🗞️', desc: 'Street racks sell while you sleep.', lv: 6, max: 15, cost: 505000, cur: '6 racks', next: '7 racks' },
            { key: 'headlines', name: 'Hot Headlines', emoji: '📰', desc: 'Juicier headlines, bigger sales.', lv: 4, max: 10, cost: 660000, cur: '+20% sales', next: '+25% sales' },
            { key: 'presses', name: 'Printing Presses', emoji: '🖨️', desc: 'Print more copies per hour.', lv: 3, max: 10, cost: 900000, cur: '3 presses', next: '4 presses' },
            { key: 'vans', name: 'Delivery Vans', emoji: '🚐', desc: 'Cover whole neighborhoods at once.', lv: 1, max: 5, cost: 1500000, cur: '1 van', next: '2 vans' }
          ], 8000000),
          availableCustomizations: mkCustomizations()
        },
        carwash: {
          ok: true, hasShop: true,
          pending: { cleanCash: 8640 },
          shop: {
            shopName: 'Bubble Trouble', shopLevel: 41, shopXp: 15200, xpNeeded: 26000,
            prestigeLevel: 1, prestigeTier: 'Street Sparkler', prestigeMultiplier: 2,
            cleanCash: 61400, cleanCashPerSec: 3.4, cleanCashCap: 100000,
            incomePerSecond: 0, totalCarsWashed: 33120
          },
          upgrades: { hoses: 10, soap: 8, dryers: 5, vacuums: 4, wax: 2, signage: 2, loyalty: 1 },
          customizations: { theme: 'classic', music: 'jazz' },
          availableUpgrades: mkUpgrades([
            { key: 'hoses', name: 'Power Hoses', emoji: '💦', desc: 'Blast the grime off faster.', lv: 10, max: 20, cost: 3800, cur: '3.4 clean/sec', next: '3.7 clean/sec' },
            { key: 'soap', name: 'Premium Soap', emoji: '🧼', desc: 'Suds so good cars come back.', lv: 8, max: 20, cost: 4500, cur: '+40% shine', next: '+45% shine' },
            { key: 'dryers', name: 'Turbo Dryers', emoji: '🌪️', desc: 'No drip-drying in this lot.', lv: 5, max: 15, cost: 6200, cur: '5 dryers', next: '6 dryers' },
            { key: 'vacuums', name: 'Shop Vacuums', emoji: '🧹', desc: 'Interior detail adds big tips.', lv: 4, max: 15, cost: 7400, cur: '+18% tips', next: '+22% tips' },
            { key: 'wax', name: 'Hot Wax Bay', emoji: '✨', desc: 'Premium wax finish upsell.', lv: 2, max: 10, cost: 11000, cur: '2 bays', next: '3 bays' },
            { key: 'signage', name: 'Neon Signage', emoji: '💡', desc: 'Pull more cars off the street.', lv: 2, max: 10, cost: 12500, cur: '+10% traffic', next: '+14% traffic' },
            { key: 'loyalty', name: 'Loyalty Cards', emoji: '🎫', desc: 'Tenth wash free keeps them loyal.', lv: 1, max: 5, cost: 20000, cur: '+5% repeat', next: '+9% repeat' }
          ], 61400),
          availableCustomizations: mkCustomizations()
        },
        stockmogul: {
          ok: true, hasPortfolio: true,
          pending: { portfolioCoins: 2210 },
          portfolio: {
            portfolioName: 'Toon Capital', portfolioLevel: 12, portfolioXp: 3400, xpNeeded: 8200,
            prestigeLevel: 0, prestigeTier: 'Day Trader', prestigeMultiplier: 1,
            cleanCash: 14800, portfolioCoins: 6100, portfolioCoinsCap: 15000,
            incomePerSecond: 42.7, totalTrades: 1240, totalCoinsEarned: 1860000
          },
          upgrades: { portfolio: 6, leverage: 2, insider: 0, analysts: 3, terminals: 2, bots: 1, hedges: 0 },
          customizations: { theme: 'classic', music: 'none' },
          availableUpgrades: mkUpgrades([
            { key: 'portfolio', name: 'Diversify Portfolio', emoji: '📈', desc: 'More holdings, steadier dividends.', lv: 6, max: 20, cost: 2600, cur: '2 holdings', next: '3 holdings' },
            { key: 'leverage', name: 'Leverage', emoji: '⚡', desc: 'Borrow big, win bigger.', lv: 2, max: 10, cost: 4200, cur: '2× leverage', next: '3× leverage' },
            { key: 'insider', name: 'Insider Tips', emoji: '📱', desc: 'A friend of a friend heard a thing.', lv: 0, max: 5, cost: 9800, cur: 'No tips', next: 'Weekly tips' },
            { key: 'analysts', name: 'Analysts', emoji: '🧑‍💻', desc: 'Charts, graphs, confidence.', lv: 3, max: 15, cost: 3100, cur: '3 analysts', next: '4 analysts' },
            { key: 'terminals', name: 'Trading Terminals', emoji: '🖥️', desc: 'More screens = more trades.', lv: 2, max: 10, cost: 3900, cur: '2 terminals', next: '3 terminals' },
            { key: 'bots', name: 'Trading Bots', emoji: '🤖', desc: 'They never sleep. Ever.', lv: 1, max: 10, cost: 5400, cur: '1 bot', next: '2 bots' },
            { key: 'hedges', name: 'Hedge Positions', emoji: '🛡️', desc: 'Protect the downside.', lv: 0, max: 5, cost: 8000, cur: 'Unhedged', next: 'Hedged 10%' }
          ], 14800),
          availableCustomizations: mkCustomizations()
        },
        pizza: {
          ok: true, hasShop: true,
          pending: { pizzaCoins: 15400 },
          shop: {
            shopName: 'Slice City', shopLevel: 33, shopXp: 9100, xpNeeded: 15400,
            prestigeLevel: 1, prestigeTier: 'Professional', prestigeMultiplier: 2,
            pizzaCoins: 87200, incomePerSecond: 18.9,
            totalPizzasServed: 52110, totalCoinsEarned: 4210000
          },
          upgrades: { oven: 12, staff: 9, seating: 7, marketing: 5, capacity: 4, delivery: 2, quality: 2 },
          customizations: { theme: 'classic', music: 'italian' },
          availableUpgrades: mkUpgrades([
            { key: 'oven', name: 'Hotter Ovens', emoji: '🔥', desc: 'Bake faster, serve faster.', lv: 12, max: 25, cost: 5200, cur: '3.2s/pizza', next: '3.0s/pizza' },
            { key: 'staff', name: 'Kitchen Staff', emoji: '👨‍🍳', desc: 'More hands on the dough.', lv: 9, max: 20, cost: 6100, cur: '3 cooks', next: '4 cooks' },
            { key: 'seating', name: 'Seating', emoji: '🪑', desc: 'Seat more hungry customers.', lv: 7, max: 20, cost: 6800, cur: '16 seats', next: '18 seats' },
            { key: 'marketing', name: 'Marketing', emoji: '📣', desc: 'Flyers, ads, a dancing mascot.', lv: 5, max: 15, cost: 8900, cur: '+25% traffic', next: '+30% traffic' },
            { key: 'capacity', name: 'Kitchen Capacity', emoji: '🏭', desc: 'Bigger kitchen, more ovens.', lv: 4, max: 10, cost: 12000, cur: '1 oven bay', next: '2 oven bays' },
            { key: 'delivery', name: 'Delivery Fleet', emoji: '🛵', desc: 'Hot slices across town.', lv: 2, max: 10, cost: 16500, cur: '2 scooters', next: '3 scooters' },
            { key: 'quality', name: 'Ingredient Quality', emoji: '🍅', desc: 'Fresher toppings, bigger tips.', lv: 2, max: 10, cost: 19000, cur: '+10% price', next: '+14% price' }
          ], 87200),
          availableCustomizations: mkCustomizations()
        },
        gym: {
          ok: true, hasGym: true, playerCoins: 8000000, collectCap: 2500000,
          pending: { xpEarned: 96200 },
          gym: {
            gymName: 'Flex Factory', gymLevel: 8, gymXp: 1900, xpNeeded: 5400,
            prestigeLevel: 0, prestigeTier: 'Garage Gym', prestigeMultiplier: 1,
            incomePerSecond: 118, lastCollectedAt: new Date(now - 815000).toISOString(),
            totalMembersTrained: 940, totalXpEarned: 5100000
          },
          upgrades: { equipment: 4, trainers: 2, classes: 1, cardio: 1, sauna: 0, juicebar: 0, franchise: 0 },
          customizations: { theme: 'classic', music: 'none' },
          availableUpgrades: mkUpgrades([
            { key: 'equipment', name: 'Equipment', emoji: '🏋️', desc: 'Racks, plates, and chrome.', lv: 4, max: 20, cost: 310000, cur: '3 stations', next: '4 stations' },
            { key: 'trainers', name: 'Trainers', emoji: '💪', desc: 'Personal training sells out fast.', lv: 2, max: 15, cost: 450000, cur: '1 trainer', next: '2 trainers' },
            { key: 'classes', name: 'Group Classes', emoji: '🧘', desc: 'Spin, yoga, toon-boxing.', lv: 1, max: 15, cost: 520000, cur: '1 class', next: '2 classes' },
            { key: 'cardio', name: 'Cardio Zone', emoji: '🏃', desc: 'Treadmills as far as the eye can see.', lv: 1, max: 10, cost: 610000, cur: '1 zone', next: '2 zones' },
            { key: 'sauna', name: 'Sauna', emoji: '🧖', desc: 'Post-workout luxury upsell.', lv: 0, max: 10, cost: 900000, cur: 'No sauna', next: '1 sauna' },
            { key: 'juicebar', name: 'Juice Bar', emoji: '🥤', desc: 'Protein shakes at markup.', lv: 0, max: 10, cost: 1100000, cur: 'No bar', next: '1 bar' },
            { key: 'franchise', name: 'Franchise', emoji: '🏢', desc: 'Open a second location.', lv: 0, max: 5, cost: 5000000, cur: '1 gym', next: '2 gyms' }
          ], 8000000),
          availableCustomizations: mkCustomizations()
        },
        cinema: {
          ok: true, hasCinema: true, playerCoins: 8000000, collectCap: 5000000,
          pending: { xpEarned: 402000 },
          cinema: {
            cinemaName: 'Toonplex 9', cinemaLevel: 3, cinemaXp: 700, xpNeeded: 3600,
            prestigeLevel: 0, prestigeTier: 'Single Screen', prestigeMultiplier: 1,
            incomePerSecond: 431, lastCollectedAt: new Date(now - 933000).toISOString(),
            totalViewersServed: 210, totalXpEarned: 1900000
          },
          upgrades: { screens: 1, projectors: 1, seating: 1, concessions: 0, premieres: 0, imax: 0, loyalty: 0 },
          customizations: { theme: 'classic', music: 'none' },
          availableUpgrades: mkUpgrades([
            { key: 'screens', name: 'More Screens', emoji: '🎞️', desc: 'Show more films at once.', lv: 1, max: 15, cost: 1200000, cur: '1 screen', next: '2 screens' },
            { key: 'projectors', name: 'Projectors', emoji: '📽️', desc: 'Crisper picture, happier crowds.', lv: 1, max: 15, cost: 1350000, cur: '1 projector', next: '2 projectors' },
            { key: 'seating', name: 'Recliner Seating', emoji: '🪑', desc: 'Comfort commands a premium.', lv: 1, max: 15, cost: 1500000, cur: '1 block', next: '2 blocks' },
            { key: 'concessions', name: 'Snack Stands', emoji: '🍿', desc: 'The real profit center.', lv: 0, max: 15, cost: 1750000, cur: 'No stands', next: '1 stand' },
            { key: 'premieres', name: 'Premiere Nights', emoji: '🎬', desc: 'Red carpet, big ticket prices.', lv: 0, max: 10, cost: 2400000, cur: 'None', next: 'Monthly' },
            { key: 'imax', name: 'Giant Screen', emoji: '📺', desc: 'The screen. It is enormous.', lv: 0, max: 5, cost: 4800000, cur: 'None', next: '1 giant screen' },
            { key: 'loyalty', name: 'Members Club', emoji: '🎫', desc: 'Subscriptions smooth income.', lv: 0, max: 10, cost: 3000000, cur: 'None', next: 'Bronze tier' }
          ], 8000000),
          availableCustomizations: mkCustomizations()
        },
        startup: {
          ok: true, hasStartup: false, playerCoins: 8000000, collectCap: 0,
          pending: { xpEarned: 0 }
        },
        bank: {
          ok: true, hasBank: false, playerCoins: 8000000, collectCap: 0,
          pending: { xpEarned: 0 }
        }
      }
    };

    // Businesses list: mixed owned/locked, one at the prestige gate (newspaper)
    var businesses = [
      { business_type: 'library', level: 37, shop_level: 37, prestige_level: 0, owned: 1 },
      { business_type: 'newspaper', level: 100, shop_level: 100, prestige_level: 2, owned: 1 },
      { business_type: 'carwash', level: 58, shop_level: 41, prestige_level: 1, owned: 1 },
      { business_type: 'stockmogul', level: 12, shop_level: 12, prestige_level: 0, owned: 1 },
      { business_type: 'pizza', level: 64, shop_level: 33, prestige_level: 1, owned: 1 },
      { business_type: 'arcade', level: 1, shop_level: 1, prestige_level: 0, owned: 1 },
      { business_type: 'gym', level: 8, shop_level: 8, prestige_level: 0, owned: 1 },
      { business_type: 'cinema', level: 3, shop_level: 3, prestige_level: 0, owned: 1 },
      { business_type: 'space', level: 3, shop_level: 3, prestige_level: 0, owned: 1 }
      // startup + bank intentionally absent → locked cards
    ];

    state.profile = {
      ok: true, linked: true,
      profile: { coins: demoDb.coins },
      businesses: businesses,
      incomePerSecond: {
        total: 1284.6,
        presence: { status: 'online', thresholdMinutes: 3 },
        activeBuffs: [
          { key: 'biz_boost', label: 'Biz Income', value: 0.25 },
          { key: 'coin_bonus', label: 'All Coins', value: 0.1 },
          { key: 'offline_boost', label: 'Offline Income', value: 0.15 }
        ],
        byBusinessType: {
          library: 370, newspaper: 96.4, gym: 118, cinema: 431, space: 240
        },
        newsIncome: 96.4, gymIncome: 118, cinemaIncome: 431,
        startupIncome: 0, bankIncome: 0,
        stockmogulIncome: 42.7, carwashCleanRate: 3.4, pizzaIncome: 18.9
      }
    };
    state.managers = demoDb.managers;
    state.managersAt = Date.now();
    Object.keys(demoDb.detail).forEach(function (type) {
      state.detail[type] = { data: demoDb.detail[type], at: Date.now() };
    });
  }

  function demoGet(url) {
    if (!demoDb) seedDemo();
    if (url === '/api/tycoon/managers') return demoDb.managers;
    var m = url.match(/^\/api\/me\/(\w+)$/);
    if (m && demoDb.detail[m[1]]) return demoDb.detail[m[1]];
    return { ok: false, message: 'Demo mode' };
  }

  function demoPost(url, body) {
    if (!demoDb) seedDemo();
    // Hire manager
    if (url === '/api/tycoon/managers/hire') {
      var t = body && body.businessType;
      var cat = demoDb.managers.catalog[t];
      if (!cat) return { ok: false, message: 'No manager for that business' };
      if (cat.hired) return { ok: false, message: 'Already hired' };
      if (demoDb.coins < cat.cost) return { ok: false, message: 'Not enough XP' };
      demoDb.coins -= cat.cost;
      cat.hired = true;
      demoDb.managers.managers[t] = { hired: true, hiredAt: Date.now() };
      state.profile.profile.coins = demoDb.coins;
      return { ok: true, message: cat.name + ' hired! (demo)', newBalance: demoDb.coins };
    }
    // Hire foreman (server enforces manager-first; demo mirrors that)
    if (url === '/api/tycoon/managers/hire-foreman') {
      var ft = body && body.businessType;
      var fcat = demoDb.managers.foremanCatalog[ft];
      if (!fcat) return { ok: false, message: 'No foreman for that business' };
      var mgr = demoDb.managers.catalog[ft];
      if (!mgr || !mgr.hired) return { ok: false, message: 'Hire the manager first' };
      if (fcat.hired) return { ok: false, message: 'Already hired' };
      if (demoDb.coins < fcat.cost) return { ok: false, message: 'Not enough XP' };
      demoDb.coins -= fcat.cost;
      fcat.hired = true;
      demoDb.managers.foremen[ft] = { hired: true, hiredAt: Date.now() };
      state.profile.profile.coins = demoDb.coins;
      return { ok: true, message: fcat.name + ' hired! Auto-buying the cheapest upgrade every 5 min. (demo)', newBalance: demoDb.coins };
    }
    var m = url.match(/^\/api\/me\/(\w+)\/([\w-]+)$/);
    if (!m) return { ok: false, message: 'Demo mode' };
    var type = m[1], action = m[2];
    if (type === 'carwash' && action === 'buy-stockmogul') return { ok: false, message: 'Already unlocked (demo)' };
    var d = demoDb.detail[type];
    if (!d) return { ok: false, message: 'Demo mode' };
    var meta = API[type];
    var s = meta && d[meta.stateKey];
    if (action === 'collect') {
      var est = pendingEstimate(type) || { amount: 0 };
      if (d.pending) {
        if (d.pending.xpEarned != null) d.pending.xpEarned = 0;
        if (d.pending.cleanCash != null) { s.cleanCash = Math.min((s.cleanCash || 0) + est.amount, s.cleanCashCap || Infinity); d.pending.cleanCash = 0; }
        if (d.pending.pizzaCoins != null) { s.pizzaCoins = (s.pizzaCoins || 0) + est.amount; d.pending.pizzaCoins = 0; }
        if (d.pending.portfolioCoins != null) { d.pending.portfolioCoins = 0; s.portfolioCoins = 0; }
      }
      state.detail[type] = { data: d, at: Date.now() };
      if (meta && meta.wallet === 'coins') {
        demoDb.coins += est.amount;
        state.profile.profile.coins = demoDb.coins;
        return { ok: true, collected: est.amount, newBalance: demoDb.coins };
      }
      if (type === 'stockmogul') {
        demoDb.coins += est.amount;
        state.profile.profile.coins = demoDb.coins;
        return { ok: true, message: '+' + fmtNum(est.amount) + ' XP from dividends (demo)', newBalance: demoDb.coins };
      }
      return { ok: true, message: '+' + fmtNum(est.amount) + ' collected (demo)' };
    }
    if (action === 'upgrade' || action === 'upgrade-max') {
      var key = body && body.upgradeType;
      var def = d.availableUpgrades && d.availableUpgrades[key];
      if (!def) return { ok: false, message: 'Unknown upgrade' };
      if (def.maxed) return { ok: false, message: 'Already maxed' };
      var w = walletOf(type);
      var levels = action === 'upgrade-max' ? Math.max(1, def.maxBuy.levels) : 1;
      var totalCost = def.cost * levels;
      if (w.amount < def.cost) return { ok: false, message: 'Not enough ' + w.label.unit };
      def.currentLevel = Math.min(def.maxLevel, def.currentLevel + levels);
      def.maxed = def.currentLevel >= def.maxLevel;
      if (meta.wallet === 'coins') { demoDb.coins -= totalCost; d.playerCoins = demoDb.coins; state.profile.profile.coins = demoDb.coins; }
      else if (meta.wallet === 'clean') s.cleanCash = Math.max(0, (s.cleanCash || 0) - totalCost);
      else if (meta.wallet === 'pizza') s.pizzaCoins = Math.max(0, (s.pizzaCoins || 0) - totalCost);
      state.detail[type] = { data: d, at: state.detail[type].at };
      return { ok: true, message: def.name + ' upgraded to Lv.' + def.currentLevel + ' (demo)', playerCoins: meta.wallet === 'coins' ? demoDb.coins : undefined };
    }
    if (action === 'prestige') {
      if (Number(s[meta.levelKey] || 0) < 100) return { ok: false, message: 'Reach level 100 first' };
      s.prestigeLevel = (s.prestigeLevel || 0) + 1;
      s.prestigeMultiplier = (s.prestigeMultiplier || 1) + 1;
      s[meta.levelKey] = 1;
      s[meta.xpKey] = 0;
      Object.keys(d.availableUpgrades || {}).forEach(function (k) {
        d.availableUpgrades[k].currentLevel = 0;
        d.availableUpgrades[k].maxed = false;
      });
      return { ok: true, message: 'Prestiged to ×' + s.prestigeMultiplier + '! (demo)' };
    }
    if (action === 'rename') {
      s[meta.nameKey] = String(body && body.name || '').slice(0, 24);
      var out = { ok: true };
      out[meta.nameKey] = s[meta.nameKey];
      return out;
    }
    if (action === 'customize') {
      return { ok: true };
    }
    return { ok: false, message: 'Demo mode' };
  }

  // ─── Demo boot: activate the tab and render fixtures ──────────────
  function bootDemo() {
    seedDemo();
    // Portal's guest gate would re-hide .emp-page when the nav tab is
    // clicked while logged out — demo mode counts as allowed.
    try { if (window.GUEST_ALLOWED_TABS) window.GUEST_ALLOWED_TABS.businesses = 1; } catch (e) {}
    var activate = function () {
      document.querySelectorAll('.tab').forEach(function (t) { t.classList.remove('active'); });
      document.querySelectorAll('.tab-content').forEach(function (c) { c.classList.remove('active'); });
      var btn = document.querySelector('.tab[data-tab="businesses"]');
      if (btn) btn.classList.add('active');
      var section = document.getElementById('tab-businesses');
      if (section) {
        section.classList.add('active');
        // Undo any guest-gate hiding portal.js may have applied
        Array.prototype.forEach.call(section.children, function (c) {
          if (c.classList && c.classList.contains('guest-gate')) c.style.display = 'none';
          else c.style.display = '';
        });
      }
      render(state.profile);
    };
    activate();
    // Re-assert after portal.js's restoreTab / guest boot settles
    setTimeout(activate, 500);
    setTimeout(activate, 1500);
  }

  if (DEMO) {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootDemo);
    } else {
      bootDemo();
    }
  }
})();
