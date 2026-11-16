(function () {
  var socket = io();
  var state = null;
  var config = null;
  var info = null;
  var cloudTokenDirty = false;
  var tokenVisible = false;

  var els = {
    statusDot: document.getElementById('status-dot'),
    statusText: document.getElementById('status-text'),
    heroTitle: document.getElementById('hero-title'),
    heroSub: document.getElementById('hero-sub'),
    metaUrl: document.getElementById('meta-url'),
    metaVersion: document.getElementById('meta-version'),
    metaUptime: document.getElementById('meta-uptime'),
    metaLastEvent: document.getElementById('meta-last-event'),
    statPrimary: document.getElementById('stat-primary'),
    statPrimaryNote: document.getElementById('stat-primary-note'),
    statChat: document.getElementById('stat-chat'),
    statEngagement: document.getElementById('stat-engagement'),
    statRaw: document.getElementById('stat-raw'),
    statErrors: document.getElementById('stat-errors'),
    routeBanner: document.getElementById('route-banner'),
    cloudBanner: document.getElementById('cloud-banner'),
    copyUrlBtn: document.getElementById('copy-url-btn'),
    refreshBtn: document.getElementById('refresh-btn'),
    saveCloudBtn: document.getElementById('save-cloud-btn'),
    toggleTokenBtn: document.getElementById('toggle-token-btn'),
    clearTokenBtn: document.getElementById('clear-token-btn'),
    cloudUrl: document.getElementById('cloud-url'),
    cloudToken: document.getElementById('cloud-token'),
    tokenHint: document.getElementById('token-hint'),
    toggleTikfinity: document.getElementById('toggle-tikfinity'),
    toggleCloud: document.getElementById('toggle-cloud'),
    primaryTikfinity: document.getElementById('primary-tikfinity'),
    primaryCloud: document.getElementById('primary-cloud')
  };

  function fmtTime(ts) {
    if (!ts) return 'waiting';
    try {
      return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (_error) {
      return 'waiting';
    }
  }

  function fmtAgo(ts) {
    if (!ts) return 'No events yet';
    var delta = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (delta < 5) return 'just now';
    if (delta < 60) return delta + 's ago';
    if (delta < 3600) return Math.floor(delta / 60) + 'm ago';
    return Math.floor(delta / 3600) + 'h ago';
  }

  function fmtUptime(sec) {
    var total = Number(sec || 0);
    var hours = Math.floor(total / 3600);
    var minutes = Math.floor((total % 3600) / 60);
    var seconds = total % 60;
    if (hours > 0) return hours + 'h ' + minutes + 'm';
    if (minutes > 0) return minutes + 'm ' + seconds + 's';
    return seconds + 's';
  }

  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function sourceLabel(name) {
    return name === 'cloud' ? 'Cloud' : 'TikFinity';
  }

  function eventBadgeClass(kind) {
    if (kind === 'chatMessage') return 'chat';
    if (kind === 'engagement') return 'engagement';
    return 'other';
  }

  function updateSourceCard(name, source, primary) {
    var pills = document.getElementById('source-' + name + '-pills');
    var details = document.getElementById('source-' + name + '-details');
    var stats = document.getElementById('source-' + name + '-stats');
    var events = document.getElementById('source-' + name + '-events');
    if (!pills || !details || !stats || !events) return;

    source = source || {};
    var countData = source.eventCounts || {};
    var raw = Number(countData.raw || 0);
    var chat = Number(countData.chatMessage || 0);
    var engagement = Number(countData.engagement || 0);
    var unknown = Number(countData.unknown || 0);

    pills.innerHTML = '';
    pills.appendChild(makePill(source.connected ? 'Connected' : (source.enabled ? 'Waiting' : 'Disabled'), source.connected ? 'good' : (source.enabled ? '' : 'bad')));
    pills.appendChild(makePill(source.enabled ? 'Enabled' : 'Off', source.enabled ? '' : 'bad'));
    if (primary === name) pills.appendChild(makePill('Primary', 'primary'));

    var rows = [];
    rows.push(detailRow('URL', source.url || '-'));
    rows.push(detailRow('Last event', (source.lastEventAt ? fmtTime(source.lastEventAt) + ' (' + fmtAgo(source.lastEventAt) + ')' : 'No events yet')));
    rows.push(detailRow('Last error', source.lastError || 'None'));
    if (name === 'cloud') {
      rows.push(detailRow('Token', source.tokenConfigured ? 'Configured' : 'Not configured'));
      rows.push(detailRow('Streamer', source.displayName || source.streamerId || '-'));
    }
    details.innerHTML = rows.join('');

    stats.innerHTML = ''
      + statBlock(raw, 'Raw')
      + statBlock(chat, 'Chat')
      + statBlock(engagement, 'Engage')
      + statBlock(unknown, 'Unknown');

    var recent = Array.isArray(source.recentEvents) ? source.recentEvents : [];
    if (!recent.length) {
      events.innerHTML = '<div class="event-empty">No events yet for ' + sourceLabel(name) + '.</div>';
      return;
    }

    events.innerHTML = recent.slice(0, 10).map(function (event) {
      return ''
        + '<div class="event-row">'
        + '<span class="event-kind ' + eventBadgeClass(event.kind) + '">' + escapeHtml(labelKind(event.kind)) + '</span>'
        + '<span class="event-preview">' + escapeHtml(event.preview || 'No preview') + '</span>'
        + '<span class="event-time">' + escapeHtml(fmtTime(event.at)) + '</span>'
        + '</div>';
    }).join('');
  }

  function labelKind(kind) {
    if (kind === 'chatMessage') return 'chat';
    if (kind === 'engagement') return 'engagement';
    return kind || 'event';
  }

  function makePill(text, variant) {
    var el = document.createElement('span');
    el.className = 'tiny-pill' + (variant ? ' ' + variant : '');
    el.textContent = text;
    return el;
  }

  function detailRow(label, value) {
    return '<div class="detail-row"><dt>' + escapeHtml(label) + '</dt><dd>' + escapeHtml(value) + '</dd></div>';
  }

  function statBlock(value, label) {
    return '<div class="source-stat"><strong>' + Number(value || 0).toLocaleString() + '</strong><span>' + escapeHtml(label) + '</span></div>';
  }

  function syncInputs() {
    if (!config) return;
    els.toggleTikfinity.checked = !!config.tikfinityEnabled;
    els.toggleCloud.checked = !!config.cloudEnabled;
    els.primaryTikfinity.checked = config.primary !== 'cloud';
    els.primaryCloud.checked = config.primary === 'cloud';
    els.cloudUrl.value = config.cloudUrl || '';
    if (!cloudTokenDirty) {
      els.cloudToken.value = config.cloudTokenConfigured ? 'configured' : '';
      els.cloudToken.type = tokenVisible ? 'text' : 'password';
    }
  }

  function render() {
    if (!state) return;

    var primary = state.primary === 'cloud' ? 'cloud' : 'tikfinity';
    var primarySource = state.sources && state.sources[primary] ? state.sources[primary] : {};
    var primaryConnected = !!primarySource.connected;
    var allCounts = state.eventCounts || {};
    var label = sourceLabel(primary);

    els.statusDot.className = 'status-dot ' + (primaryConnected ? 'good' : 'bad');
    els.statusText.textContent = primaryConnected ? (label + ' live') : ('Waiting for ' + label);

    els.heroTitle.textContent = primaryConnected
      ? (label + ' is feeding your local bridge')
      : ('Bridge is running, but ' + label + ' is not connected yet');
    els.heroSub.textContent = primaryConnected
      ? ('Your /stream pages are currently relaying events from ' + label + '. You can keep both inputs enabled and switch the primary source any time.')
      : ('Keep the app open while you stream. TikFinity reconnects automatically, and the cloud feed comes online as soon as your bridge token is linked.');

    els.metaUrl.textContent = 'Local URL: ' + ((info && info.localSocketIo) || 'http://127.0.0.1:21420');
    els.metaVersion.textContent = 'Version: ' + (state.bridgeVersion || (info && info.bridgeVersion) || '0.2.1');
    els.metaUptime.textContent = 'Uptime: ' + fmtUptime(state.uptimeSec || 0);
    els.metaLastEvent.textContent = 'Last event: ' + (state.lastEventAt ? fmtTime(state.lastEventAt) : 'waiting');

    els.statPrimary.textContent = label;
    els.statPrimaryNote.textContent = primaryConnected ? 'Actively relaying downstream' : 'Selected, but not connected yet';
    els.statChat.textContent = Number(allCounts.chatMessage || 0).toLocaleString();
    els.statEngagement.textContent = Number(allCounts.engagement || 0).toLocaleString();
    els.statRaw.textContent = Number(allCounts.raw || 0).toLocaleString();
    els.statErrors.textContent = 'Unknown events: ' + Number(allCounts.unknown || 0).toLocaleString();

    els.routeBanner.textContent = primaryConnected
      ? (label + ' is the only source forwarding live events to your /stream pages right now.')
      : ('The bridge still protects you from duplicate chat: only the selected primary source will relay once it connects.');

    var cloudSource = state.sources && state.sources.cloud ? state.sources.cloud : {};
    if (cloudSource.tokenConfigured) {
      els.cloudBanner.className = 'banner';
      els.cloudBanner.textContent = cloudSource.connected
        ? 'Cloud is linked and connected. You can make it primary if you want your streamer dashboard feed to drive the local bridge.'
        : 'Cloud is linked. If it is enabled but not connected, check the stored token or your internet connection.';
      els.tokenHint.textContent = 'A token is already stored locally. Save again only if you want to replace it.';
    } else {
      els.cloudBanner.className = 'banner warn';
      els.cloudBanner.textContent = 'Cloud is off until a valid bridge token is configured. Use the streamer dashboard handoff or paste a token here.';
      els.tokenHint.innerHTML = 'Use the one-click handoff from <a href="https://wordgame.live/streamer" target="_blank" rel="noreferrer">wordgame.live/streamer</a> or paste the token here as a fallback.';
    }

    updateSourceCard('tikfinity', state.sources && state.sources.tikfinity, primary);
    updateSourceCard('cloud', cloudSource, primary);
    syncInputs();
  }

  async function fetchJson(url, options) {
    var res = await fetch(url, options || {});
    if (!res.ok) throw new Error('Request failed: ' + res.status);
    return res.json();
  }

  async function refresh() {
    try {
      var results = await Promise.all([
        fetchJson('/health'),
        fetchJson('/config'),
        fetchJson('/info')
      ]);
      state = results[0];
      config = results[1];
      info = results[2];
      render();
    } catch (_error) {
      els.statusDot.className = 'status-dot bad';
      els.statusText.textContent = 'Bridge offline';
      els.heroTitle.textContent = 'Unable to reach the local bridge';
      els.heroSub.textContent = 'If you just opened the app, wait a moment and click Refresh status.';
    }
  }

  async function patchConfig(patch) {
    config = await fetchJson('/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch)
    });
    state = await fetchJson('/health');
    render();
  }

  async function saveCloudSettings() {
    var patch = {};
    var nextUrl = String(els.cloudUrl.value || '').trim();
    if (nextUrl) patch.cloudUrl = nextUrl;
    if (cloudTokenDirty) patch.cloudToken = String(els.cloudToken.value || '').trim();
    if (!Object.keys(patch).length) return;
    els.saveCloudBtn.disabled = true;
    try {
      await patchConfig(patch);
      cloudTokenDirty = false;
      tokenVisible = false;
      els.cloudToken.type = 'password';
      if (patch.cloudToken !== undefined) {
        els.cloudToken.value = patch.cloudToken ? 'configured' : '';
      }
    } finally {
      els.saveCloudBtn.disabled = false;
    }
  }

  function handleSocketState(snapshot) {
    state = snapshot;
    if (!config) {
      refresh();
      return;
    }
    render();
  }

  function initEvents() {
    socket.on('bridge-status', handleSocketState);

    els.copyUrlBtn.addEventListener('click', function () {
      var value = (info && info.localSocketIo) || 'http://127.0.0.1:21420';
      navigator.clipboard.writeText(value).then(function () {
        els.copyUrlBtn.textContent = 'Copied';
        setTimeout(function () {
          els.copyUrlBtn.textContent = 'Copy local URL';
        }, 1400);
      }).catch(function () {
        els.copyUrlBtn.textContent = 'Copy failed';
        setTimeout(function () {
          els.copyUrlBtn.textContent = 'Copy local URL';
        }, 1400);
      });
    });

    els.refreshBtn.addEventListener('click', refresh);

    els.toggleTikfinity.addEventListener('change', function () {
      patchConfig({ tikfinityEnabled: !!els.toggleTikfinity.checked }).catch(refresh);
    });

    els.toggleCloud.addEventListener('change', function () {
      patchConfig({ cloudEnabled: !!els.toggleCloud.checked }).catch(refresh);
    });

    els.primaryTikfinity.addEventListener('change', function () {
      if (els.primaryTikfinity.checked) patchConfig({ primary: 'tikfinity' }).catch(refresh);
    });

    els.primaryCloud.addEventListener('change', function () {
      if (els.primaryCloud.checked) patchConfig({ primary: 'cloud' }).catch(refresh);
    });

    els.cloudToken.addEventListener('input', function () {
      cloudTokenDirty = true;
    });

    els.toggleTokenBtn.addEventListener('click', function () {
      tokenVisible = !tokenVisible;
      els.cloudToken.type = tokenVisible ? 'text' : 'password';
      els.toggleTokenBtn.textContent = tokenVisible ? 'Hide' : 'Show';
      if (!cloudTokenDirty && config && config.cloudTokenConfigured && tokenVisible) {
        els.cloudToken.value = 'configured';
      }
    });

    els.clearTokenBtn.addEventListener('click', function () {
      cloudTokenDirty = true;
      els.cloudToken.type = 'text';
      els.cloudToken.value = '';
      tokenVisible = true;
      els.toggleTokenBtn.textContent = 'Hide';
    });

    els.saveCloudBtn.addEventListener('click', function () {
      saveCloudSettings().catch(refresh);
    });
  }

  initEvents();
  refresh();
  setInterval(refresh, 6000);
})();
