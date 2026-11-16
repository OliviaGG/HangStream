// Mirrors UnWordle's v6 generator and multiset rules. Regression tests compare
// these pure functions with the deployed browser engine to detect rule drift.
// Daily row selection uses a browser time budget, so any of its 15 supported
// seeded Normal variants can prove a solve. Browser-made patterns cannot.
const crypto = require('crypto');
const WORD_LENGTH = 5;
let cachedFamily = null; // Only the current puzzle/word-bank revision is retained.
  function hashString(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) {
      h = ((h << 5) - h) + str.charCodeAt(i);
      h = h | 0;
    }
    return h >>> 0;
  }

  function mulberry32(a) {
    return function() {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      var t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  function createSeededRNG(seedStr) {
    return mulberry32(hashString(seedStr));
  }

  function checkGuess(guess, target) {
    var result = [];
    var guessArr = guess.split('');
    var targetArr = target.split('');
    var used = new Array(target.length).fill(false);

    for (var i = 0; i < guessArr.length; i++) {
      if (guessArr[i] === targetArr[i]) {
        result[i] = 'correct';
        used[i] = true;
      } else {
        result[i] = 'absent';
      }
    }

    for (var i = 0; i < guessArr.length; i++) {
      if (result[i] === 'correct') continue;
      for (var j = 0; j < targetArr.length; j++) {
        if (!used[j] && guessArr[i] === targetArr[j]) {
          result[i] = 'present';
          used[j] = true;
          break;
        }
      }
    }

    return result;
  }

  function generatePuzzleForAnswer(answer, words, rng) {
    if (!rng) rng = Math.random;
    var numRows = 3;
    var dictArr = Array.from(words.dictionary);

    // Deterministic shuffle (Fisher-Yates) — ensures seeded RNG explores all words
    for (var si = dictArr.length - 1; si > 0; si--) {
      var sj = Math.floor(rng() * (si + 1));
      var tmp = dictArr[si]; dictArr[si] = dictArr[sj]; dictArr[sj] = tmp;
    }

    var rows = [];
    var usedWords = new Set([answer.toLowerCase()]);

    // Hard mode constraints accumulate from row to row:
    // 1. Green letters must stay in position (carried forward)
    // 2. Yellow letters must appear somewhere (carried forward) — tracked with multiplicity
    //    so each row's pattern is a real Wordle-hard-mode continuation of prior rows
    //    (non-gray tile count is monotonically non-decreasing).
    // 3. Gray letters can only be used ONCE — eliminated after use
    // Early rows minimize new greens so patterns stay diverse.
    var greenConstraints = {};    // position (string key) -> letter
    var mustContainCounts = {};   // letter -> min required count (max over prior rows of that letter's green+yellow tile count)
    var eliminatedLetters = {};   // gray letters already used (can't reuse)
    var yellowExclusions = {};    // position -> {letter: true} — yellow letter can't repeat at same position
    var answerSet = {};           // letters in the answer (never eliminated)
    for (var k = 0; k < answer.length; k++) answerSet[answer[k]] = true;

    for (var rowIdx = 0; rowIdx < numRows; rowIdx++) {
      var bestCandidate = null;
      var bestNewGreens = WORD_LENGTH + 1;
      var checked = 0;

      for (var attempt = 0; attempt < dictArr.length; attempt++) {
        var word = dictArr[attempt].toUpperCase();
        if (word.length !== WORD_LENGTH) continue;
        if (usedWords.has(word.toLowerCase())) continue;

        // Enforce green constraints: specific letters at specific positions
        var passGreen = true;
        for (var pos in greenConstraints) {
          if (word[pos] !== greenConstraints[pos]) { passGreen = false; break; }
        }
        if (!passGreen) continue;

        // Enforce yellow multiset: word must contain each known letter at least N times
        // (where N is the largest green+yellow count seen for that letter across prior rows).
        // This makes every row a valid Wordle-hard-mode continuation: a player who already
        // saw 2 yellow Es can't write a guess with only 1 E.
        var passYellow = true;
        for (var letter in mustContainCounts) {
          var need = mustContainCounts[letter];
          var have = 0;
          for (var ki = 0; ki < WORD_LENGTH; ki++) if (word[ki] === letter) have++;
          if (have < need) { passYellow = false; break; }
        }
        if (!passYellow) continue;

        // Enforce gray elimination: can't reuse gray letters from previous rows
        var passElim = true;
        for (var k = 0; k < WORD_LENGTH; k++) {
          if (eliminatedLetters[word[k]]) { passElim = false; break; }
        }
        if (!passElim) continue;

        // Enforce yellow exclusion: letter can't repeat at same position it was yellow
        var passYellowPos = true;
        for (var k = 0; k < WORD_LENGTH; k++) {
          if (yellowExclusions[k] && yellowExclusions[k][word[k]]) { passYellowPos = false; break; }
        }
        if (!passYellowPos) continue;

        var pattern = checkGuess(word, answer);
        var correctCount = 0;
        var absentCount = 0;
        var newGreens = 0;
        for (var k = 0; k < pattern.length; k++) {
          if (pattern[k] === 'correct') {
            correctCount++;
            if (!greenConstraints[k]) newGreens++;
          }
          if (pattern[k] === 'absent') absentCount++;
        }
        if (correctCount === WORD_LENGTH) continue;
        // Avoid all-absent early — want SOME info for the player
        if (absentCount === WORD_LENGTH && rowIdx < numRows - 1 && checked < 200) continue;

        checked++;

        // For non-last rows: pick the word with fewest NEW greens.
        // This keeps patterns diverse — greens accumulate gradually.
        if (rowIdx < numRows - 1) {
          if (newGreens < bestNewGreens) {
            bestCandidate = { word: word, pattern: pattern };
            bestNewGreens = newGreens;
          }
          if (bestNewGreens === 0 && checked >= 50) break;
          if (checked >= 300 && bestCandidate) break;
        } else {
          bestCandidate = { word: word, pattern: pattern };
          break;
        }
      }

      if (!bestCandidate) break;

      usedWords.add(bestCandidate.word.toLowerCase());
      rows.push({ originalWord: bestCandidate.word, pattern: bestCandidate.pattern });

      // Tally this row's letter-reveal counts (greens + yellows count toward must-contain)
      var rowReveal = {};
      for (var k = 0; k < bestCandidate.pattern.length; k++) {
        if (bestCandidate.pattern[k] === 'correct') {
          greenConstraints[k] = bestCandidate.word[k];
          rowReveal[bestCandidate.word[k]] = (rowReveal[bestCandidate.word[k]] || 0) + 1;
        } else if (bestCandidate.pattern[k] === 'present') {
          rowReveal[bestCandidate.word[k]] = (rowReveal[bestCandidate.word[k]] || 0) + 1;
          // Track: this letter can't go at this position again
          if (!yellowExclusions[k]) yellowExclusions[k] = {};
          yellowExclusions[k][bestCandidate.word[k]] = true;
        }
      }
      // Max-merge into accumulated must-contain counts
      for (var L in rowReveal) {
        if (!mustContainCounts[L] || mustContainCounts[L] < rowReveal[L]) {
          mustContainCounts[L] = rowReveal[L];
        }
      }
      // Eliminate gray letters (not in answer) so they can't repeat
      for (var k = 0; k < bestCandidate.word.length; k++) {
        if (!answerSet[bestCandidate.word[k]]) {
          eliminatedLetters[bestCandidate.word[k]] = true;
        }
      }
    }

    // No sorting — order matters for hard mode constraint progression
    return {
      answer: answer,
      rows: rows,
      solved: new Array(rows.length).fill(false),
      playerWords: new Array(rows.length).fill('')
    };
  }

function validConstraints(puzzle) {
  function collectConstraints(uptoRow, overrideRow, overrideWord) {
    var greens = {};         // position -> letter (from answer at green positions)
    var requiredCounts = {}; // letter -> min count required (multiset must-contain)
    var yellowExcl = {};     // position -> {letter: true} — yellow letter can't repeat at same position
    var eliminated = {};     // gray letters already used (can't reuse)

    // Build set of answer letters (these are never "eliminated")
    var answerSet = {};
    for (var i = 0; i < WORD_LENGTH; i++) answerSet[puzzle.answer[i]] = true;

    for (var r = 0; r < uptoRow; r++) {
      var pw = (r === overrideRow) ? overrideWord : (puzzle.solved[r] ? puzzle.playerWords[r] : null);
      if (!pw) continue;
      var pattern = puzzle.rows[r].pattern;
      // Tally this row's letter reveal counts (greens + yellows)
      var rowCounts = {};
      for (var i = 0; i < WORD_LENGTH; i++) {
        if (pattern[i] === 'correct') {
          greens[i] = puzzle.answer[i];
          rowCounts[pw[i]] = (rowCounts[pw[i]] || 0) + 1;
        } else if (pattern[i] === 'present') {
          rowCounts[pw[i]] = (rowCounts[pw[i]] || 0) + 1;
          if (!yellowExcl[i]) yellowExcl[i] = {};
          yellowExcl[i][pw[i]] = true;
        }
      }
      // Max-merge into requiredCounts
      for (var L in rowCounts) {
        if (!requiredCounts[L] || requiredCounts[L] < rowCounts[L]) {
          requiredCounts[L] = rowCounts[L];
        }
      }
      // Track gray letters (not in answer) for elimination
      for (var i = 0; i < WORD_LENGTH; i++) {
        if (!answerSet[pw[i]]) {
          eliminated[pw[i]] = true;
        }
      }
    }

    return { greens: greens, requiredCounts: requiredCounts, yellowExcl: yellowExcl, eliminated: eliminated };
  }

  function findViolation(word, cons) {
    // Green constraints: must have specific letter at specific position
    for (var pos in cons.greens) {
      var p = parseInt(pos);
      if (word[p] !== cons.greens[pos]) {
        return { type: 'green', pos: p, letter: cons.greens[pos] };
      }
    }

    // Yellow position exclusion: can't put letter back where it was yellow
    for (var pos in cons.yellowExcl) {
      var p = parseInt(pos);
      if (cons.yellowExcl[pos][word[p]]) {
        return { type: 'yellowPos', pos: p, letter: word[p] };
      }
    }

    // Multiset must-contain: word must include each known letter ≥ N times
    for (var letter in cons.requiredCounts) {
      var need = cons.requiredCounts[letter];
      var have = 0;
      for (var j = 0; j < WORD_LENGTH; j++) if (word[j] === letter) have++;
      if (have < need) {
        return { type: 'missing', letter: letter, need: need };
      }
    }

    // Gray elimination: can't reuse gray letters from previous rows
    for (var i = 0; i < WORD_LENGTH; i++) {
      if (cons.eliminated[word[i]]) {
        return { type: 'eliminated', letter: word[i] };
      }
    }

    return null;
  }
  for (let row = 0; row < puzzle.rows.length; row++)
    if (findViolation(puzzle.playerWords[row], collectConstraints(row, -1, null))) return false;
  return true;
}

function validateUnwordleDaily(bank, date, evidence) {
  const reject = () => ({ required: true, ok: false, error: 'Invalid or unfinished daily solve' });
  if (!evidence || evidence.length !== 5 || !Array.isArray(evidence.patterns) || evidence.patterns.length !== 3
      || !Array.isArray(evidence.playerWords) || evidence.playerWords.length !== 3) return reject();
  for (const row of evidence.patterns)
    if (!Array.isArray(row) || row.length !== 5 || row.some(tile => !['correct','present','absent'].includes(tile))) return reject();
  const daily = bank.getDailyWord('unwordle-sp', 5);
  if (!daily || daily.date !== date || typeof daily.word !== 'string')
    return { required: true, ok: false, unavailable: true, error: 'Canonical daily puzzle unavailable' };
  const answer = daily.word.toUpperCase();
  if (!/^[A-Z]{5}$/.test(answer)) return reject();
  const playerWords = [];
  for (const raw of evidence.playerWords) {
    if (typeof raw !== 'string' || !/^[a-z]{5}$/i.test(raw) || (!bank.isValidWord(raw) && !bank.isValidTarget(raw))) return reject();
    playerWords.push(raw.toUpperCase());
  }
  for (let row = 0; row < 3; row++)
    if (JSON.stringify(checkGuess(playerWords[row], answer)) !== JSON.stringify(evidence.patterns[row])) return reject();
  const puzzle = { answer, rows: evidence.patterns.map(pattern => ({ pattern })), playerWords, solved: [true,true,true] };
  if (!validConstraints(puzzle)) return reject();
  const dictionary = bank.getDictionary(5), targets = bank.getTargets(5);
  if (!dictionary.length || !targets.length)
    return { required: true, ok: false, unavailable: true, error: 'Canonical word bank unavailable' };
  const revision = crypto.createHash('sha256').update(JSON.stringify([dictionary,targets])).digest('hex');
  const key = date + ':' + answer + ':' + revision;
  if (!cachedFamily || cachedFamily.key !== key)
    cachedFamily = { key, patterns: [], next: 0, words: { dictionary: new Set([...dictionary,...targets]) } };
  const patternKey = JSON.stringify(evidence.patterns);
  if (cachedFamily.patterns.includes(patternKey)) return { required: true, ok: true, won: true };
  while (cachedFamily.next < 15) {
    const retry = cachedFamily.next++;
    const seed = date + '-normal' + (retry ? '-r' + retry : '');
    const generated = generatePuzzleForAnswer(answer, cachedFamily.words, createSeededRNG(seed));
    if (generated.rows.length !== 3) continue;
    const candidate = JSON.stringify(generated.rows.map(row => row.pattern));
    cachedFamily.patterns.push(candidate);
    if (candidate === patternKey) return { required: true, ok: true, won: true };
  }
  return reject();
}

module.exports = { validateUnwordleDaily, createSeededRNG, checkGuess, generatePuzzleForAnswer };
