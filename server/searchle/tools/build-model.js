const fs = require('fs');
const path = require('path');
const readline = require('readline');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MODELS_DIR = path.join(DATA_DIR, 'models');
const TARGET_WORDS_FILE = path.join(DATA_DIR, 'target-words.json');

// ---- Model source definitions ----
const MODEL_DEFS = {
  'glove-300d': {
    sourceFile: path.join(DATA_DIR, 'glove', 'glove.6B.300d.txt'),
    format: 'text',       // GloVe text format: word f1 f2 ... f300
    dimensions: 300,
    description: 'GloVe 6B 300d',
  },
  'word2vec': {
    sourceFile: path.join(DATA_DIR, 'word2vec', 'GoogleNews-vectors-negative300.bin'),
    format: 'word2vec-bin', // Word2Vec binary format
    dimensions: 300,
    description: 'Word2Vec Google News 300d',
  },
  'fasttext': {
    sourceFile: path.join(DATA_DIR, 'fasttext', 'wiki-news-300d-1M.vec'),
    format: 'text',        // FastText text format (same as GloVe, first line is header)
    dimensions: 300,
    description: 'FastText wiki-news 300d',
  },
};

// ---- Helpers ----
function isAlphaLower(s) {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c < 97 || c > 122) return false;
  }
  return true;
}

// ---- Parse GloVe / FastText text format ----
async function parseTextFormat(sourceFile, dimensions) {
  const words = [];
  const vectors = [];
  let totalLines = 0;
  let skipped = 0;

  const rl = readline.createInterface({
    input: fs.createReadStream(sourceFile, 'utf-8'),
    crlfDelay: Infinity,
  });

  let isFirstLine = true;

  for await (const line of rl) {
    totalLines++;

    // FastText files have a header line: "999994 300"
    if (isFirstLine) {
      isFirstLine = false;
      const parts = line.trim().split(' ');
      if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        console.log(`  Header detected: ${parts[0]} words, ${parts[1]} dimensions`);
        continue; // skip header
      }
    }

    if (totalLines % 100000 === 0) {
      process.stdout.write(`\r  Processed ${totalLines.toLocaleString()} lines, kept ${words.length.toLocaleString()} words`);
    }

    const spaceIdx = line.indexOf(' ');
    if (spaceIdx === -1) { skipped++; continue; }

    const word = line.substring(0, spaceIdx);

    if (word.length < 2 || !isAlphaLower(word)) { skipped++; continue; }

    const vectorStr = line.substring(spaceIdx + 1);
    const parts = vectorStr.split(' ');
    if (parts.length !== dimensions) { skipped++; continue; }

    const vec = new Float32Array(dimensions);
    let valid = true;
    for (let i = 0; i < dimensions; i++) {
      vec[i] = parseFloat(parts[i]);
      if (isNaN(vec[i])) { valid = false; break; }
    }
    if (!valid) { skipped++; continue; }

    // Skip duplicates (some files have them)
    // We keep first occurrence
    words.push(word);
    vectors.push(vec);
  }

  console.log(`\r  Processed ${totalLines.toLocaleString()} lines, kept ${words.length.toLocaleString()} words`);
  console.log(`  Skipped ${skipped.toLocaleString()} entries`);

  return { words, vectors };
}

// ---- Parse Word2Vec binary format ----
async function parseWord2VecBinary(sourceFile, dimensions) {
  const words = [];
  const vectors = [];

  const fd = fs.openSync(sourceFile, 'r');
  const stat = fs.fstatSync(fd);
  const fileSize = stat.size;

  // Read header line (text): "3000000 300\n"
  const headerBuf = Buffer.alloc(64);
  fs.readSync(fd, headerBuf, 0, 64, 0);
  const headerStr = headerBuf.toString('ascii');
  const newlineIdx = headerStr.indexOf('\n');
  const headerParts = headerStr.substring(0, newlineIdx).trim().split(' ');
  const wordCount = parseInt(headerParts[0], 10);
  const dims = parseInt(headerParts[1], 10);
  console.log(`  Header: ${wordCount.toLocaleString()} words, ${dims} dimensions`);

  if (dims !== dimensions) {
    throw new Error(`Expected ${dimensions} dimensions but file has ${dims}`);
  }

  let offset = newlineIdx + 1;
  const vecByteLen = dims * 4; // float32 = 4 bytes
  const wordBuf = Buffer.alloc(256);
  const vecBuf = Buffer.alloc(vecByteLen);
  let skipped = 0;

  for (let i = 0; i < wordCount; i++) {
    if (i > 0 && i % 100000 === 0) {
      process.stdout.write(`\r  Processed ${i.toLocaleString()} / ${wordCount.toLocaleString()} words, kept ${words.length.toLocaleString()}`);
    }

    // Read word: bytes until space (0x20) or newline
    let wordLen = 0;
    let bytesRead;
    while (true) {
      bytesRead = fs.readSync(fd, wordBuf, wordLen, 1, offset);
      if (bytesRead === 0) break;
      offset++;
      const ch = wordBuf[wordLen];
      if (ch === 0x20 || ch === 0x0a) break; // space or newline
      wordLen++;
      if (wordLen >= 256) break;
    }

    // Read vector (dims * 4 bytes of float32)
    fs.readSync(fd, vecBuf, 0, vecByteLen, offset);
    offset += vecByteLen;

    // Skip the newline after vector if present
    const peekBuf = Buffer.alloc(1);
    const peekRead = fs.readSync(fd, peekBuf, 0, 1, offset);
    if (peekRead > 0 && peekBuf[0] === 0x0a) {
      offset++;
    }

    const word = wordBuf.toString('utf-8', 0, wordLen).toLowerCase();

    if (word.length < 2 || !isAlphaLower(word)) { skipped++; continue; }

    // Convert buffer to Float32Array
    const vec = new Float32Array(dims);
    for (let d = 0; d < dims; d++) {
      vec[d] = vecBuf.readFloatLE(d * 4);
    }

    words.push(word);
    vectors.push(vec);
  }

  fs.closeSync(fd);

  console.log(`\r  Processed ${wordCount.toLocaleString()} words, kept ${words.length.toLocaleString()}`);
  console.log(`  Skipped ${skipped.toLocaleString()} entries`);

  return { words, vectors };
}

// ---- Deduplicate (keep first occurrence) ----
function deduplicate(words, vectors) {
  const seen = new Set();
  const uniqueWords = [];
  const uniqueVectors = [];
  let dupes = 0;

  for (let i = 0; i < words.length; i++) {
    if (seen.has(words[i])) {
      dupes++;
      continue;
    }
    seen.add(words[i]);
    uniqueWords.push(words[i]);
    uniqueVectors.push(vectors[i]);
  }

  if (dupes > 0) {
    console.log(`  Removed ${dupes.toLocaleString()} duplicate entries`);
  }

  return { words: uniqueWords, vectors: uniqueVectors };
}

// ---- Write binary output ----
function writeBinaryModel(outputDir, dimensions, words, vectors) {
  fs.mkdirSync(outputDir, { recursive: true });

  // Write index.json
  const indexPath = path.join(outputDir, 'index.json');
  const index = {
    dimensions,
    count: words.length,
    words,
  };
  fs.writeFileSync(indexPath, JSON.stringify(index));
  const indexSize = fs.statSync(indexPath).size;
  console.log(`  Wrote ${indexPath} (${(indexSize / 1024 / 1024).toFixed(1)} MB)`);

  // Write vectors.bin (packed Float32)
  const vecPath = path.join(outputDir, 'vectors.bin');
  const totalFloats = words.length * dimensions;
  const buffer = Buffer.alloc(totalFloats * 4);

  for (let i = 0; i < words.length; i++) {
    const vec = vectors[i];
    const baseOffset = i * dimensions * 4;
    for (let d = 0; d < dimensions; d++) {
      buffer.writeFloatLE(vec[d], baseOffset + d * 4);
    }
  }

  fs.writeFileSync(vecPath, buffer);
  const vecSize = fs.statSync(vecPath).size;
  console.log(`  Wrote ${vecPath} (${(vecSize / 1024 / 1024).toFixed(1)} MB)`);
}

// ---- Build one model ----
async function buildModel(modelName) {
  const def = MODEL_DEFS[modelName];
  if (!def) {
    console.error(`Unknown model: "${modelName}". Available: ${Object.keys(MODEL_DEFS).join(', ')}`);
    process.exit(1);
  }

  console.log(`\n========================================`);
  console.log(`Building ${def.description} (${modelName})`);
  console.log(`========================================`);

  if (!fs.existsSync(def.sourceFile)) {
    console.error(`Source file not found: ${def.sourceFile}`);
    console.error(`Run the download script first: npm run download:${modelName.replace('-300d', '')}`);
    return false;
  }

  const outputDir = path.join(MODELS_DIR, modelName);

  console.log(`\nParsing ${def.sourceFile}...`);
  const t0 = Date.now();

  let result;
  if (def.format === 'text') {
    result = await parseTextFormat(def.sourceFile, def.dimensions);
  } else if (def.format === 'word2vec-bin') {
    result = await parseWord2VecBinary(def.sourceFile, def.dimensions);
  } else {
    throw new Error(`Unknown format: ${def.format}`);
  }

  console.log(`  Parse completed in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

  // Deduplicate
  const deduped = deduplicate(result.words, result.vectors);

  // Validate target words
  console.log(`\nValidating target words...`);
  const targetWords = JSON.parse(fs.readFileSync(TARGET_WORDS_FILE, 'utf-8'));
  const wordSet = new Set(deduped.words);
  const missing = targetWords.filter(tw => !wordSet.has(tw));

  if (missing.length > 0) {
    console.warn(`  WARNING: ${missing.length} target words NOT in ${modelName} vocabulary:`);
    if (missing.length <= 20) {
      console.warn(`  ${missing.join(', ')}`);
    } else {
      console.warn(`  ${missing.slice(0, 20).join(', ')}... and ${missing.length - 20} more`);
    }
  } else {
    console.log(`  All ${targetWords.length} target words present.`);
  }

  // Write output
  console.log(`\nWriting binary model to ${outputDir}...`);
  writeBinaryModel(outputDir, def.dimensions, deduped.words, deduped.vectors);

  console.log(`\nDone! ${modelName}: ${deduped.words.length.toLocaleString()} words, ${def.dimensions}d`);
  return true;
}

// ---- Main ----
async function main() {
  const arg = process.argv[2];

  if (!arg) {
    console.log('Usage:');
    console.log('  node tools/build-model.js <model-name>');
    console.log('  node tools/build-model.js all');
    console.log('');
    console.log('Available models:');
    for (const [name, def] of Object.entries(MODEL_DEFS)) {
      const exists = fs.existsSync(def.sourceFile) ? '(source ready)' : '(source not downloaded)';
      console.log(`  ${name} - ${def.description} ${exists}`);
    }
    process.exit(0);
  }

  if (arg === 'all') {
    let built = 0;
    for (const name of Object.keys(MODEL_DEFS)) {
      if (fs.existsSync(MODEL_DEFS[name].sourceFile)) {
        const ok = await buildModel(name);
        if (ok) built++;
      } else {
        console.log(`\nSkipping ${name} - source file not downloaded`);
      }
    }
    console.log(`\n========================================`);
    console.log(`Built ${built} model(s)`);
    console.log(`========================================`);
  } else {
    await buildModel(arg);
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
