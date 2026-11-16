(function () {
  'use strict';

  var GAME_CATALOG = {
    wordle: {
      id: 'wordle', completionId: 'wordle-sp', name: 'Wordle', short: 'W', shareMark: '🟩', color: '#6aaa64',
      description: 'Six guesses', frameUrl: '/wordle/solo/?mode=daily&wtDaily3=1',
      dailyUrl: '/game/wordle/api/sp/daily?length=5', dateKey: 'wordle_sp_daily_date',
      statsKey: 'wordle_sp_stats', maxGuesses: 6, scoreStep: 150, scoreFloor: 200
    },
    figural: {
      id: 'figural', completionId: 'figural-sp', name: 'Figural', short: '◆', shareMark: '🔷', color: '#00a7b7',
      description: 'Decode the symbols', frameUrl: '/figural/solo/?mode=daily&wtDaily3=1',
      dailyUrl: '/game/figural/api/sp/daily?length=5', dateKey: 'figural_sp_daily_date',
      statsKey: 'figural_sp_stats', maxGuesses: 8, scoreStep: 110, scoreFloor: 200
    },
    betwixt: {
      id: 'betwixt', completionId: 'betwixt-sp', name: 'Betwixt', short: '↕', shareMark: '🟪', color: '#8b5cf6',
      description: 'Narrow the alphabet', frameUrl: '/betwixt/solo/?mode=daily&wtDaily3=1',
      dailyUrl: '/game/betwixt/api/sp/daily?length=5', dateKey: 'betwixt_sp_daily_date',
      statsKey: 'betwixt_sp_stats', maxGuesses: null, scoreStep: 60, scoreFloor: 100
    },
    unwordle: {
      id: 'unwordle', completionId: 'unwordle-sp', name: 'UnWordle', short: '↻', shareMark: '🟧', color: '#f97316',
      description: 'Reverse the grid', frameUrl: '/unwordle/solo/?mode=daily&wtDaily3=1',
      dailyUrl: '/game/unwordle/api/sp/daily?length=5', dateKey: 'unwordle_sp_daily_date',
      statsKey: 'unwordle_sp_stats', maxGuesses: null, scoreMetric: 'time'
    },
    word500: {
      id: 'word500', completionId: 'word500-sp', name: 'Word5000', short: '5K', shareMark: '🟨', color: '#e5a900',
      description: 'Climb toward the word', frameUrl: '/game/word500/?mode=solo&wtDaily3=1',
      dailyUrl: '/game/word500/api/sp/daily?length=5', dateKey: 'word5000.next.daily',
      statsKey: 'word500.next.stats', maxGuesses: 8, scoreStep: 110, scoreFloor: 200,
      dateValue: 'json'
    },
    pixeletters: {
      id: 'pixeletters', completionId: 'pixeletters-sp', name: 'PixeLetters', short: 'P', shareMark: '🟦', color: '#3b82f6',
      description: 'Reveal the pixels', frameUrl: '/pixeletters/solo/?mode=daily&wtDaily3=1',
      dailyUrl: '/game/pixeletters/api/sp/daily?length=5', dateKey: 'pixeletters_sp_daily_date',
      statsKey: 'pixeletters_sp_stats', maxGuesses: 5, scoreStep: 200, scoreFloor: 200
    },
    subtextle: {
      id: 'subtextle', completionId: 'searchle-sp', name: 'Subtextle', short: 'S', shareMark: '🔍', color: '#4a9eff',
      description: 'Find the secret word', frameUrl: '/game/subtextle/sp.html?mode=daily&wtDaily3=1',
      dailyUrl: '/game/searchle/api/sp/daily', dateKey: 'searchle_sp_daily_date',
      resultKey: 'searchle_sp_daily_result', scoreStep: 45, scoreFloor: 100
    },
    wikicontexto: {
      id: 'wikicontexto', completionId: 'wikisearchle-sp', name: 'WikiContexto', short: 'W', shareMark: '🟣', color: '#8a5cf7',
      description: 'Reveal the article title', frameUrl: '/game/wikisearchle/?mode=daily&wtDaily3=1',
      dailyUrl: '/game/wikisearchle/api/solo/status', stateKey: 'wikisearchle-solo-progress-v1',
      completionReader: 'state', scoreStep: 20, scoreFloor: 100
    },
    wikirectangled: {
      id: 'wikirectangled', name: 'WiKirecTangled', short: 'WR', shareMark: '🌀', color: '#ee7a2c',
      description: 'Clear the daily word grid', frameUrl: '/game/wikirectangled/solo?wtDaily3=1',
      dailyUrl: '/game/wikirectangled/api/daily', completionReader: 'win-card', scoreMetric: 'complete'
    },
    wikiword4x4: {
      id: 'wikiword4x4', name: 'WikiWord 4×4', short: '4×4', shareMark: '🟧', color: '#f28c28',
      description: 'Find one hidden target', frameUrl: '/game/wikirectangled/wikiword-4x4?wtDaily3=1',
      completionReader: 'message', scoreMetric: 'complete'
    }
  };

  // Each slot contains games with a similar pace, so a lineup stays varied
  // even as the pool grows. The slots advance at different rates and produce
  // a 48-day sequence before the full schedule repeats.
  var ROTATION_SLOTS = [
    ['figural', 'subtextle', 'wordle'],
    ['betwixt', 'unwordle', 'wikicontexto'],
    ['wikiword4x4', 'word500', 'pixeletters', 'wikirectangled']
  ];

  function dayNumber(iso) {
    var parts = String(iso || '').split('-').map(Number);
    if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return 0;
    return Math.floor(Date.UTC(parts[0], parts[1] - 1, parts[2]) / 86400000);
  }

  function selectDailyGames(date) {
    var day = dayNumber(date);
    return ROTATION_SLOTS.map(function (slot, index) {
      var period = Math.pow(2, index);
      return GAME_CATALOG[slot[Math.floor(day / period) % slot.length]];
    });
  }

  var GAMES = [];

  var POLL_MS = 500;
  var state = {
    date: edmontonDate(new Date()),
    configs: {},
    progress: null,
    target: null,
    session: null,
    attribution: null,
    challengeTracked: false,
    currentIndex: 0,
    pollTimer: null
  };
  GAMES = selectDailyGames(state.date);

  var el = {};

  function $(id) { return document.getElementById(id); }

  function edmontonDate(value) {
    var date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) return '';
    try {
      var parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit'
      }).formatToParts(date);
      var out = {};
      for (var i = 0; i < parts.length; i++) out[parts[i].type] = parts[i].value;
      return out.year + '-' + out.month + '-' + out.day;
    } catch (_) {
      return date.toISOString().slice(0, 10);
    }
  }

  function prettyDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return 'Today';
    var parts = iso.split('-').map(Number);
    var noon = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 18));
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Edmonton', weekday: 'long', month: 'long', day: 'numeric'
      }).format(noon);
    } catch (_) { return iso; }
  }

  function safeJson(raw, fallback) {
    try { return JSON.parse(raw); } catch (_) { return fallback; }
  }

  function attributionToken(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9._~-]/g, '').slice(0, 64);
  }

  function readAttribution() {
    var params = new URLSearchParams(window.location.search);
    var attribution = {
      source: attributionToken(params.get('utm_source')),
      medium: attributionToken(params.get('utm_medium')),
      campaign: attributionToken(params.get('utm_campaign'))
    };
    if (!attribution.source && params.get('c')) {
      attribution.source = 'daily3_share';
      attribution.medium = 'referral';
      attribution.campaign = 'daily3_challenge';
    }
    if (attribution.source || attribution.medium || attribution.campaign) {
      try { sessionStorage.setItem('wt_daily3_attribution', JSON.stringify(attribution)); } catch (_) {}
      return attribution;
    }
    try {
      return safeJson(sessionStorage.getItem('wt_daily3_attribution'), attribution) || attribution;
    } catch (_) { return attribution; }
  }

  function trackUsage(event, label) {
    var attribution = state.attribution || {};
    try {
      fetch('/api/usage/event', {
        method: 'POST',
        credentials: 'same-origin',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: event,
          page: '/daily',
          label: label || '',
          source: attribution.source || '',
          medium: attribution.medium || '',
          campaign: attribution.campaign || ''
        })
      }).catch(function () {});
    } catch (_) {}
  }

  function ownerKey(user) { return user ? (user.provider || 'discord') + ':' + user.id + ':' + (user.anchorId || user.id) : 'guest'; }
  function ownedKey(game, name) { return 'wt-solo-v1:' + game + ':' + encodeURIComponent(ownerKey(state.session)) + ':' + name; }
  function progressKey() { return ownedKey('daily3', 'wt_daily3_' + state.date); }
  function gameStorageRead(game, name) {
    if (['wordle', 'betwixt', 'figural', 'pixeletters', 'unwordle', 'word500'].indexOf(game.id) !== -1) return localStorage.getItem(ownedKey(game.completionId, name));
    // Old unowned caches cannot prove a signed-in player's result.
    return state.session ? null : localStorage.getItem(name);
  }
  var identityReady = false, identityRequest = null;
  function fetchCurrentSession() {
    return fetch('/api/me/session', { credentials: 'include', cache: 'no-store', signal: AbortSignal.timeout(7000) }).then(function (response) {
      if (!response.ok) throw Error('Session unavailable');
      return response.json();
    }).then(function (data) { return data && data.ok ? data.user : null; });
  }
  function refreshIdentity() {
    if (!identityReady || identityRequest) return identityRequest;
    var expected = ownerKey(state.session);
    identityRequest = fetchCurrentSession().then(function (user) {
      if (expected !== ownerKey(state.session)) return false;
      if (expected !== ownerKey(user)) {
        stopPolling(); el.gameFrame.src = 'about:blank';
        document.body.style.visibility = 'hidden';
        location.reload(); return false;
      }
      return true;
    }).catch(function () { return false; }).finally(function () { identityRequest = null; });
    return identityRequest;
  }

  function emptyProgress() {
    return { version: 2, date: state.date, startedAt: null, completedAt: null, completionTracked: false, results: {} };
  }

  function loadProgress() {
    var saved = safeJson(localStorage.getItem(progressKey()), null);
    if (!saved || saved.date !== state.date || !saved.results) saved = emptyProgress();
    state.progress = saved;
  }

  function saveProgress() {
    try { localStorage.setItem(progressKey(), JSON.stringify(state.progress)); } catch (_) {}
  }

  function scoreResult(game, result) {
    if (!result || result.won === false) return 0;
    if (game.scoreMetric === 'complete') return 1000;
    if (game.scoreMetric === 'time') {
      if (!Number.isFinite(result.seconds)) return 200;
      return Math.max(200, 1000 - (Math.max(0, Math.floor(result.seconds) - 30) * 4));
    }
    if (!Number.isFinite(result.guesses)) return 200;
    var guesses = Math.max(1, Math.floor(result.guesses));
    return Math.max(game.scoreFloor || 200, 1000 - ((guesses - 1) * (game.scoreStep || 200)));
  }

  function totalScore() {
    return GAMES.reduce(function (sum, game) {
      var result = state.progress && state.progress.results[game.id];
      return sum + (result ? Number(result.points) || 0 : 0);
    }, 0);
  }

  function completedCount() {
    return GAMES.filter(function (game) { return !!state.progress.results[game.id]; }).length;
  }

  function findHistoryResult(game) {
    if (game.resultKey) {
      var savedResult = safeJson(gameStorageRead(game, game.resultKey), null);
      if (savedResult && savedResult.date === state.date) {
        return {
          won: savedResult.won !== false,
          guesses: Number.isFinite(Number(savedResult.guesses)) ? Number(savedResult.guesses) : null,
          seconds: Number.isFinite(Number(savedResult.seconds)) ? Number(savedResult.seconds) : null,
          source: 'browser',
          recordedAt: savedResult.recordedAt || new Date().toISOString()
        };
      }
    }
    var stats = safeJson(gameStorageRead(game, game.statsKey), null);
    var history = stats && Array.isArray(stats.history) ? stats.history : [];
    var config = state.configs[game.id] || {};
    var target = String(config.word || '').toUpperCase();
    var sameDay;
    if (game.id === 'word500') {
      sameDay = history.slice().reverse().filter(function (entry) {
        return entry && entry.isDaily === true && String(entry.date || '') === state.date;
      });
    } else {
      sameDay = history.filter(function (entry) {
        return entry && edmontonDate(entry.timestamp) === state.date &&
          (game.id !== 'unwordle' || entry.daily === true);
      });
    }
    var match = null;
    if (target) {
      match = sameDay.find(function (entry) { return String(entry.word || '').toUpperCase() === target; });
    }
    if (!match) match = sameDay[0] || null;
    if (!match) return null;
    var guesses = Number(game.id === 'word500' ? match.guesses : match.guessCount);
    var seconds = Number(match.time);
    return {
      won: game.id === 'unwordle' ? true : match.won !== false,
      guesses: Number.isFinite(guesses) && guesses > 0 ? Math.floor(guesses) : null,
      seconds: Number.isFinite(seconds) && seconds >= 0 ? Math.floor(seconds) : null,
      source: 'browser',
      recordedAt: match.timestamp || new Date().toISOString()
    };
  }

  function readDailyDate(game) {
    if (!game.dateKey) return null;
    var raw = gameStorageRead(game, game.dateKey);
    if (game.dateValue !== 'json') return raw;
    var saved = safeJson(raw, null);
    return saved && saved.date ? String(saved.date) : null;
  }

  function readLocalCompletion(game, allowDatestampFallback) {
    if (game.completionReader === 'state') {
      var config = state.configs[game.id] || {};
      var savedState = safeJson(gameStorageRead(game, game.stateKey), null);
      var setAt = config.setAt || (config.daily && config.daily.setAt);
      if (!savedState || !savedState.won || !setAt || savedState.setAt !== setAt) return null;
      return {
        won: true,
        guesses: Number.isFinite(Number(savedState.guessCount)) ? Number(savedState.guessCount) : null,
        source: 'browser',
        recordedAt: new Date().toISOString()
      };
    }
    if (game.completionReader) return null;
    if (readDailyDate(game) !== state.date) return null;
    return findHistoryResult(game) || (allowDatestampFallback
      ? { won: null, guesses: null, source: 'browser-date', recordedAt: new Date().toISOString() }
      : null);
  }

  function addResult(game, result, options) {
    options = options || {};
    if (!result) return false;
    var normalized = {
      won: result.won === false ? false : (result.won === true ? true : null),
      guesses: Number.isFinite(result.guesses) ? Math.max(1, Math.floor(result.guesses)) : null,
      seconds: Number.isFinite(result.seconds) ? Math.max(0, Math.floor(result.seconds)) : null,
      source: result.source || 'browser',
      recordedAt: result.recordedAt || new Date().toISOString()
    };
    normalized.points = scoreResult(game, normalized);
    state.progress.results[game.id] = normalized;
    if (completedCount() === GAMES.length) state.progress.completedAt = state.progress.completedAt || new Date().toISOString();
    if (options.announce) {
      trackUsage('daily3_game_complete', game.id);
      if (completedCount() === GAMES.length && !state.progress.completionTracked) {
        state.progress.completionTracked = true;
        trackUsage('daily3_complete');
      }
    }
    saveProgress();
    updateHud();
    if (options.announce) showFloorResult(game, normalized);
    return true;
  }

  function hydrateLocalResults() {
    GAMES.forEach(function (game) {
      if (state.progress.results[game.id]) return;
      var local = readLocalCompletion(game, true);
      if (local) addResult(game, local);
    });
  }

  function fetchConfigs(games) {
    return Promise.all(games.map(function (game) {
      if (!game.dailyUrl) return Promise.resolve(null);
      return fetch(game.dailyUrl, { credentials: 'same-origin' })
        .then(function (response) { return response.ok ? response.json() : null; })
        .then(function (config) {
          if (config) state.configs[game.id] = config;
          return config;
        })
        .catch(function () { return null; });
    }));
  }

  function fetchDailyConfigs() {
    return fetchConfigs(GAMES).then(function (configs) {
      var dates = configs.filter(Boolean).map(function (config) {
        return config.date || config.puzzleDate || config.dateKey || (config.daily && config.daily.dateKey);
      }).filter(Boolean);
      if (!dates.length || dates[0] === state.date) return configs;
      state.date = dates[0];
      GAMES = selectDailyGames(state.date);
      return fetchConfigs(GAMES);
    });
  }

  function fetchSessionAndServerResults() {
    var expectedOwner = ownerKey(state.session);
    return Promise.resolve().then(function () {
        updateSaveCard();
        if (!state.session) return null;
        return Promise.all(GAMES.filter(function (game) { return !!game.completionId; }).map(function (game) {
          return fetch('/api/sp-daily/status/' + encodeURIComponent(game.completionId), { credentials: 'include', headers: { 'x-solo-session-context': JSON.stringify({ id: String(state.session.id), provider: state.session.provider || 'discord', anchorId: String(state.session.anchorId || state.session.id) }) } })
            .then(function (response) { return response.ok ? response.json() : null; })
            .then(function (status) {
              if (expectedOwner !== ownerKey(state.session)) return;
              if (!status || !Array.isArray(status.completedDates) || status.completedDates.indexOf(state.date) === -1) return;
              if (state.progress.results[game.id]) return;
              var local = readLocalCompletion(game, true);
              addResult(game, local || { won: null, guesses: null, source: 'account' });
            })
            .catch(function () {});
        }));
      })
      .catch(function () { updateSaveCard(); });
  }

  function encodePayload(value) {
    try {
      var bytes = new TextEncoder().encode(JSON.stringify(value));
      var binary = '';
      for (var i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
    } catch (_) { return ''; }
  }

  function decodePayload(raw) {
    try {
      var padded = String(raw || '').replace(/-/g, '+').replace(/_/g, '/');
      while (padded.length % 4) padded += '=';
      var binary = atob(padded);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var value = JSON.parse(new TextDecoder().decode(bytes));
      if (!value || value.v !== 1 || value.d !== state.date) return null;
      var score = Number(value.s);
      if (!Number.isFinite(score) || score < 0 || score > 3000) return null;
      return { date: value.d, score: Math.floor(score) };
    } catch (_) { return null; }
  }

  function parseTarget() {
    var raw = new URLSearchParams(window.location.search).get('c');
    state.target = raw ? decodePayload(raw) : null;
    if (!state.target) return;
    if (!state.challengeTracked) {
      state.challengeTracked = true;
      trackUsage('daily3_challenge_view');
    }
    el.targetCard.hidden = false;
    el.targetScore.textContent = state.target.score.toLocaleString();
    el.targetCopy.textContent = 'A player challenged you to beat their tower';
  }

  function formatResult(game, result) {
    if (!result) return 'Not played';
    if (result.source === 'account' && !Number.isFinite(result.guesses)) return 'Completed earlier';
    if (result.won === false) return game.maxGuesses ? 'Not solved (' + game.maxGuesses + '/' + game.maxGuesses + ')' : 'Not solved';
    if (game.scoreMetric === 'time' && Number.isFinite(result.seconds)) return 'Solved in ' + formatDuration(result.seconds);
    if (!Number.isFinite(result.guesses)) return 'Completed';
    if (game.maxGuesses) return result.guesses + '/' + game.maxGuesses + ' guesses';
    return result.guesses + (result.guesses === 1 ? ' guess' : ' guesses');
  }

  function formatDuration(seconds) {
    var total = Math.max(0, Math.floor(Number(seconds) || 0));
    var mins = Math.floor(total / 60);
    var secs = total % 60;
    return mins ? mins + 'm ' + String(secs).padStart(2, '0') + 's' : secs + 's';
  }

  function firstIncompleteIndex() {
    for (var i = 0; i < GAMES.length; i++) {
      if (!state.progress.results[GAMES[i].id]) return i;
    }
    return -1;
  }

  function renderIntro() {
    el.dailyDate.textContent = prettyDate(state.date);
    parseTarget();
    renderLineup();
    var done = completedCount();
    el.startButton.disabled = false;
    if (done === GAMES.length) el.startButton.textContent = 'See today\'s result →';
    else if (done > 0) el.startButton.textContent = 'Resume — ' + done + ' of ' + GAMES.length + ' complete →';
    else el.startButton.textContent = 'Start today\'s challenge →';
  }

  function renderLineup() {
    el.gameLineup.innerHTML = '';
    GAMES.forEach(function (game, index) {
      var item = document.createElement('li');
      item.style.setProperty('--game', game.color);
      var num = document.createElement('span');
      num.className = 'lineup-num';
      num.textContent = String(index + 1);
      var icon = document.createElement('span');
      icon.className = 'lineup-icon';
      icon.textContent = game.short;
      var copy = document.createElement('span');
      var name = document.createElement('b');
      name.textContent = game.name;
      var description = document.createElement('small');
      description.textContent = game.description;
      copy.appendChild(name);
      copy.appendChild(description);
      item.appendChild(num);
      item.appendChild(icon);
      item.appendChild(copy);
      el.gameLineup.appendChild(item);
    });
  }

  function buildHudProgress() {
    el.hudProgress.innerHTML = '';
    GAMES.forEach(function (game, index) {
      var item = document.createElement('li');
      item.textContent = state.progress.results[game.id] ? '✓' : String(index + 1);
      if (state.progress.results[game.id]) item.classList.add('done');
      if (index === state.currentIndex) item.classList.add('active');
      item.setAttribute('aria-label', game.name + (state.progress.results[game.id] ? ' complete' : ' not complete'));
      el.hudProgress.appendChild(item);
    });
  }

  function updateHud() {
    if (!state.progress) return;
    var game = GAMES[state.currentIndex];
    if (game) {
      el.hudFloor.textContent = 'Floor ' + (state.currentIndex + 1) + ' of ' + GAMES.length;
      el.hudGame.textContent = game.name;
    }
    el.hudScore.textContent = totalScore().toLocaleString();
    buildHudProgress();
  }

  function showScreen(name) {
    el.introScreen.hidden = name !== 'intro';
    el.playScreen.hidden = name !== 'play';
    el.resultsScreen.hidden = name !== 'results';
    if (name !== 'play') stopPolling();
    window.scrollTo(0, 0);
  }

  function startChallenge() {
    if (completedCount() === GAMES.length) return showResults();
    var firstStart = !state.progress.startedAt;
    state.progress.startedAt = state.progress.startedAt || new Date().toISOString();
    saveProgress();
    if (firstStart) trackUsage('daily3_start');
    var next = firstIncompleteIndex();
    loadGame(next < 0 ? 0 : next);
  }

  function loadGame(index) {
    stopPolling();
    state.currentIndex = index;
    el.floorResult.hidden = true;
    el.gameLoading.hidden = false;
    showScreen('play');
    updateHud();
    var game = GAMES[index];
    prepareLaunchPreference(game);
    el.gameFrame.title = game.name + ' daily puzzle';
    el.gameFrame.onload = function () {
      prepareGameFrame();
      restoreLaunchPreference();
      el.gameLoading.hidden = true;
      startPolling();
    };
    el.gameFrame.onerror = restoreLaunchPreference;
    el.gameFrame.src = game.frameUrl;
  }

  function prepareLaunchPreference(game) {
    restoreLaunchPreference();
    if (game.id !== 'word500') return;
    var key = 'w5k_solo_word_len';
    var previous = localStorage.getItem(key);
    state.restorePreference = function () {
      try {
        if (previous === null) localStorage.removeItem(key);
        else localStorage.setItem(key, previous);
      } catch (_) {}
    };
    try { localStorage.setItem(key, '5'); } catch (_) {}
  }

  function restoreLaunchPreference() {
    if (!state.restorePreference) return;
    var restore = state.restorePreference;
    state.restorePreference = null;
    restore();
  }

  // Challenge mode is intentionally guest-first. Suppress the individual
  // games' repeated login nudge inside the iframe and lock the 5-letter daily
  // length so a stray tap cannot switch the player into practice mode.
  function prepareGameFrame() {
    try {
      var doc = el.gameFrame.contentDocument;
      if (!doc || !doc.head) return;
      var style = doc.createElement('style');
      style.setAttribute('data-wt-daily3', '');
      style.textContent = '#login-banner,.lp-backdrop{display:none!important}body.lp-modal-open{overflow:auto!important}' +
        '#word-size-toggle,#difficulty-toggle,#len-btn,#sp-difficulty-toggle,.mode-bar{pointer-events:none!important;opacity:.82}';
      doc.head.appendChild(style);
      ['word-size-toggle', 'difficulty-toggle', 'len-btn'].forEach(function (id) {
        var toggle = doc.getElementById(id);
        if (!toggle) return;
        toggle.setAttribute('aria-disabled', 'true');
        toggle.setAttribute('title', 'Daily 3 uses today\'s standard daily puzzle');
      });
    } catch (_) { /* same-origin in production; fail open in unusual previews */ }
  }

  function startPolling() {
    stopPolling();
    state.pollTimer = window.setInterval(checkCurrentGame, POLL_MS);
    checkCurrentGame();
  }

  function stopPolling() {
    if (state.pollTimer) window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }

  function checkCurrentGame() {
    var game = GAMES[state.currentIndex];
    if (!game || state.progress.results[game.id]) return;
    var result = readLocalCompletion(game, false) || readFrameCompletion(game);
    if (!result) return;
    stopPolling();
    window.setTimeout(function () { addResult(game, result, { announce: true }); }, 650);
  }

  function readFrameCompletion(game) {
    if (game.completionReader !== 'win-card') return null;
    try {
      var doc = el.gameFrame.contentDocument;
      var card = doc && doc.getElementById('wt-win-card');
      if (!card || card.style.display === 'none' || card.classList.contains('hide')) return null;
      var guessesEl = card.querySelector('.wc-chip.guesses');
      var match = guessesEl && String(guessesEl.textContent || '').match(/\d+/);
      return {
        won: true,
        guesses: match ? Number(match[0]) : null,
        source: 'frame',
        recordedAt: new Date().toISOString()
      };
    } catch (_) { return null; }
  }

  function handleGameMessage(event) {
    if (event.origin !== window.location.origin) return;
    var data = event.data;
    if (!data || data.type !== 'wt-daily3-complete') return;
    var game = GAMES[state.currentIndex];
    if (!game || data.gameId !== game.id || state.progress.results[game.id]) return;
    stopPolling();
    window.setTimeout(function () {
      addResult(game, {
        won: data.won !== false,
        guesses: Number.isFinite(Number(data.guesses)) ? Number(data.guesses) : null,
        seconds: Number.isFinite(Number(data.seconds)) ? Number(data.seconds) : null,
        source: 'game',
        recordedAt: new Date().toISOString()
      }, { announce: true });
    }, 450);
  }

  function showFloorResult(game, result) {
    el.floorStamp.textContent = result.won === false ? 'FLOOR FINISHED' : 'FLOOR CLEARED';
    el.floorResultIcon.textContent = result.won === false ? '↗' : game.short;
    el.floorResultIcon.style.background = result.won === false ? '#d7dde8' : game.color;
    el.floorResultIcon.style.color = result.won === false ? '#1b1430' : '#fff';
    el.floorResultTitle.textContent = game.name + ' complete';
    el.floorResultDetail.textContent = formatResult(game, result);
    el.floorPoints.textContent = '+' + result.points.toLocaleString();
    el.nextButton.textContent = completedCount() === GAMES.length ? 'See my Daily 3 score →' : 'Next floor →';
    el.floorResult.hidden = false;
    el.nextButton.focus();
  }

  function continueChallenge() {
    el.floorResult.hidden = true;
    if (completedCount() === GAMES.length) return showResults();
    var next = firstIncompleteIndex();
    loadGame(next);
  }

  function resultRow(game, result) {
    var row = document.createElement('div');
    row.className = 'result-row';
    var icon = document.createElement('span');
    icon.className = 'result-row-icon';
    icon.style.setProperty('--game', game.color);
    icon.textContent = game.short;
    var copy = document.createElement('span');
    var name = document.createElement('b');
    name.textContent = game.name;
    var detail = document.createElement('small');
    detail.textContent = formatResult(game, result);
    copy.appendChild(name);
    copy.appendChild(detail);
    var points = document.createElement('span');
    points.className = 'result-row-points';
    points.textContent = (result.points || 0).toLocaleString();
    row.appendChild(icon);
    row.appendChild(copy);
    row.appendChild(points);
    return row;
  }

  function showResults() {
    if (completedCount() !== GAMES.length) return startChallenge();
    showScreen('results');
    var total = totalScore();
    el.totalScore.textContent = total.toLocaleString();
    el.resultsDate.textContent = prettyDate(state.date);
    el.resultRows.innerHTML = '';
    GAMES.forEach(function (game) { el.resultRows.appendChild(resultRow(game, state.progress.results[game.id])); });

    if (state.target) {
      var diff = total - state.target.score;
      el.targetVerdict.hidden = false;
      el.targetVerdict.classList.toggle('beat', diff > 0);
      if (diff > 0) el.targetVerdict.textContent = 'You beat the challenge by ' + diff.toLocaleString() + ' points!';
      else if (diff === 0) el.targetVerdict.textContent = 'Exact tie — ' + total.toLocaleString() + ' points each.';
      else el.targetVerdict.textContent = Math.abs(diff).toLocaleString() + ' points short of the challenge score.';
    } else {
      el.targetVerdict.hidden = true;
    }
    updateSaveCard();
  }

  function challengeUrl() {
    var payload = encodePayload({ v: 1, d: state.date, s: totalScore() });
    var url = new URL('/daily', window.location.origin);
    url.searchParams.set('c', payload);
    url.searchParams.set('utm_source', 'daily3_share');
    url.searchParams.set('utm_medium', 'referral');
    url.searchParams.set('utm_campaign', 'daily3_challenge');
    return url.toString();
  }

  function shareText() {
    var lines = ['WORD TYCOON DAILY 3 · ' + state.date, ''];
    GAMES.forEach(function (game) {
      var result = state.progress.results[game.id];
      var mark = result.won === false ? '⬜' : game.shareMark;
      lines.push(mark + ' ' + game.name + ' — ' + formatResult(game, result) + ' · ' + result.points + ' pts');
    });
    lines.push('', '🏢 ' + totalScore().toLocaleString() + ' / 3,000', 'Can you beat my tower?');
    return lines.join('\n');
  }

  function copyResult() {
    var value = shareText() + '\n' + challengeUrl();
    var copied = navigator.clipboard && navigator.clipboard.writeText
      ? navigator.clipboard.writeText(value)
      : Promise.reject(new Error('clipboard unavailable'));
    copied.then(function () {
      trackUsage('daily3_share', 'copy');
      el.copyStatus.textContent = 'Challenge copied — send it to someone competitive.';
    }).catch(function () {
      try { window.prompt('Copy your challenge:', value); } catch (_) {}
      trackUsage('daily3_share', 'copy');
      el.copyStatus.textContent = 'Your challenge is ready to copy.';
    });
  }

  function shareResult() {
    if (!navigator.share) return copyResult();
    navigator.share({
      title: 'Word Tycoon Daily 3',
      text: shareText(),
      url: challengeUrl()
    }).then(function () {
      trackUsage('daily3_share', 'native');
      el.copyStatus.textContent = 'Challenge sent. The tower awaits.';
    }).catch(function (error) {
      if (error && error.name !== 'AbortError') copyResult();
    });
  }

  function updateSaveCard() {
    if (!el.saveCard) return;
    if (state.session) {
      el.saveCard.querySelector('span').textContent = 'Your Daily 3 is saved in this browser; your game XP is on your account.';
      el.saveLink.textContent = 'View my profile';
      el.saveLink.href = '/profile';
    } else {
      var returnTo = window.location.pathname + window.location.search;
      el.saveCard.querySelector('span').textContent = 'Sign in to keep game XP, cosmetics, and account streaks.';
      el.saveLink.textContent = 'Continue with Google';
      el.saveLink.href = '/auth/google?returnTo=' + encodeURIComponent(returnTo);
    }
  }

  function cacheElements() {
    el.dailyDate = $('daily-date');
    el.introScreen = $('intro-screen');
    el.playScreen = $('play-screen');
    el.resultsScreen = $('results-screen');
    el.targetCard = $('target-card');
    el.targetScore = $('target-score');
    el.targetCopy = $('target-copy');
    el.startButton = $('start-button');
    el.gameLineup = $('game-lineup');
    el.hudHome = $('hud-home');
    el.hudFloor = $('hud-floor');
    el.hudGame = $('hud-game');
    el.hudProgress = $('hud-progress');
    el.hudScore = $('hud-score');
    el.gameLoading = $('game-loading');
    el.gameFrame = $('game-frame');
    el.floorResult = $('floor-result');
    el.floorStamp = $('floor-stamp');
    el.floorResultIcon = $('floor-result-icon');
    el.floorResultTitle = $('floor-result-title');
    el.floorResultDetail = $('floor-result-detail');
    el.floorPoints = $('floor-points');
    el.nextButton = $('next-button');
    el.resultsDate = $('results-date');
    el.totalScore = $('total-score');
    el.targetVerdict = $('target-verdict');
    el.resultRows = $('result-rows');
    el.shareButton = $('share-button');
    el.copyButton = $('copy-button');
    el.copyStatus = $('copy-status');
    el.saveCard = $('save-card');
    el.saveLink = $('save-link');
  }

  function bindEvents() {
    el.startButton.addEventListener('click', startChallenge);
    el.hudHome.addEventListener('click', function () { showScreen('intro'); renderIntro(); });
    el.nextButton.addEventListener('click', continueChallenge);
    el.shareButton.addEventListener('click', shareResult);
    el.copyButton.addEventListener('click', copyResult);
    el.saveLink.addEventListener('click', function () {
      if (!state.session) trackUsage('daily3_sign_in', 'google');
    });
    window.addEventListener('storage', checkCurrentGame);
    window.addEventListener('message', handleGameMessage);
    window.addEventListener('pagehide', stopPolling);
    window.addEventListener('focus', refreshIdentity);
    window.addEventListener('online', refreshIdentity);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) refreshIdentity(); });
  }

  function init() {
    cacheElements();
    state.attribution = readAttribution();
    bindEvents();
    fetchCurrentSession().then(function (user) { state.session = user; identityReady = true; return fetchDailyConfigs(); }).then(function () {
      loadProgress();
      hydrateLocalResults();
      renderIntro();
      return fetchSessionAndServerResults();
    }).then(function () {
      renderIntro();
    }).catch(function () {
      identityReady = true;
      loadProgress();
      hydrateLocalResults();
      renderIntro();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
