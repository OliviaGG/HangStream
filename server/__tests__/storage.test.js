const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const tempDb = path.join(__dirname, '..', '..', 'data', 'test-tokens-storage.db');
try { fs.unlinkSync(tempDb); } catch (e) {}
process.env.DB_PATH = tempDb;
process.env.TOKEN_ENCRYPTION_KEY = '12345678901234567890123456789012';

const db = require('../db');
const { loadTokens, saveTokens, loadTokensSync } = require('../storage');

test('saveTokens and loadTokens preserve OAuth payloads and metadata', async () => {
  await new Promise((resolve) => setTimeout(resolve, 100));
  const payload = {
    'spotify-123': {
      created: 1700000000000,
      platform: 'spotify',
      owner: 'caster',
      username: 'caster',
      profile: { id: 'caster', display_name: 'Caster' },
      resp: {
        access_token: 'access-token-value',
        refresh_token: 'refresh-token-value',
        expires_in: 3600,
      },
    },
  };

  saveTokens(payload);

  const saved = loadTokensSync();
  assert.ok(saved['spotify-123']);
  assert.equal(saved['spotify-123'].platform, 'spotify');
  assert.equal(saved['spotify-123'].owner, 'caster');
  assert.equal(saved['spotify-123'].resp.access_token, 'access-token-value');
  assert.equal(saved['spotify-123'].resp.refresh_token, 'refresh-token-value');
  assert.equal(saved['spotify-123'].username, 'caster');

  db.close();
});

process.on('exit', () => {
  try { db.close(); } catch (e) {}
  try { fs.unlinkSync(tempDb); } catch (e) {}
});
