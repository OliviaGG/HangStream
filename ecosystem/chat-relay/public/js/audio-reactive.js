// ============================================================
// AUX Audio-Reactive Engine
// Drives AUX cosmetic visuals from live audio input.
// Uses Web Audio API to capture audio (works in OBS browser
// sources with "Control audio via OBS" enabled).
// Click "Enable Audio" button if auto-capture fails.
// Falls back to ambient sine-wave pulsing when no audio.
// ============================================================
window.AuxAudio = (function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────
  var audioCtx = null;
  var analyser = null;
  var dataArray = null;
  var isActive = false;
  var rafId = null;
  var enableBtn = null;

  // Smoothed frequency bands (0.0 – 1.0)
  var bands = { bass: 0, mid: 0, treble: 0, energy: 0 };
  var SMOOTH = 0.15; // EMA factor — lower = smoother

  // Beat detection
  var BEAT_HISTORY_LEN = 40;
  var BEAT_THRESHOLD = 1.35;
  var BEAT_COOLDOWN_MS = 180;
  var beatHistory = [];
  var lastBeatTime = 0;
  var isBeat = false;

  // Registered elements: Map<Element, string profileId>
  var elements = new Map();

  // ─── Audio Setup ───────────────────────────────────────
  function setupAudio(stream) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    var source = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256; // 128 frequency bins
    analyser.smoothingTimeConstant = 0.75;
    source.connect(analyser);
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    isActive = true;
    removeEnableBtn();
    console.log('[AuxAudio] Audio capture active (' + analyser.frequencyBinCount + ' bins)');
  }

  // ─── Enable Button ─────────────────────────────────────
  function removeEnableBtn() {
    if (enableBtn && enableBtn.parentNode) {
      enableBtn.parentNode.removeChild(enableBtn);
      enableBtn = null;
    }
  }

  function showEnableButton() {
    if (enableBtn || isActive) return;
    enableBtn = document.createElement('button');
    enableBtn.id = 'aux-enable-audio';
    enableBtn.textContent = 'Enable Audio Reactivity';
    enableBtn.style.cssText =
      'position:fixed;top:10px;right:10px;z-index:99999;' +
      'background:rgba(0,255,204,0.12);color:#00ffcc;' +
      'border:1px solid rgba(0,255,204,0.3);border-radius:6px;' +
      'padding:8px 16px;font-size:13px;cursor:pointer;' +
      'font-family:inherit;backdrop-filter:blur(4px);' +
      'transition:background 0.2s;letter-spacing:0.5px;';
    enableBtn.onmouseenter = function () {
      enableBtn.style.background = 'rgba(0,255,204,0.25)';
    };
    enableBtn.onmouseleave = function () {
      enableBtn.style.background = 'rgba(0,255,204,0.12)';
    };
    enableBtn.onclick = function () {
      enableBtn.textContent = 'Connecting...';
      enableBtn.style.pointerEvents = 'none';
      tryCapture().then(function (ok) {
        if (!ok && enableBtn) {
          enableBtn.textContent = 'Enable Audio Reactivity';
          enableBtn.style.pointerEvents = '';
        }
      });
    };
    document.body.appendChild(enableBtn);
  }

  // ─── Audio Capture ─────────────────────────────────────
  function tryCapture() {
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      .then(function (stream) {
        setupAudio(stream);
        return true;
      })
      .catch(function (e) {
        console.warn('[AuxAudio] getUserMedia failed:', e.message);
        return false;
      });
  }

  async function init() {
    var ok = await tryCapture();
    if (!ok) {
      console.log('[AuxAudio] Auto-capture failed — click "Enable Audio Reactivity" button.');
      console.log('[AuxAudio] OBS: Right-click browser source > Interact > click button.');
      console.log('[AuxAudio] Tip: Enable "Control audio via OBS" on the browser source for desktop audio.');
      console.log('[AuxAudio] Ambient fallback active.');
      showEnableButton();
    }
    if (!rafId) tick();
  }

  // ─── Analysis ────────────────────────────────────────────
  function analyse() {
    if (isActive && analyser) {
      analyser.getByteFrequencyData(dataArray);
      var bins = dataArray.length; // 128
      var bassEnd = 8;    // bins 0-7   ~20-250 Hz
      var midEnd = 40;    // bins 8-39  ~250-2500 Hz
      // treble: bins 40-127 ~2500-20000 Hz

      var bSum = 0, mSum = 0, tSum = 0;
      for (var i = 0; i < bassEnd; i++) bSum += dataArray[i];
      for (var i = bassEnd; i < midEnd; i++) mSum += dataArray[i];
      for (var i = midEnd; i < bins; i++) tSum += dataArray[i];

      var rawBass = bSum / (bassEnd * 255);
      var rawMid = mSum / ((midEnd - bassEnd) * 255);
      var rawTreble = tSum / ((bins - midEnd) * 255);

      bands.bass += SMOOTH * (rawBass - bands.bass);
      bands.mid += SMOOTH * (rawMid - bands.mid);
      bands.treble += SMOOTH * (rawTreble - bands.treble);
      bands.energy = 0.5 * bands.bass + 0.3 * bands.mid + 0.2 * bands.treble;

      // Beat detection — compare current bass to rolling average
      beatHistory.push(bands.bass);
      if (beatHistory.length > BEAT_HISTORY_LEN) beatHistory.shift();
      var avg = beatHistory.reduce(function (a, b) { return a + b; }, 0) / beatHistory.length;
      var now = performance.now();
      if (bands.bass > avg * BEAT_THRESHOLD && (now - lastBeatTime) > BEAT_COOLDOWN_MS && bands.bass > 0.15) {
        isBeat = true;
        lastBeatTime = now;
      } else {
        isBeat = false;
      }
    } else {
      // Ambient fallback — gentle sine waves
      var t = performance.now() / 1000;
      bands.bass = 0.30 + 0.18 * Math.sin(t * 1.2);
      bands.mid = 0.25 + 0.12 * Math.sin(t * 0.8 + 1.0);
      bands.treble = 0.20 + 0.10 * Math.sin(t * 1.5 + 2.0);
      bands.energy = 0.25 + 0.12 * Math.sin(t * 1.0 + 0.5);
      // Simulate occasional "beats" in ambient mode
      isBeat = Math.sin(t * 1.2) > 0.92;
    }
  }

  // ─── Reactive Profiles ───────────────────────────────────
  // Each profile defines how audio bands map to CSS properties.

  function applyFrequency(el) {
    var b = bands.bass, m = bands.mid, t = bands.treble, e = bands.energy;
    var hue = (performance.now() / 25 + m * 140 + t * 80) % 360;
    var light = 55 + t * 20;
    var g1 = 8 + e * 20;
    var g2 = 16 + e * 30;
    var a1 = 0.4 + e * 0.5;
    el.style.color = 'hsl(' + hue + ',100%,' + light + '%)';
    el.style.textShadow = '0 0 ' + g1 + 'px hsla(' + hue + ',100%,60%,' + a1 + '), 0 0 ' + g2 + 'px hsla(' + ((hue + 40) % 360) + ',100%,50%,' + (a1 * 0.5) + ')';
  }

  function applyBassdrop(el) {
    var b = bands.bass;
    var s1 = 6 + b * 30;
    var s2 = 12 + b * 45;
    var s3 = b * 60;
    var a = 0.3 + b * 0.7;
    el.style.textShadow = '0 0 ' + s1 + 'px rgba(0,255,204,' + a + '), 0 0 ' + s2 + 'px rgba(0,200,255,' + (a * 0.7) + '), 0 0 ' + s3 + 'px rgba(128,0,255,' + (a * 0.4) + ')';
    el.style.transform = 'scale(' + (1 + b * 0.06) + ')';
  }

  function applyEqualizer(el) {
    var b = bands.bass, m = bands.mid, t = bands.treble, e = bands.energy;
    var hue = 170 + b * 40 - t * 50;
    var sw = 8 + e * 24;
    var a = 0.3 + e * 0.5;
    el.style.borderColor = 'hsl(' + hue + ',100%,' + (50 + e * 20) + '%)';
    el.style.boxShadow = '0 0 ' + sw + 'px hsla(' + hue + ',100%,55%,' + a + '), 0 0 ' + (sw * 2) + 'px hsla(' + ((hue + 30) % 360) + ',100%,50%,' + (a * 0.5) + '), inset 0 0 ' + (sw * 0.4) + 'px hsla(' + hue + ',100%,60%,' + (m * 0.3) + ')';
  }

  function applySubwoofer(el) {
    var b = bands.bass;
    var burst = isBeat ? 1.5 : 1.0;
    var s1 = (10 + b * 35) * burst;
    var s2 = (20 + b * 55) * burst;
    var s3 = (b * 80) * burst;
    var a = 0.3 + b * 0.6;
    el.style.boxShadow = '0 0 ' + s1 + 'px rgba(0,255,204,' + a + '), 0 0 ' + s2 + 'px rgba(0,200,255,' + (a * 0.6) + '), 0 0 ' + s3 + 'px rgba(128,0,255,' + (a * 0.35) + ')';
  }

  function applyReverb(el) {
    var m = bands.mid, t = bands.treble;
    var shadows = [];
    shadows.push('0 0 ' + (6 + m * 12) + 'px rgba(0,255,204,' + (0.4 + m * 0.5) + ')');
    shadows.push('0 0 ' + (14 + m * 18) + 'px rgba(0,200,255,' + (0.2 + m * 0.4) + ')');
    shadows.push('0 0 ' + (22 + t * 22) + 'px rgba(128,0,255,' + (0.1 + t * 0.35) + ')');
    shadows.push('0 0 ' + (30 + t * 20) + 'px rgba(0,255,204,' + (t * 0.15) + ')');
    el.style.textShadow = shadows.join(', ');
  }

  function applySynthwave(el) {
    var b = bands.bass, e = bands.energy;
    var t = performance.now() / 1000;
    var speed = 0.3 + e * 0.8;
    // Neon palette: cyan, magenta, sky blue, orange
    var colors = [[0, 255, 204], [255, 0, 255], [0, 204, 255], [255, 102, 0]];
    var idx = (t * speed) % colors.length;
    var i = Math.floor(idx);
    var f = idx - i;
    var c1 = colors[i % colors.length];
    var c2 = colors[(i + 1) % colors.length];
    var r = Math.round(c1[0] + f * (c2[0] - c1[0]));
    var g = Math.round(c1[1] + f * (c2[1] - c1[1]));
    var bl = Math.round(c1[2] + f * (c2[2] - c1[2]));
    var glow = 4 + e * 12;
    el.style.color = 'rgb(' + r + ',' + g + ',' + bl + ')';
    el.style.textShadow = '0 0 ' + glow + 'px rgba(' + r + ',' + g + ',' + bl + ',' + (0.4 + e * 0.5) + ')';
  }

  function applyDj(el) {
    var b = bands.bass, m = bands.mid, t = bands.treble;
    var burst = isBeat ? 1.3 : 1.0;
    var s1 = (6 + b * 16) * burst;
    var s2 = (12 + m * 22) * burst;
    var s3 = (t * 30) * burst;
    var a1 = 0.4 + b * 0.5;
    var a2 = 0.2 + m * 0.4;
    var a3 = t * 0.4;
    el.style.textShadow = '0 0 ' + s1 + 'px rgba(0,255,204,' + a1 + '), 0 0 ' + s2 + 'px rgba(0,200,255,' + a2 + '), 0 0 ' + s3 + 'px rgba(128,0,255,' + a3 + ')';
  }

  function applySonicboom(el) {
    var b = bands.bass;
    if (isBeat) {
      el.classList.remove('aux-sonic-burst');
      void el.offsetWidth;
      el.classList.add('aux-sonic-burst');
    }
    var glow = 6 + b * 18;
    var a = 0.3 + b * 0.4;
    el.style.textShadow = '0 0 ' + glow + 'px rgba(0,255,204,' + a + '), 0 0 ' + (glow * 1.5) + 'px rgba(255,255,255,' + (a * 0.4) + ')';
  }

  // Profile map: cosmetic ID → apply function
  var profileMap = {
    'aux_wc_frequency': applyFrequency,
    'aux_wg_bassdrop': applyBassdrop,
    'aux_pb_equalizer': applyEqualizer,
    'aux_pg_subwoofer': applySubwoofer,
    'aux_ng_reverb': applyReverb,
    'aux_nc_synthwave': applySynthwave,
    'aux_tt_dj': applyDj,
    'aux_we_sonicboom': applySonicboom
  };

  // Also support short profile names (for Chat Relay overlays)
  profileMap['frequency'] = applyFrequency;
  profileMap['bassdrop'] = applyBassdrop;
  profileMap['equalizer'] = applyEqualizer;
  profileMap['subwoofer'] = applySubwoofer;
  profileMap['reverb'] = applyReverb;
  profileMap['synthwave'] = applySynthwave;
  profileMap['dj'] = applyDj;
  profileMap['sonicboom'] = applySonicboom;

  // ─── rAF Loop ────────────────────────────────────────────
  function tick() {
    analyse();
    if (elements.size > 0) {
      elements.forEach(function (profileId, el) {
        var fn = profileMap[profileId];
        if (fn) fn(el);
      });
    }
    rafId = requestAnimationFrame(tick);
  }

  // ─── Public API ──────────────────────────────────────────
  return {
    init: init,

    registerElement: function (el, profileId) {
      if (el && profileId && profileMap[profileId]) {
        elements.set(el, profileId);
      }
    },

    unregisterElement: function (el) {
      elements.delete(el);
      // Clear inline styles so CSS fallback can take over
      if (el) {
        el.style.color = '';
        el.style.textShadow = '';
        el.style.boxShadow = '';
        el.style.borderColor = '';
        el.style.transform = '';
      }
    },

    unregisterAll: function () {
      elements.forEach(function (profileId, el) {
        el.style.color = '';
        el.style.textShadow = '';
        el.style.boxShadow = '';
        el.style.borderColor = '';
        el.style.transform = '';
      });
      elements.clear();
    },

    getBands: function () {
      return { bass: bands.bass, mid: bands.mid, treble: bands.treble, energy: bands.energy, beat: isBeat };
    },

    isAudioActive: function () { return isActive; },

    profiles: profileMap
  };
})();
