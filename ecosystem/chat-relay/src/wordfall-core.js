(function attachWordfallCore(root, factory) {
  const words = typeof module === 'object' && module.exports
    ? []
    : root.WordfallWords;
  const api = factory(words);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WordfallCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function createWordfallCore(words) {
  'use strict';

  const SIZE = 7;
  const MOVES = 18;
  const GOAL = 70;
  const COMBO_WINDOW_MS = 7000;
  const MIN_VOWELS = 14;
  const ZIPF_COMMON_THRESHOLD = 4.0;
  const LETTERS = 'AAAAAAAABBBCCCDDDDEEEEEEEEEEEEFFGGGHHHHIIIIIIIJKLLLLMMNNNNNNOOOOOOOOPPRRRRRRSSSSSSTTTTTTTUUUVVWWXYZZ';
  const VOWELS = 'AAAAAAAEEEEEEEEEEIIIIIIOOOOOOOUUU';
  const WORDS = new Set();
  const TIERS = new Map();

  let nextId = 1;
  function randomLetter(random = Math.random) {
    return LETTERS[Math.floor(random() * LETTERS.length)];
  }
  function isVowel(letter) { return 'AEIOU'.includes(letter); }
  function countVowels(board) { return board.reduce((count, tile) => count + (isVowel(tile.letter) ? 1 : 0), 0); }
  function makeTile(random, forceVowel = false) {
    return { id: nextId++, letter: forceVowel
      ? VOWELS[Math.floor(random() * VOWELS.length)] : randomLetter(random) };
  }
  function neighbor(a, b) {
    const ar = Math.floor(a / SIZE), ac = a % SIZE;
    const br = Math.floor(b / SIZE), bc = b % SIZE;
    return a !== b && Math.abs(ar - br) <= 1 && Math.abs(ac - bc) <= 1;
  }
  function wordAt(board, path) {
    return path.map(index => board[index].letter).join('').toLowerCase();
  }
  function validatePath(board, path) {
    if (!Array.isArray(board) || board.length !== SIZE * SIZE || !Array.isArray(path)) return { ok: false, reason: 'invalid' };
    if (path.length < 3) return { ok: false, reason: 'short' };
    const used = new Set();
    for (let i = 0; i < path.length; i++) {
      const index = path[i];
      if (!Number.isInteger(index) || index < 0 || index >= board.length || used.has(index)
        || !board[index] || !/^[A-Z]$/.test(board[index].letter)
        || (i > 0 && !neighbor(path[i - 1], index))) return { ok: false, reason: 'path' };
      used.add(index);
    }
    const word = wordAt(board, path);
    if (!WORDS.has(word)) return { ok: false, reason: 'word', word };
    return { ok: true, word };
  }
  function buildTrie() {
    const root = {};
    for (const word of WORDS) {
      let node = root;
      for (const char of word) node = node[char] ||= {};
      node.end = word;
    }
    return root;
  }
  let TRIE = {};
  function configureWords(list, tierCodes) {
    if (!Array.isArray(list) || !list.length || typeof tierCodes !== 'string'
      || tierCodes.length !== list.length) return false;
    const entries = [];
    for (let i = 0; i < list.length; i++) {
      const word = list[i];
      if (typeof word !== 'string' || !/^[a-z]{3,7}$/i.test(word)) return false;
      const tier = tierCodes[i];
      if (word.length === 3 ? tier !== 't' : !'crh'.includes(tier)) return false;
      entries.push([word.toLowerCase(), tier]);
    }
    WORDS.clear();
    TIERS.clear();
    for (const [word, tier] of entries) { WORDS.add(word); TIERS.set(word, tier); }
    TRIE = buildTrie();
    return true;
  }
  configureWords(words, words.tiers);
  function seededRandom(seed) {
    let value = 2166136261;
    for (const character of String(seed)) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
    return function random() {
      value += 0x6D2B79F5;
      let n = value;
      n = Math.imul(n ^ n >>> 15, n | 1);
      n ^= n + Math.imul(n ^ n >>> 7, n | 61);
      return ((n ^ n >>> 14) >>> 0) / 4294967296;
    };
  }
  function findWords(board, limit = 30) {
    if (!Array.isArray(board) || board.length !== SIZE * SIZE) return [];
    const found = new Map();
    function visit(index, node, path, used) {
      const tile = board[index];
      const next = tile && node[tile.letter.toLowerCase()];
      if (!next) return;
      const updated = [...path, index];
      const bits = used | (1n << BigInt(index));
      if (next.end && !found.has(next.end)) found.set(next.end, { word: next.end, path: updated });
      if (found.size >= limit) return;
      const row = Math.floor(index / SIZE), col = index % SIZE;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const other = nr * SIZE + nc;
        if (!(bits & (1n << BigInt(other)))) visit(other, next, updated, bits);
        if (found.size >= limit) return;
      }
    }
    for (let i = 0; i < board.length && found.size < limit; i++) visit(i, TRIE, [], 0n);
    return [...found.values()];
  }
  function findPathForWord(board, word) {
    const target = String(word || '').toLowerCase();
    if (!WORDS.has(target) || !Array.isArray(board) || board.length !== SIZE * SIZE) return null;
    function visit(index, depth, path, used) {
      if (board[index]?.letter.toLowerCase() !== target[depth]) return null;
      const nextPath = [...path, index];
      if (depth === target.length - 1) return nextPath;
      const bits = used | (1n << BigInt(index));
      const row = Math.floor(index / SIZE), col = index % SIZE;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= SIZE || nc < 0 || nc >= SIZE) continue;
        const other = nr * SIZE + nc;
        if (!(bits & (1n << BigInt(other)))) {
          const found = visit(other, depth + 1, nextPath, bits);
          if (found) return found;
        }
      }
      return null;
    }
    for (let i = 0; i < board.length; i++) {
      const path = visit(i, 0, [], 0n);
      if (path) return path;
    }
    return null;
  }
  function createBoard(random = Math.random) {
    for (let attempt = 0; attempt < 40; attempt++) {
      const board = Array.from({ length: SIZE * SIZE }, () => makeTile(random));
      if (countVowels(board) >= MIN_VOWELS && findWords(board, 5).length >= 5) return board;
    }
    // A deterministic fallback also protects against unusual/random-test generators.
    const board = Array.from({ length: SIZE * SIZE }, () => makeTile(random));
    'STARE'.split('').forEach((letter, col) => { board[col].letter = letter; });
    let vowels = countVowels(board);
    for (let i = 5; vowels < MIN_VOWELS && i < board.length; i++) {
      if (isVowel(board[i].letter)) continue;
      board[i].letter = VOWELS[Math.floor(random() * VOWELS.length)];
      vowels++;
    }
    return board;
  }
  function dropTiles(board, path, random = Math.random, pinnedIndices = []) {
    nextId = Math.max(nextId, ...board.map(tile => tile.id + 1));
    const removed = new Set(path);
    const pinned = new Set([...pinnedIndices].filter(index => !removed.has(index)));
    const next = new Array(SIZE * SIZE);
    const survivingVowels = board.reduce((count, tile, index) =>
      count + (!removed.has(index) && isVowel(tile.letter) ? 1 : 0), 0);
    let neededVowels = Math.max(0, MIN_VOWELS - survivingVowels);
    let remainingSpawns = removed.size;
    function fillSegment(col, top, bottom) {
      const survivors = [];
      for (let row = bottom; row >= top; row--) {
        const index = row * SIZE + col;
        if (!removed.has(index)) survivors.push({ ...board[index], fromRow: row });
      }
      let spawn = 0;
      for (let row = bottom; row >= top; row--) {
        if (survivors.length) next[row * SIZE + col] = survivors.shift();
        else {
          const forceVowel = neededVowels > 0 && random() < neededVowels / remainingSpawns;
          const tile = makeTile(random, forceVowel);
          if (isVowel(tile.letter)) neededVowels = Math.max(0, neededVowels - 1);
          remainingSpawns--;
          next[row * SIZE + col] = { ...tile, fromRow: top - 1 - spawn++ };
        }
      }
    }
    for (let col = 0; col < SIZE; col++) {
      let bottom = SIZE - 1;
      for (let row = SIZE - 1; row >= -1; row--) {
        const index = row * SIZE + col;
        if (row >= 0 && !pinned.has(index)) continue;
        fillSegment(col, row + 1, bottom);
        if (row >= 0) next[index] = { ...board[index], fromRow: row };
        bottom = row - 1;
      }
    }
    return next;
  }
  const LETTER_RARITY = { d: 15, l: 15, c: 30, u: 30, m: 30, w: 30, f: 30,
    g: 60, y: 60, p: 60, b: 105, v: 105, k: 105, j: 180, x: 180, q: 300, z: 300 };
  const LENGTH_BONUS = { 4: 75, 5: 150, 6: 300, 7: 500 };
  const TIER_BASE = { t: 100, c: 1500, r: 500, h: 1000 };
  const TIER_NAME = { t: 'three-letter', c: 'common', r: 'rare', h: 'hidden' };
  function wordTier(word) { return TIER_NAME[TIERS.get(String(word || '').toLowerCase())] || null; }
  function baseScore(word) { return TIER_BASE[TIERS.get(String(word || '').toLowerCase())] || 0; }
  function scoreWord(word) {
    // RecTangled word tier + shared letter-rarity and word-length bonuses.
    const value = String(word || '').toLowerCase();
    if (!/^[a-z]{3,7}$/.test(value)) return 0;
    const base = baseScore(value);
    if (!base) return 0;
    return base
      + [...value].reduce((sum, letter) => sum + (LETTER_RARITY[letter] || 0), 0)
      + (LENGTH_BONUS[value.length] || 0);
  }
  return { SIZE, MOVES, GOAL, COMBO_WINDOW_MS, MIN_VOWELS, ZIPF_COMMON_THRESHOLD, WORDS, configureWords, wordTier, baseScore, seededRandom, neighbor, wordAt, validatePath, findWords, findPathForWord, createBoard, dropTiles, countVowels, scoreWord };
});
