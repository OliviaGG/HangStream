const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { assertOutputSafety, assertBaselinePreserved, assertContentProof } = require('./import-wikipedia-expansion');

test('local output cannot overwrite the canonical baseline or source tree', () => {
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'wikipedia-expansion-safety-'));
  try {
    const baseline = path.join(fixture, 'wikipedia-coverage.json');
    const source = path.join(fixture, 'source');
    fs.writeFileSync(baseline, '{}'); fs.mkdirSync(source);
    assert.throws(() => assertOutputSafety(fixture, [baseline]), /overwrite/);
    assert.throws(() => assertOutputSafety(path.join(source, 'data'), [source]), /overwrite/);
    assert.doesNotThrow(() => assertOutputSafety(path.join(fixture, 'prepared'), [baseline, source]));
    assert.equal(fs.readFileSync(baseline, 'utf8'), '{}');
  } finally {
    const target = path.resolve(fixture);
    assert(target.startsWith(path.join(path.resolve(os.tmpdir()), 'wikipedia-expansion-safety-')));
    fs.rmSync(target, { recursive: true, force: true });
  }
});

test('additive merge preserves prior metadata and rejects duplicate canonical titles', () => {
  const baseline = { alias: { title: 'Old article', categories: ['Preserve_me'], custom: 12 } };
  const additions = [{ entry: { title: 'New article' } }];
  const output = { ...structuredClone(baseline), 'New article': additions[0].entry };
  assert.doesNotThrow(() => assertBaselinePreserved(baseline, output, additions));
  output.alias.categories = [];
  assert.throws(() => assertBaselinePreserved(baseline, output, additions), /Changed existing/);
  assert.throws(() => assertBaselinePreserved(baseline, { ...baseline, 'OLD ARTICLE': { title: 'OLD ARTICLE' } }, [{ entry: { title: 'OLD ARTICLE' } }]), /Duplicate canonical/);
});

function proof() {
  const grid = [['f', 'o', 'o', 'd', 'x', 'x', 'x', 'x', 'x'], ['e', 'n', 'e', 'r', 'g', 'y', 'x', 'x', 'x']];
  const board = { rows: 2, cols: 9, grid, targetPaths: { food: [0, 1, 2, 3], energy: [9, 10, 11, 12, 13, 14] } };
  return { titleWords: ['food', 'energy'], cleanedBodyChars: 1200, views12mo: 75000, publicGrid: structuredClone(board), soloGrid: structuredClone(board), bodyTargets: [] };
}

test('article evidence rejects short bodies, unpopular pages and invalid title words', () => {
  assert.doesNotThrow(() => assertContentProof(proof()));
  const short = proof(); short.cleanedBodyChars = 399;
  assert.throws(() => assertContentProof(short), /body too short/);
  const obscure = proof(); obscure.views12mo = 49999;
  assert.throws(() => assertContentProof(obscure), /popularity threshold/);
  const title = proof(); title.titleWords = ['food'];
  assert.throws(() => assertContentProof(title), /Unplayable title/);
});

test('grid evidence rejects cell reuse, wrong spelling, and broken adjacency', () => {
  const reused = proof(); reused.publicGrid.targetPaths.food = [0, 1, 1, 3];
  assert.throws(() => assertContentProof(reused), /Reused cell/);
  const wrong = proof(); wrong.publicGrid.grid[0][0] = 'z';
  assert.throws(() => assertContentProof(wrong), /Wrong grid spelling/);
  const disconnected = proof(); disconnected.publicGrid.targetPaths.food = [0, 1, 14, 3];
  assert.throws(() => assertContentProof(disconnected), /Disconnected path/);
});
