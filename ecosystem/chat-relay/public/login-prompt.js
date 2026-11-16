// login-prompt.js — Unified login prompt component.
// Vanilla JS, no deps. Renders a dark rounded card with one headline and
// three equal-weight pill buttons (Google, Discord, GitHub). Same render in
// every host product — portal pages, chat widget, game pages.
//
// Usage:
//   var el = window.LoginPrompt.create({
//     headline: 'Sign in to save your stats',  // optional, default shown
//     providers: ['google', 'discord', 'github'],  // optional, default order
//     returnTo: '/some/path',                  // optional, default = current URL
//     onSelect: function(providerId) { ... },  // optional — overrides default navigation
//   });
//   container.appendChild(el);

(function (global) {
  if (global.LoginPrompt && global.LoginPrompt.create) return; // idempotent

  var STYLE_ID = 'lp-style';
  var PROVIDERS = {
    google:  { label: 'Google',  bg: '#f5f3ee',     fg: '#1a1a1d', hover: '#ffffff',                 border: 'transparent' },
    discord: { label: 'Discord', bg: '#5865F2',     fg: '#ffffff', hover: '#6b76f5',                 border: 'transparent' },
    github:  { label: 'GitHub',  bg: 'transparent', fg: '#ffffff', hover: 'rgba(255,255,255,0.08)',  border: 'rgba(255,255,255,0.22)' }
  };

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.lp-card{position:relative;display:inline-flex;flex-direction:column;gap:10px;',
      '  min-width:280px;max-width:380px;padding:14px;',
      '  background:rgba(20,20,26,0.22);',
      '  backdrop-filter:blur(14px) saturate(140%);',
      '  -webkit-backdrop-filter:blur(14px) saturate(140%);',
      '  border:1px solid rgba(255,255,255,0.08);',
      '  border-radius:14px;box-shadow:0 4px 14px rgba(0,0,0,0.18);',
      '  font-family:Geist,system-ui,-apple-system,"Segoe UI",sans-serif;color:#fff;',
      '  box-sizing:border-box;}',
      '.lp-headline{font-size:14px;font-weight:500;letter-spacing:-0.005em;',
      '  color:rgba(255,255,255,0.92);padding:2px 30px 0 4px;}',
      // Close (X) — top-right corner of every prompt card.
      '.lp-close{position:absolute;top:8px;right:8px;width:22px;height:22px;',
      '  display:inline-flex;align-items:center;justify-content:center;padding:0;',
      '  border:none;border-radius:6px;background:transparent;',
      '  color:rgba(255,255,255,0.5);font-size:18px;line-height:1;cursor:pointer;',
      '  font-family:inherit;transition:background .15s ease,color .15s ease;}',
      '.lp-close:hover{background:rgba(255,255,255,0.10);color:rgba(255,255,255,0.95);}',
      '.lp-row{display:flex;gap:8px;}',
      '.lp-btn{appearance:none;flex:1;min-height:36px;padding:9px 10px;',
      '  border-radius:10px;border:1px solid transparent;',
      '  font-family:inherit;font-size:14px;font-weight:500;letter-spacing:-0.005em;',
      '  cursor:pointer;display:inline-flex;align-items:center;justify-content:center;',
      '  text-decoration:none;line-height:1;',
      '  transition:background .15s ease, transform .12s ease;}',
      '.lp-btn:hover{transform:translateY(-0.5px);}',
      '.lp-btn.lp-loading{cursor:progress;transform:none;}',
      '.lp-spinner{width:14px;height:14px;border-radius:50%;display:inline-block;',
      '  border:2px solid currentColor;border-top-color:transparent;',
      '  animation:lp-spin 0.8s linear infinite;}',
      '@keyframes lp-spin{to{transform:rotate(360deg);}}',
      // Modal backdrop variant — click to dismiss. Body class freezes background scroll.
      '.lp-backdrop{position:fixed;inset:0;z-index:2147483600;',
      '  display:flex;align-items:center;justify-content:center;padding:24px;',
      '  background:rgba(8,6,12,0.55);backdrop-filter:blur(6px) saturate(120%);',
      '  -webkit-backdrop-filter:blur(6px) saturate(120%);',
      '  animation:lp-fade .15s ease;}',
      '@keyframes lp-fade{from{opacity:0;}to{opacity:1;}}',
      'body.lp-modal-open{overflow:hidden;}'
    ].join('');
    document.head.appendChild(s);
  }

  function makeButton(id, opts) {
    var p = PROVIDERS[id];
    if (!p) return null;
    var encoded = encodeURIComponent(opts.returnTo);
    var base = opts.authBase || '';
    var a = document.createElement('a');
    a.className = 'lp-btn';
    a.dataset.provider = id;
    a.href = base + '/auth/' + id + '?returnTo=' + encoded;
    a.style.background = p.bg;
    a.style.color = p.fg;
    a.style.borderColor = p.border;
    a.textContent = p.label;

    a.addEventListener('mouseenter', function () { if (!a.classList.contains('lp-loading')) a.style.background = p.hover; });
    a.addEventListener('mouseleave', function () { if (!a.classList.contains('lp-loading')) a.style.background = p.bg; });

    a.addEventListener('click', function (e) {
      if (a.classList.contains('lp-loading')) { e.preventDefault(); return; }
      // Show spinner while the browser navigates to the OAuth provider.
      a.classList.add('lp-loading');
      var spin = document.createElement('span');
      spin.className = 'lp-spinner';
      spin.style.color = p.fg;
      a.textContent = '';
      a.appendChild(spin);
      if (typeof opts.onSelect === 'function') {
        e.preventDefault();
        opts.onSelect(id);
      }
      // Otherwise let the browser follow the href.
    });
    return a;
  }

  // Suppress the login prompt entirely when the page is loaded as an OBS
  // overlay (?obs=1) or inside a stream-view iframe (?embedGame=1). The
  // streamer-tool surfaces never need viewer auth — they're broadcast
  // sources, not interactive game pages. Returning a detached no-op
  // element keeps callers' .appendChild and .close() paths safe.
  function _isStreamerSurface() {
    try {
      var qs = new URLSearchParams(location.search);
      if (qs.has('obs') || qs.get('embedGame') === '1' || qs.has('streamer_self')) return true;
      // Also suppress when iframed inside a parent on wordgame.live /
      // wordtycoon.live so a streamer can preview/embed game pages
      // without a login modal appearing on top.
      if (window.parent && window.parent !== window) {
        try {
          var refHost = (document.referrer ? new URL(document.referrer).host : '').toLowerCase();
          if (refHost === 'wordgame.live' || refHost.endsWith('.wordgame.live')
              || refHost === 'wordtycoon.live' || refHost.endsWith('.wordtycoon.live')) return true;
        } catch (_) {}
      }
    } catch (_) {}
    return false;
  }
  function _noopElement() {
    var el = document.createElement('div');
    el.style.display = 'none';
    el.close = function () {};
    el.dismiss = function () {};
    return el;
  }

  function create(opts) {
    if (_isStreamerSurface()) return _noopElement();
    opts = opts || {};
    injectStyles();

    var headline   = typeof opts.headline === 'string' ? opts.headline : 'Sign in to save your stats';
    var providers  = Array.isArray(opts.providers) && opts.providers.length
      ? opts.providers : ['google', 'discord', 'github'];
    var returnTo   = typeof opts.returnTo === 'string'
      ? opts.returnTo
      : (global.location.pathname + global.location.search);

    var card = document.createElement('div');
    card.className = 'lp-card';

    // Close (X) — dismissible on every prompt. Default behaviour removes the
    // card from the DOM; showModal() overrides card._lpDismiss to tear down the
    // whole overlay instead. onDismiss (if given) fires in both cases.
    var closeBtn = document.createElement('button');
    closeBtn.className = 'lp-close';
    closeBtn.type = 'button';
    closeBtn.setAttribute('aria-label', 'Close');
    closeBtn.innerHTML = '&times;';
    card._lpDismiss = function () {
      if (typeof opts.onDismiss === 'function') opts.onDismiss();
      if (card.parentNode) card.parentNode.removeChild(card);
    };
    closeBtn.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      card._lpDismiss();
    });
    card.appendChild(closeBtn);

    var h = document.createElement('div');
    h.className = 'lp-headline';
    h.textContent = headline;
    card.appendChild(h);

    var row = document.createElement('div');
    row.className = 'lp-row';
    for (var i = 0; i < providers.length; i++) {
      var btn = makeButton(providers[i], { returnTo: returnTo, authBase: opts.authBase, onSelect: opts.onSelect });
      if (btn) row.appendChild(btn);
    }
    card.appendChild(row);

    return card;
  }

  // showModal — display the prompt as a centered overlay with a dismissible
  // backdrop. Returns a close() function. Clicking the backdrop (but not the
  // prompt itself) calls onDismiss + close().
  //
  //   var modal = LoginPrompt.showModal({ headline: '...', onDismiss: fn });
  //   modal.close();  // programmatic dismiss
  function showModal(opts) {
    if (_isStreamerSurface()) return _noopElement();
    opts = opts || {};
    injectStyles();
    var backdrop = document.createElement('div');
    backdrop.className = 'lp-backdrop';
    var card = create(opts);
    backdrop.appendChild(card);

    // Route the card's X to full modal teardown (onDismiss + close), instead of
    // the default "remove just the card" behaviour from create().
    card._lpDismiss = function () {
      if (typeof opts.onDismiss === 'function') opts.onDismiss();
      close();
    };

    var closed = false;
    function close() {
      if (closed) return;
      closed = true;
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
      document.body.classList.remove('lp-modal-open');
      document.removeEventListener('keydown', onKey, true);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        if (typeof opts.onDismiss === 'function') opts.onDismiss();
        close();
      }
    }
    backdrop.addEventListener('click', function (e) {
      // Only dismiss when the click originates on the backdrop itself, not on
      // the prompt or any descendant — otherwise button presses would close.
      if (e.target !== backdrop) return;
      if (typeof opts.onDismiss === 'function') opts.onDismiss();
      close();
    });
    document.addEventListener('keydown', onKey, true);
    document.body.classList.add('lp-modal-open');
    document.body.appendChild(backdrop);
    return { close: close, element: backdrop };
  }

  global.LoginPrompt = { create: create, showModal: showModal };
})(window);
