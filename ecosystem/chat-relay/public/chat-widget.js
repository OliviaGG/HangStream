(function() {
'use strict';

// ─── OBS Overlay: skip chat widget entirely ──────────────────────────────
var _cwgParams = new URLSearchParams(window.location.search);
var _cwgPath = window.location.pathname;
if (_cwgParams.has('transparent') || _cwgParams.has('overlay') || _cwgParams.has('obs') || _cwgParams.has('embedGame') || _cwgParams.has('streamer_self') || _cwgPath.endsWith('/index.html') || _cwgPath.endsWith('/index.html/') || _cwgPath.endsWith('/overlay.html') || /^\/game\/[^/]+\/?$/.test(_cwgPath)) return;

// ─── Cosmetic FX assets (shared keyframes + ambient particle engine) ─────
try {
  var _cwgSelf = document.currentScript && document.currentScript.src;
  var _cwgBase = _cwgSelf ? _cwgSelf.replace(/\/chat-widget\.js.*$/, '') : '';
  if (!document.querySelector('link[href*="cosmetics-fx.css"]')) {
    var _cwgL = document.createElement('link');
    _cwgL.rel = 'stylesheet';
    _cwgL.href = _cwgBase + '/css/cosmetics-fx.css?v=3';
    document.head.appendChild(_cwgL);
  }
  if (!window.AmbientFx && !document.querySelector('script[src*="ambient-fx.js"]')) {
    var _cwgS = document.createElement('script');
    _cwgS.src = _cwgBase + '/js/ambient-fx.js?v=3';
    document.head.appendChild(_cwgS);
  }
  if (!window.PfpCosmetics && !document.querySelector('script[src*="pfp-cosmetics.js"]')) {
    var _cwgP = document.createElement('script');
    _cwgP.src = _cwgBase + '/js/pfp-cosmetics.js?v=15';
    document.head.appendChild(_cwgP);
  }
} catch (_) {}

// ─── Constants ────────────────────────────────────────────────────────────
var ROOM_MAP = [
  { pattern: /\/wordle-multi\/|\/game\/wordle\//, room: 'wordle', label: 'Wordle' },
  { pattern: /\/searchle\/|\/game\/searchle\//, room: 'searchle', label: 'Subtextle' },
  { pattern: /\/spellingbee-multi\/|\/game\/spellingbee\//, room: 'spellingbee', label: 'Spelling Bee' },
  { pattern: /\/pixeletters-multi\/|\/game\/pixeletters\//, room: 'pixeletters', label: 'PixeLetters' },
  { pattern: /\/word500-multi\/|\/game\/word500\//, room: 'word500', label: 'Word5000' },
  { pattern: /\/betwixt-multi\/|\/game\/betwixt\//, room: 'betwixt', label: 'Betwixt' },
  { pattern: /\/rectangled-multi\/|\/game\/rectangled\//, room: 'rectangled', label: 'RecTangled' },
  { pattern: /\/figural\/|\/game\/figural\//, room: 'figural', label: 'Figural' }
];
var PLATFORM_COLORS = { tiktok:'#ee1d52', youtube:'#ff0000', discord:'#5865F2', mobile:'#a78bfa', system:'#888' };
var MAX_MESSAGES = 200;
var SEND_COOLDOWN = 500;
var PREFS_KEY = 'wordtycoon_chat_prefs';
var MIN_WIDTH = 300;
var MAX_WIDTH = 700;
var DEFAULT_WIDTH = 420;
var MIN_HEIGHT = 250;
var DEFAULT_HEIGHT_PCT = 75; // percent of viewport

// ─── State ────────────────────────────────────────────────────────────────
var currentUser = null;
var chatSocket = null;
var activeRoom = 'main';
var detectedGame = null;
// 'main' = the site-only Lobby (chat-room system, moderated, 12h history).
// 'feed' = the live relay firehose (TikTok/YouTube/Discord + game guesses),
// fed by the global 'chat-message' broadcast — a window into the stream.
var FEED_ROOM = 'feed';
var rooms = { main: [], feed: [] };
var unread = {};
var sendCooldown = false;
var isOpen = false;
var panelWidth = DEFAULT_WIDTH;
var panelHeight = 0; // px, computed on init

var prefs = {
  open: false, panelWidth: DEFAULT_WIDTH, panelHeight: 0,
  activeRoom: 'main', fontSize: 14,
  showAvatars: true, showTimestamps: false, showCosmetics: true,
  hideGuesses: false,
  mutedUsers: []
};

// ─── Mobile detection (JS-based, works even without viewport meta) ───
var isMobile = (function() {
  var screenW = Math.min(window.screen.width, window.screen.height);
  var hasTouchOnly = ('ontouchstart' in window) && window.matchMedia('(pointer: coarse)').matches;
  return screenW <= 600 || (hasTouchOnly && screenW <= 900);
})();

// ─── Detect game room ────────────────────────────────────────────────────
var urlPath = window.location.pathname;
for (var i = 0; i < ROOM_MAP.length; i++) {
  if (ROOM_MAP[i].pattern.test(urlPath)) {
    detectedGame = ROOM_MAP[i];
    activeRoom = detectedGame.room;
    rooms[detectedGame.room] = [];
    break;
  }
}

// ─── Load prefs ──────────────────────────────────────────────────────────
function loadPrefs() {
  try {
    var saved = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (saved) {
      for (var k in saved) { if (prefs.hasOwnProperty(k)) prefs[k] = saved[k]; }
    }
  } catch(e) {}
  panelWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, prefs.panelWidth || DEFAULT_WIDTH));
  // Height: use saved value or default to 75% of viewport
  var maxH = window.innerHeight;
  var defaultH = Math.round(maxH * DEFAULT_HEIGHT_PCT / 100);
  panelHeight = prefs.panelHeight > 0 ? Math.max(MIN_HEIGHT, Math.min(maxH, prefs.panelHeight)) : defaultH;
  if (detectedGame) {
    activeRoom = (prefs.activeRoom === 'main' || prefs.activeRoom === FEED_ROOM)
      ? prefs.activeRoom : detectedGame.room;
  } else {
    activeRoom = prefs.activeRoom === FEED_ROOM ? FEED_ROOM : 'main';
  }
}
function savePrefs() {
  prefs.panelWidth = panelWidth;
  prefs.panelHeight = panelHeight;
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch(e) {}
}
loadPrefs();

// ─── CSS ──────────────────────────────────────────────────────────────────
var style = document.createElement('style');
style.textContent = [
/* Toon skin: cream card, ink outlines, slab shadows — matches toon.css
   without requiring it (the widget also rides on non-toon pages). The
   night block mirrors WTToon's body.night flip. */
':root{--cwg-ink:#1b1430;--cwg-card:#ffffff;--cwg-paper2:#f7ecd6;--cwg-hover:#f3ecdd;--cwg-text:#1b1430;--cwg-text-dim:#6f6486;--cwg-amber:#ffab00;--cwg-amber-hi:#ffd84d;--cwg-red:#ff6b6b;}',
'body.night{--cwg-card:#221f4a;--cwg-paper2:#1c1a3e;--cwg-hover:#2b2757;--cwg-text:#f2edff;--cwg-text-dim:#a79fc8;}',

// Side panel — anchored bottom-right, adjustable width & height
'#cwg-panel{position:fixed;bottom:0;right:0;z-index:10000;display:flex;flex-direction:column;background:var(--cwg-card);border-left:2.5px solid var(--cwg-ink);border-top:2.5px solid var(--cwg-ink);border-radius:18px 0 0 0;box-shadow:-6px -4px 0 rgba(27,20,48,.18);font-family:"Segoe UI",system-ui,-apple-system,sans-serif;color:var(--cwg-text);transform:translateX(100%);transition:transform 0.25s cubic-bezier(.4,0,.2,1),background 1s ease;will-change:transform;}',
'#cwg-panel.cwg-open{transform:translateX(0);}',
'#cwg-panel.cwg-resizing{transition:none!important;}',

// Resize handle — left edge (width)
'#cwg-resize-left{position:absolute;top:0;left:-4px;width:8px;height:100%;cursor:ew-resize;z-index:2;}',
'#cwg-resize-left:hover,#cwg-resize-left:active{background:var(--cwg-amber);opacity:0.4;border-radius:4px;}',

// Resize handle — top edge (height)
'#cwg-resize-top{position:absolute;top:-4px;left:0;width:100%;height:8px;cursor:ns-resize;z-index:2;}',
'#cwg-resize-top:hover,#cwg-resize-top:active{background:var(--cwg-amber);opacity:0.4;border-radius:4px;}',

// Resize handle — top-left corner (both)
'#cwg-resize-corner{position:absolute;top:-6px;left:-6px;width:14px;height:14px;cursor:nwse-resize;z-index:3;border-radius:4px;}',
'#cwg-resize-corner:hover,#cwg-resize-corner:active{background:var(--cwg-amber);opacity:0.5;}',

// Toggle tab — right edge, low enough to clear the toon elevator rail
// (fixed at right:14px, vertically centered on desktop)
'#cwg-toggle{position:fixed;right:0;top:auto;bottom:110px;transform:none;z-index:10001;background:linear-gradient(180deg,var(--cwg-amber-hi) 0 45%,var(--cwg-amber) 45%);color:#3d2c00;border:2.5px solid var(--cwg-ink);border-right:none;cursor:pointer;padding:14px 7px;border-radius:12px 0 0 12px;box-shadow:-3px 3px 0 rgba(27,20,48,.35);font-family:"Segoe UI",system-ui,sans-serif;font-size:13px;font-weight:900;letter-spacing:2px;writing-mode:vertical-lr;text-orientation:mixed;line-height:1;transition:right 0.25s cubic-bezier(.4,0,.2,1),filter 0.15s;}',
'#cwg-toggle:hover{filter:brightness(1.05);}',
'#cwg-toggle .cwg-notif{display:block;width:9px;height:9px;border-radius:50%;background:var(--cwg-red);border:1.5px solid var(--cwg-ink);margin:8px auto 0;opacity:0;transition:opacity 0.2s;}',
'#cwg-toggle .cwg-notif.active{opacity:1;}',
'#cwg-new-bubble{position:fixed;right:36px;z-index:10001;background:var(--cwg-red);color:#fff;font-size:11px;font-weight:900;padding:4px 10px;border-radius:12px;border:2px solid var(--cwg-ink);pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity 0.2s,transform 0.2s;white-space:nowrap;font-family:"Segoe UI",system-ui,sans-serif;box-shadow:0 2px 0 var(--cwg-ink);}',
'#cwg-new-bubble.visible{opacity:1;transform:translateY(0);}',

// Header
'#cwg-header{display:flex;align-items:center;padding:10px 14px;background:var(--cwg-paper2);gap:8px;flex-shrink:0;border-bottom:2.5px solid var(--cwg-ink);border-radius:15px 0 0 0;transition:background 1s ease;}',
'.cwg-header-title{flex:1;font-size:15px;font-weight:900;letter-spacing:-.2px;}',
'.cwg-btn{background:none;border:none;color:var(--cwg-text-dim);cursor:pointer;font-size:15px;padding:4px 6px;line-height:1;border-radius:6px;}',
'.cwg-btn:hover{color:var(--cwg-text);background:var(--cwg-hover);}',

// Room tabs — toon chips
'#cwg-tabs{display:flex;gap:6px;padding:8px 12px;background:var(--cwg-paper2);border-bottom:2.5px solid var(--cwg-ink);flex-shrink:0;overflow-x:auto;scrollbar-width:none;transition:background 1s ease;}',
'#cwg-tabs::-webkit-scrollbar{display:none;}',
'.cwg-tab{padding:5px 13px;font-size:12px;font-weight:800;border:2px solid var(--cwg-ink);border-radius:999px;cursor:pointer;white-space:nowrap;color:var(--cwg-text);background:var(--cwg-card);box-shadow:0 2px 0 var(--cwg-ink);position:relative;transition:transform 0.1s,background 0.15s;font-family:inherit;}',
'.cwg-tab.active{background:linear-gradient(180deg,var(--cwg-amber-hi) 0 45%,var(--cwg-amber) 45%);color:#3d2c00;}',
'.cwg-tab:hover{transform:translateY(-1px);}',
'.cwg-tab-dot{position:absolute;top:-3px;right:-2px;width:9px;height:9px;border-radius:50%;background:var(--cwg-red);border:1.5px solid var(--cwg-ink);display:none;}',
'.cwg-tab.has-unread .cwg-tab-dot{display:block;}',

// Messages
'#cwg-messages{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:4px;min-height:0;scrollbar-width:thin;scrollbar-color:var(--cwg-text-dim) transparent;}',
'#cwg-messages::-webkit-scrollbar{width:5px;}',
'#cwg-messages::-webkit-scrollbar-thumb{background:var(--cwg-text-dim);border-radius:3px;}',
'.cwg-msg{display:flex;align-items:flex-start;gap:8px;padding:4px 6px;border-radius:10px;line-height:1.45;word-break:break-word;animation:cwgFade 0.15s ease;}',
'.cwg-msg:hover{background:var(--cwg-hover);}',
// Feed extras: platform chip + de-emphasized game guesses
'.cwg-plat{display:inline-block;padding:1px 6px;border-radius:6px;font-size:9px;font-weight:900;letter-spacing:.5px;color:#fff;margin-right:5px;vertical-align:1px;text-shadow:0 1px 0 rgba(0,0,0,.3);}',
'.cwg-msg.cwg-guess{opacity:.62;}',
'@keyframes cwgFade{from{opacity:0;transform:translateY(4px);}to{opacity:1;transform:none;}}',
/* position/z-index keep the face above the .pfpx-disc ring layer even when
   img.onerror swaps the <img> for the fallback span after the ring was applied */
'.cwg-avatar{width:100%;height:100%;border-radius:50%;flex-shrink:0;object-fit:cover;display:block;position:relative;z-index:1;}',
'.cwg-avatar-fb{width:100%;height:100%;border-radius:50%;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;position:relative;z-index:1;}',
'.cwg-avatar-wrap{position:relative;display:inline-block;flex-shrink:0;line-height:0;width:26px;height:26px;}',
'.cwg-avatar-wrap.has-fan-club-badge::after{content:"";position:absolute;top:auto;bottom:70%;right:-30%;width:60%;height:60%;background:url("https://wordtycoon.live/portal/assets/badges/tiktok-fanclub.png") center/contain no-repeat;pointer-events:none;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));z-index:2;}',
'.cwg-avatar-wrap.has-superfan-badge::after{content:"";position:absolute;top:auto;bottom:70%;right:-30%;width:74%;height:74%;background:url("https://wordtycoon.live/cosmetics/superfan-heart.png") center/contain no-repeat;pointer-events:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.55));z-index:2;}',
'.cwg-avatar-wrap.has-super-donor-badge::after{content:"";position:absolute;top:auto;bottom:70%;right:-30%;width:86%;height:86%;background:url("https://wordtycoon.live/cosmetics/superdonor-heart.png") center/contain no-repeat;pointer-events:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.55)) drop-shadow(0 0 4px rgba(110,227,74,0.5));z-index:2;}',
// Donor Class sits between Super Fan and Fan Club in both size and precedence.
// The relay only started emitting a 'donor' badge on 2026-08-03 — before that
// this tier was invisible in chat because the membership lives in Word
// Tycoon's player_memberships, not in a local flag.
'.cwg-avatar-wrap.has-donor-badge::after{content:"";position:absolute;top:auto;bottom:70%;right:-30%;width:66%;height:66%;background:url("https://wordtycoon.live/cosmetics/donorclass-heart.png") center/contain no-repeat;pointer-events:none;filter:drop-shadow(0 1px 3px rgba(0,0,0,0.55));z-index:2;}',
'.cwg-msg-body{min-width:0;}',
'.cwg-username{font-weight:800;font-size:inherit;margin-right:5px;cursor:context-menu;}',
'.cwg-msg-text{font-size:inherit;color:var(--cwg-text);}',
'.cwg-stream-tag{font-size:10px;color:var(--cwg-text-dim);margin-left:5px;font-style:italic;}',
'.cwg-room-tag{font-size:10px;color:var(--cwg-amber);margin-right:5px;font-weight:800;}',
'.cwg-time{font-size:10px;color:var(--cwg-text-dim);margin-left:auto;flex-shrink:0;padding-left:8px;display:none;}',
'.cwg-show-time .cwg-time{display:block;}',
'.cwg-system{font-size:12px;color:var(--cwg-text-dim);text-align:center;padding:6px;font-style:italic;font-weight:600;}',

// Input bar
'#cwg-input-bar{display:flex;gap:8px;padding:10px 12px;border-top:2.5px solid var(--cwg-ink);flex-shrink:0;align-items:center;background:var(--cwg-paper2);transition:background 1s ease;}',
'#cwg-input{flex:1;padding:9px 16px;background:var(--cwg-card);border:2px solid var(--cwg-ink);border-radius:999px;color:var(--cwg-text);font-size:14px;font-weight:600;outline:none;min-width:0;font-family:inherit;box-shadow:inset 0 2px 4px rgba(27,20,48,.14);transition:background 1s ease;}',
'#cwg-input:focus{box-shadow:inset 0 2px 4px rgba(27,20,48,.14),0 0 0 3px rgba(255,216,77,.55);}',
'#cwg-input::placeholder{color:var(--cwg-text-dim);font-weight:600;}',
'#cwg-send{width:36px;height:36px;border-radius:50%;background:linear-gradient(180deg,var(--cwg-amber-hi) 0 45%,var(--cwg-amber) 45%);border:2px solid var(--cwg-ink);color:#3d2c00;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 3px 0 var(--cwg-ink);transition:transform 0.1s,box-shadow 0.1s;}',
'#cwg-send:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 4px 0 var(--cwg-ink);}',
'#cwg-send:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 var(--cwg-ink);}',
'#cwg-send:disabled{opacity:0.4;cursor:default;}',

// Login bar — host slot only; the prompt itself comes from /login-prompt.js
'#cwg-login-bar{padding:10px;border-top:2.5px solid var(--cwg-ink);flex-shrink:0;display:flex;justify-content:center;background:var(--cwg-paper2);transition:background 1s ease;}',
'#cwg-login-bar .lp-card{width:100%;min-width:0;max-width:none;}',

// Settings
'#cwg-settings{display:none;padding:10px 14px;border-top:2.5px solid var(--cwg-ink);flex-shrink:0;gap:10px;flex-direction:column;background:var(--cwg-paper2);transition:background 1s ease;}',
'#cwg-settings.open{display:flex;}',
'.cwg-setting{display:flex;align-items:center;justify-content:space-between;font-size:13px;font-weight:700;color:var(--cwg-text-dim);}',
'.cwg-setting input[type=range]{width:90px;accent-color:var(--cwg-amber);}',
'.cwg-toggle-sw{position:relative;width:36px;height:20px;background:var(--cwg-card);border-radius:10px;cursor:pointer;transition:background 0.2s;border:2px solid var(--cwg-ink);padding:0;}',
'.cwg-toggle-sw.on{background:var(--cwg-amber);}',
'.cwg-toggle-sw::after{content:"";position:absolute;top:1px;left:1px;width:14px;height:14px;border-radius:50%;background:#fff;border:1.5px solid var(--cwg-ink);box-sizing:border-box;transition:left 0.2s;}',
'.cwg-toggle-sw.on::after{left:15px;}',
// Account section in settings
'#cwg-account-section{margin-top:4px;padding-top:8px;border-top:2px dashed rgba(27,20,48,.25);}',
'#cwg-account-info{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-size:13px;color:var(--cwg-text);}',
'#cwg-account-info img{width:22px;height:22px;border-radius:50%;border:1.5px solid var(--cwg-ink);}',
'#cwg-account-info .cwg-acct-name{font-weight:800;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
'#cwg-logout-btn{background:var(--cwg-card);border:2px solid var(--cwg-ink);color:#d94f4f;padding:4px 12px;border-radius:999px;cursor:pointer;font-size:11px;font-weight:800;box-shadow:0 2px 0 var(--cwg-ink);transition:all 0.15s;}',
'#cwg-logout-btn:hover{background:#ff6b6b;color:#fff;}',

// Context menu
'#cwg-ctx{position:fixed;z-index:10002;background:var(--cwg-card);border:2.5px solid var(--cwg-ink);border-radius:12px;padding:4px;box-shadow:0 4px 0 var(--cwg-ink);display:none;min-width:130px;}',
'.cwg-ctx-item{padding:8px 14px;font-size:13px;font-weight:700;cursor:pointer;border-radius:8px;color:var(--cwg-text);}',
'.cwg-ctx-item:hover{background:var(--cwg-hover);}',

// Mobile (CSS fallback — layout overrides only, JS handles width/zoom)
'@media(max-width:600px){',
'#cwg-panel{border-radius:16px 16px 0 0!important;border-right:none!important;border-left:none!important;max-width:none!important;}',
'#cwg-toggle.cwg-shifted{right:0!important;}',
'#cwg-toggle{padding:10px 5px;font-size:11px;}',
'#cwg-resize-left,#cwg-resize-top,#cwg-resize-corner{display:none!important;}',
'}',
// Mobile via JS class (for devices where CSS media query doesn't match, e.g. wide viewports)
'.cwg-mobile #cwg-panel{border-radius:16px 16px 0 0!important;border-right:none!important;border-left:none!important;max-width:none!important;}',
'.cwg-mobile #cwg-toggle.cwg-shifted{right:0!important;}',
'.cwg-mobile #cwg-toggle{padding:10px 5px;font-size:11px;}',
'.cwg-mobile #cwg-resize-left,.cwg-mobile #cwg-resize-top,.cwg-mobile #cwg-resize-corner{display:none!important;}'
].join('\n');
document.head.appendChild(style);

// ─── Escape HTML ──────────────────────────────────────────────────────────
function esc(s) {
  var d = document.createElement('div');
  d.textContent = s || '';
  return d.innerHTML;
}

// ─── Build DOM ────────────────────────────────────────────────────────────
var panel = document.createElement('div');
panel.id = 'cwg-panel';

// Resize handles
var resizeLeft = document.createElement('div');
resizeLeft.id = 'cwg-resize-left';
panel.appendChild(resizeLeft);

var resizeTop = document.createElement('div');
resizeTop.id = 'cwg-resize-top';
panel.appendChild(resizeTop);

var resizeCorner = document.createElement('div');
resizeCorner.id = 'cwg-resize-corner';
panel.appendChild(resizeCorner);

var header = document.createElement('div');
header.id = 'cwg-header';
header.innerHTML = '<span class="cwg-header-title">\uD83D\uDCAC Chat</span>' +
  '<button class="cwg-btn" id="cwg-settings-btn" title="Settings">\u2699</button>' +
  '<button class="cwg-btn" id="cwg-close-btn" title="Close">\u2715</button>';
panel.appendChild(header);

var tabsBar = document.createElement('div');
tabsBar.id = 'cwg-tabs';
panel.appendChild(tabsBar);

var msgContainer = document.createElement('div');
msgContainer.id = 'cwg-messages';
panel.appendChild(msgContainer);

var settingsPanel = document.createElement('div');
settingsPanel.id = 'cwg-settings';
settingsPanel.innerHTML = '<div class="cwg-setting"><span>Font size</span><input type="range" id="cwg-font-size" min="12" max="18" value="' + prefs.fontSize + '"></div>' +
  '<div class="cwg-setting"><span>Show avatars</span><button class="cwg-toggle-sw' + (prefs.showAvatars ? ' on' : '') + '" id="cwg-toggle-avatars"></button></div>' +
  '<div class="cwg-setting"><span>Timestamps</span><button class="cwg-toggle-sw' + (prefs.showTimestamps ? ' on' : '') + '" id="cwg-toggle-time"></button></div>' +
  '<div class="cwg-setting"><span>Cosmetics</span><button class="cwg-toggle-sw' + (prefs.showCosmetics ? ' on' : '') + '" id="cwg-toggle-cosmetics"></button></div>' +
  '<div class="cwg-setting"><span>Hide game guesses (Live Feed)</span><button class="cwg-toggle-sw' + (prefs.hideGuesses ? ' on' : '') + '" id="cwg-toggle-guesses"></button></div>' +
  '<div id="cwg-account-section" style="display:none;">' +
    '<div id="cwg-account-info"></div>' +
    '<div class="cwg-setting"><span>Stay logged in</span><button class="cwg-toggle-sw on" id="cwg-toggle-trust"></button></div>' +
    '<div style="text-align:right;margin-top:4px;"><button id="cwg-logout-btn">Log out</button></div>' +
  '</div>';
panel.appendChild(settingsPanel);

var inputBar = document.createElement('div');
inputBar.id = 'cwg-input-bar';
inputBar.style.display = 'none';
inputBar.innerHTML = '<input type="text" id="cwg-input" placeholder="Type a message..." maxlength="200" autocomplete="off">' +
  '<button id="cwg-send" title="Send">\u27A4</button>';
panel.appendChild(inputBar);

var loginBar = document.createElement('div');
loginBar.id = 'cwg-login-bar';
loginBar.style.display = 'none';
panel.appendChild(loginBar);

// LoginPrompt is loaded lazily \u2014 the chat widget runs synchronously and may
// execute before /login-prompt.js. ensureLoginPrompt() returns a promise that
// resolves once window.LoginPrompt is available (idempotent).
var _loginPromptPromise = null;
function ensureLoginPrompt() {
  if (window.LoginPrompt && window.LoginPrompt.create) return Promise.resolve();
  if (_loginPromptPromise) return _loginPromptPromise;
  _loginPromptPromise = new Promise(function (resolve) {
    var s = document.createElement('script');
    s.src = '/login-prompt.js?v=3';
    s.async = true;
    s.onload = function () { resolve(); };
    s.onerror = function () { _loginPromptPromise = null; resolve(); };
    document.head.appendChild(s);
  });
  return _loginPromptPromise;
}

function renderLoginPrompt() {
  ensureLoginPrompt().then(function () {
    if (!window.LoginPrompt || !window.LoginPrompt.create) return;
    if (loginBar.firstChild) return; // already rendered
    loginBar.appendChild(window.LoginPrompt.create({
      headline: 'Sign in to chat',
      returnTo: window.location.pathname + window.location.search
    }));
  });
}

// Toggle tab
var toggleTab = document.createElement('button');
toggleTab.id = 'cwg-toggle';
toggleTab.innerHTML = 'CHAT<span class="cwg-notif" id="cwg-notif-dot"></span>';

var newBubble = document.createElement('div');
newBubble.id = 'cwg-new-bubble';
newBubble.textContent = 'new';
var newBubbleTimer = null;

function showNewBubble() {
  if (isOpen) return;
  // Position above the toggle button
  var rect = toggleTab.getBoundingClientRect();
  newBubble.style.top = (rect.top - 28) + 'px';
  newBubble.classList.add('visible');
  clearTimeout(newBubbleTimer);
  newBubbleTimer = setTimeout(function() { newBubble.classList.remove('visible'); }, 3000);
}

function hideNewBubble() {
  newBubble.classList.remove('visible');
  clearTimeout(newBubbleTimer);
}

var ctxMenu = document.createElement('div');
ctxMenu.id = 'cwg-ctx';

function getGameScale() {
  var tf = document.documentElement.style.transform;
  if (tf) {
    var m = tf.match(/scale\(([^)]+)\)/);
    if (m) { var v = parseFloat(m[1]); if (v > 1.05) return v; }
  }
  return 1;
}

function applySize() {
  var gs = getGameScale();
  var cz = gs > 1 ? (1 / gs) : 1; // counter-zoom to negate html transform

  if (isMobile) {
    // Detect if viewport is wider than physical screen (some games override viewport)
    var physicalW = Math.min(window.screen.width, window.screen.height);
    var z = (physicalW > 0 && window.innerWidth > physicalW * 1.3) ? window.innerWidth / physicalW : 1;

    // Combine viewport-override zoom with game-scale counter-zoom
    var mz = z * cz;
    panel.style.zoom = mz !== 1 ? mz : '';
    toggleTab.style.zoom = mz !== 1 ? mz : '';

    // Width & height: divide by zoom so visual result = full width / half height
    panel.style.width = z > 1 ? (100 / z) + 'vw' : '100vw';
    panel.style.left = z > 1 ? '' : '0';
    panel.style.maxWidth = 'none';
    panel.style.height = z > 1 ? (50 / z) + 'vh' : '50vh';
    panel.style.borderRadius = '12px 12px 0 0';
    panel.style.borderRight = 'none';
    toggleTab.style.right = '0';
    resizeLeft.style.display = 'none';
    resizeTop.style.display = 'none';
    resizeCorner.style.display = 'none';
    return;
  }
  panel.style.left = '';
  panel.style.width = panelWidth + 'px';
  panel.style.maxWidth = '';
  panel.style.height = panelHeight + 'px';
  panel.style.borderRadius = '12px 0 0 0';
  panel.style.borderRight = '';
  panel.style.zoom = cz !== 1 ? cz : '';
  toggleTab.style.zoom = cz !== 1 ? cz : '';
  resizeLeft.style.display = '';
  resizeTop.style.display = '';
  resizeCorner.style.display = '';
  if (isOpen) {
    toggleTab.style.right = (panelWidth * cz) + 'px';
  }
}

function appendDom() {
  document.body.appendChild(panel);
  document.body.appendChild(toggleTab);
  document.body.appendChild(newBubble);
  document.body.appendChild(ctxMenu);
  applySize();
  applyFontSize();
  applyTimestampClass();
  window.addEventListener('resize', applySize);
  if (prefs.open) {
    openPanel();
  }
}

// ─── Panel open/close ────────────────────────────────────────────────────
function openPanel() {
  isOpen = true;
  prefs.open = true;
  hideNewBubble();
  applySize();
  panel.classList.add('cwg-open');
  toggleTab.classList.add('cwg-shifted');
  var gs = getGameScale();
  var cz = gs > 1 ? (1 / gs) : 1;
  toggleTab.style.right = isMobile ? '0' : ((panelWidth * cz) + 'px');
  unread = {};
  updateNotifDot();
  renderTabs();
  savePrefs();
  scrollToBottom();
}

function closePanel() {
  isOpen = false;
  prefs.open = false;
  panel.classList.remove('cwg-open');
  toggleTab.classList.remove('cwg-shifted');
  toggleTab.style.right = '0';
  savePrefs();
}

function togglePanel() {
  if (isOpen) closePanel();
  else openPanel();
}

function applyFontSize() {
  msgContainer.style.fontSize = prefs.fontSize + 'px';
}

function applyTimestampClass() {
  if (prefs.showTimestamps) msgContainer.classList.add('cwg-show-time');
  else msgContainer.classList.remove('cwg-show-time');
}

// ─── Resize: width (left edge) ──────────────────────────────────────────
function startResizeWidth(e) {
  e.preventDefault();
  e.stopPropagation();
  var startX = e.touches ? e.touches[0].clientX : e.clientX;
  var startW = panelWidth;
  panel.classList.add('cwg-resizing');

  function onMove(ev) {
    var cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
    var newW = startW + (startX - cx);
    newW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, newW));
    panelWidth = newW;
    applySize();
  }
  function onEnd() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    panel.classList.remove('cwg-resizing');
    savePrefs();
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}

resizeLeft.addEventListener('mousedown', startResizeWidth);
resizeLeft.addEventListener('touchstart', startResizeWidth, { passive: false });

// ─── Resize: height (top edge) ──────────────────────────────────────────
function startResizeHeight(e) {
  e.preventDefault();
  e.stopPropagation();
  var startY = e.touches ? e.touches[0].clientY : e.clientY;
  var startH = panelHeight;
  panel.classList.add('cwg-resizing');

  function onMove(ev) {
    var cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
    var newH = startH + (startY - cy);
    newH = Math.max(MIN_HEIGHT, Math.min(window.innerHeight, newH));
    panelHeight = newH;
    applySize();
  }
  function onEnd() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    panel.classList.remove('cwg-resizing');
    savePrefs();
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}

resizeTop.addEventListener('mousedown', startResizeHeight);
resizeTop.addEventListener('touchstart', startResizeHeight, { passive: false });

// ─── Resize: corner (both) ──────────────────────────────────────────────
function startResizeBoth(e) {
  e.preventDefault();
  e.stopPropagation();
  var startX = e.touches ? e.touches[0].clientX : e.clientX;
  var startY = e.touches ? e.touches[0].clientY : e.clientY;
  var startW = panelWidth;
  var startH = panelHeight;
  panel.classList.add('cwg-resizing');

  function onMove(ev) {
    var cx = ev.touches ? ev.touches[0].clientX : ev.clientX;
    var cy = ev.touches ? ev.touches[0].clientY : ev.clientY;
    panelWidth = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + (startX - cx)));
    panelHeight = Math.max(MIN_HEIGHT, Math.min(window.innerHeight, startH + (startY - cy)));
    applySize();
  }
  function onEnd() {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
    panel.classList.remove('cwg-resizing');
    savePrefs();
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
}

resizeCorner.addEventListener('mousedown', startResizeBoth);
resizeCorner.addEventListener('touchstart', startResizeBoth, { passive: false });

// ─── Notification dot ────────────────────────────────────────────────────
function updateNotifDot() {
  var total = 0;
  for (var r in unread) total += (unread[r] || 0);
  var dot = document.getElementById('cwg-notif-dot');
  if (dot) {
    if (total > 0) dot.classList.add('active');
    else dot.classList.remove('active');
  }
}

// ─── Room Tabs ───────────────────────────────────────────────────────────
function renderTabs() {
  tabsBar.innerHTML = '';
  var roomList = ['main', FEED_ROOM];
  if (detectedGame && detectedGame.room !== 'main') roomList.push(detectedGame.room);

  roomList.forEach(function(r) {
    var label;
    if (r === 'main') label = '💬 Lobby';
    else if (r === FEED_ROOM) label = '📺 Live Feed';
    else label = (detectedGame && r === detectedGame.room ? detectedGame.label : r);
    var tab = document.createElement('button');
    tab.className = 'cwg-tab' + (r === activeRoom ? ' active' : '') + (unread[r] ? ' has-unread' : '');
    tab.innerHTML = esc(label) + '<span class="cwg-tab-dot"></span>';
    tab.onclick = function() { switchRoom(r); };
    tabsBar.appendChild(tab);
  });
}

function applyInputPlaceholder() {
  var inp = document.getElementById('cwg-input');
  if (!inp) return;
  inp.placeholder = activeRoom === FEED_ROOM
    ? 'Chat with the live stream…'
    : 'Type a message...';
}

function switchRoom(room) {
  activeRoom = room;
  prefs.activeRoom = room;
  unread[room] = 0;
  savePrefs();
  renderTabs();
  renderMessages();
  applyInputPlaceholder();
  scrollToBottom();
}

// ─── Messages ────────────────────────────────────────────────────────────
function addMessage(room, msg) {
  if (!rooms[room]) rooms[room] = [];
  rooms[room].push(msg);
  if (rooms[room].length > MAX_MESSAGES) rooms[room].shift();

  // The feed is its own window into the stream: it never mirrors into the
  // Lobby, and (being a firehose during games) never counts as unread.
  if (room === FEED_ROOM) {
    if (isOpen && activeRoom === FEED_ROOM) appendMsgDom(msg);
    return;
  }

  if (room !== 'main') {
    var mainMsg = {};
    for (var k in msg) mainMsg[k] = msg[k];
    mainMsg._fromRoom = room;
    if (!rooms.main) rooms.main = [];
    rooms.main.push(mainMsg);
    if (rooms.main.length > MAX_MESSAGES) rooms.main.shift();
  }

  if (!isOpen) {
    unread[room] = (unread[room] || 0) + 1;
    if (room !== 'main') unread.main = (unread.main || 0) + 1;
    showNewBubble();
  } else {
    if (room !== activeRoom) {
      unread[room] = (unread[room] || 0) + 1;
    }
    if (activeRoom !== 'main' && room !== 'main') {
      unread.main = (unread.main || 0) + 1;
    }
  }

  updateNotifDot();
  renderTabs();

  if (isOpen) {
    if (activeRoom === room) {
      appendMsgDom(msg);
    } else if (activeRoom === 'main' && room !== 'main') {
      var tagged = {};
      for (var k in msg) tagged[k] = msg[k];
      tagged._fromRoom = room;
      appendMsgDom(tagged);
    }
  }
}

// A live-game guess is a bare short word. Heuristic on purpose — the relay
// does not flag guesses, and a false positive only dims/hides a one-word
// message in the feed tab.
function isLikelyGuess(msg) {
  if (!msg || msg.isSystem) return false;
  var t = (msg.message || '').trim();
  return /^[a-zA-Z]{2,16}$/.test(t);
}

function renderMessages() {
  msgContainer.innerHTML = '';
  var list = rooms[activeRoom] || [];
  list.forEach(function(m) { appendMsgDom(m); });
}

function appendMsgDom(msg) {
  if (msg.user && msg.user.id && prefs.mutedUsers.indexOf(msg.user.id) !== -1) return;

  var isNearBottom = msgContainer.scrollHeight - msgContainer.scrollTop - msgContainer.clientHeight < 80;
  var div = document.createElement('div');

  if (msg.isSystem) {
    div.className = 'cwg-system';
    div.textContent = msg.message || '';
    msgContainer.appendChild(div);
    if (isNearBottom) scrollToBottom();
    trimMessages();
    return;
  }

  div.className = 'cwg-msg';
  if (msg._feed && isLikelyGuess(msg)) {
    if (prefs.hideGuesses) return;
    div.className += ' cwg-guess';
  }
  var user = msg.user || {};
  var platform = msg.platform || 'mobile';
  var color = PLATFORM_COLORS[platform] || PLATFORM_COLORS.mobile;
  var name = user.displayName || user.username || 'Unknown';
  var initial = name.charAt(0).toUpperCase();
  var cosmetics = user.cosmetics || {};

  // Apply name_color cosmetic (overrides platform color)
  if (prefs.showCosmetics && cosmetics.name_color && cosmetics.name_color.color) {
    color = cosmetics.name_color.color;
  }

  if (prefs.showAvatars) {
    // One badge only — these avatars are 26px, so the highest tier held wins:
    // Super Donor > Super Fan > Donor Class > Fan Club. Each flag excludes the
    // ones below it. Super Donor is derived from holding both rather than
    // trusted from the badge list alone, so an older relay build that has not
    // learned to stamp 'super-donor' still resolves it here.
    var _b = Array.isArray(user.badges) ? user.badges : [];
    var _sf = _b.indexOf('superfan') !== -1;
    var _dc = _b.indexOf('donor') !== -1;
    var isSD = _b.indexOf('super-donor') !== -1 || (_sf && _dc);
    var isSF = !isSD && _sf;
    var isDC = !isSD && !isSF && _dc;
    var isFC = !isSD && !isSF && !isDC && _b.indexOf('fan-club') !== -1;
    var wrap = document.createElement('span');
    wrap.className = 'avatar-wrap cwg-avatar-wrap';
    if (isSD) wrap.classList.add('has-super-donor-badge');
    if (isSF) wrap.classList.add('has-superfan-badge');
    if (isDC) wrap.classList.add('has-donor-badge');
    if (isFC) wrap.classList.add('has-fan-club-badge');
    if (user.profilePic) {
      var img = document.createElement('img');
      img.className = 'cwg-avatar';
      img.src = user.profilePic;
      img.alt = '';
      img.loading = 'lazy';
      img.onerror = function() {
        var fb = document.createElement('span');
        fb.className = 'cwg-avatar-fb';
        fb.style.background = color;
        fb.textContent = initial;
        img.replaceWith(fb);
      };
      wrap.appendChild(img);
    } else {
      var fb = document.createElement('span');
      fb.className = 'cwg-avatar-fb';
      fb.style.background = color;
      fb.textContent = initial;
      wrap.appendChild(fb);
    }
    // profile_border / profile_glow — chat rendered neither before. The
    // shared applier scales the catalog px down to these 26px avatars, so a
    // ring reads here without the halo swamping the row.
    if (window.PfpCosmetics && cosmetics) {
      window.PfpCosmetics.apply(wrap.firstChild, wrap, cosmetics, { size: 26 });
    }
    div.appendChild(wrap);
  }

  var body = document.createElement('span');
  body.className = 'cwg-msg-body';

  if (msg._fromRoom) {
    var roomTag = document.createElement('span');
    roomTag.className = 'cwg-room-tag';
    var roomLabel = msg._fromRoom;
    for (var j = 0; j < ROOM_MAP.length; j++) {
      if (ROOM_MAP[j].room === msg._fromRoom) { roomLabel = ROOM_MAP[j].label; break; }
    }
    roomTag.textContent = '[' + roomLabel + '] ';
    body.appendChild(roomTag);
  }

  // Feed messages carry a platform chip so you can tell TikTok chatter from
  // YouTube or web players at a glance.
  if (msg._feed && platform && platform !== 'system') {
    var PLAT_SHORT = { tiktok: 'TT', youtube: 'YT', discord: 'DC', mobile: 'WEB' };
    var plat = document.createElement('span');
    plat.className = 'cwg-plat';
    plat.style.background = color;
    plat.textContent = PLAT_SHORT[platform] || platform.slice(0, 3).toUpperCase();
    body.appendChild(plat);
  }

  var uname = document.createElement('span');
  uname.className = 'cwg-username';
  uname.style.color = color;
  uname.textContent = name + ':';

  // Apply name_color textShadow + name_glow textShadow cosmetics
  if (prefs.showCosmetics) {
    var shadows = [];
    if (cosmetics.name_color && cosmetics.name_color.textShadow) {
      shadows.push(cosmetics.name_color.textShadow);
    }
    if (cosmetics.name_glow && cosmetics.name_glow.textShadow) {
      shadows.push(cosmetics.name_glow.textShadow);
    }
    if (shadows.length > 0) {
      uname.style.textShadow = shadows.join(', ');
    }
    // Full material payload (gradient-text sweeps, animations) + ambient
    // particle aura — this is where legendary/ultra owners flex in chat.
    if (window.CosmeticsFx && cosmetics.name_color) {
      window.CosmeticsFx.applyText(uname, cosmetics.name_color, { shadow: false, color: false });
    }
    if (!uname.style.animation && cosmetics.name_glow && cosmetics.name_glow.animation) {
      uname.style.animation = cosmetics.name_glow.animation;
    }
    if (window.AmbientFx) {
      var _amb = (cosmetics.name_color && cosmetics.name_color.__ambient) ||
                 (cosmetics.name_glow && cosmetics.name_glow.__ambient) || null;
      if (_amb) window.AmbientFx.attach(uname, _amb);
    }
  }

  uname.addEventListener('contextmenu', function(e) {
    e.preventDefault();
    showContextMenu(e, user);
  });
  body.appendChild(uname);

  var text = document.createElement('span');
  text.className = 'cwg-msg-text';
  text.textContent = ' ' + (msg.message || '');
  body.appendChild(text);

  if (msg.stream) {
    var stag = document.createElement('span');
    stag.className = 'cwg-stream-tag';
    stag.textContent = '(stream)';
    body.appendChild(stag);
  }

  div.appendChild(body);

  var ts = document.createElement('span');
  ts.className = 'cwg-time';
  var d = msg.timestamp ? new Date(msg.timestamp) : new Date();
  ts.textContent = d.getHours() + ':' + (d.getMinutes() < 10 ? '0' : '') + d.getMinutes();
  div.appendChild(ts);

  msgContainer.appendChild(div);
  if (isNearBottom) scrollToBottom();
  trimMessages();
}

function trimMessages() {
  while (msgContainer.children.length > MAX_MESSAGES) {
    msgContainer.removeChild(msgContainer.firstChild);
  }
}

function scrollToBottom() {
  requestAnimationFrame(function() { msgContainer.scrollTop = msgContainer.scrollHeight; });
}

// ─── Context Menu ────────────────────────────────────────────────────────
function showContextMenu(e, user) {
  if (!user || !user.id) return;
  var muted = prefs.mutedUsers.indexOf(user.id) !== -1;
  ctxMenu.innerHTML = '<div class="cwg-ctx-item" data-action="mute">' +
    (muted ? '\uD83D\uDD0A Unmute ' : '\uD83D\uDD07 Mute ') + esc(user.displayName || user.username || '') + '</div>';
  ctxMenu.style.left = Math.min(e.clientX, window.innerWidth - 140) + 'px';
  ctxMenu.style.top = Math.min(e.clientY, window.innerHeight - 40) + 'px';
  ctxMenu.style.display = 'block';

  ctxMenu.querySelector('[data-action=mute]').onclick = function() {
    if (muted) {
      prefs.mutedUsers = prefs.mutedUsers.filter(function(id) { return id !== user.id; });
    } else {
      prefs.mutedUsers.push(user.id);
    }
    savePrefs();
    renderMessages();
    ctxMenu.style.display = 'none';
  };
}

document.addEventListener('click', function() { ctxMenu.style.display = 'none'; });

// ─── Button handlers ─────────────────────────────────────────────────────
document.addEventListener('click', function(e) {
  var t = e.target;
  if (t.id === 'cwg-close-btn') closePanel();
  else if (t.id === 'cwg-toggle') togglePanel();
  else if (t.id === 'cwg-settings-btn') settingsPanel.classList.toggle('open');
});

// ─── Settings handlers ───────────────────────────────────────────────────
document.addEventListener('input', function(e) {
  if (e.target.id === 'cwg-font-size') {
    prefs.fontSize = parseInt(e.target.value);
    applyFontSize();
    savePrefs();
  }
});

document.addEventListener('click', function(e) {
  if (e.target.id === 'cwg-toggle-avatars') {
    prefs.showAvatars = !prefs.showAvatars;
    e.target.classList.toggle('on', prefs.showAvatars);
    savePrefs();
    renderMessages();
  } else if (e.target.id === 'cwg-toggle-time') {
    prefs.showTimestamps = !prefs.showTimestamps;
    e.target.classList.toggle('on', prefs.showTimestamps);
    applyTimestampClass();
    savePrefs();
  } else if (e.target.id === 'cwg-toggle-cosmetics') {
    prefs.showCosmetics = !prefs.showCosmetics;
    e.target.classList.toggle('on', prefs.showCosmetics);
    savePrefs();
    renderMessages();
  } else if (e.target.id === 'cwg-toggle-guesses') {
    prefs.hideGuesses = !prefs.hideGuesses;
    e.target.classList.toggle('on', prefs.hideGuesses);
    savePrefs();
    renderMessages();
  } else if (e.target.id === 'cwg-toggle-trust') {
    var isOn = e.target.classList.toggle('on');
    fetch('/api/me/trust-device', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ trust: isOn })
    });
  } else if (e.target.id === 'cwg-logout-btn') {
    fetch('/api/me/logout', { method: 'POST', credentials: 'include' }).then(function() {
      currentUser = null;
      inputBar.style.display = 'none';
      loginBar.style.display = 'flex';
      renderLoginPrompt();
      document.getElementById('cwg-account-section').style.display = 'none';
      // Clear Searchle localStorage too
      try { localStorage.removeItem('searchle_user'); } catch(e){}
    });
  }
});

// ─── Send message ────────────────────────────────────────────────────────
function sendMessage() {
  if (!chatSocket || !currentUser || sendCooldown) return;
  var inp = document.getElementById('cwg-input');
  var text = (inp.value || '').trim();
  if (!text) return;

  if (activeRoom === FEED_ROOM) {
    // Talk INTO the live stream — same path the mobile app uses. The relay
    // treats it as a 'mobile' platform message, so it reaches the games and
    // echoes back to everyone (including this feed) via 'chat-message'.
    chatSocket.emit('mobile-message', {
      user: {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.globalName || currentUser.username,
        profilePic: currentUser.avatar || null
      },
      message: text
    });
  } else {
    chatSocket.emit('chat-room-message', {
      room: activeRoom,
      user: {
        id: currentUser.id,
        username: currentUser.username,
        displayName: currentUser.globalName || currentUser.username,
        profilePic: currentUser.avatar || null
      },
      message: text
    });
  }

  inp.value = '';
  sendCooldown = true;
  var btn = document.getElementById('cwg-send');
  if (btn) btn.disabled = true;
  setTimeout(function() {
    sendCooldown = false;
    if (btn) btn.disabled = false;
  }, SEND_COOLDOWN);
}

document.addEventListener('click', function(e) { if (e.target.id === 'cwg-send') sendMessage(); });
document.addEventListener('keydown', function(e) {
  if (e.target.id === 'cwg-input' && e.key === 'Enter') { e.preventDefault(); sendMessage(); }
});

// ─── Socket connection ──────────────────────────────────────────────────
function connectSocket() {
  if (typeof io !== 'function') {
    // Vite-bundled games import socket.io as a module — window.io is never set.
    // Dynamically load the client library from Chat Relay's socket.io server.
    if (!connectSocket._tried) {
      connectSocket._tried = true;
      var s = document.createElement('script');
      s.src = '/socket.io/socket.io.js';
      s.onload = function() { connectSocket(); };
      s.onerror = function() {
        console.warn('[Chat Widget] Failed to load Socket.IO client, retrying in 2s...');
        connectSocket._tried = false;
        setTimeout(connectSocket, 2000);
      };
      document.head.appendChild(s);
      return;
    }
    console.warn('[Chat Widget] Socket.IO not loaded, retrying in 2s...');
    setTimeout(connectSocket, 2000);
    return;
  }
  chatSocket = io(window.location.origin, {
    path: '/socket.io',
    transports: ['websocket', 'polling']
  });

  chatSocket.on('connect', function() {
    chatSocket.emit('chat-join-room', 'main');
    if (detectedGame) chatSocket.emit('chat-join-room', detectedGame.room);
    // The feed has no history endpoint — note it once so an empty tab
    // reads as "waiting", not "broken".
    if (!rooms[FEED_ROOM].length) {
      addMessage(FEED_ROOM, { isSystem: true, message: 'You’re tuned in — live stream chat appears here as it happens.' });
    }
  });

  chatSocket.on('chat-room-msg', function(msg) {
    if (!msg) return;
    // stream:true = relay-mirrored stream chatter (the pre-v2 design pushed
    // the firehose into main). The Live Feed tab owns those now — drop them
    // so the Lobby stays site-only even against an older relay build.
    if (msg.stream) return;
    addMessage(msg.room || 'main', msg);
  });

  // The live relay firehose (TikTok/YouTube/Discord/web) — io.emit'd to
  // every socket, no join needed. Joins are noise; everything else lands
  // in the Live Feed tab.
  chatSocket.on('chat-message', function(msg) {
    if (!msg || msg.isJoin) return;
    var feedMsg = {};
    for (var k in msg) feedMsg[k] = msg[k];
    feedMsg._feed = true;
    addMessage(FEED_ROOM, feedMsg);
  });

  chatSocket.on('chat-room-history', function(data) {
    if (!data || !data.room) return;
    // The 12h history still contains stream-mirrored rows written before
    // the relay stopped persisting them — filter those relics out too.
    rooms[data.room] = (data.messages || []).filter(function(m) { return !m.stream; });
    // Main room history already includes copies from all game rooms (server handles this)
    // Game room history is separate — no need to copy into main
    if (activeRoom === data.room || activeRoom === 'main') {
      renderMessages();
      scrollToBottom();
    }
  });

  chatSocket.on('chat-room-error', function(data) {
    if (!data) return;
    addMessage(activeRoom, { isSystem: true, message: data.message || 'Error' });
    if (data.code === 'auth_changed' && !chatSocket._identityRefreshing) {
      chatSocket._identityRefreshing = true;
      checkAuth().then(function() {
        chatSocket.disconnect();
        chatSocket.connect();
      }).finally(function() { chatSocket._identityRefreshing = false; });
    }
  });

  chatSocket.on('disconnect', function() {
    addMessage('main', { isSystem: true, message: 'Disconnected from chat...' });
  });
}

// ─── Auth check ──────────────────────────────────────────────────────────
function checkAuth() {
  return fetch('/api/me/session', { credentials: 'include' }).then(function(r) { return r.json(); }).then(function(data) {
    if (data.ok && data.user) {
      currentUser = data.user;
      inputBar.style.display = 'flex';
      loginBar.style.display = 'none';
      showAccountSection(data.user);
    } else {
      currentUser = null;
      inputBar.style.display = 'none';
      loginBar.style.display = 'flex';
      renderLoginPrompt();
      var acctSec = document.getElementById('cwg-account-section');
      if (acctSec) acctSec.style.display = 'none';
    }
  }).catch(function() {
    currentUser = null;
    inputBar.style.display = 'none';
    loginBar.style.display = 'flex';
    renderLoginPrompt();
  });
}

function showAccountSection(user) {
  var acctSec = document.getElementById('cwg-account-section');
  var acctInfo = document.getElementById('cwg-account-info');
  if (!acctSec || !acctInfo) return;
  acctSec.style.display = 'block';
  var avatarHtml = user.avatar
    ? '<img src="' + esc(user.avatar) + '" alt="">'
    : '';
  acctInfo.innerHTML = avatarHtml + '<span class="cwg-acct-name">' + esc(user.globalName || user.username || '') + '</span>';
  // Check trust status
  fetch('/api/me/trust-status', { credentials: 'include' }).then(function(r) { return r.json(); }).then(function(data) {
    var trustBtn = document.getElementById('cwg-toggle-trust');
    if (trustBtn) trustBtn.classList.toggle('on', data.trusted);
  }).catch(function(){});
}

// ─── Init ─────────────────────────────────────────────────────────────────
function init() {
  if (isMobile) document.body.classList.add('cwg-mobile');
  appendDom();
  renderTabs();
  applyInputPlaceholder();
  // Warm the current session before the socket reads its cookie.
  checkAuth().then(connectSocket);

  // Re-check auth when user returns from Discord OAuth (covers tab switch + same-tab redirect)
  window.addEventListener('focus', function() {
    if (!currentUser) checkAuth();
  });
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden && !currentUser) checkAuth();
  });
  // Delayed re-check for same-tab OAuth redirects (session may not be ready immediately)
  setTimeout(function() {
    if (!currentUser) checkAuth();
  }, 1500);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

})();
