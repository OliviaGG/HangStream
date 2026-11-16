const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8899;
const OUT_DIR = path.join(__dirname, '..', 'public', 'portal', 'img');

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method === 'POST' && req.url.startsWith('/save/')) {
    const filename = req.url.replace('/save/', '');
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        // body is base64 data URL
        const base64 = body.replace(/^data:image\/png;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        const filepath = path.join(OUT_DIR, filename);
        fs.writeFileSync(filepath, buffer);
        console.log(`Saved: ${filename} (${buffer.length} bytes)`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, file: filepath, size: buffer.length }));
      } catch (e) {
        console.error(`Error saving ${filename}:`, e.message);
        res.writeHead(500);
        res.end(JSON.stringify({ error: e.message }));
      }
    });
    return;
  }

  res.writeHead(404);
  res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`Icon save server running on http://localhost:${PORT}`);
  console.log(`Saving to: ${OUT_DIR}`);
});
