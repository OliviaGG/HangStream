// Extract the 1000 basic words from the Simple English Wikipedia list.
//
// Source: https://simple.wikipedia.org/wiki/Wikipedia:List_of_1000_basic_words
//
// Licence: Simple English Wikipedia text is CC BY-SA 4.0. The list itself is
// the standard "1000 basic English words" list, and the Word Tycoon ecosystem
// treats Wikipedia-derived data the same way — "Word lists and Wikipedia-derived
// data keep their original sources' terms (Wikipedia content is CC BY-SA)". The
// vendored copy keeps the source and licence in its header so the terms travel
// with the data.
//
// Usage: node server/games/tools/fetch-basic-words.js [outfile]
//
// Default outfile: server/games/data/basic-words.txt (one word per line).

const fs = require('fs');
const path = require('path');

const SOURCE = 'https://simple.wikipedia.org/w/index.php?title=Wikipedia:List_of_1000_basic_words&action=raw';

/**
 * Pull the words out of the raw wikitext.
 *
 * The page is a series of `===A===` sections, each a line of
 * `:[[wikt:word|word]], [[wikt:word|word]], ...`. Some entries render the
 * target differently from the display text (`[[wikt:danger|dangerous]]`), so
 * the *display* text is the word we want.
 */
function parseWords(wikitext) {
  const words = [];
  for (const line of String(wikitext || '').split('\n')) {
    if (!line.trim().startsWith(':')) continue;
    // Only list lines, not the "(no words starting with 'x')" placeholder.
    if (line.includes('no words starting')) continue;
    const matches = line.matchAll(/\[\[wikt:[^\]]*\|([^\]]+)\]\]/g);
    for (const m of matches) {
      const word = m[1].trim().toLowerCase();
      if (!word) continue;
      if (!/^[a-z]+$/.test(word)) continue; // letters only
      words.push(word);
    }
  }
  return words;
}

/**
 * Words that make a poor Hangman puzzle or are unsuitable for a public
 * stream. The list is aimed at ESL learners, so it is full of function words
 * ("the", "and", "about") that are guessable in one or two tries, plus a
 * couple of entries that have no place in a family-friendly game.
 */
const BLOCKED = new Set([
  'sex',       // in the source list; not appropriate for a public stream
]);

/** Short function words that are over-guessed and make trivial puzzles. */
const TRIVIAL = new Set([
  'a', 'an', 'as', 'at', 'be', 'by', 'do', 'go', 'he', 'if', 'in', 'is', 'it',
  'me', 'my', 'no', 'of', 'on', 'or', 'so', 'to', 'up', 'us', 'we', 'am',
  'the', 'and', 'but', 'for', 'not', 'you', 'are', 'was', 'were', 'been',
  'have', 'has', 'had', 'his', 'her', 'him', 'its', 'our', 'out', 'own',
  'per', 'too', 'very', 'all', 'any', 'can', 'did', 'got', 'let', 'may',
  'new', 'now', 'one', 'two', 'ten', 'who', 'why', 'yes', 'yet', 'day',
]);

/**
 * Keep a word if it can actually be a puzzle.
 *
 * Rules, in order:
 *  - not blocked outright
 *  - at least 4 letters: a 3-letter Hangman board is over in two guesses,
 *    and Hangman's own minimum is 4
 *  - not a trivial function word
 *  - at most 14 letters: long enough to still be readable on stream
 */
function isUsable(word) {
  if (BLOCKED.has(word)) return false;
  if (TRIVIAL.has(word)) return false;
  if (word.length < 4) return false;
  if (word.length > 14) return false;
  return true;
}

/** Header written above the vendored word list. */
const HEADER = [
  '# Simple English Wikipedia - list of 1000 basic words',
  '# Source: https://simple.wikipedia.org/wiki/Wikipedia:List_of_1000_basic_words',
  '# Licence: CC BY-SA 4.0 (Wikipedia content). Attribution required when',
  '# redistributing; the words themselves are not copyrightable, the selection',
  '# is. Regenerate with: node server/games/tools/fetch-basic-words.js',
  '#',
  '# Filtered to usable puzzle words (letters only, 4-14 characters, no trivial',
  '# function words). One word per line.',
  '',
].join('\n');

async function main() {
  const outfile = process.argv[2]
    ? path.resolve(process.argv[2])
    : path.join(__dirname, '..', 'data', 'basic-words.txt');

  const res = await fetch(SOURCE, { headers: { 'User-Agent': 'HangStream/1.0 (word list importer)' } });
  if (!res.ok) throw new Error(`fetch failed: ${res.status}`);
  const wikitext = await res.text();

  const all = parseWords(wikitext);
  const seen = new Set();
  const kept = [];
  for (const word of all) {
    if (seen.has(word)) continue;
    seen.add(word);
    if (!isUsable(word)) continue;
    kept.push(word);
  }

  console.log(`parsed ${all.length} words, kept ${kept.length} after filtering`);
  const byLength = {};
  for (const w of kept) byLength[w.length] = (byLength[w.length] || 0) + 1;
  console.log('by length:', JSON.stringify(byLength));

  fs.mkdirSync(path.dirname(outfile), { recursive: true });
  fs.writeFileSync(outfile, HEADER + kept.join('\n') + '\n', 'utf8');
  console.log('wrote', outfile);
}

if (require.main === module) {
  main().catch((err) => { console.error('ERR', err.message); process.exitCode = 1; });
}

module.exports = { parseWords, isUsable, BLOCKED, TRIVIAL };
