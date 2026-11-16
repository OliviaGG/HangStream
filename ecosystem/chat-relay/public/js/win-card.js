/* ============================================================
   win-card.js — THE shared win card for every Word Tycoon game
   page (solo + multiplayer). Renders the same widget-style card
   as the wordgame.live/streamer dashboard win-card widget
   (public/streamer/goals-overlay.html): .wc-frame > .win-card
   with hero-badge background, corner-spill avatar, cosmetics and
   SF/DC/FC perk hearts.

   Modes:
     WinCard.showSolo({ game, gameName, word, guessCount, jackpot,
                        winner, totalWins?, stats?, actions?, autoHideMs?,
                        onHide? })
       — single winner + "🏆 N wins" chip (that game, all time).
       `stats` is an optional plain-text line under the chips, for games
       whose numbers don't fit word/guesses/XP (e.g. Spelling Bee).
     WinCard.showMp({ ..., winner, topPlayers, totalWins? })
       — winner hero + top-10 round standings.
     WinCard.show(opts)          — mode: 'solo' | 'mp' (default 'solo')
     WinCard.handleGameWin(data) — feed a relay `game-win` payload
                                   straight in (MP; winType:'word' is
                                   filtered out).
     WinCard.demo()              — sample MP card for testing.

   `winner` / `topPlayers[]` entries: any of
     { displayName, username, platform, platformUserId, profilePic,
       cosmetics, linkedDiscord, discordId, isSuperfan, isDonor,
       isFanClub, badges, points|xp|score }
   Missing cosmetics/perks are lazy-fetched from the hub:
     GET <hub>/api/public/player-cosmetics?platform=&userId=
     GET <hub>/api/public/player-wins?platform=&userId=&game=     (or discordId=)
     GET <hub>/api/public/perks?discordId=                        (any known id)

   Self-injects its dependencies from the origin it was served from
   (same pattern as session-win-card.js): win-card.css,
   cosmetics-fx.css, pfp-cosmetics.js, ambient-fx.js,
   perk-badges.js/.css, win-effects.js.
   ============================================================ */
(function () {
  'use strict';
  if (window.WinCard) return; // idempotent

  // ── Hub base = the origin THIS script was served from ──
  var HUB = 'https://wordtycoon.live';
  try {
    var _self = document.currentScript && document.currentScript.src;
    if (_self) HUB = _self.replace(/\/js\/win-card\.js.*$/, '');
  } catch (_) {}

  // Catalog media belongs to the hub, even when this script runs on a game
  // domain. Absolute third-party avatar URLs keep their original origin.
  function mediaUrl(value) {
    if (!value) return '';
    try { return new URL(String(value), HUB + '/').href; }
    catch (_) { return String(value); }
  }

  function mediaCss(value) {
    return String(value || '').replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, function (_, quote, url) {
      return 'url(' + JSON.stringify(mediaUrl(url)) + ')';
    });
  }

  function mediaBackground(value) {
    return /^\s*url\(/i.test(value || '') ? mediaCss(value) : 'url(' + JSON.stringify(mediaUrl(value)) + ')';
  }

  // ── Dependency injection (idempotent) ──
  try {
    if (!document.querySelector('link[href*="win-card.css"]')) {
      var l0 = document.createElement('link');
      l0.rel = 'stylesheet';
      l0.href = HUB + '/css/win-card.css?v=3';
      document.head.appendChild(l0);
    }
    if (!document.querySelector('link[href*="cosmetics-fx.css"]')) {
      var l1 = document.createElement('link');
      l1.rel = 'stylesheet';
      l1.href = HUB + '/css/cosmetics-fx.css?v=3';
      document.head.appendChild(l1);
    }
    if (!document.querySelector('link[href*="perk-badges.css"]')) {
      var l2 = document.createElement('link');
      l2.rel = 'stylesheet';
      l2.href = HUB + '/portal/assets/badges/perk-badges.css?v=2';
      document.head.appendChild(l2);
    }
    if (!window.PerkBadges && !document.querySelector('script[src*="perk-badges.js"]')) {
      var s0 = document.createElement('script');
      s0.src = HUB + '/portal/assets/badges/perk-badges.js?v=2';
      document.head.appendChild(s0);
    }
    if (!window.PfpCosmetics && !document.querySelector('script[src*="pfp-cosmetics.js"]')) {
      var s1 = document.createElement('script');
      s1.src = HUB + '/js/pfp-cosmetics.js?v=15';
      document.head.appendChild(s1);
    }
    if (!window.AmbientFx && !document.querySelector('script[src*="ambient-fx.js"]')) {
      var s2 = document.createElement('script');
      s2.src = HUB + '/js/ambient-fx.js?v=3';
      document.head.appendChild(s2);
    }
    if (!window.playWinEffect && !document.querySelector('script[src*="win-effects.js"]')) {
      var s3 = document.createElement('script');
      s3.src = HUB + '/win-effects.js?v=3';
      document.head.appendChild(s3);
    }
  } catch (_) {}

  // ── Constants ──
  var PLATFORM_COLORS = {
    tiktok: '#69C9D0', youtube: '#FF0000', twitch: '#9146FF',
    discord: '#5865F2', web: '#5865F2', unknown: '#aaa'
  };
  // Games where the [title] cosmetic shouldn't render (per per-game UX choice).
  var TITLE_HIDDEN_GAMES = { rectangled: 1, erectangled: 1, sproutle: 1 };
  var SHOW_MS = { solo: 8000, mp: 12000 };

  // ── Stream-embed suppression ──
  // Inside a /streamer game embed (goals-overlay.html iframes every game with
  // ?obs=1, wikisearchle with ?stream_widget=1) the overlay renders its OWN
  // customisable win-card widget. The in-game card must never double up on it,
  // so every show path becomes a no-op there — timing callbacks still fire so
  // games that chain a restart off the card keep working.
  // Escape hatch for manual testing: window.WIN_CARD_FORCE = true.
  var IN_STREAM_EMBED = (function () {
    try {
      if (window.__WT_STREAM_WIDGET) return true;
      var p = new URLSearchParams(location.search || '');
      if (p.has('obs') || p.get('stream_widget') === '1') return true;
    } catch (_) {}
    return false;
  })();

  // Name truncation — identical rules to the dashboard widget: 10 graphemes,
  // max 3 emoji, surplus emoji skipped so "🔥🔥🔥🔥🔥kat" keeps "kat".
  var WC_NAME_MAX = 10;
  var WC_EMOJI_MAX = 3;

  // ── Long-title detection (mirrors _wcIsLongTitle in goals-overlay.html) ──
  // Most games' `word` is one guessable token and belongs on the winner's name
  // line. The wiki games send a Wikipedia ARTICLE TITLE — several words —
  // which the nowrap chip can neither shrink nor wrap, so it stretched the
  // card to its max width and then clipped. Anything this long renders as a
  // stacked, wrapping block instead (.wc-found-word.is-block).
  var WC_TITLE_WORDS = 2;
  var WC_TITLE_CHARS = 18;
  function isLongTitle(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return false;
    return s.split(/\s+/).length >= WC_TITLE_WORDS || s.length > WC_TITLE_CHARS;
  }
  var _emojiRe = (function () {
    try {
      return new RegExp('[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\uFE0F\\u20E3]', 'u');
    } catch (_) {
      return /[\uD83C-\uDBFF][\uDC00-\uDFFF]|[☀-➿️⃣]/;
    }
  })();

  function _graphemes(s) {
    try {
      return (typeof Intl !== 'undefined' && Intl.Segmenter)
        ? Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)).map(function (x) { return x.segment; })
        : Array.from(s);
    } catch (_) {
      return Array.from(s);
    }
  }

  function truncName(raw, max, maxEmoji) {
    max = max || WC_NAME_MAX; maxEmoji = maxEmoji == null ? WC_EMOJI_MAX : maxEmoji;
    var s = String(raw == null ? '' : raw);
    var units = _graphemes(s);
    var isEmoji = function (g) { return _emojiRe.test(g); };
    var out = [];
    var emoji = 0;
    var i = 0;
    for (; i < units.length; i++) {
      if (out.length >= max) break;
      var g = units[i];
      if (isEmoji(g)) {
        if (emoji >= maxEmoji) continue;
        emoji++;
      }
      out.push(g);
    }
    if (i >= units.length && out.length === units.length) return s;
    var cutContent = false;
    for (var j = i; j < units.length; j++) {
      if (!(isEmoji(units[j]) && emoji >= maxEmoji)) { cutContent = true; break; }
    }
    return out.join('').replace(/\s+$/, '') + (cutContent ? '…' : '');
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  // Do two player objects refer to the same person?
  function samePlayer(a, b) {
    if (!a || !b) return false;
    var ax = a.platformUserId || a.id;
    var bx = b.platformUserId || b.id;
    return ax && bx && String(ax) === String(bx);
  }

  // samePlayer + a display-name fallback: demo/synthetic payloads and some
  // game servers omit platformUserId, and without this the winner's row
  // shows twice (hero + leaderboard rank 1).
  function isSamePerson(a, b) {
    if (samePlayer(a, b)) return true;
    if (!a || !b) return false;
    var an = String(a.displayName || a.username || '').trim().toLowerCase();
    var bn = String(b.displayName || b.username || '').trim().toLowerCase();
    return !!an && an === bn;
  }

  // Honor viewer cosmetic-visibility prefs from window.__COSMETIC_VISIBILITY
  // (set by per-game scripts that fetched /api/me/visibility on boot).
  function visGate(key) {
    var v = window.__COSMETIC_VISIBILITY;
    if (!v) return true;
    return v[key] !== false;
  }

  // ── Fetch caches ──
  var _cosCache = {};    // platform:userId  -> Promise<equipped|null>
  var _perkCache = {};   // id               -> Promise<perks|null>
  var _winsCache = {};   // game:id          -> Promise<number|null>

  function fetchCosmetics(platform, userId) {
    if (!platform || !userId) return Promise.resolve(null);
    var key = platform + ':' + userId;
    if (!_cosCache[key]) {
      _cosCache[key] = fetch(HUB + '/api/public/player-cosmetics?platform='
          + encodeURIComponent(platform) + '&userId=' + encodeURIComponent(userId))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { return (j && (j.equipped || j.cosmetics)) || null; })
        .catch(function () { return null; });
    }
    return _cosCache[key];
  }

  function perkKeyFor(user) {
    if (!user) return null;
    return user.linkedDiscord || user.discordId || user.platformUserId || user.username || null;
  }

  function fetchPerks(idOrHandle) {
    if (!idOrHandle) return Promise.resolve(null);
    var key = String(idOrHandle);
    if (!_perkCache[key]) {
      _perkCache[key] = fetch(HUB + '/api/public/perks?discordId=' + encodeURIComponent(key))
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          return j ? { superfan: !!j.superfan, donor: !!j.donor, fanClub: !!j.fanClub } : null;
        })
        .catch(function () { return null; });
    }
    return _perkCache[key];
  }

  // Total wins in one game. Identity may be a Discord id, a linked-account
  // id, or a {platform, platformUserId} pair (resolved server-side).
  function fetchTotalWins(user, game) {
    if (!user || !game) return Promise.resolve(null);
    var discordId = user.linkedDiscord || user.discordId
      || (user.platform === 'discord' ? user.platformUserId : null);
    var platform = discordId ? null : (user.platform || null);
    var userId = discordId ? null : (user.platformUserId || user.username || null);
    if (!discordId && !userId) return Promise.resolve(null);
    var cacheKey = game + ':' + (discordId || (platform + ':' + userId));
    if (!_winsCache[cacheKey]) {
      var url = HUB + '/api/public/player-wins?game=' + encodeURIComponent(game);
      if (discordId) url += '&discordId=' + encodeURIComponent(discordId);
      else url += '&platform=' + encodeURIComponent(platform) + '&userId=' + encodeURIComponent(userId);
      _winsCache[cacheKey] = fetch(url)
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) {
          return (j && typeof j.totalWins === 'number') ? j.totalWins : null;
        })
        .catch(function () { return null; });
    }
    return _winsCache[cacheKey];
  }

  // ── Perk badges (SF / DC / FC hearts) ──
  // Payload flags win; when the payload carries none, lazy-fetch
  // /api/public/perks and re-apply. PerkBadges.apply is idempotent and
  // cheap, so the re-apply is safe.
  function applyPerkBadges(shellEl, user) {
    if (!shellEl || !window.PerkBadges) return;
    try {
      var held = window.PerkBadges.readPerks(user);
      if (held.superfan || held.donor || held.fanClub) {
        window.PerkBadges.apply(shellEl, user);
        return;
      }
      var key = perkKeyFor(user);
      if (!key) return;
      fetchPerks(key).then(function (p) {
        if (p && (p.superfan || p.donor || p.fanClub) && shellEl.isConnected) {
          window.PerkBadges.apply(shellEl, p);
        }
      });
    } catch (err) {
      console.warn('[WinCard] applyPerkBadges threw:', err);
    }
  }

  // ── Avatar builder ──
  // Returns a shell element (perk hearts + pfp ring anchor here) wrapping a
  // clipped inner disc with the image or a fallback letter.
  function buildAvatar(p, shellClass, innerClass) {
    var shell = document.createElement('div');
    shell.className = shellClass;
    var inner = document.createElement('div');
    inner.className = innerClass;
    var name = p.displayName || p.username || '?';
    var letter = (String(name).trim()[0] || '?').toUpperCase();
    var color = PLATFORM_COLORS[p.platform] || PLATFORM_COLORS.unknown;
    var pic = p.profilePic || p.profileImage || null;
    if (pic) {
      var img = document.createElement('img');
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      // Display-only images do not need CORS permission from avatar CDNs.
      img.src = mediaUrl(pic);
      img.addEventListener('error', function () {
        var span = document.createElement('span');
        span.className = 'wc-avatar-letter';
        span.style.color = color;
        span.textContent = letter;
        img.replaceWith(span);
      }, { once: true });
      inner.appendChild(img);
    } else {
      var span = document.createElement('span');
      span.className = 'wc-avatar-letter';
      span.style.color = color;
      span.textContent = letter;
      inner.appendChild(span);
    }
    shell.appendChild(inner);
    return shell;
  }

  // ── Card-level cosmetics ──
  // Port of the dashboard widget's _applyWinCardCosmetics
  // (goals-overlay.html). Cosmetic values are raw `css_property` JSON from
  // the WT catalog — flat CSS objects with camelCase keys.
  //
  // opts: { heroBadgeBg (default true), heroBadgeOpacity (default 0.55),
  //         outerPfpFrame (default true) }
  function applyCardCosmetics(root, opts, cosmeticsRaw) {
    if (!root) return;
    var eq = (cosmeticsRaw && cosmeticsRaw.equipped) || cosmeticsRaw || {};
    var frame = root; // caller passes .wc-frame
    var card = frame.querySelector('.win-card');
    var heroBg = card && card.querySelector('.wc-hero-bg');
    var avatarShell = card && card.querySelector('.wc-avatar');
    var avatarInner = card && card.querySelector('.wc-avatar-inner');
    var nameEl = card && card.querySelector('.wc-name .wc-name-text');

    function pick() {
      for (var i = 0; i < arguments.length; i++) if (eq[arguments[i]]) return eq[arguments[i]];
      return null;
    }

    try {
      // ── 1) Hero badge background layer ──
      var hero = visGate('hero_badge') ? pick('hero_badge') : null;
      var heroBadgeBg = opts.heroBadgeBg !== false;
      var heroOpacity = Number.isFinite(Number(opts.heroBadgeOpacity)) ? Number(opts.heroBadgeOpacity) : 0.55;
      if (heroBg) {
        heroBg.querySelectorAll('.wc-hero-video, .wc-hero-scrim, .wc-hero-art').forEach(function (el) { el.remove(); });
        if (heroBadgeBg && hero && hero.__render && hero.__render.type === 'video_bg') {
          var vid = document.createElement('video');
          vid.className = 'wc-hero-video';
          vid.autoplay = true; vid.muted = true; vid.defaultMuted = true; vid.loop = true; vid.playsInline = true;
          vid.setAttribute('muted', ''); vid.setAttribute('playsinline', '');
          vid.src = mediaUrl(hero.__render.asset);
          if (hero.__render.poster) vid.poster = mediaUrl(hero.__render.poster);
          vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit;';
          heroBg.style.overflow = 'hidden';
          heroBg.appendChild(vid);
          vid.play().catch(function () { /* Keep the poster if playback is unavailable. */ });
          if (hero.__render.scrim) {
            var scrim = document.createElement('div');
            scrim.className = 'wc-hero-scrim';
            scrim.style.cssText = 'position:absolute;inset:0;pointer-events:none;border-radius:inherit;background:' + hero.__render.scrim + ';';
            heroBg.appendChild(scrim);
          }
          heroBg.style.background = '';
          heroBg.style.removeProperty('animation');
          heroBg.style.setProperty('--wc-hero-opacity', String(heroOpacity));
          if (window.AmbientFx) window.AmbientFx.attachFromCss(heroBg, hero);
        } else if (heroBadgeBg && hero) {
          heroBg.style.background = mediaCss(hero.background || hero.color || '');
          heroBg.style.backgroundSize = hero.backgroundSize || 'cover';
          heroBg.style.backgroundPosition = hero.backgroundPosition || 'center';
          // Drift offsets match the catalog's gradient tiles. Repeat those
          // tiles so the aurora loops without a jump or an empty edge.
          heroBg.style.backgroundRepeat = hero.backgroundRepeat ||
            (hero.backgroundImage && /\bcfx-drift\b/.test(hero.animation || '') ? 'repeat' : 'no-repeat');
          if (hero.backgroundImage) {
            // Keep artwork on its own centered layer: background-position
            // keyframes belong to the gradient, never to the heart PNG.
            var art = document.createElement('div');
            art.className = 'wc-hero-art';
            art.style.cssText = 'position:absolute;inset:10%;border-radius:inherit;pointer-events:none;background-size:contain;background-position:center;background-repeat:no-repeat;';
            art.style.backgroundImage = mediaBackground(hero.backgroundImage);
            heroBg.appendChild(art);
          }
          if (hero.animation) heroBg.style.animation = hero.animation;
          else heroBg.style.removeProperty('animation');
          heroBg.style.setProperty('--wc-hero-opacity', String(heroOpacity));
          if (window.AmbientFx) window.AmbientFx.attachFromCss(heroBg, hero);
        } else {
          heroBg.style.background = '';
          heroBg.style.removeProperty('animation');
          heroBg.style.setProperty('--wc-hero-opacity', '0');
          if (window.AmbientFx) window.AmbientFx.detach(heroBg);
        }
      }

      // ── 2) Outer .wc-frame: profile_border + profile_glow ──
      var pfpBorder = (visGate('profile_border') && pick('profile_border', 'pfp_border')) || null;
      var pfpGlow = (visGate('profile_glow') && pick('profile_glow', 'pfp_glow')) || null;
      var hasFrameBorder = false;
      if (opts.outerPfpFrame !== false && (pfpBorder || pfpGlow)) {
        var borderCss = (pfpBorder && (
          pfpBorder.border ||
          (pfpBorder.css && pfpBorder.css.border) ||
          (pfpBorder.color ? '4px solid ' + pfpBorder.color : null)
        )) || null;
        if (borderCss) {
          frame.style.setProperty('--wc-frame-border', borderCss);
          hasFrameBorder = true;
        } else {
          frame.style.removeProperty('--wc-frame-border');
        }
        // Rotating conic-gradient rings (epic+ borders): painted into the
        // border-box; the inner .win-card covers the content area.
        if (pfpBorder && pfpBorder.backgroundImage && borderCss) {
          frame.style.backgroundImage = pfpBorder.backgroundImage;
          frame.style.backgroundOrigin = pfpBorder.backgroundOrigin || 'border-box';
          frame.style.backgroundClip = pfpBorder.backgroundClip || 'border-box';
          if (pfpBorder.animation) frame.style.animation = pfpBorder.animation;
          else frame.style.removeProperty('animation');
        } else {
          frame.style.removeProperty('background-image');
          frame.style.removeProperty('background-origin');
          frame.style.removeProperty('background-clip');
          frame.style.removeProperty('animation');
        }
        // Glow halo — stack border's own shadow + profile_glow.
        var glowParts = [];
        if (pfpBorder && pfpBorder.boxShadow) glowParts.push(pfpBorder.boxShadow);
        if (pfpGlow) {
          var g = pfpGlow.boxShadow ||
                  (pfpGlow.css && pfpGlow.css['box-shadow']) ||
                  pfpGlow['box-shadow'] ||
                  (pfpGlow.color ? '0 0 38px 6px ' + pfpGlow.color : null);
          if (g) glowParts.push(g);
        }
        if (glowParts.length) frame.style.setProperty('--wc-frame-glow', glowParts.join(', '));
        else frame.style.removeProperty('--wc-frame-glow');
      } else {
        frame.style.removeProperty('--wc-frame-border');
        frame.style.removeProperty('--wc-frame-glow');
        frame.style.removeProperty('background-image');
        frame.style.removeProperty('background-origin');
        frame.style.removeProperty('background-clip');
        frame.style.removeProperty('animation');
      }
      frame.classList.toggle('wc-frame-decorated', hasFrameBorder);
      if (hasFrameBorder) {
        var fbw = parseFloat(getComputedStyle(frame).borderTopWidth) || 0;
        frame.style.setProperty('--wc-frame-bw', fbw + 'px');
      } else {
        frame.style.removeProperty('--wc-frame-bw');
      }

      // ── 3) Avatar ring — the shared PfpCosmetics applier (disc-behind-
      // avatar model), so the ring matches every other surface. ──
      if (avatarShell && avatarInner && window.PfpCosmetics) {
        if (pfpBorder || pfpGlow) {
          avatarShell.classList.add('wcx-pfp-cosmetic');
          window.PfpCosmetics.apply(avatarInner, avatarShell, {
            profile_border: pfpBorder, profile_glow: pfpGlow
          });
        } else {
          avatarShell.classList.remove('wcx-pfp-cosmetic');
          window.PfpCosmetics.clear(avatarShell);
        }
      }
      // Ambient particle halo (ultra borders / legendary+ glows).
      if (avatarShell && window.AmbientFx) {
        var avAmb = (pfpBorder && pfpBorder.__ambient) || (pfpGlow && pfpGlow.__ambient) || null;
        if (avAmb) window.AmbientFx.attach(avatarShell, avAmb);
        else window.AmbientFx.detach(avatarShell);
      }

      // ── 4) name_color (color/gradient only) + name_glow (shadow) ──
      if (nameEl && window.PfpCosmetics) {
        var nameCos = {};
        if (visGate('name_color') && eq.name_color) nameCos.name_color = eq.name_color;
        if (visGate('name_glow') && eq.name_glow) nameCos.name_glow = eq.name_glow;
        window.PfpCosmetics.applyName(nameEl, nameCos);
        if (window.AmbientFx) {
          var nAmb = (nameCos.name_color && nameCos.name_color.__ambient) ||
                     (nameCos.name_glow && nameCos.name_glow.__ambient) || null;
          if (nAmb) window.AmbientFx.attach(nameEl, nAmb);
          else window.AmbientFx.detach(nameEl);
        }
      }

      // ── 5) word_color / word_glow on the found-word chips ──
      var wordColor = visGate('word_color') ? pick('word_color') : null;
      var wordGlow = visGate('word_glow') ? pick('word_glow') : null;
      var wc = wordColor && (wordColor.color || (wordColor.css && wordColor.css.color));
      var wgCss = (wordGlow && wordGlow.textShadow) || null;
      var chips = card ? card.querySelectorAll('.wc-found-word') : [];
      chips.forEach(function (chip) {
        if (wc) chip.style.setProperty('color', wc, 'important');
        else chip.style.removeProperty('color');
        if (wgCss) chip.style.setProperty('text-shadow', wgCss, 'important');
        else chip.style.removeProperty('text-shadow');
      });
    } catch (err) {
      console.warn('[WinCard] applyCardCosmetics threw, continuing render:', err, cosmeticsRaw);
    }
  }

  // ── Leaderboard-row cosmetics ──
  // Port of session-win-card's applyRowCosmetics: name color/glow, avatar
  // ring via PfpCosmetics, [title], hero-badge chip, ambient aura.
  function applyRowCosmetics(rowEl, cos, gameId) {
    if (!cos) return;
    try {
      var nameEl = rowEl.querySelector('.wc-name-text');
      var avShell = rowEl.querySelector('.wc-lb-avatar');
      var avInner = rowEl.querySelector('.wc-lb-avatar-inner');
      if (!nameEl || !avShell) return;
      if (window.PfpCosmetics) {
        var nameCos = {};
        if (visGate('name_color') && cos.name_color) nameCos.name_color = cos.name_color;
        if (visGate('name_glow') && cos.name_glow) nameCos.name_glow = cos.name_glow;
        window.PfpCosmetics.applyName(nameEl, nameCos);
        if (avInner && (cos.profile_border || cos.profile_glow)) {
          window.PfpCosmetics.apply(avInner, avShell, {
            profile_border: visGate('profile_border') ? cos.profile_border : null,
            profile_glow: visGate('profile_glow') ? cos.profile_glow : null
          });
        }
      }
      if (cos.title && cos.title.title && visGate('title') && !TITLE_HIDDEN_GAMES[gameId]) {
        var ts = document.createElement('span');
        ts.className = 'wc-title';
        ts.textContent = '[' + cos.title.title + ']';
        if (window.PfpCosmetics) window.PfpCosmetics.applyTitle(ts, cos.title);
        nameEl.parentNode.insertBefore(ts, nameEl.nextSibling);
      }
      if (window.AmbientFx) {
        var rAmb = (visGate('name_color') && cos.name_color && cos.name_color.__ambient) ||
                   (visGate('name_glow') && cos.name_glow && cos.name_glow.__ambient) || null;
        if (rAmb) window.AmbientFx.attach(nameEl, rAmb);
      }
      // Hero badge chip on the row avatar (image or icon/emoji form).
      if (cos.hero_badge && visGate('hero_badge')) {
        var badge = document.createElement('div');
        badge.className = 'wc-hero-chip';
        if (cos.hero_badge.backgroundImage) {
          badge.style.backgroundImage = mediaBackground(cos.hero_badge.backgroundImage);
          if (cos.hero_badge.backgroundImageSize) badge.style.backgroundSize = cos.hero_badge.backgroundImageSize;
        } else {
          badge.textContent = cos.hero_badge.icon || cos.hero_badge.emoji || '';
        }
        if (cos.hero_badge.borderColor) badge.style.borderColor = cos.hero_badge.borderColor;
        if (cos.hero_badge.background) badge.style.background = mediaCss(cos.hero_badge.background);
        if (cos.hero_badge.animation) badge.style.animation = cos.hero_badge.animation;
        avShell.appendChild(badge);
      }
    } catch (err) {
      console.warn('[WinCard] applyRowCosmetics threw, skipping this row\'s cosmetics:', err, cos);
    }
  }

  // ── DOM scaffold ──
  var root = null;
  var hideTimer = null;
  var queue = [];
  var showing = false;
  var suppressedOnHide = null;
  var announcement = null;

  // Keep the region present before a result arrives. Announcing a separate
  // concise summary avoids re-reading every asynchronously loaded cosmetic
  // and does not move focus away from the player's current game control.
  function ensureAnnouncement() {
    if (announcement || !document.body) return announcement;
    announcement = document.createElement('div');
    announcement.id = 'wt-win-card-announcement';
    announcement.setAttribute('role', 'status');
    announcement.setAttribute('aria-live', 'polite');
    announcement.setAttribute('aria-atomic', 'true');
    announcement.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;padding:0;border:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);clip-path:inset(50%);white-space:nowrap;pointer-events:none';
    document.body.appendChild(announcement);
    return announcement;
  }

  function resultAnnouncement(data) {
    var winner = data.winner || {};
    var parts = [String(data.gameName || data.game || 'Game') + ' result.',
      String(winner.displayName || winner.username || 'Someone') + '.'];
    if (data.word) parts.push(String(data.word) + '.');
    var guesses = Number(data.guessCount) || 0;
    if (guesses > 0) parts.push(guesses + ' guess' + (guesses !== 1 ? 'es' : '') + '.');
    var jackpot = Number(data.jackpot) || 0;
    if (jackpot > 0) parts.push(jackpot.toLocaleString() + ' XP.');
    if (data.stats != null && String(data.stats).trim()) parts.push(String(data.stats).trim());
    return parts.join(' ');
  }

  ensureAnnouncement();
  if (!document.body) document.addEventListener('DOMContentLoaded', ensureAnnouncement, { once: true });

  function buildCard() {
    if (root) return root;
    root = document.createElement('div');
    root.id = 'wt-win-card';
    root.innerHTML =
      '<div class="wc-frame"><div class="win-card">'
      + '<div class="wc-hero-bg"></div>'
      + '<div class="wc-row">'
      + '<div class="wc-text">'
      + '<div class="wc-headline">WINNER</div>'
      + '<div class="wc-nameline">'
      + '<div class="wc-name"><span class="wc-name-text">—</span></div>'
      + '<span class="wc-game-pill"></span>'
      + '</div>'
      + '<div class="wc-meta">'
      + '<span class="wc-chip guesses" style="display:none"></span>'
      + '<span class="wc-chip jackpot" style="display:none"></span>'
      + '<span class="wc-chip wins" style="display:none"></span>'
      + '</div>'
      + '<div class="wc-stats" style="display:none"></div>'
      + '<div class="wc-title-finder" style="display:none"></div>'
      + '</div>'
      + '</div>'
      + '<div class="wc-lb" style="display:none"></div>'
      + '<div class="wc-actions"></div>'
      + '</div></div>';
    document.body.appendChild(root);
    return root;
  }

  function q(sel) { return root.querySelector(sel); }

  // ── Render ──
  function render(data) {
    buildCard();
    var opts = data;
    var winner = data.winner || {};
    var gameId = String(data.game || '').toLowerCase();
    var finder = data.targetFinder || data.titleFinder || null;

    // Reset per-show state
    var frame = q('.wc-frame');
    var oldAvatar = q('.wc-avatar');
    if (oldAvatar) oldAvatar.remove();
    q('.wc-name').querySelectorAll('.wc-found-word, .wc-title').forEach(function (el) { el.remove(); });
    // The stacked long-title block is a sibling of .wc-nameline, so the reset
    // above never reaches it — clear it explicitly or a wiki title survives
    // into the next game's card.
    var oldBlock = q('.wc-text > .wc-found-word.is-block');
    if (oldBlock) oldBlock.remove();
    if (window.AmbientFx) {
      window.AmbientFx.detach(q('.wc-hero-bg'));
      window.AmbientFx.detach(q('.wc-name .wc-name-text'));
    }

    // Winner name + word chip (winner found the word unless a DIFFERENT
    // targetFinder is supplied — see goals-overlay showWinCard).
    var winnerName = winner.displayName || winner.username || 'Someone';
    var winnerIsFinder = !!data.word && (finder ? samePlayer(winner, finder) : true);
    var nameWrap = q('.wc-name');
    nameWrap.querySelector('.wc-name-text').textContent = truncName(winnerName);
    if (winnerIsFinder) {
      var chip = document.createElement('span');
      var isTitle = isLongTitle(data.word);
      chip.className = 'wc-found-word' + (isTitle ? ' is-block' : '');
      chip.textContent = String(data.word).toUpperCase();
      // A multi-word article title gets its own wrapping row under the name
      // line; a single word stays inline beside it.
      if (isTitle) q('.wc-text').insertBefore(chip, q('.wc-meta'));
      else nameWrap.appendChild(chip);
    }

    // Game pill
    q('.wc-game-pill').textContent = data.gameName || data.game || '';

    // Avatar (rebuilt each show so PerkBadges/PfpCosmetics start clean)
    if (winner.profilePic || winner.displayName || winner.username) {
      var shell = buildAvatar(winner, 'wc-avatar', 'wc-avatar-inner');
      q('.wc-row').insertBefore(shell, q('.wc-text'));
      applyPerkBadges(shell, winner);
    }

    // Meta chips
    var guessChip = q('.wc-chip.guesses');
    var guessCount = Number(data.guessCount) || 0;
    if (guessCount > 0) {
      guessChip.textContent = guessCount + ' guess' + (guessCount !== 1 ? 'es' : '');
      guessChip.style.display = '';
    } else guessChip.style.display = 'none';

    var jackpotChip = q('.wc-chip.jackpot');
    var jackpot = Number(data.jackpot) || 0;
    if (jackpot > 0) {
      jackpotChip.textContent = '+' + jackpot.toLocaleString() + ' XP';
      jackpotChip.style.display = '';
    } else jackpotChip.style.display = 'none';

    // Total-wins chip — inline value wins; otherwise lazy-fetch and fill in.
    var winsChip = q('.wc-chip.wins');
    winsChip.style.display = 'none';
    var inlineWins = (typeof data.totalWins === 'number') ? data.totalWins
      : (typeof winner.totalWins === 'number' ? winner.totalWins : null);
    if (inlineWins != null) {
      winsChip.textContent = '🏆 ' + inlineWins.toLocaleString() + ' wins';
      winsChip.style.display = '';
    } else if (gameId) {
      fetchTotalWins(winner, gameId).then(function (n) {
        if (n != null && n > 0 && winsChip.isConnected) {
          winsChip.textContent = '🏆 ' + n.toLocaleString() + ' wins';
          winsChip.style.display = '';
        }
      });
    }

    // Free-text stats line, for games whose numbers don't fit the chips —
    // Spelling Bee reports words found / score / bonus words, not one word
    // and a guess count. Plain text only; it is set via textContent.
    var statsEl = q('.wc-stats');
    var statsText = data.stats == null ? '' : String(data.stats).trim();
    if (statsText) {
      statsEl.textContent = statsText;
      statsEl.style.display = '';
    } else statsEl.style.display = 'none';

    // Title-finder line (games where the finder is NOT the round winner)
    var tf = q('.wc-title-finder');
    if (finder && !samePlayer(winner, finder)) {
      var tfName = truncName(finder.displayName || finder.username || 'someone');
      tf.innerHTML = '<span class="wc-tf-fixed">Title found by @</span>'
        + '<span class="wc-name-text">' + esc(tfName) + '</span>'
        + (data.word ? '<span class="wc-tf-word">&nbsp;— "' + esc(data.word) + '"</span>' : '');
      tf.style.display = '';
    } else tf.style.display = 'none';

    // ── Leaderboard (MP): winner is the hero; rows are the round's top 10 ──
    var lb = q('.wc-lb');
    lb.innerHTML = '';
    var list = Array.isArray(data.topPlayers) ? data.topPlayers.slice(0, 10) : [];
    var startRank = 1;
    if (list.length && isSamePerson(list[0], winner)) {
      list = list.slice(1);
      startRank = 2;
    }
    if (!list.length || data.mode !== 'mp') {
      lb.style.display = 'none';
    } else {
      lb.style.display = '';
      var cap = document.createElement('div');
      cap.className = 'wc-lb-title';
      cap.textContent = data.listTitle || 'ROUND STANDINGS';
      lb.appendChild(cap);
      list.forEach(function (p, i) {
        // Per-row try/catch — one malformed payload can't blank the card.
        try {
          var rank = i + startRank;
          var points = Number(p.points || p.xp || p.score || 0);
          var row = document.createElement('div');
          row.className = 'wc-lb-row rank-' + rank + (isSamePerson(winner, p) ? ' wc-lb-winner' : '');
          var rankEl = document.createElement('div');
          rankEl.className = 'wc-lb-rank';
          rankEl.textContent = '#' + rank;
          row.appendChild(rankEl);
          var av = buildAvatar(p, 'wc-lb-avatar', 'wc-lb-avatar-inner');
          row.appendChild(av);
          var nameCell = document.createElement('div');
          nameCell.className = 'wc-lb-name';
          var rowName = document.createElement('span');
          rowName.className = 'wc-name-text';
          rowName.textContent = truncName(p.displayName || p.username || 'Anon');
          nameCell.appendChild(rowName);
          if (finder && data.word && samePlayer(finder, p)) {
            var wChip = document.createElement('span');
            wChip.className = 'wc-found-word';
            wChip.textContent = String(data.word).toUpperCase();
            nameCell.appendChild(wChip);
          }
          row.appendChild(nameCell);
          var pts = document.createElement('div');
          pts.className = 'wc-lb-points';
          pts.textContent = points.toLocaleString();
          row.appendChild(pts);
          lb.appendChild(row);
          applyPerkBadges(av, p);
          applyRowCosmetics(row, p.cosmetics, gameId);
        } catch (err) {
          console.warn('[WinCard] row render threw, skipping rank ' + (i + startRank) + ':', err, p);
        }
      });
    }

    // ── Action buttons ──
    var actionsEl = q('.wc-actions');
    actionsEl.innerHTML = '';
    (Array.isArray(data.actions) ? data.actions : []).forEach(function (a) {
      if (!a || !a.label) return;
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wc-action' + (a.primary ? ' primary' : '');
      btn.textContent = String(a.label);
      if (typeof a.onClick === 'function') {
        btn.addEventListener('click', function (ev) { ev.stopPropagation(); a.onClick(); });
      } else if (a.href) {
        btn.addEventListener('click', function () { window.location.href = a.href; });
      }
      actionsEl.appendChild(btn);
    });

    // ── Cosmetics LAST so chips/rows injected above get styled too ──
    applyCardCosmetics(frame, opts, winner.cosmetics);
    if (!winner.cosmetics && winner.platform && (winner.platformUserId || winner.id)) {
      fetchCosmetics(winner.platform, winner.platformUserId || winner.id).then(function (eq) {
        if (eq && frame.isConnected) applyCardCosmetics(frame, opts, eq);
      });
    }

    // ── Win-effect particles anchored to the card perimeter ──
    try {
      var fxCfg = (winner.cosmetics && winner.cosmetics.win_effect && winner.cosmetics.win_effect.effect)
        ? winner.cosmetics.win_effect
        : (data.winEffect ? { effect: data.winEffect } : null);
      if (fxCfg && window.playWinEffect) {
        var r = q('.win-card').getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          fxCfg = Object.assign({}, fxCfg, { spawnRect: { left: r.left, top: r.top, width: r.width, height: r.height } });
        }
        window.playWinEffect(fxCfg);
      }
    } catch (_) { /* particles are cosmetic — never block the card */ }
  }

  // ── Show / hide / queue ──
  function show(data) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    render(data);
    var resultStatus = ensureAnnouncement();
    if (resultStatus) resultStatus.textContent = '';
    root.style.display = 'block';
    root.querySelectorAll('video.wc-hero-video').forEach(function (video) {
      video.play().catch(function () { /* Muted autoplay can still be disabled by the browser. */ });
    });
    root.classList.remove('hide');
    // setTimeout, not rAF — hidden tabs throttle rAF and the card would
    // stay at opacity:0 (same lesson as the OBS overlays).
    setTimeout(function () {
      root.classList.add('show');
      if (resultStatus) resultStatus.textContent = resultAnnouncement(data);
    }, 16);

    var autoHideMs = data.autoHideMs != null
      ? Number(data.autoHideMs)
      : SHOW_MS[data.mode === 'mp' ? 'mp' : 'solo'];
    if (autoHideMs > 0) {
      hideTimer = setTimeout(function () { hide(data.onHide); }, Math.max(1000, autoHideMs));
    } else {
      root._onHide = data.onHide || null;
    }
  }

  function hide(cb) {
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
    if (suppressedOnHide) {
      var pending = suppressedOnHide;
      suppressedOnHide = null;
      try { pending(); } catch (_) {}
    }
    if (!root) return;
    var onHide = cb || root._onHide || null;
    root._onHide = null;
    root.classList.remove('show');
    root.classList.add('hide');
    setTimeout(function () {
      root.classList.remove('hide');
      root.style.display = 'none';
      showing = false;
      if (typeof onHide === 'function') {
        try { onHide(); } catch (_) {}
      }
      processQueue();
    }, 500);
  }

  function processQueue() {
    if (!queue.length) { showing = false; return; }
    showing = true;
    show(queue.shift());
  }

  function enqueue(data) {
    if (IN_STREAM_EMBED && !window.WIN_CARD_FORCE) {
      // Card suppressed (the streamer's own widget shows it) — but keep the
      // game's timing contract: auto-hide fires onHide on schedule, and a
      // manual WinCard.hide() flushes it.
      if (typeof data.onHide === 'function') {
        var ms = data.autoHideMs != null
          ? Number(data.autoHideMs)
          : SHOW_MS[data.mode === 'mp' ? 'mp' : 'solo'];
        if (ms > 0) {
          if (hideTimer) clearTimeout(hideTimer);
          suppressedOnHide = data.onHide;
          hideTimer = setTimeout(function () { hideTimer = null; hide(); }, Math.max(1000, ms));
        } else {
          suppressedOnHide = data.onHide;
        }
      }
      return;
    }
    queue.push(data);
    if (!showing) processQueue();
  }

  // ── Public API ──
  window.WinCard = {
    show: function (opts) {
      if (!opts) return;
      opts = Object.assign({ mode: 'solo' }, opts);
      enqueue(opts);
    },
    showSolo: function (opts) {
      if (!opts) return;
      opts = Object.assign({}, opts, { mode: 'solo' });
      enqueue(opts);
    },
    showMp: function (opts) {
      if (!opts) return;
      opts = Object.assign({}, opts, { mode: 'mp' });
      enqueue(opts);
    },
    // Feed a relay `game-win` payload straight in. Filters the SpellingBee
    // per-word events (winType:'word') — those are Sassie/event signals,
    // not round-end wins.
    handleGameWin: function (data) {
      if (!data || data.winType === 'word') return;
      var opts = Object.assign({}, data, { mode: 'mp' });
      enqueue(opts);
    },
    hide: function () { hide(); },
    // Sample MP card for manual testing from the console.
    demo: function () {
      enqueue({
        mode: 'mp', game: 'searchle', gameName: 'Searchle',
        word: 'mountain', jackpot: 1250, guessCount: 4,
        winner: { displayName: 'jorrybeaufart', platform: 'tiktok', isSuperfan: true },
        topPlayers: [
          { displayName: 'jorrybeaufart', platform: 'tiktok', points: 4200, isSuperfan: true },
          { displayName: 'wordwizard', platform: 'tiktok', points: 3100, isFanClub: true },
          { displayName: 'speedguesser', platform: 'youtube', points: 2700, isDonor: true },
          { displayName: 'lexilooper', platform: 'tiktok', points: 1900 },
          { displayName: 'guesserjr', platform: 'tiktok', points: 1400 },
          { displayName: 'rng_man', platform: 'twitch', points: 980 },
          { displayName: 'bigbrainmoves', platform: 'tiktok', points: 720 },
          { displayName: 'lateguesser', platform: 'youtube', points: 410 },
          { displayName: 'try_hard', platform: 'tiktok', points: 300 },
          { displayName: 'just_chatting', platform: 'twitch', points: 120 }
        ]
      });
    },
    _internals: { truncName: truncName, samePlayer: samePlayer, HUB: HUB, inStreamEmbed: IN_STREAM_EMBED }
  };
})();
