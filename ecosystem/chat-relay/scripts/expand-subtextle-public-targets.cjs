'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const curatedWords = ['basketball', 'television', 'electricity', 'photography', 'architecture', 'technology', 'literature', 'university', 'government'];
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));

function expand(targets, easy, words, { dictionary, membership, canonicals, frequency, blocked }) {
  const result = structuredClone(targets);
  const easyResult = easy.slice();
  const all = new Set(Object.values(targets).flat());
  const seen = new Set();
  for (const word of words) {
    // Published daily/weekly games use lengths 5 and 7. Keeping every pool
    // below ten letters identical also preserves every shorter practice seed.
    if (!/^[a-z]{10,}$/.test(word)) throw Error(`Target would change a shorter puzzle pool: ${word}`);
    if (all.has(word) || seen.has(word)) throw Error(`Existing or duplicate target: ${word}`);
    if (!dictionary.has(word) || !membership.has(word) || (canonicals[word] || word) !== word)
      throw Error(`Target lacks canonical dictionary/model membership: ${word}`);
    if (!(frequency[word] >= 4.4) || blocked(word)) throw Error(`Target fails frequency or policy: ${word}`);
    seen.add(word);
    (result[String(word.length)] ||= []).push(word);
    result[String(word.length)].sort();
    if (!easyResult.includes(word)) easyResult.push(word);
  }
  for (let length = 1; length < 10; length++) {
    if (JSON.stringify(result[String(length)]) !== JSON.stringify(targets[String(length)]))
      throw Error(`Changed length ${length} pool`);
  }
  return { targets: result, easy: easyResult };
}

function safeOutput(dir, snapshotRoot) {
  const resolved = path.resolve(dir);
  const normalized = resolved.replace(/\\/g, '/');
  if (/^\/opt(?:\/|$)/.test(normalized)) throw Error('Output must be outside production');
  if (resolved === path.resolve(snapshotRoot) || resolved.startsWith(path.resolve(snapshotRoot) + path.sep))
    throw Error('Output must be outside the canonical snapshot');
  return resolved;
}

function main() {
  const args = Object.fromEntries(process.argv.slice(2).map(value => {
    const index = value.indexOf('=');
    if (!value.startsWith('--') || index < 3) throw Error('Use --snapshot-root=... and --output-dir=...');
    return [value.slice(2, index), value.slice(index + 1)];
  }));
  if (!args['snapshot-root'] || !args['output-dir']) throw Error('Snapshot root and output directory required');
  const root = path.resolve(args['snapshot-root']);
  const out = safeOutput(args['output-dir'], root);
  const bank = path.join(root, 'relay/data/word-bank');
  const targetsFile = path.join(bank, 'targets.json');
  const easyFile = path.join(bank, 'searchle-easy-targets.json');
  const targets = read(targetsFile), easy = read(easyFile);
  const dictionary = new Set(Object.values(read(path.join(bank, 'dictionary.json'))).flat());
  const memberData = read(path.join(root, 'model-membership.json'));
  const frequency = read(path.join(bank, 'frequency.json'));
  const policy = require(path.join(root, 'relay/src/game-word-policy.js'));
  const managerSource = fs.readFileSync(path.join(root, 'server/game-manager.js'), 'utf8');
  const blockSection = managerSource.match(/const SEARCHLE_DUAL_MEANING_BLOCK = new Set\(\[([\s\S]*?)\]\);/);
  if (!blockSection) throw Error('Canonical Subtextle policy missing');
  const dualMeaning = new Set([...blockSection[1].replace(/\/\/[^\r\n]*/g, '').matchAll(/['"]([a-z]+)['"]/g)].map(match => match[1]));
  const result = expand(targets, easy, curatedWords, {
    dictionary, membership: new Set(memberData.words), canonicals: memberData.canonicals,
    frequency, blocked: word => dualMeaning.has(word) || policy.isWordBlockedForGame('searchle', 'target', word),
  });
  fs.mkdirSync(out, { recursive: true });
  const files = [];
  for (const [name, value, input] of [['targets.json', result.targets, targetsFile], ['searchle-easy-targets.json', result.easy, easyFile]]) {
    const bytes = JSON.stringify(value, null, 2) + '\n';
    fs.writeFileSync(path.join(out, name), bytes);
    files.push({ name, beforeSha256: sha(fs.readFileSync(input)), afterSha256: sha(bytes) });
  }
  const manifest = { createdAt: new Date().toISOString(), additions: curatedWords,
    quality: { canonicalModelMembership: true, dictionaryMembership: true, minZipf: 4.4, shorterPoolsUnchanged: true },
    before: { targets: Object.values(targets).flat().length, easy: easy.length },
    after: { targets: Object.values(result.targets).flat().length, easy: result.easy.length }, files };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(JSON.stringify(manifest));
}

module.exports = { curatedWords, expand, safeOutput };
if (require.main === module) main();
