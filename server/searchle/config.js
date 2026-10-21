// ===== Searchle configuration (HangStream port) =====
// Adapted from wt-eco searchle/server/config.js — fasttext-only model,
// no chat-relay/word-empires dependencies, explicit absolute paths.

const path = require('path');

const ROOT = __dirname; // server/searchle

module.exports = {
  // Target words (the hidden answers)
  targetsPath: path.join(ROOT, 'data', 'target-words.json'),

  // Embedding models — fasttext wiki-news-300d-1M (built once via
  // tools/download-fasttext.js + tools/build-model.js + tools/convert-float16.js)
  //
  // The location is overridable so a container deployment can keep the ~125 MB
  // model on a mounted persistent volume instead of baking it into the image.
  modelsDir: process.env.SEARCHLE_MODELS_DIR || path.join(ROOT, 'data', 'models'),
  activeModels: ['fasttext'],
  modelWeights: { fasttext: 1 },
  rrfK: 60, // Reciprocal Rank Fusion constant

  // Frequency gate — keeps low-frequency junk out of the ranked pool.
  // keepAlways sets guarantee curated words survive the gate.
  gate: {
    enabled: true,
    rankedPoolMinZipf: 2.5,
    frequencyPath: path.join(ROOT, 'shared', 'word-bank', 'frequency.json'),
    keepAlwaysTargetsPath: path.join(ROOT, 'data', 'target-words.json'),
    keepAlwaysBankDictPath: path.join(ROOT, 'shared', 'word-bank', 'dictionary.json'),
    disabledModels: [],
  },

  // Game rules
  winRank: 1,
  guessPattern: /^[a-z]+$/,
};
