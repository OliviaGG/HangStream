// Facebook Live comments connector.
//
// Reads live comments from a Facebook Live video via the Graph API
// Server-Sent Events stream (streaming-graph.facebook.com), falling back
// to Graph polling if the SSE stream won't stay up. Comments are fed into
// relay.handleMessage with platform 'facebook', so identity, cosmetics,
// TTS and game routing all work exactly like the other platforms.
//
// Configuration (env):
//   FACEBOOK_PAGE_TOKEN    — Page (or user) access token with live-video read access. Required.
//   FACEBOOK_LIVE_VIDEO_ID — optional; when unset the connector polls
//                            /me/live_videos and attaches to the active broadcast.
const relay = require('./relay');

const GRAPH = 'https://graph.facebook.com/v23.0';
const SSE_HOST = 'https://streaming-graph.facebook.com';
const COMMENT_FIELDS = 'id,message,created_time,from{id,name}';

let accessToken = null;
let pinnedVideoId = null;   // from env — skip live-video discovery when set
let activeVideoId = null;
let connected = false;
let stopped = true;
let sseAbort = null;
let retryTimer = null;
let pollTimer = null;
let sseFailures = 0;
let sseActive = false;
let stats = { comments: 0, anonymous: 0, lastCommentAt: null };

// Dedup across SSE reconnects and the polling fallback.
const seenComments = new Set();
const SEEN_CAP = 5000;

function initialize({ token, videoId } = {}) {
  accessToken = token || null;
  pinnedVideoId = videoId || null;
  if (!accessToken) {
    console.log('[Facebook] No FACEBOOK_PAGE_TOKEN set — connector idle');
    return;
  }
  stopped = false;
  console.log('[Facebook] Starting live-comments connector');
  start();
}

async function start() {
  if (stopped) return;
  clearTimeout(retryTimer);
  try {
    const videoId = pinnedVideoId || await findActiveLiveVideo();
    if (!videoId) {
      console.log('[Facebook] No active live video found — retrying in 30s');
      return scheduleRetry(30000);
    }
    activeVideoId = videoId;
    openSse(videoId);
  } catch (err) {
    console.error('[Facebook] Startup error:', err.message);
    scheduleRetry(30000);
  }
}

async function findActiveLiveVideo() {
  const url = `${GRAPH}/me/live_videos?fields=id,status,title,permalink_url&limit=10&access_token=${encodeURIComponent(accessToken)}`;
  const res = await fetch(url);
  const body = await res.json();
  if (body.error) throw new Error(`Graph API: ${body.error.message} (code ${body.error.code})`);
  const live = (body.data || []).find(v => v.status === 'LIVE');
  if (live) {
    console.log(`[Facebook] Found live video ${live.id}${live.title ? ` "${live.title}"` : ''}`);
    return live.id;
  }
  // Live Producer creates the video in UNPUBLISHED status before "Go live"
  // is pressed — surface that so testing isn't confusing.
  const pending = (body.data || []).find(v => v.status === 'UNPUBLISHED' || v.status === 'LIVE_NOW');
  if (pending) console.log(`[Facebook] Video ${pending.id} exists but status is ${pending.status} — waiting for broadcast to start`);
  return null;
}

function openSse(videoId) {
  if (stopped) return;
  sseAbort = new AbortController();
  const url = `${SSE_HOST}/${videoId}/live_comments?access_token=${encodeURIComponent(accessToken)}&comment_rate=one_per_two_seconds&fields=${encodeURIComponent(COMMENT_FIELDS)}`;
  console.log(`[Facebook] Opening SSE comment stream for video ${videoId}`);

  fetch(url, { signal: sseAbort.signal })
    .then(async (res) => {
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(`SSE HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
      }
      setConnected(true);
      sseActive = true;
      sseFailures = 0;
      let buf = '';
      for await (const chunk of res.body) {
        buf += Buffer.from(chunk).toString('utf8');
        let idx;
        while ((idx = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, idx).trim();
          buf = buf.slice(idx + 1);
          if (line.startsWith('data:')) handleSseData(line.slice(5).trim());
        }
      }
      // Stream ended cleanly — broadcast likely finished.
      throw new Error('stream ended');
    })
    .catch((err) => {
      if (stopped) return;
      sseActive = false;
      setConnected(false);
      if (err.name === 'AbortError') return;
      sseFailures++;
      console.error(`[Facebook] SSE stream error (${sseFailures}): ${err.message}`);
      if (sseFailures >= 3 && activeVideoId) {
        console.log('[Facebook] SSE unstable — switching to Graph polling fallback');
        startPolling(activeVideoId);
      } else {
        scheduleRetry(Math.min(5000 * sseFailures, 20000));
      }
    });
}

function handleSseData(json) {
  if (!json) return;
  let c;
  try { c = JSON.parse(json); } catch (e) { return; }
  emitComment(c);
}

function rememberSeen(id) {
  if (seenComments.has(id)) return false;
  seenComments.add(id);
  if (seenComments.size > SEEN_CAP) {
    for (const old of seenComments) {
      seenComments.delete(old);
      if (seenComments.size <= SEEN_CAP / 2) break;
    }
  }
  return true;
}

function emitComment(c) {
  if (!c || !c.id || !rememberSeen(c.id)) return;
  const message = (c.message || '').trim();
  if (!message) return;

  // Meta privacy rules can strip `from` for commenters who haven't
  // interacted with the app; funnel those into one shared anonymous
  // identity rather than fabricating a DB user per comment.
  const from = c.from || null;
  if (!from) stats.anonymous++;
  const user = from
    ? { id: String(from.id), username: from.name || 'Facebook viewer', displayName: from.name || 'Facebook viewer', profilePic: null, isFollowing: true, badges: [] }
    : { id: 'fb-anon', username: 'Facebook viewer', displayName: 'Facebook viewer', profilePic: null, isFollowing: true, badges: [] };

  stats.comments++;
  stats.lastCommentAt = Date.now();
  relay.handleMessage({ platform: 'facebook', user, message });
}

// ── Browser-bridge ingest ─────────────────────────────────────────────
// Comments forwarded by the Live Producer userscript (tools/facebook-live-bridge.user.js).
// Works with or without a Graph API token, so personal-profile streams
// (which the official API can't read) still reach the relay.
let ingestIdleTimer = null;

function ingest({ name, message, dedupKey } = {}) {
  const text = String(message || '').trim();
  const uname = String(name || '').trim().slice(0, 80);
  if (!text || !uname) return { ok: false, error: 'name and message required' };
  if (text.length > 500) return { ok: false, error: 'message too long' };

  // The userscript has no stable numeric user id — key identity by
  // normalized display name, same shape as other platform ids.
  const uid = 'name:' + uname.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!uid.slice(5)) return { ok: false, error: 'unusable name' };

  if (!rememberSeen('ingest:' + (dedupKey || `${uid}|${text}`))) return { ok: true, dup: true };

  stats.comments++;
  stats.lastCommentAt = Date.now();
  relay.handleMessage({
    platform: 'facebook',
    user: { id: uid, username: uname, displayName: uname, profilePic: null, isFollowing: true, badges: [] },
    message: text,
  });

  // Show "connected" while the bridge is actively feeding us; drop back
  // after 5 quiet minutes unless the Graph SSE path owns the status.
  setConnected(true);
  clearTimeout(ingestIdleTimer);
  ingestIdleTimer = setTimeout(() => { if (!activeVideoId) setConnected(false); }, 5 * 60 * 1000);
  return { ok: true };
}

// ── Polling fallback ──────────────────────────────────────────────────
function startPolling(videoId) {
  stopPolling();
  setConnected(true); // degraded but functional
  const poll = async () => {
    if (stopped) return;
    try {
      const url = `${GRAPH}/${videoId}/comments?fields=${encodeURIComponent(COMMENT_FIELDS)}&order=reverse_chronological&live_filter=no_filter&limit=25&access_token=${encodeURIComponent(accessToken)}`;
      const res = await fetch(url);
      const body = await res.json();
      if (body.error) throw new Error(body.error.message);
      // reverse_chronological gives newest first; emit oldest-first
      for (const c of (body.data || []).slice().reverse()) emitComment(c);
    } catch (err) {
      console.error('[Facebook] Poll error:', err.message);
      setConnected(false);
      stopPolling();
      sseFailures = 0; // give SSE another shot after a cooldown
      scheduleRetry(30000);
      return;
    }
    pollTimer = setTimeout(poll, 3500);
  };
  poll();
}

function stopPolling() {
  clearTimeout(pollTimer);
  pollTimer = null;
}

// ── Lifecycle helpers ─────────────────────────────────────────────────
function scheduleRetry(ms) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(start, ms);
}

function setConnected(v) {
  if (connected === v) return;
  connected = v;
  relay.broadcastStatus('facebook', v);
  console.log(`[Facebook] ${v ? 'Connected' : 'Disconnected'}`);
}

function disconnect() {
  stopped = true;
  sseActive = false;
  clearTimeout(retryTimer);
  stopPolling();
  if (sseAbort) { try { sseAbort.abort(); } catch (e) {} }
  setConnected(false);
}

function reconnect({ token, videoId } = {}) {
  disconnect();
  initialize({ token: token || accessToken, videoId: videoId !== undefined ? videoId : pinnedVideoId });
}

function isConnected() {
  return connected;
}

function status() {
  return {
    connected,
    videoId: activeVideoId,
    mode: pollTimer ? 'polling' : (sseActive ? 'sse' : (connected ? 'bridge' : 'idle')),
    comments: stats.comments,
    anonymousComments: stats.anonymous,
    lastCommentAt: stats.lastCommentAt,
  };
}

module.exports = { initialize, disconnect, reconnect, isConnected, status, ingest };
