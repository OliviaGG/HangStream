// ===== Jackpot Toast Notification =====
// Self-contained script for showing "Jackpot Won!" toasts across all pages.
// Include via: <script src="/portal/js/jackpot-toast.js"></script>
// Connects to same-origin Socket.IO to listen for 'jackpot-toast' events.
// Users can disable via localStorage: wt-jackpot-toast-off = '1'

(function() {
  // Inject CSS
  var style = document.createElement('style');
  style.textContent = [
    '.jackpot-toast-container { position:fixed; top:70px; left:50%; transform:translateX(-50%); z-index:10001; pointer-events:none; display:flex; flex-direction:column; align-items:center; gap:8px; }',
    '.jackpot-toast { pointer-events:auto; display:flex; align-items:center; gap:10px; padding:12px 20px; border-radius:12px;',
    '  background:linear-gradient(135deg,#1a1a2e 0%,#16213e 100%); border:2px solid #ffd700;',
    '  box-shadow:0 4px 24px rgba(255,215,0,0.3),0 0 40px rgba(255,215,0,0.1);',
    '  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif; color:#fff; font-size:14px; font-weight:600;',
    '  animation:jackpotSlideIn 0.5s cubic-bezier(0.22,1,0.36,1),jackpotPulse 0.6s 0.5s ease; min-width:280px; max-width:420px; }',
    '.jackpot-toast .jt-icon { font-size:28px; flex-shrink:0; animation:jackpotSpin 1s ease; }',
    '.jackpot-toast .jt-body { flex:1; }',
    '.jackpot-toast .jt-player { color:#ffd700; font-weight:700; }',
    '.jackpot-toast .jt-amount { color:#4ade80; font-weight:800; }',
    '.jackpot-toast .jt-game { color:#a78bfa; font-weight:600; }',
    '.jackpot-toast .jt-label { font-size:11px; color:#888; text-transform:uppercase; letter-spacing:1px; margin-top:2px; }',
    '.jackpot-toast.fade-out { opacity:0; transform:translateY(-20px); transition:opacity 0.5s,transform 0.5s; }',
    '@keyframes jackpotSlideIn { from{opacity:0;transform:translateY(-40px)} to{opacity:1;transform:translateY(0)} }',
    '@keyframes jackpotPulse { 0%{transform:scale(1)} 50%{transform:scale(1.03)} 100%{transform:scale(1)} }',
    '@keyframes jackpotSpin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }'
  ].join('\n');
  document.head.appendChild(style);

  // Create container
  var container = document.createElement('div');
  container.className = 'jackpot-toast-container';
  document.body.appendChild(container);

  function showJackpotToast(data) {
    // Check user preference
    if (localStorage.getItem('wt-jackpot-toast-off') === '1') return;

    var player = (data.winner && data.winner.displayName) || 'Someone';
    var amount = (data.jackpot || 0).toLocaleString();
    var game = data.gameName || data.game || 'a game';

    var toast = document.createElement('div');
    toast.className = 'jackpot-toast';
    toast.innerHTML =
      '<span class="jt-icon">\uD83C\uDFB0</span>' +
      '<div class="jt-body">' +
        '<div><span class="jt-player">' + escapeHtml(player) + '</span> won <span class="jt-amount">' + amount + ' coins</span></div>' +
        '<div class="jt-label">\uD83D\uDCB0 Jackpot in <span class="jt-game">' + escapeHtml(game) + '</span></div>' +
      '</div>';

    container.appendChild(toast);

    // Auto-dismiss after 6s
    setTimeout(function() {
      toast.classList.add('fade-out');
      setTimeout(function() { toast.remove(); }, 500);
    }, 6000);
  }

  function escapeHtml(s) {
    var d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Wait for Socket.IO
  function waitForIO(cb) {
    if (typeof io !== 'undefined') return cb();
    var tries = 0;
    var t = setInterval(function() {
      if (typeof io !== 'undefined' || ++tries > 50) { clearInterval(t); if (typeof io !== 'undefined') cb(); }
    }, 200);
  }

  waitForIO(function() {
    var sock = window._gameSocket || window.socket || io({ reconnection: true, transports: ['polling', 'websocket'] });
    sock.on('jackpot-toast', function(data) {
      showJackpotToast(data);
    });
  });

  // Expose for testing
  window._showJackpotToast = showJackpotToast;
})();
