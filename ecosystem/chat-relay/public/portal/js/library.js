/* ════════════════════════════════════════════════════════════════════
   THE LIBRARY — /library
   Standalone port of the portal SPA's Library tab (portal.js), against
   the same endpoints: /api/me/library (401 when signed out) and the
   public /api/word-bank/letter-rarity for the Scoring ledger.

   Guest behaviour: Words and Stats need a session, so signed-out
   visitors get the keycards — but Scoring is documentation, so that
   tab stays open to everyone.
   ════════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* Same labels the portal SPA uses, extended with the games the library
     may file words under; unknown ids fall back to the raw id. */
  var GAME_LABELS = {
    'betwixt-sp': 'Betwixt', 'betwixt': 'Betwixt',
    'word500-sp': 'Word5000 Solo', 'word500': 'Word5000',
    'wordle-sp': 'Wordle', 'wordle': 'Wordle',
    'figural-sp': 'Figural', 'figural': 'Figural',
    'pixeletters-sp': 'PixeLetters', 'pixeletters': 'PixeLetters',
    'spellingbee-sp': 'Spelling Bee', 'spellingbee': 'Spelling Bee', 'spelling-bee': 'Spelling Bee',
    'rectangled-sp': 'recTangled', 'rectangled': 'recTangled',
    'searchle-sp': 'Subtextle', 'searchle': 'Subtextle',
    'unwordle-sp': 'UnWordle', 'unwordle': 'UnWordle',
    'triangled-sp': 'Triangled', 'triangled': 'Triangled',
    'erectangled-sp': 'erecTangled', 'erectangled': 'erecTangled',
    'colour500-sp': 'Color 500', 'colour500': 'Color 500',
    'synapse': 'Synapse',
    'letterworks': 'Letterworks', 'letterworks-sp': 'Letterworks',
    'wordfall': 'Wordfall', 'wordfall-sp': 'Wordfall',
    'wikisearchle': 'WikiContexto',
    'wikirectangled': 'WiKirecTangled'
  };

  var state = {
    tab: 'words',
    data: null,        // last /api/me/library payload
    guest: false,
    offset: 0,
    game: '',
    search: ''
  };
  var searchTimer = null;
  var letterRarityCache = null;

  var $ = function (id) { return document.getElementById(id); };
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function label(game) { return GAME_LABELS[game] || game || '?'; }

  /* ── data ─────────────────────────────────────────────────────────── */
  function fetchLibrary() {
    var params = new URLSearchParams();
    params.set('limit', '50');
    params.set('offset', String(state.offset));
    if (state.game) params.set('game', state.game);
    if (state.search) params.set('search', state.search);
    return fetch('/api/me/library?' + params.toString(), { credentials: 'same-origin' })
      .then(function (r) {
        if (r.status === 401) { state.guest = true; return null; }
        return r.json();
      })
      .then(function (data) {
        if (data && !data.ok) throw new Error(data.error || 'Failed to load');
        if (data) { state.data = data; state.guest = false; }
        return data;
      });
  }

  /* ── boot ─────────────────────────────────────────────────────────── */
  function boot() {
    if (window.WTToon) WTToon.wireToggle($('skyToggle'));
    $('libTabs').addEventListener('click', function (e) {
      var btn = e.target.closest('.lib-tab');
      if (!btn) return;
      document.querySelectorAll('.lib-tab').forEach(function (b) { b.classList.remove('on'); });
      btn.classList.add('on');
      state.tab = btn.dataset.tab;
      renderTab();
    });

    fetchLibrary().then(function () {
      $('libTabs').hidden = false;
      if (state.guest) {
        $('libGuest').hidden = false;
      } else {
        renderHero();
      }
      renderTab();
    }).catch(function () {
      $('libContent').innerHTML = '<p class="lib-empty">The library is unreachable right now — try again in a minute.</p>';
    });
  }

  function renderHero() {
    var d = state.data;
    if (!d) return;
    $('libHero').hidden = false;
    $('libWords').textContent = (d.wordCount || 0).toLocaleString();
    $('libLevel').textContent = d.level || 1;
    var pct = d.nextLevelAt ? Math.min(100, (d.wordCount / d.nextLevelAt) * 100) : 100;
    var fill = $('libBarFill');
    fill.style.width = pct + '%';
    fill.classList.toggle('full', pct >= 100);
    $('libBarLabel').textContent =
      (d.wordCount || 0).toLocaleString() + ' / ' +
      (d.nextLevelAt || d.wordCount || 0).toLocaleString() + ' to next level';
  }

  function renderTab() {
    if (state.tab === 'scoring') { renderScoring(); return; }
    if (state.guest) {
      // Words and Stats are members-only; the keycards above say so.
      $('libContent').innerHTML = '';
      return;
    }
    if (state.tab === 'words') renderWords();
    else renderStats();
  }

  /* ── words ────────────────────────────────────────────────────────── */
  function renderWords() {
    var d = state.data;
    var games = (d.stats && d.stats.byGame) ? d.stats.byGame.map(function (g) { return g.game; }) : [];
    var options = games.map(function (g) {
      return '<option value="' + esc(g) + '"' + (state.game === g ? ' selected' : '') + '>' + esc(label(g)) + '</option>';
    }).join('');

    // Filters render once and stay put, so typing never loses focus —
    // only the list below re-renders on fetch.
    $('libContent').innerHTML =
      '<div class="lib-filters">' +
        '<input type="text" class="lib-search" id="libSearch" placeholder="Search your words…" value="' + esc(state.search) + '">' +
        '<select class="lib-game-filter" id="libGameFilter"><option value="">All Games</option>' + options + '</select>' +
      '</div>' +
      '<div id="libList"></div>';

    $('libSearch').addEventListener('input', function (e) {
      clearTimeout(searchTimer);
      var val = e.target.value;
      searchTimer = setTimeout(function () {
        state.search = val;
        state.offset = 0;
        refreshList();
      }, 300);
    });
    $('libGameFilter').addEventListener('change', function (e) {
      state.game = e.target.value;
      state.offset = 0;
      refreshList();
    });

    renderList();
  }

  function refreshList() {
    fetchLibrary().then(function () {
      if (state.tab === 'words') renderList();
    }).catch(function () {
      var el = $('libList');
      if (el) el.innerHTML = '<p class="lib-empty">Could not load that shelf — try again.</p>';
    });
  }

  function renderList() {
    var d = state.data;
    var el = $('libList');
    if (!el) return;
    var html = '';
    if (!d.words || d.words.length === 0) {
      html = '<p class="lib-empty">No words on this shelf yet. Play some games to start filling it!</p>';
    } else {
      html += '<div class="lib-word-grid">';
      for (var i = 0; i < d.words.length; i++) {
        var w = d.words[i];
        var date = w.found_at ? new Date(w.found_at + 'Z').toLocaleDateString() : '';
        html += '<div class="lib-word-card">' +
          '<div class="lib-word-text">' + esc((w.word || '').toUpperCase()) + '</div>' +
          '<div class="lib-word-meta"><span class="lib-word-game">' + esc(label(w.game)) + '</span><span>' + esc(date) + '</span></div>' +
        '</div>';
      }
      html += '</div>';

      var hasMore = d.words.length === 50;
      if (state.offset > 0 || hasMore) {
        html += '<div class="lib-pagination">';
        if (state.offset > 0) html += '<button class="lib-page-btn" type="button" data-page="-1">&larr; Newer</button>';
        if (hasMore) html += '<button class="lib-page-btn" type="button" data-page="1">Older &rarr;</button>';
        html += '</div>';
      }
    }
    el.innerHTML = html;
    el.querySelectorAll('.lib-page-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.offset = Math.max(0, state.offset + (parseInt(btn.dataset.page, 10) * 50));
        refreshList();
      });
    });
  }

  /* ── stats ────────────────────────────────────────────────────────── */
  function renderStats() {
    var d = state.data;
    var stats = d.stats;
    var html = '<div class="lib-section"><h3 class="lib-section-title">Words by Game</h3>';
    if (!stats || !stats.byGame || stats.byGame.length === 0) {
      html += '<p class="lib-empty">No stats yet.</p>';
    } else {
      var maxCount = stats.byGame[0].count;
      for (var i = 0; i < stats.byGame.length; i++) {
        var g = stats.byGame[i];
        var pct = Math.max(5, (g.count / maxCount) * 100);
        html += '<div class="lib-stat-row">' +
          '<span class="lib-stat-label">' + esc(label(g.game)) + '</span>' +
          '<div class="lib-stat-bar-bg"><div class="lib-stat-bar-fill" style="width:' + pct + '%"></div></div>' +
          '<span class="lib-stat-count">' + (g.count || 0).toLocaleString() + '</span>' +
        '</div>';
      }
    }
    html += '</div>';

    if (stats && stats.recent && stats.recent.length > 0) {
      html += '<div class="lib-section"><h3 class="lib-section-title">Recently Found</h3><div class="lib-recent-list">';
      for (var j = 0; j < stats.recent.length; j++) {
        var r = stats.recent[j];
        html += '<span class="chip"><b>' + esc((r.word || '').toUpperCase()) + '</b> ' + esc(label(r.game)) + '</span>';
      }
      html += '</div></div>';
    }
    $('libContent').innerHTML = html;
  }

  /* ── scoring (public) ─────────────────────────────────────────────── */
  function renderScoring() {
    var el = $('libContent');
    el.innerHTML = '<p class="loading-note">Opening the ledger…</p>';
    if (letterRarityCache) { renderScoringContent(letterRarityCache); return; }
    fetch('/api/word-bank/letter-rarity').then(function (r) { return r.json(); }).then(function (data) {
      letterRarityCache = data;
      renderScoringContent(data);
    }).catch(function () {
      el.innerHTML = '<p class="lib-empty">Failed to load scoring data.</p>';
    });
  }

  function renderScoringContent(data) {
    var TIER_COLORS = {
      trivial: '#6b7280', common: '#9ca3af', uncommon: '#22c55e', rare: '#3b82f6',
      epic: '#a855f7', legendary: '#f97316', mythic: '#ef4444', unique: '#eab308'
    };
    var TIER_ORDER = ['trivial', 'common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic', 'unique'];

    var html = '';

    // --- How it works ---
    html += '<div class="lib-section"><h3 class="lib-section-title">How Scoring Works</h3>';
    html += '<p class="lib-scoring-desc">Every word you find earns <strong>points</strong> and <strong>coins</strong>. Your total is calculated from three layers:</p>';
    html += '<div class="lib-formula">';
    html += '<span class="lib-formula-part">Word Rarity Base</span>';
    html += '<span class="lib-formula-op">+</span>';
    html += '<span class="lib-formula-part">Letter Rarity Bonus</span>';
    html += '<span class="lib-formula-op">+</span>';
    html += '<span class="lib-formula-part">Word Length Bonus</span>';
    html += '<span class="lib-formula-op">=</span>';
    html += '<span class="lib-formula-result">Total Points &amp; Coins</span>';
    html += '</div></div>';

    // --- Word rarity tiers (mirrors the games' payout formula) ---
    html += '<div class="lib-section"><h3 class="lib-section-title">Word Rarity Tiers</h3>';
    html += '<p class="lib-scoring-desc">Base points by word type. The required board words pay most &mdash; rarer is not worth more here.</p>';
    html += '<div class="lib-table-wrap"><table class="lib-table"><thead><tr><th>Word Type</th><th>Description</th><th>Base Points</th></tr></thead><tbody>';
    var wordTiers = [
      ['Common', 'Required board words &mdash; the ones you need to clear the grid', '1,500'],
      ['Ultra Rare', 'No frequency data &mdash; hidden bonus words', '1,000'],
      ['Rare', 'Extra words beyond the required set', '500'],
      ['3-Letter', 'Short words (3 characters)', '100']
    ];
    for (var w = 0; w < wordTiers.length; w++) {
      html += '<tr><td><strong>' + wordTiers[w][0] + '</strong></td><td>' + wordTiers[w][1] + '</td><td class="lib-scoring-pts">' + wordTiers[w][2] + '</td></tr>';
    }
    html += '</tbody></table></div></div>';

    // --- Letter rarity tiers ---
    html += '<div class="lib-section"><h3 class="lib-section-title">Letter Rarity Tiers</h3>';
    html += '<p class="lib-scoring-desc">Each letter in your word adds a bonus based on how rare it is in English. Duplicate letters each count.</p>';
    html += '<div class="lib-table-wrap"><table class="lib-table"><thead><tr><th>Tier</th><th>Bonus</th><th>Letters</th></tr></thead><tbody>';
    for (var t = 0; t < TIER_ORDER.length; t++) {
      var tierName = TIER_ORDER[t];
      var tierData = data.tiers && data.tiers[tierName];
      if (!tierData) continue;
      var color = TIER_COLORS[tierName] || '#888';
      var letters = tierData.letters || [];
      var lettersHtml = '';
      for (var li = 0; li < letters.length; li++) {
        lettersHtml += '<span class="lib-letter-chip" style="border-color:' + color + '">' + esc(letters[li].toUpperCase()) + '</span>';
      }
      html += '<tr>';
      html += '<td><span class="lib-tier-badge" style="background:' + color + '">' + tierName.charAt(0).toUpperCase() + tierName.slice(1) + '</span></td>';
      html += '<td class="lib-scoring-pts">' + (tierData.bonus > 0 ? '+' + tierData.bonus : '0') + '</td>';
      html += '<td>' + lettersHtml + '</td>';
      html += '</tr>';
    }
    html += '</tbody></table></div></div>';

    // --- Word length bonus ---
    html += '<div class="lib-section"><h3 class="lib-section-title">Word Length Bonus</h3>';
    html += '<p class="lib-scoring-desc">Longer words earn an exponential bonus. 3-letter words are exempt.</p>';
    html += '<div class="lib-table-wrap"><table class="lib-table"><thead><tr><th>Length</th><th>Bonus</th></tr></thead><tbody>';
    var lengthBonuses = [[3, '0 (exempt)'], [4, '+75'], [5, '+150'], [6, '+300'], [7, '+500'], [8, '+800'], [9, '+1,200'], [10, '+1,750'], [11, '+2,500'], ['12+', '+3,500']];
    for (var lb = 0; lb < lengthBonuses.length; lb++) {
      html += '<tr><td>' + lengthBonuses[lb][0] + ' letters</td><td class="lib-scoring-pts">' + lengthBonuses[lb][1] + '</td></tr>';
    }
    html += '</tbody></table></div></div>';

    // --- Example breakdown ---
    html += '<div class="lib-section"><h3 class="lib-section-title">Example: &ldquo;JAZZ&rdquo; (a Rare extra word)</h3>';
    html += '<div class="lib-example">';
    html += '<div class="lib-example-row"><span>Word Base (Rare)</span><span class="lib-example-val">500</span></div>';
    var exLetters = [
      { l: 'J', tier: 'mythic', bonus: 180 },
      { l: 'A', tier: 'common', bonus: 0 },
      { l: 'Z', tier: 'unique', bonus: 300 },
      { l: 'Z', tier: 'unique', bonus: 300 }
    ];
    for (var e = 0; e < exLetters.length; e++) {
      var ex = exLetters[e];
      var ec = TIER_COLORS[ex.tier] || '#888';
      html += '<div class="lib-example-row"><span>';
      html += '<span class="lib-letter-chip" style="border-color:' + ec + '">' + ex.l + '</span> ';
      html += '<span class="lib-tier-badge lib-tier-badge-sm" style="background:' + ec + '">' + ex.tier.charAt(0).toUpperCase() + ex.tier.slice(1) + '</span>';
      html += '</span><span class="lib-example-val">+' + ex.bonus + '</span></div>';
    }
    html += '<div class="lib-example-row"><span>Length Bonus (4 letters)</span><span class="lib-example-val">+75</span></div>';
    html += '<div class="lib-example-row lib-example-total"><span>Total</span><span class="lib-example-val">1,355</span></div>';
    html += '</div></div>';

    $('libContent').innerHTML = html;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
