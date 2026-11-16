// ===== Post-Game Progress Card =====
// Compact slide-up card showing what the player earned, what progressed,
// and what to do next after a game reward.
// Include via: <script src="/portal/js/progress-card.js"></script>
// Listens for 'progress-summary' socket events.
// Hidden on OBS by default (data-obs-hide class).

(function() {
  'use strict';

  var RARITY_COLORS = {
    common: '#9d9d9d', uncommon: '#4fc34f', rare: '#4a9eff',
    epic: '#b44aff', legendary: '#ffab00', ultra: '#ff4444'
  };

  // Throttle: max 1 card per 10 seconds
  var lastShown = 0;
  var activeCard = null;

  // Inject CSS once
  var style = document.createElement('style');
  style.textContent =
    '@keyframes pcSlideIn{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}' +
    '@keyframes pcSlideOut{from{transform:translateY(0);opacity:1}to{transform:translateY(100%);opacity:0}}' +
    '@keyframes pcLineIn{from{transform:translateX(-12px);opacity:0}to{transform:translateX(0);opacity:1}}' +
    '.pc-card{position:fixed;bottom:16px;left:50%;transform:translateX(-50%);z-index:99990;' +
    'width:min(340px,calc(100vw - 32px));background:rgba(18,18,28,.92);' +
    'border:1px solid rgba(255,255,255,.1);border-radius:14px;padding:16px 18px;' +
    'font-family:Inter,Segoe UI,sans-serif;color:#e0e0e0;' +
    'backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);' +
    'box-shadow:0 8px 32px rgba(0,0,0,.5);pointer-events:auto;cursor:pointer;' +
    'animation:pcSlideIn .4s cubic-bezier(.22,1,.36,1) forwards}' +
    '.pc-card.out{animation:pcSlideOut .35s ease forwards}' +
    '.pc-card[data-obs-hide]{display:none}' +
    '.pc-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}' +
    '.pc-title{font-size:11px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#888}' +
    '.pc-dismiss{font-size:10px;color:#555;cursor:pointer}' +
    '.pc-lines{display:flex;flex-direction:column;gap:6px}' +
    '.pc-line{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:500;' +
    'opacity:0;animation:pcLineIn .3s ease forwards}' +
    '.pc-icon{width:20px;text-align:center;font-size:15px;flex-shrink:0}' +
    '.pc-label{flex:1;line-height:1.35}' +
    '.pc-reward .pc-label{color:#39ff14;font-weight:700;font-size:14px}' +
    '.pc-daily .pc-label{color:#4fc3f7}' +
    '.pc-weekly .pc-label{color:#ce93d8}' +
    '.pc-milestone .pc-label{color:#ffab00}' +
    '.pc-next .pc-label{color:#888;font-style:italic}' +
    '.pc-cosmetic .pc-label{font-weight:600}';
  document.head.appendChild(style);

  function dismiss() {
    if (activeCard) {
      activeCard.classList.add('out');
      var card = activeCard;
      activeCard = null;
      setTimeout(function() { card.remove(); }, 400);
    }
  }

  function showCard(data) {
    if (!data || !data.summary) return;
    var s = data.summary;

    // Suppression: skip if no meaningful fields
    var keys = Object.keys(s);
    if (keys.length === 0) return;

    // Throttle
    var now = Date.now();
    if (now - lastShown < 10000) return;
    lastShown = now;

    // Dismiss previous
    if (activeCard) {
      activeCard.remove();
      activeCard = null;
    }

    var card = document.createElement('div');
    card.className = 'pc-card';
    // OBS hide by default — streamers opt in by removing this attribute
    if (!window.__progressCardOBS) card.setAttribute('data-obs-hide', '');
    card.onclick = dismiss;

    // Header
    var header = document.createElement('div');
    header.className = 'pc-header';
    header.innerHTML = '<span class="pc-title">Progress</span><span class="pc-dismiss">tap to close</span>';
    card.appendChild(header);

    var lines = document.createElement('div');
    lines.className = 'pc-lines';

    var delay = 0;

    function addLine(cls, icon, label) {
      var line = document.createElement('div');
      line.className = 'pc-line ' + cls;
      line.style.animationDelay = (delay * 0.1) + 's';
      line.innerHTML = '<span class="pc-icon">' + icon + '</span><span class="pc-label">' + escHtml(label) + '</span>';
      lines.appendChild(line);
      delay++;
    }

    // 1. Reward
    if (s.reward) {
      addLine('pc-reward', '\u2B50', s.reward.label);
    }

    // 2. Daily
    if (s.daily) {
      addLine('pc-daily', '\u2705', s.daily.label);
    }

    // 3. Weekly
    if (s.weekly) {
      addLine('pc-weekly', '\uD83D\uDCC5', s.weekly.label);
    }

    // 4. Milestone
    if (s.milestone) {
      addLine('pc-milestone', '\uD83D\uDD25', s.milestone.label);
    }

    // 5. Cosmetic
    if (s.cosmetic) {
      var color = RARITY_COLORS[s.cosmetic.rarity] || '#fff';
      var line = document.createElement('div');
      line.className = 'pc-line pc-cosmetic';
      line.style.animationDelay = (delay * 0.1) + 's';
      line.innerHTML = '<span class="pc-icon">\uD83C\uDFB0</span><span class="pc-label" style="color:' + color + '">' +
        escHtml(s.cosmetic.rarity.charAt(0).toUpperCase() + s.cosmetic.rarity.slice(1)) +
        ': ' + escHtml(s.cosmetic.name) + '</span>';
      lines.appendChild(line);
      delay++;
    }

    // 6. Next action
    if (s.nextAction) {
      addLine('pc-next', '\u27A1\uFE0F', s.nextAction.label);
    }

    card.appendChild(lines);
    document.body.appendChild(card);
    activeCard = card;

    // Auto-dismiss after 15 seconds
    setTimeout(function() {
      if (activeCard === card) dismiss();
    }, 15000);
  }

  function escHtml(str) {
    var d = document.createElement('span');
    d.textContent = str;
    return d.innerHTML;
  }

  // Wait for Socket.IO, then listen
  function waitForIO(cb) {
    if (typeof io !== 'undefined') return cb();
    var tries = 0;
    var t = setInterval(function() {
      if (typeof io !== 'undefined' || ++tries > 50) { clearInterval(t); if (typeof io !== 'undefined') cb(); }
    }, 200);
  }

  // Expose for manual testing
  window.ProgressCard = { show: showCard, dismiss: dismiss };

  function waitForSocket(cb) {
    if (window._gameSocket || window.socket) return cb(window._gameSocket || window.socket);
    var tries = 0;
    var t = setInterval(function() {
      var s = window._gameSocket || window.socket;
      if (s || ++tries > 100) { clearInterval(t); if (s) cb(s); }
    }, 200);
  }

  waitForSocket(function(sock) {
    sock.on('progress-summary', function(data) {
      showCard(data);
    });
  });
})();
