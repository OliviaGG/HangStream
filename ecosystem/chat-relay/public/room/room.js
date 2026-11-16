(function () {
  'use strict';

  var slug = decodeURIComponent(location.pathname.replace(/^\/+|\/+$/g, '')).toLowerCase();
  var state = null;
  var session = null;
  var socket = null;
  var currentFrameUrl = '';
  var frameVirtualWidth = 0;
  var frameResizeTimer = null;
  var toastTimer = null;
  var countdownTimer = null;
  var lastActivitySent = 0;
  var panelSizeKey = 'wt-room-game-size-v2';
  var panelSize = {};
  var sideSizeKey = 'wt-room-side-sizes-v2';
  var sideSizes = { chat: {}, vote: {} };
  var panelDrag = null;
  var frameFitRequest = null;
  var stackedLayout = window.matchMedia('(max-width: 1200px)');

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    layout: $('room-layout'), error: $('error-card'), errorMessage: $('error-message'),
    shell: $('room-shell'), identity: $('room-identity'), toolbar: $('room-toolbar'),
    kind: $('room-kind'), title: $('room-title'), status: $('room-status'), dot: $('status-dot'),
    members: $('room-members'), gameHeading: $('game-heading'), stage: $('game-stage'), frame: $('game-frame'),
    loading: $('game-loading'), openGame: $('open-game'), login: $('login-link'),
    gamePanel: $('game-panel'), resizeWidth: $('resize-game-width'), resizeHeight: $('resize-game-height'),
    resizeCorner: $('resize-game-corner'), resetSize: $('reset-game-size'),
    ownerControls: $('owner-controls'), gamePicker: $('game-picker'), closeRoom: $('close-room'),
    sidePanel: $('side-panel'), voteCard: $('vote-card'), voteNote: $('vote-note'),
    voteBallot: $('vote-ballot'), voteCountdown: $('vote-countdown'),
    voteOwnerActions: $('vote-owner-actions'), startVote: $('start-vote'), finishVote: $('finish-vote'),
    cancelVote: $('cancel-vote'), chatLog: $('chat-log'), chatForm: $('chat-form'),
    chatInput: $('chat-input'), chatSend: $('chat-send'), chatHelp: $('chat-help'), toast: $('toast')
  };
  var sidePanels = ['chat', 'vote'].map(function (name) {
    return {
      name: name, panel: $(name + '-card'), width: $('resize-' + name + '-width'),
      height: $('resize-' + name + '-height'), corner: $('resize-' + name + '-corner'),
      reset: $('reset-' + name + '-size'), minHeight: name === 'chat' ? 320 : 240,
      fixed: name === 'chat' ? ['.panel-head', '.chat-form', '.chat-help'] : ['.panel-head', '.vote-note', '.vote-owner-actions']
    };
  });

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('show'); }, 3200);
  }

  async function jsonFetch(url, options) {
    var response = await fetch(url, Object.assign({ credentials: 'same-origin' }, options || {}));
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok || body.ok === false) {
      var error = new Error(body.message || body.error || 'Request failed');
      error.code = body.error;
      error.status = response.status;
      throw error;
    }
    return body;
  }

  function showClosed(message) {
    els.shell.classList.add('room-closed');
    els.layout.hidden = true;
    els.error.hidden = false;
    if (currentFrameUrl) {
      currentFrameUrl = '';
      els.frame.src = 'about:blank';
    }
    if (message) els.errorMessage.textContent = message;
  }

  function reportActivity() {
    if (!socket || !socket.connected || !state || state.open === false || state.type !== 'user') return;
    var now = Date.now();
    if (now - lastActivitySent < 30000) return;
    lastActivitySent = now;
    socket.emit('audience-room-activity', { slug: slug });
  }

  function watchInteraction(target) {
    target.addEventListener('pointerdown', reportActivity, { passive: true, capture: true });
    target.addEventListener('keydown', reportActivity, { capture: true });
  }

  function clamp(value, min, max) { return Math.max(min, Math.min(max, value)); }

  function roomColumnsWidth() {
    var style = getComputedStyle(els.layout);
    var available = els.layout.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    if (!stackedLayout.matches) available -= els.identity.getBoundingClientRect().width + parseFloat(getComputedStyle(els.sidePanel).marginLeft);
    return Math.max(0, available);
  }

  function widthLimits() {
    var max = Math.max(0, roomColumnsWidth() - 280);
    return { min: Math.min(420, max), max: max };
  }

  function sideWidthLimits() {
    var max = Math.max(0, els.gamePanel.getBoundingClientRect().width + els.sidePanel.clientWidth - 420);
    return { min: Math.min(280, max), max: max };
  }

  function preferredSideWidth() {
    return Math.max(clamp(window.innerWidth * 0.165, 280, 360), sideSizes.chat.width || 0, sideSizes.vote.width || 0);
  }

  function balanceSideColumn(previousWidth) {
    var difference = previousWidth - preferredSideWidth();
    if (!stackedLayout.matches && Math.abs(difference) > 1) {
      changePanelSize(els.gamePanel.getBoundingClientRect().width + difference, null);
    }
  }

  function sideMinHeight(config) {
    // Leave space for scrolling content as well as the title and controls.
    var fixedHeight = config.fixed.reduce(function (total, selector) {
      var node = config.panel.querySelector(selector);
      if (!node || node.hidden) return total;
      var style = getComputedStyle(node);
      return total + node.getBoundingClientRect().height + parseFloat(style.marginTop) + parseFloat(style.marginBottom);
    }, 0);
    return Math.max(config.minHeight, Math.ceil(fixedHeight + 86));
  }

  function applySidePanelSizes() {
    if (!stackedLayout.matches) {
      var available = Math.max(280, roomColumnsWidth() - els.gamePanel.getBoundingClientRect().width);
      els.sidePanel.style.setProperty('--side-panel-width', Math.min(preferredSideWidth(), available) + 'px');
    } else els.sidePanel.style.removeProperty('--side-panel-width');
    sidePanels.forEach(function (config) {
      var size = sideSizes[config.name];
      config.panel.classList.toggle('has-panel-width', !!size.width && !stackedLayout.matches);
      if (size.width) config.panel.style.setProperty('--panel-width', size.width + 'px');
      else config.panel.style.removeProperty('--panel-width');
      config.panel.classList.toggle('has-panel-height', !!size.height);
      var minHeight = sideMinHeight(config);
      config.panel.style.setProperty('--panel-min-height', minHeight + 'px');
      if (size.height) config.panel.style.setProperty('--panel-height', Math.max(size.height, minHeight) + 'px');
      else config.panel.style.removeProperty('--panel-height');
    });
    els.sidePanel.classList.toggle('has-panel-heights', !!sideSizes.chat.height || (!els.voteCard.hidden && !!sideSizes.vote.height));
    scheduleFrameFit();
  }

  function saveSidePanelSizes() {
    try { localStorage.setItem(sideSizeKey, JSON.stringify(sideSizes)); } catch (_) {}
    savePanelSize();
  }

  function changeSidePanelSize(config, width, height) {
    var size = sideSizes[config.name];
    if (width != null && !stackedLayout.matches) {
      var previousWidth = els.sidePanel.clientWidth;
      var limits = sideWidthLimits();
      size.width = Math.round(clamp(width, limits.min, limits.max));
      // Keep the left-edge drag anchored to the bubble's right edge while
      // exchanging space with the neighboring game column.
      balanceSideColumn(previousWidth);
    }
    if (height != null) size.height = Math.round(clamp(height, sideMinHeight(config), 2400));
    applySidePanelSizes();
  }

  function updateResizeControls() {
    var limits = widthLimits();
    els.resizeWidth.tabIndex = stackedLayout.matches ? -1 : 0;
    els.resizeCorner.tabIndex = stackedLayout.matches ? -1 : 0;
    els.resizeWidth.setAttribute('aria-valuemin', Math.round(limits.min));
    els.resizeWidth.setAttribute('aria-valuemax', Math.round(limits.max));
    els.resizeWidth.setAttribute('aria-valuenow', Math.round(els.gamePanel.getBoundingClientRect().width));
    els.resizeHeight.setAttribute('aria-valuemin', 280);
    els.resizeHeight.setAttribute('aria-valuemax', 2400);
    els.resizeHeight.setAttribute('aria-valuenow', els.stage.clientHeight);
    els.resetSize.hidden = !panelSize.width && !panelSize.height;
    sidePanels.forEach(function (config) {
      var sideLimits = sideWidthLimits();
      config.width.tabIndex = config.corner.tabIndex = stackedLayout.matches ? -1 : 0;
      config.width.setAttribute('aria-valuemin', Math.round(sideLimits.min));
      config.width.setAttribute('aria-valuemax', Math.round(sideLimits.max));
      config.width.setAttribute('aria-valuenow', Math.round(config.panel.getBoundingClientRect().width));
      config.height.setAttribute('aria-valuemin', sideMinHeight(config));
      config.height.setAttribute('aria-valuemax', 2400);
      config.height.setAttribute('aria-valuenow', Math.round(config.panel.getBoundingClientRect().height));
      config.reset.hidden = false;
    });
  }

  function applyPanelSize() {
    els.layout.classList.toggle('has-game-width', !!panelSize.width);
    if (panelSize.width && !stackedLayout.matches) {
      var limits = widthLimits();
      els.shell.style.setProperty('--game-panel-width', clamp(panelSize.width, limits.min, limits.max) + 'px');
    } else els.shell.style.removeProperty('--game-panel-width');
    els.gamePanel.classList.toggle('has-game-height', !!panelSize.height);
    if (panelSize.height) els.gamePanel.style.setProperty('--game-stage-height', panelSize.height + 'px');
    else els.gamePanel.style.removeProperty('--game-stage-height');
    applySidePanelSizes();
    scheduleFrameFit();
  }

  function savePanelSize() {
    try { localStorage.setItem(panelSizeKey, JSON.stringify(panelSize)); } catch (_) {}
  }

  function scheduleFrameFit() {
    if (frameFitRequest !== null) return;
    frameFitRequest = requestAnimationFrame(function () {
      frameFitRequest = null;
      applyFrameFit();
      els.shell.style.setProperty('--room-toolbar-height', Math.ceil(els.toolbar.getBoundingClientRect().height) + 'px');
      updateResizeControls();
    });
  }

  function changePanelSize(width, height) {
    if (width != null && !stackedLayout.matches) {
      var limits = widthLimits();
      panelSize.width = Math.round(clamp(width, limits.min, limits.max));
    }
    if (height != null) panelSize.height = Math.round(clamp(height, 280, 2400));
    applyPanelSize();
  }

  function finishPanelDrag() {
    if (!panelDrag) return;
    var drag = panelDrag;
    panelDrag = null;
    document.body.classList.remove('panel-resizing', 'resizing-width', 'resizing-height', 'resizing-corner', 'resizing-side-corner');
    if (drag.handle.hasPointerCapture(drag.pointerId)) drag.handle.releasePointerCapture(drag.pointerId);
    drag.save();
  }

  function bindResizeHandle(handle, direction, side) {
    var changesWidth = direction !== 'height';
    var changesHeight = direction !== 'width';
    var widthSign = side ? -1 : 1;
    function dimensions() {
      return side ? { width: side.panel.getBoundingClientRect().width, height: side.panel.getBoundingClientRect().height }
        : { width: els.gamePanel.getBoundingClientRect().width, height: els.stage.clientHeight };
    }
    function changeSize(width, height) {
      if (side) changeSidePanelSize(side, width, height);
      else changePanelSize(width, height);
    }
    var save = side ? saveSidePanelSizes : savePanelSize;
    handle.addEventListener('pointerdown', function (event) {
      if (event.button !== 0 || !event.isPrimary || panelDrag) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      var size = dimensions();
      panelDrag = {
        handle: handle, pointerId: event.pointerId, x: event.clientX, y: event.clientY,
        width: size.width, height: size.height, save: save
      };
      handle.setPointerCapture(event.pointerId);
      document.body.classList.add('panel-resizing', 'resizing-' + (side && direction === 'corner' ? 'side-corner' : direction));
    });
    handle.addEventListener('pointermove', function (event) {
      if (!panelDrag || panelDrag.handle !== handle || panelDrag.pointerId !== event.pointerId) return;
      changeSize(changesWidth ? panelDrag.width + (event.clientX - panelDrag.x) * widthSign : null,
        changesHeight ? panelDrag.height + event.clientY - panelDrag.y : null);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (name) {
      handle.addEventListener(name, function (event) {
        if (panelDrag && panelDrag.pointerId === event.pointerId) finishPanelDrag();
      });
    });
    handle.addEventListener('keydown', function (event) {
      var step = event.shiftKey ? 50 : 20;
      var dx = changesWidth && !stackedLayout.matches && (event.key === 'ArrowRight' ? step : event.key === 'ArrowLeft' ? -step : 0);
      var dy = changesHeight && (event.key === 'ArrowDown' ? step : event.key === 'ArrowUp' ? -step : 0);
      if (!dx && !dy) return;
      event.preventDefault();
      var size = dimensions();
      changeSize(dx ? size.width + dx * widthSign : null, dy ? size.height + dy : null);
      save();
    });
  }

  try {
    var savedSize = JSON.parse(localStorage.getItem(panelSizeKey));
    if (savedSize && Number.isFinite(savedSize.width) && savedSize.width > 0) panelSize.width = savedSize.width;
    if (savedSize && Number.isFinite(savedSize.height) && savedSize.height > 0) panelSize.height = clamp(savedSize.height, 280, 2400);
  } catch (_) {}
  try {
    var savedSides = JSON.parse(localStorage.getItem(sideSizeKey));
    sidePanels.forEach(function (config) {
      var saved = savedSides && savedSides[config.name];
      if (saved && Number.isFinite(saved.width) && saved.width > 0) sideSizes[config.name].width = saved.width;
      if (saved && Number.isFinite(saved.height) && saved.height > 0) sideSizes[config.name].height = clamp(saved.height, config.minHeight, 2400);
    });
  } catch (_) {}
  sidePanels.forEach(function (config) {
    bindResizeHandle(config.width, 'width', config);
    bindResizeHandle(config.height, 'height', config);
    bindResizeHandle(config.corner, 'corner', config);
    config.reset.addEventListener('click', function () {
      finishPanelDrag();
      var previousWidth = els.sidePanel.clientWidth;
      sideSizes[config.name] = {};
      balanceSideColumn(previousWidth);
      saveSidePanelSizes();
      applySidePanelSizes();
    });
  });
  bindResizeHandle(els.resizeWidth, 'width');
  bindResizeHandle(els.resizeHeight, 'height');
  bindResizeHandle(els.resizeCorner, 'corner');
  els.resetSize.addEventListener('click', function () {
    finishPanelDrag();
    panelSize = {};
    try { localStorage.removeItem(panelSizeKey); } catch (_) {}
    applyPanelSize();
  });
  window.addEventListener('blur', finishPanelDrag);
  if (typeof ResizeObserver === 'function') {
    var panelObserver = new ResizeObserver(scheduleFrameFit);
    panelObserver.observe(els.stage);
    panelObserver.observe(els.toolbar);
    sidePanels.forEach(function (config) { panelObserver.observe(config.panel); });
  }
  applyPanelSize();

  function clearFrameFit(forgetWidth) {
    if (forgetWidth) frameVirtualWidth = 0;
    els.gamePanel.classList.remove('frame-fitted');
    els.stage.style.removeProperty('height');
    els.stage.style.removeProperty('min-height');
    els.frame.style.removeProperty('position');
    els.frame.style.removeProperty('inset');
    els.frame.style.removeProperty('width');
    els.frame.style.removeProperty('height');
    els.frame.style.removeProperty('min-height');
    els.frame.style.removeProperty('transform');
    els.frame.style.removeProperty('transform-origin');
  }

  // WikiContexto and the WikiRectangled family render fixed-width canvases.
  // Mobile browsers scale those canvases when they are top-level pages, but
  // not when they are inside the room iframe. Render at the game's design
  // width and uniformly scale the whole iframe into the available room width,
  // including desktop panels that the viewer has made narrower.
  function applyFrameFit() {
    var stageWidth = Math.max(1, els.stage.clientWidth);
    if (!frameVirtualWidth || frameVirtualWidth <= stageWidth + 1) {
      clearFrameFit(false);
      return;
    }
    var scale = stageWidth / frameVirtualWidth;
    var defaultHeight = stackedLayout.matches ? Math.max(360, Math.round(window.innerHeight * 0.68)) : Math.max(280, window.innerHeight - 6);
    var displayHeight = panelSize.height || defaultHeight;
    els.gamePanel.classList.add('frame-fitted');
    els.stage.style.height = displayHeight + 'px';
    els.stage.style.minHeight = displayHeight + 'px';
    els.frame.style.position = 'absolute';
    els.frame.style.inset = '0 auto auto 0';
    els.frame.style.width = frameVirtualWidth + 'px';
    els.frame.style.height = Math.ceil(displayHeight / scale) + 'px';
    els.frame.style.minHeight = '0';
    els.frame.style.transformOrigin = 'top left';
    els.frame.style.transform = 'scale(' + scale + ')';
  }

  function renderRoom(next) {
    if (!next) return;
    var preserveOwner = state && state.isOwner;
    state = Object.assign({}, state || {}, next);
    if (typeof next.isOwner === 'undefined' && preserveOwner) state.isOwner = true;

    if (state.open === false) {
      showClosed('This room is closed. The owner can open it again from the home page.');
      return;
    }
    els.shell.classList.remove('room-closed');
    els.layout.hidden = false;
    els.error.hidden = true;
    document.title = state.displayName + "'s room — Word Tycoon";
    els.kind.textContent = state.type === 'streamer' ? (state.live ? 'LIVE STREAM ROOM' : 'STREAMER ROOM') : 'AUDIENCE ROOM';
    els.title.textContent = state.displayName + "'s room";
    els.status.textContent = state.type === 'streamer'
      ? (state.live ? 'Live now' : 'Streamer is offline')
      : (state.open === false ? 'Room closed' : 'Room open');
    els.dot.classList.toggle('live', !!state.live);
    var roomPeople = Number(state.memberCount) || 0;
    var streamPeople = Number(state.viewerCount) || 0;
    els.members.textContent = roomPeople.toLocaleString() + (roomPeople === 1 ? ' in room' : ' in room') +
      (streamPeople ? ' · ' + streamPeople.toLocaleString() + ' on stream' : '');
    els.gameHeading.textContent = state.gameName || state.currentGame || 'Game';
    frameVirtualWidth = Math.max(0, Number(state.gameViewportWidth) || 0);

    if (state.gameUrl) {
      els.openGame.href = state.gameUrl;
      els.openGame.hidden = false;
      if (currentFrameUrl !== state.gameUrl) {
        currentFrameUrl = state.gameUrl;
        clearFrameFit(false);
        els.loading.hidden = false;
        els.frame.src = state.gameUrl;
      } else {
        applyFrameFit();
      }
    } else {
      els.openGame.hidden = true;
      els.loading.hidden = false;
      els.loading.innerHTML = '<strong>This game opens when the streamer goes live.</strong>';
    }

    renderOwnerControls();
    renderVote(state.vote || { phase: 'idle' });
  }

  function renderOwnerControls() {
    var isOwner = !!state.isOwner;
    els.ownerControls.hidden = !isOwner;
    els.voteOwnerActions.hidden = !isOwner;
    if (!isOwner) return;
    var games = state.availableGames || [];
    var existing = Array.prototype.map.call(els.gamePicker.options, function (o) { return o.value; }).join('|');
    var wanted = games.map(function (g) { return g.id; }).join('|');
    if (existing !== wanted) {
      els.gamePicker.innerHTML = games.map(function (game) {
        return '<option value="' + escapeHtml(game.id) + '">' + escapeHtml(game.label) + '</option>';
      }).join('');
    }
    els.gamePicker.value = state.currentGame;
    els.closeRoom.hidden = state.type === 'streamer';
  }

  function renderVote(vote) {
    clearInterval(countdownTimer);
    countdownTimer = null;
    var phase = vote.phase || 'idle';
    var isOwner = !!(state && state.isOwner);
    var showVoteCard = isOwner || phase === 'voting';
    els.voteCard.hidden = !showVoteCard;
    els.sidePanel.classList.toggle('vote-visible', showVoteCard);
    els.startVote.hidden = !isOwner || phase !== 'idle';
    els.finishVote.hidden = !isOwner || phase !== 'voting';
    els.cancelVote.hidden = !isOwner || phase === 'idle';
    els.voteCountdown.hidden = phase !== 'voting';

    if (phase === 'idle') {
      els.voteNote.textContent = state && state.isOwner
        ? 'Open a timed vote and the winning game will start automatically.'
        : 'The room owner can open a vote for the next game.';
      els.voteBallot.innerHTML = '';
      applySidePanelSizes();
      return;
    }

    if (phase === 'voting') {
      els.voteNote.textContent = session && session.ok
        ? 'Choose once. The winner becomes the room’s next private game.'
        : 'Sign in to cast your vote.';
      updateCountdown(vote);
      countdownTimer = setInterval(function () { updateCountdown(vote); }, 1000);
    } else {
      var winner = (vote.ballot || []).find(function (item) { return item.gameId === vote.winnerGameId; });
      els.voteNote.textContent = (vote.tiebreak ? 'Tie broken! ' : '') + (winner ? winner.name : 'The winner') + ' is next.';
    }

    els.voteBallot.innerHTML = (vote.ballot || []).map(function (item) {
      var winnerClass = phase === 'result' && item.gameId === vote.winnerGameId ? ' winner' : '';
      return '<button class="vote-option' + winnerClass + '" type="button" data-game="' + escapeHtml(item.gameId) + '" style="--pct:' + Number(item.pct || 0) + '%"' +
        (phase !== 'voting' ? ' disabled' : '') + '><span>' + escapeHtml(item.name) + '</span><span class="vote-total">' +
        Number(item.votes || 0) + ' · ' + Number(item.pct || 0) + '%</span></button>';
    }).join('');
    applySidePanelSizes();
  }

  function updateCountdown(vote) {
    var seconds = Math.max(0, Math.ceil((Number(vote.endsAt) - Date.now()) / 1000));
    els.voteCountdown.textContent = seconds + 's';
  }

  function addChatMessage(message) {
    var empty = els.chatLog.querySelector('.chat-empty');
    if (empty) empty.remove();
    var user = message.user || {};
    var row = document.createElement('div');
    row.className = 'chat-message';
    var avatar = user.profilePic
      ? '<img class="chat-avatar" src="' + escapeHtml(user.profilePic) + '" alt="">'
      : '<div class="chat-avatar"></div>';
    var time = '';
    try { time = new Date(message.timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); } catch (_) {}
    row.innerHTML = avatar + '<div class="chat-bubble"><div><span class="chat-name">' +
      escapeHtml(user.displayName || user.username || 'Player') + '</span><span class="chat-time">' + escapeHtml(time) +
      '</span></div><div class="chat-text">' + escapeHtml(message.message) + '</div></div>';
    els.chatLog.appendChild(row);
    els.chatLog.scrollTop = els.chatLog.scrollHeight;
  }

  function renderHistory(messages) {
    els.chatLog.innerHTML = '';
    if (!messages || !messages.length) {
      els.chatLog.innerHTML = '<div class="chat-empty">No messages yet. You get first word.</div>';
      return;
    }
    messages.forEach(addChatMessage);
  }

  function renderSession() {
    var loggedIn = !!(session && session.ok && session.user);
    els.login.textContent = loggedIn ? (session.user.globalName || session.user.displayName || session.user.username) : 'Sign in';
    els.login.href = loggedIn ? '/profile' : '/auth/discord?returnTo=' + encodeURIComponent(location.pathname);
    els.chatInput.disabled = !loggedIn;
    els.chatSend.disabled = !loggedIn;
    els.chatInput.placeholder = loggedIn ? 'Message the room…' : 'Sign in to chat';
    els.chatHelp.textContent = loggedIn ? 'Room chat is kept for 12 hours.' : 'Watching is public. Sign in to chat and vote.';
  }

  function connectSocket() {
    if (typeof io !== 'function') return;
    socket = io({ withCredentials: true });
    socket.on('connect', function () {
      socket.emit('audience-room-join', { slug: slug }, function (result) {
        if (!result || !result.ok) showClosed();
      });
    });
    socket.on('audience-room-state', renderRoom);
    socket.on('audience-room-history', function (payload) { renderHistory(payload.messages || []); });
    socket.on('audience-room-message', addChatMessage);
    socket.on('connect_error', function () { showToast('Live room connection interrupted. Reconnecting…'); });
  }

  els.frame.addEventListener('load', function () {
    els.loading.hidden = true;
    applyFrameFit();
    // Private games use same-origin /game/ URLs. Activity inside their iframe
    // does not bubble to the room page, so listen there as well.
    try {
      var gameDocument = els.frame.contentDocument;
      if (!gameDocument) return;
      // Hide native scrollbars inside room games without changing overflow,
      // so wheel, touch, and keyboard scrolling still work in nested panels.
      if (!gameDocument.getElementById('wt-room-scrollbars')) {
        var scrollbarStyle = gameDocument.createElement('style');
        scrollbarStyle.id = 'wt-room-scrollbars';
        scrollbarStyle.textContent = '* { scrollbar-width: none !important; } ' +
          '*::-webkit-scrollbar { display: none !important; width: 0 !important; height: 0 !important; }';
        (gameDocument.head || gameDocument.documentElement).appendChild(scrollbarStyle);
      }
      watchInteraction(gameDocument);
    } catch (_) {}
  });
  watchInteraction(document);
  window.addEventListener('resize', function () {
    finishPanelDrag();
    clearTimeout(frameResizeTimer);
    frameResizeTimer = setTimeout(applyPanelSize, 80);
  }, { passive: true });

  els.chatForm.addEventListener('submit', function (event) {
    event.preventDefault();
    var message = els.chatInput.value.trim();
    if (!message || !socket) return;
    socket.emit('audience-room-chat', { slug: slug, message: message }, function (result) {
      if (result && result.ok) els.chatInput.value = '';
      else if (result && result.error === 'login_required') location.href = els.login.href;
      else showToast((result && (result.message || result.error)) || 'Message was not sent.');
    });
  });

  els.voteBallot.addEventListener('click', function (event) {
    var button = event.target.closest('[data-game]');
    if (!button || !socket) return;
    if (!(session && session.ok)) {
      location.href = '/auth/discord?returnTo=' + encodeURIComponent(location.pathname);
      return;
    }
    socket.emit('audience-room-vote', { slug: slug, gameId: button.dataset.game }, function (result) {
      if (!result || !result.ok) showToast((result && (result.message || result.error)) || 'Vote failed.');
      else showToast('Vote counted.');
    });
  });

  els.gamePicker.addEventListener('change', async function () {
    try {
      els.gamePicker.disabled = true;
      var result = await jsonFetch('/api/rooms/' + encodeURIComponent(slug) + '/game', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameId: els.gamePicker.value })
      });
      renderRoom(result.room);
    } catch (error) {
      showToast(error.message);
      if (state) els.gamePicker.value = state.currentGame;
    } finally { els.gamePicker.disabled = false; }
  });

  els.startVote.addEventListener('click', async function () {
    try {
      await jsonFetch('/api/rooms/' + encodeURIComponent(slug) + '/vote/start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ durationSeconds: 45 })
      });
    } catch (error) { showToast(error.message); }
  });
  els.finishVote.addEventListener('click', async function () {
    try { await jsonFetch('/api/rooms/' + encodeURIComponent(slug) + '/vote/finish', { method: 'POST' }); }
    catch (error) { showToast(error.message); }
  });
  els.cancelVote.addEventListener('click', async function () {
    try { await jsonFetch('/api/rooms/' + encodeURIComponent(slug) + '/vote/cancel', { method: 'POST' }); }
    catch (error) { showToast(error.message); }
  });
  els.closeRoom.addEventListener('click', async function () {
    if (!confirm('Close this room? Its link will stop working until you reopen it.')) return;
    try {
      await jsonFetch('/api/me/room', { method: 'DELETE' });
      location.href = '/';
    } catch (error) { showToast(error.message); }
  });

  Promise.all([
    jsonFetch('/api/me/session').catch(function () { return { ok: false }; }),
    jsonFetch('/api/rooms/' + encodeURIComponent(slug))
  ]).then(function (results) {
    session = results[0];
    renderSession();
    renderRoom(results[1].room);
    connectSocket();
    setInterval(function () {
      if (document.hidden) return;
      jsonFetch('/api/rooms/' + encodeURIComponent(slug)).then(function (result) { renderRoom(result.room); }).catch(function () {});
    }, 10000);
  }).catch(function (error) {
    showClosed(error.status === 404 ? 'The owner may open it again later.' : 'The room could not be loaded. Try again shortly.');
  });
})();
