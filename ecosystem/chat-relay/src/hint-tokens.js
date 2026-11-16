'use strict';
const crypto = require('node:crypto');
function signPreparation(body, source, monthKey, secret, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ accountId: body.discordId, game: body.game, actionId: body.actionId,
    roundKey: body.roundKey, handle: body.handle, startTime: body.startTime, source, monthKey, expires: now + 30000 })).toString('base64url');
  return payload + '.' + crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}
function verifyPreparation(token, body, secret, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 2048) return null;
  try {
    const parts = token.split('.'); if (parts.length !== 2) return null;
    const expected = crypto.createHmac('sha256', secret).update(parts[0]).digest(), actual = Buffer.from(parts[1], 'base64url');
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null;
    const value = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (!Number.isFinite(value.expires) || value.expires <= now || value.expires > now + 30000) return null;
    for (const [field, request] of [['accountId','discordId'],['game','game'],['actionId','actionId'],['roundKey','roundKey'],['handle','handle'],['startTime','startTime']]) if (value[field] !== body[request]) return null;
    return value;
  } catch (_) { return null; }
}
module.exports = { signPreparation, verifyPreparation };
