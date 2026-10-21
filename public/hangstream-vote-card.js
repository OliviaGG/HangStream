/**
 * hangstream-vote-card.js — shared renderer for the "What do we play next?" vote.
 *
 * Port of Word Tycoon's `gameVote` widget surface, styled for HangStream. Three
 * pages show the same vote (the OBS overlay, the viewer game pages and the
 * streamer dashboard preview), and they must not drift apart, so the markup and
 * the state->DOM mapping live here once.
 *
 * The module is deliberately framework-free and uses no template literals, so it
 * is safe to inline the same way the rest of the site's scripts are.
 *
 * Usage:
 *   const card = HangStreamVoteCard.create(root, { interactive: true });
 *   card.render(snapshot);   // from a `game-vote-update` payload
 *
 * Snapshot shape comes from server/games/game-vote.js `snapshotFor`:
 *   { phase, activeGameName, ballot:[{n,gameId,name,keep,votes,pct}],
 *     totalVotes, secondsLeft, winner:{name,votes,tiebreak,stay},
 *     termUnit, roundsDone, termValue, termSecondsLeft, votePending }
 */
(function (global) {
  'use strict';

  // Game -> emoji, mirroring the icons the game library already uses.
  var ICONS = {
    hangman: '\uD83C\uDFAF',          // 🎯
    'spellingbee': '\uD83D\uDC1D',    // 🐝
    'spelling-bee': '\uD83D\uDC1D',
    'speedscramble': '\u26A1',        // ⚡
    'speed-scramble': '\u26A1',
    searchle: '\uD83D\uDD0E',         // 🔎
    wordle: '\uD83D\uDFE9'            // 🟩
  };

  function iconFor(gameId) {
    return ICONS[String(gameId || '').toLowerCase()] || '\uD83C\uDFAE'; // 🎮
  }

  /** "2:05" style countdown; never negative. */
  function clock(seconds) {
    var s = Math.max(0, Math.floor(Number(seconds) || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' + r : String(r));
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  /**
   * One ballot row: number, icon, name, a fill bar and the vote count.
   * `keep` rows are visually quieter — they are the "don't change anything"
   * option, not a challenger.
   */
  function ballotRow(entry, onPick) {
    var row = document.createElement('button');
    row.type = 'button';
    row.className = 'hs-vote-row' + (entry.keep ? ' keep' : '');
    row.setAttribute('data-n', String(entry.n));

    var num = document.createElement('span');
    num.className = 'hs-vote-num';
    num.textContent = String(entry.n);

    var icon = document.createElement('span');
    icon.className = 'hs-vote-icon';
    icon.textContent = iconFor(entry.gameId);

    var name = document.createElement('span');
    name.className = 'hs-vote-name';
    name.textContent = entry.keep ? (entry.name + ' (keep playing)') : entry.name;

    var count = document.createElement('span');
    count.className = 'hs-vote-count';
    count.textContent = String(entry.votes || 0);

    var bar = document.createElement('span');
    bar.className = 'hs-vote-bar';
    var fill = document.createElement('span');
    fill.className = 'hs-vote-bar-fill';
    fill.style.width = Math.max(0, Math.min(100, Number(entry.pct) || 0)) + '%';
    bar.appendChild(fill);

    row.appendChild(num);
    row.appendChild(icon);
    row.appendChild(name);
    row.appendChild(count);
    row.appendChild(bar);

    if (onPick) {
      row.addEventListener('click', function () { onPick(entry.n); });
    } else {
      row.disabled = true;
    }
    return row;
  }

  /**
   * Create the card inside `root`. Returns { render, el }.
   *   interactive — rows are tappable and report the number via onVote(n).
   *   onVote(n)   — caller sends { type:'game-vote', choice:n, ... } over ws.
   */
  function create(root, options) {
    options = options || {};
    var interactive = options.interactive === true;
    var onVote = typeof options.onVote === 'function' ? options.onVote : null;

    var el = document.createElement('div');
    el.className = 'hs-vote-card';
    el.setAttribute('data-phase', 'idle');
    el.style.display = 'none';

    var head = document.createElement('div');
    head.className = 'hs-vote-head';

    var title = document.createElement('div');
    title.className = 'hs-vote-title';

    var timer = document.createElement('div');
    timer.className = 'hs-vote-timer';

    head.appendChild(title);
    head.appendChild(timer);

    var sub = document.createElement('div');
    sub.className = 'hs-vote-sub';

    var listWrap = document.createElement('div');
    listWrap.className = 'hs-vote-list';

    var foot = document.createElement('div');
    foot.className = 'hs-vote-foot';

    el.appendChild(head);
    el.appendChild(sub);
    el.appendChild(listWrap);
    el.appendChild(foot);
    root.appendChild(el);

    var lastPhase = null;

    /**
     * Render a snapshot. `null` hides the card. Phase changes start a small
     * fade so a ballot appearing mid-stream reads as an event, not a glitch.
     */
    function render(snapshot) {
      if (!snapshot) { el.style.display = 'none'; return; }
      var phase = snapshot.phase || 'idle';

      // Between votes the card only shows while a term is actually running, so
      // an unconfigured overlay stays empty instead of showing "0/0".
      var hasContent = phase === 'voting' || phase === 'result' ||
        (phase === 'idle' && (snapshot.termUnit || snapshot.votePending));
      if (!hasContent) { el.style.display = 'none'; return; }

      el.style.display = '';
      el.setAttribute('data-phase', phase);

      if (phase !== lastPhase) {
        el.classList.remove('hs-vote-enter');
        // Force a reflow so the animation restarts on every phase change.
        void el.offsetWidth;
        el.classList.add('hs-vote-enter');
        lastPhase = phase;
      }

      clear(listWrap);
      clear(foot);
      sub.textContent = '';
      timer.textContent = '';
      title.textContent = '';

      if (phase === 'voting') {
        title.textContent = 'WHAT DO WE PLAY NEXT?';
        timer.textContent = clock(snapshot.secondsLeft);
        sub.textContent = snapshot.activeGameName
          ? 'Now playing ' + snapshot.activeGameName + ' \u2014 type a number in chat'
          : 'Type a number in chat';
        var rows = snapshot.ballot || [];
        for (var i = 0; i < rows.length; i++) {
          listWrap.appendChild(ballotRow(rows[i], interactive ? onVote : null));
        }
        foot.textContent = (snapshot.totalVotes || 0) === 1
          ? '1 vote'
          : String(snapshot.totalVotes || 0) + ' votes';
        return;
      }

      if (phase === 'result') {
        var w = snapshot.winner;
        if (w && w.stay) {
          title.textContent = 'STAYING ON';
          sub.textContent = w.name + ' keeps the stream';
        } else if (w) {
          title.textContent = 'NEXT UP';
          sub.textContent = w.name + (w.tiebreak ? ' (tiebreak)' : '');
        } else {
          title.textContent = 'NEXT UP';
        }
        timer.textContent = clock(snapshot.resultSecondsLeft);
        // Show the final tallies so the result reads as a verdict, not a guess.
        var finalRows = snapshot.ballot || [];
        for (var j = 0; j < finalRows.length; j++) {
          listWrap.appendChild(ballotRow(finalRows[j], null));
        }
        if (snapshot.willSwitch === false && w && !w.stay) {
          foot.textContent = 'Announced only \u2014 auto-switch is off';
        }
        return;
      }

      // idle — the slim "term" pill shown between votes.
      title.textContent = 'NEXT GAME VOTE';
      if (snapshot.votePending) {
        sub.textContent = 'Vote opens after this round';
      } else if (snapshot.termUnit === 'rounds') {
        sub.textContent = 'Rounds ' + (snapshot.roundsDone || 0) + '/' + (snapshot.termValue || 0) +
          ' before the next vote';
      } else if (snapshot.termUnit === 'minutes') {
        sub.textContent = 'Next vote in ' + clock(snapshot.termSecondsLeft);
      }
    }

    return { render: render, el: el };
  }

  global.HangStreamVoteCard = { create: create, iconFor: iconFor, clock: clock };
})(window);
