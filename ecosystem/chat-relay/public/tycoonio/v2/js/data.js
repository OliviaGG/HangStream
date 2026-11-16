/**
 * data.js — auth, API, business catalog, demo fallback.
 * Exports: window.TyData
 */
(function () {
  'use strict';

  const SSO_BRIDGE_URL = 'https://wordtycoon.live/api/auth/sso-check';

  // ── Business catalog (order = unlock order) ───────────────────────────────
  // pal: [top, side accents] base hues used by art.js; tierLv: art upgrades.
  const BIZ = {
    newspaper:  { name: 'Newspaper Route', emoji: '🗞️', pal: '#8fa8bd', managed: true,  foot: [2, 2] },
    carwash:    { name: 'Car Wash',        emoji: '🚗', pal: '#4fb6e8', managed: true,  foot: [3, 2] },
    stockmogul: { name: 'Stock Mogul',     emoji: '📈', pal: '#37c98c', managed: true,  foot: [2, 2] },
    pizza:      { name: 'Pizza Shop',      emoji: '🍕', pal: '#e8574f', managed: true,  foot: [2, 2] },
    gym:        { name: 'Gym',             emoji: '🏋️', pal: '#a76ee8', managed: false, foot: [3, 2] },
    cinema:     { name: 'Movie Theater',   emoji: '🎬', pal: '#e8b23c', managed: false, foot: [3, 3] },
    startup:    { name: 'Tech Startup',    emoji: '💡', pal: '#5f7cf0', managed: false, foot: [2, 2] },
    bank:       { name: 'Bank',            emoji: '🏦', pal: '#d8cdb4', managed: false, foot: [3, 3] },
    space:      { name: 'Space Agency',    emoji: '🚀', pal: '#c2ccd8', managed: false, foot: [3, 3] }
  };
  const BIZ_ORDER = Object.keys(BIZ);
  // Some old records carry these; render as generic buildings if seen.
  const LEGACY_TYPES = { library: { name: 'Library', emoji: '📚', pal: '#c9a06a', foot: [2, 2] }, arcade: { name: 'Arcade', emoji: '🎮', pal: '#e86ab0', foot: [2, 2] } };

  const DECOR = {
    tree:     { name: 'Tree',      emoji: '🌳' },
    pine:     { name: 'Pine',      emoji: '🌲' },
    bush:     { name: 'Bush',      emoji: '🌿' },
    flowers:  { name: 'Flowers',   emoji: '🌸' },
    fountain: { name: 'Fountain',  emoji: '⛲' },
    lamp:     { name: 'Lamp',      emoji: '💡' },
    bench:    { name: 'Bench',     emoji: '🪑' }
  };

  function bizMeta(type) { return BIZ[type] || LEGACY_TYPES[type] || { name: type, emoji: '🏢', pal: '#9aa8b5', foot: [2, 2] }; }
  function artTier(level) { return level >= 100 ? 3 : level >= 25 ? 2 : 1; }
  function nextMilestone(level) { return level >= 100 ? null : level >= 25 ? 100 : 25; }
  function prevMilestone(level) { return level >= 100 ? 100 : level >= 25 ? 25 : 0; }

  // ── Formatting ─────────────────────────────────────────────────────────────
  const SUFFIX = ['', 'K', 'M', 'B', 'T', 'q', 'Q'];
  function fmt(n) {
    n = Number(n) || 0;
    if (Math.abs(n) < 1000) return String(Math.round(n));
    let tier = Math.min(SUFFIX.length - 1, Math.floor(Math.log10(Math.abs(n)) / 3));
    const v = n / Math.pow(1000, tier);
    return (v >= 100 ? v.toFixed(0) : v.toFixed(1)) + SUFFIX[tier];
  }

  // ── State ──────────────────────────────────────────────────────────────────
  let currentUser = null;
  let players = [];        // /api/city players
  let overview = null;     // /api/tycoon/overview for logged-in user
  let managersData = null; // {managers, catalog} from /api/tycoon/managers
  let demoMode = false;
  const demoHired = {};    // demo-mode manager state

  async function checkAuth() {
    const url = new URL(window.location.href);
    const authToken = url.searchParams.get('auth_token') || url.searchParams.get('auth');
    const ssoChecked = url.searchParams.get('sso_checked') === '1';
    if (authToken) {
      try {
        const r = await fetch('/api/auth/exchange?token=' + encodeURIComponent(authToken), { credentials: 'include' });
        if (r.ok) {
          url.searchParams.delete('auth_token'); url.searchParams.delete('auth'); url.searchParams.delete('sso_checked');
          window.history.replaceState({}, '', url.pathname);
        }
      } catch (e) {}
    }
    try {
      const r = await fetch('/api/me/session', { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        if (data.ok && data.user) { currentUser = data.user; return true; }
      }
    } catch (e) {}
    if (!ssoChecked && !authToken && !/^(localhost|127\.)/.test(window.location.hostname)) {
      const sep = window.location.search ? '&' : '?';
      const returnUrl = encodeURIComponent(window.location.origin + window.location.pathname + sep + 'sso_checked=1');
      window.location.href = SSO_BRIDGE_URL + '?returnTo=' + returnUrl;
      return false;
    }
    return false;
  }

  async function fetchCity() {
    try {
      const r = await fetch('/api/city', { credentials: 'include' });
      if (!r.ok) throw new Error('city ' + r.status);
      const data = await r.json();
      if (data.ok && Array.isArray(data.players) && data.players.length) {
        players = data.players;
        return players;
      }
      throw new Error('empty city');
    } catch (e) {
      console.warn('[TyData] city fetch failed — demo mode:', e.message);
      demoMode = true;
      players = demoPlayers();
      return players;
    }
  }

  async function fetchOverview() {
    if (demoMode) { overview = demoOverview(); return overview; }
    if (!currentUser) return null;
    try {
      const r = await fetch('/api/tycoon/overview', { credentials: 'include' });
      if (r.ok) { const d = await r.json(); if (d.ok !== false) { overview = d; return d; } }
    } catch (e) {}
    return null;
  }

  /** Full business detail: {business, supported, summary, payload} — payload.availableUpgrades
   *  is the upgrade catalog {key: {name, emoji, desc, cost, currentLevel, maxLevel, maxed, maxBuy}} */
  async function fetchBizDetail(type) {
    if (demoMode) return demoDetail(type);
    try {
      const r = await fetch(`/api/tycoon/${type}`, { credentials: 'include' });
      if (r.ok) { const d = await r.json(); if (d.ok !== false) return d; }
    } catch (e) {}
    return null;
  }

  async function fetchManagers() {
    if (demoMode) { managersData = demoManagers(); return managersData; }
    if (!currentUser) return null;
    try {
      const r = await fetch('/api/tycoon/managers', { credentials: 'include' });
      if (r.ok) { const d = await r.json(); if (d.ok !== false) { managersData = d; return d; } }
    } catch (e) {}
    return null;
  }

  async function hireManager(type) {
    if (demoMode) { demoHired[type] = true; managersData = demoManagers(); return Promise.resolve({ ok: true, message: 'Manager hired!' }); }
    try {
      const r = await fetch('/api/tycoon/managers/hire', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessType: type })
      });
      return await r.json();
    } catch (e) { return { ok: false, error: 'Server unreachable' }; }
  }

  async function bizAction(type, action, body) {
    if (demoMode) return demoAction(type, action);
    try {
      const r = await fetch(`/api/tycoon/${type}/${action}`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {})
      });
      return await r.json();
    } catch (e) { return { ok: false, error: 'Server unreachable' }; }
  }

  async function buyBusiness(type) {
    if (demoMode) return demoAction(type, 'buy');
    try {
      const r = await fetch('/api/tycoon/businesses/buy', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessType: type })
      });
      return await r.json();
    } catch (e) { return { ok: false, error: 'Server unreachable' }; }
  }

  async function saveLayout(layout, decorations) {
    if (demoMode) return { ok: true };
    try {
      const r = await fetch('/api/me/prefs', {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city_layout: JSON.stringify(layout),
          city_decorations: JSON.stringify(decorations)
        })
      });
      return await r.json();
    } catch (e) { return { ok: false, error: 'Server unreachable' }; }
  }

  function getLoginUrl() {
    const returnTo = encodeURIComponent(window.location.href);
    return 'https://wordtycoon.live/auth/discord?returnTo=' + returnTo;
  }

  // ── Demo data ──────────────────────────────────────────────────────────────
  // Deterministic-ish demo city so local dev shows a full skyline.
  function demoPlayers() {
    const names = ['Jorry', 'DayU', 'BlockMaster', 'WordNinja', 'PuzzleKing', 'SpellCaster', 'GridWalker',
      'TycoonBoss', 'CoinLord', 'WordSmith', 'PixelPro', 'BeeKeeper', 'SearchPro', 'TangleKing',
      'RocketMan', 'BankRoller', 'PizzaChef', 'GymRat', 'MovieBuff', 'CodeWiz', 'StarGazer', 'NightOwl'];
    const out = [];
    // player 0 = "me" in demo — a showcase empire hitting all three art tiers
    const showcase = [12, 30, 130, 55, 8, 210, 42, 105, 68];
    for (let i = 0; i < 22; i++) {
      const seed = ((i + 1) * 2654435761) >>> 0;
      const bizCount = i === 0 ? 9 : 1 + (seed % 9);
      const businesses = [];
      for (let j = 0; j < bizCount; j++) {
        const level = i === 0 ? showcase[j] : 1 + (((seed >>> (j + 3)) >>> 0) % 140);
        businesses.push({ type: BIZ_ORDER[j], level });
      }
      const hue = seed % 360;
      out.push({
        displayName: names[i % names.length],
        profilePic: null,
        coins: (seed % 9000000) + 5000,
        incomePerSecond: (seed % 40000) + 20,
        businesses,
        equippedCosmetics: { name_color: { color: `hsl(${hue}, 70%, 60%)` } },
        cityPrefs: {}
      });
    }
    return out;
  }

  function demoOverview() {
    const me = players[0];
    return {
      ok: true,
      coins: me.coins,
      totalIncomePerSecond: me.incomePerSecond,
      businesses: BIZ_ORDER.map((type) => {
        const owned = me.businesses.find(b => b.type === type);
        return {
          businessType: type, name: bizMeta(type).name,
          owned: !!owned, supported: BIZ[type]?.managed || false,
          level: owned ? owned.level : 0, prestigeLevel: 0,
          incomePerSecond: owned ? owned.level * 12 : 0, incomeLabel: 'XP/sec',
          status: owned ? 'owned' : 'locked'
        };
      })
    };
  }

  function demoDetail(type) {
    const me = players[0];
    const owned = me.businesses.find(b => b.type === type);
    const lv = owned ? owned.level : 0;
    const mk = (name, emoji, desc, base, cur) => ({
      name, emoji, desc,
      cost: Math.round(base * Math.pow(1.14, cur)),
      currentLevel: cur, maxLevel: 200, maxed: cur >= 200,
      maxBuy: { levels: Math.min(10, 200 - cur) },
      effectPreview: { current: `${cur * 12}/s`, next: `${(cur + 1) * 12}/s` }
    });
    return Promise.resolve({
      ok: true, supported: !!BIZ[type]?.managed,
      business: { businessType: type, owned: !!owned, level: lv, prestigeLevel: 0, incomePerSecond: lv * 12 },
      summary: { readyToCollect: owned ? lv * 40 : 0 },
      payload: owned ? {
        availableUpgrades: {
          level: mk('Expand ' + bizMeta(type).name, bizMeta(type).emoji, 'Grow the core business', 120, lv),
          staff: mk('Hire Staff', '👷', 'Speed up production', 60, Math.floor(lv / 2)),
          marketing: mk('Marketing', '📣', 'Attract more customers', 300, Math.floor(lv / 4))
        }
      } : null
    });
  }

  function demoManagers() {
    const NAMES = { newspaper: 'Route Supervisor', carwash: 'Shift Lead', pizza: 'Head Chef', stockmogul: 'Fund Manager', gym: 'Head Trainer', cinema: 'Theater Director' };
    const COSTS = { newspaper: 100000, carwash: 500000, pizza: 1000000, stockmogul: 2000000, gym: 5000000, cinema: 20000000 };
    const managers = {}, catalog = {};
    Object.keys(NAMES).forEach(t => {
      if (demoHired[t]) managers[t] = { hired: true };
      catalog[t] = { name: NAMES[t], emoji: bizMeta(t).emoji, cost: COSTS[t], hired: !!demoHired[t] };
    });
    return { ok: true, managers, catalog };
  }

  function demoAction(type, action) {
    const me = players[0];
    const b = me.businesses.find(x => x.type === type);
    if (action === 'buy' && !b) { me.businesses.push({ type, level: 1 }); overview = demoOverview(); return Promise.resolve({ ok: true }); }
    if (b && (action === 'upgrade')) b.level += 1;
    if (b && (action === 'upgrade-max')) b.level += 10;
    if (action === 'collect') me.coins += 1000; // demo only
    overview = demoOverview();
    return Promise.resolve({ ok: true, demo: true });
  }

  window.TyData = {
    BIZ, BIZ_ORDER, DECOR, bizMeta, artTier, nextMilestone, prevMilestone, fmt,
    checkAuth, fetchCity, fetchOverview, fetchBizDetail, fetchManagers, hireManager, bizAction, buyBusiness, saveLayout, getLoginUrl,
    getCurrentUser: () => currentUser,
    getPlayers: () => players,
    getOverview: () => overview,
    getManagersData: () => managersData,
    isDemo: () => demoMode
  };
})();
