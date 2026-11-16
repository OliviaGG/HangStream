/**
 * normalize.js — map TikFinity's webcast-relayed events into the shape
 * the /stream game pages expect.
 *
 * TikFinity wraps TikTok Webcast events differently across builds; this
 * normalizer is deliberately permissive so it still classifies chat when
 * field names drift. Principles:
 *
 *  - Try the envelope event name FIRST (fast path when it's 'chat', 'gift',
 *    'social', 'member', etc).
 *  - Fall back to field-shape detection when the name isn't explicit —
 *    if any text-like field is present, treat as chat.
 *  - For truly unknown events, still emit a best-effort payload on
 *    'raw-event' so nothing is silently dropped.
 */

function pickFirst(...values) {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function unwrapPayload(raw = {}) {
  if (raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object') {
    return { envelope: raw, payload: raw.data };
  }
  return { envelope: raw, payload: raw };
}

function normalizeUser(rawUser = {}, root = {}) {
  const merged = { ...root, ...rawUser };
  return {
    id: pickFirst(
      merged.id, merged.userId, merged.user_id,
      merged.uniqueId, merged.unique_id,
      merged.secUid, merged.sec_uid
    ),
    username: pickFirst(
      merged.username, merged.uniqueId, merged.unique_id,
      merged.userName, merged.user_name
    ),
    displayName: pickFirst(
      merged.displayName, merged.nickname, merged.nickName,
      merged.userNickname, merged.user_nickname,
      merged.username, merged.uniqueId
    ),
    profilePictureUrl: pickFirst(
      merged.profilePictureUrl, merged.profileImageUrl,
      merged.avatarUrl, merged.avatar, merged.photo, merged.image,
      merged.profilePicture, merged.profileImage
    ),
  };
}

function eventName(raw) {
  const { envelope, payload } = unwrapPayload(raw || {});
  return String(pickFirst(
    envelope.event, envelope.eventType, envelope.type,
    payload.event, payload.eventType, payload.type,
    payload.messageType, payload.msgType, payload.action
  ) || '').toLowerCase();
}

function isJoinAnnouncementText(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  return /(^|\s)joined\s+(?:the\s+)?(?:stream|live)\.?$/.test(text);
}

// Classify by event name first (fast path), then by payload shape.
function detectEventKind(raw) {
  const { payload } = unwrapPayload(raw || {});
  const name = eventName(raw);

  // Events we deliberately swallow — not user-facing.
  if (name === 'config' || name === 'connected' || name === 'ping' || name === 'pong' || name === 'heartbeat') return 'ignore';
  if (name === 'viewerlist' || name === 'viewerList' || name === 'roomuser' || name === 'roomUser') return 'ignore';
  if (name === 'streamend' || name === 'disconnect' || name === 'error') return 'ignore';

  // Explicit event-name classification.
  if (name === 'chat' || name === 'comment' || name.includes('chat') || name.includes('comment')) return 'chat';
  if (name === 'gift' || name.includes('gift')) return 'gift';
  if (name === 'like' || name.includes('like')) return 'like';
  if (name === 'follow' || name.includes('follow')) return 'follow';
  if (name === 'share' || name.includes('share')) return 'share';
  if (name === 'member' || name === 'join' || name.includes('join') || name.includes('member')) return 'join';
  if (name === 'subscribe' || name === 'sub' || name.includes('subscrib')) return 'subscribe';
  if (name === 'emote' || name === 'sticker' || name.includes('emote') || name.includes('sticker')) return 'emote';
  // `social` is TikFinity's combined follow/share envelope; inspect payload.
  if (name === 'social') {
    const action = String(pickFirst(payload.displayType, payload.description, payload.label) || '').toLowerCase();
    if (action.includes('follow')) return 'follow';
    if (action.includes('share')) return 'share';
    return 'follow';
  }

  // Shape-based fallback — classify by which fields the payload carries.
  if (isJoinAnnouncementText(pickFirst(payload.message, payload.text, payload.content, payload.comment, payload.label))) return 'join';
  if (pickFirst(payload.comment, payload.message, payload.text, payload.content)) return 'chat';
  if (pickFirst(payload.giftName, payload.gift_name, payload.giftId, payload.gift_id, payload.diamondCount)) return 'gift';
  if (pickFirst(payload.likeCount, payload.totalLikeCount)) return 'like';

  return 'unknown';
}

function normalizeChat(raw) {
  const { envelope, payload } = unwrapPayload(raw || {});
  const user = normalizeUser(payload.user || payload.from || payload.author || {}, payload);
  const message = pickFirst(payload.comment, payload.message, payload.text, payload.content);
  if (!message) return null;
  return {
    platform: 'tiktok',
    message: String(message),
    user,
    isJoin: false,
    timestamp: Number(pickFirst(payload.createTime, envelope.createTime, Date.now())) || Date.now(),
    source: 'tickfinity',
  };
}

function normalizeEngagement(raw, type) {
  const { envelope, payload } = unwrapPayload(raw || {});
  const user = normalizeUser(payload.user || payload.from || payload.author || {}, payload);
  const normalized = {
    platform: 'tiktok',
    type,
    user,
    timestamp: Number(pickFirst(payload.createTime, envelope.createTime, Date.now())) || Date.now(),
    source: 'tickfinity',
  };

  if (type === 'gift') {
    normalized.giftName = pickFirst(
      payload.giftName, payload.gift_name, payload.name,
      payload.repeatEnd ? payload.describe : null
    );
    normalized.giftCount = Number(pickFirst(
      payload.repeatCount, payload.repeat_count, payload.count,
      payload.giftCount, payload.gift_count, 1
    )) || 1;
    normalized.diamondCount = Number(pickFirst(
      payload.diamondCount, payload.diamond_count, payload.coins,
      0
    )) || 0;
  }

  if (type === 'like') {
    normalized.count = Number(pickFirst(payload.likeCount, payload.totalLikeCount, payload.count, 1)) || 1;
  }

  return normalized;
}

function normalizeTickfinityEvent(raw) {
  const kind = detectEventKind(raw || {});
  if (kind === 'ignore') return null;

  if (kind === 'chat') {
    const normalized = normalizeChat(raw);
    return normalized ? { channel: 'chat-message', kind: 'chatMessage', payload: normalized } : null;
  }

  if (['gift', 'follow', 'share', 'like', 'join', 'subscribe', 'emote'].includes(kind)) {
    return {
      channel: 'engagement',
      kind: 'engagement',
      payload: normalizeEngagement(raw, kind),
    };
  }

  // Unknown: still emit on 'raw-event' so nothing is silently dropped.
  // Preview surfaces the original event name so the dashboard can show
  // something more useful than "unknown raw event".
  return {
    channel: 'raw-event',
    kind: 'unknown',
    payload: {
      kind: 'unknown',
      originalEvent: eventName(raw) || '(no event name)',
      payload: raw,
      timestamp: Date.now(),
      source: 'tickfinity',
    },
  };
}

function eventPreview(normalized) {
  if (!normalized) return null;
  if (normalized.channel === 'chat-message') {
    const u = normalized.payload.user || {};
    return `${u.displayName || u.username || 'user'}: ${normalized.payload.message}`;
  }
  if (normalized.channel === 'engagement') {
    const u = normalized.payload.user || {};
    const who = u.displayName || u.username || 'user';
    const t = normalized.payload.type;
    if (t === 'gift') {
      return `${who} sent ${normalized.payload.giftCount || 1} ${normalized.payload.giftName || 'gift'}`;
    }
    if (t === 'like') return `${who} liked (${normalized.payload.count || 1})`;
    return `${who} ${t}`;
  }
  if (normalized.channel === 'raw-event') {
    return `unknown TikFinity event: ${normalized.payload.originalEvent}`;
  }
  return 'raw event';
}

module.exports = { normalizeTickfinityEvent, eventPreview };
