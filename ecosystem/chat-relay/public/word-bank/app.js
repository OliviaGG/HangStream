(() => {
  // ─── State ──────────────────────────────────────────────────────────
  let currentLength = 5;
  let currentView = 'candidates'; // 'candidates' | 'targets'
  let candidatePage = 0;
  let targetPage = 0;
  let selectedWords = new Set();
  let stats = null;
  let debounceTimer = null;

  // ─── DOM Refs ───────────────────────────────────────────────────────
  const totalTargetsEl = document.getElementById('total-targets');
  const totalDictEl = document.getElementById('total-dictionary');
  const lengthTabsEl = document.getElementById('length-tabs');
  const quickAddInput = document.getElementById('quick-add-input');
  const quickAddBtn = document.getElementById('quick-add-btn');
  const quickAddStatus = document.getElementById('quick-add-status');
  const filterPluralsEl = document.getElementById('filter-plurals');
  const searchInput = document.getElementById('search-input');
  const statTargetsEl = document.getElementById('stat-targets');
  const statDictEl = document.getElementById('stat-dict');
  const statCandidatesEl = document.getElementById('stat-candidates');
  const batchPanel = document.getElementById('batch-panel');
  const selectionCountEl = document.getElementById('selection-count');
  const batchAddBtn = document.getElementById('batch-add');
  const batchClearBtn = document.getElementById('batch-clear');
  const candidatesGrid = document.getElementById('candidates-grid');
  const targetsGrid = document.getElementById('targets-grid');
  const candidatesPagination = document.getElementById('candidates-pagination');
  const targetsPagination = document.getElementById('targets-pagination');
  const activityFeed = document.getElementById('activity-feed');
  const contentTabs = document.querySelectorAll('.content-tab');

  // ─── API Helpers ────────────────────────────────────────────────────

  async function api(url, opts) {
    const res = await fetch(url, opts);
    return res.json();
  }

  async function fetchStats() {
    stats = await api('/api/word-bank/stats');
    renderStats();
  }

  async function fetchCandidates() {
    candidatesGrid.innerHTML = '<div class="loading">Loading candidates</div>';
    const params = new URLSearchParams({
      page: candidatePage,
      pageSize: 150,
      filterPlurals: filterPluralsEl.checked,
    });
    const search = searchInput.value.trim();
    if (search) params.set('search', search);

    const data = await api(`/api/word-bank/admin/candidates/${currentLength}?${params}`);
    renderCandidates(data);
  }

  async function fetchTargets() {
    targetsGrid.innerHTML = '<div class="loading">Loading targets</div>';
    const params = new URLSearchParams({
      page: targetPage,
      pageSize: 150,
    });
    const search = searchInput.value.trim();
    if (search) params.set('search', search);

    const data = await api(`/api/word-bank/admin/browse/${currentLength}?${params}`);
    renderTargets(data);
  }

  // ─── Render Functions ───────────────────────────────────────────────

  function renderStats() {
    if (!stats) return;
    totalTargetsEl.textContent = `${stats.totalTargets.toLocaleString()} targets`;
    totalDictEl.textContent = `${stats.totalDictionary.toLocaleString()} dictionary`;

    // Length tabs
    lengthTabsEl.innerHTML = '';
    for (const len of stats.lengths) {
      const btn = document.createElement('button');
      btn.className = 'length-tab' + (len === currentLength ? ' active' : '');
      const count = stats.byLength[len]?.targets || 0;
      btn.innerHTML = `${len}<span class="tab-count">${count}</span>`;
      btn.addEventListener('click', () => switchLength(len));
      lengthTabsEl.appendChild(btn);
    }

    // Length-specific stats
    const ls = stats.byLength[currentLength];
    if (ls) {
      statTargetsEl.textContent = ls.targets.toLocaleString();
      statDictEl.textContent = ls.dictionary.toLocaleString();
      statCandidatesEl.textContent = (ls.dictionary - ls.targets).toLocaleString();
    }
  }

  function renderCandidates(data) {
    candidatesGrid.innerHTML = '';
    if (data.words.length === 0) {
      candidatesGrid.innerHTML = '<div class="grid-empty">No candidates found</div>';
    } else {
      for (const word of data.words) {
        candidatesGrid.appendChild(createCandidateChip(word));
      }
    }
    renderPagination(candidatesPagination, data, 'candidates');
  }

  function renderTargets(data) {
    targetsGrid.innerHTML = '';
    if (data.words.length === 0) {
      targetsGrid.innerHTML = '<div class="grid-empty">No targets found</div>';
    } else {
      for (const word of data.words) {
        targetsGrid.appendChild(createTargetChip(word));
      }
    }
    renderPagination(targetsPagination, data, 'targets');
  }

  function createCandidateChip(word) {
    const chip = document.createElement('div');
    chip.className = 'word-chip candidate' + (selectedWords.has(word) ? ' selected' : '');
    chip.dataset.word = word;
    chip.textContent = word;

    // Click to toggle selection
    chip.addEventListener('click', (e) => {
      if (e.shiftKey) {
        // Shift+click: quick-add immediately
        addWords([word]);
        return;
      }
      toggleSelection(word, chip);
    });

    // Double-click: add immediately
    chip.addEventListener('dblclick', () => {
      addWords([word]);
    });

    return chip;
  }

  function createTargetChip(word) {
    const chip = document.createElement('div');
    chip.className = 'word-chip target' + (selectedWords.has(word) ? ' selected' : '');
    chip.dataset.word = word;
    chip.textContent = word;

    // Click to select for removal
    chip.addEventListener('click', () => {
      toggleSelection(word, chip);
    });

    // Double-click: remove immediately
    chip.addEventListener('dblclick', () => {
      removeWords([word]);
    });

    return chip;
  }

  function renderPagination(container, data, type) {
    container.innerHTML = '';
    if (data.totalPages <= 1) return;

    const prevBtn = document.createElement('button');
    prevBtn.textContent = '< Prev';
    prevBtn.disabled = data.page === 0;
    prevBtn.addEventListener('click', () => {
      if (type === 'candidates') { candidatePage--; fetchCandidates(); }
      else { targetPage--; fetchTargets(); }
    });

    const info = document.createElement('span');
    info.className = 'page-info';
    info.textContent = `Page ${data.page + 1} of ${data.totalPages} (${data.total.toLocaleString()} words)`;

    const nextBtn = document.createElement('button');
    nextBtn.textContent = 'Next >';
    nextBtn.disabled = data.page >= data.totalPages - 1;
    nextBtn.addEventListener('click', () => {
      if (type === 'candidates') { candidatePage++; fetchCandidates(); }
      else { targetPage++; fetchTargets(); }
    });

    container.appendChild(prevBtn);
    container.appendChild(info);
    container.appendChild(nextBtn);
  }

  // ─── Selection ──────────────────────────────────────────────────────

  function toggleSelection(word, chip) {
    if (selectedWords.has(word)) {
      selectedWords.delete(word);
      chip.classList.remove('selected');
    } else {
      selectedWords.add(word);
      chip.classList.add('selected');
    }
    updateBatchPanel();
  }

  function clearSelection() {
    selectedWords.clear();
    document.querySelectorAll('.word-chip.selected').forEach(el => el.classList.remove('selected'));
    updateBatchPanel();
  }

  function updateBatchPanel() {
    const count = selectedWords.size;
    if (count > 0) {
      batchPanel.style.display = '';
      selectionCountEl.textContent = `${count} selected`;
      // Change button based on view
      if (currentView === 'candidates') {
        batchAddBtn.textContent = `Add ${count} Word${count > 1 ? 's' : ''}`;
        batchAddBtn.className = 'btn btn-add';
        batchAddBtn.onclick = () => addWords([...selectedWords]);
      } else {
        batchAddBtn.textContent = `Remove ${count} Word${count > 1 ? 's' : ''}`;
        batchAddBtn.className = 'btn btn-remove';
        batchAddBtn.onclick = () => removeWords([...selectedWords]);
      }
    } else {
      batchPanel.style.display = 'none';
    }
  }

  // ─── Actions ────────────────────────────────────────────────────────

  async function addWords(words) {
    const data = await api('/api/word-bank/admin/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words }),
    });

    if (data.ok) {
      // Log activity
      for (const w of data.added) {
        addActivity(w, 'added');
      }

      // Clear those from selection
      for (const w of data.added) selectedWords.delete(w);
      for (const w of data.skipped) selectedWords.delete(w);
      updateBatchPanel();

      // Refresh
      await fetchStats();
      if (currentView === 'candidates') fetchCandidates();
      else fetchTargets();
    }
  }

  async function removeWords(words) {
    const data = await api('/api/word-bank/admin/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ words }),
    });

    if (data.ok) {
      for (const w of data.removed) {
        addActivity(w, 'removed');
      }

      for (const w of data.removed) selectedWords.delete(w);
      updateBatchPanel();

      await fetchStats();
      if (currentView === 'targets') fetchTargets();
      else fetchCandidates();
    }
  }

  async function quickAdd() {
    const word = quickAddInput.value.trim().toLowerCase();
    if (!word) return;

    quickAddBtn.disabled = true;
    const data = await api('/api/word-bank/admin/add-word', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ word }),
    });

    if (data.ok) {
      showStatus(quickAddStatus, `Added "${word}"`, 'success');
      addActivity(word, 'added');
      if (data.plural && data.plural.isPlural) {
        showStatus(quickAddStatus, `Added "${word}" (possible plural of "${data.plural.singular}")`, 'warning');
      }
      quickAddInput.value = '';
      await fetchStats();
      if (currentView === 'candidates') fetchCandidates();
      else fetchTargets();
    } else {
      if (data.reason === 'already a target') {
        showStatus(quickAddStatus, `"${word}" is already a target`, 'info');
      } else if (data.reason === 'not in dictionary') {
        showStatus(quickAddStatus, `"${word}" not found in dictionary`, 'error');
      } else {
        showStatus(quickAddStatus, data.error || 'Failed', 'error');
      }
    }
    quickAddBtn.disabled = false;
    quickAddInput.focus();
  }

  // ─── Activity Feed ──────────────────────────────────────────────────

  function addActivity(word, type) {
    const empty = activityFeed.querySelector('.feed-empty');
    if (empty) empty.remove();

    const item = document.createElement('div');
    item.className = `activity-item ${type}`;

    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

    item.innerHTML = `
      <span class="activity-word">${esc(word)}</span>
      ${type === 'added' ? '+' : '-'}
      <span class="activity-time">${time}</span>
    `;

    activityFeed.prepend(item);

    // Keep max 50 items
    while (activityFeed.children.length > 50) {
      activityFeed.lastChild.remove();
    }
  }

  // ─── UI Helpers ─────────────────────────────────────────────────────

  function showStatus(el, msg, type) {
    el.textContent = msg;
    el.className = `status-msg ${type}`;
    clearTimeout(el._timer);
    el._timer = setTimeout(() => {
      el.textContent = '';
      el.className = 'status-msg';
    }, 4000);
  }

  function switchLength(len) {
    currentLength = len;
    candidatePage = 0;
    targetPage = 0;
    clearSelection();
    renderStats();
    refresh();
  }

  function switchView(view) {
    currentView = view;
    clearSelection();
    contentTabs.forEach(tab => {
      tab.classList.toggle('active', tab.dataset.view === view);
    });
    document.getElementById('candidates-view').classList.toggle('active', view === 'candidates');
    document.getElementById('targets-view').classList.toggle('active', view === 'targets');
    refresh();
  }

  function refresh() {
    if (currentView === 'candidates') fetchCandidates();
    else fetchTargets();
  }

  function esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  // ─── Event Listeners ───────────────────────────────────────────────

  // Content tabs
  contentTabs.forEach(tab => {
    tab.addEventListener('click', () => switchView(tab.dataset.view));
  });

  // Quick add
  quickAddBtn.addEventListener('click', quickAdd);
  quickAddInput.addEventListener('keydown', e => {
    if (e.key === 'Enter') quickAdd();
  });
  quickAddInput.addEventListener('input', () => {
    const val = quickAddInput.value.trim();
    quickAddBtn.disabled = val.length < 2;
  });

  // Filter plurals
  filterPluralsEl.addEventListener('change', () => {
    candidatePage = 0;
    if (currentView === 'candidates') fetchCandidates();
  });

  // Search
  searchInput.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      candidatePage = 0;
      targetPage = 0;
      refresh();
    }, 300);
  });

  // Batch
  batchClearBtn.addEventListener('click', clearSelection);

  // Keyboard shortcuts
  document.addEventListener('keydown', (e) => {
    // Ctrl+A: select all visible
    if (e.ctrlKey && e.key === 'a' && document.activeElement.tagName !== 'INPUT') {
      e.preventDefault();
      const grid = currentView === 'candidates' ? candidatesGrid : targetsGrid;
      grid.querySelectorAll('.word-chip').forEach(chip => {
        const word = chip.dataset.word;
        if (word) {
          selectedWords.add(word);
          chip.classList.add('selected');
        }
      });
      updateBatchPanel();
    }

    // Escape: clear selection
    if (e.key === 'Escape') {
      clearSelection();
    }
  });

  // ─── Init ──────────────────────────────────────────────────────────

  async function init() {
    await fetchStats();
    refresh();
  }

  init();
})();
