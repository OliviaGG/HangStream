#!/usr/bin/env node
// find-isolated-words.js
// Finds Searchle target words that are "semantically isolated" — meaning
// the embedding models don't have many closely related words.
//
// Strategy: Load one model at a time, compute cosine similarity for each
// target word against all vocab words, extract top-N similarity scores.
// Process models sequentially to limit memory usage.
//
// Run on the Searchle server: node --max-old-space-size=1500 find-isolated-words.js

const path = require('path');
const fs = require('fs');

const SEARCHLE_DIR = '/opt/searchle';
const DATA_DIR = path.join(SEARCHLE_DIR, 'data');
const MODELS_DIR = path.join(DATA_DIR, 'models');

// ---------------------------------------------------------------------------
// Float16 → Float32 lookup table
// ---------------------------------------------------------------------------
const F16_TO_F32 = new Float32Array(65536);
for (let i = 0; i < 65536; i++) {
  const sign = (i >> 15) & 1;
  const exp = (i >> 10) & 0x1f;
  const frac = i & 0x3ff;
  if (exp === 0) {
    F16_TO_F32[i] = (sign ? -1 : 1) * Math.pow(2, -14) * (frac / 1024);
  } else if (exp === 31) {
    F16_TO_F32[i] = frac ? NaN : (sign ? -Infinity : Infinity);
  } else {
    F16_TO_F32[i] = (sign ? -1 : 1) * Math.pow(2, exp - 15) * (1 + frac / 1024);
  }
}

// ---------------------------------------------------------------------------
// Load + pre-convert a model to Float32
// ---------------------------------------------------------------------------
function loadModel(modelName) {
  const modelDir = path.join(MODELS_DIR, modelName);
  const indexPath = path.join(modelDir, 'index.json');
  const vecPath = path.join(modelDir, 'vectors.bin');

  console.error(`Loading model "${modelName}"...`);
  const t0 = Date.now();

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const { dimensions, count, words, format } = index;
  const isFloat16 = format === 'float16';

  const vecBuffer = fs.readFileSync(vecPath);
  const aligned = new ArrayBuffer(vecBuffer.length);
  new Uint8Array(aligned).set(vecBuffer);

  // Convert all vectors to Float32 up-front (uses more memory but much faster per-word)
  let vectors;
  if (isFloat16) {
    const raw = new Uint16Array(aligned);
    vectors = new Float32Array(count * dimensions);
    for (let j = 0; j < raw.length; j++) {
      vectors[j] = F16_TO_F32[raw[j]];
    }
  } else {
    vectors = new Float32Array(aligned);
  }

  // Pre-compute magnitudes
  const magnitudes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const offset = i * dimensions;
    let sum = 0;
    for (let d = 0; d < dimensions; d++) {
      sum += vectors[offset + d] * vectors[offset + d];
    }
    magnitudes[i] = Math.sqrt(sum);
  }

  // Build word→index map
  const wordIndex = new Map();
  for (let i = 0; i < words.length; i++) {
    wordIndex.set(words[i], i);
  }

  console.error(`Loaded "${modelName}": ${count.toLocaleString()} words, ${dimensions}d (${Date.now() - t0}ms)`);
  return { name: modelName, dimensions, count, words, wordIndex, vectors, magnitudes };
}

// ---------------------------------------------------------------------------
// Compute top-1 cosine similarity for a target word (we only need the best match)
// Returns { rank1Sim, rank1Word, rank10Sim, rank50Sim }
// ---------------------------------------------------------------------------
function getIsolationScore(targetWord, model) {
  const targetIdx = model.wordIndex.get(targetWord);
  if (targetIdx === undefined) return null;

  const dim = model.dimensions;
  const targetOffset = targetIdx * dim;
  const targetMag = model.magnitudes[targetIdx];
  const count = model.count;
  const vecs = model.vectors;

  // We need top ~50 similarities. Use simple tracking of top N.
  const TOP_N = 50;
  const topSims = new Float32Array(TOP_N).fill(-2);
  const topIdxs = new Int32Array(TOP_N).fill(-1);
  let minTop = -2; // current minimum in top list
  let minTopIdx = 0; // index of minimum in top list
  let filled = 0;

  for (let i = 0; i < count; i++) {
    if (i === targetIdx) continue;

    const offset = i * dim;
    let dot = 0;
    for (let d = 0; d < dim; d++) {
      dot += vecs[targetOffset + d] * vecs[offset + d];
    }
    const sim = dot / (targetMag * model.magnitudes[i]);

    if (filled < TOP_N) {
      topSims[filled] = sim;
      topIdxs[filled] = i;
      filled++;
      if (filled === TOP_N) {
        // Find minimum
        minTop = topSims[0];
        minTopIdx = 0;
        for (let j = 1; j < TOP_N; j++) {
          if (topSims[j] < minTop) { minTop = topSims[j]; minTopIdx = j; }
        }
      }
    } else if (sim > minTop) {
      topSims[minTopIdx] = sim;
      topIdxs[minTopIdx] = i;
      // Find new minimum
      minTop = topSims[0];
      minTopIdx = 0;
      for (let j = 1; j < TOP_N; j++) {
        if (topSims[j] < minTop) { minTop = topSims[j]; minTopIdx = j; }
      }
    }
  }

  // Sort descending
  const paired = [];
  for (let j = 0; j < filled; j++) {
    paired.push({ idx: topIdxs[j], sim: topSims[j] });
  }
  paired.sort((a, b) => b.sim - a.sim);

  return {
    rank1Sim: paired[0].sim,
    rank1Word: model.words[paired[0].idx],
    rank10Sim: paired.length >= 10 ? paired[9].sim : paired[paired.length - 1].sim,
    rank10Word: paired.length >= 10 ? model.words[paired[9].idx] : model.words[paired[paired.length - 1].idx],
    rank50Sim: paired.length >= 50 ? paired[49].sim : paired[paired.length - 1].sim,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  // Load target words
  const targetWords = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'target-words.json'), 'utf-8'));
  console.error(`${targetWords.length} target words loaded`);

  // Load win history for empirical difficulty data
  let winHistory = [];
  try {
    winHistory = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'win-history.json'), 'utf-8'));
    console.error(`${winHistory.length} win history entries loaded`);
  } catch (e) {
    console.error('Could not load win history:', e.message);
  }

  // Build map of word -> guessCount from win history
  const winGuessMap = new Map();
  for (const entry of winHistory) {
    if (entry.word) {
      const w = entry.word.toLowerCase();
      const existing = winGuessMap.get(w) || 0;
      if (entry.guessCount > existing) {
        winGuessMap.set(w, entry.guessCount);
      }
    }
  }

  // Initialize result storage per word
  const wordData = new Map(); // word -> { modelScores: [], missingModels: 0 }
  for (const w of targetWords) {
    wordData.set(w, { modelScores: [], missingModels: 0 });
  }

  // Process one model at a time to limit memory
  const modelNames = ['glove-300d', 'word2vec', 'fasttext'];

  for (const modelName of modelNames) {
    const model = loadModel(modelName);
    console.error(`\nProcessing ${targetWords.length} target words with ${modelName}...`);
    const t0 = Date.now();
    let processed = 0;

    for (const target of targetWords) {
      const score = getIsolationScore(target, model);
      const entry = wordData.get(target);

      if (score) {
        entry.modelScores.push({
          model: modelName,
          rank1Sim: score.rank1Sim,
          rank1Word: score.rank1Word,
          rank10Sim: score.rank10Sim,
          rank10Word: score.rank10Word,
          rank50Sim: score.rank50Sim,
        });
      } else {
        entry.missingModels++;
      }

      processed++;
      if (processed % 500 === 0) {
        const elapsed = (Date.now() - t0) / 1000;
        const rate = processed / elapsed;
        const eta = (targetWords.length - processed) / rate;
        console.error(`  ${processed}/${targetWords.length} (${rate.toFixed(1)}/sec, ETA: ${Math.round(eta)}s)`);
      }
    }

    console.error(`  Done with ${modelName} in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
    // Model goes out of scope on next iteration, allowing GC
  }

  // Compute aggregate scores
  console.error('\nComputing aggregate isolation scores...');
  const results = [];

  for (const target of targetWords) {
    const { modelScores, missingModels } = wordData.get(target);

    if (modelScores.length === 0) {
      results.push({
        word: target,
        avgRank1Sim: 0,
        avgRank10Sim: 0,
        avgRank50Sim: 0,
        missingModels: 3,
        guessCount: winGuessMap.get(target) || null,
        details: []
      });
      continue;
    }

    const avgRank1Sim = modelScores.reduce((s, m) => s + m.rank1Sim, 0) / modelScores.length;
    const avgRank10Sim = modelScores.reduce((s, m) => s + m.rank10Sim, 0) / modelScores.length;
    const avgRank50Sim = modelScores.reduce((s, m) => s + m.rank50Sim, 0) / modelScores.length;

    results.push({
      word: target,
      avgRank1Sim: Math.round(avgRank1Sim * 10000) / 10000,
      avgRank10Sim: Math.round(avgRank10Sim * 10000) / 10000,
      avgRank50Sim: Math.round(avgRank50Sim * 10000) / 10000,
      missingModels,
      guessCount: winGuessMap.get(target) || null,
      details: modelScores.map(m => ({
        model: m.model,
        rank1: `${m.rank1Word} (${m.rank1Sim.toFixed(4)})`,
        rank10: `${m.rank10Word} (${m.rank10Sim.toFixed(4)})`,
      }))
    });
  }

  // Sort by avgRank1Sim ascending (most isolated first)
  results.sort((a, b) => a.avgRank1Sim - b.avgRank1Sim);

  // Build distribution stats
  const rank1Sims = results.map(r => r.avgRank1Sim).sort((a, b) => a - b);
  const pct = (p) => rank1Sims[Math.floor(rank1Sims.length * p)];

  // Output results
  const output = {
    summary: {
      totalTargetWords: targetWords.length,
      modelsUsed: modelNames,
    },
    distribution: {
      p5: pct(0.05),
      p10: pct(0.10),
      p25: pct(0.25),
      p50: pct(0.50),
      p75: pct(0.75),
      p90: pct(0.90),
      p95: pct(0.95),
      min: rank1Sims[0],
      max: rank1Sims[rank1Sims.length - 1],
    },
    // Top 150 most isolated
    mostIsolated: results.slice(0, 150).map(r => ({
      word: r.word,
      avgRank1Sim: r.avgRank1Sim,
      avgRank10Sim: r.avgRank10Sim,
      avgRank50Sim: r.avgRank50Sim,
      missingModels: r.missingModels,
      historicalGuessCount: r.guessCount,
      modelDetails: r.details,
    })),
    // Top 20 LEAST isolated (for comparison)
    leastIsolated: results.slice(-20).reverse().map(r => ({
      word: r.word,
      avgRank1Sim: r.avgRank1Sim,
      avgRank10Sim: r.avgRank10Sim,
    })),
  };

  console.log(JSON.stringify(output, null, 2));
}

main();
