// ===== Library Word Toast =====
// Self-contained script for showing "Word Found!" toasts across all games.
// Include via: <script src="/portal/js/library-toast.js" data-mode="mp"></script>
//   data-mode="mp"      → show player name (for overlays/MP pages)
//   data-mode="player"  → only show self-found words (for MP player pages)
//   data-mode="sp"      → no player name (for SP pages)
// Connects to same-origin Socket.IO to listen for 'library-word-new' events.

(function() {
  function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // Determine mode from script tag attribute
  var scripts = document.querySelectorAll('script[src*="library-toast"]');
  var mode = 'mp';
  for (var i = 0; i < scripts.length; i++) {
    if (scripts[i].dataset.mode) mode = scripts[i].dataset.mode;
  }

  // Wait for Socket.IO to be available, then connect
  function waitForIO(cb) {
    if (typeof io !== 'undefined') return cb();
    var tries = 0;
    var t = setInterval(function() {
      if (typeof io !== 'undefined' || ++tries > 50) { clearInterval(t); if (typeof io !== 'undefined') cb(); }
    }, 200);
  }

  function waitForSocket(cb) {
    if (window._gameSocket || window.socket) return cb(window._gameSocket || window.socket);
    var tries = 0;
    var t = setInterval(function() {
      var s = window._gameSocket || window.socket;
      if (s || ++tries > 100) { clearInterval(t); if (s) cb(s); }
    }, 200);
  }

  waitForSocket(function(sock) {

    sock.on('library-word-new', function(data) {
      if (!data || !data.word) return;
      // In player mode, only show self-targeted toasts (not broadcasts)
      if (mode === 'player' && !data.self) return;
      showToast(data.word, mode === 'mp' ? data.displayName : null);
    });
  });

  // Inject CSS once
  var style = document.createElement('style');
  style.textContent =
    '.wt-lib-toast{position:fixed;top:16px;right:16px;display:flex;align-items:center;gap:10px;' +
    'background:linear-gradient(135deg,#1a0f00,#2d1f0a);border:2px solid #8b6914;border-radius:13px;' +
    'padding:11px 19px 11px 6px;z-index:10000;opacity:0;transform:translateX(50px);' +
    'transition:opacity .35s,transform .35s;pointer-events:none;box-shadow:0 5px 24px rgba(139,105,20,.4);overflow:visible;' +
    'font-family:Inter,Segoe UI,sans-serif}' +
    '.wt-lib-toast.show{opacity:1;transform:translateX(0)}' +
    '.wt-lib-toast.exit-up{opacity:0;transform:translateY(-22px)}' +
    '.wt-lib-toast .tl-logo{width:51px;height:51px;border-radius:50%;flex-shrink:0;' +
    'filter:drop-shadow(0 3px 10px rgba(0,0,0,.5))}' +
    '.wt-lib-toast .tl-text{display:flex;flex-direction:column}' +
    '.wt-lib-toast .tl-header{font-size:11px;font-weight:700;color:#f5deb3;line-height:1.2}' +
    '.wt-lib-toast .tl-word{font-size:18px;font-weight:800;color:#ffd700;letter-spacing:1px;line-height:1.2}' +
    '.wt-lib-toast .tl-player{font-size:10px;color:#c0a050;margin-top:2px;font-weight:600}' +
    '[data-theme="light"] .wt-lib-toast{background:linear-gradient(135deg,#fff8e1,#fff3cd);border-color:#d4a017;' +
    'box-shadow:0 6px 30px rgba(212,160,23,.3)}' +
    '[data-theme="light"] .wt-lib-toast .tl-header{color:#5d4200}' +
    '[data-theme="light"] .wt-lib-toast .tl-word{color:#b8860b}' +
    '[data-theme="light"] .wt-lib-toast .tl-player{color:#8b7030}' +
    '@media(max-width:768px){' +
    '.wt-lib-toast{top:8px;right:8px;gap:6px;padding:6px 10px 6px 4px;border-radius:8px;border-width:1.5px;' +
    'box-shadow:0 3px 12px rgba(139,105,20,.3)}' +
    '.wt-lib-toast .tl-logo{width:28px;height:28px}' +
    '.wt-lib-toast .tl-header{font-size:7px}' +
    '.wt-lib-toast .tl-word{font-size:12px;letter-spacing:0.5px}' +
    '.wt-lib-toast .tl-player{font-size:7px}}';
  document.head.appendChild(style);

  var _activeToast = null;
  var _activeTimer = null;

  function dismissActive() {
    if (!_activeToast) return;
    clearTimeout(_activeTimer);
    var old = _activeToast;
    _activeToast = null;
    _activeTimer = null;
    old.classList.remove('show');
    old.classList.add('exit-up');
    setTimeout(function() { if (old.parentNode) old.remove(); }, 350);
  }

  function showToast(word, displayName) {
    dismissActive();
    var t = document.createElement('div');
    t.className = 'wt-lib-toast';
    var html = '<img class="tl-logo" src="/portal/img/logo.png" alt="">' +
      '<div class="tl-text"><div class="tl-header">Word Found!</div>' +
      '<div class="tl-word">' + esc(word.toUpperCase()) + '</div>';
    if (displayName) html += '<div class="tl-player">' + esc(displayName) + '</div>';
    html += '</div>';
    t.innerHTML = html;
    document.body.appendChild(t);
    _activeToast = t;
    setTimeout(function() { t.classList.add('show'); }, 10);
    _activeTimer = setTimeout(function() {
      if (_activeToast === t) dismissActive();
    }, 4000);
  }
})();
