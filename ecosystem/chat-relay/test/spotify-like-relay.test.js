'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const relay = require('../src/relay');
const spotifyRequests = require('../src/spotify-requests');

test('relay forwards scoped TikTok like deltas into the song-request manager', () => {
  spotifyRequests.resetStreamer(spotifyRequests.ownerStreamerId);
  relay.handleEngagement({
    type: 'like', platform: 'tiktok', count: 1000,
    _streamerId: spotifyRequests.ownerStreamerId,
    user: { id: 'like-routing-test', username: 'like-routing-test' }
  });
  assert.equal(spotifyRequests.getSnapshot().likes['tiktok:like-routing-test'], 1000);
  spotifyRequests.shutdown();
});
