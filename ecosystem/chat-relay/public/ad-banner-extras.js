// ─── ad-banner-extras.js ────────────────────────────────────────────────────
// Shared upgrades for every ad-vertical-*.html OBS banner (loaded with
// <script defer> at the end of each page):
//   1. Live chip  — "🔴 LIVE · <viewers>" pill fed by /api/streamers/live
//   2. Win moment — big name + word + jackpot burst on game-win (own socket,
//                   same room scoping as the host page)
//   3. Motion     — slightly slower letter scroll + gentle ripple drift
// Self-contained: derives the game id from its own filename, so one file
// serves all banners.
// NOTE (2026-07-21): the QR card was removed along with the domain letter
// tiles — TikTok flags URLs/scannable links on stream. Do not reintroduce.
(function () {
  'use strict';

  // no-op on the wrapper page (ad-vertical.html) — the inner banner iframe
  // runs its own copy; running here too would double the chip/win bursts
  if (document.getElementById('overlay-frame')) return;

  const qs = new URLSearchParams(location.search);

  // ── layout params — applied even in bg-layer mode ──
  // ?bg=transparent | ?bg=%23rrggbb — override the page's own gradient so
  // the widget system's glass/background controls can show through.
  const bgParam = (qs.get('bg') || '').trim().toLowerCase();
  if (bgParam === 'transparent' || /^#[0-9a-f]{3,8}$/.test(bgParam)) {
    const bgStyle = document.createElement('style');
    bgStyle.textContent = 'html, body { background: ' + (bgParam === 'transparent' ? 'transparent' : bgParam) + ' !important; }';
    document.head.appendChild(bgStyle);
  }
  // ?orient=h — horizontal banner: the vertical letter strip becomes a
  // ticker running across the middle of the 2000×2000 page.
  const horizontal = (qs.get('orient') || '').trim().toLowerCase() === 'h';
  if (horizontal) {
    document.body.classList.add('adx-h');
    const hStyle = document.createElement('style');
    hStyle.textContent = [
      'body.adx-h .ad-strip { width:2000px; height:100px; top:50%; left:0; transform:translateY(-50%); }',
      'body.adx-h .scroll-inner { flex-direction:row; width:max-content; animation-name:adxScrollLeft; }',
      '@keyframes adxScrollLeft { 0% { transform:translateX(0); } 100% { transform:translateX(-50%); } }',
      'body.adx-h .scroll-inner > div { display:flex; align-items:center; }',
      'body.adx-h .v-letter, body.adx-h .v-word { width:auto; height:100px; padding:0 7px; }',
      'body.adx-h .v-letter.dot { padding:0 3px; }',
      'body.adx-h .ad-logo-row { width:auto; height:100px; padding:0 18px; }',
      'body.adx-h .spacer { width:80px; height:auto; flex:0 0 auto; }',
      'body.adx-h .diag-section { width:340px; height:100px; flex:0 0 auto; }',
      'body.adx-h .diag-ribbon.r1 { top:4px; left:18%; }',
      'body.adx-h .diag-ribbon.r2 { top:26px; left:52%; }',
      'body.adx-h .diag-ribbon.r3 { top:10px; left:84%; }',
      // extras repositions for the horizontal band
      'body.adx-h .adx-live { left:190px; top:calc(50% - 110px); transform:none; }',
      'body.adx-h .adx-win { top:50%; }',
    ].join('\n');
    document.head.appendChild(hStyle);
  }

  // background layer gets art only — no chips/celebrations
  if ((qs.get('layer') || '').trim().toLowerCase() === 'bg') return;
  const streamer = (qs.get('streamer') || '').trim().toLowerCase();

  const m = location.pathname.match(/ad-vertical-([a-z0-9_-]+)\.html/i);
  const gameId = (m ? m[1] : 'wordtycoon').toLowerCase();

  // same-game check with family aliases (searchle-grid → searchle, sproutle ↔ erectangled)
  function gameBase(id) {
    const s = String(id || '').toLowerCase();
    if (s === 'sproutle') return 'erectangled';
    if (s === 'betweenly') return 'betwixt';
    return s.split('-')[0];
  }
  function isSameGame(otherId) {
    if (gameId === 'generic' || gameId === 'wordtycoon') return true;
    return gameBase(otherId) === gameBase(gameId);
  }

  // ── injected styles ──
  const style = document.createElement('style');
  style.textContent = [
    // motion pass: ease the scroll, drift the ripple (transform-only, 30fps-safe)
    '.scroll-inner { animation-duration: 240s !important; }',
    '.ripple-layer canvas { animation: adxDrift 90s ease-in-out infinite alternate; }',
    '@keyframes adxDrift { from { transform: translateY(0); } to { transform: translateY(-26px); } }',
    // live chip
    '.adx-live { position: fixed; left: 50%; top: 88px; transform: translateX(-50%);',
    '  z-index: 24; display: none; align-items: center; gap: 8px; padding: 8px 16px; border-radius: 999px;',
    '  background: rgba(8, 8, 26, 0.82); border: 1.5px solid rgba(255, 80, 80, 0.85);',
    '  font: 700 20px/1 Fredoka, "Segoe UI", sans-serif; color: #fff; white-space: nowrap;',
    '  box-shadow: 0 0 22px rgba(255, 60, 60, 0.45); }',
    '.adx-live.on { display: flex; }',
    '.adx-live .adx-dot { width: 12px; height: 12px; border-radius: 50%; background: #ff4646;',
    '  animation: adxPulse 1.4s ease-in-out infinite; }',
    '@keyframes adxPulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.78); } }',
    // win moment
    '.adx-win { position: fixed; left: 50%; top: 44%; transform: translate(-50%, -50%) scale(0.6);',
    '  z-index: 30; width: 420px; text-align: center; opacity: 0; pointer-events: none;',
    '  animation: adxWinPop 4.2s cubic-bezier(.25,1.4,.45,1) forwards; }',
    '@keyframes adxWinPop {',
    '  0% { opacity: 0; transform: translate(-50%,-50%) scale(0.55); }',
    '  8% { opacity: 1; transform: translate(-50%,-50%) scale(1.06); }',
    '  12% { transform: translate(-50%,-50%) scale(1); }',
    '  86% { opacity: 1; transform: translate(-50%,-50%) scale(1); }',
    '  100% { opacity: 0; transform: translate(-50%,-50%) scale(1.05); }',
    '}',
    '.adx-win .adx-trophy { font-size: 66px; line-height: 1; }',
    '.adx-win .adx-name { margin-top: 4px; font: 700 44px/1.1 Fredoka, "Segoe UI", sans-serif; color: #fff;',
    '  text-shadow: 0 0 26px var(--glow-a, rgba(255,255,255,0.5)); word-break: break-word; }',
    '.adx-win .adx-word { margin-top: 10px; display: flex; justify-content: center; gap: 5px; flex-wrap: wrap; }',
    '.adx-win .adx-word span { display: inline-block; min-width: 40px; padding: 8px 4px; border-radius: 9px;',
    '  background: var(--tone-a, #fff); color: #0a0a1c; font: 800 32px/1 Outfit, "Segoe UI", sans-serif;',
    '  text-transform: uppercase; }',
    '.adx-win .adx-word span:nth-child(2n) { background: var(--tone-b, #ddd); }',
    '.adx-win .adx-word span:nth-child(3n) { background: var(--tone-c, #eee); }',
    '.adx-win .adx-jackpot { margin-top: 10px; font: 800 30px/1 Outfit, "Segoe UI", sans-serif; color: #ffd97a;',
    '  text-shadow: 0 0 18px rgba(255, 200, 80, 0.65); }',
  ].join('\n');
  document.head.appendChild(style);

  // ── 1. live chip ──
  const chip = document.createElement('div');
  chip.className = 'adx-live';
  const dot = document.createElement('span'); dot.className = 'adx-dot';
  const txt = document.createElement('span');
  chip.appendChild(dot); chip.appendChild(txt);
  document.body.appendChild(chip);

  async function pollLive() {
    try {
      const r = await fetch('/api/streamers/live', { cache: 'no-store' });
      const j = await r.json();
      const rows = (j && j.streamers) || [];
      const mine = rows.filter((s) => streamer
        ? String(s.handle || '').toLowerCase() === streamer
        : isSameGame(s.gameId) || isSameGame(s.sourceGameId));
      if (mine.length) {
        const viewers = mine.reduce((a, s) => a + (Number(s.viewerCount) || 0), 0);
        txt.textContent = 'LIVE' + (viewers > 0 ? ' · ' + viewers.toLocaleString() : '');
        chip.classList.add('on');
      } else {
        chip.classList.remove('on');
      }
    } catch (e) { chip.classList.remove('on'); }
  }
  pollLive();
  setInterval(pollLive, 30000);

  // ── 2. win moment ──
  function celebrate(d) {
    if (!d || !d.winner) return;
    if (!streamer && !isSameGame(d.game)) return; // global room hears every game
    const box = document.createElement('div');
    box.className = 'adx-win';
    const t = document.createElement('div'); t.className = 'adx-trophy'; t.textContent = '🏆';
    const n = document.createElement('div'); n.className = 'adx-name';
    n.textContent = String(d.winner.displayName || d.winner.username || 'Winner').slice(0, 24);
    box.appendChild(t); box.appendChild(n);
    const word = String(d.word || '').trim().slice(0, 12);
    if (word) {
      const w = document.createElement('div'); w.className = 'adx-word';
      for (const ch of word.toUpperCase()) {
        const sp = document.createElement('span'); sp.textContent = ch; w.appendChild(sp);
      }
      box.appendChild(w);
    }
    const jp = Number(d.jackpot) || 0;
    if (jp > 0) {
      const jd = document.createElement('div'); jd.className = 'adx-jackpot';
      jd.textContent = '+' + jp.toLocaleString();
      box.appendChild(jd);
    }
    document.body.appendChild(box);
    setTimeout(() => box.remove(), 4400);
  }

  if (typeof io === 'function') {
    try {
      const sock = io({ transports: ['websocket'] });
      sock.on('connect', () => streamer
        ? sock.emit('join-streamer-win-overlay', streamer)
        : sock.emit('join-win-overlay'));
      sock.on('game-win', celebrate);
    } catch (e) { /* celebrations are optional */ }
  }

  // debug handle for diagnostics (mirrors the __jd pattern)
  window.__adx = { gameId, streamer, celebrate, pollLive };
})();
