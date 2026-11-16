'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createSongRequestManager, allowanceFor } = require('../src/spotify-requests');

const OWNER_ID = 'owner-1';

function viewer(id, badges = ['follower']) {
  return {
    platform: 'tiktok',
    streamerId: OWNER_ID,
    user: {
      id,
      username: id,
      displayName: `Viewer ${id}`,
      badges
    }
  };
}

function createSpotifyMock(options = {}) {
  let searchNumber = 0;
  let state = {
    is_playing: true,
    progress_ms: 30_000,
    device: { id: 'render1-device', name: 'Word Tycoon render1', is_active: true },
    context: { uri: 'spotify:playlist:owner' },
    item: {
      id: 'owner-current',
      uri: 'spotify:track:owner-current',
      name: 'Owner Current',
      duration_ms: 180_000,
      artists: [{ name: 'Owner' }]
    }
  };
  const starts = [];
  const queueAdds = [];
  let skips = 0;

  return {
    async getDevices() {
      return {
        devices: [{
          id: 'render1-device',
          name: 'Word Tycoon render1',
          is_active: state.device ? state.device.is_active : false
        }]
      };
    },
    async getPlaybackState() { return state; },
    async getQueue() {
      return {
        currently_playing: state.item,
        queue: [{
          id: 'owner-next',
          uri: 'spotify:track:owner-next',
          name: 'Owner Next',
          duration_ms: 180_000,
          artists: [{ name: 'Owner' }]
        }]
      };
    },
    async searchTrack(query) {
      searchNumber++;
      return {
        id: `request-${searchNumber}`,
        uri: `spotify:track:request-${searchNumber}`,
        name: query,
        duration_ms: 200_000,
        artists: [{ name: 'Requested Artist' }]
      };
    },
    async startPlayback(deviceId, body) {
      starts.push({ deviceId, body });
      if (options.rejectContextOffset && body.context_uri && body.offset) {
        throw new Error('Offset is not part of context');
      }
      const uri = body.uris && body.uris[0]
        || body.offset && body.offset.uri
        || 'spotify:track:unknown';
      const id = uri.split(':').pop();
      state = {
        is_playing: true,
        progress_ms: 0,
        device: { id: deviceId, name: 'Word Tycoon render1', is_active: true },
        context: body.context_uri ? { uri: body.context_uri } : null,
        item: {
          id,
          uri,
          name: id,
          duration_ms: 200_000,
          artists: [{ name: 'Artist' }]
        }
      };
    },
    async addToQueue(uri, deviceId) {
      queueAdds.push({ uri, deviceId });
    },
    async skipNext() { skips++; },
    setState(next) { state = next; },
    getState() { return state; },
    getStarts() { return starts; },
    getQueueAdds() { return queueAdds; },
    getSkips() { return skips; },
    getSearchCount() { return searchNumber; }
  };
}

function createManager(spotify, extra = {}) {
  return createSongRequestManager({
    spotify,
    ownerStreamerId: OWNER_ID,
    targetDeviceName: 'Word Tycoon render1',
    pollMs: 0,
    ...extra
  });
}

test('role allowances match follower, Fan Club, Donor, and Super Fan tiers', () => {
  assert.equal(allowanceFor(viewer('none', [])), 0);
  assert.equal(allowanceFor(viewer('follower', ['follower'])), 1);
  assert.equal(allowanceFor(viewer('fan', ['fan-club'])), 3);
  assert.equal(allowanceFor({ ...viewer('hidden-fan', []), musicRequestTier: 'fan-club' }), 3);
  assert.equal(allowanceFor(viewer('donor', ['donor'])), Infinity);
  assert.equal(allowanceFor(viewer('superfan', ['superfan'])), Infinity);
});

function sendLikes(manager, msg, count, extra = {}) {
  manager.handleLike({ ...msg, type: 'like', count, ...extra });
}

test('personal like bursts unlock a request at 1,000 and keep the remainder for the next reward', async () => {
  const spotify = createSpotifyMock();
  const manager = createManager(spotify);
  const msg = viewer('liker');
  await manager.requestSong(msg, 'First song');
  sendLikes(manager, msg, 650, { totalLikeCount: 999999 });
  sendLikes(manager, msg, 349);
  const blocked = await manager.requestSong(msg, 'Second song');
  assert.match(blocked.response, /Send 1 more like to earn/);
  assert.equal(spotify.getSearchCount(), 1);
  sendLikes(manager, msg, 1);
  assert.match((await manager.requestSong(msg, 'Second song')).response, /queued/);
  sendLikes(manager, msg, 2500);
  assert.match((await manager.requestSong(msg, 'Third song')).response, /1 request left/);
  assert.match((await manager.requestSong(msg, 'Fourth song')).response, /0 requests left/);
  assert.match((await manager.requestSong(msg, 'Fifth song')).response, /Send 500 more likes/);
  assert.equal(manager.getSnapshot().likes['tiktok:liker'], 3500);
  manager.shutdown();
});

test('like rewards belong to the viewer and owner stream, and reset at stream end', async () => {
  const manager = createManager(createSpotifyMock());
  const msg = viewer('liker', []);
  sendLikes(manager, msg, 1000, { _streamerId: OWNER_ID, streamerId: undefined });
  sendLikes(manager, viewer('other'), 1000, { _streamerId: 'other-stream' });
  sendLikes(manager, viewer('other'), 1000, { platform: 'youtube' });
  for (const count of [-1, 0, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    sendLikes(manager, viewer('other'), count);
  }
  assert.equal(manager.getSnapshot().likes['tiktok:other'], undefined);
  assert.match((await manager.requestSong(viewer('other', []), 'Other song')).response, /Every 1,000/);
  assert.match((await manager.requestSong(msg, 'Earned song')).response, /queued/);
  assert.match((await manager.requestSong(msg, 'Another song')).response, /used your 1 song request/);
  await manager.revokeRequest(msg);
  assert.match((await manager.requestSong(msg, 'Replacement song')).response, /queued/);
  manager.resetStreamer(OWNER_ID);
  assert.equal(manager.getSnapshot(), null);
  assert.match((await manager.requestSong(msg, 'New stream song')).response, /Every 1,000/);
  manager.shutdown();
});

test('likes add to Fan Club requests, preserve unlimited tiers, and survive failed requests', async () => {
  const spotify = createSpotifyMock();
  const manager = createManager(spotify);
  const msg = viewer('fan', ['fan-club']);
  sendLikes(manager, msg, 1000);
  const state = spotify.getState();
  spotify.setState({ ...state, device: { ...state.device, is_active: false } });
  assert.match((await manager.requestSong(msg, 'Unavailable song')).response, /isn't active/);
  spotify.setState(state);
  for (let i = 0; i < 4; i++) {
    assert.match((await manager.requestSong(msg, `Fan song ${i}`)).response, /queued/);
  }
  assert.match((await manager.requestSong(msg, 'Fifth fan song')).response, /used your 4 song requests/);
  const donor = viewer('donor', ['donor']);
  sendLikes(manager, donor, 2000);
  assert.match((await manager.requestSong(donor, 'Donor song')).response, /Unlimited requests enabled/);
  assert.deepEqual(manager.getPublicSnapshot().likeReward, { likesPerRequest: 1000, requests: 1 });
  manager.shutdown();
});

test('a follower gets one request per stream and revoke refunds the pending slot', async () => {
  const spotify = createSpotifyMock();
  const manager = createManager(spotify);
  const msg = viewer('follower');

  const first = await manager.requestSong(msg, 'First Song - Artist');
  assert.match(first.response, /queued/);
  assert.equal(manager.getSnapshot().queue.length, 1);

  const blocked = await manager.requestSong(msg, 'Second Song - Artist');
  assert.match(blocked.response, /used your 1 song request/);
  assert.equal(spotify.getSearchCount(), 1, 'quota is checked before another Spotify search');

  const revoked = await manager.revokeRequest(msg);
  assert.match(revoked.response, /request slot was restored/);
  assert.equal(manager.getSnapshot().queue.length, 0);

  const retried = await manager.requestSong(msg, 'Corrected Song - Artist');
  assert.match(retried.response, /queued/);
  assert.equal(manager.getSnapshot().usage['tiktok:follower'], 1);
  manager.shutdown();
});

test('revoke closes only after the request has entered Spotify native queue', async () => {
  const spotify = createSpotifyMock();
  const manager = createManager(spotify);
  const msg = viewer('native-next');

  await manager.requestSong(msg, 'Native Next - Artist');
  spotify.setState({ ...spotify.getState(), progress_ms: 170_000 });
  await manager.tick();

  const result = await manager.revokeRequest(msg);
  assert.match(result.response, /already next in Spotify/);
  assert.equal(manager.getSnapshot().usage['tiktok:native-next'], 1);
  assert.equal(manager.getSnapshot().nativeQueuedRequest.track.id, 'request-1');
  manager.shutdown();
});

test('Fan Club gets three requests while Donor and Super Fan are unlimited', async () => {
  for (const { badges, accepted } of [
    { badges: ['fan-club'], accepted: 3 },
    { badges: ['donor'], accepted: 5 },
    { badges: ['superfan'], accepted: 5 }
  ]) {
    const spotify = createSpotifyMock();
    const manager = createManager(spotify);
    const msg = viewer(badges[0], badges);

    for (let i = 0; i < 5; i++) {
      const result = await manager.requestSong(msg, `Song ${i} - Artist`);
      if (i < accepted) assert.match(result.response, /queued/);
      else assert.match(result.response, /used your 3 song requests/);
    }
    assert.equal(manager.getSnapshot().queue.length, accepted);
    manager.shutdown();
  }
});

test('viewer requests use Spotify native queue and the playlist continues without replacement', async () => {
  const spotify = createSpotifyMock();
  const manager = createManager(spotify);
  const msg = viewer('listener');

  await manager.requestSong(msg, 'Requested Song - Artist');
  assert.equal(spotify.getStarts().length, 0, 'owner track is not interrupted');
  await manager.tick();
  assert.equal(spotify.getQueueAdds().length, 0, 'request remains revocable until the owner track is nearly done');

  spotify.setState({
    is_playing: true,
    progress_ms: 170_000,
    device: { id: 'render1-device', name: 'Word Tycoon render1', is_active: true },
    context: { uri: 'spotify:playlist:owner' },
    item: {
      id: 'owner-current',
      uri: 'spotify:track:owner-current',
      name: 'Owner Current',
      duration_ms: 180_000,
      artists: [{ name: 'Owner' }]
    }
  });
  await manager.tick();
  assert.deepEqual(spotify.getQueueAdds(), [{
    uri: 'spotify:track:request-1',
    deviceId: 'render1-device'
  }]);
  assert.equal(spotify.getStarts().length, 0, 'native queue insertion preserves the playlist context');

  spotify.setState({
    is_playing: true,
    progress_ms: 0,
    device: { id: 'render1-device', name: 'Word Tycoon render1', is_active: true },
    context: { uri: 'spotify:playlist:owner' },
    item: {
      id: 'request-1',
      uri: 'spotify:track:request-1',
      name: 'Requested Song - Artist',
      duration_ms: 200_000,
      artists: [{ name: 'Requested Artist' }]
    }
  });
  await manager.tick();

  const protectedSkip = await manager.skipNonRequest(msg);
  assert.match(protectedSkip.response, /can't be skipped/);
  assert.equal(spotify.getSkips(), 0);

  spotify.setState({
    is_playing: true,
    progress_ms: 2_000,
    device: { id: 'render1-device', name: 'Word Tycoon render1', is_active: true },
    context: { uri: 'spotify:playlist:owner' },
    item: {
      id: 'owner-next',
      uri: 'spotify:track:owner-next',
      name: 'Owner Next',
      duration_ms: 180_000,
      artists: [{ name: 'Owner' }]
    }
  });
  await manager.tick();
  assert.equal(manager.getSnapshot().activeRequest, null);
  assert.equal(spotify.getStarts().length, 0, 'playlist resumed naturally after the requested song');

  const ownerSkip = await manager.skipNonRequest(msg);
  assert.match(ownerSkip.response, /skipped the current non-requested track/);
  assert.equal(spotify.getSkips(), 1);
  manager.shutdown();
});

test('inactive receiver still restores the captured playlist as a fallback', async () => {
  const spotify = createSpotifyMock();
  const manager = createManager(spotify);

  await manager.requestSong(viewer('listener'), 'Requested Song - Artist');
  spotify.setState({
    ...spotify.getState(),
    progress_ms: 170_000
  });
  await manager.tick();
  spotify.setState({
    is_playing: true,
    progress_ms: 0,
    device: { id: 'render1-device', name: 'Word Tycoon render1', is_active: true },
    context: { uri: 'spotify:playlist:owner' },
    item: {
      id: 'request-1', uri: 'spotify:track:request-1', name: 'Requested Song - Artist',
      duration_ms: 200_000, artists: [{ name: 'Requested Artist' }]
    }
  });
  await manager.tick();
  spotify.setState({
    ...spotify.getState(),
    is_playing: false,
    progress_ms: 200_000,
    device: { id: 'render1-device', name: 'Word Tycoon render1', is_active: false }
  });
  await manager.tick();

  assert.deepEqual(spotify.getStarts()[0].body, {
    context_uri: 'spotify:playlist:owner',
    offset: { uri: 'spotify:track:owner-next' },
    position_ms: 0
  });
  manager.shutdown();
});

test('playlist context is restored when Spotify rejects the captured queue offset', async () => {
  const spotify = createSpotifyMock({ rejectContextOffset: true });
  const manager = createManager(spotify);

  await manager.requestSong(viewer('listener'), 'Requested Song - Artist');
  spotify.setState({
    ...spotify.getState(),
    progress_ms: 170_000
  });
  await manager.tick();
  spotify.setState({
    is_playing: true,
    progress_ms: 0,
    device: { id: 'render1-device', name: 'Word Tycoon render1', is_active: true },
    context: { uri: 'spotify:playlist:owner' },
    item: {
      id: 'request-1', uri: 'spotify:track:request-1', name: 'Requested Song - Artist',
      duration_ms: 200_000, artists: [{ name: 'Requested Artist' }]
    }
  });
  await manager.tick();
  spotify.setState({
    ...spotify.getState(),
    is_playing: false,
    progress_ms: 200_000,
    device: { id: 'render1-device', name: 'Word Tycoon render1', is_active: false }
  });
  await manager.tick();

  assert.deepEqual(spotify.getStarts(), [
    {
      deviceId: 'render1-device',
      body: {
        context_uri: 'spotify:playlist:owner',
        offset: { uri: 'spotify:track:owner-next' },
        position_ms: 0
      }
    },
    {
      deviceId: 'render1-device',
      body: { context_uri: 'spotify:playlist:owner' }
    }
  ]);
  manager.shutdown();
});

test('definitive stream reset clears usage and pending requests', async () => {
  const spotify = createSpotifyMock();
  const manager = createManager(spotify);
  const msg = viewer('reset-me');

  await manager.requestSong(msg, 'Before Reset - Artist');
  manager.resetStreamer(OWNER_ID, 'test-end');
  assert.equal(manager.getSnapshot(), null);

  const after = await manager.requestSong(msg, 'After Reset - Artist');
  assert.match(after.response, /queued/);
  manager.shutdown();
});

test('music commands are silent outside the configured TikTok stream', async () => {
  const spotify = createSpotifyMock();
  const manager = createManager(spotify);
  const otherStream = { ...viewer('elsewhere'), streamerId: 'someone-else' };

  const result = await manager.requestSong(otherStream, 'Song - Artist');
  assert.deepEqual(result, { suppress: true });
  assert.equal(spotify.getSearchCount(), 0);
  manager.shutdown();
});

test('play and skip fail closed until playback-control scope is granted', async () => {
  const spotify = { ...createSpotifyMock(), hasScope: () => false };
  const manager = createManager(spotify);
  const msg = viewer('needs-auth');

  const play = await manager.requestSong(msg, 'Song - Artist');
  const skip = await manager.skipNonRequest(msg);
  assert.match(play.response, /reauthorized/);
  assert.match(skip.response, /reauthorized/);
  assert.equal(spotify.getSearchCount(), 0);
  assert.equal(spotify.getSkips(), 0);
  manager.shutdown();
});

test('public DJ state is stream-scoped and identifies the active viewer request', async () => {
  const spotify = { ...createSpotifyMock(), hasScope: () => true };
  const events = [];
  const io = {
    to(room) {
      return { emit: (event, payload) => events.push({ room, event, payload }) };
    }
  };
  const manager = createManager(spotify, { io });

  await manager.requestSong(viewer('dj-fan'), 'Long Viewer Request - Artist');
  let publicState = manager.getPublicSnapshot(OWNER_ID);
  assert.equal(publicState.available, true);
  assert.equal(publicState.queueCount, 1);
  assert.equal(publicState.queue[0].requestedBy, 'Viewer dj-fan');
  assert.deepEqual(publicState.tiers.map(tier => tier.requests), ['1', '3', '∞']);

  spotify.setState({
    is_playing: true,
    progress_ms: 170_000,
    device: { id: 'render1-device', name: 'Word Tycoon render1', is_active: true },
    context: { uri: 'spotify:playlist:owner' },
    item: {
      id: 'owner-current',
      uri: 'spotify:track:owner-current',
      name: 'Owner Current',
      duration_ms: 180_000,
      artists: [{ name: 'Owner' }]
    }
  });
  await manager.tick();
  spotify.setState({
    is_playing: true,
    progress_ms: 12_000,
    device: { id: 'render1-device', name: 'Word Tycoon render1', is_active: true },
    context: { uri: 'spotify:playlist:owner' },
    item: {
      id: 'request-1', uri: 'spotify:track:request-1', name: 'Long Viewer Request - Artist',
      duration_ms: 200_000, artists: [{ name: 'Requested Artist' }]
    }
  });
  await manager.tick();
  manager.handlePlaybackUpdate(OWNER_ID, {
    trackId: 'request-1',
    track: 'Long Viewer Request - Artist',
    artist: 'Requested Artist',
    album: 'Requests',
    albumArt: 'https://i.scdn.co/image/example',
    progress: 12_000,
    duration: 200_000,
    isPlaying: true
  });

  publicState = manager.getPublicSnapshot(OWNER_ID);
  assert.equal(publicState.current.viewerRequested, true);
  assert.equal(publicState.current.requestedBy, 'Viewer dj-fan');
  assert.equal(publicState.current.requestsLeft, 0);
  assert.equal(publicState.current.progressMs, 12_000);
  assert.equal(publicState.queueCount, 0);
  assert.ok(events.some(item => item.room === `goals:${OWNER_ID}` && item.event === 'spotify-request-state'));

  const otherState = manager.getPublicSnapshot('someone-else');
  assert.equal(otherState.available, false);
  assert.equal(otherState.current.trackId, null);
  manager.shutdown();
});
