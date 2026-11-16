#!/usr/bin/env node
// Prepare an additive coverage snapshot locally. This never overwrites its input.
// Requires canonical WikiRectangled/Chat Relay source + data, and offline model
// membership exported from Searchle. Runtime source is evaluated unchanged, with
// extra read-only exports, so its private picker/parser rules stay authoritative.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const Module = require('module');
const assert = require('assert/strict');

function resolvedPath(file) {
  let current = path.resolve(file);
  const tail = [];
  while (!fs.existsSync(current)) { tail.unshift(path.basename(current)); const parent = path.dirname(current); if (parent === current) break; current = parent; }
  return path.join(fs.realpathSync(current), ...tail);
}
function assertOutputSafety(outputDir, inputs) {
  const output = resolvedPath(outputDir);
  const normalized = output.replace(/\\/g, '/').toLowerCase();
  assert(!/^\/opt(?:\/|$)/.test(normalized), 'Refusing output inside canonical /opt production directories');
  for (const input of inputs) {
    const source = resolvedPath(input);
    const relative = path.relative(source, output);
    const overlapsDirectory = fs.statSync(source).isDirectory() && (!relative || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)));
    const overlapsFile = ['wikipedia-coverage.json', 'accepted-articles.json', 'summary.json', 'validation-cache.json', 'prefiltered-candidates.json', 'rejected-articles.json'].some(name => path.join(output, name).toLowerCase() === source.toLowerCase());
    assert(!overlapsDirectory && !overlapsFile, `Output would overwrite baseline/source: ${source}`);
  }
}
function assertBaselinePreserved(baselinePages, outputPages, additions) {
  for (const [key, value] of Object.entries(baselinePages)) assert.deepEqual(outputPages[key], value, `Changed existing entry ${key}`);
  const known = new Set(Object.entries(baselinePages).flatMap(([key, value]) => [key, value.title || '']).map(t => t.toLowerCase()));
  for (const item of additions) {
    const title = item.entry.title;
    assert(!known.has(title.toLowerCase()), `Duplicate canonical article ${title}`);
    known.add(title.toLowerCase());
    assert.deepEqual(outputPages[title], item.entry, `Missing addition ${title}`);
  }
  assert.equal(Object.keys(outputPages).length, Object.keys(baselinePages).length + additions.length);
}
function assertGridProof(proof, words) {
  assert.equal(proof.grid.length, proof.rows);
  assert(proof.grid.every(row => row.length === proof.cols));
  for (const word of words) {
    const cells = proof.targetPaths[word];
    assert(Array.isArray(cells) && cells.length === word.length, `Missing path for ${word}`);
    assert.equal(new Set(cells).size, cells.length, `Reused cell for ${word}`);
    let spelling = '';
    for (let index = 0; index < cells.length; index++) {
      const cell = cells[index];
      assert(Number.isInteger(cell) && cell >= 0 && cell < proof.rows * proof.cols);
      const row = Math.floor(cell / proof.cols), col = cell % proof.cols;
      spelling += proof.grid[row][col];
      if (index) { const prev = cells[index - 1]; assert(Math.abs(row - Math.floor(prev / proof.cols)) <= 1 && Math.abs(col - prev % proof.cols) <= 1, `Disconnected path for ${word}`); }
    }
    assert.equal(spelling, word, `Wrong grid spelling for ${word}`);
  }
}
function assertContentProof(checks, minimumViews = 50000) {
  const words = checks.titleWords;
  assert(words.length >= 2 && words.every(w => /^[a-z]{4,9}$/.test(w)), 'Unplayable title words');
  assert.equal(new Set(words).size, words.length, 'Duplicate title word');
  assert(words.reduce((sum, word) => sum + word.length, 0) <= 45, 'Title exceeds solo letter cap');
  assert(checks.cleanedBodyChars >= 400, 'Cleaned article body too short');
  assert(checks.views12mo >= minimumViews, 'Article below popularity threshold');
  assertGridProof(checks.publicGrid, words);
  assertGridProof(checks.soloGrid, [...new Set([...words, ...checks.bodyTargets.map(target => target.word)])]);
}
function writeAtomic(file, content) {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, content);
  let error;
  for (let attempt = 0; attempt < 5; attempt++) {
    try { fs.renameSync(temporary, file); return; }
    catch (caught) { error = caught; Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1)); }
  }
  throw error;
}
if (require.main !== module) { module.exports = { assertOutputSafety, assertBaselinePreserved, assertGridProof, assertContentProof }; return; }

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, values) => {
  if (value.startsWith('--')) pairs.push([value.slice(2), values[index + 1]]);
  return pairs;
}, []));
const required = ['coverage', 'candidates', 'wikirec-dir', 'relay-dir', 'membership', 'out-dir'];
for (const key of required) if (!args[key]) throw new Error(`Missing --${key}`);
const limit = Number(args.limit || 250);
const delay = Number(args.delay || 2000);
const minViews = Number(args['min-views'] || 50000);
const viewsStart = args['views-start'] || '2025100100';
const viewsEnd = args['views-end'] || '2026093000';
const out = path.resolve(args['out-dir']);
assertOutputSafety(out, [...required.filter(key => key !== 'out-dir').map(key => args[key]), ...(args.priority ? [args.priority] : [])]);
assert(Number.isInteger(limit) && limit > 0, 'Limit must be a positive integer');
assert(Number.isFinite(delay) && delay >= 1000, 'Network pacing must be at least one second');
assert(Number.isFinite(minViews) && minViews >= 50000, 'Do not weaken the existing popularity threshold');
fs.mkdirSync(out, { recursive: true });
const read = file => JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
const sha = content => crypto.createHash('sha256').update(content).digest('hex');
const save = (file, value) => writeAtomic(path.join(out, file), JSON.stringify(value, null, 2) + '\n');
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const baselineBytes = fs.readFileSync(args.coverage);
const coverage = read(args.coverage);
const originalPages = { ...coverage.pages };
const existingTitles = new Set(Object.entries(coverage.pages).flatMap(([key, entry]) => [key, entry.title || '']).map(t => t.toLowerCase()));
const membership = read(args.membership);
const validTargets = new Set(membership.words);
const candidateFile = read(args.candidates);
const baseCandidates = Array.isArray(candidateFile) ? candidateFile : candidateFile.titles;
assert(Array.isArray(baseCandidates), 'Candidates must be an array or {titles: []}');
const priorityFile = args.priority ? read(args.priority) : [];
const priorityCandidates = Array.isArray(priorityFile) ? priorityFile : priorityFile.titles;
assert(Array.isArray(priorityCandidates), 'Priority candidates must be an array or {titles: []}');
const priorityTitles = new Set(priorityCandidates);
const candidates = [...new Set([...priorityCandidates, ...baseCandidates])];

process.env.CHAT_RELAY_DIR = path.resolve(args['relay-dir']);
process.env.SEARCHLE_FREQUENCY_PATH = path.join(process.env.CHAT_RELAY_DIR, 'data', 'word-bank', 'frequency.json');
process.env.WIKI_COVERAGE_PATH = path.resolve(args.coverage);
process.env.WIKI_CACHE_FILE = path.join(out, 'wikipedia-runtime-cache.json');
process.env.SEARCHLE_BAD_WORDS_PATH = path.join(process.env.CHAT_RELAY_DIR, 'data', 'searchle-unrankable-words.json');
process.env.SEARCHLE_RANKABLE_WORDS_PATH = path.join(process.env.CHAT_RELAY_DIR, 'data', 'searchle-rankable-words.json');
delete process.env.WIKIREC_EASY_FILTER_DISABLE;

function sourceExports(file, exports) {
  const compiled = new Module(file, module);
  compiled.filename = file;
  compiled.paths = Module._nodeModulePaths(path.dirname(file));
  compiled._compile(fs.readFileSync(file, 'utf8') + `\nmodule.exports.contentExpansionChecks = { ${exports.join(', ')} };`, file);
  return compiled.exports.contentExpansionChecks;
}
const gameRoot = path.resolve(args['wikirec-dir']);
const articleFile = path.join(gameRoot, 'src', 'article.js');
const wikiFile = path.join(gameRoot, 'lib', 'wikipedia.js');
const checks = sourceExports(articleFile, ['articlePassesPickerFilter', 'titleWordNorms', 'isKnownUnrankable', 'extractTargets']);
const { htmlToParagraphs } = sourceExports(wikiFile, ['htmlToParagraphs']);
const { Trie } = require(path.join(gameRoot, 'src', 'trie.js'));
const { buildGrid, pickDims } = require(path.join(gameRoot, 'src', 'grid.js'));
const { findWordPath } = require(path.join(gameRoot, 'src', 'solver.js'));
const frequency = read(process.env.SEARCHLE_FREQUENCY_PATH);
const dictionary = read(path.join(gameRoot, 'data', 'dictionary.json'));
const trie = new Trie();
for (const words of Object.values(dictionary)) if (Array.isArray(words)) for (const word of words) trie.insert(word);
assert(trie.wordCount > 100000, 'Canonical dictionary is missing');

function entryFor(title, metadata = {}) {
  const entry = { status: 'exists', title, titleWords: title.split(/\s+/).filter(Boolean), ...metadata };
  entry.titleWordNorms = checks.titleWordNorms(entry, title);
  return entry;
}
function playableTitle(entry) {
  if (!checks.articlePassesPickerFilter(entry)) return null;
  const words = checks.titleWordNorms(entry, entry.title).filter(w => w.length >= 4 && w.length <= 9);
  if (words.length < 2 || words.reduce((sum, w) => sum + w.length, 0) > 45) return null;
  if (words.some(w => checks.isKnownUnrankable(w) || !validTargets.has(w))) return null;
  return words;
}

const cacheFile = path.join(out, 'validation-cache.json');
const cache = fs.existsSync(cacheFile) ? read(cacheFile) : {};
const UA = 'WordTycoon-ContentExpansion/1.0 (jorry@wordtycoon.live)';
async function requestJson(url) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt++) {
    await pause(delay * (attempt + 1));
    try {
      const response = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(25000) });
      if (!response.ok) {
        if (response.status === 429 || response.status >= 500) {
          const retryAfter = response.headers.get('retry-after');
          const seconds = Number(retryAfter) || Math.max(10, (Date.parse(retryAfter) - Date.now()) / 1000) || 10;
          const backoff = Math.min(60000, Math.max(10000, seconds * 1000, 10000 * (attempt + 1)));
          console.log(`Wikipedia HTTP ${response.status}; backing off ${backoff / 1000}s`);
          await pause(backoff);
        }
        throw new Error(`HTTP ${response.status}`);
      }
      const json = await response.json();
      if (json.error) throw new Error(json.error.info || json.error.code);
      return json;
    } catch (error) { lastError = error; }
  }
  throw lastError;
}
async function metadataBatch(titles) {
  const params = new URLSearchParams({ action: 'query', prop: 'pageprops|info|categories|description|revisions', titles: titles.join('|'), redirects: '1', ppprop: 'disambiguation|wikibase-shortdesc', cllimit: 'max', clshow: '!hidden', rvprop: 'ids', format: 'json', formatversion: '2' });
  const json = await requestJson(`https://en.wikipedia.org/w/api.php?${params}`);
  // Batches are small enough to fit cllimit=max; fail rather than quietly omit
  // category metadata if Wikipedia nevertheless returns a continuation.
  if (json.continue) throw new Error('Metadata category continuation must be fetched before validation');
  for (const page of json.query?.pages || []) {
    cache[page.title] ||= {};
    cache[page.title].metadata = page;
  }
  const aliases = new Map([...(json.query?.normalized || []), ...(json.query?.redirects || [])].map(item => [item.from, item.to]));
  for (const requested of titles) {
    let canonical = requested;
    for (let hops = 0; hops < 10 && aliases.has(canonical); hops++) canonical = aliases.get(canonical);
    if (cache[canonical]?.metadata) { cache[requested] ||= {}; cache[requested].metadata = cache[canonical].metadata; }
  }
  writeAtomic(cacheFile, JSON.stringify(cache));
}
async function viewsFor(title) {
  const item = cache[title] ||= {};
  if (item.views12mo === undefined || item.viewsStart !== viewsStart || item.viewsEnd !== viewsEnd) {
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(title.replace(/ /g, '_'))}/monthly/${viewsStart}/${viewsEnd}`;
    const json = await requestJson(url);
    item.views12mo = (json.items || []).reduce((sum, point) => sum + point.views, 0);
    item.viewsStart = viewsStart; item.viewsEnd = viewsEnd;
    writeAtomic(cacheFile, JSON.stringify(cache));
  }
  return item.views12mo;
}
async function bodyFor(title) {
  const item = cache[title] ||= {};
  if (!item.body) {
    const params = new URLSearchParams({ action: 'parse', page: title, prop: 'text|revid', redirects: '1', format: 'json', formatversion: '2' });
    const json = await requestJson(`https://en.wikipedia.org/w/api.php?${params}`);
    const html = json.parse?.text;
    if (typeof html !== 'string') throw new Error('Missing parsed article body');
    item.body = { title: json.parse.title, revisionId: json.parse.revid, plaintext: htmlToParagraphs(html), fullPlaintext: htmlToParagraphs(html, { maxBlocks: 10000, maxChars: 1000000 }) };
    const rawDir = path.join(out, 'raw-html');
    fs.mkdirSync(rawDir, { recursive: true });
    item.body.rawHtmlFile = path.join(rawDir, `${sha(title).slice(0, 16)}.html`);
    writeAtomic(item.body.rawHtmlFile, html);
    writeAtomic(cacheFile, JSON.stringify(cache));
  }
  return item.body;
}
function verifyGrid(words) {
  const dims = pickDims(words.reduce((sum, word) => sum + word.length, 0));
  const scorer = new Trie();
  for (const word of words) scorer.insert(word);
  const grid = buildGrid(words, trie, { ...dims, minWordLength: 3, scoringTrie: scorer, refineAttempts: 0 });
  const targetPaths = {};
  for (const word of words) {
    const cells = findWordPath(grid.grid, grid.rows, grid.cols, word);
    assert(cells && cells.length === word.length, `Unreachable target ${word}`);
    assert.equal(new Set(cells).size, cells.length, `Reused cell for ${word}`);
    targetPaths[word] = cells;
  }
  return { rows: grid.rows, cols: grid.cols, wordCount: grid.allWords.size, grid: grid.grid, targetPaths };
}

(async () => {
  const prefiltered = [...new Set(candidates)].filter(title => !existingTitles.has(title.toLowerCase())).map(title => entryFor(title)).filter(entry => playableTitle(entry));
  // Favor familiar vocabulary, then longer topic phrases (which expose more
  // discoverable title chips); candidates still undergo full metadata checks.
  const familiarity = entry => entry.titleWordNorms.reduce((sum, word) => sum + (frequency[word] || 0), 0) / entry.titleWordNorms.length;
  prefiltered.sort((a, b) => familiarity(b) - familiarity(a) || a.title.localeCompare(b.title));
  console.log(`Candidates=${candidates.length}; new titles passing metadata-independent rules=${prefiltered.length}`);
  // Larger developed concept articles are a better popularity proxy than
  // title-word frequency. Fetch only info here; all acceptance checks below
  // still use canonical description/categories, annual views, and clean prose.
  const missingInfo = prefiltered.filter(entry => !cache[entry.title]?.info && !cache[entry.title]?.metadata);
  for (let index = 0; index < missingInfo.length; index += 50) {
    const titles = missingInfo.slice(index, index + 50).map(entry => entry.title);
    const params = new URLSearchParams({ action: 'query', prop: 'info', titles: titles.join('|'), format: 'json', formatversion: '2' });
    const json = await requestJson(`https://en.wikipedia.org/w/api.php?${params}`);
    for (const page of json.query?.pages || []) { cache[page.title] ||= {}; cache[page.title].info = page; }
    writeAtomic(cacheFile, JSON.stringify(cache));
    if (index % 250 === 0) console.log(`Article-size priority: ${Math.min(index + 50, missingInfo.length)}/${missingInfo.length}`);
  }
  const articleSize = entry => (cache[entry.title]?.metadata || cache[entry.title]?.info)?.length || 0;
  prefiltered.sort((a, b) => Number(priorityTitles.has(b.title)) - Number(priorityTitles.has(a.title)) || articleSize(b) - articleSize(a) || familiarity(b) - familiarity(a) || a.title.localeCompare(b.title));
  save('prefiltered-candidates.json', prefiltered.map(e => ({ title: e.title, familiarity: familiarity(e) })));
  const accepted = fs.existsSync(path.join(out, 'accepted-articles.json')) ? read(path.join(out, 'accepted-articles.json')) : [];
  for (const item of accepted) {
    assert(!existingTitles.has(item.entry.title.toLowerCase()), `Resume entry already in input: ${item.entry.title}`);
    coverage.pages[item.entry.title] = item.entry;
    existingTitles.add(item.entry.title.toLowerCase());
    if (!item.checks.publicGrid.targetPaths) item.checks.publicGrid = verifyGrid(item.checks.titleWords);
    if (!item.checks.soloGrid.targetPaths) item.checks.soloGrid = verifyGrid([...new Set([...item.checks.titleWords, ...item.checks.bodyTargets.map(t => t.word)])]);
    assertContentProof(item.checks, minViews);
  }
  const rejected = [];
  for (let index = 0; index < prefiltered.length && accepted.length < limit; index++) {
    const title = prefiltered[index].title;
    if (existingTitles.has(title.toLowerCase())) continue;
    try {
      if (!cache[title]?.metadata) {
        const pending = prefiltered.slice(index, index + 12).map(e => e.title).filter(t => !cache[t]?.metadata);
        await metadataBatch(pending);
      }
      const page = cache[title]?.metadata;
      if (!page || page.missing || page.pageprops?.disambiguation !== undefined) throw new Error('Missing or disambiguation page');
      if (existingTitles.has(page.title.toLowerCase())) throw new Error('Existing canonical article');
      const entry = entryFor(page.title, { length: page.length, shortdesc: page.pageprops?.['wikibase-shortdesc'] || page.description || '', categories: (page.categories || []).map(c => c.title.replace(/^Category:/, '').replace(/ /g, '_')), source: 'validated-concept-expansion-2026-10-06', wikipediaPageId: page.pageid, wikipediaRevisionId: page.revisions?.[0]?.revid });
      const titleWords = playableTitle(entry);
      if (!titleWords) throw new Error('Runtime metadata/title filters');
      const views = await viewsFor(page.title);
      if (views < minViews) throw new Error(`Popularity below ${minViews} annual views (${views})`);
      const body = await bodyFor(page.title);
      if (body.title !== page.title) throw new Error('Resolved title changed during article fetch');
      if (body.plaintext.length < 400) throw new Error(`Cleaned body too short (${body.plaintext.length})`);
      const targets = checks.extractTargets(body.plaintext, trie, { count: 5, excludeNorms: new Set(titleWords) });
      if (!targets.some(t => validTargets.has(t.word))) throw new Error('No rankable solo target');
      const publicGrid = verifyGrid(titleWords);
      const soloGrid = verifyGrid([...new Set([...titleWords, ...targets.map(t => t.word)])]);
      entry.views12mo = views;
      coverage.pages[entry.title] = entry;
      existingTitles.add(entry.title.toLowerCase());
      accepted.push({ entry, checks: { titleWords, rankableTitleWords: titleWords.length, cleanedBodyChars: body.plaintext.length, cleanedBodySha256: sha(body.plaintext), views12mo: views, viewsStart, viewsEnd, minViews, publicGrid, soloGrid, bodyTargets: targets, sourceUrl: `https://en.wikipedia.org/wiki/${encodeURIComponent(entry.title.replace(/ /g, '_'))}`, revisionId: body.revisionId } });
      assertContentProof(accepted[accepted.length - 1].checks, minViews);
      save('accepted-articles.json', accepted);
      console.log(`Accepted ${accepted.length}/${limit}: ${entry.title} (${views} annual views; ${titleWords.join(', ')})`);
    } catch (error) {
      rejected.push({ title, reason: error.message });
      if (index % 20 === 0) console.log(`Checked ${index + 1}/${prefiltered.length}; accepted=${accepted.length}; ${title}: ${error.message}`);
    }
  }
  const addedCount = accepted.length;
  assert(addedCount > 0, 'No valid additions');
  assertBaselinePreserved(originalPages, coverage.pages, accepted);
  coverage.stats = { ...coverage.stats, totalPages: Object.keys(coverage.pages).length, conceptExpansionMergedAt: new Date().toISOString(), conceptExpansionAdded: addedCount, conceptExpansionMinAnnualViews: minViews };
  save('wikipedia-coverage.json', coverage);
  save('rejected-articles.json', rejected);
  const summary = { baselineSha256: sha(baselineBytes), baselinePages: Object.keys(originalPages).length, outputPages: Object.keys(coverage.pages).length, addedCount, unchangedExistingPages: Object.keys(originalPages).length, candidateCount: candidates.length, prefilteredCount: prefiltered.length, rejectedCount: rejected.length, sourceSha256: { article: sha(fs.readFileSync(articleFile)), wikipedia: sha(fs.readFileSync(wikiFile)), grid: sha(fs.readFileSync(path.join(gameRoot, 'src', 'grid.js'))) }, membershipSource: membership.source, viewsStart, viewsEnd, minViews };
  save('summary.json', summary);
  console.log(JSON.stringify(summary));
})().catch(error => { console.error(error); process.exitCode = 1; });
