const ROOM_VIRTUAL_WIDTHS = Object.freeze({
  // Subtextle's touch-mode script requests a 980px viewport and its coarse-
  // pointer CSS sizes the keyboard for that scaled canvas. An iframe does not
  // receive the top-level browser's viewport scaling, so the room shell must.
  searchle: 980,
  'searchle-grid': 980,
  'searchle-numbers': 980,
  wikisearchle: 720,
  wikirectangled: 640,
  wikiword: 640,
  'wikiword-4x4': 480,
});

function getVirtualWidth(gameId) {
  const width = ROOM_VIRTUAL_WIDTHS[String(gameId || '').trim().toLowerCase()];
  return Number.isFinite(width) ? width : null;
}

module.exports = { getVirtualWidth };
