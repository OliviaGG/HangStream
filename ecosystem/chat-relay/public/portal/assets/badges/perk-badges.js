/* Perk badges — Super Donor / Super Fan / Donor Class / Fan Club hearts
   around an avatar.

   Pair with /portal/assets/badges/perk-badges.css.

   This supersedes fan-club-badge.js, which could only express one perk. That
   file stays where it is: several pages still include it, and its
   .has-fan-club-badge ::after is independent of anything here.

   Usage — call apply() every time you render or update an avatar:

     PerkBadges.apply(wrapEl, user);

   `wrapEl` is the element WRAPPING the avatar image (not the <img>). `user` is
   any payload carrying the perks; every shape the relay and the game servers
   emit is accepted, see readPerks().

   apply() is idempotent and cheap — it diffs against the classes already on
   the element and returns early when nothing changed, so calling it on every
   frame of a re-render is fine. */
(function () {
  'use strict';

  // Highest tier first. Slot order follows this array, so a one-perk holder
  // always lands in slot 1 regardless of WHICH perk they hold.
  var PERKS = [
    { key: 'superDonor', cls: 'has-sd', badge: 'perk-badge-sd' },
    { key: 'superfan',   cls: 'has-sf', badge: 'perk-badge-sf' },
    { key: 'donor',      cls: 'has-dc', badge: 'perk-badge-dc' },
    { key: 'fanClub',    cls: 'has-fc', badge: 'perk-badge-fc' }
  ];

  // Below this rendered width three hearts stop being legible, so the cluster
  // collapses to the highest tier alone. Subtextle's grid chips sit at roughly
  // 20px on a 1080p screen at the small rank tiers.
  var COMPACT_MAX_PX = 28;

  function truthy(v) {
    return v === true || v === 1 || v === '1';
  }

  /* Read the perks off whatever payload shape the caller has.

     - relay chat identities carry user.badges = ['superfan', 'fan-club', ...]
     - game servers flatten them to booleans (isSuperfan / isFanClub / isDonor)
     - /api/public/perks returns { superfan, donor, fanClub, superDonor }

     All shapes are accepted so callers never have to normalise first.

     Super Donor is DERIVED when the payload doesn't state it: it is exactly
     "holds both", and every producer already reports those two. Deriving here
     rather than requiring the flag means the badge appears on the older
     payload shapes — game servers still emitting the three booleans, and any
     cached /api/public/perks response — without touching each producer. */
  function readPerks(user) {
    if (!user) return { superfan: false, donor: false, fanClub: false, superDonor: false };
    var badges = Array.isArray(user.badges) ? user.badges : [];
    var superfan = truthy(user.superfan) || truthy(user.isSuperfan) || truthy(user.is_superfan) ||
                   badges.indexOf('superfan') !== -1;
    var donor = truthy(user.donor) || truthy(user.isDonor) || truthy(user.is_donor) ||
                badges.indexOf('donor') !== -1;
    return {
      superfan: superfan,
      donor: donor,
      fanClub: truthy(user.fanClub) || truthy(user.isFanClub) || truthy(user.is_fan_club) ||
               badges.indexOf('fan-club') !== -1,
      superDonor: truthy(user.superDonor) || truthy(user.isSuperDonor) || truthy(user.is_super_donor) ||
                  badges.indexOf('super-donor') !== -1 || (superfan && donor)
    };
  }

  function held(user) {
    var perks = readPerks(user);
    return PERKS.filter(function (p) { return perks[p.key]; });
  }

  function signature(list) {
    return list.map(function (p) { return p.key; }).join(',');
  }

  function apply(wrapEl, user) {
    if (!wrapEl || !wrapEl.classList) return;
    var list = held(user);
    var sig = signature(list);

    // Skip the DOM rebuild when the perks haven't changed — re-renders call
    // this constantly and the writes below would otherwise thrash on every
    // guess. The sizing pass further down still runs: an element measured
    // before layout reports offsetWidth 0, so that decision has to stay
    // re-checkable even when the badge set itself is unchanged.
    //
    // The child count has to be part of that test, not just the signature.
    // Several games render an avatar by clearing the wrapper
    // (container.innerHTML = '') and then re-filling it — that destroys the
    // badge spans but NOT the data-perks attribute, so a signature-only check
    // would decide "nothing changed" and never put them back.
    var present = wrapEl.querySelectorAll(':scope > .perk-badge').length;
    if (wrapEl.getAttribute('data-perks') !== sig || present !== list.length) {
      wrapEl.setAttribute('data-perks', sig);
      wrapEl.classList.add('perk-badges');
      // The badges are absolutely positioned, so they need a positioned
      // ancestor — but only supply one when the host hasn't positioned itself.
      // Forcing this from CSS clobbered Subtextle's ticker face
      // (.rt-av { position: absolute; right: 0 }) and threw the avatar to the
      // wrong end of the chip. Set inline, and only for a static host.
      if (list.length && getComputedStyle(wrapEl).position === 'static') {
        wrapEl.style.position = 'relative';
      }
      PERKS.forEach(function (p) {
        wrapEl.classList.toggle(p.cls, list.indexOf(p) !== -1);
      });

      var stale = wrapEl.querySelectorAll(':scope > .perk-badge');
      for (var i = 0; i < stale.length; i++) stale[i].remove();

      list.forEach(function (p, index) {
        var span = document.createElement('span');
        span.className = 'perk-badge ' + p.badge;
        span.setAttribute('data-slot', String(index + 1));
        span.setAttribute('aria-hidden', 'true');
        wrapEl.appendChild(span);
      });
    }

    // Compact mode only matters with more than one badge. A width of 0 means
    // "not laid out yet" — leave the full cluster and let a later call decide,
    // rather than latching a wrong answer.
    if (list.length > 1) {
      var w = wrapEl.offsetWidth || 0;
      if (w > 0) wrapEl.classList.toggle('perk-badges-compact', w <= COMPACT_MAX_PX);
    } else {
      wrapEl.classList.remove('perk-badges-compact');
    }
  }

  /* Wrap a bare <img> in a .perk-badges span and badge it. Idempotent — safe
     to call on an image that has already been wrapped. Mirrors
     FanClubBadge.wrapAvatarImg so existing call sites can be swapped in place. */
  function wrapAvatarImg(imgEl, user) {
    if (!imgEl) return null;
    var parent = imgEl.parentElement;
    var wrap;
    if (parent && parent.classList && parent.classList.contains('perk-badges')) {
      wrap = parent;
    } else {
      wrap = document.createElement('span');
      wrap.className = 'perk-badges';
      if (parent) parent.insertBefore(wrap, imgEl);
      wrap.appendChild(imgEl);
    }
    apply(wrap, user);
    return wrap;
  }

  window.PerkBadges = {
    apply: apply,
    wrapAvatarImg: wrapAvatarImg,
    readPerks: readPerks,
    compactMaxPx: COMPACT_MAX_PX
  };
})();
