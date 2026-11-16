/**
 * bridge-state.js — in-memory state for the Tycoon Stream Bridge.
 *
 * Two independent sources: TikFinity (local WS) and Cloud (wordgame.live).
 * Each has its own connection state + counters so the dashboard can show
 * both side-by-side. Only the `primary` source's events get relayed
 * downstream to /stream game-page consumers on :21420 (avoids duplicates).
 */

const DEFAULT_COUNTS = () => ({ raw: 0, chatMessage: 0, engagement: 0, unknown: 0 });
const DEFAULT_SOURCE = () => ({
  enabled: false,
  connected: false,
  url: '',
  lastEventAt: null,
  lastError: null,
  eventCounts: DEFAULT_COUNTS(),
  recentEvents: [],
});

const MAX_RECENT_EVENTS = 20;

const state = {
  startedAt: Date.now(),
  primary: 'tikfinity',              // 'tikfinity' | 'cloud'
  sources: {
    tikfinity: { ...DEFAULT_SOURCE(), url: 'ws://127.0.0.1:21213' },
    cloud:     { ...DEFAULT_SOURCE(), url: '', streamerId: null, displayName: null, tokenConfigured: false },
  },
};

function snapshot() {
  return {
    ok: true,
    bridgeVersion: '0.2.1',
    uptimeSec: Math.max(0, Math.floor((Date.now() - state.startedAt) / 1000)),
    primary: state.primary,
    sources: {
      tikfinity: { ...state.sources.tikfinity, eventCounts: { ...state.sources.tikfinity.eventCounts }, recentEvents: state.sources.tikfinity.recentEvents.slice() },
      cloud:     { ...state.sources.cloud,     eventCounts: { ...state.sources.cloud.eventCounts },     recentEvents: state.sources.cloud.recentEvents.slice() },
    },
    // Backwards-compat flat fields (older dashboard JS + launcher.hta read these)
    tickfinityConnected: state.sources.tikfinity.connected,
    tickfinityUrl: state.sources.tikfinity.url,
    lastEventAt: Math.max(state.sources.tikfinity.lastEventAt || 0, state.sources.cloud.lastEventAt || 0) || null,
    lastError: state.sources.tikfinity.lastError || state.sources.cloud.lastError || null,
    eventCounts: {
      raw: (state.sources.tikfinity.eventCounts.raw || 0) + (state.sources.cloud.eventCounts.raw || 0),
      chatMessage: (state.sources.tikfinity.eventCounts.chatMessage || 0) + (state.sources.cloud.eventCounts.chatMessage || 0),
      engagement: (state.sources.tikfinity.eventCounts.engagement || 0) + (state.sources.cloud.eventCounts.engagement || 0),
      unknown: (state.sources.tikfinity.eventCounts.unknown || 0) + (state.sources.cloud.eventCounts.unknown || 0),
    },
  };
}

function getSource(name) {
  return state.sources[name] || null;
}

function setEnabled(name, enabled) {
  const s = getSource(name);
  if (s) s.enabled = !!enabled;
}

function setConnected(name, connected) {
  const s = getSource(name);
  if (s) s.connected = !!connected;
}

function setUrl(name, url) {
  const s = getSource(name);
  if (s && url) s.url = String(url);
}

function setCloudIdentity({ streamerId, displayName, tokenConfigured }) {
  const s = state.sources.cloud;
  if (streamerId !== undefined) s.streamerId = streamerId;
  if (displayName !== undefined) s.displayName = displayName;
  if (tokenConfigured !== undefined) s.tokenConfigured = !!tokenConfigured;
}

function setLastError(name, error) {
  const s = getSource(name);
  if (s) s.lastError = error ? String(error) : null;
}

function setPrimary(name) {
  if (name === 'tikfinity' || name === 'cloud') state.primary = name;
}

function getPrimary() {
  return state.primary;
}

function recordEvent(name, kind, preview) {
  const s = getSource(name);
  if (!s) return;
  s.lastEventAt = Date.now();
  if (s.eventCounts[kind] == null) s.eventCounts[kind] = 0;
  s.eventCounts[kind] += 1;
  s.recentEvents.unshift({ at: s.lastEventAt, kind, preview: preview || null, source: name });
  if (s.recentEvents.length > MAX_RECENT_EVENTS) s.recentEvents.length = MAX_RECENT_EVENTS;
}

function incrementCount(name, kind) {
  const s = getSource(name);
  if (!s) return;
  s.lastEventAt = Date.now();
  if (s.eventCounts[kind] == null) s.eventCounts[kind] = 0;
  s.eventCounts[kind] += 1;
}

module.exports = {
  snapshot,
  setEnabled,
  setConnected,
  setUrl,
  setCloudIdentity,
  setLastError,
  setPrimary,
  getPrimary,
  recordEvent,
  incrementCount,
};
