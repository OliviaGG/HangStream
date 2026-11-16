/**
 * Portal Feed tab — global Word Tycoon social feed.
 *
 * Data: GET /api/feed (paginated), live pushes over the shared portal
 * socket (join-feed room → feed-event / feed-reaction / feed-comment /
 * feed-comment-deleted). Chat sub-tab rides the existing chat-room
 * protocol (chat-join-room 'main' → chat-room-history / chat-room-msg).
 *
 * Relies on portal.js globals: socket, connectChat(), portalUser,
 * guestMode, openGuestLogin(), escapeHtml(). Loaded after portal.js.
 */

(function () {
  'use strict';

  var esc = (typeof escapeHtml === 'function') ? escapeHtml : function (s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  };

  var EMOJIS = ['👍', '🔥', '🎉', '😂', '💎'];
  var ICONS = {
    win: '🏆', jackpot: '💰', daily: '📅', streak: '🔥',
    buy: '🏢', levelup: '📈', cosmetic: '💎', lootbox: '🎁'
  };
  var PAGE_SIZE = 30;

  var loaded = false;
  var loading = false;
  var socketWired = false;
  var chatJoined = false;
  var oldestId = null;
  var seenIds = {};
  var tickTimer = null;

  // ── helpers ────────────────────────────────────────────────────────

  function isLoggedIn() {
    return !!(typeof portalUser !== 'undefined' && portalUser && portalUser.id);
  }

  function nudgeSignIn() {
    if (typeof openGuestLogin === 'function') openGuestLogin();
  }

  function timeAgo(ts) {
    var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 45) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    var d = Math.floor(s / 86400);
    return d === 1 ? 'yesterday' : d + 'd ago';
  }

  function getSocket() {
    if (typeof connectChat === 'function') connectChat();
    return (typeof socket !== 'undefined') ? socket : null;
  }

  function avatarHtml(user, cls, fallbackCls, size) {
    var name = (user && (user.displayName || user.username)) || 'P';
    var initial = esc(String(name).charAt(0).toUpperCase());
    if (user && user.profilePic) {
      return '<img class="' + cls + '" src="' + esc(user.profilePic) + '" alt="" loading="lazy" ' +
        'onerror="this.outerHTML=\'<span class=&quot;' + fallbackCls + '&quot;>' + initial + '</span>\'">';
    }
    return '<span class="' + fallbackCls + '">' + initial + '</span>';
  }

  // Apply name_color / name_glow cosmetics to a rendered name element and
  // the pfp ring to the avatar wrap — same pipeline as the chat widget.
  function applyUserCosmetics(card, user) {
    if (!user || !user.cosmetics) return;
    var cos = user.cosmetics;
    var nameEl = card.querySelector('.feed-name, .feed-chat-name, .feed-comment-name');
    if (nameEl) {
      if (cos.name_color && cos.name_color.color) nameEl.style.color = cos.name_color.color;
      var shadows = [];
      if (cos.name_color && cos.name_color.textShadow) shadows.push(cos.name_color.textShadow);
      if (cos.name_glow && cos.name_glow.textShadow) shadows.push(cos.name_glow.textShadow);
      if (shadows.length) nameEl.style.textShadow = shadows.join(', ');
      if (window.CosmeticsFx && cos.name_color) {
        window.CosmeticsFx.applyText(nameEl, cos.name_color, { shadow: false, color: false });
      }
      if (!nameEl.style.animation && cos.name_glow && cos.name_glow.animation) {
        nameEl.style.animation = cos.name_glow.animation;
      }
    }
    var wrap = card.querySelector('.feed-avatar-wrap');
    if (wrap && window.PfpCosmetics) {
      var face = wrap.firstElementChild;
      if (face) window.PfpCosmetics.apply(face, wrap, cos, { size: 44 });
    }
  }

  // ── event sentences ────────────────────────────────────────────────

  function sentenceFor(evt) {
    var d = evt.detail || {};
    var game = esc(evt.gameName || evt.game || '');
    var val = '';
    if (evt.eventType === 'win') {
      var guesses = (typeof d.guessCount === 'number' && d.guessCount > 0) ? ' in ' + d.guessCount + (d.guessCount === 1 ? ' guess' : ' guesses') : '';
      if (evt.value != null) val = ' <span class="feed-value">+' + Math.round(evt.value).toLocaleString() + ' ' + esc(evt.valueLabel || 'pts') + '</span>';
      return 'won ' + game + guesses + val;
    }
    if (evt.eventType === 'jackpot') {
      if (evt.value != null) val = ' <span class="feed-value">+' + Math.round(evt.value).toLocaleString() + ' coins</span>';
      return 'hit the ' + game + ' JACKPOT!' + val;
    }
    if (evt.eventType === 'daily') {
      if (evt.value != null) val = ' <span class="feed-value">+' + Math.round(evt.value).toLocaleString() + ' coins</span>';
      return 'completed the ' + game + ' daily' + val;
    }
    if (evt.eventType === 'streak') {
      var n = evt.value != null ? Math.round(evt.value) : '';
      return 'is on a ' + n + '-win streak in ' + game + '!';
    }
    if (evt.eventType === 'buy') {
      return 'bought the ' + esc(d.businessName || 'a business');
    }
    if (evt.eventType === 'levelup') {
      return 'leveled ' + esc(d.businessName || 'a business') + ' to <span class="feed-value">Lv.' + esc(String(d.level || evt.value || '?')) + '</span>';
    }
    if (evt.eventType === 'cosmetic') {
      var cname = esc(d.cosmeticName || 'a cosmetic');
      if (d.rarity === 'set') return 'unlocked the ' + cname + '! 🧩';
      return 'bought ' + cname + rarityChip(d.rarity);
    }
    if (evt.eventType === 'lootbox') {
      return 'unboxed ' + esc(d.cosmeticName || 'a cosmetic') + rarityChip(d.rarity);
    }
    return esc(evt.eventType);
  }

  function rarityChip(rarity) {
    if (!rarity || rarity === 'set') return '';
    var r = String(rarity).toLowerCase();
    return '<span class="feed-rarity rarity-' + esc(r) + '">' + esc(r) + '</span>';
  }

  // ── card rendering ─────────────────────────────────────────────────

  function reactionPillsHtml(evt) {
    var html = '';
    for (var i = 0; i < EMOJIS.length; i++) {
      var e = EMOJIS[i];
      var count = (evt.reactions && evt.reactions[e]) || 0;
      var on = evt.myReactions && evt.myReactions.indexOf(e) !== -1;
      html += '<button type="button" class="feed-react-btn' + (on ? ' on' : '') + '" data-emoji="' + e + '">' +
        e + '<span class="feed-react-count">' + (count > 0 ? count : '') + '</span></button>';
    }
    return html;
  }

  function renderCard(evt, isNew) {
    var card = document.createElement('article');
    card.className = 'feed-card' + (isNew ? ' feed-card-new' : '');
    card.dataset.etype = evt.eventType;
    card.dataset.id = String(evt.id);

    var name = (evt.user && (evt.user.displayName || evt.user.username)) || 'Player';
    var chip = evt.gameName || evt.game || '';
    card.innerHTML =
      '<div class="feed-avatar-wrap">' + avatarHtml(evt.user, 'feed-avatar', 'feed-avatar-fallback') + '</div>' +
      '<div class="feed-body">' +
        '<div class="feed-line"><span class="feed-icon">' + (ICONS[evt.eventType] || '⭐') + '</span>' +
          '<span class="feed-name">' + esc(name) + '</span> ' + sentenceFor(evt) + '</div>' +
        '<div class="feed-meta">' +
          (chip ? '<span class="feed-game-chip">' + esc(chip) + '</span>' : '') +
          '<span class="feed-time" data-ts="' + evt.ts + '">' + timeAgo(evt.ts) + '</span>' +
        '</div>' +
        '<div class="feed-actions">' + reactionPillsHtml(evt) +
          '<button type="button" class="feed-comments-btn" data-count="' + (evt.commentCount || 0) + '">💬 ' +
            (evt.commentCount > 0 ? evt.commentCount : '') + '</button>' +
        '</div>' +
        '<div class="feed-comments"></div>' +
      '</div>';

    card.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.feed-react-btn');
      if (btn) { onReact(card, btn); return; }
      var cbtn = ev.target.closest('.feed-comments-btn');
      if (cbtn) { toggleComments(card); return; }
      var del = ev.target.closest('.feed-comment-delete');
      if (del) { onDeleteComment(card, del); return; }
    });

    applyUserCosmetics(card, evt.user);
    return card;
  }

  function setCommentCount(card, count) {
    var btn = card.querySelector('.feed-comments-btn');
    if (!btn) return;
    btn.dataset.count = String(count);
    btn.innerHTML = '💬 ' + (count > 0 ? count : '');
  }

  // ── reactions ──────────────────────────────────────────────────────

  function onReact(card, btn) {
    if (!isLoggedIn()) { nudgeSignIn(); return; }
    var eventId = card.dataset.id;
    var emoji = btn.dataset.emoji;
    fetch('/api/feed/' + encodeURIComponent(eventId) + '/react', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ emoji: emoji })
    }).then(function (r) { return r.json(); }).then(function (j) {
      if (!j || !j.ok) return;
      btn.classList.toggle('on', !!j.reacted);
      updateReactionCounts(card, j.reactions);
    }).catch(function () {});
  }

  function updateReactionCounts(card, reactions) {
    card.querySelectorAll('.feed-react-btn').forEach(function (b) {
      var n = (reactions && reactions[b.dataset.emoji]) || 0;
      b.querySelector('.feed-react-count').textContent = n > 0 ? n : '';
    });
  }

  // ── comments ───────────────────────────────────────────────────────

  function commentHtml(c) {
    var name = (c.user && (c.user.displayName || c.user.username)) || 'Player';
    var mine = isLoggedIn() && String(c.userId) === String(portalUser.id);
    return '<div class="feed-comment" data-comment-id="' + c.id + '">' +
      avatarHtml(c.user, 'feed-comment-avatar', 'feed-comment-avatar-fallback') +
      '<div class="feed-comment-body">' +
        '<div class="feed-comment-head">' +
          '<span class="feed-comment-name">' + esc(name) + '</span>' +
          '<span class="feed-comment-time">' + timeAgo(c.createdAt) + '</span>' +
          (mine ? '<button type="button" class="feed-comment-delete" title="Delete">✕</button>' : '') +
        '</div>' +
        '<div class="feed-comment-text">' + esc(c.text) + '</div>' +
      '</div>' +
    '</div>';
  }

  function toggleComments(card) {
    var panel = card.querySelector('.feed-comments');
    if (panel.classList.contains('open')) { panel.classList.remove('open'); return; }
    panel.classList.add('open');
    if (!panel.dataset.loaded) {
      panel.innerHTML = '<div class="feed-loading">Loading…</div>';
      fetch('/api/feed/' + encodeURIComponent(card.dataset.id) + '/comments')
        .then(function (r) { return r.json(); })
        .then(function (j) {
          panel.dataset.loaded = '1';
          renderCommentPanel(card, panel, (j && j.comments) || []);
        })
        .catch(function () { panel.innerHTML = '<div class="feed-empty">Could not load comments.</div>'; });
    }
  }

  function renderCommentPanel(card, panel, comments) {
    var listHtml = comments.map(commentHtml).join('');
    var formHtml;
    if (isLoggedIn()) {
      formHtml = '<div class="feed-comment-form">' +
        '<input type="text" class="feed-comment-input" maxlength="280" placeholder="Add a comment…">' +
        '<button type="button" class="feed-comment-send">Send</button></div>';
    } else {
      formHtml = '<div class="feed-signin-note"><button type="button" data-feed-signin>Sign in</button> to join the conversation.</div>';
    }
    panel.innerHTML = '<div class="feed-comment-list">' + listHtml + '</div>' + formHtml;

    var input = panel.querySelector('.feed-comment-input');
    var send = panel.querySelector('.feed-comment-send');
    if (send && input) {
      var submit = function () { submitComment(card, panel, input, send); };
      send.addEventListener('click', submit);
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
    }
    var signin = panel.querySelector('[data-feed-signin]');
    if (signin) signin.addEventListener('click', nudgeSignIn);
  }

  function submitComment(card, panel, input, send) {
    var text = (input.value || '').trim();
    if (!text) return;
    send.disabled = true;
    fetch('/api/feed/' + encodeURIComponent(card.dataset.id) + '/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text })
    }).then(function (r) { return r.json(); }).then(function (j) {
      send.disabled = false;
      if (!j || !j.ok) {
        if (j && j.reason && typeof showToast === 'function') showToast(j.reason);
        return;
      }
      input.value = '';
      var list = panel.querySelector('.feed-comment-list');
      // The socket echo also appends — guard by comment id.
      if (list && !list.querySelector('[data-comment-id="' + j.comment.id + '"]')) {
        list.insertAdjacentHTML('beforeend', commentHtml(j.comment));
      }
      setCommentCount(card, j.commentCount);
    }).catch(function () { send.disabled = false; });
  }

  function onDeleteComment(card, delBtn) {
    var row = delBtn.closest('.feed-comment');
    if (!row) return;
    fetch('/api/feed/comments/' + encodeURIComponent(row.dataset.commentId), { method: 'DELETE' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (!j || !j.ok) return;
        row.remove();
        setCommentCount(card, j.commentCount);
      }).catch(function () {});
  }

  // ── live socket wiring ─────────────────────────────────────────────

  function wireSocket() {
    var s = getSocket();
    if (!s || socketWired) return;
    socketWired = true;
    s.emit('join-feed');
    s.on('connect', function () {
      s.emit('join-feed');
      if (chatJoined) s.emit('chat-join-room', 'main');
    });
    s.on('feed-event', function (evt) {
      if (!evt || seenIds[evt.id]) return;
      seenIds[evt.id] = 1;
      var list = document.getElementById('feed-list');
      if (!list) return;
      var empty = list.querySelector('.feed-empty');
      if (empty) empty.remove();
      list.insertBefore(renderCard(evt, true), list.firstChild);
      // Keep the DOM bounded during long sessions.
      while (list.children.length > 200) list.removeChild(list.lastChild);
    });
    s.on('feed-reaction', function (data) {
      if (!data) return;
      var card = document.querySelector('.feed-card[data-id="' + data.eventId + '"]');
      if (card) updateReactionCounts(card, data.reactions);
    });
    s.on('feed-comment', function (data) {
      if (!data) return;
      var card = document.querySelector('.feed-card[data-id="' + data.eventId + '"]');
      if (!card) return;
      setCommentCount(card, data.commentCount);
      var list = card.querySelector('.feed-comment-list');
      if (list && !list.querySelector('[data-comment-id="' + data.comment.id + '"]')) {
        list.insertAdjacentHTML('beforeend', commentHtml(data.comment));
      }
    });
    s.on('feed-comment-deleted', function (data) {
      if (!data) return;
      var card = document.querySelector('.feed-card[data-id="' + data.eventId + '"]');
      if (!card) return;
      setCommentCount(card, data.commentCount);
      var row = card.querySelector('[data-comment-id="' + data.commentId + '"]');
      if (row) row.remove();
    });
    // Chat pane listeners (messages only render into the chat list).
    s.on('chat-room-history', function (data) {
      if (!data || data.room !== 'main') return;
      var list = document.getElementById('feed-chat-list');
      if (!list) return;
      list.innerHTML = '';
      (data.messages || []).forEach(function (m) { appendChatMsg(list, m, false); });
      list.scrollTop = list.scrollHeight;
    });
    s.on('chat-room-msg', function (m) {
      var list = document.getElementById('feed-chat-list');
      if (list && chatJoined) appendChatMsg(list, m, true);
    });
    s.on('chat-room-error', function (e) {
      if (e && e.message && typeof showToast === 'function') showToast(e.message);
    });
  }

  // ── chat pane ──────────────────────────────────────────────────────

  function appendChatMsg(list, m, scroll) {
    if (!m || !m.user || !m.message) return;
    if (m.id && list.querySelector('[data-msg-id="' + m.id + '"]')) return;
    var div = document.createElement('div');
    div.className = 'feed-chat-msg';
    if (m.id) div.dataset.msgId = m.id;
    var name = m.user.displayName || m.user.username || 'Player';
    var ts = m.timestamp ? new Date(m.timestamp).getTime() : Date.now();
    div.innerHTML =
      avatarHtml(m.user, 'feed-chat-avatar', 'feed-chat-avatar-fallback') +
      '<div class="feed-chat-body">' +
        '<span class="feed-chat-name">' + esc(name) + '</span>' +
        '<span class="feed-chat-time">' + timeAgo(ts) + '</span>' +
        '<div class="feed-chat-text">' + esc(m.message) + '</div>' +
      '</div>';
    var nameEl = div.querySelector('.feed-chat-name');
    var cos = m.user.cosmetics || {};
    if (nameEl && cos.name_color && cos.name_color.color) nameEl.style.color = cos.name_color.color;
    var atBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
    list.appendChild(div);
    while (list.children.length > 250) list.removeChild(list.firstChild);
    if (scroll && atBottom) list.scrollTop = list.scrollHeight;
  }

  function openChatPane() {
    var s = getSocket();
    if (s && !chatJoined) {
      chatJoined = true;
      s.emit('chat-join-room', 'main');
    }
    var form = document.getElementById('feed-chat-form');
    var signin = document.getElementById('feed-chat-signin');
    if (form) form.style.display = isLoggedIn() ? '' : 'none';
    if (signin) signin.style.display = isLoggedIn() ? 'none' : '';
  }

  function sendFeedChat() {
    var s = getSocket();
    var input = document.getElementById('feed-chat-input');
    if (!s || !input || !isLoggedIn()) return;
    var text = (input.value || '').trim();
    if (!text) return;
    s.emit('chat-room-message', {
      room: 'main',
      user: {
        id: portalUser.id,
        username: portalUser.username,
        displayName: portalUser.globalName || portalUser.username,
        profilePic: portalUser.avatar || null
      },
      message: text
    });
    input.value = '';
  }

  // ── sub-tabs + data loading ────────────────────────────────────────

  function switchPane(pane) {
    document.querySelectorAll('.feed-subtab').forEach(function (b) {
      b.classList.toggle('active', b.dataset.pane === pane);
    });
    document.querySelectorAll('.feed-pane').forEach(function (p) {
      p.classList.toggle('active', p.dataset.pane === pane);
    });
    if (pane === 'chat') openChatPane();
  }

  function fetchPage(beforeId) {
    var url = '/api/feed?limit=' + PAGE_SIZE + (beforeId ? '&before=' + beforeId : '');
    return fetch(url).then(function (r) { return r.json(); });
  }

  function loadInitial() {
    if (loading) return;
    loading = true;
    var list = document.getElementById('feed-list');
    list.innerHTML = '<div class="feed-loading">Loading the feed…</div>';
    fetchPage(null).then(function (j) {
      loading = false;
      if (!j || !j.ok) { list.innerHTML = '<div class="feed-empty">Could not load the feed. Try again in a bit.</div>'; return; }
      if (Array.isArray(j.emojis) && j.emojis.length) EMOJIS = j.emojis;
      list.innerHTML = '';
      if (!j.events.length) {
        list.innerHTML = '<div class="feed-empty">Nothing here yet — wins, dailies, and purchases will show up as they happen.</div>';
      }
      j.events.forEach(function (evt) {
        seenIds[evt.id] = 1;
        list.appendChild(renderCard(evt, false));
        oldestId = evt.id;
      });
      var more = document.getElementById('feed-load-more');
      if (more) more.style.display = j.events.length < PAGE_SIZE ? 'none' : '';
      loaded = true;
    }).catch(function () {
      loading = false;
      list.innerHTML = '<div class="feed-empty">Could not load the feed. Try again in a bit.</div>';
    });
  }

  function loadMore() {
    if (loading || !oldestId) return;
    loading = true;
    var more = document.getElementById('feed-load-more');
    if (more) more.disabled = true;
    fetchPage(oldestId).then(function (j) {
      loading = false;
      if (more) more.disabled = false;
      if (!j || !j.ok) return;
      var list = document.getElementById('feed-list');
      j.events.forEach(function (evt) {
        if (seenIds[evt.id]) return;
        seenIds[evt.id] = 1;
        list.appendChild(renderCard(evt, false));
        oldestId = evt.id;
      });
      if (more && j.events.length < PAGE_SIZE) more.style.display = 'none';
    }).catch(function () {
      loading = false;
      if (more) more.disabled = false;
    });
  }

  function startTicking() {
    if (tickTimer) return;
    tickTimer = setInterval(function () {
      document.querySelectorAll('#tab-feed .feed-time[data-ts]').forEach(function (el) {
        el.textContent = timeAgo(Number(el.dataset.ts));
      });
    }, 30000);
  }

  var uiWired = false;
  function wireUi() {
    if (uiWired) return;
    uiWired = true;
    document.querySelectorAll('.feed-subtab').forEach(function (b) {
      b.addEventListener('click', function () { switchPane(b.dataset.pane); });
    });
    var more = document.getElementById('feed-load-more');
    if (more) more.addEventListener('click', loadMore);
    var send = document.getElementById('feed-chat-send');
    var input = document.getElementById('feed-chat-input');
    if (send) send.addEventListener('click', sendFeedChat);
    if (input) input.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendFeedChat(); });
    var signinBtn = document.querySelector('#feed-chat-signin button');
    if (signinBtn) signinBtn.addEventListener('click', nudgeSignIn);
  }

  // Entry point — called from switchToTab('feed') every time the tab opens.
  function load() {
    wireUi();
    wireSocket();
    startTicking();
    if (!loaded) loadInitial();
  }

  window.PortalFeed = { load: load };
})();
