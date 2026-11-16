/**
 * Generate a simple alert beep WAV file
 * 3 short beeps at 880Hz with pauses
 */
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE = 48000;
const BITS = 16;
const CHANNELS = 1;
const BEEP_FREQ = 880;
const BEEP_DURATION = 0.3;  // seconds
const PAUSE_DURATION = 0.2;
const REPEATS = 5;
const VOLUME = 0.8;

const totalDuration = REPEATS * (BEEP_DURATION + PAUSE_DURATION);
const totalSamples = Math.floor(SAMPLE_RATE * totalDuration);
const samples = new Int16Array(totalSamples);

for (let rep = 0; rep < REPEATS; rep++) {
    const beepStart = Math.floor(rep * (BEEP_DURATION + PAUSE_DURATION) * SAMPLE_RATE);
    const beepEnd = beepStart + Math.floor(BEEP_DURATION * SAMPLE_RATE);
    for (let i = beepStart; i < beepEnd && i < totalSamples; i++) {
        const t = (i - beepStart) / SAMPLE_RATE;
        // Fade in/out for click-free
        const env = Math.min(t / 0.01, 1) * Math.min((BEEP_DURATION - t) / 0.01, 1);
        samples[i] = Math.floor(Math.sin(2 * Math.PI * BEEP_FREQ * t) * 32767 * VOLUME * env);
    }
}

// Write WAV
const dataSize = totalSamples * CHANNELS * (BITS / 8);
const buf = Buffer.alloc(44 + dataSize);

// RIFF header
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + dataSize, 4);
buf.write('WAVE', 8);
// fmt chunk
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(CHANNELS, 22);
buf.writeUInt32LE(SAMPLE_RATE, 24);
buf.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BITS / 8), 28);
buf.writeUInt16LE(CHANNELS * (BITS / 8), 32);
buf.writeUInt16LE(BITS, 34);
// data chunk
buf.write('data', 36);
buf.writeUInt32LE(dataSize, 40);

for (let i = 0; i < totalSamples; i++) {
    buf.writeInt16LE(samples[i], 44 + i * 2);
}

const outPath = path.join(__dirname, 'afk-alert.wav');
fs.writeFileSync(outPath, buf);
console.log(`Generated: ${outPath} (${(buf.length / 1024).toFixed(1)} KB, ${totalDuration.toFixed(1)}s)`);
