// TTS Engine using Web Speech API — ported from
// word-tycoon-ecosystem/chat-relay/public/js/tts.js
const TTS = (() => {
  let enabled = true;
  let voices = [];
  let queue = [];
  let speaking = false;
  let volume = 0.8;
  let rate = 1;
  let pitch = 1;

  function init() {
    if (!('speechSynthesis' in window)) {
      console.warn('[TTS] Web Speech API not supported');
      return;
    }

    // Load voices
    loadVoices();
    speechSynthesis.onvoiceschanged = loadVoices;
  }

  function loadVoices() {
    voices = speechSynthesis.getVoices();
    console.log(`[TTS] Loaded ${voices.length} voices`);
    renderVoicesList();
  }

  function getVoices() {
    return voices;
  }

  function findVoice(name) {
    if (!name) return null;
    const lower = name.toLowerCase();
    // Exact match first
    let v = voices.find(v => v.name.toLowerCase() === lower);
    if (v) return v;
    // Partial match
    v = voices.find(v => v.name.toLowerCase().includes(lower));
    if (v) return v;
    // Short name match (e.g., "david" matches "Microsoft David")
    v = voices.find(v => {
      const parts = v.name.toLowerCase().split(/[\s-]+/);
      return parts.some(p => p === lower);
    });
    return v;
  }

  function speak(text, voiceName) {
    if (!enabled) return;
    if (!('speechSynthesis' in window)) return;

    queue.push({ text, voiceName });
    processQueue();
  }

  function processQueue() {
    if (speaking || queue.length === 0) return;

    speaking = true;
    const { text, voiceName } = queue.shift();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = volume;
    utterance.rate = rate;
    utterance.pitch = pitch;

    const voice = findVoice(voiceName);
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onend = () => {
      speaking = false;
      processQueue();
    };

    utterance.onerror = () => {
      speaking = false;
      processQueue();
    };

    speechSynthesis.speak(utterance);
  }

  function setEnabled(val) {
    enabled = val;
    if (!val) {
      speechSynthesis.cancel();
      queue = [];
      speaking = false;
    }
  }

  function setVolume(val) {
    volume = val;
  }

  function setRate(val) {
    rate = val;
  }

  function setPitch(val) {
    pitch = val;
  }

  function isEnabled() {
    return enabled;
  }

  function renderVoicesList() {
    const container = document.getElementById('voices-list');
    if (!container) return;

    if (voices.length === 0) {
      container.innerHTML = '<span class="voice-tag">Loading voices...</span>';
      return;
    }

    container.innerHTML = voices.map(v => {
      const shortName = v.name.replace(/Microsoft\s+/i, '').replace(/Google\s+/i, 'G:');
      return `<span class="voice-tag" title="${v.name} (${v.lang})">${shortName}</span>`;
    }).join('');
  }

  return {
    init,
    speak,
    getVoices,
    findVoice,
    setEnabled,
    setVolume,
    setRate,
    setPitch,
    isEnabled,
    renderVoicesList
  };
})();
