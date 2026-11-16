// ===== Cosmetic Reward Celebration =====
// Self-contained full-screen celebration animation for cosmetic wins.
// Include via: <script src="/portal/js/cosmetic-reward.js"></script>
// Listens for 'cosmetic-reward' socket events and shows rarity-themed celebration.

(function() {
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  var RARITY_COLORS = {
    common: '#9d9d9d', uncommon: '#4fc34f', rare: '#4a9eff',
    epic: '#b44aff', legendary: '#ffab00', ultra: '#ff4444'
  };
  var RARITY_GLOW = {
    common: 'rgba(157,157,157,.3)', uncommon: 'rgba(79,195,79,.4)', rare: 'rgba(74,158,255,.4)',
    epic: 'rgba(180,74,255,.5)', legendary: 'rgba(255,171,0,.5)', ultra: 'rgba(255,68,68,.6)'
  };
  var RARITY_LABELS = {
    common: 'COMMON', uncommon: 'UNCOMMON', rare: 'RARE',
    epic: 'EPIC', legendary: 'LEGENDARY', ultra: 'ULTRA'
  };
  var CATEGORY_NAMES = {
    word_color: 'Word Color', word_glow: 'Word Glow', name_color: 'Name Color',
    name_glow: 'Name Glow', profile_border: 'Profile Border', profile_glow: 'Profile Glow',
    title: 'Title', win_effect: 'Win Effect', hero_badge: 'Hero Badge'
  };
  var TYPE_HEADERS = {
    'single': 'COSMETIC WON!',
    'daily-lootbox': 'DAILY LOOT BOX!',
    'mp-lootbox': 'MP LOOT BOX!',
    'daily-claim': 'DAILY CLAIM DROP!',
    'daily-claim-milestone': 'MILESTONE LOOT BOX!'
  };

  // Inject CSS
  var style = document.createElement('style');
  style.textContent =
    '@keyframes crOverlayIn{from{opacity:0}to{opacity:1}}' +
    '@keyframes crOverlayOut{from{opacity:1}to{opacity:0}}' +
    '@keyframes crBurst{0%{transform:scale(0);opacity:.8}50%{transform:scale(1.2);opacity:.5}100%{transform:scale(1.8);opacity:0}}' +
    '@keyframes crHeaderIn{0%{transform:scale(0) translateY(20px);opacity:0}60%{transform:scale(1.15) translateY(0);opacity:1}100%{transform:scale(1) translateY(0);opacity:1}}' +
    '@keyframes crItemIn{0%{transform:scale(0) rotateX(40deg);opacity:0}60%{transform:scale(1.08) rotateX(-5deg);opacity:1}100%{transform:scale(1) rotateX(0);opacity:1}}' +
    '@keyframes crShimmer{0%{background-position:-200% center}100%{background-position:200% center}}' +
    '@keyframes crParticle{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--px),var(--py)) scale(0);opacity:0}}' +
    '@keyframes crPulse{0%,100%{box-shadow:0 0 15px var(--glow)}50%{box-shadow:0 0 35px var(--glow),0 0 60px var(--glow)}}' +
    '.cr-overlay{position:fixed;inset:0;z-index:99998;display:flex;flex-direction:column;' +
    'align-items:center;justify-content:center;background:rgba(0,0,0,.75);' +
    'animation:crOverlayIn .4s ease forwards;pointer-events:none;font-family:Inter,Segoe UI,sans-serif}' +
    '.cr-overlay.out{animation:crOverlayOut .5s ease forwards}' +
    '.cr-burst{position:absolute;width:300px;height:300px;border-radius:50%;' +
    'animation:crBurst 1.2s ease-out forwards;pointer-events:none}' +
    '.cr-header{font-size:32px;font-weight:900;letter-spacing:4px;text-transform:uppercase;' +
    'margin-bottom:8px;animation:crHeaderIn .6s cubic-bezier(.34,1.56,.64,1) forwards;' +
    'text-shadow:0 0 20px currentColor,0 2px 8px rgba(0,0,0,.6);opacity:0}' +
    '.cr-player{font-size:14px;font-weight:600;color:#ccc;margin-bottom:20px;opacity:0;' +
    'animation:crHeaderIn .4s .2s ease forwards}' +
    '.cr-items{display:flex;flex-direction:column;gap:12px;align-items:center}' +
    '.cr-item{background:rgba(20,20,30,.9);border:2px solid;border-radius:14px;' +
    'padding:14px 28px;min-width:240px;text-align:center;opacity:0;' +
    'animation:crItemIn .5s cubic-bezier(.34,1.56,.64,1) forwards;' +
    '--glow:rgba(255,255,255,.2);animation-name:crItemIn,crPulse;' +
    'animation-duration:.5s,2s;animation-delay:var(--delay),.8s;' +
    'animation-timing-function:cubic-bezier(.34,1.56,.64,1),ease-in-out;' +
    'animation-iteration-count:1,infinite;animation-fill-mode:forwards,none}' +
    '.cr-rarity{font-size:11px;font-weight:800;letter-spacing:3px;margin-bottom:4px;text-transform:uppercase}' +
    '.cr-name{font-size:22px;font-weight:800;letter-spacing:1px;' +
    'background:linear-gradient(90deg,var(--rc),#fff,var(--rc));background-size:200% auto;' +
    'animation:crShimmer 3s linear infinite;-webkit-background-clip:text;-webkit-text-fill-color:transparent;' +
    'background-clip:text}' +
    '.cr-category{font-size:12px;color:#aaa;margin-top:4px;font-weight:600}' +
    '.cr-particle{position:absolute;width:8px;height:8px;border-radius:50%;' +
    'animation:crParticle 1s ease-out forwards;pointer-events:none}';
  document.head.appendChild(style);

  function createParticles(overlay, color, count) {
    for (var i = 0; i < count; i++) {
      var p = document.createElement('div');
      p.className = 'cr-particle';
      var angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
      var dist = 120 + Math.random() * 180;
      p.style.cssText =
        'left:50%;top:50%;background:' + color +
        ';--px:' + Math.round(Math.cos(angle) * dist) + 'px' +
        ';--py:' + Math.round(Math.sin(angle) * dist) + 'px' +
        ';animation-delay:' + (Math.random() * 0.4) + 's' +
        ';width:' + (4 + Math.random() * 8) + 'px' +
        ';height:' + (4 + Math.random() * 8) + 'px';
      overlay.appendChild(p);
    }
  }

  function showCelebration(data) {
    if (!data || !data.items || !data.items.length) return;

    var items = data.items;
    var type = data.type || 'single';
    var topRarity = items.reduce(function(best, item) {
      var order = ['common','uncommon','rare','epic','legendary','ultra'];
      return order.indexOf(item.rarity) > order.indexOf(best) ? item.rarity : best;
    }, items[0].rarity);

    var color = RARITY_COLORS[topRarity] || '#fff';
    var glow = RARITY_GLOW[topRarity] || 'rgba(255,255,255,.3)';

    var overlay = document.createElement('div');
    overlay.className = 'cr-overlay';

    // Glow burst
    var burst = document.createElement('div');
    burst.className = 'cr-burst';
    burst.style.background = 'radial-gradient(circle,' + glow + ',' + glow + ' 30%,transparent 70%)';
    overlay.appendChild(burst);

    // Particles
    createParticles(overlay, color, items.length > 1 ? 24 : 14);

    // Header
    var header = document.createElement('div');
    header.className = 'cr-header';
    header.style.color = color;
    header.textContent = TYPE_HEADERS[type] || 'COSMETIC WON!';
    overlay.appendChild(header);

    // Player name
    if (data.player) {
      var player = document.createElement('div');
      player.className = 'cr-player';
      player.textContent = data.player;
      overlay.appendChild(player);
    }

    // Items container
    var itemsContainer = document.createElement('div');
    itemsContainer.className = 'cr-items';

    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var ic = RARITY_COLORS[item.rarity] || '#fff';
      var ig = RARITY_GLOW[item.rarity] || 'rgba(255,255,255,.2)';
      var delay = items.length > 1 ? (0.3 + i * 0.7) : 0.3;

      var card = document.createElement('div');
      card.className = 'cr-item';
      card.style.borderColor = ic;
      card.style.setProperty('--delay', delay + 's');
      card.style.setProperty('--glow', ig);
      card.style.setProperty('--rc', ic);

      card.innerHTML =
        '<div class="cr-rarity" style="color:' + ic + '">' +
        (RARITY_LABELS[item.rarity] || item.rarity.toUpperCase()) + '</div>' +
        '<div class="cr-name">' + esc(item.name || 'Unknown') + '</div>' +
        '<div class="cr-category">' + esc(CATEGORY_NAMES[item.category] || item.category || '') + '</div>';

      itemsContainer.appendChild(card);
    }
    overlay.appendChild(itemsContainer);
    document.body.appendChild(overlay);

    // Auto-dismiss
    var duration = items.length > 1 ? 6500 : 4500;
    setTimeout(function() {
      overlay.classList.add('out');
      setTimeout(function() { overlay.remove(); }, 600);
    }, duration);
  }

  // Wait for Socket.IO, then listen
  function waitForIO(cb) {
    if (typeof io !== 'undefined') return cb();
    var tries = 0;
    var t = setInterval(function() {
      if (typeof io !== 'undefined' || ++tries > 50) { clearInterval(t); if (typeof io !== 'undefined') cb(); }
    }, 200);
  }

  // Expose globally so daily-claim.js can trigger celebrations
  window.showCosmeticCelebration = showCelebration;

  function waitForSocket(cb) {
    if (window._gameSocket || window.socket) return cb(window._gameSocket || window.socket);
    var tries = 0;
    var t = setInterval(function() {
      var s = window._gameSocket || window.socket;
      if (s || ++tries > 100) { clearInterval(t); if (s) cb(s); }
    }, 200);
  }

  waitForSocket(function(sock) {
    sock.on('cosmetic-reward', function(data) {
      showCelebration(data);
    });
  });
})();
