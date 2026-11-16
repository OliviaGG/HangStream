/* HangStream brand layer — runs on relay pages and rewrites visible
   Word Tycoon branding to HangStream Play. Only touches rendered text,
   titles and meta tags; never hrefs, scripts, or API payloads, so all
   Word Tycoon functionality keeps working underneath. */
(function () {
  'use strict';

  var BRAND_RE = /word\s*tycoon|wordtycoon\.live/gi;
  var DISPLAY = 'HangStream Play';
  var HOST = 'play.hangstream.me';

  function fixString(s) {
    if (!s) return s;
    return String(s)
      .replace(/wordtycoon\.live/gi, HOST)
      .replace(/word\s*tycoon/gi, DISPLAY);
  }

  // <title> + social/meta tags in <head>
  try {
    if (document.title) document.title = fixString(document.title);
    document.querySelectorAll('meta[property], meta[name]').forEach(function (m) {
      ['content', 'value'].forEach(function (a) {
        var v = m.getAttribute(a);
        if (v && BRAND_RE.test(v)) { BRAND_RE.lastIndex = 0; m.setAttribute(a, fixString(v)); }
        BRAND_RE.lastIndex = 0;
      });
    });
  } catch (e) {}

  // Visible text nodes in <body> — skip script/style/svg-title internals
  // that aren't rendered as page copy.
  function skip(node) {
    var p = node.parentElement;
    while (p) {
      var t = p.tagName;
      if (t === 'SCRIPT' || t === 'STYLE' || t === 'NOSCRIPT' || t === 'TEMPLATE' || t === 'CODE' || t === 'PRE') return true;
      p = p.parentElement;
    }
    return false;
  }

  try {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !BRAND_RE.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        BRAND_RE.lastIndex = 0;
        return skip(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    var nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(function (n) {
      n.nodeValue = fixString(n.nodeValue);
    });
  } catch (e) {}

  // Swap Word Tycoon logo images for the HangStream mark
  try {
    document.querySelectorAll('img').forEach(function (img) {
      var alt = img.getAttribute('alt') || '';
      if (/word\s*tycoon/i.test(alt) || /wt-logo|logo-favicon|logo\.png/i.test(img.getAttribute('src') || '')) {
        img.src = '/portal/img/hangstream-mark.svg';
        img.alt = 'HangStream';
      }
    });
  } catch (e) {}
})();
