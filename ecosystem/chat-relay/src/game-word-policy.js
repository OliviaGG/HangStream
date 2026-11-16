const { isExcludedWord } = require('./word-bank-exclusions');

const DEFAULT_RULES = {
  target: 'block',
  board_word: 'block',
  guess: 'block'
};

const GAME_RULES = {};

const GAME_ALIASES = {
  recTangled: 'rectangled',
  rectangled: 'rectangled',
  erecTangled: 'erectangled',
  erectangled: 'erectangled',
  searchle: 'searchle'
};

function normalizeGameId(gameId) {
  const key = String(gameId || '').trim();
  if (!key) return '';
  return GAME_ALIASES[key] || GAME_ALIASES[key.toLowerCase()] || key.toLowerCase();
}

function normalizeUsage(usage) {
  return String(usage || '').trim().toLowerCase() || 'guess';
}

function getRules(gameId) {
  const normalizedGameId = normalizeGameId(gameId);
  return { ...DEFAULT_RULES, ...(GAME_RULES[normalizedGameId] || {}) };
}

function getRule(gameId, usage) {
  const rules = getRules(gameId);
  const normalizedUsage = normalizeUsage(usage);
  return rules[normalizedUsage] || DEFAULT_RULES[normalizedUsage] || 'block';
}

function isWordBlockedForGame(gameId, usage, word) {
  const rule = getRule(gameId, usage);
  if (rule !== 'block') return false;
  if (!word) return false;
  return isExcludedWord(String(word));
}

function isWordAllowedForGame(gameId, usage, word) {
  return !isWordBlockedForGame(gameId, usage, word);
}

function filterWordsForGame(words, gameId, usage) {
  if (!Array.isArray(words)) return [];
  return words.filter((word) => isWordAllowedForGame(gameId, usage, word));
}

module.exports = {
  normalizeGameId,
  getRule,
  isWordBlockedForGame,
  isWordAllowedForGame,
  filterWordsForGame
};
