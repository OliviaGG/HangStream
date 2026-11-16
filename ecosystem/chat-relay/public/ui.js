// UI rendering helpers
const UI = (() => {
  const chatFeed = () => document.getElementById('chat-feed');
  let autoScroll = true;
  let previewMode = 'standard';

  function init() {
    // Tab switching
    document.querySelectorAll('.tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
        tab.classList.add('active');
        const target = document.getElementById('tab-' + tab.dataset.tab);
        if (target) target.classList.add('active');
      });
    });

    // Auto-scroll detection
    const feed = chatFeed();
    if (feed) {
      feed.addEventListener('scroll', () => {
        const threshold = 50;
        autoScroll = (feed.scrollHeight - feed.scrollTop - feed.clientHeight) < threshold;
      });
    }
  }

  function renderMessage(msg) {
    const feed = chatFeed();
    if (!feed) return;

    // Remove welcome message
    const welcome = feed.querySelector('.chat-welcome');
    if (welcome) welcome.remove();

    const el = document.createElement('div');
    el.className = `chat-message ${msg.isSystem ? 'system' : ''} ${msg.isJoin ? 'join' : ''} platform-${msg.platform}`;
    el.dataset.messageId = msg.id;

    // Avatar
    const isFC = Array.isArray(msg.user.badges) && msg.user.badges.indexOf('fan-club') !== -1;
    const wrapClass = `avatar-wrap${isFC ? ' has-fan-club-badge' : ''}`;
    let avatarInner;
    if (msg.user.profilePic) {
      avatarInner = `<img class="msg-avatar" src="${escapeHtml(msg.user.profilePic)}" alt="" loading="lazy" onerror="this.outerHTML='<div class=\\'msg-avatar-placeholder ${msg.platform}\\'>${msg.user.displayName.charAt(0).toUpperCase()}</div>'">`;
    } else {
      avatarInner = `<div class="msg-avatar-placeholder ${msg.platform}">${msg.user.displayName.charAt(0).toUpperCase()}</div>`;
    }
    const avatarHTML = `<span class="${wrapClass}">${avatarInner}</span>`;

    // Badges
    const badges = (msg.user.badges || []).map(badge =>
      `<span class="msg-badge ${badge}">${formatBadge(badge)}</span>`
    ).join('');

    // Platform badge
    const platformBadge = `<span class="msg-platform-badge ${msg.platform}">${msg.platform}</span>`;

    // Username color
    const nameColor = msg.user.customColor || getPlatformColor(msg.platform);
    const displayName = msg.user.customNick || msg.user.displayName;

    // Linked Discord indicator
    const linkedHTML = msg.linkedDiscord
      ? `<span class="msg-linked" title="Linked to Discord">&#x1F517; ${escapeHtml(msg.linkedDiscord)}</span>`
      : '';

    // Timestamp
    const time = new Date(msg.timestamp);
    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    el.innerHTML = `
      ${avatarHTML}
      <div class="msg-body">
        <div class="msg-header">
          ${platformBadge}
          <span class="msg-username" style="color: ${nameColor}">${escapeHtml(displayName)}</span>
          <span class="msg-badges">${badges}</span>
          ${linkedHTML}
          <span class="msg-timestamp">${timeStr}</span>
        </div>
        <div class="msg-text">${escapeHtml(msg.message)}</div>
      </div>
    `;

    feed.appendChild(el);

    // Limit messages to 500
    while (feed.children.length > 500) {
      feed.removeChild(feed.firstChild);
    }

    // Auto-scroll
    if (autoScroll) {
      requestAnimationFrame(() => {
        feed.scrollTop = feed.scrollHeight;
      });
    }
  }

  function setPreviewMode(mode) {
    previewMode = mode;
    const preview = document.getElementById('overlay-preview');
    if (preview) {
      preview.innerHTML = '<div class="overlay-preview-placeholder">Chat messages will appear here</div>';
    }
  }

  function renderOverlayPreview(msg) {
    if (!msg.message) return;

    const isJoin = msg.isJoin;
    const isDotMsg = msg.message.startsWith('.');

    // Filter based on preview mode (join messages always pass)
    if (!isJoin && previewMode !== 'all' && !isDotMsg) return;

    const preview = document.getElementById('overlay-preview');
    if (!preview) return;

    // Remove placeholder
    const placeholder = preview.querySelector('.overlay-preview-placeholder');
    if (placeholder) placeholder.remove();

    const displayText = isJoin ? msg.message : (isDotMsg ? msg.message.slice(1) : msg.message);
    const nameColor = msg.user.customColor || getPlatformColor(msg.platform);
    const displayName = msg.user.customNick || msg.user.displayName;

    const el = document.createElement('div');
    el.className = 'overlay-preview-msg' + (isJoin ? ' join' : '');
    el.innerHTML = `
      <span class="overlay-platform ${msg.platform}">${msg.platform}</span>
      <span class="overlay-username" style="color: ${nameColor}">${escapeHtml(displayName)}</span>
      <span style="color:#ccc;font-size:14px">${isJoin ? '' : ':'}</span>
      <span class="overlay-text" style="${isJoin ? 'font-style:italic;color:#888' : ''}">${escapeHtml(displayText)}</span>
    `;

    preview.appendChild(el);

    // Limit to 20 in preview
    while (preview.children.length > 20) {
      preview.removeChild(preview.firstChild);
    }
  }

  function updatePlatformStatus(statuses) {
    const platforms = ['tiktok', 'youtube', 'discord'];
    platforms.forEach(p => {
      const connected = typeof statuses === 'object' && statuses[p] !== undefined
        ? statuses[p]
        : (statuses.platform === p ? statuses.connected : undefined);

      if (connected === undefined) return;

      // Header status dots
      const dot = document.getElementById(`status-${p}`);
      if (dot) {
        dot.classList.toggle('connected', connected);
        dot.classList.toggle('disconnected', !connected);
      }

      // Settings connection status
      const conn = document.getElementById(`conn-${p}`);
      if (conn) {
        conn.textContent = connected ? 'Connected' : 'Disconnected';
        conn.classList.toggle('connected', connected);
        conn.classList.toggle('disconnected', !connected);
      }
    });
  }

  function renderCommands(commands) {
    const categories = {
      'TTS': [],
      'Account Linking': [],
      'Profile': [],
      'Admin': [],
      'Info': []
    };

    commands.forEach(cmd => {
      if (['/v', '/voices', '/tts', '/vol'].includes(cmd.command)) categories['TTS'].push(cmd);
      else if (['/link', '/verify', '/unlink'].includes(cmd.command)) categories['Account Linking'].push(cmd);
      else if (['/color', '/nick'].includes(cmd.command)) categories['Profile'].push(cmd);
      else if (['/bantts', '/unbantts', '/tts-on', '/tts-off'].includes(cmd.command)) categories['Admin'].push(cmd);
      else categories['Info'].push(cmd);
    });

    let html = '';
    for (const [cat, cmds] of Object.entries(categories)) {
      if (cmds.length === 0) continue;
      html += `<div class="cmd-category">`;
      html += `<div class="cmd-category-title">${cat}</div>`;
      cmds.forEach(cmd => {
        html += `<div class="cmd-item">
          <span class="cmd-name">${escapeHtml(cmd.usage)}</span>
          <span class="cmd-desc"> - ${escapeHtml(cmd.description)}</span>
        </div>`;
      });
      html += `</div>`;
    }

    // Set on main sidebar and clones
    const mainList = document.getElementById('command-list');
    if (mainList) mainList.innerHTML = html;

    document.querySelectorAll('.command-list-clone').forEach(el => {
      el.innerHTML = html;
    });
  }

  function renderTTSUsers(users) {
    const container = document.getElementById('tts-users-list');
    if (!container) return;

    if (!users || users.length === 0) {
      container.innerHTML = '<div style="color: var(--text-muted); padding: 8px; font-size: 13px;">No users with TTS enabled. Users can type /tts in chat to enable.</div>';
      return;
    }

    container.innerHTML = users.map(user => {
      const isBanned = user.tts_banned;
      const isEnabled = user.tts_enabled;
      return `
        <div class="tts-user-row">
          <div class="msg-avatar-placeholder ${user.platform}">${(user.display_name || '?').charAt(0).toUpperCase()}</div>
          <div class="tts-user-info">
            <div class="tts-user-name">${escapeHtml(user.display_name || user.username)}</div>
            <div class="tts-user-platform">${user.platform}</div>
            ${user.tts_voice ? `<div class="tts-user-voice">Voice: ${escapeHtml(user.tts_voice)}</div>` : ''}
          </div>
          <div class="tts-user-actions">
            <button class="btn ${isEnabled ? 'btn-success' : ''}" onclick="toggleUserTTS('${user.platform}', '${user.platform_user_id}', ${!isEnabled})">
              ${isEnabled ? 'ON' : 'OFF'}
            </button>
            <button class="btn ${isBanned ? 'btn-danger' : ''}" onclick="toggleUserBan('${user.platform}', '${user.platform_user_id}', ${!isBanned})">
              ${isBanned ? 'BANNED' : 'BAN'}
            </button>
          </div>
        </div>
      `;
    }).join('');
  }

  function updateTTSSettings(settings) {
    if (!settings) return;

    if (settings.volume !== undefined) {
      const vol = parseFloat(settings.volume);
      const slider = document.getElementById('tts-volume');
      const label = document.getElementById('vol-label');
      if (slider) slider.value = Math.round(vol * 100);
      if (label) label.textContent = Math.round(vol * 100) + '%';
      TTS.setVolume(vol);
    }

    if (settings.rate !== undefined) {
      const val = parseFloat(settings.rate);
      const slider = document.getElementById('tts-rate');
      const label = document.getElementById('rate-label');
      if (slider) slider.value = val;
      if (label) label.textContent = val.toFixed(1) + 'x';
      TTS.setRate(val);
    }

    if (settings.pitch !== undefined) {
      const val = parseFloat(settings.pitch);
      const slider = document.getElementById('tts-pitch');
      const label = document.getElementById('pitch-label');
      if (slider) slider.value = val;
      if (label) label.textContent = val.toFixed(1);
      TTS.setPitch(val);
    }

    if (settings.enabled !== undefined) {
      const enabled = settings.enabled === 'true' || settings.enabled === true;
      const checkbox = document.getElementById('tts-global-enabled');
      if (checkbox) checkbox.checked = enabled;
      TTS.setEnabled(enabled);
    }
  }

  function renderApps(appsList) {
    const grid = document.getElementById('apps-grid');
    if (!grid) return;

    if (!appsList || appsList.length === 0) {
      grid.innerHTML = '<div class="apps-empty">No apps configured. Add apps to <code>apps.json</code> and reload.</div>';
      return;
    }

    grid.innerHTML = appsList.map(app => {
      const statusClass = app.status;
      const isRunning = app.status === 'running' || app.status === 'starting';
      const isExternal = isRunning && !app.managed && app.reachable;
      const statusLabel = isExternal ? 'Auto-Connected' : app.status.charAt(0).toUpperCase() + app.status.slice(1);

      return `
        <div class="app-card ${statusClass}">
          <div class="app-card-header">
            <div class="app-status-dot ${statusClass}"></div>
            <h3 class="app-name">${escapeHtml(app.name)}</h3>
          </div>
          <p class="app-desc">${escapeHtml(app.description)}</p>
          <div class="app-meta">
            <span class="app-port">Port ${app.port}</span>
            <span class="app-status-label ${statusClass}">${statusLabel}</span>
            <span class="app-relay-badge ${app.reachable ? 'connected' : 'disconnected'}">${app.reachable ? 'Connected' : 'Not Connected'}</span>
          </div>
          ${app.error ? `<div class="app-error">${escapeHtml(app.error)}</div>` : ''}
          <div class="app-card-actions">
            ${isRunning
              ? `<button class="btn btn-danger" onclick="stopApp('${app.id}')">Stop</button><button class="btn" onclick="restartApp('${app.id}')">Restart</button>${isExternal ? '<span class="app-external-badge">External</span>' : ''}`
              : `<button class="btn btn-success" onclick="startApp('${app.id}')">Start</button>`
            }
          </div>
          ${app.pages && app.pages.length
            ? `<div class="app-links">${app.pages.map(p =>
                `<a class="app-link${p.label === 'Admin' ? ' admin' : ''}${p.overlay ? ' overlay' : ''}" href="${window.location.origin}/game/${app.id}${p.path}" target="_blank" ${!isRunning ? 'style="opacity:0.4;pointer-events:none"' : ''}>${escapeHtml(p.label)}</a>`
              ).join('')}</div>`
            : ''
          }
        </div>
      `;
    }).join('');
  }

  // ─── Searchle Admin Panel ─────────────────────────────────────────
  let searchleGuesses = [];
  let searchleStartTime = null;
  let searchleTimerInterval = null;

  function updateSearchleConnection(connected) {
    const dot = document.getElementById('searchle-conn-dot');
    const badge = document.getElementById('searchle-badge');
    if (dot) dot.classList.toggle('connected', connected);
    if (badge) {
      badge.textContent = connected ? 'Connected' : 'Offline';
      badge.className = 'searchle-game-badge ' + (connected ? 'connected' : 'offline');
    }
  }

  function renderSearchleState(state) {
    if (!state) return;

    const target = document.getElementById('searchle-target');
    const guessCount = document.getElementById('searchle-guesses');
    const vocab = document.getElementById('searchle-vocab');
    const winner = document.getElementById('searchle-winner');
    const badge = document.getElementById('searchle-badge');

    if (target) target.textContent = state.targetWord || '???';
    if (guessCount) guessCount.textContent = (state.guesses ? state.guesses.length : state.guessCount || 0).toLocaleString();
    if (vocab) vocab.textContent = (state.totalRankedWords || 0).toLocaleString();

    if (winner) {
      if (state.winner) {
        winner.textContent = state.winner.displayName || '--';
        winner.style.color = '#00c853';
      } else if (state.lastWinner && state.lastWinner.user) {
        winner.textContent = state.lastWinner.user.displayName + ' (prev)';
        winner.style.color = '';
      } else {
        winner.textContent = '--';
        winner.style.color = '';
      }
    }

    if (badge) {
      if (state.isWon) {
        badge.textContent = 'Won';
        badge.className = 'searchle-game-badge won';
      } else {
        badge.textContent = 'Active';
        badge.className = 'searchle-game-badge active';
      }
    }

    // Update start time for timer
    searchleStartTime = state.startTime ? new Date(state.startTime) : null;
    startSearchleTimer();

    // Render all guesses
    if (state.guesses && state.guesses.length) {
      searchleGuesses = state.guesses.slice().sort((a, b) => a.rank - b.rank);
      renderSearchleFeed();
    }
  }

  function startSearchleTimer() {
    if (searchleTimerInterval) clearInterval(searchleTimerInterval);
    if (!searchleStartTime) return;

    const update = () => {
      const el = document.getElementById('searchle-timer');
      if (!el) return;
      const elapsed = Math.floor((Date.now() - searchleStartTime.getTime()) / 1000);
      const m = Math.floor(elapsed / 60);
      const s = elapsed % 60;
      el.textContent = `${m}:${s.toString().padStart(2, '0')}`;
    };

    update();
    searchleTimerInterval = setInterval(update, 1000);
  }

  function addSearchleGuess(guess) {
    // Remove existing if same word (shouldn't happen, but safety)
    searchleGuesses = searchleGuesses.filter(g => g.word !== guess.word);
    searchleGuesses.push(guess);
    searchleGuesses.sort((a, b) => a.rank - b.rank);

    const guessCount = document.getElementById('searchle-guesses');
    if (guessCount) guessCount.textContent = searchleGuesses.length.toLocaleString();

    const feedCount = document.getElementById('searchle-feed-count');
    if (feedCount) feedCount.textContent = searchleGuesses.length;

    renderSearchleFeed();
  }

  function renderSearchleFeed() {
    const feed = document.getElementById('searchle-feed');
    if (!feed) return;

    const feedCount = document.getElementById('searchle-feed-count');
    if (feedCount) feedCount.textContent = searchleGuesses.length;

    if (searchleGuesses.length === 0) {
      feed.innerHTML = '<div class="searchle-feed-empty">Waiting for guesses...</div>';
      return;
    }

    // Show top 100 sorted by rank
    const top = searchleGuesses.slice(0, 100);
    feed.innerHTML = top.map((g, i) => {
      const rankColor = getRankColor(g.rank, searchleGuesses[0]?.totalRankedWords || 317730);
      const platformClass = g.user?.platform || 'system';
      return `<div class="searchle-guess-row">
        <span class="searchle-guess-rank" style="color:${rankColor}">#${g.rank.toLocaleString()}</span>
        <span class="searchle-guess-word">${escapeHtml(g.word)}</span>
        <span class="searchle-guess-user">
          <span class="msg-platform-badge ${platformClass}">${platformClass}</span>
          ${escapeHtml(g.user?.displayName || '?')}
        </span>
      </div>`;
    }).join('');
  }

  function searchleGameWon(data) {
    const target = document.getElementById('searchle-target');
    const winner = document.getElementById('searchle-winner');
    const badge = document.getElementById('searchle-badge');

    if (target) target.textContent = data.targetWord || '???';
    if (winner) {
      winner.textContent = data.user?.displayName || '--';
      winner.style.color = '#00c853';
    }
    if (badge) {
      badge.textContent = 'Won';
      badge.className = 'searchle-game-badge won';
    }
  }

  function updateSearchleModels(data) {
    if (!data || !data.models) return;

    const MODEL_MAP = {
      'glove-300d': { checkbox: 'searchle-model-glove', detail: 'searchle-model-glove-detail' },
      'word2vec': { checkbox: 'searchle-model-w2v', detail: 'searchle-model-w2v-detail' },
      'fasttext': { checkbox: 'searchle-model-ft', detail: 'searchle-model-ft-detail' }
    };

    let activeCount = 0;

    for (const model of data.models) {
      const ids = MODEL_MAP[model.name];
      if (!ids) continue;

      const cb = document.getElementById(ids.checkbox);
      const detail = document.getElementById(ids.detail);

      if (cb) {
        if (model.loaded) {
          cb.checked = model.active;
          cb.disabled = false;
          cb.closest('.searchle-toggle-row')?.classList.remove('disabled');
        } else {
          cb.checked = false;
          cb.disabled = true;
          cb.closest('.searchle-toggle-row')?.classList.add('disabled');
        }
      }

      if (detail) {
        if (model.loaded && model.wordCount) {
          detail.textContent = model.wordCount.toLocaleString() + ' words';
        } else if (!model.loaded) {
          detail.textContent = 'Not built';
        } else {
          detail.textContent = '--';
        }
      }

      if (model.active) activeCount++;
    }

    // Update mode badge
    const badge = document.getElementById('searchle-model-mode');
    if (badge) {
      if (activeCount >= 3) {
        badge.textContent = 'Combined';
        badge.className = 'searchle-model-badge combined';
      } else if (activeCount === 2) {
        badge.textContent = 'Dual';
        badge.className = 'searchle-model-badge dual';
      } else if (activeCount === 1) {
        badge.textContent = 'Single';
        badge.className = 'searchle-model-badge single';
      } else {
        badge.textContent = '--';
        badge.className = 'searchle-model-badge';
      }
    }

    // Update vocab size if provided
    if (data.totalVocabulary) {
      const vocab = document.getElementById('searchle-vocab');
      if (vocab) vocab.textContent = data.totalVocabulary.toLocaleString();
    }
  }

  function searchleNewGameEvent(data) {
    searchleGuesses = [];
    searchleStartTime = data.startTime ? new Date(data.startTime) : new Date();
    startSearchleTimer();

    const target = document.getElementById('searchle-target');
    const guessCount = document.getElementById('searchle-guesses');
    const winner = document.getElementById('searchle-winner');
    const badge = document.getElementById('searchle-badge');
    const vocab = document.getElementById('searchle-vocab');

    if (target) target.textContent = '???';
    if (guessCount) guessCount.textContent = '0';
    if (winner) { winner.textContent = '--'; winner.style.color = ''; }
    if (badge) { badge.textContent = 'Active'; badge.className = 'searchle-game-badge active'; }
    if (vocab && data.totalRankedWords) vocab.textContent = data.totalRankedWords.toLocaleString();

    renderSearchleFeed();
  }

  function renderSearchleHistory(history) {
    const body = document.getElementById('searchle-history-body');
    const count = document.getElementById('searchle-history-count');
    if (!body) return;

    if (count) count.textContent = history.length;

    // Show most recent first
    const reversed = history.slice().reverse();

    body.innerHTML = reversed.map((win, i) => {
      const date = new Date(win.timestamp);
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const platformClass = win.user?.platform || 'system';

      return `<tr>
        <td>${history.length - i}</td>
        <td class="searchle-history-user">${escapeHtml(win.user?.displayName || '?')}</td>
        <td><span class="msg-platform-badge ${platformClass}">${platformClass}</span></td>
        <td class="searchle-history-word">${escapeHtml(win.word)}</td>
        <td>${win.guessCount}</td>
        <td>${dateStr} ${timeStr}</td>
      </tr>`;
    }).join('');
  }

  let _spPoolIndex = null;

  function renderSearchlePoolWords(data) {
    _spPoolIndex = data;
    const grid = document.getElementById('searchle-pool-grid');
    const count = document.getElementById('searchle-pool-count');
    if (!grid || !data || !data.words) return;

    const entries = Object.entries(data.words).sort((a, b) => a[1] - b[1]);
    if (count) count.textContent = entries.length;

    grid.innerHTML = entries.map(([word, num]) =>
      `<div class="searchle-pool-word" data-word="${escapeHtml(word)}">
        <span class="searchle-pool-num">#${num}</span>
        <span class="searchle-pool-name">${escapeHtml(word)}</span>
      </div>`
    ).join('');
  }

  function addSearchlePoolWord(word, num) {
    if (!_spPoolIndex) _spPoolIndex = { words: {}, nextNumber: 1 };
    _spPoolIndex.words[word] = num;
    renderSearchlePoolWords(_spPoolIndex);
    // Flash the new word
    setTimeout(() => {
      const el = document.querySelector(`.searchle-pool-word[data-word="${word}"]`);
      if (el) el.classList.add('new-word');
    }, 50);
  }

  function renderSearchleLeaderboard(history) {
    const container = document.getElementById('searchle-leaderboard');
    if (!container) return;

    // Compute wins per user
    const winners = {};
    history.forEach(win => {
      const name = win.user?.displayName || '?';
      const platform = win.user?.platform || 'system';
      const key = `${platform}:${name}`;
      if (!winners[key]) {
        winners[key] = { name, platform, wins: 0, totalGuesses: 0 };
      }
      winners[key].wins++;
      winners[key].totalGuesses += win.guessCount || 0;
    });

    const sorted = Object.values(winners).sort((a, b) => b.wins - a.wins);
    const top = sorted.slice(0, 20);

    if (top.length === 0) {
      container.innerHTML = '<div class="searchle-feed-empty">No wins yet</div>';
      return;
    }

    container.innerHTML = top.map((p, i) => {
      const medal = i === 0 ? '&#x1F947;' : i === 1 ? '&#x1F948;' : i === 2 ? '&#x1F949;' : `#${i + 1}`;
      const avg = p.wins > 0 ? Math.round(p.totalGuesses / p.wins) : 0;
      return `<div class="searchle-lb-row">
        <span class="searchle-lb-rank">${medal}</span>
        <div class="searchle-lb-info">
          <span class="searchle-lb-name">${escapeHtml(p.name)}</span>
          <span class="searchle-lb-platform msg-platform-badge ${p.platform}">${p.platform}</span>
        </div>
        <div class="searchle-lb-stats">
          <span class="searchle-lb-wins">${p.wins} win${p.wins !== 1 ? 's' : ''}</span>
          <span class="searchle-lb-avg">avg ${avg} guesses</span>
        </div>
      </div>`;
    }).join('');
  }

  function getRankColor(rank, total) {
    total = total || 317730;
    const ratio = Math.log(rank) / Math.log(total);
    const hue = Math.round(120 * (1 - ratio)); // 120=green, 0=red
    return `hsl(${hue}, 80%, 50%)`;
  }

  // Helpers
  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getPlatformColor(platform) {
    switch (platform) {
      case 'tiktok': return '#69C9D0';
      case 'youtube': return '#FF0000';
      case 'discord': return '#5865F2';
      case 'system': return '#9147FF';
      default: return '#efeff1';
    }
  }

  function formatBadge(badge) {
    switch (badge) {
      case 'fan-club': return 'FC';
      case 'superfan': return 'SF';
      case 'subscriber': return 'SUB';
      case 'follower': return 'F';
      case 'bot': return 'BOT';
      case 'superchat': return 'SC';
      case 'moderator': return 'MOD';
      case 'discord-member': return 'DC';
      default: return badge.toUpperCase();
    }
  }

  // ─── Cosmetics Admin Panel ──────────────────────────────────────────
  let cosmeticsCatalog = [];
  let cosmeticsSelectedPlayerId = null;
  let cosmeticsActiveCategory = 'all';
  let cosmeticsActiveRarity = 'all';
  let cosmeticsActiveSet = 'all';

  const CATEGORY_LABELS = {
    word_color: 'Word Color', word_glow: 'Word Glow', profile_border: 'Border', profile_glow: 'Glow',
    name_glow: 'Name Glow', name_color: 'Name Color', title: 'Title', win_effect: 'Win Effect'
  };

  const SET_LABELS = {
    pixel: 'Pixel', steampunk: 'Steampunk', sakura: 'Sakura', storm: 'Storm',
    dragon: 'Dragon', quantum: 'Quantum', america: 'Stars & Stripes', canada: 'Great North'
  };

  function renderCosmeticsCatalog(catalog) {
    cosmeticsCatalog = catalog;
    filterAndRenderCatalog();
  }

  function filterAndRenderCatalog() {
    const grid = document.getElementById('cosmetics-grid');
    if (!grid) return;

    const filtered = cosmeticsCatalog.filter(item => {
      if (cosmeticsActiveCategory !== 'all' && item.category !== cosmeticsActiveCategory) return false;
      if (cosmeticsActiveRarity !== 'all' && item.rarity !== cosmeticsActiveRarity) return false;
      if (cosmeticsActiveSet === 'none' && item.setId) return false;
      if (cosmeticsActiveSet !== 'all' && cosmeticsActiveSet !== 'none' && item.setId !== cosmeticsActiveSet) return false;
      return true;
    });

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="cosmetics-loading">No cosmetics match filters</div>';
      return;
    }

    grid.innerHTML = filtered.map(item => {
      const preview = buildPreviewHTML(item);
      const disabledAttr = cosmeticsSelectedPlayerId ? '' : 'disabled';
      const buffHtml = item.buffs ? `<div class="cosmetic-card-buff">${item.buffs.map(b => escapeHtml(b.label)).join(', ')}</div>` : item.buff ? `<div class="cosmetic-card-buff">${escapeHtml(item.buff.label)}</div>` : '';
      const setBadge = item.setId ? `<span class="cosmetic-set-badge" title="${escapeHtml(item.setId)} set">${escapeHtml(SET_LABELS[item.setId] || item.setId)}</span>` : '';
      return `<div class="cosmetic-card rarity-${item.rarity}" data-id="${escapeHtml(item.id)}">
        <div class="cosmetic-card-header">
          <span class="cosmetic-card-name">${escapeHtml(item.name)}</span>
          <span class="cosmetic-rarity-badge rarity-${item.rarity}">${item.rarity}</span>
        </div>
        <div class="cosmetic-card-category">${CATEGORY_LABELS[item.category] || item.category}${setBadge}</div>
        ${preview}
        ${buffHtml}
        <div class="cosmetic-card-price">${Number(item.cost).toLocaleString()} coins</div>
        <div class="cosmetic-card-actions">
          <button class="cosmetic-grant-btn" ${disabledAttr} onclick="cosmeticsGrant('${escapeHtml(item.id)}')">Grant</button>
          <button class="cosmetic-grant-equip-btn" ${disabledAttr} onclick="cosmeticsGrantAndEquip('${escapeHtml(item.id)}')">Grant & Equip</button>
        </div>
      </div>`;
    }).join('');
  }

  function buildPreviewHTML(item) {
    try {
      const css = typeof item.css_property === 'string' ? JSON.parse(item.css_property) : item.css_property;
      if (!css) return '<div class="cosmetic-card-preview">—</div>';

      const cat = item.category;

      if (cat === 'word_color' || cat === 'name_color') {
        // Show colored text sample
        const parts = [];
        if (css.color) parts.push(`color:${css.color}`);
        if (css.textShadow) parts.push(`text-shadow:${css.textShadow}`);
        if (css.animation) parts.push(`animation:${css.animation}`);
        if (css.background) parts.push(`background:${css.background};-webkit-background-clip:text;-webkit-text-fill-color:transparent`);
        const label = cat === 'word_color' ? 'HELLO' : 'PlayerName';
        return `<div class="cosmetic-card-preview" style="font-size:15px;font-weight:700;${parts.join(';')}">${label}</div>`;
      }

      if (cat === 'word_glow') {
        // Show text with glow effect
        const parts = [];
        if (css.textShadow) parts.push(`text-shadow:${css.textShadow}`);
        if (css.animation) parts.push(`animation:${css.animation}`);
        return `<div class="cosmetic-card-preview" style="font-size:15px;font-weight:700;color:var(--text-primary);${parts.join(';')}">HELLO</div>`;
      }

      if (cat === 'profile_border') {
        // Show a small circle with the border
        return `<div class="cosmetic-card-preview"><div style="width:36px;height:36px;border-radius:50%;${css.border ? 'border:' + css.border : ''};${css.animation ? 'animation:' + css.animation : ''}"></div></div>`;
      }

      if (cat === 'profile_glow') {
        // Show a small circle with glow
        return `<div class="cosmetic-card-preview"><div style="width:36px;height:36px;border-radius:50%;background:var(--bg-hover);${css.boxShadow ? 'box-shadow:' + css.boxShadow : ''};${css.animation ? 'animation:' + css.animation : ''}"></div></div>`;
      }

      if (cat === 'name_glow') {
        // Show text with glow effect
        const parts = [];
        if (css.textShadow) parts.push(`text-shadow:${css.textShadow}`);
        if (css.animation) parts.push(`animation:${css.animation}`);
        return `<div class="cosmetic-card-preview" style="font-size:14px;font-weight:600;color:var(--text-primary);${parts.join(';')}">PlayerName</div>`;
      }

      if (cat === 'title') {
        // Show the title badge
        const parts = [];
        if (css.titleColor) parts.push(`color:${css.titleColor}`);
        if (css.titleGlow) parts.push(`text-shadow:${css.titleGlow}`);
        if (css.animation) parts.push(`animation:${css.animation}`);
        const titleText = css.title || item.name;
        return `<div class="cosmetic-card-preview" style="font-size:13px;font-weight:600;${parts.join(';')}">[${escapeHtml(titleText)}]</div>`;
      }

      if (cat === 'win_effect') {
        // Show effect name with colored dots representing the particle colors
        const colors = css.colors || [];
        const dots = colors.slice(0, 6).map(c => `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${c};margin:0 1px"></span>`).join('');
        const effectName = (css.effect || '').replace(/_/g, ' ');
        return `<div class="cosmetic-card-preview" style="font-size:11px;color:var(--text-secondary)">${dots}<br>${effectName}</div>`;
      }

      return '<div class="cosmetic-card-preview">—</div>';
    } catch { return '<div class="cosmetic-card-preview">—</div>'; }
  }

  function setCosmeticsCategoryFilter(category) {
    cosmeticsActiveCategory = category;
    document.querySelectorAll('#cosmetic-category-filters .cosmetic-filter').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.category === category);
    });
    filterAndRenderCatalog();
  }

  function setCosmeticsRarityFilter(rarity) {
    cosmeticsActiveRarity = rarity;
    document.querySelectorAll('#cosmetic-rarity-filters .cosmetic-filter').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.rarity === rarity);
    });
    filterAndRenderCatalog();
  }

  function setCosmeticsSetFilter(setId) {
    cosmeticsActiveSet = setId;
    document.querySelectorAll('#cosmetic-set-filters .cosmetic-filter').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.set === setId);
    });
    filterAndRenderCatalog();
  }

  function renderPlayerSearchResults(players) {
    const container = document.getElementById('cosmetics-player-results');
    if (!container) return;

    if (!players || players.length === 0) {
      container.innerHTML = '<div class="cosmetics-no-player" style="padding:8px;font-size:12px">No players found</div>';
      return;
    }

    container.innerHTML = players.map(p => {
      const selected = p.id === cosmeticsSelectedPlayerId ? 'selected' : '';
      return `<div class="cosmetics-player-result ${selected}" onclick="cosmeticsSelectPlayer(${p.id})">
        <span class="player-platform-badge ${p.platform}">${p.platform}</span>
        <span>${escapeHtml(p.display_name || p.username)}</span>
        <span class="player-coins">${Number(p.coins).toLocaleString()}</span>
      </div>`;
    }).join('');
  }

  function selectCosmeticsPlayer(player, duplicates) {
    cosmeticsSelectedPlayerId = player.id;
    const container = document.getElementById('cosmetics-selected-player');
    if (container) {
      let html = `<div class="cosmetics-selected-info">
        <div class="player-name">${escapeHtml(player.display_name || player.username)}</div>
        <div class="player-detail">Platform: <span>${player.platform}</span></div>
        <div class="player-detail">Coins: <span>${Number(player.coins).toLocaleString()}</span></div>
        <div class="player-detail">ID: ${player.id}</div>
      </div>`;

      // Show merge panel if duplicates exist
      if (duplicates && duplicates.length > 0) {
        html += `<div class="cosmetics-merge-panel">
          <div class="merge-header">⚠️ Duplicate Accounts Found</div>
          <div class="merge-desc">These players share the same display name. Merge to combine coins, taps, businesses & cosmetics.</div>`;
        for (const dup of duplicates) {
          html += `<div class="merge-dup-row">
            <div class="merge-dup-info">
              <span class="player-platform-badge ${dup.platform}">${dup.platform}</span>
              <span>${escapeHtml(dup.display_name || dup.username)}</span>
              <span class="player-coins">${Number(dup.coins).toLocaleString()}</span>
              <span class="merge-dup-id">ID: ${dup.id}</span>
            </div>
            <button class="cosmetic-merge-btn" onclick="cosmeticsMerge(${player.id}, ${dup.id})" title="Merge ID ${dup.id} into ID ${player.id}">Merge Into Selected</button>
          </div>`;
        }
        html += `</div>`;
      }
      container.innerHTML = html;
    }
    // Re-render catalog to enable grant buttons
    filterAndRenderCatalog();
    // Highlight selected in results list
    document.querySelectorAll('.cosmetics-player-result').forEach(el => el.classList.remove('selected'));
  }

  function renderPlayerOwnedCosmetics(owned) {
    const container = document.getElementById('cosmetics-player-owned');
    if (!container) return;

    if (!owned || owned.length === 0) {
      container.innerHTML = '<div class="cosmetics-owned-header">Owned Cosmetics</div><div class="cosmetics-no-player" style="font-size:12px">No cosmetics owned</div>';
      return;
    }

    let html = `<div class="cosmetics-owned-header">Owned Cosmetics (${owned.length})</div>`;
    html += owned.map(item => {
      const equippedBadge = item.equipped ? '<span class="owned-equipped">Equipped</span>' : '';
      const equipLabel = item.equipped ? 'Unequip' : 'Equip';
      const buffLabel = item.buff ? `<span class="owned-buff">${escapeHtml(item.buff.label)}</span>` : '';
      return `<div class="cosmetic-owned-item">
        <div style="flex:1">
          <div class="owned-name">${escapeHtml(item.name)} ${equippedBadge}</div>
          <div class="owned-category">${CATEGORY_LABELS[item.category] || item.category} &middot; ${item.rarity} ${buffLabel}</div>
        </div>
        <div class="cosmetic-owned-actions">
          <button class="cosmetic-equip-btn" onclick="cosmeticsEquip('${escapeHtml(item.cosmetic_id)}', ${!item.equipped})">${equipLabel}</button>
          <button class="cosmetic-revoke-btn" onclick="cosmeticsRevoke('${escapeHtml(item.cosmetic_id)}')">Revoke</button>
        </div>
      </div>`;
    }).join('');

    container.innerHTML = html;
  }

  // ─── Word500 Admin Panel ────────────────────────────────────────────
  let word500Guesses = [];

  function updateWord500Connection(connected) {
    const dot = document.getElementById('word500-conn-dot');
    const badge = document.getElementById('word500-badge');
    if (dot) dot.classList.toggle('connected', connected);
    if (badge) {
      badge.textContent = connected ? 'Connected' : 'Offline';
      badge.className = 'word500-game-badge ' + (connected ? 'connected' : 'offline');
    }
  }

  function renderWord500State(state) {
    if (!state) return;

    const guessCount = document.getElementById('word500-guesses');
    const status = document.getElementById('word500-status');
    const displays = document.getElementById('word500-displays');
    const winner = document.getElementById('word500-winner');
    const badge = document.getElementById('word500-badge');
    const slashToggle = document.getElementById('word500-slash-toggle');
    const jackpotToggle = document.getElementById('word500-jackpot-toggle');

    if (guessCount) guessCount.textContent = (state.guesses ? state.guesses.length : 0);
    if (displays) displays.textContent = state.connectedDisplays || 0;
    if (slashToggle && state.requireSlashPrefix !== undefined) {
      slashToggle.checked = state.requireSlashPrefix;
    }
    if (jackpotToggle && state.jackpotEnabled !== undefined) {
      jackpotToggle.checked = state.jackpotEnabled;
    }

    if (winner) {
      if (state.winner) {
        winner.textContent = state.winner.displayName || '--';
        winner.style.color = '#00c853';
      } else if (state.lastWinner) {
        winner.textContent = (state.lastWinner.displayName || '--') + ' (prev)';
        winner.style.color = '';
      } else {
        winner.textContent = '--';
        winner.style.color = '';
      }
    }

    if (status) {
      if (state.gameOver && state.winner) {
        status.textContent = 'Won';
        status.style.color = '#ffab00';
      } else {
        status.textContent = 'Active';
        status.style.color = '#00c853';
      }
    }

    if (badge) {
      if (state.gameOver) {
        badge.textContent = 'Won';
        badge.className = 'word500-game-badge won';
      } else {
        badge.textContent = 'Active';
        badge.className = 'word500-game-badge active';
      }
    }

    // Render guesses
    if (state.guesses && state.guesses.length) {
      word500Guesses = state.guesses.slice();
      renderWord500Feed();
    }
  }

  function addWord500Guess(guess) {
    word500Guesses.push(guess);

    const guessCount = document.getElementById('word500-guesses');
    if (guessCount) guessCount.textContent = word500Guesses.length;

    renderWord500Feed();
  }

  function renderWord500Feed() {
    const feed = document.getElementById('word500-feed');
    if (!feed) return;

    const feedCount = document.getElementById('word500-feed-count');
    if (feedCount) feedCount.textContent = word500Guesses.length;

    if (word500Guesses.length === 0) {
      feed.innerHTML = '<div class="word500-feed-empty">Waiting for guesses...</div>';
      return;
    }

    // Show most recent first, limit 100
    const recent = word500Guesses.slice(-100).reverse();
    feed.innerHTML = recent.map(g => {
      const platformClass = g.platform || 'system';
      const correct = g.correct || 0;
      const present = g.present || 0;
      const absent = g.absent || 0;
      return `<div class="word500-guess-row">
        <span class="word500-guess-word">${escapeHtml((g.word || '').toUpperCase())}</span>
        <span class="word500-guess-score">
          <span class="w5-correct">${correct}&#x1F7E9;</span>
          <span class="w5-present">${present}&#x1F7E8;</span>
          <span class="w5-absent">${absent}&#x1F7E5;</span>
        </span>
        <span class="word500-guess-user">
          <span class="msg-platform-badge ${platformClass}">${platformClass}</span>
          ${escapeHtml(g.displayName || '?')}
        </span>
      </div>`;
    }).join('');
  }

  function word500GameOver(data) {
    const winner = document.getElementById('word500-winner');
    const word = document.getElementById('word500-word');
    const status = document.getElementById('word500-status');
    const badge = document.getElementById('word500-badge');

    if (winner) {
      winner.textContent = data.winner?.displayName || '--';
      winner.style.color = '#00c853';
    }
    if (word) word.textContent = (data.word || '?????').toUpperCase();
    if (status) {
      status.textContent = 'Won';
      status.style.color = '#ffab00';
    }
    if (badge) {
      badge.textContent = 'Won';
      badge.className = 'word500-game-badge won';
    }
  }

  function word500NewGameEvent() {
    word500Guesses = [];

    const word = document.getElementById('word500-word');
    const guessCount = document.getElementById('word500-guesses');
    const winner = document.getElementById('word500-winner');
    const status = document.getElementById('word500-status');
    const badge = document.getElementById('word500-badge');

    if (word) word.textContent = '?????';
    if (guessCount) guessCount.textContent = '0';
    if (winner) { winner.textContent = '--'; winner.style.color = ''; }
    if (status) { status.textContent = 'Active'; status.style.color = '#00c853'; }
    if (badge) { badge.textContent = 'Active'; badge.className = 'word500-game-badge active'; }

    renderWord500Feed();
  }

  function renderWord500History(recentGames) {
    const body = document.getElementById('word500-history-body');
    const count = document.getElementById('word500-history-count');
    if (!body) return;

    if (count) count.textContent = recentGames.length;

    // Show most recent first
    const reversed = recentGames.slice().reverse();

    body.innerHTML = reversed.map((game, i) => {
      const date = new Date(game.timestamp);
      const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
      const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const platformClass = game.winner?.platform || 'system';

      return `<tr>
        <td>${recentGames.length - i}</td>
        <td class="word500-history-user">${escapeHtml(game.winner?.displayName || '?')}</td>
        <td><span class="msg-platform-badge ${platformClass}">${platformClass}</span></td>
        <td class="word500-history-word">${escapeHtml((game.word || '').toUpperCase())}</td>
        <td>${game.guessCount || 0}</td>
        <td>${dateStr} ${timeStr}</td>
      </tr>`;
    }).join('');
  }

  function renderWord500Leaderboard(leaderboard) {
    const container = document.getElementById('word500-leaderboard');
    if (!container) return;

    if (!leaderboard || leaderboard.length === 0) {
      container.innerHTML = '<div class="word500-feed-empty">No wins yet</div>';
      return;
    }

    const top = leaderboard.slice(0, 20);

    container.innerHTML = top.map((p, i) => {
      const medal = i === 0 ? '&#x1F947;' : i === 1 ? '&#x1F948;' : i === 2 ? '&#x1F949;' : `#${i + 1}`;
      return `<div class="word500-lb-row">
        <span class="word500-lb-rank">${medal}</span>
        <div class="word500-lb-info">
          <span class="word500-lb-name">${escapeHtml(p.name)}</span>
        </div>
        <div class="word500-lb-stats">
          <span class="word500-lb-wins">${p.wins} win${p.wins !== 1 ? 's' : ''}</span>
        </div>
      </div>`;
    }).join('');
  }

  // ─── Squaredle Admin Panel ───────────────────────────────────────────
  function updateSquaredleConnection(connected) {
    const dot = document.getElementById('squaredle-conn-dot');
    const badge = document.getElementById('squaredle-badge');
    if (dot) dot.classList.toggle('connected', connected);
    if (badge) {
      badge.textContent = connected ? 'Connected' : 'Offline';
      badge.className = 'squaredle-game-badge ' + (connected ? 'connected' : 'offline');
    }
  }

  function showSquaredleStatus(text) {
    const el = document.getElementById('squaredle-status-msg');
    if (!el) return;
    el.textContent = text;
    el.classList.add('visible');
    setTimeout(() => { el.textContent = ''; el.classList.remove('visible'); }, 3000);
  }

  function renderSquaredleState(state) {
    if (!state) return;

    // Grid size
    const gridSize = document.getElementById('squaredle-grid-size');
    if (gridSize) gridSize.textContent = state.rows && state.cols ? `${state.rows}×${state.cols}` : '--';

    // Common words (found/total)
    const common = document.getElementById('squaredle-common');
    if (common) common.textContent = `${state.foundCommonCount || 0}/${state.commonCount || 0}`;

    // Rare words found
    const rare = document.getElementById('squaredle-rare');
    if (rare) rare.textContent = `${state.foundRareCount || 0}/${state.rareCount || 0}`;

    // 3-letter words found
    const threeLetter = document.getElementById('squaredle-three-letter');
    if (threeLetter) threeLetter.textContent = `${state.foundThreeLetterCount || 0}/${state.threeLetterCount || 0}`;

    // Jackpot
    const jackpot = document.getElementById('squaredle-jackpot');
    if (jackpot) jackpot.textContent = state.jackpot != null ? state.jackpot.toLocaleString() : '--';

    // Progress
    const progress = document.getElementById('squaredle-progress');
    if (progress) progress.textContent = state.percentage != null ? `${Math.round(state.percentage)}%` : '0%';

    // Jackpot toggle
    const toggle = document.getElementById('squaredle-jackpot-toggle');
    if (toggle) toggle.checked = !!state.jackpotEnabled;

    // Game badge — daily / complete / active
    const badge = document.getElementById('squaredle-badge');
    if (badge) {
      if (state.isComplete) {
        badge.textContent = 'Complete';
        badge.className = 'squaredle-game-badge won';
      } else if (state.isDaily) {
        badge.textContent = 'Daily';
        badge.className = 'squaredle-game-badge daily';
      } else {
        badge.textContent = 'Active';
        badge.className = 'squaredle-game-badge active';
      }
    }
  }

  return {
    init,
    renderMessage,
    renderOverlayPreview,
    setPreviewMode,
    updatePlatformStatus,
    renderCommands,
    renderTTSUsers,
    updateTTSSettings,
    renderApps,
    updateSearchleConnection,
    renderSearchleState,
    addSearchleGuess,
    searchleGameWon,
    searchleNewGameEvent,
    updateSearchleModels,
    renderSearchleHistory,
    renderSearchleLeaderboard,
    renderSearchlePoolWords,
    addSearchlePoolWord,
    updateWord500Connection,
    renderWord500State,
    addWord500Guess,
    word500GameOver,
    word500NewGameEvent,
    renderWord500History,
    renderWord500Leaderboard,
    updateSquaredleConnection,
    showSquaredleStatus,
    renderSquaredleState,
    renderCosmeticsCatalog,
    setCosmeticsCategoryFilter,
    setCosmeticsRarityFilter,
    setCosmeticsSetFilter,
    renderPlayerSearchResults,
    selectCosmeticsPlayer,
    renderPlayerOwnedCosmetics,
    filterAndRenderCatalog
  };
})();
