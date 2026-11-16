/**
 * city-data.js — API fetching, auth, and data management
 * Exports: window.CityData
 */
(function () {
  'use strict';

  const SSO_BRIDGE_URL = 'https://wordtycoon.live/api/auth/sso-check';
  let currentUser = null;  // logged-in user's profile
  let cityPlayers = [];    // all players from /api/city
  let lastFetchTime = 0;

  /**
   * Check auth state — exchange token or check session
   */
  async function checkAuth() {
    const url = new URL(window.location.href);
    const authToken = url.searchParams.get('auth_token') || url.searchParams.get('auth');
    const ssoChecked = url.searchParams.get('sso_checked') === '1';

    if (authToken) {
      // Exchange token for session
      try {
        const r = await fetch('/api/auth/exchange?token=' + encodeURIComponent(authToken), {
          credentials: 'include'
        });
        if (r.ok) {
          // Clean URL
          url.searchParams.delete('auth_token');
          url.searchParams.delete('auth');
          url.searchParams.delete('sso_checked');
          window.history.replaceState({}, '', url.pathname);
        }
      } catch (e) {
        console.warn('[CityData] Token exchange failed:', e.message);
      }
    }

    // Check session
    try {
      const r = await fetch('/api/me/session', { credentials: 'include' });
      if (r.ok) {
        const data = await r.json();
        if (data.ok && data.user) {
          currentUser = data.user;
          return true;
        }
      }
    } catch (e) {}

    // Not logged in — try SSO bridge if not already checked
    // Only redirect once; skip if already checked or on localhost dev
    if (!ssoChecked && !authToken && !window.location.hostname.startsWith('localhost')) {
      const sep = window.location.search ? '&' : '?';
      const returnUrl = encodeURIComponent(window.location.origin + window.location.pathname + sep + 'sso_checked=1');
      window.location.href = SSO_BRIDGE_URL + '?returnTo=' + returnUrl;
      return false; // will redirect
    }

    return false;
  }

  /**
   * Fetch city data (all players with buildings)
   */
  async function fetchCityData() {
    try {
      const r = await fetch('/api/city', { credentials: 'include' });
      if (!r.ok) throw new Error('City data fetch failed: ' + r.status);
      const data = await r.json();
      if (data.ok && data.players) {
        cityPlayers = data.players;
        lastFetchTime = Date.now();
      }
      return data;
    } catch (e) {
      console.error('[CityData] Fetch failed:', e.message);
      // Return demo data for development
      return generateDemoData();
    }
  }

  /**
   * Fetch own profile (for business management)
   */
  async function fetchMyProfile() {
    if (!currentUser) return null;
    try {
      const r = await fetch('/api/tycoon/overview', { credentials: 'include' });
      if (r.ok) return r.json();
    } catch (e) {}
    return null;
  }

  /**
   * Generate demo data for development/when API isn't available
   */
  function generateDemoData() {
    const bizTypes = ['library', 'newspaper', 'carwash', 'stockmogul', 'pizza', 'arcade', 'gym', 'cinema', 'startup', 'bank', 'space'];
    const names = ['Jorry', 'DayU', 'BlockMaster', 'WordNinja', 'PuzzleKing', 'MineDigger', 'SpellCaster', 'GridWalker',
                   'TycoonBoss', 'CoinLord', 'WordSmith', 'PixelPro', 'BeeKeeper', 'SearchPro', 'TangleKing',
                   'RocketMan', 'BankRoller', 'PizzaChef', 'GymRat', 'MovieBuff', 'CodeWiz', 'StarGazer'];
    const games = ['wordle', 'searchle', 'rectangled', 'wordmine', 'spellingbee'];
    const players = [];

    for (let i = 0; i < 40; i++) {
      const bizCount = Math.min(bizTypes.length, Math.floor(Math.random() * 6) + 1);
      const businesses = [];
      const shuffled = [...bizTypes].sort(() => Math.random() - 0.5);
      for (let j = 0; j < bizCount; j++) {
        const type = shuffled[j];
        const maxLv = CityBuildings.TYPES[type]?.maxLv || 100;
        businesses.push({
          type,
          level: Math.floor(Math.random() * maxLv) + 1
        });
      }

      const hue = Math.floor(Math.random() * 360);
      players.push({
        displayName: names[i % names.length] + (i >= names.length ? i : ''),
        profilePic: null,
        coins: Math.floor(Math.random() * 10000000),
        incomePerSecond: Math.floor(Math.random() * 50000),
        businesses,
        equippedCosmetics: {
          name_color: { color: `hsl(${hue}, 70%, 65%)` },
          word_color: { color: `hsl(${(hue + 60) % 360}, 60%, 50%)` },
        },
        favoriteGame: games[Math.floor(Math.random() * games.length)],
        cityPrefs: {},
      });
    }

    return { ok: true, players, timestamp: Date.now() };
  }

  /** Get login URL for the login button */
  function getLoginUrl() {
    const returnTo = encodeURIComponent(window.location.href);
    return 'https://wordtycoon.live/auth/discord?returnTo=' + returnTo;
  }

  window.CityData = {
    checkAuth, fetchCityData, fetchMyProfile, generateDemoData, getLoginUrl,
    getCurrentUser: () => currentUser,
    getPlayers: () => cityPlayers,
  };
})();
