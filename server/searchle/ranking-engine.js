// ===== Ranking Engine =====
// Loads embedding models and computes semantic similarity rankings
// using Reciprocal Rank Fusion (RRF) for multi-model combination.

const path = require('path');
const fs = require('fs');

// State
const allModels = [];       // every model loaded at boot
let activeModels = [];       // subset currently used for ranking
let allVocabSet = new Set(); // deduped union of all model words — single source of truth
let activeVocabSet = new Set(); // union of default public-game active models

function createWordIndexVocabView(wordIndex) {
  return {
    has(word) {
      return wordIndex.has(word);
    },
    get size() {
      return wordIndex.size;
    },
    keys() {
      return wordIndex.keys();
    },
    values() {
      return wordIndex.keys();
    },
    [Symbol.iterator]: function* () {
      yield* wordIndex.keys();
    }
  };
}

// ---------------------------------------------------------------------------
// Frequency Gate State
// ---------------------------------------------------------------------------
// `frequencyTable` is a Map<word, Zipf score> loaded once from word-bank.
// `keepAlwaysSet` is the union of (Searchle daily targets) +
// (every titleWordNorm in the shared Wikipedia coverage). Words in this
// set get rank slots regardless of frequency — that's how rare proper
// nouns (Wakulla, Tawakoni, ...) stay playable in companion games.
// `gateConfig` and `gateStats` are populated at init() and exposed via
// getGateInfo() for the /api/gate/stats endpoint.
let frequencyTable = null;
let keepAlwaysSet = new Set();
let gateConfig = { enabled: false, threshold: null };
let gateStats = null;

// ---------------------------------------------------------------------------
// Ranking cache: full target rankings are expensive to compute; cache them
// across games, sessions, SP pool generation, and companion API calls.
// ---------------------------------------------------------------------------
class LRUMap extends Map {
  constructor(capacity) {
    super();
    this.capacity = Math.max(1, capacity | 0);
  }
  get(key) {
    if (!super.has(key)) return undefined;
    const value = super.get(key);
    super.delete(key);
    super.set(key, value);
    return value;
  }
  set(key, value) {
    if (super.has(key)) super.delete(key);
    super.set(key, value);
    while (super.size > this.capacity) {
      const oldestKey = super.keys().next().value;
      super.delete(oldestKey);
    }
    return this;
  }
}

const RANKING_CACHE_MAX = Number(process.env.SEARCHLE_RANKING_CACHE_MAX) || 256;
const RANKING_CACHE_TTL_MS = Number(process.env.SEARCHLE_RANKING_CACHE_TTL) || 30 * 60 * 1000;
const rankingCache = new LRUMap(RANKING_CACHE_MAX);
const rankingCacheMeta = new Map(); // key → { createdAt, hits }

function _rankingCacheKey(targetWord, options) {
  // Active models can change at runtime; include them in the key.
  const modelNames = activeModels.map(m => m.name).join(',');
  const opts = options && typeof options === 'object' ? options : {};
  const singular = opts.singularFilter === false ? '0' : '1';
  const requestedModels = Array.isArray(opts.modelNames) ? opts.modelNames.join(',') : '';
  return `${targetWord.toLowerCase()}|${modelNames}|${requestedModels}|${singular}`;
}

function _pruneExpiredRankings() {
  const now = Date.now();
  for (const [key, meta] of rankingCacheMeta) {
    if (now - meta.createdAt > RANKING_CACHE_TTL_MS) {
      rankingCache.delete(key);
      rankingCacheMeta.delete(key);
    }
  }
}

function getRankingCacheStats() {
  return { size: rankingCache.size, capacity: rankingCache.capacity, ttlMs: RANKING_CACHE_TTL_MS };
}

// ---------------------------------------------------------------------------
// Float16 → Float32 lookup table (256KB, built once at module load)
// ---------------------------------------------------------------------------
const F16_TO_F32 = new Float32Array(65536);
(function buildF16Table() {
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
})();

// ---------------------------------------------------------------------------
// Singular Form Detection (self-contained to avoid circular dependency)
// Uses allVocabSet directly — must only be called after init().
// Mirrors the logic in guess-processor.js toSingular().
// ---------------------------------------------------------------------------
const SINGULAR_EXCLUDE = new Set([
  'barracks','bellows','binoculars','boxers','briefs','chaps','clothes','corps',
  'credentials','customs','dregs','dungarees','forceps','gallows','glasses',
  'goggles','goods','headquarters','jeans','knickers','leggings','manners',
  'narrows','overalls','pajamas','pants','pliers','premises','proceeds','remains',
  'scissors','shears','shorts','slacks','suds','surroundings','suspenders',
  'tights','tongs','trousers','tweezers','underpants',
  'measles','molasses','mumps','news','shingles','series','species',
  'atlas','chaos','cosmos','diabetes','ethos','herpes','kudos','lens','pathos','thermos',
  'grits','nachos','oats',
  'athletics','diagnostics','dynamics','economics','electronics','ethics','genetics',
  'gymnastics','linguistics','logistics','mathematics','mechanics','physics',
  'politics','statistics','tactics','therapeutics',
  'across','always','besides','does','furthermore','goes','nonetheless','overseas',
  'perhaps','sometimes','themselves','thus','upstairs','downstairs','towards',
  'whereas','crossroads',
]);

const singularFormCache = new Map();
const SINGULAR_CACHE_MAX = 200000;

function _isSingularForm(word) {
  if (word.length < 4) return true;
  if (SINGULAR_EXCLUDE.has(word)) return true;

  const cached = singularFormCache.get(word);
  if (cached !== undefined) return cached;

  const vocabSet = activeVocabSet || allVocabSet;
  let result = true;

  // -ies → -y
  if (word.endsWith('ies') && word.length >= 5) {
    if (vocabSet.has(word.slice(0, -3) + 'y')) result = false;
  }
  // -ves → -f / -fe / -ve
  if (result && word.endsWith('ves') && word.length >= 5) {
    if (vocabSet.has(word.slice(0, -3) + 'f') ||
        vocabSet.has(word.slice(0, -3) + 'fe') ||
        vocabSet.has(word.slice(0, -1))) result = false;
  }
  // -es
  if (result && word.endsWith('es') && word.length >= 5) {
    if (vocabSet.has(word.slice(0, -1)) || vocabSet.has(word.slice(0, -2))) result = false;
  }
  // -s (not -ss, -us, -is)
  if (result && word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us') && !word.endsWith('is')) {
    if (vocabSet.has(word.slice(0, -1))) result = false;
  }

  if (singularFormCache.size < SINGULAR_CACHE_MAX) {
    singularFormCache.set(word, result);
  }
  return result;
}

function clearSingularFormCache() {
  singularFormCache.clear();
}

// ---------------------------------------------------------------------------
// Model Loading
// ---------------------------------------------------------------------------
function loadBinaryModel(modelName, modelsDir) {
  const modelDir = path.join(modelsDir, modelName);
  const indexPath = path.join(modelDir, 'index.json');
  const vecPath = path.join(modelDir, 'vectors.bin');

  if (!fs.existsSync(indexPath) || !fs.existsSync(vecPath)) return null;

  console.log(`[Boot] Loading model "${modelName}"...`);
  const t0 = Date.now();

  const index = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
  const { dimensions, count, words, format } = index;
  const isFloat16 = format === 'float16';

  const vecBuffer = fs.readFileSync(vecPath);
  const bytesPerFloat = isFloat16 ? 2 : 4;
  const expectedBytes = count * dimensions * bytesPerFloat;
  if (vecBuffer.length !== expectedBytes) {
    console.error(`[Boot] vectors.bin size mismatch for ${modelName}: expected ${expectedBytes}, got ${vecBuffer.length}`);
    return null;
  }

  const aligned = new ArrayBuffer(vecBuffer.length);
  new Uint8Array(aligned).set(vecBuffer);

  let vectors;
  if (isFloat16) {
    vectors = new Uint16Array(aligned);
  } else {
    vectors = new Float32Array(aligned);
  }

  // Pre-compute magnitudes
  const magnitudes = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const offset = i * dimensions;
    let sum = 0;
    if (isFloat16) {
      for (let d = 0; d < dimensions; d++) {
        const v = F16_TO_F32[vectors[offset + d]];
        sum += v * v;
      }
    } else {
      for (let d = 0; d < dimensions; d++) {
        const v = vectors[offset + d];
        sum += v * v;
      }
    }
    magnitudes[i] = Math.sqrt(sum);
  }

  // Build word→index map
  const wordIndex = new Map();
  for (let i = 0; i < words.length; i++) {
    wordIndex.set(words[i], i);
  }

  const fmt = isFloat16 ? ', float16' : '';
  console.log(`[Boot] Loaded "${modelName}": ${count.toLocaleString()} words, ${dimensions}d${fmt} (${Date.now() - t0}ms)`);

  return { name: modelName, modelsDir, dimensions, words, wordIndex, vectors, magnitudes, isFloat16 };
}

function loadLegacyVocabulary(legacyPath) {
  if (!fs.existsSync(legacyPath)) return null;

  console.log('[Boot] Loading legacy vocabulary.json (GloVe 50d fallback)...');
  const t0 = Date.now();
  const vocabData = JSON.parse(fs.readFileSync(legacyPath, 'utf-8'));
  const vocabObj = vocabData.words;
  const words = Object.keys(vocabObj);
  const dimensions = vocabData.dimensions;
  const count = words.length;

  const vectors = new Float32Array(count * dimensions);
  const magnitudes = new Float32Array(count);
  const wordIndex = new Map();

  for (let i = 0; i < count; i++) {
    const word = words[i];
    const vec = vocabObj[word];
    const offset = i * dimensions;
    let sum = 0;
    for (let d = 0; d < dimensions; d++) {
      vectors[offset + d] = vec[d];
      sum += vec[d] * vec[d];
    }
    magnitudes[i] = Math.sqrt(sum);
    wordIndex.set(word, i);
  }

  console.log(`[Boot] Loaded legacy vocab: ${count.toLocaleString()} words, ${dimensions}d (${Date.now() - t0}ms)`);

  return { name: 'glove-50d-legacy', dimensions, words, wordIndex, vectors, magnitudes };
}

function rebuildUnionVocab() {
  // Single-model production doesn't need a second full Set of the same
  // vocabulary; a lightweight view over wordIndex preserves .has() checks
  // and iteration while avoiding duplicate hash-table overhead.
  if (allModels.length === 1) {
    allVocabSet = createWordIndexVocabView(allModels[0].wordIndex);
    return;
  }

  const vocabUnionSet = new Set();
  for (const model of allModels) {
    for (const w of model.words) vocabUnionSet.add(w);
  }
  allVocabSet = vocabUnionSet;
}

function rebuildActiveVocab() {
  if (activeModels.length === 1) {
    activeVocabSet = createWordIndexVocabView(activeModels[0].wordIndex);
    return;
  }
  const vocabUnionSet = new Set();
  for (const model of activeModels) {
    for (const w of model.words) vocabUnionSet.add(w);
  }
  activeVocabSet = vocabUnionSet;
}

// ---------------------------------------------------------------------------
// Frequency Gate Construction
// ---------------------------------------------------------------------------
function loadFrequencyTable(freqPath) {
  if (!freqPath) return false;
  try {
    const t0 = Date.now();
    const raw = JSON.parse(fs.readFileSync(freqPath, 'utf-8'));
    frequencyTable = new Map();
    for (const k in raw) {
      const v = raw[k];
      if (typeof v === 'number') frequencyTable.set(String(k).toLowerCase(), v);
    }
    console.log(`[Boot] Loaded frequency table: ${frequencyTable.size.toLocaleString()} entries from ${freqPath} (${Date.now() - t0}ms)`);
    return frequencyTable.size > 0;
  } catch (e) {
    console.warn(`[Boot] frequency table load failed (${freqPath}): ${e.message}. Gate will be disabled.`);
    frequencyTable = null;
    return false;
  }
}

function loadKeepAlwaysSet(coveragePath, targetsPath, bankDictPath) {
  keepAlwaysSet = new Set();

  // Wikipedia coverage title norms — proper nouns and rare-but-legal title
  // tokens used by WikiSearchle / WikiRectangled. Without this, "Wakulla"
  // and the like would get filtered out.
  if (coveragePath) {
    try {
      const t0 = Date.now();
      const cov = JSON.parse(fs.readFileSync(coveragePath, 'utf-8'));
      const pages = cov.pages || {};
      let normCount = 0;
      for (const k in pages) {
        const norms = pages[k] && pages[k].titleWordNorms;
        if (Array.isArray(norms)) {
          for (const n of norms) {
            keepAlwaysSet.add(String(n).toLowerCase());
            normCount++;
          }
        }
      }
      console.log(`[Boot] Keep-always: scanned ${normCount.toLocaleString()} title-norm tokens from ${coveragePath} → ${keepAlwaysSet.size.toLocaleString()} unique (${Date.now() - t0}ms)`);
    } catch (e) {
      console.warn(`[Boot] coverage keep-always load failed (${coveragePath}): ${e.message}`);
    }
  }

  // Searchle's hand-curated target list. target-words.json is keyed by
  // length, values are arrays of words.
  if (targetsPath) {
    try {
      if (fs.existsSync(targetsPath)) {
        const before = keepAlwaysSet.size;
        const tg = JSON.parse(fs.readFileSync(targetsPath, 'utf-8'));
        for (const len in tg) {
          const list = tg[len];
          if (Array.isArray(list)) for (const w of list) keepAlwaysSet.add(String(w).toLowerCase());
        }
        console.log(`[Boot] Keep-always: added ${(keepAlwaysSet.size - before).toLocaleString()} Searchle targets → ${keepAlwaysSet.size.toLocaleString()} total`);
      }
    } catch (e) {
      console.warn(`[Boot] targets keep-always load failed (${targetsPath}): ${e.message}`);
    }
  }

  // Shared Word Bank dictionary — every word the bank considers valid English.
  // Massively expands keep-always so rare-but-real words like "xylyl" survive
  // the freq gate. dictionary.json schema mirrors target-words.json:
  // { "3": [...], "5": [...], ... }.
  if (bankDictPath) {
    try {
      if (fs.existsSync(bankDictPath)) {
        const t0 = Date.now();
        const before = keepAlwaysSet.size;
        const dict = JSON.parse(fs.readFileSync(bankDictPath, 'utf-8'));
        for (const len in dict) {
          const list = dict[len];
          if (Array.isArray(list)) for (const w of list) keepAlwaysSet.add(String(w).toLowerCase());
        }
        console.log(`[Boot] Keep-always: added ${(keepAlwaysSet.size - before).toLocaleString()} bank-dict words → ${keepAlwaysSet.size.toLocaleString()} total (${Date.now() - t0}ms)`);
      }
    } catch (e) {
      console.warn(`[Boot] bank-dict keep-always load failed (${bankDictPath}): ${e.message}`);
    }
  }
}

function buildModelGate(model, threshold) {
  const gate = new Uint8Array(model.words.length);
  let kept = 0;
  let viaFreq = 0;
  let viaKeep = 0;
  for (let i = 0; i < model.words.length; i++) {
    const w = model.words[i];
    const f = frequencyTable.get(w);
    if (typeof f === 'number' && f >= threshold) {
      gate[i] = 1; kept++; viaFreq++;
    } else if (keepAlwaysSet.has(w)) {
      gate[i] = 1; kept++; viaKeep++;
    }
  }
  return { gate, kept, viaFreq, viaKeep, total: model.words.length };
}

function _collectModelSpecs(config, defaultModelsDir) {
  const specs = new Map();
  const add = (modelName, modelsDir, isDefault = false) => {
    const name = String(modelName || '').trim();
    if (!name) return;
    const existing = specs.get(name);
    if (existing) {
      if (isDefault) existing.isDefault = true;
      return;
    }
    specs.set(name, { name, modelsDir, isDefault });
  };

  for (const modelName of (config.activeModels || ['numberbatch', 'fasttext'])) {
    add(modelName, defaultModelsDir, true);
  }

  const profiles = config.languageProfiles || {};
  for (const profile of Object.values(profiles)) {
    const profileDir = path.resolve(profile.modelsDir || defaultModelsDir);
    for (const modelName of (profile.activeModels || [])) {
      add(modelName, profileDir);
    }
  }

  return [...specs.values()];
}

function init(config) {
  const modelsDir = path.resolve(config.modelsDir || 'data/models');
  const legacyPath = path.resolve(config.vocabPath || 'data/vocabulary.json');

  const configuredModels = config.activeModels || ['numberbatch', 'fasttext'];
  const loadedDefaultModelNames = new Set();
  for (const spec of _collectModelSpecs(config, modelsDir)) {
    const model = loadBinaryModel(spec.name, spec.modelsDir);
    if (model) {
      allModels.push(model);
      if (spec.isDefault) loadedDefaultModelNames.add(model.name);
    }
  }

  if (loadedDefaultModelNames.size === 0) {
    const legacy = loadLegacyVocabulary(legacyPath);
    if (legacy) {
      allModels.push(legacy);
      loadedDefaultModelNames.add(legacy.name);
    } else {
      console.error('No models found. Run: npm run download:all && npm run build:models');
      process.exit(1);
    }
  }

  activeModels = allModels.filter(m => loadedDefaultModelNames.has(m.name) && configuredModels.includes(m.name));
  if (activeModels.length === 0) {
    activeModels = allModels.filter(m => loadedDefaultModelNames.has(m.name));
  }

  rebuildUnionVocab();
  rebuildActiveVocab();
  console.log(`[Boot] ${allModels.length} model(s) loaded, ${activeModels.length} active, ${allVocabSet.size.toLocaleString()} unique words in union vocabulary`);
  console.log(`[Boot] All models: ${allModels.map(m => m.name).join(', ')}`);
  console.log(`[Boot] Active models: ${activeModels.map(m => m.name).join(', ')}`);

  // Frequency gate. If loading frequency.json fails, the gate stays
  // disabled and ranking falls back to the legacy whole-vocab path.
  const gc = config.gate || {};
  if (gc.enabled !== false) {
    const ok = loadFrequencyTable(gc.frequencyPath);
    if (ok) {
      const coveragePath = gc.keepAlwaysCoveragePath ? path.resolve(gc.keepAlwaysCoveragePath) : null;
      const targetsPath = gc.keepAlwaysTargetsPath ? path.resolve(gc.keepAlwaysTargetsPath) : null;
      const bankDictPath = gc.keepAlwaysBankDictPath ? path.resolve(gc.keepAlwaysBankDictPath) : null;
      loadKeepAlwaysSet(coveragePath, targetsPath, bankDictPath);

      const threshold = typeof gc.rankedPoolMinZipf === 'number' ? gc.rankedPoolMinZipf : 2.5;
      gateConfig = { enabled: true, threshold };
      gateStats = { perModel: {}, threshold, builtAt: new Date().toISOString() };

      const disabledGateModels = new Set(Array.isArray(gc.disabledModels) ? gc.disabledModels : []);
      for (const model of allModels) {
        if (disabledGateModels.has(model.name)) {
          model.gate = null;
          gateStats.perModel[model.name] = {
            kept: model.words.length,
            total: model.words.length,
            pctKept: 100,
            viaFrequency: 0,
            viaKeepAlways: 0,
            disabled: true,
          };
          console.log(`[Boot] Gate "${model.name}": disabled for language profile model`);
          continue;
        }
        const r = buildModelGate(model, threshold);
        model.gate = r.gate;
        gateStats.perModel[model.name] = {
          kept: r.kept,
          total: r.total,
          pctKept: Number(((r.kept / r.total) * 100).toFixed(2)),
          viaFrequency: r.viaFreq,
          viaKeepAlways: r.viaKeep,
        };
        console.log(`[Boot] Gate "${model.name}": kept ${r.kept.toLocaleString()}/${r.total.toLocaleString()} (${(r.kept / r.total * 100).toFixed(1)}%) — via freq: ${r.viaFreq.toLocaleString()}, via keep-always: ${r.viaKeep.toLocaleString()}`);
      }
    } else {
      console.log('[Boot] Frequency gate disabled — using legacy whole-vocab ranking.');
      gateConfig = { enabled: false, threshold: null };
    }
  } else {
    console.log('[Boot] Frequency gate disabled by config.');
    gateConfig = { enabled: false, threshold: null };
  }
}

// ---------------------------------------------------------------------------
// Cosine Similarity & Ranking
// ---------------------------------------------------------------------------
const CHUNK_SIZE = 50000; // words per chunk — yields event loop between chunks

function _normalizeOptions(options) {
  return options && typeof options === 'object' ? options : {};
}

async function computeModelRankings(targetWord, model, options = {}) {
  options = _normalizeOptions(options);
  const targetIdx = model.wordIndex.get(targetWord);
  if (targetIdx === undefined) return null;

  const dim = model.dimensions;
  const targetOffset = targetIdx * dim;
  const targetMag = model.magnitudes[targetIdx];
  const count = model.words.length;

  // Frequency gate: if a Uint8Array bitmap is attached to the model, words
  // with gate[i] === 0 are excluded from the rank list. The target itself
  // is always included regardless of its gate flag — so a low-frequency
  // target word can still be ranked, it just won't crowd other targets'
  // rank lists.
  const gate = model.gate || null;

  // Push only included words. Sized hint = full vocab (worst case);
  // the array auto-shrinks logically when sort is called on its filled
  // length. With the gate active this typically holds 30–50% of `count`.
  const similarities = [];

  if (model.isFloat16) {
    // Float16 path: batch pre-convert target vector, then use lookup in dot product
    const targetF32 = new Float32Array(dim);
    for (let d = 0; d < dim; d++) {
      targetF32[d] = F16_TO_F32[model.vectors[targetOffset + d]];
    }

    // Reusable buffer for batch chunk conversion
    const chunkF32 = new Float32Array(CHUNK_SIZE * dim);

    for (let start = 0; start < count; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, count);
      const chunkWords = end - start;

      // Batch convert this chunk's vectors to Float32. We always convert
      // the chunk whole-cloth — per-word skipping inside the f16→f32
      // step would cost more than the savings.
      const srcStart = start * dim;
      const chunkLen = chunkWords * dim;
      for (let j = 0; j < chunkLen; j++) {
        chunkF32[j] = F16_TO_F32[model.vectors[srcStart + j]];
      }

      // Dot products on pure Float32 — same speed as original
      for (let i = 0; i < chunkWords; i++) {
        const wordIdx = start + i;
        if (gate && gate[wordIdx] === 0 && wordIdx !== targetIdx) continue;
        const offset = i * dim;
        let dot = 0;
        for (let d = 0; d < dim; d++) {
          dot += targetF32[d] * chunkF32[offset + d];
        }
        similarities.push({ idx: wordIdx, sim: dot / (targetMag * model.magnitudes[wordIdx]) });
      }

      if (end < count) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  } else {
    // Original Float32 path
    for (let start = 0; start < count; start += CHUNK_SIZE) {
      const end = Math.min(start + CHUNK_SIZE, count);
      for (let i = start; i < end; i++) {
        if (gate && gate[i] === 0 && i !== targetIdx) continue;
        const offset = i * dim;
        let dot = 0;
        for (let d = 0; d < dim; d++) {
          dot += model.vectors[targetOffset + d] * model.vectors[offset + d];
        }
        similarities.push({ idx: i, sim: dot / (targetMag * model.magnitudes[i]) });
      }
      if (end < count) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }
  }

  similarities.sort((a, b) => b.sim - a.sim);

  // Singular-form filter is preserved: plurals that survived the gate
  // still get collapsed to their singular's rank slot.
  const rankings = new Map();
  let rank = 1;
  const useSingularFilter = options.singularFilter !== false;
  for (let i = 0; i < similarities.length; i++) {
    const word = model.words[similarities[i].idx];
    if (!useSingularFilter || _isSingularForm(word)) {
      rankings.set(word, rank++);
    }
  }
  return rankings;
}

function _selectModels(options = {}) {
  options = _normalizeOptions(options);
  if (!Array.isArray(options.modelNames) || options.modelNames.length === 0) {
    return activeModels;
  }
  const wanted = new Set(options.modelNames);
  return allModels.filter(m => wanted.has(m.name));
}

async function _computeRankings(targetWord, config, options = {}) {
  options = _normalizeOptions(options);
  const selectedModels = _selectModels(options);
  if (selectedModels.length === 1) {
    const rankings = await computeModelRankings(targetWord, selectedModels[0], options);
    if (!rankings) return new Map();
    return rankings;
  }

  // Multi-model: Reciprocal Rank Fusion
  const k = options.rrfK || config.rrfK || 60;
  const modelRankings = [];

  for (const model of selectedModels) {
    const rankings = await computeModelRankings(targetWord, model, options);
    if (!rankings) continue;
    const weight = (options.modelWeights && options.modelWeights[model.name])
      || (config.modelWeights && config.modelWeights[model.name])
      || 1;
    modelRankings.push({ rankings, weight });
  }

  if (modelRankings.length === 0) return new Map();
  if (modelRankings.length === 1) return modelRankings[0].rankings;

  const scores = new Map();
  for (const { rankings, weight } of modelRankings) {
    for (const [word, rank] of rankings) {
      const current = scores.get(word) || 0;
      scores.set(word, current + weight / (k + rank));
    }
  }

  const sorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);

  const finalRankings = new Map();
  let rank = 1;
  const useSingularFilter = options.singularFilter !== false;
  for (let i = 0; i < sorted.length; i++) {
    if (!useSingularFilter || _isSingularForm(sorted[i][0])) {
      finalRankings.set(sorted[i][0], rank++);
    }
  }
  return finalRankings;
}

async function computeRankings(targetWord, config, options = {}) {
  options = _normalizeOptions(options);
  const key = _rankingCacheKey(targetWord, options);
  _pruneExpiredRankings();
  const cached = rankingCache.get(key);
  if (cached) {
    const meta = rankingCacheMeta.get(key);
    if (meta) meta.hits++;
    return cached.promise;
  }

  const promise = _computeRankings(targetWord, config, options);
  rankingCache.set(key, { promise });
  rankingCacheMeta.set(key, { createdAt: Date.now(), hits: 0 });
  promise.catch(() => {
    rankingCache.delete(key);
    rankingCacheMeta.delete(key);
  });
  return promise;
}

function isValidTarget(word, options = {}) {
  options = _normalizeOptions(options);
  const selectedModels = _selectModels(options);
  return selectedModels.some(m => m.wordIndex.has(word));
}

function setActiveModels(requestedModels) {
  const newActive = allModels.filter(m => requestedModels.includes(m.name));
  if (newActive.length === 0) return false;
  activeModels = newActive;
  rebuildActiveVocab();
  clearSingularFormCache();
  return true;
}

function getModelsInfo(modelsDir) {
  const available = [];
  const modelNames = ['numberbatch', 'glove-300d', 'word2vec', 'fasttext'];
  for (const name of modelNames) {
    const modelDir = path.join(modelsDir, name);
    const indexPath = path.join(modelDir, 'index.json');
    let info = { name, loaded: false, active: false };
    if (fs.existsSync(indexPath)) {
      try {
        const idx = JSON.parse(fs.readFileSync(indexPath, 'utf-8'));
        info.built = true;
        info.dimensions = idx.dimensions;
        info.wordCount = idx.count;
      } catch {}
    }
    info.loaded = allModels.some(m => m.name === name);
    info.active = activeModels.some(m => m.name === name);
    available.push(info);
  }
  if (allModels.some(m => m.name === 'glove-50d-legacy')) {
    const legacyModel = allModels.find(m => m.name === 'glove-50d-legacy');
    available.push({ name: 'glove-50d-legacy', built: true, loaded: true, active: activeModels.some(m => m.name === 'glove-50d-legacy'), dimensions: 50, wordCount: legacyModel.words.length });
  }
  return {
    activeModels: activeModels.map(m => m.name),
    totalVocabulary: allVocabSet.size,
    models: available
  };
}

function getRuntimeInfo() {
  const models = allModels.map((model) => {
    const vectorBytes = model.vectors?.byteLength || 0;
    const magnitudeBytes = model.magnitudes?.byteLength || 0;
    return {
      name: model.name,
      loaded: true,
      active: activeModels.some((activeModel) => activeModel.name === model.name),
      dimensions: model.dimensions,
      wordCount: model.words.length,
      storage: model.isFloat16 ? 'float16' : 'float32',
      vectorBytes,
      magnitudeBytes,
      estimatedBytes: vectorBytes + magnitudeBytes
    };
  });

  const totalEstimatedBytes = models.reduce((sum, model) => sum + model.estimatedBytes, 0);
  return {
    loadedModelCount: allModels.length,
    activeModelCount: activeModels.length,
    activeModels: activeModels.map((model) => model.name),
    totalVocabulary: allVocabSet.size,
    totalEstimatedBytes,
    totalEstimatedMB: Number((totalEstimatedBytes / (1024 * 1024)).toFixed(2)),
    models
  };
}

function getGateInfo() {
  if (!gateConfig.enabled) {
    return { enabled: false };
  }
  return {
    enabled: true,
    threshold: gateConfig.threshold,
    builtAt: gateStats ? gateStats.builtAt : null,
    keepAlwaysSize: keepAlwaysSet.size,
    frequencyTableSize: frequencyTable ? frequencyTable.size : 0,
    perModel: gateStats ? gateStats.perModel : {},
  };
}

// Lookup the Zipf frequency score for a word. Returns NaN if frequency
// data isn't loaded or the word isn't in the table. Used by the session
// manager to bias target picking by streamer-configured difficulty.
function getZipf(word) {
  if (!frequencyTable) return NaN;
  const v = frequencyTable.get(String(word || '').toLowerCase());
  return typeof v === 'number' ? v : NaN;
}

// ---------------------------------------------------------------------------
// Pairwise Cosine Similarity (consumed by Synapse via /api/similarity)
// ---------------------------------------------------------------------------
// Unlike computeRankings (one word vs the whole vocab), these score exactly
// two words against each other — a single dot product per model, so a batch
// of hundreds of pairs is sub-millisecond work with the vectors already in
// memory. No frequency gate applies here: if both words have vectors, they
// can be compared.

function _cosineForModel(model, idxA, idxB) {
  const dim = model.dimensions;
  const offA = idxA * dim;
  const offB = idxB * dim;
  let dot = 0;
  if (model.isFloat16) {
    for (let d = 0; d < dim; d++) {
      dot += F16_TO_F32[model.vectors[offA + d]] * F16_TO_F32[model.vectors[offB + d]];
    }
  } else {
    for (let d = 0; d < dim; d++) {
      dot += model.vectors[offA + d] * model.vectors[offB + d];
    }
  }
  const magProduct = model.magnitudes[idxA] * model.magnitudes[idxB];
  if (!magProduct) return 0;
  return dot / magProduct;
}

// Blended cosine similarity between two words: the mean of the cosine in
// every active model that knows BOTH words (numberbatch + fasttext in prod).
// Returns { score, perModel } or null when no model contains both words.
// options.modelNames can restrict which models participate (same contract
// as _selectModels / computeRankings).
function pairwiseSimilarity(wordA, wordB, options = {}) {
  const a = String(wordA || '').toLowerCase();
  const b = String(wordB || '').toLowerCase();
  if (!a || !b) return null;
  const selectedModels = _selectModels(options);
  const perModel = {};
  let sum = 0;
  let n = 0;
  for (const model of selectedModels) {
    const idxA = model.wordIndex.get(a);
    const idxB = model.wordIndex.get(b);
    if (idxA === undefined || idxB === undefined) continue;
    const sim = _cosineForModel(model, idxA, idxB);
    perModel[model.name] = sim;
    sum += sim;
    n++;
  }
  if (n === 0) return null;
  return { score: sum / n, perModel };
}

// True when at least one active model has a vector for the word — the
// cheapest "can this word participate in similarity scoring?" check.
function hasVector(word, options = {}) {
  const w = String(word || '').toLowerCase();
  if (!w) return false;
  return _selectModels(options).some(m => m.wordIndex.has(w));
}

module.exports = {
  init,
  computeRankings,
  isValidTarget,
  getZipf,
  pairwiseSimilarity,
  hasVector,
  setActiveModels,
  getModelsInfo,
  getRuntimeInfo,
  getGateInfo,
  getAllModels: () => allModels,
  getActiveModels: () => activeModels,
  getActiveModelNames: () => activeModels.map(m => m.name),
  getAllVocabSet: () => allVocabSet,
  getActiveVocabSet: () => activeVocabSet,
  getAllVocabWords: () => [...allVocabSet],
};
