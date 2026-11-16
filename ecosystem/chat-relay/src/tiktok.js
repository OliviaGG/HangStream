const WebSocket = require('ws');
const relay = require('./relay');
const avatarCache = require('./avatar-cache');

let ws = null;
let reconnectTimer = null;
let wsUrl = null;

function initialize(url, _username) {
  wsUrl = url;
  connect();
}

function connect() {
  if (ws) {
    try { ws.close(); } catch (e) {}
  }

  console.log(`[TikTok] Connecting to TikFinity at ${wsUrl}...`);

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.error('[TikTok] Connection error:', err.message);
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    console.log('[TikTok] Connected to TikFinity');
    relay.broadcastStatus('tiktok', true);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  });

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());
      handleTikFinityEvent(event);
    } catch (err) {
      console.error('[TikTok] Parse error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('[TikTok] Disconnected from TikFinity');
    relay.broadcastStatus('tiktok', false);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[TikTok] WebSocket error:', err.message);
    relay.broadcastStatus('tiktok', false);
  });
}

function handleTikFinityEvent(event) {
  // TikFinity sends events in various formats depending on trigger configuration
  // Common structures:
  // { event: "chat", data: { ... } }
  // { type: "chat", ... }
  // Direct message objects from TikFinity webhooks

  let msgData = null;

  if (event.event === 'chat' || event.type === 'chat') {
    msgData = event.data || event;
  } else if (event.comment || event.message || event.text) {
    msgData = event;
  } else if (event.data && (event.data.comment || event.data.message)) {
    msgData = event.data;
  }

  // Handle like events
  if (!msgData && (event.event === 'like' || event.type === 'like')) {
    const likeData = event.data || event;
    // Always use uniqueId (TikTok username) as primary stable ID to prevent duplicates.
    // The numeric userId from TikFinity is inconsistently available, causing duplicate player entries.
    const likeUserId = likeData.uniqueId || likeData.userId || likeData.username || 'unknown';
    relay.handleEngagement({
      type: 'like',
      platform: 'tiktok',
      user: {
        id: String(likeUserId),
        username: likeData.uniqueId || likeData.username || 'unknown',
        displayName: likeData.nickname || likeData.displayName || likeData.uniqueId || 'unknown',
        profilePic: avatarCache.rewriteAvatarUrl('tiktok', likeUserId, likeData.profilePictureUrl || null)
      },
      count: likeData.likeCount || likeData.count || 1
    });
    return;
  }

  // Handle gift events
  if (!msgData && (event.event === 'gift' || event.type === 'gift')) {
    const giftData = event.data || event;
    const giftUserId = giftData.uniqueId || giftData.userId || giftData.username || 'unknown';
    // TikFinity can send diamondCount, diamonds, giftValue, coinValue, or repeatCount × diamondCount
    const diamonds = giftData.diamondCount || giftData.diamonds || giftData.giftValue || giftData.coinValue || giftData.repeatCount || 0;
    if (diamonds > 0) {
      relay.handleEngagement({
        type: 'gift',
        platform: 'tiktok',
        user: {
          id: String(giftUserId),
          username: giftData.uniqueId || giftData.username || 'unknown',
          displayName: giftData.nickname || giftData.displayName || giftData.uniqueId || 'unknown',
          profilePic: avatarCache.rewriteAvatarUrl('tiktok', giftUserId, giftData.profilePictureUrl || null)
        },
        diamondCount: diamonds,
        giftName: giftData.giftName || giftData.describe || 'Gift'
      });
      console.log(`[TikTok] Gift from ${giftData.uniqueId || giftData.username}: ${diamonds} diamonds (${giftData.giftName || 'unknown gift'})`);
    }
    return;
  }

  // Handle join events (viewer joins the live stream)
  if (!msgData && (event.event === 'member' || event.type === 'member' ||
      event.event === 'member_join' || event.type === 'member_join' ||
      event.event === 'join' || event.type === 'join' ||
      event.event === 'roomUser' || event.type === 'roomUser')) {
    const joinData = event.data || event;
    const joinUserId = joinData.uniqueId || joinData.userId || joinData.username || 'unknown';
    relay.handleJoin({
      platform: 'tiktok',
      user: {
        id: String(joinUserId),
        username: joinData.uniqueId || joinData.username || 'unknown',
        displayName: joinData.nickname || joinData.displayName || joinData.uniqueId || 'unknown',
        profilePic: avatarCache.rewriteAvatarUrl('tiktok', joinUserId, joinData.profilePictureUrl || null),
        badges: []
      }
    });
    return;
  }

  if (!msgData) return;

  const message = msgData.comment || msgData.message || msgData.text || '';
  if (!message) return;

  const username = msgData.uniqueId || msgData.username || msgData.userId || 'unknown';
  const displayName = msgData.nickname || msgData.displayName || msgData.uniqueId || username;
  const rawProfilePic = msgData.profilePictureUrl || msgData.avatarUrl || msgData.profilePic || null;
  // Always use uniqueId (TikTok username) as primary stable ID to prevent duplicates.
  // The numeric userId from TikFinity is inconsistently available across different event types.
  const userId = msgData.uniqueId || msgData.userId || username;
  const profilePic = avatarCache.rewriteAvatarUrl('tiktok', userId, rawProfilePic);

  // TikTok-specific badges
  const isFanClub = !!(msgData.isFanClubMember || msgData.isInFanClub || msgData.fanClub);
  const isSuperfan = !!(msgData.isSuperfan || msgData.topFan);
  const isFollowing = !!(msgData.isFollower || (msgData.followRole !== undefined && msgData.followRole >= 1));
  const isSubscriber = !!(msgData.isSubscriber);
  const isModerator = !!(msgData.isModerator || msgData.moderator || msgData.isRoomAdmin);

  relay.handleMessage({
    platform: 'tiktok',
    user: {
      id: String(userId),
      username: username,
      displayName: displayName,
      profilePic: profilePic,
      isFollowing: isFollowing,
      isSubscriber: isSubscriber,
      isFanClub: isFanClub,
      isSuperfan: isSuperfan,
      isModerator: isModerator,
      badges: []
    },
    message: message
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log('[TikTok] Reconnecting in 5 seconds...');
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}

function disconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (ws) {
    try { ws.close(); } catch (e) {}
    ws = null;
  }
}

function isConnected() {
  return ws && ws.readyState === WebSocket.OPEN;
}

function reconnect(newUrl) {
  if (newUrl) wsUrl = newUrl;
  disconnect();
  connect();
}

module.exports = { initialize, disconnect, isConnected, reconnect };
