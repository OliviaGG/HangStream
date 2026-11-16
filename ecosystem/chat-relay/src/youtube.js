const WebSocket = require('ws');
const relay = require('./relay');

let ws = null;
let reconnectTimer = null;
let wsUrl = null;

function initialize(url) {
  wsUrl = url;
  connect();
}

function connect() {
  if (ws) {
    try { ws.close(); } catch (e) {}
  }

  console.log(`[YouTube] Connecting to Streamer.bot at ${wsUrl}...`);

  try {
    ws = new WebSocket(wsUrl);
  } catch (err) {
    console.error('[YouTube] Connection error:', err.message);
    scheduleReconnect();
    return;
  }

  ws.on('open', () => {
    console.log('[YouTube] Connected to Streamer.bot');
    relay.broadcastStatus('youtube', true);
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    // Subscribe to Streamer.bot events
    const subscribeMsg = {
      request: 'Subscribe',
      id: 'relay-broadcast-sub',
      events: {
        YouTube: [
          'Message',
          'SuperChat',
          'SuperSticker',
          'NewSponsor',
          'MemberMilestone',
          'MemberGift'
        ]
      }
    };
    ws.send(JSON.stringify(subscribeMsg));
  });

  ws.on('message', (data) => {
    try {
      const event = JSON.parse(data.toString());
      handleStreamerBotEvent(event);
    } catch (err) {
      console.error('[YouTube] Parse error:', err.message);
    }
  });

  ws.on('close', () => {
    console.log('[YouTube] Disconnected from Streamer.bot');
    relay.broadcastStatus('youtube', false);
    scheduleReconnect();
  });

  ws.on('error', (err) => {
    console.error('[YouTube] WebSocket error:', err.message);
    relay.broadcastStatus('youtube', false);
  });
}

function handleStreamerBotEvent(event) {
  // Streamer.bot WebSocket event format:
  // { event: { source: "YouTube", type: "Message" }, data: { ... } }
  if (!event.event || !event.data) return;

  const source = event.event.source;
  const type = event.event.type;

  if (source !== 'YouTube') return;

  if (type === 'Message') {
    handleChatMessage(event.data);
  } else if (type === 'SuperChat' || type === 'SuperSticker') {
    handleSuperChat(event.data);
  } else if (type === 'NewSponsor' || type === 'MemberMilestone' || type === 'MemberGift') {
    handleMemberEvent(event.data, type);
  }
}

function handleChatMessage(data) {
  // Streamer.bot wraps YouTube messages: data.message is an object { message: "text", eventId, ... }
  let message;
  if (typeof data.message === 'object' && data.message !== null) {
    message = data.message.message || data.message.text || '';
  } else {
    message = data.message || data.text || '';
  }
  if (!message) return;

  const user = data.user || {};
  const username = user.name || user.login || data.userName || 'unknown';
  const displayName = user.displayName || user.name || username;
  const profilePic = user.profileImageUrl || user.profileImage || data.userProfileImage || null;
  const userId = user.id || data.userId || username;
  const isSubscriber = !!(user.isMember || user.isSponsor || data.isMember);
  const isModerator = !!(user.isModerator);

  relay.handleMessage({
    platform: 'youtube',
    user: {
      id: String(userId),
      username: username,
      displayName: displayName,
      profilePic: profilePic,
      isFollowing: true, // YouTube chatters are considered following
      isSubscriber: isSubscriber,
      isModerator: isModerator,
      badges: []
    },
    message: message
  });
}

function handleSuperChat(data) {
  let message;
  if (typeof data.message === 'object' && data.message !== null) {
    message = data.message.message || data.message.text || '';
  } else {
    message = data.message || '';
  }
  if (!message) message = `SuperChat: ${data.amount || ''}`;
  const user = data.user || {};

  relay.handleMessage({
    platform: 'youtube',
    user: {
      id: String(user.id || data.userId || 'unknown'),
      username: user.name || data.userName || 'unknown',
      displayName: user.displayName || user.name || data.userName || 'unknown',
      profilePic: user.profileImageUrl || null,
      isSubscriber: true,
      badges: ['superchat']
    },
    message: message
  });
}

function handleMemberEvent(data, type) {
  const user = data.user || {};
  const username = user.name || user.login || data.userName || 'unknown';
  const displayName = user.displayName || user.name || username;
  const profilePic = user.profileImageUrl || user.profileImage || data.userProfileImage || null;
  const userId = user.id || data.userId || username;

  let message;
  if (type === 'NewSponsor') {
    message = 'became a channel member';
  } else if (type === 'MemberMilestone') {
    const months = data.memberMonths || data.months || '';
    message = months ? `hit ${months}-month member milestone` : 'hit a member milestone';
  } else if (type === 'MemberGift') {
    const count = data.giftCount || data.count || 1;
    message = `gifted ${count} membership${count > 1 ? 's' : ''}`;
  } else {
    message = 'joined';
  }

  relay.handleJoin({
    platform: 'youtube',
    user: {
      id: String(userId),
      username: username,
      displayName: displayName,
      profilePic: profilePic,
      badges: ['subscriber']
    },
    message: message
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log('[YouTube] Reconnecting in 5 seconds...');
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
