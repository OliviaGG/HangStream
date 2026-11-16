'use strict';

/**
 * TikTok song-request queue for the render1 Spotify Connect receiver.
 *
 * Spotify has no API for removing one item from its native queue. Requests
 * therefore stay relay-owned (and revocable) until shortly before playback,
 * then move into Spotify's active queue so the owner's playlist context stays
 * intact. Captured context remains a fallback if the receiver goes inactive.
 */

const spotifyClient = require('./spotify');

const DEFAULT_STREAMER_ID = process.env.SPOTIFY_REQUEST_STREAMER_ID
  || process.env.OWNER_DISCORD_ID
  || '179331908499406849';
const DEFAULT_DEVICE_NAME = process.env.SPOTIFY_REQUEST_DEVICE || 'Word Tycoon render1';
const DEFAULT_POLL_MS = 2000;
const MAX_QUERY_LENGTH = 120;
const NATIVE_QUEUE_LEAD_MS = 12_000;
const LIKES_PER_REQUEST = 1000;

function cleanText(value, max = 80) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function requesterKey(msg) {
  return `${msg.platform}:${msg.user.id}`;
}

function displayName(msg) {
  return cleanText(msg.user.customNick || msg.user.displayName || msg.user.username || 'Viewer', 40);
}

function allowanceFor(msg) {
  if (msg && msg.musicRequestTier === 'unlimited') return Infinity;
  if (msg && msg.musicRequestTier === 'fan-club') return 3;
  if (msg && msg.musicRequestTier === 'follower') return 1;
  const badges = new Set((msg.user && msg.user.badges || []).map(b => String(b).toLowerCase()));
  if (badges.has('donor') || badges.has('superfan') || badges.has('super-donor')) return Infinity;
  if (badges.has('fan-club')) return 3;
  if (badges.has('follower')) return 1;
  return 0;
}

function trackSummary(track) {
  const title = cleanText(track && track.name, 70) || 'Unknown track';
  const artist = cleanText(track && track.artists && track.artists.map(a => a.name).join(', '), 60);
  return artist ? `“${title}” — ${artist}` : `“${title}”`;
}

function commandResult(response) {
  return response ? { response, suppress: true } : { suppress: true };
}

function createSongRequestManager(options = {}) {
  const spotify = options.spotify || spotifyClient;
  const ownerStreamerId = String(options.ownerStreamerId || DEFAULT_STREAMER_ID);
  const targetDeviceName = String(options.targetDeviceName || DEFAULT_DEVICE_NAME);
  const pollMs = options.pollMs === undefined ? DEFAULT_POLL_MS : Number(options.pollMs);
  const now = typeof options.now === 'function' ? options.now : Date.now;
  const sessions = new Map();
  const nowPlayingByStreamer = new Map();

  let timer = null;
  let operation = Promise.resolve();
  let socketIo = options.io || null;

  function serialize(work) {
    const result = operation.then(work);
    operation = result.catch(() => {});
    return result;
  }

  function inScope(msg) {
    return !!msg
      && msg.platform === 'tiktok'
      && String(msg.streamerId || '') === ownerStreamerId;
  }

  function getSession(streamerId, create = false) {
    const key = String(streamerId || '');
    let session = sessions.get(key);
    if (!session && create) {
      session = {
        streamerId: key,
        queue: [],
        usage: new Map(),
        likes: new Map(),
        activeRequest: null,
        nativeQueuedRequest: null,
        cycle: null
      };
      sessions.set(key, session);
    }
    return session || null;
  }

  function getPublicSnapshot(streamerId = ownerStreamerId) {
    const key = String(streamerId || '');
    const session = getSession(key, false);
    const playback = nowPlayingByStreamer.get(key) || { isPlaying: false };
    const active = session && session.activeRequest;
    const viewerRequested = !!(active && playback.trackId && playback.trackId === active.track.id);
    const pending = session
      ? [session.nativeQueuedRequest, ...session.queue].filter(Boolean)
      : [];
    const queue = pending.slice(0, 8).map(item => ({
      title: cleanText(item.track.name, 100),
      artist: cleanText(item.track.artists && item.track.artists.map(a => a.name).join(', '), 80),
      requestedBy: cleanText(item.requesterName, 40)
    }));

    return {
      streamerId: key,
      available: key === ownerStreamerId
        && (typeof spotify.hasScope !== 'function' || spotify.hasScope('user-modify-playback-state')),
      deviceName: targetDeviceName,
      current: {
        trackId: playback.trackId || null,
        title: cleanText(playback.track, 120),
        artist: cleanText(playback.artist, 100),
        album: cleanText(playback.album, 100),
        albumArt: String(playback.albumArtLarge || playback.albumArt || '').slice(0, 1024),
        progressMs: Math.max(0, Number(playback.progress) || 0),
        durationMs: Math.max(0, Number(playback.duration) || 0),
        isPlaying: !!playback.isPlaying,
        viewerRequested,
        requestedBy: viewerRequested ? cleanText(active.requesterName, 40) : '',
        requestsLeft: viewerRequested ? active.requestsLeft : null
      },
      queueCount: pending.length,
      queue,
      likeReward: { likesPerRequest: LIKES_PER_REQUEST, requests: 1 },
      commands: [
        { command: '!play Song - Artist', label: 'request' },
        { command: '!revoke', label: 'remove yours' },
        { command: '!skip', label: 'host tracks only' }
      ],
      tiers: [
        { label: 'Followers', requests: '1' },
        { label: 'Fan Club', requests: '3' },
        { label: 'Donor / Super Fan', requests: '∞' }
      ],
      updatedAt: now()
    };
  }

  function emitState(streamerId = ownerStreamerId) {
    const key = String(streamerId || '');
    if (!socketIo || !key) return;
    socketIo.to(`goals:${key}`).emit('spotify-request-state', getPublicSnapshot(key));
  }

  function setIo(nextIo) {
    socketIo = nextIo || null;
  }

  function handlePlaybackUpdate(streamerId, payload) {
    const key = String(streamerId || '');
    if (!key) return;
    nowPlayingByStreamer.set(key, payload && typeof payload === 'object' ? { ...payload } : { isPlaying: false });
    emitState(key);
  }

  function handleLike(event) {
    const streamerId = String(event && (event._streamerId || event.streamerId) || '');
    if (!event || event.type !== 'like' || event.platform !== 'tiktok'
        || streamerId !== ownerStreamerId || !event.user || !event.user.id
        || event.user.id === 'unknown') return;
    // count is the viewer's burst delta. TikTok totalLikeCount is stream-wide.
    const count = Number(event.count);
    if (!Number.isSafeInteger(count) || count <= 0) return;
    const session = getSession(streamerId, true);
    const key = requesterKey(event);
    const previous = session.likes.get(key) || 0;
    const total = previous + count;
    if (!Number.isSafeInteger(total)) return;
    session.likes.set(key, total);
    if (Math.floor(total / LIKES_PER_REQUEST) > Math.floor(previous / LIKES_PER_REQUEST)) {
      emitState(streamerId);
    }
  }

  async function getTargetDevice(requireActive = true) {
    const payload = await spotify.getDevices();
    const devices = payload && Array.isArray(payload.devices) ? payload.devices : [];
    const target = devices.find(d => String(d.name || '').toLowerCase() === targetDeviceName.toLowerCase());
    if (!target || (requireActive && !target.is_active)) return null;
    return target;
  }

  async function captureCycle(device) {
    const state = await spotify.getPlaybackState();
    let nativeQueue = null;
    try { nativeQueue = await spotify.getQueue(); } catch (_) {}

    const current = state && state.item;
    const upcoming = nativeQueue && Array.isArray(nativeQueue.queue)
      ? nativeQueue.queue.find(item => item && item.uri && (!current || item.uri !== current.uri))
      : null;

    return {
      deviceId: device.id,
      anchorTrackId: state && state.is_playing && current ? current.id : null,
      anchorUri: current && current.uri || null,
      resumeContextUri: state && state.context && state.context.uri || null,
      resumeTrackUri: upcoming && upcoming.uri || null
    };
  }

  function ensureTimer() {
    if (timer || !(pollMs > 0)) return;
    timer = setInterval(() => {
      tick().catch(err => console.error('[SpotifyRequests] Queue tick failed:', err.message));
    }, pollMs);
    if (typeof timer.unref === 'function') timer.unref();
  }

  function stopTimerIfIdle() {
    const busy = Array.from(sessions.values()).some(
      s => s.cycle || s.activeRequest || s.nativeQueuedRequest || s.queue.length
    );
    if (!busy && timer) {
      clearInterval(timer);
      timer = null;
    }
  }

  async function startNext(session, device) {
    const entry = session.queue.shift();
    if (!entry) return restoreOwnerPlayback(session, device);

    await spotify.startPlayback(device.id, { uris: [entry.track.uri] });
    session.activeRequest = {
      ...entry,
      startedAt: now()
    };
    if (session.cycle) session.cycle.anchorTrackId = null;
    emitState(session.streamerId);
    console.log(`[SpotifyRequests] Playing ${entry.track.name} for ${entry.requesterName}`);
  }

  async function queueNextNatively(session, device) {
    const entry = session.queue.shift();
    if (!entry) return false;
    try {
      await spotify.addToQueue(entry.track.uri, device.id);
    } catch (err) {
      session.queue.unshift(entry);
      throw err;
    }
    session.nativeQueuedRequest = {
      ...entry,
      enqueuedAt: now()
    };
    emitState(session.streamerId);
    console.log(`[SpotifyRequests] Added ${entry.track.name} to the active Spotify queue for ${entry.requesterName}`);
    return true;
  }

  function playbackRemainingMs(state) {
    const duration = Number(state && state.item && state.item.duration_ms) || 0;
    const progress = Number(state && state.progress_ms) || 0;
    return duration > 0 ? Math.max(0, duration - progress) : Infinity;
  }

  async function restoreOwnerPlayback(session, device) {
    const cycle = session.cycle;
    session.activeRequest = null;
    session.cycle = null;

    if (!cycle) {
      stopTimerIfIdle();
      return;
    }

    const attempts = [];
    if (cycle.resumeContextUri && cycle.resumeTrackUri) {
      attempts.push({
        context_uri: cycle.resumeContextUri,
        offset: { uri: cycle.resumeTrackUri },
        position_ms: 0
      });
    }
    // An upcoming queue item is not guaranteed to be a member of the captured
    // context. If Spotify rejects that offset, restarting the playlist itself
    // is preferable to playing one standalone track and going silent again.
    if (cycle.resumeContextUri) attempts.push({ context_uri: cycle.resumeContextUri });
    if (cycle.resumeTrackUri) attempts.push({ uris: [cycle.resumeTrackUri] });

    let lastError = null;
    try {
      for (const body of attempts) {
        try {
          await spotify.startPlayback(device.id, body);
          lastError = null;
          break;
        } catch (err) {
          lastError = err;
        }
      }
      if (lastError) {
        console.error('[SpotifyRequests] Could not restore owner playback:', lastError.message);
      }
    } finally {
      emitState(session.streamerId);
      stopTimerIfIdle();
    }
  }

  function spotifyFailure(name, err) {
    if (err && err.status === 401) {
      return commandResult(`${name}: Spotify needs to be reconnected before song requests can run.`);
    }
    if (err && err.status === 403) {
      return commandResult(`${name}: Spotify controls need to be reauthorized by the stream owner.`);
    }
    if (err && err.status === 429) {
      return commandResult(`${name}: Spotify is rate-limiting requests right now — try again shortly.`);
    }
    console.error('[SpotifyRequests] Command failed:', err && err.message || err);
    return commandResult(`${name}: Spotify isn't available right now — try again in a moment.`);
  }

  async function requestSong(msg, rawQuery) {
    return serialize(async () => {
      if (!inScope(msg)) return commandResult(null);

      const name = displayName(msg);
      const query = cleanText(rawQuery, MAX_QUERY_LENGTH);
      if (!query) return commandResult('Usage: !play Song - Artist');

      if (typeof spotify.hasScope === 'function'
          && !spotify.hasScope('user-modify-playback-state')) {
        return commandResult(`${name}: Spotify controls need to be reauthorized by the stream owner.`);
      }

      const session = getSession(msg.streamerId, true);
      const key = requesterKey(msg);
      const likes = session.likes.get(key) || 0;
      const allowance = allowanceFor(msg) + Math.floor(likes / LIKES_PER_REQUEST);
      if (allowance === 0) {
        return commandResult(`${name}: song requests are available to followers (1), Fan Club members (3), and Donors/Super Fans (unlimited). Every 1,000 of your likes earns an extra request this stream.`);
      }

      const used = session.usage.get(key) || 0;
      if (Number.isFinite(allowance) && used >= allowance) {
        const likesLeft = LIKES_PER_REQUEST - (likes % LIKES_PER_REQUEST);
        return commandResult(`${name}: you've used your ${allowance} song request${allowance === 1 ? '' : 's'} for this stream. Send ${likesLeft.toLocaleString('en-US')} more like${likesLeft === 1 ? '' : 's'} to earn another, then use !play Song - Artist.`);
      }

      try {
        const device = await getTargetDevice(true);
        if (!device) {
          return commandResult(`${name}: the ${targetDeviceName} Spotify receiver isn't active right now.`);
        }

        const track = await spotify.searchTrack(query);
        if (!track || !track.id || !track.uri) {
          return commandResult(`${name}: I couldn't find that song on Spotify. Try !play Song - Artist.`);
        }

        const duplicate = [session.activeRequest, session.nativeQueuedRequest, ...session.queue]
          .find(item => item && item.track.id === track.id);
        if (duplicate) {
          return commandResult(`${name}: ${trackSummary(track)} is already pending in your queue.`);
        }

        if (!session.cycle && !session.activeRequest
            && !session.nativeQueuedRequest && session.queue.length === 0) {
          session.cycle = await captureCycle(device);
        }

        const entry = {
          requesterKey: key,
          requesterName: name,
          track: {
            id: track.id,
            uri: track.uri,
            name: cleanText(track.name, 100),
            artists: Array.isArray(track.artists)
              ? track.artists.map(a => ({ name: cleanText(a.name, 80) }))
              : [],
            duration_ms: Number(track.duration_ms) || 0
          },
          requestsLeft: Number.isFinite(allowance) ? allowance - used - 1 : '∞',
          queuedAt: now()
        };
        session.queue.push(entry);
        session.usage.set(key, used + 1);
        emitState(session.streamerId);

        // If nothing is currently playing, begin the first request at once.
        if (session.cycle && !session.cycle.anchorTrackId && !session.activeRequest) {
          try {
            await startNext(session, device);
          } catch (err) {
            session.queue = session.queue.filter(item => item !== entry);
            session.usage.set(key, used);
            session.cycle = null;
            emitState(session.streamerId);
            stopTimerIfIdle();
            return spotifyFailure(name, err);
          }
        }

        ensureTimer();
        const position = session.queue.indexOf(entry) + 1 + (session.nativeQueuedRequest ? 1 : 0);
        const remaining = Number.isFinite(allowance) ? allowance - used - 1 : Infinity;
        const suffix = Number.isFinite(remaining)
          ? ` ${remaining} request${remaining === 1 ? '' : 's'} left this stream.`
          : ' Unlimited requests enabled.';
        const positionText = position > 0 ? ` Queue position: ${position}.` : ' Playing now.';
        return commandResult(`${name}: queued ${trackSummary(entry.track)}.${positionText}${suffix}`);
      } catch (err) {
        return spotifyFailure(name, err);
      }
    });
  }

  async function revokeRequest(msg) {
    return serialize(async () => {
      if (!inScope(msg)) return commandResult(null);
      const name = displayName(msg);
      const session = getSession(msg.streamerId, false);
      if (!session) return commandResult(`${name}: you have no pending song request to revoke.`);

      const key = requesterKey(msg);
      let index = -1;
      for (let i = session.queue.length - 1; i >= 0; i--) {
        if (session.queue[i].requesterKey === key) {
          index = i;
          break;
        }
      }
      if (index < 0) {
        if (session.nativeQueuedRequest && session.nativeQueuedRequest.requesterKey === key) {
          return commandResult(`${name}: that song is already next in Spotify and can no longer be revoked.`);
        }
        return commandResult(`${name}: you have no pending song request to revoke.`);
      }

      const [removed] = session.queue.splice(index, 1);
      const used = session.usage.get(key) || 0;
      session.usage.set(key, Math.max(0, used - 1));
      if (session.queue.length === 0 && !session.activeRequest && !session.nativeQueuedRequest) {
        session.cycle = null;
        stopTimerIfIdle();
      }
      emitState(session.streamerId);
      return commandResult(`${name}: removed ${trackSummary(removed.track)} from the queue. Your request slot was restored.`);
    });
  }

  async function skipNonRequest(msg) {
    return serialize(async () => {
      if (!inScope(msg)) return commandResult(null);
      const name = displayName(msg);
      if (allowanceFor(msg) === 0) {
        return commandResult(`${name}: !skip is available to followers and stream members.`);
      }
      if (typeof spotify.hasScope === 'function'
          && !spotify.hasScope('user-modify-playback-state')) {
        return commandResult(`${name}: Spotify controls need to be reauthorized by the stream owner.`);
      }

      const session = getSession(msg.streamerId, false);
      if (session && session.activeRequest) {
        return commandResult(`${name}: viewer-requested songs can't be skipped.`);
      }

      try {
        const device = await getTargetDevice(true);
        if (!device) return commandResult(`${name}: the ${targetDeviceName} Spotify receiver isn't active right now.`);
        await spotify.skipNext(device.id);
        return commandResult(`${name}: skipped the current non-requested track.`);
      } catch (err) {
        return spotifyFailure(name, err);
      }
    });
  }

  async function _tick() {
    const session = getSession(ownerStreamerId, false);
    if (!session || (!session.cycle && !session.activeRequest
        && !session.nativeQueuedRequest && session.queue.length === 0)) {
      stopTimerIfIdle();
      return;
    }

    let device;
    try {
      // A one-track request started with `uris` can leave the Connect receiver
      // visible but inactive as soon as it naturally ends. We still need that
      // device ID to restart the captured owner context. Requiring an active
      // device here made the worker return before restoreOwnerPlayback().
      device = await getTargetDevice(false);
      if (!device) return;
      const state = await spotify.getPlaybackState();
      let currentId = state && state.item && state.item.id;

      if (session.nativeQueuedRequest && currentId === session.nativeQueuedRequest.track.id
          && (!session.activeRequest || session.activeRequest.track.id !== currentId)) {
        session.activeRequest = {
          ...session.nativeQueuedRequest,
          startedAt: now()
        };
        session.nativeQueuedRequest = null;
        emitState(session.streamerId);
        console.log(`[SpotifyRequests] Playing ${session.activeRequest.track.name} for ${session.activeRequest.requesterName}`);
      }

      if (session.activeRequest) {
        const active = session.activeRequest;
        const sameTrack = currentId && currentId === active.track.id;
        if (sameTrack && state.is_playing) {
          if (!session.nativeQueuedRequest && session.queue.length
              && playbackRemainingMs(state) <= NATIVE_QUEUE_LEAD_MS) {
            await queueNextNatively(session, device);
          }
          return;
        }

        // A paused request remains protected. Treat it as finished only when
        // Spotify reports its natural end (near-duration) or another track.
        if (sameTrack && !state.is_playing) {
          const progress = Number(state.progress_ms) || 0;
          const duration = Number(state.item.duration_ms || active.track.duration_ms) || 0;
          if (!duration || progress < duration - 2000) return;
          currentId = null;
        } else if (!currentId && now() - active.startedAt < 3000) {
          // Spotify can briefly return 204 immediately after a play command.
          return;
        }

        session.activeRequest = null;
        if (session.nativeQueuedRequest) return;
        if (session.queue.length) {
          if (currentId) {
            if (session.cycle) session.cycle.anchorTrackId = currentId;
            if (state.is_playing && playbackRemainingMs(state) <= NATIVE_QUEUE_LEAD_MS) {
              await queueNextNatively(session, device);
            }
          } else {
            await startNext(session, device);
          }
        } else if (currentId) {
          session.cycle = null;
          emitState(session.streamerId);
          stopTimerIfIdle();
        } else {
          await restoreOwnerPlayback(session, device);
        }
        return;
      }

      if (session.nativeQueuedRequest) {
        // Spotify normally transitions into this item automatically. Allow a
        // short handoff gap before falling back to a direct start.
        if (!currentId && now() - session.nativeQueuedRequest.enqueuedAt >= 5000) {
          const entry = session.nativeQueuedRequest;
          session.nativeQueuedRequest = null;
          session.queue.unshift(entry);
          await startNext(session, device);
        }
        return;
      }

      if (!session.queue.length) {
        session.cycle = null;
        stopTimerIfIdle();
        return;
      }

      if (!currentId) {
        await startNext(session, device);
        return;
      }

      if (session.cycle && session.cycle.anchorTrackId !== currentId) {
        session.cycle.anchorTrackId = currentId;
      }
      // Keep the playlist context intact. The native queue item is inserted
      // shortly before the current track ends, leaving most of the window for
      // !revoke while guaranteeing the request plays next.
      if (state.is_playing && playbackRemainingMs(state) <= NATIVE_QUEUE_LEAD_MS) {
        await queueNextNatively(session, device);
      }
    } catch (err) {
      console.error('[SpotifyRequests] Queue tick failed:', err.message);
    }
  }

  function tick() {
    return serialize(_tick);
  }

  function resetStreamer(streamerId, reason = 'stream-ended') {
    const key = String(streamerId || '');
    if (!sessions.has(key)) return;
    sessions.delete(key);
    emitState(key);
    stopTimerIfIdle();
    console.log(`[SpotifyRequests] Reset ${key} (${reason})`);
  }

  function shutdown() {
    if (timer) clearInterval(timer);
    timer = null;
    sessions.clear();
    nowPlayingByStreamer.clear();
  }

  function getSnapshot(streamerId = ownerStreamerId) {
    const session = getSession(streamerId, false);
    if (!session) return null;
    return {
      queue: session.queue.map(item => ({ ...item, track: { ...item.track } })),
      usage: Object.fromEntries(session.usage),
      likes: Object.fromEntries(session.likes),
      activeRequest: session.activeRequest && { ...session.activeRequest, track: { ...session.activeRequest.track } },
      nativeQueuedRequest: session.nativeQueuedRequest
        && { ...session.nativeQueuedRequest, track: { ...session.nativeQueuedRequest.track } },
      cycle: session.cycle && { ...session.cycle }
    };
  }

  return {
    requestSong,
    revokeRequest,
    skipNonRequest,
    tick,
    resetStreamer,
    shutdown,
    getSnapshot,
    getPublicSnapshot,
    setIo,
    handlePlaybackUpdate,
    handleLike,
    allowanceFor,
    ownerStreamerId,
    targetDeviceName
  };
}

const manager = createSongRequestManager();

module.exports = {
  ...manager,
  createSongRequestManager,
  allowanceFor,
  DEFAULT_STREAMER_ID,
  DEFAULT_DEVICE_NAME,
  LIKES_PER_REQUEST
};
