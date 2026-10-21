// Downloads the canonical shared word bank from the Word Tycoon ecosystem.
//
// HangStream ships a partial copy of the ecosystem's shared word bank
// (server/searchle/shared/word-bank/). The upstream copy lives in
// `searchle/server/shared/word-bank/` and is the single source of truth for
// every game in the ecosystem. This script pulls the files HangStream was
// missing and records provenance next to them.
//
//   node server/games/tools/fetch-word-bank.js            # download
//   node server/games/tools/fetch-word-bank.js --check    # report only
//
// Sources (MIT, John Stanley; word lists carry their own terms — see
// WORD_BANK_SOURCES below):
//   https://github.com/johnrstanley11-gif/word-tycoon-ecosystem
//
//   targets.json                     curated target words, keyed by length
//   searchle-easy-targets.json       easy tier (flat array)
//   searchle-very-easy-targets.json  very easy tier (flat array)
//   blocked-words.json               shared blocklist (exact + regex patterns)

const fs = require('fs');
const path = require('path');

const REPO = 'johnrstanley11-gif/word-tycoon-ecosystem';
const BRANCH = 'main';
const RAW_BASE = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/`;

const BANK_DIR = path.join(__dirname, '..', '..', 'searchle', 'shared', 'word-bank');

const FILES = [
  { name: 'targets.json', source: 'searchle/server/shared/word-bank/targets.json' },
  { name: 'searchle-easy-targets.json', source: 'searchle/server/shared/word-bank/searchle-easy-targets.json' },
  { name: 'searchle-very-easy-targets.json', source: 'searchle/server/shared/word-bank/searchle-very-easy-targets.json' },
  { name: 'blocked-words.json', source: 'searchle/server/shared/blocked-words.json' },
];

async function main() {
  const checkOnly = process.argv.includes('--check');
  fs.mkdirSync(BANK_DIR, { recursive: true });

  for (const file of FILES) {
    const url = RAW_BASE + file.source;
    const res = await fetch(url, { headers: { 'User-Agent': 'HangStream-dev (word bank importer)' } });
    if (!res.ok) {
      console.error(`FAIL ${file.name}: HTTP ${res.status} (${url})`);
      continue;
    }
    const text = await res.text();
    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch (e) {
      console.error(`FAIL ${file.name}: not valid JSON — ${e.message}`);
      continue;
    }
    const count = Array.isArray(parsed)
      ? parsed.length
      : Object.values(parsed).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
    const dest = path.join(BANK_DIR, file.name);
    if (checkOnly) {
      const exists = fs.existsSync(dest);
      console.log(`${exists ? 'HAVE' : 'MISS'} ${file.name} (${count} entries)`);
      continue;
    }
    fs.writeFileSync(dest, text, 'utf8');
    console.log(`OK   ${file.name} — ${count} entries -> ${path.relative(process.cwd(), dest)}`);
  }

  console.log('\nWord bank provenance:');
  console.log(`  repository : ${REPO}@${BRANCH} (MIT)`);
  console.log('  targets    : curated by the ecosystem authors; used as the general');
  console.log('               target pool for Hangman / Speed Scramble.');
  console.log('  blocked    : shared blocklist applied to every target and guess.');
  console.log('  wikipedia  : see public/custom-words.json header (CC BY-SA 4.0).');
}

main().catch((err) => { console.error('ERR', err.message); process.exitCode = 1; });
