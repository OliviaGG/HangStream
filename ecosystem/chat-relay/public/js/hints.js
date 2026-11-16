// Shared hint button helper for Word Tycoon games.
// Serves from https://wordtycoon.live/js/hints.js
//
// Usage:
//   WTHints.init({
//     container: document.getElementById('hint-wrap'),
//     game: 'wordle',
//     onSuccess: (data) => { /* apply the hint effect in your game */ },
//     onError: (msg) => { /* show toast */ }
//   });
//
(function (global) {
  'use strict';

  const DEFAULTS = {
    container: null,
    gameServerUrl: '',
    game: '',
    onSuccess: null,
    onError: null,
    buttonText: 'Hint',
    noHintsText: 'No hints left',
    buyHintsText: 'Get hints',
    loadingText: '…',
    rechargeUrl: 'https://wordtycoon.live/portal/profile.html?tab=hints',
    idempotent: false, // opt-in: the game must implement durable reveal receipts
    storageKey: null,
    extraBody: null, // extra fields merged into /api/hints/use POST body
  };

  let stylesInjected = false;

  function injectStyles() {
    if (stylesInjected) return;
    stylesInjected = true;
    if (!document.head) return;
    const css = document.createElement('style');
    css.textContent = `
      .wt-hint-button {
        position: relative;
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        font-size: 14px;
        font-weight: 600;
        line-height: 1;
        color: #fff;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        border: none;
        border-radius: 999px;
        cursor: pointer;
        user-select: none;
        box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        transition: opacity 0.15s ease, transform 0.05s ease;
      }
      .wt-hint-button:hover:not(:disabled) { opacity: 0.92; }
      .wt-hint-button:active:not(:disabled) { transform: translateY(1px); }
      .wt-hint-button:disabled {
        background: #6b7280;
        cursor: not-allowed;
        opacity: 0.7;
      }
      .wt-hint-button.wt-hint-loading { opacity: 0.7; }
      .wt-hint-badge {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 18px;
        height: 18px;
        padding: 0 5px;
        font-size: 11px;
        font-weight: 700;
        color: #78350f;
        background: rgba(255,255,255,0.9);
        border-radius: 999px;
      }
    `;
    document.head.appendChild(css);
  }

  function init(opts) {
    const config = Object.assign({}, DEFAULTS, opts || {});
    if (!config.container) {
      console.error('[WTHints] container is required');
      return null;
    }
    if (!config.game) {
      console.error('[WTHints] game identifier is required');
      return null;
    }

    injectStyles();

    const container = typeof config.container === 'string'
      ? document.querySelector(config.container)
      : config.container;
    if (!container) {
      console.error('[WTHints] container not found');
      return null;
    }

    const btn = document.createElement('button');
    btn.className = 'wt-hint-button';
    btn.type = 'button';
    btn.innerHTML = `<span class="wt-hint-label">${escapeHtml(config.buttonText)}</span><span class="wt-hint-badge">${escapeHtml(config.loadingText)}</span>`;
    btn.title = 'Loading hints…';
    btn.addEventListener('click', () => onHintButtonClick(config, btn));
    container.appendChild(btn);

    const api = {
      refresh: () => refresh(config, btn),
      getRemaining: () => btn ? Number(btn.querySelector('.wt-hint-badge')?.dataset.remaining || 0) : 0,
    };

    // A reload only looks up an unresolved purchase; it never spends by itself.
    setTimeout(async () => {
      await refresh(config, btn);
      if (pendingHint(config)) { btn.disabled = false; await useHint(config, btn, true); }
    }, 0);
    return api;
  }

  function getBaseUrl(config) {
    if (config.gameServerUrl) return String(config.gameServerUrl).replace(/\/$/, '');
    // When served through Chat Relay's /game/:id/ proxy, derive the proxy base
    // from the URL so hints work even if the page was cached before the relay's
    // fetch-rewrite shim was injected.
    const m = /^\/game\/([^/]+)/.exec(window.location.pathname || '');
    if (m) return `/game/${m[1]}`;
    return '';
  }

  async function refresh(config, btn) {
    if (!btn) return;
    setLoading(btn, true);
    try {
      const res = await fetch(`${getBaseUrl(config)}/api/hints/remaining`, { credentials: 'same-origin' });
      const data = await res.json();
      const remaining = data.ok ? Math.max(0, Number(data.remaining) || 0) : 0;
      updateButton(btn, config, remaining);
    } catch (e) {
      console.error('[WTHints] refresh failed:', e.message);
      updateButton(btn, config, 0, true);
    } finally {
      setLoading(btn, false);
    }
  }

  function onHintButtonClick(config, btn) {
    if (!btn || btn.classList.contains('wt-hint-loading')) return;
    if (!pendingHint(config) && typeof config.canUse === 'function') {
      const allowed = config.canUse();
      if (allowed !== true) {
        if (typeof config.onError === 'function') config.onError(typeof allowed === 'string' ? allowed : 'Hints are unavailable for this puzzle.');
        return;
      }
    }
    const remaining = Number(btn.querySelector('.wt-hint-badge')?.dataset.remaining || 0);
    if (remaining <= 0 && config.rechargeUrl && !pendingHint(config)) {
      window.open(config.rechargeUrl, '_blank', 'noopener');
      return;
    }
    useHint(config, btn);
  }

  function pendingHint(config) {
    if (!config.idempotent) return null;
    try {
      const body = JSON.parse(sessionStorage.getItem(config.storageKey) || 'null');
      return body && typeof body.actionId === 'string' ? body : null;
    } catch (_) { return null; }
  }

  async function useHint(config, btn, recoverOnly = false) {
    if (!btn || btn.disabled || btn.classList.contains('wt-hint-loading')) return;
    setLoading(btn, true);
    try {
      const body = { game: config.game };
      if (config.extraBody) {
        const extra = typeof config.extraBody === 'function' ? config.extraBody() : config.extraBody;
        if (extra && typeof extra === 'object') Object.assign(body, extra);
      }
      let requestBody = body;
      if (config.idempotent) {
        requestBody = pendingHint(config);
        if (!requestBody) {
          if (recoverOnly) return;
          requestBody = { ...body, actionId: global.crypto.randomUUID() };
          // Refuse a purchase when this tab cannot retain its retry identity.
          sessionStorage.setItem(config.storageKey, JSON.stringify(requestBody));
        }
      }
      const res = await fetch(`${getBaseUrl(config)}/api/hints/use`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ ...requestBody, ...(recoverOnly ? { recoverOnly: true } : {}) }),
      });
      const data = await res.json();
      if (!data.ok) {
        if (config.idempotent && (res.status >= 500 || res.status === 401 || data.error === 'hint_retry_required')) {
          if (typeof config.onError === 'function') config.onError(res.status === 401 ? 'Sign in again to recover this hint' : 'Hint pending — click again to recover it');
          return;
        }
        if (config.idempotent && data.reason === 'hint_receipt_missing') {
          if (typeof config.onError === 'function') config.onError('No saved hint yet — click Hint to retry');
          return;
        }
        if (config.idempotent) sessionStorage.removeItem(config.storageKey);
        const msg = data.reason === 'no_hints_remaining'
          ? config.noHintsText
          : ({ nothing_to_reveal: 'Nothing left to reveal', round_changed: 'That round ended. No hint was used.', hint_expired: 'This hint expired before delivery. Your allowance was restored.', refresh_required: 'Refresh this page to use hints' }[data.reason || data.error] || data.error || data.reason || 'Hint failed');
        if (typeof config.onError === 'function') config.onError(msg);
        updateButton(btn, config, Number.isFinite(data.remaining) ? data.remaining : 0);
        return;
      }
      const remaining = Math.max(0, Number(data.remaining) || 0);
      updateButton(btn, config, remaining);
      if (typeof config.onSuccess === 'function') config.onSuccess(data);
      if (config.idempotent) sessionStorage.removeItem(config.storageKey);
    } catch (e) {
      console.error('[WTHints] use failed:', e.message);
      if (typeof config.onError === 'function') config.onError(config.idempotent ? 'Hint pending — click again to recover it' : 'Network error');
    } finally {
      setLoading(btn, false);
      if (pendingHint(config)) {
        btn.disabled = false;
        const label = btn.querySelector('.wt-hint-label');
        if (label) label.textContent = 'Retry hint';
        btn.title = 'Recover your pending hint without another charge';
      }
    }
  }

  function updateButton(btn, config, remaining, error) {
    const badge = btn.querySelector('.wt-hint-badge');
    const label = btn.querySelector('.wt-hint-label');
    if (!badge) return;
    badge.dataset.remaining = String(remaining);
    btn.disabled = error;
    if (error) {
      badge.textContent = '!';
      btn.title = 'Could not load hints';
      if (label) label.textContent = config.buttonText;
    } else if (remaining <= 0) {
      badge.textContent = '0';
      btn.title = `${config.noHintsText} — click to buy more`;
      if (label) label.textContent = config.buyHintsText;
    } else {
      badge.textContent = String(remaining);
      btn.title = `${remaining} hint${remaining === 1 ? '' : 's'} left this month`;
      if (label) label.textContent = config.buttonText;
    }
  }

  function setLoading(btn, loading) {
    btn.classList.toggle('wt-hint-loading', loading);
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  }

  global.WTHints = { init };
}(typeof window !== 'undefined' ? window : this));
