// Solo completion validation against the canonical Relay word bank.
// Feedback, target words, and win flags supplied by a browser are never trusted.
const { validateUnwordleDaily } = require('./unwordle-daily-validator');
const { validateSpellingBeeDaily } = require('./spellingbee-weekly-validator');
const DAILY_RULES = new Map([
  ['unwordle-sp', { lengths: [5], maxGuesses: null }],
  ['spellingbee-sp', { lengths: [7], maxGuesses: null }],
  ['word500-sp', { lengths: [4, 5, 6, 7, 8, 9, 10], maxGuesses: 8 }],
  ['wordle-sp', { lengths: [5], maxGuesses: 6 }],
  ['figural-sp', { lengths: [5], maxGuesses: 8 }],
  ['pixeletters-sp', { lengths: [5], maxGuesses: 5 }],
  ['betwixt-sp', { lengths: [5], maxGuesses: null }]
]);

function validateDailyTranscript(bank, gameId, date, evidence) {
  if (gameId === 'unwordle-sp') return validateUnwordleDaily(bank, date, evidence);
  if (gameId === 'spellingbee-sp') return validateSpellingBeeDaily(bank, date, evidence);
  const rule = DAILY_RULES.get(gameId);
  if (!rule) return { required: false };
  const reject = () => ({ required: true, ok: false, error: 'Invalid or unfinished daily solve' });
  if (!evidence || !rule.lengths.includes(evidence.length) || !Array.isArray(evidence.guesses)) return reject();
  const guesses = evidence.guesses;
  if (!guesses.length || guesses.length > (rule.maxGuesses || 4096)) return reject();
  const puzzle = bank.getDailyWord(gameId, evidence.length);
  if (!puzzle || puzzle.date !== date || typeof puzzle.word !== 'string')
    return { required: true, ok: false, unavailable: true, error: 'Canonical daily puzzle unavailable' };
  const target = puzzle.word.toLowerCase();
  if (target.length !== evidence.length) return reject();
  const seen = new Set();
  let lower = 'a'.repeat(evidence.length), upper = 'z'.repeat(evidence.length + 1);
  let won = false;
  for (let i = 0; i < guesses.length; i++) {
    const raw = guesses[i];
    if (typeof raw !== 'string' || raw.length !== evidence.length || !/^[a-z]+$/i.test(raw)) return reject();
    const word = raw.toLowerCase();
    if (seen.has(word) || (!bank.isValidWord(word) && !bank.isValidTarget(word))) return reject();
    seen.add(word);
    if (gameId === 'betwixt-sp') {
      if (word <= lower || word >= upper) return reject();
      if (word < target) lower = word;
      else if (word > target) upper = word;
    }
    if (word === target) {
      if (i !== guesses.length - 1) return reject(); // A round ends at its first solve.
      won = true;
    }
  }
  if (!won && (rule.maxGuesses === null || guesses.length !== rule.maxGuesses)) return reject();
  return { required: true, ok: true, won };
}

module.exports = { DAILY_RULES, validateDailyTranscript };
