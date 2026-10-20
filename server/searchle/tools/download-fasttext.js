const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const FASTTEXT_URL = 'https://dl.fbaipublicfiles.com/fasttext/vectors-english/wiki-news-300d-1M.vec.zip';
const DATA_DIR = path.join(__dirname, '..', 'data');
const FASTTEXT_DIR = path.join(DATA_DIR, 'fasttext');
const TARGET_FILE = path.join(FASTTEXT_DIR, 'wiki-news-300d-1M.vec');
const ZIP_PATH = path.join(DATA_DIR, 'fasttext-wiki-news.zip');

if (fs.existsSync(TARGET_FILE)) {
  const stats = fs.statSync(TARGET_FILE);
  console.log(`wiki-news-300d-1M.vec already exists (${(stats.size / 1024 / 1024).toFixed(1)} MB)`);
  process.exit(0);
}

fs.mkdirSync(FASTTEXT_DIR, { recursive: true });

function download(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading FastText vectors from:\n  ${url}`);
    console.log(`This is ~600 MB and may take several minutes...\n`);

    const file = fs.createWriteStream(dest);

    function followRedirect(url) {
      const mod = url.startsWith('https') ? https : require('http');
      mod.get(url, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          followRedirect(res.headers.location);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`Download failed with status ${res.statusCode}`));
          return;
        }

        const totalBytes = parseInt(res.headers['content-length'], 10) || 0;
        let downloaded = 0;
        let lastPercent = -1;

        res.on('data', (chunk) => {
          downloaded += chunk.length;
          if (totalBytes > 0) {
            const percent = Math.floor((downloaded / totalBytes) * 100);
            if (percent !== lastPercent) {
              lastPercent = percent;
              const mb = (downloaded / 1024 / 1024).toFixed(1);
              const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
              process.stdout.write(`\r  Progress: ${mb} MB / ${totalMb} MB (${percent}%)`);
            }
          } else {
            const mb = (downloaded / 1024 / 1024).toFixed(1);
            process.stdout.write(`\r  Downloaded: ${mb} MB`);
          }
        });

        res.pipe(file);
        file.on('finish', () => {
          file.close();
          console.log('\n  Download complete.');
          resolve();
        });
      }).on('error', (err) => {
        if (fs.existsSync(dest)) fs.unlinkSync(dest);
        reject(err);
      });
    }

    followRedirect(url);
  });
}

async function main() {
  try {
    await download(FASTTEXT_URL, ZIP_PATH);

    console.log('\nExtracting wiki-news-300d-1M.vec...');
    const extractDir = path.join(DATA_DIR, 'fasttext_extract');
    fs.mkdirSync(extractDir, { recursive: true });

    const isWindows = process.platform === 'win32';
    if (isWindows) {
      execSync(`powershell -command "Expand-Archive -Path '${ZIP_PATH}' -DestinationPath '${extractDir}' -Force"`, { stdio: 'inherit', timeout: 600000 });
    } else {
      execSync(`unzip -o '${ZIP_PATH}' -d '${extractDir}'`, { stdio: 'inherit', timeout: 600000 });
    }

    const extractedFile = path.join(extractDir, 'wiki-news-300d-1M.vec');
    if (!fs.existsSync(extractedFile)) {
      throw new Error('wiki-news-300d-1M.vec not found in extracted archive');
    }

    fs.renameSync(extractedFile, TARGET_FILE);
    console.log(`  Moved to ${TARGET_FILE}`);

    // Clean up
    fs.rmSync(extractDir, { recursive: true, force: true });
    fs.unlinkSync(ZIP_PATH);
    console.log('  Cleaned up temporary files.');

    const stats = fs.statSync(TARGET_FILE);
    console.log(`\nDone! wiki-news-300d-1M.vec is ${(stats.size / 1024 / 1024).toFixed(1)} MB`);
  } catch (err) {
    console.error('\nError:', err.message);
    if (fs.existsSync(ZIP_PATH)) fs.unlinkSync(ZIP_PATH);
    process.exit(1);
  }
}

main();
