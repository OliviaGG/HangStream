/**
 * Activity Overlay — cross-game permanent feed of significant events.
 *
 * Broadcasts to Socket.IO room `activity-overlay`. Hooks called from
 * chat-relay's main `game-win`, `daily-win`, and `game-event` socket handlers.
 *
 * Display contract (consumed by public/activity-overlay.html):
 *   {
 *     ts: number,                      // ms epoch
 *     game: string,                    // canonical game id (e.g. 'wikisearchle')
 *     gameName: string,                // display label
 *     eventType: 'win' | 'jackpot' | 'daily' | 'streak',
 *     value: number | null,            // points/coins/streak count (null if N/A)
 *     valueLabel: string | null,       // e.g. 'pts', 'coins', '×3'
 *     totalWins: number | null,        // user's total wins in this game
 *     user: { displayName, platform, profilePic, cosmetics? }
 *   }
 *
 * Cosmetics enrichment is the SAME pipeline as win-overlay: caller already
 * looks up linkedDiscord and getUserCosmetics. We accept the user object as-is.
 *
 * Streak events come from event-overlay.js's existing per-game streak tracker
 * (no duplicate state). game-win and daily-win flow from chat-relay handlers.
 */

let io = null;

const STREAK_TIERS = {
  streak_3: { count: 3, label: '×3' },
  streak_5: { count: 5, label: '×5' },
  streak_10: { count: 10, label: '×10' },
};

const GAME_LABELS = {
  subtextle: 'Subtextle',
  wordle: 'Wordle',
  // Game ID `word5000` (word5000.com). `word500` is a legacy alias.
  word5000: 'Word5000',
  word500: 'Word5000',
  color500: 'Color500',
  colour500: 'Color500',
  sproutle: 'erecTangled',
  erectangled: 'erecTangled',
  rectangled: 'recTangled',
  squaredle: 'recTangled',
  spellingbee: 'Spelling Bee',
  'spelling-bee': 'Spelling Bee',
  betweenly: 'Betwixt',
  betwixt: 'Betwixt',
  figural: 'Figural',
  pixeletters: 'PixeLetters',
  unwordle: 'UnWordle',
  wikiword: 'WikiWord',
  wikicontexto: 'WikiContexto',
  wikisearchle: 'WikiContexto',
  wikirectangled: 'WikirecTangled',
  triangled: 'Triangled',
  junkdrawer: 'Junk Drawer',
  synapse: 'Synapse'
};

function init(_io) { io = _io; }

function broadcast(payload) {
  if (!io) return;
  io.to('activity-overlay').emit('activity-event', payload);
}

function gameLabel(gameId) {
  const g = String(gameId || '').toLowerCase();
  return GAME_LABELS[g] || (gameId || '').toString();
}

/**
 * Hook for game-win events. Called from chat-relay's socket.on('game-win')
 * after cosmetics enrichment has already happened. Skips per-word emits
 * (winType==='word') — those aren't real wins.
 */
function processGameWin(data) {
  if (!data || !data.game || !data.winner) return;
  if (data.winType === 'word') return;
  const isJackpot = data.jackpot && data.jackpot > 0;
  const value = isJackpot
    ? Number(data.jackpot)
    : (typeof data.points === 'number' ? data.points : null);
  const valueLabel = isJackpot ? 'coins' : (value != null ? 'pts' : null);
  broadcast({
    ts: Date.now(),
    game: String(data.game).toLowerCase(),
    gameName: data.gameName || gameLabel(data.game),
    eventType: isJackpot ? 'jackpot' : 'win',
    value,
    valueLabel,
    totalWins: typeof data.totalWins === 'number' ? data.totalWins : null,
    user: data.winner,
  });
}

/**
 * Hook for daily-win events.
 */
function processDailyWin(data) {
  if (!data || !data.game) return;
  // daily-win shape (chat-relay): { game, winner, displayName, platform, platformUserId, amount }
  const userObj = (data.winner && typeof data.winner === 'object')
    ? data.winner
    : { displayName: data.winner || data.displayName || 'Player', platform: data.platform || 'unknown', platformUserId: data.platformUserId || data.userId, profilePic: null };
  broadcast({
    ts: Date.now(),
    game: String(data.game).toLowerCase(),
    gameName: gameLabel(data.game),
    eventType: 'daily',
    value: typeof data.amount === 'number' ? data.amount : null,
    valueLabel: typeof data.amount === 'number' ? 'coins' : null,
    totalWins: null,
    user: userObj,
  });
}

/**
 * Hook for streak events synthesised by event-overlay.js. Called from the
 * same fan-out site that already broadcasts to event-overlay.
 *
 * @param {string} game
 * @param {string} eventName  e.g. 'streak_3'
 * @param {object} data       { user, count }
 */
function processStreak(game, eventName, data) {
  const tier = STREAK_TIERS[eventName];
  if (!tier) return;
  if (!data || !data.user) return;
  broadcast({
    ts: Date.now(),
    game: String(game).toLowerCase(),
    gameName: gameLabel(game),
    eventType: 'streak',
    value: typeof data.count === 'number' ? data.count : tier.count,
    valueLabel: tier.label,
    totalWins: null,
    user: data.user,
  });
}

module.exports = {
  init,
  processGameWin,
  processDailyWin,
  processStreak,
  _internal: { GAME_LABELS, gameLabel },
};
