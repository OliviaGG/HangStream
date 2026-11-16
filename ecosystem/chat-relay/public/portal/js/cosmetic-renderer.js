(function () {
  const LAYER_SELECTOR = '.portal-cosmetic-layer';
  const WT_LOGO_FRAME_BOUNDS = {
    left: 45 / 1024,
    top: 65 / 1024,
    right: 976 / 1024,
    bottom: 969 / 1024
  };

  function getCssStrokeWidth(cssValue) {
    if (!cssValue || typeof cssValue !== 'string') return 0;
    const match = cssValue.match(/(\d+(?:\.\d+)?)px/);
    return match ? parseFloat(match[1]) : 0;
  }

  function getTargetAvatar(host, explicitAvatarEl) {
    if (explicitAvatarEl) return explicitAvatarEl;
    if (!host || !host.querySelector) return null;
    return host.querySelector('.avatar-is-logo') || host.querySelector('img');
  }

  function isLogoAvatar(avatarEl) {
    return !!(avatarEl && avatarEl.classList && avatarEl.classList.contains('avatar-is-logo'));
  }

  function readMetricRect(node) {
    if (!node || typeof node.getBoundingClientRect !== 'function') return null;
    const rect = node.getBoundingClientRect();
    if (!rect || !Number.isFinite(rect.width) || !Number.isFinite(rect.height) || rect.width <= 0 || rect.height <= 0) {
      return null;
    }
    return rect;
  }

  function buildFallbackRect(node, fallbackSize) {
    const size = Number(fallbackSize) || node?.clientWidth || node?.clientHeight || 0;
    return {
      left: 0,
      top: 0,
      right: size,
      bottom: size,
      width: size,
      height: size
    };
  }

  function getLogoFrameBox(host, avatarEl) {
    const hostRect = readMetricRect(host) || buildFallbackRect(host, 108);
    const avatarRect = readMetricRect(avatarEl);
    let relativeLeft = 0;
    let relativeTop = 0;
    let visualWidth = avatarEl?.offsetWidth || hostRect.width || 0;
    let visualHeight = avatarEl?.offsetHeight || hostRect.height || 0;

    if (avatarRect) {
      relativeLeft = avatarRect.left - hostRect.left;
      relativeTop = avatarRect.top - hostRect.top;
      visualWidth = avatarRect.width;
      visualHeight = avatarRect.height;
    } else {
      const hostWidth = hostRect.width || host?.clientWidth || visualWidth;
      const hostHeight = hostRect.height || host?.clientHeight || visualHeight;
      relativeLeft = (hostWidth - visualWidth) / 2;
      relativeTop = (hostHeight - visualHeight) / 2;
    }

    const hostWidth = hostRect.width || host?.clientWidth || visualWidth;
    const hostHeight = hostRect.height || host?.clientHeight || visualHeight;
    return {
      left: Math.round((relativeLeft + (visualWidth * WT_LOGO_FRAME_BOUNDS.left)) * 100) / 100,
      top: Math.round((relativeTop + (visualHeight * WT_LOGO_FRAME_BOUNDS.top)) * 100) / 100,
      right: Math.round((hostWidth - (relativeLeft + (visualWidth * WT_LOGO_FRAME_BOUNDS.right))) * 100) / 100,
      bottom: Math.round((hostHeight - (relativeTop + (visualHeight * WT_LOGO_FRAME_BOUNDS.bottom))) * 100) / 100
    };
  }

  function applyLogoLayerBounds(layer, host, avatarEl, expandPx, zIndex) {
    if (!layer || !host || !isLogoAvatar(avatarEl)) return;
    const inset = getLogoFrameBox(host, avatarEl);
    const expand = Number(expandPx) || 0;
    layer.style.top = (inset.top - expand) + 'px';
    layer.style.right = (inset.right - expand) + 'px';
    layer.style.bottom = (inset.bottom - expand) + 'px';
    layer.style.left = (inset.left - expand) + 'px';
    layer.style.borderRadius = '50%';
    layer.style.zIndex = String(zIndex || 1);
  }

  function syncAvatarStack(avatarEl) {
    if (!avatarEl) return;
    if (isLogoAvatar(avatarEl)) {
      avatarEl.style.position = 'relative';
      avatarEl.style.zIndex = '4';
    } else {
      avatarEl.style.zIndex = '';
    }
  }

  function clearLayers(host) {
    if (!host) return;
    host.querySelectorAll(LAYER_SELECTOR).forEach((node) => node.remove());
  }

  function ensureHost(host) {
    if (!host) return;
    const computed = window.getComputedStyle(host);
    if (computed.position === 'static') host.style.position = 'relative';
  }

  function buildLayer(spec, layerKind) {
    if (!spec || !spec.render) return null;
    const render = spec.render;

    // Video backdrop (e.g. Solar Sovereign hero badge): a muted looping
    // <video> filling the layer, with an optional scrim gradient on top so
    // overlaid text stays readable on bright footage.
    if (render.type === 'video_bg') {
      const wrap = document.createElement('div');
      wrap.className = `portal-cosmetic-layer portal-cosmetic-layer--${layerKind} portal-cosmetic-layer--video_bg`;
      wrap.dataset.renderType = 'video_bg';
      wrap.dataset.layerKind = layerKind;
      wrap.style.zIndex = String(render.zIndex || 1);
      wrap.style.overflow = 'hidden';
      const vid = document.createElement('video');
      vid.src = render.asset || '';
      if (render.poster) vid.poster = render.poster;
      vid.autoplay = true;
      vid.muted = true;
      vid.loop = true;
      vid.playsInline = true;
      vid.setAttribute('muted', '');
      vid.setAttribute('playsinline', '');
      vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;';
      wrap.appendChild(vid);
      if (render.scrim) {
        const scrim = document.createElement('div');
        scrim.style.cssText = 'position:absolute;inset:0;pointer-events:none;background:' + render.scrim + ';';
        wrap.appendChild(scrim);
      }
      if (render.opacity != null) wrap.style.opacity = String(render.opacity);
      return wrap;
    }

    const el = document.createElement(render.type === 'image_overlay' ? 'img' : 'div');
    el.className = `portal-cosmetic-layer portal-cosmetic-layer--${layerKind} portal-cosmetic-layer--${render.type}`;
    el.dataset.renderType = render.type;
    el.dataset.layerKind = layerKind;
    el.style.zIndex = String(render.zIndex || (layerKind === 'frame' ? 3 : 1));

    if (render.asset) {
      if (el.tagName === 'IMG') {
        el.src = render.asset;
        el.alt = '';
      } else {
        el.style.backgroundImage = `url("${render.asset}")`;
      }
    }

    if (render.type === 'animated_gradient' && render.background) {
      el.style.background = render.background;
    }

    if (render.backgroundSize) el.style.backgroundSize = render.backgroundSize;
    if (render.backgroundPosition) el.style.backgroundPosition = render.backgroundPosition;
    if (render.backgroundRepeat) el.style.backgroundRepeat = render.backgroundRepeat;
    if (render.opacity != null) el.style.opacity = String(render.opacity);
    if (render.blend) el.style.mixBlendMode = render.blend;
    if (render.animation) el.style.animation = render.animation;
    if (render.inset != null) el.style.inset = render.inset;

    return el;
  }

  function applyLayer(host, avatarEl, spec, layerKind) {
    if (!host || !spec || !spec.render) return;
    ensureHost(host);
    const layer = buildLayer(spec, layerKind);
    if (!layer) return;
    if (layerKind === 'frame' && isLogoAvatar(avatarEl)) {
      applyLogoLayerBounds(layer, host, avatarEl, 0, 3);
    }
    host.appendChild(layer);
  }

  function appendEffectLayer(host, avatarEl, effectSpec, borderCss, glowCss, zIndex) {
    if (!host || (!borderCss && !glowCss)) return;
    ensureHost(host);
    const layer = document.createElement('div');
    layer.className = 'portal-cosmetic-layer portal-cosmetic-layer--logo-effect';
    layer.dataset.layerKind = 'effect';
    layer.style.pointerEvents = 'none';
    layer.style.zIndex = String(zIndex || 4);
    layer.style.borderRadius = '50%';
    if (borderCss) layer.style.border = borderCss;
    if (borderCss && effectSpec.backgroundImage) {
      // Gradient borders have a transparent stroke: keep their paint and
      // hollow out the centre so the logo's transparent details stay visible.
      layer.style.boxSizing = 'border-box';
      layer.style.backgroundImage = effectSpec.backgroundImage;
      layer.style.backgroundOrigin = effectSpec.backgroundOrigin || 'border-box';
      layer.style.backgroundClip = effectSpec.backgroundClip || 'border-box';
      layer.style.backgroundSize = effectSpec.backgroundSize || '100% 100%';
      layer.style.mask = 'linear-gradient(#fff 0 0) padding-box, linear-gradient(#fff 0 0) border-box';
      layer.style.webkitMaskComposite = 'xor';
      layer.style.maskComposite = 'exclude';
    }
    if (glowCss) layer.style.boxShadow = glowCss;
    if (effectSpec.animation) layer.style.animation = effectSpec.animation;
    if (isLogoAvatar(avatarEl)) {
      const strokeWidth = getCssStrokeWidth(layer.style.border);
      const expandPx = strokeWidth > 0 ? Math.max(1, strokeWidth * 0.7) : 0;
      applyLogoLayerBounds(layer, host, avatarEl, expandPx, zIndex);
    }
    host.appendChild(layer);
  }

  function applyEffectLayer(host, avatarEl, effectSpec, borderSpec) {
    if (!host || !effectSpec) return;
    // Older portal callers pass only border/shadow/animation in effectSpec.
    // Recover the complete border paint from the equipped cosmetic spec.
    effectSpec = Object.assign({}, borderSpec && (borderSpec.css || borderSpec.fallbackCss), effectSpec);
    if (isLogoAvatar(avatarEl)) {
      if (effectSpec.boxShadow) appendEffectLayer(host, avatarEl, effectSpec, '', effectSpec.boxShadow, 1);
      if (effectSpec.border) appendEffectLayer(host, avatarEl, effectSpec, effectSpec.border, '', 3);
      return;
    }
    appendEffectLayer(host, avatarEl, effectSpec, effectSpec.border || '', effectSpec.boxShadow || '', 4);
  }

  function applyHeaderLayers(targets) {
    if (!targets) return;
    const avatarEl = getTargetAvatar(targets.avatarWrap, targets.avatarEl);
    syncAvatarStack(avatarEl);
    clearLayers(targets.avatarWrap);
    applyLayer(targets.avatarWrap, avatarEl, targets.borderSpec, 'frame');
    applyEffectLayer(targets.avatarWrap, avatarEl, targets.effectSpec, targets.borderSpec);
  }

  function applyHeroLayers(targets) {
    if (!targets) return;
    const avatarEl = getTargetAvatar(targets.avatarWrap, targets.avatarEl);
    syncAvatarStack(avatarEl);
    clearLayers(targets.avatarWrap);
    clearLayers(targets.heroBg);
    applyLayer(targets.avatarWrap, avatarEl, targets.borderSpec, 'frame');
    applyEffectLayer(targets.avatarWrap, avatarEl, targets.effectSpec, targets.borderSpec);
    applyLayer(targets.heroBg, avatarEl, targets.badgeSpec, 'surface');
  }

  function applyWinEffectPreview(targets) {
    if (!targets || !targets.container) return;
    clearLayers(targets.container);
    applyLayer(targets.container, null, targets.effectSpec, 'effect');
  }

  window.PortalCosmeticRenderer = {
    clearLayers,
    applyHeaderLayers,
    applyHeroLayers,
    applyWinEffectPreview
  };
})();
