'use strict';
const { createGameActionJournal } = require('./game-action-journal');
const encode = value => JSON.parse(JSON.stringify(value, (_key, item) => {
  const kind = Object.prototype.toString.call(item);
  if (kind === '[object Set]') return { __wtActionCollection: 'Set', entries: [...item] };
  if (kind === '[object Map]') return { __wtActionCollection: 'Map', entries: [...item.entries()] };
  return item;
}));
const decode = value => JSON.parse(JSON.stringify(value), (_key, item) => {
  if (item && Object.keys(item).length === 2 && Array.isArray(item.entries)) {
    if (item.__wtActionCollection === 'Set') return new Set(item.entries);
    if (item.__wtActionCollection === 'Map') return new Map(item.entries);
  }
  return item;
});
function createPlainGameActions({ directory, gameId, sdk, onError = () => {}, journalOptions = {} }) {
  const journal = createGameActionJournal({ directory, game: gameId, sdk, ...journalOptions }), owners = new WeakMap();
  function snapshot(state) {
    const value = encode(state);
    // An asynchronous lookup reservation is not an accepted player guess.
    if (Array.isArray(value.guesses)) value.guesses = value.guesses.filter(guess => !guess._reserved);
    return value;
  }
  function adopt(state, record) { owners.set(state, { scope: record.scope, roundId: record.roundId }); return state; }
  function load(scope) {
    const record = journal.current(scope); if (!record) return null;
    const state = decode(record.state); adopt(state, record); return { state, record };
  }
  function recordFor(state) {
    const owner = owners.get(state); if (!owner) return null;
    const record = journal.current(owner.scope);
    if (!record || record.roundId !== owner.roundId) throw Error('Obsolete game round');
    return record;
  }
  function save(state, scope, meta) {
    const owner = owners.get(state);
    const record = owner ? journal.commit(owner.scope, owner.roundId, snapshot(state), meta) : journal.start(scope, snapshot(state), meta);
    adopt(state, record); return record;
  }
  function recover() { try { return journal.recover(); } catch (error) { onError(error); return 0; } }
  function accept(state, meta, intentions = [], completion) {
    const previous = recordFor(state); if (!previous) throw Error('Game round lacks a durable baseline');
    const reservations = Array.isArray(state.guesses) ? state.guesses.filter(guess => guess._reserved) : [];
    try {
      journal.commit(previous.scope, previous.roundId, snapshot(state), meta, intentions, completion);
    } catch (error) {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, decode(previous.state));
      if (Array.isArray(state.guesses)) state.guesses.push(...reservations);
      throw error;
    }
    recover(); return recordFor(state);
  }
  function transaction(state, scope, meta, mutate) {
    if (!owners.has(state)) save(state, scope, meta);
    const previous = recordFor(state), before = snapshot(state);
    // Keep other in-flight reservation object identities intact on a rejected
    // commit, so their own awaiting callbacks can remove or retry them safely.
    const reservations = Array.isArray(state.guesses) ? state.guesses.filter(guess => guess._reserved) : [];
    let decision;
    try {
      decision = mutate(previous) || {};
      journal.commit(previous.scope, previous.roundId, snapshot(state), decision.meta || meta, decision.intentions || [], decision.completion);
    } catch (error) {
      for (const key of Object.keys(state)) delete state[key];
      Object.assign(state, decode(before));
      if (Array.isArray(state.guesses)) state.guesses.push(...reservations);
      throw error;
    }
    recover(); return decision.result;
  }
  function reward(key, platform, userId, username, displayName, coins, event, extras = {}) {
    if (['bot','system'].includes(String(platform || '').toLowerCase()) || !sdk.isStatsEligible(platform, userId) || coins <= 0) return null;
    return { key, payload: { ...extras, platform: String(platform), userId: String(userId), username: String(username || displayName || 'Anonymous'),
      displayName: String(displayName || username || 'Anonymous'), coins, game: gameId, event } };
  }
  function sendLegacyReward(state, platform, userId, username, displayName, coins, event, extras = {}) {
    if (sdk.isGuestId(userId) || String(platform).toLowerCase() === 'bot') return sdk.rewardPlayer(platform,userId,username,displayName,coins,gameId,event,extras);
    if (!sdk.isStatsEligible(platform,userId) || String(platform).toLowerCase() === 'system' || coins <= 0) return null;
    const record = recordFor(state); if (!record?.actions.win) throw Error('Reward lacks a durably accepted win');
    recover(); return null;
  }
  journal.startRecovery(onError);
  return { journal, load, save, recordFor, accept, transaction, reward, sendLegacyReward, recover };
}
module.exports = { createPlainGameActions };
