/**
 * GameHelp — Shared instruction popup system for all SP word games
 *
 * Usage in each game's sp.html:
 *   <div id="game-help" data-game="wordle" data-accent="#6aaa64" data-steps="3">
 *     <div class="game-help-step" data-step="1">...</div>
 *     <div class="game-help-step" data-step="2">...</div>
 *     <div class="game-help-step" data-step="3">...</div>
 *   </div>
 *   <script src="/game-help.js"></script>
 *
 * The script auto-initializes from the #game-help element's data attributes.
 */
(function() {
  'use strict';

  var container = document.getElementById('game-help');
  if (!container) return;

  var gameId = container.getAttribute('data-game') || 'game';
  var accent = container.getAttribute('data-accent') || '#a78bfa';
  var gameName = container.getAttribute('data-name') || 'this game';
  var storageKey = gameId + '_sp_help_seen';
  var steps = container.querySelectorAll('.game-help-step');
  var totalSteps = steps.length;
  var currentStep = 1;

  // Build the modal structure around the existing step content
  function buildModal() {
    // Create overlay
    var overlay = document.createElement('div');
    overlay.className = 'game-help-overlay gh-hidden';
    overlay.id = 'game-help-overlay';
    overlay.style.setProperty('--gh-accent', accent);

    // Create modal
    var modal = document.createElement('div');
    modal.className = 'game-help-modal';

    // Header
    var header = document.createElement('div');
    header.className = 'game-help-header';
    header.innerHTML = '<div class="game-help-title"><span class="gh-icon">📖</span> How to Play</div>' +
      '<button class="game-help-close" id="gh-close">&times;</button>';
    modal.appendChild(header);

    // Dots
    var dots = document.createElement('div');
    dots.className = 'game-help-dots';
    dots.id = 'gh-dots';
    for (var i = 0; i < totalSteps; i++) {
      var dot = document.createElement('div');
      dot.className = 'game-help-dot' + (i === 0 ? ' active' : '');
      dot.setAttribute('data-step', i + 1);
      dots.appendChild(dot);
    }
    modal.appendChild(dots);

    // Steps container
    var stepsContainer = document.createElement('div');
    stepsContainer.className = 'game-help-steps';
    stepsContainer.id = 'gh-steps';

    // Move step elements into the modal
    for (var j = 0; j < steps.length; j++) {
      var step = steps[j];
      step.style.setProperty('--gh-accent', accent);
      if (j === 0) step.classList.add('active');
      stepsContainer.appendChild(step);
    }
    modal.appendChild(stepsContainer);

    // Footer
    var footer = document.createElement('div');
    footer.className = 'game-help-footer';
    footer.id = 'gh-footer';

    var nav = document.createElement('div');
    nav.className = 'game-help-nav';
    nav.id = 'gh-nav';
    nav.innerHTML = '<button class="gh-back" id="gh-back">← Back</button>' +
      '<button class="gh-next" id="gh-next">Next →</button>';
    footer.appendChild(nav);

    var dismiss = document.createElement('button');
    dismiss.className = 'game-help-dismiss';
    dismiss.id = 'gh-dismiss';
    dismiss.textContent = "Got it! Let's play";
    dismiss.style.display = 'none';
    footer.appendChild(dismiss);

    modal.appendChild(footer);
    overlay.appendChild(modal);

    // Remove the original container and insert overlay at body end
    container.parentNode.removeChild(container);
    document.body.appendChild(overlay);

    return overlay;
  }

  var overlay = buildModal();
  var closeBtn = document.getElementById('gh-close');
  var backBtn = document.getElementById('gh-back');
  var nextBtn = document.getElementById('gh-next');
  var dismissBtn = document.getElementById('gh-dismiss');
  var dotsEl = document.getElementById('gh-dots');
  var allSteps = overlay.querySelectorAll('.game-help-step');

  function goTo(step) {
    currentStep = Math.max(1, Math.min(step, totalSteps));

    // Update steps
    for (var i = 0; i < allSteps.length; i++) {
      allSteps[i].classList.toggle('active', i === currentStep - 1);
    }

    // Update dots
    var dotEls = dotsEl.querySelectorAll('.game-help-dot');
    for (var j = 0; j < dotEls.length; j++) {
      dotEls[j].classList.toggle('active', j === currentStep - 1);
    }

    // Update navigation
    backBtn.style.display = currentStep === 1 ? 'none' : '';

    if (currentStep === totalSteps) {
      nextBtn.style.display = 'none';
      dismissBtn.style.display = '';
    } else {
      nextBtn.style.display = '';
      dismissBtn.style.display = 'none';
    }
  }

  function show() {
    currentStep = 1;
    goTo(1);
    overlay.classList.remove('gh-hidden');
  }

  function hide() {
    overlay.classList.add('gh-hidden');
  }

  function dismiss() {
    hide();
    try { localStorage.setItem(storageKey, '1'); } catch(e) {}
  }

  // Event listeners
  closeBtn.addEventListener('click', hide);
  backBtn.addEventListener('click', function() { goTo(currentStep - 1); });
  nextBtn.addEventListener('click', function() { goTo(currentStep + 1); });
  dismissBtn.addEventListener('click', dismiss);

  // Click on backdrop to close
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) hide();
  });

  // Dot clicks
  dotsEl.addEventListener('click', function(e) {
    var dot = e.target.closest('.game-help-dot');
    if (dot) goTo(parseInt(dot.getAttribute('data-step')));
  });

  // Keyboard: Escape to close, arrows to navigate
  document.addEventListener('keydown', function(e) {
    if (overlay.classList.contains('gh-hidden')) return;
    if (e.key === 'Escape') { hide(); e.preventDefault(); }
    if (e.key === 'ArrowRight' && currentStep < totalSteps) { goTo(currentStep + 1); e.preventDefault(); }
    if (e.key === 'ArrowLeft' && currentStep > 1) { goTo(currentStep - 1); e.preventDefault(); }
    if (e.key === 'Enter' && currentStep === totalSteps) { dismiss(); e.preventDefault(); }
  });

  // Create the help button element
  function createHelpBtn() {
    var btn = document.createElement('button');
    btn.className = 'gh-help-btn';
    btn.id = 'gh-help-btn';
    btn.innerHTML = '?';
    btn.title = 'How to Play';
    btn.style.setProperty('--gh-accent', accent);
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      e.stopPropagation();
      show();
    });
    return btn;
  }

  // Inject help button into the game header
  var helpBtnRetries = 0;
  function injectHelpButton() {
    // Already injected?
    if (document.getElementById('gh-help-btn')) return;

    // Try common header patterns
    var header = document.querySelector('.sp-header') ||
                 document.querySelector('.game-header') ||
                 document.querySelector('header') ||
                 document.querySelector('.header') ||
                 document.querySelector('.top-bar') ||
                 document.querySelector('.stats-overlay-btn') ||
                 document.querySelector('[class*="header"]');

    if (!header) {
      // Fallback: find the first element that looks like a header (has a title/h1/h2)
      var titles = document.querySelectorAll('h1, h2, .title');
      if (titles.length > 0) header = titles[0].parentNode;
    }

    if (header) {
      header.appendChild(createHelpBtn());
    } else if (helpBtnRetries < 10) {
      // SPA fallback: retry every 500ms for up to 5s (Vue/React apps render late)
      helpBtnRetries++;
      setTimeout(injectHelpButton, 500);
    } else {
      // Final fallback: floating fixed-position button
      var btn = createHelpBtn();
      btn.classList.add('gh-help-btn-floating');
      document.body.appendChild(btn);
    }
  }

  // Auto-show on first visit
  function init() {
    // Skip help in OBS overlay mode
    if (new URLSearchParams(window.location.search).get('obs') === '1') return;

    injectHelpButton();

    var seen = false;
    try { seen = localStorage.getItem(storageKey) === '1'; } catch(e) {}

    if (!seen) {
      // Small delay so the game UI loads first
      setTimeout(show, 300);
    }
  }

  // Wait for DOM ready (in case script is in <head>)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Small delay to let game's own init run first
    setTimeout(init, 100);
  }

  // Expose API for programmatic use
  window.GameHelp = {
    show: show,
    hide: hide,
    dismiss: dismiss,
    goTo: goTo
  };
})();
