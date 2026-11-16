/**
 * city-cosmetics.js — Parse CSS cosmetic values to canvas-friendly params
 * Exports: window.CityCosmetics
 */
(function () {
  'use strict';

  /**
   * Parse a CSS color string, returning it as-is (hex, rgb, rgba all work in canvas)
   */
  function parseColor(cssColor) {
    if (!cssColor) return null;
    return cssColor;
  }

  /**
   * Parse a CSS textShadow into canvas shadow params
   * e.g. "0 0 10px #ff0000" → { blur: 10, color: '#ff0000', offsetX: 0, offsetY: 0 }
   */
  function parseTextShadow(ts) {
    if (!ts) return null;
    // Match: offsetX offsetY blur color
    const m = ts.match(/(-?\d+)px\s+(-?\d+)px\s+(\d+)px\s+(#[0-9a-fA-F]+|rgba?\([^)]+\))/);
    if (!m) return null;
    return {
      offsetX: parseInt(m[1]),
      offsetY: parseInt(m[2]),
      blur: parseInt(m[3]),
      color: m[4]
    };
  }

  /**
   * Parse a CSS boxShadow into a glow params
   */
  function parseBoxShadow(bs) {
    if (!bs) return null;
    const m = bs.match(/(-?\d+)px\s+(-?\d+)px\s+(\d+)px\s+(#[0-9a-fA-F]+|rgba?\([^)]+\))/);
    if (!m) return null;
    return {
      blur: parseInt(m[3]),
      color: m[4]
    };
  }

  /**
   * profile_border ships `border` ("3px solid #cd7f32") and, for epic+, a
   * conic `backgroundImage` over `border: 4px solid transparent`. It has never
   * carried a `borderColor` or `color` key — reading those returned undefined,
   * so the city border was always uncoloured. Pull the stroke colour out of
   * the shorthand, falling back to the brightest stop of the conic gradient.
   */
  function extractBorderColor(pb) {
    if (!pb) return null;
    var m = /(#[0-9a-fA-F]{3,8}|rgba?\([^)]*\))/.exec(pb.border || '');
    if (m && m[1] !== 'transparent') return m[1];
    var stops = String(pb.backgroundImage || '').match(/#[0-9a-fA-F]{6}/g);
    if (!stops || !stops.length) return null;
    var best = null, bestBright = -1;
    for (var i = 0; i < stops.length; i++) {
      var b = parseInt(stops[i].substr(1, 2), 16) +
              parseInt(stops[i].substr(3, 2), 16) +
              parseInt(stops[i].substr(5, 2), 16);
      if (b > bestBright) { bestBright = b; best = stops[i]; }
    }
    return best;
  }

  /**
   * Extract canvas-ready values from a player's equipped cosmetics object
   */
  function extractCanvasParams(equipped) {
    if (!equipped) return {};
    return {
      nameColor: parseColor(equipped.name_color?.color) || null,
      nameGlow: parseTextShadow(equipped.name_glow?.textShadow) || null,
      windowAccent: parseColor(equipped.word_color?.color) || null,
      windowGlow: parseTextShadow(equipped.word_glow?.textShadow) || null,
      borderColor: parseColor(extractBorderColor(equipped.profile_border)) || null,
      groundGlow: parseBoxShadow(equipped.profile_glow?.boxShadow) || null,
      title: equipped.title?.name || null,
      heroBadge: equipped.hero_badge?.background || null,
    };
  }

  window.CityCosmetics = {
    parseColor, parseTextShadow, parseBoxShadow, extractCanvasParams
  };
})();
