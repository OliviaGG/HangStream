// ===== Word Tycoon User Portal =====

// ─── Avatar fallback ────────────────────────────────────────────────
// Use the Word Tycoon logo whenever a user has no avatar or a known
// default/placeholder avatar (Discord embed defaults, blank URLs, etc.)
const AVATAR_FALLBACK = '/portal/img/logo.png';

function resolveAvatar(url) {
  if (!url) return AVATAR_FALLBACK;
  // Discord's embed/default avatar URLs (appear when account has no custom avatar)
  if (url.indexOf('cdn.discordapp.com/embed/avatars/') !== -1) return AVATAR_FALLBACK;
  return url;
}

// Detect whether a URL points to any WT logo variant (default or profile-logos collection)
function isLogoUrl(url) {
  if (!url) return false;
  return url.indexOf('logo.png') !== -1 || url.indexOf('/profile-logos/') !== -1;
}

// Toggle a class on avatar elements so CSS can scale the logo fallback
function markAvatarFallback(imgEl) {
  var isFallback = imgEl.src && isLogoUrl(imgEl.src);
  imgEl.classList.toggle('avatar-is-logo', isFallback);
  var shell = imgEl.closest('.prof-avatar-shell');
  if (shell) shell.classList.toggle('shell-has-logo', isFallback);
}
// ────────────────────────────────────────────────────────────────────

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

const MEMBERSHIP_TIER_LABELS = {
  free: 'Free Tier',
  donor_class: 'Donor Class',
  pookie_pass: 'Pookie Pass'
};

const BUSINESS_DATA = {
  library:   { name: 'Library',         mark: 'LB' },
  newspaper: { name: 'Newspaper Route', mark: 'NP' },
  carwash:   { name: 'Car Wash',        mark: 'CW' },
  stockmogul:{ name: 'Stock Mogul',     mark: 'SM' },
  pizza:     { name: 'Pizza Shop',      mark: 'PZ' },
  arcade:    { name: 'Arcade',          mark: 'AR' },
  gym:       { name: 'Gym',             mark: 'GY' },
  cinema:    { name: 'Movie Theater',   mark: 'CN' },
  startup:   { name: 'Tech Startup',    mark: 'TS' },
  bank:      { name: 'Bank',            mark: 'BK' },
  space:     { name: 'Space Agency',    mark: 'SP' }
};

const WT_SYMBOLS = {
  daily: '<span class="wt-symbol wt-symbol-sm wt-symbol-daily"><svg viewBox="0 0 32 32" overflow="visible" aria-hidden="true"><ellipse cx="16" cy="26" rx="10" ry="5" fill="url(#fire-base-glow)"/><g filter="url(#fire-glow-sm)"><path d="M16 3 C16 3,20 8,19 12 C19 12,23 9,22 5 C25 9,27 14,25 19 C23.5 23,20 26,16 27 C12 26,8.5 23,7 19 C5 14,7 9,10 5 C9 9,13 12,13 12 C12 8,16 3 16 3Z" fill="url(#fire-body)"/></g><path d="M16 10 C16 10,18.5 13.5,18 16.5 C18 16.5,20 14.5,19.5 12 C21 14.5,21.5 17.5,20 20 C19 22,17.5 23.5,16 24 C14.5 23.5,13 22,12 20 C10.5 17.5,11 14.5,12.5 12 C12 14.5,14 16.5,14 16.5 C13.5 13.5,16 10 16 10Z" fill="url(#fire-inner)"/><ellipse cx="16" cy="21" rx="3" ry="3.5" fill="#FFFDE7" opacity="0.7"/></svg></span>',
  xp: '<span class="wt-symbol wt-symbol-sm wt-symbol-xp"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="13" r="4.1" fill="currentColor"></circle><circle cx="14.8" cy="9" r="3.6" fill="#79d7ff"></circle><circle cx="16.5" cy="15.2" r="2.8" fill="#b88cff"></circle><circle cx="7.2" cy="8.3" r="2.4" fill="#ffd36e"></circle></svg></span>',
  words: '<span class="wt-symbol wt-symbol-sm wt-symbol-words"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.5 7.5c0-1 1-1.8 2.1-1.8h4.2c1 0 1.9.3 2.7.9v11.7c-.8-.6-1.7-.9-2.7-.9H8.6c-1.1 0-2.1.8-2.1 1.8zM17.5 7.5c0-1-1-1.8-2.1-1.8h-4.2c-1 0-1.9.3-2.7.9v11.7c.8-.6 1.7-.9 2.7-.9h4.2c1.1 0 2.1.8 2.1 1.8z" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>',
  wins: '<span class="wt-symbol wt-symbol-sm wt-symbol-wins"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8v3.5a4 4 0 0 1-8 0zM7 7H5.5A2.5 2.5 0 0 0 8 11M17 7h1.5A2.5 2.5 0 0 1 16 11M12 12v3.2M9 19h6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>',
  income: '<span class="wt-symbol wt-symbol-sm wt-symbol-income"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 18h14M7 18v-5M12 18v-8M17 18v-11" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>',
  weekly: '<span class="wt-symbol wt-symbol-sm wt-symbol-weekly"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8v3.5a4 4 0 0 1-8 0zM7 7H5.5A2.5 2.5 0 0 0 8 11M17 7h1.5A2.5 2.5 0 0 1 16 11M12 12v3.2M9 19h6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>',
  store: '<span class="wt-symbol wt-symbol-sm wt-symbol-store"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h10l2 3.5L12 18 5 9.5zM7 6l5 12M17 6l-5 12" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>',
  warning: '<span class="wt-symbol wt-symbol-sm wt-symbol-warning"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5.2l6.7 11.6H5.3L12 5.2z" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round"></path><path d="M12 9.2v3.9M12 15.9h.01" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"></path></svg></span>',
  check: '<span class="wt-symbol wt-symbol-sm wt-symbol-income"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6.8 12.6l3.3 3.3 7.1-7.1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>',
  bolt: '<span class="wt-symbol wt-symbol-sm wt-symbol-warning"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M13.5 3.8L7.7 12h3.6l-.8 8.2 5.8-8.2h-3.6z" fill="currentColor"></path></svg></span>',
  upgrade: '<span class="wt-symbol wt-symbol-sm wt-symbol-income"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6M7 11l5-5 5 5" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"></path></svg></span>',
  arcade: '<span class="wt-symbol wt-symbol-sm wt-symbol-weekly"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="5" width="12" height="14" rx="2.8" fill="none" stroke="currentColor" stroke-width="1.8"></rect><path d="M10 10h4M12 8v4M15.5 13.5h.01M8.5 13.5h.01" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path></svg></span>'
};

function platformBadge(platform) {
  const markMap = { tiktok: 'TT', youtube: 'YT', twitch: 'TW', discord: 'DS', github: 'GH' };
  const mark = markMap[platform] || 'ID';
  return `<span class="wt-badge-mark wt-platform-badge wt-platform-${escapeHtml(platform || 'unknown')}">${mark}</span>`;
}

function businessBadge(type) {
  const biz = BUSINESS_DATA[type] || { mark: 'WT' };
  return `<span class="wt-badge-mark wt-business-badge wt-business-${escapeHtml(type || 'unknown')}">${escapeHtml(biz.mark)}</span>`;
}

const BUSINESS_CONFIG = {
  library:   { baseCost: 0,           baseUpgradeCost: 0,           baseIncome: 10,      cycleSeconds: 1,  costMultiplier: 1,    wordUpgrade: true, maxLevel: 100 },
  newspaper: { baseCost: 5000,        baseUpgradeCost: 5000,        baseIncome: 5,       cycleSeconds: 3,  costMultiplier: 1.15, maxLevel: 100 },
  carwash:   { baseCost: 100000,      baseUpgradeCost: 100000,      baseIncome: 25,      cycleSeconds: 6,  costMultiplier: 1.15, maxLevel: 100 },
  stockmogul:{ baseCost: 0,           baseUpgradeCost: 0,           baseIncome: 200,     cycleSeconds: 8,  costMultiplier: 1.15, maxLevel: 100, cleanCashCost: 5000, cleanCashUpgradeCost: 2500, cleanCashBusiness: true },
  pizza:     { baseCost: 2000000,     baseUpgradeCost: 2000000,     baseIncome: 50,      cycleSeconds: 5,  costMultiplier: 1.15, maxLevel: 100 },
  arcade:    { baseCost: 1000,        baseUpgradeCost: 0,           baseIncome: 0,       cycleSeconds: 8,  costMultiplier: 1.15, maxLevel: 1   },
  gym:       { baseCost: 250000000,   baseUpgradeCost: 250000000,   baseIncome: 1000,    cycleSeconds: 10, costMultiplier: 1.15, maxLevel: 75  },
  cinema:    { baseCost: 1000000000,  baseUpgradeCost: 1000000000,  baseIncome: 5000,    cycleSeconds: 12, costMultiplier: 1.15, maxLevel: 50  },
  startup:   { baseCost: 3000000000,  baseUpgradeCost: 3000000000,  baseIncome: 25000,   cycleSeconds: 15, costMultiplier: 1.15, maxLevel: 50  },
  bank:      { baseCost: 6000000000,  baseUpgradeCost: 6000000000,  baseIncome: 150000,  cycleSeconds: 20, costMultiplier: 1.15, maxLevel: 50  },
  space:     { baseCost: 10000000000, baseUpgradeCost: 10000000000, baseIncome: 1000000, cycleSeconds: 25, costMultiplier: 1.15, maxLevel: 25  }
};

// Mirror of server-side PROGRESSION_TIERS (businesses.js)
const BUSINESS_PROGRESSION = {
  library:   { multiplier: 1   },
  newspaper: { multiplier: 2   },
  carwash:   { multiplier: 4   },
  stockmogul:{ multiplier: 6   },
  pizza:     { multiplier: 8   },
  arcade:    { multiplier: 15  },
  gym:       { multiplier: 30  },
  cinema:    { multiplier: 60  },
  startup:   { multiplier: 100 },
  bank:      { multiplier: 150 },
  space:     { multiplier: 250 }
};

// Returns the level-scaled word game multiplier for a business (mirrors server logic)
function getBizProgressionMult(type, level) {
  const prog = BUSINESS_PROGRESSION[type];
  const cfg  = BUSINESS_CONFIG[type];
  if (!prog || !cfg) return 1;
  const maxLevel = cfg.maxLevel || 100;
  if (maxLevel <= 1) return prog.multiplier;
  const levelFraction = (level - 1) / (maxLevel - 1);
  return prog.multiplier * (1 + 0.5 * levelFraction);
}

var GAME_LABELS = {
  'betwixt-sp': 'Betwixt', 'betwixt': 'Betwixt',
  'word500-sp': 'Word5000 Solo', 'word500': 'Word5000',
  'wordle-sp': 'Wordle', 'wordle': 'Wordle',
  'figural-sp': 'Figural', 'figural': 'Figural',
  'pixeletters-sp': 'PixeLetters', 'pixeletters': 'PixeLetters',
  'spellingbee-sp': 'Spelling Bee', 'spellingbee': 'Spelling Bee', 'spelling-bee': 'Spelling Bee',
  'rectangled-sp': 'recTangled', 'rectangled': 'recTangled',
  'searchle-sp': 'Searchle', 'searchle': 'Searchle',
  'unwordle-sp': 'UnWordle', 'unwordle': 'UnWordle',
  'triangled-sp': 'Triangled', 'triangled': 'Triangled'
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

const RECTANGLED_URLS = {
  solo: '/game/rectangled/mobile-sp.html',
  online: '/game/rectangled/mobile.html'
};

const ERECTANGLED_URLS = {
  solo: '/game/erectangled/sp.html',
  online: '/game/erectangled/mp.html'
};

const GAMES = [
  { id: 'searchle',    name: 'Searchle',     img: '/portal/img/game-searchle.png',    color: '#4a9eff', spUrl: '/game/searchle/sp.html', mpUrl: '/game/searchle/', weeklyKey: 'searchle_sp_weekly',       statsKey: 'searchle' },
{ id: 'rectangled',  name: 'recTangled',   img: '/portal/img/game-rectangled.png',        color: '#22d3ee', nameHtml: '<span style="color:#3EC8E8">r</span><span style="color:#F5920A">e</span><span style="color:#EFC000">c</span><span style="color:#1E52C8">T</span><span style="color:#E83020">a</span><span style="color:#42B238">n</span><span style="color:#88AAFF">g</span><span style="color:#C835B8">l</span><span style="color:#F5920A">e</span><span style="color:#1EB8A8">d</span>', spUrl: RECTANGLED_URLS.solo, mpUrl: RECTANGLED_URLS.online, dailyKey: 'rectangled_sp_daily_date', weeklyKey: 'rectangled_sp_weekly', statsKey: 'rectangled' },
  { id: 'erectangled', legacyIds: ['sproutle'], name: 'erecTangled',  img: '/portal/img/game-erectangled.png', color: '#44bb88', nameHtml: '<span style="color:#44bb88">e</span><span style="color:#3EC8E8">r</span><span style="color:#F5920A">e</span><span style="color:#EFC000">c</span><span style="color:#1E52C8">T</span><span style="color:#E83020">a</span><span style="color:#42B238">n</span><span style="color:#88AAFF">g</span><span style="color:#C835B8">l</span><span style="color:#F5920A">e</span><span style="color:#1EB8A8">d</span>', spUrl: ERECTANGLED_URLS.solo, mpUrl: ERECTANGLED_URLS.online, dailyKey: 'erectangled_sp_daily_date', dailyKeyAliases: ['sproutle_sp_daily_date'], weeklyKey: 'erectangled_sp_weekly', weeklyKeyAliases: ['sproutle_sp_weekly'], statsKey: 'erectangled', statsKeyAliases: ['sproutle'], spStatsKey: 'erectangled_sp_stats', spStatsKeyAliases: ['sproutle_sp_stats'] },
  { id: 'word500',     name: 'Word5000',     img: '/portal/img/game-word500.png',     color: '#4fc34f', spUrl: '/game/word500/?mode=solo', mpUrl: '/game/word500/?mode=mp', dailyKey: 'word500_sp_daily_date',     statsKey: 'word500' },
  { id: 'colour500',   name: 'Color 500',    img: '/portal/img/game-colour500.svg', color: '#4ade80', spUrl: '/game/colour500/solo', mpUrl: '/game/colour500/', dailyKey: 'colour500_sp_daily_date' },
  { id: 'wordle',      name: 'Wordle',       img: '/portal/img/game-wordle.png',      color: '#6aaa64', spUrl: '/wordle/solo/',       mpUrl: '/wordle/online/',    dailyKey: 'wordle_sp_daily_date',      statsKey: 'wordle' },
  { id: 'betwixt',   name: 'Betwixt',    img: '/portal/img/game-betwixt.png',   color: '#7b68ee', spUrl: '/game/betwixt/play', mpUrl: '/betwixt/online/', dailyKey: 'betwixt_sp_daily_date',   statsKey: 'betwixt' },
  { id: 'pixeletters', name: 'PixeLetters',  img: '/portal/img/game-pixeletters.png', color: '#ff6b9d', spUrl: '/pixeletters/solo/',  mpUrl: '/pixeletters/online/', dailyKey: 'pixeletters_sp_daily_date', statsKey: 'pixeletters' },
  { id: 'spellingbee', name: 'Spelling Bee', img: '/portal/img/game-spellingbee.png', color: '#ffab00', spUrl: '/spellingbee/solo/',  mpUrl: '/spellingbee/online/', weeklyKey: 'spellingbee_sp_weekly', statsKey: 'spellingbee' },
  { id: 'figural',     name: 'Figural',      img: '/portal/img/game-figural.png',     color: '#00e5ff', spUrl: '/game/figural/sp.html', mpUrl: '/figural/online/',   dailyKey: 'figural_sp_daily_date',     statsKey: 'figural' },
  { id: 'unwordle',    name: 'UnWordle',     img: '/portal/img/game-unwordle.png',    color: '#ff6b6b', spUrl: '/game/unwordle/sp.html', mpUrl: '',                 dailyKey: 'unwordle_sp_daily_date',    statsKey: 'unwordle' },
  { id: 'triangled',  name: 'Triangled',    img: '/portal/img/game-triangled.png',   color: '#222222', spUrl: '/game/triangled/', mpUrl: '',                 dailyKey: 'triangled_sp_daily_date',   statsKey: 'triangled' },
  { id: 'wikisearchle', name: 'WikiContexto', img: '/portal/img/game-wikisearchle.png', color: '#8a5cf7', spUrl: '/game/wikisearchle/solo/', mpUrl: '/game/wikisearchle/', weeklyKey: 'wikisearchle_sp_weekly', statsKey: 'wikisearchle' },
  { id: 'wikirectangled', name: 'WiKirecTangled', img: '/portal/img/game-wikirectangled.png', color: '#ee7a2c', spUrl: '/game/wikirectangled/solo', mpUrl: '/game/wikirectangled/', statsKey: 'wikirectangled' },
  { id: 'junkdrawer',  name: 'Junk Drawer',  img: '/portal/img/game-junkdrawer.png',  color: '#f5a623', spUrl: 'https://junkdrawer.live', mpUrl: '' },
  { id: 'synapse',     name: 'Synapse',      img: '/portal/img/game-synapse.png',     color: '#8b5cf6', spUrl: '/synapse', mpUrl: '/synapse/mp' },
];

function isTrackedDailyGame(game) {
  return !!(game && game.dailyKey && game.trackDaily !== false);
}

function isTrackedWeeklyGame(game) {
  return !!(game && game.weeklyKey && game.trackWeekly !== false);
}

function getLocalStorageValueWithAliases(primaryKey, aliasKeys) {
  if (!primaryKey) return null;
  var primary = localStorage.getItem(primaryKey);
  if (primary != null) return primary;
  aliasKeys = Array.isArray(aliasKeys) ? aliasKeys : [];
  for (var i = 0; i < aliasKeys.length; i++) {
    var value = localStorage.getItem(aliasKeys[i]);
    if (value != null) return value;
  }
  return null;
}

function setLocalStorageValueWithAliases(primaryKey, aliasKeys, value) {
  if (!primaryKey) return;
  localStorage.setItem(primaryKey, value);
  aliasKeys = Array.isArray(aliasKeys) ? aliasKeys : [];
  aliasKeys.forEach(function(aliasKey) {
    localStorage.setItem(aliasKey, value);
  });
}

function addGameAliases(target, game, value) {
  if (!game) return;
  target[game.id] = value;
  if (Array.isArray(game.legacyIds)) {
    game.legacyIds.forEach(function(aliasId) {
      target[aliasId] = value;
    });
  }
}

const GAME_LAUNCH_ATTRS = '';
const FIVE_LETTER_LAUNCH_GAMES = new Set(['word500', 'wordle', 'figural', 'pixeletters']);

function addLaunchParams(url, params) {
  if (!url) return '';
  try {
    var target = new URL(url, window.location.origin);
    Object.keys(params || {}).forEach(function(key) {
      var value = params[key];
      if (value !== undefined && value !== null && value !== '') {
        target.searchParams.set(key, String(value));
      }
    });
    if (target.origin === window.location.origin) {
      return target.pathname + target.search + target.hash;
    }
    return target.href;
  } catch (e) {
    return url;
  }
}

function getSoloLaunchUrl(game, dailyStatus) {
  if (!game || !game.spUrl) return '';
  var url = game.spUrl;
  if (FIVE_LETTER_LAUNCH_GAMES.has(game.id)) {
    url = addLaunchParams(url, { length: 5 });
  }
  if (isTrackedDailyGame(game)) {
    var done = dailyStatus && dailyStatus[game.id];
    if (!done) url = addLaunchParams(url, { mode: 'daily' });
  }
  return url;
}

function getWeeklyLaunchUrl(game) {
  if (!game || !game.spUrl) return '';
  return addLaunchParams(game.spUrl, { mode: 'weekly' });
}

function getOnlineLaunchUrl(game) {
  if (!game || !game.mpUrl) return '';
  var url = game.mpUrl;
  if (FIVE_LETTER_LAUNCH_GAMES.has(game.id)) {
    url = addLaunchParams(url, { length: 5 });
  }
  return url;
}

function resolveRecommendationLink(link, dailyStatus, weeklyStatus) {
  if (!link) return '';
  var game = GAMES.find(function(g) { return g.spUrl === link; });
  if (!game) return link;
  if (isTrackedWeeklyGame(game) && weeklyStatus && !weeklyStatus[game.id] && (!isTrackedDailyGame(game) || (dailyStatus && dailyStatus[game.id]))) {
    return getWeeklyLaunchUrl(game);
  }
  return getSoloLaunchUrl(game, dailyStatus);
}

function getLaunchHref(url) {
  if (!url) return '';
  try {
    var target = new URL(url, window.location.origin);
    var currentTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
    if (target.origin !== window.location.origin && (currentTheme === 'light' || currentTheme === 'dark')) {
      target.searchParams.set('theme', currentTheme);
    }
    if (target.origin === window.location.origin) return target.pathname + target.search + target.hash;
    return '/api/auth/sso-check?returnTo=' + encodeURIComponent(target.href);
  } catch (e) {
    return url;
  }
}

function syncThemeToLaunchLinks() {
  var currentTheme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  document.querySelectorAll('a[href]').forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    try {
      var target = new URL(href, window.location.origin);
      if (target.origin !== window.location.origin) {
        target.searchParams.set('theme', currentTheme);
        link.href = target.toString();
      }
    } catch (e) {}
  });
}

// ── Premium game gating (2026-07-17) ────────────────────────────────
// Non-daily play requires Donor Class ($2/mo) or TikTok Super Fan status
// (owner-channel subscribers get it free). Free = the scheduled daily /
// weekly puzzles. Multiplayer is always premium; solo is premium only for
// games whose solo page is unlimited play rather than a daily puzzle.
// Synapse and WiKirecTangled solo pages ARE the daily puzzle (plus practice),
// so they stay free; Junk Drawer is a daily-spin platform, so it stays free.
var PREMIUM_SOLO_GAMES = new Set(['searchle', 'wikisearchle']);
var premiumEntitlement = { loaded: false, premium: false, loggedIn: false, source: null };
var premiumEntitlementPromise = null;

function loadPremiumEntitlement() {
  premiumEntitlementPromise = (async function () {
    try {
      var res = await fetch('/api/me/entitlement');
      var data = await res.json();
      if (data && data.ok) {
        premiumEntitlement = {
          loaded: true,
          premium: !!data.premium,
          loggedIn: !!data.loggedIn,
          source: data.source || null
        };
        return;
      }
    } catch (e) {}
    // Fail-open: an entitlement outage must never lock every game.
    premiumEntitlement = { loaded: true, premium: true, loggedIn: true, source: 'fail-open' };
  })();
  return premiumEntitlementPromise;
}

// Resolve a launch href (including /api/auth/sso-check?returnTo=… wrappers)
// to a URL object, or null if unparseable.
function resolvePremiumLaunchUrl(href) {
  if (!href || href.startsWith('#') || href.startsWith('javascript:')) return null;
  try {
    var u = new URL(href, window.location.origin);
    if (u.pathname === '/api/auth/sso-check') {
      var rt = u.searchParams.get('returnTo');
      if (rt) u = new URL(rt);
    }
    return u;
  } catch (e) { return null; }
}

// Returns { game, kind: 'mp'|'solo' } when the href points at a premium
// mode, or null when it's free (dailies, weeklies, external, non-game).
function classifyPremiumLaunch(href) {
  var u = resolvePremiumLaunchUrl(href);
  if (!u || u.origin !== window.location.origin) return null; // external = free
  var path = u.pathname.replace(/\/+$/, '') || '/';
  function samePath(candidate) {
    if (!candidate) return false;
    try {
      var c = new URL(candidate, window.location.origin);
      return (c.pathname.replace(/\/+$/, '') || '/') === path;
    } catch (e) { return false; }
  }
  for (var i = 0; i < GAMES.length; i++) {
    var g = GAMES[i];
    var mpMatch = g.mpUrl && samePath(g.mpUrl);
    var spMatch = g.spUrl && samePath(g.spUrl);
    // Word5000 uses one path for both modes (?mode=solo / ?mode=mp), so a
    // dual match is disambiguated by the query param.
    if (mpMatch && !(spMatch && u.searchParams.get('mode') !== 'mp')) {
      return { game: g, kind: 'mp' };
    }
    if (spMatch) {
      if (!PREMIUM_SOLO_GAMES.has(g.id)) return null; // daily solo = free
      var mode = u.searchParams.get('mode');
      if (mode === 'daily' || mode === 'weekly') return null; // scheduled = free
      return { game: g, kind: 'solo' };
    }
  }
  return null;
}

// Capture-phase interceptor so it runs ahead of card-level onclick handlers
// and covers every render site (game cards, Today panel, recommendations).
document.addEventListener('click', function (e) {
  var a = e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  var hit = classifyPremiumLaunch(a.getAttribute('href'));
  if (!hit) return;
  if (premiumEntitlement.loaded && premiumEntitlement.premium) return;
  e.preventDefault();
  e.stopPropagation();
  var dest = a.href;
  Promise.resolve(premiumEntitlementPromise).then(function () {
    if (premiumEntitlement.premium) { window.location.href = dest; return; }
    showPremiumGate(hit.game, hit.kind);
  });
}, true);

// The free alternative offered by the gate: the game's own daily if its solo
// is free, else its weekly challenge, else nothing (just browse the hub).
function getPremiumGateFreeAlt(game) {
  if (game.spUrl && !PREMIUM_SOLO_GAMES.has(game.id)) {
    return { label: 'Play the free daily', href: getLaunchHref(getSoloLaunchUrl(game, null)) };
  }
  if (game.weeklyKey) {
    return { label: 'Play the free weekly', href: getLaunchHref(getWeeklyLaunchUrl(game)) };
  }
  return null;
}

function closePremiumGate() {
  var el = document.getElementById('premium-gate');
  if (el) el.remove();
}

function premiumGateSignin() {
  closePremiumGate();
  openGuestLogin();
}

function premiumGateCheckout() {
  beginPassCheckout('donor_class');
}

// Hub "Donor Class" card CTA (above the Tip Jar). Logged-in users go straight
// to the $2/mo checkout; logged-out users get the same intent flow as the
// jorry.live /me?donor=1 deep link so checkout auto-opens after sign-in.
function beginDonorCardCheckout() {
  if (premiumEntitlement.loggedIn) {
    beginPassCheckout('donor_class');
    return;
  }
  try { sessionStorage.setItem('wt_donor_intent', String(Date.now())); } catch (e) {}
  showToast('Sign in first — your $2/mo Donor Class checkout will open right after.', 'info', 6000);
  openGuestLogin();
}

// Show the hub Donor Class card only to non-members. Members (Donor Class,
// Pookie Pass, Super Fan) and entitlement fail-open outages keep it hidden.
function updateDonorClassCard() {
  var card = document.getElementById('wordgames-donor');
  if (!card) return;
  Promise.resolve(premiumEntitlementPromise).then(function () {
    card.hidden = !(premiumEntitlement.loaded && !premiumEntitlement.premium);
  });
}

function showPremiumGate(game, kind) {
  closePremiumGate();
  var name = game.name || 'This game';
  var modeLabel = kind === 'mp' ? 'Online multiplayer' : 'Unlimited solo';
  var freeAlt = getPremiumGateFreeAlt(game);
  var loggedIn = premiumEntitlement.loggedIn;

  var actionsHtml = '';
  if (freeAlt) {
    actionsHtml += '<a class="premium-gate-free-btn" href="' + freeAlt.href + '">' + freeAlt.label + '</a>';
  } else {
    actionsHtml += '<a class="premium-gate-free-btn" href="#" onclick="event.preventDefault(); closePremiumGate();">Browse the free daily games</a>';
  }
  if (loggedIn) {
    actionsHtml += '<a href="#" class="pass-gate-plan pass-gate-plan-donor premium-gate-donor" onclick="event.preventDefault(); premiumGateCheckout();">' +
      '<div class="pass-gate-plan-name">Donor Class</div>' +
      '<div class="pass-gate-plan-price">$2<span>/mo</span></div>' +
      '<div class="pass-gate-plan-desc">Unlock every game &amp; mode</div>' +
    '</a>';
  } else {
    actionsHtml += '<a href="#" class="pass-gate-plan pass-gate-plan-donor premium-gate-donor" onclick="event.preventDefault(); premiumGateSignin();">' +
      '<div class="pass-gate-plan-name">Sign in</div>' +
      '<div class="pass-gate-plan-price">Free</div>' +
      '<div class="pass-gate-plan-desc">Then unlock everything for $2/mo</div>' +
    '</a>';
  }

  var el = document.createElement('div');
  el.id = 'premium-gate';
  el.className = 'pass-activation-gate premium-gate';
  el.innerHTML =
    '<div class="pass-gate-backdrop" onclick="closePremiumGate()"></div>' +
    '<div class="pass-gate-inner">' +
      '<button class="pass-gate-close" onclick="closePremiumGate()" aria-label="Close">&times;</button>' +
      '<div class="pass-gate-kicker">Word Tycoon Premium</div>' +
      '<h1 class="pass-gate-title">' + name + ' &middot; ' + modeLabel + '</h1>' +
      '<p class="pass-gate-desc">The daily games are free for everyone, forever. <strong>' + modeLabel + '</strong> is part of <strong>Donor Class</strong> — $2/month to unlock every game and mode across Word Tycoon.</p>' +
      '<div class="premium-gate-actions">' + actionsHtml + '</div>' +
      '<p class="pass-gate-footer premium-gate-superfan">TikTok Super Fans get Donor Class free — subscribe to the owner\'s channel, link your TikTok, and chat during a stream.</p>' +
    '</div>';
  document.body.appendChild(el);
}

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
let portalProvider = null; // 'discord' | 'github' | 'google' | 'tiktok' — set from profile response
let profile = null;
let shopCatalog = [];
let shopSets = {};
let fanClubStatus = null; // { isFanClub, granted, queued, hasTiktokLink, unlockUrl }
let historyPage = 1;
let newCosmeticsModalIds = [];
let newCosmeticsModalOpen = false;
let socket = null;
let chatMessages = [];
const MAX_CHAT = 200;
let presenceHeartbeatInterval = null;
let lastPresenceHeartbeatAt = 0;
const PRESENCE_HEARTBEAT_MS = 45000;
let portalVisitSnapshotState = {
  storageKey: '',
  previous: null,
  current: null
};

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

function isPortalPresenceEligible() {
  if (!portalUser) return false;
  if (document.visibilityState !== 'visible') return false;
  if (typeof document.hasFocus === 'function' && !document.hasFocus()) return false;
  return true;
}

async function sendPresenceHeartbeat(source) {
  if (!isPortalPresenceEligible()) return false;
  try {
    const res = await fetch('/api/me/presence/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: source || 'web-heartbeat' })
    });
    if (!res.ok) return false;
    const data = await res.json();
    lastPresenceHeartbeatAt = Date.now();
    if (data && data.ok && data.presence && profile && profile.incomePerSecond) {
      const previousStatus = profile.incomePerSecond.presence && profile.incomePerSecond.presence.status;
      profile.incomePerSecond.presence = data.presence;
      if ((source && source !== 'web-heartbeat') || previousStatus !== data.presence.status) {
        loadProfile();
      } else {
        renderBusinesses(profile && profile.businesses);
        renderEarningsBreakdown();
        renderEmpireSummary();
      }
    }
    return true;
  } catch {
    return false;
  }
}

function stopPresenceHeartbeat() {
  if (presenceHeartbeatInterval) {
    clearInterval(presenceHeartbeatInterval);
    presenceHeartbeatInterval = null;
  }
}

function getPortalVisitIdentity(data) {
  var source = data || profile;
  var p = source && source.profile;
  var platforms = p && Array.isArray(p.platforms) ? p.platforms : [];
  var discord = platforms.find(function(pl) { return pl.platform === 'discord' && pl.platformUserId; });
  if (discord) return 'discord:' + discord.platformUserId;
  var github = platforms.find(function(pl) { return pl.platform === 'github' && pl.platformUserId; });
  if (github) return 'github:' + github.platformUserId;
  if (portalUser && portalUser.id) return 'session:' + portalUser.id;
  return '';
}

function getPortalVisitSnapshotKey(data) {
  var identity = getPortalVisitIdentity(data);
  return identity ? ('portal_visit_snapshot_v1:' + identity) : '';
}

function loadStoredPortalVisitSnapshot(key) {
  if (!key) return null;
  try {
    var raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveCurrentPortalVisitSnapshot() {
  var key = portalVisitSnapshotState.storageKey;
  var snapshot = portalVisitSnapshotState.current;
  if (!key || !snapshot) return;
  try {
    localStorage.setItem(key, JSON.stringify(snapshot));
  } catch (_) {}
}

function getPortalVisitSnapshot(data) {
  var source = data || profile;
  if (!source || !source.profile) return null;
  var p = source.profile;
  var pass = p.passStats || {};
  var career = p.careerStats || {};
  var business = p.businessStats || {};
  var claim = window.portalDailyClaim && window.portalDailyClaim.getStatus();
  var snapshot = getChallengeProgressSnapshot();
  return {
    at: Date.now(),
    coins: Number(p.coins || 0),
    giftCoins: Number(p.giftCoins || 0),
    wins: Number(career.totalGameWins || p.totalGameWins || 0),
    words: Number(p.libraryWords || 0),
    cosmeticsOwned: Number(career.cosmeticsOwned || 0),
    businessesOwned: Number(business.businessesOwned || 0),
    streak: Number(claim && claim.currentStreak || 0),
    dailyDone: Number(snapshot.dailyCompleted || 0),
    weeklyDone: Number(snapshot.weeklyCompleted || 0)
  };
}

function formatElapsedVisitTime(ts) {
  if (!ts) return '';
  var deltaMs = Math.max(0, Date.now() - ts);
  var minutes = Math.floor(deltaMs / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + 'h ago';
  var days = Math.floor(hours / 24);
  if (days < 7) return days + 'd ago';
  return new Date(ts).toLocaleDateString();
}

function buildVisitDeltaChip(label, delta, kind) {
  var sign = delta > 0 ? '+' : '';
  return '<span class="visit-recap-chip ' + (kind || '') + '">' + sign + escapeHtml(formatNumber(delta)) + ' ' + escapeHtml(label) + '</span>';
}

// ── Avatar Picker ─────────────────────────────────────────────────────────────
// Shows a popover with platform avatars + Word Tycoon default to pick from.

var _avatarPickerPopover = null;

function getProfileLogoCatalog(data) {
  return Array.isArray(data && data.profileLogos) ? data.profileLogos : [];
}

function getProfileLogoById(data, logoId) {
  var normalizedId = String(logoId || '').trim();
  if (!normalizedId) return null;
  var logos = getProfileLogoCatalog(data);
  for (var i = 0; i < logos.length; i++) {
    if (logos[i] && logos[i].id === normalizedId) return logos[i];
  }
  return null;
}

function getSelectedProfileLogo(data) {
  if (data && data.selectedProfileLogo) return data.selectedProfileLogo;
  var selectedId = data && data.preferences && data.preferences.preferred_profile_logo_id;
  return selectedId ? getProfileLogoById(data, selectedId) : null;
}

function getProfileLogoUnlockLabel(logo) {
  if (!logo) return 'Profile logo';
  if (logo.unlockSource === 'free') return 'Free now';
  if (logo.unlockSource === 'daily_claim') {
    var claimTarget = Number(logo.dailyClaim && logo.dailyClaim.totalClaims || 0);
    return claimTarget > 0 ? ('Daily Claim · ' + claimTarget + ' total claims') : 'Daily Claim';
  }
  if (logo.unlockSource === 'membership') {
    return 'Donor Class perk';
  }
  return 'Profile logo';
}

function applyProfileLogoSelectionState(target, selectedLogoId) {
  if (!target) return;
  var normalizedId = String(selectedLogoId || '').trim() || null;
  if (Array.isArray(target.profileLogos)) {
    target.profileLogos = target.profileLogos.map(function(logo) {
      if (!logo) return logo;
      return Object.assign({}, logo, { selected: !!(normalizedId && logo.id === normalizedId && logo.owned) });
    });
  }
  target.selectedProfileLogo = normalizedId ? getProfileLogoById(target, normalizedId) : null;
  if (target.preferences) {
    target.preferences.preferred_profile_logo_id = normalizedId;
  }
}

function closeAvatarPicker() {
  if (_avatarPickerPopover) {
    _avatarPickerPopover.remove();
    _avatarPickerPopover = null;
  }
}

function setupAvatarUpload(profileData) { // kept as setupAvatarUpload so existing call site works
  var editBtn   = document.getElementById('prof-avatar-edit-btn');
  var profAvatar = document.getElementById('prof-avatar');
  if (!editBtn || !profAvatar) return;
  if (editBtn.dataset.wired) return;
  editBtn.dataset.wired = '1';

  editBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    if (_avatarPickerPopover) { closeAvatarPicker(); return; }
    openAvatarPicker(profileData, editBtn, profAvatar);
  });
}

function openAvatarPicker(profileData, anchorEl, profAvatar) {
  var p       = profileData && profileData.profile;
  var prefs   = profileData && profileData.preferences;
  var currentPlatform = prefs && prefs.preferred_pfp_platform;
  var currentLogo = getSelectedProfileLogo(profileData);
  var currentLogoId = currentLogo && currentLogo.id;

  var PLATFORM_LABELS = { discord: 'Discord', tiktok: 'TikTok', youtube: 'YouTube', github: 'GitHub', twitch: 'Twitch' };
  var platformOptions = [];
  var platforms = (p && p.platforms) || [];
  platforms.forEach(function(plat) {
    if ((plat.profilePic && plat.platform !== 'discord') || plat.profilePic) {
      platformOptions.push({
        kind: 'platform',
        key: plat.platform,
        label: PLATFORM_LABELS[plat.platform] || plat.platform,
        meta: 'Linked account avatar',
        src: plat.profilePic
      });
    }
  });

  platformOptions.push({
    kind: 'platform',
    key: 'default',
    label: 'Word Tycoon',
    meta: 'Classic default',
    src: AVATAR_FALLBACK
  });

  var unlockedLogoOptions = [];
  var lockedLogoOptions = [];
  getProfileLogoCatalog(profileData).forEach(function(logo) {
    if (!logo || !logo.assetPath) return;
    var option = {
      kind: 'logo',
      key: logo.id,
      logoId: logo.id,
      label: logo.name || 'Profile Logo',
      meta: getProfileLogoUnlockLabel(logo),
      src: logo.assetPath,
      locked: !logo.owned
    };
    if (logo.owned) unlockedLogoOptions.push(option);
    else lockedLogoOptions.push(option);
  });

  var pop = document.createElement('div');
  pop.className = 'avatar-picker-popover';
  pop.setAttribute('role', 'dialog');
  pop.setAttribute('aria-label', 'Choose profile picture');

  var title = document.createElement('div');
  title.className = 'avatar-picker-title';
  title.textContent = 'Profile Picture';
  pop.appendChild(title);

  var grid = document.createElement('div');
  grid.className = 'avatar-picker-grid';

  function appendSection(titleText, options) {
    if (!options || !options.length) return;
    var section = document.createElement('div');
    section.className = 'avatar-picker-section';

    var heading = document.createElement('div');
    heading.className = 'avatar-picker-section-title';
    heading.textContent = titleText;
    section.appendChild(heading);

    var sectionGrid = document.createElement('div');
    sectionGrid.className = 'avatar-picker-grid';

    options.forEach(function(opt) {
      var isSelected = opt.kind === 'logo'
        ? (currentLogoId === opt.logoId)
        : (!currentLogoId && currentPlatform === opt.key);
      var item = document.createElement('button');
      item.className = 'avatar-picker-item' + (isSelected ? ' selected' : '') + (opt.locked ? ' locked' : '');
      item.type = 'button';
      item.setAttribute('data-key', opt.key);
      item.setAttribute('aria-disabled', opt.locked ? 'true' : 'false');

      var img = document.createElement('img');
      img.src = opt.src;
      img.alt = opt.label;
      img.className = 'avatar-picker-img';
      img.onerror = function() { this.src = AVATAR_FALLBACK; };

      var lbl = document.createElement('span');
      lbl.className = 'avatar-picker-lbl';
      lbl.textContent = opt.label;

      var meta = document.createElement('span');
      meta.className = 'avatar-picker-meta';
      meta.textContent = opt.meta || '';

      item.appendChild(img);
      item.appendChild(lbl);
      item.appendChild(meta);

      item.addEventListener('click', function() {
        if (opt.locked) {
          showToast(opt.meta || 'This profile logo is still locked.', 'info');
          return;
        }
        selectAvatarOption(opt, profileData, profAvatar, pop);
      });

      sectionGrid.appendChild(item);
    });

    section.appendChild(sectionGrid);
    grid.appendChild(section);
  }

  appendSection('Linked Avatars', platformOptions);
  appendSection('Unlocked Logos', unlockedLogoOptions);
  appendSection('Locked Logos', lockedLogoOptions);

  pop.appendChild(grid);

  // Position below the anchor
  var rect = anchorEl.getBoundingClientRect();
  document.body.appendChild(pop);
  _avatarPickerPopover = pop;

  // Position: try below-right of anchor, nudge if off-screen
  var popRect = pop.getBoundingClientRect();
  var left = rect.left + window.scrollX;
  var top  = rect.bottom + window.scrollY + 8;
  if (left + popRect.width > window.innerWidth - 12) left = window.innerWidth - popRect.width - 12;
  pop.style.left = left + 'px';
  pop.style.top  = top  + 'px';

  // Close on outside click
  setTimeout(function() {
    document.addEventListener('click', closeAvatarPicker, { once: true });
  }, 0);
}

function selectAvatarOption(opt, profileData, profAvatar, pop) {
  var nextSrc = resolveAvatar(opt.src);
  profAvatar.src = nextSrc;
  markAvatarFallback(profAvatar);
  var headerAv = document.getElementById('user-avatar');
  if (headerAv) { headerAv.src = nextSrc; markAvatarFallback(headerAv); }
  var previewAv = document.getElementById('preview-avatar');
  if (previewAv) { previewAv.src = nextSrc; markAvatarFallback(previewAv); }

  // Re-render cosmetics so ring/glow layers adapt to logo vs regular avatar geometry
  var cosmeticData = (profile && profile.cosmetics) || (profileData && profileData.cosmetics) || [];
  applyHeroCosmetics(cosmeticData);
  applyHeaderCosmetics(cosmeticData);

  pop.querySelectorAll('.avatar-picker-item').forEach(function(el) {
    el.classList.toggle('selected', el.dataset.key === opt.key);
  });

  var body = {};
  if (opt.kind === 'logo') {
    body.preferred_profile_logo_id = opt.logoId;
    body.preferred_pfp_platform = null;
  } else {
    body.preferred_profile_logo_id = null;
    body.preferred_pfp_platform = opt.key;
  }

  fetch('/api/me/prefs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })
  .then(function(r) { return r.json(); })
  .then(function(d) {
    if (d.ok !== false) {
      showToast(opt.kind === 'logo' ? 'Profile logo updated.' : 'Profile picture updated.', 'success');
      if (profileData) {
        if (profileData.preferences) {
          profileData.preferences.preferred_pfp_platform = body.preferred_pfp_platform;
          profileData.preferences.preferred_profile_logo_id = body.preferred_profile_logo_id;
        }
        applyProfileLogoSelectionState(profileData, body.preferred_profile_logo_id);
        profileData.resolvedProfilePic = nextSrc;
        if (profileData.profile) profileData.profile.profilePic = nextSrc;
      }
      if (profile) {
        if (profile.preferences) {
          profile.preferences.preferred_pfp_platform = body.preferred_pfp_platform;
          profile.preferences.preferred_profile_logo_id = body.preferred_profile_logo_id;
        }
        applyProfileLogoSelectionState(profile, body.preferred_profile_logo_id);
        profile.resolvedProfilePic = nextSrc;
        if (profile.profile) profile.profile.profilePic = nextSrc;
      }
    } else {
      showToast('Could not save — try again.', 'error');
    }
    closeAvatarPicker();
  })
  .catch(function() {
    showToast('Could not save — check connection.', 'error');
    closeAvatarPicker();
  });
}

function renderVisitRecap(data) {
  var card = document.getElementById('visit-recap');
  if (!card) return;
  var titleEl = document.getElementById('visit-recap-title');
  var timeEl = document.getElementById('visit-recap-time');
  var copyEl = document.getElementById('visit-recap-copy');
  var chipsEl = document.getElementById('visit-recap-chips');
  var actionsEl = document.getElementById('visit-recap-actions');
  var key = getPortalVisitSnapshotKey(data);
  var current = getPortalVisitSnapshot(data);

  portalVisitSnapshotState.storageKey = key;
  portalVisitSnapshotState.current = current;
  if (!portalVisitSnapshotState.previous || portalVisitSnapshotState.previous.__key !== key) {
    var loaded = loadStoredPortalVisitSnapshot(key);
    portalVisitSnapshotState.previous = loaded ? Object.assign({ __key: key }, loaded) : null;
  }

  card.hidden = false;
  if (!current) {
    titleEl.textContent = 'We will start tracking once your profile loads.';
    timeEl.textContent = '';
    copyEl.textContent = 'This device will remember what changed between visits.';
    chipsEl.innerHTML = '';
    actionsEl.innerHTML = '';
    return;
  }

  var prev = portalVisitSnapshotState.previous;
  if (!prev) {
    titleEl.textContent = 'This is your first tracked visit on this device.';
    timeEl.textContent = 'starting now';
    copyEl.textContent = 'Next time you come back, we will summarize new XP, wins, words, cosmetics, and streak changes here.';
    chipsEl.innerHTML = '';
    actionsEl.innerHTML = '<button type="button" class="visit-recap-action" onclick="switchToTab(&quot;profile&quot;)">Open Profile</button>';
    return;
  }

  var deltas = [];
  var coinsDelta = current.coins - Number(prev.coins || 0);
  var winsDelta = current.wins - Number(prev.wins || 0);
  var wordsDelta = current.words - Number(prev.words || 0);
  var cosmeticsDelta = current.cosmeticsOwned - Number(prev.cosmeticsOwned || 0);
  var businessDelta = current.businessesOwned - Number(prev.businessesOwned || 0);
  var streakDelta = current.streak - Number(prev.streak || 0);
  var dailyDelta = current.dailyDone - Number(prev.dailyDone || 0);
  var weeklyDelta = current.weeklyDone - Number(prev.weeklyDone || 0);

  if (coinsDelta > 0) deltas.push(buildVisitDeltaChip('XP', coinsDelta, 'mint'));
  if (winsDelta > 0) deltas.push(buildVisitDeltaChip('wins', winsDelta, 'gold'));
  if (wordsDelta > 0) deltas.push(buildVisitDeltaChip('words', wordsDelta, 'blue'));
  if (cosmeticsDelta > 0) deltas.push(buildVisitDeltaChip('cosmetics', cosmeticsDelta, 'violet'));
  if (businessDelta > 0) deltas.push(buildVisitDeltaChip('businesses', businessDelta, 'mint'));
  if (streakDelta > 0) deltas.push(buildVisitDeltaChip('streak days', streakDelta, 'gold'));
  if (dailyDelta > 0) deltas.push(buildVisitDeltaChip('daily clears', dailyDelta, 'blue'));
  if (weeklyDelta > 0) deltas.push(buildVisitDeltaChip('weekly clears', weeklyDelta, 'violet'));

  timeEl.textContent = formatElapsedVisitTime(prev.at);
  if (deltas.length === 0) {
    titleEl.textContent = 'No tracked account changes yet.';
    copyEl.textContent = 'You are caught up since your last visit on this device. Play a few boards, claim rewards, or check your profile again later.';
    chipsEl.innerHTML = '';
    actionsEl.innerHTML = '<button type="button" class="visit-recap-action" onclick="switchToTab(&quot;wordgames&quot;)">Open Word Games</button>';
    return;
  }

  titleEl.textContent = 'You made progress since last time.';
  if (cosmeticsDelta > 0) {
    copyEl.textContent = 'Your profile inventory changed, so your newest unlocks are probably worth checking first.';
    actionsEl.innerHTML = '<button type="button" class="visit-recap-action primary" onclick="switchToTab(&quot;profile&quot;)">Review Profile Unlocks</button>';
  } else if (businessDelta > 0) {
    copyEl.textContent = 'Your business side grew too, so it may be worth checking new passive income or upgrades.';
    actionsEl.innerHTML = '<button type="button" class="visit-recap-action primary" onclick="openEmpireView()">Open Empire</button>';
  } else {
    copyEl.textContent = 'Your puzzle and reward progress moved forward. The Today panel is the fastest place to keep momentum going.';
    actionsEl.innerHTML = '<button type="button" class="visit-recap-action primary" onclick="switchToTab(&quot;wordgames&quot;)">Keep Playing</button>';
  }
  chipsEl.innerHTML = deltas.join('');
}

function startPresenceHeartbeat(source) {
  if (!portalUser) return;
  if (!isPortalPresenceEligible()) {
    stopPresenceHeartbeat();
    return;
  }
  void sendPresenceHeartbeat(source || 'portal-focus');
  if (presenceHeartbeatInterval) return;
  presenceHeartbeatInterval = setInterval(function() {
    if (!isPortalPresenceEligible()) {
      stopPresenceHeartbeat();
      return;
    }
    void sendPresenceHeartbeat('web-heartbeat');
  }, PRESENCE_HEARTBEAT_MS);
}

// Pause intervals when tab is hidden, resume + re-sync when visible
document.addEventListener('visibilitychange', function() {
  if (document.hidden) {
    saveCurrentPortalVisitSnapshot();
    // Pause intervals to save CPU
    if (dailyCountdownInterval) { clearInterval(dailyCountdownInterval); dailyCountdownInterval = null; }
    if (liveGamesInterval) { clearInterval(liveGamesInterval); liveGamesInterval = null; }
    if (pizzaCollectTimer) { clearInterval(pizzaCollectTimer); pizzaCollectTimer = null; }
    stopPresenceHeartbeat();
  } else {
    // Resume intervals
    if (!dailyCountdownInterval) {
      updateDailyCountdown();
      dailyCountdownInterval = setInterval(updateDailyCountdown, 1000);
    }
    // Force fresh sync on tab resume (bypass 5-min TTL)
    spSyncTimestamp = 0;
    if (isWordGamesTabActive()) {
      startLivePolling();
      ensurePortalChallengeData();
    }
    startPresenceHeartbeat('web-focus');
  }
});

window.addEventListener('focus', function() {
  // Force fresh sync on window focus (bypass 5-min TTL)
  spSyncTimestamp = 0;
  if (isWordGamesTabActive()) ensurePortalChallengeData();
  startPresenceHeartbeat('web-focus');
});

window.addEventListener('blur', function() {
  stopPresenceHeartbeat();
});

window.addEventListener('pagehide', function() {
  saveCurrentPortalVisitSnapshot();
});

document.addEventListener('DOMContentLoaded', () => {
  checkSession();
  setupTabs();
  // Guest-hub "Sign in" affordances (header button + gated-tab CTAs). Delegated
  // so it covers buttons injected after load.
  document.addEventListener('click', (e) => {
    const t = e.target.closest && e.target.closest('[data-guest-signin]');
    if (t) { e.preventDefault(); openGuestLogin(); }
  });
  setupLogout();
  setupThemeToggle();
  setupTodaySurface();
  setupHistoryControls();
  setupNewCosmeticsModal();
  setupCosmeticPickerModal();
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
      // Login screen no longer shows, so surface OAuth errors as a toast.
      const msgs = { denied: 'Login was cancelled.', invalid_state: 'Invalid state. Please try again.', auth_failed: 'Authentication failed. Please try again.' };
      showToast(msgs[error] || 'Login error. Please try again.', 'error', 5000);
    }
    history.replaceState({}, '', '/me');
  } else if (linked === 'success') {
    showToast('Account linked successfully!', 'success');
    history.replaceState({}, '', '/me');
  }

  // jorry.live "Donor Class" pill lands on /me?donor=1 — remember the intent
  // in sessionStorage (it must survive the OAuth full-page redirect), then
  // checkSession's showPortal/showLoggedOut consume it: logged-in users jump
  // straight into the $2/mo Donor Class Stripe checkout, logged-out users get
  // the sign-in modal first and the checkout resumes after login. 15-minute
  // expiry so an abandoned attempt doesn't fire a surprise checkout later.
  if (params.get('donor') === '1') {
    try { sessionStorage.setItem('wt_donor_intent', String(Date.now())); } catch (e) {}
    history.replaceState({}, '', '/me');
  }
});

function consumeDonorIntent() {
  try {
    var ts = Number(sessionStorage.getItem('wt_donor_intent') || 0);
    if (!ts) return false;
    sessionStorage.removeItem('wt_donor_intent');
    return (Date.now() - ts) < 15 * 60 * 1000;
  } catch (e) { return false; }
}

// ─── Session ────────────────────────────────────────────────────────

async function checkSession() {
  loadPremiumEntitlement(); // fire early — the click interceptor awaits it
  updateDonorClassCard();   // reveal the hub Donor Class card for non-members
  try {
    const res = await fetch('/api/me/session');
    const data = await res.json();
    if (data.ok) {
      showPortal(data.user);
    } else {
      showLoggedOut();
    }
  } catch {
    showLoggedOut();
  }
}

// Logged-out entry: the login wall is gone (2026-07-16) — visitors land
// straight in the guest hub. The Today Panel shows the sign-in hero and the
// header keeps its "Sign in" button.
function showLoggedOut() {
  enterGuestMode();
  // Donor deep-link while logged out: prompt sign-in, and RE-SET the intent
  // (consumeDonorIntent cleared it) so the checkout auto-opens in showPortal
  // after the OAuth redirect brings them back. _donorPromptShown guards
  // against showLoggedOut running more than once per page load (double
  // toast otherwise, since the re-set intent would be consumed again).
  if (!window._donorPromptShown && consumeDonorIntent()) {
    window._donorPromptShown = true;
    try { sessionStorage.setItem('wt_donor_intent', String(Date.now())); } catch (e) {}
    showToast('Sign in first — your $2/mo Donor Class checkout will open right after.', 'info', 6000);
    openGuestLogin();
  }
}

function showLogin() {
  portalBootDeferred = false;
  portalChallengeSyncPromise = null;
  stopLivePolling();
  stopPresenceHeartbeat();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('portal-screen').style.display = 'none';
}

function showPortal(user) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('portal-screen').style.display = 'block';

  // Set user info in header
  document.getElementById('user-name').textContent = user.globalName || user.username;
  const avatarEl = document.getElementById('user-avatar');
  avatarEl.src = resolveAvatar(user.avatar);
  avatarEl.style.display = 'block';
  avatarEl.onerror = function() { this.onerror = null; this.src = AVATAR_FALLBACK; };

  // Store for iframe auth
  portalUser = user;
  // Track provider for linking UI
  portalProvider = user.provider || (user.id && user.id.startsWith('gh_') ? 'github' : user.id && user.id.startsWith('go_') ? 'google' : 'discord');

  // Restore last active tab
  restoreTab();

  // Load core profile data immediately, but let the rest of the boot
  // work wait until the first paint or the user opens the relevant tab.
  loadProfile();
  scheduleDeferredPortalBoot();

  // jorry.live Donor Class deep link — signed in, so open the checkout now.
  if (consumeDonorIntent()) {
    showToast('Opening Donor Class checkout…', 'info', 4000);
    beginPassCheckout('donor_class');
  }
}

// ─── Guest (logged-out) hub ─────────────────────────────────────────
// Shown when a logged-out visitor dismisses the login prompt. Reveals the
// real hub layout instead of the bare logo: Word Games + How to Play are
// fully browsable; account tabs render a "Sign in to unlock" gate. Any
// provider choice reloads the page through OAuth, so no state needs undoing.
var guestMode = false;
var GUEST_ALLOWED_TABS = { wordgames: 1, howtoplay: 1 };
var GUEST_TAB_LABELS = {
  profile: 'your Profile',
  businesses: 'your Tycoon Empire',
  library: 'your Library &amp; businesses',
  store:   'the Cosmetics Store',
  pass:    'Membership plans',
  history: 'your History'
};

function enterGuestMode() {
  guestMode = true;
  try { sessionStorage.setItem('wt_guest', '1'); } catch (e) {}
  document.body.classList.add('guest-mode');
  var ls = document.getElementById('login-screen');
  var ps = document.getElementById('portal-screen');
  if (ls) ls.style.display = 'none';
  if (ps) ps.style.display = 'block';
  // Point the sign-in hero's provider buttons back at this page after OAuth.
  var rt = encodeURIComponent(window.location.pathname + window.location.search);
  document.querySelectorAll('#guest-hero [data-auth-provider]').forEach(function (a) {
    a.href = '/auth/' + a.getAttribute('data-auth-provider') + '?returnTo=' + rt;
  });
  restoreTab();
}
// Exposed for the inline login-card dismiss handler in index.html.
window.enterGuestMode = enterGuestMode;

// Open the login prompt as a modal (header "Sign in" button + gated-tab CTAs).
function openGuestLogin() {
  if (!window.LoginPrompt || !window.LoginPrompt.showModal) {
    window.location.href = '/me';
    return;
  }
  window.LoginPrompt.showModal({
    headline: 'Sign in to Word Tycoon',
    returnTo: window.location.pathname + window.location.search
  });
}

// Replace an account tab's contents with a sign-in gate. The real children are
// hidden (not removed) — a successful login reloads the page from scratch.
function renderGuestGate(tabId) {
  var el = document.getElementById('tab-' + tabId);
  if (!el) return;
  Array.prototype.forEach.call(el.children, function (c) {
    if (!c.classList || !c.classList.contains('guest-gate')) c.style.display = 'none';
  });
  var gate = el.querySelector('.guest-gate');
  if (!gate) {
    gate = document.createElement('div');
    gate.className = 'guest-gate';
    gate.innerHTML =
      '<div class="guest-gate-card">' +
        '<img src="/portal/img/logo.png" alt="" class="guest-gate-logo">' +
        '<h2 class="guest-gate-title">Sign in to unlock ' + (GUEST_TAB_LABELS[tabId] || 'this') + '</h2>' +
        '<p class="guest-gate-sub">Create a free account or sign in to save your progress, cosmetics, and stats — they carry across every Word Tycoon game.</p>' +
        '<button type="button" class="guest-gate-btn" data-guest-signin>Sign in</button>' +
      '</div>';
    el.appendChild(gate);
  }
  gate.style.display = '';
}

// ─── Tabs ───────────────────────────────────────────────────────────

function switchToTab(tabId) {
  // Migrate legacy saved tabs
  if (tabId === 'overview') tabId = 'wordgames';
  if (tabId === 'cosmetics' || tabId === 'friends') tabId = 'profile';
  if (tabId === 'history') tabId = 'profile';

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  var tabBtn = document.querySelector('.tab[data-tab="' + tabId + '"]');
  if (tabBtn) tabBtn.classList.add('active');
  var tabContent = document.getElementById('tab-' + tabId);
  if (tabContent) tabContent.classList.add('active');

  // Guest mode: account tabs show a sign-in gate instead of loading user data.
  if (guestMode && !GUEST_ALLOWED_TABS[tabId]) {
    stopLivePolling();
    renderGuestGate(tabId);
    try { localStorage.setItem('portal_tab', tabId); } catch (e) {}
    return;
  }

  // Load tab data when tab becomes visible
  if (tabId === 'store') loadStore();
  if (tabId === 'pass') loadPass();
  if (tabId === 'history') loadHistory();
  if (tabId === 'wordgames') {
    renderWordGamesTab();
    if (!guestMode) {
      ensurePortalChallengeData();
      startLivePolling();
    }
  } else {
    stopLivePolling();
  }
  if (tabId === 'library') { if (!libraryLoaded) loadLibrary(); }
  if (tabId === 'businesses') {
    if (window.Empire && typeof window.Empire.render === 'function') window.Empire.render(profile);
  }
  if (tabId === 'newspaper') loadNewspaperRoute();
  if (tabId === 'gym') loadGymClub();
  if (tabId === 'cinema') loadCinemaTheater();
  if (tabId === 'startup') loadStartupHub();
  if (tabId === 'bank') loadBankVault();
  if (tabId === 'profile') {
    const cosmeticFilter = document.getElementById('cosmetic-category-filter');
    if (cosmeticFilter && !cosmeticFilter.dataset.userChanged) cosmeticFilter.value = 'equipped';
    renderCosmetics(profile?.cosmetics, cosmeticFilter?.value || 'equipped');
    maybeShowNewCosmeticsModal();
    loadFriends();
  }

  // Remember active tab
  try { localStorage.setItem('portal_tab', tabId); } catch(e) {}
}

function setupTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    if (!tab.dataset.tab) return;
    tab.addEventListener('click', () => {
      switchToTab(tab.dataset.tab);
    });
  });
}

function isProfileTabActive() {
  return !!document.getElementById('tab-profile')?.classList.contains('active');
}

function isWordGamesTabActive() {
  return !!document.getElementById('tab-wordgames')?.classList.contains('active');
}

function scheduleDeferredPortalBoot() {
  if (portalBootDeferred) return;
  portalBootDeferred = true;
  var runner = function() {
    connectChat();
    if (isPortalPresenceEligible()) {
      startPresenceHeartbeat('portal-focus');
    }
    if (isWordGamesTabActive()) {
      ensurePortalChallengeData();
      startLivePolling();
    }
  };
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(runner, { timeout: 1200 });
  } else {
    window.setTimeout(runner, 150);
  }
}

function ensurePortalChallengeData() {
  if (portalChallengeSyncPromise) return portalChallengeSyncPromise;
  renderDailyTracker();
  renderWeeklyTracker();
  portalChallengeSyncPromise = syncCompletionsFromServer().then(function() {
    renderDailyTracker();
    renderWeeklyTracker();
  }).finally(function() {
    portalChallengeSyncPromise = null;
  });
  return portalChallengeSyncPromise;
}

function refreshWordGamesLiveSurface() {
  renderDailyTracker();
  renderWeeklyTracker();
  if (!isWordGamesTabActive()) return;
  if (wgOpenGame) return;
  wgRendered = false;
  renderWordGamesTab();
}

function restoreTab() {
  try {
    var saved = localStorage.getItem('portal_tab');
    var validTabs = new Set(['wordgames', 'profile', 'library', 'businesses', 'store', 'pass', 'history', 'howtoplay']);
    if (saved && validTabs.has(saved)) {
      switchToTab(saved);
    } else {
      switchToTab('wordgames');
    }
  } catch(e) {
    switchToTab('wordgames');
  }
}

// ─── Word Games Tab ─────────────────────────────────────────────────

var wgRendered = false;
var wgLoadedPanels = {};
var wgOpenGame = null;
var wgExpandedCard = null;
var wgPanelCache = {};
var bizOpenType = null;
var businessTaxSeasonStatus = null;
var portalBootDeferred = false;
var portalChallengeSyncPromise = null;

var LOCAL_ONLY_SP_NOTICE = 'Single-player record stays on this browser/device only.';

var WG_PROFILE_RECORD_ALIASES = {
  sproutle: 'erectangled',
  erectangled: 'sproutle'
};

// Panel HTML templates for each game — preserves all existing element IDs
var WG_PANEL_TEMPLATES = {
  searchle: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid searchle-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="searchle-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="searchle-avg">-</div></div>' +
      '</div>' +
      '<div id="searchle-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '" class="play-btn">Play Searchle</a>' +
      '<h3 class="section-title" style="margin-top:1.5rem">Single Player</h3>' +
      '<div class="stats-grid searchle-sp-stats">' +
        '<div class="stat-card accent"><div class="stat-label">SP Wins</div><div class="stat-value" id="searchle-sp-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="searchle-sp-avg">-</div></div>' +
      '</div>' +
      '<div id="searchle-sp-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + getLaunchHref(getSoloLaunchUrl(g, getDailyStatus())) + '" class="play-btn">Play Solo</a>';
  },
  word500: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid word500-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="word500-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="word500-avg">-</div></div>' +
      '</div>' +
      '<div id="word500-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '" class="play-btn">Play Word5000</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid word500-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="word500sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Win Rate</div><div class="stat-value" id="word500sp-winrate">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="word500sp-avg">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best Streak</div><div class="stat-value" id="word500sp-streak">-</div></div>' +
      '</div>' +
      '<div id="word500sp-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + getLaunchHref(getSoloLaunchUrl(g, getDailyStatus())) + '" class="play-btn">Play Word5000 Solo</a>';
  },
  betwixt: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid betwixt-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="betwixt-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="betwixt-avg">-</div></div>' +
      '</div>' +
      '<div id="betwixt-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid betwixt-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="betwixt-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Win Rate</div><div class="stat-value" id="betwixt-sp-winrate">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="betwixt-sp-avg">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Win Streak</div><div class="stat-value" id="betwixt-sp-streak">-</div></div>' +
      '</div>' +
      '<div id="betwixt-sp-history" class="history-list"><div class="loading-placeholder">' + LOCAL_ONLY_SP_NOTICE + '</div></div>' +
      '<a href="' + getLaunchHref(getSoloLaunchUrl(g, getDailyStatus())) + '" class="play-btn">Play Solo</a>';
  },
  wordle: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid wordle-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="wordle-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="wordle-avg">-</div></div>' +
      '</div>' +
      '<div id="wordle-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid wordle-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="wordle-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Win Rate</div><div class="stat-value" id="wordle-sp-winrate">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="wordle-sp-avg">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Win Streak</div><div class="stat-value" id="wordle-sp-streak">-</div></div>' +
      '</div>' +
      '<div id="wordle-sp-history" class="history-list"><div class="loading-placeholder">' + LOCAL_ONLY_SP_NOTICE + '</div></div>' +
      '<a href="' + getLaunchHref(getSoloLaunchUrl(g, getDailyStatus())) + '" class="play-btn">Play Solo</a>';
  },
  pixeletters: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid pixeletters-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="pixeletters-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="pixeletters-avg">-</div></div>' +
      '</div>' +
      '<div id="pixeletters-history" class="history-list"><div class="loading-placeholder">Loading...</div></div>' +
      '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid pixeletters-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="pixeletters-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Win Rate</div><div class="stat-value" id="pixeletters-sp-winrate">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Guesses</div><div class="stat-value" id="pixeletters-sp-avg">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best Streak</div><div class="stat-value" id="pixeletters-sp-streak">-</div></div>' +
      '</div>' +
      '<div id="pixeletters-sp-history" class="history-list"><div class="loading-placeholder">' + LOCAL_ONLY_SP_NOTICE + '</div></div>' +
      '<a href="' + getLaunchHref(getSoloLaunchUrl(g, getDailyStatus())) + '" class="play-btn">Play Solo</a>';
  },
  spellingbee: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid spellingbee-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Words Found</div><div class="stat-value" id="spellingbee-words">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="spellingbee-games">-</div></div>' +
      '</div>' +
      '<div id="spellingbee-history" class="history-list"><div class="loading-placeholder">No Spelling Bee games yet</div></div>' +
      '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid spellingbee-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="spellingbee-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Completed</div><div class="stat-value" id="spellingbee-sp-completed">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Words Found</div><div class="stat-value" id="spellingbee-sp-words">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best %</div><div class="stat-value" id="spellingbee-sp-best">-</div></div>' +
      '</div>' +
      '<div id="spellingbee-sp-history" class="history-list"><div class="loading-placeholder">' + LOCAL_ONLY_SP_NOTICE + '</div></div>' +
      '<a href="' + getLaunchHref(getSoloLaunchUrl(g, getDailyStatus())) + '" class="play-btn">Play Solo</a>';
  },
  rectangled: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid rectangled-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Words Found</div><div class="stat-value" id="rectangled-words">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="rectangled-games">-</div></div>' +
      '</div>' +
      '<div id="rectangled-history" class="history-list"><div class="loading-placeholder">No recTangled games yet</div></div>' +
      '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid rectangled-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="rectangled-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Completed</div><div class="stat-value" id="rectangled-sp-completed">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Words Found</div><div class="stat-value" id="rectangled-sp-words">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best %</div><div class="stat-value" id="rectangled-sp-best">-</div></div>' +
      '</div>' +
      '<div id="rectangled-sp-history" class="history-list"><div class="loading-placeholder">' + LOCAL_ONLY_SP_NOTICE + '</div></div>' +
      '<a href="' + getLaunchHref(getSoloLaunchUrl(g, getDailyStatus())) + '" class="play-btn">Play Solo</a>';
  },
  sproutle: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid sproutle-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Words Found</div><div class="stat-value" id="sproutle-words">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="sproutle-games">-</div></div>' +
      '</div>' +
      '<div id="sproutle-history" class="history-list"><div class="loading-placeholder">No erecTangled games yet</div></div>' +
      '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid sproutle-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="sproutle-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Completed</div><div class="stat-value" id="sproutle-sp-completed">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Words Found</div><div class="stat-value" id="sproutle-sp-words">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best %</div><div class="stat-value" id="sproutle-sp-best">-</div></div>' +
      '</div>' +
      '<div id="sproutle-sp-history" class="history-list"><div class="loading-placeholder">' + LOCAL_ONLY_SP_NOTICE + '</div></div>' +
      '<a href="' + getLaunchHref(getSoloLaunchUrl(g, getDailyStatus())) + '" class="play-btn">Play Solo</a>';
  },
  figural: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Multiplayer</h3>' +
      '<div class="stats-grid figural-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Total Wins</div><div class="stat-value" id="figural-wins">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="figural-games">-</div></div>' +
      '</div>' +
      '<div id="figural-history" class="history-list"><div class="loading-placeholder">No Figural games yet</div></div>' +
      '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '" class="play-btn">Play Multiplayer</a>' +
      '<div class="sp-divider"></div>' +
      '<h3 class="section-title">Single Player</h3>' +
      '<div class="stats-grid figural-sp-stats">' +
        '<div class="stat-card"><div class="stat-label">Games Played</div><div class="stat-value" id="figural-sp-games">-</div></div>' +
        '<div class="stat-card accent"><div class="stat-label">Win Rate</div><div class="stat-value" id="figural-sp-winrate">-</div></div>' +
      '</div>' +
      '<div id="figural-sp-history" class="history-list"><div class="loading-placeholder">' + LOCAL_ONLY_SP_NOTICE + '</div></div>' +
      '<a href="' + getLaunchHref(getSoloLaunchUrl(g, getDailyStatus())) + '" class="play-btn">Play Solo</a>';
  },
  unwordle: function(g) {
    return '<h3 class="section-title" style="margin-top:0">Single Player</h3>' +
      '<p style="color:var(--muted);font-size:0.85rem;margin-bottom:1rem">Reverse Wordle — fill in words to match the color patterns. ' + LOCAL_ONLY_SP_NOTICE + '</p>' +
      '<div class="stats-grid unwordle-sp-stats">' +
        '<div class="stat-card accent"><div class="stat-label">Puzzles Solved</div><div class="stat-value" id="unwordle-sp-solved">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Avg Time</div><div class="stat-value" id="unwordle-sp-avg">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Best Time</div><div class="stat-value" id="unwordle-sp-best">-</div></div>' +
        '<div class="stat-card"><div class="stat-label">Streak</div><div class="stat-value" id="unwordle-sp-streak">-</div></div>' +
      '</div>' +
      '<div id="unwordle-sp-history" class="history-list"><div class="loading-placeholder">' + LOCAL_ONLY_SP_NOTICE + '</div></div>' +
      '<a href="' + getLaunchHref(getSoloLaunchUrl(g, getDailyStatus())) + '" class="play-btn">Play UnWordle</a>';
  }
};

var GAME_DESCS = {
  searchle:    'Guess the hidden word from search engine results.',
  sproutle:    'Find words in a growing letter grid.',
  rectangled:  'Classic word-find puzzle on a letter grid.',
  word500:     'The classic mastermind game but for words.',
  wordle:      'The classic 5-letter word game.',
  betwixt:   'Find the word between two alphabetical bounds.',
  pixeletters: 'Unscramble pixelated letters to find the word.',
  spellingbee: 'Make words from 7 letters with a required center.',
  figural:     'Decode symbols into letters to find the word.',
  unwordle:    'Wordle in reverse \u2014 give clues, not guesses.',
  triangled:   'Find words on a triangular letter grid.',
  wikisearchle:'Guess the Wikipedia article title from the redacted text.',
  wikirectangled:'Word-find puzzle on a Wikipedia-themed letter grid.',
  junkdrawer:  'Drop & merge household items up to the Big TV.',
  synapse:     'Bridge two distant words through a constellation of meaning.'
};
GAME_DESCS.erectangled = GAME_DESCS.sproutle;
WG_PANEL_TEMPLATES.erectangled = WG_PANEL_TEMPLATES.sproutle;

var WG_FLAGSHIPS = ['searchle', 'erectangled'];
var DONATION_CHECKOUT_URL = 'https://buy.stripe.com/6oUbJ2b5x80m3sC9zhcfK00';

// ── Gameplay vignettes (2026-07-16) ─────────────────────────────────
// Each card banner is a miniature round of the actual game drawn in
// CSS (classes wgv-*, styled in portal.css) instead of a logo image.
// Games without an entry fall back to their PNG art.
var WG_VIGNETTES = {
  searchle:
    '<div class="wgv-spill wgv-s1"><span class="wgv-srank">1</span>HUMMING</div>' +
    '<div class="wgv-spill wgv-s2"><span class="wgv-srank">12</span>WHIRR</div>' +
    '<div class="wgv-spill wgv-s3"><span class="wgv-srank">44</span>BUZZ</div>',
  rectangled:
    '<div class="wgv-rgrid">' +
      '<span class="wgv-tile wgv-hit" style="--hc:#F5920A">W</span><span class="wgv-tile">K</span><span class="wgv-tile">E</span><span class="wgv-tile">M</span><span class="wgv-tile">A</span><span class="wgv-tile">T</span>' +
      '<span class="wgv-tile wgv-hit" style="--hc:#EFC000">O</span><span class="wgv-tile wgv-hit" style="--hc:#3EC8E8">R</span><span class="wgv-tile">I</span><span class="wgv-tile">N</span><span class="wgv-tile">G</span><span class="wgv-tile">S</span>' +
      '<span class="wgv-tile">P</span><span class="wgv-tile wgv-hit" style="--hc:#C835B8">D</span><span class="wgv-tile wgv-hit" style="--hc:#42B238">S</span><span class="wgv-tile">L</span><span class="wgv-tile">E</span><span class="wgv-tile">Y</span>' +
    '</div>',
  erectangled:
    '<div class="wgv-egrid">' +
      '<span class="wgv-tile">B</span><span class="wgv-tile wgv-hit wgv-sprout">G</span><span class="wgv-tile">K</span><span class="wgv-tile">M</span><span class="wgv-tile">A</span><span class="wgv-tile">T</span>' +
      '<span class="wgv-tile">L</span><span class="wgv-tile wgv-hit">R</span><span class="wgv-tile wgv-hit">O</span><span class="wgv-tile">N</span><span class="wgv-tile">P</span><span class="wgv-tile">S</span>' +
      '<span class="wgv-tile">P</span><span class="wgv-tile">D</span><span class="wgv-tile wgv-hit">W</span><span class="wgv-tile">L</span><span class="wgv-tile">E</span><span class="wgv-tile">Y</span>' +
    '</div>',
  word500:
    '<div class="wgv-w5wrap">' +
      '<div class="wgv-w5pill"><i class="wgv-g">W</i><i class="wgv-y">O</i><i>R</i><i class="wgv-g">D</i><i>S</i></div>' +
      '<div class="wgv-w5pill"><i class="wgv-g">W</i><i class="wgv-g">A</i><i class="wgv-y">G</i><i>E</i><i class="wgv-g">R</i></div>' +
      '<div class="wgv-w5pill wgv-empty"><i></i><i></i><i></i><i></i><i></i></div>' +
    '</div>',
  wordle:
    '<div class="wgv-wdwrap">' +
      '<div class="wgv-wdrow"><span class="wgv-tile wgv-wd-g">W</span><span class="wgv-tile wgv-wd-y">O</span><span class="wgv-tile wgv-wd-x">R</span><span class="wgv-tile wgv-wd-g">D</span><span class="wgv-tile wgv-wd-y">S</span></div>' +
      '<div class="wgv-wdrow"><span class="wgv-tile wgv-wd-e"></span><span class="wgv-tile wgv-wd-e"></span><span class="wgv-tile wgv-wd-e"></span><span class="wgv-tile wgv-wd-e"></span><span class="wgv-tile wgv-wd-e"></span></div>' +
    '</div>',
  betwixt:
    '<div class="wgv-bxwrap">' +
      '<div class="wgv-bxanchor">APPLE</div>' +
      '<div class="wgv-bxbubble"><span>?</span></div>' +
      '<div class="wgv-bxanchor">ZEBRA</div>' +
    '</div>',
  pixeletters:
    '<div class="wgv-px" style="--pc:#ff6b9d"><i></i><i></i><i></i><i></i><i class="wgv-o"></i><i></i><i></i><i></i><i></i><i></i><i class="wgv-o"></i><i class="wgv-o"></i><i></i><i class="wgv-o"></i><i class="wgv-o"></i></div>' +
    '<div class="wgv-px" style="--pc:#c084fc"><i></i><i class="wgv-o"></i><i></i><i class="wgv-o"></i><i></i><i class="wgv-o"></i><i class="wgv-o"></i><i></i><i class="wgv-o"></i><i class="wgv-o"></i><i></i><i class="wgv-o"></i><i></i><i class="wgv-o"></i><i></i></div>' +
    '<div class="wgv-px" style="--pc:#67e8f9"><i></i><i class="wgv-o"></i><i class="wgv-o"></i><i></i><i class="wgv-o"></i><i class="wgv-o"></i><i></i><i class="wgv-o"></i><i class="wgv-o"></i><i></i><i class="wgv-o"></i><i class="wgv-o"></i><i></i><i></i><i></i></div>',
  spellingbee:
    '<div class="wgv-hexwrap">' +
      '<div class="wgv-hex wgv-hex-c" style="left:37px;top:32px;">B</div>' +
      '<div class="wgv-hex" style="left:37px;top:0;">A</div>' +
      '<div class="wgv-hex" style="left:69px;top:16px;">N</div>' +
      '<div class="wgv-hex" style="left:69px;top:48px;">T</div>' +
      '<div class="wgv-hex" style="left:37px;top:64px;">E</div>' +
      '<div class="wgv-hex" style="left:5px;top:48px;">R</div>' +
      '<div class="wgv-hex" style="left:5px;top:16px;">O</div>' +
    '</div>',
  figural:
    '<div class="wgv-fgwrap">' +
      '<div class="wgv-fglegend">' +
        '<span class="wgv-fgchip"><span class="wgv-fgsym">▲</span>= A</span>' +
        '<span class="wgv-fgchip"><span class="wgv-fgsym">●</span>= E</span>' +
        '<span class="wgv-fgchip"><span class="wgv-fgsym">■</span>= ?</span>' +
      '</div>' +
      '<div class="wgv-fgword">' +
        '<span class="wgv-tile">▲</span><span class="wgv-tile">■</span><span class="wgv-tile">●</span><span class="wgv-tile">▲</span><span class="wgv-tile">■</span>' +
      '</div>' +
    '</div>',
  unwordle:
    '<div class="wgv-uwwrap">' +
      '<div class="wgv-uwrow"><span class="wgv-tile wgv-wd-g">?</span><span class="wgv-tile wgv-wd-y">?</span><span class="wgv-tile wgv-wd-g">?</span><span class="wgv-tile wgv-wd-x">?</span><span class="wgv-tile wgv-wd-y">?</span></div>' +
      '<div class="wgv-uwhint"><span class="wgv-uwarrow">⟲</span>FIND THE GUESS</div>' +
    '</div>',
  triangled:
    '<div class="wgv-trwrap">' +
      '<div class="wgv-trrow"><span class="wgv-trdot wgv-lit">T</span></div>' +
      '<div class="wgv-trrow"><span class="wgv-trdot">R</span><span class="wgv-trdot wgv-lit">I</span></div>' +
      '<div class="wgv-trrow"><span class="wgv-trdot wgv-lit">A</span><span class="wgv-trdot">N</span><span class="wgv-trdot">G</span></div>' +
    '</div>',
  wikisearchle:
    '<div class="wgv-wkwrap">' +
      '<div class="wgv-wktitle"><span class="wgv-wkw">W</span> ?????? ??? ????</div>' +
      '<div class="wgv-wkline"><i style="--f:2"></i><i class="wgv-dark" style="--f:1.2"></i><i style="--f:1"></i><i class="wgv-hitbar" style="--f:1.4"></i></div>' +
      '<div class="wgv-wkline"><i class="wgv-dark" style="--f:1"></i><i style="--f:2.2"></i><i class="wgv-dark" style="--f:1.4"></i></div>' +
      '<div class="wgv-wkline"><i style="--f:1.4"></i><i class="wgv-hitbar" style="--f:1"></i><i style="--f:1.8"></i><i class="wgv-dark" style="--f:.8"></i></div>' +
    '</div>',
  wikirectangled:
    '<div class="wgv-wrwrap">' +
      '<div class="wgv-wrline"><i style="--f:1.6"></i><i style="--f:1"></i><i style="--f:2"></i></div>' +
      '<div class="wgv-wrgrid">' +
        '<span class="wgv-tile wgv-hit">W</span><span class="wgv-tile">I</span><span class="wgv-tile">K</span><span class="wgv-tile">R</span><span class="wgv-tile">S</span>' +
        '<span class="wgv-tile">A</span><span class="wgv-tile wgv-hit">O</span><span class="wgv-tile wgv-hit">R</span><span class="wgv-tile">D</span><span class="wgv-tile">E</span>' +
      '</div>' +
    '</div>',
  junkdrawer:
    '<div class="wgv-jdwrap">' +
      '<div class="wgv-jdball" style="--jc:#f43f5e;width:20px;height:20px;font-size:9px;">🔑</div>' +
      '<div class="wgv-jdball" style="--jc:#8b5cf6;width:32px;height:32px;font-size:13px;">📱</div>' +
      '<div class="wgv-jdball" style="--jc:#f59e0b;width:48px;height:48px;font-size:20px;">👟</div>' +
      '<div class="wgv-jdball" style="--jc:#10b981;width:38px;height:38px;font-size:16px;">🎒</div>' +
      '<div class="wgv-jdball" style="--jc:#3b82f6;width:24px;height:24px;font-size:10px;">⌚</div>' +
    '</div>',
  synapse:
    '<div class="wgv-sywrap">' +
      '<div class="wgv-sylink" style="left:28px;top:22px;width:52px;transform:rotate(18deg);"></div>' +
      '<div class="wgv-sylink" style="left:82px;top:42px;width:44px;transform:rotate(12deg);"></div>' +
      '<div class="wgv-sylink" style="left:126px;top:52px;width:36px;transform:rotate(14deg);"></div>' +
      '<div class="wgv-synode wgv-sysun" style="left:0;top:2px;">SUN</div>' +
      '<div class="wgv-synode wgv-syp1" style="left:74px;top:30px;"></div>' +
      '<div class="wgv-synode wgv-syp2" style="left:116px;top:44px;"></div>' +
      '<div class="wgv-synode wgv-systar" style="left:154px;top:52px;">✦</div>' +
    '</div>'
};

function renderWordGamesTab() {
  if (wgRendered) return;
  wgRendered = true;

  var daily = getDailyStatus();
  var weekly = getWeeklyStatus();
  var counts = getPlayerCounts();

  // Build a map of live game data keyed by game id
  var liveMap = {};
  (cachedLiveGames || []).forEach(function(lg) {
    liveMap[lg.id] = lg;
    if (lg.id === 'sproutle') liveMap.erectangled = lg;
    if (lg.id === 'erectangled') liveMap.sproutle = lg;
  });

  // Build a map of live streamers grouped by gameId. Cards use this to
  // render a "(N) Streamers" pill that expands to the streamer list with
  // click-through links to <game>/<handle>.
  var streamersByGame = {};
  (cachedLiveStreamers || []).forEach(function(st) {
    if (!streamersByGame[st.gameId]) streamersByGame[st.gameId] = [];
    streamersByGame[st.gameId].push(st);
    // Mirror sproutle/erectangled the same way liveMap does so the
    // /me grid (which uses 'erectangled' as the canonical id) sees them.
    if (st.gameId === 'sproutle') {
      if (!streamersByGame.erectangled) streamersByGame.erectangled = [];
      streamersByGame.erectangled.push(st);
    }
    // searchle-grid is a render alias for searchle (same backend
    // session). The GAMES list only has 'searchle', so without this
    // alias jorrybeaufart (and any other grid-mode streamer) wouldn't
    // show up on the hub's Searchle flagship card.
    if (st.gameId === 'searchle-grid') {
      if (!streamersByGame.searchle) streamersByGame.searchle = [];
      streamersByGame.searchle.push(st);
    }
  });

  // ── Today Focus ────────────────────────────────────────────
  var dailyGames = GAMES.filter(function(g) { return isTrackedDailyGame(g); });
  var weeklyGames = GAMES.filter(function(g) { return isTrackedWeeklyGame(g); });
  var dailyDone = dailyGames.filter(function(g) { return daily[g.id]; }).length;
  var dailyTotal = dailyGames.length;
  var weeklyDone = weeklyGames.filter(function(g) { return weekly[g.id]; }).length;
  var weeklyTotal = weeklyGames.length;

  var rec = getRecommendation(daily, weekly, dailyDone, dailyTotal, weeklyDone, weeklyTotal);

  // Daily track chips
  var dailyChipsHtml = dailyGames.map(function(g) {
    var done = daily[g.id];
    var label = g.nameHtml || g.name;
    if (done) {
      return '<span class="wg-track-chip done">' + label + ' \u2713</span>';
    }
    return '<a href="' + getLaunchHref(getSoloLaunchUrl(g, daily)) + '"' + GAME_LAUNCH_ATTRS + ' class="wg-track-chip">' + label + '</a>';
  }).join('');

  // Weekly track chips
  var weeklyChipsHtml = weeklyGames.map(function(g) {
    var done = weekly[g.id];
    var label = g.nameHtml || g.name;
    if (done) {
      return '<span class="wg-track-chip done">' + label + ' \u2713</span>';
    }
    return '<a href="' + getLaunchHref(getWeeklyLaunchUrl(g)) + '"' + GAME_LAUNCH_ATTRS + ' class="wg-track-chip">' + label + '</a>';
  }).join('');

  var recHtml = '';
  if (rec) {
    recHtml = '<div class="wg-today-rec">' +
      '<span class="wg-today-rec-icon">' + rec.icon + '</span>' +
      '<span class="wg-today-rec-text">' + rec.text + '</span>' +
      (rec.link ? '<a href="' + getLaunchHref(resolveRecommendationLink(rec.link, daily, weekly)) + '"' + GAME_LAUNCH_ATTRS + ' class="wg-today-rec-link">' + rec.linkLabel + '</a>' : '') +
    '</div>';
  }

  var todayHtml = '<div class="wg-today-focus-inner">' +
    '<div class="wg-today-head">' +
      '<div>' +
        '<div class="wg-today-kicker">TODAY</div>' +
        '<div class="wg-today-title">Daily &amp; Weekly Progress</div>' +
      '</div>' +
    '</div>' +
    recHtml +
    '<div class="wg-track-grid">' +
      '<div class="wg-track-card daily">' +
        '<div class="wg-track-topline">' +
          '<strong>Daily Track</strong>' +
          '<span class="wg-track-pill">' + dailyDone + ' / ' + dailyTotal + '</span>' +
        '</div>' +
        '<div class="wg-track-chips">' + dailyChipsHtml + '</div>' +
      '</div>' +
      '<div class="wg-track-card weekly">' +
        '<div class="wg-track-topline">' +
          '<strong>Weekly Track</strong>' +
          '<span class="wg-track-pill">' + weeklyDone + ' / ' + weeklyTotal + '</span>' +
        '</div>' +
        '<div class="wg-track-chips">' + weeklyChipsHtml + '</div>' +
      '</div>' +
    '</div>' +
  '</div>';

  document.getElementById('wg-today-focus').innerHTML = todayHtml;

  // ── Flagship Row ───────────────────────────────────────────
  // Dynamic flagships — promote whichever games have streamers right now,
  // keeping at most 2 to preserve the 2-up flagship row layout. Sort by
  // streamer count (descending), then by total viewer count, then fall
  // back to WG_FLAGSHIPS for the empty / single-streamer cases. This way
  // a streamer playing WikiSearchle gets featured, instead of users
  // having to scroll past Searchle/erecTangled to find them.
  var flagshipIds = [];
  var gamesWithStreamers = GAMES
    .filter(function(g) { return (streamersByGame[g.id] || []).length > 0; })
    .map(function(g) {
      var sList = streamersByGame[g.id] || [];
      var viewerSum = sList.reduce(function(n, s) { return n + (s.viewerCount || 0); }, 0);
      return { id: g.id, count: sList.length, viewers: viewerSum };
    })
    .sort(function(a, b) {
      if (b.count !== a.count) return b.count - a.count;
      return b.viewers - a.viewers;
    });
  for (var i = 0; i < gamesWithStreamers.length && flagshipIds.length < 2; i++) {
    flagshipIds.push(gamesWithStreamers[i].id);
  }
  // Pad with default flagships (in original order) for empty slots.
  for (var j = 0; j < WG_FLAGSHIPS.length && flagshipIds.length < 2; j++) {
    if (flagshipIds.indexOf(WG_FLAGSHIPS[j]) === -1) flagshipIds.push(WG_FLAGSHIPS[j]);
  }

  var flagshipsArr = flagshipIds
    .map(function(id) { return GAMES.find(function(g) { return g.id === id; }); })
    .filter(Boolean);
  var flagshipHtml = flagshipsArr.map(function(g) {
    return buildWgCard(g, daily, weekly, counts, liveMap, true, streamersByGame);
  }).join('');
  document.getElementById('wg-flagship-row').innerHTML = flagshipHtml;

  // ── Games Grid ─────────────────────────────────────────────
  var gridGames = GAMES.filter(function(g) { return flagshipIds.indexOf(g.id) === -1; });
  var gridHtml = gridGames.map(function(g) {
    return buildWgCard(g, daily, weekly, counts, liveMap, false, streamersByGame);
  }).join('');
  document.getElementById('wg-games-grid').innerHTML = gridHtml;

  // Clear any cached inline drawers after a rerender.
  wgPanelCache = {};
  wgOpenGame = null;
  wgExpandedCard = null;
}

function buildWgCard(g, daily, weekly, counts, liveMap, isFlagship, streamersByGame) {
  var playerCount = counts[g.id] || 0;
  var live = liveMap[g.id];
  var dailyDone = daily[g.id];
  var weeklyDone = weekly[g.id];
  var hasDailyKey = !!g.dailyKey;
  var hasWeeklyKey = !!g.weeklyKey;
  var displayName = g.nameHtml || g.name;
  var desc = GAME_DESCS[g.id] || '';
  var streamers = (streamersByGame && streamersByGame[g.id]) || [];

  // Player count
  var countHtml = '';
  if (live || playerCount > 0) {
    countHtml = '<div class="gc-players">' +
      '<span class="gc-player-dot' + (live ? ' gc-player-live' : '') + '"></span>' +
      '<span class="gc-player-count">' + playerCount + '</span>' +
    '</div>';
  }

  // Daily or Weekly badge
  var dailyHtml = '';
  if (hasDailyKey) {
    dailyHtml = dailyDone
      ? '<div class="gc-daily done">DAILY <span class="gc-daily-check">\u2713</span></div>'
      : '<div class="gc-daily available">DAILY</div>';
  } else if (hasWeeklyKey) {
    dailyHtml = weeklyDone
      ? '<div class="gc-daily gc-weekly done">WEEKLY <span class="gc-daily-check">\u2713</span></div>'
      : '<div class="gc-daily gc-weekly available">WEEKLY</div>';
  }

  // Live badge
  var liveBadge = live ? '<div class="gc-live-badge">LIVE</div>' : '';

  // Jackpot
  var jackpot = live ? live.jackpot : 0;
  var coinsHtml = jackpot > 0 ? '<span class="wg-card-coins">\uD83D\uDFE2 ' + formatNumber(jackpot) + '</span>' : '';

  // Mode buttons
  var modesHtml = '<div class="gc-modes">';
  if (g.spUrl) modesHtml += '<a href="' + getLaunchHref(getSoloLaunchUrl(g, daily)) + '"' + GAME_LAUNCH_ATTRS + ' class="gc-mode-btn gc-mode-solo" onclick="event.stopPropagation()">Solo</a>';
  if (g.mpUrl) modesHtml += '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '"' + GAME_LAUNCH_ATTRS + ' class="gc-mode-btn gc-mode-online" onclick="event.stopPropagation()">Online</a>';
  modesHtml += '</div>';

  var flagshipClass = isFlagship ? ' wg-flagship' : '';
  var compactClass = isFlagship ? '' : ' wg-card-compact';
  var liveClass = live ? ' gc-is-live' : '';
  var clickHandler = isFlagship ? 'toggleGamePanel' : 'toggleCompactCard';

  // Flagship badge
  var badgeHtml = '';
  if (isFlagship) {
    var badgeLabel = 'FLAGSHIP';
    badgeHtml = '<div class="wg-flagship-badge">' + badgeLabel + '</div>';
  }

  // Streamers pill — placed inline at the right of .wg-card-top so it sits
  // alongside the title without overlapping the FLAGSHIP badge. Each
  // streamer entry shows their name + a green viewer-count badge (matches
  // the existing live-player-count green dot styling). Click-through goes
  // to <game>/<handle>. Only games with private-session support populate
  // this (cf. /api/streamers/live's whitelist).
  var streamersHtml = '';
  if (streamers.length > 0) {
    var nameLinks = streamers.map(function(st) {
      var name = (st.displayName || st.handle).replace(/[<>"]/g, '');
      var href = st.playerUrl || ('/' + st.handle);
      var viewers = (typeof st.viewerCount === 'number' && st.viewerCount > 0)
        ? '<span class="wg-streamer-viewers">' + formatNumber(st.viewerCount) + '</span>'
        : '';
      return '<a class="wg-streamer-link" href="' + href + '" target="_blank" rel="noopener" onclick="event.stopPropagation()">' +
        '<span class="wg-streamer-name">' + name + '</span>' + viewers +
      '</a>';
    }).join('');
    streamersHtml = '<div class="wg-streamers-pill" onclick="event.stopPropagation()">' +
      '<div class="wg-streamers-count">' +
        '<span class="wg-streamers-num">' + streamers.length + '</span>' +
        '<span class="wg-streamers-label">Streamer' + (streamers.length === 1 ? '' : 's') + '</span>' +
      '</div>' +
      '<div class="wg-streamers-list">' + nameLinks + '</div>' +
    '</div>';
  }

  // Chevron for compact cards
  var chevronHtml = isFlagship ? '' : '<span class="wg-card-expand-icon">\u203A</span>';

  // For non-flagship, wrap meta/footer/panel in collapsible body
  var bodyStart = isFlagship ? '' : '<div class="wg-card-body">';
  var bodyEnd = isFlagship ? '' : '</div>';

  // Poster banner — a miniature CSS round of the actual game (WG_VIGNETTES),
  // falling back to the PNG art for games without one. Replaces the icon.
  var artHtml = '<div class="wg-card-art' + (WG_VIGNETTES[g.id] ? ' wgv wgv--' + g.id : '') + '" aria-hidden="true">' +
    (WG_VIGNETTES[g.id] || '<img src="' + g.img + '" alt="" loading="lazy" decoding="async">') +
  '</div>';

  return '<div class="game-card wg-card-poster game-card--' + g.id + flagshipClass + compactClass + liveClass + '" style="--game-color:' + g.color + '" onclick="' + clickHandler + '(\'' + g.id + '\')">' +
    artHtml +
    badgeHtml +
    '<div class="wg-card-top">' +
      '<img src="' + g.img + '" alt="' + g.name + '" class="wg-card-icon">' +
      '<div class="wg-card-info">' +
        '<div class="wg-card-name-row">' +
          '<span class="wg-card-name">' + displayName + '</span>' +
          countHtml +
        '</div>' +
        '<div class="wg-card-desc">' + desc + '</div>' +
      '</div>' +
      streamersHtml +
      chevronHtml +
    '</div>' +
    bodyStart +
    '<div class="wg-card-meta">' +
      dailyHtml + liveBadge + coinsHtml +
    '</div>' +
    '<div class="wg-card-footer">' +
      modesHtml +
    '</div>' +
    '<div class="wg-inline-panel-slot" id="wg-inline-panel-slot-' + g.id + '"></div>' +
    bodyEnd +
  '</div>';
}

function getWgGameDef(gameId) {
  return GAMES.find(function(g) { return g.id === gameId; }) || null;
}

function enhanceWgPanelMenus(panel) {
  if (!panel || panel.dataset.menusEnhanced === '1') return;
  panel.dataset.menusEnhanced = '1';

  var titles = Array.from(panel.querySelectorAll('.section-title'));
  titles.forEach(function(title, idx) {
    var details = document.createElement('details');
    details.className = 'wg-stat-menu';
    if (idx === 0) details.open = true;

    var summary = document.createElement('summary');
    summary.className = 'wg-stat-menu-summary';
    summary.textContent = title.textContent || 'Stats';
    details.appendChild(summary);

    var body = document.createElement('div');
    body.className = 'wg-stat-menu-body';

    var next = title.nextSibling;
    while (next && !(next.nodeType === 1 && next.classList && next.classList.contains('section-title'))) {
      var current = next;
      next = next.nextSibling;
      body.appendChild(current);
    }

    details.appendChild(body);
    title.replaceWith(details);
  });
}

function getWgProfileRecord(gameId) {
  var records = (((profile || {}).profile || {}).gameStats || {}).perGameRecords || [];
  var gameDef = getWgGameDef(gameId);
  var keys = [gameId];
  if (gameDef && gameDef.statsKey) keys.push(gameDef.statsKey);
  if (WG_PROFILE_RECORD_ALIASES[gameId]) keys.push(WG_PROFILE_RECORD_ALIASES[gameId]);
  if (gameDef && WG_PROFILE_RECORD_ALIASES[gameDef.statsKey]) keys.push(WG_PROFILE_RECORD_ALIASES[gameDef.statsKey]);
  for (var i = 0; i < records.length; i++) {
    if (keys.indexOf(records[i].game) !== -1) return records[i];
  }
  return null;
}

function buildWgProfileSummary(gameId) {
  var gameDef = getWgGameDef(gameId);
  var record = getWgProfileRecord(gameId);
  var displayName = gameDef ? (gameDef.nameHtml || gameDef.name) : prettyGameName(gameId);
  if (!record) {
    return '<div class="wg-profile-summary-empty">' +
      '<div class="wg-profile-summary-kicker">Your Record</div>' +
      '<div class="wg-profile-summary-title">' + displayName + '</div>' +
      '<div class="wg-profile-summary-copy">No account-wide stats recorded for this game yet.</div>' +
    '</div>';
  }

  var wins = Number(record.wins || 0);
  var words = Number(record.uniqueWords != null ? record.uniqueWords : record.unique_words || 0);
  var dailyClears = Number(record.dailyClears != null ? record.dailyClears : record.daily_clears || 0);
  var weeklyClears = Number(record.weeklyClears != null ? record.weeklyClears : record.weekly_clears || 0);
  var averageGuesses = record.averageGuesses != null ? record.averageGuesses : record.average_guesses;
  var guessLabel = averageGuesses == null
    ? 'No guess data'
    : Number(averageGuesses).toFixed(1).replace(/\.0$/, '') + ' avg guesses';
  var lastWinAt = record.lastWinAt != null ? record.lastWinAt : record.last_win_at;

  return '<div class="wg-profile-summary-shell">' +
    '<div class="wg-profile-summary-head">' +
      '<div>' +
        '<div class="wg-profile-summary-kicker">Your Record</div>' +
        '<div class="wg-profile-summary-title">' + displayName + '</div>' +
      '</div>' +
      '<div class="wg-profile-summary-foot">Last win: ' + escapeHtml(formatGameRecordDate(lastWinAt)) + '</div>' +
    '</div>' +
    '<div class="wg-profile-summary-grid">' +
      '<div class="wg-profile-stat"><span class="wg-profile-stat-label">Wins</span><strong>' + formatNumber(wins) + '</strong></div>' +
      '<div class="wg-profile-stat"><span class="wg-profile-stat-label">Words</span><strong>' + formatNumber(words) + '</strong></div>' +
      '<div class="wg-profile-stat"><span class="wg-profile-stat-label">Daily</span><strong>' + formatNumber(dailyClears) + '</strong></div>' +
      '<div class="wg-profile-stat"><span class="wg-profile-stat-label">Weekly</span><strong>' + formatNumber(weeklyClears) + '</strong></div>' +
      '<div class="wg-profile-stat wg-profile-stat--wide"><span class="wg-profile-stat-label">Guessing</span><strong>' + escapeHtml(guessLabel) + '</strong></div>' +
    '</div>' +
  '</div>';
}

function hydrateWgPanelProfileSummary(gameId, panel) {
  if (!panel) return;
  var summaryEl = panel.querySelector('.wg-panel-profile-summary');
  if (!summaryEl) return;
  summaryEl.innerHTML = buildWgProfileSummary(gameId);
}

function getOrCreateWgPanel(gameId) {
  if (wgPanelCache[gameId]) return wgPanelCache[gameId];
  var gameDef = getWgGameDef(gameId);
  var template = gameDef && WG_PANEL_TEMPLATES[gameDef.id];
  var panel = document.createElement('div');
  panel.className = 'wg-panel';
  panel.id = 'wg-panel-' + gameId;
  if (gameDef && gameDef.color) panel.style.setProperty('--game-color', gameDef.color);
  panel.innerHTML =
    '<details class="wg-stat-menu wg-stat-menu--record" open>' +
      '<summary class="wg-stat-menu-summary">Your Record</summary>' +
      '<div class="wg-stat-menu-body">' +
        '<div class="wg-panel-profile-summary"></div>' +
      '</div>' +
    '</details>' +
    (template ? template(gameDef) : '<div class="loading-placeholder">Coming soon</div>');
  panel.onclick = function(e) { e.stopPropagation(); };
  enhanceWgPanelMenus(panel);
  wgPanelCache[gameId] = panel;
  return panel;
}

function refreshWgProfilePanels() {
  Object.keys(wgPanelCache).forEach(function(gameId) {
    hydrateWgPanelProfileSummary(gameId, wgPanelCache[gameId]);
  });
}

function toggleGamePanel(gameId) {
  var card = document.querySelector('.game-card.game-card--' + gameId + ':not(.challenge-game-card)');
  if (!card) return;
  var panel = getOrCreateWgPanel(gameId);
  hydrateWgPanelProfileSummary(gameId, panel);
  var slot = card.querySelector('.wg-inline-panel-slot');
  if (!slot) return;

  // If already open, close it
  if (wgOpenGame === gameId) {
    panel.classList.remove('open');
    if (card) card.classList.remove('wg-card-active');
    if (panel.parentElement) panel.parentElement.removeChild(panel);
    wgOpenGame = null;
    // Collapse non-flagship card back to compact
    if (card.classList.contains('wg-card-expanded')) {
      card.classList.remove('wg-card-expanded');
      card.classList.add('wg-card-compact');
      if (wgExpandedCard === gameId) wgExpandedCard = null;
    }
    return;
  }

  // Close any open panel
  if (wgOpenGame) {
    var oldPanel = wgPanelCache[wgOpenGame] || document.getElementById('wg-panel-' + wgOpenGame);
    var oldCard = document.querySelector('.game-card.game-card--' + wgOpenGame + ':not(.challenge-game-card)');
    if (oldPanel) oldPanel.classList.remove('open');
    if (oldCard) oldCard.classList.remove('wg-card-active');
    if (oldPanel && oldPanel.parentElement) oldPanel.parentElement.removeChild(oldPanel);
  }

  // Open new panel
  slot.appendChild(panel);
  panel.classList.add('open');
  if (card) card.classList.add('wg-card-active');
  wgOpenGame = gameId;

  // Scroll panel into view
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Lazy-load stats on first open
  if (!wgLoadedPanels[gameId]) {
    wgLoadedPanels[gameId] = true;
    loadGamePanelStats(gameId);
  }
}

function toggleCompactCard(gameId) {
  var card = document.querySelector('#wg-games-grid .game-card.game-card--' + gameId);
  if (!card) return;

  var isCompact = card.classList.contains('wg-card-compact');

  if (isCompact) {
    // Collapse any other expanded card first
    if (wgExpandedCard && wgExpandedCard !== gameId) {
      var oldCard = document.querySelector('#wg-games-grid .game-card.game-card--' + wgExpandedCard);
      if (oldCard) collapseCompactCard(oldCard, wgExpandedCard);
    }
    // Expand this card
    card.classList.remove('wg-card-compact');
    card.classList.add('wg-card-expanded');
    wgExpandedCard = gameId;
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  } else {
    // Already expanded — delegate to panel toggle
    toggleGamePanel(gameId);
  }
}

function collapseCompactCard(card, gameId) {
  // Close panel if open inside this card
  if (wgOpenGame === gameId) {
    toggleGamePanel(gameId);
  }
  card.classList.remove('wg-card-expanded');
  card.classList.add('wg-card-compact');
  if (wgExpandedCard === gameId) wgExpandedCard = null;
}

function loadGamePanelStats(gameId) {
  switch (gameId) {
    case 'searchle': loadSearchleStats(); break;
    case 'word500': loadWord500Stats(); loadWord500SPStats(); break;
    case 'betwixt': loadBetwixtStats(); loadBetwixtSPStats(); break;
    case 'wordle': loadWordleStats(); loadWordleSPStats(); break;
    case 'pixeletters': loadPixeLettersStats(); loadPixeLettersSPStats(); break;
    case 'rectangled': loadRectangledStats(); loadRectangledSPStats(); break;
    case 'spellingbee': loadSpellingBeeStats(); loadSpellingBeeSPStats(); break;
    case 'figural': loadFiguralStats(); break;
    case 'erectangled': loadSproutleStats(); loadSproutleSPStats(); break;
    case 'sproutle': loadSproutleStats(); loadSproutleSPStats(); break;
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

// ─── erecTangled stats (legacy internal key: sproutle) ─────────────────
async function loadSproutleStats() {
  try {
    var res = await fetch('/api/me/erectangled');
    var data = await res.json();
    var wordsEl = document.getElementById('sproutle-words');
    var gamesEl = document.getElementById('sproutle-games');
    if (wordsEl) wordsEl.textContent = data.totalWins || 0;
    if (gamesEl) gamesEl.textContent = data.gamesParticipated || 0;

    var list = document.getElementById('sproutle-history');
    if (!data.history || data.history.length === 0) {
      if (list) list.innerHTML = '<div class="loading-placeholder">No erecTangled games yet</div>';
      return;
    }
    if (list) {
      list.innerHTML = data.history.map(function(w) {
        return '<div class="searchle-entry"><div>' +
          '<span class="searchle-word">Game</span>' +
          '<span class="searchle-guesses">' + (w.guessCount || '?') + ' words</span>' +
        '</div><span class="searchle-date">' + formatTime(w.timestamp) + '</span></div>';
      }).join('');
    }
  } catch {
    var wordsEl2 = document.getElementById('sproutle-words');
    var gamesEl2 = document.getElementById('sproutle-games');
    if (wordsEl2) wordsEl2.textContent = '0';
    if (gamesEl2) gamesEl2.textContent = '0';
  }
}

function loadSproutleSPStats() {
  try {
    var raw = getLocalStorageValueWithAliases('erectangled_sp_stats', ['sproutle_sp_stats']);
    var spGames = document.getElementById('sproutle-sp-games');
    var spCompleted = document.getElementById('sproutle-sp-completed');
    var spWords = document.getElementById('sproutle-sp-words');
    var spBest = document.getElementById('sproutle-sp-best');
    if (!raw) {
      if (spGames) spGames.textContent = '0';
      if (spCompleted) spCompleted.textContent = '0';
      if (spWords) spWords.textContent = '0';
      if (spBest) spBest.textContent = '-';
      return;
    }
    var stats = JSON.parse(raw);
    if (spGames) spGames.textContent = stats.gamesPlayed || 0;
    if (spCompleted) spCompleted.textContent = stats.gamesCompleted || 0;
    if (spWords) spWords.textContent = stats.totalWordsFound || 0;
    if (spBest) spBest.textContent = (stats.bestCompletion || 0) + '%';

    var spHistory = document.getElementById('sproutle-sp-history');
    var history = (stats.history || []).slice(0, 10);
    if (spHistory && history.length > 0) {
      spHistory.innerHTML = history.map(function(h) {
        return '<div class="searchle-entry"><div>' +
          '<span class="searchle-word">' + (h.gridSize || '9x7') + '</span>' +
          '<span class="searchle-guesses">' + (h.wordsFound || 0) + '/' + (h.totalWords || '?') + ' (' + (h.percentage || 0) + '%)</span>' +
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
    stopPresenceHeartbeat();
    await fetch('/api/me/logout', { method: 'POST' });
    if (socket) socket.disconnect();
    window.location.reload();
  });
}

// ─── Theme Toggle ───────────────────────────────────────────────────

function setupThemeToggle() {
  const btn = document.getElementById('theme-toggle');
  syncThemeToLaunchLinks();
  if (!btn) return;
  const THEME_KEYS = ['wordtycoon_theme', 'portal-theme'];
  // Sync button icon with current theme
  const isLight = document.documentElement.dataset.theme === 'light';
  btn.textContent = isLight ? 'Dark' : 'Light';
  btn.addEventListener('click', () => {
    const nowLight = document.documentElement.dataset.theme === 'light';
    if (nowLight) {
      delete document.documentElement.dataset.theme;
      // Write 'dark' rather than clearing the keys. The portal treats a
      // missing key as dark, but every game bootstrap falls back to
      // prefers-color-scheme when nothing is stored — so clearing here left
      // anyone on a light-OS device with a dark portal and light games even
      // though they had just explicitly asked for dark.
      THEME_KEYS.forEach((key) => localStorage.setItem(key, 'dark'));
      btn.textContent = 'Light';
    } else {
      document.documentElement.dataset.theme = 'light';
      THEME_KEYS.forEach((key) => localStorage.setItem(key, 'light'));
      btn.textContent = 'Dark';
    }
    syncThemeToLaunchLinks();
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

      // Only TikTok-login users still need a stream-platform link (GitHub and
      // Google accounts are standalone and never see this banner anymore).
      msgEl.innerHTML = 'Your account isn\'t linked to any stream platform yet. Type <code>!link</code> in the stream chat to get started!';
      actionsEl.innerHTML = '<button type="button" class="link-account-btn" onclick="switchToTab(&quot;howtoplay&quot;)">Open Help</button>' +
        '<button type="button" class="link-account-btn" onclick="loadProfile()">Refresh After Linking</button>';

      // Still render what we can from a partial profile
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
    await loadBusinessTaxSeasonStatus(data.businesses);
    applyHeroCosmetics(data.cosmetics);
    applyHeaderCosmetics(data.cosmetics);
    renderBusinesses(data.businesses);
    renderEmpireSummary();
    loadCosmetics(data.cosmetics);
    maybeShowNewCosmeticsModal();
  } catch {
    setStatPlaceholders('Error');
  }
}

function setStatPlaceholders(val = '-') {
  ['stat-coins', 'stat-taps', 'stat-wins', 'stat-elo'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  });
  const profCoins = document.getElementById('prof-coins');
  if (profCoins) profCoins.textContent = val;
  const profWords = document.getElementById('prof-words');
  if (profWords) profWords.textContent = val;
  var platformsList = document.getElementById('platforms-list');
  if (platformsList) platformsList.innerHTML = '<div class="loading-placeholder">No linked accounts</div>';
  var platformsSummary = document.getElementById('platforms-summary');
  if (platformsSummary) platformsSummary.innerHTML = '';
  // tap upgrades removed
  var nextSteps = document.getElementById('profile-next-steps');
  if (nextSteps) nextSteps.innerHTML = '<div class="loading-placeholder">No profile plan available</div>';
  document.getElementById('businesses-grid').innerHTML = '<div class="loading-placeholder">No data available</div>';
  document.getElementById('cosmetics-grid').innerHTML = '<div class="loading-placeholder">No data available</div>';
  document.getElementById('history-list').innerHTML = '<div class="loading-placeholder">No data available</div>';
}

async function loadBusinessTaxSeasonStatus(businesses) {
  businessTaxSeasonStatus = null;
  var hasCarwash = Array.isArray(businesses) && businesses.some(function(b) {
    return b && b.business_type === 'carwash';
  });
  if (!hasCarwash) return null;
  try {
    var res = await fetch('/api/me/carwash/tax-season');
    var data = await res.json();
    if (data && data.ok) businessTaxSeasonStatus = data;
  } catch (_) {
    businessTaxSeasonStatus = null;
  }
  return businessTaxSeasonStatus;
}

var TAP_UPGRADE_DEFS = {
  tap: {
    name: 'Tap Power',
    accent: 'blue',
    desc: 'Coins earned per tap.',
    baseCost: 1000,
    costMultiplier: 1.15,
    maxLevel: 100,
    label: function(p) { return 'Lv.' + (p.tapPower || 1); },
    explain: function(p, currentLevel) {
      return [
        'Base tap value. Every tap pays this many coins before combo and cosmetic buffs.',
        'Current: ' + (p.tapPower || 1) + ' coins per tap.',
        'Best for raising your floor. It helps every tap, even with no combo running.'
      ];
    }
  },
  crit: {
    name: 'Critical Tap',
    accent: 'plum',
    desc: 'Increases combo crit scaling.',
    baseCost: 25000,
    costMultiplier: 1.25,
    maxLevel: 50,
    label: function(p) { return ((p.critChance || 0) * 100).toFixed(0) + '%'; },
    explain: function(p, currentLevel) {
      var critMult = (1 + currentLevel * 0.04).toFixed(2);
      return [
        'This is not a random crit chance. It boosts the combo portion of your tap income.',
        'Current combo crit multiplier: ' + critMult + 'x.',
        'You only feel this when your combo streak is active, so it scales better once you are tapping fast.'
      ];
    }
  },
  multi: {
    name: 'Multi-Tap',
    accent: 'gold',
    desc: 'Each interaction counts as more taps.',
    baseCost: 250000,
    costMultiplier: 1.5,
    maxLevel: 10,
    label: function(p) { return 'x' + (p.multiTap || 1); },
    explain: function(p, currentLevel) {
      return [
        'Each interaction counts as multiple taps at once.',
        'Current: every interaction = x' + (p.multiTap || 1) + ' taps.',
        'This also builds combo streak faster, so it synergizes with Critical Tap.'
      ];
    }
  }
};

function getTapUpgradeLevel(profileData, type) {
  if (!profileData) return 0;
  if (type === 'tap') return profileData.tapPower || 1;
  if (type === 'crit') return Math.round((profileData.critChance || 0) / 0.01);
  if (type === 'multi') return profileData.multiTap || 1;
  return 0;
}

function getTapUpgradeCost(type, currentLevel) {
  var def = TAP_UPGRADE_DEFS[type];
  if (!def) return 0;
  return Math.floor(def.baseCost * Math.pow(def.costMultiplier, currentLevel));
}

function renderTapUpgrades(data) {
  var grid = document.getElementById('tap-upgrades-grid');
  if (!grid || !data || !data.profile) return;
  var p = data.profile;
  grid.innerHTML = Object.keys(TAP_UPGRADE_DEFS).map(function(type) {
    var def = TAP_UPGRADE_DEFS[type];
    var currentLevel = getTapUpgradeLevel(p, type);
    var atMax = currentLevel >= def.maxLevel;
    var cost = getTapUpgradeCost(type, currentLevel);
    var canAfford = (p.coins || 0) >= cost;
    var detail = type === 'tap'
      ? (p.tapPower || 1) + ' coins/tap'
      : type === 'crit'
        ? 'Combo crit ' + ((1 + currentLevel * 0.04).toFixed(2)) + 'x'
        : 'Each interaction = x' + (p.multiTap || 1) + ' taps';
    var explainLines = (def.explain ? def.explain(p, currentLevel) : []).map(function(line) {
      return '<li>' + escapeHtml(line) + '</li>';
    }).join('');
    return '<div class="tap-upgrade-card ' + def.accent + (atMax ? ' maxed' : '') + '">' +
      '<div class="tap-upgrade-head">' +
        '<div><div class="tap-upgrade-name">' + def.name + '</div><div class="tap-upgrade-desc">' + def.desc + '</div></div>' +
        '<div class="tap-upgrade-level">' + def.label(p) + '</div>' +
      '</div>' +
      '<div class="tap-upgrade-detail">' + detail + '</div>' +
      '<div class="tap-upgrade-foot">' +
        '<div class="tap-upgrade-cost">' + (atMax ? 'MAX' : formatNumber(cost) + ' XP') + '</div>' +
        '<button class="tap-upgrade-btn" onclick="buyTapUpgrade(\'' + type + '\')"' + (atMax || !canAfford ? ' disabled' : '') + '>' +
          (atMax ? 'Maxed' : 'Upgrade') +
        '</button>' +
      '</div>' +
      '<details class="tap-upgrade-explainer">' +
        '<summary>How it works</summary>' +
        '<ul class="tap-upgrade-explainer-list">' + explainLines + '</ul>' +
      '</details>' +
    '</div>';
  }).join('');
}

function renderProfile(data) {
  const p = data.profile;
  const career = p.careerStats || {};
  const business = p.businessStats || {};
  const collector = p.collectorStats || {};
  const economy = p.economyStats || {};
  const collection = p.collectionStats || {};
  const puzzles = p.puzzleStats || {};
  const pass = p.passStats || {};
  const gameStats = p.gameStats || {};
  const preferredDisplayName = (data.preferences && data.preferences.preferred_display_name) || '';

  // ── Profile Hero ──
  const profAvatar = document.getElementById('prof-avatar');
  if (profAvatar) {
    // Prefer custom uploaded avatar over platform avatar
    const customUrl = data.preferences && data.preferences.customAvatarUrl;
    profAvatar.src = resolveAvatar(customUrl || p.profilePic);
    profAvatar.style.display = 'block';
    profAvatar.onerror = function() { this.onerror = null; this.src = AVATAR_FALLBACK; markAvatarFallback(this); };
    profAvatar.onload = function() { markAvatarFallback(this); };
  }
  setupAvatarUpload(data);
  const profName = document.getElementById('prof-name');
  if (profName) profName.textContent = p.displayName || 'Player';
  const profNameInput = document.getElementById('prof-name-input');
  const profNameSave = document.getElementById('prof-name-save');
  const profNameReset = document.getElementById('prof-name-reset');
  if (profNameInput) {
    profNameInput.value = preferredDisplayName || p.displayName || '';
    profNameInput.placeholder = p.displayName || 'Set your username';
    profNameInput.onkeydown = async function(e) {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (profNameSave) profNameSave.click();
      }
    };
  }
  if (profNameSave) {
    profNameSave.onclick = async function() {
      const nextName = (profNameInput && profNameInput.value ? profNameInput.value.trim() : '').slice(0, 32);
      if (!nextName) {
        showToast('Enter a username or use Reset.', 'error');
        return;
      }
      profNameSave.disabled = true;
      if (profNameReset) profNameReset.disabled = true;
      try {
        const res = await fetch('/api/me/prefs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferred_display_name: nextName })
        });
        const result = await res.json();
        if (!result.ok) {
          showToast(result.error || result.message || 'Failed to save username.', 'error');
          return;
        }
        showToast('Username updated.', 'success');
        await loadProfile();
      } catch {
        showToast('Failed to save username.', 'error');
      } finally {
        profNameSave.disabled = false;
        if (profNameReset) profNameReset.disabled = false;
      }
    };
  }
  if (profNameReset) {
    profNameReset.onclick = async function() {
      profNameReset.disabled = true;
      if (profNameSave) profNameSave.disabled = true;
      try {
        const res = await fetch('/api/me/prefs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ preferred_display_name: null })
        });
        const result = await res.json();
        if (!result.ok) {
          showToast(result.error || result.message || 'Failed to reset username.', 'error');
          return;
        }
        showToast('Username reset to your linked account name.', 'success');
        await loadProfile();
      } catch {
        showToast('Failed to reset username.', 'error');
      } finally {
        profNameReset.disabled = false;
        if (profNameSave) profNameSave.disabled = false;
      }
    };
  }
  const profCoins = document.getElementById('prof-coins');
  if (profCoins) profCoins.textContent = formatNumber(p.coins);
  const profWords = document.getElementById('prof-words');
  if (profWords) profWords.textContent = formatNumber(p.libraryWords || 0);
  const profWins = document.getElementById('prof-wins');
  if (profWins) profWins.textContent = formatNumber(p.totalGameWins || 0);

  // Title
  const profTitle = document.getElementById('prof-title');
  const equippedTitle = (data.cosmetics || []).find(c => c.category === 'title' && c.equipped);
  if (profTitle) {
    if (equippedTitle) {
      profTitle.textContent = equippedTitle.name;
      profTitle.style.display = 'block';
    } else {
      profTitle.style.display = 'none';
    }
  }

  // Update header avatar
  const headerAv = document.getElementById('user-avatar');
  headerAv.src = resolveAvatar(p.profilePic);
  headerAv.style.display = 'block';
  headerAv.onerror = function() { this.onerror = null; this.src = AVATAR_FALLBACK; };

  // ── Stat Cards ──
  document.getElementById('stat-coins').textContent = formatNumber(p.coins);
  document.getElementById('stat-taps').textContent = formatNumber(p.totalTaps);
  document.getElementById('stat-wins').textContent = formatNumber(p.totalGameWins || 0);
  document.getElementById('stat-elo').textContent = formatNumber(p.globalElo || 1200);
  document.getElementById('career-total-wins').textContent = formatNumber(career.totalGameWins || p.totalGameWins || 0);
  document.getElementById('career-longest-streak').textContent = formatNumber(career.longestStreak || 0);
  document.getElementById('career-daily-claims').textContent = formatNumber(career.totalDailyClaims || 0);
  document.getElementById('career-gift-coins').textContent = formatNumber(p.giftCoins || 0);
  document.getElementById('career-favorite-game').textContent = career.favoriteGame ? prettyGameName(career.favoriteGame) : 'No wins yet';
  document.getElementById('career-favorite-game-sub').textContent = career.favoriteGame
    ? formatNumber(career.favoriteGameWins || 0) + ' wins'
    : 'No wins yet';
  document.getElementById('career-cosmetics-owned').textContent = formatNumber(career.cosmeticsOwned || 0);
  document.getElementById('career-cosmetics-sub').textContent = formatNumber(career.cosmeticsEquipped || 0) + ' equipped';
  document.getElementById('businesses-owned').textContent = formatNumber(business.businessesOwned || 0);
  document.getElementById('businesses-prestige').textContent = formatNumber(business.totalPrestige || 0);
  document.getElementById('businesses-pizzas').textContent = formatNumber(business.pizzasServed || 0);
  document.getElementById('businesses-papers').textContent = formatNumber(business.papersDelivered || 0);
  document.getElementById('businesses-cars').textContent = formatNumber(business.carsWashed || 0);
  document.getElementById('businesses-trades').textContent = formatNumber(business.tradesMade || 0);
  document.getElementById('businesses-members').textContent = formatNumber(business.membersTrained || 0);
  document.getElementById('businesses-viewers').textContent = formatNumber(business.viewersServed || 0);
  document.getElementById('businesses-users').textContent = formatNumber(business.usersServed || 0);
  document.getElementById('businesses-clients').textContent = formatNumber(business.clientsServed || 0);
  document.getElementById('collector-owned').textContent = formatNumber(collector.cosmeticsOwned || 0);
  document.getElementById('collector-generated').textContent = formatNumber(collector.generatedOwned || 0);
  document.getElementById('collector-legendary').textContent = formatNumber(collector.legendaryPlusOwned || 0);
  document.getElementById('collector-badges').textContent = formatNumber(collector.heroBadgesOwned || 0);
  document.getElementById('collector-winfx').textContent = formatNumber(collector.winEffectsOwned || 0);
  document.getElementById('collector-titles').textContent = formatNumber(collector.titlesOwned || 0);
  document.getElementById('collector-equipped-sub').textContent = formatNumber(collector.cosmeticsEquipped || 0) + ' equipped';
  document.getElementById('economy-coins-earned').textContent = formatNumber(economy.lifetimeCoinsEarned || 0);
  document.getElementById('economy-coins-spent').textContent = formatNumber(economy.lifetimeCoinsSpent || 0);
  document.getElementById('economy-gift-earned').textContent = formatNumber(economy.giftCoinsEarned || 0);
  document.getElementById('economy-gift-spent').textContent = formatNumber(economy.giftCoinsSpent || 0);
  document.getElementById('economy-cosmetic-purchases').textContent = formatNumber(economy.cosmeticPurchases || 0);
  document.getElementById('economy-set-purchases').textContent = formatNumber(economy.setPurchases || 0);
  document.getElementById('collection-fixed-owned').textContent = formatNumber(collection.fixedCatalogOwned || 0);
  document.getElementById('collection-fixed-total').textContent = formatNumber(collection.fixedCatalogTotal || 0) + ' total';
  document.getElementById('collection-completion-pct').textContent = (Number(collection.completionPct || 0)).toFixed(1).replace(/\.0$/, '') + '%';
  document.getElementById('collection-store-owned').textContent = formatNumber(collection.storeOwned || 0);
  document.getElementById('collection-store-total').textContent = formatNumber(collection.storeTotal || 0) + ' total';
  document.getElementById('collection-categories-complete').textContent = formatNumber(collection.categoriesCompleted || 0);
  document.getElementById('collection-categories-total').textContent = formatNumber(collection.totalCategories || 0) + ' categories';
  document.getElementById('puzzle-daily-total').textContent = formatNumber(puzzles.totalDailyPuzzles || 0);
  document.getElementById('puzzle-weekly-total').textContent = formatNumber(puzzles.totalWeeklyPuzzles || 0);
  document.getElementById('puzzle-daily-current').textContent = formatNumber(puzzles.currentDailyCompleted || 0);
  document.getElementById('puzzle-weekly-current').textContent = formatNumber(puzzles.currentWeeklyCompleted || 0);
  document.getElementById('puzzle-daily-favorite').textContent = puzzles.favoriteDailyGame ? prettyGameName(puzzles.favoriteDailyGame) : 'No daily completions';
  document.getElementById('puzzle-daily-favorite-sub').textContent = puzzles.favoriteDailyGame
    ? formatNumber(puzzles.favoriteDailyGameCount || 0) + ' clears'
    : 'No daily completions yet';
  document.getElementById('puzzle-weekly-favorite').textContent = puzzles.favoriteWeeklyGame ? prettyGameName(puzzles.favoriteWeeklyGame) : 'No weekly completions';
  document.getElementById('puzzle-weekly-favorite-sub').textContent = puzzles.favoriteWeeklyGame
    ? formatNumber(puzzles.favoriteWeeklyGameCount || 0) + ' clears'
    : 'No weekly completions yet';
  refreshBusinessDrawers();
  refreshWgProfilePanels();
  renderProfileNextSteps(data);
  setupHeroCosmeticEditors();

  // ── Platforms ──
  renderOverviewPlatforms(data);
  if (storeLoaded) renderStoreGuidance();
  renderMembershipTab();

  // ── Daily/Weekly Trackers (for Word Games tab Today panel) ──
  syncCompletionsFromServer().then(function() {
    renderDailyTracker();
    renderWeeklyTracker();
  });
}

function prettyGameName(gameId) {
  var map = {
    word500: 'Word5000',
    word1000: 'Word5000 Solo',
    wordle: 'Wordle',
    betwixt: 'Betwixt',
    betwixt: 'Betwixt',
    figural: 'Figural',
    pixeletters: 'Pixeletters',
    unwordle: 'Unwordle',
    rectangled: 'RecTangled',
    erectangled: 'erecTangled',
    searchle: 'Searchle',
    spellingbee: 'Spelling Bee',
    'spelling-bee': 'Spelling Bee',
    triangled: 'Triangled',
    arcade: 'Arcade'
  };
  return map[gameId] || String(gameId || '').replace(/[-_]/g, ' ').replace(/\b\w/g, function(ch) { return ch.toUpperCase(); });
}

function prettyMembershipTier(tier) {
  var map = {
    free: 'Free Tier',
    donor_class: 'Donor Class',
    pookie_pass: 'Pookie Pass'
  };
  return map[tier] || prettyGameName(tier || 'free');
}

function prettyMembershipStatus(status) {
  var map = {
    active: 'Active',
    inactive: 'Inactive',
    past_due: 'Past Due',
    canceled: 'Canceled'
  };
  return map[String(status || '').toLowerCase()] || prettyGameName(status || 'inactive');
}

function prettyBusinessType(type) {
  var key = String(type || '').toLowerCase();
  if (typeof BUSINESS_DATA === 'object' && BUSINESS_DATA && BUSINESS_DATA[key] && BUSINESS_DATA[key].name) {
    return BUSINESS_DATA[key].name;
  }
  var map = {
    newspaper: 'Newspaper Route',
    carwash: 'Car Wash',
    stockmogul: 'Stock Mogul',
    pizza: 'Pizza Shop',
    gym: 'Gym',
    cinema: 'Movie Theater',
    startup: 'Tech Startup',
    bank: 'Bank'
  };
  return map[key] || prettyGameName(key);
}

function getBusinessRecord(type) {
  var records = ((((profile || {}).profile || {}).businessStats || {}).businessRecords) || [];
  for (var i = 0; i < records.length; i++) {
    var row = records[i];
    var businessType = row.businessType != null ? row.businessType : row.business_type;
    if (businessType === type) return row;
  }
  return null;
}

function buildBusinessRecordSummary(type) {
  var biz = BUSINESS_DATA[type] || { name: prettyBusinessType(type) };
  var record = getBusinessRecord(type);
  if (!record) {
    return '<div class="biz-record-empty">' +
      '<div class="biz-record-kicker">Business Record</div>' +
      '<div class="biz-record-title">' + escapeHtml(biz.name) + '</div>' +
      '<div class="biz-record-copy">No saved business record yet.</div>' +
    '</div>';
  }

  var title = record.businessName || record.business_name || biz.name;
  var prestige = Number(record.prestigeLevel != null ? record.prestigeLevel : record.prestige_level || 0);
  var level = Number(record.level || 0);
  var xp = Number(record.xp || 0);
  var lifetimeTotal = Number(record.lifetimeTotal != null ? record.lifetimeTotal : record.lifetime_total || 0);
  var lifetimeLabel = record.lifetimeLabel || record.lifetime_label || 'Lifetime';
  var storedValue = record.storedValue != null ? record.storedValue : record.stored_value;
  var storedLabel = record.storedLabel || record.stored_label || 'Stored';
  var earnedTotal = record.earnedTotal != null ? record.earnedTotal : record.earned_total;
  var earnedLabel = record.earnedLabel || record.earned_label || 'Earned';
  var lastCollectedAt = record.lastCollectedAt || record.last_collected_at;

  return '<div class="biz-record-shell">' +
    '<div class="biz-record-head">' +
      '<div>' +
        '<div class="biz-record-kicker">Business Record</div>' +
        '<div class="biz-record-title">' + escapeHtml(title) + '</div>' +
      '</div>' +
      '<div class="biz-record-foot">Last collected: ' + escapeHtml(formatBusinessRecordDate(lastCollectedAt)) + '</div>' +
    '</div>' +
    '<div class="biz-record-grid">' +
      '<div class="biz-record-stat"><span class="biz-record-stat-label">Prestige</span><strong>P' + formatNumber(prestige) + '</strong></div>' +
      '<div class="biz-record-stat"><span class="biz-record-stat-label">Level</span><strong>Lv.' + formatNumber(level) + '</strong></div>' +
      '<div class="biz-record-stat"><span class="biz-record-stat-label">XP</span><strong>' + formatNumber(xp) + '</strong></div>' +
      '<div class="biz-record-stat"><span class="biz-record-stat-label">' + escapeHtml(lifetimeLabel) + '</span><strong>' + formatNumber(lifetimeTotal) + '</strong></div>' +
      (storedValue == null ? '' : '<div class="biz-record-stat"><span class="biz-record-stat-label">' + escapeHtml(storedLabel) + '</span><strong>' + formatNumber(storedValue) + '</strong></div>') +
      (earnedTotal == null ? '' : '<div class="biz-record-stat biz-record-stat--wide"><span class="biz-record-stat-label">' + escapeHtml(earnedLabel) + '</span><strong>' + formatNumber(earnedTotal) + '</strong></div>') +
    '</div>' +
  '</div>';
}

function createBusinessDrawer(type) {
  var panel = document.createElement('div');
  panel.className = 'biz-inline-panel';
  panel.id = 'biz-inline-panel-' + type;
  panel.onclick = function(e) { e.stopPropagation(); };
  panel.innerHTML =
    '<details class="biz-stat-menu" open>' +
      '<summary class="biz-stat-menu-summary">Business Record</summary>' +
      '<div class="biz-stat-menu-body">' +
        buildBusinessRecordSummary(type) +
      '</div>' +
    '</details>';
  return panel;
}

function refreshBusinessDrawers() {
  Object.keys(BUSINESS_DATA).forEach(function(type) {
    var panel = document.getElementById('biz-inline-panel-' + type);
    if (!panel) return;
    var body = panel.querySelector('.biz-stat-menu-body');
    if (body) body.innerHTML = buildBusinessRecordSummary(type);
  });
}

function toggleBusinessPanel(type) {
  var card = document.querySelector('.biz-card.biz-owned[data-business-type="' + type + '"]');
  if (!card) return;
  var slot = card.querySelector('.biz-inline-panel-slot');
  if (!slot) return;
  var panel = document.getElementById('biz-inline-panel-' + type) || createBusinessDrawer(type);

  if (bizOpenType === type) {
    card.classList.remove('biz-card-active');
    if (panel.parentElement) panel.parentElement.removeChild(panel);
    bizOpenType = null;
    return;
  }

  if (bizOpenType) {
    var oldCard = document.querySelector('.biz-card.biz-owned[data-business-type="' + bizOpenType + '"]');
    var oldPanel = document.getElementById('biz-inline-panel-' + bizOpenType);
    if (oldCard) oldCard.classList.remove('biz-card-active');
    if (oldPanel && oldPanel.parentElement) oldPanel.parentElement.removeChild(oldPanel);
  }

  slot.appendChild(panel);
  card.classList.add('biz-card-active');
  bizOpenType = type;
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function formatBusinessRecordDate(value) {
  if (!value) return 'No collection history';
  var date = new Date(value);
  if (isNaN(date.getTime())) return 'No collection history';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderBusinessRecords(records) {
  var el = document.getElementById('business-records-list');
  if (!el) return;
  if (!Array.isArray(records) || !records.length) {
    el.innerHTML = '<div class="loading-placeholder">No managed business records yet.</div>';
    return;
  }
  el.innerHTML = records.map(function(row) {
    var title = row.businessName || row.business_name || prettyBusinessType(row.businessType || row.business_type);
    var typeLabel = prettyBusinessType(row.businessType || row.business_type);
    var prestige = Number(row.prestigeLevel != null ? row.prestigeLevel : row.prestige_level || 0);
    var level = Number(row.level || 0);
    var xp = Number(row.xp || 0);
    var lifetimeTotal = Number(row.lifetimeTotal != null ? row.lifetimeTotal : row.lifetime_total || 0);
    var lifetimeLabel = row.lifetimeLabel || row.lifetime_label || 'Lifetime';
    var storedValue = row.storedValue != null ? row.storedValue : row.stored_value;
    var storedLabel = row.storedLabel || row.stored_label || 'Stored';
    var earnedTotal = row.earnedTotal != null ? row.earnedTotal : row.earned_total;
    var earnedLabel = row.earnedLabel || row.earned_label || 'Earned';
    var lastCollectedAt = row.lastCollectedAt || row.last_collected_at;
    return '<div class="business-record-card">' +
      '<div class="business-record-top">' +
        '<div>' +
          '<div class="business-record-name">' + escapeHtml(title) + '</div>' +
          '<div class="business-record-type">' + escapeHtml(typeLabel) + '</div>' +
        '</div>' +
        '<div class="business-record-levels">P' + formatNumber(prestige) + ' · L' + formatNumber(level) + '</div>' +
      '</div>' +
      '<div class="business-record-grid">' +
        '<span class="business-record-stat"><strong>' + formatNumber(lifetimeTotal) + '</strong> ' + escapeHtml(lifetimeLabel) + '</span>' +
        '<span class="business-record-stat"><strong>' + formatNumber(xp) + '</strong> XP</span>' +
        (storedValue == null ? '' : '<span class="business-record-stat"><strong>' + formatNumber(storedValue) + '</strong> ' + escapeHtml(storedLabel) + '</span>') +
        (earnedTotal == null ? '' : '<span class="business-record-stat"><strong>' + formatNumber(earnedTotal) + '</strong> ' + escapeHtml(earnedLabel) + '</span>') +
      '</div>' +
      '<div class="business-record-foot">Last collected: ' + escapeHtml(formatBusinessRecordDate(lastCollectedAt)) + '</div>' +
    '</div>';
  }).join('');
}

function formatGameRecordDate(value) {
  if (!value) return 'No wins yet';
  var date = new Date(value);
  if (isNaN(date.getTime())) return 'No wins yet';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderGameRecords(records) {
  var el = document.getElementById('game-records-list');
  if (!el) return;
  if (!Array.isArray(records) || !records.length) {
    el.innerHTML = '<div class="loading-placeholder">No recorded game history yet.</div>';
    return;
  }
  el.innerHTML = records.map(function(row) {
    var wins = Number(row.wins || 0);
    var words = Number(row.uniqueWords != null ? row.uniqueWords : row.unique_words || 0);
    var dailyClears = Number(row.dailyClears != null ? row.dailyClears : row.daily_clears || 0);
    var weeklyClears = Number(row.weeklyClears != null ? row.weeklyClears : row.weekly_clears || 0);
    var averageGuesses = row.averageGuesses != null ? row.averageGuesses : row.average_guesses;
    var guessLabel = averageGuesses == null
      ? 'No guess data'
      : Number(averageGuesses).toFixed(1).replace(/\.0$/, '') + ' avg guesses';
    var lastWinAt = row.lastWinAt != null ? row.lastWinAt : row.last_win_at;
    return '<div class="game-record-card">' +
      '<div class="game-record-top">' +
        '<span class="game-record-name">' + escapeHtml(prettyGameName(row.game)) + '</span>' +
        '<span class="game-record-value">' + formatNumber(wins) + ' wins</span>' +
      '</div>' +
      '<div class="game-record-grid">' +
        '<span class="game-record-stat"><strong>' + formatNumber(words) + '</strong> words</span>' +
        '<span class="game-record-stat"><strong>' + formatNumber(dailyClears) + '</strong> daily</span>' +
        '<span class="game-record-stat"><strong>' + formatNumber(weeklyClears) + '</strong> weekly</span>' +
        '<span class="game-record-stat"><strong>' + escapeHtml(guessLabel) + '</strong></span>' +
      '</div>' +
      '<div class="game-record-foot">Last win: ' + escapeHtml(formatGameRecordDate(lastWinAt)) + '</div>' +
    '</div>';
  }).join('');
}

// Legacy alias — renderOverview still called in a few places
function renderOverview(data) { renderProfile(data); }

async function buyTapUpgrade(upgradeType) {
  try {
    const res = await fetch('/api/me/profile/tap-upgrade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upgradeType })
    });
    const data = await res.json();
    if (!data.ok) {
      showToast(data.message || 'Upgrade failed', 'error');
      return;
    }
    showToast(data.message || 'Upgrade purchased', 'success');
    await loadProfile();
  } catch {
    showToast('Upgrade failed', 'error');
  }
}

// ─── Header Cosmetics ────────────────────────────────────────────────
// Applies equipped cosmetics to the header user-info bubble (avatar + name + title)

function buildPortalCosmeticsByCategory(equipped) {
  const cosmeticsByCategory = {};
  (equipped || []).forEach(c => {
    let css = null;
    let render = null;
    let fallbackCss = null;
    let renderType = 'css';
    if (Array.isArray(shopCatalog)) {
      const shopItem = shopCatalog.find(s => s.id === c.cosmetic_id);
      if (shopItem) {
        if (shopItem.css) css = shopItem.css;
        if (shopItem.render) render = shopItem.render;
        if (shopItem.fallbackCss) fallbackCss = shopItem.fallbackCss;
        if (shopItem.renderType) renderType = shopItem.renderType;
      }
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

function applyHeaderCosmetics(cosmetics) {
  const avatarEl = document.getElementById('user-avatar');
  if (!avatarEl) return;
  const avatarWrap = avatarEl.parentElement; // .user-avatar-wrap
  const nameEl = document.getElementById('user-name');
  const titleEl = document.getElementById('user-title');
  if (!avatarWrap || !nameEl || !titleEl) return;
  const logoAvatar = avatarEl.classList.contains('avatar-is-logo');

  // Reset inline styles
  avatarWrap.style.cssText = '';
  avatarEl.style.border = logoAvatar ? 'none' : '2px solid var(--border)';
  avatarEl.style.animation = '';
  nameEl.style.color = '';
  nameEl.style.textShadow = '';
  nameEl.style.animation = '';
  titleEl.style.cssText = '';
  titleEl.style.display = 'none';
  titleEl.textContent = '';
  if (window.PortalCosmeticRenderer) window.PortalCosmeticRenderer.clearLayers(avatarWrap);

  const equipped = (cosmetics || []).filter(c => c.equipped);
  if (equipped.length === 0) return;

  const cosmeticsByCategory = buildPortalCosmeticsByCategory(equipped);

  // Apply profile_border
  const border = cosmeticsByCategory.profile_border && cosmeticsByCategory.profile_border.css;
  if (border && !logoAvatar) {
    if (border.border) avatarEl.style.border = border.border;
    if (border.boxShadow) avatarWrap.style.boxShadow = border.boxShadow;
    if (border.animation) avatarWrap.style.animation = border.animation;
  }

  // Apply profile_glow (combine boxShadow with border's)
  const glow = cosmeticsByCategory.profile_glow && cosmeticsByCategory.profile_glow.css;
  if (glow && !logoAvatar) {
    if (glow.boxShadow) {
      const existing = avatarWrap.style.boxShadow;
      avatarWrap.style.boxShadow = existing ? existing + ', ' + glow.boxShadow : glow.boxShadow;
    }
    if (glow.animation && !avatarWrap.style.animation) {
      avatarWrap.style.animation = glow.animation;
    }
  }

  // Apply name_color
  const nameColor = cosmeticsByCategory.name_color && cosmeticsByCategory.name_color.css;
  if (nameColor) {
    if (nameColor.color) nameEl.style.color = nameColor.color;
    if (nameColor.animation) nameEl.style.animation = nameColor.animation;
  }

  // Apply name_glow
  const nameGlow = cosmeticsByCategory.name_glow && cosmeticsByCategory.name_glow.css;
  if (nameGlow) {
    if (nameGlow.textShadow) nameEl.style.textShadow = nameGlow.textShadow;
    if (nameGlow.animation && !nameEl.style.animation) nameEl.style.animation = nameGlow.animation;
  }

  // Apply title
  const titleCos = cosmeticsByCategory.title && cosmeticsByCategory.title.css;
  if (titleCos) {
    titleEl.textContent = titleCos.title || '';
    titleEl.style.display = titleCos.title ? 'block' : 'none';
    if (titleCos.titleColor) titleEl.style.color = titleCos.titleColor;
    if (titleCos.titleGlow) titleEl.style.textShadow = titleCos.titleGlow;
    if (titleCos.animation) titleEl.style.animation = titleCos.animation;
  }

  if (window.PortalCosmeticRenderer) {
    const logoEffectSpec = logoAvatar ? {
      border: border && border.border ? border.border : '',
      boxShadow: [
        border && border.boxShadow ? border.boxShadow : '',
        glow && glow.boxShadow ? glow.boxShadow : ''
      ].filter(Boolean).join(', '),
      animation: (border && border.animation) || (glow && glow.animation) || ''
    } : null;
    window.PortalCosmeticRenderer.applyHeaderLayers({
      avatarWrap: avatarWrap,
      avatarEl: avatarEl,
      borderSpec: cosmeticsByCategory.profile_border || null,
      effectSpec: logoEffectSpec
    });
  }
}

// ─── Hero Cosmetics ─────────────────────────────────────────────────
// Applies equipped cosmetics to the hero profile card (avatar, name, title)

function applyHeroCosmetics(cosmetics) {
  const avatarWrap = document.querySelector('.prof-avatar-shell');
  const avatarEl = document.getElementById('prof-avatar');
  const nameEl = document.getElementById('prof-name');
  const titleEl = document.getElementById('prof-title');
  if (!avatarWrap || !avatarEl || !nameEl || !titleEl) return;
  const logoAvatar = avatarEl.classList.contains('avatar-is-logo');

  // Reset inline styles (preserve avatar wrap's base sizing)
  avatarWrap.style.border = '';
  avatarWrap.style.boxShadow = '';
  avatarWrap.style.animation = '';
  nameEl.style.color = '';
  nameEl.style.textShadow = '';
  nameEl.style.animation = '';
  const heroBg = document.querySelector('.prof-hero-bg');
  if (window.PortalCosmeticRenderer) {
    window.PortalCosmeticRenderer.clearLayers(avatarWrap);
    window.PortalCosmeticRenderer.clearLayers(heroBg);
  }

  const equipped = (cosmetics || []).filter(c => c.equipped);
  if (equipped.length === 0) return;

  const cosmeticsByCategory = buildPortalCosmeticsByCategory(equipped);

  // Apply profile_border (hero uses border on the wrap, not the img)
  const border = cosmeticsByCategory.profile_border && cosmeticsByCategory.profile_border.css;
  if (border && !logoAvatar) {
    if (border.border) avatarWrap.style.border = border.border;
    if (border.boxShadow) avatarWrap.style.boxShadow = border.boxShadow;
    if (border.animation) avatarWrap.style.animation = border.animation;
  }

  // Apply profile_glow (combine boxShadow with border's)
  const glow = cosmeticsByCategory.profile_glow && cosmeticsByCategory.profile_glow.css;
  if (glow && !logoAvatar) {
    if (glow.boxShadow) {
      const existing = avatarWrap.style.boxShadow;
      avatarWrap.style.boxShadow = existing ? existing + ', ' + glow.boxShadow : glow.boxShadow;
    }
    if (glow.animation && !avatarWrap.style.animation) {
      avatarWrap.style.animation = glow.animation;
    }
  }

  // Apply name_color
  const nameColor = cosmeticsByCategory.name_color && cosmeticsByCategory.name_color.css;
  if (nameColor) {
    if (nameColor.color) nameEl.style.color = nameColor.color;
    if (nameColor.animation) nameEl.style.animation = nameColor.animation;
  }

  // Apply name_glow
  const nameGlow = cosmeticsByCategory.name_glow && cosmeticsByCategory.name_glow.css;
  if (nameGlow) {
    if (nameGlow.textShadow) nameEl.style.textShadow = nameGlow.textShadow;
    if (nameGlow.animation && !nameEl.style.animation) nameEl.style.animation = nameGlow.animation;
  }

  // Apply hero_badge (background on .prof-hero-bg)
  const badge = cosmeticsByCategory.hero_badge && cosmeticsByCategory.hero_badge.css;
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
    const titleCos = cosmeticsByCategory.title && cosmeticsByCategory.title.css;
    if (titleCos) {
      if (titleCos.titleColor) titleEl.style.color = titleCos.titleColor;
      if (titleCos.titleGlow) titleEl.style.textShadow = titleCos.titleGlow;
      if (titleCos.animation) titleEl.style.animation = titleCos.animation;
    }
  } else {
    titleEl.style.display = 'none';
    titleEl.textContent = '';
  }

  if (window.PortalCosmeticRenderer) {
    const logoEffectSpec = logoAvatar ? {
      border: border && border.border ? border.border : '',
      boxShadow: [
        border && border.boxShadow ? border.boxShadow : '',
        glow && glow.boxShadow ? glow.boxShadow : ''
      ].filter(Boolean).join(', '),
      animation: (border && border.animation) || (glow && glow.animation) || ''
    } : null;
    window.PortalCosmeticRenderer.applyHeroLayers({
      avatarWrap: avatarWrap,
      avatarEl: avatarEl,
      heroBg: heroBg,
      borderSpec: cosmeticsByCategory.profile_border || null,
      badgeSpec: cosmeticsByCategory.hero_badge || null,
      effectSpec: logoEffectSpec
    });
  }
}

function setupHeroCosmeticEditors() {
  var map = {
    'prof-title-edit-btn': ['title'],
    'prof-name-cos-edit-btn': ['name_color', 'name_glow'],
    'prof-border-edit-btn': ['profile_border', 'profile_glow'],
    'prof-hero-badge-edit-btn': ['hero_badge']
  };
  Object.entries(map).forEach(function(entry) {
    var id = entry[0];
    var cats = entry[1];
    var btn = document.getElementById(id);
    if (!btn || btn.dataset.wired) return;
    btn.dataset.wired = '1';
    btn.addEventListener('click', function() { openCosmeticPicker(cats); });
  });
}

function openCosmeticPicker(categories) {
  var modal = document.getElementById('cosmetic-picker-modal');
  if (!modal) return;
  modal.dataset.pickerCategories = JSON.stringify(Array.isArray(categories) ? categories : [categories]);
  renderCosmeticPickerGrid(categories);
  modal.style.display = 'flex';
  modal.setAttribute('aria-hidden', 'false');
}

function closeCosmeticPicker() {
  var modal = document.getElementById('cosmetic-picker-modal');
  if (!modal) return;
  modal.style.display = 'none';
  modal.setAttribute('aria-hidden', 'true');
}

function renderCosmeticPickerGrid(categories) {
  var grid = document.getElementById('cosmetic-picker-grid');
  var titleEl = document.getElementById('cosmetic-picker-title');
  var eyebrowEl = document.getElementById('cosmetic-picker-eyebrow');
  var subEl = document.getElementById('cosmetic-picker-subtitle');
  if (!grid || !titleEl || !eyebrowEl || !subEl) return;

  var cats = Array.isArray(categories) ? categories : [categories];
  var ownedList = (profile && profile.cosmetics) || [];
  var items = ownedList.filter(function(c) { return cats.indexOf(c.category) !== -1; });

  var catLabel = cats.map(function(c) { return CATEGORY_LABELS[c] || c; }).join(' / ');
  eyebrowEl.textContent = 'Your Cosmetics';
  titleEl.textContent = catLabel;
  subEl.textContent = items.length + ' owned · Click Equip to apply.';

  if (items.length === 0) {
    grid.innerHTML = '<div class="loading-placeholder">No cosmetics owned in this category.</div>';
    return;
  }

  grid.innerHTML = items.map(function(c) {
    var color = RARITY_COLORS[c.rarity] || '#888';
    var catLbl = CATEGORY_LABELS[c.category] || c.category;
    var previewHtml = buildCosmeticPreviewHtml(c);
    var toggleLabel = c.equipped ? 'Equipped' : 'Equip';
    var toggleClass = c.equipped ? 'equipped' : 'unequipped';
    var safeName = escapeHtml(c.name).replace(/'/g, "\\'");
    return '<div class="cosmetic-card' + (c.equipped ? ' equipped' : '') + '" data-cosmetic-id="' + c.cosmetic_id + '" data-category="' + c.category + '">' +
      '<button class="cosmetic-toggle ' + toggleClass + '" onclick="toggleCosmetic(\'' + c.cosmetic_id + '\', \'' + c.category + '\', ' + (c.equipped ? 'true' : 'false') + ', \'' + safeName + '\')">' + toggleLabel + '</button>' +
      previewHtml +
      '<div class="cosmetic-name">' + escapeHtml(c.name) + '</div>' +
      '<div class="cosmetic-category">' + escapeHtml(catLbl) + '</div>' +
      '<div class="cosmetic-rarity" style="background:' + color + '20; color:' + color + '">' + escapeHtml(c.rarity) + '</div>' +
      '</div>';
  }).join('');
}

function setupCosmeticPickerModal() {
  var modal = document.getElementById('cosmetic-picker-modal');
  var closeBtn = document.getElementById('cosmetic-picker-close');
  if (!modal) return;
  if (closeBtn && !closeBtn.dataset.bound) {
    closeBtn.dataset.bound = '1';
    closeBtn.addEventListener('click', closeCosmeticPicker);
  }
  if (!modal.dataset.bound) {
    modal.dataset.bound = '1';
    modal.addEventListener('click', function(e) { if (e.target === modal) closeCosmeticPicker(); });
  }
  if (!document.body.dataset.cosmeticPickerEscBound) {
    document.body.dataset.cosmeticPickerEscBound = '1';
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        var m = document.getElementById('cosmetic-picker-modal');
        if (m && m.style.display !== 'none') closeCosmeticPicker();
      }
    });
  }
}

function renderOverviewBusinesses(businesses) {
  const row = document.getElementById('ov-biz-row');
  if (!row) return; // Overview removed — businesses live in Businesses tab now
  const owned = {};
  (businesses || []).forEach(b => { owned[b.business_type] = b; });

  const types = Object.keys(BUSINESS_DATA);
  row.innerHTML = types.map(type => {
    const biz = BUSINESS_DATA[type];
    const ob = owned[type];
    if (ob) {
      const displayLevel = ob.shop_level != null ? ob.shop_level : ob.level;
      return `<div class="ov-biz-chip ov-biz-owned"><span class="ov-biz-emoji">${biz.emoji}</span><span class="ov-biz-info"><span class="ov-biz-name">${biz.name}</span><span class="ov-biz-level">Lvl ${displayLevel}</span></span></div>`;
    }
    return `<div class="ov-biz-chip ov-biz-locked"><span class="ov-biz-emoji">${biz.emoji}</span><span class="ov-biz-info"><span class="ov-biz-name">${biz.name}</span><span class="ov-biz-level">Locked</span></span></div>`;
  }).join('');
}

function focusTodayClaim() {
  switchToTab('wordgames');
  window.setTimeout(function() {
    var panel = document.getElementById('today-panel');
    if (panel && typeof panel.scrollIntoView === 'function') {
      panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    var btn = document.getElementById('today-claim-btn');
    if (btn && typeof btn.focus === 'function') btn.focus({ preventScroll: true });
  }, 90);
}

function getChallengeProgressSnapshot() {
  var daily = getDailyStatus();
  var weekly = getWeeklyStatus();
  var dailyTotal = 0;
  var dailyCompleted = 0;
  var weeklyTotal = 0;
  var weeklyCompleted = 0;

  GAMES.forEach(function(g) {
    if (isTrackedDailyGame(g)) {
      dailyTotal++;
      if (daily[g.id]) dailyCompleted++;
    }
    if (isTrackedWeeklyGame(g)) {
      weeklyTotal++;
      if (weekly[g.id]) weeklyCompleted++;
    }
  });

  return {
    daily: daily,
    weekly: weekly,
    dailyTotal: dailyTotal,
    dailyCompleted: dailyCompleted,
    weeklyTotal: weeklyTotal,
    weeklyCompleted: weeklyCompleted
  };
}

function buildProfileFocusMetric(label, value, subcopy, accent) {
  return '<div class="prof-focus-metric' + (accent ? ' ' + accent : '') + '">' +
    '<div class="prof-focus-metric-label">' + escapeHtml(label) + '</div>' +
    '<div class="prof-focus-metric-value">' + escapeHtml(value) + '</div>' +
    '<div class="prof-focus-metric-sub">' + escapeHtml(subcopy) + '</div>' +
  '</div>';
}

function renderProfileNextSteps(data) {
  var container = document.getElementById('profile-next-steps');
  if (!container) return;
  var source = data || profile;
  if (!source || !source.profile) {
    container.innerHTML = '<div class="loading-placeholder">Loading profile plan...</div>';
    return;
  }

  var p = source.profile || {};
  var pass = p.passStats || {};
  var business = p.businessStats || {};
  var claim = window.portalDailyClaim && window.portalDailyClaim.getStatus();
  var snapshot = getChallengeProgressSnapshot();
  var rec = getRecommendation(
    snapshot.daily,
    snapshot.weekly,
    snapshot.dailyCompleted,
    snapshot.dailyTotal,
    snapshot.weeklyCompleted,
    snapshot.weeklyTotal
  );

  var claimValue = 'Not ready';
  var claimSubcopy = 'Check back later';
  if (claim && claim.canClaim) {
    claimValue = 'Ready now';
    claimSubcopy = 'Day ' + ((claim.currentStreak || 0) + 1) + ' is waiting';
  } else if (claim && claim.currentStreak > 0) {
    claimValue = claim.currentStreak + 'd streak';
    claimSubcopy = claim.nextMilestone
      ? ('Next milestone: day ' + claim.nextMilestone.day)
      : 'Keep the streak alive';
  } else if (claim) {
    claimValue = 'Start streak';
    claimSubcopy = 'Claim once per day';
  }

  var businessesOwned = Number(business.businessesOwned || 0);
  var passiveIncome = source.incomePerSecond && source.incomePerSecond.total > 0
    ? formatIncome(source.incomePerSecond.total) + '/sec'
    : (businessesOwned > 0 ? 'Income building' : 'No passive income yet');
  var membershipActive = pass.membershipStatus === 'active' || pass.membershipStatus === 'trialing';
  var membershipLabel = prettyMembershipTier(pass.membershipTier || 'free');
  var membershipSubcopy = membershipActive
    ? 'Premium games unlocked'
    : 'Donor Class opens premium games';

  var title = rec ? rec.text : 'Your profile is in good shape.';
  var copy;
  if (claim && claim.canClaim) {
    copy = 'Your next streak reward is ready. Grab it first, then keep clearing today\'s boards.';
  } else if (snapshot.dailyTotal > 0 && snapshot.dailyCompleted < snapshot.dailyTotal) {
    copy = 'Daily and weekly progress and streak rewards all flow through the Word Games tab.';
  } else if (businessesOwned > 0) {
    copy = 'You\'re caught up on puzzles for now. Your businesses are the next best growth lever.';
  } else {
    copy = 'Your account is linked and ready. The next meaningful unlocks come from daily boards, store rewards, and your first business.';
  }

  var primaryAction = claim && claim.canClaim
    ? '<button type="button" class="profile-focus-action primary" onclick="focusTodayClaim()">Go To Daily Claim</button>'
    : (rec && rec.link && rec.linkLabel
      ? '<a href="' + escapeHtml(getLaunchHref(resolveRecommendationLink(rec.link, getDailyStatus(), getWeeklyStatus()))) + '" class="profile-focus-action primary">' + escapeHtml(rec.linkLabel) + '</a>'
      : '<button type="button" class="profile-focus-action primary" onclick="switchToTab(&quot;wordgames&quot;)">Open Word Games</button>');

  var secondaryAction = !membershipActive
    ? '<button type="button" class="profile-focus-action" onclick="switchToTab(&quot;pass&quot;)">View Membership</button>'
    : (businessesOwned > 0
      ? '<button type="button" class="profile-focus-action" onclick="openEmpireView()">Open Empire</button>'
      : '<button type="button" class="profile-focus-action" onclick="switchToTab(&quot;store&quot;)">Open Store</button>');

  var goatAction = '<a href="/goat" class="profile-focus-action goat" target="_blank">' +
    '<span class="wt-symbol wt-symbol-sm wt-symbol-gold"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5h8v3.5a4 4 0 0 1-8 0zM7 7H5.5A2.5 2.5 0 0 0 8 11M17 7h1.5A2.5 2.5 0 0 1 16 11M12 12v3.2M9 19h6" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg></span>' +
    'Open GOAT' +
  '</a>';

  container.innerHTML =
    '<div class="prof-focus-head">' +
      '<div class="prof-focus-kicker">Right now</div>' +
      '<div class="prof-focus-title">' + escapeHtml(title) + '</div>' +
      '<div class="prof-focus-copy">' + escapeHtml(copy) + '</div>' +
    '</div>' +
    '<div class="prof-focus-metrics">' +
      buildProfileFocusMetric('Daily Claim', claimValue, claimSubcopy, 'mint') +
      buildProfileFocusMetric('Dailies', snapshot.dailyCompleted + '/' + snapshot.dailyTotal, snapshot.dailyTotal > 0 ? (snapshot.dailyTotal - snapshot.dailyCompleted) + ' left today' : 'No daily boards', 'blue') +
      buildProfileFocusMetric('Weeklies', snapshot.weeklyCompleted + '/' + snapshot.weeklyTotal, snapshot.weeklyTotal > 0 ? (snapshot.weeklyTotal - snapshot.weeklyCompleted) + ' left this week' : 'No weekly boards', 'violet') +
      buildProfileFocusMetric('Membership', membershipLabel, membershipSubcopy, 'gold') +
    '</div>' +
    '<div class="prof-focus-actions">' +
      primaryAction +
      secondaryAction +
      goatAction +
    '</div>';
}

function renderOverviewPlatforms(data) {
  const p = data.profile;
  const summaryEl = document.getElementById('platforms-summary');
  const list = document.getElementById('platforms-list');
  if (!p.platforms || p.platforms.length === 0) {
    if (summaryEl) summaryEl.innerHTML = '';
    list.innerHTML = '<div class="loading-placeholder">No linked platforms</div>';
    return;
  }

  const oldChooser = document.querySelector('.pfp-chooser');
  if (oldChooser) oldChooser.remove();

  // Determine which platforms are linked
  const hasGithub = p.platforms.some(pl => pl.platform === 'github');
  const hasTiktokAccountLink = p.platforms.some(pl => pl.platform === 'tiktok');
  const hasDiscord = p.platforms.some(pl => pl.platform === 'discord');
  const currentPfpPref = data.preferences?.preferred_pfp_platform || '';
  const currentLogo = getSelectedProfileLogo(data);
  const anchorPlatform = hasDiscord
    ? 'Discord'
    : capitalize((p.platforms[0] && p.platforms[0].platform) || 'account');
  const avatarSource = currentLogo
    ? (currentLogo.name + ' logo')
    : currentPfpPref
      ? capitalize(currentPfpPref)
      : 'Auto';
  // Linking is only suggested to Discord-login users (optional GitHub/TikTok).
  // GitHub/Google accounts are standalone — no linking nag for them.
  const missingLinks = [];
  if (portalProvider === 'discord' && !hasGithub) missingLinks.push('GitHub');
  if (portalProvider === 'discord' && !hasTiktokAccountLink) missingLinks.push('TikTok');

  if (summaryEl) {
    summaryEl.innerHTML =
      '<div class="prof-platforms-summary-card">' +
        '<div class="prof-platforms-summary-top">' +
          '<div class="prof-platforms-summary-title">' + escapeHtml(String(p.platforms.length)) + ' linked account' + (p.platforms.length === 1 ? '' : 's') + '</div>' +
          '<div class="prof-platforms-summary-chip">' + escapeHtml(anchorPlatform) + ' anchor</div>' +
        '</div>' +
        '<div class="prof-platforms-summary-copy">Avatar source: ' + escapeHtml(avatarSource) + '.' +
          (missingLinks.length
            ? (' Add ' + escapeHtml(missingLinks.join(' + ')) + ' to keep your identity synced across portal and stream surfaces.')
            : ' Your core identity links are in place.') +
        '</div>' +
      '</div>';
  }

  list.innerHTML = p.platforms.map(pl => {
    const color = PLATFORM_COLORS[pl.platform] || 'var(--accent)';
    // Show unlink button only for non-primary platforms (don't let users unlink their anchor)
    // Discord is the anchor — only show unlink on non-discord platforms
    const canUnlink = pl.platform !== 'discord' && pl.platformUserId;
    const unlinkHtml = canUnlink
      ? `<button class="unlink-btn" data-platform="${pl.platform}" data-platform-id="${escapeHtml(pl.platformUserId)}" title="Unlink ${capitalize(pl.platform)}">✕</button>`
      : '';
    return `<div class="prof-platform-card" style="--plat-color:${color}">
      ${unlinkHtml}
      <span class="prof-plat-icon">${platformBadge(pl.platform)}</span>
      <span class="prof-plat-info">
        <span class="prof-plat-name">${capitalize(pl.platform)}</span>
        <span class="prof-plat-user">${escapeHtml(pl.displayName || pl.username || 'Linked')}</span>
      </span>
    </div>`;
  }).join('');

  // Add "Link Account" button
  if (portalProvider === 'discord' && !hasGithub) {
    list.insertAdjacentHTML('beforeend', `<a href="/auth/github?action=link" class="link-account-btn link-github">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z"/></svg>
      Link GitHub Account</a>`);
  }

  // TikTok link — surfaces /auth/tiktok?action=link, which had no entry point
  // until 2026-07-31. Only offered to Discord-anchored sessions, matching the
  // server-side guard in the TikTok callback.
  if (portalProvider === 'discord' && !hasTiktokAccountLink) {
    list.insertAdjacentHTML('beforeend', `<a href="/auth/tiktok?action=link" class="link-account-btn link-tiktok">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.59 2.59 0 0 1 0-5.18c.27 0 .52.04.76.12v-3.2a5.77 5.77 0 0 0-.76-.05A5.72 5.72 0 0 0 4.14 15.3 5.72 5.72 0 0 0 9.86 21a5.72 5.72 0 0 0 5.72-5.72V9.01a7.35 7.35 0 0 0 4.28 1.38V7.3a4.29 4.29 0 0 1-3.26-1.48z"/></svg>
      Link TikTok Account</a>`);
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

  let prefsHtml = '<div class="profile-prefs">';
  prefsHtml += '<div class="pref-row"><label>Profile picture:</label><span class="pref-row-copy">Use the avatar button above to switch between linked account avatars and unlocked profile logos.</span></div>';
  prefsHtml += '</div>';
  list.insertAdjacentHTML('afterend', prefsHtml);

}

// Cache for live game data (populated by loadLiveGames)
var cachedLiveGames = [];

// ─── Cross-Device Sync: fetch canonical completion status from Word Tycoon DB ──
var spSyncDone = false;
var spSyncTimestamp = 0;
var SP_SYNC_TTL = 60 * 1000; // re-sync every 60s (tight so cross-origin completions surface quickly)

// Server-authoritative dates — used by getDailyStatus/getWeeklyStatus/getDailyTimeLeft
// These come from the server (Edmonton timezone for daily, UTC for weekly).
// Portal MUST use these instead of computing its own dates.
var _serverToday = null;       // Edmonton YYYY-MM-DD from server
var _serverWeekStart = null;   // UTC Monday YYYY-MM-DD from server
var _serverNextReset = null;   // ISO timestamp of next Edmonton midnight

async function syncCompletionsFromServer() {
  if (spSyncDone && (Date.now() - spSyncTimestamp < SP_SYNC_TTL)) return;
  try {
    var res = await fetch('/api/sp-sync');
    var data = await res.json();
    if (!data.ok) return;

    // Store server-authoritative dates
    _serverToday = data.today;
    _serverWeekStart = data.weekStart;
    if (data.nextDailyReset) _serverNextReset = data.nextDailyReset;

    // Map server game IDs → localStorage daily keys (for game client cross-device sync)
    var dailyMap = {
      'word500-sp':      { key: 'word500_sp_daily_date' },
      'wordle-sp':       { key: 'wordle_sp_daily_date' },
      'betwixt-sp':      { key: 'betwixt_sp_daily_date' },
      'pixeletters-sp':  { key: 'pixeletters_sp_daily_date' },
      'figural-sp':      { key: 'figural_sp_daily_date' },
      'unwordle-sp':     { key: 'unwordle_sp_daily_date' },
      'rectangled-sp':   { key: 'rectangled_sp_daily_date' },
      'erectangled-sp':  { key: 'erectangled_sp_daily_date', aliases: ['sproutle_sp_daily_date'] },
      'sproutle-sp':     { key: 'erectangled_sp_daily_date', aliases: ['sproutle_sp_daily_date'] },
      'triangled-sp':    { key: 'triangled_sp_daily_date' }
    };
    var weeklyMap = {
      'spellingbee-sp-weekly': { key: 'spellingbee_sp_weekly' },
      'rectangled-sp-weekly':  { key: 'rectangled_sp_weekly' },
      'searchle-sp-weekly':    { key: 'searchle_sp_weekly' },
      'erectangled-sp-weekly': { key: 'erectangled_sp_weekly', aliases: ['sproutle_sp_weekly'] },
      'sproutle-sp-weekly':    { key: 'erectangled_sp_weekly', aliases: ['sproutle_sp_weekly'] },
      'wikisearchle-sp-weekly': { key: 'wikisearchle_sp_weekly' }
    };

    // Write server state to localStorage (game clients read these)
    Object.keys(dailyMap).forEach(function(serverId) {
      if (data.daily[serverId]) {
        setLocalStorageValueWithAliases(dailyMap[serverId].key, dailyMap[serverId].aliases, data.today);
      }
    });
    Object.keys(weeklyMap).forEach(function(serverId) {
      if (data.weekly[serverId]) {
        setLocalStorageValueWithAliases(weeklyMap[serverId].key, weeklyMap[serverId].aliases, data.weekStart);
      }
    });
    spSyncDone = true;
    spSyncTimestamp = Date.now();
  } catch(e) {
    console.warn('[Portal] Failed to sync completions:', e);
  }
}

// Re-sync when portal tab regains focus (covers cross-origin game completions).
document.addEventListener('visibilitychange', function() {
  if (document.hidden) return;
  if (Date.now() - spSyncTimestamp < 30 * 1000) return;
  spSyncDone = false;
  syncCompletionsFromServer().then(function() {
    try { renderDailyTracker(); } catch(e) {}
    try { renderWeeklyTracker(); } catch(e) {}
  });
});

// Cross-tab: a same-origin game writing a completion key triggers a re-render.
window.addEventListener('storage', function(e) {
  if (!e.key) return;
  if (/_sp_daily(_date)?$|_sp_weekly$/.test(e.key)) {
    try { renderDailyTracker(); } catch(_) {}
    try { renderWeeklyTracker(); } catch(_) {}
  }
});

// Games fire this after a successful /api/sp-daily/complete so portal updates instantly.
window.addEventListener('sp-daily-recorded', function() {
  spSyncDone = false;
  syncCompletionsFromServer().then(function() {
    try { renderDailyTracker(); } catch(_) {}
    try { renderWeeklyTracker(); } catch(_) {}
  });
});

function getDailyStatus() {
  // Use server-provided Edmonton date, fall back to UTC only if sync hasn't run yet
  var today = _serverToday || new Date().toISOString().slice(0, 10);
  var status = {};
  GAMES.forEach(function(g) {
    if (g.dailyKey) {
      addGameAliases(status, g, getLocalStorageValueWithAliases(g.dailyKey, g.dailyKeyAliases) === today);
    } else {
      addGameAliases(status, g, null); // no daily for this game
    }
  });
  return status;
}

function getPlayerCounts() {
  var counts = {};
  cachedLiveGames.forEach(function(g) {
    counts[g.id] = g.playerCount || 0;
    if (g.id === 'sproutle') counts.erectangled = g.playerCount || 0;
    if (g.id === 'erectangled') counts.sproutle = g.playerCount || 0;
  });
  return counts;
}

function getWeekStart() {
  // Use server-provided week start, fall back to local UTC computation
  if (_serverWeekStart) return _serverWeekStart;
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
      addGameAliases(status, g, getLocalStorageValueWithAliases(g.weeklyKey, g.weeklyKeyAliases) === ws);
    }
  });
  return status;
}

function setupScrollFadeHints() {
  var wraps = document.querySelectorAll('.daily-tracker-row-wrap');
  for (var i = 0; i < wraps.length; i++) {
    (function(wrap) {
      var row = wrap.querySelector('.daily-tracker-row');
      if (!row) return;
      function checkEnd() {
        var atEnd = row.scrollLeft + row.clientWidth >= row.scrollWidth - 4;
        var noScroll = row.scrollWidth <= row.clientWidth + 4;
        if (atEnd || noScroll) {
          wrap.classList.add('scrolled-end');
        } else {
          wrap.classList.remove('scrolled-end');
        }
      }
      row.addEventListener('scroll', checkEnd, { passive: true });
      // Keyboard arrow-key scrolling when row is focused
      row.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowRight') { row.scrollBy({ left: 100, behavior: 'smooth' }); e.preventDefault(); }
        if (e.key === 'ArrowLeft') { row.scrollBy({ left: -100, behavior: 'smooth' }); e.preventDefault(); }
      });
      // Re-check after renders populate chips
      var observer = new MutationObserver(checkEnd);
      observer.observe(row, { childList: true });
      checkEnd();
    })(wraps[i]);
  }
}

// ── Board toggle state ('daily' | 'weekly' | null) ────────────────────────
var openBoardState = null;

function setOpenBoard(which) {
  // Toggle off if already open
  if (openBoardState === which) {
    openBoardState = null;
  } else {
    openBoardState = which;
  }

  var dailyCard    = document.getElementById('today-daily-card');
  var weeklyCard   = document.getElementById('today-weekly-card');
  var dailyBoard   = document.getElementById('daily-tracker');
  var weeklyBoard  = document.getElementById('weekly-tracker');
  var boardsWrap   = document.getElementById('today-boards');

  var dailyOpen  = openBoardState === 'daily';
  var weeklyOpen = openBoardState === 'weekly';

  if (dailyCard)   dailyCard.setAttribute('aria-expanded',  dailyOpen  ? 'true' : 'false');
  if (weeklyCard)  weeklyCard.setAttribute('aria-expanded', weeklyOpen ? 'true' : 'false');

  if (dailyBoard)   dailyBoard.hidden  = !dailyOpen;
  if (weeklyBoard)  weeklyBoard.hidden = !weeklyOpen;
  if (boardsWrap)   boardsWrap.hidden  = !dailyOpen && !weeklyOpen;
}

function setupTodaySurface() {
  document.addEventListener('portal:daily-claim-update', function() {
    renderTodaySurface();
  });
  setupScrollFadeHints();
  renderTodaySurface();

  // Wire Daily Track card toggle
  var dailyCard = document.getElementById('today-daily-card');
  if (dailyCard) {
    dailyCard.addEventListener('click', function() { setOpenBoard('daily'); });
    dailyCard.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenBoard('daily'); }
    });
  }

  // Wire Weekly Track card toggle
  var weeklyCard = document.getElementById('today-weekly-card');
  if (weeklyCard) {
    weeklyCard.addEventListener('click', function() { setOpenBoard('weekly'); });
    weeklyCard.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenBoard('weekly'); }
    });
  }
}

var dailyCountdownInterval = null;

function getDailyTimeLeft() {
  // Count down to Edmonton midnight (server provides next reset as ISO timestamp)
  var now = new Date();
  var diff;
  if (_serverNextReset) {
    diff = new Date(_serverNextReset).getTime() - now.getTime();
  } else {
    // Fallback: estimate Edmonton midnight (UTC-6 in winter, UTC-7 in summer)
    // Server will correct this on next sync
    var tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    tomorrow.setUTCHours(tomorrow.getUTCHours() + 6); // approx Edmonton offset
    diff = tomorrow - now;
  }
  if (diff < 0) diff = 0;
  var h = Math.floor(diff / 3600000);
  var m = Math.floor((diff % 3600000) / 60000);
  var s = Math.floor((diff % 60000) / 1000);
  return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (s < 10 ? '0' : '') + s;
}

function updateDailyCountdown() {
  var el = document.getElementById('daily-countdown');
  if (el) el.textContent = '\u23F1 ' + getDailyTimeLeft();
  var todaySecondary = document.getElementById('today-daily-secondary');
  if (todaySecondary) {
    var dailyTotal = 0;
    GAMES.forEach(function(g) { if (isTrackedDailyGame(g)) dailyTotal++; });
    if (dailyTotal > 0) {
      todaySecondary.textContent = 'Resets in ' + getDailyTimeLeft() + ' · full clear earns a loot box';
    }
  }
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
    if (!isTrackedDailyGame(g)) return ''; // skip games outside the shared daily track
    total++;
    var done = daily[g.id];
    if (done) completed++;
    return buildChallengeTrackerCard(g, {
      kind: 'daily',
      done: done,
      actionHref: done ? '' : getLaunchHref(getSoloLaunchUrl(g, daily)),
      rewardText: '\uD83C\uDF81 Loot Box',
      actionLabel: 'Play Daily',
      titleSuffix: done ? ' \u2713 Completed' : ' - Play Daily'
    });
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

  renderTodaySurface();
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
    if (!isTrackedWeeklyGame(g)) return '';
    total++;
    var done = weekly[g.id];
    if (done) completed++;
    var isWeeklyOnly = isTrackedWeeklyGame(g) && !isTrackedDailyGame(g);
    return buildChallengeTrackerCard(g, {
      kind: 'weekly',
      done: done,
      actionHref: done ? '' : getLaunchHref(getWeeklyLaunchUrl(g)),
      rewardText: '\uD83C\uDFB0 Cosmetic' + (isWeeklyOnly ? ' \u2022 Weekly only' : ''),
      actionLabel: 'Play Weekly',
      titleSuffix: done ? ' \u2713 Completed this week' : ' - Play Weekly \u2022 Earn a cosmetic!'
    });
  }).join('');

  if (progressEl) {
    progressEl.textContent = completed + '/' + total;
    progressEl.className = 'weekly-tracker-progress' + (completed === total && total > 0 ? ' all-done' : '');
  }

  renderTodaySurface();
}

function buildChallengeTrackerCard(g, opts) {
  var kind = opts.kind;
  var done = !!opts.done;
  var statusLabel = kind === 'weekly' ? 'WEEKLY' : 'DAILY';
  var rewardLabel = opts.rewardText || '';
  var buttonHtml = done
    ? '<span class="gc-mode-btn gc-mode-solo challenge-card-btn is-complete">Completed</span>'
    : '<a href="' + opts.actionHref + '"' + GAME_LAUNCH_ATTRS + ' class="gc-mode-btn gc-mode-solo challenge-card-btn">' + opts.actionLabel + '</a>';

  return '<div class="game-card game-card--' + g.id + ' challenge-game-card challenge-game-card--' + kind + (done ? ' is-complete' : '') + '" role="listitem" style="--game-color:' + g.color + '" title="' + g.name + (opts.titleSuffix || '') + '">' +
    '<div class="challenge-card-status' + (done ? ' done' : '') + '">' + statusLabel + (done ? ' <span class="challenge-card-check">\u2713</span>' : '') + '</div>' +
    '<div class="gc-compact">' +
      '<img src="' + g.img + '" alt="' + g.name + '" class="gc-icon">' +
      '<div class="gc-info">' +
        '<div class="gc-name-row">' +
          '<span class="gc-name">' + (g.nameHtml || g.name) + '</span>' +
        '</div>' +
        '<div class="challenge-card-sub">' + rewardLabel + '</div>' +
      '</div>' +
    '</div>' +
    '<div class="gc-modes challenge-card-modes">' +
      buttonHtml +
    '</div>' +
  '</div>';
}

function renderTodaySurface() {
  var dailyProgressEl = document.getElementById('today-daily-progress');
  var dailyPrimaryEl = document.getElementById('today-daily-primary');
  var dailySecondaryEl = document.getElementById('today-daily-secondary');
  var weeklyProgressEl = document.getElementById('today-weekly-progress');
  var weeklyPrimaryEl = document.getElementById('today-weekly-primary');
  var weeklySecondaryEl = document.getElementById('today-weekly-secondary');
  if (!dailyProgressEl || !weeklyProgressEl) return;

  var daily = getDailyStatus();
  var weekly = getWeeklyStatus();
  var dailyTotal = 0;
  var dailyCompleted = 0;
  var weeklyTotal = 0;
  var weeklyCompleted = 0;

  GAMES.forEach(function(g) {
    if (isTrackedDailyGame(g)) {
      dailyTotal++;
      if (daily[g.id]) dailyCompleted++;
    }
    if (isTrackedWeeklyGame(g)) {
      weeklyTotal++;
      if (weekly[g.id]) weeklyCompleted++;
    }
  });

  dailyProgressEl.textContent = dailyTotal > 0 ? (dailyCompleted + '/' + dailyTotal) : '—';
  dailyPrimaryEl.textContent = dailyCompleted === dailyTotal && dailyTotal > 0
    ? 'All ' + dailyTotal + ' dailies cleared.'
    : (dailyCompleted === 0 ? 'No dailies cleared yet.' : (dailyCompleted + ' of ' + dailyTotal + ' cleared.'));
  dailySecondaryEl.textContent = dailyTotal > 0
    ? ('Resets in ' + getDailyTimeLeft() + ' · full clear earns a loot box')
    : '';

  var now = new Date();
  var dayOfWeek = now.getUTCDay();
  var daysLeft = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  weeklyProgressEl.textContent = weeklyTotal > 0 ? (weeklyCompleted + '/' + weeklyTotal) : '—';
  weeklyPrimaryEl.textContent = weeklyCompleted === weeklyTotal && weeklyTotal > 0
    ? 'All ' + weeklyTotal + ' weeklies cleared.'
    : (weeklyCompleted === 0 ? 'No weeklies cleared yet.' : (weeklyCompleted + ' of ' + weeklyTotal + ' cleared.'));
  weeklySecondaryEl.textContent = weeklyTotal > 0
    ? ((daysLeft > 0 ? daysLeft + ' day' + (daysLeft === 1 ? '' : 's') + ' left this week' : 'Last day of the week') + ' · full clear earns a cosmetic')
    : '';

  updateRecommendation(daily, weekly, dailyCompleted, dailyTotal, weeklyCompleted, weeklyTotal);
  if (profile && profile.profile) renderProfileNextSteps(profile);
}

// ── What To Do Next — single recommendation ────────────────────────────────
function updateRecommendation(daily, weekly, dailyDone, dailyTotal, weeklyDone, weeklyTotal) {
  var el = document.getElementById('today-recommendation');
  var iconEl = document.getElementById('today-rec-icon');
  var textEl = document.getElementById('today-rec-text');
  var linkEl = document.getElementById('today-rec-link');
  if (!el) return;

  var rec = getRecommendation(daily, weekly, dailyDone, dailyTotal, weeklyDone, weeklyTotal);
  if (!rec) {
    el.hidden = true;
    return;
  }

  iconEl.innerHTML = rec.icon || '';
  textEl.textContent = rec.text;
  if (rec.link && rec.linkLabel) {
    linkEl.textContent = rec.linkLabel;
    linkEl.href = getLaunchHref(resolveRecommendationLink(rec.link, daily, weekly));
    linkEl.removeAttribute('target');
    linkEl.removeAttribute('rel');
    linkEl.hidden = false;
  } else {
    linkEl.hidden = true;
  }
  el.hidden = false;
}

function getRecommendation(daily, weekly, dailyDone, dailyTotal, weeklyDone, weeklyTotal) {
  // Priority 1: Daily claim available
  var claim = window.portalDailyClaim && window.portalDailyClaim.getStatus();
  if (claim && claim.canClaim) {
    return { icon: WT_SYMBOLS.daily, text: 'Your daily streak reward is ready to claim.' };
  }

  // Priority 2: All dailies cleared — celebrate, no action needed
  if (dailyTotal > 0 && dailyDone === dailyTotal) {
    if (weeklyTotal > 0 && weeklyDone === weeklyTotal) {
      return { icon: WT_SYMBOLS.check, text: 'All dailies and weeklies cleared \u2014 you\u2019re done for today!' };
    }
    // Dailies done, suggest weekly if any remain
    if (weeklyTotal > 0 && weeklyDone < weeklyTotal) {
      var wGame = pickIncomplete(weekly, 'weeklyKey');
      var wRemaining = weeklyTotal - weeklyDone;
      return {
        icon: WT_SYMBOLS.wins,
        text: wRemaining + ' weekly' + (wRemaining > 1 ? ' challenges' : ' challenge') + ' left to clear.',
        link: wGame ? wGame.spUrl : null,
        linkLabel: wGame ? ('Play ' + wGame.name) : null
      };
    }
    return { icon: WT_SYMBOLS.check, text: 'All dailies cleared! Check back tomorrow.' };
  }

  // Priority 3: Close to completing dailies (75%+)
  var dailyRemaining = dailyTotal - dailyDone;
  if (dailyTotal > 0 && dailyDone > 0 && dailyRemaining <= 2) {
    var dGame = pickIncomplete(daily, 'dailyKey');
    return {
      icon: WT_SYMBOLS.warning,
      text: dailyRemaining + ' more to clear all dailies \u2014 full clear earns a loot box!',
      link: dGame ? dGame.spUrl : null,
      linkLabel: dGame ? ('Play ' + dGame.name) : null
    };
  }

  // Priority 4: Close to completing weeklies (one away)
  var weeklyRemaining = weeklyTotal - weeklyDone;
  if (weeklyTotal > 0 && weeklyDone > 0 && weeklyRemaining === 1) {
    var wgGame = pickIncomplete(weekly, 'weeklyKey');
    return {
      icon: WT_SYMBOLS.wins,
      text: '1 more weekly to clear \u2014 full clear earns a cosmetic!',
      link: wgGame ? wgGame.spUrl : null,
      linkLabel: wgGame ? ('Play ' + wgGame.name) : null
    };
  }

  // Priority 5: Streak milestone approaching (from claim data)
  if (claim && claim.nextMilestone && claim.nextMilestone.daysAway <= 2 && !claim.canClaim) {
    var md = claim.nextMilestone.daysAway;
    return {
      icon: WT_SYMBOLS.bolt,
      text: md === 0
        ? 'Claim tomorrow to hit your day ' + claim.nextMilestone.day + ' milestone!'
        : md + ' day' + (md > 1 ? 's' : '') + ' to your day ' + claim.nextMilestone.day + ' milestone.'
    };
  }

  // Priority 6: Has remaining dailies (general)
  if (dailyTotal > 0 && dailyDone < dailyTotal && dailyDone > 0) {
    var dgGame = pickIncomplete(daily, 'dailyKey');
    return {
      icon: WT_SYMBOLS.daily,
      text: dailyRemaining + ' dail' + (dailyRemaining === 1 ? 'y' : 'ies') + ' left today.',
      link: dgGame ? dgGame.spUrl : null,
      linkLabel: dgGame ? ('Play ' + dgGame.name) : null
    };
  }

  // Priority 7: No dailies started — gentle nudge
  if (dailyTotal > 0 && dailyDone === 0) {
    var firstGame = pickIncomplete(daily, 'dailyKey');
    return {
      icon: WT_SYMBOLS.daily,
      text: dailyTotal + ' daily boards to clear today.',
      link: firstGame ? firstGame.spUrl : null,
      linkLabel: firstGame ? ('Start with ' + firstGame.name) : null
    };
  }

  // Priority 8: Nothing actionable
  return null;
}

function pickIncomplete(status, keyField) {
  for (var i = 0; i < GAMES.length; i++) {
    var g = GAMES[i];
    var isTracked = keyField === 'dailyKey'
      ? isTrackedDailyGame(g)
      : (keyField === 'weeklyKey' ? isTrackedWeeklyGame(g) : !!g[keyField]);
    if (isTracked && !status[g.id]) return g;
  }
  return null;
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
      safeFetch('/api/me/rectangled'),
      safeFetch('/api/me/spellingbee'),
      safeFetch('/api/me/triangled'),
      safeFetch('/api/me/wikisearchle'),
    ]);
    if (results[0]) stats.searchle = results[0];
    if (results[1]) stats.word500 = results[1];
    if (results[2]) stats.betwixt = results[2];
    if (results[3]) stats.wordle = results[3];
    if (results[4]) stats.pixeletters = results[4];
    if (results[5]) stats.rectangled = results[5];
    if (results[6]) stats.spellingbee = results[6];
    if (results[7]) stats.triangled = results[7];
    if (results[8]) stats.wikisearchle = results[8];
  } catch(e) {}

  var daily = getDailyStatus();
  var weekly = getWeeklyStatus();
  var counts = getPlayerCounts();

  // Build a map of live game data keyed by game id
  var liveMap = {};
  (cachedLiveGames || []).forEach(function(lg) {
    liveMap[lg.id] = lg;
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
      modesHtml += '<a href="' + getLaunchHref(getSoloLaunchUrl(g, daily)) + '"' + GAME_LAUNCH_ATTRS + ' class="gc-mode-btn gc-mode-solo">Solo</a>';
    }
    if (g.mpUrl) {
      modesHtml += '<a href="' + getLaunchHref(getOnlineLaunchUrl(g)) + '"' + GAME_LAUNCH_ATTRS + ' class="gc-mode-btn gc-mode-online">Online</a>';
    }
    modesHtml += '</div>';

    // Compact card layout — show jackpot size
    var coinsHtml = '';
    var jackpot = live ? live.jackpot : 0;
    if (jackpot > 0) {
      coinsHtml = '<div class="gc-coins">\uD83D\uDFE2 ' + formatNumber(jackpot) + '</div>';
    }

    return '<div class="game-card game-card--' + g.id + (live ? ' gc-is-live' : '') + '" style="--game-color:' + g.color + '">' +
      '<div class="gc-compact">' +
        '<img src="' + g.img + '" alt="' + g.name + '" class="gc-icon">' +
        '<div class="gc-info">' +
          '<div class="gc-name-row">' +
            '<span class="gc-name">' + (g.nameHtml || g.name) + '</span>' +
            countHtml +
          '</div>' +
          coinsHtml +
        '</div>' +
      '</div>' +
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
  const buffs = {};
  const equipped = (cosmetics || []).filter(c => c.equipped);
  equipped.forEach(c => {
    // Use buff data already enriched by the server
    if (c.buffs) {
      c.buffs.forEach(b => { buffs[b.type] = (buffs[b.type] || 0) + b.value; });
    } else if (c.buff) {
      buffs[c.buff.type] = (buffs[c.buff.type] || 0) + c.buff.value;
    }
  });
  return buffs;
}

const INCOME_BUFF_KEYS = new Set(['biz_boost', 'offline_boost', 'coin_bonus', 'prestige', 'library_boost', 'tax_season_bonus']);

function getActiveIncomeBuffEntries() {
  const authoritative = profile?.incomePerSecond?.activeBuffs;
  if (Array.isArray(authoritative)) {
    return authoritative.filter(entry =>
      entry &&
      INCOME_BUFF_KEYS.has(String(entry.key || '')) &&
      Number(entry.value) > 0
    );
  }

  const fallbackBuffs = calcPlayerBuffs(profile?.cosmetics);
  return Object.entries(fallbackBuffs)
    .filter(([type, value]) => INCOME_BUFF_KEYS.has(type) && value > 0)
    .map(([type, value]) => ({
      key: type,
      label: type,
      value
    }));
}

function formatBuffPercent(value) {
  const percent = (Number(value) || 0) * 100;
  return percent % 1 === 0 ? percent.toFixed(0) : percent.toFixed(1);
}

function formatIncome(n) {
  if (n === 0) return '0';
  if (n < 0.01) return n.toFixed(4);
  if (n < 1) return n.toFixed(2);
  if (n < 100) return n.toFixed(1);
  return formatNumber(Math.floor(n));
}

function getIncomeSnapshot(mode) {
  const inc = profile?.incomePerSecond;
  if (!inc) return null;
  if (mode === 'currentNoBuffs' && inc.currentNoBuffs) return inc.currentNoBuffs;
  if (mode === 'online' && inc.online) return inc.online;
  if (mode === 'onlineNoBuffs' && inc.onlineNoBuffs) return inc.onlineNoBuffs;
  if (mode === 'offline' && inc.offline) return inc.offline;
  if (mode === 'offlineNoBuffs' && inc.offlineNoBuffs) return inc.offlineNoBuffs;
  if (inc.current) return inc.current;
  return inc;
}

function getDisplayedBusinessIncome(type, fallback, mode) {
  const byType = getIncomeSnapshot(mode)?.byBusinessType;
  if (byType && byType[type] != null) return byType[type];
  return fallback;
}

function getBusinessDisplayRows() {
  return [
    { key: 'bizIncome', type: 'regular', label: 'Regular Businesses', unit: 'XP/sec', note: 'Passive regular businesses use full online rate, then drop to 10% while offline.' },
    { key: 'pizzaIncome', type: 'pizza', label: 'Pizza Shop', unit: 'XP/sec', note: 'Managed business. Uses the same online and offline rate rules as regular businesses.' },
    { key: 'newsIncome', type: 'newspaper', label: 'Newspaper Route', unit: 'XP/sec', note: 'Managed business. Uses the same online and offline rate rules as regular businesses.' },
    { key: 'gymIncome', type: 'gym', label: 'Gym', unit: 'XP/sec', note: 'Managed business. Uses the same online and offline rate rules as regular businesses.' },
    { key: 'cinemaIncome', type: 'cinema', label: 'Movie Theater', unit: 'XP/sec', note: 'Managed business. Uses the same online and offline rate rules as regular businesses.' },
    { key: 'startupIncome', type: 'startup', label: 'Tech Startup', unit: 'XP/sec', note: 'Managed business. Uses the same online and offline rate rules as regular businesses.' },
    { key: 'bankIncome', type: 'bank', label: 'Bank', unit: 'XP/sec', note: 'Managed business. Uses the same online and offline rate rules as regular businesses.' },
    { key: 'stockmogulIncome', type: 'stockmogul', label: 'Stock Mogul', unit: 'portfolio/sec', note: 'Managed portfolio income. Uses the same online and offline rate rules as regular businesses.' },
    { key: 'carwashCleanRate', type: 'carwash', label: 'Car Wash', unit: 'clean cash/sec', note: 'Clean cash only. Shown here for clarity, but not counted in Total XP Income.' }
  ];
}

function describePresenceStatus(presenceInfo) {
  if (!presenceInfo) {
    return {
      title: 'Income mode unavailable',
      pill: 'Unknown',
      pillClass: 'unknown',
      rule: 'Income mode depends on recent account activity.',
      detail: '',
      currentNote: 'Current total from the server.',
      offlineNote: 'Offline preview unavailable.'
    };
  }

  const minutes = presenceInfo.thresholdMinutes || 3;
  const totalPlayers = presenceInfo.totalPlayers || 0;
  const onlineCount = presenceInfo.onlineCount || 0;
  const lastSeen = presenceInfo.lastActivityAt
    ? new Date(presenceInfo.lastActivityAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
    : null;

  if (presenceInfo.status === 'online') {
    return {
      title: 'Online income is active',
      pill: 'Online',
      pillClass: 'online',
      rule: `Your account earns full online rates while recent activity is seen within the last ${minutes} minutes, including a visible, focused website tab.`,
      detail: totalPlayers > 1
        ? `${onlineCount} of ${totalPlayers} linked player rows are active right now.${lastSeen ? ' Last activity ' + lastSeen + '.' : ''}`
        : `${lastSeen ? 'Last activity ' + lastSeen + '.' : 'Recent stream gameplay, taps, or a visible, focused portal tab is keeping you online.'}`,
      currentNote: 'Current total matches your live online rate.',
      offlineNote: 'Offline preview shows what the same businesses would earn after inactivity.'
    };
  }

  if (presenceInfo.status === 'mixed') {
    return {
      title: 'Mixed account activity',
      pill: 'Mixed',
      pillClass: 'mixed',
      rule: `Some linked player rows are active and some are offline, so the current total is a mix of online and offline rates.`,
      detail: `${onlineCount} of ${totalPlayers} linked player rows are online.${lastSeen ? ' Most recent activity ' + lastSeen + '.' : ''}`,
      currentNote: 'Current total is a blended rate across linked player rows.',
      offlineNote: 'Offline preview shows what your account would earn if every linked row went inactive.'
    };
  }

  return {
    title: 'Offline income is active',
    pill: 'Offline',
    pillClass: 'offline',
    rule: `After ${minutes} minutes without tracked activity or a visible, focused website tab, income switches to offline rates.`,
    detail: `Stream gameplay, taps, and actively viewing the website in a visible, focused tab all count as online activity.${lastSeen ? ' Last activity ' + lastSeen + '.' : ''}`,
    currentNote: 'Current total reflects offline earnings right now.',
    offlineNote: 'Offline preview matches the reduced rate the server will settle while inactive.'
  };
}

function renderBusinesses(businesses) {
  // Empire page module (empire.js) owns the businesses tab when present.
  // The legacy body below stays as a fallback if empire.js failed to load.
  if (window.Empire && typeof window.Empire.render === 'function') {
    window.Empire.render(profile);
    return;
  }
  const grid = document.getElementById('businesses-grid');
  const owned = {};
  (businesses || []).forEach(b => { owned[b.business_type] = b; });
  const coins = profile?.profile?.coins || 0;
  const presenceStatus = profile?.incomePerSecond?.presence?.status;
  const presenceSuffix = presenceStatus === 'online'
    ? ' <span class="biz-income-mode">online</span>'
    : presenceStatus === 'offline'
      ? ' <span class="biz-income-mode">offline</span>'
      : '';
  bizOpenType = null;

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
      const maxLevel = cfg.maxLevel || 100;
      const isMaxLevel = level >= maxLevel;
      const curMult = getBizProgressionMult(type, level);
      const nextMult = getBizProgressionMult(type, level + 1);
      const multGain = nextMult - curMult;
      const showMult = BUSINESS_PROGRESSION[type] && BUSINESS_PROGRESSION[type].multiplier > 1;
      const taxSeasonReady = type === 'carwash'
        && businessTaxSeasonStatus
        && businessTaxSeasonStatus.ok
        && businessTaxSeasonStatus.enabled
        && businessTaxSeasonStatus.eligibility
        && businessTaxSeasonStatus.eligibility.eligible
        && !(businessTaxSeasonStatus.state && businessTaxSeasonStatus.state.completed);
      // Income display: prefer the server-computed per-business breakdown so
      // cards match the earnings panel and account overview.
      let cardIncVal, cardIncLabel;
      if (type === 'newspaper') {
        const newsIps = getDisplayedBusinessIncome(type, profile?.incomePerSecond?.newsIncome);
        cardIncVal = formatIncome(newsIps != null ? newsIps : ips);
        cardIncLabel = '<span style="color:var(--success)">XP</span>/sec' + presenceSuffix;
      } else if (type === 'gym') {
        const gymIps = getDisplayedBusinessIncome(type, profile?.incomePerSecond?.gymIncome);
        cardIncVal = formatIncome(gymIps != null ? gymIps : ips);
        cardIncLabel = '<span style="color:var(--success)">XP</span>/sec' + presenceSuffix;
      } else if (type === 'cinema') {
        const cinemaIps = getDisplayedBusinessIncome(type, profile?.incomePerSecond?.cinemaIncome);
        cardIncVal = formatIncome(cinemaIps != null ? cinemaIps : ips);
        cardIncLabel = '<span style="color:var(--success)">XP</span>/sec' + presenceSuffix;
      } else if (type === 'startup') {
        const startupIps = getDisplayedBusinessIncome(type, profile?.incomePerSecond?.startupIncome);
        cardIncVal = formatIncome(startupIps != null ? startupIps : ips);
        cardIncLabel = '<span style="color:var(--success)">XP</span>/sec' + presenceSuffix;
      } else if (type === 'bank') {
        const bankIps = getDisplayedBusinessIncome(type, profile?.incomePerSecond?.bankIncome);
        cardIncVal = formatIncome(bankIps != null ? bankIps : ips);
        cardIncLabel = '<span style="color:var(--success)">XP</span>/sec' + presenceSuffix;
      } else if (type === 'stockmogul') {
        const stockIps = getDisplayedBusinessIncome(type, profile?.incomePerSecond?.stockmogulIncome);
        cardIncVal = formatIncome(stockIps != null ? stockIps : ips);
        cardIncLabel = 'portfolio/sec' + presenceSuffix;
      } else if (type === 'carwash') {
        const cwRate = getDisplayedBusinessIncome(type, profile?.incomePerSecond?.carwashCleanRate);
        if (cwRate > 0) {
          cardIncVal = formatIncome(cwRate);
          cardIncLabel = '<span style="color:#10b981">clean cash</span>/sec' + presenceSuffix;
        } else {
          cardIncVal = formatIncome(ips);
          cardIncLabel = 'coins/sec' + presenceSuffix;
        }
      } else if (type === 'pizza') {
        cardIncVal = '10%';
        cardIncLabel = 'real <span style="color:var(--success)">XP</span>/sale' + presenceSuffix;
      } else if (type === 'arcade') {
        cardIncVal = 'Play';
        cardIncLabel = 'to win <span style="color:var(--success)">XP</span>';
      } else {
        cardIncVal = formatIncome(getDisplayedBusinessIncome(type, ips));
        cardIncLabel = '/sec' + presenceSuffix;
      }
      return `
        <div class="biz-card biz-owned${taxSeasonReady ? ' biz-tax-ready' : ''}" data-business-type="${type}" onclick="toggleBusinessPanel('${type}')">
          <div class="biz-card-left">
            <div class="biz-card-emoji">${businessBadge(type)}</div>
          </div>
          <div class="biz-card-center">
            <div class="biz-card-name">${biz.name}</div>
            <div class="biz-card-level">
              <span class="biz-level-badge${isWordUpgrade ? ' biz-level-auto' : ''}">Lv.${ob.shop_level != null ? ob.shop_level : level}${isMaxLevel ? ' MAX' : ''}</span>
              ${(ob.prestige_level > 0) ? `<span class="biz-prestige-badge">P${ob.prestige_level}</span>` : ''}
              ${isWordUpgrade ? `<span class="biz-auto-tag">${WT_SYMBOLS.words}</span>` : ''}
            </div>
            <div class="biz-card-income">
              <span class="biz-income-val">${cardIncVal}</span>
              <span class="biz-income-label">${cardIncLabel}</span>
            </div>
            ${showMult ? `<div class="biz-card-mult">${WT_SYMBOLS.arcade} ${curMult.toFixed(1)}x word rewards</div>` : ''}
            ${taxSeasonReady ? `<div class="biz-tax-reset-pill">${WT_SYMBOLS.warning} Available for Full Reset</div>` : ''}
          </div>
          <div class="biz-card-right">
            ${taxSeasonReady ? '<button class="biz-tax-reset-btn" onclick="triggerBusinessTaxSeason(event)">Available for Full Reset</button>' : ''}
            ${isWordUpgrade ? `
              <div class="biz-card-auto-info">Upgrades with words found</div>
            ` : isMaxLevel ? `
              <div class="biz-card-auto-info">Max Level</div>
            ` : ''}
            ${type === 'pizza' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="event.stopPropagation(); openPizzaShop()">Manage Shop</button>' : ''}
            ${type === 'newspaper' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="event.stopPropagation(); openNewspaperRoute()">Manage Route</button>' : ''}
            ${type === 'gym' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="event.stopPropagation(); openGymClub()">Manage Gym</button>' : ''}
            ${type === 'cinema' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="event.stopPropagation(); openCinemaTheater()">Manage Theater</button>' : ''}
            ${type === 'startup' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="event.stopPropagation(); openStartupHub()">Manage Startup</button>' : ''}
            ${type === 'bank' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="event.stopPropagation(); openBankVault()">Manage Bank</button>' : ''}
            ${type === 'carwash' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="event.stopPropagation(); openCarwashShop()">Manage Car Wash</button>' : ''}
            ${type === 'stockmogul' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="event.stopPropagation(); openStockMogul()">Manage Portfolio</button>' : ''}
            ${type === 'library' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="event.stopPropagation(); openLibrary()">Manage Library</button>' : ''}
            ${type === 'arcade' ? '<button class="biz-buy-btn biz-buy-new" style="margin-top:6px;font-size:0.8rem" onclick="event.stopPropagation(); openArcade()">Play Arcade</button>' : ''}
          </div>
          <div class="biz-inline-panel-slot"></div>
        </div>
      `;
    }

    // Locked business card — special handling for clean cash businesses (e.g. Stock Mogul)
    if (cfg.cleanCashBusiness) {
      return `
        <div class="biz-card biz-locked">
          <div class="biz-card-left">
            <div class="biz-card-emoji">${businessBadge(type)}</div>
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
            <div class="biz-card-cost" style="color:#10b981;font-size:0.75rem">${formatNumber(cfg.cleanCashCost)} clean cash</div>
            <button class="biz-buy-btn biz-buy-new" onclick="openStockMogul()">
              ${WT_SYMBOLS.upgrade} View Details
            </button>
          </div>
        </div>
      `;
    }

    // Standard locked business card
    return `
      <div class="biz-card biz-locked">
        <div class="biz-card-left">
          <div class="biz-card-emoji">${businessBadge(type)}</div>
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
  renderEarningsBreakdown();
  renderBuffsSummary(getActiveIncomeBuffEntries());

}

async function triggerBusinessTaxSeason(event) {
  if (event) event.stopPropagation();
  if (!businessTaxSeasonStatus || !businessTaxSeasonStatus.ok) {
    showToast('Tax Season data is unavailable', 'error');
    return;
  }
  if (!businessTaxSeasonStatus.enabled) {
    showToast('Tax Season is not enabled', 'error');
    return;
  }
  if (!businessTaxSeasonStatus.eligibility || !businessTaxSeasonStatus.eligibility.eligible) {
    showToast('Car Wash is not ready for a full reset yet', 'info');
    return;
  }
  if (businessTaxSeasonStatus.state && businessTaxSeasonStatus.state.completed) {
    showToast('Tax Season has already been completed for this account', 'info');
    return;
  }
  if (!confirm('The IRS has found you for tax fraud, and you are bankrupt.\n\nThis will activate your full reset and seize your empire.')) return;
  try {
    const r = await fetch('/api/me/carwash/tax-season', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        confirmation: businessTaxSeasonStatus.confirmationPhrase || 'RESET MY EMPIRE',
        resetReason: 'business_card_full_reset'
      })
    });
    const data = await r.json();
    if (data.ok) {
      showToast(data.message || 'Tax Season complete', 'success', 6000);
      await loadProfile();
      if (carwashLoaded) loadCarwashShop();
    } else {
      showToast(data.message || 'Tax Season failed', data.code === 'confirmation_required' ? 'info' : 'error', 5000);
      await loadBusinessTaxSeasonStatus(profile && profile.businesses);
      renderBusinesses(profile && profile.businesses);
    }
  } catch {
    showToast('Tax Season failed', 'error');
  }
}

function renderEarningsBreakdown() {
  var current = getIncomeSnapshot('current');
  if (!current) return;

  var online = getIncomeSnapshot('online') || current;
  var offline = getIncomeSnapshot('offline') || current;
  var currentNoBuffs = getIncomeSnapshot('currentNoBuffs') || current;
  var onlineNoBuffs = getIncomeSnapshot('onlineNoBuffs') || online;
  var offlineNoBuffs = getIncomeSnapshot('offlineNoBuffs') || offline;
  var presenceInfo = profile && profile.incomePerSecond && profile.incomePerSecond.presence;
  var rateInfo = profile && profile.incomePerSecond && profile.incomePerSecond.rates;
  var summary = describePresenceStatus(presenceInfo);

  var titleEl = document.getElementById('biz-presence-title');
  var compactTitleEl = document.getElementById('biz-presence-title-compact');
  var pillEl = document.getElementById('biz-presence-pill');
  var compactPillEl = document.getElementById('biz-presence-pill-compact');
  var ruleEl = document.getElementById('biz-presence-rule');
  var detailEl = document.getElementById('biz-presence-detail');
  var compactCurrentEl = document.getElementById('biz-rate-current-compact');

  if (titleEl) titleEl.textContent = summary.title;
  if (compactTitleEl) compactTitleEl.textContent = summary.title;
  if (pillEl) {
    pillEl.textContent = summary.pill;
    pillEl.className = 'biz-presence-pill biz-presence-pill-' + summary.pillClass;
  }
  if (compactPillEl) {
    compactPillEl.textContent = summary.pill;
    compactPillEl.className = 'biz-presence-pill biz-presence-pill-' + summary.pillClass;
  }
  if (ruleEl) ruleEl.textContent = summary.rule;
  if (detailEl) detailEl.textContent = summary.detail;
  if (compactCurrentEl) compactCurrentEl.textContent = formatIncome(online.total) + '/sec';

  var rows = getBusinessDisplayRows();
  var breakdownRows = rows.filter(function(row) {
    return (current[row.key] || 0) > 0 || (online[row.key] || 0) > 0 || (offline[row.key] || 0) > 0;
  });

  var rowsEl = document.getElementById('biz-breakdown-rows');
  if (rowsEl) {
    rowsEl.innerHTML = breakdownRows.map(function(row) {
      return '' +
        '<div class="biz-breakdown-row' + (row.type === 'carwash' ? ' biz-breakdown-row-carwash' : '') + '">' +
          '<div class="biz-breakdown-source">' +
            '<div class="biz-breakdown-label">' + row.label + '</div>' +
            '<div class="biz-breakdown-note">' + row.note + '</div>' +
          '</div>' +
          '<div class="biz-breakdown-val">' + formatIncome(online[row.key] || 0) + '<span>' + row.unit + '</span></div>' +
          '<div class="biz-breakdown-val">' + formatIncome(offline[row.key] || 0) + '<span>' + row.unit + '</span></div>' +
        '</div>';
    }).join('') +
    '<div class="biz-breakdown-row biz-breakdown-row-total">' +
      '<div class="biz-breakdown-source">' +
        '<div class="biz-breakdown-label">Total XP Income (No Buffs)</div>' +
        '<div class="biz-breakdown-note">Base empire income before the active buff chips below are applied.</div>' +
      '</div>' +
      '<div class="biz-breakdown-val biz-breakdown-val-total">' + formatIncome(onlineNoBuffs.total) + '<span>XP/sec</span></div>' +
      '<div class="biz-breakdown-val biz-breakdown-val-total">' + formatIncome(offlineNoBuffs.total) + '<span>XP/sec</span></div>' +
    '</div>' +
    '<div class="biz-breakdown-row biz-breakdown-row-total">' +
      '<div class="biz-breakdown-source">' +
        '<div class="biz-breakdown-label">Total XP Income (With Buffs)</div>' +
        '<div class="biz-breakdown-note">This total includes all XP-producing businesses after active buffs are applied. Car Wash clean cash stays separate.</div>' +
      '</div>' +
      '<div class="biz-breakdown-val biz-breakdown-val-total">' + formatIncome(online.total) + '<span>XP/sec</span></div>' +
      '<div class="biz-breakdown-val biz-breakdown-val-total">' + formatIncome(offline.total) + '<span>XP/sec</span></div>' +
    '</div>';
  }

  var totalNote = document.getElementById('biz-total-note');
  if (totalNote) {
    totalNote.style.display = ((current.carwashCleanRate || 0) > 0 || (online.carwashCleanRate || 0) > 0 || (offline.carwashCleanRate || 0) > 0) ? '' : 'none';
  }

  var explainer = document.getElementById('biz-explainer-copy');
  if (explainer) {
    var regularRate = rateInfo && typeof rateInfo.regularOfflineRate === 'number'
      ? Math.round(rateInfo.regularOfflineRate * 100)
      : 10;
    var managedRate = rateInfo && typeof rateInfo.managedOfflineRate === 'number'
      ? Math.round(rateInfo.managedOfflineRate * 100)
      : 10;
    explainer.innerHTML = [
      'The server marks your account <strong>online</strong> when it sees recent stream gameplay, taps, or a logged-in website session in a <strong>visible, focused</strong> tab. If none of that happens for about <strong>' + (presenceInfo?.thresholdMinutes || 3) + ' minutes</strong>, income switches to offline rates.',
      '<strong>Passive income</strong> is your business income system. <strong>Offline income</strong> is just that same income running at a reduced rate while you are inactive. Right now both regular and managed businesses settle at <strong>' + managedRate + '%</strong> of their online rate when offline.',
      'Income cosmetics now apply to managed businesses the same way they apply to regular businesses. Biz Income, Offline Income, All Income, and All Coins buffs all stack on top of the base online or offline rate.',
      '<strong>If Online</strong> and <strong>If Offline</strong> show the same empire recalculated under each mode so you can see exactly what changes when your account goes inactive.',
      'For managed businesses, income is settled before upgrades, prestige, or other income-changing mutations. That means upgrading no longer rewrites already-earned time at a better rate after the fact.'
    ].map(function(line) {
      return '<p>' + line + '</p>';
    }).join('');
  }
}

function renderBuffsSummary(buffEntries) {
  const list = document.getElementById('biz-buffs-list');
  const BUFF_ICONS = {
    tap_boost: WT_SYMBOLS.upgrade, word_game_boost: WT_SYMBOLS.words, biz_boost: WT_SYMBOLS.income, offline_boost: WT_SYMBOLS.weekly,
    combo_boost: WT_SYMBOLS.store, coin_bonus: WT_SYMBOLS.xp, prestige: WT_SYMBOLS.wins, lucky_bonus: WT_SYMBOLS.store,
    word_reward_2x: WT_SYMBOLS.wins, library_boost: WT_SYMBOLS.words, tax_season_bonus: WT_SYMBOLS.warning
  };
  const BUFF_NAMES = {
    tap_boost: 'Tap Power', word_game_boost: 'Word Game Money', biz_boost: 'Biz Income',
    offline_boost: 'Offline Income', combo_boost: 'Combo Max', coin_bonus: 'All Coins',
    prestige: 'All Income', lucky_bonus: 'Lucky 2x', word_reward_2x: 'Word Reward 2x',
    library_boost: 'Library Income', tax_season_bonus: 'First Full Reset'
  };
  const BUFF_COLORS = {
    tap_boost: '#ff6b6b', word_game_boost: '#4fc34f', biz_boost: '#4fc34f', offline_boost: '#4a9eff',
    combo_boost: '#ff8c00', coin_bonus: '#ffab00', prestige: '#b44aff', lucky_bonus: '#00cc88',
    word_reward_2x: '#ffdd57', library_boost: '#4a9eff', tax_season_bonus: '#ffd166'
  };

  const activeBuffs = Array.isArray(buffEntries) ? buffEntries.filter(entry => Number(entry?.value) > 0) : [];
  if (activeBuffs.length === 0) {
    list.innerHTML = '<div class="biz-no-buffs">No income buffs active right now.</div>';
    return;
  }

  list.innerHTML = activeBuffs.map((entry) => {
    const type = String(entry.key || '');
    const value = Number(entry.value) || 0;
    const label = entry.label || BUFF_NAMES[type] || type;
    return `
    <div class="biz-buff-chip" style="--buff-color: ${BUFF_COLORS[type] || 'var(--accent)'}">
      <span class="biz-buff-icon">${BUFF_ICONS[type] || WT_SYMBOLS.store}</span>
      <span class="biz-buff-name">${label}</span>
      <span class="biz-buff-val">+${formatBuffPercent(value)}%</span>
    </div>
  `;
  }).join('');
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
      // Auto-init car wash if carwash was just purchased for the first time
      if (type === 'carwash') {
        fetch('/api/me/carwash/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(function(r) { return r.json(); })
          .then(function(initData) {
            if (initData.ok) showToast('Car Wash unlocked! Click Manage Car Wash to open it.', 'success', 4000);
          }).catch(function() {});
      }
      if (type === 'gym') {
        fetch('/api/me/gym/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(function(r) { return r.json(); })
          .then(function(initData) {
            if (initData.ok) showToast('Gym unlocked! Click Manage Gym to open it.', 'success', 4000);
          }).catch(function() {});
      }
      if (type === 'cinema') {
        fetch('/api/me/cinema/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(function(r) { return r.json(); })
          .then(function(initData) {
            if (initData.ok) showToast('Movie Theater unlocked! Click Manage Theater to open it.', 'success', 4000);
          }).catch(function() {});
      }
      if (type === 'startup') {
        fetch('/api/me/startup/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(function(r) { return r.json(); })
          .then(function(initData) {
            if (initData.ok) showToast('Tech Startup unlocked! Click Manage Startup to open it.', 'success', 4000);
          }).catch(function() {});
      }
      if (type === 'bank') {
        fetch('/api/me/bank/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(function(r) { return r.json(); })
          .then(function(initData) {
            if (initData.ok) showToast('Bank unlocked! Click Manage Bank to open it.', 'success', 4000);
          }).catch(function() {});
      }
      // Auto-init Stock Mogul if stockmogul was just purchased
      if (type === 'stockmogul') {
        fetch('/api/me/stockmogul/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
          .then(function(r) { return r.json(); })
          .then(function(initData) {
            if (initData.ok) showToast('Stock Mogul unlocked! Click Manage Portfolio to open it.', 'success', 4000);
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

  initPreview();
  renderVisibilitySettings();
  renderFanClubBadgeToggle();
  const cosmeticFilter = document.getElementById('cosmetic-category-filter');
  if (cosmeticFilter && !cosmeticFilter.dataset.userChanged) cosmeticFilter.value = 'equipped';
  renderCosmetics(ownedList, cosmeticFilter?.value || 'equipped');
  applyPreviewCosmetics();
  renderSets(ownedList);
}

function renderVisibilitySettings() {
  var container = document.getElementById('visibility-settings');
  if (!container || !profile) return;

  var raw = profile.preferences && profile.preferences.cosmetic_visibility;
  var visibility = null;
  // raw exists (even as '{}') means user has saved preferences — treat as explicit state
  var hasPrefs = raw !== null && raw !== undefined;
  if (hasPrefs) {
    try { visibility = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { visibility = {}; }
  }
  // Default: word_color and word_glow OFF for users with no saved preferences
  var DEFAULT_OFF = { word_color: true, word_glow: true };

  var CATEGORIES = [
    { key: 'name_color', label: 'Name Color' },
    { key: 'name_glow', label: 'Name Glow' },
    { key: 'word_color', label: 'Word Color' },
    { key: 'word_glow', label: 'Word Glow' },
    { key: 'title', label: 'Title' },
    { key: 'win_effect', label: 'Win Effect' },
    { key: 'profile_border', label: 'Profile Border' },
    { key: 'profile_glow', label: 'Profile Glow' },
    { key: 'hero_badge', label: 'Hero Badge' }
  ];

  container.innerHTML = '<h4>Cosmetic Visibility</h4>' + CATEGORIES.map(function (cat) {
    var enabled = hasPrefs ? (visibility[cat.key] !== false) : !DEFAULT_OFF[cat.key];
    return '<label class="vis-toggle">' +
      '<input type="checkbox" data-cat="' + cat.key + '"' + (enabled ? ' checked' : '') + '>' +
      '<span>' + cat.label + '</span></label>';
  }).join('');

  container.querySelectorAll('input[type="checkbox"]').forEach(function (cb) {
    cb.addEventListener('change', async function () {
      var vis = {};
      container.querySelectorAll('input[type="checkbox"]').forEach(function (el) {
        if (!el.checked) vis[el.dataset.cat] = false;
      });
      try {
        var response = await fetch('/api/me/prefs', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cosmetic_visibility: JSON.stringify(vis) })
        });
        var data = await response.json().catch(function () { return { ok: response.ok }; });
        if (!response.ok || data.ok === false) throw new Error(data.message || data.error || 'Failed to save');
        if (profile && profile.preferences) profile.preferences.cosmetic_visibility = JSON.stringify(vis);
        showToast('Visibility updated', 'success', 2000);
      } catch (e) {
        showToast(e && e.message ? e.message : 'Failed to save', 'error');
      }
    });
  });
}

async function renderFanClubBadgeToggle() {
  var container = document.getElementById('fanclub-badge-settings');
  if (!container) return;
  let status = null;
  try {
    var r = await fetch('/api/me/fanclub-badge', { credentials: 'same-origin' });
    if (r.ok) status = await r.json();
  } catch {}
  if (!status || !status.ok || !status.eligible) {
    container.hidden = true;
    container.innerHTML = '';
    return;
  }
  container.hidden = false;
  var show = !status.hide;
  container.innerHTML =
    '<h4>TikTok Fan Club</h4>' +
    '<label class="vis-toggle">' +
      '<input type="checkbox" id="fanclub-badge-toggle"' + (show ? ' checked' : '') + '>' +
      '<span><img src="/portal/assets/badges/tiktok-fanclub.png" alt="" style="width:20px;height:20px;vertical-align:middle;margin-right:6px;">Show my fan club badge on my avatar</span>' +
    '</label>';
  var cb = container.querySelector('#fanclub-badge-toggle');
  cb.addEventListener('change', async function () {
    var hide = !cb.checked;
    try {
      var resp = await fetch('/api/me/fanclub-badge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ hide: hide })
      });
      var data = await resp.json().catch(function () { return { ok: resp.ok }; });
      if (!resp.ok || data.ok === false) throw new Error(data.error || 'Failed to save');
      showToast(hide ? 'Fan club badge hidden' : 'Fan club badge shown', 'success', 2000);
    } catch (e) {
      cb.checked = !cb.checked;
      showToast(e && e.message ? e.message : 'Failed to save', 'error');
    }
  });
}

function initPreview() {
  // Clear platform-switching buttons — avatar comes from the profile pic picker
  const selector = document.getElementById('preview-platform-selector');
  if (selector) selector.innerHTML = '';

  // Set preview avatar to the user's resolved preferred profile pic (same source as profile hero)
  const avatarEl = document.getElementById('preview-avatar');
  if (avatarEl) {
    const resolvedPic = profile?.profile?.profilePic;
    const customUrl = profile?.preferences?.customAvatarUrl;
    avatarEl.src = resolveAvatar(customUrl || resolvedPic);
    avatarEl.style.display = 'block';
    avatarEl.onerror = function() { this.onerror = null; this.src = AVATAR_FALLBACK; };
    markAvatarFallback(avatarEl);
  }

  // Set preview name to preferred display name or first platform name
  const nameEl = document.getElementById('preview-name');
  if (nameEl) {
    const platforms = profile?.profile?.platforms || [];
    const preferredName = profile?.preferences?.preferred_display_name;
    const platName = platforms.length > 0 ? (platforms[0].displayName || platforms[0].username) : 'Player';
    nameEl.textContent = preferredName || platName || 'Player';
  }
}

function scrollToPortalSection(id) {
  var el = document.getElementById(id);
  if (el && typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function setStoreCategoryFilter(value) {
  var select = document.getElementById('store-cat-filter');
  if (!select) return;
  select.value = value;
  renderStoreGrid();
  scrollToPortalSection('store-guidance');
}

function openStoreAffordableView() {
  var cat = document.getElementById('store-cat-filter');
  var rarity = document.getElementById('store-rarity-filter');
  var set = document.getElementById('store-set-filter');
  var buff = document.getElementById('store-buff-filter');
  var sort = document.getElementById('store-sort');
  if (cat) cat.value = 'all';
  if (rarity) rarity.value = 'all';
  if (set) set.value = 'all';
  if (buff) buff.value = 'all';
  if (sort) sort.value = 'price-asc';
  renderStoreGrid();
  scrollToPortalSection('store-grid');
}

function setupCosmeticsFilter() {
  document.getElementById('cosmetic-category-filter').addEventListener('change', (e) => {
    e.target.dataset.userChanged = 'true';
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

function getPassTierRank(tier) {
  const rank = { free: 0, donor_class: 1, pookie_pass: 2 };
  return rank[String(tier || 'free').toLowerCase()] ?? 0;
}

function getPassTierLabel(tier) {
  return MEMBERSHIP_TIER_LABELS[String(tier || 'free').toLowerCase()] || 'Free Tier';
}

function getCatalogItemById(itemId) {
  return storeItems.find(i => i.id === itemId) || shopCatalog.find(i => i.id === itemId) || null;
}

function renderRewardGuideMetric(label, value, subcopy, accent) {
  return '<div class="reward-guide-metric' + (accent ? ' ' + accent : '') + '">' +
    '<div class="reward-guide-metric-label">' + escapeHtml(label) + '</div>' +
    '<div class="reward-guide-metric-value">' + escapeHtml(value) + '</div>' +
    '<div class="reward-guide-metric-sub">' + escapeHtml(subcopy) + '</div>' +
  '</div>';
}

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
  var affordable = storeItems.filter(function(item) {
    return item && !item.giftSet && Number(item.cost || 0) > 0 && Number(item.cost || 0) <= xpBalance;
  }).length;
  var giftSetReady = Object.values(shopSets || {}).filter(function(set) {
    return set && set.giftSet && Number(set.totalCost || 0) > 0 && Number(set.totalCost || 0) <= giftBalance;
  }).length;
  var ultraItems = storeItems.filter(function(item) { return item && item.rarity === 'ultra'; }).length;
  var catFilter = document.getElementById('store-cat-filter');
  var catValue = catFilter ? catFilter.value : 'all';

  var title = 'Preview before you spend.';
  var copy = 'Cosmetics change how your profile, name, border, and win effects look. XP buys catalog items, and gift XP buys gift sets.';
  if (giftSetReady > 0) {
    title = giftSetReady + ' gift set' + (giftSetReady === 1 ? ' is' : 's are') + ' ready.';
    copy = 'Gift XP can only be used on gift sets. If you want the fastest visible upgrade, check the set section before spending regular XP.';
  } else if (affordable > 0) {
    title = affordable + ' store item' + (affordable === 1 ? '' : 's') + ' are affordable right now.';
    copy = 'Use price sorting to grab a quick upgrade, or preview rarer cosmetics first so you know what you want to save for.';
  }

  var primaryAction = '<button type="button" class="reward-guide-action primary" onclick="openStoreAffordableView()">Show Affordable Items</button>';
  var secondaryAction = '<button type="button" class="reward-guide-action" onclick="scrollToPortalSection(&quot;store-sets-section&quot;)">Jump To Gift Sets</button>';

  el.innerHTML =
    '<div class="reward-guide-head">' +
      '<div class="reward-guide-kicker">Store guide</div>' +
      '<div class="reward-guide-title">' + escapeHtml(title) + '</div>' +
      '<div class="reward-guide-copy">' + escapeHtml(copy) + '</div>' +
    '</div>' +
    '<div class="reward-guide-grid">' +
      renderRewardGuideMetric('XP', formatNumber(xpBalance), affordable + ' catalog item' + (affordable === 1 ? '' : 's') + ' affordable', 'mint') +
      renderRewardGuideMetric('Gift XP', formatNumber(giftBalance), giftSetReady + ' set' + (giftSetReady === 1 ? '' : 's') + ' within reach', 'gold') +
      renderRewardGuideMetric('Filtered view', formatNumber(filtered.length) + ' items', 'Current store filters', 'blue') +
      renderRewardGuideMetric('Ultra items', formatNumber(ultraItems), 'Endgame cosmetics with buffs', 'violet') +
    '</div>' +
    '<div class="reward-guide-actions">' +
      primaryAction +
      secondaryAction +
    '</div>';
}

function getPassPlanAction(cardId, membership) {
  const normalizedCurrentTier = String(membership && membership.tier || 'free').toLowerCase();
  const active = !!(membership && membership.active);
  const currentRank = getPassTierRank(normalizedCurrentTier);
  const cardRank = getPassTierRank(cardId);

  if (cardId === 'free') {
    if (!active || normalizedCurrentTier === 'free') {
      return { label: 'Current Plan', disabled: true };
    }
    return { label: 'Included', disabled: true };
  }

  if (active && cardId === normalizedCurrentTier) {
    return { label: 'Manage Subscription', action: 'manage' };
  }

  if (active && cardRank < currentRank) {
    return { label: 'Included', disabled: true };
  }

  return { label: active ? 'Switch Plan' : 'Upgrade', action: 'checkout', tier: cardId };
}

async function beginPassCheckout(tier) {
  try {
    const res = await fetch('/api/me/pass/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tier: tier })
    });
    const data = await res.json();
    if (!res.ok || !data.ok || !data.url) {
    showToast(data.message || data.error || 'Membership checkout is not configured yet', 'error');
      return;
    }
    window.location.href = data.url;
  } catch {
    showToast('Membership checkout failed', 'error');
  }
}

function beginDonationCheckout() {
  if (!DONATION_CHECKOUT_URL) {
    showToast('Donation checkout is not configured yet', 'error');
    return Promise.resolve();
  }
  window.location.href = DONATION_CHECKOUT_URL;
  return Promise.resolve();
}

async function managePassSubscription() {
  try {
    const res = await fetch('/api/me/pass/manage');
    const data = await res.json();
    if (!res.ok || !data.ok || !data.url) {
      showToast(data.message || data.error || 'Membership management is not configured yet', 'error');
      return;
    }
    window.location.href = data.url;
  } catch {
    showToast('Membership management is unavailable', 'error');
  }
}

function renderPassPlanCards(membership) {
  const grid = document.getElementById('pass-plan-grid');
  if (!grid) return;

  const currentTier = String(membership && membership.tier || 'free').toLowerCase();
  const active = !!(membership && membership.active);
  const cards = [
    {
      id: 'free',
      name: 'Free Tier',
      price: 'Free',
      accent: 'free',
      perks: ['All daily game modes', 'XP, streaks, and the cosmetics store', 'Daily Claim profile logos']
    },
    {
      id: 'donor_class',
      name: 'Donor Class',
      price: '$2/mo',
      accent: 'donor',
      perks: ['Every premium game mode unlocked', 'Custom TTS voice + batch guessing in streams', 'Exclusive donor profile logos']
    },
    {
      id: 'pookie_pass',
      name: 'Pookie Pass',
      price: '$10/mo',
      accent: 'pookie',
      perks: ['Everything in Donor Class', 'Legacy top tier — no longer sold', 'Thank you for the early support']
    }
  ];

  // Pookie Pass was retired 2026-07-12 (no longer sold; voice moved to TikTok
  // Super Fan + Donor Class). Keep its card ONLY for existing holders so they
  // can still Manage/cancel — hide the buy option from everyone else. All
  // existing Pookie content (reward lane, cosmetics) is untouched.
  const visibleCards = cards.filter(function(card) {
    return card.id !== 'pookie_pass' || currentTier === 'pookie_pass';
  });

  grid.innerHTML = visibleCards.map(function(card) {
    const isCurrent = card.id === currentTier;
    const unlocked = getPassTierRank(currentTier) >= getPassTierRank(card.id) && (card.id === 'free' || active);
    const action = getPassPlanAction(card.id, membership);
    return '<article class="pass-plan-card pass-plan-card-' + card.accent + (isCurrent ? ' current' : '') + '">' +
      '<div class="pass-plan-card-top">' +
        '<div>' +
          '<div class="pass-plan-name">' + escapeHtml(card.name) + '</div>' +
          '<div class="pass-plan-price">' + escapeHtml(card.price) + '</div>' +
        '</div>' +
        '<span class="pass-plan-state">' + escapeHtml(isCurrent ? 'Active' : unlocked ? 'Unlocked' : 'Locked') + '</span>' +
      '</div>' +
      '<ul class="pass-plan-perks">' + card.perks.map(function(perk) { return '<li>' + escapeHtml(perk) + '</li>'; }).join('') + '</ul>' +
      '<button class="pass-plan-cta' + (action.disabled ? ' is-disabled' : '') + '"' +
        (action.disabled ? ' disabled' : '') +
        (action.action ? ' data-pass-plan-action="' + escapeHtml(action.action) + '"' : '') +
        (action.tier ? ' data-pass-plan-tier="' + escapeHtml(action.tier) + '"' : '') +
      '>' + escapeHtml(action.label) + '</button>' +
    '</article>';
  }).join('');

  grid.querySelectorAll('.pass-plan-cta[data-pass-plan-action]').forEach(function(btn) {
    btn.addEventListener('click', async function() {
      if (btn.disabled) return;
      const action = btn.dataset.passPlanAction;
      const tier = btn.dataset.passPlanTier || '';
      const originalText = btn.textContent;
      btn.disabled = true;
      btn.textContent = action === 'manage' ? 'Opening...' : 'Redirecting...';
      try {
        if (action === 'manage') {
          await managePassSubscription();
        } else if (action === 'checkout' && tier) {
          await beginPassCheckout(tier);
        }
      } finally {
        btn.disabled = false;
        btn.textContent = originalText;
      }
    });
  });
}

// ─── Membership tab (former Season Pass tab; the pass was removed 2026-07-20,
// only the membership plan cards + Stripe manage/checkout flows remain) ───
function renderMembershipTab() {
  var pass = (profile && profile.profile && profile.profile.passStats) || {};
  var membership = {
    tier: String(pass.membershipTier || 'free').toLowerCase(),
    active: pass.membershipStatus === 'active' || pass.membershipStatus === 'trialing'
  };
  var pill = document.getElementById('pass-membership-pill');
  if (pill) pill.textContent = getPassTierLabel(membership.tier);
  var statusEl = document.getElementById('pass-membership-status');
  if (statusEl) statusEl.textContent = membership.active
    ? (getPassTierLabel(membership.tier) + ' is active on your account.')
    : 'Support Word Tycoon and unlock every premium game mode.';
  renderPassPlanCards(membership);
}

async function loadPass() {
  if (!profile) {
    try { await loadProfile(); } catch (_) {}
  }
  renderMembershipTab();
}

async function loadStore() {
  if (storeLoaded && storeItems.length > 0) {
    updateStoreCoinBalance();
    renderStoreGrid();
    renderStoreGuidance();
    return;
  }

  try {
    const [shopRes, setsRes, fanRes] = await Promise.all([
      fetch('/api/me/shop'),
      fetch('/api/me/sets'),
      fetch('/api/me/fanclub-status').catch(() => null)
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
    if (fanRes && fanRes.ok) {
      try { fanClubStatus = await fanRes.json(); } catch { fanClubStatus = null; }
    }
    storeLoaded = true;
  } catch {
    storeItems = shopCatalog.length ? [...shopCatalog] : [];
  }

  updateStoreCoinBalance();
  renderStoreGrid();
  renderStoreSets();
  renderStoreGuidance();
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
  avatarEl.src = resolveAvatar(plat.profilePic);
  avatarEl.style.display = 'block';
  avatarEl.onerror = function() { this.onerror = null; this.src = AVATAR_FALLBACK; };
  document.getElementById('store-preview-name').textContent = plat.displayName || plat.username || 'Player';
  applyStorePreviewFromEquipped();
}

function applyStorePreviewFromEquipped() {
  const avatarWrap = document.querySelector('.store-preview-avatar-wrap');
  const avatarEl = document.getElementById('store-preview-avatar');
  const nameEl = document.getElementById('store-preview-name');
  const wordEl = document.getElementById('store-preview-word');
  const titleEl = document.getElementById('store-preview-title');
  const badgeBg = document.getElementById('store-preview-badge-bg');

  if (!avatarWrap) return;

  avatarWrap.style.cssText = '';
  avatarEl.style.border = '3px solid var(--border)';
  avatarEl.style.animation = '';
  nameEl.style.cssText = '';
  wordEl.style.cssText = '';
  titleEl.innerHTML = '';
  titleEl.style.cssText = '';
  if (window.PortalCosmeticRenderer) {
    window.PortalCosmeticRenderer.clearLayers(avatarWrap);
    window.PortalCosmeticRenderer.clearLayers(badgeBg);
  }

  const ownedList = profile?.cosmetics || [];
  const equipped = ownedList.filter(c => c.equipped);
  if (equipped.length === 0) return;

  const cosmeticsByCategory = buildPortalCosmeticsByCategory(equipped.map((c) => {
    const shopItem = storeItems.find(s => s.id === c.cosmetic_id);
    return shopItem ? { ...c, render: shopItem.render, fallbackCss: shopItem.fallbackCss, renderType: shopItem.renderType } : c;
  }));

  applyStorePreviewCSS(cosmeticsByCategory);
}

function applyStorePreviewCSS(cosmeticsByCategory) {
  const avatarWrap = document.querySelector('.store-preview-avatar-wrap');
  const avatarEl = document.getElementById('store-preview-avatar');
  const nameEl = document.getElementById('store-preview-name');
  const wordEl = document.getElementById('store-preview-word');
  const titleEl = document.getElementById('store-preview-title');
  const storeBadgeBg = document.getElementById('store-preview-badge-bg');

  const border = cosmeticsByCategory.profile_border && cosmeticsByCategory.profile_border.css;
  if (border) {
    if (border.border) avatarEl.style.border = border.border;
    if (border.boxShadow) avatarWrap.style.boxShadow = border.boxShadow;
    if (border.animation) avatarWrap.style.animation = border.animation;
  }
  const glow = cosmeticsByCategory.profile_glow && cosmeticsByCategory.profile_glow.css;
  if (glow) {
    if (glow.boxShadow) {
      const existing = avatarWrap.style.boxShadow;
      avatarWrap.style.boxShadow = existing ? existing + ', ' + glow.boxShadow : glow.boxShadow;
    }
    if (glow.animation && !avatarWrap.style.animation) avatarWrap.style.animation = glow.animation;
  }
  const nameColor = cosmeticsByCategory.name_color && cosmeticsByCategory.name_color.css;
  if (nameColor) {
    if (nameColor.color) nameEl.style.color = nameColor.color;
    if (nameColor.animation) nameEl.style.animation = nameColor.animation;
  }
  const nameGlow = cosmeticsByCategory.name_glow && cosmeticsByCategory.name_glow.css;
  if (nameGlow) {
    if (nameGlow.textShadow) nameEl.style.textShadow = nameGlow.textShadow;
    if (nameGlow.animation && !nameEl.style.animation) nameEl.style.animation = nameGlow.animation;
  }
  const wordColor = cosmeticsByCategory.word_color && cosmeticsByCategory.word_color.css;
  if (wordColor) {
    if (wordColor.color) wordEl.style.color = wordColor.color;
    if (wordColor.textShadow) wordEl.style.textShadow = wordColor.textShadow;
    if (wordColor.animation) wordEl.style.animation = wordColor.animation;
  }
  const wordGlow = cosmeticsByCategory.word_glow && cosmeticsByCategory.word_glow.css;
  if (wordGlow) {
    if (wordGlow.textShadow && !wordEl.style.textShadow) wordEl.style.textShadow = wordGlow.textShadow;
    if (wordGlow.animation && !wordEl.style.animation) wordEl.style.animation = wordGlow.animation;
  }
  const titleCos = cosmeticsByCategory.title && cosmeticsByCategory.title.css;
  if (titleCos) {
    titleEl.textContent = titleCos.title || '';
    if (titleCos.titleColor) titleEl.style.color = titleCos.titleColor;
    if (titleCos.titleGlow) titleEl.style.textShadow = titleCos.titleGlow;
    if (titleCos.animation) titleEl.style.animation = titleCos.animation;
  }

  // Apply hero_badge background
  if (storeBadgeBg) {
    const badge = cosmeticsByCategory.hero_badge && cosmeticsByCategory.hero_badge.css;
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

  // Overlay the previewed item on top
  const css = item.css;
  if (!css) return;

  const avatarWrap = document.querySelector('.store-preview-avatar-wrap');
  const avatarEl = document.getElementById('store-preview-avatar');
  const nameEl = document.getElementById('store-preview-name');
  const wordEl = document.getElementById('store-preview-word');
  const titleEl = document.getElementById('store-preview-title');
  const storeBadgeBg = document.getElementById('store-preview-badge-bg');

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
    if (storeBadgeBg) {
      if (css.background) storeBadgeBg.style.background = css.background;
      if (css.backgroundSize) storeBadgeBg.style.backgroundSize = css.backgroundSize;
      if (css.animation) storeBadgeBg.style.animation = css.animation;
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
    renderStoreGuidance();
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
        previewHtml = `<div class="store-card-preview store-we-preview" data-we-id="${escapeHtml(item.id)}">` +
          `<div class="store-we-dots-row">${dots}</div>` +
          `<button class="store-we-preview-btn" onclick="event.stopPropagation(); playStoreWinEffectPreview('${escapeHtml(item.id)}', this)">&#9654; Preview</button>` +
        `</div>`;
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
    const fanClubBadge = item.fanClubOnly
      ? '<span class="store-fanclub-badge" title="Only visible in fan-club streams">♥ FC</span>'
      : '';

    return `
      <div class="store-card${owned ? ' owned' : ''}${isPreviewing ? ' previewing' : ''}${item.fanClubOnly ? ' fanclub-only-item' : ''}" data-id="${item.id}" style="--rarity-color: ${color}" onclick="storePreview('${item.id}')">
        <div class="store-card-rarity-strip" style="background: ${color}"></div>
        ${owned ? '<div class="store-owned-badge">OWNED</div>' : ''}
        ${auxBadge}
        ${fanClubBadge}
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
  renderStoreGuidance();
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

    // ── Fan-Club-only sets get a special card with image hero + TikTok CTA ──
    if (set.fanClubOnly) {
      const fc = fanClubStatus || {};
      const unlocked = !!(fc.granted || complete);
      const pillHtml = unlocked
        ? '<span class="fanclub-pill fanclub-pill--unlocked">Unlocked ✓</span>'
        : (fc.queued
            ? '<span class="fanclub-pill fanclub-pill--queued">Queued — link TikTok to claim</span>'
            : '<span class="fanclub-pill fanclub-pill--locked">Locked</span>');
      const ctaHtml = unlocked
        ? `<button class="store-buy-btn fanclub-cta-view" onclick="document.querySelector('[data-tab=\\'cosmetics\\']')?.click()">View in inventory</button>`
        : `<a class="store-buy-btn fanclub-cta-join" href="${escapeHtml(set.unlockUrl || 'https://www.tiktok.com/@jorrybeaufart')}" target="_blank" rel="noopener noreferrer">${escapeHtml(set.unlockLabel || 'Join Fan Club on TikTok')} ↗</a>`;

      return `
        <div class="store-set-card store-set-card--fanclub${unlocked ? ' fanclub-unlocked' : ''}" style="--set-color: #FE2C55">
          <div class="fanclub-hero">
            <img class="fanclub-hero-img" src="/cosmetics/fanclub-heart.png" alt="" />
            <div class="fanclub-hero-glow"></div>
          </div>
          <div class="store-set-header">
            <div>
              <span class="store-set-name">${escapeHtml(set.name)}</span>
              <span class="store-set-rarity" style="color:#FE2C55">${escapeHtml(set.rarity)}</span>
            </div>
            ${pillHtml}
          </div>
          <div class="store-set-bar"><div class="store-set-bar-fill" style="width:${pct}%;background:#FE2C55"></div></div>
          <div class="store-set-dots">${itemDots}</div>
          <div class="store-set-bonus">${escapeHtml(set.setBonusLabel || '')}</div>
          <div class="fanclub-cta-row">${ctaHtml}</div>
          <div class="fanclub-footnote">${unlocked
            ? 'Auto-equipped in empty slots. Visible only in streams where you\'re a fan-club member.'
            : "Join any TikTok streamer's fan club (e.g. @jorrybeaufart). The cosmetics show in chat + games for that streamer's stream only."}</div>
        </div>
      `;
    }

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
            return `<div class="store-set-cost-row"><span class="store-set-cost">${WT_SYMBOLS.store} ${formatNumber(set.totalCost || 0)} gift XP</span><button class="store-buy-btn store-buy-gift" onclick="portalBuySet('${key}')" ${canAfford ? '' : 'disabled'}>Buy Set</button></div>`;
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

// ─── Win-effect in-card preview ─────────────────────────────
// Click a Preview button on any win_effect store / owned card to render the
// actual particle effect inside that card. Reuses /win-effects.js
// (target-aware: appends a contained absolute-positioned canvas).
let _activeWePreviewContainer = null;
function playStoreWinEffectPreview(itemId, btnEl) {
  if (typeof window.playWinEffect !== 'function') return;
  const item = storeItems.find(i => i.id === itemId);
  if (!item || !item.css || !item.css.effect) return;
  const container = btnEl && btnEl.closest('.store-we-preview');
  if (!container) return;
  if (_activeWePreviewContainer && _activeWePreviewContainer !== container) {
    _activeWePreviewContainer.classList.remove('playing');
  }
  _activeWePreviewContainer = container;
  container.classList.add('playing');
  const cfg = Object.assign({}, item.css, { target: container });
  cfg.duration = Math.min(cfg.duration || 3000, 1800);
  try { window.playWinEffect(cfg); } catch (_) {}
  setTimeout(() => {
    if (_activeWePreviewContainer === container) {
      container.classList.remove('playing');
      _activeWePreviewContainer = null;
    }
  }, cfg.duration + 200);
}
window.playStoreWinEffectPreview = playStoreWinEffectPreview;

function playOwnedWinEffectPreview(cosmeticId, btnEl) {
  if (typeof window.playWinEffect !== 'function') return;
  const container = btnEl && btnEl.closest('.store-we-preview');
  if (!container) return;
  let css = null;
  const owned = (profile && profile.cosmetics) ? profile.cosmetics.find(c => c.cosmetic_id === cosmeticId) : null;
  if (owned) css = getOwnedCosmeticCss(owned);
  if (!css && Array.isArray(shopCatalog)) {
    const s = shopCatalog.find(s => s.id === cosmeticId);
    if (s && s.css) css = s.css;
  }
  if (!css || !css.effect) return;
  if (_activeWePreviewContainer && _activeWePreviewContainer !== container) {
    _activeWePreviewContainer.classList.remove('playing');
  }
  _activeWePreviewContainer = container;
  container.classList.add('playing');
  const cfg = Object.assign({}, css, { target: container });
  cfg.duration = Math.min(cfg.duration || 3000, 1800);
  try { window.playWinEffect(cfg); } catch (_) {}
  setTimeout(() => {
    if (_activeWePreviewContainer === container) {
      container.classList.remove('playing');
      _activeWePreviewContainer = null;
    }
  }, cfg.duration + 200);
}
window.playOwnedWinEffectPreview = playOwnedWinEffectPreview;

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
function markCosmeticsSeen(cosmeticIds) {
  if (!Array.isArray(cosmeticIds) || cosmeticIds.length === 0) return;
  const seen = getSeenCosmetics();
  cosmeticIds.forEach(id => { if (id) seen.add(id); });
  saveSeenCosmetics(seen);
}
function markAllCosmeticsSeen() {
  if (!profile?.cosmetics) return;
  markCosmeticsSeen(profile.cosmetics.map(c => c.cosmetic_id));
}

function getOwnedCosmeticCss(cosmetic) {
  let css = null;
  if (Array.isArray(shopCatalog)) {
    const shopItem = shopCatalog.find(s => s.id === cosmetic.cosmetic_id);
    if (shopItem && shopItem.css) css = shopItem.css;
  }
  if (!css && cosmetic.css_property) {
    try { css = JSON.parse(cosmetic.css_property); } catch (e) {}
  }
  return css;
}

function buildCosmeticPreviewHtml(cosmetic, extraClass) {
  const previewClasses = ['cosmetic-preview'];
  if (extraClass) previewClasses.push(extraClass);
  const previewClassAttr = previewClasses.join(' ');
  const css = getOwnedCosmeticCss(cosmetic);

  if (css) {
    if (cosmetic.category === 'profile_border' || cosmetic.category === 'profile_glow') {
      const style = Object.entries(css)
        .filter(([k]) => k !== 'animation')
        .map(([k, v]) => `${camelToKebab(k)}: ${sanitizeCssValue(v)}`)
        .join('; ');
      return `<div class="${previewClassAttr}"><div class="cosmetic-preview-circle" style="width:24px;height:24px;border-radius:50%;background:var(--surface2);${style};${css.animation ? 'animation:' + sanitizeCssValue(css.animation) : ''}"></div></div>`;
    }
    if (cosmetic.category === 'title') {
      return `<div class="${previewClassAttr}" style="color:${sanitizeCssValue(css.titleColor) || '#fff'};${css.titleGlow ? 'text-shadow:' + sanitizeCssValue(css.titleGlow) : ''};${css.animation ? 'animation:' + sanitizeCssValue(css.animation) : ''}">${escapeHtml(css.title || cosmetic.name || 'Title')}</div>`;
    }
    if (cosmetic.category === 'win_effect') {
      const safeId = escapeHtml(cosmetic.cosmetic_id || '');
      const dots = (css.colors || []).slice(0, 5).map(c => `<span class="store-we-dot" style="background:${sanitizeCssValue(c)}"></span>`).join('');
      return `<div class="${previewClassAttr} cosmetic-we-preview store-we-preview" data-we-id="${safeId}">` +
        `<div class="store-we-dots-row">${dots}</div>` +
        `<button class="store-we-preview-btn" onclick="event.stopPropagation(); playOwnedWinEffectPreview('${safeId}', this)">&#9654; Preview</button>` +
      `</div>`;
    }
    if (cosmetic.category === 'hero_badge') {
      const bgStyle = css.background ? `background:${sanitizeCssValue(css.background)};` : '';
      const bgSize = css.backgroundSize ? `background-size:${sanitizeCssValue(css.backgroundSize)};` : '';
      const animStyle = css.animation ? `animation:${sanitizeCssValue(css.animation)};` : '';
      return `<div class="${previewClassAttr}"><div class="cosmetic-preview-badge" style="width:32px;height:18px;border-radius:3px;${bgStyle}${bgSize}${animStyle}"></div></div>`;
    }
    const style = Object.entries(css)
      .filter(([k]) => k !== 'animation')
      .map(([k, v]) => `${camelToKebab(k)}: ${sanitizeCssValue(v)}`)
      .join('; ');
    return `<div class="${previewClassAttr}" style="${style};${css.animation ? 'animation:' + sanitizeCssValue(css.animation) : ''}">Aa</div>`;
  }

  if (cosmetic.category === 'title') {
    return `<div class="${previewClassAttr} cosmetic-preview-fallback">${escapeHtml(cosmetic.name || 'Title')}</div>`;
  }
  if (cosmetic.category === 'hero_badge') {
    return `<div class="${previewClassAttr}"><div class="cosmetic-preview-badge cosmetic-preview-badge-fallback"></div></div>`;
  }
  if (cosmetic.category === 'win_effect') {
    return `<div class="${previewClassAttr} cosmetic-preview-fallback" style="font-size:20px">&#10024;</div>`;
  }
  if (cosmetic.category === 'profile_border' || cosmetic.category === 'profile_glow') {
    return `<div class="${previewClassAttr}"><div class="cosmetic-preview-circle cosmetic-preview-circle-fallback"></div></div>`;
  }
  return `<div class="${previewClassAttr} cosmetic-preview-fallback">Aa</div>`;
}

function getUnseenCosmetics(ownedList) {
  const seen = getSeenCosmetics();
  return (ownedList || []).filter(c => c?.cosmetic_id && !seen.has(c.cosmetic_id));
}

function getQueuedNewCosmetics() {
  if (!Array.isArray(newCosmeticsModalIds) || newCosmeticsModalIds.length === 0) return [];
  const idSet = new Set(newCosmeticsModalIds);
  return (profile?.cosmetics || [])
    .filter(c => idSet.has(c.cosmetic_id))
    .sort((a, b) => newCosmeticsModalIds.indexOf(a.cosmetic_id) - newCosmeticsModalIds.indexOf(b.cosmetic_id));
}

function maybeShowNewCosmeticsModal() {
  if (!isProfileTabActive() || !profile?.cosmetics?.length || newCosmeticsModalOpen) return;
  const unseen = getUnseenCosmetics(profile.cosmetics);
  if (!unseen.length) return;
  newCosmeticsModalIds = unseen.map(c => c.cosmetic_id);
  newCosmeticsModalOpen = true;
  renderNewCosmeticsModal();
  const modal = document.getElementById('new-cosmetics-modal');
  if (modal) {
    modal.style.display = 'flex';
    modal.setAttribute('aria-hidden', 'false');
  }
  document.getElementById('new-cosmetics-ok')?.focus();
}

function renderNewCosmeticsModal() {
  const modal = document.getElementById('new-cosmetics-modal');
  const titleEl = document.getElementById('new-cosmetics-title');
  const subtitleEl = document.getElementById('new-cosmetics-subtitle');
  const grid = document.getElementById('new-cosmetics-grid');
  if (!modal || !titleEl || !subtitleEl || !grid) return;

  const items = getQueuedNewCosmetics();
  if (!items.length) {
    closeNewCosmeticsModal({ markSeen: false });
    return;
  }

  titleEl.textContent = items.length === 1 ? 'New Cosmetic Unlocked' : 'New Cosmetics Unlocked';
  subtitleEl.textContent = items.length === 1
    ? 'You earned a new cosmetic. Equip it now or keep it for later.'
    : `You earned ${items.length} new cosmetics. Equip any of them now or review them later in your profile.`;

  grid.innerHTML = items.map(cosmetic => {
    const catLabel = CATEGORY_LABELS[cosmetic.category] || cosmetic.category;
    const rarityColor = RARITY_COLORS[cosmetic.rarity] || '#888';
    const previewHtml = buildCosmeticPreviewHtml(cosmetic, 'cosmetic-award-preview');
    const rewardTag = cosmetic.cosmetic_id && cosmetic.cosmetic_id.startsWith('gen_')
      ? '<span class="cosmetic-award-chip cosmetic-award-chip-reward">Reward</span>'
      : '';
    const buffHtml = cosmetic.buff
      ? `<div class="cosmetic-award-buff">${escapeHtml(cosmetic.buff.label || cosmetic.buff.type)}</div>`
      : '';
    const equipLabel = cosmetic.equipped ? 'Equipped' : 'Equip';
    return `
      <article class="cosmetic-award-card${cosmetic.equipped ? ' is-equipped' : ''}" data-cosmetic-award-id="${cosmetic.cosmetic_id}">
        <div class="cosmetic-award-top">
          <div class="cosmetic-award-labels">
            <span class="cosmetic-award-chip" style="background:${rarityColor}20; color:${rarityColor}; border-color:${rarityColor}33">${escapeHtml(cosmetic.rarity || 'common')}</span>
            <span class="cosmetic-award-chip cosmetic-award-chip-category">${escapeHtml(catLabel)}</span>
            ${rewardTag}
          </div>
        </div>
        ${previewHtml}
        <div class="cosmetic-award-name">${escapeHtml(cosmetic.name || 'Unnamed Cosmetic')}</div>
        ${buffHtml}
        <button class="cosmetic-award-equip${cosmetic.equipped ? ' is-equipped' : ''}" data-new-cosmetic-equip="${cosmetic.cosmetic_id}" ${cosmetic.equipped ? 'disabled' : ''}>
          ${equipLabel}
        </button>
      </article>
    `;
  }).join('');
}

function closeNewCosmeticsModal(options) {
  const markSeen = options?.markSeen !== false;
  if (markSeen && newCosmeticsModalIds.length) markCosmeticsSeen(newCosmeticsModalIds);
  newCosmeticsModalIds = [];
  newCosmeticsModalOpen = false;
  const modal = document.getElementById('new-cosmetics-modal');
  if (modal) {
    modal.style.display = 'none';
    modal.setAttribute('aria-hidden', 'true');
  }
  if (profile?.cosmetics) {
    const filterCat = document.getElementById('cosmetic-category-filter')?.value || 'equipped';
    renderCosmetics(profile.cosmetics, filterCat);
  }
}

async function equipCosmeticFromModal(cosmeticId) {
  const cosmetic = (profile?.cosmetics || []).find(c => c.cosmetic_id === cosmeticId);
  if (!cosmetic) {
    showToast('Cosmetic not found');
    return;
  }
  if (cosmetic.equipped) return;

  const button = Array.from(document.querySelectorAll('[data-new-cosmetic-equip]'))
    .find(el => el.dataset.newCosmeticEquip === cosmeticId);
  if (button) button.disabled = true;

  const didToggle = await toggleCosmetic(cosmetic.cosmetic_id, cosmetic.category, false, cosmetic.name || '');
  if (didToggle) renderNewCosmeticsModal();
  else if (button) button.disabled = false;
}

function setupNewCosmeticsModal() {
  const modal = document.getElementById('new-cosmetics-modal');
  const closeBtn = document.getElementById('new-cosmetics-close');
  const okBtn = document.getElementById('new-cosmetics-ok');
  const grid = document.getElementById('new-cosmetics-grid');
  if (!modal || !closeBtn || !okBtn || !grid) return;

  const dismiss = () => closeNewCosmeticsModal({ markSeen: true });
  closeBtn.addEventListener('click', dismiss);
  okBtn.addEventListener('click', dismiss);
  modal.addEventListener('click', (event) => {
    if (event.target === modal) dismiss();
  });
  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-new-cosmetic-equip]');
    if (!button) return;
    equipCosmeticFromModal(button.dataset.newCosmeticEquip);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && newCosmeticsModalOpen) dismiss();
  });
}

function renderCosmetics(ownedList, filterCat) {
  const grid = document.getElementById('cosmetics-grid');
  let items = ownedList || [];
  const seen = getSeenCosmetics();

  if (filterCat === 'equipped') {
    items = items.filter(c => c.equipped);
  } else if (filterCat !== 'all') {
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
    let emptySuffix = '';
    if (filterCat === 'equipped') emptySuffix = ' equipped';
    else if (filterCat !== 'all') emptySuffix = ' in this category';
    grid.innerHTML = '<div class="loading-placeholder">No cosmetics owned' + emptySuffix + '</div>';
    return;
  }

  grid.innerHTML = items.map(c => {
    const color = RARITY_COLORS[c.rarity] || '#888';
    const catLabel = CATEGORY_LABELS[c.category] || c.category;
    const previewHtml = buildCosmeticPreviewHtml(c);

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
        <div class="cosmetic-rarity" style="background:${color}20; color:${color}">${escapeHtml(c.rarity)}</div>
        ${isNew ? '<div class="cosmetic-new-tag">New</div>' : ''}
        ${c.cosmetic_id && c.cosmetic_id.startsWith('gen_') ? '<div class="cosmetic-reward-tag">Reward</div>' : ''}
        ${c.buff ? `<div class="cosmetic-buff">${escapeHtml(c.buff.label || c.buff.type)}</div>` : ''}
      </div>
    `;
  }).join('');
}

async function toggleCosmetic(cosmeticId, category, isEquipped, itemName) {
  // Find the button and disable it during the request
  const card = document.querySelector(`[data-cosmetic-id="${cosmeticId}"]`);
  const btn = card?.querySelector('.cosmetic-toggle');
  if (btn) btn.disabled = true;
  let success = false;

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
      // Re-render cosmetic picker if open
      var pickerModal = document.getElementById('cosmetic-picker-modal');
      if (pickerModal && pickerModal.style.display !== 'none' && pickerModal.dataset.pickerCategories) {
        try { renderCosmeticPickerGrid(JSON.parse(pickerModal.dataset.pickerCategories)); } catch (e) {}
      }
      success = true;
    } else {
      showToast(data.message || 'Failed');
    }
  } catch (e) {
    console.error('Toggle cosmetic failed:', e);
    showToast('Connection error');
  } finally {
    if (btn) btn.disabled = false;
  }

  return success;
}

// showToast is defined at the top of this file (line ~78) with type/duration support

function applyPreviewCosmetics() {
  const avatarEl = document.getElementById('preview-avatar');
  if (!avatarEl) return; // guard against missing DOM
  const avatarWrap = avatarEl.parentElement;
  const nameEl = document.getElementById('preview-name');
  const wordEl = document.getElementById('preview-word');
  const titleContainer = document.getElementById('preview-title-container');
  const badgeBg = document.getElementById('preview-badge-bg');
  if (!avatarWrap || !nameEl || !wordEl || !titleContainer) return;
  const logoAvatar = avatarEl.classList.contains('avatar-is-logo');

  // Reset all inline styles
  avatarWrap.style.cssText = '';
  avatarEl.style.border = logoAvatar ? 'none' : '3px solid var(--border)';
  avatarEl.style.animation = '';
  nameEl.style.cssText = '';
  wordEl.style.cssText = '';
  titleContainer.innerHTML = '';
  titleContainer.style.cssText = '';
  if (badgeBg) {
    badgeBg.style.background = '';
    badgeBg.style.backgroundSize = '';
    badgeBg.style.animation = '';
  }
  if (window.PortalCosmeticRenderer) {
    window.PortalCosmeticRenderer.clearLayers(avatarWrap);
    window.PortalCosmeticRenderer.clearLayers(badgeBg);
  }

  const ownedList = profile?.cosmetics || [];
  const equipped = ownedList.filter(c => c.equipped);

  if (equipped.length === 0) return;

  const cosmeticsByCategory = buildPortalCosmeticsByCategory(equipped);

  // Apply profile_border
  const border = cosmeticsByCategory.profile_border && cosmeticsByCategory.profile_border.css;
  if (border && !logoAvatar) {
    if (border.border) avatarEl.style.border = border.border;
    if (border.boxShadow) avatarWrap.style.boxShadow = border.boxShadow;
    if (border.animation) avatarWrap.style.animation = border.animation;
  }

  // Apply profile_glow (combine boxShadow with border's)
  const glow = cosmeticsByCategory.profile_glow && cosmeticsByCategory.profile_glow.css;
  if (glow && !logoAvatar) {
    if (glow.boxShadow) {
      const existing = avatarWrap.style.boxShadow;
      avatarWrap.style.boxShadow = existing ? existing + ', ' + glow.boxShadow : glow.boxShadow;
    }
    if (glow.animation && !avatarWrap.style.animation) {
      avatarWrap.style.animation = glow.animation;
    }
  }

  // Apply name_color
  const nameColor = cosmeticsByCategory.name_color && cosmeticsByCategory.name_color.css;
  if (nameColor) {
    if (nameColor.color) nameEl.style.color = nameColor.color;
    if (nameColor.animation) nameEl.style.animation = nameColor.animation;
  }

  // Apply name_glow
  const nameGlow = cosmeticsByCategory.name_glow && cosmeticsByCategory.name_glow.css;
  if (nameGlow) {
    if (nameGlow.textShadow) nameEl.style.textShadow = nameGlow.textShadow;
    if (nameGlow.animation && !nameEl.style.animation) nameEl.style.animation = nameGlow.animation;
  }

  // Apply word_color
  const wordColor = cosmeticsByCategory.word_color && cosmeticsByCategory.word_color.css;
  if (wordColor) {
    if (wordColor.color) wordEl.style.color = wordColor.color;
    if (wordColor.textShadow) wordEl.style.textShadow = wordColor.textShadow;
    if (wordColor.animation) wordEl.style.animation = wordColor.animation;
  }

  // Apply word_glow (word_color takes precedence for textShadow)
  const wordGlow = cosmeticsByCategory.word_glow && cosmeticsByCategory.word_glow.css;
  if (wordGlow) {
    if (wordGlow.textShadow && !wordEl.style.textShadow) {
      wordEl.style.textShadow = wordGlow.textShadow;
    }
    if (wordGlow.animation && !wordEl.style.animation) {
      wordEl.style.animation = wordGlow.animation;
    }
  }

  // Apply title
  const titleCos = cosmeticsByCategory.title && cosmeticsByCategory.title.css;
  if (titleCos) {
    titleContainer.textContent = titleCos.title || '';
    if (titleCos.titleColor) titleContainer.style.color = titleCos.titleColor;
    if (titleCos.titleGlow) titleContainer.style.textShadow = titleCos.titleGlow;
    if (titleCos.animation) titleContainer.style.animation = titleCos.animation;
  }

  // Apply hero_badge background
  if (badgeBg) {
    const badge = cosmeticsByCategory.hero_badge && cosmeticsByCategory.hero_badge.css;
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

  if (window.PortalCosmeticRenderer) {
    const logoEffectSpec = logoAvatar ? {
      border: border && border.border ? border.border : '',
      boxShadow: [
        border && border.boxShadow ? border.boxShadow : '',
        glow && glow.boxShadow ? glow.boxShadow : ''
      ].filter(Boolean).join(', '),
      animation: (border && border.animation) || (glow && glow.animation) || ''
    } : null;
    window.PortalCosmeticRenderer.applyHeroLayers({
      avatarWrap: avatarWrap,
      avatarEl: avatarEl,
      heroBg: badgeBg,
      borderSpec: cosmeticsByCategory.profile_border || null,
      badgeSpec: cosmeticsByCategory.hero_badge || null,
      effectSpec: logoEffectSpec
    });
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

function formatGiftCoinDelta(delta) {
  const amount = Number(delta) || 0;
  if (!amount) return '0 GC';
  return `${amount > 0 ? '+' : ''}${formatNumber(amount)} GC`;
}

function renderHistorySummary(summary) {
  const earnedEl = document.getElementById('history-earned-today');
  const spentEl = document.getElementById('history-spent-today');
  const bizEl = document.getElementById('history-last-business');
  const bizSubEl = document.getElementById('history-last-business-sub');
  const grantEl = document.getElementById('history-last-grant');
  const grantSubEl = document.getElementById('history-last-grant-sub');
  if (!earnedEl || !spentEl || !bizEl || !bizSubEl || !grantEl || !grantSubEl) return;

  earnedEl.textContent = `+${formatNumber(summary?.earnedToday || 0)}`;
  spentEl.textContent = formatNumber(summary?.spentToday || 0);

  if (summary?.lastBusinessCollect) {
    bizEl.textContent = summary.lastBusinessCollect.title || 'Business';
    bizSubEl.textContent = summary.lastBusinessCollect.created_at
      ? formatTime(summary.lastBusinessCollect.created_at)
      : 'Tracked recently';
  } else {
    bizEl.textContent = '—';
    bizSubEl.textContent = 'No business collects yet';
  }

  if (summary?.lastMonthlyGrant) {
    const amount = Number(summary.lastMonthlyGrant.giftCoinsDelta) || 0;
    grantEl.textContent = amount > 0 ? `+${formatNumber(amount)} GC` : '—';
    grantSubEl.textContent = summary.lastMonthlyGrant.created_at
      ? formatTime(summary.lastMonthlyGrant.created_at)
      : (summary.lastMonthlyGrant.subtitle || 'Membership grant');
  } else {
    grantEl.textContent = '—';
    grantSubEl.textContent = 'No membership grants yet';
  }
}

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
  if (type) url += `&type=${encodeURIComponent(type)}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    renderHistorySummary(data.summary || null);

    if (!data.ok || !data.entries || data.entries.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No economy activity yet</div>';
      document.getElementById('history-prev').disabled = true;
      document.getElementById('history-next').disabled = true;
      document.getElementById('history-page-info').textContent = 'Page 1';
      return;
    }

    document.getElementById('history-page-info').textContent = `Page ${data.page || historyPage}`;
    document.getElementById('history-prev').disabled = historyPage <= 1;
    document.getElementById('history-next').disabled = (data.page || historyPage) >= (data.totalPages || 1);

    list.innerHTML = data.entries.map(e => {
      const coinsDelta = Number(e.coinsDelta) || 0;
      const giftCoinsDelta = Number(e.giftCoinsDelta) || 0;
      const hasCoinDelta = coinsDelta !== 0;
      const hasGiftDelta = giftCoinsDelta !== 0;
      const amountClass = hasCoinDelta
        ? (coinsDelta > 0 ? 'positive' : 'negative')
        : hasGiftDelta
          ? (giftCoinsDelta > 0 ? 'positive' : 'negative')
          : 'neutral';
      const badgeClass = (e.category || 'history').toLowerCase();

      return `
        <div class="history-entry">
          <span class="history-type ${badgeClass}">${escapeHtml(e.badge || 'History')}</span>
          <div class="history-detail">
            <div class="history-command">${escapeHtml(e.title || 'Activity')}</div>
            ${e.subtitle ? `<div class="history-response">${escapeHtml(e.subtitle)}</div>` : ''}
          </div>
          <div class="history-delta-stack">
            ${hasCoinDelta ? `<span class="history-delta ${coinsDelta > 0 ? 'positive' : 'negative'}">${coinsDelta > 0 ? '+' : ''}${formatNumber(coinsDelta)}</span>` : ''}
            ${hasGiftDelta ? `<span class="history-delta-note ${amountClass}">${escapeHtml(formatGiftCoinDelta(giftCoinsDelta))}</span>` : (!hasCoinDelta ? '<span class="history-delta neutral">—</span>' : '')}
          </div>
          <span class="history-time">${e.created_at ? formatTime(e.created_at) : '—'}</span>
        </div>
      `;
    }).join('');
  } catch {
    renderHistorySummary(null);
    list.innerHTML = '<div class="loading-placeholder">Failed to load economy history</div>';
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

// ─── RecTangled Stats ──────────────────────────────────────────────
async function loadRectangledStats() {
  try {
    const res = await fetch('/api/me/rectangled');
    const data = await res.json();

    document.getElementById('rectangled-words').textContent = data.totalWordsFound || 0;
    document.getElementById('rectangled-games').textContent = data.gamesParticipated || 0;

    const list = document.getElementById('rectangled-history');
    if (!data.history || data.history.length === 0) {
      list.innerHTML = '<div class="loading-placeholder">No recTangled games yet</div>';
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
    document.getElementById('rectangled-words').textContent = '?';
    document.getElementById('rectangled-games').textContent = '?';
  }
}

function loadRectangledSPStats() {
  try {
    const raw = localStorage.getItem('rectangled_sp_stats');
    if (!raw) {
      document.getElementById('rectangled-sp-games').textContent = '0';
      document.getElementById('rectangled-sp-completed').textContent = '0';
      document.getElementById('rectangled-sp-words').textContent = '0';
      document.getElementById('rectangled-sp-best').textContent = '-';
      document.getElementById('rectangled-sp-history').innerHTML = '<div class="loading-placeholder">No SP games played yet</div>';
      return;
    }

    const stats = JSON.parse(raw);
    document.getElementById('rectangled-sp-games').textContent = stats.gamesPlayed || 0;
    document.getElementById('rectangled-sp-completed').textContent = stats.gamesCompleted || 0;
    document.getElementById('rectangled-sp-words').textContent = stats.totalWordsFound || 0;
    document.getElementById('rectangled-sp-best').textContent = (stats.bestCompletion || 0) + '%';

    const list = document.getElementById('rectangled-sp-history');
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
    document.getElementById('rectangled-sp-games').textContent = '?';
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
      // Use the resolved preferred profile pic (respects avatar picker choice),
      // with Discord session avatar as fallback
      profilePic: (profile && profile.profile && profile.profile.profilePic) || portalUser.avatar || null
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

  const div = document.createElement('div');
  div.className = 'chat-msg';

  // Build avatar safely (no inline onerror)
  if (pfp) {
    const img = document.createElement('img');
    img.className = 'chat-avatar';
    img.src = pfp;
    img.alt = '';
    img.loading = 'lazy';
    img.onerror = function() {
      const fallback = document.createElement('span');
      fallback.className = 'chat-avatar-fallback ' + platClass;
      fallback.textContent = initial;
      this.replaceWith(fallback);
    };
    div.appendChild(img);
  } else {
    const fallback = document.createElement('span');
    fallback.className = 'chat-avatar-fallback ' + platClass;
    fallback.textContent = initial;
    div.appendChild(fallback);
  }

  const nameSpan = document.createElement('span');
  nameSpan.className = 'chat-username ' + platClass;
  nameSpan.textContent = username + ':';
  div.appendChild(nameSpan);

  const textSpan = document.createElement('span');
  textSpan.className = 'chat-text';
  textSpan.textContent = msg.message || '';
  div.appendChild(textSpan);
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

// Streamers currently live + their game/handle. Polled alongside live games
// so the game cards can render a "(N) Streamers" pill listing who's
// streaming each game right now (with click-through to <game>/<handle>).
var cachedLiveStreamers = [];

async function loadLiveGames() {
  try {
    var res = await fetch('/api/games/live');
    var data = await res.json();
    cachedLiveGames = data.games || [];
    refreshWordGamesLiveSurface();
  } catch (e) {
    // silently fail
  }
}

async function loadLiveStreamers() {
  try {
    var res = await fetch('/api/streamers/live');
    var data = await res.json();
    cachedLiveStreamers = data.streamers || [];
    refreshWordGamesLiveSurface();
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
  loadLiveStreamers();
  if (liveGamesInterval) clearInterval(liveGamesInterval);
  liveGamesInterval = setInterval(function () {
    loadLiveGames();
    loadLiveStreamers();
  }, 5000);
}

function stopLivePolling() {
  if (liveGamesInterval) {
    clearInterval(liveGamesInterval);
    liveGamesInterval = null;
  }
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

function sanitizeCssValue(val) {
  if (!val || typeof val !== 'string') return '';
  return val.replace(/[;"'<>\\]/g, '');
}

function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

function camelToKebab(str) {
  return str.replace(/([A-Z])/g, '-$1').toLowerCase();
}

function getPrestigePromptKey(type, prestigeLevel) {
  return 'prestige_prompt_seen:' + type + ':p' + String(prestigeLevel || 0);
}

function hasSeenPrestigePrompt(type, prestigeLevel) {
  try {
    return localStorage.getItem(getPrestigePromptKey(type, prestigeLevel)) === '1';
  } catch (_) {
    return false;
  }
}

function markPrestigePromptSeen(type, prestigeLevel) {
  try {
    localStorage.setItem(getPrestigePromptKey(type, prestigeLevel), '1');
  } catch (_) {}
}

function maybePromptPrestige(type, level, prestigeLevel, message, onAccept) {
  if (!Number.isFinite(level) || level < 100 || typeof onAccept !== 'function') return;
  if (hasSeenPrestigePrompt(type, prestigeLevel)) return;
  markPrestigePromptSeen(type, prestigeLevel);
  setTimeout(function() {
    if (confirm(message)) onAccept();
  }, 0);
}

// ==================== PIZZA SHOP ====================

let pizzaData = null;
function openArcade() {
  window.open('/arcade/', '_blank');
}

// ==================== CAR WASH SHOP ====================
var carwashData = null;
var carwashSubTab = 'upgrades';
var carwashCollectTimer = null;
var carwashLoaded = false;

function openCarwashShop() {
  switchToTab('businesses');
  if (window.Empire) window.Empire.open('carwash');
}

async function loadCarwashShop() {
  try {
    const results = await Promise.all([
      fetch('/api/me/carwash'),
      fetch('/api/me/carwash/tax-season').catch(function() { return null; })
    ]);
    const data = await results[0].json();
    var taxSeason = null;
    if (results[1]) {
      try { taxSeason = await results[1].json(); } catch (_) {}
    }
    carwashData = data;
    carwashData.taxSeason = taxSeason;
    carwashData._fetchTime = Date.now();
    carwashLoaded = true;
    renderCarwashShop();
    if (carwashData.shop) {
      var cwPrestigePrompt = carwashData.shop.prestigeLevel >= 1
        ? 'Your Car Wash reached Level 100. Prestige now to move to the next tier?'
        : 'Your Car Wash reached Level 100. Prestige now to reach Prestige 1 and unlock Tax Season eligibility?';
      maybePromptPrestige('carwash', carwashData.shop.shopLevel, carwashData.shop.prestigeLevel, cwPrestigePrompt, function() {
        carwashPrestige(true);
      });
    }
  } catch {
    document.getElementById('carwash-container').innerHTML = '<div style="padding:20px;color:var(--error)">Failed to load car wash data.</div>';
  }
}

// ==================== STOCK MOGUL ====================
var stockMogulData = null;
var smSubTab = 'upgrades';
var smCollectTimer = null;
var smLoaded = false;

function openStockMogul() {
  switchToTab('businesses');
  if (window.Empire) window.Empire.open('stockmogul');
}

async function loadStockMogul() {
  try {
    const r = await fetch('/api/me/stockmogul');
    const data = await r.json();
    stockMogulData = data;
    stockMogulData._fetchTime = Date.now();
    smLoaded = true;
    renderStockMogul();
    if (stockMogulData.portfolio) {
      maybePromptPrestige('stockmogul', stockMogulData.portfolio.portfolioLevel, stockMogulData.portfolio.prestigeLevel, 'Your Stock Mogul portfolio reached Level 100. Prestige now to move to the next tier?', function() {
        smPrestige(true);
      });
    }
  } catch {
    document.getElementById('stockmogul-container').innerHTML = '<div style="padding:20px;color:var(--error)">Failed to load portfolio data.</div>';
  }
}

function renderSmNoPortfolio() {
  var c = document.getElementById('stockmogul-container');
  if (!c) return;
  c.innerHTML =
    '<div class="sm-no-portfolio">' +
    '<div class="sm-no-portfolio-emoji">&#x1F4C8;</div>' +
    '<div class="sm-no-portfolio-title">Stock Mogul Not Unlocked</div>' +
    '<div class="sm-no-portfolio-desc">Unlock Stock Mogul by spending clean cash from your Car Wash management page.</div>' +
    '</div>';
}

function renderStockMogul() {
  var c = document.getElementById('stockmogul-container');
  if (!c || !stockMogulData) return;

  if (!stockMogulData.ok || !stockMogulData.hasPortfolio) {
    if (stockMogulData.ok && !stockMogulData.hasPortfolio && !stockMogulData._initAttempted) {
      stockMogulData._initAttempted = true;
      c.innerHTML = '<div class="sm-no-portfolio"><div class="sm-no-portfolio-emoji">&#x1F4C8;</div><div class="sm-no-portfolio-title">Setting up your portfolio...</div></div>';
      fetch('/api/me/stockmogul/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(function(r) { return r.json(); })
        .then(function(d) { if (d.ok) { loadStockMogul(); } else { renderSmNoPortfolio(); } })
        .catch(function() { renderSmNoPortfolio(); });
      return;
    }
    renderSmNoPortfolio();
    return;
  }

  var p = stockMogulData.portfolio;
  var office = (stockMogulData.customizations && stockMogulData.customizations.office) || 'home';
  var prestige = p.prestigeLevel || 0;
  var xpPct = p.xpNeeded > 0 ? Math.min(100, Math.floor((p.portfolioXp / p.xpNeeded) * 100)) : 0;
  var capPct = p.portfolioCoinsCap > 0 ? Math.min(100, Math.floor((p.portfolioCoins / p.portfolioCoinsCap) * 100)) : 0;
  var pendingCoins = (stockMogulData.pending && stockMogulData.pending.portfolioCoins) || 0;

  c.setAttribute('data-office', office);
  c.setAttribute('data-prestige', String(prestige));

  var html = '';

  // Hero
  html += '<div class="sm-hero"><div class="sm-hero-bg"></div><div class="sm-hero-content">';
  html += '<h2 class="sm-hero-title">&#x1F4C8; ' + escapeHtml(p.portfolioName) + '</h2>';
  html += '<p class="sm-hero-sub">';
  if (prestige > 0) html += '&#x2B50; Prestige ' + prestige + ' &mdash; ' + escapeHtml(p.prestigeTier) + ' &bull; ';
  else html += escapeHtml(p.prestigeTier) + ' &bull; ';
  html += p.prestigeMultiplier + 'x Multiplier</p>';
  html += '<div class="sm-hero-stats">';
  html += '<div class="sm-hero-stat"><strong>Lv.' + p.portfolioLevel + '</strong>Portfolio Level</div>';
  html += '<div class="sm-hero-stat"><strong>' + formatNumber(p.totalTrades) + '</strong>Trades Made</div>';
  html += '<div class="sm-hero-stat"><strong>' + formatNumber(Math.floor(p.totalCoinsEarned)) + '</strong>Total Earned</div>';
  html += '<div class="sm-hero-stat"><strong>' + formatNumber(Math.floor(p.portfolioCoins)) + '</strong>Portfolio Value</div>';
  html += '</div>';
  html += '<div class="sm-level-bar"><div class="sm-level-fill" style="width:' + xpPct + '%"></div>';
  html += '<div class="sm-level-text">Lv.' + p.portfolioLevel + ' &mdash; ' + formatNumber(p.portfolioXp) + ' / ' + formatNumber(p.xpNeeded) + ' XP</div></div>';
  html += '</div></div>';

  // Income panel
  html += '<div class="sm-income-panel">';
  html += '<div class="sm-income-left">';
  html += '<div class="sm-income-row">&#x1F4B0; Dividends: <span class="sm-income-val">' + formatIncome(p.incomePerSecond) + '/sec</span></div>';
  html += '<div class="sm-income-row">&#x1F4B5; Clean Cash: <span class="sm-clean-val">' + formatNumber(Math.floor(p.cleanCash)) + '</span> <span class="sm-clean-note">(for upgrades)</span></div>';
  html += '</div>';
  html += '<button class="sm-collect-btn" onclick="smCollect()" id="sm-collect-btn">Collect Dividends</button>';
  html += '</div>';

  // Portfolio value cap bar
  html += '<div class="sm-cap-bar-wrap">';
  html += '<div class="sm-cap-label">Portfolio: ' + formatNumber(Math.floor(p.portfolioCoins)) + ' / ' + formatNumber(p.portfolioCoinsCap) + ' (50% converts to coins on collect)</div>';
  html += '<div class="sm-cap-bar"><div class="sm-cap-fill" style="width:' + capPct + '%"></div></div>';
  html += '</div>';

  // Visualization
  html += renderSmViz();

  // Sub-tabs
  html += '<div class="sm-sub-tabs">';
  html += '<button class="sm-sub-tab' + (smSubTab === 'upgrades' ? ' active' : '') + '" onclick="switchSmSubTab(\'upgrades\')">&#x1F527; Upgrades</button>';
  html += '<button class="sm-sub-tab' + (smSubTab === 'prestige' ? ' active' : '') + '" onclick="switchSmSubTab(\'prestige\')">&#x2B50; Prestige</button>';
  html += '<button class="sm-sub-tab' + (smSubTab === 'customize' ? ' active' : '') + '" onclick="switchSmSubTab(\'customize\')">&#x1F3A8; Customize</button>';
  html += '<button class="sm-sub-tab' + (smSubTab === 'stats' ? ' active' : '') + '" onclick="switchSmSubTab(\'stats\')">&#x1F4CA; Stats</button>';
  html += '</div>';

  if (smSubTab === 'upgrades') html += renderSmUpgrades();
  else if (smSubTab === 'prestige') html += renderSmPrestige();
  else if (smSubTab === 'customize') html += renderSmCustomize();
  else if (smSubTab === 'stats') html += renderSmStats();

  c.innerHTML = html;
  startSmCollectTimer();
}

function renderSmViz() {
  if (!stockMogulData || !stockMogulData.hasPortfolio) return '';
  var u = stockMogulData.upgrades || {};
  var cu = stockMogulData.customizations || {};
  var portfolioLevel = u.portfolio || 0;
  var leverageLevel = u.leverage || 0;
  var insiderLevel = u.insider || 0;

  var officeStyle = cu.office || 'home';
  var screenStyle = cu.screens || 'single';
  var attireStyle = cu.attire || 'casual';
  var chartStyle = cu.chart || 'line';
  var musicStyle = cu.music || 'none';
  var accessStyle = cu.access || 'public';

  var chartCount = 1 + Math.floor(portfolioLevel / 5);
  var hasInsider = insiderLevel > 0;
  var hasLeverage = leverageLevel > 0;

  var attireEmojis = { casual: '&#x1F9D1;', business: '&#x1F454;', suit: '&#x1F454;', bespoke: '&#x1F935;' };
  var attireEmoji = attireEmojis[attireStyle] || '&#x1F9D1;';

  var chartEmojis = { line: '&#x1F4C9;', candle: '&#x1F4CA;', technical: '&#x1F4C8;', classified: '&#x1F575;&#xFE0F;' };
  var chartEmoji = chartEmojis[chartStyle] || '&#x1F4C8;';

  var html = '<div class="sm-portfolio-viz" data-office="' + officeStyle + '" data-screens="' + screenStyle + '">';

  // Portfolio name sign
  var portName = (stockMogulData.portfolio && stockMogulData.portfolio.portfolioName) ? escapeHtml(stockMogulData.portfolio.portfolioName) : 'MY PORTFOLIO';
  html += '<div class="sm-name-plate">' + portName + '</div>';

  if (musicStyle !== 'none') {
    var musicLabels = { news: 'Market News', jazz: 'Jazz', classical: 'Classical' };
    html += '<div class="sm-music-indicator">&#x1F3B5; ' + (musicLabels[musicStyle] || musicStyle) + '</div>';
  }

  html += '<div class="sm-scene">';

  // Trader
  html += '<div class="sm-trader-area">';
  html += '<div class="sm-trader">' + attireEmoji + '</div>';
  if (hasInsider) html += '<div class="sm-insider-badge">&#x1F4F1; Insider</div>';
  html += '</div>';

  // Charts/screens
  html += '<div class="sm-screens-area">';
  for (var i = 0; i < Math.min(chartCount, 6); i++) {
    var trend = i % 2 === 0 ? 'up' : 'mixed';
    html += '<div class="sm-chart-tile sm-chart-' + trend + '">' + chartEmoji + '</div>';
  }
  html += '</div>';

  // Access indicator
  var accessLabels = { public: '&#x1F3DB;&#xFE0F; NYSE', private: '&#x1F511; Private', darkpool: '&#x1F578;&#xFE0F; Dark Pool', shell: '&#x1F4A0; Shell Net' };
  html += '<div class="sm-access-indicator">' + (accessLabels[accessStyle] || accessStyle) + '</div>';

  if (hasLeverage) {
    html += '<div class="sm-leverage-badge">&#x26A1; ' + leverageLevel + '&times; Leverage</div>';
  }

  html += '</div>';
  html += '<div class="sm-viz-labels">';
  html += '<span>Holdings (' + chartCount + ')</span>';
  html += '<span>' + (accessLabels[accessStyle] || 'Public') + '</span>';
  html += '</div>';
  html += '</div>';
  return html;
}

function renderSmUpgrades() {
  if (!stockMogulData || !stockMogulData.availableUpgrades) return '';
  var p = stockMogulData.portfolio;
  var html = '<div class="sm-upgrade-note">&#x1F4B2; Upgrades cost <strong>clean cash</strong> from your Car Wash &mdash; Available: ' + formatNumber(Math.floor(p.cleanCash)) + '</div>';
  html += '<div class="sm-upgrade-grid">';
  var au = stockMogulData.availableUpgrades;
  for (var key in au) {
    var def = au[key];
    var isMaxed = def.maxed;
    var pct = Math.floor((def.currentLevel / def.maxLevel) * 100);
    var preview = def.effectPreview || {};
    html += '<div class="sm-upgrade-card' + (isMaxed ? ' maxed' : '') + '">';
    html += '<div class="sm-upgrade-header">';
    html += '<span class="sm-upgrade-emoji">' + def.emoji + '</span>';
    html += '<span class="sm-upgrade-name">' + escapeHtml(def.name) + '</span>';
    html += '<span class="sm-upgrade-level">Lv.' + def.currentLevel + '/' + def.maxLevel + '</span>';
    html += '</div>';
    html += '<div class="sm-upgrade-progress"><div class="sm-upgrade-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="sm-upgrade-desc">' + escapeHtml(def.desc) + '</div>';
    if (preview.current) {
      html += '<div class="sm-upgrade-effect-preview">';
      html += '<span class="sm-effect-current">' + escapeHtml(preview.current) + '</span>';
      if (preview.next && !isMaxed) {
        html += '<span class="sm-effect-arrow">&rarr;</span>';
        html += '<span class="sm-effect-next">' + escapeHtml(preview.next) + '</span>';
      }
      html += '</div>';
    }
    if (isMaxed) {
      html += '<div class="sm-upgrade-btns"><button class="sm-upgrade-btn maxed-btn" disabled>MAX LEVEL</button></div>';
    } else {
      var canAfford = (p.cleanCash || 0) >= def.cost;
      var maxBuy = def.maxBuy || { levels: 0, totalCost: 0 };
      html += '<div class="sm-upgrade-btns">';
      html += '<button class="sm-upgrade-btn sm-buy-one" onclick="smUpgrade(\'' + key + '\')"' + (canAfford ? '' : ' disabled') + '>';
      html += '+1 &bull; ' + formatNumber(def.cost) + ' clean</button>';
      html += '<button class="sm-upgrade-btn sm-buy-max" onclick="smUpgradeMax(\'' + key + '\')"' + (maxBuy.levels > 0 ? '' : ' disabled') + '>';
      html += 'MAX' + (maxBuy.levels > 0 ? ' (+' + maxBuy.levels + ')' : '') + '</button>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderSmPrestige() {
  if (!stockMogulData || !stockMogulData.portfolio) return '';
  var p = stockMogulData.portfolio;
  var tiers = [
    { level: 0, name: 'Day Trader',          mult: '1x', unlocks: 'Base portfolio' },
    { level: 1, name: 'Hedge Fund Manager',  mult: '2x', unlocks: 'Trading floor, power suit' },
    { level: 2, name: 'Market Maker',        mult: '3x', unlocks: 'Bloomberg, dark pools' },
    { level: 3, name: 'Wolf of Wall Street', mult: '5x', unlocks: 'Glass tower, bespoke suits' },
    { level: 4, name: 'Market Overlord',     mult: '8x', unlocks: 'Secret penthouse, shell network' }
  ];
  var html = '<div class="sm-prestige-panel">';
  html += '<div class="sm-prestige-header">';
  html += '<span class="sm-prestige-tier">' + escapeHtml(p.prestigeTier) + '</span>';
  html += '<span class="sm-prestige-mult">' + p.prestigeMultiplier + 'x multiplier</span>';
  html += '</div>';
  html += '<div class="sm-prestige-tiers-list">';
  for (var i = 0; i < tiers.length; i++) {
    var t = tiers[i];
    var isCurrent = p.prestigeLevel === t.level;
    var isLocked = p.prestigeLevel < t.level;
    html += '<div class="sm-prestige-tier-card' + (isCurrent ? ' current' : '') + (isLocked ? ' locked' : '') + '">';
    html += '<div class="sm-prestige-tier-name">' + t.name + '</div>';
    html += '<div class="sm-prestige-tier-mult">' + t.mult + ' multiplier</div>';
    html += '<div class="sm-prestige-tier-unlock">' + t.unlocks + '</div>';
    html += '</div>';
  }
  html += '</div>';
  var canPrestige = p.portfolioLevel >= 100;
  html += '<div style="text-align:center;margin-top:16px">';
  if (canPrestige) {
    html += '<p style="color:var(--success);margin-bottom:12px">&#x2728; Level 100 reached! Prestige to advance your tier.</p>';
    html += '<button class="sm-prestige-btn" onclick="smPrestige()">Prestige Now</button>';
    html += '<p style="color:var(--text-dim);font-size:0.8rem;margin-top:8px">Resets portfolio level, XP, and upgrades.</p>';
  } else {
    html += '<p style="color:var(--text-dim)">Reach Portfolio Level 100 to unlock Prestige (' + p.portfolioLevel + '/100)</p>';
    html += '<button class="sm-prestige-btn" disabled>Prestige (Lv.100 required)</button>';
  }
  html += '</div></div>';
  return html;
}

function renderSmCustomize() {
  if (!stockMogulData) return '';
  var ac = stockMogulData.availableCustomizations || {};
  var current = stockMogulData.customizations || {};
  var html = '';
  html += '<div class="sm-name-input-row">';
  html += '<input class="sm-name-input" id="sm-name-input" maxlength="24" placeholder="Portfolio name..." value="' + escapeHtml(stockMogulData.portfolio.portfolioName) + '">';
  html += '<button class="sm-name-btn" onclick="smRename()">Rename</button>';
  html += '</div>';
  html += '<div class="sm-customize-panel">';
  for (var cat in ac) {
    var catDef = ac[cat];
    var currentVal = current[cat] || catDef.default;
    html += '<div class="sm-customize-group">';
    html += '<div class="sm-customize-group-title">' + escapeHtml(catDef.name) + '</div>';
    html += '<div class="sm-customize-options">';
    for (var i = 0; i < catDef.options.length; i++) {
      var opt = catDef.options[i];
      var isSelected = opt.id === currentVal;
      var isLocked = opt.locked;
      html += '<div class="sm-customize-option' + (isSelected ? ' selected' : '') + (isLocked ? ' locked' : '') + '"';
      if (!isLocked) html += ' onclick="smCustomize(\'' + cat + '\',\'' + opt.id + '\')"';
      html += '>';
      html += escapeHtml(opt.name);
      if (isLocked) html += '<span class="sm-customize-lock">&#x1F512; Prestige ' + opt.minPrestige + '</span>';
      if (isSelected) html += '<span style="margin-left:auto;color:var(--success)">&#x2714;</span>';
      html += '</div>';
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function renderSmStats() {
  if (!stockMogulData || !stockMogulData.portfolio) return '';
  var p = stockMogulData.portfolio;
  var u = stockMogulData.upgrades || {};
  var totalUpgradeLevels = 0;
  for (var k in u) totalUpgradeLevels += u[k];
  var html = '<div class="sm-stats-panel"><div class="sm-stats-grid">';
  html += '<div class="sm-stat-item"><span class="sm-stat-value">' + formatNumber(p.totalTrades) + '</span><span class="sm-stat-label">Trades Made</span></div>';
  html += '<div class="sm-stat-item"><span class="sm-stat-value">' + formatNumber(Math.floor(p.totalCoinsEarned)) + '</span><span class="sm-stat-label">Total Coins Earned</span></div>';
  html += '<div class="sm-stat-item"><span class="sm-stat-value">Lv.' + p.portfolioLevel + '</span><span class="sm-stat-label">Portfolio Level</span></div>';
  html += '<div class="sm-stat-item"><span class="sm-stat-value">' + p.prestigeLevel + '</span><span class="sm-stat-label">Prestige Level</span></div>';
  html += '<div class="sm-stat-item"><span class="sm-stat-value">' + p.prestigeMultiplier + 'x</span><span class="sm-stat-label">Multiplier</span></div>';
  html += '<div class="sm-stat-item"><span class="sm-stat-value">' + formatIncome(p.incomePerSecond) + '</span><span class="sm-stat-label">Dividends/sec</span></div>';
  html += '<div class="sm-stat-item"><span class="sm-stat-value">' + totalUpgradeLevels + '</span><span class="sm-stat-label">Upgrade Levels</span></div>';
  html += '<div class="sm-stat-item"><span class="sm-stat-value">' + formatNumber(Math.floor(p.cleanCash)) + '</span><span class="sm-stat-label">Clean Cash</span></div>';
  html += '</div></div>';
  return html;
}

function switchSmSubTab(tab) {
  smSubTab = tab;
  renderStockMogul();
}

function startSmCollectTimer() {
  if (smCollectTimer) clearInterval(smCollectTimer);
  smCollectTimer = setInterval(function() {
    if (!stockMogulData || !stockMogulData.hasPortfolio) return;
    var btn = document.getElementById('sm-collect-btn');
    if (!btn) { clearInterval(smCollectTimer); return; }
    var p = stockMogulData.portfolio;
    var pending = stockMogulData.pending;
    var alreadyHave = p.portfolioCoins || 0;
    var pendingNew = pending ? pending.portfolioCoins : 0;
    var rate = p.incomePerSecond || 0;
    var msSinceFetch = Date.now() - (stockMogulData._fetchTime || Date.now());
    var extraCoins = rate * (msSinceFetch / 1000);
    var total = alreadyHave + pendingNew + extraCoins;
    var cap = p.portfolioCoinsCap || 15000;
    total = Math.min(total, cap);
    var realCoins = Math.floor(total * 0.5);
    btn.textContent = 'Collect \u2248' + formatNumber(realCoins) + ' coins';
  }, 500);
}

async function smCollect() {
  try {
    const r = await fetch('/api/me/stockmogul/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      const heroCoins = document.getElementById('ov-hero-coin-val');
      if (heroCoins && data.newBalance) heroCoins.textContent = formatNumber(data.newBalance);
      loadStockMogul();
    } else {
      showToast(data.message || 'Nothing to collect yet', 'info');
    }
  } catch { showToast('Failed to collect', 'error'); }
}

async function smUpgrade(upgradeType) {
  try {
    const r = await fetch('/api/me/stockmogul/upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upgradeType }) });
    const data = await r.json();
    if (data.ok) { showToast(data.message, 'success'); loadStockMogul(); }
    else showToast(data.message || 'Upgrade failed', 'error');
  } catch { showToast('Upgrade failed', 'error'); }
}

async function smUpgradeMax(upgradeType) {
  try {
    const r = await fetch('/api/me/stockmogul/upgrade-max', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upgradeType }) });
    const data = await r.json();
    if (data.ok) { showToast(data.message, 'success'); loadStockMogul(); }
    else showToast(data.message || 'Max upgrade failed', 'error');
  } catch { showToast('Max upgrade failed', 'error'); }
}

async function smPrestige(skipConfirm) {
  if (!skipConfirm && !confirm('Prestige the Stock Mogul? This resets your portfolio level, XP, and upgrades.')) return;
  try {
    const r = await fetch('/api/me/stockmogul/prestige', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json();
    if (data.ok) { showToast(data.message, 'success'); loadStockMogul(); }
    else showToast(data.message || 'Prestige failed', 'error');
  } catch { showToast('Prestige failed', 'error'); }
}

async function smCustomize(category, value) {
  try {
    const r = await fetch('/api/me/stockmogul/customize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, value }) });
    const data = await r.json();
    if (data.ok) {
      if (stockMogulData && stockMogulData.customizations) stockMogulData.customizations[category] = value;
      renderStockMogul();
    } else showToast(data.message || 'Customization failed', 'error');
  } catch { showToast('Customization failed', 'error'); }
}

async function smRename() {
  var name = document.getElementById('sm-name-input')?.value;
  if (!name || !name.trim()) return;
  try {
    const r = await fetch('/api/me/stockmogul/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await r.json();
    if (data.ok) {
      showToast('Portfolio renamed to "' + escapeHtml(data.portfolioName) + '"!', 'success');
      if (stockMogulData && stockMogulData.portfolio) stockMogulData.portfolio.portfolioName = data.portfolioName;
      renderStockMogul();
    } else showToast(data.message || 'Rename failed', 'error');
  } catch { showToast('Rename failed', 'error'); }
}

// ==================== CAR WASH ====================

function renderCarwashNoShop() {
  var c = document.getElementById('carwash-container');
  if (!c) return;
  c.innerHTML =
    '<div class="cw-no-shop">' +
    '<div class="cw-no-shop-emoji">&#x1F697;</div>' +
    '<div class="cw-no-shop-title">Car Wash Not Unlocked</div>' +
    '<div class="cw-no-shop-desc">Purchase the Car Wash business (100,000 XP) from the Businesses tab to open your very own car wash operation!</div>' +
    '</div>';
}

function renderCarwashShop() {
  var c = document.getElementById('carwash-container');
  if (!c || !carwashData) return;

  if (!carwashData.ok || !carwashData.hasShop) {
    // Auto-initialize if player owns the carwash business but shop row doesn't exist yet
    if (carwashData.ok && !carwashData.hasShop && !carwashData._initAttempted) {
      carwashData._initAttempted = true;
      c.innerHTML = '<div class="cw-no-shop"><div class="cw-no-shop-emoji">&#x1F697;</div><div class="cw-no-shop-title">Opening your Car Wash...</div></div>';
      fetch('/api/me/carwash/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(function(r) { return r.json(); })
        .then(function(d) { if (d.ok) { loadCarwashShop(); } else { renderCarwashNoShop(); } })
        .catch(function() { renderCarwashNoShop(); });
      return;
    }
    renderCarwashNoShop();
    return;
  }

  var s = carwashData.shop;
  var theme = (carwashData.customizations && carwashData.customizations.exterior) || 'tin';
  var prestige = s.prestigeLevel || 0;
  var xpPct = s.xpNeeded > 0 ? Math.min(100, Math.floor((s.shopXp / s.xpNeeded) * 100)) : 0;
  var capPct = s.cleanCashCap > 0 ? Math.min(100, Math.floor((s.cleanCash / s.cleanCashCap) * 100)) : 0;
  var pendingClean = (carwashData.pending && carwashData.pending.cleanCash) || 0;

  c.setAttribute('data-theme', theme);
  c.setAttribute('data-prestige', String(prestige));

  var html = '';

  // Hero
  html += '<div class="cw-hero"><div class="cw-hero-bg"></div><div class="cw-hero-content">';
  html += '<h2 class="cw-hero-title">&#x1F697; ' + escapeHtml(s.shopName) + '</h2>';
  html += '<p class="cw-hero-sub">';
  if (prestige > 0) html += '&#x2B50; Prestige ' + prestige + ' &mdash; ' + escapeHtml(s.prestigeTier) + ' &bull; ';
  else html += escapeHtml(s.prestigeTier) + ' &bull; ';
  html += s.prestigeMultiplier + 'x Multiplier</p>';
  html += '<div class="cw-hero-stats">';
  html += '<div class="cw-hero-stat"><strong>Lv.' + s.shopLevel + '</strong>Shop Level</div>';
  html += '<div class="cw-hero-stat"><strong>' + formatNumber(s.totalCarsWashed) + '</strong>Cars Washed</div>';
  html += '<div class="cw-hero-stat"><strong>' + formatNumber(Math.floor(s.totalCleanEarned)) + '</strong>Total Clean $</div>';
  html += '<div class="cw-hero-stat"><strong>' + formatNumber(Math.floor(s.cleanCash)) + '</strong>Clean Cash</div>';
  html += '</div>';
  html += '<div class="cw-level-bar"><div class="cw-level-fill" style="width:' + xpPct + '%"></div>';
  html += '<div class="cw-level-text">Lv.' + s.shopLevel + ' &mdash; ' + formatNumber(s.shopXp) + ' / ' + formatNumber(s.xpNeeded) + ' XP</div></div>';
  html += '</div></div>';

  // Income / Laundering Panel
  html += '<div class="cw-income-panel">';
  html += '<div class="cw-income-left">';
  html += '<div class="cw-income-row">&#x1F4B0; Coins: <span class="cw-income-val">' + formatIncome(s.incomePerSecond) + '/sec</span></div>';
  html += '<div class="cw-income-row">&#x1F9FC; Laundering: <span class="cw-launder-val">' + (s.launderingRate * 100).toFixed(2) + '%</span> of total income';
  html += ' <span class="cw-launder-rate">= ' + formatIncome(s.cleanCashPerSec) + ' clean/sec</span></div>';
  html += '</div>';
  html += '<button class="cw-collect-btn" onclick="carwashCollect()" id="cw-collect-btn">Collect Clean Cash</button>';
  html += '</div>';

  // Clean cash cap bar
  html += '<div class="cw-cap-bar-wrap">';
  html += '<div class="cw-cap-label">Storage: ' + formatNumber(Math.floor(s.cleanCash)) + ' / ' + formatNumber(s.cleanCashCap) + ' clean cash</div>';
  html += '<div class="cw-cap-bar"><div class="cw-cap-fill" style="width:' + capPct + '%"></div></div>';
  html += '</div>';

  // Car Wash Visualization
  html += renderCarwashViz();

  // Stock Mogul panel
  html += renderStockMogulPanel();

  // Sub-tabs
  html += '<div class="cw-sub-tabs">';
  html += '<button class="cw-sub-tab' + (carwashSubTab === 'upgrades' ? ' active' : '') + '" onclick="switchCwSubTab(\'upgrades\')">&#x1F527; Upgrades</button>';
  html += '<button class="cw-sub-tab' + (carwashSubTab === 'prestige' ? ' active' : '') + '" onclick="switchCwSubTab(\'prestige\')">&#x2B50; Prestige</button>';
  html += '<button class="cw-sub-tab' + (carwashSubTab === 'customize' ? ' active' : '') + '" onclick="switchCwSubTab(\'customize\')">&#x1F3A8; Customize</button>';
  html += '<button class="cw-sub-tab' + (carwashSubTab === 'stats' ? ' active' : '') + '" onclick="switchCwSubTab(\'stats\')">&#x1F4CA; Stats</button>';
  html += '</div>';

  if (carwashSubTab === 'upgrades') html += renderCarwashUpgrades();
  else if (carwashSubTab === 'prestige') html += renderCarwashPrestige();
  else if (carwashSubTab === 'customize') html += renderCarwashCustomize();
  else if (carwashSubTab === 'stats') html += renderCarwashStats();

  c.innerHTML = html;
  startCarwashCollectTimer();
}

function renderCarwashViz() {
  if (!carwashData || !carwashData.hasShop) return '';
  var u = carwashData.upgrades || {};
  var cu = carwashData.customizations || {};
  var baysLevel = u.bays || 0;
  var staffLevel = u.staff || 0;
  var dryersLevel = u.dryers || 0;
  var shellLevel = u.shell || 0;

  var exteriorStyle = cu.exterior || 'tin';
  var signStyle = cu.sign || 'chalk';
  var equipStyle = cu.equipment || 'hose';
  var uniformStyle = cu.uniform || 'casual';
  var musicStyle = cu.music || 'none';
  var officeStyle = cu.office || 'none';

  var bayCount = 1 + Math.floor(baysLevel / 5);
  var staffCount = 1 + Math.floor(staffLevel / 4);
  var hasShellCo = shellLevel > 0;

  var html = '<div class="cw-wash-viz" data-exterior="' + exteriorStyle + '" data-sign="' + signStyle + '">';

  // Shop sign
  var shopName = (carwashData.shop && carwashData.shop.shopName) ? escapeHtml(carwashData.shop.shopName) : 'CAR WASH';
  html += '<div class="cw-sign cw-sign-' + signStyle + '">' + shopName + '</div>';

  // Music indicator
  if (musicStyle !== 'none') {
    var musicLabels = { radio: 'Radio', jazz: 'Jazz Lounge', lofi: 'Lo-fi', upscale: 'Upscale Lounge' };
    html += '<div class="cw-music-indicator">&#x1F3B5; ' + (musicLabels[musicStyle] || musicStyle) + '</div>';
  }

  html += '<div class="cw-scene">';

  // Wash bays
  html += '<div class="cw-bays-area">';
  for (var i = 0; i < Math.min(bayCount, 5); i++) {
    var speed = Math.max(1, 6 - dryersLevel * 0.1);
    html += '<div class="cw-bay" style="--wash-speed:' + speed + 's">';
    html += '<div class="cw-car">&#x1F697;</div>';
    html += '<div class="cw-bubbles"><span>&#x1F9FC;</span><span>&#x1F9FC;</span><span>&#x1F9FC;</span></div>';
    html += '</div>';
  }
  html += '</div>';

  // Staff
  var uniformEmojis = { casual: '&#x1F9D1;', coveralls: '&#x1F477;', branded: '&#x1F477;', elite: '&#x1F575;&#xFE0F;' };
  var staffEmoji = uniformEmojis[uniformStyle] || '&#x1F9D1;';
  html += '<div class="cw-staff-area">';
  for (var j = 0; j < Math.min(staffCount, 6); j++) {
    html += '<div class="cw-staff">' + staffEmoji + '</div>';
  }
  html += '</div>';

  // Office / shell company indicator
  if (officeStyle !== 'none') {
    var officeLabels = { backroom: '&#x1F4BC; Back Room', glass: '&#x1F3E2; Office', vault: '&#x1F573;&#xFE0F; Vault' };
    html += '<div class="cw-office-indicator">' + (officeLabels[officeStyle] || officeStyle) + '</div>';
  }

  if (hasShellCo) {
    html += '<div class="cw-shell-indicator">&#x1F4C4; ' + shellLevel + ' Shell Co.</div>';
  }

  html += '</div>'; // scene
  html += '<div class="cw-viz-labels">';
  html += '<span>Bays (' + bayCount + ')</span>';
  html += '<span>Staff (' + staffCount + ')</span>';
  html += '</div>';
  html += '</div>';
  return html;
}

function renderStockMogulPanel() {
  if (!carwashData || !carwashData.hasShop) return '';
  var s = carwashData.shop;
  var hasStockMogul = carwashData.hasStockMogul;
  var cost = carwashData.stockMogulCost || 5000;
  var canAfford = (s.cleanCash || 0) >= cost;

  var html = '<div class="cw-stockmogul-panel">';
  html += '<div class="cw-stockmogul-header">&#x1F4C8; Stock Mogul';
  if (hasStockMogul) html += ' <span class="cw-sm-owned">OWNED</span>';
  html += '</div>';

  if (hasStockMogul) {
    html += '<p class="cw-sm-desc">Your Car Wash launders a slice of your business income into clean cash. Once Stock Mogul is unlocked, all portfolio upgrades and collects happen inside the Stock Mogul management page, not here.</p>';
    html += '<p class="cw-sm-hint">Use this page to grow storage and laundering rate. Use Stock Mogul to spend clean cash on portfolio progression.</p>';
    html += '<button class="cw-sm-btn" onclick="carwashManageStockMogul()">';
    html += '&#x1F4C8; Manage Stock Mogul</button>';
  } else {
    html += '<p class="cw-sm-desc">The Car Wash converts part of your total business income into clean cash over time. Once you have enough clean cash, you can unlock Stock Mogul and manage that business separately.</p>';
    html += '<p class="cw-sm-hint">Flow: business income &rarr; Car Wash laundering &rarr; clean cash &rarr; Stock Mogul unlock & upgrades.</p>';
    html += '<button class="cw-sm-btn" onclick="carwashBuyStockMogul()"' + (canAfford ? '' : ' disabled') + '>';
    html += '&#x1F512; Unlock Stock Mogul &bull; ' + formatNumber(cost) + ' clean cash</button>';
    if (!canAfford) html += '<p class="cw-sm-hint">Need ' + formatNumber(cost) + ' clean cash &mdash; currently ' + formatNumber(Math.floor(s.cleanCash)) + '</p>';
  }
  html += '</div>';
  return html;
}

function renderCarwashUpgrades() {
  if (!carwashData || !carwashData.availableUpgrades) return '';
  var s = carwashData.shop;
  var html = '<div class="cw-upgrade-grid">';
  var au = carwashData.availableUpgrades;
  for (var key in au) {
    var def = au[key];
    var isMaxed = def.maxed;
    var pct = Math.floor((def.currentLevel / def.maxLevel) * 100);
    var preview = def.effectPreview || {};
    html += '<div class="cw-upgrade-card' + (isMaxed ? ' maxed' : '') + '">';
    html += '<div class="cw-upgrade-header">';
    html += '<span class="cw-upgrade-emoji">' + def.emoji + '</span>';
    html += '<span class="cw-upgrade-name">' + escapeHtml(def.name) + '</span>';
    html += '<span class="cw-upgrade-level">Lv.' + def.currentLevel + '/' + def.maxLevel + '</span>';
    html += '</div>';
    html += '<div class="cw-upgrade-progress"><div class="cw-upgrade-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="cw-upgrade-desc">' + escapeHtml(def.desc) + '</div>';
    if (preview.current) {
      html += '<div class="cw-upgrade-effect-preview">';
      html += '<span class="cw-effect-current">' + escapeHtml(preview.current) + '</span>';
      if (preview.next && !isMaxed) {
        html += '<span class="cw-effect-arrow">&rarr;</span>';
        html += '<span class="cw-effect-next">' + escapeHtml(preview.next) + '</span>';
      }
      html += '</div>';
    }
    if (isMaxed) {
      html += '<div class="cw-upgrade-btns"><button class="cw-upgrade-btn maxed-btn" disabled>MAX LEVEL</button></div>';
    } else {
      var canAfford = (s.cleanCash || 0) >= def.cost;
      var maxBuy = def.maxBuy || { levels: 0, totalCost: 0 };
      html += '<div class="cw-upgrade-btns">';
      html += '<button class="cw-upgrade-btn cw-buy-one" onclick="carwashUpgrade(\'' + key + '\')"' + (canAfford ? '' : ' disabled') + '>';
      html += '+1 &bull; ' + formatNumber(def.cost) + ' clean</button>';
      html += '<button class="cw-upgrade-btn cw-buy-max" onclick="carwashUpgradeMax(\'' + key + '\')"' + (maxBuy.levels > 0 ? '' : ' disabled') + '>';
      html += 'MAX' + (maxBuy.levels > 0 ? ' (+' + maxBuy.levels + ')' : '') + '</button>';
      html += '</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderCarwashPrestige() {
  if (!carwashData || !carwashData.shop) return '';
  var s = carwashData.shop;
  var tax = carwashData.taxSeason || null;
  var tiers = [
    { level: 0, name: 'Neighborhood Wash', mult: '1x', unlocks: 'Base operation' },
    { level: 1, name: 'Sudsy Business',    mult: '2x', unlocks: 'Exterior styles, uniforms' },
    { level: 2, name: 'The Rinse Cycle',   mult: '3x', unlocks: 'Premium equipment, offices' },
    { level: 3, name: 'Money Bubbles',     mult: '5x', unlocks: 'Luxury exteriors, neon' },
    { level: 4, name: 'The Syndicate',     mult: '8x', unlocks: 'Underground vault, full op' }
  ];
  var html = '<div class="cw-prestige-panel">';
  html += '<div class="cw-prestige-header">';
  html += '<span class="cw-prestige-tier">' + escapeHtml(s.prestigeTier) + '</span>';
  html += '<span class="cw-prestige-mult">' + s.prestigeMultiplier + 'x multiplier</span>';
  html += '</div>';
  html += '<div class="cw-prestige-tiers-list">';
  for (var i = 0; i < tiers.length; i++) {
    var t = tiers[i];
    var isCurrent = s.prestigeLevel === t.level;
    var isLocked = s.prestigeLevel < t.level;
    html += '<div class="cw-prestige-tier-card' + (isCurrent ? ' current' : '') + (isLocked ? ' locked' : '') + '">';
    html += '<div class="cw-prestige-tier-name">' + t.name + '</div>';
    html += '<div class="cw-prestige-tier-mult">' + t.mult + ' multiplier</div>';
    html += '<div class="cw-prestige-tier-unlock">' + t.unlocks + '</div>';
    html += '</div>';
  }
  html += '</div>';
  var canPrestige = s.shopLevel >= 100;
  html += '<div style="text-align:center;margin-top:16px">';
  if (canPrestige) {
    html += '<p style="color:var(--success);margin-bottom:12px">&#x2728; Level 100 reached! Prestige to advance your operation.</p>';
    html += '<button class="cw-prestige-btn" onclick="carwashPrestige()">Prestige Now</button>';
    html += '<p style="color:var(--text-dim);font-size:0.8rem;margin-top:8px">Resets shop level, XP, and upgrades. Clean cash is kept.</p>';
  } else {
    html += '<p style="color:var(--text-dim)">Reach Shop Level 100 to unlock Prestige (' + s.shopLevel + '/100)</p>';
    html += '<button class="cw-prestige-btn" disabled>Prestige (Lv.100 required)</button>';
  }
  html += '</div>';
  if (tax && tax.ok) {
    var state = tax.state || {};
    var eligibility = tax.eligibility || {};
    html += '<div class="cw-tax-season-panel">';
    html += '<div class="cw-tax-season-header"><span class="cw-tax-season-title">&#x1F9FE; Tax Season</span>';
    if (state.completed) {
      html += '<span class="cw-tax-season-badge success">Resolved</span>';
    } else if (eligibility.eligible && tax.enabled) {
      html += '<span class="cw-tax-season-badge warning">Eligible</span>';
    } else {
      html += '<span class="cw-tax-season-badge muted">Locked</span>';
    }
    html += '</div>';
    if (state.completed) {
      html += '<p class="cw-tax-season-copy">The RSA already seized this empire. Tax Season is permanently resolved on your account.</p>';
      html += '<div class="cw-tax-season-summary">Permanent income bonus: <strong>+10%</strong></div>';
    } else if (!tax.enabled) {
      html += '<p class="cw-tax-season-copy">Tax Season exists in the backend but is not enabled yet.</p>';
    } else if (eligibility.eligible) {
      html += '<p class="cw-tax-season-copy">One-time account reset. Resets coins, business levels, managed progression, and stored business income. Keeps library, gift coins, cosmetics, identity, and history.</p>';
      html += '<div class="cw-tax-season-summary">Reward: <strong>+10% permanent income</strong></div>';
      html += '<button class="cw-tax-season-btn" onclick="carwashRunTaxSeason()">Trigger Tax Season</button>';
      html += '<p class="cw-tax-season-note">You will be asked to type <code>' + escapeHtml(tax.confirmationPhrase || 'RESET MY EMPIRE') + '</code> to confirm.</p>';
    } else {
      html += '<p class="cw-tax-season-copy">Reach Car Wash prestige 1 to become eligible for the one-time Tax Season event.</p>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function renderCarwashCustomize() {
  if (!carwashData) return '';
  var ac = carwashData.availableCustomizations || {};
  var current = carwashData.customizations || {};
  var html = '';
  html += '<div class="cw-name-input-row">';
  html += '<input class="cw-name-input" id="cw-name-input" maxlength="24" placeholder="Car wash name..." value="' + escapeHtml(carwashData.shop.shopName) + '">';
  html += '<button class="cw-name-btn" onclick="carwashRename()">Rename</button>';
  html += '</div>';
  html += '<div class="cw-customize-panel">';
  for (var cat in ac) {
    var catDef = ac[cat];
    var currentVal = current[cat] || catDef.default;
    html += '<div class="cw-customize-group">';
    html += '<div class="cw-customize-group-title">' + escapeHtml(catDef.name) + '</div>';
    html += '<div class="cw-customize-options">';
    for (var i = 0; i < catDef.options.length; i++) {
      var opt = catDef.options[i];
      var isSelected = opt.id === currentVal;
      var isLocked = opt.locked;
      html += '<div class="cw-customize-option' + (isSelected ? ' selected' : '') + (isLocked ? ' locked' : '') + '"';
      if (!isLocked) html += ' onclick="carwashCustomize(\'' + cat + '\',\'' + opt.id + '\')"';
      html += '>';
      html += escapeHtml(opt.name);
      if (isLocked) html += '<span class="cw-customize-lock">&#x1F512; Prestige ' + opt.minPrestige + '</span>';
      if (isSelected) html += '<span style="margin-left:auto;color:var(--success)">&#x2714;</span>';
      html += '</div>';
    }
    html += '</div></div>';
  }
  html += '</div>';
  return html;
}

function renderCarwashStats() {
  if (!carwashData || !carwashData.shop) return '';
  var s = carwashData.shop;
  var u = carwashData.upgrades || {};
  var totalUpgradeLevels = 0;
  for (var k in u) totalUpgradeLevels += u[k];
  var html = '<div class="cw-stats-panel"><div class="cw-stats-grid">';
  html += '<div class="cw-stat-item"><span class="cw-stat-value">' + formatNumber(s.totalCarsWashed) + '</span><span class="cw-stat-label">Cars Washed</span></div>';
  html += '<div class="cw-stat-item"><span class="cw-stat-value">' + formatNumber(Math.floor(s.totalCleanEarned)) + '</span><span class="cw-stat-label">Total Clean Earned</span></div>';
  html += '<div class="cw-stat-item"><span class="cw-stat-value">Lv.' + s.shopLevel + '</span><span class="cw-stat-label">Shop Level</span></div>';
  html += '<div class="cw-stat-item"><span class="cw-stat-value">' + s.prestigeLevel + '</span><span class="cw-stat-label">Prestige Level</span></div>';
  html += '<div class="cw-stat-item"><span class="cw-stat-value">' + (s.launderingRate * 100).toFixed(2) + '%</span><span class="cw-stat-label">Launder Rate</span></div>';
  html += '<div class="cw-stat-item"><span class="cw-stat-value">' + formatIncome(s.cleanCashPerSec) + '</span><span class="cw-stat-label">Clean Cash/sec</span></div>';
  html += '<div class="cw-stat-item"><span class="cw-stat-value">' + totalUpgradeLevels + '</span><span class="cw-stat-label">Upgrade Levels</span></div>';
  html += '<div class="cw-stat-item"><span class="cw-stat-value">' + s.prestigeMultiplier + 'x</span><span class="cw-stat-label">Multiplier</span></div>';
  html += '</div></div>';
  return html;
}

function switchCwSubTab(tab) {
  carwashSubTab = tab;
  renderCarwashShop();
}

function startCarwashCollectTimer() {
  if (carwashCollectTimer) clearInterval(carwashCollectTimer);
  carwashCollectTimer = setInterval(function() {
    if (!carwashData || !carwashData.hasShop) return;
    var btn = document.getElementById('cw-collect-btn');
    if (!btn) { clearInterval(carwashCollectTimer); return; }
    var s = carwashData.shop;
    var pending = carwashData.pending;
    var alreadyHave = s.cleanCash || 0;
    var pendingNew = pending ? pending.cleanCash : 0;
    var rate = s.cleanCashPerSec || 0;
    var msSinceFetch = Date.now() - (carwashData._fetchTime || Date.now());
    var extraClean = rate * (msSinceFetch / 1000);
    var cap = s.cleanCashCap || 100000;
    var spaceLeft = Math.max(0, cap - alreadyHave);
    var toCollect = Math.min(pendingNew + extraClean, spaceLeft);
    toCollect = Math.max(0, toCollect);
    btn.textContent = 'Collect ' + formatNumber(Math.floor(toCollect)) + ' clean cash';
  }, 500);
}

async function carwashCollect() {
  try {
    const r = await fetch('/api/me/carwash/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json();
    if (data.ok) {
      showToast(data.message || 'Collected!', 'success');
      loadCarwashShop();
    } else {
      showToast(data.message || 'Nothing to collect yet', 'info');
    }
  } catch { showToast('Failed to collect', 'error'); }
}

async function carwashUpgrade(upgradeType) {
  try {
    const r = await fetch('/api/me/carwash/upgrade', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upgradeType }) });
    const data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      loadCarwashShop();
    } else {
      showToast(data.message || 'Upgrade failed', 'error');
    }
  } catch { showToast('Upgrade failed', 'error'); }
}

async function carwashUpgradeMax(upgradeType) {
  try {
    const r = await fetch('/api/me/carwash/upgrade-max', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ upgradeType }) });
    const data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      loadCarwashShop();
    } else {
      showToast(data.message || 'Max upgrade failed', 'error');
    }
  } catch { showToast('Max upgrade failed', 'error'); }
}

async function carwashPrestige(skipConfirm) {
  if (!skipConfirm && !confirm('Prestige the Car Wash? This resets your shop level, XP, and upgrades. Clean cash is kept.')) return;
  try {
    const r = await fetch('/api/me/carwash/prestige', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      loadCarwashShop();
    } else {
      showToast(data.message || 'Prestige failed', 'error');
    }
  } catch { showToast('Prestige failed', 'error'); }
}

async function carwashRunTaxSeason() {
  if (!carwashData || !carwashData.taxSeason || !carwashData.taxSeason.ok) {
    showToast('Tax Season data is unavailable', 'error');
    return;
  }
  var phrase = carwashData.taxSeason.confirmationPhrase || 'RESET MY EMPIRE';
  var confirmation = prompt('Tax Season is a one-time empire seizure. Type "' + phrase + '" to confirm.');
  if (confirmation === null) return;
  try {
    const r = await fetch('/api/me/carwash/tax-season', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: confirmation, resetReason: 'portal_confirmed_tax_season' })
    });
    const data = await r.json();
    if (data.ok) {
      showToast(data.message || 'Tax Season complete', 'success', 6000);
      loadCarwashShop();
      if (typeof loadShop === 'function') loadShop();
    } else {
      showToast(data.message || 'Tax Season failed', data.code === 'confirmation_required' ? 'info' : 'error', 5000);
    }
  } catch {
    showToast('Tax Season failed', 'error');
  }
}

async function carwashCustomize(category, value) {
  try {
    const r = await fetch('/api/me/carwash/customize', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category, value }) });
    const data = await r.json();
    if (data.ok) {
      if (carwashData && carwashData.customizations) carwashData.customizations[category] = value;
      renderCarwashShop();
    } else {
      showToast(data.message || 'Customization failed', 'error');
    }
  } catch { showToast('Customization failed', 'error'); }
}

async function carwashRename() {
  var name = document.getElementById('cw-name-input')?.value;
  if (!name || !name.trim()) return;
  try {
    const r = await fetch('/api/me/carwash/rename', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
    const data = await r.json();
    if (data.ok) {
      showToast('Car wash renamed to "' + escapeHtml(data.shopName) + '"!', 'success');
      if (carwashData && carwashData.shop) carwashData.shop.shopName = data.shopName;
      renderCarwashShop();
    } else {
      showToast(data.message || 'Rename failed', 'error');
    }
  } catch { showToast('Rename failed', 'error'); }
}

async function carwashBuyStockMogul() {
  if (carwashData && carwashData.hasStockMogul) {
    carwashManageStockMogul();
    return;
  }
  if (!confirm('Unlock Stock Mogul with clean cash?')) return;
  try {
    const r = await fetch('/api/me/carwash/buy-stockmogul', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    const data = await r.json();
    if (data.ok) {
      showToast(data.message, 'success');
      loadCarwashShop();
      // Also refresh the businesses tab data
      if (typeof loadProfile === 'function') loadProfile();
    } else {
      showToast(data.message || 'Failed', 'error');
    }
  } catch { showToast('Failed', 'error'); }
}

function carwashManageStockMogul() {
  openStockMogul();
}

// ==================== PIZZA SHOP ====================

let pizzaSubTab = 'upgrades';
let pizzaCollectTimer = null;
let pizzaLoaded = false;

function openPizzaShop() {
  switchToTab('businesses');
  if (window.Empire) window.Empire.open('pizza');
}

async function loadPizzaShop() {
  try {
    const r = await fetch('/api/me/pizza');
    const data = await r.json();
    pizzaData = data;
    pizzaLoaded = true;
    renderPizzaShop();
    if (pizzaData.shop) {
      maybePromptPrestige('pizza', pizzaData.shop.shopLevel, pizzaData.shop.prestigeLevel, 'Your Pizza Shop reached Level 100. Prestige now to move to the next tier?', function() {
        pizzaPrestige(true);
      });
    }
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
    // Estimate accumulated coins using cycle-based math (matches backend)
    var lastT = pizzaData.shop.lastCollectedAt;
    var elapsed = 0;
    if (lastT) {
      var ts = lastT.includes('T') || lastT.includes('Z') ? new Date(lastT).getTime() : new Date(lastT.replace(' ', 'T') + 'Z').getTime();
      elapsed = Math.max(0, Math.min((Date.now() - ts) / 1000, 28800)); // cap at 8h like backend
    }
    var cycleTime = pizzaData.shop.cycleTime || 5;
    var incomePerCycle = pizzaData.shop.incomePerCycle || 0;
    var deliveryBonus = pizzaData.shop.deliveryBonus || 1;
    var cyclesCompleted = Math.floor(elapsed / cycleTime);
    var accumulated = Math.floor(incomePerCycle * cyclesCompleted * deliveryBonus);
    btn.textContent = 'Collect: ' + formatNumber(Math.floor(accumulated)) + ' pizza XP';
  }, 1000);
}

async function pizzaCollect() {
  var btn = document.getElementById('pizza-collect-btn');
  // Capture the displayed amount from the button before making the API call
  var displayedAmount = 0;
  if (btn && btn.textContent) {
    var match = btn.textContent.match(/Collect:\s*([\d,\.]+(?:[kMB]+)?)/i);
    if (match) {
      displayedAmount = parseFloat(match[1].replace(/,/g, ''));
      // Handle k/M/B suffixes
      var suffix = match[1].slice(-1).toLowerCase();
      if (suffix === 'k') displayedAmount *= 1000;
      else if (suffix === 'm' || suffix === 'b') displayedAmount *= (suffix === 'm' ? 1000000 : 1000000000);
      displayedAmount = Math.floor(displayedAmount);
    }
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Collecting...'; }
  try {
    var r = await fetch('/api/me/pizza/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    var data = await r.json();
    if (data.ok) {
      // Use the displayed amount in the toast to match what user saw on the button
      var toastAmount = displayedAmount > 0 ? displayedAmount : data.collected;
      var msg = '+' + formatNumber(toastAmount) + ' pizza XP';
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

async function pizzaPrestige(skipConfirm) {
  if (!skipConfirm && !confirm('Are you sure you want to prestige? This will reset your shop level, XP, pizza XP, and all upgrades.')) return;
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
  switchToTab('businesses');
  if (window.Empire) window.Empire.open('newspaper');
}

async function loadNewspaperRoute() {
  try {
    const r = await fetch('/api/me/newspaper');
    const data = await r.json();
    newspaperData = data;
    newspaperLoaded = true;
    renderNewspaperRoute();
    if (newspaperData.route) {
      maybePromptPrestige('newspaper', newspaperData.route.routeLevel, newspaperData.route.prestigeLevel, 'Your Newspaper Route reached Level 100. Prestige now to move to the next tier?', function() {
        newspaperPrestige(true);
      });
    }
  } catch {
    document.getElementById('newspaper-container').innerHTML =
      '<div class="news-no-route"><div class="news-no-route-emoji">&#x26A0;&#xFE0F;</div>' +
      '<div class="news-no-route-title">Could not load Newspaper Route</div>' +
      '<div class="news-no-route-desc">Game server may be offline. Try again later.</div></div>';
  }
}

function renderNewspaperNoRoute() {
  var c = document.getElementById('newspaper-container');
  if (!c) return;
  c.innerHTML =
    '<div class="news-no-route">' +
    '<div class="news-no-route-emoji">&#x1F5DE;&#xFE0F;</div>' +
    '<div class="news-no-route-title">Newspaper Route Not Unlocked</div>' +
    '<div class="news-no-route-desc">Purchase the Newspaper Route business from the Businesses tab to start your paper delivery empire!</div>' +
    '</div>';
}

function renderNewspaperRoute() {
  var c = document.getElementById('newspaper-container');
  if (!c || !newspaperData) return;

  if (!newspaperData.ok || !newspaperData.hasRoute) {
    // Auto-initialize route if user owns the business but hasn't initialized yet
    if (newspaperData.ok && !newspaperData.hasRoute && !newspaperData._initAttempted) {
      newspaperData._initAttempted = true;
      c.innerHTML = '<div class="news-no-route"><div class="news-no-route-emoji">&#x23F3;</div><div class="news-no-route-title">Setting up your route...</div></div>';
      fetch('/api/me/newspaper/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(function(r) { return r.json(); })
        .then(function(d) { if (d.ok) { loadNewspaperRoute(); } else { renderNewspaperNoRoute(); } })
        .catch(function() { renderNewspaperNoRoute(); });
      return;
    }
    renderNewspaperNoRoute();
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
  // Capture the displayed amount from the button before making the API call
  var displayedAmount = 0;
  if (btn && btn.textContent) {
    var match = btn.textContent.match(/Collect:\s*([\d,\.]+(?:[kMB]+)?)/i);
    if (match) {
      displayedAmount = parseFloat(match[1].replace(/,/g, ''));
      // Handle k/M/B suffixes
      var suffix = match[1].slice(-1).toLowerCase();
      if (suffix === 'k') displayedAmount *= 1000;
      else if (suffix === 'm' || suffix === 'b') displayedAmount *= (suffix === 'm' ? 1000000 : 1000000000);
      displayedAmount = Math.floor(displayedAmount);
    }
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Collecting...'; }
  try {
    var r = await fetch('/api/me/newspaper/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    var data = await r.json();
    if (data.ok) {
      // Use the displayed amount in the toast to match what user saw on the button
      var toastAmount = displayedAmount > 0 ? displayedAmount : data.collected;
      showToast('+' + formatNumber(toastAmount) + ' XP collected!' + (data.capped ? ' (Cap reached)' : ''), 'success');
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

async function newspaperPrestige(skipConfirm) {
  if (!skipConfirm && !confirm('Are you sure you want to prestige? This will reset your route level and all upgrades.')) return;
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

// ==================== GYM + CINEMA ====================

var gymData = null;
var gymSubTab = 'upgrades';
var gymCollectTimer = null;
var cinemaData = null;
var cinemaSubTab = 'upgrades';
var cinemaCollectTimer = null;
var startupData = null;
var startupSubTab = 'upgrades';
var startupCollectTimer = null;
var bankData = null;
var bankSubTab = 'upgrades';
var bankCollectTimer = null;

var managedBizUi = {
  gym: {
    endpoint: 'gym',
    hasKey: 'hasGym',
    stateKey: 'gym',
    containerId: 'gym-container',
    emoji: '&#x1F3CB;&#xFE0F;',
    title: 'Gym',
    buttonLabel: 'Manage Gym',
    primaryTotalKey: 'totalMembersTrained',
    primaryTotalLabel: 'Members Trained',
    levelKey: 'gymLevel',
    xpKey: 'gymXp',
    nameKey: 'gymName',
    totalXpKey: 'totalXpEarned',
    emptyTitle: 'Gym Not Unlocked',
    emptyDesc: 'Purchase the Gym business from the Businesses tab to build your training empire!',
    setupTitle: 'Setting up your gym...',
    collectLabel: 'Collect',
    collectNote: 'Pays real XP directly',
    prestigeLabel: 'Prestige advances your gym tier and resets gym level plus upgrades.',
    renamePlaceholder: 'Gym name...',
    currentMetricLabel: 'XP/member',
    viz: function(data) {
      var u = data.upgrades || {};
      var classes = 1 + Math.floor((u.classes || 0) / 6);
      var trainers = 1 + Math.floor((u.trainers || 0) / 5);
      var stations = 2 + Math.floor((u.equipment || 0) / 4);
      var cardio = 1 + Math.floor((u.cardio || 0) / 7);
      return '' +
        '<div class="managed-viz-grid">' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F3CB;&#xFE0F;</span><strong>' + stations + '</strong><span>Stations</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F4AA;</span><strong>' + trainers + '</strong><span>Trainers</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F9D8;</span><strong>' + classes + '</strong><span>Classes</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F3C3;</span><strong>' + cardio + '</strong><span>Cardio Zones</span></div>' +
        '</div>';
    }
  },
  cinema: {
    endpoint: 'cinema',
    hasKey: 'hasCinema',
    stateKey: 'cinema',
    containerId: 'cinema-container',
    emoji: '&#x1F39E;&#xFE0F;',
    title: 'Movie Theater',
    buttonLabel: 'Manage Theater',
    primaryTotalKey: 'totalViewersServed',
    primaryTotalLabel: 'Viewers Served',
    levelKey: 'cinemaLevel',
    xpKey: 'cinemaXp',
    nameKey: 'cinemaName',
    totalXpKey: 'totalXpEarned',
    emptyTitle: 'Movie Theater Not Unlocked',
    emptyDesc: 'Purchase the Movie Theater business from the Businesses tab to start your premiere run!',
    setupTitle: 'Setting up your theater...',
    collectLabel: 'Collect',
    collectNote: 'Pays real XP directly',
    prestigeLabel: 'Prestige advances your theater tier and resets theater level plus upgrades.',
    renamePlaceholder: 'Theater name...',
    currentMetricLabel: 'XP/show',
    viz: function(data) {
      var u = data.upgrades || {};
      var screens = 1 + Math.floor((u.screens || 0) / 5);
      var projectors = 1 + Math.floor((u.projectors || 0) / 6);
      var seats = 2 + Math.floor((u.seating || 0) / 4);
      var concessions = 1 + Math.floor((u.concessions || 0) / 7);
      return '' +
        '<div class="managed-viz-grid">' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F39E;&#xFE0F;</span><strong>' + screens + '</strong><span>Screens</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F4FD;&#xFE0F;</span><strong>' + projectors + '</strong><span>Projectors</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1FA91;</span><strong>' + seats + '</strong><span>Seating Blocks</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F37F;</span><strong>' + concessions + '</strong><span>Snack Stands</span></div>' +
        '</div>';
    }
  },
  startup: {
    endpoint: 'startup',
    hasKey: 'hasStartup',
    stateKey: 'startup',
    containerId: 'startup-container',
    emoji: '&#x1F680;',
    title: 'Tech Startup',
    buttonLabel: 'Manage Startup',
    primaryTotalKey: 'totalUsersServed',
    primaryTotalLabel: 'Users Served',
    levelKey: 'startupLevel',
    xpKey: 'startupXp',
    nameKey: 'startupName',
    totalXpKey: 'totalXpEarned',
    emptyTitle: 'Tech Startup Not Unlocked',
    emptyDesc: 'Purchase the Tech Startup business from the Businesses tab to build your tech empire!',
    setupTitle: 'Setting up your startup...',
    collectLabel: 'Collect',
    collectNote: 'Pays real XP directly',
    prestigeLabel: 'Prestige advances your startup tier and resets startup level plus upgrades.',
    renamePlaceholder: 'Startup name...',
    currentMetricLabel: 'XP/launch',
    viz: function(data) {
      var u = data.upgrades || {};
      var engineers = 1 + Math.floor((u.engineers || 0) / 5);
      var automation = 1 + Math.floor((u.automation || 0) / 6);
      var investors = 1 + Math.floor((u.investors || 0) / 4);
      var marketing = 1 + Math.floor((u.marketing || 0) / 7);
      return '' +
        '<div class="managed-viz-grid">' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F9D1;&#x200D;&#x1F4BB;</span><strong>' + engineers + '</strong><span>Engineers</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F916;</span><strong>' + automation + '</strong><span>Automation</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F4B0;</span><strong>' + investors + '</strong><span>Investors</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F4C8;</span><strong>' + marketing + '</strong><span>Marketing</span></div>' +
        '</div>';
    }
  },
  bank: {
    endpoint: 'bank',
    hasKey: 'hasBank',
    stateKey: 'bank',
    containerId: 'bank-container',
    emoji: '&#x1F3E6;',
    title: 'Bank',
    buttonLabel: 'Manage Bank',
    primaryTotalKey: 'totalClientsServed',
    primaryTotalLabel: 'Clients Served',
    levelKey: 'bankLevel',
    xpKey: 'bankXp',
    nameKey: 'bankName',
    totalXpKey: 'totalXpEarned',
    emptyTitle: 'Bank Not Unlocked',
    emptyDesc: 'Purchase the Bank business from the Businesses tab to build your financial institution!',
    setupTitle: 'Setting up your bank...',
    collectLabel: 'Collect',
    collectNote: 'Pays real XP directly',
    prestigeLabel: 'Prestige advances your bank tier and resets bank level plus upgrades.',
    renamePlaceholder: 'Bank name...',
    currentMetricLabel: 'XP/transaction',
    viz: function(data) {
      var u = data.upgrades || {};
      var branches = 1 + Math.floor((u.branches || 0) / 5);
      var systems = 1 + Math.floor((u.systems || 0) / 6);
      var privateBanking = 1 + Math.floor((u.private_banking || 0) / 4);
      var security = 1 + Math.floor((u.security || 0) / 7);
      return '' +
        '<div class="managed-viz-grid">' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F3E6;</span><strong>' + branches + '</strong><span>Branches</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F4BE;</span><strong>' + systems + '</strong><span>Core Systems</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F4BC;</span><strong>' + privateBanking + '</strong><span>Private Banking</span></div>' +
          '<div class="managed-viz-tile"><span class="managed-viz-emoji">&#x1F512;</span><strong>' + security + '</strong><span>Security</span></div>' +
        '</div>';
    }
  }
};

function getManagedBizState(type) {
  if (type === 'gym') return gymData;
  if (type === 'cinema') return cinemaData;
  if (type === 'startup') return startupData;
  if (type === 'bank') return bankData;
  return null;
}

function setManagedBizState(type, data) {
  if (type === 'gym') gymData = data;
  else if (type === 'cinema') cinemaData = data;
  else if (type === 'startup') startupData = data;
  else if (type === 'bank') bankData = data;
}

function getManagedSubTab(type) {
  if (type === 'gym') return gymSubTab;
  if (type === 'cinema') return cinemaSubTab;
  if (type === 'startup') return startupSubTab;
  if (type === 'bank') return bankSubTab;
  return 'upgrades';
}

function setManagedSubTab(type, tab) {
  if (type === 'gym') gymSubTab = tab;
  else if (type === 'cinema') cinemaSubTab = tab;
  else if (type === 'startup') startupSubTab = tab;
  else if (type === 'bank') bankSubTab = tab;
}

function clearManagedCollectTimer(type) {
  var timer = type === 'gym' ? gymCollectTimer
    : type === 'cinema' ? cinemaCollectTimer
    : type === 'startup' ? startupCollectTimer
    : bankCollectTimer;
  if (timer) clearInterval(timer);
  if (type === 'gym') gymCollectTimer = null;
  else if (type === 'cinema') cinemaCollectTimer = null;
  else if (type === 'startup') startupCollectTimer = null;
  else if (type === 'bank') bankCollectTimer = null;
}

function setManagedCollectTimer(type, timer) {
  clearManagedCollectTimer(type);
  if (type === 'gym') gymCollectTimer = timer;
  else if (type === 'cinema') cinemaCollectTimer = timer;
  else if (type === 'startup') startupCollectTimer = timer;
  else if (type === 'bank') bankCollectTimer = timer;
}

function openGymClub() {
  switchToTab('businesses');
  if (window.Empire) window.Empire.open('gym');
}

function openCinemaTheater() {
  switchToTab('businesses');
  if (window.Empire) window.Empire.open('cinema');
}

function openStartupHub() {
  switchToTab('businesses');
  if (window.Empire) window.Empire.open('startup');
}

function openBankVault() {
  switchToTab('businesses');
  if (window.Empire) window.Empire.open('bank');
}

async function loadGymClub() {
  return loadManagedBusiness('gym');
}

async function loadCinemaTheater() {
  return loadManagedBusiness('cinema');
}

async function loadStartupHub() {
  return loadManagedBusiness('startup');
}

async function loadBankVault() {
  return loadManagedBusiness('bank');
}

async function loadManagedBusiness(type) {
  var cfg = managedBizUi[type];
  var container = document.getElementById(cfg.containerId);
  if (!container) return;
  try {
    var r = await fetch('/api/me/' + cfg.endpoint);
    var data = await r.json();
    setManagedBizState(type, data);
    renderManagedBusiness(type);
    if (data && data[cfg.stateKey]) {
      maybePromptPrestige(type, data[cfg.stateKey][cfg.levelKey], data[cfg.stateKey].prestigeLevel, 'Your ' + cfg.title + ' reached Level 100. Prestige now to move to the next tier?', function() {
        managedPrestige(type, true);
      });
    }
  } catch {
    container.innerHTML =
      '<div class="managed-empty"><div class="managed-empty-emoji">&#x26A0;&#xFE0F;</div>' +
      '<div class="managed-empty-title">Could not load ' + escapeHtml(cfg.title) + '</div>' +
      '<div class="managed-empty-desc">Game server may be offline. Try again later.</div></div>';
  }
}

function renderManagedBusiness(type) {
  var cfg = managedBizUi[type];
  var data = getManagedBizState(type);
  var c = document.getElementById(cfg.containerId);
  if (!c || !data) return;

  if (!data.ok || !data[cfg.hasKey]) {
    if (data.ok && !data[cfg.hasKey] && !data._initAttempted) {
      data._initAttempted = true;
      c.innerHTML = '<div class="managed-empty"><div class="managed-empty-emoji">&#x23F3;</div><div class="managed-empty-title">' + escapeHtml(cfg.setupTitle) + '</div></div>';
      fetch('/api/me/' + cfg.endpoint + '/init', { method: 'POST', headers: { 'Content-Type': 'application/json' } })
        .then(function(r) { return r.json(); })
        .then(function(d) {
          if (d.ok) loadManagedBusiness(type);
          else renderManagedEmpty(type);
        })
        .catch(function() { renderManagedEmpty(type); });
      return;
    }
    renderManagedEmpty(type);
    return;
  }

  var state = data[cfg.stateKey];
  var prestige = state.prestigeLevel || 0;
  var theme = (data.customizations && data.customizations.theme) || 'classic';
  var subTab = getManagedSubTab(type);
  var pendingXp = (data.pending && data.pending.xpEarned) || 0;
  var collectCap = data.collectCap || 0;
  var capPct = collectCap > 0 ? Math.min(100, Math.floor((pendingXp / collectCap) * 100)) : 0;
  var isCapped = collectCap > 0 && pendingXp >= collectCap;
  var xpPct = state.xpNeeded > 0 ? Math.min(100, Math.floor((state[cfg.xpKey] / state.xpNeeded) * 100)) : 0;
  var html = '';

  c.setAttribute('data-theme', theme);
  c.setAttribute('data-prestige', String(prestige));

  html += '<div class="managed-hero managed-hero--' + type + '"><div class="managed-hero-bg"></div><div class="managed-hero-content">';
  html += '<h2 class="managed-hero-title">' + cfg.emoji + ' ' + escapeHtml(state[cfg.nameKey]) + '</h2>';
  html += '<p class="managed-hero-sub">' + escapeHtml(state.prestigeTier) + ' &bull; ' + state.prestigeMultiplier + 'x income multiplier</p>';
  html += '<div class="managed-hero-stats">';
  html += '<div class="managed-hero-stat"><strong>Lv.' + state[cfg.levelKey] + '</strong>Business Level</div>';
  html += '<div class="managed-hero-stat"><strong>' + formatNumber(state[cfg.primaryTotalKey] || 0) + '</strong>' + cfg.primaryTotalLabel + '</div>';
  html += '<div class="managed-hero-stat"><strong>' + formatNumber(state[cfg.totalXpKey] || 0) + '</strong>Total XP Earned</div>';
  html += '<div class="managed-hero-stat"><strong>' + formatNumber(Math.floor(data.playerCoins || 0)) + '</strong>Your XP</div>';
  html += '</div>';
  html += '<div class="managed-level-bar"><div class="managed-level-fill" style="width:' + xpPct + '%"></div>';
  html += '<div class="managed-level-text">Lv.' + state[cfg.levelKey] + ' &mdash; ' + formatNumber(state[cfg.xpKey] || 0) + ' / ' + formatNumber(state.xpNeeded || 0) + ' business XP</div></div>';
  html += '</div></div>';

  html += '<div class="managed-income-panel">';
  html += '<div class="managed-income-copy"><div class="managed-income-line">Earning <span class="managed-income-val">' + formatIncome(state.incomePerSecond || 0) + ' XP/sec</span></div>';
  html += '<div class="managed-income-note">' + escapeHtml(cfg.collectNote) + '</div></div>';
  html += '<button class="managed-collect-btn' + (isCapped ? ' managed-collect-btn-capped' : '') + '" id="' + type + '-collect-btn" onclick="managedCollect(\'' + type + '\')">' + cfg.collectLabel + ': ' + formatNumber(Math.floor(pendingXp)) + ' XP</button>';
  html += '<div class="managed-cap-bar"><div class="managed-cap-fill' + (isCapped ? ' capped' : '') + '" id="' + type + '-cap-fill" style="width:' + capPct + '%"></div>';
  html += '<div class="managed-cap-text" id="' + type + '-cap-text">' + formatNumber(Math.floor(pendingXp)) + ' / ' + formatNumber(collectCap) + ' XP cap' + (isCapped ? ' (FULL!)' : '') + '</div></div>';
  html += '</div>';

  html += '<div class="managed-viz managed-viz--' + type + '">' + cfg.viz(data) + '</div>';

  html += '<div class="managed-sub-tabs">';
  html += '<button class="managed-sub-tab' + (subTab === 'upgrades' ? ' active' : '') + '" onclick="switchManagedSubTab(\'' + type + '\',\'upgrades\')">&#x1F527; Upgrades</button>';
  html += '<button class="managed-sub-tab' + (subTab === 'prestige' ? ' active' : '') + '" onclick="switchManagedSubTab(\'' + type + '\',\'prestige\')">&#x2B50; Prestige</button>';
  html += '<button class="managed-sub-tab' + (subTab === 'customize' ? ' active' : '') + '" onclick="switchManagedSubTab(\'' + type + '\',\'customize\')">&#x1F3A8; Customize</button>';
  html += '<button class="managed-sub-tab' + (subTab === 'stats' ? ' active' : '') + '" onclick="switchManagedSubTab(\'' + type + '\',\'stats\')">&#x1F4CA; Stats</button>';
  html += '</div>';

  if (subTab === 'upgrades') html += renderManagedUpgrades(type);
  else if (subTab === 'prestige') html += renderManagedPrestige(type);
  else if (subTab === 'customize') html += renderManagedCustomize(type);
  else html += renderManagedStats(type);

  c.innerHTML = html;
  startManagedCollectTimer(type);
}

function renderManagedEmpty(type) {
  var cfg = managedBizUi[type];
  var c = document.getElementById(cfg.containerId);
  if (!c) return;
  c.innerHTML =
    '<div class="managed-empty">' +
    '<div class="managed-empty-emoji">' + cfg.emoji + '</div>' +
    '<div class="managed-empty-title">' + escapeHtml(cfg.emptyTitle) + '</div>' +
    '<div class="managed-empty-desc">' + escapeHtml(cfg.emptyDesc) + '</div>' +
    '</div>';
}

function renderManagedUpgrades(type) {
  var data = getManagedBizState(type);
  if (!data || !data.availableUpgrades) return '';
  var html = '<div class="managed-upgrade-grid">';
  var playerCoins = data.playerCoins || 0;
  Object.keys(data.availableUpgrades).forEach(function(key) {
    var def = data.availableUpgrades[key];
    var pct = Math.floor((def.currentLevel / def.maxLevel) * 100);
    var preview = def.effectPreview || {};
    var maxBuy = def.maxBuy || { levels: 0 };
    html += '<div class="managed-upgrade-card' + (def.maxed ? ' maxed' : '') + '">';
    html += '<div class="managed-upgrade-header"><span class="managed-upgrade-emoji">' + def.emoji + '</span><span class="managed-upgrade-name">' + escapeHtml(def.name) + '</span><span class="managed-upgrade-level">Lv.' + def.currentLevel + '/' + def.maxLevel + '</span></div>';
    html += '<div class="managed-upgrade-progress"><div class="managed-upgrade-progress-fill" style="width:' + pct + '%"></div></div>';
    html += '<div class="managed-upgrade-desc">' + escapeHtml(def.desc) + '</div>';
    if (preview.current) {
      html += '<div class="managed-upgrade-effect-preview"><span class="managed-effect-current">' + escapeHtml(preview.current) + '</span>';
      if (preview.next && !def.maxed) html += '<span class="managed-effect-arrow">&rarr;</span><span class="managed-effect-next">' + escapeHtml(preview.next) + '</span>';
      html += '</div>';
    }
    if (def.maxed) {
      html += '<div class="managed-upgrade-btns"><button class="managed-upgrade-btn maxed-btn" disabled>MAX LEVEL</button></div>';
    } else {
      html += '<div class="managed-upgrade-btns">';
      html += '<button class="managed-upgrade-btn managed-buy-one" onclick="managedUpgrade(\'' + type + '\',\'' + key + '\')"' + (playerCoins >= def.cost ? '' : ' disabled') + '>+1 &bull; ' + formatNumber(def.cost) + ' XP</button>';
      html += '<button class="managed-upgrade-btn managed-buy-max" onclick="managedUpgradeMax(\'' + type + '\',\'' + key + '\')"' + (maxBuy.levels > 0 ? '' : ' disabled') + '>MAX' + (maxBuy.levels > 0 ? ' (+' + maxBuy.levels + ')' : '') + '</button>';
      html += '</div>';
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function renderManagedPrestige(type) {
  var cfg = managedBizUi[type];
  var data = getManagedBizState(type);
  var state = data && data[cfg.stateKey];
  if (!state) return '';
  var canPrestige = (state[cfg.levelKey] || 0) >= 100;
  var html = '<div class="managed-prestige-panel">';
  html += '<div class="managed-prestige-header"><span class="managed-prestige-tier">' + escapeHtml(state.prestigeTier) + '</span><span class="managed-prestige-mult">' + state.prestigeMultiplier + 'x income</span></div>';
  html += '<div class="managed-prestige-copy">' + escapeHtml(cfg.prestigeLabel) + '</div>';
  html += '<div class="managed-prestige-cap">Current collect cap: ' + formatNumber(data.collectCap || 0) + ' XP</div>';
  html += '<div class="managed-prestige-action">';
  if (canPrestige) {
    html += '<button class="managed-prestige-btn" onclick="managedPrestige(\'' + type + '\')">Prestige Now</button>';
    html += '<div class="managed-prestige-note">&#x2728; Level 100 reached. Ready for the next tier.</div>';
  } else {
    html += '<button class="managed-prestige-btn" disabled>Prestige (Lv.100 required)</button>';
    html += '<div class="managed-prestige-note">Reach level 100 to prestige (' + state[cfg.levelKey] + '/100).</div>';
  }
  html += '</div></div>';
  return html;
}

function renderManagedCustomize(type) {
  var cfg = managedBizUi[type];
  var data = getManagedBizState(type);
  var state = data && data[cfg.stateKey];
  if (!state) return '';
  var customizations = data.customizations || {};
  var html = '<div class="managed-name-input-row">';
  html += '<input class="managed-name-input" id="' + type + '-name-input" maxlength="24" placeholder="' + escapeHtml(cfg.renamePlaceholder) + '" value="' + escapeHtml(state[cfg.nameKey]) + '">';
  html += '<button class="managed-name-btn" onclick="managedRename(\'' + type + '\')">Rename</button></div>';
  html += '<div class="managed-customize-panel">';
  Object.keys(data.availableCustomizations || {}).forEach(function(cat) {
    var catDef = data.availableCustomizations[cat];
    var currentVal = customizations[cat] || catDef.default;
    html += '<div class="managed-customize-group"><div class="managed-customize-group-title">' + escapeHtml(catDef.name) + '</div><div class="managed-customize-options">';
    catDef.options.forEach(function(opt) {
      html += '<div class="managed-customize-option' + (opt.id === currentVal ? ' selected' : '') + (opt.locked ? ' locked' : '') + '"' + (opt.locked ? '' : ' onclick="managedCustomize(\'' + type + '\',\'' + cat + '\',\'' + opt.id + '\')"') + '>';
      html += escapeHtml(opt.name);
      if (opt.locked) html += '<span class="managed-customize-lock">&#x1F512; Prestige ' + opt.minPrestige + '</span>';
      if (opt.id === currentVal) html += '<span class="managed-customize-check">&#x2714;</span>';
      html += '</div>';
    });
    html += '</div></div>';
  });
  html += '</div>';
  return html;
}

function renderManagedStats(type) {
  var cfg = managedBizUi[type];
  var data = getManagedBizState(type);
  var state = data && data[cfg.stateKey];
  if (!state) return '';
  var totalUpgradeLevels = 0;
  Object.keys(data.upgrades || {}).forEach(function(key) { totalUpgradeLevels += data.upgrades[key] || 0; });
  var html = '<div class="managed-stats-panel"><div class="managed-stats-grid">';
  html += '<div class="managed-stat-item"><span class="managed-stat-value">' + formatNumber(state[cfg.primaryTotalKey] || 0) + '</span><span class="managed-stat-label">' + cfg.primaryTotalLabel + '</span></div>';
  html += '<div class="managed-stat-item"><span class="managed-stat-value">' + formatNumber(state[cfg.totalXpKey] || 0) + '</span><span class="managed-stat-label">Total XP Earned</span></div>';
  html += '<div class="managed-stat-item"><span class="managed-stat-value">Lv.' + state[cfg.levelKey] + '</span><span class="managed-stat-label">Business Level</span></div>';
  html += '<div class="managed-stat-item"><span class="managed-stat-value">' + state.prestigeLevel + '</span><span class="managed-stat-label">Prestige Level</span></div>';
  html += '<div class="managed-stat-item"><span class="managed-stat-value">' + state.prestigeMultiplier + 'x</span><span class="managed-stat-label">Income Multiplier</span></div>';
  html += '<div class="managed-stat-item"><span class="managed-stat-value">' + totalUpgradeLevels + '</span><span class="managed-stat-label">Total Upgrade Levels</span></div>';
  html += '<div class="managed-stat-item"><span class="managed-stat-value">' + formatIncome(state.incomePerSecond || 0) + '</span><span class="managed-stat-label">XP/sec</span></div>';
  html += '<div class="managed-stat-item"><span class="managed-stat-value">' + formatNumber(Math.floor(data.playerCoins || 0)) + '</span><span class="managed-stat-label">Your XP</span></div>';
  html += '</div></div>';
  return html;
}

function switchManagedSubTab(type, tab) {
  setManagedSubTab(type, tab);
  renderManagedBusiness(type);
}

function startManagedCollectTimer(type) {
  clearManagedCollectTimer(type);
  var timer = setInterval(function() {
    var cfg = managedBizUi[type];
    var data = getManagedBizState(type);
    if (!data || !data[cfg.hasKey]) return;
    var state = data[cfg.stateKey];
    var btn = document.getElementById(type + '-collect-btn');
    if (!btn) { clearManagedCollectTimer(type); return; }
    var elapsed = 0;
    if (state.lastCollectedAt) {
      var ts = state.lastCollectedAt.includes('T') || state.lastCollectedAt.includes('Z')
        ? new Date(state.lastCollectedAt).getTime()
        : new Date(state.lastCollectedAt.replace(' ', 'T') + 'Z').getTime();
      elapsed = Math.max(0, (Date.now() - ts) / 1000);
    }
    var accumulated = Math.floor((state.incomePerSecond || 0) * elapsed);
    var collectCap = data.collectCap || 0;
    var isCapped = collectCap > 0 && accumulated >= collectCap;
    if (isCapped) accumulated = collectCap;
    btn.textContent = managedBizUi[type].collectLabel + ': ' + formatNumber(accumulated) + ' XP';
    btn.classList.toggle('managed-collect-btn-capped', isCapped);
    var capFill = document.getElementById(type + '-cap-fill');
    var capText = document.getElementById(type + '-cap-text');
    if (capFill && collectCap > 0) {
      var pct = Math.min(100, Math.floor((accumulated / collectCap) * 100));
      capFill.style.width = pct + '%';
      capFill.classList.toggle('capped', isCapped);
    }
    if (capText) capText.textContent = formatNumber(accumulated) + ' / ' + formatNumber(collectCap) + ' XP cap' + (isCapped ? ' (FULL!)' : '');
  }, 1000);
  setManagedCollectTimer(type, timer);
}

async function managedCollect(type) {
  var btn = document.getElementById(type + '-collect-btn');
  if (btn) { btn.disabled = true; btn.textContent = 'Collecting...'; }
  try {
    var r = await fetch('/api/me/' + type + '/collect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    var data = await r.json();
    if (data.ok) {
      showToast('+' + formatNumber(data.collected || 0) + ' XP collected' + (data.capped ? ' (cap reached)' : '') + '!', 'success');
      if (profile && profile.profile) {
        profile.profile.coins = data.newBalance;
        var heroCoins = document.getElementById('ov-hero-coin-val');
        if (heroCoins) heroCoins.textContent = formatNumber(data.newBalance);
      }
      if (typeof loadProfile === 'function') loadProfile();
      loadManagedBusiness(type);
    } else {
      showToast(data.message || 'Failed to collect', 'error');
    }
  } catch {
    showToast('Failed to collect income', 'error');
  }
  if (btn) btn.disabled = false;
}

async function managedUpgrade(type, upgradeType) {
  await managedUpgradeRequest(type, 'upgrade', { upgradeType: upgradeType });
}

async function managedUpgradeMax(type, upgradeType) {
  await managedUpgradeRequest(type, 'upgrade-max', { upgradeType: upgradeType });
}

async function managedUpgradeRequest(type, action, body) {
  try {
    var r = await fetch('/api/me/' + type + '/' + action, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    var data = await r.json();
    if (data.ok) {
      showToast(data.message || 'Updated', 'success');
      if (profile && profile.profile && data.playerCoins !== undefined) {
        profile.profile.coins = data.playerCoins;
        var heroCoins = document.getElementById('ov-hero-coin-val');
        if (heroCoins) heroCoins.textContent = formatNumber(data.playerCoins);
      }
      if (typeof loadProfile === 'function') loadProfile();
      loadManagedBusiness(type);
    } else {
      showToast(data.message || 'Update failed', 'error');
    }
  } catch {
    showToast('Update failed', 'error');
  }
}

async function managedPrestige(type, skipConfirm) {
  if (!skipConfirm && !confirm('Are you sure you want to prestige? This will reset your business level and upgrades.')) return;
  try {
    var r = await fetch('/api/me/' + type + '/prestige', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    var data = await r.json();
    if (data.ok) {
      showToast(data.message || 'Prestige complete', 'success');
      if (typeof loadProfile === 'function') loadProfile();
      loadManagedBusiness(type);
    } else {
      showToast(data.message || 'Prestige failed', 'error');
    }
  } catch {
    showToast('Prestige failed', 'error');
  }
}

async function managedCustomize(type, category, value) {
  try {
    var r = await fetch('/api/me/' + type + '/customize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category: category, value: value })
    });
    var data = await r.json();
    if (data.ok) {
      showToast('Customization updated!', 'success');
      var state = getManagedBizState(type);
      if (state && state.customizations) state.customizations[category] = value;
      renderManagedBusiness(type);
    } else {
      showToast(data.message || 'Customization failed', 'error');
    }
  } catch {
    showToast('Customization failed', 'error');
  }
}

async function managedRename(type) {
  var input = document.getElementById(type + '-name-input');
  if (!input) return;
  var name = input.value.trim();
  if (!name) { showToast('Enter a name', 'error'); return; }
  try {
    var r = await fetch('/api/me/' + type + '/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    });
    var data = await r.json();
    if (data.ok) {
      showToast((managedBizUi[type].title || 'Business') + ' renamed!', 'success');
      var state = getManagedBizState(type);
      if (state && state[managedBizUi[type].stateKey]) {
        state[managedBizUi[type].stateKey][managedBizUi[type].nameKey] = data[managedBizUi[type].nameKey] || name;
      }
      renderManagedBusiness(type);
    } else {
      showToast(data.message || 'Rename failed', 'error');
    }
  } catch {
    showToast('Rename failed', 'error');
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
  switchToTab('library');
}

function openEmpireView() {
  switchToTab('businesses');
}

function showEmpireSplitToast() {
  var container = document.getElementById('toast-container');
  if (!container) return;
  var toast = document.createElement('div');
  toast.className = 'toast toast-info empire-split-toast';
  toast.innerHTML = '<strong>Your Empire has a new home!</strong><br>Businesses now open in TycoonIO. Use the Library tab or your Profile to jump there anytime.';
  container.appendChild(toast);
  setTimeout(function() {
    toast.classList.add('toast-out');
    toast.addEventListener('animationend', function() { toast.remove(); });
  }, 8000);
}

function renderEmpireSummary() {
  if (!profile) return;
  var businesses = profile.businesses || [];
  var owned = businesses.filter(function(b) { return b.owned && b.business_type !== 'library'; });
  // Profile rail card
  var profCard = document.getElementById('prof-empire-card');
  if (profCard) {
    if (owned.length === 0) {
      profCard.style.display = 'none';
    } else {
      var totalIncome = 0;
      var inc = profile.income;
      if (inc) {
        totalIncome = (inc.bizIncome || 0) + (inc.pizzaIncome || 0) + (inc.newsIncome || 0) +
          (inc.gymIncome || 0) + (inc.cinemaIncome || 0) + (inc.startupIncome || 0) +
          (inc.bankIncome || 0);
      }
      document.getElementById('prof-empire-biz-count').textContent = owned.length;
      document.getElementById('prof-empire-income').textContent = totalIncome.toFixed(1);
      profCard.style.display = '';
    }
  }
  // Library tab CTA card
  var libCta = document.getElementById('lib-empire-cta');
  if (libCta) {
    if (owned.length === 0) {
      libCta.style.display = 'none';
    } else {
      var totalInc = 0;
      var i = profile.income;
      if (i) {
        totalInc = (i.bizIncome || 0) + (i.pizzaIncome || 0) + (i.newsIncome || 0) +
          (i.gymIncome || 0) + (i.cinemaIncome || 0) + (i.startupIncome || 0) +
          (i.bankIncome || 0);
      }
      var statsEl = document.getElementById('lib-empire-cta-stats');
      if (statsEl) statsEl.textContent = owned.length + ' businesses \u2022 ' + totalInc.toFixed(1) + ' dollars/sec';
      libCta.style.display = '';
    }
  }
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
      <button class="lib-tab" onclick="switchLibrarySubTab(\'scoring\',this)">Scoring</button>\
    </div>\
    <div id="lib-content"></div>\
  ';
  renderLibraryWords();
}

function switchLibrarySubTab(tab, btn) {
  document.querySelectorAll('.lib-tab').forEach(function(b) { b.classList.remove('active'); });
  if (btn) btn.classList.add('active');
  if (tab === 'words') renderLibraryWords();
  else if (tab === 'scoring') renderLibraryScoring();
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

// ─── Scoring Sub-Tab ─────────────────────────────────────────────────
var _letterRarityCache = null;

function renderLibraryScoring() {
  var el = document.getElementById('lib-content');
  el.innerHTML = '<div class="lib-scoring-loading">Loading scoring data...</div>';

  if (_letterRarityCache) { _renderScoringContent(_letterRarityCache); return; }
  fetch('/api/word-bank/letter-rarity').then(function(r) { return r.json(); }).then(function(data) {
    _letterRarityCache = data;
    _renderScoringContent(data);
  }).catch(function() {
    el.innerHTML = '<div class="lib-empty">Failed to load scoring data.</div>';
  });
}

function _renderScoringContent(data) {
  var TIER_COLORS = {
    trivial: '#6b7280', common: '#9ca3af', uncommon: '#22c55e', rare: '#3b82f6',
    epic: '#a855f7', legendary: '#f97316', mythic: '#ef4444', unique: '#eab308'
  };
  var TIER_ORDER = ['trivial','common','uncommon','rare','epic','legendary','mythic','unique'];

  var html = '';

  // --- How It Works ---
  html += '<div class="lib-scoring-section">';
  html += '<h3 class="lib-scoring-heading">How Scoring Works</h3>';
  html += '<div class="lib-scoring-explainer">';
  html += '<p>Every word you find earns <strong>points</strong> and <strong>coins</strong>. Your total is calculated from three layers:</p>';
  html += '<div class="lib-scoring-formula">';
  html += '<span class="lib-formula-part">Word Rarity Base</span>';
  html += '<span class="lib-formula-op">+</span>';
  html += '<span class="lib-formula-part">Letter Rarity Bonus</span>';
  html += '<span class="lib-formula-op">+</span>';
  html += '<span class="lib-formula-part">Word Length Bonus</span>';
  html += '<span class="lib-formula-op">=</span>';
  html += '<span class="lib-formula-result">Total Points &amp; Coins</span>';
  html += '</div>';
  html += '</div></div>';

  // --- Word Rarity Tiers ---
  html += '<div class="lib-scoring-section">';
  html += '<h3 class="lib-scoring-heading">Word Rarity Tiers</h3>';
  html += '<p class="lib-scoring-desc">Base points determined by how common the word is in English.</p>';
  html += '<table class="lib-scoring-table"><thead><tr><th>Word Type</th><th>Description</th><th>Base Points</th></tr></thead><tbody>';
  var wordTiers = [
    ['Common', 'Frequently used, well-known words', '500'],
    ['Rare', 'Less common, harder-to-find words', '1,000'],
    ['Ultra Rare', 'No frequency data &mdash; hidden bonus words', '1,500'],
    ['3-Letter', 'Short words (3 characters)', '100']
  ];
  for (var w = 0; w < wordTiers.length; w++) {
    html += '<tr><td><strong>' + wordTiers[w][0] + '</strong></td><td>' + wordTiers[w][1] + '</td><td class="lib-scoring-pts">' + wordTiers[w][2] + '</td></tr>';
  }
  html += '</tbody></table></div>';

  // --- Letter Rarity Tiers ---
  html += '<div class="lib-scoring-section">';
  html += '<h3 class="lib-scoring-heading">Letter Rarity Tiers</h3>';
  html += '<p class="lib-scoring-desc">Each letter in your word adds a bonus based on how rare it is in English. Duplicate letters each count.</p>';
  html += '<table class="lib-scoring-table lib-scoring-table-letters"><thead><tr><th>Tier</th><th>Bonus</th><th>Letters</th></tr></thead><tbody>';

  for (var t = 0; t < TIER_ORDER.length; t++) {
    var tierName = TIER_ORDER[t];
    var tierData = data.tiers[tierName];
    if (!tierData) continue;
    var color = TIER_COLORS[tierName] || '#888';
    var letters = tierData.letters || [];
    var lettersHtml = '';
    for (var li = 0; li < letters.length; li++) {
      lettersHtml += '<span class="lib-letter-chip" style="border-color:' + color + '">' + letters[li].toUpperCase() + '</span>';
    }
    html += '<tr>';
    html += '<td><span class="lib-tier-badge" style="background:' + color + '">' + tierName.charAt(0).toUpperCase() + tierName.slice(1) + '</span></td>';
    html += '<td class="lib-scoring-pts">' + (tierData.bonus > 0 ? '+' + tierData.bonus : '0') + '</td>';
    html += '<td class="lib-tier-letters-cell">' + lettersHtml + '</td>';
    html += '</tr>';
  }
  html += '</tbody></table></div>';

  // --- Word Length Bonus ---
  html += '<div class="lib-scoring-section">';
  html += '<h3 class="lib-scoring-heading">Word Length Bonus</h3>';
  html += '<p class="lib-scoring-desc">Longer words earn an exponential bonus. 3-letter words are exempt.</p>';
  html += '<table class="lib-scoring-table"><thead><tr><th>Length</th><th>Bonus</th></tr></thead><tbody>';
  var lengthBonuses = [[3,'0 (exempt)'],[4,'+75'],[5,'+150'],[6,'+300'],[7,'+500'],[8,'+800'],[9,'+1,200'],[10,'+1,750'],[11,'+2,500'],['12+','+3,500']];
  for (var lb = 0; lb < lengthBonuses.length; lb++) {
    html += '<tr><td>' + lengthBonuses[lb][0] + ' letters</td><td class="lib-scoring-pts">' + lengthBonuses[lb][1] + '</td></tr>';
  }
  html += '</tbody></table></div>';

  // --- Example Breakdown ---
  html += '<div class="lib-scoring-section">';
  html += '<h3 class="lib-scoring-heading">Example: &ldquo;JAZZ&rdquo;</h3>';
  html += '<div class="lib-scoring-example">';
  html += '<div class="lib-example-row lib-example-base"><span class="lib-example-label">Word Base (Common)</span><span class="lib-example-val">500</span></div>';
  var exLetters = [
    {l:'J', tier:'mythic', bonus:180},
    {l:'A', tier:'common', bonus:0},
    {l:'Z', tier:'unique', bonus:300},
    {l:'Z', tier:'unique', bonus:300}
  ];
  for (var e = 0; e < exLetters.length; e++) {
    var ex = exLetters[e];
    var ec = TIER_COLORS[ex.tier] || '#888';
    html += '<div class="lib-example-row"><span class="lib-example-label">';
    html += '<span class="lib-letter-chip" style="border-color:' + ec + '">' + ex.l + '</span> ';
    html += '<span class="lib-tier-badge lib-tier-badge-sm" style="background:' + ec + '">' + ex.tier.charAt(0).toUpperCase() + ex.tier.slice(1) + '</span>';
    html += '</span><span class="lib-example-val">+' + ex.bonus + '</span></div>';
  }
  html += '<div class="lib-example-row lib-example-base"><span class="lib-example-label">Length Bonus (4 letters)</span><span class="lib-example-val">+75</span></div>';
  html += '<div class="lib-example-row lib-example-total"><span class="lib-example-label">Total</span><span class="lib-example-val">1,355</span></div>';
  html += '</div></div>';

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

// ─── Friends Tab ─────────────────────────────────────────────────────

var friendsLoaded = false;
var friendsSearchTimeout = null;

function initFriendsTab() {
  // Add Friend button opens modal
  var addBtn = document.getElementById('friends-add-btn');
  if (addBtn) addBtn.addEventListener('click', openFriendSearchModal);

  // Close modals
  var searchClose = document.getElementById('friend-search-close');
  if (searchClose) searchClose.addEventListener('click', closeFriendSearchModal);
  var profileClose = document.getElementById('friend-profile-close');
  if (profileClose) profileClose.addEventListener('click', closeFriendProfileModal);

  // Search input
  var searchInput = document.getElementById('friend-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      clearTimeout(friendsSearchTimeout);
      var q = this.value.trim();
      if (q.length < 2) {
        document.getElementById('friend-search-results').innerHTML = '<div class="friends-empty">Type at least 2 characters</div>';
        return;
      }
      friendsSearchTimeout = setTimeout(function() { searchFriends(q); }, 400);
    });
  }

  // Close modals on backdrop click
  var searchModal = document.getElementById('friend-search-modal');
  if (searchModal) searchModal.addEventListener('click', function(e) {
    if (e.target === searchModal) closeFriendSearchModal();
  });
  var profileModal = document.getElementById('friend-profile-modal');
  if (profileModal) profileModal.addEventListener('click', function(e) {
    if (e.target === profileModal) closeFriendProfileModal();
  });
}

async function loadFriends() {
  if (!friendsLoaded) {
    initFriendsTab();
    friendsLoaded = true;
  }
  try {
    var res = await fetch('/api/me/friends', { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load friends');
    var data = await res.json();
    var friends = data.friends || [];
    var pending = data.pending || [];

    // Update count badge
    document.getElementById('friends-count-badge').textContent = friends.length;

    // Render pending requests
    var pendingSection = document.getElementById('friends-pending-section');
    var pendingList = document.getElementById('friends-pending-list');
    if (pending.length > 0) {
      pendingSection.style.display = '';
      document.getElementById('pending-count').textContent = pending.length;
      pendingList.innerHTML = pending.map(function(r) {
        return renderPendingCard(r);
      }).join('');
    } else {
      pendingSection.style.display = 'none';
      pendingList.innerHTML = '';
    }

    // Render friends list
    var friendsList = document.getElementById('friends-list');
    if (friends.length === 0) {
      friendsList.innerHTML = '<div class="friends-empty">No friends yet. Click "Add Friend" to find people!</div>';
    } else {
      friendsList.innerHTML = friends.map(function(f) {
        return renderFriendCard(f);
      }).join('');
    }
  } catch (err) {
    console.error('loadFriends error:', err);
    document.getElementById('friends-list').innerHTML = '<div class="friends-empty">Failed to load friends</div>';
  }
}

function renderFriendCard(f) {
  var name = escapeHtml(f.displayName || f.username || 'Unknown');
  var coins = formatNumber(f.coins || 0);
  var wins = formatNumber(f.totalWins || 0);
  var pfp = f.avatar || f.profilePic || '';
  var pfpHtml = '<img class="friend-pfp" src="' + escapeHtml(resolveAvatar(pfp)) + '" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'' + AVATAR_FALLBACK + '\'">';
  return '<div class="friend-card">' +
    '<div class="friend-card-left">' + pfpHtml + '</div>' +
    '<div class="friend-card-info">' +
      '<div class="friend-card-name">' + name + '</div>' +
      '<div class="friend-card-stats"><span class="friend-stat-coins">' + coins + ' coins</span> &middot; <span>' + wins + ' wins</span></div>' +
    '</div>' +
    '<div class="friend-card-actions">' +
      '<button class="friend-btn friend-btn-view" onclick="viewFriendProfile(\'' + escapeHtml(f.discordId || '') + '\')">View Profile</button>' +
      '<button class="friend-btn friend-btn-remove" onclick="removeFriend(\'' + escapeHtml(f.discordId || '') + '\')">Remove</button>' +
    '</div>' +
  '</div>';
}

function renderPendingCard(r) {
  var name = escapeHtml(r.displayName || r.username || 'Unknown');
  var coins = formatNumber(r.coins || 0);
  var pfp = r.avatar || r.profilePic || '';
  var pfpHtml = '<img class="friend-pfp" src="' + escapeHtml(resolveAvatar(pfp)) + '" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'' + AVATAR_FALLBACK + '\'">';
  return '<div class="friend-card friend-card-pending">' +
    '<div class="friend-card-left">' + pfpHtml + '</div>' +
    '<div class="friend-card-info">' +
      '<div class="friend-card-name">' + name + '</div>' +
      '<div class="friend-card-stats"><span class="friend-stat-coins">' + coins + ' coins</span></div>' +
    '</div>' +
    '<div class="friend-card-actions">' +
      '<button class="friend-btn friend-btn-accept" onclick="acceptFriendRequest(\'' + escapeHtml(r.requestId || '') + '\')">Accept</button>' +
      '<button class="friend-btn friend-btn-decline" onclick="declineFriendRequest(\'' + escapeHtml(r.requestId || '') + '\')">Decline</button>' +
    '</div>' +
  '</div>';
}

function openFriendSearchModal() {
  var modal = document.getElementById('friend-search-modal');
  modal.style.display = 'flex';
  document.getElementById('friend-search-input').value = '';
  document.getElementById('friend-search-results').innerHTML = '<div class="friends-empty">Type a name to search</div>';
  setTimeout(function() { document.getElementById('friend-search-input').focus(); }, 100);
}

function closeFriendSearchModal() {
  document.getElementById('friend-search-modal').style.display = 'none';
}

function closeFriendProfileModal() {
  document.getElementById('friend-profile-modal').style.display = 'none';
}

async function searchFriends(query) {
  var resultsEl = document.getElementById('friend-search-results');
  resultsEl.innerHTML = '<div class="friends-empty">Searching...</div>';
  try {
    var res = await fetch('/api/me/friends/search?q=' + encodeURIComponent(query), { credentials: 'include' });
    if (!res.ok) throw new Error('Search failed');
    var data = await res.json();
    var results = data.results || [];
    if (results.length === 0) {
      resultsEl.innerHTML = '<div class="friends-empty">No users found</div>';
      return;
    }
    resultsEl.innerHTML = results.map(function(u) {
      return renderSearchResultCard(u);
    }).join('');
  } catch (err) {
    console.error('searchFriends error:', err);
    resultsEl.innerHTML = '<div class="friends-empty">Search failed</div>';
  }
}

function renderSearchResultCard(u) {
  var name = escapeHtml(u.displayName || u.username || 'Unknown');
  var coins = formatNumber(u.coins || 0);
  var pfp = u.avatar || u.profilePic || '';
  var status = u.friendStatus || 'none'; // 'friends', 'pending_sent', 'pending_received', 'none'
  var pfpHtml = '<img class="friend-pfp" src="' + escapeHtml(resolveAvatar(pfp)) + '" alt="" loading="lazy" onerror="this.onerror=null;this.src=\'' + AVATAR_FALLBACK + '\'">';

  var actionHtml = '';
  if (status === 'friends') {
    actionHtml = '<span class="friend-status-badge friend-status-friends">Already Friends</span>';
  } else if (status === 'pending_sent') {
    actionHtml = '<span class="friend-status-badge friend-status-pending">Request Sent</span>';
  } else if (status === 'pending_received') {
    actionHtml = '<span class="friend-status-badge friend-status-pending">Accept Request</span>';
  } else {
    actionHtml = '<button class="friend-btn friend-btn-add" onclick="sendFriendRequest(\'' + escapeHtml(u.discordId || '') + '\', this)">Send Request</button>';
  }

  return '<div class="friend-card">' +
    '<div class="friend-card-left">' + pfpHtml + '</div>' +
    '<div class="friend-card-info">' +
      '<div class="friend-card-name">' + name + '</div>' +
      '<div class="friend-card-stats"><span class="friend-stat-coins">' + coins + ' coins</span></div>' +
    '</div>' +
    '<div class="friend-card-actions">' + actionHtml + '</div>' +
  '</div>';
}

async function sendFriendRequest(targetDiscordId, btn) {
  if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
  try {
    var res = await fetch('/api/me/friends/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ targetDiscordId: targetDiscordId })
    });
    if (!res.ok) {
      var err = await res.json().catch(function() { return {}; });
      throw new Error(err.error || 'Failed to send request');
    }
    if (btn) {
      btn.textContent = 'Sent!';
      btn.classList.add('friend-btn-sent');
    }
  } catch (err) {
    console.error('sendFriendRequest error:', err);
    if (btn) { btn.disabled = false; btn.textContent = 'Send Request'; }
    alert(err.message || 'Failed to send friend request');
  }
}

async function acceptFriendRequest(requestId) {
  try {
    var res = await fetch('/api/me/friends/accept', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ requestId: requestId })
    });
    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to accept');
    loadFriends();
  } catch (err) {
    console.error('acceptFriendRequest error:', err);
    alert(err.message || 'Failed to accept friend request');
  }
}

async function declineFriendRequest(requestId) {
  try {
    var res = await fetch('/api/me/friends/decline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ requestId: requestId })
    });
    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to decline');
    loadFriends();
  } catch (err) {
    console.error('declineFriendRequest error:', err);
    alert(err.message || 'Failed to decline friend request');
  }
}

async function removeFriend(friendDiscordId) {
  if (!confirm('Remove this friend?')) return;
  try {
    var res = await fetch('/api/me/friends/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ friendDiscordId: friendDiscordId })
    });
    var data = await res.json();
    if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to remove');
    loadFriends();
  } catch (err) {
    console.error('removeFriend error:', err);
    alert(err.message || 'Failed to remove friend');
  }
}

async function viewFriendProfile(discordId) {
  var modal = document.getElementById('friend-profile-modal');
  var youSide = document.querySelector('#friend-profile-you .friend-profile-card');
  var themSide = document.querySelector('#friend-profile-them .friend-profile-card');
  youSide.innerHTML = '<div class="friends-empty">Loading...</div>';
  themSide.innerHTML = '<div class="friends-empty">Loading...</div>';
  modal.style.display = 'flex';

  try {
    var res = await fetch('/api/me/friends/profile/' + encodeURIComponent(discordId), { credentials: 'include' });
    if (!res.ok) throw new Error('Failed to load profile');
    var data = await res.json();

    youSide.innerHTML = renderProfileSide(data.you || {});
    themSide.innerHTML = renderProfileSide(data.friend || {});
  } catch (err) {
    console.error('viewFriendProfile error:', err);
    youSide.innerHTML = '<div class="friends-empty">Failed to load profile</div>';
    themSide.innerHTML = '<div class="friends-empty">Failed to load profile</div>';
  }
}

function renderProfileSide(p) {
  var name = escapeHtml(p.displayName || p.username || 'Unknown');
  var pfp = p.avatar || p.profilePic || '';
  var pfpHtml = '<img class="friend-profile-pfp" src="' + escapeHtml(resolveAvatar(pfp)) + '" alt="" onerror="this.onerror=null;this.src=\'' + AVATAR_FALLBACK + '\'">';
  var gameLabels = {
    searchle: 'Searchle',
    wordle: 'Wordle',
    word500: 'Word5000',
    betwixt: 'Betwixt',
    'spelling-bee': 'Spelling Bee',
    spellingbee: 'Spelling Bee',
    pixeletters: 'PixeLetters',
    rectangled: 'recTangled',
    figural: 'Figural',
    unwordle: 'UnWordle',
    sproutle: 'erecTangled'
  };
  function renderChallengeSection(title, challengeData, emptyText) {
    var completions = challengeData && Array.isArray(challengeData.completions) ? challengeData.completions : [];
    var html = '<div class="friend-profile-challenges"><div class="friend-profile-section-title">' + escapeHtml(title) + '</div>';
    if (!completions.length) {
      html += '<div class="friend-profile-empty">' + escapeHtml(emptyText) + '</div></div>';
      return html;
    }
    html += '<div class="friend-profile-challenge-list">';
    completions.forEach(function(entry) {
      var label = gameLabels[entry.game] || entry.game;
      html += '<span class="friend-profile-challenge-chip">' + escapeHtml(label) + '</span>';
    });
    html += '</div></div>';
    return html;
  }

  var html = '<div class="friend-profile-header">' + pfpHtml +
    '<div class="friend-profile-name">' + name + '</div></div>';

  html += '<div class="friend-profile-stats">';
  html += '<div class="friend-profile-stat"><span class="friend-profile-stat-label">Coins</span><span class="friend-profile-stat-value friend-stat-coins">' + formatNumber(p.coins || 0) + '</span></div>';
  html += '<div class="friend-profile-stat"><span class="friend-profile-stat-label">Total Taps</span><span class="friend-profile-stat-value">' + formatNumber(p.totalTaps || 0) + '</span></div>';
  html += '<div class="friend-profile-stat"><span class="friend-profile-stat-label">Library Words</span><span class="friend-profile-stat-value">' + formatNumber(p.libraryWords || 0) + '</span></div>';

  // Game wins breakdown
  var wins = p.gameWins || {};
  var gameNames = ['searchle', 'wordle', 'word500', 'betwixt', 'spellingbee', 'pixeletters', 'rectangled', 'figural', 'unwordle'];
  gameNames.forEach(function(g) {
    var w = wins[g] || 0;
    if (w > 0) {
      html += '<div class="friend-profile-stat"><span class="friend-profile-stat-label">' + (gameLabels[g] || g) + ' Wins</span><span class="friend-profile-stat-value">' + formatNumber(w) + '</span></div>';
    }
  });
  html += '</div>';

  html += renderChallengeSection('Daily Puzzles', p.dailyChallenges, 'No daily puzzles completed yet.');
  html += renderChallengeSection('Weekly Puzzles', p.weeklyChallenges, 'No weekly puzzles completed yet.');

  // Equipped cosmetics
  var equipped = p.equipped || {};
  var cosmeticKeys = Object.keys(equipped);
  if (cosmeticKeys.length > 0) {
    html += '<div class="friend-profile-cosmetics"><div class="friend-profile-stat-label" style="margin-bottom:6px">Equipped Cosmetics</div>';
    cosmeticKeys.forEach(function(cat) {
      var c = equipped[cat];
      var label = CATEGORY_LABELS[cat] || cat;
      var cName = escapeHtml(c.name || c.id || 'Unknown');
      html += '<div class="friend-cosmetic-row"><span class="friend-cosmetic-cat">' + escapeHtml(label) + ':</span> <span class="friend-cosmetic-name">' + cName + '</span></div>';
    });
    html += '</div>';
  }

  return html;
}
