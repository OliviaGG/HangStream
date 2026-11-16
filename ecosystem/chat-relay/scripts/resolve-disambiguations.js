// Phase 1 — disambig-recovery resolver for WikiWord.
// For each Searchle target that landed on a Wikipedia disambiguation page,
// fetch the disambig content, find the primary-topic article (first list
// item's first article link), verify it exists, and record the resolution.
//
// Output: updates C:/Chat Relay/data/wikipedia-coverage.json in place so
// that disambig entries gain { resolved: "Article Title", resolvedLength: N }
// and their status flips to "exists".

const fs = require('fs');
const https = require('https');

const COVERAGE_PATH = 'C:/Chat Relay/data/wikipedia-coverage.json';
const API = 'https://en.wikipedia.org/w/api.php';
const UA = 'ChatRelay-WikiWord/1.0 (jorry@wordtycoon.live)';

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': UA } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// Strip hatnote / infobox blocks that prefix actual list content.
// Then find the first <ul><li> in the parsed HTML and grab the first
// article link (href starting with /wiki/ and NOT /wiki/File: /wiki/Help: etc).
function extractPrimaryLink(html) {
  if (!html) return null;

  // Cheap HTML parse — we just need the first sensible /wiki/ link inside a <li>.
  // Skip links inside <div class="hatnote..."> and <table class="infobox...">.
  // Strip those blocks entirely, then run a regex against what remains.
  let cleaned = html
    .replace(/<div[^>]*class="[^"]*hatnote[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<table[^>]*class="[^"]*infobox[^"]*"[^>]*>[\s\S]*?<\/table>/gi, '')
    .replace(/<div[^>]*role="note"[^>]*>[\s\S]*?<\/div>/gi, '');

  // Find the first <li> ... </li> that contains a wiki link.
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(cleaned)) !== null) {
    const li = m[1];
    // First <a href="/wiki/..."> inside this <li> that is a real article link.
    const aRe = /<a\s+href="\/wiki\/([^"#?]+)"/i;
    const am = aRe.exec(li);
    if (!am) continue;
    const href = decodeURIComponent(am[1]);
    if (/^(File|Help|Wikipedia|Category|Special|Portal|Template|Talk):/i.test(href)) continue;
    if (/_\(disambiguation\)$/i.test(href)) continue;
    // Replace underscores with spaces for display title
    return href.replace(/_/g, ' ');
  }
  return null;
}

async function fetchDisambigHtml(title) {
  const url = `${API}?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json&redirects=1`;
  const json = await fetchJson(url);
  if (json.error) return null;
  return json.parse && json.parse.text;
}

// Verify the resolved article is real (exists, not disambig, has reasonable size).
async function verifyArticles(titles) {
  if (titles.length === 0) return {};
  const url = `${API}?action=query&prop=pageprops|info&ppprop=disambiguation&titles=${encodeURIComponent(titles.join('|'))}&redirects=1&format=json`;
  const json = await fetchJson(url);
  const q = json.query || {};
  const pages = q.pages || {};
  const redirects = new Map((q.redirects || []).map((r) => [r.from, r.to]));
  const out = {};
  const titleToPage = {};
  for (const pid in pages) {
    const p = pages[pid];
    titleToPage[p.title] = p;
  }
  for (const t of titles) {
    const finalTitle = redirects.get(t) || t;
    const page = titleToPage[finalTitle];
    if (!page || 'missing' in page) { out[t] = { ok: false, reason: 'missing' }; continue; }
    const isDisambig = page.pageprops && 'disambiguation' in page.pageprops;
    if (isDisambig) { out[t] = { ok: false, reason: 'still-disambig' }; continue; }
    out[t] = { ok: true, title: page.title, length: page.length || 0 };
  }
  return out;
}

(async () => {
  const coverage = JSON.parse(fs.readFileSync(COVERAGE_PATH, 'utf-8'));
  const pages = coverage.pages;
  const disambigEntries = Object.entries(pages).filter(([, v]) => v.status === 'disambiguation');
  console.log(`Disambig targets to resolve: ${disambigEntries.length}`);

  const resolutions = [];
  let idx = 0;
  for (const [word, entry] of disambigEntries) {
    idx++;
    const sourceTitle = entry.title || (word.charAt(0).toUpperCase() + word.slice(1));
    try {
      const html = await fetchDisambigHtml(sourceTitle);
      const primary = html ? extractPrimaryLink(html) : null;
      resolutions.push({ word, sourceTitle, primary });
      if (idx % 100 === 0) {
        const resolvedCount = resolutions.filter((r) => r.primary).length;
        console.log(`[${idx}/${disambigEntries.length}] resolved=${resolvedCount}`);
      }
    } catch (e) {
      resolutions.push({ word, sourceTitle, primary: null, error: e.message });
    }
    await new Promise((r) => setTimeout(r, 120));
  }
  const resolvedCount = resolutions.filter((r) => r.primary).length;
  console.log(`\nExtraction done. ${resolvedCount}/${disambigEntries.length} have candidate primary links.`);

  // Verify in batches of 50
  const candidates = resolutions.filter((r) => r.primary).map((r) => r.primary);
  const uniqueTitles = [...new Set(candidates)];
  console.log(`Verifying ${uniqueTitles.length} unique candidate articles...`);
  const verification = {};
  for (let i = 0; i < uniqueTitles.length; i += 50) {
    const batch = uniqueTitles.slice(i, i + 50);
    try {
      const v = await verifyArticles(batch);
      Object.assign(verification, v);
    } catch (e) {
      console.error(`Verify batch ${i} failed: ${e.message}`);
      for (const t of batch) verification[t] = { ok: false, reason: 'verify-error' };
    }
    await new Promise((r) => setTimeout(r, 150));
    if ((i / 50) % 10 === 0) console.log(`[verify ${i}/${uniqueTitles.length}]`);
  }

  // Fold results back into coverage
  const stats = { resolved: 0, unresolvable: 0, stillDisambig: 0, verifyMissing: 0 };
  for (const r of resolutions) {
    if (!r.primary) { stats.unresolvable++; continue; }
    const v = verification[r.primary];
    if (!v || !v.ok) {
      if (v && v.reason === 'still-disambig') stats.stillDisambig++;
      else stats.verifyMissing++;
      continue;
    }
    stats.resolved++;
    pages[r.word] = {
      status: 'exists',
      title: v.title,
      length: v.length,
      viaDisambig: r.sourceTitle,
    };
  }

  // Recompute top-level stats
  const newStats = { exists: 0, missing: 0, disambiguation: 0, redirected: 0 };
  let sizeSum = 0, sizeCount = 0;
  for (const w in pages) {
    const p = pages[w];
    newStats[p.status] = (newStats[p.status] || 0) + 1;
    if (p.redirected) newStats.redirected++;
    if (p.length) { sizeSum += p.length; sizeCount++; }
  }
  coverage.stats = newStats;
  coverage.avgSize = sizeCount ? Math.round(sizeSum / sizeCount) : 0;
  coverage.disambigRecovery = {
    attempted: disambigEntries.length,
    ...stats,
    runAt: new Date().toISOString(),
  };

  fs.writeFileSync(COVERAGE_PATH, JSON.stringify(coverage, null, 2));
  console.log('\n=== RECOVERY SUMMARY ===');
  console.log(stats);
  console.log('New top-level stats:', newStats);
})();
