/**
 * Build frequency.json from wordfreq-en-25000 raw data.
 * Downloads from GitHub if not already present, converts ln_freq to Zipf scores.
 *
 * Usage: node tools/build-frequency.js [path-to-raw-json]
 */

const fs = require('fs');
const path = require('path');

const RAW_PATH = process.argv[2] || '/tmp/wordfreq-raw.json';
const OUT_PATH = path.join(__dirname, '..', 'data', 'word-bank', 'frequency.json');

if (!fs.existsSync(RAW_PATH)) {
  console.error('Raw data not found at', RAW_PATH);
  console.error('Download it first: curl -sL https://raw.githubusercontent.com/aparrish/wordfreq-en-25000/master/wordfreq-en-25000-log.json -o /tmp/wordfreq-raw.json');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(RAW_PATH, 'utf-8'));
const freq = {};
let count = 0;
let skipped = 0;

for (const [word, lnFreq] of raw) {
  const w = word.toLowerCase().trim();
  // Only include pure alphabetic words
  if (!w || !/^[a-z]+$/.test(w)) {
    skipped++;
    continue;
  }
  // Convert natural-log frequency to Zipf scale
  // Zipf = log10(freq_per_billion) = ln_freq / ln(10) + 9
  const zipf = Math.round((lnFreq * 0.4342944 + 9) * 100) / 100;
  freq[w] = zipf;
  count++;
}

fs.writeFileSync(OUT_PATH, JSON.stringify(freq, null, 2));

const fileSize = (fs.statSync(OUT_PATH).size / 1024).toFixed(1);
console.log(`Wrote ${count} entries to ${OUT_PATH} (${fileSize} KB)`);
console.log(`Skipped ${skipped} non-alphabetic entries`);

// Verify key words
console.log('\n=== Verification ===');
const checks = ['the', 'of', 'teeth', 'then', 'phone', 'cent', 'heck', 'niche', 'teen', 'tektite', 'qoph', 'abode', 'wren'];
for (const w of checks) {
  console.log(`  ${w}: Zipf ${freq[w] !== undefined ? freq[w] : 'NOT FOUND'}`);
}

// Distribution
const ranges = { '7+': 0, '6-7': 0, '5-6': 0, '4-5': 0, '3-4': 0, '2-3': 0, '<2': 0 };
for (const z of Object.values(freq)) {
  if (z >= 7) ranges['7+']++;
  else if (z >= 6) ranges['6-7']++;
  else if (z >= 5) ranges['5-6']++;
  else if (z >= 4) ranges['4-5']++;
  else if (z >= 3) ranges['3-4']++;
  else if (z >= 2) ranges['2-3']++;
  else ranges['<2']++;
}
console.log('\n=== Zipf Distribution ===');
for (const [range, count] of Object.entries(ranges)) {
  console.log(`  ${range}: ${count} words`);
}
