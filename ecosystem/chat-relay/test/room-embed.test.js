const test = require('node:test');
const assert = require('node:assert/strict');

const { getVirtualWidth } = require('../src/room-embed');

test('virtual-canvas room games declare their design widths', () => {
  assert.equal(getVirtualWidth('searchle'), 980);
  assert.equal(getVirtualWidth('searchle-grid'), 980);
  assert.equal(getVirtualWidth('searchle-numbers'), 980);
  assert.equal(getVirtualWidth('wikisearchle'), 720);
  assert.equal(getVirtualWidth('WikiRectangled'), 640);
  assert.equal(getVirtualWidth('wikiword'), 640);
  assert.equal(getVirtualWidth('wikiword-4x4'), 480);
});

test('responsive room games do not receive a virtual width', () => {
  assert.equal(getVirtualWidth('word500'), null);
  assert.equal(getVirtualWidth(''), null);
});
