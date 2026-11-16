'use strict';
// voice-tts — minimal Piper-based TTS service compatible with chat-relay's
// voice-tts contract (see chat-relay/src/streamer-tts-pipeline.js and the
// /api/voice/* proxies in chat-relay/server.js).
//
// Endpoints:
//   GET  /api/voices/list                 -> { voices: [...] }
//   GET  /api/tts/free?voice_key&text     -> audio/mpeg (or audio/wav)
//   POST /api/tts/synthesize {voice_id,text} -> audio/mpeg
//   GET  /api/voices/:id/preview          -> short sample clip
//   GET  /health
//
// Only `web:*` voices are synthesized (Piper). Premium/ElevenLabs voice ids
// return 404 — chat-relay treats those as unavailable and falls back.

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '3032', 10);
const ROOT = __dirname;
const MODELS_DIR = path.join(ROOT, 'models');
const CACHE_DIR = path.join(ROOT, 'data', 'cache');
const MAX_TEXT_LEN = 500;
const SYNTH_CONCURRENCY = 2;

// voice_key -> catalog entry + piper model file (relative to models/)
const VOICES = {
  'web:default':        { label: 'Robot',            accent: 'US', gender: 'neutral', gain: 0.9,  model: 'en_US-lessac-low.onnx' },
  'web:us-female':      { label: 'US Female',        accent: 'US', gender: 'female',  gain: 1.0,  model: 'en_US-hfc_female-medium.onnx' },
  'web:us-male':        { label: 'US Male',          accent: 'US', gender: 'male',    gain: 1.0,  model: 'en_US-hfc_male-medium.onnx' },
  'web:uk-female':      { label: 'UK Female',        accent: 'UK', gender: 'female',  gain: 1.0,  model: 'en_GB-alba-medium.onnx' },
  'web:uk-male':        { label: 'UK Male',          accent: 'UK', gender: 'male',    gain: 1.0,  model: 'en_GB-northern_english_male-medium.onnx' },
  'web:au-female':      { label: 'AU Female',        accent: 'AU', gender: 'female',  gain: 1.0,  model: 'en_US-hfc_female-medium.onnx' },
  'web:au-male':        { label: 'AU Male',          accent: 'AU', gender: 'male',    gain: 1.0,  model: 'en_US-hfc_male-medium.onnx' },
  'web:ca-female':      { label: 'CA Female',        accent: 'CA', gender: 'female',  gain: 1.0,  model: 'en_US-hfc_female-medium.onnx' },
  'web:ca-male':        { label: 'CA Male',          accent: 'CA', gender: 'male',    gain: 1.0,  model: 'en_US-hfc_male-medium.onnx' },
  'web:cn-female':      { label: 'Chinese Female',   accent: 'CN', gender: 'female',  gain: 1.0,  model: 'zh_CN-huayan-medium.onnx' },
  'web:cn-male':        { label: 'Chinese Male',     accent: 'CN', gender: 'male',    gain: 1.0,  model: 'zh_CN-chaowen-medium.onnx' },
  'web:es-female':      { label: 'Spanish Female',   accent: 'ES', gender: 'female',  gain: 1.0,  model: 'es_ES-mls_9972-low.onnx' },
  'web:es-male':        { label: 'Spanish Male',     accent: 'ES', gender: 'male',    gain: 1.0,  model: 'es_ES-davefx-medium.onnx' },
  'web:in-female':      { label: 'Indian Female',    accent: 'IN', gender: 'female',  gain: 1.0,  model: 'en_US-hfc_female-medium.onnx' },
  'web:in-male':        { label: 'Indian Male',      accent: 'IN', gender: 'male',    gain: 1.0,  model: 'en_US-hfc_male-medium.onnx' },
};

function catalogEntry(id) {
  const v = VOICES[id];
  if (!v) return null;
  return { id, kind: 'web', label: v.label, accent: v.accent, gender: v.gender, gain: v.gain };
}

// ── Piper binary + espeak data discovery ────────────────────────────────
function findPiper() {
  if (process.env.PIPER_BIN && fs.existsSync(process.env.PIPER_BIN)) return process.env.PIPER_BIN;
  const isWin = process.platform === 'win32';
  const candidates = isWin
    ? [path.join(ROOT, 'bin', 'piper-win', 'piper', 'piper.exe')]
    : [path.join(ROOT, 'bin', 'piper', 'piper'), path.join(ROOT, 'bin', 'piper-linux', 'piper', 'piper')];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return 'piper'; // hope it's on PATH
}
const PIPER = findPiper();

function findEspeakData() {
  if (process.env.ESPEAK_DATA && fs.existsSync(process.env.ESPEAK_DATA)) return process.env.ESPEAK_DATA;
  const dir = path.dirname(PIPER);
  const candidates = [
    path.join(dir, 'espeak-ng-data'),
    path.join(path.dirname(dir), 'espeak-ng-data'),
    path.join(ROOT, 'bin', 'piper-win', 'piper', 'espeak-ng-data'),
    path.join(ROOT, 'bin', 'piper', 'espeak-ng-data'),
    path.join(ROOT, 'bin', 'piper-linux', 'piper', 'espeak-ng-data'),
  ];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return null;
}
const ESPEAK_DATA = findEspeakData();

function findFfmpeg() {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) return process.env.FFMPEG_PATH;
  // ffmpeg-static layout if installed alongside
  const rel = path.join(ROOT, 'node_modules', 'ffmpeg-static');
  if (fs.existsSync(rel)) {
    const idx = path.join(rel, 'index.js');
    if (fs.existsSync(idx)) {
      try {
        const bin = require(rel);
        if (bin && fs.existsSync(bin)) return bin;
      } catch (_) {}
      const exe = path.join(rel, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return 'ffmpeg'; // PATH fallback; failure degrades to WAV
}
const FFMPEG = findFfmpeg();

// ── Synthesis ───────────────────────────────────────────────────────────
let activeSynths = 0;
const synthQueue = [];

function acquireSlot() {
  return new Promise((resolve) => {
    if (activeSynths < SYNTH_CONCURRENCY) { activeSynths++; resolve(); }
    else synthQueue.push(resolve);
  });
}
function releaseSlot() {
  activeSynths--;
  const next = synthQueue.shift();
  if (next) { activeSynths++; next(); }
}

function run(cmd, args, { input, timeoutMs = 30000 } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { windowsHide: true });
    const chunks = [];
    const errs = [];
    const timer = setTimeout(() => { child.kill(); reject(new Error('synth_timeout')); }, timeoutMs);
    child.stdout.on('data', (d) => chunks.push(d));
    child.stderr.on('data', (d) => errs.push(d));
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) resolve(Buffer.concat(chunks));
      else reject(new Error(`exit ${code}: ${Buffer.concat(errs).toString().slice(0, 300)}`));
    });
    if (input != null) { child.stdin.write(input); }
    child.stdin.end();
  });
}

async function wavToMp3(wavPath) {
  // Returns mp3 buffer or null if ffmpeg unavailable/failed.
  try {
    const out = wavPath + '.mp3';
    await run(FFMPEG, ['-y', '-i', wavPath, '-codec:a', 'libmp3lame', '-q:a', '4', out], { timeoutMs: 30000 });
    const buf = fs.readFileSync(out);
    try { fs.unlinkSync(out); } catch (_) {}
    return buf;
  } catch (_) {
    return null;
  }
}

// Fallback for machines where the Piper ONNX runtime can't run (e.g. CPUs
// without AVX2). Windows-only: System.Speech SYNTHESIZES TO WAV via
// PowerShell. Returns a WAV buffer or null when unavailable.
function synthesizeViaSapi(text, outWav) {
  if (process.platform !== 'win32') return Promise.resolve(null);
  const script = [
    'Add-Type -AssemblyName System.Speech',
    '$s = New-Object System.Speech.Synthesis.SpeechSynthesizer',
    `$s.SetOutputToWaveFile('${outWav.replace(/'/g, "''")}')`,
    `$t=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(String(text),'utf8').toString('base64')}'))`,
    '$s.Speak($t)',
    '$s.Dispose()',
  ].join('; ');
  // -EncodedCommand avoids all quoting/escaping issues with chat text.
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-EncodedCommand', encoded], { timeoutMs: 30000 })
    .then(() => (fs.existsSync(outWav) && fs.statSync(outWav).size > 0 ? outWav : null))
    .catch(() => null);
}

// Piper's ONNX runtime needs AVX2; on CPUs without it every call crashes
// (~30s each once Windows Error Reporting kicks in). After the first crash
// we stop trying Piper and use the fallback engine for the process lifetime.
let piperBroken = false;

async function synthesizeWithPiper(voiceKey, clean, outWav) {
  if (piperBroken) throw new Error('piper_disabled');
  const voice = VOICES[voiceKey];
  const modelPath = path.join(MODELS_DIR, voice.model);
  if (!fs.existsSync(modelPath)) throw new Error('model_missing:' + voice.model);
  const args = ['--model', modelPath, '--output_file', outWav, '--quiet'];
  if (ESPEAK_DATA) args.push('--espeak_data', ESPEAK_DATA);
  await acquireSlot();
  try {
    await run(PIPER, args, { input: clean });
  } catch (e) {
    piperBroken = true;
    console.warn('[voice-tts] piper failed, disabling for this process:', e.message);
    throw e;
  } finally {
    releaseSlot();
  }
  if (!fs.existsSync(outWav) || fs.statSync(outWav).size === 0) throw new Error('synth_empty');
}

// Synthesize text -> { buffer, contentType, ext }
async function synthesize(voiceKey, text) {
  const clean = String(text || '').replace(/[\r\n]+/g, ' ').trim().slice(0, MAX_TEXT_LEN);
  if (!clean) throw new Error('empty_text');
  const cacheKey = crypto.createHash('sha256').update(voiceKey + '|' + clean).digest('hex');
  const mp3Path = path.join(CACHE_DIR, cacheKey + '.mp3');
  const wavPath = path.join(CACHE_DIR, cacheKey + '.wav');

  if (fs.existsSync(mp3Path)) return { buffer: fs.readFileSync(mp3Path), contentType: 'audio/mpeg', cached: true };
  if (fs.existsSync(wavPath)) {
    const mp3 = await wavToMp3(wavPath);
    if (mp3) { fs.writeFileSync(mp3Path, mp3); return { buffer: mp3, contentType: 'audio/mpeg', cached: true }; }
    return { buffer: fs.readFileSync(wavPath), contentType: 'audio/wav', cached: true };
  }

  // synthesize to a temp wav, then move into cache
  const tmpWav = path.join(CACHE_DIR, `tmp-${cacheKey}.wav`);
  try {
    await synthesizeWithPiper(voiceKey, clean, tmpWav);
  } catch (piperErr) {
    // Piper's ONNX runtime needs AVX2; fall back to SAPI on dev machines.
    const sapiWav = await synthesizeViaSapi(clean, tmpWav);
    if (!sapiWav) throw piperErr;
  }
  if (!fs.existsSync(tmpWav) || fs.statSync(tmpWav).size === 0) throw new Error('synth_empty');

  const mp3 = await wavToMp3(tmpWav);
  if (mp3) {
    fs.writeFileSync(mp3Path, mp3);
    try { fs.unlinkSync(tmpWav); } catch (_) {}
    return { buffer: mp3, contentType: 'audio/mpeg', cached: false };
  }
  fs.renameSync(tmpWav, wavPath);
  return { buffer: fs.readFileSync(wavPath), contentType: 'audio/wav', cached: false };
}

// ── HTTP server ─────────────────────────────────────────────────────────
function json(res, code, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (d) => {
      size += d.length;
      if (size > 64 * 1024) { reject(new Error('body_too_large')); req.destroy(); return; }
      chunks.push(d);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const p = url.pathname;

  try {
    if (p === '/health') {
      return json(res, 200, { ok: true, voices: Object.keys(VOICES).length, piper: fs.existsSync(PIPER) || PIPER === 'piper', espeakData: !!ESPEAK_DATA });
    }

    if (p === '/api/voices/list' && req.method === 'GET') {
      return json(res, 200, { voices: Object.keys(VOICES).map(catalogEntry) });
    }

    if (p === '/api/tts/free' && req.method === 'GET') {
      const voiceKey = url.searchParams.get('voice_key') || '';
      const text = url.searchParams.get('text') || '';
      if (!VOICES[voiceKey]) return json(res, 404, { error: 'unknown_voice' });
      const out = await synthesize(voiceKey, text);
      res.writeHead(200, {
        'Content-Type': out.contentType,
        'Content-Length': out.buffer.length,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-TTS-Cache': out.cached ? 'hit' : 'miss',
      });
      return res.end(out.buffer);
    }

    if (p === '/api/tts/synthesize' && req.method === 'POST') {
      const body = JSON.parse(await readBody(req) || '{}');
      const voiceId = String(body.voice_id || '');
      const text = String(body.text || '');
      if (!VOICES[voiceId]) return json(res, 404, { error: 'unknown_voice' });
      const out = await synthesize(voiceId, text);
      res.writeHead(200, {
        'Content-Type': out.contentType,
        'Content-Length': out.buffer.length,
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-TTS-Cache': out.cached ? 'hit' : 'miss',
      });
      return res.end(out.buffer);
    }

    const prevMatch = p.match(/^\/api\/voices\/([^/]+)\/preview$/);
    if (prevMatch && req.method === 'GET') {
      const voiceId = decodeURIComponent(prevMatch[1]);
      if (!VOICES[voiceId]) return json(res, 404, { error: 'unknown_voice' });
      const out = await synthesize(voiceId, 'Hello! This is a preview of my voice.');
      res.writeHead(200, {
        'Content-Type': out.contentType,
        'Content-Length': out.buffer.length,
        'Cache-Control': 'public, max-age=86400',
        'X-TTS-Cache': out.cached ? 'hit' : 'miss',
      });
      return res.end(out.buffer);
    }

    json(res, 404, { error: 'not_found' });
  } catch (e) {
    const msg = String(e && e.message || e);
    const code = msg.startsWith('model_missing') ? 503 : msg === 'unknown_voice' ? 404 : 500;
    json(res, code, { error: msg.slice(0, 200) });
  }
});

fs.mkdirSync(CACHE_DIR, { recursive: true });
server.listen(PORT, () => {
  console.log(`[voice-tts] listening on :${PORT} piper=${PIPER} espeak=${ESPEAK_DATA || 'default'} ffmpeg=${FFMPEG}`);
});
