const fs = require('fs');
const path = require('path');

const BLOCKED_WORDS_PATH = path.join(__dirname, '..', 'data', 'blocked-words.json');

let cachedExactWords = new Set();
let cachedMtimeMs = null;

function refreshExactWords() {
  try {
    const stats = fs.statSync(BLOCKED_WORDS_PATH);
    if (cachedMtimeMs === stats.mtimeMs) return;

    const raw = JSON.parse(fs.readFileSync(BLOCKED_WORDS_PATH, 'utf8'));
    cachedExactWords = new Set(
      (raw.exact || [])
        .map((word) => String(word || '').toLowerCase())
        .filter(Boolean)
    );
    cachedMtimeMs = stats.mtimeMs;
  } catch (error) {
    console.warn('[WordBankExclusions] Failed to load blocked-words.json:', error.message);
  }
}

function getExcludedWords() {
  refreshExactWords();
  return new Set(cachedExactWords);
}

function isExcludedWord(word) {
  refreshExactWords();
  return cachedExactWords.has(String(word || '').toLowerCase());
}

function sanitizeWordList(words) {
  refreshExactWords();
  return (Array.isArray(words) ? words : [])
    .map((word) => String(word || '').toLowerCase())
    .filter((word) => word && !cachedExactWords.has(word));
}

module.exports = {
  getExcludedWords,
  isExcludedWord,
  sanitizeWordList
};
