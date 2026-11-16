// One-shot: check Searchle targets against Wikipedia.
// For each word, query en.wikipedia.org API (batches of 50).
// Classify: exists / missing / disambiguation / redirect.

const fs = require('fs');
const https = require('https');

const BATCH_SIZE = 50;
const API = 'https://en.wikipedia.org/w/api.php';

const targets = require('../data/searchle-targets.json');
const all = [];
for (const len of Object.keys(targets)) for (const w of targets[len]) all.push(w);
console.log(`Total targets: ${all.length}`);

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ChatRelay-RedactleCheck/1.0 (jorry@wordtycoon.live)' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function checkBatch(words) {
  // Capitalize first letter — Wikipedia titles are case-sensitive but first letter auto-caps.
  const titles = words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('|');
  const url = `${API}?action=query&prop=pageprops|info&ppprop=disambiguation&titles=${encodeURIComponent(titles)}&redirects=1&format=json`;
  const json = await fetchJson(url);
  const q = json.query || {};
  const pages = q.pages || {};
  const redirects = new Map((q.redirects || []).map((r) => [r.from.toLowerCase(), r.to]));

  const result = {};
  // Build title → page status
  const titleToPage = {};
  for (const pid in pages) {
    const p = pages[pid];
    titleToPage[p.title.toLowerCase()] = p;
  }

  for (const w of words) {
    const cap = w.charAt(0).toUpperCase() + w.slice(1);
    let finalTitle = redirects.get(cap.toLowerCase()) || cap;
    const page = titleToPage[finalTitle.toLowerCase()] || titleToPage[cap.toLowerCase()];
    if (!page) { result[w] = { status: 'missing' }; continue; }
    if ('missing' in page) { result[w] = { status: 'missing' }; continue; }
    const isDisambig = page.pageprops && 'disambiguation' in page.pageprops;
    const wasRedirect = redirects.has(cap.toLowerCase());
    result[w] = {
      status: isDisambig ? 'disambiguation' : 'exists',
      title: page.title,
      redirected: wasRedirect,
      length: page.length || 0,
    };
  }
  return result;
}

(async () => {
  const out = {};
  const stats = { exists: 0, missing: 0, disambiguation: 0, redirected: 0 };
  let sizeSum = 0, sizeCount = 0;
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const batch = all.slice(i, i + BATCH_SIZE);
    try {
      const res = await checkBatch(batch);
      for (const w in res) {
        out[w] = res[w];
        stats[res[w].status]++;
        if (res[w].redirected) stats.redirected++;
        if (res[w].length) { sizeSum += res[w].length; sizeCount++; }
      }
    } catch (e) {
      console.error(`Batch ${i} failed:`, e.message);
      for (const w of batch) out[w] = { status: 'error' };
    }
    if ((i / BATCH_SIZE) % 10 === 0) {
      console.log(`[${i}/${all.length}] exists=${stats.exists} missing=${stats.missing} disambig=${stats.disambiguation}`);
    }
    await new Promise((r) => setTimeout(r, 150)); // be polite
  }
  const avgSize = sizeCount ? Math.round(sizeSum / sizeCount) : 0;
  console.log('\n=== FINAL ===');
  console.log(stats);
  console.log(`Avg article size (bytes): ${avgSize}`);
  fs.writeFileSync('C:/Chat Relay/data/wikipedia-coverage.json', JSON.stringify({ stats, avgSize, pages: out }, null, 2));
  console.log('Wrote C:/Chat Relay/data/wikipedia-coverage.json');
})();
