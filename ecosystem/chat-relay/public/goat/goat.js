(function initGoatLeaderboard() {
  const PAGE_SIZE = 20;
  const GAME_LABELS = {
    word5000: 'Word 5000',
    color500: 'Colour 500',
    subtextle: 'Subtextle',
    wikicontexto: 'WikiSearchle',
    rectangled: 'recTangled',
    erectangled: 'erecTangled',
    betwixt: 'Betwixt',
    spellingbee: 'Spell Bee',
    wordle: 'Wordle',
    figural: 'Figural',
    pixeletters: 'PixeLetters',
    triangled: 'Triangled',
    unwordle: 'Unwordle',
    wikirectangled: 'WiKirecTangled',
    synapse: 'Synapse',
    'synapse-mp': 'Synapse MP',
    junkdrawer: 'Junk Drawer',
    cloudquarry: 'Cloud Quarry',
    letterworks: 'Letterworks',
    wordfall: 'Wordfall'
  };
  const ELO_GAMES = ['subtextle', 'wikicontexto', 'rectangled', 'erectangled'];
  const COUNTRY_FLAGS = {
    US: '🇺🇸', CA: '🇨🇦', MX: '🇲🇽', GB: '🇬🇧', DE: '🇩🇪', FR: '🇫🇷',
    SE: '🇸🇪', NL: '🇳🇱', ES: '🇪🇸', IT: '🇮🇹', PL: '🇵🇱', JP: '🇯🇵',
    KR: '🇰🇷', AU: '🇦🇺', NZ: '🇳🇿', CN: '🇨🇳', TW: '🇹🇼', SG: '🇸🇬',
    IN: '🇮🇳', BR: '🇧🇷'
  };

  const state = {
    page: 1,
    ranking: 'elo',
    game: 'subtextle',
    direction: 'desc',
    region: 'GLOBAL',
    search: '',
    players: [],
    pagination: null,
    summary: null,
    controller: null,
    hasLoaded: false
  };

  const elements = {};

  function escapeHtml(value) {
    const div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString('en-US');
  }

  function formatCompact(value) {
    const number = Number(value || 0);
    if (number >= 1e9) return `${(number / 1e9).toFixed(1).replace(/\.0$/, '')}B`;
    if (number >= 1e6) return `${(number / 1e6).toFixed(1).replace(/\.0$/, '')}M`;
    if (number >= 1e3) return `${(number / 1e3).toFixed(1).replace(/\.0$/, '')}K`;
    return formatNumber(number);
  }

  function eloTier(elo) {
    const rating = Number(elo || 0);
    if (rating >= 2400) return { label: 'Grandmaster', className: 'tier-gm' };
    if (rating >= 2200) return { label: 'Master', className: 'tier-master' };
    if (rating >= 2000) return { label: 'Candidate Master', className: 'tier-cm' };
    if (rating >= 1800) return { label: 'Expert', className: 'tier-expert' };
    if (rating >= 1600) return { label: 'Class A', className: 'tier-a' };
    if (rating >= 1400) return { label: 'Class B', className: 'tier-b' };
    if (rating >= 1200) return { label: 'Class C', className: 'tier-c' };
    if (rating >= 1000) return { label: 'Class D', className: 'tier-d' };
    return { label: 'Novice', className: 'tier-novice' };
  }

  function activeApiSort() {
    if (state.ranking === 'game_elo') return `elo:${state.game}`;
    if (state.ranking === 'game_wins') return state.game;
    return state.ranking;
  }

  function metricFor(player) {
    switch (state.ranking) {
      case 'elo': {
        const value = Number(player.elo || 0);
        return { value, display: formatNumber(value), label: 'ELO', tier: eloTier(value) };
      }
      case 'coins':
        return { value: player.xp || 0, display: formatCompact(player.xp), label: 'XP' };
      case 'total_game_wins':
        return { value: player.totalGameWins || 0, display: formatNumber(player.totalGameWins), label: 'wins' };
      case 'total_taps':
        return { value: player.totalTaps || 0, display: formatCompact(player.totalTaps), label: 'taps' };
      case 'library_words':
        return { value: player.libraryWords || 0, display: formatNumber(player.libraryWords), label: 'words' };
      case 'streak':
        return { value: player.currentStreak || 0, display: formatNumber(player.currentStreak), label: 'day streak' };
      case 'longest_streak':
        return { value: player.longestStreak || 0, display: formatNumber(player.longestStreak), label: 'best streak' };
      case 'game_elo': {
        const value = Number(player.gameElos?.[state.game] || 0);
        return { value, display: formatNumber(value), label: 'ELO', tier: eloTier(value) };
      }
      case 'game_wins': {
        const value = Number(player.gameWins?.[state.game] || 0);
        return { value, display: formatNumber(value), label: 'wins' };
      }
      default:
        return { value: 0, display: '0', label: '' };
    }
  }

  function metricHeading() {
    if (state.ranking === 'game_elo') return `${GAME_LABELS[state.game]} ELO`;
    if (state.ranking === 'game_wins') return `${GAME_LABELS[state.game]} wins`;
    return {
      elo: 'Overall ELO',
      coins: 'XP',
      total_game_wins: 'Total wins',
      total_taps: 'Taps',
      library_words: 'Library words',
      streak: 'Current streak',
      longest_streak: 'Best streak'
    }[state.ranking] || 'Score';
  }

  function secondaryMetricFor(player) {
    if (state.ranking === 'elo' || state.ranking === 'game_elo') {
      return { display: formatCompact(player.xp), label: 'XP' };
    }
    const elo = Number(player.elo || 0);
    return { display: elo > 0 ? formatNumber(elo) : '—', label: 'ELO' };
  }

  function secondaryHeading() {
    return state.ranking === 'elo' || state.ranking === 'game_elo' ? 'XP' : 'Overall ELO';
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase() || '?';
  }

  function avatarHtml(player, sizeClass = '') {
    const label = initials(player.displayName);
    if (!player.profilePic) return `<span class="player-avatar ${sizeClass}" aria-hidden="true">${escapeHtml(label)}</span>`;
    return `<span class="player-avatar ${sizeClass}" data-fallback="${escapeHtml(label)}"><img src="${escapeHtml(player.profilePic)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.parentElement.textContent=this.parentElement.dataset.fallback"></span>`;
  }

  function providerLabel(platform) {
    const labels = { discord: 'Discord', tiktok: 'TikTok', web: 'Web', mobile: 'Mobile', youtube: 'YouTube' };
    return labels[String(platform || '').toLowerCase()] || 'Player';
  }

  function playerSubtitle(player) {
    const parts = [providerLabel(player.platform)];
    if (player.country) parts.push(`${COUNTRY_FLAGS[player.country] || '🌍'} ${player.country}`);
    if (player.currentStreak > 0) parts.push(`${player.currentStreak}d streak`);
    return parts.join(' · ');
  }

  function podiumHtml(player, index) {
    const metric = metricFor(player);
    const tier = metric.tier ? `<span class="metric-tier ${metric.tier.className}">${metric.tier.label}</span>` : '';
    return `
      <button type="button" class="podium-card podium-${index + 1}" data-player-index="${index}" aria-expanded="false">
        <span class="podium-rank" aria-label="Rank ${player.rank}">${player.rank}</span>
        ${avatarHtml(player, 'avatar-large')}
        <span class="podium-copy">
          <strong>${escapeHtml(player.displayName)}</strong>
          <small>${escapeHtml(playerSubtitle(player))}</small>
        </span>
        <span class="podium-score"><strong>${metric.display}</strong><small>${escapeHtml(metric.label)}</small>${tier}</span>
      </button>`;
  }

  function rowHtml(player, index) {
    const metric = metricFor(player);
    const secondaryMetric = secondaryMetricFor(player);
    const tier = metric.tier ? `<span class="metric-tier ${metric.tier.className}">${metric.tier.label}</span>` : `<span>${escapeHtml(metric.label)}</span>`;
    return `
      <button type="button" class="leaderboard-row" data-player-index="${index}" aria-expanded="false">
        <span class="row-rank ${player.rank <= 3 ? `rank-${player.rank}` : ''}">#${player.rank}</span>
        <span class="row-player">
          ${avatarHtml(player)}
          <span class="row-player-copy"><strong>${escapeHtml(player.displayName)}</strong><small>${escapeHtml(playerSubtitle(player))}</small></span>
        </span>
        <span class="row-metric"><strong>${metric.display}</strong>${tier}</span>
        <span class="row-secondary"><strong>${secondaryMetric.display}</strong><span>${secondaryMetric.label}</span></span>
        <span class="row-secondary"><strong>${formatNumber(player.totalGameWins)}</strong><span>wins</span></span>
        <span class="row-secondary"><strong>${formatNumber(player.currentStreak)}</strong><span>day streak</span></span>
        <span class="row-chevron" aria-hidden="true">⌄</span>
      </button>`;
  }

  function playerDetailHtml(player) {
    const topWins = Object.entries(player.gameWins || {})
      .filter(([, wins]) => Number(wins) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 4);
    const eloEntries = Object.entries(player.gameElos || {})
      .filter(([, elo]) => Number(elo) > 0)
      .sort((a, b) => Number(b[1]) - Number(a[1]))
      .slice(0, 4);
    const cosmetics = (player.equippedCosmetics || []).slice(0, 6);
    const memberSince = player.memberSince
      ? new Date(`${player.memberSince}T00:00:00`).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
      : 'Unknown';

    const winHtml = topWins.length
      ? topWins.map(([game, wins]) => `<span class="detail-stat"><strong>${formatNumber(wins)}</strong>${escapeHtml(GAME_LABELS[game] || game)}</span>`).join('')
      : '<span class="detail-empty">No recorded game wins yet.</span>';
    const eloHtml = eloEntries.length
      ? eloEntries.map(([game, elo]) => `<span class="detail-stat"><strong>${formatNumber(elo)}</strong>${escapeHtml(GAME_LABELS[game] || game)} ELO</span>`).join('')
      : '<span class="detail-empty">No game-specific ELO yet.</span>';
    const cosmeticHtml = cosmetics.length
      ? cosmetics.map(item => `<span class="cosmetic-tag rarity-${escapeHtml(item.rarity || 'common')}">${escapeHtml(item.name)}</span>`).join('')
      : '<span class="detail-empty">No equipped cosmetics.</span>';

    return `
      <div class="player-detail" role="region" aria-label="${escapeHtml(player.displayName)} details">
        <section><h3>Top game wins</h3><div class="detail-stats">${winHtml}</div></section>
        <section><h3>Game ratings</h3><div class="detail-stats">${eloHtml}</div></section>
        <section><h3>Player record</h3><div class="record-grid">
          <span><strong>${formatNumber(player.libraryWords)}</strong>library words</span>
          <span><strong>${formatCompact(player.totalTaps)}</strong>taps</span>
          <span><strong>${formatNumber(player.longestStreak)}</strong>best streak</span>
          <span><strong>${escapeHtml(memberSince)}</strong>member since</span>
        </div><div class="cosmetic-list">${cosmeticHtml}</div></section>
      </div>`;
  }

  function renderSkeleton() {
    elements.board.classList.add('is-loading');
    elements.playerList.innerHTML = Array.from({ length: 6 }, (_, index) => `
      <div class="leaderboard-row skeleton-row" aria-hidden="true">
        <span class="skeleton skeleton-rank"></span><span class="skeleton skeleton-player"></span>
        <span class="skeleton skeleton-score"></span><span class="skeleton skeleton-small"></span>
        <span class="skeleton skeleton-small"></span><span class="skeleton skeleton-small"></span>
      </div>`).join('');
  }

  function renderEmpty() {
    elements.podium.hidden = true;
    elements.boardHead.hidden = true;
    elements.playerList.innerHTML = `
      <div class="empty-state">
        <span class="empty-icon" aria-hidden="true">🔎</span>
        <h2>No players found</h2>
        <p>Try a different name, region, or ranking.</p>
        <button type="button" id="clear-filters" class="secondary-button">Clear filters</button>
      </div>`;
    elements.pagination.hidden = true;
    const clear = document.getElementById('clear-filters');
    if (clear) clear.addEventListener('click', resetFilters);
  }

  function renderError(message) {
    elements.board.classList.remove('is-loading');
    elements.podium.hidden = true;
    elements.boardHead.hidden = true;
    elements.playerList.innerHTML = `
      <div class="empty-state error-state" role="alert">
        <span class="empty-icon" aria-hidden="true">⚠️</span>
        <h2>Leaderboard unavailable</h2>
        <p>${escapeHtml(message)}</p>
        <button type="button" id="retry-load" class="secondary-button">Try again</button>
      </div>`;
    elements.pagination.hidden = true;
    const retry = document.getElementById('retry-load');
    if (retry) retry.addEventListener('click', () => loadPage(state.page, { force: true }));
  }

  function renderPagination() {
    const pagination = state.pagination;
    if (!pagination || pagination.pages <= 1) {
      elements.pagination.hidden = true;
      return;
    }
    elements.pagination.hidden = false;
    const visible = new Set([1, pagination.pages]);
    for (let page = Math.max(1, pagination.page - 2); page <= Math.min(pagination.pages, pagination.page + 2); page++) visible.add(page);
    let previous = 0;
    const buttons = [];
    for (const page of [...visible].sort((a, b) => a - b)) {
      if (page - previous > 1) buttons.push('<span class="page-gap" aria-hidden="true">…</span>');
      buttons.push(`<button type="button" class="page-button" data-page="${page}" ${page === pagination.page ? 'aria-current="page"' : ''}>${page}</button>`);
      previous = page;
    }
    elements.pageControls.innerHTML = `
      <button type="button" class="page-button page-arrow" data-page="${pagination.page - 1}" ${pagination.page <= 1 ? 'disabled' : ''} aria-label="Previous page">‹</button>
      ${buttons.join('')}
      <button type="button" class="page-button page-arrow" data-page="${pagination.page + 1}" ${pagination.page >= pagination.pages ? 'disabled' : ''} aria-label="Next page">›</button>`;
  }

  function renderResults() {
    const players = state.players;
    elements.board.classList.remove('is-loading');
    elements.boardHead.hidden = false;
    elements.metricHeading.textContent = metricHeading();
    elements.secondaryHeading.textContent = secondaryHeading();
    elements.liveMetric.textContent = metricHeading();

    if (!players.length) {
      renderEmpty();
      updateResultSummary();
      return;
    }

    const showPodium = state.page === 1 && !state.search && players.length >= 3;
    elements.podium.hidden = !showPodium;
    elements.podiumDetail.hidden = true;
    elements.podiumDetail.innerHTML = '';
    if (showPodium) elements.podiumCards.innerHTML = players.slice(0, 3).map(podiumHtml).join('');

    const listPlayers = showPodium ? players.slice(3) : players;
    const startIndex = showPodium ? 3 : 0;
    elements.playerList.innerHTML = listPlayers.map((player, index) => rowHtml(player, startIndex + index)).join('');
    renderPagination();
    updateResultSummary();
  }

  function updateResultSummary() {
    const pagination = state.pagination;
    if (!pagination || pagination.total === 0) {
      elements.resultSummary.textContent = 'No matching players';
      elements.rankedCount.textContent = '0 ranked';
      return;
    }
    const from = (pagination.page - 1) * pagination.limit + 1;
    const to = Math.min(pagination.page * pagination.limit, pagination.total);
    elements.resultSummary.textContent = `Showing ${formatNumber(from)}–${formatNumber(to)} of ${formatNumber(pagination.total)} players`;
    elements.rankedCount.textContent = `${formatNumber(pagination.total)} ranked`;
  }

  function setBusy(busy) {
    elements.board.setAttribute('aria-busy', String(busy));
    elements.refreshButton.disabled = busy;
    elements.refreshButton.classList.toggle('is-spinning', busy);
  }

  async function loadPage(page, { force = false, scroll = false } = {}) {
    state.page = Math.max(1, Number(page) || 1);
    if (state.controller) state.controller.abort();
    const controller = new AbortController();
    state.controller = controller;
    if (force) window.__GOAT_API.clearCache();
    if (!state.hasLoaded) renderSkeleton();
    setBusy(true);
    elements.status.textContent = 'Loading leaderboard';

    try {
      const data = await window.__GOAT_API.publicLeaderboard({
        page: state.page,
        limit: PAGE_SIZE,
        sort: activeApiSort(),
        direction: state.direction,
        search: state.search,
        region: state.region,
        signal: controller.signal
      });
      state.players = data.players;
      state.pagination = data.pagination;
      state.summary = data.summary;
      state.page = data.pagination.page;
      state.hasLoaded = true;
      renderResults();
      syncUrl();
      elements.status.textContent = `${formatNumber(data.pagination.total)} ${data.pagination.total === 1 ? 'player' : 'players'} loaded`;
      if (scroll) document.querySelector('.leaderboard-board')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      document.dispatchEvent(new CustomEvent('goat:ready'));
    } catch (error) {
      if (error.name === 'AbortError') return;
      renderError(error.message || 'Please try again.');
      elements.status.textContent = 'Leaderboard failed to load';
    } finally {
      if (state.controller === controller) setBusy(false);
    }
  }

  function syncUrl() {
    const params = new URLSearchParams();
    if (state.page > 1) params.set('page', String(state.page));
    if (state.ranking !== 'elo') params.set('rank', state.ranking);
    if ((state.ranking === 'game_elo' || state.ranking === 'game_wins') && state.game) params.set('game', state.game);
    if (state.direction !== 'desc') params.set('direction', state.direction);
    if (state.region !== 'GLOBAL') params.set('region', state.region);
    if (state.search) params.set('q', state.search);
    const query = params.toString();
    history.replaceState(null, '', `${location.pathname}${query ? `?${query}` : ''}`);
  }

  function hydrateFromUrl() {
    const params = new URLSearchParams(location.search);
    const ranking = params.get('rank');
    const rankingValues = [...elements.rankingSelect.options].map(option => option.value);
    if (rankingValues.includes(ranking)) state.ranking = ranking;
    const game = params.get('game');
    if (game && GAME_LABELS[game]) state.game = game;
    if (params.get('direction') === 'asc') state.direction = 'asc';
    if (['NA', 'EU', 'APAC'].includes(params.get('region'))) state.region = params.get('region');
    state.search = String(params.get('q') || '').slice(0, 80);
    state.page = Math.max(1, parseInt(params.get('page'), 10) || 1);
  }

  function syncGameOptions() {
    const gameSpecific = state.ranking === 'game_elo' || state.ranking === 'game_wins';
    elements.gameField.hidden = !gameSpecific;
    if (!gameSpecific) return;
    const games = state.ranking === 'game_elo' ? ELO_GAMES : Object.keys(GAME_LABELS);
    if (!games.includes(state.game)) state.game = games[0];
    elements.gameSelect.innerHTML = games.map(game => `<option value="${game}">${escapeHtml(GAME_LABELS[game])}</option>`).join('');
    elements.gameSelect.value = state.game;
  }

  function syncControls() {
    elements.rankingSelect.value = state.ranking;
    elements.search.value = state.search;
    elements.clearSearch.hidden = !state.search;
    elements.sortDirection.textContent = state.direction === 'desc' ? '↓' : '↑';
    elements.sortDirection.setAttribute('aria-label', state.direction === 'desc' ? 'Sort low to high' : 'Sort high to low');
    elements.skyToggle.setAttribute('aria-pressed', String(document.body.classList.contains('night')));
    document.querySelectorAll('[data-region]').forEach(button => {
      const selected = button.dataset.region === state.region;
      button.setAttribute('aria-pressed', String(selected));
    });
    syncGameOptions();
  }

  function resetFilters() {
    state.page = 1;
    state.ranking = 'elo';
    state.game = 'subtextle';
    state.direction = 'desc';
    state.region = 'GLOBAL';
    state.search = '';
    syncControls();
    loadPage(1);
  }

  function togglePlayerDetail(trigger, target) {
    const index = Number(trigger.dataset.playerIndex);
    const player = state.players[index];
    if (!player) return;
    const isOpen = trigger.getAttribute('aria-expanded') === 'true';

    document.querySelectorAll('[data-player-index][aria-expanded="true"]').forEach(element => {
      element.setAttribute('aria-expanded', 'false');
    });
    document.querySelectorAll('.player-detail').forEach(detail => {
      if (detail !== elements.podiumDetail) detail.remove();
    });
    elements.podiumDetail.hidden = true;
    elements.podiumDetail.innerHTML = '';
    if (isOpen) return;

    trigger.setAttribute('aria-expanded', 'true');
    if (target === 'podium') {
      elements.podiumDetail.innerHTML = playerDetailHtml(player);
      elements.podiumDetail.hidden = false;
    } else {
      trigger.insertAdjacentHTML('afterend', playerDetailHtml(player));
    }
  }

  function wireEvents() {
    elements.rankingSelect.addEventListener('change', () => {
      state.ranking = elements.rankingSelect.value;
      state.page = 1;
      syncControls();
      loadPage(1);
    });
    elements.gameSelect.addEventListener('change', () => {
      state.game = elements.gameSelect.value;
      state.page = 1;
      loadPage(1);
    });
    elements.sortDirection.addEventListener('click', () => {
      state.direction = state.direction === 'desc' ? 'asc' : 'desc';
      state.page = 1;
      syncControls();
      loadPage(1);
    });
    document.querySelectorAll('[data-region]').forEach(button => {
      button.addEventListener('click', () => {
        state.region = button.dataset.region;
        state.page = 1;
        syncControls();
        loadPage(1);
      });
    });

    let searchTimer;
    elements.search.addEventListener('input', () => {
      elements.clearSearch.hidden = !elements.search.value;
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => {
        state.search = elements.search.value.trim().slice(0, 80);
        state.page = 1;
        loadPage(1);
      }, 250);
    });
    elements.search.addEventListener('keydown', event => {
      if (event.key !== 'Enter') return;
      clearTimeout(searchTimer);
      state.search = elements.search.value.trim().slice(0, 80);
      state.page = 1;
      loadPage(1);
    });
    elements.clearSearch.addEventListener('click', () => {
      elements.search.value = '';
      state.search = '';
      state.page = 1;
      syncControls();
      elements.search.focus();
      loadPage(1);
    });
    elements.refreshButton.addEventListener('click', () => loadPage(state.page, { force: true }));
    elements.pageControls.addEventListener('click', event => {
      const button = event.target.closest('[data-page]');
      if (!button || button.disabled) return;
      loadPage(Number(button.dataset.page), { scroll: true });
    });
    elements.playerList.addEventListener('click', event => {
      const trigger = event.target.closest('.leaderboard-row');
      if (trigger) togglePlayerDetail(trigger, 'row');
    });
    elements.podiumCards.addEventListener('click', event => {
      const trigger = event.target.closest('.podium-card');
      if (trigger) togglePlayerDetail(trigger, 'podium');
    });
    elements.skyToggle.addEventListener('click', () => {
      const isNight = document.body.classList.toggle('night');
      try { localStorage.setItem('wt-night', isNight ? '1' : '0'); } catch {}
      elements.skyToggle.setAttribute('aria-pressed', String(isNight));
    });
  }

  function collectElements() {
    Object.assign(elements, {
      rankingSelect: document.getElementById('ranking-select'),
      gameSelect: document.getElementById('game-select'),
      gameField: document.getElementById('game-field'),
      search: document.getElementById('player-search'),
      clearSearch: document.getElementById('clear-search'),
      sortDirection: document.getElementById('sort-direction'),
      refreshButton: document.getElementById('refresh-board'),
      board: document.getElementById('leaderboard-board'),
      boardHead: document.getElementById('board-head'),
      metricHeading: document.getElementById('metric-heading'),
      secondaryHeading: document.getElementById('secondary-heading'),
      liveMetric: document.getElementById('live-metric'),
      podium: document.getElementById('podium'),
      podiumCards: document.getElementById('podium-cards'),
      podiumDetail: document.getElementById('podium-detail'),
      playerList: document.getElementById('player-list'),
      pagination: document.getElementById('pagination'),
      pageControls: document.getElementById('page-controls'),
      resultSummary: document.getElementById('result-summary'),
      rankedCount: document.getElementById('ranked-count'),
      status: document.getElementById('leaderboard-status'),
      skyToggle: document.getElementById('skyToggle')
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    collectElements();
    hydrateFromUrl();
    syncControls();
    wireEvents();
    loadPage(state.page);
  });
})();
