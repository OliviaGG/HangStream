/**
 * Build expanded frequency.json using combined frequency sources.
 *
 * Priority order:
 *   1. wordfreq-full.json — PRIMARY (Python wordfreq library, 7+ combined corpora)
 *   2. en_50k.txt — FALLBACK for words not in wordfreq (capped at 4.0 Zipf)
 *   3. Inflection derivation — DISCOUNTED (base_zipf - 1.0) for words not in sources 1-2
 *
 * All words validated against dictionary.json — only real game words are kept.
 *
 * Prerequisites: Run `python tools/generate-wordfreq.py` first to create wordfreq-full.json
 * Usage: node tools/build-frequency-expanded.js
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const DATA_DIR = path.join(__dirname, '..', 'data', 'word-bank');
const FREQ_PATH = path.join(DATA_DIR, 'frequency.json');
const DICT_PATH = path.join(DATA_DIR, 'dictionary.json');
const WORDFREQ_PATH = path.join(DATA_DIR, 'wordfreq-full.json');
const EN50K_CACHE = path.join(DATA_DIR, 'en_50k.txt');
const EN50K_URL = 'https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/en/en_50k.txt';

// en_50k fallback is capped to prevent foreign-word inflation (rester, ares, etc.)
const EN50K_CAP = 4.0;

// Inflection derivation discount — inflected forms get base_zipf minus this value
const INFLECTION_DISCOUNT = 1.0;

// ─── Helpers ────────────────────────────────────────────────────────

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);
    const file = fs.createWriteStream(dest);
    https.get(url, res => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return download(res.headers.location, dest).then(resolve, reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', err => { fs.unlinkSync(dest); reject(err); });
  });
}

const VOWELS = new Set('aeiou');

/**
 * Generate inflected forms for a base word.
 * Returns array of candidate strings (may not be real words — caller must validate).
 */
function generateInflections(base) {
  const candidates = [];
  const len = base.length;
  if (len < 3) return candidates;

  const last = base[len - 1];
  const endsInE = last === 'e';
  const endsInY = last === 'y' && len > 3 && !VOWELS.has(base[len - 2]);
  const canDouble = len >= 3
    && !VOWELS.has(last)
    && VOWELS.has(base[len - 2])
    && !VOWELS.has(base[len - 3])
    && !['w', 'x', 'y'].includes(last);

  // Plurals
  if (endsInY) candidates.push(base.slice(0, -1) + 'ies');
  else if (/(?:s|x|z|ch|sh)$/.test(base)) candidates.push(base + 'es');
  candidates.push(base + 's');

  // Past tense
  if (endsInY) candidates.push(base.slice(0, -1) + 'ied');
  else if (endsInE) candidates.push(base + 'd');
  else {
    candidates.push(base + 'ed');
    if (canDouble) candidates.push(base + last + 'ed');
  }

  // Present participle
  if (endsInE && !base.endsWith('ee') && !base.endsWith('ye')) {
    candidates.push(base.slice(0, -1) + 'ing');
  } else {
    candidates.push(base + 'ing');
  }
  if (canDouble) candidates.push(base + last + 'ing');

  // Comparative/agent (+er)
  if (endsInY) candidates.push(base.slice(0, -1) + 'ier');
  else if (endsInE) candidates.push(base + 'r');
  else {
    candidates.push(base + 'er');
    if (canDouble) candidates.push(base + last + 'er');
  }

  // Superlative (+est)
  if (endsInY) candidates.push(base.slice(0, -1) + 'iest');
  else if (endsInE) candidates.push(base.slice(0, -1) + 'est');
  else {
    candidates.push(base + 'est');
    if (canDouble) candidates.push(base + last + 'est');
  }

  // Adverb (+ly)
  if (endsInY) candidates.push(base.slice(0, -1) + 'ily');
  else candidates.push(base + 'ly');

  // Noun (+ness)
  if (endsInY) candidates.push(base.slice(0, -1) + 'iness');
  else candidates.push(base + 'ness');

  return candidates;
}


// ─── Main ───────────────────────────────────────────────────────────

async function main() {
  // ── Step 1: Load sources ──────────────────────────────────────────

  console.log('=== Step 1: Loading data sources ===');

  // Load dictionary for validation
  const dictRaw = JSON.parse(fs.readFileSync(DICT_PATH, 'utf-8'));
  const dictSet = new Set();
  for (const words of Object.values(dictRaw)) {
    for (const w of words) dictSet.add(w.toLowerCase());
  }
  console.log(`  Dictionary: ${dictSet.size} words`);

  // Load wordfreq-full.json (PRIMARY source)
  if (!fs.existsSync(WORDFREQ_PATH)) {
    console.error(`\n❌ ${WORDFREQ_PATH} not found!`);
    console.error('   Run "python tools/generate-wordfreq.py" first.');
    process.exit(1);
  }
  const wordfreqFull = JSON.parse(fs.readFileSync(WORDFREQ_PATH, 'utf-8'));
  console.log(`  wordfreq-full.json: ${Object.keys(wordfreqFull).length} entries (PRIMARY)`);

  // Download en_50k.txt if not cached
  if (!fs.existsSync(EN50K_CACHE)) {
    await download(EN50K_URL, EN50K_CACHE);
    console.log(`  Downloaded en_50k.txt`);
  } else {
    console.log(`  Using cached en_50k.txt`);
  }

  // Parse en_50k.txt → Zipf scores
  const en50kText = fs.readFileSync(EN50K_CACHE, 'utf-8');
  const en50kLines = en50kText.trim().split('\n');
  const en50kFreq = {};
  let totalCorpus = 0;

  for (const line of en50kLines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) continue;
    const word = parts[0].toLowerCase();
    const count = parseInt(parts[1], 10);
    if (!word || isNaN(count) || !/^[a-z]+$/.test(word)) continue;
    en50kFreq[word] = count;
    totalCorpus += count;
  }
  // Convert raw counts to Zipf
  for (const [word, count] of Object.entries(en50kFreq)) {
    const perBillion = (count / totalCorpus) * 1e9;
    en50kFreq[word] = Math.round(Math.log10(perBillion) * 100) / 100;
  }
  console.log(`  en_50k.txt: ${Object.keys(en50kFreq).length} entries (FALLBACK, capped at ${EN50K_CAP})`);

  // ── Step 2: Merge with wordfreq as primary authority ──────────────

  console.log('\n=== Step 2: Merging (wordfreq primary, en_50k fallback) ===');
  const merged = {};
  let fromWordfreq = 0, fromEn50k = 0, fromInflection = 0;

  // Add all wordfreq entries (primary — these override everything)
  for (const [word, zipf] of Object.entries(wordfreqFull)) {
    if (dictSet.has(word)) {
      merged[word] = zipf;
      fromWordfreq++;
    }
  }

  // Add en_50k entries ONLY for words not already covered by wordfreq
  // Cap at EN50K_CAP to prevent foreign-word inflation
  for (const [word, zipf] of Object.entries(en50kFreq)) {
    if (dictSet.has(word) && merged[word] === undefined) {
      merged[word] = Math.min(zipf, EN50K_CAP);
      fromEn50k++;
    }
  }

  console.log(`  From wordfreq: ${fromWordfreq}`);
  console.log(`  From en_50k (fallback): ${fromEn50k}`);
  console.log(`  Merged total: ${Object.keys(merged).length}`);

  // ── Step 3: Derive inflections (discounted) ───────────────────────

  console.log(`\n=== Step 3: Deriving inflections (discount: -${INFLECTION_DISCOUNT}) ===`);
  const baseWords = Object.entries(merged);

  for (const [base, baseZipf] of baseWords) {
    const candidates = generateInflections(base);
    const derivedZipf = Math.max(0, baseZipf - INFLECTION_DISCOUNT);
    if (derivedZipf <= 0) continue; // skip if base is already too low

    for (const candidate of candidates) {
      // Only add if: in dictionary AND not already in merged (sources 1+2 take priority)
      if (dictSet.has(candidate) && merged[candidate] === undefined) {
        merged[candidate] = Math.round(derivedZipf * 100) / 100;
        fromInflection++;
      }
    }
  }

  console.log(`  New inflected forms added: ${fromInflection}`);
  console.log(`  Total after inflections: ${Object.keys(merged).length}`);

  // ── Step 4: Write output ──────────────────────────────────────────

  console.log('\n=== Step 4: Writing frequency.json ===');

  // Backup current frequency.json
  const backupPath = FREQ_PATH.replace('.json', '-pre-v2-backup.json');
  if (fs.existsSync(FREQ_PATH)) {
    fs.copyFileSync(FREQ_PATH, backupPath);
    console.log(`  Backed up current to ${path.basename(backupPath)}`);
  }

  // Sort alphabetically
  const sorted = {};
  for (const key of Object.keys(merged).sort()) {
    sorted[key] = merged[key];
  }

  fs.writeFileSync(FREQ_PATH, JSON.stringify(sorted, null, 2));
  const fileSize = (fs.statSync(FREQ_PATH).size / 1024).toFixed(1);
  console.log(`  Wrote ${Object.keys(sorted).length} entries (${fileSize} KB)`);

  // ── Step 5: Stats & verification ──────────────────────────────────

  console.log('\n=== Final Stats ===');
  console.log(`  Sources: wordfreq=${fromWordfreq}, en_50k=${fromEn50k}, inflections=${fromInflection}`);
  console.log(`  Total: ${Object.keys(sorted).length}`);

  // Coverage
  let dictCount = 0, covered = 0;
  for (const words of Object.values(dictRaw)) {
    for (const w of words) {
      dictCount++;
      if (merged[w.toLowerCase()]) covered++;
    }
  }
  console.log(`  Dictionary coverage: ${covered} / ${dictCount} = ${(covered / dictCount * 100).toFixed(1)}%`);

  // Zipf distribution
  const ranges = { '7+': 0, '6-7': 0, '5-6': 0, '4-5': 0, '3-4': 0, '2-3': 0, '<2': 0 };
  for (const z of Object.values(merged)) {
    if (z >= 7) ranges['7+']++;
    else if (z >= 6) ranges['6-7']++;
    else if (z >= 5) ranges['5-6']++;
    else if (z >= 4) ranges['4-5']++;
    else if (z >= 3) ranges['3-4']++;
    else if (z >= 2) ranges['2-3']++;
    else ranges['<2']++;
  }
  console.log('\n  Zipf distribution (Word Mine tier mapping):');
  console.log(`    7+   : ${ranges['7+'].toString().padStart(6)} words  (surface — ultra common)`);
  console.log(`    6-7  : ${ranges['6-7'].toString().padStart(6)} words  (surface)`);
  console.log(`    5-6  : ${ranges['5-6'].toString().padStart(6)} words  (surface — ≥5.0)`);
  console.log(`    4-5  : ${ranges['4-5'].toString().padStart(6)} words  (shallow)`);
  console.log(`    3-4  : ${ranges['3-4'].toString().padStart(6)} words  (medium)`);
  console.log(`    2-3  : ${ranges['2-3'].toString().padStart(6)} words  (deep)`);
  console.log(`    <2   : ${ranges['<2'].toString().padStart(6)} words  (deep/core)`);

  // Spot checks — the problem words
  console.log('\n=== Spot Checks ===');
  const checks = [
    ['tree', 'rester', '← tree should be higher'],
    ['take', 'ares', '← take should be much higher'],
    ['best', 'justing', '← best should be much higher'],
    ['house', 'noter', '← house should be much higher'],
    ['love', 'withing', '← love should be much higher'],
    ['walks', 'walked', '← common inflections should have scores'],
    ['running', 'biggest', '← common inflections'],
  ];
  for (const [a, b, note] of checks) {
    const za = merged[a] || 0;
    const zb = merged[b] || 0;
    const ok = za > zb ? '✅' : '❌';
    console.log(`  ${ok} ${a}(${za.toFixed(2)}) vs ${b}(${zb.toFixed(2)})  ${note}`);
  }
}

main().catch(err => {
  console.error('Build failed:', err);
  process.exit(1);
});
