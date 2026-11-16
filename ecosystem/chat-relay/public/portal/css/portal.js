// ===== Word Tycoon User Portal =====

const RARITY_COLORS = {
  common: '#9d9d9d',
  uncommon: '#4fc34f',
  rare: '#4a9eff',
  epic: '#b44aff',
  legendary: '#ffab00',
  ultra: '#ff4444',
  aux: '#00ffcc'
};

const CATEGORY_LABELS = {
  word_color: 'Word Color',
  word_glow: 'Word Glow',
  profile_border: 'Border',
  profile_glow: 'Glow',
  name_glow: 'Name Glow',
  name_color: 'Name Color',
  title: 'Title',
  win_effect: 'Win Effect',
  hero_badge: 'Hero Badge'
};

const PLATFORM_ICONS = {
  tiktok: '🎵',
  youtube: '📺',
  twitch: '🟣',
  discord: '💬',
  github: '🐙'
};

const BUSINESS_DATA = {
  library:   { name: 'Library',         emoji: '📚' },
  newspaper: { name: 'Newspaper Route', emoji: '📰' },
  carwash:   { name: 'Car Wash',       emoji: '🚗' },
  pizza:     { name: 'Pizza Shop',      emoji: '🍕' },
  arcade:    { name: 'Arcade',          emoji: '🎮' },
  gym:       { name: 'Gym',             emoji: '🏋️' },
  cinema:    { name: 'Movie Theater',   emoji: '🎬' },
  startup:   { name: 'Tech Startup',    emoji: '💻' },
  bank:      { name: 'Bank',            emoji: '🏦' },
  space:     { name: 'Space Agency',    emoji: '🚀' }
};

const BUSINESS_CONFIG = {
  library:   { baseCost: 0,           baseUpgradeCost: 0,           baseIncome: 10,      cycleSeconds: 1,  costMultiplier: 1,    wordUpgrade: true },
  newspaper: { baseCost: 5000,        baseUpgradeCost: 5000,        baseIncome: 5,       cycleSeconds: 3,  costMultiplier: 1.15 },
  carwash:   { baseCost: 100000,      baseUpgradeCost: 100000,      baseIncome: 25,      cycleSeconds: 6,  costMultiplier: 1.15 },
  pizza:     { baseCost: 2000000,     baseUpgradeCost: 2000000,     baseIncome: 50,      cycleSeconds: 5,  costMultiplier: 1.15 },
  arcade:    { baseCost: 50000000,    baseUpgradeCost: 50000000,    baseIncome: 200,     cycleSeconds: 8,  costMultiplier: 1.15 },
  gym:       { baseCost: 250000000,   baseUpgradeCost: 250000000,   baseIncome: 1000,    cycleSeconds: 10, costMultiplier: 1.15 },
  cinema:    { baseCost: 1000000000,  baseUpgradeCost: 1000000000,  baseIncome: 5000,    cycleSeconds: 12, costMultiplier: 1.15 },
  startup:   { baseCost: 3000000000,  baseUpgradeCost: 3000000000,  baseIncome: 25000,   cycleSeconds: 15, costMultiplier: 1.15 },
  bank:      { baseCost: 6000000000,  baseUpgradeCost: 6000000000,  baseIncome: 150000,  cycleSeconds: 20, costMultiplier: 1.15 },
  space:     { baseCost: 10000000000, baseUpgradeCost: 10000000000, baseIncome: 1000000, cycleSeconds: 25, costMultiplier: 1.15 }
};

var GAME_LABELS = {
  'betwixt-sp': 'Betwixt', 'betwixt': 'Betwixt', 'betweenly': 'Betwixt',
  'word500-sp': 'Word5000', 'word500': 'Word5000', 'word5000': 'Word5000',
  'wordle-sp': 'Wordle', 'wordle': 'Wordle',
  'figural-sp': 'Figural', 'figural': 'Figural',
  'pixeletters-sp': 'PixeLetters', 'pixeletters': 'PixeLetters',
  'spellingbee-sp': 'Spelling Bee', 'spellingbee': 'Spelling Bee', 'spelling-bee': 'Spelling Bee',
  'squaredle-sp': 'recTangled', 'squaredle': 'recTangled', 'rectangled': 'recTangled',
  'searchle-sp': 'Subtextle', 'searchle': 'Subtextle', 'subtextle': 'Subtextle',
  'unwordle-sp': 'UnWordle', 'unwordle': 'UnWordle',
  'erectangled': 'erecTangled', 'sproutle': 'erecTangled',
  'colour500': 'Color500', 'color500': 'Color500',
  'wikicontexto': 'WikiContexto', 'wikisearchle': 'WikiContexto',
  'wikirectangled': 'WikirecTangled',
  'triangled': 'Triangled', 'junkdrawer': 'Junk Drawer', 'synapse': 'Synapse'
};

const PLATFORM_COLORS = {
  tiktok: '#fe2c55',
  youtube: '#ff0000',
  twitch: '#9146ff',
  discord: '#5865F2',
  github: '#333333'
};

// Display priority order for choosing default platform identity
const DISPLAY_PRIORITY = ['discord', 'tiktok', 'youtube', 'github'];

const GAMES = [
  { id: 'subtextle',   name: 'Subtextle',    img: '/portal/img/game-subtextle.png',   color: '#4a9eff', spUrl: '/game/subtextle/sp.html', mpUrl: '/game/subtextle/', weeklyKey: 'subtextle_sp_weekly', statsKey: 'subtextle' },
  { id: 'word500',     name: 'Word5000',     img: '/portal/img/game-word500.png',     color: '#4fc34f', spUrl: '/game/word500/?mode=solo', mpUrl: '/game/word500/?mode=mp', dailyKey: 'word500_sp_daily_date', statsKey: 'word500' },
  { id: 'colour500',   name: 'Color500',     img: '/portal/img/game-colour500.svg',   color: '#4ade80', spUrl: '/game/colour500/solo', mpUrl: '/game/colour500/', dailyKey: 'colour500_sp_daily_date' },
  { id: 'wordle',      name: 'Wordle',       img: '/portal/img/game-wordle.png',      color: '#6aaa64', spUrl: '/wordle/solo/',      mpUrl: '/wordle/online/',  dailyKey: 'wordle_sp_daily_date',      statsKey: 'wordle' },
  { id: 'betwixt',     name: 'Betwixt',      img: '/portal/img/game-betwixt.png',     color: '#7b68ee', spUrl: '/game/betwixt/play', mpUrl: '/betwixt/online/', dailyKey: 'betwixt_sp_daily_date',   statsKey: 'betwixt' },
  { id: 'pixeletters', name: 'PixeLetters',  img: '/portal/img/game-pixeletters.png', color: '#ff6b9d', spUrl: '/pixeletters/solo/', mpUrl: '/pixeletters/online/', dailyKey: 'pixeletters_sp_daily_date', statsKey: 'pixeletters' },
  { id: 'spellingbee', name: 'Spelling Bee', img: '/portal/img/game-spellingbee.png', color: '#ffab00', spUrl: '/spellingbee/solo/', mpUrl: '/spellingbee/online/', weeklyKey: 'spellingbee_sp_weekly', statsKey: 'spellingbee' },
  { id: 'rectangled',  name: 'recTangled',   img: '/portal/img/game-rectangled.png',  color: '#22d3ee', spUrl: '/game/rectangled/mobile-sp.html', mpUrl: '/game/rectangled/mobile.html', dailyKey: 'rectangled_sp_daily_date', weeklyKey: 'rectangled_sp_weekly', statsKey: 'rectangled' },
  { id: 'erectangled', name: 'erecTangled',  img: '/portal/img/game-erectangled.png', color: '#44bb88', spUrl: '/game/erectangled/sp.html', mpUrl: '/game/erectangled/mp.html', dailyKey: 'erectangled_sp_daily_date', weeklyKey: 'erectangled_sp_weekly', statsKey: 'erectangled' },
  { id: 'figural',     name: 'Figural',      img: '/portal/img/game-figural.png',     color: '#00e5ff', spUrl: '/game/figural/sp.html', mpUrl: '/figural/online/',  dailyKey: 'figural_sp_daily_date',     statsKey: 'figural' },
  { id: 'unwordle',    name: 'UnWordle',     img: '/portal/img/game-unwordle.png',    color: '#ff6b6b', spUrl: '/game/unwordle/sp.html', mpUrl: '',                  dailyKey: 'unwordle_sp_daily_date',    statsKey: 'unwordle' },
  { id: 'triangled',   name: 'Triangled',    img: '/portal/img/game-triangled.png',   color: '#222222', spUrl: '/game/triangled/',   mpUrl: '',                  dailyKey: 'triangled_sp_daily_date',   statsKey: 'triangled' },
  { id: 'wikicontexto', name: 'WikiContexto', img: '/portal/img/game-wikisearchle.png', color: '#8a5cf7', spUrl: '/game/wikisearchle/solo/', mpUrl: '/game/wikisearchle/', weeklyKey: 'wikicontexto_sp_weekly', statsKey: 'wikicontexto' },
  { id: 'wikirectangled', name: 'WikirecTangled', img: '/portal/img/game-wikirectangled.png', color: '#ee7a2c', spUrl: '/game/wikirectangled/solo', mpUrl: '/game/wikirectangled/', statsKey: 'wikirectangled' },
  { id: 'junkdrawer',  name: 'Junk Drawer',  img: '/portal/img/game-junkdrawer.png',  color: '#f5a623', spUrl: 'https://junkdrawer.live', mpUrl: '' },
  { id: 'synapse',     name: 'Synapse',      img: '/portal/img/game-synapse.png',     color: '#8b5cf6', spUrl: '/synapse',           mpUrl: '/synapse/mp' },
];

// Toast notification helper
function showToast(message, type = 'info', duration = 4000) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', () => toast.remove());
  }, duration);
}

// State
let portalProvider = null; // 'discord' or 'github' — set from profile response
let profile = null;
let shopCatalog = [];
let shopSets = {};
let historyPage = 1;
let socket = null;
let chatMessages = [];
const MAX_CHAT = 200;

// Pre-fetch shop catalog for buff calculations
async function ensureShopCatalog() {
  if (shopCatalog.length > 0) return;
  try {
    const res = await fetch('/api/me/shop');
    const data = await res.json();
    if (Array.isArray(data)) {
      shopCatalog = data;
    } else {
      shopCatalog = [];
      Object.entries(data).forEach(([cat, items]) => {
        (items || []).forEach(item => { item.category = item.category || cat; shopCatalog.push(item); });
      });
    }
  } catch { /* will try again in loadCosmetics */ }
}

// ─── Init ───────────────────────────────────────────────────────────

// Pause intervals when tab is hidden, resume + re-sync when visible
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    // Pause intervals to save CPU
    if (dailyCountdownInterval) { clearInterval(dailyCountdownInterval); dailyCountdownInterval = null; }
    if (liveGamesInterval) { clearInterval(liveGamesInterval); liveGamesInterval = null; }
    if (pizzaCollectTimer) { clearInterval(pizzaCollectTimer); pizzaCollectTimer = null; }
  } else {
    // Resume intervals
    if (!dailyCountdownInterval) {
      updateDailyCountdown();
      dailyCountdownInterval = setInterval(updateDailyCountdown, 1000);
    }
    // Restart live games polling
    if (!liveGamesInterval) {
      loadLiveGames();
      liveGamesInterval = setInterval(loadLiveGames, 5000);
    }
    // Re-sync completions (TTL-based, handles midnight rollover)
    syncCompletionsFromServer().then(function() {
      renderDailyTracker();
      renderWeeklyTracker();
    });
  }
});

document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  setupTabs();
  setupLogout();
  setupThemeToggle();
  setupHistoryControls();
  setupCosmeticsFilter();
  setupStore();

  // Check for OAuth error or linking result in URL
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const linked = params.get('linked');
  if (error) {
    if (error === 'already_linked') {
      showToast('That account is already linked to a different user.', 'error', 5000);
    } else {
      const el = document.getElementById('login-error');
      const msgs = { denied: 'Login was cancelled.', invalid_state: 'Invalid state. Please try again.', auth_failed: 'Authentication failed. Please try again.' };
      el.textContent = msgs[error] || 'Login error. Please try again.';
    }
    history.replaceState({}, '', '/me');
  } else if (linked === 'success') {
    showToast('Account linked successfully!', 'success');
    history.replaceState({}, '', '/me');
  }
});

// ─── Session ────────────────────────────────────────────────────────

async function checkSession() {
  try {
    const res = await fetch('/api/me/session');
    const data = await res.json();
    if (data.ok) {
      showPortal(data.user);
    } else {
      showLogin();
    }
  } catch {
    showLogin();
  }
}

function showLogin() {
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('portal-screen').style.display = 'none';
}

function showPortal(user) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('portal-screen').style.display = 'block';

  // Set user info in header
  document.getElementById('user-name').textContent = user.globalName || user.username;
  const avatarEl = document.getElementById('user-avatar');
  if (user.avatar) {
    avatarEl.src = user.avatar;
    avatarEl.style.display = 'block';
  } else {
    avatarEl.style.display = 'none';
  }

  // Store for iframe auth
  portalUser = user;
  // Track provider for linking UI
  portalProvider = user.provider || (user.id && user.id.startsWith('gh_') ? 'github' : 'discord');

  // Load data
  loadProfile();
  connectChat();
  startLivePolling();
  syncCompletionsFromServer().then(function() {
    renderDailyTracker();
    renderWeeklyTracker();
    renderGamesGrid();
  });

  // Restore last active tab
  restoreTab();
}

// ─── Tabs ───────────────────────────────────────────────────────────

function switchToTab(tabId) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  var tabBtn = document.querySelector('.tab[data-tab="' + tabId + '"]');
  if (tabBtn) tabBtn.classList.add('active');
  var tabContent = document.getElementById('tab-' + tabId);
  if (tabContent) tabContent.classList.add('active');

  // Load tab data when tab becomes visible
  if (tabId === 'store') loadStore();
  if (tabId === 'wordgames') renderWordGamesBubbles();
  if (tabId === 'newspaper') loadNewspaperRoute();
  if (tabId === 'cosmetics') { markAllCosmeticsSeen(); renderCosmetics(profile?.cosmetics, document.getElementById('cosmetic-filter')?.value || 'all'); }

  // Remember active tab
  try { localStorage.setItem('portal_tab', tabId); } catch(e) {}
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      switchToTab(tab.dataset.tab);
    });
  });
}

function restoreTab() {
  try {
    var saved = localStorage.getItem('portal_tab');
    if (saved && document.getElementById('tab-' + saved)) {
      switchToTab(saved);
    }
  } catch(e) {}
}

// ─── Word Games Tab ─────────────────────────────────────────────────

var wgRendered = false;
var wgLoadedPanels = {};
var wgOpenGame = null;

// Panel HTML templates for each game — preserves all existing element IDs
var WG_PANEL_TEMPLATES = {
  searchle: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid searchle-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="searchle-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="searchle-avg">-</div></div>' +
      '</div>' +
      '<div id="searchle-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + g.mpUrl + '" target="_blank" class="play-btn">Play Searchle</a>' +
      '<h3 class="section-title" style="margin-top:1.5rem">Single Player</h3>' +
      '<div class="stats-grid searchle-sp-stats">' +
        '<div class="stat-card accent"><div class="stat-label">SP Wins</div><div class="stat-value" id="searchle-sp-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="searchle-sp-avg">-</div></div>' +
      '</div>' +
      '<div id="searchle-sp-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + g.spUrl + '" target="_blank" class="play-btn">Play Solo</a>';
  },
  word500: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid word500-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="word500-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="word500-avg">-</div></div>' +
      '</div>' +
      '<div id="word500-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + g.mpUrl + '" target="_blank" class="play-btn">Play Word 500</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid word500-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="word500sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Win Rate</div><div class="stat-value" id="word500sp-winrate">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="word500sp-avg">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best Streak</div><div class="stat-value" id="word500sp-streak">-</div></div>' +
      '</div>' +
      '<div id="word500sp-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + g.spUrl + '" target="_blank" class="play-btn">Play Word5000 Solo</a>';
  },
  betwixt: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid betwixt-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="betwixt-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="betwixt-avg">-</div></div>' +
      '</div>' +
      '<div id="betwixt-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + g.mpUrl + '" target="_blank" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid betwixt-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="betwixt-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Win Rate</div><div class="stat-value" id="betwixt-sp-winrate">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="betwixt-sp-avg">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Win Streak</div><div class="stat-value" id="betwixt-sp-streak">-</div></div>' +
      '</div>' +
      '<div id="betwixt-sp-history" class="history-list"><div class="loading-placeholder">SP stats are saved locally in your browser</div></div>' +
      '<a href="' + g.spUrl + '" target="_blank" class="play-btn">Play Solo</a>';
  },
  wordle: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid wordle-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="wordle-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="wordle-avg">-</div></div>' +
      '</div>' +
      '<div id="wordle-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + g.mpUrl + '" target="_blank" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid wordle-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="wordle-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Win Rate</div><div class="stat-value" id="wordle-sp-winrate">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="wordle-sp-avg">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Win Streak</div><div class="stat-value" id="wordle-sp-streak">-</div></div>' +
      '</div>' +
      '<div id="wordle-sp-history" class="history-list"><div class="loading-placeholder">SP stats are saved locally in your browser</div></div>' +
      '<a href="' + g.spUrl + '" target="_blank" class="play-btn">Play Solo</a>';
  },
  pixeletters: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid pixeletters-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="pixeletters-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="pixeletters-avg">-</div></div>' +
      '</div>' +
      '<div id="pixeletters-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + g.mpUrl + '" target="_blank" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid pixeletters-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="pixeletters-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Win Rate</div><div class="stat-value" id="pixeletters-sp-winrate">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="pixeletters-sp-avg">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best Streak</div><div class="stat-value" id="pixeletters-sp-streak">-</div></div>' +
      '</div>' +
      '<div id="pixeletters-sp-history" class="history-list"><div class="loading-placeholder">SP stats are saved locally in your browser</div></div>' +
      '<a href="' + g.spUrl + '" target="_blank" class="play-btn">Play Solo</a>';
  },
  spellingbee: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid spellingbee-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Words Found</div><div class="stat-value" id="spellingbee-words">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="spellingbee-games">-</div></div>' +
      '</div>' +
      '<div id="spellingbee-history" class="history-list"><div class="loading-placeholder">No Spelling Bee games yet</div></div>' +
      '<a href="' + g.mpUrl + '" target="_blank" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid spellingbee-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="spellingbee-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Completed</div><div class="stat-value" id="spellingbee-sp-completed">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Words Found</div><div class="stat-value" id="spellingbee-sp-words">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best %</div><div class="stat-value" id="spellingbee-sp-best">-</div></div>' +
      '</div>' +
      '<div id="spellingbee-sp-history" class="history-list"><div class="loading-placeholder">SP stats are saved locally in your browser</div></div>' +
      '<a href="' + g.spUrl + '" target="_blank" class="play-btn">Play Solo</a>';
  },
  squaredle: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid squaredle-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Words Found</div><div class="stat-value" id="squaredle-words">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="squaredle-games">-</div></div>' +
      '</div>' +
      '<div id="squaredle-history" class="history-list"><div class="loading-placeholder">No Squaredle games yet</div></div>' +
      '<a href="' + g.mpUrl + '" target="_blank" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid squaredle-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="squaredle-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Completed</div><div class="stat-value" id="squaredle-sp-completed">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Words Found</div><div class="stat-value" id="squaredle-sp-words">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best %</div><div class="stat-value" id="squaredle-sp-best">-</div></div>' +
      '</div>' +
      '<div id="squaredle-sp-history" class="history-list"><div class="loading-placeholder">SP stats are saved locally in your browser</div></div>' +
      '<a href="' + g.spUrl + '" target="_blank" class="play-btn">Play Solo</a>';
  },
  figural: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid figural-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="figural-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="figural-games">-</div></div>' +
      '</div>' +
      '<div id="figural-history" class="history-list"><div class="loading-placeholder">No Figural games yet</div></div>' +
      '<a href="' + g.mpUrl + '" target="_blank" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid figural-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="figural-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Win Rate</div><div class="stat-value" id="figural-sp-winrate">-</div></div>' +
      '</div>' +
      '<div id="figural-sp-history" class="history-list"><div class="loading-placeholder">SP stats are saved locally in your browser</div></div>' +
      '<a href="' + g.spUrl + '" target="_blank" class="play-btn">Play Solo</a>';
  },
  unwordle: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Single Player</h3>' +
      '<p style="color:var(--muted);font-size:0.85rem;margin-bottom:1rem">Reverse Wordle — fill in words to match the color patterns. Stats are saved locally in your browser.</p>' +
      '<div class="stats-grid unwordle-sp-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Puzzles Solved</div><div class="stat-value" id="unwordle-sp-solved">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Time</div><div class="stat-value" id="unwordle-sp-avg">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best Time</div><div class="stat-value" id="unwordle-sp-best">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Streak</div><div class="stat-value" id="unwordle-sp-streak">-</div></div>' +
      '</div>' +
      '<div id="unwordle-sp-history" class="history-list"><div class="loading-placeholder">SP stats are saved locally in your browser</div></div>' +
      '<a href="' + g.spUrl + '" target="_blank" class="play-btn">Play UnWordle</a>';
  }
};

function renderWordGamesBubbles() {
  if (wgRendered) return;
  wgRendered = true;

  var bubblesEl = document.getElementById('wg-bubbles');
  var panelsEl = document.getElementById('wg-panels');
  var bubblesHtml = '';
  var panelsHtml = '';

  GAMES.forEach(function(g) {
    bubblesHtml += '<div class="wg-bubble" data-game="' + g.id + '" style="--game-color:' + g.color + '" onclick="toggleGamePanel(\'' + g.id + '\')">' +
      '<img class="wg-bubble-img" src="' + g.img + '" alt="' + g.name + '">' +
      '<span class="wg-bubble-name">' + g.name + '</span>' +
    '</div>';

    var template = WG_PANEL_TEMPLATES[g.id];
    var panelContent = template ? template(g) : '<div class="loading-placeholder">Coming soon</div>';
    panelsHtml += '<div class="wg-panel" id="wg-panel-' + g.id + '">' + panelContent + '</div>';
  });

  bubblesEl.innerHTML = bubblesHtml;
  panelsEl.innerHTML = panelsHtml;
}

function toggleGamePanel(gameId) {
  var panel = document.getElementById('wg-panel-' + gameId);
  var bubble = document.querySelector('.wg-bubble[data-game="' + gameId + '"]');
  if (!panel || !bubble) return;

  // If already open, close it
  if (wgOpenGame === gameId) {
    panel.classList.remove('open');
    bubble.classList.remove('active');
    wgOpenGame = null;
    return;
  }

  // Close any open panel
  if (wgOpenGame) {
    var oldPanel = document.getElementById('wg-panel-' + wgOpenGame);
    var oldBubble = document.querySelector('.wg-bubble[data-game="' + wgOpenGame + '"]');
    if (oldPanel) oldPanel.classList.remove('open');
    if (oldBubble) oldBubble.classList.remove('active');
  }

  // Open new panel
  panel.classList.add('open');
  bubble.classList.add('active');
  wgOpenGame = gameId;

  // Lazy-load stats on first open
  if (!wgLoadedPanels[gameId]) {
    wgLoadedPanels[gameId] = true;
    loadGamePanelStats(gameId);
  }
}

function loadGamePanelStats(gameId) {
  switch (gameId) {
    case 'searchle': loadSearchleStats(); break;
    case 'word500': loadWord500Stats(); loadWord500SPStats(); break;
    case 'betwixt': loadBetwixtStats(); loadBetwixtSPStats(); break;
    case 'wordle': loadWordleStats(); loadWordleSPStats(); break;
    case 'pixeletters': loadPixeLettersStats(); loadPixeLettersSPStats(); break;
    case 'squaredle': loadSquaredleStats(); loadSquardeleSPStats(); break;
    case 'spellingbee': loadSpellingBeeStats(); loadSpellingBeeSPStats(); break;
    case 'figural': loadFiguralStats(); break;
    case 'unwordle': loadUnWordleStats(); break;
  }
}

async function loadFiguralStats() {
  try {
    var res = await fetch('/api/me/figural');
    var data = await res.json();
    var winsEl = document.getElementById('figural-wins');
    var gamesEl = document.getElementById('figural-games');
    if (winsEl) winsEl.textContent = data.totalWins || 0;
    if (gamesEl) gamesEl.textContent = data.gamesParticipated || data.totalGames || 0;

    var list = document.getElementById('figural-history');
    if (!data.history || data.history.length === 0) {
      if (list) list.innerHTML = '<div class="loading-placeholder">No Figural games yet</div>';
      return;
    }

    if (list) {
      list.innerHTML = data.history.map(function(w) {
        return '<div class="searchle-entry"><div>' +
          '<span class="searchle-word">' + escapeHtml(w.word || 'Game') + '</span>' +
          '<span class="searchle-guesses">' + (w.guessCount || w.wordsFound || '?') + '</span>' +
        '</div><span class="searchle-date">' + formatTime(w.timestamp) + '</span></div>';
      }).join('');
    }
  } catch {
    var winsEl2 = document.getElementById('figural-wins');
    var gamesEl2 = document.getElementById('figural-games');
    if (winsEl2) winsEl2.textContent = '0';
    if (gamesEl2) gamesEl2.textContent = '0';
  }

  // SP stats from localStorage
  try {
    var raw = localStorage.getItem('figural_sp_stats');
    var spGames = document.getElementById('figural-sp-games');
    var spWinrate = document.getElementById('figural-sp-winrate');
    if (!raw) {
      if (spGames) spGames.textContent = '0';
      if (spWinrate) spWinrate.textContent = '-';
      return;
    }
    var stats = JSON.parse(raw);
    if (spGames) spGames.textContent = stats.gamesPlayed || 0;
    if (spWinrate) spWinrate.textContent = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) + '%' : '-';
    var spHistory = document.getElementById('figural-sp-history');
    if (spHistory && stats.history && stats.history.length > 0) {
      spHistory.innerHTML = stats.history.slice(0, 10).map(function(h) {
        return '<div class="searchle-entry"><div>' +
          '<span class="searchle-word">' + escapeHtml(h.word || 'Game') + '</span>' +
          '<span class="searchle-guesses">' + (h.won ? (h.guessCount + ' guesses') : 'lost') + '</span>' +
        '</div><span class="searchle-date">' + formatTime(h.timestamp) + '</span></div>';
      }).join('');
    }
  } catch {
    // No SP stats
  }
}

function loadUnWordleStats() {
  // UnWordle is SP-only — stats from localStorage
  try {
    var raw = localStorage.getItem('unwordle_sp_stats');
    var solvedEl = document.getElementById('unwordle-sp-solved');
    var avgEl = document.getElementById('unwordle-sp-avg');
    var bestEl = document.getElementById('unwordle-sp-best');
    var streakEl = document.getElementById('unwordle-sp-streak');
    if (!raw) {
      if (solvedEl) solvedEl.textContent = '0';
      if (avgEl) avgEl.textContent = '-';
      if (bestEl) bestEl.textContent = '-';
      if (streakEl) streakEl.textContent = '0';
      return;
    }
    var stats = JSON.parse(raw);
    if (solvedEl) solvedEl.textContent = stats.solved || 0;
    if (avgEl) avgEl.textContent = stats.solved > 0
      ? formatTimeShort(Math.floor(stats.totalTime / stats.solved)) : '-';
    if (bestEl) bestEl.textContent = stats.bestTime !== null && stats.bestTime !== undefined
      ? formatTimeShort(stats.bestTime) : '-';
    if (streakEl) streakEl.textContent = stats.streak || 0;

    var historyEl = document.getElementById('unwordle-sp-history');
    if (historyEl && stats.history && stats.history.length > 0) {
      historyEl.innerHTML = stats.history.slice(0, 10).map(function(h) {
        var badges = '';
        if (h.mode === 'hard') badges += ' <span style="font-size:0.65rem;background:#ff6b6b;color:#fff;padding:1px 4px;border-radius:3px;font-weight:700">H</span>';
        if (h.daily) badges += ' <span style="font-size:0.65rem;background:#ffab00;color:#fff;padding:1px 4px;border-radius:3px;font-weight:700">D</span>';
        return '<div class="searchle-entry"><div>' +
          '<span class="searchle-word">' + escapeHtml(h.word || '???') + badges + '</span>' +
          '<span class="searchle-guesses">' + formatTimeShort(h.time) + '</span>' +
        '</div><span class="searchle-date">' + formatTime(h.timestamp) + '</span></div>';
      }).join('');
    }
  } catch {
    // No stats available
  }
}

function formatTimeShort(seconds) {
  if (seconds === null || seconds === undefined) return '-';
  var m = Math.floor(seconds / 60);
  var s = seconds % 60;
  return (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

// ─── Logout ─────────────────────────────────────────────────────────

function setupLogout() {
  document.getElementById('logout-btn').addEventListener('click', async () => {
    await fetch('/api/me/logout', { method: 'POST' });
    if (socket) socket.disconnect();
    window.location.reload();
  });
}

// ─── Theme Toggle ───────────────────────────────────────────────────

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;
  // Sync button icon with current theme
  const isLight = document.documentElement.dataset.theme === 'light';
  btn.textContent = isLight ? 'Dark' : 'Light';
  btn.addEventListener('click', () => {
    const nowLight = document.documentElement.dataset.theme === 'light';
    if (nowLight) {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem('portal-theme');
      btn.textContent = 'Light';
    } else {
      document.documentElement.dataset.theme = 'light';
      localStorage.setItem('portal-theme', 'light');
      btn.textContent = 'Dark';
    }
  });
}

// ─── Profile ────────────────────────────────────────────────────────

async function loadProfile() {
  try {
    const res = await fetch('/api/me/profile');
    const data = await res.json();

    // Track the provider from the profile response
    if (data.provider) portalProvider = data.provider;

    if (!data.ok || !data.linked) {
      const banner = document.getElementById('not-linked-banner');
      const msgEl = document.getElementById('not-linked-msg');
      const actionsEl = document.getElementById('not-linked-actions');
      banner.style.display = 'block';

      if (data.provider === 'github') {
        // GitHub user not linked to Discord
        msgEl.innerHTML = 'Link your Discord account to access your game stats, businesses, and cosmetics.';
        actionsEl.innerHTML = `<a href="/auth/discord?action=link" class="link-account-btn link-discord">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.12-.098.246-.198.373-.292a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
          Link Discord Account</a>`;
      } else {
        // Discord user not linked to stream platforms
        msgEl.innerHTML = 'Your Discord account isn\'t linked to any stream platform yet. Type <code>!link</code> in the stream chat to get started!';
        actionsEl.innerHTML = '';
      }

      // Still render what we can for unlinked GitHub users with partial profile
      if (data.profile) {
        renderOverview(data);
      } else {
        setStatPlaceholders();
      }
      return;
    }

    profile = data;
    renderOverview(data);
    // Load shop catalog first so buff calculations work in renderBusinesses
    await ensureShopCatalog();
    applyHeroCosmetics(data.cosmetics);
    applyHeaderCosmetics(data.cosmetics);
    renderBusinesses(data.businesses);
    loadCosmetics(data.cosmetics);
    loadHistory();
  } catch {
    setStatPlaceholders('Error');
  }
}

function setStatPlaceholders(val = '-') {
  ['stat-coins', 'stat-taps', 'stat-tap-power', 'stat-crit', 'stat-multitap'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
  const heroCoins = document.getElementById('ov-hero-coin-val');
  if (heroCoins) heroCoins.textContent = val;
  const heroWords = document.getElementById('ov-hero-words-val');
  if (heroWords) heroWords.textContent = val;
  document.getElementById('platforms-list').innerHTML = '<div class="loading-placeholder">No linked accounts</div>';
  document.getElementById('ov-biz-row').innerHTML = '<div class="loading-placeholder">No data available</div>';
  var gamesGrid = document.getElementById('games-grid');
  if (gamesGrid) gamesGrid.innerHTML = '';
  document.getElementById('businesses-grid').innerHTML = '<div class="loading-placeholder">No data available</div>';
  document.getElementById('cosmetics-grid').innerHTML = '<div class="loading-placeholder">No data available</div>';
  document.getElementById('history-list').innerHTML = '<div class="loading-placeholder">No data available</div>';
}

function renderOverview(data) {
  const p = data.profile;

  // ── Hero Banner ──
  const heroAvatar = document.getElementById('ov-hero-avatar');
  if (p.profilePic) {
    heroAvatar.src = p.profilePic;
    heroAvatar.style.display = 'block';
  }
  document.getElementById('ov-hero-name').textContent = p.displayName || 'Player';
  document.getElementById('ov-hero-coin-val').textContent = formatNumber(p.coins);
  document.getElementById('ov-hero-words-val').textContent = formatNumber(p.libraryWords || 0);

  // Income/sec display
  const incData = data.incomePerSecond;
  if (incData && incData.total > 0) {
    document.getElementById('ov-hero-income-val').textContent = formatIncome(incData.total);
    document.getElementById('ov-hero-income').style.display = '';
  }

  // Equipped title (text + visibility only — cosmetic styling applied by applyHeroCosmetics)
  const titleEl = document.getElementById('ov-hero-title');
  const equippedTitle = (data.cosmetics || []).find(c => c.category === 'title' && c.equipped);
  if (equippedTitle) {
    titleEl.textContent = equippedTitle.name;
    titleEl.style.display = 'block';
  } else {
    titleEl.style.display = 'none';
  }

  // Update header avatar
  if (p.profilePic) {
    const headerAv = document.getElementById('user-avatar');
    headerAv.src = p.profilePic;
    headerAv.style.display = 'block';
  }

  // ── Stat Cards ──
  document.getElementById('stat-coins').textContent = formatNumber(p.coins);
  document.getElementById('stat-taps').textContent = formatNumber(p.totalTaps);
  document.getElementById('stat-tap-power').textContent = formatNumber(p.tapPower);
  document.getElementById('stat-crit').textContent = (p.critChance * 100).toFixed(0) + '%';
  document.getElementById('stat-multitap').textContent = 'x' + p.multiTap;

  // ── Business Empire Row ──
  renderOverviewBusinesses(data.businesses);

  // ── Platforms ──
  renderOverviewPlatforms(data);

  // ── Games Grid & Daily/Weekly Trackers ──
  syncCompletionsFromServer().then(function() {
    renderDailyTracker();
    renderWeeklyTracker();
    renderGamesGrid();
  });
}

// ─── Header Cosmetics ────────────────────────────────────────────────
// Applies equipped cosmetics to the header user-info bubble (avatar + name + title)

function applyHeaderCosmetics(cosmetics) {
  const avatarEl = document.getElementById('user-avatar');
  if (!avatarEl) return;
  const avatarWrap = avatarEl.parentElement; // .user-avatar-wrap
  const nameEl = document.getElementById('user-name');
  const titleEl = document.getElementById('user-title');
  if (!avatarWrap || !nameEl || !titleEl) return;

  // Reset inline styles
  avatarWrap.style.cssText = '';
  avatarEl.style.border = '2px solid var(--border)';
  avatarEl.style.animation = '';
  nameEl.style.color = '';
  nameEl.style.textShadow = '';
  nameEl.style.animation = '';
  titleEl.style.cssText = '';
  titleEl.style.display = 'none';
  titleEl.textContent = '';

  const equipped = (cosmetics || []).filter(c => c.equipped);
  if (equipped.length === 0) return;

  // Build category → css map (same pattern as applyPreviewCosmetics)
  const cosmeticsByCategory = {};
  equipped.forEach(c => {
    let css = null;
    if (Array.isArray(shopCatalog)) {
      const shopItem = shopCatalog.find(s => s.id === c.cosmetic_id);
      if (shopItem && shopItem.css) css = shopItem.css;
    }
    // Fallback for generated (gen_) cosmetics — use DB css_property
    if (!css && c.css_property) {
      try { css = JSON.parse(c.css_property); } catch (e) {}
    }
    if (css) cosmeticsByCategory[c.category] = css;
  });

  // Apply profile_border
  const border = cosmeticsByCategory.profile_border;
  if (border) {
    if (border.border) avatarEl.style.border = border.border;
    if (border.boxShadow) avatarWrap.style.boxShadow = border.boxShadow;
    if (border.animation) avatarWrap.style.animation = border.animation;
  }

  // Apply profile_glow (combine boxShadow with border's)
  const glow = cosmeticsByCategory.profile_glow;
  if (glow) {
    if (glow.boxShadow) {
      const existing = avatarWrap.style.boxShadow;
      avatarWrap.style.boxShadow = existing ? existing + ', ' + glow.boxShadow : glow.boxShadow;
    }
    if (glow.animation && !avatarWrap.style.animation) {
      avatarWrap.style.animation = glow.animation;
    }
  }

  // Apply name_color
  const nameColor = cosmeticsByCategory.name_color;
  if (nameColor) {
    if (nameColor.color) nameEl.style.color = nameColor.color;
    if (nameColor.animation) nameEl.style.animation = nameColor.animation;
  }

  // Apply name_glow
  const nameGlow = cosmeticsByCategory.name_glow;
  if (nameGlow) {
    if (nameGlow.textShadow) nameEl.style.textShadow = nameGlow.textShadow;
    if (nameGlow.animation && !nameEl.style.animation) nameEl.style.animation = nameGlow.animation;
  }

  // Apply title
  const titleCos = cosmeticsByCategory.title;
  if (titleCos) {
    titleEl.textContent = titleCos.title || '';
    titleEl.style.display = titleCos.title ? 'block' : 'none';
    if (titleCos.titleColor) titleEl.style.color = titleCos.titleColor;
    if (titleCos.titleGlow) titleEl.style.textShadow = titleCos.titleGlow;
    if (titleCos.animation) titleEl.style.animation = titleCos.animation;
  }
}

// ─── Hero Cosmetics ─────────────────────────────────────────────────
// Applies equipped cosmetics to the hero profile card (avatar, name, title)

function applyHeroCosmetics(cosmetics) {
  const avatarWrap = document.querySelector('.ov-hero-avatar-wrap');
  const nameEl = document.getElementById('ov-hero-name');
  const titleEl = document.getElementById('ov-hero-title');
  if (!avatarWrap || !nameEl || !titleEl) return;

  // Reset inline styles (preserve avatar wrap's base sizing)
  avatarWrap.style.boxShadow = '';
  avatarWrap.style.animation = '';
  nameEl.style.color = '';
  nameEl.style.textShadow = '';
  nameEl.style.animation = '';

  const equipped = (cosmetics || []).filter(c => c.equipped);
  if (equipped.length === 0) return;

  // Build category → css map (same pattern as applyHeaderCosmetics)
  const cosmeticsByCategory = {};
  equipped.forEach(c => {
    let css = null;
    if (Array.isArray(shopCatalog)) {
      const shopItem = shopCatalog.find(s => s.id === c.cosmetic_id);
      if (shopItem && shopItem.css) css = shopItem.css;
    }
    if (!css && c.css_property) {
      try { css = JSON.parse(c.css_property); } catch (e) {}
    }
    if (css) cosmeticsByCategory[c.category] = css;
  });

  // Apply profile_border (hero uses border on the wrap, not the img)
  const border = cosmeticsByCategory.profile_border;
  if (border) {
    if (border.border) avatarWrap.style.border = border.border;
    if (border.boxShadow) avatarWrap.style.boxShadow = border.boxShadow;
    if (border.animation) avatarWrap.style.animation = border.animation;
  }

  // Apply profile_glow (combine boxShadow with border's)
  const glow = cosmeticsByCategory.profile_glow;
  if (glow) {
    if (glow.boxShadow) {
      const existing = avatarWrap.style.boxShadow;
      avatarWrap.style.boxShadow = existing ? existing + ', ' + glow.boxShadow : glow.boxShadow;
    }
    if (glow.animation && !avatarWrap.style.animation) {
      avatarWrap.style.animation = glow.animation;
    }
  }

  // Apply name_color
  const nameColor = cosmeticsByCategory.name_color;
  if (nameColor) {
    if (nameColor.color) nameEl.style.color = nameColor.color;
    if (nameColor.animation) nameEl.style.animation = nameColor.animation;
  }

  // Apply name_glow
  const nameGlow = cosmeticsByCategory.name_glow;
  if (nameGlow) {
    if (nameGlow.textShadow) nameEl.style.textShadow = nameGlow.textShadow;
    if (nameGlow.animation && !nameEl.style.animation) nameEl.style.animation = nameGlow.animation;
  }

  // Apply hero_badge (background on .ov-hero-bg)
  const heroBg = document.querySelector('.ov-hero-bg');
  const badge = cosmeticsByCategory.hero_badge;
  if (heroBg) {
    if (badge) {
      if (badge.background) heroBg.style.background = badge.background;
      if (badge.backgroundSize) heroBg.style.backgroundSize = badge.backgroundSize;
      if (badge.animation) heroBg.style.animation = badge.animation;
    } else {
      heroBg.style.background = '';
      heroBg.style.backgroundSize = '';
      heroBg.style.animation = '';
    }
  }

  // Apply title (text + cosmetic styling)
  const equippedTitle = equipped.find(c => c.category === 'title');
  titleEl.style.color = '';
  titleEl.style.textShadow = '';
  titleEl.style.animation = '';
  if (equippedTitle) {
    titleEl.textContent = equippedTitle.name;
    titleEl.style.display = 'block';
    const titleCos = cosmeticsByCategory.title;
    if (titleCos) {
      if (titleCos.titleColor) titleEl.style.color = titleCos.titleColor;
      if (titleCos.titleGlow) titleEl.style.textShadow = titleCos.titleGlow;
      if (titleCos.animation) titleEl.style.animation = titleCos.animation;
    }
  } else {
    titleEl.style.display = 'none';
    titleEl.textContent = '';
  }
}

function renderOverviewBusinesses(businesses) {
  const row = document.getElementById('ov-biz-row');
  const owned = {};
  (businesses || []).forEach(b => { owned[b.business_type] = b; });

  const types = Object.keys(BUSINESS_DATA);
  row.innerHTML = types.map(type => {
    const biz = BUSINESS_DATA[type];
    const ob = owned[type];
    if (ob) {
      return `<div class="ov-biz-chip ov-biz-owned"><span class="ov-biz-emoji">${biz.emoji}</span><span class="ov-biz-info"><span class="ov-biz-name">${biz.name}</span><span class="ov-biz-level">Lvl ${ob.level}</span></span></div>`;
    }
    return `<div class="ov-biz-chip ov-biz-locked"><span class="ov-biz-emoji">${biz.emoji}</span><span class="ov-biz-info"><span class="ov-biz-name">${biz.name}</span><span class="ov-biz-level">Locked</span></span></div>`;
  }).join('');
}

function renderOverviewPlatforms(data) {
  const p = data.profile;
  const list = document.getElementById('platforms-list');
  if (!p.platforms || p.platforms.length === 0) {
    list.innerHTML = '<div class="loading-placeholder">No linked platforms</div>';
    return;
  }

  const oldChooser = document.querySelector('.pfp-chooser');
  if (oldChooser) oldChooser.remove();

  // Determine which platforms are linked
  const hasGithub = p.platforms.some(pl => pl.platform === 'github');
  const hasDiscord = p.platforms.some(pl => pl.platform === 'discord');

  list.innerHTML = p.platforms.map(pl => {
    const color = PLATFORM_COLORS[pl.platform] || 'var(--accent)';
    // Show unlink button only for non-primary platforms (don't let users unlink their anchor)
    // Discord is the anchor — only show unlink on non-discord platforms
    const canUnlink = pl.platform !== 'discord' && pl.platformUserId;
    const unlinkHtml = canUnlink
      ? `<button class="unlink-btn" data-platform="${pl.platform}" data-platform-id="${escapeHtml(pl.platformUserId)}" title="Unlink ${capitalize(pl.platform)}">✕</button>`
      : '';
    return `<div class="ov-platform-card" style="--plat-color:${color}">
      ${unlinkHtml}
      <span class="ov-plat-icon">${PLATFORM_ICONS[pl.platform] || '🔗'}</span>
      <span class="ov-plat-info">
        <span class="ov-plat-name">${capitalize(pl.platform)}</span>
        <span class="ov-plat-user">${escapeHtml(pl.displayName || pl.username || 'Linked')}</span>
      </span>
    </div>`;
  }).join('');

  // Add "Link Account" button
  if (portalProvider === 'discord' && !hasGithub) {
    list.insertAdjacentHTML('beforeend', `<a href="/auth/github?action=link" class="link-account-btn link-github">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
      Link GitHub Account</a>`);
  } else if (portalProvider === 'github' && !hasDiscord) {
    list.insertAdjacentHTML('beforeend', `<a href="/auth/discord?action=link" class="link-account-btn link-discord">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128c.12-.098.246-.198.373-.292a.074.074 0 0 1 .078-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
      Link Discord Account</a>`);
  }

  // Unlink click handlers
  list.querySelectorAll('.unlink-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const platform = btn.dataset.platform;
      const platformId = btn.dataset.platformId;
      if (!confirm(`Unlink your ${capitalize(platform)} account? Your game data will remain, but accounts will no longer be connected.`)) return;
      try {
        const r = await fetch('/api/me/unlink', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform, platformUserId: platformId })
        });
        const result = await r.json();
        if (result.ok) {
          showToast(`${capitalize(platform)} account unlinked.`, 'success');
          loadProfile();
        } else {
          showToast(result.error || 'Unlink failed.', 'error');
        }
      } catch {
        showToast('Failed to unlink account.', 'error');
      }
    });
  });

  // Preferences: profile picture & display name
  const oldPrefs = document.querySelector('.profile-prefs');
  if (oldPrefs) oldPrefs.remove();

  const pfpPlatforms = p.platforms.filter(pl => pl.profilePic);
  const namePlatforms = p.platforms.filter(pl => pl.displayName || pl.username);
  const currentPfpPref = data.preferences?.preferred_pfp_platform || '';
  const currentNamePref = data.preferences?.preferred_display_name || '';

  // Determine if current name pref matches a platform or is custom
  const nameMatchesPlatform = namePlatforms.find(pl =>
    (pl.displayName || pl.username) === currentNamePref
  );
  const isCustomName = currentNamePref && !nameMatchesPlatform;

  let prefsHtml = '<div class="profile-prefs">';

  // PFP chooser
  if (pfpPlatforms.length >= 2) {
    prefsHtml += `<div class="pref-row"><label>Profile picture:</label><select id="pfp-select">
      <option value="">Auto</option>
      ${pfpPlatforms.map(pl => `<option value="${pl.platform}" ${pl.platform === currentPfpPref ? 'selected' : ''}>${capitalize(pl.platform)}</option>`).join('')}
    </select></div>`;
  }

  // Display name chooser
  if (namePlatforms.length >= 1) {
    prefsHtml += `<div class="pref-row"><label>Display name:</label><select id="name-select">
      <option value="">Auto</option>
      ${namePlatforms.map(pl => {
        const name = pl.displayName || pl.username;
        const selected = (!isCustomName && name === currentNamePref) ? 'selected' : '';
        return `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)} (${capitalize(pl.platform)})</option>`;
      }).join('')}
      <option value="__custom__" ${isCustomName ? 'selected' : ''}>Custom...</option>
    </select>
    <input type="text" id="name-custom-input" class="name-custom-input" placeholder="Enter custom name" maxlength="32"
      value="${isCustomName ? escapeHtml(currentNamePref) : ''}"
      style="display:${isCustomName ? 'block' : 'none'}">
    </div>`;
  }

  prefsHtml += '</div>';
  list.insertAdjacentHTML('afterend', prefsHtml);

  // PFP select handler
  const pfpSelect = document.getElementById('pfp-select');
  if (pfpSelect) {
    pfpSelect.addEventListener('change', async (e) => {
      try {
        await fetch('/api/me/prefs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferred_pfp_platform: e.target.value || null })
        });
        loadProfile();
      } catch (err) {
        console.error('Failed to update PFP preference:', err);
      }
    });
  }

  // Display name select handler
  const nameSelect = document.getElementById('name-select');
  const nameInput = document.getElementById('name-custom-input');
  if (nameSelect) {
    nameSelect.addEventListener('change', async (e) => {
      const val = e.target.value;
      if (val === '__custom__') {
        nameInput.style.display = 'block';
        nameInput.focus();
        return;
      }
      nameInput.style.display = 'none';
      try {
        await fetch('/api/me/prefs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferred_display_name: val || null })
        });
        loadProfile();
      } catch (err) {
        console.error('Failed to update display name preference:', err);
      }
    });
  }

  // Custom name input handler (save on Enter or blur)
  if (nameInput) {
    const saveCustomName = async () => {
      const val = nameInput.value.trim();
      if (!val) return;
      try {
        await fetch('/api/me/prefs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferred_display_name: val })
        });
        loadProfile();
      } catch (err) {
        console.error('Failed to update display name preference:', err);
      }
    };
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveCustomName(); });
    nameInput.addEventListener('blur', saveCustomName);
  }
}

// Cache for live game data (populated by loadLiveGames)
var cachedLiveGames = [];

// ─── Cross-Device Sync: fetch completion status from server ──────────
var spSyncDone = false;
var spSyncTimestamp = 0; // when sync last ran
var SP_SYNC_TTL = 5 * 60 * 1000; // re-sync every 5 minutes (catches midnight rollover)

async function syncCompletionsFromServer() {
  // Allow re-sync if TTL expired (handles midnight date change)
  if (spSyncDone && (Date.now() - spSyncTimestamp < SP_SYNC_TTL)) return;
  try {
    var res = await fetch('/api/sp-sync');
    var data = await res.json();
    if (!data.ok) return;

    // Map server game IDs → localStorage daily keys
    var dailyMap = {
      'word500-sp':     'word500_sp_daily_date',
      'wordle-sp':      'wordle_sp_daily_date',
      'betwixt-sp':   'betwixt_sp_daily_date',
      'pixeletters-sp': 'pixeletters_sp_daily_date',
      'figural-sp':     'figural_sp_daily_date',
      'unwordle-sp':    'unwordle_sp_daily_date'
    };
    var weeklyMap = {
      'spellingbee-sp-weekly': 'spellingbee_sp_weekly',
      'squaredle-sp-weekly':   'squaredle_sp_weekly',
      'searchle-sp-weekly':    'searchle_sp_weekly'
    };

    Object.keys(dailyMap).forEach(function(serverId) {
      if (data.daily[serverId]) {
        localStorage.setItem(dailyMap[serverId], data.today);
      }
    });
    Object.keys(weeklyMap).forEach(function(serverId) {
      if (data.weekly[serverId]) {
        localStorage.setItem(weeklyMap[serverId], data.weekStart);
      }
    });
    spSyncDone = true;
    spSyncTimestamp = Date.now();
  } catch(e) {
    console.warn('[Portal] Failed to sync completions:', e);
  }
}

function getDailyStatus() {
  var today = new Date().toISOString().slice(0, 10);
  var status = {};
  GAMES.forEach(function(g) {
    if (g.dailyKey) {
      status[g.id] = localStorage.getItem(g.dailyKey) === today;
    } else {
      status[g.id] = null; // no daily for this game
    }
  });
  return status;
}

function getPlayerCounts() {
  var counts = {};
  cachedLiveGames.forEach(function(g) {
    counts[g.id] = g.playerCount || 0;
  });
  return counts;
}

function getWeekStart() {
  var d = new Date();
  var day = d.getUTCDay();
  var diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}

function getWeeklyStatus() {
  var ws = getWeekStart();
  var status = {};
  GAMES.forEach(function(g) {
    if (g.weeklyKey) {
      status[g.id] = localStorage.getItem(g.weeklyKey) === ws;
    }
  });
  return status;
}

var dailyCountdownInterval = null;

function getDailyTimeLeft() {
  var now = new Date();
  var tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  var diff = tomorrow - now;
  if (diff < 0) diff = 0;
  var h = Math.floor(diff / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  var s = Math.floor((diff % 60000) / 1000);
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function updateDailyCountdown() {
  var el = document.getElementById('daily-countdown');
  if (el) el.textContent = '\u23F1 ' + getDailyTimeLeft();
}

function renderDailyTracker() {
  var row = document.getElementById('daily-tracker-row');
  var progressEl = document.getElementById('daily-progress');
  var subtitleEl = document.getElementById('daily-tracker-subtitle');
  if (!row) return;

  if (subtitleEl) subtitleEl.textContent = 'Complete for a Loot Box \uD83C\uDF81';

  var daily = getDailyStatus();
  var completed = 0;
  var total = 0;

  row.innerHTML = GAMES.map(function(g) {
    if (!g.dailyKey) return ''; // skip games without daily
    total++;
    var done = daily[g.id];
    if (done) completed++;

    var url = done ? '#' : g.spUrl + '?mode=daily';
    var cls = 'daily-chip' + (done ? ' done' : '');

    return '<a href="' + url + '" class="' + cls + '" style="--game-color:' + g.color + '" title="' + g.name + (done ? ' \u2713 Completed' : ' - Play Daily') + '">' +
      '<img src="' + g.img + '" alt="" class="daily-chip-icon">' +
      '<span class="daily-chip-name">' + g.name + '</span>' +
      (done ? '<span class="daily-chip-reward">\uD83C\uDF81 Loot Box</span>' : '<span class="daily-chip-play">Play</span>') +
    '</a>';
  }).join('');

  if (progressEl) {
    progressEl.textContent = completed + '/' + total;
    progressEl.className = 'daily-tracker-progress' + (completed === total && total > 0 ? ' all-done' : '');
  }

  // Start countdown timer (once)
  updateDailyCountdown();
  if (!dailyCountdownInterval) {
    dailyCountdownInterval = setInterval(updateDailyCountdown, 1000);
  }
}

function renderWeeklyTracker() {
  var row = document.getElementById('weekly-tracker-row');
  var progressEl = document.getElementById('weekly-progress');
  var subtitleEl = document.getElementById('weekly-tracker-subtitle');
  if (!row) return;

  var weekly = getWeeklyStatus();
  var ws = getWeekStart();
  var completed = 0;
  var total = 0;

  // Calculate days remaining in the week
  var now = new Date();
  var dayOfWeek = now.getUTCDay();
  var daysLeft = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;

  if (subtitleEl) {
    subtitleEl.textContent = 'Complete for a Cosmetic \uD83C\uDFB0 \u2022 ' + (daysLeft > 0 ? daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' left' : 'Last day!');
  }

  row.innerHTML = GAMES.map(function(g) {
    if (!g.weeklyKey) return '';
    total++;
    var done = weekly[g.id];
    if (done) completed++;

    var url = done ? '#' : g.spUrl + '?mode=weekly';
    var cls = 'daily-chip weekly-chip' + (done ? ' done' : '');

    return '<a href="' + url + '" class="' + cls + '" style="--game-color:' + g.color + '" title="' + g.name + (done ? ' \u2713 Completed this week' : ' - Play Weekly \u2022 Earn a cosmetic!') + '">' +
      '<img src="' + g.img + '" alt="" class="daily-chip-icon">' +
      '<span class="daily-chip-name">' + g.name + '</span>' +
      (done ? '<span class="weekly-chip-reward">\uD83C\uDFB0 Cosmetic</span>' : '<span class="daily-chip-play">Play</span>') +
    '</a>';
  }).join('');

  if (progressEl) {
    progressEl.textContent = completed + '/' + total;
    progressEl.className = 'weekly-tracker-progress' + (completed === total && total > 0 ? ' all-done' : '');
  }
}

var _gamesGridPromise = null;
async function renderGamesGrid() {
  // Deduplicate concurrent calls — if already running, skip
  if (_gamesGridPromise) return _gamesGridPromise;
  _gamesGridPromise = _renderGamesGridInner();
  try { await _gamesGridPromise; } finally { _gamesGridPromise = null; }
}
async function _renderGamesGridInner() {
  var grid = document.getElementById('games-grid');
  if (!grid) return;

  // Fetch game stats (all 7 games that have server-side stats — Figural is SP-only/localStorage)
  var stats = {};
  try {
    var safeFetch = function(url) { return fetch(url).then(function(r) { return r.ok ? r.json() : null; }).catch(function() { return null; }); };
    var results = await Promise.all([
      safeFetch('/api/me/searchle'),
      safeFetch('/api/me/word500'),
      safeFetch('/api/me/betwixt'),
      safeFetch('/api/me/wordle'),
      safeFetch('/api/me/pixeletters'),
      safeFetch('/api/me/squaredle'),
      safeFetch('/api/me/spellingbee'),
    ]);
    if (results[0]) stats.searchle = results[0];
    if (results[1]) stats.word500 = results[1];
    if (results[2]) stats.betwixt = results[2];
    if (results[3]) stats.wordle = results[3];
    if (results[4]) stats.pixeletters = results[4];
    if (results[5]) stats.squaredle = results[5];
    if (results[6]) stats.spellingbee = results[6];
  } catch(e) {}

  var daily = getDailyStatus();
  var weekly = getWeeklyStatus();
  var counts = getPlayerCounts();

  // Build a map of live game data keyed by game id
  var liveMap = {};
  (cachedLiveGames || []).forEach(function(lg) {
    if (lg.status === 'active') liveMap[lg.id] = lg;
  });

  grid.innerHTML = GAMES.map(function(g) {
    var playerCount = counts[g.id] || 0;
    var dailyDone = daily[g.id];
    var weeklyDone = weekly[g.id];
    var hasDailyKey = !!g.dailyKey;
    var hasWeeklyKey = !!g.weeklyKey;
    var live = liveMap[g.id];

    // Stats — show live info if game is active, otherwise show career stats
    var statsHtml = '';
    if (live) {
      var guessLabel = (live.extra && live.extra.guessLabel) || 'guesses';
      var liveParts = [];
      liveParts.push('<span class="gc-live-val">' + live.guesses + '</span> ' + guessLabel);
      if (live.jackpot > 0) {
        liveParts.push('<span class="gc-live-coins">\uD83D\uDFE2 ' + formatNumber(live.jackpot) + '</span>');
      }
      var line2Parts = [];
      if (live.elapsed > 0) {
        line2Parts.push('\u23F1 ' + formatElapsedTime(live.elapsed));
      }
      if (live.wordLength > 0) {
        line2Parts.push(live.wordLength + ' letters');
      }
      if (live.extra && live.extra.percentage > 0) {
        line2Parts.push(Math.round(live.extra.percentage) + '%');
      }
      if (live.extra && live.extra.centerLetter) {
        line2Parts.push('\u2B21 ' + live.extra.centerLetter.toUpperCase());
      }
      statsHtml = '<div class="gc-live-info">' +
        '<div class="gc-live-row">' + liveParts.join(' ') + '</div>' +
        (line2Parts.length ? '<div class="gc-live-row gc-live-detail">' + line2Parts.join(' \u00B7 ') + '</div>' : '') +
      '</div>';
    } else {
      var s = stats[g.statsKey];
      if (s) {
        var wins = s.totalWins || 0;
        var avg = s.averageGuesses || '-';
        statsHtml = '<div class="gc-stats">' + wins + ' wins &middot; ' + avg + ' avg</div>';
      } else {
        statsHtml = '<div class="gc-stats gc-stats-dim">Not played yet</div>';
      }
    }

    // Daily or Weekly badge
    var dailyHtml = '';
    if (hasDailyKey) {
      if (dailyDone) {
        dailyHtml = '<div class="gc-daily done">DAILY <span class="gc-daily-check">\u2713</span></div>';
      } else {
        dailyHtml = '<div class="gc-daily available">DAILY</div>';
      }
    } else if (hasWeeklyKey) {
      if (weeklyDone) {
        dailyHtml = '<div class="gc-daily gc-weekly done">WEEKLY <span class="gc-daily-check">\u2713</span></div>';
      } else {
        dailyHtml = '<div class="gc-daily gc-weekly available">WEEKLY</div>';
      }
    }

    // Player count — show if live or has players
    var countHtml = '';
    if (live || playerCount > 0) {
      countHtml = '<div class="gc-players">' +
        '<span class="gc-player-dot' + (live ? ' gc-player-live' : '') + '"></span>' +
        '<span class="gc-player-count">' + playerCount + '</span>' +
      '</div>';
    }

    // Live badge
    var liveBadge = live ? '<div class="gc-live-badge">LIVE</div>' : '';

    // Mode buttons
    var modesHtml = '<div class="gc-modes">';
    if (g.spUrl) {
      modesHtml += '<a href="' + g.spUrl + '" class="gc-mode-btn gc-mode-solo">Solo</a>';
    }
    if (g.mpUrl) {
      modesHtml += '<a href="' + g.mpUrl + '" class="gc-mode-btn gc-mode-online">Online</a>';
    }
    modesHtml += '</div>';

    return '<div class="game-card' + (live ? ' gc-is-live' : '') + '" style="--game-color:' + g.color + '">' +
      '<div class="gc-top">' +
        '<img src="' + g.img + '" alt="' + g.name + '" class="gc-icon">' +
        countHtml +
      '</div>' +
      '<div class="gc-name">' + g.name + '</div>' +
      liveBadge +
      dailyHtml +
      statsHtml +
      modesHtml +
    '</div>';
  }).join('');
}

// ─── Businesses ─────────────────────────────────────────────────────

function getBizCost(type, level) {
  const c = BUSINESS_CONFIG[type];
  if (!c) return Infinity;
  if (level === 0) return c.baseCost;
  return Math.floor(c.baseUpgradeCost * Math.pow(c.costMultiplier, level));
}

function getBizIncomePerSec(type, level) {
  if (level <= 0) return 0;
  const c = BUSINESS_CONFIG[type];
  if (!c) return 0;
  if (c.levelMultiplier) return (c.baseIncome * Math.pow(c.levelMultiplier, level - 1)) / c.cycleSeconds;
  return (c.baseIncome * level) / c.cycleSeconds;
}

function calcPlayerBuffs(cosmetics) {
  const buffs = { biz_boost: 0, offline_boost: 0, coin_bonus: 0, prestige: 0 };
  const equipped = (cosmetics || []).filter(c => c.equipped);
  equipped.forEach(c => {
    // Try to find the shop item for buff data
    const shopItem = shopCatalog.find(s => s.id === c.cosmetic_id);
    if (!shopItem) return;
    if (shopItem.buffs) {
      shopItem.buffs.forEach(b => { if (buffs[b.type] !== undefined) buffs[b.type] += b.value; });
    } else if (shopItem.buff && buffs[shopItem.buff.type] !== undefined) {
      buffs[shopItem.buff.type] += shopItem.buff.value;
    }
  });
  return buffs;
}

function formatIncome(n) {
  if (n === 0) return '0';
  if (n < 0.01) return n.toFixed(4);
  if (n < 1) return n.toFixed(2);
  if (n < 100) return n.toFixed(1);
  return formatNumber(Math.floor(n));
}

function renderBusinesses(businesses) {
  const grid = document.getElementById('businesses-grid');
  const owned = {};
  (businesses || []).forEach(b => { owned[b.business_type] = b; });
  const coins = profile?.profile?.coins || 0;

  const types = Object.keys(BUSINESS_DATA);
  grid.innerHTML = types.map(type => {
    const biz = BUSINESS_DATA[type];
    const cfg = BUSINESS_CONFIG[type];
    const ob = owned[type];
    const level = ob ? ob.level : 0;
    const ips = getBizIncomePerSec(type, level);
    const cost = getBizCost(type, level);
    const canAfford = coins >= cost;
    const isWordUpgrade = cfg.wordUpgrade;

    if (ob) {
      // Owned business card
      const nextCost = getBizCost(type, level);
      const nextIps = getBizIncomePerSec(type, level + 1);
      const ipsGain = nextIps - ips;
      return `
        <div class="biz-card biz-owned">
          <div class="biz-card-left">
            <div class="biz-card-emoji">${biz.emoji}</div>
          </div>
          <div class="biz-card-center">
            <div class="biz-card-name">${biz.name}</div>
            <div class="biz-card-level">
              <span class="biz-level-badge${isWordUpgrade ? ' biz-level-auto' : ''}">Lv.${level}</span>
              ${isWordUpgrade ? '<span class="biz-auto-tag">📚</span>' : ''}
            </div>
            <div class="biz-card-income">
              <span class="biz-income-val">${formatIncome(ips)}</span>
              <span class="biz-income-label">/sec</span>
            </div>
          </div>
          <div class="biz-card-right">
            ${isWordUpgrade ? `
              <div class="biz-card-auto-info">Upgrades with words found</div>
            ` : `
              <div class="biz-card-cost">${formatNumber(nextCost)} XP</div>
              <div class="biz-card-gain">+${formatIncome(ipsGain)}/sec</div>
              <button class="biz-buy-btn${canAfford ? '' : ' biz-btn-disabled'}" onclick="portalBuyBusiness('${type}')" ${canAfford ? '' : 'disabled'}>
                Upgrade
              </button>
            `}
            ${type === 'pizza' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="openPizzaShop()">&#x1F355; Manage Shop</button>' : ''}
            ${type === 'newspaper' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="openNewspaperRoute()">&#x1F5DE;&#xFE0F; Manage Route</button>' : ''}
            ${type === 'library' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="openLibrary()">&#x1F4DA; Manage Library</button>' : ''}
          </div>
        </div>
      `;
    }

    // Locked business card
    return `
      <div class="biz-card biz-locked">
        <div class="biz-card-left">
          <div class="biz-card-emoji">${biz.emoji}</div>
        </div>
        <div class="biz-card-center">
          <div class="biz-card-name">${biz.name}</div>
          <div class="biz-card-level">
            <span class="biz-locked-tag">Not Purchased</span>
          </div>
          <div class="biz-card-income">
            <span class="biz-income-preview">${formatIncome(getBizIncomePerSec(type, 1))}/sec at Lv.1</span>
          </div>
        </div>
        <div class="biz-card-right">
          <div class="biz-card-cost">${formatNumber(cost)} XP</div>
          <button class="biz-buy-btn biz-buy-new${canAfford ? '' : ' biz-btn-disabled'}" onclick="portalBuyBusiness('${type}')" ${canAfford ? '' : 'disabled'}>
            Buy
          </button>
        </div>
      </div>
    `;
  }).join('');

  // Render earnings breakdown and buffs
  const buffs = calcPlayerBuffs(profile?.cosmetics);
  renderEarningsBreakdown(businesses, buffs);
  renderBuffsSummary(buffs);

}

function renderEarningsBreakdown(businesses, buffs) {
  const owned = {};
  (businesses || []).forEach(b => { owned[b.business_type] = b; });

  // Calculate total base income per second
  let baseTotal = 0;
  Object.keys(BUSINESS_DATA).forEach(type => {
    const ob = owned[type];
    if (ob) baseTotal += getBizIncomePerSec(type, ob.level);
  });

  const bizBoost = buffs.biz_boost || 0;
  const prestige = buffs.prestige || 0;
  const coinBonus = buffs.coin_bonus || 0;

  const afterBizBoost = baseTotal * bizBoost;
  const afterPrestige = baseTotal * (1 + bizBoost) * prestige;
  const totalIncome = baseTotal * (1 + bizBoost) * (1 + prestige) * (1 + coinBonus);
  const coinBonusContrib = totalIncome - baseTotal * (1 + bizBoost) * (1 + prestige);

  document.getElementById('biz-base-income').textContent = formatIncome(baseTotal) + '/sec';
  document.getElementById('biz-boost-income').textContent = '+' + formatIncome(afterBizBoost) + '/sec';
  document.getElementById('biz-prestige-income').textContent = '+' + formatIncome(afterPrestige) + '/sec';
  document.getElementById('biz-coin-bonus-income').textContent = '+' + formatIncome(coinBonusContrib) + '/sec';
  document.getElementById('biz-total-income').textContent = formatIncome(totalIncome) + '/sec';

  // Update buff tags
  document.querySelector('[data-buff="biz_boost"]').textContent = '+' + (bizBoost * 100).toFixed(0) + '%';
  document.querySelector('[data-buff="prestige"]').textContent = '+' + (prestige * 100).toFixed(0) + '%';
  document.querySelector('[data-buff="coin_bonus"]').textContent = '+' + (coinBonus * 100).toFixed(0) + '%';
}

function renderBuffsSummary(buffs) {
  const list = document.getElementById('biz-buffs-list');
  const BUFF_ICONS = {
    biz_boost: '📊', offline_boost: '🌙', coin_bonus: '🟢', prestige: '👑'
  };
  const BUFF_NAMES = {
    biz_boost: 'Biz Income', offline_boost: 'Offline Income', coin_bonus: 'All XP', prestige: 'All Income'
  };
  const BUFF_COLORS = {
    biz_boost: '#4fc34f', offline_boost: '#4a9eff', coin_bonus: '#ffab00', prestige: '#b44aff'
  };

  const activeBuffs = Object.entries(buffs).filter(([, v]) => v > 0);
  if (activeBuffs.length === 0) {
    list.innerHTML = '<div class="biz-no-buffs">No cosmetic buffs equipped. Visit the Store to get buffs!</div>';
    return;
  }

  list.innerHTML = activeBuffs.map(([type, val]) => `
    <div class="biz-buff-chip" style="--buff-color: ${BUFF_COLORS[type] || 'var(--accent)'}">
      <span class="biz-buff-icon">${BUFF_ICONS[type] || '✨'}</span>
      <span class="biz-buff-name">${BUFF_NAMES[type] || type}</span>
      <span class="biz-buff-val">+${(val * 100).toFixed(0)}%</span>
    </div>
  `).join('');
}

async function portalBuyBusiness(type) {
  const btn = document.querySelector(`.biz-buy-btn[onclick*="'${type}'"]`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="biz-btn-spinner"></span>';
  }
  try {
    const res = await fetch('/api/me/business/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ businessType: type })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || 'Purchase successful!');
      // Update profile data
      if (data.coins !== undefined) profile.profile.coins = data.coins;
      if (data.businesses) profile.businesses = data.businesses;
      // Re-render
      renderBusinesses(profile.businesses);
      // Update overview coins too
      const heroCoins = document.getElementById('ov-hero-coin-val');
      if (heroCoins) heroCoins.textContent = formatNumber(profile.profile.coins);
      // Auto-init pizza shop if pizza was just purchased for the first time
      if (type === 'pizza') {
        fetch('/api/me/pizza/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(function(r) { return r.json(); })
          .then(function(initData) {
            if (initData.ok) showToast('Pizza Shop unlocked! Click the Pizza Shop tab to manage it.', 'success', 4000);
          }).catch(function() {});
      }
    } else {
      showToast(data.message || 'Purchase failed');
      if (btn) { btn.disabled = false; btn.textContent = type in (profile?.businesses?.reduce((a, b) => { a[b.business_type] = 1; return a; }, {}) || {}) ? 'Upgrade' : 'Buy'; }
    }
  } catch {
    showToast('Server error — try again');
    if (btn) { btn.disabled = false; btn.textContent = 'Retry'; }
  }
}

// ─── Cosmetics ──────────────────────────────────────────────────────

let selectedPlatform = null;

async function loadCosmetics(ownedList) {
  try {
    // Only fetch shop if not already cached (ensureShopCatalog may have loaded it)
    const needsShop = shopCatalog.length === 0;
    const fetches = [fetch('/api/me/sets')];
    if (needsShop) fetches.unshift(fetch('/api/me/shop'));

    const results = await Promise.all(fetches);
    if (needsShop) {
      const shopData = await results.shift().json();
      if (Array.isArray(shopData)) {
        shopCatalog = shopData;
      } else {
        shopCatalog = [];
        for (const [cat, items] of Object.entries(shopData)) {
          for (const item of items) {
            if (!item.category) item.category = cat;
            shopCatalog.push(item);
          }
        }
      }
    }
    const setsData = await results[0].json();
    shopSets = setsData.sets || setsData;
  } catch {}

  // Seed seen-cosmetics on first load so existing items don't all appear as "New"
  if (!localStorage.getItem('portal_seen_cosmetics') && ownedList?.length) {
    saveSeenCosmetics(new Set(ownedList.map(c => c.cosmetic_id)));
  }

  initPreview();
  renderCosmetics(ownedList, 'all');
  applyPreviewCosmetics();
  renderSets(ownedList);
}

function initPreview() {
  const platforms = profile?.profile?.platforms || [];
  const selector = document.getElementById('preview-platform-selector');
  if (!selector) return;

  if (platforms.length === 0) {
    selector.innerHTML = '';
    return;
  }

  // Sort platforms by display priority: Discord > TikTok > YouTube > GitHub
  const sorted = [...platforms].sort((a, b) => {
    const ai = DISPLAY_PRIORITY.indexOf(a.platform);
    const bi = DISPLAY_PRIORITY.indexOf(b.platform);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  // Build platform buttons in priority order
  selector.innerHTML = sorted.map(p =>
    `<button class="plat-btn" data-platform="${p.platform}">${capitalize(p.platform)}</button>`
  ).join('');

  // Select first platform with a valid display name by priority
  const bestPlatform = sorted.find(p => p.displayName || p.username);
  selectedPlatform = bestPlatform ? bestPlatform.platform : sorted[0].platform;
  updatePreviewPlatform();

  // Click handlers
  selector.querySelectorAll('.plat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedPlatform = btn.dataset.platform;
      updatePreviewPlatform();
      applyPreviewCosmetics();
    });
  });
}

function updatePreviewPlatform() {
  const platforms = profile?.profile?.platforms || [];
  const plat = platforms.find(p => p.platform === selectedPlatform);

  // Update active button
  document.querySelectorAll('.plat-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.platform === selectedPlatform);
  });

  if (plat) {
    const pic = plat.profilePic;
    const avatarEl = document.getElementById('preview-avatar');
    if (!avatarEl) return;
    if (pic) {
      avatarEl.src = pic;
      avatarEl.style.display = 'block';
      const fallback = avatarEl.parentElement.querySelector('.avatar-fallback');
      if (fallback) fallback.remove();
    } else {
      avatarEl.style.display = 'none';
      let fallback = avatarEl.parentElement.querySelector('.avatar-fallback');
      if (!fallback) {
        fallback = document.createElement('div');
        fallback.className = 'avatar-fallback';
        avatarEl.parentElement.appendChild(fallback);
      }
      const name = plat.displayName || plat.username || '?';
      fallback.textContent = name.charAt(0).toUpperCase();
    }
    document.getElementById('preview-name').textContent = plat.displayName || plat.username || 'Unknown';
  }
}

function setupCosmeticsFilter() {
  document.getElementById('cosmetic-category-filter').addEventListener('change', (e) => {
    if (profile && profile.cosmetics) {
      renderCosmetics(profile.cosmetics, e.target.value);
    }
  });
  document.getElementById('cosmetic-sort').addEventListener('change', () => {
    if (profile && profile.cosmetics) {
      const filterCat = document.getElementById('cosmetic-category-filter').value;
      renderCosmetics(profile.cosmetics, filterCat);
    }
  });
}

// ─── Store ─────────────────────────────────────────────────────────

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, epic: 3, legendary: 4, ultra: 5, aux: 6 };
const BUFF_TYPE_LABELS = {
  tap_boost: 'Tap Power', word_game_boost: 'Word Game Money', biz_boost: 'Biz Income',
  offline_boost: 'Offline Income', combo_boost: 'Combo Max', coin_bonus: 'All XP',
  prestige: 'All Income', lucky_bonus: 'Lucky 2x', word_reward_2x: 'Word Reward 2x'
};

let storeItems = [];
let storeLoaded = false;
let storePreviewItem = null;

function setupStore() {
  ['store-cat-filter', 'store-rarity-filter', 'store-set-filter', 'store-buff-filter', 'store-sort'].forEach(id => {
    document.getElementById(id).addEventListener('change', renderStoreGrid);
  });
  document.getElementById('store-preview-reset').addEventListener('click', resetStorePreview);
}

async function loadStore() {
  if (storeLoaded && storeItems.length > 0) {
    updateStoreCoinBalance();
    renderStoreGrid();
    return;
  }

  try {
    const [shopRes, setsRes] = await Promise.all([
      fetch('/api/me/shop'),
      fetch('/api/me/sets')
    ]);
    const shopData = await shopRes.json();
    if (Array.isArray(shopData)) {
      storeItems = shopData;
    } else {
      storeItems = [];
      for (const [cat, items] of Object.entries(shopData)) {
        for (const item of items) {
          if (!item.category) item.category = cat;
          storeItems.push(item);
        }
      }
    }
    const setsData = await setsRes.json();
    shopSets = setsData.sets || setsData;
    storeLoaded = true;
  } catch {
    storeItems = shopCatalog.length ? [...shopCatalog] : [];
  }

  updateStoreCoinBalance();
  renderStoreGrid();
  renderStoreSets();
  initStorePreview();
}

function updateStoreCoinBalance() {
  const el = document.getElementById('store-coin-balance');
  const giftEl = document.getElementById('store-gift-balance');
  if (profile && profile.profile) {
    el.textContent = formatNumber(profile.profile.coins);
    if (giftEl) giftEl.textContent = formatNumber(profile.profile.giftCoins || 0);
  }
}

function initStorePreview() {
  const platforms = profile?.profile?.platforms || [];
  if (platforms.length === 0) return;
  const plat = platforms[0];
  const avatarEl = document.getElementById('store-preview-avatar');
  if (plat.profilePic) {
    avatarEl.src = plat.profilePic;
    avatarEl.style.display = 'block';
  } else {
    avatarEl.style.display = 'none';
  }
  document.getElementById('store-preview-name').textContent = plat.displayName || plat.username || 'Player';
  applyStorePreviewFromEquipped();
}

function applyStorePreviewFromEquipped() {
  const avatarWrap = document.querySelector('.store-preview-avatar-wrap');
  const avatarEl = document.getElementById('store-preview-avatar');
  const nameEl = document.getElementById('store-preview-name');
  const wordEl = document.getElementById('store-preview-word');
  const titleEl = document.getElementById('store-preview-title');

  if (!avatarWrap) return;

  avatarWrap.style.cssText = '';
  avatarEl.style.border = '3px solid var(--border)';
  avatarEl.style.animation = '';
  nameEl.style.cssText = '';
  wordEl.style.cssText = '';
  titleEl.innerHTML = '';
  titleEl.style.cssText = '';

  const ownedList = profile?.cosmetics || [];
  const equipped = ownedList.filter(c => c.equipped);
  if (equipped.length === 0) return;

  const cosmeticsByCategory = {};
  equipped.forEach(c => {
    const shopItem = storeItems.find(s => s.id === c.cosmetic_id);
    if (shopItem && shopItem.css) cosmeticsByCategory[c.category] = shopItem.css;
  });

  applyStorePreviewCSS(cosmeticsByCategory);
}

function applyStorePreviewCSS(cosmeticsByCategory) {
  const avatarWrap = document.querySelector('.store-preview-avatar-wrap');
  const avatarEl = document.getElementById('store-preview-avatar');
  const nameEl = document.getElementById('store-preview-name');
  const wordEl = document.getElementById('store-preview-word');
  const titleEl = document.getElementById('store-preview-title');

  const border = cosmeticsByCategory.profile_border;
  if (border) {
    if (border.border) avatarEl.style.border = border.border;
    if (border.boxShadow) avatarWrap.style.boxShadow = border.boxShadow;
    if (border.animation) avatarWrap.style.animation = border.animation;
  }
  const glow = cosmeticsByCategory.profile_glow;
  if (glow) {
    if (glow.boxShadow) {
      const existing = avatarWrap.style.boxShadow;
      avatarWrap.style.boxShadow = existing ? existing + ', ' + glow.boxShadow : glow.boxShadow;
    }
    if (glow.animation && !avatarWrap.style.animation) avatarWrap.style.animation = glow.animation;
  }
  const nameColor = cosmeticsByCategory.name_color;
  if (nameColor) {
    if (nameColor.color) nameEl.style.color = nameColor.color;
    if (nameColor.animation) nameEl.style.animation = nameColor.animation;
  }
  const nameGlow = cosmeticsByCategory.name_glow;
  if (nameGlow) {
    if (nameGlow.textShadow) nameEl.style.textShadow = nameGlow.textShadow;
    if (nameGlow.animation && !nameEl.style.animation) nameEl.style.animation = nameGlow.animation;
  }
  const wordColor = cosmeticsByCategory.word_color;
  if (wordColor) {
    if (wordColor.color) wordEl.style.color = wordColor.color;
    if (wordColor.textShadow) wordEl.style.textShadow = wordColor.textShadow;
    if (wordColor.animation) wordEl.style.animation = wordColor.animation;
  }
  const wordGlow = cosmeticsByCategory.word_glow;
  if (wordGlow) {
    if (wordGlow.textShadow && !wordEl.style.textShadow) wordEl.style.textShadow = wordGlow.textShadow;
    if (wordGlow.animation && !wordEl.style.animation) wordEl.style.animation = wordGlow.animation;
  }
  const titleCos = cosmeticsByCategory.title;
  if (titleCos) {
    titleEl.textContent = titleCos.title || '';
    if (titleCos.titleColor) titleEl.style.color = titleCos.titleColor;
    if (titleCos.titleGlow) titleEl.style.textShadow = titleCos.titleGlow;
    if (titleCos.animation) titleEl.style.animation = titleCos.animation;
  }

  // Apply hero_badge background
  const storeBadgeBg = document.getElementById('store-preview-badge-bg');
  if (storeBadgeBg) {
    const badge = cosmeticsByCategory.hero_badge;
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
}

function previewStoreItem(item) {
  storePreviewItem = item;
  applyStorePreviewFromEquipped();

  // Overlay the previewed item on top
  const css = item.css;
  if (!css) return;

  const avatarWrap = document.querySelector('.store-preview-avatar-wrap');
  const avatarEl = document.getElementById('store-preview-avatar');
  const nameEl = document.getElementById('store-preview-name');
  const wordEl = document.getElementById('store-preview-word');
  const titleEl = document.getElementById('store-preview-title');

  if (item.category === 'word_color') {
    if (css.color) wordEl.style.color = css.color;
    if (css.textShadow) wordEl.style.textShadow = css.textShadow;
    if (css.animation) wordEl.style.animation = css.animation;
  } else if (item.category === 'word_glow') {
    if (css.textShadow) wordEl.style.textShadow = css.textShadow;
    if (css.animation) wordEl.style.animation = css.animation;
  } else if (item.category === 'profile_border') {
    if (css.border) avatarEl.style.border = css.border;
    if (css.boxShadow) {
      const existing = avatarWrap.style.boxShadow;
      avatarWrap.style.boxShadow = existing ? existing + ', ' + css.boxShadow : css.boxShadow;
    }
    if (css.animation) avatarWrap.style.animation = css.animation;
  } else if (item.category === 'profile_glow') {
    if (css.boxShadow) {
      const existing = avatarWrap.style.boxShadow;
      avatarWrap.style.boxShadow = existing ? existing + ', ' + css.boxShadow : css.boxShadow;
    }
    if (css.animation) avatarWrap.style.animation = css.animation;
  } else if (item.category === 'name_color') {
    if (css.color) nameEl.style.color = css.color;
    if (css.animation) nameEl.style.animation = css.animation;
  } else if (item.category === 'name_glow') {
    if (css.textShadow) nameEl.style.textShadow = css.textShadow;
    if (css.animation) nameEl.style.animation = css.animation;
  } else if (item.category === 'title') {
    titleEl.textContent = css.title || '';
    if (css.titleColor) titleEl.style.color = css.titleColor;
    if (css.titleGlow) titleEl.style.textShadow = css.titleGlow;
    if (css.animation) titleEl.style.animation = css.animation;
  } else if (item.category === 'hero_badge') {
    const storeBadgeBg = document.getElementById('store-preview-badge-bg');
    if (storeBadgeBg) {
      if (css.background) storeBadgeBg.style.background = css.background;
      if (css.backgroundSize) storeBadgeBg.style.backgroundSize = css.backgroundSize;
      if (css.animation) storeBadgeBg.style.animation = css.animation;
    }
  }

  // Highlight previewed card
  document.querySelectorAll('.store-card.previewing').forEach(c => c.classList.remove('previewing'));
  const card = document.querySelector(`.store-card[data-id="${item.id}"]`);
  if (card) card.classList.add('previewing');
}

// Make available globally for onclick
window.storePreview = function(itemId) {
  const item = storeItems.find(i => i.id === itemId);
  if (item) previewStoreItem(item);
};

function resetStorePreview() {
  storePreviewItem = null;
  applyStorePreviewFromEquipped();
  document.querySelectorAll('.store-card.previewing').forEach(c => c.classList.remove('previewing'));
}

function getStoreFiltered() {
  const catFilter = document.getElementById('store-cat-filter').value;
  const rarityFilter = document.getElementById('store-rarity-filter').value;
  const setFilter = document.getElementById('store-set-filter').value;
  const buffFilter = document.getElementById('store-buff-filter').value;
  const sortVal = document.getElementById('store-sort').value;

  let items = [...storeItems];

  if (catFilter === 'gift') {
    items = items.filter(i => i.giftSet);
  } else if (catFilter !== 'all') {
    items = items.filter(i => i.category === catFilter && !i.giftSet);
  }
  if (rarityFilter !== 'all') items = items.filter(i => i.rarity === rarityFilter);
  if (setFilter === 'none') {
    items = items.filter(i => !i.setId);
  } else if (setFilter !== 'all') {
    items = items.filter(i => i.setId === setFilter);
  }
  if (buffFilter !== 'all') {
    items = items.filter(i => {
      if (i.buff && i.buff.type === buffFilter) return true;
      if (i.buffs && i.buffs.some(b => b.type === buffFilter)) return true;
      return false;
    });
  }

  // Sort
  const [sortKey, sortDir] = sortVal.split('-');
  items.sort((a, b) => {
    if (sortKey === 'price') {
      return sortDir === 'asc' ? a.cost - b.cost : b.cost - a.cost;
    } else if (sortKey === 'rarity') {
      const ra = RARITY_RANK[a.rarity] || 0;
      const rb = RARITY_RANK[b.rarity] || 0;
      return sortDir === 'asc' ? ra - rb : rb - ra;
    } else if (sortKey === 'buff') {
      const ba = a.buff ? a.buff.value : (a.buffs ? Math.max(...a.buffs.map(b => b.value)) : 0);
      const bb = b.buff ? b.buff.value : (b.buffs ? Math.max(...b.buffs.map(b => b.value)) : 0);
      return sortDir === 'asc' ? ba - bb : bb - ba;
    } else if (sortKey === 'name') {
      return a.name.localeCompare(b.name);
    }
    return 0;
  });

  return items;
}

function renderStoreGrid() {
  const grid = document.getElementById('store-grid');
  const items = getStoreFiltered();
  const ownedIds = new Set((profile?.cosmetics || []).map(c => c.cosmetic_id));

  document.getElementById('store-count').textContent = items.length;

  if (items.length === 0) {
    grid.innerHTML = '<div class="loading-placeholder">No items match your filters</div>';
    return;
  }

  grid.innerHTML = items.map(item => {
    const color = RARITY_COLORS[item.rarity] || '#888';
    const catLabel = CATEGORY_LABELS[item.category] || item.category;
    const owned = ownedIds.has(item.id);
    const isGift = item.giftSet || item.cost === 0;
    const isPreviewing = storePreviewItem && storePreviewItem.id === item.id;

    // Build preview
    let previewHtml = '';
    if (item.css) {
      const css = item.css;
      if (item.category === 'profile_border' || item.category === 'profile_glow') {
        const style = Object.entries(css).filter(([k]) => k !== 'animation').map(([k, v]) => `${camelToKebab(k)}: ${v}`).join('; ');
        const animStyle = css.animation ? `animation: ${css.animation}` : '';
        previewHtml = `<div class="store-card-preview"><div class="store-preview-circle" style="${style};${animStyle}"></div></div>`;
      } else if (item.category === 'title') {
        previewHtml = `<div class="store-card-preview store-title-preview" style="color:${css.titleColor || '#fff'};${css.titleGlow ? 'text-shadow:' + css.titleGlow : ''};${css.animation ? 'animation:' + css.animation : ''}">${escapeHtml(css.title || 'Title')}</div>`;
      } else if (item.category === 'win_effect') {
        const dots = (css.colors || []).slice(0, 5).map(c => `<span class="store-we-dot" style="background:${c}"></span>`).join('');
        previewHtml = `<div class="store-card-preview store-we-preview">${dots}</div>`;
      } else if (item.category === 'hero_badge') {
        const bgStyle = css.background ? `background:${css.background};` : '';
        const bgSize = css.backgroundSize ? `background-size:${css.backgroundSize};` : '';
        const animStyle = css.animation ? `animation:${css.animation};` : '';
        previewHtml = `<div class="store-card-preview"><div style="width:40px;height:24px;border-radius:4px;${bgStyle}${bgSize}${animStyle}"></div></div>`;
      } else {
        const style = Object.entries(css).filter(([k]) => k !== 'animation').map(([k, v]) => `${camelToKebab(k)}: ${v}`).join('; ');
        const animStyle = css.animation ? `animation: ${css.animation}` : '';
        previewHtml = `<div class="store-card-preview store-text-preview" style="${style};${animStyle}">Aa</div>`;
      }
    }

    // Buff labels
    let buffHtml = '';
    if (item.buffs) {
      buffHtml = item.buffs.map(b => `<div class="store-card-buff">${escapeHtml(b.label)}</div>`).join('');
    } else if (item.buff) {
      buffHtml = `<div class="store-card-buff">${escapeHtml(item.buff.label)}</div>`;
    }

    // Set badge
    const setBadge = item.setId ? `<span class="store-set-badge">${escapeHtml(item.setId)}</span>` : '';

    // Price display + buy button
    let priceHtml;
    let buyBtnHtml = '';
    if (isGift) {
      priceHtml = '<span class="store-card-gift">Gift Only</span>';
      if (!owned && item.setId) {
        buyBtnHtml = `<button class="store-buy-btn store-buy-gift" onclick="event.stopPropagation(); portalBuySet('${item.setId}')">Buy Set</button>`;
      }
    } else {
      priceHtml = `<span class="store-card-price-value">${formatNumber(item.cost)}</span>`;
      if (!owned) {
        const canAfford = (profile?.profile?.coins || 0) >= item.cost;
        buyBtnHtml = `<button class="store-buy-btn${canAfford ? '' : ' store-buy-disabled'}" onclick="event.stopPropagation(); portalBuyCosmetic('${item.id}')" ${canAfford ? '' : 'disabled'}>Buy</button>`;
      }
    }

    const auxBadge = item.audioReactive ? '<span class="store-aux-badge">AUX</span>' : '';

    return `
      <div class="store-card${owned ? ' owned' : ''}${isPreviewing ? ' previewing' : ''}" data-id="${item.id}" style="--rarity-color: ${color}" onclick="storePreview('${item.id}')">
        <div class="store-card-rarity-strip" style="background: ${color}"></div>
        ${owned ? '<div class="store-owned-badge">OWNED</div>' : ''}
        ${auxBadge}
        ${previewHtml}
        <div class="store-card-body">
          <div class="store-card-name">${escapeHtml(item.name)}</div>
          <div class="store-card-meta">
            <span class="store-card-category">${catLabel}</span>
            ${setBadge}
          </div>
          <div class="store-card-rarity" style="background:${color}18; color:${color}">${item.rarity}${item.audioReactive ? ' (Audio)' : ''}</div>
          ${buffHtml}
          <div class="store-card-price">${priceHtml}${buyBtnHtml}</div>
        </div>
      </div>
    `;
  }).join('');
}

function renderStoreSets() {
  const section = document.getElementById('store-sets-section');
  const entries = Object.entries(shopSets);
  if (entries.length === 0) { section.innerHTML = ''; return; }

  const ownedIds = new Set((profile?.cosmetics || []).map(c => c.cosmetic_id));

  const setsHtml = entries.map(([key, set]) => {
    const owned = set.itemIds.filter(id => ownedIds.has(id)).length;
    const total = set.itemIds.length;
    const pct = Math.round((owned / total) * 100);
    const complete = owned === total;
    const color = RARITY_COLORS[set.rarity] || '#888';

    // Build mini item previews
    const itemDots = set.itemIds.map(id => {
      const item = storeItems.find(i => i.id === id);
      const isOwned = ownedIds.has(id);
      const catLabel = item ? (CATEGORY_LABELS[item.category] || '') : '';
      return `<span class="store-set-dot${isOwned ? ' owned' : ''}" style="background:${isOwned ? color : 'var(--surface2)'}" title="${catLabel}${item ? ': ' + escapeHtml(item.name) : ''}"></span>`;
    }).join('');

    return `
      <div class="store-set-card${complete ? ' complete' : ''}" style="--set-color: ${color}">
        <div class="store-set-header">
          <div>
            <span class="store-set-name">${escapeHtml(set.name)}</span>
            <span class="store-set-rarity" style="color:${color}">${set.rarity}</span>
          </div>
          <span class="store-set-progress">${owned}/${total}</span>
        </div>
        <div class="store-set-bar"><div class="store-set-bar-fill" style="width:${pct}%;background:${color}"></div></div>
        <div class="store-set-dots">${itemDots}</div>
        <div class="store-set-bonus">${escapeHtml(set.setBonusLabel || '')}</div>
        ${(() => {
          if (complete) return '<div class="store-set-cost store-set-complete-label">Complete!</div>';
          if (set.giftSet) {
            const giftCoins = profile?.profile?.giftCoins || 0;
            const canAfford = giftCoins >= (set.totalCost || 0);
            return `<div class="store-set-cost-row"><span class="store-set-cost">🎁 ${formatNumber(set.totalCost || 0)} gift XP</span><button class="store-buy-btn store-buy-gift" onclick="portalBuySet('${key}')" ${canAfford ? '' : 'disabled'}>Buy Set</button></div>`;
          }
          return `<div class="store-set-cost">Set: ${formatNumber(set.totalCost)}</div>`;
        })()}
      </div>
    `;
  }).join('');

  section.innerHTML = `
    <h3 class="section-title" style="margin-top:36px">Cosmetic Sets</h3>
    <div class="store-sets-grid">${setsHtml}</div>
  `;
}

async function portalBuyCosmetic(cosmeticId) {
  const btn = document.querySelector(`.store-buy-btn[onclick*="'${cosmeticId}'"]`);
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="biz-btn-spinner"></span>'; }
  try {
    const res = await fetch('/api/me/cosmetics/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cosmeticId })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || 'Purchased!');
      if (data.coins !== undefined) profile.profile.coins = data.coins;
      if (data.cosmetics) profile.cosmetics = data.cosmetics;
      updateStoreCoinBalance();
      renderStoreGrid();
      renderStoreSets();
      // Update overview coins
      const heroCoins = document.getElementById('ov-hero-coin-val');
      if (heroCoins) heroCoins.textContent = formatNumber(profile.profile.coins);
    } else {
      showToast(data.message || 'Purchase failed');
      if (btn) { btn.disabled = false; btn.textContent = 'Buy'; }
    }
  } catch {
    showToast('Server error — try again');
    if (btn) { btn.disabled = false; btn.textContent = 'Buy'; }
  }
}

async function portalBuySet(setKey) {
  const btns = document.querySelectorAll(`.store-buy-gift[onclick*="'${setKey}'"]`);
  btns.forEach(btn => { btn.disabled = true; btn.innerHTML = '<span class="biz-btn-spinner"></span>'; });
  try {
    const res = await fetch('/api/me/cosmetics/buyset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ setKey })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(data.message || 'Set purchased!');
      if (data.giftCoins !== undefined) profile.profile.giftCoins = data.giftCoins;
      if (data.cosmetics) profile.cosmetics = data.cosmetics;
      updateStoreCoinBalance();
      renderStoreGrid();
      renderStoreSets();
    } else {
      showToast(data.message || 'Purchase failed');
      btns.forEach(btn => { btn.disabled = false; btn.textContent = 'Buy Set'; });
    }
  } catch {
    showToast('Server error — try again');
    btns.forEach(btn => { btn.disabled = false; btn.textContent = 'Buy Set'; });
  }
}

// ─── New-item tracking ──────────────────────────────────────────────
function getSeenCosmetics() {
  try { return new Set(JSON.parse(localStorage.getItem('portal_seen_cosmetics') || '[]')); } catch { return new Set(); }
}
function saveSeenCosmetics(seenSet) {
  try { localStorage.setItem('portal_seen_cosmetics', JSON.stringify([...seenSet])); } catch {}
}
function markAllCosmeticsSeen() {
  if (!profile?.cosmetics) return;
  const seen = getSeenCosmetics();
  profile.cosmetics.forEach(c => seen.add(c.cosmetic_id));
  saveSeenCosmetics(seen);
}

function renderCosmetics(ownedList, filterCat) {
  const grid = document.getElementById('cosmetics-grid');
  let items = ownedList || [];
  const seen = getSeenCosmetics();

  if (filterCat !== 'all') {
    items = items.filter(c => c.category === filterCat);
  }

  // Sort items
  const sortMode = document.getElementById('cosmetic-sort')?.value || 'default';
  if (sortMode === 'rarity-desc') {
    items = [...items].sort((a, b) => (RARITY_RANK[b.rarity] || 0) - (RARITY_RANK[a.rarity] || 0));
  } else if (sortMode === 'rarity-asc') {
    items = [...items].sort((a, b) => (RARITY_RANK[a.rarity] || 0) - (RARITY_RANK[b.rarity] || 0));
  } else if (sortMode === 'name') {
    items = [...items].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  }

  document.getElementById('owned-count').textContent = (ownedList || []).length;

  if (items.length === 0) {
    grid.innerHTML = '<div class="loading-placeholder">No cosmetics owned' + (filterCat !== 'all' ? ' in this category' : '') + '</div>';
    return;
  }

  grid.innerHTML = items.map(c => {
    const color = RARITY_COLORS[c.rarity] || '#888';
    const catLabel = CATEGORY_LABELS[c.category] || c.category;

    // Try to find CSS preview from shop catalog, or fall back to DB css_property (for generated cosmetics)
    let previewHtml = '';
    let css = null;
    if (Array.isArray(shopCatalog)) {
      const shopItem = shopCatalog.find(s => s.id === c.cosmetic_id);
      if (shopItem && shopItem.css) css = shopItem.css;
    }
    if (!css && c.css_property) {
      try { css = JSON.parse(c.css_property); } catch (e) {}
    }
    if (css) {
      if (c.category === 'profile_border' || c.category === 'profile_glow') {
        const style = Object.entries(css).filter(([k]) => k !== 'animation').map(([k, v]) => `${camelToKebab(k)}: ${v}`).join('; ');
        previewHtml = `<div class="cosmetic-preview"><div style="width:24px;height:24px;border-radius:50%;background:var(--surface2);${style};${css.animation ? 'animation:' + css.animation : ''}"></div></div>`;
      } else if (c.category === 'title') {
        previewHtml = `<div class="cosmetic-preview" style="color:${css.titleColor || '#fff'};${css.titleGlow ? 'text-shadow:' + css.titleGlow : ''};${css.animation ? 'animation:' + css.animation : ''}">${escapeHtml(css.title || 'Title')}</div>`;
      } else if (c.category === 'win_effect') {
        previewHtml = '<div class="cosmetic-preview" style="font-size:20px">&#10024;</div>';
      } else if (c.category === 'hero_badge') {
        const bgStyle = css.background ? `background:${css.background};` : '';
        const bgSize = css.backgroundSize ? `background-size:${css.backgroundSize};` : '';
        const animStyle = css.animation ? `animation:${css.animation};` : '';
        previewHtml = `<div class="cosmetic-preview"><div style="width:32px;height:18px;border-radius:3px;${bgStyle}${bgSize}${animStyle}"></div></div>`;
      } else {
        const style = Object.entries(css).filter(([k]) => k !== 'animation').map(([k, v]) => `${camelToKebab(k)}: ${v}`).join('; ');
        previewHtml = `<div class="cosmetic-preview" style="${style};${css.animation ? 'animation:' + css.animation : ''}">Aa</div>`;
      }
    }

    const toggleLabel = c.equipped ? 'Equipped' : 'Equip';
    const toggleClass = c.equipped ? 'equipped' : 'unequipped';
    const safeName = escapeHtml(c.name).replace(/'/g, "\\'");
    const isNew = !seen.has(c.cosmetic_id);

    return `
      <div class="cosmetic-card${c.equipped ? ' equipped' : ''}${isNew ? ' is-new' : ''}" data-cosmetic-id="${c.cosmetic_id}" data-category="${c.category}">
        <button class="cosmetic-toggle ${toggleClass}" onclick="toggleCosmetic('${c.cosmetic_id}', '${c.category}', ${c.equipped ? 'true' : 'false'}, '${safeName}')">${toggleLabel}</button>
        ${previewHtml}
        <div class="cosmetic-name">${escapeHtml(c.name)}</div>
        <div class="cosmetic-category">${catLabel}</div>
        <div class="cosmetic-rarity" style="background:${color}20; color:${color}">${c.rarity}</div>
        ${isNew ? '<div class="cosmetic-new-tag">New</div>' : ''}
        ${c.cosmetic_id && c.cosmetic_id.startsWith('gen_') ? '<div class="cosmetic-reward-tag">Reward</div>' : ''}
        ${c.buff ? `<div class="cosmetic-buff">${c.buff.label || c.buff.type}</div>` : ''}
      </div>
    `;
  }).join('');
}

async function toggleCosmetic(cosmeticId, category, isEquipped, itemName) {
  // Find the button and disable it during the request
  const card = document.querySelector(`[data-cosmetic-id="${cosmeticId}"]`);
  const btn = card?.querySelector('.cosmetic-toggle');
  if (btn) btn.disabled = true;

  try {
    let res;
    if (isEquipped) {
      res = await fetch('/api/me/cosmetics/unequip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category })
      });
    } else {
      res = await fetch('/api/me/cosmetics/equip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cosmeticId })
      });
    }

    const data = await res.json();
    if (data.ok) {
      const ownedList = profile.cosmetics;
      if (isEquipped) {
        ownedList.forEach(c => { if (c.category === category) c.equipped = false; });
        showToast('Unequipped ' + (itemName || ''));
      } else {
        ownedList.forEach(c => {
          if (c.category === category) c.equipped = false;
          if (c.cosmetic_id === cosmeticId) c.equipped = true;
        });
        showToast('Equipped ' + (itemName || ''));
      }

      const filterCat = document.getElementById('cosmetic-category-filter').value;
      renderCosmetics(ownedList, filterCat);
      applyPreviewCosmetics();
      applyHeroCosmetics(profile?.cosmetics || ownedList);
      applyHeaderCosmetics(profile?.cosmetics || ownedList);
    } else {
      showToast(data.message || 'Failed');
    }
  } catch (e) {
    console.error('Toggle cosmetic failed:', e);
    showToast('Connection error');
  }

  if (btn) btn.disabled = false;
}

// showToast is defined at the top of this file (line ~78) with type/duration support

function applyPreviewCosmetics() {
  const avatarEl = document.getElementById('preview-avatar');
  if (!avatarEl) return; // guard against missing DOM
  const avatarWrap = avatarEl.parentElement;
  const nameEl = document.getElementById('preview-name');
  const wordEl = document.getElementById('preview-word');
  const titleContainer = document.getElementById('preview-title-container');
  if (!avatarWrap || !nameEl || !wordEl || !titleContainer) return;

  // Reset all inline styles
  avatarWrap.style.cssText = '';
  avatarEl.style.border = '3px solid var(--border)';
  avatarEl.style.animation = '';
  nameEl.style.cssText = '';
  wordEl.style.cssText = '';
  titleContainer.innerHTML = '';
  titleContainer.style.cssText = '';

  const ownedList = profile?.cosmetics || [];
  const equipped = ownedList.filter(c => c.equipped);

  if (equipped.length === 0) return;

  // Build a map of category → css from shopCatalog, with fallback to css_property for generated cosmetics
  const cosmeticsByCategory = {};
  equipped.forEach(c => {
    let css = null;
    if (Array.isArray(shopCatalog)) {
      const shopItem = shopCatalog.find(s => s.id === c.cosmetic_id);
      if (shopItem && shopItem.css) css = shopItem.css;
    }
    // Fallback for generated (gen_) cosmetics — use DB css_property
    if (!css && c.css_property) {
      try { css = JSON.parse(c.css_property); } catch (e) {}
    }
    if (css) cosmeticsByCategory[c.category] = css;
  });

  // Apply profile_border
  const border = cosmeticsByCategory.profile_border;
  if (border) {
    if (border.border) avatarEl.style.border = border.border;
    if (border.boxShadow) avatarWrap.style.boxShadow = border.boxShadow;
    if (border.animation) avatarWrap.style.animation = border.animation;
  }

  // Apply profile_glow (combine boxShadow with border's)
  const glow = cosmeticsByCategory.profile_glow;
  if (glow) {
    if (glow.boxShadow) {
      const existing = avatarWrap.style.boxShadow;
      avatarWrap.style.boxShadow = existing ? existing + ', ' + glow.boxShadow : glow.boxShadow;
    }
    if (glow.animation && !avatarWrap.style.animation) {
      avatarWrap.style.animation = glow.animation;
    }
  }

  // Apply name_color
  const nameColor = cosmeticsByCategory.name_color;
  if (nameColor) {
    if (nameColor.color) nameEl.style.color = nameColor.color;
    if (nameColor.animation) nameEl.style.animation = nameColor.animation;
  }

  // Apply name_glow
  const nameGlow = cosmeticsByCategory.name_glow;
  if (nameGlow) {
    if (nameGlow.textShadow) nameEl.style.textShadow = nameGlow.textShadow;
    if (nameGlow.animation && !nameEl.style.animation) nameEl.style.animation = nameGlow.animation;
  }

  // Apply word_color
  const wordColor = cosmeticsByCategory.word_color;
  if (wordColor) {
    if (wordColor.color) wordEl.style.color = wordColor.color;
    if (wordColor.textShadow) wordEl.style.textShadow = wordColor.textShadow;
    if (wordColor.animation) wordEl.style.animation = wordColor.animation;
  }

  // Apply word_glow (word_color takes precedence for textShadow)
  const wordGlow = cosmeticsByCategory.word_glow;
  if (wordGlow) {
    if (wordGlow.textShadow && !wordEl.style.textShadow) {
      wordEl.style.textShadow = wordGlow.textShadow;
    }
    if (wordGlow.animation && !wordEl.style.animation) {
      wordEl.style.animation = wordGlow.animation;
    }
  }

  // Apply title
  const titleCos = cosmeticsByCategory.title;
  if (titleCos) {
    titleContainer.textContent = titleCos.title || '';
    if (titleCos.titleColor) titleContainer.style.color = titleCos.titleColor;
    if (titleCos.titleGlow) titleContainer.style.textShadow = titleCos.titleGlow;
    if (titleCos.animation) titleContainer.style.animation = titleCos.animation;
  }

  // Apply hero_badge background
  const badgeBg = document.getElementById('preview-badge-bg');
  if (badgeBg) {
    const badge = cosmeticsByCategory.hero_badge;
    if (badge) {
      if (badge.background) badgeBg.style.background = badge.background;
      if (badge.backgroundSize) badgeBg.style.backgroundSize = badge.backgroundSize;
      if (badge.animation) badgeBg.style.animation = badge.animation;
    } else {
      badgeBg.style.background = '';
      badgeBg.style.backgroundSize = '';
      badgeBg.style.animation = '';
    }
  }
}

// ─── Cosmetic Sets ──────────────────────────────────────────────────

function renderSets(ownedList) {
  const ownedIds = new Set((ownedList || []).map(c => c.cosmetic_id));
  const entries = Object.entries(shopSets);
  if (entries.length === 0) return;

  const setsHtml = entries.map(([key, set]) => {
    const owned = set.itemIds.filter(id => ownedIds.has(id)).length;
    const total = set.itemIds.length;
    const pct = Math.round((owned / total) * 100);
    const complete = owned === total;
    return `
      <div class="set-card${complete ? ' complete' : ''}">
        <div class="set-header">
          <span class="set-name">${escapeHtml(set.name)}</span>
          <span class="set-progress">${owned}/${total}</span>
        </div>
        <div class="set-bar"><div class="set-bar-fill" style="width:${pct}%"></div></div>
        <div class="set-bonus">${escapeHtml(set.setBonusLabel || '')}</div>
      </div>
    `;
  }).join('');

  let setsContainer = document.getElementById('sets-container');
  if (!setsContainer) {
    setsContainer = document.createElement('div');
    setsContainer.id = 'sets-container';
    const grid = document.getElementById('cosmetics-grid');
    grid.parentElement.appendChild(setsContainer);
  }
  setsContainer.innerHTML = '<h3 class="section-title">Cosmetic Sets</h3><div class="sets-grid">' + setsHtml + '</div>';
}

// ─── History ────────────────────────────────────────────────────────

function setupHistoryControls() {
  document.getElementById('history-type-filter').addEventListener('change', () => {
    historyPage = 1;
    loadHistory();
  });
  document.getElementById('history-prev').addEventListener('click', () => {
    if (historyPage > 1) { historyPage--; loadHistory(); }
  });
  document.getElementById('history-next').addEventListener('click', () => {
    historyPage++;
    loadHistory();
  });
}

async function loadHistory() {
  const list = document.getElementById('history-list');
  const type = document.getElementById('history-type-filter').value;
  const limit = 30;

  let url = `/api/me/history?page=${historyPage}&limit=${limit}`;
  if (type) url += `&event_type=${type}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (!data.ok || !data.entries || data.entries.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No history entries</div>';
      document.getElementById('history-prev').disabled = true;
      document.getElementById('history-next').disabled = true;
      document.getElementById('history-page-info').textContent = 'Page 1';
      return;
    }

    document.getElementById('history-page-info').textContent = `Page ${data.page || historyPage}`;
    document.getElementById('history-prev').disabled = historyPage <= 1;
    document.getElementById('history-next').disabled = data.entries.length < limit;

    list.innerHTML = data.entries.map(e => {
      const delta = e.coins_delta || 0;
      const deltaClass = delta > 0 ? 'positive' : delta < 0 ? 'negative' : 'neutral';
      const deltaStr = delta > 0 ? '+' + formatNumber(delta) : delta < 0 ? formatNumber(delta) : '0';
      const typeClass = e.event_type || 'command';

      return `
        <div class="history-entry">
          <span class="history-type ${typeClass}">${e.event_type || '?'}</span>
          <div class="history-detail">
            <div class="history-command">${escapeHtml(e.command || e.event_type || '')}</div>
            ${e.response ? `<div class="history-response">${escapeHtml(e.response)}</div>` : ''}
          </div>
          <span class="history-delta ${deltaClass}">${deltaStr}</span>
          <span class="history-time">${formatTime(e.created_at)}</span>
        </div>
      `;
    }).join('');
  } catch {
    list.innerHTML = '<div class="loading-placeholder">Failed to load history</div>';
  }
}

// ─── Searchle ───────────────────────────────────────────────────────

let portalUser = null;

async function loadSearchleStats() {
  const winsEl = document.getElementById('searchle-wins');
  const avgEl = document.getElementById('searchle-avg');
  const list = document.getElementById('searchle-history');
  // Guard: these elements may not exist in current HTML layout
  if (!winsEl && !avgEl && !list) { loadSearchleSPStats(); return; }

  try {
    const res = await fetch('/api/me/searchle');
    const data = await res.json();

    if (winsEl) winsEl.textContent = data.totalWins || 0;
    if (avgEl) avgEl.textContent = data.averageGuesses || '-';

    if (list) {
      if (!data.history || data.history.length === 0) {
        list.innerHTML = '<div class="loading-placeholder">No multiplayer wins yet</div>';
      } else {
        list.innerHTML = data.history.map(w => `
          <div class="searchle-entry">
            <div>
              <span class="searchle-word">${escapeHtml(w.word || '???')}</span>
              <span class="searchle-guesses">${w.guessCount || '?'} guesses</span>
            </div>
            <span class="searchle-date">${formatTime(w.wonAt || w.timestamp)}</span>
          </div>
        `).join('');
      }
    }
  } catch {
    if (winsEl) winsEl.textContent = '?';
    if (avgEl) avgEl.textContent = '?';
  }

  // Also load SP stats
  loadSearchleSPStats();
}

// ─── Searchle SP (Single Player) ────────────────────────────────────

async function loadSearchleSPStats() {
  var spWinsEl = document.getElementById('searchle-sp-wins');
  var spAvgEl = document.getElementById('searchle-sp-avg');
  var spList = document.getElementById('searchle-sp-history');
  if (!spWinsEl && !spAvgEl && !spList) return;
  try {
    const res = await fetch('/api/me/searchle-sp');
    const data = await res.json();

    if (spWinsEl) spWinsEl.textContent = data.totalWins || 0;
    if (spAvgEl) spAvgEl.textContent = data.averageGuesses || '-';

    if (!spList) return;
    if (!data.history || data.history.length === 0) {
      spList.innerHTML = '<div class="loading-placeholder">No single player wins yet</div>';
      return;
    }

    spList.innerHTML = data.history.map(w => `
      <div class="searchle-entry">
        <div>
          ${w.wordNumber ? `<span class="searchle-word-num">#${w.wordNumber}</span>` : ''}
          <span class="searchle-word">${escapeHtml(w.word || '???')}</span>
          <span class="searchle-guesses">${w.guessCount || '?'} guesses</span>
        </div>
        <span class="searchle-date">${formatTime(w.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    if (spWinsEl) spWinsEl.textContent = '?';
    if (spAvgEl) spAvgEl.textContent = '?';
  }
}

// ─── Word 500 ───────────────────────────────────────────────────────

async function loadWord500Stats() {
  try {
    const res = await fetch('/api/me/word500');
    const data = await res.json();

    document.getElementById('word500-wins').textContent = data.totalWins || 0;
    document.getElementById('word500-avg').textContent = data.averageGuesses || '-';

    const list = document.getElementById('word500-history');
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No Word 500 wins yet</div>';
      return;
    }

    list.innerHTML = data.history.map(w => `
      <div class="word500-entry">
        <div>
          <span class="word500-word">${escapeHtml(w.word || '???')}</span>
          <span class="word500-guesses">${w.guessCount || '?'} guesses</span>
        </div>
        <span class="word500-date">${formatTime(w.wonAt || w.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('word500-wins').textContent = '?';
    document.getElementById('word500-avg').textContent = '?';
  }
}

// ─── Word 500 Single Player (localStorage) ──────────────────────────

function loadWord500SPStats() {
  try {
    const raw = localStorage.getItem('word500sp_stats');
    if (!raw) {
      document.getElementById('word500sp-games').textContent = '0';
      document.getElementById('word500sp-winrate').textContent = '-';
      document.getElementById('word500sp-avg').textContent = '-';
      document.getElementById('word500sp-streak').textContent = '0';
      document.getElementById('word500sp-history').innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    const stats = JSON.parse(raw);
    const winRate = stats.totalGames > 0 ? Math.round((stats.totalWins / stats.totalGames) * 100) + '%' : '-';
    const avgGuesses = stats.totalWins > 0 ? (stats.totalGuesses / stats.totalWins).toFixed(1) : '-';

    document.getElementById('word500sp-games').textContent = stats.totalGames || 0;
    document.getElementById('word500sp-winrate').textContent = winRate;
    document.getElementById('word500sp-avg').textContent = avgGuesses;
    document.getElementById('word500sp-streak').textContent = stats.bestStreak || 0;

    const list = document.getElementById('word500sp-history');
    const history = (stats.history || []).slice(-20).reverse();

    if (history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    list.innerHTML = history.map(h => `
      <div class="word500-entry">
        <div>
          <span class="word500-word">${escapeHtml(h.word || '???')}</span>
          <span class="word500-guesses">${h.won ? (h.guessCount + ' guesses') : 'gave up'}</span>
        </div>
        <span class="word500-date">${formatTime(h.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('word500sp-games').textContent = '?';
    document.getElementById('word500sp-winrate').textContent = '?';
  }
}

// ─── Betwixt ─────────────────────────────────────────────────────

async function loadBetwixtStats() {
  try {
    const res = await fetch('/api/me/betwixt');
    const data = await res.json();

    document.getElementById('betwixt-wins').textContent = data.totalWins || 0;
    document.getElementById('betwixt-avg').textContent = data.averageGuesses || '-';

    const list = document.getElementById('betwixt-history');
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No Betwixt wins yet</div>';
      return;
    }

    list.innerHTML = data.history.map(w => `
      <div class="searchle-entry">
        <div>
          <span class="searchle-word">${escapeHtml(w.word || '???')}</span>
          <span class="searchle-guesses">${w.guessCount || '?'} guesses</span>
        </div>
        <span class="searchle-date">${formatTime(w.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('betwixt-wins').textContent = '?';
    document.getElementById('betwixt-avg').textContent = '?';
  }
}

// ─── Betwixt SP (localStorage) ────────────────────────────────────

function loadBetwixtSPStats() {
  try {
    const raw = localStorage.getItem('betwixt_sp_stats');
    if (!raw) {
      document.getElementById('betwixt-sp-games').textContent = '0';
      document.getElementById('betwixt-sp-winrate').textContent = '-';
      document.getElementById('betwixt-sp-avg').textContent = '-';
      document.getElementById('betwixt-sp-streak').textContent = '0';
      document.getElementById('betwixt-sp-history').innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    const stats = JSON.parse(raw);
    const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) + '%' : '-';
    const avgGuesses = stats.wins > 0 ? (stats.totalGuesses / stats.wins).toFixed(1) : '-';

    document.getElementById('betwixt-sp-games').textContent = stats.gamesPlayed || 0;
    document.getElementById('betwixt-sp-winrate').textContent = winRate;
    document.getElementById('betwixt-sp-avg').textContent = avgGuesses;
    document.getElementById('betwixt-sp-streak').textContent = stats.winStreak || 0;

    const list = document.getElementById('betwixt-sp-history');
    const history = (stats.history || []).slice(0, 10);

    if (history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    list.innerHTML = history.map(h => `
      <div class="word500-entry">
        <div>
          <span class="word500-word">${escapeHtml(h.word || '???')}</span>
          <span class="word500-guesses">${h.won ? (h.guessCount + ' guesses') : 'lost'}</span>
        </div>
        <span class="word500-date">${formatTime(h.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('betwixt-sp-games').textContent = '?';
    document.getElementById('betwixt-sp-winrate').textContent = '?';
  }
}

// ─── Wordle ─────────────────────────────────────────────────────────

async function loadWordleStats() {
  try {
    const res = await fetch('/api/me/wordle');
    const data = await res.json();

    document.getElementById('wordle-wins').textContent = data.totalWins || 0;
    document.getElementById('wordle-avg').textContent = data.averageGuesses || '-';

    const list = document.getElementById('wordle-history');
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No Wordle wins yet</div>';
      return;
    }

    list.innerHTML = data.history.map(w => `
      <div class="searchle-entry">
        <div>
          <span class="searchle-word">${escapeHtml(w.word || '???')}</span>
          <span class="searchle-guesses">${w.guessCount || '?'} guesses</span>
        </div>
        <span class="searchle-date">${formatTime(w.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('wordle-wins').textContent = '?';
    document.getElementById('wordle-avg').textContent = '?';
  }
}

// ─── Wordle SP (localStorage) ────────────────────────────────────────

function loadWordleSPStats() {
  try {
    const raw = localStorage.getItem('wordle_sp_stats');
    if (!raw) {
      document.getElementById('wordle-sp-games').textContent = '0';
      document.getElementById('wordle-sp-winrate').textContent = '-';
      document.getElementById('wordle-sp-avg').textContent = '-';
      document.getElementById('wordle-sp-streak').textContent = '0';
      document.getElementById('wordle-sp-history').innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    const stats = JSON.parse(raw);
    const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) + '%' : '-';
    const avgGuesses = stats.wins > 0 ? (stats.totalGuesses / stats.wins).toFixed(1) : '-';

    document.getElementById('wordle-sp-games').textContent = stats.gamesPlayed || 0;
    document.getElementById('wordle-sp-winrate').textContent = winRate;
    document.getElementById('wordle-sp-avg').textContent = avgGuesses;
    document.getElementById('wordle-sp-streak').textContent = stats.winStreak || 0;

    const list = document.getElementById('wordle-sp-history');
    const history = (stats.history || []).slice(0, 10);

    if (history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    list.innerHTML = history.map(h => `
      <div class="word500-entry">
        <div>
          <span class="word500-word">${escapeHtml(h.word || '???')}</span>
          <span class="word500-guesses">${h.won ? (h.guessCount + ' guesses') : 'lost'}</span>
        </div>
        <span class="word500-date">${formatTime(h.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('wordle-sp-games').textContent = '?';
    document.getElementById('wordle-sp-winrate').textContent = '?';
  }
}

// ─── PixeLetters ─────────────────────────────────────────────────────

async function loadPixeLettersStats() {
  try {
    const res = await fetch('/api/me/pixeletters');
    const data = await res.json();

    document.getElementById('pixeletters-wins').textContent = data.totalWins || 0;
    document.getElementById('pixeletters-avg').textContent = data.averageGuesses || '-';

    const list = document.getElementById('pixeletters-history');
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No PixeLetters wins yet</div>';
      return;
    }

    list.innerHTML = data.history.map(w => `
      <div class="searchle-entry">
        <div>
          <span class="searchle-word">${escapeHtml(w.word || '???')}</span>
          <span class="searchle-guesses">${w.guessCount || '?'} guesses</span>
        </div>
        <span class="searchle-date">${formatTime(w.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('pixeletters-wins').textContent = '?';
    document.getElementById('pixeletters-avg').textContent = '?';
  }
}

function loadPixeLettersSPStats() {
  try {
    const raw = localStorage.getItem('pixeletters_sp_stats');
    if (!raw) {
      document.getElementById('pixeletters-sp-games').textContent = '0';
      document.getElementById('pixeletters-sp-winrate').textContent = '-';
      document.getElementById('pixeletters-sp-avg').textContent = '-';
      document.getElementById('pixeletters-sp-streak').textContent = '0';
      document.getElementById('pixeletters-sp-history').innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    const stats = JSON.parse(raw);
    const winRate = stats.gamesPlayed > 0 ? Math.round((stats.wins / stats.gamesPlayed) * 100) + '%' : '-';
    const avgGuesses = stats.wins > 0 ? (stats.totalGuesses / stats.wins).toFixed(1) : '-';

    document.getElementById('pixeletters-sp-games').textContent = stats.gamesPlayed || 0;
    document.getElementById('pixeletters-sp-winrate').textContent = winRate;
    document.getElementById('pixeletters-sp-avg').textContent = avgGuesses;
    document.getElementById('pixeletters-sp-streak').textContent = stats.bestStreak || 0;

    const list = document.getElementById('pixeletters-sp-history');
    const history = (stats.history || []).slice(0, 10);

    if (history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    list.innerHTML = history.map(h => `
      <div class="word500-entry">
        <div>
          <span class="word500-word">${escapeHtml(h.word || '???')}</span>
          <span class="word500-guesses">${h.won ? (h.guessCount + ' guesses') : 'lost'}</span>
        </div>
        <span class="word500-date">${formatTime(h.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('pixeletters-sp-games').textContent = '?';
    document.getElementById('pixeletters-sp-winrate').textContent = '?';
  }
}

// ─── Squaredle Stats ──────────────────────────────────────────────
async function loadSquaredleStats() {
  try {
    const res = await fetch('/api/me/squaredle');
    const data = await res.json();

    document.getElementById('squaredle-words').textContent = data.totalWordsFound || 0;
    document.getElementById('squaredle-games').textContent = data.gamesParticipated || 0;

    const list = document.getElementById('squaredle-history');
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No Squaredle games yet</div>';
      return;
    }

    list.innerHTML = data.history.map(w => `
      <div class="searchle-entry">
        <div>
          <span class="searchle-word">${w.gridSize || '4x4'}</span>
          <span class="searchle-guesses">${w.wordsFound || 0} words</span>
        </div>
        <span class="searchle-date">${formatTime(w.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('squaredle-words').textContent = '?';
    document.getElementById('squaredle-games').textContent = '?';
  }
}

function loadSquardeleSPStats() {
  try {
    const raw = localStorage.getItem('squaredle_sp_stats');
    if (!raw) {
      document.getElementById('squaredle-sp-games').textContent = '0';
      document.getElementById('squaredle-sp-completed').textContent = '0';
      document.getElementById('squaredle-sp-words').textContent = '0';
      document.getElementById('squaredle-sp-best').textContent = '-';
      document.getElementById('squaredle-sp-history').innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    const stats = JSON.parse(raw);
    document.getElementById('squaredle-sp-games').textContent = stats.gamesPlayed || 0;
    document.getElementById('squaredle-sp-completed').textContent = stats.gamesCompleted || 0;
    document.getElementById('squaredle-sp-words').textContent = stats.totalWordsFound || 0;
    document.getElementById('squaredle-sp-best').textContent = (stats.bestCompletion || 0) + '%';

    const list = document.getElementById('squaredle-sp-history');
    const history = (stats.history || []).slice(0, 10);

    if (history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    list.innerHTML = history.map(h => `
      <div class="searchle-entry">
        <div>
          <span class="searchle-word">${h.gridSize || '4x4'}</span>
          <span class="searchle-guesses">${h.wordsFound}/${h.totalWords} (${h.percentage}%)</span>
        </div>
        <span class="searchle-date">${formatTime(h.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('squaredle-sp-games').textContent = '?';
  }
}

// ─── Spelling Bee Stats ──────────────────────────────────────────────
async function loadSpellingBeeStats() {
  try {
    const res = await fetch('/api/me/spellingbee');
    const data = await res.json();

    document.getElementById('spellingbee-words').textContent = data.totalWordsFound || 0;
    document.getElementById('spellingbee-games').textContent = data.gamesParticipated || 0;

    const list = document.getElementById('spellingbee-history');
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No Spelling Bee games yet</div>';
      return;
    }

    list.innerHTML = data.history.map(w => `
      <div class="searchle-entry">
        <div>
          <span class="searchle-word">${w.puzzleName || w.letters || 'Game'}</span>
          <span class="searchle-guesses">${w.wordsFound || 0} words</span>
        </div>
        <span class="searchle-date">${formatTime(w.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('spellingbee-words').textContent = '?';
    document.getElementById('spellingbee-games').textContent = '?';
  }
}

function loadSpellingBeeSPStats() {
  try {
    const raw = localStorage.getItem('spellingbee_sp_stats');
    if (!raw) {
      document.getElementById('spellingbee-sp-games').textContent = '0';
      document.getElementById('spellingbee-sp-completed').textContent = '0';
      document.getElementById('spellingbee-sp-words').textContent = '0';
      document.getElementById('spellingbee-sp-best').textContent = '-';
      document.getElementById('spellingbee-sp-history').innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    const stats = JSON.parse(raw);
    document.getElementById('spellingbee-sp-games').textContent = stats.gamesPlayed || 0;
    document.getElementById('spellingbee-sp-completed').textContent = stats.gamesCompleted || 0;
    document.getElementById('spellingbee-sp-words').textContent = stats.totalWordsFound || 0;
    document.getElementById('spellingbee-sp-best').textContent = (stats.bestCompletion || 0) + '%';

    const list = document.getElementById('spellingbee-sp-history');
    const history = (stats.history || []).slice(0, 10);

    if (history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    list.innerHTML = history.map(h => `
      <div class="searchle-entry">
        <div>
          <span class="searchle-word">Puzzle #${h.puzzleId || '?'}</span>
          <span class="searchle-guesses">${h.wordsFound || 0} words (${h.score || 0} pts)</span>
        </div>
        <span class="searchle-date">${formatTime(h.timestamp)}</span>
      </div>
    `).join('');
  } catch {
    document.getElementById('spellingbee-sp-games').textContent = '?';
  }
}

// ─── Live Chat ──────────────────────────────────────────────────────

function connectChat() {
  if (socket) return;
  socket = io({ transports: ['websocket', 'polling'] });

  socket.on('chat-message', (msg) => {
    if (!msg || msg.isSystem) return;
    addChatMessage(msg);
  });

  socket.on('disconnect', () => {
    addChatSystem('Disconnected from server...');
  });

  socket.on('connect', () => {
    // Clear "disconnected" message on reconnect
  });

  // Wire up chat input
  const chatInput = document.getElementById('chat-input');
  const chatSend = document.getElementById('chat-send');
  if (chatInput && chatSend) {
    chatSend.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') sendChatMessage();
    });
  }
}

let chatCooldown = false;

function sendChatMessage() {
  if (!socket || !portalUser || chatCooldown) return;
  const input = document.getElementById('chat-input');
  const text = (input.value || '').trim();
  if (!text) return;

  socket.emit('mobile-message', {
    user: {
      id: portalUser.id,
      username: portalUser.username,
      displayName: portalUser.globalName || portalUser.username,
      profilePic: portalUser.avatar || null
    },
    message: text
  });

  input.value = '';
  chatCooldown = true;
  document.getElementById('chat-send').disabled = true;
  setTimeout(() => {
    chatCooldown = false;
    document.getElementById('chat-send').disabled = false;
  }, 500);
}

function addChatMessage(msg) {
  const feed = document.getElementById('chat-feed');
  // Remove empty placeholder
  const empty = feed.querySelector('.chat-empty');
  if (empty) empty.remove();

  const platform = msg.platform || 'unknown';
  const platClass = 'plat-' + platform;
  const username = msg.user?.displayName || msg.user?.username || 'Unknown';
  const initial = escapeHtml(username).charAt(0).toUpperCase();
  const pfp = msg.user?.profilePic;

  let avatarHtml;
  if (pfp) {
    const fallbackEl = `this.replaceWith(Object.assign(document.createElement('span'),{className:'chat-avatar-fallback ${platClass}',textContent:'${initial}'}))`;
    avatarHtml = `<img class="chat-avatar" src="${escapeHtml(pfp)}" alt="" loading="lazy" onerror="${fallbackEl}">`;
  } else {
    avatarHtml = `<span class="chat-avatar-fallback ${platClass}">${initial}</span>`;
  }

  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.innerHTML = `${avatarHtml}<span class="chat-username ${platClass}">${escapeHtml(username)}:</span><span class="chat-text">${escapeHtml(msg.message || '')}</span>`;
  feed.appendChild(div);

  chatMessages.push(div);
  if (chatMessages.length > MAX_CHAT) {
    const old = chatMessages.shift();
    old.remove();
  }

  // Auto-scroll if near bottom
  const isNearBottom = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 80;
  if (isNearBottom) {
    feed.scrollTop = feed.scrollHeight;
  }
}

function addChatSystem(text) {
  const feed = document.getElementById('chat-feed');
  const div = document.createElement('div');
  div.className = 'chat-msg';
  div.style.color = '#888';
  div.style.fontStyle = 'italic';
  div.textContent = text;
  feed.appendChild(div);
}

// ===== Live Games Dashboard =====
var liveGamesInterval = null;

async function loadLiveGames() {
  try {
    var res = await fetch('/api/games/live');
    var data = await res.json();
    cachedLiveGames = data.games || [];
    // Update games grid with live data, daily/weekly trackers if overview tab is active
    var overviewTab = document.getElementById('tab-overview');
    if (overviewTab && overviewTab.classList.contains('active')) {
      renderDailyTracker();
      renderWeeklyTracker();
      renderGamesGrid();
    }
  } catch (e) {
    // silently fail
  }
}

// renderLiveGames and buildLiveCardHTML removed — dead code (live data now rendered in renderGamesGrid)

function formatElapsedTime(secs) {
  if (secs < 0) secs = 0;
  var m = Math.floor(secs / 60);
  var s = secs % 60;
  return m + ':' + (s < 10 ? '0' : '') + s;
}

function startLivePolling() {
  loadLiveGames();
  if (liveGamesInterval) clearInterval(liveGamesInterval);
  liveGamesInterval = setInterval(loadLiveGames, 5000);
}

// ─── Utilities ──────────────────────────────────────────────────────

function formatNumber(n) {
  if (n == null) return '-';
  n = Number(n);
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e4) return (n / 1e3).toFixed(1) + 'K';
  return n.toLocaleString();
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;

  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';

  return d.toLocaleDateString();
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function camelToKebab(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

// ==================== PIZZA SHOP ====================

let pizzaData = null;
let pizzaSubTab = 'upgrades';
let pizzaCollectTimer = null;
let pizzaLoaded = false;

function openPizzaShop() {
  // Programmatically switch to pizza section without a nav tab
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
  document.getElementById('tab-pizza').classList.add('active');
  loadPizzaShop();
}

async function loadPizzaShop() {
  try {
    const r = await fetch('/api/me/pizza');
    const data = await r.json();
    pizzaData = data;
    pizzaLoaded = true;
    renderPizzaShop();
  } catch {
    document.getElementById('pizza-container').innerHTML =
      '<div class="pizza-no-shop"><div class="pizza-no-shop-emoji">&#x26A0;&#xFE0F;</div>' +
      '<div class="pizza-no-shop-title">Could not load Pizza Shop</div>' +
      '<div class="pizza-no-shop-desc">Game server may be offline. Try again later.</div></div>';
  }
}

function renderPizzaShop() {
  var c = document.getElementById('pizza-container');
  if (!c || !pizzaData) return;

  if (!pizzaData.ok || !pizzaData.hasShop) {
    c.innerHTML =
      '<div class="pizza-no-shop">' +
      '<div class="pizza-no-shop-emoji">&#x1F355;</div>' +
      '<div class="pizza-no-shop-title">Pizza Shop Not Unlocked</div>' +
      '<div class="pizza-no-shop-desc">Purchase the Pizza Shop business (2,000,000 XP) from the Businesses tab to unlock your very own pizza shop!</div>' +
      '</div>';
    return;
  }

  var s = pizzaData.shop;
  var theme = (pizzaData.customizations && pizzaData.customizations.theme) || 'classic';
  var prestige = s.prestigeLevel || 0;
  var xpPct = s.xpNeeded > 0 ? Math.min(100, Math.floor((s.shopXp / s.xpNeeded) * 100)) : 0;

  // Calculate live pending income for display
  var pendingCoins = (pizzaData.pending && pizzaData.pending.pizzaCoins) || 0;
  var incPerSec = s.incomePerSecond || 0;

  c.setAttribute('data-theme', theme);
  c.setAttribute('data-prestige', String(prestige));

  var html = '';

  // Hero
  html += '<div class="pizza-hero"><div class="pizza-hero-bg"></div><div class="pizza-hero-content">';
  html += '<h2 class="pizza-hero-title">&#x1F355; ' + escapeHtml(s.shopName) + '</h2>';
  html += '<p class="pizza-hero-sub">';
  if (prestige > 0) html += '&#x2B50; Prestige ' + prestige + ' &mdash; ' + escapeHtml(s.prestigeTier) + ' &bull; ';
  else html += escapeHtml(s.prestigeTier) + ' &bull; ';
  html += s.prestigeMultiplier + 'x Income Multiplier</p>';
  html += '<div class="pizza-hero-stats">';
  html += '<div class="pizza-hero-stat"><strong>Lv.' + s.shopLevel + '</strong>Shop Level</div>';
  html += '<div class="pizza-hero-stat"><strong>' + formatNumber(s.totalPizzasServed) + '</strong>Pizzas Served</div>';
  html += '<div class="pizza-hero-stat"><strong>' + formatNumber(s.totalCoinsEarned) + '</strong>XP Earned</div>';
  html += '<div class="pizza-hero-stat"><strong>' + formatNumber(Math.floor(s.pizzaCoins)) + '</strong>Pizza XP</div>';
  html += '</div>';
  // Level bar
  html += '<div class="pizza-level-bar"><div class="pizza-level-fill" style="width:' + xpPct + '%"></div>';
  html += '<div class="pizza-level-text">Lv.' + s.shopLevel + ' &mdash; ' + formatNumber(s.shopXp) + ' / ' + formatNumber(s.xpNeeded) + ' XP</div></div>';
  html += '</div></div>';

  // Income Panel
  html += '<div class="pizza-income-panel">';
  html += '<div class="pizza-income-info">&#x1F4B0; Income: <span class="pizza-income-val">' + formatIncome(incPerSec) + '/sec</span></div>';
  html += '<button class="pizza-collect-btn" onclick="pizzaCollect()" id="pizza-collect-btn">Collect: ' + formatNumber(Math.floor(pendingCoins)) + ' pizza XP</button>';
  html += '</div>';

  // Shop Visualization
  html += renderPizzaViz();

  // Sub-tabs
  html += '<div class="pizza-sub-tabs">';
  html += '<button class="pizza-sub-tab' + (pizzaSubTab === 'upgrades' ? ' active' : '') + '" onclick="switchPizzaSubTab(\'upgrades\')">&#x1F527; Upgrades</button>';
  html += '<button class="pizza-sub-tab' + (pizzaSubTab === 'prestige' ? ' active' : '') + '" onclick="switchPizzaSubTab(\'prestige\')">&#x2B50; Prestige</button>';
  html += '<button class="pizza-sub-tab' + (pizzaSubTab === 'customize' ? ' active' : '') + '" onclick="switchPizzaSubTab(\'customize\')">&#x1F3A8; Customize</button>';
  html += '<button class="pizza-sub-tab' + (pizzaSubTab === 'stats' ? ' active' : '') + '" onclick="switchPizzaSubTab(\'stats\')">&#x1F4CA; Stats</button>';
  html += '</div>';

  // Sub-tab content
  if (pizzaSubTab === 'upgrades') html += renderPizzaUpgrades();
  else if (pizzaSubTab === 'prestige') html += renderPizzaPrestige();
  else if (pizzaSubTab === 'customize') html += renderPizzaCustomize();
  else if (pizzaSubTab === 'stats') html += renderPizzaStats();

  c.innerHTML = html;

  // Start auto-update timer for collect button
  startPizzaCollectTimer();
}

function renderPizzaViz() {
  if (!pizzaData || !pizzaData.hasShop) return '';
  var u = pizzaData.upgrades || {};
  var c = pizzaData.customizations || {};
  var ovenLevel = u.oven || 0;
  var staffLevel = u.staff || 0;
  var seatingLevel = u.seating || 0;
  var marketingLevel = u.marketing || 0;
  var capacityLevel = u.capacity || 0;

  var counterStyle = c.counter || 'basic';
  var furnitureStyle = c.furniture || 'plastic';
  var signStyle = c.sign || 'basic';
  var uniformStyle = c.uniform || 'plain';
  var musicStyle = c.music || 'none';

  // Oven speed for animation
  var cycleSeconds = Math.max(1, 5 - ovenLevel * 0.15);

  // Uniform emojis
  var uniformEmojis = { plain: '&#x1F9D1;', striped: '&#x1F468;&#x200D;&#x1F373;', chef: '&#x1F468;&#x200D;&#x1F373;', custom: '&#x1F9D1;&#x200D;&#x1F52C;' };
  var staffEmoji = uniformEmojis[uniformStyle] || uniformEmojis.plain;

  var html = '<div class="pizza-shop-viz" data-counter="' + counterStyle + '" data-furniture="' + furnitureStyle + '" data-sign="' + signStyle + '" data-uniform="' + uniformStyle + '">';

  // Shop sign
  var signNames = { basic: 'PIZZA', neon: 'PIZZA', vintage: 'PIZZERIA', marquee: 'PIZZA' };
  var shopName = (pizzaData.shop && pizzaData.shop.shopName) ? escapeHtml(pizzaData.shop.shopName) : (signNames[signStyle] || 'PIZZA');
  html += '<div class="pizza-sign pizza-sign-' + signStyle + '">' + shopName + '</div>';

  // Music indicator
  if (musicStyle !== 'none') {
    var musicLabels = { jazz: 'Jazz', italian: 'Italian', lofi: 'Lo-fi', pop: 'Pop', classical: 'Classical' };
    html += '<div class="pizza-music-indicator">&#x1F3B5; ' + (musicLabels[musicStyle] || musicStyle) + '</div>';
  }

  html += '<div class="pizza-shop-scene">';

  // Kitchen section
  html += '<div class="pizza-kitchen">';
  var ovenCount = 1 + Math.floor(capacityLevel / 5);
  for (var i = 0; i < Math.min(ovenCount, 4); i++) {
    html += '<div class="pizza-oven" style="--oven-speed:' + cycleSeconds + 's">';
    html += '<div class="pizza-oven-glow"></div>&#x1F355;</div>';
  }
  html += '</div>';

  // Counter section with staff
  html += '<div class="pizza-counter">';
  var staffCount = 1 + Math.floor(staffLevel / 4);
  for (var i = 0; i < Math.min(staffCount, 5); i++) {
    html += '<div class="pizza-staff-icon">' + staffEmoji + '</div>';
  }
  html += '</div>';

  // Seating section with customers
  html += '<div class="pizza-seating">';
  var customerCount = 2 + seatingLevel * 2;
  for (var i = 0; i < Math.min(customerCount, 20); i++) {
    var delay = (i * 0.3) % 2;
    html += '<div class="pizza-customer" style="--delay:' + delay + 's">&#x1F60B;</div>';
  }
  html += '</div>';

  // Queue dots
  html += '<div class="pizza-queue">';
  var queueDots = Math.min(8, 2 + Math.floor(marketingLevel / 3));
  for (var i = 0; i < queueDots; i++) {
    html += '<div class="pizza-queue-dot" style="--delay:' + (i * 0.2) + 's"></div>';
  }
  html += '</div>';

  html += '</div>'; // scene
  html += '<div class="pizza-viz-labels">';
  html += '<span>Kitchen (' + ovenCount + ' oven' + (ovenCount > 1 ? 's' : '') + ')</span>';
  html += '<span>Staff (' + staffCount + ')</span>';
  html += '<span>Customers (' + customerCount + ')</span>';
  html += '</div>';
  html += '</div>';
  return html;
}

function renderPizzaUpgrades() {
  if (!pizzaData || !pizzaData.availableUpgrades) return '';
  var html = '<div class="pizza-upgrade-grid">';
  var au = pizzaData.availableUpgrades;
  for (var key in au) {
    var def = au[key];
    var isMaxed = def.maxed;
    var pct = Math.floor((def.currentLevel / def.maxLevel) * 100);
    var preview = def.effectPreview || {};
    html += '<div class="pizza-upgrade-card' + (isMaxed ? ' maxed' : '') + '">';
    html += '<div class="pizza-upgrade-header">';
    html += '<span class="pizza-upgrade-emoji">' + def.emoji + '</span>';
    html += '<span class="pizza-upgrade-name">' + escapeHtml(def.name) + '</span>';
    html += '<span class="pizza-upgrade-level">Lv.' + def.currentLevel + '/' + def.maxLevel + '</span>';
    html += '</div>';
    // Progress bar
    html += '<div class="pizza-upgrade-progress"><div class="pizza-upgrade-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="pizza-upgrade-desc">' + escapeHtml(def.desc) + '</div>';
    // Effect preview: current and next
    if (preview.current) {
      html += '<div class="pizza-upgrade-effect-preview">';
      html += '<span class="pizza-effect-current">' + escapeHtml(preview.current) + '</span>';
      if (preview.next && !isMaxed) {
        html += '<span class="pizza-effect-arrow">&rarr;</span>';
        html += '<span class="pizza-effect-next">' + escapeHtml(preview.next) + '</span>';
      }
      html += '</div>';
    }
    if (isMaxed) {
      html += '<div class="pizza-upgrade-btns"><button class="pizza-upgrade-btn maxed-btn" disabled>MAX LEVEL</button></div>';
    } else {
      var canAfford = (pizzaData.shop.pizzaCoins || 0) >= def.cost;
      var maxBuy = def.maxBuy || { levels: 0, totalCost: 0 };
      html += '<div class="pizza-upgrade-btns">';
      html += '<button class="pizza-upgrade-btn pizza-buy-one" onclick="pizzaUpgrade(\'' + key + '\')"' + (canAfford ? '' : ' disabled') + '>';
      html += '+1 &bull; ' + formatNumber(def.cost) + '</button>';
      html += '<button class="pizza-upgrade-btn pizza-buy-max" onclick="pizzaUpgradeMax(\'' + key + '\')"' + (maxBuy.levels > 0 ? '' : ' disabled') + '>';
      html += 'MAX' + (maxBuy.levels > 0 ? ' (+' + maxBuy.levels + ')' : '') + '</button>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderPizzaPrestige() {
  if (!pizzaData || !pizzaData.shop) return '';
  var s = pizzaData.shop;
  var html = '<div class="pizza-prestige-panel">';
  html += '<div class="pizza-prestige-header">';
  html += '<span class="pizza-prestige-tier">' + escapeHtml(s.prestigeTier) + '</span>';
  html += '<span class="pizza-prestige-mult">' + s.prestigeMultiplier + 'x income</span>';
  html += '</div>';

  // Tier cards
  var tiers = [
    { level: 0, name: 'Amateur', mult: '1x', unlocks: 'Base shop' },
    { level: 1, name: 'Professional', mult: '2x', unlocks: 'Counter styles, uniforms' },
    { level: 2, name: 'Gourmet', mult: '3x', unlocks: 'Specialty menu, decorations' },
    { level: 3, name: 'Master', mult: '5x', unlocks: 'Premium furniture, neon' },
    { level: 4, name: 'Legendary', mult: '8x', unlocks: 'Gold accents, VIP lounge' }
  ];

  html += '<div class="pizza-prestige-tiers-list">';
  for (var i = 0; i < tiers.length; i++) {
    var t = tiers[i];
    var isCurrent = s.prestigeLevel === t.level;
    var isLocked = s.prestigeLevel < t.level;
    html += '<div class="pizza-prestige-tier-card' + (isCurrent ? ' current' : '') + (isLocked ? ' locked' : '') + '">';
    html += '<div class="pizza-prestige-tier-name">' + t.name + '</div>';
    html += '<div class="pizza-prestige-tier-mult">' + t.mult + ' income</div>';
    html += '<div class="pizza-prestige-tier-unlock">' + t.unlocks + '</div>';
    html += '</div>';
  }
  html += '</div>';

  // Prestige button
  var canPrestige = s.shopLevel >= 100;
  html += '<div style="text-align:center;margin-top:16px">';
  if (canPrestige) {
    html += '<p style="color:var(--success);margin-bottom:12px">&#x2728; You\'ve reached Level 100! Prestige to advance your tier.</p>';
    html += '<button class="pizza-prestige-btn" onclick="pizzaPrestige()">Prestige Now</button>';
    html += '<p style="color:var(--text-dim);font-size:0.8rem;margin-top:8px">This will reset your shop level, XP, pizza XP, and upgrades.</p>';
  } else {
    html += '<p style="color:var(--text-dim)">Reach Shop Level 100 to unlock Prestige (' + s.shopLevel + '/100)</p>';
    html += '<button class="pizza-prestige-btn" disabled>Prestige (Lv.100 required)</button>';
  }
  html += '</div>';
  html += '</div>';
  return html;
}

function renderPizzaCustomize() {
  if (!pizzaData) return '';
  var ac = pizzaData.availableCustomizations || {};
  var current = pizzaData.customizations || {};

  var html = '';

  // Shop name
  html += '<div class="pizza-name-input-row">';
  html += '<input class="pizza-name-input" id="pizza-name-input" maxlength="24" placeholder="Shop name..." value="' + escapeHtml(pizzaData.shop.shopName) + '">';
  html += '<button class="pizza-name-btn" onclick="pizzaRename()">Rename</button>';
  html += '</div>';

  html += '<div class="pizza-customize-panel">';
  for (var cat in ac) {
    var catDef = ac[cat];
    var currentVal = current[cat] || catDef.default;
    html += '<div class="pizza-customize-group">';
    html += '<div class="pizza-customize-group-title">' + escapeHtml(catDef.name) + '</div>';
    html += '<div class="pizza-customize-options">';
    for (var i = 0; i < catDef.options.length; i++) {
      var opt = catDef.options[i];
      var isSelected = opt.id === currentVal;
      var isLocked = opt.locked;
      html += '<div class="pizza-customize-option' + (isSelected ? ' selected' : '') + (isLocked ? ' locked' : '') + '"';
      if (!isLocked) html += ' onclick="pizzaCustomize(\'' + cat + '\',\'' + opt.id + '\')"';
      html += '>';
      html += escapeHtml(opt.name);
      if (isLocked) html += '<span class="pizza-customize-lock">&#x1F512; Prestige ' + opt.minPrestige + '</span>';
      if (isSelected) html += '<span style="margin-left:auto;color:var(--success)">&#x2714;</span>';
      html += '</div>';
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function renderPizzaStats() {
  if (!pizzaData || !pizzaData.shop) return '';
  var s = pizzaData.shop;
  var u = pizzaData.upgrades || {};
  var totalUpgradeLevels = 0;
  for (var k in u) totalUpgradeLevels += u[k];

  var html = '<div class="pizza-stats-panel"><div class="pizza-stats-grid">';
  html += '<div class="pizza-stat-item"><span class="pizza-stat-value">' + formatNumber(s.totalPizzasServed) + '</span><span class="pizza-stat-label">Pizzas Served</span></div>';
  html += '<div class="pizza-stat-item"><span class="pizza-stat-value">' + formatNumber(s.totalCoinsEarned) + '</span><span class="pizza-stat-label">Total XP Earned</span></div>';
  html += '<div class="pizza-stat-item"><span class="pizza-stat-value">Lv.' + s.shopLevel + '</span><span class="pizza-stat-label">Shop Level</span></div>';
  html += '<div class="pizza-stat-item"><span class="pizza-stat-value">' + s.prestigeLevel + '</span><span class="pizza-stat-label">Prestige Level</span></div>';
  html += '<div class="pizza-stat-item"><span class="pizza-stat-value">' + s.prestigeMultiplier + 'x</span><span class="pizza-stat-label">Income Multiplier</span></div>';
  html += '<div class="pizza-stat-item"><span class="pizza-stat-value">' + totalUpgradeLevels + '</span><span class="pizza-stat-label">Total Upgrade Levels</span></div>';
  html += '<div class="pizza-stat-item"><span class="pizza-stat-value">' + formatIncome(s.incomePerSecond) + '</span><span class="pizza-stat-label">Income/sec</span></div>';
  html += '<div class="pizza-stat-item"><span class="pizza-stat-value">' + formatNumber(Math.floor(s.pizzaCoins)) + '</span><span class="pizza-stat-label">Pizza XP</span></div>';
  html += '</div></div>';
  return html;
}

function switchPizzaSubTab(tab) {
  pizzaSubTab = tab;
  renderPizzaShop();
}

function startPizzaCollectTimer() {
  if (pizzaCollectTimer) clearInterval(pizzaCollectTimer);
  pizzaCollectTimer = setInterval(function() {
    if (!pizzaData || !pizzaData.hasShop) return;
    var btn = document.getElementById('pizza-collect-btn');
    if (!btn) { clearInterval(pizzaCollectTimer); return; }
    // Estimate accumulated coins based on income rate
    var incPerSec = pizzaData.shop.incomePerSecond || 0;
    var lastT = pizzaData.shop.lastCollectedAt;
    var elapsed = 0;
    if (lastT) {
      var ts = lastT.includes('T') || lastT.includes('Z') ? new Date(lastT).getTime() : new Date(lastT.replace(' ', 'T') + 'Z').getTime();
      elapsed = Math.max(0, (Date.now() - ts) / 1000);
    }
    // Delivery bonus: +15% collection bonus per level
    var deliveryLevel = (pizzaData.upgrades && pizzaData.upgrades.delivery) || 0;
    var deliveryBonus = 1 + (deliveryLevel * 0.15);
    var accumulated = Math.floor(incPerSec * elapsed * deliveryBonus);
    btn.textContent = 'Collect: ' + formatNumber(Math.floor(accumulated)) + ' pizza XP';
  }, 1000);
}

async function pizzaCollect() {
  var btn = document.getElementById('pizza-collect-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Collecting...'; }
  try {
    var r = await fetch('/api/me/pizza/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    var data = await r.json();
    if (data.ok) {
      var msg = '+' + formatNumber(data.collected) + ' pizza XP';
      if (data.realCoinBonus > 0) msg += ' (+' + formatNumber(data.realCoinBonus) + ' real XP bonus)';
      showToast(msg, 'success');
      // Update profile coins in header (from real coin bonus)
      if (data.realCoinBonus > 0 && typeof profile !== 'undefined' && profile && profile.profile) {
        profile.profile.coins = data.newBalance;
        var heroCoins = document.getElementById('ov-hero-coin-val');
        if (heroCoins) heroCoins.textContent = formatNumber(data.newBalance);
      }
      loadPizzaShop(); // Refresh state
    } else {
      showToast(data.message || 'Failed to collect', 'error');
    }
  } catch {
    showToast('Failed to collect income', 'error');
  }
  if (btn) btn.disabled = false;
}

async function pizzaUpgrade(upgradeType) {
  try {
    var r = await fetch('/api/me/pizza/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType: upgradeType })
    });
    var data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      loadPizzaShop();
    } else {
      showToast(data.message || 'Upgrade failed', 'error');
    }
  } catch {
    showToast('Failed to upgrade', 'error');
  }
}

async function pizzaUpgradeMax(upgradeType) {
  try {
    var r = await fetch('/api/me/pizza/upgrade-max', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType: upgradeType })
    });
    var data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      loadPizzaShop();
    } else {
      showToast(data.message || 'Max upgrade failed', 'error');
    }
  } catch {
    showToast('Failed to max upgrade', 'error');
  }
}

async function pizzaPrestige() {
  if (!confirm('Are you sure you want to prestige? This will reset your shop level, XP, pizza XP, and all upgrades.')) return;
  try {
    var r = await fetch('/api/me/pizza/prestige', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    var data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      loadPizzaShop();
    } else {
      showToast(data.message || 'Prestige failed', 'error');
    }
  } catch {
    showToast('Failed to prestige', 'error');
  }
}

async function pizzaCustomize(category, value) {
  try {
    var r = await fetch('/api/me/pizza/customize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: category, value: value })
    });
    var data = await r.json();
    if (data.ok) {
      showToast('Customization updated!', 'success');
      // Update local state immediately for responsive feel
      if (pizzaData && pizzaData.customizations) {
        pizzaData.customizations[category] = value;
      }
      renderPizzaShop();
    } else {
      showToast(data.message || 'Customization failed', 'error');
    }
  } catch {
    showToast('Failed to customize', 'error');
  }
}

async function pizzaRename() {
  var input = document.getElementById('pizza-name-input');
  if (!input) return;
  var name = input.value.trim();
  if (!name) { showToast('Enter a shop name', 'error'); return; }
  try {
    var r = await fetch('/api/me/pizza/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    });
    var data = await r.json();
    if (data.ok) {
      showToast('Shop renamed to "' + escapeHtml(data.shopName) + '"!', 'success');
      if (pizzaData && pizzaData.shop) pizzaData.shop.shopName = data.shopName;
      renderPizzaShop();
    } else {
      showToast(data.message || 'Rename failed', 'error');
    }
  } catch {
    showToast('Failed to rename', 'error');
  }
}

// Check if player owns pizza business and show/hide tab accordingly
// checkPizzaTabVisibility removed — pizza shop is accessed via Businesses tab only

// ==================== NEWSPAPER ROUTE ====================

let newspaperData = null;
let newspaperSubTab = 'upgrades';
let newspaperCollectTimer = null;
let newspaperLoaded = false;

function openNewspaperRoute() {
  switchToTab('newspaper');
}

async function loadNewspaperRoute() {
  try {
    const r = await fetch('/api/me/newspaper');
    const data = await r.json();
    newspaperData = data;
    newspaperLoaded = true;
    renderNewspaperRoute();
  } catch {
    document.getElementById('newspaper-container').innerHTML =
      '<div class="news-no-route"><div class="news-no-route-emoji">&#x26A0;&#xFE0F;</div>' +
      '<div class="news-no-route-title">Could not load Newspaper Route</div>' +
      '<div class="news-no-route-desc">Game server may be offline. Try again later.</div></div>';
  }
}

function renderNewspaperRoute() {
  var c = document.getElementById('newspaper-container');
  if (!c || !newspaperData) return;

  if (!newspaperData.ok || !newspaperData.hasRoute) {
    c.innerHTML =
      '<div class="news-no-route">' +
      '<div class="news-no-route-emoji">&#x1F5DE;&#xFE0F;</div>' +
      '<div class="news-no-route-title">Newspaper Route Not Unlocked</div>' +
      '<div class="news-no-route-desc">Purchase the Newspaper Route business from the Businesses tab to start your paper delivery empire!</div>' +
      '</div>';
    return;
  }

  var s = newspaperData.route;
  var theme = (newspaperData.customizations && newspaperData.customizations.theme) || 'classic';
  var prestige = s.prestigeLevel || 0;
  var xpPct = s.xpNeeded > 0 ? Math.min(100, Math.floor((s.routeXp / s.xpNeeded) * 100)) : 0;

  var pendingXP = (newspaperData.pending && newspaperData.pending.xpEarned) || 0;
  var incPerSec = s.incomePerSecond || 0;

  c.setAttribute('data-theme', theme);
  c.setAttribute('data-prestige', String(prestige));

  var html = '';

  // Hero
  html += '<div class="news-hero"><div class="news-hero-bg"></div><div class="news-hero-content">';
  html += '<h2 class="news-hero-title">&#x1F5DE;&#xFE0F; ' + escapeHtml(s.routeName) + '</h2>';
  html += '<p class="news-hero-sub">';
  if (prestige > 0) html += '&#x2B50; Prestige ' + prestige + ' &mdash; ' + escapeHtml(s.prestigeTier) + ' &bull; ';
  else html += escapeHtml(s.prestigeTier) + ' &bull; ';
  html += s.prestigeMultiplier + 'x Income Multiplier</p>';
  html += '<div class="news-hero-stats">';
  html += '<div class="news-hero-stat"><strong>Lv.' + s.routeLevel + '</strong>Route Level</div>';
  html += '<div class="news-hero-stat"><strong>' + formatNumber(s.totalPapersDelivered) + '</strong>Papers Delivered</div>';
  html += '<div class="news-hero-stat"><strong>' + formatNumber(s.totalXpEarned) + '</strong>XP Earned</div>';
  html += '<div class="news-hero-stat"><strong>' + formatNumber(Math.floor(newspaperData.playerCoins)) + '</strong>Your XP</div>';
  html += '</div>';
  // Level bar
  html += '<div class="news-level-bar"><div class="news-level-fill" style="width:' + xpPct + '%"></div>';
  html += '<div class="news-level-text">Lv.' + s.routeLevel + ' &mdash; ' + formatNumber(s.routeXp) + ' / ' + formatNumber(s.xpNeeded) + ' Route XP</div></div>';
  html += '</div></div>';

  // Income Panel — key difference: earns real XP directly
  var collectCap = newspaperData.collectCap || 1000000;
  var capPct = Math.min(100, Math.floor((pendingXP / collectCap) * 100));
  var isCapped = pendingXP >= collectCap;
  html += '<div class="news-income-panel">';
  html += '<div class="news-income-info">&#x1F4B0; Earning: <span class="news-income-val">' + formatIncome(incPerSec) + ' XP/sec</span>';
  html += '<span class="news-income-note">(Pays real XP directly!)</span></div>';
  html += '<button class="news-collect-btn' + (isCapped ? ' news-collect-capped' : '') + '" onclick="newspaperCollect()" id="news-collect-btn">Collect: ' + formatNumber(Math.floor(pendingXP)) + ' XP</button>';
  html += '<div class="news-cap-bar"><div class="news-cap-fill' + (isCapped ? ' capped' : '') + '" id="news-cap-fill" style="width:' + capPct + '%"></div>';
  html += '<div class="news-cap-text" id="news-cap-text">' + formatNumber(Math.floor(pendingXP)) + ' / ' + formatNumber(collectCap) + ' XP cap</div></div>';
  html += '</div>';

  // Route Visualization
  html += renderNewspaperViz();

  // Sub-tabs
  html += '<div class="news-sub-tabs">';
  html += '<button class="news-sub-tab' + (newspaperSubTab === 'upgrades' ? ' active' : '') + '" onclick="switchNewspaperSubTab(\'upgrades\')">&#x1F527; Upgrades</button>';
  html += '<button class="news-sub-tab' + (newspaperSubTab === 'prestige' ? ' active' : '') + '" onclick="switchNewspaperSubTab(\'prestige\')">&#x2B50; Prestige</button>';
  html += '<button class="news-sub-tab' + (newspaperSubTab === 'customize' ? ' active' : '') + '" onclick="switchNewspaperSubTab(\'customize\')">&#x1F3A8; Customize</button>';
  html += '<button class="news-sub-tab' + (newspaperSubTab === 'stats' ? ' active' : '') + '" onclick="switchNewspaperSubTab(\'stats\')">&#x1F4CA; Stats</button>';
  html += '</div>';

  if (newspaperSubTab === 'upgrades') html += renderNewspaperUpgrades();
  else if (newspaperSubTab === 'prestige') html += renderNewspaperPrestige();
  else if (newspaperSubTab === 'customize') html += renderNewspaperCustomize();
  else if (newspaperSubTab === 'stats') html += renderNewspaperStats();

  c.innerHTML = html;
  startNewspaperCollectTimer();
}

function renderNewspaperViz() {
  if (!newspaperData || !newspaperData.hasRoute) return '';
  var u = newspaperData.upgrades || {};
  var cust = newspaperData.customizations || {};
  var bicycleLevel = u.bicycle || 0;
  var carrierLevel = u.carriers || 0;
  var subscriberLevel = u.subscribers || 0;
  var rackLevel = u.racks || 0;
  var headlineLevel = u.headlines || 0;

  var rackStyle = cust.rack || 'wood';
  var outfitStyle = cust.outfit || 'plain';
  var mastheadStyle = cust.masthead || 'simple';
  var musicStyle = cust.music || 'none';
  var fontStyle = cust.headline_font || 'standard';

  var routeSeconds = Math.max(1, 6 - bicycleLevel * 0.2);

  var html = '<div class="news-route-viz" data-rack="' + rackStyle + '" data-outfit="' + outfitStyle + '" data-masthead="' + mastheadStyle + '" data-font="' + fontStyle + '">';

  // Masthead (header sign)
  var routeName = (newspaperData.route && newspaperData.route.routeName) ? escapeHtml(newspaperData.route.routeName) : 'THE DAILY';
  html += '<div class="news-masthead news-masthead-' + mastheadStyle + '">' + routeName + '</div>';

  // Music indicator
  if (musicStyle !== 'none') {
    var musicLabels = { jazz: 'Jazz', radio: 'Radio', lofi: 'Lo-fi', newsroom: 'Newsroom' };
    html += '<div class="news-music-indicator">&#x1F3B5; ' + (musicLabels[musicStyle] || musicStyle) + '</div>';
  }

  html += '<div class="news-route-scene">';

  // Printing press section
  html += '<div class="news-press-area">';
  var pressCount = 1 + Math.floor(subscriberLevel / 6);
  for (var i = 0; i < Math.min(pressCount, 3); i++) {
    html += '<div class="news-press" style="--press-speed:' + routeSeconds + 's">';
    html += '<div class="news-press-glow"></div>&#x1F4F0;</div>';
  }
  html += '</div>';

  // Carrier section (delivery kids on bikes)
  html += '<div class="news-carrier-area">';
  var carrierCount = 1 + Math.floor(carrierLevel / 4);
  for (var i = 0; i < Math.min(carrierCount, 5); i++) {
    var delay = (i * 0.4) % 2;
    html += '<div class="news-carrier" style="--delay:' + delay + 's">&#x1F6B2;</div>';
  }
  html += '</div>';

  // Subscriber houses
  html += '<div class="news-subscriber-area">';
  var houseCount = 2 + subscriberLevel * 2;
  for (var i = 0; i < Math.min(houseCount, 16); i++) {
    var delay = (i * 0.25) % 2;
    html += '<div class="news-house" style="--delay:' + delay + 's">&#x1F3E0;</div>';
  }
  html += '</div>';

  // Newsstand racks
  html += '<div class="news-rack-area">';
  var rackCount = Math.min(6, 1 + Math.floor(rackLevel / 3));
  for (var i = 0; i < rackCount; i++) {
    html += '<div class="news-rack">&#x1F5DE;&#xFE0F;</div>';
  }
  html += '</div>';

  html += '</div>'; // scene
  html += '<div class="news-viz-labels">';
  html += '<span>Press (' + pressCount + ')</span>';
  html += '<span>Carriers (' + carrierCount + ')</span>';
  html += '<span>Subscribers (' + houseCount + ')</span>';
  html += '<span>Racks (' + rackCount + ')</span>';
  html += '</div>';
  html += '</div>';
  return html;
}

function renderNewspaperUpgrades() {
  if (!newspaperData || !newspaperData.availableUpgrades) return '';
  var html = '<div class="news-upgrade-grid">';
  var au = newspaperData.availableUpgrades;
  var playerCoins = newspaperData.playerCoins || 0;
  for (var key in au) {
    var def = au[key];
    var isMaxed = def.maxed;
    var pct = Math.floor((def.currentLevel / def.maxLevel) * 100);
    var preview = def.effectPreview || {};
    html += '<div class="news-upgrade-card' + (isMaxed ? ' maxed' : '') + '">';
    html += '<div class="news-upgrade-header">';
    html += '<span class="news-upgrade-emoji">' + def.emoji + '</span>';
    html += '<span class="news-upgrade-name">' + escapeHtml(def.name) + '</span>';
    html += '<span class="news-upgrade-level">Lv.' + def.currentLevel + '/' + def.maxLevel + '</span>';
    html += '</div>';
    html += '<div class="news-upgrade-progress"><div class="news-upgrade-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="news-upgrade-desc">' + escapeHtml(def.desc) + '</div>';
    if (preview.current) {
      html += '<div class="news-upgrade-effect-preview">';
      html += '<span class="news-effect-current">' + escapeHtml(preview.current) + '</span>';
      if (preview.next && !isMaxed) {
        html += '<span class="news-effect-arrow">&rarr;</span>';
        html += '<span class="news-effect-next">' + escapeHtml(preview.next) + '</span>';
      }
      html += '</div>';
    }
    if (isMaxed) {
      html += '<div class="news-upgrade-btns"><button class="news-upgrade-btn maxed-btn" disabled>MAX LEVEL</button></div>';
    } else {
      var canAfford = playerCoins >= def.cost;
      var maxBuy = def.maxBuy || { levels: 0, totalCost: 0 };
      html += '<div class="news-upgrade-btns">';
      html += '<button class="news-upgrade-btn news-buy-one" onclick="newspaperUpgrade(\'' + key + '\')"' + (canAfford ? '' : ' disabled') + '>';
      html += '+1 &bull; ' + formatNumber(def.cost) + ' XP</button>';
      html += '<button class="news-upgrade-btn news-buy-max" onclick="newspaperUpgradeMax(\'' + key + '\')"' + (maxBuy.levels > 0 ? '' : ' disabled') + '>';
      html += 'MAX' + (maxBuy.levels > 0 ? ' (+' + maxBuy.levels + ')' : '') + '</button>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderNewspaperPrestige() {
  if (!newspaperData || !newspaperData.route) return '';
  var s = newspaperData.route;
  var html = '<div class="news-prestige-panel">';
  html += '<div class="news-prestige-header">';
  html += '<span class="news-prestige-tier">' + escapeHtml(s.prestigeTier) + '</span>';
  html += '<span class="news-prestige-mult">' + s.prestigeMultiplier + 'x income</span>';
  html += '</div>';

  var tiers = [
    { level: 0, name: 'Paperboy', mult: '1x', unlocks: 'Base route', cap: 1000000 },
    { level: 1, name: 'Carrier', mult: '2x', unlocks: 'Rack styles, carrier outfits', cap: 5000000 },
    { level: 2, name: 'Editor', mult: '3x', unlocks: 'Headline fonts, decorations', cap: 25000000 },
    { level: 3, name: 'Publisher', mult: '5x', unlocks: 'Premium themes, mastheads', cap: 100000000 },
    { level: 4, name: 'Mogul', mult: '8x', unlocks: 'Gold accents, all options', cap: 500000000 }
  ];

  html += '<div class="news-prestige-tiers-list">';
  for (var i = 0; i < tiers.length; i++) {
    var t = tiers[i];
    var isCurrent = s.prestigeLevel === t.level;
    var isLocked = s.prestigeLevel < t.level;
    html += '<div class="news-prestige-tier-card' + (isCurrent ? ' current' : '') + (isLocked ? ' locked' : '') + '">';
    html += '<div class="news-prestige-tier-name">' + t.name + '</div>';
    html += '<div class="news-prestige-tier-mult">' + t.mult + ' income</div>';
    html += '<div class="news-prestige-tier-cap">Cap: ' + formatNumber(t.cap) + ' XP</div>';
    html += '<div class="news-prestige-tier-unlock">' + t.unlocks + '</div>';
    html += '</div>';
  }
  html += '</div>';

  var canPrestige = s.routeLevel >= 100;
  html += '<div style="text-align:center;margin-top:16px">';
  if (canPrestige) {
    html += '<p style="color:var(--success);margin-bottom:12px">&#x2728; You\'ve reached Level 100! Prestige to advance your tier.</p>';
    html += '<button class="news-prestige-btn" onclick="newspaperPrestige()">Prestige Now</button>';
    html += '<p style="color:var(--text-dim);font-size:0.8rem;margin-top:8px">This will reset your route level and all upgrades.</p>';
  } else {
    html += '<p style="color:var(--text-dim)">Reach Route Level 100 to unlock Prestige (' + s.routeLevel + '/100)</p>';
    html += '<button class="news-prestige-btn" disabled>Prestige (Lv.100 required)</button>';
  }
  html += '</div>';
  html += '</div>';
  return html;
}

function renderNewspaperCustomize() {
  if (!newspaperData) return '';
  var ac = newspaperData.availableCustomizations || {};
  var current = newspaperData.customizations || {};

  var html = '';

  html += '<div class="news-name-input-row">';
  html += '<input class="news-name-input" id="news-name-input" maxlength="24" placeholder="Route name..." value="' + escapeHtml(newspaperData.route.routeName) + '">';
  html += '<button class="news-name-btn" onclick="newspaperRename()">Rename</button>';
  html += '</div>';

  html += '<div class="news-customize-panel">';
  for (var cat in ac) {
    var catDef = ac[cat];
    var currentVal = current[cat] || catDef.default;
    html += '<div class="news-customize-group">';
    html += '<div class="news-customize-group-title">' + escapeHtml(catDef.name) + '</div>';
    html += '<div class="news-customize-options">';
    for (var i = 0; i < catDef.options.length; i++) {
      var opt = catDef.options[i];
      var isSelected = opt.id === currentVal;
      var isLocked = opt.locked;
      html += '<div class="news-customize-option' + (isSelected ? ' selected' : '') + (isLocked ? ' locked' : '') + '"';
      if (!isLocked) html += ' onclick="newspaperCustomize(\'' + cat + '\',\'' + opt.id + '\')"';
      html += '>';
      html += escapeHtml(opt.name);
      if (isLocked) html += '<span class="news-customize-lock">&#x1F512; Prestige ' + opt.minPrestige + '</span>';
      if (isSelected) html += '<span style="margin-left:auto;color:var(--success)">&#x2714;</span>';
      html += '</div>';
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function renderNewspaperStats() {
  if (!newspaperData || !newspaperData.route) return '';
  var s = newspaperData.route;
  var u = newspaperData.upgrades || {};
  var totalUpgradeLevels = 0;
  for (var k in u) totalUpgradeLevels += u[k];

  var html = '<div class="news-stats-panel"><div class="news-stats-grid">';
  html += '<div class="news-stat-item"><span class="news-stat-value">' + formatNumber(s.totalPapersDelivered) + '</span><span class="news-stat-label">Papers Delivered</span></div>';
  html += '<div class="news-stat-item"><span class="news-stat-value">' + formatNumber(s.totalXpEarned) + '</span><span class="news-stat-label">Total XP Earned</span></div>';
  html += '<div class="news-stat-item"><span class="news-stat-value">Lv.' + s.routeLevel + '</span><span class="news-stat-label">Route Level</span></div>';
  html += '<div class="news-stat-item"><span class="news-stat-value">' + s.prestigeLevel + '</span><span class="news-stat-label">Prestige Level</span></div>';
  html += '<div class="news-stat-item"><span class="news-stat-value">' + s.prestigeMultiplier + 'x</span><span class="news-stat-label">Income Multiplier</span></div>';
  html += '<div class="news-stat-item"><span class="news-stat-value">' + totalUpgradeLevels + '</span><span class="news-stat-label">Total Upgrade Levels</span></div>';
  html += '<div class="news-stat-item"><span class="news-stat-value">' + formatIncome(s.incomePerSecond) + '</span><span class="news-stat-label">XP/sec</span></div>';
  html += '<div class="news-stat-item"><span class="news-stat-value">' + formatNumber(Math.floor(newspaperData.playerCoins)) + '</span><span class="news-stat-label">Your XP</span></div>';
  html += '</div></div>';
  return html;
}

function switchNewspaperSubTab(tab) {
  newspaperSubTab = tab;
  renderNewspaperRoute();
}

function startNewspaperCollectTimer() {
  if (newspaperCollectTimer) clearInterval(newspaperCollectTimer);
  newspaperCollectTimer = setInterval(function() {
    if (!newspaperData || !newspaperData.hasRoute) return;
    var btn = document.getElementById('news-collect-btn');
    if (!btn) { clearInterval(newspaperCollectTimer); return; }
    var incPerSec = newspaperData.route.incomePerSecond || 0;
    var lastT = newspaperData.route.lastCollectedAt;
    var elapsed = 0;
    if (lastT) {
      var ts = lastT.includes('T') || lastT.includes('Z') ? new Date(lastT).getTime() : new Date(lastT.replace(' ', 'T') + 'Z').getTime();
      elapsed = Math.max(0, (Date.now() - ts) / 1000);
    }
    var bundlesLevel = (newspaperData.upgrades && newspaperData.upgrades.bundles) || 0;
    var bundlesBonus = 1 + (bundlesLevel * 0.12);
    var accumulated = Math.floor(incPerSec * elapsed * bundlesBonus);
    var collectCap = newspaperData.collectCap || 1000000;
    var isCapped = accumulated >= collectCap;
    if (isCapped) accumulated = collectCap;
    btn.textContent = 'Collect: ' + formatNumber(accumulated) + ' XP';
    if (isCapped) btn.classList.add('news-collect-capped'); else btn.classList.remove('news-collect-capped');
    var capFill = document.getElementById('news-cap-fill');
    var capText = document.getElementById('news-cap-text');
    if (capFill) {
      var pct = Math.min(100, Math.floor((accumulated / collectCap) * 100));
      capFill.style.width = pct + '%';
      if (isCapped) capFill.classList.add('capped'); else capFill.classList.remove('capped');
    }
    if (capText) capText.textContent = formatNumber(accumulated) + ' / ' + formatNumber(collectCap) + ' XP cap' + (isCapped ? ' (FULL!)' : '');
  }, 1000);
}

async function newspaperCollect() {
  var btn = document.getElementById('news-collect-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Collecting...'; }
  try {
    var r = await fetch('/api/me/newspaper/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    var data = await r.json();
    if (data.ok) {
      showToast('+' + formatNumber(data.collected) + ' XP collected!' + (data.capped ? ' (Cap reached)' : ''), 'success');
      // Update profile coins in header
      if (typeof profile !== 'undefined' && profile && profile.profile) {
        profile.profile.coins = data.newBalance;
        var heroCoins = document.getElementById('ov-hero-coin-val');
        if (heroCoins) heroCoins.textContent = formatNumber(data.newBalance);
      }
      loadNewspaperRoute();
    } else {
      showToast(data.message || 'Failed to collect', 'error');
    }
  } catch {
    showToast('Failed to collect income', 'error');
  }
  if (btn) btn.disabled = false;
}

async function newspaperUpgrade(upgradeType) {
  try {
    var r = await fetch('/api/me/newspaper/upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType: upgradeType })
    });
    var data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      // Update local coins immediately
      if (newspaperData) newspaperData.playerCoins = data.playerCoins;
      if (typeof profile !== 'undefined' && profile && profile.profile) {
        profile.profile.coins = data.playerCoins;
        var heroCoins = document.getElementById('ov-hero-coin-val');
        if (heroCoins) heroCoins.textContent = formatNumber(data.playerCoins);
      }
      loadNewspaperRoute();
    } else {
      showToast(data.message || 'Upgrade failed', 'error');
    }
  } catch {
    showToast('Failed to upgrade', 'error');
  }
}

async function newspaperUpgradeMax(upgradeType) {
  try {
    var r = await fetch('/api/me/newspaper/upgrade-max', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType: upgradeType })
    });
    var data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      if (newspaperData) newspaperData.playerCoins = data.playerCoins;
      if (typeof profile !== 'undefined' && profile && profile.profile) {
        profile.profile.coins = data.playerCoins;
        var heroCoins = document.getElementById('ov-hero-coin-val');
        if (heroCoins) heroCoins.textContent = formatNumber(data.playerCoins);
      }
      loadNewspaperRoute();
    } else {
      showToast(data.message || 'Max upgrade failed', 'error');
    }
  } catch {
    showToast('Failed to max upgrade', 'error');
  }
}

async function newspaperPrestige() {
  if (!confirm('Are you sure you want to prestige? This will reset your route level and all upgrades.')) return;
  try {
    var r = await fetch('/api/me/newspaper/prestige', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    var data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      loadNewspaperRoute();
    } else {
      showToast(data.message || 'Prestige failed', 'error');
    }
  } catch {
    showToast('Failed to prestige', 'error');
  }
}

async function newspaperCustomize(category, value) {
  try {
    var r = await fetch('/api/me/newspaper/customize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: category, value: value })
    });
    var data = await r.json();
    if (data.ok) {
      showToast('Customization updated!', 'success');
      if (newspaperData && newspaperData.customizations) {
        newspaperData.customizations[category] = value;
      }
      renderNewspaperRoute();
    } else {
      showToast(data.message || 'Customization failed', 'error');
    }
  } catch {
    showToast('Failed to customize', 'error');
  }
}

async function newspaperRename() {
  var input = document.getElementById('news-name-input');
  if (!input) return;
  var name = input.value.trim();
  if (!name) { showToast('Enter a route name', 'error'); return; }
  try {
    var r = await fetch('/api/me/newspaper/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    });
    var data = await r.json();
    if (data.ok) {
      showToast('Route renamed to "' + escapeHtml(data.routeName) + '"!', 'success');
      if (newspaperData && newspaperData.route) newspaperData.route.routeName = data.routeName;
      renderNewspaperRoute();
    } else {
      showToast(data.message || 'Rename failed', 'error');
    }
  } catch {
    showToast('Failed to rename', 'error');
  }
}

// ==================== LIBRARY ====================

var libraryData = null;
var libraryLoaded = false;
var libraryCurrentGame = '';
var librarySearchTerm = '';
var libraryOffset = 0;
var _libSearchTimer;

function openLibrary() {
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab-content').forEach(function(c) { c.classList.remove('active'); });
  document.getElementById('tab-library').classList.add('active');
  loadLibrary();
}

async function loadLibrary() {
  try {
    var params = new URLSearchParams();
    params.set('limit', '50');
    params.set('offset', libraryOffset.toString());
    if (libraryCurrentGame) params.set('game', libraryCurrentGame);
    if (librarySearchTerm) params.set('search', librarySearchTerm);
    var r = await fetch('/api/me/library?' + params.toString());
    var data = await r.json();
    if (!data.ok) throw new Error(data.error || 'Failed to load');
    libraryData = data;
    libraryLoaded = true;
    renderLibrary();
  } catch (e) {
    document.getElementById('library-container').innerHTML =
      '<div class="lib-error">Could not load library. Are you logged in?</div>';
  }
}

function renderLibrary() {
  var d = libraryData;
  var progressPct = d.nextLevelAt ? Math.min(100, (d.wordCount / d.nextLevelAt) * 100) : 100;
  var container = document.getElementById('library-container');
  container.innerHTML = '\
    <div class="lib-hero">\
      <div class="lib-hero-icon">&#x1F4DA;</div>\
      <div class="lib-hero-info">\
        <h2>Your Library</h2>\
        <div class="lib-hero-stats">\
          <span class="lib-stat"><strong>' + (d.wordCount || 0).toLocaleString() + '</strong> words</span>\
          <span class="lib-stat">Level <strong>' + (d.level || 1) + '</strong></span>\
        </div>\
        <div class="lib-progress-bar">\
          <div class="lib-progress-fill" style="width:' + progressPct + '%"></div>\
        </div>\
        <div class="lib-progress-label">' + (d.wordCount || 0).toLocaleString() + ' / ' + (d.nextLevelAt || d.wordCount || 0).toLocaleString() + ' to next level</div>\
      </div>\
    </div>\
    <div class="lib-tabs">\
      <button class="lib-tab active" onclick="switchLibrarySubTab(\'words\',this)">Words</button>\
      <button class="lib-tab" onclick="switchLibrarySubTab(\'stats\',this)">Stats</button>\
    </div>\
    <div id="lib-content"></div>\
  ';
  renderLibraryWords();
}

function switchLibrarySubTab(tab, btn) {
  document.querySelectorAll('.lib-tab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  if (tab === 'words') renderLibraryWords();
  else renderLibraryStats();
}

function renderLibraryWords() {
  var d = libraryData;
  var games = (d.stats && d.stats.byGame) ? d.stats.byGame.map(function(g) { return g.game; }) : [];
  var gameOptions = games.map(function(g) {
    var label = GAME_LABELS[g] || g;
    return '<option value="' + g + '"' + (libraryCurrentGame === g ? ' selected' : '') + '>' + label + '</option>';
  }).join('');

  var html = '<div class="lib-filters">';
  html += '<input type="text" class="lib-search" placeholder="Search words..." value="' + (librarySearchTerm || '') + '" oninput="librarySearchDebounce(this.value)">';
  html += '<select class="lib-game-filter" onchange="filterLibraryByGame(this.value)"><option value="">All Games</option>' + gameOptions + '</select>';
  html += '</div>';

  if (!d.words || d.words.length === 0) {
    html += '<div class="lib-empty">No words found yet. Play some games to start building your library!</div>';
  } else {
    html += '<div class="lib-word-grid">';
    for (var i = 0; i < d.words.length; i++) {
      var w = d.words[i];
      var gameLabel = GAME_LABELS[w.game] || w.game || '?';
      var date = w.found_at ? new Date(w.found_at + 'Z').toLocaleDateString() : '';
      html += '<div class="lib-word-card">';
      html += '<div class="lib-word-text">' + w.word.toUpperCase() + '</div>';
      html += '<div class="lib-word-meta"><span class="lib-word-game">' + gameLabel + '</span><span class="lib-word-date">' + date + '</span></div>';
      html += '</div>';
    }
    html += '</div>';

    // Pagination
    var hasMore = d.words.length === 50;
    if (libraryOffset > 0 || hasMore) {
      html += '<div class="lib-pagination">';
      if (libraryOffset > 0) html += '<button class="lib-page-btn" onclick="libraryPage(-1)">&larr; Newer</button>';
      if (hasMore) html += '<button class="lib-page-btn" onclick="libraryPage(1)">Older &rarr;</button>';
      html += '</div>';
    }
  }
  document.getElementById('lib-content').innerHTML = html;
}

function renderLibraryStats() {
  var d = libraryData;
  var stats = d.stats;
  var html = '<div class="lib-stats-section">';
  html += '<h3 class="lib-stats-title">Words by Game</h3>';
  if (!stats || !stats.byGame || stats.byGame.length === 0) {
    html += '<div class="lib-empty">No stats yet.</div>';
  } else {
    var maxCount = stats.byGame[0].count;
    for (var i = 0; i < stats.byGame.length; i++) {
      var g = stats.byGame[i];
      var pct = Math.max(5, (g.count / maxCount) * 100);
      var label = GAME_LABELS[g.game] || g.game || 'Unknown';
      html += '<div class="lib-stat-row">';
      html += '<span class="lib-stat-label">' + label + '</span>';
      html += '<div class="lib-stat-bar-bg"><div class="lib-stat-bar-fill" style="width:' + pct + '%"></div></div>';
      html += '<span class="lib-stat-count">' + g.count + '</span>';
      html += '</div>';
    }
  }
  html += '</div>';

  // Recent words
  if (stats && stats.recent && stats.recent.length > 0) {
    html += '<div class="lib-stats-section"><h3 class="lib-stats-title">Recently Found</h3><div class="lib-recent-list">';
    for (var j = 0; j < stats.recent.length; j++) {
      var r = stats.recent[j];
      html += '<div class="lib-recent-item"><strong>' + r.word.toUpperCase() + '</strong> <span class="lib-word-game">' + (GAME_LABELS[r.game] || r.game) + '</span></div>';
    }
    html += '</div></div>';
  }
  document.getElementById('lib-content').innerHTML = html;
}

function librarySearchDebounce(val) {
  clearTimeout(_libSearchTimer);
  _libSearchTimer = setTimeout(function() {
    librarySearchTerm = val;
    libraryOffset = 0;
    loadLibrary();
  }, 300);
}

function filterLibraryByGame(game) {
  libraryCurrentGame = game;
  libraryOffset = 0;
  loadLibrary();
}

function libraryPage(dir) {
  libraryOffset = Math.max(0, libraryOffset + (dir * 50));
  loadLibrary();
}
