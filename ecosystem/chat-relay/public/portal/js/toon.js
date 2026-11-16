/* ════════════════════════════════════════════════════════════════════
   TOON — shared behaviour for the Word Tycoon building.

   Right now: day/night, remembered across pages so the tower keeps one
   time of day as you move between floors.

   The class lives on <body> because ~15 rules in home.html and the token
   block in toon.css are written as `body.night ...`. Applying it needs to
   happen before anything paints, which an external script can't do — so
   each page carries the one-line snippet below immediately after <body>:

     <script>try{if(localStorage.getItem('wt-night')==='1')
       document.body.classList.add('night')}catch(e){}</script>

   This file handles everything after that: reading state, persisting it,
   and wiring toggle buttons.
   ════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var ICON_SPRITE = '/portal/img/icons.svg?v=1';
  function dirIcon(name) { return '<svg class="icon" aria-hidden="true"><use href="' + ICON_SPRITE + '#icon-' + name + '"/></svg>'; }

  var KEY = 'wt-night';

  function isNight() {
    return document.body.classList.contains('night');
  }

  function save(night) {
    // Private mode / disabled storage: the toggle still works for this
    // page load, it just won't be remembered. Never let it throw.
    try { localStorage.setItem(KEY, night ? '1' : '0'); } catch (e) {}
  }

  function saved() {
    try { return localStorage.getItem(KEY) === '1'; } catch (e) { return false; }
  }

  /* Set the time of day and remember it. Pass onChange-style extras via
     the `silent` flag when restoring on load, so pages don't fire their
     toast/confetti side effects for a state the user set on another page. */
  function setNight(night, silent) {
    document.body.classList.toggle('night', !!night);
    save(!!night);
    listeners.forEach(function (fn) {
      try { fn(!!night, !!silent); } catch (e) {}
    });
  }

  var listeners = [];
  function onChange(fn) { if (typeof fn === 'function') listeners.push(fn); }

  /* Wire a button as a day/night toggle and keep its aria-pressed honest. */
  function wireToggle(el) {
    if (!el) return;
    var sync = function () { el.setAttribute('aria-pressed', isNight() ? 'true' : 'false'); };
    el.addEventListener('click', function () { setNight(!isNight()); });
    onChange(sync);
    sync();
  }

  /* ── The Building Directory ──────────────────────────────────────────
     One list, every page: auto-mounted as a directory button + dropdown into the
     first .topbar nav found. Add a page here and it appears in the
     directory on every floor at once (styles live in toon.css .dir-*). */
  var DIRECTORY = [
    { ico: 'gallery', name: 'Games',         desc: 'All 16 word games',            href: '/#games',      ic: '#dcecff' },
    { ico: 'building', name: 'The Empire',    desc: 'Buy & manage your businesses', href: '/#empire',     ic: '#ffe9c9' },
    { ico: 'key', name: 'Store',         desc: 'Cosmetics store & gift sets',  href: '/store',       ic: '#e6dcff' },
    { ico: 'crown', name: 'The Penthouse', desc: 'Membership plans',             href: '/membership',  ic: '#ffdce8' },
    { ico: 'bell', name: 'Profile',       desc: 'Stats & wardrobe',             href: '/profile',     ic: '#ffefc2' },
    { ico: 'books', name: 'The Library',   desc: 'Your words & the scoring ledger', href: '/library',  ic: '#dff5e6' },
    { ico: 'library', name: 'The Rulebook',  desc: 'How to play every game',       href: '/how-to-play', ic: '#e0f3fa' },
    { ico: 'goat', name: 'GOAT Hall',     desc: 'The all-time leaderboard',     href: '/goat',        ic: '#fff3d6' },
    { ico: 'mic', name: 'Voice Lab',     desc: 'Premium voices',               href: 'https://voice.wordtycoon.live', ext: true, ic: '#ffdce8' },
    { ico: 'satellite', name: 'Live Feed',     desc: 'Social feed of tower events',  href: '/feed',        ic: '#d1fae5' },
    { split: true },
    { ico: 'tv', name: 'Streamer Dashboard', desc: 'Run games on your own stream', href: '/streamer', ic: '#e8e8f5' },
    { ico: 'chat', name: 'Discord',       desc: 'Join the community',           href: 'https://discord.gg/C8Nm2jEZFC', ext: true, ic: '#dcdcff' }
  ];

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isHere(href) {
    if (href.indexOf('http') === 0 || href.indexOf('/#') === 0) return false;
    var path = window.location.pathname.replace(/\/$/, '') || '/';
    return path === href.replace(/\/$/, '');
  }

  function mountDirectory() {
    if (document.querySelector('.dir-wrap')) return;

    var wrap = document.createElement('div');
    wrap.className = 'dir-wrap';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'dir-btn';
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
    btn.title = 'Building directory — every floor of the site';
    btn.innerHTML = dirIcon('clipboard') + ' <span class="dir-btn-label">Directory</span>';

    var panel = document.createElement('div');
    panel.className = 'dir-panel';
    panel.hidden = true;
    var html = '<div class="dir-head">' + dirIcon('building') + ' Building Directory</div>';
    DIRECTORY.forEach(function (d) {
      if (d.split) { html += '<div class="dir-split"></div>'; return; }
      var here = isHere(d.href);
      html += '<a class="dir-row' + (here ? ' dir-here' : '') + '" href="' + esc(d.href) + '"' +
        (d.ext ? ' target="_blank" rel="noopener"' : '') + '>' +
        '<span class="dir-ico" style="--ico:' + esc(d.ic || '') + '">' + dirIcon(d.ico) + '</span>' +
        '<span class="dir-txt"><span class="dir-name">' + esc(d.name) + '</span>' +
        '<span class="dir-desc" style="display:block">' + esc(d.desc) + '</span></span>' +
        (here ? '<span class="dir-here-tag">You are here</span>' : '') +
      '</a>';
    });
    panel.innerHTML = html;

    function close() {
      panel.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
    }
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      panel.hidden = !panel.hidden;
      btn.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !wrap.contains(e.target)) close();
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) { close(); btn.focus(); }
    });

    wrap.appendChild(btn);
    wrap.appendChild(panel);
    document.body.appendChild(wrap);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountDirectory);
  } else {
    mountDirectory();
  }

  global.WTToon = {
    KEY: KEY,
    isNight: isNight,
    saved: saved,
    setNight: setNight,
    onChange: onChange,
    wireToggle: wireToggle,
    mountDirectory: mountDirectory,
    DIRECTORY: DIRECTORY
  };
})(window);
