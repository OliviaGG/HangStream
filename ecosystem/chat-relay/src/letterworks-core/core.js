(function attachLetterworksCore(root, factory) {
  const catalog = typeof module === 'object' && module.exports ? require('./catalog') : root.LetterworksCatalog;
  const api = factory(catalog);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LetterworksCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createLetterworksCore(catalog) {
  'use strict';

  const SCORE_BY_LENGTH = Object.freeze({ 3: 10, 4: 25, 5: 50, 6: 100 });
  const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

  const PUZZLES = Object.freeze(catalog.puzzles);
  const RUN_LENGTH = 5;
  const RACK_CYCLE_SIZE = PUZZLES.length;
  const DATA_VERSION = 'beta-1';
  const LEGACY_PUZZLE_COUNT = catalog.source.legacyRacks || PUZZLES.length;
  const EXPANDED_SEED_PREFIX = 'v2:';
  const PUZZLE_BY_ID = new Map([...PUZZLES, ...(catalog.retired || [])].map(puzzle => [puzzle.id, puzzle]));

  const UPGRADES = Object.freeze([
    { id: 'big_orders', icon: '↗', name: 'Big Orders', description: 'Words with 5 or 6 letters pay 50% more.' },
    { id: 'small_change', icon: '¢', name: 'Small Change', description: 'Every 3-letter word earns 8 extra points.' },
    { id: 'vowel_venture', icon: 'A', name: 'Vowel Venture', description: 'Words with 3 or more vowels earn 18 extra points.' },
    { id: 'full_house', icon: '6', name: 'Full House', description: 'Six-letter words earn 80 extra points.' },
    { id: 'assembly_line', icon: '⚙', name: 'Assembly Line', description: 'Each word in a round adds a growing +2 combo bonus.' },
    { id: 'opening_bell', icon: '①', name: 'Opening Bell', description: 'The first 3 words each round earn 15 extra points.' },
    { id: 'word_dividend', icon: '⑤', name: 'Word Dividend', description: 'Every 5th word earns 50 extra points.' },
    { id: 'golden_letter', icon: '★', name: 'Golden Letter', description: 'Words using the round’s gold letter earn 12 extra points.' },
    { id: 'compound_interest', icon: '%', name: 'Compound Interest', description: 'Bank 2 points for every unused second.' },
    { id: 'second_shift', icon: '+', name: 'Second Shift', description: 'Start every future round with 20 extra seconds.' },
    { id: 'safety_inspector', icon: '?', name: 'Safety Inspector', description: 'Gain one additional hint each round.' },
    { id: 'overtime', icon: '⏱', name: 'Overtime', description: 'Finding a 5- or 6-letter word restores 2 seconds.' }
  ]);

  function normalizeWord(value) {
    return String(value || '').trim().toLowerCase().replace(/[^a-z]/g, '');
  }

  function letterCounts(value) {
    const counts = Object.create(null);
    for (const letter of normalizeWord(value)) counts[letter] = (counts[letter] || 0) + 1;
    return counts;
  }

  function canBuildWord(word, rack) {
    const available = letterCounts(rack);
    const needed = letterCounts(word);
    return Object.keys(needed).every(letter => needed[letter] <= (available[letter] || 0));
  }

  function baseScore(word) {
    return SCORE_BY_LENGTH[normalizeWord(word).length] || 0;
  }

  function hasUpgrade(upgradeIds, id) {
    return Array.isArray(upgradeIds) && upgradeIds.includes(id);
  }

  function scoreWord(word, upgradeIds, context) {
    const clean = normalizeWord(word);
    const state = context || {};
    const acceptedCount = Number(state.acceptedCount || 0);
    let score = baseScore(clean);
    const bonuses = [];

    if (hasUpgrade(upgradeIds, 'big_orders') && clean.length >= 5) {
      const amount = Math.round(score * 0.5);
      score += amount;
      bonuses.push({ id: 'big_orders', amount });
    }
    if (hasUpgrade(upgradeIds, 'small_change') && clean.length === 3) {
      score += 8;
      bonuses.push({ id: 'small_change', amount: 8 });
    }
    if (hasUpgrade(upgradeIds, 'vowel_venture') && [...clean].filter(letter => VOWELS.has(letter)).length >= 3) {
      score += 18;
      bonuses.push({ id: 'vowel_venture', amount: 18 });
    }
    if (hasUpgrade(upgradeIds, 'full_house') && clean.length === 6) {
      score += 80;
      bonuses.push({ id: 'full_house', amount: 80 });
    }
    if (hasUpgrade(upgradeIds, 'assembly_line') && acceptedCount > 0) {
      const amount = acceptedCount * 2;
      score += amount;
      bonuses.push({ id: 'assembly_line', amount });
    }
    if (hasUpgrade(upgradeIds, 'opening_bell') && acceptedCount < 3) {
      score += 15;
      bonuses.push({ id: 'opening_bell', amount: 15 });
    }
    if (hasUpgrade(upgradeIds, 'word_dividend') && (acceptedCount + 1) % 5 === 0) {
      score += 50;
      bonuses.push({ id: 'word_dividend', amount: 50 });
    }
    if (hasUpgrade(upgradeIds, 'golden_letter') && normalizeWord(state.bonusLetter) && clean.includes(normalizeWord(state.bonusLetter))) {
      score += 12;
      bonuses.push({ id: 'golden_letter', amount: 12 });
    }
    return { score, base: baseScore(clean), bonuses };
  }

  function validateSubmission(word, puzzle, foundWords) {
    const clean = normalizeWord(word);
    const found = foundWords instanceof Set ? foundWords : new Set(foundWords || []);

    if (clean.length < 3) return { ok: false, code: 'too_short', message: 'Words need at least 3 letters.' };
    if (!canBuildWord(clean, puzzle.rack)) return { ok: false, code: 'letters', message: 'That word uses letters outside the rack.' };
    if (found.has(clean)) return { ok: false, code: 'duplicate', message: 'Already on the books.' };
    if (puzzle.requiredLetter && !clean.includes(puzzle.requiredLetter.toLowerCase())) {
      return { ok: false, code: 'required_letter', message: `Boss rule: every word must use ${puzzle.requiredLetter}.` };
    }
    if (!puzzle.words.includes(clean)) return { ok: false, code: 'unknown', message: 'Not on the word list for this rack.' };
    return { ok: true, word: clean };
  }

  function getRoundSeconds(puzzle, upgradeIds) {
    return puzzle.seconds + (hasUpgrade(upgradeIds, 'second_shift') ? 20 : 0);
  }

  function getHintsPerRound(upgradeIds) {
    return 1 + (hasUpgrade(upgradeIds, 'safety_inspector') ? 1 : 0);
  }

  function getBankBonus(secondsRemaining, upgradeIds) {
    if (!hasUpgrade(upgradeIds, 'compound_interest')) return 0;
    return Math.max(0, Math.floor(Number(secondsRemaining) || 0) * 2);
  }

  function isMasterWord(word, puzzle) {
    return puzzle.masterWords.includes(normalizeWord(word));
  }

  function roundComplete(roundScore, masterFound, puzzle) {
    return Number(roundScore) >= puzzle.targetScore && Boolean(masterFound);
  }

  function canBankWithoutBlueprint(roundScore, masterFound, foundCount, puzzle) {
    return !masterFound && Number(roundScore) >= puzzle.targetScore
      && puzzle.masterWords.length === 1 && Number(foundCount) === puzzle.words.length - 1;
  }

  function getEdmontonDate(value) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Edmonton', year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(value ? new Date(value) : new Date());
    const part = type => parts.find(item => item.type === type).value;
    return `${part('year')}-${part('month')}-${part('day')}`;
  }

  function dailySeed(date) {
    // Keep the deployment-day daily identical for players who already started it.
    return date >= '2026-09-21' ? `${EXPANDED_SEED_PREFIX}daily:${date}` : `daily:${date}`;
  }

  function seededRandom(seed) {
    let value = 2166136261;
    for (const letter of String(seed)) value = Math.imul(value ^ letter.charCodeAt(0), 16777619);
    return () => {
      value += 0x6D2B79F5;
      let mixed = Math.imul(value ^ value >>> 15, 1 | value);
      mixed ^= mixed + Math.imul(mixed ^ mixed >>> 7, 61 | mixed);
      return ((mixed ^ mixed >>> 14) >>> 0) / 4294967296;
    };
  }

  function shuffled(items, random) {
    const copy = [...items];
    const next = random || Math.random;
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swap = Math.floor(next() * (index + 1));
      [copy[index], copy[swap]] = [copy[swap], copy[index]];
    }
    return copy;
  }

  function createRun(seed) {
    const bank = String(seed).startsWith(EXPANDED_SEED_PREFIX) ? PUZZLES : PUZZLES.slice(0, LEGACY_PUZZLE_COUNT);
    const encoded = /^v2:(?:run|practice|stream):racks:([a-z]{6}(?:\.[a-z]{6}){4}):.+$/.exec(String(seed));
    const selected = encoded?.[1].split('.').map(id => PUZZLE_BY_ID.get(id));
    const bases = selected?.every(Boolean) && new Set(selected).size === RUN_LENGTH
      ? selected : shuffled(bank, seededRandom(`${DATA_VERSION}:${seed}`)).slice(0, RUN_LENGTH);
    return bases.map((base, index) => {
      const boss = index === RUN_LENGTH - 1;
      const words = boss ? base.words.filter(word => word.includes(base.bossLetter.toLowerCase())) : [...base.words];
      const availableScore = words.reduce((sum, word) => sum + baseScore(word), 0);
      return { ...base, words, boss, requiredLetter: boss ? base.bossLetter : null,
        targetScore: Math.min(160 + index * 30, Math.floor(availableScore * 0.65)),
        seconds: boss ? 120 : 100, masterWords: words.filter(word => word.length === 6) };
    });
  }

  function rememberRacks(previous, played) {
    const known = new Set(PUZZLES.map(puzzle => puzzle.rack));
    const previousRacks = Array.isArray(previous) ? previous : [];
    const playedRacks = Array.isArray(played) ? played : [];
    // Once the whole bank has been used, the next workshop starts a new cycle.
    const recent = new Set(previousRacks.length >= RACK_CYCLE_SIZE && playedRacks.length ? [] : previousRacks);
    for (const rack of playedRacks) {
      if (typeof rack !== 'string' || !known.has(rack)) continue;
      recent.delete(rack);
      recent.add(rack);
    }
    return [...recent].filter(rack => known.has(rack)).slice(-RACK_CYCLE_SIZE);
  }

  function chooseFreshSeed(prefix, recentRacks, nextToken) {
    const blocked = new Set(rememberRacks(recentRacks, []));
    if (String(prefix).startsWith(EXPANDED_SEED_PREFIX)) {
      const token = String(nextToken());
      const random = seededRandom(`${DATA_VERSION}:${prefix}:${token}`);
      const unused = shuffled(PUZZLES.filter(puzzle => !blocked.has(puzzle.rack)), random);
      const refill = unused.length >= RUN_LENGTH ? [] : shuffled(PUZZLES.filter(puzzle => blocked.has(puzzle.rack)), random);
      const picks = [...unused, ...refill].slice(0, RUN_LENGTH);
      return `${prefix}:racks:${picks.map(puzzle => puzzle.id).join('.')}:${token}`;
    }
    let bestSeed = null, bestOverlap = RUN_LENGTH + 1;
    for (let attempt = 0; attempt < 96; attempt += 1) {
      const seed = prefix + ':' + nextToken();
      const overlap = createRun(seed).filter(round => blocked.has(round.rack)).length;
      if (overlap < bestOverlap) { bestSeed = seed; bestOverlap = overlap; }
      if (!overlap) break;
    }
    return bestSeed;
  }

  function getUpgradeChoices(seed, roundIndex, owned, mode) {
    const practice = mode === 'practice' || String(seed).startsWith('practice:') || String(seed).startsWith('v2:practice:');
    const futureRounds = createRun(seed).slice(roundIndex + 1);
    const vowelWordsAvailable = futureRounds.some(round => round.words.some(word => [...word].filter(letter => VOWELS.has(letter)).length >= 3));
    return shuffled(UPGRADES.filter(upgrade => !owned.includes(upgrade.id)
      && !(practice && ['second_shift', 'overtime', 'compound_interest'].includes(upgrade.id))
      && !(upgrade.id === 'vowel_venture' && !vowelWordsAvailable)),
      seededRandom(`${DATA_VERSION}:${seed}:contracts:${roundIndex}`)).slice(0, 3);
  }

  function remainingSeconds(deadline, now) {
    return Math.max(0, Math.ceil((deadline - now) / 1000));
  }

  function restoreRun(value) {
    // Saves are local beta progress, never an authority for account rewards.
    if (!value || value.version !== DATA_VERSION || !['daily', 'run', 'practice'].includes(value.mode)
      || typeof value.seed !== 'string' || value.seed.length > 120
      || !/^\d{4}-\d{2}-\d{2}$/.test(value.date || '')
      || !Number.isInteger(value.roundIndex) || value.roundIndex < 0 || value.roundIndex >= RUN_LENGTH
      || !['playing', 'paused', 'choosing'].includes(value.status)
      || !Array.isArray(value.upgrades) || value.upgrades.length !== value.roundIndex
      || new Set(value.upgrades).size !== value.upgrades.length
      || value.upgrades.some(id => !UPGRADES.some(upgrade => upgrade.id === id))) return null;
    if (value.mode === 'daily' && value.seed !== `daily:${value.date}` && value.seed !== dailySeed(value.date)) return null;
    const rounds = createRun(value.seed);
    const current = rounds[value.roundIndex];
    if (!Array.isArray(value.foundWords) || new Set(value.foundWords).size !== value.foundWords.length
      || value.foundWords.some(word => !current.words.includes(word))) return null;
    const numeric = ['runScore', 'roundScore', 'totalWords', 'hintsRemaining'];
    if (numeric.some(key => !Number.isInteger(value[key]) || value[key] < 0 || value[key] > 1000000)) return null;
    if (value.hintsRemaining > getHintsPerRound(value.upgrades) || value.runScore < value.roundScore
      || value.totalWords < value.foundWords.length || value.totalWords > rounds.reduce((sum, round) => sum + round.words.length, 0)) return null;
    if (value.mode !== 'practice' && (!Number.isFinite(value.millisecondsRemaining) || value.millisecondsRemaining < 0
      || value.millisecondsRemaining > 600000)) return null;
    const masterFound = value.foundWords.some(word => isMasterWord(word, current));
    if (value.status === 'choosing' && (!(roundComplete(value.roundScore, masterFound, current)
      || canBankWithoutBlueprint(value.roundScore, masterFound, value.foundWords.length, current)) || current.boss)) return null;
    return { version: DATA_VERSION, mode: value.mode, seed: value.seed, date: value.date,
      roundIndex: value.roundIndex, runScore: value.runScore, roundScore: value.roundScore,
      totalWords: value.totalWords, foundWords: new Set(value.foundWords), masterFound,
      upgrades: [...value.upgrades], millisecondsRemaining: value.mode === 'practice' ? null : value.millisecondsRemaining,
      hintsRemaining: value.hintsRemaining, hintText: typeof value.hintText === 'string' ? value.hintText.slice(0, 100) : '',
      hintedWords: Array.isArray(value.hintedWords) ? value.hintedWords.filter(word => current.words.includes(word)).slice(0, 2) : [],
      history: Array.isArray(value.history) ? value.history.slice(0, RUN_LENGTH).map(item => ({
        index: Number.isInteger(item.index) ? item.index : 0,
        found: Array.isArray(item.found) ? item.found.filter(word => typeof word === 'string' && /^[a-z]{3,6}$/.test(word)).slice(0, 150) : []
      })) : [], status: value.status === 'playing' ? 'paused' : value.status };
  }

  return {
    SCORE_BY_LENGTH,
    PUZZLES,
    UPGRADES,
    RUN_LENGTH,
    DATA_VERSION,
    getEdmontonDate,
    dailySeed,
    seededRandom,
    shuffled,
    createRun,
    rememberRacks,
    chooseFreshSeed,
    getUpgradeChoices,
    remainingSeconds,
    restoreRun,
    normalizeWord,
    canBuildWord,
    baseScore,
    scoreWord,
    validateSubmission,
    getRoundSeconds,
    getHintsPerRound,
    getBankBonus,
    isMasterWord,
    roundComplete,
    canBankWithoutBlueprint
  };
});
