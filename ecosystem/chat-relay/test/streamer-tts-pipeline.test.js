const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('streamer playback replaces a retired default with local neural audio', async () => {
  const module = { exports: {} };
  const emitted = [];
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/streamer-tts-pipeline.js'), 'utf8'), {
    module, console, process: { env: {} },
    require: () => ({ shouldSpeak: () => 'Hello stream', getSettings: () => ({ voice_id: 'retired-id' }) }),
    fetch: async () => ({ ok: true, json: async () => ({ voices: [
      { id: 'web:default', kind: 'web' },
      { id: 'web:us-female', kind: 'web', gain: 1 },
    ] }) }),
  });
  module.exports.setIo({ to: room => ({ emit: (event, data) => emitted.push({room, event, data}) }) });
  await module.exports.handleChat('test-streamer', { message: '.Hello', user: { username: 'viewer' } });
  assert.equal(emitted.length, 1);
  assert.equal(emitted[0].room, 'voice-tts:test-streamer');
  assert.equal(emitted[0].event, 'tts-play');
  assert.equal(emitted[0].data.voiceId, 'web:us-female');
  assert.match(emitted[0].data.mp3Url, /^\/api\/voice\/tts-free\?voice_key=web%3Aus-female&text=/);
});
