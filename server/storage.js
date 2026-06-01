const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = process.env.DATA_DIR || __dirname;

function dataPath(fileName) {
  return path.join(dataDir, fileName);
}

function ensureDataDir() {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch {
    // Ignore directory creation failures and fall back to read/write errors.
  }
}

const tokenStorePath = dataPath('oauth-tokens.json');
const musicQueuePath = dataPath('music-queue.json');
const viewerProfilesPath = dataPath('viewer-profiles.json');
const viewerScoresPath = dataPath('viewer-scores.json');

ensureDataDir();

function loadTokens() {
  try {
    const raw = fs.readFileSync(tokenStorePath, 'utf8');
    try {
      return JSON.parse(raw || '{}');
    } catch (e) {
      const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY || '';
      if (!encryptionKey) return {};
      try {
        const blob = JSON.parse(raw);
        if (blob && blob.v === 1 && blob.data) {
          const b = Buffer.from(blob.data, 'base64');
          const iv = b.slice(0, 12);
          const tag = b.slice(12, 28);
          const ct = b.slice(28);
          const key = crypto.scryptSync(encryptionKey, 'salt', 32);
          const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
          decipher.setAuthTag(tag);
          const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
          return JSON.parse(dec.toString('utf8'));
        }
      } catch (err) {
        return {};
      }
    }
  } catch {
    return {};
  }
}

function saveTokens(tokens) {
  try {
    const encryptionKey = process.env.TOKEN_ENCRYPTION_KEY || '';
    if (!encryptionKey) {
      fs.writeFileSync(tokenStorePath, JSON.stringify(tokens, null, 2), 'utf8');
      return;
    }
    const key = crypto.scryptSync(encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const pt = Buffer.from(JSON.stringify(tokens), 'utf8');
    const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
    const tag = cipher.getAuthTag();
    const out = Buffer.concat([iv, tag, ct]).toString('base64');
    fs.writeFileSync(tokenStorePath, JSON.stringify({ v: 1, data: out }), 'utf8');
  } catch (err) {
    console.warn('Failed to save tokens', err);
  }
}

function loadMusicQueue() {
  try {
    const raw = fs.readFileSync(musicQueuePath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch {
    return {};
  }
}

function saveMusicQueue(queue) {
  try {
    fs.writeFileSync(musicQueuePath, JSON.stringify(queue, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save music queue', err);
  }
}

function loadViewerProfiles() {
  try {
    const raw = fs.readFileSync(viewerProfilesPath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (err) {
    return {};
  }
}

function saveViewerProfiles(profiles) {
  try {
    fs.writeFileSync(viewerProfilesPath, JSON.stringify(profiles || {}, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save viewer profiles', err);
  }
}

function loadViewerScores() {
  try {
    const raw = fs.readFileSync(viewerScoresPath, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (err) {
    return {};
  }
}

function saveViewerScores(scores) {
  try {
    fs.writeFileSync(viewerScoresPath, JSON.stringify(scores || {}, null, 2), 'utf8');
  } catch (err) {
    console.warn('Failed to save viewer scores', err);
  }
}

module.exports = {
  loadTokens,
  saveTokens,
  loadMusicQueue,
  saveMusicQueue,
  loadViewerProfiles,
  saveViewerProfiles,
  loadViewerScores,
  saveViewerScores,
};