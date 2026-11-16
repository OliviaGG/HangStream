// Widget-scoped chat routing for streamer game embeds.
// Pure helper so relay.js can keep the hot path small and tests can cover
// multi-widget edge cases without booting the whole relay.

const STREAMER_TO_RELAY_ROOM = {
  sproutle: 'erectangled',
  'searchle-grid': 'searchle',
  'searchle-numbers': 'searchle',
  wikiword: 'wikirectangled',
  'wikiword-4x4': 'wikirectangled',
};

function normalizeRelayRoomId(gameId) {
  const key = String(gameId || '').trim().toLowerCase();
  if (!key) return '';
  return STREAMER_TO_RELAY_ROOM[key] || key;
}

function resolveWidgetGameId(widget, fallbackGame) {
  const explicitGame = String(widget?.displayGame || '').trim().toLowerCase();
  const sourceGame = explicitGame || String(fallbackGame || '').trim().toLowerCase();

  // Dashboard also supports Displayed game = Searchle + Mode = Grid.
  // Treat that as the searchle-grid widget target for payload metadata.
  if (sourceGame === 'searchle' && widget?.searchleMode === 'grid') {
    return 'searchle-grid';
  }

  return sourceGame;
}

function routeDedupeKey(route) {
  const gameId = String(route?.gameId || '').trim().toLowerCase();
  const room = String(route?.room || '').trim().toLowerCase();

  // Searchle Grid is a render variant of the normal Searchle session, so
  // emitting both searchle and searchle-grid to the same backend would double
  // count a guess. Number Search is a distinct Searchle backend variant.
  if (room === 'searchle') {
    return gameId === 'searchle-numbers' ? 'searchle:numbers' : 'searchle:words';
  }

  return room;
}

function resolveWidgetChatTargets({ widgets, activeGames, targetGame, normalized }) {
  const gameWidgets = (Array.isArray(widgets) ? widgets : [])
    .filter(w => w && w.type === 'gameEmbed' && w.enabled !== false);
  if (!gameWidgets.length) return { usedWidgetRouting: false, targets: [] };

  const fallbackGame = String(
    (Array.isArray(activeGames) && activeGames[0]) || targetGame || ''
  ).trim().toLowerCase();

  const resolvedRoutes = [];
  for (const widget of gameWidgets) {
    const gameId = resolveWidgetGameId(widget, fallbackGame);
    const room = normalizeRelayRoomId(gameId);
    if (!room) continue;
    resolvedRoutes.push({
      room,
      gameId,
      prefix: String(widget.chatPrefix || '').trim(),
      widgetId: widget.id,
      key: routeDedupeKey({ room, gameId }),
    });
  }
  if (!resolvedRoutes.length) return { usedWidgetRouting: false, targets: [] };

  const rawMessage = String(normalized?.message || '');
  const emitTargets = [];
  const seenKeys = new Set();
  const pushTarget = (route, messageText) => {
    if (!route?.room || !route.key || seenKeys.has(route.key)) return;
    seenKeys.add(route.key);
    emitTargets.push({
      room: route.room,
      gameId: route.gameId,
      widgetId: route.widgetId,
      message: messageText,
    });
  };

  const matches = resolvedRoutes
    .filter(route => route.prefix && rawMessage.startsWith(route.prefix))
    .sort((a, b) => b.prefix.length - a.prefix.length);
  if (matches.length) {
    for (const route of matches) {
      pushTarget(route, rawMessage.slice(route.prefix.length).replace(/^\s+/, ''));
    }
    return { usedWidgetRouting: true, targets: emitTargets };
  }

  const catchAllRoutes = resolvedRoutes.filter(route => !route.prefix);
  if (catchAllRoutes.length) {
    for (const route of catchAllRoutes) pushTarget(route, rawMessage);
    return { usedWidgetRouting: true, targets: emitTargets };
  }

  return { usedWidgetRouting: true, targets: [] };
}

module.exports = {
  STREAMER_TO_RELAY_ROOM,
  normalizeRelayRoomId,
  resolveWidgetGameId,
  resolveWidgetChatTargets,
  _internal: { routeDedupeKey },
};
