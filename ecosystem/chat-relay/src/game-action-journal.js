'use strict';
const fs = require('node:fs'), path = require('node:path'), crypto = require('node:crypto');
const clone = value => JSON.parse(JSON.stringify(value));
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
// The current game state and its immutable reward intentions commit together.
// Old intentions stay here until the SDK confirms durable outbox ownership.
function createGameActionJournal({ directory, game, sdk, now = Date.now, fsImpl = fs, maxScopes = 500, maxBytes = 12 * 1024 * 1024, retentionMs = 14 * 86400000 }) {
  const records = new Map(); let blocked = false, cursor = 0, timer = null;
  function scopeKey(scope) {
    if (typeof scope !== 'string' || !scope || scope.length > 128) throw Error('Invalid game scope');
    return hash(scope);
  }
  function regular(filename, directoryEntry = false) {
    const stat = fsImpl.lstatSync(filename);
    if (stat.isSymbolicLink() || !(directoryEntry ? stat.isDirectory() : stat.isFile()) ||
        (!directoryEntry && stat.size > maxBytes) || (process.platform !== 'win32' && (stat.mode & 0o077))) throw Error('Unsafe action journal');
  }
  function payload(record, key, supplied) {
    if (typeof key !== 'string' || !key || key.length > 256 || ['__proto__', 'constructor', 'prototype'].includes(key)) throw Error('Invalid game action');
    const value = clone(supplied);
    if (value.game !== game || typeof value.platform !== 'string' || !value.platform || typeof value.userId !== 'string' ||
        !value.userId || value.userId.length > 128 || !Number.isSafeInteger(value.coins) || value.coins < 1 ||
        !(['word', 'win', 'mp-daily-win', 'mp-weekly-win'].includes(value.event) || game === 'spelling-bee' && value.event === 'pangram')) throw Error('Invalid game reward intention');
    value.eventId = 'mp-action:' + hash(JSON.stringify([game, record.scope, record.roundId, key]));
    if (['mp-daily-win', 'mp-weekly-win'].includes(value.event) && !/^\d{4}-\d{2}-\d{2}$/.test(value.rewardPeriod || '')) throw Error('Missing original reward period');
    return value;
  }
  function validate(record, filename) {
    if (record?.version !== 1 || record.game !== game || path.basename(filename) !== scopeKey(record.scope) + '.json' ||
        !/^[a-f0-9-]{36}$/.test(record.roundId || '') || !Number.isFinite(record.updatedAt) || !record.state ||
        !record.meta || !record.actions || !Array.isArray(record.retired) || record.retired.length > 20000 ||
        Object.keys(record.actions).length > 10000) throw Error('Invalid action journal');
    for (const [key, entry] of Object.entries(record.actions)) {
      if (typeof entry.queued !== 'boolean' || !Number.isFinite(entry.createdAt) || entry.createdAt > now() + 60000 || JSON.stringify(payload(record, key, entry.payload)) !== JSON.stringify(entry.payload)) throw Error('Invalid current reward intention');
    }
    const seen = new Set();
    for (const entry of record.retired) {
      if (entry.queued !== false || !Number.isFinite(entry.createdAt) || entry.createdAt > now() + 60000 || !/^[a-f0-9-]{36}$/.test(entry.roundId || '') ||
          JSON.stringify(payload({ ...record, roundId: entry.roundId }, entry.key, entry.payload)) !== JSON.stringify(entry.payload) ||
          seen.has(entry.payload.eventId)) throw Error('Invalid retired intention');
      seen.add(entry.payload.eventId);
    }
  }
  function write(record) {
    if (blocked) throw Error('Action journal requires storage recovery');
    const bytes = JSON.stringify(record); if (Buffer.byteLength(bytes) > maxBytes) throw Error('Action journal capacity reached');
    const filename = path.join(directory, scopeKey(record.scope) + '.json'), temporary = filename + '.' + crypto.randomUUID() + '.tmp';
    regular(directory, true); validate(record, filename);
    if (fsImpl.existsSync(filename)) regular(filename);
    let renamed = false, fd;
    try {
      fd = fsImpl.openSync(temporary, 'wx', 0o600); fsImpl.writeFileSync(fd, bytes); fsImpl.fsyncSync(fd); fsImpl.closeSync(fd); fd = undefined;
      fsImpl.renameSync(temporary, filename); renamed = true;
      if (process.platform !== 'win32') { const dirFd = fsImpl.openSync(directory, 'r'); try { fsImpl.fsyncSync(dirFd); } finally { fsImpl.closeSync(dirFd); } }
      records.set(record.scope, record);
    } catch (error) { if (renamed) blocked = true; throw error; }
    finally { if (fd !== undefined) fsImpl.closeSync(fd); if (fsImpl.existsSync(temporary)) fsImpl.unlinkSync(temporary); }
  }
  if (!fsImpl.existsSync(directory)) fsImpl.mkdirSync(directory, { recursive: true, mode: 0o700 });
  regular(directory, true);
  for (const filename of fsImpl.readdirSync(directory)) {
    if (!/^[a-f0-9]{64}\.json$/.test(filename)) continue;
    const full = path.join(directory, filename); regular(full); const record = JSON.parse(fsImpl.readFileSync(full, 'utf8')); validate(record, full); records.set(record.scope, record);
  }
  if (records.size > maxScopes) throw Error('Action journal scope capacity reached');
  function current(scope) { scopeKey(scope); if (blocked) throw Error('Action journal requires storage recovery'); return records.has(scope) ? clone(records.get(scope)) : null; }
  function prune() {
    if (blocked) throw Error('Action journal requires storage recovery');
    for (const [scope, record] of records) {
      if (scope === 'public' || now() - record.updatedAt < retentionMs || record.retired.length || record.meta.statisticsPending?.length || Object.values(record.actions).some(entry => !entry.queued)) continue;
      const filename = path.join(directory, scopeKey(scope) + '.json'); regular(filename);
      fsImpl.unlinkSync(filename); records.delete(scope);
      if (process.platform !== 'win32') {
        const fd = fsImpl.openSync(directory, 'r');
        try { fsImpl.fsyncSync(fd); } catch (error) { blocked = true; throw error; } finally { fsImpl.closeSync(fd); }
      }
    }
  }
  function start(scope, state, meta, completion = undefined) {
    prune();
    const old = current(scope); if (!old && records.size >= maxScopes) throw Error('Action journal scope capacity reached');
    const retired = old ? [...old.retired, ...Object.entries(old.actions).filter(([, entry]) => !entry.queued).map(([key, entry]) => ({ ...entry, roundId: old.roundId, key }))] : [];
    if (retired.length > 20000) throw Error('Pending intention capacity reached');
    const record = { version: 1, game, scope, roundId: crypto.randomUUID(), updatedAt: now(), state: clone(state), meta: clone(meta), actions: {}, retired };
    if (completion !== undefined) record.completion = clone(completion);
    write(record); return clone(record);
  }
  function commit(scope, roundId, state, meta, intentions = [], completion = undefined) {
    const record = current(scope); if (!record || record.roundId !== roundId) throw Error('Obsolete multiplayer round');
    for (const intention of intentions) {
      const value = payload(record, intention.key, intention.payload), old = record.actions[intention.key];
      if (old && JSON.stringify(old.payload) !== JSON.stringify(value)) throw Error('Game action reused with changed reward');
      if (!old) record.actions[intention.key] = { queued: false, createdAt: now(), payload: value };
    }
    record.state = clone(state); record.meta = clone(meta); record.updatedAt = now();
    if (completion !== undefined) {
      if (record.completion && JSON.stringify(record.completion) !== JSON.stringify(completion)) throw Error('Completed game decision changed');
      record.completion = clone(completion);
    }
    write(record); return clone(record);
  }
  // Each pass hands off a bounded, rotating batch. No network call or async gap
  // occurs between the SDK reservation and marking durable ownership here.
  function recover(limit = 25) {
    if (blocked) throw Error('Action journal requires storage recovery');
    const pending = [];
    for (const record of records.values()) {
      for (const [key, entry] of Object.entries(record.actions)) if (!entry.queued) pending.push({ scope: record.scope, key, entry });
      for (const entry of record.retired) pending.push({ scope: record.scope, retired: true, entry });
    }
    if (!pending.length) return 0;
    const selected = Array.from({ length: Math.min(limit, pending.length) }, (_, i) => pending[(cursor + i) % pending.length]); cursor = (cursor + selected.length) % pending.length;
    let queued = 0, firstError; const groups = new Map();
    for (const item of selected) {
      try {
      const p = item.entry.payload;
      const reserved = sdk.reservePlayerReward(p.platform, p.userId, p.username, p.displayName, p.coins, p.game, p.event, p);
      if (!reserved || reserved.payload?.eventId !== p.eventId) throw Error('SDK did not confirm durable intention');
      if (!groups.has(item.scope)) groups.set(item.scope, []);
      groups.get(item.scope).push(item);
      } catch (error) { if (blocked) throw error; firstError ||= error; }
    }
    for (const [scope, items] of groups) {
      try {
        const record = current(scope);
        for (const item of items) {
          if (item.retired) record.retired = record.retired.filter(entry => entry.payload.eventId !== item.entry.payload.eventId);
          else record.actions[item.key].queued = true;
        }
        write(record); queued += items.length;
        for (const item of items) Promise.resolve(sdk.deliverPlayerReward(item.entry.payload.eventId)).catch(() => {});
      } catch (error) { if (blocked) throw error; firstError ||= error; }
    }
    if (firstError) throw firstError;
    return queued;
  }
  function startRecovery(onError = () => {}) { if (!timer) { timer = setInterval(() => { try { recover(); } catch (error) { onError(error); } }, 1000); timer.unref?.(); } }
  function stop() { if (timer) clearInterval(timer); timer = null; }
  function summary() { return { scopes: records.size, pending: [...records.values()].reduce((n, r) => n + r.retired.length + Object.values(r.actions).filter(x => !x.queued).length, 0), blocked }; }
  return { current, start, commit, recover, startRecovery, stop, summary, prune, scopes: () => [...records.keys()] };
}
module.exports = { createGameActionJournal };
