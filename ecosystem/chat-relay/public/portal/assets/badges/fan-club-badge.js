/* TikTok Fan Club badge helper.
   Include this on any page that renders user avatars from chat-message
   payloads. The relay populates user.badges with 'fan-club' when the
   TikTok user is in the fan club AND has not toggled it off in their
   portal profile.

   Pair with /portal/assets/badges/fan-club-badge.css for the visual.

   Two ways to use:

   1) Declarative — give your avatar img a wrapping span and call
      FanClubBadge.apply(wrapEl, user) when rendering.

   2) Imperative one-shot — call FanClubBadge.wrapAvatarImg(imgEl, user)
      to wrap an existing <img> in a .avatar-wrap span and toggle
      .has-fan-club-badge on it. Idempotent.
*/
(function () {
  'use strict';

  function isFanClub(user) {
    if (!user) return false;
    if (Array.isArray(user.badges) && user.badges.indexOf('fan-club') !== -1) return true;
    // Some payloads may pass the boolean directly (e.g. game-win, scoreboard).
    if (user.isFanClub === true || user.is_fan_club === 1 || user.is_fan_club === true) return true;
    return false;
  }

  function apply(wrapEl, user) {
    if (!wrapEl) return;
    if (!wrapEl.classList.contains('avatar-wrap')) wrapEl.classList.add('avatar-wrap');
    if (isFanClub(user)) {
      wrapEl.classList.add('has-fan-club-badge');
    } else {
      wrapEl.classList.remove('has-fan-club-badge');
    }
  }

  function wrapAvatarImg(imgEl, user) {
    if (!imgEl) return null;
    var parent = imgEl.parentElement;
    var wrap;
    if (parent && parent.classList && parent.classList.contains('avatar-wrap')) {
      wrap = parent;
    } else {
      wrap = document.createElement('span');
      wrap.className = 'avatar-wrap';
      if (parent) parent.insertBefore(wrap, imgEl);
      wrap.appendChild(imgEl);
    }
    apply(wrap, user);
    return wrap;
  }

  window.FanClubBadge = {
    apply: apply,
    wrapAvatarImg: wrapAvatarImg,
    isFanClub: isFanClub,
    badgeUrl: 'https://wordtycoon.live/portal/assets/badges/tiktok-fanclub.png'
  };
})();
