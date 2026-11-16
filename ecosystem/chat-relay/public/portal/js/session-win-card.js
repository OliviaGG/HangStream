// session-win-card.js — In-page win card for streamer-private game sessions.
//
// Renders the same top-10 leaderboard layout as the OBS overlay
// (/win-overlay?streamer=<handle>) on the player page (mp.html) of all
// session-supporting games. The OBS overlay handles the OBS-source render;
// this script handles the in-page render. Both consume the same `game-win`
// payload shape (game, winner, jackpot, topPlayers, streamerHandle, etc.)
// — ONE schema, TWO renderers, identical visuals.
//
// Init pattern (mirrors CoinReward.init):
//   <script src="/portal/js/session-win-card.js"></script>
//   <script>if (window.SessionWinCard) SessionWinCard.init(socket);</script>
//
// The script self-gates: only runs when window.__SESSION_HANDLE is set
// (per-game frontend sets this after detecting ?session= or /<handle>) AND
// the current page is a player page (not an OBS overlay). It also ignores
// game-win events that don't match the current session handle.

(function () {
  'use strict';
  if (window.SessionWinCard) return; // idempotent

  // Self-inject the shared cosmetic FX assets (keyframes + ambient particle
  // engine) from wherever THIS script was served — game pages live on their
  // own origins and don't include them directly.
  try {
    var _self = document.currentScript && document.currentScript.src;
    var _base = _self ? _self.replace(/\/portal\/js\/session-win-card\.js.*$/, '') : '';
    if (!document.querySelector('link[href*="cosmetics-fx.css"]')) {
      var _l = document.createElement('link');
      _l.rel = 'stylesheet';
      _l.href = _base + '/css/cosmetics-fx.css?v=3';
      document.head.appendChild(_l);
    }
    if (!window.AmbientFx && !document.querySelector('script[src*="ambient-fx.js"]')) {
      var _s = document.createElement('script');
      _s.src = _base + '/js/ambient-fx.js?v=3';
      document.head.appendChild(_s);
    }
    if (!window.PfpCosmetics && !document.querySelector('script[src*="pfp-cosmetics.js"]')) {
      var _p = document.createElement('script');
      _p.src = _base + '/js/pfp-cosmetics.js?v=15';
      document.head.appendChild(_p);
    }
  } catch (_) {}

  var PLATFORM_COLORS = {
    tiktok: '#69C9D0', youtube: '#FF0000', twitch: '#9146FF',
    discord: '#5865F2', web: '#5865F2', unknown: '#aaa'
  };
  var SHOW_MS = 7000;

  var inited = false;
  var sessionHandle = null;
  var card = null;
  var listEl = null;
  var gameEl = null;
  var wordEl = null;
  var jackpotEl = null;
  var nextEl = null;
  var hideTimer = null;
  var queue = [];
  var showing = false;

  function isObsOverlay() {
    var b = document.body;
    var h = document.documentElement;
    if (b && b.dataset && b.dataset.mode && b.dataset.mode !== 'mp') return true;
    if (b && b.classList && (b.classList.contains('obs-overlay-mode') || b.classList.contains('obs-mode'))) return true;
    if (h && h.classList && (h.classList.contains('obs-overlay-mode') || h.classList.contains('obs-mode'))) return true;
    // wikisearchle / overlay variants set ?obs=1
    try {
      if (new URLSearchParams(location.search).get('stream_widget') === '1') return true;
      if (new URLSearchParams(location.search).get('obs') === '1') return true;
    } catch (_) {}
    return false;
  }

  function detectHandle() {
    if (window.__SESSION_HANDLE) return String(window.__SESSION_HANDLE).toLowerCase();
    try {
      var q = new URLSearchParams(location.search).get('session');
      if (q && /^[a-z0-9_-]{1,32}$/.test(q)) return q.toLowerCase();
    } catch (_) {}
    return null;
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function injectCss() {
    if (document.getElementById('session-win-card-css')) return;
    var s = document.createElement('style');
    s.id = 'session-win-card-css';
    s.textContent = [
      '#sw-card{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%) scale(0.96);opacity:0;pointer-events:none;transition:opacity .45s ease,transform .45s cubic-bezier(.34,1.56,.64,1);width:min(880px,96vw);max-width:880px;background:linear-gradient(160deg,rgba(18,12,28,.97) 0%,rgba(10,8,16,.98) 100%);border:1px solid rgba(177,107,255,.22);border-radius:32px;padding:48px 40px 40px;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 60px rgba(177,107,255,.18),inset 0 1px 0 rgba(255,255,255,.06);z-index:99998;display:none;font-family:"Roboto Mono","Segoe UI",system-ui,sans-serif;color:#fff;box-sizing:border-box}',
      '#sw-card.show{opacity:1;transform:translate(-50%,-50%) scale(1)}',
      '#sw-card.hide{opacity:0;transform:translate(-50%,-50%) scale(0.96)}',
      '#sw-card::before{content:"";position:absolute;top:0;left:14%;right:14%;height:2px;background:linear-gradient(90deg,transparent 0%,rgba(177,107,255,.5) 25%,#B16BFF 45%,#5BFF9E 55%,rgba(91,255,158,.5) 75%,transparent 100%);filter:drop-shadow(0 0 6px #B16BFF)}',
      '#sw-card .sw-eyebrow{font-size:14px;font-weight:700;letter-spacing:.32em;text-transform:uppercase;color:#B16BFF;text-align:center;text-shadow:0 0 12px rgba(177,107,255,.6);margin-bottom:10px}',
      '#sw-card .sw-game{font-size:28px;font-weight:900;color:#fff;text-align:center;letter-spacing:.04em;text-transform:uppercase;margin-bottom:4px}',
      '#sw-card .sw-word{font-size:20px;font-weight:700;letter-spacing:.18em;color:#5BFF9E;text-align:center;text-shadow:0 0 16px rgba(91,255,158,.4);text-transform:uppercase;margin-bottom:20px;min-height:1.2em;word-break:break-word}',
      '#sw-card .sw-list{display:flex;flex-direction:column;gap:7px;margin-bottom:18px;max-height:60vh;overflow-y:auto}',
      '#sw-card .sw-row{display:grid;grid-template-columns:42px 56px 1fr 90px;align-items:center;gap:10px;padding:8px 12px;background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.06);border-radius:12px;opacity:0;transform:translateY(8px);animation:sw-row-in .4s ease forwards}',
      '@keyframes sw-row-in{to{opacity:1;transform:translateY(0)}}',
      '#sw-card .sw-row.rank-1{background:linear-gradient(90deg,rgba(255,215,0,.10),rgba(177,107,255,.10));border-color:rgba(255,215,0,.40);box-shadow:0 0 24px rgba(255,215,0,.15);padding:11px 12px}',
      '#sw-card .sw-rank{font-size:18px;font-weight:800;color:rgba(255,255,255,.45);text-align:center}',
      '#sw-card .sw-row.rank-1 .sw-rank{color:#FFD700;font-size:22px;text-shadow:0 0 8px rgba(255,215,0,.6)}',
      '#sw-card .sw-row.rank-2 .sw-rank{color:#C0C0C0}',
      '#sw-card .sw-row.rank-3 .sw-rank{color:#CD7F32}',
      '#sw-card .sw-avatar{position:relative;width:44px;height:44px;border-radius:50%;overflow:visible;justify-self:center}',
      '#sw-card .sw-avatar-inner{width:100%;height:100%;border-radius:50%;overflow:hidden;background:rgba(255,255,255,.08);display:flex;align-items:center;justify-content:center}',
      '#sw-card .sw-avatar img{width:100%;height:100%;object-fit:cover;display:block}',
      '#sw-card .sw-avatar .sw-letter{font-size:20px;font-weight:700;color:rgba(255,255,255,.75);line-height:1}',
      '#sw-card .sw-hero-badge{position:absolute;bottom:-2px;right:-2px;width:22px;height:22px;border-radius:50%;background:rgba(10,8,16,.95);border:2px solid rgba(177,107,255,.6);display:flex;align-items:center;justify-content:center;font-size:13px;z-index:2;box-shadow:0 0 8px rgba(177,107,255,.4)}',
      '#sw-card .sw-name-cell{min-width:0}',
      '#sw-card .sw-name{font-size:18px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '#sw-card .sw-row.rank-1 .sw-name{font-size:21px}',
      '#sw-card .sw-title{font-size:11px;font-weight:600;margin-left:6px;vertical-align:middle;opacity:.85}',
      '#sw-card .sw-xp{font-size:18px;font-weight:800;color:#FFD700;text-align:right;text-shadow:0 0 8px rgba(255,215,0,.4);font-variant-numeric:tabular-nums}',
      '#sw-card .sw-row.rank-1 .sw-xp{font-size:21px}',
      '#sw-card .sw-footer{display:flex;justify-content:space-between;align-items:center;gap:12px;padding-top:14px;border-top:1px solid rgba(255,255,255,.08);font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:rgba(255,255,255,.45)}',
      '#sw-card .sw-footer .sw-jackpot{color:#FFD700;font-weight:800;text-shadow:0 0 8px rgba(255,215,0,.4)}',
      '#sw-card .sw-footer .sw-jackpot.zero{display:none}',
      // Mobile portrait — tighten the layout
      '@media (max-width:520px){#sw-card{padding:28px 18px 22px;border-radius:24px}',
      '#sw-card .sw-eyebrow{font-size:11px;letter-spacing:.24em;margin-bottom:6px}',
      '#sw-card .sw-game{font-size:20px;margin-bottom:2px}',
      '#sw-card .sw-word{font-size:15px;letter-spacing:.12em;margin-bottom:14px}',
      '#sw-card .sw-row{grid-template-columns:30px 38px 1fr 64px;gap:8px;padding:6px 8px;border-radius:10px}',
      '#sw-card .sw-row.rank-1{padding:8px}',
      '#sw-card .sw-rank{font-size:14px}',
      '#sw-card .sw-row.rank-1 .sw-rank{font-size:17px}',
      '#sw-card .sw-avatar{width:32px;height:32px}',
      '#sw-card .sw-avatar .sw-letter{font-size:14px}',
      '#sw-card .sw-hero-badge{width:16px;height:16px;font-size:9px;border-width:1.5px}',
      '#sw-card .sw-name{font-size:14px}',
      '#sw-card .sw-row.rank-1 .sw-name{font-size:16px}',
      '#sw-card .sw-xp{font-size:13px}',
      '#sw-card .sw-row.rank-1 .sw-xp{font-size:15px}',
      '#sw-card .sw-footer{font-size:10px;padding-top:10px}}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function buildCard() {
    if (card) return;
    card = document.createElement('div');
    card.id = 'sw-card';
    card.innerHTML =
      '<div class="sw-eyebrow">// Round Complete</div>' +
      '<div class="sw-game"></div>' +
      '<div class="sw-word"></div>' +
      '<div class="sw-list"></div>' +
      '<div class="sw-footer">' +
      '<span class="sw-jackpot">+0 jackpot</span>' +
      '<span class="sw-next">Next round soon</span>' +
      '</div>';
    document.body.appendChild(card);
    gameEl = card.querySelector('.sw-game');
    wordEl = card.querySelector('.sw-word');
    listEl = card.querySelector('.sw-list');
    jackpotEl = card.querySelector('.sw-jackpot');
    nextEl = card.querySelector('.sw-next');
  }

  function buildAvatar(p) {
    var letter = ((p.displayName || '?')[0] || '?').toUpperCase();
    var color = PLATFORM_COLORS[p.platform] || PLATFORM_COLORS.unknown;
    var pic = p.profilePic || p.profileImage || null;
    if (pic) {
      return '<img src="' + escHtml(pic).replace(/&amp;/g, '&')
        + '" alt="" referrerpolicy="no-referrer" crossorigin="anonymous"'
        + ' onerror="this.outerHTML=\'<span class=sw-letter style=color:' + color + '>' + escHtml(letter) + '</span>\'">';
    }
    return '<span class="sw-letter" style="color:' + color + '">' + escHtml(letter) + '</span>';
  }

  // Honor viewer cosmetic-visibility prefs from window.__COSMETIC_VISIBILITY
  // (set by per-game scripts that fetched /api/me/visibility on boot).
  function visGate(key) {
    var v = window.__COSMETIC_VISIBILITY;
    if (!v) return true;
    return v[key] !== false;
  }

  // Games where the [title] cosmetic shouldn't render (per per-game UX choice).
  var TITLE_HIDDEN_GAMES = { rectangled: 1, erectangled: 1, sproutle: 1 };

  function applyRowCosmetics(rowEl, cos, gameId) {
    if (!cos) return;
    // Defensive try/catch — a malformed cosmetic value used to throw and
    // abort the per-row forEach in show(), leaving the popup blank for the
    // cosmetic-equipped player. Per-row failure now logs and skips that
    // row's cosmetic only.
    try {
    var nameEl = rowEl.querySelector('.sw-name');
    var avInner = rowEl.querySelector('.sw-avatar-inner');
    var avWrap = rowEl.querySelector('.sw-avatar');
    if (!nameEl || !avInner || !avWrap) return;
    var FX = window.CosmeticsFx;
    if (cos.name_color && visGate('name_color')) {
      if (FX) FX.applyText(nameEl, cos.name_color, { shadow: false });
      else {
        if (cos.name_color.color) nameEl.style.color = cos.name_color.color;
        if (cos.name_color.animation) nameEl.style.animation = cos.name_color.animation;
      }
    }
    if (cos.name_glow && visGate('name_glow')) {
      if (cos.name_glow.textShadow) nameEl.style.textShadow = cos.name_glow.textShadow;
      if (cos.name_glow.animation && !nameEl.style.animation) nameEl.style.animation = cos.name_glow.animation;
    }
    // Shared applier — the glow used to overwrite the border's own halo here.
    if (window.PfpCosmetics) {
      window.PfpCosmetics.apply(avInner, avWrap, {
        profile_border: visGate('profile_border') ? cos.profile_border : null,
        profile_glow: visGate('profile_glow') ? cos.profile_glow : null
      });
    }
    if (cos.title && cos.title.title && visGate('title') && !TITLE_HIDDEN_GAMES[gameId]) {
      var ts = document.createElement('span');
      ts.className = 'sw-title';
      ts.textContent = '[' + cos.title.title + ']';
      if (FX) FX.applyTitle(ts, cos.title);
      else {
        if (cos.title.titleColor) ts.style.color = cos.title.titleColor;
        if (cos.title.titleGlow) ts.style.textShadow = cos.title.titleGlow;
        if (cos.title.animation) ts.style.animation = cos.title.animation;
      }
      nameEl.appendChild(ts);
    }
    // Ambient aura for legendary/ultra names (rows auto-prune on removal).
    if (window.AmbientFx) {
      var rAmb = (visGate('name_color') && cos.name_color && cos.name_color.__ambient) ||
                 (visGate('name_glow') && cos.name_glow && cos.name_glow.__ambient) || null;
      if (rAmb) AmbientFx.attach(nameEl, rAmb);
    }
    if (cos.hero_badge && (cos.hero_badge.icon || cos.hero_badge.emoji) && visGate('hero_badge')) {
      var badge = document.createElement('div');
      badge.className = 'sw-hero-badge';
      badge.textContent = cos.hero_badge.icon || cos.hero_badge.emoji;
      if (cos.hero_badge.borderColor) badge.style.borderColor = cos.hero_badge.borderColor;
      if (cos.hero_badge.background) badge.style.background = cos.hero_badge.background;
      avWrap.appendChild(badge);
    }
    } catch (err) {
      console.warn('[SessionWinCard] applyRowCosmetics threw, skipping this row\'s cosmetics:', err, cos);
    }
  }

  function show(data) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (!card) buildCard();

    gameEl.textContent = data.gameName || data.game || '';
    var word = data.word ? String(data.word).toUpperCase() : '';
    wordEl.textContent = word;
    wordEl.style.display = word ? '' : 'none';

    var jackpot = Number(data.jackpot) || 0;
    if (jackpot > 0) {
      jackpotEl.classList.remove('zero');
      jackpotEl.textContent = '+' + jackpot.toLocaleString() + ' XP';
    } else {
      jackpotEl.classList.add('zero');
    }

    // Top-10 list with single-winner fallback
    var list = Array.isArray(data.topPlayers) ? data.topPlayers.slice(0, 10) : [];
    if (!list.length && data.winner) {
      list = [{
        displayName: data.winner.displayName,
        profilePic: data.winner.profilePic,
        platform: data.winner.platform,
        platformUserId: data.winner.platformUserId,
        cosmetics: data.winner.cosmetics,
        points: jackpot,
      }];
    }

    listEl.innerHTML = '';
    list.forEach(function (p, i) {
      // Per-row try/catch so a single bad player payload (broken
      // cosmetic, missing field) can't blank the entire popup.
      try {
        var rank = i + 1;
        var points = Number(p.points || p.xp || p.score || 0);
        var row = document.createElement('div');
        row.className = 'sw-row rank-' + rank;
        row.style.animationDelay = (i * 60) + 'ms';
        row.innerHTML =
          '<div class="sw-rank">#' + rank + '</div>' +
          '<div class="sw-avatar"><div class="sw-avatar-inner">' + buildAvatar(p) + '</div></div>' +
          '<div class="sw-name-cell"><span class="sw-name">' + escHtml(p.displayName || 'Player') + '</span></div>' +
          '<div class="sw-xp">+' + points.toLocaleString() + ' XP</div>';
        listEl.appendChild(row);
        applyRowCosmetics(row, p.cosmetics, data.game);
      } catch (err) {
        console.warn('[SessionWinCard] row render threw, skipping rank ' + (i + 1) + ':', err, p);
      }
    });

    card.style.display = 'block';
    card.classList.remove('hide');
    setTimeout(function () { card.classList.add('show'); }, 16);

    hideTimer = setTimeout(hide, SHOW_MS);
  }

  function hide() {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (!card) return;
    card.classList.remove('show');
    card.classList.add('hide');
    setTimeout(function () {
      card.classList.remove('hide');
      card.style.display = 'none';
      showing = false;
      processQueue();
    }, 500);
  }

  function processQueue() {
    if (!queue.length) { showing = false; return; }
    showing = true;
    show(queue.shift());
  }

  function queueWin(data) {
    queue.push(data);
    if (!showing) processQueue();
  }

  window.SessionWinCard = {
    init: function (socket) {
      if (inited) return;
      if (!socket || typeof socket.on !== 'function') {
        console.warn('[SessionWinCard] init: missing socket');
        return;
      }
      if (isObsOverlay()) return; // OBS overlay never shows the in-page card
      sessionHandle = detectHandle();
      if (!sessionHandle) return; // public page — no card

      inited = true;
      injectCss();
      // Mark <body> so per-game CSS can hide their own win UIs in session mode
      try { document.body.classList.add('session-mode'); } catch (_) {}

      socket.on('game-win', function (data) {
        if (!data) return;
        // Skip per-word events (Spelling Bee emits a game-win for every word
        // found with winType='word'; these are Sassie/event signals, not
        // round-end wins). The in-page card is for round-end only.
        if (data.winType === 'word') return;
        var h = data.streamerHandle ? String(data.streamerHandle).toLowerCase() : null;
        // If the handle is set, only handle our own session's events.
        // (Games that emit `game-win` to the session room SHOULD always set streamerHandle.)
        if (h && h !== sessionHandle) return;
        queueWin(data);
      });
    },
    // Manual trigger for testing or non-socket-driven games
    trigger: function (data) { queueWin(data); },
  };
})();
