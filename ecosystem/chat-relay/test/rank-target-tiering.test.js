const assert = require('node:assert/strict');
const test = require('node:test');

const tiering = require('../src/rank-target-tiering');

test('classifies All Them Witches against witches, not all', () => {
  const entry = {
    title: 'All Them Witches',
    titleWordNorms: ['all', 'them', 'witches'],
    shortdesc: 'American rock band from Nashville',
  };

  assert.deepEqual(tiering.classifyTitleWords(entry), {
    findable: ['witches'],
    skipped: [],
  });
  assert.equal(tiering.rankTargetTier('All', true, true), null);
  assert.equal(tiering.rankTargetTier('Them', false, true), null);
  assert.equal(tiering.rankTargetTier('Witches', false, true), 1);
});

test('looks up common plural endings in WordNet and frequency data', () => {
  const { _singularCandidates, _wnLookup, _zipf } = tiering._internal;

  assert.deepEqual(_singularCandidates('witches'), ['witch', 'witche']);
  assert.deepEqual(_singularCandidates('bodies'), ['body', 'bodi', 'bodie']);
  assert.deepEqual(_singularCandidates('indictments'), ['indictment']);

  assert.ok(_wnLookup('witches'), 'witches should fall back to witch');
  assert.ok(_wnLookup('bodies'), 'bodies should fall back to body');
  assert.ok(_zipf('witches') >= _zipf('witch'));
});

test('keeps polysemous title words playable but deferred', () => {
  const entry = {
    title: 'The Fellowship of the Ring',
    titleWordNorms: ['fellowship', 'ring'],
  };

  assert.equal(tiering.rankTargetTier('Fellowship', false, true), 1);
  assert.equal(tiering.rankTargetTier('Ring', false, true), 3);
  assert.deepEqual(tiering.classifyTitleWords(entry), {
    findable: ['fellowship', 'ring'],
    skipped: [],
  });
  assert.deepEqual(
    tiering.orderByRankTier(['ring', 'fellowship'], ['The', 'Fellowship', 'of', 'the', 'Ring']),
    ['fellowship', 'ring']
  );
});

test('does not hide common Tier 3 words like bank and set', () => {
  assert.equal(tiering.rankTargetTier('Bank', false, true), 3);
  assert.equal(tiering.rankTargetTier('Set', false, true), 3);

  assert.deepEqual(tiering.classifyTitleWords({
    title: 'Bank card',
    titleWordNorms: ['bank', 'card'],
  }), {
    findable: ['bank', 'card'],
    skipped: [],
  });

  assert.deepEqual(tiering.classifyTitleWords({
    title: 'Set theory',
    titleWordNorms: ['set', 'theory'],
  }), {
    findable: ['set', 'theory'],
    skipped: [],
  });
});

test('still skips proper-noun-ish title words', () => {
  assert.deepEqual(tiering.classifyTitleWords({
    title: 'Battle of Hastings',
    titleWordNorms: ['battle', 'hastings'],
  }), {
    findable: ['battle'],
    skipped: ['hastings'],
  });
});
