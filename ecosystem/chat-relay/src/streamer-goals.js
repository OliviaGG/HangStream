/**
 * streamer-goals.js — Per-streamer overlay widgets (multi-instance).
 *
 * Each streamer has a list of widget instances. Any widget type can appear
 * multiple times — e.g. two milestone widgets (one for likes, one for gift
 * coins), three gift goal bars, etc. Each instance has a stable id and is
 * keyed independently in layout, order, and runtime state.
 *
 * Config shape (saved to data/streamer-goals.json):
 *   {
 *     widgets: [
 *       { id, type, name, enabled, ...type-specific settings, ...common cosmetics }
 *     ],
 *     layout: {
 *       portrait:  { [id]: { x, y, anchor } },
 *       landscape: { [id]: { x, y, anchor } },
 *     },
 *     widgetOrder: [id, id, ...]   // top = front (highest z-index)
 *   }
 *
 * State shape:
 *   {
 *     widgetState: {
 *       [id]: { current?, lastChangeAt?, milestoneCounter?, milestoneLastFireAt? }
 *     }
 *   }
 *
 * Migration: legacy single-widget configs (giftGoal/followGoal/... as direct
 * fields on config) are auto-migrated on first load into one instance each.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'streamer-goals.json');

let goalsByStreamer = {};
let io = null;
let getHandle = () => null;
// Like-for-Hint sink: server.js injects a fn(streamerId, payload) that routes
// a `reveal-hint` to the streamer's active game socket. Kept as an injected
// dependency so this module stays decoupled from appSockets / game routing.
let likeHintSink = null;
const ROOM = (streamerId) => `goals:${streamerId}`;

const _emitTimers = new Map();
const _pendingEmit = new Map();
const EMIT_THROTTLE_MS = 120;

const VALID_WIDGET_TYPES = ['animatedBg', 'giftGoal', 'followGoal', 'milestone', 'winCard', 'topLikers', 'gameEmbed', 'cameraEmbed', 'phoneCam', 'desktopStream', 'ailicia', 'chatFeed', 'donate', 'fanClubAd', 'campaignGift', 'adBanner', 'junkDrawer', 'likeHint', 'notifications', 'pookieTok', 'gameVote', 'gameVoteStatus', 'gridLite', 'musicCredits', 'spotifyDJ'];

// Widgets available on the regular /streamer dashboard. Everything else is
// reserved for /streamer/pro (owner-only).
const STREAMER_WIDGET_TYPES = [
  'gameEmbed', 'cameraEmbed', 'chatFeed', 'giftGoal', 'followGoal',
  'likeHint', 'winCard', 'topLikers', 'gameVote', 'gameVoteStatus'
];
const PRO_WIDGET_TYPES = VALID_WIDGET_TYPES.filter(t => !STREAMER_WIDGET_TYPES.includes(t));

function isStreamerWidgetType(type) { return STREAMER_WIDGET_TYPES.includes(type); }
function isProOnlyWidgetType(type) { return PRO_WIDGET_TYPES.includes(type); }

// Animated background presets — drawn behind game + widgets in the stream
// embed (not a widget itself; single global layer with per-game variants).
const VALID_BG_PRESETS = new Set([
  'none', 'gradient-pulse', 'ripples', 'particles', 'vertical-scroll', 'petri',
  'neon-frame', 'halloween',
  // canvas2D psy presets
  'psy-aurora', 'psy-lava', 'psy-phoenix', 'psy-solar', 'psy-tidal', 'psy-deep',
  'psy-vaporwave', 'psy-kaleidoscope', 'psy-chrome', 'psy-void', 'psy-supernova',
  // premium WebGL presets (shader-based, higher fidelity)
  'prem-liquid-mesh', 'prem-nebula', 'prem-aurora', 'prem-oil-slick',
  'prem-rain-glass', 'prem-cosmic-pulse', 'prem-particles',
  'prem-nebula-v2', 'prem-nebula-v3', 'prem-nebula-v4',
]);
const VALID_FOLLOW_SOURCES = new Set(['follow', 'like', 'share']);
const VALID_MILESTONE_SOURCES = new Set(['like', 'follow', 'share', 'giftCoins']);
const VALID_ANCHORS = new Set([
  'top-left', 'top-center', 'top-right',
  'center-left', 'center', 'center-right',
  'bottom-left', 'bottom-center', 'bottom-right',
]);
const VALID_COLORS = new Set(['cyan', 'pink', 'gold', 'green', 'red', 'purple']);
const VALID_STYLES = new Set(['glass', 'solid', 'outlined', 'banner']);
const VALID_PADDINGS = new Set(['compact', 'regular', 'spacious']);
const VALID_PERSISTENCE = new Set(['fade', 'until-next', 'manual']);
const VALID_WIN_SCOPES = new Set(['streamer', 'public', 'both']);
// What the Win Card's leaderboard rows count.
//   points  — this round's score from the game-win payload (original behavior)
//   session — running win count since the streamer last cleared it
//   saved   — long-running win count, cleared only from the dashboard
const VALID_WIN_LIST_MODES = new Set(['points', 'session', 'saved']);
const VALID_CAMERA_FACING = new Set(['user', 'environment']);
const VALID_CAMERA_FIT = new Set(['cover', 'contain']);
const VALID_CAMERA_BG = new Set(['black', 'transparent', 'glass']);
const VALID_CHAT_NEWEST_AT = new Set(['bottom', 'top']);
const VALID_CHAT_ALIGN = new Set(['left', 'center', 'right']);
const VALID_CHAT_AVATAR_SHAPES = new Set(['circle', 'rounded', 'square']);
const VALID_CHAT_ANIMATIONS = new Set(['slide', 'fade', 'pop', 'none']);
// The animated background is a plain backdrop: an animation preset, or a flat
// colour. It used to double as a positionable frosted-glass panel (surfaces
// 'glass' / 'animation-glass', plus a shape mask and six glass sliders); that
// was removed 2026-07-16 because it made the background's own controls
// incomprehensible and nothing used it. If a floating glass panel is ever
// wanted again it belongs in its own widget type, not in here.
const VALID_BG_SURFACES = new Set(['animation', 'solid']);
const VALID_FAN_CLUB_AD_VARIANTS = new Set([
  'neon', 'graffiti', 'hologram', 'electric', 'sticker',
  'vip', 'spray', 'glitch', 'liquid', 'compact',
]);
const VALID_FAN_CLUB_AD_FONTS = new Set(['impact', 'system', 'condensed', 'serif', 'mono', 'script']);
// Game Vote — how a game's "term" (its turn on stream) is measured before the
// next-game vote opens. 'rounds' counts real game wins; 'minutes' is wall clock.
const VALID_VOTE_TERM_UNITS = new Set(['rounds', 'minutes']);
// A rotation may hold the whole catalogue. Chat votes by typing the row number,
// and the ballot can show every challenger, so this doubles as the practical
// ceiling on ballot rows.
const MAX_VOTE_CANDIDATES = 16;

const MAX_WIDGETS_PER_STREAMER = 40;
const MAX_NAME_LEN = 64;
const MAX_LABEL_LEN = 80;
const DEFAULT_WIN_CARD_ID = 'winCard-default';
const DEFAULT_WIN_CARD_PORTRAIT_POS = { x: 49.83068395543982, y: 39.952379862467446, anchor: 'center' };
const DEFAULT_WIN_CARD_LANDSCAPE_POS = { x: 50, y: 50, anchor: 'center' };

// ── Defaults ────────────────────────────────────────────────────────
function _commonDefaults() {
  return {
    enabled: false,
    name: '',
    color: 'cyan',
    bgColor: '',
    textColor: '',
    style: 'glass',
    padding: 'regular',
    borderRadius: 16,
    scale: 100,
    textSize: 100,
    bgOpacity: 70,
    trim: { top: 0, right: 0, bottom: 0, left: 0 },
    // Border controls — '' / 'auto' / null sentinel means "use style default".
    borderWidth: 1,
    borderColor: '',
    borderStyle: 'solid',  // 'solid' | 'dashed' | 'dotted' | 'none'
  };
}

const VALID_BORDER_STYLES = new Set(['solid', 'dashed', 'dotted', 'none']);

function _typeDefaults(type) {
  const c = _commonDefaults();
  switch (type) {
    case 'giftGoal':
      return { ...c, color: 'cyan', label: 'Gift Goal', target: 1000, persist: false,
        showNumbers: true, showLabel: true, showPercent: false };
    case 'followGoal':
      return { ...c, color: 'pink', label: 'Follower Goal', source: 'follow', target: 100, persist: false,
        showNumbers: true, showLabel: true, showPercent: false };
    case 'milestone':
      return { ...c, color: 'gold', source: 'like', every: 100, label: '%count% LIKES!', soundUrl: '' };
    case 'likeHint':
      // Like-for-Hint: every `every` cumulative likes fires a hint into the
      // streamer's active game (v1 = Searchle reveals its best unguessed
      // word). Reuses the milestone-crossing counter. Renders as a persistent
      // progress bar (likes → next hint); the label titles that bar. On each
      // reveal it flashes the revealed word / masked letters over the bar.
      return { ...c, color: 'purple', source: 'like', every: 5000, label: '💡 NEXT HINT', soundUrl: '', burst: true };
    case 'winCard':
      return { ...c, color: 'gold', scope: 'streamer', durationMs: 9500, persistence: 'fade', topN: 10,
        scale: 170, textSize: 165, bgOpacity: 70,
        showAvatar: true, showRank: true, showStreak: true, showElo: true, showTitleFinder: true,
        displayGame: '', heroBadgeBg: false, heroBadgeOpacity: 0.55, outerPfpFrame: true,
        voiceAnnounce: false,
        announcerVoiceId: '',
        // 'points' keeps every existing overlay rendering exactly as before —
        // win tallies are opt-in per widget.
        listMode: 'points', listTitle: '' };
    case 'topLikers':
      return { ...c, color: 'cyan', bgOpacity: 60, rows: 5, title: 'TOP LIKERS',
        showAvatar: true, showLikes: true, highlightTop3: true };
    case 'gameEmbed':
      // widthPct/heightPct are % of the OBS canvas (1080×1920 portrait /
      // 1920×1080 landscape). Defaults fill the canvas so stream setup starts
      // as a plain game view.
      return { ...c, color: 'cyan', bgOpacity: 0, borderWidth: 0,
        widthPct: 100, heightPct: 100, style: 'glass', padding: 'compact',
        displayGame: '', chatPrefix: '',
        // Board glass — a frosted card the embedded game paints behind its own
        // board. The overlay posts these to the game iframe (never as URL
        // params: a src change reloads the game and would reset the board on
        // every slider drag). Defaults are 0/neutral so an untouched widget
        // renders exactly as it did before these controls existed — style
        // already defaults to 'glass' on EVERY gameEmbed, so a lit default
        // here would silently tint every existing streamer's game view.
        gameGlassTint: '#ffffff', gameGlassOpacity: 0, gameGlassBlur: 0,
        gameGlassSaturation: 100, gameGlassBrightness: 100, gameGlassEdge: 0 };
    case 'adBanner':
      // Ad rail — the /ad-vertical/<handle> per-streamer overlay (scrolling
      // logo + game name + live chip + win bursts; URLs and the QR card were
      // removed 2026-07-21, TikTok flags them). displayGame picks which game
      // is advertised ('auto' = follow the active stream game); orientation
      // flips the rail to a horizontal ticker. The page background is forced
      // transparent so the widget's own glass / background-color cosmetics
      // control the backdrop. widthPct/heightPct size the BOX — the overlay
      // scales the ad's 100px band to fill the box's short side.
      return { ...c, color: 'gold', bgOpacity: 0, borderWidth: 0,
        widthPct: 24, heightPct: 100, style: 'glass', padding: 'compact',
        displayGame: 'wordtycoon', orientation: 'vertical' };
    case 'junkDrawer':
      // Playable Junk Drawer game embed. Loads junkdrawer.html with the
      // streamer's handle so TikTok gifts (roses / galaxy) drive it live.
      return { ...c, color: 'gold', bgOpacity: 0, borderWidth: 0,
        widthPct: 50, heightPct: 100, style: 'glass', padding: 'compact' };
    case 'ailicia':
      // ai_licia hosted co-host avatar (getailicia.com browser source) embedded
      // as a positionable overlay widget. `url` is the streamer's avatar
      // browser-source URL. The character renders on a transparent background,
      // so it defaults to no frame (bgOpacity/border 0). widthPct/heightPct are
      // % of the OBS canvas; positioning uses the shared drag layout.
      return { ...c, color: 'cyan', bgOpacity: 0, borderWidth: 0,
        widthPct: 26, heightPct: 30, style: 'glass', padding: 'compact', url: '' };
    case 'animatedBg':
      // Decorative layer rendered behind the game and the other widgets.
      // Uses the same widget editor/storage model, but the overlay renders
      // it into the dedicated background layer so it never blocks gameplay.
      // One backdrop for every game. There is no per-game mode: the old
      // mode:'auto' resolved to a per-game entry whose default was a BLACK
      // preset:'none' for every game, so a streamer editing it while one game
      // was live silently configured only that game and saw nothing anywhere
      // else. `global` is now the single source of truth.
      return { ...c, enabled: true, color: 'cyan', bgOpacity: 0, borderWidth: 0,
        borderRadius: 24, style: 'glass', padding: 'compact', scale: 100,
        widthPct: 100, heightPct: 100,
        surface: 'animation',
        global: { ...DEFAULT_BG_FALLBACK } };
    case 'cameraEmbed':
      // Camera widget renders a live device-camera preview inside the same
      // overlay runtime as the other widgets. Width/height are % of the OBS
      // canvas and apply uniformly across games; positioning still uses the
      // shared layout system so streamers can drag it where they want.
      return { ...c, color: 'cyan', bgOpacity: 25, borderWidth: 2,
        borderStyle: 'solid', borderRadius: 24,
        widthPct: 32, heightPct: 22, style: 'glass', padding: 'compact',
        cameraFacing: 'user', cameraFit: 'cover', cameraBg: 'black',
        mirror: true, keyBlackBg: false, keyThreshold: 18, keySoftness: 18,
        cameraGlassTint: '#ffffff', cameraGlassOpacity: 8, cameraGlassBlur: 18,
        cameraGlassSaturation: 185, cameraGlassBrightness: 100, cameraGlassEdge: 45 };
    case 'phoneCam':
      // Phone camera streamed to render1 over Tailscale (SRT -> MediaMTX ->
      // WHEP) and pulled into the overlay as a MediaStream. Shares the whole
      // cameraEmbed presentation pipeline (chroma key, glass, fit, mirror), so
      // the only real difference is where the stream comes from — see
      // ensurePhoneCamStream() in goals-overlay.html.
      //
      // mirror defaults OFF: the phone encoder sends what the lens sees, and
      // flipping it makes any text in frame read backwards. cameraFacing is
      // deliberately absent — the phone app picks the lens, not us.
      return { ...c, color: 'cyan', bgOpacity: 25, borderWidth: 2,
        borderStyle: 'solid', borderRadius: 24,
        widthPct: 32, heightPct: 22, style: 'glass', padding: 'compact',
        cameraFit: 'cover', cameraBg: 'black',
        mirror: false, muted: false,
        keyBlackBg: false, keyThreshold: 18, keySoftness: 18,
        cameraGlassTint: '#ffffff', cameraGlassOpacity: 8, cameraGlassBlur: 18,
        cameraGlassSaturation: 185, cameraGlassBrightness: 100, cameraGlassEdge: 45 };
    case 'desktopStream':
      // Windows OBS desktop feed embedded as an iframe. The dashboard preview
      // shows a placeholder; the real feed renders on the overlay via
      // /streamer/desktop-feed.html.
      return { ...c, color: 'cyan', bgOpacity: 0, borderWidth: 0,
        borderStyle: 'solid', borderRadius: 16,
        widthPct: 48, heightPct: 27, style: 'glass', padding: 'compact',
        cameraFit: 'contain', muted: true };
    case 'chatFeed':
      // Stream-scoped chat feed for the composed stream view. Width/height
      // are % of the OBS canvas; messages arrive over the same goals room
      // the overlay already joins, so it stays scoped to this streamer.
      return { ...c, color: 'cyan', bgOpacity: 62, borderWidth: 1,
        borderRadius: 18, style: 'glass', padding: 'regular',
        widthPct: 48, heightPct: 30, maxMessages: 8, messageLifetimeSec: 45,
        showAvatar: true, showName: true, showBadges: true, showPlatform: false,
        showTimestamp: false, compact: false, newestAt: 'bottom',
        textAlign: 'left', avatarShape: 'circle', animation: 'slide',
        // Display-only filter: when set, the widget shows ONLY chat starting
        // with this symbol. Purely cosmetic — it does not affect chat routing
        // into games (that's gameEmbed.chatPrefix) or TTS (ttsPrefix).
        filterPrefix: '', keepFilterPrefix: false };
    case 'donate':
      // Static promo pill — shows a heart + label + bare-domain donate URL.
      // Defaults to jorry.live to advertise the platform; streamers can
      // change the URL to their own donation/tip link if they want.
      return { ...c, color: 'gold', label: 'Donate @', url: 'https://jorry.live' };
    case 'fanClubAd':
      // Animated lower-third / callout based on the Join the Fan Club mockups.
      // Kept mostly self-contained because the arrow art has its own color
      // palette and dimensional controls.
      return { ...c, color: 'cyan', bgOpacity: 0, borderWidth: 0,
        style: 'glass', padding: 'compact', borderRadius: 0,
        variant: 'neon', headline: 'JOIN', label: 'JOIN THE FAN CLUB',
        fontFamily: 'impact', arrowWidthPct: 100, arrowHeightPx: 240,
        bannerHeightPx: 86, arrowStrokePx: 12, headlineSize: 100, labelSize: 100,
        cycleEnabled: false, showEverySec: 120, showDurationSec: 20,
        primaryColor: '#33f3ff', secondaryColor: '#ff3f7f',
        accentColor: '#9a7cff', fillColor: '#020308' };
    case 'campaignGift':
      // Campaign Gift promo card — mirrors TikTok's "Campaign Gift" panel:
      // blue header, up to two 1-coin gift tiles (Press Start / Heart Me
      // art from public/streamer/img/), CTA pill. Animated in the overlay
      // and can burst when the matching gift actually arrives.
      return { ...c, color: 'cyan', bgOpacity: 0, borderWidth: 0,
        style: 'glass', padding: 'compact', borderRadius: 0,
        title: 'Campaign Gift', ctaText: 'Send one — just 1 coin!',
        gift1Name: 'Press Start', gift1Img: '/streamer/img/press-start.png', gift1Coins: 1,
        gift2Name: 'Heart Me', gift2Img: '/streamer/img/heart-me.png', gift2Coins: 1,
        showGift2: true, reactToGifts: true, headerColor: '#22b0f4',
        cycleEnabled: false, showEverySec: 120, showDurationSec: 20 };
    case 'notifications':
      // Notification popups host — surfaces the balances-owing "pay up" alert
      // and the batch-guessing "Donor perk" alert (both fired over the goals
      // room the overlay already joins). The widget itself is a transparent
      // positioning anchor; each alert pops centered on it, shakes, and
      // auto-dismisses. Off by default — added from the palette. showOwing /
      // showBatch let a streamer mute one of the two alerts.
      return { ...c, color: 'red', bgOpacity: 0, borderWidth: 0,
        style: 'outlined', padding: 'compact', borderRadius: 0,
        showOwing: true, showBatch: true,
        showDurationSec: 8, cooldownSec: 0 };
    case 'pookieTok':
      // Paid viewer messages ("Pookie Tok") host — a transparent positioning
      // anchor. Each paid message pops in stacked on it, styled by its tier,
      // and auto-vanishes after the tier's duration. Off by default — added
      // from the palette. If no pookieTok widget is enabled, the overlay falls
      // back to a fixed top-center popup so a paid message is never lost.
      return { ...c, color: 'pink', bgOpacity: 0, borderWidth: 0,
        style: 'outlined', padding: 'compact', borderRadius: 0 };
    case 'gameVote':
      // "What do we play next?" — chat votes by typing a candidate's number.
      // `candidates` is the rotation: each entry is a game plus the term it
      // gets when it's the active game (5 rounds, 30 minutes, …). When the
      // active game's term runs out the ballot is built from the OTHER
      // candidates (least-recently-played first), chat votes for `voteDurationSec`,
      // the winner is shown for `graceSec`, then the game switches.
      //
      // This widget is the RULES holder for the whole system and renders ONLY
      // while a vote is running. The between-votes turn readout lives in the
      // separate 'gameVoteStatus' widget so the two can be positioned apart.
      // Off by default — added from the palette.
      return { ...c, color: 'purple', style: 'glass', padding: 'regular',
        title: 'VOTE NEXT GAME',
        // Pinned line above the title. Blank hides it.
        learnText: 'Learn to Play at WordTycoon.Live/Rules',
        candidates: [],
        ballotSize: 3,
        autoStart: true,
        voteDurationSec: 60,
        graceSec: 20,
        autoSwitch: true,
        // Adds a final "keep playing <current game>" row to every ballot. If it
        // wins, nothing switches and the current game's term restarts.
        allowKeepPlaying: true,
        showLogos: true,
        showCounts: true };
    case 'gameVoteStatus':
      // The turn readout: which game is up and how much of its turn is left
      // ("Subtextle · round 1 of 2"). Display-only — it renders whatever the
      // gameVote widget's rules produce, and shows nothing without one.
      // Separate widget so it can sit somewhere else on the overlay entirely.
      return { ...c, color: 'cyan', style: 'glass', padding: 'compact',
        layout: 'pill',
        label: '',
        showLogo: false,
        showBar: true,
        showGameName: true,
        hideWhileVoting: false };
    case 'gridLite':
      // Subtextle grid, stripped to just the closest words. Renders the
      // standalone /gridlite.html page (hand-written, no Vite bundle and
      // no three.js) in an iframe, scoped to this streamer's private
      // round via ?session=<handle>. Deliberately NOT the full game embed:
      // that pulls a 712KB three.js chunk to draw the same words.
      return { ...c, color: 'purple', style: 'glass', padding: 'compact',
        // How many of the closest words to show. 7 lays out as 1/3/3 — a
        // hero word over two rows of three; the page accepts 1–12.
        wordCount: 7,
        // Show each word's guesser avatar on its chip.
        showPfp: true,
        // Board zoom, independent of widget box size.
        scale: 1,
        widthPct: 34,
        heightPct: 26 };
    case 'musicCredits':
      // Music attribution overlay — embeds /streamer/music-credits.html in an
      // iframe. The widget box sizes the iframe; the page handles its own
      // internal card layout. Free-tier Pretzel + Incompetech + StreamBeats.
      return { ...c, color: 'cyan', bgOpacity: 0, borderWidth: 0,
        style: 'glass', padding: 'compact', borderRadius: 0,
        widthPct: 34, heightPct: 18,
        showPretzel: true, showIncompetech: true, showStreamBeats: true,
        genres: 'Lofi,EDM,Gaming,Retro', overlayStyle: 'card', position: 'bottom-left',
        message: '',
        // Manual "now playing" metadata (for sources like Pretzel that don't
        // expose a track API). When autoNowPlaying is true, the current playlist
        // track overrides this text.
        nowPlaying: '',
        nowPlayingSource: 'pretzel',
        autoNowPlaying: false,
        playlist: [],
        shuffle: false,
        repeat: 'all' };
    case 'spotifyDJ':
      // Album-art-driven Spotify request card. Playback data is emitted from
      // spotify-requests.js into the streamer's goals room; this config only
      // controls presentation so the same widget can support per-streamer
      // Spotify accounts later without a schema change.
      return { ...c, color: 'purple', bgOpacity: 0, borderWidth: 0,
        style: 'glass', padding: 'compact', borderRadius: 0,
        widthPct: 50, heightPct: 22, titleMaxChars: 42,
        showAlbumArt: true, showRequester: true, showQueue: true,
        showCommands: true, showTiers: true };
    default:
      return c;
  }
}

function _defaultWinCardWidget() {
  return {
    ..._typeDefaults('winCard'),
    id: DEFAULT_WIN_CARD_ID,
    type: 'winCard',
    name: 'Win Card',
    enabled: true,
  };
}

function _displayNameFor(type) {
  return ({
    giftGoal: 'Gift Goal',
    followGoal: 'Follower Goal',
    milestone: 'Milestone Burst',
    likeHint: 'Like Hint',
    winCard: 'Win Card',
    topLikers: 'Top Likers',
    gameEmbed: 'Game Embed',
    animatedBg: 'Animated Background',
    cameraEmbed: 'Camera',
    phoneCam: 'Phone Cam',
    desktopStream: 'Desktop Stream',
    ailicia: 'ai_licia',
    chatFeed: 'Chat',
    donate: 'Donate Link',
    fanClubAd: 'Fan Club Ad',
    campaignGift: 'Campaign Gift Ad',
    adBanner: 'Ad Banner',
    junkDrawer: 'Junk Drawer',
    notifications: 'Notifications',
    pookieTok: 'Pookie Tok',
    gameVote: 'Game Vote',
    gameVoteStatus: 'Game Vote Status',
    gridLite: 'Grid Lite',
    musicCredits: 'Music Credits',
    spotifyDJ: 'Spotify DJ',
  })[type] || type;
}

function _defaultLayoutFor(type, mode) {
  const map = {
    portrait: {
      giftGoal:   { x: 50, y: 90, anchor: 'bottom-center' },
      followGoal: { x: 50, y: 80, anchor: 'bottom-center' },
      milestone:  { x: 50, y: 50, anchor: 'center' },
      likeHint:   { x: 50, y: 42, anchor: 'center' },
      winCard:    { ...DEFAULT_WIN_CARD_PORTRAIT_POS },
      topLikers:  { x: 5,  y: 5,  anchor: 'top-left' },
      gameEmbed:  { x: 50, y: 50, anchor: 'center' },
      animatedBg: { x: 50, y: 50, anchor: 'center' },
      cameraEmbed:{ x: 95, y: 6,  anchor: 'top-right' },
      phoneCam:   { x: 95, y: 30, anchor: 'top-right' },
      desktopStream:{ x: 95, y: 55, anchor: 'top-right' },
      ailicia:    { x: 74, y: 78, anchor: 'center' },
      chatFeed:   { x: 5,  y: 95, anchor: 'bottom-left' },
      donate:     { x: 50, y: 8,  anchor: 'top-center' },
      fanClubAd:   { x: 50, y: 90, anchor: 'bottom-center' },
      campaignGift: { x: 50, y: 74, anchor: 'bottom-center' },
      adBanner:   { x: 100, y: 50, anchor: 'center-right' },
      junkDrawer: { x: 50, y: 50, anchor: 'center' },
      notifications: { x: 50, y: 18, anchor: 'top-center' },
      pookieTok: { x: 50, y: 12, anchor: 'top-center' },
      gameVote: { x: 50, y: 66, anchor: 'center' },
      // Sits above the ballot by default so the two don't overlap on a fresh add.
      gameVoteStatus: { x: 50, y: 12, anchor: 'top-center' },
      gridLite: { x: 50, y: 30, anchor: 'top-center' },
      musicCredits: { x: 5, y: 95, anchor: 'bottom-left' },
      spotifyDJ: { x: 50, y: 96, anchor: 'bottom-center' },
    },
    landscape: {
      giftGoal:   { x: 95, y: 95, anchor: 'bottom-right' },
      followGoal: { x: 95, y: 85, anchor: 'bottom-right' },
      milestone:  { x: 50, y: 50, anchor: 'center' },
      likeHint:   { x: 50, y: 42, anchor: 'center' },
      winCard:    { ...DEFAULT_WIN_CARD_LANDSCAPE_POS },
      topLikers:  { x: 2,  y: 5,  anchor: 'top-left' },
      donate:     { x: 50, y: 5,  anchor: 'top-center' },
      fanClubAd:   { x: 50, y: 92, anchor: 'bottom-center' },
      campaignGift: { x: 97, y: 72, anchor: 'bottom-right' },
      gameEmbed:  { x: 50, y: 50, anchor: 'center' },
      animatedBg: { x: 50, y: 50, anchor: 'center' },
      cameraEmbed:{ x: 96, y: 6,  anchor: 'top-right' },
      phoneCam:   { x: 96, y: 32, anchor: 'top-right' },
      desktopStream:{ x: 96, y: 55, anchor: 'top-right' },
      ailicia:    { x: 88, y: 74, anchor: 'center' },
      chatFeed:   { x: 2,  y: 95, anchor: 'bottom-left' },
      adBanner:   { x: 100, y: 50, anchor: 'center-right' },
      junkDrawer: { x: 50, y: 50, anchor: 'center' },
      notifications: { x: 50, y: 12, anchor: 'top-center' },
      pookieTok: { x: 50, y: 10, anchor: 'top-center' },
      gameVote: { x: 82, y: 50, anchor: 'center' },
      gameVoteStatus: { x: 82, y: 14, anchor: 'top-center' },
      gridLite: { x: 16, y: 30, anchor: 'top-center' },
      musicCredits: { x: 2, y: 95, anchor: 'bottom-left' },
      spotifyDJ: { x: 50, y: 96, anchor: 'bottom-center' },
    },
  };
  return map[mode]?.[type] || { x: 50, y: 50, anchor: 'center' };
}

function _newInstanceId(type) {
  return type + '-' + crypto.randomBytes(4).toString('hex');
}

// New streamer setups start as a plain full-canvas game feed on black.
// Streamers can still opt into animated backgrounds later from the dashboard.
const STREAMER_GAME_IDS = [
  'searchle',
  'searchle-grid',
  'searchle-numbers',
  'wikisearchle',
  'rectangled',
  'erectangled',
  'sproutle',
  'wikirectangled',
  'wikiword',
  'word500',
  'colour500',
  'spellingbee',
  'pixeletters',
  'wordle',
  'betwixt',
  'figural',
  'synapse',
  'letterworks',
  'wordfall',
];

function _blackBgEntry() {
  return {
    preset: 'none',
    primaryColor: '#000000',
    secondaryColor: '#000000',
    colorMode: 'duo',
    colors: ['#000000', '#000000'],
    speed: 1,
    intensity: 1,
    showGameName: false,
    x: 50,
    y: 50,
    scale: 100,
    widthPct: 100,
    heightPct: 100,
    surface: 'animation',
  };
}

const DEFAULT_BG_FALLBACK = _blackBgEntry();
const DEFAULT_BG_PER_GAME = Object.fromEntries(
  STREAMER_GAME_IDS.map((id) => [id, _blackBgEntry()])
);

// Per-game game-embed position overrides shared across all streamers.
// New and reset streamer configs only seed the game widget; these values keep
// each game's stream view framed to the right part of the source page.
// WikiContexto (game id `wikisearchle`). Locked in from the live broadcast
// setup — the board sits low and blown up so the article column fills the
// portrait frame. No widthPct/heightPct: the widget's own size applies.
const WIKISEARCHLE_DEFAULT_EMBED_LAYOUT = {
  x: 52.02,
  y: 50.99,
  scale: 100.46,
};
const WIKISEARCHLE_LEGACY_CLIPPED_EMBED_LAYOUT = {
  x: 50,
  y: 69.76,
  scale: 140,
};
// erecTangled, locked in from the live broadcast setup. Shared by BOTH the
// `sproutle` and `erectangled` rows below — `sproutle` is the id the live
// path actually resolves to, so the two must never drift apart. See the
// comment on those rows.
const ERECTANGLED_DEFAULT_EMBED_LAYOUT = {
  x: 51.5,
  y: 100,
  widthPct: 64.57,
  scale: 200,
};
// NOTE: there used to be a RecTangled legacy-layout migration here that
// rewrote a matching saved entry's y to whatever the rectangled default's y
// happened to be. It was removed when rectangled's default was locked in from
// the live setup: it replaced ONLY y, so a streamer sitting on the old default
// would have been rewritten to {x:50, y:<new>, scale:125} — neither their old
// position nor the new default, just a mangled hybrid. A locked-in default has
// to stay put, so nothing rewrites saved rectangled entries any more.

function _nearLayoutValue(value, target) {
  return Math.abs(Number(value) - target) < 0.01;
}

function _isLegacyWikiSearchleEmbedLayout(entry) {
  if (!entry || typeof entry !== 'object') return false;
  return _nearLayoutValue(entry.x, WIKISEARCHLE_LEGACY_CLIPPED_EMBED_LAYOUT.x)
    && _nearLayoutValue(entry.y, WIKISEARCHLE_LEGACY_CLIPPED_EMBED_LAYOUT.y)
    && _nearLayoutValue(entry.scale, WIKISEARCHLE_LEGACY_CLIPPED_EMBED_LAYOUT.scale)
    && (!entry.anchor || entry.anchor === 'center')
    && !Number.isFinite(Number(entry.widthPct))
    && !Number.isFinite(Number(entry.heightPct))
    && !entry.viewportMode;
}

const DEFAULT_GAME_EMBED_LAYOUT_OVERRIDES = {
  // Subtextle (game id `searchle`) — locked in from the live broadcast setup.
  // Distinct from the grid/numbers shells below, which use their own board.
  searchle: { x: 50, y: 35.37, scale: 70.77 },
  'searchle-grid': { x: 50.17, y: 49.48 },
  'searchle-numbers': { x: 50.17, y: 49.48 },
  // WiKirecTangled — locked in from the live broadcast setup. heightPct is
  // held at 100 so the board fills the frame regardless of what the streamer
  // set on the widget itself.
  wikirectangled: { x: 50, y: 49.71, heightPct: 100 },
  wikiword: { x: 50, y: 49.71, heightPct: 100 },
  wikisearchle: { ...WIKISEARCHLE_DEFAULT_EMBED_LAYOUT },
  wordle: { x: 49.99, y: 44.40, scale: 200 },
  // RecTangled — locked in from the live broadcast setup. No viewportMode:
  // this framing was tuned under the game's global 'canvas-native' default,
  // and pinning 'fixed-720' (as this row used to) would re-lay-out the page
  // underneath the coordinates. Nothing rewrites saved rectangled entries —
  // the old y-only legacy migration was removed with this change.
  rectangled: { x: 51.9, y: 90, widthPct: 52.34, scale: 180.51 },
  // erecTangled — locked in from the live broadcast setup.
  //
  // 🔴 THE LIVE KEY FOR erecTangled IS `sproutle`, NOT `erectangled`.
  // /api/streamer-public/:id/stream-game reports gameId:'sproutle' while
  // erecTangled is the active game (it is served by the sproutle app), and
  // that id is what the overlay stores in currentActiveGameId — so every
  // per-game layout lookup, saved entries and these defaults alike, resolves
  // through `sproutle`. The `erectangled` row below is never read on the live
  // path; it is kept only as an alias so anything reaching for the canonical
  // id gets the same framing. Retune BOTH or erecTangled silently keeps the
  // old numbers. No viewportMode: tuned under the global 'canvas-native'.
  erectangled: { ...ERECTANGLED_DEFAULT_EMBED_LAYOUT },
  sproutle: { ...ERECTANGLED_DEFAULT_EMBED_LAYOUT },
  // Betwixt — locked in from the live broadcast setup. viewportMode dropped
  // for the same reason as pixeletters: tuned under the global 'canvas-native'
  // default, so pinning 'fixed-720' would re-lay-out the page under the
  // position and break the framing.
  betwixt: { x: 50, y: 32.22, widthPct: 44.42, heightPct: 28.15, scale: 200 },
  // PixeLetters — locked in from the live broadcast setup. No viewportMode:
  // this framing was tuned under the global 'canvas-native' default for the
  // game, and pinning 'fixed-720' here (as it used to) would re-lay-out the
  // page underneath the position and throw the framing off.
  pixeletters: { x: 50, y: 34.8, widthPct: 35.64, heightPct: 36.15, scale: 200 },
  word500: { x: 49.68, y: 49.35 },
  // Color 500's OBS view is board-only, so the frame is shortened and pushed
  // up to sit the board in the top half. Locked in from the live setup.
  colour500: { x: 50, y: 29.78, heightPct: 60.18 },
  // Figural — locked in from the live broadcast setup.
  figural: { x: 50, y: 31.93, widthPct: 50.23, heightPct: 36.28, scale: 184.86 },
};

function _gameEmbedLayoutFor(gameId) {
  const portrait = {
    x: 50,
    y: 50,
    anchor: 'center',
    ...(DEFAULT_GAME_EMBED_LAYOUT_OVERRIDES[gameId] || {}),
  };
  // Game widget only. The win card used to carry a per-game entry here as well
  // — the same position repeated for all 16 games — which meant the overlay's
  // per-game lookup beat the streamer's own universal position for it. Per-game
  // layout slots are the game widget's alone; the win card's default position
  // is seeded into the universal layout by _withDefaultWinCardConfig instead.
  return {
    portrait: {
      'gameEmbed-default': portrait,
    },
    landscape: {
      'gameEmbed-default': { x: 50, y: 50, anchor: 'center' },
    },
  };
}

const DEFAULT_GAME_LAYOUTS = Object.fromEntries(
  STREAMER_GAME_IDS.map((id) => [id, _gameEmbedLayoutFor(id)])
);

function _defaultConfig() {
  return {
    widgets: [
      {
        id: 'gameEmbed-default', type: 'gameEmbed', name: 'Game',
        enabled: true, color: 'cyan', bgColor: '', textColor: '',
        style: 'glass', padding: 'compact', borderRadius: 0,
        scale: 100, textSize: 50, bgOpacity: 0,
        borderWidth: 0, borderColor: '', borderStyle: 'none',
        widthPct: 100, heightPct: 100,
      },
      _defaultWinCardWidget(),
    ],
    layout: {
      portrait: {
        'gameEmbed-default': { x: 50, y: 50, anchor: 'center' },
        [DEFAULT_WIN_CARD_ID]: { ...DEFAULT_WIN_CARD_PORTRAIT_POS },
      },
      landscape: {
        'gameEmbed-default': { x: 50, y: 50, anchor: 'center' },
        [DEFAULT_WIN_CARD_ID]: { ...DEFAULT_WIN_CARD_LANDSCAPE_POS },
      },
    },
    widgetOrder: [DEFAULT_WIN_CARD_ID, 'gameEmbed-default'],
    gameLayouts: JSON.parse(JSON.stringify(DEFAULT_GAME_LAYOUTS)),
    background: {
      enabled: false,
      mode: 'auto',
      global: _blackBgEntry(),
      perGame: {},
    },
    backgroundWidgetMigrated: true,
  };
}

function _defaultState() { return { widgetState: {} }; }

// ── Validation helpers ──────────────────────────────────────────────
function _clampInt(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
}
// Float variant for visual sliders (sizes, scales, opacities, speeds) —
// preserves up to 2 decimal places so the dashboard's fine-grained 0.01
// slider steps survive the save round-trip. Counts and durations stay
// on _clampInt.
function _clampNum(v, min, max, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.round(n * 100) / 100));
}
function _clampPct(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(0, Math.min(100, n));
}
// Widget POSITION percentages get a wider range than other pct fields:
// x/y locate the anchor point, so pushing a widget fully off-canvas on any
// side legitimately needs values below 0 / above 100. Matches the drag
// clamp in goals-overlay.html.
function _clampPosPct(v, fallback) {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(-100, Math.min(200, n));
}
function _validateHexColor(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s)) return '';
  return s;
}
// Same-origin absolute asset path (e.g. /streamer/img/press-start.png).
// Rejects protocol-relative + external URLs and path traversal.
function _validateAssetPath(p) {
  const s = String(p || '').trim();
  if (!s || s.length > 200) return '';
  if (!/^\/[A-Za-z0-9_/.-]+$/.test(s)) return '';
  if (s.startsWith('//') || s.includes('..')) return '';
  return s;
}
function _validateSoundUrl(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (s.length > 2048) return '';
  if (!/^(https?:\/\/|\/)/.test(s)) return '';
  return s;
}
function _validateTrim(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const side = (key) => {
    const n = Number(src[key]);
    return Number.isFinite(n) ? Math.max(0, Math.min(95, Math.round(n * 100) / 100)) : 0;
  };
  const out = {
    top: side('top'),
    right: side('right'),
    bottom: side('bottom'),
    left: side('left'),
  };
  const fitPair = (a, b) => {
    const sum = out[a] + out[b];
    if (sum <= 95) return;
    const ratio = 95 / sum;
    out[a] = Math.round(out[a] * ratio * 10) / 10;
    out[b] = Math.round(out[b] * ratio * 10) / 10;
  };
  fitPair('top', 'bottom');
  fitPair('left', 'right');
  return out;
}

function _validateInstance(raw) {
  const type = VALID_WIDGET_TYPES.includes(raw?.type) ? raw.type : 'giftGoal';
  const defaults = _typeDefaults(type);
  const w = { ...defaults, ...(raw || {}), type };

  const out = {};
  out.id = String(w.id || '').trim().slice(0, 64) || _newInstanceId(type);
  out.type = type;
  out.name = String(w.name || _displayNameFor(type)).slice(0, MAX_NAME_LEN) || _displayNameFor(type);
  out.enabled = !!w.enabled;

  // Common cosmetics
  out.color = VALID_COLORS.has(w.color) ? w.color : defaults.color;
  out.bgColor = _validateHexColor(w.bgColor);
  out.textColor = _validateHexColor(w.textColor);
  out.style = VALID_STYLES.has(w.style) ? w.style : defaults.style;
  out.padding = VALID_PADDINGS.has(w.padding) ? w.padding : defaults.padding;
  out.borderRadius = _clampNum(w.borderRadius, 0, 40, defaults.borderRadius);
  // Donate widgets get a higher scale ceiling — they're a static promo
  // pill streamers want to size large enough to read across a stream.
  const _scaleMax = (type === 'donate' || type === 'fanClubAd' || type === 'campaignGift') ? 500 : 200;
  out.scale = _clampNum(w.scale, 50, _scaleMax, defaults.scale);
  out.textSize = _clampNum(w.textSize, 50, _scaleMax, defaults.textSize);
  out.bgOpacity = _clampNum(w.bgOpacity, 0, 100, defaults.bgOpacity);
  out.trim = _validateTrim(w.trim);
  out.borderWidth = _clampNum(w.borderWidth, 0, 8, defaults.borderWidth);
  out.borderColor = _validateHexColor(w.borderColor);
  out.borderStyle = VALID_BORDER_STYLES.has(w.borderStyle) ? w.borderStyle : defaults.borderStyle;

  // Type-specific
  switch (type) {
    case 'giftGoal':
      out.label = String(w.label || defaults.label).slice(0, MAX_LABEL_LEN) || defaults.label;
      out.target = _clampInt(w.target, 1, 10_000_000, defaults.target);
      out.persist = !!w.persist;
      out.showNumbers = w.showNumbers !== false;
      out.showLabel = w.showLabel !== false;
      out.showPercent = !!w.showPercent;
      break;
    case 'followGoal':
      out.label = String(w.label || defaults.label).slice(0, MAX_LABEL_LEN) || defaults.label;
      out.source = VALID_FOLLOW_SOURCES.has(w.source) ? w.source : defaults.source;
      out.target = _clampInt(w.target, 1, 10_000_000, defaults.target);
      out.persist = !!w.persist;
      out.showNumbers = w.showNumbers !== false;
      out.showLabel = w.showLabel !== false;
      out.showPercent = !!w.showPercent;
      break;
    case 'milestone':
      out.source = VALID_MILESTONE_SOURCES.has(w.source) ? w.source : defaults.source;
      out.every = _clampInt(w.every, 1, 1_000_000, defaults.every);
      out.label = String(w.label || defaults.label).slice(0, MAX_LABEL_LEN) || defaults.label;
      out.soundUrl = _validateSoundUrl(w.soundUrl);
      break;
    case 'likeHint':
      // Only 'like' is wired as a hint source today, but keep it validated
      // against the milestone source set so future sources (gift coins etc.)
      // slot in without a schema change.
      out.source = VALID_MILESTONE_SOURCES.has(w.source) ? w.source : 'like';
      // Floor at 100 so a fat-fingered tiny threshold can't machine-gun
      // hints and trivialize every round.
      out.every = _clampInt(w.every, 100, 10_000_000, defaults.every);
      out.label = String(w.label || defaults.label).slice(0, MAX_LABEL_LEN) || defaults.label;
      out.soundUrl = _validateSoundUrl(w.soundUrl);
      out.burst = w.burst !== false;
      break;
    case 'winCard':
      out.scope = VALID_WIN_SCOPES.has(w.scope) ? w.scope : defaults.scope;
      {
        const displayGame = String(w.displayGame || '').trim().toLowerCase();
        out.displayGame = /^[a-z0-9_-]{1,32}$/.test(displayGame) ? displayGame : '';
      }
      out.durationMs = _clampInt(w.durationMs, 1000, 10000, defaults.durationMs);
      out.persistence = VALID_PERSISTENCE.has(w.persistence) ? w.persistence : defaults.persistence;
      out.topN = _clampInt(w.topN, 1, 10, defaults.topN);
      // listMode picks what the rows under the winner count. 'session' and
      // 'saved' read the streamer's win tallies (src/win-tallies.js) instead
      // of the round's topPlayers. listTitle overrides the caption above the
      // rows; empty = the mode's own default caption.
      out.listMode = VALID_WIN_LIST_MODES.has(w.listMode) ? w.listMode : defaults.listMode;
      out.listTitle = String(w.listTitle || '').slice(0, 32);
      out.showAvatar = w.showAvatar !== false;
      out.showRank = w.showRank !== false;
      out.showStreak = w.showStreak !== false;
      out.showElo = w.showElo !== false;
      out.showTitleFinder = w.showTitleFinder !== false;
      // ── Cosmetic-layer toggles ──
      // heroBadgeBg: render winner's hero_badge as the card background
      //              (default OFF — opt-in because it's visually heavy).
      // heroBadgeOpacity: 0.10..1.00 of how strong that layer paints.
      // outerPfpFrame: pfp_border + pfp_glow wrap the entire popup
      //                (default ON — distinctive but non-intrusive).
      out.heroBadgeBg = !!w.heroBadgeBg;
      {
        const n = Number(w.heroBadgeOpacity);
        out.heroBadgeOpacity = Number.isFinite(n) ? Math.max(0.10, Math.min(1.00, n)) : 0.55;
      }
      out.outerPfpFrame = w.outerPfpFrame !== false;
      // voiceAnnounce: speak an ElevenLabs congratulation over the card on
      // streamer wins (default OFF — opt-in, plays audio). Gated to Donor
      // Class+ at announcement time; the id itself is validated then too.
      out.voiceAnnounce = !!w.voiceAnnounce;
      {
        const id = String(w.announcerVoiceId || '').trim();
        out.announcerVoiceId = /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : '';
      }
      break;
    case 'topLikers':
      out.rows = _clampInt(w.rows, 1, 10, defaults.rows);
      out.title = String(w.title || defaults.title).slice(0, 32) || defaults.title;
      out.showAvatar = w.showAvatar !== false;
      out.showLikes = w.showLikes !== false;
      out.highlightTop3 = w.highlightTop3 !== false;
      break;
    case 'gameEmbed':
      out.widthPct = _clampNum(w.widthPct, 10, 100, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 10, 100, defaults.heightPct);
      {
        const displayGame = String(w.displayGame || '').trim().toLowerCase();
        out.displayGame = /^[a-z0-9_-]{1,32}$/.test(displayGame) ? displayGame : '';
      }
      out.chatPrefix = String(w.chatPrefix || '').trim().slice(0, 8);
      // Searchle alt-mode: 'grid' switches the iframe URL to ?mode=grid
      // (chip-grid view). Empty string = regular view. Other values are
      // coerced to empty so unknown modes don't propagate.
      out.searchleMode = (w.searchleMode === 'grid') ? 'grid' : '';
      // Grid-mode row cap. Reaches chat-relay's URL builder AND the
      // overlay's ?mode=grid append path. Only carried if explicitly set
      // (default 15 applied at consume sites, not stored).
      if (Number.isFinite(Number(w.gridRows))) {
        out.gridRows = _clampInt(w.gridRows, 3, 25, 15);
      }
      // Board glass. Ranges match the sliders in public/streamer/index.html —
      // keep them in step or the slider snaps back on save. Saturation and
      // brightness are allowed a wider range than the camera widget's because
      // they act on the tint COLOUR here (there is no backdrop to filter), so
      // 0% saturation = a neutral grey glass is a legitimate choice.
      out.gameGlassTint = _validateHexColor(w.gameGlassTint) || defaults.gameGlassTint;
      out.gameGlassOpacity = _clampNum(w.gameGlassOpacity, 0, 100, defaults.gameGlassOpacity);
      out.gameGlassBlur = _clampNum(w.gameGlassBlur, 0, 100, defaults.gameGlassBlur);
      out.gameGlassSaturation = _clampNum(w.gameGlassSaturation, 0, 300, defaults.gameGlassSaturation);
      out.gameGlassBrightness = _clampNum(w.gameGlassBrightness, 40, 200, defaults.gameGlassBrightness);
      out.gameGlassEdge = _clampNum(w.gameGlassEdge, 0, 100, defaults.gameGlassEdge);
      break;
    case 'adBanner':
      // 1–200% on both axes, not 6–100: the rail is a thin edge strip
      // (vertical) or a thin ticker band (horizontal), so it needs to go
      // smaller than any other widget — and because the overlay scales the ad
      // to FILL this box, 100% was a hard ceiling on how big the ad could
      // read. 100% is now mid-track. Keep in step with WIDGET_SIZE_FIELDS
      // .adBanner in public/streamer/index.html or the slider snaps back.
      out.widthPct = _clampNum(w.widthPct, 1, 200, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 1, 200, defaults.heightPct);
      {
        const dg = String(w.displayGame || '').trim().toLowerCase();
        out.displayGame = /^[a-z0-9_-]{1,32}$/.test(dg) ? dg : defaults.displayGame;
      }
      out.orientation = w.orientation === 'horizontal' ? 'horizontal' : 'vertical';
      break;
    case 'junkDrawer':
      out.widthPct = _clampNum(w.widthPct, 20, 100, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 20, 100, defaults.heightPct);
      break;
    case 'animatedBg':
      out.borderRadius = _clampNum(w.borderRadius, 0, 360, defaults.borderRadius);
      out.widthPct = _clampNum(w.widthPct, 5, 200, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 5, 200, defaults.heightPct);
      out.surface = VALID_BG_SURFACES.has(w.surface) ? w.surface : defaults.surface;
      // Migrate legacy configs: the old 'glass' / 'animation-glass' surfaces no
      // longer exist, so anything unrecognised falls back to 'animation' above.
      // mode / shape / glass* are intentionally NOT carried over.
      //
      // perGame is dropped too, but not before rescuing it: under the old
      // mode:'auto' a streamer's edits landed in perGame[<whatever game was
      // live>] while `global` stayed at the black preset:'none' default. Simply
      // deleting perGame would therefore throw away the only real config they
      // ever made and leave them with a backdrop that renders nothing. So if
      // `global` has no usable preset, promote the first per-game entry that
      // does into `global`.
      out.global = _validateBgEntry(w.global, DEFAULT_BG_FALLBACK);
      if ((!out.global.preset || out.global.preset === 'none')
          && w.perGame && typeof w.perGame === 'object') {
        for (const entry of Object.values(w.perGame)) {
          if (entry && VALID_BG_PRESETS.has(entry.preset) && entry.preset !== 'none') {
            out.global = _validateBgEntry(entry, DEFAULT_BG_FALLBACK);
            break;
          }
        }
      }
      break;
    case 'cameraEmbed':
      out.widthPct = _clampNum(w.widthPct, 10, 100, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 10, 100, defaults.heightPct);
      out.cameraFacing = VALID_CAMERA_FACING.has(w.cameraFacing) ? w.cameraFacing : defaults.cameraFacing;
      out.cameraFit = VALID_CAMERA_FIT.has(w.cameraFit) ? w.cameraFit : defaults.cameraFit;
      out.cameraBg = VALID_CAMERA_BG.has(w.cameraBg) ? w.cameraBg : defaults.cameraBg;
      out.mirror = w.mirror !== false;
      out.keyBlackBg = !!w.keyBlackBg;
      out.keyThreshold = _clampNum(w.keyThreshold, 0, 120, defaults.keyThreshold);
      out.keySoftness = _clampNum(w.keySoftness, 0, 120, defaults.keySoftness);
      out.cameraGlassTint = _validateHexColor(w.cameraGlassTint) || defaults.cameraGlassTint;
      out.cameraGlassOpacity = _clampNum(w.cameraGlassOpacity, 0, 100, defaults.cameraGlassOpacity);
      out.cameraGlassBlur = _clampNum(w.cameraGlassBlur, 0, 50, defaults.cameraGlassBlur);
      out.cameraGlassSaturation = _clampNum(w.cameraGlassSaturation, 80, 300, defaults.cameraGlassSaturation);
      out.cameraGlassBrightness = _clampNum(w.cameraGlassBrightness, 60, 160, defaults.cameraGlassBrightness);
      out.cameraGlassEdge = _clampNum(w.cameraGlassEdge, 0, 100, defaults.cameraGlassEdge);
      break;
    case 'phoneCam':
      // Same presentation fields as cameraEmbed minus cameraFacing (the phone
      // app owns the lens), plus `muted` for the phone's mic.
      out.widthPct = _clampNum(w.widthPct, 10, 100, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 10, 100, defaults.heightPct);
      out.cameraFit = VALID_CAMERA_FIT.has(w.cameraFit) ? w.cameraFit : defaults.cameraFit;
      out.cameraBg = VALID_CAMERA_BG.has(w.cameraBg) ? w.cameraBg : defaults.cameraBg;
      // mirror defaults OFF here, so use a truthy test rather than !== false.
      out.mirror = !!w.mirror;
      out.muted = !!w.muted;
      out.keyBlackBg = !!w.keyBlackBg;
      out.keyThreshold = _clampNum(w.keyThreshold, 0, 120, defaults.keyThreshold);
      out.keySoftness = _clampNum(w.keySoftness, 0, 120, defaults.keySoftness);
      out.cameraGlassTint = _validateHexColor(w.cameraGlassTint) || defaults.cameraGlassTint;
      out.cameraGlassOpacity = _clampNum(w.cameraGlassOpacity, 0, 100, defaults.cameraGlassOpacity);
      out.cameraGlassBlur = _clampNum(w.cameraGlassBlur, 0, 50, defaults.cameraGlassBlur);
      out.cameraGlassSaturation = _clampNum(w.cameraGlassSaturation, 80, 300, defaults.cameraGlassSaturation);
      out.cameraGlassBrightness = _clampNum(w.cameraGlassBrightness, 60, 160, defaults.cameraGlassBrightness);
      out.cameraGlassEdge = _clampNum(w.cameraGlassEdge, 0, 100, defaults.cameraGlassEdge);
      break;
    case 'desktopStream':
      // Windows OBS desktop feed iframe. Much smaller field set than the camera
      // widgets: just size, fit, and a mute toggle.
      out.widthPct = _clampNum(w.widthPct, 10, 100, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 10, 100, defaults.heightPct);
      out.cameraFit = VALID_CAMERA_FIT.has(w.cameraFit) ? w.cameraFit : defaults.cameraFit;
      out.muted = w.muted !== false;
      break;
    case 'ailicia': {
      out.widthPct = _clampNum(w.widthPct, 5, 100, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 5, 100, defaults.heightPct);
      // url is the streamer's ai_licia avatar browser-source page. Only https
      // is accepted (it's iframed into the overlay); anything else clears it,
      // and an empty url just renders nothing.
      const u = String(w.url || '').trim().slice(0, 600);
      out.url = /^https:\/\//i.test(u) ? u : '';
      break;
    }
    case 'chatFeed':
      out.widthPct = _clampNum(w.widthPct, 15, 100, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 4, 100, defaults.heightPct);
      out.maxMessages = _clampInt(w.maxMessages, 1, 30, defaults.maxMessages);
      out.messageLifetimeSec = _clampInt(w.messageLifetimeSec, 0, 600, defaults.messageLifetimeSec);
      out.showAvatar = w.showAvatar !== false;
      out.showName = w.showName !== false;
      out.showBadges = w.showBadges !== false;
      out.showPlatform = !!w.showPlatform;
      out.showTimestamp = !!w.showTimestamp;
      out.compact = !!w.compact;
      out.newestAt = VALID_CHAT_NEWEST_AT.has(w.newestAt) ? w.newestAt : defaults.newestAt;
      out.textAlign = VALID_CHAT_ALIGN.has(w.textAlign) ? w.textAlign : defaults.textAlign;
      out.avatarShape = VALID_CHAT_AVATAR_SHAPES.has(w.avatarShape) ? w.avatarShape : defaults.avatarShape;
      out.animation = VALID_CHAT_ANIMATIONS.has(w.animation) ? w.animation : defaults.animation;
      // Trimmed so a stray space can't become an "every message matches"
      // filter, and capped short — this is a symbol, not a keyword.
      out.filterPrefix = String(w.filterPrefix || '').trim().slice(0, 4);
      out.keepFilterPrefix = !!w.keepFilterPrefix;
      break;
    case 'donate':
      // URL & label are both freeform text. URL is shown as-is (overlay
      // strips the protocol + www for display) — we just keep it under a
      // sensible length cap so the bubble doesn't go ridiculous.
      out.url = String(w.url || defaults.url).slice(0, 256) || defaults.url;
      out.label = String(w.label || defaults.label).slice(0, MAX_LABEL_LEN) || defaults.label;
      break;
    case 'fanClubAd':
      out.variant = VALID_FAN_CLUB_AD_VARIANTS.has(w.variant) ? w.variant : defaults.variant;
      out.headline = String(w.headline || defaults.headline).slice(0, 24) || defaults.headline;
      out.label = String(w.label || defaults.label).slice(0, MAX_LABEL_LEN) || defaults.label;
      out.fontFamily = VALID_FAN_CLUB_AD_FONTS.has(w.fontFamily) ? w.fontFamily : defaults.fontFamily;
      out.arrowWidthPct = _clampNum(w.arrowWidthPct, 35, 140, defaults.arrowWidthPct);
      out.arrowHeightPx = _clampNum(w.arrowHeightPx, 90, 360, defaults.arrowHeightPx);
      out.bannerHeightPx = _clampNum(w.bannerHeightPx, 34, 140, defaults.bannerHeightPx);
      out.arrowStrokePx = _clampNum(w.arrowStrokePx, 3, 28, defaults.arrowStrokePx);
      out.headlineSize = _clampNum(w.headlineSize, 50, 220, defaults.headlineSize);
      out.labelSize = _clampNum(w.labelSize, 50, 220, defaults.labelSize);
      out.cycleEnabled = !!w.cycleEnabled;
      out.showEverySec = _clampInt(w.showEverySec, 10, 3600, defaults.showEverySec);
      {
        const rawDuration = Number(w.showDurationSec);
        const duration = Number.isFinite(rawDuration) && rawDuration >= 5 ? rawDuration : defaults.showDurationSec;
        out.showDurationSec = Math.min(out.showEverySec, _clampInt(duration, 5, 300, defaults.showDurationSec));
      }
      out.primaryColor = _validateHexColor(w.primaryColor) || defaults.primaryColor;
      out.secondaryColor = _validateHexColor(w.secondaryColor) || defaults.secondaryColor;
      out.accentColor = _validateHexColor(w.accentColor) || defaults.accentColor;
      out.fillColor = _validateHexColor(w.fillColor) || defaults.fillColor;
      break;
    case 'campaignGift':
      out.title = String(w.title || defaults.title).slice(0, 40) || defaults.title;
      // ctaText may be intentionally blank (hides the pill) — only fall
      // back to the default when the field was never set at all.
      out.ctaText = String(w.ctaText ?? defaults.ctaText).slice(0, 80);
      out.gift1Name = String(w.gift1Name || defaults.gift1Name).slice(0, 32) || defaults.gift1Name;
      out.gift2Name = String(w.gift2Name || defaults.gift2Name).slice(0, 32) || defaults.gift2Name;
      out.gift1Coins = _clampInt(w.gift1Coins, 1, 99999, defaults.gift1Coins);
      out.gift2Coins = _clampInt(w.gift2Coins, 1, 99999, defaults.gift2Coins);
      // Image sources are same-origin asset paths only — never external
      // URLs (this HTML lands inside OBS browser sources).
      out.gift1Img = _validateAssetPath(w.gift1Img) || defaults.gift1Img;
      out.gift2Img = _validateAssetPath(w.gift2Img) || defaults.gift2Img;
      out.showGift2 = w.showGift2 !== false;
      out.reactToGifts = w.reactToGifts !== false;
      out.headerColor = _validateHexColor(w.headerColor) || defaults.headerColor;
      out.cycleEnabled = !!w.cycleEnabled;
      out.showEverySec = _clampInt(w.showEverySec, 10, 3600, defaults.showEverySec);
      {
        const rawDuration = Number(w.showDurationSec);
        const duration = Number.isFinite(rawDuration) && rawDuration >= 5 ? rawDuration : defaults.showDurationSec;
        out.showDurationSec = Math.min(out.showEverySec, _clampInt(duration, 5, 300, defaults.showDurationSec));
      }
      break;
    case 'notifications':
      // Which of the two alerts this widget surfaces (default both on).
      out.showOwing = w.showOwing !== false;
      out.showBatch = w.showBatch !== false;
      // How long each alert stays on screen, and the quiet gap before another
      // alert can appear ("how long before it shows again", after it dismisses).
      out.showDurationSec = _clampInt(w.showDurationSec, 3, 120, defaults.showDurationSec);
      out.cooldownSec = _clampInt(w.cooldownSec, 0, 3600, defaults.cooldownSec);
      break;
    case 'pookieTok':
      // No custom fields — a paid message carries its own tier styling +
      // on-screen duration in the socket payload. The widget just positions it.
      break;
    case 'gameVote':
      out.title = String(w.title ?? defaults.title).slice(0, 40);
      // `??` not `||`: an empty string is a real choice here (hides the line),
      // so it must not fall back to the default.
      out.learnText = String(w.learnText ?? defaults.learnText).slice(0, 80);
      out.candidates = _validateVoteCandidates(w.candidates);
      // How many games land on a ballot. Above 4 the card stops being readable
      // on a portrait overlay, so it's capped there rather than at the
      // candidate-list length.
      // 0 = "All" — put every game in the rotation on the ballot. Otherwise a
      // fixed number of challengers, up to the whole rotation.
      out.ballotSize = Number(w.ballotSize) === 0
        ? 0
        : _clampInt(w.ballotSize, 2, MAX_VOTE_CANDIDATES, defaults.ballotSize);
      out.voteDurationSec = _clampInt(w.voteDurationSec, 15, 900, defaults.voteDurationSec);
      out.graceSec = _clampInt(w.graceSec, 5, 300, defaults.graceSec);
      out.autoStart = w.autoStart !== false;
      out.autoSwitch = w.autoSwitch !== false;
      out.allowKeepPlaying = w.allowKeepPlaying !== false;
      out.showLogos = w.showLogos !== false;
      out.showCounts = w.showCounts !== false;
      break;
    case 'gameVoteStatus':
      out.layout = (w.layout === 'card') ? 'card' : 'pill';
      out.label = String(w.label ?? defaults.label).slice(0, MAX_LABEL_LEN);
      out.showLogo = !!w.showLogo;
      out.showBar = w.showBar !== false;
      out.showGameName = w.showGameName !== false;
      // Some streamers will stack this right where the ballot pops; letting it
      // duck out while a vote runs avoids two cards fighting for the same spot.
      out.hideWhileVoting = !!w.hideWhileVoting;
      break;
    case 'gridLite':
      // wordCount maps straight onto gridlite.html's ?count=, which clamps
      // to the same 1–12 range on its own side.
      out.wordCount = _clampInt(w.wordCount, 1, 12, defaults.wordCount);
      out.showPfp = w.showPfp !== false;
      out.scale = _clampNum(w.scale, 0.4, 2.5, defaults.scale);
      out.widthPct = _clampInt(w.widthPct, 10, 100, defaults.widthPct);
      out.heightPct = _clampInt(w.heightPct, 8, 100, defaults.heightPct);
      break;
    case 'musicCredits':
      out.widthPct = _clampNum(w.widthPct, 10, 100, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 4, 100, defaults.heightPct);
      out.showPretzel = w.showPretzel !== false;
      out.showIncompetech = w.showIncompetech !== false;
      out.showStreamBeats = w.showStreamBeats !== false;
      out.genres = String(w.genres || defaults.genres).slice(0, 120);
      out.overlayStyle = ['bar', 'card', 'minimal'].includes(w.overlayStyle) ? w.overlayStyle : defaults.overlayStyle;
      out.position = ['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(w.position) ? w.position : defaults.position;
      out.message = String(w.message || '').slice(0, 200);
      out.nowPlaying = String(w.nowPlaying || '').slice(0, 120);
      out.nowPlayingSource = ['pretzel', 'incompetech', 'streambeats', 'custom'].includes(w.nowPlayingSource) ? w.nowPlayingSource : defaults.nowPlayingSource;
      out.autoNowPlaying = !!w.autoNowPlaying;
      out.playlist = _validateMusicPlaylist(w.playlist);
      out.shuffle = !!w.shuffle;
      out.repeat = ['off', 'all', 'one'].includes(w.repeat) ? w.repeat : defaults.repeat;
      break;
    case 'spotifyDJ':
      out.widthPct = _clampNum(w.widthPct, 20, 100, defaults.widthPct);
      out.heightPct = _clampNum(w.heightPct, 8, 60, defaults.heightPct);
      out.titleMaxChars = _clampInt(w.titleMaxChars, 20, 80, defaults.titleMaxChars);
      out.showAlbumArt = w.showAlbumArt !== false;
      out.showRequester = w.showRequester !== false;
      out.showQueue = w.showQueue !== false;
      out.showCommands = w.showCommands !== false;
      out.showTiers = w.showTiers !== false;
      break;
  }
  return out;
}

// Music playlist entries: { title, source, url }. Only same-origin or https
// audio URLs are accepted; everything else is dropped so a stale/broken entry
// can't silently break the overlay.
function _validateMusicPlaylist(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const title = String(entry.title || '').trim().slice(0, 120);
    const source = ['pretzel', 'incompetech', 'streambeats', 'custom'].includes(entry.source) ? entry.source : 'custom';
    const url = String(entry.url || '').trim().slice(0, 1024);
    if (!title || !url) continue;
    if (!/^https:\/\//i.test(url) && !/^\//.test(url)) continue;
    out.push({ title, source, url });
    if (out.length >= 200) break;
  }
  return out;
}

// Game Vote rotation entries: { gameId, termUnit, termValue, setupId? }. A game
// may only appear once — a duplicate would give the same ballot row two numbers
// and make the tally ambiguous. Unknown game ids are dropped rather than
// coerced, so a stale config can't put an unswitchable game on the ballot.
// setupId optionally references one of the streamer's saved setups; when that
// candidate wins the vote, the whole setup is applied instead of a bare game
// switch. Existence isn't checked here (this module can't see streamer-setups)
// — the apply path falls back to a plain switch when the setup is gone.
function _validateVoteCandidates(raw) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  const out = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const gameId = String(entry.gameId || '').trim();
    if (!STREAMER_GAME_IDS.includes(gameId) || seen.has(gameId)) continue;
    seen.add(gameId);
    const termUnit = VALID_VOTE_TERM_UNITS.has(entry.termUnit) ? entry.termUnit : 'rounds';
    const setupId = String(entry.setupId || '').trim().slice(0, 64);
    out.push({
      gameId,
      termUnit,
      // Rounds are small counts; minutes can run a couple of hours.
      termValue: termUnit === 'rounds'
        ? _clampInt(entry.termValue, 1, 50, 5)
        : _clampInt(entry.termValue, 1, 240, 30),
      ...(setupId ? { setupId } : {}),
    });
    if (out.length >= MAX_VOTE_CANDIDATES) break;
  }
  return out;
}

function _validateLayout(rawLayout, widgets) {
  const out = { portrait: {}, landscape: {} };
  for (const mode of ['portrait', 'landscape']) {
    const r = (rawLayout && rawLayout[mode]) || {};
    for (const w of widgets) {
      const p = r[w.id] || _defaultLayoutFor(w.type, mode);
      out[mode][w.id] = {
        x: _clampPosPct(p.x, _defaultLayoutFor(w.type, mode).x),
        y: _clampPosPct(p.y, _defaultLayoutFor(w.type, mode).y),
        anchor: VALID_ANCHORS.has(p.anchor) ? p.anchor : _defaultLayoutFor(w.type, mode).anchor,
      };
    }
  }
  return out;
}

// Per-game layout overrides. Same shape as the universal layout (portrait/
// landscape → widgetId → {x,y,anchor}) but only contains widgets that have
// game-specific positions. Unspecified widgets fall back to `config.layout`.
// gameId is validated against a permissive [a-z0-9_-]{1,32} pattern.
function _validateGameLayouts(rawGameLayouts, widgets) {
  const out = {};
  if (!rawGameLayouts || typeof rawGameLayouts !== 'object') return out;
  const widgetIds = new Set(widgets.map(w => w.id));
  const widgetById = new Map(widgets.map(w => [w.id, w]));
  // Per-game entries are keyed by widget id. Delete and re-add a widget and it
  // comes back with a NEW random id, which used to orphan every per-game
  // position keyed to the old one — they were dropped here, silently wiping a
  // whole setup's worth of per-game tuning in one save. Remap an orphan onto
  // the live widget of the same type instead. Widget ids are `type-suffix`
  // ('gameEmbed-77ea7055', 'winCard-default'), so the type is the head.
  // Only remapped when that type has EXACTLY ONE live widget — with two there
  // is no non-arbitrary target — and never over an entry the live widget
  // already owns.
  const idsByType = new Map();
  for (const w of widgets) {
    if (!w || !w.type) continue;
    if (!idsByType.has(w.type)) idsByType.set(w.type, []);
    idsByType.get(w.type).push(w.id);
  }
  const _remapOrphanId = (wid) => {
    const sameType = idsByType.get(String(wid).split('-')[0]);
    return (sameType && sameType.length === 1) ? sameType[0] : null;
  };
  for (const [gameIdRaw, byMode] of Object.entries(rawGameLayouts)) {
    const gameId = String(gameIdRaw || '').toLowerCase();
    if (!/^[a-z0-9_-]{1,32}$/.test(gameId)) continue;
    if (!byMode || typeof byMode !== 'object') continue;
    const slot = {};
    for (const mode of ['portrait', 'landscape']) {
      const r = (byMode && byMode[mode]) || null;
      if (!r || typeof r !== 'object') continue;
      const modeOut = {};
      for (const [wid, rawEntry] of Object.entries(r)) {
        if (!rawEntry || typeof rawEntry !== 'object') continue;
        let targetId = wid;
        if (!widgetIds.has(wid)) {
          targetId = _remapOrphanId(wid);
          if (!targetId) continue;
          // The live widget's own entry always beats a resurrected orphan,
          // whichever order they happen to appear in.
          if (Object.prototype.hasOwnProperty.call(r, targetId)) continue;
          if (Object.prototype.hasOwnProperty.call(modeOut, targetId)) continue;
        }
        let p = rawEntry;
        if (
          gameId === 'wikisearchle'
          && widgetById.get(targetId)?.type === 'gameEmbed'
          && _isLegacyWikiSearchleEmbedLayout(rawEntry)
        ) {
          p = { ...rawEntry, ...WIKISEARCHLE_DEFAULT_EMBED_LAYOUT };
        }
        const entry = {
          x: _clampPosPct(p.x, 50),
          y: _clampPosPct(p.y, 50),
          anchor: VALID_ANCHORS.has(p.anchor) ? p.anchor : 'center',
        };
        // Optional per-game size override (gameEmbed only — other widget
        // types size via .scale which is already per-widget). Persisted
        // when present so streamers can shrink the game card on games
        // where the chrome around it needs more room.
        if (Number.isFinite(Number(p.widthPct)))  entry.widthPct  = _clampNum(p.widthPct,  10, 100, 100);
        if (Number.isFinite(Number(p.heightPct))) entry.heightPct = _clampNum(p.heightPct, 10, 100, 100);
        if (Number.isFinite(Number(p.scale)))     entry.scale     = _clampNum(p.scale,     10, 300, 100);
        // Per-game iframe viewport override. Lets a streamer force their
        // game iframe to render at a different design viewport than the
        // chat-relay default (e.g. flip wikisearchle from 720-fixed to
        // canvas-native for a sharper render). Empty/missing = inherit
        // the global default from _STREAM_VIEW_GAME_VIEWPORT.
        const _vm = String(p.viewportMode || '').toLowerCase();
        if (['fixed-720', 'responsive', 'canvas-native'].includes(_vm)) {
          entry.viewportMode = _vm;
        }
        // Searchle-grid only: gridRows caps the chip-grid to N rows.
        // Validated 3–25; default applied at render time, not here.
        if (Number.isFinite(Number(p.gridRows))) {
          entry.gridRows = _clampInt(p.gridRows, 3, 25, 15);
        }
        modeOut[targetId] = entry;
      }
      if (Object.keys(modeOut).length) slot[mode] = modeOut;
    }
    if (Object.keys(slot).length) out[gameId] = slot;
  }
  return out;
}

// Animated background block. Single object with:
//   enabled:  master toggle (default true so per-game defaults apply OOTB)
//   mode:     'auto' = per-game defaults + perGame overrides; 'manual' =
//             always use `global` regardless of active game
//   global:   { preset, primaryColor, secondaryColor, speed, intensity,
//               showGameName } — used in manual mode AND as the fallback in
//               auto mode when no per-game entry exists
//   perGame:  { [gameId]: same shape as global } — auto-mode overrides
function _validateBgEntry(raw, defaults) {
  const d = defaults || DEFAULT_BG_FALLBACK;
  const out = {};
  out.preset = (raw && VALID_BG_PRESETS.has(raw.preset)) ? raw.preset : (d.preset || 'gradient-pulse');
  // ── extras: preset-scoped per-preset options (numeric 0-10 sliders) ──
  // Only sanitize known sub-keys; ignore unknown presets and unknown fields
  // to avoid arbitrary blob injection. Currently only `vaporwave` is wired.
  if (raw && raw.extras && typeof raw.extras === 'object') {
    const ex = {};
    if (raw.extras.vaporwave && typeof raw.extras.vaporwave === 'object') {
      const v = raw.extras.vaporwave;
      const _i = (n, lo, hi, def) => {
        const x = Number(n);
        return Number.isFinite(x) ? Math.max(lo, Math.min(hi, Math.round(x * 100) / 100)) : def;
      };
      ex.vaporwave = {
        grid:   _i(v.grid,   1, 10, 5),
        sun:    _i(v.sun,    1, 10, 5),
        shapes: _i(v.shapes, 0, 10, 4),
        glitch: _i(v.glitch, 0, 10, 3),
        stars:  _i(v.stars,  0, 10, 5),
      };
    }
    if (Object.keys(ex).length) out.extras = ex;
  }
  // ── v4: prem-nebula-v4-specific fine-tuning sub-object ──
  // Five float knobs the streamer can tweak when prem-nebula-v4 is the
  // selected preset. Ignored by every other preset's renderer. Stored
  // always so a streamer can toggle off v4, back on, and not lose their
  // settings. Defaults match the prior hardcoded look.
  if (raw && raw.v4 && typeof raw.v4 === 'object') {
    const v = raw.v4;
    const _f = (n, lo, hi, def) => {
      const x = Number(n);
      return Number.isFinite(x) ? Math.max(lo, Math.min(hi, x)) : def;
    };
    out.v4 = {
      hueOffset:   _f(v.hueOffset,   0.00, 1.00, 0.00),
      hueSpeed:    _f(v.hueSpeed,    0.00, 3.00, 1.00),
      sat:         _f(v.sat,         0.05, 0.30, 0.16),
      lum:         _f(v.lum,         0.10, 0.35, 0.20),
      plasmaScale: _f(v.plasmaScale, 0.50, 2.50, 1.00),
    };
  } else if (d && d.v4) {
    out.v4 = d.v4;
  }
  out.primaryColor   = _validateHexColor(raw?.primaryColor)   || d.primaryColor   || '#5865F2';
  out.secondaryColor = _validateHexColor(raw?.secondaryColor) || d.secondaryColor || '#0a0e1a';
  // Color mode + custom palette. Renderers receive a fully-resolved
  // `palette` array at render time (see ensureAnimBg). Persisted shape:
  //   colorMode: 'duo' | 'trio' | 'quad' | 'rainbow'
  //   colors:    array of hex colors (length matches mode; ignored for rainbow)
  // Backward compat: `colorMode` defaults to 'duo' and `colors` defaults
  // to [primaryColor, secondaryColor] so existing saved configs render
  // identically to before.
  const _modeIn = String(raw?.colorMode || '').toLowerCase();
  out.colorMode = ['duo', 'trio', 'quad', 'rainbow'].includes(_modeIn) ? _modeIn : (d.colorMode || 'duo');
  const _maxLen = out.colorMode === 'rainbow' ? 0
                : out.colorMode === 'quad'    ? 4
                : out.colorMode === 'trio'    ? 3
                : 2;
  const _rawColors = Array.isArray(raw?.colors) ? raw.colors : [];
  const _cleaned = [];
  for (const c of _rawColors) {
    const hex = _validateHexColor(c);
    if (hex) _cleaned.push(hex);
    if (_cleaned.length >= _maxLen) break;
  }
  // Backfill from primary/secondary if the user hasn't picked enough.
  if (out.colorMode !== 'rainbow') {
    while (_cleaned.length < _maxLen) {
      if (_cleaned.length === 0) _cleaned.push(out.primaryColor);
      else if (_cleaned.length === 1) _cleaned.push(out.secondaryColor);
      else _cleaned.push(_cleaned[_cleaned.length - 1]);  // duplicate to fill
    }
  }
  out.colors = _cleaned;
  out.speed     = _clampNum(raw?.speed,     1, 10, d.speed     != null ? d.speed     : 5);
  out.intensity = _clampNum(raw?.intensity, 1, 10, d.intensity != null ? d.intensity : 5);
  out.showGameName = !!(raw && raw.showGameName);
  // Position + scale (canvas %; 100 = fill). Center-anchored. Lets the
  // streamer shrink the bg layer so it shows around the gameEmbed widget
  // rather than just behind it.
  out.x     = _clampPct(raw?.x,     d.x     != null ? d.x     : 50);
  out.y     = _clampPct(raw?.y,     d.y     != null ? d.y     : 50);
  out.scale = _clampNum(raw?.scale, 10, 200, d.scale != null ? d.scale : 100);
  // New widget-backed background sizing. widthPct/heightPct are exact
  // canvas percentages; legacy scale remains for old saved configs and is
  // used as the fallback when width/height have never been set.
  out.widthPct  = _clampNum(raw?.widthPct,  5, 200, d.widthPct  != null ? d.widthPct  : out.scale);
  out.heightPct = _clampNum(raw?.heightPct, 5, 200, d.heightPct != null ? d.heightPct : out.scale);
  out.surface = VALID_BG_SURFACES.has(raw?.surface) ? raw.surface : (VALID_BG_SURFACES.has(d.surface) ? d.surface : 'animation');
  out.glassTint = _validateHexColor(raw?.glassTint) || _validateHexColor(d.glassTint) || '#ffffff';
  out.glassOpacity = _clampNum(raw?.glassOpacity, 0, 100, d.glassOpacity != null ? d.glassOpacity : 10);
  out.glassBlur = _clampNum(raw?.glassBlur, 0, 60, d.glassBlur != null ? d.glassBlur : 18);
  out.glassSaturation = _clampNum(raw?.glassSaturation, 80, 300, d.glassSaturation != null ? d.glassSaturation : 170);
  out.glassBrightness = _clampNum(raw?.glassBrightness, 60, 160, d.glassBrightness != null ? d.glassBrightness : 100);
  out.glassEdge = _clampNum(raw?.glassEdge, 0, 100, d.glassEdge != null ? d.glassEdge : 40);
  return out;
}
function _validateBackground(raw) {
  const hasRaw = raw && typeof raw === 'object';
  const r = hasRaw ? raw : {};
  const out = {
    enabled: hasRaw ? r.enabled !== false : false,
    mode: r.mode === 'manual' ? 'manual' : 'auto',
    global: _validateBgEntry(r.global, DEFAULT_BG_FALLBACK),
    perGame: {},
  };
  if (r.perGame && typeof r.perGame === 'object') {
    for (const [gid, entry] of Object.entries(r.perGame)) {
      const id = String(gid || '').toLowerCase();
      if (!/^[a-z0-9_-]{1,32}$/.test(id)) continue;
      out.perGame[id] = _validateBgEntry(entry, DEFAULT_BG_PER_GAME[id] || DEFAULT_BG_FALLBACK);
    }
  }
  return out;
}

function _validateOrder(rawOrder, widgets) {
  const ids = new Set(widgets.map(w => w.id));
  const seen = new Set();
  const out = [];
  if (Array.isArray(rawOrder)) {
    for (const id of rawOrder) {
      const s = String(id || '');
      if (ids.has(s) && !seen.has(s)) { out.push(s); seen.add(s); }
    }
  }
  for (const w of widgets) if (!seen.has(w.id)) out.push(w.id);
  return out;
}

function _backgroundToAnimatedBgWidget(rawBackground) {
  const bg = _validateBackground(rawBackground);
  const g = bg.global || DEFAULT_BG_FALLBACK;
  return {
    ..._typeDefaults('animatedBg'),
    id: 'animatedBg-default',
    type: 'animatedBg',
    name: 'Animated Background',
    enabled: bg.enabled !== false,
    widthPct: g.widthPct != null ? g.widthPct : (g.scale != null ? g.scale : 100),
    heightPct: g.heightPct != null ? g.heightPct : (g.scale != null ? g.scale : 100),
    // A legacy 'glass' / 'animation-glass' surface is no longer valid and
    // _validateInstance falls it back to 'animation'.
    surface: g.surface || 'animation',
    global: bg.global,
    // perGame is not a widget field any more — it is passed through purely so
    // _validateInstance's rescue can promote a real per-game entry into
    // `global` when the legacy global was left at the black preset:'none'.
    perGame: bg.perGame || {},
  };
}

function _withDefaultWinCardConfig(rawConfig) {
  const cfg = rawConfig && typeof rawConfig === 'object' ? { ...rawConfig } : {};
  const widgets = Array.isArray(cfg.widgets) ? cfg.widgets.slice() : [];

  if (!widgets.some(w => w && w.type === 'winCard')) {
    const winCard = _defaultWinCardWidget();
    if (widgets.some(w => w && w.id === winCard.id)) winCard.id = _newInstanceId('winCard');
    widgets.push(winCard);
  }

  const winCardIds = widgets
    .filter(w => w && w.type === 'winCard' && w.id)
    .map(w => String(w.id));

  const layout = {
    portrait: { ...((cfg.layout && cfg.layout.portrait) || {}) },
    landscape: { ...((cfg.layout && cfg.layout.landscape) || {}) },
  };
  for (const id of winCardIds) {
    if (!layout.portrait[id]) layout.portrait[id] = { ...DEFAULT_WIN_CARD_PORTRAIT_POS };
    if (!layout.landscape[id]) layout.landscape[id] = { ...DEFAULT_WIN_CARD_LANDSCAPE_POS };
  }

  // Win card positions are seeded into the UNIVERSAL layout above only. They
  // used to also be written into every game's gameLayouts entry, which gave the
  // card 16 per-game positions and made it drift as soon as one of them was
  // nudged. Per-game layout slots belong to the game widget alone.
  const rawGameLayouts = cfg.gameLayouts && typeof cfg.gameLayouts === 'object' ? cfg.gameLayouts : {};
  const gameLayouts = { ...rawGameLayouts };

  const widgetOrder = Array.isArray(cfg.widgetOrder) ? cfg.widgetOrder.slice() : [];
  for (const id of winCardIds.slice().reverse()) {
    if (!widgetOrder.includes(id)) widgetOrder.unshift(id);
  }

  return { ...cfg, widgets, layout, gameLayouts, widgetOrder };
}

function _validateConfig(rawConfig) {
  rawConfig = _withDefaultWinCardConfig(rawConfig);
  const widgets = Array.isArray(rawConfig?.widgets) ? rawConfig.widgets.slice() : [];
  if (!widgets.some(w => w && w.type === 'animatedBg') && rawConfig?.background && rawConfig.background.enabled !== false) {
    widgets.unshift(_backgroundToAnimatedBgWidget(rawConfig.background));
  }
  if (widgets.length > MAX_WIDGETS_PER_STREAMER) {
    throw new Error(`Too many widgets (max ${MAX_WIDGETS_PER_STREAMER})`);
  }
  // Validate each, dedup ids
  const seenIds = new Set();
  const validated = widgets.map(w => {
    const v = _validateInstance(w);
    while (seenIds.has(v.id)) v.id = _newInstanceId(v.type);
    seenIds.add(v.id);
    return v;
  });
  // Game Vote used to be ONE widget that rendered both the ballot and the
  // between-votes turn pill. Splitting the turn readout into its own widget
  // would otherwise silently remove it from live overlays, so pair each
  // existing gameVote with a status widget exactly once. Gated on a flag (not
  // on "does a status widget exist") so deleting the status card doesn't
  // resurrect it on the next save.
  const voteSplitMigrated = !!rawConfig?.gameVoteSplitMigrated;
  if (!voteSplitMigrated && validated.length < MAX_WIDGETS_PER_STREAMER) {
    const legacyVote = validated.find(w => w.type === 'gameVote');
    if (legacyVote && !validated.some(w => w.type === 'gameVoteStatus')) {
      const status = _validateInstance({
        id: _newInstanceId('gameVoteStatus'),
        type: 'gameVoteStatus',
        name: 'Game Vote Status',
        // The old widget's showIdlePill decided whether the turn readout was
        // visible; carry that across so the overlay looks unchanged.
        enabled: legacyVote.enabled && rawConfig?.widgets?.some(
          w => w && w.id === legacyVote.id && w.showIdlePill !== false),
        color: legacyVote.color,
        style: legacyVote.style,
      });
      while (seenIds.has(status.id)) status.id = _newInstanceId('gameVoteStatus');
      seenIds.add(status.id);
      validated.push(status);
    }
  }
  return {
    widgets: validated,
    gameVoteSplitMigrated: true,
    layout: _validateLayout(rawConfig?.layout, validated),
    gameLayouts: _validateGameLayouts(rawConfig?.gameLayouts, validated),
    widgetOrder: _validateOrder(rawConfig?.widgetOrder, validated),
    background: _validateBackground(rawConfig?.background),
    backgroundWidgetMigrated: !!rawConfig?.backgroundWidgetMigrated || validated.some(w => w.type === 'animatedBg'),
    // Set by migrateLayoutScope(); must survive validation or the repair would
    // re-run on every save and keep clobbering the universal position.
    layoutScopeMigrated: !!rawConfig?.layoutScopeMigrated,
  };
}

/**
 * One-time repair for positions that were pinned to a single game by mistake.
 *
 * Until 2026-08-06 dragging ANY widget while a game was selected wrote a
 * per-game layout entry for it, so the widget jumped to a stale universal
 * position whenever the active game changed. Per-game slots now belong to the
 * game widget alone — but the stray entries already on disk still hold the
 * positions streamers actually arranged, so lift them into the universal slot
 * before dropping them, rather than letting every widget snap to a default.
 *
 * `preferredGameId` should be the streamer's current active game: promoting
 * that entry means what's on screen right now doesn't move at all. Falls back
 * to the most common per-game position, then to whatever is already universal.
 */
function migrateLayoutScope(streamerId, preferredGameId) {
  const entry = _ensure(streamerId);
  const cfg = entry.config;
  if (cfg.layoutScopeMigrated) return { ok: true, promoted: 0, cleared: 0 };

  const gl = cfg.gameLayouts || {};
  const perGameWidgets = new Set(cfg.widgets.filter(w => w.type !== 'gameEmbed').map(w => w.id));
  let promoted = 0;
  let cleared = 0;

  for (const mode of ['portrait', 'landscape']) {
    for (const widgetId of perGameWidgets) {
      // Collect this widget's per-game positions.
      const found = [];
      for (const gameId of Object.keys(gl)) {
        const e = gl[gameId] && gl[gameId][mode] && gl[gameId][mode][widgetId];
        if (e && Number.isFinite(e.x) && Number.isFinite(e.y)) found.push({ gameId, pos: e });
      }
      if (!found.length) continue;

      let chosen = preferredGameId
        ? found.find(f => f.gameId === preferredGameId)
        : null;
      if (!chosen) {
        // Most common position wins; ties resolve to the first encountered so
        // the result is deterministic across runs.
        const counts = new Map();
        for (const f of found) {
          const k = `${Number(f.pos.x).toFixed(2)},${Number(f.pos.y).toFixed(2)},${f.pos.anchor || ''}`;
          const c = counts.get(k) || { n: 0, f };
          c.n += 1;
          counts.set(k, c);
        }
        chosen = [...counts.values()].sort((a, b) => b.n - a.n)[0].f;
      }

      if (!cfg.layout[mode]) cfg.layout[mode] = {};
      cfg.layout[mode][widgetId] = {
        x: _clampPosPct(chosen.pos.x, 50),
        y: _clampPosPct(chosen.pos.y, 50),
        anchor: VALID_ANCHORS.has(chosen.pos.anchor) ? chosen.pos.anchor : 'center',
      };
      promoted++;

      // Drop every per-game entry for this widget. Size/scale fields go with
      // them: those are equally game-scoped and equally wrong here.
      for (const f of found) {
        delete gl[f.gameId][mode][widgetId];
        cleared++;
      }
    }
  }

  cfg.layoutScopeMigrated = true;
  save();
  if (promoted) {
    console.log(`[StreamerGoals] layout scope repaired for ${streamerId}: `
      + `${promoted} widget position(s) promoted to universal, ${cleared} per-game entries cleared`);
  }
  return { ok: true, promoted, cleared };
}

// ── Migration ───────────────────────────────────────────────────────
function _migrate(entry) {
  let config = entry?.config || {};
  let state = entry?.state || {};

  if (!Array.isArray(config.widgets)) {
    // Legacy: single instance per type from old direct-field config
    const widgets = [];
    const idMap = {};
    for (const type of VALID_WIDGET_TYPES) {
      if (config[type] && typeof config[type] === 'object') {
        const id = type + '-default';
        idMap[type] = id;
        widgets.push({
          id, type, name: _displayNameFor(type),
          ..._typeDefaults(type),
          ...config[type],
        });
      }
    }
    // Layout migration
    const newLayout = { portrait: {}, landscape: {} };
    const oldLayout = config.layout || {};
    for (const mode of ['portrait', 'landscape']) {
      const m = oldLayout[mode] || {};
      for (const oldKey of Object.keys(m)) {
        const newId = idMap[oldKey];
        if (newId) newLayout[mode][newId] = m[oldKey];
      }
    }
    // Order migration
    const oldOrder = Array.isArray(config.widgetOrder) ? config.widgetOrder : VALID_WIDGET_TYPES;
    const newOrder = oldOrder.map(t => idMap[t]).filter(Boolean);
    for (const w of widgets) if (!newOrder.includes(w.id)) newOrder.push(w.id);

    config = { widgets, layout: newLayout, widgetOrder: newOrder };

    // State migration
    const newWidgetState = {};
    for (const w of widgets) {
      if (w.type === 'giftGoal' && state.giftGoal) {
        newWidgetState[w.id] = {
          current: Number(state.giftGoal.current) || 0,
          lastChangeAt: Number(state.giftGoal.lastChangeAt) || 0,
        };
      } else if (w.type === 'followGoal' && state.followGoal) {
        newWidgetState[w.id] = {
          current: Number(state.followGoal.current) || 0,
          lastChangeAt: Number(state.followGoal.lastChangeAt) || 0,
        };
      } else if (w.type === 'milestone' && state.milestone) {
        newWidgetState[w.id] = {
          milestoneCounter: Number(state.milestone.counters?.[w.source]) || 0,
          milestoneLastFireAt: Number(state.milestone.lastFireAt?.[w.source]) || 0,
        };
      }
    }
    state = { widgetState: newWidgetState };
  }

  if (!state.widgetState) state.widgetState = {};
  return { config: _validateConfig(config), state };
}

// ── Persistence ─────────────────────────────────────────────────────
function load() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) || {};
    goalsByStreamer = {};
    for (const id of Object.keys(parsed)) goalsByStreamer[id] = _migrate(parsed[id]);
    console.log(`[StreamerGoals] Loaded goals for ${Object.keys(goalsByStreamer).length} streamer(s)`);
  } catch (err) {
    if (err.code === 'ENOENT') {
      goalsByStreamer = {};
      save();
      console.log('[StreamerGoals] Created empty goals file');
    } else {
      console.error('[StreamerGoals] Failed to load:', err.message);
      goalsByStreamer = {};
    }
  }
}

function save() {
  try {
    const dir = path.dirname(DATA_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(goalsByStreamer, null, 2));
  } catch (err) {
    console.error('[StreamerGoals] Failed to save:', err.message);
  }
}

function _ensure(streamerId) {
  if (!goalsByStreamer[streamerId]) {
    // Run the template through validation so missing fields fill in
    // and unknown ones drop out cleanly.
    goalsByStreamer[streamerId] = {
      config: _validateConfig(_defaultConfig()),
      state: _defaultState(),
    };
  }
  return goalsByStreamer[streamerId];
}

// ── Public read API ─────────────────────────────────────────────────
function setIo(socketIO) { io = socketIO; }
function setHandleResolver(fn) { if (typeof fn === 'function') getHandle = fn; }
function setLikeHintSink(fn) { if (typeof fn === 'function') likeHintSink = fn; }
function getForStreamer(streamerId) {
  if (!streamerId) return { config: _defaultConfig(), state: _defaultState() };
  return _ensure(streamerId);
}

function snapshot(streamerId) {
  const entry = _ensure(streamerId);
  return {
    streamerId,
    handle: getHandle(streamerId) || null,
    config: entry.config,
    state: { widgetState: { ...entry.state.widgetState } },
    // Server-wide per-game position fallbacks. Overlay uses these when the
    // streamer's own gameLayouts doesn't have an entry for the active game.
    // Lets pre-existing streamers benefit from per-game tweaks without
    // mutating their saved configs.
    defaultGameLayouts: DEFAULT_GAME_LAYOUTS,
    // Animated-background server defaults — same fallback model. Overlay
    // resolves config.background.perGame[gameId] || defaultBgPerGame[gameId]
    // || defaultBgFallback when running in auto mode.
    defaultBgPerGame: DEFAULT_BG_PER_GAME,
    defaultBgFallback: DEFAULT_BG_FALLBACK,
    // Per-widget-type defaults. The dashboard diffs the current widget
    // config against these to show a "modified from default" dot in each
    // section header so the streamer can see at a glance what they've
    // customized vs what's factory.
    widgetTypeDefaults: {
      animatedBg: _typeDefaults('animatedBg'),
      giftGoal:   _typeDefaults('giftGoal'),
      followGoal: _typeDefaults('followGoal'),
      milestone:  _typeDefaults('milestone'),
      winCard:    _typeDefaults('winCard'),
      topLikers:  _typeDefaults('topLikers'),
      gameEmbed:  _typeDefaults('gameEmbed'),
      cameraEmbed:_typeDefaults('cameraEmbed'),
      phoneCam:   _typeDefaults('phoneCam'),
      ailicia:    _typeDefaults('ailicia'),
      chatFeed:   _typeDefaults('chatFeed'),
      donate:     _typeDefaults('donate'),
      fanClubAd:   _typeDefaults('fanClubAd'),
      campaignGift: _typeDefaults('campaignGift'),
      notifications: _typeDefaults('notifications'),
      pookieTok: _typeDefaults('pookieTok'),
      gameVote: _typeDefaults('gameVote'),
      gameVoteStatus: _typeDefaults('gameVoteStatus'),
      gridLite: _typeDefaults('gridLite'),
      musicCredits: _typeDefaults('musicCredits'),
      spotifyDJ: _typeDefaults('spotifyDJ'),
    },
    at: Date.now(),
  };
}

// ── Mutations ───────────────────────────────────────────────────────
function setConfig(streamerId, rawConfig) {
  if (!streamerId) throw new Error('streamerId required');
  const entry = _ensure(streamerId);
  const oldWidgets = entry.config.widgets;
  entry.config = _validateConfig(rawConfig);
  // Drop state for widgets that no longer exist; preserve state for surviving ones.
  const surviving = new Set(entry.config.widgets.map(w => w.id));
  for (const id of Object.keys(entry.state.widgetState)) {
    if (!surviving.has(id)) delete entry.state.widgetState[id];
  }
  // Zero out persisted current when persist flips off
  for (const w of entry.config.widgets) {
    const old = oldWidgets.find(o => o.id === w.id);
    if (old && (old.type === 'giftGoal' || old.type === 'followGoal')) {
      if (old.persist && !w.persist && entry.state.widgetState[w.id]) {
        entry.state.widgetState[w.id].current = 0;
      }
    }
  }
  save();
  _scheduleEmit(streamerId);
  return entry;
}

function addWidget(streamerId, type, name) {
  const entry = _ensure(streamerId);
  if (!VALID_WIDGET_TYPES.includes(type)) throw new Error('Invalid widget type');
  if (type === 'animatedBg') {
    const existing = entry.config.widgets.find(w => w.type === 'animatedBg');
    if (existing) return { entry, widget: existing };
  }
  if (entry.config.widgets.length >= MAX_WIDGETS_PER_STREAMER) {
    throw new Error('Widget limit reached');
  }
  const id = _newInstanceId(type);
  const widget = _validateInstance({
    id, type,
    name: String(name || _displayNameFor(type)).slice(0, MAX_NAME_LEN),
    enabled: false,
  });
  entry.config.widgets.push(widget);
  entry.config.layout = _validateLayout(entry.config.layout, entry.config.widgets);
  entry.config.widgetOrder = _validateOrder(
    [...entry.config.widgetOrder, id], entry.config.widgets);
  save();
  _scheduleEmit(streamerId);
  return { entry, widget };
}

// Name for a duplicate: "<name> (copy)", then "(copy 2)", "(copy 3)"… so two
// duplicates of the same widget never land on an identical label.
function _copyNameFor(sourceName, type, widgets) {
  const base = String(sourceName || _displayNameFor(type))
    .replace(/\s*\(copy(?:\s+\d+)?\)\s*$/i, '')
    .trim() || _displayNameFor(type);
  const taken = new Set(widgets.map(w => String(w.name || '')));
  for (let n = 1; n < 100; n++) {
    const suffix = n === 1 ? ' (copy)' : ` (copy ${n})`;
    const name = base.slice(0, MAX_NAME_LEN - suffix.length) + suffix;
    if (!taken.has(name)) return name;
  }
  return base.slice(0, MAX_NAME_LEN);
}

/**
 * Clone an existing widget — every setting, plus its universal and per-game
 * positions — into a new instance placed immediately after the source in both
 * the widget list and the render order. Counters (widgetState) start fresh:
 * settings are copied, accumulated progress is not.
 */
function duplicateWidget(streamerId, widgetId) {
  const entry = _ensure(streamerId);
  const idx = entry.config.widgets.findIndex(w => w.id === widgetId);
  if (idx === -1) throw new Error('Widget not found');
  const source = entry.config.widgets[idx];
  // Only one animated background may exist — the overlay renders a single
  // backdrop layer, so a second instance would be dead config.
  if (source.type === 'animatedBg') throw new Error('The animated background cannot be duplicated');
  if (entry.config.widgets.length >= MAX_WIDGETS_PER_STREAMER) {
    throw new Error('Widget limit reached');
  }
  const id = _newInstanceId(source.type);
  const clone = _validateInstance({
    ...JSON.parse(JSON.stringify(source)),
    id,
    name: _copyNameFor(source.name, source.type, entry.config.widgets),
  });
  entry.config.widgets.splice(idx + 1, 0, clone);

  // Carry the source's positions over so the copy lands exactly on top of it.
  for (const mode of ['portrait', 'landscape']) {
    if (!entry.config.layout[mode]) entry.config.layout[mode] = {};
    const src = entry.config.layout[mode][widgetId];
    if (src) entry.config.layout[mode][id] = { ...src };
  }
  for (const byMode of Object.values(entry.config.gameLayouts || {})) {
    if (!byMode || typeof byMode !== 'object') continue;
    for (const mode of ['portrait', 'landscape']) {
      const src = byMode[mode] && byMode[mode][widgetId];
      if (src) byMode[mode][id] = JSON.parse(JSON.stringify(src));
    }
  }
  entry.config.layout = _validateLayout(entry.config.layout, entry.config.widgets);
  entry.config.gameLayouts = _validateGameLayouts(entry.config.gameLayouts, entry.config.widgets);

  const order = [...entry.config.widgetOrder];
  const oi = order.indexOf(widgetId);
  if (oi === -1) order.push(id); else order.splice(oi + 1, 0, id);
  entry.config.widgetOrder = _validateOrder(order, entry.config.widgets);

  save();
  _scheduleEmit(streamerId);
  return { entry, widget: clone };
}

function deleteWidget(streamerId, widgetId) {
  const entry = _ensure(streamerId);
  const idx = entry.config.widgets.findIndex(w => w.id === widgetId);
  if (idx === -1) throw new Error('Widget not found');
  entry.config.widgets.splice(idx, 1);
  for (const mode of ['portrait', 'landscape']) {
    if (entry.config.layout[mode]) delete entry.config.layout[mode][widgetId];
  }
  entry.config.widgetOrder = entry.config.widgetOrder.filter(id => id !== widgetId);
  delete entry.state.widgetState[widgetId];
  save();
  _scheduleEmit(streamerId);
  return entry;
}

function resetLayout(streamerId, mode, widgetId) {
  if (mode !== 'portrait' && mode !== 'landscape') throw new Error('Invalid mode');
  const entry = _ensure(streamerId);
  if (!entry.config.layout[mode]) entry.config.layout[mode] = {};
  if (widgetId) {
    const w = entry.config.widgets.find(x => x.id === widgetId);
    if (!w) throw new Error('Widget not found');
    entry.config.layout[mode][widgetId] = _defaultLayoutFor(w.type, mode);
  } else {
    for (const w of entry.config.widgets) {
      entry.config.layout[mode][w.id] = _defaultLayoutFor(w.type, mode);
    }
  }
  save();
  _scheduleEmit(streamerId);
  return entry;
}

function reset(streamerId, widgetId = 'all') {
  const entry = _ensure(streamerId);
  if (widgetId === 'all') {
    for (const id of Object.keys(entry.state.widgetState)) {
      entry.state.widgetState[id] = {};
    }
  } else {
    if (entry.state.widgetState[widgetId]) entry.state.widgetState[widgetId] = {};
  }
  save();
  _scheduleEmit(streamerId);
  return entry;
}

/**
 * Reset stream-accumulated counters when a fresh stream starts. Wipes
 * widgetState only for widgets where `persist=false` (the default). Widgets
 * the streamer explicitly opted into persistence on keep their running totals
 * across stream sessions. Called from /api/streamer/connect on successful
 * TikTok connection (manual stream start — not auto-reconnects).
 *
 * Returns { resetIds: [...] } so the caller can log/notify how many
 * widgets actually got cleared.
 */
function resetForNewStream(streamerId) {
  const entry = _ensure(streamerId);
  const resetIds = [];
  for (const w of entry.config.widgets || []) {
    // Skip widgets that haven't ever held state.
    if (!entry.state.widgetState[w.id]) continue;
    // Honor the explicit "persist across streams" opt-in.
    if (w.persist) continue;
    // Only counter-bearing types need reset. winCard/topLikers/gameEmbed have
    // no running totals, so clearing them is a harmless no-op but skip to
    // keep the resetIds log focused on what actually mattered.
    if (w.type !== 'giftGoal' && w.type !== 'followGoal' && w.type !== 'milestone' && w.type !== 'likeHint') continue;
    entry.state.widgetState[w.id] = {};
    resetIds.push(w.id);
  }
  if (resetIds.length) {
    save();
    _scheduleEmitImmediate(streamerId);
  }
  return { resetIds };
}

/**
 * Manually set the current value for a stateful widget (giftGoal, followGoal,
 * or milestone). For goal bars this sets `current`; for milestones it sets
 * `milestoneCounter` AND realigns `milestoneLastFireAt` to the same value
 * so no backlog milestones fire from past thresholds.
 */
function setWidgetCurrent(streamerId, widgetId, rawValue) {
  const entry = _ensure(streamerId);
  const w = entry.config.widgets.find(x => x.id === widgetId);
  if (!w) return { ok: false, error: 'Widget not found' };
  const value = Math.max(0, Math.floor(Number(rawValue)));
  if (!Number.isFinite(value)) return { ok: false, error: 'Invalid value' };
  const st = entry.state.widgetState[w.id] = entry.state.widgetState[w.id] || {};
  if (w.type === 'giftGoal' || w.type === 'followGoal') {
    st.current = Math.min(Number(w.target) || value, value);
    st.lastChangeAt = Date.now();
  } else if (w.type === 'milestone' || w.type === 'likeHint') {
    st.milestoneCounter = value;
    // Snap lastFireAt to the latest multiple of `every` ≤ value so the next
    // real event doesn't replay every backlog milestone since 0.
    const step = Math.max(1, Number(w.every) || 1);
    st.milestoneLastFireAt = Math.floor(value / step) * step;
  } else {
    return { ok: false, error: 'Widget type does not support current' };
  }
  save();
  _scheduleEmitImmediate(streamerId);
  return { ok: true, value: (w.type === 'milestone' || w.type === 'likeHint') ? st.milestoneCounter : st.current };
}

function testFire(streamerId, widgetId) {
  const entry = _ensure(streamerId);
  const w = entry.config.widgets.find(x => x.id === widgetId);
  if (!w) return { ok: false, error: 'Widget not found' };
  if (w.type === 'giftGoal' || w.type === 'followGoal') {
    const inc = Math.max(1, Math.floor(w.target * 0.1));
    const st = entry.state.widgetState[w.id] = entry.state.widgetState[w.id] || { current: 0 };
    st.current = Math.min(w.target, (Number(st.current) || 0) + inc);
    _scheduleEmitImmediate(streamerId);
    return { ok: true, added: inc };
  }
  if (w.type === 'milestone') {
    _emitMilestone(streamerId, {
      widgetId: w.id, count: w.every, source: w.source,
      label: w.label, color: w.color, soundUrl: w.soundUrl,
      nickname: 'Test User', username: 'testuser',
    });
    return { ok: true, fired: w.every };
  }
  if (w.type === 'likeHint') {
    // Visual preview only (mirrors milestone test-fire): show a sample masked
    // reveal so the streamer can style/position the burst. Does NOT touch a
    // live game session — real reveals come from actual likes.
    fireLikeHintBurst(streamerId, { widgetId: w.id, text: 'H I _ _ _', mode: 'letters' });
    return { ok: true, fired: w.every };
  }
  return { ok: false, error: 'Widget type does not support test-fire' };
}

// ── Music Credits playback state ─────────────────────────────────────
function _musicWidgetState(entry, widgetId) {
  const st = entry.state.widgetState[widgetId] = entry.state.widgetState[widgetId] || {};
  if (!Number.isFinite(st.musicCurrent)) st.musicCurrent = 0;
  if (typeof st.musicPlaying !== 'boolean') st.musicPlaying = false;
  return st;
}

function _musicEffectivePlaylist(w) {
  const list = Array.isArray(w.playlist) ? w.playlist : [];
  if (!w.shuffle) return list;
  // Deterministic shuffle keyed by the playlist order: rebuild a shuffled copy
  // once per playlist change is enough for a simple stream background player.
  // We shuffle in place of a copy so the original config order is preserved.
  const copy = list.map((t, i) => ({ t, i }));
  // Fisher-Yates with a simple seeded-ish swap based on indices.
  for (let i = copy.length - 1; i > 0; i--) {
    const j = (i * 37 + 13) % (i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.map(x => x.t);
}

function _musicCurrentTrack(entry, w) {
  const st = _musicWidgetState(entry, w.id);
  const list = _musicEffectivePlaylist(w);
  if (!list.length) return null;
  const idx = Math.max(0, Math.min(list.length - 1, Math.floor(st.musicCurrent) || 0));
  return { track: list[idx], index: idx, total: list.length };
}

function _musicStatePayload(entry, w) {
  const st = _musicWidgetState(entry, w.id);
  const current = _musicCurrentTrack(entry, w);
  let title = w.nowPlaying || '';
  let source = w.nowPlayingSource || 'pretzel';
  if (w.autoNowPlaying && current && current.track) {
    title = current.track.title;
    source = current.track.source;
  }
  return {
    widgetId: w.id,
    playing: !!st.musicPlaying,
    currentIndex: current ? current.index : 0,
    total: current ? current.total : 0,
    title,
    source,
    url: current && current.track ? current.track.url : '',
  };
}

function musicControl(streamerId, widgetId, action, payload = {}) {
  const entry = _ensure(streamerId);
  const w = entry.config.widgets.find(x => x.id === widgetId);
  if (!w) return { ok: false, error: 'Widget not found' };
  if (w.type !== 'musicCredits') return { ok: false, error: 'Not a music widget' };
  const st = _musicWidgetState(entry, widgetId);
  const list = _musicEffectivePlaylist(w);
  const total = list.length;

  switch (action) {
    case 'play':
      st.musicPlaying = true;
      if (Number.isFinite(payload.index) && payload.index >= 0 && payload.index < total) {
        st.musicCurrent = payload.index;
      }
      break;
    case 'pause':
      st.musicPlaying = false;
      break;
    case 'toggle':
      st.musicPlaying = !st.musicPlaying;
      if (!st.musicPlaying && Number.isFinite(payload.index) && payload.index >= 0 && payload.index < total) {
        st.musicCurrent = payload.index;
      }
      break;
    case 'next': {
      if (!total) {
        st.musicPlaying = false;
      } else {
        const idx = (Math.floor(st.musicCurrent || 0) + 1) % total;
        st.musicCurrent = idx;
        if (w.repeat === 'off' && idx === 0) st.musicPlaying = false;
      }
      break;
    }
    case 'prev': {
      if (!total) {
        st.musicPlaying = false;
      } else {
        const idx = (Math.floor(st.musicCurrent || 0) - 1 + total) % total;
        st.musicCurrent = idx;
      }
      break;
    }
    case 'ended': {
      if (!total) {
        st.musicPlaying = false;
      } else if (w.repeat === 'one') {
        // Keep same index; overlay will replay.
      } else {
        const idx = (Math.floor(st.musicCurrent || 0) + 1) % total;
        st.musicCurrent = idx;
        if (w.repeat === 'off' && idx === 0) st.musicPlaying = false;
      }
      break;
    }
    case 'seek':
      if (Number.isFinite(payload.index) && payload.index >= 0 && payload.index < total) {
        st.musicCurrent = payload.index;
      }
      break;
    default:
      return { ok: false, error: 'Unknown action' };
  }

  save();
  _emitMusicState(streamerId, w);
  return { ok: true, state: _musicStatePayload(entry, w) };
}

function getMusicState(streamerId, widgetId) {
  const entry = _ensure(streamerId);
  const w = entry.config.widgets.find(x => x.id === widgetId);
  if (!w || w.type !== 'musicCredits') return null;
  return _musicStatePayload(entry, w);
}

function _emitMusicState(streamerId, w) {
  if (!io) return;
  const entry = _ensure(streamerId);
  io.to(ROOM(streamerId)).emit('music-state', _musicStatePayload(entry, w));
}

// ── Event application ───────────────────────────────────────────────
function applyGift({ streamerId, coins, user }) {
  if (!streamerId) return;
  const c = Math.max(0, Math.floor(Number(coins) || 0));
  if (!c) return;
  const entry = _ensure(streamerId);
  let touched = false;
  for (const w of entry.config.widgets) {
    if (!w.enabled) continue;
    if (w.type === 'giftGoal') {
      const st = entry.state.widgetState[w.id] = entry.state.widgetState[w.id] || { current: 0 };
      st.current = (Number(st.current) || 0) + c;
      st.lastChangeAt = Date.now();
      if (w.persist) save();
      touched = true;
    } else if (w.type === 'milestone' && w.source === 'giftCoins') {
      _milestoneAdd(streamerId, entry, w, c, user);
      touched = true;
    }
  }
  if (touched) _scheduleEmit(streamerId);
}

function applyLike({ streamerId, count, user }) {
  if (!streamerId) return;
  const c = Math.max(0, Math.floor(Number(count) || 0));
  if (!c) return;
  const entry = _ensure(streamerId);
  let touched = false;
  for (const w of entry.config.widgets) {
    if (!w.enabled) continue;
    if (w.type === 'followGoal' && w.source === 'like') {
      const st = entry.state.widgetState[w.id] = entry.state.widgetState[w.id] || { current: 0 };
      st.current = (Number(st.current) || 0) + c;
      st.lastChangeAt = Date.now();
      if (w.persist) save();
      touched = true;
    } else if (w.type === 'milestone' && w.source === 'like') {
      _milestoneAdd(streamerId, entry, w, c, user);
      touched = true;
    } else if (w.type === 'likeHint' && w.source === 'like') {
      _likeHintAdd(streamerId, entry, w, c, user);
      touched = true;
    }
  }
  if (touched) _scheduleEmit(streamerId);
}

function applyFollow({ streamerId, user }) {
  if (!streamerId) return;
  const entry = _ensure(streamerId);
  let touched = false;
  for (const w of entry.config.widgets) {
    if (!w.enabled) continue;
    if (w.type === 'followGoal' && w.source === 'follow') {
      const st = entry.state.widgetState[w.id] = entry.state.widgetState[w.id] || { current: 0 };
      st.current = (Number(st.current) || 0) + 1;
      st.lastChangeAt = Date.now();
      if (w.persist) save();
      touched = true;
    } else if (w.type === 'milestone' && w.source === 'follow') {
      _milestoneAdd(streamerId, entry, w, 1, user);
      touched = true;
    }
  }
  if (touched) _scheduleEmit(streamerId);
}

function applyShare({ streamerId, user }) {
  if (!streamerId) return;
  const entry = _ensure(streamerId);
  let touched = false;
  for (const w of entry.config.widgets) {
    if (!w.enabled) continue;
    if (w.type === 'followGoal' && w.source === 'share') {
      const st = entry.state.widgetState[w.id] = entry.state.widgetState[w.id] || { current: 0 };
      st.current = (Number(st.current) || 0) + 1;
      st.lastChangeAt = Date.now();
      if (w.persist) save();
      touched = true;
    } else if (w.type === 'milestone' && w.source === 'share') {
      _milestoneAdd(streamerId, entry, w, 1, user);
      touched = true;
    }
  }
  if (touched) _scheduleEmit(streamerId);
}

function _milestoneAdd(streamerId, entry, w, delta, user) {
  const st = entry.state.widgetState[w.id] = entry.state.widgetState[w.id]
    || { milestoneCounter: 0, milestoneLastFireAt: 0 };
  st.milestoneCounter = (Number(st.milestoneCounter) || 0) + delta;
  const step = w.every;
  if (step <= 0) return;
  const crossings = Math.floor(st.milestoneCounter / step) - Math.floor((Number(st.milestoneLastFireAt) || 0) / step);
  if (crossings <= 0) return;
  const firedAt = Math.floor(st.milestoneCounter / step) * step;
  st.milestoneLastFireAt = firedAt;
  _emitMilestone(streamerId, {
    widgetId: w.id, count: firedAt, source: w.source,
    label: w.label, color: w.color, soundUrl: w.soundUrl,
    nickname: user?.displayName || user?.username || '',
    username: user?.username || '',
  });
}

// Like-for-Hint accrual. Same crossing math as _milestoneAdd, but each
// crossing fires the hint into the streamer's active game via the sink. A
// single like burst can cross more than one threshold (e.g. a 12000-like
// spike over a 5000 step) — fire one hint per crossing so the reveal count
// stays honest. The overlay burst is NOT fired here: the game answers each
// reveal-hint with what it actually revealed (a word, or masked letters), and
// that content drives the burst via fireLikeHintBurst().
function _likeHintAdd(streamerId, entry, w, delta, user) {
  const st = entry.state.widgetState[w.id] = entry.state.widgetState[w.id]
    || { milestoneCounter: 0, milestoneLastFireAt: 0 };
  st.milestoneCounter = (Number(st.milestoneCounter) || 0) + delta;
  const step = w.every;
  if (step <= 0) return;
  const crossings = Math.floor(st.milestoneCounter / step) - Math.floor((Number(st.milestoneLastFireAt) || 0) / step);
  if (crossings <= 0) return;
  const firedAt = Math.floor(st.milestoneCounter / step) * step;
  st.milestoneLastFireAt = firedAt;

  for (let i = 0; i < crossings; i++) {
    if (typeof likeHintSink === 'function') {
      try {
        likeHintSink(streamerId, {
          widgetId: w.id,
          count: firedAt,
          handle: getHandle(streamerId) || null,
        });
      } catch (_) { /* sink failure must never break like accounting */ }
    }
  }
}

// Flash a Like-for-Hint reveal on the streamer's persistent hint bar. `text`
// is the game-provided content — a revealed word ("OCEAN  #2") or a masked
// "T H _ _ _" letter progression. The overlay shows it over the progress bar
// for a few seconds; in letter mode it also keeps the mask pinned until the
// next reveal.
function fireLikeHintBurst(streamerId, { widgetId, text, mode } = {}) {
  if (!io || !streamerId) return;
  const entry = goalsByStreamer[streamerId];
  const w = entry?.config?.widgets?.find(x => x.id === widgetId && x.type === 'likeHint');
  // Respect the widget's burst toggle (and only fire for a real likeHint
  // widget the streamer still has configured).
  if (!w || w.burst === false) return;
  const clean = String(text || '').slice(0, 120);
  if (!clean) return;
  io.to(ROOM(streamerId)).emit('likehint-flash', {
    widgetId: w.id,
    text: clean,
    mode: mode || null,
    soundUrl: w.soundUrl || '',
  });
}

function _emitMilestone(streamerId, payload) {
  if (!io) return;
  io.to(ROOM(streamerId)).emit('milestone-fire', payload);
}

// ── Live drag / order / clear ───────────────────────────────────────
function broadcastPositionPreview(streamerId, { mode, widgetId, x, y, anchor }) {
  if (!io || !streamerId) return;
  if (mode !== 'portrait' && mode !== 'landscape') return;
  if (!widgetId) return;
  io.to(ROOM(streamerId)).emit('position-preview', {
    mode, widgetId,
    x: _clampPosPct(x, 50),
    y: _clampPosPct(y, 50),
    anchor: VALID_ANCHORS.has(anchor) ? anchor : undefined,
  });
}

function broadcastOrderPreview(streamerId, rawOrder) {
  if (!io || !streamerId) return;
  const entry = _ensure(streamerId);
  io.to(ROOM(streamerId)).emit('order-preview', {
    widgetOrder: _validateOrder(rawOrder, entry.config.widgets),
  });
}

function broadcastClearWinner(streamerId, widgetId) {
  if (!io || !streamerId) return;
  io.to(ROOM(streamerId)).emit('winner-clear', { streamerId, widgetId: widgetId || null, at: Date.now() });
}

// ── Pookie Tok (paid stream messages) ───────────────────────────────
// Renders into the streamer's pookieTok widget host (or a fixed top-center
// fallback if none is enabled). Broadcast over the goals room the overlay joins.
function emitPookieTok(streamerId, payload) {
  if (!io || !streamerId || !payload) return;
  io.to(ROOM(streamerId)).emit('pookie-tok', payload);
}

function emitPookieTokHide(streamerId, id) {
  if (!io || !streamerId) return;
  io.to(ROOM(streamerId)).emit('pookie-tok-hide', { id });
}

// ── Game Vote ───────────────────────────────────────────────────────
// One event carries the whole vote surface (phase + ballot + tallies + the
// idle term countdown). src/game-vote.js owns the state and calls this on
// every change; the overlay just renders whatever it last received. Sent as a
// full snapshot rather than deltas so a browser source that reconnects
// mid-vote is instantly correct.
function emitGameVote(streamerId, payload) {
  if (!io || !streamerId || !payload) return;
  io.to(ROOM(streamerId)).emit('game-vote-update', payload);
}

// Every enabled gameVote widget on this streamer's overlay. game-vote.js runs
// one vote per streamer and mirrors it into each widget instance, so a streamer
// can show the same vote in two places (e.g. portrait + a landscape corner).
function getGameVoteWidgets(streamerId) {
  if (!streamerId) return [];
  const entry = _ensure(streamerId);
  return entry.config.widgets.filter(w => w.type === 'gameVote' && w.enabled);
}

// ── Emit / throttle ─────────────────────────────────────────────────
function _scheduleEmit(streamerId) {
  if (!io) return;
  if (_emitTimers.has(streamerId)) {
    _pendingEmit.set(streamerId, true);
    return;
  }
  io.to(ROOM(streamerId)).emit('goal-update', snapshot(streamerId));
  _emitTimers.set(streamerId, setTimeout(() => {
    const wasPending = _pendingEmit.get(streamerId);
    _pendingEmit.delete(streamerId);
    _emitTimers.delete(streamerId);
    if (wasPending) _scheduleEmit(streamerId);
  }, EMIT_THROTTLE_MS));
}

function _scheduleEmitImmediate(streamerId) {
  if (!io) return;
  io.to(ROOM(streamerId)).emit('goal-update', snapshot(streamerId));
}

function clearStreamer(streamerId) {
  if (goalsByStreamer[streamerId]) {
    delete goalsByStreamer[streamerId];
    save();
  }
}

load();

module.exports = {
  // wiring
  setIo, setHandleResolver, setLikeHintSink,
  // reads
  getForStreamer, snapshot,
  // mutations
  setConfig, addWidget, duplicateWidget, deleteWidget, resetLayout, reset, resetForNewStream, testFire, setWidgetCurrent,
  musicControl, getMusicState,
  migrateLayoutScope,
  // events
  applyGift, applyLike, applyFollow, applyShare,
  fireLikeHintBurst,
  // live broadcasts
  broadcastPositionPreview, broadcastOrderPreview, broadcastClearWinner,
  emitPookieTok, emitPookieTokHide,
  emitGameVote, getGameVoteWidgets,
  // lifecycle
  clearStreamer,
  ROOM,
  // constants exposed for UI / docs
  VALID_WIDGET_TYPES,
  STREAMER_WIDGET_TYPES,
  PRO_WIDGET_TYPES,
  isStreamerWidgetType,
  isProOnlyWidgetType,
  VALID_FOLLOW_SOURCES: [...VALID_FOLLOW_SOURCES],
  VALID_MILESTONE_SOURCES: [...VALID_MILESTONE_SOURCES],
  VALID_ANCHORS: [...VALID_ANCHORS],
  VALID_COLORS: [...VALID_COLORS],
  VALID_STYLES: [...VALID_STYLES],
  VALID_PADDINGS: [...VALID_PADDINGS],
  VALID_PERSISTENCE: [...VALID_PERSISTENCE],
  VALID_WIN_SCOPES: [...VALID_WIN_SCOPES],
  VALID_WIN_LIST_MODES: [...VALID_WIN_LIST_MODES],
  VALID_VOTE_TERM_UNITS: [...VALID_VOTE_TERM_UNITS],
  STREAMER_GAME_IDS: [...STREAMER_GAME_IDS],
  MAX_VOTE_CANDIDATES,
  MAX_WIDGETS_PER_STREAMER,
};
