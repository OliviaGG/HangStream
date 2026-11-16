'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
}

function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(source => source.trim());
}

test('Spotify DJ is a Pro-only widget with editor and overlay render hooks', () => {
  const goals = require('../src/streamer-goals');
  const pro = read('public/streamer/pro.html');
  const overlay = read('public/streamer/goals-overlay.html');

  assert.ok(goals.VALID_WIDGET_TYPES.includes('spotifyDJ'));
  assert.ok(goals.PRO_WIDGET_TYPES.includes('spotifyDJ'));
  assert.ok(!goals.STREAMER_WIDGET_TYPES.includes('spotifyDJ'));
  assert.match(pro, /<option value="spotifyDJ">/);
  assert.match(pro, /data-f="titleMaxChars"/);
  assert.match(overlay, /\/streamer\/dj-widget\.html\?/);
  assert.match(overlay, /renderSpotifyDJ/);
});

test('Spotify DJ browser scripts parse and subscribe to stream-scoped state', () => {
  for (const relativePath of [
    'public/streamer/dj-widget.html',
    'public/streamer/pro.html',
    'public/streamer/goals-overlay.html'
  ]) {
    const html = read(relativePath);
    const scripts = inlineScripts(html);
    assert.ok(scripts.length > 0, `${relativePath} should contain an inline script`);
    for (const source of scripts) assert.doesNotThrow(() => new Function(source), relativePath);
  }

  const widget = read('public/streamer/dj-widget.html');
  assert.match(widget, /join-goals-overlay/);
  assert.match(widget, /spotify-request-state/);
  assert.match(widget, /Requested by/);
  assert.match(widget, /time-left/);
  assert.match(widget, /Become a Donor or Super Fan/);
  assert.match(widget, /Queue or skip more songs\./);
  assert.match(widget, /Every 1,000 of your TikTok likes = \+1 song request this stream/);
  assert.match(widget, /setInterval\(showSupportPromo, 120000\)/);
});
