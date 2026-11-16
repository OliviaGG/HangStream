// Session "disable player page" gate v2 — full-screen block.
//
// On a session-bound page (?session=<h> or path /<h>), if the streamer has
// "Disable player page" on, this script renders an opaque overlay over
// everything with a "Join the live stream" CTA pointing to the streamer's
// TikTok Live. The game is unreachable from the browser; viewers must
// watch the live stream and chat their guesses there.
//
// Bypass: ?streamer_self=1 in the URL OR localStorage flag set on a prior
// visit with the param. Lets the streamer view their own game page without
// the block (used as an OBS source or for screenshare).
//
// Two trigger paths:
//   (a) URL has ?disabled=1 (server already redirected, fast path)
//   (b) URL has ?session=<h> only — fetch /api/streamer-handles to check
(function () {
  try {
    var params = new URLSearchParams(location.search);
    var sessionHandle = (params.get('session') || '').toLowerCase();
    if (!sessionHandle) {
      var m = location.pathname.match(/^\/([a-z0-9_-]{1,32})\/?$/);
      if (m) sessionHandle = m[1].toLowerCase();
    }
    if (!sessionHandle) return;
    if (params.get('obs') === '1') return;
    if (document.documentElement.classList.contains('obs-overlay-mode')) return;
    // OBS browser source detection — bypass even if URL flags are missing.
    try { if (/OBS/i.test(navigator.userAgent || '')) return; } catch (_) {}
    // Searchle reuses dist/index.html for the OBS overlay route. The /stream
    // path is OBS-only, regardless of query params.
    try { if (/^\/stream(\/|$)/.test(location.pathname || '')) return; } catch (_) {}

    // Streamer-self bypass. Persist to localStorage so the streamer can
    // bookmark the plain handle URL after one priming visit with the flag.
    // Cleared by visiting `?streamer_self=0`.
    var SELF_KEY = 'wt_streamer_self_' + sessionHandle;
    if (params.get('streamer_self') === '1') {
      try { localStorage.setItem(SELF_KEY, '1'); } catch (_) {}
      return;
    }
    if (params.get('streamer_self') === '0') {
      try { localStorage.removeItem(SELF_KEY); } catch (_) {}
      // Continue evaluating gate below.
    } else {
      try {
        if (localStorage.getItem(SELF_KEY) === '1') return;
      } catch (_) {}
    }

    var RELAY_ORIGIN =
      location.hostname === 'wordtycoon.live' || location.hostname === 'www.wordtycoon.live'
        ? ''
        : 'https://wordtycoon.live';

    // Fast path: server already told us via ?disabled=1. Render overlay
    // immediately with placeholder, then fetch tiktokUsername for the link.
    if (params.get('disabled') === '1') {
      applyBlockGate({ tiktokUsername: null, displayName: sessionHandle });
      fetchAndUpdateLink();
      return;
    }

    // Slow path: ask chat-relay if this session has the flag on.
    fetch(RELAY_ORIGIN + '/api/streamer-handles')
      .then(function (r) { return r && r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || !Array.isArray(data.settings)) return;
        var entry = null;
        for (var i = 0; i < data.settings.length; i++) {
          if (data.settings[i] && data.settings[i].handle === sessionHandle) {
            entry = data.settings[i];
            break;
          }
        }
        if (!entry || !entry.disablePlayerPage) return;
        applyBlockGate({
          tiktokUsername: entry.tiktokUsername || null,
          displayName: entry.displayName || sessionHandle,
        });
      })
      .catch(function () {});

    function fetchAndUpdateLink() {
      fetch(RELAY_ORIGIN + '/api/streamer-handles')
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !Array.isArray(data.settings)) return;
          for (var i = 0; i < data.settings.length; i++) {
            var e = data.settings[i];
            if (e && e.handle === sessionHandle && e.tiktokUsername) {
              renderCta(e.tiktokUsername);
              break;
            }
          }
        })
        .catch(function () {});
    }

    function applyBlockGate(opts) {
      window.__STREAM_DISABLED = true;
      var ttUser = opts && opts.tiktokUsername ? String(opts.tiktokUsername).replace(/^@/, '') : '';
      var displayName = (opts && opts.displayName) || sessionHandle;

      function addBodyClass() {
        if (document.body) document.body.classList.add('stream-disabled');
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', addBodyClass);
      } else { addBodyClass(); }

      function inject() {
        if (document.getElementById('session-block-overlay')) return;
        var root = document.createElement('div');
        root.id = 'session-block-overlay';
        root.style.cssText = [
          'position:fixed', 'inset:0', 'z-index:2147483647',
          'background:radial-gradient(ellipse at 50% 0%, rgba(90,182,255,0.18), transparent 50%), #0b0f18',
          'color:#eef4ff',
          'font-family:"Segoe UI",system-ui,-apple-system,sans-serif',
          'display:flex', 'flex-direction:column', 'align-items:center', 'justify-content:center',
          'padding:24px', 'text-align:center', 'overflow:auto'
        ].join(';');

        var card = document.createElement('div');
        card.style.cssText = [
          'max-width:420px', 'width:100%',
          'background:rgba(19,28,45,0.92)',
          'border:1px solid rgba(255,255,255,0.08)',
          'border-radius:16px',
          'padding:32px 28px'
        ].join(';');
        card.innerHTML =
          '<div style="display:inline-flex;align-items:center;gap:8px;padding:6px 14px;border-radius:999px;background:rgba(248,113,113,0.14);border:1px solid rgba(248,113,113,0.35);font-size:0.78rem;font-weight:700;color:#f87171;letter-spacing:0.6px;text-transform:uppercase;margin-bottom:16px;">● LIVE</div>' +
          '<h1 style="font-size:1.6rem;font-weight:800;margin:0 0 12px;line-height:1.2;">Streamer page is off</h1>' +
          '<p style="color:#96a8c6;margin:0 0 22px;line-height:1.5;">' +
            esc(displayName) +
            ' has turned off the player page on this site. To play, join the live stream on TikTok &mdash; chat your guesses there.' +
          '</p>' +
          '<div id="sbo-cta-wrap"></div>';

        root.appendChild(card);

        if (document.body) {
          document.body.style.overflow = 'hidden';
          document.body.appendChild(root);
        } else {
          document.addEventListener('DOMContentLoaded', function () {
            document.body.style.overflow = 'hidden';
            document.body.appendChild(root);
          });
        }
        renderCta(ttUser);
      }
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', inject);
      } else { inject(); }

      // Defense in depth: drop guess emits even if overlay somehow fails.
      var DROP_EVENTS = { guess: 1, 'play-guess': 1, 'test-guess': 1, 'submit-guess': 1, 'submit-word': 1, word: 1 };
      var attempts = 0;
      var poll = setInterval(function () {
        attempts++;
        var s = window.socket || window.__SOCKET || (typeof socket !== 'undefined' ? socket : null);
        if (s && typeof s.emit === 'function' && !s.__streamDisableWrapped) {
          var orig = s.emit.bind(s);
          s.emit = function (ev) {
            if (DROP_EVENTS[ev]) return s;
            return orig.apply(null, arguments);
          };
          s.__streamDisableWrapped = true;
          clearInterval(poll);
        } else if (attempts > 100) {
          clearInterval(poll);
        }
      }, 100);
    }

    function renderCta(ttUser) {
      var wrap = document.getElementById('sbo-cta-wrap');
      if (!wrap) return;
      if (ttUser) {
        var url = 'https://www.tiktok.com/@' + encodeURIComponent(ttUser) + '/live';
        wrap.innerHTML =
          '<a href="' + url + '" target="_blank" rel="noopener" style="' +
            'display:inline-flex;align-items:center;gap:8px;padding:14px 22px;' +
            'background:linear-gradient(135deg,#5ab6ff,#9e7bff);color:#0b0f18;' +
            'font-weight:800;text-decoration:none;border-radius:10px;font-size:0.96rem;">' +
            'Join @' + esc(ttUser) + ' live on TikTok →' +
          '</a>';
      } else {
        wrap.innerHTML =
          '<div style="display:inline-block;padding:14px 22px;background:rgba(255,255,255,0.04);' +
            'border:1px solid rgba(255,255,255,0.08);border-radius:10px;color:#96a8c6;font-size:0.92rem;">' +
            'Live on the streamer\'s TikTok' +
          '</div>';
      }
    }

    function esc(s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;')
        .replace(/>/g, '&gt;').replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    // Proactive poll: streamer might flip the disable toggle on while
    // viewers are mid-round. Re-check every 15s; on first true reading,
    // apply the block without waiting for a refresh. (Un-flip is one-way:
    // a viewer who got kicked stays kicked until they refresh.)
    var POLL_MS = 15000;
    var _pollTimer = setInterval(function () {
      if (document.getElementById('session-block-overlay')) {
        clearInterval(_pollTimer);
        return;
      }
      fetch(RELAY_ORIGIN + '/api/streamer-handles')
        .then(function (r) { return r && r.ok ? r.json() : null; })
        .then(function (data) {
          if (!data || !Array.isArray(data.settings)) return;
          for (var i = 0; i < data.settings.length; i++) {
            var e = data.settings[i];
            if (e && e.handle === sessionHandle && e.disablePlayerPage) {
              clearInterval(_pollTimer);
              applyBlockGate({
                tiktokUsername: e.tiktokUsername || null,
                displayName: e.displayName || sessionHandle,
              });
              break;
            }
          }
        })
        .catch(function () {});
    }, POLL_MS);
  } catch (_) {}
})();
