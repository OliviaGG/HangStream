/**
 * Quick test of the word-bank frequency functions.
 */
const wb = require('../src/word-bank');

console.log('=== Stats ===');
const stats = wb.getStats();
console.log('Total targets:', stats.totalTargets);
console.log('Total dictionary:', stats.totalDictionary);

console.log('\n=== Frequency Functions ===');
const commonSet = wb.getCommonSet();
console.log('Common set size:', commonSet.size);
console.log('Is Set:', commonSet instanceof Set);

console.log('\n=== isCommonWord tests ===');
const testWords = ['teeth', 'then', 'phone', 'cent', 'heck', 'niche', 'teen', 'tektite', 'qoph', 'the', 'that', 'this'];
for (const w of testWords) {
  const zipf = wb.getFrequency(w);
  console.log(`  ${w}: isCommon=${wb.isCommonWord(w)}, isTarget=${wb.isValidTarget(w)}, zipf=${zipf}`);
}

console.log('\n=== Before/After comparison for Spelling Bee Kitchen puzzle ===');
const problemWords = ['cent', 'etch', 'heck', 'intent', 'niche', 'niece', 'teen', 'teeth', 'then', 'tine', 'techie', 'thicken'];
console.log('Word          | Old (target) | New (frequency)');
console.log('------------- | ------------ | ---------------');
for (const w of problemWords) {
  const oldCommon = wb.isValidTarget(w) ? 'common' : 'RARE';
  const newCommon = wb.isCommonWord(w) ? 'common' : 'RARE';
  const changed = oldCommon !== newCommon ? ' <-- FIXED' : '';
  console.log(`${w.padEnd(14)}| ${oldCommon.padEnd(13)}| ${newCommon}${changed}`);
}
