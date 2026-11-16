(function () {
  const app = document.getElementById('app');
  const path = window.location.pathname.replace(/\/+$/, '') || '/';
  const base = path.startsWith('/tycoonio') ? '/tycoonio' : '';
  const relativePath = (base && path.startsWith(base)) ? (path.slice(base.length) || '/') : path;
  const currentUrl = new URL(window.location.href);
  const returnToPath = path || '/';
  const authToken = currentUrl.searchParams.get('auth_token') || currentUrl.searchParams.get('auth');
  const ssoChecked = currentUrl.searchParams.get('sso_checked') === '1';
  const SSO_BRIDGE_URL = 'https://wordtycoon.live/api/auth/sso-check';
  const DEFAULT_THEME_ID = 'classic';
  const LEGACY_THEME_ALIASES = {
    modern: 'classic',
    rustic: 'sunset',
    retro: 'sunset',
    tabloid: 'midnight',
    underground: 'midnight',
    neon: 'midnight',
    garden: 'emerald',
    boutique: 'emerald',
    arena: 'ocean',
    elite: 'midnight',
    artdeco: 'sunset',
    premiere: 'ocean',
    gala: 'midnight'
  };
  const THEME_PALETTES = {
    classic: {
      '--bg': '#060b16',
      '--bg-accent': '#0b1530',
      '--surface': 'rgba(13, 24, 48, 0.92)',
      '--surface-strong': 'rgba(18, 31, 60, 0.96)',
      '--surface-soft': 'rgba(11, 20, 40, 0.85)',
      '--border': 'rgba(111, 151, 219, 0.24)',
      '--border-strong': 'rgba(131, 189, 255, 0.32)',
      '--text': '#eef4ff',
      '--muted': '#9aabc8',
      '--subtle': '#7082a6',
      '--value': '#f3bf4b',
      '--live': '#56d4ff',
      '--growth': '#57d486',
      '--danger': '#e0917d',
      '--body-radial-1': 'rgba(86, 212, 255, 0.14)',
      '--body-radial-2': 'rgba(243, 191, 75, 0.11)',
      '--body-start': '#09101d',
      '--body-end': '#050912',
      '--hero-radial-1': 'rgba(86, 212, 255, 0.11)',
      '--hero-radial-2': 'rgba(243, 191, 75, 0.10)',
      '--primary-start': '#ffc95e',
      '--primary-end': '#f19a3e',
      '--badge-start': 'rgba(243, 191, 75, 0.18)',
      '--badge-end': 'rgba(86, 212, 255, 0.12)'
    },
    sunset: {
      '--bg': '#190a10',
      '--bg-accent': '#341321',
      '--surface': 'rgba(48, 18, 30, 0.92)',
      '--surface-strong': 'rgba(61, 22, 37, 0.96)',
      '--surface-soft': 'rgba(37, 14, 23, 0.86)',
      '--border': 'rgba(255, 156, 120, 0.28)',
      '--border-strong': 'rgba(255, 198, 133, 0.36)',
      '--text': '#fff2eb',
      '--muted': '#e0b2a4',
      '--subtle': '#b98780',
      '--value': '#ffd166',
      '--live': '#ff9d7a',
      '--growth': '#ffbf69',
      '--danger': '#ff8d7d',
      '--body-radial-1': 'rgba(255, 126, 95, 0.18)',
      '--body-radial-2': 'rgba(255, 209, 102, 0.12)',
      '--body-start': '#261018',
      '--body-end': '#12070b',
      '--hero-radial-1': 'rgba(255, 157, 122, 0.18)',
      '--hero-radial-2': 'rgba(255, 209, 102, 0.12)',
      '--primary-start': '#ffd166',
      '--primary-end': '#ff8c5a',
      '--badge-start': 'rgba(255, 209, 102, 0.2)',
      '--badge-end': 'rgba(255, 141, 125, 0.16)'
    },
    emerald: {
      '--bg': '#071510',
      '--bg-accent': '#103227',
      '--surface': 'rgba(12, 39, 30, 0.92)',
      '--surface-strong': 'rgba(16, 49, 38, 0.96)',
      '--surface-soft': 'rgba(9, 29, 22, 0.86)',
      '--border': 'rgba(99, 201, 151, 0.26)',
      '--border-strong': 'rgba(155, 233, 195, 0.34)',
      '--text': '#ecfff7',
      '--muted': '#aad2c2',
      '--subtle': '#82ad9a',
      '--value': '#f2d680',
      '--live': '#6fe3b7',
      '--growth': '#8ef0a1',
      '--danger': '#dba28c',
      '--body-radial-1': 'rgba(111, 227, 183, 0.18)',
      '--body-radial-2': 'rgba(242, 214, 128, 0.10)',
      '--body-start': '#0a1a13',
      '--body-end': '#040b08',
      '--hero-radial-1': 'rgba(111, 227, 183, 0.18)',
      '--hero-radial-2': 'rgba(242, 214, 128, 0.10)',
      '--primary-start': '#9ef0c9',
      '--primary-end': '#58c887',
      '--badge-start': 'rgba(158, 240, 201, 0.2)',
      '--badge-end': 'rgba(111, 227, 183, 0.14)'
    },
    ocean: {
      '--bg': '#05111b',
      '--bg-accent': '#0d2840',
      '--surface': 'rgba(10, 28, 45, 0.92)',
      '--surface-strong': 'rgba(13, 36, 56, 0.96)',
      '--surface-soft': 'rgba(8, 21, 35, 0.86)',
      '--border': 'rgba(95, 173, 255, 0.26)',
      '--border-strong': 'rgba(133, 225, 255, 0.34)',
      '--text': '#eef9ff',
      '--muted': '#a5c2d9',
      '--subtle': '#7898b1',
      '--value': '#7fd7ff',
      '--live': '#53b6ff',
      '--growth': '#6ee7da',
      '--danger': '#d79a8b',
      '--body-radial-1': 'rgba(83, 182, 255, 0.18)',
      '--body-radial-2': 'rgba(110, 231, 218, 0.12)',
      '--body-start': '#081520',
      '--body-end': '#030911',
      '--hero-radial-1': 'rgba(83, 182, 255, 0.18)',
      '--hero-radial-2': 'rgba(110, 231, 218, 0.12)',
      '--primary-start': '#8be1ff',
      '--primary-end': '#4fa3ff',
      '--badge-start': 'rgba(127, 215, 255, 0.2)',
      '--badge-end': 'rgba(83, 182, 255, 0.16)'
    },
    midnight: {
      '--bg': '#120d14',
      '--bg-accent': '#26162b',
      '--surface': 'rgba(34, 20, 39, 0.92)',
      '--surface-strong': 'rgba(42, 24, 48, 0.96)',
      '--surface-soft': 'rgba(25, 15, 29, 0.86)',
      '--border': 'rgba(223, 155, 112, 0.24)',
      '--border-strong': 'rgba(255, 214, 141, 0.34)',
      '--text': '#fff4ec',
      '--muted': '#d7b9a5',
      '--subtle': '#ad8e7e',
      '--value': '#ffcf70',
      '--live': '#ff9f6b',
      '--growth': '#f0b36f',
      '--danger': '#ff8d86',
      '--body-radial-1': 'rgba(255, 159, 107, 0.16)',
      '--body-radial-2': 'rgba(255, 207, 112, 0.10)',
      '--body-start': '#1a121d',
      '--body-end': '#09060c',
      '--hero-radial-1': 'rgba(255, 159, 107, 0.16)',
      '--hero-radial-2': 'rgba(255, 207, 112, 0.10)',
      '--primary-start': '#ffd277',
      '--primary-end': '#ff9a5f',
      '--badge-start': 'rgba(255, 210, 119, 0.2)',
      '--badge-end': 'rgba(255, 159, 107, 0.14)'
    }
  };

  const SIGNIN_URL = `/auth/discord?returnTo=${encodeURIComponent(returnToPath)}`;
  const WORD_TYCOON_URL = 'https://wordtycoon.live/me';

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNumber(value) {
    return new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(value) || 0);
  }

  function formatRate(value) {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number(value) || 0)} XP/sec`;
  }

  function formatUnitRate(value, unitLabel) {
    return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(Number(value) || 0)} ${unitLabel}`;
  }

  function formatCompact(value) {
    return new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(Number(value) || 0);
  }

  function getAppRootHref() {
    return base || '/';
  }

  function buildBusinessHref(businessType) {
    return `${base}/business/${encodeURIComponent(businessType)}` || `/business/${encodeURIComponent(businessType)}`;
  }

  function normalizeTycoonHref(href) {
    const value = String(href || '').trim();
    if (!value) return '';
    if (/^[a-z]+:/i.test(value)) return value;
    if (value.startsWith('/tycoonio/')) {
      return `${base}${value.slice('/tycoonio'.length)}` || value.slice('/tycoonio'.length);
    }
    if (value === '/tycoonio') {
      return getAppRootHref();
    }
    if (value.startsWith('/business/')) {
      return `${base}${value}` || value;
    }
    return value;
  }

  function scrollToSectionTarget() {
    const hash = window.location.hash;
    const targetId = hash ? hash.slice(1) : (relativePath === '/businesses' ? 'businesses' : '');
    if (!targetId) return;
    requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      if (target) {
        target.scrollIntoView({ block: 'start', behavior: 'auto' });
      }
    });
  }

  function buildWordmark() {
    return `Tycoon<span class="io">IO</span>`;
  }

  function normalizeThemeId(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return DEFAULT_THEME_ID;
    return THEME_PALETTES[raw] ? raw : (LEGACY_THEME_ALIASES[raw] || DEFAULT_THEME_ID);
  }

  function applyPageTheme(themeId) {
    const palette = THEME_PALETTES[normalizeThemeId(themeId)] || THEME_PALETTES[DEFAULT_THEME_ID];
    Object.entries(palette).forEach(([key, value]) => {
      document.documentElement.style.setProperty(key, value);
    });
  }

  function resolveSelectedCustomizationValue(group, currentValue, category) {
    let nextValue = currentValue || group?.default || '';
    if (category === 'theme') {
      nextValue = normalizeThemeId(nextValue);
    }
    const optionIds = new Set((group?.options || []).map((option) => option.id));
    if (!optionIds.has(nextValue)) {
      nextValue = category === 'theme'
        ? normalizeThemeId(group?.default)
        : (group?.default || '');
    }
    return nextValue;
  }

  function buildCustomizationGroups(payload) {
    const groups = {};
    Object.entries(payload?.availableCustomizations || {}).forEach(([category, group]) => {
      const currentValue = resolveSelectedCustomizationValue(group, payload?.customizations?.[category], category);
      groups[category] = {
        name: group.name,
        options: (group.options || []).map((option) => ({
          ...option,
          selected: option.id === currentValue
        }))
      };
    });
    return groups;
  }

  function getDetailThemeId(detail) {
    const payload = detail?.payload || {};
    const themeGroup = payload.availableCustomizations?.theme;
    if (!themeGroup) return DEFAULT_THEME_ID;
    return resolveSelectedCustomizationValue(themeGroup, payload.customizations?.theme, 'theme');
  }

  function avatarMarkup(player) {
    if (player && player.avatar) {
      return `<img class="ty-avatar" src="${escapeHtml(player.avatar)}" alt="">`;
    }
    const letter = player?.displayName?.charAt(0) || 'T';
    return `<span class="ty-avatar-placeholder">${escapeHtml(letter.toUpperCase())}</span>`;
  }

  function loadingMarkup() {
    return `
      <div class="ty-loading">
        <div class="ty-loading-shell">
          <div class="ty-skeleton hero"></div>
          <div class="ty-skeleton row"></div>
          <div class="ty-skeleton row"></div>
          <div class="ty-skeleton row"></div>
        </div>
      </div>
    `;
  }

  function signedOutMarkup() {
    return `
      <div class="ty-page">
        <div class="ty-shell">
          <section class="ty-state-shell">
            <div class="ty-eyebrow">Your Word Tycoon Empire</div>
            <h1>${buildWordmark()}</h1>
            <p>Sign in with your Word Tycoon account to manage your empire, collect earnings, and open your businesses.</p>
            <div class="ty-state-actions">
              <a class="ty-primary-btn" href="${SIGNIN_URL}">Sign in with Discord</a>
              <a class="ty-link-btn" href="${WORD_TYCOON_URL}">Back to Word Tycoon</a>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function errorMarkup(title, copy, retryLabel) {
    return `
      <div class="ty-page">
        <div class="ty-shell">
          <section class="ty-state-shell">
            <div class="ty-eyebrow">TycoonIO</div>
            <h1>${escapeHtml(title)}</h1>
            <p>${escapeHtml(copy)}</p>
            <div class="ty-state-actions">
              <button class="ty-primary-btn" data-retry>${escapeHtml(retryLabel || 'Try Again')}</button>
              <a class="ty-link-btn" href="${WORD_TYCOON_URL}">Back to Word Tycoon</a>
            </div>
          </section>
        </div>
      </div>
    `;
  }

  function cleanAuthParams() {
    const url = new URL(window.location.href);
    let changed = false;
    if (url.searchParams.has('auth')) {
      url.searchParams.delete('auth');
      changed = true;
    }
    if (url.searchParams.has('auth_token')) {
      url.searchParams.delete('auth_token');
      changed = true;
    }
    if (url.searchParams.has('sso_checked')) {
      url.searchParams.delete('sso_checked');
      changed = true;
    }
    if (!changed) return;
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next);
  }

  function buildSsoReturnUrl() {
    const url = new URL(window.location.href);
    url.searchParams.set('sso_checked', '1');
    return url.toString();
  }

  async function exchangeAuthToken(token) {
    const result = await fetchJson(`/api/auth/exchange?token=${encodeURIComponent(token)}`, {
      credentials: 'include'
    });
    cleanAuthParams();
    return result;
  }

  function topbar(player, backHref) {
    return `
      <header class="ty-topbar">
        <div class="ty-brand">
          <div class="ty-wordmark">${buildWordmark()}</div>
          <div class="ty-tagline">Your Word Tycoon Empire</div>
        </div>
        <div class="ty-topbar-right">
          <div class="ty-user-chip">
            ${avatarMarkup(player)}
            <div class="ty-user-meta">
              <div class="ty-user-name">${escapeHtml(player.displayName || player.username || 'Player')}</div>
              <div class="ty-user-sub">${escapeHtml(player.provider || 'discord')}</div>
            </div>
          </div>
          <a class="ty-link-btn" href="${backHref || WORD_TYCOON_URL}">Back to Word Tycoon</a>
        </div>
      </header>
    `;
  }

  function dashboardMarkup(session, overview) {
    const actions = overview.recommendedActions || [];
    const businesses = overview.businesses || [];
    const activeBuffs = overview.activeBuffs || [];
    const recent = overview.recentActivity || [];

    return `
      <div class="ty-page">
        <div class="ty-shell">
          ${topbar(session.user, WORD_TYCOON_URL)}

          <section class="ty-hero">
            <div class="ty-hero-copy">
              <div class="ty-eyebrow">Empire Dashboard</div>
              <h1>Welcome back to ${escapeHtml(session.user.displayName || 'TycoonIO')}</h1>
              <p>Manage your businesses, track passive income, and move through the empire side of the Word Tycoon ecosystem.</p>
            </div>
            <div class="ty-hero-stats">
              <div class="ty-stat">
                <span class="ty-stat-value live">${formatNumber(overview.ownedBusinessCount)}</span>
                <div class="ty-stat-label">businesses owned</div>
              </div>
              <div class="ty-stat">
                <span class="ty-stat-value value">${formatCompact(overview.dollars)}</span>
                <div class="ty-stat-label">XP on account</div>
              </div>
              <div class="ty-stat">
                <span class="ty-stat-value growth">${formatCompact(overview.totalIncomePerSecond)}</span>
                <div class="ty-stat-label">current XP/sec</div>
              </div>
              <div class="ty-stat">
                <span class="ty-stat-value">${formatNumber(overview.activeBuffsCount || 0)}</span>
                <div class="ty-stat-label">active buffs</div>
              </div>
            </div>
            <div class="ty-hero-actions">
              <a class="ty-primary-btn" href="${getAppRootHref()}#businesses">Manage Businesses</a>
              <a class="ty-outline-btn" href="${WORD_TYCOON_URL}">Back to Word Tycoon</a>
            </div>
          </section>

          <section class="ty-section">
            <div class="ty-section-head">
              <h2 class="ty-section-title">Recommended Actions</h2>
              <div class="ty-section-sub">Start with the most valuable next moves.</div>
            </div>
            <div class="ty-actions-grid">
              ${actions.map((action) => `
                <a class="ty-action" ${action.href ? `href="${escapeHtml(normalizeTycoonHref(action.href))}"` : ''}>
                  <div class="ty-action-type">${escapeHtml(action.type || 'action')}</div>
                  <div class="ty-action-title">${escapeHtml(action.label)}</div>
                  <div class="ty-action-foot">${action.href ? 'Open business page' : 'Dashboard guidance'}</div>
                </a>
              `).join('')}
            </div>
          </section>

          <section class="ty-section">
            <div class="ty-section-head">
              <h2 class="ty-section-title">Empire Snapshot</h2>
              <div class="ty-section-sub">The numbers that matter right now.</div>
            </div>
            <div class="ty-summary-grid">
              <div class="ty-summary-card">
                <h3>Earnings</h3>
                <div class="ty-summary-list">
                  <div class="ty-summary-row"><span class="label">Current total</span><span class="value">${formatRate(overview.totalIncomePerSecond)}</span></div>
                  <div class="ty-summary-row"><span class="label">Owned businesses</span><span class="value">${formatNumber(overview.ownedBusinessCount)}</span></div>
                  <div class="ty-summary-row"><span class="label">Total prestige</span><span class="value">${formatNumber(overview.totalPrestige || 0)}</span></div>
                </div>
              </div>
              <div class="ty-summary-card">
                <h3>Active Buffs</h3>
                ${activeBuffs.length ? `
                  <div class="ty-pill-row">
                    ${activeBuffs.map((buff) => `<span class="ty-pill">${escapeHtml(buff.label || buff.key)} +${escapeHtml(buff.value)}</span>`).join('')}
                  </div>
                ` : `<div class="ty-card-copy">No active buffs right now. Your empire is running at its base rate.</div>`}
              </div>
            </div>
          </section>

          <section class="ty-section" id="businesses">
            <div class="ty-section-head">
              <h2 class="ty-section-title">Businesses</h2>
              <div class="ty-section-sub">Library stays in Word Tycoon. Everything else lives here.</div>
            </div>
            <div class="ty-business-grid">
              ${businesses.map((business) => `
                <a class="ty-business-card ${business.owned ? '' : 'locked'}" href="${buildBusinessHref(business.businessType)}">
                  <div class="ty-business-top">
                    <div>
                      <div class="ty-business-badge">${escapeHtml(business.icon)}</div>
                    </div>
                    <div class="ty-mini-pill">${business.owned ? 'Owned' : 'Locked'}</div>
                  </div>
                  <div>
                    <h3 class="ty-business-name">${escapeHtml(business.shopName || business.name)}</h3>
                    <div class="ty-business-level">Level ${formatNumber(business.level || 0)}${business.prestigeLevel ? ` • Prestige ${formatNumber(business.prestigeLevel)}` : ''}</div>
                  </div>
                  <div class="ty-business-bottom">
                    <div>
                      <div class="ty-business-income">${formatCompact(business.incomePerSecond)}<small>${escapeHtml(business.incomeLabel || 'XP/sec')}</small></div>
                      <div class="ty-business-note">${business.supported ? 'Managed page ready' : 'Preview only in this first slice'}</div>
                    </div>
                    <div class="ty-outline-btn">${business.owned ? (business.supported ? 'Manage' : 'View') : 'Preview'}</div>
                  </div>
                </a>
              `).join('')}
            </div>
          </section>

          <section class="ty-section">
            <div class="ty-section-head">
              <h2 class="ty-section-title">Recent Activity</h2>
              <div class="ty-section-sub">First pass: business records from the current account overview.</div>
            </div>
            ${recent.length ? `
              <div class="ty-summary-card">
                <div class="ty-raw-list">
                  ${recent.slice(0, 6).map((row) => `
                    <div class="ty-raw-row">
                      <span class="label">${escapeHtml(row.businessName || row.business_name || row.businessType || row.business_type || 'Business')}</span>
                      <span class="value">${escapeHtml(row.label || row.record || row.value || row.amount || 'Updated')}</span>
                    </div>
                  `).join('')}
                </div>
              </div>
            ` : `
              <div class="ty-empty">
                <h3>No recent empire activity yet</h3>
                <p>Once TycoonIO is fully cut over, this section can show collections, upgrades, prestige moments, and unlocks.</p>
              </div>
            `}
          </section>
        </div>
      </div>
    `;
  }

  function renderUpgradeCards(availableUpgrades, currencyLabel) {
    const entries = Object.entries(availableUpgrades || {});
    if (!entries.length) {
      return `<div class="ty-empty"><h3>No upgrades yet</h3><p>This business has no upgrade definitions exposed in the current payload.</p></div>`;
    }
    return `
      <div class="ty-upgrade-grid">
        ${entries.map(([key, def]) => {
          const preview = def.effectPreview || {};
          return `
            <div class="ty-upgrade-card ${def.maxed ? 'maxed' : ''}">
              <div class="ty-upgrade-top">
                <div>
                  <div class="ty-upgrade-name">${escapeHtml(def.emoji || '•')} ${escapeHtml(def.name || key)}</div>
                  <div class="ty-upgrade-level">Lv. ${escapeHtml(def.currentLevel)} / ${escapeHtml(def.maxLevel)}</div>
                </div>
                <div class="ty-mini-pill">${def.maxed ? 'MAX' : escapeHtml(currencyLabel)}</div>
              </div>
              <p class="ty-card-copy">${escapeHtml(def.desc || '')}</p>
              ${preview.current ? `
                <div class="ty-upgrade-preview">
                  <span>${escapeHtml(preview.current)}</span>
                  ${preview.next && !def.maxed ? `<strong>${escapeHtml(preview.next)}</strong>` : ''}
                </div>
              ` : ''}
              <div class="ty-upgrade-actions">
                ${def.maxed ? `
                  <button class="ty-subtle-btn" disabled>Max Level</button>
                ` : `
                  <button class="ty-primary-btn" data-action="upgrade" data-upgrade-type="${escapeHtml(key)}">+1 • ${escapeHtml(formatNumber(def.cost || 0))} ${escapeHtml(currencyLabel)}</button>
                  <button class="ty-outline-btn" data-action="upgrade-max" data-upgrade-type="${escapeHtml(key)}" ${def.maxBuy && def.maxBuy.levels > 0 ? '' : 'disabled'}>MAX${def.maxBuy && def.maxBuy.levels > 0 ? ` (+${escapeHtml(def.maxBuy.levels)})` : ''}</button>
                `}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderCustomizationGroups(groups) {
    const entries = Object.entries(groups || {});
    if (!entries.length) return '';
    return `
      <div class="ty-custom-grid">
        ${entries.map(([category, group]) => `
          <div class="ty-panel">
            <h3>${escapeHtml(group.name || category)}</h3>
            <div class="ty-pill-row">
              ${(group.options || []).map((option) => `
                <button
                  class="${option.selected ? 'ty-primary-btn' : 'ty-subtle-btn'}"
                  data-action="customize"
                  data-category="${escapeHtml(category)}"
                  data-value="${escapeHtml(option.id)}"
                  ${option.locked ? 'disabled' : ''}>
                  ${escapeHtml(option.name)}
                  ${option.locked && option.minPrestige ? ` • P${escapeHtml(option.minPrestige)}` : ''}
                </button>
              `).join('')}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }

  function renderRenamePanel(currentName) {
    return `
      <div class="ty-panel">
        <h3>Rename</h3>
        <div class="ty-rename-row">
          <input class="ty-input" type="text" data-rename-input maxlength="24" value="${escapeHtml(currentName || '')}" placeholder="Business name">
          <button class="ty-outline-btn" data-action="rename">Save Name</button>
        </div>
      </div>
    `;
  }

  function newspaperDetailSections(detail) {
    const payload = detail.payload || {};
    if (!payload.hasRoute) {
      return `
        <section class="ty-empty">
          <h3>Route not initialized yet</h3>
          <p>Your Newspaper business is owned, but the managed route hasn’t been created yet on this account.</p>
          <div class="ty-state-actions">
            <button class="ty-primary-btn" data-action="init">Initialize Route</button>
          </div>
        </section>
      `;
    }

    const route = payload.route || {};
    const pending = payload.pending || {};
    const upgrades = payload.upgrades || {};
    const totalUpgradeLevels = Object.values(upgrades).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const prestigeReady = Number(route.routeLevel || 0) >= 100;
    const customizationGroups = buildCustomizationGroups(payload);

    return `
      <div class="ty-detail-stack">
        <section class="ty-detail-grid">
          <div class="ty-panel">
            <h2>Income + Progression</h2>
            <div class="ty-stat-list">
              <div class="ty-stat-row"><span class="label">Current route level</span><span class="value">Lv. ${escapeHtml(route.routeLevel || 0)}</span></div>
              <div class="ty-stat-row"><span class="label">Pending XP</span><span class="value">${escapeHtml(formatNumber(Math.floor(pending.xpEarned || 0)))} XP</span></div>
              <div class="ty-stat-row"><span class="label">Income rate</span><span class="value">${escapeHtml(formatRate(route.incomePerSecond || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Prestige tier</span><span class="value">${escapeHtml(route.prestigeTier || 'Paperboy')}</span></div>
              <div class="ty-stat-row"><span class="label">Income multiplier</span><span class="value">${escapeHtml(route.prestigeMultiplier || 1)}x</span></div>
            </div>
          </div>
          <div class="ty-panel">
            <h2>Route Stats</h2>
            <div class="ty-stat-list">
              <div class="ty-stat-row"><span class="label">Papers delivered</span><span class="value">${escapeHtml(formatNumber(route.totalPapersDelivered || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Total XP earned</span><span class="value">${escapeHtml(formatNumber(route.totalXpEarned || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Total upgrade levels</span><span class="value">${escapeHtml(formatNumber(totalUpgradeLevels))}</span></div>
              <div class="ty-stat-row"><span class="label">Your XP</span><span class="value">${escapeHtml(formatNumber(Math.floor(payload.playerCoins || 0)))}</span></div>
            </div>
          </div>
        </section>

        <section class="ty-section">
          <div class="ty-section-head">
            <h2 class="ty-section-title">Upgrades</h2>
            <div class="ty-section-sub">These are the same route upgrades already backing the live portal.</div>
          </div>
          ${renderUpgradeCards(payload.availableUpgrades, 'XP')}
        </section>

        <section class="ty-detail-grid">
          <div class="ty-panel">
            <h2>Prestige</h2>
            <p class="ty-card-copy">${prestigeReady ? 'Level 100 reached. Prestige can be triggered right now.' : `Reach route level 100 to prestige. Current progress: ${route.routeLevel || 0}/100.`}</p>
            <div class="ty-detail-actions">
              <button class="${prestigeReady ? 'ty-danger-btn' : 'ty-subtle-btn'}" data-action="prestige" ${prestigeReady ? '' : 'disabled'}>Prestige Route</button>
            </div>
          </div>
          <div class="ty-panel">
            <h2>Theme</h2>
            <p class="ty-card-copy">Prestige now unlocks one page theme at a time. Picking a theme recolors the whole Newspaper Route page.</p>
          </div>
        </section>

        ${renderCustomizationGroups(customizationGroups)}
        ${renderRenamePanel(route.routeName || detail.summary?.title)}
      </div>
    `;
  }

  function carwashDetailSections(detail) {
    const payload = detail.payload || {};
    if (!payload.hasShop) {
      return `
        <section class="ty-empty">
          <h3>Car Wash not initialized yet</h3>
          <p>Your Car Wash business is owned, but the managed shop state hasn’t been created yet on this account.</p>
          <div class="ty-state-actions">
            <button class="ty-primary-btn" data-action="init">Initialize Car Wash</button>
          </div>
        </section>
      `;
    }

    const shop = payload.shop || {};
    const upgrades = payload.upgrades || {};
    const totalUpgradeLevels = Object.values(upgrades).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const prestigeReady = Number(shop.shopLevel || 0) >= 100;
    const customizationGroups = buildCustomizationGroups(payload);

    return `
      <div class="ty-detail-stack">
        <section class="ty-detail-grid">
          <div class="ty-panel">
            <h2>Income + Clean Cash</h2>
            <div class="ty-stat-list">
              <div class="ty-stat-row"><span class="label">Wash value per second</span><span class="value">${escapeHtml(formatUnitRate(shop.incomePerSecond || 0, 'wash/sec'))}</span></div>
              <div class="ty-stat-row"><span class="label">Clean cash per second</span><span class="value">${escapeHtml(formatCompact(shop.cleanCashPerSec || 0))} clean/sec</span></div>
              <div class="ty-stat-row"><span class="label">Current clean cash</span><span class="value">${escapeHtml(formatNumber(Math.floor(shop.cleanCash || 0)))}</span></div>
              <div class="ty-stat-row"><span class="label">Storage cap</span><span class="value">${escapeHtml(formatNumber(shop.cleanCashCap || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Laundering rate</span><span class="value">${escapeHtml(((shop.launderingRate || 0) * 100).toFixed(2))}%</span></div>
            </div>
          </div>
          <div class="ty-panel">
            <h2>Shop Stats</h2>
            <div class="ty-stat-list">
              <div class="ty-stat-row"><span class="label">Shop level</span><span class="value">Lv. ${escapeHtml(shop.shopLevel || 0)}</span></div>
              <div class="ty-stat-row"><span class="label">Cars washed</span><span class="value">${escapeHtml(formatNumber(shop.totalCarsWashed || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Total clean earned</span><span class="value">${escapeHtml(formatNumber(Math.floor(shop.totalCleanEarned || 0)))}</span></div>
              <div class="ty-stat-row"><span class="label">Prestige level</span><span class="value">${escapeHtml(formatNumber(shop.prestigeLevel || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Upgrade levels</span><span class="value">${escapeHtml(formatNumber(totalUpgradeLevels))}</span></div>
            </div>
          </div>
        </section>

        <section class="ty-section">
          <div class="ty-section-head">
            <h2 class="ty-section-title">Upgrades</h2>
            <div class="ty-section-sub">First pass uses the live clean-cash upgrade definitions from the existing managed shop.</div>
          </div>
          ${renderUpgradeCards(payload.availableUpgrades, 'clean cash')}
        </section>

        <section class="ty-detail-grid">
          <div class="ty-panel">
            <h2>Prestige</h2>
            <p class="ty-card-copy">${prestigeReady ? 'Level 100 reached. Prestige is available right now.' : `Reach shop level 100 to prestige. Current progress: ${shop.shopLevel || 0}/100.`}</p>
            <div class="ty-detail-actions">
              <button class="${prestigeReady ? 'ty-danger-btn' : 'ty-subtle-btn'}" data-action="prestige" ${prestigeReady ? '' : 'disabled'}>Prestige Car Wash</button>
            </div>
            ${payload.taxSeason && payload.taxSeason.ok ? `
              <div class="ty-note" style="margin-top:14px;">
                Tax Season: ${payload.taxSeason.state?.completed ? 'resolved' : payload.taxSeason.eligibility?.eligible ? 'eligible' : 'locked'}.
              </div>
            ` : ''}
          </div>
          <div class="ty-panel">
            <h2>Stock Mogul Bridge</h2>
            <p class="ty-card-copy">${payload.hasStockMogul ? 'Stock Mogul is already unlocked from this Car Wash.' : `Stock Mogul can be unlocked once you have ${formatNumber(payload.stockMogulCost || 5000)} clean cash.`}</p>
          </div>
        </section>

        ${renderCustomizationGroups(customizationGroups)}
        ${renderRenamePanel(shop.shopName || detail.summary?.title)}
      </div>
    `;
  }

  function pizzaDetailSections(detail) {
    const payload = detail.payload || {};
    if (!payload.hasShop) {
      return `
        <section class="ty-empty">
          <h3>Pizza Shop not initialized yet</h3>
          <p>Your Pizza Shop is owned, but the managed shop state is not ready on this account yet.</p>
          <div class="ty-state-actions">
            <button class="ty-primary-btn" data-action="init">Initialize Pizza Shop</button>
          </div>
        </section>
      `;
    }

    const shop = payload.shop || {};
    const upgrades = payload.upgrades || {};
    const totalUpgradeLevels = Object.values(upgrades).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const prestigeReady = Number(shop.shopLevel || 0) >= 100;
    const customizationGroups = buildCustomizationGroups(payload);

    return `
      <div class="ty-detail-stack">
        <section class="ty-detail-grid">
          <div class="ty-panel">
            <h2>Income + Pizza Cash</h2>
            <div class="ty-stat-list">
              <div class="ty-stat-row"><span class="label">Pizza cash per second</span><span class="value">${escapeHtml(formatUnitRate(shop.incomePerSecond || 0, 'pizza cash/sec'))}</span></div>
              <div class="ty-stat-row"><span class="label">Current pizza cash</span><span class="value">${escapeHtml(formatNumber(Math.floor(shop.pizzaCoins || 0)))}</span></div>
              <div class="ty-stat-row"><span class="label">Pending pizza cash</span><span class="value">${escapeHtml(formatNumber(Math.floor((payload.pending || {}).pizzaCoins || 0)))}</span></div>
              <div class="ty-stat-row"><span class="label">Current shop level</span><span class="value">Lv. ${escapeHtml(shop.shopLevel || 0)}</span></div>
              <div class="ty-stat-row"><span class="label">Prestige tier</span><span class="value">${escapeHtml(shop.prestigeTier || 'Amateur')}</span></div>
            </div>
          </div>
          <div class="ty-panel">
            <h2>Shop Stats</h2>
            <div class="ty-stat-list">
              <div class="ty-stat-row"><span class="label">Pizzas served</span><span class="value">${escapeHtml(formatNumber(shop.totalPizzasServed || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Total pizza cash earned</span><span class="value">${escapeHtml(formatNumber(shop.totalCoinsEarned || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Cycle time</span><span class="value">${escapeHtml(formatNumber(shop.cycleTime || 0))} sec</span></div>
              <div class="ty-stat-row"><span class="label">Delivery bonus</span><span class="value">${escapeHtml(formatCompact(shop.deliveryBonus || 1))}x</span></div>
              <div class="ty-stat-row"><span class="label">Upgrade levels</span><span class="value">${escapeHtml(formatNumber(totalUpgradeLevels))}</span></div>
            </div>
          </div>
        </section>

        <section class="ty-section">
          <div class="ty-section-head">
            <h2 class="ty-section-title">Upgrades</h2>
            <div class="ty-section-sub">This page now uses the live Pizza Shop upgrade definitions already powering the portal.</div>
          </div>
          ${renderUpgradeCards(payload.availableUpgrades, 'pizza cash')}
        </section>

        <section class="ty-detail-grid">
          <div class="ty-panel">
            <h2>Prestige</h2>
            <p class="ty-card-copy">${prestigeReady ? 'Level 100 reached. Prestige can be triggered right now.' : `Reach shop level 100 to prestige. Current progress: ${shop.shopLevel || 0}/100.`}</p>
            <div class="ty-detail-actions">
              <button class="${prestigeReady ? 'ty-danger-btn' : 'ty-subtle-btn'}" data-action="prestige" ${prestigeReady ? '' : 'disabled'}>Prestige Pizza Shop</button>
            </div>
          </div>
          <div class="ty-panel">
            <h2>Theme</h2>
            <p class="ty-card-copy">Prestige now unlocks a single page theme instead of a stack of separate cosmetic slots.</p>
          </div>
        </section>

        ${renderCustomizationGroups(customizationGroups)}
        ${renderRenamePanel(shop.shopName || detail.summary?.title)}
      </div>
    `;
  }

  function stockMogulDetailSections(detail) {
    const payload = detail.payload || {};
    if (!payload.hasPortfolio) {
      return `
        <section class="ty-empty">
          <h3>Stock Mogul not initialized yet</h3>
          <p>Your account does not have an active Stock Mogul portfolio yet.</p>
          <div class="ty-state-actions">
            <button class="ty-primary-btn" data-action="init">Initialize Portfolio</button>
          </div>
        </section>
      `;
    }

    const portfolio = payload.portfolio || {};
    const upgrades = payload.upgrades || {};
    const totalUpgradeLevels = Object.values(upgrades).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const prestigeReady = Number(portfolio.portfolioLevel || 0) >= 100;
    const customizationGroups = buildCustomizationGroups(payload);

    return `
      <div class="ty-detail-stack">
        <section class="ty-detail-grid">
          <div class="ty-panel">
            <h2>Portfolio Income</h2>
            <div class="ty-stat-list">
              <div class="ty-stat-row"><span class="label">Dividends per second</span><span class="value">${escapeHtml(formatUnitRate(portfolio.incomePerSecond || 0, 'portfolio cash/sec'))}</span></div>
              <div class="ty-stat-row"><span class="label">Portfolio cash</span><span class="value">${escapeHtml(formatNumber(Math.floor(portfolio.portfolioCoins || 0)))}</span></div>
              <div class="ty-stat-row"><span class="label">Portfolio cash cap</span><span class="value">${escapeHtml(formatNumber(portfolio.portfolioCoinsCap || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Pending portfolio cash</span><span class="value">${escapeHtml(formatNumber(Math.floor((payload.pending || {}).portfolioCoins || 0)))}</span></div>
              <div class="ty-stat-row"><span class="label">Clean cash available</span><span class="value">${escapeHtml(formatNumber(Math.floor(portfolio.cleanCash || 0)))}</span></div>
            </div>
          </div>
          <div class="ty-panel">
            <h2>Portfolio Stats</h2>
            <div class="ty-stat-list">
              <div class="ty-stat-row"><span class="label">Portfolio level</span><span class="value">Lv. ${escapeHtml(portfolio.portfolioLevel || 0)}</span></div>
              <div class="ty-stat-row"><span class="label">Trades made</span><span class="value">${escapeHtml(formatNumber(portfolio.totalTrades || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Total XP earned</span><span class="value">${escapeHtml(formatNumber(Math.floor(portfolio.totalCoinsEarned || 0)))}</span></div>
              <div class="ty-stat-row"><span class="label">Prestige level</span><span class="value">${escapeHtml(formatNumber(portfolio.prestigeLevel || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Upgrade levels</span><span class="value">${escapeHtml(formatNumber(totalUpgradeLevels))}</span></div>
            </div>
          </div>
        </section>

        <section class="ty-section">
          <div class="ty-section-head">
            <h2 class="ty-section-title">Upgrades</h2>
            <div class="ty-section-sub">These are the live clean-cash portfolio upgrades already available through the current Stock Mogul page.</div>
          </div>
          ${renderUpgradeCards(payload.availableUpgrades, 'clean cash')}
        </section>

        <section class="ty-detail-grid">
          <div class="ty-panel">
            <h2>Prestige</h2>
            <p class="ty-card-copy">${prestigeReady ? 'Level 100 reached. Prestige can be triggered right now.' : `Reach portfolio level 100 to prestige. Current progress: ${portfolio.portfolioLevel || 0}/100.`}</p>
            <div class="ty-detail-actions">
              <button class="${prestigeReady ? 'ty-danger-btn' : 'ty-subtle-btn'}" data-action="prestige" ${prestigeReady ? '' : 'disabled'}>Prestige Portfolio</button>
            </div>
          </div>
          <div class="ty-panel">
            <h2>Theme</h2>
            <p class="ty-card-copy">Prestige now unlocks one full-page theme at a time, so the entire business page shifts with your selection.</p>
          </div>
        </section>

        ${renderCustomizationGroups(customizationGroups)}
        ${renderRenamePanel(portfolio.portfolioName || detail.summary?.title)}
      </div>
    `;
  }

  const managedBusinessSpecs = {
    gym: {
      hasKey: 'hasGym',
      stateKey: 'gym',
      levelKey: 'gymLevel',
      progressKey: 'gymXp',
      nameKey: 'gymName',
      title: 'Gym',
      emptyTitle: 'Gym not initialized yet',
      emptyCopy: 'Your Gym is owned, but the managed state is not ready on this account yet.',
      initLabel: 'Initialize Gym',
      totalLabel: 'Members trained',
      totalKey: 'totalMembersTrained',
      prestigeAction: 'Prestige Gym',
      noteTitle: 'Theme',
      noteCopy: 'Prestige unlocks one full-page theme at a time, and the selected theme recolors the whole Gym page.'
    },
    cinema: {
      hasKey: 'hasCinema',
      stateKey: 'cinema',
      levelKey: 'cinemaLevel',
      progressKey: 'cinemaXp',
      nameKey: 'cinemaName',
      title: 'Movie Theater',
      emptyTitle: 'Movie Theater not initialized yet',
      emptyCopy: 'Your Movie Theater is owned, but the managed state is not ready on this account yet.',
      initLabel: 'Initialize Theater',
      totalLabel: 'Viewers served',
      totalKey: 'totalViewersServed',
      prestigeAction: 'Prestige Theater',
      noteTitle: 'Theme',
      noteCopy: 'Prestige unlocks one full-page theme at a time, and the selected theme recolors the whole Theater page.'
    }
  };

  function managedBusinessDetailSections(detail, config) {
    const payload = detail.payload || {};
    if (!payload[config.hasKey]) {
      return `
        <section class="ty-empty">
          <h3>${escapeHtml(config.emptyTitle)}</h3>
          <p>${escapeHtml(config.emptyCopy)}</p>
          <div class="ty-state-actions">
            <button class="ty-primary-btn" data-action="init">${escapeHtml(config.initLabel)}</button>
          </div>
        </section>
      `;
    }

    const state = payload[config.stateKey] || {};
    const upgrades = payload.upgrades || {};
    const totalUpgradeLevels = Object.values(upgrades).reduce((sum, value) => sum + (Number(value) || 0), 0);
    const prestigeReady = Number(state[config.levelKey] || 0) >= 100;
    const customizationGroups = buildCustomizationGroups(payload);

    return `
      <div class="ty-detail-stack">
        <section class="ty-detail-grid">
          <div class="ty-panel">
            <h2>Income + Progression</h2>
            <div class="ty-stat-list">
              <div class="ty-stat-row"><span class="label">Income rate</span><span class="value">${escapeHtml(formatRate(state.incomePerSecond || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Current level</span><span class="value">Lv. ${escapeHtml(state[config.levelKey] || 0)}</span></div>
              <div class="ty-stat-row"><span class="label">Current level progress</span><span class="value">${escapeHtml(formatNumber(Math.floor(state[config.progressKey] || 0)))}</span></div>
              <div class="ty-stat-row"><span class="label">Pending XP</span><span class="value">${escapeHtml(formatNumber(Math.floor((payload.pending || {}).xpEarned || 0)))} XP</span></div>
              <div class="ty-stat-row"><span class="label">Prestige tier</span><span class="value">${escapeHtml(state.prestigeTier || 'Base')}</span></div>
            </div>
          </div>
          <div class="ty-panel">
            <h2>Business Stats</h2>
            <div class="ty-stat-list">
              <div class="ty-stat-row"><span class="label">${escapeHtml(config.totalLabel)}</span><span class="value">${escapeHtml(formatNumber(state[config.totalKey] || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Total XP earned</span><span class="value">${escapeHtml(formatNumber(state.totalXpEarned || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Your XP</span><span class="value">${escapeHtml(formatNumber(Math.floor(payload.playerCoins || 0)))}</span></div>
              <div class="ty-stat-row"><span class="label">Collect cap</span><span class="value">${escapeHtml(formatNumber(payload.collectCap || 0))}</span></div>
              <div class="ty-stat-row"><span class="label">Upgrade levels</span><span class="value">${escapeHtml(formatNumber(totalUpgradeLevels))}</span></div>
            </div>
          </div>
        </section>

        <section class="ty-section">
          <div class="ty-section-head">
            <h2 class="ty-section-title">Upgrades</h2>
            <div class="ty-section-sub">This page uses the same managed-business upgrade definitions already backing the live business system.</div>
          </div>
          ${renderUpgradeCards(payload.availableUpgrades, 'XP')}
        </section>

        <section class="ty-detail-grid">
          <div class="ty-panel">
            <h2>Prestige</h2>
            <p class="ty-card-copy">${prestigeReady ? 'Level 100 reached. Prestige can be triggered right now.' : `Reach level 100 to prestige. Current progress: ${state[config.levelKey] || 0}/100.`}</p>
            <div class="ty-detail-actions">
              <button class="${prestigeReady ? 'ty-danger-btn' : 'ty-subtle-btn'}" data-action="prestige" ${prestigeReady ? '' : 'disabled'}>${escapeHtml(config.prestigeAction)}</button>
            </div>
          </div>
          <div class="ty-panel">
            <h2>${escapeHtml(config.noteTitle)}</h2>
            <p class="ty-card-copy">${escapeHtml(config.noteCopy)}</p>
          </div>
        </section>

        ${renderCustomizationGroups(customizationGroups)}
        ${renderRenamePanel(state[config.nameKey] || detail.summary?.title)}
      </div>
    `;
  }

  function detailMarkup(session, detail) {
    const business = detail.business || {};
    const summary = detail.summary || {};
    const payload = detail.payload;
    const rawPreview = payload ? escapeHtml(JSON.stringify(payload, null, 2)) : '';
    const statRows = summary.stats || [];
    const businessType = business.businessType;
    let customSections = '';

    if (businessType === 'newspaper' && business.supported && business.owned) {
      customSections = newspaperDetailSections(detail);
    } else if (businessType === 'carwash' && business.supported && business.owned) {
      customSections = carwashDetailSections(detail);
    } else if (businessType === 'pizza' && business.supported && business.owned) {
      customSections = pizzaDetailSections(detail);
    } else if (businessType === 'stockmogul' && business.supported && business.owned) {
      customSections = stockMogulDetailSections(detail);
    } else if (businessType === 'gym' && business.supported && business.owned) {
      customSections = managedBusinessDetailSections(detail, managedBusinessSpecs.gym);
    } else if (businessType === 'cinema' && business.supported && business.owned) {
      customSections = managedBusinessDetailSections(detail, managedBusinessSpecs.cinema);
    }
    const canCollect = business.supported && business.owned && (
      (businessType === 'newspaper' ? !!payload?.hasRoute :
      businessType === 'carwash' ? !!payload?.hasShop :
      businessType === 'pizza' ? !!payload?.hasShop :
      businessType === 'stockmogul' ? !!payload?.hasPortfolio :
      businessType === 'gym' ? !!payload?.hasGym :
      businessType === 'cinema' ? !!payload?.hasCinema :
      true)
    );

    return `
      <div class="ty-page">
        <div class="ty-shell">
          ${topbar(session.user, WORD_TYCOON_URL)}

          <div class="ty-breadcrumb">
            <a href="${getAppRootHref()}">TycoonIO</a>
            <span>/</span>
            <strong>${escapeHtml(summary.title || business.name || 'Business')}</strong>
          </div>

          <section class="ty-hero">
            <div class="ty-hero-copy">
              <div class="ty-eyebrow">Managed Business</div>
              <h1>${escapeHtml(summary.title || business.shopName || business.name || 'Business')}</h1>
              <p>${business.supported ? 'This page now uses the live managed-business data flow, with richer first-pass TycoonIO modules for Newspaper, Car Wash, Pizza Shop, Stock Mogul, Gym, and Cinema.' : 'This business is visible in TycoonIO, but its dedicated management page has not been wired yet.'}</p>
            </div>
            <div class="ty-hero-stats">
              <div class="ty-stat">
                <span class="ty-stat-value live">${formatNumber(summary.currentLevel || business.level || 0)}</span>
                <div class="ty-stat-label">current level</div>
              </div>
              <div class="ty-stat">
                <span class="ty-stat-value value">${formatCompact(summary.incomePerSecond || business.incomePerSecond || 0)}</span>
                <div class="ty-stat-label">${escapeHtml(summary.incomeLabel || business.incomeLabel || 'XP/sec')}</div>
              </div>
              <div class="ty-stat">
                <span class="ty-stat-value growth">${formatCompact(summary.readyToCollect || 0)}</span>
                <div class="ty-stat-label">${escapeHtml(summary.readyLabel || 'ready to collect')}</div>
              </div>
              <div class="ty-stat">
                <span class="ty-stat-value">${formatNumber(summary.prestigeLevel || business.prestigeLevel || 0)}</span>
                <div class="ty-stat-label">prestige level</div>
              </div>
            </div>
            <div class="ty-detail-actions">
              <a class="ty-outline-btn" href="${getAppRootHref()}">Back to Dashboard</a>
              ${canCollect ? `<button class="ty-primary-btn" data-action="collect">Collect</button>` : ''}
              <a class="ty-link-btn" href="${WORD_TYCOON_URL}">Back to Word Tycoon</a>
            </div>
          </section>

          ${customSections ? customSections : `
          <div class="ty-detail-grid">
            <section class="ty-panel">
              <h2>Current Snapshot</h2>
              ${statRows.length ? `
                <div class="ty-stat-list">
                  ${statRows.map((row) => `
                    <div class="ty-stat-row">
                      <span class="label">${escapeHtml(row.label)}</span>
                      <span class="value">${escapeHtml(row.value)}</span>
                    </div>
                  `).join('')}
                </div>
              ` : `<p class="ty-card-copy">This first TycoonIO slice is showing the shared normalized business summary here. Richer per-business modules come next.</p>`}
            </section>

            <section class="ty-panel">
              <h2>Status</h2>
              <div class="ty-summary-list">
                <div class="ty-summary-row"><span class="label">Managed support</span><span class="value">${business.supported ? 'Live wrapper ready' : 'Not wired yet'}</span></div>
                <div class="ty-summary-row"><span class="label">Owned</span><span class="value">${business.owned ? 'Yes' : 'No'}</span></div>
                <div class="ty-summary-row"><span class="label">Primary payload key</span><span class="value">${escapeHtml(summary.primaryKey || 'n/a')}</span></div>
              </div>
              <p class="ty-note">This page is intentionally conservative in the first implementation pass. The structure is live, session-aware, and backed by generic business wrappers without trying to hard-code every business system all at once.</p>
            </section>
          </div>

          ${payload ? `
            <section class="ty-panel">
              <h3>Raw Payload Preview</h3>
              <div class="ty-note">Temporary implementation aid while the per-business modules are still being carved out.</div>
              <div class="ty-code">${rawPreview}</div>
            </section>
          ` : `
            <section class="ty-empty">
              <h3>Managed page not wired yet</h3>
              <p>This business does not have a dedicated TycoonIO wrapper yet. The dashboard still shows it so the product split can move forward without hiding part of the empire.</p>
            </section>
          `}`}
        </div>
      </div>
    `;
  }

  async function fetchJson(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({ ok: false, error: 'Invalid response' }));
    if (!response.ok && !data.ok) {
      throw new Error(data.error || data.message || 'Request failed');
    }
    return data;
  }

  async function renderDashboard(session) {
    applyPageTheme(DEFAULT_THEME_ID);
    const overview = await fetchJson('/api/tycoon/overview');
    app.innerHTML = dashboardMarkup(session, overview);
    scrollToSectionTarget();
  }

  async function renderBusinessDetail(session, businessType) {
    const detail = await fetchJson(`/api/tycoon/${encodeURIComponent(businessType)}`);
    applyPageTheme(getDetailThemeId(detail));
    app.innerHTML = detailMarkup(session, detail);

    app.querySelectorAll('[data-action]').forEach((element) => {
      element.addEventListener('click', async () => {
        const action = element.getAttribute('data-action');
        const body = {};

        if (action === 'rename') {
          const input = app.querySelector('[data-rename-input]');
          body.name = input ? input.value.trim() : '';
          if (!body.name) {
            window.alert('Enter a name first.');
            return;
          }
        }

        if (action === 'customize') {
          body.category = element.getAttribute('data-category');
          body.value = element.getAttribute('data-value');
        }

        if (action === 'upgrade' || action === 'upgrade-max') {
          body.upgradeType = element.getAttribute('data-upgrade-type');
        }

        const labels = {
          collect: 'Collecting...',
          init: 'Initializing...',
          prestige: 'Prestiging...',
          rename: 'Saving...',
          customize: 'Applying Theme...',
          upgrade: 'Upgrading...',
          'upgrade-max': 'Buying max...'
        };

        const original = element.textContent;
        element.disabled = true;
        element.textContent = labels[action] || 'Working...';
        try {
          await fetchJson(`/api/tycoon/${encodeURIComponent(businessType)}/${encodeURIComponent(action)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
          });
          await renderBusinessDetail(session, businessType);
        } catch (error) {
          element.disabled = false;
          element.textContent = original;
          window.alert(error.message || 'Action failed');
        }
      });
    });
  }

  async function boot() {
    applyPageTheme(DEFAULT_THEME_ID);
    app.innerHTML = loadingMarkup();
    try {
      if (authToken) {
        await exchangeAuthToken(authToken);
      }

      const session = await fetchJson('/api/me/session');
      if (!session.ok) {
        if (!ssoChecked) {
          window.location.href = `${SSO_BRIDGE_URL}?returnTo=${encodeURIComponent(buildSsoReturnUrl())}`;
          return;
        }
        applyPageTheme(DEFAULT_THEME_ID);
        app.innerHTML = signedOutMarkup();
        return;
      }

      cleanAuthParams();

      const detailMatch = relativePath.match(/^\/business\/([^/]+)$/);
      if (detailMatch) {
        await renderBusinessDetail(session, detailMatch[1]);
      } else {
        await renderDashboard(session);
      }
    } catch (error) {
      applyPageTheme(DEFAULT_THEME_ID);
      app.innerHTML = errorMarkup('We couldn’t load TycoonIO right now.', error.message || 'Try again in a moment.', 'Try Again');
      const retry = app.querySelector('[data-retry]');
      if (retry) retry.addEventListener('click', boot);
    }
  }

  boot();
})();
