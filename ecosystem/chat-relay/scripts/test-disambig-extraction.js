// Quick sanity check — does extractPrimaryLink produce sensible results?
const https = require('https');

const samples = ['Cat', 'Bar', 'Block', 'Paint', 'Fan', 'Bow', 'Lab', 'Log', 'Pop', 'Jet'];

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'ChatRelay-WikiWord/1.0 (test)' } }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => { try { resolve(JSON.parse(data)); } catch (e) { reject(e); } });
    }).on('error', reject);
  });
}

function extractPrimaryLink(html) {
  if (!html) return null;
  let cleaned = html
    .replace(/<div[^>]*class="[^"]*hatnote[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '')
    .replace(/<table[^>]*class="[^"]*infobox[^"]*"[^>]*>[\s\S]*?<\/table>/gi, '')
    .replace(/<div[^>]*role="note"[^>]*>[\s\S]*?<\/div>/gi, '');
  const liRe = /<li\b[^>]*>([\s\S]*?)<\/li>/gi;
  let m;
  while ((m = liRe.exec(cleaned)) !== null) {
    const li = m[1];
    const aRe = /<a\s+href="\/wiki\/([^"#?]+)"/i;
    const am = aRe.exec(li);
    if (!am) continue;
    const href = decodeURIComponent(am[1]);
    if (/^(File|Help|Wikipedia|Category|Special|Portal|Template|Talk):/i.test(href)) continue;
    if (/_\(disambiguation\)$/i.test(href)) continue;
    return href.replace(/_/g, ' ');
  }
  return null;
}

(async () => {
  for (const title of samples) {
    const url = `https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(title)}&prop=text&formatversion=2&format=json&redirects=1`;
    try {
      const json = await fetchJson(url);
      const html = json.parse && json.parse.text;
      const primary = extractPrimaryLink(html);
      console.log(`${title.padEnd(10)} → ${primary || '(no link found)'}`);
    } catch (e) {
      console.log(`${title.padEnd(10)} → ERROR: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 150));
  }
})();
