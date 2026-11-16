// Main application - Socket.IO client
(function () {
  const socket = io();

  // Initialize UI and TTS
  UI.init();
  TTS.init();

  // Socket events
  socket.on('connect', () => {
    console.log('[App] Connected to server');
  });

  socket.on('disconnect', () => {
    console.log('[App] Disconnected from server');
  });

  socket.on('chat-message', (msg) => {
    UI.renderMessage(msg);
    UI.renderOverlayPreview(msg);

    // TTS: only speak if eligible
    // YouTube messages require a dot prefix for TTS
    if (msg.ttsEligible && TTS.isEnabled()) {
      if (msg.platform === 'youtube') {
        if (msg.message.startsWith('.')) {
          TTS.speak(msg.message.slice(1), msg.ttsVoice);
        }
      } else {
        TTS.speak(msg.message, msg.ttsVoice);
      }
    }
  });

  socket.on('platform-status', (data) => {
    UI.updatePlatformStatus(data);
  });

  socket.on('tts-update', (data) => {
    if (data.users) UI.renderTTSUsers(data.users);
    if (data.settings) UI.updateTTSSettings(data.settings);
  });

  socket.on('commands', (commands) => {
    UI.renderCommands(commands);
  });

  socket.on('apps-status', (appsList) => {
    UI.renderApps(appsList);
    // Update game connection states from apps health check
    const sq = appsList.find(a => a.id === 'squaredle');
    if (sq) UI.updateSquaredleConnection(sq.reachable);
    const w5 = appsList.find(a => a.id === 'word500');
    if (w5) UI.updateWord500Connection(w5.reachable);
  });

  // TTS Controls
  const volumeSlider = document.getElementById('tts-volume');
  if (volumeSlider) {
    volumeSlider.addEventListener('input', (e) => {
      const val = e.target.value / 100;
      TTS.setVolume(val);
      document.getElementById('vol-label').textContent = e.target.value + '%';
      fetch('/api/tts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'volume', value: String(val) })
      });
    });
  }

  const rateSlider = document.getElementById('tts-rate');
  if (rateSlider) {
    rateSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      TTS.setRate(val);
      document.getElementById('rate-label').textContent = val.toFixed(1) + 'x';
      fetch('/api/tts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'rate', value: String(val) })
      });
    });
  }

  const pitchSlider = document.getElementById('tts-pitch');
  if (pitchSlider) {
    pitchSlider.addEventListener('input', (e) => {
      const val = parseFloat(e.target.value);
      TTS.setPitch(val);
      document.getElementById('pitch-label').textContent = val.toFixed(1);
      fetch('/api/tts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'pitch', value: String(val) })
      });
    });
  }

  const ttsEnabled = document.getElementById('tts-global-enabled');
  if (ttsEnabled) {
    ttsEnabled.addEventListener('change', (e) => {
      TTS.setEnabled(e.target.checked);
      fetch('/api/tts/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'enabled', value: String(e.target.checked) })
      });
    });
  }

  // Global functions for inline handlers
  window.toggleUserTTS = function (platform, platformUserId, enabled) {
    fetch('/api/tts/toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, platformUserId, enabled })
    });
  };

  window.toggleUserBan = function (platform, platformUserId, banned) {
    fetch('/api/tts/ban', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, platformUserId, banned })
    });
  };

  window.reconnectPlatform = function (platform) {
    let url;
    if (platform === 'tiktok') {
      url = document.getElementById('setting-tikfinity-url')?.value;
    } else if (platform === 'youtube') {
      url = document.getElementById('setting-streamerbot-url')?.value;
    }
    fetch(`/api/reconnect/${platform}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
  };

  // App management
  window.startApp = function (id) {
    fetch(`/api/apps/${id}/start`, { method: 'POST' });
  };

  window.stopApp = function (id) {
    fetch(`/api/apps/${id}/stop`, { method: 'POST' });
  };

  window.restartApp = function (id) {
    fetch(`/api/apps/${id}/restart`, { method: 'POST' });
  };

  window.startAllApps = function () {
    fetch('/api/apps/start-all', { method: 'POST' });
  };

  window.stopAllApps = function () {
    fetch('/api/apps/stop-all', { method: 'POST' });
  };

  window.reloadApps = function () {
    fetch('/api/apps/reload', { method: 'POST' });
  };

  // Set overlay URLs
  const overlayUrlInput = document.getElementById('overlay-url');
  if (overlayUrlInput) overlayUrlInput.value = window.location.origin + '/overlay.html';
  const overlay2UrlInput = document.getElementById('overlay2-url');
  if (overlay2UrlInput) overlay2UrlInput.value = window.location.origin + '/overlay2.html';
  const overlay3UrlInput = document.getElementById('overlay3-url');
  if (overlay3UrlInput) overlay3UrlInput.value = window.location.origin + '/overlay3.html';

  window.copyOverlayUrl = function () {
    const input = document.getElementById('overlay-url');
    if (input) {
      navigator.clipboard.writeText(input.value).catch(() => {
        input.select();
        document.execCommand('copy');
      });
    }
  };

  window.copyOverlay2Url = function () {
    const input = document.getElementById('overlay2-url');
    if (input) {
      navigator.clipboard.writeText(input.value).catch(() => {
        input.select();
        document.execCommand('copy');
      });
    }
  };

  window.copyOverlay3Url = function () {
    const input = document.getElementById('overlay3-url');
    if (input) {
      navigator.clipboard.writeText(input.value).catch(() => {
        input.select();
        document.execCommand('copy');
      });
    }
  };

  window.copyGameOverlayUrl = function (url) {
    navigator.clipboard.writeText(url).catch(() => {});
  };

  // ─── Per-overlay settings ──────────────────────────────────────────
  let selectedOverlayType = 'standard';
  let allOverlaySettings = {
    standard: { fontSize: 14, bgOpacity: 65, fadeDuration: 0, maxMessages: 30, showBadge: true, showUsername: true, animate: true },
    fade: { fontSize: 14, bgOpacity: 65, fadeDuration: 50, maxMessages: 30, showBadge: true, showUsername: true, animate: true },
    all: { fontSize: 14, bgOpacity: 65, fadeDuration: 0, maxMessages: 30, showBadge: true, showUsername: true, animate: true }
  };

  function getOverlaySettings() {
    return {
      type: selectedOverlayType,
      fontSize: parseInt(document.getElementById('overlay-fontsize')?.value || 14, 10),
      bgOpacity: parseInt(document.getElementById('overlay-bgopacity')?.value || 65, 10),
      fadeDuration: parseInt(document.getElementById('overlay-fade')?.value || 0, 10),
      maxMessages: parseInt(document.getElementById('overlay-maxmsg')?.value || 30, 10),
      showBadge: document.getElementById('overlay-show-badge')?.checked !== false,
      showUsername: document.getElementById('overlay-show-username')?.checked !== false,
      animate: document.getElementById('overlay-animate')?.checked !== false
    };
  }

  function pushOverlaySettings() {
    const settings = getOverlaySettings();
    const { type, ...vals } = settings;
    allOverlaySettings[type] = { ...allOverlaySettings[type], ...vals };
    fetch('/api/overlay/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    }).catch(() => {});
  }

  function applyOverlaySettingsToForm(s) {
    const fs = document.getElementById('overlay-fontsize');
    const fv = document.getElementById('overlay-fontsize-val');
    if (fs && fv) { fs.value = s.fontSize; fv.textContent = s.fontSize; }

    const bo = document.getElementById('overlay-bgopacity');
    const bv = document.getElementById('overlay-bgopacity-val');
    if (bo && bv) { bo.value = s.bgOpacity; bv.textContent = s.bgOpacity; }

    const fd = document.getElementById('overlay-fade');
    const fdv = document.getElementById('overlay-fade-val');
    if (fd && fdv) { fd.value = s.fadeDuration; fdv.textContent = s.fadeDuration > 0 ? s.fadeDuration + 's' : 'Off'; }

    const mm = document.getElementById('overlay-maxmsg');
    const mv = document.getElementById('overlay-maxmsg-val');
    if (mm && mv) { mm.value = s.maxMessages; mv.textContent = s.maxMessages; }

    const sb = document.getElementById('overlay-show-badge');
    if (sb) sb.checked = s.showBadge;
    const su = document.getElementById('overlay-show-username');
    if (su) su.checked = s.showUsername;
    const an = document.getElementById('overlay-animate');
    if (an) an.checked = s.animate;
  }

  // Receive all overlay settings on connect
  socket.on('overlay-settings-init', (data) => {
    allOverlaySettings = { ...allOverlaySettings, ...data };
    applyOverlaySettingsToForm(allOverlaySettings[selectedOverlayType]);
  });

  // Receive per-type overlay settings updates
  socket.on('overlay-settings', (data) => {
    if (data.type) {
      const { type, ...settings } = data;
      allOverlaySettings[type] = { ...allOverlaySettings[type], ...settings };
      if (type === selectedOverlayType) {
        applyOverlaySettingsToForm(allOverlaySettings[type]);
      }
    }
  });

  // Overlay type switching
  document.querySelectorAll('.overlay-type-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const newType = btn.dataset.overlayType;
      if (newType === selectedOverlayType) return;

      document.querySelectorAll('.overlay-type-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      selectedOverlayType = newType;
      applyOverlaySettingsToForm(allOverlaySettings[newType]);
      UI.setPreviewMode(newType);
    });
  });

  // Range slider live updates + push
  [
    { id: 'overlay-fontsize', valId: 'overlay-fontsize-val', suffix: '' },
    { id: 'overlay-bgopacity', valId: 'overlay-bgopacity-val', suffix: '' },
    { id: 'overlay-maxmsg', valId: 'overlay-maxmsg-val', suffix: '' }
  ].forEach(({ id, valId }) => {
    const slider = document.getElementById(id);
    const label = document.getElementById(valId);
    if (slider && label) {
      slider.addEventListener('input', () => { label.textContent = slider.value; pushOverlaySettings(); });
    }
  });

  // Fade duration has special "Off" label
  const fadeSlider = document.getElementById('overlay-fade');
  const fadeLabel = document.getElementById('overlay-fade-val');
  if (fadeSlider && fadeLabel) {
    fadeSlider.addEventListener('input', () => {
      const v = parseInt(fadeSlider.value, 10);
      fadeLabel.textContent = v > 0 ? v + 's' : 'Off';
      pushOverlaySettings();
    });
  }

  // Toggle handlers
  ['overlay-show-badge', 'overlay-show-username', 'overlay-animate'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', pushOverlaySettings);
  });

  // Render game overlay preview cards + URL list from apps data
  function renderGameOverlayLinks(appsList) {
    const cardsContainer = document.getElementById('game-overlay-cards');
    const linksContainer = document.getElementById('game-overlay-links');

    // Collect all overlay pages across all apps
    const overlayPages = [];
    for (const app of appsList) {
      if (!app.pages) continue;
      for (const p of app.pages) {
        if (p.overlay || p.label === 'Overlay' || p.label === 'Game Overlay') {
          overlayPages.push({ app, page: p });
        }
      }
    }

    // Also collect ALL pages for the URL list (including non-overlay)
    const allPages = [];
    for (const app of appsList) {
      if (!app.pages) continue;
      for (const p of app.pages) {
        allPages.push({ app, page: p });
      }
    }

    // Render preview cards
    if (cardsContainer) {
      if (overlayPages.length === 0) {
        cardsContainer.innerHTML = '<div class="overlay-link-empty">No game overlays configured</div>';
      } else {
        cardsContainer.innerHTML = overlayPages.map(({ app, page }, i) => {
          const proxyUrl = window.location.origin + '/game/' + app.id + page.path;
          const statusClass = app.reachable ? 'running' : 'stopped';
          const statusLabel = app.reachable ? 'Live' : 'Offline';
          const desc = page.desc || page.label;
          const iframeSrc = app.reachable ? proxyUrl : '';
          const cardId = 'overlay-card-' + i;
          return `<div class="overlay-preview-card" id="${cardId}">
            <div class="overlay-preview-header">
              <div class="overlay-preview-title">
                <span class="overlay-preview-name">${app.name} — ${page.label}</span>
                <span class="overlay-preview-status app-status-dot-inline ${statusClass}">${statusLabel}</span>
              </div>
              <div class="overlay-preview-desc">${desc}</div>
            </div>
            <div class="overlay-preview-frame-wrap">
              ${app.reachable
                ? `<iframe class="overlay-preview-frame" src="${iframeSrc}" loading="lazy"></iframe>`
                : `<div class="overlay-preview-offline">Server offline — start the game server to see preview</div>`
              }
            </div>
            <div class="overlay-preview-footer">
              <input type="text" class="overlay-link-url" value="${proxyUrl}" readonly>
              <button class="btn" onclick="copyGameOverlayUrl('${proxyUrl}')">Copy</button>
              <a class="btn btn-accent" href="${proxyUrl}" target="_blank">Open</a>
              <button class="btn" onclick="refreshOverlayPreview('${cardId}', '${proxyUrl}')">Refresh</button>
            </div>
          </div>`;
        }).join('');
      }
    }

    // Render compact URL list (all pages, not just overlays)
    if (linksContainer) {
      if (allPages.length === 0) {
        linksContainer.innerHTML = '<div class="overlay-link-empty">No game apps configured</div>';
      } else {
        linksContainer.innerHTML = allPages.map(({ app, page }) => {
          const proxyUrl = window.location.origin + '/game/' + app.id + page.path;
          const statusClass = app.reachable ? 'running' : 'stopped';
          return `<div class="overlay-link-row">
            <div class="overlay-link-info">
              <span class="overlay-link-label">${app.name} — ${page.label}</span>
              <span class="overlay-link-desc app-status-dot-inline ${statusClass}">Port ${app.port}</span>
            </div>
            <div class="overlay-link-actions">
              <input type="text" class="overlay-link-url" value="${proxyUrl}" readonly>
              <button class="btn" onclick="copyGameOverlayUrl('${proxyUrl}')">Copy</button>
              <a class="btn btn-accent" href="${proxyUrl}" target="_blank">Open</a>
            </div>
          </div>`;
        }).join('');
      }
    }

    // Scale iframes after DOM update
    requestAnimationFrame(() => scaleOverlayPreviews());
  }

  // Refresh a specific overlay preview iframe
  window.refreshOverlayPreview = function(cardId, url) {
    const card = document.getElementById(cardId);
    if (!card) return;
    const iframe = card.querySelector('.overlay-preview-frame');
    if (iframe) iframe.src = url + '?t=' + Date.now();
  };

  // Auto-scale iframes to fit their card container
  function scaleOverlayPreviews() {
    document.querySelectorAll('.overlay-preview-frame-wrap').forEach(wrap => {
      const iframe = wrap.querySelector('.overlay-preview-frame');
      if (!iframe) return;
      const cardWidth = wrap.offsetWidth;
      const scale = cardWidth / 1920;
      iframe.style.transform = `scale(${scale})`;
    });
  }

  // Scale on resize and after rendering
  const overlayResizeObserver = new ResizeObserver(() => scaleOverlayPreviews());
  const cardsGrid = document.getElementById('game-overlay-cards');
  if (cardsGrid) overlayResizeObserver.observe(cardsGrid);

  // Hook into apps-status to update game overlay links
  socket.on('apps-status', (appsList) => {
    renderGameOverlayLinks(appsList);
  });

  // ─── Searchle events ─────────────────────────────────────────────
  socket.on('searchle-connected', (connected) => {
    UI.updateSearchleConnection(connected);
  });

  socket.on('searchle-game-state', (data) => {
    UI.updateSearchleConnection(true);
    UI.renderSearchleState(data);
  });

  socket.on('searchle-new-guess', (data) => {
    UI.addSearchleGuess(data);
  });

  socket.on('searchle-game-won', (data) => {
    UI.searchleGameWon(data);
    // Refresh history after a win
    setTimeout(() => {
      fetch('/api/searchle/history')
        .then(r => r.json())
        .then(history => {
          UI.renderSearchleHistory(history);
          UI.renderSearchleLeaderboard(history);
        })
        .catch(() => {});
    }, 1000);
  });

  socket.on('searchle-new-game', (data) => {
    UI.searchleNewGameEvent(data);
  });

  socket.on('sp-pool-word-added', (data) => {
    if (data && data.word && data.wordNumber) {
      UI.addSearchlePoolWord(data.word, data.wordNumber);
    }
  });

  window.searchleNewGame = function () {
    fetch('/api/searchle/new', { method: 'POST' }).catch(() => {});
  };

  window.searchleReveal = function () {
    fetch('/api/searchle/reveal')
      .then(r => {
        if (!r.ok) throw new Error(r.status);
        return r.json();
      })
      .then(data => {
        const el = document.getElementById('searchle-target');
        if (el && data.targetWord) el.textContent = data.targetWord;
        else if (el) el.textContent = '(no word)';
      })
      .catch(() => {
        const el = document.getElementById('searchle-target');
        if (el) el.textContent = '(error)';
      });
  };

  window.searchleResetJackpot = function () {
    fetch('/api/searchle/reset-jackpot', { method: 'POST' }).catch(() => {});
  };

  window.searchleToggleJackpot = function () {
    const cb = document.getElementById('searchle-jackpot-toggle');
    fetch('/api/searchle/jackpot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: cb.checked })
    }).catch(() => {});
  };

  // Model toggle handler
  window.searchleToggleModel = function () {
    const glove = document.getElementById('searchle-model-glove');
    const w2v = document.getElementById('searchle-model-w2v');
    const ft = document.getElementById('searchle-model-ft');

    const models = [];
    if (glove && glove.checked && !glove.disabled) models.push('glove-300d');
    if (w2v && w2v.checked && !w2v.disabled) models.push('word2vec');
    if (ft && ft.checked && !ft.disabled) models.push('fasttext');

    if (models.length === 0) {
      // Prevent all unchecked — re-check the one that was just unchecked
      if (glove && !glove.disabled) glove.checked = true;
      else if (ft && !ft.disabled) ft.checked = true;
      else if (w2v && !w2v.disabled) w2v.checked = true;
      return;
    }

    fetch('/api/searchle/models', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ activeModels: models })
    })
      .then(r => r.json())
      .then(data => {
        if (data.models) UI.updateSearchleModels(data);
      })
      .catch(() => {});
  };

  // Listen for model updates from server
  socket.on('searchle-models-updated', (data) => {
    UI.updateSearchleModels(data);
  });

  // ─── Word500 events ──────────────────────────────────────────────
  socket.on('word500-connected', (connected) => {
    UI.updateWord500Connection(connected);
  });

  socket.on('word500-game-state', (data) => {
    UI.updateWord500Connection(true);
    UI.renderWord500State(data);
  });

  socket.on('word500-guess', (data) => {
    UI.addWord500Guess(data);
  });

  socket.on('word500-game-over', (data) => {
    UI.word500GameOver(data);
    // Refresh stats (history + leaderboard)
    fetch('/api/word500/stats')
      .then(r => r.ok ? r.json() : null)
      .then(stats => {
        if (stats) {
          UI.renderWord500History(stats.recentGames || []);
          UI.renderWord500Leaderboard(stats.leaderboard || []);
        }
      })
      .catch(() => {});
  });

  socket.on('word500-new-game', () => {
    UI.word500NewGameEvent();
  });

  window.word500NewGame = function () {
    fetch('/api/word500/new-game', { method: 'POST' }).catch(() => {});
  };

  window.word500Reveal = function () {
    fetch('/api/word500/state')
      .then(r => r.json())
      .then(data => {
        const el = document.getElementById('word500-word');
        if (el && data.word) el.textContent = data.word.toUpperCase();
      })
      .catch(() => {
        const el = document.getElementById('word500-word');
        if (el) el.textContent = 'Error';
      });
  };

  window.word500ToggleJackpot = function () {
    const cb = document.getElementById('word500-jackpot-toggle');
    fetch('/api/word500/jackpot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: cb.checked })
    }).catch(() => {});
  };

  window.word500ResetJackpot = function () {
    fetch('/api/word500/reset-jackpot', { method: 'POST' }).catch(() => {});
  };

  window.word500ToggleSlash = function () {
    fetch('/api/word500/toggle-slash-prefix', { method: 'POST' })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data) {
          const cb = document.getElementById('word500-slash-toggle');
          if (cb) cb.checked = data.requireSlashPrefix;
        }
      })
      .catch(() => {});
  };

  window.word500TestGuess = function () {
    const wordInput = document.getElementById('word500-test-word');
    const userInput = document.getElementById('word500-test-user');
    const word = (wordInput?.value || '').trim().toLowerCase();
    const user = (userInput?.value || 'Admin').trim();
    if (!word || word.length !== 5) return;

    fetch('/api/word500/test-guess', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word, user })
    }).then(() => {
      if (wordInput) wordInput.value = '';
    }).catch(() => {});
  };

  // ─── Squaredle admin ──────────────────────────────────────────────
  function getSquaredleSettings() {
    return {
      rows: parseInt(document.getElementById('squaredle-rows')?.value || 4, 10),
      cols: parseInt(document.getElementById('squaredle-cols')?.value || 4, 10),
      minWordLength: parseInt(document.getElementById('squaredle-min-length')?.value || 3, 10),
      showManualInput: document.getElementById('squaredle-show-manual')?.checked !== false,
      showFoundWords: document.getElementById('squaredle-show-found')?.checked !== false
    };
  }

  function sendSquaredleCommand(type, data) {
    return fetch('/api/squaredle/command', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, data })
    });
  }

  window.squaredleNewGame = function () {
    const settings = getSquaredleSettings();
    sendSquaredleCommand('new-game', settings)
      .then(r => {
        if (r.ok) UI.showSquaredleStatus('New game triggered!');
        else UI.showSquaredleStatus('Failed - is Squaredle running?');
      })
      .catch(() => UI.showSquaredleStatus('Failed - is Squaredle running?'));
  };

  window.squaredleClearState = function () {
    sendSquaredleCommand('clear-state', {})
      .then(r => {
        if (r.ok) UI.showSquaredleStatus('Saved game cleared.');
        else UI.showSquaredleStatus('Failed - is Squaredle running?');
      })
      .catch(() => UI.showSquaredleStatus('Failed - is Squaredle running?'));
  };

  window.squaredleToggleJackpot = function () {
    const cb = document.getElementById('squaredle-jackpot-toggle');
    fetch('/api/squaredle/jackpot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: cb.checked })
    }).catch(() => {});
  };

  window.squaredleResetJackpot = function () {
    fetch('/api/squaredle/reset-jackpot', { method: 'POST' })
      .then(r => {
        if (r.ok) UI.showSquaredleStatus('Jackpot reset!');
        else UI.showSquaredleStatus('Failed - is Squaredle running?');
      })
      .catch(() => UI.showSquaredleStatus('Failed - is Squaredle running?'));
  };

  window.squaredleStartDaily = function () {
    fetch('/api/squaredle/start-daily', { method: 'POST' })
      .then(r => r.json())
      .then(data => {
        if (data.ok) UI.showSquaredleStatus('Daily game started: ' + (data.word || ''));
        else UI.showSquaredleStatus('Failed: ' + (data.error || 'unknown'));
      })
      .catch(() => UI.showSquaredleStatus('Failed - is Squaredle running?'));
  };

  // Poll Squaredle game state
  function pollSquaredleState() {
    fetch('/api/squaredle/state')
      .then(r => r.json())
      .then(state => {
        if (!state.error) {
          UI.renderSquaredleState(state);
          UI.updateSquaredleConnection(true);
        }
      })
      .catch(() => UI.updateSquaredleConnection(false));
  }
  setInterval(pollSquaredleState, 3000);
  pollSquaredleState();

  // Range slider live value updates
  ['rows', 'cols', 'min-length'].forEach(id => {
    const slider = document.getElementById('squaredle-' + id);
    const label = document.getElementById('squaredle-' + id + '-val');
    if (slider && label) {
      slider.addEventListener('input', () => { label.textContent = slider.value; });
    }
  });

  // Display toggles send command immediately
  ['squaredle-show-manual', 'squaredle-show-found'].forEach(id => {
    const toggle = document.getElementById(id);
    if (toggle) {
      toggle.addEventListener('change', () => {
        sendSquaredleCommand('display', getSquaredleSettings()).catch(() => {});
      });
    }
  });

  let opsSummaryRefreshTimer = null;

  function formatOpsElapsed(ts) {
    if (!ts) return 'just now';
    const diff = Math.max(0, Date.now() - new Date(ts).getTime());
    const sec = Math.floor(diff / 1000);
    if (sec < 60) return `${sec}s ago`;
    const min = Math.floor(sec / 60);
    if (min < 60) return `${min}m ago`;
    const hr = Math.floor(min / 60);
    if (hr < 24) return `${hr}h ago`;
    const day = Math.floor(hr / 24);
    return `${day}d ago`;
  }

  function formatOpsCount(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '--';
    return Number(value).toLocaleString();
  }

  function getOpsServiceTone(service) {
    if (!service || !service.ok) return 'down';
    if (service.key === 'wordTycoon') {
      return Number(service.payload?.memoryMB?.rss || 0) >= 500 ? 'warn' : 'ok';
    }
    if (service.key === 'searchle') {
      return Number(service.payload?.memoryMB?.rss || 0) >= 650 ? 'warn' : 'ok';
    }
    if (service.key === 'sassie') {
      return Number(service.payload?.playback?.connectedClients || 0) < 1 ? 'warn' : 'ok';
    }
    return 'ok';
  }

  function getOpsServiceSummary(service) {
    if (!service || !service.ok) {
      return {
        pill: 'Down',
        rows: [
          ['Status', 'Unreachable'],
          ['Error', service?.error || 'Unknown error']
        ],
        note: 'This service did not answer the summary check.'
      };
    }

    const payload = service.payload || {};
    if (service.key === 'chatRelay') {
      const platformSummary = ['tiktok', 'youtube', 'discord']
        .filter((platform) => payload.platforms?.[platform])
        .map((platform) => platform.charAt(0).toUpperCase() + platform.slice(1))
        .join(', ');
      return {
        pill: 'Healthy',
        rows: [
          ['RSS', `${formatOpsCount(payload.memoryMB?.rss)} MB`],
          ['Sessions', formatOpsCount(payload.sessions?.count)],
          ['Apps', formatOpsCount(payload.appsRegistered)]
        ],
        note: platformSummary ? `Connected platforms: ${platformSummary}.` : 'No inbound platform connections are currently active.'
      };
    }

    if (service.key === 'wordTycoon') {
      const backupGB = payload.backups?.totalSizeMB ? `${(payload.backups.totalSizeMB / 1024).toFixed(2)} GB` : '--';
      return {
        pill: getOpsServiceTone(service) === 'warn' ? 'Watch' : 'Healthy',
        rows: [
          ['RSS', `${formatOpsCount(payload.memoryMB?.rss)} MB`],
          ['Players', formatOpsCount(payload.playerCount)],
          ['Backups', backupGB]
        ],
        note: `Hot ledger rows: ${formatOpsCount(payload.ledger?.eligibleHotRows)}. Archive rows: ${formatOpsCount(payload.ledger?.archiveRows)}.`
      };
    }

    if (service.key === 'searchle') {
      const models = Array.isArray(payload.models?.activeModels) && payload.models.activeModels.length
        ? payload.models.activeModels.join(', ')
        : 'none';
      return {
        pill: getOpsServiceTone(service) === 'warn' ? 'Watch' : 'Healthy',
        rows: [
          ['RSS', `${formatOpsCount(payload.memoryMB?.rss)} MB`],
          ['Guesses', formatOpsCount(payload.game?.guessCount)],
          ['Models', formatOpsCount(payload.models?.activeModelCount)]
        ],
        note: `Active models: ${models}. Vocabulary: ${formatOpsCount(payload.models?.totalVocabulary)} words.`
      };
    }

    if (service.key === 'sassie') {
      const clients = Number(payload.playback?.connectedClients || 0);
      return {
        pill: clients < 1 ? 'Watch' : 'Healthy',
        rows: [
          ['Clients', formatOpsCount(clients)],
          ['Broadcasts', formatOpsCount(payload.playback?.totalBroadcasts)],
          ['Scheduler', payload.scheduler?.enabled ? 'On' : 'Off']
        ],
        note: payload.playback?.lastBroadcastAt
          ? `Last broadcast ${formatOpsElapsed(payload.playback.lastBroadcastAt)}.`
          : 'No recent Sassie broadcast has been recorded.'
      };
    }

    return { pill: 'Healthy', rows: [], note: '' };
  }

  function getOpsActionLinks(alert) {
    const links = [];
    if (alert.serviceKey === 'chatRelay') {
      links.push({ label: 'Chat Relay JSON', href: '/api/health' });
      links.push({ label: 'Ops Summary JSON', href: '/api/ops/summary' });
    } else if (alert.serviceKey === 'searchle') {
      links.push({ label: 'Searchle Health', href: 'https://subtextle.com/api/health', external: true });
    } else if (alert.serviceKey === 'sassie') {
      links.push({ label: 'Sassie Health', href: '/api/runtime/health' });
      links.push({ label: 'Sassie Monitor', href: '/api/runtime/monitor' });
    } else if (alert.serviceKey === 'wordTycoon') {
      links.push({ label: 'Ops Summary JSON', href: '/api/ops/summary' });
    }
    return links;
  }

  function buildOpsAlerts(data, services) {
    const alerts = [];
    const checkedAt = data?.checkedAt ? new Date(data.checkedAt).getTime() : 0;
    const ageMs = checkedAt ? Date.now() - checkedAt : 0;

    if (!checkedAt || ageMs > 90000) {
      alerts.push({
        tone: 'warn',
        serviceKey: 'chatRelay',
        title: 'Snapshot is stale',
        body: checkedAt
          ? `The summary is ${formatOpsElapsed(data.checkedAt)}. Refresh before trusting this view during an incident.`
          : 'No successful summary refresh has been recorded yet.'
      });
    }

    services.forEach((service) => {
      if (!service || !service.ok) {
        alerts.push({
          tone: 'down',
          serviceKey: service?.key || 'chatRelay',
          title: `${service?.name || 'Service'} is down`,
          body: service?.error || 'This service did not answer the summary check.'
        });
      }
    });

    const wordTycoon = services.find((service) => service?.key === 'wordTycoon' && service.ok);
    const wtRss = Number(wordTycoon?.payload?.memoryMB?.rss || 0);
    const wtBackupsMb = Number(wordTycoon?.payload?.backups?.totalSizeMB || 0);
    if (wtRss >= 500) {
      alerts.push({
        tone: 'warn',
        serviceKey: 'wordTycoon',
        title: 'Word Tycoon memory is elevated',
        body: `RSS is ${formatOpsCount(wtRss)} MB. If this persists across refreshes, check Word Tycoon health and ledger maintenance status on the droplet.`
      });
    }
    if (wtBackupsMb >= 5120) {
      alerts.push({
        tone: 'warn',
        serviceKey: 'wordTycoon',
        title: 'Word Tycoon backup footprint is above the smoke threshold',
        body: `Backups are ${(wtBackupsMb / 1024).toFixed(2)} GB. Review backup growth before the next risky deploy or restart cycle.`
      });
    }

    const searchle = services.find((service) => service?.key === 'searchle' && service.ok);
    const searchleRss = Number(searchle?.payload?.memoryMB?.rss || 0);
    if (searchleRss >= 650) {
      alerts.push({
        tone: 'warn',
        serviceKey: 'searchle',
        title: 'Searchle memory is above the watch threshold',
        body: `RSS is ${formatOpsCount(searchleRss)} MB. Compare it against the dual-model baseline before treating it as a leak.`
      });
    }

    const sassie = services.find((service) => service?.key === 'sassie' && service.ok);
    const sassieClients = Number(sassie?.payload?.playback?.connectedClients || 0);
    if (sassie && sassieClients < 1) {
      alerts.push({
        tone: 'warn',
        serviceKey: 'sassie',
        title: 'Sassie has no connected overlay clients',
        body: 'Runtime is up, but nothing is currently connected to playback. Check the overlay browser source and runtime monitor before going live.'
      });
    }

    return alerts;
  }

  function renderOpsFocus(data, services) {
    const focus = document.getElementById('ops-focus-strip');
    const alertsEl = document.getElementById('ops-summary-alerts');
    if (!focus || !alertsEl) return;

    const alerts = buildOpsAlerts(data, services);
    const downCount = alerts.filter((alert) => alert.tone === 'down').length;
    const warnCount = alerts.filter((alert) => alert.tone === 'warn').length;

    let tone = 'ok';
    let title = 'All clear';
    let copy = 'Core services look healthy. Use the JSON links below if you want to drill into raw payloads.';

    if (downCount > 0) {
      tone = 'down';
      title = `${downCount} service${downCount === 1 ? '' : 's'} need attention`;
      copy = 'Start with the down service cards below, then open the matching health surface before restarting anything.';
    } else if (warnCount > 0) {
      tone = 'warn';
      title = `${warnCount} watch item${warnCount === 1 ? '' : 's'} in the stack`;
      copy = 'The stack is reachable, but something is drifting. Use the suggested next actions below before this becomes an incident.';
    }

    focus.className = `ops-focus-strip ${tone}`;
    focus.innerHTML = `
      <div class="ops-focus-title">${title}</div>
      <div class="ops-focus-copy">${copy}</div>
    `;

    if (!alerts.length) {
      alertsEl.innerHTML = `
        <div class="ops-alert ok">
          <div class="ops-alert-top">
            <span class="ops-pill ok">Healthy</span>
            <div class="ops-alert-title">No active warnings from the current snapshot</div>
          </div>
          <div class="ops-alert-body">Keep using Refresh Ops before deploys, and use the ecosystem smoke script when the whole stack feels suspect.</div>
        </div>
      `;
      return;
    }

    alertsEl.innerHTML = alerts.map((alert) => {
      const links = getOpsActionLinks(alert).map((link) => `
        <a class="ops-link" href="${link.href}" ${link.external ? 'target="_blank" rel="noreferrer"' : 'target="_blank"'}>${link.label}</a>
      `).join('');
      return `
        <div class="ops-alert ${alert.tone}">
          <div class="ops-alert-top">
            <span class="ops-pill ${alert.tone}">${alert.tone === 'down' ? 'Urgent' : (alert.tone === 'warn' ? 'Watch' : 'Healthy')}</span>
            <div class="ops-alert-title">${alert.title}</div>
          </div>
          <div class="ops-alert-body">${alert.body}</div>
          ${links ? `<div class="ops-alert-links">${links}</div>` : ''}
        </div>
      `;
    }).join('');
  }

  function renderOpsSummary(data) {
    const grid = document.getElementById('ops-summary-grid');
    const meta = document.getElementById('ops-summary-meta');
    const focus = document.getElementById('ops-focus-strip');
    const alerts = document.getElementById('ops-summary-alerts');
    if (!grid || !meta) return;

    if (!data || !data.services) {
      grid.innerHTML = '<div class="ops-card down"><div class="ops-card-title">Could not load operations summary.</div></div>';
      meta.textContent = 'Refresh failed';
      if (focus) {
        focus.className = 'ops-focus-strip down';
        focus.innerHTML = '<div class="ops-focus-title">Snapshot unavailable</div><div class="ops-focus-copy">Refresh again, then fall back to the individual health routes if this keeps failing.</div>';
      }
      if (alerts) {
        alerts.innerHTML = '';
      }
      return;
    }

    const services = [
      data.services.chatRelay,
      data.services.wordTycoon,
      data.services.searchle,
      data.services.sassie
    ].filter(Boolean);

    grid.innerHTML = services.map((service) => {
      const tone = getOpsServiceTone(service);
      const summary = getOpsServiceSummary(service);
      const rows = summary.rows.map(([label, value]) => `
        <div class="ops-stat">
          <span class="ops-stat-label">${label}</span>
          <span class="ops-stat-value">${value}</span>
        </div>
      `).join('');
      return `
        <div class="ops-card ${tone}">
          <div class="ops-card-top">
            <div class="ops-card-title">${service.name}</div>
            <span class="ops-pill ${tone}">${summary.pill}</span>
          </div>
          <div class="ops-card-body">${rows}</div>
          <div class="ops-card-note">${summary.note || ''}</div>
        </div>
      `;
    }).join('');

    meta.textContent = `Updated ${formatOpsElapsed(data.checkedAt)}`;
    renderOpsFocus(data, services);
  }

  function loadOpsSummary() {
    return fetch('/api/ops/summary')
      .then((r) => r.ok ? r.json() : null)
      .then((data) => renderOpsSummary(data))
      .catch(() => renderOpsSummary(null));
  }

  window.refreshOpsSummary = function () {
    return loadOpsSummary();
  };

  // Load initial data
  fetch('/api/commands')
    .then(r => r.json())
    .then(cmds => UI.renderCommands(cmds))
    .catch(() => {});

  fetch('/api/apps')
    .then(r => r.json())
    .then(appsList => {
      UI.renderApps(appsList);
      renderGameOverlayLinks(appsList);
    })
    .catch(() => {});

  loadOpsSummary();
  if (opsSummaryRefreshTimer) clearInterval(opsSummaryRefreshTimer);
  opsSummaryRefreshTimer = setInterval(loadOpsSummary, 30000);

  // Load Searchle data (don't override connection status on error -
  // the socket 'searchle-connected' event is the source of truth)
  fetch('/api/searchle/state')
    .then(r => {
      if (!r.ok) throw new Error('unreachable');
      return r.json();
    })
    .then(state => {
      UI.updateSearchleConnection(true);
      UI.renderSearchleState(state);
    })
    .catch(() => { /* socket event handles connection status */ });

  fetch('/api/searchle/jackpot')
    .then(r => r.ok ? r.json() : null)
    .then(data => {
      if (data) {
        const cb = document.getElementById('searchle-jackpot-toggle');
        if (cb) cb.checked = data.jackpotEnabled;
      }
    })
    .catch(() => {});

  fetch('/api/searchle/history')
    .then(r => r.json())
    .then(history => {
      UI.renderSearchleHistory(history);
      UI.renderSearchleLeaderboard(history);
    })
    .catch(() => {});

  // Load Searchle model info
  fetch('/api/searchle/models')
    .then(r => {
      if (!r.ok) throw new Error('unreachable');
      return r.json();
    })
    .then(data => UI.updateSearchleModels(data))
    .catch(() => {});

  // Load SP Pool word list
  fetch('/api/searchle/sp-pool-index')
    .then(r => r.json())
    .then(data => UI.renderSearchlePoolWords(data))
    .catch(() => {});

  // Load Word500 data
  fetch('/api/word500/state')
    .then(r => {
      if (!r.ok) throw new Error('unreachable');
      return r.json();
    })
    .then(state => {
      UI.updateWord500Connection(true);
      UI.renderWord500State(state);
    })
    .catch(() => {});

  fetch('/api/word500/stats')
    .then(r => r.ok ? r.json() : null)
    .then(stats => {
      if (stats) {
        UI.renderWord500History(stats.recentGames || []);
        UI.renderWord500Leaderboard(stats.leaderboard || []);
      }
    })
    .catch(() => {});

  // ─── Cosmetics Admin ───────────────────────────────────────────────
  let cosmeticsCatalogCache = null;
  let cosmeticsSelectedPlayer = null;
  let cosmeticsSearchTimeout = null;

  // Load catalog on first tab switch
  document.querySelector('.tab[data-tab="cosmetics"]')?.addEventListener('click', () => {
    if (!cosmeticsCatalogCache) {
      fetch('/api/cosmetics-admin/shop')
        .then(r => r.json())
        .then(data => {
          // API returns {category: [items...]} — flatten to array
          let items;
          if (Array.isArray(data)) {
            items = data;
          } else if (data.items && Array.isArray(data.items)) {
            items = data.items;
          } else {
            items = [];
            for (const [category, list] of Object.entries(data)) {
              if (Array.isArray(list)) {
                for (const item of list) {
                  items.push({ ...item, category, css_property: item.css || item.css_property, buff: item.buff || null, buffs: item.buffs || null });
                }
              }
            }
          }
          cosmeticsCatalogCache = items;
          UI.renderCosmeticsCatalog(cosmeticsCatalogCache);
        })
        .catch(() => {
          document.getElementById('cosmetics-grid').innerHTML =
            '<div class="cosmetics-loading">Failed to load cosmetics. Is Word Empires running?</div>';
        });
    }
  });

  // Category filter clicks
  document.getElementById('cosmetic-category-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cosmetic-filter');
    if (btn && btn.dataset.category) UI.setCosmeticsCategoryFilter(btn.dataset.category);
  });

  // Rarity filter clicks
  document.getElementById('cosmetic-rarity-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cosmetic-filter');
    if (btn && btn.dataset.rarity) UI.setCosmeticsRarityFilter(btn.dataset.rarity);
  });

  // Set filter clicks
  document.getElementById('cosmetic-set-filters')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.cosmetic-filter');
    if (btn && btn.dataset.set) UI.setCosmeticsSetFilter(btn.dataset.set);
  });

  // Player search (debounced)
  let lastSearchResults = [];
  const cosmeticsSearchInput = document.getElementById('cosmetics-player-search');
  if (cosmeticsSearchInput) {
    cosmeticsSearchInput.addEventListener('input', () => {
      clearTimeout(cosmeticsSearchTimeout);
      const q = cosmeticsSearchInput.value.trim();
      if (q.length < 2) {
        document.getElementById('cosmetics-player-results').innerHTML = '';
        lastSearchResults = [];
        return;
      }
      cosmeticsSearchTimeout = setTimeout(() => {
        fetch(`/api/cosmetics-admin/players?search=${encodeURIComponent(q)}`)
          .then(r => r.json())
          .then(players => {
            lastSearchResults = players;
            UI.renderPlayerSearchResults(players);
          })
          .catch(() => {});
      }, 300);
    });
  }

  window.cosmeticsSelectPlayer = function (playerId) {
    const player = lastSearchResults.find(p => p.id === playerId);
    if (!player) return;
    cosmeticsSelectedPlayer = player;
    // Find duplicate accounts (same display name, different id)
    const name = (player.display_name || player.username || '').toLowerCase();
    const duplicates = lastSearchResults.filter(p =>
      p.id !== playerId && (p.display_name || p.username || '').toLowerCase() === name
    );
    UI.selectCosmeticsPlayer(player, duplicates);
    loadPlayerCosmetics(playerId);
  };

  function loadPlayerCosmetics(playerId) {
    fetch(`/api/cosmetics-admin/player/${playerId}/cosmetics`)
      .then(r => r.json())
      .then(data => UI.renderPlayerOwnedCosmetics(data.owned || data))
      .catch(() => {});
  }

  // Grant cosmetic to selected player
  window.cosmeticsGrant = function (cosmeticId) {
    if (!cosmeticsSelectedPlayer) return;
    fetch('/api/cosmetics-admin/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: cosmeticsSelectedPlayer.id, cosmeticId })
    })
      .then(r => {
        if (r.ok) loadPlayerCosmetics(cosmeticsSelectedPlayer.id);
      })
      .catch(() => {});
  };

  // Grant + equip in one step
  window.cosmeticsGrantAndEquip = function (cosmeticId) {
    if (!cosmeticsSelectedPlayer) return;
    const pid = cosmeticsSelectedPlayer.id;
    fetch('/api/cosmetics-admin/grant', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: pid, cosmeticId })
    })
      .then(r => {
        if (!r.ok) throw new Error();
        return fetch('/api/cosmetics-admin/equip', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ playerId: pid, cosmeticId, equip: true })
        });
      })
      .then(r => {
        if (r.ok) loadPlayerCosmetics(pid);
      })
      .catch(() => {});
  };

  // Equip / unequip
  window.cosmeticsEquip = function (cosmeticId, equip) {
    if (!cosmeticsSelectedPlayer) return;
    fetch('/api/cosmetics-admin/equip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: cosmeticsSelectedPlayer.id, cosmeticId, equip })
    })
      .then(r => {
        if (r.ok) loadPlayerCosmetics(cosmeticsSelectedPlayer.id);
      })
      .catch(() => {});
  };

  // Revoke cosmetic
  window.cosmeticsRevoke = function (cosmeticId) {
    if (!cosmeticsSelectedPlayer) return;
    fetch('/api/cosmetics-admin/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId: cosmeticsSelectedPlayer.id, cosmeticId })
    })
      .then(r => {
        if (r.ok) loadPlayerCosmetics(cosmeticsSelectedPlayer.id);
      })
      .catch(() => {});
  };

  // Merge duplicate player into selected player
  window.cosmeticsMerge = function (keepId, removeId) {
    if (!confirm(`Merge player ID ${removeId} into ID ${keepId}?\n\nThis will combine coins, taps, businesses & cosmetics into the selected player and delete the duplicate.`)) return;
    fetch('/api/cosmetics-admin/merge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ keepId, removeId })
    })
      .then(r => r.json())
      .then(data => {
        if (data.ok) {
          // Refresh search to reflect merged state
          const q = cosmeticsSearchInput ? cosmeticsSearchInput.value.trim() : '';
          if (q.length >= 2) {
            fetch(`/api/cosmetics-admin/players?search=${encodeURIComponent(q)}`)
              .then(r => r.json())
              .then(players => {
                lastSearchResults = players;
                UI.renderPlayerSearchResults(players);
                // Re-select the kept player
                const kept = players.find(p => p.id === keepId);
                if (kept) {
                  cosmeticsSelectedPlayer = kept;
                  const name = (kept.display_name || kept.username || '').toLowerCase();
                  const duplicates = players.filter(p =>
                    p.id !== keepId && (p.display_name || p.username || '').toLowerCase() === name
                  );
                  UI.selectCosmeticsPlayer(kept, duplicates);
                  loadPlayerCosmetics(keepId);
                }
              });
          }
        } else {
          alert('Merge failed: ' + (data.message || 'Unknown error'));
        }
      })
      .catch(() => alert('Merge failed: server unreachable'));
  };

  // Merge ALL duplicate players at once
  window.cosmeticsMergeAll = function () {
    const btn = document.getElementById('cosmetics-merge-all-btn');
    const status = document.getElementById('cosmetics-merge-all-status');

    // First, check how many duplicates exist
    btn.disabled = true;
    status.className = 'cosmetics-merge-all-status';
    status.innerHTML = 'Scanning for duplicates...';

    fetch('/api/cosmetics-admin/duplicates')
      .then(r => r.json())
      .then(data => {
        if (!data.ok || !data.groups || data.groups.length === 0) {
          status.className = 'cosmetics-merge-all-status success';
          status.innerHTML = '✓ No duplicate players found';
          btn.disabled = false;
          return;
        }

        // Show how many duplicates and ask for confirmation
        const totalDups = data.groups.reduce((sum, g) => sum + g.count - 1, 0);
        const groupNames = data.groups.map(g => `${g.display_name} (${g.platform}, ${g.count} entries)`).join('\n  ');
        if (!confirm(
          `Found ${data.groups.length} duplicate group(s) with ${totalDups} extra account(s):\n\n  ${groupNames}\n\nMerge all? This keeps the most active account per group and combines coins, taps, businesses & cosmetics.`
        )) {
          status.innerHTML = '';
          btn.disabled = false;
          return;
        }

        // Execute merge-all
        status.innerHTML = 'Merging duplicates...';
        fetch('/api/cosmetics-admin/merge-all-duplicates', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({})
        })
          .then(r => r.json())
          .then(result => {
            btn.disabled = false;
            if (result.ok) {
              if (result.merged === 0) {
                status.className = 'cosmetics-merge-all-status success';
                status.innerHTML = '✓ No duplicates to merge';
              } else {
                status.className = 'cosmetics-merge-all-status success';
                let html = `✓ Merged ${result.merged} duplicate(s)`;
                if (result.details && result.details.length > 0) {
                  html += `<div class="merge-all-report">`;
                  for (const d of result.details) {
                    html += `<div class="merge-all-report-item">
                      <span class="removed">ID ${d.removed.id} "${d.removed.name}"</span> →
                      <span class="kept">ID ${d.kept.id} "${d.kept.name}"</span>
                    </div>`;
                  }
                  html += `</div>`;
                }
                status.innerHTML = html;
              }
              // Refresh search if active
              const q = cosmeticsSearchInput ? cosmeticsSearchInput.value.trim() : '';
              if (q.length >= 2) {
                fetch(`/api/cosmetics-admin/players?search=${encodeURIComponent(q)}`)
                  .then(r => r.json())
                  .then(players => {
                    lastSearchResults = players;
                    UI.renderPlayerSearchResults(players);
                  });
              }
            } else {
              status.className = 'cosmetics-merge-all-status error';
              status.innerHTML = '✗ ' + (result.message || 'Merge failed');
            }
          })
          .catch(() => {
            btn.disabled = false;
            status.className = 'cosmetics-merge-all-status error';
            status.innerHTML = '✗ Server unreachable';
          });
      })
      .catch(() => {
        btn.disabled = false;
        status.className = 'cosmetics-merge-all-status error';
        status.innerHTML = '✗ Failed to scan — is Word Empires running?';
      });
  };

  // ==================== ACCOUNTS ADMIN PANEL ====================

  let accountsCurrentDiscordId = null;
  let accountsCurrentPlayerId = null;
  let accountsLedgerCurrentPage = 1;
  let accountsUnlinkedPlatform = null;
  let accountsUnlinkedPlatformUserId = null;
  const accountsMultiSelected = new Map(); // key: "platform:platformUserId" → {platform, platformUserId, playerId, name}

  window.accountsSearch = function () {
    const q = document.getElementById('accounts-search-input').value.trim();
    if (!q) return;
    fetch(`/api/accounts-admin/search?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(players => {
        const el = document.getElementById('accounts-search-results');
        if (!players || players.length === 0) {
          el.innerHTML = '<div class="accounts-no-results">No players found</div>';
          return;
        }
        accountsMultiSelected.clear();
        accountsUpdateMultiCount();
        el.innerHTML = players.map(p => {
          const key = `${p.platform}:${p.platform_user_id}`;
          return `
          <div class="accounts-result-item">
            <input type="checkbox" class="accounts-result-cb" data-key="${key}" data-platform="${p.platform}" data-puid="${p.platform_user_id}" data-pid="${p.id}" data-name="${escapeHtml(p.display_name || p.username)}" onchange="accountsToggleMultiSelect(this)">
            <span class="accounts-result-id">#${p.id}</span>
            <span class="accounts-result-name" onclick="accountsSelectPlayer('${p.platform}', '${p.platform_user_id}', '${p.id}')" style="cursor:pointer">${escapeHtml(p.display_name || p.username)}</span>
            <span class="accounts-result-platform">${p.platform}</span>
            <span class="accounts-result-coins">${formatNumber(p.coins)} coins</span>
          </div>`;
        }).join('');
      });
  };

  document.getElementById('accounts-search-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') accountsSearch();
  });

  // Quick Link by Discord ID
  window.accountsQuickLinkByDiscord = function () {
    const discordId = document.getElementById('accounts-discord-id-input').value.trim();
    const platform = document.getElementById('accounts-quicklink-platform').value;
    const platformUserId = document.getElementById('accounts-quicklink-userid').value.trim();
    const statusEl = document.getElementById('accounts-quicklink-status');
    if (!discordId) { statusEl.textContent = 'Enter a Discord User ID'; statusEl.className = 'accounts-quicklink-status error'; return; }
    if (!platformUserId) { statusEl.textContent = 'Enter a platform username'; statusEl.className = 'accounts-quicklink-status error'; return; }
    statusEl.textContent = 'Linking...';
    statusEl.className = 'accounts-quicklink-status pending';
    fetch(`/api/accounts-admin/${discordId}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, platformUserId })
    }).then(r => r.json()).then(data => {
      if (data.ok) {
        statusEl.textContent = `Linked ${platform}:${platformUserId} to Discord ${discordId}`;
        statusEl.className = 'accounts-quicklink-status success';
        document.getElementById('accounts-quicklink-userid').value = '';
        accountsLoadDetails(discordId);
        accountsLoadGroups();
      } else {
        statusEl.textContent = data.message || 'Link failed';
        statusEl.className = 'accounts-quicklink-status error';
      }
    }).catch(() => {
      statusEl.textContent = 'Server error';
      statusEl.className = 'accounts-quicklink-status error';
    });
  };

  document.getElementById('accounts-quicklink-userid').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') accountsQuickLinkByDiscord();
  });

  window.accountsToggleMultiSelect = function (cb) {
    const key = cb.dataset.key;
    if (cb.checked) {
      accountsMultiSelected.set(key, {
        platform: cb.dataset.platform,
        platformUserId: cb.dataset.puid,
        playerId: cb.dataset.pid,
        name: cb.dataset.name
      });
    } else {
      accountsMultiSelected.delete(key);
    }
    accountsUpdateMultiCount();
  };

  function accountsUpdateMultiCount() {
    const bar = document.getElementById('accounts-multilink-actions');
    const count = accountsMultiSelected.size;
    bar.style.display = count >= 2 ? 'flex' : 'none';
    document.getElementById('accounts-multilink-count').textContent = `${count} selected`;
  }

  window.accountsMultiLink = function () {
    if (accountsMultiSelected.size < 2) return;
    const selected = [...accountsMultiSelected.values()];
    // Find a Discord/mobile player in the selection to use as the hub
    let discordPlayer = selected.find(s => s.platform === 'discord' || s.platform === 'mobile');
    if (!discordPlayer) {
      const discordId = prompt('No Discord player in selection. Enter Discord User ID to link to:');
      if (!discordId) return;
      discordPlayer = { platformUserId: discordId, platform: 'discord' };
    }
    const discordUserId = discordPlayer.platformUserId;
    // Link all non-Discord players to the hub
    const players = selected
      .filter(s => !(s.platformUserId === discordUserId && (s.platform === 'discord' || s.platform === 'mobile')))
      .map(s => ({ platform: s.platform, platformUserId: s.platformUserId }));
    if (players.length === 0) return alert('Nothing to link — all selected are the same Discord user.');
    const names = selected.map(s => `${s.name} (${s.platform})`).join(', ');
    if (!confirm(`Link ${selected.length} players together?\n\n${names}\n\nDiscord hub: ${discordUserId}`)) return;
    fetch('/api/accounts-admin/multi-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ discordUserId, players })
    }).then(r => r.json()).then(data => {
      if (data.ok) {
        accountsMultiSelected.clear();
        accountsUpdateMultiCount();
        accountsLoadDetails(discordUserId);
        accountsLoadGroups();
      } else {
        alert('Link failed: ' + (data.message || 'Unknown error'));
      }
    });
  };

  window.accountsSelectPlayer = function (platform, platformUserId, playerId) {
    // First check if this player is linked to a Discord user
    fetch(`/api/accounts-admin/search?q=${encodeURIComponent(platformUserId)}`)
      .then(r => r.json())
      .then(() => {
        // Try to find the discord user ID through the game server
        // For now, search by player and load their details
        accountsLoadByPlayer(platform, platformUserId, playerId);
      });
  };

  function accountsLoadByPlayer(platform, platformUserId, playerId) {
    // First try to get the linked Discord user
    fetch(`/api/accounts-admin/linked-groups`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok || !data.groups) return;
        // Find a group that contains this platform+userId
        const group = data.groups.find(g =>
          g.platforms.some(p => p.platform === platform && p.platformUserId === platformUserId)
        );
        if (group) {
          accountsLoadDetails(group.discordUserId);
        } else {
          // Not linked — show basic info from the search result
          document.getElementById('accounts-detail-panel').style.display = 'block';
          document.getElementById('accounts-detail-name').textContent = 'Unlinked Player #' + playerId;
          document.getElementById('accounts-detail-discord-id').textContent = `${platform}:${platformUserId} (not linked to Discord)`;
          document.getElementById('accounts-linked-platforms').innerHTML = '<div class="accounts-no-results">Not linked to any Discord account</div>';
          document.getElementById('accounts-businesses').innerHTML = '';
          document.getElementById('accounts-cosmetics').innerHTML = '';
          accountsCurrentDiscordId = null;
          accountsCurrentPlayerId = Number(playerId);
          accountsUnlinkedPlatform = platform;
          accountsUnlinkedPlatformUserId = platformUserId;
          accountsLedgerCurrentPage = 1;
          accountsLoadLedger(Number(playerId), 1);
          // Show quicklink section for unlinked players
          document.getElementById('accounts-quicklink-section').style.display = 'block';
          document.getElementById('accounts-quicklink-results').innerHTML = '';
          document.getElementById('accounts-quicklink-input').value = '';
          accountsLoadPotentialMatches(Number(playerId));
        }
      });
  }

  window.accountsLoadDetails = function (discordUserId) {
    accountsCurrentDiscordId = discordUserId;
    accountsUnlinkedPlatform = null;
    accountsUnlinkedPlatformUserId = null;
    fetch(`/api/accounts-admin/${discordUserId}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) return;
        const panel = document.getElementById('accounts-detail-panel');
        panel.style.display = 'block';
        document.getElementById('accounts-quicklink-section').style.display = 'none';

        // Track player ID for ledger queries
        if (data.primaryPlayer) {
          accountsCurrentPlayerId = data.primaryPlayer.id;
          accountsLedgerCurrentPage = 1;
          accountsLoadLedger(data.primaryPlayer.id, 1);
        }

        // Header info
        const pp = data.primaryPlayer;
        document.getElementById('accounts-detail-name').textContent = data.preferences?.preferred_display_name || pp?.display_name || '--';
        document.getElementById('accounts-detail-discord-id').textContent = `Discord: ${discordUserId}`;
        document.getElementById('accounts-detail-coins').textContent = pp ? formatNumber(pp.coins) + ' coins' : '0 coins';
        document.getElementById('accounts-detail-taps').textContent = pp ? formatNumber(pp.total_taps) + ' taps' : '0 taps';

        // PFP
        const pfpImg = document.getElementById('accounts-detail-pfp-img');
        const pfpPlatform = data.preferences?.preferred_pfp_platform;
        const pfpProfile = data.linkedPlatforms.find(lp => lp.platform === pfpPlatform && lp.player?.profile_pic);
        pfpImg.src = pfpProfile?.player?.profile_pic || pp?.profile_pic || '';
        pfpImg.style.display = pfpImg.src ? 'block' : 'none';

        // Linked platforms list
        const platformsEl = document.getElementById('accounts-linked-platforms');
        platformsEl.innerHTML = data.linkedPlatforms.map(lp => `
          <div class="accounts-platform-row">
            <span class="accounts-platform-badge platform-${lp.platform}">${lp.platform}</span>
            <span class="accounts-platform-id">${lp.platformUserId}</span>
            <span class="accounts-platform-date">${lp.linkedAt ? new Date(lp.linkedAt).toLocaleDateString() : '--'}</span>
            ${lp.player ? `<span class="accounts-platform-coins">${formatNumber(lp.player.coins)} coins</span>` : '<span class="accounts-platform-coins">no player</span>'}
            <button class="btn btn-sm btn-danger" onclick="accountsUnlink('${lp.platform}', '${lp.platformUserId}')">Unlink</button>
          </div>
        `).join('') || '<div class="accounts-no-results">No platforms linked</div>';

        // PFP preference dropdown
        const pfpSelect = document.getElementById('accounts-pref-pfp');
        pfpSelect.innerHTML = '<option value="">Auto</option>' +
          data.linkedPlatforms.filter(lp => lp.player?.profile_pic).map(lp =>
            `<option value="${lp.platform}" ${lp.platform === pfpPlatform ? 'selected' : ''}>${lp.platform}</option>`
          ).join('');

        // Display name preference
        document.getElementById('accounts-pref-name').value = data.preferences?.preferred_display_name || '';

        // Businesses
        const bizEl = document.getElementById('accounts-businesses');
        if (data.businesses.length > 0) {
          bizEl.innerHTML = `<table class="accounts-table">
            <tr><th>Business</th><th>Level</th></tr>
            ${data.businesses.map(b => `<tr><td>${b.business_type}</td><td>Lv.${b.level}</td></tr>`).join('')}
          </table>`;
        } else {
          bizEl.innerHTML = '<div class="accounts-no-results">No businesses owned</div>';
        }

        // Cosmetics
        const cosEl = document.getElementById('accounts-cosmetics');
        if (data.cosmetics.length > 0) {
          cosEl.innerHTML = data.cosmetics.map(c => `
            <div class="accounts-cosmetic-item ${c.equipped ? 'equipped' : ''}">
              <span class="accounts-cosmetic-name">${c.name}</span>
              <span class="accounts-cosmetic-rarity rarity-${c.rarity}">${c.rarity}</span>
              ${c.equipped ? '<span class="accounts-cosmetic-equipped">Equipped</span>' : ''}
            </div>
          `).join('');
        } else {
          cosEl.innerHTML = '<div class="accounts-no-results">No cosmetics owned</div>';
        }

        // Load potential matches
        if (accountsCurrentPlayerId) accountsLoadPotentialMatches(accountsCurrentPlayerId);
      });
  };

  function accountsLoadPotentialMatches(playerId) {
    const el = document.getElementById('accounts-potential-matches');
    el.innerHTML = '<div class="accounts-no-results">Loading...</div>';
    fetch(`/api/accounts-admin/potential-matches/${playerId}`)
      .then(r => r.json())
      .then(data => {
        if (!data.ok || !data.matches || data.matches.length === 0) {
          el.innerHTML = '<div class="accounts-no-results">No potential matches found</div>';
          return;
        }
        el.innerHTML = data.matches.map(m => `
          <div class="accounts-potential-match">
            <span class="accounts-result-id">#${m.id}</span>
            <span class="accounts-result-name">${escapeHtml(m.display_name || m.username)}</span>
            <span class="accounts-result-platform">${m.platform}</span>
            <span class="accounts-match-reason">${m.matchReason}</span>
            <button class="btn btn-sm btn-accent" onclick="accountsLinkPotentialMatch('${m.platform}', '${m.platform_user_id}')">Link</button>
          </div>
        `).join('');
      });
  }

  window.accountsLinkPotentialMatch = function (platform, platformUserId) {
    // If currently viewing a linked account, link to that Discord user
    // If unlinked, need to determine a Discord hub
    let discordId = accountsCurrentDiscordId;
    if (!discordId) {
      // For unlinked players: if the match IS a Discord player, link current player to them
      if (platform === 'discord' || platform === 'mobile') {
        discordId = platformUserId;
        if (!accountsUnlinkedPlatform || !accountsUnlinkedPlatformUserId) return;
        if (!confirm(`Link ${accountsUnlinkedPlatform}:${accountsUnlinkedPlatformUserId} to Discord user ${discordId}?`)) return;
        fetch(`/api/accounts-admin/${discordId}/link`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ platform: accountsUnlinkedPlatform, platformUserId: accountsUnlinkedPlatformUserId })
        }).then(r => r.json()).then(data => {
          if (data.ok) { accountsLoadDetails(discordId); accountsLoadGroups(); }
        });
        return;
      }
      alert('Cannot link: no Discord account to use as hub. Link to a Discord player first.');
      return;
    }
    if (!confirm(`Link ${platform}:${platformUserId} to Discord user ${discordId}?`)) return;
    fetch(`/api/accounts-admin/${discordId}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, platformUserId })
    }).then(r => r.json()).then(data => {
      if (data.ok) { accountsLoadDetails(discordId); accountsLoadGroups(); }
    });
  };

  window.accountsQuicklinkSearch = function () {
    const q = document.getElementById('accounts-quicklink-input').value.trim();
    if (!q) return;
    fetch(`/api/accounts-admin/search-discord?q=${encodeURIComponent(q)}`)
      .then(r => r.json())
      .then(players => {
        const el = document.getElementById('accounts-quicklink-results');
        if (!players || players.length === 0) {
          el.innerHTML = '<div class="accounts-no-results">No Discord players found</div>';
          return;
        }
        el.innerHTML = players.map(p => `
          <div class="accounts-result-item" onclick="accountsQuicklinkDo('${p.platform_user_id}')">
            <span class="accounts-result-id">#${p.id}</span>
            <span class="accounts-result-name">${escapeHtml(p.display_name || p.username)}</span>
            <span class="accounts-result-platform">${p.platform}</span>
            <span class="accounts-result-coins">${formatNumber(p.coins)} coins</span>
          </div>
        `).join('');
      });
  };

  document.getElementById('accounts-quicklink-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') accountsQuicklinkSearch();
  });

  window.accountsQuicklinkDo = function (discordUserId) {
    if (!accountsUnlinkedPlatform || !accountsUnlinkedPlatformUserId) return;
    if (!confirm(`Link ${accountsUnlinkedPlatform}:${accountsUnlinkedPlatformUserId} to Discord user ${discordUserId}?`)) return;
    fetch(`/api/accounts-admin/${discordUserId}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform: accountsUnlinkedPlatform, platformUserId: accountsUnlinkedPlatformUserId })
    }).then(r => r.json()).then(data => {
      if (data.ok) {
        accountsLoadDetails(discordUserId);
        accountsLoadGroups();
      }
    });
  };

  window.accountsUnlink = function (platform, platformUserId) {
    if (!accountsCurrentDiscordId) return;
    if (!confirm(`Unlink ${platform}:${platformUserId}? The player record will remain independent.`)) return;
    fetch(`/api/accounts-admin/${accountsCurrentDiscordId}/unlink`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, platformUserId })
    }).then(r => r.json()).then(data => {
      if (data.ok) accountsLoadDetails(accountsCurrentDiscordId);
    });
  };

  window.accountsManualLink = function () {
    if (!accountsCurrentDiscordId) {
      // If no discord user selected, use the search input as discord ID
      const discordId = prompt('Enter Discord User ID to link to:');
      if (!discordId) return;
      accountsCurrentDiscordId = discordId;
    }
    const platform = document.getElementById('accounts-link-platform').value;
    const platformUserId = document.getElementById('accounts-link-userid').value.trim();
    if (!platformUserId) return alert('Enter a platform user ID');
    fetch(`/api/accounts-admin/${accountsCurrentDiscordId}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ platform, platformUserId })
    }).then(r => r.json()).then(data => {
      if (data.ok) {
        document.getElementById('accounts-link-userid').value = '';
        accountsLoadDetails(accountsCurrentDiscordId);
      }
    });
  };

  window.accountsTriggerMerge = function () {
    if (!accountsCurrentDiscordId) return;
    if (!confirm('Re-merge all linked accounts? Discord stats will be discarded.')) return;
    fetch(`/api/accounts-admin/${accountsCurrentDiscordId}/merge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }).then(r => r.json()).then(data => {
      if (data.ok) accountsLoadDetails(accountsCurrentDiscordId);
    });
  };

  window.accountsSavePfpPref = function () {
    if (!accountsCurrentDiscordId) return;
    const pfp = document.getElementById('accounts-pref-pfp').value;
    fetch(`/api/accounts-admin/${accountsCurrentDiscordId}/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredPfpPlatform: pfp || null })
    }).then(r => r.json()).then(() => accountsLoadDetails(accountsCurrentDiscordId));
  };

  window.accountsSaveNamePref = function () {
    if (!accountsCurrentDiscordId) return;
    const name = document.getElementById('accounts-pref-name').value.trim();
    fetch(`/api/accounts-admin/${accountsCurrentDiscordId}/prefs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ preferredDisplayName: name || null })
    }).then(r => r.json()).then(() => accountsLoadDetails(accountsCurrentDiscordId));
  };

  window.accountsLoadGroups = function () {
    fetch('/api/accounts-admin/linked-groups')
      .then(r => r.json())
      .then(data => {
        const el = document.getElementById('accounts-groups-list');
        if (!data.ok || !data.groups || data.groups.length === 0) {
          el.innerHTML = '<div class="accounts-groups-empty">No linked account groups found</div>';
          return;
        }
        el.innerHTML = data.groups.map(g => `
          <div class="accounts-group-item" onclick="accountsLoadDetails('${g.discordUserId}')">
            <div class="accounts-group-name">${g.displayName || g.discordUsername || 'Unknown'}</div>
            <div class="accounts-group-platforms">
              ${g.platforms.map(p => `<span class="accounts-platform-badge platform-${p.platform}">${p.platform}</span>`).join('')}
            </div>
            <div class="accounts-group-stats">${formatNumber(g.coins)} coins</div>
          </div>
        `).join('');
      });
  };

  // ─── Command History / Ledger ──────────────────────────────────────

  window.accountsLoadLedger = function (playerId, page = 1) {
    if (!playerId) return;
    accountsCurrentPlayerId = playerId;
    accountsLedgerCurrentPage = page;

    const eventType = document.getElementById('accounts-ledger-type').value;
    const searchQ = document.getElementById('accounts-ledger-search').value.trim();

    let url = `/api/accounts-admin/ledger/player/${playerId}?page=${page}&limit=25`;
    if (eventType) url += `&event_type=${encodeURIComponent(eventType)}`;
    if (searchQ) url += `&q=${encodeURIComponent(searchQ)}`;

    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (!data.ok) {
          document.getElementById('accounts-ledger-table').innerHTML = '<div class="accounts-no-results">Could not load command history</div>';
          return;
        }

        const tableEl = document.getElementById('accounts-ledger-table');
        if (!data.entries || data.entries.length === 0) {
          tableEl.innerHTML = '<div class="accounts-no-results">No history found</div>';
          document.getElementById('accounts-ledger-pagination').style.display = 'none';
          return;
        }

        let html = `<table class="accounts-table accounts-ledger-tbl">
          <thead><tr>
            <th>Time</th>
            <th>Type</th>
            <th>Command</th>
            <th class="num">Before</th>
            <th class="num">Delta</th>
            <th class="num">After</th>
            <th>Status</th>
          </tr></thead><tbody>`;

        for (const e of data.entries) {
          const time = e.created_at ? new Date(e.created_at + 'Z').toLocaleString() : '--';
          const typeBadge = `<span class="accounts-ledger-type-badge type-${e.event_type}">${e.event_type}</span>`;
          const cmd = e.command ? escapeHtml(e.command) : '<span class="muted">--</span>';
          const delta = e.coins_delta || 0;
          const deltaClass = delta > 0 ? 'credit' : delta < 0 ? 'debit' : '';
          const deltaStr = delta > 0 ? `+${formatNumber(delta)}` : delta < 0 ? formatNumber(delta) : '0';
          const statusIcon = e.success ? '<span class="ledger-ok">&#10003;</span>' : '<span class="ledger-fail">&#10007;</span>';
          const responseTitle = e.response ? escapeHtml(e.response) : '';

          html += `<tr title="${responseTitle}">
            <td class="ledger-time">${time}</td>
            <td>${typeBadge}</td>
            <td class="ledger-cmd">${cmd}</td>
            <td class="num">${formatNumber(e.coins_before)}</td>
            <td class="num accounts-ledger-delta ${deltaClass}">${deltaStr}</td>
            <td class="num">${formatNumber(e.coins_after)}</td>
            <td class="ledger-status">${statusIcon}</td>
          </tr>`;
        }
        html += '</tbody></table>';
        tableEl.innerHTML = html;

        // Pagination
        const pagEl = document.getElementById('accounts-ledger-pagination');
        if (data.totalPages > 1) {
          pagEl.style.display = 'flex';
          document.getElementById('accounts-ledger-page-info').textContent = `Page ${data.page} of ${data.totalPages} (${data.total} entries)`;
          document.getElementById('accounts-ledger-prev').disabled = data.page <= 1;
          document.getElementById('accounts-ledger-next').disabled = data.page >= data.totalPages;
        } else {
          pagEl.style.display = data.total > 0 ? 'flex' : 'none';
          document.getElementById('accounts-ledger-page-info').textContent = `${data.total} entries`;
          document.getElementById('accounts-ledger-prev').disabled = true;
          document.getElementById('accounts-ledger-next').disabled = true;
        }
      })
      .catch(() => {
        document.getElementById('accounts-ledger-table').innerHTML = '<div class="accounts-no-results">Failed to load history</div>';
      });
  };

  window.accountsLedgerFilter = function () {
    if (!accountsCurrentPlayerId) return;
    accountsLedgerCurrentPage = 1;
    accountsLoadLedger(accountsCurrentPlayerId, 1);
  };

  window.accountsLedgerPage = function (dir) {
    if (!accountsCurrentPlayerId) return;
    const newPage = accountsLedgerCurrentPage + dir;
    if (newPage < 1) return;
    accountsLoadLedger(accountsCurrentPlayerId, newPage);
  };

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function formatNumber(n) {
    if (n === undefined || n === null) return '0';
    if (n >= 1e12) return (n / 1e12).toFixed(1) + 'T';
    if (n >= 1e9) return (n / 1e9).toFixed(1) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(1) + 'K';
    return Math.floor(n).toString();
  }

  // ─── Settings Dropdown ──────────────────────────────────
  window.toggleSettingsDropdown = function () {
    const dd = document.getElementById('settings-dropdown');
    dd.style.display = dd.style.display === 'none' ? '' : 'none';
  };

  // ─── Game Sub-Tab Switcher ──────────────────────────────
  window.switchGameTab = function (game) {
    document.querySelectorAll('.game-sel-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.game-sub').forEach(s => s.classList.remove('active'));
    const btn = document.querySelector(`.game-sel-btn[data-game="${game}"]`);
    const sub = document.getElementById('game-' + game);
    if (btn) btn.classList.add('active');
    if (sub) sub.classList.add('active');
  };

})();
