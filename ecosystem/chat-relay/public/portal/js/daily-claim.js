// ===== Daily Claim — Compact Header Pill + Popover =====
// Always-visible pill in the portal header bar.
// Click to expand a popover with streak track, reward preview, and claim button.

(function() {
  'use strict';

  var MILESTONE_DAYS = [3, 7, 14, 30];
  var CYCLE_LENGTH = 30;

  // ── Inject CSS ──
  var style = document.createElement('style');
  style.textContent = [
    // Pill in header
    '.dc-pill{display:none;align-items:center;gap:6px;padding:4px 12px 4px 8px;background:var(--surface2);border:1px solid var(--border);border-radius:20px;cursor:pointer;transition:all .2s;position:relative;font-family:inherit;color:var(--text);line-height:1}',
    '.dc-pill:hover{border-color:var(--accent);background:var(--surface)}',
    '.dc-pill.visible{display:flex}',
    '.dc-pill-flame{width:18px;height:18px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;overflow:visible}',
    '.dc-pill-flame svg{width:100%;height:100%;overflow:visible}',
    '.dc-pill-streak{font-size:12px;font-weight:700;color:var(--text);white-space:nowrap}',
    '.dc-pill-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}',
    '.dc-pill-dot.claimable{background:#4fc34f;box-shadow:0 0 6px rgba(79,195,79,.6);animation:dcDotPulse 2s ease-in-out infinite}',
    '.dc-pill-dot.claimed{background:var(--text-dim);opacity:.4}',
    '@keyframes dcDotPulse{0%,100%{box-shadow:0 0 4px rgba(79,195,79,.4)}50%{box-shadow:0 0 10px rgba(79,195,79,.8),0 0 20px rgba(79,195,79,.3)}}',

    // Popover
    '.dc-popover{display:none;position:fixed;width:340px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:9999;padding:16px;animation:dcPopIn .2s ease}',
    '.dc-popover.open{display:block}',
    '@keyframes dcPopIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:translateY(0)}}',

    // Popover header
    '.dc-pop-header{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}',
    '.dc-pop-title{font-size:14px;font-weight:800;color:var(--text);letter-spacing:.5px;text-transform:uppercase}',
    '.dc-pop-day{font-size:12px;color:var(--text-dim);font-weight:600}',

    // Streak track — compact grid
    '.dc-track{display:grid;grid-template-columns:repeat(10,1fr);gap:3px;margin-bottom:12px}',
    '.dc-cell{aspect-ratio:1;border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;background:var(--surface2);color:var(--text-dim);border:1px solid var(--border);position:relative;transition:all .25s}',
    '.dc-cell.claimed{background:#2d6a2d;color:#8eff8e;border-color:#3a8a3a}',
    '.dc-cell.current{background:var(--accent);color:#fff;border-color:var(--accent-hover);animation:dcPulse 2s ease-in-out infinite}',
    '.dc-cell.milestone{border-color:var(--warning)}',
    '.dc-cell.milestone.claimed{border-color:#ffab00;box-shadow:0 0 4px rgba(255,171,0,.3)}',
    '.dc-cell.milestone::after{content:"\\2605";position:absolute;top:-5px;right:-3px;font-size:7px;color:var(--warning)}',
    '@keyframes dcPulse{0%,100%{box-shadow:0 0 3px var(--accent)}50%{box-shadow:0 0 10px var(--accent),0 0 18px rgba(167,139,250,.25)}}',

    // Reward preview
    '.dc-reward{background:var(--surface2);border-radius:var(--radius);padding:10px 12px;margin-bottom:10px;font-size:12px;color:var(--text-dim);line-height:1.6}',
    '.dc-reward .dc-xp{color:var(--success);font-weight:700}',
    '.dc-reward .dc-milestone-bonus{color:var(--warning);font-weight:700;display:block;margin-top:3px}',
    '.dc-reward .dc-cosmetic-chance{color:var(--accent);display:block;margin-top:2px}',
    '.dc-reward .dc-logo-tease{display:flex;align-items:center;gap:8px;margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.08)}',
    '.dc-reward .dc-logo-tease img{width:34px;height:34px;border-radius:10px;object-fit:cover;background:rgba(255,255,255,.08)}',
    '.dc-reward .dc-logo-tease-copy{display:flex;flex-direction:column;gap:2px}',
    '.dc-reward .dc-logo-tease-title{color:var(--text);font-weight:700;font-size:11px}',
    '.dc-reward .dc-logo-tease-sub{color:var(--text-dim);font-size:10px}',

    // Claim button
    '.dc-claim-btn{display:block;width:100%;padding:10px;border:none;border-radius:var(--radius);font-size:13px;font-weight:700;cursor:pointer;transition:all .2s;text-transform:uppercase;letter-spacing:1px}',
    '.dc-claim-btn:not(:disabled){background:linear-gradient(135deg,#4fc34f,#3a9e3a);color:#fff;box-shadow:0 2px 10px rgba(79,195,79,.3)}',
    '.dc-claim-btn:not(:disabled):hover{transform:translateY(-1px);box-shadow:0 4px 16px rgba(79,195,79,.4)}',
    '.dc-claim-btn:disabled{background:var(--surface2);color:var(--text-dim);cursor:default}',
    '.dc-claim-btn.claimed-state{background:var(--surface2);color:var(--success)}',

    // Footer
    '.dc-pop-footer{margin-top:8px;font-size:11px;color:var(--text-dim);display:flex;justify-content:space-between;flex-wrap:wrap;gap:3px}',
    '.dc-pop-footer .dc-streak-info{font-weight:600}',

    // Result display
    '.dc-result{background:var(--surface2);border-radius:var(--radius);padding:12px;margin-bottom:10px;text-align:center}',
    '.dc-result-xp{font-size:22px;font-weight:900;color:var(--success)}',
    '.dc-result-breakdown{font-size:10px;color:var(--text-dim);margin-top:2px}',
    '.dc-result-cosmetic{margin-top:6px;font-size:12px;font-weight:600}',
    '.dc-result-milestone{margin-top:6px;padding:6px;background:rgba(255,171,0,.1);border-radius:var(--radius);border:1px solid rgba(255,171,0,.3)}',
    '.dc-result-milestone-label{color:var(--warning);font-weight:700;font-size:13px}',
    '.dc-result-milestone-items{color:var(--text-dim);font-size:11px;margin-top:3px}',
    '.dc-result-logos{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:10px}',
    '.dc-result-logo{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:12px;background:rgba(74,158,255,.08);border:1px solid rgba(74,158,255,.18)}',
    '.dc-result-logo img{width:34px;height:34px;border-radius:10px;object-fit:cover;background:rgba(255,255,255,.08)}',
    '.dc-result-logo-copy{text-align:left}',
    '.dc-result-logo-title{font-size:11px;font-weight:700;color:var(--text)}',
    '.dc-result-logo-sub{font-size:10px;color:var(--text-dim)}',

    // XP fly
    '@keyframes dcXpFly{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-40px) scale(1.2)}}',
    '.dc-xp-fly{position:absolute;top:40%;left:50%;transform:translateX(-50%);font-size:18px;font-weight:900;color:var(--success);pointer-events:none;animation:dcXpFly 1.2s ease-out forwards;z-index:10;text-shadow:0 0 10px rgba(79,195,79,.6)}',

    // Mobile
    '@media(max-width:600px){',
    '  .dc-pill-streak{font-size:11px}',
    '  .dc-cell{font-size:8px}',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  var pill = null;
  var popover = null;
  var claimBtn = null;
  var todayClaimBtn = null;
  var bannerEl = null;
  var bannerSub = null;
  var bannerBtn = null;
  var statusData = null;
  var claiming = false;
  var popoverOpen = false;
  var countdownTimer = null;

  function init() {
    // Build the pill and inject into header
    var headerLeft = document.querySelector('.header-left');
    if (!headerLeft) return;

    pill = document.createElement('button');
    pill.className = 'dc-pill';
    pill.setAttribute('aria-label', 'Daily Claim');
    pill.innerHTML =
      '<span class="dc-pill-flame"><svg viewBox="0 0 32 32" overflow="visible" aria-hidden="true"><ellipse cx="16" cy="26" rx="10" ry="5" fill="url(#fire-base-glow)"/><g filter="url(#fire-glow-sm)"><path d="M16 3 C16 3,20 8,19 12 C19 12,23 9,22 5 C25 9,27 14,25 19 C23.5 23,20 26,16 27 C12 26,8.5 23,7 19 C5 14,7 9,10 5 C9 9,13 12,13 12 C12 8,16 3 16 3Z" fill="url(#fire-body)"/></g><path d="M16 10 C16 10,18.5 13.5,18 16.5 C18 16.5,20 14.5,19.5 12 C21 14.5,21.5 17.5,20 20 C19 22,17.5 23.5,16 24 C14.5 23.5,13 22,12 20 C10.5 17.5,11 14.5,12.5 12 C12 14.5,14 16.5,14 16.5 C13.5 13.5,16 10 16 10Z" fill="url(#fire-inner)"/><ellipse cx="16" cy="21" rx="3" ry="3.5" fill="#FFFDE7" opacity="0.7"/></svg></span>' +
      '<span class="dc-pill-streak" id="dc-pill-streak"></span>' +
      '<span class="dc-pill-dot" id="dc-pill-dot"></span>';
    pill.addEventListener('click', function(e) {
      e.stopPropagation();
      togglePopover();
    });

    // Build popover inside pill (for positioning)
    popover = document.createElement('div');
    popover.className = 'dc-popover';
    popover.innerHTML =
      '<div class="dc-pop-header">' +
        '<span class="dc-pop-title">Daily Claim</span>' +
        '<span class="dc-pop-day" id="dc-pop-day">Day 0/30</span>' +
      '</div>' +
      '<div class="dc-track" id="dc-track"></div>' +
      '<div class="dc-reward" id="dc-reward-preview"></div>' +
      '<button class="dc-claim-btn" id="dc-claim-btn" disabled>Loading...</button>' +
      '<div class="dc-pop-footer" id="dc-pop-footer"></div>';
    popover.addEventListener('click', function(e) { e.stopPropagation(); });
    // Append popover to body (not pill) to escape sticky header stacking context
    document.body.appendChild(popover);

    headerLeft.appendChild(pill);
    claimBtn = document.getElementById('dc-claim-btn');
    claimBtn.addEventListener('click', handleClaim);
    todayClaimBtn = document.getElementById('today-claim-btn');
    if (todayClaimBtn) todayClaimBtn.addEventListener('click', handleClaim);

    // Top-of-home daily-login banner
    bannerEl = document.getElementById('daily-login-banner');
    bannerSub = document.getElementById('daily-login-banner-sub');
    bannerBtn = document.getElementById('daily-login-banner-btn');
    if (bannerBtn) bannerBtn.addEventListener('click', handleClaim);

    // Close popover on outside click or scroll
    document.addEventListener('click', function() {
      if (popoverOpen) closePopover();
    });
    window.addEventListener('scroll', function() {
      if (popoverOpen) closePopover();
    }, { passive: true });

    // Align popover if pill is too far right
    checkAlignment();
    window.addEventListener('resize', checkAlignment);

    // Remove the old card from Overview if present
    var oldCard = document.getElementById('daily-claim-card');
    if (oldCard) oldCard.style.display = 'none';

    window.portalDailyClaim = {
      getStatus: function() { return statusData; },
      open: function() {
        if (!popoverOpen) togglePopover();
      },
      claim: handleClaim,
      refresh: loadStatus
    };

    loadStatus();
  }

  function checkAlignment() {
    if (!pill || !popover) return;
    var rect = pill.getBoundingClientRect();
    var popW = 340;
    var vw = window.innerWidth;
    // On mobile, use nearly full width
    if (vw <= 600) popW = vw - 32;
    popover.style.width = popW + 'px';
    popover.style.top = (rect.bottom + 8) + 'px';
    // Center on pill, but clamp to viewport
    var left = rect.left + rect.width / 2 - popW / 2;
    if (left + popW > vw - 8) left = vw - popW - 8;
    if (left < 8) left = 8;
    popover.style.left = left + 'px';
  }

  function togglePopover() {
    if (popoverOpen) {
      closePopover();
    } else {
      popover.classList.add('open');
      popoverOpen = true;
      checkAlignment();
    }
  }

  function closePopover() {
    popover.classList.remove('open');
    popoverOpen = false;
  }

  function loadStatus() {
    fetch('/api/me/daily-claim/status', { credentials: 'same-origin' })
      .then(function(r) { return r.json(); })
      .then(function(data) {
        if (!data.ok && data.error) {
          pill.classList.remove('visible');
          syncTodayClaim(null);
          syncDailyLoginBanner(null);
          emitUpdate(null);
          return;
        }
        statusData = data;
        renderPill(data);
        renderPopover(data);
        syncTodayClaim(data);
        syncDailyLoginBanner(data);
        emitUpdate(data);
        pill.classList.add('visible');
      })
      .catch(function() {
        pill.classList.remove('visible');
        syncTodayClaim(null);
        syncDailyLoginBanner(null);
        emitUpdate(null);
      });
  }

  function renderPill(data) {
    var streakEl = document.getElementById('dc-pill-streak');
    var dotEl = document.getElementById('dc-pill-dot');
    streakEl.textContent = data.currentStreak + 'd';
    if (data.canClaim) {
      dotEl.className = 'dc-pill-dot claimable';
    } else {
      dotEl.className = 'dc-pill-dot claimed';
    }
  }

  function renderPopover(data) {
    // Day counter
    document.getElementById('dc-pop-day').textContent = 'Day ' + data.currentStreak + '/' + CYCLE_LENGTH;

    // Streak track (30 cells in 10x3 grid)
    var track = document.getElementById('dc-track');
    track.innerHTML = '';
    for (var i = 1; i <= CYCLE_LENGTH; i++) {
      var cell = document.createElement('div');
      cell.className = 'dc-cell';
      cell.textContent = i;
      if (MILESTONE_DAYS.indexOf(i) !== -1) cell.className += ' milestone';
      if (i <= data.currentStreak) {
        cell.className += ' claimed';
      } else if (i === data.currentStreak + 1 && data.canClaim) {
        cell.className += ' current';
      }
      track.appendChild(cell);
    }

    // Reward preview
    var preview = document.getElementById('dc-reward-preview');
    if (data.canClaim) {
      var xpLabel = data.previewXp ? ('~' + data.previewXp.scaled + ' XP') : '~150 XP';
      var tierLabel = data.previewXp && data.previewXp.tierLabel !== 'None' ? ' (' + data.previewXp.tierLabel + ')' : '';
      var html = "Today: <span class=\"dc-xp\">" + xpLabel + tierLabel + '</span>';
      html += '<span class="dc-cosmetic-chance">' + Math.round((data.cosmeticChance || 0.2) * 100) + '% cosmetic drop</span>';
      var nextDay = data.currentStreak + 1;
      if (MILESTONE_DAYS.indexOf(nextDay) !== -1 && data.nextMilestone && data.nextMilestone.day === nextDay) {
        html += '<span class="dc-milestone-bonus">MILESTONE: +' + formatNum(data.nextMilestone.bonusXp) + ' XP + ' + data.nextMilestone.lootBoxItems + '-item loot box!</span>';
      } else if (data.nextMilestone && data.nextMilestone.daysAway === 1) {
        html += '<span class="dc-milestone-bonus">MILESTONE tomorrow: +' + formatNum(data.nextMilestone.bonusXp) + ' XP!</span>';
      }
      if (data.nextProfileLogoUnlock) {
        html += buildLogoTeaseHtml(data.nextProfileLogoUnlock, data.nextProfileLogoUnlock.claimsAway);
      }
      preview.innerHTML = html;
    } else {
      var nextDay = data.currentStreak < CYCLE_LENGTH ? data.currentStreak + 1 : 1;
      var claimedHtml = '<span style="color:var(--success);font-weight:700">\u2713 Day ' + data.currentStreak + ' claimed</span><span style="color:var(--text-dim);font-size:11px;display:block;margin-top:3px">Day ' + nextDay + ' available at midnight UTC</span>';
      if (data.nextProfileLogoUnlock) {
        claimedHtml += buildLogoTeaseHtml(data.nextProfileLogoUnlock, data.nextProfileLogoUnlock.claimsAway);
      }
      preview.innerHTML = claimedHtml;
    }

    // Button
    if (data.canClaim) {
      claimBtn.disabled = false;
      claimBtn.textContent = 'Claim';
      claimBtn.className = 'dc-claim-btn';
      if (todayClaimBtn) {
        todayClaimBtn.disabled = false;
        todayClaimBtn.textContent = 'Claim Now';
        todayClaimBtn.className = 'today-claim-btn';
      }
    } else {
      claimBtn.disabled = true;
      claimBtn.className = 'dc-claim-btn claimed-state';
      if (todayClaimBtn) {
        todayClaimBtn.disabled = true;
        todayClaimBtn.textContent = 'Claimed';
        todayClaimBtn.className = 'today-claim-btn claimed';
      }
      startCountdown();
    }

    // Footer
    var footer = document.getElementById('dc-pop-footer');
    var streakText = '<span class="dc-streak-info">Streak: ' + data.currentStreak + 'd</span>';
    if (data.longestStreak > 0) streakText += ' | Best: ' + data.longestStreak;
    var nextMs = '';
    if (data.nextMilestone) {
      nextMs = 'Next: Day ' + data.nextMilestone.day + ' (' + data.nextMilestone.daysAway + 'd)';
    }
    footer.innerHTML = streakText + '<span>' + nextMs + '</span>';
  }

  function handleClaim() {
    if (claiming || !statusData || !statusData.canClaim) return;
    claiming = true;
    claimBtn.disabled = true;
    claimBtn.textContent = 'Claiming...';
    if (todayClaimBtn) {
      todayClaimBtn.disabled = true;
      todayClaimBtn.textContent = 'Claiming...';
    }

    fetch('/api/me/daily-claim', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    })
    .then(function(r) { return r.json(); })
    .then(function(result) {
      claiming = false;
      if (!result.ok) {
        claimBtn.textContent = result.error || 'Error';
        if (todayClaimBtn) todayClaimBtn.textContent = result.error || 'Error';
        setTimeout(loadStatus, 2000);
        return;
      }
      if (result.alreadyClaimed) {
        loadStatus();
        return;
      }
      showClaimResult(result);
    })
    .catch(function() {
      claiming = false;
      claimBtn.textContent = 'Error';
      claimBtn.disabled = false;
      if (todayClaimBtn) {
        todayClaimBtn.textContent = 'Retry';
        todayClaimBtn.disabled = false;
      }
    });
  }

  function showClaimResult(result) {
    // XP fly animation on pill
    var fly = document.createElement('div');
    fly.className = 'dc-xp-fly';
    fly.textContent = '+' + formatNum(result.xp) + ' XP';
    popover.appendChild(fly);
    setTimeout(function() { if (fly.parentNode) fly.parentNode.removeChild(fly); }, 1500);

    // Update pill to reflect claimed state
    var streakEl = document.getElementById('dc-pill-streak');
    var dotEl = document.getElementById('dc-pill-dot');
    streakEl.textContent = result.streakDay + 'd';
    dotEl.className = 'dc-pill-dot claimed';

    // Show result in popover
    var preview = document.getElementById('dc-reward-preview');
    var html = '<div class="dc-result">';
    html += '<div class="dc-result-xp">+' + formatNum(result.xp) + ' XP</div>';
    if (result.xpBreakdown) {
      var parts = [];
      parts.push(result.xpBreakdown.scaled + ' base');
      if (result.xpBreakdown.milestone > 0) parts.push('+' + formatNum(result.xpBreakdown.milestone) + ' milestone');
      html += '<div class="dc-result-breakdown">' + parts.join(' ') + '</div>';
    }
    if (result.cosmeticDrop) {
      var c = result.cosmeticDrop;
      html += '<div class="dc-result-cosmetic" style="color:' + rarityColor(c.rarity) + '">Cosmetic: ' + c.name + ' (' + c.rarity + ' ' + categoryName(c.category) + ')</div>';
    }
    if (result.milestone) {
      html += '<div class="dc-result-milestone">';
      html += '<div class="dc-result-milestone-label">MILESTONE: Day ' + result.streakDay + '!</div>';
      if (result.milestone.lootBox) {
        html += '<div class="dc-result-milestone-items">' + result.milestone.lootBox.length + '-item loot box!</div>';
      }
      if (result.milestone.cosmetic) {
        html += '<div class="dc-result-milestone-items">Milestone cosmetic!</div>';
      }
      if (result.milestone.titleCosmetic) {
        html += '<div class="dc-result-milestone-items">Title: ' + result.milestone.titleCosmetic.name + '</div>';
      }
      html += '</div>';
    }
    if (result.profileLogosUnlocked && result.profileLogosUnlocked.length > 0) {
      html += buildUnlockedLogosHtml(result.profileLogosUnlocked);
    }
    html += '</div>';
    preview.innerHTML = html;

    // Update button
    claimBtn.disabled = true;
    claimBtn.className = 'dc-claim-btn claimed-state';
    if (todayClaimBtn) {
      todayClaimBtn.disabled = true;
      todayClaimBtn.className = 'today-claim-btn claimed';
      todayClaimBtn.textContent = 'Claimed';
    }

    // Update day counter
    document.getElementById('dc-pop-day').textContent = 'Day ' + result.streakDay + '/' + CYCLE_LENGTH;

    // Refresh track
    var track = document.getElementById('dc-track');
    track.innerHTML = '';
    for (var i = 1; i <= CYCLE_LENGTH; i++) {
      var cell = document.createElement('div');
      cell.className = 'dc-cell';
      cell.textContent = i;
      if (MILESTONE_DAYS.indexOf(i) !== -1) cell.className += ' milestone';
      if (i <= result.streakDay) cell.className += ' claimed';
      track.appendChild(cell);
    }

    // Cosmetic celebration
    if (result.cosmeticDrop && window.showCosmeticCelebration) {
      setTimeout(function() {
        window.showCosmeticCelebration({ type: 'daily-claim', items: [result.cosmeticDrop] });
      }, 600);
    }
    if (result.milestone && result.milestone.lootBox && window.showCosmeticCelebration) {
      setTimeout(function() {
        window.showCosmeticCelebration({ type: 'daily-claim-milestone', items: result.milestone.lootBox });
      }, result.cosmeticDrop ? 5000 : 600);
    }

    // Update footer
    var footer = document.getElementById('dc-pop-footer');
    var longest = Math.max(statusData ? statusData.longestStreak : 0, result.streakDay);
    footer.innerHTML = '<span class="dc-streak-info">Streak: ' + result.streakDay + 'd</span>' +
      (longest > 0 ? ' | Best: ' + longest : '') +
      (result.nextMilestone ? '<span>Next: Day ' + result.nextMilestone.day + ' (' + result.nextMilestone.daysAway + 'd)</span>' : '');

    // Update statusData so subsequent renders are correct
    statusData = {
      canClaim: false,
      currentStreak: result.streakDay,
      longestStreak: longest,
      nextMilestone: result.nextMilestone,
      nextProfileLogoUnlock: result.nextProfileLogoUnlock
    };

    syncTodayClaim(statusData, result);
    syncDailyLoginBanner(statusData, result);
    emitUpdate(statusData, result);
    startCountdown();

    // Auto-close popover after 4s (let user see result)
    setTimeout(function() {
      if (popoverOpen) closePopover();
    }, 4000);
  }

  function startCountdown() {
    if (countdownTimer) clearTimeout(countdownTimer);
    updateCountdown();
  }

  function updateCountdown() {
    if (!claimBtn) return;
    var now = new Date();
    var tomorrow = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    var diff = tomorrow - now;
    var h = Math.floor(diff / 3600000);
    var m = Math.floor((diff % 3600000) / 60000);
    var s = Math.floor((diff % 60000) / 1000);
    var countdown = pad(h) + ':' + pad(m) + ':' + pad(s);
    claimBtn.textContent = 'Resets in ' + countdown;
    if (todayClaimBtn) todayClaimBtn.textContent = '\u2713 Claimed';
    syncTodayClaim(statusData, null, countdown);
    syncDailyLoginBanner(statusData, null, countdown);
    countdownTimer = setTimeout(updateCountdown, 1000);
  }

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  function escapeText(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatNum(n) {
    if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
    if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'K';
    return '' + n;
  }

  function rarityColor(rarity) {
    var colors = { common: '#9d9d9d', uncommon: '#4fc34f', rare: '#4a9eff', epic: '#b44aff', legendary: '#ffab00', ultra: '#ff4444' };
    return colors[rarity] || '#9d9d9d';
  }

  function categoryName(cat) {
    var names = { word_color: 'Word Color', word_glow: 'Word Glow', name_color: 'Name Color', name_glow: 'Name Glow', profile_border: 'Border', profile_glow: 'Glow', title: 'Title', win_effect: 'Win Effect', hero_badge: 'Badge' };
    return names[cat] || cat;
  }

  function buildLogoTeaseHtml(logo, claimsAway) {
    if (!logo || !logo.assetPath) return '';
    var remaining = Math.max(0, Number(claimsAway) || 0);
    return '<span class="dc-logo-tease">' +
      '<img src="' + escapeText(logo.assetPath) + '" alt="' + escapeText(logo.name || 'Profile Logo') + '">' +
      '<span class="dc-logo-tease-copy">' +
        '<span class="dc-logo-tease-title">' + escapeText(logo.name || 'Profile Logo') + '</span>' +
        '<span class="dc-logo-tease-sub">' + (remaining <= 0 ? 'Profile logo unlock ready' : (remaining + ' more claim' + (remaining === 1 ? '' : 's'))) + '</span>' +
      '</span>' +
    '</span>';
  }

  function buildUnlockedLogosHtml(logos) {
    if (!Array.isArray(logos) || logos.length === 0) return '';
    return '<div class="dc-result-logos">' + logos.map(function(logo) {
      if (!logo) return '';
      return '<div class="dc-result-logo">' +
        '<img src="' + escapeText(logo.assetPath || '') + '" alt="' + escapeText(logo.name || 'Profile Logo') + '">' +
        '<div class="dc-result-logo-copy">' +
          '<div class="dc-result-logo-title">' + escapeText(logo.name || 'Profile Logo') + '</div>' +
          '<div class="dc-result-logo-sub">Unlocked profile logo</div>' +
        '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  function syncDailyLoginBanner(data, result, countdown) {
    if (!bannerEl || !bannerSub || !bannerBtn) return;

    if (!data) {
      bannerEl.classList.remove('visible');
      bannerBtn.disabled = true;
      bannerBtn.textContent = 'Unavailable';
      bannerBtn.className = 'daily-login-banner-btn';
      return;
    }

    bannerEl.classList.add('visible');
    var streak = data.currentStreak || 0;
    var nextMilestone = data.nextMilestone;

    if (data.canClaim) {
      var sub = 'Day ' + (streak + 1) + ' ready · +1 hint & XP';
      if (nextMilestone && nextMilestone.daysAway === 1) {
        sub += ' · milestone tomorrow';
      }
      bannerSub.textContent = sub;
      bannerBtn.disabled = false;
      bannerBtn.textContent = 'Claim';
      bannerBtn.className = 'daily-login-banner-btn';
      return;
    }

    var sub = result
      ? ('Day ' + result.streakDay + ' claimed · +1 hint & ' + formatNum(result.xp) + ' XP')
      : ('Day ' + streak + ' claimed · +1 hint earned');
    if (countdown) sub += ' · resets ' + countdown;
    else if (nextMilestone) sub += ' · next milestone in ' + nextMilestone.daysAway + 'd';
    bannerSub.textContent = sub;
    bannerBtn.disabled = true;
    bannerBtn.textContent = 'Claimed';
    bannerBtn.className = 'daily-login-banner-btn claimed';
  }

  function syncTodayClaim(data, result, countdown) {
    var stateEl = document.getElementById('today-claim-state');
    var primaryEl = document.getElementById('today-claim-primary');
    var secondaryEl = document.getElementById('today-claim-secondary');
    var resetEl = document.getElementById('today-claim-reset');
    if (!stateEl || !primaryEl || !secondaryEl || !resetEl) return;

    if (!data) {
      stateEl.textContent = 'Unavailable';
      primaryEl.textContent = 'Link your account to start earning streak rewards.';
      secondaryEl.textContent = '';
      resetEl.textContent = '';
      if (todayClaimBtn) {
        todayClaimBtn.disabled = true;
        todayClaimBtn.textContent = 'Unavailable';
        todayClaimBtn.className = 'today-claim-btn claimed';
      }
      return;
    }

    var streak = data.currentStreak || 0;
    var nextMilestone = data.nextMilestone;
    var nextLogoUnlock = data.nextProfileLogoUnlock;
    if (data.canClaim) {
      stateEl.textContent = 'Ready';
      primaryEl.textContent = 'Day ' + (streak + 1) + ' ready to claim.';
      if (nextLogoUnlock && nextLogoUnlock.claimsAway > 0) {
        secondaryEl.textContent = nextLogoUnlock.name + ' profile logo in ' + nextLogoUnlock.claimsAway + ' more claim' + (nextLogoUnlock.claimsAway === 1 ? '' : 's') + '.';
      } else {
        secondaryEl.textContent = nextMilestone
          ? ('Streak ' + streak + ' · milestone in ' + nextMilestone.daysAway + 'd (day ' + nextMilestone.day + ')')
          : (streak > 0 ? 'Streak ' + streak + ' · keep it going' : 'Start your streak today');
      }
      resetEl.textContent = '';
      return;
    }

    stateEl.textContent = 'Claimed';
    primaryEl.textContent = result
      ? ('+' + formatNum(result.xp) + ' XP · Day ' + result.streakDay + ' claimed.')
      : ('Day ' + streak + ' claimed.');
    if (result && Array.isArray(result.profileLogosUnlocked) && result.profileLogosUnlocked.length > 0) {
      secondaryEl.textContent = result.profileLogosUnlocked.map(function(logo) { return logo && logo.name; }).filter(Boolean).join(', ') + ' unlocked.';
    } else if (nextLogoUnlock && nextLogoUnlock.claimsAway > 0) {
      secondaryEl.textContent = 'Next profile logo: ' + nextLogoUnlock.name + ' in ' + nextLogoUnlock.claimsAway + ' claim' + (nextLogoUnlock.claimsAway === 1 ? '' : 's') + '.';
    } else {
      secondaryEl.textContent = nextMilestone
        ? ('Next milestone: day ' + nextMilestone.day + ' in ' + nextMilestone.daysAway + ' day' + (nextMilestone.daysAway === 1 ? '' : 's'))
        : 'Next milestone: keep your streak going.';
    }
    resetEl.textContent = countdown ? ('Resets in ' + countdown) : '';
  }

  function emitUpdate(data, result) {
    document.dispatchEvent(new CustomEvent('portal:daily-claim-update', {
      detail: {
        status: data,
        result: result || null
      }
    }));
  }

  // Init when DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
