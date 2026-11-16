'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { createRewardOutbox, createRewardTransport } = require('./reward-outbox');

function actionEventId(game, key) {
  return 'hosted-action:' + crypto.createHash('sha256').update(JSON.stringify([game, key])).digest('hex');
}
function createHostedActionRewards({ game, directory, db, baseUrl, apiSecret, request, send, now = Date.now }) {
  if (!['letterworks', 'wordfall'].includes(game)) throw Error('Unsupported hosted action game');
  const prefix = game === 'wordfall' ? 'wordfall:reward:' : 'reward:';
  directory ||= path.join(__dirname, '..', 'data', game + '-reward-outbox');
  const box = createRewardOutbox({ directory, send: send || createRewardTransport({ baseUrl, apiSecret, request }), now });
  const reconcile = new Set(); let timer = null, pumping = false;
  function answer(record) {
    const delivered = record.state === 'delivered', review = ['check', 'rejected'].includes(record.state);
    const xpAwarded = delivered ? (record.result.coinsAwarded ?? record.payload.xp) : 0;
    return { status: delivered ? 'awarded' : review ? 'check' : 'pending', xp: record.payload.xp,
      xpAwarded, newBalance: delivered ? (record.result.newXpBalance ?? record.result.newBalance ?? null) : null,
      rewardEventId: record.payload.eventId, rewardPending: record.state === 'pending', rewardNeedsReview: review,
      message: delivered ? '+' + xpAwarded + ' XP added to Word Tycoon.' : review
        ? 'Your saved reward needs checking. Contact support if it does not arrive.'
        : 'Your result is saved. The XP reward will retry automatically.' };
  }
  function synchronize(record) {
    const key = record.completion?.key;
    if (record.payload.game !== game || typeof key !== 'string' || !key.startsWith(prefix)
      || record.payload.eventId !== actionEventId(game, key)) throw Error('Invalid hosted action record');
    const value = answer(record);
    if (JSON.stringify(db.getLetterworksValue(key)) !== JSON.stringify(value)) {
      db.setLetterworksValue(key, value); db.saveImmediate();
    }
    return value;
  }
  function prepare({ key, player, xp, event, period }) {
    if (typeof key !== 'string' || !key.startsWith(prefix)) throw Error('Invalid reward key');
    if (!player?.userId || !player.platform || ['bot', 'system'].includes(player.platform)
      || /^(?:web_guest_|guest[_-]|anon_|wsguest_)/i.test(String(player.userId)))
      return { skipped: true, answer: { xpAwarded: 0, message: 'Guest play has no account reward.' } };
    const eventId = actionEventId(game, key), old = box.read(eventId);
    if (old) { synchronize(old); return { eventId, fresh: false }; }
    // A legacy pending/check/awarded row is ambiguous without a durable ID.
    const legacy = db.getLetterworksValue(key);
    if (legacy) return { skipped: true, answer: { xpAwarded: 0,
      rewardNeedsReview: legacy.status !== 'awarded', message: legacy.status === 'awarded'
        ? 'This reward was already collected.' : 'Your saved reward needs checking.' } };
    if (!Number.isSafeInteger(xp) || xp <= 0 || !['word', 'win', 'mp-win', 'daily-win'].includes(event)) throw Error('Invalid reward request');
    if (event === 'daily-win' && !/^\d{4}-\d{2}-\d{2}$/.test(period || '')) throw Error('Original daily period required');
    const payload = JSON.parse(JSON.stringify({ platform: player.platform, userId: String(player.userId),
      username: player.username || String(player.userId), displayName: player.displayName, avatar: player.avatar,
      game, xp, event, eventId, ...(period ? { rewardPeriod: period } : {}) }));
    const record = box.reserve(payload, { key, game });
    reconcile.add(eventId); synchronize(record);
    return { eventId, fresh: true };
  }
  async function deliver(claim) {
    if (claim.skipped) return claim.answer;
    const record = await box.deliver(claim.eventId), value = synchronize(record);
    if (record.state !== 'pending') reconcile.delete(claim.eventId);
    return { ...value, xpAwarded: claim.fresh ? value.xpAwarded : 0, rewardAlreadyCollected: !claim.fresh };
  }
  function refresh(value) {
    const record = value?.rewardEventId && box.read(value.rewardEventId);
    if (!record) return value;
    const refreshed = synchronize(record);
    return { ...refreshed, xpAwarded: value.rewardAlreadyCollected ? 0 : refreshed.xpAwarded,
      rewardAlreadyCollected: !!value.rewardAlreadyCollected };
  }
  async function pump() {
    if (pumping) return; pumping = true;
    try {
      await box.pump();
      for (const id of reconcile) {
        const record = box.read(id); synchronize(record);
        if (record.state !== 'pending') reconcile.delete(id);
      }
    } finally { pumping = false; }
  }
  function start() {
    if (timer) return;
    // The host starts this only after its sql.js database is initialized.
    if (fs.existsSync(directory)) for (const name of fs.readdirSync(directory)) {
      if (!/^[a-f0-9]{64}\.json$/.test(name)) continue;
      const record = JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8'));
      reconcile.add(record.payload.eventId); synchronize(record);
      if (record.state !== 'pending') reconcile.delete(record.payload.eventId);
    }
    timer = setInterval(() => pump().catch(error => console.error('[HostedActions]', game, error.message)), 5000); timer.unref?.();
    console.log('[HostedActions] Durable delivery enabled:', game);
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  return { prepare, deliver, refresh, start, stop, pump, read: box.read, summary: box.summary };
}
module.exports = { createHostedActionRewards, actionEventId };
