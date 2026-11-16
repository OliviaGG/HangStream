/**
 * streamer-tts-pipeline.js — Chat → TTS dispatcher.
 *
 * Called from tiktok-direct.js for each chat event. If the streamer has TTS
 * enabled and the message passes trigger/mute checks, we emit a `tts-play`
 * event into room `voice-tts:<discordId>` carrying an mp3Url that the
 * dashboard's <audio> element can fetch.
 *
 * The mp3Url points back at chat-relay's own /api/voice/tts proxy rather
 * than directly at voice-tts (port 3022 isn't public). The proxy streams
 * audio from voice-tts which has its own per-(voice_id, text) MP3 cache.
 *
 * Voice selection — settings.voice_id wins; otherwise we use the first
 * voice from the voice-tts catalog (lazily fetched + cached for 5 min).
 */

const tts = require('./streamer-tts');

const VOICE_URL = process.env.VOICE_URL || 'http://localhost:3032';
const CATALOG_TTL_MS = 5 * 60 * 1000;
const MAX_TTS_TEXT_LEN = 280;

let io = null;
let _catalogCache = null;
let _catalogCacheAt = 0;

function setIo(socketIO) { io = socketIO; }

async function _getCatalog() {
  const now = Date.now();
  if (_catalogCache && (now - _catalogCacheAt) < CATALOG_TTL_MS) return _catalogCache;
  try {
    const r = await fetch(`${VOICE_URL}/api/voices/list`);
    if (!r.ok) throw new Error(`voice catalog ${r.status}`);
    const j = await r.json();
    _catalogCache = Array.isArray(j.voices) ? j.voices : [];
    _catalogCacheAt = now;
  } catch (e) {
    console.warn('[StreamerTTSPipeline] catalog fetch failed:', e.message);
    if (!_catalogCache) _catalogCache = [];
  }
  return _catalogCache;
}

async function _resolveVoice(voiceId) {
  const cat = await _getCatalog();
  if (voiceId) {
    const found = cat.find(v => v.id === voiceId);
    if (found) return found;
  }
  // Prefer a donor voice when available; otherwise use local neural speech.
  // Retired saved IDs must not fall through to the robotic default.
  return cat.find(v => v.kind !== 'web') ||
    cat.find(v => v.id === 'web:us-female') || cat[0] || null;
}

/**
 * Handle a TikTok chat event. `data` is the normalized message:
 *   { user: { id, username, displayName }, message, _streamerId }
 */
async function handleChat(streamerId, data) {
  if (!io || !streamerId || !data) return;

  const candidateKeys = [
    `tiktok:${data.user?.username || ''}`,
    data.user?.username || '',
    data.user?.displayName || '',
    data.user?.id ? `tiktok:${data.user.id}` : '',
  ];

  const text = tts.shouldSpeak(streamerId, data.message, candidateKeys);
  if (!text) return;

  const safeText = text.slice(0, MAX_TTS_TEXT_LEN);
  const settings = tts.getSettings(streamerId);
  const voice = await _resolveVoice(settings.voice_id);
  if (!voice) {
    console.warn('[StreamerTTSPipeline] no voice available for streamer', streamerId);
    return;
  }

  // Web kind voices used to rely on the *browser's* SpeechSynthesis (device
  // voices), which is silent on devices without any — most importantly the
  // headless server-stream renderer, where every free-voice line was dropped.
  // The voice-tts service synthesizes these keys locally via Piper
  // (/api/tts/free → chat-relay proxy /api/voice/tts-free), so send an mp3Url
  // for them too. voiceKey is kept as a fallback for stale overlay pages.
  const isWeb = voice.kind === 'web';
  const payload = {
    text: safeText,
    viewerName: data.user?.displayName || data.user?.username || '',
    voiceId: voice.id,
    gain: typeof voice.gain === 'number' ? voice.gain : 1,
    firedAt: Date.now(),
  };
  if (isWeb) {
    payload.voiceKey = voice.id;     // 'web:us-female' etc
    payload.mp3Url = `/api/voice/tts-free?voice_key=${encodeURIComponent(voice.id)}&text=${encodeURIComponent(safeText)}`;
  } else {
    payload.mp3Url = `/api/voice/tts?voice_id=${encodeURIComponent(voice.id)}&text=${encodeURIComponent(safeText)}`;
  }
  io.to(`voice-tts:${streamerId}`).emit('tts-play', payload);
}

module.exports = {
  setIo,
  handleChat,
  _getCatalog,    // exposed so the /api/voice/catalog proxy can reuse the cache
  VOICE_URL,
};
